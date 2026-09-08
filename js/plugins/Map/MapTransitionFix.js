/*:
 * @target MZ
 * @plugindesc v1.2.0 Fixes null references and stale map data during map transitions
 * @author Fix for hypernet-explorer
 * @help
 * Fixes the "Cannot read property 'scrollType' of null" error that occurs
 * when transitioning between procedural maps at borders.
 *
 * Root cause: Game_Map.isLoopHorizontal() and isLoopVertical() methods
 * access $dataMap.scrollType without null-checking $dataMap first.
 *
 * Also fixes "Cannot read property 'list' of undefined" thrown from
 * Game_Event.start() when a player walks into an event whose live
 * _pageIndex no longer matches its current $dataMap page array (a page
 * removed by an edit, or an event instance left over from before a map
 * reload). Root cause: Game_Event.list() calls this.page().list without
 * checking that page() found a page at all.
 *
 * And fixes the arrival that never arrives: the party stands on the map they
 * were leaving, able to walk it and to talk to its events, while the game
 * believes they are somewhere else entirely (character creation ending on the
 * starting map is the way it is usually seen). Root cause: Scene_Map asks
 * DataManager for ONE map, the one reserved when the scene was created, and
 * then hands whatever arrived to Game_Map.setup() without ever checking that
 * the two agree. A transfer reserved AFTER that request went out - a picker
 * landing on a timer, an origin placing itself, anything asynchronous - is
 * performed against the previous map's data. See the guard below.
 */

(() => {
    'use strict';

    // Fix Game_Map.isLoopHorizontal - add null check on $dataMap
    const _Game_Map_isLoopHorizontal = Game_Map.prototype.isLoopHorizontal;
    Game_Map.prototype.isLoopHorizontal = function() {
        if (!$dataMap) {
            return false; // Return false during map transitions when $dataMap is null
        }
        return _Game_Map_isLoopHorizontal.call(this);
    };

    // Fix Game_Map.isLoopVertical - add null check on $dataMap
    const _Game_Map_isLoopVertical = Game_Map.prototype.isLoopVertical;
    Game_Map.prototype.isLoopVertical = function() {
        if (!$dataMap) {
            return false; // Return false during map transitions when $dataMap is null
        }
        return _Game_Map_isLoopVertical.call(this);
    };

    // ------------------------------------------------------------------
    // The destination the loaded $dataMap actually belongs to.
    // ------------------------------------------------------------------
    // MZ never writes this down: loadMapData is fire and forget, and $dataMap
    // carries no id of its own. Recorded here so the scene can tell the map it
    // asked for from the map it is about to walk the party onto.
    const _DataManager_loadMapData = DataManager.loadMapData;
    DataManager.loadMapData = function(mapId) {
        this._loadedMapId = mapId;
        _DataManager_loadMapData.call(this, mapId);
    };

    // The guard. Scene_Map.isReady is the last moment before onMapLoaded calls
    // performTransfer, so it is where a destination that changed under the
    // scene is caught: the right map is requested instead (loadDataFile nulls
    // $dataMap, so isMapLoaded goes false and this cannot spin), and the scene
    // keeps loading until it lands. _transfer is raised because the transfer
    // was reserved after create() read it, and without it onMapLoaded would
    // leave the party standing where they were.
    const _Scene_Map_isReady = Scene_Map.prototype.isReady;
    Scene_Map.prototype.isReady = function() {
        if (!this._mapLoaded && DataManager.isMapLoaded() &&
            $gamePlayer && $gamePlayer.isTransferring() &&
            DataManager._loadedMapId !== $gamePlayer.newMapId()) {
            console.warn(`MapTransitionFix: the map was loaded for ${DataManager._loadedMapId} but the party is transferring to ${$gamePlayer.newMapId()}; loading the destination instead.`);  // i18n-ignore  console diagnostic
            this._transfer = true;
            DataManager.loadMapData($gamePlayer.newMapId());
            return false;
        }
        return _Scene_Map_isReady.call(this);
    };

    // Fix Game_Event.list - add null check on page(), which returns
    // undefined when _pageIndex no longer matches a real page.
    Game_Event.prototype.list = function() {
        const page = this.page();
        return page ? page.list : [];
    };

})();
