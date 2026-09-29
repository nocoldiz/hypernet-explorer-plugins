/*:
 * @target MZ
 * @plugindesc NPC Simulation: what the map offers and how a person goes after it
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Routine
 * @help
 * ============================================================================
 * NPCSim_Behavior, part of the NPCSimulationCore family
 * ============================================================================
 * Owns InteractionScanner (SECTION 5), the catalogue of what each event on
 * the map is good for, and BehaviorDispatcher (SECTION 6), which sends a
 * person after their current need.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Routine.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    EventBus, FARMING_TRAITS, findPassable,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let
    _emitCrimeThought, Addictions, CrimeManager, ensureTraits, hordeChaosHere, JobManager,
    MinigamePlay, Tending;
  NPCSim._internal._late.push(() => ({
    _emitCrimeThought, Addictions, CrimeManager, ensureTraits, hordeChaosHere, JobManager,
    MinigamePlay, Tending,
  } = NPCSim._internal));
  // SECTION 6b, WATER (Phase R).
  const { MiniRng, nameHash, RoutineManager, satisfyNeedTick, ScheduleManager } = NPCSim._internal;
  let Children, Specs, StoryLogger, ThoughtGenerator;
  NPCSim._internal._late.push(() => ({ Children, Specs, StoryLogger, ThoughtGenerator } = NPCSim._internal));

  // ============================================================================
  // SECTION 5, INTERACTION SCANNER
  // ============================================================================

  // Work spots (findWorkSpots): what is never one, and the fittings any
  // worker can busy themselves at when their trade names nothing on the map.
  // i18n-ignore-start: event-name keywords, authored in English
  const WORK_SPOT_SKIP = /\b(door|house|home|transfer|exit|stairs?|teleport|npc|placeholder|steal)\b/;
  const WORK_SPOT_FURNITURE = /\b(desk|table|counter|shelf|shelves|stove|oven|workbench|bench|machine|computer|pc|terminal|register|till|cabinet|crate|barrel|bookshelf|display|sink)\b/;
  // i18n-ignore-end

  const InteractionScanner = {
    // One shared per-(sim-tick, map) snapshot of the live events, with each
    // event's name/note lowercased once. All the need-driven scanners below
    // iterate this instead of each re-filtering $gameMap.events() and
    // re-reading every event's name/note on every dispatch. Built lazily on
    // first use per sim tick (keyed by _lastTickMinute); a mid-tick spawn is
    // therefore only picked up on the next tick, matching the sim's per-tick
    // dispatch cadence.
    _tickIndex: null,

    _index() {
      const tick  = NPCSim._internal._lastTickMinute;
      const mapId = $gameMap ? $gameMap.mapId() : -1;
      const cur = this._tickIndex;
      if (cur && cur.tick === tick && cur.mapId === mapId) return cur.events;
      const events = [];
      if ($gameMap) {
        for (const ev of $gameMap.events()) {
          if (!ev || ev._erased) continue;
          const data = ev.event();
          const name = data?.name || "";
          const note = data?.note || "";
          events.push({ ev, name, nameLower: name.toLowerCase(), note, noteLower: note.toLowerCase() });
        }
      }
      this._tickIndex = { tick, mapId, events };
      return events;
    },

    // filterFn receives a precomputed index record { ev, name, nameLower, note, noteLower }
    _scanEvents(filterFn) {
      if (!$gameMap) return [];
      const out = [];
      for (const rec of this._index()) if (filterFn(rec)) out.push(rec.ev);
      return out;
    },

    findFood() {
      return this._scanEvents(rec => {
        const name = rec.nameLower;
        // Shops are identified by the <Shop> note tag, not the event name.
        return name.includes("vending") || name.includes("food") ||
               !!window.NPCSystem?.hasShopTag?.(rec.note);
      });
    },

    findLeisure() {
      return this._scanEvents(rec => {
        const name = rec.nameLower;
        const note = rec.noteLower;
        return name.includes("arcade") || name.includes("cabinet") || name.includes("vending") ||
               name.includes("plant") || name.includes("animal") || note.includes("<arcade>") ||
               note.includes("<vending>") || $gameMap.regionId(rec.ev.x, rec.ev.y) === 101 ||
               // A game of any kind, by name or by the command it runs (SECTION 9d).
               !!MinigamePlay.kindOf(rec.ev);
      });
    },

    // `trade` is matched against map event names, which are authored in
    // English, so it must be one of the job's English ids (its spec or its
    // category) and never its displayed name - that reads in the player's
    // language and would match nothing outside English.
    findWorkLocation(trade) {
      if (!trade) return null;
      const kw = String(trade).toLowerCase().split(" ")[0];
      const candidates = this._scanEvents(rec => {
        const n = rec.nameLower;
        return n.includes(kw) || n.includes("work") || n.includes("job");
      });
      return candidates[0] || null;
    },

    // Every place on this map a worker at `job` can stand to do it, best
    // first: an event the job's own workSpots keywords (Jobs.json) or its
    // trade name, then a shop counter, then any furniture or fitting an NPC
    // can use (a desk, a stove, a bench). People and doors are never a work
    // spot. Nearest to `from` first within each rank, so a worker moves
    // between the spots of their own corner of a big map.
    findWorkSpots(job, from) {
      if (!$gameMap || !job) return [];
      const words = (Array.isArray(job.workSpots) ? job.workSpots : [])
        .map(w => String(w).toLowerCase()).filter(Boolean);
      const trade = String(job.spec || job.category || "").toLowerCase().split(" ")[0];
      if (trade && trade.length > 3) words.push(trade);
      const shopIds = new Set((window.NPCSystem?.getShopIndex?.($gameMap.mapId()) || []).map(e => e.eventId));
      const ranked = [];
      for (const rec of this._index()) {
        const ev = rec.ev;
        if (!ev || (from && ev === from)) continue;
        if (window.NPCSystem?.isNPCEvent?.(rec.note)) continue;
        let rank = 0;
        // A doorman's door is his post; anybody else's is only a way out.
        if (words.some(w => rec.nameLower.includes(w)) || /\b(work|job)\b/.test(rec.nameLower)) rank = 3;
        else if (WORK_SPOT_SKIP.test(rec.nameLower)) continue;
        else if (shopIds.has(ev.eventId())) rank = 2;
        else if (WORK_SPOT_FURNITURE.test(rec.nameLower) || this._capabilities.some(c => c.id.startsWith("named_") && c.match(ev))) rank = 1;
        if (rank) ranked.push({ ev, rank });
      }
      const fx = from ? from.x : 0, fy = from ? from.y : 0;
      ranked.sort((a, b) => (b.rank - a.rank) ||
        ((Math.abs(a.ev.x - fx) + Math.abs(a.ev.y - fy)) - (Math.abs(b.ev.x - fx) + Math.abs(b.ev.y - fy))) ||
        (a.ev.eventId() - b.ev.eventId()));
      // Only the best rank present: a keeper with a counter does not wander
      // off to a bench.
      const top = ranked.length ? ranked[0].rank : 0;
      return ranked.filter(r => r.rank === top).map(r => r.ev);
    },

    hasFarmingTrait(profile) {
      if (!profile) return false;
      ensureTraits();
      const traitNames = (profile.traitIds || []).map(id => NPCSim._internal.traitNameLower(id));
      return traitNames.some(n => FARMING_TRAITS.some(kw => n.includes(kw)));
    },

    // ---- Capability registry --------------------------------------------
    // Additive lookup table layered on top of the find* methods above.
    // The original four scanners stay the source of truth for the original
    // five needs (sleep/hunger/work/crime/leisure); this registry lets new
    // needs (money, comfort, social, safety) and new systems (cooking
    // stations, containers, rentable rooms...) plug into the same
    // scan → score → dispatch flow without a bespoke find*/handler pair
    // each. See docs/npc_event_interaction_design_en.md §4.1.
    _capabilities: [],

    registerCapability(cap) {
      if (cap && typeof cap.match === "function" && Array.isArray(cap.needs)) {
        this._capabilities.push(cap);
      }
    },

    findByNeed(need, profile) {
      if (!$gameMap) return [];
      const recs = this._index();
      const matches = [];
      for (const cap of this._capabilities) {
        if (!cap.needs.includes(need)) continue;
        for (const rec of recs) {
          if (!cap.match(rec.ev)) continue;
          matches.push({ event: rec.ev, capability: cap, score: cap.weight ? cap.weight(profile, need) : 50 });
        }
      }
      matches.sort((a, b) => b.score - a.score);
      return matches;
    },

    // Events literally named "Steal", pre-placed theft opportunities that
    // low-morality NPCs actively seek out (see BehaviorDispatcher._handleCrime
    // and the SECTION 9b steal handler that resolves the attempt on arrival).
    findStealEvents() {
      return this._scanEvents(rec => rec.nameLower.trim() === "steal");
    },

    // Everything a shopping NPC can walk up to on the current map: every
    // registered shop/vendor event (from the world NPC cache shop index) plus
    // any displayed-goods "Steal" stands. Customers buy/browse these; willing
    // thieves may pilfer the Steal stands (resolved on arrival in SECTION 9b).
    findShopTargets() {
      if (!$gameMap) return [];
      const idx = window.NPCSystem?.getShopIndex?.($gameMap.mapId()) || [];
      const evIds = new Set(idx.map(e => e.eventId));
      return this._scanEvents(rec =>
        evIds.has(rec.ev.eventId()) || rec.nameLower.trim() === "steal");
    },
  };

  // A room for the night. RentSystem reads the name the same loose way (a
  // "Room" is what it is called, whatever else the mapper wrote beside it).
  const ROOM_NAME = /^room\b/;
  function _isRoomEvent(ev) {
    return ROOM_NAME.test((ev?.event()?.name || "").toLowerCase());
  }

  // Register the generic capabilities from the design doc's catalogue (§2).
  // Each ties an event-name/note signature to the need(s) it can satisfy and
  // a 0-100 desirability score (§3.2), higher-scoring matches are preferred.
  InteractionScanner.registerCapability({
    id: "cooking_station",
    needs: ["hunger"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("stove") || n.includes("kitchen") || n.includes("cooking");
    },
    weight(profile) {
      const foodItems = (profile?.itemIds || []).filter(id => {
        const it = $dataItems[id];
        return it && /<Category:\s*Food>/i.test(it.note || "");
      });
      // Only worth the trip if the NPC actually has two ingredients to combine
      return foodItems.length >= 2 ? 60 : 15;
    },
  });

  InteractionScanner.registerCapability({
    id: "container",
    needs: ["money", "safety"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("container") || n.includes("chest") || n.includes("storage");
    },
    weight(profile, need) {
      if (need === "safety") return (profile?.moralityScore ?? 0) < -20 ? 55 : 10;
      return 30;
    },
  });

  InteractionScanner.registerCapability({
    id: "rentable_room",
    needs: ["sleep", "comfort"],
    match: (ev) => _isRoomEvent(ev),
    weight(profile, need) {
      const tier = profile?.wealthTierBase ?? 0;
      if (tier < 1) return 0; // can't afford rent yet, fall back to home/wandering
      return need === "comfort" ? 50 : 45;
    },
  });

  InteractionScanner.registerCapability({
    id: "fast_travel_terminal",
    needs: ["leisure", "social"],
    match(ev) {
      return (ev.event()?.name || "") === "Teleport";
    },
    weight(profile, need) {
      const tier = profile?.wealthTierBase ?? 0;
      if (tier < 1) return 5; // can barely afford fuel/fare, low draw
      return need === "social" ? 25 : 35; // sightseeing slightly favoured over visiting
    },
  });

  InteractionScanner.registerCapability({
    id: "furniture_builder",
    needs: ["comfort", "leisure"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("builder") || n.includes("furniture");
    },
    weight(_profile, need) {
      return need === "comfort" ? 45 : 20;
    },
  });

  InteractionScanner.registerCapability({
    id: "apiary",
    needs: ["leisure"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("apiary") || n.includes("hive");
    },
    weight(profile, need) {
      if (!InteractionScanner.hasFarmingTrait(profile)) return 5;
      return 30;
    },
  });

  InteractionScanner.registerCapability({
    id: "bank",
    needs: ["money"],
    match(ev) {
      return (ev.event()?.name || "").toLowerCase().includes("bank");
    },
    weight(profile) {
      const money = profile?.money ?? 0;
      // In the red → seek a loan. Flush → seek a deposit/interest. Either way, draws them in.
      if (money < 100) return 50;
      if (money > 5000) return 35;
      return 10;
    },
  });

  InteractionScanner.registerCapability({
    id: "real_estate_office",
    needs: ["money"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("realestate") || n.includes("property");
    },
    weight(profile) {
      // Only the wealthy bother browsing property listings
      return (profile?.wealthTierBase ?? 0) >= 3 ? 45 : 0;
    },
  });

  InteractionScanner.registerCapability({
    id: "stock_exchange",
    needs: ["money"],
    match(ev) {
      const n = (ev.event()?.name || "").toLowerCase();
      return n.includes("stockmarket") || n.includes("exchange");
    },
    weight(profile) {
      const arcaneOrSubstance = (profile?.arcane ?? 0) + (profile?.substance ?? 0);
      if ((profile?.wealthTierBase ?? 0) < 2 && arcaneOrSubstance < 10) return 0;
      return 40;
    },
  });

  InteractionScanner.registerCapability({
    id: "shop_counter",
    needs: ["leisure", "comfort"],
    // Any event the per-map shop index knows about: <Shop>-tagged counters,
    // standard Shop Processing events, and RandomDailyShop events alike,
    // see NPCSystem.getShopIndex / SECTION 9b's BuyManager.
    match(ev) {
      const name = (ev.event()?.name || "").trim().toLowerCase();
      if (name === "steal") return false; // theft opportunities aren't storefronts
      const idx = window.NPCSystem?.getShopIndex?.($gameMap?.mapId()) || [];
      const evId = ev.eventId();
      return idx.some(e => e.eventId === evId);
    },
    weight(profile) {
      const money = profile?.money ?? 0;
      if (money < 200) return 0; // window shopping isn't worth the trip
      return 35;
    },
  });

  // ---- Event-name → need(s) keyword table -------------------------------
  // Quick-add structure for simple "this event name satisfies these needs"
  // bindings, without writing a bespoke detector/weight pair each time.
  //
  // Matched as KEYWORDS ANYWHERE IN THE NAME rather than as the whole name,
  // because a mapper names the thing, not the need: an exact table found "WC"
  // and missed "WC ornated", "Public Toilet" and "Shower (broken)", which are
  // the same washroom. Short words are held to word boundaries so a Barrel is
  // not a bar, and a stem is spelled with its tail (`bath\w*`) where the
  // longer words are the same object (bathtub, bathhouse).
  //
  // This table is the ONE place both the town's NPCs (BehaviorDispatcher) and
  // a loose party member (Core/AutoIdleExplorer.js) ask what a thing on the
  // map is good for, so teaching one teaches the other.
  const EVENT_NAME_NEEDS = {
    hygiene: /\b(wc|toilet|latrine|lavatory|bathroom|washroom|washbasin|basin|sink|shower|bath\w*|fountain)\b/,
    leisure: /\b(arcade|cabinet|pinball|jukebox|piano|tv|television|radio|billiard\w*|pool table|bowling|slot machine|casino|swing|playground|horse\w*|race ?track|tournament|tarot|cards?|card table|basketball)\b/,
    social:  /\b(pc|phone|bar|pub|tavern|inn|cafe|caffe|canteen|counter)\b/,
    comfort: /\b(bench|chair|stool|sofa|couch|armchair|seat|bed)\b/,
  };

  for (const [need, pattern] of Object.entries(EVENT_NAME_NEEDS)) {
    InteractionScanner.registerCapability({
      id: `named_${need}`,
      needs: [need],
      match(ev) { return pattern.test((ev.event()?.name || "").toLowerCase()); },
      weight() { return 40; },
    });
  }

  // What a name says it is good for, for anything that wants the answer
  // without the scan (the party AI reads it off a single event).
  InteractionScanner.needsOfName = function (name) {
    const n = String(name || "").toLowerCase();
    const out = [];
    for (const [need, pattern] of Object.entries(EVENT_NAME_NEEDS)) {
      if (pattern.test(n)) out.push(need);
    }
    return out;
  };

  // ============================================================================
  // SECTION 6, BEHAVIOUR DISPATCHER
  // ============================================================================

  // Of the leisure outings on a map with games, the share spent at one.
  const LEISURE_GAME_SHARE = 0.7;

  const BehaviorDispatcher = {
    // Real-time wait before the same need is sent again (a retry, not a
    // switch): a need that found nothing, or was met and is still the need,
    // is tried again after 30-60 s rather than never.
    RETRY_MIN_MS: 30000,
    RETRY_MAX_MS: 60000,
    // States in which the controller is already busy with the need it was
    // sent on: a retry leaves them to it.
    BUSY_STATES: ["goingToInteract", "interacting", "goingToWork", "working", "goingHome",
      "sleeping", "sitting", "goingToSeat", "goingToBed", "seekingNpc", "followingNpc", "conversing", "commuting",
      "fleeing", "yielding", "playingMinigame", "goingToSwim", "swimming", "goingToFish", "fishing"],

    dispatch(controller, profile, force) {
      if (!controller || !profile) return;
      if (!controller.event || controller.event._erased) return;

      // Don't interrupt talking state, a fight, or somebody lying down: the
      // controller settles those itself and decides again when they are over.
      if (controller.state === "talkingToPlayer") return;
      if (controller.state === "brawling" || controller.state === "knockedOut") return;
      // Running from, fighting or downed by a monster (NPCSystem, MAP SKIRMISH).
      if (controller.state === "fleeing" || controller.state === "skirmishing" || controller.state === "downed") return;
      // In the water or on the bank (SECTION 6b): the swim or the catch ends on its own.
      if (Water.STATES.includes(controller.state)) return;
      if (controller.state === "sleeping" && profile.currentNeed === "sleep") return;
      if (controller.state === "commuting") return;

      const need = profile.currentNeed;

      // A change of need is acted on at once. The same need again only once
      // the retry wait has run out, and never while they are still at it.
      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      if (controller._lastDispatchedNeed === need) {
        if (!force && now < (controller._dispatchRetryAt || 0)) return;
        if (this.BUSY_STATES.includes(controller.state)) return;
      }
      controller._dispatchRetryAt = now + this.RETRY_MIN_MS +
        Math.floor(Math.random() * (this.RETRY_MAX_MS - this.RETRY_MIN_MS));
      const was = controller._lastDispatchedNeed;
      controller._lastDispatchedNeed = need;
      if (was !== need && need) {
        window.SimLog?.decide("npc", controller.eventName,
          "ParchmentToast.simLog.npc.need." + need, { name: controller.eventName });
      }

      // The shift is over (or the worker was called off it): whatever part of
      // it they were seen working is settled now, before they turn to the
      // next thing. JobManager.payHours never pays an hour twice.
      if ((was === "work" || was === "shopwork") && need !== was &&
          (controller.state === "working" || controller.state === "goingToWork")) {
        EventBus.emit("npc:shift_end", { name: controller.eventName, shiftKey: controller._workShiftKey ?? null });
        controller._workShiftKey = null;
      }

      // A creature's hour is a creature's (RoutineManager.creatureDay): it
      // lies down where it is, keeps to its own kind or roams, and never walks
      // to a bed, a counter or a shop. A shift is the one exception, where the
      // world lets beasts work.
      if (need !== "work" && need !== "shopwork" && ScheduleManager._isNonSentient(profile)) {
        this._handleCreature(controller, profile, need);
        return;
      }

      switch (need) {
        case "sleep":   this._handleSleep(controller, profile);   break;
        case "hunger":  this._handleHunger(controller, profile);  break;
        case "hygiene": this._handleHygiene(controller, profile); break;
        case "work":    this._handleWork(controller, profile);    break;
        case "shopwork":this._handleShopWork(controller, profile);break;
        case "money":   this._handleMoney(controller, profile);   break;
        case "crime":   this._handleCrime(controller, profile);   break;
        case "safety":  this._handleSafety(controller, profile);  break;
        case "comfort": this._handleComfort(controller, profile); break;
        case "social":  this._handleSocial(controller, profile);  break;
        case "shopping":this._handleShopping(controller, profile);break;
        case "leisure": this._handleLeisure(controller, profile); break;
      }
    },

    // Generic helper for the new, registry-backed needs (§4.2 of the design
    // doc): ask the capability registry for the best-scoring nearby match,
    // announce it on the bus, and walk over. Falls back to an existing
    // handler when nothing recognisable is in range, so behaviour degrades
    // to what NPCs already did before this need existed.
    _handleViaRegistry(controller, profile, need, fallback) {
      const best = InteractionScanner.findByNeed(need, profile)[0];
      if (best && best.score > 0) {
        EventBus.emit("npc:capability_start", {
          name: controller.eventName, capabilityId: best.capability.id, eventRef: best.event,
        });
        controller.goInteract(best.event, need);
        return true;
      }
      if (fallback) fallback.call(this, controller, profile);
      return false;
    },

    // Sleep and rest: down where it stands. Herd: over to the nearest of its
    // own kind on the map. Anything else (grazing, foraging, hunting, a drink,
    // grooming, play, a wander) is the controller's own roaming.
    _handleCreature(controller, profile, need) {
      if (need === "sleep") {
        if (typeof controller.sleepRough === "function") controller.sleepRough();
        return;
      }
      if (need === "creature.rest") return; // i18n-ignore: routine activity id
      if (need === "creature.herd" && controller.event && $gameMap) { // i18n-ignore: routine activity id
        const NC = window.NPCCreature;
        const mine = NC?.creatureLife?.(profile);
        const kindOf = (life) => life ? (life.breed || life.archetype) : null;
        const kind = kindOf(mine);
        const society = $gameSystem?._npcSociety || {};
        const ev = controller.event;
        let best = null, bestD = Infinity;
        for (const c of ($gameSystem?.getActiveNPCControllers?.() || [])) {
          if (!c || c === controller || !c.event || c.event._erased) continue;
          const p = society[c.eventName];
          if (!p || !kind || kindOf(NC?.creatureLife?.(p)) !== kind) continue;
          const d = Math.abs(c.event.x - ev.x) + Math.abs(c.event.y - ev.y);
          if (d > 1 && d < bestD) { best = c; bestD = d; }
        }
        if (best && typeof controller.calculatePath === "function") {
          controller.target = { x: best.event.x, y: best.event.y };
          controller.state = "goingToZone";
          controller.calculatePath();
          return;
        }
      }
      if (typeof controller.setGoal === "function") controller.setGoal("wander", null);
    },

    _handleSleep(controller) {
      const profile = $gameSystem?._npcSociety?.[controller.eventName];
      // A rough sleeper has no bed and no door: down where they are.
      if (profile?._sleepsRough && typeof controller.sleepRough === "function") {
        controller.sleepRough();
        return;
      }
      // A bed in reach comes first: walked to, stepped onto, slept in.
      if (controller.event && typeof controller.goToBed === "function" && controller.goToBed()) return;
      // Then sitting down on a region 102 seat over home/fallback. Seats are
      // impassable furniture, so the controller walks to the tile beside one
      // and sits (NPCSystem's NPCSeats); a sitting NPC recovers sleep.
      if (controller.event && typeof controller.goSitNearby === "function" &&
          controller.goSitNearby(20)) {
        return;
      }
      // Walk to the NPC's assigned building door if it's on the current map
      const homeBuilding = profile?.homeBuilding;
      if (homeBuilding && homeBuilding.mapId === $gameMap?.mapId()) {
        controller.goToTile(homeBuilding.x, homeBuilding.y, "goingHome", 120000);
        return;
      }
      // Prefer a Door/House event as the "home" destination
      const homeEvent = this._findHomeEvent(controller);
      if (homeEvent) {
        controller.goToTile(homeEvent.x, homeEvent.y, "goingHome", 120000);
        return;
      }
      // Fallback: walk to a quiet corner of the map
      const tiles = $gameMap ? findPassable() : [];
      if (tiles.length) {
        const t = tiles[Math.floor(Math.random() * Math.min(tiles.length, 20))];
        controller.goToTile(t.x, t.y, "goingHome", 120000);
      } else if (typeof controller.sleepRough === "function") {
        controller.sleepRough();
      }
    },

    _findHomeEvent(controller) {
      if (!$gameMap) return null;
      // Look for any Door / House transfer event on the current map
      const homeNames = ["door", "house", "home", "transfer", "exit"];
      const candidates = InteractionScanner._scanEvents(rec => {
        if (rec.ev === controller.event) return false;
        return homeNames.some(kw => rec.nameLower.includes(kw));
      });
      if (!candidates.length) return null;
      // Pick the one closest to the NPC
      if (!controller.event) return candidates[0];
      candidates.sort((a, b) => {
        const da = Math.abs(a.x - controller.event.x) + Math.abs(a.y - controller.event.y);
        const db = Math.abs(b.x - controller.event.x) + Math.abs(b.y - controller.event.y);
        return da - db;
      });
      return candidates[0];
    },

    _handleHunger(controller, profile) {
      const foodSources = InteractionScanner.findFood();
      if (!foodSources.length) return;
      const target = foodSources[Math.floor(Math.random() * foodSources.length)];
      controller.goInteract(target, "hunger");
    },

    // WC/Sink (registered via EVENT_NAME_NEEDS). Water close by is a wash
    // too, now and then preferred to the washroom, and the only one where
    // the map has none (SECTION 6b, Water.wash); with neither, the NPC just
    // keeps going about its day.
    _handleHygiene(controller, profile) {
      const washroom = InteractionScanner.findByNeed("hygiene", profile)[0];
      if (Water.wash(controller, profile, !!(washroom && washroom.score > 0))) return;
      this._handleViaRegistry(controller, profile, "hygiene", null);
    },

    _handleWork(controller, profile) {
      const job = JobManager.getJob(profile);
      if (!job) return; // jobless NPCs have nothing to dispatch to

      // An NPC can only be found working on their assigned job map (see
      // JobShiftManager). If the current map isn't that one, leave them be,
      // their shift is simulated off-screen in the main tick instead.
      if (profile.workMapId && profile.workMapId !== $gameMap?.mapId()) return;

      // The shift this worker is on, remembered so its pay settles against
      // the right shift even when it ends after the clock has turned over.
      controller._workShiftKey = JobManager.shiftKeyAt();
      controller._shopWork = false;
      const spots = InteractionScanner.findWorkSpots(job, controller.event);
      const workSpot = spots[0] || null;
      if (workSpot) {
        // goToTile sets state=goingToWork, which on arrival transitions to
        // working. The spot itself is usually blocked (a counter, a stove), so
        // they head for a free tile beside it.
        const t = typeof controller._approachTile === "function"
          ? controller._approachTile(workSpot.x, workSpot.y, 2) : workSpot;
        controller._workSpotId = workSpot.eventId?.() ?? null;
        controller.goToTile(t.x, t.y, "goingToWork", 300000);
      } else if (controller.event) {
        // Nothing to stand at: they work where they are.
        controller.goToTile(controller.event.x, controller.event.y, "goingToWork", 300000);
      }
    },

    // A shop counter shift (ShopShiftManager). The keeper on a rota is
    // usually the counter event itself, but a worker who is also walking the
    // map (a counter on an interior they were met on) takes up the post:
    // over to the counter, and the working loop keeps them there.
    _handleShopWork(controller, profile) {
      const assign = $gameSystem?._npcShopAssignments?.[controller.eventName];
      if (!assign || assign.mapId !== $gameMap?.mapId()) return;
      const counter = $gameMap.event?.(assign.eventId);
      if (!counter || counter._erased) return;
      const t = typeof controller._approachTile === "function"
        ? controller._approachTile(counter.x, counter.y, 2) : counter;
      controller._workShiftKey = JobManager.shiftKeyAt();
      controller._workSpotId = assign.eventId;
      controller._shopWork = true;
      controller.goToTile(t.x, t.y, "goingToWork", 300000);
    },

    _handleCrime(controller, profile) {
      if (Math.random() > 0.3) return; // throttle
      // Low-morality NPCs case the map for "Steal"-named events and walk
      // right up to the goods before making the attempt, the SECTION 9b
      // steal handler resolves the theft when they arrive. Maps without any
      // fall back to the abstract on-the-spot shoplifting roll.
      const stealTargets = InteractionScanner.findStealEvents();
      if (stealTargets.length && (profile.moralityScore ?? 0) < -30 + hordeChaosHere() * 40) {
        const ev = controller.event;
        stealTargets.sort((a, b) =>
          (Math.abs(a.x - ev.x) + Math.abs(a.y - ev.y)) - (Math.abs(b.x - ev.x) + Math.abs(b.y - ev.y)));
        const target = stealTargets[0];
        const wanted = CrimeManager.peekStealItem(target);
        _emitCrimeThought(profile, "intent", wanted?.data?.name);
        controller.goInteract(target, "crime");
        return;
      }
      CrimeManager.attemptTheft(controller, profile);
    },

    // ---- Extended needs (docs/npc_event_interaction_design_en.md §3.1) ----
    // All routed through the registry; each falls back to whatever the NPC
    // would have done before this need existed, so a map with no recognised
    // capability events behaves exactly as it did previously.

    _handleMoney(controller, profile) {
      this._handleViaRegistry(controller, profile, "money", this._handleWork);
    },

    _handleSafety(controller, profile) {
      this._handleViaRegistry(controller, profile, "safety", null);
    },

    _handleComfort(controller, profile) {
      this._handleViaRegistry(controller, profile, "comfort", this._handleLeisure);
    },

    _handleSocial(controller, profile) {
      // Somebody to see first (NPCConversation ConversationManager.seek): the
      // partner, a friend, kin, or somebody lonely on this map, walked up to
      // and talked to. Throttled there, so a crowd does not all set off at once.
      const CM = window.NPCConversation?.ConversationManager;
      if (CM?.seek && CM.seek(controller, profile)) return;
      // Social zones (region 101) are already covered by findLeisure(); the
      // registry only adds destinations like rentable rooms for "go visit".
      this._handleViaRegistry(controller, profile, "social", this._handleLeisure);
    },

    _handleLeisure(controller, profile) {
      // A plot or a pen that needs them first: their own garden, a keen
      // gardener's or animal lover's pastime, a friend's plants (SECTION 7).
      const tend = Tending.leisureTarget(controller, profile);
      if (tend) {
        controller.goInteract(tend, "farm");
        return;
      }
      const spots = InteractionScanner.findLeisure();
      // An afternoon by the water (SECTION 6b): fishing for somebody with a
      // rod, a swim for anybody, and always when the map has nothing else.
      if (Water.leisureOuting(controller, profile, !spots.length)) return;
      if (!spots.length) return;
      // The games on the map come first (SECTION 11b5b): a gambler who still
      // wants goes to the betting games until fed or broke, anybody else to
      // a game they may play most of the time.
      const name = controller.eventName;
      const { gamble, games } = Addictions.leisureGames(profile, name, spots);
      if (games.length && (gamble || Math.random() < LEISURE_GAME_SHARE)) {
        if (gamble) Addictions.headingOut(profile, name);
        controller.goInteract(games[Math.floor(Math.random() * games.length)], "leisure");
        return;
      }
      controller.goInteract(spots[Math.floor(Math.random() * spots.length)], "leisure");
    },

    // Shopping: walk up to a registered shop/vendor event (or a displayed-goods
    // "Steal" stand) and interact. On arrival the npc:interact listeners resolve
    // it, a purchase (with a buy thought), window-shopping (a browse thought),
    // or, for willing thieves only, a theft attempt. Falls back to leisure when
    // the map has nothing to shop at.
    _handleShopping(controller, profile) {
      const targets = InteractionScanner.findShopTargets();
      if (!targets.length) return this._handleLeisure(controller, profile);
      const ev = controller.event;
      if (!ev) return;
      targets.sort((a, b) =>
        (Math.abs(a.x - ev.x) + Math.abs(a.y - ev.y)) - (Math.abs(b.x - ev.x) + Math.abs(b.y - ev.y)));
      const target = targets[Math.floor(Math.random() * Math.min(targets.length, 3))];
      controller.goInteract(target, "shopping");
    },
  };

  // ============================================================================
  // SECTION 6b, WATER: SWIMMING AND FISHING (NPCSim.Water, Phase R)
  // ============================================================================
  // People get into the water for three reasons, and a fourth follows from
  // the third:
  //
  //   wash     the hygiene need: water within WASH_NEAR_TILES is taken over
  //            the washroom now and then, and it is the only wash on a map
  //            that has no washroom at all
  //   escape   running from a monster (NPCSystem MAP SKIRMISH): water nearer
  //            than the monster is, and the monster no swimmer, is a way out;
  //            they stay in until it has gone or is FLEE_SAFE_TILES off
  //   leisure  an afternoon off: a swim now and then, always when the map
  //            offers nothing else to do
  //   group    a close friend, partner or relative nearby (within
  //            GROUP_RANGE) joins a leisure swim, up to GROUP_MAX of them, and
  //            swimmers side by side talk (NPCConversation, swim talk)
  //
  // Somebody carrying a fishing rod (MovementSystem.fishingRodItemIds, or any
  // item tagged <Leisure: fish>) spends a leisure hour on the bank instead,
  // half the time. The catch is headless: one seeded draw over
  // js/db/Items/fishDatabase.json by rarity (RARITY_WEIGHTS, the same records
  // FishingMinigame stocks its lake from), with NOTHING_CHANCE of an empty
  // line. What is kept goes into the hand (profile.itemIds) as the fish's own
  // item, or as a plain fish (CATCH_FALLBACK_ITEM) for a record with none, so
  // Gear.eatFromHand can feed them from it later. A jellyfish or a kraken, or
  // anything their diet forbids, is let go.
  //
  // The controller (NPCSystem_Controller.js, WATER) walks, swims and waits;
  // the tiles are NPCSystem.findWaterSpot / isSwimWater (SwimSpots). The
  // bubbles come from NPCConversation.ThoughtProvider.waterThought.
  // i18n-ignore-start: swim reason ids, controller states, routine ids, thought moments, spec names
  const WATER_WASH = "wash", WATER_ESCAPE = "escape", WATER_LEISURE = "leisure", WATER_GROUP = "group";
  const WATER_FISHING = "fishing", WATER_SWIMMING = "swimming", WATER_FLEEING = "fleeing";
  const WATER_STATES = ["goingToSwim", "swimming", "goingToFish", "fishing"];
  const WATER_FREE_STATES = ["idle", "wandering", "socializing", "inZone"];
  const WATER_SPEC_SWIM = "Swimming", WATER_SPEC_FISH = "Fishing";
  const WATER_LOG_TAG = "leisure";
  // i18n-ignore-end
  const FISH_GEAR_TAG = /<Leisure:\s*fish\b/i;

  const Water = {
    STATES: WATER_STATES,
    REASONS: [WATER_WASH, WATER_ESCAPE, WATER_LEISURE, WATER_GROUP],
    SWIM_MS: { wash: [20000, 35000], escape: [12000, 12000], leisure: [40000, 80000], group: [40000, 80000] },
    FISH_MS: [30000, 60000],
    WASH_NEAR_TILES: 12,
    WASH_NEAR_SHARE: 0.3,
    LEISURE_FISH_SHARE: 0.5,
    LEISURE_SWIM_SHARE: 0.2,
    ESCAPE_TILES: 6,
    SAFE_TILES: 10,
    GROUP_MAX: 2,
    GROUP_RANGE: 8,
    GROUP_SPOT_SLACK: 6,
    FRIEND_OPINION: 40,
    BUBBLE_CHANCE: 0.03,
    NOTHING_CHANCE: 0.3,
    RARITY_WEIGHTS: { common: 60, uncommon: 25, rare: 12, legendary: 1 },
    // "Day-Old Fish", the plain raw fish food (data/Items.json).
    CATCH_FALLBACK_ITEM: 425,
    // Jellyfish and Kraken (fishDatabase ids): a story, not a meal.
    RELEASED_FISH_IDS: [19, 20],

    _society() { return $gameSystem?._npcSociety || {}; },
    _now() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); },
    _minute() { return ($gameVariables && $gameVariables.value(114)) || 0; },
    _dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); },

    // Anybody but a newborn, and nobody lying on the ground.
    canSwim(profile, name) {
      if (!profile || profile.downed || profile._killed) return false;
      return Children?.stage?.(profile, name) !== "newborn"; // i18n-ignore: life stage id
    },

    // The rod in their hand, or null.
    fishingGearOf(profile) {
      const rods = window.MovementSystem?.fishingRodItemIds || [123];
      for (const raw of (profile?.itemIds || [])) {
        const id = Number(raw);
        if (rods.includes(id)) return id;
        const it = typeof $dataItems !== "undefined" && $dataItems ? $dataItems[id] : null;
        if (it && FISH_GEAR_TAG.test(it.note || "")) return id;
      }
      return null;
    },

    canFish(profile, name) {
      if (!this.canSwim(profile, name)) return false;
      if (Specs?.isNonSentient?.(profile, name)) return false;
      return this.fishingGearOf(profile) != null;
    },

    spotFor(ctrl, maxDist) {
      const ev = ctrl?.event;
      if (!ev) return null;
      return window.NPCSystem?.findWaterSpot?.(ev.x, ev.y, maxDist != null ? { maxDist } : undefined) || null;
    },

    trySwim(ctrl, profile, reason, opts) {
      if (!ctrl?.event || typeof ctrl.goSwim !== "function") return false;
      if (!this.canSwim(profile, ctrl.eventName)) return false;
      const spot = (opts && opts.spot) || this.spotFor(ctrl, opts && opts.maxDist);
      if (!spot) return false;
      return !!ctrl.goSwim(reason, spot, opts);
    },

    tryFish(ctrl, profile, opts) {
      if (!ctrl?.event || typeof ctrl.goFish !== "function") return false;
      if (!this.canFish(profile, ctrl.eventName)) return false;
      const spot = (opts && opts.spot) || this.spotFor(ctrl, opts && opts.maxDist);
      if (!spot) return false;
      return !!ctrl.goFish(spot);
    },

    wash(ctrl, profile, hasWashroom) {
      if (hasWashroom) {
        if (Math.random() >= this.WASH_NEAR_SHARE) return false;
        return this.trySwim(ctrl, profile, WATER_WASH, { maxDist: this.WASH_NEAR_TILES });
      }
      return this.trySwim(ctrl, profile, WATER_WASH);
    },

    leisureOuting(ctrl, profile, nothingElse) {
      if (!ctrl || !profile) return false;
      const name = ctrl.eventName;
      if (this.canFish(profile, name) && (nothingElse || Math.random() < this.LEISURE_FISH_SHARE) &&
          this.tryFish(ctrl, profile)) return true;
      if ((nothingElse || Math.random() < this.LEISURE_SWIM_SHARE) &&
          this.trySwim(ctrl, profile, WATER_LEISURE)) return true;
      return false;
    },

    // A way out through the water: nearer than the threat, not past it, and
    // only from something that cannot follow them in.
    escapeSpot(ctrl, threat) {
      const ev = ctrl?.event;
      if (!ev || !threat) return null;
      if ((threat.isAquaticEnemy && threat.isAquaticEnemy()) ||
          (threat.isAmphibiousEnemy && threat.isAmphibiousEnemy())) return null;
      const spot = this.spotFor(ctrl, this.ESCAPE_TILES);
      if (!spot) return null;
      const t = { x: threat.x, y: threat.y };
      if (spot.dist >= this._dist(ev, t)) return null;
      if (this._dist(spot.shore, t) <= 1) return null;
      return spot;
    },

    tryEscape(ctrl, threat) {
      const profile = this._society()[ctrl?.eventName];
      if (!ctrl || typeof ctrl.goSwim !== "function" || !this.canSwim(profile, ctrl.eventName)) return false;
      const spot = this.escapeSpot(ctrl, threat);
      if (!spot) return false;
      const eid = threat.eventId ? threat.eventId() : null;
      return !!ctrl.goSwim(WATER_ESCAPE, spot, { threat: { eid, x: threat.x, y: threat.y } });
    },

    threatGone(ctrl) {
      const t = ctrl?._swim?.threat;
      if (!t || !ctrl.event) return true;
      const m = t.eid != null && $gameMap ? $gameMap.event(t.eid) : null;
      if (!m || m._erased) return true;
      return this._dist(ctrl.event, m) >= this.SAFE_TILES;
    },

    _span(range) { return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1)); },
    swimMs(reason) { return this._span(this.SWIM_MS[reason] || this.SWIM_MS.leisure); },
    fishMs() { return this._span(this.FISH_MS); },

    // A line from the water pool, in their voice, as a bubble.
    say(ctrl, moment, params) {
      const profile = this._society()[ctrl?.eventName];
      if (!profile || !ThoughtGenerator) return null;
      if (!profile._eventName) profile._eventName = ctrl.eventName;
      const line = window.NPCConversation?.ThoughtProvider?.waterThought?.(profile, moment, params);
      if (line) ThoughtGenerator._push(profile, line);
      return line || null;
    },

    onSetOff(ctrl, reason) {
      const id = reason === WATER_ESCAPE ? WATER_FLEEING : reason === WATER_FISHING ? WATER_FISHING : WATER_SWIMMING;
      RoutineManager?.mark?.(ctrl.eventName, id);
    },

    onSwimStart(ctrl, reason) {
      const name = ctrl.eventName;
      const profile = this._society()[name];
      this.say(ctrl, "swim." + (reason || WATER_LEISURE));
      if (profile) {
        StoryLogger?.record?.(name, WATER_LOG_TAG, "NPCSim.log.swam", {});
        Specs?.practice?.(profile, name, WATER_SPEC_SWIM, 1);
      }
      if (reason === WATER_LEISURE) this.inviteGroup(ctrl);
    },

    // The wash, or the pleasure, a second at a time; somebody in the water
    // beside them is company too.
    onSwimTick(ctrl, time) {
      const s = ctrl?._swim;
      if (!s) return;
      const last = s.lastTick != null ? s.lastTick : time;
      s.lastTick = time;
      const dt = Math.max(0, Math.min(5, (time - last) / 1000));
      if (dt > 0) {
        if (s.reason === WATER_WASH) satisfyNeedTick(ctrl.eventName, "hygiene", dt); // i18n-ignore: need id
        else if (s.reason !== WATER_ESCAPE) {
          satisfyNeedTick(ctrl.eventName, "leisure", dt); // i18n-ignore: need id
          if (this.swimmersNear(ctrl).length) satisfyNeedTick(ctrl.eventName, "social", dt); // i18n-ignore: need id
        }
      }
      if (s.reason !== WATER_ESCAPE && Math.random() < this.BUBBLE_CHANCE) this.say(ctrl, "swimming");
    },

    onSwimEnd() {},

    swimmersNear(ctrl, range) {
      const ev = ctrl?.event;
      if (!ev) return [];
      const r = range != null ? range : 3;
      return ($gameSystem?.getActiveNPCControllers?.() || []).filter(c =>
        c && c !== ctrl && c.state === WATER_SWIMMING && c.event && !c.event._erased &&
        this._dist(c.event, ev) <= r);
    },

    _areClose(a, b) {
      const CM = window.NPCConversation?.ConversationManager;
      if (CM && typeof CM._areClose === "function") return !!CM._areClose(a, b);
      const soc = this._society();
      const op = (x, y) => soc[x]?.relationships?.[y]?.opinion ?? 0;
      return op(a, b) >= this.FRIEND_OPINION || op(b, a) >= this.FRIEND_OPINION;
    },

    // Close friends, partners and kin standing about nearby come in too.
    inviteGroup(ctrl) {
      const s = ctrl?._swim;
      if (!s || !ctrl.event) return [];
      const society = this._society();
      const joined = [];
      for (const c of ($gameSystem?.getActiveNPCControllers?.() || [])) {
        if (joined.length >= this.GROUP_MAX) break;
        if (!c || c === ctrl || !c.event || c.event._erased || typeof c.goSwim !== "function") continue;
        if (!WATER_FREE_STATES.includes(c.state)) continue;
        if (this._dist(c.event, ctrl.event) > this.GROUP_RANGE) continue;
        if (!this.canSwim(society[c.eventName], c.eventName)) continue;
        if (Specs?.isNonSentient?.(society[c.eventName], c.eventName)) continue;
        if (!this._areClose(ctrl.eventName, c.eventName)) continue;
        // Their own nearest shore when it is on the same stretch of water,
        // else the one the first swimmer went in from.
        let spot = this.spotFor(c, this.GROUP_RANGE + this.GROUP_SPOT_SLACK);
        if (!spot || !s.water || this._dist(spot.water, s.water) > this.GROUP_SPOT_SLACK) {
          spot = { shore: s.shore, water: s.water, dir: null };
        }
        if (c.goSwim(WATER_GROUP, spot, { group: ctrl.eventName })) joined.push(c.eventName);
      }
      return joined;
    },

    onCast(ctrl) {
      this.say(ctrl, "fish.cast");
    },

    onFishTick(ctrl) {
      if (Math.random() < this.BUBBLE_CHANCE) this.say(ctrl, "fish.wait");
    },

    // The fish records, as FishingMinigame stocks its lake from them.
    fishTable() {
      let t = null;
      try { t = window.Items?.fishDatabase; } catch (e) { t = null; }
      return Array.isArray(t) ? t : [];
    },

    // One seeded draw: { fish, itemId } (fish null for an empty line, itemId
    // null for one let go). The same key always lands the same catch.
    rollCatch(seedKey, profile, table) {
      const list = (table || this.fishTable()).filter(f => f && f.id != null);
      const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new MiniRng(nameHash(String(seedKey)) ^ ws);
      rng.next();
      if (!list.length || rng.next() < this.NOTHING_CHANCE) return { fish: null, itemId: null };
      const weightOf = f => this.RARITY_WEIGHTS[String(f.rarity || "common").toLowerCase()] || 1;
      const total = list.reduce((sum, f) => sum + weightOf(f), 0);
      let r = rng.next() * total;
      let fish = list[list.length - 1];
      for (const f of list) {
        if ((r -= weightOf(f)) < 0) { fish = f; break; }
      }
      return { fish, itemId: this.catchItemId(fish, profile) };
    },

    catchItemId(fish, profile) {
      if (!fish || this.RELEASED_FISH_IDS.includes(Number(fish.id))) return null;
      const data = typeof $dataItems !== "undefined" && $dataItems ? $dataItems : null;
      let id = Number(fish.itemId) || 0;
      if (!(id && data?.[id]?.name)) id = this.CATCH_FALLBACK_ITEM;
      const item = data?.[id];
      if (!item) return null;
      const Diet = window.NPCShared?.Diet;
      if (Diet && profile && !Diet.allows(profile, item)) return null;
      return id;
    },

    // The line comes in: what is kept goes into the hand.
    landCatch(ctrl) {
      const name = ctrl?.eventName;
      const profile = this._society()[name];
      if (!profile) return null;
      const res = this.rollCatch(`${name}_fish_${this._minute()}`, profile); // i18n-ignore: rng seed key
      const fishName = res.fish ? this.fishName(res.fish) : "";
      if (res.itemId) {
        profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
        profile.itemIds.push(res.itemId);
        window.NPCShared?.capItemIds?.(profile);
        this.say(ctrl, "fish.catch", { fish: fishName });
        StoryLogger?.record?.(name, WATER_LOG_TAG, "NPCSim.log.caughtFish", { fish: fishName });
        Specs?.practice?.(profile, name, WATER_SPEC_FISH, 2);
      } else if (res.fish) {
        this.say(ctrl, "fish.release", { fish: fishName });
        Specs?.practice?.(profile, name, WATER_SPEC_FISH, 1);
      } else {
        this.say(ctrl, "fish.nothing");
        Specs?.practice?.(profile, name, WATER_SPEC_FISH, 1);
      }
      satisfyNeedTick(name, "leisure", 30); // i18n-ignore: need id
      return res;
    },

    // The fish's name as the player reads it (Fishing.fish.<id>).
    fishName(fish) {
      const key = "Fishing.fish." + fish.id;
      const tr = window.T;
      if (typeof tr === "function" && tr.has && tr.has(key)) return tr(key);
      return String(fish.name || "");
    },
  };

  Object.assign(NPCSim._internal, {
    _isRoomEvent, BehaviorDispatcher, InteractionScanner, Water,
  });
})();
