// ============================================================================
// Battle System Enhanced - Encounters & Spawning Engine
// For RPG Maker MZ
// ============================================================================

/*:
 * @target MZ
 * @plugindesc v2.0 Encounter module: archetypes, time-based spawning, movement.
 * @author Combined by Claude, modified by OmniLex
 * @pluginName BattleSystemEnhancedEncounters
 *
 * @help
 * ============================================================================
 * BattleSystemEnhancedEncounters, Sub-module
 * ============================================================================
 *
 * Requires BattleSystemEnhanced.js (Core) to be loaded first.
 * Provides encounter/spawning engine: archetype arrays, time-based shifts,
 * procedural generation scaling limits, tile map validation, and enemy movement.
 *
 * ----------------------------------------------------------------------------
 * How wandering enemies are chosen
 * ----------------------------------------------------------------------------
 * There is one rule and it is the place's: the biome decides what you meet.
 * Half the spawns are pitched within five levels of the party's median,
 * whatever the year; the other half is the place's whole ladder, with nothing
 * filtered off it: every creature the place holds can be met, from its level 1
 * vermin to something many times the party's level. How often a level turns up
 * is a spread around a median the CALENDAR sets - level 20 in 2001, climbing
 * +10 a year - so the far ends of the ladder are rarer and never absent. The
 * calendar is the only limit that still bites. This is the world as it is,
 * rather than the world arranged around the party.
 *
 * No enemy is exclusive to a country. Every nation holds every creature its
 * biomes hold, and the nation seed only tints how common each of them is where
 * the party is standing (rare / normal / common - never absent).
 *
 * ----------------------------------------------------------------------------
 * The calendar (the rule above the biome)
 * ----------------------------------------------------------------------------
 * The year moves the band and cannot be argued with:
 *
 *   2001         the biome's own band, untouched
 *   2002 - 2009  the whole band climbs 10 levels a year, so a level 1 party
 *                meets 1-8 in 2001, 11-18 in 2002, 21-28 in 2003 ...
 *   2010 - 2011  the band is thrown away: anything from level 1 to 110 roams
 *   2012 onward  nothing below level 80 is left, and there is no ceiling
 *
 * ----------------------------------------------------------------------------
 * Special biomes (section 4a)
 * ----------------------------------------------------------------------------
 * Some creatures live in one rolled biome variant (Biomes.json specialBiomes:
 * SpiritWoods, Crystals) and nowhere else. They carry <Special> beside a
 * <Biome:> tag naming only that biome, they are kept out of every other roster,
 * and a special-biome map always places at least one of them, whatever the
 * calendar has done to the level band.
 *
 * ----------------------------------------------------------------------------
 * Whose rules apply where
 * ----------------------------------------------------------------------------
 *   Hand-made map with its own encounter list  -> exactly that list, untouched.
 *   Procedural map (636)                       -> always the algorithm above.
 *   Alien surface (GalaxySim landing)          -> its own rules entirely
 *                                                 (section 16), none of this:
 *                                                 the WORLD's level decides,
 *                                                 rolled per planet and read
 *                                                 out by its biosignature.
 *   Anywhere else off Earth (a ship, a station) -> the level of the space it
 *                                                 sits in, over the top of the
 *                                                 biome's own band.
 *
 * ----------------------------------------------------------------------------
 * Movement personalities (<Movement: X> on the enemy note)
 * ----------------------------------------------------------------------------
 * A roaming monster is not a moving trap. Every enemy carries a movement
 * personality that decides three separate things: what it does when nothing is
 * happening (its idle), how it notices the party (sight range, facing cone,
 * line of sight) and what it does once it has (chase, ambush, swoop, charge,
 * stalk, flee, ...). See section 6b for the full table; the keys are
 *
 *   Fixed Random Approach Fleeing Skittish Grazer Sentry Guard Patrol
 *   Territorial Ambusher Lurker Mimic Swooper Stalker Hunter Charger Pack
 *   Erratic Drifter Orbiter Scavenger Coward
 *
 * An enemy with no (or an unknown) tag falls back to a personality derived
 * from its ecology role and archetype, so nothing is left without one.
 * Peaceful mode pacifies every personality: the idle survives, the reaction
 * to the party does not.
 *
 * ----------------------------------------------------------------------------
 * Spawn era (in-game year, applies to both modes and to the sandbox)
 * ----------------------------------------------------------------------------
 *   2001-2009  levels capped at 100, nothing else changes.
 *   2010+      the cap stays at 100, but a quarter of the roaming enemies is
 *              drawn from a level 80-100 pool.
 *   2012+      the cap is lifted and two fifths of the roaming enemies are
 *              drawn from a level 100+ pool.
 * These high-level spawns ignore the party level and how far from home the
 * party has walked, and appear alongside the normally levelled fauna. The sandbox
 * lifts the cap at any year, and scales enemy stats instead (SandboxMode.js).
 *
 * ----------------------------------------------------------------------------
 * Reinforcements (Scene_Battle fights only)
 * ----------------------------------------------------------------------------
 * A fight started against a map "Enemy" event drags in every other roaming
 * monster standing less than JOIN_RANGE (8) tiles from the party, whatever
 * species it is, up to a total of BATTLE_MAX_MEMBERS (6) fighters across the
 * whole battle (base troop + joiners). Joiners are taken nearest-first. Their troops
 * are appended to the one the battle was started with and the combined troop is
 * written into a single scratch $dataTroops slot, reused for every reinforced
 * battle. Each joiner's map event is settled the way the triggering one is:
 * deleted on a win or a recruit, locked with its wounds kept on a flee. Enemies
 * that died before a flee are turned into map corpses on return. A tactical map
 * battle (MapBattleMode.js) already fights everyone where they stand and is
 * never reinforced this way.
 *
 * Loading order:
 *   1. BattleSystemEnhanced.js (Core)
 *   2. BattleSystemEnhancedEncounters.js (THIS PLUGIN)
 *   3. BattleSystemEnhancedState.js
 *   4. BattleSystemEnhancedDeath.js
 *   5. BattleSystemEnhancedMechanics.js
 *   6. BattleSystemEnhancedLevelDisplay.js
 */

(() => {
    'use strict';

    // Ensure core namespace exists
    if (!window.BattleSystemEnhanced) {
        console.error('BattleSystemEnhancedEncounters: Core plugin not loaded!');
        return;
    }
    const BSE = window.BattleSystemEnhanced;

    // ========================================================================
    // 1a. ECOLOGY (predator / prey / hunter food-web behaviour)
    // ========================================================================
    // Each map "Enemy" event carries an ecology role in its enemy note
    // (<Hunter>, <Predator>, <Prey> or <Neutral>). Roles drive who hunts whom
    // on the overworld and who tends to win when two enemy events meet.

    // Awareness radius (tiles) for hunting / fleeing
    BSE.Data.ECOLOGY_AWARENESS = 6;

    // Who each role actively hunts (moves toward and tries to kill)
    const ECO_TARGETS = {
        Hunter:   ['Predator', 'Prey'],
        Predator: ['Hunter', 'Prey', 'Neutral'],
        Prey:     [],
        Neutral:  []
    };

    // Combat dominance: who tends to win when two roles fight
    const ECO_DOMINATES = {
        Hunter:   ['Predator', 'Prey', 'Neutral'],
        Predator: ['Prey', 'Neutral'],
        Prey:     [],
        Neutral:  []
    };

    BSE.Helpers.getEnemyEcology = function(enemyData) {
        if (!enemyData) return 'Neutral';
        // Notes are immutable at runtime; parse the regex once and cache on the
        // shared $dataEnemies object. This is called from per-frame ecology
        // movement/combat scans, so the regex-per-call cost adds up fast.
        if (enemyData._bseEcology !== undefined) return enemyData._bseEcology;
        let v = 'Neutral';
        if (enemyData.note) {
            const m = enemyData.note.match(/<(Hunter|Predator|Prey|Neutral)>/i);
            if (m) {
                const s = m[1].toLowerCase();
                v = s.charAt(0).toUpperCase() + s.slice(1);
            }
        }
        enemyData._bseEcology = v;
        return v;
    };

    BSE.Helpers.getEventEcology = function(event) {
        if (!event || !event._fixedTroopId) return null;
        // Cache the resolved role on the event, keyed on the troop id so it
        // recomputes if the event is ever re-fixed to a different troop.
        if (event._bseEcoTroop === event._fixedTroopId) return event._bseEcoRole;
        const troop = $dataTroops[event._fixedTroopId];
        let role = null;
        if (troop && troop.members.length) {
            const enemy = $dataEnemies[troop.members[0].enemyId];
            role = enemy ? BSE.Helpers.getEnemyEcology(enemy) : 'Neutral';
        }
        event._bseEcoTroop = event._fixedTroopId;
        event._bseEcoRole = role;
        return role;
    };

    // does role a actively hunt role b?
    BSE.Helpers.ecologyChases = function(a, b) {
        return !!(a && b && ECO_TARGETS[a] && ECO_TARGETS[a].indexOf(b) >= 0);
    };
    // does role a dominate role b in a straight fight?
    BSE.Helpers.ecologyDominates = function(a, b) {
        return !!(a && b && ECO_DOMINATES[a] && ECO_DOMINATES[a].indexOf(b) >= 0);
    };

    // Is this event a monster at all? A spawned roamer is called "Enemy", but a
    // hand-placed one on an authored map carries its own name ("Critter",
    // "Bird", a boss's name) and is bound to its troop by its note instead.
    // Reading the name alone left every authored monster outside the whole
    // movement layer: applyEnemyMovement had already switched the engine's own
    // random walk off in favour of a personality that then refused to run for
    // it, so it stood frozen on its tile for good.
    BSE.Helpers.isMonsterEvent = function(ev) {
        if (!ev || !ev.event || !ev.event()) return false;
        return ev.event().name === "Enemy" || ev._fixedTroopId > 0; // i18n-ignore: event name
    };

    // A live, battle-ready monster event
    function isLiveEnemyEvent(ev) {
        // A monster taking part in a map battle (MapBattleMode.js) is off limits
        // to the ecology sim: it is being fought by the party right now, and a
        // wildlife brawl resolving in the background could erase it (and its
        // battler's map position) out from under the fight.
        if (ev && ev._mbmCombatant) return false;
        return !!(ev && !ev._erased && BSE.Helpers.isMonsterEvent(ev) &&
            ev._fixedTroopId > 0);
    }

    // ========================================================================
    // 1. ARCHETYPE LISTS
    // ========================================================================

    // Aquatic Enemy Archetype List - Only spawn in water, move freely in water at normal speed
    BSE.Data.AQUATIC_ENEMY_ARCHETYPES = [
        'Octopus', 'AquaticFish', 'SeaCreature', 'TentacledCreature',
        'DeepSea', 'Coral', 'Whale', 'Shark', 'Jellyfish', 'Crab',
        'Lobster', 'Seahorse', 'Starfish', 'Eel', 'Dolphin', 'Manta',
        'Squid', 'Kraken', 'Leviathan', 'Merfolk', 'Siren', 'WaterElemental',
    ];

    // Amphibious Enemy Archetype List - Spawn on land, faster in water, slower on land
    BSE.Data.AMPHIBIOUS_ENEMY_ARCHETYPES = [
        'Crocodile', 'Penguin', 'Frog', 'SeaTurtle', 'Slime'
    ];

    // Flying Enemy Archetype List - Ignore terrain restrictions, move freely everywhere at normal speed
    BSE.Data.FLYING_ENEMY_ARCHETYPES = [
        'Bird', 'Elemental', 'Ghost',
    ];

    const AQUATIC  = BSE.Data.AQUATIC_ENEMY_ARCHETYPES;
    const AMPHIB   = BSE.Data.AMPHIBIOUS_ENEMY_ARCHETYPES;
    const FLYING   = BSE.Data.FLYING_ENEMY_ARCHETYPES;

    // ========================================================================
    // 2. ARCHETYPE CHECK FUNCTIONS
    // ========================================================================

    BSE.Helpers.getAquaticArchetype = function(archetype) {
        return archetype ? AQUATIC.includes(archetype) : false;
    };

    BSE.Helpers.getAmphibiousArchetype = function(archetype) {
        return archetype ? AMPHIB.includes(archetype) : false;
    };

    BSE.Helpers.getFlyingArchetype = function(archetype) {
        return archetype ? FLYING.includes(archetype) : false;
    };

    /**
     * Is (x, y) open water, for the purpose of standing a creature on it?
     *
     * Region 99 is the hand-painted answer and the only one a static map has.
     * On the procedural map (636) that paint is applied by matching exact tile
     * ids (see the regiondata pass in ProceduralMapBiomeGenerator), and the
     * coastline defeats it from both ends: the sea is drawn as
     * `baseTileId + autotileOffset`, which matches no declared tile id and so
     * stays unpainted, while the dry sand band IS a declared "Beach" tile id
     * and gets painted 99. Left at region 99 alone, a beach therefore has no
     * water an enemy may be placed in and a fish may be placed on the sand.
     * Terrain tag 3 is what water really carries there (the same test
     * MovementInteractionSystem swims, fishes and dives on), so on 636 the tag
     * decides, and region 99 only counts where the tile is impassable too -
     * which the sand band never is.
     */
    BSE.Helpers.isWaterSpawnTile = function(x, y) {
        if (!$gameMap) return false;
        if ($gameMap.mapId() === 636) {
            if ($gameMap.terrainTag(x, y) === 3) return true;
            return $gameMap.regionId(x, y) === 99 && !$gameMap.isPassable(x, y, 2);
        }
        // A hand-made map paints its own water and means it (region 99, or the
        // dive system's cached underwater tiles): its answer is taken as given.
        return BSE.Helpers.isAquaticTile(x, y);
    };

    /**
     * Is (x, y) part of the road surface or its dashed center line in the
     * current procedural road biome? Roaming enemies keep off the carriageway.
     */
    BSE.Helpers.isRoadFeatureTile = function(x, y) {
        const roads = window.ProcGenRoads;
        return !!(roads && roads.isRoadFeatureTileAt && roads.isRoadFeatureTileAt(x, y));
    };

    // ========================================================================
    // 3. TIME-BASED ENEMY SPAWNING SYSTEM
    // ========================================================================

    /**
     * Get current game time in 24-hour format
     */
    BSE.Helpers.getCurrentGameTime = function() {
        const totalMinutes = $gameVariables.value(114) || 0;
        const hour = Math.floor((totalMinutes / 60) % 24);
        const minute = Math.floor(totalMinutes % 60);
        return { hour, minute, totalMinutes };
    };

    /**
     * Determine time period
     * Dawn: 5-7, Dusk: 17-19, Day: 7-17, Night: 19-5
     */
    BSE.Helpers.getTimeOfDay = function() {
        const { hour } = BSE.Helpers.getCurrentGameTime();
        if (hour >= 5 && hour < 7) return 'dawn';
        if (hour >= 7 && hour < 17) return 'day';
        if (hour >= 17 && hour < 19) return 'dusk';
        if (hour >= 19 || hour < 5) return 'night';
    };

    /**
     * Get which activity patterns should spawn at current time
     */
    BSE.Helpers.getApplicableActivityPatterns = function() {
        const timeOfDay = BSE.Helpers.getTimeOfDay();
        switch (timeOfDay) {
            case 'day':
                return ['Diurnal', 'Crepuscular'];
            case 'night':
                return ['Nocturnal', 'Crepuscular'];
            case 'dawn': {
                const rand = Math.random();
                return rand < 0.7 ? ['Crepuscular'] : ['Crepuscular', 'Diurnal'];
            }
            case 'dusk': {
                const rand = Math.random();
                return rand < 0.7 ? ['Crepuscular'] : ['Crepuscular', 'Nocturnal'];
            }
        }
        return ['Crepuscular'];
    };

    /**
     * Get activity pattern from enemy note
     */
    BSE.Helpers.getEnemyActivityPattern = function(enemyData) {
        if (!enemyData || !enemyData.note) return null;
        if (enemyData.note.includes('<Nocturnal>')) return 'Nocturnal';
        if (enemyData.note.includes('<Diurnal>')) return 'Diurnal';
        if (enemyData.note.includes('<Crepuscular>')) return 'Crepuscular';
        return null;
    };

    /**
     * Check if a troop can spawn at current time
     */
    BSE.Helpers.canTroopSpawnAtCurrentTime = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return true;
        const applicablePatterns = BSE.Helpers.getApplicableActivityPatterns();
        let hasTimeRestriction = false;
        for (const member of troop.members) {
            const enemyData = $dataEnemies[member.enemyId];
            if (!enemyData) continue;
            const activityPattern = BSE.Helpers.getEnemyActivityPattern(enemyData);
            if (!activityPattern) continue;
            hasTimeRestriction = true;
            if (applicablePatterns.includes(activityPattern)) return true;
        }
        // Troops with no time-restricted members may spawn at any time; troops
        // with restrictions only spawn when a member's pattern matches now.
        return !hasTimeRestriction;
    };

    /**
     * Filter encounter list by current time
     */
    BSE.Helpers.filterEncountersByTime = function(encounterList) {
        if (!encounterList || !encounterList.length) return encounterList;
        const validTroops = encounterList.filter(enc =>
            BSE.Helpers.canTroopSpawnAtCurrentTime(enc.troopId)
        );
        return validTroops.length > 0 ? validTroops : encounterList;
    };

    // ========================================================================
    // 3b. NATION-SEEDED SPAWN FREQUENCY & LEVEL CAP
    // ========================================================================
    // This section builds the base candidate pool, shared with the level
    // band (see section 4b, which then narrows it). Every enemy of the
    // current biome is eligible across its full level range; the only bias
    // applied here is the current nation. The nation
    // the player is in (Variable 86, the country id) seeds a stable per-enemy
    // frequency class: in one nation a given enemy may be absent, in another
    // rare, common, or abundant. The same (enemy, nation) pair always resolves
    // to the same class, so each nation keeps a consistent local fauna.
    //
    // The level gate is the spawn era (see BSE.Helpers.getSpawnEra): a hard cap
    // that keeps the world at level 100 until the in-game year reaches 2010,
    // plus, from that same year, a high-level pool that is mixed in among the
    // normally levelled fauna.

    const SPAWN_START_YEAR = 2001; // TimeDateSystem epoch (Jan 1 2001)
    const ERA_HIGH_LEVEL_YEAR = 2010; // level 80-100 monsters start roaming
    const ERA_COLLAPSE_YEAR   = 2012; // the paradox completes: the level 90-100 apex roams

    // Share of the roaming enemies on a map drawn from the era's high-level
    // pool instead of from the biome's own level logic.
    const ERA_HIGH_LEVEL_SHARE = 0.25;
    const ERA_COLLAPSE_SHARE   = 0.40;

    // Current in-game year as a fractional number, derived from Variable 114
    // (total game minutes since the Jan 1 2001 epoch used by TimeDateSystem).
    // Read off the calendar itself rather than off an average year length: the
    // world clock is leap-year exact and a world may be created in any year
    // (WorldManager writes the starting date into the same variable), so an
    // averaged 365.25 slowly walks the era boundaries off the 1st of January.
    // The bands move the moment the year does, whichever way time passed:
    // walking, waiting, working a shift, fast travel or the cryogenic pod.
    BSE.Helpers.getCurrentGameYear = function() {
        const totalMinutes = ($gameVariables && $gameVariables.value(114)) || 0;
        const date = new Date(2001, 0, 1, 10, 0, 0);
        date.setMinutes(date.getMinutes() + totalMinutes);
        const year = date.getFullYear();
        const yearStart = Date.UTC(year, 0, 1);
        const yearEnd = Date.UTC(year + 1, 0, 1);
        const at = Date.UTC(year, date.getMonth(), date.getDate(), date.getHours(), date.getMinutes());
        return year + (at - yearStart) / (yearEnd - yearStart);
    };

    // The spawn era of the current in-game year:
    //   cap        - hard level ceiling every troop pool is filtered by
    //   eliteMin   - lowest level of the era's high-level pool (0 = no pool)
    //   eliteMax   - highest level of that pool
    //   eliteShare - fraction of the roaming enemies drawn from it
    //
    // As the Squishing accelerates the fauna gets out of hand: from 2010 the
    // world starts fielding level 80-100 monsters, and from 2012 level 100+
    // ones. They turn up alongside the normally levelled enemies and are picked
    // without consulting the party level or how far from home the party has
    // walked.
    BSE.Helpers.getSpawnEra = function() {
        const year = BSE.Helpers.getCurrentGameYear();
        let era;
        if (year >= ERA_COLLAPSE_YEAR) {
            era = { key: 'collapse', cap: Infinity, eliteMin: ERA_COLLAPSE_ELITE_MIN,
                    eliteMax: Infinity, eliteShare: ERA_COLLAPSE_SHARE };
        } else if (year >= ERA_HIGH_LEVEL_YEAR) {
            era = { key: 'highLevel', cap: ERA_OPEN_CEILING, eliteMin: 80,
                    eliteMax: ERA_OPEN_CEILING, eliteShare: ERA_HIGH_LEVEL_SHARE };
        } else {
            era = { key: 'early', cap: 100, eliteMin: 0,
                    eliteMax: 0, eliteShare: 0 };
        }
        // The sandbox always reaches the whole roster: its enemies are stat
        // scaled to the sandbox rival level rather than held back by the year.
        if ($gameSystem && $gameSystem._isSandboxMode) era.cap = Infinity;
        era.year = year;
        return era;
    };

    // Highest spawnable enemy level right now (see getSpawnEra).
    BSE.Helpers.getSpawnLevelCap = function() {
        return BSE.Helpers.getSpawnEra().cap;
    };

    // ------------------------------------------------------------------
    // The Squishing: what the calendar does to the level band
    // ------------------------------------------------------------------
    // The year is the one term that overrides the biome's band. It does not
    // narrow the band, it MOVES it, so a party that stands still while the
    // years run watches the world get away from it:
    //
    //   2001         the world as written; the biome's own band, untouched
    //   2002 - 2009  the whole band shifts up by 10 levels a year, so a level 1
    //                party meets 1-8 in 2001, 11-18 in 2002, 21-28 in 2003 ...
    //   2010 - 2011  the band is thrown away: anything from level 1 to 100 roams
    //   2012 onward  the paradox completes; nothing below level 80 is left, and
    //                the roaming elites are drawn from the very top of the book
    //
    // The ONE exception is a <Special> creature (section 4a): a special biome's
    // exclusive residents are placed by the guarantee whatever the year says.
    const ERA_YEAR_STEP    = 10;  // levels the band climbs per year to 2010
    // The book stops at level 100 (the apex trio sits at 80 / 92 / 100), so the
    // open ceiling is the top of the book rather than a level nothing reaches.
    const ERA_OPEN_CEILING = 100; // 2010-2011: the whole table is loose
    const ERA_COLLAPSE_ELITE_MIN = 90; // 2012+: the elite pool is the last bracket
    const ERA_COLLAPSE_FLOOR = 80; // 2012+: nothing weaker than this is left

    // Levels the mode's own band is pushed up by, before 2010.
    BSE.Helpers.getYearLevelShift = function() {
        const year = Math.floor(BSE.Helpers.getCurrentGameYear());
        if (year >= ERA_HIGH_LEVEL_YEAR) return 0;
        return Math.max(0, year - SPAWN_START_YEAR) * ERA_YEAR_STEP;
    };

    // The lowest level anything spawns at right now, whatever the mode says.
    BSE.Helpers.getYearLevelFloor = function() {
        const year = Math.floor(BSE.Helpers.getCurrentGameYear());
        if (year >= ERA_COLLAPSE_YEAR) return ERA_COLLAPSE_FLOOR;
        if (year >= ERA_HIGH_LEVEL_YEAR) return 1;
        return BSE.Helpers.getYearLevelShift();
    };

    // Put a raw level band through the calendar. Every band produced anywhere
    // goes through here, which is what makes the rule universal.
    BSE.Helpers.applyEraToBand = function(band) {
        const era = BSE.Helpers.getSpawnEra();
        const sandbox = !!($gameSystem && $gameSystem._isSandboxMode);
        if (!sandbox && era.key === 'collapse') {
            return { min: ERA_COLLAPSE_FLOOR, max: Infinity,
                     center: ERA_COLLAPSE_FLOOR * 1.6 };
        }
        if (!sandbox && era.key === 'highLevel') {
            return { min: 1, max: ERA_OPEN_CEILING, center: ERA_OPEN_CEILING / 2 };
        }
        const shift = BSE.Helpers.getYearLevelShift();
        const cap = era.cap;
        const clamp = v => Math.max(1, Math.min(cap, v));
        const min = clamp(band.min + shift);
        const max = Math.max(min, clamp(band.max + shift));
        return { min: min, max: max, center: (min + max) / 2 };
    };

    // Current nation id: the country the player is standing in (Variable 86).
    // This is the seed for all per-enemy spawn-frequency rolls.
    BSE.Helpers.getNationId = function() {
        return ($gameVariables && $gameVariables.value(86)) || 0;
    };

    // Deterministic 0..1 hash of a (nation seed, enemy id) pair.
    function nationEnemyHash(nationId, enemyId) {
        let h = (Math.imul(nationId | 0, 73856093) ^ Math.imul(enemyId | 0, 19349663)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    // Frequency class -> relative spawn weight. A nation TINTS its fauna, it
    // does not own it: every enemy tagged for a biome can be met in every
    // country that has that biome, and the nation only decides whether it is a
    // rare sight there or the commonest one. Nothing here returns 0 - there is
    // no such thing as an enemy a nation excludes, and which slice of the
    // roster is actually on the table is the level band's decision (section 4b)
    // rather than the map's country.
    function nationFrequencyWeight(r) {
        if (r < 0.30) return 0.25; // rare here
        if (r < 0.80) return 1.0;  // normal
        return 3.0;                // common
    }

    // Relative spawn weight for a single enemy in the current nation.
    BSE.Helpers.getNationEnemyWeight = function(enemyId) {
        return nationFrequencyWeight(nationEnemyHash(BSE.Helpers.getNationId(), enemyId));
    };

    // Stable small integer for a biome name, so a biome can take part in a hash
    // the way a nation id does.
    BSE.Helpers.getBiomeSeed = function(biomeName) {
        const s = String(biomeName || '').toLowerCase().trim();
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
        }
        return h >>> 0;
    };

    // The same tint, seeded on the nation AND the biome together, so a Fields
    // tile of a country does not field its Forest tile's animals at the same
    // frequencies. Like the nation weight above it never returns 0: it makes a
    // creature rarer or commoner in one habitat of one country, never absent.
    // Distance mode does not use it at all (its roster is flat, see
    // buildFromTroops); it is the balanced-mode tint and what the world-map
    // card reads to describe a square.
    BSE.Helpers.getNationBiomeEnemyWeight = function(enemyId, biomeName) {
        const nation = BSE.Helpers.getNationId();
        const biome = BSE.Helpers.getBiomeSeed(biomeName);
        let h = (Math.imul(nation | 0, 73856093) ^
                 Math.imul(enemyId | 0, 19349663) ^
                 Math.imul(biome | 0, 83492791)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        h ^= h >>> 16;
        return nationFrequencyWeight((h >>> 0) / 4294967296);
    };

    // Max enemy level in a troop (0 if none / invalid).
    // Every candidate scan in this file walks the whole troop table asking the
    // same three questions of every row: how strong is it, where does it live,
    // is it one of the exclusives. Each answer is a regex over a note, and the
    // table is ~1500 rows, so a scan that asks them fresh costs milliseconds -
    // which the map-load spawner could afford and the world-map card, which
    // asks again on every step the party takes, could not.
    //
    // They are parsed once and kept on the shared $dataTroops object, the same
    // trick getEnemyArchetype uses. The cache is validated against the members
    // ARRAY, not against a flag: the handful of slots that are rewritten at
    // runtime (the reinforcement scratch slot, the petrodemon, the arena's
    // group troop) all assign a fresh array when they are rebuilt, so a
    // rewritten slot fails the identity check and is re-read.
    function troopFacts(troop) {
        let facts = troop._bseFacts;
        if (facts && facts.members === troop.members) return facts;
        let level = 0;
        let special = false;
        const biomes = new Set();
        for (const member of troop.members) {
            const enemyData = $dataEnemies[member.enemyId];
            if (!enemyData) continue;
            const lvl = BSE.Helpers.getEnemyLevel(enemyData.note);
            if (lvl > level) level = lvl;
            if (BSE.Helpers.isSpecialEnemyData(enemyData)) special = true;
            const biomeMatch = enemyData.note && enemyData.note.match(/<Biome:\s*(.+?)>/i);
            if (biomeMatch) {
                biomeMatch[1].split(',').forEach(b => biomes.add(b.trim().toLowerCase()));
            }
        }
        facts = { members: troop.members, level: level, special: special, biomes: biomes };
        troop._bseFacts = facts;
        return facts;
    }

    BSE.Helpers.getTroopMaxLevel = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return 0;
        return troopFacts(troop).level;
    };

    // Checks if a troop's level is much higher than the party level
    BSE.Helpers.isTroopMuchHigherLevel = function(troopId, partyLevel) {
        if (!troopId || troopId <= 0) return false;
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members || !troop.members.length) return false;
        const pLevel = partyLevel || (BSE.Helpers.getPartyReferenceLevel ? BSE.Helpers.getPartyReferenceLevel() : 1);
        const troopLevel = BSE.Helpers.getTroopMaxLevel(troopId);
        if (troopLevel <= 0) return false;
        const bandMax = (BSE.Helpers.getBalancedLevelBand && BSE.Helpers.getBalancedLevelBand(pLevel).max) || (pLevel + 10);
        return troopLevel > Math.max(pLevel + 10, bandMax);
    };

    // Checks if a map enemy event's troop is much higher level than the party level
    BSE.Helpers.isEventMuchHigherLevel = function(event, partyLevel) {
        if (!event || !event._fixedTroopId || event._fixedTroopId <= 0) return false;
        return BSE.Helpers.isTroopMuchHigherLevel(event._fixedTroopId, partyLevel);
    };

    // Is a troop spawnable under the current level cap?
    BSE.Helpers.troopWithinLevelCap = function(troopId) {
        return BSE.Helpers.getTroopMaxLevel(troopId) <= BSE.Helpers.getSpawnLevelCap();
    };

    // Nation-tinted spawn weight for a troop (its first member is the
    // representative enemy). The nation only makes a troop rarer or commoner,
    // never absent; the zeroes here are the rules that are not about the
    // country: the era's level cap, the special-biome residents and the
    // scratch slots.
    BSE.Helpers.getTroopSpawnWeight = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return 0;
        // The reinforced-battle scratch slot (section 5b) is not a fauna entry.
        if (troop._bseReinforced) return 0;
        if (!BSE.Helpers.troopWithinLevelCap(troopId)) return 0;
        // A <Special> creature lives in one special biome and nowhere else
        // (section 4a). Anywhere else its weight is zero, which drops it out of
        // every list built from this one.
        if (!BSE.Helpers.troopAllowedInBiome(troopId, BSE.Helpers.getMapBiome())) return 0;
        // The world's own answer rides on top of the nation weight, so a
        // goblin world is overrun with goblins without any of the level-band,
        // biome or boss rules having to know about it.
        return BSE.Helpers.getNationEnemyWeight(troop.members[0].enemyId) *
               BSE.Helpers.populationSpawnBoost(troopId);
    };

    // The nations where an enemy is most likely to be encountered (for the
    // Bestiary). Ranks every country by this enemy's frequency class and
    // returns up to `count` {id, name} entries. Every country keeps every
    // creature its biomes hold, so this is "where it is commonest", not "the
    // only places it lives".
    BSE.Helpers.getTopNationsForEnemy = function(enemyId, count) {
        count = count || 3;
        const countries = (window.WorldGen && window.WorldGen.Countries) || [];
        const scored = [];
        for (const c of countries) {
            const r = nationEnemyHash(c.id, enemyId);
            const w = nationFrequencyWeight(r);
            if (w <= 0) continue;
            scored.push({ id: c.id, name: c.country, weight: w, r });
        }
        // higher frequency first; hash as a stable tie-breaker
        scored.sort((a, b) => (b.weight - a.weight) || (b.r - a.r));
        return scored.slice(0, count);
    };

    // ========================================================================
    // 4. MAP BIOME & PROCEDURAL HELPERS
    // ========================================================================

    // The layout variants of a biome are the same habitat as far as the fauna
    // is concerned: "Road cross" and "Road t-left" are a road, "River vertical"
    // is a river, and an island reads as a beach. Enemies are tagged with the
    // base name only, so without this the variants match no troop at all and
    // the map falls back to its own (single-entry) encounter list.
    // Mirrors biomeKey() in ErisDateSystem.js.
    BSE.Helpers.normalizeBiomeName = function(name) {
        if (!name) return name;
        let n = String(name).trim();
        n = n.replace(/\s+(vertical|horizontal|cross|t-(?:up|down|left|right)|corner-(?:up|down)-(?:left|right))$/i, '');
        if (/^Island$/i.test(n)) n = 'Beach';
        return n;
    };

    /**
     * Extract biome from map note or procedural map data
     */
    BSE.Helpers.getMapBiome = function() {
        const norm = BSE.Helpers.normalizeBiomeName;
        if ($gameMap && $gameMap.mapId() === 636) {
            if ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentBiome) {
                if ($gameSystem._procGenData.displayAsIsland) return "Beach";
                if ($gameSystem._procGenData.displayAsBeach) return "Beach";
                return norm($gameSystem._procGenData.currentBiome);
            }
        }
        if (!$dataMap || !$dataMap.note) return null;
        const biomeMatch = $dataMap.note.match(/<Biome:\s*(.+?)>/i);
        return biomeMatch ? norm(biomeMatch[1].trim()) : null;
    };

    /**
     * Simple seeded random number generator
     */
    BSE.Helpers.createSeededRandom = function(seed) {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    };

    /**
     * Get world coordinates from procedural map data
     */
    BSE.Helpers.getWorldCoordinates = function() {
        if ($gameMap && $gameMap.mapId() === 636) {
            if ($gameSystem && $gameSystem._procGenData) {
                return {
                    x: $gameSystem._procGenData.originX || 0,
                    y: $gameSystem._procGenData.originY || 0
                };
            }
        }
        return null;
    };

    /**
     * Check if currently underground
     */
    BSE.Helpers.isUnderground = function() {
        if ($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.biomeLayerStack) {
            return $gameSystem._procGenData.biomeLayerStack.length > 0;
        }
        return false;
    };

    /**
     * Get all boss troops (containing at least one enemy level 70+)
     */
    BSE.Helpers.getBossTroops = function(targetBiome) {
        const bossTroops = [];
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!troop || !troop.members.length || troop._bseReinforced) continue;
            const hasHighLevel = troop.members.some(member => {
                const enemyData = $dataEnemies[member.enemyId];
                if (!enemyData) return false;
                return BSE.Helpers.getEnemyLevel(enemyData.note) >= 70;
            });
            if (!hasHighLevel) continue;
            if (!BSE.Helpers.troopAllowedInBiome(i, targetBiome)) continue;
            if (targetBiome && !BSE.Helpers.troopMatchesBiome(i, targetBiome)) continue;
            if (!BSE.Helpers.troopWithinLevelCap(i)) continue; // respect level cap
            bossTroops.push(i);
        }
        return bossTroops;
    };

    // Deterministically pick one troop id from a list, seeded on the current
    // world tile so the same procedural map always resolves to the same troop.
    BSE.Helpers.pickSeededTroop = function(troopIds) {
        if (!troopIds || troopIds.length === 0) return null;
        const worldCoords = BSE.Helpers.getWorldCoordinates();
        let seed = 12345;
        if (worldCoords) {
            const underground = BSE.Helpers.isUnderground() ? 1 : 0;
            seed = worldCoords.x + worldCoords.y * 1000 + underground * 1000000;
        }
        const seededRandom = BSE.Helpers.createSeededRandom(seed);
        const randomIndex = Math.floor(seededRandom() * troopIds.length);
        return troopIds[randomIndex];
    };

    /**
     * Get a seeded boss troop for the first enemy event
     */
    BSE.Helpers.getSeededBossTroop = function(targetBiome) {
        return BSE.Helpers.pickSeededTroop(BSE.Helpers.getBossTroops(targetBiome));
    };

    // The era's high-level pool: every troop whose level falls inside the era
    // band (80-100 from 2010, 100+ from 2012), as weighted {troopId, weight}
    // entries ready for the same weighted pick the encounter list uses.
    //
    // Neither the party level nor the distance from home is consulted, which
    // is the whole point of these spawns. Troops matching the
    // local biome are preferred so the monsters still belong to the place they
    // turn up in, and the fallback is limited to biome-tagged fauna so bosses
    // and alien species never leak into a roaming spawn. The nation frequency
    // survives as a soft weight with a floor: these are not local fauna, so a
    // nation never suppresses them entirely.
    BSE.Helpers.getEraElitePool = function(targetBiome, era) {
        era = era || BSE.Helpers.getSpawnEra();
        if (!era.eliteMin) return [];
        const biomeMatched = [];
        const anyFauna = [];
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!troop || !troop.members.length || troop._bseReinforced) continue;
            const lvl = BSE.Helpers.getTroopMaxLevel(i);
            if (lvl < era.eliteMin || lvl > era.eliteMax) continue;
            const lead = $dataEnemies[troop.members[0].enemyId];
            if (!lead || !lead.note || !/<Biome:/i.test(lead.note)) continue;
            // The `anyFauna` fallback below reaches the whole table, so the
            // special-biome residents have to be turned away here (section 4a).
            if (!BSE.Helpers.troopAllowedInBiome(i, targetBiome)) continue;
            const entry = {
                troopId: i,
                weight: Math.max(0.25, BSE.Helpers.getNationEnemyWeight(troop.members[0].enemyId)),
                regionId: 0
            };
            if (targetBiome && BSE.Helpers.troopMatchesBiome(i, targetBiome)) {
                biomeMatched.push(entry);
            }
            anyFauna.push(entry);
        }
        return biomeMatched.length > 0 ? biomeMatched : anyFauna;
    };

    // ========================================================================
    // 4a. SPECIAL BIOMES AND THE CREATURES THAT LIVE NOWHERE ELSE
    // ========================================================================
    // A special biome is a rare variant an ordinary world tile can roll into
    // (Biomes.json `specialBiomes`: Forest -> SpiritWoods, Snow / Tundra /
    // Permafrost -> Crystals). A handful of creatures are native to one of them
    // and to nothing else: they carry <Special> beside a <Biome:> tag naming
    // only the special biome they belong to.
    //
    // Two rules follow, and they are the whole feature:
    //
    //   1. a <Special> creature is kept out of every other biome's roster,
    //      including the relaxed fallbacks (era elites, the boss pools, the
    //      "nothing matched the biome" catch-all) that otherwise reach across
    //      the whole fauna table;
    //   2. a special-biome map ALWAYS places at least one of its own residents,
    //      whatever the level band says.
    //
    // Which biomes are special is read from Biomes.json rather than listed
    // here, so declaring a new variant there is all it takes. Alien surfaces are
    // left out of the reading: a GalaxySim landing carries its own fauna.
    let _specialBiomeSet = null;
    BSE.Helpers.getSpecialBiomeNames = function() {
        if (_specialBiomeSet) return _specialBiomeSet;
        const set = new Set();
        const biomes = (window.WorldGen && window.WorldGen.Biomes) || [];
        for (const b of biomes) {
            if (!b || !b.name || /^Alien/i.test(b.name)) continue;
            if (!Array.isArray(b.specialBiomes)) continue;
            for (const s of b.specialBiomes) {
                if (typeof s === 'string' && s) set.add(s.toLowerCase().trim());
            }
        }
        // Only cache once the biome table has actually loaded, so an early call
        // does not freeze an empty set for the session.
        if (set.size > 0) _specialBiomeSet = set;
        return set;
    };

    BSE.Helpers.isSpecialBiome = function(biomeName) {
        if (!biomeName) return false;
        const key = String(BSE.Helpers.normalizeBiomeName(biomeName)).toLowerCase().trim();
        return BSE.Helpers.getSpecialBiomeNames().has(key);
    };

    // <Special>: native to a special biome, and to nothing else.
    BSE.Helpers.isSpecialEnemyData = function(enemyData) {
        return !!(enemyData && enemyData.note && /<Special>/i.test(enemyData.note));
    };

    BSE.Helpers.isSpecialTroop = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return false;
        return troopFacts(troop).special;
    };

    // ------------------------------------------------------------------
    // Who the world is populated with (WorldManager.populationMode). The
    // fauna answers to it exactly as the crowd does:
    //
    //   monster , nothing that reads as a person roams the map either, so a
    //             troop holding a Humanoid or DoubleHeadedHumanoid creature is
    //             not spawnable anywhere.
    //   empty   , a <Talk> creature is one that can be spoken to and recruited
    //             (EnemyTalkSystem), which makes it a person as far as an empty
    //             world is concerned: there is nobody left to talk to, so none
    //             of them is placed. The folk archetypes go with them, talkers
    //             or not - an empty world is empty of PEOPLE, and a mute ogre
    //             is still one of the peoples. Everything else mute still roams.
    //   zombie  , the plague ate everything that thinks. What is left is the
    //             dead that walk (Undead), the animals that did not catch it
    //             (Beast), and whatever the outbreak made of the rest - which
    //             is anything with "zombie" in its name, at any archetype.
    //             Nothing else is placed.
    //   goblin  , nothing is forbidden, but goblins are what this world is
    //             made of, so they are weighted far above everything else
    //             (see populationSpawnBoost).
    //   death   , nothing roams at all; handled at placement time by erasing
    //             every Enemy event (see the spawnEnemiesFromEncounters hook
    //             at the bottom of this file), not by this filter.
    // ------------------------------------------------------------------
    BSE.Helpers.getPopulationMode = function() {
        const WM = window.WorldManager;
        return (WM && typeof WM.populationMode === "function")
            ? WM.populationMode() : "normal";
    };

    // ------------------------------------------------------------------------
    // The world of chaos: every roster is drawn out of the hat
    // ------------------------------------------------------------------------
    // A chaos world keeps every troop it always had, and every rule about where
    // and when a troop turns up, but the creatures INSIDE a troop are not the
    // ones the database put there: each member is swapped for a random enemy.
    // The swap is deterministic (window.ChaosWorld seeds it from the world) and
    // it is done once, to the whole table, before anything reads it, so the
    // creature on the map, the creature in the fight and the creature in the
    // bestiary are always the same creature. What an enemy IS never changes:
    // its parameters, skills, drops and look are its own.
    //
    // Bosses stay out of the hat: a <Boss> is a written encounter, and a world
    // where every third rat is one is a world nobody can walk across.
    let chaosPool = null;
    function chaosEnemyPool() {
        if (chaosPool) return chaosPool;
        chaosPool = [];
        for (let i = 1; i < $dataEnemies.length; i++) {
            const data = $dataEnemies[i];
            if (!data || !data.name) continue;
            if (/<Boss>/i.test(data.note || "")) continue;
            chaosPool.push(i);
        }
        return chaosPool;
    }

    let chaosTroopsKey = null;
    BSE.Helpers.ensureChaosTroops = function() {
        const CW = window.ChaosWorld;
        if (!CW || !CW.active() || !$dataTroops || !$dataEnemies) return;
        const WM = window.WorldManager;
        const key = String((WM && WM.activeWorldName) || "world");
        if (chaosTroopsKey === key) return;
        chaosTroopsKey = key;
        chaosPool = null;
        const pool = chaosEnemyPool();
        if (!pool.length) return;
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!troop || !troop.members || !troop.members.length) continue;
            // The roster the database wrote is kept, so re-rolling for another
            // world starts from the authored troop rather than from a troop
            // some earlier world already scrambled.
            if (!troop._chaosBase) troop._chaosBase = troop.members.map(m => m.enemyId);
            troop.members.forEach((m, n) => {
                m.enemyId = pool[Math.floor(CW.roll(key + ":troop:" + i + ":" + n) * pool.length) % pool.length];
            });
        }
    };

    // Whether a creature reads as a person. Kept as one list, shared with the
    // sprite wardrobe and the creature-creation board (SpriteCatalog).
    BSE.Helpers.isPeopleArchetype = function(archetype) {
        const people = (window.SpriteCatalog && window.SpriteCatalog.PEOPLE_ARCHETYPES) ||
            ["Humanoid", "DoubleHeadedHumanoid"];
        return people.includes(archetype);
    };

    // The peoples, for the purpose of who is allowed to roam a world. The
    // folk are the sprite catalog's people: elves, goblins, dwarves and ogres
    // are no longer archetypes of their own, they are humanoids wearing their
    // own faces, so there is nothing left to add on top of that list.
    BSE.Helpers.isFolkArchetype = function(archetype) {
        if (!archetype) return false;
        return BSE.Helpers.isPeopleArchetype(archetype);
    };

    // A goblin is spelled in the name now that it is not an archetype: the
    // database says so in the enemy's own name ("Goblin Archer"), which is the
    // same rule the wardrobe narrows a goblin world by (SpriteCatalog.isGoblinSheet).
    const GOBLIN_NAME_RE = /goblin/i;

    BSE.Helpers.isGoblinEnemyData = function(data) {
        return !!data && GOBLIN_NAME_RE.test(String(data.name || ""));
    };

    // What a zombie world still holds. The archetypes are the two that survive
    // an outbreak in kind; the name test is what catches everything the
    // outbreak CONVERTED, which the database spells out in the enemy's own name
    // ("Zombie Miner", "Zombified Hound") rather than in its archetype.
    const ZOMBIE_WORLD_ARCHETYPES = ["Beast", "Undead"];
    const ZOMBIE_NAME_RE = /zombie|zombif/i;

    BSE.Helpers.isZombieWorldEnemyData = function(data) {
        if (!data) return false;
        if (ZOMBIE_NAME_RE.test(String(data.name || ""))) return true;
        return ZOMBIE_WORLD_ARCHETYPES.includes(BSE.Helpers.getEnemyArchetype(data));
    };

    // Can this troop be placed at all in the world being played? Taken on the
    // troop DATA, because isSpawnableTroopData (which every candidate scan in
    // this file starts from, including the ones that never reach the biome
    // rule) is handed the object rather than the id.
    BSE.Helpers.troopDataAllowedInPopulation = function(troop) {
        const mode = BSE.Helpers.getPopulationMode();
        if (!troop || !troop.members || !troop.members.length) return true;
        // A <Boss> creature is a hand-authored encounter, not ambient fauna: it
        // never turns up through the ordinary biome spawn roster, the era
        // elites or the level-band boss pools alike. An empty world is the one
        // exception, since nothing else is left roaming it to meet the party.
        if (mode !== "empty" && troop.members.some(m => {
            const data = $dataEnemies[m.enemyId];
            return !!(data && /<Boss>/i.test(data.note || ""));
        })) {
            return false;
        }
        if (mode !== "monster" && mode !== "empty" && mode !== "zombie") return true;
        // One disallowed member disqualifies the troop: a troop is spawned
        // whole, so there is no way to place "most" of it.
        return !troop.members.some(m => {
            const data = $dataEnemies[m.enemyId];
            if (!data) return false;
            const archetype = BSE.Helpers.getEnemyArchetype(data);
            if (mode === "zombie") return !BSE.Helpers.isZombieWorldEnemyData(data);
            // Both remaining modes bar the peoples; the empty world bars
            // everything that can be spoken to on top of them.
            if (BSE.Helpers.isFolkArchetype(archetype)) return true;
            return mode === "empty" && String(data.note || "").includes("<Talk>");
        });
    };

    BSE.Helpers.troopAllowedInPopulation = function(troopId) {
        return BSE.Helpers.troopDataAllowedInPopulation($dataTroops[troopId]);
    };

    // How much likelier this troop is than its nation weight alone would make
    // it. A goblin world is overrun with goblins: they are not the only thing
    // that roams, but they are far the commonest sight.
    const GOBLIN_WORLD_BOOST = 12;
    BSE.Helpers.populationSpawnBoost = function(troopId) {
        if (BSE.Helpers.getPopulationMode() !== "goblin") return 1;
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members || !troop.members.length) return 1;
        return troop.members.some(m => BSE.Helpers.isGoblinEnemyData($dataEnemies[m.enemyId]))
            ? GOBLIN_WORLD_BOOST : 1;
    };

    // Rule 1. Every candidate scan runs through this: a special troop is
    // spawnable only on a special-biome map its own <Biome:> tag names. An
    // ordinary troop is never affected. The population rule rides here too, so
    // every scan in the file is covered by the one gate.
    BSE.Helpers.troopAllowedInBiome = function(troopId, biomeName) {
        if (!BSE.Helpers.troopAllowedInPopulation(troopId)) return false;
        if (!BSE.Helpers.isSpecialTroop(troopId)) return true;
        return BSE.Helpers.isSpecialBiome(biomeName) &&
            BSE.Helpers.troopMatchesBiome(troopId, biomeName);
    };

    // Rule 2. The exclusive residents of one special biome, as weighted
    // {troopId, weight} entries ready for the same weighted pick the encounter
    // list uses. The nation frequency survives as a soft weight with a floor
    // (as it does for the era elites): these are the biome's own fauna, and a
    // nation must not be able to empty it.
    BSE.Helpers.getSpecialBiomeTroops = function(biomeName) {
        if (!BSE.Helpers.isSpecialBiome(biomeName)) return [];
        const out = [];
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!BSE.Helpers.isSpawnableTroopData(troop)) continue;
            if (!BSE.Helpers.isSpecialTroop(i)) continue;
            if (!BSE.Helpers.troopMatchesBiome(i, biomeName)) continue;
            // A special biome's guaranteed resident is still subject to who
            // the world is populated with: this scan does not go through
            // troopAllowedInBiome (it IS the biome rule), so it asks here.
            if (!BSE.Helpers.troopAllowedInPopulation(i)) continue;
            out.push({
                troopId: i,
                weight: Math.max(0.25, BSE.Helpers.getNationEnemyWeight(troop.members[0].enemyId)) *
                        BSE.Helpers.populationSpawnBoost(i),
                regionId: 0
            });
        }
        return out;
    };

    // ========================================================================
    // 4b. SPAWN BAND (level selection on top of the nation-weighted pool)
    // ========================================================================
    // Biome is the only rule there is: the biome's whole roster. Every creature
    // whose <Biome:> tag names this place can be met, at any level up to 100,
    // and neither the party nor the ground has any say in which. The calendar
    // is the only limit that still bites (nothing under level 80 from 2012).
    //
    // The nation-seeded distribution rides on top of it: the country the player
    // is in decides which enemies are rare / common there, never which are
    // absent. The special-biome guarantee (section 4a) sits above all of it.
    //
    // The helpers below keep their (mode, refLevel) signatures because other
    // plugins call them (VoxelWorldEntities), but the mode argument is history:
    // there is one band and the biome owns it.
    BSE.Helpers.getSpawnMode = function() {
        return 'biome';
    };

    // The reference level the band is built around. Biome ignores it - its band
    // is the place's own ladder - but callers still pass one in.
    BSE.Helpers.getModeRefLevel = function(mode, partyLevel) {
        return partyLevel;
    };

    // The level window to draw from, calendar already applied.
    BSE.Helpers.getSpawnBand = function() {
        return BSE.Helpers.getBiomeLevelBand();
    };

    // Narrow a candidate list to the band. Every branch ends in a nearest-level
    // fallback, so a list is never emptied.
    //
    // Half the spawns are pitched five levels either side of the party's median
    // (see getBiomeTetherBand). The other half is the biome's whole ladder,
    // nothing filtered off it: the era band is the only cut, and how often a
    // level turns up is the spread around the calendar's median (see
    // biomeSpreadWeight), so the small fry and the monsters far over the
    // party's head both stay possible.
    BSE.Helpers.filterTroopsForMode = function(encList, mode, band) {
        if (BSE.Helpers.rollBiomeTether()) {
            return BSE.Helpers.filterTroopsInLevelBand(
                encList, BSE.Helpers.getBiomeTetherBand());
        }
        return BSE.Helpers.spreadBiomeRoster(
            BSE.Helpers.filterTroopsInLevelBand(encList, band));
    };

    // How likely a creature of `troopLevel` is to be the one met by a party of
    // `refLevel`. Never zero: every resident of the biome stays possible, the
    // far-off ones just turn rare. Read by the world-map card's place profile.
    const DISTANCE_FALLOFF = 12; // levels of slack before a creature thins out

    BSE.Helpers.levelAffinityWeight = function(troopLevel, refLevel) {
        const d = Math.abs((troopLevel || 1) - (refLevel || 1)) / DISTANCE_FALLOFF;
        return 1 / (1 + d * d);
    };

    // Median party level (>= 1), the reference level every caller starts from.
    BSE.Helpers.getPartyReferenceLevel = function() {
        const party = $gameParty ? $gameParty.members() : [];
        if (!party.length) return 1;
        return Math.max(1, Math.round(BSE.Helpers.getMedianLevel(party)));
    };

    // The fair-fight window for a party of median level L: what the damage
    // layer considers a winnable spread. Nothing spawns out of it any more (the
    // biome decides that); it is the yardstick the "much higher level" warning
    // and the boss-grade checks measure a troop against.
    //
    //   L =  1  ->   1 - 11      L = 10  ->  10 - 20
    //   L = 25  ->  25 - 35      L = 50  ->  50 - 60
    //
    // The floor is the party's own level - a level 40 party has no business
    // being sent rats - and the ceiling is a flat ten levels above it at every
    // level, which is the same number the damage layer is built around: the
    // party can fell anything within levelGapFair (+6), can still take
    // something within levelGapHard (+8) at a cost, and the last couple of
    // levels of the band are the ones they are meant to walk away from. A
    // ceiling that widened with the party (it used to open by another level
    // per ten they had) drifted past that reading and started fielding fights
    // that were not losable so much as unplayable. The era cap still applies
    // on top.
    const BALANCED_SPREAD = 10;     // levels above the party, at every level

    BSE.Helpers.getBalancedLevelBand = function(refLevel) {
        const lvl = Math.max(1, Math.round(refLevel || 1));
        return BSE.Helpers.applyEraToBand({ min: lvl, max: lvl + BALANCED_SPREAD });
    };

    // The place's whole roster, drawn half around the party and half from
    // anywhere on the ladder.
    //
    // The wide band is the widest one any mode produces - level 1 to
    // BIOME_MODE_CEILING - because the mode's whole idea is that a biome fields
    // everything that lives in it and nothing above decides which of it you are
    // "ready" for. The pool it is applied to is still the biome's own fauna
    // (see the candidate list in spawnEnemiesFromEncounters), so what widens is
    // the level range, never the roster.
    //
    // Half the spawns come out of that band, so what walks a square is still
    // whatever the place happens to hold - the small fry and something many
    // times the party's own level alike, spread around the calendar's median
    // (see biomeSpreadWeight) and never withheld. The other half is tethered
    // to the party: five levels either side of the median, walked up by the
    // same yearly climb every other mode answers to, so a biome that stood at
    // the party's shoulder in 2001 stands well over their head by 2007 without
    // the mode ever turning into Party Level. Which of the two a given enemy
    // draws from is rolled per enemy event, not per map, so one square mixes
    // both.
    //
    // The ceiling is 110 - the same one the calendar opens the world to in
    // 2010 - and it holds for both halves of the split until 2012, when the
    // collapse takes every ceiling off and leaves nothing under level 80
    // standing anywhere. Before that the wide band's floor stays at 1: a biome
    // mode that pushed its own floor up with the year would be Party Level
    // wearing a different name, which is what the tethered half is for.
    const BIOME_MODE_CEILING = ERA_OPEN_CEILING;
    // Half of what a biome fields is pitched at the party, whatever the year
    // says. The other half is the place's own roster, small fry included.
    const BIOME_TETHERED_SHARE = 0.50;  // spawns pitched at the party
    const BIOME_TETHER_SPREAD  = 5;     // levels either side of the median

    // The other half is the biome's own ladder, and nothing on it is filtered
    // out: every creature the place holds can be met, small fry and monsters
    // far over the party's head alike. What decides how often is a spread
    // around a median, and the median is the CALENDAR's, not the party's -
    // BIOME_SPREAD_MEDIAN in 2001, walked up by the same +10 a year every
    // other mode answers to. A creature that stands far from that median is
    // rarer, never absent: the weight tapers and then holds at
    // BIOME_SPREAD_FLOOR, so the level 1 vermin and the level 110 horror both
    // keep a real chance of walking out of a 2001 square.
    const BIOME_SPREAD_MEDIAN = 20;   // the ladder's centre of mass in 2001
    const BIOME_SPREAD_WIDTH  = 30;   // levels either side before it halves
    const BIOME_SPREAD_FLOOR  = 0.25; // rarest anything ever gets

    BSE.Helpers.getBiomeLevelBand = function() {
        const era = BSE.Helpers.getSpawnEra();
        if (era.key === 'collapse') {
            return { min: ERA_COLLAPSE_FLOOR, max: Infinity, center: ERA_COLLAPSE_FLOOR * 1.6 };
        }
        return { min: 1, max: BIOME_MODE_CEILING, center: BIOME_MODE_CEILING / 2 };
    };

    // The tethered half: the window around the party's median level.
    //
    // The centre is the median plus the calendar's own shift (+10 a year to
    // 2010, the same term Balanced and Distance are moved by), never below the
    // floor the year has left standing and never above the mode's ceiling. The
    // window is BIOME_TETHER_SPREAD either side of it, which is inside the fair
    // gap the damage layer is built around, so a tethered spawn is a fight the
    // party can actually take.
    BSE.Helpers.getBiomeTetherBand = function() {
        const era = BSE.Helpers.getSpawnEra();
        const ceiling = era.key === 'collapse' ? Infinity : BIOME_MODE_CEILING;
        const floor = Math.max(1, BSE.Helpers.getYearLevelFloor());
        const median = BSE.Helpers.getPartyReferenceLevel();
        const raw = median + BSE.Helpers.getYearLevelShift();
        const center = Math.max(floor, Math.min(ceiling, raw));
        const min = Math.max(1, floor, center - BIOME_TETHER_SPREAD);
        const max = Math.max(min, Math.min(ceiling, center + BIOME_TETHER_SPREAD));
        return { min: min, max: max, center: center };
    };

    // Which of the two halves this spawn is drawn from. Rolled per enemy event.
    BSE.Helpers.rollBiomeTether = function() {
        return Math.random() < BIOME_TETHERED_SHARE;
    };

    // The base level the world is pitched at right now: the party's median or
    // the year's floor, whichever stands higher.
    BSE.Helpers.getBiomeBaseLevel = function() {
        return Math.max(1, BSE.Helpers.getPartyReferenceLevel(),
            BSE.Helpers.getYearLevelFloor());
    };

    // Where the untethered half's ladder is centred: the calendar's own median,
    // never under the floor the year has left standing and never over the
    // mode's ceiling.
    BSE.Helpers.getBiomeSpreadMedian = function() {
        const era = BSE.Helpers.getSpawnEra();
        const ceiling = era.key === 'collapse' ? Infinity : BIOME_MODE_CEILING;
        const floor = Math.max(1, BSE.Helpers.getYearLevelFloor());
        const raw = BIOME_SPREAD_MEDIAN + BSE.Helpers.getYearLevelShift();
        return Math.max(floor, Math.min(ceiling, raw));
    };

    // How often a creature of this level turns up in that half. Never zero:
    // the curve tapers away from the median and then holds at the floor, so
    // nothing the biome holds is ever off the table.
    BSE.Helpers.biomeSpreadWeight = function(troopLevel) {
        const d = Math.abs((troopLevel || 1) - BSE.Helpers.getBiomeSpreadMedian()) /
            BIOME_SPREAD_WIDTH;
        return Math.max(BIOME_SPREAD_FLOOR, 1 / (1 + d * d));
    };

    // Apply that spread to an encounter list, leaving the entries themselves
    // alone. Nothing is dropped, so the list can never be emptied.
    BSE.Helpers.spreadBiomeRoster = function(encList) {
        if (!encList || !encList.length) return encList;
        return encList.map(enc => Object.assign({}, enc, {
            weight: (enc.weight || 1) * BSE.Helpers.biomeSpreadWeight(
                BSE.Helpers.getTroopMaxLevel(enc.troopId))
        }));
    };

    // TempleInside structure biome: keep only troops far above the party's
    // median level (at least +10 or 1.5x, capped at 100), in either spawn
    // mode. Relaxes the threshold in steps so a map is never left without
    // spawnable enemies.
    BSE.Helpers.filterTroopsWellAboveLevel = function(encList, refLevel) {
        if (!encList || !encList.length) return encList;
        const HARD_CAP = 100;
        const levels = encList.map(enc => BSE.Helpers.getTroopMaxLevel(enc.troopId));
        const thresholds = [
            Math.min(HARD_CAP, Math.max(refLevel + 10, Math.ceil(refLevel * 1.5))),
            refLevel + 5,
            refLevel + 1
        ];
        for (const t of thresholds) {
            const above = encList.filter((enc, i) => levels[i] >= t && levels[i] <= HARD_CAP);
            if (above.length > 0) return above;
        }
        return encList;
    };

    // ------------------------------------------------------------------
    // The structure catalogue, read at spawn time
    // ------------------------------------------------------------------
    // ProceduralMapStructureGenerator owns the list of generated structures and
    // what lives in each. This plugin loads before it, so the catalogue is read
    // when a map is populated rather than at load time.
    BSE.Helpers.getStructure = function(biomeName) {
        const D = window.ProcGenDungeon;
        return (D && typeof D.structure === 'function') ? D.structure(biomeName) : null;
    };

    // A troop belongs here if ANY of its members carries ANY of these <Biome:>
    // tags. A structure borrows several rosters, not one: an underground
    // station is Metro and City and Abandoned, and reading it as a single
    // biome name threw two thirds of its inhabitants away.
    BSE.Helpers.troopMatchesAnyBiome = function(troopId, biomes) {
        if (!biomes || !biomes.length) return false;
        for (const b of biomes) if (BSE.Helpers.troopMatchesBiome(troopId, b)) return true;
        return false;
    };

    // ...and it is at home here if any member's <Archetype:> is one the place
    // is known for. This is what makes an ossuary undead and a bunker robotic
    // when both borrow rosters that hold a bit of everything.
    BSE.Helpers.troopMatchesArchetypes = function(troopId, archetypes) {
        if (!archetypes || !archetypes.length) return false;
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return false;
        for (const member of troop.members) {
            const data = $dataEnemies[member.enemyId];
            if (!data) continue;
            const arch = BSE.Helpers.getEnemyArchetype(data);
            if (arch && archetypes.indexOf(arch) >= 0) return true;
        }
        return false;
    };

    // The danger ladder. A structure sits on one rung of it and that rung
    // decides what it spawns relative to the party:
    //   safe      below the party's own band - a cellar, a smuggler's cache
    //   ordinary  the band the biome would give anywhere else
    //   hostile   the band, shifted up: a forge, a bunker, a frozen cave
    //   deadly    far above the party, the rule the temple has always used
    // Returns the reference level to build the band from; `deadly` is handled
    // by the caller, which swaps the filter outright.
    BSE.Helpers.dangerRefLevel = function(danger, refLevel) {
        const lvl = Math.max(1, Math.round(refLevel || 1));
        switch (danger) {
            case 'safe':    return Math.max(1, Math.round(lvl * 0.8) - 1);
            case 'hostile': return lvl + 4 + Math.floor(lvl / 12);
            default:        return lvl;
        }
    };

    // ------------------------------------------------------------------
    // How dangerous a place is: how far it lies from where the party began
    // ------------------------------------------------------------------
    // "Distance from spawn" measures the world from the square the party
    // started the game on - the city the train put them down in, the overland
    // square the bike start rolled, the space center for anyone who began off
    // Earth - and levels everything by the straight-line distance out from it.
    // Home ground is gentle and the far side of the map is lethal, and neither
    // answer moves as the party grows: what changes is where they dare to walk.
    //
    // The gradient runs the full width of the roster. Its two ends are:
    //
    //   distance 0        the calendar's floor, or the level the world creates
    //                     its characters at, whichever is higher (see
    //                     getPlaceFloorLevel) - a world begun by level 50
    //                     people does not open on rats;
    //   the far corner    the top of the roster the era allows (see
    //                     getPlaceCeilingLevel). "The far corner" is the
    //                     farthest square of the world map from THIS party's
    //                     own anchor, computed per anchor rather than assumed,
    //                     so the maximum distance always reaches the maximum
    //                     level wherever the party began.
    //
    // The anchor is written once, by the origin the player picked, at the
    // moment that origin settles where the party begins: every origin in
    // CharacterCreation states its own square (the procedural one it just
    // built, the town of the map it transfers into, the space center for the
    // starts that never touch Earth), and the picker origins - which do not
    // know their square until the player names a place - are anchored by
    // FastTravelSystem as it lands them (ccAnchorStart there). captureStartAnchor
    // below is the net under all of it, for a save with no origin behind it (a
    // preset dossier, the story mode, a save made before origins wrote anchors):
    // it takes the first square the party stands on that resolves at all, and
    // never touches an anchor that is already there.
    //
    // Once written it is kept in the save and nothing moves it: setting a
    // respawn point in the wait menu
    // (TimeDateSystemUI -> TimeDateSystem.setSleepRespawnPoint) writes
    // Variables 25/26/27 and $gameSystem._respawnPointSet, which are where the
    // party wakes up after a defeat and have no bearing on where they BEGAN.
    // Where you started the game is a fact about the game; where you sleep is
    // not.

    const OMEGA_TOWER_FALLBACK = { x: 79, y: 125 }; // world map (315) tile
    // Green Witch Space Center: the launch site, and the square every start
    // that begins off Earth is measured from (see getOffEarthAnchor).
    const SPACE_CENTER_FALLBACK = { x: 61, y: 138 };
    const WORLD_MAP_TILES  = 256;  // map 315 is 256x256; the gradient's own extent
    const PLACE_CURVE      = 1.2;  // >1 keeps the neighbourhood of home gentle

    // Top of the gradient: the highest level any biome-tagged enemy reaches.
    // Read from the database rather than hardcoded so retuning enemy levels
    // retunes the curve with them. Enemies without a <Biome:> tag (bosses,
    // alien species) are excluded, they never enter a biome encounter list.
    let _biomeRosterCeiling = 0;
    function biomeRosterCeiling() {
        if (_biomeRosterCeiling > 0) return _biomeRosterCeiling;
        let max = 0;
        for (let i = 1; i < $dataEnemies.length; i++) {
            const e = $dataEnemies[i];
            if (!e || !e.note || !/<Biome:/i.test(e.note)) continue;
            const lv = BSE.Helpers.getEnemyLevel(e.note);
            if (lv > max) max = lv;
        }
        _biomeRosterCeiling = max > 0 ? max : 100;
        return _biomeRosterCeiling;
    }

    // World map position of a named place, read from the shared destination
    // table so moving a place there moves the difficulty gradient with it.
    function destinationBase(key, fallback) {
        const dest = window.WorkSystem && window.WorkSystem.Destinations;
        const entry = dest && dest[key];
        const base = entry && entry.base;
        if (base && typeof base.x === 'number' && typeof base.y === 'number') {
            return { x: base.x, y: base.y };
        }
        return fallback;
    }

    BSE.Helpers.getOmegaTowerCoords = function() {
        return destinationBase('Omega Tower', OMEGA_TOWER_FALLBACK);
    };

    // The square a party that never stood on Earth is measured from: the Green
    // Witch Space Center, 61,138. The space origin lifted off from it and the
    // crash-landed origin was on its way back to it, so it is the one square on
    // Earth either of them can honestly call home. Every origin that DOES stand
    // on an Earth square is measured from that square instead, the castaway's
    // remote coast included: where a party begins is where the world is gentle,
    // whether or not they chose to begin there.
    BSE.Helpers.getSpaceCenterCoords = function() {
        return destinationBase('GreenWitchSpaceCenter', SPACE_CENTER_FALLBACK);
    };

    // A map that is nowhere on the world map at all: a spaceship cabin (any
    // <Biome: Space> map) or an alien surface, where map 636's world
    // coordinates are a landing-grid cell on another planet and mean nothing
    // as an Earth tile. Reading those two small numbers as a world square
    // would measure a distance across a map the party is not standing on.
    BSE.Helpers.isOffWorldMap = function() {
        const GS = window.GalaxySim;
        if (GS && typeof GS.isAlienSurface === 'function' && GS.isAlienSurface()) return true;
        return /^space$/i.test(String(BSE.Helpers.getMapBiome() || ''));
    };

    // The `base` world square of the named place a map belongs to, or null.
    // An authored map says which place it is part of with <MapGroup: X>, and
    // Destinations.json is where that place's square is written down, so the
    // station the train origin starts on is Ghent's own 84,120 rather than
    // whatever square the map happens to have been tagged with by hand.
    const destBaseKey = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
    let _destBaseIndex = null;

    function destinationBaseIndex() {
        if (_destBaseIndex) return _destBaseIndex;
        const index = {};
        const dest = (window.WorkSystem && window.WorkSystem.Destinations) || {};
        for (const key in dest) {
            const entry = dest[key];
            const base = entry && entry.base;
            if (!base || typeof base.x !== 'number' || typeof base.y !== 'number') continue;
            index[destBaseKey(key)] = base;
            if (typeof entry.name === 'string') index[destBaseKey(entry.name)] = base;
        }
        // Only keep the index once the destination table is actually loaded, so
        // a lookup made before DataService published it is not cached as empty.
        if (Object.keys(index).length) _destBaseIndex = index;
        return index;
    }

    BSE.Helpers.getPlaceBaseCoords = function() {
        const note = ($dataMap && $dataMap.note) || '';
        const group = note.match(/<\s*MapGroup\s*[:=]?\s*([^>]+)>/i);
        if (!group) return null;
        return destinationBaseIndex()[destBaseKey(group[1])] || null;
    };

    // The world square (map 315 tile) the party's CURRENT map stands on. It is
    // both ends of the distance measurement: frozen once as the start anchor,
    // and read live as where they have walked to. Every kind of map answers it,
    // and each answers it differently:
    //
    //   off the world map  a ship cabin or an alien surface stands on no Earth
    //                      square: they answer with the tower's own square, the
    //                      one coordinate that is defined out there, rather
    //                      than a distance read off a landing-grid cell. The
    //                      distance from home is not what levels them anyway -
    //                      the world they are on is (see getOffWorldLevel) - so
    //                      this only keeps the answer from being nonsense.
    //   procedural (636)   the world square the biome was generated from - the
    //                      bike origin's random overland square is one of these.
    //   world map (315)    the party's own tile.
    //   authored maps      the named place they belong to (<MapGroup> ->
    //                      Destinations.json `base`), then the map's own
    //                      <Coords x y> tag, then the last square the party
    //                      stood on (Variables 43 / 44). The tag and the
    //                      variables are what WorldMapTransfer already answers
    //                      for the whole game, so ask it rather than parsing
    //                      notes here.
    BSE.Helpers.getWorldPosition = function() {
        if (BSE.Helpers.isOffWorldMap()) return BSE.Helpers.getOmegaTowerCoords();

        const procCoords = BSE.Helpers.getWorldCoordinates();
        if (procCoords && (procCoords.x || procCoords.y)) return procCoords;
        if ($gameMap && $gameMap.mapId() === 315) {
            return { x: $gamePlayer.x, y: $gamePlayer.y };
        }

        const place = BSE.Helpers.getPlaceBaseCoords();
        if (place) return place;

        const WMT = window.WorldMapTransfer;
        if (WMT && typeof WMT.currentWorldCoords === 'function') {
            const wc = WMT.currentWorldCoords();
            if (wc && (wc.x || wc.y)) return wc;
        }
        return {
            x: ($gameVariables && $gameVariables.value(43)) || 0,
            y: ($gameVariables && $gameVariables.value(44)) || 0
        };
    };

    // The world square the party started the game on. Everything is measured
    // from here. A party that began off Earth (the space and crash-landed
    // origins) never stood on a world square at all, and neither does a save
    // whose anchor was never captured: both answer with the space center, the
    // square those starts are pinned to anyway (see setStartAnchor).
    BSE.Helpers.getStartAnchor = function() {
        const rec = $gameSystem && $gameSystem._bseStartAnchor;
        if (rec && (rec.x || rec.y)) return rec;
        return BSE.Helpers.getSpaceCenterCoords();
    };

    // Write the anchor down deliberately. This is how every origin states where
    // its party is from, in the origin step itself (CharacterCreation's anchorAt
    // / anchorAtSpaceCenter / anchorAtPlace) or at the landing for the picker
    // origins that only learn their square there (FastTravelSystem's
    // ccAnchorStart). Writing it also stops captureStartAnchor from claiming
    // whatever map loads first: an anchor that is already set is never touched
    // again, so a space start that eventually lands in Tokyo does not quietly
    // adopt Tokyo as the place it grew up.
    //
    // The only callers are those creation paths. Nothing in play calls it: the
    // anchor belongs to the savegame and cannot be changed once the party has
    // begun, which is what makes the gradient a map of the world rather than a
    // reading of where the party happens to be standing.
    BSE.Helpers.setStartAnchor = function(x, y) {
        if (!$gameSystem) return;
        if (typeof x !== 'number' || typeof y !== 'number') return;
        $gameSystem._bseStartAnchor = { x: x, y: y };
    };

    BSE.Helpers.anchorAtSpaceCenter = function() {
        const c = BSE.Helpers.getSpaceCenterCoords();
        BSE.Helpers.setStartAnchor(c.x, c.y);
    };

    // Remember where the world was entered, once - the net under the origins,
    // which write their own anchor as they land (see setStartAnchor), for the
    // starts that go through no origin step at all: a preset dossier, the
    // story mode, a save made before origins wrote anchors. Called on every map
    // load; it takes the first square the party stands on after character
    // creation has finished ($gameSystem._hasCompletedFirstCreation, set at the
    // end of the origin step), which is where their origin put them. Nothing captured
    // during creation itself, nothing recaptured for a later party, and nothing
    // ever overwritten - not by walking, not by fast travel, and not by the
    // respawn point the wait menu sets.
    // Has character creation finished putting the party down? The origin step
    // marks the creation itself complete before its landing has happened, and
    // several origins land in two moves: the picker origins pop back onto the
    // starting train (map 557, which answers for a world square of its own)
    // and only open their destination picker a frame later, and the vehicle
    // origins go on to a procedural square with the vehicle parked beside them.
    // Anything captured in between would record the train the wizard was run on
    // as the place the party is from. Every one of those landings is in flight
    // for exactly as long as one of these flags is up.
    function creationLandingPending() {
        const t = $gameTemp;
        if (!t) return false;
        return !!(t._openCharacterCreationTrainTravel || t._characterCreationTravelMode ||
            t._ccVehicleFieldStart);
    }

    BSE.Helpers.captureStartAnchor = function() {
        if (!$gameSystem || $gameSystem._bseStartAnchor) return;
        if (!$gameSystem._hasCompletedFirstCreation) return;
        if (creationLandingPending()) return;
        // Off Earth there is no world square to remember; wait for one rather
        // than writing down a landing-grid cell or the tower by accident.
        if (BSE.Helpers.isOffWorldMap()) return;
        const here = BSE.Helpers.getWorldPosition();
        if (!here || (!here.x && !here.y)) return;
        $gameSystem._bseStartAnchor = { x: here.x, y: here.y };
    };

    // Straight-line world-map distance (in tiles) from the party's start square.
    BSE.Helpers.getStartDistance = function() {
        const here = BSE.Helpers.getWorldPosition();
        const home = BSE.Helpers.getStartAnchor();
        // An unresolved position (0,0) would read as "as far as possible";
        // treat it as standing at home instead of as the deadliest corner.
        if (!here || (!here.x && !here.y)) return 0;
        return Math.sqrt(Math.pow(here.x - home.x, 2) + Math.pow(here.y - home.y, 2));
    };

    // The greatest distance this party CAN be from home: the farthest of the
    // world map's four corners, measured from their own anchor. This is what
    // makes the promise exact - the maximum distance from the starting point is
    // the maximum level - however near an edge the party began. A start in the
    // middle of the map has a shorter longest walk than one in a corner, and
    // both reach the top of the roster at the end of it.
    BSE.Helpers.getMaxStartDistance = function() {
        const home = BSE.Helpers.getStartAnchor();
        const edge = worldMapTiles() - 1;
        const dx = Math.max(Math.abs(home.x - 0), Math.abs(edge - home.x));
        const dy = Math.max(Math.abs(home.y - 0), Math.abs(edge - home.y));
        return Math.max(1, Math.sqrt(dx * dx + dy * dy));
    };

    // The world map's own extent. Read off map 315 while the party is standing
    // on it, so a resized world map resizes the gradient with it, and the
    // constant otherwise (the map's dimensions are not loaded from anywhere
    // else, and the answer has to hold on every map).
    function worldMapTiles() {
        if ($gameMap && $gameMap.mapId() === 315) {
            return Math.max($gameMap.width(), $gameMap.height()) || WORLD_MAP_TILES;
        }
        return WORLD_MAP_TILES;
    }

    // The bottom of the gradient: what home ground itself is pitched at.
    // Two world-creation options meet here (WorldManagerUI's creation form):
    //
    //   the starting DATE  through the calendar's floor - from 2002 the world
    //                      has left its weakest fauna behind (+10 a year), and
    //                      from 2012 nothing under level 80 is left at all;
    //   the starting LEVEL through WorldManager.startingLevel() - a world whose
    //                      characters are created at level 50 was made to be
    //                      begun by people who are already somebody, and its
    //                      home ground is pitched at them rather than at the
    //                      level 1 party it will never hold.
    //
    // Whichever is higher wins; both are the same kind of statement about what
    // this world has stopped bothering to spawn.
    BSE.Helpers.getWorldStartingLevel = function() {
        const WM = window.WorldManager;
        const lvl = (WM && typeof WM.startingLevel === 'function') ? WM.startingLevel() : 1;
        return Math.max(1, Math.round(lvl || 1));
    };

    BSE.Helpers.getPlaceFloorLevel = function() {
        return Math.max(1, BSE.Helpers.getYearLevelFloor(),
            BSE.Helpers.getWorldStartingLevel());
    };

    // The top of the gradient: the strongest thing the era lets roam, and never
    // above what the roster actually holds. In 2012+ the era cap is Infinity,
    // so the roster ceiling is the whole answer.
    BSE.Helpers.getPlaceCeilingLevel = function() {
        const ceiling = Math.min(BSE.Helpers.getSpawnLevelCap(), biomeRosterCeiling());
        return Math.max(BSE.Helpers.getPlaceFloorLevel(), Math.round(ceiling));
    };

    // The level the ground under the party is pitched at: how far this square
    // lies from the one they started on, as a fraction of the farthest they
    // could be, run through the curve and laid across the floor-to-ceiling
    // range above. 0 where no world square resolves at all, which is the
    // caller's cue to fall back to the party's own level (getModeRefLevel).
    BSE.Helpers.getPlaceLevel = function() {
        const here = BSE.Helpers.getWorldPosition();
        if (!here || (!here.x && !here.y)) return 0;
        const floor = BSE.Helpers.getPlaceFloorLevel();
        const ceiling = BSE.Helpers.getPlaceCeilingLevel();
        const t = Math.max(0, Math.min(1,
            BSE.Helpers.getStartDistance() / BSE.Helpers.getMaxStartDistance()));
        return Math.max(1, Math.min(ceiling,
            Math.round(floor + Math.pow(t, PLACE_CURVE) * (ceiling - floor))));
    };

    // Everything the gradient is currently built out of, in one object: what
    // the mode is, where home is, where the party is standing, how far that is
    // out of how far it could be, and the level that comes out at both ends of
    // the range. Meant to be read from the console (or a debug scene) while
    // standing somewhere that looks wrong - every number the mode uses is here,
    // so a surprising encounter can be traced to the term that produced it.
    // What the party would actually meet on this square, as a level: the
    // weighted median of the local roster.
    //
    // The place level (above) is a property of the ground; this is where the
    // roster standing on it actually sits, and the two are not the same number.
    // The whole distribution the spawner uses is rebuilt here - biome match, the
    // biome's own band and the calendar's spread across it - and the median of
    // it is the honest one-number answer to "how dangerous is it here".
    //
    // Cached on everything that can change the answer, because the caller is a
    // HUD that asks again on every step (see MapInfoHUD in TimeDateSystem.js).
    let _placeProfileCache = null;

    BSE.Helpers.getPlaceEncounterProfile = function(biomeName) {
        const here = BSE.Helpers.getWorldPosition() || { x: 0, y: 0 };
        const place = BSE.Helpers.getPlaceLevel() || BSE.Helpers.getPartyReferenceLevel();
        const era = BSE.Helpers.getSpawnEra();
        const key = [here.x, here.y, biomeName || '', place, Math.floor(era.year),
            BSE.Helpers.getNationId(), BSE.Helpers.getPopulationMode()].join('|');
        if (_placeProfileCache && _placeProfileCache.key === key) return _placeProfileCache.value;

        const band = BSE.Helpers.getBiomeLevelBand();
        const candidates = [];
        for (let i = 1; i < $dataTroops.length; i++) {
            const troop = $dataTroops[i];
            if (!BSE.Helpers.isSpawnableTroopData(troop)) continue;
            if (biomeName && !BSE.Helpers.troopMatchesBiome(i, biomeName)) continue;
            if (!BSE.Helpers.troopAllowedInBiome(i, biomeName)) continue;
            if (!BSE.Helpers.getTroopMaxLevel(i)) continue;
            candidates.push({ troopId: i });
        }
        // The band and the spread, exactly as the spawner applies them.
        const local = [];
        let localTotal = 0;
        BSE.Helpers.filterTroopsInLevelBand(candidates, band).forEach(enc => {
            const lvl = BSE.Helpers.getTroopMaxLevel(enc.troopId);
            const weight = BSE.Helpers.biomeSpreadWeight(lvl) *
                BSE.Helpers.populationSpawnBoost(enc.troopId);
            if (weight <= 0) return;
            local.push({ level: lvl, weight: weight });
            localTotal += weight;
        });

        // From 2010 a quarter of what roams (two fifths from 2012) is drawn
        // from the era's high-level pool instead of from the local roster, and
        // a median that ignored them would tell the party a place is safe on
        // the strength of fauna that only fills three spawns in four. The two
        // pools are mixed here in the same proportion the spawner mixes them.
        const elitePool = BSE.Helpers.getEraElitePool(biomeName, era);
        const eliteShare = (elitePool.length && localTotal > 0) ? era.eliteShare : 0;
        let eliteTotal = 0;
        elitePool.forEach(e => { eliteTotal += e.weight; });

        const entries = [];
        if (localTotal > 0) {
            const scale = (1 - eliteShare) / localTotal;
            local.forEach(e => entries.push({ level: e.level, weight: e.weight * scale }));
        }
        if (eliteShare > 0 && eliteTotal > 0) {
            const scale = eliteShare / eliteTotal;
            elitePool.forEach(e => entries.push({
                level: BSE.Helpers.getTroopMaxLevel(e.troopId),
                weight: e.weight * scale
            }));
        }

        let value = { median: 0, min: 0, max: 0, count: 0, placeLevel: place };
        if (entries.length) {
            entries.sort((a, b) => a.level - b.level);
            const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
            let seen = 0;
            let median = entries[entries.length - 1].level;
            for (const e of entries) {
                seen += e.weight;
                if (seen >= totalWeight / 2) { median = e.level; break; }
            }
            value = {
                median: median,
                min: entries[0].level,
                max: entries[entries.length - 1].level,
                count: entries.length,
                placeLevel: place
            };
        }
        _placeProfileCache = { key: key, value: value };
        return value;
    };

    // The one number a HUD wants: the level of the creature this square usually
    // fields, or 0 where nothing is spawnable here at all (an empty world, a
    // biome with no fauna of its own).
    BSE.Helpers.getPlaceEncounterMedianLevel = function(biomeName) {
        return BSE.Helpers.getPlaceEncounterProfile(biomeName).median;
    };

    BSE.Helpers.describePlace = function() {
        const home = BSE.Helpers.getStartAnchor();
        const here = BSE.Helpers.getWorldPosition();
        const dist = BSE.Helpers.getStartDistance();
        const maxDist = BSE.Helpers.getMaxStartDistance();
        const era = BSE.Helpers.getSpawnEra();
        return {
            mode: BSE.Helpers.getSpawnMode(),
            anchor: home,
            anchorSet: !!($gameSystem && $gameSystem._bseStartAnchor),
            here: here,
            offWorld: BSE.Helpers.isOffWorldMap(),
            distance: Math.round(dist * 10) / 10,
            maxDistance: Math.round(maxDist * 10) / 10,
            fraction: Math.round((dist / maxDist) * 1000) / 1000,
            year: Math.floor(era.year),
            era: era.key,
            worldStartLevel: BSE.Helpers.getWorldStartingLevel(),
            population: BSE.Helpers.getPopulationMode(),
            floorLevel: BSE.Helpers.getPlaceFloorLevel(),
            ceilingLevel: BSE.Helpers.getPlaceCeilingLevel(),
            placeLevel: BSE.Helpers.getPlaceLevel(),
            partyLevel: BSE.Helpers.getPartyReferenceLevel(),
            roster: BSE.Helpers.getPlaceEncounterProfile(BSE.Helpers.getMapBiome())
        };
    };

    // ------------------------------------------------------------------
    // THE LOWER TOWER
    // ------------------------------------------------------------------
    // The ninety-two floors under the Omega Tower (DungeonFloorSystem) answer
    // to neither the level band nor the biome rosters: what a
    // creature down there weighs is the DEPTH and nothing else, climbing from
    // about level 40 on the first floor to 222 on the last. The party's own
    // level has no say, so a floor is as dangerous the day it is first opened
    // as it is a hundred hours later, and the whole troop table is on the table
    // because a shaft cut through the world holds whatever fell into it.
    //
    // This is also the one place the calendar does NOT outrank the mode. A
    // floor's level IS its statement about itself; shifting it by the year
    // would say the depth means something different in 2003 from what it meant
    // in 2001, which is exactly what the ladder is there to deny.
    BSE.Helpers.getTowerFloorLevel = function() {
        const api = window.DungeonFloors;
        return (api && typeof api.currentFloorLevel === 'function') ? (api.currentFloorLevel() || 0) : 0;
    };

    // ---- The upper tower --------------------------------------------------
    // An authored floor of the Omega Tower is answered with the map's OWN
    // encounter list, culled to the levels that floor holds (the table lives in
    // DungeonFloorSystem). The enemy spawn option in the menu has no say in
    // there: setting Distance from home does not change what stands on floor
    // 45, it is the floor that decides.
    BSE.Helpers.getTowerAuthoredBand = function() {
        const api = window.DungeonFloors;
        return (api && typeof api.currentEnemyBand === 'function')
            ? (api.currentEnemyBand() || null)
            : null;
    };

    // What the floor holds, and a thin tail of what lives under it. Nothing
    // ABOVE the bracket ever stands on a floor - a rung is a ceiling, and the
    // party is never handed something out of its depth - but the small fry the
    // map declares below the bracket stay possible, rarer the further under it
    // they are, so a floor is not a wall of identically levelled monsters.
    // When the map declares nothing in the bracket at all, what it holds below
    // it fills the floor on its own at full weight.
    const TOWER_STRAY_SHARE = 0.2; // how much of a floor is under-levelled

    BSE.Helpers.filterTroopsToTowerBand = function(encList, band) {
        if (!encList || !encList.length || !band) return encList;
        const levels = encList.map(enc => BSE.Helpers.getTroopMaxLevel(enc.troopId));
        const inBand = [];
        const below = [];
        encList.forEach((enc, i) => {
            const level = levels[i];
            if (level > band.max) return; // never above the floor's own bracket
            if (level >= band.min) inBand.push(Object.assign({}, enc));
            else below.push({ enc, level });
        });
        if (inBand.length === 0) {
            return below.length > 0
                ? below.map(b => Object.assign({}, b.enc))
                : encList;
        }
        // The tail: the nearer a creature is to the bracket, the likelier it is
        // to be the one met, and none of them is ever as likely as a resident.
        below.forEach(b => {
            const nearness = band.min > 0 ? Math.max(0, b.level) / band.min : 0;
            const weight = (b.enc.weight || 1) * TOWER_STRAY_SHARE * nearness;
            if (weight > 0) inBand.push(Object.assign({}, b.enc, { weight }));
        });
        return inBand;
    };

    BSE.Helpers.getTowerFloorBand = function(level) {
        const lvl = Math.max(1, Math.round(level));
        return {
            min: Math.max(1, Math.round(lvl * 0.8)),
            max: Math.round(lvl * 1.2),
            center: lvl
        };
    };

    // Keep only the troops whose level falls in the band.
    // The band widens if the (nation-weighted, biome-matched) pool has nothing
    // in range, and finally falls back to whatever sits closest to its centre,
    // so a map is never left without spawnable enemies.
    BSE.Helpers.filterTroopsInLevelBand = function(encList, band) {
        if (!encList || !encList.length || !band) return encList;
        const levels = encList.map(enc => BSE.Helpers.getTroopMaxLevel(enc.troopId));
        for (let pass = 0; pass < 3; pass++) {
            const grow = 1 + pass * 0.5;
            const lo = Math.max(1, band.center - (band.center - band.min) * grow);
            // An open-ended band (the 2012 collapse) has no top to widen, and
            // Infinity * 0 is NaN, which would silently reject every candidate
            // on the first pass and then let the widened floor undercut the
            // year's own minimum.
            const hi = band.max === Infinity
                ? Infinity
                : band.max + (band.max - band.center) * pass;
            const inBand = encList.filter((enc, i) => levels[i] >= lo && levels[i] <= hi);
            if (inBand.length > 0) return inBand;
        }
        let bestDist = Infinity;
        levels.forEach(lvl => {
            const d = Math.abs(lvl - band.center);
            if (d < bestDist) bestDist = d;
        });
        return encList.filter((enc, i) => Math.abs(levels[i] - band.center) === bestDist);
    };

    /**
     * Check if a troop has any enemies that match the given biome
     */
    BSE.Helpers.troopMatchesBiome = function(troopId, targetBiome) {
        if (!targetBiome) return false;
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return false;
        return troopFacts(troop).biomes.has(targetBiome.toLowerCase().trim());
    };

    /**
     * Can troop spawn in region
     */
    BSE.Helpers.canTroopSpawnInRegion = function(troopId, regionId, x, y) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members.length) return true;
        const firstMember = troop.members[0];
        if (!firstMember) return true;
        const enemyData = $dataEnemies[firstMember.enemyId];
        if (!enemyData) return true;
        const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
        if (!archetype) return true;
        // One water answer for both halves of the rule, so a tile can never be
        // wet enough to bar a wolf and dry enough to bar a fish at the same
        // time. Without coordinates (a caller that has only a region id left)
        // region 99 is all there is to go on.
        const isWater = (x !== undefined && y !== undefined && $gameMap)
            ? BSE.Helpers.isWaterSpawnTile(x, y)
            : regionId === 99;
        if (BSE.Helpers.getAquaticArchetype(archetype)) return isWater;
        if (isWater && !BSE.Helpers.getAmphibiousArchetype(archetype)) return false;
        return true;
    };

    /**
     * Does this troop belong in the water - either because it can live nowhere
     * else (aquatic) or because it swims better than it walks (amphibious)?
     * Read off the first member, exactly as canTroopSpawnInRegion is.
     */
    BSE.Helpers.troopIsWaterDwelling = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop || !troop.members || !troop.members.length) return false;
        const firstMember = troop.members[0];
        const enemyData = firstMember && $dataEnemies[firstMember.enemyId];
        if (!enemyData) return false;
        const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
        if (!archetype) return false;
        return BSE.Helpers.getAquaticArchetype(archetype) ||
            BSE.Helpers.getAmphibiousArchetype(archetype);
    };

    // Did a designer write this map's encounter list, or is it the template's?
    //
    // A map that declares its own encounters outranks everything the algorithm
    // would do, so the question has to be answered exactly. 154 of the game's
    // hand-made maps carry a single entry that is byte-for-byte the editor's
    // copy-pasted default - the same one map 636's procedural template holds -
    // and reading that as a statement about the map's fauna would leave every
    // one of them spawning one troop for ever. A lone placeholder is not a
    // list; two or more entries, or one that is anything else, is.
    const PLACEHOLDER_TROOP_ID = 113;
    const PLACEHOLDER_WEIGHT   = 5;

    BSE.Helpers.isAuthoredEncounterList = function(list) {
        if (!list || !list.length) return false;
        if (list.length > 1) return true;
        const only = list[0];
        return !(only && only.troopId === PLACEHOLDER_TROOP_ID &&
                 only.weight === PLACEHOLDER_WEIGHT);
    };

    /**
     * Ensure troops array with weighted distribution
     */
    BSE.Helpers.ensureTroops = function(troops, party, dataEnemies) {
        const pool = $dataTroops
            .slice(1)
            .map((t, i) => ({ troop: t, id: i + 1 }))
            .filter(x => x.troop && x.troop.members.length)
            .map(x => ({ ...x, weight: BSE.Helpers.getTroopSpawnWeight(x.id) }))
            .filter(x => x.weight > 0); // drop over-cap & wrong-biome troops
        if (!pool.length) return; // no valid troops: leave troops array untouched
        for (let i = 0; i < 4 && pool.length > 0; i++) {
            const totalWeight = pool.reduce((sum, x) => sum + x.weight, 0);
            let random = Math.random() * totalWeight;
            for (let j = 0; j < pool.length; j++) {
                random -= pool[j].weight;
                if (random <= 0) {
                    troops.push(pool[j].id);
                    pool.splice(j, 1);
                    break;
                }
            }
        }
    };

    // ========================================================================
    // 5. SPAWN ENEMIES FROM ENCOUNTERS (Core overworld hook)
    // ========================================================================

    // The per-event troop / position / defeated caches keep a procedural map
    // stable while the player walks it and while battles come and go. They are
    // keyed by event id only, and every world tile reuses the same map 636
    // event ids, so they have to be dropped whenever the tile (or the
    // underground layer, or the biome) changes. Otherwise the very first
    // procedural map the player ever loads would freeze that tile's fauna in
    // place for the whole world, and neither the biome roster nor the spawn
    // biome's level band would ever be consulted again.
    // Answers true when it threw the square's fauna away, which is to say when
    // the pass about to run is a fresh DEAL rather than a re-stock of ground the
    // party is already standing on.
    BSE.Helpers.syncProcGenEnemyCache = function() {
        if ($gameMap.mapId() !== 636) return false;
        const wc = BSE.Helpers.getWorldCoordinates() || { x: 0, y: 0 };
        const stack = $gameSystem._procGenData && $gameSystem._procGenData.biomeLayerStack;
        const depth = stack ? stack.length : 0;
        const key = `${wc.x},${wc.y},${depth},${BSE.Helpers.getMapBiome() || ''}`;
        if ($gameSystem._procGenEnemyCacheKey === key) return false;
        $gameSystem._procGenEnemyCacheKey = key;
        $gameSystem._procGenEnemyTroops = {};
        $gameSystem._procGenEnemyPositions = {};
        $gameSystem._procGenDefeatedEnemies = [];
        // The tile's fauna is being re-dealt into the same event ids, so every
        // wound remembered against those ids belonged to a creature that no
        // longer exists. Covers the re-stocks that happen without a transfer
        // (WorldMapReturn's refreshEnemiesForBiome).
        if (BSE.Functions.healPersistentEnemies) BSE.Functions.healPersistentEnemies();
        return true;
    };

    // Where the roaming monsters are standing RIGHT NOW, in the square's own
    // coordinates, written over whatever tile they were first dealt.
    //
    // A re-stock is not always a re-deal. Coming back from a fight the party
    // fled runs the whole pass again over the very same square (Scene_Map is
    // rebuilt, the procedural map is laid down again and populated again), and
    // so does closing a menu. The creatures on that square are already
    // somewhere - somewhere the player was looking at a second ago - and the
    // pass below would deal them their ORIGINAL tiles back, or, for the one the
    // party just ran away from, a fresh tile anywhere on the map, because a
    // monster standing next to the party is inside the ring the arrival
    // clearance keeps empty. Either way it read as the monsters teleporting the
    // moment a battle ended. Adopting the tiles they are actually on is what
    // puts every one of them back exactly where it was.
    BSE.Functions.rememberEnemyPositions = function() {
        if (!$gameSystem._procGenEnemyPositions) $gameSystem._procGenEnemyPositions = {};
        const w = $gameMap.width(), h = $gameMap.height();
        for (const ev of $gameMap.events()) {
            if (!ev || ev._erased) continue;
            const data = ev.event();
            if (!data || data.name !== "Enemy") continue;
            const x = ev.x, y = ev.y;
            // (0, 0) is the parking spot every pass reads as "not placed", and
            // anything outside the square belongs to one of the window's other
            // squares (see ProcStitch's square-local view).
            if (x === 0 && y === 0) continue;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            $gameSystem._procGenEnemyPositions[ev.eventId()] = { x, y };
        }
    };

    // Game_Map#setup runs on every transfer and on every procedural rebuild.
    const _BSE_Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        // Before a single creature is placed: in a chaos world the whole troop
        // table is re-rolled once, so the map, the fight and the bestiary all
        // read the same roster.
        BSE.Helpers.ensureChaosTroops();
        _BSE_Game_Map_setup.call(this, mapId);
        if ($gameSystem) {
            // setup rebuilds every event from the map file, so the "Enemy" events
            // are back on the template's own corners and say nothing about where
            // this square's monsters were standing. rememberEnemyPositions must
            // not believe them.
            $gameSystem._procGenEnemiesFromTemplate = true;
        }
    };

    // Every arrival on a map is a chance to learn where the party began, until
    // one of them answers (see captureStartAnchor); it is written down once.
    //
    // This asks at Scene_Map#start rather than at Game_Map#setup, and the
    // difference matters for every origin that lands on the world map itself.
    // Game_Map#setup runs from inside performTransfer BEFORE the player is
    // moved, so on map 315 - where the party's own tile IS the world square -
    // it would read the coordinates of the map they just left. Worse, three
    // origins are placed by hand only after the map has loaded: the empty lot
    // and the lost convoker are dropped on a random land tile in
    // CharacterCreation's onMapLoaded hook, and the castaway is re-landed there
    // if their hand-written spot has drifted over water. Scene_Map#start runs
    // after all of it, so what is written down is where the party is actually
    // standing.
    const _BSE_Scene_Map_start_anchor = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _BSE_Scene_Map_start_anchor.call(this);
        BSE.Helpers.captureStartAnchor();
    };

    // Give every roaming monster back to a map that is being re-stocked.
    //
    // A pass that cannot place an enemy erases its event - the biome caps the
    // population, the tile it drew is water and it cannot swim, the roster holds
    // nothing that may stand there - and an erased event is erased for the life
    // of the map. That was always fine, because a square used to BE the map: the
    // next square was a transfer, Game_Map#setup built the events again from
    // scratch, and the erasures went with them.
    //
    // The stitched window (WorldMapReturn's ProcStitch) put an end to that. The
    // party walks from one world square into the next without a transfer, the
    // map is never set up again, and the fifteen "Enemy" events map 636 carries
    // are re-dealt in place for each square they arrive in. So the first square
    // that erased any of them - a city with its cap of two, a coast with its cap
    // of ten - left them erased for every square after it, and walking on into
    // open country found it empty.
    //
    // Erasure is therefore undone before each re-stock, and the passes below
    // erase again whatever they still cannot place. Nothing is lost: the
    // defeated are re-erased from $gameSystem._procGenDefeatedEnemies a few
    // lines down, and on a map that is set up in the ordinary way there is
    // nothing erased here to give back.
    BSE.Functions.restoreErasedEnemyEvents = function() {
        for (const ev of $gameMap.events()) {
            if (!ev || !ev._erased) continue;
            const data = ev.event();
            if (!data || data.name !== "Enemy") continue;
            ev._erased = false;
            ev.refresh();
        }
    };

    Scene_Map.prototype.spawnEnemiesFromEncounters = function() {
        if (!$dataMap) return;
        const reDealt = BSE.Helpers.syncProcGenEnemyCache();
        // Same square, same fauna, and the events on it are the live ones: this
        // is the party coming back from a fled fight or out of a menu, so where
        // each creature stands now is where it has to stand afterwards.
        if ($gameMap.mapId() === 636 && !reDealt &&
            !$gameSystem._procGenEnemiesFromTemplate) {
            BSE.Functions.rememberEnemyPositions();
        }
        $gameSystem._procGenEnemiesFromTemplate = false;
        BSE.Functions.restoreErasedEnemyEvents();

        // Whose rules apply here.
        //
        //   - A HAND-MADE map that declares its own encounters in the editor is
        //     answered with exactly those: an authored list is a statement about
        //     what lives there and it outranks the biome roster and the
        //     level band alike.
        //   - A PROCEDURAL map (636) is generated, and so is its fauna: the
        //     placeholder encounter its template carries says nothing about the
        //     world tile being built, so the algorithm always decides.
        //   - An ALIEN surface is a procedural map too, but it has rules of its
        //     own (section 16: the planet's own species roster, or nothing at
        //     all on a barren world). None of the Earth machinery below - the
        //     biome band, the calendar, the special biomes - is applied to it.
        const isProcGenMap = $gameMap.mapId() === 636;
        const onAlienSurface = !!alienSurfaceState();
        const authored = $gameMap.encounterList() || [];
        // An authored floor of the upper tower: the map's own list, culled to
        // the floor's level bracket, and nothing else has a say.
        const towerAuthoredBand = BSE.Helpers.getTowerAuthoredBand();
        const useAuthoredList = onAlienSurface ||
            (towerAuthoredBand && authored.length > 0) ||
            (!isProcGenMap && BSE.Helpers.isAuthoredEncounterList(authored));

        // The algorithm fills this in below; ensureTroops is the last resort if
        // it comes back with nothing at all.
        let encounterList = useAuthoredList ? authored : [];

        const allEnemyEvents = $gameMap.events().filter(ev => {
            const eventData = ev.event();
            return eventData && eventData.name === "Enemy";
        });

        let enemyEvents = allEnemyEvents;
        if (isProcGenMap) {
            if ($gameSystem._procGenDefeatedEnemies) {
                enemyEvents = allEnemyEvents.filter(ev =>
                    !$gameSystem._procGenDefeatedEnemies.includes(ev.eventId())
                );
                const defeatedEvents = allEnemyEvents.filter(ev =>
                    $gameSystem._procGenDefeatedEnemies.includes(ev.eventId())
                );
                defeatedEvents.forEach(ev => ev.erase());
            }
        }

        if (!enemyEvents.length) return;

        // Urban / Road Biome Population Cap
        // Settled and travel biomes (City, Village, Burg, Road) keep only a
        // couple of roaming enemies. The proc map template carries many "Enemy"
        // events; placing all of them in these tight, event-dense maps crowds
        // tiles and makes colliding into an enemy fail to start a battle. Cull
        // to 2 so the few that remain stay cleanly interactable.
        // Per-biome enemy population caps. The proc map template carries many
        // "Enemy" events; some biomes should stay sparsely populated:
        //   - Urban / Road (tight, event-dense): 2
        //   - Cave (exploration, rare loot):      3
        //   - a generated structure: whatever its catalogue entry says (a
        //     cellar 0-1 lurker, a temple 4 guardians, a den 8 of one species)
        const currentBiome = BSE.Helpers.getMapBiome();
        const lowerBiomeName = (currentBiome || '').toLowerCase();
        // A generated structure declares who lives in it, how many of them and
        // how dangerous they are, in the catalogue in
        // ProceduralMapStructureGenerator. This used to be four hardcoded
        // special cases (loot cellar, patron's vault, cave den, temple) plus an
        // alias table pointing each at ONE existing biome's roster; with two
        // dozen structures in the world it has to be data.
        const struct = BSE.Helpers.getStructure(currentBiome);
        const structEnemy = (struct && struct.enemy) || null;
        // Structure biomes have no enemies tagged with their own name, so they
        // borrow the rosters of the biomes their inhabitants really live in.
        const encounterBiomes = (structEnemy && structEnemy.biomes && structEnemy.biomes.length)
            ? structEnemy.biomes.slice() : (currentBiome ? [currentBiome] : []);
        // Everything downstream that still wants a single biome name (the era
        // elite pool) takes the first of them.
        const encounterBiome = encounterBiomes[0] || currentBiome;
        const structDanger = struct ? struct.danger : null;
        const uniformSpecies = !!(structEnemy && structEnemy.uniform);
        if (currentBiome) {
            const lowerBiome = lowerBiomeName;
            let enemyCap = -1;
            if (structEnemy && structEnemy.cap != null) {
                if (Array.isArray(structEnemy.cap)) {
                    // A range is rolled per structure, seeded on the world tile
                    // and the layout, so a given place is always as busy (or as
                    // empty) as it was the first time - this is how a loot
                    // cellar is either guarded or safe, and stays that way.
                    const wc = BSE.Helpers.getWorldCoordinates() || { x: 0, y: 0 };
                    const genData = $gameSystem._procGenData && $gameSystem._procGenData.generatedMapData;
                    const sx = (genData && genData.spawnX) || 0;
                    const sy = (genData && genData.spawnY) || 0;
                    const srng = BSE.Helpers.createSeededRandom(wc.x * 7349 + wc.y * 131 + sx * 97 + sy + 17);
                    const lo = structEnemy.cap[0], hi = structEnemy.cap[1];
                    enemyCap = lo + Math.floor(srng() * (hi - lo + 1));
                } else {
                    enemyCap = structEnemy.cap;
                }
            } else if (lowerBiome.includes('city') || lowerBiome.includes('burg') ||
                lowerBiome.includes('village') || lowerBiome.includes('road')) {
                enemyCap = 2;
            } else if (lowerBiome.includes('cave')) {
                enemyCap = 3;
            } else if (lowerBiome.includes('beach') || lowerBiome.includes('island')) {
                // A shore is half sea: the dry half of the square carries the
                // whole roaming population, and the full template's worth of
                // them on that much land reads as a crowd rather than a coast.
                // Ten instead of the template's fifteen - a step down, not an
                // emptying, and the sea's own residents are part of the ten
                // (see the water-capable guarantee in the placement loop).
                enemyCap = 10;
            }
            // The Bunker origin's own cellar (CharacterCreation.startBunkerOrigin,
            // WorldMapReturn's 'bunker' dungeon session) is a guaranteed-safe wake-up
            // point, not a LootCellar rolled for the ordinary [0,1] chance of a
            // lurker: no monster ever stands in it, on the initial spawn or on any
            // later trip back down through the hatch.
            const bunkerSession = $gameSystem._procGenData && $gameSystem._procGenData._dungeonSession;
            if (bunkerSession && bunkerSession.type === 'bunker') enemyCap = 0;
            if (enemyCap >= 0 && enemyEvents.length > enemyCap) {
                const excessEvents = enemyEvents.splice(enemyCap);
                excessEvents.forEach(ev => ev.erase());
            }
        }

        // Build the candidate pool. A procedural map always lands here (its
        // template's single placeholder encounter is not an authored list); a
        // hand-made map only when it declared none of its own.
        // A floor of the lower tower deals from the whole table, flat, ignoring
        // the biome entirely; what makes it a floor is the band, which is the
        // depth's own (see getTowerFloorBand).
        const towerFloorLevel = BSE.Helpers.getTowerFloorLevel();
        // The reference level: the depth in the tower, the party's median
        // everywhere else. The biome's band measures against neither, so the
        // number matters only to the structure and era rules below.
        const poolRefLevel = towerFloorLevel || BSE.Helpers.getPartyReferenceLevel();
        if (!useAuthoredList && !towerAuthoredBand && $gameParty.members().length > 0) {
            // Structure biomes match troops against the borrowed rosters their
            // catalogue entry names (a mine draws on Mines and Underdark, a
            // grotto on CaveFlooded, SeaBed, Beach and Ocean), then narrow that
            // to the archetypes the place is home to, if it named any. A filter
            // that would empty the list is dropped rather than obeyed, so no
            // structure is ever left with nothing to spawn.
            const biomeTroops = [];
            const nonBiomeTroops = [];
            const everyTroop = [];
            for (let i = 1; i < $dataTroops.length; i++) {
                const troop = $dataTroops[i];
                if (!BSE.Helpers.isSpawnableTroopData(troop)) continue;
                everyTroop.push(i);
                if (encounterBiomes.length && BSE.Helpers.troopMatchesAnyBiome(i, encounterBiomes)) {
                    biomeTroops.push(i);
                } else {
                    nonBiomeTroops.push(i);
                }
            }
            if (structEnemy && structEnemy.archetypes && structEnemy.archetypes.length && biomeTroops.length) {
                const themed = biomeTroops.filter(i =>
                    BSE.Helpers.troopMatchesArchetypes(i, structEnemy.archetypes));
                if (themed.length >= 3) {
                    for (const id of biomeTroops) if (themed.indexOf(id) < 0) nonBiomeTroops.push(id);
                    biomeTroops.length = 0;
                    biomeTroops.push(...themed);
                }
            }

            // Build the encounter list from the candidate troops. The weight is
            // flat over the biome's own roster: the nation is not consulted and
            // no level is preferred over another, so every resident of the place
            // is drawn as often as every other. A tower floor is flat for the
            // same reason - the depth already said everything there is to say.
            const buildFromTroops = candidateIds =>
                candidateIds.map(id => ({ troopId: id, weight: 1, regionId: 0 }));

            // A tower floor ignores the biome entirely; everywhere else it is
            // the local fauna.
            let candidates = null;
            if (towerFloorLevel) {
                candidates = everyTroop;
            } else if (encounterBiome && biomeTroops.length > 0) {
                candidates = biomeTroops;
            } else if (!encounterBiome && nonBiomeTroops.length > 0) {
                candidates = nonBiomeTroops;
            }
            if (candidates) {
                const list = buildFromTroops(candidates);
                if (list.length > 0) encounterList = list;
            }
        }

        // Nothing matched at all (a biome with no fauna of its own, or a world
        // whose population rule leaves none of it standing): fall back to the
        // old weighted draw rather than leave the map empty.
        if (!encounterList.length && !onAlienSurface) {
            const fallbackIds = [];
            BSE.Helpers.ensureTroops(fallbackIds, $gameParty.members(), $dataEnemies);
            encounterList = fallbackIds.map(id => ({ troopId: id, weight: 1 }));
        }

        // Who the world is populated with, as a last gate, and this one has NO
        // fallback: an empty world is empty, a monster world has no people in
        // it and a zombie world holds nothing that is not dead, walking or an
        // animal, even where obeying that leaves a map with nothing at all to
        // spawn. The authored lists and the ensureTroops fallback above are the
        // two paths that reach here without having been asked (see section on
        // populationMode), which is exactly why the question is asked again.
        encounterList = encounterList.filter(enc =>
            BSE.Helpers.troopAllowedInPopulation(enc.troopId));

        // Rule 1 (section 4a) as a last gate. Everything above is generated and
        // has already been through troopAllowedInBiome, but a static map's own
        // encounter list is authored, so nothing has necessarily looked at it.
        // Unlike the population rule this one falls back: a special creature
        // standing in the wrong biome is a mistake worth correcting, but it is
        // not worth emptying a map over.
        const allowedHere = encounterList.filter(enc =>
            BSE.Helpers.troopAllowedInBiome(enc.troopId, currentBiome));
        if (allowedHere.length > 0) encounterList = allowedHere;

        // Apply time-based filtering
        encounterList = BSE.Helpers.filterEncountersByTime(encounterList);

        // The floor's own bracket, laid over the map's list as the last word.
        if (towerAuthoredBand) {
            encounterList = BSE.Helpers.filterTroopsToTowerBand(encounterList, towerAuthoredBand);
        }

        // Critical event locations (transfer/door events to exclude spawns near)
        const criticalEventLocations = $gameMap.events()
            .filter(ev => {
                const eventData = ev.event();
                return eventData && (eventData.name === "Transfer" || eventData.name === "Door");
            })
            .map(ev => ({ x: ev.x, y: ev.y }));
        const exclusionRadius = 3;

        const spawnTiles = [];
        const w = $gameMap.width(), h = $gameMap.height();

        // Region 109 anchors - if present, restrict spawns to within radius of them
        const region109Tiles = [];
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                if ($gameMap.regionId(x, y) === 109) region109Tiles.push({ x, y });
            }
        }
        const region109Radius = 5;

        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                if ($gameMap.regionId(x, y) === 10 || $gameMap.regionId(x, y) === 103) continue;
                if (region109Tiles.length > 0) {
                    const nearRegion109 = region109Tiles.some(loc =>
                        Math.sqrt(Math.pow(x - loc.x, 2) + Math.pow(y - loc.y, 2)) <= region109Radius
                    );
                    if (!nearRegion109) continue;
                }
                let tooClose = false;
                for (const loc of criticalEventLocations) {
                    const distance = Math.sqrt(Math.pow(x - loc.x, 2) + Math.pow(y - loc.y, 2));
                    if (distance <= exclusionRadius) { tooClose = true; break; }
                }
                if (tooClose) continue;
                const terrainTag = $gameMap.terrainTag(x, y);
                const regionId = $gameMap.regionId(x, y);
                // Water is a habitat, not an obstacle: the sea is impassable to
                // anything that walks, so it is exempted from the passability
                // test and only the creatures that live in it are placed there
                // (canTroopSpawnInRegion, and the wet/dry split below).
                const isWaterTile = BSE.Helpers.isWaterSpawnTile(x, y);
                // The keep-out region marks the solid mass a structure was cut
                // out of, and it is obeyed wet or dry: passability alone reads
                // the topmost tile with an opinion, which a fixture hung on the
                // rock is happy to be.
                if (window.RegionRules && window.RegionRules.blocksSpawn(x, y)) continue;
                if (!isWaterTile && !$gameMap.isPassable(x, y, 2)) continue;
                // Terrain tags describe the GROUND, and water has none to
                // describe: a river cut through a field carries its biome's tag
                // (often 0) under water the river generator paints region 99, so
                // reading the tag there would throw away every river tile on the
                // map and leave the fish nowhere but the open sea. Tags 4 and 7
                // are hand-placed "nothing spawns here" marks and are obeyed
                // wet or dry.
                if (terrainTag === 4 || terrainTag === 7) continue;
                if (!isWaterTile && terrainTag === 0) continue;
                if ($gameMap.events().some(ev => ev.x === x && ev.y === y && !enemyEvents.includes(ev))) continue;
                spawnTiles.push({ x, y, regionId, isWater: isWaterTile });
            }
        }

        // Every tile the square can legally seat a monster on, taken before the
        // narrowing below. A REMEMBERED post is looked up here rather than in the
        // narrowed list, because the narrowing is about where to deal a monster
        // that has none: the arrival clearance in particular empties the ring the
        // party is standing in, which is exactly the ring the creature they just
        // fled from is standing in too.
        const legalTiles = new Map();
        for (const t of spawnTiles) legalTiles.set(t.x + ',' + t.y, t);

        // Road biomes: spawn off the carriageway, since enemies refuse to walk
        // onto road / dashed-line tiles and would be stranded there. Falls back
        // to the unfiltered list if the road leaves no roadside tile at all.
        const offRoadTiles = spawnTiles.filter(t => !BSE.Helpers.isRoadFeatureTile(t.x, t.y));
        if (offRoadTiles.length > 0 && offRoadTiles.length < spawnTiles.length) {
            spawnTiles.length = 0;
            spawnTiles.push(...offRoadTiles);
        }

        // Two tiles a roaming monster must not be standing on when the map
        // fades in. The RIM: the party walks onto a procedural square, a
        // dungeon floor or an underground layer at its edge, so a creature
        // spawned in the border band is already on top of them before they can
        // read what it is, with the map edge at their back and nowhere to
        // retreat to. The ARRIVAL TILE itself, for the same reason - the party
        // is standing where the transfer put them, and the first thing they
        // should be able to do is look around. Both are preferences rather
        // than rules: a map too small, or too hemmed in, to seat every enemy
        // inland keeps whatever tiles it has.
        const BORDER_MARGIN = 4;
        const ARRIVAL_CLEARANCE = 6;
        const preferSpawnTiles = pred => {
            const kept = spawnTiles.filter(pred);
            if (kept.length >= enemyEvents.length && kept.length < spawnTiles.length) {
                spawnTiles.length = 0;
                spawnTiles.push(...kept);
            }
        };
        preferSpawnTiles(t =>
            t.x >= BORDER_MARGIN && t.y >= BORDER_MARGIN &&
            t.x < w - BORDER_MARGIN && t.y < h - BORDER_MARGIN);
        preferSpawnTiles(t =>
            $gameMap.distance(t.x, t.y, $gamePlayer.x, $gamePlayer.y) > ARRIVAL_CLEARANCE);

        const selectWeightedRandom = list => {
            const total = list.reduce((sum, it) => sum + it.weight, 0);
            let rnd = Math.random() * total;
            for (const it of list) {
                rnd -= it.weight;
                if (rnd <= 0) return it;
            }
            return list[0];
        };

        // A structure whose catalogue entry sets `uniform` (a cave den) is
        // inhabited by ONE species, resolved once (seeded on the world tile)
        // and reused for every enemy event on the map.
        let denTroopId = null;

        // Whether the band rules apply here at all (see section 4b). An alien
        // surface answers to none of them: its species roster is the encounter
        // list and no band, elite or special-biome rule is laid over it.
        const bandApplies = !(onAlienSurface || towerAuthoredBand);
        // The level everything on this map is measured against: the depth in the
        // tower, the party's median everywhere else. The `deadly` filter below
        // reads it too.
        const baseRefLevel = poolRefLevel;
        // A structure sits on a rung of the danger ladder, and that is a shift
        // of the level the band is built around: a smuggler's cache spawns
        // below that level, a bunker or an under-forge above it. `deadly` is
        // not a shift but a different filter, applied where the band is used.
        // A tower floor keeps its own level whichever structure was dealt to it:
        // the depth is the danger, and the rung the borrowed layout sits on has
        // nothing to say about it.
        const spawnRefLevel = towerFloorLevel || BSE.Helpers.dangerRefLevel(structDanger, baseRefLevel);
        // Off Earth the place decides, over the top of whichever mode is set:
        // a ship, a station or a derelict spawns from the level of the space it
        // is sitting in (see getOffWorldLevel). An alien SURFACE needs nothing
        // here - its encounter list is the world's own species roster, already
        // built around that same level - and passes through with no band at all.
        const offWorldLevel = BSE.Helpers.getOffWorldLevel();
        const levelBand = towerFloorLevel
            ? BSE.Helpers.getTowerFloorBand(towerFloorLevel)
            : (offWorldLevel > 0
                ? BSE.Helpers.getOffWorldBand(offWorldLevel)
                : (bandApplies ? BSE.Helpers.getSpawnBand() : null));

        // The era's high-level fauna (level 80-110 from 2010, 100+ from 2012)
        // rides on top of the biome's band: a share of the roaming enemies is
        // drawn from this pool instead of from the biome roster, so the
        // calendar's elites mix in with normal spawns.
        const spawnEra = BSE.Helpers.getSpawnEra();
        // Not in the tower: the calendar's elites would break a ladder whose
        // whole point is that the floor decides what stands on it.
        const eraElitePool = (bandApplies && !towerFloorLevel && spawnEra.eliteShare > 0)
            ? BSE.Helpers.getEraElitePool(encounterBiome, spawnEra)
            : [];

        // Narrowing a candidate list to `levelBand`. A tower floor and an
        // off-world map carry a band of their own - the depth, the level of the
        // space - and it is taken flat, exactly as given. Everywhere else the
        // biome's own rule decides (see filterTroopsForMode).
        const flatBand = !!(towerFloorLevel || offWorldLevel > 0);
        const applyBand = list => flatBand
            ? BSE.Helpers.filterTroopsInLevelBand(list, levelBand)
            : BSE.Helpers.filterTroopsForMode(list, 'biome', levelBand);

        // Rule 2 (section 4a): a Crystals field or a SpiritWoods grove always
        // holds at least one of its own exclusive residents, whatever the
        // calendar has done to the level band. The structure biomes borrow a
        // roster instead of using their own, so they are read on `currentBiome`
        // and never qualify.
        const specialPool = bandApplies ? BSE.Helpers.getSpecialBiomeTroops(currentBiome) : [];
        let specialPlaced = false;

        // The sea's own residents. A shore (Beach, Island, Ocean, a flooded
        // cave) is half water, and the fauna that lives in that half must
        // actually be seen in it: an aquatic species can stand nowhere else at
        // all, and an amphibious one is faster there than on the sand. The tile
        // is drawn before the species is, so the guarantee has to be made on the
        // tile - while nothing has been placed in the water yet, one event's
        // draw is restricted to the wet tiles. It is the LAST event that is
        // restricted, so the boss and the special-biome resident keep their
        // first claim on the map (the same order the guarantee above uses).
        // Every other event still draws freely, which is what keeps the split
        // between sea and land roughly in proportion to the square's own.
        const wantsWaterSpawn = spawnTiles.some(t => t.isWater) &&
            encounterList.some(enc => BSE.Helpers.troopIsWaterDwelling(enc.troopId));
        let waterPlaced = false;

        for (let evIdx = 0; evIdx < enemyEvents.length; evIdx++) {
            const ev = enemyEvents[evIdx];
            const isLastEnemyEvent = evIdx === enemyEvents.length - 1;
            if (spawnTiles.length) {
                let loc;
                let idx = -1;
                let remembered = null;
                if (isProcGenMap) {
                    if (!$gameSystem._procGenEnemyPositions) $gameSystem._procGenEnemyPositions = {};
                    const savedPos = $gameSystem._procGenEnemyPositions[ev.eventId()];
                    if (savedPos) {
                        idx = spawnTiles.findIndex(tile => tile.x === savedPos.x && tile.y === savedPos.y);
                        // Dropped by the narrowing, but still a tile of this
                        // square: the post is honoured anyway. No other event can
                        // claim it, because a remembered post is a tile that was
                        // spliced out of the draw when it was first dealt.
                        if (idx === -1) remembered = legalTiles.get(savedPos.x + ',' + savedPos.y) || null;
                    }
                }
                if (idx !== -1) {
                    loc = spawnTiles.splice(idx, 1)[0];
                } else if (remembered) {
                    loc = remembered;
                } else {
                    let pickIdx = Math.floor(Math.random() * spawnTiles.length);
                    // The water-dweller guarantee: the last event goes into the
                    // sea if none of the earlier draws happened to.
                    if (wantsWaterSpawn && !waterPlaced && isLastEnemyEvent) {
                        const wetIdxs = [];
                        spawnTiles.forEach((t, ti) => { if (t.isWater) wetIdxs.push(ti); });
                        if (wetIdxs.length > 0) {
                            pickIdx = wetIdxs[Math.floor(Math.random() * wetIdxs.length)];
                        }
                    }
                    loc = spawnTiles.splice(pickIdx, 1)[0];
                    if (isProcGenMap) {
                        if (!$gameSystem._procGenEnemyPositions) $gameSystem._procGenEnemyPositions = {};
                        $gameSystem._procGenEnemyPositions[ev.eventId()] = { x: loc.x, y: loc.y };
                    }
                }

                ev.locate(loc.x, loc.y);
                const currentRegion = loc.regionId;
                // Whether this tile is water is the tile's own answer, not its
                // region id's: on the procedural map the sea is often unpainted
                // and the sand band is sometimes painted (see isWaterSpawnTile).
                const locIsWater = !!loc.isWater;
                let validTroops = encounterList.filter(enc =>
                    BSE.Helpers.canTroopSpawnInRegion(enc.troopId, currentRegion, loc.x, loc.y)
                );

                let chosenTroopId = null;
                if (isProcGenMap) {
                    if (!$gameSystem._procGenEnemyTroops) $gameSystem._procGenEnemyTroops = {};
                    const savedTroopId = $gameSystem._procGenEnemyTroops[ev.eventId()];
                    if (savedTroopId && $dataTroops[savedTroopId]) chosenTroopId = savedTroopId;
                }

                if (chosenTroopId === null) {
                    // The special-biome resident, placed before anything else
                    // can claim the event so neither the level band nor the era
                    // elites can crowd it out.
                    if (!specialPlaced && specialPool.length > 0) {
                        const specialHere = specialPool.filter(enc =>
                            BSE.Helpers.canTroopSpawnInRegion(enc.troopId, currentRegion, loc.x, loc.y));
                        if (specialHere.length > 0) {
                            // Whichever resident sits nearest the band, so the
                            // creature the party meets still fits where they
                            // are: the filters fall back to the closest level
                            // when the band holds none of them, which is what
                            // makes the guarantee unconditional.
                            const inBand = bandApplies ? applyBand(specialHere) : specialHere;
                            chosenTroopId = selectWeightedRandom(
                                inBand.length > 0 ? inBand : specialHere).troopId;
                        }
                    }

                    // Era high-level spawn: from 2010 a quarter of the roaming
                    // enemies (and from 2012 two fifths of them) come out of the
                    // era band regardless of the party level. A one-species
                    // structure is exempt: its whole population is that
                    // species by design.
                    if (chosenTroopId === null && eraElitePool.length > 0 &&
                        !uniformSpecies && Math.random() < spawnEra.eliteShare) {
                        const eliteHere = eraElitePool.filter(enc =>
                            BSE.Helpers.canTroopSpawnInRegion(enc.troopId, currentRegion, loc.x, loc.y)
                        );
                        if (eliteHere.length > 0) {
                            chosenTroopId = selectWeightedRandom(eliteHere).troopId;
                        }
                    }

                    if (chosenTroopId === null) {
                        if (validTroops.length === 0) {
                            // Nothing in the roster can stand here. On water that
                            // is the end of it - the fallback below would drop a
                            // land animal into the sea - so the event is dropped
                            // instead.
                            if (locIsWater) { ev.erase(); continue; }
                            else validTroops = encounterList;
                        }
                        // Narrow the candidates to the band the place holds.
                        // A `deadly` structure overrides it: its guardians are
                        // always far above the level the map is pitched at,
                        // which is the rule the temple has always used and the
                        // shrine, the library and the lava tube now share. An
                        // alien surface is filtered by none of it.
                        let pickList = validTroops;
                        if (pickList.length > 0 && bandApplies) {
                            pickList = (structDanger === 'deadly' && !towerFloorLevel)
                                ? BSE.Helpers.filterTroopsWellAboveLevel(pickList, baseRefLevel)
                                : applyBand(pickList);
                        }
                        if (pickList.length > 0) {
                            if (uniformSpecies) {
                                // One species per den: seeded pick, then reused
                                // for every other enemy event on this map.
                                if (denTroopId === null ||
                                    !pickList.some(enc => enc.troopId === denTroopId)) {
                                    denTroopId = BSE.Helpers.pickSeededTroop(pickList.map(enc => enc.troopId));
                                }
                                chosenTroopId = denTroopId;
                            } else {
                                // The encounter list is already weighted by the current
                                // nation's per-enemy frequency, so a straight weighted
                                // pick spawns from the (mode-filtered) candidates.
                                chosenTroopId = selectWeightedRandom(pickList).troopId;
                            }
                        }
                    }

                    if (isProcGenMap && chosenTroopId !== null) {
                        if (!$gameSystem._procGenEnemyTroops) $gameSystem._procGenEnemyTroops = {};
                        $gameSystem._procGenEnemyTroops[ev.eventId()] = chosenTroopId;
                    }
                }
                // Read outside the "choose one" block so a troop restored from
                // the per-tile cache satisfies the guarantee too.
                if (chosenTroopId !== null && BSE.Helpers.isSpecialTroop(chosenTroopId)) {
                    specialPlaced = true;
                }
                // Same reason: a water-dweller restored from the per-tile cache
                // settles the guarantee just as a freshly drawn one does, so a
                // revisited shore is not re-stocked with an extra fish every
                // time the party walks back onto it.
                if (chosenTroopId !== null && locIsWater &&
                    BSE.Helpers.troopIsWaterDwelling(chosenTroopId)) {
                    waterPlaced = true;
                }

                if (chosenTroopId !== null) {
                    ev._fixedTroopId = chosenTroopId;
                    ev._isAquaticEnemy = undefined;
                    ev._isAmphibiousEnemy = undefined;
                    // Bind the personality AFTER locate(), so the creature's
                    // home post (the tile a guard returns to, the perch a bird
                    // swoops back onto) is where it actually stands.
                    BSE.Helpers.applyEnemyMovement(ev);
                    ev.updateCharacterSprite();
                    ev.setOpacity(255);
                    ev.setThrough(false);
                } else {
                    ev.erase();
                }
            } else {
                ev.erase();
            }
        }
    };

    // ========================================================================
    // 5b. REINFORCEMENTS - the monsters standing nearby pile into the fight
    // ========================================================================
    // A fight on the overworld is not fought in a bubble: every other roaming
    // monster within JOIN_RANGE tiles of the party joins the troop the battle
    // is set up with, up to JOIN_MAX of them, nearest first. Their map events
    // are held in BSE.State.joinedEnemyEvents for the whole battle so the state
    // module can delete them on a win and hand their HP back on a flee.
    //
    // This applies to Scene_Battle fights only. A tactical map battle
    // (MapBattleMode.js) already fights on the live map with everyone standing
    // where they stand, and startPersistentBattle redirects to it before ever
    // reaching this code.

    BSE.Data.JOIN_RANGE = 3;  // tiles; a monster closer than this joins in
    BSE.Data.JOIN_MAX   = 4;  // at most this many extra troops per battle
    BSE.Data.BATTLE_MAX_MEMBERS = 6; // hard cap: base + joiners combined

    // The scratch $dataTroops slot the combined troop is written into. One slot
    // is reserved per session and rewritten for every reinforced battle rather
    // than growing the database a troop at a time. $dataTroops is rebuilt from
    // disk on every load, so the marker doubles as a "is my slot still mine".
    let _reinforcedSlot = 0;
    function reinforcedTroopSlot() {
        const held = $dataTroops[_reinforcedSlot];
        if (_reinforcedSlot > 0 && held && held._bseReinforced) return _reinforcedSlot;
        _reinforcedSlot = $dataTroops.length;
        $dataTroops.push({
            id: _reinforcedSlot, name: '', members: [], pages: [], _bseReinforced: true
        });
        return _reinforcedSlot;
    }

    // The scratch slots are battle fixtures, never spawnable troops: they must
    // be skipped by every candidate scan that walks $dataTroops.
    // Every candidate scan in this file starts here, which is why the world's
    // population answer is folded in: a monster world's people and an empty
    // world's <Talk> creatures are then unreachable through the biome rosters,
    // the era elites, both boss pools, the structure lists, the no-biome
    // fallback and the random alien list alike, with no scan of its own to
    // teach. See troopDataAllowedInPopulation.
    BSE.Helpers.isSpawnableTroopData = function(troop) {
        return !!(troop && troop.members && troop.members.length &&
            !troop._bseReinforced && !troop._bsePetrodemon &&
            BSE.Helpers.troopDataAllowedInPopulation(troop) &&
            BSE.Helpers.troopDataAllowedInMagic(troop));
    };

    // The magic level's half of the same gate (window.MagicNature), a separate
    // axis from the alternate timeline: a severed world is roamed by nothing
    // that works by magic and an unbound one by nothing else. Every creature
    // carries <Nature:> in its notebox. One disallowed member disqualifies the
    // troop, exactly as the population rule does: a troop is spawned whole.
    BSE.Helpers.troopDataAllowedInMagic = function(troop) {
        const MN = window.MagicNature;
        if (!MN || !MN.isFiltering()) return true;
        if (!troop || !troop.members || !troop.members.length) return true;
        return troop.members.every(m => MN.allowsEnemyId(m.enemyId));
    };

    // The enemy events that join a battle started against `triggerEventId`.
    // EVERY live enemy event within JOIN_RANGE tiles joins, whatever species it
    // is: a wolf standing next to a bandit is in the same fight as the bandit,
    // and a battle is a brawl between whoever happens to be standing there
    // rather than a duel against copies of one monster. Joiners are capped so
    // the total troop-member count (base + all joiners) never exceeds
    // the cap the party earns: BATTLE_MAX_MEMBERS normally, and the smaller
    // lone-traveller cap when there is only one of them. Nearest first.
    BSE.Functions.getJoiningEnemyEvents = function(triggerEventId) {
        if (!$gameMap || !$gamePlayer) return [];
        const range = BSE.Data.JOIN_RANGE;
        // Not the flat cap: a character travelling alone is held to a smaller
        // one, so a lone traveller is never surrounded (BSE.Helpers.maxEnemiesForParty).
        const maxMembers = BSE.Helpers.maxEnemiesForParty();

        // Get the base troop so we can count the slots it already occupies.
        const triggerEvent = $gameMap.event(triggerEventId);
        const baseTroopId  = triggerEvent ? triggerEvent._fixedTroopId : 0;
        const baseTroop    = baseTroopId ? $dataTroops[baseTroopId] : null;
        if (!baseTroop || !baseTroop.members.length) return [];

        const partyLevel = BSE.Helpers.getPartyReferenceLevel ? BSE.Helpers.getPartyReferenceLevel() : 1;
        // If the triggering enemy is much higher level than the party, it will
        // not drag other roaming enemies into the battle (it fights alone).
        if (BSE.Helpers.isTroopMuchHigherLevel && BSE.Helpers.isTroopMuchHigherLevel(baseTroopId, partyLevel)) {
            return [];
        }

        let usedSlots = baseTroop.members.length; // slots already occupied by base
        const near = [];
        for (const ev of $gameMap.events()) {
            if (!ev || ev.eventId() === triggerEventId) continue;
            if (!isLiveEnemyEvent(ev)) continue;
            // Roaming enemies much higher level than the party do not join multi encounters
            if (BSE.Helpers.isEventMuchHigherLevel && BSE.Helpers.isEventMuchHigherLevel(ev, partyLevel)) {
                continue;
            }
            const troop = $dataTroops[ev._fixedTroopId];
            if (!troop || !troop.members.length) continue;
            const dx = ev.x - $gamePlayer.x, dy = ev.y - $gamePlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= range) continue;
            near.push({ event: ev, dist: dist, memberCount: troop.members.length });
        }
        near.sort((a, b) => a.dist - b.dist);

        // Pick nearest joiners until the battle cap is reached. A troop too big
        // for the slots left is skipped rather than ending the scan, so a lone
        // straggler further out still gets in behind a crowded pack.
        const joiners = [];
        for (const n of near) {
            if (joiners.length >= BSE.Data.JOIN_MAX) break;
            if (usedSlots >= maxMembers) break;
            if (usedSlots + n.memberCount > maxMembers) continue;
            joiners.push(n.event);
            usedSlots += n.memberCount;
        }
        return joiners;
    };

    // Evenly spread ALL members of a combined troop (base + joiners) across the
    // 2D battle field so they never overlap. `totalMembers` is the final count,
    // `slot` is this member's index (0-based). Each slot gets a fixed horizontal
    // pitch centred on the screen.
    function joinerPosition(baseMembers, slot, totalMembers) {
        const w  = Graphics.boxWidth  || 816;
        const h  = Graphics.boxHeight || 624;
        const cy = h * 0.50;
        const n  = totalMembers || (baseMembers.length + 1);
        // Distribute across 80 % of the screen width, centred.
        const usable = w * 0.80;
        const pitch  = n > 1 ? usable / (n - 1) : 0;
        const startX = (w - usable) / 2;
        const x = n > 1 ? startX + slot * pitch : w / 2;
        // Stagger depth slightly on alternating slots.
        const y = cy + (slot % 2 === 0 ? -28 : 28);
        return {
            x: Math.max(64, Math.min(w - 64, Math.round(x))),
            y: Math.max(120, Math.min(h - 80, Math.round(y)))
        };
    }

    // Build the troop the battle actually runs on: the triggering troop plus
    // every joining event's troop, and the bookkeeping the state module needs
    // to put each joiner's map event back the way the battle left it.
    // Returns { troopId, joined: [{ eventId, mapId, persistentId, memberIndexes }] }.
    BSE.Functions.buildReinforcedTroop = function(baseTroopId, joinEvents, mapId) {
        const base = $dataTroops[baseTroopId];
        if (!base || !joinEvents || !joinEvents.length) {
            return { troopId: baseTroopId, joined: [] };
        }

        // Count total members so joinerPosition can spread everyone evenly.
        let totalMembers = base.members.length;
        for (const ev of joinEvents) {
            const t = $dataTroops[ev._fixedTroopId];
            if (t) totalMembers += t.members.filter(m => $dataEnemies[m.enemyId]).length;
        }

        // Assign evenly-spread 2D positions across ALL members (base included).
        const members = base.members.map((m, i) => {
            const pos = joinerPosition(base.members, i, totalMembers);
            return Object.assign({}, m, { x: pos.x, y: pos.y });
        });
        // Species keys ride along per member: a reinforced troop can mix two
        // procedural alien species, which one key on the troop cannot express.
        const speciesKeys = members.map(() => base._alienSpeciesKey || null);
        const joined = [];
        let slot = base.members.length; // joiner slots start after base members

        for (const ev of joinEvents) {
            const troop = $dataTroops[ev._fixedTroopId];
            if (!troop || !troop.members.length) continue;
            const memberIndexes = [];
            for (const m of troop.members) {
                if (!$dataEnemies[m.enemyId]) continue;
                const pos = joinerPosition(base.members, slot++, totalMembers);
                memberIndexes.push(members.length);
                members.push({ enemyId: m.enemyId, x: pos.x, y: pos.y, hidden: false });
                speciesKeys.push(troop._alienSpeciesKey || null);
            }
            if (!memberIndexes.length) continue;
            joined.push({
                eventId: ev.eventId(),
                mapId: mapId,
                persistentId: `${mapId}_${ev.eventId()}`,
                memberIndexes: memberIndexes
            });
        }
        if (!joined.length) return { troopId: baseTroopId, joined: [] };

        const slotId = reinforcedTroopSlot();
        const scratch = $dataTroops[slotId];
        scratch.name = base.name;
        scratch.members = members;
        // The battle event pages belong to the troop that started the fight; a
        // page addressing "enemy #2" would otherwise land on a newcomer.
        scratch.pages = base.pages;
        scratch._alienSpeciesKeys = speciesKeys.some(k => k) ? speciesKeys : null;
        return { troopId: slotId, joined: joined };
    };

    // ========================================================================
    // 6. Game_Event - Movement & Setup Overrides
    // ========================================================================

    Game_Event.prototype.setupFleeingMovement = function() {
        const route = {
            list: [
                { code: 32 },
                { code: 0 }
            ],
            repeat: true,
            skippable: true,
            wait: false
        };
        this.forceMoveRoute(route);
        this._fleeingMovement = true;
    };

    Game_Event.prototype.isFleeingMovement = function() {
        return this._fleeingMovement || false;
    };

    const _Game_Event_initialize = Game_Event.prototype.initialize;
    Game_Event.prototype.initialize = function(mapId, eventId) {
        _Game_Event_initialize.call(this, mapId, eventId);
        this.selectFixedTroopIdFromNote();
        this._movementLocked = false;
        this._movementLockTimer = 0;
        this._fleeingMovement = false;
        this._isAquaticEnemy = false;
        // Movement personality state (section 6b). The home post is filled in
        // on the first AI tick, since a roaming monster is placed after this.
        this._aiState = 'idle';
        this._aiTimer = 0;
        this._aiScan = 0;
        this._aiRoused = 0;
        this._aiHome = null;
        this._aiLast = null;
        this._aiDashDir = 0;
        this.updateCharacterSprite();
    };

    Game_Event.prototype.getMaxHpForEvent = function() {
        if (!this._fixedTroopId) return 100;
        const troop = $dataTroops[this._fixedTroopId];
        if (!troop || !troop.members.length) return 100;
        const enemy = $dataEnemies[troop.members[0].enemyId];
        return enemy ? enemy.params[0] : 100;
    };

    Game_Event.prototype.selectFixedTroopIdFromNote = function() {
        if (this.event().name === "Enemy") {
            this._fixedTroopId = 0;
            return;
        }
        const note = this.event().note || "";
        if (note.includes('?')) {
            const validTroopIds = $dataTroops.slice(1)
                .map((t, i) => t ? i + 1 : 0)
                .filter(id => id > 0 && $dataTroops[id].members.length > 0);
            if (validTroopIds.length > 0) {
                this._fixedTroopId = validTroopIds[Math.floor(Math.random() * validTroopIds.length)];
            }
        } else {
            const troopIds = note.split(',').map(id => parseInt(id.trim())).filter(id => id > 0);
            if (troopIds.length > 0) {
                this._fixedTroopId = troopIds[Math.floor(Math.random() * troopIds.length)];
            } else {
                this._fixedTroopId = 0;
            }
        }
        if (this._fixedTroopId > 0) {
            // _fixedTroopId is a troop id; the <Movement:...> and <Speed:> tags
            // live on the troop's first enemy member, not on an enemy with that
            // same id.
            BSE.Helpers.applyEnemyMovement(this);
            const persistentId = `${this._mapId}_${this._eventId}`;
            if (!BSE.State.persistentEnemyData[persistentId]) {
                BSE.State.persistentEnemyData[persistentId] = {
                    troopId: this._fixedTroopId,
                    enemyHp: {}
                };
            }
        }
    };

    // ========================================================================
    // 6b. MOVEMENT PERSONALITIES (sight, alertness, chases)
    // ========================================================================
    // A roaming monster used to be a moving trap: it either stood still, drifted
    // at random or walked straight at the party from across the map, with no
    // reason to do either and nothing the player could read. A personality
    // answers three separate questions instead:
    //
    //   idle    what the creature does when nothing is happening
    //   senses  how it notices the party (sight range, facing cone, whether a
    //           wall stops it) and how long it remembers
    //   react   what it does once it HAS noticed
    //
    // and drives one small state machine per map event:
    //
    //   idle -> alert -> commit -> search -> return -> idle
    //
    // `alert` is the telegraph: the creature stops, turns to face the party and
    // shows an exclamation before it commits, which is what makes the whole
    // thing playable. A player who can see the moment they were spotted can
    // break line of sight, kite the thing round a rock, lead it into a hazard
    // or another monster's territory, or simply walk out of its leash.
    //
    // Fields of a personality (all optional but `idle`):
    //   idle        still | perch | wander | graze | dart | drift | patrol |
    //               scan | territory | scavenge
    //   react       null (never reacts) | chase | track | flee | coward |
    //               stalk | ambush | swoop | charge | pack | circle
    //   sight       tiles it can notice the party at (0 = blind to the party)
    //   cone        degrees of the facing arc it watches (360 = all round)
    //   los         a wall between the two hides the party
    //   leash       distance at which it gives the chase up
    //   memory      frames it keeps hunting after losing sight
    //   alert       frames of telegraph before it commits
    //   chaseSpeed  move speed added while committed
    //   band        [near, far] distance it prefers to hold (stalk/circle/...)
    //   home        it walks back to where it started when it disengages
    //   homeRadius  how far from home it will roam / defend
    //   freq        move frequency (1 lethargic .. 5 restless)
    //   relentless  never gives up, never flees, cannot be startled

    const MOVE_BEHAVIORS = {
        // --- the four legacy tags, kept working and given senses -------------
        fixed:       { idle: 'still',     react: null,      sight: 0 },
        random:      { idle: 'wander',    react: null,      sight: 0 },
        approach:    { idle: 'wander',    react: 'chase',   sight: 7,  cone: 360, los: true,  leash: 12, memory: 150, alert: 20, chaseSpeed: 0.5 },
        fleeing:     { idle: 'wander',    react: 'flee',    sight: 8,  cone: 360, los: false, leash: 10, memory: 60,  alert: 0,  chaseSpeed: 1 },

        // --- prey ------------------------------------------------------------
        // Grazes with its head down, bolts the moment it looks up and sees you.
        skittish:    { idle: 'graze',     react: 'flee',    sight: 6,  cone: 360, los: true,  leash: 9,  memory: 45,  alert: 0,  chaseSpeed: 1.5, freq: 3 },
        // Too big or too stupid to care until you are almost on top of it.
        grazer:      { idle: 'graze',     react: 'flee',    sight: 3,  cone: 200, los: false, leash: 6,  memory: 30,  alert: 0,  chaseSpeed: 1,   freq: 2 },
        // Runs while you are close, trails you at a distance once you are not.
        coward:      { idle: 'wander',    react: 'coward',  sight: 8,  cone: 360, los: true,  leash: 13, memory: 120, alert: 0,  chaseSpeed: 1,   band: [5, 9] },
        // Works the corpses, gives the living a wide berth.
        scavenger:   { idle: 'scavenge',  react: 'coward',  sight: 7,  cone: 360, los: true,  leash: 10, memory: 60,  alert: 0,  chaseSpeed: 1,   band: [4, 8] },

        // --- posted -----------------------------------------------------------
        // Stands its post and sweeps its gaze; sees a long way, but only ahead.
        sentry:      { idle: 'scan',      react: 'chase',   sight: 10, cone: 110, los: true,  leash: 11, memory: 180, alert: 30, chaseSpeed: 0.5, home: true, homeRadius: 10 },
        // Never leaves the door it is standing in front of for long.
        guard:       { idle: 'still',     react: 'chase',   sight: 6,  cone: 360, los: true,  leash: 7,  memory: 90,  alert: 20, chaseSpeed: 0.5, home: true, homeRadius: 6 },
        // Walks a beat and watches the way it is walking.
        patrol:      { idle: 'patrol',    react: 'chase',   sight: 8,  cone: 150, los: true,  leash: 13, memory: 180, alert: 25, chaseSpeed: 0.5, home: true, homeRadius: 14 },
        // Owns a patch of ground. Step off it and it stops caring about you.
        territorial: { idle: 'territory', react: 'chase',   sight: 8,  cone: 360, los: true,  leash: 14, memory: 120, alert: 20, chaseSpeed: 1,   home: true, homeRadius: 7, territory: true },

        // --- ambush -----------------------------------------------------------
        // Looks like part of the scenery until you are close enough.
        ambusher:    { idle: 'still',     react: 'ambush',  sight: 3,  cone: 360, los: false, leash: 9,  memory: 70,  alert: 36, chaseSpeed: 2,   home: true, homeRadius: 9 },
        // The same, but it barely leaves the hole it came out of.
        lurker:      { idle: 'still',     react: 'ambush',  sight: 2,  cone: 360, los: false, leash: 5,  memory: 40,  alert: 30, chaseSpeed: 1.5, home: true, homeRadius: 5 },
        // Furniture. Touch it once and it follows you to the end of the map.
        mimic:       { idle: 'still',     react: 'ambush',  sight: 1,  cone: 360, los: false, leash: 999, memory: 99999, alert: 45, chaseSpeed: 1, relentless: true },
        // Perches, waits, drops on you in a straight line, climbs back up.
        swooper:     { idle: 'perch',     react: 'swoop',   sight: 10, cone: 360, los: false, leash: 12, memory: 90,  alert: 30, chaseSpeed: 2.5, home: true, homeRadius: 12 },
        // Paws the ground until it shares a row with you, then it does not stop.
        charger:     { idle: 'wander',    react: 'charge',  sight: 9,  cone: 240, los: true,  leash: 12, memory: 120, alert: 30, chaseSpeed: 2.5 },

        // --- hunters ----------------------------------------------------------
        // Keeps its distance, closes only while your back is turned.
        stalker:     { idle: 'wander',    react: 'stalk',   sight: 12, cone: 360, los: true,  leash: 18, memory: 300, alert: 0,  chaseSpeed: 0,   band: [4, 7] },
        // Does not need to see you, does not lose you, does not give up.
        hunter:      { idle: 'wander',    react: 'track',   sight: 14, cone: 360, los: false, leash: 30, memory: 600, alert: 40, chaseSpeed: 0,   relentless: true },
        // Holds off alone and calls; commits the moment the pack is with it.
        pack:        { idle: 'wander',    react: 'pack',    sight: 10, cone: 360, los: true,  leash: 15, memory: 180, alert: 20, chaseSpeed: 1,   band: [3, 6] },
        // Circles just out of reach and darts in.
        orbiter:     { idle: 'wander',    react: 'circle',  sight: 9,  cone: 360, los: false, leash: 12, memory: 150, alert: 0,  chaseSpeed: 1,   band: [4, 5] },

        // --- mindless ---------------------------------------------------------
        // Darts, stops, darts somewhere else. Only notices what it bumps into.
        erratic:     { idle: 'dart',      react: 'chase',   sight: 4,  cone: 360, los: false, leash: 6,  memory: 30,  alert: 0,  chaseSpeed: 1.5, freq: 5 },
        // Carried along by whatever carries it. You are not part of its world.
        drifter:     { idle: 'drift',     react: null,      sight: 0,  freq: 2 }
    };

    // Spellings that used to be written, or that read naturally in a note.
    const MOVE_ALIASES = {
        follow: 'approach', chase: 'approach', approaching: 'approach',
        flee: 'fleeing', afraid: 'fleeing', still: 'fixed', none: 'fixed',
        stationary: 'fixed', wander: 'random', roam: 'random',
        ambush: 'ambusher', stalk: 'stalker', swoop: 'swooper',
        charge: 'charger', orbit: 'orbiter', drift: 'drifter',
        graze: 'grazer', scavenge: 'scavenger', sentinel: 'sentry',
        pack_hunter: 'pack', packhunter: 'pack', shy: 'skittish'
    };

    BSE.Data.MOVEMENT_BEHAVIORS = MOVE_BEHAVIORS;

    // Idles that move the creature around on their own. Everything else stands
    // where it is until its reaction says otherwise, which is what tells the
    // engine's own move type apart from ours.
    const IDLE_WANDERS = {
        wander: true, graze: true, dart: true, drift: true,
        patrol: true, territory: true, scavenge: true
    };

    // Personality of last resort, for an enemy carrying no <Movement:> tag (or
    // one nobody has heard of). Ecology first, since that is the role the
    // creature already plays in the food web, then the archetype's own nature.
    const ARCHETYPE_FALLBACK = {
        Bird: 'swooper', Bat: 'swooper', Phoenix: 'swooper',
        Insectoid: 'erratic', InsectSwarm: 'erratic', Spider: 'ambusher',
        Scorpion: 'ambusher', Snail: 'grazer', Rabbit: 'skittish',
        Plant: 'fixed', Mushroom: 'fixed', Tree: 'fixed',
        Totem: 'sentry', Turret: 'sentry', RoboticDefender: 'guard',
        ChestMimic: 'mimic', Slime: 'drifter', Ghost: 'stalker',
        Elemental: 'drifter', Jellyfish: 'drifter',
        Golem: 'guard', ArmoredKnight: 'patrol', Skeleton: 'patrol',
        Undead: 'hunter', ConstructedUndead: 'hunter', Voidspawn: 'stalker',
        Goblin: 'pack', Hellhound: 'pack', Beast: 'pack',
        Dragon: 'territorial', Serpent: 'ambusher', Hydra: 'territorial',
        TentacledCreature: 'lurker', Octopus: 'lurker', Crustacean: 'territorial',
        Turtle: 'grazer', Frog: 'ambusher', Amphibian: 'skittish',
        Robot: 'sentry', Drone: 'orbiter', Fairy: 'orbiter',
        Bacterial: 'erratic', TrashCreature: 'scavenger'
    };
    const ECOLOGY_FALLBACK = {
        Hunter: 'hunter', Predator: 'territorial', Prey: 'skittish', Neutral: 'random'
    };

    // Rooted life is the only thing on a map allowed to stand still forever.
    // Anything else that was written as 'fixed' - a golem posted in a hall, a
    // totem, a crystal - keeps its senses but is given its archetype's own
    // personality instead, so the world never reads as a room full of props.
    const PLANT_ARCHETYPES = { Plant: true, Mushroom: true, Tree: true };

    BSE.Helpers.isPlantEnemy = function(enemyData) {
        return !!PLANT_ARCHETYPES[BSE.Helpers.getEnemyArchetype(enemyData)];
    };

    function defaultBehaviorKey(enemyData) {
        const arch = BSE.Helpers.getEnemyArchetype(enemyData);
        if (arch && ARCHETYPE_FALLBACK[arch]) return ARCHETYPE_FALLBACK[arch];
        const eco = BSE.Helpers.getEnemyEcology(enemyData);
        return ECOLOGY_FALLBACK[eco] || 'random';
    }

    // The personality key of an enemy, cached on the shared $dataEnemies entry
    // (notes never change at runtime and this is read from movement code).
    BSE.Helpers.getEnemyMovementKey = function(enemyData) {
        if (!enemyData) return 'random';
        if (enemyData._bseMoveKey !== undefined) return enemyData._bseMoveKey;
        let key = null;
        if (enemyData.note) {
            const m = enemyData.note.match(/<Movement:\s*([A-Za-z_]+)\s*>/i);
            if (m) {
                const k = m[1].toLowerCase();
                key = MOVE_BEHAVIORS[k] ? k : (MOVE_ALIASES[k] || null);
            }
        }
        if (!key) key = defaultBehaviorKey(enemyData);
        if (key === 'fixed' && !BSE.Helpers.isPlantEnemy(enemyData)) {
            const fallback = defaultBehaviorKey(enemyData);
            key = fallback === 'fixed' ? 'guard' : fallback;
        }
        enemyData._bseMoveKey = key;
        return enemyData._bseMoveKey;
    };

    BSE.Helpers.getMovementBehavior = function(key) {
        return MOVE_BEHAVIORS[key] || MOVE_BEHAVIORS.random;
    };

    // Peaceful mode keeps every creature's idle - a bird still perches, a
    // sentry still sweeps its post - and takes away only the reaction to the
    // party. Pacified twins are built once and cached on the table.
    const _pacified = {};
    function pacify(key, beh) {
        if (!_pacified[key]) {
            _pacified[key] = Object.assign({}, beh, {
                react: null, sight: 0, relentless: false, chaseSpeed: 0
            });
        }
        return _pacified[key];
    }

    // The personality an event is actually running, cached on the event and
    // keyed on its troop so a re-fixed event re-derives it.
    BSE.Helpers.getEventBehavior = function(event) {
        if (!event || !event._fixedTroopId) return null;
        const peaceful = !!($gameSystem && $gameSystem._peacefulMode);
        if (event._bseBehTroop === event._fixedTroopId &&
            event._bseBehPeace === peaceful) return event._bseBeh;
        const troop = $dataTroops[event._fixedTroopId];
        const enemyData = (troop && troop.members.length)
            ? $dataEnemies[troop.members[0].enemyId] : null;
        const key = BSE.Helpers.getEnemyMovementKey(enemyData);
        const beh = BSE.Helpers.getMovementBehavior(key);
        event._bseBehTroop = event._fixedTroopId;
        event._bseBehPeace = peaceful;
        event._bseBehKey = key;
        event._bseBeh = peaceful ? pacify(key, beh) : beh;
        return event._bseBeh;
    };

    // Bind an event to its enemy's movement personality: base speed, the engine
    // move type its idle needs, its home post, and a clean AI state. Called
    // wherever an event is fixed to a troop, and always AFTER it has been
    // placed, so the home post is the tile it is standing on.
    BSE.Helpers.applyEnemyMovement = function(event) {
        if (!event || !event._fixedTroopId) return;
        const troop = $dataTroops[event._fixedTroopId];
        const enemyData = (troop && troop.members.length)
            ? $dataEnemies[troop.members[0].enemyId] : null;
        if (enemyData && enemyData.note) {
            const speedMatch = enemyData.note.match(/<Speed:\s*([1-6](?:\.\d+)?)>/i);
            if (speedMatch) event.setMoveSpeed(Number(speedMatch[1]));
        }
        // Whatever the template event or the <Speed:> tag asked for, an idling
        // creature is held under a walking party (see roamSpeedCap): a monster
        // the player cannot walk away from is a monster the player has to fight.
        if (event._moveSpeed > 0) {
            event.setMoveSpeed(Math.min(event._moveSpeed, roamSpeedCap()));
        }
        event._bseBehTroop = -1; // force a re-derive on the next read
        const beh = BSE.Helpers.getEventBehavior(event);
        if (!beh) return;
        event._aiBaseSpeed = event._moveSpeed;
        event._moveType = IDLE_WANDERS[beh.idle] ? 1 : 0;
        if (beh.freq) event.setMoveFrequency(beh.freq);
        event._aiState = 'idle';
        event._aiTimer = 0;
        event._aiSeen = false;
        event._aiLast = null;
        event._aiRoused = 0;
        // The home post is a MAP coordinate, and this pass runs inside the
        // stitched window's square-local view (ProcStitch.inPartySquare), where
        // event.x reads back as the tile's position inside its own 64x64 square.
        // Written from that, every creature in a square the window does not have
        // at its corner woke up believing home was one or two squares away and
        // set off for it, so a square the party had just walked into emptied
        // itself as fast as it was stocked. _x is the map position either way.
        event._aiHome = { x: event._x, y: event._y };
        event._aiPatrolDir = 0;
        event._aiDriftDir = 0;
        event._aiStuck = 0;
    };

    // ------------------------------------------------------------------------
    // Senses
    // ------------------------------------------------------------------------

    // Tiles that stop sight: a tile nothing can walk into from any side (a
    // wall, a cliff face, the side of a building). Water, props and furniture
    // are all see-through.
    function blocksSight(x, y) {
        if (!$gameMap.isValid(x, y)) return true;
        return !$gameMap.isPassable(x, y, 2) && !$gameMap.isPassable(x, y, 8) &&
               !$gameMap.isPassable(x, y, 4) && !$gameMap.isPassable(x, y, 6);
    }

    // Bresenham walk between two tiles, both ends excluded.
    BSE.Helpers.hasLineOfSight = function(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy, x = x0, y = y0;
        for (let guard = 0; guard < 64; guard++) {
            if (x === x1 && y === y1) return true;
            const e2 = err * 2;
            if (e2 > -dy) { err -= dy; x += sx; }
            if (e2 < dx)  { err += dx; y += sy; }
            if (x === x1 && y === y1) return true;
            if (blocksSight(x, y)) return false;
        }
        return true;
    };

    // Is (tx, ty) inside this creature's facing arc? 360 watches all round.
    function inSightCone(ev, tx, ty, cone) {
        if (!cone || cone >= 360) return true;
        const dx = tx - ev.x, dy = ty - ev.y;
        let along, perp;
        switch (ev.direction()) {
            case 2: along =  dy; perp = Math.abs(dx); break;
            case 8: along = -dy; perp = Math.abs(dx); break;
            case 6: along =  dx; perp = Math.abs(dy); break;
            case 4: along = -dx; perp = Math.abs(dy); break;
            default: return true;
        }
        if (along <= 0) return false;
        return perp <= along * Math.tan((cone / 2) * Math.PI / 180);
    }

    // Who the wildlife is watching: the party leader, plus player 2's avatar
    // while the screen is split. Nearest wins.
    function nearestQuarry(ev) {
        let best = $gamePlayer, bestD = Infinity;
        if ($gamePlayer) {
            bestD = Math.abs($gamePlayer.x - ev.x) + Math.abs($gamePlayer.y - ev.y);
        }
        const ss = window.$gameSplitScreen;
        const p2 = ss && ss.active ? ss.p2Event : null;
        if (p2 && !p2._erased) {
            const d = Math.abs(p2.x - ev.x) + Math.abs(p2.y - ev.y);
            if (d < bestD) { best = p2; bestD = d; }
        }
        return best;
    }

    // Is the quarry looking somewhere else? A stalker only closes on a back.
    function quarryFacesAway(ev, target) {
        if (!target || !target.direction) return false;
        const dx = ev.x - target.x, dy = ev.y - target.y;
        switch (target.direction()) {
            case 2: return dy < 0;
            case 8: return dy > 0;
            case 6: return dx < 0;
            case 4: return dx > 0;
        }
        return false;
    }

    // ------------------------------------------------------------------------
    // Steps
    // ------------------------------------------------------------------------

    function aiStepToward(ev, x, y) {
        const sx = ev.deltaXFrom(x), sy = ev.deltaYFrom(y);
        if (Math.abs(sx) > Math.abs(sy)) {
            ev.moveStraight(sx > 0 ? 4 : 6);
            if (!ev.isMovementSucceeded() && sy !== 0) ev.moveStraight(sy > 0 ? 8 : 2);
        } else if (sy !== 0) {
            ev.moveStraight(sy > 0 ? 8 : 2);
            if (!ev.isMovementSucceeded() && sx !== 0) ev.moveStraight(sx > 0 ? 4 : 6);
        }
        // A monster that cannot get round a corner is a monster the player
        // stops fearing: sidestep once rather than grinding into the wall.
        if (!ev.isMovementSucceeded()) {
            ev._aiStuck = (ev._aiStuck || 0) + 1;
            if (ev._aiStuck >= 2) { ev.moveRandom(); ev._aiStuck = 0; }
        } else {
            ev._aiStuck = 0;
        }
    }

    function aiStepAway(ev, x, y) {
        const sx = ev.deltaXFrom(x), sy = ev.deltaYFrom(y);
        if (Math.abs(sx) > Math.abs(sy)) {
            ev.moveStraight(sx > 0 ? 6 : 4);
            if (!ev.isMovementSucceeded() && sy !== 0) ev.moveStraight(sy > 0 ? 2 : 8);
        } else if (sy !== 0) {
            ev.moveStraight(sy > 0 ? 2 : 8);
            if (!ev.isMovementSucceeded() && sx !== 0) ev.moveStraight(sx > 0 ? 6 : 4);
        }
        // Cornered: anywhere is better than here.
        if (!ev.isMovementSucceeded()) ev.moveRandom();
    }

    // Sidestep, so a circler goes round its quarry instead of into it.
    function aiStepAround(ev, x, y, clockwise) {
        const sx = ev.deltaXFrom(x), sy = ev.deltaYFrom(y);
        let d;
        if (Math.abs(sx) > Math.abs(sy)) d = (sx > 0) === !!clockwise ? 8 : 2;
        else d = (sy > 0) === !!clockwise ? 4 : 6;
        ev.moveStraight(d);
        if (!ev.isMovementSucceeded()) aiStepToward(ev, x, y);
    }

    function aiHomeDist(ev) {
        const h = ev._aiHome;
        if (!h) return 0;
        return Math.abs(ev.x - h.x) + Math.abs(ev.y - h.y);
    }

    function clampSpeed(v) {
        return Math.max(1, Math.min(6, v));
    }

    // How fast a roaming creature is allowed to be is measured against the
    // party, not written down in absolute numbers: the player walks at their
    // own move speed and dashes one point above it, and a monster that matches
    // either of those can never be broken away from - it simply arrives, and
    // the whole telegraph-and-kite loop the AI is built around stops being
    // playable. So a creature at rest stays half a point under a walking
    // party, and a committed one may outpace a walk but never a run. RMMZ
    // speed is logarithmic (every point doubles the distance per frame), so
    // half a point is already a comfortable margin to escape into.
    function playerTopSpeed() {
        const base = ($gamePlayer && $gamePlayer._moveSpeed > 0) ? $gamePlayer._moveSpeed : 4;
        // A map that forbids dashing (and a party riding something) takes the
        // extra point away, and the caps have to come down with it or the run
        // the player is being asked to make is one they cannot make.
        const canDash = !!$gameMap && !$gameMap.isDashDisabled() &&
            !($gamePlayer && $gamePlayer.isInVehicle());
        return base + (canDash ? 1 : 0);
    }
    function roamSpeedCap() {
        return clampSpeed(playerTopSpeed() - 1.5);
    }
    function chaseSpeedCap() {
        return clampSpeed(playerTopSpeed() - 0.5);
    }

    // ------------------------------------------------------------------------
    // The state machine
    // ------------------------------------------------------------------------

    const AI_SCAN_INTERVAL = 8;    // frames between detection sweeps
    const AI_PACK_RANGE    = 8;    // tiles a pack member counts as "with me"
    const AI_ROUSE_FRAMES  = 240;  // how long a creature stays roused by a call
    const AI_RETURN_TIME   = 900;  // longest a creature spends walking home

    Game_Event.prototype.aiEnter = function(state, timer) {
        const was = this._aiState;
        this._aiState = state;
        this._aiTimer = Math.max(0, Math.min(99999, timer || 0));
        if (was === state) return;
        const beh = this._bseBeh;
        if (state === 'commit' && beh && beh.chaseSpeed && this._moveSpeed > 0) {
            this.setMoveSpeed(Math.min(
                clampSpeed((this._aiBaseSpeed || this._moveSpeed) + beh.chaseSpeed),
                chaseSpeedCap()));
        } else if (was === 'commit') {
            // A dive or a charge belongs to the run it was started on: leaving
            // the chase for any reason has to put the creature back on its feet.
            this._aiDashDir = 0;
            this._aiDashLeft = 0;
            if (this._aiBaseSpeed) this.setMoveSpeed(this._aiBaseSpeed);
        }
        if (!this.isNearTheScreen() || !$gameTemp) return;
        // The two moments the player has to be able to read: being noticed, and
        // being lost. Everything the AI does in between follows from them.
        if (state === 'alert') $gameTemp.requestBalloon(this, 1);
        else if (state === 'search' && was === 'commit') $gameTemp.requestBalloon(this, 2);
    };

    // Rouse this creature: a packmate's call, or a brawl next door. It commits
    // without needing to have seen anything itself.
    Game_Event.prototype.aiRouse = function(x, y) {
        this._aiRoused = AI_ROUSE_FRAMES;
        if (x !== undefined) this._aiLast = { x: x, y: y };
    };

    // Per-frame half: timers, and the throttled sweep that decides the state.
    // Lives on update() rather than on updateSelfMovement(), which the engine
    // only calls while a character stands still - a chase would otherwise stop
    // counting down the moment it started moving.
    Game_Event.prototype.updateEnemyAI = function() {
        if (!(this._fixedTroopId > 0)) return;
        if (this._aiTimer > 0) this._aiTimer--;
        if (this._aiRoused > 0) this._aiRoused--;
        this._aiScan = (this._aiScan || 0) + 1;
        if (this._aiScan < AI_SCAN_INTERVAL) return;
        this._aiScan = 0;
        if (!isLiveEnemyEvent(this) || !this.isNearTheScreen()) return;
        const beh = BSE.Helpers.getEventBehavior(this);
        if (!beh) return;
        if (!this._aiHome) this._aiHome = { x: this.x, y: this.y };
        this.scanEnemyAI(beh);
    };

    Game_Event.prototype.scanEnemyAI = function(beh) {
        // --- the party ------------------------------------------------------
        const target = nearestQuarry(this);
        let seen = false, dist = Infinity;
        if (target && beh.sight > 0) {
            const dx = target.x - this.x, dy = target.y - this.y;
            dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= beh.sight && inSightCone(this, target.x, target.y, beh.cone)) {
                seen = !beh.los || BSE.Helpers.hasLineOfSight(this.x, this.y, target.x, target.y);
            }
            // Walking into something is noticed whatever it was looking at: a
            // facing cone and a wall are no defence at arm's length.
            if (!seen && dist <= 1.5) seen = true;
        }
        this._aiTarget = target;
        this._aiSeen = seen;
        this._aiDist = dist;
        // A relentless thing does not need to see you once it has hold of you:
        // that is what makes a mimic a mimic. Everyone else only ever knows
        // where the party WAS, which is what leaves a corner to break away at.
        if (seen || (beh.relentless && target && this._aiState === 'commit')) {
            this._aiLast = { x: target.x, y: target.y };
        }

        // --- the neighbours (the food web, section 1a) ----------------------
        this.scanEcologyAI();

        // --- transitions ----------------------------------------------------
        const engaged = seen && beh.react && this.aiWillEngage(beh, dist);
        switch (this._aiState) {
            case 'alert':
                if (engaged || beh.relentless) {
                    if (this._aiTimer <= 0) this.aiEnter('commit', beh.memory);
                } else if (!seen) {
                    this.aiEnter('idle', 0);
                }
                break;
            case 'commit':
                if (engaged) this._aiTimer = beh.memory;
                // A creature with a post walks straight back to it the moment
                // the chase has carried it off its own ground - it does not
                // stand there casting about halfway across the map first.
                if (this.aiStrayedOffPost(beh)) this.aiEnter('return', AI_RETURN_TIME);
                else if (dist > beh.leash || this._aiTimer <= 0) this.aiEnter('search', 120);
                break;
            case 'search':
                if (this.aiStrayedOffPost(beh)) this.aiEnter('return', AI_RETURN_TIME);
                else if (engaged && dist <= beh.leash) this.aiEnter('commit', beh.memory);
                else if (this._aiTimer <= 0) this.aiEnter(beh.home ? 'return' : 'idle', AI_RETURN_TIME);
                break;
            case 'recover':
                if (this._aiTimer <= 0) this.aiEnter(beh.home ? 'return' : 'idle', AI_RETURN_TIME);
                break;
            case 'return':
                // Once it has turned for home it goes home. Re-engaging half
                // way leaves a sentry pacing back and forth on the end of its
                // leash for ever, barking at a party that has already left.
                // The timer is the way out for a post that has become
                // unreachable, so nothing walks into a wall for the rest of
                // the session trying to get back to it.
                if (aiHomeDist(this) <= 0 || this._aiTimer <= 0) this.aiEnter('idle', 0);
                break;
            default: // idle
                if (engaged) this.aiEnter('alert', beh.alert);
                else if (this._aiRoused > 0 && beh.react) this.aiEnter('commit', beh.memory);
                break;
        }
    };

    // Has the chase carried a posted creature off the ground it holds? The
    // guard's real leash is its door, not the distance to the party, and
    // without this a search that drifts outward re-acquires the party a tile
    // further out every time and walks the sentry off the end of the map.
    Game_Event.prototype.aiStrayedOffPost = function(beh) {
        if (!beh.home || !beh.homeRadius || !this._aiHome) return false;
        return aiHomeDist(this) > beh.homeRadius + 3;
    };

    // Some personalities pick their fights. A territorial creature only cares
    // while you are on its ground; a mimic only wakes for something in reach.
    Game_Event.prototype.aiWillEngage = function(beh, dist) {
        if (this.aiStrayedOffPost(beh)) return false;
        if (beh.territory && beh.homeRadius && this._aiTarget && this._aiHome) {
            const d = Math.abs(this._aiTarget.x - this._aiHome.x) +
                      Math.abs(this._aiTarget.y - this._aiHome.y);
            return d <= beh.homeRadius + 3;
        }
        return dist <= beh.sight + 0.5;
    };

    // ------------------------------------------------------------------------
    // Acting (called from updateSelfMovement, i.e. only while standing still)
    // ------------------------------------------------------------------------

    Game_Event.prototype.actEnemyAI = function(beh) {
        // Something bigger is coming. A creature that lives by running away
        // runs from it whatever else it was doing; a hunter shrugs it off.
        const preyMinded = !beh.react || beh.react === 'flee' || beh.react === 'coward';
        if (this._aiThreat && !beh.relentless &&
            (preyMinded || this._aiState !== 'commit')) {
            aiStepAway(this, this._aiThreat.x, this._aiThreat.y);
            this.resetStopCount();
            return true;
        }
        switch (this._aiState) {
            case 'alert':   return this.aiActAlert(beh);
            case 'commit':  return this.aiActCommit(beh);
            case 'search':  return this.aiActSearch(beh);
            case 'return':  return this.aiActReturn(beh);
            case 'recover': return true; // stand still and get its breath back
            default:        return this.aiActIdle(beh);
        }
    };

    // The telegraph: rooted to the spot, staring straight at the party.
    Game_Event.prototype.aiActAlert = function() {
        const t = this._aiTarget;
        if (t) this.turnTowardCharacter(t);
        this.resetStopCount();
        return true;
    };

    Game_Event.prototype.aiActCommit = function(beh) {
        const t = this._aiTarget;
        const known = this._aiLast;
        const seen = this._aiSeen && t;
        const tx = seen ? t.x : (known ? known.x : this.x);
        const ty = seen ? t.y : (known ? known.y : this.y);
        const dist = this._aiDist;
        this.resetStopCount();

        switch (beh.react) {
            case 'flee':
                aiStepAway(this, tx, ty);
                return true;

            case 'coward': {
                // Wants you gone, wants to know where you went.
                const band = beh.band || [5, 9];
                if (dist < band[0]) aiStepAway(this, tx, ty);
                else if (dist > band[1]) aiStepToward(this, tx, ty);
                else if (t) this.turnTowardCharacter(t);
                return true;
            }

            case 'stalk': {
                // Holds the gap. Closes only on a back, freezes on a face.
                const band = beh.band || [4, 7];
                if (dist > band[1]) aiStepToward(this, tx, ty);
                else if (dist < band[0]) aiStepAway(this, tx, ty);
                else if (seen && quarryFacesAway(this, t)) aiStepToward(this, tx, ty);
                else if (t) this.turnTowardCharacter(t);
                return true;
            }

            case 'circle': {
                // Round and round, in on the beat.
                const band = beh.band || [4, 5];
                if (this._aiOrbit === undefined) this._aiOrbit = Math.random() < 0.5;
                this._aiOrbitTick = (this._aiOrbitTick || 0) + 1;
                if (this._aiOrbitTick % 7 === 0) aiStepToward(this, tx, ty);
                else if (dist > band[1]) aiStepToward(this, tx, ty);
                else if (dist < band[0]) aiStepAway(this, tx, ty);
                else aiStepAround(this, tx, ty, this._aiOrbit);
                return true;
            }

            case 'pack': {
                // Alone it holds off and calls; with the pack it comes in.
                const mates = this.aiPackMatesNear();
                if (mates > 0 || dist <= 1.5) {
                    aiStepToward(this, tx, ty);
                } else {
                    const band = beh.band || [3, 6];
                    if (dist > band[1]) aiStepToward(this, tx, ty);
                    else if (dist < band[0]) aiStepAway(this, tx, ty);
                    else if (t) this.turnTowardCharacter(t);
                    this.aiCallPack();
                }
                return true;
            }

            case 'swoop': {
                // One straight dive, then back up to the perch. The dive reads
                // the gap tile by tile rather than off the last sweep: a bird
                // that only checked eight frames ago sails past the party and
                // keeps going to the edge of the map.
                if (!this._aiDashDir) {
                    this._aiDashDir = this.aiDashDirection(tx, ty);
                    this._aiDashLeft = Math.max(2, Math.round(dist) + 1);
                }
                const gapBefore = Math.abs(tx - this.x) + Math.abs(ty - this.y);
                this.moveStraight(this._aiDashDir);
                const gapAfter = Math.abs(tx - this.x) + Math.abs(ty - this.y);
                if (!this.isMovementSucceeded() || gapAfter <= 1 ||
                    gapAfter >= gapBefore || --this._aiDashLeft <= 0) {
                    this._aiDashDir = 0;
                    this.aiEnter('recover', 45);
                }
                return true;
            }

            case 'charge': {
                // Lines itself up, then runs the whole row at you - and a few
                // tiles past, which is the whole point: a charge is something
                // to be sidestepped, and something to be baited into a wall.
                if (this._aiDashDir) {
                    this.moveStraight(this._aiDashDir);
                    if (!this.isMovementSucceeded() || --this._aiDashLeft <= 0) {
                        this._aiDashDir = 0;
                        this.aiEnter('recover', 60);
                    }
                    return true;
                }
                const dx = tx - this.x, dy = ty - this.y;
                if (dx === 0 || dy === 0) {
                    this._aiDashDir = this.aiDashDirection(tx, ty);
                    this._aiDashLeft = Math.abs(dx) + Math.abs(dy) + 3;
                    return true;
                }
                // Not aligned yet: close the smaller gap first, which is what
                // walks it onto the quarry's own row or column.
                if (Math.abs(dx) < Math.abs(dy)) this.moveStraight(dx > 0 ? 6 : 4);
                else this.moveStraight(dy > 0 ? 2 : 8);
                if (!this.isMovementSucceeded()) aiStepToward(this, tx, ty);
                return true;
            }

            case 'ambush':
            case 'track':
            case 'chase':
            default:
                aiStepToward(this, tx, ty);
                return true;
        }
    };

    // The straight line a dive or a charge runs along.
    Game_Event.prototype.aiDashDirection = function(tx, ty) {
        const dx = tx - this.x, dy = ty - this.y;
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 6 : 4;
        return dy >= 0 ? 2 : 8;
    };

    // Same-species company within earshot.
    Game_Event.prototype.aiPackMatesNear = function() {
        const troop = $dataTroops[this._fixedTroopId];
        if (!troop || !troop.members.length) return 0;
        const mine = troop.members[0].enemyId;
        let n = 0;
        for (const ev of $gameMap.events()) {
            if (ev === this || !isLiveEnemyEvent(ev)) continue;
            const t = $dataTroops[ev._fixedTroopId];
            if (!t || !t.members.length || t.members[0].enemyId !== mine) continue;
            if (Math.abs(ev.x - this.x) + Math.abs(ev.y - this.y) <= AI_PACK_RANGE) n++;
        }
        return n;
    };

    // A call brings the rest of the pack to where the caller is looking.
    Game_Event.prototype.aiCallPack = function() {
        if (this._aiCalled > 0) { this._aiCalled--; return; }
        this._aiCalled = 90;
        const troop = $dataTroops[this._fixedTroopId];
        if (!troop || !troop.members.length) return;
        const mine = troop.members[0].enemyId;
        const spot = this._aiLast;
        if (this.isNearTheScreen() && $gameTemp) $gameTemp.requestBalloon(this, 1);
        for (const ev of $gameMap.events()) {
            if (ev === this || !isLiveEnemyEvent(ev)) continue;
            const t = $dataTroops[ev._fixedTroopId];
            if (!t || !t.members.length || t.members[0].enemyId !== mine) continue;
            if (Math.abs(ev.x - this.x) + Math.abs(ev.y - this.y) > AI_PACK_RANGE) continue;
            ev.aiRouse(spot ? spot.x : this.x, spot ? spot.y : this.y);
        }
    };

    // Casting about where the party was last seen.
    Game_Event.prototype.aiActSearch = function() {
        const known = this._aiLast;
        this.resetStopCount();
        if (known && (Math.abs(this.x - known.x) + Math.abs(this.y - known.y)) > 0) {
            aiStepToward(this, known.x, known.y);
        } else if (this.checkStop(20)) {
            this.moveRandom();
        }
        return true;
    };

    // Back to the post / the perch / the den.
    Game_Event.prototype.aiActReturn = function() {
        const home = this._aiHome;
        this.resetStopCount();
        if (home && aiHomeDist(this) > 0) aiStepToward(this, home.x, home.y);
        return true;
    };

    Game_Event.prototype.aiActIdle = function(beh) {
        // Nothing to do about the party: go and eat something instead.
        if (this._aiPrey) {
            aiStepToward(this, this._aiPrey.x, this._aiPrey.y);
            this.resetStopCount();
            return true;
        }
        const threshold = this.stopCountThreshold();
        switch (beh.idle) {
            case 'still':
                return true;

            case 'perch':
                // Sits and looks about, so the swoop is never quite expected.
                if (this.checkStop(threshold * 2)) {
                    this.setDirection([2, 4, 6, 8][Math.floor(Math.random() * 4)]);
                    this.resetStopCount();
                }
                return true;

            case 'scan':
                // A post is only as good as the sweep: turn a quarter and wait.
                if (this.checkStop(90)) {
                    this.turnRight90();
                    this.resetStopCount();
                }
                return true;

            case 'graze':
                // Head down for a long while, then a step, then head down.
                if (!this.checkStop(threshold + 90)) return true;
                this.moveRandom();
                this.resetStopCount();
                return true;

            case 'dart':
                // Two or three tiles at once, then nothing at all.
                if (!this.checkStop(24)) return true;
                this.moveRandom();
                if (this.isMovementSucceeded() && Math.random() < 0.5) {
                    this.moveStraight(this.direction());
                }
                this.resetStopCount();
                return true;

            case 'drift': {
                // Carried along, and only rarely by something new.
                if (!this.checkStop(threshold)) return true;
                if (!this._aiDriftDir || Math.random() < 0.08) {
                    this._aiDriftDir = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
                }
                this.moveStraight(this._aiDriftDir);
                if (!this.isMovementSucceeded()) this._aiDriftDir = 0;
                this.resetStopCount();
                return true;
            }

            case 'patrol': {
                // Up and down the beat, turning at the ends of it.
                if (!this.checkStop(threshold)) return true;
                if (!this._aiPatrolDir) {
                    this._aiPatrolDir = [2, 4, 6, 8][Math.floor(Math.random() * 4)];
                }
                const reach = beh.homeRadius || 10;
                if (aiHomeDist(this) >= reach) {
                    this._aiPatrolDir = this.reverseDir(this._aiPatrolDir);
                }
                this.moveStraight(this._aiPatrolDir);
                if (!this.isMovementSucceeded()) {
                    this._aiPatrolDir = this.reverseDir(this._aiPatrolDir);
                }
                this.resetStopCount();
                return true;
            }

            case 'territory': {
                // Wanders its patch and never walks off the edge of it.
                if (!this.checkStop(threshold)) return true;
                const radius = beh.homeRadius || 7;
                if (this._aiHome && aiHomeDist(this) > radius) {
                    aiStepToward(this, this._aiHome.x, this._aiHome.y);
                } else {
                    this.moveRandom();
                }
                this.resetStopCount();
                return true;
            }

            case 'scavenge': {
                // Follows its nose to the nearest body.
                if (!this.checkStop(threshold)) return true;
                const corpse = this.aiNearestCorpse(10);
                if (corpse) aiStepToward(this, corpse.x, corpse.y);
                else this.moveRandom();
                this.resetStopCount();
                return true;
            }

            case 'wander':
            default:
                // The engine's own random walk is exactly this, so let it run.
                return false;
        }
    };

    Game_Event.prototype.aiNearestCorpse = function(range) {
        const corpses = BSE.State.mapCorpses;
        if (!corpses || !corpses.length) return null;
        const mapId = $gameMap.mapId();
        let best = null, bestD = range;
        for (const c of corpses) {
            if (c.mapId !== mapId) continue;
            const d = Math.abs(c.x - this.x) + Math.abs(c.y - this.y);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    };

    // ========================================================================
    // 7. Game_Event - Archetype checks
    // ========================================================================

    Game_Event.prototype.isAquaticEnemy = function() {
        if (this._isAquaticEnemy !== undefined && this._isAquaticEnemy !== false) return this._isAquaticEnemy === true;
        if (!this._fixedTroopId || this._fixedTroopId <= 0) { this._isAquaticEnemy = false; return false; }
        const troop = $dataTroops[this._fixedTroopId];
        if (!troop || !troop.members.length) { this._isAquaticEnemy = false; return false; }
        const enemyData = $dataEnemies[troop.members[0].enemyId];
        if (!enemyData) { this._isAquaticEnemy = false; return false; }
        const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
        this._isAquaticEnemy = BSE.Helpers.getAquaticArchetype(archetype);
        return this._isAquaticEnemy;
    };

    Game_Event.prototype.isAmphibiousEnemy = function() {
        if (this._isAmphibiousEnemy !== undefined && this._isAmphibiousEnemy !== false) return this._isAmphibiousEnemy === true;
        if (!this._fixedTroopId || this._fixedTroopId <= 0) { this._isAmphibiousEnemy = false; return false; }
        const troop = $dataTroops[this._fixedTroopId];
        if (!troop || !troop.members.length) { this._isAmphibiousEnemy = false; return false; }
        const enemyData = $dataEnemies[troop.members[0].enemyId];
        if (!enemyData) { this._isAmphibiousEnemy = false; return false; }
        const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
        this._isAmphibiousEnemy = BSE.Helpers.getAmphibiousArchetype(archetype);
        return this._isAmphibiousEnemy;
    };

    // ========================================================================
    // 8. Game_Event - canPass override
    // ========================================================================

    const _Game_Event_canPass = Game_Event.prototype.canPass;
    Game_Event.prototype.canPass = function(x, y, d) {
        if (BSE.Helpers.isMonsterEvent(this) && this._fixedTroopId > 0) {
            // Road biomes: never step onto the carriageway or its dashed center
            // lines. An enemy that somehow starts on a road tile is still free to
            // move (otherwise it would be frozen there for good).
            if (!BSE.Helpers.isRoadFeatureTile(x, y)) {
                const rx = $gameMap.roundXWithDirection(x, d);
                const ry = $gameMap.roundYWithDirection(y, d);
                if (BSE.Helpers.isRoadFeatureTile(rx, ry)) return false;
            }
            const troop = $dataTroops[this._fixedTroopId];
            if (troop && troop.members.length > 0) {
                const firstMember = troop.members[0];
                const enemyData = $dataEnemies[firstMember.enemyId];
                if (enemyData) {
                    const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
                    const destRegionId = $gameMap.regionId(x, y);

                    // Flying enemies ignore all terrain restrictions
                    if (BSE.Helpers.getFlyingArchetype(archetype)) {
                        return !$gameMap.events().some(ev => ev !== this && ev.x === x && ev.y === y && !ev.isThrough());
                    }

                    const isAquatic = BSE.Helpers.getAquaticArchetype(archetype);
                    const isAmphibious = BSE.Helpers.getAmphibiousArchetype(archetype);

                    if (isAquatic) {
                        // The same water test the creature was PLACED by: read on
                        // region 99 alone, a fish standing in the procedural
                        // sea (which region 99 largely misses, see
                        // isWaterSpawnTile) would be unable to move at all.
                        const srcIsWater = BSE.Helpers.isWaterSpawnTile(x, y);
                        if (!srcIsWater) return false;
                        const x2 = $gameMap.roundXWithDirection(x, d);
                        const y2 = $gameMap.roundYWithDirection(y, d);
                        if (!$gameMap.isValid(x2, y2)) return false;
                        const destIsWater = BSE.Helpers.isWaterSpawnTile(x2, y2);
                        if (!destIsWater) return false;
                        return !$gameMap.events().some(ev => ev !== this && ev.x === x2 && ev.y === y2 && !ev.isThrough());
                    }

                    const srcIsWater = BSE.Helpers.isWaterSpawnTile(x, y);
                    if (srcIsWater) {
                        if (!isAmphibious) return false;
                        const x2 = $gameMap.roundXWithDirection(x, d);
                        const y2 = $gameMap.roundYWithDirection(y, d);
                        if (!$gameMap.isValid(x2, y2)) return false;
                        return !$gameMap.events().some(ev => ev !== this && ev.x === x2 && ev.y === y2 && !ev.isThrough());
                    }

                    if (destRegionId === 7) return false;
                    const hasClimbTag = BSE.Helpers.enemyHasClimb(enemyData);
                    if (!hasClimbTag && destRegionId === 4) return false;
                }
            }
        }
        window._currentlyCheckingCharacter = this;
        const result = _Game_Event_canPass.call(this, x, y, d);
        window._currentlyCheckingCharacter = null;
        return result;
    };

    // ========================================================================
    // 9. Game_Event - realMoveSpeed override
    // ========================================================================

    const _Game_Event_realMoveSpeed = Game_Event.prototype.realMoveSpeed;
    Game_Event.prototype.realMoveSpeed = function() {
        let speed = _Game_Event_realMoveSpeed.call(this);
        if (BSE.Helpers.isMonsterEvent(this) && this._fixedTroopId > 0) {
            const troop = $dataTroops[this._fixedTroopId];
            if (troop && troop.members.length > 0) {
                const enemyData = $dataEnemies[troop.members[0].enemyId];
                if (enemyData) {
                    const archetype = BSE.Helpers.getEnemyArchetype(enemyData);
                    const currentIsWater = BSE.Helpers.isWaterSpawnTile(this.x, this.y);
                    const regionId = $gameMap.regionId(this.x, this.y);
                    if (BSE.Helpers.getFlyingArchetype(archetype)) return speed;
                    if (BSE.Helpers.getAquaticArchetype(archetype)) return speed;
                    if (BSE.Helpers.getAmphibiousArchetype(archetype)) {
                        return currentIsWater ? speed * 1.5 : speed * 0.67;
                    }
                    const hasClimbTag = BSE.Helpers.enemyHasClimb(enemyData);
                    if (hasClimbTag && regionId === 4) return speed * 0.33;
                    if (currentIsWater) return speed * 0.5;
                }
            }
        }
        return speed;
    };

    // ========================================================================
    // 10. Game_Event - updateCharacterSprite
    // ========================================================================

    Game_Event.prototype.updateCharacterSprite = function() {
        if (this._fixedTroopId && this._fixedTroopId > 0) {
            const troop = $dataTroops[this._fixedTroopId];
            if (!troop) return;
            const member = troop.members[0];
            const enemyId = member ? member.enemyId : null;
            if (!enemyId) return;
            const spriteData = BSE.Data._enemyCharSprites;
            if (spriteData[enemyId]) {
                this.setImage("Monsters/" + spriteData[enemyId], this._characterIndex);
                const hue = ($dataEnemies[enemyId] && $dataEnemies[enemyId].battlerHue) || 0;
                this._characterHue = hue;
            }
        }
    };

    // ========================================================================
    // 11. Game_Player & Game_Event - checkEventTriggerTouch
    // ========================================================================

    // Only a monster is held back while a menu or a conversation is open: this
    // is the one hook every touch-triggered event on the map goes through
    // (a door, a transfer, a shop counter), so blocking it wholesale would
    // close the map down rather than just hold off the fight.
    const _tileHoldsEnemyEvent = function(x, y) {
        return $gameMap.eventsXy(x, y).some(ev =>
            ev && !ev._erased &&
            (ev._fixedTroopId > 0 || (ev.event() && ev.event().name === "Enemy")));
    };

    const _Game_Player_checkTriggerTouch = Game_Player.prototype.checkEventTriggerTouch;
    Game_Player.prototype.checkEventTriggerTouch = function(x, y) {
        if (_tileHoldsEnemyEvent(x, y) &&
            BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) {
            return false;
        }
        if (this.isInVehicle()) {
            const events = $gameMap.eventsXy(x, y);
            for (const event of events) {
                if (event._fixedTroopId > 0 && !event._erased) {
                    if (!event.isJumping()) { event.performVehicleHit(); return true; }
                }
            }
        }
        return _Game_Player_checkTriggerTouch.call(this, x, y);
    };

    const _Game_Event_checkTriggerTouch = Game_Event.prototype.checkEventTriggerTouch;
    Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
        if (this._fixedTroopId > 0 || (this.event() && this.event().name === "Enemy")) {
            if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) {
                return;
            }
            // A monster that walks into a moving vehicle is knocked clear of it,
            // not fought. The other half of this - the vehicle driving into the
            // monster - is handled in checkEventTriggerTouch above; this is the
            // same collision from the other side, and it has to answer the same
            // way or which of the two happened to move that frame decides
            // whether the party ends up in a battle.
            if (this._fixedTroopId > 0 && !this._erased && !this.isJumping() &&
                $gamePlayer.isInVehicle() && $gamePlayer.pos(x, y)) {
                this.performVehicleHit();
                return;
            }
        }
        _Game_Event_checkTriggerTouch.call(this, x, y);
    };

    // Something ran into something. The creature is thrown clear and goes on
    // living, and the bodywork pays for it: a monster is not a hedge, and a
    // party that can drive through the wildlife for nothing would never get out
    // of the camper again.
    Game_Event.prototype.performVehicleHit = function() {
        const playerDir = $gamePlayer.direction();
        let jx = 0, jy = 0;
        const jumpPower = 3;
        const sway = Math.random() < 0.5 ? 1 : -1;
        switch (playerDir) {
            case 2: jy = jumpPower; jx = sway; break;
            case 4: jx = -jumpPower; jy = sway; break;
            case 6: jx = jumpPower; jy = sway; break;
            case 8: jy = -jumpPower; jx = sway; break;
        }
        this.jump(jx, jy);
        this.lockMovement(90);
        damageVehicleOnImpact(this);
    };

    // What the knock costs. The front of the vehicle takes it - the bodywork,
    // the lights, whatever is behind the bumper - scaled by how big the thing
    // that was hit is, so brushing something small is a scratch and putting the
    // camper into something at the top of the food chain is a repair bill.
    // Nothing at all for a broom or a bicycle, which have no bodywork to dent.
    const VEHICLE_HIT_PARTS = ["Body", "Suspension", "Radiator", "Tires", "Steering"];
    function damageVehicleOnImpact(event) {
        const MVS = window.MergedVehicleSystem;
        const VSR = window.VehicleSystemRepair;
        if (!MVS || !MVS.riddenVehicleKey || !VSR || !VSR.applyDamage) return;
        const key = MVS.riddenVehicleKey();
        if (!key || key === 'broom') return;
        const lvl = Math.max(1, (BSE.Helpers.getTroopMaxLevel &&
                                 BSE.Helpers.getTroopMaxLevel(event._fixedTroopId)) || 1);
        const hurt = 2 + Math.min(10, lvl / 8) + Math.random() * 3;
        let hit = [];
        try {
            hit = VSR.applyDamage(key, hurt, { parts: VEHICLE_HIT_PARTS, count: 1 }) || [];
        } catch (e) { /* no maintenance record for this one */ }
        if (window.ParchmentToast && window.ParchmentToast.show) {
            const part = hit.length && window.VehicleParts
                ? window.VehicleParts.label(hit[0]) : '';
            window.ParchmentToast.show(
                part ? T('Battle.vehicleHitMonster', { part })
                     : T('Battle.vehicleHitMonsterPlain'),
                { severity: 'warning' });
        }
        if (window.VehicleCrew && window.VehicleCrew.wake) window.VehicleCrew.wake('crash');
    }

    // ========================================================================
    // 12. Game_Map - setupEvents
    // ========================================================================

    const _Game_Map_setupEvents = Game_Map.prototype.setupEvents;
    Game_Map.prototype.setupEvents = function() {
        _Game_Map_setupEvents.call(this);
        this.events().forEach(event => {
            if (event.event().name !== "Enemy") {
                event.selectFixedTroopIdFromNote();
                event.updateCharacterSprite();
            }
        });
        // Resprite persistent enemies flagged on save/load (see section 15).
        this.events().forEach(event => {
            const persistentId = `${this._mapId}_${event._eventId}`;
            const pData = BSE.State.persistentEnemyData[persistentId];
            if (pData && pData.needsResprite) {
                event._fixedTroopId = pData.troopId;
                event.updateCharacterSprite();
                pData.needsResprite = false;
            }
        });
    };

    // ========================================================================
    // 13. Movement Lock
    // ========================================================================

    Game_Event.prototype.lockMovement = function(duration) {
        this._movementLocked = true;
        this._movementLockTimer = duration || 60;
    };

    const _Game_Event_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function() {
        if (this._movementLocked) return;
        if (this.updateEnemyAIMovement()) return;
        _Game_Event_updateSelfMovement.call(this);
    };

    // The acting half of section 6b: called only while the creature is standing
    // still, and only for a live roaming monster. Returns true when the
    // personality took the frame, so the engine's own move type never runs on
    // top of it. `wander` deliberately returns false: the engine's random walk
    // IS that idle, so there is no reason to write it twice.
    Game_Event.prototype.updateEnemyAIMovement = function() {
        if (!(this._fixedTroopId > 0)) return false;
        if (!isLiveEnemyEvent(this) || !this.isNearTheScreen()) return false;
        // A stunned monster is held in place by having its speed taken away
        // (Hotkeys.js). Take the frame and do nothing with it, so a personality
        // never walks a creature out of a stun the player has just landed.
        if (!(this._moveSpeed > 0)) return true;
        const beh = BSE.Helpers.getEventBehavior(this);
        if (!beh) return false;
        if (!this._aiHome) this._aiHome = { x: this.x, y: this.y };
        return this.actEnemyAI(beh);
    };

    // The food web (section 1a), read as two facts about the neighbourhood:
    // the nearest creature I hunt, and the nearest one that hunts me. The
    // personality decides what to do with them - prey drops everything and
    // runs, a hunter ignores the whole question, everyone else goes hunting
    // only when the party has given it nothing better to do.
    Game_Event.prototype.scanEcologyAI = function() {
        this._aiPrey = null;
        this._aiThreat = null;
        const myEco = BSE.Helpers.getEventEcology(this);
        if (!myEco) return;

        const range = BSE.Data.ECOLOGY_AWARENESS;
        let preyDist = Infinity, threatDist = Infinity;
        for (const ev of $gameMap.events()) {
            if (ev === this || !isLiveEnemyEvent(ev)) continue;
            const dist = Math.abs(ev.x - this.x) + Math.abs(ev.y - this.y);
            if (dist > range) continue;
            const otherEco = BSE.Helpers.getEventEcology(ev);
            if (BSE.Helpers.ecologyChases(myEco, otherEco)) {
                if (dist < preyDist) { this._aiPrey = ev; preyDist = dist; }
            } else if (BSE.Helpers.ecologyChases(otherEco, myEco)) {
                // only flee what I don't hunt back (pure prey/neutral reaction)
                if (dist < threatDist) { this._aiThreat = ev; threatDist = dist; }
            }
        }
    };

    // Kept as the name the rest of the codebase knows this behaviour by.
    Game_Event.prototype.updateEcologyMovement = function() {
        return this.updateEnemyAIMovement();
    };

    Game_Event.prototype.updateMovementLock = function() {
        if (this._movementLocked && this._movementLockTimer > 0) {
            this._movementLockTimer--;
            if (this._movementLockTimer <= 0) this._movementLocked = false;
        }
    };

    // Cached trimmed split-screen P2 name, refreshed only when the raw value changes.
    let _p2EventNameRaw = undefined;
    let _p2EventNameTrimmed = "Player 2";

    const _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_update.call(this);
        this.updateMovementLock();
        this.updateEnemyAI();
        if (window.$gameSplitScreen && window.$gameSplitScreen.active) {
            if (window.$gameSplitScreen.p2EventName !== _p2EventNameRaw) {
                _p2EventNameRaw = window.$gameSplitScreen.p2EventName;
                _p2EventNameTrimmed = (_p2EventNameRaw || "Player 2").trim();
            }
            if (this._trimmedEventName === undefined) {
                this._trimmedEventName = (this.event().name || "").trim();
            }
            const myName = this._trimmedEventName;
            if (myName === _p2EventNameTrimmed) this.updateP2EncounterCheck();
            else if (myName === "Enemy" && this._fixedTroopId > 0) this.updateEnemyTouchP2Check();
        }
    };

    Game_Event.prototype.updateP2EncounterCheck = function() {
        if ($gameSystem.getBattleCooldown() > 0) return;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return;
        if ($gameMap.isEventRunning() || SceneManager.isSceneChanging()) return;
        const x = this.x, y = this.y, d = this.direction();
        const x2 = $gameMap.roundXWithDirection(x, d);
        const y2 = $gameMap.roundYWithDirection(y, d);
        const targets = [...$gameMap.eventsXy(x, y), ...$gameMap.eventsXy(x2, y2)];
        for (const target of targets) {
            if (target !== this && (target.event().name || "").trim() === "Enemy" && target._fixedTroopId > 0) {
                const persistentId = `${$gameMap.mapId()}_${target.eventId()}`;
                window._battleActivatorOverride = "p2";
                BSE.Functions.startPersistentBattle(target._fixedTroopId, persistentId, target.eventId(), $gameMap.mapId());
                break;
            }
        }
    };

    Game_Event.prototype.updateEnemyTouchP2Check = function() {
        if ($gameSystem.getBattleCooldown() > 0) return;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return;
        if ($gameMap.isEventRunning() || SceneManager.isSceneChanging()) return;
        const p2 = window.$gameSplitScreen.p2Event;
        if (!p2) return;
        if (this.x === p2.x && this.y === p2.y) {
            const persistentId = `${$gameMap.mapId()}_${this.eventId()}`;
            window._battleActivatorOverride = "p2";
            BSE.Functions.startPersistentBattle(this._fixedTroopId, persistentId, this.eventId(), $gameMap.mapId());
        }
    };

    // ========================================================================
    // 14. Enemy vs Enemy Combat
    // ========================================================================

    const _Scene_Map_update_BSE = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update_BSE.call(this);
        // Map Battle Mode (MapBattleMode.js) freezes world time: the map only
        // moves at the world step between rounds. Wildlife still roams (in that
        // step-time), but resolving their brawls on real frames would let a
        // minute of the player reading menus wipe out the local ecosystem.
        if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
        if (this.isActive()) this.updateEnemyVsEnemyCombat();
    };

    const ECO_FIGHT_INTERVAL = 60;
    // The pairing scan below is O(n^2) over all live enemy events. A new fight
    // starting a few frames late is imperceptible, so only run the scan
    // periodically instead of every frame; fight resolution still ticks each frame.
    const ECO_PAIR_SCAN_INTERVAL = 20;

    function lvOf(event) {
        return (window.getEnemyLevelFromEvent ? window.getEnemyLevelFromEvent(event) : 1) || 1;
    }

    Scene_Map.prototype.updateEnemyVsEnemyCombat = function() {
        if (!$gameSystem._enemyFights) $gameSystem._enemyFights = {};
        const fights = $gameSystem._enemyFights;

        // 1. Pair up touching / adjacent enemies that have a reason to fight.
        //    Throttled: the O(n^2) scan + event filter only runs every
        //    ECO_PAIR_SCAN_INTERVAL frames.
        this._bseEcoPairTick = (this._bseEcoPairTick || 0) + 1;
        if (this._bseEcoPairTick >= ECO_PAIR_SCAN_INTERVAL) {
            this._bseEcoPairTick = 0;
            const enemies = $gameMap.events().filter(isLiveEnemyEvent);
            for (let i = 0; i < enemies.length; i++) {
                for (let j = i + 1; j < enemies.length; j++) {
                    const a = enemies[i], b = enemies[j];
                    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
                    if (Math.max(dx, dy) > 1) continue; // not touching or adjacent

                    const ecoA = BSE.Helpers.getEventEcology(a);
                    const ecoB = BSE.Helpers.getEventEcology(b);
                    const ecoRel = BSE.Helpers.ecologyChases(ecoA, ecoB) ||
                                   BSE.Helpers.ecologyChases(ecoB, ecoA);
                    // keep legacy behaviour: differing archetypes brawl when overlapping
                    const archA = BSE.Helpers.getEventArchetype(a);
                    const archB = BSE.Helpers.getEventArchetype(b);
                    const sameTileDiffArch = dx === 0 && dy === 0 && archA && archB && archA !== archB;
                    if (!ecoRel && !sameTileDiffArch) continue;

                    const key = a.eventId() < b.eventId()
                        ? `${a.eventId()}_${b.eventId()}`
                        : `${b.eventId()}_${a.eventId()}`;
                    if (!fights[key]) {
                        if (a.enemyHp === undefined) a.enemyHp = a.getMaxHpForEvent();
                        if (b.enemyHp === undefined) b.enemyHp = b.getMaxHpForEvent();
                        fights[key] = { fighters: [a.eventId(), b.eventId()], timer: ECO_FIGHT_INTERVAL };
                    }
                }
            }
        }

        // 2. Resolve ongoing fights (HP attrition, biased by level + ecology)
        for (const key in fights) {
            const fight = fights[key];
            if (--fight.timer > 0) continue;
            fight.timer = ECO_FIGHT_INTERVAL;

            const e1 = $gameMap.event(fight.fighters[0]);
            const e2 = $gameMap.event(fight.fighters[1]);
            if (!isLiveEnemyEvent(e1) || !isLiveEnemyEvent(e2) ||
                Math.max(Math.abs(e1.x - e2.x), Math.abs(e1.y - e2.y)) > 1) {
                delete fights[key];
                continue;
            }

            const lv1 = lvOf(e1), lv2 = lvOf(e2);
            const eco1 = BSE.Helpers.getEventEcology(e1);
            const eco2 = BSE.Helpers.getEventEcology(e2);

            // attacker weight = level, tripled when ecologically dominant
            let w1 = lv1, w2 = lv2;
            if (BSE.Helpers.ecologyDominates(eco1, eco2)) w1 *= 3;
            if (BSE.Helpers.ecologyDominates(eco2, eco1)) w2 *= 3;

            let attacker, defender, atkLv;
            if (Math.random() < w1 / (w1 + w2)) { attacker = e1; defender = e2; atkLv = lv1; }
            else { attacker = e2; defender = e1; atkLv = lv2; }

            const damage = 5 + Math.floor(atkLv / 2) + Math.floor(Math.random() * 6);
            if (defender.enemyHp === undefined) defender.enemyHp = defender.getMaxHpForEvent();
            defender.enemyHp -= damage;
            BSE.Functions.recordMapEnemyDamage(defender, damage);

            const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
            if (spriteset && spriteset._characterSprites) {
                const ds = spriteset._characterSprites.find(s => s._character === defender);
                if (ds) { ds.setBlendColor([255, 64, 64, 160]); ds._flashDuration = 12; }
            }

            if (defender.enemyHp <= 0) {
                BSE.Functions.killEnemyEventLeaveCorpse(defender, atkLv);
                delete fights[key];
            }
        }
    };

    // ------------------------------------------------------------------------
    // A creature standing on the map keeps TWO HP tracks and anything that hurts
    // it out here has to move both: `ev.enemyHp` is the single pool the ecology
    // fights over (it is what kills it out on the map), and the persistent record
    // is the per-member ledger its next BATTLE restores from. Only the car ram
    // (RoadCarAI.ramMapEnemy) ever wrote the second one, so a monster mauled
    // half to death by a rival was still met at full strength.
    //
    // The blow is spread over the troop as a share of the event's HP pool, the
    // same way the ram spreads its own, since the map only ever tracks one pool
    // for what may be a multi-member troop.
    // ------------------------------------------------------------------------
    BSE.Functions.recordMapEnemyDamage = function(ev, damage) {
        const troopId = ev && ev._fixedTroopId;
        if (!troopId || !$dataTroops[troopId] || !(damage > 0)) return;
        const max = (ev.getMaxHpForEvent && ev.getMaxHpForEvent()) || 100;
        const share = Math.min(1, damage / Math.max(1, max));
        const pData = BSE.State.persistentEnemyData;
        const key = `${$gameMap.mapId()}_${ev.eventId()}`;
        const record = pData[key] || (pData[key] = { troopId: troopId, enemyHp: {} });
        record.troopId = troopId;
        if (!record.enemyHp) record.enemyHp = {};
        // Match the scale the battle will build the enemy at: the difficulty
        // option is applied at paramBase, so a stored figure read off the raw
        // database row would be a wound of the wrong size on either setting.
        const mult = (window.GameOptions && window.GameOptions.enemyStatMultiplier)
            ? window.GameOptions.enemyStatMultiplier() : 1;
        $dataTroops[troopId].members.forEach((member, index) => {
            const data = $dataEnemies[member.enemyId];
            if (!data) return;
            const memberMax = Math.max(1, Math.round((data.params[0] || 1) * mult));
            const current = record.enemyHp[index] != null ? record.enemyHp[index] : memberMax;
            record.enemyHp[index] = Math.max(1, Math.round(current - memberMax * share));
        });
    };

    // ------------------------------------------------------------------------
    // Kill a map enemy event and leave a harvestable corpse, possibly with
    // body parts torn off / destroyed depending on the killer's level and RNG.
    // ------------------------------------------------------------------------
    BSE.Functions.killEnemyEventLeaveCorpse = function(ev, killerLevel) {
        if (!ev || ev._erased) return;
        const troop = ev._fixedTroopId ? $dataTroops[ev._fixedTroopId] : null;
        const enemyId = (troop && troop.members.length) ? troop.members[0].enemyId : 0;
        const enemyData = enemyId ? $dataEnemies[enemyId] : null;

        applyMapDeathPartDamage(enemyId, enemyData, killerLevel);

        const corpse = {
            mapId: $gameMap.mapId(),
            x: ev.x,
            y: ev.y,
            spriteName: ev._characterName,
            spriteIndex: ev._characterIndex,
            hue: ev._characterHue || 0,
            bloodColor: BSE.Helpers.getCorpseBloodColor
                ? BSE.Helpers.getCorpseBloodColor(enemyData)
                : [200, 20, 20],
            enemyId: enemyId
        };
        if (BSE.State.mapCorpses) BSE.State.mapCorpses.push(corpse);

        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        if (spriteset && spriteset.addCorpseSprite) spriteset.addCorpseSprite(corpse);

        ev.enemyHp = 0;
        // Nothing left for a battle to restore from, and the slot may be re-used
        // by the next spawn pass - leaving the ledger behind would hand its
        // successor a dead creature's wounds.
        delete BSE.State.persistentEnemyData[`${$gameMap.mapId()}_${ev.eventId()}`];
        $gameMap.eraseEvent(ev.eventId());
    };

    function applyMapDeathPartDamage(enemyId, enemyData, killerLevel) {
        if (!enemyId || !enemyData || !BSE.State.enemyPartDamage) return;
        const archetypeName = BSE.Helpers.getEnemyArchetype(enemyData);
        const archetypes = window.Health && window.Health.Archetypes;
        const archetype = archetypeName && archetypes ? archetypes[archetypeName] : null;
        if (!archetype || !archetype.parts) return;

        const victimLevel = BSE.Helpers.getEnemyLevel(enemyData.note) || 1;
        const mhp = (enemyData.params && enemyData.params[0]) ? enemyData.params[0] : 100;

        // chance per part to be missing/destroyed: always some, more when outmatched
        let brutality = 0.25 + (killerLevel - victimLevel) / 25;
        brutality = Math.max(0.1, Math.min(0.8, brutality));

        const parts = {};
        for (const key in archetype.parts) {
            const basePart = archetype.parts[key];
            const maxHp = Math.max(1, Math.round(mhp * (basePart.hpPercent || 100) / 100));
            const destroyed = Math.random() < brutality;
            parts[key] = {
                currentHp: destroyed ? 0 : maxHp,
                maxHp: maxHp,
                destroyed: destroyed,
                appliedStatEffect: destroyed
            };
        }
        BSE.State.enemyPartDamage[enemyId] = {
            parts: parts,
            statModifiers: {},
            disabledActions: [],
            archetypeName: archetypeName,
            def: (enemyData.params && enemyData.params[3]) ? enemyData.params[3] : 0
        };
    }

    // ========================================================================
    // 15. Game_Map.setupEvents - resprited on load
    // ========================================================================
    // Persistent-enemy resprite is handled in the section 12 setupEvents alias
    // above to avoid aliasing Game_Map.setupEvents twice in this file.

    // ========================================================================
    // 16. Alien planet life gating (GalaxySim)
    // ------------------------------------------------------------------------
    // A landed alien planet (proc map 636 from an "Alien*" biome) either hosts
    // life -> spawn its own species, or is barren -> no enemies at all. The life
    // flag is decided at landing (GalaxySim.currentAlienHasLife).
    //
    // A living world's creatures are drawn from around the WORLD'S level
    // (GalaxySim.planetLevel), not the party's and not the tower's: the species
    // roster is already built out of base enemies near that level, so the list
    // below needs no band of its own, and the biosignature tier the scan shows
    // (Weak / Strong / Hyper) is a promise about exactly these creatures.
    // ========================================================================
    function alienSurfaceState() {
        const GS = window.GalaxySim;
        if (!GS || typeof GS.isAlienSurface !== 'function' || !GS.isAlienSurface()) return null;
        return { hasLife: !!(GS.currentAlienHasLife && GS.currentAlienHasLife()) };
    }

    // The level an alien world spawns at: the world's own (GalaxySim.planetLevel),
    // which answers to neither the party nor the Omega Tower. Null off a surface.
    BSE.Helpers.getAlienWorldLevel = function() {
        const GS = window.GalaxySim;
        const level = (GS && GS.currentPlanetLevel) ? GS.currentPlanetLevel() : 0;
        return level > 0 ? level : null;
    };

    // ------------------------------------------------------------------
    // Off Earth: the place sets the level
    // ------------------------------------------------------------------
    // Nothing out here is on the world map, so neither the distance from the
    // Omega Tower nor the party's own level has anything to say about what
    // lives there. What does is where "there" is: the surface underfoot
    // (GalaxySim.planetLevel) or, aboard a ship or a station, the space around
    // it (the world it orbits, else its system). Both are rolled once from a
    // name and never move, so a world is as dangerous the first time it is
    // seen as the hundredth, and two planets of one star can be a stroll and a
    // massacre.
    //
    // The calendar is deliberately NOT laid over this, for the same reason the
    // tower's own ladder refuses it: Earth's paradox is Earth's, and a world
    // ten thousand light years away does not restock its fauna because of what
    // a year on another planet did.
    BSE.Helpers.getOffWorldLevel = function() {
        if (!BSE.Helpers.isOffWorldMap()) return 0;
        const GS = window.GalaxySim;
        if (!GS) return 0;
        const surface = GS.currentPlanetLevel ? GS.currentPlanetLevel() : 0;
        if (surface > 0) return surface;
        return (GS.currentSpaceLevel ? GS.currentSpaceLevel() : 0) || 0;
    };

    // The window an off-Earth place spawns from, around its own level.
    BSE.Helpers.getOffWorldBand = function(level) {
        const lvl = Math.max(1, Math.round(level));
        return {
            min: Math.max(1, Math.round(lvl * 0.65)),
            max: Math.round(lvl * 1.35),
            center: lvl
        };
    };

    // A "totally random" encounter list for living alien worlds: random valid
    // troops with no biome / nation weighting, but drawn from around the world's
    // own level so the fallback lands where the species roster would have. This
    // is only reached when the roster comes back empty (no usable base enemies).
    function randomAlienEncounterList(count) {
        const worldLevel = BSE.Helpers.getAlienWorldLevel();
        const inBand = (troopId) => {
            if (!worldLevel) return true;
            const lvl = BSE.Helpers.getTroopMaxLevel(troopId);
            return lvl > 0 && Math.abs(lvl - worldLevel) <= worldLevel * 0.35;
        };
        const ids = [];
        const all = [];
        for (let i = 1; i < $dataTroops.length; i++) {
            if (!BSE.Helpers.isSpawnableTroopData($dataTroops[i])) continue;
            all.push(i);
            if (inBand(i)) ids.push(i);
        }
        // Nothing at this world's level: rather than leave it empty, take the
        // whole spawnable table, exactly as before per-planet levels existed.
        if (!ids.length) ids.push(...all);
        if (!ids.length) return [];
        const pool = ids.slice();
        const n = Math.min(count || 6, pool.length);
        const list = [];
        for (let i = 0; i < n && pool.length; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            list.push({ troopId: pool.splice(idx, 1)[0], weight: 1, regionId: 0 });
        }
        return list;
    }

    // Session-local synthetic troops, one per procedural alien species: the
    // species' base enemy id (its 3D look) alone, tagged with the species key;
    // rebuilt on demand because $dataTroops is transient across save/load.
    // Exactly one member, same as every authored troop in data/Troops.json -
    // a lone roaming alien event must fight alone unless the ordinary
    // proximity reinforcement (section 5b) pulls in other nearby events.
    const _alienTroopCache = {}; // speciesKey -> troopId (valid for this session)
    function speciesTroopId(sp) {
        const cached = _alienTroopCache[sp.key];
        if (cached && $dataTroops[cached] && $dataTroops[cached]._alienSpeciesKey === sp.key) {
            return cached;
        }
        const troopId = $dataTroops.length;
        const members = [{ enemyId: sp.enemyId, x: 320, y: 300, hidden: false }];
        $dataTroops.push({ id: troopId, members, name: sp.name, pages: [], _alienSpeciesKey: sp.key });
        _alienTroopCache[sp.key] = troopId;
        return troopId;
    }
    // Encounter list drawn from the world's species roster (procedural aliens).
    function alienSpeciesEncounterList() {
        const GS = window.GalaxySim;
        const roster = (GS && GS.alienSpeciesRoster) ? GS.alienSpeciesRoster() : [];
        if (!roster.length) return randomAlienEncounterList(6);
        return roster.map((sp) => ({ troopId: speciesTroopId(sp), weight: 1, regionId: 0 }));
    }

    // Living alien world -> the world's procedural species; barren world -> no
    // encounters at all (empty list also disables step-based random battles).
    const _BSE_Game_Map_encounterList = Game_Map.prototype.encounterList;
    Game_Map.prototype.encounterList = function () {
        const st = alienSurfaceState();
        if (st) return st.hasLife ? alienSpeciesEncounterList() : [];
        if (!$dataMap) return [];
        const list = _BSE_Game_Map_encounterList
            ? _BSE_Game_Map_encounterList.call(this)
            : ($dataMap ? $dataMap.encounterList : []);
        // Inside the upper tower the map's list is culled to the floor's own
        // level bracket, so the step-battles the party walks into hold the same
        // creatures as the ones standing on the floor.
        const band = BSE.Helpers.getTowerAuthoredBand();
        return band ? BSE.Helpers.filterTroopsToTowerBand(list, band) : list;
    };

    // On battle setup, tag every enemy of a species troop with its procedural
    // name (so it shows in battle) and record the species as discovered. A
    // reinforced troop (section 5b) can mix two species, so it carries one key
    // per member instead of one for the whole troop.
    const _BSE_Game_Troop_setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function (troopId) {
        BSE.Helpers.ensureChaosTroops();
        _BSE_Game_Troop_setup.call(this, troopId);
        const troop = $dataTroops[troopId];
        const GS = window.GalaxySim;
        if (!troop || !GS || !GS.findAlienSpecies) return;
        const keys = troop._alienSpeciesKeys ||
            (troop._alienSpeciesKey ? this.members().map(() => troop._alienSpeciesKey) : null);
        if (!keys) return;
        this.members().forEach((e, i) => {
            const sp = keys[i] ? GS.findAlienSpecies(keys[i]) : null;
            if (!sp) return;
            if (GS.discoverAlienSpecies) GS.discoverAlienSpecies(sp);
            e._alienSpeciesName = sp.name;
        });
    };

    // A tagged enemy reports the species name in battle. originalName (not the
    // raw $dataEnemies name the 3D battler resolves its model from) is overridden,
    // so the look stays the species' base-enemy model while the label changes.
    const _BSE_Game_Enemy_originalName = Game_Enemy.prototype.originalName;
    Game_Enemy.prototype.originalName = function () {
        if (this._alienSpeciesName) return this._alienSpeciesName;
        return _BSE_Game_Enemy_originalName.call(this);
    };

    // ========================================================================
    // 17. Petrodemons
    // ------------------------------------------------------------------------
    // A petrodemon is not in the database. It is generated on the spot, one per
    // fight, and written into a single scratch enemy slot (the same trick the
    // reinforced troop uses): a hulking mass of crude wearing whatever body
    // parts the well swallowed, with its own name, its own numbers and its own
    // handful of the nastiest workings in the book.
    //
    // What decides how hard it is:
    //   easy      below the party's own level, a demonstration rather than a fight
    //   normal    a little above it
    //   difficult / brutal / hellish   progressively further above
    //
    // Its numbers are read off the real enemy table rather than invented: the
    // median ordinary creature of the level it is pitched at, multiplied by what
    // being a petrodemon is worth. That keeps it on the same curve every other
    // creature in the game was scaled onto (tools/enemies/gen_enemy_scale.js).
    //
    // Felling one pays in crude: oil flasks by the crate and OIL options on top
    // (variable 51, which is the holdings' public face and what the market
    // re-syncs from). The 3D look is the `petrodemon` rig, which rolls its heap,
    // its sheen and its grafts from the <PetroSeed:> written here, so no two are
    // the same creature.
    // ========================================================================
    const PETRO = {
        easy:      { level: -6,  hp: 1.9, dmg: 0.75, def: 0.90, skill: 0.30, skills: 3, oil: [8, 14],   crude: [0, 0],  shares: [1, 3] },
        normal:    { level: 2,   hp: 2.6, dmg: 1.00, def: 1.00, skill: 0.52, skills: 4, oil: [14, 22],  crude: [0, 2],  shares: [2, 5] },
        difficult: { level: 9,   hp: 3.4, dmg: 1.25, def: 1.08, skill: 0.70, skills: 5, oil: [24, 36],  crude: [2, 5],  shares: [4, 9] },
        brutal:    { level: 18,  hp: 4.4, dmg: 1.55, def: 1.16, skill: 0.86, skills: 6, oil: [40, 60],  crude: [5, 9],  shares: [8, 16] },
        hellish:   { level: 30,  hp: 6.0, dmg: 1.95, def: 1.24, skill: 1.00, skills: 7, oil: [70, 110], crude: [9, 16], shares: [15, 30] }
    };
    BSE.Data.PETRO_DIFFICULTIES = Object.keys(PETRO);
    const PETRO_OIL_FLASK = 870;    // Oil Flask (the crafting material)
    const PETRO_CRUDE_OIL = 909;    // Crude Oil
    const PETRO_OIL_SHARES_VAR = 51;
    // Above this the enemy table stops being a level ladder and becomes the
    // item-gated tier, so it is never read as "what a creature of level N weighs".
    const PETRO_REF_MAX_LEVEL = 110;

    const petroRoll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const petroPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    function petroMedian(values) {
        const v = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
        if (!v.length) return 0;
        const mid = v.length >> 1;
        return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    }

    // Every ordinary creature the table declares a level for, sorted by it.
    // Bosses are left out: a band is what an ORDINARY creature of that level
    // weighs, and the petrodemon's own boss multiple is applied on top.
    let _petroLevelled = null;
    function petroLevelledEnemies() {
        if (_petroLevelled && _petroLevelled.length) return _petroLevelled;
        _petroLevelled = [];
        for (let i = 1; i < $dataEnemies.length; i++) {
            const e = $dataEnemies[i];
            if (!e || !e.name || !e.params || e._bsePetrodemon) continue;
            if (/<Boss>/i.test(e.note || '')) continue;
            const lv = BSE.Helpers.getEnemyLevel(e.note);
            if (lv < 1 || lv > PETRO_REF_MAX_LEVEL) continue;
            _petroLevelled.push({ lv: lv, e: e });
        }
        _petroLevelled.sort((a, b) => a.lv - b.lv);
        return _petroLevelled;
    }

    // What a creature of this level is worth, as the real table has it: a
    // windowed median that widens until it holds a real sample. Past the table's
    // own ceiling the ladder is continued at the growth the top of it runs at,
    // rather than clamped (a hellish demon over a level 99 party is level 129).
    function petroReference(level) {
        const all = petroLevelledEnemies();
        if (!all.length) return null;
        const cap = Math.min(level, PETRO_REF_MAX_LEVEL);
        let sample = [];
        for (let w = 3; w <= 45 && sample.length < 12; w += 3) {
            sample = all.filter(r => Math.abs(r.lv - cap) <= w);
        }
        if (!sample.length) sample = all.slice(-12);
        const params = [];
        for (let i = 0; i < 8; i++) params.push(petroMedian(sample.map(r => r.e.params[i] || 0)));
        const ref = {
            params: params,
            exp: petroMedian(sample.map(r => r.e.exp || 0)),
            gold: petroMedian(sample.map(r => r.e.gold || 0))
        };
        if (level > PETRO_REF_MAX_LEVEL) {
            const over = level - PETRO_REF_MAX_LEVEL;
            const pg = Math.pow(1.055, over), rg = Math.pow(1.07, over);
            ref.params = ref.params.map(v => v * pg);
            ref.exp *= rg;
            ref.gold *= rg;
        }
        return ref;
    }

    // The nastiest workings in the book, ordered by how much harm they do.
    // A skill only counts if it is pointed at somebody else and an ENEMY can
    // actually cast it: a formula written for an actor (a.level) evaluates to
    // nothing on a creature. The price is not a bar either way, because the
    // demon is given both a deep pool of MP and a body that makes its own TP
    // (the regeneration trait below, and a full gauge the moment it rises),
    // which is what lets it swing the blows the book charges TP for.
    // a.level is NOT in this list: nearly every blow in the book is written
    // with it, and the petrodemon is given one of its own (the getter below),
    // so a formula that asks for it reads properly on the demon.
    const PETRO_ACTOR_FORMULA = /\b(a\.actorId|a\.isActor|a\.currentClass)\b/;

    // A petrodemon is a mass, not a caster: it hits with what it is made of.
    // Physical here means the working lands as a blow (hit type 1) and is
    // carried by the body rather than by a mind (a.atk, never a.mat), dressed
    // in no element the demon has no business throwing: the plain physical one,
    // the crude it swims in, or none at all.
    const PETRO_PHYSICAL_ELEMENTS = [-1, 0, 1, 6];
    function petroIsPhysical(s) {
        const formula = String((s.damage && s.damage.formula) || '');
        if (/a\.(mat|mdf)/.test(formula)) return false;
        const el = (s.damage && typeof s.damage.elementId === 'number') ? s.damage.elementId : -1;
        if (PETRO_PHYSICAL_ELEMENTS.indexOf(el) < 0) return false;
        if (s.hitType === 1) return true;
        return /a\.(atk|agi|mhp|hp)/.test(formula);
    }

    let _petroSkills = null;
    function petroSkillPool() {
        if (_petroSkills && _petroSkills.length) return _petroSkills;
        const pool = [];
        const anyPool = [];
        for (let i = 1; i < $dataSkills.length; i++) {
            const s = $dataSkills[i];
            if (!s || !s.name || !s.damage) continue;
            if (s.occasion === 2 || s.occasion === 3) continue;   // menu-only / never
            if ([1, 2, 3, 4, 5, 6].indexOf(s.scope) < 0) continue; // aimed at the other side
            const formula = String(s.damage.formula || '');
            const hurts = s.damage.type === 1 || s.damage.type === 5;
            const states = (s.effects || []).filter(e => e.code === 21 && e.value1 >= 0.4).length;
            if (!hurts && !states) continue;
            if (hurts && (!formula || PETRO_ACTOR_FORMULA.test(formula))) continue;
            let reach = (formula.match(/a\.(atk|mat|agi|luk|def|mdf|mhp|hp)/g) || []).length * 9;
            const flat = (formula.match(/\d+(\.\d+)?/g) || []).map(Number);
            if (flat.length) reach += Math.min(200, Math.max.apply(null, flat));
            reach += states * 28;
            if (s.scope === 2 || s.scope === 4 || s.scope === 6) reach += 30; // the whole party at once
            const entry = { id: i, score: reach + (s.mpCost || 0) + (s.tpCost || 0) * 4 };
            anyPool.push(entry);
            if (petroIsPhysical(s)) pool.push(entry);
        }
        // The blows are the repertoire. The rest of the book is only read when
        // the table cannot field enough of them to build a demon out of.
        const chosen = pool.length >= 12 ? pool : anyPool;
        chosen.sort((a, b) => a.score - b.score);
        _petroSkills = chosen;
        return chosen;
    }

    // `frac` is where in that order this demon reads: 0 the bottom of the book,
    // 1 the working nothing survives. Drawn from a window rather than a point so
    // two demons of one difficulty never come with the same repertoire.
    function petroSkillIds(frac, count) {
        const pool = petroSkillPool();
        if (!pool.length) return [];
        const centre = Math.round(frac * (pool.length - 1));
        const half = Math.max(5, Math.round(pool.length * 0.035));
        const lo = Math.max(0, centre - half), hi = Math.min(pool.length - 1, centre + half);
        const window = pool.slice(lo, hi + 1);
        const ids = [];
        for (let i = 0; i < count * 4 && ids.length < count; i++) {
            const pickId = petroPick(window).id;
            if (ids.indexOf(pickId) < 0) ids.push(pickId);
        }
        return ids;
    }

    // A name nobody else carries: two halves of a name and the thing it is
    // known for. The banks are i18n, so a demon reads as one in every language.
    function petroName() {
        const first = BSE.Helpers.bi18nList('petrodemon.first') || ['Petro'];
        const second = BSE.Helpers.bi18nList('petrodemon.second') || ['demon'];
        const epithet = BSE.Helpers.bi18nList('petrodemon.epithet') || [''];
        return T('Battle.petrodemon.name', {
            first: petroPick(first), second: petroPick(second), epithet: petroPick(epithet)
        });
    }

    // What the bestiary page reads out. Composed here rather than templated in
    // the note, because a petrodemon is gone from the database the moment the
    // next one is raised: the sentence has to travel with the codex entry.
    function petroDescription() {
        const body = BSE.Helpers.bi18nList('petrodemon.body');
        const grafts = BSE.Helpers.bi18nList('petrodemon.grafts');
        const origin = BSE.Helpers.bi18nList('petrodemon.origin');
        if (!body || !grafts || !origin) return '';
        return T('Battle.petrodemon.desc', {
            body: petroPick(body), grafts: petroPick(grafts), origin: petroPick(origin)
        });
    }

    // The 2D portrait is only ever the fallback (a battle without the 3D
    // battlers), so it borrows the sheet of whatever ooze the database already
    // has rather than shipping one of its own.
    function petroBattlerName() {
        let fallback = '';
        for (let i = 1; i < $dataEnemies.length; i++) {
            const e = $dataEnemies[i];
            if (!e || !e.battlerName) continue;
            if (/slime|ooze|sludge|tar|oil|blob/i.test(e.name || '')) return e.battlerName;
            if (!fallback) fallback = e.battlerName;
        }
        return fallback;
    }

    // One scratch enemy slot and one scratch troop slot, reused by every
    // petrodemon this session. $dataEnemies / $dataTroops are rebuilt from disk
    // on every load, so the marker doubles as "is my slot still mine".
    let _petroEnemySlot = 0, _petroTroopSlot = 0;
    function petroEnemySlot() {
        const held = $dataEnemies[_petroEnemySlot];
        if (_petroEnemySlot > 0 && held && held._bsePetrodemon) return _petroEnemySlot;
        _petroEnemySlot = $dataEnemies.length;
        $dataEnemies.push({ id: _petroEnemySlot, _bsePetrodemon: true, name: '', note: '', meta: {},
            params: [1, 1, 1, 1, 1, 1, 1, 1], actions: [], traits: [], dropItems: [],
            battlerName: '', battlerHue: 0, exp: 0, gold: 0 });
        return _petroEnemySlot;
    }
    function petroTroopSlot() {
        const held = $dataTroops[_petroTroopSlot];
        if (_petroTroopSlot > 0 && held && held._bsePetrodemon) return _petroTroopSlot;
        // Half the game reads "troop id N holds enemy id N alone" as the mark of
        // a creature that can be fought on its own (the arena roster, the quest
        // bounty roster). The two scratch slots are allocated out of two
        // different arrays, so they must never land on the same number, or the
        // petrodemon would read as an ordinary creature to all of them.
        if ($dataTroops.length === petroEnemySlot()) {
            $dataTroops.push({ id: $dataTroops.length, name: '', members: [], pages: [], _bsePetrodemon: true });
        }
        _petroTroopSlot = $dataTroops.length;
        $dataTroops.push({ id: _petroTroopSlot, name: '', members: [], pages: [], _bsePetrodemon: true });
        return _petroTroopSlot;
    }

    BSE.Functions.isPetrodemonDifficulty = function(key) {
        return !!PETRO[String(key || '').toLowerCase()];
    };

    // A petrodemon rises with its gauge full: the physical half of its
    // repertoire is priced in TP, and an ordinary creature opens a fight on a
    // scrap of it.
    // The blows the demon swings are written for a levelled battler
    // ((a.atk * n) * (1 + a.level * 0.05)). An ordinary creature has no level
    // at all and such a formula evaluates to nothing on it, so the level the
    // demon was pitched at is published on the demon ALONE: every other
    // creature reads undefined here exactly as it did before.
    if (!Object.getOwnPropertyDescriptor(Game_Enemy.prototype, 'level')) {
        Object.defineProperty(Game_Enemy.prototype, 'level', {
            configurable: true,
            get: function() {
                const e = this.enemy();
                if (!e || !e.meta || !e.meta.PetroSeed) return undefined;
                return Number(e.meta.Level) || 1;
            }
        });
    }

    const _BSE_Game_Enemy_initTp = Game_Enemy.prototype.initTp;
    Game_Enemy.prototype.initTp = function() {
        _BSE_Game_Enemy_initTp.call(this);
        const e = this.enemy();
        if (e && e.meta && e.meta.PetroSeed) this.setTp(this.maxTp());
    };

    /**
     * Generate one petrodemon and the troop holding it. Returns the record the
     * spoils and the history entry are paid out from, or null when the database
     * is not loaded yet.
     */
    BSE.Functions.generatePetrodemon = function(difficultyKey) {
        const key = String(difficultyKey || 'normal').toLowerCase();
        const d = PETRO[key] || PETRO.normal;
        if (typeof $dataEnemies === 'undefined' || !$dataEnemies) return null;

        const party = $gameParty.members();
        const median = party.length ? BSE.Helpers.getMedianLevel(party) : 1;
        const level = Math.max(1, Math.min(140, Math.round(median + d.level)));
        const ref = petroReference(level);
        if (!ref) return null;

        // Its own numbers: the band, times what being a petrodemon is worth,
        // times a per-demon jitter so no two of one difficulty weigh the same.
        const jitter = () => 0.88 + Math.random() * 0.26;
        const skillIds = petroSkillIds(d.skill, d.skills);
        const priciest = skillIds.reduce((m, id) => {
            const s = $dataSkills[id];
            return Math.max(m, s ? (s.mpCost || 0) : 0);
        }, 0);
        const params = [
            Math.round(ref.params[0] * d.hp * jitter()),
            Math.max(Math.round(ref.params[1] * 3 * jitter()), priciest * 4 + 50),
            Math.round(ref.params[2] * d.dmg * jitter()),
            Math.round(ref.params[3] * d.def * jitter()),
            Math.round(ref.params[4] * d.dmg * jitter()),
            Math.round(ref.params[5] * d.def * jitter()),
            Math.round(ref.params[6] * (0.9 + d.dmg * 0.15) * jitter()),
            Math.round(ref.params[7] * jitter())
        ].map(v => Math.max(1, v));

        const seed = 1 + Math.floor(Math.random() * 0x7ffffffe);
        const name = petroName();
        const description = petroDescription();
        const enemyId = petroEnemySlot();
        const enemy = $dataEnemies[enemyId];
        enemy.name = name;
        // <NoRecruit>: a petrodemon is a force, not a person. It never talks,
        // never surrenders, and can be neither pet, follower nor companion
        // (EnemyTalkSystem's isUnrecruitable, which also reads the marker below).
        enemy.note = `<Boss>\n<NoRecruit>\n<Level: ${level}>\n<Archetype: Slime>\n` +
            `<Model3D: petrodemon>\n<PetroSeed: ${seed}>` +
            (description ? `\n<En: ${description}>` : '');
        enemy.params = params;
        enemy.exp = Math.max(1, Math.round(ref.exp * (1.5 + d.hp * 0.6)));
        enemy.gold = Math.max(1, Math.round(ref.gold * (1.5 + d.hp * 0.6)));
        enemy.battlerName = petroBattlerName();
        enemy.battlerHue = 0;
        enemy.dropItems = [];
        // Crude burns, and nothing else touches it much: it drinks petro whole,
        // shrugs off the cold and the sea, and goes up under a torch.
        enemy.traits = [
            { code: 11, dataId: 2, value: 1.65 },   // Fire
            { code: 11, dataId: 6, value: 0 },      // Petro
            { code: 11, dataId: 1, value: 0.80 },   // Physical
            { code: 11, dataId: 3, value: 0.55 },   // Ice
            { code: 11, dataId: 5, value: 0.45 },   // Water
            { code: 11, dataId: 9, value: 0.65 },   // Cursed
            // Its blows are paid for in TP, and a creature earns TP only by
            // being hit, so the crude makes its own: half a gauge a turn.
            { code: 22, dataId: 9, value: 0.5 }     // TP regeneration
        ];
        enemy.actions = skillIds.map((id, i) => ({
            conditionParam1: 0, conditionParam2: 0, conditionType: 0,
            rating: Math.max(1, 6 - i), skillId: id
        }));
        enemy.actions.push({ conditionParam1: 0, conditionParam2: 0, conditionType: 0, rating: 3, skillId: 1 });
        DataManager.extractMetadata(enemy);

        const troopId = petroTroopSlot();
        const troop = $dataTroops[troopId];
        troop.name = name;
        troop.members = [{ enemyId: enemyId, x: 400, y: 300, hidden: false }];
        troop.pages = [];

        return {
            troopId: troopId, enemyId: enemyId, name: name, level: level, difficulty: key,
            description: description,
            oil: petroRoll(d.oil[0], d.oil[1]),
            crude: petroRoll(d.crude[0], d.crude[1]),
            shares: petroRoll(d.shares[0], d.shares[1]),
            paid: false
        };
    };

    /**
     * Raise a petrodemon and fight it here and now. `difficultyKey` is one of
     * easy/normal/difficult/brutal/hellish; anything else is read as normal.
     */
    BSE.Functions.startPetrodemonBattle = function(difficultyKey) {
        if ($gameParty.inBattle() || $gameParty.isAllDead()) return false;
        if (BSE.Functions.isBattleInitiationBlocked && BSE.Functions.isBattleInitiationBlocked()) return false;
        const record = BSE.Functions.generatePetrodemon(difficultyKey);
        if (!record) return false;

        BSE.State.petrodemon = record;
        // Not a map monster: nothing is deleted, locked or respawned afterwards,
        // so the persistent-battle bookkeeping is deliberately left empty.
        BSE.State.currentBattleEventId = null;
        BSE.State.currentEventId = null;
        BSE.State.currentMapId = null;
        BSE.State.reinforcement = null;
        $gameSystem._p1PreBattlePos = {
            mapId: $gameMap.mapId(), x: $gamePlayer.x, y: $gamePlayer.y, d: $gamePlayer.direction()
        };
        $gameSystem._p2PreBattlePos = null;

        if (window.isMapBattleMode && window.isMapBattleMode() && window.MapBattleMode) {
            window.MapBattleMode.begin(record.troopId, null, 0, $gameMap.mapId());
            return true;
        }
        BattleManager.setup(record.troopId, true, false);
        SceneManager.push(Scene_Battle);
        return true;
    };

    /**
     * The record for the petrodemon being fought right now, or null. Read
     * through here rather than off BSE.State: the record outlives its battle,
     * and an arena fight afterwards must not inherit its spoils.
     */
    BSE.Helpers.getPetrodemonFight = function() {
        const r = BSE.State.petrodemon;
        if (r && $gameTroop && $gameTroop._troopId === r.troopId) return r;
        return null;
    };

    // Every petrodemon felled keeps its page. The scratch enemy slot is rewritten
    // by the next one, so the codex holds a COPY of the creature's own record
    // (its numbers, its note, and the <PetroSeed:> its look was rolled from),
    // which is everything the bestiary needs to draw it again.
    Game_System.prototype.petrodemonCodex = function() {
        if (!this._petrodemonCodex) this._petrodemonCodex = [];
        return this._petrodemonCodex;
    };
    Game_System.prototype.recordPetrodemon = function(entry) {
        const codex = this.petrodemonCodex();
        if (!entry || codex.some(e => e && e.seed === entry.seed)) return;
        codex.push(entry);
        if (codex.length > 200) codex.shift();
    };

    function petroCodexEntry(record) {
        const enemy = $dataEnemies[record.enemyId];
        if (!enemy) return null;
        const copy = JSON.parse(JSON.stringify(enemy));
        copy.meta = Object.assign({}, enemy.meta);
        copy._bsePetrodemonCodex = true;
        delete copy._bsePetrodemon;      // not the live scratch slot any more
        return {
            seed: String(copy.meta.PetroSeed || record.name),
            name: record.name,
            level: record.level,
            difficulty: record.difficulty,
            description: record.description || '',
            enemy: copy
        };
    }

    /** What one petrodemon kill pays, once. Returns null if already paid. */
    BSE.Functions.payPetrodemonSpoils = function() {
        const r = BSE.Helpers.getPetrodemonFight();
        if (!r || r.paid) return null;
        r.paid = true;
        $gameSystem.recordPetrodemon(petroCodexEntry(r));
        const entries = [];
        const grant = (itemId, qty) => {
            const item = $dataItems[itemId];
            if (!item || qty <= 0) return;
            $gameParty.gainItem(item, qty);
            entries.push({ obj: item, qty: qty });
        };
        grant(PETRO_OIL_FLASK, r.oil);
        grant(PETRO_CRUDE_OIL, r.crude);
        // Variables 51/52 are the holdings' public face and the market re-syncs
        // from them (StockMarketSystem), so options are handed over as a write.
        if (r.shares > 0 && $gameVariables) {
            const held = Math.max(0, Number($gameVariables.value(PETRO_OIL_SHARES_VAR)) || 0);
            $gameVariables.setValue(PETRO_OIL_SHARES_VAR, held + r.shares);
        }
        return { record: r, entries: entries, shares: r.shares };
    };

    // Barren alien world, or a "death" world (WorldManager.populationMode) ->
    // erase every roaming "Enemy" event so nothing spawns, procedural map or
    // authored one alike. A death world is an empty world (isEmptyWorld() is
    // true for it too) with the fauna gone on top: nobody is left to fight
    // any more than they are left to talk to.
    const _BSE_spawnEnemiesFromEncounters = Scene_Map.prototype.spawnEnemiesFromEncounters;
    Scene_Map.prototype.spawnEnemiesFromEncounters = function () {
        if (!$dataMap) return;
        const st = alienSurfaceState();
        const WM = window.WorldManager;
        const deathWorld = !!(WM && typeof WM.isDeathWorld === "function" && WM.isDeathWorld());
        if ((st && !st.hasLife) || deathWorld) {
            $gameMap.events().forEach((ev) => {
                const ed = ev.event();
                if (ed && ed.name === 'Enemy') ev.erase();
            });
            return;
        }
        _BSE_spawnEnemiesFromEncounters.call(this);
    };

})();