//=============================================================================
// VehicleCrew.js
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Vehicle Crew Life v1.0.0 - who is at the wheel, who is resting, and how a crew lives aboard the Starship
 * @author Omni-Lex
 * @version 1.0.0
 *
 * @help VehicleCrew.js
 * ============================================================================
 * A journey is not a cursor sliding over a map: it is four people shut in a
 * cabin for a day and a half, one of them holding the wheel. This plugin is
 * that hour count, and it does two things with it.
 *
 * ---------------------------------------------------------------------------
 * 1. Somebody is driving (Camper / Car / Boat)
 * ---------------------------------------------------------------------------
 * The party leader takes the wheel when the journey starts, and the party HUD
 * writes "(Driving)" next to their name. Only the driver earns the vehicle's
 * specialization XP (Car Driving, RV Driving, Boat Piloting, Sailing...): the
 * three people asleep in the back are not learning to sail.
 *
 * Time at the wheel is tracked per member as STRAIN, and a member's alertness
 * is the party's sleep meter less their own strain. Once the driver's alertness
 * falls under 40% the wheel changes hands to the best-rested member who is over
 * that line; strain is shed again by everyone who is not driving, so a crew of
 * three takes turns across a long haul instead of one person driving for a
 * week. When nobody is fit to relieve the driver, they keep going and the party
 * is told so - stopping the car is the player's call, not the plugin's.
 *
 * The Bike and the Broom have no driver's seat and no rota: the leader at the
 * front of the column steers, and everybody riding behind them can nap. The
 * Starship gets no driver either - it flies itself, which is what the second
 * half of this file is for. Holding the wheel never makes anybody the party
 * leader: the hand-over happens on the spot and the marching order stays put.
 *
 * In ANY vehicle with more than one person aboard, the crew keeps each other
 * company: everybody awake gains Social and Fun (the meter the party's mood is
 * paid in) by the hour, the one steering at half the rate.
 *
 * Sleep, meanwhile, is paid back to whoever is NOT driving: it only starts once
 * the meter is under 40% (nobody naps at 90%), and once it starts it fills all
 * the way to 100% or until the journey ends, whichever comes first.
 *
 * A crew taking that rest is asleep for real: everybody but the driver carries
 * the Sleep state while it lasts, which is what the party HUD and anything else
 * reading states goes by. They are woken when the nap ends on its own (the meter
 * fills), when the party gets out, when the party steps into the vehicle's own
 * cabin - and by a crash, which also keeps them up for the next hour of game
 * time rather than letting them drop straight back off.
 *
 * Note that hunger and sleep are ONE meter for the whole party in this game
 * (TimeDateSystem.js keeps them on $gameSystem), so the rest a crew takes shows
 * up on the shared bar. Strain is what is genuinely personal, and it is why the
 * driver never benefits from a rest they are not taking.
 *
 * ---------------------------------------------------------------------------
 * 2. Living aboard the Starship
 * ---------------------------------------------------------------------------
 * A starship under way is a home. While it moves, the crew is always tending
 * ONE need - a meal, a wash, a conversation, a game, a shift of sleep - picked
 * at random and dropped for another one halfway through as often as not, the way
 * a day aboard actually goes. Tending hunger is the one chore that costs
 * something: the crew eats real food out of the hold, and with an empty hold
 * they go and do something else instead.
 *
 * ---------------------------------------------------------------------------
 * window.VehicleCrew
 * ---------------------------------------------------------------------------
 *   VehicleCrew.driver()          the actor at the wheel, or null
 *   VehicleCrew.driverActorId()   their actor id, or null (what the HUD reads)
 *   VehicleCrew.isDriver(actor)   is this member holding the wheel
 *   VehicleCrew.alertness(actor)  0-100, sleep less that member's wheel strain
 *   VehicleCrew.strainOf(actor)   0-100, time at the wheel since their last rest
 *   VehicleCrew.isAsleep(actor)   is this member napping in the back right now
 *   VehicleCrew.wake(reason)      everybody up ("crash" for a shock, else quiet)
 * ============================================================================
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Tunables
  // ---------------------------------------------------------------------------
  // Which ridden vehicles have a driver's seat at all (the keys VehicleUpgrades
  // .currentRiddenType() returns). The Bike and the Broom carry their rider and
  // nobody else; the Starship flies itself.
  const DRIVEN_TYPES = { camper: true, car: true, boat: true };

  // A member under this alertness is not fit to hold the wheel, and this is also
  // the sleep level at which a resting crew starts making the sleep back.
  const REST_THRESHOLD = 40;

  // Strain climbs while driving and is shed faster than it is earned, so a crew
  // of two can keep swapping indefinitely and a lone driver cannot.
  const STRAIN_PER_HOUR = 25;
  const STRAIN_SHED_PER_HOUR = 33;

  // What the passengers make back per game-hour. World-map travel drains sleep
  // at ~18/hour (TimeDateSystem), so this is a genuine climb rather than a
  // slower fall.
  const REST_SLEEP_PER_HOUR = 36;

  // The nap made real: while the crew is genuinely making sleep back, everybody
  // who is not at the wheel carries the engine's own Sleep state (States.json
  // #10), so the party HUD and everything else that reads states agree that the
  // three people in the back are out cold. State turns do not tick while the
  // player is riding (Game_Player#isNormal is false in a vehicle), so the nap
  // lasts as long as the rest does rather than the state's own 3-5 turns.
  const SLEEP_STATE_ID = 10;

  // A shock keeps a crew awake for a while afterwards. Without this, a crash at
  // 20% sleep would put everybody straight back under on the very next step,
  // since that is exactly the meter reading that opens the rest latch.
  const WAKE_LOCKOUT_MINUTES = 60;

  // A fast travel, a night's sleep or a menu can move the clock hours at a time
  // between two steps. Nothing here should pay out a whole night in one tick.
  const MAX_TICK_MINUTES = 60;

  // Living aboard: one chore is tended every this many game-minutes.
  const CHORE_TICK_MINUTES = 10;
  const CHORE_FILL_PER_TICK = 4;      // points of the tended need, per tick
  const CHORE_SWITCH_CHANCE = 0.2;    // ...and how often the crew drifts to another
  // A meal is not taken over a nearly full stomach, and one chore is one meal.
  const MEAL_HUNGER_CEILING = 85;

  const NEED_KEYS = ['hunger', 'sleep', 'hygiene', 'social', 'leisure'];

  // Company on the road, per game-hour, for everybody awake aboard any
  // vehicle with somebody else in it; the one steering gets this share of it.
  const COMPANY_SOCIAL_PER_HOUR = 12;
  const COMPANY_FUN_PER_HOUR = 8;
  const COMPANY_DRIVER_SHARE = 0.5;

  // ---------------------------------------------------------------------------
  // Small readers
  // ---------------------------------------------------------------------------
  function gameMinutes() {
    const tds = window.TimeDateSystem;
    if (tds && typeof tds.getGameTimeMinutes === 'function') return tds.getGameTimeMinutes();
    return (typeof $gameVariables !== 'undefined' && $gameVariables)
      ? Number($gameVariables.value(114)) || 0 : 0;
  }

  function maxSleep() {
    return (window.TimeDateSystem && window.TimeDateSystem.maxSleep) || 100;
  }

  // Which vehicle the player is riding, in VehicleUpgrades' vocabulary.
  function ridingType() {
    const up = window.VehicleUpgrades;
    if (up && typeof up.currentRiddenType === 'function') return up.currentRiddenType();
    return null;
  }

  function members() {
    if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.members) return [];
    return $gameParty.members().filter(a => a && (!a.isDead || !a.isDead()));
  }

  function toast(text, severity, key) {
    if (!text || !window.ParchmentToast) return;
    try {
      window.ParchmentToast.show(text, { severity: severity || 'info', key: key || null });
    } catch (e) { /* a popup never stops a journey */ }
  }

  // ---------------------------------------------------------------------------
  // Saved state
  // ---------------------------------------------------------------------------
  // driverId : who is holding the wheel right now
  // strain   : actorId -> 0..100, hours at the wheel since that member last rested
  // resting  : the sleep-recovery latch (opens under 40%, closes at 100%)
  // asleep   : actor ids this plugin put the Sleep state on
  // wokeAt   : the clock reading a shock last woke the crew at
  // chore    : the need the Starship crew is tending, and when it is next tended
  // lastAt   : the clock reading the last tick was paced from
  function state() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return null;
    let s = $gameSystem._vehicleCrew;
    if (!s) {
      s = $gameSystem._vehicleCrew = {
        driverId: null, strain: {}, resting: false, asleep: [], wokeAt: null,
        chore: null, lastAt: null, warnedTired: false, warnedNoFood: false,
      };
    }
    if (!s.strain) s.strain = {};
    if (!s.asleep) s.asleep = [];
    return s;
  }

  function strainOf(actor) {
    const s = state();
    if (!s || !actor || !actor.actorId) return 0;
    return Number(s.strain[actor.actorId()]) || 0;
  }

  function setStrain(actor, value) {
    const s = state();
    if (!s || !actor || !actor.actorId) return;
    s.strain[actor.actorId()] = Math.max(0, Math.min(100, value));
  }

  // A member's fitness to drive: the party's sleep meter, less the hours this
  // particular member has spent at the wheel. Sleep is shared in this game
  // (TimeDateSystem keeps one meter for everybody), so strain is the whole of
  // what separates the driver from the people dozing behind them.
  function alertness(actor) {
    if (!actor) return 0;
    const sleep = actor.sleepPercent ? actor.sleepPercent() : 100;
    return Math.max(0, Math.min(100, sleep - strainOf(actor)));
  }

  function driver() {
    const s = state();
    if (!s || s.driverId == null) return null;
    return members().find(a => a.actorId() === s.driverId) || null;
  }

  // Who should be driving: the leader whenever they are fit, otherwise the
  // best-rested member above the line. Null means nobody in this party is fit,
  // which is a fact the caller has to decide what to do about.
  function fittestDriver() {
    const crew = members();
    if (!crew.length) return null;
    const leader = ($gameParty && $gameParty.leader) ? $gameParty.leader() : null;
    if (leader && crew.indexOf(leader) >= 0 && alertness(leader) >= REST_THRESHOLD) return leader;
    let best = null;
    for (const actor of crew) {
      if (alertness(actor) < REST_THRESHOLD) continue;
      if (!best || alertness(actor) > alertness(best)) best = actor;
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // The rota
  // ---------------------------------------------------------------------------
  // Hands the wheel to whoever is fit for it, announcing every change but the
  // first of a journey (taking the driver's seat is not news; being relieved
  // halfway across a continent is).
  function assignWheel(announce) {
    const s = state();
    if (!s) return null;
    const current = driver();
    if (current && alertness(current) >= REST_THRESHOLD) {
      s.warnedTired = false;
      return current;
    }
    let next = fittestDriver();
    if (!next) {
      // Everybody is spent. The journey continues - a vehicle in motion always
      // has somebody at the wheel - and the party is simply told that the person
      // holding it should not be. Whoever is already driving keeps driving; from
      // a cold start it falls to the leader, then to the least spent member.
      const crew = members();
      next = current
        || (($gameParty && $gameParty.leader && crew.indexOf($gameParty.leader()) >= 0)
          ? $gameParty.leader()
          : crew.reduce((best, a) => (!best || alertness(a) > alertness(best) ? a : best), null));
      if (!next) return null;
      s.driverId = next.actorId();
      if (!s.warnedTired) {
        s.warnedTired = true;
        toast(T('VehicleCrew.allTired', { name: next.name() }), 'warning', 'vehiclecrew-tired');
      }
      return next;
    }
    s.warnedTired = false;
    if (current === next) return current;
    s.driverId = next.actorId();
    if (announce && current) {
      toast(T('VehicleCrew.tookWheel', { name: next.name() }), 'info', 'vehiclecrew-wheel');
      // ...and the party has something to say about it, in their own voices
      // (NPC/PartyBanter.js). The toast is the fact; this is the cabin.
      if (window.PartyBanter && window.PartyBanter.react) {
        window.PartyBanter.react('handover', { driver: next.name(), tired: current.name() });
      }
    }
    return next;
  }

  // ---------------------------------------------------------------------------
  // Out cold in the back
  // ---------------------------------------------------------------------------
  // The ids this plugin put under. Waking the crew only ever lifts the nap this
  // plugin laid on: a Sleep state from anywhere else (a spell, an event) is not
  // ours to take off.
  function napping() {
    const s = state();
    return s ? s.asleep : [];
  }

  function setAsleep(actor, asleep) {
    if (!actor || !actor.actorId || !actor.addState) return;
    const list = napping();
    const id = actor.actorId();
    const index = list.indexOf(id);
    if (asleep) {
      if (index < 0) list.push(id);
      if (!actor.isStateAffected(SLEEP_STATE_ID)) actor.addState(SLEEP_STATE_ID);
      return;
    }
    if (index < 0) return;
    list.splice(index, 1);
    if (actor.isStateAffected(SLEEP_STATE_ID)) actor.removeState(SLEEP_STATE_ID);
  }

  // Who is out cold right now: everybody the rest latch covers, less whoever is
  // holding the wheel. Run every tick, so a reload, a party change and a
  // hand-over at the wheel all settle to the same answer.
  function syncSleep(crew, atWheel) {
    const s = state();
    const out = !!(s && s.resting);
    for (const actor of crew) setAsleep(actor, out && actor !== atWheel);
  }

  // Everybody up, and the latch shut so the next tick does not put them back
  // under. A reason means it was a shock rather than the end of the journey: the
  // party is told about it, and nobody drifts off again for the next hour of
  // game time. Returns whether anyone was actually asleep to wake.
  function wake(reason) {
    const s = state();
    const list = napping();
    const woke = list.length > 0;
    for (const actor of members()) {
      if (list.indexOf(actor.actorId()) < 0) continue;
      if (actor.isStateAffected(SLEEP_STATE_ID)) actor.removeState(SLEEP_STATE_ID);
    }
    list.length = 0;
    if (s) {
      s.resting = false;
      if (reason) s.wokeAt = gameMinutes();
    }
    if (woke && reason) {
      toast(T('VehicleCrew.woke.' + reason), 'warning', 'vehiclecrew-woke');
    }
    return woke;
  }

  // A clock that has gone backwards (an older save) simply lets the lockout lapse.
  function inWakeLockout() {
    const s = state();
    if (!s || s.wokeAt == null) return false;
    const since = gameMinutes() - s.wokeAt;
    return since >= 0 && since < WAKE_LOCKOUT_MINUTES;
  }

  // Sleep paid back to everyone who is not driving. Two rules from the brief:
  // it only begins once the meter is under 40% (a rested crew does not nap), and
  // once begun it runs all the way to full or to the end of the journey. There
  // is nothing to pay when the driver is the only person aboard.
  function payRest(crew, atWheel, minutes) {
    const s = state();
    const resters = crew.filter(a => a !== atWheel);
    if (!s || !resters.length || minutes <= 0) return;
    const max = maxSleep();
    const sleeper = resters.find(a => typeof a.addSleep === 'function');
    if (!sleeper) return;
    const pct = sleeper.sleepPercent ? sleeper.sleepPercent() : 100;
    if (!s.resting && pct < REST_THRESHOLD && !inWakeLockout()) s.resting = true;
    if (!s.resting) return;
    if (pct >= 100) { s.resting = false; return; }
    const gain = (REST_SLEEP_PER_HOUR / 60) * minutes * (max / 100);
    sleeper.addSleep(gain);
    // Mirror it onto the society profiles of the members who slept, the way a
    // meal is mirrored (ItemSystemUtils.applyNeedRestores), so the simulation
    // and the panels that read a companion's profile see the rest too.
    for (const actor of resters) {
      const profile = window.NPCSocietyRegistry && window.NPCSocietyRegistry.getProfile
        ? window.NPCSocietyRegistry.getProfile(actor.name()) : null;
      if (profile && typeof profile.sleep === 'number') {
        profile.sleep = Math.max(0, Math.min(100, profile.sleep + gain * (100 / max)));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Living aboard the Starship
  // ---------------------------------------------------------------------------
  // TimeDateSystem's own recovery formula for a food item, the one AutoIdle
  // eats by: calories, protein and fat.
  function foodValue(item) {
    const read = (key) => {
      const m = String((item && item.note) || '').match(new RegExp('<' + key + ':\\s*(\\d+)>', 'i'));
      return m ? Number(m[1]) : 0;
    };
    return Math.round(read('calories') * 0.10 + read('protein') * 2.00 + read('fat') * 1.50);
  }

  // The smallest thing in the hold that covers the gap, else the biggest thing
  // there is: a banquet is not spent on a snack's worth of hunger.
  function pickMeal(gap) {
    if (typeof $gameParty === 'undefined' || !$gameParty || !$gameParty.items) return null;
    const utils = window.ItemSystemUtils;
    let best = null;
    let bestScore = Infinity;
    for (const item of $gameParty.items()) {
      if (!item || !item.note) continue;
      const isFood = utils && utils.isFoodItem
        ? utils.isFoodItem(item) : /<category:\s*Food>/i.test(item.note);
      if (!isFood) continue;
      const value = foodValue(item);
      if (value <= 0) continue;
      const score = value >= gap ? value : 1000000 - value;
      if (score < bestScore) { best = item; bestScore = score; }
    }
    return best;
  }

  // One meal out of the hold. Returns false when there is nothing to eat, which
  // is what sends the crew off to do something else.
  function eatAboard(crew) {
    const eater = crew[Math.floor(Math.random() * crew.length)];
    if (!eater || typeof eater.addHunger !== 'function') return false;
    const max = (window.TimeDateSystem && window.TimeDateSystem.maxHunger) || 100;
    const gap = Math.max(0, max - (eater.hunger ? eater.hunger() : max));
    const meal = pickMeal(gap);
    if (!meal) return false;
    const gain = foodValue(meal);
    $gameParty.loseItem(meal, 1);
    eater.addHunger(gain);
    const utils = window.ItemSystemUtils;
    if (utils && utils.applyNeedRestores) {
      try { utils.applyNeedRestores(eater, meal); } catch (e) { /* the meal still counted */ }
    }
    toast(T('VehicleCrew.aboard.meal', { name: eater.name(), item: meal.name }),
      'good', 'vehiclecrew-meal');
    return true;
  }

  // Needs the crew could usefully spend an hour on: anything not already full.
  function tendableNeeds() {
    const PN = window.PartyNeeds;
    if (!PN || !PN.partyMedian) return [];
    const median = PN.partyMedian();
    return NEED_KEYS.filter(key => {
      const value = median[key];
      if (value === null || value === undefined) return false;
      return key === 'hunger' ? value < MEAL_HUNGER_CEILING : value < 100;
    });
  }

  function startChore(pool, avoid) {
    const choices = pool.filter(key => key !== avoid);
    const from = choices.length ? choices : pool;
    if (!from.length) return null;
    const need = from[Math.floor(Math.random() * from.length)];
    toast(T('VehicleCrew.aboard.' + need), 'info', 'vehiclecrew-chore-' + need);
    return need;
  }

  // Pay one tick into the need being tended. Hunger is the one that costs
  // something: with an empty hold the chore is abandoned and another one starts.
  function tendChore(need, crew) {
    if (need === 'hunger') return eatAboard(crew);
    if (need === 'sleep') {
      const max = maxSleep();
      const sleeper = crew.find(a => typeof a.addSleep === 'function');
      if (!sleeper) return false;
      if ((sleeper.sleepPercent ? sleeper.sleepPercent() : 100) >= 100) return false;
      sleeper.addSleep(CHORE_FILL_PER_TICK * (max / 100));
      return true;
    }
    const PN = window.PartyNeeds;
    if (!PN || !PN.addNeedToAll) return false;
    PN.addNeedToAll(need, CHORE_FILL_PER_TICK);
    return true;
  }

  function updateAboard(minutes) {
    const s = state();
    if (!s || minutes <= 0) return;
    const crew = members();
    if (!crew.length) return;
    const now = gameMinutes();
    if (s.chore && s.chore.nextAt != null && now < s.chore.nextAt) return;

    const pool = tendableNeeds();
    if (!pool.length) { s.chore = null; return; }

    let need = s.chore && pool.indexOf(s.chore.need) >= 0 ? s.chore.need : null;
    // Half a day aboard is not half a day of one thing: the crew drifts off a
    // chore as often as it finishes one.
    if (!need || Math.random() < CHORE_SWITCH_CHANCE) {
      need = startChore(pool, need);
      if (!need) { s.chore = null; return; }
    }

    if (!tendChore(need, crew)) {
      // Nothing came of it (an empty hold, a full meter): take it off the list
      // and pick something else, next tick at the latest.
      if (need === 'hunger' && !s.warnedNoFood) {
        s.warnedNoFood = true;
        toast(T('VehicleCrew.aboard.noFood'), 'warning', 'vehiclecrew-nofood');
      }
      const rest = pool.filter(key => key !== need);
      need = rest.length ? startChore(rest, null) : null;
      if (need) tendChore(need, crew);
    } else if (need === 'hunger') {
      s.warnedNoFood = false;
    }

    s.chore = need ? { need, nextAt: now + CHORE_TICK_MINUTES } : null;
  }

  // ---------------------------------------------------------------------------
  // The tick - one player step
  // ---------------------------------------------------------------------------
  function update() {
    const s = state();
    if (!s) return;
    const now = gameMinutes();
    const elapsed = s.lastAt == null ? 0 : Math.min(MAX_TICK_MINUTES, Math.max(0, now - s.lastAt));
    s.lastAt = now;

    const type = ridingType();
    const crew = members();

    // Off the road: everybody sheds strain, and the journey's latches are shut
    // so the next one starts clean.
    if (!type) {
      if (s.driverId != null || napping().length) release();
      for (const actor of crew) setStrain(actor, strainOf(actor) - (STRAIN_SHED_PER_HOUR / 60) * elapsed);
      s.chore = null;
      return;
    }

    // Who is steering. A car, a camper or a boat has a seat for it and a rota
    // to fill it; a bike or a broom is steered by whoever rides at the front
    // of the column (the leader); a starship flies itself. The wheel is never
    // the party's lead: handing it over moves nobody in the marching order.
    let atWheel = null;
    if (DRIVEN_TYPES[type]) {
      atWheel = assignWheel(true);
      if (!atWheel) return;
      s.driverId = atWheel.actorId();
      for (const actor of crew) {
        const delta = actor === atWheel ? STRAIN_PER_HOUR : -STRAIN_SHED_PER_HOUR;
        setStrain(actor, strainOf(actor) + (delta / 60) * elapsed);
      }
    } else {
      s.driverId = null;
      for (const actor of crew) setStrain(actor, strainOf(actor) - (STRAIN_SHED_PER_HOUR / 60) * elapsed);
      if (type !== 'airship' && $gameParty && $gameParty.leader) atWheel = $gameParty.leader();
    }

    payRest(crew, atWheel, elapsed);
    syncSleep(crew, atWheel);
    payCompany(crew, atWheel, elapsed);
    if (type === 'airship') updateAboard(elapsed);
    else s.chore = null;
  }

  // Company on the road, in anything that moves: the people riding together
  // talk (Social) and pass the time (Fun, which is also what the party's mood
  // is paid in, see TimeDateSystem's BattleMood). Whoever is steering keeps
  // half an ear on the conversation; whoever is asleep in the back gets none
  // of it. Nobody has company on their own.
  function payCompany(crew, atWheel, minutes) {
    if (!crew || crew.length < 2 || minutes <= 0) return;
    const out = napping();
    const awake = crew.filter(a => out.indexOf(a.actorId()) < 0);
    if (awake.length < 2) return;
    const hours = minutes / 60;
    for (const actor of awake) {
      const share = actor === atWheel ? COMPANY_DRIVER_SHARE : 1;
      if (actor.addSocial) actor.addSocial(COMPANY_SOCIAL_PER_HOUR * hours * share);
      if (actor.addLeisure) actor.addLeisure(COMPANY_FUN_PER_HOUR * hours * share);
    }
  }

  // The wheel is let go of: the driver's seat empties and the rest the party was
  // taking ends, which is what "until you stop driving" means. Ending the rest
  // ends the nap with it - nobody is carried out of the car still asleep.
  function release() {
    const s = state();
    if (!s) return;
    wake();
    s.driverId = null;
    s.resting = false;
    s.warnedTired = false;
  }

  // ---------------------------------------------------------------------------
  // window.VehicleCrew
  // ---------------------------------------------------------------------------
  window.VehicleCrew = {
    REST_THRESHOLD,
    STRAIN_PER_HOUR,
    STRAIN_SHED_PER_HOUR,
    REST_SLEEP_PER_HOUR,
    driver,
    driverActorId() {
      const s = state();
      return s ? s.driverId : null;
    },
    isDriver(actor) {
      const s = state();
      return !!(s && actor && actor.actorId && s.driverId === actor.actorId());
    },
    // True for the vehicles that have a driver's seat at all, so a caller can
    // ask "should this journey name a driver" without knowing the roster.
    hasWheel(type) {
      return !!DRIVEN_TYPES[type != null ? type : ridingType()];
    },
    alertness,
    strainOf,
    // The engine state a resting passenger carries, and the two questions the
    // rest of the game asks about it.
    SLEEP_STATE_ID,
    isAsleep(actor) {
      return !!(actor && actor.actorId && napping().indexOf(actor.actorId()) >= 0);
    },
    // Everybody up. Pass a reason ("crash") for a shock: it toasts and keeps the
    // crew awake for an hour afterwards. Called with nothing, it is the quiet end
    // of a nap (getting out, stepping into the cabin).
    wake,
    // Only the member at the wheel is learning to drive; if nobody is (the Bike,
    // the Broom, the Starship), the award falls back to the party's usual split.
    xpOptions() {
      if (!DRIVEN_TYPES[ridingType()]) return undefined;
      const at = driver();
      return at ? { actor: at, soloist: true } : undefined;
    },
    update,
    release,
    state,
    // Testing seams.
    _tendableNeeds: tendableNeeds,
    _foodValue: foodValue,
    _eatAboard: eatAboard,
    _updateAboard: updateAboard,
  };

  // ---------------------------------------------------------------------------
  // Engine hooks
  // ---------------------------------------------------------------------------
  if (typeof Game_Player !== 'undefined') {
    const _Game_Player_increaseSteps_VC = Game_Player.prototype.increaseSteps;
    Game_Player.prototype.increaseSteps = function () {
      _Game_Player_increaseSteps_VC.call(this);
      try { update(); } catch (e) { console.error('VehicleCrew: ' + e.message); }
    };

    // Stepping into the cabin is stepping over somebody's bunk. The nap ends on
    // arrival rather than on the first step taken inside, and this catches every
    // way in - the action menu, the fast-travel menu, a plugin command.
    const _Game_Player_performTransfer_VC = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function () {
      _Game_Player_performTransfer_VC.call(this);
      try {
        const vs = window.MergedVehicleSystem;
        if (vs && vs.isOnVehicleInteriorMap && vs.isOnVehicleInteriorMap()) wake();
      } catch (e) { /* the party still got in */ }
    };
  }

  // Getting out ends the journey, and with it the shift and the nap.
  if (typeof Game_Vehicle !== 'undefined') {
    const _Game_Vehicle_getOff_VC = Game_Vehicle.prototype.getOff;
    Game_Vehicle.prototype.getOff = function () {
      const result = _Game_Vehicle_getOff_VC.call(this);
      try { release(); } catch (e) { /* the party still got out */ }
      return result;
    };

    // Boarding hands the wheel to the leader (or to whoever is fit for it) so the
    // HUD names a driver from the first tile rather than from the first step.
    const _Game_Vehicle_getOn_VC = Game_Vehicle.prototype.getOn;
    Game_Vehicle.prototype.getOn = function () {
      const result = _Game_Vehicle_getOn_VC.call(this);
      try {
        const s = state();
        if (s) {
          s.lastAt = gameMinutes();
          s.chore = null;
          if (DRIVEN_TYPES[ridingType()]) assignWheel(false);
        }
      } catch (e) { /* the party still got in */ }
      return result;
    };
  }
})();
