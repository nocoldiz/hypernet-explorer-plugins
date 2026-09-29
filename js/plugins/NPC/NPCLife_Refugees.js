/*:
 * @target MZ
 * @plugindesc NPC Life: the Goblin Horde's conquests, refugees and the long way home
 * @author Omni-Lex
 * @base NPCLifeSimulator
 * @orderAfter NPCLifeSimulator
 * @orderAfter NPCLife_Api
 * @help
 * ============================================================================
 * NPCLife_Refugees, part of the NPCLifeSimulator family
 * ============================================================================
 * Owns REFUGEES: flight from the Horde, camps, returning home, the displaced
 * a new world starts with (world initializer "refugees", order 58).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCLifeSim._internal and publishes its own there. Load it right after
 * NPCLife_Api.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const {
    addTravellerSource, BORN_HERE, canonicalGroup, countryOfGroup, destinationAtTile,
    destinationTable, getJobs, getProfile, getRecords, groupCoords, groupCounts, groupForPlace,
    HOMECOMING, hordeCrimeMultiplier, householdOf, inPartyNamed, isEmptyWorld, isMinor, LifeRng,
    markDev, minuteOfYear, MINUTES_PER_DAY, nameHash, onLoadedMap, placeLabel, placeOfGroup,
    pushLifeEvent, relocate, relocationDestinations, relocationState, resolveCrime, ROAD_MODES,
    ROAD_NEAR_TILES, unitVector, worldSeed, yearOf,
  } = window.NPCLifeSim._internal;

  // ==========================================================================
  // REFUGEES, the Goblin Horde's conquests and the long way home
  // ==========================================================================
  // When the Horde takes a country (HistoryManager.onNationChange, `to` the
  // Goblin Horde) the people of every town in it who do not live in goblin
  // society leave. Not in a day: each is given a date one to three months out
  // (record.refugee = { from, since, status: "fleeing", leaveAt }) and goes on
  // it, a household at a time, to a town of a country the Horde does not hold
  // (the same region first), or, with no room left anywhere near, to a wild
  // camp of tents out in the country near the border (NPCSystem
  // ensureCampGroup). Their empty homes in a hand-made town are dealt again
  // off the Horde's own wardrobe (NPCSystem.refillHordeHomes).
  //
  // Who stays: the goblins, the other creatures, and the humans who have made
  // their lives in goblin society (profile._hordeIntegrated), whose creed
  // leans toward the Horde's platform and whose work is the Horde's work.
  //
  // When the Horde loses a country, its refugees start home at one to three
  // in a hundred a month, and the goblins who were dealt into its towns leave
  // at the same pace. None of that needs a list of liberations: the monthly
  // pass asks whether the Horde still holds each refugee's country.
  //
  // During the world-creation span (2001 to the start date, change.span) no
  // record is touched: the "refugees" initializer seeds the displaced of every
  // country the Horde holds on the start date instead.
  //
  // Every flow runs in the life-sim catch-up, a game month at a time, capped
  // per town per month; nothing here runs per frame.

  const HORDE_POWER = "Goblin Horde";               // i18n-ignore: Hyperpowers.json key
  const FLED_HORDE = "fledHorde";                   // i18n-ignore: move reason id
  const REFUGEE_FLEEING = "fleeing";                // i18n-ignore: refugee status id
  const REFUGEE_SETTLED = "settled";                // i18n-ignore: refugee status id
  const REFUGEE_CAMP = "camp";                      // i18n-ignore: refugee status id
  const FLIGHT_MIN_DAYS = 30;
  const FLIGHT_MAX_DAYS = 90;
  const INTEGRATED_SHARE = 0.10;                    // of the humans, before creed
  const REFUGEE_MONTH_DAYS = 30;
  const REFUGEE_MONTHS_PER_PASS = 24;               // the rest waits for the next pass
  const FLIGHT_CAP_PER_GROUP = 12;                  // households leaving one town a month
  const RETURN_RATE_MIN = 0.01;                     // of a country's refugees, a month
  const RETURN_RATE_MAX = 0.03;
  const HOST_SWELL = 1.3;                           // a town takes people up to this of its size
  const CAMP_CHANCE = 0.2;                          // some go to the camps with room elsewhere
  const CAMP_SIZE_CAP = 40;
  const START_REFUGEE_SHARE = 0.04;
  const START_CAMP_SHARE = 0.15;
  const HORDE_JOB_CATEGORIES = ["Labor", "Combat", "Criminal"]; // i18n-ignore: Jobs.json category ids
  const HORDE_FACTION_ID = 25;                      // Factions.json, the goblin collective
  const REFUGEE_WALK_TILES_PER_HOUR = 0.4;
  const REFUGEE_ROAD_MAX_HOURS = 240;

  function hordeHolds(country) {
    if (!country) return false;
    const HG = window.HordeGround;
    if (HG?.holdsCountry) return HG.holdsCountry(country);
    const state = window.HistoryManager?.getNationState?.(country);
    return !!(state && state.controller === HORDE_POWER);
  }

  // The nation a home group stands in, as every reader here asks it.
  function nationOfHome(group) {
    if (!group) return null;
    return countryOfGroup(group) || window.SpriteCatalog?.countryOfMapGroup?.(group) || null;
  }

  function regionOfCountry(country) {
    const list = window.WorldGen?.Countries;
    const entry = Array.isArray(list) ? list.find(c => c && c.country === country) : null;
    return entry?.region || null;
  }

  function hordeState() {
    const st = relocationState();
    if (!st.horde || typeof st.horde !== "object") st.horde = {};
    if (!st.horde.camps) st.horde.camps = {};
    return st.horde;
  }

  function refugeeRng(name, salt) {
    return new LifeRng((nameHash(name + "_refugee_" + salt) ^ worldSeed()) >>> 0);
  }

  // Is this a person the Horde's coming makes leave at all?
  function mayFlee(record, profile) {
    if (!record || !profile || record.nonSentient || record.refugee) return false;
    if (record.child || isMinor(record.name, profile)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    if (profile._hordeGoblin === true || profile._hordeIntegrated) return false;
    if (window.SpriteCatalog?.isGoblinSheet?.(profile.spriteKey)) return false;
    if (profile.playerCreated || profile._localNpc) return false;
    if (window.NPCSystem?.isReservedName?.(record.name)) return false;
    if (window.NPCSystem?.isNameGone?.(record.name)) return false;
    if (inPartyNamed(record.name)) return false;
    return true;
  }

  // The Horde's work: its own faction's jobs where there are any, else the
  // labour, the fighting and the crime its towns run on.
  function hordeJobs() {
    const jobs = getJobs();
    const own = jobs.filter(j => j && j.factionId === HORDE_FACTION_ID);
    return own.length ? own : jobs.filter(j => j && HORDE_JOB_CATEGORIES.includes(j.category));
  }

  // A human who lives in goblin society: the flag, the creed leaning toward
  // the Horde's platform, and the Horde's work.
  function integrateIntoHorde(name, profile, record, minute) {
    if (!profile) return false;
    profile._hordeIntegrated = true;
    profile._hordeGoblin = false;
    profile._hordePlaced = true;
    const S = window.NPCShared;
    const creed = S?.ideologyFor?.(profile);
    const platform = window.NPCPolitics?.platformOfPower?.(HORDE_POWER) || null;
    if (S && creed && platform && !creed.alien && !S.creedPinned(profile)) {
      const own = S.ideologyAxes(creed);
      const target = {};
      for (const ax of Object.keys(own)) target[ax] = Math.round(own[ax] * 0.4 + (Number(platform[ax]) || 0) * 0.6);
      const near = S.nearestIdeologies(target, { alien: false, limit: 5 }).filter(e => !e.ideo.alien);
      if (near[0] && near[0].ideo.id !== creed.id) {
        S.setCreed(profile, near[0].ideo);
        try { window.NPCPolitics?.onCreedChanged?.(name); } catch (_) { /* no identity yet */ }
      }
    }
    const pool = hordeJobs();
    if (record && record.employment === "employed" && pool.length) {
      const open = (record.careerHistory || []).find(seg => seg.toYear === null);
      const already = open && pool.some(j => j.id === open.jobId);
      if (!already) {
        const rng = refugeeRng(name, "job");
        const job = rng.pick(pool);
        const year = yearOf(minute || 0);
        if (open) { open.toYear = Math.max(open.fromYear, year); open.end = "changed"; }
        if (!Array.isArray(record.careerHistory)) record.careerHistory = [];
        record.careerHistory.push({
          jobId: job.id, jobName: job.name || T('NPCLife.jobFallback', { id: job.id }),
          category: job.category || "General", fromYear: year, toYear: null, end: null, // i18n-ignore: Jobs.json category id
        });
        if (profile.currentJobId != null && profile.currentJobId !== 0) profile.currentJobId = job.id;
        markDev(record, "job");
      }
    }
    return true;
  }

  // A person seen living on the Horde's ground is placed once, for good: a
  // goblin, or a human who stays in goblin society. Asked lazily by the
  // monthly pass, so a citizen minted on a Horde square is settled the same way.
  function stampHordeResident(record, profile, minute) {
    if (!record || !profile || profile._hordePlaced || record.refugee) return;
    profile._hordePlaced = true;
    if (profile._hordeGoblin === true || window.SpriteCatalog?.isGoblinSheet?.(profile.spriteKey)) {
      profile._hordeGoblin = true;
      return;
    }
    profile._hordeGoblin = false;
    if (profile._hordeIntegrated || record.nonSentient || record.child) return;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return;
    integrateIntoHorde(record.name, profile, record, minute);
  }

  // The chance this human stays when the Horde comes: a tenth, and more the
  // closer their creed already stands to the Horde's platform.
  function integrationChance(profile) {
    const S = window.NPCShared;
    const platform = window.NPCPolitics?.platformOfPower?.(HORDE_POWER);
    let bonus = 0;
    if (S?.ideologyDistance && platform && profile) {
      const d = S.ideologyDistance(profile, platform);
      bonus = Math.max(0, 0.1 * (1 - d / 60));
    }
    return INTEGRATED_SHARE + bonus;
  }

  // The Horde took `country`: everybody who is going is given their day.
  function onHordeConquest(country, minute) {
    const records = getRecords();
    if (!records || !country) return 0;
    const hs = hordeState();
    if (!Number.isFinite(hs.clock)) hs.clock = minute;
    let fleeing = 0;
    const byGroup = new Map();
    for (const record of Object.values(records)) {
      if (!record?.homeGroup) continue;
      let c = byGroup.get(record.homeGroup);
      if (c === undefined) { c = nationOfHome(record.homeGroup); byGroup.set(record.homeGroup, c); }
      if (c !== country) continue;
      const profile = getProfile(record.name);
      if (!profile) continue;
      if (profile._hordeGoblin === undefined && window.SpriteCatalog?.isGoblinSheet?.(profile.spriteKey)) profile._hordeGoblin = true;
      if (!mayFlee(record, profile)) continue;
      const rng = refugeeRng(record.name, "stay:" + country);
      if (rng.next() < integrationChance(profile)) {
        integrateIntoHorde(record.name, profile, record, minute);
        continue;
      }
      const days = FLIGHT_MIN_DAYS + Math.floor(rng.next() * (FLIGHT_MAX_DAYS - FLIGHT_MIN_DAYS + 1));
      record.refugee = {
        from: country, fromGroup: record.homeGroup, since: minute, year: yearOf(minute),
        status: REFUGEE_FLEEING, leaveAt: minute + days * MINUTES_PER_DAY,
        returnRate: RETURN_RATE_MIN + rng.next() * (RETURN_RATE_MAX - RETURN_RATE_MIN),
      };
      fleeing++;
    }
    if (fleeing) {
      try {
        window.NPCPolitics?.logPowerEvent?.(HORDE_POWER, minute, "refugees", "Politics.event.hordeFlight", // i18n-ignore: event type id
          { country, n: fleeing });
      } catch (_) { /* no political state yet */ }
    }
    return fleeing;
  }

  // Somewhere to run to: an open town of a nation the Horde does not hold,
  // the same region first, not swollen past HOST_SWELL of its own size.
  function refugeeDestination(record, profile, rng) {
    const from = record.refugee?.from;
    const region = regionOfCountry(from);
    const counts = groupCounts();
    const st = relocationState();
    const origin = groupCoords(record.homeGroup);
    const options = [];
    for (const g of relocationDestinations()) {
      if (g === record.homeGroup) continue;
      const c = nationOfHome(g);
      if (!c || c === from || hordeHolds(c)) continue;
      const base = Math.max(Number(st.baseline[g]) || 0, counts[g] || 0, 10);
      if (st.baseline[g] === undefined) st.baseline[g] = counts[g] || 0;
      if ((counts[g] || 0) >= base * HOST_SWELL && (counts[g] || 0) >= (Number(st.baseline[g]) || 0) * HOST_SWELL) continue;
      let w = regionOfCountry(c) === region ? 4 : 1;
      const at = groupCoords(g);
      if (origin && at) w *= 1 / (1 + Math.hypot(at.x - origin.x, at.y - origin.y) / 25);
      options.push({ g, c, w });
    }
    if (!options.length) return null;
    const total = options.reduce((a, o) => a + o.w, 0);
    let roll = rng.next() * total;
    for (const o of options) { roll -= o.w; if (roll <= 0) return o; }
    return options[options.length - 1];
  }

  // A camp's name for menus, off the i18n table.
  function campLabel(group) {
    const country = group?.country || "";
    return T.has('NPCLife.refugeeCamp') ? T('NPCLife.refugeeCamp', { country }) : country;
  }

  // A wild square near the border of `host` facing `from`: out of any town,
  // inside the host nation where the world map can say so. One camp per pair
  // of nations until it is full, then another further along.
  function campFor(from, host, household) {
    const NS = window.NPCSystem;
    if (!NS?.ensureCampGroup || !host) return null;
    const hs = hordeState();
    const pairKey = from + ">" + host;
    const groups = $gameSystem?._npcMapGroups || {};
    const counts = groupCounts();
    const known = hs.camps[pairKey];
    if (known && groups[known]?._camp && (counts[known] || 0) + household <= CAMP_SIZE_CAP) return known;
    const table = destinationTable() || {};
    const pins = (country) => Object.keys(table).sort()
      .filter(k => table[k]?.country === country && table[k]?.base).map(k => table[k].base);
    const hostPins = pins(host);
    if (!hostPins.length) return null;
    const fromPins = pins(from);
    // The host town nearest the Horde's side, and a few tiles out of it
    // toward the border.
    let best = hostPins[0], bestD = Infinity, toward = null;
    for (const h of hostPins) {
      for (const f of (fromPins.length ? fromPins : [h])) {
        const d = Math.hypot(h.x - f.x, h.y - f.y);
        if (d < bestD) { bestD = d; best = h; toward = f; }
      }
    }
    const dir = (toward && (toward.x !== best.x || toward.y !== best.y))
      ? unitVector(toward.x - best.x, toward.y - best.y) : { x: 1, y: 0 };
    const serial = Object.keys(hs.camps).length;
    for (let step = 3 + serial; step < 12 + serial; step++) {
      for (const side of [0, 1, -1, 2, -2]) {
        const x = Math.round(best.x + dir.x * step - dir.y * side);
        const y = Math.round(best.y + dir.y * step + dir.x * side);
        if (destinationAtTile(x, y)) continue;
        const key = "Proc:" + x + "," + y;
        if (groups[key]) continue;
        const nation = $gameSystem?.getCountryFromWorldCoordinates?.(x, y);
        if (nation && nation.country !== host) continue;
        const made = NS.ensureCampGroup(x, y, host, null);
        if (!made) continue;
        const grp = $gameSystem?._npcMapGroups?.[made];
        if (grp) grp.displayName = campLabel(grp);
        hs.camps[pairKey] = made;
        return made;
      }
    }
    return null;
  }

  // Everybody who goes with this refugee.
  function refugeeHousehold(record) {
    return [record.name, ...householdOf(record.name)];
  }

  // A host nation for a camp when no town had room: a non-Horde nation of the
  // same region that has any named place at all.
  function refugeeHostCountry(record, rng) {
    const from = record.refugee?.from;
    const region = regionOfCountry(from);
    const table = destinationTable() || {};
    const nations = [...new Set(Object.values(table).map(d => d?.country).filter(Boolean))]
      .filter(c => c !== from && !hordeHolds(c)).sort();
    if (!nations.length) return null;
    const same = nations.filter(c => regionOfCountry(c) === region);
    const pool = same.length ? same : nations;
    return pool[Math.floor(rng.next() * pool.length)];
  }

  // One household leaves the Horde's country, for a town or a camp.
  function fleeHorde(record, minute, rng) {
    const profile = getProfile(record.name);
    if (!profile) { record.refugee = null; return null; }
    if (record.trip || record.inPrisonUntilMinute != null) return null;
    const movers = refugeeHousehold(record);
    if (movers.some(onLoadedMap)) return null;
    const from = record.refugee.from;
    const dest = rng.next() < CAMP_CHANCE ? null : refugeeDestination(record, profile, rng);
    let status = REFUGEE_SETTLED;
    let toGroup = dest?.g || null;
    if (!toGroup) {
      const host = refugeeHostCountry(record, rng);
      toGroup = host ? campFor(from, host, movers.length) : null;
      if (toGroup) {
        status = REFUGEE_CAMP;
        window.NPCSystem?.addCampTent?.(toGroup, movers.length);
      }
    }
    if (!toGroup) {
      // Nowhere at all to go: after three months of trying they stay, and
      // make what life they can under the Horde.
      record.refugee.tries = (record.refugee.tries || 0) + 1;
      if (record.refugee.tries >= 3) {
        record.refugee = null;
        integrateIntoHorde(record.name, profile, record, minute);
      }
      return null;
    }
    const fromGroup = record.homeGroup;
    const moved = relocate(record.name, { toGroup, now: minute, reason: FLED_HORDE, force: true, withNames: movers.slice(1) });
    if (!moved) return null;
    const place = placeLabel(placeOfGroup(toGroup) || toGroup);
    const a = groupCoords(fromGroup), b = groupCoords(toGroup);
    const hours = (a && b) ? Math.min(REFUGEE_ROAD_MAX_HOURS, Math.hypot(b.x - a.x, b.y - a.y) / REFUGEE_WALK_TILES_PER_HOUR) : 0;
    const records = getRecords();
    for (const n of moved.movers) {
      const r = records[n];
      if (!r) continue;
      const base = (r.refugee && r.refugee.from === from) ? r.refugee : null;
      r.refugee = {
        from, fromGroup, since: base?.since ?? minute, year: base?.year ?? yearOf(minute),
        status, returnRate: base?.returnRate ?? (RETURN_RATE_MIN + (RETURN_RATE_MAX - RETURN_RATE_MIN) / 2),
        road: (hours > 0) ? { from: a, to: b, start: minute, end: minute + Math.round(hours * 60) } : null,
      };
      pushLifeEvent(r, minute, "move", "NPCLife.event.fled", { country: from, place });
      markDev(r, "refugee");
    }
    _refugeeRoad = null;
    return moved;
  }

  // A refugee whose country is free again goes home: to the town they fled,
  // or any town of that country when theirs is gone.
  function returnHome(record, minute) {
    const ref = record.refugee;
    const known = ref.fromGroup && ($gameSystem?._npcMapGroups?.[ref.fromGroup] || /^Proc:/.test(ref.fromGroup));
    const target = known ? ref.fromGroup : (relocationDestinations().find(g => nationOfHome(g) === ref.from) || null);
    if (!target || canonicalGroup(target) === canonicalGroup(record.homeGroup)) {
      clearRefugee(record, minute, null);
      return true;
    }
    if (record.trip || record.inPrisonUntilMinute != null) return false;
    const movers = refugeeHousehold(record);
    if (movers.some(onLoadedMap)) return false;
    const moved = relocate(record.name, { toGroup: target, now: minute, reason: HOMECOMING, force: true, withNames: movers.slice(1) });
    if (!moved) return false;
    const place = placeLabel(placeOfGroup(target) || target);
    const records = getRecords();
    for (const n of moved.movers) {
      const r = records[n];
      if (r?.refugee && r.refugee.from === ref.from) clearRefugee(r, minute, place);
    }
    return true;
  }

  function clearRefugee(record, minute, place) {
    const from = record.refugee?.from;
    record.refugee = null;
    record.refugeeReturned = { from, at: minute };
    pushLifeEvent(record, minute, "move", "NPCLife.event.returnedHome", { country: from, place: place || placeLabel(from) });
  }

  // A goblin dealt into a town the Horde has since lost moves on, to the
  // Horde's own ground if it holds any; with none left they simply stay.
  function goblinLeaves(record, profile, minute) {
    const options = relocationDestinations().filter(g => hordeHolds(nationOfHome(g)));
    if (!options.length) { profile._hordeSettler = null; return false; }
    const rng = refugeeRng(record.name, "goblinLeaves:" + minute);
    const moved = relocate(record.name, { toGroup: rng.pick(options), now: minute, reason: "changeOfAir", force: true }); // i18n-ignore: MOVE_REASONS id
    if (moved) profile._hordeSettler = null;
    return !!moved;
  }

  // The monthly flows, run from catchUp. Months are counted off the Horde
  // clock kept in the world's relocation state, so a long skip replays month
  // by month (at most REFUGEE_MONTHS_PER_PASS of them; the rest wait for the
  // next pass).
  function resolveRefugees(nowMinute) {
    const records = getRecords();
    if (!records) return 0;
    // A zombie world's survivors, on the same monthly beat (SURVIVORS).
    resolveSurvivors(nowMinute);
    const hs = hordeState();
    const MONTH = REFUGEE_MONTH_DAYS * MINUTES_PER_DAY;
    if (!Number.isFinite(hs.clock)) { hs.clock = nowMinute; return 0; }
    const months = Math.min(REFUGEE_MONTHS_PER_PASS, Math.floor((nowMinute - hs.clock) / MONTH));
    if (months <= 0) return 0;

    // The lists, once: who is on their way out, who is away, who was dealt in.
    const fleeing = [], away = [], settlers = [], unplaced = [];
    const holdsByGroup = new Map();
    const heldHome = (g) => {
      let v = holdsByGroup.get(g);
      if (v === undefined) { v = hordeHolds(nationOfHome(g)); holdsByGroup.set(g, v); }
      return v;
    };
    for (const record of Object.values(records)) {
      if (!record) continue;
      const ref = record.refugee;
      if (ref) {
        if (ref.status === REFUGEE_FLEEING) fleeing.push(record);
        else away.push(record);
        continue;
      }
      const profile = getProfile(record.name);
      if (!profile) continue;
      if (profile._hordeSettler) settlers.push(record);
      else if (!profile._hordePlaced && record.homeGroup && heldHome(record.homeGroup)) unplaced.push(record);
    }
    for (const record of unplaced) stampHordeResident(record, getProfile(record.name), nowMinute);
    // A town empties over the flight window, not faster: its households go
    // at least FLIGHT_CAP_PER_GROUP a month, and at most half of those still
    // waiting, so even a large town is gone inside the three months.
    const waitingIn = {};
    for (const record of fleeing) waitingIn[record.homeGroup] = (waitingIn[record.homeGroup] || 0) + 1;
    const capOf = (g) => Math.max(FLIGHT_CAP_PER_GROUP, Math.ceil((waitingIn[g] || 0) / 2));
    fleeing.sort((a, b) => (a.refugee.leaveAt - b.refugee.leaveAt) || (a.name < b.name ? -1 : 1));

    let moved = 0;
    for (let m = 1; m <= months; m++) {
      const at = hs.clock + m * MONTH;
      const leftFrom = {};
      for (const record of fleeing) {
        if (!record.refugee || record.refugee.status !== REFUGEE_FLEEING || record.refugee.leaveAt > at) continue;
        const g = record.homeGroup;
        if ((leftFrom[g] || 0) >= capOf(g)) continue;
        // The Horde may have lost the country again before they went.
        if (!hordeHolds(record.refugee.from)) { record.refugee = null; continue; }
        const out = fleeHorde(record, at, refugeeRng(record.name, "flee:" + at));
        if (out) { leftFrom[g] = (leftFrom[g] || 0) + 1; moved += out.movers.length; }
      }
      // The empty homes of a hand-made town are dealt to the Horde's own.
      for (const [g, n] of Object.entries(leftFrom)) {
        if (!heldHome(g) || window.NPCSystem?.isProceduralGroup?.(g)) continue;
        try { window.NPCSystem?.refillHordeHomes?.(g, n, "m" + Math.floor(at / MONTH)); } catch (e) {
          console.error("[NPCLifeSim] dealing the Horde's newcomers failed", e);
        }
      }
      // Home again, at the country's own pace, a few a month.
      const backFrom = {};
      for (const record of away) {
        const ref = record.refugee;
        if (!ref || hordeHolds(ref.from)) continue;
        if ((backFrom[ref.from] || 0) >= FLIGHT_CAP_PER_GROUP) continue;
        if (refugeeRng(record.name, "return:" + at).next() >= (ref.returnRate || RETURN_RATE_MIN)) continue;
        if (returnHome(record, at)) { backFrom[ref.from] = (backFrom[ref.from] || 0) + 1; moved++; }
      }
      // And the goblins dealt into a freed country go, at the same pace.
      for (const record of settlers) {
        const profile = getProfile(record.name);
        const c = profile?._hordeSettler;
        if (!c || hordeHolds(c)) continue;
        if (refugeeRng(record.name, "settler:" + at).next() >= (RETURN_RATE_MIN + RETURN_RATE_MAX) / 2) continue;
        if (goblinLeaves(record, profile, at)) moved++;
      }
    }
    hs.clock += months * MONTH;
    return moved;
  }

  // ==========================================================================
  // SURVIVORS, the living of a zombie world (WorldModes.survivorsOnly)
  // ==========================================================================
  // The dead walk every street, and the few who made it live in fear of them.
  // Once a game month, off a clock of its own in the same world state, a
  // survivor may have a close call (a life event and nothing more), and a
  // smaller share pack up and leave their town for another with their
  // household. Capped per town per month like the Horde's flights; the dead,
  // beasts, children, the party and anybody else who may not move never do.
  const SURVIVOR_FEAR_RATE = 0.06;                  // a month
  const SURVIVOR_FLIGHT_RATE = 0.01;                // a month
  const SURVIVOR_FLIGHT_CAP_PER_GROUP = 3;
  const FLED_DEAD = "fleeingTrouble";               // i18n-ignore: MOVE_REASONS id

  function isSurvivor(record, profile) {
    if (!record || !profile || record.dead != null || record.nonSentient || record.child) return false;
    if (isMinor(record.name, profile)) return false;
    if (window.NPCCreature?.isNonSentientProfile?.(profile)) return false;
    return !inPartyNamed(record.name);
  }

  function resolveSurvivors(nowMinute) {
    if (!window.NPCShared?.WorldModes?.survivorsOnly?.()) return 0;
    const records = getRecords();
    if (!records) return 0;
    const hs = hordeState();
    const MONTH = REFUGEE_MONTH_DAYS * MINUTES_PER_DAY;
    if (!Number.isFinite(hs.survivorClock)) { hs.survivorClock = nowMinute; return 0; }
    const months = Math.min(REFUGEE_MONTHS_PER_PASS, Math.floor((nowMinute - hs.survivorClock) / MONTH));
    if (months <= 0) return 0;
    const living = Object.values(records)
      .filter(r => isSurvivor(r, getProfile(r?.name)))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    let written = 0;
    for (let m = 1; m <= months; m++) {
      const at = hs.survivorClock + m * MONTH;
      const leftFrom = {};
      for (const record of living) {
        if (record.dead != null) continue;
        const rng = refugeeRng(record.name, "dead:" + at);
        const from = record.homeGroup;
        const place = placeLabel(placeOfGroup(from) || from);
        if (rng.next() < SURVIVOR_FEAR_RATE) {
          pushLifeEvent(record, at, "fear", "NPCLife.event.survivorFear", { place }); // i18n-ignore: life event type id
          written++;
        }
        if (rng.next() >= SURVIVOR_FLIGHT_RATE || record.refugee) continue;
        if ((leftFrom[from] || 0) >= SURVIVOR_FLIGHT_CAP_PER_GROUP) continue;
        const moved = relocate(record.name, { now: at, reason: FLED_DEAD });
        if (!moved) continue;
        leftFrom[from] = (leftFrom[from] || 0) + 1;
        pushLifeEvent(record, at, "move", "NPCLife.event.survivorFled", // i18n-ignore: life event type id
          { from: place, place: placeLabel(placeOfGroup(moved.toGroup) || moved.toGroup) });
        written++;
      }
    }
    hs.survivorClock += months * MONTH;
    return written;
  }

  // A nation changed hands in the live chronicle.
  function onNationChanged(change) {
    if (!change || !change.country || change.span) return;
    if (isEmptyWorld() || !$gameSystem) return;
    const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    if (change.to === HORDE_POWER && change.from !== HORDE_POWER) {
      onHordeConquest(change.country, now);
    } else if (change.from === HORDE_POWER && change.to !== HORDE_POWER) {
      const waiting = Object.values(getRecords() || {}).filter(r => r?.refugee?.from === change.country).length;
      try {
        window.NPCPolitics?.logPowerEvent?.(change.to, now, "refugees", "Politics.event.hordeLiberation", // i18n-ignore: event type id
          { country: change.country, n: waiting });
      } catch (_) { /* no political state yet */ }
    }
  }

  // Refugees on the road, for the road views (ROAD TRAVELLERS): walking from
  // the town they fled to where they are going. Who is walking is listed once
  // per game hour.
  let _refugeeRoad = null;
  function refugeesOnRoad(wx, wy, nowMinute, max) {
    const hour = Math.floor(nowMinute / 60);
    if (!_refugeeRoad || _refugeeRoad.hour !== hour) {
      const list = [];
      for (const r of Object.values(getRecords() || {})) {
        const road = r?.refugee?.road;
        if (road && road.from && road.to && nowMinute <= road.end + 60 && nowMinute >= road.start - 60) {
          list.push({ name: r.name, road, group: r.homeGroup });
        }
      }
      _refugeeRoad = { hour, list };
    }
    const out = [];
    for (const e of _refugeeRoad.list) {
      if (out.length >= max) break;
      if (nowMinute < e.road.start || nowMinute > e.road.end) continue;
      const f = Math.max(0, Math.min(1, (nowMinute - e.road.start) / Math.max(1, e.road.end - e.road.start)));
      const pos = { x: e.road.from.x + (e.road.to.x - e.road.from.x) * f, y: e.road.from.y + (e.road.to.y - e.road.from.y) * f };
      if (Math.hypot(pos.x - wx, pos.y - wy) > ROAD_NEAR_TILES) continue;
      out.push({ name: e.name, mode: ROAD_MODES[0], ambient: false, pos,
        heading: unitVector(e.road.to.x - e.road.from.x, e.road.to.y - e.road.from.y),
        from: e.road.from, to: e.road.to, group: e.group, refugee: true });
    }
    return out;
  }
  addTravellerSource(refugeesOnRoad);

  // What the Empathize panel and the social lines read.
  function refugeeStatus(name) {
    const record = getRecords()?.[name];
    const profile = getProfile(name);
    const ref = record?.refugee;
    if (ref) {
      return { from: ref.from, since: ref.since, year: ref.year ?? yearOf(ref.since || 0),
        status: ref.status, integrated: false };
    }
    if (profile?._hordeIntegrated) return { from: null, since: null, year: null, status: null, integrated: true };
    return null;
  }

  // --------------------------------------------------------------------------
  // The displaced a new world starts with (initializer "refugees", order 58)
  // --------------------------------------------------------------------------
  // For every nation the Horde holds on the start date, about 4% of the people
  // living outside the Horde's lands are its refugees: born there, gone in the
  // year the Horde took it (the chronicle says when), living abroad now, a
  // share of them in the wild camps near the border.

  const REFUGEES_INIT_V = 1;

  // The year the Horde took `country`, off its chronicle; its own seat, with
  // nothing written, counts from `fallbackYear`.
  function conquestYear(country, fallbackYear) {
    const hist = window.HistoryManager?.getNationHistory?.(country) || [];
    let year = null;
    for (const entry of hist) {
      const m = /(\d{4})/.exec(String(entry?.date || ""));
      if (!m) continue;
      if (entry.controller === HORDE_POWER) { if (year === null) year = Number(m[1]); }
      else year = null;
    }
    return year !== null ? year : fallbackYear;
  }

  // A named place of `country` to have been born in.
  function placeIn(country, rng) {
    const table = destinationTable() || {};
    const names = Object.keys(table).filter(k => table[k]?.country === country).sort();
    return names.length ? names[Math.floor(rng.next() * names.length)] : country;
  }

  // Born in the Horde's country and gone from it the year it fell: the stays
  // before that year are folded into one, and the first one after it is the
  // flight.
  function rewriteExileHistory(record, origin, fledYear) {
    if (!record) return;
    const stays = Array.isArray(record.locationHistory) ? record.locationHistory : [];
    const born = Number(record.birthYear) || fledYear;
    let keep = stays.filter(s => s && s.fromYear >= fledYear).map(s => Object.assign({}, s));
    if (!keep.length && stays.length) keep = [Object.assign({}, stays[stays.length - 1])];
    if (!keep.length) keep = [{ place: record.currentPlace || placeOfGroup(record.homeGroup) || record.homeGroup, wild: null, toYear: null }];
    keep[0] = Object.assign(keep[0], { fromYear: fledYear, reason: FLED_HORDE });
    const out = [];
    if (born < fledYear) {
      out.push({ place: origin, wild: null, fromYear: born, toYear: fledYear, reason: BORN_HERE });
      record.birthplace = origin;
      record.birthWild = null;
    }
    record.locationHistory = out.concat(keep);
    record.locationHistory[record.locationHistory.length - 1].toYear = null;
  }

  function seedStartingRefugees() {
    const records = getRecords();
    if (!records || !$gameSystem) return 0;
    const hs = hordeState();
    if (hs.startV === REFUGEES_INIT_V) return 0;
    const now = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    hs.clock = now;
    if (isEmptyWorld()) { hs.startV = REFUGEES_INIT_V; return 0; }
    // In a goblin world the Horde is the normal order, not an invader: the
    // nations it holds on the first day were always its own (HistorySimulator
    // applyGoblinWorld), and nobody has fled them.
    if (window.NPCShared?.WorldModes?.hordeIsNormalOrder?.()) { hs.startV = REFUGEES_INIT_V; return 0; }
    const list = window.WorldGen?.Countries;
    const held = [...new Set((Array.isArray(list) ? list : []).map(c => c && c.country).filter(c => c && hordeHolds(c)))];
    const nowYear = yearOf(now);
    if (!held.length) { hs.startV = REFUGEES_INIT_V; return 0; }

    // Everybody outside the Horde's lands, in a seeded order.
    const nationByGroup = new Map();
    const eligible = [];
    let outside = 0;
    for (const record of Object.values(records)) {
      if (!record?.homeGroup || record.nonSentient) continue;
      let c = nationByGroup.get(record.homeGroup);
      if (c === undefined) { c = nationOfHome(record.homeGroup); nationByGroup.set(record.homeGroup, c); }
      if (!c || hordeHolds(c)) continue;
      outside++;
      const profile = getProfile(record.name);
      if (!mayFlee(record, profile)) continue;
      eligible.push({ record, profile, c, key: (nameHash("refugeeStart:" + record.name) ^ worldSeed()) >>> 0 });
    }
    eligible.sort((a, b) => (a.key - b.key) || (a.record.name < b.record.name ? -1 : 1));
    const target = Math.round(outside * START_REFUGEE_SHARE);
    const years = {};
    let seeded = 0;
    for (const e of eligible) {
      if (seeded >= target) break;
      const { record, c } = e;
      if (record.refugee) continue;
      const rng = refugeeRng(record.name, "start");
      const region = regionOfCountry(c);
      const near = held.filter(h => regionOfCountry(h) === region);
      const pool = near.length ? near : held;
      const from = pool[Math.floor(rng.next() * pool.length)];
      if (years[from] === undefined) years[from] = conquestYear(from, nowYear - 10);
      const origin = placeIn(from, rng);
      const householders = refugeeHousehold(record).filter(n => records[n] && !records[n].refugee);
      for (const n of householders) {
        const r = records[n];
        const fledYear = Math.min(nowYear, Math.max(years[from], Number(r.birthYear) || years[from]));
        rewriteExileHistory(r, origin, fledYear);
        r.refugee = {
          from, fromGroup: groupForPlace(origin), since: minuteOfYear(fledYear), year: fledYear,
          status: REFUGEE_SETTLED,
          returnRate: RETURN_RATE_MIN + rng.next() * (RETURN_RATE_MAX - RETURN_RATE_MIN),
          road: null,
        };
        pushLifeEvent(r, minuteOfYear(fledYear), "move", "NPCLife.event.fled",
          { country: from, place: placeLabel(placeOfGroup(r.homeGroup) || r.homeGroup) });
        seeded++;
      }
      // Some of them never found a town: they are in the camps.
      if (rng.next() < START_CAMP_SHARE) {
        const camp = campFor(from, c, householders.length);
        if (camp) {
          window.NPCSystem?.addCampTent?.(camp, householders.length);
          const moved = relocate(record.name, { toGroup: camp, now, reason: FLED_HORDE, force: true, withNames: householders.slice(1) });
          if (moved) {
            for (const n of moved.movers) if (records[n]?.refugee) records[n].refugee.status = REFUGEE_CAMP;
          }
        }
      }
    }
    hs.startV = REFUGEES_INIT_V;
    return seeded;
  }

  if (typeof window !== "undefined" && window.HistoryManager?.onNationChange) {
    window.HistoryManager.onNationChange((change) => {
      try { onNationChanged(change); } catch (e) { console.error("[NPCLifeSim] the Horde's refugees", e); }
    });
  }

  Object.assign(window.NPCLifeSim, {
    refugeeStatus,
    campLabel,
    seedStartingRefugees,
    resolveRefugees,
    resolveSurvivors,
    onHordeConquest,
    integrateIntoHorde,
    REFUGEES: {
      HORDE_POWER, FLED_HORDE, FLIGHT_MIN_DAYS, FLIGHT_MAX_DAYS, INTEGRATED_SHARE,
      RETURN_RATE_MIN, RETURN_RATE_MAX, START_REFUGEE_SHARE, FLIGHT_CAP_PER_GROUP,
      REFUGEE_MONTH_DAYS,
      onNationChanged, fleeHorde, returnHome, campFor, refugeesOnRoad, hordeJobs,
      conquestYear, rewriteExileHistory, stampHordeResident, hordeHolds, mayFlee,
      hordeCrimeMultiplier, resolveCrime,
      resetRoad() { _refugeeRoad = null; },
    },
  });

  if (typeof window !== "undefined" && window.WorldManager?.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("refugees", 58, seedStartingRefugees);
  }

  Object.assign(window.NPCLifeSim._internal, {
    FLED_HORDE, resolveRefugees,
  });
})();
