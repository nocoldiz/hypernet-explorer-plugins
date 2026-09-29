/*:
 * @target MZ
 * @plugindesc NPC Simulation Core v1.0.0, Autonomous Society Orchestrator
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCSimulationCore, Autonomous Society Orchestrator
 * ============================================================================
 * Central scheduler that wires all game systems together so every NPC can:
 *   - Have hunger, sleep, and money needs that drive their behaviour
 *   - Hold jobs from WorkSystem and simulate off-screen shifts
 *   - Tend plants and animals if they have compatible traits
 *   - Approach and interact with vending machines, arcade cabinets, shops
 *   - Steal from shops when morality is low (and may get caught)
 *   - Generate contextual thoughts shown in dialogue
 *   - Accumulate a personal story log that feeds into HistorySimulator
 *
 * Load Order:
 *   DataService → NPCSystem → NPCSociety → NPCSystemParty
 *   → NPCSimulationCore  ← this file
 *   → HistorySimulator → HistorySimulatorUI
 *
 * Modules: this file keeps the constants, the shared helpers, the era
 * tension, the EventBus, the NeedManager, the plugin commands and the family
 * namespace (NPCSim._internal). The rest lives in NPCSim_Routine, _Behavior,
 * _Tending, _Crime, _Jobs, _Minigames, _Economy, _Thoughts, _Homes,
 * _Development, _Children, _Gear, _Addictions, _Vehicles, _Implants and
 * _Tick (last: the main tick, the public facade and the engine hooks), listed
 * in js/plugins.js right after this file in that order.
 *
 * Plugin Command:
 *   NPCHistory <EventName> , shows the story log for the named NPC
 *
 * @command NPCHistory
 * @desc Show the autonomous story log of a specific NPC.
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 * @desc The exact event name of the NPC whose history you want to view.
 *
 * @command NPCDebug
 * @desc Print the full simulation profile of a named NPC to the browser console.
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 *
 * @command NPCForceNeed
 * @desc Override a specific field on an NPC profile (for testing).
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 *
 * @arg field
 * @text Field name
 * @type string
 * @default hunger
 * @desc e.g. hunger, sleep, money, moralityScore, currentJobId
 *
 * @arg value
 * @text Value
 * @type string
 * @default 0
 * @desc Numeric value to assign.
 */

(() => {
  "use strict";

  const pluginName = "NPCSimulationCore";

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  const DEFAULT_SEED = 19002001;
  const MONEY_CAP    = 200000;  // Gold cap per NPC, prevents unbounded accumulation
  const REST_REGION  = 102;     // Region ID: NPC rest zones (fill sleep, face Counter if adjacent)

  // The road to 2012: society stays calm up to ERA_CALM_YEAR, then frays month
  // by month until ERA_CHAOS_YEAR, the apex of crime and paranoia (see
  // eraTension below). Wired to TimeDateSystem so it tracks fast-travel jumps
  // and the cryo wake-up alike.
  const ERA_CALM_YEAR  = 2010;
  const ERA_CHAOS_YEAR = 2012;

  // Shared shift system, used by both job-working NPCs (JobShiftManager) and
  // <Shop>-tagged events (ShopShiftManager): three 8-hour shifts cover the
  // full 24h day (00-08, 08-16, 16-24).
  const SHIFT_HOURS = 8;
  const SHIFT_COUNT = 3; // 3 shifts x 8h = 24h

  // Weekday-only trades (JobManager.isWeekdayOnly): these Jobs.json
  // categories keep office hours, except the trades that serve the weekend.
  const WEEKDAY_CATEGORIES = ["Labor", "Technical", "General"]; // i18n-ignore: Jobs.json category ids
  const WEEKEND_TRADES = ["Cooking", "Swimming", "Video Gaming", "Weightlifting", "Film Criticism", "Farming"]; // i18n-ignore: Jobs.json spec ids

  // Fraction of a group's job-less NPCs reserved during job assignment as the
  // "can be a shopkeeper" pool, ShopShiftManager draws counter personas from
  // these free locals first, only borrowing from other groups when they run out.
  const SHOPKEEPER_POOL_RATIO = 0.4;

  // Farming-compatible trait keywords
  const FARMING_TRAITS = ["farmer", "botanist", "herbalist", "gardener", "rancher", "animal lover", "shepherd"]; // i18n-ignore: Traits.json keywords, matched against the trait name

  // All NPC dialogue text (need-based thought templates, familiar-player and
  // capability-reaction lines, situational + personality thoughts, NPC↔NPC
  // conversation scripts) lives in NPCConversation.js. ThoughtGenerator below
  // delegates to window.NPCConversation.ThoughtProvider at runtime.

  // ============================================================================
  // SHARED UTILITIES (see NPCShared.js)
  // ============================================================================

  // Guard the destructure: NPCShared may not have evaluated yet under some load
  // orders. Sibling call sites already null-check window.NPCShared at call time.
  const { nameHash, Rng: MiniRng } = window.NPCShared || {};

  // Terrain NPCs are never sent to (water tag 3, tag 7), same rule the spawner
  // and the pathfinder in NPCSystem.js apply.
  const isBlockedTerrain = (x, y) => window.NPCShared
    ? window.NPCShared.isBlockedTerrain(x, y)
    : [3, 7].includes($gameMap.terrainTag(x, y));

  // Amounts are stored in gold and shown to the player in euros (100g = 1.00€).
  const fmtMoney = (gold) => window.NPCShared
    ? window.NPCShared.formatMoney(gold)
    : `${gold}g`;

  // Seeded RNG for persistent wealth/inventory drift. Keyed by NPC name, a
  // per-call salt, and the in-game minute, XORed with the world seed, so money
  // earned/spent/gambled is reproducible from the world seed instead of the old
  // raw Math.random() (which made the same world diverge on every run) while
  // still varying minute to minute.
  function economyRng(name, salt, minute) {
    const ws = window.NPCShared ? window.NPCShared.worldSeed() : 19002001;
    const m  = minute === undefined ? ($gameVariables?.value(114) ?? 0) : minute;
    return new MiniRng(nameHash(`${name || "npc"}_${salt}_${m}`) ^ ws);
  }

  // ============================================================================
  // SECTION 1a, ERA TENSION (the road to 2012)
  // ============================================================================
  // As the in-game clock climbs from 2010 toward 2012, the world frays: crime
  // rises and ordinary people grow paranoid and distrustful of the player, with
  // 2012 the peak of the chaos. Returns 0 (calm, <=2010) .. 1 (max chaos,
  // >=2012). Read live from TimeDateSystem so a single number drives both the
  // off-screen society sim (here) and on-map NPC reactions (NPCSystem.js).
  function eraTension() {
    const T = window.TimeDateSystem;
    if (!T || !T.getGameTimeMinutes || !T.getDateTimeFromMinutes) return 0;
    let dt;
    try { dt = T.getDateTimeFromMinutes(T.getGameTimeMinutes()); } catch (_) { return 0; }
    if (!dt) return 0;
    // Fractional year so the slide is smooth month to month, not a yearly step.
    const year = dt.year + (Number(dt.monthNum) - 1) / 12;
    if (year <= ERA_CALM_YEAR)  return 0;
    if (year >= ERA_CHAOS_YEAR) return 1;
    return (year - ERA_CALM_YEAR) / (ERA_CHAOS_YEAR - ERA_CALM_YEAR);
  }

  // ============================================================================
  // SECTION 1, EVENT BUS
  // ============================================================================

  const listeners = {};

  const EventBus = {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    emit(event, data) {
      (listeners[event] || []).forEach(fn => { try { fn(data); } catch (e) { console.error("[NPCSim] EventBus error:", e); } });
    },
  };

  // ============================================================================
  // SECTION 2, NEED MANAGER
  // ============================================================================
  // Drains hunger and sleep at the same per-minute rates as TimeDateSystem
  // (0.05/step ≈ 3/min at 60 steps/min; 0.03/step ≈ 1.8/min, converted below)

  const HUNGER_DRAIN_PER_MIN  = 0.10;  // slightly faster than player for drama
  const SLEEP_DRAIN_PER_MIN   = 0.06;
  const HYGIENE_DRAIN_PER_MIN = 0.05;
  const SOCIAL_DRAIN_PER_MIN  = 0.03;
  const LEISURE_DRAIN_PER_MIN = 0.03;

  const NeedManager = {
    update(profile, deltaMinutes) {
      if (!profile) return;
      // Settlement episodes bend the drains (world web): epidemics chew
      // through hygiene and isolate people, festivals feed social/leisure.
      const web = window.NPCWorldWeb?.needDrainModifiers?.(profile._homeGroupName);
      const hygieneMul = web?.hygiene ?? 1, socialMul = web?.social ?? 1, leisureMul = web?.leisure ?? 1;
      profile.hunger  = Math.max(0, (profile.hunger  ?? 100) - HUNGER_DRAIN_PER_MIN  * deltaMinutes);
      profile.sleep   = Math.max(0, (profile.sleep   ?? 100) - SLEEP_DRAIN_PER_MIN   * deltaMinutes);
      profile.hygiene = Math.max(0, (profile.hygiene ?? 100) - HYGIENE_DRAIN_PER_MIN * hygieneMul * deltaMinutes);
      profile.social  = Math.max(0, (profile.social  ?? 100) - SOCIAL_DRAIN_PER_MIN  * socialMul  * deltaMinutes);
      profile.leisure = Math.max(0, (profile.leisure ?? 100) - LEISURE_DRAIN_PER_MIN * leisureMul * deltaMinutes);
      // An animal has one hunger meter: its livestock record's fedAt
      // (AnimalGrowthSystem), which this meter is read back from.
      if (profile.isCreature) window.NPCLifeSim?.Animals?.syncHunger?.(profile, profile._eventName);
    },

    feed(profile, calories) {
      profile.hunger = Math.min(100, (profile.hunger ?? 0) + calories * 0.10);
    },
  };

  // ---- Gradual need satisfaction while interacting --------------------------
  // Per-second fill rates applied while an NPC is in the "interacting" state
  // (see NPCSystem.js updateInteracting + window.NPCSim.satisfyNeedTick below).
  // Only needs backed by a numeric profile meter can be filled this way,
  // money/crime/safety/work resolve through their own simulated effects (§5.1
  // of docs/npc_event_interaction_design_en.md) instead of a gradual meter.
  const NEED_FILL_PER_SEC = { hunger: 2.5, sleep: 3, hygiene: 4, social: 2, leisure: 1.5, comfort: 2 };
  const NEED_METER_FIELD  = { hunger: "hunger", sleep: "sleep", hygiene: "hygiene", social: "social", leisure: "leisure", comfort: "leisure",
    // A creature's hours (RoutineManager.creatureDay) fill the same meters:
    // grazing, foraging and hunting feed it, rest sleeps it, grooming washes
    // it, the herd is its company and play and a wander its leisure.
    "creature.graze": "hunger", "creature.forage": "hunger", "creature.hunt": "hunger", "creature.drink": "hunger",
    "creature.rest": "sleep", "creature.groom": "hygiene", "creature.herd": "social",
    "creature.play": "leisure", "creature.wander": "leisure" };

  function satisfyNeedTick(npcName, need, deltaSeconds) {
    if (!npcName || !need || deltaSeconds <= 0) return;
    const profile = $gameSystem?._npcSociety?.[npcName];
    if (!profile) return;

    const field = NEED_METER_FIELD[need];
    const rate  = NEED_FILL_PER_SEC[need];
    if (field && rate) {
      profile[field] = Math.min(100, (profile[field] ?? 100) + rate * deltaSeconds);
    }
  }

  // ---- Off-screen need fulfilment -------------------------------------------
  // The background sim decides what each NPC is *doing* every tick
  // (ScheduleManager.evaluate → profile.currentNeed). satisfyNeedTick above
  // only fills meters for NPCs the player is physically interacting with, so
  // without this an off-screen NPC's needs decayed monotonically to 0 and
  // stuck there (the Empathize panel then shows every vital at 0%). This models
  // them actually attending to their current need off-screen: eating when
  // hungry, sleeping when tired, washing, mingling… Rates run well above the
  // passive drain so the attended need climbs back up over a session while the
  // untended four keep drifting down, producing the oscillating meters a living
  // routine should have instead of a flat floor. Non-meter needs (work, money,
  // crime, safety) resolve through their own simulated effects, not a meter.
  const OFFSCREEN_FILL_PER_MIN = {
    hunger: 1.2, sleep: 1.0, hygiene: 1.5, social: 1.0, leisure: 0.8, comfort: 0.8,
    "creature.graze": 1.2, "creature.forage": 1.2, "creature.hunt": 1.0, "creature.drink": 0.4,
    "creature.rest": 0.6, "creature.groom": 1.5, "creature.herd": 1.0,
    "creature.play": 0.8, "creature.wander": 0.8,
  };
  function satisfyNeedOffscreen(profile, need, deltaMinutes) {
    if (!profile || !need || deltaMinutes <= 0) return;
    const field = NEED_METER_FIELD[need];
    const rate  = OFFSCREEN_FILL_PER_MIN[need];
    if (field && rate) {
      profile[field] = Math.min(100, (profile[field] ?? 100) + rate * deltaMinutes);
    }
  }

  // ============================================================================
  // FAMILY NAMESPACE (NPCSim_*.js)
  // ============================================================================
  // The simulation is split across the NPCSim_*.js modules listed in
  // js/plugins.js right after this file. Each module reads the helpers it
  // shares with the others off NPCSim._internal and publishes its own there;
  // a name owned by a module that loads later is bound through _late, which
  // NPCSim_Tick.js (the last module) runs once the whole family is in.

  const NPCSim = { _internal: { _late: [] } };
  window.NPCSim = NPCSim;
  Object.assign(NPCSim._internal, {
    DEFAULT_SEED, economyRng, eraTension, EventBus, FARMING_TRAITS, fmtMoney, isBlockedTerrain,
    MiniRng, MONEY_CAP, nameHash, NEED_FILL_PER_SEC, NeedManager, REST_REGION, satisfyNeedOffscreen,
    satisfyNeedTick, SHIFT_COUNT, SHIFT_HOURS, SHOPKEEPER_POOL_RATIO, WEEKDAY_CATEGORIES,
    WEEKEND_TRADES,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let StoryLogger;
  NPCSim._internal._late.push(() => ({ StoryLogger } = NPCSim._internal));

  // ============================================================================
  // SECTION 14, PLUGIN COMMAND: NPCHistory
  // ============================================================================

  PluginManager.registerCommand(pluginName, "NPCHistory", args => {
    const name = String(args.eventName || "").trim();
    if (!name) return;
    const narrative = StoryLogger.generateNarrative(name);
    window.skipLocalization = true;
    $gameMessage.add(narrative);
    window.skipLocalization = false;
  });

  PluginManager.registerCommand(pluginName, "NPCDebug", args => {
    const name = String(args.eventName || "").trim();
    if (!name) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) {
      console.warn(`[NPCSim] NPCDebug: no profile found for "${name}"`);
      return;
    }
    console.groupCollapsed(`[NPCSim] Profile: ${name}`); // i18n-ignore: developer console
    console.log("Need:", profile.currentNeed);
    console.log("Hunger:", profile.hunger?.toFixed(1), "/ Sleep:", profile.sleep?.toFixed(1));
    console.log("Money:", profile.money, "/ Morality:", profile.moralityScore);
    console.log("Home pool:", profile.homePoolType, "/ Map:", profile.homeMapId);
    if (profile.homeBuilding) console.log("Home building:", profile.homeBuilding);
    console.log("Job ID:", profile.currentJobId, "/ Work map:", profile.workMapId, "/ Shift:", profile.workShift);
    console.log("Player opinion:", profile.playerOpinion);
    console.log("Thoughts:", profile.thoughts);
    console.log("Event log:", profile.eventLog?.slice(0, 5));
    console.log("Full profile:", JSON.parse(JSON.stringify(profile)));
    console.groupEnd();
  });

  PluginManager.registerCommand(pluginName, "NPCForceNeed", args => {
    const name  = String(args.eventName || "").trim();
    const field = String(args.field || "hunger").trim();
    const value = Number(args.value ?? 0);
    if (!name || !field) return;
    const profile = $gameSystem?._npcSociety?.[name];
    if (!profile) { console.warn(`[NPCSim] NPCForceNeed: no profile for "${name}"`); return; }
    profile[field] = value;
    console.log(`[NPCSim] Set ${name}.${field} = ${value}`);
  });

})();
