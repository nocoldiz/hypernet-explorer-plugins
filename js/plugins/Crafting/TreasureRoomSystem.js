/*:
 * @target MZ
 * @plugindesc Handles a system of treasure rooms that can be accessed randomly from specific locations.
 * @author Omni-Lex
 *
 * @param treasureRooms
 * @text Treasure Rooms
 * @desc Comma-separated list of map IDs to use as treasure rooms
 * @default 5,6,7,8,9
 *
 * @param treasureRoomAssociations
 * @text Treasure Room Associations
 * @desc Maps that always lead to specific treasure rooms (format: sourceMapID:treasureMapID,...)
 * @default 1:5,2:6,3:7
 *
 * @param spawnRegionId
 * @text Spawn Region ID
 * @desc Region ID to spawn player at in treasure room (default: 13)
 * @type number
 * @default 13
 *
 * @command visitTreasureRoom
 * @text Visit Treasure Room
 * @desc Transports the player to a random unique treasure room
 *
 * @command exitTreasureRoom
 * @text Exit Treasure Room
 * @desc Transports the player back to where they were before entering the treasure room
 *
 * @help
 * ============================================================================
 * Treasure Room System
 * ============================================================================
 *
 * This plugin allows you to create a system of treasure rooms that
 * the player can visit.
 *
 * TREASURE ROOMS:
 * When the player activates a "Visit Treasure Room" event, they will be
 * transported to a randomly selected treasure room. Each activation point
 * consistently leads to the same treasure room.
 *
 * AUTOMATIC CONFIGURATION:
 * Treasure rooms are automatically detected as child maps of parent ID 133.
 * Any map that is a child of map 133 will be included as a treasure room.
 */

(() => {
  "use strict";
  const pluginName = "TreasureRoomSystem";

  const parameters = PluginManager.parameters(pluginName);
  const treasureRoomParentId = 133;
  const treasureRoomListFallback = [142,143,144,145,146,137,148,149,150,151,152,153,154,155,156,157,158,159,160,161,162,163,302];
  
  let treasureRoomList = null;
  let treasureRoomListInitialized = false;
  
  const treasureRoomAssociationsRaw = parameters["treasureRoomAssociations"] || "";

  // An explicitly configured treasureRooms param overrides the automatic
  // child-map detection. Left at its default it stays inert so the auto-detect
  // behaviour is preserved.
  const DEFAULT_TREASURE_ROOMS_PARAM = "5,6,7,8,9";
  const treasureRoomsParamRaw = String(parameters["treasureRooms"] || "").trim();
  const treasureRoomsParam = treasureRoomsParamRaw
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0);
  const treasureRoomsParamIsCustom =
    treasureRoomsParamRaw !== "" && treasureRoomsParamRaw !== DEFAULT_TREASURE_ROOMS_PARAM;

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

  function generateAutomaticTreasureRooms() {
    const childMaps = getChildMapsOfParent(treasureRoomParentId);
    if (childMaps.length > 0) return childMaps;
    return treasureRoomListFallback;
  }

  function initializeTreasureRooms() {
    // A customized treasureRooms param takes priority over auto-detection.
    if (treasureRoomsParamIsCustom && treasureRoomsParam.length > 0) {
      return treasureRoomsParam.slice();
    }
    if ($dataMapInfos) {
      const autoRooms = generateAutomaticTreasureRooms();
      if (autoRooms.length > 0) return autoRooms;
    }
    return treasureRoomListFallback;
  }

  function ensureTreasureRoomsInitialized() {
    if (!treasureRoomListInitialized) {
      treasureRoomList = initializeTreasureRooms();
      treasureRoomListInitialized = true;
    }
  }

  const treasureRoomAssociations = {};
  if (treasureRoomAssociationsRaw) {
    treasureRoomAssociationsRaw.split(",").forEach((pair) => {
      const [sourceMap, treasureMap] = pair.split(":").map(Number);
      if (!isNaN(sourceMap) && !isNaN(treasureMap)) {
        treasureRoomAssociations[sourceMap] = treasureMap;
      }
    });
  }

  // Rooms claimed by a single fixed entrance (a patron's hatch, see
  // PatreonRewards). The random picker never hands one out, so the only way
  // into a reserved room is the entrance that owns it.
  const reservedRooms = new Set();

  const visitedTreasureRooms = {};
  // LIFO stack of return points. Using a stack (push on enter, pop on exit)
  // instead of keying by room id means multiple entrances that resolve to the
  // same treasure room map no longer overwrite each other's return point, and
  // nested/repeated entries round-trip correctly.
  const treasureRoomReturnStack = [];
  let _postTransferActions = null;
  let _savedBgm = null;

  PluginManager.registerCommand(pluginName, "visitTreasureRoom", (args) => {
    visitTreasureRoom();
  });

  PluginManager.registerCommand(pluginName, "exitTreasureRoom", (args) => {
    exitTreasureRoom();
  });

  // Where the party is standing, as an address that outlives the visit. On map
  // 636 that is the world square plus the tile inside it: the map coordinate
  // alone moves with the shape of the stitched window, so the same doorway
  // answered to a different key from one visit to the next.
  function procSpot() {
    if (!$gameMap || $gameMap.mapId() !== 636) {
      return { x: $gamePlayer.x, y: $gamePlayer.y };
    }
    const S = window.ProcStitch;
    const local = (S && typeof S.localToParty === "function")
      ? S.localToParty($gamePlayer.x, $gamePlayer.y)
      : { x: $gamePlayer.x, y: $gamePlayer.y };
    return { x: local.x, y: local.y };
  }

  function createLocationKey() {
    const spot = procSpot();
    if ($gameMap && $gameMap.mapId() === 636) {
      const wx = $gameVariables.value(43), wy = $gameVariables.value(44);
      return `${$gameMap.mapId()}_${wx},${wy}_${spot.x}_${spot.y}`;
    }
    return `${$gameMap.mapId()}_${spot.x}_${spot.y}`;
  }

  function saveReturnPoint(treasureRoomId) {
    // Square-local on the procedural map (see procSpot): every transfer back
    // onto map 636 speaks square-local coordinates, and ProcStitch's
    // performTransfer hook puts them back on whatever map the window is by then.
    const spot = procSpot();
    const returnPoint = {
      treasureRoomId: treasureRoomId,
      mapId: $gameMap.mapId(),
      x: spot.x,
      y: spot.y,
      direction: $gamePlayer.direction(),
    };
    // On the procedural map (636), also remember the world coordinates (vars
    // 43/44) so returning from the treasure room restores them exactly. Without
    // this, a later border/edge exit could read stale/scrambled coords and
    // teleport the party to the wrong biome. The return point must never
    // override the global map position.
    if ($gameMap.mapId() === 636) {
      returnPoint.worldX = $gameVariables.value(43);
      returnPoint.worldY = $gameVariables.value(44);
    }
    treasureRoomReturnStack.push(returnPoint);
  }

  function selectTreasureRoom() {
    ensureTreasureRoomsInitialized();
    const currentMapId = $gameMap.mapId();
    const locationKey = createLocationKey();

    if (treasureRoomAssociations[currentMapId]) {
      return treasureRoomAssociations[currentMapId];
    }
    if (visitedTreasureRooms[locationKey]) {
      return visitedTreasureRooms[locationKey];
    }

    const usedRoomIds = Object.values(visitedTreasureRooms);
    const openRooms = treasureRoomList.filter((roomId) => !reservedRooms.has(roomId));
    const availableRooms = openRooms.filter((roomId) => !usedRoomIds.includes(roomId));

    let historySeed = 19002001;
    if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
      historySeed = window.HistoryManager.getSeed();
    } else if ($gameSystem && $gameSystem._historySeed !== undefined) {
      historySeed = $gameSystem._historySeed;
    }

    // Hash the locationKey to create a unique offset
    let keyHash = 0;
    for (let i = 0; i < locationKey.length; i++) {
      keyHash = ((keyHash << 5) - keyHash) + locationKey.charCodeAt(i);
      keyHash = keyHash & keyHash;
    }
    const combinedSeed = Math.abs(historySeed + keyHash);

    // Seeded pseudo-random selection
    let rngSeed = combinedSeed;
    function seededRandom() {
      let x = Math.sin(rngSeed++) * 10000;
      return x - Math.floor(x);
    }

    let selectedRoom;
    const fallbackRooms = openRooms.length > 0 ? openRooms : treasureRoomList;
    if (availableRooms.length > 0) {
      const idx = Math.floor(seededRandom() * availableRooms.length);
      selectedRoom = availableRooms[idx];
    } else {
      const idx = Math.floor(seededRandom() * fallbackRooms.length);
      selectedRoom = fallbackRooms[idx];
    }
    visitedTreasureRooms[locationKey] = selectedRoom;

    if (window.NetworkManager && NetworkManager.instance && NetworkManager.instance.isMultiplayer()) {
      NetworkManager.instance.broadcastTreasureRoomVisit(locationKey, selectedRoom);
    }
    return selectedRoom;
  }

  function findPositionWithRegionId(regionId) {
    if (!$dataMap) return { x: 0, y: 0 };
    for (let y = 0; y < $dataMap.height; y++) {
      for (let x = 0; x < $dataMap.width; x++) {
        if ($gameMap.regionId(x, y) === regionId) return { x, y };
      }
    }
    return { x: 0, y: 0 };
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

  function visitTreasureRoom() {
    ensureTreasureRoomsInitialized();
    if (treasureRoomList.length === 0) {
      console.error("No treasure rooms defined.");
      return;
    }
    const treasureRoomId = selectTreasureRoom();
    _savedBgm = AudioManager._bgm;
    saveReturnPoint(treasureRoomId);
    _postTransferActions = {
        type: 'treasureRoom',
        spawnRegionId: Number(parameters["spawnRegionId"] || 13),
        originalDirection: $gamePlayer.direction()
    };
    $gamePlayer.reserveTransfer(treasureRoomId, 0, 0, $gamePlayer.direction(), 0);
  }

  // Enter one specific room rather than the seeded pick: the entrance already
  // knows which room is its own (a patron's hatch). The return point, the
  // region-13 arrival and the exit are the ordinary ones, so the room's own
  // Exit event puts the party back where they came from.
  function enterRoom(treasureRoomId) {
    const roomId = Number(treasureRoomId);
    if (!Number.isInteger(roomId) || roomId <= 0) {
      console.error("TreasureRoomSystem.enterRoom: invalid map id " + treasureRoomId);
      return false;
    }
    _savedBgm = AudioManager._bgm;
    saveReturnPoint(roomId);
    _postTransferActions = {
      type: 'treasureRoom',
      spawnRegionId: Number(parameters["spawnRegionId"] || 13),
      originalDirection: $gamePlayer.direction()
    };
    $gamePlayer.reserveTransfer(roomId, 0, 0, $gamePlayer.direction(), 0);
    return true;
  }

  function exitTreasureRoom() {
    // Pop the most recent return point recorded for the room we are currently
    // in. Searching from the top (rather than blindly popping) keeps the stack
    // consistent even if an earlier entry was left stale by a bypassed exit.
    const currentMapId = $gameMap.mapId();
    let returnPoint = null;
    for (let i = treasureRoomReturnStack.length - 1; i >= 0; i--) {
      if (treasureRoomReturnStack[i].treasureRoomId === currentMapId) {
        returnPoint = treasureRoomReturnStack.splice(i, 1)[0];
        break;
      }
    }
    // Fallback: if no room-specific match (e.g. an older save), use the top.
    if (!returnPoint && treasureRoomReturnStack.length > 0) {
      returnPoint = treasureRoomReturnStack.pop();
    }
    if (returnPoint) {
      // Restore the procedural-map world coordinates before transferring back so
      // the global map position survives the treasure-room round trip.
      if (returnPoint.mapId === 636 && returnPoint.worldX !== undefined) {
        $gameVariables.setValue(43, returnPoint.worldX);
        $gameVariables.setValue(44, returnPoint.worldY);
      }
      $gamePlayer.reserveTransfer(returnPoint.mapId, returnPoint.x, returnPoint.y, 2, 0);
    } else {
      console.error("No return point for treasure room " + $gameMap.mapId());
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

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
      _Scene_Map_onMapLoaded.call(this);

      if (_postTransferActions) {
          const actions = _postTransferActions;
          if (actions.type === 'treasureRoom') {
              const pos = findPositionWithRegionId(actions.spawnRegionId);
              const mapDir = getMapDirection('treasureRoomDirection');

              $gamePlayer.locate(pos.x, pos.y);
              $gamePlayer.setDirection(mapDir !== null ? mapDir : actions.originalDirection);
              continueSavedBgm();
          }
          _savedBgm = null;
          _postTransferActions = null;
      }
  };

  const _DataManager_setupNewGame = DataManager.setupNewGame;
  DataManager.setupNewGame = function () {
    _DataManager_setupNewGame.call(this);
    Object.keys(visitedTreasureRooms).forEach(k => delete visitedTreasureRooms[k]);
    treasureRoomReturnStack.length = 0;
    _savedBgm = null;
  };

  const _DataManager_makeSaveContents = DataManager.makeSaveContents;
  DataManager.makeSaveContents = function () {
    const contents = _DataManager_makeSaveContents.call(this);
    // Persist under the original key so existing saves don't break
    if (!contents.treasureRoomSystem) contents.treasureRoomSystem = {};
    contents.treasureRoomSystem.visitedTreasureRooms = visitedTreasureRooms;
    contents.treasureRoomSystem.treasureRoomReturnStack = treasureRoomReturnStack;
    return contents;
  };

  const _DataManager_extractSaveContents = DataManager.extractSaveContents;
  DataManager.extractSaveContents = function (contents) {
    _DataManager_extractSaveContents.call(this, contents);
    // Which rooms have been looted belongs to the savegame being loaded, not to
    // the one loaded before it.
    for (const k of Object.keys(visitedTreasureRooms)) delete visitedTreasureRooms[k];
    treasureRoomReturnStack.length = 0;
    if (contents.treasureRoomSystem) {
        const system = contents.treasureRoomSystem;
        Object.assign(visitedTreasureRooms, system.visitedTreasureRooms || {});
        treasureRoomReturnStack.length = 0;
        if (Array.isArray(system.treasureRoomReturnStack)) {
          system.treasureRoomReturnStack.forEach(rp => treasureRoomReturnStack.push(rp));
        } else if (system.treasureRoomReturnPoints) {
          // Backward compat: old saves stored an object keyed by room id.
          Object.keys(system.treasureRoomReturnPoints).forEach(k => {
            const rp = system.treasureRoomReturnPoints[k];
            if (rp && rp.treasureRoomId === undefined) rp.treasureRoomId = Number(k);
            treasureRoomReturnStack.push(rp);
          });
        }
    }
  };

  window.TreasureRoomSystem = window.TreasureRoomSystem || {};

  // Fixed, single-entrance rooms.
  window.TreasureRoomSystem.enterRoom = enterRoom;
  window.TreasureRoomSystem.reserveRoom = function (mapId) {
    const id = Number(mapId);
    if (Number.isInteger(id) && id > 0) reservedRooms.add(id);
  };
  window.TreasureRoomSystem.isReservedRoom = function (mapId) {
    return reservedRooms.has(Number(mapId));
  };

  // Per-instance container discriminator (ContainerSystem). A treasure room map
  // can be reached from multiple entrances (and reused once all rooms are taken),
  // so the entrance that led into the room we are currently standing in uniquely
  // identifies this physical instance. Returns null when not inside a treasure
  // room, leaving normal container ids untouched.
  window.TreasureRoomSystem.getContainerInstanceKey = function () {
    if (typeof $gameMap === 'undefined' || !$gameMap) return null;
    const currentMapId = $gameMap.mapId();
    for (let i = treasureRoomReturnStack.length - 1; i >= 0; i--) {
      const rp = treasureRoomReturnStack[i];
      if (rp && rp.treasureRoomId === currentMapId) {
        return `${rp.mapId}_${rp.x}_${rp.y}`;
      }
    }
    return null;
  };

  window.TreasureRoomSystem.getNetworkData = function () {
    return {
      visitedTreasureRooms: visitedTreasureRooms,
    };
  };

  window.TreasureRoomSystem.syncFromNetwork = function (data) {
    if (data.visitedTreasureRooms) {
      Object.assign(visitedTreasureRooms, data.visitedTreasureRooms);
    }
  };

  window.TreasureRoomSystem.handlePeerVisit = function (data) {
    if (!visitedTreasureRooms[data.locationKey]) {
      visitedTreasureRooms[data.locationKey] = data.treasureRoomId;
    }
  };
})();