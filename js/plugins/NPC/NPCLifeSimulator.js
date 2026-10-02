/*:
 * @target MZ
 * @plugindesc NPC Life Simulator v1.0.0, Persistent time-aware background lives for every map-group NPC
 * @author Omni-Lex
 * @help
 * ============================================================================
 * NPCLifeSimulator, Persistent background life simulation
 * ============================================================================
 * Gives every NPC found within the world's map groups a full, evolving life
 * that keeps moving whenever game time advances, minute by minute or through
 * any time skip (sleep, PassTime, SimulateTime, fast travel):
 *
 *   - A birth date and a birthplace drawn from Destinations.json; birthplace
 *     can differ from the NPC's current home map group, with a tracked
 *     location history of every move in between (and the reason for it).
 *   - A relationship engine: NPCs meet, date, marry, divorce or abandon their
 *     partners as simulated time passes, preferring partners from their own
 *     map group's population.
 *   - Dynamic careers built from Jobs.json: a job history from their first
 *     working year to today, with job changes as they age and retirement in
 *     old age. Convictions can cost an NPC their job.
 *   - Crime & justice built from PresetCrimes.json: honest NPCs keep clean
 *     records; dishonest ones carry generated criminal histories, past
 *     convictions, sentences served (or still being served, off-screen, in
 *     prison), outstanding bounties, and a societal-standing score that all
 *     of it drags down and that slowly recovers once debts are paid.
 *
 * The state lives in $gameSystem._npcLifeRecords, which WorldManager maps to
 * the "lifeRecords" section of the world's npcs.json, so the whole society's
 * biography is shared by every savegame of the world and is flushed to disk
 * immediately after any time skip resolves.
 *
 * Delta processing is O(NPCs) regardless of how much time passed: event
 * counts over the elapsed interval are sampled from per-day rates instead of
 * stepping through each day.
 *
 * Load order:
 *   Core/WorldManager → Core/TimeDateSystem → NPC/NPCSystem
 *   → NPC/NPCSociety → NPC/NPCSimulationCore → NPC/NPCLifeSimulator
 *
 * Modules: this file keeps the constants, helpers, places, population, the
 * life record, the delta engine, catchUp, households, the biography, the
 * plugin commands and the family namespace (NPCLifeSim._internal). The rest
 * lives in NPCLife_Worldview, _Travel, _Family, _Api (the public API below),
 * _Refugees, _Death, _Bands and _Hooks (last: the engine hooks), listed in
 * js/plugins.js right after this file in that order.
 *
 * Public API (window.NPCLifeSim):
 *   catchUp(nowMinute)       , resolve all background life events up to now
 *   ensureLifeRecord(name)   , get-or-create the life record for an NPC
 *   getRecord(name)          , read a life record (null if none)
 *   buildBiography(name)     , readable multi-line biography text
 *
 * @command NPCLife
 * @desc Show the simulated biography of a named NPC.
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 *
 * @command NPCLifeDebug
 * @desc Print the full life record of a named NPC to the console.
 *
 * @arg eventName
 * @text NPC Event Name
 * @type string
 * @default
 *
 * @command NPCLifeCatchUp
 * @desc Force the life simulation to resolve all pending time.
 */

(() => {
  "use strict";

  const pluginName = "NPCLifeSimulator";

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  const MINUTES_PER_DAY    = 1440;
  const MINUTES_PER_YEAR   = 525600;          // 365-day simulation year
  const EPOCH_YEAR         = 2001;            // minute 0 = Jan 1 2001 10:00
  // No NPC the world ever instantiates is a minor. Every birth date is derived
  // by subtracting an age of at least this from the CURRENT in-game year, and
  // records restored from an older world folder are pushed back to match.
  const MIN_NPC_AGE        = 18;
  const SKIP_FLUSH_MINUTES = 360;             // deltas >= 6h count as a "time skip" → flush npcs.json
  const MAX_NEW_RECORDS_PER_PASS = 400;       // bound record creation per catch-up
  const LIFE_EVENT_CAP     = 60;              // rolling per-NPC life event log

  // Per-day event rates (scaled by per-NPC factors at runtime)
  const RATES = {
    startDating:   1 / 240,                   // singles: ~once every 8 months
    marry:         1 / 160,                   // dating couples (after courtship)
    breakup:       1 / 320,                   // dating couples drift apart
    divorce:       1 / (365 * 18),            // married couples, baseline
    jobChange:     1 / (365 * 3),             // employed NPCs
    findJob:       1 / 45,                    // unemployed NPCs
    crimeBase:     1 / 140,                   // fully dishonest NPC, scaled down by honesty
    shopping:      1 / 2.5,                   // needs purchases: ~every 2-3 days
    ideologyShift: 1 / (365 * 3),             // worldview drifts on the scale of years
    bountyDecay:   5,                         // gold/day, old cases slowly go cold
  };

  const PROFILE_ITEMIDS_CAP = 40;             // bound offscreen-purchase inventory growth
  const CRIMINAL_RECORD_CAP = 40;             // rolling per-NPC conviction log
  // How long a conviction goes on holding somebody's standing down. Nothing ever
  // removed an entry from criminalRecord, so five convictions pinned an NPC's
  // baseline at the floor of 5 for the rest of their life, with no path back:
  // that in turn kept their divorce rate doubled for ever and dragged the
  // world's average standing monotonically down. A sentence is served and, in
  // time, lived past.
  const CONVICTION_MEMORY_DAYS = 365 * 4;

  const COURTSHIP_MIN_DAYS = 90;              // can't marry before this much dating

  // Reason ids, stored on the location history and named through
  // NPCLife.moveReason.<id> when a biography quotes one.
  const MOVE_REASONS = [
    "lookingForWork", "followingFamily", "chasingLove",
    "fleeingTrouble", "freshStart", "cheapHousing",
    "fallingOut", "changeOfAir",
  ];
  const BORN_HERE = "bornHere";
  // The stay that opens when a traveller comes back from a trip. Kept out of
  // MOVE_REASONS: nobody's rolled backstory moves them "coming home".
  const HOMECOMING = "homecoming";
  const moveReasonLabel = (id) => {
    const key = "NPCLife.moveReason." + id;
    return T.has(key) ? T(key) : String(id || "");
  };

  // External (non-event) spouses drawn from this bank when no map-group
  // candidate is available. Marked external so they never collide with
  // real event NPCs.
  // i18n-ignore-start: given names, written onto the record and shown as the
  // person's name; proper nouns like every other roster in the project
  const PARTNER_NAME_BANK = [
    "Adel", "Bram", "Carla", "Dries", "Elke", "Fenna", "Gustav", "Hilde",
    "Ivo", "Jana", "Koen", "Lotte", "Maarten", "Nora", "Otto", "Petra",
    "Quirin", "Roos", "Sander", "Tessa", "Ute", "Vera", "Wim", "Ysolde",
  ];
  // i18n-ignore-end

  // ==========================================================================
  // SHARED UTILITIES (see NPCShared.js)
  // ==========================================================================

  const { nameHash, Rng: LifeRng, worldSeed, sampleCount } = window.NPCShared;

  // ==========================================================================
  // TIME HELPERS
  // ==========================================================================

  function yearFloatOf(minute) {
    return EPOCH_YEAR + minute / MINUTES_PER_YEAR;
  }

  function yearOf(minute) {
    return Math.floor(yearFloatOf(minute));
  }

  function minuteOfYear(year) {
    return Math.round((year - EPOCH_YEAR) * MINUTES_PER_YEAR);
  }

  function ageAt(record, minute) {
    return Math.max(0, Math.floor(yearFloatOf(minute) - record.birthYearFloat));
  }

  const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  function dateStrOf(minute) {
    const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
    d.setMinutes(d.getMinutes() + minute);
    return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ==========================================================================
  // DATA ACCESS
  // ==========================================================================

  function getDestinations() {
    const dest = window.WorkSystem?.Destinations;
    return (dest && typeof dest === "object") ? Object.keys(dest) : [];
  }

  // The trades anybody can be dealt: an appointed office (Jobs.json
  // `appointed`, a head of state, a minister) is only ever held by the people
  // NPCPolitics seats in it.
  function getJobs() {
    const jobs = window.WorkSystem?.Jobs;
    return Array.isArray(jobs) ? jobs.filter(j => j && !j.appointed) : [];
  }

  function getCrimes() {
    const crimes = window.Messages?.PresetCrimes;
    if (!crimes || typeof crimes !== "object") return [];
    return Object.entries(crimes).map(([key, c]) => ({
      key, name: c.name || key, bounty: c.bounty || 100, category: c.category || "Misc", // i18n-ignore: PresetCrimes category id
    }));
  }

  function getRecords() {
    if (!$gameSystem) return null;
    if (!$gameSystem._npcLifeRecords) $gameSystem._npcLifeRecords = {};
    return $gameSystem._npcLifeRecords;
  }

  function getProfile(name) {
    return $gameSystem?._npcSociety?.[name] ?? null;
  }

  // Settlement-level rate multipliers from the world web (NPCWorldWeb.js):
  // booms hire faster, busts breed crime and divorce, festivals spark
  // courtships, crime-wave crackdowns catch more thieves. Neutral when the
  // emergence layer isn't loaded.
  const NEUTRAL_WEB_RATES = { findJob: 1, jobChange: 1, crime: 1, dating: 1, divorce: 1, catchBonus: 0 };
  function webRates(record) {
    return window.NPCWorldWeb?.lifeRates?.(record.homeGroup) ?? NEUTRAL_WEB_RATES;
  }

  // Normalized comparison so map-group keys ("OmegaTower", "FrozenStation")
  // match their Destinations.json spellings ("Omega Tower", "Frozen Station").
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function destinationForGroup(groupName) {
    if (!groupName) return null;
    const target = norm(groupName);
    for (const dest of getDestinations()) {
      if (norm(dest) === target) return dest;
    }
    return groupName; // group has no Destinations entry, use its own name
  }

  // ==========================================================================
  // PLACES, the one answer to "which town is this"
  // ==========================================================================
  // A person's home is a map-group key: an authored town ("OmegaTower") or a
  // procedural square ("Proc:121,161"). A trip, a move or a road traveller
  // speaks in Destinations.json names ("Milano"). These four translate between
  // the two so no caller re-derives it. A procedural destination is found by
  // the tile it stands on: its `base` or any of its `reservedTiles`.

  function destinationRecord(name) {
    const dest = window.WorkSystem?.Destinations;
    return (dest && name && typeof dest === "object") ? (dest[name] || null) : null;
  }

  let _tileIndex = null;
  let _tileIndexSource = null;
  function destinationAtTile(x, y) {
    const dest = window.WorkSystem?.Destinations;
    if (!dest || typeof dest !== "object") return null;
    if (_tileIndexSource !== dest) {
      _tileIndex = new Map();
      _tileIndexSource = dest;
      for (const [name, entry] of Object.entries(dest)) {
        if (!entry?.procedural || !entry.base) continue;
        _tileIndex.set(`${entry.base.x},${entry.base.y}`, name);
        for (const key of (entry.reservedTiles || [])) {
          if (!_tileIndex.has(key)) _tileIndex.set(String(key), name);
        }
      }
    }
    return _tileIndex.get(`${x},${y}`) || null;
  }

  // The destination a map group stands for, or null when it stands for none.
  function placeOfGroup(group) {
    if (!group) return null;
    const m = /^Proc:(-?\d+),(-?\d+)$/.exec(String(group));
    if (m) return destinationAtTile(Number(m[1]), Number(m[2]));
    return destinationForGroup(group);
  }

  // The map group a destination is lived in. A procedural destination is its
  // base square; an authored one the group of the same name; anything else is
  // somewhere people visit but nobody can be seen arriving (null).
  function groupForPlace(name) {
    if (!name) return null;
    const entry = destinationRecord(name);
    if (entry?.procedural && entry.base) return `Proc:${entry.base.x},${entry.base.y}`; // i18n-ignore: settlement key
    const target = norm(name);
    for (const key of Object.keys($gameSystem?._npcMapGroups || {})) {
      if (norm(key) === target) return key;
    }
    return null;
  }

  // World-map square of a destination, or null for one without coordinates.
  function placeCoords(name) {
    const base = destinationRecord(name)?.base;
    return base ? { x: base.x, y: base.y } : null;
  }

  // ==========================================================================
  // MAP-GROUP POPULATION, every NPC found within map groups gets a life
  // ==========================================================================

  // name → home group, harvested from each group's NPC template pool.
  // Society profiles (already-met NPCs) take precedence for the home group.
  let _populationCache = null;
  let _populationCacheKey = "";

  function collectPopulation() {
    const groups = $gameSystem?._npcMapGroups || {};
    const society = $gameSystem?._npcSociety || {};
    const groupNames = Object.keys(groups);
    // Refresh when the group list changes or new NPCs join the society.
    const cacheKey = groupNames.join("|") + "::" + Object.keys(society).length;
    if (_populationCache && _populationCacheKey === cacheKey) return _populationCache;

    const population = {}; // name → groupName
    for (const groupName of groupNames) {
      let pool = [];
      try { pool = window.NPCSystem?.getNPCPool?.(groupName) || []; } catch (_) { pool = []; }
      for (const tpl of pool) {
        const evName = tpl?.eventData?.name;
        if (evName && population[evName] === undefined) population[evName] = groupName;
      }
    }
    // Society profiles know their true home group; they win over pool harvest.
    for (const [name, profile] of Object.entries(society)) {
      if (profile?._homeGroupName) population[name] = profile._homeGroupName;
      else if (population[name] === undefined) population[name] = null;
    }

    _populationCache = population;
    _populationCacheKey = cacheKey;
    return population;
  }

  // ==========================================================================
  // LIFE RECORD GENERATION (deterministic per name + world seed)
  // ==========================================================================

  // The life log is saved with the world, so only the key and its values are
  // stored; the sentence is written out by lifeEventText() when it is read.
  function pushLifeEvent(record, minute, type, key, params) {
    record.lifeEvents.unshift({ minute, date: dateStrOf(minute), type, key, params });
    if (record.lifeEvents.length > LIFE_EVENT_CAP) record.lifeEvents.pop();
  }

  // A life event that can turn somebody's worldview (DIRECTED DEVELOPMENT):
  // the tag is read, and cleared, on the next pass that resolves their outlook.
  function markDev(record, tag) {
    if (!record || record.nonSentient || !tag) return;
    const pending = Array.isArray(record._devPending) ? record._devPending : (record._devPending = []);
    if (!pending.includes(tag)) pending.push(tag);
  }

  // A career segment records the job's i18n key ("jobs.12.name"), the way
  // Jobs.json names it, rather than the wording - so a life simulated in one
  // language still reads in whichever one it is opened in. A record written
  // before the change (or a modded job) holds prose already and passes through.
  function jobLabel(name) {
    if (!name) return "";
    const key = String(name);
    return T.has(key) ? T(key) : key;
  }

  // Places are recorded by their Destinations.json key; a biography reads out
  // the "name" that entry carries ("GreenWitch" -> "Green Witch"). Anything the
  // catalogue does not know (a map group, a country) passes through unchanged.
  function placeLabel(place) {
    const proc = /^Proc:(-?\d+),(-?\d+)$/i.exec(String(place ?? ""));
    if (proc) return procPlaceLabel(Number(proc[1]), Number(proc[2]));
    return window.WorkSystem?.destinationName
      ? window.WorkSystem.destinationName(place)
      : String(place ?? "");
  }

  // A per-tile settlement key reads as the ground it stands on, the nation
  // that claims it and the square itself: "Forest at (79 134), Spain".
  function procPlaceLabel(x, y) {
    const gs = (typeof $gameSystem !== "undefined") ? $gameSystem : null;
    let biome = null, country = null;
    try { biome = gs?.getBiomeFromCache ? gs.getBiomeFromCache(x, y) : null; } catch (e) { biome = null; }
    try { country = gs?.getCountryFromWorldCoordinates ? gs.getCountryFromWorldCoordinates(x, y) : null; } catch (e) { country = null; }
    const place = biome
      ? T('WorldMapReturn.squareAt', {
          place: window.BiomeNames?.display ? window.BiomeNames.display(biome) : biome, x: x, y: y })
      : T('NPCLife.procPlace.frontier', { x: x, y: y });
    return country?.country
      ? T('NPCLife.procPlace.inCountry', { place: place, country: country.country })
      : T('NPCLife.procPlace.unclaimed', { place: place });
  }

  // ── Where a beast has lived ────────────────────────────────────────────────
  // A non-sentient creature did not live IN the town. It lived in the country
  // around it, and the town is only the nearest thing on a map with names on
  // it: "Forest near Bologna". The stop still carries the destination as its
  // `place`, so every comparison, every move event and the settled-in line go
  // on working unchanged; the biome is a second field the label composes in.
  //
  // Only wilderness is drawn on. A creature is never "Factory near Bologna",
  // which would be a person's address with a monster's name on it; these are
  // the Biomes.json entries something could actually have been living in.
  // i18n-ignore-start: Biomes.json ids, named through NPCLife.wildBiome.<id>
  const WILD_BIOMES = [
    "Forest", "ForestTropical", "ForestIce", "Jungle", "Swamp", "Mangrove",
    "Cave", "CaveDen", "CaveIce", "Mountain", "MountainIce", "Highlands",
    "Taiga", "Tundra", "Permafrost", "Steppe", "Savannah", "Badlands",
    "Canyon", "Desert", "Meadows", "Fields", "Lake", "River", "RiverBank",
    "Beach", "Ocean", "SeaBed", "Ice", "Snow", "Volcano", "Mushroom",
    "Bamboo", "SpiritWoods", "Underdark", "Crystals", "SaltFlats",
  ];
  // i18n-ignore-end

  // The wilderness this world actually has, so a biome that was cut from
  // Biomes.json is never the place somebody grew up in.
  let _wildBiomes = null;
  function wildBiomes() {
    if (_wildBiomes) return _wildBiomes;
    const list = window.WorldGen && window.WorldGen.Biomes;
    if (!Array.isArray(list) || !list.length) return (_wildBiomes = WILD_BIOMES);
    const known = new Set(list.map((b) => b && b.name));
    const kept = WILD_BIOMES.filter((b) => known.has(b));
    _wildBiomes = kept.length ? kept : WILD_BIOMES;
    return _wildBiomes;
  }

  // A language that has not been given these words yet carries the key as an
  // empty string, so a blank is treated as untranslated and the biome id is
  // shown rather than nothing at all.
  function wildBiomeLabel(id) {
    const key = "NPCLife.wildBiome." + id;
    const text = T.has(key) ? T(key) : "";
    return text || String(id || "");
  }

  // How one stop on a life's path reads. A person's is the place itself; a
  // beast's is the country near it.
  function stopLabel(stop) {
    if (!stop) return "";
    if (typeof stop === "string") return placeLabel(stop);
    const place = placeLabel(stop.place);
    if (!stop.wild) return place;
    const text = T.has("NPCLife.wildsNear")
      ? T("NPCLife.wildsNear", { biome: wildBiomeLabel(stop.wild), city: place })
      : "";
    return text.trim() || place;
  }

  // Whether this NPC is one of the non-sentient creatures (NPCCreature). Such
  // a life has no savings, no move up the housing ladder and no address, only
  // a range it has drifted around.
  // `name` lets the player's own creature characters out of the rule: a beast
  // the player built and plays keeps a life like anybody else's.
  function isNonSentient(profile, name) {
    const NC = window.NPCCreature;
    if (!NC || !NC.isNonSentientProfile(profile)) return false;
    return !NC.isPlayerCharacterName(name);
  }

  // A life event as a sentence. Records written before the log was keyed hold
  // a finished English string, which is returned as it stands.
  function lifeEventText(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    if (!entry.key || !T.has(entry.key)) return entry.desc || "";
    const params = entry.params || {};
    const values = Object.assign({}, params);
    // Jobs and places are logged as ids, not as words, and are put into the
    // reader's language here. `wild` is only ever on a non-sentient creature's
    // events, and turns the place into the country around it (see stopLabel).
    if (params.job != null) values.job = jobLabel(params.job);
    // A creed is logged by its id and named in the reader's language.
    if (params.creed != null) values.creed = creedLabel(params.creed);
    if (params.place != null) {
      values.place = stopLabel({ place: params.place, wild: params.wild || null });
    }
    // An augment and the part it went in are logged by their catalogue keys.
    if (params.augment != null) values.augment = window.NPCSim?.Implants?.label?.(params.augment) || params.augment;
    if (params.bodyPart != null) values.bodyPart = window.NPCSim?.Implants?.partLabel?.(params.bodyPart) || params.bodyPart;
    // An illness is logged by its disease id (Health_DiseaseSystem).
    if (params.illness != null) values.illness = window.DiseaseSystem?.displayName?.(params.illness) || params.illness;
    // An animal's place is logged as a map-group key or a farm owner, and
    // written out here (NPCLife_Animals).
    if (params.whereKey != null || params.whereOwner != null) values.where = animalWhereText(params);
    // A line may carry {a|b} alternatives: chosen off the entry itself, so the
    // same event always reads the same way.
    return resolveAlternation(T(entry.key, values), nameHash(String(entry.key) + ":" + (entry.minute | 0)));
  }

  // "{a|b|c}" groups (after the {name} placeholders are filled) resolved to
  // one alternative each, off `seed`, so a line reads the same every time.
  function resolveAlternation(text, seed) {
    if (typeof text !== "string" || text.indexOf("|") < 0) return text;
    let s = (seed >>> 0) || 1;
    let out = text, guard = 0;
    const re = /\{([^{}]*\|[^{}]*)\}/;
    while (re.test(out) && guard++ < 32) {
      out = out.replace(re, (whole, body) => {
        const opts = body.split("|");
        s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
        return opts[s % opts.length];
      });
    }
    return out;
  }

  // Where an animal was born or moved to, from a logged { whereKey, whereWild,
  // whereOwner }: an owner's farm, a place, the country round it, or "in the
  // wild" when nothing is known.
  function animalWhereText(params) {
    if (params.whereOwner) return T("NPCLife.animal.onFarm", { owner: params.whereOwner });
    if (params.whereKey) return T("NPCLife.animal.inPlace", { place: stopLabel({ place: params.whereKey, wild: params.whereWild || null }) });
    return T("NPCLife.animal.inWild");
  }

  function rollHonesty(name, profile, rng) {
    if (profile && typeof profile.moralityScore === "number") {
      // Map morality -100..100 → honesty 0..100
      return Math.max(0, Math.min(100, Math.round(50 + profile.moralityScore * 0.5)));
    }
    return rng.int(10, 95);
  }

  function rollBirth(name, profile, rng, nowMinute, forcedAge, opts) {
    // A child born into the world (FAMILY) is dated to the minute they were
    // born, and is the one person the age floor does not apply to.
    if (opts && opts.child) {
      const at = typeof opts.birthMinute === "number" ? opts.birthMinute
        : nowMinute - Math.max(0, Number(forcedAge) || 0) * MINUTES_PER_YEAR - Math.floor(rng.next() * 0.9 * MINUTES_PER_YEAR);
      const birthYearFloat = yearFloatOf(Math.min(nowMinute, at));
      const d = new Date(EPOCH_YEAR, 0, 1, 10, 0, 0);
      d.setMinutes(d.getMinutes() + Math.min(nowMinute, at));
      const birthYear = Math.floor(birthYearFloat);
      const birthMonth = d.getMonth() + 1;
      const birthDay = Math.min(28, d.getDate());
      return {
        birthYear, birthMonth, birthDay, birthYearFloat,
        birthDate: `${String(birthDay).padStart(2, "0")} ${MONTHS[birthMonth - 1]} ${birthYear}`,
      };
    }
    // Stay coherent with NPCSociety's backstory convention (age ≈ 18 + level*2)
    // when a society profile exists; otherwise a seeded adult age. A household
    // (bindFamily) hands its members their ages, so parents are older than
    // the children they live with.
    let age;
    if (typeof forcedAge === "number" && isFinite(forcedAge)) {
      age = Math.min(99, Math.floor(forcedAge));
    } else if (profile && typeof profile.level === "number") {
      age = Math.min(78, MIN_NPC_AGE + profile.level * 2 + rng.int(-2, 2));
    } else {
      age = MIN_NPC_AGE + Math.floor(Math.pow(rng.next(), 1.3) * 55); // skews younger
    }
    // Nobody the world places on a map is a minor: the age floor is applied
    // before the birth date is derived, so the date always trails the CURRENT
    // in-game year by at least MIN_NPC_AGE.
    age = Math.max(MIN_NPC_AGE, age);
    const birthYearFloat = yearFloatOf(nowMinute) - age - rng.next() * 0.9;
    const birthYear  = Math.floor(birthYearFloat);
    const birthMonth = rng.int(1, 12);
    const birthDay   = rng.int(1, 28);
    return {
      birthYear, birthMonth, birthDay, birthYearFloat,
      birthDate: `${String(birthDay).padStart(2, "0")} ${MONTHS[birthMonth - 1]} ${birthYear}`,
    };
  }

  // `nativeChance` (0..1) is how likely this person was born in the town they
  // live in rather than anywhere on the map. Somebody generated AS a citizen of
  // a place (Bologna's own Bolognesi) is dealt a 1 and is native by definition;
  // an NPC met on the road is dealt nothing and keeps the old flat roll over
  // every destination in the world.
  function rollLocationHistory(record, homeGroup, rng, nativeChance, wild) {
    const destinations = getDestinations();
    const homeDest = destinationForGroup(homeGroup);
    const fallback = homeDest || (destinations.length ? rng.pick(destinations) : T('NPCLife.partsUnknown'));
    const native = homeDest && nativeChance > 0 && rng.next() < nativeChance;
    const birthplace = native ? homeDest
      : (destinations.length ? rng.pick(destinations) : fallback);

    const history = [];
    const nowYear = yearOf(record._nowMinute);
    const adultYear = record.birthYear + rng.int(16, 22);

    // Number of relocations scales with how long they've been an adult.
    const adultYears = Math.max(0, nowYear - adultYear);
    const maxMoves = Math.min(4, Math.floor(adultYears / 12) + 1);
    const moveCount = birthplace === fallback ? rng.int(0, Math.max(0, maxMoves - 1)) : rng.int(1, maxMoves);

    let cursorYear = record.birthYear;
    let cursorPlace = birthplace;
    const stops = [];
    for (let i = 0; i < moveCount - 1; i++) {
      const candidates = destinations.filter(d => d !== cursorPlace);
      if (!candidates.length) break;
      stops.push(rng.pick(candidates));
    }
    stops.push(fallback); // final stop is always the current home

    // A beast's stops are the country around each town rather than the town.
    // Drawn off the same stream, once per stop, so the range it drifted through
    // is as fixed as everything else on the record.
    const biomes = wild ? wildBiomes() : null;
    const wildAt = () => (biomes ? rng.pick(biomes) : null);

    for (let i = 0; i < stops.length; i++) {
      if (stops[i] === cursorPlace) continue;
      const remainingYears = nowYear - cursorYear;
      if (remainingYears <= 1) break;
      const moveYear = cursorYear + rng.int(Math.max(1, Math.floor(remainingYears * 0.2)), Math.max(2, remainingYears - 1));
      history.push({ place: cursorPlace, wild: wildAt(), fromYear: cursorYear, toYear: moveYear, reason: i === 0 ? BORN_HERE : record._lastMoveReason });
      record._lastMoveReason = rng.pick(MOVE_REASONS);
      cursorYear = moveYear;
      cursorPlace = stops[i];
    }
    history.push({ place: cursorPlace, wild: wildAt(), fromYear: cursorYear, toYear: null, reason: history.length ? (record._lastMoveReason || rng.pick(MOVE_REASONS)) : BORN_HERE });
    delete record._lastMoveReason;

    record.birthplace = birthplace;
    // The birthplace reads the same way the stops do, so a beast is born in
    // the wilds it went on living in rather than in a town it never entered.
    record.birthWild = history.length ? history[0].wild : null;
    record.locationHistory = history;
    record.currentPlace = cursorPlace;
  }

  function pickJob(rng, honesty) {
    const jobs = getJobs();
    if (!jobs.length) return null;
    const eligible = honesty < 35 ? jobs : jobs.filter(j => (j.category || "") !== "Criminal"); // i18n-ignore: Jobs.json category id
    const pool = eligible.length ? eligible : jobs;
    const job = rng.pick(pool);
    return { jobId: job.id, jobName: job.name || T('NPCLife.jobFallback', { id: job.id }), category: job.category || "General" }; // i18n-ignore: Jobs.json category id
  }

  function rollCareerHistory(record, profile, rng) {
    // A beast has never held a job, so it has no career to have had. It is not
    // retired and it is not unemployed either: it simply never worked.
    if (record.nonSentient) {
      record.careerHistory = [];
      record.retirementAge = null;
      record.employment = "none"; // i18n-ignore: employment state id
      return;
    }
    // A child has worked no job yet; growing up (FAMILY) opens the market.
    if (record.child) {
      record.careerHistory = [];
      record.retirementAge = rng.int(60, 70);
      record.employment = "none"; // i18n-ignore: employment state id
      return;
    }
    const nowYear = yearOf(record._nowMinute);
    const startAge = rng.int(16, 23);
    const startYear = record.birthYear + startAge;
    record.retirementAge = rng.int(60, 70);
    const retirementYear = record.birthYear + record.retirementAge;

    const history = [];
    let cursor = startYear;
    const horizon = Math.min(nowYear, retirementYear);
    while (cursor < horizon) {
      const span = rng.int(2, 12);
      const end = Math.min(cursor + span, horizon);
      const job = pickJob(rng, record.honesty);
      if (!job) break;
      const open = end >= horizon && retirementYear > nowYear;
      history.push({ ...job, fromYear: cursor, toYear: open ? null : end, end: open ? null : (end === retirementYear ? "retired" : "changed") });
      cursor = end;
    }

    const retired = nowYear >= retirementYear;
    if (retired && history.length) {
      const last = history[history.length - 1];
      last.toYear = retirementYear;
      last.end = "retired";
    }

    // Sync the open segment with the live shift system's assignment, if any.
    const openSeg = history.find(seg => seg.toYear === null);
    if (openSeg && profile && profile.currentJobId) {
      const liveJob = getJobs().find(j => j.id === profile.currentJobId);
      if (liveJob) {
        openSeg.jobId = liveJob.id;
        openSeg.jobName = liveJob.name || openSeg.jobName;
        openSeg.category = liveJob.category || openSeg.category;
      }
    }

    record.careerHistory = history;
    record.employment = retired ? "retired" : (openSeg ? "employed" : "unemployed");
  }

  function severityTier(bounty) {
    return bounty < 300 ? 0 : bounty < 2000 ? 1 : 2;
  }

  function pickCrime(rng, honesty) {
    const crimes = getCrimes();
    if (!crimes.length) return null;
    const maxTier = honesty >= 40 ? 0 : honesty >= 20 ? 1 : 2;
    const eligible = crimes.filter(c => severityTier(c.bounty) <= maxTier);
    const pool = eligible.length ? eligible : crimes;
    // Weight petty crimes far above serious ones.
    const weights = pool.map(c => 1 / Math.max(1, c.bounty));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function sentenceDaysFor(bounty) {
    return Math.max(2, Math.min(7300, Math.round(bounty / 40)));
  }

  function recordCrime(record, crime, minute, caught, convicted) {
    const entry = {
      key: crime.key, name: crime.name, category: crime.category, bounty: crime.bounty,
      minute, year: yearOf(minute), caught, convicted,
      sentenceDays: convicted ? sentenceDaysFor(crime.bounty) : 0,
      served: false,
    };
    record.criminalRecord.push(entry);
    // Bounded like the life-event log: a long catch-up samples a crime per
    // dishonest NPC per day, and the array was push-only and uncapped.
    if (record.criminalRecord.length > CRIMINAL_RECORD_CAP) record.criminalRecord.shift();
    if (convicted) {
      record.socialStanding = Math.max(0, record.socialStanding - (5 + severityTier(crime.bounty) * 10));
    } else if (caught) {
      record.socialStanding = Math.max(0, record.socialStanding - 3);
    } else {
      record.wantedBounty += crime.bounty;
    }
    return entry;
  }

  function rollCriminalHistory(record, rng) {
    record.criminalRecord = [];
    record.wantedBounty = 0;
    record.inPrisonUntilMinute = null;
    // A beast is not answerable to anybody's law, so it has no record to have.
    if (record.nonSentient) return;
    // Nor is a child (FAMILY).
    if (record.child) return;
    // Honest NPCs maintain clean records.
    if (record.honesty >= 60) return;

    const nowMinute = record._nowMinute;
    const adultMinute = minuteOfYear(record.birthYear + 16);
    const adultSpan = Math.max(0, nowMinute - adultMinute);
    const dishonesty = (60 - record.honesty) / 60; // 0..1
    const count = Math.min(10, Math.floor(dishonesty * 4) + rng.int(0, 2));

    for (let i = 0; i < count; i++) {
      const crime = pickCrime(rng, record.honesty);
      if (!crime) break;
      const minute = adultMinute + Math.floor(rng.next() * adultSpan);
      const caught = rng.next() < 0.55;
      const convicted = caught && rng.next() < 0.8;
      const entry = recordCrime(record, crime, minute, caught, convicted);
      if (convicted) {
        const releaseMinute = minute + entry.sentenceDays * MINUTES_PER_DAY;
        if (releaseMinute > nowMinute) {
          // Still serving: this NPC is currently in prison, off-screen.
          record.inPrisonUntilMinute = releaseMinute;
          record.employment = record.employment === "retired" ? "retired" : "imprisoned";
        } else {
          entry.served = true;
        }
        pushLifeEvent(record, minute, "conviction", "NPCLife.event.convictedSentenced",
          { crime: entry.name.toLowerCase(), days: entry.sentenceDays });
      } else if (caught) {
        pushLifeEvent(record, minute, "arrest", "NPCLife.event.arrestedNotConvicted", { crime: entry.name.toLowerCase() });
      }
    }
    // Sort oldest-first for readable biographies.
    record.criminalRecord.sort((a, b) => a.minute - b.minute);
  }

  function rollMaritalStatus(record, rng) {
    const age = ageAt(record, record._nowMinute);
    record.maritalStatus = "single";
    record.partner = null;
    record.partnerSinceMinute = null;
    record.exPartners = [];
    record.timesMarried = 0;

    // Nothing marries a beast and a beast marries nothing: the whole of that
    // side of a life is closed to the non-sentient classes.
    if (record.nonSentient) return;
    if (age < 22) return;
    const roll = rng.next();
    const widowChance = age > 55 ? 0.08 : 0.02;
    if (roll < 0.42) {
      record.maritalStatus = "married";
      record.timesMarried = 1;
    } else if (roll < 0.42 + 0.16) {
      record.maritalStatus = "divorced";
      record.timesMarried = 1;
    } else if (roll < 0.42 + 0.16 + widowChance) {
      record.maritalStatus = "widowed";
      record.timesMarried = 1;
    }

    if (record.maritalStatus === "divorced" || record.maritalStatus === "widowed") {
      const exName = rng.pick(PARTNER_NAME_BANK);
      const marriedYear = record.birthYear + rng.int(20, Math.max(21, age - 3));
      const endedYear = marriedYear + rng.int(2, Math.max(3, age - (marriedYear - record.birthYear) - 1));
      const outcome = record.maritalStatus === "divorced" ? "divorced" : "widowed";
      record.exPartners.push({ name: exName, external: true, fromYear: marriedYear, toYear: Math.min(endedYear, yearOf(record._nowMinute)), outcome });
    }
  }

  function baselineStanding(record, profile) {
    const wealth = profile?.wealthTierBase ?? 2;
    const now = record._nowMinute ?? 0;
    const window = CONVICTION_MEMORY_DAYS * MINUTES_PER_DAY;
    // Only what the town still remembers counts against them.
    const recent = record.criminalRecord.filter(c =>
      c.convicted && (c.minute == null || now - c.minute <= window)).length;
    return Math.max(5, Math.min(95, 50 + wealth * 8 - recent * 10));
  }

  // A record restored from an older world folder (or one whose birth year came
  // from a hand-authored dossier) can sit under the age floor. Push its birth
  // date back relative to the current in-game year so no NPC ever reads as a
  // minor, whatever produced the record.
  function enforceAdultBirth(record) {
    if (!record || typeof record.birthYearFloat !== "number") return record;
    // A beast is as old as its own kind lives (NPCLife_Animals): a lamb is
    // a lamb, not an eighteen-year-old.
    if (record.nonSentient) return record;
    // A child of the world is exactly as old as they are (FAMILY).
    if (record.child) return record;
    const nowMinute = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    const nowFloat  = yearFloatOf(nowMinute);
    if (nowFloat - record.birthYearFloat >= MIN_NPC_AGE) return record;
    record.birthYearFloat = nowFloat - MIN_NPC_AGE - 0.25;
    record.birthYear      = Math.floor(record.birthYearFloat);
    const month = Math.min(12, Math.max(1, record.birthMonth || 1));
    const day   = Math.min(28, Math.max(1, record.birthDay   || 1));
    record.birthMonth = month;
    record.birthDay   = day;
    record.birthDate  = `${String(day).padStart(2, "0")} ${MONTHS[month - 1]} ${record.birthYear}`;
    return record;
  }

  // `salt` re-rolls a life that has already been dealt (rerollLifeRecord); the
  // name alone is otherwise the whole seed, so the same person always gets the
  // same life back in the same world.
  function ensureLifeRecord(name, homeGroupHint, salt, opts) {
    const records = getRecords();
    if (!records) return null;
    if (records[name]) return enforceAdultBirth(records[name]);

    const nowMinute = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    const profile = getProfile(name);
    const rng = new LifeRng(nameHash(name + "_life" + (salt || "")) ^ worldSeed());

    const record = {
      v: 1,
      name,
      homeGroup: profile?._homeGroupName || homeGroupHint || null,
      honesty: 0,
      charisma: 0.6 + rng.next() * 0.9,
      socialStanding: 50,
      lifeEvents: [],
      _nowMinute: nowMinute,
    };

    record.honesty = rollHonesty(name, profile, rng);
    // A beast has no address and no career. Its stops are the country around
    // each town (see stopLabel), and it is marked on the record so the readers
    // that quote a life do not have to reach for the society profile.
    record.nonSentient = isNonSentient(profile, name);
    // A child (FAMILY): born into a household, or dealt into one as a minor.
    const child = !record.nonSentient && !!((opts && opts.child) || profile?._child);
    if (child) record.child = true;
    // A beast's age is read off its own kind's lifespan (NPCLife_Animals),
    // never the human 18 + level * 2 a person is dealt.
    const animalBirth = record.nonSentient && rollAnimalBirth ? rollAnimalBirth(name, profile, rng, nowMinute, opts) : null;
    Object.assign(record, animalBirth || rollBirth(name, profile, rng, nowMinute, opts && opts.age, child ? Object.assign({ child: true }, opts) : null));
    if (child && ageAt(record, nowMinute) >= MIN_NPC_AGE) delete record.child;
    rollLocationHistory(record, record.homeGroup, rng, record.child ? 1 : (opts && opts.nativeChance), record.nonSentient);
    if (record.child && opts && opts.birthplace) {
      record.birthplace = opts.birthplace;
      record.currentPlace = opts.birthplace;
      record.locationHistory = [{ place: opts.birthplace, wild: null, fromYear: record.birthYear, toYear: null, reason: BORN_HERE }];
    }
    rollCareerHistory(record, profile, rng);
    rollCriminalHistory(record, rng);
    // Some low-morality NPCs start the game already wanted, a seeded bounty
    // scaled by their level, on top of whatever rollCriminalHistory produced.
    // A beast is never charged with anything: it is not answerable.
    if (!record.nonSentient && (profile?.moralityScore ?? 0) < -30 && rng.next() < 0.5) {
      record.wantedBounty += rng.int(10, 60) * Math.max(1, profile?.level ?? 1);
    }
    rollMaritalStatus(record, rng);
    record.socialStanding = baselineStanding(record, profile);

    // Biography seed events (moves + marriage) for the rolling log.
    for (const stop of record.locationHistory) {
      if (stop.reason !== BORN_HERE) {
        pushLifeEvent(record, minuteOfYear(stop.fromYear), "move", "NPCLife.event.moved",
          { place: stop.place, wild: stop.wild || null, reason: moveReasonLabel(stop.reason) });
      }
    }
    delete record._nowMinute;
    records[name] = record;
    return record;
  }

  // Pair up freshly created married-but-unpartnered records inside each map
  // group, deterministically (sorted by name). Leftovers marry someone from
  // the external name bank.
  function pairNewlyweds(newNames) {
    const records = getRecords();
    if (!records) return;
    const byGroup = {};
    for (const name of newNames) {
      const r = records[name];
      if (!r || r.maritalStatus !== "married" || r.partner) continue;
      // Somebody content alone, or who only ever holds a queerplatonic bond,
      // was never married (FAMILY).
      const rules = rulesOf(styleKeyOf(name));
      if (!rules.partners || !rules.dates) {
        r.maritalStatus = "single";
        r.timesMarried = 0;
        continue;
      }
      (byGroup[r.homeGroup || "__none__"] = byGroup[r.homeGroup || "__none__"] || []).push(name);
    }
    for (const names of Object.values(byGroup)) {
      names.sort();
      // Paired in name order with the first one both of them would have.
      const taken = new Set();
      for (let i = 0; i < names.length; i++) {
        if (taken.has(names[i])) continue;
        for (let j = i + 1; j < names.length; j++) {
          if (taken.has(names[j])) continue;
          if (pairKind(names[i], names[j]) !== "romantic") continue; // i18n-ignore: bond kind id
          const a = records[names[i]], b = records[names[j]];
          a.partner = { name: b.name, external: false };
          b.partner = { name: a.name, external: false };
          const year = Math.max(a.birthYear, b.birthYear) + 22;
          a.partnerSinceMinute = b.partnerSinceMinute = minuteOfYear(year);
          a.partnerStyle = b.partnerStyle = coupleStyle(a.name, b.name, "romantic", false, true); // i18n-ignore: bond kind id
          syncCoupleOpinions(a.name, b.name, 55);
          taken.add(a.name); taken.add(b.name);
          break;
        }
      }
      // Whoever is left married somebody from beyond the simulation.
      for (const name of names) {
        if (taken.has(name)) continue;
        const solo = records[name];
        const rng = new LifeRng(nameHash(solo.name + "_spouse") ^ worldSeed());
        solo.partner = { name: rng.pick(PARTNER_NAME_BANK), external: true };
        solo.partnerSinceMinute = minuteOfYear(solo.birthYear + rng.int(21, Math.max(22, ageAt(solo, 0) - 1)));
        solo.partnerStyle = coupleStyle(solo.name, null, "romantic", false, true); // i18n-ignore: bond kind id
      }
    }
  }

  // Mirror a couple's bond into the live society relationship graph.
  function syncCoupleOpinions(nameA, nameB, opinion) {
    const pa = getProfile(nameA), pb = getProfile(nameB);
    if (pa) {
      pa.relationships = pa.relationships || {};
      pa.relationships[nameB] = Object.assign(pa.relationships[nameB] || { meetCount: 50 }, { opinion });
    }
    if (pb) {
      pb.relationships = pb.relationships || {};
      pb.relationships[nameA] = Object.assign(pb.relationships[nameA] || { meetCount: 50 }, { opinion });
    }
  }

  // ==========================================================================
  // DELTA ENGINE, resolve life events across an elapsed interval
  // ==========================================================================

  // Ends one partnership: the primary partner, or `partnerName` among the
  // partners of a poly life (FAMILY). Whoever is left with nobody is single
  // or divorced again; a couple who shared a home part ways under separate
  // roofs (separateHousehold).
  function endPartnership(record, nowYear, outcome, atMinute, partnerName) {
    const partner = partnerName ? partnersOf(record).find(p => p.name === partnerName) : record.partner;
    if (!partner) return;
    const wasPrimary = record.partner?.name === partner.name;
    const since = partner.sinceMinute ?? (wasPrimary ? record.partnerSinceMinute : null);
    // i18n-ignore-start: outcome / marital-status ids
    const alone = outcome === "broke up" ? "single" : outcome === "widowed" ? "widowed" : "divorced";
    // i18n-ignore-end
    record.exPartners.push({
      name: partner.name, external: !!partner.external,
      fromYear: since != null ? yearOf(since) : nowYear,
      toYear: nowYear, outcome,
    });
    unlinkPartner(record, partner.name);
    if (!record.partner) record.maritalStatus = alone;
    markDev(record, "partner");

    if (!partner.external) {
      const other = getRecords()?.[partner.name];
      if (other && partnersOf(other).some(p => p.name === record.name)) {
        const mine = partnersOf(other).find(p => p.name === record.name);
        const otherSince = mine?.sinceMinute ?? (other.partner?.name === record.name ? other.partnerSinceMinute : null);
        other.exPartners.push({
          name: record.name, external: false,
          fromYear: otherSince != null ? yearOf(otherSince) : nowYear,
          toYear: nowYear, outcome: outcome === "abandoned" ? "wasAbandoned" : outcome, // i18n-ignore: outcome id
        });
        unlinkPartner(other, record.name);
        if (!other.partner) other.maritalStatus = alone;
        markDev(other, "partner");
        pushLifeEvent(other, atMinute, "relationship",
          outcome === "abandoned" ? "NPCLife.event.wasAbandonedBy"
            : outcome === "broke up" ? "NPCLife.event.brokeUpWith" // i18n-ignore: outcome id
            : outcome === "widowed" ? "NPCLife.event.widowed" // i18n-ignore: outcome id
            : "NPCLife.event.divorced",
          { name: record.name });
      }
      // A death is no split: the one left behind keeps the home, and the
      // two are not set against each other (DEATH).
      if (outcome !== "widowed") { // i18n-ignore: outcome id
        syncCoupleOpinions(record.name, partner.name, -55);
        try { separateHousehold(record.name, partner.name, atMinute); }
        catch (e) { console.error("[NPCLifeSim] moving out after a split failed", e); }
      }
    }
  }

  function resolvePrison(record, lastMinute, nowMinute) {
    if (record.inPrisonUntilMinute == null) return;
    if (record.inPrisonUntilMinute <= nowMinute) {
      const releaseMinute = record.inPrisonUntilMinute;
      record.inPrisonUntilMinute = null;
      for (const c of record.criminalRecord) {
        if (c.convicted && !c.served && c.minute + c.sentenceDays * MINUTES_PER_DAY <= nowMinute) c.served = true;
      }
      if (record.employment === "imprisoned") record.employment = "unemployed";
      pushLifeEvent(record, releaseMinute, "release", "NPCLife.event.releasedFromPrison");
      markDev(record, "prison");
    }
  }

  function resolveCareer(record, rng, lastMinute, nowMinute, deltaDays) {
    // A beast has no career to resolve, and no retirement age to be measured
    // against either (rollCareerHistory leaves it null).
    if (record.nonSentient) return;
    if (record.inPrisonUntilMinute != null) return;
    // An office of a nation or a bloc is the career while it is held
    // (NPCPolitics REAL POLITICIANS): nobody retires out of it or changes
    // trade on the side.
    if (record.inOffice) return;
    const age = ageAt(record, nowMinute);
    const nowYear = yearOf(nowMinute);

    // Retirement
    if (record.employment !== "retired" && age >= record.retirementAge) {
      const open = record.careerHistory.find(seg => seg.toYear === null);
      if (open) { open.toYear = nowYear; open.end = "retired"; }
      record.employment = "retired";
      pushLifeEvent(record, nowMinute, "career", "NPCLife.event.retired", { age: age });
      return;
    }
    if (record.employment === "retired") return;

    const web = webRates(record);
    if (record.employment === "employed") {
      const changes = sampleCount(rng, RATES.jobChange * web.jobChange * deltaDays);
      if (changes > 0) {
        const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
        const open = record.careerHistory.find(seg => seg.toYear === null);
        // Clamp: events sampled inside one big interval are not ordered, so a
        // segment must never close before the year it opened.
        if (open) { open.toYear = Math.max(open.fromYear, yearOf(atMinute)); open.end = "changed"; }
        const job = pickJob(rng, record.honesty);
        if (job) {
          record.careerHistory.push({ ...job, fromYear: open ? open.toYear : yearOf(atMinute), toYear: null, end: null });
          pushLifeEvent(record, atMinute, "career", "NPCLife.event.changedJob", { job: job.jobName });
        } else {
          record.employment = "unemployed";
        }
        markDev(record, "job");
      }
    } else if (record.employment === "unemployed") {
      const found = sampleCount(rng, RATES.findJob * web.findJob * deltaDays);
      if (found > 0) {
        const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
        const job = pickJob(rng, record.honesty);
        if (job) {
          record.careerHistory.push({ ...job, fromYear: yearOf(atMinute), toYear: null, end: null });
          record.employment = "employed";
          pushLifeEvent(record, atMinute, "career", "NPCLife.event.foundWork", { job: job.jobName });
          markDev(record, "job");
        }
      }
    }
  }

  function resolveRelationships(record, rng, lastMinute, nowMinute, deltaDays, singlesByGroup) {
    // Nothing courts a beast and a beast courts nothing; nor a child (FAMILY).
    if (record.nonSentient || record.child) return;
    if (record.inPrisonUntilMinute != null) return;
    const records = getRecords();
    const web = webRates(record);
    const ownKey = styleKeyOf(record.name);
    const own = rulesOf(ownKey);

    // A poly or open life keeps its other partners going on the side (FAMILY).
    if (record.partner) resolveExtraPartners(record, rng, lastMinute, nowMinute, deltaDays, singlesByGroup);
    const lived = rulesOf(record.partnerStyle || ownKey);

    if (record.maritalStatus === "married" && record.partner) {
      // Conviction within the interval, or a dishonest spouse, strains a
      // marriage, and so do the settlement's hard times (world web).
      let divorceRate = RATES.divorce * web.divorce * (lived.breakup || 1);
      const recentConviction = record.criminalRecord.some(c => c.convicted && c.minute > lastMinute);
      if (recentConviction) divorceRate *= 6;
      if (record.honesty < 30) divorceRate *= 2;
      if (record.socialStanding < 25) divorceRate *= 2;
      if (!record.partner.external) {
        const rel = getProfile(record.name)?.relationships?.[record.partner.name];
        if (rel && (rel.opinion ?? 0) < -20) divorceRate *= 3;
      }
      if (sampleCount(rng, divorceRate * deltaDays) > 0) {
        const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
        // Very dishonest NPCs walk out without the paperwork.
        const abandons = record.honesty < 25 && rng.next() < 0.5;
        const partnerName = record.partner.name;
        endPartnership(record, yearOf(atMinute), abandons ? "abandoned" : "divorced", atMinute);
        pushLifeEvent(record, atMinute, "relationship",
          abandons ? "NPCLife.event.abandonedPartner" : "NPCLife.event.divorced",
          { name: partnerName });
        record.socialStanding = Math.max(0, record.socialStanding - (abandons ? 8 : 4));
      }
      return;
    }

    if (record.maritalStatus === "dating" && record.partner) {
      const courtshipDays = record.partnerSinceMinute != null
        ? (nowMinute - record.partnerSinceMinute) / MINUTES_PER_DAY : 0;
      // A queerplatonic bond, a situationship or friends with benefits never
      // becomes a marriage; a serial monogamist is quicker to it.
      const other = record.partner.external ? null : records?.[record.partner.name];
      const mayMarry = lived.marries && record.partner.bond !== QP_BOND &&
        (!other || other.partner?.name === record.name);
      const courtMin = COURTSHIP_MIN_DAYS * (lived.courtship || 1);
      if (mayMarry && courtshipDays >= courtMin && sampleCount(rng, RATES.marry * deltaDays) > 0) {
        const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
        const key = lived.union ? "NPCLife.event.formedUnion" : "NPCLife.event.married";
        record.maritalStatus = "married";
        record.timesMarried = (record.timesMarried || 0) + 1;
        pushLifeEvent(record, atMinute, "relationship", key, { name: record.partner.name });
        markDev(record, "partner");
        if (other) {
          other.maritalStatus = "married";
          other.timesMarried = (other.timesMarried || 0) + 1;
          pushLifeEvent(other, atMinute, "relationship", key, { name: record.name });
          markDev(other, "partner");
          syncCoupleOpinions(record.name, record.partner.name, 70);
        }
      } else if (sampleCount(rng, RATES.breakup * (lived.breakup || 1) * deltaDays) > 0) {
        const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
        const partnerName = record.partner.name;
        endPartnership(record, yearOf(atMinute), "broke up", atMinute); // i18n-ignore: outcome id
        pushLifeEvent(record, atMinute, "relationship", "NPCLife.event.brokeUpWith", { name: partnerName });
      }
      return;
    }

    // Single, divorced, or widowed: maybe meet someone from their map group.
    // Festivals and good civic mood spark courtships; epidemics chill them.
    // Somebody content alone, or who wants nobody at all, never looks.
    if (!own.partners) return;
    const orient = window.NPCRomance ? window.NPCRomance.orientation(record.name, getProfile(record.name)) : null;
    if (orient?.romantic?.key === "bubbaromantic") return;
    const bondOnly = wantsOnlyBond(own, orient);
    const datingRate = RATES.startDating * record.charisma * web.dating * (bondOnly ? 0.5 : 1);
    if (sampleCount(rng, datingRate * deltaDays) > 0) {
      const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
      const home = record.homeGroup || "__none__";
      let pool = singlesByGroup[home] || [];
      // Long-distance: somebody from another town.
      let apart = false;
      if (ownKey === "long-distance") {
        const away = Object.keys(singlesByGroup).filter(g => g !== home && g !== "__none__" && singlesByGroup[g].length).sort();
        if (away.length) { pool = singlesByGroup[away[Math.floor(rng.next() * away.length)]]; apart = true; }
      }
      // Family is never courted (see HOUSEHOLDS), and both people are asked.
      const candidates = pool.filter(n => n !== record.name && !record.kin?.[n] && pairKind(record.name, n, nowMinute));
      let partnerName = null;
      let external = true;
      if (candidates.length && rng.next() < 0.75) {
        partnerName = candidates[Math.floor(rng.next() * candidates.length)];
        external = false;
      } else {
        partnerName = rng.pick(PARTNER_NAME_BANK);
      }
      const kind = external ? (bondOnly ? QP_BOND : "romantic") : pairKind(record.name, partnerName, nowMinute); // i18n-ignore: bond kind id
      const style = coupleStyle(record.name, external ? null : partnerName, kind, apart);
      const arranged = !!rulesOf(style).arranged;
      const bond = kind === QP_BOND ? { bond: QP_BOND } : {};
      const eventKey = kind === QP_BOND ? "NPCLife.event.formedBond"
        : arranged ? "NPCLife.event.arrangedMarriage" : "NPCLife.event.startedSeeing";
      record.maritalStatus = arranged ? "married" : "dating";
      if (arranged) record.timesMarried = (record.timesMarried || 0) + 1;
      record.partner = Object.assign({ name: partnerName, external }, bond);
      record.partnerSinceMinute = atMinute;
      record.partnerStyle = style;
      pushLifeEvent(record, atMinute, "relationship", eventKey, { name: partnerName });
      if (!external) {
        const other = records?.[partnerName];
        if (other && !other.partner && (other.maritalStatus === "single" || other.maritalStatus === "divorced" || other.maritalStatus === "widowed")) {
          other.maritalStatus = arranged ? "married" : "dating";
          if (arranged) other.timesMarried = (other.timesMarried || 0) + 1;
          other.partner = Object.assign({ name: record.name, external: false }, bond);
          other.partnerSinceMinute = atMinute;
          other.partnerStyle = style;
          pushLifeEvent(other, atMinute, "relationship", eventKey, { name: record.name });
          syncCoupleOpinions(record.name, partnerName, arranged ? 45 : 35);
          if (arranged) { markDev(record, "partner"); markDev(other, "partner"); }
          // Remove both from the singles pool so they aren't double-booked this pass.
          const idx = pool.indexOf(partnerName); if (idx >= 0) pool.splice(idx, 1);
          const homePool = singlesByGroup[home] || [];
          const idx2 = homePool.indexOf(record.name); if (idx2 >= 0) homePool.splice(idx2, 1);
        } else {
          // Candidate got taken earlier in this same pass, date offscreen instead.
          record.partner = Object.assign({ name: partnerName, external: true }, bond);
        }
      }
    }
  }

  // The Horde's crime multiplier for a home group, worked out once per group
  // per game day (HordeGround.crime: 1 anywhere else, up to 3).
  const _hordeCrimeMemo = new Map();
  function hordeCrimeMultiplier(group, nowMinute) {
    const HG = window.HordeGround;
    if (!group || !HG?.crime) return 1;
    const day = Math.floor((Number(nowMinute) || 0) / MINUTES_PER_DAY);
    const hit = _hordeCrimeMemo.get(group);
    if (hit && hit.day === day) return hit.v;
    let v = 1;
    try { v = Number(HG.crime(group)) || 1; } catch (_) { v = 1; }
    if (_hordeCrimeMemo.size > 512) _hordeCrimeMemo.clear();
    _hordeCrimeMemo.set(group, { day, v });
    return v;
  }

  function resolveCrime(record, rng, lastMinute, nowMinute, deltaDays) {
    // A beast is not answerable to anybody's law.
    if (record.nonSentient) return;
    // Bounties drift offscreen in both directions: uncaught crimes sampled
    // below add to them, and old cases slowly go cold (applies to everyone,
    // even NPCs too honest to commit *new* crimes this interval).
    if (record.wantedBounty > 0) {
      const decay = Math.round(RATES.bountyDecay * deltaDays * rng.next());
      record.wantedBounty = Math.max(0, record.wantedBounty - decay);
    }

    // On the Horde's ground the social order has gone (HordeGround): more of
    // the town is willing, and the willing are at it more often.
    const horde = hordeCrimeMultiplier(record.homeGroup, nowMinute);
    const honestAt = 60 + 10 * (horde - 1);
    if (record.honesty >= honestAt) return; // honest NPCs stay clean
    if (record.inPrisonUntilMinute != null) return;

    const dishonesty = (honestAt - record.honesty) / honestAt;
    const web = webRates(record);
    const crimes = sampleCount(rng, RATES.crimeBase * dishonesty * web.crime * horde * deltaDays);
    for (let i = 0; i < crimes; i++) {
      const crime = pickCrime(rng, record.honesty);
      if (!crime) return;
      const atMinute = lastMinute + Math.floor(rng.next() * (nowMinute - lastMinute));
      // Notable citizens get reported; crackdowns (world web) catch extra.
      const caught = rng.next() < 0.5 + record.socialStanding / 400 + web.catchBonus;
      const convicted = caught && rng.next() < 0.8;
      const entry = recordCrime(record, crime, atMinute, caught, convicted);
      if (convicted) {
        const releaseMinute = atMinute + entry.sentenceDays * MINUTES_PER_DAY;
        pushLifeEvent(record, atMinute, "conviction", "NPCLife.event.convicted",
          { crime: entry.name.toLowerCase(), days: entry.sentenceDays });
        markDev(record, "prison");
        if (releaseMinute > nowMinute) {
          record.inPrisonUntilMinute = releaseMinute;
          if (record.employment !== "retired") record.employment = "imprisoned";
        } else {
          entry.served = true;
          pushLifeEvent(record, releaseMinute, "release", "NPCLife.event.servedAndReleased");
        }
        // A conviction costs the NPC their job. (Clamped: the crime and the
        // job may both have been sampled inside this same interval.)
        const open = record.careerHistory.find(seg => seg.toYear === null);
        if (open) {
          open.toYear = Math.max(open.fromYear, yearOf(atMinute));
          open.end = "convicted";
          if (record.employment === "employed") record.employment = "unemployed";
          pushLifeEvent(record, atMinute, "career", "NPCLife.event.lostJob", { job: open.jobName });
        }
        break; // in prison (or just out), no more crimes this interval
      } else if (caught) {
        pushLifeEvent(record, atMinute, "arrest", "NPCLife.event.arrestedReleased", { crime: entry.name.toLowerCase() });
      }
    }
  }

  // Pull live-sim shoplifting events (NPCSimulationCore's CrimeManager) that
  // happened since the last pass into the permanent criminal record.
  function syncLiveCrimeLog(record, lastMinute) {
    const profile = getProfile(record.name);
    if (!profile || !Array.isArray(profile.eventLog)) return;
    const crimes = getCrimes();
    const shoplifting = crimes.find(c => c.key === "shoplifting") || crimes.find(c => c.category === "Theft"); // i18n-ignore: PresetCrimes ids
    if (!shoplifting) return;
    // Entries come from two writers: StoryLogger ({minute,...}) and
    // NPCEmpathize's action log ({gameMin,...}), accept either key.
    const minOf = (e) => e.minute ?? e.gameMin ?? 0;
    let newestSeen = record._lastLogSyncMinute ?? 0;
    for (const entry of profile.eventLog) {
      const atMin = minOf(entry);
      newestSeen = Math.max(newestSeen, atMin);
      if (entry.tag !== "theft_caught") continue;
      if (atMin <= (record._lastLogSyncMinute ?? -1)) continue;
      recordCrime(record, shoplifting, atMin, true, false);
      pushLifeEvent(record, atMin, "arrest", "NPCLife.event.caughtRedHanded",
        { what: window.NPCSim?.StoryLogger?.textOf?.(entry) ?? entry.desc ?? '' });
    }
    record._lastLogSyncMinute = newestSeen;
  }

  // Catalog of cheap, purchasable items for offscreen needs-shopping. Static
  // database data, built once per session.
  let _cheapItemPoolCache = null;
  function _cheapItemPool() {
    if (_cheapItemPoolCache) return _cheapItemPoolCache;
    const pool = [];
    for (let i = 1; i < ((typeof $dataItems !== "undefined" && $dataItems) ? $dataItems.length : 0); i++) {
      const it = $dataItems[i];
      if (it && it.name && !it.name.startsWith("---") && it.price > 0 && it.price <= 2000) {
        pool.push({ id: it.id, name: it.name, price: it.price });
      }
    }
    _cheapItemPoolCache = pool;
    return pool;
  }

  // Implants and prosthetics (NPCSim.Implants, NPCSimulationCore SECTION
  // 11b7): an augment bought at a clinic now and then, and a part lost in a
  // fight made good once its wait is over. Its own random stream.
  function resolveImplants(record, profile, lastMinute, nowMinute, deltaDays) {
    const I = window.NPCSim?.Implants;
    if (!I || !profile || record.child || record.nonSentient) return;
    if (record.inPrisonUntilMinute != null) return;
    I.catchUp(record.name, profile, lastMinute, nowMinute, deltaDays, record.homeGroup,
      (minute, key, params) => pushLifeEvent(record, minute, IMPLANT_EVENT, key, params));
  }
  const IMPLANT_EVENT = "implant"; // i18n-ignore: life event type

  // Day-to-day life between visits: NPCs keep buying what they need (money
  // down, goods up, stock is abstract), and their worldview drifts on the
  // scale of years, so the same person met a decade later reads differently.
  function resolveDailyLife(record, profile, rng, lastMinute, nowMinute, deltaDays) {
    if (!profile) return;
    if (record.inPrisonUntilMinute != null) return;
    // A beast buys nothing: it holds no euros (NPCCreature.mayHoldMoney).
    if (record.nonSentient || window.NPCCreature?.mayHoldMoney?.(profile, record.name) === false) return;

    const buys = sampleCount(rng, RATES.shopping * deltaDays);
    if (buys > 0) {
      const pool = _cheapItemPool();
      profile.itemIds = Array.isArray(profile.itemIds) ? profile.itemIds : [];
      for (let i = 0; i < buys; i++) {
        if ((profile.money ?? 0) <= 0 || !pool.length) break;
        const item = pool[rng.int(0, pool.length - 1)];
        if (item.price > profile.money) continue;
        // Nothing their diet forbids (NPCShared.Diet); the draw is taken
        // either way, so the stream stays as it was.
        const _diet = window.NPCShared?.Diet;
        if (_diet && typeof $dataItems !== "undefined" && !_diet.allows(profile, $dataItems?.[item.id])) continue;
        // Never the Liminal cuffs, never a car's keys off a shelf (NPCShared).
        if (window.NPCShared?.isForbiddenItem?.(item.id) || window.NPCShared?.isCarKeys?.(item.id)) continue;
        profile.money = Math.max(0, profile.money - item.price);
        profile.itemIds.push(item.id);
        if (rng.next() < 0.15) {
          const atMinute = lastMinute + Math.floor(rng.next() * Math.max(1, nowMinute - lastMinute));
          pushLifeEvent(record, atMinute, "purchase", "NPCLife.event.bought", { item: item.name.toLowerCase() });
        }
      }
      // The shared cap, which never throws a bike or a broom away.
      if (window.NPCShared?.capItemIds) window.NPCShared.capItemIds(profile);
      else if (profile.itemIds.length > PROFILE_ITEMIDS_CAP) {
        profile.itemIds.splice(0, profile.itemIds.length - PROFILE_ITEMIDS_CAP);
      }
    }

    // Money changing hands up or down a tier is one of the things that turns
    // a worldview (DIRECTED DEVELOPMENT below).
    const tier = profile.wealthTierBase;
    if (typeof tier === "number") {
      if (typeof record._devWealthTier === "number" && record._devWealthTier !== tier) markDev(record, "wealth");
      record._devWealthTier = tier;
    }
  }

  // --------------------------------------------------------------------------
  // catchUp, the heart of the plugin
  // --------------------------------------------------------------------------

  let _catchUpRunning = false;


  // True in a world created with populationMode "empty" (WorldManager).
  function isEmptyWorld() {
    const WMo = window.NPCShared?.WorldModes;
    if (WMo && !WMo.simulatesPeople()) return true;
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
  }

  // opts.fromClock: the daily catch-up the running clock asks for. It never
  // writes the world files itself; the next save does (WorldManager), so a
  // day turning over while the party walks costs no disk write.
  function catchUp(nowMinute, opts) {
    if (_catchUpRunning) return;
    // Nobody is left to have a life to simulate: no jobs taken, no partners
    // found, no children born. See WorldManager.populationMode. The animals
    // on the farms and in the buildings still live, age and breed
    // (NPCLife_Animals), on their own clock.
    if (isEmptyWorld()) {
      if ($gameSystem && $gameVariables && resolveAnimalWorld) {
        try { resolveAnimalWorld(Number(nowMinute ?? $gameVariables.value(114)) || 0); }
        catch (e) { console.error("[NPCLifeSim] the animal lives failed", e); }
      }
      return;
    }
    if (!$gameSystem || !$gameVariables) return;
    const records = getRecords();
    if (!records) return;
    _catchUpRunning = true;
    try {
      nowMinute = Number(nowMinute ?? $gameVariables.value(114)) || 0;

      // 1. Ensure life records exist for every NPC found within map groups.
      const population = collectPopulation();
      const newNames = [];
      for (const [name, group] of Object.entries(population)) {
        if (records[name]) continue;
        if (newNames.length >= MAX_NEW_RECORDS_PER_PASS) break;
        if (ensureLifeRecord(name, group)) newNames.push(name);
      }
      if (newNames.length) pairNewlyweds(newNames);

      // 2. Compute the elapsed delta since the last resolved pass.
      const last = $gameSystem._npcLifeLastSimMinute;
      if (last === undefined || last === null || last > nowMinute) {
        $gameSystem._npcLifeLastSimMinute = nowMinute;
        return;
      }
      const deltaMinutes = nowMinute - last;
      if (deltaMinutes < MINUTES_PER_DAY) return; // sub-day deltas accumulate
      const deltaDays = deltaMinutes / MINUTES_PER_DAY;
      $gameSystem._npcLifeLastSimMinute = nowMinute;

      // 3. Build the per-group singles pool once for this pass.
      const singlesByGroup = {};
      for (const record of Object.values(records)) {
        // Nobody is paired off with a beast: a non-sentient life is never in
        // the pool the courtships above are drawn from.
        if (record.nonSentient || record.child || record.dead) continue;
        if (record.partner || record.inPrisonUntilMinute != null) continue;
        if (record.maritalStatus === "single" || record.maritalStatus === "divorced" || record.maritalStatus === "widowed") {
          (singlesByGroup[record.homeGroup || "__none__"] = singlesByGroup[record.homeGroup || "__none__"] || []).push(record.name);
        }
      }
      for (const list of Object.values(singlesByGroup)) list.sort();

      // 4. Resolve each NPC's interval, deterministically per (name, interval).
      const seed = worldSeed();
      // How many of each town's people are already elsewhere, so the cap is
      // counted against the world as it stands rather than per NPC.
      const awayByGroup = {};
      for (const record of Object.values(records)) {
        if (record.trip && record.homeGroup) {
          awayByGroup[record.homeGroup] = (awayByGroup[record.homeGroup] || 0) + 1;
        }
      }

      // Room in each town for the children still to come (FAMILY).
      const familyCtx = familyContext(records);
      // Head counts for the relocation floor, counted fresh for this pass.
      window.NPCLifeSim._internal._relocCounts = null;

      for (const record of Object.values(records)) {
        // The dead live no further (DEATH).
        if (record.dead) continue;
        const rng = new LifeRng((nameHash(record.name + "_delta") ^ seed ^ (last >>> 0)) >>> 0);
        const profile = getProfile(record.name);
        // A beast lives a beast's life (NPCLife_Animals): it ages by its
        // kind's lifespan, breeds, is fed or goes hungry and dies, and none
        // of a person's passes (work, love, crime, money, creed) apply.
        if (record.nonSentient) {
          if (resolveAnimalLife) resolveAnimalLife(record, profile, rng, last, nowMinute, deltaDays);
          continue;
        }
        // A child grows up; until eighteen nothing else in a life applies.
        if (record.child && !resolveGrowingUp(record, profile, nowMinute)) continue;
        // Age and illness take some (NATURAL MORTALITY, NPCLife_Death).
        if (resolveMortality && resolveMortality(record, profile, last, nowMinute, deltaDays)) continue;
        resolvePrison(record, last, nowMinute);
        resolveCareer(record, rng, last, nowMinute, deltaDays);
        resolveRelationships(record, rng, last, nowMinute, deltaDays, singlesByGroup);
        resolveFamily(record, profile, rng, last, nowMinute, deltaDays, familyCtx);
        resolveCrime(record, rng, last, nowMinute, deltaDays);
        syncLiveCrimeLog(record, last);
        resolveDailyLife(record, profile, rng, last, nowMinute, deltaDays);
        // Worldview, even behind bars: prison is one of the things that turns it.
        resolveWorldview(record, profile, rng, last, nowMinute, deltaDays);
        resolveConversion(record, profile, deltaDays, nowMinute);
        resolveStanding(record, deltaDays, profile);
        resolveTravel(record, profile, rng, last, nowMinute, deltaDays, awayByGroup);
        resolveRelocation(record, profile, rng, nowMinute, deltaDays);
        resolveImplants(record, profile, last, nowMinute, deltaDays);
      }

      // The animals: litters among the beasts that live here, and the farm
      // and building stock ageing, breeding and being cared for off-screen
      // (NPCLife_Animals).
      try { resolveAnimalWorld?.(nowMinute, deltaDays, last); } catch (e) { console.error("[NPCLifeSim] the animal lives failed", e); }

      // Expeditions that are over, and the month's draft (ADVENTURING BANDS).
      try { resolveBands(nowMinute); } catch (e) { console.error("[NPCLifeSim] resolving the bands failed", e); }

      // The Horde's refugees, a game month at a time (REFUGEES).
      try { resolveRefugees(nowMinute); } catch (e) {
        console.error("[NPCLifeSim] the refugee flows failed:", e);
      }

      // Illness passed on between people who live, work and sleep together
      // over the interval (Health_DiseaseSystem NPC CONTACT SPREAD).
      try { window.DiseaseSystem?.spreadPass?.(nowMinute, deltaDays, last); } catch (e) {
        console.error("[NPCLifeSim] disease spread failed:", e);
      }

      // 5. A real time skip immediately persists the world's npcs.json.
      if (deltaMinutes >= SKIP_FLUSH_MINUTES && !opts?.fromClock && window.WorldManager?.flush) {
        try { window.WorldManager.flush("npcs"); } catch (e) {
          console.error("[NPCLifeSim] world flush failed:", e);
        }
      }
    } finally {
      _catchUpRunning = false;
    }
  }

  // ==========================================================================
  // HOUSEHOLDS, the family a procedural house is found with
  // ==========================================================================
  // A house entered in a procedural town has a whole household living in it
  // (NPCSystem's ProceduralManager.ensureHousehold). What makes them a family
  // is written here, on the life records: who is married to whom, and who is
  // whose parent, child, sibling or grandparent. The same bonds go into the
  // society relationship graph, so the Empathize web and every opinion reader
  // see the family too.
  //
  // spec = { parents: [a, b?], children: [...], grandparents: [g1, g2?] }
  //   parents      the couple (or lone parent) the household is built round
  //   children     their children, each a sibling of the others
  //   grandparents the parents of parents[0]
  // A household of siblings alone is { children: [...] } with no parents.
  // Binding the same household twice changes nothing: an opinion the family
  // has lived its way to since is never reset to the seeded one.
  const KIN_INVERSE = {
    parent: "child", child: "parent", sibling: "sibling",
    grandparent: "grandchild", grandchild: "grandparent",
  };
  const KIN_ORDER = ["parent", "child", "sibling", "grandparent", "grandchild"];
  const KIN_OPINION = { parent: 60, child: 60, sibling: 45, grandparent: 55, grandchild: 55 };
  const SPOUSE_OPINION = 70;

  function seedFamilyBond(nameA, nameB, opinion) {
    for (const [from, to] of [[nameA, nameB], [nameB, nameA]]) {
      const p = getProfile(from);
      if (!p) continue;
      p.relationships = p.relationships || {};
      const rel = p.relationships[to];
      if (rel && rel._familySeeded) continue;
      p.relationships[to] = Object.assign(rel || { meetCount: 50 }, { opinion, _familySeeded: true });
    }
  }

  function setKin(nameA, nameB, kind) {
    if (!nameA || !nameB || nameA === nameB || !KIN_INVERSE[kind]) return;
    const records = getRecords();
    const a = records?.[nameA], b = records?.[nameB];
    if (!a || !b || a.nonSentient || b.nonSentient) return;
    (a.kin = a.kin || {})[nameB] = kind;
    (b.kin = b.kin || {})[nameA] = KIN_INVERSE[kind];
    seedFamilyBond(nameA, nameB, KIN_OPINION[kind]);
  }

  // The couple a household is built round. Whatever partner either of them was
  // rolled (always somebody off the external name bank for a fresh record) is
  // dropped quietly: it was never a person, only a line in a biography.
  function marryHouseholders(nameA, nameB) {
    const records = getRecords();
    const a = records?.[nameA], b = records?.[nameB];
    if (!a || !b || a.nonSentient || b.nonSentient) return;
    if (a.partner?.name !== nameB || b.partner?.name !== nameA) {
      const nowYear = yearOf($gameVariables ? ($gameVariables.value(114) || 0) : 0);
      const wedAfter = 22 + ((nameHash(nameA + "|" + nameB) >>> 0) % 7);
      const since = Math.min(nowYear - 1, Math.max(a.birthYear, b.birthYear) + wedAfter);
      for (const [r, other] of [[a, b], [b, a]]) {
        r.maritalStatus = "married";
        r.timesMarried = Math.max(1, r.timesMarried || 0);
        r.partner = { name: other.name, external: false };
        r.partnerSinceMinute = minuteOfYear(since);
      }
    }
    seedFamilyBond(nameA, nameB, SPOUSE_OPINION);
  }

  // Somebody living in the family home without a spouse in it. A rolled
  // marriage to an outsider becomes a past one; a partner who is a real person
  // of the world is left alone, since they have a life of their own.
  function unmarryHouseholder(name) {
    const record = getRecords()?.[name];
    if (!record || record.nonSentient) return;
    if (record.maritalStatus !== "married" && record.maritalStatus !== "dating") return;
    if (record.partner && !record.partner.external) return;
    const wasMarried = record.maritalStatus === "married";
    record.partner = null;
    record.partnerSinceMinute = null;
    const age = ageAt(record, $gameVariables ? ($gameVariables.value(114) || 0) : 0);
    record.maritalStatus = wasMarried ? (age > 60 ? "widowed" : "divorced") : "single";
  }

  function bindFamily(spec) {
    if (!spec || !getRecords()) return false;
    const parents = (spec.parents || []).filter(Boolean);
    const children = (spec.children || []).filter(Boolean);
    const grandparents = (spec.grandparents || []).filter(Boolean);
    for (const n of [...grandparents, ...parents, ...children]) ensureLifeRecord(n);

    if (parents.length >= 2) marryHouseholders(parents[0], parents[1]);
    else parents.forEach(unmarryHouseholder);
    if (grandparents.length >= 2) marryHouseholders(grandparents[0], grandparents[1]);
    else grandparents.forEach(unmarryHouseholder);
    children.forEach(unmarryHouseholder);

    for (const p of parents) for (const c of children) setKin(p, c, "parent");
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) setKin(children[i], children[j], "sibling");
    }
    for (const g of grandparents) {
      if (parents[0]) setKin(g, parents[0], "parent");
      for (const c of children) setKin(g, c, "grandparent");
    }
    return true;
  }

  // Everyone this person is family to, as { name: "parent" | "child" | ... },
  // read from their side ("parent" means the other one is their child).
  function kinOf(name) {
    const kin = getRecords()?.[name]?.kin;
    return kin ? Object.assign({}, kin) : {};
  }

  // ==========================================================================
  // BIOGRAPHY BUILDER
  // ==========================================================================

  const maritalLabel = (status) => {
    const key = "NPCLife.marital." + status;
    return T.has(key) ? T(key) : String(status || "");
  };
  const outcomeLabel = (outcome) => {
    const key = "NPCLife.outcome." + outcome;
    return T.has(key) ? T(key) : String(outcome || "");
  };

  function buildBiography(name) {
    const record = getRecords()?.[name];
    if (!record) return T('NPCLife.bio.noLife', { name: name });
    const nowMinute = $gameVariables ? ($gameVariables.value(114) || 0) : 0;
    const age = ageAt(record, nowMinute);
    const lines = [];

    // Every place on a life reads through stopLabel, so a beast's whole path
    // comes out as the country it ranged over ("Forest near Bologna") while a
    // person's is unchanged.
    const birthStop = { place: record.birthplace, wild: record.birthWild || null };
    lines.push(T('NPCLife.bio.header', {
      name: name, age: age, date: record.birthDate, place: stopLabel(birthStop),
    }));

    const stops = record.locationHistory || [];
    if (stops.length > 1) {
      lines.push(T('NPCLife.bio.hasLivedIn', { path: stops.map(stopLabel).join(" → ") }));
      const lastMove = stops[stops.length - 1];
      if (lastMove.reason && lastMove.reason !== BORN_HERE) {
        lines.push(T('NPCLife.bio.settledIn', {
          place: stopLabel(lastMove), year: lastMove.fromYear, reason: moveReasonLabel(lastMove.reason),
        }));
      }
    } else {
      lines.push(T('NPCLife.bio.neverLeft', { place: stopLabel(birthStop) }));
    }

    const openJob = (record.careerHistory || []).find(seg => seg.toYear === null);
    if (record.nonSentient) {
      // No trade to report on something that has never held one.
    } else if (record.inPrisonUntilMinute != null) {
      lines.push(T('NPCLife.bio.inPrison', { date: dateStrOf(record.inPrisonUntilMinute) }));
    } else if (record.employment === "retired") {
      lines.push(T.n('NPCLife.bio.retired', record.careerHistory.length, { n: record.careerHistory.length }));
    } else if (openJob) {
      lines.push(T('NPCLife.bio.worksAs', { job: jobLabel(openJob.jobName), year: openJob.fromYear }));
    } else {
      lines.push(T('NPCLife.bio.betweenJobs'));
    }
    const pastJobs = (record.careerHistory || []).filter(seg => seg.toYear !== null);
    if (pastJobs.length) {
      lines.push(T('NPCLife.bio.pastWork', {
        jobs: pastJobs.slice(-3).map(j => T('NPCLife.bio.pastJob', {
          job: jobLabel(j.jobName), from: j.fromYear, to: j.toYear,
        })).join(", "),
      }));
    }

    if (record.maritalStatus === "married" && record.partner) {
      lines.push(T('NPCLife.bio.marriedTo', { name: record.partner.name }));
    } else if (record.maritalStatus === "dating" && record.partner) {
      lines.push(T('NPCLife.bio.seeing', { name: record.partner.name }));
    } else if (record.maritalStatus !== "single") {
      lines.push(maritalLabel(record.maritalStatus) + ".");
    }
    const kin = record.kin || {};
    for (const kind of KIN_ORDER) {
      const names = Object.keys(kin).filter(n => kin[n] === kind);
      if (names.length) {
        lines.push(T('NPCLife.bio.kin' + kind.charAt(0).toUpperCase() + kind.slice(1), { names: names.join(", ") }));
      }
    }
    if (record.exPartners?.length) {
      const ex = record.exPartners[record.exPartners.length - 1];
      lines.push(T('NPCLife.bio.formerPartner', {
        name: ex.name, from: ex.fromYear, to: ex.toYear, outcome: outcomeLabel(ex.outcome),
      }));
    }

    const convictions = (record.criminalRecord || []).filter(c => c.convicted);
    const unsolved = (record.criminalRecord || []).filter(c => !c.caught);
    if (!record.criminalRecord?.length) {
      lines.push(T('NPCLife.bio.cleanRecord'));
    } else {
      if (convictions.length) {
        const served = convictions.filter(c => c.served).length;
        const latest = convictions[convictions.length - 1];
        lines.push(T('NPCLife.bio.criminalRecord', {
          convictions: T.n('NPCLife.bio.convictionCount', convictions.length, { n: convictions.length }),
          served: T.n('NPCLife.bio.sentenceCount', served, { n: served }),
          crime: latest.name, year: latest.year,
        }));
      }
      if (unsolved.length && record.wantedBounty > 0) {
        lines.push(T.n('NPCLife.bio.unsolved', unsolved.length, { n: unsolved.length }));
      }
    }
    lines.push(T('NPCLife.bio.standing', { value: Math.round(record.socialStanding) }));
    return lines.join("\n");
  }

  // ==========================================================================
  // FAMILY NAMESPACE (NPCLife_*.js)
  // ==========================================================================
  // The life simulation is split across the NPCLife_*.js modules listed in
  // js/plugins.js right after this file. Each module reads the helpers it
  // shares with the others off NPCLifeSim._internal and publishes its own
  // there; a name owned by a module that loads later is bound through _late,
  // which NPCLife_Hooks.js (the last module) runs once the whole family is in.
  // NPCLife_Api.js fills in the public API on this same object.

  window.NPCLifeSim = { _internal: { _late: [] } };
  Object.assign(window.NPCLifeSim._internal, {
    ageAt, baselineStanding, bindFamily, BORN_HERE, buildBiography, catchUp, collectPopulation,
    dateStrOf, destinationAtTile, destinationRecord, endPartnership, enforceAdultBirth,
    ensureLifeRecord, getCrimes, getJobs, getProfile, getRecords, groupForPlace, HOMECOMING,
    hordeCrimeMultiplier, isEmptyWorld, isNonSentient, kinOf, lifeEventText, LifeRng, markDev,
    MIN_NPC_AGE, minuteOfYear, MINUTES_PER_DAY, MINUTES_PER_YEAR, MOVE_REASONS, moveReasonLabel,
    nameHash, pairNewlyweds, PARTNER_NAME_BANK, placeCoords, placeLabel, placeOfGroup,
    pushLifeEvent, RATES, recordCrime, resolveCrime, resolveRelationships, sampleCount, setKin,
    syncCoupleOpinions, worldSeed, yearFloatOf, yearOf,
    animalWhereText, resolveAlternation, stopLabel,
  });
  // Live state other modules read or reset: always the binding itself, never a copy.
  Object.defineProperty(window.NPCLifeSim._internal, "_populationCache", { get: () => _populationCache, set: (v) => { _populationCache = v; }, enumerable: true });
  Object.defineProperty(window.NPCLifeSim._internal, "_populationCacheKey", { get: () => _populationCacheKey, set: (v) => { _populationCacheKey = v; }, enumerable: true });

  // Owned by modules that load after this one, bound once the family is in.
  let
    coupleStyle, creedLabel, familyContext, pairKind, partnersOf, QP_BOND, resolveBands,
    resolveConversion, resolveExtraPartners, resolveFamily, resolveGrowingUp, resolveRefugees,
    resolveRelocation, resolveStanding, resolveTravel, resolveWorldview, rulesOf, separateHousehold,
    styleKeyOf, unlinkPartner, wantsOnlyBond, resolveMortality,
    resolveAnimalLife, resolveAnimalWorld, rollAnimalBirth;
  window.NPCLifeSim._internal._late.push(() => ({
    coupleStyle, creedLabel, familyContext, pairKind, partnersOf, QP_BOND, resolveBands,
    resolveConversion, resolveExtraPartners, resolveFamily, resolveGrowingUp, resolveRefugees,
    resolveRelocation, resolveStanding, resolveTravel, resolveWorldview, rulesOf, separateHousehold,
    styleKeyOf, unlinkPartner, wantsOnlyBond, resolveMortality,
    resolveAnimalLife, resolveAnimalWorld, rollAnimalBirth,
  } = window.NPCLifeSim._internal));

  if (typeof PluginManager !== "undefined") {
    PluginManager.registerCommand(pluginName, "NPCLife", args => {
      const name = String(args.eventName || "").trim();
      if (!name) return;
      window.skipLocalization = true;
      $gameMessage.add(buildBiography(name));
      window.skipLocalization = false;
    });

    PluginManager.registerCommand(pluginName, "NPCLifeDebug", args => {
      const name = String(args.eventName || "").trim();
      if (!name) return;
      const record = getRecords()?.[name];
      if (!record) { console.warn(`[NPCLifeSim] no life record for "${name}"`); return; }
      console.groupCollapsed(`[NPCLifeSim] ${name}`);
      console.log(buildBiography(name));
      console.log("Record:", JSON.parse(JSON.stringify(record)));
      console.groupEnd();
    });

    PluginManager.registerCommand(pluginName, "NPCLifeCatchUp", () => {
      catchUp($gameVariables.value(114) || 0);
    });

    console.log("[NPCLifeSimulator] Loaded, persistent NPC life simulation active.");
  }

})();
