/*:
 * @target MZ
 * @plugindesc NPC Simulation: jobs, shifts, shop counters, leave and serving customers
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @orderAfter NPCSim_Crime
 * @help
 * ============================================================================
 * NPCSim_Jobs, part of the NPCSimulationCore family
 * ============================================================================
 * Owns JobManager (SECTION 4), WorkServe (SECTION 9c), ShopShiftManager
 * (SECTION 11c), LeaveManager (SECTION 11d2) and JobShiftManager (SECTION 11d).
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSim_Crime.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    economyRng, EventBus, fmtMoney, MiniRng, MONEY_CAP, nameHash, RoutineManager, ScheduleManager, SHIFT_COUNT,
    SHIFT_HOURS, SHOPKEEPER_POOL_RATIO, WEEKDAY_CATEGORIES, WEEKEND_TRADES,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let bumpMutualOpinion, Children, Specs, StoryLogger, ThoughtGenerator;
  NPCSim._internal._late.push(() => ({
    bumpMutualOpinion, Children, Specs, StoryLogger, ThoughtGenerator,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 4, JOB MANAGER
  // ============================================================================

  const JobManager = {
    // Looks up (and triggers, if needed) this NPC's slot in the group-wide
    // job-shift roster, see JobShiftManager. Each NPC either lands on one
    // of the group's job positions (job + work map + 8h shift) or becomes
    // jobless (currentJobId = 0, distinct from null/"not yet decided").
    assignJob(profile) {
      // Practising before Eris's bench is not a shift the group roster hands
      // out: ErisTrial pins the Defence Lawyer job onto the world's five
      // advocates, and the roster must never reassign them out of it.
      if (profile._erisLawyerJobLocked) return;
      // Nor an office of a nation or a bloc: NPCPolitics pins the appointed
      // job onto whoever holds it and takes it back when they leave.
      if (profile._politicsOffice) return;

      // A beast holds no trade. 0 is "jobless" rather than null, so nothing
      // comes back later to deal it a shift it has no hands for. The player's
      // own creature characters are not held to this, and neither is a beast
      // in a world where beasts work (NPCCreature.mayWork, the one answer to
      // WorldModes.beastsWork).
      const NC = window.NPCCreature;
      const beastBarred = NC?.mayWork ? !NC.mayWork(profile, profile._eventName)
        : (NC?.isNonSentientProfile?.(profile) && !NC.isPlayerCharacterName(profile._eventName));
      if (beastBarred) {
        profile.currentJobId = 0;
        profile.workMapId = null;
        profile.workShift = null;
        return;
      }
      // Nor does a child (SECTION 11b4): at eighteen they are dealt one.
      if (Children.isMinor(profile)) {
        profile.currentJobId = 0;
        profile.workMapId = null;
        profile.workShift = null;
        return;
      }

      const groupName = profile._homeGroupName;
      if (!groupName) {
        profile.currentJobId = 0;
        profile.workMapId = null;
        profile.workShift = null;
        return;
      }

      JobShiftManager.ensureGroupAssignments(groupName);
      const assign = $gameSystem._npcJobAssignments?.[profile._eventName];
      if (assign) {
        profile.currentJobId = assign.jobId;
        profile.workMapId    = assign.mapId;
        profile.workShift    = assign.shift;
        // A person whose specializations are already dealt takes up the new
        // trade at once (SECTION 11b3); an undealt one is seeded with it.
        if (profile._specV && profile._specJobId !== profile.currentJobId) {
          try { Specs.onJobChange(profile, profile._eventName); } catch (_) {}
        }
      } else {
        profile.currentJobId = 0;
        profile.workMapId = null;
        profile.workShift = null;
      }
    },

    getJob(profile) {
      if (!profile.currentJobId || !window.WorkSystem) return null;
      return (window.WorkSystem.Jobs || []).find(j => j.id === profile.currentJobId) || null;
    },

    // A trade that keeps office hours rests on Saturday and Sunday: a
    // workshop, a warehouse, a clerk's desk. Round-the-clock work (any night
    // shift) and the trades whose trade IS the weekend (a cook, a lifeguard,
    // an arcade, a gym, a cinema) keep going. A job can say so outright with
    // `weekdays: true|false` in Jobs.json.
    isWeekdayOnly(job) {
      if (!job) return false;
      if (typeof job.weekdays === "boolean") return job.weekdays;
      if (!WEEKDAY_CATEGORIES.includes(job.category)) return false;
      if ((job.shifts || []).includes(0)) return false;
      return !WEEKEND_TRADES.includes(job.spec);
    },

    // A public holiday rests nearly everybody: only the trades whose trade IS
    // the day off (the weekend trades) keep their shift. A job can say so
    // outright with `holidays: true|false` in Jobs.json. Shop counters are not
    // jobs and are never asked this.
    worksHolidays(job) {
      if (!job) return false;
      if (typeof job.holidays === "boolean") return job.holidays;
      return WEEKEND_TRADES.includes(job.spec);
    },

    // Display name of the map where this NPC's job is performed, used by
    // the Empathize "Routine" tab to render "Work as <job> at <map>".
    getJobWorkMapName(profile) {
      const mapId = profile.workMapId;
      if (!mapId) return '';
      if ($gameMap?.mapId() === mapId) return $gameMap.displayName();
      const data = window.NPCSystem?.loadMapData?.(mapId);
      const name = data?.displayName
        || (($dataMapInfos && $dataMapInfos[mapId]) ? $dataMapInfos[mapId].name : T('NPCSim.mapFallback', { id: mapId }));
      return window.translateText ? window.translateText(name) : name;
    },

    // ---- Pay ---------------------------------------------------------------
    // A shift is worth the job's basePay, earned an hour at a time
    // (basePay / duration an hour) for at most `duration` hours of each
    // 8-hour shift. The hours already paid are kept per shift on the profile
    // (_shiftPay), so the off-screen hourly pay, the on-map settlement when the
    // shift ends and any repeat of either never pay the same hour twice.
    // Shifts are numbered from the start of time (minute / 480), so a shift
    // that has closed is never reopened by a late settlement.
    shiftKeyAt(minute) {
      const m = minute == null ? ($gameVariables?.value(114) ?? 0) : minute;
      return Math.floor(m / (SHIFT_HOURS * 60));
    },

    // The latest shift of this worker's that has begun: the current one while
    // they are on it, otherwise the one that just ended.
    lastShiftKey(profile, minute) {
      const cur = this.shiftKeyAt(minute);
      const own = Number(profile?.workShift);
      if (!Number.isFinite(own)) return cur;
      return cur - ((((cur - own) % SHIFT_COUNT) + SHIFT_COUNT) % SHIFT_COUNT);
    },

    _jobDuration(job) {
      return Math.max(1, Number(job?.duration) || SHIFT_HOURS);
    },

    payHours(profile, npcName, hours, shiftKey) {
      const job = this.getJob(profile);
      if (!job || !(hours > 0)) return 0;
      const duration = this._jobDuration(job);
      const key = shiftKey ?? this.shiftKeyAt();
      let rec = profile._shiftPay;
      if (rec && key < rec.key) return 0;
      if (!rec || rec.key !== key) rec = profile._shiftPay = { key, hours: 0, paid: 0 };
      const hrs = Math.min(hours, duration - rec.hours);
      if (hrs <= 0) return 0;
      const pay = this._earn(profile, npcName, job, hrs / duration);
      rec.hours += hrs;
      rec.paid += pay;
      if (rec.hours >= duration) this._completeShift(profile, npcName, job, rec.paid);
      return pay;
    },

    // Whatever is still owed for a shift, all at once: what an NPC seen
    // working it on the map is paid when it ends.
    settleShift(profile, npcName, shiftKey) {
      const job = this.getJob(profile);
      if (!job) return 0;
      return this.payHours(profile, npcName, this._jobDuration(job), shiftKey);
    },

    // A whole shift's pay (the settlement of the current one), kept under its
    // old name for anything that still asks for it.
    simulateShiftPay(profile, npcName) {
      return this.settleShift(profile, npcName);
    },

    _completeShift(profile, npcName, job, paid) {
      const who = npcName || profile._eventName;
      if (window.NPCCreature?.mayHoldMoney?.(profile, who) === false) {
        StoryLogger.record(who, "work", 'NPCSim.log.workInKind', { job: job.name });
      } else {
        StoryLogger.record(who, "work", 'NPCSim.log.work', { job: job.name, pay: fmtMoney(paid) });
      }
      // Faction job completion → slight reputation gain for NPC's faction
      if (job.factionId !== undefined && profile.factionIndex >= 0 && $gameFactions?.changeReputation) {
        try { $gameFactions.changeReputation(job.factionId, 1); } catch (_) {}
      }
    },

    // `fraction` of one shift's pay, by how well suited the worker is.
    _earn(profile, npcName, job, fraction) {
      // Build a plain stat proxy so WorkSystem.calculateSuccessChance gets standard prop names.
      // The equip-derived stats ride along under their lowercase profile names,
      // which is how WorkSystem.getActorStat reads them off a non-Game_Actor:
      // without them every NPC scored 0 against the jobs that ask for a look.
      const proxy = {
        atk: profile.atk || 0, def: profile.def || 0,
        mat: profile.mat || 0, mdf: profile.mdf || 0,
        agi: profile.agi || 0, luk: profile.luk || 0,
        mhp: profile.mhp || 0, mmp: profile.mmp || 0,
        arcane: profile.arcane || 0, substance: profile.substance || 0,
        stealth: profile.stealth || 0, intimidation: profile.intimidation || 0,
        level: profile.level || 1,
      };
      let chance = 0.7;
      try { chance = window.WorkSystem.calculateSuccessChance(proxy, job); } catch (_) {}
      const _payRng = economyRng(npcName || profile._eventName, "shiftpay");
      const pay = Math.floor((job.basePay || 500) * fraction * chance * (0.8 + _payRng.next() * 0.4));
      profile.hunger = Math.max(0, (profile.hunger ?? 100) - 10 * fraction);
      // A beast that works (only where beasts work, a monster world) is paid
      // in food and goods, never in euros (NPCCreature.mayHoldMoney).
      if (window.NPCCreature?.mayHoldMoney?.(profile, npcName || profile._eventName) === false) {
        this._payInKind(profile, npcName || profile._eventName, pay);
        return pay;
      }
      profile.money = Math.min(MONEY_CAP, (profile.money || 0) + pay);
      return pay;
    },

    // What a shift is worth, handed over as a meal: the belly filled in
    // proportion to the pay, and an animal's feeding record (its one hunger
    // meter, AnimalGrowthSystem fedAt) marked fed. Nothing is ever banked.
    PAY_IN_KIND_PER_MEAL: 400,
    _payInKind(profile, name, pay) {
      if (!profile || !(pay > 0)) return 0;
      const meals = Math.max(1, Math.round(pay / this.PAY_IN_KIND_PER_MEAL));
      profile.hunger = Math.min(100, (profile.hunger ?? 0) + 25 * meals);
      window.NPCLifeSim?.Animals?.feedNpc?.(name, profile);
      profile._paidInKind = (profile._paidInKind || 0) + meals;
      return meals;
    },
  };

  // Lazy reference to trait data (populated once NPCSociety is ready)
  let DataLoader_traits = null;
  function ensureTraits() {
    if (!DataLoader_traits && window._NPCSocietyDataLoader) {
      DataLoader_traits = window._NPCSocietyDataLoader.traits;
    }
  }

  // The lowercased name of trait `id` (the first entry of that id, "" when
  // there is none), off an index built once per trait list. The routine, the
  // dispatcher and the minigame picker ask it of every trait of everybody they
  // weigh, once a game minute, and each ask used to be a find over the list.
  let _traitNameSrc = null, _traitNameLen = -1, _traitNameIdx = null;
  function traitNameLower(id) {
    ensureTraits();
    const list = DataLoader_traits;
    if (!list) return "";
    if (_traitNameSrc !== list || _traitNameLen !== list.length) {
      _traitNameIdx = new Map();
      for (const t of list) {
        if (t && !_traitNameIdx.has(t.id)) _traitNameIdx.set(t.id, String(t.name || "").toLowerCase());
      }
      _traitNameSrc = list;
      _traitNameLen = list.length;
    }
    return _traitNameIdx.get(id) || "";
  }

  // ============================================================================
  // SECTION 9c, SERVING AT WORK
  // ============================================================================
  // Somebody walking up to a counter, a bar or a desk on a map where a
  // worker is on shift beside it is served by that worker: a line each in
  // their thought bubbles, a small tip from the customer's pocket to the
  // worker's, and a little warmth between them. A <Shop> counter manned by a
  // rota persona (the counter event IS the keeper) is served by the persona.
  const WorkServe = {
    TIP_SHARE: 0.02,      // of the customer's pocket
    TIP_MIN: 20,          // 0.20 euros
    TIP_MAX: 300,         // 3.00 euros
    REACH: 3,             // tiles between the worker and what was used
    COOLDOWN_MIN: 30,     // game minutes between two tips from one customer

    serverFor(targetEvent, visitorName) {
      if (!targetEvent || !$gameMap) return null;
      const evId = targetEvent.eventId?.();
      let best = null, bestD = Infinity;
      for (const ctrl of ($gameSystem?.getActiveNPCControllers?.() || [])) {
        if (!ctrl?.event || ctrl.eventName === visitorName) continue;
        if (ctrl.state !== "working") continue;
        const d = Math.abs(ctrl.event.x - targetEvent.x) + Math.abs(ctrl.event.y - targetEvent.y);
        if (ctrl._workSpotId !== evId && d > this.REACH) continue;
        if (d < bestD) { bestD = d; best = ctrl.eventName; }
      }
      if (best) return best;
      const persona = ShopShiftManager.getActivePersona?.($gameMap.mapId(), evId);
      if (persona?.name && persona.name !== visitorName && $gameSystem?._npcSociety?.[persona.name]) return persona.name;
      return null;
    },

    _line(key, name, rngName, salt) {
      const pool = (typeof T.pool === "function") ? T.pool(key) : null;
      let text;
      if (Array.isArray(pool) && pool.length) {
        text = pool[Math.floor(economyRng(rngName, salt).next() * pool.length)];
      } else {
        text = T(key);
        if (text === key) return null;
      }
      return String(text).replace(/\{name\}/g, name);
    },

    serve(visitorName, targetEvent) {
      const society = $gameSystem?._npcSociety;
      const visitor = society?.[visitorName];
      if (!visitor) return null;
      const NC = window.NPCCreature;
      if (NC?.isNonSentientProfile?.(visitor)) return null;
      const serverName = this.serverFor(targetEvent, visitorName);
      const server = serverName ? society[serverName] : null;
      // A beast behind the counter serves only where beasts work (a monster
      // world, NPCCreature.mayWork), and even there takes no euros for it.
      if (!server) return null;
      if (NC?.mayWork ? !NC.mayWork(server, serverName) : NC?.isNonSentientProfile?.(server)) return null;
      const serverTakesMoney = NC?.mayHoldMoney ? NC.mayHoldMoney(server, serverName) : true;

      const minute = $gameVariables?.value(114) ?? 0;
      let tip = 0;
      if (serverTakesMoney && minute - (visitor._lastTipMinute ?? -Infinity) >= this.COOLDOWN_MIN) {
        tip = Math.min(this.TIP_MAX, Math.max(this.TIP_MIN, Math.floor((visitor.money || 0) * this.TIP_SHARE)));
        if ((visitor.money || 0) < tip * 5) tip = 0;   // nobody tips their last coins
        if (tip) {
          visitor.money -= tip;
          server.money = Math.min(MONEY_CAP, (server.money || 0) + tip);
          visitor._lastTipMinute = minute;
        }
      }
      bumpMutualOpinion(visitorName, serverName, 1);
      server._lastServedMinute = minute;
      const said = this._line("NPCSim.work.served", visitorName, serverName, "served_" + minute);
      const heard = this._line("NPCSim.work.thanked", serverName, visitorName, "thanked_" + minute);
      if (said) ThoughtGenerator._push(server, said);
      if (heard) ThoughtGenerator._push(visitor, heard);
      // Across the counter is a brief exposure (Health_DiseaseSystem).
      try { window.DiseaseSystem?.onNpcContact?.(visitorName, serverName, "shop"); } catch (_) { /* optional */ }
      EventBus.emit("npc:work_served", { server: serverName, customer: visitorName, tip, eventRef: targetEvent });
      return { server: serverName, tip };
    },

    // The quiet hours behind a counter and the end of them. A keeper on a
    // counter shift (currentNeed "shopwork") with nobody served for a while
    // now and then says so on a work tick (NPCSim.work.idle); one whose
    // counter shift has just ended says goodbye to it (NPCSim.work.closing).
    // A beast keeps no such thoughts (NPCCreature).
    IDLE_CHANCE: 0.15,     // per work tick, once the counter has been quiet
    IDLE_AFTER_MIN: 30,    // game minutes without a customer before it counts
    IDLE_GAP_MIN: 45,      // game minutes between two idle remarks of one keeper
    CLOSING_CHANCE: 0.5,   // per counter shift that ends in front of the party

    _speaks(profile, name) {
      return !!profile && !window.NPCCreature?.isHeldToBeastRules?.(profile, name);
    },

    idle(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!this._speaks(profile, name) || profile.currentNeed !== "shopwork") return null;
      const minute = $gameVariables?.value(114) ?? 0;
      if (minute - (profile._lastServedMinute ?? -Infinity) < this.IDLE_AFTER_MIN) return null;
      if (minute - (profile._lastIdleMinute ?? -Infinity) < this.IDLE_GAP_MIN) return null;
      if (economyRng(name, "idleRoll_" + minute).next() >= this.IDLE_CHANCE) return null;
      profile._lastIdleMinute = minute;
      const line = this._line("NPCSim.work.idle", name, name, "idle_" + minute);
      if (line) ThoughtGenerator._push(profile, line);
      return line;
    },

    closing(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!this._speaks(profile, name) || !$gameSystem?._npcShopAssignments?.[name]) return null;
      const minute = $gameVariables?.value(114) ?? 0;
      // Both the dispatcher and the controller can report the same shift end.
      if (profile._lastClosingMinute === minute) return null;
      profile._lastClosingMinute = minute;
      if (economyRng(name, "closingRoll_" + minute).next() >= this.CLOSING_CHANCE) return null;
      const line = this._line("NPCSim.work.closing", name, name, "closing_" + minute);
      if (line) ThoughtGenerator._push(profile, line);
      return line;
    },
  };

  EventBus.on("npc:interact", ({ name, targetEvent }) => {
    if (!targetEvent) return;
    WorkServe.serve(name, targetEvent);
  });
  EventBus.on("npc:work_tick", ({ name }) => { WorkServe.idle(name); });
  EventBus.on("npc:shift_end", ({ name }) => { WorkServe.closing(name); });

  // ============================================================================
  // SECTION 11c, SHOP SHIFT MANAGER
  // ============================================================================
  // "Shop" events with no graphic of their own are covered around the
  // clock by three 8-hour shifts (00-08, 08-16, 16-24), each staffed by a
  // persona drawn from the map group's own NPC pool (window.NPCSystem.getNPCPool).
  //
  // A "Shop" event the map author DID draw a face on is left out of all of
  // this (see isShopEvent): that face is a shopkeeper of their own, not a
  // fixture, and they stand their counter at every hour of every day.
  //
  // For now this is purely cosmetic: 3 random NPCs are picked per Shop event
  // (regardless of whether they already have a job/routine elsewhere) and
  // only the event's graphic, hover name (MousePan), and Empathize info
  // reflect them. Their actual schedule/position is untouched.
  //
  // Personas are decided once per map entry (assignPersonas, called from
  // NPCSystem's setupNPCControllers). The same [mapId,evId] always resolves
  // to the same trio, re-entering the shop, or coming back another day,
  // shows the same three faces.
  //
  // TODO: map every <Shop> event to its coordinates and pick personas more
  // deliberately (e.g. avoid double-booking the same NPC across shops/shifts).
  //
  // Sprite swap uses ev.setImage(). Cache is reset on map change so stale
  // event refs don't linger.

  const ShopShiftManager = {
    _personas: {},   // "mapId_evId" → { 0: <persona>, 1: <persona>, 2: <persona> }
    _applied:  {},   // "mapId_evId" → last-applied shift index (0-2)
    _lastAppliedShift: {}, // mapId → last shift fully applied to every shop on that map
    _shopEventsCache: null, // cached list of this map's <Shop> events
    _shopEventsMapId: -1,
    _fallbackApplied: {}, // "mapId_evId" → true once a stand-in sprite was drawn

    // The rotas that belong to the world rather than to the visit: a counter on
    // a real, uniquely-numbered map is manned by the same three people in every
    // savegame of the world, decided once when the world is made (see
    // assignWorldShopPersonas). Interior counters are NOT persisted here: a
    // building reached through a door borrows a shared house-template map, so
    // "mapId_evId" is the same key for every building using that template and
    // the rota has to stay scoped to the building currently entered.
    _persistedPersonas() {
      if (!$gameSystem) return {};
      if (!$gameSystem._npcShopPersonas) $gameSystem._npcShopPersonas = {};
      return $gameSystem._npcShopPersonas;
    },

    _getPersonas(key) {
      if (this._personas[key]) return this._personas[key];
      const stored = this._persistedPersonas()[key];
      if (stored) this._personas[key] = stored;
      return stored || null;
    },

    _setPersonas(key, shifts, persist) {
      this._personas[key] = shifts;
      if (persist) this._persistedPersonas()[key] = shifts;
    },

    // A <Shop> counter belongs to the rota only while it has no graphic of its
    // own. A face drawn on it by the map author names the one person who keeps
    // that till: they are never covered, never swapped at a shift boundary and
    // are always found standing there, so every pass here has to walk past them
    // and every reader (npcNameForEvent, the Empathize panel, MousePan) falls
    // back to the event's own identity.
    //
    // The verdict is cached on the Game_Event because _applyPersonaSprite
    // writes the covering persona onto the page data: asking the same question
    // a second time would then see a graphic that the author never drew. The
    // first ask always precedes any such write (every application path filters
    // through here first) and Game_Event objects are rebuilt from the map file
    // on setup, so the cached answer is always the one taken from clean data.
    // <Story> exempts a counter for the same reason: the tag names one written
    // person, so <Shop> + <Story> is a single shopkeeper who is found at their
    // till at every hour, never covered and never swapped at a shift boundary,
    // whether or not the author drew their face on the event.
    isShopEvent(ev) {
      if (!ev) return false;
      if (ev._npcShopRota === undefined) {
        const data = ev.event();
        const tagged = !!window.NPCSystem?.hasShopTag?.(data?.note);
        // <Local> + <Shop> is the same: the town's own shopkeeper, found at
        // their till at every hour (and still a shop to be robbed).
        const owned = !!window.NPCSystem?.hasOwnGraphic?.(data)
          || !!window.NPCSystem?.hasStoryTag?.(data?.note)
          || !!window.NPCSystem?.hasLocalTag?.(data?.note);
        ev._npcShopRota = tagged && !owned;
        if (tagged && !ev._npcShopRota) this._releaseRota($gameMap?.mapId(), ev.eventId());
        // Recruiting a counter's keeper never flips the counter (vacate()
        // blanks the shift instead), so its self-switch A page is only ever a
        // leftover template artifact, never a legitimate "joined" state. A stray ON flips the counter onto that blank/no-command page
        // (through the ordinary page-condition machinery) and strands it: still
        // drawn with a face (the persona sprite is written to every page) but
        // walkable and unresponsive. Cleared the moment the counter is
        // (re)classified, so a save corrupted before this fix self-heals the
        // next time the map is entered.
        if (tagged && $gameMap) {
          const key = [$gameMap.mapId(), ev.eventId(), 'A'];
          if ($gameSelfSwitches?.value(key)) {
            $gameSelfSwitches.setValue(key, false);
            ev.refresh();
          }
        }
      }
      return ev._npcShopRota;
    },

    // Hands back a rota this counter should never have had. Worlds made before
    // author-drawn shopkeepers were recognised staffed them like any other
    // counter, which left three citizens believing they worked a till that has
    // its own keeper: they showed as "at work" all day and were held out of the
    // map's spawn roster. Runs once per event, the first time the counter is
    // recognised as static.
    _releaseRota(mapId, evId) {
      if (!$gameSystem || mapId == null) return;
      const key = `${mapId}_${evId}`;
      const stored = this._persistedPersonas()[key];
      if (!stored) return;
      delete this._persistedPersonas()[key];
      delete this._personas[key];
      const assigns  = $gameSystem._npcShopAssignments || {};
      const reserved = $gameSystem._npcShopReservedNames?.[mapId];
      for (const persona of Object.values(stored)) {
        const name = persona?.name;
        const a = name ? assigns[name] : null;
        // Only the shift held at THIS counter is released, a persona booked
        // elsewhere keeps the shift it really works.
        if (!a || a.mapId !== mapId || a.eventId !== evId) continue;
        delete assigns[name];
        const prof = $gameSystem._npcSociety?.[name];
        if (prof) prof._routineDay = -1; // today's routine still says "shopkeeper"
        const i = reserved ? reserved.indexOf(name) : -1;
        if (i >= 0) reserved.splice(i, 1);
      }
    },

    // The map's <Shop> events, cached so updateSprites doesn't re-scan and
    // note-test every event each sim tick. Invalidated by resetMapCache.
    _shopEvents(mapId) {
      if (this._shopEventsCache && this._shopEventsMapId === mapId) return this._shopEventsCache;
      this._shopEventsCache = $gameMap ? $gameMap.events().filter(ev => ev && this.isShopEvent(ev)) : [];
      this._shopEventsMapId = mapId;
      return this._shopEventsCache;
    },

    currentShift() {
      const hour = $gameVariables?.value(23) ?? 12;
      return Math.floor(hour / SHIFT_HOURS) % SHIFT_COUNT;
    },

    // ---- a keeper recruited off their till --------------------------------
    // A rota keeper can be talked into joining the party or walking with it
    // (NPCEmpathize Join / Join as Follower). The counter is not erased the
    // way a recruited citizen's event is: it is a fixture, and two more
    // shifts still work it. The shift they walked out of stands unattended
    // for the rest of the day (blanked, so nobody answers and the shelf can
    // be taken from freely, see isUnattendedEvent), and on the next day a
    // new face is drawn for that shift out of the same candidate pool the
    // rota was built from.
    //
    // The departed are remembered by NAME, not by rota slot: an interior's
    // rota is rebuilt from its seed on every entry and would otherwise put
    // the recruit straight back behind the till. Wherever a recruit turns up
    // in a rota, _slotPersona either leaves that shift vacant (today) or
    // replaces them (any later day).
    _recruitedKeepers() {
      if (!$gameSystem) return {};
      if (!$gameSystem._npcShopRecruited) $gameSystem._npcShopRecruited = {};
      return $gameSystem._npcShopRecruited;
    },
    _vacancies() {
      if (!$gameSystem) return {};
      if (!$gameSystem._npcShopVacancies) $gameSystem._npcShopVacancies = {};
      return $gameSystem._npcShopVacancies;
    },
    _today() {
      return Math.floor(($gameVariables?.value(114) ?? 0) / 1440);
    },

    // The counter as its own shop: an interior counter is the building and
    // floor it stands in (ProceduralHouseSystem.shopInstanceId), never the
    // template map every building drawn from it shares. Vacancies are kept
    // under this, so a keeper recruited in one bakery leaves only that one
    // bakery's till empty.
    _instanceKey(key) {
      const parts = String(key).split('_');
      const mapId = Number(parts[0]), evId = parts[1];
      const P = window.ProceduralHouseSystem;
      const inst = (P && typeof P.shopInstanceId === 'function') ? P.shopInstanceId(mapId) : mapId;
      return `${inst}_${evId}`;
    },
    // Interior rotas live under the building's seed (assignInteriorPersonas);
    // a replacement drawn for one is written back there so it sticks.
    _interiorRotaKeys: {},

    // Takes the keeper of the current shift off this counter. Answers the
    // name of whoever left, or null when nobody from the rota stands there.
    vacate(mapId, evId) {
      const key = `${mapId}_${evId}`;
      const slot = this.currentShift();
      const persona = this._getPersonas(key)?.[slot];
      if (!persona?.name) return null;
      this._recruitedKeepers()[persona.name] = true;
      this._vacancies()[this._instanceKey(key)] = { slot, day: this._today(), name: persona.name };
      // Their shift is nobody's now: the routine that sent them to work,
      // and the reservation that kept them out of the map's roster, go.
      const assigns = $gameSystem?._npcShopAssignments || {};
      const a = assigns[persona.name];
      if (a && a.mapId === mapId && a.eventId === evId) delete assigns[persona.name];
      const reserved = $gameSystem?._npcShopReservedNames?.[mapId];
      const i = reserved ? reserved.indexOf(persona.name) : -1;
      if (i >= 0) reserved.splice(i, 1);
      const prof = $gameSystem?._npcSociety?.[persona.name];
      if (prof) prof._routineDay = -1;
      const ev = ($gameMap && $gameMap.mapId() === mapId) ? $gameMap.event(evId) : null;
      if (ev) this._blankCounter(ev);
      this._applied[key] = slot;
      delete this._lastAppliedShift[mapId];
      return persona.name;
    },

    // True while this counter's current shift stands empty because its
    // keeper was recruited today (or nobody could be found to replace them).
    isVacant(mapId, evId) {
      const key = `${mapId}_${evId}`;
      const slot = this.currentShift();
      const p = this._getPersonas(key)?.[slot];
      if (!p || !this._recruitedKeepers()[p.name]) return false;
      return this._slotPersona(key, slot) === null;
    },

    // The recruit whose till this is, while it stands empty because of them:
    // their name, or null. Taking off it is still a theft, and they saw it
    // (StealingSystemUI).
    vacatedBy(mapId, evId) {
      if (!this.isVacant(mapId, evId)) return null;
      return this._getPersonas(`${mapId}_${evId}`)?.[this.currentShift()]?.name || null;
    },

    // Whoever works this shift, with the recruited resolved: null for a
    // shift left vacant today, a replacement drawn and booked for one whose
    // keeper left on an earlier day.
    _slotPersona(key, slot) {
      const rota = this._getPersonas(key);
      const p = rota?.[slot] || null;
      if (!p || !this._recruitedKeepers()[p.name]) return p;
      const vkey = this._instanceKey(key);
      const vac = this._vacancies()[vkey];
      if (vac && vac.slot === slot && vac.name === p.name && vac.day >= this._today()) return null;
      const next = this._replacementFor(key, p);
      if (!next) return null;
      const parts = key.split('_');
      const mapId = Number(parts[0]), evId = Number(parts[1]);
      const persisted = !!this._persistedPersonas()[key];
      const shifts = Object.assign({}, rota, { [slot]: next });
      this._setPersonas(key, shifts, persisted);
      const rotaKey = this._interiorRotaKeys[key];
      if (rotaKey && $gameSystem?._npcInteriorShopRotas) $gameSystem._npcInteriorShopRotas[rotaKey] = shifts;
      const ev = ($gameMap && $gameMap.mapId() === mapId) ? $gameMap.event(evId) : null;
      const shopName = ev ? (window.NPCSystem?.extractShopName?.(ev.event()) ?? null) : null;
      this._recordAssignments(mapId, evId, shopName, { [slot]: next });
      if (vac && vac.name === p.name) delete this._vacancies()[vkey];
      delete this._applied[key];
      delete this._lastAppliedShift[mapId];
      return next;
    },

    // A new keeper for a shift its old one walked out of: the departed
    // keeper's own town first, then anybody free, seeded on the counter and
    // the day so the same face takes the till however often it is asked.
    _replacementFor(key, departed) {
      const group = $gameSystem?._npcSociety?.[departed.name]?._homeGroupName || null;
      const used = new Set(Object.keys($gameSystem?._npcShopAssignments || {}));
      const gone = this._recruitedKeepers();
      const pool = this._candidates(group).filter(c => c && !used.has(c.name) && !gone[c.name]);
      if (!pool.length) return null;
      const local = pool.filter(c => c.local);
      const src = local.length ? local : pool;
      const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      const rng = new MiniRng(nameHash(key + '_shopVacancy_' + this._today()) ^ worldSeed);
      return src[rng.int(0, src.length - 1)];
    },

    // ---- what the keeper on shift thinks of the party ---------------------
    // A keeper who likes the party takes something off the sticker. The
    // party's standing with them is the MEDIAN of what they think of each
    // member (the per-member opinion the Empathize panel reads), so one
    // charmer cannot buy the whole party a discount. Nothing below
    // KEEPER_LIKING_FLOOR; from there it climbs straight to
    // KEEPER_MAX_DISCOUNT at full opinion. Only ever a discount.
    KEEPER_LIKING_FLOOR: 20,
    KEEPER_MAX_DISCOUNT: 0.20,

    // Whoever keeps this counter right now, with their society profile:
    // { name, profile } or null when nobody does (a vacant shift, an
    // unknown keeper, a counter on another map).
    _keeperAt(mapId, evId) {
      if (!$gameMap || $gameMap.mapId() !== mapId) return null;
      const ev = $gameMap.event(evId);
      if (!ev || this.isUnattendedEvent(ev)) return null;
      const covered = this.isShopEvent(ev);
      const persona = covered ? this.getActivePersona(mapId, evId) : null;
      if (covered && !persona) return null;
      const name = persona?.name || ev.event()?.name?.trim() || '';
      const profile = name ? $gameSystem?._npcSociety?.[name] : null;
      return profile ? { name, profile } : null;
    },

    // { name, opinion, discount } for whoever keeps this counter right now,
    // or null when nobody does (a vacant shift, an unknown keeper).
    keeperDisposition(mapId, evId) {
      const keeper = this._keeperAt(mapId, evId);
      if (!keeper) return null;
      const { name, profile } = keeper;
      const H = window.NPCEmpathize?._helpers;
      const preds = H?._computePartyPredisposition ? H._computePartyPredisposition(profile) : [];
      if (!preds.length || !H._medianScore) return null;
      const opinion = H._medianScore(preds);
      const over = Math.max(0, opinion - this.KEEPER_LIKING_FLOOR);
      const discount = Math.min(this.KEEPER_MAX_DISCOUNT,
        this.KEEPER_MAX_DISCOUNT * over / (100 - this.KEEPER_LIKING_FLOOR));
      return { name, opinion, discount };
    },

    // ---- a customer is remembered -----------------------------------------
    // Buying from a keeper warms them to the whole party, every member at
    // once: one point a purchase, one more for every KEEPER_GOODWILL_STEP
    // spent on it, never more than KEEPER_GOODWILL_MAX from one purchase.
    // A keeper warms by at most KEEPER_GOODWILL_DAILY a day, so buying
    // matches one at a time cannot buy a friendship. This is the opinion
    // keeperDisposition reads, so a regular is quoted less over time.
    KEEPER_GOODWILL_STEP: 2000,   // 2000 gold = 20.00 euros
    KEEPER_GOODWILL_MAX: 5,
    KEEPER_GOODWILL_DAILY: 10,

    // Answers the opinion each member gained, 0 when nobody was there to
    // remember the sale or today's warmth is spent.
    noteKeeperSale(mapId, evId, gold) {
      const spent = Math.max(0, Number(gold) || 0);
      if (!(spent > 0)) return 0;
      const keeper = this._keeperAt(mapId, evId);
      const add = window.NPCEmpathize?._helpers?._addNpcOpinion;
      if (!keeper || typeof add !== 'function') return 0;
      const profile = keeper.profile;
      const today = this._today();
      const book = profile._shopGoodwill && profile._shopGoodwill.day === today
        ? profile._shopGoodwill : (profile._shopGoodwill = { day: today, gained: 0 });
      const want = Math.min(this.KEEPER_GOODWILL_MAX, 1 + Math.floor(spent / this.KEEPER_GOODWILL_STEP));
      const delta = Math.min(want, this.KEEPER_GOODWILL_DAILY - book.gained);
      if (!(delta > 0)) return 0;
      book.gained += delta;
      for (const actor of ($gameParty?.members?.() || [])) {
        if (actor && typeof actor.actorId === 'function') add(profile, actor.actorId(), delta);
      }
      return delta;
    },

    // ---- a theft from the till a recruit walked out of -------------------
    // Their old shelf is nobody's to mind and nobody's to take. The one who
    // kept it is standing right there with the party: they think less of
    // every OTHER member for it (two points, one more for every
    // KEEPER_GOODWILL_STEP the thing was worth, at most ten). Answers the
    // opinion lost, 0 when the till is not a recruit's.
    noteVacantTheft(mapId, evId, gold) {
      const name = this.vacatedBy(mapId, evId);
      const profile = name ? $gameSystem?._npcSociety?.[name] : null;
      const add = window.NPCEmpathize?._helpers?._addNpcOpinion;
      if (!profile || typeof add !== 'function') return 0;
      const worth = Math.max(0, Number(gold) || 0);
      const delta = Math.min(10, 2 + Math.floor(worth / this.KEEPER_GOODWILL_STEP));
      for (const actor of ($gameParty?.members?.() || [])) {
        if (!actor || typeof actor.actorId !== 'function') continue;
        if (typeof actor.name === 'function' && actor.name() === name) continue;
        add(profile, actor.actorId(), -delta);
      }
      return delta;
    },

    // ---- a zombie world's counters ---------------------------------------
    // A fifth of the tills were left where they stood when the dead got up:
    // nobody is ever behind one again and nothing is ever ordered in for it,
    // its shelf frozen exactly the way an empty world's is (see
    // ItemSystemShop.getShopDateKey). The ones still trading keep no full rota
    // either: one person stands the daytime shift and the counter is left to
    // itself the other sixteen hours, still a till, just nobody minding it.
    ZOMBIE_ABANDONED_SHARE: 0.2,
    ZOMBIE_OPEN_SHIFT: 1,   // 08:00-16:00, the only hours anybody keeps

    _isZombieWorld() {
      return !!window.WorldManager?.isZombieWorld?.();
    },

    // Was this counter abandoned? Pure in (map, event, world seed, salt), so a
    // till shut in one savegame of a world is shut in every other. `salt` is
    // the building coordinate seed for an interior counter, whose map+event
    // key is shared by every building using that template.
    isShopAbandoned(mapId, evId, salt) {
      if (!this._isZombieWorld()) return false;
      const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      const h = (nameHash(`${mapId}_${evId}_shopAbandoned`) ^ worldSeed ^ ((salt || 0) >>> 0)) >>> 0;
      return (h % 1000) / 1000 < this.ZOMBIE_ABANDONED_SHARE;
    },

    // Is this counter one of the abandoned ones, asked from outside the rota
    // (ItemSystemShop, for whether its shelf is ever restocked)? Answered off
    // the rota itself wherever one has been decided, since an interior's rota
    // is keyed to the building actually entered rather than to the template map
    // it borrows its id from, and off the seeded roll otherwise.
    isAbandonedCounter(mapId, evId) {
      if (!this._isZombieWorld()) return false;
      const stored = this._getPersonas(`${mapId}_${evId}`);
      if (stored) return !Object.keys(stored).length;
      return this.isShopAbandoned(mapId, evId);
    },

    // Is nobody behind this counter right now? True for a till stripped back to
    // no graphic at all, whether the rota left it uncovered this shift, the
    // counter was abandoned for good, or an empty world blanked it. Asked of
    // the live event where it is on the current map, and off the abandoned
    // roll for one elsewhere. A counter nobody minds cannot be spoken to, and
    // taking from it is neither a risk nor a crime (see StealingSystem).
    isUnattendedEvent(ev) {
      if (!ev || ev._erased) return false;
      if (!(ev._npcShopBlank || ev._npcShopBlanked)) return false;
      return !ev.characterName();
    },

    isUnattendedCounter(mapId, evId) {
      if ($gameMap && $gameMap.mapId() === mapId) {
        const ev = $gameMap.event(evId);
        if (ev) return this.isUnattendedEvent(ev);
      }
      return this.isAbandonedCounter(mapId, evId);
    },

    // The shifts this counter is staffed for at all: every one of them in an
    // ordinary world, the daytime one alone in a zombie world, none where the
    // till was abandoned.
    _shiftsToStaff(mapId, evId, salt) {
      if (!this._isZombieWorld()) {
        const all = [];
        for (let s = 0; s < SHIFT_COUNT; s++) all.push(s);
        return all;
      }
      return this.isShopAbandoned(mapId, evId, salt) ? [] : [this.ZOMBIE_OPEN_SHIFT];
    },

    // Strips a counter back to an unattended till: the empty world's treatment
    // (NPCSystem's blankShopCounter), applied per shift rather than for good,
    // so the same event is manned again when the day shift comes round.
    _blankCounter(ev) {
      const data = ev?.event?.();
      if (!data) return;
      if (ev._npcShopBlank && !ev.characterName()) return;
      ev._npcShopBlank = true;
      for (const page of (data.pages || [])) {
        if (page?.image) { page.image.characterName = ""; page.image.characterIndex = 0; }
      }
      ev.refresh();
      ev.setImage("", 0);
      ev.setThrough(false);
      ev.setPriorityType(1);
    },

    // True while any live <Shop> counter on the map is still without a rota.
    // Lets the staging pass (stageShopPersonas, NPCSystem.js) skip the whole
    // candidate-pool walk on the Scene_Map builds that decide nothing new,
    // every return from the menu among them.
    needsStaffing(mapId) {
      for (const ev of this._shopEvents(mapId)) {
        if (!ev || ev._erased) continue;
        if (!this._getPersonas(`${mapId}_${ev.eventId()}`)) return true;
      }
      return false;
    },

    // Builds the ordered candidate list a Shop event's personas are drawn from.
    // Local-group NPCs flagged as shopkeeper-eligible (job-less locals reserved
    // during job assignment, see JobShiftManager + _npcShopkeeperPool) come
    // FIRST and are marked { local: true }. World-wide NPCs (every other group's
    // templates, via the GLOBAL pool) follow as { local: false } fallback, used
    // by assignPersonas only once the local free pool is exhausted.
    // Two questions, and a candidate has to pass both. The SHEET first (see
    // NPCSystem.isShopEligibleSprite): a creature or an animal keeps no till in
    // an ordinary world whatever class it was dealt, unless its entry says
    // `dogShop`, the shop dog that is the shopkeeper. Then the CLASS: a
    // non-sentient one (Feral, Mimic, Monster...) cannot mind a counter either.
    // Only a monster world's population is made of exactly these, so there they
    // are the only kind of shopkeeper there is and both questions answer yes.
    _shopEligible(name, spriteName) {
      if (!window.NPCSystem?.isShopEligibleSprite?.(spriteName)) return false;
      // Where beasts work (WorldModes.beastsWork, a monster world) they are
      // the only kind of shopkeeper there is.
      if (window.NPCCreature?.beastsWork ? window.NPCCreature.beastsWork() : !!window.WorldManager?.isMonsterWorld?.()) return true;
      // A child minds no counter (SECTION 11b4).
      if (window.NPCLifeSim?.isMinor?.(name)) return false;
      const NC = window.NPCCreature;
      return !NC?.isNonSentientByName?.(name);
    },

    _candidates(groupName) {
      if (!window.NPCSystem?.getNPCPool) return [];
      const spriteOf = (ev) => {
        const img = (ev?.pages || []).map(p => p?.image).find(im => im?.characterName);
        return img ? { spriteName: img.characterName, charIdx: img.characterIndex || 0 } : null;
      };

      const seen      = new Set();
      const out       = [];
      const localNames = new Set(); // every name belonging to the local group

      // 1) Local free shopkeeper pool first.
      if (groupName) {
        JobShiftManager.ensureGroupAssignments(groupName); // make sure the pool exists
        let localTemplates = [];
        try { localTemplates = window.NPCSystem.getNPCPool(groupName) || []; } catch (_) {}
        const byName = new Map();
        for (const tpl of localTemplates) {
          const ev = tpl?.eventData;
          if (ev?.name && !/local/i.test(ev.note || "") && !window.NPCSystem?.hasHiddenTag?.(ev.note)) {
            byName.set(ev.name, ev); localNames.add(ev.name);
          }
        }
        for (const name of ($gameSystem?._npcShopkeeperPool?.[groupName] || [])) {
          if (seen.has(name)) continue;
          const sprite = spriteOf(byName.get(name));
          if (!sprite || !this._shopEligible(name, sprite.spriteName)) continue;
          seen.add(name);
          out.push({ name, ...sprite, local: true });
        }
      }

      // 2) Other map groups (out-of-towners), used only when the local free
      //    pool runs out: the residents of every other town, commuting in.
      //    Local-group residents outside the reserved shopkeeper pool are
      //    deliberately NOT eligible, only the reserved percentage of free
      //    locals stand a counter; everyone else stays in their own routine.
      let others = [];
      try { others = window.NPCSystem.getWorldResidents?.() || []; } catch (_) {}
      for (const r of others) {
        if (!r?.name || r.group === groupName || seen.has(r.name) || localNames.has(r.name)) continue;
        if (!r.characterName || !this._shopEligible(r.name, r.characterName)) continue;
        seen.add(r.name);
        out.push({ name: r.name, spriteName: r.characterName, charIdx: r.characterIndex || 0, local: false });
      }
      return out;
    },

    // Decides (and caches) the trio of shift personas for every "Shop" event
    // on the given map, called once on map setup. Each persona covers one 8h
    // shift, and an NPC holds at most one shop shift across the whole world
    // (no double-booking): free locals are spent before any out-of-towner.
    assignPersonas(mapId, groupName) {
      if (!$gameMap) return;
      const candidates = this._candidates(groupName);
      if (!candidates.length) return;

      // Names already committed to a shop shift (persisted across maps) keep
      // their one slot, exclude them so nobody mans two counters at once.
      const used = new Set(Object.keys($gameSystem?._npcShopAssignments || {}));
      const localFree = [];
      const fallback  = [];
      for (const c of candidates) {
        if (used.has(c.name)) continue;
        (c.local ? localFree : fallback).push(c);
      }

      // Draw the next free persona, preferring the local pool; only dip into
      // the out-of-town fallback once every free local is spoken for.
      const takeNext = (rng) => {
        const src = localFree.length ? localFree : fallback;
        if (!src.length) return null;
        return src.splice(rng.int(0, src.length - 1), 1)[0];
      };

      for (const ev of $gameMap.events()) {
        if (!ev || ev._erased || !this.isShopEvent(ev)) continue;
        const evId = ev.eventId();
        const key  = `${mapId}_${evId}`;
        // World initialization already decided this counter's trio; reading it
        // back is what keeps the same faces behind it in every savegame.
        if (this._getPersonas(key)) continue;

        // Seeded on the physical event instance (map+id), not its name,
        // shop events sharing a generic name (e.g. "Shop") must still each
        // resolve to their own distinct, stable persona trio. XOR'd with the
        // history generator's world seed, like other seeded NPC rolls.
        const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
        const rng = new MiniRng(nameHash(key + '_shopShift') ^ worldSeed);
        const shifts = {};
        for (const s of this._shiftsToStaff(mapId, evId)) {
          // Last resort (everyone in the world is already booked): reuse a
          // random candidate rather than leave the counter unstaffed.
          shifts[s] = takeNext(rng) || rng.pick(candidates);
        }
        // An abandoned till is stored as an empty rota rather than left
        // undecided, so nothing keeps trying to staff it every map load.
        this._setPersonas(key, shifts, true);
        this._recordAssignments(mapId, evId, window.NPCSystem?.extractShopName?.(ev.event()) ?? null, shifts);
      }

      this.updateSprites();
    },

    // Staffs every <Shop> counter on a freshly entered interior (a house/shop
    // template reached through a door) with a seeded three-shift rota. Unlike
    // assignPersonas, which draws from a settled on-map group roster, an interior
    // has no roster of its own: candidates are the town's own citizens first
    // (the people the player met outside), and any shift still uncovered is
    // manned by a persona fabricated deterministically from the building's
    // coordinate `seed`, so a shop counter is never left empty. `groupName` may
    // be null (no town context), in which case every shift is a seeded persona.
    assignInteriorPersonas(mapId, groupName, seed) {
      if (!$gameMap) return;
      const shopEvents = $gameMap.events().filter(ev => ev && !ev._erased && this.isShopEvent(ev));
      if (!shopEvents.length) return;

      // Town candidates only: society citizens of this settlement plus the
      // group's own free-shopkeeper pool (the { local:true } half of the
      // roster). Out-of-town wanderers are deliberately excluded here, an
      // uncovered shift is filled by a seeded persona instead. Names already
      // manning a counter elsewhere are excluded so nobody stands two at once.
      const society = window.NPCSystem?.getShopSocietyCandidates?.(groupName) || [];
      const roster  = this._candidates(groupName).filter(c => c && c.local);
      const used = new Set(Object.keys($gameSystem?._npcShopAssignments || {}));
      const seen = new Set();
      const townPool = [];
      for (const c of [...society, ...roster]) {
        if (!c?.name || seen.has(c.name) || used.has(c.name)) continue;
        seen.add(c.name);
        townPool.push(c);
      }

      const baseSeed = (seed >>> 0) || 1;
      // The rota a building's counter was given is kept under the building's
      // own seed (parent map + door tile), not the template's map+event key,
      // and outlives the session cache that every map load clears. Without it
      // a re-entry redrew the trio, and since the first draw had already booked
      // its names in _npcShopAssignments, a different trio came out each time.
      const rotas = $gameSystem
        ? ($gameSystem._npcInteriorShopRotas = $gameSystem._npcInteriorShopRotas || {})
        : {};
      for (const ev of shopEvents) {
        const evId = ev.eventId();
        const key  = `${mapId}_${evId}`;
        // Session cache only: this key belongs to a shared interior template,
        // so it must not be read back from (or written to) the world store.
        const rotaKey = `${baseSeed}_${evId}`;
        this._interiorRotaKeys[key] = rotaKey;
        if (this._personas[key]) continue;
        const kept = rotas[rotaKey];
        if (kept) {
          this._setPersonas(key, kept, false);
          if (Object.keys(kept).length) {
            this._recordAssignments(mapId, evId, window.NPCSystem?.extractShopName?.(ev.event()) ?? null, kept);
          }
          continue;
        }

        // Seeded on the building coords + this counter's id so the rota is
        // stable across re-entries yet distinct per shop, like assignPersonas.
        const rng = new MiniRng(nameHash(key + '_interiorShop') ^ baseSeed);
        const shifts = {};
        // The building's own seed salts the abandoned roll: this map+event key
        // belongs to a shared template, so without it a shut till would be shut
        // in every building drawn from that template.
        for (const s of this._shiftsToStaff(mapId, evId, baseSeed)) {
          let persona = townPool.length
            ? townPool.splice(rng.int(0, townPool.length - 1), 1)[0]
            : null;
          if (!persona) {
            persona = window.NPCSystem?.generateSeededPersona?.(
              (baseSeed ^ (evId * 2654435761) ^ (s * 40503)) >>> 0
            );
          }
          if (persona) shifts[s] = persona;
        }
        if (Object.keys(shifts).length) {
          this._setPersonas(key, shifts, false);
          rotas[rotaKey] = shifts;
          this._recordAssignments(mapId, evId, window.NPCSystem?.extractShopName?.(ev.event()) ?? null, shifts);
        } else if (this._isZombieWorld()) {
          // Abandoned: an empty rota, so the counter is never staffed and never
          // asked again while this interior is entered.
          this._setPersonas(key, {}, false);
          rotas[rotaKey] = {};
        }
      }

      this.updateSprites();
    },

    // Persists each persona's shop coverage to $gameSystem so routines
    // (_inShopShift), the Empathize schedule tab, and the spawn reservation
    // filter all see who's "behind the counter" and when. First shop wins
    // per NPC, a persona double-booked across maps keeps its first one
    // (deterministic, since persona rolls are seeded).
    // `shopName` is passed in rather than read off the event, so the world
    // initialization pass can record a counter it is not standing in front of.
    _recordAssignments(mapId, evId, shopName, shifts) {
      if (!$gameSystem) return;
      const mapName  = $dataMapInfos?.[mapId]?.name || T('NPCSim.mapFallback', { id: mapId });
      const assigns  = $gameSystem._npcShopAssignments  = $gameSystem._npcShopAssignments  || {};
      const reserved = $gameSystem._npcShopReservedNames = $gameSystem._npcShopReservedNames || {};
      const mapReserved = reserved[mapId] = reserved[mapId] || [];
      for (let s = 0; s < SHIFT_COUNT; s++) {
        const p = shifts[s];
        if (!p?.name) continue;
        if (!assigns[p.name]) {
          assigns[p.name] = { shift: s, mapId, eventId: evId, mapName, shopName };
          // Today's routine may have been cached before this NPC became a
          // shopkeeper, drop it so the shift shows up immediately.
          const prof = $gameSystem._npcSociety?.[p.name];
          if (prof) prof._routineDay = -1;
        }
        if (!mapReserved.includes(p.name)) mapReserved.push(p.name);
      }
    },

    // ── A keeper's counter, read from anywhere ────────────────────────────
    // Everything there is to say about where one person stands a till: the
    // shop, their shift, the other two on the rota and what is on the shelf
    // today with how many of each are left. Null for anybody who keeps no
    // counter. Read by the Empathize dossier and by the chat context, which
    // is how a keeper messaged from across the world can say what they have.
    workplaceOf(name) {
      const who = String(name || '');
      const assign = who ? $gameSystem?._npcShopAssignments?.[who] : null;
      if (!assign) return null;
      const { mapId, eventId } = assign;
      const rota = this._rotaOf(who, mapId, eventId);
      const colleagues = [];
      for (let s = 0; s < SHIFT_COUNT; s++) {
        const p = rota?.[s];
        if (p?.name && p.name !== who) colleagues.push({ name: p.name, shift: s });
      }
      return {
        mapId, eventId,
        shift: assign.shift,
        mapName: assign.mapName,
        shopName: assign.shopName || null,
        colleagues,
        shelf: this._shelfAt(mapId, eventId),
      };
    },

    // The hours one shift of the rota covers, as { from, to } on the clock.
    shiftHours(shift) {
      const from = (Number(shift) || 0) * SHIFT_HOURS;
      return { from, to: (from + SHIFT_HOURS) % 24 };
    },

    // The rota a person is on. A world counter keeps it under its map and
    // event; a counter inside a building keeps it under the building's seed,
    // so that one is found by who is on it.
    _rotaOf(name, mapId, eventId) {
      const has = rota => !!rota && Object.values(rota).some(p => p?.name === name);
      const key = `${mapId}_${eventId}`;
      const own = this._persistedPersonas()[key] || this._personas[key];
      if (has(own)) return own;
      const interior = $gameSystem?._npcInteriorShopRotas || {};
      for (const rotaKey of Object.keys(interior)) {
        if (rotaKey.endsWith(`_${eventId}`) && has(interior[rotaKey])) return interior[rotaKey];
      }
      return null;
    },

    // What one counter sells and how many of each are left today, off the
    // event's own pages (ShopScanner) and the counter's own stock record
    // (ShopStock, the numbers the till sells from). A row asked about for the
    // first time is rolled on the spot, exactly as the till would roll it.
    _shelfAt(mapId, eventId) {
      const SC = window.ShopScanner;
      const loader = window.NPCSystem?._internal?.MapManager;
      if (!SC?.shelfOf || !loader?.loadMapData) return [];
      let data = null;
      try { data = loader.loadMapData(mapId); } catch (e) { data = null; }
      const ev = data?.events?.[eventId];
      if (!ev) return [];
      const SS = window.ShopStock;
      const seen = new Set();
      const out = [];
      for (const row of SC.shelfOf(mapId, ev, ev.x, ev.y)) {
        const key = `${row.type}_${row.id}`;
        if (!row.data || seen.has(key)) continue;
        seen.add(key);
        let stock = null;
        try {
          const n = SS ? SS.get(mapId, eventId, row.data) : null;
          stock = (Number.isFinite(n) && n !== SS.UNLIMITED) ? n : null;
        } catch (e) { stock = null; }
        out.push({ type: row.type, id: row.id, item: row.data, stock });
      }
      return out;
    },

    updateSprites() {
      if (!$gameMap) return;
      const mapId = $gameMap.mapId();
      const slot  = this.currentShift();
      // Nothing changed since we last fully applied this slot to this map's shops
      if (this._lastAppliedShift[mapId] === slot) return;

      // Tracks whether every live shop got its persona this pass; only then is
      // the map-level shortcut above armed. Keeps the deferred-assignPersonas
      // case (personas not yet populated) re-attempting on later ticks.
      let allApplied = true;
      for (const ev of this._shopEvents(mapId)) {
        if (!ev || ev._erased) continue; // erased shop has nothing to draw
        const evId = ev.eventId();
        const key  = `${mapId}_${evId}`;
        if (this._applied[key] === slot) continue;

        // Resolve the persona BEFORE marking this slot applied. Marking first
        // would poison the cache if a sim tick runs updateSprites() before
        // assignPersonas() has populated _personas (e.g. an in-game minute
        // boundary lands between Game_Map.setup's resetMapCache and the
        // deferred assignPersonas on a regular group map): the early no-op
        // would set _applied[key]=slot, and assignPersonas's own
        // updateSprites() would then skip it, leaving the shop graphic empty.
        // A shift whose keeper was recruited today stands empty.
        if (this.isVacant(mapId, evId)) {
          this._blankCounter(ev);
          this._applied[key] = slot;
          continue;
        }
        const persona = this._slotPersona(key, slot);
        // A shift ending while the party watches is walked rather than swapped.
        const prev = this._applied[key];
        if (prev !== undefined && prev !== slot && !this._isZombieWorld() &&
            this._handOver(ev, key, prev, persona)) {
          this._applied[key] = slot;
          continue;
        }
        if (!persona) {
          // A zombie world has nobody to spare for a stand-in: an abandoned
          // till, and any till outside its one daytime shift, simply stands
          // empty (see ZOMBIE_ABANDONED_SHARE).
          if (this._isZombieWorld()) {
            this._blankCounter(ev);
            if (this._getPersonas(key)) this._applied[key] = slot;
            else allApplied = false;
            continue;
          }
          // Rota not built yet (assignPersonas is deferred, or the map's pools
          // weren't ready). Rather than leave the counter standing empty, draw
          // a stand-in citizen once, seeded on the event so it doesn't flicker
          // between ticks. _applied stays unset, so the real persona overwrites
          // it as soon as the rota exists.
          this._applyFallbackSprite(mapId, ev, key);
          allApplied = false;
          continue;
        }
        this._applied[key] = slot;
        this._applyPersonaSprite(ev, persona);
      }

      if (allApplied) this._lastAppliedShift[mapId] = slot;
    },

    // The end of a shift, played out in front of the party: the one going home
    // steps out beside the till and leaves by the map's exit, the till stands
    // vacant (blanked, so pressing on it opens nothing), and the next one comes
    // in by the exit and only takes the till once they have walked up to it
    // (NPCSystem InteriorVisits.beginShopHandover). False when it cannot be
    // walked, and the face is swapped on the spot as it always was.
    _handOver(ev, key, prevSlot, persona) {
      const begin = window.NPCSystem?.beginShopHandover;
      if (typeof begin !== 'function' || !$gameMap) return false;
      if (window.NPCSystem?.hasHiddenTag?.(ev.event()?.note)) return false;
      const outgoing = this._getPersonas(key)?.[prevSlot] || null;
      if (!outgoing && !persona) return false;
      if (outgoing && persona && outgoing.name === persona.name) return false;
      const mapId = $gameMap.mapId();
      // Whoever the till belongs to by the time the walk ends: a long wait can
      // carry the clock past another shift change on the way.
      const seat = () => {
        if (!$gameMap || $gameMap.mapId() !== mapId || $gameMap.event(ev.eventId()) !== ev || ev._erased) return;
        const now = this._slotPersona(key, this.currentShift());
        if (now) this._applyPersonaSprite(ev, now);
        else this._blankCounter(ev);
      };
      this._blankCounter(ev);
      if (begin(ev, outgoing, persona, seat)) return true;
      if (persona) this._applyPersonaSprite(ev, persona);
      return false;
    },

    // Draws the counters whose rota is ALREADY known, and nothing else. Called
    // from Scene_Map.createDisplayObjects (see stageShopPersonas in
    // NPCSystem.js), i.e. before the spriteset exists: Scene_Map.createSpriteset
    // updates the sprites the moment it builds them, so a graphic written this
    // early has its bitmap requested while the scene is still loading and
    // Scene_Base.isReady waits for it. Written any later (setupNPCControllers
    // runs after createDisplayObjects, and a transfer wipes the image cache) the
    // counter stands empty on screen until the sprite catches up and the file
    // comes off disk, which reads as the shopkeeper turning up late.
    // A counter with no rota yet is deliberately left alone here, the stand-in
    // face updateSprites would draw is only worth it once the map is visible.
    applyKnownSprites(mapId) {
      if (!$gameMap || $gameMap.mapId() !== mapId) return;
      const slot = this.currentShift();
      for (const ev of this._shopEvents(mapId)) {
        if (!ev || ev._erased) continue;
        const key = `${mapId}_${ev.eventId()}`;
        if (this._applied[key] === slot) continue;
        if (this.isVacant(mapId, ev.eventId())) {
          this._applied[key] = slot;
          this._blankCounter(ev);
          continue;
        }
        const persona = this._slotPersona(key, slot);
        if (!persona) {
          // An uncovered shift of a zombie world's counter is drawn empty as
          // early as any staffed one, so a persona left on the event by the
          // previous scene is not still standing there when the map appears.
          if (this._isZombieWorld() && this._getPersonas(key)) {
            this._applied[key] = slot;
            this._blankCounter(ev);
          }
          continue;
        }
        this._applied[key] = slot;
        this._applyPersonaSprite(ev, persona);
      }
    },

    // Writing the page data (not just calling setImage) keeps the persona's
    // graphic from being wiped out the next time the event's page refreshes
    // (e.g. on a switch/variable change), since Game_Event.setupPageSettings
    // re-derives _characterName/_characterIndex from page().image every refresh.
    _applyPersonaSprite(ev, persona) {
      const eventData = ev.event();
      // A counter noted "Shop Hidden" is staffed like any other (the persona
      // still works the shift, and still answers when talked to), it just never
      // shows their face. Game_Event.setImage refuses the graphic anyway, but
      // writing it into the page data would leave the event reading as one the
      // author drew a face on (hasOwnGraphic) for anything looking at the raw
      // data afterwards.
      if (window.NPCSystem?.hasHiddenTag?.(eventData?.note)) return;
      for (const page of (eventData?.pages || [])) {
        if (page?.image) {
          page.image.characterName = persona.spriteName;
          page.image.characterIndex = persona.charIdx;
        }
      }
      ev._npcShopBlank = false;
      ev.refresh();
      ev.setImage(persona.spriteName, persona.charIdx);
      ev.setThrough(false);
      ev.setPriorityType(1);
      const cDir = window.NPCSystem?.getCounterFacingDir?.(ev);
      if (cDir) {
        ev.setDirection(cDir);
        ev._originalDirection = cDir;
        ev._prelockDirection = cDir;
        for (const page of (eventData?.pages || [])) {
          if (page?.image) page.image.direction = cDir;
        }
      }
    },

    // Draws a placeholder shopkeeper on a <Shop> counter whose shift rota
    // hasn't been decided yet. A <Shop> event carries no graphic of its own,
    // so without this the counter reads as an empty tile until assignPersonas
    // runs. The sprite is rolled from the same pool the seeded interior
    // shopkeepers use, keyed on map+event id (XOR'd with the world seed) so a
    // given counter always falls back to the same face instead of shuffling
    // every sim tick. Applied at most once per event; leaves _applied alone so
    // the genuine persona replaces it on the next pass.
    _applyFallbackSprite(mapId, ev, key) {
      if (this._fallbackApplied[key]) return;
      if (ev.characterName()) { this._fallbackApplied[key] = true; return; } // already has a face

      const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      const persona = window.NPCSystem?.generateSeededPersona?.(
        (nameHash(key + '_shopFallback') ^ worldSeed) >>> 0
      );
      if (!persona?.spriteName) return; // no character pool, retry next tick

      this._fallbackApplied[key] = true;
      this._applyPersonaSprite(ev, persona);
    },

    // Resolves the active persona's display data for the given event, or
    // null when no persona has been assigned to it.
    getActivePersona(mapId, evId) {
      const slot = this.currentShift();
      const persona = this._slotPersona(`${mapId}_${evId}`, slot);
      if (!persona) return null;

      const profile = $gameSystem._npcSociety?.[persona.name];
      return {
        spriteName: persona.spriteName,
        charIdx:    persona.charIdx,
        name:       persona.name,
        bust:       profile?._bustName ?? '7',
        markovDb:   profile?.markovDb ?? 'npc',
      };
    },

    resetMapCache() {
      this._personas = {};
      this._applied  = {};
      this._lastAppliedShift = {};
      this._shopEventsCache = null;
      this._shopEventsMapId = -1;
      this._fallbackApplied = {};
      this._interiorRotaKeys = {};
    },

    // Decides the three-shift rota for every <Shop> counter in the world at
    // once, when the world is made, instead of the first time the player walks
    // into each shop. Counters are drawn from the per-map shop index the
    // WorldGen manifests already carry (NPCResidents.json "__shops"), so no map has
    // to be loaded and no counter has to be standing in front of us.
    //
    // Doing it up front is what makes the rota a property of the world: an NPC
    // holds at most one shop shift anywhere, so who is free to man a counter
    // depended on which town the player entered first. Maps are walked in id
    // order, and each counter's trio is rolled from its own seed, so every
    // savegame of a world finds the same person behind the same till.
    //
    // Only the town's OWN free shopkeepers are drawn on. Doing this world-wide
    // rather than shop-by-shop means there are far more shifts than there are
    // authored people (three per counter, over a hundred counters), so letting
    // it reach for out-of-towners the way a single visited shop does would
    // conscript the entire population of the world into retail. Once a town
    // has nobody left, the counter is manned by a persona fabricated from the
    // counter's own seed, exactly as an interior shop does (see
    // assignInteriorPersonas), so no till is ever left unattended either.
    assignWorldShopPersonas() {
      const NPCSys = window.NPCSystem;
      if (!NPCSys?.getShopIndex) return;

      const groups = NPCSys.getMapGroups?.() || {};
      const mapIds = new Set();
      for (const [groupName, group] of Object.entries(groups)) {
        if (NPCSys.isProceduralGroup?.(groupName)) continue;
        for (const mapId of (group?.maps || [])) mapIds.add(Number(mapId));
      }

      // A town's free shopkeepers, built once per group: the list walks the
      // whole template pool, and several of a town's maps hold counters.
      const localsByGroup = {};
      const localsFor = (groupName) => {
        const cacheKey = groupName || "";
        if (!localsByGroup[cacheKey]) {
          localsByGroup[cacheKey] = this._candidates(groupName).filter(c => c && c.local);
        }
        return localsByGroup[cacheKey];
      };

      const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      let staffed = 0;
      let invented = 0;
      for (const mapId of [...mapIds].sort((a, b) => a - b)) {
        let entries = [];
        try { entries = NPCSys.getShopIndex(mapId) || []; } catch (e) { entries = []; }
        // Only graphic-less <Shop> counters are staffed by a persona; a plain
        // Shop Processing event, a <Shop> counter whose shopkeeper the author
        // drew, and a <Shop> + <Story> till (one written keeper, always on
        // duty) keep whatever face their own page defines. An index written
        // before the tag was understood carries no `story` flag, so such a
        // till is staffed here and hands the rota back the first time the
        // player stands on that map (see isShopEvent / _releaseRota).
        // A <Local> + <Shop> till is its own keeper for the same reason.
        const counters = entries.filter(e => e && e.shopTagged && !e.hasGraphic && !e.story && !e.local);
        if (!counters.length) continue;

        const groupName = NPCSys.findMapGroupByMap?.(mapId) || null;
        const locals = localsFor(groupName);

        for (const counter of counters.sort((a, b) => a.eventId - b.eventId)) {
          const evId = counter.eventId;
          const key = `${mapId}_${evId}`;
          if (this._persistedPersonas()[key]) continue;

          // Whoever already holds a shift anywhere is out, so nobody stands
          // two counters. Rebuilt per counter, because the previous one on
          // this map has just spent people.
          const used = new Set(Object.keys($gameSystem?._npcShopAssignments || {}));
          const free = locals.filter(c => !used.has(c.name));

          const rng = new MiniRng(nameHash(key + '_shopShift') ^ worldSeed);
          const shifts = {};
          for (const s of this._shiftsToStaff(mapId, evId)) {
            let persona = free.length ? free.splice(rng.int(0, free.length - 1), 1)[0] : null;
            if (!persona) {
              persona = NPCSys.generateSeededPersona?.(
                (nameHash(key + '_shopHire') ^ worldSeed ^ (s * 40503)) >>> 0
              );
              if (persona) invented++;
            }
            if (persona) shifts[s] = persona;
          }
          if (!Object.keys(shifts).length) {
            // A zombie world's abandoned tills are recorded as an empty rota
            // (nobody, ever); anywhere else an empty result means the pools
            // were not ready, so the counter is left to be decided later.
            if (this._isZombieWorld()) this._setPersonas(key, {}, true);
            continue;
          }

          this._setPersonas(key, shifts, true);
          this._recordAssignments(mapId, evId, counter.shopName ?? null, shifts);
          staffed++;
        }
      }
      console.log(`[NPCSim] World shop rotas: ${staffed} counters staffed around the clock (${invented} shifts covered by hired staff).`);
    },
  };

  if (window.WorldManager?.registerWorldInitializer) {
    // After the roster (order 20): the counter staff are drawn from the
    // job-less locals the roster's job assignment left over.
    window.WorldManager.registerWorldInitializer("shopShifts", 30, () => {
      // Nobody is behind any counter in a world with nobody left in it.
      if (window.NPCShared?.WorldModes?.simulatesPeople?.() === false) return;
      ShopShiftManager.assignWorldShopPersonas();
    });
  }

  // ============================================================================
  // SECTION 11d2, LEAVE MANAGER (NPCSim.Leave)
  // ============================================================================
  // Time off a job with the job kept: profile.leave = { kind, sinceMin,
  // untilMin, days, reason }. ScheduleManager.evaluate reads it before the
  // shift, so somebody on leave is not at work, is not paid for it, and
  // spends the hours at home: resting off an illness ("comfort", "sleep"),
  // or minding a child ("home", with one errand a day).
  //
  //   sick      the background sim looks each worker over once a game day
  //             (checkSick, via Health_DiseaseSystem.ensureNpcMedicalHistory):
  //             an acute illness of moderate severity or worse sends them
  //             home for 2 to 10 days, longer the worse it is, once per bout.
  //   parental  started by whoever brings a child into a home (Phase F):
  //             about five months for the one who gave birth, one to three
  //             for the other parent, about three for each adoptive parent
  //             (parentalDays).
  //
  // A creature takes no leave: it holds no job to take it from.
  const LeaveManager = {
    KINDS: ["sick", "parental"],
    SICK_DAYS: { moderate: [2, 4], severe: [4, 7], lethal: [7, 10] },
    PARENTAL_DAYS: { birth: [140, 160], partner: [30, 90], adoption: [80, 100] },
    MAX_DAYS: 365,
    LIFE_EVENT_CAP: 60,

    _now() { return $gameVariables?.value(114) ?? 0; },

    // The leave in force, or null. A leave that has run out is closed here,
    // so whoever asks first after it ends sends them back to work.
    active(profile) {
      const l = profile?.leave;
      if (!l) return null;
      if (!(Number(l.untilMin) > this._now())) {
        delete profile.leave;
        profile._routineDay = -1;
        if (profile._eventName) EventBus.emit("npc:leave_end", { name: profile._eventName, kind: l.kind });
        return null;
      }
      return l;
    },

    isOnLeave(name) {
      return !!this.active($gameSystem?._npcSociety?.[name]);
    },

    // What somebody on leave is doing this hour.
    activity(profile, leave, hour) {
      const night = RoutineManager.isSleepHour(profile, hour);
      if (night || (profile.sleep ?? 100) < 20) return "sleep";
      if (ScheduleManager.wantsWC(profile, ScheduleManager.BLADDER_LOW)) return "hygiene";
      if ((profile.hunger ?? 100) < 30) return "hunger";
      if ((profile.hygiene ?? 100) < 30) { profile.washFor = "hygiene"; return "hygiene"; }
      if (leave.kind === "sick") return (profile.sleep ?? 100) < 60 ? "sleep" : "comfort";
      const planned = RoutineManager.getActivity(profile, hour);
      return (planned === "work" || planned === "shopwork") ? "home" : planned;
    },

    // Puts `name` on leave for `days` game days. A second leave of the same
    // kind only ever lengthens the first. Returns the leave, or null.
    start(name, kind, days, opts = {}) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile || !this.KINDS.includes(kind)) return null;
      const NC = window.NPCCreature;
      if (NC?.isNonSentientProfile?.(profile) && !NC.isPlayerCharacterName?.(name)) return null;
      const d = Math.max(1, Math.min(this.MAX_DAYS, Math.round(Number(days) || 0)));
      const now = this._now();
      const cur = this.active(profile);
      const until = now + d * 1440;
      if (cur && cur.kind === kind && cur.untilMin >= until) return cur;
      profile.leave = { kind, sinceMin: now, untilMin: until, days: d, reason: opts.reason ?? null };
      profile._routineDay = -1;
      if (kind === "sick") {
        this._logLife(name, "NPCLife.event.sickLeave", { illness: opts.illness || "", days: d });
      } else {
        this._logLife(name, "NPCLife.event.parentalLeave", { days: d });
      }
      EventBus.emit("npc:leave_start", { name, kind, days: d });
      return profile.leave;
    },

    end(name) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile?.leave) return false;
      profile.leave.untilMin = this._now();
      this.active(profile);
      return true;
    },

    // How long a parent stays home, seeded per person and child. `role` is
    // "birth", "partner" or "adoption".
    parentalDays(name, role, salt) {
      const range = this.PARENTAL_DAYS[role] || this.PARENTAL_DAYS.partner;
      const rng = economyRng(name, "parental_" + role + "_" + (salt ?? ""), 0);
      return range[0] + Math.floor(rng.next() * (range[1] - range[0] + 1));
    },

    startParental(name, role, salt) {
      return this.start(name, "parental", this.parentalDays(name, role, salt), { reason: role });
    },

    // Once a game day per worker, in the background chunk: an acute illness
    // of moderate severity or worse, not already taken leave for, sends them
    // home. Returns the new leave or null.
    checkSick(profile, name) {
      if (!profile || !name) return null;
      const hasShift = !!profile.currentJobId || !!$gameSystem?._npcShopAssignments?.[name];
      if (!hasShift || this.active(profile)) return null;
      const DS = window.DiseaseSystem;
      if (!DS?.ensureNpcMedicalHistory || !DS.getDisease) return null;
      try { DS.ensureNpcMedicalHistory(name, profile); } catch (_) { return null; }
      for (const e of (profile.diseases || [])) {
        if (!e || e.chronic) continue;
        // Still incubating: nothing shows yet, so nobody stays home for it.
        if (DS.isNpcSymptomatic && !DS.isNpcSymptomatic(e)) continue;
        const d = DS.getDisease(e.id);
        if (!d || d.severity === "chronic" || !(d.durationDays > 0) || d.durationDays >= 9999) continue;
        const range = this.SICK_DAYS[d.severity];
        if (!range) continue;
        const bout = `${e.id}@${e.sinceMin ?? 0}`;
        if (profile._sickLeaveFor === bout) continue;
        profile._sickLeaveFor = bout;
        const rng = economyRng(name, "sickleave_" + bout, 0);
        const days = range[0] + Math.floor(rng.next() * (range[1] - range[0] + 1));
        const illness = DS.displayName ? DS.displayName(e.id) : (d.name || "");
        return this.start(name, "sick", days, { reason: e.id, illness });
      }
      return null;
    },

    // Onto the person's life record (NPCLifeSimulator), read by the
    // biography and the Empathize history like every other life event.
    _logLife(name, key, params) {
      const L = window.NPCLifeSim;
      if (!L) return;
      let rec = L.getRecord?.(name) || null;
      if (!rec) { try { rec = L.ensureLifeRecord?.(name) || null; } catch (_) { rec = null; } }
      if (!rec) return;
      const minute = this._now();
      const date = L._internals?.dateStrOf ? L._internals.dateStrOf(minute) : "";
      rec.lifeEvents = Array.isArray(rec.lifeEvents) ? rec.lifeEvents : [];
      rec.lifeEvents.unshift({ minute, date, type: "career", key, params });
      if (rec.lifeEvents.length > this.LIFE_EVENT_CAP) rec.lifeEvents.pop();
    },
  };

  // ============================================================================
  // SECTION 11d, JOB SHIFT MANAGER
  // ============================================================================
  // Each map group tries to fully staff every one of its job positions, a
  // (jobId, workMapId) pair drawn from the group's "jobs" map ({ mapId:
  // [jobId, ...] }, filled from js/db/WorldGen/MapJobs.json, one entry per
  // map that hosts one or more jobs), using NPCs drawn from the group's own
  // residents. Each position gets one distinct NPC per 8h shift the job
  // keeps (Jobs.json "shifts", see SHIFT_HOURS/SHIFT_COUNT): a hospital is
  // staffed around the clock, a bank by day, with real NPC events rather than
  // a graphic-swapped persona: during their shift, that NPC can only be found
  // on the job's map (see BehaviorDispatcher._handleWork and NPCSystem's
  // roster hook).
  //
  // Assignment is computed once per group (cached via
  // $gameSystem._npcJobAssignedGroups) from a deterministically shuffled pool,
  // filling slots shift by shift round every workplace. As soon as
  // the pool runs out, every remaining shift/position is left uncovered, no
  // NPC is force-spawned there, and every NPC not assigned a slot becomes
  // jobless (JobManager.assignJob falls back to currentJobId = 0).
  //
  // NPCs tagged <Local> are excluded from the pool entirely, they're tied to
  // their home map and never travel for a job, just like for ShopShiftManager.
  // Jobs.json `appointed`: an office somebody is seated in, never dealt.
  function isAppointedJob(jobId) {
    const job = (window.WorkSystem?.Jobs || []).find(j => j && j.id === jobId);
    return !!(job && job.appointed);
  }

  const JobShiftManager = {
    // The shifts a job keeps (Jobs.json "shifts": 0 = 00-08, 1 = 08-16,
    // 2 = 16-24). A job that names none is staffed around the clock.
    shiftsOf(jobId) {
      const job = (window.WorkSystem?.Jobs || []).find(j => j && j.id === jobId);
      const own = Array.isArray(job?.shifts)
        ? job.shifts.filter(s => Number.isInteger(s) && s >= 0 && s < SHIFT_COUNT) : [];
      return own.length ? own : [0, 1, 2];
    },

    // Every (job, map, shift) slot of a group, dealt round by round: the
    // first shift of every workplace, then the second of each, so a town
    // short of hands still has somebody at every post.
    slotsOf(group) {
      const positions = [];
      for (const [mapId, jobIds] of Object.entries(group?.jobs || {})) {
        for (const jobId of (jobIds || [])) {
          // An appointed office is never a town's shift to deal (NPCPolitics).
          if (isAppointedJob(jobId)) continue;
          positions.push({ jobId, mapId: Number(mapId), shifts: this.shiftsOf(jobId) });
        }
      }
      const slots = [];
      for (let round = 0; round < SHIFT_COUNT; round++) {
        for (const pos of positions) {
          if (pos.shifts[round] != null) slots.push({ jobId: pos.jobId, mapId: pos.mapId, shift: pos.shifts[round] });
        }
      }
      return slots;
    },

    ensureGroupAssignments(groupName) {
      if (!groupName) return;
      $gameSystem._npcJobAssignments = $gameSystem._npcJobAssignments || {};
      $gameSystem._npcJobAssignedGroups = $gameSystem._npcJobAssignedGroups || {};
      const group = $gameSystem?._npcMapGroups?.[groupName];
      // A hand-made town is dealt once. A procedural settlement or a floor of
      // the Omega Tower gains its people as the party meets them, so it is
      // dealt again whenever somebody new has arrived, filling only the
      // shifts still open.
      const settlement = !!(group && (group._procedural || group._tower));
      if ($gameSystem._npcJobAssignedGroups[groupName] && !settlement) return;
      $gameSystem._npcJobAssignedGroups[groupName] = true;

      if (!group || !group.jobs) return;
      const slots = this.slotsOf(group);
      if (!slots.length) return;

      // The town's own residents (NPCSystem, RESIDENT REGISTRY): the authored
      // cast stands where it was written, a <Local> never holds a job, and a
      // creature holds none either (NPCCreature). A settlement has no
      // resident registry: its people are everybody born to it who has not
      // been told yet whether they work. Sorted so the seeded shuffle below
      // deals the same shifts to the same people in every savegame.
      const assigns = $gameSystem._npcJobAssignments;
      const society = $gameSystem?._npcSociety || {};
      const NC = window.NPCCreature;
      let pool;
      if (settlement) {
        pool = Object.keys(society).filter(name => society[name]?._homeGroupName === groupName &&
          (society[name].currentJobId == null || assigns[name]));
      } else {
        window.NPCSystem?.ensureGroupResidents?.(groupName);
        pool = window.NPCSystem?.getGroupResidents?.(groupName) || [];
      }
      const candidates = pool
        .filter(name => {
          const p = society[name];
          if (!p || p._officer || p._politicsOffice) return false;
          // A child takes no shift (SECTION 11b4).
          if (Children.isMinor(p, name)) return false;
          // A beast takes one only where beasts work (NPCCreature.mayWork).
          return NC?.mayWork ? NC.mayWork(p, name) : !(NC?.isNonSentientProfile?.(p));
        })
        .sort();
      // Nobody to deal the shifts to yet (the town is dealt once the society
      // can mint people): ask again later rather than leave it unstaffed.
      if (!candidates.length) { delete $gameSystem._npcJobAssignedGroups[groupName]; return; }

      // Deterministic Fisher-Yates shuffle, seeded per-group.
      const shuffled = [...candidates];
      const ws  = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      const rng = new MiniRng(nameHash(groupName + "_jobShifts") ^ ws);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      // Fill the open slots in order until the pool runs dry; any shift left
      // over stays uncovered. Somebody already holding one of this group's
      // slots keeps it.
      const slotKey = (s) => `${s.jobId}|${s.mapId}|${s.shift}`;
      const taken = new Set();
      for (const name of shuffled) {
        const a = assigns[name];
        if (a) taken.add(slotKey(a));
      }
      const free = shuffled.filter(name => !assigns[name]);
      let idx = 0;
      for (const slot of slots) {
        if (idx >= free.length) break;
        if (taken.has(slotKey(slot))) continue;
        const name = free[idx++];
        const mapName = ($dataMapInfos && $dataMapInfos[slot.mapId]) ? $dataMapInfos[slot.mapId].name : T('NPCSim.mapFallback', { id: slot.mapId });
        assigns[name] = { jobId: slot.jobId, mapId: slot.mapId, mapName, shift: slot.shift };
        taken.add(slotKey(slot));
      }

      // Reserve a slice of the leftover (job-less) NPCs as this group's
      // shopkeeper-eligible pool. These are people with no fixed job filling
      // their day, so they're free to stand a counter shift, ShopShiftManager
      // staffs <Shop> events from here first (see _candidates). The pool is
      // deterministic (the leftover order comes from the seeded shuffle above).
      const leftover = free.slice(idx);
      const keep = Math.ceil(leftover.length * SHOPKEEPER_POOL_RATIO);
      $gameSystem._npcShopkeeperPool = $gameSystem._npcShopkeeperPool || {};
      $gameSystem._npcShopkeeperPool[groupName] = leftover.slice(0, keep);
    },

    currentShift() {
      const hour = $gameVariables?.value(23) ?? 12;
      return Math.floor(hour / SHIFT_HOURS) % SHIFT_COUNT;
    },

    // ---- somebody moving town (NPCLifeSim RELOCATION) ----------------------
    // The slots of a group nobody living there holds. A procedural square's
    // workplaces all sit on map 636, so a slot is only "taken" by somebody
    // whose home is this group, never by a worker of another square.
    _openSlotsOf(groupName) {
      const group = $gameSystem?._npcMapGroups?.[groupName];
      if (!group?.jobs) return [];
      const society = $gameSystem._npcSociety || {};
      const slotKey = (s) => `${s.jobId}|${s.mapId}|${s.shift}`;
      const taken = new Set();
      for (const [name, a] of Object.entries($gameSystem._npcJobAssignments || {})) {
        if (a && society[name]?._homeGroupName === groupName) taken.add(slotKey(a));
      }
      return this.slotsOf(group).filter(s => !taken.has(slotKey(s)));
    },

    openSlots(groupName) {
      return groupName ? this._openSlotsOf(groupName).length : 0;
    },

    // Hands back whatever shift this person held: the job slot, a counter
    // shift, and their place in the counter pool. The rota's face at a till
    // is cosmetic and stays until the rota is next dealt.
    releaseSlot(name) {
      if (!$gameSystem || !name) return false;
      let released = false;
      const jobs = $gameSystem._npcJobAssignments;
      if (jobs?.[name]) { delete jobs[name]; released = true; }
      const shops = $gameSystem._npcShopAssignments;
      const shop = shops?.[name];
      if (shop) {
        delete shops[name];
        const reserved = $gameSystem._npcShopReservedNames?.[shop.mapId];
        const i = reserved ? reserved.indexOf(name) : -1;
        if (i >= 0) reserved.splice(i, 1);
        released = true;
      }
      for (const list of Object.values($gameSystem._npcShopkeeperPool || {})) {
        const i = Array.isArray(list) ? list.indexOf(name) : -1;
        if (i >= 0) list.splice(i, 1);
      }
      const profile = $gameSystem._npcSociety?.[name];
      if (profile) {
        profile.currentJobId = null;
        profile.workMapId = null;
        profile.workShift = null;
        profile._routineDay = -1;
      }
      return released;
    },

    // Takes the first shift of the new town nobody holds, or none: somebody
    // who arrives to a town with every post filled is out of work there.
    // `want` ({ mapId, jobId, shift }, any of them) asks for one post in
    // particular, the party hiring into a workplace it owns (Empathize, Hire):
    // with none of that kind open nothing changes and null comes back.
    claimVacancy(name, groupName, want) {
      const profile = $gameSystem?._npcSociety?.[name];
      if (!profile || !groupName) return null;
      const NC = window.NPCCreature;
      if (profile._officer || profile._politicsOffice || Children.isMinor(profile, name) || NC?.isNonSentientProfile?.(profile)) return null;
      $gameSystem._npcJobAssignments = $gameSystem._npcJobAssignments || {};
      const fits = (s) => !want || ((want.mapId == null || s.mapId === Number(want.mapId)) &&
        (want.jobId == null || s.jobId === Number(want.jobId)) && (want.shift == null || s.shift === Number(want.shift)));
      const slot = this._openSlotsOf(groupName).filter(fits)[0] || null;
      if (want && !slot) return null;
      if (slot) {
        const mapName = ($dataMapInfos && $dataMapInfos[slot.mapId]) ? $dataMapInfos[slot.mapId].name : T('NPCSim.mapFallback', { id: slot.mapId });
        $gameSystem._npcJobAssignments[name] = { jobId: slot.jobId, mapId: slot.mapId, mapName, shift: slot.shift };
      }
      profile._homeGroupName = groupName;
      if (!profile._eventName) profile._eventName = name;
      JobManager.assignJob(profile);
      return slot;
    },
  };

  Object.assign(NPCSim._internal, {
    ensureTraits, JobManager, JobShiftManager, LeaveManager, ShopShiftManager, traitNameLower, WorkServe,
  });
  // Live state other modules read: always the current value, never a copy.
  Object.defineProperty(NPCSim._internal, "DataLoader_traits", { get: () => DataLoader_traits, enumerable: true });
})();
