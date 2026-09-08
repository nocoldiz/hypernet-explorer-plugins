
/*:
 * @target MZ
 * @plugindesc Handles a system of procedural houses and multi-floor buildings.
 * @author Omni-Lex
 *
 * @param spawnRegionId
 * @text Spawn Region ID
 * @desc Region ID to spawn player at in house (default: 13)
 * @type number
 * @default 13
 *
 * @param lockDoors
 * @text Lock Doors
 * @desc When ON, all procedural house doors are locked and cannot be entered
 * @type boolean
 * @default false
 *
 * @command visitHouse
 * @text Visit House
 * @desc Transports the player to a house with modified NPCs
 *
 * @arg poolName
 * @text Pool Name
 * @desc The name of the house pool to use (leave empty for random from all pools)
 * @type string
 * @default
 *
 * @arg facing
 * @text Use Facing Direction
 * @desc When true, uses the tile the player is facing instead of event location
 * @type boolean
 * @default false
 *
 * @command exitHouse
 * @text Exit House
 * @desc Transports the player back to where they were before entering the house
 *
 * @command enterMultiBuilding
 * @text Enter Multi-Floor Building
 * @desc Transports the player to a procedurally generated multi-floor building.
 *
 * @arg baseFloorPool
 * @text Base Floor Pool
 * @desc The name of the house pool to use for the ground floor.
 * @type string
 *
 * @arg upperFloorsPool
 * @text Upper Floors Pool
 * @desc The name of the house pool to use for all other floors.
 * @type string
 *
 * @arg numFloors
 * @text Number of Floors
 * @desc The total number of floors in the building.
 * @type number
 * @min 1
 * @default 3
 *
 * @arg facing
 * @text Use Facing Direction
 * @desc When true, uses the tile the player is facing instead of event location
 * @type boolean
 * @default false
 *
 * @command NextFloor
 * @text Go to Next Floor
 * @desc Moves the player to the next floor in a multi-floor building.
 *
 * @command PreviousFloor
 * @text Go to Previous Floor
 * @desc Moves the player to the previous floor in a multi-floor building.
 *
 * @command Elevator
 * @text Open Elevator
 * @desc Shows a floor picker (every floor except the current) and rides to the chosen floor with a distance-based delay.
 */

(() => {
  "use strict";
  const pluginName = "ProceduralHouseSystem";

  window.ProceduralHouseSystem = {
      currentHouseSeed: null,
      getCurrentHouseSeed() {
          return this.currentHouseSeed;
      },
      housePoolParentIds: [1132, 1133, 1134, 1135, 1136, 1137, 1394, 1156, 1157],
      // Public helpers for NPCSimulationCore home assignment
      _selectHouse(seed, poolName) { return selectHouse(seed, poolName); },
      _getHouseList(poolName) { return getHouseList(poolName, true); },
      // ── Building identity (NPC residents) ────────────────────────────────
      // Descriptor of the building the player is currently inside: the town map
      // + entrance tile that identifies it, its pool/type, and which floor is
      // being shown. NPCSystem uses this to decide who lives (or hangs out)
      // here. Returns null when not inside a generated building.
      getCurrentBuilding() { return _currentBuilding; },
      getCurrentFloorIndex() { return _currentBuilding ? _currentBuilding.floorIndex : 0; },
      // A "public" building is a skyscraper: nobody lives there, the whole town
      // passes through it. Everything else is residential and gets occupants.
      isBuildingPublic(building) { return isBuildingPublic(building); },
      isPublicPool(poolName) { return isPublicPool(poolName); },
      isSkyscraperBuilding(building) { return isSkyscraperBuilding(building); },
      isSkyscraperPool(poolName) { return isSkyscraperPool(poolName); },
      isResidentialBuilding(building) { return isResidentialBuilding(building); },
      isPublicInteriorMap(mapId) { return isPublicInteriorMap(mapId); },
      normalizePoolName(poolName) { return normalizePoolName(poolName); },
      buildingKey(building, groupName) { return buildingKey(building, groupName); },
      floorInteriorMapId(building, floorIndex) { return floorInteriorMapId(building, floorIndex); },
      // ── Player ownership API (buying procedural houses, one floor at a time) ──
      isInsideHouse() { return getCurrentOwnershipKey() !== null; },
      getCurrentOwnershipKey() { return getCurrentOwnershipKey(); },
      // Per-instance container discriminator (ContainerSystem). The ownership key
      // (entrance map+tile, plus `_f<floor>` for multi-floor buildings) uniquely
      // identifies the physical building the player is currently inside, so each
      // reuse of a shared interior template keeps independent container loot.
      // Returns null when not inside a generated house/building.
      getContainerInstanceKey() { return getCurrentOwnershipKey(); },
      isCurrentFloorOwned() { return isCurrentFloorOwned(); },
      // Only <BuildRights: Owner> houses can be bought. Free houses already allow
      // building (no purchase needed) and Disabled houses can never be owned.
      canOfferPurchase() {
        return getCurrentOwnershipKey() !== null
          && getCurrentBuildRights() === 'Owner'  // i18n-ignore  note-tag value
          && !isCurrentFloorOwned();
      },
      getCurrentFloorPrice(opinion) { return getCurrentFloorPrice(opinion); },
      buyCurrentFloor() { return buyCurrentFloor(); },
      // Directly grants ownership of an entrance the player has not yet walked
      // into (used by FurnitureSystem's House tab: the door is bought and paid
      // for up front, before it is ever entered), so its interior opens with
      // <BuildRights: Owner> already satisfied instead of requiring a second,
      // in-house purchase.
      markEntranceOwned(mapId, x, y) { return markEntranceOwned(mapId, x, y); },
      // Read-only listing of every owned floor for the Assets pockets. Each entry
      // exposes the entrance map name + tile so the player can locate the deed.
      listOwnedHouses() { return listOwnedHouses(); },
      // Procedural-map interactive FEATURES. Building/dungeon doors are ENTERED
      // BY WALKING into them (ProceduralTerrainInteractions' walk-entrance hook
      // calls enterDoorFeatureAt with the door's own tile), the same way the
      // StairsUp / StairsDown / Cave / Grate entrances beside them work.
      // tryProcMapInteract is the action-button path, which the signposts
      // (SignPark vehicle recall / SignBus fast-travel) still need, and which
      // keeps working on a door the party is already standing on.
      enterDoorFeatureAt(name, x, y) { return enterDoorFeatureAt(name, x, y); },
      isInteractFeature(name) { return INTERACT_FEATURES.has(name); },
      tryProcMapInteract(character) { return tryProcMapInteract(character); },
      // ── Door tiles on maps that are not the procedural one ────────────────
      // Bologna's OSM cells draw their own doors and share one map id (353)
      // between every cell, so they enter through enterTileDoorAt and tell the
      // seed which cell it is through setSeedSaltProvider. interiorMapIdFor
      // answers "what is behind this door" without opening it.
      enterTileDoorAt(poolName, x, y, forcedHouseId, forceOpen) { return enterTileDoorAt(poolName, x, y, forcedHouseId, forceOpen); },
      interiorMapIdFor(poolName, x, y, mapId) { return interiorMapIdFor(poolName, x, y, mapId); },
      // ── Doors that name their own trade (tileset 303) ──────────────────────
      // Which interiors a trade door may open onto, and which one THIS door
      // does. Read them here rather than keeping a second copy of the table:
      // the shop-sign pass and the NPC spawner both need to know what is behind
      // a door without opening it.
      isTradeDoor(name) { return !!TRADE_DOORS[name]; },
      tradeDoorNames() { return Object.keys(TRADE_DOORS); },
      tradeDoorMapId(name, x, y, mapId) { return tradeDoorMapId(name, x, y, mapId); },
      genericShopMapId(x, y, mapId) { return genericShopMapId(x, y, mapId); },
      setSeedSaltProvider(fn) { _seedSaltProvider = (typeof fn === "function") ? fn : null; },
  };
  const parameters = PluginManager.parameters(pluginName);
  
  const parentMapConfig = {
    "houses": [1132, 1134],
    "skyscrapers": 1133,
    "villas": 1135,
    "floors": 1136,
    "skyfloors": 1137,
    "abandoned": 1394,
    "inns": 1156,
    "shops": 1157
  };
  
  const housePoolsJSON = {
    "abandoned": [1395, 1396, 1397],
    "houses": [638, 640, 641, 642, 643, 644, 646, 648, 649, 651, 653, 653, 656, 665, 669, 670, 673],
    "skyscrapers": [649, 671, 672],
    "villas": [644, 647, 650, 652, 655, 657, 658, 661, 662, 666, 668],
    "skyfloors": [1143, 1144, 1145, 1146, 1147, 1148, 1149, 1150, 1151],
    "floors": [1138, 1139, 1140, 1141, 1142, 1152, 1153, 1154, 1155],
    "inns": [1390,1391],
    "shops": [1392,1393]
  };
  
  let housePools = null;
  let housePoolsInitialized = false;

  function getChildMapsOfParent(parentId) {
    const childMaps = [];
    if (!$dataMapInfos) return childMaps;
    for (let i = 1; i < $dataMapInfos.length; i++) {
      const mapInfo = $dataMapInfos[i];
      if (mapInfo && mapInfo.parentId === parentId) {
        childMaps.push(i);
      }
    }
    return childMaps.sort((a, b) => a - b);
  }

  function generateAutomaticHousePools() {
    const pools = {};
    // A pool may name more than one parent map: the old "huts" parent (1134)
    // was folded into "houses", so both sets of child maps are one pool now.
    for (const [poolName, parentId] of Object.entries(parentMapConfig)) {
      const parentIds = Array.isArray(parentId) ? parentId : [parentId];
      const maps = new Set();
      parentIds.forEach(id => getChildMapsOfParent(id).forEach(m => maps.add(m)));
      pools[poolName] = Array.from(maps).sort((a, b) => a - b);
    }
    return pools;
  }

  // The old "housePools" plugin parameter was removed. Pools are now derived
  // straight from parentMapConfig: each pool is the set of child maps of its
  // parent map in MapInfos (e.g. "inns" -> every map under parent 1156, "shops"
  // -> every map under 1157). This is what fixes visitHouse("inns") landing the
  // player in a normal house, the old param default carried no inns/shops keys,
  // so those pool names fell through to the "all houses" catch-all. housePoolsJSON
  // is only an emergency fallback for the rare case where map metadata is not
  // available at call time.
  function initializeHousePools() {
    if ($dataMapInfos) {
      const autoPools = generateAutomaticHousePools();
      const hasValidPools = Object.values(autoPools).some(maps => maps.length > 0);
      if (hasValidPools) return autoPools;
    }
    return housePoolsJSON;
  }

  function ensureHousePoolsInitialized() {
    if (!housePoolsInitialized) {
      housePools = initializeHousePools();
      housePoolsInitialized = true;
    }
  }

  // Storage
  const houseReturnPoints = {};
  const multiBuildingStructures = {};

  let _mapGroupsData = null;
  function loadMapGroupsData() {
    if (_mapGroupsData !== null) return;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'js/db/WorldGen/MapGroups.json', false);
      xhr.send();
      _mapGroupsData = xhr.status === 200 ? JSON.parse(xhr.responseText) : {};
    } catch(e) {
      _mapGroupsData = {};
    }
  }

  // A door opened straight from the editor has no way in and so no way out: the
  // fallback picks a residential building at random and drops the party there.
  // That is a playtest convenience and nothing else. In a shipped build a lost
  // return point must never turn into a random teleport across the world (see
  // returnToRecordedSquare, which is the real answer), so the fallback is not
  // offered at all outside a playtest.
  function findPlaytestFallbackLocation() {
    if (!$gameTemp || !$gameTemp.isPlaytest()) return null;
    loadMapGroupsData();
    const currentMapId = $gameMap.mapId();
    let groupBuildings = [];
    let allBuildings = [];
    let allGroupNames = [];
    for (const [name, group] of Object.entries(_mapGroupsData)) {
      const buildings = group.residentialBuildings || [];
      buildings.forEach(b => { allBuildings.push(b); allGroupNames.push(name); });
      if (group.maps && group.maps.includes(currentMapId)) {
        buildings.forEach(b => groupBuildings.push({ building: b, groupName: name }));
      }
    }
    if (groupBuildings.length > 0) {
      const pick = groupBuildings[Math.floor(Math.random() * groupBuildings.length)];
      return { building: pick.building, groupName: pick.groupName };
    }
    if (allBuildings.length === 0) return null;
    const idx = Math.floor(Math.random() * allBuildings.length);
    return { building: allBuildings[idx], groupName: allGroupNames[idx] };
  }

  // Session tracking
  let currentHouseSessionId = null;
  let currentMultiBuilding = null;
  let _postTransferActions = null;
  let _savedBgm = null;
  // Event that triggered the current door entry (so the open animation, now
  // driven by the plugin, can swing the right door). Captured per command call.
  let _callerEventId = 0;
  // Active door-open animation state, polled in Scene_Map.update.
  let _doorEntry = null;
  // Active elevator ride: screen fades to black, then after a distance-based
  // wait the floor transfer fires. Polled in Scene_Map.update.
  let _elevatorTransit = null;

  PluginManager.registerCommand(pluginName, "visitHouse", function (args) {
    if (doorEntryBusy()) return;
    _callerEventId = (typeof this.eventId === "function") ? this.eventId() : 0;
    // houseId/alwaysOpen are undeclared, optional extra args (not shown in the
    // Plugin Command GUI): FurnitureSystem-built doors set them so the door
    // always opens onto the SPECIFIC template the player bought (instead of
    // the normal seeded-random pick from the pool) and is never locked.
    const forcedId = args.houseId ? Number(args.houseId) : null;
    const forceOpen = args.alwaysOpen === "true" || args.alwaysOpen === true;
    visitHouse(args.poolName || "", args.facing === "true" || args.facing === true, forcedId, forceOpen);
  });

  PluginManager.registerCommand(pluginName, "exitHouse", (args) => {
    exitHouse();
  });

  PluginManager.registerCommand(pluginName, "enterMultiBuilding", function (args) {
    if (doorEntryBusy()) return;
    _callerEventId = (typeof this.eventId === "function") ? this.eventId() : 0;
    enterMultiBuilding(args.baseFloorPool, args.upperFloorsPool, Number(args.numFloors), args.facing === "true" || args.facing === true);
  });

  PluginManager.registerCommand(pluginName, "NextFloor", (args) => {
    changeFloor('next');
  });

  PluginManager.registerCommand(pluginName, "PreviousFloor", (args) => {
    changeFloor('previous');
  });

  PluginManager.registerCommand(pluginName, "Elevator", (args) => {
    openElevator();
  });

  function createLocationKey() {
    return `${$gameMap.mapId()}_${$gamePlayer.x}_${$gamePlayer.y}`;
  }

  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Canonical world seed so generated buildings are consistent per world
  function getWorldSeed() {
    let historySeed = 19002001;
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
      historySeed = window.HistoryManager.getSeed();
    } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
      historySeed = $gameSystem._historySeed;
    }
    return historySeed >>> 0;
  }

  // A map id is not always a place. Map 636 is every world square and map 353
  // is every Bologna cell, so a door tile at the same coordinates on two
  // different places would otherwise seed the same interior. A plugin that
  // reuses one map id for many places registers a salt here and its doors stop
  // sharing buildings with the next place's. Absent (or 0) leaves every seed
  // exactly as it has always been.
  let _seedSaltProvider = null;
  function mapSeedSalt() {
    if (!_seedSaltProvider) return 0;
    try { return (_seedSaltProvider() | 0) >>> 0; } catch (e) { return 0; }
  }

  function createSeed(mapId, x, y) {
    return ((mapId * 1000000 + x * 1000 + y) ^ getWorldSeed() ^ mapSeedSalt()) >>> 0;
  }

  function getSeededRandomFromArray(array, seed) {
    if (array.length === 0) return null;
    const index = Math.floor(seededRandom(seed) * array.length);
    return array[index];
  }

  // Set while a procedural-map door FEATURE is being entered: the entrance is a
  // tile, not an event, and the party may be standing on it (a passable doorway
  // they walked over) or in front of it (an impassable one they walked into), so
  // neither the player tile nor the faced tile identifies the door reliably. The
  // exact tile is pinned here instead, and every coordinate the entry derives
  // (seed, return point, lock/bash key) comes from it.
  let _procDoorTile = null;
  function withDoorTile(tile, fn) {
    const prev = _procDoorTile;
    _procDoorTile = tile;
    try { return fn(); } finally { _procDoorTile = prev; }
  }

  function getEventCoordinates(useFacing = false) {
    if (_procDoorTile) return { x: _procDoorTile.x, y: _procDoorTile.y };
    let eventX = $gamePlayer.x;
    let eventY = $gamePlayer.y;
    const frontX = $gamePlayer.x + ($gamePlayer.direction() === 6 ? 1 : $gamePlayer.direction() === 4 ? -1 : 0);
    const frontY = $gamePlayer.y + ($gamePlayer.direction() === 2 ? 1 : $gamePlayer.direction() === 8 ? -1 : 0);

    if (useFacing) {
      eventX = frontX;
      eventY = frontY;
    } else {
      const event = $gameMap.eventIdXy(frontX, frontY);
      if (event > 0) {
        eventX = frontX;
        eventY = frontY;
      }
    }
    return { x: eventX, y: eventY };
  }

  function getHouseList(poolName, excludeFloorPools = false) {
    ensureHousePoolsInitialized();
    const excludedPools = ['skyfloors', 'floors'];
    
    // Normalize poolName and handle singular/plural mapping
    let targetPoolName = normalizePoolName(poolName);
    if (targetPoolName !== "") {
      if (housePools[targetPoolName]) {
        return [...housePools[targetPoolName]];
      }
      const pluralized = targetPoolName.endsWith('s') ? targetPoolName : (targetPoolName === 'house' ? 'houses' : targetPoolName + 's');
      if (housePools[pluralized]) {
        return [...housePools[pluralized]];
      }
    }

    if (!targetPoolName || targetPoolName === "") {
      const allHouses = new Set();
      Object.entries(housePools).forEach(([poolKey, poolMaps]) => {
        if (excludeFloorPools && excludedPools.includes(poolKey)) return;
        poolMaps.forEach(mapId => allHouses.add(mapId));
      });
      return Array.from(allHouses);
    }
    if (excludeFloorPools && excludedPools.includes(targetPoolName)) return getHouseList("", true);
    console.warn(`House pool "${poolName}" not found.`);
    return getHouseList("", excludeFloorPools);
  }

  function saveHouseReturnPoint(useFacing = false) {
    const eventCoords = getEventCoordinates(useFacing);
    const returnPoint = {
      mapId: $gameMap.mapId(),
      eventX: eventCoords.x,
      eventY: eventCoords.y,
      direction: $gamePlayer.direction(),
    };
    // A door on the procedural map: record the square it stands on, so leaving
    // the building puts the party back on that exact square. Taken here rather
    // than in the individual entry paths so every kind of entrance gets one --
    // single houses, tower blocks and everything that reaches this function.
    if ($gameMap.mapId() === PROC_MAP_ID) {
      // Map 636 holds a WINDOW of up to nine world squares laid side by side, so
      // the door's map coordinate says nothing on its own: the window built for
      // the walk back may be a different shape and lay the very same square
      // somewhere else on the map. Every coordinate that outlives the trip is
      // square-local, which is also the only thing a transfer onto 636
      // understands (see THE STITCHED WINDOW in WorldMapReturn).
      //
      // Without this, leaving a shop put the party down in a neighbouring
      // square, which on an ocean is the same water with the prefab that held
      // the shop nowhere in it: the building looked deleted, and the party had
      // simply been dropped a square away from it.
      const S = window.ProcStitch;
      if (S && typeof S.localToParty === "function") {
        const local = S.localToParty(returnPoint.eventX, returnPoint.eventY);
        returnPoint.eventX = local.x;
        returnPoint.eventY = local.y;
      }
      // The square those coordinates belong to. savedBiomeData describes the
      // same one; this is what answers when there is no snapshot to restore.
      returnPoint.worldX = $gameVariables.value(43);
      returnPoint.worldY = $gameVariables.value(44);
      const wmr = window.WorldMapReturn;
      if (wmr && typeof wmr.snapshotProcSurface === "function") {
        returnPoint.savedBiomeData = wmr.snapshotProcSurface();
      }
    }
    const sessionId = Date.now() + "_" + Math.random();
    houseReturnPoints[sessionId] = returnPoint;
    currentHouseSessionId = sessionId;
    return sessionId;
  }

  function selectHouse(seed, poolName) {
    const houseList = getHouseList(poolName, true);
    if (houseList.length === 0) return null;
    return getSeededRandomFromArray(houseList, seed);
  }

  // ── Building identity: residential vs. public ───────────────────────────────
  // Every building the player can walk into is either a HOME (a house,
  // patron villa, abandoned shell, inn, shop, or a low-rise with residential floors),
  // which belongs to specific NPCs of the surrounding town, or a PUBLIC space
  // (a skyscraper and its upper floors), which belongs to nobody and is instead
  // frequented by the whole town at any hour. NPCSystem branches on this.
  //
  // Skyscraper interiors live under the "Skyscrapers" (1133) and "SkyScraper
  // Floors" (1137) parent maps, so the interior template alone is enough to
  // classify a building even when the entrance descriptor is unavailable. This
  // is what makes the rule hold for the hardcoded map pools as well as for
  // procedural towns.
  const PUBLIC_PARENT_IDS = [1133, 1137];
  const PUBLIC_POOLS = new Set(["skyscrapers", "skyfloors"]);
  const SKYSCRAPER_POOLS = new Set(["skyscrapers", "skyfloors"]);

  // Pool names are authored inconsistently across map events ("skyscraper",
  // "skyscrapers", "house", ""), so normalize the same way getHouseList does.
  function normalizePoolName(poolName) {
    const n = String(poolName || "").trim().toLowerCase();
    if (!n) return "";
    // The huts pool was merged into houses: any leftover authored "hut"/"huts"
    // pool name resolves to the house pool.
    if (n === "house" || n === "hut" || n === "huts") return "houses";
    return n.endsWith("s") ? n : n + "s";
  }

  function isPublicPool(poolName) {
    return PUBLIC_POOLS.has(normalizePoolName(poolName));
  }

  function isSkyscraperPool(poolName) {
    return SKYSCRAPER_POOLS.has(normalizePoolName(poolName));
  }

  function isSkyscraperBuilding(building) {
    if (!building) return false;
    const base = buildingBasePool(building);
    if (isSkyscraperPool(base)) return true;
    if (building.interiorMapId && $dataMapInfos && $dataMapInfos[building.interiorMapId]) {
      return PUBLIC_PARENT_IDS.includes($dataMapInfos[building.interiorMapId].parentId);
    }
    return false;
  }

  // Only private homes can be locked. The night lockpick/bash prompt (and the
  // lockDoors block) applies to the houses pool; every other
  // pool (shops, inns, skyscrapers, abandoned, floors, ...) is always visitable.
  const LOCKABLE_POOLS = new Set(["houses"]);

  function isLockablePool(poolName) {
    return LOCKABLE_POOLS.has(normalizePoolName(poolName));
  }

  // A door event whose Note contains "unlocked" is authored as permanently open:
  // it skips the lockDoors block and the night lockpick/bash prompt whatever its
  // pool is. Read from the event that issued the current entry command.
  function isCallerDoorUnlocked() {
    if (!_callerEventId || !$gameMap) return false;
    const ev = $gameMap.event(_callerEventId);
    const note = (ev && ev.event() && ev.event().note) || "";
    return /unlocked/i.test(note);
  }

  function isPublicInteriorMap(mapId) {
    if (!mapId || !$dataMapInfos || !$dataMapInfos[mapId]) return false;
    return PUBLIC_PARENT_IDS.includes($dataMapInfos[mapId].parentId);
  }

  function isBuildingPublic(building) {
    if (!building) return false;
    const base = buildingBasePool(building);
    // A skyscraper and its floors belong to nobody: the whole town walks in.
    if (PUBLIC_POOLS.has(base)) return true;
    if (COMMERCIAL_POOLS.has(base)) return true;
    const interior = building.interiorMapId;
    if (interior && $dataMapInfos && $dataMapInfos[interior]) {
      const parent = $dataMapInfos[interior].parentId;
      if (PUBLIC_PARENT_IDS.includes(parent)) return true;
      if (COMMERCIAL_PARENT_IDS.includes(parent)) return true;
    }
    return false;
  }

  // Inns and shops are commercial: they are staffed (see NPCSystem's <Shop>
  // handling), not lived in, so no townsperson is given one as an address.
  const COMMERCIAL_PARENT_IDS = [1156, 1157];
  const COMMERCIAL_POOLS = new Set(["inns", "shops"]);

  function buildingBasePool(building) {
    return building.type === "enterMultiBuilding"
      ? normalizePoolName(building.baseFloorPool || "skyscrapers")
      : normalizePoolName(building.poolName);
  }

  // True for buildings that can house residents: houses, abandoned shells,
  // residential walk-ups, and skyscrapers (which house wealthy citizens on their floors).
  function isResidentialBuilding(building) {
    if (!building) return false;
    if (COMMERCIAL_POOLS.has(buildingBasePool(building))) return false;
    const interior = building.interiorMapId;
    if (interior && $dataMapInfos && $dataMapInfos[interior] &&
        COMMERCIAL_PARENT_IDS.includes($dataMapInfos[interior].parentId)) return false;
    return true;
  }

  // Stable identity for a physical building, used as the occupancy key. Map 636
  // is reused for every procedural world tile, so the settlement group name has
  // to be part of the key: without it two towns with a door on the same tile
  // would share residents.
  function buildingKey(building, groupName) {
    if (!building) return null;
    const g = groupName || building.groupName || "";
    return `${g}|${building.mapId}_${building.x}_${building.y}`;
  }

  // Which interior template a given floor of a building resolves to. Mirrors
  // generateMultiBuildingStructure exactly, so an NPC's home floor maps to the
  // same interior the player walks into. Used to give per-floor residents the
  // right homeMapId without having to enter the building first.
  function floorInteriorMapId(building, floorIndex = 0) {
    if (!building) return null;
    if (building.type !== 'enterMultiBuilding') {
      return selectHouse(building.seed, building.poolName || 'houses');
    }
    if (!floorIndex) {
      return selectHouse(building.seed, building.baseFloorPool || 'skyscrapers');
    }
    const upper = getHouseList(building.upperFloorsPool || 'skyfloors');
    return getSeededRandomFromArray(upper, building.seed + floorIndex * 777);
  }

  // The building the player is currently inside (null when outdoors). Kept in
  // sync by every entry point and by each floor change, and persisted with the
  // save alongside currentMultiBuilding.
  let _currentBuilding = null;

  function setCurrentBuilding(building) {
    _currentBuilding = building;
    window.ProceduralHouseSystem.currentHouseSeed = building ? building.seed : null;
  }

  // Floor moves keep the same physical building, only the shown floor changes.
  function setCurrentFloor(floorIndex, interiorMapId) {
    if (!_currentBuilding) return;
    _currentBuilding.floorIndex = floorIndex;
    _currentBuilding.interiorMapId = interiorMapId;
  }

  // ── Player ownership of procedural houses ──────────────────────────────────
  // Ownership is keyed by the building entrance plus the current floor index, so
  // each floor of a multi-floor building can be bought independently. Single
  // houses are floor 0. State lives on $gameSystem so it persists with saves.

  function _hashKey(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  // Reads the current map's <BuildRights: Free|Owner|Disabled> tag, preferring
  // FurnitureSystem's parser so both plugins agree. Defaults to Free.
  function getCurrentBuildRights() {
    if (window.FurnitureSystem?.getMapBuildRights) {
      return window.FurnitureSystem.getMapBuildRights();
    }
    const note = ($dataMap && $dataMap.note) || '';
    const m = note.match(/<BuildRights:\s*(\w+)>/i);
    // i18n-ignore-start  <BuildRights:> note-tag values
    if (!m) return 'Free';
    const v = m[1].toLowerCase();
    if (v === 'disabled') return 'Disabled';
    if (v === 'owner') return 'Owner';
    return 'Free';
    // i18n-ignore-end
  }

  function getCurrentOwnershipKey() {
    if (currentMultiBuilding) {
      return `${currentMultiBuilding.entranceKey}_f${currentMultiBuilding.currentFloorIndex}`;
    }
    const rp = houseReturnPoints[currentHouseSessionId];
    // On map 636 the door's coordinates are square-local (see
    // saveHouseReturnPoint), so the square is part of its address: local (30,40)
    // is a different door on every square of the world. It also makes the deed
    // hold still, which it never did while the address was a map coordinate:
    // that moved with the shape of the stitched window, so a floor bought on one
    // visit could be somebody else's on the next.
    if (rp) {
      const where = (rp.worldX != null)
        ? `${rp.mapId}:${rp.worldX},${rp.worldY}`
        : `${rp.mapId}`;
      return `${where}_${rp.eventX}_${rp.eventY}_f0`;
    }
    return null;
  }

  function getOwnedHouses() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return {};
    if (!$gameSystem._ownedProcHouses) $gameSystem._ownedProcHouses = {};
    return $gameSystem._ownedProcHouses;
  }

  function isCurrentFloorOwned() {
    const key = getCurrentOwnershipKey();
    if (!key) return false;
    if (getOwnedHouses()[key]) return true;
    // Companion residences inherited on party-join grant build rights inside the
    // matching interior template (NPCSystemParty.registerNPCHouse). The home is an
    // abstract template assignment with no placed entrance, so the interior map id
    // is the only concrete signal available to match on.
    return isCurrentInheritedHouse();
  }

  function isCurrentInheritedHouse() {
    if (typeof $gameSystem === 'undefined' || !$gameSystem) return false;
    const list = $gameSystem._npcInheritedHouses;
    if (!Array.isArray(list) || !list.length) return false;
    const mapId = $gameMap ? $gameMap.mapId() : null;
    return mapId != null && list.some(h => h.mapId === mapId);
  }

  // Price in gold (100 gold = 1 euro). A stable per-floor base price is derived
  // from the ownership key and world seed, then discounted by NPC disposition:
  // +100 opinion gives a 50% discount, -100 adds a 50% surcharge.
  function getCurrentFloorPrice(opinion) {
    const key = getCurrentOwnershipKey();
    if (!key) return 0;
    const h = (_hashKey(key) ^ getWorldSeed()) >>> 0;
    const base = 30000 + Math.floor(seededRandom(h) * 60000); // 300€ .. 900€
    const op = Math.max(-100, Math.min(100, Number(opinion) || 0));
    const mult = 1 - (op / 200);
    return Math.max(1000, Math.round(base * mult / 100) * 100);
  }

  // The entrance map alone does not say where a deed is: the procedural map is
  // the same map id on every square of the world. Stamp the world coordinate the
  // purchase was made on so the property can be named after its actual place
  // (see listOwnedHouses).
  function deedRecord() {
    const vars = (typeof $gameVariables !== 'undefined') ? $gameVariables : null;
    return {
      day: vars ? vars.value(113) : 0,
      gameMin: vars ? vars.value(114) : 0,
      worldX: vars ? vars.value(43) : 0,
      worldY: vars ? vars.value(44) : 0,
    };
  }

  function buyCurrentFloor() {
    const key = getCurrentOwnershipKey();
    if (!key) return false;
    getOwnedHouses()[key] = deedRecord();
    return true;
  }

  // The address a door built at (x,y) on `mapId` will answer to once the party
  // walks through it. It has to be spelled exactly the way getCurrentOwnershipKey
  // spells it, world-square prefix and square-local coordinates included, or a
  // house the player put up themselves reads as somebody else's the moment they
  // step inside (its cupboards then file thefts, and its deed never shows in the
  // asset register).
  function ownershipKeyForEntrance(mapId, x, y) {
    if (mapId !== PROC_MAP_ID) return `${mapId}_${x}_${y}_f0`;
    const S = window.ProcStitch;
    const local = (S && typeof S.localToParty === 'function')
      ? S.localToParty(x, y)
      : { x, y };
    const wx = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(43) : 0;
    const wy = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(44) : 0;
    return `${mapId}:${wx},${wy}_${local.x}_${local.y}_f0`;
  }

  function markEntranceOwned(mapId, x, y) {
    const key = ownershipKeyForEntrance(mapId, x, y);
    getOwnedHouses()[key] = deedRecord();
    return key;
  }

  // Returns every owned floor with its deterministic base value (gold) and the
  // place name/coordinates of its entrance. Ownership keys are
  // `${mapId}_${x}_${y}_f${floor}` where mapId/x/y identify the map and tile of
  // the entrance event the player used to enter.
  function listOwnedHouses() {
    const owned = getOwnedHouses();
    return Object.keys(owned).map(key => {
      // Two spellings: a plain `mapId_x_y_f0`, and the procedural map's
      // `mapId:worldX,worldY_x_y_f0`, whose coordinates are square-local.
      const m = key.match(/^(\d+)(?::(-?\d+),(-?\d+))?_(\d+)_(\d+)_f(\d+)$/);
      const mapId = m ? Number(m[1]) : null;
      const x = m ? Number(m[4]) : null;
      const y = m ? Number(m[5]) : null;
      const floor = m ? Number(m[6]) : 0;
      const keyWorld = (m && m[2] != null) ? { x: Number(m[2]), y: Number(m[3]) } : null;
      const h = (_hashKey(key) ^ getWorldSeed()) >>> 0;
      const value = 30000 + Math.floor(seededRandom(h) * 60000); // gold (300-900 EUR)
      const rec = owned[key] || {};
      // Named through WorldMapReturn so a deed on the procedural map reads as the
      // place it was bought in ("Milano (88,131)") instead of the reused map's
      // own name, "ProceduralRoom". Deeds signed before the world coordinate was
      // recorded fall back to the party's current square.
      let mapName = T('ProceduralHouse.unknownLocation');
      if (mapId != null && window.WorldMapReturn && window.WorldMapReturn.placeName) {
        const coords = keyWorld || ((rec.worldX != null) ? { x: rec.worldX, y: rec.worldY } : null);
        mapName = window.WorldMapReturn.placeName(mapId, coords) || mapName;
      } else if (mapId != null && $dataMapInfos && $dataMapInfos[mapId] && $dataMapInfos[mapId].name) {
        mapName = $dataMapInfos[mapId].name;
      }
      return { key, mapId, x, y, floor, value, mapName, day: rec.day, gameMin: rec.gameMin };
    });
  }

  function findEventByName(name) {
    return $gameMap.events().find(event => event && event.event() && event.event().name === name);
  }

  function updateStairVisibility() {
    if (!currentMultiBuilding) return;
    const floor = currentMultiBuilding.currentFloorIndex;
    const total = currentMultiBuilding.structure.totalFloors;
    // i18n-ignore-start  event names
    const upstairsEvent = findEventByName("Upstairs");
    const downstairsEvent = findEventByName("Downstairs");
    // i18n-ignore-end
    if (upstairsEvent && floor >= total - 1) $gameMap.event(upstairsEvent.eventId()).erase();
    if (downstairsEvent && floor <= 0) $gameMap.event(downstairsEvent.eventId()).erase();
    $gameMap.refresh();
  }

  function generateMultiBuildingStructure(seed, basePool, upperPool, numFloors) {
    const totalFloors = 1 + numFloors;
    const structure = { floors: [], totalFloors: totalFloors };
    const baseFloorList = getHouseList(basePool);
    const upperFloorsList = getHouseList(upperPool);
    if (baseFloorList.length === 0 || upperFloorsList.length === 0) return null;
  
    structure.floors.push(getSeededRandomFromArray(baseFloorList, seed));
    for (let i = 0; i < numFloors; i++) {
      structure.floors.push(getSeededRandomFromArray(upperFloorsList, seed + (i + 1) * 777));
    }
    return structure;
  }

  function findPositionWithRegionId(regionId) {
    if (!$dataMap) return { x: 0, y: 0 };
    for (let y = 0; y < $dataMap.height; y++) {
      for (let x = 0; x < $dataMap.width; x++) {
        if ($gameMap.regionId(x, y) === regionId) return { x, y };
      }
    }
    // Fallback: search for any passable tile starting from the center of the map
    const centerX = Math.floor($dataMap.width / 2);
    const centerY = Math.floor($dataMap.height / 2);
    if ($gameMap.isPassable(centerX, centerY, 2)) {
      return { x: centerX, y: centerY };
    }
    for (let y = 0; y < $dataMap.height; y++) {
      for (let x = 0; x < $dataMap.width; x++) {
        if ($gameMap.isPassable(x, y, 2)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  function findAllPositionsWithRegionId(regionId) {
    const positions = [];
    if (!$dataMap) return positions;
    for (let y = 0; y < $dataMap.height; y++) {
      for (let x = 0; x < $dataMap.width; x++) {
        if ($gameMap.regionId(x, y) === regionId) positions.push({ x, y });
      }
    }
    return positions;
  }

  function getSeededStairPositions(seed) {
    // Fixed, not randomized: the first region-14 tile found is always Upstairs
    // and the second is always Downstairs, so a floor's stair layout never
    // shifts between visits.
    const positions = findAllPositionsWithRegionId(14);
    if (positions.length === 0) return { upstairs: null, downstairs: null };
    const upstairs = positions[0];
    const downstairs = positions.length >= 2 ? positions[1] : positions[0];
    return { upstairs, downstairs };
  }

  function placeStairsAtSeededPosition(seed) {
    const { upstairs, downstairs } = getSeededStairPositions(seed);
    if (!upstairs) return;
    // i18n-ignore-start  event names
    const upstairsEvent = findEventByName("Upstairs");
    const downstairsEvent = findEventByName("Downstairs");
    // i18n-ignore-end
    if (upstairsEvent) upstairsEvent.locate(upstairs.x, upstairs.y);
    if (downstairsEvent) downstairsEvent.locate(downstairs.x, downstairs.y);
  }

  function getMapDirection(tagName) {
    if ($dataMap && $dataMap.note) {
      const match = $dataMap.note.match(new RegExp(`<${tagName}:(\\w+)>`, "i"));
      if (match) {
        switch (match[1].toLowerCase()) {
          case "down": return 2;
          case "left": return 4;
          case "right": return 6;
          case "up": return 8;
        }
      }
    }
    return null;
  }

  // Night runs from 20:00 to 06:00, matching the proc-map biome/ambience cutoff.
  function isNightTime() {
    try {
      if (window.TimeDateSystem && typeof window.TimeDateSystem.getGameTimeMinutes === 'function') {
        const dt = window.TimeDateSystem.getDateTimeFromMinutes(window.TimeDateSystem.getGameTimeMinutes());
        const hour = parseInt(dt.hours, 10);
        return hour >= 20 || hour < 6;
      }
    } catch (e) {}
    return false;
  }

  // Pending house-entry context while the night lockpick minigame is running.
  let _pendingNightHouse = null;

  // A shoulder is put to the door once. The bash is a d20 that takes seconds to
  // land on screen, and the player keeps their legs while it does, so without
  // this the same door can be asked again (and rolled again, and broken into
  // twice) before the first throw has answered.
  let _doorAttemptBusy = false;

  function isDoorAttemptBusy() {
    return _doorAttemptBusy ||
      !!(window.Dice3D && typeof window.Dice3D.isRolling === 'function' && window.Dice3D.isRolling());
  }

  // ── Forced-door memory (world-shared) ───────────────────────────────────────
  // However a locked door was got through (bashed in, lockpicked or opened with
  // a skeleton key), it STAYS open for one in-game day: no locked-door prompt,
  // and the event goes back to below-character priority on Event Touch, so the
  // party walks in and out of it freely until it relocks.
  //
  // A broken door is a change to the world, not to one party's story, so the
  // record lives in the WORLD FOLDER (save/worlds/<name>/terrain.json, beside
  // the dismantled features) rather than in the savegame: a door bashed in by
  // one savegame stands open for every savegame of that world until it relocks.
  // Time is read from variable 114, which is world-shared and monotonic, so the
  // day is counted the same in all of them.
  //
  //   terrain.json -> { forcedDoors: { "<placeKey>": { "x,y": minute } } }
  //
  // The place key is the composite proc-map key every world-persistent system
  // uses (FurnitureSystem.furnitureMapKey: `proc:<biome>:<wx>,<wy>:<depth>` on
  // map 636, the map id elsewhere), plus the seed salt where a plugin reuses one
  // map id for many places (Bologna's cells all share map 353), so two doors at
  // the same coordinates in two different places are two different doors.
  const BASH_OPEN_MINUTES = 1440; // a forced door stays open for 24h game-time

  // ── Empty-world doors ───────────────────────────────────────────────────────
  // Nobody locked up on the way out and nobody is coming back to lock up again,
  // so an empty world's doors do not answer to the clock the way an inhabited
  // one's do. Instead each door was simply left as it was left: a seeded coin
  // flip decides, once and for all, whether this particular door happens to be
  // open or happens to be stuck. And a door that is forced is forced for good,
  // since there is nobody to repair it and no one to answer to for breaking it.
  const EMPTY_WORLD_UNLOCKED_SHARE = 0.5; // half the doors were left open

  function isEmptyWorld() {
    const WM = window.WorldManager;
    return !!(WM && typeof WM.isEmptyWorld === 'function' && WM.isEmptyWorld());
  }

  // Was this door left open? A pure function of (place, tile, world seed), so
  // one door gives the same answer forever and in every savegame of the world.
  function isEmptyWorldDoorOpen(x, y) {
    const mapId = $gameMap ? $gameMap.mapId() : 0;
    // Offset off the interior seed so a door's lock state is independent of
    // the building that is behind it.
    const seed = (createSeed(mapId, x, y) ^ 0x5eed10c) >>> 0;
    return seededRandom(seed) < EMPTY_WORLD_UNLOCKED_SHARE;
  }

  function doorPlaceKey() {
    let key = String($gameMap ? $gameMap.mapId() : 0);
    const fs = window.FurnitureSystem;
    if (fs && typeof fs.furnitureMapKey === 'function') {
      try {
        const k = fs.furnitureMapKey();
        if (k != null) key = String(k);
      } catch (e) { /* fall back to the plain map id */ }
    }
    const salt = mapSeedSalt();
    return salt ? `${key}#${salt}` : key;
  }

  function getDoorKey(useFacing) {
    const c = getEventCoordinates(useFacing);
    return `${c.x},${c.y}`;
  }

  // The world folder's forced-door table for the place the party is standing in.
  // Null when WorldManager is not there (a browser build with no world folder),
  // which the callers read as "nothing is forced open".
  function getForcedDoors(create) {
    if (!window.WorldManager || typeof window.WorldManager.getFile !== 'function') return null;
    let store = null;
    try { store = window.WorldManager.getFile('terrain'); } catch (e) { return null; }
    if (!store) return null;
    if (!store.forcedDoors) {
      if (!create) return null;
      store.forcedDoors = {};
    }
    const place = doorPlaceKey();
    if (!store.forcedDoors[place]) {
      if (!create) return null;
      store.forcedDoors[place] = {};
    }
    return store.forcedDoors[place];
  }

  // Doors forced before the record moved into the world folder are still in the
  // savegame under the old `mapId_x_y` key. Read (never written) so a save made
  // then keeps the doors it had standing open until they expire.
  function legacyForcedAt(x, y) {
    if (typeof $gameSystem === 'undefined' || !$gameSystem || !$gameSystem._bashedDoors) return undefined;
    return $gameSystem._bashedDoors[`${$gameMap.mapId()}_${x}_${y}`];
  }

  function isTileForcedOpen(x, y) {
    const doors = getForcedDoors(false);
    const key = `${x},${y}`;
    let forcedAt = doors ? doors[key] : undefined;
    if (forcedAt === undefined) forcedAt = legacyForcedAt(x, y);
    if (forcedAt === undefined) return false;
    // In an empty world a forced door never relocks: there is nobody left to
    // fix it. The record is kept (so it survives into every savegame of the
    // world) and simply never expires.
    if (isEmptyWorld()) return true;
    const now = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(114) : 0;
    if (now >= forcedAt && now - forcedAt <= BASH_OPEN_MINUTES) return true;
    // Expired (or time rolled back): the door is locked again everywhere.
    if (doors) delete doors[key];
    if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._bashedDoors) {
      delete $gameSystem._bashedDoors[`${$gameMap.mapId()}_${x}_${y}`];
    }
    return false;
  }

  function isDoorForcedOpen(useFacing) {
    const c = getEventCoordinates(useFacing);
    return isTileForcedOpen(c.x, c.y);
  }

  // Records the door as open for the day and puts the event back on walk-in
  // terms straight away (below-character priority, Event Touch), instead of
  // waiting for the next map load or nightfall to re-derive its trigger. The
  // world file is flushed on the spot so another savegame of the world sees the
  // broken door without waiting for this one to be saved.
  function markDoorForcedOpen(useFacing) {
    const now = (typeof $gameVariables !== 'undefined') ? $gameVariables.value(114) : 0;
    const doors = getForcedDoors(true);
    if (doors) {
      doors[getDoorKey(useFacing)] = now;
      if (typeof window.WorldManager.flush === 'function') {
        try { window.WorldManager.flush(); } catch (e) { /* non-fatal */ }
      }
    }
    refreshAllDoorTriggers();
  }

  // ── Door interaction trigger ─────────────────────────────────────────────────
  // A door's RMMZ trigger AND priority are both chosen at runtime from its lock
  // state:
  //   closed (locked) -> 0 Action Button, priority 1 (same as characters), so
  //                       the party is stopped by the door and has to press the
  //                       button facing it to get the lockpick/bash menu
  //   open            -> 2 Event Touch, priority 0 (below characters), so the
  //                       party simply walks into it and goes in
  // The data trigger and priority on these events are left as-is and simply
  // overridden here.
  const TRIGGER_ACTION = 0;
  const TRIGGER_EVENT_TOUCH = 2;
  const PRIORITY_BELOW = 0;
  const PRIORITY_SAME = 1;

  // A door event is any event whose active page runs a visitHouse /
  // enterMultiBuilding plugin command. Returns its facing flag and the pool it
  // leads into (so the lock rules can tell a home from a shop), or null.
  function eventDoorInfo(event) {
    if (!event || typeof event.page !== 'function') return null;
    const page = event.page();
    if (!page || !page.list) return null;
    for (const c of page.list) {
      if (c.code === 357 && String(c.parameters[0]).includes('ProceduralHouseSystem')) {
        const cmd = c.parameters[1];
        if (cmd === 'visitHouse' || cmd === 'enterMultiBuilding') {
          const a = c.parameters[3] || {};
          // enterMultiBuilding defaults an empty base pool to "skyscrapers".
          const poolName = cmd === 'enterMultiBuilding'
            ? (a.baseFloorPool || "skyscrapers")
            : (a.poolName || "");
          // FurnitureSystem-built player doors set this (undeclared, not shown
          // in the Plugin Command GUI): they are always open, never locked,
          // regardless of pool or time of day.
          const alwaysOpen = a.alwaysOpen === 'true' || a.alwaysOpen === true;
          return { useFacing: a.facing === 'true' || a.facing === true, poolName: poolName, alwaysOpen: alwaysOpen };
        }
      }
    }
    return null;
  }

  // Must agree with attemptDoorEntry, or a door the prompt would lock reads as
  // walk-through (or the other way about).
  function isDoorClosedForEvent(event, poolName, alwaysOpen) {
    if (alwaysOpen) return false;
    if (!isLockablePool(poolName)) return false;
    if (parameters["lockDoors"] === "true") return true;
    if (isEmptyWorld()) {
      // Not the clock: how this one was left, plus anything since forced.
      return !isEmptyWorldDoorOpen(event.x, event.y) &&
             !isTileForcedOpen(event.x, event.y);
    }
    if (!isNightTime()) return false;
    if (isTileForcedOpen(event.x, event.y)) return false;
    return true;
  }

  function applyDoorTrigger(event) {
    const info = eventDoorInfo(event);
    if (!info) return;
    const closed = isDoorClosedForEvent(event, info.poolName, info.alwaysOpen);
    event._trigger = closed ? TRIGGER_ACTION : TRIGGER_EVENT_TOUCH;
    event._priorityType = closed ? PRIORITY_SAME : PRIORITY_BELOW;
  }

  function refreshAllDoorTriggers() {
    if (typeof $gameMap === 'undefined' || !$gameMap || !$gameMap.events) return;
    for (const ev of $gameMap.events()) applyDoorTrigger(ev);
  }

  // A door entry already animating, or a transfer already reserved, must not be
  // restarted by the player bumping/touching the door again.
  function doorEntryBusy() {
    return _doorEntry !== null ||
      (typeof $gamePlayer !== 'undefined' && $gamePlayer && $gamePlayer.isTransferring && $gamePlayer.isTransferring());
  }

  // Door triggers depend on time of day; flip them whenever night state changes
  // while the player stays on a map (map load already sets them via the page hook).
  let _lastDoorNightState = null;
  function updateDoorTriggersForTime() {
    const night = isNightTime();
    if (_lastDoorNightState === null) { _lastDoorNightState = night; return; }
    if (night !== _lastDoorNightState) {
      _lastDoorNightState = night;
      refreshAllDoorTriggers();
    }
  }

  // Override the page-derived trigger for door events on every page setup
  // (map load / page change), so doors start out with the correct interaction.
  const _Game_Event_setupPageSettings = Game_Event.prototype.setupPageSettings;
  Game_Event.prototype.setupPageSettings = function () {
    _Game_Event_setupPageSettings.call(this);
    applyDoorTrigger(this);
  };

  // ── Procedural-map interactive FEATURES (map 636) ────────────────────────────
  // Buildings, dungeons and signposts on the procedural map are terrain features
  // resolved by name via ProcGenUtils, replacing the old tile-id -> common-event
  // matching. The DOORS are entered by WALKING into them (ProceduralTerrain-
  // Interactions' walk-entrance hook calls enterDoorFeatureAt), like every other
  // structure entrance on the procedural map; the signposts stay on the action
  // button, which also still opens a door the party is facing.
  //   DoorHouse      -> a 1-or-2-floor house      (seeded from the tile)
  //   DoorInn        -> an inn
  //   DoorShop       -> a shop
  //   DoorSkyscraper -> a 4-to-10-floor building  (seeded from the tile)
  //   DoorDungeon    -> a coordinate-seeded dungeon (Dungeon/Crypt/Sewer/... by biome)
  //   SignPark       -> recalls (summons) the last vehicle driven to the player
  //   SignBus        -> the fast-travel map, boarding as a Bus
  const PROC_MAP_ID = 636;

  // ── Doors that name their own trade ─────────────────────────────────────────
  // Tileset 303 grew a door per business, and a door with a clinic's sign over
  // it has to open onto a clinic rather than onto whatever the shop pool happens
  // to roll. Each entry names real interiors under the Shops parent map (1157);
  // where a trade keeps several premises the door picks one off its own tile, so
  // the same door is always the same shop and two doors on a street rarely the
  // same one. An id that is not in the database is dropped, so a door whose
  // interiors were never authored quietly falls back to the ordinary shop pool.
  // i18n-ignore-start  Features.json ids and data/MapInfos.json map ids
  const TRADE_DOORS = {
    DoorClinic:        [1765, 1751],                    // Fertility, Augmentation
    DoorPoliceStation: [1429],                          // Police Station
    DoorWeaponStore:   [1425, 1426, 1427, 1428, 658],   // Weapon Shops, Surplus Armory
    DoorGym:           [1716],                          // Gym Supplies
    DoorHardwareStore: [1723, 1767],                    // Hardware Store, Household
    DoorIceCream:      [1393],                          // Ice Cream
    DoorMusicStore:    [1758],                          // Music Store
    GarageDoor:        [1745],                          // Garage
  };
  // i18n-ignore-end

  const DOOR_FEATURES = new Set([
    "DoorHouse", "DoorInn", "DoorShop", "DoorSkyscraper", "DoorDungeon",
    ...Object.keys(TRADE_DOORS)
  ]);
  const INTERACT_FEATURES = new Set([
    ...DOOR_FEATURES, "SignPark", "SignBus"
  ]);

  // Every interior some trade door already claims. A town that draws the special
  // doors must not ALSO offer their shops behind its plain ones, or the clinic
  // the party just walked past turns up again behind an unmarked door two
  // streets away. Only towns do this: a lone shop on a country lane draws no
  // special doors at all, so cutting its pool down would only take shops away.
  function tradeClaimedShopIds() {
    const out = new Set();
    for (const ids of Object.values(TRADE_DOORS)) for (const id of ids) out.add(id);
    return out;
  }

  // The proper towns: City and Burg (and their Desert/Ice variants), the two
  // biomes generated on tileset 303 and the only ones that carry trade doors.
  function isTradeDoorBiome() {
    const name = (($gameSystem && $gameSystem._procGenData && $gameSystem._procGenData.currentBiome) || "")
      .toLowerCase();
    return name.includes("city") || name.includes("burg");
  }

  function existingMapIds(ids) {
    if (!$dataMapInfos) return ids.slice();
    return ids.filter((id) => !!$dataMapInfos[id]);
  }

  // A stable per-door hash, so DoorClinic and DoorWeaponStore standing on the
  // same tile of two different squares never resolve to the same premises.
  function doorNameSalt(name) {
    let h = 0x5D00;
    for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  // Which interior a trade door opens onto, seeded from the door tile itself.
  // Returns null when the trade has no authored interior, which sends the door
  // back to the ordinary shop pool rather than nowhere.
  function tradeDoorMapId(name, x, y, mapId) {
    const ids = existingMapIds(TRADE_DOORS[name] || []);
    if (!ids.length) return null;
    const id = (mapId == null) ? ($gameMap ? $gameMap.mapId() : 0) : mapId;
    return getSeededRandomFromArray(ids, (createSeed(id, x, y) ^ doorNameSalt(name)) >>> 0);
  }

  // Which shop a PLAIN DoorShop opens onto. In a town that is every shop except
  // the ones a trade door already speaks for; anywhere else it is the whole
  // pool, exactly as before, and null means "let visitHouse roll it".
  function genericShopMapId(x, y, mapId) {
    if (!isTradeDoorBiome()) return null;
    const claimed = tradeClaimedShopIds();
    const open = getHouseList("shops", true).filter((id) => !claimed.has(id));
    if (!open.length) return null;
    const id = (mapId == null) ? ($gameMap ? $gameMap.mapId() : 0) : mapId;
    return getSeededRandomFromArray(open, createSeed(id, x, y));
  }

  // tilesetId -> { tileId: featureName }, built lazily via ProcGenUtils.
  const _featureLookupCache = {};
  function getFeatureLookup(tilesetId) {
    if (_featureLookupCache[tilesetId]) return _featureLookupCache[tilesetId];
    const U = window.ProcGenUtils;
    if (!U || !U.Cache || !U.createTileToFeatureMap) return {};
    const map = U.createTileToFeatureMap(U.Cache.getTilesetFeatures(tilesetId));
    _featureLookupCache[tilesetId] = map;
    return map;
  }

  // Name of the interactive feature on the tile the character faces, or null.
  function facedInteractFeatureName(character) {
    const U = window.ProcGenUtils;
    if (!U || !$gameMap) return null;
    const tileset = $gameMap.tileset();
    const tilesetId = tileset ? tileset.id : 0;
    if (!tilesetId) return null;
    const d = character.direction();
    const x = $gameMap.roundXWithDirection(character.x, d);
    const y = $gameMap.roundYWithDirection(character.y, d);
    const lookup = getFeatureLookup(tilesetId);
    for (const z of [4, 3, 2]) {
      const tileId = $gameMap.tileId(x, y, z);
      if (tileId !== 0) {
        const name = U.getFeatureNameFromTileId(tileId, lookup);
        if (INTERACT_FEATURES.has(name)) return name;
      }
    }
    return null;
  }

  // A deterministic floor count in [min, max] derived from the faced door tile,
  // so the same door always leads to the same building layout.
  function seededFloorCount(useFacing, min, max, salt) {
    const c = getEventCoordinates(useFacing);
    const seed = (createSeed($gameMap.mapId(), c.x, c.y) ^ salt) >>> 0;
    return min + Math.floor(seededRandom(seed) * (max - min + 1));
  }

  // Every DoorHouse opens onto the one residential pool, whatever the biome
  // around it: the old huts pool was folded into houses, so a lone farmstead
  // and a townhouse draw from the same interiors. The villas pool is not a
  // residential pool at all any more: it belongs to the patron vault hatches,
  // and no procedural door and no NPC home ever selects it.
  function residentialPoolForDoor() {
    return "houses";
  }

  // Descend through a DoorDungeon tile into a procedural, coordinate-seeded
  // dungeon. WorldMapReturn resolves the dungeon type from the surface biome's
  // lowerLayer (Cave-family/none -> Dungeon, else Crypt / Sewer / ...).
  function enterSeededDungeon() {
    const key = "WorldMapReturn:enterDungeonDoor";
    if (PluginManager._commands && PluginManager._commands[key]) {
      PluginManager.callCommand($gameMap._interpreter || {}, "WorldMapReturn", "enterDungeonDoor", {});
    } else {
      console.warn("WorldMapReturn not available for DoorDungeon.");
    }
  }

  // SignBus opens the fast-travel map in Bus mode (starting from the player's
  // current world location). No-op if the fast-travel plugin/scene is absent.
  function openBusFastTravel() {
    const sc = SceneManager._scene;
    if (sc instanceof Scene_Map && typeof sc.startFastTravel === "function") sc.startFastTravel("bus");
  }
  // SignPark recalls (summons) the vehicle the party last drove - the camper,
  // the car, the bike or the broom, never the Starship or the Boat - via
  // VehicleSystem's summonLastVehicle plugin command, which says so itself when
  // the party owns no vehicle. No-op if VehicleSystem is absent.
  function recallLastVehicle() {
    const key = "VehicleSystem:summonLastVehicle";
    if (PluginManager._commands && PluginManager._commands[key]) {
      PluginManager.callCommand($gameMap._interpreter || {}, "VehicleSystem", "summonLastVehicle", {});
    } else {
      console.warn("VehicleSystem not available for SignPark.");
    }
  }

  // Run the entrance behind an interactive FEATURE name. The tile is already
  // pinned by the caller, so every coordinate below resolves to the door itself.
  function runInteractFeature(name) {
    switch (name) {
      case "DoorHouse": {
        const pool = residentialPoolForDoor();
        if (seededFloorCount(true, 1, 2, 0x484F) >= 2) {
          enterMultiBuilding(pool, "floors", 1, true);
        } else {
          visitHouse(pool, true);
        }
        return true;
      }
      case "DoorInn":
        visitHouse("inns", true);
        return true;
      case "DoorShop": {
        const c = getEventCoordinates(true);
        visitHouse("shops", true, genericShopMapId(c.x, c.y));
        return true;
      }
      case "DoorSkyscraper": {
        const totalFloors = seededFloorCount(true, 4, 10, 0x534B);
        enterMultiBuilding("skyscrapers", "skyfloors", totalFloors - 1, true);
        return true;
      }
      case "DoorDungeon":
        enterSeededDungeon();
        return true;
      case "SignPark":
        recallLastVehicle();
        return true;
      case "SignBus":
        openBusFastTravel();
        return true;
      default: {
        // A door that names its trade opens onto that trade, and onto the
        // ordinary shop pool only where the trade has no interior authored yet.
        if (!TRADE_DOORS[name]) return false;
        const c = getEventCoordinates(true);
        visitHouse("shops", true, tradeDoorMapId(name, c.x, c.y));
        return true;
      }
    }
  }

  // Shared gate for both ways into a feature entrance (walked into, or pressed).
  // `anyMap` is for a map that draws its own door TILES without going through
  // the procedural feature table (Bologna's OSM cells, map 353): the tile is
  // still a door and everything below it is identical, only the map it stands
  // on is not 636.
  function interactFeatureReady(anyMap = false) {
    if (!$gameMap) return false;
    if (!anyMap && $gameMap.mapId() !== PROC_MAP_ID) return false;
    if (doorEntryBusy()) return false;
    if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) return false;
    return true;
  }

  // Public: a door that is a TILE on a map other than the procedural one. Same
  // entry as the DoorHouse / DoorShop / DoorInn features beside it, so the
  // seed, the return point, the lock and the lockpick prompt all read the door
  // tile rather than wherever the party happens to be standing. Returns true
  // only when the entry was actually taken.
  // forcedHouseId pins the interior instead of rolling one off the door tile
  // (PatreonRewards' hatch, which owes its patron ONE villa, the same one on
  // every visit and in every world), and forceOpen skips the lock entirely.
  // A pinned interior is always the single floor it names: rolling a second one
  // on top of it would put the party in a stairwell the pin never asked for.
  function enterTileDoorAt(poolName, x, y, forcedHouseId = null, forceOpen = false) {
    if (!interactFeatureReady(true)) return false;
    const pool = normalizePoolName(poolName) || "houses";
    _callerEventId = 0;
    return withDoorTile({ x, y }, () => {
      // Shops, inns and pinned villas are always one floor; a house rolls a
      // second one off its own tile, exactly like a DoorHouse feature does.
      if (!forcedHouseId && pool === "houses" &&
          seededFloorCount(true, 1, 2, 0x484F) >= 2) {
        enterMultiBuilding(pool, "floors", 1, true);
      } else {
        visitHouse(pool, true, forcedHouseId, forceOpen);
      }
      return true;
    });
  }

  // Public: which interior a tile door leads to, WITHOUT entering it (the sign
  // Bologna hangs over its shop doors). Same seed and the same pool the entry
  // would use, so the name on the sign is the shop behind the door.
  function interiorMapIdFor(poolName, x, y, mapId) {
    if (!$gameMap) return null;
    const id = (mapId == null) ? $gameMap.mapId() : mapId;
    return selectHouse(createSeed(id, x, y), normalizePoolName(poolName));
  }

  // Public: the party walked into (or onto) a door FEATURE at x,y on the proc
  // map, so take them in. ProceduralTerrainInteractions' walk-entrance hook is
  // the caller: the doors are entered by movement, exactly like the StairsUp /
  // StairsDown / Cave / Grate entrances beside them, and the tile is passed in
  // explicitly because the party may be standing either on it or in front of it.
  // Returns true only when the entry was actually taken.
  function enterDoorFeatureAt(name, x, y) {
    // Doors only. The signposts share the feature table but are deliberately
    // NOT walked into: bumping a bus stop must not summon the camper.
    if (!DOOR_FEATURES.has(name)) return false;
    if (!interactFeatureReady()) return false;
    // These FEATURES are tiles, not events, so there is no door event to swing.
    _callerEventId = 0;
    return withDoorTile({ x, y }, () => runInteractFeature(name));
  }

  // Public: attempt to use the interactive feature the player faces on the proc
  // map. Returns true if handled (caller then stops other interactions).
  function tryProcMapInteract(character) {
    if (!character || !interactFeatureReady()) return false;
    const name = facedInteractFeatureName(character);
    if (!name) return false;
    const d = character.direction();
    const x = $gameMap.roundXWithDirection(character.x, d);
    const y = $gameMap.roundYWithDirection(character.y, d);
    // These FEATURES are tiles, not events, so there is no door event to swing.
    _callerEventId = 0;
    return withDoorTile({ x, y }, () => runInteractFeature(name));
  }

  function visitHouse(poolName = "", useFacing = false, forcedHouseId = null, forceOpen = false) {
    const houseList = getHouseList(poolName, true);
    if (houseList.length === 0) return;
    attemptDoorEntry(useFacing, () => performHouseEntry(poolName, useFacing, forcedHouseId), poolName, forceOpen);
  }

  // Shared door gate for every entrance (houses, multi-floor buildings, shops,
  // inns, ...). The door-open animation and the transfer are both deferred to
  // `doEntry` so nothing happens until the door actually opens:
  //   - non-lockable pool   -> always open (only houses can lock).
  //   - "unlocked" in the door event's Note -> always open.
  //   - lockDoors param ON  -> fully blocked ("Get out of my house!").
  //   - daytime / forced    -> open animation, then doEntry.
  //   - night (locked)      -> lockpick / bash / cancel menu, cancel selected.
  //                            Only lockpick success, skeleton key, or bash open
  //                            the door; cancel and lockpick failure leave it
  //                            shut with no animation. Any of the three that
  //                            works marks the door open for a day, world-wide.
  function attemptDoorEntry(useFacing, doEntry, poolName, forceOpen) {
    // A door already being worked on answers to nothing else until the die it
    // asked for has landed.
    if (isDoorAttemptBusy()) return;
    // Everything below this point is deferred (the door swing, and the lockpick
    // choice on top of it), so a tile-feature entrance has to carry its pinned
    // tile into the continuation: by the time the transfer runs the party has
    // been stepped forward and the door is no longer in front of them.
    const tile = _procDoorTile;
    const entry = tile ? (() => withDoorTile(tile, doEntry)) : doEntry;
    // FurnitureSystem-built player doors pass forceOpen: always open, never
    // locked, no lockpick/bash prompt, regardless of pool or time of day.
    if (forceOpen || isCallerDoorUnlocked() || !isLockablePool(poolName)) {
      openDoorAndEnter(entry);
      return;
    }
    if (parameters["lockDoors"] === "true") {
      window.skipLocalization = true;
      $gameMessage.add(T('ProceduralHouse.getOut'));
      window.skipLocalization = false;
      return;
    }
    // A door already forced open within the last day skips the prompt.
    // An empty world's doors do not answer to the clock: whether one is shut
    // was decided when it was left, and forcing it opens it for good.
    if (isEmptyWorld()) {
      const c = getEventCoordinates(useFacing);
      if (!isEmptyWorldDoorOpen(c.x, c.y) && !isDoorForcedOpen(useFacing)) {
        showLockedDoorChoices(useFacing, entry, tile);
        return;
      }
      openDoorAndEnter(entry);
      return;
    }
    if (isNightTime() && !isDoorForcedOpen(useFacing)) {
      showLockedDoorChoices(useFacing, entry, tile);
      return;
    }
    openDoorAndEnter(entry);
  }

  function showLockedDoorChoices(useFacing, doEntry, tile) {
    const hasLockpick = $dataItems[374] && $gameParty.hasItem($dataItems[374]);
    const choices = [];
    const actions = [];
    if (hasLockpick) { choices.push(T('ProceduralHouse.lockpick')); actions.push('lockpick'); }
    choices.push(T('ProceduralHouse.bash')); actions.push('bash');
    choices.push(T('ProceduralHouse.cancel')); actions.push('cancel');

    window.skipLocalization = true;
    $gameMessage.add(T('ProceduralHouse.doorLocked'));
    // Cancel is the default AND the cancel choice: an interact press that only
    // meant to walk through must never bash a door in by itself.
    $gameMessage.setChoices(choices, choices.length - 1, choices.length - 1);
    $gameMessage.setChoiceBackground(0);
    $gameMessage.setChoicePositionType(2);
    window.skipLocalization = false;
    $gameMessage.setChoiceCallback((index) => {
      const action = actions[index];
      if (action === 'lockpick') {
        startNightLockpick(useFacing, doEntry, tile);
      } else if (action === 'bash') {
        // The forced-open record is keyed by the door's own tile, so a
        // tile-feature door has to be pinned again here: the choice callback
        // runs long after attemptDoorEntry returned and the pin was let go.
        withDoorTile(tile || _procDoorTile, () => bashDoor(useFacing, doEntry));
      }
      // 'cancel' (or window dismissed): stay outside, no door animation.
    });
  }

  function startNightLockpick(useFacing, doEntry, tile) {
    // A skeleton key (item 740) opens any lock without the minigame. We handle
    // it here so the no-scene auto-success path never strands the entry.
    if ($dataItems[740] && $gameParty.hasItem($dataItems[740])) {
      $gameParty.loseItem($dataItems[740], 1);
      window.skipLocalization = true;
      $gameMessage.add(T('ProceduralHouse.usedSkeletonKey'));
      window.skipLocalization = false;
      withDoorTile(tile || _procDoorTile, () => markDoorForcedOpen(useFacing));
      openDoorAndEnter(doEntry);
      return;
    }
    if (typeof UnlockingBlocks === 'undefined') return;
    _pendingNightHouse = { useFacing: useFacing, doEntry: doEntry, tile: tile || _procDoorTile };
    hookLockpickForHouse();
    // Randomized lock complexity, clamped to the minigame's 1-10 range.
    const difficulty = 3 + Math.floor(Math.random() * 6); // 3..8
    UnlockingBlocks.start(difficulty, 0, 0, '', '');
  }

  // Mirrors PeekPlugin: wrap popScene once to resolve the pending entry when the
  // lockpick minigame succeeds. Lockpicking is never a crime, so whether it
  // succeeds or fails nothing is logged here; failure simply opens no door.
  function hookLockpickForHouse() {
    if (typeof Scene_UnlockingBlocks === 'undefined') return;
    if (Scene_UnlockingBlocks._houseHooked) return;
    Scene_UnlockingBlocks._houseHooked = true;
    const _popScene = Scene_UnlockingBlocks.prototype.popScene;
    Scene_UnlockingBlocks.prototype.popScene = function() {
      if (_pendingNightHouse) {
        const pending = _pendingNightHouse;
        _pendingNightHouse = null;
        if (this.success) {
          AudioManager.playSe({ name: "lock_01", volume: 100, pitch: 100, pan: 0 });
          // A picked lock stays picked for the day, exactly as a bashed door
          // does: the tile is pinned again because the minigame scene ran long
          // after the pin was let go.
          withDoorTile(pending.tile || _procDoorTile, () => markDoorForcedOpen(pending.useFacing));
          openDoorAndEnter(pending.doEntry);
        }
        // failure: no animation, no entry, no crime.
      }
      _popScene.call(this);
    };
  }

  // Bashing the door always counts as breaking and entering, except in an
  // empty world: there is no owner to break in on and nobody to file it.
  async function bashDoor(useFacing, doEntry) {
    if (_doorAttemptBusy) return;
    const leader = (typeof $gameParty !== 'undefined' && $gameParty.leader) ? $gameParty.leader() : null;
    const strMod = leader ? (leader.strMod ?? Math.floor(((leader.atk || 10) - 10) / 2)) : 0;
    let success = false;

    _doorAttemptBusy = true;
    try {
      if (window.Dice3D) {
        const rollRes = await window.Dice3D.rollD20({
          actionName: "Door Bash",
          statName: "STR (Athletics)",
          modifier: strMod,
          dc: 12,
          force3D: true
        });
        success = rollRes.success;
      } else {
        const roll = Math.floor(Math.random() * 20) + 1;
        success = (roll === 20) || (roll !== 1 && roll + strMod >= 12);
      }
    } finally {
      _doorAttemptBusy = false;
    }

    if (!success) {
      SoundManager.playBuzzer();
      if (window.ParchmentToast) {
        window.ParchmentToast.show(T('ProceduralHouse.doorHeld'), { severity: "warn" });
      }
      return;
    }

    if (typeof CrimeSystem !== 'undefined' && !isEmptyWorld()) {
      CrimeSystem.addPresetCrime("breakingAndEntering");
    }
    AudioManager.playSe({ name: "Crash", volume: 100, pitch: 100, pan: 0 });
    markDoorForcedOpen(useFacing);
    openDoorAndEnter(doEntry);
  }

  // ── Door-open animation ─────────────────────────────────────────────────────
  // Plays the open SE, swings the door event open (the turn cycle the events
  // used to do inline), steps the player into the doorway, then runs `doEntry`
  // (the actual transfer). Driving it here means the animation only ever plays
  // when the door truly opens - never on a cancelled or failed locked door.
  function openDoorAndEnter(doEntry) {
    const ev = _callerEventId ? $gameMap.event(_callerEventId) : null;
    AudioManager.playSe({ name: "Open1", volume: 90, pitch: 100, pan: 0 });
    if (ev) {
      ev.forceMoveRoute({
        repeat: false, skippable: false, wait: true,
        list: [
          { code: 17 },                  // turn left
          { code: 15, parameters: [3] }, // wait 3
          { code: 18 },                  // turn right
          { code: 15, parameters: [3] }, // wait 3
          { code: 19 },                  // turn up
          { code: 37 },                  // through on
          { code: 0 }
        ]
      });
    }
    _doorEntry = { eventId: _callerEventId, doEntry: doEntry, phase: ev ? 'door' : 'player' };
  }

  // Frame-polled state machine: wait for the door swing, then step the player
  // forward, then fire the transfer. Player input is locked while the player's
  // forced step runs (Game_Player.canMove respects move-route forcing).
  function updateDoorEntry() {
    const de = _doorEntry;
    const ev = de.eventId ? $gameMap.event(de.eventId) : null;
    if (de.phase === 'door') {
      if (!ev || (!ev.isMoveRouteForcing() && !ev.isMoving())) {
        $gamePlayer.forceMoveRoute({
          repeat: false, skippable: true, wait: true,
          list: [ { code: 12 }, { code: 0 } ] // 1 step forward
        });
        de.phase = 'player';
      }
    } else if (de.phase === 'player') {
      if (!$gamePlayer.isMoveRouteForcing() && !$gamePlayer.isMoving()) {
        AudioManager.playSe({ name: "Move1", volume: 90, pitch: 100, pan: 0 });
        _doorEntry = null;
        if (de.doEntry) de.doEntry();
      }
    }
  }

  function performHouseEntry(poolName = "", useFacing = false, forcedHouseId = null) {
    const houseList = getHouseList(poolName, true);
    if (houseList.length === 0) return;

    const eventCoords = getEventCoordinates(useFacing);
    const seed = createSeed($gameMap.mapId(), eventCoords.x, eventCoords.y);

    saveHouseReturnPoint(useFacing);
    const houseId = forcedHouseId || selectHouse(seed, poolName);
    if (!houseId) return;

    _savedBgm = AudioManager._bgm;
    // Identify the building for the NPC system before the transfer, while
    // $gameMap is still the town map the entrance sits on.
    setCurrentBuilding({
      mapId: $gameMap.mapId(), x: eventCoords.x, y: eventCoords.y, seed,
      type: 'visitHouse', poolName: poolName || '',
      totalFloors: 1, floorIndex: 0, capacity: 2,
      interiorMapId: houseId,
    });

    _postTransferActions = {
        type: 'house',
        spawnRegionId: Number(parameters["spawnRegionId"] || 13),
        originalDirection: $gamePlayer.direction(),
        seed: seed
    };
    $gamePlayer.reserveTransfer(houseId, 0, 0, $gamePlayer.direction(), 0);
  }

  function enterMultiBuilding(baseFloorPool, upperFloorsPool, numFloors, useFacing = false) {
    if (numFloors < 1) return;
    if (!baseFloorPool || baseFloorPool === "") baseFloorPool = "skyscrapers";
    if (!upperFloorsPool || upperFloorsPool === "") upperFloorsPool = "skyfloors";
    attemptDoorEntry(useFacing, () => performMultiBuildingEntry(baseFloorPool, upperFloorsPool, numFloors, useFacing), baseFloorPool);
  }

  function performMultiBuildingEntry(baseFloorPool, upperFloorsPool, numFloors, useFacing = false) {
    const locationKey = createLocationKey();
    const eventCoords = getEventCoordinates(useFacing);
    const seed = createSeed($gameMap.mapId(), eventCoords.x, eventCoords.y);

    let structure = multiBuildingStructures[locationKey] || generateMultiBuildingStructure(seed, baseFloorPool, upperFloorsPool, numFloors);
    if (!structure) return;
    multiBuildingStructures[locationKey] = structure;

    _savedBgm = AudioManager._bgm;
    saveHouseReturnPoint(useFacing);
    currentMultiBuilding = {
        entranceKey: locationKey,
        currentFloorIndex: 0,
        structure: structure,
        baseSeed: seed
    };

    // A multi-floor entrance is one building with `totalFloors` separate floors.
    // Residential ones (baseFloorPool "houses") house one NPC household per
    // floor; skyscrapers are public and get no residents at all.
    setCurrentBuilding({
      mapId: $gameMap.mapId(), x: eventCoords.x, y: eventCoords.y, seed,
      type: 'enterMultiBuilding',
      baseFloorPool: baseFloorPool, upperFloorsPool: upperFloorsPool,
      numFloors: numFloors,
      totalFloors: structure.totalFloors, floorIndex: 0,
      capacity: structure.totalFloors,
      interiorMapId: structure.floors[0],
    });

    _postTransferActions = {
        type: 'multiBuildingEnter',
        spawnRegionId: Number(parameters["spawnRegionId"] || 13),
        originalDirection: $gamePlayer.direction(),
        seed: seed
    };
    $gamePlayer.reserveTransfer(structure.floors[0], 0, 0, $gamePlayer.direction(), 0);
  }

  function changeFloor(direction) {
    if (!currentMultiBuilding) return;
    const current = currentMultiBuilding.currentFloorIndex;
    const total = currentMultiBuilding.structure.totalFloors;
    const nextIndex = direction === 'next' ? current + 1 : current - 1;

    if (nextIndex >= 0 && nextIndex < total) {
        _savedBgm = AudioManager._bgm;
        currentMultiBuilding.currentFloorIndex = nextIndex;
        setCurrentFloor(nextIndex, currentMultiBuilding.structure.floors[nextIndex]);
        const floorSeed = currentMultiBuilding.baseSeed + nextIndex * 5000;
        _postTransferActions = { 
            type: 'floorChange', 
            direction: direction,
            seed: floorSeed
        };
        $gamePlayer.reserveTransfer(currentMultiBuilding.structure.floors[nextIndex], 0, 0, $gamePlayer.direction(), 0);
    }
  }

  // Human-friendly label for a floor index in the elevator picker.
  function elevatorFloorLabel(index) {
    return index === 0 ? T('ProceduralHouse.groundFloor')
      : T('ProceduralHouse.floorNumbered', { n: index });
  }

  // Show a choice list of every floor except the current one, then ride to the
  // chosen floor. Only works inside a multi-floor building.
  function openElevator() {
    if (!currentMultiBuilding || !currentMultiBuilding.structure) {
      window.skipLocalization = true;
      $gameMessage.add(T('ProceduralHouse.noElevator'));
      window.skipLocalization = false;
      return;
    }
    if (_elevatorTransit) return;
    const total = currentMultiBuilding.structure.totalFloors;
    const current = currentMultiBuilding.currentFloorIndex;
    const choices = [];
    const targets = [];
    // List top-down, like a real elevator panel (top floor first).
    for (let i = total - 1; i >= 0; i--) {
      if (i === current) continue;
      choices.push(elevatorFloorLabel(i));
      targets.push(i);
    }
    choices.push(T('ProceduralHouse.cancel'));
    targets.push(-1);

    window.skipLocalization = true;
    $gameMessage.add(T('ProceduralHouse.selectFloor'));
    $gameMessage.setChoices(choices, 0, choices.length - 1);
    $gameMessage.setChoiceBackground(0);
    $gameMessage.setChoicePositionType(2);
    window.skipLocalization = false;
    $gameMessage.setChoiceCallback((index) => {
      const target = targets[index];
      if (target >= 0) startElevatorTransit(target);
    });
  }

  // Fade the screen to black, wait a spell proportional to how many floors the
  // elevator has to travel, then hand off to the queued floor transfer.
  function startElevatorTransit(targetFloorIndex) {
    if (!currentMultiBuilding) return;
    const total = currentMultiBuilding.structure.totalFloors;
    if (targetFloorIndex < 0 || targetFloorIndex >= total) return;
    if (targetFloorIndex === currentMultiBuilding.currentFloorIndex) return;

    const distance = Math.abs(targetFloorIndex - currentMultiBuilding.currentFloorIndex);
    const fadeFrames = 30;
    // Ride time scales with distance: fade + ~2/3 second per floor travelled.
    const waitFrames = fadeFrames + distance * 40;
    $gameScreen.startFadeOut(fadeFrames);
    _elevatorTransit = { framesLeft: waitFrames, targetFloorIndex: targetFloorIndex };
  }

  // Perform the actual floor swap once the ride wait elapses. Landing is handled
  // by the 'elevator' post-transfer action in onMapLoaded.
  function performElevatorFloorChange(targetFloorIndex) {
    if (!currentMultiBuilding) return;
    _savedBgm = AudioManager._bgm;
    currentMultiBuilding.currentFloorIndex = targetFloorIndex;
    setCurrentFloor(targetFloorIndex, currentMultiBuilding.structure.floors[targetFloorIndex]);
    const floorSeed = currentMultiBuilding.baseSeed + targetFloorIndex * 5000;
    _postTransferActions = { type: 'elevator', seed: floorSeed };
    // Fade type 2 (no fade): the screen is already black from startFadeOut, so
    // we skip the transfer's own fade and fade back in after landing.
    $gamePlayer.reserveTransfer(currentMultiBuilding.structure.floors[targetFloorIndex], 0, 0, $gamePlayer.direction(), 2);
  }

  function updateElevatorTransit() {
    if (!_elevatorTransit) return;
    if (_elevatorTransit.framesLeft > 0) {
      _elevatorTransit.framesLeft--;
      return;
    }
    const target = _elevatorTransit.targetFloorIndex;
    _elevatorTransit = null;
    performElevatorFloorChange(target);
  }

  // The way out when no return point survived (a session id that outlived its
  // entry, a save written inside the building before one was recorded). The old
  // answer was findPlaytestFallbackLocation, which picks a residential building
  // AT RANDOM anywhere in the world: that is how leaving a shop occasionally
  // spat the party out at the Omega Tower. The party's world square is recorded
  // by WorldMapTransfer on every map load, so ask for it instead and step back
  // out onto it. Answers false only when even that is unknown.
  function returnToRecordedSquare() {
    const WMT = window.WorldMapTransfer;
    if (!WMT) return false;
    const pg = $gameSystem && $gameSystem._procGenData;
    const here = WMT.playerWorld ? WMT.playerWorld() : null;
    const tpl = WMT.TEMPLATE_COORDS || { x: -1, y: -1 };
    const wx = (pg && typeof pg.originX === 'number') ? pg.originX : (here && here.x);
    const wy = (pg && typeof pg.originY === 'number') ? pg.originY : (here && here.y);
    if (typeof wx !== 'number' || typeof wy !== 'number') return false;
    if (wx === tpl.x && wy === tpl.y) return false;
    if (pg && pg.generatedMapData) {
      // Square-local: ProcStitch's performTransfer hook converts it, and
      // onMapLoaded moves the party off the tile if it is not standable.
      $gameVariables.setValue(43, wx);
      $gameVariables.setValue(44, wy);
      $gamePlayer.reserveTransfer(PROC_MAP_ID, 32, 32, 2, 0);
    } else {
      // No square built: the world map itself, which is redirected to the tower
      // by WorldMapReturn when there is no Earth left to arrive on.
      $gamePlayer.reserveTransfer(WMT.worldMapId, wx, wy, 2, 0);
    }
    currentHouseSessionId = null;
    currentMultiBuilding = null;
    setCurrentBuilding(null);
    return true;
  }

  function exitHouse() {
    const returnPoint = houseReturnPoints[currentHouseSessionId];
    if (returnPoint) {
      if (returnPoint.mapId === PROC_MAP_ID && $gameSystem._procGenData) {
        // Put the square the door stands on back exactly as it was: world
        // coordinates first (a building must never relocate the party to another
        // world tile, or a later border crossing teleports them somewhere else
        // entirely), then the biome description the map was built from.
        //
        // The generated tiles themselves are NOT rebuilt: entering a building
        // never touches procGenData.generatedMapData, and WorldMapReturn's
        // performTransfer hook re-injects that same array on the way back into
        // map 636. Only when it has gone missing (an old save, an excursion that
        // cleared it) does restoreProcSurface rebuild it, from this square's own
        // canonical seed. This is the same restore the forced-biome structures
        // use, so both routes back onto the procedural map agree tile for tile.
        const wmr = window.WorldMapReturn;
        // Not every return point carries a snapshot (one recorded before this
        // was shared, restored from an older save), so fall back to the live
        // procgen state, which entering a building never changes anyway.
        const savedBiome = returnPoint.savedBiomeData || $gameSystem._procGenData;
        const restored = wmr && typeof wmr.restoreProcSurface === "function"
          ? wmr.restoreProcSurface(savedBiome)
          : false;
        if (!restored) {
          // Nothing left describing the square. Re-assert the world coordinates
          // at least, so whatever rebuilds it does so where the party actually
          // stands and a later border crossing cannot fling them across the map.
          const originX = returnPoint.worldX != null ? returnPoint.worldX
            : ((savedBiome && savedBiome.originX) || $gameVariables.value(43));
          const originY = returnPoint.worldY != null ? returnPoint.worldY
            : ((savedBiome && savedBiome.originY) || $gameVariables.value(44));
          $gameVariables.setValue(43, originX);
          $gameVariables.setValue(44, originY);
          $gameSystem._procGenData.originX = originX;
          $gameSystem._procGenData.originY = originY;
        }
      }
      // Square-local on the procedural map, plain map coordinates anywhere else:
      // ProcStitch's performTransfer hook is the one place that knows which is
      // which, and it converts on the way in.
      $gamePlayer.reserveTransfer(returnPoint.mapId, returnPoint.eventX, returnPoint.eventY + 1, 2, 0);
      delete houseReturnPoints[currentHouseSessionId];
      currentHouseSessionId = null;
      currentMultiBuilding = null;
      setCurrentBuilding(null);
    } else if (returnToRecordedSquare()) {
      // Nothing recorded the way in, but the party's world square is still
      // known, so they leave by the front of the square they are standing on.
    } else {
      const result = findPlaytestFallbackLocation();
      if (result) {
        const { building, groupName } = result;
        setCurrentBuilding({ ...building, floorIndex: 0, interiorMapId: $gameMap.mapId() });
        window.ProceduralHouseSystem._playtestFallbackGroupName = groupName;
        if ($gameMap.setupNPCControllers) $gameMap.setupNPCControllers();
        currentMultiBuilding = null;
        setCurrentBuilding(null);
        window.ProceduralHouseSystem._playtestFallbackGroupName = null;
        $gamePlayer.reserveTransfer(building.mapId, building.x, building.y + 1, 2, 0);
      }
    }
  }

  // If the loaded map has no BGM set, continue playing the saved BGM from the previous map.
  function continueSavedBgm() {
    if (!_savedBgm) return;
    const mapBgm = $dataMap && $dataMap.bgm;
    const hasNoBgm = !mapBgm || !mapBgm.name || mapBgm.name.trim() === '';
    if (hasNoBgm) {
      AudioManager._bgm = _savedBgm;
      AudioManager.bgmPlay(_savedBgm);
    }
  }

  // Swap the ambience over to the interior's own biome (HousesInside, Office,
  // CastleInside, ...). An interior biome with no BGS list stops the outdoor
  // ambience instead of leaving the street sounds bleeding through the walls;
  // one with no BGM list leaves the saved outdoor track playing, which is what
  // continueSavedBgm above has just restored.
  function applyInteriorBiomeAudio() {
    const wmr = window.WorldMapReturn;
    if (wmr && typeof wmr.updateBiomeAudio === 'function') {
      wmr.updateBiomeAudio();
    } else {
      AudioManager.stopBgs();
    }
  }

  const _Scene_Map_update_door = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update_door.call(this);
    updateDoorTriggersForTime();
    if (_doorEntry) updateDoorEntry();
    if (_elevatorTransit) updateElevatorTransit();
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
      _Scene_Map_onMapLoaded.call(this);
      if (_postTransferActions) {
          const actions = _postTransferActions;
          switch(actions.type) {
              case 'house':
              case 'multiBuildingEnter':
                  const pos = findPositionWithRegionId(actions.spawnRegionId);
                  const mapDir = getMapDirection('houseDirection');
                  $gamePlayer.locate(pos.x, pos.y);
                  $gamePlayer.setDirection(mapDir !== null ? mapDir : actions.originalDirection);
                  if (actions.type === 'house') {
                    // i18n-ignore-start  event names
                    const upstairsEvent = findEventByName("Upstairs");
                    const downstairsEvent = findEventByName("Downstairs");
                    // i18n-ignore-end
                    if (upstairsEvent) $gameMap.event(upstairsEvent.eventId()).erase();
                    if (downstairsEvent) $gameMap.event(downstairsEvent.eventId()).erase();
                    $gameMap.refresh();
                    // Furniture-system decoration disabled for now.
                    // if ($gameSystem.generateHouseDecor) $gameSystem.generateHouseDecor(actions.seed);
                    currentMultiBuilding = null;
                  } else if (actions.type === 'multiBuildingEnter') {
                    placeStairsAtSeededPosition(actions.seed);
                    updateStairVisibility();
                    // Furniture-system decoration disabled for now.
                    // if ($gameSystem.generateHouseDecor) $gameSystem.generateHouseDecor(actions.seed);
                  }
                  continueSavedBgm();
                  applyInteriorBiomeAudio();
                  break;
              case 'elevator': {
                  placeStairsAtSeededPosition(actions.seed);
                  // Land south of the first "Elevator" event; fall back to the
                  // downward stairs, then to the spawn region tile.
                  // i18n-ignore-start  event names
                  const elevatorEvent = findEventByName("Elevator");
                  const downstairsEvent = findEventByName("Downstairs");
                  // i18n-ignore-end
                  if (elevatorEvent) {
                      $gamePlayer.locate(elevatorEvent.x, elevatorEvent.y + 1);
                      $gamePlayer.setDirection(2);
                  } else if (downstairsEvent) {
                      $gamePlayer.locate(downstairsEvent.x, downstairsEvent.y + 1);
                      $gamePlayer.setDirection(2);
                  } else {
                      const pos = findPositionWithRegionId(Number(parameters["spawnRegionId"] || 13));
                      $gamePlayer.locate(pos.x, pos.y);
                  }
                  updateStairVisibility();
                  // Furniture-system decoration disabled for now.
                  // if ($gameSystem.generateHouseDecor) $gameSystem.generateHouseDecor(actions.seed);
                  continueSavedBgm();
                  applyInteriorBiomeAudio();
                  // Screen was faded to black for the ride; fade it back in.
                  $gameScreen.startFadeIn(30);
                  break;
              }
              case 'floorChange': {
                  placeStairsAtSeededPosition(actions.seed);
                  const stairPos = getSeededStairPositions(actions.seed);
                  const hasRegion14 = stairPos.upstairs !== null;
                  if (hasRegion14) {
                      const landingPos = actions.direction === 'next' ? stairPos.downstairs : stairPos.upstairs;
                      $gamePlayer.locate(landingPos.x, landingPos.y);
                  } else {
                      const eventName = actions.direction === 'next' ? "Downstairs" : "Upstairs";  // i18n-ignore  event names
                      const event = findEventByName(eventName);
                      if (event) $gamePlayer.locate(event.x, event.y);
                  }
                  updateStairVisibility();
                  // Furniture-system decoration disabled for now.
                  // if ($gameSystem.generateHouseDecor) $gameSystem.generateHouseDecor(actions.seed);
                  continueSavedBgm();
                  applyInteriorBiomeAudio();
                  break;
              }
          }
          _savedBgm = null;
          _postTransferActions = null;
      }
  };

  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    Object.keys(houseReturnPoints).forEach(k => delete houseReturnPoints[k]);
    Object.keys(multiBuildingStructures).forEach(k => delete multiBuildingStructures[k]);
    currentHouseSessionId = null;
    currentMultiBuilding = null;
    _doorEntry = null;
    _elevatorTransit = null;
    _callerEventId = 0;
    _pendingNightHouse = null;
    _doorAttemptBusy = false;
    _lastDoorNightState = null;
    setCurrentBuilding(null);
  };

  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);
    if (!contents.proceduralHouseSystem) contents.proceduralHouseSystem = {};
    contents.proceduralHouseSystem.houseReturnPoints = houseReturnPoints;
    contents.proceduralHouseSystem.multiBuildingStructures = multiBuildingStructures;
    contents.proceduralHouseSystem.currentHouseSessionId = currentHouseSessionId;
    contents.proceduralHouseSystem.currentMultiBuilding = currentMultiBuilding;
    contents.proceduralHouseSystem.currentBuilding = _currentBuilding;
    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    if (contents.proceduralHouseSystem) {
        const system = contents.proceduralHouseSystem;
        Object.assign(houseReturnPoints, system.houseReturnPoints || {});
        Object.assign(multiBuildingStructures, system.multiBuildingStructures || {});
        currentHouseSessionId = system.currentHouseSessionId || null;
        currentMultiBuilding = system.currentMultiBuilding || null;
        setCurrentBuilding(system.currentBuilding || null);
    } else if (contents.treasureRoomSystem) {
        // Backwards compatibility migration
        const system = contents.treasureRoomSystem;
        Object.assign(houseReturnPoints, system.houseReturnPoints || {});
        Object.assign(multiBuildingStructures, system.multiBuildingStructures || {});
        currentHouseSessionId = system.currentHouseSessionId || null;
        currentMultiBuilding = system.currentMultiBuilding || null;
        setCurrentBuilding(null); // predates the building descriptor
    }
  };
})();
