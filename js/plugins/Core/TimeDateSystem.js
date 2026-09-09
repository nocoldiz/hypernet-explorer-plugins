/*:
 * @target MZ
 * @plugindesc v1.2.0 Adds hunger and sleep systems with overeating mechanic.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help TimeDateSystem
 * === Hunger and Sleep System v1.2.0 ===
 *
 * This plugin adds hunger and sleep mechanics to your game.
 * This version has been modified for a more realistic hunger system.
 *
 * --- What's New in v1.2.0 ---
 * - Added overeating system:
 * - Hunger indicator can exceed 100% (up to 150% by default).
 * - If it exceeds 300%, the player suffers a state (default: 41).
 * - The state is removed when hunger drops below 100%.
 * - Hunger consumption is much faster when above 100%.
 *
 * --- Features ---
 * - Characters become hungry and sleepy over time.
 * - Status is displayed in the main menu (HP, MP, Status, Hunger, Sleep).
 * - Shows current time and temperature.
 * - Notifications appear when hunger/sleep states change.
 * - Debuffs applied at low levels (< 20%) and severe at 0%.
 * - Hunger recovers by eating food with specific nutritional values.
 *
 * --- New Plugin Command: EatFood ---
 * This command replaces the old "RecoverHunger".
 * Simulates food consumption by an actor.
 *
 * 1.  **Before calling the command**, set the nutritional values
 * of the food item in three game variables:
 * - Calories Variable (default: 88)
 * - Fat Variable (default: 89)
 * - Protein Variable (default: 90)
 *
 * @param --- Hunger/Sleep Settings ---
 *
 * @param hungerDecreaseRate
 * @text Hunger Decrease Rate
 * @desc How much hunger decreases per step.
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.05
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param sleepDecreaseRate
 * @text Sleep Decrease Rate
 * @desc How much sleep decreases per step.
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.03
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param maxHunger
 * @text Max Hunger
 * @desc Maximum hunger value (100% threshold).
 * @type number
 * @min 1
 * @default 100
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param overeatMaxHunger
 * @text Max Hunger (Overeating)
 * @desc Maximum hunger value that can be reached during overeating.
 * @type number
 * @min 100
 * @default 350
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param overeatStateId
 * @text Overeating State ID
 * @desc The ID of the state applied when overeating (>300%).
 * @type state
 * @default 41
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param withdrawalStateId
 * @text Withdrawal State ID
 * @desc The ID of the state applied to an addict whose craving reaches 100.
 * @type state
 * @default 50
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param overeatDepletionMultiplier
 * @text Overeating Depletion Multiplier
 * @desc Multiplier for hunger decrease rate when hunger > 100%.
 * @type number
 * @decimals 2
 * @default 3.00
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param shiftMultiplier
 * @text Run Drain Multiplier
 * @desc Hunger/sleep drain multiplier while running (Shift held).
 * @type number
 * @decimals 2
 * @default 2.00
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param maxSleep
 * @text Max Sleep
 * @desc Maximum sleep value.
 * @type number
 * @min 1
 * @default 100
 * @parent --- Hunger/Sleep Settings ---
 *
 * @param --- Realistic Hunger Recovery ---
 *
 * @param calorieVariableId
 * @text Calorie Variable ID
 * @desc The ID of the game variable that stores food calories.
 * @type variable
 * @default 88
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param fatVariableId
 * @text Fat Variable ID
 * @desc The ID of the game variable that stores food fat.
 * @type variable
 * @default 89
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param proteinVariableId
 * @text Protein Variable ID
 * @desc The ID of the game variable that stores food protein.
 * @type variable
 * @default 90
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param caffeineVariableId
 * @text Caffeine Variable ID
 * @desc The ID of the game variable that stores food caffeine.
 * @type variable
 * @default 91
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param calorieFactor
 * @text Calorie Factor
 * @desc Multiplier for calories in hunger recovery calculation.
 * @type number
 * @decimals 2
 * @default 0.10
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param proteinFactor
 * @text Protein Factor
 * @desc Multiplier for protein in hunger recovery calculation.
 * @type number
 * @decimals 2
 * @default 2.00
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param fatFactor
 * @text Fat Factor
 * @desc Multiplier for fat in hunger recovery calculation.
 * @type number
 * @decimals 2
 * @default 1.50
 * @parent --- Realistic Hunger Recovery ---
 *
 *
 * @param caffeineFactor
 * @text Caffeine Factor
 * @desc Multiplier for caffeine in hunger recovery calculation.
 * @type number
 * @decimals 2
 * @default 1.50
 * @parent --- Realistic Hunger Recovery ---
 *
 * @param --- Time Management Settings ---
 *
 * @param gameTimeVariable
 * @text Game Time Variable
 * @desc Variable ID to store total game minutes elapsed (used on map 315 for manual advancement).
 * @type variable
 * @default 114
 * @parent --- Time Management Settings ---
 *
 * @param gameDateVariable
 * @text Game Date Variable
 * @desc Variable ID to store formatted date/time string (updates on hour/minute changes).
 * @type variable
 * @default 113
 * @parent --- Time Management Settings ---
 *
 * @param --- UI Settings ---
 *
 * @param hungerIcon
 * @text Hunger Icon
 * @desc Icon index for hunger display.
 * @type number
 * @min 0
 * @default 219
 * @parent --- UI Settings ---
 *
 * @param sleepIcon
 * @text Sleep Icon
 * @desc Icon index for sleep display.
 * @type number
 * @min 0
 * @default 11
 * @parent --- UI Settings ---
 *
 * @param temperatureVariable
 * @text Temperature Variable
 * @desc ID of the variable that stores the temperature value.
 * @type variable
 * @default 61
 * @parent --- UI Settings ---
 *
 * @param timeIcon
 * @text Time Icon
 * @desc Icon index for time display.
 * @type number
 * @min 0
 * @default 220
 * @parent --- UI Settings ---
 *
 * @param temperatureIcon
 * @text Temperature Icon
 * @desc Icon index for temperature display.
 * @type number
 * @min 0
 * @default 64
 * @parent --- UI Settings ---
 *
 * @command EatFood
 * @text Eat Food (Recover Hunger)
 * @desc Recovers hunger for an actor based on nutritional values in game variables. Variables are reset to zero after use.
 * @arg actorId
 * @text Actor ID
 * @desc The actor who will eat the food.
 * @type actor
 * @default 1
 *
 * @command RecoverSleep
 * @text Recover Sleep
 * @desc Recovers sleep for the specified actor.
 * @arg actorId
 * @text Actor ID
 * @desc ID of the actor to recover sleep for (1, 2, etc.).
 * @type actor
 * @default 1
 * @arg amount
 * @text Amount
 * @desc Amount of sleep to recover (percentage).
 * @type number
 * @min 1
 * @max 100
 * @default 50
 *
 * @command StartSeat
 * @text Start Seat
 * @desc Activates seat mode: the player recovers 0.5% sleep per second
 * but can only turn around, not move.
 *
 * @command StopSeat
 * @text Stop Seat
 * @desc Deactivates seat mode and restores normal movement.
 *
 * @command Vomit
 * @text Vomit
 * @desc Vomits to reduce hunger by 40% of the maximum (never below 0%).
 * @arg actorId
 * @text Actor ID
 * @desc The actor who will vomit.
 * @type actor
 * @default 1
 *
 * @command PassTime
 * @text Pass Time
 * @desc Advance the game clock by specified hours and minutes.
 * @arg hours
 * @text Hours
 * @desc Number of hours to advance.
 * @type number
 * @min 0
 * @default 0
 * @arg minutes
 * @text Minutes
 * @desc Number of minutes to advance (0-59).
 * @type number
 * @min 0
 * @max 59
 * @default 0
 *
 * @command FullRestore
 * @text Full Restore (Food & Sleep)
 * @desc Restores hunger and sleep to 100% for all party members.
 *
 * @command AdjustNeed
 * @text Adjust Need (All Party)
 * @desc Add or subtract from a need stat for every party member. Result clamps to 0-100.
 *
 * @arg need
 * @text Need
 * @type select
 * @option Hunger
 * @value hunger
 * @option Sleep
 * @value sleep
 * @option Hygiene
 * @value hygiene
 * @option Social
 * @value social
 * @option Fun
 * @value leisure
 * @default hunger
 *
 * @arg amount
 * @text Amount
 * @desc Amount to add (positive) or remove (negative). Result clamps to 0-100.
 * @type number
 * @min -100
 * @max 100
 * @default 10
 *
 * @command SleepMenu
 * @text Sleep Menu
 * @desc Opens the dedicated sleep and management menu.
 *
 * @command CryogenicSleep
 * @text Cryogenic Sleep
 * @desc Opens the cryogenic pod date picker. The party is frozen exactly as it went in while the world runs on (up to 1 Jan 2012).
 *
 * @command SimulateTime
 * @text Simulate Time
 * @desc Advance the game clock and run NPC simulation for the given duration.
 *
 * @arg years
 * @text Years
 * @type number
 * @min 0
 * @default 0
 *
 * @arg days
 * @text Days
 * @type number
 * @min 0
 * @default 0
 *
 * @arg hours
 * @text Hours
 * @type number
 * @min 0
 * @default 0
 *
 * @arg minutes
 * @text Minutes
 * @type number
 * @min 0
 * @default 0
 *
 * @arg seconds
 * @text Seconds
 * @desc Rounded to the nearest whole minute.
 * @type number
 * @min 0
 * @default 0
 *
 */

(function () {
  "use strict";

  const pluginName = "TimeDateSystem";

  // Need-state copy lives in js/i18n/<lang>/plugins/TimeDate.json.
  function getText(key) {
    return T("TimeDate.needs." + key);
  }

  // A few call sites still branch on the language to pick a number or date
  // format rather than wording, so the probe stays.
  function getCurrentLanguage() {
    return typeof ConfigManager !== "undefined" && ConfigManager.language === "it" ? "it" : "en";
  }

  // Parameters
  const parameters = PluginManager.parameters(pluginName);
  const hungerDecreaseRate = Number(parameters.hungerDecreaseRate || 0.05);
  const sleepDecreaseRate = Number(parameters.sleepDecreaseRate || 0.03);
  const maxHunger = Number(parameters.maxHunger || 100);

  // New Overeating Parameters
  const overeatMaxHunger = Number(parameters.overeatMaxHunger || 350);
  const overeatStateId = Number(parameters.overeatStateId || 41);
  const overeatDepletionMultiplier = Number(
    parameters.overeatDepletionMultiplier || 3.0
  );

  const maxSleep = Number(parameters.maxSleep || 100);

  // Extended player needs (mirrors the NPC society needs in NPCSimulationCore.js).
  // Stored 0-100 on the player actor and drained like the NPC meters.
  const maxNeed = 100;
  const hungerIcon = Number(parameters.hungerIcon || 219);
  const sleepIcon = Number(parameters.sleepIcon || 11);
  const temperatureVariable = Number(parameters.temperatureVariable || 61);
  const timeIcon = Number(parameters.timeIcon || 220);
  const temperatureIcon = Number(parameters.temperatureIcon || 64);
  const shiftMultiplier = Number(parameters.shiftMultiplier || 2);

  // Hunger-drain multiplier from ambient temperature. Comfortable band
  // (12-26 C) costs nothing; outside it the body spends extra energy to
  // regulate, so hunger drains faster the colder or hotter it gets.
  // Cold is slightly harsher than heat. Clamped to a sane ceiling.
  function temperatureHungerMultiplier(temp) {
    const t = (typeof temp === 'number' && !isNaN(temp)) ? temp : 20;
    let mult = 1.0;
    if (t < 12) {
      mult = 1 + (12 - t) * 0.045; // 0 C -> ~1.54x, -10 C -> ~1.99x
    } else if (t > 26) {
      mult = 1 + (t - 26) * 0.035; // 36 C -> ~1.35x, 46 C -> ~1.70x
    }
    return Math.min(mult, 2.5);
  }

  // What the body's hardware does to a need's drain. Health_Core reads the
  // `needs` block of every installed augment; without that plugin, or with a
  // bare body, the rate is simply 1.
  // Being ill is expensive in the same currency. Every carried disease
  // declares its own multiplier per need in Diseases.json, and one that is
  // progressing multiplies again the further along it has got, so an untreated
  // fever really does cost more food, more sleep and more washing.
  function needAugmentRate(actor, needKey) {
    let rate = 1;
    if (window.HealthCore && window.HealthCore.needDrainMultiplier) {
      const augments = window.HealthCore.needDrainMultiplier(actor, needKey);
      if (typeof augments === "number" && isFinite(augments)) rate *= augments;
    }
    if (window.DiseaseSystem && window.DiseaseSystem.needDrainMultiplier) {
      const illness = window.DiseaseSystem.needDrainMultiplier(actor, needKey);
      if (typeof illness === "number" && isFinite(illness)) rate *= illness;
    }
    return rate;
  }

  // Realistic Hunger Recovery Parameters
  const calorieVariableId = Number(parameters.calorieVariableId || 88);
  const fatVariableId = Number(parameters.fatVariableId || 89);
  const proteinVariableId = Number(parameters.proteinVariableId || 90);
  const calorieFactor = Number(parameters.calorieFactor || 0.1);
  const proteinFactor = Number(parameters.proteinFactor || 2.0);
  const caffeineVariableId = Number(parameters.caffeineVariableId || 91);
  const fatFactor = Number(parameters.fatFactor || 1.5);
  const caffeineFactor = Number(parameters.caffeineFactor || 1.5);

  // Time Management Parameters
  const gameTimeVariable = Number(parameters.gameTimeVariable || 114);
  const gameDateVariable = Number(parameters.gameDateVariable || 113);

  // Maps where hunger/sleep should not deplete (prison, transport maps, etc.).
  const NO_DEPLETION_MAPS = [718, 719, 720, 327, 1094, 317, 1102];

  // The interior maps of a vehicle (train, bus, taxi, camper, car). The travel
  // window (MapInfoHUD) only counts one of these as "inside a vehicle" - the
  // prison (1102) shares the no-depletion list but is not a vehicle.
  const VEHICLE_INTERIOR_MAPS = [718, 719, 720, 327, 721, 1094, 317];


  // Debug logging helper. Gated on the test flag only: previously this also
  // logged on NW.js, firing ~1/sec while seated even in normal play builds.
  function debug(msg) {
    if (Utils.isOptionValid("test")) {
      console.log(`[${pluginName}] ${msg}`);
    }
  }

  //=============================================================================
  // Time Management Functions
  //=============================================================================

  // Track last real-time check (for normal maps using system clock)
  let lastRealTimeCheck = Date.now();

  // Get current game time in minutes (Variable 114 stores total minutes elapsed)
  function getGameTimeMinutes() {
    return $gameVariables.value(gameTimeVariable) || 0;
  }

  // Set game time in minutes (only used for map 315 manual advancement)
  function setGameTimeMinutes(minutes) {
    $gameVariables.setValue(gameTimeVariable, Math.max(0, minutes));
  }

  // Advances game time by `totalMinutes`, stepping through it in bounded
  // chunks so window.NPCSim.tick() runs for every chunk in between, this is
  // what lets NPCs keep living their schedules (needs, jobs, routines, thoughts,
  // shop swaps...) through any big jump in time, not just while the player is
  // walking around watching the clock tick minute by minute. Used by sleeping,
  // PassTime and SimulateTime alike so no time-skip path leaves NPCs frozen.
  function advanceGameTimeSimulated(totalMinutes) {
    if (totalMinutes <= 0) return getGameTimeMinutes();

    // One chunk an hour is right for a nap, but a cryogenic jump or a
    // SimulateTime of years would ask for thousands of NPCSim passes in one
    // synchronous loop and lock the game up for as long as they take. The
    // chunk grows with the jump instead, so no single call ever runs more
    // than MAX_CHUNKS of them however far the clock is pushed.
    const MAX_CHUNKS = 48;
    const STEP = Math.max(60, Math.ceil(totalMinutes / MAX_CHUNKS));
    let remaining   = totalMinutes;
    let currentTime = getGameTimeMinutes();

    while (remaining > 0) {
      const chunk = Math.min(STEP, remaining);
      currentTime += chunk;
      remaining   -= chunk;
      setGameTimeMinutes(currentTime);
      if (window.NPCSim?.tick) {
        try { window.NPCSim.tick(currentTime); } catch (_) {}
      }
    }

    // Resolve background NPC life events (relationships, careers, crimes,
    // see NPCLifeSimulator.js) across the skipped interval in one delta pass,
    // and persist the world's npcs.json if the jump was a real time skip.
    if (window.NPCLifeSim?.catchUp) {
      try { window.NPCLifeSim.catchUp(currentTime); } catch (_) {}
    }
    if (window.EpidemicSystem?.catchUp) {
      try { window.EpidemicSystem.catchUp(currentTime); } catch (_) {}
    }
    if (window.DiseaseSystem?.runDaily) {
      try { window.DiseaseSystem.runDaily(); } catch (_) {}
    }

    updateGameDateVariable();
    return currentTime;
  }

  // Runs the hourly NPC schedule passes an advancing sequence (sleep, waiting)
  // has crossed, never more than `maxTicks` of them in one call. Whatever is
  // left over is dropped rather than queued: a frame that covers half a day
  // must not pay for twelve NPCSim passes, and NPCLifeSim.catchUp resolves the
  // skipped stretch in one delta pass when the sequence ends anyway.
  function runNpcTicksUpTo(a, upTo, maxTicks) {
    let ran = 0;
    while (a.nextNpcTick <= upTo) {
      if (maxTicks > 0 && ran >= maxTicks) {
        a.nextNpcTick = upTo + 60;
        break;
      }
      if (window.NPCSim?.tick) {
        try { window.NPCSim.tick(a.nextNpcTick); } catch (_) {}
      }
      a.nextNpcTick += 60;
      ran++;
    }
    return ran;
  }

  // Convert minutes since epoch to date/time components
  function getDateTimeFromMinutes(minutes) {
    // Base date: Jan 1, 2001 012:00 (10 AM start)
    const date = new Date(2001, 0, 1, 10, 0, 0);
    date.setMinutes(date.getMinutes() + minutes);

    const months = [
      "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
      "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
    ];

    const dayNum = String(date.getDate()).padStart(2, "0");
    const month = months[date.getMonth()];
    const monthNum = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const yearShort = String(year).slice(-2); // Get last 2 digits of year
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");

    return {
      day: date.getDate(),
      dayNum: dayNum,
      month: month,
      monthNum: monthNum,
      year: year,
      yearShort: yearShort,
      hours: hours,
      minutes: mins,
      time24: `${hours}:${mins}`,
      dateShort: `${dayNum}/${monthNum}/${yearShort}`,
      fullDate: `${dayNum} ${month} ${year} ${hours}:${mins}`
    };
  }

  //=============================================================================
  // Cryogenic sleep helpers
  //=============================================================================

  // The pod's last stop: 00:00 on 1 January 2012. A date at or past it always
  // resolves to that exact moment, and a clock already standing there or later
  // can no longer use the pod at all, which is what keeps the whole of 2012 out
  // of cryogenic reach.
  const CRYO_END = { year: 2012, month: 0, day: 1 };
  // What a night in the pod costs. Money is shown in euros everywhere in this
  // game (euros = gold / 100), so 3000 gold a day is 30 euros a day.
  const CRYO_GOLD_PER_DAY = 3000;
  const MINUTES_PER_DAY = 1440;

  // Live Date object for the current in-game moment (base epoch + elapsed mins).
  function getCurrentDateObj() {
    const date = new Date(2001, 0, 1, 10, 0, 0);
    date.setMinutes(date.getMinutes() + getGameTimeMinutes());
    return date;
  }

  function cryoEndDate() {
    return new Date(CRYO_END.year, CRYO_END.month, CRYO_END.day, 0, 0, 0);
  }

  // Whole days a calendar date stands at, counted from a fixed origin so the
  // time of day never enters the arithmetic. Date.UTC counts the real length of
  // every month and every year it crosses, so 29 February and the 366-day years
  // (2004, 2008) are counted rather than assumed away.
  function cryoDayStamp(year, month, day) {
    return Math.round(Date.UTC(year, month, day) / 86400000);
  }

  function cryoDayStampOf(date) {
    return cryoDayStamp(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // Days in a month, leap years included (day 0 of the next month is the last
  // day of this one).
  function cryoDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function cryoDateParts(date) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
  }

  // Nights spent in the pod to wake on the given date: the number of calendar
  // days between today and it, which is what the fare is charged on.
  function getCryoDays(year, month, day) {
    return Math.max(0, cryoDayStamp(year, month, day) - cryoDayStampOf(getCurrentDateObj()));
  }

  function getCryoCost(year, month, day) {
    return getCryoDays(year, month, day) * CRYO_GOLD_PER_DAY;
  }

  // How many nights the purse covers. Gold is the only limit on the pod besides
  // the calendar, so this is what decides how far ahead a date may be picked.
  function getCryoAffordableDays() {
    if (!window.$gameParty) return 0;
    return Math.floor($gameParty.gold() / CRYO_GOLD_PER_DAY);
  }

  // The window of dates the pod will accept: from tomorrow to whichever comes
  // first, 1 January 2012 or the last night the party can pay for. Null when
  // the pod cannot be used at all, with `reason` saying which wall was hit
  // ("era" past the calendar cap, "funds" short of a single night's fare).
  function getCryoDateRange() {
    const now = getCurrentDateObj();
    const end = cryoEndDate();
    if (now.getTime() >= end.getTime()) return null;
    const min = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const affordable = getCryoAffordableDays();
    let max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + affordable);
    if (cryoDayStampOf(max) > cryoDayStampOf(end)) max = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (cryoDayStampOf(max) < cryoDayStampOf(min)) return null;
    return {
      min: cryoDateParts(min),
      max: cryoDateParts(max),
      goldPerDay: CRYO_GOLD_PER_DAY,
    };
  }

  // Why the pod is closed, for the message shown in its place.
  function getCryoUnavailableReason() {
    if (getCurrentDateObj().getTime() >= cryoEndDate().getTime()) return "era";
    return "funds";
  }

  // Minutes the clock must advance to reach the chosen wake date. The pod opens
  // at the same time of day it was closed at, except on the 2012 cap, which is
  // always midnight sharp. Date arithmetic counts the true number of days in
  // between, so leap years (and a 29 February start rolling to 1 March) are
  // handled by the calendar rather than by a fixed 365.
  function getCryoAdvanceMinutesForDate(year, month, day) {
    const now = getCurrentDateObj();
    const end = cryoEndDate();
    let target = new Date(year, month, day, now.getHours(), now.getMinutes(), 0);
    if (target.getTime() >= end.getTime()) target = end;
    return Math.max(0, minutesForDate(target) - getGameTimeMinutes());
  }

  // The clock counts minutes as an offset in calendar FIELDS from the epoch:
  // that is how getDateTimeFromMinutes reads them back (it adds them to the
  // epoch's local fields) and how a world's starting date is written into the
  // variable. So the arithmetic is done in UTC, where an hour is always an
  // hour. An absolute getTime() difference is an hour out for every date
  // inside daylight saving, which would open the pod on the wrong hour of the
  // right day, and on the wrong day for a midnight wake.
  function minutesForDate(date) {
    return Math.round(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes())
        - Date.UTC(2001, 0, 1, 10, 0)) / 60000
    );
  }

  // Update date variable when time changes (on hour/minute boundary)
  let lastDisplayedHour = -1;
  let lastDisplayedMinute = -1;

  function updateGameDateVariable() {
    const minutes = getGameTimeMinutes();
    const dateTime = getDateTimeFromMinutes(minutes);

    const currentHour = parseInt(dateTime.hours);
    const currentMinute = parseInt(dateTime.minutes);

    // Update Variable 113 when hour or minute changes
    if (currentHour !== lastDisplayedHour || currentMinute !== lastDisplayedMinute) {
      lastDisplayedHour = currentHour;
      lastDisplayedMinute = currentMinute;
      $gameVariables.setValue(gameDateVariable, dateTime.fullDate);
      debug(`Game time updated: ${dateTime.fullDate}`);
    }
  }

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "EatFood", function (args) {
    const actorId = Number(args.actorId);
    const actor = $gameActors.actor(actorId);

    if (actor) {
      const calories = $gameVariables.value(calorieVariableId) || 0;
      const protein = $gameVariables.value(proteinVariableId) || 0;
      const fat = $gameVariables.value(fatVariableId) || 0;
      const caffeine = $gameVariables.value(caffeineVariableId) || 0;

      // Calculate hunger recovery based on nutritional values
      const recoveryAmount = (calories * calorieFactor) + (protein * proteinFactor) + (fat * fatFactor);

      debug(
        `Eating food for actor ${actorId}: C=${calories}, P=${protein}, F=${fat}, Caffeine=${caffeine}. Recovering ${recoveryAmount.toFixed(2)} hunger.`
      );

      actor.addHunger(recoveryAmount);

      // Handle caffeine effect on sleep
      if (caffeine > 0) {
        const sleepReduction = caffeine * caffeineFactor;
        actor.reduceSleep(sleepReduction);
        debug(`Caffeine reduced sleep by ${sleepReduction.toFixed(2)} points.`);
      }

      // Reset nutrient variables to 0 after consumption
      $gameVariables.setValue(calorieVariableId, 0);
      $gameVariables.setValue(proteinVariableId, 0);
      $gameVariables.setValue(fatVariableId, 0);
      $gameVariables.setValue(caffeineVariableId, 0);
      debug("Nutrient variables have been reset to 0.");

      // Refresh menu if open
      if (SceneManager._scene instanceof Scene_Menu && SceneManager._scene._hungerSleepStatusWindow) {
        SceneManager._scene._hungerSleepStatusWindow.refresh();
      }
    } else {
      debug(`Actor with ID ${actorId} not found.`);
    }
  });

  // Legacy command kept for old events: restores hunger directly by amount
  // (superseded by EatFood, which derives the amount from nutrient variables).
  PluginManager.registerCommand(pluginName, "RecoverHunger", function (args) {
    const actorId = Number(args.actorId || 1);
    const amount = Number(args.amount || 50);
    const actor = $gameActors.actor(actorId);
    if (actor) {
      actor.addHunger(amount);
      debug(`RecoverHunger (legacy): actor ${actorId} +${amount} hunger.`);
    }
  });

  PluginManager.registerCommand(pluginName, "RecoverSleep", function (args) {
    const actorId = Number(args.actorId || 1);
    const amount = Number(args.amount || 50);
    const actor = $gameActors.actor(actorId);

    if (actor) {
      // Calculate percentage of max sleep
      const sleepAmount = (amount / 100) * maxSleep;
      debug(
        `Recovering ${amount}% (${sleepAmount} points) sleep for actor ${actorId}`
      );
      actor.addSleep(sleepAmount);

      // Refresh menu if open
      if (SceneManager._scene instanceof Scene_Menu && SceneManager._scene._hungerSleepStatusWindow) {
        SceneManager._scene._hungerSleepStatusWindow.refresh();
      }
    } else {
      debug(`Actor ${actorId} not found.`);
    }
  });

  PluginManager.registerCommand(pluginName, "StartSeat", function (args) {
    if ($gamePlayer) {
      $gamePlayer.setSeat(true);
      debug("Seat mode activated - player can only turn, sleep recovery active");
    }
  });

  PluginManager.registerCommand(pluginName, "StopSeat", function (args) {
    if ($gamePlayer) {
      $gamePlayer.setSeat(false);
      debug("Seat mode deactivated - normal movement restored");
    }
  });

  PluginManager.registerCommand(pluginName, "Vomit", function (args) {
    const actorId = Number(args.actorId || 1);
    const actor = $gameActors.actor(actorId);

    if (actor) {
      const currentHunger = actor.hunger();

      // Lose 40% of the maximum hunger, never dropping below empty
      actor._hunger = Math.max(0, currentHunger - maxHunger * 0.4);
      debug(`Actor ${actorId} vomited. Hunger ${currentHunger} -> ${actor._hunger}/${maxHunger} (-40%)`);

      // Check for state changes and update overeating state
      actor.updateOvereatState();

      // Refresh menu if open
      if (SceneManager._scene instanceof Scene_Menu && SceneManager._scene._hungerSleepStatusWindow) {
        SceneManager._scene._hungerSleepStatusWindow.refresh();
      }

      // Add notification
      const lang = getCurrentLanguage();
      const message = lang === 'it'
        ? T("TimeDate.needs.vomited", { name: actor.name() })
        : T("TimeDate.needs.vomited", { name: actor.name() });
      $gameTemp.addHungerSleepNotification(message);
    } else {
      debug(`Actor ${actorId} not found.`);
    }
  });

  PluginManager.registerCommand(pluginName, "PassTime", function (args) {
    const hours = Number(args.hours || 0);
    const minutes = Number(args.minutes || 0);
    const totalMinutes = (hours * 60) + minutes;

    if (totalMinutes > 0) {
      const newTime = advanceGameTimeSimulated(totalMinutes);
      debug(`Passed ${hours}h ${minutes}m. New time: ${getDateTimeFromMinutes(newTime).fullDate}`);
    }
  });

  PluginManager.registerCommand(pluginName, "SimulateTime", function (args) {
    const years   = Number(args.years   || 0);
    const days    = Number(args.days    || 0);
    const hours   = Number(args.hours   || 0);
    const minutes = Number(args.minutes || 0);
    const seconds = Number(args.seconds || 0);

    const totalMinutes = Math.max(0, Math.round(
      (years * 365 * 24 * 60) + (days * 24 * 60) + (hours * 60) + minutes + (seconds / 60)
    ));
    if (totalMinutes <= 0) return;

    // Drain player hunger and sleep as if this many minutes of regular-map
    // walking passed (1 min = 10 steps at the configured decrease rate).
    // Mirror the walk-drain multipliers (temperature stress + overeating) so
    // time-skips and walking stay consistent.
    const leader = $gameParty?.leader();
    if (leader) {
      let hungerMultiplier = 1;
      if (leader.hunger() > maxHunger) {
        hungerMultiplier *= overeatDepletionMultiplier;
      }
      hungerMultiplier *= temperatureHungerMultiplier($gameVariables.value(temperatureVariable));
      leader.reduceHunger(hungerDecreaseRate * 10 * totalMinutes * hungerMultiplier);
      leader.reduceSleep(sleepDecreaseRate   * 10 * totalMinutes);
    }

    // Simulated time is still time an addict spends without their substance.
    if (window.AddictionSystem) window.AddictionSystem.advanceMinutes(totalMinutes);

    const newTime = advanceGameTimeSimulated(totalMinutes);
    debug(`SimulateTime: advanced ${totalMinutes} min. New time: ${getDateTimeFromMinutes(newTime).fullDate}`);
  });

  PluginManager.registerCommand(pluginName, "FullRestore", function (args) {
    for (const actor of $gameParty.members()) {
      actor._hunger = maxHunger;
      actor._sleep = maxSleep;
      actor.updateOvereatState();
      debug(`FullRestore: ${actor.name()} hunger=${maxHunger}, sleep=${maxSleep}`);
    }

    if (SceneManager._scene instanceof Scene_Menu && SceneManager._scene._hungerSleepStatusWindow) {
      SceneManager._scene._hungerSleepStatusWindow.refresh();
    }
  });

  // Add or subtract from a single need for every party member. Amount may be
  // negative; the resulting value is clamped to [0, need max] (100 by default).
  PluginManager.registerCommand(pluginName, "AdjustNeed", function (args) {
    const need = String(args.need || "").toLowerCase();
    const amount = Number(args.amount || 0);
    const specs = {
      hunger:  { get: (a) => a._hunger,   set: (a, v) => { a._hunger  = v; }, max: maxHunger },
      sleep:   { get: (a) => a._sleep,    set: (a, v) => { a._sleep   = v; }, max: maxSleep  },
      // Hygiene / Social / Fun go through setExtendedNeed so a companion's
      // meter is written where it actually lives (their society profile).
      hygiene: { get: (a) => a.hygiene(), set: (a, v) => a.setExtendedNeed("hygiene", v), max: maxNeed },
      social:  { get: (a) => a.social(),  set: (a, v) => a.setExtendedNeed("social",  v), max: maxNeed },
      leisure: { get: (a) => a.leisure(), set: (a, v) => a.setExtendedNeed("leisure", v), max: maxNeed },
    };
    const spec = specs[need];
    if (!spec) {
      debug(`AdjustNeed: unknown need "${args.need}"`);
      return;
    }

    for (const actor of $gameParty.members()) {
      const oldHungerState = actor.hungerState();
      const oldSleepState = actor.sleepState();
      const newValue = Math.max(0, Math.min(spec.max, spec.get(actor) + amount));
      spec.set(actor, newValue);

      if (need === "hunger") {
        actor.checkStateChange("hunger", oldHungerState);
        actor.updateOvereatState();
      } else if (need === "sleep") {
        actor.checkStateChange("sleep", oldSleepState);
      }
      debug(`AdjustNeed: ${actor.name()} ${need} -> ${newValue.toFixed(1)}/${spec.max}`);
    }

    if (SceneManager._scene instanceof Scene_Menu && SceneManager._scene._hungerSleepStatusWindow) {
      SceneManager._scene._hungerSleepStatusWindow.refresh();
    }
  });

  PluginManager.registerCommand(pluginName, "SleepMenu", function (args) {
    if (SceneManager._scene instanceof Scene_Map) {
      SceneManager._scene.openSleepMenu();
    }
  });

  PluginManager.registerCommand(pluginName, "CryogenicSleep", function (args) {
    if (SceneManager._scene instanceof Scene_Map) {
      SceneManager._scene.openCryogenicSleepMenu();
    }
  });

  //=============================================================================
  // Game_Actor Extensions
  //=============================================================================

  // Shared global hunger and sleep getters/setters on prototype
  Object.defineProperty(Game_Actor.prototype, "_hunger", {
    get: function () {
      if ($gameSystem) {
        if ($gameSystem._globalHunger === undefined) {
          $gameSystem._globalHunger = typeof maxHunger !== "undefined" ? maxHunger : 100;
        }
        return $gameSystem._globalHunger;
      }
      return this.__localHunger !== undefined ? this.__localHunger : (typeof maxHunger !== "undefined" ? maxHunger : 100);
    },
    set: function (value) {
      if ($gameSystem) {
        $gameSystem._globalHunger = value;
      } else {
        this.__localHunger = value;
      }
    },
    configurable: true
  });

  Object.defineProperty(Game_Actor.prototype, "_sleep", {
    get: function () {
      if ($gameSystem) {
        if ($gameSystem._globalSleep === undefined) {
          $gameSystem._globalSleep = typeof maxSleep !== "undefined" ? maxSleep : 100;
        }
        return $gameSystem._globalSleep;
      }
      return this.__localSleep !== undefined ? this.__localSleep : (typeof maxSleep !== "undefined" ? maxSleep : 100);
    },
    set: function (value) {
      if ($gameSystem) {
        $gameSystem._globalSleep = value;
      } else {
        this.__localSleep = value;
      }
    },
    configurable: true
  });

  const _Game_Actor_initialize = Game_Actor.prototype.initialize;
  Game_Actor.prototype.initialize = function (actorId) {
    _Game_Actor_initialize.call(this, actorId);
    if ($gameSystem) {
      if ($gameSystem._globalHunger === undefined) {
        this._hunger = maxHunger;
      }
      if ($gameSystem._globalSleep === undefined) {
        this._sleep = maxSleep;
      }
    } else {
      this._hunger = maxHunger;
      this._sleep = maxSleep;
    }
    if (this._hygiene === undefined) this._hygiene = maxNeed;
    if (this._social  === undefined) this._social  = maxNeed;
    if (this._leisure === undefined) this._leisure = maxNeed;
    this._prevHungerState = "normal";
    this._prevSleepState = "normal";
  };

  // Hunger Methods
  Game_Actor.prototype.hunger = function () {
    return this._hunger;
  };

  Game_Actor.prototype.hungerRate = function () {
    return this._hunger / maxHunger;
  };

  Game_Actor.prototype.hungerPercent = function () {
    return Math.floor(this.hungerRate() * 100);
  };

  Game_Actor.prototype.hungerState = function () {
    if (this.hungerRate() <= 0) return "starving";
    if (this.hungerRate() < 0.2) return "hungry";
    return "normal";
  };

  Game_Actor.prototype.addHunger = function (amount) {
    const wasAtZero = this._hunger <= 0;
    const oldState = this.hungerState();

    // Add the food and let a single meal carry its surplus into the overeating
    // range (clamped to the overeat ceiling) instead of hard-capping at 100% and
    // wasting it. This removes the awkward two-meals-at-exactly-100% requirement.
    const newHunger = this._hunger + amount;
    this._hunger = Math.min(overeatMaxHunger, newHunger);
    if (newHunger > maxHunger) {
      debug(`Actor ${this._actorId} overeating: hunger ${this._hunger.toFixed(2)}/${maxHunger} (raw ${newHunger.toFixed(2)})`);
    }

    debug(
      `Actor ${this._actorId} hunger updated to ${this._hunger
      }/${maxHunger} (${this.hungerPercent()}%)`
    );

    // If hunger was at 0 and is now above 0, restore HP to max
    if (wasAtZero && this._hunger > 0) {
      const hpDifference = this.mhp - this.hp;
      if (hpDifference > 0) {
        this.setHp(this.mhp);
        debug(`Actor ${this._actorId} HP fully restored to ${this.mhp}`);
        // HP-restored popup intentionally not shown on the map (#173)
      }
    }

    // Check for state changes
    this.checkStateChange("hunger", oldState);
    this.updateOvereatState(); // Check for overeating state
  };

  Game_Actor.prototype.reduceHunger = function (amount) {
    const oldState = this.hungerState();

    // Update hunger value
    this._hunger = Math.max(0, this._hunger - amount);

    // Check for state changes and apply effects
    this.checkStateChange("hunger", oldState);
    this.updateOvereatState(); // Check for overeating state
  };

  // Sleep Methods
  Game_Actor.prototype.sleep = function () {
    return this._sleep;
  };

  Game_Actor.prototype.sleepRate = function () {
    return this._sleep / maxSleep;
  };

  Game_Actor.prototype.sleepPercent = function () {
    return Math.floor(this.sleepRate() * 100);
  };

  Game_Actor.prototype.sleepState = function () {
    if (this.sleepRate() <= 0) return "exhausted";
    if (this.sleepRate() < 0.2) return "sleepy";
    return "normal";
  };

  Game_Actor.prototype.addSleep = function (amount) {
    const wasAtZero = this._sleep <= 0;
    const oldState = this.sleepState();

    // Update sleep value
    this._sleep = Math.min(maxSleep, this._sleep + amount);
    debug(
      `Actor ${this._actorId} sleep updated to ${this._sleep
      }/${maxSleep} (${this.sleepPercent()}%)`
    );

    // If sleep was at 0 and is now above 0, restore MP to max
    if (wasAtZero && this._sleep > 0) {
      const mpDifference = this.mmp - this.mp;
      if (mpDifference > 0) {
        this.setMp(this.mmp);
        debug(`Actor ${this._actorId} MP fully restored to ${this.mmp}`);
        $gameTemp.addHungerSleepNotification(
          `${this.name()} ${getText("mpRestored")}`
        );
      }
    }

    // Check for state changes
    this.checkStateChange("sleep", oldState);
  };

  Game_Actor.prototype.reduceSleep = function (amount) {
    const oldState = this.sleepState();

    // Update sleep value
    this._sleep = Math.max(0, this._sleep - amount);

    // Check for state changes and apply effects
    this.checkStateChange("sleep", oldState);
  };

  // Extended needs (Hygiene / Social / Leisure) - mirror the NPC society meters
  // so the whole party shares one needs vocabulary. Stored 0-100.
  //
  // Where the value lives depends on who the member is. The player (Actor 1)
  // keeps the three meters on the actor; a recruited companion keeps them on
  // their NPC society profile, which is the copy the society simulation drains
  // and every panel reads for party slots 2/3. The accessors below resolve that
  // for the caller, so anything writing through them (plugin commands, item
  // NeedRestore tags, bathing, minigames) moves the meter the UI is showing
  // instead of an actor field nobody reads.
  function extendedNeedProfile(actor) {
    if (!actor || !actor.actorId || actor.actorId() === 1) return null;
    return window.NPCSocietyRegistry?.getProfile?.(actor.name()) || null;
  }

  Game_Actor.prototype.extendedNeed = function (key) {
    const profile = extendedNeedProfile(this);
    if (profile && typeof profile[key] === "number") return profile[key];
    const field = "_" + key;
    if (this[field] === undefined) this[field] = maxNeed;
    return this[field];
  };

  Game_Actor.prototype.setExtendedNeed = function (key, value) {
    const clamped = Math.max(0, Math.min(maxNeed, value));
    const profile = extendedNeedProfile(this);
    if (profile && typeof profile[key] === "number") {
      profile[key] = clamped;
      return;
    }
    this["_" + key] = clamped;
  };

  Game_Actor.prototype.hygiene = function () {
    return this.extendedNeed("hygiene");
  };
  Game_Actor.prototype.hygienePercent = function () {
    return Math.floor((this.hygiene() / maxNeed) * 100);
  };
  Game_Actor.prototype.addHygiene = function (amount) {
    this.setExtendedNeed("hygiene", this.hygiene() + amount);
  };
  Game_Actor.prototype.reduceHygiene = function (amount) {
    this.setExtendedNeed("hygiene", this.hygiene() - amount);
  };

  Game_Actor.prototype.social = function () {
    return this.extendedNeed("social");
  };
  Game_Actor.prototype.socialPercent = function () {
    return Math.floor((this.social() / maxNeed) * 100);
  };
  Game_Actor.prototype.addSocial = function (amount) {
    this.setExtendedNeed("social", this.social() + amount);
  };
  Game_Actor.prototype.reduceSocial = function (amount) {
    this.setExtendedNeed("social", this.social() - amount);
  };

  Game_Actor.prototype.leisure = function () {
    return this.extendedNeed("leisure");
  };
  Game_Actor.prototype.leisurePercent = function () {
    return Math.floor((this.leisure() / maxNeed) * 100);
  };
  Game_Actor.prototype.addLeisure = function (amount) {
    this.setExtendedNeed("leisure", this.leisure() + amount);
  };
  Game_Actor.prototype.reduceLeisure = function (amount) {
    this.setExtendedNeed("leisure", this.leisure() - amount);
  };

  // New method for handling overeating state
  Game_Actor.prototype.updateOvereatState = function () {
    const overeatThreshold = maxHunger * 3.0; // 300%
    const normalThreshold = maxHunger; // 100%

    const isOvereating = this.isStateAffected(overeatStateId);

    if (this._hunger > overeatThreshold) {
      if (!isOvereating) {
        this.addState(overeatStateId);
        debug(`Actor ${this._actorId} is overeating. Applied state ${overeatStateId}.`);
      }
    } else if (this._hunger < normalThreshold) {
      if (isOvereating) {
        this.removeState(overeatStateId);
        debug(`Actor ${this._actorId} is no longer overeating. Removed state ${overeatStateId}.`);
      }
    }
  };

  // State Changes and Effects
  Game_Actor.prototype.checkStateChange = function (type, oldState) {
    let currentState;
    let prevState;

    if (type === "hunger") {
      currentState = this.hungerState();
      prevState = this._prevHungerState;
      this._prevHungerState = currentState;
    } else {
      currentState = this.sleepState();
      prevState = this._prevSleepState;
      this._prevSleepState = currentState;
    }

    // Only show message if state has changed
    if (currentState !== oldState) {
      let message = "";

      if (type === "hunger") {
        if (currentState === "hungry") {
          message = `${this.name()} ${getText("hungry")}`;
        } else if (currentState === "starving") {
          message = `${this.name()} ${getText("starving")}`;
        }
        // "no longer hungry" feedback is intentionally not shown on the map (#173)
      } else {
        if (currentState === "sleepy") {
          message = `${this.name()} ${getText("sleepy")}`;
        } else if (currentState === "exhausted") {
          message = `${this.name()} ${getText("exhausted")}`;
        }
        // "no longer sleepy" feedback is intentionally not shown on the map (#173)
      }

      if (message) {
        // Send notification
        $gameTemp.addHungerSleepNotification(message);
      }

      // Apply debuffs based on new state (placeholder implementation)
      if (type === "hunger") {
        this.applyHungerDebuffs(currentState);
      } else {
        this.applySleepDebuffs(currentState);
      }
    }
  };

  //=============================================================================
  // What an empty meter costs
  //=============================================================================
  // ATK..LUK are on the 1-20 ability scale in this game (a class curve puts
  // them at 8-16 on level 1 and 10-20 at level 99), so these are single digits,
  // read the same way Health_DiseaseSystem reads its own table.
  //
  // Hunger takes the body: the swing goes out of an arm and the legs go slow.
  // Sleep takes the head: aim and concentration first, then the reflexes and
  // whatever luck is. The two stack, because being starved and unslept at once
  // is meant to be the state you dig yourself out of rather than travel in.
  //
  // Read off the live meter rather than accumulated onto the actor, so a save
  // loaded mid-famine is as weak as the meter says and a meal lifts it at once.
  const NEED_DEBUFFS = {
    hunger: {
      hungry:   { atk: -1, agi: -1 },
      starving: { atk: -3, agi: -3, def: -2, mat: -1, mdf: -1 },
    },
    sleep: {
      sleepy:    { mat: -1, agi: -1 },
      exhausted: { mat: -3, agi: -3, luk: -2, atk: -1 },
    },
  };
  // A body that has gone without runs on less of itself, and a starved one on
  // much less. This is the one place a need reaches the pools.
  const NEED_HP_SHARE = { hungry: 0, starving: 0.25, sleepy: 0, exhausted: 0.1 };
  // The same discipline the disease clamp uses: no need may take more than this
  // share of the ability a character was born with. An illness carries its own
  // ceiling, and paramMin (see Health_DiseaseSystem) is the floor under both.
  const MAX_NEED_DRAIN = 0.35;

  const NEED_PARAM_KEYS = ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'];

  // The whole cost of both meters on one param, clamped. Public so the status
  // screen and the tests can ask the same question the battle does.
  Game_Actor.prototype.needParamDelta = function (paramId) {
    const key = NEED_PARAM_KEYS[paramId];
    if (!key) return 0;
    const base = typeof this.paramBase === 'function' ? this.paramBase(paramId) : 0;
    let sum = 0;
    const states = { hunger: this.hungerState(), sleep: this.sleepState() };
    for (const meter of ['hunger', 'sleep']) {
      const state = states[meter];
      if (!state || state === 'normal') continue;
      if (key === 'mhp') {
        sum -= Math.floor(base * (NEED_HP_SHARE[state] || 0));
        continue;
      }
      const table = NEED_DEBUFFS[meter][state];
      if (table && table[key]) sum += table[key];
    }
    if (!(sum < 0) || !(base > 0)) return sum;
    return Math.max(sum, -Math.floor(base * MAX_NEED_DRAIN));
  };

  const _Game_Actor_paramPlus_TDS = Game_Actor.prototype.paramPlus;
  Game_Actor.prototype.paramPlus = function (paramId) {
    let v = _Game_Actor_paramPlus_TDS.call(this, paramId);
    // Before the meters exist (character creation, a bare actor in a tool) there
    // is nothing to be hungry with.
    if (this._hunger !== undefined || this._sleep !== undefined) {
      try { v += this.needParamDelta(paramId); } catch (e) { /* a stat is not worth a crash */ }
    }
    return v;
  };

  // The transition itself: the meter is what carries the penalty, so all these
  // have to do is make the sheet redraw with the new numbers on it.
  Game_Actor.prototype.applyHungerDebuffs = function (state) {
    debug(`Hunger debuffs now at: ${state}`);
    this.refresh();
  };

  Game_Actor.prototype.applySleepDebuffs = function (state) {
    debug(`Sleep debuffs now at: ${state}`);
    this.refresh();
  };

  //=============================================================================
  // Game_Party Extensions
  //=============================================================================

  // Low-need warnings for the extended needs (Hygiene / Social / Fun) for
  // every party member. The leader reads its actor meters, recruited NPC
  // members read their society profile (via PartyNeeds.getMemberNeeds).
  // Notifies only on the transition into a low/critical band, mirroring the
  // hungry/starving pattern used by checkStateChange.
  const EXT_NEED_TEXT = {
    hygiene: { low: "hygieneLow", critical: "hygieneCritical" },
    social:  { low: "socialLow",  critical: "socialCritical"  },
    leisure: { low: "leisureLow", critical: "leisureCritical" },
  };

  function checkExtendedNeeds(actor) {
    if (!window.PartyNeeds) return;
    const needs = window.PartyNeeds.getMemberNeeds(actor);
    if (!actor._prevExtNeedStates) actor._prevExtNeedStates = {};

    for (const key of Object.keys(EXT_NEED_TEXT)) {
      const pct = needs[key];
      if (pct === null || pct === undefined) continue;
      const state = pct <= 0 ? "critical" : pct < 20 ? "low" : "normal";
      const prev = actor._prevExtNeedStates[key] || "normal";
      if (state !== prev) {
        actor._prevExtNeedStates[key] = state;
        if (state !== "normal") {
          const message = `${actor.name()} ${getText(EXT_NEED_TEXT[key][state])}`;
          $gameTemp.addHungerSleepNotification(
            message,
            state === "critical" ? "danger" : "warning"
          );
        }
      }
    }
  }

  // Update hunger and sleep values when the player moves
  const _Game_Party_onPlayerWalk = Game_Party.prototype.onPlayerWalk;
  Game_Party.prototype.onPlayerWalk = function () {
    _Game_Party_onPlayerWalk.call(this);
    this.updateHungerAndSleep();
  };

  Game_Party.prototype.updateHungerAndSleep = function () {
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    const isInRestZone = NO_DEPLETION_MAPS.includes(mapId);
    if (isInRestZone) {
      return; // Skip hunger and sleep updates in these maps
    }

    // Check if Shift key is pressed for speed boost
    const isShiftPressed = Input.isPressed("shift");
    const baseMultiplier = isShiftPressed ? shiftMultiplier : 1.0;

    // Check if on map 315 (world map) for special time/depletion rules
    const isOnWorldMap = $gameMap && $gameMap.mapId() === 315;

    const hungerRate = isOnWorldMap ? (maxHunger * 0.003) : hungerDecreaseRate;
    const sleepRate = isOnWorldMap ? (maxSleep * 0.006) : sleepDecreaseRate;

    // Update game time based on map
    const currentTime = getGameTimeMinutes();
    if (isOnWorldMap) {
      // On world map, time passes quickly with each step. Vehicles cross a tile
      // in less game-time than walking, and the Aero Streamlining workshop
      // upgrade (VehicleSystemRepair.js) reduces that per-tile cost further.
      const isInVehicle = $gamePlayer && ($gamePlayer.isInBoat() || $gamePlayer.isInShip() || $gamePlayer.isInAirship());
      let minutesToAdd = 10; // walking
      if (isInVehicle) {
        minutesToAdd = 2; // base vehicle cost per tile
        if (window.VehicleUpgrades) {
          const vType = window.VehicleUpgrades.currentRiddenType();
          if (vType) minutesToAdd = window.VehicleUpgrades.worldTileMinutes(vType);
        }
        // Ground vehicles cross a road tile in less game-time (Airship/Boat excluded).
        if (window.MergedVehicleSystem && window.MergedVehicleSystem.getWorldRoadTimeFactor) {
          minutesToAdd *= window.MergedVehicleSystem.getWorldRoadTimeFactor();
        }
      }
      setGameTimeMinutes(currentTime + minutesToAdd);
    } else {
      // On all other maps, time advances by 1 minute every 10 steps.
      if ($gameParty.steps() % 10 === 0) {
        setGameTimeMinutes(currentTime + 1);
      }
    }
    updateGameDateVariable();

    // Reduce global hunger and sleep values once (using the leader actor)
    const leader = $gameParty.leader();
    if (leader) {
      let hungerMultiplier = baseMultiplier;
      if (leader.hunger() > maxHunger) {
        hungerMultiplier *= overeatDepletionMultiplier;
      }
      // Temperature stresses the body: cold burns extra calories to stay warm,
      // heat raises metabolism too. Both ends speed up hunger drain.
      hungerMultiplier *= temperatureHungerMultiplier($gameVariables.value(temperatureVariable));

      // An installed augment can slow a need, stop it dead or turn it around:
      // a ruminant stomach burns less, a somnologic regulator never gets tired,
      // a self-cleaning dermis actually gains hygiene as it walks. The figure
      // is a multiplier on the drain, so 1 is a body with nothing fitted.
      leader.reduceHunger(hungerRate * hungerMultiplier * needAugmentRate(leader, "hunger"));
      leader.reduceSleep(sleepRate * baseMultiplier * needAugmentRate(leader, "sleep"));

      // Extended needs drain alongside sleep, at the NPC-meter ratios
      // (hygiene 0.05, social 0.03, leisure 0.03 per minute vs sleep 0.06).
      leader.reduceHygiene(sleepRate * 0.83 * baseMultiplier * needAugmentRate(leader, "hygiene"));
      leader.reduceSocial(sleepRate * 0.5 * baseMultiplier * needAugmentRate(leader, "social"));
      leader.reduceLeisure(sleepRate * 0.5 * baseMultiplier * needAugmentRate(leader, "leisure"));
    }

    // An Entertainer travelling with the party is a show that never stops:
    // every member's Fun climbs while they are on the strength, and a second
    // entertainer is a second act (BattleSystemPassiveSkills.leisureGainRate,
    // the one answer to how big the show is). It is given to everybody, not
    // only the leader, because everybody is watching it.
    const showRate = (window.BattleSystemPassiveSkills &&
      window.BattleSystemPassiveSkills.leisureGainRate)
      ? window.BattleSystemPassiveSkills.leisureGainRate() : 0;
    if (showRate > 0) {
      for (const member of $gameParty.members()) {
        if (member) member.addLeisure(sleepRate * 0.5 * showRate);
      }
    }

    // Apply legacy mechanics (debuffs, HP/MP drain, etc.) to all party members
    for (const actor of $gameParty.members()) {
      if (!actor) continue;

      // Update states and check for notifications/changes (excluding leader which is updated in reduceHunger/reduceSleep)
      if (actor !== leader) {
        actor.updateOvereatState();
        actor.checkStateChange("hunger", actor._prevHungerState);
        actor.checkStateChange("sleep", actor._prevSleepState);
      }

      // Low warnings for Hygiene / Social / Fun, every member incl. leader
      checkExtendedNeeds(actor);

      // A mind kept awake too long starts letting go of things.
      if (actor === leader && window.Insomnia) window.Insomnia.tick();

      // Cravings are personal: they answer to the traits of the member who
      // carries them, so they climb per member rather than on the leader.
      if (window.AddictionSystem) {
        window.AddictionSystem.stepActor(actor, sleepRate, baseMultiplier);
      }

      // Drain HP if hunger is at 0
      if (actor.hunger() <= 0 && actor.hp > 0) {
        const hpDrain = Math.ceil(actor.mhp * 0.01); // 1% of max HP per step
        const newHp = Math.max(0, actor.hp - hpDrain);
        actor.setHp(newHp);

        debug(`Actor ${actor._actorId} HP drained: ${hpDrain} (${actor.hp}/${actor.mhp})`);

        // Show notification when HP reaches 0
        if (actor.hp === 0) {
          const message = T("TimeDate.needs.collapsed", { name: actor.name() });
          $gameTemp.addHungerSleepNotification(message);
        }
      }

      // Drain MP if sleep is at 0
      if (actor.sleep() <= 0 && actor.mp > 0) {
        const mpDrain = Math.ceil(actor.mmp * 0.01); // 1% of max MP per step
        const newMp = Math.max(0, actor.mp - mpDrain);
        actor.setMp(newMp);

        debug(`Actor ${actor._actorId} MP drained: ${mpDrain} (${actor.mp}/${actor.mmp})`);

        // Show notification when MP reaches 0
        if (actor.mp === 0) {
          const lang = getCurrentLanguage();
          const message = T("TimeDate.needs.outOfMp", { name: actor.name() });
          $gameTemp.addHungerSleepNotification(message);
        }
      }
    }
  };

  //=============================================================================
  // Game_Player Extensions - Seat System
  //=============================================================================

  const _Game_Player_initialize = Game_Player.prototype.initialize;
  Game_Player.prototype.initialize = function () {
    _Game_Player_initialize.call(this);
    this._isSeat = false;
    this._seatFrameCounter = 0;
  };

  Game_Player.prototype.setSeat = function (seated) {
    this._isSeat = seated;
    this._seatFrameCounter = 0;
    debug(`Seat state changed to: ${seated}`);
  };

  Game_Player.prototype.isSeat = function () {
    return this._isSeat;
  };

  // Override movement methods to prevent tile movement while allowing direction changes
  const _Game_Player_moveStraight = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function (d) {
    if (this._isSeat) {
      // Allow direction change but prevent actual movement
      this.setDirection(d);
      return;
    }
    return _Game_Player_moveStraight.call(this, d);
  };

  const _Game_Player_moveDiagonally = Game_Player.prototype.moveDiagonally;
  Game_Player.prototype.moveDiagonally = function (horz, vert) {
    if (this._isSeat) {
      // Allow direction change but prevent actual movement
      // Determine direction from horizontal and vertical inputs
      if (horz !== 0 || vert !== 0) {
        const d = this.getDiagonalDirection(horz, vert);
        if (d > 0) {
          this.setDirection(d);
        }
      }
      return;
    }
    return _Game_Player_moveDiagonally.call(this, horz, vert);
  };

  // Override update to handle seat sleep recovery
  const _Game_Player_update = Game_Player.prototype.update;
  Game_Player.prototype.update = function (sceneActive) {
    _Game_Player_update.call(this, sceneActive);

    // Handle seat sleep recovery (0.5% per second = 0.5% per 60 frames)
    if (this._isSeat) {
      this._seatFrameCounter++;
      if (this._seatFrameCounter >= 60) {
        this._seatFrameCounter = 0;
        // Recover 0.5% of sleep for actor 1 only
        const sleepRecovery = maxSleep * 0.005; // 0.5% of max sleep
        const actor = $gameActors.actor(1);
        if (actor) {
          actor.addSleep(sleepRecovery);
          debug(`Sleep recovery applied: ${sleepRecovery.toFixed(2)} for actor 1`);
        }
      }
    }
  };
  //=============================================================================
  // Time and Temperature Window
  //=============================================================================

  function Window_TimeTemperature() {
    this.initialize(...arguments);
  }

  Window_TimeTemperature.prototype = Object.create(Window_Base.prototype);
  Window_TimeTemperature.prototype.constructor = Window_TimeTemperature;

  Window_TimeTemperature.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
    this._refreshTimer = 0;
  };

  Window_TimeTemperature.prototype.update = function () {
    Window_Base.prototype.update.call(this);

    // Refresh every second (60 frames)
    this._refreshTimer++;
    if (this._refreshTimer >= 60) {
      this._refreshTimer = 0;
      this.refresh();
    }
  };

  Window_TimeTemperature.prototype.refresh = function () {
    if (!this.contents) return;

    // Skip the clear + redraw when the displayed values are identical to the
    // last draw (the full cycle only ticks once a minute at most).
    const gameMinutes = getGameTimeMinutes();
    const dateTime = getDateTimeFromMinutes(gameMinutes);
    const weatherName = (window.WeatherNames && window.weatherName)
      ? window.WeatherNames.label(window.weatherName)
      : T("TimeDate.hud.weatherClear");
    const temperature = $gameVariables.value(temperatureVariable) || 20;
    const sig = dateTime.time24 + '|' + weatherName + '|' + temperature;
    if (sig === this._lastDrawSig) return;
    this._lastDrawSig = sig;

    this.contents.clear();
    this.drawTimeAndTemperature();
  };

  Window_TimeTemperature.prototype.drawTimeAndTemperature = function () {
    const y = 0;

    // Get time and date - check if a daylight mode is forced
    let timeString;
    let dateString = "01/01/01";

    // Full cycle mode - show game time (from system clock)
    const gameMinutes = getGameTimeMinutes();
    const dateTime = getDateTimeFromMinutes(gameMinutes);
    timeString = dateTime.time24;
    dateString = dateTime.dateShort;

    // Get temperature from variable
    const weatherName = (window.WeatherNames && window.weatherName)
      ? window.WeatherNames.label(window.weatherName)
      : T("TimeDate.hud.weatherClear");
    const temperature = $gameVariables.value(temperatureVariable) || 20;
    const tempString = `${weatherName} ${temperature}°C`;

    // Draw date and time with icon (left side)
    this.resetTextColor();
    this.drawText(`${timeString}`, 36, y, 120);

    // Draw temperature with icon (right side) - increased spacing
    const tempX = 120;

    // Color code temperature
    let tempColor = 0; // White by default
    if (temperature <= 0) {
      tempColor = 4; // Blue for freezing
    } else if (temperature < 10) {
      tempColor = 4; // Blue for cold
    } else if (temperature >= 35) {
      tempColor = 2; // Red for very hot
    } else if (temperature >= 25) {
      tempColor = 14; // Yellow for warm
    }

    this.changeTextColor(ColorManager.textColor(tempColor));
    this.drawText(tempString, tempX + 36, y, 100);
  };

  //=============================================================================
  // Main Menu Display - Add hunger and sleep status
  //=============================================================================

  // Create a new window for hunger and sleep status
  function Window_HungerSleepStatus() {
    this.initialize(...arguments);
  }

  Window_HungerSleepStatus.prototype = Object.create(Window_Base.prototype);
  Window_HungerSleepStatus.prototype.constructor = Window_HungerSleepStatus;

  Window_HungerSleepStatus.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
  };

  Window_HungerSleepStatus.prototype.refresh = function () {
    if (!this.contents) return;

    this.contents.clear();
    this.drawHungerSleepStatus();
  };

  Window_HungerSleepStatus.prototype.drawHungerSleepStatus = function () {
    const lineHeight = this.lineHeight();
    let y = 0;

    // ONLY show actor 1
    const actor = $gameActors.actor(1);
    if (!actor) return;

    // Column positions - spread across full window width
    const totalWidth = this.contents.width;
    const nameWidth = 100;
    const hpWidth = 80;
    const mpWidth = 80;
    const statusWidth = 120;
    const hungerWidth = 80; // Increased to accommodate icon + text
    const sleepWidth = 80; // Increased to accommodate icon + text

    // Calculate remaining space and distribute it
    const usedWidth =
      nameWidth + hpWidth + mpWidth + statusWidth + hungerWidth + sleepWidth;
    const remainingWidth = totalWidth - usedWidth;
    const padding = Math.max(10, remainingWidth / 6); // Distribute remaining space as padding

    const hpX = nameWidth + padding;
    const mpX = hpX + hpWidth + padding;
    const statusX = mpX + mpWidth + padding;
    const hungerX = statusX + statusWidth + padding;
    const sleepX = hungerX + hungerWidth + padding;

    const x = 0;

    // Draw actor name
    this.resetTextColor();
    this.drawText(actor.name(), x, y, nameWidth);

    // Draw HP with color coding (current number only) - translated label
    const hpPercent = Math.floor((actor.hp / actor.mhp) * 100);
    let hpColor = hpPercent <= 25 ? 2 : hpPercent < 50 ? 14 : 3;
    this.changeTextColor(ColorManager.textColor(hpColor));
    this.drawText(`${getText("hp")}:${actor.hp}`, hpX, y, hpWidth);

    // Draw MP with color coding (current number only) - translated label
    const mpPercent = Math.floor((actor.mp / actor.mmp) * 100);
    let mpColor = mpPercent <= 25 ? 2 : mpPercent < 50 ? 14 : 4;
    this.changeTextColor(ColorManager.textColor(mpColor));
    this.drawText(`${getText("mp")}:${actor.mp}`, mpX, y, mpWidth);

    // Get first status effect
    const firstState = actor.states().length > 0 ? actor.states()[0] : null;
    const statusText = firstState ? firstState.name : "";
    this.resetTextColor();
    if (firstState && firstState.iconIndex > 0) {
      // Draw status icon if available
      this.drawIcon(firstState.iconIndex, statusX, y);
      this.drawText(
        statusText.substring(0, 10),
        statusX + 32,
        y,
        statusWidth - 32
      );
    } else {
      this.drawText(statusText.substring(0, 12), statusX, y, statusWidth);
    }

    // Draw hunger with icon and color coding
    const hungerPercent = actor.hungerPercent();
    let hungerColor = hungerPercent > 100 ? 21 : (hungerPercent <= 0 ? 2 : hungerPercent < 20 ? 14 : 3); // Magenta for > 100
    this.changeTextColor(ColorManager.textColor(hungerColor));
    this.drawIcon(hungerIcon, hungerX, y);
    this.drawText(`${hungerPercent}%`, hungerX + 32, y, hungerWidth - 32);

    // Draw sleep with icon and color coding
    const sleepPercent = actor.sleepPercent();
    let sleepColor = sleepPercent <= 0 ? 2 : sleepPercent < 20 ? 14 : 4;
    this.changeTextColor(ColorManager.textColor(sleepColor));
    this.drawIcon(sleepIcon, sleepX, y);
    this.drawText(`${sleepPercent}%`, sleepX + 32, y, sleepWidth - 32);
  };

  // Add the hunger/sleep window to the menu scene
  const _Scene_Menu_create = Scene_Menu.prototype.create;
  Scene_Menu.prototype.create = function () {
    _Scene_Menu_create.call(this);
    this.createHungerSleepStatusWindow();
    this.createTimeTemperatureWindow();
    this.createBountyWindow(); // NEW LINE
  };
  // Add new method to Scene_Menu
  Scene_Menu.prototype.createBountyWindow = function () {
    const rect = this.bountyWindowRect();
    this._bountyWindow = new Window_Bounty(rect);
    this.addWindow(this._bountyWindow);
  };

  // Add new method to Scene_Menu
  Scene_Menu.prototype.bountyWindowRect = function () {
    const goldRect = this.goldWindowRect();
    const timeRect = this.timeTemperatureWindowRect();
    const ww = timeRect.x; // Extend to just before time window with small gap
    const wh = goldRect.height; // Match gold window height exactly
    const wx = 0; // Bottom left corner
    const wy = goldRect.y; // Same Y position as gold window
    return new Rectangle(wx, wy, ww, wh);
  };
  Scene_Menu.prototype.createHungerSleepStatusWindow = function () {
    const rect = this.hungerSleepStatusWindowRect();
    this._hungerSleepStatusWindow = new Window_HungerSleepStatus(rect);
    this.addWindow(this._hungerSleepStatusWindow);
  };

  Scene_Menu.prototype.createTimeTemperatureWindow = function () {
    const rect = this.timeTemperatureWindowRect();
    this._timeTemperatureWindow = new Window_TimeTemperature(rect);
    this.addWindow(this._timeTemperatureWindow);
  };

  Scene_Menu.prototype.hungerSleepStatusWindowRect = function () {
    // Full screen width window - only showing actor 1
    const goldRect = this.goldWindowRect();
    const ww = Graphics.boxWidth; // Full screen width
    const wh = this.calcWindowHeight(1, false); // Always 1 line for actor 1 only
    const wx = 0; // Start from left edge
    const wy = goldRect.y - wh; // Position above the gold window
    return new Rectangle(wx, wy, ww, wh);
  };

  Scene_Menu.prototype.timeTemperatureWindowRect = function () {
    // Much larger window to accommodate horizontal layout with more spacing
    const goldRect = this.goldWindowRect();
    const ww = 350; // Increased width from 200 to 350 for larger container
    const wh = this.calcWindowHeight(1, false) + 8; // Height for 1 line only
    const wx = goldRect.x - ww; // Position to the left of gold window
    const wy = goldRect.y; // Same Y position as gold window
    return new Rectangle(wx, wy, ww, wh);
  };
  //=============================================================================
  // Game_Temp Extensions for Notifications
  //=============================================================================

  // Notifications render through the shared top-left HTML toast
  // (ParchmentToast.js, same visual language as the location popup).
  // The Game_Temp API is kept because other plugins push through it
  // (ItemSystemInventory, CookingSystem).
  Game_Temp.prototype.addHungerSleepNotification = function (text, severity) {
    if (!window.ParchmentToast) return;
    if (!severity) {
      // Derive severity from the text - works with Italian text too
      if (
        text.includes(getText("starving").replace("!", "")) ||
        text.includes(getText("exhausted").replace("!", ""))
      ) {
        severity = "danger";
      } else if (
        text.includes(getText("hungry")) ||
        text.includes(getText("sleepy"))
      ) {
        severity = "warning";
      } else {
        severity = "info";
      }
    }
    window.ParchmentToast.show(text, { severity: severity, duration: 120 });
  };

  function Window_Bounty() {
    this.initialize(...arguments);
  }

  Window_Bounty.prototype = Object.create(Window_Base.prototype);
  Window_Bounty.prototype.constructor = Window_Bounty;

  Window_Bounty.prototype.initialize = function (rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
    this._refreshTimer = 0;
    this._cycleTimer = 0;
    this._showBounty = true; // Toggle between bounty and date
  };

  Window_Bounty.prototype.update = function () {
    Window_Base.prototype.update.call(this);

    // Refresh every 30 frames
    this._refreshTimer++;
    if (this._refreshTimer >= 30) {
      this._refreshTimer = 0;
      this.refresh();
    }

    // Handle cycling between bounty and date every 2 seconds (120 frames)
    const bountyValue = $gameVariables.value(66) || 0;
    if (bountyValue > 0) {
      this._cycleTimer++;
      if (this._cycleTimer >= 120) {
        this._cycleTimer = 0;
        this._showBounty = !this._showBounty;
      }
    }
  };

  Window_Bounty.prototype.refresh = function () {
    if (!this.contents) return;

    // Skip clear + redraw when the displayed content is unchanged.
    const bountyValue = $gameVariables.value(66) || 0;
    let sig;
    if (bountyValue === 0) {
      sig = 'hidden';
    } else if (this._showBounty) {
      sig = 'b|' + bountyValue;
    } else {
      const dateTime = getDateTimeFromMinutes(getGameTimeMinutes());
      sig = 'd|' + dateTime.dateShort;
    }
    if (sig === this._lastDrawSig) return;
    this._lastDrawSig = sig;

    this.contents.clear();
    this.drawBounty();
  };

  Window_Bounty.prototype.drawBounty = function () {
    const bountyValue = $gameVariables.value(66) || 0;

    if (bountyValue === 0) {
      this.hide();
      return;
    }

    this.show();
    const minutes = getGameTimeMinutes();
    const dateTime = getDateTimeFromMinutes(minutes);

    if (this._showBounty) {
      const euroValue = (bountyValue / 100).toFixed(2);
      const bountyText = `${euroValue}€`;
      this.changeTextColor(ColorManager.textColor(2));
      this.drawText(bountyText, 0, 0, this.contents.width, "left");
    } else {
      this.resetTextColor();
      this.drawText(dateTime.dateShort, 0, 0, this.contents.width, "left");
    }
  };
  //=============================================================================
  // Data Loading/Saving
  //=============================================================================

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);

    // Migration of old individual own properties to the shared global variables
    let migratedHunger = null;
    let migratedSleep = null;

    $gameParty.members().forEach((actor) => {
      if (actor.hasOwnProperty("_hunger")) {
        if (migratedHunger === null) migratedHunger = actor._hunger;
        delete actor._hunger;
      }
      if (actor.hasOwnProperty("_sleep")) {
        if (migratedSleep === null) migratedSleep = actor._sleep;
        delete actor._sleep;
      }
    });

    if (migratedHunger !== null && $gameSystem) {
      $gameSystem._globalHunger = migratedHunger;
    }
    if (migratedSleep !== null && $gameSystem) {
      $gameSystem._globalSleep = migratedSleep;
    }

    // Initialize hunger/sleep system after loading if needed
    $gameParty.members().forEach((actor) => {
      if (actor._hunger === undefined) {
        actor._hunger = maxHunger;
      }
      if (actor._sleep === undefined) {
        actor._sleep = maxSleep;
      }
      if (actor._hygiene === undefined) {
        actor._hygiene = maxNeed;
      }
      if (actor._social === undefined) {
        actor._social = maxNeed;
      }
      if (actor._leisure === undefined) {
        actor._leisure = maxNeed;
      }
      if (actor._prevHungerState === undefined) {
        actor._prevHungerState = "normal";
      }
      if (actor._prevSleepState === undefined) {
        actor._prevSleepState = "normal";
      }
    });

    // Initialize game time if not set (game load). Unset variables read as 0,
    // so only seed 0 when there is no saved time; always refresh the displayed
    // date variable (113) from the loaded game time so it is never stale.
    if (!$gameVariables.value(gameTimeVariable)) {
      $gameVariables.setValue(gameTimeVariable, 0); // Start at 0 minutes elapsed (8 AM on Jan 1, 2001)
      debug("Game time initialized to 01 JAN 2001 12:00 after load");
    }
    updateGameDateVariable();
  };

  //=============================================================================
  // AddictionSystem - the craving meters of the addiction traits
  //=============================================================================
  // A craving is a need read backwards: it CLIMBS while it goes unfed, and the
  // substance that feeds it drops it straight back to zero. 0 is an addict who
  // has just had their fix, 100 is one in withdrawal. Only a member carrying
  // the trait keeps a meter, so a party nobody in it is hooked on anything
  // never shows a single addiction bar.
  //
  // Which traits count is decided here, by id, against js/db/Health/Traits.json:
  // the five dependencies (alcohol, caffeine, nicotine, narcotics, gambling).
  // A trait like Adrenaline Junkie or Workaholic is an appetite, not a
  // dependency, and has nothing that can be handed to it, so it stays out.
  const withdrawalStateId = Number(parameters.withdrawalStateId || 50);
  // Withdrawal bites at a full meter and does not let go until the craving has
  // been brought back down well below it, so one puff cannot flick it off.
  const WITHDRAWAL_ON = 100;
  const WITHDRAWAL_OFF = 80;
  // The body still wants it while asleep, just more quietly.
  const CRAVING_SLEEP_FACTOR = 0.35;

  window.AddictionSystem = {
    // rate is the craving gained per step as a multiple of the sleep drain, so
    // a nicotine addict walks into a full craving in about twelve in-game
    // hours and a gambler in about thirty. These used to be twice as steep,
    // which turned every dependency into an errand run every few hours; a
    // craving that takes most of a day to bite is a habit the party lives
    // with rather than a timer they serve.
    LIST: [
      { key: "nicotine", traitId: 102, rate: 0.45 },
      { key: "caffeine", traitId: 101, rate: 0.35 },
      { key: "narcotic", traitId: 104, rate: 0.28 },
      { key: "alcohol",  traitId: 22,  rate: 0.22 },
      { key: "gambling", traitId: 103, rate: 0.18 },
    ],

    get LABELS() { return T.obj("TimeDate.addictionLabel"); },

    get KEYS() { return this.LIST.map((a) => a.key); },

    spec(key) {
      return this.LIST.find((a) => a.key === key) || null;
    },

    isKey(key) {
      return !!this.spec(key);
    },

    label(key) {
      return this.LABELS[key] || key;
    },

    // The trait ids an actor carries, straight off TraitSelector's record.
    _traitIds(actor) {
      return (actor?._selectedTraits ?? []).map((t) => t?.id).filter((id) => id != null);
    },

    // Which addictions this member actually has, in LIST order.
    keysFor(actor) {
      if (!actor) return [];
      const ids = this._traitIds(actor);
      return this.LIST.filter((a) => ids.includes(a.traitId)).map((a) => a.key);
    },

    has(actor, key) {
      return this.keysFor(actor).includes(key);
    },

    isAddict(actor) {
      return this.keysFor(actor).length > 0;
    },

    // Current craving 0-100, or null when this member is not hooked on it (the
    // null is what tells every panel to draw no bar at all).
    craving(actor, key) {
      if (!actor || !this.has(actor, key)) return null;
      const store = actor._cravings;
      const value = store ? store[key] : undefined;
      return typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
    },

    setCraving(actor, key, value) {
      if (!actor || !this.isKey(key)) return;
      if (!actor._cravings) actor._cravings = {};
      actor._cravings[key] = Math.max(0, Math.min(100, value));
    },

    // Feed the addiction. amount defaults to a full fix, which is what an item
    // handed to an addict does: the craving goes to zero.
    relieve(actor, key, amount) {
      const current = this.craving(actor, key);
      if (current === null) return false;
      const relief = amount === undefined || amount === null ? 100 : Number(amount);
      this.setCraving(actor, key, current - relief);
      this.updateWithdrawal(actor);
      return true;
    },

    // Every addiction of this member at once, for a detox drug or a cold spell.
    relieveAll(actor, amount) {
      this.keysFor(actor).forEach((key) => this.relieve(actor, key, amount));
    },

    // The craving that is hurting most, which is the one a single summary bar
    // has to report. Returns null for a member with no addiction.
    worst(actor) {
      let out = null;
      for (const key of this.keysFor(actor)) {
        const value = this.craving(actor, key) ?? 0;
        if (!out || value > out.value) out = { key, value };
      }
      return out;
    },

    // Every craving of a member, as [{ key, label, value }], empty when clean.
    cravingsFor(actor) {
      return this.keysFor(actor).map((key) => ({
        key,
        label: this.label(key),
        value: this.craving(actor, key) ?? 0,
      }));
    },

    // How many members of the party carry an addiction at all: the (X) in the
    // party-wide "Addictions (X)" card.
    partyAddictCount() {
      if (!$gameParty) return 0;
      return $gameParty.members().filter((m) => this.isAddict(m)).length;
    },

    // The worst craving anywhere in the party, which is what that same card
    // fills its bar with. Null when nobody is addicted.
    partyWorst() {
      if (!$gameParty) return null;
      let out = null;
      for (const member of $gameParty.members()) {
        const worst = this.worst(member);
        if (worst && (!out || worst.value > out.value)) out = worst;
      }
      return out;
    },

    // An NPC keeps no meter: they feed themselves off-screen and nobody is
    // watching, so their craving is a cycle rather than a store. Each addicted
    // NPC gets a personal phase seeded from their name, which means that at any
    // hour some of the town is between cigarettes and some of it badly wants
    // one, consistently and with nothing written to the save.
    profileCravings(profile) {
      const ids = (profile && profile.traitIds) || [];
      const specs = this.LIST.filter((a) => ids.includes(a.traitId));
      if (!specs.length) return [];
      const now = getGameTimeMinutes();
      const who = (profile && (profile._eventName || profile.name)) || "";
      return specs.map((spec) => {
        // The same rate the party runs on, read as "minutes between fixes".
        const cycle = Math.max(30, Math.round(100 / (sleepDecreaseRate * 10 * spec.rate)));
        const phase = this._phaseFor(who + ":" + spec.key) % cycle;
        const position = (((now - phase) % cycle) + cycle) % cycle;
        return {
          key: spec.key,
          label: this.label(spec.key),
          value: (position / cycle) * 100,
        };
      });
    },

    // The craving biting an NPC hardest right now, or null for a clean one.
    profileWorst(profile) {
      let out = null;
      for (const craving of this.profileCravings(profile)) {
        if (!out || craving.value > out.value) out = craving;
      }
      return out;
    },

    _phaseFor(seed) {
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
      return Math.abs(h);
    },

    // Craving climbs with the other meters, one walked step at a time.
    stepActor(actor, sleepRate, multiplier) {
      const keys = this.keysFor(actor);
      if (!keys.length) return;
      for (const key of keys) {
        const spec = this.spec(key);
        const current = this.craving(actor, key) ?? 0;
        this.setCraving(actor, key, current + sleepRate * spec.rate * multiplier);
      }
      this.updateWithdrawal(actor);
    },

    // Craving climbs over simulated minutes too (passed time, a night's sleep,
    // a work shift), at the same rate the walked steps use.
    advanceMinutes(minutes, factor) {
      if (!$gameParty || !(minutes > 0)) return;
      const scale = factor === undefined ? 1 : factor;
      for (const actor of $gameParty.members()) {
        if (!actor) continue;
        for (const key of this.keysFor(actor)) {
          const spec = this.spec(key);
          const current = this.craving(actor, key) ?? 0;
          this.setCraving(actor, key, current + sleepDecreaseRate * 10 * minutes * spec.rate * scale);
        }
        this.updateWithdrawal(actor);
      }
    },

    // The withdrawal state goes on at a full craving and comes off only once
    // every craving is back under WITHDRAWAL_OFF, and it is announced the same
    // way a need warning is.
    updateWithdrawal(actor) {
      if (!actor || !withdrawalStateId) return;
      const worst = this.worst(actor);
      if (!worst) return;
      const affected = actor.isStateAffected(withdrawalStateId);
      if (!affected && worst.value >= WITHDRAWAL_ON) {
        actor.addState(withdrawalStateId);
        if ($gameTemp && $gameTemp.addHungerSleepNotification) {
          $gameTemp.addHungerSleepNotification(
            T("TimeDate.addiction.withdrawal", { name: actor.name(), substance: this.label(worst.key) }),
            "danger"
          );
        }
      } else if (affected && worst.value < WITHDRAWAL_OFF) {
        actor.removeState(withdrawalStateId);
        if ($gameTemp && $gameTemp.addHungerSleepNotification) {
          $gameTemp.addHungerSleepNotification(
            T("TimeDate.addiction.relieved", { name: actor.name(), substance: this.label(worst.key) })
          );
        }
      }
    },
  };

  //=============================================================================
  // Insomnia - how long the party has gone without lying down
  //=============================================================================
  // The sleep METER answers how tired somebody is; it says nothing about how
  // long they have been awake, because a coffee and a seat both refill it. What
  // the travel card reports, what turns a dream hellish and what starts pulling
  // the party's mind apart is the time since the last real night's rest, which
  // is one stamp on the world clock: `$gameSystem._lastSleptMinute`, written by
  // the sleep sequence, by cryogenic sleep and by nothing else.
  //
  // `dread` is that time read as a 0..1 figure and is the one number every
  // consumer works off: 0 up to a day awake, rising through two days, and 1 at
  // a week, which is where the dream stops being a dream.
  //=============================================================================
  const INSOMNIA_STAGES = [
    { hours: 24,       dread: 0.00 },   // a long day: nothing yet
    { hours: 48,       dread: 0.40 },   // two days
    { hours: 24 * 7,   dread: 0.80 },   // a week
    { hours: 24 * 14,  dread: 1.00 }    // and past that it is only itself
  ];

  window.Insomnia = {
    // The moment the party last really slept. A save that has never slept is
    // read as having gone to bed the night the world started, not as having
    // been awake since 2001.
    lastSleptMinute() {
      if (typeof $gameSystem === 'undefined' || !$gameSystem) return 0;
      if ($gameSystem._lastSleptMinute == null) $gameSystem._lastSleptMinute = getGameTimeMinutes();
      return Number($gameSystem._lastSleptMinute) || 0;
    },

    // Called by every path that counts as a night's rest.
    markSlept() {
      if (typeof $gameSystem === 'undefined' || !$gameSystem) return;
      $gameSystem._lastSleptMinute = getGameTimeMinutes();
      $gameSystem._insomniaNextRoll = null;
      this.clearStates();
    },

    minutesAwake() {
      return Math.max(0, getGameTimeMinutes() - this.lastSleptMinute());
    },

    hoursAwake() { return this.minutesAwake() / 60; },

    /** 0 rested, 1 the far side of a week without sleep. */
    dread() {
      const h = this.hoursAwake();
      const first = INSOMNIA_STAGES[0];
      if (h <= first.hours) return 0;
      for (let i = 1; i < INSOMNIA_STAGES.length; i++) {
        const a = INSOMNIA_STAGES[i - 1], b = INSOMNIA_STAGES[i];
        if (h <= b.hours) {
          const t = (h - a.hours) / (b.hours - a.hours);
          return a.dread + (b.dread - a.dread) * t;
        }
      }
      return 1;
    },

    /** Which rung of the ladder they are on: 0 rested .. 4 past a fortnight. */
    stage() {
      const h = this.hoursAwake();
      let n = 0;
      for (const s of INSOMNIA_STAGES) { if (h > s.hours) n++; }
      return n;
    },

    // "18 hours without sleep", "3 days without sleep", "2 months without
    // sleep": the largest unit that reads as a whole number, so the card says
    // days once days is what it is and never counts to two hundred hours.
    describe() {
      const mins = this.minutesAwake();
      const units = [
        ['years',  60 * 24 * 365],
        ['months', 60 * 24 * 30],
        ['weeks',  60 * 24 * 7],
        ['days',   60 * 24],
        ['hours',  60],
        ['minutes', 1]
      ];
      for (const [key, size] of units) {
        const v = Math.floor(mins / size);
        if (v >= 1) return T('TimeDate.insomnia.' + key + (v === 1 ? 'One' : ''), { n: v });
      }
      return T('TimeDate.insomnia.minutes', { n: 0 });
    },

    // The mind goes before the body does. Every stage past the first deals the
    // party one of the MENTAL ailments (and only those: an insomniac is not
    // poisoned, they are seeing things), and the chance climbs with the dread.
    // Nothing here is permanent, because sleeping takes all of it away.
    MENTAL_STATES: [8 /* Confusion */, 7 /* Rage */, 10 /* Sleep */, 31 /* Berserk */],

    clearStates() {
      if (typeof $gameParty === 'undefined' || !$gameParty) return;
      for (const actor of $gameParty.members()) {
        if (!actor) continue;
        for (const id of this.MENTAL_STATES) {
          if (actor.isStateAffected(id)) actor.removeState(id);
        }
      }
    },

    // Rolled from the depletion loop, so it only ever happens while the party
    // is on its feet, but paced by the CLOCK rather than by walked steps: a
    // step is ten minutes on the world map and six seconds anywhere else, and
    // a per-step roll would leave a corridor more maddening than a continent.
    tick() {
      if (typeof $gameParty === 'undefined' || !$gameParty) return;
      if ($gameParty.inBattle && $gameParty.inBattle()) return;
      const stage = this.stage();
      if (stage < 1) return;
      const dread = this.dread();
      const now = getGameTimeMinutes();
      // Four hours between rolls at a day awake, closing to under an hour past
      // a week, and each roll is a coin weighted by the same figure.
      const interval = 240 - dread * 190;
      if ($gameSystem._insomniaNextRoll == null) $gameSystem._insomniaNextRoll = now + interval;
      if (now < $gameSystem._insomniaNextRoll) return;
      $gameSystem._insomniaNextRoll = now + interval;
      if (Math.random() > 0.35 + dread * 0.55) return;
      const members = $gameParty.members().filter(a => a && a.isAlive());
      if (!members.length) return;
      const actor = members[Math.floor(Math.random() * members.length)];
      // Falling asleep on your feet is the last rung: below it the mind only
      // wanders and snaps.
      const pool = stage >= 2 ? this.MENTAL_STATES : this.MENTAL_STATES.slice(0, 2);
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (!$dataStates[id] || actor.isStateAffected(id)) return;
      actor.addState(id);
      if (window.ParchmentToast) {
        const stateName = window.translateText
          ? window.translateText($dataStates[id].name) : $dataStates[id].name;
        window.ParchmentToast.show(
          T('TimeDate.insomnia.seized', {
            name: actor.name(),
            state: stateName,
            time: this.describe()
          }),
          { severity: 'danger', key: 'insomnia-seized' }
        );
      }
    }
  };

  //=============================================================================
  // PartyNeeds - shared needs vocabulary for the whole party
  //=============================================================================
  // Single source of truth for "what needs exist" and "what is the party's
  // median for each". The player (Actor 1) reads its own actor meters; every
  // other member reads its NPC society profile. Consumed by both the travel
  // HUD below and the parchment menu (CustomMainMenuLayout.js).
  // How a needs meter is inked. Three plugins draw the same bars (the status
  // sheet, the menu's survival cards and the biologic panel) and each used to
  // carry its own copy of the thresholds and its own three hexes, which meant
  // the scale drifted between them and none of it answered to the theme.
  //
  // band() is for a meter that empties as things get worse (hunger, sleep),
  // cravingBand() for one that fills (withdrawal). Both return the modifier
  // class: put it on the number and on the bar fill, alongside .gauge-ink and
  // .gauge-fill, and theme.css does the rest.
  window.NeedGauge = {
    band(pct) {
      if (pct <= 20) return "gauge-band--bad";
      if (pct <= 50) return "gauge-band--warn";
      return "gauge-band--ok";
    },
    cravingBand(pct) {
      if (pct >= 80) return "gauge-band--bad";
      if (pct >= 50) return "gauge-band--warn";
      return "gauge-band--ok";
    },
  };

  window.PartyNeeds = {
    KEYS:   ['hunger', 'sleep', 'hygiene', 'social', 'leisure'],
    get LABELS() { return T.obj("TimeDate.needLabel"); },

    getMemberNeeds(mem) {
      if (!mem) return {};
      // The actor accessors already resolve where each meter lives (actor
      // fields for the player, society profile for a recruited companion), so
      // every member is read the same way.
      const profile = window.NPCSocietyRegistry?.getProfile?.(mem.name());
      return {
        hunger:  mem.hungerPercent   ? mem.hungerPercent()   : Math.round(profile?.hunger ?? 100),
        sleep:   mem.sleepPercent    ? mem.sleepPercent()    : Math.round(profile?.sleep  ?? 100),
        hygiene: mem.hygienePercent  ? mem.hygienePercent()  : Math.round(profile?.hygiene ?? 100),
        social:  mem.socialPercent   ? mem.socialPercent()   : Math.round(profile?.social  ?? 100),
        leisure: mem.leisurePercent  ? mem.leisurePercent()  : Math.round(profile?.leisure ?? 100),
      };
    },

    median(values) {
      const vals = values.filter(v => v !== null && v !== undefined);
      if (!vals.length) return null;
      const sorted = vals.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    },

    partyMedian() {
      const members = $gameParty ? $gameParty.members() : [];
      const all = members.map(m => this.getMemberNeeds(m));
      const out = {};
      for (const k of this.KEYS) out[k] = this.median(all.map(n => n[k]));
      return out;
    },

    // Apply a signed delta to one of the extended meters (Hygiene / Social /
    // Fun) of every party member, through the actor need methods, which write
    // to the actor for the player and to the society profile for a recruited
    // companion.
    //
    // opts.focus is the member the moment belongs to, the one doing the talking
    // or the playing: they get opts.focusBonus times the delta, so a shared
    // experience still counts for more to whoever lived it.
    addNeedToAll(key, delta, opts = {}) {
      if (!delta || !$gameParty) return;
      const spec = {
        hygiene: { add: 'addHygiene', reduce: 'reduceHygiene' },
        social:  { add: 'addSocial',  reduce: 'reduceSocial'  },
        leisure: { add: 'addLeisure', reduce: 'reduceLeisure' },
      }[key];
      if (!spec) return;
      const focus = opts.focus || null;
      const bonus = opts.focusBonus != null ? Number(opts.focusBonus) : 1;
      $gameParty.members().forEach(mem => {
        if (!mem) return;
        const d = (focus && mem === focus) ? delta * bonus : delta;
        if (!d) return;
        if (d >= 0) {
          if (mem[spec.add]) mem[spec.add](d);
        } else if (mem[spec.reduce]) {
          mem[spec.reduce](-d);
        }
      });
    },

    addLeisureToAll(delta, opts) { this.addNeedToAll('leisure', delta, opts); },
    addSocialToAll(delta, opts)  { this.addNeedToAll('social',  delta, opts); }
  };

  //=============================================================================
  // StateNeeds - a status effect that is also a need being met
  //=============================================================================
  // Two of the ailments a battle hands out are not only ailments. Somebody put
  // to Sleep in the middle of a fight is asleep, and somebody drenched by a
  // water spell is getting washed, whether or not either was the point. Each
  // turn spent under one of those states pays RECOVER_SHARE (10%) of the whole
  // meter back.
  //
  // What is announced is the RECOVERY, not the meter: the party is told each
  // time another quarter of a full bar has been paid back, which is why the
  // running total is kept rather than watched for the bar crossing a line.
  // The credit still accrues turn by turn in battle, but the announcement
  // itself waits until the party is back on the map, so a needs update never
  // interrupts a fight.
  //=============================================================================
  const STATE_SLEEP = 10;   // Sleep, States.json
  const STATE_WET   = 28;   // Wet
  const RECOVER_SHARE = 0.10;
  const ANNOUNCE_STEP = 0.25;

  window.StateNeeds = {
    /**
     * Pays one turn's worth into a meter and says so on every quarter of a
     * whole bar that goes in. The running total lives on the actor, so a
     * quarter part-earned in one fight is finished in the next, and it is wound
     * back once a whole bar has been paid: the announcement counts 25, 50, 75,
     * 100 and then starts again rather than reporting 100% for ever.
     */
    _credit(actor, key, gain, max) {
      if (!actor._stateNeedRecovery) actor._stateNeedRecovery = {};
      const before = Number(actor._stateNeedRecovery[key]) || 0;
      let after = before + gain;
      const step = max * ANNOUNCE_STEP;
      const quarters = Math.floor(after / step);
      const inBattle = $gameParty && $gameParty.inBattle && $gameParty.inBattle();
      if (quarters > Math.floor(before / step) && window.ParchmentToast && !inBattle) {
        window.ParchmentToast.show(
          T('TimeDate.stateNeed.' + key, {
            name: actor.name(),
            percent: Math.min(100, quarters * 25)
          }),
          { severity: 'good', key: 'stateneed-' + key + '-' + actor.actorId() }
        );
      }
      if (after >= max) after -= max;
      actor._stateNeedRecovery[key] = after;
    },

    /** One turn spent under a state that is quietly doing the party some good. */
    turn(actor) {
      if (!actor || !actor.isActor || !actor.isActor()) return;
      if (actor.isStateAffected(STATE_SLEEP) && actor.addSleep) {
        actor.addSleep(maxSleep * RECOVER_SHARE);
        this._credit(actor, 'sleep', maxSleep * RECOVER_SHARE, maxSleep);
      }
      if (actor.isStateAffected(STATE_WET) && actor.addHygiene) {
        actor.addHygiene(maxNeed * RECOVER_SHARE);
        this._credit(actor, 'hygiene', maxNeed * RECOVER_SHARE, maxNeed);
      }
    }
  };

  // One turn of the round is one call of onTurnEnd on that battler, under the
  // engine's own turn order and under IndividualBattleTurns alike.
  const _Game_Battler_onTurnEnd_TDS = Game_Battler.prototype.onTurnEnd;
  // Read BEFORE the original, which is where a state's turns are counted down
  // and an expired one is taken off: the turn just spent was spent under it.
  Game_Battler.prototype.onTurnEnd = function () {
    try { window.StateNeeds.turn(this); } catch (e) { /* the turn still ended */ }
    _Game_Battler_onTurnEnd_TDS.call(this);
  };

  //=============================================================================
  // MinigameFun - shared hook for minigames to nudge the party Fun stat.
  // Playing any minigame is leisure; winning is a bigger boost, losing costs
  // Fun. Defensive so games can call it without worrying about load order.
  //=============================================================================
  window.MinigameFun = {
    DELTA: { played: 30, won: 120, lost: -60, draw: 30 },

    // Points towards the game's own specialization. Winning teaches more than
    // losing, but losing still teaches: the party is practising either way.
    SPEC_POINTS: { played: 1, won: 3, lost: 1, draw: 2 },

    // How much of the gambling craving one played round of a game of chance
    // takes off. A game that is a wager marks itself with `gambling: true`
    // and the craving is fed whatever the result was: a losing spin scratches
    // the itch every bit as well as a winning one, which is the whole problem
    // with the habit.
    GAMBLING_RELIEF: 60,

    // Feed the gambling craving of EVERY party member who carries it, not just
    // whoever was holding the lever: the party spent the evening in the casino
    // together. Returns [{ name, dropped }] for the members who actually had
    // something to ease, which is what the popup reports.
    payGambling(amount) {
      const AS = window.AddictionSystem;
      if (!AS || !AS.has || !$gameParty) return [];
      const relief = amount == null ? this.GAMBLING_RELIEF : Number(amount);
      const eased = [];
      for (const actor of $gameParty.members()) {
        if (!actor || !AS.has(actor, 'gambling')) continue;
        const before = AS.craving(actor, 'gambling') || 0;
        AS.relieve(actor, 'gambling', relief);
        const dropped = Math.round(before - (AS.craving(actor, 'gambling') || 0));
        if (dropped > 0) eased.push({ name: actor.name(), dropped });
      }
      return eased;
    },

    // Legacy skins, still passed by older call sites as a bare string. Each one
    // names the specialization that kind of pastime trains, so a call that has
    // not been given an explicit spec still trains something sensible.
    // i18n-ignore-start: Specialization.json ids, matched by name
    THEME_SPEC: {
      arcade: 'Video Gaming',
      casino: 'Card Counting',
      felt: 'Board Game Strategy',
      aqua: 'Swimming',
      mystic: 'Tarot Reading',
      sci: 'Chemistry',
      hardwood: 'Basketball'
    },
    // i18n-ignore-end

    // Legacy skin API kept as a no-op so minigames calling use('arcade') keep
    // working; feedback renders through the shared ParchmentToast popup
    // regardless of skin.
    use() { return this; },

    // A game opened from the main menu is the player looking at their own
    // sheet, not the party spending an evening somewhere: the Fun popup, the
    // skill badge and the level-up toasts all stay down for it. The points are
    // still banked; it is the announcement that has no business covering a menu
    // the player opened to read something else.
    fromMainMenu() {
      const stack = (typeof SceneManager !== 'undefined' && SceneManager._stack) || [];
      return stack.some(scene => scene && (scene === Scene_Menu || scene.prototype instanceof Scene_Menu));
    },

    // A call carries a bare string or { spec, points, actor }. A bare string is
    // a legacy skin id when it is one of the themes above and the name of a
    // specialization otherwise, which is how most minigames call this
    // ("Lockpicking", "Tenpin Bowling", "Surfing"): before this, those went in
    // as themes, matched nothing, and quietly taught the party nothing at all.
    _opts(arg) {
      if (!arg) return {};
      if (typeof arg === 'string') {
        const themed = this.THEME_SPEC[arg];
        return themed ? { theme: arg, spec: themed } : { spec: arg };
      }
      return Object.assign({}, arg, {
        spec: arg.spec || (arg.theme ? this.THEME_SPEC[arg.theme] : null)
      });
    },

    _apply(kind, arg) {
      const opts = this._opts(arg);
      const quiet = this.fromMainMenu();
      const delta = this.DELTA[kind] || 0;
      if (delta && window.PartyNeeds && window.PartyNeeds.addLeisureToAll) {
        window.PartyNeeds.addLeisureToAll(delta);
      }

      // A game of chance feeds the craving as well as the Fun meter. This runs
      // whether or not the popup does, so a session opened from the main menu
      // still counts for the addicts in the party.
      const eased = opts.gambling ? this.payGambling(opts.relief) : [];

      // Every minigame names the skill it is training on screen. played() is
      // called as a session opens, so this is where the badge goes up; it takes
      // itself down when the minigame's scene ends.
      if (opts.spec && window.SpecBadge && !quiet) {
        try { window.SpecBadge.show(opts.spec); } catch (e) { /* cosmetic only */ }
      }

      // Points are banked immediately; the level-up toast is queued behind the
      // Fun toast so one session can report both without either being lost.
      let gained = [];
      const points = opts.points != null ? opts.points : (this.SPEC_POINTS[kind] || 0);
      if (opts.spec && points > 0 && window.SpecializationXP) {
        try {
          gained = window.SpecializationXP.award(opts.spec, points, {
            actor: opts.actor,
            silent: true
          }) || [];
        } catch (e) { gained = []; }
      }

      try {
        if (!window.ParchmentToast || quiet) return;
        const substance = window.AddictionSystem
          ? window.AddictionSystem.label('gambling') // i18n-ignore: label() is localised
          : 'gambling';
        window.ParchmentToast.group([
          () => window.ParchmentToast.need('leisure', delta),
          ...eased.map(e => () => window.ParchmentToast.show(
            T('TimeDate.addiction.eased', { name: e.name, substance, amount: e.dropped }),
            { severity: 'good', duration: 150 }
          )),
          ...gained.map(g => () => window.SpecializationXP.announce(g))
        ]);
      } catch (e) { /* never let a cosmetic popup break a minigame */ }
    },

    // Call once when a minigame session begins.
    played(opts) { this._apply('played', opts); },
    // Call when the player wins / gets a strong positive result.
    won(opts) { this._apply('won', opts); },
    // Call when the player loses / fails.
    lost(opts) { this._apply('lost', opts); },
    // Call for a neutral or drawn result.
    draw(opts) { this._apply('draw', opts); }
  };

  //=============================================================================
  // MinigameOpponent - who sits in the other seat of a two-player minigame
  //=============================================================================
  // The split screen puts a second person in that seat. With nobody else
  // holding a pad the seat used to read "CPU", which is nothing anybody in
  // this world is called. It is filled instead by whoever is actually around:
  // a companion when the party is more than one, a bystander off the map when
  // the leader is travelling alone, and, when there is not even that, the only
  // opponent left to somebody sitting in an empty room.
  //
  // A game asks for a stand-in ONCE, as its session opens, and keeps what it
  // was given: the same face has to be across the table for the whole frame.
  // Defensive throughout, so a minigame can call this at any load order.
  window.MinigameOpponent = {
    // What one evening's game is worth to an NPC who was talked into playing,
    // on the same 0-100 leisure meter NPCSimulationCore drains.
    NPC_FUN: 14,

    // The party members who could be handed the other cue. The leader is the
    // one already playing, and the dead are not playing anything.
    partyCandidates() {
      if (typeof $gameParty === 'undefined' || !$gameParty) return [];
      const members = $gameParty.members() || [];
      return members.slice(1).filter(m => m && !m.isDead());
    },

    // Everybody standing on this map who is a person. The live NPC controllers
    // are the whole answer on a populated map; a hand-made map whose residents
    // were never given a controller is read off the events themselves, where a
    // society profile is what tells a resident apart from a door or a sign.
    mapNpcNames() {
      const seen = new Set();
      const out = [];
      const add = (name) => {
        if (!name || name === "NPC" || seen.has(name)) return; // i18n-ignore: event name, not text
        seen.add(name);
        out.push(name);
      };
      try {
        for (const c of ($gameSystem?.npcControllers || [])) {
          if (!c || c.eventId == null) continue;
          const ev = $gameMap?.event?.(c.eventId);
          if (ev && !ev._erased) add(c.eventName);
        }
        if (!out.length) {
          for (const ev of ($gameMap?.events?.() || [])) {
            if (!ev || ev._erased) continue;
            const name = ev.event?.()?.name;
            if (name && window.NPCSocietyRegistry?.getProfile?.(name)) add(name);
          }
        }
      } catch (e) { /* an empty room is a valid answer */ }
      return out;
    },

    // The stand-in for one session: { kind, name, actorId }. `kind` is 'party'
    // for a companion, 'npc' for a bystander and 'self' for the player's own
    // subconscious, which is what an opponent is when nobody else is there.
    pick(opts = {}) {
      const party = opts.party === false ? [] : this.partyCandidates();
      if (party.length) {
        const m = party[Math.floor(Math.random() * party.length)];
        return { kind: 'party', name: m.name(), actorId: m.actorId() };
      }
      const npcs = opts.npcs === false ? [] : this.mapNpcNames();
      if (npcs.length) {
        return { kind: 'npc', name: npcs[Math.floor(Math.random() * npcs.length)], actorId: 0 };
      }
      return { kind: 'self', name: T('TimeDate.opponent.subconscious'), actorId: 0 };
    },

    // The name to print in the other seat, with the game's own CPU label as
    // the fallback for a stand-in that was never picked.
    nameOf(stand, fallback) {
      return (stand && stand.name) || fallback || T('TimeDate.opponent.subconscious');
    },

    // An NPC who spent the evening playing enjoyed it: pay their leisure meter
    // when the session ends. A companion is already covered by MinigameFun,
    // which pays the whole party, and a subconscious has no meter to pay.
    payFun(stand, amount) {
      if (!stand || stand.kind !== 'npc') return 0;
      const profile = window.NPCSocietyRegistry?.getProfile?.(stand.name);
      if (!profile) return 0;
      const step = amount == null ? this.NPC_FUN : Number(amount);
      if (!(step > 0)) return 0;
      profile.leisure = Math.max(0, Math.min(100,
        Math.round((profile.leisure ?? 100) + step)));
      try {
        window.ParchmentToast?.show(
          T('TimeDate.opponent.funShared', { name: stand.name }),
          { severity: 'good', duration: 150 }
        );
      } catch (e) { /* never let a popup break a minigame */ }
      return step;
    }
  };

  //=============================================================================
  // BattleMood - what a fight does to the Mood meter
  //=============================================================================
  // The sibling of MinigameFun above, on the same 0-100 Mood (leisure) meter:
  // an evening at the arcade is one way a party keeps its spirits up, and
  // coming home alive from a fight is the other. A won battle pays VICTORY_GAIN
  // to everyone still standing; losing somebody for good in permadeath costs
  // the survivors far more than any victory pays back.
  //
  // WHO the member is decides how much of it they actually feel. Two ledgers
  // answer that, and either one is enough: the traits bought at creation
  // (js/db/Health/Traits.json, on the actor or on the society profile of a
  // recruited companion) and the personality the society dealt them
  // (js/db/Health/PersonalityData.json). Somebody who fights for the pleasure
  // of it enjoys a win more than most; a pacifist takes nothing from one at
  // all; and nobody uncaring enough grieves a comrade, however long they
  // marched together.
  //=============================================================================
  const MOOD = {
    VICTORY_GAIN:    15,   // percent of the whole meter, per won fight
    BLOODLUST_MULT:  1.8,  // what a win is worth to somebody who wanted it
    DEATH_LOSS:      25,   // the flat cost of losing a comrade for good
    DEATH_PER_BOND:  5,    // and this again per BOND_STEP of standing toward them
    BOND_STEP:       10,
    HATRED_AT:      -25    // a standing this low is not grief, it is relief
  };

  // Trait ids, Traits.json. A trait can sit in two groups at once: a sadist
  // enjoys the fight AND feels nothing when the body count includes a friend.
  const MOOD_TRAITS = {
    bloodlust:     [4, 24, 26, 47, 167],    // trigger happy, adrenaline junkie, pyromaniac, sadist, vengeful
    pacifist:      [25, 48],                // pacifist, hemophobic
    callous:       [32, 47, 162, 166],      // sociopath, sadist, nihilist, cynic
    compassionate: [33, 88, 89, 165, 168]   // empath, generous, loyal, romantic, forgiving
  };

  // Personality names, PersonalityData.json list ids rather than shown text.
  // i18n-ignore-start: PersonalityData.json ids, matched by name
  const MOOD_PERSONALITIES = {
    bloodlust:     ['Aggressive'],
    pacifist:      [],
    callous:       ['Apathetic', 'Cynical'],
    compassionate: ['Empathetic', 'Nurturing']
  };
  // i18n-ignore-end

  window.BattleMood = {
    // ── Who the member is ─────────────────────────────────────────────────
    _profile(member) {
      if (!member || !member.name) return null;
      try { return window.NPCSocietyRegistry?.getProfile?.(member.name()) || null; }
      catch (e) { return null; }
    },

    // The traits the player bought at creation, falling back to the set the
    // society rolled for a companion whose actor carries none of its own.
    _traitIds(member) {
      const bought = (member?._selectedTraits ?? []).map(t => t && t.id).filter(id => id != null);
      if (bought.length) return bought;
      const rolled = this._profile(member)?.traitIds;
      return Array.isArray(rolled) ? rolled : [];
    },

    _personality(member) {
      const profile = this._profile(member);
      if (!profile) return null;
      const helper = window.NPCEmpathize?._helpers?._personalityName;
      if (helper) {
        try { return helper(profile); } catch (e) { /* fall through */ }
      }
      return window._NPCSocietyDataLoader?.personalities?.[profile.personalityIndex]?.name || null;
    },

    // Whether this member belongs to one of the four dispositions above.
    is(member, group) {
      if (!member) return false;
      const traits = MOOD_TRAITS[group] || [];
      const ids = this._traitIds(member);
      if (traits.some(id => ids.includes(id))) return true;
      const persona = this._personality(member);
      return !!persona && (MOOD_PERSONALITIES[group] || []).includes(persona);
    },

    // What one member thinks of another: the same standing the Empathize panel
    // shows, so the person somebody has been rude to for a month is the person
    // they are measurably less sorry to lose. Answers 0 when neither of them
    // has a society record to read it off.
    standing(member, toward) {
      const profile = this._profile(member);
      const opinion = window.NPCEmpathize?._helpers?._npcEffectiveOpinion;
      if (!profile || !toward || !opinion) return 0;
      try { return Number(opinion(profile, toward)) || 0; }
      catch (e) { return 0; }
    },

    // ── Paying it ─────────────────────────────────────────────────────────
    // Straight onto the member's own meter rather than through
    // PartyNeeds.addLeisureToAll: every member is owed a different number here.
    _pay(member, delta) {
      if (!member || !delta) return 0;
      if (delta > 0) {
        if (member.addLeisure) member.addLeisure(delta);
      } else if (member.reduceLeisure) {
        member.reduceLeisure(-delta);
      }
      return delta;
    },

    // One toast for the whole party: the number most of them felt, with the
    // members who felt something else named underneath it. The headline is a
    // number somebody actually got (the commonest one, the leader's when they
    // all differ), never an average of numbers nobody felt.
    _announce(paid, headline) {
      if (!paid.length || !window.ParchmentToast) return;
      const tally = new Map();
      for (const p of paid) tally.set(p.delta, (tally.get(p.delta) || 0) + 1);
      let typical = paid[0].delta;
      for (const [delta, count] of tally) {
        if (count > tally.get(typical)) typical = delta;
      }
      const odd = paid.filter(p => p.delta !== typical)
        .map(p => T('TimeDate.mood.member', {
          name: p.name,
          delta: (p.delta > 0 ? '+' : '') + p.delta
        }));
      const note = odd.length ? `${headline} (${odd.join(', ')})` : headline;
      try {
        window.ParchmentToast.need('leisure', typical, { note });
      } catch (e) { /* a popup never breaks the end of a battle */ }
    },

    // ── A fight won ───────────────────────────────────────────────────────
    victoryGain(member) {
      if (this.is(member, 'pacifist')) return 0;
      const gain = MOOD.VICTORY_GAIN * (this.is(member, 'bloodlust') ? MOOD.BLOODLUST_MULT : 1);
      return Math.round(gain);
    },

    onVictory() {
      if (!$gameParty) return [];
      const paid = [];
      for (const member of $gameParty.members()) {
        if (!member) continue;
        const delta = this.victoryGain(member);
        this._pay(member, delta);
        paid.push({ name: member.name(), delta });
      }
      this._announce(paid, T('TimeDate.mood.victory'));
      return paid;
    },

    // ── A member lost for good ────────────────────────────────────────────
    // What losing `fallen` does to `member`. The bond is read as the survivor's
    // standing toward the dead: the closer they were, the worse it lands, and
    // somebody they could not stand is a weight off their shoulders instead.
    lossFor(member, fallen) {
      if (!member || !fallen || member === fallen) return 0;
      if (this.is(member, 'callous')) return 0;
      const standing = this.standing(member, fallen);
      if (standing <= MOOD.HATRED_AT && !this.is(member, 'compassionate')) {
        const steps = Math.floor(-standing / MOOD.BOND_STEP);
        return Math.round(MOOD.DEATH_PER_BOND * steps);
      }
      const steps = Math.floor(Math.max(0, standing) / MOOD.BOND_STEP);
      return -Math.round(MOOD.DEATH_LOSS + MOOD.DEATH_PER_BOND * steps);
    },

    // Called as a permadeath removal takes a member out of the party, while
    // they are still standing in it: every survivor who is not past caring
    // pays for it, and the one who hated them quietly does not.
    onMemberLost(fallen) {
      if (!fallen || !$gameParty) return [];
      const paid = [];
      for (const member of $gameParty.members()) {
        if (!member || member === fallen || member.isDead()) continue;
        const delta = this.lossFor(member, fallen);
        this._pay(member, delta);
        paid.push({ name: member.name(), delta });
      }
      this._announce(paid, T('TimeDate.mood.lost', { name: fallen.name() }));
      return paid;
    }
  };

  //=============================================================================
  // MapInfoHUD - DOM-based info card, bottom-right corner of the screen
  //=============================================================================
  function MapInfoHUD() {
    this._el = null;
    this._shown = false;
    this._refreshTimer = 0;
    this._cachedNeeds = { hunger: 100, sleep: 100, hygiene: 100, social: 100, leisure: 100 };
    this._lastPlayerX = $gamePlayer ? $gamePlayer.x : 0;
    this._lastPlayerY = $gamePlayer ? $gamePlayer.y : 0;
    this._create();
    this._refresh();
  }

  MapInfoHUD.prototype._create = function () {
    const el = document.createElement('div');
    el.id = 'map-info-hud';
    document.body.appendChild(el);
    this._el = el;
  };

  MapInfoHUD.prototype.destroy = function () {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  };

  // Which content the card should show right now, or null while it has
  // nothing worth showing (time is not passing fast, and the party is not
  // standing on the world map). Three modes:
  //  - 'world':  the world map (315). Shown permanently, full detail.
  //  - 'travel': inside a vehicle's interior map while a fast-travel timer
  //              is counting down. Full detail plus the arrival countdown.
  //  - 'clock':  waiting, sleeping, in cryo, or working a job shift - the
  //              clock is running fast but there is no "location" to show.
  MapInfoHUD.prototype._activeMode = function () {
    const scene = SceneManager._scene;
    if (!(scene instanceof Scene_Map)) return null;
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    if (mapId === 315) return 'world';
    if (VEHICLE_INTERIOR_MAPS.includes(mapId)) {
      const data = ($gameSystem && $gameSystem.getFastTravelData) ? $gameSystem.getFastTravelData() : null;
      if (data && data.timerActive) return 'travel';
    }
    // Waiting is a clock sequence like the others: the card is the travel
    // window the hours and the needs are watched through, so it comes up for
    // the wait timelapse too.
    if (scene._sleepSequenceState || scene._waitAdvance || scene._cryoSequenceState || scene._workSequenceActive) return 'clock';
    // Same reasoning as an active sleep/work sequence: there is no location to
    // report inside a cell, only the sentence's clock running -- and unlike
    // those, a jail term can run for real minutes without any sequence active
    // at all (standing around, or between sleeps), so it needs its own check
    // rather than piggybacking on _sleepSequenceState.
    if (window.prisonManager && window.prisonManager.isInPrison()) return 'clock';
    return null;
  };

  // The card is built during createAllWindows, while the scene is still black
  // and fading in, so it would otherwise pop in fully-formed over the loading
  // map. Hold it at opacity 0 until the map scene has finished its own fade,
  // then let the CSS transition show or hide it as the active mode changes -
  // in both directions, every frame, so it disappears the moment none of the
  // "time is passing fast" conditions hold any more.
  MapInfoHUD.prototype._updateVisibility = function () {
    const scene = SceneManager._scene;
    const ready = scene instanceof Scene_Map && !scene.isBusy();
    const active = ready && !!this._activeMode();
    if (active === this._shown) return;
    this._shown = active;
    this._el.classList.toggle('mih-visible', active);
    if (active) this._refresh();
  };

  MapInfoHUD.prototype.update = function () {
    if (!this._el) return;
    this._updateVisibility();
    if (!this._shown) return;
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    if (mapId === 315 && $gamePlayer) {
      const px = $gamePlayer.x;
      const py = $gamePlayer.y;
      if (px !== this._lastPlayerX || py !== this._lastPlayerY) {
        this._lastPlayerX = px;
        this._lastPlayerY = py;
        this._refresh();
        return;
      }
    }
    if (this._activeMode() === 'travel') {
      // The fast-travel countdown ticks in real time (Game_System's own
      // 1-second interval), so refresh every frame instead of the usual
      // half-second cadence to keep it visibly counting down.
      this._refresh();
      return;
    }
    this._refreshTimer++;
    if (this._refreshTimer >= 30) {
      this._refreshTimer = 0;
      this._refresh();
    }
  };

  // The biome ID of the square the player is standing on ("ForestTropical"),
  // which is what every rule keyed on the biome wants; the card itself shows
  // the readable name below. A hand-named location is deliberately not
  // consulted here: it is the name of a PLACE, not of a habitat, and the fauna
  // rules would not recognise it.
  MapInfoHUD.prototype._getBiomeId = function () {
    let name = 'Unknown'; // i18n-ignore: sentinel compared against cached biome ids
    if ($gameSystem && $gameSystem.getBiomeFromCache && $gamePlayer) {
      const b = $gameSystem.getBiomeFromCache($gamePlayer.x, $gamePlayer.y);
      if (b && b !== 'Unknown') name = b; // i18n-ignore: sentinel
    }
    if (name === 'Unknown' && $gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentBiome) { // i18n-ignore: sentinel
      name = $gameSystem._procGenData.currentBiome;
    }
    if (name.startsWith('Road ')) name = 'Road';
    return name;
  };

  MapInfoHUD.prototype._getBiomeName = function () {
    if ($gamePlayer && window.WorldGen && window.WorldGen.HardcodedBiomeNames) {
      const loc = window.WorldGen.HardcodedBiomeNames[`${$gamePlayer.x},${$gamePlayer.y}`];
      if (loc) return loc;
    }
    // The cached value is a biome id ("ForestTropical"); the card shows the
    // readable name Biomes.json declares for it ("Tropical Forest").
    return window.BiomeNames.display(this._getBiomeId());
  };

  // How dangerous this square is, in the one unit that means anything: the
  // level of the creature it usually fields. A square's danger is a property of
  // the square - the biome decides what lives there - so it is worth reading off
  // the map before walking onto it.
  //
  // The figure is the weighted median of the local roster, built by the
  // encounter system itself (BSE.Helpers.getPlaceEncounterMedianLevel), so it
  // is what the spawner would actually draw here rather than a restatement of
  // the difficulty curve. It is coloured against the party: what they are level
  // for reads cool, what is well over their heads reads hot, on the same scale
  // the temperature row uses.
  MapInfoHUD.prototype._enemyLevel = function () {
    const BSEH = window.BattleSystemEnhanced && window.BattleSystemEnhanced.Helpers;
    if (!BSEH || !BSEH.getPlaceEncounterMedianLevel) return '';
    const level = BSEH.getPlaceEncounterMedianLevel(this._getBiomeId());
    // Nothing spawnable here at all: an empty world, or a biome whose whole
    // roster this nation suppresses. Saying "Lv. 0" would be worse than
    // saying nothing.
    if (!level) return '';
    const party = BSEH.getPartyReferenceLevel ? BSEH.getPartyReferenceLevel() : 1;
    const over = level - party;
    let cls = 'mih-temp-mild';
    if (over <= -8) cls = 'mih-temp-cold';
    else if (over <= -3) cls = 'mih-temp-cool';
    else if (over >= 15) cls = 'mih-temp-hot';
    else if (over >= 5) cls = 'mih-temp-warm';
    return `<div class="mih-region mih-danger">` +
      `<span class="mih-region-lbl">${T("TimeDate.hud.enemies")}</span>` +
      `<span class="mih-region-val ${cls}">${T("TimeDate.hud.level", { level: level })}</span>` +
    `</div>`;
  };

  // i18n-ignore-start  Countries.json ids, never shown as they are written here
  const OMEGA_TOWER_COUNTRY = 'OmegaTower';
  const NEUTRAL_CONTROLLER = 'Neutral';
  // i18n-ignore-end

  // Country the player is standing in, plus the hyperpower controlling it.
  // The world map sets the country by region id (see WeatherSystem.js); the
  // active entry lives on $gameWeather.currentCountry, with Variable 86 as a
  // fallback index into window.WorldGen.Countries.
  MapInfoHUD.prototype._getCountryInfo = function () {
    let cc = (typeof $gameWeather !== 'undefined' && $gameWeather) ? $gameWeather.currentCountry : null;
    if (!cc && window.WorldGen && window.WorldGen.Countries) {
      const id = $gameVariables ? $gameVariables.value(86) : 0;
      cc = window.WorldGen.Countries.find(c => c.id === id);
    }
    if (!cc) return null;
    // The tower is not a country the party is travelling through: it is the
    // place the card already names on the line above, and the entry only exists
    // because the world data needs a default somewhere. Naming it twice, once
    // as the location and once as the nation, says nothing.
    const country = cc.country || '';
    if (!country || country === OMEGA_TOWER_COUNTRY) return null;
    // Ids, both of them (Countries.json "country" and "controller"), so they are
    // lifted into the player's language on the way out.
    const rawController = (cc.controller && cc.controller !== NEUTRAL_CONTROLLER)
      ? cc.controller : '';
    const names = window.WorldNames;
    return {
      country: names ? names.nation(country) : country,
      controller: (rawController && names) ? names.power(rawController) : rawController
    };
  };

  // Total hunger the party's food stock can restore, using the same nutrition
  // tags and recovery formula as EatFood: calories*0.10 + protein*2 + fat*1.5,
  // summed over every food item times its stack count.
  MapInfoHUD.prototype._foodReserve = function () {
    if (!$gameParty) return 0;
    // Cached: this regex-scans every party item, so it only recomputes when the
    // inventory changes (invalidated by the Game_Party.gainItem alias below).
    if (_foodReserveCache !== null) return _foodReserveCache;
    const utils = window.ItemSystemUtils;
    let total = 0;
    for (const item of $gameParty.items()) {
      if (!item || !item.note) continue;
      const cal = item.note.match(/<calories:(\d+)>/i);
      const fat = item.note.match(/<fat:(\d+)>/i);
      const pro = item.note.match(/<protein:(\d+)>/i);
      // i18n-ignore-start  item category tag
      const isFood = (utils && utils.hasItemCategory && utils.hasItemCategory(item, 'Food'))
        || cal || pro || fat;
      // i18n-ignore-end
      if (!isFood) continue;
      const recovery =
        (cal ? Number(cal[1]) : 0) * calorieFactor +
        (pro ? Number(pro[1]) : 0) * proteinFactor +
        (fat ? Number(fat[1]) : 0) * fatFactor;
      if (recovery > 0) total += recovery * $gameParty.numItems(item);
    }
    _foodReserveCache = total;
    return total;
  };

  // Hunger lost per in-game minute while travelling on the world map.
  // Mirrors the depletion loop: maxHunger*0.003 per step, 10 minutes per step.
  MapInfoHUD.prototype._worldHungerDrainPerMinute = function () {
    return (maxHunger * 0.003) / 10;
  };

  // "2mo 4d", "5d 3h", "6h 20m", ... - the two largest non-zero units.
  MapInfoHUD.prototype._formatFoodTime = function (minutes) {
    if (!minutes || minutes <= 0) return 'none';
    let rem = Math.floor(minutes);
    const units = [
      ['mo', 30 * 24 * 60],
      ['d', 24 * 60],
      ['h', 60],
      ['m', 1],
    ];
    const parts = [];
    for (const [label, size] of units) {
      const v = Math.floor(rem / size);
      if (v > 0) { parts.push(`${v}${label}`); rem -= v * size; }
      if (parts.length === 2) break;
    }
    return parts.length ? parts.join(' ') : '<1m';
  };

  // Food-remaining row: how long the current food stock would last on the road.
  MapInfoHUD.prototype._food = function () {
    const reserve = this._foodReserve();
    const perMin = this._worldHungerDrainPerMinute();
    const text = (reserve > 0 && perMin > 0) ? this._formatFoodTime(reserve / perMin) : T("TimeDate.hud.noFood");
    return `<div class="mih-region mih-food">` +
      `<span class="mih-region-lbl">${T("TimeDate.hud.food")}</span>` +
      `<span class="mih-region-val">${text}</span>` +
    `</div>`;
  };

  // Sleep-deprivation row: the twin of the food row, and shown on the same
  // terms. Food answers how long the stock will last; once the sleep meter is
  // empty there is no stock left to count, so what is reported instead is how
  // long the party has gone without lying down ("3 days without sleep"). Above
  // zero the meter says everything there is to say and the row is not drawn.
  MapInfoHUD.prototype._insomnia = function (needs) {
    if (!window.Insomnia) return '';
    const sleep = needs ? needs.sleep : null;
    if (sleep === null || sleep === undefined || sleep > 0) return '';
    const cls = window.Insomnia.stage() >= 2 ? 'mih-insomnia-bad' : 'mih-insomnia-warn';
    return `<div class="mih-region mih-insomnia">` +
      `<span class="mih-region-lbl">${T('TimeDate.hud.awake')}</span>` +
      `<span class="mih-region-val ${cls}">${window.Insomnia.describe()}</span>` +
    `</div>`;
  };

  // Temperature row: current ambient temp plus how much it is speeding up
  // hunger drain, so the cost of the climate is visible on the road.
  MapInfoHUD.prototype._temperature = function () {
    const temp = $gameVariables ? ($gameVariables.value(temperatureVariable) || 0) : 0;
    let cls = 'mih-temp-mild';
    if (temp <= 0) cls = 'mih-temp-cold';
    else if (temp < 12) cls = 'mih-temp-cool';
    else if (temp >= 35) cls = 'mih-temp-hot';
    else if (temp >= 27) cls = 'mih-temp-warm';
    return `<div class="mih-region mih-temp">` +
      `<span class="mih-region-lbl">${T("TimeDate.hud.temp")}</span>` +
      `<span class="mih-region-val ${cls}">${Math.round(temp)}&deg;C</span>` +
    `</div>`;
  };

  // Base fill colour per need; low values override to amber/red below.
  MapInfoHUD.NEED_COLORS = {
    hunger: 'mih-green', sleep: 'mih-blue', hygiene: 'mih-purple',
    social: 'mih-orange', leisure: 'mih-teal'
  };

  MapInfoHUD.prototype._fillClass = function (need, pct) {
    if (pct <= 20) return 'mih-red';
    if (pct < 40)  return 'mih-amber';
    return MapInfoHUD.NEED_COLORS[need] || 'mih-green';
  };

  // Render the median-of-party value for every tracked need as a labelled bar.
  MapInfoHUD.prototype._vitals = function (needs) {
    const PN = window.PartyNeeds;
    let rows = '';
    for (const key of PN.KEYS) {
      const pct = needs[key];
      if (pct === null || pct === undefined) continue;
      const fill = this._fillClass(key, pct);
      rows +=
        `<div class="mih-need">` +
          `<span class="mih-need-lbl">${PN.LABELS[key]}</span>` +
          `<div class="mih-need-bar"><div class="mih-need-fill ${fill}" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>` +
          `<span class="mih-need-pct">${pct}%</span>` +
        `</div>`;
    }
    return `<div class="mih-needs">${rows}</div>`;
  };

  // Fuel of the vehicle the player is currently riding, as an HTML bar matching
  // the needs bars. Returns '' when on foot or in a fuel-free vehicle.
  MapInfoHUD.prototype._fuel = function () {
    const st = window.MergedVehicleSystem?.getActiveFuelStatus?.();
    if (!st) return '';
    const fill = st.pct <= 25 ? 'mih-red' : 'mih-fuel';
    return `<div class="mih-needs mih-fuel-row">` +
      `<div class="mih-need">` +
        `<span class="mih-need-lbl">${st.name}</span>` +
        `<div class="mih-need-bar"><div class="mih-need-fill ${fill}" style="width:${st.pct}%"></div></div>` +
        `<span class="mih-need-pct">${st.fuel.toFixed(1)}L</span>` +
      `</div>` +
    `</div>`;
  };

  MapInfoHUD.prototype._refresh = function () {
    if (!this._el) return;
    const mode = this._activeMode();
    if (!mode) return;
    const actor = $gameActors.actor(1);

    // Median of every tracked need across the whole party.
    let needs;
    if (actor) {
      needs = window.PartyNeeds.partyMedian();
      this._cachedNeeds = needs;
    } else {
      needs = this._cachedNeeds || { hunger: 100, sleep: 100, hygiene: 100, social: 100, leisure: 100 };
    }

    const dt = getDateTimeFromMinutes(getGameTimeMinutes());
    let html = '';

    if (mode === 'clock') {
      // Waiting, sleeping, in cryo, or working a shift: there is no location to
      // report, but the hours are running and the party is living through them,
      // so the card leads with the clock and keeps the needs underneath it -
      // the whole point of stepping those sequences frame by frame is that the
      // bars can be watched moving.
      html =
        `<div class="mih-datetime"><span class="mih-star">&#9733;</span>${dt.dateShort}</div>` +
        `<div class="mih-datetime"><span class="mih-star">&#9733;</span>${dt.time24}</div>` +
        this._food() +
        this._insomnia(needs) +
        this._vitals(needs);
    } else if (mode === 'world') {
      const loc = this._getBiomeName();
      const ci = this._getCountryInfo();
      let countryHtml = '';
      if (ci && ci.country) {
        countryHtml =
          `<div class="mih-region">` +
            `<span class="mih-region-lbl">${ci.country}</span>` +
            (ci.controller ? `<span class="mih-region-val">${ci.controller}</span>` : '') +
          `</div>`;
      }
      html =
        `<div class="mih-datetime"><span class="mih-star">&#9733;</span>${dt.dateShort} ${dt.time24}</div>` +
        `<div class="mih-location">${loc}</div>` +
        countryHtml +
        this._enemyLevel() +
        this._temperature() +
        this._food() +
        this._insomnia(needs) +
        this._vitals(needs) +
        this._fuel();
    } else {
      // 'travel': inside a vehicle's interior, racing a fast-travel timer.
      // There is no world tile to read a biome/country off, so the card
      // leads with the countdown instead of a location.
      html =
        `<div class="mih-datetime"><span class="mih-star">&#9733;</span>${dt.dateShort} ${dt.time24}</div>` +
        this._temperature() +
        this._food() +
        this._insomnia(needs) +
        this._vitals(needs) +
        this._fuel();
    }

    // Only touch the DOM when the built HTML actually differs from what's shown.
    if (html !== this._lastHtml) {
      this._lastHtml = html;
      this._el.innerHTML = html;
    }
  };

  // Cached food reserve (see MapInfoHUD._foodReserve); invalidated whenever the
  // party's item stock changes.
  let _foodReserveCache = null;
  const _Game_Party_gainItem_TDS = Game_Party.prototype.gainItem;
  Game_Party.prototype.gainItem = function (item, amount, includeEquip) {
    _Game_Party_gainItem_TDS.call(this, item, amount, includeEquip);
    _foodReserveCache = null;
  };

  // Hook: create the HUD on every map. What it actually shows (or whether it
  // shows at all) is decided live, frame to frame, by MapInfoHUD._activeMode -
  // it has to exist everywhere so waiting/sleeping/cryo/work, which can start
  // on any ordinary map, can still reach it and tick it in real time.
  const _Scene_Map_createAllWindows_TDS = Scene_Map.prototype.createAllWindows;
  Scene_Map.prototype.createAllWindows = function () {
    _Scene_Map_createAllWindows_TDS.call(this);
    this.createHungerSleepOverlay();
  };

  Scene_Map.prototype.createHungerSleepOverlay = function () {
    this._mapInfoHUD = new MapInfoHUD();
  };

  // Hook: update HUD each frame (also drives the sleep/cryo sequences below)
  const _Scene_Map_update_TDS_HUD = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_TDS_HUD.call(this);
    if (this._mapInfoHUD) this._mapInfoHUD.update();
    this.updateSleepSequence();
    this.updateWaitSequence();
    this.updateCryoSequence();
  };

  // Hook: destroy HUD when leaving the scene
  const _Scene_Map_terminate_TDS = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function () {
    const dim = document.getElementById("wait-dim");
    if (dim && dim.parentNode) dim.parentNode.removeChild(dim);
    if (this._mapInfoHUD) {
      this._mapInfoHUD.destroy();
      this._mapInfoHUD = null;
    }
    _Scene_Map_terminate_TDS.call(this);
  };

  //=============================================================================
  // Sleep Menu, business logic only.
  // The parchment DOM popup lives in TimeDateSystemUI.js, which defines
  // Scene_Map.prototype.openSleepMenu / closeSleepMenu / execSleepMenuCommand.
  //=============================================================================

  // A rest longer than DREAM_MIN_HOURS has a DREAM_CHANCE of ending in the
  // Dream / Cancel prompt instead of waking up straight away.
  const DREAM_MIN_HOURS = 5;
  const DREAM_CHANCE = 0.5;

  Scene_Map.prototype.setSleepRespawnPoint = function () {
    $gameVariables.setValue(112, $gameVariables.value(86)); // RespawnCountryID = CurrentCountryID
    $gameVariables.setValue(25, $gameMap.mapId());          // RespawnMapID
    $gameVariables.setValue(26, $gamePlayer.x);             // RespawnX
    $gameVariables.setValue(27, $gamePlayer.y);             // RespawnY
    // A camp made out on the procedural map: the map id (636) is the whole
    // world, so the square being slept on is recorded with the tile, otherwise
    // waking up dead somewhere else would come back to the wrong one. Null when
    // the party sleeps on any authored map, which clears a stale wild camp.
    $gameSystem._respawnProcSurface =
        (window.WorldMapReturn && window.WorldMapReturn.snapshotProcRespawn)
            ? window.WorldMapReturn.snapshotProcRespawn() : null;
    // Mark that a respawn point has been explicitly set, so the death system
    // does not treat the new-game default respawn vars as a real respawn.
    $gameSystem._respawnPointSet = true;
  };

  // Standard sleep sequence (beds/inns): fades the screen, heals the party, restores sleep meter.
  Scene_Map.prototype.startSleepSequence = function (hours, isWait) {
    if (isWait) {
      this.startWaitSequence(hours);
      return;
    }
    $gameScreen.startFadeOut(60);
    this._sleepSequenceState = 1;
    this._sleepSequenceTimer = 60;
    this._sleepHours = hours;
    this._sleepIsWait = false;
  };

  // The light dim drawn under the DOM HUDs while waiting.
  function showWaitDim(on) {
    let el = document.getElementById("wait-dim");
    if (on) {
      if (!el) {
        el = document.createElement("div");
        el.id = "wait-dim";
        document.body.appendChild(el);
      }
      // A frame between insertion and the class so the fade actually plays.
      setTimeout(() => {
        const node = document.getElementById("wait-dim");
        if (node) node.classList.add("wait-dim-visible");
      }, 16);
      return;
    }
    if (!el) return;
    el.classList.remove("wait-dim-visible");
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 400);
  }

  // Live on-map waiting: no fade to black, only a light dim over the map.
  // Time-of-day lighting,
  // NPCs, cars, enemies, and autonomous party members move and simulate at super speed.
  Scene_Map.prototype.startWaitSequence = function (hours) {
    if (this.closeSleepMenu) this.closeSleepMenu(true);
    // The timelapse is a flourish, not a wait: a whole day used to run for
    // 2160 frames (36 real seconds) of accelerated map updates, which reads as
    // a hung game. Every wait now lands inside a fixed window whatever it
    // covers, so half an hour and a full day both finish in a couple of seconds.
    const FRAMES_PER_HOUR = 20;
    const MIN_WAIT_FRAMES = 30;
    const MAX_WAIT_FRAMES = 150;
    const totalMinutes = hours * 60;
    const totalFrames = Math.max(
      MIN_WAIT_FRAMES,
      Math.min(MAX_WAIT_FRAMES, Math.round(hours * FRAMES_PER_HOUR))
    );
    const startTime = getGameTimeMinutes();
    const leader = $gameParty.leader();
    const sleepStart = leader ? leader._sleep : 0;

    if ($gameTemp) {
      $gameTemp._isWaitingFastForward = true;
    }

    // The map dims behind the travel card while the hours run, and only the
    // map: the dim layer sits above the game canvas but under every DOM HUD.
    showWaitDim(true);

    this._waitAdvance = {
      hours: hours,
      totalMinutes: totalMinutes,
      totalFrames: totalFrames,
      doneMinutes: 0,
      minutesPerFrame: totalMinutes / totalFrames,
      startTime: startTime,
      nextNpcTick: startTime + 60,
      sleepStart: sleepStart,
      sleepTarget: leader ? Math.max(0, sleepStart - (maxSleep * 0.0004) * totalMinutes) : 0,
    };
  };

  Scene_Map.prototype.updateWaitSequence = function () {
    if (this._waitAdvance) {
      this._stepWaitAdvance();
    }
  };

  // A sequence that throws mid-step would otherwise leave the map locked in
  // fast-forward (or, for sleep, faded out) with nothing left to finish it, so
  // every step runs behind a guard: any error, or a run that overshoots the
  // frame budget it was built with, ends the sequence cleanly instead.
  const ADVANCE_FRAME_SLACK = 4;

  Scene_Map.prototype._stepWaitAdvance = function () {
    const a = this._waitAdvance;
    if (!a) { this._finishWaitAdvance(); return; }
    a.framesRun = (a.framesRun || 0) + 1;
    if (a.framesRun > (a.totalFrames || 150) * ADVANCE_FRAME_SLACK) {
      this._finishWaitAdvance();
      return;
    }
    try {
      this._stepWaitAdvanceBody(a);
    } catch (e) {
      console.error("TimeDateSystem: wait sequence step failed", e);
      this._finishWaitAdvance();
    }
  };

  Scene_Map.prototype._stepWaitAdvanceBody = function (a) {

    const prevDone = a.doneMinutes;
    a.doneMinutes = Math.min(a.totalMinutes, a.doneMinutes + a.minutesPerFrame);
    const deltaMin = a.doneMinutes - prevDone;
    const currentTime = a.startTime + a.doneMinutes;

    // Advance the displayed clock/date.
    setGameTimeMinutes(Math.floor(currentTime));
    updateGameDateVariable();

    // Run NPC schedules for the simulated hours we cross during waiting, a
    // bounded few per frame so a long wait can never stall on them.
    runNpcTicksUpTo(a, currentTime, 2);

    // Party needs degradation
    const leader = $gameParty.leader();
    if (leader) {
      leader.reduceHunger((maxHunger * 0.0003) * deltaMin);
      if (leader.reduceHygiene) leader.reduceHygiene((maxSleep * 0.0005) * deltaMin);
      if (leader.reduceSocial)  leader.reduceSocial((maxSleep * 0.0003) * deltaMin);
      if (leader.reduceLeisure) leader.reduceLeisure((maxSleep * 0.0003) * deltaMin);
      const frac = a.totalMinutes > 0 ? a.doneMinutes / a.totalMinutes : 1;
      leader._sleep = a.sleepStart + (a.sleepTarget - a.sleepStart) * frac;
    }

    if (window.AddictionSystem) {
      window.AddictionSystem.advanceMinutes(deltaMin, CRAVING_SLEEP_FACTOR);
    }

    // Accelerated Map Simulation: extra updates per frame so events, cars, enemies & followers zoom
    if ($gameMap) {
      const events = $gameMap.events();
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          if (ev && !ev._erased) {
            ev.update();
          }
        }
        if ($gamePlayer && $gamePlayer.followers()) {
          $gamePlayer.followers().update();
        }
        if (window.AutoIdle && window.AutoIdle.loose) {
          try { window.AutoIdle.loose.update(); } catch (_) {}
        }
      }
    }

    // Weather and the day/night tint are part of the hours passing, so they are
    // recomputed on every tick rather than left to the once-per-in-game-minute
    // gate in the weather system's own update.
    if (window.$gameWeather) {
      try {
        $gameWeather.updateTimeAndWeather();
        $gameWeather.updateTimeOfDayTint(true);
      } catch (_) {}
    }

    // Push the new state to the bottom-right card immediately this frame.
    if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
      this._mapInfoHUD._refresh();
    }

    if (a.doneMinutes >= a.totalMinutes) {
      this._finishWaitAdvance();
    }
  };

  Scene_Map.prototype._finishWaitAdvance = function () {
    showWaitDim(false);

    const a = this._waitAdvance;
    this._waitAdvance = null;

    // The clock and the fast-forward flag are settled first and inside a guard:
    // whatever else goes wrong, the map must not be left running at speed.
    try {
      if (a) {
        const endTime = a.startTime + a.totalMinutes;
        setGameTimeMinutes(endTime);
        updateGameDateVariable();
        runNpcTicksUpTo(a, endTime, 12);
        if (window.NPCLifeSim?.catchUp) {
          try { window.NPCLifeSim.catchUp(endTime); } catch (_) {}
        }
      }
    } catch (e) {
      console.error("TimeDateSystem: wait sequence finish failed", e);
    }

    if ($gameTemp) {
      $gameTemp._isWaitingFastForward = false;
      // Waiting closed its popup with the block kept on (nobody walks off
      // mid-timelapse); this is the point where the player gets moving again.
      $gameTemp._sleepMenuOpen = false;
    }

    // Weather and the day/night tint are part of the hours passing, so they are
    // recomputed on every tick rather than left to the once-per-in-game-minute
    // gate in the weather system's own update.
    if (window.$gameWeather) {
      try {
        $gameWeather.updateTimeAndWeather();
        $gameWeather.updateTimeOfDayTint(true);
      } catch (_) {}
    }

    // Gather loose followers back to leader
    if (window.AutoIdle && window.AutoIdle.loose) {
      try {
        window.AutoIdle.loose.resetStates();
        window.AutoIdle.loose.gatherNear();
      } catch (_) {}
    }

    if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
      this._mapInfoHUD._refresh();
    }
  };

  // Boost character movement speeds during waiting fast-forward so they zoom across the map
  const _Game_CharacterBase_realMoveSpeed_TDS_wait = Game_CharacterBase.prototype.realMoveSpeed;
  Game_CharacterBase.prototype.realMoveSpeed = function () {
    const speed = _Game_CharacterBase_realMoveSpeed_TDS_wait.call(this);
    if (typeof $gameTemp !== "undefined" && $gameTemp && $gameTemp._isWaitingFastForward && this !== $gamePlayer) {
      return Math.max(speed, 5.0);
    }
    return speed;
  };

  Scene_Map.prototype.updateSleepSequence = function () {
    if (this._sleepSequenceState) {
      if (this._sleepSequenceTimer > 0) {
        this._sleepSequenceTimer--;
        return;
      }

      switch (this._sleepSequenceState) {
        case 1:
          if (!this._sleepIsWait) {
            AudioManager.playMe({ name: "Inn1", volume: 90, pitch: 100, pan: 0 });
          }
          this._beginSleepAdvance(this._sleepHours, this._sleepIsWait);
          this._sleepSequenceState = 2;
          break;

        case 2:
          // Advance one slice of the night per frame so the map-info HUD ticks
          // the clock and need bars in real time instead of jumping all at once.
          this._stepSleepAdvance();
          break;
      }
    }
  };

  // Set up the frame-by-frame sleep advance. The night is spread over a fixed
  // number of frames so the HUD animates regardless of how many hours are slept.
  Scene_Map.prototype._beginSleepAdvance = function (hours, isWait) {
    const FRAMES = 45;
    const totalMinutes = hours * 60;
    const startTime = getGameTimeMinutes();
    const leader = $gameParty.leader();
    const sleepStart = leader ? leader._sleep : 0;
    this._sleepAdvance = {
      isWait: !!isWait,
      hours: hours,
      totalMinutes: totalMinutes,
      totalFrames: FRAMES,
      doneMinutes: 0,
      minutesPerFrame: FRAMES > 0 ? totalMinutes / FRAMES : totalMinutes,
      startTime: startTime,
      // NPC schedules still tick once per simulated hour as the night passes.
      nextNpcTick: startTime + 60,
      sleepStart: sleepStart,
      // Sleeping always wakes the party fully rested, whatever wake-up hour was
      // picked. Waiting is time spent awake: the sleep meter drains with the
      // hours instead of filling, at the same rate the other needs wear down.
      sleepTarget: leader
        ? (isWait
            ? Math.max(0, sleepStart - (maxSleep * 0.0004) * totalMinutes)
            : maxSleep)
        : 0,
    };
  };

  Scene_Map.prototype._stepSleepAdvance = function () {
    const a = this._sleepAdvance;
    if (!a) { this._finishSleepAdvance(); return; }
    a.framesRun = (a.framesRun || 0) + 1;
    if (a.framesRun > (a.totalFrames || 45) * ADVANCE_FRAME_SLACK) {
      this._finishSleepAdvance();
      return;
    }
    try {
      this._stepSleepAdvanceBody(a);
    } catch (e) {
      console.error("TimeDateSystem: sleep sequence step failed", e);
      this._finishSleepAdvance();
    }
  };

  Scene_Map.prototype._stepSleepAdvanceBody = function (a) {

    const prevDone = a.doneMinutes;
    a.doneMinutes = Math.min(a.totalMinutes, a.doneMinutes + a.minutesPerFrame);
    const deltaMin = a.doneMinutes - prevDone;
    const currentTime = a.startTime + a.doneMinutes;

    // Advance the displayed clock/date.
    setGameTimeMinutes(Math.floor(currentTime));
    updateGameDateVariable();

    // Run NPC schedules for the simulated hours we cross during the night, a
    // bounded few per frame so a long sleep never stalls on them.
    runNpcTicksUpTo(a, currentTime, 2);

    // The body keeps working while asleep: hunger and the social/hygiene/fun
    // meters wear down over the slept minutes while the sleep meter fills.
    const leader = $gameParty.leader();
    if (leader) {
      leader.reduceHunger((maxHunger * 0.0003) * deltaMin);
      if (leader.reduceHygiene) leader.reduceHygiene((maxSleep * 0.0005) * deltaMin);
      if (leader.reduceSocial)  leader.reduceSocial((maxSleep * 0.0003) * deltaMin);
      if (leader.reduceLeisure) leader.reduceLeisure((maxSleep * 0.0003) * deltaMin);
      const frac = a.totalMinutes > 0 ? a.doneMinutes / a.totalMinutes : 1;
      leader._sleep = a.sleepStart + (a.sleepTarget - a.sleepStart) * frac;
    }

    // A craving keeps building through the night, more slowly, which is why an
    // addict can wake into a withdrawal they went to bed clear of.
    if (window.AddictionSystem) {
      window.AddictionSystem.advanceMinutes(deltaMin, CRAVING_SLEEP_FACTOR);
    }

    // Push the new state to the bottom-right card immediately this frame.
    if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
      this._mapInfoHUD._refresh();
    }

    if (a.doneMinutes >= a.totalMinutes) {
      this._finishSleepAdvance();
    }
  };

  Scene_Map.prototype._finishSleepAdvance = function () {
    const a = this._sleepAdvance;
    this._sleepAdvance = null;

    if (a) {
      // Snap the clock to the exact wake time and finish any remaining hourly
      // NPC ticks, then resolve background life events across the whole night.
      // Guarded: the screen is faded out at this point, so an error here must
      // not stop the wake-up below from fading it back in.
      try {
        const endTime = a.startTime + a.totalMinutes;
        setGameTimeMinutes(endTime);
        updateGameDateVariable();
        runNpcTicksUpTo(a, endTime, 12);
        if (window.NPCLifeSim?.catchUp) {
          try { window.NPCLifeSim.catchUp(endTime); } catch (_) {}
        }
      } catch (e) {
        console.error("TimeDateSystem: sleep sequence finish failed", e);
      }
    }

    // Waiting only burns the clock: no healing, no awakening menu, just fade
    // back in where the party was standing.
    if (a && a.isWait) {
      if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
        this._mapInfoHUD._refresh();
      }
      if (this.closeSleepMenu) this.closeSleepMenu();
      $gameScreen.startFadeIn(60);
      this._sleepSequenceState = 0;
      this._sleepIsWait = false;
      return;
    }

    // Restorative effects. The sleep meter was already filled gradually above;
    // recoverAll() only touches HP/MP/states, so it leaves it intact. Healing
    // reaches into Health_Core and the insomnia clock, so it is guarded too:
    // a black screen the player cannot leave is worse than a missed heal.
    try {
      $gameParty.members().forEach(actor => actor.recoverAll());

      // The one thing that stops the insomnia clock, and takes the mind back
      // off whatever it had started doing without one.
      if (window.Insomnia) window.Insomnia.markSlept();

      // A night's sleep sets every bone: each member's broken parts are put
      // back whole and the penalties they owed lift with them. Blood and Oil
      // keeps what it took - a part cut off or ruined there never grows back.
      PluginManager.callCommand(this, "Health_Core", "HealBodyParts", {});

      $gameParty.members().forEach(actor => {
        actor.gainMp(9999);
        actor.gainTp(100);
      });

      if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
        this._mapInfoHUD._refresh();
      }
    } catch (e) {
      console.error("TimeDateSystem: waking the party failed", e);
    }

    // Long rests sometimes drop the party into a dream: the awakening menu is
    // the Dream / Cancel prompt, and it only shows up on that roll. Every other
    // sleep just fades back in on the spot.
    const sleptHours = a ? a.hours : 0;
    let dreamed = false;
    if (sleptHours > DREAM_MIN_HOURS && Math.random() < DREAM_CHANCE && this.openSleepMenu) {
      try {
        this.openSleepMenu("post_sleep");
        dreamed = !!this._sleepMenuEl;
      } catch (e) {
        console.error("TimeDateSystem: dream prompt failed", e);
      }
    }
    if (!dreamed) {
      if (this.closeSleepMenu) this.closeSleepMenu();
      $gameScreen.startFadeIn(60);
    }
    this._sleepSequenceState = 0;
  };

  //=============================================================================
  // Cryogenic sleep sequence. Twenty real seconds, start to finish, whether the
  // pod is skipping four days or eleven years: the lid closes, the travel
  // screen runs the calendar forward while the world outside is simulated in
  // slices, and the party is put back exactly as it went in. Driven by the
  // SleepMenu UI (cryo_confirm).
  //=============================================================================

  // 1200 frames at 60fps. The three stretches add up to the whole window, so
  // the wait is the same length however far the pod travels.
  const CRYO_INTRO_FRAMES = 66;    // the lid closes and the map fades out
  const CRYO_WAKE_FRAMES = 174;    // thawing, with the wake panel up
  const CRYO_TRAVEL_FRAMES = 960;  // the years running
  // The three ways a body answers being brought back up to temperature.
  const CRYO_WAKE_STATES = [41 /* Nausea */, 8 /* Confusion */, 26 /* Cold */];

  // Everything the pod holds still. The world outside is simulated in full, so
  // the only way the party can come out of the gap untouched is to be put back
  // exactly as it went in: HP, MP, TP, states and their turn counts, every need
  // and craving, illnesses, body parts, biology, the lot.
  function snapshotPartyState() {
    if (!window.$gameParty) return null;
    return $gameParty.members().map((actor) => ({
      id: actor.actorId(),
      data: JsonEx.stringify(actor),
    }));
  }

  function restorePartyState(snapshot, deltaMinutes) {
    if (!snapshot) return;
    for (const entry of snapshot) {
      const actor = $gameActors.actor(entry.id);
      if (!actor) continue;
      let frozen;
      try { frozen = JsonEx.parse(entry.data); } catch (_) { continue; }
      // Written back onto the living actor rather than swapped in for it, so
      // every reference the scene, the HUD and the party already hold stays
      // pointed at the same object.
      for (const key of Object.keys(actor)) {
        if (!(key in frozen)) delete actor[key];
      }
      for (const key of Object.keys(frozen)) actor[key] = frozen[key];
      shiftFrozenTimestamps(actor, deltaMinutes);
      actor.refresh();
    }
  }

  // A frozen body still has to come out of the pod into the year it woke in.
  // Anything the biology measures as "how long since" is carried forward with
  // the clock, or a pregnancy conceived the week before going under would read
  // as eleven years overdue the moment the lid opens.
  function shiftFrozenTimestamps(actor, deltaMinutes) {
    const deltaDays = deltaMinutes / MINUTES_PER_DAY;
    const uterus = actor._uterusData;
    if (uterus) {
      for (const key of ["conceptionDate", "dueDate", "lastStatusCheck", "lastCycleUpdate"]) {
        if (typeof uterus[key] === "number") uterus[key] += deltaDays;
      }
    }
    // Guarded on magnitude: the same field is written as a game-day stamp in
    // one place and as a real-clock Date.now() in another, and only the first
    // means anything to the game calendar.
    const testes = actor.testesData;
    if (testes && typeof testes.lastUpdate === "number" && testes.lastUpdate < 1e6) {
      testes.lastUpdate += deltaDays;
    }
    for (const list of [actor._diseases, actor._conditions]) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (entry && typeof entry.sinceMin === "number" && entry.sinceMin > 0) {
          entry.sinceMin += deltaMinutes;
        }
      }
    }
  }

  // Nobody walks out of a pod clean. Each member rolls for each of the three,
  // more likely the longer they were under, and anyone who dodges all three
  // still takes one: the thaw is always felt.
  function applyCryoWakeStates(days) {
    const chance = Math.min(0.75, 0.35 + (days / 365) * 0.35);
    for (const actor of $gameParty.members()) {
      let taken = 0;
      for (const stateId of CRYO_WAKE_STATES) {
        if (Math.random() < chance) { actor.addState(stateId); taken++; }
      }
      if (!taken) {
        actor.addState(CRYO_WAKE_STATES[Math.floor(Math.random() * CRYO_WAKE_STATES.length)]);
      }
    }
  }

  // opts: { cost, days, wakeDate } , the fare to charge, the nights being paid
  // for and the {year, month, day} the pod is set to open on.
  Scene_Map.prototype.startCryoSequence = function (minutes, opts) {
    const o = opts || {};
    const cost = Math.max(0, Math.round(Number(o.cost) || 0));
    if (cost > 0 && window.$gameParty) $gameParty.loseGold(cost);

    const startTime = getGameTimeMinutes();
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    this._cryo = {
      frame: 0,
      startTime: startTime,
      totalMinutes: total,
      doneMinutes: 0,
      minutesPerFrame: total / CRYO_TRAVEL_FRAMES,
      // NPC schedules tick per simulated hour on a short freeze and once a
      // frame on a long one, so a four-day sleep is as detailed as it was and
      // an eleven-year one still costs a bounded number of passes.
      npcTickStep: Math.max(60, total / CRYO_TRAVEL_FRAMES),
      nextNpcTick: startTime + 60,
      days: Math.max(0, Math.round(Number(o.days) || 0)),
      cost: cost,
      snapshot: snapshotPartyState(),
    };
    this._cryo.nextNpcTick = startTime + this._cryo.npcTickStep;

    $gameScreen.startFadeOut(CRYO_INTRO_FRAMES);
    this._cryoSequenceState = 1;
    if (this.openCryoTravelScreen) {
      this.openCryoTravelScreen({
        startTime: startTime,
        totalMinutes: total,
        days: this._cryo.days,
        cost: cost,
      });
    }
  };

  Scene_Map.prototype.updateCryoSequence = function () {
    if (!this._cryoSequenceState) return;
    const a = this._cryo;
    if (!a) { this._cryoSequenceState = 0; return; }
    a.frame++;

    switch (this._cryoSequenceState) {
      case 1:
        if (a.frame >= CRYO_INTRO_FRAMES) {
          AudioManager.playMe({ name: "Inn1", volume: 90, pitch: 100, pan: 0 });
          this._cryoSequenceState = 2;
          a.frame = 0;
        }
        break;

      case 2:
        this._stepCryoTravel();
        break;

      case 3:
        if (a.frame >= CRYO_WAKE_FRAMES) this._finishCryoSequence();
        break;
    }
  };

  // One frame of the gap: the clock moves its slice, and every delta engine in
  // the world is asked to catch up to it. They each resolve what happened since
  // they last ran, so spreading the calls over the travel window spreads the
  // work with them instead of locking the game up on one enormous pass.
  Scene_Map.prototype._stepCryoTravel = function () {
    const a = this._cryo;
    a.doneMinutes = Math.min(a.totalMinutes, a.doneMinutes + a.minutesPerFrame);
    const currentTime = a.startTime + a.doneMinutes;

    setGameTimeMinutes(Math.floor(currentTime));
    updateGameDateVariable();

    // One NPC schedule pass a frame at most, so a long freeze costs a bounded
    // number of them however many simulated hours a single frame covers.
    if (a.nextNpcTick <= currentTime) {
      if (window.NPCSim?.tick) {
        try { window.NPCSim.tick(a.nextNpcTick); } catch (_) {}
      }
      a.nextNpcTick = Math.max(a.nextNpcTick + a.npcTickStep, currentTime + 1);
    }

    // The background simulations: lives, politics, the settlement pulse and the
    // continental epidemics. Each is a delta engine that no-ops on a sub-day
    // step, so a short freeze reaches them a handful of times and a long one
    // every frame.
    const worldNow = Math.floor(currentTime);
    if (window.NPCLifeSim?.catchUp) { try { window.NPCLifeSim.catchUp(worldNow); } catch (_) {} }
    if (window.NPCPolitics?.catchUp) { try { window.NPCPolitics.catchUp(worldNow); } catch (_) {} }
    if (window.NPCWorldWeb?.catchUp) { try { window.NPCWorldWeb.catchUp(worldNow); } catch (_) {} }
    if (window.EpidemicSystem?.catchUp) { try { window.EpidemicSystem.catchUp(worldNow); } catch (_) {} }
    // The world's own chronicle: a day the party slept through is still a day
    // that happened, and the assembly still sat on the Monday inside it.
    if (window.HistoryManager?.catchUpLiveHistory) {
      try { window.HistoryManager.catchUpLiveHistory(worldNow); } catch (_) {}
    }
    if (window.ONUAssembly?.catchUpSessions) {
      try { window.ONUAssembly.catchUpSessions(worldNow); } catch (_) {}
    }

    if (this.updateCryoTravelScreen) {
      this.updateCryoTravelScreen({
        minute: worldNow,
        elapsed: a.doneMinutes,
        total: a.totalMinutes,
      });
    }

    if (a.frame >= CRYO_TRAVEL_FRAMES || a.doneMinutes >= a.totalMinutes) {
      this._thawCryoParty();
    }
  };

  // The lid opens. The clock is snapped to the exact wake moment, the world
  // gets its last catch-up pass, and the party is put back the way it went in.
  Scene_Map.prototype._thawCryoParty = function () {
    const a = this._cryo;
    const endTime = a.startTime + a.totalMinutes;
    setGameTimeMinutes(endTime);
    updateGameDateVariable();

    if (window.NPCSim?.tick) { try { window.NPCSim.tick(endTime); } catch (_) {} }
    if (window.NPCLifeSim?.catchUp) { try { window.NPCLifeSim.catchUp(endTime); } catch (_) {} }
    if (window.NPCPolitics?.catchUp) { try { window.NPCPolitics.catchUp(endTime); } catch (_) {} }
    if (window.NPCWorldWeb?.catchUp) { try { window.NPCWorldWeb.catchUp(endTime); } catch (_) {} }
    if (window.EpidemicSystem?.catchUp) { try { window.EpidemicSystem.catchUp(endTime); } catch (_) {} }
    if (window.HistoryManager?.catchUpLiveHistory) {
      try { window.HistoryManager.catchUpLiveHistory(endTime); } catch (_) {}
    }
    if (window.ONUAssembly?.catchUpSessions) {
      try { window.ONUAssembly.catchUpSessions(endTime); } catch (_) {}
    }

    // Preservation, not treatment: nothing is healed, nothing is fed, nothing
    // wears down. Whatever the party was carrying is still on it.
    restorePartyState(a.snapshot, a.totalMinutes);
    a.snapshot = null;
    // The body did not lie awake through the gap, so the insomnia clock is not
    // owed the years either.
    if (window.Insomnia) window.Insomnia.markSlept();
    applyCryoWakeStates(a.days);

    if (this._mapInfoHUD && this._mapInfoHUD._refresh) {
      this._mapInfoHUD._refresh();
    }
    if (this.showCryoWakeScreen) this.showCryoWakeScreen({ minute: endTime });

    this._cryoSequenceState = 3;
    a.frame = 0;
  };

  Scene_Map.prototype._finishCryoSequence = function () {
    if (this.closeCryoTravelScreen) this.closeCryoTravelScreen();
    $gameScreen.startFadeIn(60);
    $gameTemp._sleepMenuOpen = false;
    this._cryoSequenceState = 0;
    this._cryo = null;
  };

  const _Game_Temp_initialize_sleep = Game_Temp.prototype.initialize;
  Game_Temp.prototype.initialize = function () {
    _Game_Temp_initialize_sleep.call(this);
    this._sleepMenuOpen = false;
  };

  const _Game_Player_canMove = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function () {
    if ($gameTemp._sleepMenuOpen) return false;
    return _Game_Player_canMove.call(this);
  };

  //=============================================================================
  // Day / night lighting solve
  //
  // The clock is the only thing that knows what time it is, so it is also the
  // thing that answers "what does the light look like right now". The answer is
  // pure numbers (colours, a direction, intensities) with no renderer in sight:
  // the 3D battle scene and the first person weapon overlay each build their own
  // three.js rig from it, so one curve drives both and they can never disagree.
  //
  // Everything below the marker comments is lifted verbatim by
  // test/test_daynight_lighting.js, so it must stay self contained.
  // --- daynight-solver:begin ---
  function ddnLerp(a, b, t) { return a + (b - a) * t; }

  function ddnMixColor(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((Math.round(ddnLerp(ar, br, t)) << 16) |
            (Math.round(ddnLerp(ag, bg, t)) << 8) |
             Math.round(ddnLerp(ab, bb, t))) >>> 0;
  }

  // Sampled, not bucketed: the light slides through dawn and dusk instead of
  // stepping, which is what makes a shadow crawl across the field rather than
  // jump. Daylight and deep night are near flat stretches, so the interesting
  // keyframes are packed around the two horizons.
  const DDN_KEYFRAMES = [
    { h: 0.0,  key: 0x4a5c8c, ki: 0.22, sky: 0x1b2440, gnd: 0x0d1018, ai: 0.30, sh: 0.20 },
    { h: 4.5,  key: 0x53608f, ki: 0.26, sky: 0x2a3358, gnd: 0x141826, ai: 0.32, sh: 0.22 },
    { h: 6.0,  key: 0xd98a5a, ki: 0.55, sky: 0x6b6d94, gnd: 0x3b3348, ai: 0.42, sh: 0.34 },
    { h: 7.5,  key: 0xffb877, ki: 0.95, sky: 0x9fb6d8, gnd: 0x6b5f52, ai: 0.50, sh: 0.56 },
    { h: 12.0, key: 0xfff6e2, ki: 1.15, sky: 0xbcd6f5, gnd: 0x8d8577, ai: 0.58, sh: 0.72 },
    { h: 16.5, key: 0xffdca8, ki: 1.00, sky: 0xaec8ea, gnd: 0x87786a, ai: 0.54, sh: 0.64 },
    { h: 18.5, key: 0xff9247, ki: 0.62, sky: 0x8a7fa4, gnd: 0x4d3f4a, ai: 0.44, sh: 0.38 },
    { h: 20.0, key: 0x6a6396, ki: 0.30, sky: 0x333a63, gnd: 0x1a1c2c, ai: 0.34, sh: 0.23 },
    { h: 24.0, key: 0x4a5c8c, ki: 0.22, sky: 0x1b2440, gnd: 0x0d1018, ai: 0.30, sh: 0.20 },
  ];

  // Indoors the sky is a ceiling: one warm lamp almost overhead, no horizon
  // colour and a short soft shadow, held steady whatever the clock says.
  const DDN_INTERIOR = {
    key: 0xffe9c8, ki: 0.62, sky: 0x5b554b, gnd: 0x2a2622, ai: 0.52, sh: 0.34,
  };

  function solveDayNightLight(hourFloat, opts) {
    opts = opts || {};
    let h = Number(hourFloat);
    if (!isFinite(h)) h = 12;
    h = ((h % 24) + 24) % 24;

    // The sun and the moon ride the same arc twelve hours apart, so one sweep
    // covers both: 0 at 06:00 rising in the east, 1 at 18:00 setting in the
    // west, then the moon takes the next lap. That is what walks the shadow
    // across the ground over the course of a day.
    const arc = ((((h - 6) / 12) % 2) + 2) % 2;
    const a = arc < 1 ? arc : arc - 1;
    const elevation = Math.sin(Math.PI * a);
    const night = arc >= 1 ? 1 : Math.max(0, Math.min(1, 1 - elevation * 2.2));

    let dx = Math.cos(Math.PI * a);
    // Never let the key light sink below the floor: a light under the ground
    // plane lights the battlers from beneath and throws the shadow up the
    // screen. It flattens towards the horizon instead.
    let dy = 0.18 + 0.82 * Math.max(0, elevation);
    let dz = 0.45;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= len; dy /= len; dz /= len;

    let kf;
    if (opts.interior) {
      kf = DDN_INTERIOR;
    } else {
      let i = 0;
      while (i < DDN_KEYFRAMES.length - 2 && DDN_KEYFRAMES[i + 1].h <= h) i++;
      const A = DDN_KEYFRAMES[i], B = DDN_KEYFRAMES[i + 1];
      const span = B.h - A.h;
      const t = span > 0 ? (h - A.h) / span : 0;
      kf = {
        key: ddnMixColor(A.key, B.key, t),
        ki: ddnLerp(A.ki, B.ki, t),
        sky: ddnMixColor(A.sky, B.sky, t),
        gnd: ddnMixColor(A.gnd, B.gnd, t),
        ai: ddnLerp(A.ai, B.ai, t),
        sh: ddnLerp(A.sh, B.sh, t),
      };
    }

    let keyColor = kf.key, keyIntensity = kf.ki, shadowOpacity = kf.sh;
    let skyColor = kf.sky, groundColor = kf.gnd, ambientIntensity = kf.ai;

    if (opts.interior) {
      dx = 0.32; dy = 0.90; dz = 0.29;
    }

    // Cloud pulls the key light apart and hands it to the sky: the direct beam
    // fades, the shadow softens away and the ambient picks the difference up,
    // which is why an overcast field reads flat rather than merely darker.
    const overcast = Math.max(0, Math.min(1, Number(opts.overcast) || 0));
    if (overcast > 0) {
      keyColor = ddnMixColor(keyColor, skyColor, overcast * 0.6);
      keyIntensity *= 1 - 0.6 * overcast;
      shadowOpacity *= 1 - 0.85 * overcast;
      ambientIntensity *= 1 + 0.25 * overcast;
    }

    return {
      hour: h,
      night: night,
      elevation: elevation,
      dir: { x: dx, y: dy, z: dz },
      keyColor: keyColor,
      keyIntensity: keyIntensity,
      skyColor: skyColor,
      groundColor: groundColor,
      ambientIntensity: ambientIntensity,
      shadowOpacity: shadowOpacity,
    };
  }
  // --- daynight-solver:end ---

  // How many in game minutes share one lighting answer. The solve is cheap but
  // the rigs downstream are not (a changed light means new uniforms, and a new
  // environment map means a GPU pass), so both sides key off this bucket and do
  // nothing at all on the frames in between. Three minutes is far below what
  // the eye can catch and still collapses a whole battle into a handful of
  // recomputes.
  // The runtime layer, extracted by the same test as the solver above. It is
  // kept free of any direct global reads (the clock and the battle-test flag
  // both arrive as functions from the enclosing plugin scope) so the harness
  // can drive it with stubs.
  // --- daynight-runtime:begin ---
  const DDN_QUANT_MINUTES = 3;
  let _ddnCache = null;
  let _ddnCacheKey = -1;

  function ddnConditions() {
    let interior = false;
    let overcast = 0;
    let forced = '';
    let battleTest = false;
    try {
      // A battle launched straight from the editor has no world around it:
      // the clock reads zero, which is the small hours, and the fight being
      // tested comes up in the dark. Test mode is for looking at the battle,
      // so it gets a clear midday and none of the map's weather.
      if (typeof DataManager !== 'undefined' && DataManager && DataManager.isBattleTest) {
        battleTest = !!DataManager.isBattleTest();
      }
    } catch (e) { /* not running under RMMZ */ }
    if (battleTest) return { interior: false, overcast: 0, forced: '', battleTest: true };
    try {
      // Battle borrows the map's roof: an interior fight is lit by the same
      // lamp the room outside the fight was lit by.
      if (typeof $gameMap !== 'undefined' && $gameMap && $gameMap.isInterior) {
        interior = !!$gameMap.isInterior();
      }
      const w = typeof $gameWeather !== 'undefined' ? $gameWeather : null;
      if (w) {
        if (w.forcedLighting === 'dark' || w.forcedLighting === 'light') forced = w.forcedLighting;
        const type = String(w.currentWeather || w._currentWeather || '').toLowerCase();
        if (/storm|thunder/.test(type)) overcast = 0.85;
        else if (/rain|snow|hail/.test(type)) overcast = 0.65;
        else if (/cloud|fog|mist|overcast/.test(type)) overcast = 0.4;
      }
    } catch (e) { /* asked before the map or the weather exists */ }
    return { interior, overcast, forced, battleTest: false };
  }

  // The one entry point every 3D rig calls, once a frame. Answers from cache
  // unless the clock has moved into a new bucket, and stamps each answer with a
  // `key` so a caller can skip its own work with a single integer compare.
  function getDayNightLight() {
    const minutes = getGameTimeMinutes();
    const c = ddnConditions();
    const bucket = c.battleTest ? 0 : Math.floor(minutes / DDN_QUANT_MINUTES);
    const cacheKey = bucket * 8 + (c.interior ? 4 : 0) +
      (c.forced === 'dark' ? 1 : c.forced === 'light' ? 2 : 0) +
      Math.round(c.overcast * 3) * 65536 + (c.battleTest ? 1048576 : 0);
    if (_ddnCache && cacheKey === _ddnCacheKey) return _ddnCache;

    // A forced lighting override pins the clock rather than the colours, so
    // the direction of the light stays consistent with everything else.
    let hourFloat;
    if (c.battleTest || c.forced === 'light') hourFloat = 12;
    else if (c.forced === 'dark') hourFloat = 0;
    else {
      // Asked of the clock itself, never worked out from elapsed minutes: the
      // epoch is 10:00 on 2001-01-01, not midnight, so minutes-since-start and
      // hour-of-day are ten hours apart. Deriving it here by hand also drifted
      // from the clock the HUD prints across a DST boundary.
      const now = getCurrentDateObj();
      hourFloat = now.getHours() + now.getMinutes() / 60;
    }

    const solved = solveDayNightLight(hourFloat, c);
    solved.key = cacheKey;
    _ddnCacheKey = cacheKey;
    _ddnCache = solved;
    return solved;
  }
  // --- daynight-runtime:end ---

  // Expose globals for use by other plugins
  window.TimeDateSystem = window.TimeDateSystem || {};
  window.TimeDateSystem.getDayNightLight = getDayNightLight;
  window.TimeDateSystem.solveDayNightLight = solveDayNightLight;
  window.TimeDateSystem.maxHunger = maxHunger;
  window.TimeDateSystem.maxSleep = maxSleep;
  // Ceiling shared by the extended needs (Hygiene / Social / Fun).
  window.TimeDateSystem.maxNeed = maxNeed;
  window.TimeDateSystem.getDateTimeFromMinutes = getDateTimeFromMinutes;
  window.TimeDateSystem.getGameTimeMinutes = getGameTimeMinutes;
  // For sequences that run the clock forward themselves, a slice per frame, so
  // the map-info card animates instead of jumping (sleeping, waiting, and the
  // remote work shifts in WorkSystem.js).
  window.TimeDateSystem.setGameTimeMinutes = setGameTimeMinutes;
  window.TimeDateSystem.updateGameDateVariable = updateGameDateVariable;
  // The cryogenic pod, read by the date picker in TimeDateSystemUI.
  window.TimeDateSystem.getCryoDateRange = getCryoDateRange;
  window.TimeDateSystem.getCryoUnavailableReason = getCryoUnavailableReason;
  window.TimeDateSystem.getCryoAdvanceMinutesForDate = getCryoAdvanceMinutesForDate;
  window.TimeDateSystem.getCryoDays = getCryoDays;
  window.TimeDateSystem.getCryoCost = getCryoCost;
  window.TimeDateSystem.getCryoDaysInMonth = cryoDaysInMonth;
  window.TimeDateSystem.getCryoDayStamp = cryoDayStamp;
  window.TimeDateSystem.getCurrentDateObj = getCurrentDateObj;
  // Resolved on every read, so a language switch reaches the rest menu without
  // either plugin holding on to a stale table.
  Object.defineProperty(window.TimeDateSystem, "sleepMenuI18n", {
    get() { return T.obj("TimeDate.sleepMenu"); },
    configurable: true,
  });

  //=============================================================================
  // Game Initialization - Ensure time system is ready
  //=============================================================================

  const _DataManager_createGameObjects = DataManager.createGameObjects;
  DataManager.createGameObjects = function () {
    _DataManager_createGameObjects.call(this);

    // Initialize game time on new game (Variable 114 stores total minutes elapsed).
    // Unset variables read as 0, so seed 0 and always populate the date variable (113).
    if (!$gameVariables.value(gameTimeVariable)) {
      $gameVariables.setValue(gameTimeVariable, 0); // Start at 0 minutes elapsed (8 AM on Jan 1, 2001)
      debug("Game time initialized to 01 JAN 2001 12:00 - normal maps increment by real minutes, map 315 increments by 15 per step");
    }
    updateGameDateVariable();
  };
})();
