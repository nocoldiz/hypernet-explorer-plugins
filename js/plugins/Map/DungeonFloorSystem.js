
/*:
 * @target MZ
 * @plugindesc v1.7.0 Creates a 100-floor dungeon system with robust map validation for stair placement.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help DungeonFloorSystem.js
 *
 * ######This plugin creates a dungeon system with 100 floors and a town level.
 * Every floor is dealt from ONE pool: the maps sitting in the dungeon folders,
 * map 166 first among them. There are no per-level A to J pools any more, so
 * any floor map can turn up at any depth. Only the elevator halls are fixed,
 * one on every tenth floor.
 *
 * --- New in v1.6.2: Staircase Map Validation ---
 * The plugin now validates maps to ensure they can be used for dungeon floors.
 * - Single-map floors: A map will be excluded from the generation pool if it
 * does not contain at least one tile with Region ID 13.
 * - Multi-map floors: A group of maps is only valid if it contains at least
 * TWO maps that have a Region ID 13 tile (for an entrance and an exit).
 * Maps within a valid group that lack Region ID 13 will not be used for
 * the start or end rooms.
 *
 * --- World generation ---
 * The floor layout is world data, not run data: it is rolled from the world
 * seed while the world is being created (WorldManager's "dungeon" step, which
 * runs the same routine as the Generate Dungeon plugin command) and the
 * Dungeon Generated switch is turned ON to say the world has one. Being a
 * world switch, it is shared by every savegame of that world.
 *
 * --- Special Floor Transitions ---
 * - From Town (Floor 0), using "nextFloor" teleports you to Map ID 101 (X:16, Y:38).
 * - From Floor 1, using "prevFloor" teleports you to the dungeon base Map ID 635 at (X:13, Y:27).
 *
 * --- The lower tower (floors -1 to -92) ---
 * Everything below ground is generated rather than authored: each lower floor
 * is one of the structures in the procedural catalogue (sewer, crypt, cellar,
 * mineshaft, ...), rolled from the world seed and walked through the NextFloor
 * / PrevFloor / Elevator events the procedural map (636) already carries.
 * The staircases read the other way round down there: deeper means a SMALLER
 * number, so "nextFloor" takes -21 to -22 and "prevFloor" takes -23 back to
 * -22. Floor 0 is map 635 (the Stairs Hall), whose "prevFloor" is the mouth of
 * the lower tower.
 *
 * Plugin Commands:
 * generateDungeon - Creates a new random dungeon layout (resets max floor)
 * nextFloor      - Move to the next floor (up)
 * prevFloor      - Move to the previous floor (down)
 * setFloor       - Set a specific floor to visit (spawns near downstairs)
 * elevator       - Teleport to the floor stored in variable 17
 * teleportToHighest - Teleport to highest reached floor
 * teleportToNearestStairs - Teleport player to the nearest staircase on current map
 * teleportToUpstairs - Teleport player directly to the upstairs on current map
 * teleportToDownstairs - Teleport player directly to the downstairs on current map
 *
 * ===========================================================================
 * How to use:
 * 1. Set up your maps and their IDs in the plugin parameters. Use [ ] for map groups.
 * 2. Place region ID 13 on your maps where stairs can be located. Maps without
 * this region ID will not be chosen for most floors.
 * 3. Create events named "NextFloor" and "PrevFloor" on your dungeon maps.
 * 4. Generate the dungeon before starting exploration.
 * ===========================================================================
 * @param demoMode
 * @text Demo Mode
 * @desc If true, the dungeon stops at floor 10: floor 1 is map 101, floors 2-9 come from block A, floor 10 is map 112.
 * @type boolean
 *
 *
 * @param townMapId
 * @text Town Map ID
 * @desc Map ID for the town level
 * @type number
 * @default 1
 *
 * @param arenaMapId
 * @text Arena Map ID
 * @desc Map ID for the arena (alternative town when switch 5 is ON)
 * @type number
 * @default 2
 *
 * @param arenaMapX
 * @text Arena Map Spawn X
 * @desc X coordinate for player spawn on arena map
 * @type number
 * @default 5
 *
 * @param arenaMapY
 * @text Arena Map Spawn Y
 * @desc Y coordinate for player spawn on arena map
 * @type number
 * @default 5
 *
 * @param bossFloorMapId
 * @text Boss Floor (Floor 100) Map ID
 * @desc Map ID for floor 100
 * @type number
 * @default 70
 *
 * @param bossFloorX
 * @text Boss Floor Spawn X
 * @desc X coordinate for player spawn on floor 100
 * @type number
 * @default 10
 *
 * @param bossFloorY
 * @text Boss Floor Spawn Y
 * @desc Y coordinate for player spawn on floor 100
 * @type number
 * @default 10
 *
 * @param playerSpawnX
 * @text Player Spawn X
 * @desc Default X coordinate for player spawn on floors
 * @type number
 * @default 5
 *
 * @param playerSpawnY
 * @text Player Spawn Y
 * @desc Default Y coordinate for player spawn on floors
 * @type number
 * @default 5
 *
 * @param currentFloorVariable
 * @text Current Floor Variable
 * @desc Variable to store the current floor number
 * @type variable
 * @default 1
 *
 * @param maxFloorVariable
 * @text Maximum Floor Variable
 * @desc Variable to store the maximum floor reached
 * @type variable
 * @default 2
 *
 * @param elevatorFloorVariable
 * @text Elevator Floor Variable
 * @desc Variable that stores the floor number for elevator
 * @type variable
 * @default 17
 *
 * @param arenaToggleSwitch
 * @text Arena Toggle Switch
 * @desc Switch that determines whether to use the arena map instead of the town map
 * @type switch
 * @default 5
 *
 * @param dungeonGeneratedSwitch
 * @text Dungeon Generated Switch
 * @desc World switch turned ON once the world's dungeon layout has been generated.
 * @type switch
 * @default 2
 *
 * @command generateDungeon
 * @text Generate Dungeon
 * @desc Generates a new random dungeon layout and resets max floor
 *
 * @command nextFloor
 * @text Go to Next Floor
 * @desc Move to the next floor in the dungeon (upstairs)
 *
 * @command prevFloor
 * @text Go to Previous Floor
 * @desc Move to the previous floor in the dungeon (downstairs)
 *
 * @command setFloor
 * @text Set Floor
 * @desc Set a specific floor to visit (spawns near downstairs)
 *
 * @arg floor
 * @text Floor Number
 * @desc Floor number to visit (0 for town, 1-100 for dungeon floors)
 * @type number
 * @default 1
 *
 * @command elevator
 * @text Elevator
 * @desc Teleport to the floor stored in variable 17
 *
 * @command teleportToHighest
 * @text Teleport to Highest Floor
 * @desc Teleports the player to the highest floor they've reached
 *
 * @command teleportToNearestStairs
 * @text Teleport to Nearest Stairs
 * @desc Teleports the player to the nearest staircase on the current floor
 *
 * @command teleportToUpstairs
 * @text Teleport to Upstairs
 * @desc Teleports the player to the upstairs on the current floor
 *
 * @command teleportToDownstairs
 * @text Teleport to Downstairs
 * @desc Teleports the player to the downstairs on the current floor
 *
 * @command bandTalk
 * @text Talk to an Adventurer
 * @desc Internal: a word with one of the adventuring bands climbing the tower
 */

(() => {
  "use strict";

  const pluginName = "DungeonFloorSystem";

  //=============================================================================
  // Plugin Parameters
  //=============================================================================

  const parameters = PluginManager.parameters(pluginName);


  function createSeededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash = hash & hash;
    }
    let state = Math.abs(hash);
    return function () {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  window.DungeonFloorSystemParams = {
    // Every floor of the tower is dealt from ONE pool: the maps sitting
    // directly in the dungeon folder (map 166). A map added to that folder is
    // a floor, no list to edit. The groups below only say which maps belong to
    // the SAME floor: a floor spread over several rooms, keyed by the room the
    // pool deals. Ids that are not in the folder are ignored.
    floorGroups: [
      [12, 139], [15, 140, 348, 406, 546, 543], [16, 429], [19, 332, 697, 698],
      [20, 344, 407], [21, 334, 336, 335], [22, 446], [23, 346],
      [99, 329, 330], [31, 164, 425, 426], [34, 328], [32, 345, 428],
      [30, 316]
    ],
    elevatorMaps: [112,113,114,115,116,117,118,119],
    demoMode: String(parameters.demoMode) === "true",
    demoMaxFloor: 10,
    demoFinalMapId: 112,
    // MapInfos folder holding every dungeon floor. The whole tower, demo and
    // full run alike, draws from the maps sitting in it.
    dungeonFolderId: 166,
    // Only the maps sitting directly in folder 166 are floors. The old
    // per-level folders hold work in progress and unfinished maps, so they
    // are NOT part of the pool: move a map under 166 to make it a floor.
    dungeonFolderIds: [166],
    townMapId: parseInt(parameters.townMapId || 1),
    arenaMapId: parseInt(parameters.arenaMapId || 2),
    arenaMapX: parseInt(parameters.arenaMapX || 5),
    arenaMapY: parseInt(parameters.arenaMapY || 5),
    bossFloorMapId: parseInt(parameters.bossFloorMapId || 70),
    bossFloorX: parseInt(parameters.bossFloorX || 10),
    bossFloorY: parseInt(parameters.bossFloorY || 10),
    playerSpawnX: parseInt(parameters.playerSpawnX || 5),
    playerSpawnY: parseInt(parameters.playerSpawnY || 5),
    currentFloorVariable: parseInt(parameters.currentFloorVariable || 1),
    maxFloorVariable: parseInt(parameters.maxFloorVariable || 2),
    elevatorFloorVariable: parseInt(parameters.elevatorFloorVariable || 17),
    arenaToggleSwitch: parseInt(parameters.arenaToggleSwitch || 5),
    dungeonGeneratedSwitch: parseInt(parameters.dungeonGeneratedSwitch || 2),
  };

  const params = window.DungeonFloorSystemParams;

  //=============================================================================
  // Shared synchronous map-JSON cache. Map data files are static and read-only,
  // so parse each at most once per session instead of re-firing a blocking XHR
  // in every helper (event/treasure/region13/tiles/region20 all hit the same
  // files). Module-level (not on $gameSystem) so it never bloats the save.
  //=============================================================================
  const _mapDataCache = {};
  function loadMapDataSync(mapId) {
    if (_mapDataCache.hasOwnProperty(mapId)) return _mapDataCache[mapId];
    let mapData = null;
    try {
      const filename = "Map%1.json".format(mapId.padZero(3));
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "data/" + filename, false);
      xhr.overrideMimeType("application/json");
      xhr.send();
      if (xhr.status < 400) {
        mapData = JSON.parse(xhr.responseText);
      } else {
        console.error("Failed to load map data for mapId " + mapId);
      }
    } catch (e) {
      console.error("Error loading map data for mapId " + mapId, e);
    }
    _mapDataCache[mapId] = mapData;
    return mapData;
  }

  //=============================================================================
  // Game_System additions for dungeon data
  //=============================================================================

  const _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function () {
    _Game_System_initialize.call(this);
    this.initDungeonSystem();
  };

  Game_System.prototype.initDungeonSystem = function () {
    if (!this._dungeonFloors) {
        this._dungeonFloors = new Array(101).fill(0);
        this._dungeonGenerated = false;
        this._mapRegion13Cache = {};
        
        this._stairLocations = new Array(101);
        for (let i = 0; i <= 100; i++) {
            this._stairLocations[i] = {
                upstairs: { mapId: 0, x: 0, y: 0 },
                downstairs: { mapId: 0, x: 0, y: 0 },
            };
        }
        
        this._elevatorSpawnPoints = {};
        this._eventPositions = {};
        this._treasureRoomPositions = {}; // ADD THIS LINE
        // How far into the LOWER tower the world has been, counted in floors
        // (22 means floor -22 has been stood on). The upper half keeps its own
        // record in variable 2.
        this._dungeonDepthReached = 0;
    }
};

Game_System.prototype.generateEventPositions = function(mapId, floor) {
  const key = `${mapId}_${floor}`;
  if (this._eventPositions[key]) {
      return; // Already generated
  }

  let passableTiles = [];
  try {
      const mapData = loadMapDataSync(mapId);
      if (mapData) {
          passableTiles = this.findPassableTilesFromTilesets(mapData);
      }
  } catch (e) {
      console.error("Error loading map data for event positioning", e);
  }

  // Store the positions
  this._eventPositions[key] = passableTiles.slice(0, 10); // Store first 10 positions
};

// Add this function to cache Region 14 tiles (add after generateEventPositions function)
Game_System.prototype.generateTreasureRoomPosition = function(mapId, floor) {
  const key = `treasure_${mapId}_${floor}`;  // i18n-ignore  record key
  if (this._treasureRoomPositions && this._treasureRoomPositions[key]) {
      return; // Already generated
  }

  if (!this._treasureRoomPositions) {
      this._treasureRoomPositions = {};
  }

  let region14Tiles = [];
  try {
      const mapData = loadMapDataSync(mapId);
      if (mapData) {
          region14Tiles = this.findRegion14Tiles(mapData);
      }
  } catch (e) {
      console.error("Error loading map data for treasure room positioning", e);
  }

  // Store a randomly chosen Region 14 tile (or null if none exist)
  if (region14Tiles.length > 0) {
      const randomIndex = Math.floor(this.dungeonRandom() * region14Tiles.length);
      this._treasureRoomPositions[key] = region14Tiles[randomIndex];
  } else {
      this._treasureRoomPositions[key] = null;
  }
};

Game_System.prototype.findRegion14Tiles = function (mapData) {
  const width = mapData.width;
  const height = mapData.height;
  const region14Tiles = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const regionId = this.getRegionIdFromMapData(mapData, x, y);
      if (regionId === 14) {
        region14Tiles.push({ x, y });
      }
    }
  }
  return region14Tiles;
};


  Game_System.prototype.isDungeonGenerated = function () {
    return this._dungeonGenerated;
  };

  Game_System.prototype.hasRegion13 = function(mapId) {
      if (this._mapRegion13Cache.hasOwnProperty(mapId)) {
          return this._mapRegion13Cache[mapId];
      }

      let hasRegion = false;
      try {
          const mapData = loadMapDataSync(mapId);
          if (mapData) {
              const regionTiles = this.findRegion13Tiles(mapData);
              hasRegion = regionTiles.length > 0;
          }
      } catch (e) {
          console.error("Error parsing map data for mapId " + mapId, e);
          hasRegion = false;
      }

      this._mapRegion13Cache[mapId] = hasRegion;
      return hasRegion;
  };

  // The one pool every floor is dealt from: the maps sitting directly in the
  // dungeon folder, each expanded into its room group when it has one. There
  // are no per-level pools any more, so a map is as likely on floor 3 as on
  // floor 97. Elevator halls and the boss floor are never in it.
  Game_System.prototype.dungeonMapPool = function () {
    const infos = window.$dataMapInfos;
    if (!Array.isArray(infos)) return [];

    const groupFor = new Map();
    for (const group of params.floorGroups) {
      if (Array.isArray(group) && group.length) groupFor.set(group[0], group);
    }
    const reserved = new Set([
      ...params.elevatorMaps,
      params.bossFloorMapId,
      params.townMapId,
      101,
    ]);

    const pool = [];
    for (let id = 0; id < infos.length; id++) {
      const info = infos[id];
      if (!info || params.dungeonFolderIds.indexOf(info.parentId) < 0) continue;
      if (reserved.has(id)) continue;
      pool.push(groupFor.has(id) ? [...groupFor.get(id)] : id);
    }
    return this.validateMapPool(pool);
  };

  // The demo draws from the same single pool as the full run.
  Game_System.prototype.demoFloorPool = function () {
    return this.dungeonMapPool();
  };

  // True when a stored demo layout holds floors past the demo limit or has
  // lost its final map. Old saves generated under the previous rules are
  // rebuilt instead of being played as they are.
  Game_System.prototype.isDemoLayoutStale = function () {
    if (!params.demoMode || !this._dungeonGenerated) return false;
    if (this._dungeonFloors[params.demoMaxFloor] !== params.demoFinalMapId) return true;
    for (let floor = params.demoMaxFloor + 1; floor <= 100; floor++) {
      if (this._dungeonFloors[floor]) return true;
    }
    return false;
  };

  // A map can host a floor only if it carries a Region 13 tile for the stairs.
  // A group is one floor spread over several rooms, so it needs two of them,
  // one for the way in and one for the way out; a group left with a single
  // usable room becomes an ordinary one-map floor rather than being thrown out.
  Game_System.prototype.validateMapPool = function (pool) {
    if (!pool) return [];
    return pool
      .map((entry) => {
        if (Array.isArray(entry)) {
          const valid = entry.filter((mapId) => this.hasRegion13(mapId));
          if (valid.length >= 2) return valid;
          return valid.length === 1 ? valid[0] : null;
        }
        return this.hasRegion13(entry) ? entry : null;
      })
      .filter((entry) => entry !== null);
  };

  // The world's RNG root. Both halves of the tower are rolled from it, so a
  // world's hundred floors above ground and its ninety-two below are the same
  // in every savegame of that world.
  function dungeonWorldSeed() {
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === "function") {
      return window.HistoryManager.getSeed();
    }
    if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._historySeed !== undefined) {
      return $gameSystem._historySeed;
    }
    return 19002001;
  }

  // The tower's random draws. The generator used to be stored on $gameSystem
  // as a CLOSURE, and JSON.stringify drops function-valued properties, so it
  // was gone after any save: every draw outside generateDungeon would have
  // thrown, and the one call site that guarded against it silently returned
  // its tiles unshuffled instead, moving the chests. It is rebuilt from the
  // world seed on demand, so the sequence is the same one the world always had.
  Game_System.prototype.dungeonRandom = function () {
    if (typeof this._seededRandom !== "function") {
      this._seededRandom = createSeededRandom(String(dungeonWorldSeed()));
    }
    return this._seededRandom();
  };

  Game_System.prototype.generateDungeon = function () {
    const historySeed = dungeonWorldSeed();
    this._seededRandom = createSeededRandom(String(historySeed));
    this._mapRegion13Cache = {}; // Clear cache on new generation

    this._dungeonFloors[0] = $gameSwitches.value(params.arenaToggleSwitch)
      ? params.arenaMapId
      : params.townMapId;
    // Demo mode structure: the dungeon ends at floor 10.
      if (params.demoMode) {
        // Floor 0: map 1 (already set above)
        // Floor 1: map 101
        this._dungeonFloors[1] = 101;

        // Floor 2 to (final - 1): the single pool, minus the excluded maps
        const lastFloor = params.demoMaxFloor;
        const demoPool = this.demoFloorPool();
        const uniqueNeeded = lastFloor - 2;
        for (let floor = 2; floor < lastFloor; floor++) {
            if (demoPool.length > 0) {
                const index = Math.floor(this.dungeonRandom() * demoPool.length);
                this._dungeonFloors[floor] = demoPool[index];
                if (demoPool.length >= uniqueNeeded) {
                    demoPool.splice(index, 1); // Remove to avoid duplicates if enough maps
                }
            }
        }

        // Final demo floor: map 112
        this._dungeonFloors[lastFloor] = params.demoFinalMapId;

        // Floors past the demo limit stay empty and are unreachable.
        for (let floor = lastFloor + 1; floor <= 100; floor++) {
            this._dungeonFloors[floor] = 0;
        }

        this.initializeStairLocations();
        this.markDungeonGenerated();
        $gameVariables.setValue(params.maxFloorVariable, 0);
        return;
    }
    // One pool for the whole tower. Floors are dealt from a bag that is
    // reshuffled whenever it runs dry, so no floor repeats until every map has
    // been used once.
    const pool = this.dungeonMapPool();
    if (pool.length === 0) {
      console.warn("DungeonFloorSystem: no valid dungeon floors with Region 13 in folder " + params.dungeonFolderId);
    }
    let bag = [];
    const dealFloor = () => {
      if (pool.length === 0) return null;
      if (bag.length === 0) bag = [...pool];
      const index = Math.floor(this.dungeonRandom() * bag.length);
      return bag.splice(index, 1)[0];
    };

    this._dungeonFloors[100] = params.bossFloorMapId;

    // Elevator halls keep their fixed maps on every tenth floor.
    const elevatorFloors = [10, 20, 30, 40, 50, 60, 70, 80, 90];
    const elevatorMaps = [...params.elevatorMaps];

    this._elevatorSpawnPoints = {};

    for (let i = 0; i < elevatorFloors.length; i++) {
      const floor = elevatorFloors[i];
      // There are fewer hall maps than tenth floors, so the list wraps: every
      // tenth floor is a lift hall, never an ordinary room without doors.
      this._dungeonFloors[floor] = elevatorMaps.length
        ? elevatorMaps[i % elevatorMaps.length]
        : this._dungeonFloors[floor];
    }

    for (let floor = 1; floor <= 99; floor++) {
      if (floor === 1) {
        this._dungeonFloors[floor] = 101;
        continue;
      }
      if (elevatorFloors.indexOf(floor) >= 0) continue;
      const entry = dealFloor();
      if (entry === null) continue;
      this._dungeonFloors[floor] = entry;
    }

    this.initializeStairLocations();

    this.markDungeonGenerated();
    $gameVariables.setValue(params.maxFloorVariable, 0);

  };

  // The layout is world data, so the flag announcing it exists is a world
  // switch: every savegame of the world descends through the same hundred
  // floors, and events can tell a generated world from one that never got a
  // dungeon without reaching into $gameSystem.
  Game_System.prototype.markDungeonGenerated = function () {
    this._dungeonGenerated = true;
    if (typeof $gameSwitches !== "undefined" && $gameSwitches && params.dungeonGeneratedSwitch > 0) {
      $gameSwitches.setValue(params.dungeonGeneratedSwitch, true);
    }
  };


  Game_System.prototype.getDungeonFloorMapId = function (floor) {
    if (floor === 0) {
      return $gameSwitches.value(params.arenaToggleSwitch)
        ? params.arenaMapId
        : params.townMapId;
    }

    if (floor < 1 || floor > 100) return params.townMapId;

    const mapInfo = this._dungeonFloors[floor];

    if (typeof mapInfo === "number" && mapInfo > 0) {
      return mapInfo;
    }

    if (Array.isArray(mapInfo) && mapInfo.length > 0) {
      return mapInfo[0]; // Return the first map as the "primary" map for the group
    }

    return params.townMapId; // Fallback
  };

  Game_System.prototype.initializeStairLocations = function () {
    const maxFloor = params.demoMode ? params.demoMaxFloor : 99;
    for (let floor = 1; floor <= maxFloor; floor++) {
        this.initializeStairsForFloor(floor);
    }
};

  Game_System.prototype.initializeStairsForFloor = function (floor) {
    const mapInfo = this._dungeonFloors[floor];
    if (!mapInfo || floor === 1) return;

    const mapIdList = Array.isArray(mapInfo) ? mapInfo : [mapInfo];
    if (mapIdList.length === 0 || mapIdList[0] === 0) return;

    // Generate event positions and treasure room positions for all maps in this floor
    for (const mapId of mapIdList) {
        this.generateEventPositions(mapId, floor);
        this.generateTreasureRoomPosition(mapId, floor); // ADD THIS LINE
    }
    
    const defaultSpawn = (offset = 0) => ({
      mapId: mapIdList[0],
      x: params.playerSpawnX + offset,
      y: params.playerSpawnY,
    });

    // Helper to get tiles for a single map
    const getTilesForMap = (mapId) => {
      const mapData = loadMapDataSync(mapId);
      if (mapData) {
        try {
          const regionTiles = this.findRegion13Tiles(mapData);
          const passableTiles = this.findPassableTiles(mapData);
          return { regionTiles, passableTiles };
        } catch (e) {
          console.error("Error parsing map data for mapId " + mapId, e);
        }
      }
      return { regionTiles: [], passableTiles: [] };
    };

    if (mapIdList.length > 1) {
      // MULTI-MAP LOGIC (Receives pre-validated list)
      const shuffledMapIds = [...mapIdList];
      for (let i = shuffledMapIds.length - 1; i > 0; i--) {
        const j = Math.floor(this.dungeonRandom() * (i + 1));
        [shuffledMapIds[i], shuffledMapIds[j]] = [
          shuffledMapIds[j],
          shuffledMapIds[i],
        ];
      }

      const startRoomMapId = shuffledMapIds[0];
      const endRoomMapId = shuffledMapIds[shuffledMapIds.length - 1];

      // Set downstairs (PrevFloor) in the start room
      let { regionTiles: startRegion } = getTilesForMap(startRoomMapId);
      if (startRegion.length > 0) {
        const loc =
          startRegion[Math.floor(this.dungeonRandom() * startRegion.length)];
        this._stairLocations[floor].downstairs = { ...loc, mapId: startRoomMapId };
      } else {
        this._stairLocations[floor].downstairs = {
          ...defaultSpawn(),
          mapId: startRoomMapId,
        };
      }

      // Set upstairs (NextFloor) in the end room
      let { regionTiles: endRegion } = getTilesForMap(endRoomMapId);
      if (endRegion.length > 0) {
        if (startRoomMapId === endRoomMapId && endRegion.length > 1) {
          const downstairsLoc = this._stairLocations[floor].downstairs;
          endRegion = endRegion.filter(
            (t) => t.x !== downstairsLoc.x || t.y !== downstairsLoc.y
          );
           if (endRegion.length === 0) { 
             let { regionTiles: originalRegion } = getTilesForMap(endRoomMapId);
             endRegion = originalRegion;
          }
        }
        const loc =
          endRegion[Math.floor(this.dungeonRandom() * endRegion.length)];
        this._stairLocations[floor].upstairs = { ...loc, mapId: endRoomMapId };
      } else {
        this._stairLocations[floor].upstairs = {
          ...defaultSpawn(1),
          mapId: endRoomMapId,
        };
      }
    } else {
      // SINGLE-MAP LOGIC
      const mapId = mapIdList[0];
      const { regionTiles, passableTiles } = getTilesForMap(mapId);

      if (regionTiles.length >= 2) {
        for (let i = regionTiles.length - 1; i > 0; i--) {
          const j = Math.floor(this.dungeonRandom() * (i + 1));
          [regionTiles[i], regionTiles[j]] = [regionTiles[j], regionTiles[i]];
        }
        this._stairLocations[floor].upstairs = { ...regionTiles[0], mapId };
        this._stairLocations[floor].downstairs = { ...regionTiles[1], mapId };
      } else if (regionTiles.length === 1) {
          this._stairLocations[floor].upstairs = { ...regionTiles[0], mapId };
          if(passableTiles.length > 0){
               const loc = passableTiles[Math.floor(this.dungeonRandom() * passableTiles.length)];
               this._stairLocations[floor].downstairs = { ...loc, mapId };
          } else {
               this._stairLocations[floor].downstairs = { ...defaultSpawn(), mapId };
          }
      }
      else { // 0 region tiles (should be rare now, but kept as fallback)
        if (passableTiles.length >= 2) {
             for (let i = passableTiles.length - 1; i > 0; i--) {
                const j = Math.floor(this.dungeonRandom() * (i + 1));
                [passableTiles[i], passableTiles[j]] = [passableTiles[j], passableTiles[i]];
            }
            this._stairLocations[floor].upstairs = { ...passableTiles[0], mapId };
            this._stairLocations[floor].downstairs = { ...passableTiles[1], mapId };
        } else if (passableTiles.length === 1) {
            this._stairLocations[floor].upstairs = { ...passableTiles[0], mapId };
            this._stairLocations[floor].downstairs = { ...defaultSpawn(), mapId };
        } else {
            this._stairLocations[floor].upstairs = { ...defaultSpawn(), mapId };
            this._stairLocations[floor].downstairs = { ...defaultSpawn(1), mapId };
        }
      }
    }
  };
  
  // The keep-out region, read off the one authority that owns it rather than
  // from a literal repeated down this file. MovementInteractionSystem defines
  // it; the fallback keeps an old save's map load from throwing if the plugin
  // list is ever reordered underneath us.
  function noGoRegion() {
    return (window.RegionRules && window.RegionRules.NO_GO_REGION) || 7;
  }

  Game_System.prototype.findRegion13Tiles = function (mapData) {
    const width = mapData.width;
    const height = mapData.height;
    const region13Tiles = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const regionId = this.getRegionIdFromMapData(mapData, x, y);
        if (regionId === 13) {
          region13Tiles.push({ x, y });
        }
      }
    }
    return region13Tiles;
  };

  Game_System.prototype.findPassableTiles = function (mapData) {
    const width = mapData.width || 50;
    const height = mapData.height || 50;
    const passableTiles = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x > 2 && x < width - 2 && y > 2 && y < height - 2) {
          const regionId = this.getRegionIdFromMapData(mapData, x, y);
          // Region 7 is the keep-out region: solid mass, never a spawn. It sat
          // inside the 0-9 band this scan accepts wholesale, which is how a
          // chest (and, through the fallback branch above, a staircase) came
          // to be dealt into the inside of a wall.
          if (regionId === noGoRegion()) continue;
          if (regionId >= 0 && regionId <= 9) {
            passableTiles.push({ x, y });
          }
        }
      }
    }

    if (passableTiles.length > 50) {
      for (let i = passableTiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.dungeonRandom() * (i + 1));
        [passableTiles[i], passableTiles[j]] = [
          passableTiles[j],
          passableTiles[i],
        ];
      }
      return passableTiles.slice(0, 50);
    }
    return passableTiles;
  };

  Game_System.prototype.getRegionIdFromMapData = function (mapData, x, y) {
    const regionLayerIndex = 5; // In MZ, layer 5 is typically regions.
    const index =
      y * mapData.width + x + regionLayerIndex * mapData.width * mapData.height;
    if (mapData.data && index < mapData.data.length) {
      const regionId = mapData.data[index];
      if (regionId > 0 && regionId < 256) {
        return regionId;
      }
    }
    return 0;
  };

  Game_System.prototype.getStairLocation = function (floor, isUpstairs) {
    const defaultLoc = {
      mapId: params.townMapId,
      x: params.playerSpawnX,
      y: params.playerSpawnY,
    };
    if (floor < 0 || floor > 100 || !this._stairLocations[floor])
      return defaultLoc;

    const loc = isUpstairs
      ? this._stairLocations[floor].upstairs
      : this._stairLocations[floor].downstairs;
    return loc && loc.mapId > 0 ? loc : defaultLoc;
  };

  Game_System.prototype.updateMaxFloor = function (floor) {
    const currentMax = $gameVariables.value(params.maxFloorVariable) || 0;
    if (floor > currentMax) {
      $gameVariables.setValue(params.maxFloorVariable, floor);
    }
  };
  Game_System.prototype.findPassableTilesFromTilesets = function (mapData) {
    const width = mapData.width || 50;
    const height = mapData.height || 50;
    const passableTiles = [];
  
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Keep boundary check to avoid edge tiles
        if (x > 2 && x < width - 2 && y > 2 && y < height - 2) {
          if (this.getRegionIdFromMapData(mapData, x, y) === noGoRegion()) continue;
          if (this.isPassableTileFromTilesets(mapData, x, y)) {
            passableTiles.push({ x, y });
          }
        }
      }
    }
  
    // Shuffle using seeded random to ensure consistency
    if (passableTiles.length > 1) {
      for (let i = passableTiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.dungeonRandom() * (i + 1));
        [passableTiles[i], passableTiles[j]] = [passableTiles[j], passableTiles[i]];
      }
    }
  
    // Return up to 50 tiles
    return passableTiles.slice(0, 50);
  };
  
  

// Replace the existing isPassableTileFromTilesets function with this:
Game_System.prototype.isPassableTileFromTilesets = function (mapData, x, y) {
  // Check all layers for tiles from A1 or A5 tilesets
  const layersToCheck = [0, 1, 2]; // Bottom 3 layers typically contain terrain
  const index = y * mapData.width + x;

  for (const layer of layersToCheck) {
    const layerIndex = index + layer * mapData.width * mapData.height;
    if (mapData.data && layerIndex < mapData.data.length) {
      const tileId = mapData.data[layerIndex];
      if (tileId > 0) {
        // In RPG Maker MZ:
        // A1 tiles (animated water/ground): 2048-2815
        // A5 tiles (ground autotiles): 1536-1663
        if ((tileId >= 2048 && tileId <= 2815) ||  // A1 tiles
            (tileId >= 1536 && tileId <= 1663)) {   // A5 tiles
          return true;
        }
      }
    }
  }
  return false;
};
  //=============================================================================
  // World initialization
  //=============================================================================
  // The floor layout, the staircases, the treasure rooms and the chest
  // positions are all rolled from the world seed, so they belong to the world
  // and not to the run that first walked down the stairs. Generating them when
  // the world is made means the dungeon exists before anybody enters it (the
  // floor list, the elevator and "teleport to highest floor" all read a real
  // layout from the start) and every savegame of the world descends through
  // the same hundred floors.
  if (window.WorldManager && window.WorldManager.registerWorldInitializer) {
    window.WorldManager.registerWorldInitializer("dungeon", 40, () => {
      $gameSystem.initDungeonSystem();
      if (!$gameSystem.isDungeonGenerated() || $gameSystem.isDemoLayoutStale()) {
        $gameSystem.generateDungeon();
      } else {
        // The layout was already on disk (a world made before this step
        // existed). It still owes the world switch that says so.
        $gameSystem.markDungeonGenerated();
      }
    });
  }

  //=============================================================================
  // Plugin Commands
  //=============================================================================

  PluginManager.registerCommand(pluginName, "generateDungeon", (args) => {
    $gameSystem.generateDungeon();
  });

  PluginManager.registerCommand(pluginName, "nextFloor", (args) => {
    // Below ground the numbering runs the other way: NextFloor is the way
    // DEEPER, so it takes -21 to -22 and stops at the bottom of the shaft.
    const lower = activeLowerFloor();
    if (lower) {
        if (lower <= TOWER.DEEPEST) return;
        moveToLowerFloor(lower - 1, "prev");
        return;
    }

    let currentFloor = $gameVariables.value(params.currentFloorVariable);
    // Map 635 is the dungeon base (floor 0). Reaching it via the world graph
    // (303/540/631), fast-travel or respawn can leave a stale floor value here,
    // which would route to the wrong floor or no-op. Force floor 0 so entering
    // always lands on the fixed first floor (accursed market).
    if ($gameMap.mapId() === 635) {
        currentFloor = 0;
        $gameVariables.setValue(params.currentFloorVariable, 0);
    }
    const maxFloor = params.demoMode ? params.demoMaxFloor : 100;
    if (currentFloor < 0 || currentFloor >= maxFloor) {
        return;
    }
    moveToFloor(currentFloor === 0 ? 1 : currentFloor + 1, true);
});

  PluginManager.registerCommand(pluginName, "prevFloor", (args) => {
    // The Stairs Hall is the mouth of the lower tower: going down from here is
    // floor -1, whatever the last floor value happened to be.
    if ($gameMap.mapId() === TOWER.STAIRS_HALL.mapId) {
        moveToLowerFloor(-1, "prev");
        return;
    }

    // Below ground PrevFloor is the way back UP, and out of floor -1 it leaves
    // the tower altogether.
    const lower = activeLowerFloor();
    if (lower) {
        if (lower === -1) leaveLowerTower();
        else moveToLowerFloor(lower + 1, "next");
        return;
    }

    let currentFloor = $gameVariables.value(params.currentFloorVariable);
    // Map 101 is always floor 1 (hardcoded in generateDungeon). Arriving here by
    // any other route (fast travel, respawn, a stale/negative floor value) would
    // otherwise make the Exit events dead, so force floor 1 like map 635 forces 0.
    if ($gameMap.mapId() === 101) {
        currentFloor = 1;
        $gameVariables.setValue(params.currentFloorVariable, 1);
    }
    if (currentFloor <= 0) {
        return;
    }
    moveToFloor(currentFloor - 1, false); // false for going down
  });

  PluginManager.registerCommand(pluginName, "setFloor", (args) => {
    const floor = parseInt(args.floor || 1);
    const maxFloor = params.demoMode ? params.demoMaxFloor : 100;
    if (floor > maxFloor) {
        console.warn(`Demo mode: Cannot go beyond floor ${maxFloor}`);
        return;
    }
    moveToFloor(floor, "downstairs");
});
PluginManager.registerCommand(pluginName, "elevator", (args) => {
  // The floor panel writes the chosen floor to variable 17; the elevator hall's
  // own door event writes variable 1. Read the choice first and fall back to
  // the hall's value only when variable 17 holds nothing that names a floor.
  const chosen = $gameVariables.value(params.elevatorFloorVariable);
  const floor = isKnownFloor(chosen)
      ? chosen
      : $gameVariables.value(params.currentFloorVariable);

  if (floor === TOWER.SECRET_STAIRWAY.floor) {
      // Floor -22's doors open on Omega City, never on the stairway itself.
      const city = TOWER.OMEGA_CITY;
      $gameVariables.setValue(params.currentFloorVariable, floor);
      $gameVariables.setValue(params.elevatorFloorVariable, floor);
      recordTowerDepth(floor);
      clearTowerSession();
      $gameScreen.startFadeOut(1);
      $gamePlayer.reserveTransfer(city.mapId, city.x, city.y, city.dir, 0);
      return;
  }
  if (isGeneratedLowerFloor(floor)) {
      moveToLowerFloor(floor, "elevator");
      return;
  }
  // The Tip of the Spear is not a stop on this line: floor -91's staircase is
  // the only way onto it, so a lift asked for it does nothing.
  if (isLowerFloor(floor)) return;

  const maxFloor = params.demoMode ? params.demoMaxFloor : 100;
  if (floor >= 0 && floor <= maxFloor) {
      moveToFloor(floor, "elevator");
  } else {
      console.error(
          "Invalid floor number in variable " +
          params.elevatorFloorVariable +
          ": " +
          floor +
          (params.demoMode ? T('DungeonFloor.demoLimit', { max: maxFloor }) : "")
      );
  }
});

  PluginManager.registerCommand(pluginName, "teleportToHighest", (args) => {
    const maxFloor = $gameVariables.value(params.maxFloorVariable);
    moveToFloor(maxFloor > 0 ? maxFloor : 1, null);
  });

  PluginManager.registerCommand(
    pluginName,
    "teleportToNearestStairs",
    (args) => {
      teleportToNearestStairs();
    }
  );

  PluginManager.registerCommand(pluginName, "teleportToUpstairs", (args) => {
    teleportToSpecificStairs(true);
  });

  PluginManager.registerCommand(pluginName, "teleportToDownstairs", (args) => {
    teleportToSpecificStairs(false);
  });

  //=============================================================================
  // Helper Functions
  //=============================================================================
  function findRegion20Spawn(mapId) {
    try {
      const mapData = loadMapDataSync(mapId);
      if (mapData) {
        const width = mapData.width;
        const height = mapData.height;

        // Search for the first tile with region ID 20
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const regionId = $gameSystem.getRegionIdFromMapData(mapData, x, y);
            if (regionId === 20) {
              return { x: x, y: y };
            }
          }
        }
      }
    } catch (e) {
      console.error("Error loading map data for elevator spawn on mapId " + mapId, e);
    }

    return null; // Return null if no region 20 tile found
  }
  
  //=============================================================================
  // THE LOWER TOWER (floors -1 to -92)
  //=============================================================================
  // The hundred floors above ground are hand-made maps dealt from the pools at
  // the top of this file. Everything BELOW ground is generated instead: each of
  // the 92 lower floors is one of the structures in the procedural catalogue (a
  // sewer, a crypt, a cellar, a mineshaft, ...), rolled from the world seed so
  // a given floor is always the same place, and walked through the NextFloor /
  // PrevFloor / Elevator events the procedural map (636) already carries.
  //
  // The staircases read the other way round down here: deeper means a SMALLER
  // number, so NextFloor takes -21 to -22 and PrevFloor takes -23 back to -22.
  // That inversion is the whole difference between the two halves of the tower.
  //
  // Two of the 92 are authored maps rather than generated ones, and they are
  // also the only two that hold no roaming enemies, so the depth ladder steps
  // over them: -22 is the Secret Stairway (whose lift opens on Omega City) and
  // -92 is the Tip of the Spear, which nothing but floor -91's staircase
  // reaches and which the elevator never lists.
  const PROC_MAP_ID = 636;

  const TOWER = {
    DEEPEST: -92,
    // The tower's own world square (WorldGen/HardcodedBiomeNames "79,124").
    // Every lower floor is generated FROM it rather than from wherever the
    // party happened to be standing when they took the stairs, or the same
    // floor would be a different place on every visit.
    WORLD_X: 79,
    WORLD_Y: 124,
    // Floor 0: the hall the lower tower hangs off. Coming back up from -1
    // lands north of its down staircase, facing away from it.
    STAIRS_HALL: { mapId: 635, x: 13, y: 19, dir: 8 },
    // Where climbing out of floor -1 puts the party: not the Stairs Hall, but
    // the mouth the lower tower actually opens onto.
    LOWER_EXIT: { mapId: 314, x: 61, y: 100, dir: 8 },
    SECRET_STAIRWAY: {
      floor: -22, mapId: 1177,
      down: { x: 3, y: 6, dir: 2 },   // arrived from -21, on the way deeper
      up: { x: 12, y: 10, dir: 4 },   // arrived from -23, on the way back up
    },
    OMEGA_CITY: { mapId: 631, x: 66, y: 153, dir: 2 },
    TIP_OF_THE_SPEAR: { floor: -92, mapId: 834, x: 6, y: 6, dir: 2 },
    // What a creature standing on the first lower floor weighs, and what one
    // standing on the last generated floor (-91) does. Everything in between is
    // a straight climb over the 90 floors that hold enemies at all.
    //
    // The last rung is the top of the bestiary, not a number picked for how
    // deep it sounds. Nothing in Enemies.json is built above level 100, so the
    // old 222 meant every floor from about -31 down was asking for creatures
    // that do not exist and got handed the same top-of-the-table roster: sixty
    // floors of descent with no ladder left in them. Spread over the 90 floors
    // that hold enemies, the climb is now real the whole way down.
    FIRST_LEVEL: 40,
    LAST_LEVEL: 100,
    // Folded into the procedural seed so no two floors share a layout, and into
    // the terrain/furniture record key so nothing carried out of one is still
    // standing in another.
    SALT: 7700,
  };

  function isLowerFloor(floor) {
    return Number.isFinite(floor) && floor <= -1 && floor >= TOWER.DEEPEST;
  }

  // The two lower floors that are authored maps: no generation, no enemies.
  function isAuthoredLowerFloor(floor) {
    return floor === TOWER.SECRET_STAIRWAY.floor || floor === TOWER.TIP_OF_THE_SPEAR.floor;
  }

  function isGeneratedLowerFloor(floor) {
    return isLowerFloor(floor) && !isAuthoredLowerFloor(floor);
  }

  function isKnownFloor(floor) {
    return Number.isFinite(floor) && floor >= TOWER.DEEPEST && floor <= 100;
  }

  // How many enemy-bearing lower floors there are, and where a floor stands in
  // that run: -1 is the first (index 0) and -91 the last (index 89).
  const TOWER_ENEMY_FLOORS = 90;

  function towerFloorIndex(floor) {
    let index = 0;
    for (let f = -1; f > floor; f--) {
      if (!isAuthoredLowerFloor(f)) index++;
    }
    return index;
  }

  // The level a creature met on a lower floor is built around. It is the depth
  // and nothing else: the party's own level, the biome and the calendar all
  // have no say down here, which is what makes the descent a ladder.
  function towerEnemyLevel(floor) {
    if (!isGeneratedLowerFloor(floor)) return 0;
    const span = TOWER_ENEMY_FLOORS - 1;
    const t = Math.max(0, Math.min(1, towerFloorIndex(floor) / span));
    return Math.round(TOWER.FIRST_LEVEL + (TOWER.LAST_LEVEL - TOWER.FIRST_LEVEL) * t);
  }

  // Which structure a floor is. Read off the procedural catalogue, which is the
  // only list of them, so a structure added there is dealt down here too. The
  // vault is the exception: it is the rarest find out in the world and stays a
  // find, never a floor the tower simply hands over.
  function towerStructureKeys() {
    const D = window.ProcGenDungeon;
    const all = (D && typeof D.structures === "function") ? D.structures() : [];
    return all.filter((s) => s && s.key && s.key !== "PatronVault");
  }

  function towerFloorBiome(floor) {
    const list = towerStructureKeys();
    if (!list.length) return "Dungeon";
    // The catalogue's own weights, floored so the entrance-exclusive structures
    // (the Sewer weighs 0 out in the world, because a grate is the only way in)
    // are at home in a tower whose floors have no surface to be entered from.
    const weights = list.map((s) => Math.max(10, s.weight || 0));
    const total = weights.reduce((sum, w) => sum + w, 0);
    const rng = createSeededRandom(`tower:${dungeonWorldSeed()}:${floor}`);  // i18n-ignore  seed string
    let roll = rng() * total;
    for (let i = 0; i < list.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return list[i].key;
    }
    return list[list.length - 1].key;
  }

  // How deep the world has been. Kept as a positive number of floors, so 22
  // means floor -22 has been stood on. RandomLootSystem reads it through
  // window.DungeonFloors so a deep descent pays like a high climb does.
  function recordTowerDepth(floor) {
    if (!isLowerFloor(floor)) return;
    const depth = Math.abs(floor);
    if (depth > (($gameSystem && $gameSystem._dungeonDepthReached) || 0)) {
      $gameSystem._dungeonDepthReached = depth;
    }
  }

  function towerDepthReached() {
    return (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._dungeonDepthReached) || 0;
  }

  // Floor -1 and floor -22 are open from the start; everything else has to have
  // been reached. The upper half keeps its own rule (variable 2).
  function isLowerFloorUnlocked(floor) {
    if (!isLowerFloor(floor)) return false;
    if (floor === -1 || floor === TOWER.SECRET_STAIRWAY.floor) return true;
    return Math.abs(floor) <= towerDepthReached();
  }

  // The floor the party is standing on, read off the procedural session rather
  // than off variable 1: the variable can go stale (fast travel, a respawn, a
  // save made elsewhere) and the session cannot, since it is written when the
  // floor is generated and torn down when the party leaves it.
  function currentTowerFloor() {
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== PROC_MAP_ID) return 0;
    const pg = $gameSystem && $gameSystem._procGenData;
    const session = pg && pg._dungeonSession;
    if (!session || session.type !== "tower") return 0;
    const floor = session.floor || 0;
    // A session left standing by some other way out of the tower (a respawn, a
    // load, a fast travel) must never turn the next ordinary square into a
    // floor, so the biome the map was actually built from has to be the one
    // that floor is made of.
    if (!isGeneratedLowerFloor(floor)) return 0;
    if (pg.currentBiome !== towerFloorBiome(floor)) return 0;
    return floor;
  }

  // A tower session says where the party IS, and its owner clears it: leaving a
  // floor by any of the tower's own exits ends it, or the border of the next
  // ordinary procedural map would still be sealed.
  function clearTowerSession() {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (pg && pg._dungeonSession && pg._dungeonSession.type === "tower") {
      pg._dungeonSession = null;
    }
    $gameSystem._towerArrival = null;
    $gameSystem._towerLayout = null;
  }

  // The floor a staircase command should act on. The generated floor underfoot
  // is read off the procedural session; the two authored floors carry no
  // session of their own, so on those two maps - and on no others - the map id
  // names the floor. Variable 1 is never trusted for this: it goes stale on a
  // fast travel or a respawn, and a stale value would drop a party standing in
  // the Stairs Hall down the shaft.
  function activeLowerFloor() {
    const live = currentTowerFloor();
    if (live) return live;
    const mapId = (typeof $gameMap !== "undefined" && $gameMap) ? $gameMap.mapId() : 0;
    if (mapId === TOWER.SECRET_STAIRWAY.mapId) return TOWER.SECRET_STAIRWAY.floor;
    if (mapId === TOWER.TIP_OF_THE_SPEAR.mapId) return TOWER.TIP_OF_THE_SPEAR.floor;
    return 0;
  }

  function ensureProcGenData() {
    if (!$gameSystem._procGenData) {
      $gameSystem._procGenData = {
        originX: 0, originY: 0, currentBiome: null, currentRoadDirection: null,
        currentBiomeTileset: null, generatedMapData: null, biomeToTileset: {},
        mapPreloaded: false, seed: 12345, biomeCoordinateCache: {},
        lastLoadedProcMapX: null, lastLoadedProcMapY: null, displayAsBeach: false,
        biomeLayerStack: [],
      };
    }
    return $gameSystem._procGenData;
  }

  // ---------------------------------------------------------------------------
  // Where the three staircase events stand on a generated floor
  // ---------------------------------------------------------------------------
  // NextFloor, PrevFloor and the Elevator all have to be reachable from one
  // another and none of them may stand in a one-tile corridor, where an event
  // with a solid priority (the lift) would wall the floor in two. The rule is
  // read off the map as it was actually carved, not off the room rectangles the
  // carver started from: ornaments, the border clip and the wall ring all move
  // afterwards, so only the finished map can be trusted.
  const TOWER_MIN_OPENNESS = 8;     // standable tiles in the 3x3 around a post
  // The hard floor: a genuine 1-wide corridor (self + the tile ahead + the
  // tile behind, nothing to either side) opens onto 3 of the 9 tiles around
  // it, a corner a couple more. Relaxation never goes below this, so a post
  // is never dealt a spot with no room to stand beside it.
  const TOWER_MIN_WIDTH_OPENNESS = 5;
  const TOWER_GAPS = [12, 8, 5, 2, 0];

  // A post may only stand on ground the floor was actually carved with. Asking
  // checkPassage alone was not enough: it answers with the topmost tile that
  // has an opinion, so a torch or a chain hung on the rock (layer 2) speaks for
  // the rock underneath it, and in a tileset whose ceiling blend is not flagged
  // impassable the whole dead mass answers "yes" on its own. That is how a
  // staircase and a lift ended up inside a wall, reachable only by broomstick.
  // The ground tile itself is asked first, and it has to be a real, drawn,
  // walkable floor: the void past the rim is tile 0, which is nothing at all.
  function towerGroundIsFloor(x, y) {
    const tileId = $gameMap.tileId(x, y, 0);
    if (!tileId) return false;
    const flags = $gameMap.tilesetFlags();
    const flag = flags ? flags[tileId] : undefined;
    if (flag === undefined) return false;
    if ((flag & 0x10) !== 0) return false;   // a star tile is scenery, not ground
    return (flag & 0x0f) === 0;
  }

  function towerCanStand(x, y) {
    if (x < 0 || y < 0 || x >= $gameMap.width() || y >= $gameMap.height()) return false;
    const region = $gameMap.regionId(x, y);
    if (region === noGoRegion()) return false;             // painted keep-out: solid mass
    if (region === 99) return true;                        // water is swum, not walked
    if (!towerGroundIsFloor(x, y)) return false;
    return $gameMap.checkPassage(x, y, 0x0f);
  }

  function towerOpenness(x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (towerCanStand(x + dx, y + dy)) n++;
      }
    }
    return n;
  }

  // Walking distance from the carved entrance to every tile the party can
  // reach. Anything left at -1 is walled off and can never hold a staircase.
  function towerDistanceMap(startX, startY) {
    const w = $gameMap.width(), h = $gameMap.height();
    const dist = new Int32Array(w * h).fill(-1);
    if (!towerCanStand(startX, startY)) return dist;
    const queue = [startX + startY * w];
    dist[startX + startY * w] = 0;
    for (let head = 0; head < queue.length; head++) {
      const idx = queue[head];
      const x = idx % w, y = (idx / w) | 0;
      const d = dist[idx];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = nx + ny * w;
        if (dist[ni] !== -1 || !towerCanStand(nx, ny)) continue;
        dist[ni] = d + 1;
        queue.push(ni);
      }
    }
    return dist;
  }

  function towerLayout(floor) {
    const cached = $gameSystem._towerLayout;
    if (cached && cached.floor === floor && cached.width === $gameMap.width()) return cached;
    const layout = buildTowerLayout(floor);
    $gameSystem._towerLayout = layout;
    return layout;
  }

  function buildTowerLayout(floor) {
    const w = $gameMap.width(), h = $gameMap.height();
    const gen = ($gameSystem._procGenData && $gameSystem._procGenData.generatedMapData) || null;
    let startX = (gen && gen.spawnX != null) ? gen.spawnX : Math.floor(w / 2);
    let startY = (gen && gen.spawnY != null) ? gen.spawnY : Math.floor(h / 2);
    // The carve's own spawn is a non-index property of the tile array, and
    // JSON.stringify drops those: a floor walked back onto out of a savegame
    // has no recorded entrance and falls back to the middle of the map, which
    // on a plan that does not reach the middle is solid rock. Flooding from
    // rock reaches nothing, and all three staircases used to be dealt the
    // fallback tile - inside the mass. Walk out to the nearest real floor
    // first, so the flood always starts somewhere the party could stand.
    if (!towerCanStand(startX, startY)) {
      let best = null, bestD = Infinity;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!towerCanStand(x, y)) continue;
          const d = Math.abs(x - startX) + Math.abs(y - startY);
          if (d < bestD) { bestD = d; best = { x, y }; }
        }
      }
      if (best) { startX = best.x; startY = best.y; }
    }
    const dist = towerDistanceMap(startX, startY);
    const rng = createSeededRandom(`towerLayout:${dungeonWorldSeed()}:${floor}`);  // i18n-ignore  seed string

    // Every tile the party can walk to, ranked by how open it is. A post is
    // only ever taken from the open end of that list.
    const reachable = [];
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (dist[x + y * w] < 0) continue;
        reachable.push({ x, y, dist: dist[x + y * w], open: towerOpenness(x, y) });
      }
    }
    if (!reachable.length) {
      // Nothing at all to stand on two tiles in from the border: put all three
      // posts on the flood's own start, which the scan above guarantees is
      // floor whenever the floor has any.
      const fallback = { x: startX, y: startY };
      return towerLayoutFrom(floor, w, fallback, fallback, fallback);
    }

    let rooms = reachable.filter((t) => t.open >= TOWER_MIN_OPENNESS);
    for (let relax = TOWER_MIN_OPENNESS - 1; !rooms.length && relax >= TOWER_MIN_WIDTH_OPENNESS; relax--) {
      rooms = reachable.filter((t) => t.open >= relax);
    }
    // Relaxation stops at TOWER_MIN_WIDTH_OPENNESS on purpose and never below
    // it: a straight 1-wide corridor tile opens onto at most itself and the
    // two tiles ahead/behind it (3), a corner or dead end little more, so
    // dropping the floor further is exactly how a stair used to land in one.
    // If even that is too much to ask of the whole floor, take the widest
    // spots there are instead of giving up on width altogether.
    if (!rooms.length) {
      const maxOpen = reachable.reduce((m, t) => Math.max(m, t.open), 0);
      rooms = reachable.filter((t) => t.open >= maxOpen);
    }

    // The lift is set into a wall: the tile it stands on has rock to its north
    // and open floor to its south, so the party steps out in front of it.
    const lifts = reachable.filter((t) =>
      !towerCanStand(t.x, t.y - 1) &&
      towerCanStand(t.x, t.y + 1) && towerCanStand(t.x, t.y + 2) &&
      towerCanStand(t.x - 1, t.y + 1) && towerCanStand(t.x + 1, t.y + 1) &&
      towerOpenness(t.x, t.y + 1) >= 7);
    const elevator = lifts.length
      ? lifts[Math.floor(rng() * lifts.length)]
      : rooms[Math.floor(rng() * rooms.length)];

    const far = (a, b, gap) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= gap;
    let prev = null, next = null;
    for (const gap of TOWER_GAPS) {
      // The way back up sits nearest the entrance the floor was carved with;
      // the way down sits as deep into the plan as the carver's own boss-room
      // hint says, or simply as far from the entrance as the floor allows.
      const prevPool = rooms.filter((t) => far(t, elevator, gap));
      if (!prevPool.length) continue;
      prev = prevPool.reduce((best, t) => (t.dist < best.dist ? t : best), prevPool[0]);
      const hint = gen && gen.bossRoomHint;
      const nextPool = rooms.filter((t) => far(t, elevator, gap) && far(t, prev, gap));
      if (!nextPool.length) { prev = null; continue; }
      next = hint
        ? nextPool.reduce((best, t) => (
            Math.abs(t.x - hint.x) + Math.abs(t.y - hint.y) <
            Math.abs(best.x - hint.x) + Math.abs(best.y - hint.y) ? t : best), nextPool[0])
        : nextPool.reduce((best, t) => (t.dist > best.dist ? t : best), nextPool[0]);
      break;
    }
    if (!prev) prev = rooms[0];
    if (!next) next = rooms[rooms.length - 1];

    return towerLayoutFrom(floor, w, prev, next, elevator);
  }

  // Where the party lands when they arrive by each of the three routes: beside
  // the staircase they came out of, never on it, or the tile in front of the
  // lift's doors.
  function towerLayoutFrom(floor, width, prev, next, elevator) {
    return {
      floor: floor,
      width: width,
      prev: { x: prev.x, y: prev.y },
      next: { x: next.x, y: next.y },
      elevator: { x: elevator.x, y: elevator.y },
      prevSpot: towerSpotBeside(prev),
      nextSpot: towerSpotBeside(next),
      elevatorSpot: towerCanStand(elevator.x, elevator.y + 1)
        ? { x: elevator.x, y: elevator.y + 1, dir: 2 }
        : towerSpotBeside(elevator),
    };
  }

  function towerSpotBeside(post) {
    const around = [[0, 1, 8], [0, -1, 2], [-1, 0, 6], [1, 0, 4]];
    for (const [dx, dy, dir] of around) {
      if (towerCanStand(post.x + dx, post.y + dy)) {
        return { x: post.x + dx, y: post.y + dy, dir: dir };
      }
    }
    return { x: post.x, y: post.y, dir: 2 };
  }

  // The three posts and the tile the party lands on beside each of them.
  function towerReservedTiles() {
    const floor = currentTowerFloor();
    if (!isGeneratedLowerFloor(floor)) return [];
    const layout = towerLayout(floor);
    if (!layout) return [];
    const tiles = [];
    for (const spot of [layout.prev, layout.next, layout.elevator,
                        layout.prevSpot, layout.nextSpot, layout.elevatorSpot]) {
      if (spot) tiles.push({ x: spot.x, y: spot.y });
    }
    return tiles;
  }

  function towerStaircaseEvents() {
    const found = { NextFloor: null, PrevFloor: null, Elevator: null };
    for (const event of $gameMap.events()) {
      const data = event && event.event();
      if (!data) continue;
      if (found.hasOwnProperty(data.name) && !found[data.name]) found[data.name] = event;
    }
    return found;
  }

  // Game_Character.locate() straightens the character, which forces pattern 1
  // and drops the page's own frame. A staircase, a door or a chest picks which
  // sprite of its sheet to show by that pattern (the !Stairs sheet holds the
  // down flight at pattern 0 and the up flight at pattern 2), so a plain
  // locate() shows the wrong one until the next event refresh puts it back.
  // Anything that MOVES a standing prop goes through this instead: it is a
  // Game_Character method rather than a local so the house system's Upstairs /
  // Downstairs and every other stair mover share the one answer.
  Game_Character.prototype.locateKeepingPose = function (x, y) {
    const pattern = this._originalPattern;
    const direction = this.direction();
    this.locate(x, y);
    if (pattern !== undefined && pattern !== null) this.setPattern(pattern);
    this.setDirection(direction);
  };

  function placeEventKeepingPose(event, x, y) {
    if (!event) return;
    event.locateKeepingPose(x, y);
  }

  function towerShowEvent(event, at) {
    if (!event || !at) return;
    placeEventKeepingPose(event, at.x, at.y);
    event.setOpacity(255);
    event.setThrough(false);
  }

  function towerHideEvent(event) {
    if (!event) return;
    event.locate(-1, -1);
    event.setOpacity(0);
    event.setThrough(true);
  }

  // The three staircase events belong to the lower tower alone. Every other
  // procedural map - a field, a cave, a cellar under a farmhouse - must not
  // show them, and before this they stood wherever the map template parked them
  // on every square in the world.
  function updateTowerFloorEvents() {
    const events = towerStaircaseEvents();
    const floor = currentTowerFloor();
    if (!isGeneratedLowerFloor(floor)) {
      towerHideEvent(events.NextFloor);
      towerHideEvent(events.PrevFloor);
      towerHideEvent(events.Elevator);
      $gameSystem._towerArrival = null;
      return;
    }
    const layout = towerLayout(floor);
    towerShowEvent(events.PrevFloor, layout.prev);
    towerShowEvent(events.NextFloor, layout.next);
    towerShowEvent(events.Elevator, layout.elevator);

    const arrival = $gameSystem._towerArrival;
    if (!arrival) return;
    $gameSystem._towerArrival = null;
    const spot = arrival === "elevator" ? layout.elevatorSpot
      : arrival === "next" ? layout.nextSpot : layout.prevSpot;
    if (!spot) return;
    $gamePlayer.locate(spot.x, spot.y);
    $gamePlayer.setDirection(spot.dir);
  }

  // ---------------------------------------------------------------------------
  // Going down and coming back up
  // ---------------------------------------------------------------------------
  // `arrival` names the staircase the party comes out beside on the new floor:
  // going deeper they arrive at its PrevFloor (the way back), coming up they
  // arrive at its NextFloor, and out of the lift they arrive in front of it.
  function enterGeneratedLowerFloor(floor, arrival) {
    const biome = towerFloorBiome(floor);
    const pg = ensureProcGenData();
    pg.originX = TOWER.WORLD_X;
    pg.originY = TOWER.WORLD_Y;
    // Every lower floor stands on the tower's own world square, so two
    // different floors read as "the same coordinates as last time" to
    // WorldMapReturn's DataManager.loadMapData - which then treats the new
    // floor as the square already sitting in $dataMap and returns without
    // calling the underlying loader at all. That skips the WHOLE chain hung
    // off it, not just the file re-read: ProceduralMapPrefabs' prefab stamp
    // (the set piece a TempleInside floor rolls) and the fresh copy of
    // $dataMap.events (NextFloor / PrevFloor / Elevator among them) both live
    // behind that same call and never run past floor one. Clearing the
    // cached coordinates forces a genuine reload on every descent or climb.
    pg.lastLoadedProcMapX = null;
    pg.lastLoadedProcMapY = null;
    // No door back to the surface: the structure generator's south-border
    // entrance corridor is a way out that the tower must never have, since
    // the only ways off a floor are its own three staircase events. Read once
    // by startForcedBiome and cleared there so it never leaks into an
    // unrelated sandbox dungeon.
    pg._sealEntrance = true;
    $gameVariables.setValue(43, TOWER.WORLD_X);
    $gameVariables.setValue(44, TOWER.WORLD_Y);
    $gameSystem._towerArrival = arrival || "prev";
    $gameSystem._towerLayout = null;

    PluginManager.callCommand($gameMap._interpreter || {}, "WorldMapReturn", "startForcedBiome",
      { Biome: biome, Salt: TOWER.SALT + Math.abs(floor) });

    // startForcedBiome opens an ordinary sandbox session, whose border is the
    // way out. A tower floor has no way out but its own staircases, so the
    // session is re-stamped: WorldMapReturn reads the type and seals the border.
    const session = $gameSystem._procGenData && $gameSystem._procGenData._dungeonSession;
    if (session) {
      session.type = "tower";
      session.floor = floor;
    }
  }

  function moveToLowerFloor(floor, arrival) {
    if (!isLowerFloor(floor)) return;
    $gameVariables.setValue(params.currentFloorVariable, floor);
    $gameVariables.setValue(params.elevatorFloorVariable, floor);
    recordTowerDepth(floor);
    $gameSystem._towerArrival = null;

    if (floor === TOWER.SECRET_STAIRWAY.floor) {
      const stair = TOWER.SECRET_STAIRWAY;
      clearTowerSession();
      $gameScreen.startFadeOut(1);
      if (arrival === "elevator") {
        // The lift does not stop at the stairway itself: its doors open on
        // Omega City, which is the whole reason floor -22 is open from the start.
        const city = TOWER.OMEGA_CITY;
        $gamePlayer.reserveTransfer(city.mapId, city.x, city.y, city.dir, 0);
      } else {
        const spot = arrival === "next" ? stair.up : stair.down;
        $gamePlayer.reserveTransfer(stair.mapId, spot.x, spot.y, spot.dir, 0);
      }
      return;
    }

    if (floor === TOWER.TIP_OF_THE_SPEAR.floor) {
      const tip = TOWER.TIP_OF_THE_SPEAR;
      clearTowerSession();
      $gameScreen.startFadeOut(1);
      $gamePlayer.reserveTransfer(tip.mapId, tip.x, tip.y, tip.dir, 0);
      return;
    }

    enterGeneratedLowerFloor(floor, arrival);
  }

  // Out of floor -1 and back up to the mouth the lower tower opens onto.
  function leaveLowerTower() {
    $gameVariables.setValue(params.currentFloorVariable, 0);
    $gameVariables.setValue(params.elevatorFloorVariable, 0);
    clearTowerSession();
    const exit = TOWER.LOWER_EXIT;
    $gameScreen.startFadeOut(1);
    $gamePlayer.reserveTransfer(exit.mapId, exit.x, exit.y, exit.dir, 0);
  }

  // What the elevator's floor list calls a lower floor. An unreached one is
  // never named: the structure it holds is part of what is found down there.
  function lowerFloorLabel(floor) {
    if (floor === TOWER.SECRET_STAIRWAY.floor) return T("FloorList.omegaCity");
    if (floor === TOWER.TIP_OF_THE_SPEAR.floor) return T("FloorList.tipOfTheSpear");
    const biome = towerFloorBiome(floor);
    const name = window.BiomeNames ? window.BiomeNames.display(biome) : biome;
    return T("FloorList.lowerFloor", { num: floor, name: name });
  }

  // ---------------------------------------------------------------------------
  // Bailing out of the tower
  // ---------------------------------------------------------------------------
  // "Return to the world map" is offered everywhere now (Map/WorldMapReturn.js),
  // and the one place it must not be taken at its word is inside the tower: a
  // floor is not a square of the world, it is somewhere the party climbed into,
  // and the way out of it is the lift. So the request is handed here first and
  // the dungeon answers it with the elevator whenever the party is standing on
  // one of its floors. A false answer means the tower has no claim on them and
  // the world map may have the press.
  // ---------------------------------------------------------------------------

  // The lift hall each level of nine authored floors hangs off: floors 1-9 ride
  // out through floor 10, 11-19 through 20, and everything above 90 through the
  // last hall there is.
  function elevatorFloorFor(floor) {
    return Math.min(Math.ceil(floor / 10) * 10, 90);
  }

  function onElevatorFloor() {
    return params.elevatorMaps.indexOf($gameMap.mapId()) >= 0;
  }

  // Is the party on a floor the lift is the way off of? The elevator halls
  // themselves are not: the party is already at the doors, so the world map may
  // take that press and let them out of the tower altogether.
  function insideTower() {
    if (typeof $gameMap === "undefined" || !$gameMap) return false;
    if (currentTowerFloor()) return true;
    return isDungeonMap($gameMap.mapId()) && !onElevatorFloor();
  }

  // The map the tower's own market stands on: floor 1, reached from the Stairs
  // Hall, and the one authored floor that answers to the tower's rules without
  // being listed among the hand-made floors.
  const ACCURSED_MARKET_MAP_ID = 101;

  // Where a fight cannot simply be walked out of. Out in the world the party
  // always gets its first-turn getaway for free; on a tower floor, above ground
  // or below it, and in the accursed market, the escape is rolled like any
  // other attempt and a failure costs the runner their turn.
  function escapeIsContested() {
    if (typeof $gameMap === "undefined" || !$gameMap) return false;
    const mapId = $gameMap.mapId();
    if (mapId === ACCURSED_MARKET_MAP_ID) return true;
    if (mapId === TOWER.SECRET_STAIRWAY.mapId) return true;
    if (mapId === TOWER.TIP_OF_THE_SPEAR.mapId) return true;
    // The procedural map is only a lower floor while a tower session says so:
    // every other square in the world is drawn on the same map.
    if (mapId === PROC_MAP_ID) return currentTowerFloor() !== 0;
    // The lift halls are a hub, not a floor: nothing hunts the party there.
    return isDungeonMap(mapId) && !onElevatorFloor();
  }

  function returnToElevator() {
    if (!insideTower()) return false;

    // The generated lower floors carry their own lift, standing somewhere on the
    // floor itself, so nothing is loaded: the party simply walks out in front of
    // its doors.
    const lower = currentTowerFloor();
    if (lower) {
      const layout = towerLayout(lower);
      const spot = layout && layout.elevatorSpot;
      if (!spot) return false;
      if ($gamePlayer.x === spot.x && $gamePlayer.y === spot.y) return false;
      $gamePlayer.locate(spot.x, spot.y);
      $gamePlayer.setDirection(spot.dir);
      return true;
    }

    const floor = $gameVariables.value(params.currentFloorVariable);
    if (!(floor >= 1 && floor <= 100)) return false;
    // Stepping into the lift is not the same as having climbed to the hall it
    // stands in: the party rides out from their own floor, so that floor stays
    // the current one and the deepest floor reached never moves. The lift car
    // is the hall map for their stretch of the tower, entered at its own spot.
    const reached = $gameVariables.value(params.maxFloorVariable) || 0;
    moveToFloor(elevatorFloorFor(floor), "elevator");
    // moveToFloor books the hall as the floor the party stands on. They are in
    // the lift, not on floor 10: put their own floor back on the panel.
    $gameVariables.setValue(params.currentFloorVariable, floor);
    $gameVariables.setValue(params.elevatorFloorVariable, floor);
    if (($gameVariables.value(params.maxFloorVariable) || 0) > reached) {
      $gameVariables.setValue(params.maxFloorVariable, reached);
    }
    return true;
  }

  // The named façade. Everything outside this plugin that has to know how deep
  // the world has been, or what a creature down here weighs, asks through it.
  // ---------------------------------------------------------------------------
  // What lives on an authored floor. A floor of the upper tower is a rung, and
  // the rung says which levels stand on it, whichever map was dealt to it:
  //
  //   floors 1-5    ->  enemy levels 1-10
  //   floors 6-10   ->  1-20
  //
  // The first ten floors keep their floor at 1: the tower a newcomer walks in
  // on is a spread of everything weak, not a ladder, and it is the ceiling
  // alone that opens as they climb.
  //
  // Above the tenth the rung is halved, so the ceiling creeps up five levels
  // at a time instead of ten: a decade keeps its own floor throughout and it
  // is the upper half of it that opens the ceiling.
  //
  //   floors 11-15  ->  20-25                  floors 51-55  ->  60-65
  //   floors 16-20  ->  20-30                  floors 56-60  ->  60-70
  //   floors 21-25  ->  30-35                  floors 61-65  ->  70-75
  //   floors 26-30  ->  30-40                  floors 66-70  ->  70-80
  //   floors 31-35  ->  40-45                  floors 71-75  ->  80-85
  //   floors 36-40  ->  40-50                  floors 76-80  ->  80-90
  //   floors 41-45  ->  50-55                  floors 81-85  ->  90-95
  //   floors 46-50  ->  50-60                  floors 86-100 ->  90-100
  //
  // The top of the tower is the top of the bestiary and no further. Nothing in
  // the enemy data is built above level 100, so a rung written over it holds
  // NOBODY: the old open-ended 91-99 rung and a throne at 140-160 were both
  // asking for creatures that do not exist, and the cull fell back to whatever
  // the map declared underneath. 90-100 is the last rung the roster can
  // actually fill, so every rung from 86 up is that one.
  // The party's own level, how far from home the map lies and the enemy spawn
  // option in the menu all have no say inside the tower: the floor decides.
  // ---------------------------------------------------------------------------
  const ENEMY_LEVEL_CEILING = 100;   // the highest <Level:> in Enemies.json
  const THRONE_BAND = { min: 90, max: ENEMY_LEVEL_CEILING };

  function upperFloorEnemyBand(floor) {
    if (!Number.isFinite(floor) || floor < 1 || floor > 100) return null;
    if (floor === 100) return { min: THRONE_BAND.min, max: THRONE_BAND.max };
    if (floor >= 91) return { min: 90, max: ENEMY_LEVEL_CEILING };
    if (floor <= 5) return { min: 1, max: 10 };
    if (floor <= 10) return { min: 1, max: 20 };
    const decade = Math.ceil(floor / 10);
    const min = Math.min(decade * 10, ENEMY_LEVEL_CEILING - 10);
    // The lower half of a decade stops halfway up the rung, the upper half
    // takes the whole of it.
    const reach = (floor - (decade - 1) * 10) <= 5 ? 5 : 10;
    return { min: min, max: Math.min(min + reach, ENEMY_LEVEL_CEILING) };
  }

  // The authored floor the party is standing on, 0 when they are not on one.
  // The floor variable can go stale, so it is only believed when the map the
  // party is on really is one of that floor's rooms; otherwise the layout is
  // searched for the map.
  function currentAuthoredFloor() {
    if (typeof $gameMap === "undefined" || !$gameMap) return 0;
    if (typeof $gameSystem === "undefined" || !$gameSystem) return 0;
    if (currentTowerFloor()) return 0; // the lower tower answers its own rules
    const mapId = $gameMap.mapId();
    if (!isDungeonMap(mapId) && mapId !== ACCURSED_MARKET_MAP_ID) return 0;
    if (onElevatorFloor()) return 0;

    const floors = $gameSystem._dungeonFloors || [];
    const holds = (floor) => {
      const entry = floors[floor];
      if (!entry) return false;
      return Array.isArray(entry) ? entry.indexOf(mapId) >= 0 : entry === mapId;
    };
    const current = $gameVariables.value(params.currentFloorVariable);
    if (holds(current)) return current;
    for (let floor = 1; floor <= 100; floor++) {
      if (holds(floor)) return floor;
    }
    return 0;
  }


  //===========================================================================
  // ADVENTURING BANDS ON THE FLOORS
  //===========================================================================
  // The tower is not the party's private dungeon: other people climb it too.
  // Every floor that holds creatures also holds nobody to three bands of
  // adventurers, one to three of them apiece, who walk it together and fight
  // what they meet. A band is a leader and its followers: the leader picks
  // where to go (the nearest monster it can see, otherwise wherever), the
  // followers keep to its heels, and whoever ends up beside a creature trades
  // blows with it until one side is down.
  //
  // The fight is resolved on the same terms as the wildlife's own brawls (see
  // Enemy vs Enemy Combat in BattleSystemEnhancedEncounters.js): the monster's
  // map HP is worn down, the wound is written to the record a real battle would
  // restore from, and a felled creature leaves the same harvestable corpse the
  // ecology leaves. A band that wins walks on; an adventurer who loses is taken
  // off the floor.
  //
  // Bands are session things, not world things. They are rolled when a floor is
  // walked onto and forgotten when it is left, so the tower is never the same
  // climb twice. What has to survive is the round trip through a menu, which
  // reloads $dataMap from disk and throws away every injected slot with it:
  // each member carries its own event data on itself (_towerBandData) and the
  // slot is written back before the scene reads it.
  const BAND_MAX_SIZE = 3;          // one to three adventurers to a band
  const BAND_MAX_COUNT = 3;         // and at most this many bands to a floor
  const BAND_STEP_INTERVAL = 12;    // frames between one step and the next
  const BAND_FIGHT_INTERVAL = 60;   // frames between one exchange of blows and the next
  const BAND_SIGHT = 14;            // how far a leader looks for something to kill
  // The name banks the adventurers are drawn from. Data ids, not prose: these
  // are Markov chain databases (see MarkovTextGenerator.js), and what they
  // produce is a made-up name rather than anything written here.
  const BAND_NAME_DBS = ["dungeon_explorer", "wannabe_wizard", "inmate", "thug", "guide", "scribe"];  // i18n-ignore: Markov database ids
  let bandTick = 0;

  // The floor the bands are for, and the level they are built around. Null on
  // any map that is not a floor holding creatures: the elevator halls, the
  // accursed market, the Secret Stairway and the Tip of the Spear all answer
  // no, and so does everywhere outside the tower.
  function bandFloorHere() {
    if (typeof $gameMap === "undefined" || !$gameMap) return null;
    const lower = currentTowerFloor();
    if (lower) {
      const level = towerEnemyLevel(lower);
      return level > 0 ? { floor: lower, level } : null;
    }
    const upper = currentAuthoredFloor();
    if (!upper) return null;
    const band = upperFloorEnemyBand(upper);
    if (!band) return null;
    return { floor: upper, level: Math.round((band.min + band.max) / 2) };
  }

  // Ground somebody may be put down on. Deliberately stricter than the walk
  // check: a tile a staircase, a lift or another event has a claim on is never
  // a place to stand a stranger, and neither is the square the party arrived on.
  function bandStandable(x, y, reserved) {
    if (!$gameMap.isValid(x, y)) return false;
    if (!$gameMap.isPassable(x, y, 2) || !$gameMap.isPassable(x, y, 8)) return false;
    if ($gameMap.eventsXy(x, y).length) return false;
    if ($gamePlayer && Math.abs($gamePlayer.x - x) + Math.abs($gamePlayer.y - y) < 4) return false;
    if (reserved && reserved.has(x + "," + y)) return false;
    return true;
  }

  // The staircases, the lift and the tile beside each of them. A band standing
  // on a landing is a band standing in the only way off the floor.
  function bandReservedKeys() {
    const keys = new Set();
    for (const tile of towerReservedTiles()) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) keys.add((tile.x + dx) + "," + (tile.y + dy));
      }
    }
    return keys;
  }

  function bandMembers() {
    const out = [];
    if (typeof $gameMap === "undefined" || !$gameMap) return out;
    for (const ev of $gameMap.events()) {
      if (ev && ev._towerBand && !ev._erased) out.push(ev);
    }
    return out;
  }

  // A live, battle-ready creature, asked of the encounter plugin wherever it
  // answers so the two never disagree about what counts as one.
  function bandLiveEnemy(ev) {
    if (!ev || ev._erased || ev._mbmCombatant) return false;
    if (!(ev._fixedTroopId > 0)) return false;
    const helpers = window.BSE && window.BSE.Helpers;
    if (helpers && helpers.isMonsterEvent) return helpers.isMonsterEvent(ev);
    const data = ev.event && ev.event();
    return !!(data && data.name === "Enemy");  // i18n-ignore: event name matched at runtime
  }

  function bandEnemyLevel(ev) {
    const read = window.getEnemyLevelFromEvent;
    return (read ? read(ev) : 0) || 1;
  }

  // Where a climber came from. NOT the floor they are met on: the shaft is
  // climbed from both ends and by everybody, so a band on floor 12 can be an
  // Earth woman, a goblin out of floor +44 and something fungal from -61,
  // walking together because the tower is the one thing they have in common.
  // Earth is weighted as heavily as the whole rest of the shaft put together:
  // it is the only world with a door onto the tower at ground level.
  const BAND_EARTH_SHARE = 0.5;

  function bandOriginWorld(rng) {
    if (rng() < BAND_EARTH_SHARE) return null;          // from Earth
    const worlds = allTowerWorlds();
    if (!worlds.length) return null;
    // Nobody is from a world with nobody left on it.
    const peopled = worlds.filter((w) => !w.empty);
    const pool = peopled.length ? peopled : worlds;
    return pool[Math.floor(rng() * pool.length)] || null;
  }

  // Named in their own world's voice, or in Earth's when that is where they
  // are from.
  function bandNameFrom(world, rng, index) {
    if (world) {
      try {
        const made = towerRegisterName(world.register, rng);
        if (made && made.length >= 2) return made;
      } catch (e) { /* fall through to the Earth banks */ }
    }
    return bandName(rng, index);
  }

  function bandName(rng, index) {
    const mint = window.generateSeededMarkovName;
    if (mint) {
      const dbId = BAND_NAME_DBS[Math.floor(rng() * BAND_NAME_DBS.length)];
      try {
        const name = mint(Math.floor(rng() * 0xffff), Math.floor(rng() * 0xffff),
          index + 1, dbId, 2, 4, 12);
        if (name && name !== "Unknown") return name;  // i18n-ignore: Markov generator sentinel
      } catch (e) { /* fall through to the plain title below */ }
    }
    return T("DungeonFloor.bandFallbackName");
  }

  function bandSprite(rng) {
    if (window.SpriteCatalog && window.SpriteCatalog.pickNpcKey) {
      const key = window.SpriteCatalog.pickNpcKey(rng());
      if (key) return key;
    }
    const catalogue = window.WorldGen && window.WorldGen.NPCs;
    if (!catalogue) return "";
    const pool = Object.keys(catalogue).filter((k) => {
      const e = catalogue[k];
      return !!(e && e.npc === true && e.beta !== true && e.vip !== true &&
        e.aliens !== true && e.creature !== true && e.animal !== true);
    });
    return pool.length ? pool[Math.floor(rng() * pool.length)] : "";
  }

  // The event an adventurer is: an ordinary action-button event whose one
  // command hands the press back to this plugin, so the whole of what they are
  // lives here rather than in a page nobody authored.
  function bandEventData(id, member, x, y) {
    return {
      id, name: member.name, note: "",
      x, y,
      pages: [{
        conditions: {
          actorId: 1, actorValid: false, itemId: 1, itemValid: false,
          selfSwitchCh: "A", selfSwitchValid: false,
          switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false,
          variableId: 1, variableValid: false
        },
        directionFix: false,
        image: {
          tileId: 0, characterName: member.characterName,
          characterIndex: member.characterIndex, direction: 2, pattern: 1
        },
        list: [
          { code: 357, indent: 0, parameters: [pluginName, "bandTalk", "bandTalk", {}] },  // i18n-ignore: plugin command id
          { code: 0, indent: 0, parameters: [] }
        ],
        moveFrequency: 3,
        moveRoute: { list: [{ code: 0 }], repeat: true, skippable: false, wait: false },
        moveSpeed: 4, moveType: 0, priorityType: 1, stepAnime: true,
        through: false, trigger: 0, walkAnime: true
      }]
    };
  }

  // A member put down after the spriteset was built has to be handed its
  // sprite by hand: nothing else will come back for it.
  function bandAddSprite(event) {
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    if (!spriteset || !spriteset._characterSprites || !spriteset._tilemap) return;
    const sprite = new Sprite_Character(event);
    spriteset._characterSprites.push(sprite);
    spriteset._tilemap.addChild(sprite);
  }

  function bandSpawnMember(member, x, y, bandId, isLeader) {
    if (!$dataMap.events) $dataMap.events = [null];
    const id = $dataMap.events.length;
    const data = bandEventData(id, member, x, y);
    $dataMap.events[id] = data;
    if (!$gameMap._events) $gameMap._events = [];
    const ev = new Game_Event($gameMap.mapId(), id);
    ev._towerBandData = data;
    ev._towerBand = {
      band: bandId, leader: !!isLeader, name: member.name,
      // Null means Earth (window.TowerWorlds).
      originWorld: member.originWorld || null,
      level: member.level, hp: member.hp, maxHp: member.hp
    };
    $gameMap._events[id] = ev;
    bandAddSprite(ev);
    return ev;
  }

  // Roll and put down this floor's bands. Runs once per arrival: a floor that
  // already has somebody on it (a menu closed, a save loaded) is left alone.
  function bandSpawnFloor() {
    const here = bandFloorHere();
    if (!here) return 0;
    if (typeof $dataMap === "undefined" || !$dataMap) return 0;
    if (bandMembers().length) return 0;
    const rng = createSeededRandom(
      "towerBands:" + dungeonWorldSeed() + ":" + here.floor + ":" + Graphics.frameCount);  // i18n-ignore: seed string
    // An empty floor is always on the cards: the tower is climbed, not queued
    // for, and meeting nobody on a landing is half of what makes meeting
    // somebody on the next one worth anything.
    const bands = Math.floor(rng() * (BAND_MAX_COUNT + 1));
    if (bands <= 0) return 0;
    const reserved = bandReservedKeys();
    let spawned = 0;
    for (let band = 0; band < bands; band++) {
      const size = 1 + Math.floor(rng() * BAND_MAX_SIZE);
      const anchor = bandFindAnchor(rng, reserved, size);
      if (!anchor) continue;
      const spots = bandSpotsAround(anchor, size, reserved);
      const bandId = here.floor + ":" + band + ":" + Graphics.frameCount;  // i18n-ignore: internal key
      for (let i = 0; i < spots.length; i++) {
        // Each of them separately: a band is who fell in together on the way
        // up, not a delegation from one place.
        const origin = bandOriginWorld(rng);
        const characterName = bandSprite(rng);
        if (!characterName) continue;
        // How heavy they are is the floor's business, not their homeworld's:
        // whoever is still climbing at this height is built for this height.
        // A floor that is no world of its own (the Accursed Market, a lift
        // hall) has no band to draw from, so it keeps the old flat spread.
        const level = isTowerWorldFloor(here.floor)
          ? towerFloorLevelRoll(here.floor, rng)
          : Math.max(1, here.level + Math.floor(rng() * 5) - 2);
        const member = {
          name: bandNameFrom(origin, rng, spawned),
          characterName,
          characterIndex: characterName.includes("!$") ? 0 : Math.floor(rng() * 8),  // i18n-ignore: sprite-sheet prefix
          level,
          originWorld: origin ? origin.id : null,
          hp: 30 + level * 6,
        };
        if (bandSpawnMember(member, spots[i].x, spots[i].y, bandId, i === 0)) spawned++;
      }
    }
    return spawned;
  }

  function bandFindAnchor(rng, reserved, size) {
    const w = $gameMap.width(), h = $gameMap.height();
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(rng() * w), y = Math.floor(rng() * h);
      if (!bandStandable(x, y, reserved)) continue;
      if (size === 1) return { x, y };
      if (bandSpotsAround({ x, y }, size, reserved).length >= 2) return { x, y };
    }
    return null;
  }

  // The squares a band of this size stands on: the anchor first (that is the
  // leader's) and then whatever is free around it, so a band arrives already
  // together rather than scattered over the floor and walking into formation.
  function bandSpotsAround(anchor, size, reserved) {
    const out = [{ x: anchor.x, y: anchor.y }];
    const taken = new Set([anchor.x + "," + anchor.y]);
    for (let r = 1; r <= 2 && out.length < size; r++) {
      for (let dy = -r; dy <= r && out.length < size; dy++) {
        for (let dx = -r; dx <= r && out.length < size; dx++) {
          const x = anchor.x + dx, y = anchor.y + dy;
          const key = x + "," + y;
          if (taken.has(key) || !bandStandable(x, y, reserved)) continue;
          taken.add(key);
          out.push({ x, y });
        }
      }
    }
    return out;
  }

  // A menu, the status screen or anything else that rebuilds Scene_Map reloads
  // $dataMap from disk, and the injected slots go with it while the Game_Event
  // objects live on. Write them back from the copy each member is carrying.
  function bandRestoreEventData() {
    if (typeof $dataMap === "undefined" || !$dataMap) return;
    if (typeof $gameMap === "undefined" || !$gameMap) return;
    for (const ev of ($gameMap._events || [])) {
      if (!ev || !ev._towerBandData || ev._erased) continue;
      if (!$dataMap.events) $dataMap.events = [null];
      const id = ev.eventId();
      if ($dataMap.events[id]) continue;
      $dataMap.events[id] = ev._towerBandData;
    }
  }

  function bandStep(ev, tx, ty) {
    if (!ev || ev._erased || ev.isMoving()) return;
    const dx = tx - ev.x, dy = ty - ev.y;
    if (!dx && !dy) return;
    const horz = dx > 0 ? 6 : 4;
    const vert = dy > 0 ? 2 : 8;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx) ev.moveStraight(horz);
      if (dy && !ev.isMovementSucceeded()) ev.moveStraight(vert);
    } else {
      if (dy) ev.moveStraight(vert);
      if (dx && !ev.isMovementSucceeded()) ev.moveStraight(horz);
    }
  }

  function bandNearestEnemy(ev, range) {
    let best = null, bestD = Infinity;
    for (const other of $gameMap.events()) {
      if (!bandLiveEnemy(other)) continue;
      const d = Math.max(Math.abs(other.x - ev.x), Math.abs(other.y - ev.y));
      if (d <= range && d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  function bandLeaderOf(bandId, members) {
    for (const ev of members) {
      if (ev._towerBand.band === bandId && ev._towerBand.leader) return ev;
    }
    return null;
  }

  // One step of the whole floor's traffic. The leader hunts, the rest follow;
  // nobody already toe to toe with a creature moves at all, so a band that has
  // caught something stands and fights it instead of walking on through it.
  // A band whose leader has fallen does not stand about: every one of them
  // hunts for itself from then on.
  function bandUpdateMovement() {
    const members = bandMembers();
    if (!members.length) return;
    for (const ev of members) {
      const state = ev._towerBand;
      if (bandNearestEnemy(ev, 1)) continue;
      const leader = state.leader ? ev : bandLeaderOf(state.band, members);
      if (state.leader || !leader || leader._erased) {
        const prey = bandNearestEnemy(ev, BAND_SIGHT);
        if (prey) bandStep(ev, prey.x, prey.y);
        else if (Math.random() < 0.4) {
          ev.moveStraight([2, 4, 6, 8][Math.floor(Math.random() * 4)]);
        }
        continue;
      }
      const d = Math.max(Math.abs(leader.x - ev.x), Math.abs(leader.y - ev.y));
      if (d > 1) bandStep(ev, leader.x, leader.y);
    }
  }

  function bandFlash(ev, color) {
    const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
    if (!spriteset || !spriteset._characterSprites) return;
    const sprite = spriteset._characterSprites.find((s) => s._character === ev);
    if (!sprite) return;
    sprite.setBlendColor(color);
    sprite._flashDuration = 12;
  }

  function bandFell(ev) {
    const name = ev._towerBand && ev._towerBand.name;
    const seen = ev.isNearTheScreen ? ev.isNearTheScreen() : false;
    ev._towerBand = null;
    ev._towerBandData = null;
    $gameMap.eraseEvent(ev.eventId());
    if (name && seen && window.ParchmentToast && window.ParchmentToast.show) {
      window.ParchmentToast.show(T("DungeonFloor.bandFell", { name }), { severity: "warning" });  // i18n-ignore: severity id
    }
  }

  // One exchange of blows per band member standing next to a creature. The
  // creature's map HP is what is worn down, and the wound is written to the
  // record a real battle restores from, so a monster the party walks in on
  // afterwards is as hurt as the band left it.
  function bandUpdateCombat() {
    for (const ev of bandMembers()) {
      const state = ev._towerBand;
      const foe = bandNearestEnemy(ev, 1);
      if (!foe) continue;
      if (foe.enemyHp === undefined) {
        foe.enemyHp = foe.getMaxHpForEvent ? foe.getMaxHpForEvent() : 100;
      }
      const damage = 4 + Math.floor(state.level / 2) + Math.floor(Math.random() * 6);
      foe.enemyHp -= damage;
      const BSEF = window.BSE && window.BSE.Functions;
      if (BSEF && BSEF.recordMapEnemyDamage) BSEF.recordMapEnemyDamage(foe, damage);
      bandFlash(foe, [255, 64, 64, 160]);
      if (foe.enemyHp <= 0) {
        if (BSEF && BSEF.killEnemyEventLeaveCorpse) BSEF.killEnemyEventLeaveCorpse(foe, state.level);
        else $gameMap.eraseEvent(foe.eventId());
        continue;
      }
      const bite = 3 + Math.floor(bandEnemyLevel(foe) / 2) + Math.floor(Math.random() * 6);
      state.hp -= bite;
      bandFlash(ev, [255, 64, 64, 160]);
      if (state.hp <= 0) bandFell(ev);
    }
  }

  function bandUpdate() {
    if (typeof $gameMap === "undefined" || !$gameMap) return;
    if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
    if (window.MapBattleMode && window.MapBattleMode.isActive()) return;
    if (!bandMembers().length) return;
    bandTick++;
    if (bandTick % BAND_STEP_INTERVAL === 0) bandUpdateMovement();
    if (bandTick % BAND_FIGHT_INTERVAL === 0) bandUpdateCombat();
  }

  // Talking to one of them. They are climbing the same tower and have nothing
  // to sell: what is on offer is a word about the floor.
  PluginManager.registerCommand(pluginName, "bandTalk", function () {
    const ev = $gameMap.event(this.eventId ? this.eventId() : 0);
    const state = ev && ev._towerBand;
    const lines = T.pool("DungeonFloor.bandLines");
    if (!lines.length) return;
    $gameMessage.setSpeakerName(state ? state.name : "");
    $gameMessage.add(lines[Math.floor(Math.random() * lines.length)]);
  });

  //===========================================================================
  // THE FLOOR WORLDS
  //===========================================================================
  // A floor of the Omega Tower is not a cellar under Italy: it is somewhere
  // else entirely, and the somewhere else is its own world. Every floor that
  // holds people holds a DIFFERENT one - a world of goblins, a world gone to
  // fungus, a world of machines still running their own elections, a colony of
  // Earth people who came up the shaft and stayed - with its own population,
  // its own hyperpower, its own parties and creeds, and its own idea of what a
  // crate is worth.
  //
  // A world is a pure function of (world seed, floor number), rolled the same
  // way the floor's structure is (towerFloorBiome), so it never moves for a
  // given world however often it is asked for. It is cached in the world folder
  // all the same, because the politics layer keys off the names and a world
  // whose file is missing has to rebuild to the same names, not to new ones.
  //
  // Which floors get one: every floor that is generated and holds creatures.
  // The lift halls are the tower's own architecture, and the Accursed Market
  // and the throne room are still Earth (world square 79,124), so none of those
  // is a world and none of them is listed here.
  //
  // Tower floors carry NO world coordinates. Everywhere else in the game a
  // settlement is a place on the world map and answers with a nation id; a
  // floor answers with a world, which is the whole point of it, and the
  // coordinate the map happens to be GENERATED from (79,124, where the tower
  // stands) is a fact about the layout and never about the people.
  const TOWER_WORLD_ELEVATOR_FLOORS = [10, 20, 30, 40, 50, 60, 70, 80, 90];

  // The kinds of world, and what each one is made of. Weighted: a mixed world
  // is the commonest thing in the shaft and a world of pure mimicry the rarest.
  //
  //   population / magic  the vocabularies WorldManager already uses for a
  //                       world the player makes (POPULATION_MODES,
  //                       MAGICAL_LEVELS), so a floor is describable in the
  //                       same terms as a save.
  //   dominant            the class ids the population is drawn from, and how
  //                       hard. A creature world picks ONE of the ids 63-70 as
  //                       its dominant race and draws it at `share`; a sentient
  //                       world leaves it null and draws ordinary folk.
  //   registers           the name registers the world may be written in, with
  //                       weights. Two goblin worlds can read differently.
  //   gov                 which government archetype the politics layer builds
  //                       for its hyperpower.
  //   loot                what its crates lean towards, and how rich they are.
  const TOWER_WORLD_KINDS = [
    { key: "mixed",     weight: 16, population: "normal", magic: "normal",
      dominant: null,
      registers: { earthly: 3, archaic: 2, fae: 1, alien: 1 },
      gov: "republic",
      loot: { rarity: 0, lift: 0, favour: [], shun: [] } },

    { key: "earthling", weight: 11, population: "normal", magic: "normal",
      dominant: null, earthborn: true,
      registers: { earthly: 6, archaic: 1 },
      gov: "republic",
      loot: { rarity: 4, lift: 0, favour: ["Food", "Tools", "Medical"], shun: ["Magic"] } },

    { key: "goblin",    weight: 10, population: "goblin", magic: "normal",
      dominant: { classIds: [], share: 0.85, sprite: "goblin" },
      registers: { feral: 5, brutish: 3, earthly: 1 },
      gov: "warband",
      loot: { rarity: -6, lift: 0, favour: ["Tools", "Trash"], shun: ["Magic"] } },

    { key: "monster",   weight: 9,  population: "monster", magic: "normal",
      dominant: { classIds: [65], share: 0.80 },
      registers: { brutish: 4, eldritch: 2, feral: 2 },
      gov: "tyranny",
      loot: { rarity: 6, lift: 0.05, favour: ["Monsters", "Combat"], shun: ["Food"] } },

    { key: "beast",     weight: 8,  population: "normal", magic: "normal",
      dominant: { classIds: [63], share: 0.90, animal: true },
      registers: { feral: 5, earthly: 2 },
      gov: "none",
      loot: { rarity: -8, lift: 0, favour: ["Food", "Survival"], shun: ["Component", "Magic"] } },

    { key: "zombie",    weight: 8,  population: "zombie", magic: "normal",
      dominant: { classIds: [68], share: 0.88 },
      registers: { earthly: 3, eldritch: 2 },
      gov: "none",
      loot: { rarity: -4, lift: 0, favour: ["Medical", "Trash"], shun: ["Food"] } },

    { key: "fungoid",   weight: 8,  population: "chaos", magic: "unbound",
      dominant: { classIds: [69], share: 0.75 },
      registers: { eldritch: 5, fae: 2 },
      gov: "conclave",
      loot: { rarity: 2, lift: 0.05, favour: ["Magic", "Food"], shun: ["Component"] } },

    { key: "machine",   weight: 8,  population: "normal", magic: "severed",
      dominant: { classIds: [66, 70], share: 0.85 },
      registers: { machine: 6, alien: 1 },
      gov: "directorate",
      loot: { rarity: 10, lift: 0.10, favour: ["Component", "Tools"], shun: ["Food", "Magic"] } },

    { key: "alien",     weight: 7,  population: "normal", magic: "unbound",
      dominant: null, alien: true,
      registers: { alien: 6, eldritch: 2, machine: 1 },
      gov: "conclave",
      loot: { rarity: 8, lift: 0.08, favour: ["Component", "Magic"], shun: ["Food"] } },

    { key: "magical",   weight: 7,  population: "normal", magic: "unbound",
      dominant: null,
      registers: { fae: 5, archaic: 3, eldritch: 1 },
      gov: "conclave",
      loot: { rarity: 8, lift: 0.08, favour: ["Magic", "Books"], shun: ["Component"] } },

    { key: "undead",    weight: 6,  population: "death", magic: "unbound",
      dominant: { classIds: [67], share: 0.85 },
      registers: { archaic: 3, eldritch: 4 },
      gov: "tyranny",
      loot: { rarity: 6, lift: 0.05, favour: ["Magic", "Books"], shun: ["Food", "Medical"] } },

    { key: "mutant",    weight: 6,  population: "chaos", magic: "normal",
      dominant: { classIds: [69], share: 0.80 },
      registers: { brutish: 3, eldritch: 3, earthly: 1 },
      gov: "warband",
      loot: { rarity: 0, lift: 0.03, favour: ["Medical", "Monsters"], shun: [] } },

    { key: "severed",   weight: 5,  population: "normal", magic: "severed",
      dominant: null,
      registers: { earthly: 3, archaic: 3 },
      gov: "directorate",
      loot: { rarity: -2, lift: 0, favour: ["Tools", "Component"], shun: ["Magic", "Books"] } },

    { key: "ruin",      weight: 5,  population: "empty", magic: "severed",
      dominant: null, empty: true,
      registers: { archaic: 2, eldritch: 3 },
      gov: "none",
      loot: { rarity: -12, lift: -0.05, favour: ["Trash", "Survival"], shun: ["Food", "Medical"] } },

    { key: "mimic",     weight: 3,  population: "monster", magic: "unbound",
      dominant: { classIds: [64], share: 0.92 },
      registers: { eldritch: 4, earthly: 2 },
      gov: "none",
      loot: { rarity: 12, lift: 0.12, favour: ["Collectibles", "Misc"], shun: [] } },
  ];

  function towerWorldKind(key) {
    for (let i = 0; i < TOWER_WORLD_KINDS.length; i++) {
      if (TOWER_WORLD_KINDS[i].key === key) return TOWER_WORLD_KINDS[i];
    }
    return TOWER_WORLD_KINDS[0];
  }

  // The name registers. A register is HOW a world is written, and the same one
  // names the world, the people on it, its hyperpower and its parties, so a
  // floor reads of a piece from the wiki article down to the person standing in
  // front of you. Two sorts:
  //
  //   corpus        the Markov banks in js/db/TextGen. They are all written in
  //                 an Earth voice, which is exactly what is wanted for a
  //                 colony and exactly what is not wanted for a fungus god, so
  //                 they only carry the registers that should sound human.
  //   phonotactic   a syllable grammar instead, because no corpus in the game
  //                 sounds like something that was never a person. The phoneme
  //                 sets live in the i18n data (DungeonFloor.nameGrammar), so
  //                 what an eldritch name is made of can be tuned per language.
  const TOWER_NAME_REGISTERS = {
    // i18n-ignore-start  Markov database ids, not prose
    earthly:  { corpus: ["names", "npc", "npc1", "npc2", "npc3", "salaryman", "farmer", "guard", "commuter"] },
    archaic:  { corpus: ["medieval", "scribe", "priest", "nun", "decadent_noble", "elven_ambassador"] },
    feral:    { corpus: ["caveman", "semiwild_goblin", "gobbo_receptionist"] },
    brutish:  { corpus: ["thug", "rage", "goblin_metalhead", "pirate"] },
    fae:      { corpus: ["fae_queen", "illusionist", "wizard", "fortune_teller"] },
    // i18n-ignore-end
    machine:  { phono: true },
    alien:    { phono: true },
    eldritch: { phono: true },
  };

  const TOWER_REGISTER_KEYS = Object.keys(TOWER_NAME_REGISTERS);

  // A weighted pick out of a {key: weight} table.
  function towerWeightedPick(table, rng) {
    const keys = Object.keys(table);
    let total = 0;
    for (let i = 0; i < keys.length; i++) total += table[keys[i]];
    if (total <= 0) return keys[0];
    let roll = rng() * total;
    for (let i = 0; i < keys.length; i++) {
      roll -= table[keys[i]];
      if (roll <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  function towerGrammar(register, part) {
    if (typeof T !== "function" || typeof T.list !== "function") return null;
    const list = T.list("DungeonFloor.nameGrammar." + register + "." + part);
    return (list && list.length) ? list : null;
  }

  function towerPick(list, rng) {
    return list[Math.floor(rng() * list.length)] || list[0];
  }

  // A name built out of syllables rather than out of anybody's speech. The
  // length curve is deliberately long-tailed: most names run to two or three
  // syllables and a rare one runs away with itself, which is what makes a
  // roster of them read as a language instead of as noise.
  function towerPhonoName(register, rng) {
    const onsets = towerGrammar(register, "onsets");
    const nuclei = towerGrammar(register, "nuclei");
    const codas = towerGrammar(register, "codas");
    if (!onsets || !nuclei) return "";
    const joiners = towerGrammar(register, "joiners") || [""];
    const roll = rng();
    const syllables = roll < 0.35 ? 2 : roll < 0.80 ? 3 : roll < 0.95 ? 4 : 5;
    let out = "";
    for (let i = 0; i < syllables; i++) {
      if (i > 0 && rng() < 0.18) out += towerPick(joiners, rng);
      out += towerPick(onsets, rng) + towerPick(nuclei, rng);
      if (codas && codas.length && rng() < (i === syllables - 1 ? 0.7 : 0.3)) {
        out += towerPick(codas, rng);
      }
    }
    out = out.charAt(0).toUpperCase() + out.slice(1);
    return out.length >= 2 ? out : out + towerPick(nuclei, rng);
  }

  // A name in a register. Corpus registers go through the Markov layer the rest
  // of the game names people with; phonotactic ones go through the grammar. A
  // corpus that fails to answer falls back to the grammar rather than to
  // nothing, so a world is never full of blanks.
  function towerRegisterName(register, rng) {
    const reg = TOWER_NAME_REGISTERS[register] || TOWER_NAME_REGISTERS.earthly;
    if (reg.corpus && typeof window.generateSeededMarkovName === "function") {
      const db = towerPick(reg.corpus, rng);
      const a = Math.floor(rng() * 0xffff);
      const b = Math.floor(rng() * 0xffff);
      const c = Math.floor(rng() * 0x7fff) || 1;
      try {
        const made = window.generateSeededMarkovName(a, b, c, db, 2, 4, 12);
        if (made && String(made).length >= 2) return String(made);
      } catch (e) { /* fall through to the grammar */ }
    }
    return towerPhonoName(reg.phono ? register : "eldritch", rng) ||
      towerPhonoName("eldritch", rng);
  }

  // Which floors are worlds at all.
  function isTowerWorldFloor(floor) {
    if (!Number.isFinite(floor)) return false;
    if (floor < 0) return isGeneratedLowerFloor(floor);
    if (floor <= 1 || floor >= 100) return false;          // market and throne stay Earth
    return TOWER_WORLD_ELEVATOR_FLOORS.indexOf(floor) < 0; // lift halls are architecture
  }

  function towerWorldId(floor) {
    return "tower:" + (floor > 0 ? "+" : "") + floor;      // i18n-ignore  record key
  }

  function towerWorldFloors() {
    const out = [];
    for (let f = TOWER.DEEPEST; f <= 100; f++) {
      if (f !== 0 && isTowerWorldFloor(f)) out.push(f);
    }
    return out;
  }

  // The level band the people of a floor are built around: the same band its
  // creatures are, because a world is as heavy as the floor it is reached on.
  function towerWorldBand(floor) {
    if (floor < 0) {
      const level = towerEnemyLevel(floor);
      if (!level) return null;
      const reach = Math.max(3, Math.round(level * 0.1));
      return { min: Math.max(1, level - reach), max: Math.min(ENEMY_LEVEL_CEILING, level + reach), median: level };
    }
    const band = upperFloorEnemyBand(floor);
    if (!band) return null;
    return { min: band.min, max: band.max, median: Math.round((band.min + band.max) / 2) };
  }

  // What ONE person on that floor weighs. Most of them stand at the floor's own
  // level; a few stand well above or below it, and the further from the median
  // the rarer, which is what a triangular draw over a widened window gives. The
  // band itself is the promise about the CREATURES, so the people are allowed
  // outside it: a level 8 straggler on a level 40 floor is a story, not a bug.
  const TOWER_LEVEL_SPREAD = 0.4;   // how far past the median a person may stand

  function towerFloorLevelRoll(floor, rng) {
    const band = towerWorldBand(floor);
    if (!band) return 1;
    const roll = typeof rng === "function" ? rng : Math.random;
    const reach = Math.max(2, Math.round(band.median * TOWER_LEVEL_SPREAD));
    // Two flat draws averaged is a triangle: the middle is common, the edges
    // are not, and nothing needs a table.
    const offset = Math.round(((roll() + roll()) / 2 - 0.5) * 2 * reach);
    return Math.max(1, Math.min(ENEMY_LEVEL_CEILING, band.median + offset));
  }

  // Rolling one world. Everything on it comes out of the one seeded stream, in
  // a fixed order, so adding a field at the END is safe and inserting one in
  // the middle rerolls every world after it.
  function buildTowerWorld(floor) {
    const rng = createSeededRandom("towerworld:" + dungeonWorldSeed() + ":" + floor);  // i18n-ignore  seed string
    const weights = {};
    for (let i = 0; i < TOWER_WORLD_KINDS.length; i++) {
      weights[TOWER_WORLD_KINDS[i].key] = TOWER_WORLD_KINDS[i].weight;
    }
    const kindKey = towerWeightedPick(weights, rng);
    const kind = towerWorldKind(kindKey);
    const register = towerWeightedPick(kind.registers, rng);
    const band = towerWorldBand(floor) || { min: 1, max: 5, median: 3 };

    const name = towerRegisterName(register, rng);
    const demonym = towerRegisterName(register, rng);
    const powerName = towerRegisterName(register, rng);

    // The dominant race. A creature world picks one id out of the ones its kind
    // allows and sticks to it: that is what makes it a world OF goblins rather
    // than a world with some in it.
    let dominant = null;
    if (kind.dominant) {
      const ids = kind.dominant.classIds || [];
      const classId = ids.length ? ids[Math.floor(rng() * ids.length)] : 0;
      const share = Math.min(0.95, Math.max(0.55,
        (kind.dominant.share || 0.8) + (rng() - 0.5) * 0.12));
      dominant = {
        classId: classId,
        share: Math.round(share * 100) / 100,
        animal: !!kind.dominant.animal,
        sprite: kind.dominant.sprite || null,
      };
    }

    // Its bench. Three to six of them, named in the world's own register.
    const partyCount = 3 + Math.floor(rng() * 4);
    const parties = [];
    for (let i = 0; i < partyCount; i++) {
      parties.push({
        id: towerWorldId(floor) + ":party:" + i,   // i18n-ignore  record key
        name: towerRegisterName(register, rng),
      });
    }

    return {
      id: towerWorldId(floor),
      floor: floor,
      half: floor < 0 ? "lower" : "upper",   // i18n-ignore  record value
      kind: kindKey,
      register: register,
      name: name,
      demonym: demonym,
      populationMode: kind.population,
      magicalLevel: kind.magic,
      earthborn: !!kind.earthborn,
      alien: !!kind.alien,
      empty: !!kind.empty,
      dominant: dominant,
      powerName: powerName,
      govArchetypeKey: kind.gov,
      parties: parties,
      band: band,
      loot: {
        rarityBonus: kind.loot.rarity,
        lift: kind.loot.lift,
        favour: kind.loot.favour.slice(),
        shun: kind.loot.shun.slice(),
      },
    };
  }

  // The built worlds, kept on $gameSystem so WorldManager files them in the
  // world folder and every savegame of that world meets the same people.
  function towerWorldStore() {
    if (typeof $gameSystem === "undefined" || !$gameSystem) return null;
    if (!$gameSystem._towerWorlds || typeof $gameSystem._towerWorlds !== "object") {
      $gameSystem._towerWorlds = {};
    }
    return $gameSystem._towerWorlds;
  }

  function towerFloorWorld(floor) {
    if (!isTowerWorldFloor(floor)) return null;
    const store = towerWorldStore();
    const id = towerWorldId(floor);
    if (store && store[id]) return store[id];
    const world = buildTowerWorld(floor);
    if (store) store[id] = world;
    return world;
  }

  function towerWorldById(id) {
    if (!id) return null;
    const store = towerWorldStore();
    if (store && store[id]) return store[id];
    const floor = parseInt(String(id).replace("tower:", ""), 10);   // i18n-ignore  record key
    return Number.isFinite(floor) ? towerFloorWorld(floor) : null;
  }

  function allTowerWorlds() {
    return towerWorldFloors().map(towerFloorWorld).filter(Boolean);
  }

  // Building every world at once, at world creation, so the politics layer can
  // discover the hyperpowers before it builds its governments.
  function initTowerWorlds() {
    const floors = towerWorldFloors();
    for (let i = 0; i < floors.length; i++) towerFloorWorld(floors[i]);
    return true;
  }

  if (window.WorldManager && typeof window.WorldManager.registerWorldInitializer === "function") {
    // After "dungeon" (40), which decides which floors exist, and before
    // "politics" (50), which has to find the worlds' powers already standing.
    window.WorldManager.registerWorldInitializer("towerWorlds", 45, initTowerWorlds);   // i18n-ignore  step key
  }

  // The floor the party is standing on, whichever half of the shaft it is in.
  function currentWorldFloor() {
    const lower = currentTowerFloor();
    if (lower && isTowerWorldFloor(lower)) return lower;
    const upper = currentAuthoredFloor();
    if (upper && isTowerWorldFloor(upper)) return upper;
    return 0;
  }

  function currentTowerWorld() {
    const floor = currentWorldFloor();
    return floor ? towerFloorWorld(floor) : null;
  }

  // The settlement group a floor's people belong to. Deliberately NOT a
  // Proc:x,y group: a floor is not a square of the world map and must never be
  // labelled as one.
  const TOWER_GROUP_PREFIX = "Tower";   // i18n-ignore  group key

  function towerGroupName(floor) {
    return TOWER_GROUP_PREFIX + ":" + (floor > 0 ? "+" : "") + floor;   // i18n-ignore  group key
  }

  function towerGroupFloor(groupName) {
    if (!groupName || String(groupName).indexOf(TOWER_GROUP_PREFIX + ":") !== 0) return 0;
    const floor = parseInt(String(groupName).slice(TOWER_GROUP_PREFIX.length + 1), 10);
    return Number.isFinite(floor) && isTowerWorldFloor(floor) ? floor : 0;
  }

  function towerWorldOfGroup(groupName) {
    const floor = towerGroupFloor(groupName);
    return floor ? towerFloorWorld(floor) : null;
  }

  // What the crates on this floor lean towards. Null off the tower, so every
  // call site that does not care is unchanged.
  function towerLootProfile() {
    const world = currentTowerWorld();
    return world ? world.loot : null;
  }

  window.TowerWorlds = {
    // Whether a floor is a world at all, and the world itself.
    isWorldFloor: isTowerWorldFloor,
    get: towerFloorWorld,
    byId: towerWorldById,
    all: allTowerWorlds,
    floors: towerWorldFloors,
    kinds: () => TOWER_WORLD_KINDS.map((k) => k.key),
    registers: () => TOWER_REGISTER_KEYS.slice(),
    // Where the party is.
    currentFloor: currentWorldFloor,
    current: currentTowerWorld,
    // The settlement side: a floor's group name carries no coordinates.
    groupPrefix: TOWER_GROUP_PREFIX,
    groupName: towerGroupName,
    groupFloor: towerGroupFloor,
    isTowerGroup: (name) => towerGroupFloor(name) > 0,
    worldOfGroup: towerWorldOfGroup,
    // The politics layer asks for these by name.
    powerNames: () => allTowerWorlds().map((w) => w.powerName),
    worldOfPower: (power) => allTowerWorlds().filter((w) => w.powerName === power)[0] || null,
    worldOfName: (name) => allTowerWorlds().filter((w) => w.name === name)[0] || null,
    partiesFor: (id) => { const w = towerWorldById(id); return w ? w.parties.slice() : []; },
    // How heavy one of its people is.
    levelRoll: towerFloorLevelRoll,
    band: towerWorldBand,
    // What its crates pay.
    lootProfile: towerLootProfile,
    // Naming, exposed so the NPC layer dresses a citizen in its world's voice.
    nameIn: towerRegisterName,
    // Building them all, for the world initializer and for the tests.
    buildAll: initTowerWorlds,
  };

  window.DungeonFloors = {
    deepestFloor: TOWER.DEEPEST,
    isLowerFloor,
    isGeneratedLowerFloor,
    isLowerFloorUnlocked,
    lowerFloorLabel,
    floorBiome: towerFloorBiome,
    depthReached: towerDepthReached,
    // The floor the party is standing on right now, 0 when they are not on one.
    currentFloor: currentTowerFloor,
    // The level the creatures on that floor are built around, 0 off the tower.
    currentFloorLevel() { return towerEnemyLevel(currentTowerFloor()); },
    floorLevel: towerEnemyLevel,
    // The party is on a floor the lift is the only way off of.
    insideTower,
    // True when the map the party stands on is one of the authored dungeon's
    // own maps (any map under the dungeon folders, an elevator hall or the boss
    // floor). The floor variable outlives the dungeon, so anything reading it
    // to decide "are we underground" has to ask this first.
    isDungeonMap: (mapId) => isDungeonMap(
        mapId != null ? mapId : (typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0)
    ),
    // The authored floor the party is on (upper tower), and the enemy levels
    // that floor holds. The encounter system reads these instead of the spawn
    // mode whenever they answer.
    currentAuthoredFloor,
    floorEnemyBand: upperFloorEnemyBand,
    currentEnemyBand() { return upperFloorEnemyBand(currentAuthoredFloor()); },
    // The tower denies the free first-turn escape from battle.
    escapeIsContested,
    // Takes a "leave this place" request and answers it with the elevator.
    // True when it did, false when the tower has no claim on the press.
    returnToElevator,
    // The squares the three staircases and their landings occupy on the floor
    // underfoot. Every pass that scatters something onto a generated floor -
    // spike traps, chests, doors - is dealt after the staircases are placed and
    // asks for these first, so a lift never opens onto a hazard and a way down
    // is never buried under a chest.
    reservedTiles: towerReservedTiles,
    // The other climbers: which floor holds bands at all, who is on this one,
    // and the two passes that move them and fight their fights. Exposed so a
    // test drives them a step at a time rather than waiting on frames.
    bandFloor: bandFloorHere,
    bandMembers,
    spawnBands: bandSpawnFloor,
    stepBands: bandUpdateMovement,
    fightBands: bandUpdateCombat,
  };

  function moveToFloor(floor, spawnMode) {
    // Every floor this handles is an authored map above ground, so whatever the
    // party was standing on below it, they are leaving the lower tower.
    clearTowerSession();
    if (!$gameSystem.isDungeonGenerated()) {
        $gameSystem.generateDungeon();
    } else if ($gameSystem.isDemoLayoutStale()) {
        // A save made before the demo rules changed still holds forbidden maps.
        // Rebuild it, keeping the floor the player had already reached.
        const reached = $gameVariables.value(params.maxFloorVariable) || 0;
        $gameSystem.generateDungeon();
        $gameVariables.setValue(
            params.maxFloorVariable,
            Math.min(reached, params.demoMaxFloor)
        );
    }

    const previousFloor = $gameVariables.value(params.currentFloorVariable);
    $gameVariables.setValue(params.currentFloorVariable, floor);
    $gameVariables.setValue(params.elevatorFloorVariable, floor);

    if (floor > 0) {
        $gameSystem.updateMaxFloor(floor);
    }

    let mapId, x, y, direction = 0;

    $gameScreen.startFadeOut(1);

    // Hardcoded transition: From Town/Home (Floor 0 or Map 635) to Floor 1
    if (floor === 1 && (previousFloor === 0 || $gameMap.mapId() === 635)) {
        mapId = 101;
        x = 16;
        y = 38;
        direction = 8; // Face up
    // Hardcoded transition: From Floor 1 to Town
    } else if (floor === 0 && previousFloor === 1) {
        mapId = 635;
        x = 13;
        // Land SOUTH of the stair tiles (12-14, 26), not north of them, so the
        // walk back into the room never re-touches them and bounces to floor 1.
        y = 27;
        direction = 2; // Face down
    // Generic "go to town" from any other floor
    } else if (floor === 0) {
        mapId = $gameSwitches.value(params.arenaToggleSwitch) ? params.arenaMapId : params.townMapId;
        x = $gameSwitches.value(params.arenaToggleSwitch) ? params.arenaMapX : params.playerSpawnX;
        y = $gameSwitches.value(params.arenaToggleSwitch) ? params.arenaMapY : params.playerSpawnY;
    } else if (floor === 100) {
        mapId = params.bossFloorMapId;
        x = params.bossFloorX;
        y = params.bossFloorY;
    } else if (floor === 1 && previousFloor === 2) {
        mapId = $gameSystem.getDungeonFloorMapId(1);
        x = 17;
        y = 19;
        direction = 2;
    } else {
        let stairLocation;
        switch (spawnMode) {
            case "elevator":
                mapId = $gameSystem.getDungeonFloorMapId(floor);
                const elevatorSpawn = findRegion20Spawn(mapId);
                if (elevatorSpawn) {
                    x = elevatorSpawn.x;
                    y = elevatorSpawn.y;
                    direction = 2; // Face downwards
                } else {
                    stairLocation = $gameSystem.getStairLocation(floor, false);
                    mapId = stairLocation.mapId;
                    x = stairLocation.x;
                    y = stairLocation.y;
                    direction = 2; // Face downwards
                }
                break;
            case true: // Going up
                stairLocation = $gameSystem.getStairLocation(floor, false); // Arrive at downstairs
                mapId = stairLocation.mapId;
                x = stairLocation.x;
                y = stairLocation.y;
                break;
            case false: // Going down
                stairLocation = $gameSystem.getStairLocation(floor, true); // Arrive at upstairs
                mapId = stairLocation.mapId;
                x = stairLocation.x;
                y = stairLocation.y;
                break;
            case "downstairs":
                stairLocation = $gameSystem.getStairLocation(floor, false);
                mapId = stairLocation.mapId;
                x = stairLocation.x; 
                y = stairLocation.y;
                break;
            default: // Default/fallback spawn
                mapId = $gameSystem.getDungeonFloorMapId(floor);
                x = params.playerSpawnX;
                y = params.playerSpawnY;
                break;
        }
    }

    if (mapId > 0) {
        $gamePlayer.reserveTransfer(mapId, x, y, direction);
    } else {
        console.error("DungeonFloorSystem: Invalid Map ID (0) for floor " + floor);
    }
  }
  

  function teleportToNearestStairs() {
    const currentFloor = $gameVariables.value(params.currentFloorVariable);
    const currentMapId = $gameMap.mapId();
    if (currentFloor <= 0 || currentFloor >= 100) return;

    const upstairsLoc = $gameSystem.getStairLocation(currentFloor, true);
    const downstairsLoc = $gameSystem.getStairLocation(currentFloor, false);
    const playerX = $gamePlayer.x;
    const playerY = $gamePlayer.y;

    let distToUpstairs = Infinity;
    if (upstairsLoc.mapId === currentMapId) {
      distToUpstairs = Math.hypot(
        playerX - upstairsLoc.x,
        playerY - upstairsLoc.y
      );
    }

    let distToDownstairs = Infinity;
    if (downstairsLoc.mapId === currentMapId) {
      distToDownstairs = Math.hypot(
        playerX - downstairsLoc.x,
        playerY - downstairsLoc.y
      );
    }

    let targetLoc = null;
    if (distToUpstairs <= distToDownstairs && distToUpstairs !== Infinity) {
      targetLoc = upstairsLoc;
    } else if (
      distToDownstairs < distToUpstairs &&
      distToDownstairs !== Infinity
    ) {
      targetLoc = downstairsLoc;
    }

    if (targetLoc) {
      teleportToAdjacentTile(targetLoc.x, targetLoc.y);
    }
  }

  function teleportToSpecificStairs(isUpstairs) {
    const currentFloor = $gameVariables.value(params.currentFloorVariable);
    const currentMapId = $gameMap.mapId();
    if (currentFloor <= 0 || currentFloor >= 100) return;
  
    const stairLoc = $gameSystem.getStairLocation(currentFloor, isUpstairs);
  
    if (stairLoc.mapId === currentMapId) {
      // Same map - just teleport adjacent to the stairs
      teleportToAdjacentTile(stairLoc.x, stairLoc.y);
    } else {
      // Different map - check if it's part of the same multi-room floor
      const floorMapInfo = $gameSystem._dungeonFloors[currentFloor];
      
      // Check if this floor is a multi-room floor
      if (Array.isArray(floorMapInfo) && floorMapInfo.includes(currentMapId) && floorMapInfo.includes(stairLoc.mapId)) {
        // Both maps are part of the same multi-room floor, so transfer to the other map
        $gameScreen.startFadeOut(10);
        $gamePlayer.reserveTransfer(stairLoc.mapId, stairLoc.x, stairLoc.y, 0);
      }
      // If not part of same multi-room floor, do nothing (stairs aren't accessible)
    }
  }

  function teleportToAdjacentTile(targetX, targetY) {
    const directions = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 },
    ];

    for (const dir of directions) {
      const checkX = targetX + dir.dx;
      const checkY = targetY + dir.dy;
      if ($gameMap.isPassable(checkX, checkY, 0)) {
        $gamePlayer.locate(checkX, checkY);
        $gameScreen.startFlash([0, 0, 0, 128], 30);
        return;
      }
    }

    $gamePlayer.locate(targetX, targetY);
    $gameScreen.startFlash([0, 0, 0, 128], 30);
  }


  function repositionStairEvents() {
    if (!$gameMap || !$gameSystem || !$gameSystem._stairLocations) return;

    const currentMapId = $gameMap.mapId();
    // 635 is the fixed dungeon base (floor 0). Its NextFloor event is hand-placed
    // and must never be repositioned/hidden by the generated-floor logic, otherwise
    // a stale current-floor value would relocate it off-map and it can never be touched.
    if (currentMapId === 1 || currentMapId === 101 || currentMapId === 300 || currentMapId === 635) {
        return;
    }

    const currentFloor = $gameVariables.value(params.currentFloorVariable);
    if (currentFloor <= 0 || currentFloor >= 100) return;

    const upstairsLoc = $gameSystem.getStairLocation(currentFloor, true);
    const downstairsLoc = $gameSystem.getStairLocation(currentFloor, false);

    const key = `${currentMapId}_${currentFloor}`;
    // Old saves may have _dungeonFloors but no _eventPositions (initDungeonSystem
    // only seeds it when _dungeonFloors is absent); guard so map load doesn't throw.
    const passableTiles = ($gameSystem._eventPositions && $gameSystem._eventPositions[key]) || [];
    
    // Get treasure room position
    const treasureKey = `treasure_${currentMapId}_${currentFloor}`;  // i18n-ignore  record key
    const treasureRoomPosition = $gameSystem._treasureRoomPositions ? 
        $gameSystem._treasureRoomPositions[treasureKey] : null;

    const events = $gameMap.events();
    const randomEventNames = ["RandomItemChest", "RandomArmorChest", "RandomWeaponChest", "LearnSkill"];
    
    let passableTileIndex = 0;

    for (const event of events) {
        if (!event || !event.event()?.name) continue;

        const eventName = event.event().name;

        if (eventName === "NextFloor") {
            // The last demo floor has nowhere to go up to, so the staircase is
            // removed instead of being left as a dead interaction.
            if (params.demoMode && currentFloor >= params.demoMaxFloor) {
                event.locate(-1, -1);
                event.setOpacity(0);
            } else if (upstairsLoc.mapId === currentMapId) {
                placeEventKeepingPose(event, upstairsLoc.x, upstairsLoc.y);
                event.setOpacity(255);
                event.setThrough(false);
            } else {
                event.locate(-1, -1);
                event.setOpacity(0);
            }
        } else if (eventName === "PrevFloor") {
            if (downstairsLoc.mapId === currentMapId) {
                placeEventKeepingPose(event, downstairsLoc.x, downstairsLoc.y);
                event.setOpacity(255);
                event.setThrough(false);
            } else {
                event.locate(-1, -1);
                event.setOpacity(0);
            }
        } else if (eventName === "TreasureRoom") {
            if (treasureRoomPosition) {
                placeEventKeepingPose(event, treasureRoomPosition.x, treasureRoomPosition.y);
                event.setOpacity(255);
                event.setThrough(false);
            } else {
                event.locate(-1, -1);
                event.setOpacity(0);
            }
        } else if (randomEventNames.includes(eventName)) {
            if (passableTiles.length > passableTileIndex) {
                const tile = passableTiles[passableTileIndex];
                placeEventKeepingPose(event, tile.x, tile.y);
                event.setOpacity(255);
                event.setThrough(false);
                passableTileIndex++;
            } else {
                placeEventKeepingPose(event, params.playerSpawnX + passableTileIndex, params.playerSpawnY);
                event.setOpacity(255);
                event.setThrough(false);
                passableTileIndex++;
            }
        }
    }
}

  // Helper function to check if current map is a dungeon map
  function isDungeonMap(mapId) {
    if (!mapId || mapId <= 0) return false;

    // Any map in the dungeon folder, or hanging off one of its floors, plus
    // the elevator halls.
    const infos = window.$dataMapInfos;
    if (Array.isArray(infos)) {
      let id = mapId;
      let guard = 0;
      while (infos[id] && guard++ < 100) {
        if (params.dungeonFolderIds.indexOf(infos[id].parentId) >= 0) return true;
        id = infos[id].parentId;
        if (!id) break;
      }
    }
    if (params.elevatorMaps.indexOf(mapId) >= 0) return true;

    // Also check boss floor
    if (mapId === params.bossFloorMapId) return true;

    return false;
  }

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function () {
    // Before anything reads the map: a scene rebuilt without a transfer (a
    // menu, the status screen) has just reloaded $dataMap from disk, and every
    // band member standing on the floor would be an event with no data behind
    // it. A transfer is the other case, and it rebuilds the events anyway.
    if (!($gamePlayer && $gamePlayer.isTransferring())) bandRestoreEventData();
    _Scene_Map_onMapLoaded.call(this);
    // The procedural map answers to the lower tower's rules, never to the
    // hand-made floors': its NextFloor / PrevFloor / Elevator events belong to
    // a generated floor and are taken off every other square in the world.
    if ($gameMap.mapId() === PROC_MAP_ID) {
      updateTowerFloorEvents();
    } else {
      repositionStairEvents();
    }

    // Disable saving in dungeon maps, enable it outside
    const currentMapId = $gameMap.mapId();
    if (isDungeonMap(currentMapId)) {
      $gameSystem.disableSave();
    } else {
      $gameSystem.enableSave();
    }

    // The other climbers are dealt once the floor is standing: the spriteset
    // exists by now, so each of them is handed its sprite as it is put down.
    try {
      bandSpawnFloor();
    } catch (e) {
      console.error("[DungeonFloorSystem] could not put this floor's bands down", e);
    }

    $gameScreen.startFadeIn(15);
  };

  // The bands walk and fight on the map's own frames, never in a battle, a
  // message or a menu (see bandUpdate).
  const _Scene_Map_update_bands = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function () {
    _Scene_Map_update_bands.call(this);
    if (this.isActive()) bandUpdate();
  };


})();