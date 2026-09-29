/*:
 * @target MZ
 * @plugindesc NPC Simulation: addictions and the casino
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Gear
 * @help
 * ============================================================================
 * NPCSim_Addictions, part of the NPCSimulationCore family
 * ============================================================================
 * Owns Addictions (SECTION 11b5b): cravings, fixes, withdrawal and the
 * gamblers' venues.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Gear.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    Children, economyRng, fmtMoney, MinigamePlay, MINIGAMES, MiniRng, nameHash, Specs, StoryLogger,
    ThoughtGenerator,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11b5b, ADDICTIONS AND THE CASINO (NPCSim.Addictions)
  // ============================================================================
  // The five dependencies of window.AddictionSystem (TimeDateSystem.js), lived
  // by NPCs. The party's own meters stay on their actors; this is the
  // profile's side of the same traits.
  //   craving    profile._crave = { min, v: { key: 0..100 }, w: key|null }:
  //              one meter per addiction, climbing against the WORLD CLOCK
  //              (so an hour away from the screen is an hour of wanting) at
  //              the party's own pace, full in about twelve hours for
  //              nicotine and thirty for gambling. AddictionSystem
  //              .profileCravings reads this store, so the craving and
  //              withdrawal thoughts (ConvThoughts) follow the real meter.
  //   carrying   1-2 fixes per addiction in profile.itemIds, dealt once (the
  //              `_addictV` stamp) off the items that feed that craving
  //              (<Addiction: key N>, <caffeine: N>), priced by wealth tier.
  //   buying     BuyManager prefers a fix when a craving is past CRAVE_BUY_AT;
  //              off the map a craving past CRAVE_USE_AT with nothing in hand
  //              buys one on a shopping or leisure hour.
  //   using      a craving past CRAVE_USE_AT is fed from the hand: the item
  //              goes, the meter drops by its dose, it is logged and thought.
  //   withdrawal a meter at 100 with nothing to feed it: leisure and social
  //              are held down (capped, never drained below a floor) until
  //              every meter is back under WITHDRAWAL_OFF.
  //   gambling   a gambler's leisure hours are spent on a map that employs a
  //              croupier (MapJobs, job 150), at its betting games, rounds of
  //              MinigamePlay with raised stakes until the craving is fed or
  //              the pocket runs low. Off the map the round is played there.
  // Children are never addicted and beasts never either (NPCCreature): their
  // store holds no meter at all, so no panel and no thought shows one.
  const ADDICT_V = 1;
  // i18n-ignore-start: addiction ids, item tags, need ids and venue name keywords
  const ADDICTION_FALLBACK = [
    { key: "nicotine", traitId: 102, rate: 0.45 },
    { key: "caffeine", traitId: 101, rate: 0.35 },
    { key: "narcotic", traitId: 104, rate: 0.28 },
    { key: "alcohol",  traitId: 22,  rate: 0.22 },
    { key: "gambling", traitId: 103, rate: 0.18 },
  ];
  const ADDICTION_TAG = /<addiction:\s*([^>]+)>/gi;
  const CAFFEINE_TAG = /<caffeine:\s*(\d+)>/i;
  const FIX_ALL = "all";
  const GAMBLING = "gambling";
  const CAFFEINE = "caffeine";
  const NARCOTIC = "narcotic";
  const FIX_HOURS = new Set(["shopping", "leisure"]);
  const LEISURE_NEED = "leisure";
  const GAMBLING_MOMENT = "gamble";
  // The betting games a gambler plays (MINIGAMES entries with a stake).
  const OFFSCREEN_BET_GAMES = ["slots", "horserace", "tournament"];
  // The card table takes no stake of its own but is a casino game all the
  // same: a gambler sits at it and it feeds the want.
  const CARD_TABLE_GAME = "cards";
  // A map whose name says it is somewhere to play, before anybody has seen
  // its events.
  const VENUE_NAME_RE = /casino|bowling|arcade|billiard|snooker|betting|bookmak|race ?track|game ?room/i;
  // i18n-ignore-end
  const CROUPIER_JOB_ID = 150;
  const ARCADE_JOB_ID = 151;
  // Hours to a full meter at rate 1 is this over the rate: 12 h for nicotine.
  const CRAVE_HOURS_X_RATE = 12 * 0.45;
  const CRAVE_USE_AT = 70;
  const CRAVE_BUY_AT = 50;
  const CRAVE_WITHDRAWAL_ON = 100;
  const CRAVE_WITHDRAWAL_OFF = 80;
  const CRAVE_MAX_STEP_MIN = 1440;
  const WITHDRAWAL_LEISURE_CAP = 30;
  const WITHDRAWAL_SOCIAL_CAP = 60;
  // A gambler stays at the tables while the craving is above this.
  const GAMBLE_UNTIL = 25;
  // Minutes between two rounds for a gambler who is still wanting.
  const GAMBLER_COOLDOWN_MIN = 5;
  // How much a round feeds the want: a win feeds it, a loss makes them chase.
  const ROUND_RELIEF = { won: 100, draw: 60, lost: 35, played: 20 };
  const FIX_BUY_COOLDOWN_MIN = 60;
  const HAND_FIX_MIN = 1;
  const HAND_FIX_MAX = 2;
  // The dearest single fix each wealth tier carries about.
  const HAND_FIX_PRICE = [400, 1200, 3000, 6000, 50000];
  // One leisure hour in VENUE_EVERY goes to a map with games, when the town has one.
  const VENUE_EVERY = 3;
  // Fixes handed over by somebody else deepen a habit a step each, to a cap;
  // an intervention halves the climb and eases the want there and then.
  const ENABLE_DEPTH_STEP = 0.1;
  const ENABLE_DEPTH_MAX = 1.6;
  const INTERVENE_SLOW = 0.5;
  const INTERVENE_EASE = 30;

  let _fixIndex = null;
  const _casinoMapsCache = {};
  const _venueMapsCache = {};
  const Addictions = {
    ADDICT_V,
    CRAVE_USE_AT,
    CRAVE_BUY_AT,
    CROUPIER_JOB_ID,
    ENABLE_DEPTH_STEP,
    ENABLE_DEPTH_MAX,
    INTERVENE_SLOW,
    INTERVENE_EASE,
    GAMBLE_UNTIL,
    GAMBLER_COOLDOWN_MIN,

    specs() {
      const list = window.AddictionSystem?.LIST;
      return Array.isArray(list) && list.length ? list : ADDICTION_FALLBACK;
    },

    // What an item feeds, [{ key, amount }]: its <Addiction:> tags, and a
    // caffeinated one the caffeine craving by however much it holds.
    _parseRelief(item) {
      const out = [];
      const note = String(item?.note || "");
      const keys = this.specs().map(s => s.key);
      ADDICTION_TAG.lastIndex = 0;
      let m;
      while ((m = ADDICTION_TAG.exec(note)) !== null) {
        for (const part of m[1].split(",")) {
          const t = part.trim().match(/([a-zA-Z]+)\s*[:= ]?\s*(\d+)?/);
          if (!t) continue;
          const key = t[1].toLowerCase();
          if (key !== FIX_ALL && !keys.includes(key)) continue;
          out.push({ key, amount: t[2] === undefined ? 100 : Math.max(1, Math.min(100, parseInt(t[2], 10))) });
        }
      }
      if (!out.some(r => r.key === CAFFEINE || r.key === FIX_ALL)) {
        const c = note.match(CAFFEINE_TAG);
        if (c && Number(c[1]) > 0) out.push({ key: CAFFEINE, amount: Math.max(1, Math.min(100, Number(c[1]))) });
      }
      return out;
    },

    // Every item that feeds anything, read once per $dataItems.
    _index() {
      const items = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems : [];
      if (_fixIndex && _fixIndex.items === items && _fixIndex.len === items.length) return _fixIndex;
      const byId = new Map();
      const byKey = {};
      const ok = window.NPCSocietyGear?.isSelectable;
      for (const it of items) {
        if (!it || !it.note) continue;
        const relief = this._parseRelief(it);
        if (!relief.length) continue;
        byId.set(it.id, relief);
        if ((it.price || 0) <= 0 || (ok && !ok(it))) continue;
        for (const r of relief) {
          if (r.key === FIX_ALL) continue;
          (byKey[r.key] = byKey[r.key] || []).push(it);
        }
      }
      for (const k of Object.keys(byKey)) byKey[k].sort((a, b) => (a.price || 0) - (b.price || 0) || a.id - b.id);
      _fixIndex = { items, len: items.length, byId, byKey };
      return _fixIndex;
    },

    reliefOf(item) {
      if (!item) return [];
      return this._index().byId.get(item.id) || [];
    },

    // How much this item feeds `key`, 0 when it does not.
    feeds(item, key) {
      let best = 0;
      for (const r of this.reliefOf(item)) {
        if (r.key === key) best = Math.max(best, r.amount);
        else if (r.key === FIX_ALL) best = Math.max(best, Math.round(r.amount * 0.8));
      }
      return best;
    },

    // Something a child may not have: anything habit-forming but coffee.
    isAddictive(item) {
      return this.reliefOf(item).some(r => r.key !== CAFFEINE);
    },

    _traitKeys(profile) {
      const ids = profile?.traitIds;
      if (!Array.isArray(ids) || !ids.length) return [];
      const out = [];
      for (const s of this.specs()) if (ids.includes(s.traitId)) out.push(s.key);
      return out;
    },

    _isPartyName(name) {
      if (!name) return false;
      const members = $gameParty?.members?.() || [];
      return members.some(a => a && typeof a.name === "function" && a.name() === name);
    },

    // The addictions this person lives with: none for a child, a beast, or a
    // traveller of the party (whose meters are their actor's).
    keysFor(profile, name) {
      const keys = this._traitKeys(profile);
      if (!keys.length) return keys;
      const n = name || profile?._eventName;
      if (Specs.isNonSentient(profile, n) || Children.isMinor(profile, n) || this._isPartyName(n)) return [];
      return keys;
    },

    isGambler(profile, name) {
      return this.keysFor(profile, name).includes(GAMBLING);
    },

    // The diet-style filter for things bought and dealt: a child takes
    // nothing habit-forming, and nobody who is not hooked on narcotics buys
    // them. Anything that feeds nothing is always allowed.
    allows(profile, item, name) {
      if (!item) return false;
      const relief = this.reliefOf(item);
      if (!relief.length) return true;
      const n = name || profile?._eventName;
      if (Children.isMinor(profile, n) && relief.some(r => r.key !== CAFFEINE)) return false;
      if (relief.some(r => r.key === NARCOTIC) && !this._traitKeys(profile).includes(NARCOTIC)) return false;
      return true;
    },

    _now() {
      return $gameVariables?.value(114) ?? 0;
    },

    _perMinute(key) {
      const spec = this.specs().find(s => s.key === key);
      const rate = Math.max(0.01, Number(spec?.rate) || 0.2);
      return 100 / ((CRAVE_HOURS_X_RATE / rate) * 60);
    },

    // The store, advanced to `now`. A person with none of the traits gets
    // nothing written; one with the trait who may not be addicted (a child,
    // a beast) gets an empty store, which is what tells AddictionSystem to
    // show them no craving at all.
    state(profile, name, now) {
      if (!profile) return null;
      const traitKeys = this._traitKeys(profile);
      if (!traitKeys.length) {
        if (profile._crave) delete profile._crave;
        return null;
      }
      const t = now ?? this._now();
      const keys = this.keysFor(profile, name);
      let st = profile._crave;
      if (!st || typeof st !== "object" || !st.v) {
        st = profile._crave = { min: t, v: {}, w: null };
      }
      // A meter per addiction they have now; a child grown up starts theirs,
      // somewhere along the cycle so a town is not all wanting at once.
      for (const key of keys) {
        if (typeof st.v[key] !== "number") {
          st.v[key] = (nameHash(`${name || profile._eventName || "npc"}_crave_${key}`) >>> 0) % 60;
        }
      }
      for (const key of Object.keys(st.v)) if (!keys.includes(key)) delete st.v[key];
      if (!keys.length) st.w = null;
      const elapsed = Math.max(0, Math.min(CRAVE_MAX_STEP_MIN, t - (Number(st.min) || t)));
      st.min = t;
      if (elapsed > 0) {
        for (const key of keys) st.v[key] = Math.min(100, st.v[key] + elapsed * this._perMinute(key) * this.rateFactor(profile, key, t));
      }
      return st;
    },

    // How fast one habit climbs for this person, on top of its own rate: every
    // fix somebody else hands them deepens it (enable), and a talk that got
    // through slows it down for weeks (intervene, the Empathize panel's Help).
    rateFactor(profile, key, now) {
      const st = profile?._crave;
      const depth = Number(st?.d?.[key]) || 1;
      const until = Number(st?.i?.[key]) || 0;
      return depth * (until > (now ?? this._now()) ? INTERVENE_SLOW : 1);
    },

    depthOf(profile, key) {
      return Number(profile?._crave?.d?.[key]) || 1;
    },

    isIntervened(profile, key, now) {
      return (Number(profile?._crave?.i?.[key]) || 0) > (now ?? this._now());
    },

    // A fix handed over by somebody else: the habit climbs a little faster
    // from now on, and any promise to cut down is broken. Answers the depth.
    enable(profile, key) {
      const st = profile?._crave;
      if (!st?.v || typeof st.v[key] !== "number") return 1;
      st.d = st.d || {};
      st.d[key] = Math.min(ENABLE_DEPTH_MAX, (Number(st.d[key]) || 1) + ENABLE_DEPTH_STEP);
      if (st.i) delete st.i[key];
      return st.d[key];
    },

    // Talked round: the craving builds at INTERVENE_SLOW until `untilMin`, and
    // the want eases now, which is what lifts a withdrawal (see _withdrawal).
    intervene(profile, key, untilMin) {
      const st = profile?._crave;
      if (!st?.v || typeof st.v[key] !== "number") return false;
      st.i = st.i || {};
      st.i[key] = Number(untilMin) || this._now();
      this.relieve(profile, key, INTERVENE_EASE);
      if (st.d?.[key] > 1) st.d[key] = Math.max(1, st.d[key] - ENABLE_DEPTH_STEP);
      return true;
    },

    craving(profile, key) {
      const v = profile?._crave?.v?.[key];
      return typeof v === "number" ? v : null;
    },

    setCraving(profile, key, value) {
      const st = profile?._crave;
      if (!st?.v || typeof st.v[key] !== "number") return false;
      st.v[key] = Math.max(0, Math.min(100, Number(value) || 0));
      return true;
    },

    relieve(profile, key, amount) {
      const cur = this.craving(profile, key);
      if (cur === null) return false;
      this.setCraving(profile, key, cur - (amount ?? 100));
      return true;
    },

    worst(profile) {
      const v = profile?._crave?.v;
      if (!v) return null;
      let out = null;
      for (const key of Object.keys(v)) if (!out || v[key] > out.value) out = { key, value: v[key] };
      return out;
    },

    label(key) {
      return T(`NPCSim.addiction.label.${key}`);
    },

    // The carried items that feed `key`, the strongest dose first.
    fixesInHand(profile, key) {
      const items = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems : [];
      const out = [];
      for (const id of (profile?.itemIds || [])) {
        const it = items[id];
        const dose = it ? this.feeds(it, key) : 0;
        if (dose > 0 && !out.some(o => o.id === id)) out.push({ id, dose });
      }
      return out.sort((a, b) => b.dose - a.dose || a.id - b.id);
    },

    // What this person would carry for `key`: their purse, their diet.
    pool(profile, key, name) {
      const tier = Math.max(0, Math.min(4, Number(profile?.wealthTierBase) | 0));
      const cap = HAND_FIX_PRICE[tier];
      const Diet = window.NPCShared?.Diet;
      return (this._index().byKey[key] || []).filter(it => (it.price || 0) <= cap &&
        (!Diet || Diet.allows(profile, it)) && this.allows(profile, it, name));
    },

    // Deals 1-2 fixes per addiction, once.
    stockHand(profile, name) {
      if (!profile || profile._addictV === ADDICT_V) return 0;
      const keys = this.keysFor(profile, name);
      // A child may still be dealt theirs once grown: not stamped.
      if (!keys.length) {
        if (!this._traitKeys(profile).length) profile._addictV = ADDICT_V;
        return 0;
      }
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      const rng = new MiniRng(nameHash(`${name || "npc"}_fixes`) ^ window.NPCShared.worldSeed());
      let dealt = 0;
      for (const key of keys) {
        const pool = this.pool(profile, key, name);
        if (!pool.length) continue;
        const target = rng.int(HAND_FIX_MIN, HAND_FIX_MAX);
        for (let have = this.fixesInHand(profile, key).length; have < target; have++) {
          profile.itemIds.push(pool[Math.floor(rng.next() * pool.length)].id);
          dealt++;
        }
      }
      window.NPCShared.capItemIds(profile);
      profile._addictV = ADDICT_V;
      return dealt;
    },

    // Feeds one craving from the hand. Returns the item used, or null.
    use(profile, name, key) {
      const fix = this.fixesInHand(profile, key)[0];
      if (!fix) return null;
      const item = $dataItems[fix.id];
      const i = profile.itemIds.indexOf(fix.id);
      if (i >= 0) profile.itemIds.splice(i, 1);
      // A dose feeds whatever else it answers too (a detox pill, all of it).
      for (const r of this.reliefOf(item)) {
        if (r.key === FIX_ALL) for (const k of Object.keys(profile._crave?.v || {})) this.relieve(profile, k, r.amount);
        else this.relieve(profile, r.key, r.amount);
      }
      StoryLogger.record(name, "addiction", "NPCSim.log.usedFix", { item: item.name, substance: this.label(key) });
      this.say(profile, "use", key, { item: item.name });
      return item;
    },

    // Off the map, a craving with nothing in hand buys one fix on a
    // shopping or leisure hour. Returns the item bought, or null.
    buyOffscreen(profile, name, key, minute) {
      const now = minute ?? this._now();
      if (now - (profile._lastFixBuyMin ?? -Infinity) < FIX_BUY_COOLDOWN_MIN) return null;
      const money = Math.max(0, Math.floor(profile.money || 0));
      const pool = this.pool(profile, key, name).filter(it => (it.price || 0) <= money * 0.5);
      if (!pool.length) return null;
      const item = pool[Math.floor(economyRng(name, `fix_${key}`, now).next() * pool.length)];
      profile._lastFixBuyMin = now;
      profile.money = Math.max(0, money - item.price);
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      profile.itemIds.push(item.id);
      window.NPCShared.capItemIds(profile);
      StoryLogger.record(name, "shopping", "NPCSim.log.bought", { item: item.name, price: fmtMoney(item.price) });
      this.say(profile, "buy", key, { item: item.name });
      return item;
    },

    // The words for a moment of the habit (NPCConversation.AddictionThoughts,
    // ConvThoughts pools), pushed as a thought so it reaches the bubble.
    // moment: craving | buy | use | withdrawal | relief | gamble; for gamble
    // the key is casino | bet | won | lost | chase | broke.
    say(profile, moment, key, params) {
      const line = window.NPCConversation?.AddictionThoughts?.line?.(profile, moment, key, params);
      if (!line) return null;
      ThoughtGenerator._push(profile, line);
      return line;
    },

    // The key a fix bought from a shop answers, when it answers a craving
    // that is biting.
    fixKey(profile, item) {
      const v = profile?._crave?.v;
      if (!v || !item) return null;
      let best = null;
      for (const key of Object.keys(v)) {
        if (v[key] >= CRAVE_BUY_AT && this.feeds(item, key) > 0 && (!best || v[key] > v[best])) best = key;
      }
      return best;
    },

    // From a shop's entries (the ShopScanner shape), the one that feeds the
    // craving biting hardest, when it bites past CRAVE_BUY_AT.
    pickFix(profile, name, entries) {
      const v = profile?._crave?.v;
      if (!v || !Array.isArray(entries) || !entries.length) return null;
      const keys = Object.keys(v).filter(k => v[k] >= CRAVE_BUY_AT).sort((a, b) => v[b] - v[a]);
      for (const key of keys) {
        let best = null;
        for (const e of entries) {
          if ((e?.type || "item") !== "item" || !e.data) continue; // i18n-ignore: item kind
          const dose = this.feeds(e.data, key);
          if (dose > 0 && (!best || dose > best.dose || (dose === best.dose && e.data.price < best.e.data.price))) best = { e, dose };
        }
        if (best) return best.e;
      }
      return null;
    },

    // A game a gambler plays to feed the want: every game with a stake
    // (slots, horse race, tournament, scratch cards) and the card table.
    isBetGame(game) {
      return !!MINIGAMES[game]?.stake || game === CARD_TABLE_GAME;
    },

    // A gambler at the tables: still wanting, and with a pocket to bet from.
    wantsToGamble(profile, name) {
      const v = this.craving(profile, GAMBLING);
      if (v === null || v < GAMBLE_UNTIL || !this.isGambler(profile, name)) return false;
      return Math.floor(profile.money || 0) >= MinigamePlay.MIN_STAKE * 4;
    },

    // A gambler raises the stake as the want grows, and more at a croupier's
    // table: x1 fed, up to x1.75 at the casino in withdrawal.
    stakeBoost(profile, name) {
      const v = this.craving(profile, GAMBLING);
      if (v === null || !this.isGambler(profile, name)) return 1;
      const atCasino = this.isCroupierMap($gameMap?.mapId?.());
      return 1 + v / 200 + (atCasino ? 0.25 : 0);
    },

    // A round of a betting game feeds the gambling craving, and the gambler
    // says how it went: a win, a loss, a loss they mean to win back, or the
    // last of the money gone.
    onRound(profile, name, round) {
      if (!round || !this.isBetGame(round.game)) return false;
      // Watching a round of a game of chance with nothing put down is no bet.
      if (MINIGAMES[round.game]?.stake && !(round.stake > 0)) return false;
      if (this.craving(profile, GAMBLING) === null) return false;
      this.relieve(profile, GAMBLING, ROUND_RELIEF[round.result] ?? ROUND_RELIEF.played);
      const broke = Math.floor(profile.money || 0) < MinigamePlay.MIN_STAKE * 4;
      const moment = broke ? "broke" // i18n-ignore: thought pool ids
        : round.result === "won" ? "won" // i18n-ignore: thought pool ids
        : round.result === "lost" ? (this.wantsToGamble(profile, name) ? "chase" : "lost") // i18n-ignore: thought pool ids
        : "bet"; // i18n-ignore: thought pool id
      this.say(profile, GAMBLING_MOMENT, moment, { amount: fmtMoney(Math.abs(round.net || 0)) });
      return true;
    },

    // A gambler setting off for the tables says so, once an hour at most.
    headingOut(profile, name) {
      const hour = Math.floor(this._now() / 60);
      if (profile._casinoSaidHour === hour) return null;
      profile._casinoSaidHour = hour;
      return this.say(profile, GAMBLING_MOMENT, "casino"); // i18n-ignore: thought pool id
    },

    _jobsAt(mapId) {
      if (!mapId) return [];
      if (window.WorkSystem?.jobsAt) return window.WorkSystem.jobsAt(mapId) || [];
      const entry = window.WorldGen?.MapJobs?.[String(mapId)];
      return entry && Array.isArray(entry.jobs) ? entry.jobs : [];
    },

    isCroupierMap(mapId) {
      return !!mapId && this._jobsAt(mapId).includes(CROUPIER_JOB_ID);
    },

    // The maps of a town that employ a croupier, among the maps it holds.
    casinoMaps(groupName, group) {
      if (!group) return [];
      const cached = _casinoMapsCache[groupName];
      if (cached && cached.group === group) return cached.maps;
      const maps = Array.isArray(group.maps) ? group.maps : [];
      const out = [];
      for (const [mapId, jobs] of Object.entries(group.jobs || {})) {
        const id = Number(mapId);
        if (id && Array.isArray(jobs) && jobs.includes(CROUPIER_JOB_ID) && maps.includes(id)) out.push(id);
      }
      if (!out.length) for (const id of maps) if (this.isCroupierMap(id)) out.push(id);
      out.sort((a, b) => a - b);
      _casinoMapsCache[groupName] = { group, maps: out };
      return out;
    },

    // Where a gambler spends a leisure hour: one of the town's casinos.
    casinoMapFor(name, profile, groupName, group, hourSalt) {
      if (!this.isGambler(profile, name)) return null;
      const maps = this.casinoMaps(groupName, group);
      if (!maps.length) return null;
      return maps[((nameHash(name + "_casino") ^ (hourSalt * 2654435761)) >>> 0) % maps.length];
    },

    // Maps of a town with games on them: a name that says so, a map that
    // employs a croupier or an arcade attendant, or one seen to hold a game
    // (Venues.learn, on every map load).
    venueMaps(groupName, group) {
      if (!group) return [];
      const learned = $gameSystem?._npcVenueMaps || {};
      const stamp = Object.keys(learned).length;
      const cached = _venueMapsCache[groupName];
      if (cached && cached.group === group && cached.stamp === stamp) return cached.maps;
      const infos = (typeof $dataMapInfos !== "undefined" && $dataMapInfos) ? $dataMapInfos : [];
      const out = [];
      for (const id of (Array.isArray(group.maps) ? group.maps : [])) {
        const jobs = (group.jobs && group.jobs[id]) || this._jobsAt(id);
        if (learned[id] === false) continue;
        if (learned[id] || VENUE_NAME_RE.test(infos[id]?.name || "") ||
            (Array.isArray(jobs) && (jobs.includes(CROUPIER_JOB_ID) || jobs.includes(ARCADE_JOB_ID)))) out.push(id);
      }
      out.sort((a, b) => a - b);
      _venueMapsCache[groupName] = { group, stamp, maps: out };
      return out;
    },

    // One leisure hour in VENUE_EVERY is spent at the games, when the town has
    // somewhere to play.
    venueMapFor(name, groupName, group, hourSalt) {
      const maps = this.venueMaps(groupName, group);
      if (!maps.length) return null;
      const s = (nameHash(name + "_venue") ^ (hourSalt * 40503)) >>> 0;
      if (s % VENUE_EVERY !== 0) return null;
      return maps[Math.floor(s / VENUE_EVERY) % maps.length];
    },

    // Called once per map load: whether the map holds a game an NPC plays.
    learnVenue(mapId) {
      if (!mapId || !$gameMap || !$gameSystem) return;
      let found = false;
      for (const ev of ($gameMap.events?.() || [])) {
        if (ev && MinigamePlay.kindOf(ev)) { found = true; break; }
      }
      const book = $gameSystem._npcVenueMaps = $gameSystem._npcVenueMaps || {};
      if (book[mapId] !== found) book[mapId] = found;
    },

    // The games on this map a person would walk to for leisure: the betting
    // ones for a gambler who still wants, else every game they may play.
    leisureGames(profile, name, spots) {
      const gamble = this.wantsToGamble(profile, name);
      const out = [];
      for (const ev of (spots || [])) {
        const game = MinigamePlay.kindOf(ev);
        if (!game || !MinigamePlay.canPlay(profile, name, game)) continue;
        if (gamble && !this.isBetGame(game)) continue;
        out.push(ev);
      }
      return { gamble, games: out };
    },

    // The off-map round of a gambler at the tables: the first betting game
    // whose maths is loaded.
    gambleOffscreen(profile, name, minute) {
      if (!this.wantsToGamble(profile, name)) return null;
      const now = minute ?? this._now();
      if (now - (profile._lastMinigameMin ?? -Infinity) < GAMBLER_COOLDOWN_MIN) return null;
      for (const game of OFFSCREEN_BET_GAMES) {
        const round = MinigamePlay.playRound(name, profile, game, economyRng(name, `bet_${game}`, now));
        if (round && round.stake > 0) return MinigamePlay.apply(name, profile, round);
      }
      return null;
    },

    // One pass for one person, from the sim tick: the meter, a fix from the
    // hand, a purchase or a round off the map, and withdrawal.
    tick(profile, name, onMap, minute) {
      if (!profile || !Array.isArray(profile.traitIds) || !profile.traitIds.length) return;
      const now = minute ?? this._now();
      const st = this.state(profile, name, now);
      if (!st) return;
      const keys = Object.keys(st.v);
      if (!keys.length) return;
      if (profile._addictV !== ADDICT_V) this.stockHand(profile, name);
      const need = profile.currentNeed;
      // The want is said once a cycle, when it starts to bite.
      st.c = Array.isArray(st.c) ? st.c.filter(k => (st.v[k] ?? 0) >= CRAVE_BUY_AT) : [];
      for (const key of keys) {
        if (st.v[key] >= CRAVE_BUY_AT && !st.c.includes(key)) {
          st.c.push(key);
          this.say(profile, "craving", key);
        }
      }
      for (const key of keys) {
        if (st.v[key] < CRAVE_USE_AT) continue;
        if (this.use(profile, name, key)) continue;
        if (onMap || !FIX_HOURS.has(need)) continue;
        if (key === GAMBLING && need === LEISURE_NEED && this.gambleOffscreen(profile, name, now)) continue;
        if (this.buyOffscreen(profile, name, key, now)) this.use(profile, name, key);
      }
      this._withdrawal(profile, name, st);
    },

    _withdrawal(profile, name, st) {
      const worst = this.worst(profile);
      if (!st.w && worst && worst.value >= CRAVE_WITHDRAWAL_ON) {
        st.w = worst.key;
        StoryLogger.record(name, "addiction", "NPCSim.log.withdrawal", { substance: this.label(worst.key) });
        this.say(profile, "withdrawal", worst.key);
      } else if (st.w && (!worst || worst.value < CRAVE_WITHDRAWAL_OFF)) {
        StoryLogger.record(name, "addiction", "NPCSim.log.withdrawalOver", { substance: this.label(st.w) });
        this.say(profile, "relief", st.w);
        st.w = null;
      }
      if (st.w) {
        profile.leisure = Math.min(profile.leisure ?? 100, WITHDRAWAL_LEISURE_CAP);
        profile.social = Math.min(profile.social ?? 100, WITHDRAWAL_SOCIAL_CAP);
      }
    },

    inWithdrawal(profile) {
      return !!profile?._crave?.w;
    },
  };

  Object.assign(NPCSim._internal, {
    Addictions,
  });
})();
