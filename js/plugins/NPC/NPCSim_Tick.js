/*:
 * @target MZ
 * @plugindesc NPC Simulation: main tick, map resolver, public facade and engine hooks
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Implants
 * @help
 * ============================================================================
 * NPCSim_Tick, part of the NPCSimulationCore family
 * ============================================================================
 * Owns the lazy profile fields (SECTION 11b), the main tick (SECTION 12), the
 * schedule to map resolver (SECTION 11e), the public window.NPCSim facade,
 * the save/load, game time and dialogue hooks (SECTIONS 12b, 13, 15). Loads
 * last: it binds the late names every module reads once the family is in.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Implants.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    _assignHomeBuilding, _getBuildingMapName, _getHomeDescription, _registerBuildingOccupant,
    ActivityPlacer, Addictions, assignHomesOnMap, BehaviorDispatcher, bumpMutualOpinion, BuyManager,
    Children, CrimeManager, DEFAULT_SEED, Dev, economyRng, ensureBuildingResidents, eraTension,
    EventBus, ExpManager, Gear, getBuildingResidents, Implants, InteractionScanner, JobManager,
    JobShiftManager, leaseHolderOf, LeaveManager, MinigamePlay, MiniRng, MONEY_CAP, moveInHousehold,
    moveOut, nameHash, NEED_FILL_PER_SEC, NeedManager, resettle, REST_REGION, RoutineManager,
    satisfyNeedOffscreen, satisfyNeedTick, ScheduleManager, sharesHome, SHIFT_HOURS,
    fixtureKindOfName, fixtureNeeds, keepsBladder,
    ShopShiftManager, SocialLogger, Specs, Stocks, StoryLogger, Tending, ThoughtGenerator, Vehicles,
    Water, WealthManager, WorkServe,
  } = NPCSim._internal;

  // ============================================================================
  // SECTION 11b, LAZY PROFILE FIELDS
  // ============================================================================
  // Profiles are minted lazily, by whichever system meets the person first, so
  // the simulation fills in the fields it needs the first time it looks at one.

  const HOME_POOL_BY_WEALTH = ["houses", "houses", "houses", "skyscrapers", "skyscrapers"];

  // Starting purse, in gold (100 gold = 1 euro).
  //
  // Level is the progression yardstick: an NPC is worth roughly what the party
  // is worth when they meet, because recruiting one adds their whole purse to
  // party funds. Wealth tier then spreads that around by a factor of ~25 from
  // the destitute to the elite, and a per-name roll keeps two neighbours of the
  // same standing from carrying identical amounts. The result lands inside the
  // WEALTH_THRESHOLDS bands above, so an NPC's money still says something about
  // which home pool they belong to (houses under 600 euros, high-rises above).
  const MONEY_PER_LEVEL   = 120;
  const MONEY_LEVEL_BASE  = 150;
  const MONEY_TIER_MULT   = [0.35, 0.7, 1.4, 3.5, 9];

  function rollStartingMoney(profile, name) {
    // A beast starts with nothing and is never dealt a purse (NPCCreature).
    if (profile && window.NPCCreature?.mayHoldMoney?.(profile, name || profile._eventName) === false) return 0;
    const level = Math.max(1, profile?.level ?? 1);
    const tier  = Math.min(Math.max(profile?.wealthTierBase ?? 2, 0), MONEY_TIER_MULT.length - 1);
    const seed  = window.HistoryManager ? window.HistoryManager.getSeed() : DEFAULT_SEED;
    const rng   = new MiniRng(nameHash((name || profile?._eventName || 'npc') + '_money') ^ seed);
    const jitter = 0.7 + rng.next() * 0.6; // 0.7x to 1.3x
    const amount = (MONEY_LEVEL_BASE + level * MONEY_PER_LEVEL) * MONEY_TIER_MULT[tier] * jitter;
    return Math.min(MONEY_CAP, Math.max(0, Math.round(amount)));
  }

  function ensureSimFields(profile, name) {
    if (!profile) return;
    if (profile.hunger === undefined || profile.sleep === undefined || profile.hygiene === undefined ||
        profile.social === undefined || profile.leisure === undefined) {
      // Seed off the NPC's name and the world's history seed so starting needs
      // are deterministic per-save but vary between NPCs and between worlds.
      const _needsSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      const _needsRng  = new MiniRng(nameHash((name || 'npc') + '_needs') ^ _needsSeed);
      if (profile.hunger === undefined)  profile.hunger  = _needsRng.int(40, 100);
      if (profile.sleep  === undefined)  profile.sleep   = _needsRng.int(40, 100);
      if (profile.hygiene === undefined) profile.hygiene = _needsRng.int(40, 100);
      if (profile.social === undefined)  profile.social  = _needsRng.int(40, 100);
      if (profile.leisure === undefined) profile.leisure = _needsRng.int(40, 100);
    }
    // The bladder is seeded on its own (it came after the other five), off
    // the same seed so it is the same per NPC per world.
    // A non-sentient creature keeps no such meter (keepsBladder).
    if (profile.bladder === undefined && keepsBladder(profile)) {
      const _bSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      profile.bladder = new MiniRng(nameHash((name || 'npc') + '_bladder') ^ _bSeed).int(40, 100); // i18n-ignore: rng seed key
    }
    if (profile.currentJobId === undefined) profile.currentJobId = null;
    if (profile.workMapId === undefined)    profile.workMapId = null;
    if (profile.workShift === undefined)    profile.workShift = null;
    if (profile.lastWorkMinute === undefined) profile.lastWorkMinute = 0;
    if (profile.moralityScore === undefined) profile.moralityScore = 0;
    if (profile.currentNeed === undefined)  profile.currentNeed = null;
    if (!Array.isArray(profile.eventLog))   profile.eventLog = [];
    if (!Array.isArray(profile.thoughts))   profile.thoughts = [];
    if (profile.homePoolType === undefined)   profile.homePoolType   = HOME_POOL_BY_WEALTH[Math.min(profile.wealthTierBase || 2, 4)];
    if (profile.playerOpinion === undefined)  profile.playerOpinion  = 0;
    if (profile.assignedClassId === undefined) profile.assignedClassId = null;
    if (profile.level === undefined) {
      const _range = window.NPCSystem?.getLevelRangeForMap?.($gameMap?.mapId()) ?? [1, 20];
      const _worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      const _rng2  = new MiniRng(nameHash((name || 'npc') + '_lvl') ^ _worldSeed);
      profile.level = _rng2.int(_range[0], _range[1]);
      const base = profile.level;
      profile.atk = base * 3; profile.def = base * 3;
      profile.mat = base * 3; profile.mdf = base * 3;
      profile.agi = base * 3; profile.luk = base * 3;
      profile.mhp = base * 30; profile.mmp = base * 15;
      profile.arcane = 0; profile.substance = 0;
      profile.stealth = 0; profile.intimidation = 0;
    }
    // Money is seeded AFTER the level block, it is derived from it. A recruited
    // NPC hands their whole purse to the party (NPCSystemParty.joinParty), so
    // what they carry has to track player progression instead of being a flat
    // per-tier fortune. Anything above the simulation's own ceiling was written
    // by the old flat table (up to 50 million gold, i.e. half a million euros
    // from one recruit) and is re-seeded here.
    if (profile.money === undefined || profile.money > MONEY_CAP)
      profile.money = rollStartingMoney(profile, name);
    // The lazy sanitiser: whatever money a beast is found holding (a world
    // folder written before the rule, a path that forgot to ask) is gone.
    window.NPCCreature?.sanitizeMoney?.(profile, name);
    if (profile.exp === undefined)
      profile.exp = ExpManager.expForLevel(profile.assignedClassId ?? 0, profile.level ?? 1);
    if (profile._lastExpDay === undefined)
      profile._lastExpDay = Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    if (!profile._classSkillsSeeded && profile.assignedClassId) {
      ExpManager.learnClassSkillsUpToLevel(profile, profile.assignedClassId, profile.level ?? 1);
      profile._classSkillsSeeded = true;
    }
    if (profile.markovDb === undefined)        profile.markovDb        = null;
    if (name) profile._eventName = name;
    // Assign a specific procedural building entrance if not yet set.
    // Skip on house maps, the NPC is inside a house, not in its city group.
    if (profile.homeBuilding === undefined && name &&
        !window.NPCSystem?.isHouseMap?.($gameMap?.mapId())) {
      _assignHomeBuilding(profile, name);
      window.NPCSocietyRegistry?.applyHometownOpinionIfMatch?.(profile, profile._homeGroupName);
    }
    // What the person has grown into (SECTION 11b3). Last, because it reads
    // the level, class and job settled above; a bad profile must never break
    // the tick that called here.
    try { Dev.ensure(profile, name); }
    catch (e) { console.error(`[NPCSim] development for "${name}" failed:`, e); }
  }

  // ============================================================================
  // SECTION 12, MAIN TICK
  // ============================================================================

  // Face toward an adjacent Counter tile, if any, called while resting in REST_REGION.
  function _faceCounterTile(ctrl) {
    if (!ctrl.event || !$gameMap) return;
    const x = ctrl.event.x, y = ctrl.event.y;
    const adj = [
      { nx: x,     ny: y - 1, dir: 8 },
      { nx: x,     ny: y + 1, dir: 2 },
      { nx: x - 1, ny: y,     dir: 4 },
      { nx: x + 1, ny: y,     dir: 6 },
    ];
    for (const { nx, ny, dir } of adj) {
      if ($gameMap.isValid(nx, ny) && $gameMap.isCounter(nx, ny)) {
        ctrl.event.setDirection(dir);
        return;
      }
    }
  }

  // Fill sleep for NPCs resting in REST_REGION and orient them toward any adjacent Counter tile.
  function _tickRestingNPCs(controllers, society, deltaMinutes) {
    for (const ctrl of controllers) {
      if (!ctrl.event || ctrl.event._erased) continue;
      if (ctrl.state !== "inZone" && ctrl.state !== "socializing") continue;
      const { x, y } = ctrl.event;
      if ($gameMap.regionId(x, y) !== REST_REGION) continue;
      const profile = society[ctrl.eventName];
      if (!profile) continue;
      profile.sleep = Math.min(100, (profile.sleep ?? 0) + NEED_FILL_PER_SEC.sleep * deltaMinutes * 60);
      _faceCounterTile(ctrl);
    }
  }

  // Shift pay (JobManager.payHours). Off-screen a worker earns an hour's pay
  // (basePay / duration) for every whole hour worked since they were last
  // paid, up to the end of the shift, however seldom the background chunk
  // reaches them. A worker on the current map is paid once, when the shift
  // ends: the open shift is remembered here and settled the first tick they
  // are off it (the controller and the dispatcher settle it too, and the
  // per-shift record means it is only ever paid once).
  function _workPay(profile, name, minute, onMap) {
    if (!profile?.currentJobId) return;
    const SHIFT_MIN = SHIFT_HOURS * 60;
    const working = profile.currentNeed === "work";
    if (onMap) {
      if (working) {
        profile._shiftOpenKey = JobManager.shiftKeyAt(minute);
      } else if (profile._shiftOpenKey != null) {
        JobManager.settleShift(profile, name, profile._shiftOpenKey);
        profile._shiftOpenKey = null;
      }
      return;
    }
    let key;
    if (working) {
      key = JobManager.shiftKeyAt(minute);
    } else {
      key = JobManager.lastShiftKey(profile, minute);
      if (profile._shiftOpenKey === key) {
        JobManager.settleShift(profile, name, key);
        profile._shiftOpenKey = null;
        return;
      }
      // Only the tail of a shift already begun off-screen, and never the
      // hours of a leave that cut it short.
      if (profile._shiftPay?.key !== key || LeaveManager.active(profile)) return;
    }
    const start = key * SHIFT_MIN;
    const end = Math.min(minute, start + SHIFT_MIN);
    const from = Math.max(profile.lastWorkMinute || 0, start);
    const hours = Math.floor((end - from) / 60);
    if (hours >= 1) {
      profile.lastWorkMinute = from + hours * 60;
      JobManager.payHours(profile, name, hours, key);
    }
  }

  let _lastTickMinute = -1;
  let _lastHistoryFeedMinute = -1;
  const HISTORY_FEED_INTERVAL = 60 * 24 * 7; // once per in-game week

  // Chunked iteration: process at most this many background profiles per tick
  // so large saves don't stall the frame.
  const BACKGROUND_CHUNK = 60;
  let _chunkOffset = 0;

  // The tick runs once a game hour (see the Game_Map.update hook): an NPC is
  // given their need for the hour and the activity it sends them on, and keeps
  // at it until the next hour turns. Sending every controller on the map off
  // in the tick's own frame launched every one of their path searches at once,
  // a hitch each time the hour (it used to be each minute) went by while
  // walking. The controllers are queued instead and sent a few a frame, oldest
  // first, so a long queue is still served in full however quickly the hours
  // run (sleep, fast travel).
  const DISPATCH_PER_FRAME = 3;
  const _dispatchQueue = new Set();
  function drainDispatchQueue(society) {
    if (!_dispatchQueue.size) return;
    let sent = 0;
    for (const ctrl of _dispatchQueue) {
      _dispatchQueue.delete(ctrl);
      if (!ctrl.event || ctrl.event._erased) continue;
      const profile = society?.[ctrl.eventName];
      if (!profile) continue;
      BehaviorDispatcher.dispatch(ctrl, profile);
      if (++sent >= DISPATCH_PER_FRAME) break;
    }
  }

  // ============================================================================
  // SECTION 11e, SCHEDULE → MAP RESOLVER
  // ============================================================================
  // Decides *which map within a group* an NPC should currently be found on,
  // purely from their schedule, so NPCSystem can place each NPC on a map that
  // matches what they're doing this hour instead of scattering the pool at
  // random. The mapping mirrors the in-map BehaviorDispatcher destinations:
  //
  //   • work shift  → their assigned work map (already-implemented behaviour,
  //                   preserved here so working NPCs are only ever found there)
  //   • shop shift  → the map of the <Shop> counter they're covering
  //   • social hour → one of the group's main maps (the social hub)
  //   • everything else (sleep/rest, hygiene, meals, leisure, money, errands)
  //                 → their home map, the residential map their front door and
  //                   rest zone (region 102) live on, where _handleSleep then
  //                   walks them home / to the nearest rest tile.
  //
  // Deterministic given (name, hour): the result is computed once per in-game
  // hour by NPCSystem and cached, so walking between a group's maps within the
  // same hour never reshuffles who is where. NPCs with no profile yet (or whose
  // home lies outside this group) fall back to a stable hash-picked group map.
  // Group maps that host at least one registered shop/vendor event, read from
  // the world NPC cache (NPCResidents.json "__shops", via NPCSystem.getShopIndex).
  // Memoized per group for the session.
  const _groupShopMapsCache = {};
  function _groupShopMaps(groupName, group) {
    if (_groupShopMapsCache[groupName]) return _groupShopMapsCache[groupName];
    const out = [];
    for (const mId of (group?.maps || [])) {
      const idx = window.NPCSystem?.getShopIndex?.(mId) || [];
      if (idx.length) out.push(mId);
    }
    _groupShopMapsCache[groupName] = out;
    return out;
  }

  // Where somebody goes to see people: their partner's street first, then a
  // close friend's (opinion 40 or better), then kin's. Picked per hour off a
  // seeded roll so an afternoon is not spent on one doorstep. Null when none
  // of them lives in this town.
  function _socialMapFor(name, profile, inGroup, hourSalt) {
    const society = $gameSystem?._npcSociety || {};
    const homeOf = (n) => {
      const p = society[n];
      if (!p) return null;
      const m = p._resident ? (p._residentHomeMap || p.homeBuilding?.mapId) : p.homeBuilding?.mapId;
      return inGroup(m) ? m : null;
    };
    const tiers = [];
    const rec = window.NPCLifeSim?.getRecord?.(name);
    const partners = [];
    if (rec?.partner?.name && !rec.partner.external) partners.push(rec.partner.name);
    for (const p of (rec?.partners || [])) if (p?.name && !p.external && !partners.includes(p.name)) partners.push(p.name);
    tiers.push(partners);
    const friends = Object.entries(profile?.relationships || {})
      .filter(([, r]) => (r?.opinion ?? 0) >= 40)
      .sort((a, b) => (b[1].opinion - a[1].opinion) || (a[0] < b[0] ? -1 : 1))
      .slice(0, 6).map(([n]) => n);
    tiers.push(friends);
    tiers.push(Object.keys(rec?.kin || {}));
    const roll = (nameHash(name + "_visit") ^ (hourSalt * 374761393)) >>> 0;
    for (const tier of tiers) {
      const maps = tier.map(homeOf).filter(Boolean);
      if (maps.length) return maps[roll % maps.length];
    }
    return null;
  }

  function scheduledMapForNPC(name, groupName, hour) {
    if (!name) return null;
    const group = $gameSystem?._npcMapGroups?.[groupName];
    const maps  = group?.maps;
    if (!maps || !maps.length) return null;
    const fallback = () => maps[(nameHash(name) >>> 0) % maps.length];

    // Runs inside the map-setup path for every pool NPC, a throw here (bad
    // profile, missing data...) must never break map loading, so degrade to
    // the deterministic fallback map instead of propagating.
    try {
      let profile = $gameSystem?._npcSociety?.[name];
      if (!profile) profile = window.NPCSocietyRegistry?.ensureProfile?.(name) ?? null;
      if (!profile) return fallback();

      ensureSimFields(profile, name);
      // Make sure work map/shift are resolved so "work" can route correctly.
      if (profile.currentJobId === null) JobManager.assignJob(profile);

      if (hour == null) hour = $gameVariables?.value(23) ?? 12;
      const inGroup  = (mId) => mId && maps.includes(mId);
      // A child is at home, at school or at play (SECTION 11b4); a newborn
      // never leaves the family home.
      if (Children.isMinor(profile, name)) {
        return Children.scheduledMap(profile, name, groupName, group, hour, inGroup) ?? fallback();
      }
      const activity = ScheduleManager.evaluate(profile, hour);

      if (activity === "work" && inGroup(profile.workMapId)) return profile.workMapId;

      // A beast keeps to its home ground (the wilds round it): never a shop, a
      // friend's street, a square or the games. A shift is the one exception,
      // where beasts work (above and below).
      if (activity !== "shopwork" && window.NPCCreature?.isHeldToBeastRules?.(profile, name)) {
        const den = profile._resident ? (profile._residentHomeMap || profile.homeBuilding?.mapId) : profile.homeBuilding?.mapId;
        return inGroup(den) ? den : fallback();
      }

      if (activity === "shopwork") {
        const a = $gameSystem?._npcShopAssignments?.[name];
        if (a && inGroup(a.mapId)) return a.mapId;
      }

      // Off shift every hour has a place (Phase E): a shop map to go shopping
      // on, a friend's street to go and see them on, and one of the town's
      // squares for an hour of leisure. A resident keeps to their own street
      // otherwise, and so does anybody when the town has no such map.
      const home = profile._resident
        ? (inGroup(profile._residentHomeMap) ? profile._residentHomeMap
          : inGroup(profile.homeBuilding?.mapId) ? profile.homeBuilding.mapId : null)
        : (inGroup(profile.homeBuilding?.mapId) ? profile.homeBuilding.mapId : null);
      const hourSalt = Math.floor(hour);

      if (activity === "shopping") {
        const shopMaps = _groupShopMaps(groupName, group);
        if (shopMaps.length) {
          const s = (nameHash(name) ^ (hourSalt * 40503)) >>> 0;
          return shopMaps[s % shopMaps.length];
        }
      }

      if (activity === "social") {
        // The town's public gathering: everybody at it is on the same square.
        const venue = window.NPCGatherings?.venueFor?.(groupName, group, name, hour);
        if (venue && inGroup(venue)) return venue;
        const visit = _socialMapFor(name, profile, inGroup, hourSalt);
        if (visit) return visit;
        if (group.mainMaps?.length) {
          const s = (nameHash(name) ^ (hourSalt * 2654435761)) >>> 0;
          return group.mainMaps[s % group.mainMaps.length];
        }
      }

      // A gambler's free hours are spent at the town's casino, and one free
      // hour in three at a map with games on it (SECTION 11b5b).
      // Read off the export so the resolver also runs lifted out on its own.
      const Addict = window.NPCSim?.Addictions;
      if (activity === "leisure" && Addict) {
        const casino = Addict.casinoMapFor(name, profile, groupName, group, hourSalt);
        if (casino) return casino;
        const venue = Addict.venueMapFor(name, groupName, group, hourSalt);
        if (venue && inGroup(venue)) return venue;
      }

      // Half the free hours are spent out on one of the town's squares.
      if (activity === "leisure" && group.mainMaps?.length) {
        const s = (nameHash(name + "_out") ^ (hourSalt * 2246822519)) >>> 0;
        if (s % 2 === 0) return group.mainMaps[(s >>> 1) % group.mainMaps.length];
      }

      if (profile._resident) return home || fallback();

      const homeMap = profile.homeBuilding?.mapId;
      if (inGroup(homeMap)) return homeMap;
      return fallback();
    } catch (e) {
      console.error(`[NPCSim] scheduledMapForNPC failed for "${name}":`, e);
      return fallback();
    }
  }

  Object.assign(NPCSim, {
    // What an NPC of this level and wealth tier carries, in gold. Exposed so the
    // recruit path can price an NPC that has no simulated profile the same way.
    rollStartingMoney(profile, name) { return rollStartingMoney(profile, name); },

    tick(currentMinute) {
      if (currentMinute === _lastTickMinute) return;
      // Nobody to simulate (WorldModes.simulatesPeople: empty, death): the
      // tick costs one question.
      const WMo = window.NPCShared?.WorldModes;
      if (WMo && !WMo.simulatesPeople()) { _lastTickMinute = currentMinute; return; }
      const delta = Math.max(1, Math.min(60, currentMinute - (_lastTickMinute < 0 ? currentMinute - 1 : _lastTickMinute)));
      _lastTickMinute = currentMinute;

      const society = $gameSystem?._npcSociety;
      if (!society) return;

      // Use variable 23 (sky-phase / current hour) exactly as NPCSociety's mood system does.
      // Computing hour from minute 0 (RMMZ default before TimeDateSystem runs) would force
      // hour=0 → every NPC scheduled to sleep on the very first tick.
      const hour = ($gameVariables?.value(23)) ?? 12; // default noon if not yet initialised
      const hourIndex = Math.floor(currentMinute / 60);

      // Build on-map name set once per tick for fast lookup
      const onMapSet = new Set(
        ($gameSystem.getActiveNPCControllers?.() || []).map(c => c.eventName)
      );

      // Chunked background simulation, rotate through all profiles over multiple ticks
      const allNames   = Object.keys(society);
      const chunkStart = _chunkOffset % Math.max(1, allNames.length);
      const chunkEnd   = Math.min(chunkStart + BACKGROUND_CHUNK, allNames.length);
      _chunkOffset     = chunkEnd >= allNames.length ? 0 : chunkEnd;

      const chunkNames = allNames.slice(chunkStart, chunkEnd);
      const chunkSet = new Set(chunkNames);
      // The people of the Omega Tower's floors stand still while the party is
      // off the tower's levels (NPCShared.towerIdle), and count their days on
      // the tower's own clock (NPCShared.towerTime), never on Earth's.
      const towerIdle = window.NPCShared?.towerIdle?.() || null;
      const tower = window.NPCShared?.towerTime?.() || null;

      for (const name of chunkNames) {
        const profile = society[name];
        if (!profile) continue;
        if (towerIdle && !onMapSet.has(name) && towerIdle.group(profile._homeGroupName)) continue;
        ensureSimFields(profile, name);

        NeedManager.update(profile, delta);
        // Hungry and nowhere near a meal: a bite of what they carry (SECTION 11b5).
        Gear.eatFromHand(profile, name);
        profile.currentNeed = ScheduleManager.evaluate(profile, hour);
        RoutineManager.noteActual(profile, hour, profile.currentNeed);
        // Attend to the current need off-screen so meters recover, not just drain.
        satisfyNeedOffscreen(profile, profile.currentNeed, delta);
        // Cravings, fixes and withdrawal (SECTION 11b5b).
        Addictions.tick(profile, name, onMapSet.has(name), currentMinute);

        // Assign job once
        if (profile.currentJobId === null) JobManager.assignJob(profile);

        // Shift pay: by the hour off-screen, settled at the end on the map.
        _workPay(profile, name, currentMinute, onMapSet.has(name));

        // Thoughts: on-map NPCs muse a little more often than the rest (their
        // thought is the one that pops a bubble, and a street where every face
        // is thinking out loud at once is unreadable), off-screen ones keep the
        // slower cadence since nobody is there to read it. Each NPC gets a
        // per-name offset so they don't all land on the same tick.
        // One tick is a game hour: on the map that is one thought each, off it
        // one hour in four, staggered by name.
        if (onMapSet.has(name) || (hourIndex + nameHash(name)) % 4 === 0) ThoughtGenerator.generate(profile);

        // Wealth → home pool upgrade when money crosses tier thresholds
        WealthManager.maybeUpgrade(profile);

        // Daily EXP gain (once per in-game day)
        const _onTower = !!tower && tower.group(profile._homeGroupName);
        const _today = Math.floor((_onTower ? tower.now : currentMinute) / 1440);
        // Every day since the last one seen is paid, so a skip of a week is a
        // week of experience rather than one day of it.
        if (profile._lastExpDay !== _today) {
          const _days = _today - (profile._lastExpDay ?? _today);
          profile._lastExpDay = _today;
          if (_days > 0) ExpManager.gainExpDays(profile, name, _days);
        }

        // Once a game day, a worker who has fallen ill goes on sick leave
        // (SECTION 11d2).
        if (profile._leaveCheckDay !== _today) {
          profile._leaveCheckDay = _today;
          LeaveManager.checkSick(profile, name);
        }
      }

      // Always process on-map NPCs (regardless of chunk)
      for (const name of onMapSet) {
        const profile = society[name];
        if (!profile || chunkSet.has(name)) continue; // already processed
        ensureSimFields(profile, name);
        NeedManager.update(profile, delta);
        Gear.eatFromHand(profile, name);
        profile.currentNeed = ScheduleManager.evaluate(profile, hour);
        RoutineManager.noteActual(profile, hour, profile.currentNeed);
        satisfyNeedOffscreen(profile, profile.currentNeed, delta);
        Addictions.tick(profile, name, true, currentMinute);
        if (profile.currentJobId === null) JobManager.assignJob(profile);
        _workPay(profile, name, currentMinute, true);
        ThoughtGenerator.generate(profile);
      }

      // Log NPC social meetings, and queue the on-map controllers to be sent
      // on the hour's need, a few a frame (drainDispatchQueue).
      const controllers = $gameSystem.getActiveNPCControllers?.() || [];
      SocialLogger.scanMeetings(controllers, society);
      for (const ctrl of controllers) _dispatchQueue.add(ctrl);

      // Fill sleep and orient toward Counter tiles for NPCs resting in region 102
      _tickRestingNPCs(controllers, society, delta);

      // Feed HistorySimulator once per week
      if (currentMinute - _lastHistoryFeedMinute >= HISTORY_FEED_INTERVAL) {
        _lastHistoryFeedMinute = currentMinute;
        StoryLogger.feedHistorySimulator();
      }

      // Swap sprites for <Shop> events based on time of day
      ShopShiftManager.updateSprites();
    },

    on: EventBus.on.bind(EventBus),
    emit: EventBus.emit.bind(EventBus),
    // 0 (calm, <=2010) .. 1 (max chaos, 2012). Shared with NPCSystem.js so the
    // road to 2012 frays both the off-screen sim and on-map NPC reactions.
    eraTension,
    satisfyNeedTick,
    // What a washroom fixture is, off its event name: "wc", "shower", "bath",
    // "sink", "washroom", "fountain" or null, and the needs it answers.
    fixtureKind: fixtureKindOfName,
    fixtureNeeds,
    // Sends the queued on-map controllers on their need, a few a frame.
    drainDispatch() { drainDispatchQueue($gameSystem?._npcSociety); },
    DISPATCH_PER_FRAME,
    NeedManager,
    ScheduleManager,
    BehaviorDispatcher,
    JobManager,
    WealthManager,
    SocialLogger,
    InteractionScanner,
    CrimeManager,
    ThoughtGenerator,
    StoryLogger,
    ensureSimFields,
    ShopShiftManager,
    JobShiftManager,
    // Sick and parental leave (SECTION 11d2): Leave.start(name, kind, days),
    // Leave.startParental(name, role), Leave.isOnLeave(name).
    Leave: LeaveManager,
    // Customers served at work (SECTION 9c).
    WorkServe,
    // NPCs at the arcade, the tables and the bookmaker's (SECTION 9d).
    MinigamePlay,
    ExpManager,
    // Lazy per-profile development (SECTION 11b3) and the specializations
    // that grow with level.
    Dev,
    Specs,
    // Gear, artifacts and food in hand (SECTION 11b5), and the shop purchases
    // that feed them (SECTION 9b).
    Gear,
    BuyManager,
    // Cravings, fixes, withdrawal and the casino (SECTION 11b5b).
    Addictions,
    // Company shares held by NPCs, at the stock terminal's prices (SECTION 11a2).
    Stocks,
    // The bike or broom a person owns and rides (SECTION 11b6).
    Vehicles,
    // Implants and prosthetics (SECTION 11b7).
    Implants,
    // Swimming and fishing (SECTION 6b).
    Water,
    // Schedule → map resolver (SECTION 11e): which group map an NPC belongs
    // on this hour, given their routine/job/shop schedule. Used by NPCSystem's
    // group-assignment pass so spawn maps follow each NPC's schedule.
    scheduledMapForNPC,
    // Symmetric NPC↔NPC opinion adjustment (used by purchases and by
    // NPCEmpathize's join-party bonding).
    bumpMutualOpinion,

    // Bust resolver: returns the bust image name for an NPC event, or null.
    // Priority: profile._bustName (seed-randomized) → derived from the
    // profile's spriteKey (so remote NPCs opened from the wiki/web graph
    // resolve too, _applySocietySprite only runs for on-map events) →
    // null (caller falls back to SpritesAssociation).
    getBustForNPC(eventName) {
      const profile = $gameSystem?._npcSociety?.[eventName];
      if (!profile) return null;
      if (profile._bustName) return profile._bustName;
      if (profile.spriteKey) {
        const entry = window._NPCSocietyDataLoader?.npcData?.[profile.spriteKey];
        const bust  = entry?.busts?.[profile.bustIndex ?? 0] ?? entry?.busts?.[0];
        if (bust) {
          profile._bustName = bust; // cache like _applySocietySprite does
          return bust;
        }
      }
      return null;
    },

    // Returns true when ev has <Shop> tag and is currently staffed by a
    // "covering" persona rather than its own defined identity, which of the
    // three 8-hour shifts that is gets decided per-event by ShopShiftManager.
    isShopShiftCovered(ev) {
      if (!ShopShiftManager.isShopEvent(ev) || !$gameMap) return false;
      return !!ShopShiftManager.getActivePersona($gameMap.mapId(), ev.eventId());
    },

    // Returns the active covering persona's data { spriteName, charIdx, name, bust, markovDb },
    // or null when the event is currently showing its own defined identity.
    getShopShiftData(evName, mapId, evId) { return ShopShiftManager.getActivePersona(mapId, evId); },

    // The name of the person actually standing at this event right now. A
    // <Shop> counter is manned in shifts, so its event name ("Shop", "Bar",
    // ...) is the name of the fixture and not of anybody; whoever is covering
    // the current shift outranks it. Everything the player reads or that keys
    // a society profile off an event should go through here.
    npcNameForEvent(ev) {
      if (!ev) return '';
      const persona = this.isShopShiftCovered(ev)
        ? ShopShiftManager.getActivePersona($gameMap.mapId(), ev.eventId())
        : null;
      return persona?.name || ev.event()?.name?.trim() || '';
    },

    // Personal daily routines (see SECTION 3b), exposed so UI plugins like
    // NPCEmpathize can render past/planned activity timelines on demand.
    RoutineManager,

    // Instantly relocates freshly-spawned, idle NPCs into whatever activity
    // their current need/routine says they should be doing right now (see
    // SECTION 3c), called once per map load, after spawning completes.
    placeNPCsInActivities() { ActivityPlacer.placeOnMapLoad(); },

    // Home-building registry (SECTION 11a-i), used by NPCSystem when the player
    // walks into a generated building: ensureBuildingResidents assigns the town's
    // NPCs to it, getBuildingResidents reads them back per floor.
    ensureBuildingResidents,
    getBuildingResidents,
    // Gives a named set of NPCs the doors of one specific map as their address,
    // used by Omega City's fifty-citizen spawn pass (SECTION 11a-i).
    assignHomesOnMap,
    // A procedural household moved into one floor together (NPCSystem.js).
    moveInHousehold,
    // Leaving a shared home after a split, and who holds it (NPCLifeSim FAMILY).
    moveOut,
    sharesHome,
    leaseHolderOf,
    // A new home in another town (NPCLifeSim RELOCATION).
    resettle,
    // A child's day (SECTION 11b4).
    Children,
    // Plots, pens and the party's hive looked after by the town (SECTION 7).
    Tending,
    // True while the NPC is inside a job or shop-counter shift: they do not go
    // to bed or bed down on the street in the middle of one.
    isOnShift(name, profile, hour) {
      if (!profile && name && $gameSystem?._npcSociety) profile = $gameSystem._npcSociety[name];
      if (!profile) return false;
      if (hour == null) hour = $gameVariables?.value(23) ?? 12;
      try {
        return !!(ScheduleManager._inWorkHours(profile, hour) || ScheduleManager._inShopShift(profile, hour));
      } catch (e) { return false; }
    },
    // The next place a worker on shift moves to (NPCSystem's working state):
    // another of their job's work spots on this map, not the one they are at
    // (`lastId`). Null keeps them where they are: a counter shift, or a job
    // with only the one spot here.
    nextWorkSpot(name, fromEvent, lastId) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile || !$gameMap) return null;
      if ($gameSystem?._npcShopAssignments?.[name] && !profile.currentJobId) return null;
      const job = JobManager.getJob(profile);
      if (!job) return null;
      // A beekeeper's or a brewer's shift goes to the hive or the barrel
      // nobody has minded first (SECTION 7).
      const care = Tending.workTarget(name, profile, fromEvent, lastId);
      if (care) return care;
      const spots = InteractionScanner.findWorkSpots(job, fromEvent).slice(0, 4)
        .filter(ev => ev.eventId?.() !== lastId);
      if (!spots.length) return null;
      const rng = economyRng(name, "workspot");
      return spots[Math.floor(rng.next() * spots.length)];
    },
    // Paid by the hour off-screen, settled at the end on the map (see _workPay).
    workPay: _workPay,
    // The controller has run out of things to do (NPCSystem decideNextGoal):
    // send it on its current need again, at most once per retry wait. True
    // when that gave it somewhere to go, so the caller does not also pick a
    // wander on top of it.
    redispatch(controller, profile) {
      if (!controller || !profile || !profile.currentNeed) return false;
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (now < (controller._redispatchAt || 0)) return false;
      controller._redispatchAt = now + BehaviorDispatcher.RETRY_MIN_MS +
        Math.floor(Math.random() * (BehaviorDispatcher.RETRY_MAX_MS - BehaviorDispatcher.RETRY_MIN_MS));
      // Sleep and work have their own ways of being sought (the bed search,
      // the working loop), and the controller asks for those itself.
      if (profile.currentNeed === "sleep") return false;
      const before = controller.state;
      controller.state = "idle";
      try {
        BehaviorDispatcher.dispatch(controller, profile, true);
      } catch (e) {
        console.error("[NPCSim] redispatch failed:", e);
      }
      if (controller.state === "idle") { controller.state = before; return false; }
      return true;
    },
    // The one sleep window (RoutineManager.sleepWindow): true while `name`
    // (or `profile`) is in the hours they sleep. `hour` defaults to the clock.
    isSleepHour(name, profile, hour) {
      if (!profile && name && $gameSystem?._npcSociety) profile = $gameSystem._npcSociety[name];
      const h = hour == null ? RoutineManager.hourNow() : hour;
      return RoutineManager.isSleepHour(profile || null, h);
    },
    isNPCAtHome(name, profile, hour) {
      if (!profile && name && $gameSystem?._npcSociety) profile = $gameSystem._npcSociety[name];
      if (!profile) return false;
      // Somebody away on a trip is not at home, whatever the hour says: their
      // house is in another town. They are in an inn, and answering "at home"
      // here would quietly delete them from every roster after dark.
      if (window.NPCLifeSim?.isAwayFromTown?.(name)) return false;
      if (profile.isHomeless || !profile.homeBuilding) return false;

      if (hour == null) hour = RoutineManager.hourNow();

      // 1. Is the NPC working right now?
      const inWork = ScheduleManager._inWorkHours(profile, hour);
      const inShop = ScheduleManager._inShopShift(profile, hour);
      if (inWork || inShop) return false;

      // 2. Asleep: their own window (RoutineManager.sleepWindow), a night
      // worker's in the day. The evening before bed is theirs to spend out.
      if (RoutineManager.isSleepHour(profile, hour)) return true;

      // 3. Otherwise what the hour is for.
      const activity = ScheduleManager.evaluate(profile, hour);
      if (activity === "sleep" || activity === "home" || activity === "hygiene" || activity === "comfort") {
        return true;
      }
      // A meal is mostly eaten at home; a free hour is mostly spent out.
      if (activity === "leisure" || activity === "hunger") {
        const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
        const seed = (nameHash(name + '_homeDay_' + Math.floor(hour)) ^ ws) >>> 0;
        return (seed % 100) < (activity === "hunger" ? 65 : 30);
      }

      return false;
    },
    getBuildingMapName: _getBuildingMapName,
    getHomeDescription: _getHomeDescription,
  });

  // An unattended till has nobody to open a shop, answer a question or be
  // empathised with, so pressing on it does nothing. Its shelf is still
  // there for the Stealing menu, which reads the page without running it.
  const _Game_Event_start_unattended = Game_Event.prototype.start;
  Game_Event.prototype.start = function () {
    if (ShopShiftManager.isUnattendedEvent(this)) return;
    _Game_Event_start_unattended.call(this);
  };

  // ============================================================================
  // SECTION 12b, SAVE / LOAD HOOKS
  // ============================================================================

  const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;
  Game_System.prototype.onAfterLoad = function () {
    _Game_System_onAfterLoad?.call(this);

    // Reset tick counters so first tick after load uses delta=1 instead of
    // a huge jump that would instantly drain all NPC needs.
    _lastTickMinute      = -1;
    _lastHistoryFeedMinute = -1;
    _chunkOffset         = 0;

    // Bring every profile in the save up to the fields the simulation reads.
    // Rebuild building occupant registry from existing profiles so capacity
    // tracking stays accurate after loading a save.
    this._npcBuildingOccupants = {};
    const society = this._npcSociety;
    if (society) {
      for (const [name, profile] of Object.entries(society)) {
        ensureSimFields(profile, name);
        if (profile.homeBuilding) {
          // Homes saved before buildings were keyed by town carry no group, so
          // backfill it from the profile: without it the rebuilt occupancy would
          // land in a different bucket than a fresh assignment and the building
          // could be over-filled once.
          if (!profile.homeBuilding.groupName && profile._homeGroupName) {
            profile.homeBuilding.groupName = profile._homeGroupName;
            delete profile.homeBuilding.key;
          }
          _registerBuildingOccupant(profile.homeBuilding, name);
        }
      }
    }
  };

  // ============================================================================
  // SECTION 13, HOOK INTO GAME TIME (TimeDateSystem variable 114)
  // ============================================================================

  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function (mapId) {
    _Game_Map_setup.call(this, mapId);
    ShopShiftManager.resetMapCache();
    // The controllers queued for dispatch belonged to the map left behind.
    _dispatchQueue.clear();
    // Whether this map holds games, for the leisure routing (SECTION 11b5b).
    try { Addictions.learnVenue(mapId); } catch (_) { /* never breaks a map load */ }
  };

  const _Game_Map_update = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update.call(this, sceneActive);
    if (!sceneActive) return;
    // Once a game hour, not once a minute: every ten steps walked used to
    // pay for a whole tick. An NPC does one thing an hour.
    tickOnTheHour($gameVariables ? $gameVariables.value(114) : 0);
    NPCSim.drainDispatch();
  };

  // The tick, once per game hour whoever asks: the map's update above, or a
  // screen that keeps the clock running without the map (the PC, see
  // TimeDateSystem.runRealtimeClock). The hour is kept on $gameMap so both
  // agree on which hour was last run.
  function tickOnTheHour(minute) {
    if (!$gameMap) return;
    const hourIndex = Math.floor(minute / 60);
    if (hourIndex === $gameMap._lastNPCSimHour) return;
    $gameMap._lastNPCSimHour = hourIndex;
    NPCSim.tick(minute);
  }
  NPCSim.tickOnTheHour = tickOnTheHour;

  // ============================================================================
  // SECTION 15, DIALOGUE HOOKS: thought balloon + player opinion
  // ============================================================================

  const _Window_Message_startMessage = Window_Message.prototype.startMessage;
  Window_Message.prototype.startMessage = function () {
    _Window_Message_startMessage.call(this);
    if ($gameMessage._npcSimHandled) return;
    $gameMessage._npcSimHandled = true;

    const interp = $gameMap?._interpreter;
    const evId   = interp?.eventId?.();
    if (!evId) return;
    const ev = $gameMap.event(evId);
    if (!ev) return;
    const npcName = ev.event()?.name;
    if (!npcName) return;
    const profile = $gameSystem?._npcSociety?.[npcName];
    if (!profile) return;

    // Track player familiarity: increment opinion per conversation
    profile.playerOpinion = Math.min(100, (profile.playerOpinion ?? 0) + 2);
  };

  const _Game_Message_clear = Game_Message.prototype.clear;
  Game_Message.prototype.clear = function () {
    _Game_Message_clear.call(this);
    this._npcSimHandled = false;
  };

  // SpritesAssociation → NPCs.json migration is handled by DataService.js
  // which rebuilds window.Sprites.SpritesAssociation from window.WorldGen.NPCs
  // before any plugin IIFE captures the reference. No proxy needed here.

  Object.assign(NPCSim._internal, {
    ensureSimFields,
  });
  // Live state other modules read: always the current value, never a copy.
  Object.defineProperty(NPCSim._internal, "_lastTickMinute", { get: () => _lastTickMinute, enumerable: true });

  // The whole family is in: hand every module the names it reads late.
  for (const bind of NPCSim._internal._late) bind();

  console.log("[NPCSimulationCore] Loaded, autonomous society simulation active.");
})();
