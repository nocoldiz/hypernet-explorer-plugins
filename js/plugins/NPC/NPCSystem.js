 /*
 * @target MZ
 * @plugindesc Enhanced Autonomous NPC System v2.1.0 - TreasureRoom Integration (Refactored)
 * @author Omni-Lex
 * @help
 * ============================================================================
 * Enhanced Autonomous NPC System - TreasureRoom Integration
 * ============================================================================
 * (Help text remains identical to original)
 * ...
 *
 * Modules: this file keeps the configuration and constants, the utilities,
 * map and data management, the group registry (WorldgenStore, NPCPoolStore,
 * GroupRegistry), the VisitorInteract plugin command and the family
 * namespace (NPCSystem._internal). The rest lives in NPCSystem_Spawn,
 * _Procedural, _RoadTravellers, _Residents, _StreetCrime, _Movement,
 * _Controller, _Hooks (the engine hooks and the public API), _Zombies,
 * _Horde, _Skirmish and _Downed (last), listed in js/plugins.js right after
 * this file in that order.
 */

(() => {
  "use strict";

  // ==========================================================================
  // CONFIGURATION & CONSTANTS
  // ==========================================================================
  const pluginName = "NPCSystem";
  const parameters = PluginManager.parameters(pluginName);

  const Config = {
    debugMode: parameters["debugMode"] === "true",
    playerAwarenessRange: Number(parameters["playerAwarenessRange"]) || 4,

    Zones: {
      SOCIAL: 101,
      // Seat tile for the PublicTransport group (bus/tram/train interiors),
      // see SpawnManager.randomizePublicTransportMap.
      TRANSPORT_SEAT: 102,
      // The same region anywhere else: a bench or a chair NPCs sit on and
      // rest, see NPCSeats.
      SEAT: 102,
    },

    // Interiors of the party's own vehicles (camper, taxi, car, low-orbit
    // ship, the 3D camper). They still carry <MapGroup: PublicTransport> so
    // their authored events keep feeding the world pool, but nobody is ever
    // spawned inside them: the only people riding the player's vehicle are the
    // party. The PlayerNN slots on those maps stay untouched, they are the
    // MultiplayerSystem avatar slots and carry no graphic of their own.
    NPC_FREE_MAP_IDS: [327, 720, 721, 1094, 1412],

    isNPCFreeMap(mapId) {
      return this.NPC_FREE_MAP_IDS.includes(mapId);
    },

    // Maps that belong to the parties of this world and nobody else: the
    // Stairs Hall. No roster, no crowd, no police. The only people met there
    // are the world's idle companions (PartyLodging, NPCSystemParty.js) and
    // the parties other savegames saved on it (VisitingParties).
    PARTY_ONLY_MAP_IDS: [635],

    isPartyOnlyMap(mapId) {
      return this.PARTY_ONLY_MAP_IDS.includes(mapId);
    },

    // An empty world (WorldManager.populationMode) has nobody left in it: no
    // roaming crowd, no <AI> wanderers, no local residents and nobody behind a
    // shop counter, on any map. Read rather than cached, since the answer
    // belongs to the world and a session can change worlds.
    isEmptyWorld() {
      const WMo = window.NPCShared?.WorldModes;
      if (WMo && !WMo.simulatesPeople()) return true;
      const WM = window.WorldManager;
      return !!(WM && typeof WM.isEmptyWorld === "function" && WM.isEmptyWorld());
    },

    // The dead got up (WorldManager.populationMode "zombie"). Nine people in
    // ten never made it and are walking their old streets wearing one of the
    // Zombies/ sheets; the tenth is a survivor and is staffed exactly as
    // always. Walking into one of the dead starts a fight rather than a
    // conversation (see the zombie apocalypse section below).
    isZombieWorld() {
      const WM = window.WorldManager;
      return !!(WM && typeof WM.isZombieWorld === "function" && WM.isZombieWorld());
    },
    // Nearly everybody. A survivor is meant to be an event, not a face in the
    // crowd: with the creature roll taking most of what is left (NPCCreature
    // CREATURE_CHANCE_ZOMBIE), this puts living people well under one slot in
    // a hundred, which is what a zombie apocalypse is supposed to feel like.
    ZOMBIE_SHEET_CHANCE: 0.99,

    // Ground the Goblin Horde holds. Not a population mode: a PROCEDURAL
    // square standing in one of the Horde's nations is goblin country whatever
    // world this is, and three of the four people in its towns, its villages
    // and the houses opened out of them are goblins (an authored town counts
    // through its group's country). The catalogue owns both the
    // question and the wardrobe (SpriteCatalog.isGoblinHordeGround /
    // goblinKeys), so a face dealt by the population pass and a slot re-skinned
    // here are goblins by exactly the same rule.
    isGoblinHordeGround(mapId) {
      const SC = window.SpriteCatalog;
      return !!(SC && typeof SC.isGoblinHordeGround === "function" && SC.isGoblinHordeGround(mapId));
    },
    GOBLIN_SHEET_CHANCE: 0.75,

    treasureRoomParentIds: [133],
    get housePoolParentIds() {
      return window.ProceduralHouseSystem ? window.ProceduralHouseSystem.housePoolParentIds : [1132, 1133, 1134, 1135, 1136, 1137, 1394, 1156, 1157];
    },

    // MapGroups are no longer hardcoded here, they're discovered at runtime
    // straight from each map's <MapGroup: Name> / <MainMap> note tags (see
    // GroupRegistry below). Defining a new group is now just a matter of
    // tagging the relevant maps' notes, no code changes needed.
    //
    // "OmegaTower" keeps its historical role as the *global* group: it draws
    // NPCs from (and lends NPCs to) every other group's pool, rather than
    // staying confined to its own member maps.
    GLOBAL_GROUP_NAME: "OmegaTower",

    // Other groups that behave like the global group for pooling purposes
    // (draw NPCs from, and lend NPCs to, every other group) but use their own
    // placement logic instead of OmegaTower's "spread across every passable
    // tile" style. PublicTransport (buses/trams/trains) seats riders on
    // <TRANSPORT_SEAT> region tiles instead, see randomizePublicTransportMap.
    SEATED_GLOBAL_GROUPS: ["PublicTransport"],

    // True for any group that draws its NPC pool from the whole world rather
    // than staying confined to its own member maps (OmegaTower and any of the
    // seated variants, e.g. PublicTransport).
    //
    // OmegaTower used to be one too, drawing on every town's pool. With every
    // group populated by its own residents it is an ordinary town, and only
    // the seated groups still take their riders from the whole world.
    isGlobalGroup(groupName) {
      return this.SEATED_GLOBAL_GROUPS.includes(groupName);
    },

    // True for a per-coordinate settlement group ("Proc:x,y") minted by the
    // map generator as the player reaches those world coordinates, as opposed
    // to a hand-made group tagged on authored maps. Procedural settlements are
    // world data, so they are skipped by anything working off the shared
    // WorldGen manifests (see initializeWorldgenManifests). A floor of the
    // Omega Tower ("Tower:+12", "Tower:-7") is the same kind of thing: its
    // people are minted on map 636 as the party reaches it, never dealt as
    // street residents by the hourly refresh.
    isProceduralGroup(groupName) {
      return typeof groupName === "string" &&
        (groupName.startsWith("Proc:") || groupName.startsWith("Tower:"));  // i18n-ignore: settlement key prefixes
    },

    // Fraction of PublicTransport seats left empty on each spawn, so a bus/
    // tram never reads as unrealistically packed.
    TRANSPORT_SEAT_EMPTY_RATIO: 0.3,

    // Omega City (map 631) is the largest city in the game and the one
    // deliberate exception to the spawn rules above: instead of the global
    // group's density-capped crowd it fields a fixed fifty citizens, half of
    // them drawn from every authored map pool in the world and half generated
    // fresh as procedural citizens of the city, and every one of them is given
    // one of the city's own front doors as an address. See
    // SpawnManager.randomizeOmegaCityMap.
    OMEGA_CITY_MAP_ID: 631,
    OMEGA_CITY_NPC_COUNT: 50,
    // Share of that headcount generated procedurally rather than transplanted
    // from an authored template.
    OMEGA_CITY_PROCEDURAL_RATIO: 0.5,

    // Bologna (BolognaMapSystem.js) is a real city cut into a grid of OSM
    // cells that all share map id 353, so it cannot live in the static map
    // index any more than the procedural map can, and its cells carry no
    // authored events at all: the crowd is spawned onto slots BolognaMapSystem
    // injects. It is populated Omega City style, half the world's own faces
    // (any authored NPC from any map pool, alien maps included) and half
    // Bolognesi born in the city, all of them citizens of Italy and so of the
    // Holy Vatican Empire that controls it (Countries.json), which is what
    // NPCPolitics reads off the group's nationId.
    BOLOGNA_MAP_ID: 353,
    BOLOGNA_GROUP_NAME: "Bologna", // i18n-ignore: Destinations.json key
    BOLOGNA_NATION: "Italy",       // i18n-ignore: Countries.json key
    BOLOGNA_NPC_COUNT: 40,
    // Every Bolognese is born in the city: there is no world pool to borrow
    // faces from any more (see the RESIDENT REGISTRY).
    BOLOGNA_PROCEDURAL_RATIO: 1,

    // Fixed seed for placeholder-name ("NPC") Markov generation, deliberately
    // independent of the world's history seed so generated names stay stable
    // even across different history seeds/world generations.
    NPC_NAME_SEED: 70737501,

    // Real-world window inside which re-entering a map is treated as a "quick
    // bounce", the roster there (and the rosters of other recently-visited
    // maps) is kept exactly as-is rather than reshuffled or drifted.
    GROUP_RECENT_VISIT_MS: 60000,
    // In-game-minute jump (in a single tick) large enough that it can only be
    // produced by sleeping/fast-travel/time-skip commands, never by walking
    // (which advances at most 1 minute per 10 steps), our signal that "time
    // was skipped" and group hangout assignments should be redetermined.
    GROUP_TIME_SKIP_MINUTES: 60,

    // ── The street crowd of a city or village ───────────────────────────────
    // One rule for a procedural settlement square (setupProceduralMapNPCs)
    // and the exterior of a hand-made town (SpawnManager.settlementCrowdCap):
    // a seeded 30% to 70% of the map's NPC slots (90% while a public gathering
    // empties the houses), of which only SETTLEMENT_NPC_SHARE is drawn.
    SETTLEMENT_NPC_SHARE: 0.5,
    isSettlementBiome(biome) {
      return /city|village|burg/i.test(String(biome || ""));
    },
    settlementCrowdCount(slots, rng, gathering) {
      if (!(slots > 0)) return 0;
      const share = gathering ? 0.9 : (0.3 + rng * 0.4);
      return Math.max(1, Math.ceil(slots * share * Config.SETTLEMENT_NPC_SHARE));
    },

    // ── Procedural residents (see the RESIDENT REGISTRY section) ─────────────
    // Every map group is populated by the world seed: one household behind
    // each front door and floor, then street-folk topped up per map to this
    // density, then enough extra hands to staff every job and counter shift.
    // `area` is the map's tile count per head, `min`/`max` clamp the result.
    RESIDENT_DENSITY: {
      Exterior: { area: 250, min: 4, max: 20 },
      Interior: { area: 150, min: 1, max: 5 },
      None:     { area: 200, min: 2, max: 8 },
      mainMultiplier: 1.5,
      abandonedMultiplier: 0.5,
    },
    // Share of a group's adults who hold a job or a counter shift, the rest
    // are free all day. Used to decide how many extra hands a town needs.
    RESIDENT_WORKFORCE_SHARE: 0.8,
    // The events of data/Map574.json (System Maps) the procedural people are
    // cloned from (tools/build/gen_npc_residents.js copies them into
    // NPCResidents.json).
    RESIDENT_TEMPLATE_MAP_ID: 574,
    RESIDENT_TEMPLATE_EVENTS: { citizen: 2, shop: 3, officer: 22 },
    // The Police Officer class every officer is dealt.
    OFFICER_CLASS_ID: 44,
    // One extra officer on patrol for every this much wanted heat
    // (CrimeSystem, 0 to 100), never more than POLICE_HEAT_MAX_EXTRA.
    POLICE_HEAT_STEP: 20,
    POLICE_HEAT_MAX_EXTRA: 5,
    // Rough sleepers: a small share of every town has no door of its own and
    // spends the night on the street it lives on (ResidentRegistry), and the
    // same share of a procedural square's people (dressProcCitizen).
    RESIDENT_HOMELESS_SHARE: 0.06,
    PROC_HOMELESS_CHANCE: 0.05,
    // The common event every authored bed runs ("Sleep in bed"). A bed is
    // that, or an event with "Bed" in its name (NPCBeds).
    BED_COMMON_EVENT_ID: 31,

    // Chance, per hour and per map, that an authored Local NPC is also met
    // away from home: elsewhere in their group, in another group, on a bus.
    LOCAL_VISIT_CHANCE: 0.12,

    NAME_DATABASES: ["entomologist", "perifery", "temporal_drift", "petro_vessel", "wannabe_wizard", "inmate", "girlboss", "fortune_teller", "rapper", "cleaner", "priest", "guide", "farmer", "taxi", "blacksmith", "steelworker", "artist", "hypernet_worker", "politician", "elven_ambassador", "dungeon_explorer", "mailman", "communist_preacher", "shy_vampire", "decadent_noble", "goth", "thug", "scribe", "zombie_alien", "commuter", "fae_queen", "caveman", "fisherman", "semiwild_goblin", "botique", "icecream"]
  };

  // Checks if a sprite sheet is marked as beta. Beta sprites are strictly disabled
  // for NPCs (kept out of all NPC character pools, random generation, templates, etc.).
  function isBetaSprite(key) {
    if (!key) return false;
    if (window.SpriteCatalog?.isBeta) {
      return window.SpriteCatalog.isBeta(key);
    }
    const entry = window.WorldGen?.NPCs?.[key];
    return !!(entry && entry.beta === true);
  }

  // A dossier character's own face. It belongs to that one person, so nobody in
  // the crowd is ever dealt it (see SpriteCatalog.isVip).
  function isVipSprite(key) {
    if (window.SpriteCatalog?.isVip) return window.SpriteCatalog.isVip(key);
    const entry = window.WorldGen?.NPCs?.[key];
    return !!(entry && entry.vip === true);
  }

  // Character pool built from NPCs.json (npc:true entries), replaces the old hardcoded
  // CHARACTER_GRAPHICS + SKAB_CHARACTER_GRAPHICS arrays.
  // DataService loads window.WorldGen.NPCs synchronously before any plugin IIFE runs.
  // Beta sheets are never in the pool, so the memo lives in SpriteCatalog
  // rather than here: activating a different world must not hand it the
  // previous world's pool.
  function buildNPCCharacterPool() {
    if (window.SpriteCatalog?.npcKeys) {
      return window.SpriteCatalog.npcKeys().filter(k => !isBetaSprite(k) && !isVipSprite(k));
    }
    const npcData = window.WorldGen?.NPCs;
    if (!npcData) return [];
    return Object.keys(npcData).filter((k) => {
      const e = npcData[k];
      return !!(e && e.npc === true && e.beta !== true && e.vip !== true && e.aliens !== true && e.creature !== true && e.animal !== true);
    });
  }

  // One face off a single seeded float. The alien sheets are never in the pool
  // above: the catalogue deals them on a share of the same draw, and that share
  // is decided by where the pick is being made (a street, a train carriage, a
  // landing site on another world), so this is how a citizen's sprite is
  // chosen everywhere rather than indexing the pool by hand.
  function pickNPCCharacter(r, pool) {
    if (window.SpriteCatalog?.pickNpcKey) {
      const key = window.SpriteCatalog.pickNpcKey(r);
      if (key && !isBetaSprite(key) && !isVipSprite(key)) return key;
    }
    const list = (pool || buildNPCCharacterPool()).filter(k => !isBetaSprite(k) && !isVipSprite(k));
    return list.length ? list[Math.floor(r * list.length)] : null;
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================
  // The same four as direction numbers on their own, for the many read-only
  // walks over them. Shared so a tile check inside a flood fill does not
  // allocate a fresh four-element array every tile.
  const ORTHO_DIRS = [2, 4, 6, 8];

  // The four orthogonal steps, in RMMZ direction numbers. Module scope so the
  // pathfinder's inner loop reads them rather than rebuilding them.
  const NEIGHBOR_DX  = [0, 0, -1, 1];
  const NEIGHBOR_DY  = [-1, 1, 0, 0];
  const NEIGHBOR_DIR = [8, 2, 4, 6];

  const Utils = {
    debug: (message) => {
      if (Config.debugMode) console.log(`[NPC System] ${message}`);
    },
    distance: (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y),
    // The same measure taken on loose numbers. findPath's heuristic is
    // evaluated once per node it opens - up to two thousand times inside a
    // single pathfind - and the object form allocated two throwaway points
    // every one of those.
    manhattan: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
    euclideanDistance: (a, b) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    },
    randomElement: (array) => array[Math.floor(Math.random() * array.length)],
    randBetween: (min, max) => min + Math.random() * (max - min),
    // Stable string hash (delegates to NPCShared so it matches the seeds used
    // by the simulation core; falls back to a small inline hash if unavailable).
    nameHash: (str) => {
      if (window.NPCShared?.nameHash) return window.NPCShared.nameHash(str);
      let h = 0;
      const s = str || "";
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return h;
    },
    // Stateless (seed -> float in [0,1)) draw used for world-persistent NPC
    // identity (name/sprite picks). Delegates to NPCShared.Rng (xorshift32) for
    // a well-distributed avalanche instead of the old weak Math.sin(seed)*10000
    // hash. Falls back to an inline xorshift step if NPCShared is unavailable.
    seededRandom: (seed) => {
      const s = (seed >>> 0) || 1;
      if (window.NPCShared?.Rng) return new window.NPCShared.Rng(s).next();
      let x = s;
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5;  x >>>= 0;
      return x / 4294967296;
    },
    // Unbiased Fisher-Yates shuffle (returns a new array). Replaces the biased
    // `sort(() => Math.random() - 0.5)` idiom warned about in getSpreadSpawnTiles.
    shuffle: (array) => {
      const a = array.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    },
    // Matches "AI" as its own word (e.g. "AI NPC-61 Local", "NPC-62 AI 0"),
    // a plain substring check also fires on unrelated notes like "<link:paint1>".
    hasAITag: (note) => /\bai\b/i.test(note || ""),
    // "NPC" is the identity tag: it says this event is a person the simulation
    // owns (profile, schedule, Empathize, rosters). It does NOT make them walk:
    // an NPC only moves under its own steam when the note also carries "AI"
    // (see setupNPCControllers and SpawnManager.injectBrain). Matches the bare
    // word and the "NPC-<classId>" form alike.
    hasNPCTag: (note) => /\bnpc\b/i.test(note || ""),
    // "Player1", "Player2", ... up to however many the map's author drew: the
    // maps carry a different number of them (the newer ones have a Player9 the
    // older ones do not), so the slots are always matched by shape, never by a
    // list of names. MultiplayerSystem owns the pattern when it is loaded.
    isPlayerSlotName: (name) => (window.MultiplayerPlayerSlotRe || /^Player\d+$/).test(name || ""), // i18n-ignore: event names matched at runtime

    // The one answer to "is this event a person?". "AI" and "Local" still count
    // as identity tags of their own so maps authored before the "NPC" tag
    // existed keep their crowd.
    isNPCEvent: (note) => Utils.hasNPCTag(note) || Utils.hasAITag(note) || Utils.hasLocalTag(note),
    // "Local" NPCs are anchored to the map they're defined on (always spawn
    // there) but their template can still travel, see buildNPCPool.
    hasLocalTag: (note) => /local/i.test(note || ""),
    // "Shop" marks a counter event with no graphic of its own, it's covered
    // in shifts by NPC personas drawn from the map group (see ShopShiftManager
    // in NPCSimulationCore.js). Matches as a standalone word, mirroring
    // hasAITag/hasLocalTag's convention (no angle brackets).
    hasShopTag: (note) => /\bshop\b/i.test(note || ""),
    // "Story" marks a written character rather than a citizen of the crowd:
    // somebody the plot needs to still be standing, unharmed and uninfected,
    // on the map they were authored on. Everything that follows from the tag:
    //   - they never travel. Their template is kept out of the spawn pools, so
    //     no other map ever deals them into its roster (see getNPCPool), and
    //     the hourly turnover leaves them where they are.
    //   - they are on their map at every hour, and survive the passes that
    //     empty a map of its crowd (an empty world, a zombie world).
    //   - <Shop> + <Story> is one person, not a rota: that till is theirs at
    //     every hour, exactly as an author-drawn shopkeeper's is (see
    //     ShopShiftManager.isShopEvent in NPCSimulationCore.js).
    //   - the Empathize panel will not let the party fight them or give them
    //     a disease (see NPCEmpathizeUI's action list).
    // They still live a life: unless the event's own movement is Fixed they
    // get a controller like any other NPC, so they roam their map and meet
    // their needs (see setupNPCControllers).
    hasStoryTag: (note) => /\bstory\b/i.test(note || ""),
    // True when the map author drew a face on the event themselves. A Shop
    // counter that has one is NOT part of the shift rota: the person drawn on
    // it owns that till and is always found there (see ShopShiftManager
    // .isShopEvent). Only a character sheet counts, a tile graphic is set
    // dressing (a stall, a crate) and leaves the counter open to the rota.
    hasOwnGraphic: (eventData) => (eventData?.pages || []).some(p => !!p?.image?.characterName),
    // "Hidden" NPCs exist fully in the simulation (society, schedule, dialogue)
    // but never show a sprite on the map, see SpawnManager.transplantData and
    // ShopShiftManager._candidates (NPCSimulationCore.js).
    hasHiddenTag: (note) => /\bhidden\b/i.test(note || ""),
    // True if a sprite sheet is marked as a beta sheet.
    isBetaSprite: (key) => isBetaSprite(key),
    // <ShopName: Ticketman> can live in the event's note or in any comment
    // command (codes 108/408) on any page, used to label the persona's
    // schedule entry ("working as Ticketman") instead of the generic
    // shopkeeper title. Accepts raw event data (not a Game_Event).
    extractShopName: (eventData) => {
      if (!eventData) return null;
      const re = /<ShopName:\s*(.+?)>/i;
      let m = (eventData.note || "").match(re);
      if (m) return m[1].trim();
      for (const page of (eventData.pages || [])) {
        for (const cmd of (page?.list || [])) {
          if (cmd.code !== 108 && cmd.code !== 408) continue;
          m = String(cmd.parameters?.[0] || "").match(re);
          if (m) return m[1].trim();
        }
      }
      return null;
    },
    // A door into a shop is often named "Shop" too, but it is an entrance, not
    // a till: forcing it to character priority turns a Player Touch door into
    // a wall that fires again on every bump. Any event whose pages run a
    // ProceduralHouseSystem command (visitShop, visitHouse, ...) is a door.
    isAnyShopEvent: (ev) => {
      const data = ev && ev.event ? ev.event() : ev;
      if (!data) return false;
      if (!Utils.hasShopTag(data.note) && !/^shop$/i.test(data.name || "")) return false;
      return !Utils.isBuildingDoorEvent(data);
    },
    isBuildingDoorEvent: (eventData) => (eventData?.pages || []).some(p =>
      (p?.list || []).some(c => c.code === 357 && String(c.parameters?.[0] || "").includes("ProceduralHouseSystem"))),
    // Returns the direction to face if an adjacent tile has the counter flag, else null.
    // Checks Down (2), Left (4), Right (6), Up (8) in order.
    counterFacingDir: (event) => {
      if (!event || !$gameMap || typeof $gameMap.isCounter !== "function") return null;
      const x = typeof event.x === "number" ? event.x : (typeof event._x === "number" ? event._x : null);
      const y = typeof event.y === "number" ? event.y : (typeof event._y === "number" ? event._y : null);
      if (x == null || y == null) return null;
      const isValid = typeof $gameMap.isValid === "function" ? (tx, ty) => $gameMap.isValid(tx, ty) : () => true;
      if (isValid(x, y + 1) && $gameMap.isCounter(x, y + 1)) return 2;
      if (isValid(x - 1, y) && $gameMap.isCounter(x - 1, y)) return 4;
      if (isValid(x + 1, y) && $gameMap.isCounter(x + 1, y)) return 6;
      if (isValid(x, y - 1) && $gameMap.isCounter(x, y - 1)) return 8;
      return null;
    },
    // True when an authored map event may be driven around the map as an NPC.
    // Two things disqualify one whatever its note says:
    //   - it carries no character sheet on any page. A graphic-less event is a
    //     trigger, a marker or a spawn slot, never a person, and giving one a
    //     controller leaves an invisible body walking the map and blocking
    //     tiles. The <Shop> counters are the single exception: they have no
    //     graphic of their own precisely because a rota persona is written onto
    //     them (see ShopShiftManager, NPCSimulationCore.js).
    //   - its self-switch A is ON, i.e. it is a recruited NPC already hidden
    //     behind its blank page (see NPCSystemParty.joinParty), so it belongs
    //     to the party and must not be animated as a citizen as well.
    // Procedural NPC slots (map 636) are authored graphic-less on purpose and
    // are never asked this question: they are handled by ProceduralManager,
    // which paints a face on before wiring up a controller.
    isControllableEvent: (ev) => {
      const data = ev && ev.event ? ev.event() : null;
      if (!data) return false;
      if ($gameSelfSwitches?.value([$gameMap.mapId(), ev.eventId(), 'A'])) return false;
      return Utils.hasOwnGraphic(data) || Utils.hasShopTag(data.note);
    },
    isExitEvent: (name) => name.startsWith("House") || name.startsWith("Transfer") || name.startsWith("Door ("), // i18n-ignore: event names matched at runtime
    // An interactable door an NPC walks *through* (opens it, then keeps heading
    // for its objective), as opposed to a "Door (...)" map-exit (handled by
    // isExitEvent). Matches any event whose name contains the word "door".
    isWalkThroughDoor: (name) => !!name && name.toLowerCase().includes("door") && !name.startsWith("Door ("), // i18n-ignore: event names matched at runtime
    // Terrain an NPC must never stand on (water tag 3, tag 7). Delegates to
    // NPCShared so spawning, pathing and yielding all block the same tags,
    // with the list inlined as a fallback if NPCShared has not evaluated yet.
    isBlockedTerrain: (x, y) => {
      if (window.NPCShared?.isBlockedTerrain) return window.NPCShared.isBlockedTerrain(x, y);
      const tag = $gameMap.terrainTag(x, y);
      return tag === 3 || tag === 7;
    },
    isValidTileType: (x, y) => {
      if (!$dataMap) return false;
      const tileId = $gameMap.tileId(x, y, 0);
      return (tileId >= 1536 && tileId < 1664) || (tileId >= 2048 && tileId < 2816) || (tileId >= 2816 && tileId < 4352);
    },
    // A single passable tile can still be a one-tile-wide corridor; spawning an
    // NPC there blocks it. Require a free (passable in every direction AND
    // unoccupied by events) 2x2 block anchored at (x,y) so NPCs only spawn
    // where they (and the player) can still move around them (#21).
    has2x2FreeArea: (x, y) => {
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          const tx = x + dx, ty = y + dy;
          if (tx >= $gameMap.width() || ty >= $gameMap.height()) return false;
          if (!ORTHO_DIRS.every(dir => $gameMap.isPassable(tx, ty, dir))) return false;
          if ($gameMap.eventsXy(tx, ty).length > 0) return false;
        }
      }
      return true;
    }
  };

  // ==========================================================================
  // MAP & DATA MANAGEMENT
  // ==========================================================================
  const MapManager = {
    getMapName: (mapId) => ($dataMapInfos && $dataMapInfos[mapId]) ? $dataMapInfos[mapId].name : T('NPCSystem.mapFallback', { id: mapId }),
    isMapChild: (mapId, parentIds) => {
      if (!mapId || typeof mapId !== "number" || !$dataMapInfos || !$dataMapInfos[mapId]) return false;
      return parentIds.includes($dataMapInfos[mapId].parentId);
    },
    isTreasureRoom: (mapId) => MapManager.isMapChild(mapId, Config.treasureRoomParentIds),
    isHouseMap: (mapId) => MapManager.isMapChild(mapId, Config.housePoolParentIds),

    // <LocalsOnly> in a map's note: this map is peopled by its own map group
    // and by nobody else. Read off the live $dataMap when it is the map the
    // party is standing on, off the map file otherwise, so the answer is the
    // same whichever side asks it.
    isLocalsOnlyMap: (mapId) => {
      if (!mapId) return false;
      const note = (($dataMap && $dataMap.id === mapId)
        ? $dataMap.note
        : MapManager.loadMapData(mapId)?.note) || "";
      return /<LocalsOnly>/i.test(note);
    },

    // Stores the active group by NAME, group membership is resolved on
    // demand via GroupRegistry, so there's no object identity to keep in sync.
    setCurrentMapGroup: (groupName) => {
      if (!$gameSystem) return;
      $gameSystem._npcSystemCurrentMapGroup = groupName || null;
    },
    getCurrentMapGroup: () => $gameSystem ? $gameSystem._npcSystemCurrentMapGroup : null,

    findMapGroupByMap: (mapId) => GroupRegistry.findGroupByMap(mapId),

    getNPCSpawnLimit: () => MapManager.isHouseMap($gameMap.mapId()) ? 3 : 8,

    // Night window is 22:00-06:00 (variable 23 = current hour)
    isNightTime: () => {
      const hour = $gameVariables?.value(23) ?? 12;
      return hour >= 22 || hour < 6;
    },

    // <Interior>/<Exterior> tag for any map in a pool, derived from cached map data.
    // Cached permanently once known (the tag never changes); maps not yet loaded
    // resolve to "None" until their data becomes available.
    getMapEnvironmentTag: (mapId) => {
      $gameSystem._npcMapTags = $gameSystem._npcMapTags || {};
      const cached = $gameSystem._npcMapTags[mapId];
      if (cached) return cached;

      const data = ($dataMap && $dataMap.id === mapId) ? $dataMap : MapManager.getCachedMapData(mapId);
      if (!data?.note) return "None";

      const tag = data.note.includes("<Interior>") ? "Interior"
        : data.note.includes("<Exterior>") ? "Exterior" : "None";
      $gameSystem._npcMapTags[mapId] = tag;
      return tag;
    },

    findPassableTerrainTiles: () => {
      if (!$dataMap) return [];
      const mapId = $gameMap.mapId();
      if ($gameMap._passableTerrainCache && $gameMap._passableTerrainCache.mapId === mapId) {
        return $gameMap._passableTerrainCache.tiles;
      }

      const passableTiles = [];
      const w = $gameMap.width();
      const h = $gameMap.height();

      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if (!ORTHO_DIRS.some(dir => $gameMap.isPassable(x, y, dir))) continue;

          const regionId = $gameMap.regionId(x, y);
          // Region 10/103: blocked tiles. Region 99: water (CLAUDE.md). Region 11
          // is an explicitly allowed spawn region (NPCs may stand on it).
          if (regionId === 10 || regionId === 103 || regionId === 99) continue;
          // Water (terrain tag 3) and tag 7 are not walkable for NPCs.
          if (Utils.isBlockedTerrain(x, y)) continue;
          if ($gameMap.eventsXy(x, y).length > 0) continue;

          if (Utils.isValidTileType(x, y) && Utils.has2x2FreeArea(x, y)) {
            passableTiles.push({ x, y });
          }
        }
      }
      $gameMap._passableTerrainCache = { mapId, tiles: passableTiles };
      return passableTiles;
    },

    // Seat tiles for the PublicTransport group (region 102, see
    // SpawnManager.randomizePublicTransportMap). Unlike findPassableTerrainTiles,
    // seats don't need a free 2x2 area around them (a row of bus seats is
    // packed tight, only the aisle side needs to be walkable), they just need
    // to be a real tile that isn't already claimed by another event.
    getSeatTiles: () => {
      if (!$dataMap) return [];
      const seats = [];
      const w = $gameMap.width();
      const h = $gameMap.height();
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if ($gameMap.regionId(x, y) !== Config.Zones.TRANSPORT_SEAT) continue;
          if ($gameMap.eventsXy(x, y).length > 0) continue;
          seats.push({ x, y });
        }
      }
      return seats;
    },

    // Spawn tiles ordered for maximum spread across the whole map. The old
    // `findPassableTerrainTiles().sort(() => Math.random() - 0.5)` is a biased,
    // non-uniform shuffle (V8's sort leaves elements near their original
    // top-left iteration order), so the first N picks bunched up in one region
    // near the player/start instead of scattering. Here we do a real
    // Fisher-Yates shuffle, then farthest-first reorder the leading picks so
    // each successive spawn tile is pushed away from the ones already chosen.
    //
    // The dispersion is ~64 passes over every passable tile, and it was paid
    // on every call: the hourly turnover, every interior arrival, every
    // street-crime and visitor placement. So each map's tile list keeps a few
    // finished orderings (SPREAD_VARIANTS), built one per call until there are
    // enough, and after that a call hands out a copy of one picked at random.
    // The spread of each is the same; only the variety is bounded. Keyed on the
    // tile list itself, which findPassableTerrainTiles rebuilds with the map.
    SPREAD_VARIANTS: 6,
    _spreadVariants: new WeakMap(),
    getSpreadSpawnTiles: () => {
      const src = MapManager.findPassableTerrainTiles();
      if (src.length <= 2) return src.slice();

      let variants = MapManager._spreadVariants.get(src);
      if (!variants) { variants = []; MapManager._spreadVariants.set(src, variants); }
      if (variants.length >= MapManager.SPREAD_VARIANTS) {
        return variants[Math.floor(Math.random() * variants.length)].slice();
      }
      const ordered = MapManager._spreadOrder(src);
      variants.push(ordered);
      return ordered.slice();
    },

    _spreadOrder: (src) => {
      const tiles = src.slice();
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
      }

      // Farthest-first dispersion with incremental nearest-distance tracking
      // (~O(cap * tiles)). Capped because no map fields more spawns than this,
      // and the unordered (still shuffled) remainder covers any overflow.
      const cap = Math.min(64, tiles.length);
      const picked = [tiles[0]];
      const rest = tiles.slice(1);
      const minDist = rest.map(t => Math.abs(t.x - picked[0].x) + Math.abs(t.y - picked[0].y));
      for (let k = 1; k < cap && rest.length; k++) {
        let bi = 0, bd = -1;
        for (let r = 0; r < rest.length; r++) {
          if (minDist[r] > bd) { bd = minDist[r]; bi = r; }
        }
        const chosen = rest[bi];
        picked.push(chosen);
        const last = rest.length - 1;
        rest[bi] = rest[last]; rest.pop();
        minDist[bi] = minDist[last]; minDist.pop();
        for (let r = 0; r < rest.length; r++) {
          const d = Math.abs(rest[r].x - chosen.x) + Math.abs(rest[r].y - chosen.y);
          if (d < minDist[r]) minDist[r] = d;
        }
      }
      return picked.concat(rest);
    },

    _mapCache: {},

    loadMapData: (mapId) => {
      if ($dataMap && $dataMap.id === mapId) return $dataMap;
      if (MapManager._mapCache[mapId]) return MapManager._mapCache[mapId];

      const mapFileName = `Map${String(mapId).padStart(3, "0")}.json`;
      let parsedData = null;

      try {
        if (typeof StorageManager !== "undefined" && StorageManager.fileExists) {
          const fullPath = (StorageManager.isLocalMode ? "data/" : "data/") + mapFileName;
          if (StorageManager.fileExists(fullPath)) {
            parsedData = JSON.parse(StorageManager.fileRead(fullPath));
          }
        }
      } catch (e) { }

      if (!parsedData) {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", `data/${mapFileName}`, false);
          xhr.send();
          if (xhr.status === 200) parsedData = JSON.parse(xhr.responseText);
        } catch (e) { }
      }

      if (!parsedData && window.$dataMap && window.$dataMap.id === mapId) {
        parsedData = window.$dataMap;
      }

      if (parsedData) {
        MapManager._mapCache[mapId] = parsedData;
        if ($gameSystem) {
          $gameSystem._npcMapSizes = $gameSystem._npcMapSizes || {};
          $gameSystem._npcMapSizes[mapId] = parsedData.width * parsedData.height;
        }
      }

      return parsedData;
    },

    getCachedMapData: (mapId) => {
      return MapManager._mapCache[mapId];
    },

    getMapZones: () => {
      if (!$dataMap) return { social: [] };
      if ($gameMap._npcZoneCache && $gameMap._npcZoneCache.mapId === $gameMap.mapId()) {
        return $gameMap._npcZoneCache.zones;
      }

      const z = { social: [] };
      const w = $gameMap.width();
      const h = $gameMap.height();

      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          if ($gameMap.regionId(x, y) === Config.Zones.SOCIAL) z.social.push({ x, y });
        }
      }

      $gameMap._npcZoneCache = { mapId: $gameMap.mapId(), zones: z };
      return z;
    },

    loadMapSizeAsync: (mapId) => {
      if ($gameSystem && $gameSystem._npcMapSizes && $gameSystem._npcMapSizes[mapId]) return;
      const mapFileName = `Map${String(mapId).padStart(3, "0")}.json`;

      if (typeof fetch === "function") {
        fetch(`data/${mapFileName}`)
          .then(response => response.json())
          .then(data => {
            if (data && $gameSystem) {
              $gameSystem._npcMapSizes = $gameSystem._npcMapSizes || {};
              $gameSystem._npcMapSizes[mapId] = data.width * data.height;
            }
          })
          .catch(() => {});
      } else {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", `data/${mapFileName}`, true);
          xhr.onload = () => {
            if (xhr.status === 200) {
              try {
                const data = JSON.parse(xhr.responseText);
                if (data && $gameSystem) {
                  $gameSystem._npcMapSizes = $gameSystem._npcMapSizes || {};
                  $gameSystem._npcMapSizes[mapId] = data.width * data.height;
                }
              } catch (e) {}
            }
          };
          xhr.send();
        } catch (e) {}
      }
    }
  };

  // ==========================================================================
  // GROUP REGISTRY, MapGroups derived from <MapGroup: Name>/<MainMap> notes
  // ==========================================================================
  // MapGroups used to be a hardcoded table of map-id arrays. They're now read
  // straight off each map's note tags instead, so a new group only needs the
  // relevant maps tagged, no plugin code changes:
  //   <MapGroup: Ghent>   → this map belongs to the "Ghent" group
  //   <MainMap>           → (within a group) this map is one of its "hubs":
  //                          always fully populated, and the social heart
  //                          NPCs from outlying maps "visit" while it's active
  // Tolerant of both "<MapGroup: Name>" and "<MapGroup Name>", both forms
  // already exist in the shipped map data.
  //
  // PERFORMANCE NOTE: building this requires reading the `note` field of every
  // map in the game, and MZ stores notes inside each map's own JSON file
  // alongside its full event/tile data, so there's no lighter-weight source to
  // read them from. This project currently has ~1480 maps (~106MB of map data
  // total): a live scan loads and parses every single one of them
  // synchronously, which would cause a multi-second (quite possibly 10+
  // second) freeze on the first map load of a session. To avoid that, the
  // scan result is persisted to js/db/WorldGen/MapGroups.json (see
  // WorldgenStore below) the first time it's built, and every subsequent
  // boot loads that small manifest directly instead of rescanning. Delete
  // the file (e.g. after retagging maps with <MapGroup>/<MainMap>) to force
  // a one-time regeneration. The result is also cached in $gameSystem (so it
  // survives save/load) and in MapManager's in-memory map cache.
  const GROUP_TAG = /<MapGroup:?\s*([A-Za-z][A-Za-z0-9_]*)>/i;
  const MAIN_MAP_TAG = /<MainMap>/i;

  // Persists the GroupRegistry scan result as a small JSON manifest under
  // js/db/WorldGen/, so it only has to be (re)built when that file is missing,
  // deleting it regenerates it on the next boot. Only available under NW.js
  // (the desktop/Steam builds); browser deploys silently fall back to
  // scanning-and-caching-in-$gameSystem each session, as before.
  const WorldgenStore = {
    _filePath: null,
    _fs: null,

    _resolve: () => {
      if (WorldgenStore._filePath !== null) return WorldgenStore._filePath;
      WorldgenStore._filePath = false;
      try {
        if (window.Utils && window.Utils.isNwjs && window.Utils.isNwjs()) {
          const fs = require("fs");
          const path = require("path");
          const dir = path.join(path.dirname(process.mainModule.filename), "js", "db", "WorldGen");
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          WorldgenStore._fs = fs;
          WorldgenStore._filePath = path.join(dir, "MapGroups.json");
        }
      } catch (e) { }
      return WorldgenStore._filePath;
    },

    load: () => {
      if (window.WorldGen?.MapGroups) return window.WorldGen.MapGroups;
      const filePath = WorldgenStore._resolve();
      if (!filePath) return null;
      try {
        if (!WorldgenStore._fs.existsSync(filePath)) return null;
        return JSON.parse(WorldgenStore._fs.readFileSync(filePath, "utf8"));
      } catch (e) {
        return null;
      }
    },

    save: (groups) => {
      window.WorldGen = window.WorldGen || {};
      window.WorldGen.MapGroups = groups;
      const filePath = WorldgenStore._resolve();
      if (!filePath) return;
      const json = JSON.stringify(groups);
      WorldgenStore._fs.writeFile(filePath, json, "utf8", (e) => {
        if (!e) Utils.debug(`GroupRegistry manifest written to js/db/WorldGen/MapGroups.json`);
      });
    },

    // Removes the on-disk manifest so the next build rescans the maps (used by
    // the "Test" player dev hook, see maybeRegenerateForTest).
    deleteFile: () => {
      const filePath = WorldgenStore._resolve();
      if (!filePath) return;
      try {
        if (WorldgenStore._fs.existsSync(filePath)) WorldgenStore._fs.unlinkSync(filePath);
      } catch (e) { }
    },
  };

  // The static half of the procedural population, shipped as
  // js/db/WorldGen/NPCResidents.json (tools/build/gen_npc_residents.js):
  //
  //   <Group>      the AUTHORED people who survive on that group's own maps
  //                (Local, Shop and unique-content events; never Story).
  //   __templates  the Map574 events the procedural people are cloned from.
  //   __maps       size, interior/exterior, main map, <Abandoned> and the
  //                permanent officer count of every group map.
  //   __proc       the slots of the procedural settlement map (636).
  //   __shops      the per-map shop index the counter rotas are drawn from.
  //
  // It is read-only at runtime: nothing about it depends on the world, and the
  // world's own people live in $gameSystem._npcResidents (ResidentRegistry).
  // When the file is missing (a fresh checkout before the build ran) the same
  // answers are harvested off the maps once per session instead.
  const NPCPoolStore = {
    _cache: undefined, // session memo of the parsed manifest (undefined = not read yet)
    // Manifest format version, kept in step with gen_npc_residents.js.
    // v5 is the resident manifest: authored survivors only, plus the
    // templates, the map sizes and the officer counts.
    VERSION: 5,

    // The one pool every "Proc:x,y" settlement shares: every procedural
    // settlement is the same single map (636), so its slots are stored once
    // under a "__" key every manifest consumer already skips.
    PROC_KEY: "__proc",

    load: () => {
      if (NPCPoolStore._cache !== undefined) return NPCPoolStore._cache;
      NPCPoolStore._cache = null;
      const preloaded = window.WorldGen?.NPCResidents;
      if (preloaded && preloaded.__v === NPCPoolStore.VERSION) NPCPoolStore._cache = preloaded;
      return NPCPoolStore._cache;
    },

    // Session-only: the file is a build artifact and is never written back.
    save: (pools) => {
      pools.__v = NPCPoolStore.VERSION;
      NPCPoolStore._cache = pools;
      window.WorldGen = window.WorldGen || {};
      window.WorldGen.NPCResidents = pools;
    },

    // What the manifest says about one map, or what the map file says when
    // there is no manifest. { g, w, h, env, main, abandoned, officers }
    mapMeta: (mapId) => {
      const m = NPCPoolStore.load()?.__maps?.[mapId];
      if (m) return m;
      NPCPoolStore._metaSession = NPCPoolStore._metaSession || {};
      if (mapId in NPCPoolStore._metaSession) return NPCPoolStore._metaSession[mapId];
      const data = ($dataMap && $gameMap && $gameMap.mapId() === mapId) ? $dataMap : MapManager.loadMapData(mapId);
      let meta = null;
      if (data) {
        const note = data.note || "";
        const officers = Number((note.match(/<Officers:\s*(\d+)\s*>/i) || [])[1]) || 0; // i18n-ignore: map notetag
        meta = {
          g: MapManager.findMapGroupByMap(mapId) || null,
          w: data.width | 0, h: data.height | 0,
          env: /<Exterior>/i.test(note) ? "Exterior" : (/<Interior>/i.test(note) ? "Interior" : "None"), // i18n-ignore: map notetags
          main: MAIN_MAP_TAG.test(note),
          abandoned: /<Abandoned>/i.test(note), // i18n-ignore: map notetag
          officers,
        };
      }
      NPCPoolStore._metaSession[mapId] = meta;
      return meta;
    },

    // The event a procedural person is cloned from: "citizen", "shop" or
    // "officer". A deep copy, so the caller can stamp it freely.
    template: (kind) => {
      let tpl = NPCPoolStore.load()?.__templates?.[kind];
      if (!tpl) {
        const id = Config.RESIDENT_TEMPLATE_EVENTS[kind];
        const data = MapManager.loadMapData(Config.RESIDENT_TEMPLATE_MAP_ID);
        tpl = data?.events?.[id] || null;
      }
      return tpl ? JSON.parse(JSON.stringify(tpl)) : null;
    },

    deleteFile: () => { NPCPoolStore._cache = undefined; NPCPoolStore._metaSession = {}; },
  };

  // Populates each group's `jobs` map, { mapId: [jobId, ...] }, from
  // js/db/WorldGen/MapJobs.json (tools/build/gen_map_jobs.js), the one table
  // of which jobs are worked where. Multiple jobs can share the same map, so
  // each map lists every job available there (see
  // JobShiftManager.ensureGroupAssignments).
  //
  // A procedural settlement and a tower floor live on map 636, which says
  // nothing by its number: the first is staffed by its biome
  // ("proc:biome:<Biome>") and the building doors drawn on it
  // ("proc:door:<Feature>"), the second by the kind of world the floor holds
  // ("tower:<kind>", else "tower:default"). An upper floor of the tower is an
  // authored map (group.towerMapId): the posts MapJobs lists for that map come
  // first, then its world's, all worked on that map.
  const PROC_SETTLEMENT_MAP_ID = 636;
  const MAX_SETTLEMENT_JOBS = 6;
  function _jobsAtKey(key) {
    if (window.WorkSystem?.jobsAt) return window.WorkSystem.jobsAt(key);
    const entry = window.WorldGen?.MapJobs?.[String(key)];
    return entry && Array.isArray(entry.jobs) ? entry.jobs.slice() : [];
  }
  function _settlementJobKeys(group) {
    if (group._tower) {
      const TW = window.TowerWorlds;
      const world = (group.towerWorld != null && TW?.byId?.(group.towerWorld)) || (group.floor && TW?.get?.(group.floor)) || null;
      const kind = world?.kind;
      const own = group.towerMapId && _jobsAtKey(group.towerMapId).length ? [group.towerMapId] : [];
      return own.concat(kind && _jobsAtKey(`tower:${kind}`).length ? [`tower:${kind}`] : ["tower:default"]);
    }
    const keys = [];
    if (group.biome) keys.push(`proc:biome:${group.biome}`);
    for (const door of (group.doorKinds || [])) keys.push(`proc:door:${door}`);
    return keys;
  }
  function _populateGroupJobs(groups) {
    for (const group of Object.values(groups)) {
      const jobs = {};
      if (group._tower || group._procedural) {
        // Round by round across the keys, so every kind of building on the
        // square keeps the trade it is for before any gets a second one.
        const lists = _settlementJobKeys(group).map(_jobsAtKey);
        const ids = [];
        const longest = Math.max(0, ...lists.map(l => l.length));
        for (let r = 0; r < longest && ids.length < MAX_SETTLEMENT_JOBS; r++) {
          for (const list of lists) {
            const id = list[r];
            if (id != null && !ids.includes(id) && ids.length < MAX_SETTLEMENT_JOBS) ids.push(id);
          }
        }
        if (ids.length) jobs[(group._tower && group.towerMapId) || PROC_SETTLEMENT_MAP_ID] = ids;
      } else {
        for (const mapId of (group.maps || [])) {
          const ids = _jobsAtKey(mapId);
          if (ids.length) jobs[mapId] = ids;
        }
      }
      group.jobs = jobs;
    }
  }

  // Scans a loaded map's events for visitHouse / enterMultiBuilding plugin
  // commands and returns one entry per door/entrance for the residential cache.
  function _scanMapForResidentialBuildings(mapId, mapData) {
    const HOUSE_PLUGIN = 'ProceduralMap/ProceduralHouseSystem';
    const results = [];
    for (const event of (mapData?.events || [])) {
      if (!event) continue;
      let found = null;
      outer: for (const page of (event.pages || [])) {
        for (const cmd of (page.list || [])) {
          if (cmd.code !== 357 || cmd.parameters[0] !== HOUSE_PLUGIN) continue;
          const cmdName = cmd.parameters[1];
          const args    = cmd.parameters[3] || {};
          if (cmdName === 'visitHouse') {
            found = {
              mapId, eventId: event.id, x: event.x, y: event.y,
              seed: mapId * 1000000 + event.x * 1000 + event.y,
              type: 'visitHouse', poolName: args.poolName || '', capacity: 2
            };
            break outer;
          } else if (cmdName === 'enterMultiBuilding') {
            // numFloors counts the floors ABOVE the ground floor (see
            // generateMultiBuildingStructure), so the building has one more
            // floor than that, and holds one household per floor.
            const numFloors  = Number(args.numFloors) || 1;
            const totalFloors = numFloors + 1;
            found = {
              mapId, eventId: event.id, x: event.x, y: event.y,
              seed: mapId * 1000000 + event.x * 1000 + event.y,
              type: 'enterMultiBuilding',
              baseFloorPool: args.baseFloorPool || '',
              upperFloorsPool: args.upperFloorsPool || '',
              numFloors, totalFloors, capacity: totalFloors
            };
            break outer;
          }
        }
      }
      if (found) results.push(found);
    }
    return results;
  }

  const GroupRegistry = {
    _cache: null,
    _mapIndex: null,
    _buildCallbacks: null, // null = idle, [] = async build in progress

    // Async entry point: calls `callback` once the registry is ready.
    // Fast paths resolve synchronously (cache warm, save data, or manifest file).
    // Slow path (first-ever run, no manifest) fetches all map files concurrently
    // via fetch() instead of blocking the main thread with serial sync-XHR.
    ensureBuiltAsync(callback) {
      if (GroupRegistry._cache) { callback?.(); return; }
      if ($gameSystem?._npcMapGroups) {
        GroupRegistry._cache = $gameSystem._npcMapGroups;
        callback?.(); return;
      }
      const fromManifest = WorldgenStore.load();
      if (fromManifest) {
        GroupRegistry._cache = fromManifest;
        if ($gameSystem) $gameSystem._npcMapGroups = fromManifest;
        Utils.debug(`GroupRegistry loaded from manifest (async): ${Object.keys(fromManifest).length} groups.`);
        callback?.(); return;
      }
      // Async build already running, queue this callback
      if (GroupRegistry._buildCallbacks !== null) {
        if (callback) GroupRegistry._buildCallbacks.push(callback);
        return;
      }
      GroupRegistry._buildCallbacks = callback ? [callback] : [];
      Utils.debug('GroupRegistry: no manifest found, scanning maps concurrently...');

      const infos = ($dataMapInfos || []).filter(i => i?.id);
      Promise.all(infos.map(info => {
        if (MapManager._mapCache[info.id])
          return Promise.resolve({ id: info.id, data: MapManager._mapCache[info.id] });
        const file = `data/Map${String(info.id).padStart(3, '0')}.json`;
        return fetch(file)
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data) MapManager._mapCache[info.id] = data; return { id: info.id, data }; })
          .catch(() => ({ id: info.id, data: null }));
      })).then(results => {
        const groups = {};
        for (const { id, data } of results) {
          if (!data?.note) continue;
          const match = data.note.match(GROUP_TAG);
          if (!match) continue;
          const groupName = match[1];
          const group = groups[groupName] || (groups[groupName] = { maps: [], mainMaps: [], residentialBuildings: [] });
          group.maps.push(id);
          if (MAIN_MAP_TAG.test(data.note)) group.mainMaps.push(id);
          group.residentialBuildings.push(..._scanMapForResidentialBuildings(id, data));
        }
        _populateGroupJobs(groups);
        GroupRegistry._cache = groups;
        GroupRegistry._mapIndex = null;
        if ($gameSystem) $gameSystem._npcMapGroups = groups;
        WorldgenStore.save(groups);
        Utils.debug(`GroupRegistry async scan complete: ${Object.keys(groups).length} groups.`);
        const cbs = GroupRegistry._buildCallbacks;
        GroupRegistry._buildCallbacks = null;
        for (const cb of cbs) cb();
      });
    },

    build: () => {
      if (GroupRegistry._cache) return GroupRegistry._cache;
      if ($gameSystem._npcMapGroups) {
        GroupRegistry._cache = $gameSystem._npcMapGroups;
        return GroupRegistry._cache;
      }

      const fromManifest = WorldgenStore.load();
      if (fromManifest) {
        GroupRegistry._cache = fromManifest;
        if ($gameSystem) $gameSystem._npcMapGroups = fromManifest;
        Utils.debug(`GroupRegistry loaded from js/db/WorldGen/MapGroups.json: ${Object.keys(fromManifest).length} groups.`);
        return fromManifest;
      }

      const groups = {};
      for (const info of ($dataMapInfos || [])) {
        if (!info || !info.id) continue;
        const data = MapManager.loadMapData(info.id);
        const note = data?.note;
        if (!note) continue;

        const match = note.match(GROUP_TAG);
        if (!match) continue;

        const groupName = match[1];
        const group = groups[groupName] || (groups[groupName] = { maps: [], mainMaps: [], residentialBuildings: [] });
        group.maps.push(info.id);
        if (MAIN_MAP_TAG.test(note)) group.mainMaps.push(info.id);
        // Scan this map's events for house/multibuilding entrances
        group.residentialBuildings.push(..._scanMapForResidentialBuildings(info.id, data));
      }

      _populateGroupJobs(groups);
      GroupRegistry._cache = groups;
      if ($gameSystem) $gameSystem._npcMapGroups = groups;
      WorldgenStore.save(groups);
      Utils.debug(`GroupRegistry built: ${Object.keys(groups).length} groups from ${Object.values(groups).reduce((s, g) => s + g.maps.length, 0)} tagged maps.`);
      return groups;
    },

    get: (groupName) => GroupRegistry.build()[groupName] || null,

    findGroupByMap: (mapId) => {
      // The single procedural map (636) is reused for every world tile, so it
      // cannot live in the static map index; resolve it to the live synthetic
      // settlement registered for the current world coordinates instead.
      if (mapId === 636) return $gameSystem?._currentProcGroup ?? null;
      // Map 353 is only Bologna while BolognaMapSystem lends it the slot;
      // standing on it any other time is standing at the Monument to Humanity,
      // which is no part of the city's group.
      if (mapId === Config.BOLOGNA_MAP_ID && $gameMap && $gameMap.mapId() === mapId &&
          window.BolognaMapSystem && !window.BolognaMapSystem.isBolognaMap()) return null;
      if (!GroupRegistry._mapIndex) {
        const groups = GroupRegistry.build();
        GroupRegistry._mapIndex = new Map();
        for (const [name, group] of Object.entries(groups))
          for (const mId of group.maps) GroupRegistry._mapIndex.set(mId, name);
      }
      return GroupRegistry._mapIndex.get(mapId) ?? null;
    }
  };

  // ==========================================================================
  // FAMILY NAMESPACE (NPCSystem_*.js)
  // ==========================================================================
  // The NPC system is split across the NPCSystem_*.js modules listed in
  // js/plugins.js right after this file. Each module reads the helpers it
  // shares with the others off NPCSystem._internal and publishes its own
  // there; a name owned by a module that loads later is bound through _late,
  // which NPCSystem_Downed.js (the last module) runs once the family is in.
  // NPCSystem_Hooks.js fills in the public API on this same object.

  window.NPCSystem = { _internal: { _late: [] } };
  Object.assign(window.NPCSystem._internal, {
    _populateGroupJobs, _scanMapForResidentialBuildings, buildNPCCharacterPool, Config,
    GroupRegistry, isBetaSprite, isVipSprite, MapManager, NEIGHBOR_DIR, NEIGHBOR_DX, NEIGHBOR_DY,
    NPCPoolStore, ORTHO_DIRS, pickNPCCharacter, pluginName, Utils, WorldgenStore,
  });

  // Owned by modules that load after this one, bound once the family is in.
  let VisitingParties;
  window.NPCSystem._internal._late.push(() => ({ VisitingParties } = window.NPCSystem._internal));

  // Talking to somebody else's party member. Three answers only: hear them
  // out, read them properly, or leave them be. Everything that would reach
  // into the playthrough they belong to is not on offer here at all, and the
  // panel strips itself down for them as well (NPCEmpathizeUI).
  PluginManager.registerCommand(pluginName, "VisitorInteract", args => {
    const key = String((args && args.key) || "");
    const found = VisitingParties.memberByKey(key);
    const name = (found && found.name) || "";
    if (!name) return;
    // One of this WORLD's own idle companions rather than another playthrough's
    // traveller: they belong to nobody, so they can be asked along, and that is
    // the only thing on offer here that a visitor is not also offered.
    const LG = window.PartyLodging;
    // Somebody working a shift at one of the party's businesses is called back
    // from the Reserves, never talked off the till.
    const canRecruit = !!(LG?.isResidentName?.(name) && LG.hasRoom()
      && !window.ShopManagement?.isPartyStaffName?.(name));
    const choices = [T('NPCSystem.visitor.talk'), T('NPCSystem.visitor.empathize')];
    if (canRecruit) choices.push(T('NPCSystem.visitor.join'));
    choices.push(T('NPCSystem.visitor.cancel'));
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceCallback(choice => {
      if (canRecruit && choice === 2) {
        PluginManager.callCommand($gameMap?._interpreter, "NPCSystemParty", "LodgerJoinParty", { name });  // i18n-ignore: plugin command id
        return;
      }
      if (choice === 0) {
        // A line of their own, in their own voice: the same Markov banks every
        // other NPC in the world speaks out of.
        let line = "";
        try {
          line = window.generateMarkovString ? window.generateMarkovString("all") : "";  // i18n-ignore: Markov bank id
        } catch (e) { line = ""; }
        if (!line) line = T('NPCSystem.visitor.silent');
        $gameMessage.setSpeakerName(name);
        window.skipLocalization = true;
        $gameMessage.add(line);
        window.skipLocalization = false;
        try {
          window.NPCEmpathize?.recordNPCLine?.(name, line);
        } catch (e) { /* the line was still said */ }
      } else if (choice === 1) {
        window.NPCEmpathize?.openByName?.(name);
      }
    });
  });
})();
