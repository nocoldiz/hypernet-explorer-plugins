/*:
 * @target MZ
 * @plugindesc NPC Simulation: work and leisure schedules, personal routines, activity placement
 * @author Omni-Lex
 * @base NPCSimulationCore
 * @orderAfter NPCSimulationCore
 * @help
 * ============================================================================
 * NPCSim_Routine, part of the NPCSimulationCore family
 * ============================================================================
 * Owns ScheduleManager (SECTION 3), RoutineManager (SECTION 3b) and
 * ActivityPlacer (SECTION 3c): what each hour of a person's day is for, and
 * where a freshly spawned person is already busy when a map loads.
 *
 * Reads the helpers it shares with the rest of the family off
 * NPCSim._internal and publishes its own there. Load it right after
 * NPCSimulationCore.js, as js/plugins.js lists it.
 */

(() => {
  "use strict";

  const NPCSim = window.NPCSim;
  const {
    eraTension, isBlockedTerrain, MiniRng, nameHash, SHIFT_HOURS,
  } = NPCSim._internal;
  // Owned by modules that load after this one, bound once the family is in.
  let
    Children, ensureSimFields, ensureTraits, hordeChaosHere, InteractionScanner, JobManager,
    LeaveManager, WEALTH_THRESHOLDS;
  NPCSim._internal._late.push(() => ({
    Children, ensureSimFields, ensureTraits, hordeChaosHere, InteractionScanner, JobManager,
    LeaveManager, WEALTH_THRESHOLDS,
  } = NPCSim._internal));

  // ============================================================================
  // SECTION 3, SCHEDULE MANAGER
  // ============================================================================
  // Priority: sleep > hunger > work > money > crime (rare) > comfort > social > leisure
  // (money/comfort/social are the extended needs from
  //  docs/npc_event_interaction_design_en.md §3.1, they interleave around
  //  the original five rather than replacing them)

  const ScheduleManager = {
    // Deterministic interrupt rolls: seeded per NPC, per in-game day, per hour
    // from the world seed. Previously these need-override checks used raw
    // Math.random(), so the deterministic routine (RoutineManager) was silently
    // overridden by unseeded rolls and the same world evolved differently every
    // run. A single stream per (name, day, hour) makes each hour's decision
    // stable and reproducible while still drifting hour to hour.
    _interruptRng(profile, hour) {
      const name = profile._eventName || "npc";
      const day  = RoutineManager._dayIndex();
      const ws   = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
      return new MiniRng(nameHash(`${name}_sched_${day}_${Math.floor(hour)}`) ^ ws); // i18n-ignore: rng seed key
    },

    evaluate(profile, hour) {
      if (!profile) return null;
      // Leave comes before work (SECTION 11d2): somebody off sick or at home
      // with a newborn keeps no shift and draws no pay for it.
      const leave = LeaveManager.active(profile);
      if (leave) return LeaveManager.activity(profile, leave, hour);
      // A child keeps no shift, earns nothing and plots nothing (SECTION 11b4).
      if (Children.isMinor(profile)) return Children.activity(profile, hour);
      // A beast keeps a creature's day (RoutineManager.creatureDay): no money,
      // no crime, no safety, no hygiene, and no shift unless the world lets
      // beasts work (WorldModes.beastsWork).
      if (this._isNonSentient(profile)) return this._evaluateCreature(profile, hour);
      const rng      = this._interruptRng(profile, hour);
      // A counter shift before a job shift, the same order the day's plan is
      // written in (RoutineManager.generateForDay), so the two never disagree.
      const workHour = this._inWorkHours(profile, hour);
      const shopHour = this._inShopShift(profile, hour);
      if (shopHour) return "shopwork";
      if (workHour) return "work";

      // Their town's public gathering (window.NPCGatherings): most of the town
      // is out at it for its hours, in company, whatever the plan said. Only
      // their own bed hours keep them home.
      if (!RoutineManager.isSleepHour(profile, hour) && window.NPCGatherings?.attends?.(profile, hour)) return "social";

      // One sleep window per person per day (RoutineManager.sleepWindow): the
      // same hours their plan sleeps, the same hours a bed and a front door
      // are read against. A night worker's window sits in the day.
      const sleepy = (profile.sleep ?? 100) < 20 || RoutineManager.isSleepHour(profile, hour);
      const hungry   = (profile.hunger ?? 100) < 30;
      const grimy    = (profile.hygiene ?? 100) < 30;

      if (sleepy)   return "sleep";
      if (hungry)   return "hunger";
      if (grimy)    return "hygiene";

      const tension  = eraTension();
      // The Goblin Horde's ground (window.HordeGround): more of the town is
      // willing, and more often. 0 anywhere else.
      const horde    = hordeChaosHere();
      const criminal = (profile.moralityScore ?? 0) < (-30 + tension * 40 + horde * 40) &&
                       rng.next() < (0.02 + tension * 0.10) * (1 + 2 * horde);

      if (this._needsMoney(profile, rng))   return "money";
      if (criminal) return "crime";
      if (this._wantsSafety(profile, rng))  return "safety";
      if (this._wantsComfort(profile, rng)) return "comfort";
      if (this._wantsSocial(profile, rng))  return "social";
      // Nothing urgent is pulling at them, fall back to whatever their
      // personal daily routine has scheduled for this hour (see RoutineManager).
      return RoutineManager.getActivity(profile, hour);
    },

    _inWorkHours(profile, hour, day) {
      return RoutineManager._inWorkHours(profile, hour, day);
    },

    _inShopShift(profile, hour) {
      const assign = $gameSystem?._npcShopAssignments?.[profile?._eventName];
      if (!assign) return false;
      if (LeaveManager.active(profile)) return false;
      return Math.floor(hour / SHIFT_HOURS) === assign.shift;
    },

    _isNightWorker(profile) {
      if (!profile) return false;
      if (profile.currentJobId && (profile.workShift === 0 || profile.workShift === 2)) return true;
      const assign = $gameSystem?._npcShopAssignments?.[profile?._eventName];
      if (assign && (assign.shift === 0 || assign.shift === 2)) return true;
      return false;
    },

    // A non-sentient creature (NPCCreature) wants none of the things money is
    // for. It does not earn, does not save toward a better address and never
    // moves up a housing tier; hunger, sleep and company still pull at it,
    // which is the whole of what a beast wants.
    _isNonSentient(profile) {
      const NC = window.NPCCreature;
      if (!NC || !NC.isNonSentientProfile(profile)) return false;
      return !(NC.isPlayerCharacterName && NC.isPlayerCharacterName(profile._eventName));
    },

    // A creature's hour: a shift only where beasts work, then sleep by its
    // own rhythm, then its forage slot when hungry, then its day's plan. It
    // never rolls for money, crime, safety or hygiene.
    _evaluateCreature(profile, hour) {
      const NC = window.NPCCreature;
      if (NC?.mayWork?.(profile, profile._eventName)) {
        if (this._inShopShift(profile, hour)) return "shopwork";
        if (this._inWorkHours(profile, hour)) return "work";
      }
      const life = RoutineManager.creatureLife(profile);
      if ((profile.sleep ?? 100) < 20 && !life.sleepless) return "sleep";
      if (RoutineManager.isSleepHour(profile, hour)) return "sleep";
      if ((profile.hunger ?? 100) < 30) return life.forage;
      return RoutineManager.getActivity(profile, hour);
    },

    // Below ~5% of their current wealth tier's ceiling, go earn or find money.
    // Reuses WEALTH_THRESHOLDS (section 11a) so the floor scales with tier.
    _needsMoney(profile, rng) {
      if (this._isNonSentient(profile)) return false;
      const idx  = Math.min(profile.wealthTierBase ?? 0, WEALTH_THRESHOLDS.length - 1);
      const tier = WEALTH_THRESHOLDS[idx];
      const floor = isFinite(tier.max) ? tier.max * 0.05 : 3000;
      return (profile.money ?? 0) < floor && rng.next() < 0.05;
    },

    // Recently caught stealing, or chronically low morality, occasionally
    // looks for somewhere to lay low / stash goods (e.g. a container).
    _wantsSafety(profile, rng) {
      // The five latest entries, read in place.
      const log = profile.eventLog || [];
      let recentlyCaught = false;
      for (let i = 0; i < log.length && i < 5; i++) if (log[i].tag === "theft_caught") { recentlyCaught = true; break; }
      const veryLowMorality = (profile.moralityScore ?? 0) < -50;
      return (recentlyCaught || veryLowMorality) && rng.next() < 0.05;
    },

    // Has the savings to move up a home tier but hasn't, occasionally seeks
    // out comfort (a rentable room, better furniture...) instead of wandering.
    _wantsComfort(profile, rng) {
      if (this._isNonSentient(profile)) return false;
      const curIdx = WEALTH_THRESHOLDS.findIndex(t => t.pool === profile.homePoolType);
      const next = WEALTH_THRESHOLDS[curIdx + 1];
      if (!next) return false; // already at the top tier
      return (profile.money ?? 0) >= next.max * 0.5 && rng.next() < 0.03;
    },

    // Their "social" meter has run low (drains passively, refills while
    // chatting/socializing, see NEED_FILL_PER_SEC). Extroverted/social NPCs
    // notice sooner than others.
    _wantsSocial(profile, rng) {
      ensureTraits();
      const traitNames = (profile.traitIds || []).map(id => NPCSim._internal.traitNameLower(id));
      const sociable = traitNames.some(n => n.includes("social") || n.includes("extrovert"));
      const threshold = sociable ? 50 : 25;
      return (profile.social ?? 100) < threshold && rng.next() < 0.05;
    },
  };

  // ============================================================================
  // SECTION 3b, ROUTINE MANAGER (personal daily schedules)
  // ============================================================================
  // Builds a full 24-hour activity plan per NPC, regenerated once per in-game
  // day from a seed mixing the NPC's name, the day index, and the world's
  // history seed (window.HistoryManager.getSeed(), see CLAUDE.md §canonical
  // world-RNG root). Routines therefore feel personal, stay internally
  // consistent for a whole day, and drift slightly from one day to the next
  // (a different wake time, a different errand slot…) without ever becoming
  // pure noise. Each slot stores one of the need-ids BehaviorDispatcher
  // already knows how to act on, so the routine plugs straight into the
  // existing evaluate → dispatch → capability-registry pipeline, it only
  // decides what an NPC *intends* to do; acute biological needs (hunger,
  // exhaustion, hygiene, money trouble, crime opportunities…) still cut in
  // and override the plan moment to moment, exactly like a real routine.
  const RoutineManager = {
    _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },

    _dayIndex(offsetDays = 0) {
      const minute = $gameVariables?.value(114) ?? 0;
      return Math.floor(minute / 1440) + offsetDays;
    },

    _isSleepHour(h, wake, bed) {
      // bed < wake: sleep window sits entirely within the same calendar day
      // (e.g. bed=1, wake=6 → asleep 01:00–05:59). Otherwise it wraps past
      // midnight (e.g. bed=23, wake=6 → asleep 23:00–05:59).
      return bed < wake ? (h >= bed && h < wake) : (h >= bed || h < wake);
    },

    // `day` defaults to today (var 114). A weekday-only trade rests on
    // Saturday and Sunday (JobManager.isWeekdayOnly).
    _inWorkHours(profile, hour, day) {
      if (!profile.currentJobId || profile.workShift == null) return false;
      if (LeaveManager.active(profile)) return false;
      if (Math.floor(hour / SHIFT_HOURS) !== profile.workShift) return false;
      if (this.isWeekend(day ?? this._dayIndex()) && JobManager.isWeekdayOnly(JobManager.getJob(profile))) return false;
      if (this.isHolidayOff(profile, day)) return false;
      return true;
    },

    // A public holiday in the nation of their town (window.PublicHolidays)
    // shuts the office, the workshop and the warehouse; the trades that serve
    // the day off keep going (JobManager.worksHolidays), and a shop counter is
    // a shift of its own that never closes.
    isHolidayOff(profile, day) {
      const PH = window.PublicHolidays;
      if (!PH || !profile?._homeGroupName) return false;
      if (!PH.isDayOff(profile._homeGroupName, day ?? PH.todayIndex())) return false;
      return !JobManager.worksHolidays(JobManager.getJob(profile));
    },

    // ── The one clock ────────────────────────────────────────────────────
    // Day of the week of a routine day index: 0 Sunday .. 6 Saturday, read
    // off the same calendar TimeDateSystem keeps (variable 114 counted from
    // 1 January 2001 10:00, which was a Monday).
    weekdayOf(day) {
      const d = Number.isFinite(day) ? day : this._dayIndex();
      const date = new Date(2001, 0, 1, 10, 0, 0);
      date.setDate(date.getDate() + d);
      return date.getDay();
    },

    isWeekend(day) {
      const wd = this.weekdayOf(day);
      return wd === 0 || wd === 6;
    },

    // The hour of the day off variable 114, through TimeDateSystem's own
    // calendar when it is there; variable 23 (which WeatherSystem writes off
    // the same clock) otherwise.
    hourNow() {
      const date = window.TimeDateSystem?.getCurrentDateObj?.();
      if (date && typeof date.getHours === "function") return date.getHours();
      return $gameVariables?.value(23) ?? 12;
    },

    // The wake and bed anchors of one day's plan, drawn off the plan's own
    // stream in the order generateForDay has always drawn them.
    _anchors(profile, name, rng) {
      const isNightWorker = (profile?.currentJobId && (profile.workShift === 0 || profile.workShift === 2)) ||
                            ($gameSystem?._npcShopAssignments?.[name]?.shift === 0 || $gameSystem?._npcShopAssignments?.[name]?.shift === 2);
      let wakeHour, bedHour, breakfast, lunch, dinner;
      if (isNightWorker) {
        // Night worker reversed anchors: sleep during off-work day hours (8-16)
        wakeHour  = this._clamp(16 + rng.int(-1, 1), 14, 18);
        bedHour   = this._clamp(8 + rng.int(-1, 1), 7, 10);
        breakfast = this._clamp(wakeHour + rng.int(0, 1), 15, 19);
        lunch     = (wakeHour + 5) % 24;
        dinner    = (wakeHour + 10) % 24;
      } else {
        wakeHour  = this._clamp(6 + rng.int(-1, 1), 4, 8);
        bedHour   = this._clamp(22 + rng.int(-1, 2), 21, 26) % 24;
        breakfast = this._clamp(wakeHour + rng.int(0, 1), 5, 9);
        lunch     = this._clamp(12 + rng.int(-1, 1), 11, 14);
        dinner    = this._clamp(19 + rng.int(-1, 1), 17, 21);
      }
      return { wakeHour, bedHour, breakfast, lunch, dinner, isNightWorker };
    },

    _routineRng(name, day) {
      const worldSeed = window.HistoryManager ? window.HistoryManager.getSeed() : 19002001;
      return new MiniRng(nameHash(`${name}_routine_${day}`) ^ worldSeed);
    },

    // When this person sleeps on `day` (today by default): { bed, wake }.
    // The one sleep window: ScheduleManager.evaluate, the leave day, the
    // controller's bed search (NPCSystem NPCBeds.isNight) and isNPCAtHome all
    // read it, and it is the window the day's plan sleeps.
    sleepWindow(profile, day) {
      const name = profile?._eventName || "npc";
      const d = Number.isFinite(day) ? day : this._dayIndex();
      const minor = Children.isMinor(profile, name);
      const shopShift = $gameSystem?._npcShopAssignments?.[name]?.shift;
      const stamp = `${d}|${profile?.currentJobId ?? ""}|${profile?.workShift ?? ""}|${shopShift ?? ""}|${minor ? 1 : 0}|${ScheduleManager._isNonSentient(profile) ? 1 : 0}`;
      const cached = profile?._sleepWin;
      if (cached && cached.k === stamp) return cached;
      const rng = this._routineRng(name, d);
      let win;
      if (minor) {
        win = Children.sleepWindow(profile, rng);
      } else if (ScheduleManager._isNonSentient(profile)) {
        // A creature sleeps by its own rhythm (NPCCreature.creatureLife): a
        // grazer by day's end, an owl or a ghoul through the daylight, a drone
        // not at all. An hour of give either way so a herd does not settle
        // down in unison.
        const life = this.creatureLife(profile);
        win = life.sleepless ? { bed: 0, wake: 0, sleepless: true }
          : { bed: (life.bed + rng.int(-1, 1) + 24) % 24, wake: (life.wake + rng.int(-1, 1) + 24) % 24 };
        win.creature = true;
      } else {
        const a = this._anchors(profile, name, rng);
        win = { bed: a.bedHour, wake: a.wakeHour };
      }
      win.k = stamp;
      if (profile) profile._sleepWin = win;
      return win;
    },

    isSleepHour(profile, hour, day) {
      if (!profile) return hour >= 22 || hour < 6;
      const w = this.sleepWindow(profile, day);
      if (w.sleepless) return false;
      return this._isSleepHour(Math.floor(hour), w.wake, w.bed);
    },

    // ── A creature's day ─────────────────────────────────────────────────
    // What a beast is (NPCCreature.creatureLife), or a plain diurnal forager
    // when the creature data is not loaded.
    _CREATURE_FALLBACK: Object.freeze({
      rhythm: "diurnal", wake: 6, bed: 20, sleepless: false, diet: "forager", // i18n-ignore: rhythm and diet ids
      forage: "creature.forage", herd: false, drinks: true, grooms: true, ageless: false, lifespanDays: 4000, // i18n-ignore: routine activity id
    }),

    creatureLife(profile) {
      return window.NPCCreature?.creatureLife?.(profile) || this._CREATURE_FALLBACK;
    },

    // The slots a creature's free hour is drawn from, weighted by what it is.
    // No money, shopping, crime, safety, hygiene, work, school or minigame
    // slot is ever among them. Play is for the young alone.
    _creatureWeights(profile, life) {
      const w = { "creature.rest": 18, "creature.wander": 20 }; // i18n-ignore: routine activity ids
      w[life.forage] = (w[life.forage] || 0) + 32;
      if (life.drinks) w["creature.drink"] = 8;                  // i18n-ignore: routine activity id
      if (life.grooms) w["creature.groom"] = 8;                  // i18n-ignore: routine activity id
      if (life.herd)   w["creature.herd"] = 14;                  // i18n-ignore: routine activity id
      if (life.rhythm === "still") w["creature.rest"] += 30;     // i18n-ignore: rhythm id
      const stage = window.NPCLifeSim?.animalStageOf?.(profile._eventName);
      if (stage === "young" || stage === "newborn") w["creature.play"] = 16; // i18n-ignore: life stage and activity ids
      return w;
    },

    creatureDay(profile, day, rng) {
      const life = this.creatureLife(profile);
      const w = this._creatureWeights(profile, life);
      const keys = Object.keys(w);
      let total = 0;
      for (const k of keys) total += w[k];
      const win = this.sleepWindow(profile, day);
      const mayWork = !!window.NPCCreature?.mayWork?.(profile, profile?._eventName);
      const routine = new Array(24);
      for (let h = 0; h < 24; h++) {
        if (mayWork && this._inShopShift(profile, h))       { routine[h] = "shopwork"; continue; }
        if (mayWork && this._inWorkHours(profile, h, day))  { routine[h] = "work";     continue; }
        if (!win.sleepless && this._isSleepHour(h, win.wake, win.bed)) { routine[h] = "sleep"; continue; }
        let roll = rng.next() * total;
        let pick = keys[0];
        for (const k of keys) { roll -= w[k]; if (roll <= 0) { pick = k; break; } }
        routine[h] = pick;
      }
      return routine;
    },

    // True when this NPC is the assigned shift cover/owner for a <Shop>
    // event during the given hour, see ShopShiftManager.assignPersonas,
    // which populates $gameSystem._npcShopAssignments.
    _inShopShift(profile, hour) {
      const assign = $gameSystem?._npcShopAssignments?.[profile?._eventName];
      if (!assign) return false;
      if (LeaveManager.active(profile)) return false;
      return Math.floor(hour / SHIFT_HOURS) === assign.shift;
    },

    _personalityBias(profile) {
      ensureTraits();
      const names = (profile.traitIds || []).map(id => NPCSim._internal.traitNameLower(id));
      return {
        social:  names.some(n => n.includes("social") || n.includes("extrovert"))  ? 1
               : names.some(n => n.includes("shy") || n.includes("introvert"))     ? -1 : 0,
        leisure: names.some(n => n.includes("lazy") || n.includes("hedonis")) ? 1 : 0,
      };
    },

    // Weighted pick across the "free time" pool, biased by personality and
    // by the NPC's situation, so the plan still reads as *them*, not dice.
    _pickFreeTimeActivity(rng, profile, bias) {
      const w = { leisure: 30, social: 20, comfort: 15, money: 12, crime: 0, shopping: 8 };
      w.social  += bias.social  * 15;
      w.leisure += bias.leisure * 15;
      if ((profile.wealthTierBase ?? 0) <= 1) w.money += 15;
      if ((profile.factionIndex ?? -1) >= 0)  w.social += 10;
      if ((profile.moralityScore ?? 0) < -30) w.crime  += 12;
      // Coin in pocket → more inclined to go shopping (and the richer they are,
      // the more browsing they do).
      if ((profile.money ?? 0) > 300)          w.shopping += 8;
      if ((profile.wealthTierBase ?? 0) >= 2)  w.shopping += 6;
      if (bias.weekend) { w.leisure += 12; w.social += 10; w.shopping += 4; w.money -= 6; }
      // A public holiday is a longer, lazier weekend: out with people, at play,
      // at their ease, and nobody chasing a wage.
      if (bias.holiday) { w.leisure += 18; w.social += 14; w.comfort += 6; w.money -= 10; }

      // The settlement's civic state leans on everyone's plans (world web):
      // crime waves and busts make crime tempting, festivals pull people out,
      // epidemics keep them home.
      const web = window.NPCWorldWeb?.intentBias?.(profile._homeGroupName);
      if (web) {
        w.crime   += web.crime   || 0;
        w.leisure += web.leisure || 0;
        w.social  += web.social  || 0;
        w.money   += web.money   || 0;
      }

      // The slide toward 2012 pushes more people into crime and keeps them from
      // relaxing or mingling out in the open (see eraTension).
      const tension = eraTension();
      if (tension > 0) {
        w.crime   += tension * 30;
        w.leisure -= tension * 8;
        w.social  -= tension * 6;
      }

      let total = 0;
      for (const k in w) total += Math.max(0, w[k]);
      let roll = rng.next() * total;
      for (const k in w) {
        roll -= Math.max(0, w[k]);
        if (roll <= 0) return k;
      }
      return "leisure";
    },

    // Pure function: deterministically builds the 24-slot plan for a given
    // in-game day index, callable for "today", "yesterday", or any day, so
    // the UI can render a rolling 24h retrospective across the date boundary.
    generateForDay(profile, day) {
      const name      = profile?._eventName || "npc";
      const rng       = this._routineRng(name, day);
      // A child's day is a child's (SECTION 11b4).
      if (Children.isMinor(profile, name)) return Children.routineForDay(profile, day, rng);
      // A beast's day is a creature's (creatureDay).
      if (ScheduleManager._isNonSentient(profile)) return this.creatureDay(profile, day, rng);
      const bias      = this._personalityBias(profile);
      // Saturday and Sunday: more of the free hours go to play and company,
      // fewer to chasing money, and a weekday-only trade does not open.
      bias.weekend    = this.isWeekend(day);
      bias.holiday    = !!window.PublicHolidays?.isDayOff?.(profile?._homeGroupName, day);

      const { wakeHour, bedHour, breakfast, lunch, dinner } = this._anchors(profile, name, rng);

      // On leave the free hours are spent at home (SECTION 11d2): resting off
      // an illness, or minding a child with one errand out of the house.
      const leave = LeaveManager.active(profile);
      const errand = leave ? this._clamp(lunch + 2, 10, 17) : -1;
      const routine = new Array(24);
      for (let h = 0; h < 24; h++) {
        if (this._inShopShift(profile, h))                  { routine[h] = "shopwork"; continue; }
        if (this._inWorkHours(profile, h, day))             { routine[h] = "work";     continue; }
        if (this._isSleepHour(h, wakeHour, bedHour))        { routine[h] = "sleep";    continue; }
        if (h === breakfast || h === lunch || h === dinner) { routine[h] = "hunger";   continue; }
        if (h === wakeHour)                                 { routine[h] = "hygiene";  continue; }
        if (leave) {
          routine[h] = leave.kind === "parental" ? (h === errand ? "shopping" : "home") : "comfort";
          continue;
        }
        routine[h] = this._pickFreeTimeActivity(rng, profile, bias);
      }
      return routine;
    },

    // Builds (or returns the cached) routine for the NPC's *current* in-game
    // day, this is what ScheduleManager consults every tick.
    ensureRoutine(profile) {
      const day = this._dayIndex();
      if (profile._routineDay !== day || !Array.isArray(profile.routine) || profile.routine.length !== 24) {
        profile.routine     = this.generateForDay(profile, day);
        profile._routineDay = day;
      }
      return profile.routine;
    },

    getActivity(profile, hour) {
      const routine = this.ensureRoutine(profile);
      return routine[this._clamp(Math.floor(hour), 0, 23)] ?? "leisure";
    },

    // ── Display helpers (used by NPCEmpathize's "Routine" panel) ───────────

    // Last 24 hourly slots ending at, and including, the current hour,
    // spanning the day boundary into yesterday's (re-derived, not cached)
    // routine when needed. Oldest first, so the UI can read it top to bottom
    // as "what they've been up to today (and a little before)".
    getLast24Hours(profile) {
      const hourNow    = this.hourNow();
      const day        = this._dayIndex();
      const today      = this.ensureRoutine(profile);
      const yesterday  = this.generateForDay(profile, day - 1);
      const nowMin     = $gameVariables?.value(114) ?? 0;
      const out = [];
      for (let i = 23; i >= 0; i--) {
        let h = hourNow - i;
        const fromYesterday = h < 0;
        if (fromYesterday) h += 24;
        const entry = { hour: h, activity: (fromYesterday ? yesterday : today)[h], isPast: i > 0 };
        // What they actually did, where it was not the plan (routineLog).
        const seen = this.loggedAt(profile, fromYesterday ? day - 1 : day, h);
        if (seen) {
          entry.activity = seen.a;
          entry.override = seen.k || "override"; // i18n-ignore: override kind id
          if (seen.m) entry.mapId = seen.m;
        }
        // And whatever the rest of the simulation says the hour was.
        const shown = this.displayActivity(profile, entry.activity, nowMin - i * 60, entry.override, i === 0);
        if (shown !== entry.activity) {
          entry.planned = entry.activity;
          entry.activity = shown;
        }
        out.push(entry);
      }
      return out; // oldest → newest; last entry is the current hour
    },

    // ── What really happened (profile.routineLog) ────────────────────────
    // The plan is regenerated from the seed every day, so it can only ever
    // say what was meant. Whatever cut in (a craving, an errand, sick or
    // parental leave, a shift at a particular post, a game at the arcade) is
    // written here, one entry per hour, so the Empathize routine tells the
    // truth about the hours behind them. Compact entries: { d: day, h: hour,
    // a: activity, k: kind, m: mapId }, the last ROUTINE_LOG_MAX kept.
    ROUTINE_LOG_MAX: 24,

    loggedAt(profile, day, hour) {
      const log = profile?.routineLog;
      if (!Array.isArray(log)) return null;
      for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (e && e.d === day && e.h === hour) return e;
      }
      return null;
    },

    // Writes one hour's truth: `kind` names why (sick, parental, workspot,
    // minigame, need), `mapId` where. An hour that went as planned and has
    // nothing to add is not written.
    record(profile, hour, activity, kind, mapId) {
      if (!profile || !activity) return;
      const h = this._clamp(Math.floor(hour), 0, 23);
      const d = this._dayIndex();
      if (!kind && this.getActivity(profile, h) === activity) return;
      const log = Array.isArray(profile.routineLog) ? profile.routineLog : (profile.routineLog = []);
      const last = log[log.length - 1];
      const e = { d, h, a: activity };
      if (kind) e.k = kind;
      if (mapId) e.m = mapId;
      if (last && last.d === d && last.h === h) {
        // A more specific reason is not overwritten by a plain need later
        // in the same hour.
        if (last.k && last.k !== "need" && (!kind || kind === "need")) return; // i18n-ignore: override kind id
        log[log.length - 1] = e;
      } else {
        log.push(e);
        if (log.length > this.ROUTINE_LOG_MAX) log.splice(0, log.length - this.ROUTINE_LOG_MAX);
      }
    },

    // The tick's call: what evaluate() answered this hour, and why it is not
    // the plan when it is not.
    noteActual(profile, hour, activity) {
      if (!profile || !activity) return;
      // Every hour of a leave is written, planned or not: the reason is the news.
      const leave = LeaveManager.active(profile);
      if (leave) {
        const last = profile.routineLog?.[profile.routineLog.length - 1];
        if (last && last.d === this._dayIndex() && last.h === Math.floor(hour) && last.k === leave.kind && last.a === activity) return;
        return this.record(profile, hour, activity, leave.kind);
      }
      if (this.getActivity(profile, hour) === activity) return;
      this.record(profile, hour, activity, "need"); // i18n-ignore: override kind id
    },

    // Remaining slots of today, hour+1 .. 23, "what's still on the books".
    getRestOfDay(profile) {
      const hourNow = this.hourNow();
      const routine = this.ensureRoutine(profile);
      const out = [];
      const nowMin  = $gameVariables?.value(114) ?? 0;
      for (let h = hourNow + 1; h < 24; h++) {
        out.push({ hour: h, activity: this.displayActivity(profile, routine[h], nowMin + (h - hourNow) * 60, null, false) });
      }
      return out;
    },

    // ── What the schedule shows (SCHEDULE SITUATIONS) ────────────────────
    // The plan is what somebody meant to do with an hour; the schedule shows
    // what the whole simulation says they were doing: out with an adventuring
    // band (exploringTower / exploringDungeon / exploringSpace), on a trip
    // (travelling), in the middle of a move (relocating), on leave
    // (onLeave.sick / onLeave.parental), a child's school and play, a fight
    // (fighting / fleeing / downed / recovering), an hour at the games
    // (minigame) and one in the water or on its bank (swimming / fishing). Display only: the plan every behaviour reads is untouched.
    SITUATION_IDS: [
      "exploringTower", "exploringDungeon", "exploringSpace", "travelling", "relocating",
      "onLeave.sick", "onLeave.parental", "school", "play",
      "fighting", "fleeing", "downed", "recovering", "minigame", "swimming", "fishing",
      // An hour at a hive or a barrel (NPCSim.Tending).
      "beekeeping", "brewing",
      // A creature's day (creatureDay): Empathize.activity.creature.*.
      "creature.asleep", "creature.rest", "creature.graze", "creature.forage", "creature.hunt",
      "creature.wander", "creature.drink", "creature.groom", "creature.play", "creature.herd",
    ],

    // The hours of a leave that are the leave's own, rather than a meal, a
    // wash or a night's sleep.
    _LEAVE_KEEPS: ["sleep", "hunger", "hygiene"],

    displayActivity(profile, activity, minute, kind, isNow) {
      if (!profile) return activity;
      const name = profile._eventName;
      // The life first: away with a band, travelling or moving is the day.
      const life = name ? window.NPCLifeSim?.situationAt?.(name, minute) : null;
      if (life && !(life === "travelling" && activity === "sleep")) return life; // i18n-ignore: routine activity id
      // What is happening to them right now, where the controller knows.
      if (isNow) {
        const live = this.liveActivity(profile);
        if (live) return live;
      }
      if (activity === "heal") return "recovering"; // i18n-ignore: routine activity id
      // On leave: the reason is the news, except for a meal, a wash or sleep.
      const leave = profile.leave;
      const leaveKind = (kind === "sick" || kind === "parental") ? kind
        : (leave && minute >= (Number(leave.sinceMin) || 0) && minute < (Number(leave.untilMin) || 0) ? leave.kind : null);
      if (leaveKind && !this._LEAVE_KEEPS.includes(activity)) return "onLeave." + leaveKind; // i18n-ignore: routine activity id
      // A creature asleep is asleep where it lies, not "at home".
      if (activity === "sleep" && ScheduleManager._isNonSentient(profile)) return "creature.asleep"; // i18n-ignore: routine activity id
      // A child's free afternoon is play.
      if (activity === "leisure" && Children.isMinor(profile, name)) return "play"; // i18n-ignore: routine activity id
      return activity;
    },

    // The state a person is in this minute, off their profile and their
    // controller (NPCSkirmish): down, running, fighting or getting over it.
    liveActivity(profile) {
      if (!profile) return null;
      // i18n-ignore-start: routine activity ids and controller state ids
      if (profile.downed) return "downed";
      const name = profile._eventName;
      let state = null;
      try { state = name ? window.NPCSkirmish?.ctrl?.(name)?.state : null; } catch (e) { state = null; }
      if (state === "fleeing") return "fleeing";
      if (state === "skirmishing") return "fighting";
      // In the water or on the bank (NPCSim.Water): running from something
      // into it is still fleeing.
      if (state === "goingToSwim" || state === "swimming") {
        let ctrl = null;
        try { ctrl = window.NPCSkirmish?.ctrl?.(name); } catch (e) { ctrl = null; }
        return ctrl?._swim?.reason === "escape" ? "fleeing" : "swimming";
      }
      if (state === "goingToFish" || state === "fishing") return "fishing";
      const mhp = Number(profile.mhp) || 0;
      if (mhp > 0 && profile.hp != null && Number(profile.hp) < mhp * 0.5 &&
          (profile.currentNeed === "heal" || (Array.isArray(profile.injuries) && profile.injuries.length))) return "recovering";
      // i18n-ignore-end
      return null;
    },

    // A moment another system wants on the record (a fight started, a flight,
    // a fall): written on the current hour with the id as its own reason, so a
    // plain need later in the hour does not paper over it.
    mark(who, activity, mapId) {
      const profile = typeof who === "string" ? $gameSystem?._npcSociety?.[who] : who;
      if (!profile || !activity) return;
      this.record(profile, this.hourNow(), activity, activity, mapId || $gameMap?.mapId?.() || 0);
    },
  };

  // ============================================================================
  // SECTION 3c, ACTIVITY PLACER (instant in-progress placement on map load)
  // ============================================================================
  // When a map loads, NPCs shouldn't appear to "spawn idle" and only start
  // wandering toward their routine afterward, they should already look like
  // they're mid-activity, the way a real town feels lived-in the moment you
  // walk into it. This scans freshly-spawned controllers, asks the existing
  // need/routine pipeline what each NPC *should* be doing right now, and (if a
  // suitable nearby event exists) teleports them adjacent to it in the
  // "interacting" state, reusing the very same capability registry and need
  // vocabulary as the live simulation, just skipping the travel time once.
  const ActivityPlacer = {
    placeOnMapLoad() {
      if (!$gameMap || !$gameSystem?._npcSociety) return;
      const hour = $gameVariables?.value(23) ?? 12;
      const controllers = $gameSystem.getActiveNPCControllers?.() || [];
      for (const ctrl of controllers) {
        if (!ctrl || ctrl.state !== "idle") continue;
        const profile = $gameSystem._npcSociety[ctrl.eventName];
        if (!profile) continue;
        ensureSimFields(profile, ctrl.eventName);
        const need = ScheduleManager.evaluate(profile, hour);
        profile.currentNeed = need;
        // NPCSystem.spawnAssignedNPCs already dropped this NPC back at their
        // remembered spot when one existed (see captureNPCGroupMemory/
        // recallNPCSpot), so _tryParkAt's nearest-candidate search naturally
        // re-resumes the same activity they were last seen doing, and
        // properly sets up state/target/animation via goInteractNow, instead
        // of leaving the controller stuck "idle" beside an event it's
        // supposedly interacting with.
        this._tryParkAt(ctrl, profile, need);
      }
    },

    _tryParkAt(controller, profile, need) {
      // Sleep/idle needs are already handled by each controller's normal
      // "go home and rest" logic the moment it starts updating, placing it
      // here would just fight that decision a tick later.
      if (!need || need === "sleep") return;
      const candidates = InteractionScanner.findByNeed?.(need, profile) || [];
      const best = candidates[0];
      if (!best || !best.event || (best.score ?? 0) <= 0) return;
      if (typeof controller.goInteractNow === "function") {
        controller.goInteractNow(best.event, need);
      }
    },
  };


  // findPassable: returns a small sample of passable tiles near the map centre.
  // Deliberately bounded to avoid scanning every tile on large maps.
  function findPassable() {
    if (!$gameMap) return [];
    const cx = Math.floor($gameMap.width()  / 2);
    const cy = Math.floor($gameMap.height() / 2);
    const RADIUS = 12;
    const result = [];
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const x = cx + dx, y = cy + dy;
        if ($gameMap.isValid(x, y) && $gameMap.isPassable(x, y, 2) && !isBlockedTerrain(x, y)) {
          result.push({ x, y });
        }
      }
    }
    return result;
  }

  Object.assign(NPCSim._internal, {
    ActivityPlacer, findPassable, RoutineManager, ScheduleManager,
  });
})();
