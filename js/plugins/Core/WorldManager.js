//=============================================================================
// WorldManager.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Dwarf Fortress-style world folders: world history, NPC status, artifacts, dungeon layout and public state live in per-world JSON files; savegames stay minimal.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @param timeVariableId
 * @text Game Time Variable ID
 * @desc Variable holding total elapsed game minutes (TimeDateSystem). The world clock is the max value reached by any save.
 * @type variable
 * @default 114
 *
 * @param sharedVariables
 * @text World-Shared Variable IDs
 * @desc Comma-separated variable ids shared by every savegame of a world (stored in variables.json). Seeds each world's manifest.
 * @type string
 * @default 2,53,61,113,114
 *
 * @param privateSwitches
 * @text Per-Save (Private) Switch IDs
 * @desc Comma-separated switch ids that stay per-savegame. Switches are world-shared by default; list exceptions here.
 * @type string
 * @default
 *
 * @help
 * WorldManager.js
 * ============================================================================
 * Implements a Dwarf Fortress-style "world folder" save layout:
 *
 *   save/worlds/<WorldName>/
 *     world.json      - world info (name, seed, world clock, timestamps)
 *     history.json    - generated world history (events, hyperpowers, the
 *                       century's epidemics, ...)
 *     artifacts.json  - generated artifact items/weapons/armors
 *     npcs.json       - NPC society / status / factions for the NPC systems,
 *                       plus the outbreaks currently burning (EpidemicSystem)
 *     dungeon.json    - generated dungeon structure (DungeonFloorSystem)
 *     conversations.json - NPC↔NPC dialogue log (NPCConversation, last 20 per NPC)
 *     state.json      - public switches shared by the world
 *     variables.json  - world-shared game variables (manifest + values)
 *     market.json     - world-shared market prices (stock history, ...)
 *     terrain.json    - procedural-map terrain the players changed (dismantled
 *                       features, lit torches, doors bashed or picked open)
 *     plants.json     - crops: the procedural-map plots and the authored maps'
 *                       own Plant events (PlantGrowthSystem)
 *     rentals.json    - which room in which inn is booked for the night, and by
 *                       whose party (RentSystem). One bed cannot be let to two
 *                       savegames of the same world at once.
 *     bestiary.json   - what this world has been seen to hold: the creatures
 *                       met, the petrodemons felled and the alien species
 *                       identified (Bestiary.js). Merged, never replaced, so a
 *                       new game in the world adds to the book instead of
 *                       starting it again.
 *     containers.json - what every chest, cupboard, crate and sack in the world
 *                       holds, and which of them have been stocked
 *                       (ContainerSystem). The party's own bags (the
 *                       extradimensional container, the camper and car holds)
 *                       stay in the binary savegame.
 *     chests.json     - which chests in the world stand open: the procedural
 *                       map's random chests, keyed by world square and tile,
 *                       and the authored maps' Treasure / Acquire events
 *                       (ChestWorldState). A chest emptied by one savegame is
 *                       empty for every other savegame of the world.
 *     shops.json      - what is left on the shelves today, and the abilities
 *                       already bought from a teaching shop (ItemSystemShop,
 *                       RandomDailyShop). Both reroll at midnight on their own.
 *     animals.json    - the livestock standing in the world, ageing on the
 *                       world clock (AnimalGrowthSystem).
 *     furniture.json  - what the party has BUILT, per world coordinate: the
 *                       pieces placed and the raw tiles written into the map
 *                       (FurnitureSystem). What is still in the pack, and the
 *                       recipes unlocked, stay the party's own.
 *     production.json - the brewing barrels standing on the maps
 *                       (BrewingSystem).
 *     apiary.json     - the apiary and its hives (ApiarySystem). Its own file
 *                       because it is the one world record held as a class
 *                       instance, which JsonEx rebuilds by name.
 *     galaxy.json     - how much has been dug out of each body, and the star
 *                       map anomalies already answered (GalaxySim).
 *     party.json      - the other playthroughs of this world: where each one
 *                       was last saved and who was in it, so a savegame that
 *                       walks into that place finds them there as NPCs; plus
 *                       how every party member stands with the NPCs and with
 *                       the other playthroughs' members (NPCSystem.js).
 *     saves/          - binary savegames (file0..N, global, fog_*, ...)
 *
 * - $gameSystem world-scoped fields (_historical*, _npc*, _dungeon*, etc.)
 *   are redirected to the world files through prototype accessors, so they
 *   never get serialized into the binary savegame.
 * - Switches are PUBLIC (world-shared, stored in state.json) by default. A
 *   switch id listed in WORLD_PRIVATE_SWITCHES stays per-savegame.
 * - Variables are PRIVATE (per-savegame) by default. Only the ids named in
 *   the world's variables.json "sharedVarIds" manifest are world-shared;
 *   their values live in variables.json and are applied on top of every
 *   savegame of the world. (This replaces the old "*"-prefix naming
 *   convention: the manifest is now an explicit id allowlist.)
 * - The world clock (time variable) is monotonic across savegames: loading
 *   any save continues at the latest date reached in the world.
 * - No world is ever created behind the player's back. With an empty world
 *   folder there is simply no active world, and the title screen greys out
 *   everything that would need one (Explore, Reconnect, Story mode, Sandbox)
 *   until one is made from the Worlds screen. Only the minigame arcade, which
 *   stands on a throwaway context, stays playable.
 * - A world is generated once, up front, not piecemeal as it is explored.
 *   Systems owning world data register a step through
 *   WorldManager.registerWorldInitializer(key, order, fn); every step a world
 *   still owes is run when the world is created (or, for the world made
 *   automatically at boot, when the first game is started in it) and recorded
 *   in world.json under "initialized". Current steps, in order: history,
 *   worldgen manifests, the NPC roster (people, homes, jobs), shop counter
 *   rotas, the dungeon layout, politics, the factions' diplomatic accords, the
 *   settlement web, the continental epidemics and Eris's defence bar.
 *
 * World data files are written whenever a savegame is written.
 * ============================================================================
 */

(() => {
    "use strict";

    const pluginName = "WorldManager";
    const params = PluginManager.parameters(pluginName);
    const TIME_VARIABLE_ID = Number(params.timeVariableId) || 114;
    // Save names that stay outside the world folder (shared by all worlds)
    const GLOBAL_SAVE_NAMES = ["config"];

    // Default world seed, stored as the named word "esoteric": every RNG
    // (history sim, procedural maps, NPCs, loot) normalizes it to a uint32, so
    // a default world is the reproducible "esoteric" world rather than a random
    // one. Shared with the creation UI through WorldManager.DEFAULT_SEED.
    const DEFAULT_WORLD_SEED = "esoteric";
    // Canonical world starting date: 1 January 2001, 10:00, which is minute 0
    // of the world clock (the TimeDateSystem epoch).
    const DEFAULT_START_YEAR = 2001;
    const DEFAULT_START_MONTH = 1;
    // The level a world creates its characters at (see createWorld.startLevel).
    const DEFAULT_START_LEVEL = 1;
    const MAX_START_LEVEL = 99;
    function clampStartLevel(level) {
        const n = Math.floor(Number(level));
        if (!Number.isFinite(n)) return DEFAULT_START_LEVEL;
        return Math.max(DEFAULT_START_LEVEL, Math.min(MAX_START_LEVEL, n));
    }

    // Who this world is populated with. Asked once at creation and never
    // again (no setter is exposed for it, on purpose): "normal" is every
    // existing world's answer, "goblin"/"monster" narrow the sprite, bust and
    // archetype pool NPCs and creature creation draw from, and "empty" turns
    // off NPC spawning, history, news, epidemics and crime outright. "death"
    // is an empty world with the fauna gone too: it answers isEmptyWorld()
    // exactly as "empty" does (so it is every empty-world consumer's problem
    // for free) AND, on top of that, no "Enemy" map event is ever placed by
    // the encounter system (BattleSystemEnhancedEncounters), on a procedural
    // map or an authored one alike. Read through WorldManager.populationMode()
    // / isEmptyWorld() / isDeathWorld().
    // "chaos" is a world drawn out of a hat: the roster of every encounter, the
    // look of every NPC, the stock and the price of every shop and the skill a
    // character learns on a level up are all rolled instead of authored. What
    // a thing IS never changes (a weapon keeps its damage, an enemy its
    // parameters); only which one you meet, and for how much, does. Read
    // through WorldManager.isChaosWorld() and window.ChaosWorld.
    const DEFAULT_POPULATION_MODE = "normal";
    const POPULATION_MODES = ["normal", "chaos", "goblin", "monster", "empty", "zombie", "death"];
    function clampPopulationMode(mode) {
        return POPULATION_MODES.includes(mode) ? mode : DEFAULT_POPULATION_MODE;
    }

    // How much magic there is in this world, asked once at creation beside the
    // alternate timeline and stored the same way. It is a SEPARATE axis: every
    // combination is legal and the two are resolved independently, so a
    // severed-magic zombie apocalypse and an unbound-magic goblin world are
    // both worlds you can make.
    //
    //   normal   , everything, which is every world made before this existed
    //   severed  , nothing that works by magic exists (<Nature: Magical>)
    //   unbound  , nothing ordinary is left  (<Nature: Mundane>)
    //
    // Read through WorldManager.magicalLevel().
    const DEFAULT_MAGICAL_LEVEL = "normal";
    const MAGICAL_LEVELS = ["normal", "severed", "unbound"];
    function clampMagicalLevel(level) {
        return MAGICAL_LEVELS.includes(level) ? level : DEFAULT_MAGICAL_LEVEL;
    }

    // Beta sprites are strictly disabled across all worlds and cannot be selected.
    const DEFAULT_BETA_SPRITES = false;

    // 21 December 2012, 00:00, in world-clock minutes (the TimeDateSystem epoch
    // is 1 January 2001, 10:00). A world whose clock starts at or after this
    // begins with the impact already behind it, so switch 199 is raised before
    // the first map ever loads. GalaxySim owns the timeline and is asked first;
    // the constant is the answer for a build with that plugin turned off.
    const IMPACT_MINUTE_FALLBACK =
        Math.round((new Date(2012, 11, 21, 0, 0, 0) - new Date(2001, 0, 1, 10, 0, 0)) / 60000);
    const SW_EARTH_LOST = 199;
    function impactMinute() {
        const N = window.GalaxySim && window.GalaxySim.Nibiru;
        const m = N && N.IMPACT_MINUTE;
        return (typeof m === "number" && isFinite(m)) ? m : IMPACT_MINUTE_FALLBACK;
    }

    // Parses a "1, 2 ,3" CSV of ids into an array of positive integers.
    function parseIdList(csv) {
        return String(csv || "")
            .split(",")
            .map(s => parseInt(s.trim(), 10))
            .filter(n => Number.isInteger(n) && n > 0);
    }

    // Variables shared by every savegame of a world. The per-world
    // variables.json "sharedVarIds" manifest is seeded from this list and is
    // authoritative once written, so the set can evolve without breaking
    // existing worlds. Configured via the "sharedVariables" plugin parameter.
    //   2   Maximum dungeon floor reached (DungeonFloorSystem; unlocks floor list)
    //   53  SOUL tendency / median / fuel-base / shop-tax (world market signal)
    //   61  World Temperature (climate)
    //   113 Date (world calendar)
    //   114 MinutesPassed (world clock; also monotonic below)
    const DEFAULT_SHARED_VARS = (() => {
        const ids = parseIdList(params.sharedVariables);
        return ids.length ? ids : [2, 53, 61, 113, 114];
    })();

    // Variables that are never world-shared whatever a manifest says, because
    // they belong to one playthrough's criminal record:
    //   66  PlayerBounty (CrimeSystem)
    //   85  the legacy officer-chase variable
    //   131 PoliceHeat (how badly the police want this party)
    const NEVER_SHARED_VARS = [66, 85, 131];

    // Switches that stay per-savegame. Switches are world-shared by default;
    // list exceptions in the "privateSwitches" plugin parameter.
    //
    // Everything character creation turns on belongs to the playthrough that
    // made those choices, never to the world: a world where one savegame played
    // Em must not hand Em's switch to every other savegame of that world.
    //   9        Permadeath (difficulty step)
    //   10,13,33 Class selected / character created / creation complete
    //   45,46    Card mode / Monster mode (battle-system step)
    //   48,49,58 Em / Bubba / Selene, set by their dossier
    //   50       SkipEmEvent, set by the Em and Bubba dossiers
    //   51,64    Camper / Car unlocked (a dossier can park one; the parked spot
    //            itself already lives per-save in $gameSystem)
    //   77,78,79 Player 1/2/3 is a creature
    //   100      Story mode mode. Turned on by the Icebush intro event and never
    //            turned off, so as a world switch it made every later savegame
    //            of that world believe it was still in the story mode.
    const STORY_MODE_SWITCH_ID = 100;
    const DEFAULT_PRIVATE_SWITCHES = [9, 10, 13, 33, 45, 46, 48, 49, 50, 51, 58, 64, 77, 78, 79, STORY_MODE_SWITCH_ID];
    const WORLD_PRIVATE_SWITCHES = new Set((() => {
        const ids = parseIdList(params.privateSwitches);
        return ids.length ? ids : DEFAULT_PRIVATE_SWITCHES;
    })());

    //=========================================================================
    // World data file layout: which $gameSystem fields live in which file
    //=========================================================================

    // A field is declared either as a plain property name, or as
    // { prop, merge }, where merge folds an incoming value into whatever the
    // world already holds instead of replacing it. The bestiary is what it was
    // written for. A catalogue is only ever added to, and three things assign
    // to it wholesale: a new game (Game_System's own initialize), a savegame
    // written before the field was world-shared (JsonEx restores it by
    // assignment, i.e. through the setter below), and any plugin resetting its
    // own store. Replacing on all three would let the emptiest savegame of a
    // world erase every creature the others ever cataloged.
    function fieldSpec(entry) {
        return (entry && typeof entry === "object" && entry.prop)
            ? entry
            : { prop: entry, merge: null };
    }

    // Union of two id lists, what the world already holds first.
    function mergeIdList(existing, incoming) {
        const base = Array.isArray(existing) ? existing.slice() : [];
        if (!Array.isArray(incoming)) return base;
        const seen = new Set(base);
        for (const id of incoming) {
            if (!seen.has(id)) { seen.add(id); base.push(id); }
        }
        return base;
    }

    // Union of two lists of records identified by one field of their own.
    function mergeRecordList(idKey) {
        return function (existing, incoming) {
            const base = Array.isArray(existing) ? existing.slice() : [];
            if (!Array.isArray(incoming)) return base;
            const seen = new Set(base.map(rec => rec && rec[idKey]));
            for (const rec of incoming) {
                if (!rec || seen.has(rec[idKey])) continue;
                seen.add(rec[idKey]);
                base.push(rec);
            }
            return base;
        };
    }

    // Union of two plain objects, entry by entry, folding a collision with the
    // given function. Without one the world's own entry wins, which is the
    // answer for a record nobody merges further down (a shop's stock for the
    // day, a species dossier).
    function mergeMapOf(valueMerge) {
        return function (existing, incoming) {
            const base = (existing && typeof existing === "object") ? existing : {};
            if (!incoming || typeof incoming !== "object") return base;
            for (const key of Object.keys(incoming)) {
                if (base[key] === undefined) base[key] = incoming[key];
                else if (valueMerge) base[key] = valueMerge(base[key], incoming[key]);
            }
            return base;
        };
    }
    const mergeByKey = mergeMapOf(null);

    // What the world already holds stands; an incoming value is only taken
    // where the world has nothing. For a single object that is built once and
    // then only ever mutated in place, such as the apiary.
    function keepHeld(existing, incoming) {
        return existing === undefined || existing === null ? incoming : existing;
    }

    // The furthest either side has counted. Used for the id counters behind
    // things placed in the world, so two savegames never hand out one number.
    function mergeMax(existing, incoming) {
        const a = Number(existing) || 0;
        const b = Number(incoming) || 0;
        return Math.max(a, b);
    }

    const SYSTEM_FIELD_MAP = {
        world: {
            // Pre-made characters already played in this world. A preset can be
            // picked only once per world, so the list is world-scoped rather
            // than per-savegame (CharacterCreationPresets.js).
            _usedCharacterPresets: "usedCharacterPresets",
            // Party members retired ("set inactive") from the Dynamics menu.
            // They become pickable dossiers in character creation, so they have
            // to outlive the savegame that retired them and be visible to every
            // playthrough of this world (CharacterCreationPresets.js).
            _retiredCharacterPresets: "retiredCharacters",
            // How many Ems this world has already taken. The endless dossier is
            // never spent, but each incarnation is a different one and her
            // hometown is her number, so the count belongs to the world rather
            // than to one savegame (CharacterCreationPresets.js).
            _emIncarnations: "emIncarnations",
            // Eris was beaten in her own court (Economy/ErisTrial.js). She is
            // gone from this WORLD, not from one savegame of it: the bounty
            // stops growing for everybody who plays here, and she stops turning
            // up on the world map asking anyone out
            // (Procedural/ProceduralAdventureSystem.js).
            _erisBountyImmunity: "erisDefeated"
        },
        history: {
            _historicalEvents: "events",
            // The two offices every hyperpower holds: who governs it, and who
            // it answers to (HistorySimulator, Leaders.json `moralGuide`).
            _historicalMoralGuides: "moralGuides",
            _historicalHyperpowers: "hyperpowers",
            _historicalFactions: "factions",
            _historicalDeadLeaders: "deadLeaders",
            _historicalStartYear: "startYear",
            _historySeed: "seed",
            // The century's epidemics (HistorySimulator). World-shared: every
            // savegame of a world lived through the same plagues and panics.
            _historicalEpidemics: "epidemics"
        },
        artifacts: {
            _generatedArtifacts: "generated"
        },
        npcs: {
            _npcSociety: "society",
            _npcSocialRegistry: "socialRegistry",
            _npcBuildingOccupants: "buildingOccupants",
            _npcGroupAssignments: "groupAssignments",
            _npcGroupMemory: "groupMemory",
            _npcJobAssignments: "jobAssignments",
            _npcJobAssignedGroups: "jobAssignedGroups",
            _npcShopAssignments: "shopAssignments",
            _npcShopReservedNames: "shopReservedNames",
            _npcMapGroups: "mapGroups",
            _npcMapSizes: "mapSizes",
            _npcMapTags: "mapTags",
            _npcMapLastVisitAt: "mapLastVisitAt",
            _npcPoolCache: "poolCache",
            _npcLastMapId: "lastMapId",
            _npcLastNeedsTick: "lastNeedsTick",
            _npcLastOpinionDecayDay: "lastOpinionDecayDay",
            _npcLastSeenMinute: "lastSeenMinute",
            _npcSystemCurrentMapGroup: "systemCurrentMapGroup",
            _currentNpcGroup: "currentNpcGroup",
            _npcTimeSkipped: "timeSkipped",
            _npcLifeRecords: "lifeRecords",
            _npcLifeLastSimMinute: "lifeLastSimMinute",
            _npcPastPartyMembers: "pastPartyMembers",
            _npcPolitics: "politics",
            // Who has signed what with whom: the hyperpower-to-hyperpower
            // accords and each branch faction's own line on them, rolled once
            // from the world seed when the world is made
            // (FactionDataManager.js). World-shared for the same reason the
            // governments above it are: two savegames of a world are living in
            // the same geopolitics. Built once and amended in place, so the
            // world's copy stands.
            _factionDiplomacy: { prop: "diplomacy", merge: keepHeld },
            _npcWorldWeb: "worldWeb",
            // Live outbreaks (Health_DiseaseSystem / window.EpidemicSystem).
            // Shared like the world web: an epidemic burning through Milano is
            // burning through it in every savegame of that world.
            _epidemics: "epidemics",
            _npcRecruitedProcCitizens: "recruitedProcCitizens",
            // Citizens of the authored maps the world has lost: recruited into
            // somebody's party, or killed where they stood. Both take the
            // person off the map by flipping their event's self switch A, and
            // self switches live in the binary savegame, so the same person
            // could be recruited again in the next savegame of the world and a
            // new game found everyone standing where they always had. Keyed by
            // event slot, decided by name (NPCSystem.js, GoneRegistry). The
            // procedural map keeps its own record next door, per world tile.
            _npcGoneCitizens: { prop: "goneCitizens", merge: mergeByKey },
            // Rooms an NPC has turned in for the night (RentSystem.js). The
            // player's own bookings of the same beds were already world-shared
            // (rentals.json), so without this two savegames disagreed about how
            // many beds the town had left. Expired entries are dropped on read,
            // so the table cleans itself.
            _npcRentals: { prop: "npcRooms", merge: mergeByKey },
            // The assembly's own ledger: sessions held, and the week each was
            // last paid for (ONUAssembly.js). Built once and settled forward in
            // place, so the world's copy stands.
            _onuAssembly: { prop: "onuAssembly", merge: keepHeld },
            // Where the factions' armies are standing. A snapshot rewritten
            // whole every time they move, so the latest writer wins, exactly as
            // it does within one savegame (ArmyEventsManager.js).
            _savedFactionArmies: "factionArmies",
            // The five advocates practising before Eris's bench. Seeded from the
            // world seed, but the strike-off list (a lawyer recruited into some
            // party, and so replaced) has to outlive the savegame that recruited
            // them so every playthrough of this world briefs the same bar
            // (ErisTrial.js, window.ErisLawyers).
            _erisLawyers: "erisLawyers",
            // Who stands which of the three 8-hour shifts behind each <Shop>
            // counter in the world, keyed "mapId_eventId" (ShopShiftManager,
            // NPCSimulationCore.js). The rota is decided once for the whole
            // world rather than per map visit, so the same face is behind the
            // same counter in every savegame of the world.
            _npcShopPersonas: "shopPersonas",
            // The slice of each group's job-less locals reserved as counter
            // staff. Drawn from the same seeded shuffle as the job assignments
            // next to it, so it belongs to the world exactly as they do
            // (JobShiftManager, NPCSimulationCore.js).
            _npcShopkeeperPool: "shopkeeperPool"
        },
        dungeon: {
            _dungeonFloors: "floors",
            _dungeonGenerated: "generated",
            _stairLocations: "stairLocations",
            _elevatorSpawnPoints: "elevatorSpawnPoints",
            _eventPositions: "eventPositions",
            _treasureRoomPositions: "treasureRoomPositions"
        },
        conversations: {
            _npcConversations: "log"
        },
        // The other playthroughs of this world, and where they were left. A
        // manual save writes down where that party is standing and who is in
        // it; every other savegame that walks into the same place finds them
        // there, wandering as ordinary NPCs (NPCSystem.js, VisitingParties).
        // Both halves are keyed by a stable member key (p<slot>a<actorId>)
        // rather than by actor id, which means a different person in every
        // savegame, and both are merged so no playthrough erases another's.
        party: {
            _partyPresence: { prop: "parties", merge: mergeByKey },
            // How every party member, active or benched, stands with everybody
            // else: with the NPCs they have met, and with the members of other
            // playthroughs' parties. Never in the binary savegame, or half the
            // record would belong to one playthrough and be invisible to the
            // rest (NPCEmpathize.js).
            _partyDispositions: { prop: "dispositions", merge: mergeMapOf(mergeByKey) }
        },
        // The market's own side of the ledger. Share prices already lived here
        // (StockMarketSystem); this is the register of which properties are off
        // the market, so a house one party bought is not still for sale to the
        // next savegame of the world. WHOSE it is stays private, in the binary
        // savegame: the world is only told that it is taken (RealEstateMarket).
        market: {
            _realEstateTaken: { prop: "realEstateTaken", merge: mergeByKey }
        },
        // The vessels standing in the world and what is working inside them.
        // The same class of thing as a chest (containers.json): a barrel is a
        // fixture of the map it stands on, and what is fermenting in it runs on
        // the world clock, so two savegames of a world must not each hold their
        // own brew in the same barrel.
        production: {
            // Keyed mapId_eventId (BrewingSystem.js).
            _brewingBarrels: { prop: "barrels", merge: mergeByKey }
        },
        // The apiary keeps a file to itself because it is the one world record
        // that is a class instance rather than plain data: JsonEx rebuilds it
        // by looking window.ApiaryComplex up by name, and a build with that
        // plugin switched off would take everything sharing the file down with
        // it. Built once by ApiarySystem and simulated forward in place, so the
        // world's own hives stand.
        apiary: {
            apiaryComplex: { prop: "complex", merge: keepHeld }
        },
        // What has been taken out of the sky. How much an asteroid or a comet
        // holds is seeded, so every savegame of the world agrees on it; how
        // much has already been dug out of it was not, so one savegame could
        // mine a body dry and the next still find it full. The deeper hole
        // wins a collision, since nothing ever puts ore back.
        galaxy: {
            _gxMinedBodies: { prop: "mined", merge: mergeMapOf(mergeMax) },
            // The "?" encounters already answered, keyed system|body. An
            // anomaly is a thing that happened out there, not a thing that
            // happened to one party (GalaxySim_Core.js).
            _gsAnomalies: { prop: "anomalies", merge: mergeByKey }
        },
        // What the party has built. Keyed by world coordinate exactly as the
        // crops and the livestock are (FurnitureSystem.furnitureMapKey), and
        // world-shared for the same reason the terrain they pulled DOWN
        // already was (terrain.json): a house raised on a world square stands
        // there in every playthrough of the world, rather than only for the
        // savegame that raised it. What is still in the pack (inventory,
        // unlocked recipes) stays the party's own, in the binary savegame.
        furniture: {
            _furnitureBuilt: { prop: "placed", merge: mergeMapOf(mergeRecordList("id")) },
            _furnitureBuiltTiles: { prop: "tiles", merge: mergeMapOf(mergeRecordList("id")) },
            _furnitureBuiltId: { prop: "placedId", merge: mergeMax },
            _furnitureBuiltTileId: { prop: "placedTileId", merge: mergeMax }
        },
        // Crops on the hand-made maps, keyed mapId_eventId. The procedural
        // fields next to them were already world-shared (plants.json -> plots),
        // written by PlantGrowthSystem itself, so a farm on a world square was
        // the same farm in every savegame while the identical farm on an
        // authored map was not. The event's self switch is re-derived from this
        // record on every map load (refreshMapPlants), so the sown/harvested
        // page follows the world rather than the binary savegame.
        plants: {
            _plantData: { prop: "events", merge: mergeByKey }
        },
        // The livestock standing in the world. A bought animal is placed on a
        // tile and keyed by world coordinate, exactly as a crop plot is, so it
        // belongs to the world the same way: an ox settled on a field in one
        // savegame is grazing there in every other one, ageing on the same
        // world clock (AnimalGrowthSystem.js).
        animals: {
            // The legacy authored "Animal" event slots, keyed mapId_eventId.
            _animalData: { prop: "penned", merge: mergeByKey },
            // Animals bought from the Build menu, keyed by world coordinate,
            // each list unioned by the animal's own id.
            _animalPlacements: { prop: "placements", merge: mergeMapOf(mergeRecordList("uid")) },
            // The id counter behind them, so no two savegames of the world
            // ever hand the same number to two different animals.
            _animalPlacementUid: { prop: "placementUid", merge: mergeMax }
        },
        // What the world's counters have left. The catalogue on a shelf is
        // seeded (RandomDailyShop rolls it from the world seed, the shop's own
        // coordinates and the date, so every savegame walks into the same
        // shop), but how much of it is still there was not: one savegame could
        // buy the last of something and the next still found it in stock. Both
        // records already carry the day they were rolled for and reroll when it
        // turns over, so sharing them costs nothing at midnight.
        shops: {
            // Per shop event, per day: the stock left and the day's price
            // factors (ItemSystemShop.js).
            _shopStocks: { prop: "stocks", merge: mergeMapOf(mergeMapOf(null)) },
            // The abilities already bought from a teaching shop today
            // (RandomDailyShop.js). Two savegames buying different ones both
            // count, so the lists are unioned.
            _dailyTeachShopSold: { prop: "teachSold", merge: mergeMapOf(mergeIdList) }
        },
        // What this world has been seen to hold. A bestiary is a record of the
        // world's fauna rather than of one party's travels, so it is shared by
        // every savegame of the world and, being merged rather than replaced,
        // is never wiped by a new game started in it. Three catalogues, one per
        // page of the book (Bestiary.js):
        bestiary: {
            // Earth: the ids of the creatures met (Bestiary.js).
            _encounteredMonsters: { prop: "encountered", merge: mergeIdList },
            // Petrodemons: a copy of each one felled, since the scratch enemy
            // slot it was raised in belongs to the next one
            // (BattleSystemEnhancedEncounters.js).
            _petrodemonCodex: { prop: "petrodemons", merge: mergeRecordList("seed") },
            // Aliens: the procedural species identified out in the galaxy,
            // keyed by species key (GalaxySim_Core.js).
            _discoveredAlienSpecies: { prop: "alienSpecies", merge: mergeByKey }
        }
    };

    const DATA_FILE_KEYS = ["world", "history", "artifacts", "npcs", "dungeon", "state", "variables", "market", "conversations", "terrain", "plants", "containers", "chests", "mail", "rentals", "techtree", "bestiary", "shops", "animals", "furniture", "galaxy", "production", "apiary", "party", "playerquests"];

    //=========================================================================
    // Storage backend (NW.js filesystem, localStorage fallback for browser)
    //=========================================================================

    const isNwjs = Utils.isNwjs();
    const LS_PREFIX = "hyperworlds.";

    const Backend = isNwjs ? {
        _fs: require("fs"),
        _path: require("path"),
        baseDir() {
            const base = this._path.dirname(process.mainModule.filename);
            return this._path.join(base, "save", "worlds");
        },
        worldDir(name) {
            return this._path.join(this.baseDir(), name);
        },
        savesDir(name) {
            return this._path.join(this.worldDir(name), "saves");
        },
        ensureDir(dir) {
            if (!this._fs.existsSync(dir)) this._fs.mkdirSync(dir, { recursive: true });
        },
        worldExists(name) {
            return this._fs.existsSync(this._path.join(this.worldDir(name), "world.json"));
        },
        listWorlds() {
            const base = this.baseDir();
            if (!this._fs.existsSync(base)) return [];
            return this._fs.readdirSync(base).filter(entry => {
                try {
                    return this._fs.statSync(this._path.join(base, entry)).isDirectory() &&
                        this.worldExists(entry);
                } catch (e) {
                    return false;
                }
            });
        },
        readFile(name, fileKey) {
            const filePath = this._path.join(this.worldDir(name), fileKey + ".json");
            if (!this._fs.existsSync(filePath)) return null;
            try {
                let text = this._fs.readFileSync(filePath, "utf8");
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                return text;
            } catch (e) {
                console.error(`[WorldManager] Failed to read ${filePath}`, e);
                return null;
            }
        },
        writeFile(name, fileKey, text) {
            this.ensureDir(this.worldDir(name));
            const filePath = this._path.join(this.worldDir(name), fileKey + ".json");
            this._fs.writeFileSync(filePath, text, "utf8");
        },
        _removeDirRecursive(dir) {
            const fs = this._fs;
            const path = this._path;
            if (!fs.existsSync(dir)) return;
            // Newer Node (>=14.14) exposes fs.rmSync; older NW.js builds only
            // have rmdirSync (recursive added in Node 12) or neither. Fall back
            // to a manual depth-first delete so worlds always get removed.
            if (typeof fs.rmSync === "function") {
                fs.rmSync(dir, { recursive: true, force: true });
                return;
            }
            try {
                fs.rmdirSync(dir, { recursive: true });
                if (!fs.existsSync(dir)) return;
            } catch (e) {
                // fall through to manual recursion
            }
            for (const entry of fs.readdirSync(dir)) {
                const full = path.join(dir, entry);
                if (fs.statSync(full).isDirectory()) {
                    this._removeDirRecursive(full);
                } else {
                    fs.unlinkSync(full);
                }
            }
            fs.rmdirSync(dir);
        },
        removeWorld(name) {
            this._removeDirRecursive(this.worldDir(name));
        },
        readActive() {
            const filePath = this._path.join(this.baseDir(), "active.json");
            if (!this._fs.existsSync(filePath)) return null;
            try {
                return JSON.parse(this._fs.readFileSync(filePath, "utf8")).active || null;
            } catch (e) {
                return null;
            }
        },
        writeActive(name) {
            this.ensureDir(this.baseDir());
            const filePath = this._path.join(this.baseDir(), "active.json");
            this._fs.writeFileSync(filePath, JSON.stringify({ active: name }), "utf8");
        }
    } : {
        _index() {
            try {
                return JSON.parse(localStorage.getItem(LS_PREFIX + "index")) || [];
            } catch (e) {
                return [];
            }
        },
        _setIndex(list) {
            localStorage.setItem(LS_PREFIX + "index", JSON.stringify(list));
        },
        ensureDir() {},
        worldExists(name) {
            return this._index().includes(name);
        },
        listWorlds() {
            return this._index();
        },
        readFile(name, fileKey) {
            return localStorage.getItem(LS_PREFIX + name + "." + fileKey);
        },
        writeFile(name, fileKey, text) {
            if (!this.worldExists(name)) this._setIndex(this._index().concat([name]));
            localStorage.setItem(LS_PREFIX + name + "." + fileKey, text);
        },
        removeWorld(name) {
            this._setIndex(this._index().filter(n => n !== name));
            DATA_FILE_KEYS.forEach(key => localStorage.removeItem(LS_PREFIX + name + "." + key));
        },
        readActive() {
            return localStorage.getItem(LS_PREFIX + "active") || null;
        },
        writeActive(name) {
            if (name) {
                localStorage.setItem(LS_PREFIX + "active", name);
            } else {
                localStorage.removeItem(LS_PREFIX + "active");
            }
        }
    };

    //=========================================================================
    // WorldManager
    //=========================================================================

    const WorldManager = {
        activeWorldName: null,
        // In-memory cache of world data files. With no active world this acts
        // as a session-only scratch store, so sandbox play still works.
        _cache: {},

        // Defaults for a freshly created world, read by the creation UI so the
        // form and the auto-created world always agree.
        DEFAULT_SEED: DEFAULT_WORLD_SEED,
        DEFAULT_START_YEAR: DEFAULT_START_YEAR,
        DEFAULT_START_MONTH: DEFAULT_START_MONTH,

        isValidName(name) {
            return typeof name === "string" && /^[A-Za-z0-9 _-]{1,40}$/.test(name.trim());
        },

        // Generates a random, valid world name not colliding with an existing
        // world. Used to pre-fill the creation form so players on a controller
        // (no keyboard) can create a world without typing.
        randomWorldName() {
            const adjectives = T.list("WorldManager.randomName.adjectives");
            const nouns = T.list("WorldManager.randomName.nouns");
            const pick = arr => arr[Math.floor(Math.random() * arr.length)];
            // Prefer a short single-word name first.
            for (let tries = 0; tries < 40; tries++) {
                const name = pick(nouns);
                if (!this.worldExists(name)) return name;
            }
            // Fall back to a two-word name if single words are exhausted.
            for (let tries = 0; tries < 40; tries++) {
                const name = `${pick(adjectives)} ${pick(nouns)}`;
                if (name.length <= 40 && !this.worldExists(name)) return name;
            }
            // Fallback: guarantee uniqueness with a numeric suffix.
            let n = 1;
            let name;
            do { name = T('WorldManager.randomName.fallback', { n: n++ }); } while (this.worldExists(name));
            return name;
        },

        listWorlds() {
            return Backend.listWorlds().map(name => {
                let info = {};
                try {
                    const text = Backend.readFile(name, "world");
                    if (text) info = JSON.parse(text);
                } catch (e) { /* corrupted world.json, still list the folder */ }
                return Object.assign({ name }, info, { name });
            });
        },

        worldExists(name) {
            return Backend.worldExists(name);
        },

        createWorld(name, options = {}) {
            name = String(name).trim();
            if (!this.isValidName(name)) throw new Error("Invalid world name"); // i18n-ignore: diagnostic
            if (this.worldExists(name)) throw new Error("World already exists"); // i18n-ignore: diagnostic
            const info = {
                name: name,
                createdAt: Date.now(),
                lastPlayed: null,
                seed: options.seed !== undefined ? options.seed : DEFAULT_WORLD_SEED,
                historyYears: options.historyYears !== undefined ? options.historyYears : null,
                worldTimeMinutes: options.worldTimeMinutes || 0,
                startYear: options.startYear !== undefined ? options.startYear : DEFAULT_START_YEAR,
                startMonth: options.startMonth !== undefined ? options.startMonth : DEFAULT_START_MONTH,
                // The level every character built in this world is created at.
                // A world begun in a later year opens on monsters a level 1
                // party cannot stand in front of, so the party is not obliged
                // to start at 1. Read through WorldManager.startingLevel().
                startLevel: clampStartLevel(options.startLevel),
                // See clampPopulationMode above. Written once, at creation.
                populationMode: clampPopulationMode(options.populationMode),
                // See clampMagicalLevel above. Its own axis, also permanent.
                magicalLevel: clampMagicalLevel(options.magicalLevel),
                // Beta sprites are strictly disabled and cannot be selected.
                betaSprites: false
            };
            Backend.writeFile(name, "world", JSON.stringify(info, null, 2));
            return info;
        },

        // True once the player has a world to play in. Everything that starts or
        // continues a game reads this: with no world there is nowhere to put the
        // history, the people or the savegame, so the title screen greys those
        // options out instead of inventing a world nobody asked for.
        hasActiveWorld() {
            return !!this.activeWorldName;
        },

        deleteWorld(name) {
            const wasActive = this.activeWorldName === name;
            // When deleting the active world, fall back to the world immediately
            // before it in the list (or the new first world if it was first), so a
            // world is always active as long as one remains.
            let replacement = null;
            if (wasActive) {
                const names = Backend.listWorlds();
                const idx = names.indexOf(name);
                const remaining = names.filter(n => n !== name);
                if (remaining.length > 0) {
                    replacement = (idx > 0) ? names[idx - 1] : remaining[0];
                }
                // Deactivate first (without flushing) so the cached world data
                // doesn't get written back to disk after the folder is removed.
                this.activeWorldName = null;
                this._cache = {};
                Backend.writeActive(null);
            }
            Backend.removeWorld(name);
            if (wasActive && replacement) {
                this.setActiveWorld(replacement);
            }
        },

        // persist=false keeps the activation session-only (playtest Test world).
        setActiveWorld(name, persist = true) {
            if (this.activeWorldName && this.activeWorldName !== name) {
                this.flush();
            }
            this.activeWorldName = name || null;
            this._cache = {};
            // Another world's failures say nothing about this one's.
            this._initAttempts = {};
            if (persist) Backend.writeActive(this.activeWorldName);
            if (this.activeWorldName && isNwjs) {
                Backend.ensureDir(Backend.savesDir(this.activeWorldName));
            }
        },

        savesDirFor(name) {
            return Backend.savesDir(name);
        },

        // Reads a data file belonging to ANY world (not just the active one),
        // bypassing the cache. Used by UI screens that inspect inactive worlds.
        readWorldFile(name, fileKey) {
            const text = Backend.readFile(name, fileKey);
            if (!text) return null;
            try {
                return JsonEx.parse(text);
            } catch (e) {
                console.error(`[WorldManager] Failed to read '${fileKey}' for world '${name}'`, e);
                return null;
            }
        },

        // Writes a data file belonging to ANY world, at once rather than at the
        // next save. The mailbox is the reason it exists: a letter addressed to
        // a party in another world has to land in THAT world's folder, and that
        // world is not the one being played, so it will never be flushed from
        // here. Writing the active world's own file also refreshes the cache, so
        // a later flush cannot put the pre-write copy back over it.
        writeWorldFile(name, fileKey, data) {
            if (!name || !fileKey) return false;
            try {
                const encoded = JsonEx.stringify(data);
                Backend.writeFile(name, fileKey, JSON.stringify(JSON.parse(encoded), null, 2));
                if (name === this.activeWorldName) this._cache[fileKey] = data;
                return true;
            } catch (e) {
                console.error(`[WorldManager] Failed to write '${fileKey}' for world '${name}'`, e);
                return false;
            }
        },

        // Counts binary savegame files for the given world. Returns null when
        // the count cannot be determined (browser/localStorage backend).
        countSaves(name) {
            if (!isNwjs) return null;
            const dir = Backend.savesDir(name);
            if (!Backend._fs.existsSync(dir)) return 0;
            try {
                return Backend._fs.readdirSync(dir).filter(f => f.endsWith(".rmmzsave")).length;
            } catch (e) {
                return 0;
            }
        },

        // --- world data files -----------------------------------------------

        // Lazily loads a data file into the cache. Files are JsonEx-encoded
        // JSON so class instances (e.g. Game_Factions) survive the roundtrip.
        getFile(fileKey) {
            if (!this._cache[fileKey]) {
                let data = null;
                if (this.activeWorldName) {
                    const text = Backend.readFile(this.activeWorldName, fileKey);
                    if (text) {
                        try {
                            data = JsonEx.parse(text);
                        } catch (e) {
                            console.error(`[WorldManager] Corrupted world file '${fileKey}'`, e);
                        }
                    }
                }
                this._cache[fileKey] = data || {};
            }
            return this._cache[fileKey];
        },

        getField(fileKey, prop) {
            return this.getFile(fileKey)[prop];
        },

        setField(fileKey, prop, value) {
            this.getFile(fileKey)[prop] = value;
        },

        worldInfo() {
            return this.getFile("world");
        },

        // Every data file a world folder is made of. Published because a LAN
        // host has to pack its whole world up and hand it to the guests
        // (Multiplayer/MultiplayerSystem.js), and that list must not be a
        // second copy of this one that drifts out of date.
        dataFileKeys() {
            return DATA_FILE_KEYS.slice();
        },

        hasHistory() {
            const events = this.getField("history", "events");
            return Array.isArray(events) && events.length > 0;
        },

        // The level this world builds its characters at. Read by character
        // creation for every member it finishes; a world made before the
        // option existed answers 1, exactly as it always did.
        startingLevel() {
            return clampStartLevel(this.worldInfo().startLevel);
        },

        // Who this world is populated with (see clampPopulationMode). Asked
        // once on the creation form and never again: there is deliberately no
        // setter, since the world is populated, historied and priced from the
        // answer. A world made before the option existed answers "normal".
        populationMode() {
            if (!this.hasActiveWorld()) return DEFAULT_POPULATION_MODE;
            return clampPopulationMode(this.worldInfo().populationMode);
        },

        // Convenience readers, so no caller has to spell the mode strings.
        isChaosWorld()   { return this.populationMode() === "chaos"; },
        isGoblinWorld() { return this.populationMode() === "goblin"; },
        isMonsterWorld() { return this.populationMode() === "monster"; },
        // "death" is an empty world too (see POPULATION_MODES above), so every
        // existing isEmptyWorld() consumer treats it identically without
        // change; isDeathWorld() is only for the one thing that differs, the
        // encounter system's fauna placement.
        isEmptyWorld()   { const m = this.populationMode(); return m === "empty" || m === "death"; },
        isZombieWorld()  { return this.populationMode() === "zombie"; },
        isDeathWorld()   { return this.populationMode() === "death"; },

        POPULATION_MODES: POPULATION_MODES,

        // How much magic this world has (see clampMagicalLevel). Its own axis,
        // independent of the timeline: both are asked once and neither is ever
        // written again.
        magicalLevel() {
            if (!this.hasActiveWorld()) return DEFAULT_MAGICAL_LEVEL;
            return clampMagicalLevel(this.worldInfo().magicalLevel);
        },

        isSeveredMagic() { return this.magicalLevel() === "severed"; },
        isUnboundMagic() { return this.magicalLevel() === "unbound"; },

        MAGICAL_LEVELS: MAGICAL_LEVELS,

        // Story mode used to be authored against the canon world alone (2001,
        // an ordinary population, ordinary magic) and was refused everywhere
        // else. It now runs in any world: the year only decides where the run
        // is put down (window.StoryModeStart, in Titlescreen.js), and the
        // population and the magic never decided anything. Kept as the answer
        // every caller still asks for.
        storyModeAllowed() {
            return true;
        },

        // Beta sprites are strictly disabled across all worlds and cannot be selected.
        allowBetaSprites() { return false; },
        isBetaSpritesAllowed() { return false; },
        isBetaAllowed() { return false; },
        isBetaEnabled() { return false; },
        betaSprites() { return false; },

        // Latest date reached anywhere in this world (max of the stored world
        // clock and the in-session time variable).
        worldClockMinutes() {
            const stored = this.worldInfo().worldTimeMinutes || 0;
            let current = 0;
            if (typeof $gameVariables !== "undefined" && $gameVariables) {
                current = Number($gameVariables.value(TIME_VARIABLE_ID)) || 0;
            }
            return Math.max(stored, current);
        },

        // Writes every loaded data file to the active world folder. World data
        // can be mutated in place through the accessors, so all cached files
        // are flushed rather than tracking dirtiness.
        flush() {
            if (!this.activeWorldName) return;
            for (const fileKey of Object.keys(this._cache)) {
                try {
                    const encoded = JsonEx.stringify(this._cache[fileKey]);
                    const pretty = JSON.stringify(JSON.parse(encoded), null, 2);
                    Backend.writeFile(this.activeWorldName, fileKey, pretty);
                } catch (e) {
                    console.error(`[WorldManager] Failed to write world file '${fileKey}'`, e);
                }
            }
        },

        // --- one-time world initialization -----------------------------------

        // A world used to be little more than a folder with a name: every
        // system owning world-shared data (the history, the NPC roster and
        // where everybody lives and works, the shop rotas, the dungeon
        // layout, the politics, the epidemics burning through the continent)
        // generated its own the first time the player happened to walk into
        // it. That left a brand new world half-empty until it was explored,
        // and made the same world read differently depending on the order the
        // maps were visited.
        //
        // Each owning plugin registers its own step here; WorldManager runs
        // every step the world has not run yet, exactly once, and records
        // which ran in world.json ("initialized"). Steps carry an order
        // because the later ones read what the earlier ones wrote: the shop
        // rota draws on the NPC roster, which needs the map-group manifests,
        // which need the world seed the history run fixes.
        _initSteps: [],
        _initializing: false,
        // Failures per step for this session only. A step that keeps throwing
        // (a data file that never arrives) is given a few tries and then left
        // alone, so a broken generator cannot cost a retry on every map load.
        _initAttempts: {},
        INIT_MAX_ATTEMPTS: 3,

        registerWorldInitializer(key, order, fn) {
            if (!key || typeof fn !== "function") return;
            const step = { key, order: Number(order) || 100, fn };
            const at = this._initSteps.findIndex(s => s.key === key);
            if (at >= 0) this._initSteps[at] = step;
            else this._initSteps.push(step);
        },

        // The steps this world has already run, kept in world.json so a step
        // added later is picked up by worlds created before it existed.
        worldInitState() {
            const info = this.worldInfo();
            if (!info.initialized || typeof info.initialized !== "object") info.initialized = {};
            return info.initialized;
        },

        isWorldInitialized(key) {
            return !!this.worldInitState()[key];
        },

        // True while the world still owes at least one step, i.e. one failed
        // (a data table that had not finished loading) and is worth retrying.
        hasPendingWorldInit() {
            if (!this.activeWorldName) return false;
            const done = this.worldInitState();
            return this._initSteps.some(step =>
                !done[step.key] && (this._initAttempts[step.key] || 0) < this.INIT_MAX_ATTEMPTS);
        },

        // Runs every registered step this world still owes. Pass
        // { force: true } to rebuild a world's generated data from scratch.
        // Safe to call repeatedly: a completed step is skipped, so the normal
        // cost after the first run is nothing.
        initializeWorld(options = {}) {
            if (!this.activeWorldName || this._initializing) return false;
            if (options.force) this._initAttempts = {};
            else if (!this.hasPendingWorldInit()) return false;
            // The steps write through the $gameSystem world accessors, so the
            // game objects have to exist. Creating a world from the title
            // screen happens before any of them do; New Game builds its own
            // set from scratch afterwards, so the throwaway ones cost nothing.
            if (typeof $gameSystem === "undefined" || !$gameSystem) {
                DataManager.createGameObjects();
            }
            // The generators that simulate forward (politics, the settlement
            // web, the epidemics) read the clock, so it has to be standing at
            // the world's own starting date and not at zero. Already done when
            // the call comes from setupNewGame, and idempotent, so it costs
            // nothing there.
            this.applyPublicState();
            const beforeSwitches = ($gameSwitches._data || []).slice();
            const beforeVars = ($gameVariables._data || []).slice();
            const done = this.worldInitState();
            const steps = this._initSteps.slice().sort((a, b) => a.order - b.order);
            let ran = 0;
            this._initializing = true;
            try {
                for (const step of steps) {
                    if (done[step.key] && !options.force) continue;
                    if ((this._initAttempts[step.key] || 0) >= this.INIT_MAX_ATTEMPTS) continue;
                    this._initAttempts[step.key] = (this._initAttempts[step.key] || 0) + 1;
                    const startedAt = Date.now();
                    try {
                        step.fn();
                        done[step.key] = true;
                        ran++;
                        console.log(`[WorldManager] World '${this.activeWorldName}': initialized '${step.key}' (${Date.now() - startedAt}ms).`);
                    } catch (e) {
                        // A failed step stays unmarked, so it is retried on the
                        // next run instead of leaving the world permanently
                        // short of that data.
                        console.error(`[WorldManager] World initializer '${step.key}' failed`, e);
                    }
                }
            } finally {
                this._initializing = false;
            }
            if (ran) {
                this.captureInitializedState(beforeSwitches, beforeVars);
                this.flush();
            }
            return ran > 0;
        },

        // A step is free to raise a world switch (the dungeon step flips the
        // "dungeon generated" one) or move a world-shared variable. Those live
        // in $gameSwitches / $gameVariables, which on the world-creation path
        // are throwaway objects discarded with the scene, so the values have to
        // be copied into state.json / variables.json to survive.
        //
        // Only what the steps actually moved is copied, never the whole set:
        // the objects standing when a world is created can still be the ones a
        // previously loaded savegame left behind, and a wholesale export would
        // pour that playthrough's flags into the new world.
        captureInitializedState(beforeSwitches, beforeVars) {
            const state = this.getFile("state");
            if (!state.switches) state.switches = {};
            const switches = $gameSwitches._data || [];
            for (let id = 1; id < switches.length; id++) {
                const value = switches[id];
                if (value === beforeSwitches[id] || value === undefined || value === null) continue;
                if (this.isPrivateSwitch(id)) continue;
                state.switches[id] = value;
            }

            const vfile = this.getFile("variables");
            if (!vfile.values) vfile.values = {};
            const variables = $gameVariables._data || [];
            for (const id of this.sharedVarIds()) {
                const value = variables[id];
                if (value === beforeVars[id] || value === undefined || value === null) continue;
                vfile.values[id] = value;
            }
        },

        // --- public switches / variables -------------------------------------

        // The world's shared-variable manifest. Read from variables.json;
        // seeded from DEFAULT_SHARED_VARS the first time and persisted so old
        // worlds keep a stable set even if the default list later changes.
        sharedVarIds() {
            const vfile = this.getFile("variables");
            if (!Array.isArray(vfile.sharedVarIds)) {
                vfile.sharedVarIds = DEFAULT_SHARED_VARS.slice();
            }
            // What one playthrough is wanted for is that playthrough's own
            // business: a bounty, or the manhunt it earned, must never be
            // handed to every other savegame of the world. Enforced here
            // rather than trusted to the manifest, since a world carries its
            // own persisted copy of that list.
            for (const id of NEVER_SHARED_VARS) {
                const at = vfile.sharedVarIds.indexOf(id);
                if (at !== -1) vfile.sharedVarIds.splice(at, 1);
            }
            // One-time migration: variable 2 (max dungeon floor reached) became
            // world-shared after some worlds already had a persisted manifest,
            // so force it in rather than relying on the "seeded once" default.
            if (!vfile.sharedVarIds.includes(2)) {
                vfile.sharedVarIds.push(2);
            }
            return vfile.sharedVarIds;
        },

        isWorldSharedVariable(id) {
            return this.sharedVarIds().indexOf(Number(id)) !== -1;
        },

        // The variable the world clock is counted in. Published so nobody has
        // to hardcode 114 again: a networked session needs to know which of the
        // shared variables is the clock, because a clock is the one thing two
        // players must not both advance (Multiplayer/MultiplayerSystem.js).
        timeVariableId() {
            return TIME_VARIABLE_ID;
        },

        // Switches are world-shared by default; only WORLD_PRIVATE_SWITCHES
        // stay per-savegame.
        isPrivateSwitch(id) {
            return WORLD_PRIVATE_SWITCHES.has(Number(id));
        },

        // Variables are per-savegame by default; only ids in the manifest are
        // world-shared.
        isPrivateVariable(id) {
            return !this.isWorldSharedVariable(id);
        },

        // Copies the current public switches into state.json, the world-shared
        // variables into variables.json, and advances the monotonic world clock.
        exportPublicState() {
            const state = this.getFile("state");
            const vfile = this.getFile("variables");
            const switches = {};
            const variables = {};
            const swData = $gameSwitches._data || [];
            for (let id = 1; id < swData.length; id++) {
                if (swData[id] !== undefined && swData[id] !== null && !this.isPrivateSwitch(id)) {
                    switches[id] = swData[id];
                }
            }
            const varData = $gameVariables._data || [];
            for (const id of this.sharedVarIds()) {
                const v = varData[id];
                if (v !== undefined && v !== null) variables[id] = v;
            }
            state.switches = switches;
            vfile.values = variables;

            const info = this.worldInfo();
            const minutes = Number($gameVariables.value(TIME_VARIABLE_ID)) || 0;
            info.worldTimeMinutes = Math.max(info.worldTimeMinutes || 0, minutes);
            info.lastPlayed = Date.now();
        },

        // Applies the world's public state on top of the (private-only) game
        // switches/variables, then continues the world clock at the latest
        // date reached by any savegame of this world.
        applyPublicState() {
            const state = this.getFile("state");
            const vfile = this.getFile("variables");
            if (state.switches) {
                for (const id of Object.keys(state.switches)) {
                    const numId = Number(id);
                    if (!this.isPrivateSwitch(numId)) {
                        $gameSwitches._data[numId] = state.switches[id];
                    }
                }
            }
            // Back-compat: worlds written before the split kept shared vars in
            // state.variables. Fold any such values into variables.json once.
            if (state.variables && !vfile.values) {
                vfile.values = {};
                for (const id of this.sharedVarIds()) {
                    if (state.variables[id] !== undefined) vfile.values[id] = state.variables[id];
                }
                delete state.variables;
            }
            if (vfile.values) {
                for (const id of this.sharedVarIds()) {
                    if (vfile.values[id] !== undefined) {
                        $gameVariables._data[id] = vfile.values[id];
                    }
                }
            }
            const worldMinutes = this.worldInfo().worldTimeMinutes || 0;
            const current = Number($gameVariables.value(TIME_VARIABLE_ID)) || 0;
            if (worldMinutes > current) {
                $gameVariables._data[TIME_VARIABLE_ID] = worldMinutes;
            }
            if ($gameMap) $gameMap.requestRefresh();
        },

        // A savegame written before a switch became private never stored that
        // switch in its binary: its value only ever existed in the world's
        // state.json, which applyPublicState now refuses to hand out. Adopt the
        // world value once, for private switches the binary has nothing to say
        // about, so an existing playthrough keeps the settings it was made with.
        // From the next save on, the value travels in the binary and the world
        // copy is dropped, so this runs at most once per savegame.
        adoptLegacyPrivateSwitches() {
            const state = this.getFile("state");
            if (!state.switches) return;
            for (const id of WORLD_PRIVATE_SWITCHES) {
                // Story mode mode is the one exception: it was never turned off
                // again, so a world that once played the story mode has it stored
                // as true and every legacy savegame would adopt it. A savegame
                // that says nothing about it is not in the story mode.
                if (id === STORY_MODE_SWITCH_ID) continue;
                const stored = state.switches[id];
                if (stored === undefined) continue;
                const current = $gameSwitches._data[id];
                if (current === undefined || current === null) {
                    $gameSwitches._data[id] = stored;
                }
            }
        },

        // Old saves carry world-scoped data as own properties on $gameSystem
        // (shadowing the prototype accessors). Adopt them into the world store
        // when it is still empty, then remove them from the instance.
        migrateLegacySystemFields() {
            if (!$gameSystem) return;
            for (const fileKey of Object.keys(SYSTEM_FIELD_MAP)) {
                const fields = SYSTEM_FIELD_MAP[fileKey];
                for (const key of Object.keys(fields)) {
                    if (Object.prototype.hasOwnProperty.call($gameSystem, key)) {
                        const spec = fieldSpec(fields[key]);
                        const legacy = $gameSystem[key];
                        delete $gameSystem[key];
                        if (legacy === undefined) continue;
                        const held = this.getField(fileKey, spec.prop);
                        // A merged field takes the legacy copy in whatever the
                        // world already holds, so an older savegame adds its
                        // findings rather than standing in for them.
                        if (spec.merge) {
                            this.setField(fileKey, spec.prop, spec.merge(held, legacy));
                        } else if (held === undefined) {
                            this.setField(fileKey, spec.prop, legacy);
                        }
                    }
                }
            }
        }
    };

    window.WorldManager = WorldManager;

    //=========================================================================
    // ChaosWorld: the one answer to "is this the world of chaos, and what did
    // it roll for X". Every consumer asks here rather than keeping its own
    // idea of the mode or its own RNG, so a given world rolls the same chaos
    // twice: the stream is seeded from the world seed and a caller's key, and
    // never from Math.random.
    //=========================================================================

    function chaosHash(str) {
        let h = 2166136261 >>> 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    const ChaosWorld = {
        // The mode itself. Kept as one call so a caller never spells "chaos".
        active() {
            return !!(window.WorldManager && WorldManager.isChaosWorld && WorldManager.isChaosWorld());
        },

        // The world's own seed, so two savegames of one world agree.
        seed() {
            if (window.NPCShared && typeof window.NPCShared.worldSeed === "function") {
                return window.NPCShared.worldSeed() >>> 0;
            }
            if (window.HistoryManager && window.HistoryManager.getSeed) return window.HistoryManager.getSeed() >>> 0;
            return chaosHash(DEFAULT_WORLD_SEED);
        },

        // A deterministic 0..1 stream for one key: the same key always gives
        // the same run of numbers in the same world.
        rng(key) {
            let state = (this.seed() ^ chaosHash(key)) >>> 0 || 1;
            return function () {
                state ^= state << 13; state >>>= 0;
                state ^= state >> 17;
                state ^= state << 5; state >>>= 0;
                return state / 4294967296;
            };
        },

        // One roll for one key, without holding on to a stream.
        roll(key) { return this.rng(key)(); },
        int(key, min, max) { return min + Math.floor(this.roll(key) * (max - min + 1)); },
        chance(key, p) { return this.roll(key) < p; },
        pick(key, list) {
            if (!list || !list.length) return null;
            return list[Math.floor(this.roll(key) * list.length) % list.length];
        },

        // How far a chaos price wanders from the one printed in the database:
        // a quarter of it to four times it, rolled per key and never per call.
        priceFactor(key) {
            const r = this.roll("price:" + key);
            return 0.25 * Math.pow(16, r);
        },

        // A chaos price for a listed one. A free thing stays free.
        price(key, base) {
            const n = Number(base) || 0;
            if (n <= 0) return n;
            return Math.max(1, Math.round(n * this.priceFactor(key)));
        },
    };

    window.ChaosWorld = ChaosWorld;

    //=========================================================================
    // Game_System accessors: world-scoped fields live in the world store
    //=========================================================================

    for (const fileKey of Object.keys(SYSTEM_FIELD_MAP)) {
        const fields = SYSTEM_FIELD_MAP[fileKey];
        for (const key of Object.keys(fields)) {
            const spec = fieldSpec(fields[key]);
            const prop = spec.prop;
            const merge = spec.merge;
            Object.defineProperty(Game_System.prototype, key, {
                get() { return WorldManager.getField(fileKey, prop); },
                set(value) {
                    const held = WorldManager.getField(fileKey, prop);
                    WorldManager.setField(fileKey, prop, merge ? merge(held, value) : value);
                },
                configurable: true
            });
        }
    }

    //=========================================================================
    // StorageManager: redirect savegames into the active world folder
    //=========================================================================

    const _StorageManager_filePath = StorageManager.filePath;
    StorageManager.filePath = function (saveName) {
        if (isNwjs && WorldManager.activeWorldName && !GLOBAL_SAVE_NAMES.includes(saveName)) {
            const dir = Backend.savesDir(WorldManager.activeWorldName);
            Backend.ensureDir(dir);
            return Backend._path.join(dir, saveName + ".rmmzsave");
        }
        return _StorageManager_filePath.call(this, saveName);
    };

    const _StorageManager_forageKey = StorageManager.forageKey;
    StorageManager.forageKey = function (saveName) {
        if (!isNwjs && WorldManager.activeWorldName && !GLOBAL_SAVE_NAMES.includes(saveName)) {
            const gameId = $dataSystem.advanced.gameId;
            return "rmmzsave." + gameId + ".world." + WorldManager.activeWorldName + "." + saveName;
        }
        return _StorageManager_forageKey.call(this, saveName);
    };

    //=========================================================================
    // DataManager: keep binaries minimal, share public state, flush world data
    //=========================================================================

    function makePrivateOnly(source, klass, isPrivate) {
        const stripped = new klass();
        const data = source._data || [];
        for (let id = 1; id < data.length; id++) {
            if (isPrivate(id) && data[id] !== undefined && data[id] !== null) {
                stripped._data[id] = data[id];
            }
        }
        return stripped;
    }

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function () {
        const contents = _DataManager_makeSaveContents.call(this);
        // Without an active world there is no state.json to hold the public
        // values, so the full switch/variable data must stay in the binary.
        if (WorldManager.activeWorldName) {
            WorldManager.exportPublicState();
            contents.switches = makePrivateOnly($gameSwitches, Game_Switches,
                id => WorldManager.isPrivateSwitch(id));
            contents.variables = makePrivateOnly($gameVariables, Game_Variables,
                id => WorldManager.isPrivateVariable(id));
            contents.worldName = WorldManager.activeWorldName;
            // Marks a save whose binary already carries the private switches,
            // so loading it skips adoptLegacyPrivateSwitches.
            contents.privateSwitchSchema = 1;
        }
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function (contents) {
        _DataManager_extractSaveContents.call(this, contents);
        WorldManager.migrateLegacySystemFields();
        if (WorldManager.activeWorldName) {
            WorldManager.applyPublicState();
            if (!contents.privateSwitchSchema) {
                WorldManager.adoptLegacyPrivateSwitches();
            }
        }
    };

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        // A new game in an existing world inherits the world's public state
        // and continues at the world clock.
        if (WorldManager.activeWorldName) {
            WorldManager.applyPublicState();
            // A world begun after 21 December 2012 begins after the impact:
            // there is no Earth to walk out onto, and everything that would
            // have sent the party there sends them to the Omega Tower instead
            // (WorldMapTransfer.earthLost). Raised here rather than waiting on
            // the star map, so the very first transfer already knows.
            if (($gameVariables.value(TIME_VARIABLE_ID) || 0) >= impactMinute()) {
                $gameSwitches.setValue(SW_EARTH_LOST, true);
            }
            // Generate whatever this world still owes (see
            // registerWorldInitializer). This is where the world created for
            // an empty world folder at boot gets populated: it is made before
            // the database is even loaded, so the work waits for the first
            // game started in it. A world created from the world screen has
            // already been through this and skips every step.
            WorldManager.initializeWorld();
        }
    };

    //=========================================================================
    // Retry: a step can fail because a table it reads had not finished loading
    // when the new game started (the NPC society tables fetch their i18n half
    // asynchronously). Anything still owed is attempted again on map load,
    // where every data source is certainly up. Costs one boolean per load once
    // the world is complete, which is the normal case.
    //=========================================================================

    const _Scene_Map_onMapLoaded_worldInit = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded_worldInit.call(this);
        if (WorldManager.hasPendingWorldInit()) WorldManager.initializeWorld();
    };

    // Every savegame write also persists the world data files.
    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function (savefileId) {
        return _DataManager_saveGame.call(this, savefileId).then(result => {
            WorldManager.flush();
            return result;
        });
    };

    //=========================================================================
    // Boot: resolve the active world. The last active world wins; failing that
    // any existing world is adopted. An empty world folder leaves no world
    // active: none is invented here, the player makes one from the Worlds
    // screen. Playtest runs the same way, it just does not persist the choice
    // into active.json.
    //=========================================================================

    (function resolveActiveWorld() {
        const persist = !Utils.isOptionValid("test");

        const active = Backend.readActive();
        if (active && WorldManager.worldExists(active)) {
            WorldManager.setActiveWorld(active, false);
            console.log(`[WorldManager] Active world: ${active}`);
            return;
        }

        const existing = Backend.listWorlds();
        if (existing.length > 0) {
            WorldManager.setActiveWorld(existing[0], persist);
            console.log(`[WorldManager] Active world: ${existing[0]}`);
            return;
        }

        console.log("[WorldManager] No world yet: waiting for one to be created.");
    })();
})();
