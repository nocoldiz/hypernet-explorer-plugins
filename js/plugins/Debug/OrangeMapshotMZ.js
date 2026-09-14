/*=============================================================================
 * Orange - Mapshot MZ
 * By Hudell (Ported by Arthran)
 * OrangeMapshotMZ.js
 * Version: 1.7
 * Free for commercial and non commercial use.
 *=============================================================================*/
/*:
 * @target MZ
 * @plugindesc This plugin will save a picture of the entire map on a Mapshots folder when you press a key. <OrangeMapshotMZ>
 * @author Hudell (Ported by Arthran)
 *
 * @param useMapName
 * @desc if true, the filename will be the name of the map. If false it will be the number.
 * @default true
 * @type boolean
 * @on Use Map Name
 * @off Use Map Number
 *
 * @param layerType
 * @desc 0 = all, 1 = upper and lower, 2 = separate everything
 * @default 0
 * @type number
 *
 * @param drawAutoShadows
 * @desc set this to false to disable autoshadows on the map shot
 * @default true
 * @type boolean
 * @on Draw
 * @off Do Not Draw
 *
 * @param drawEvents
 * @desc set this to false to stop drawing the events on the full bitmap
 * @default true
 * @type boolean
 * @on Draw
 * @off Do Not Draw
 *
 * @param keyCode
 * @desc code of the key that will be used (44 = printscreen). http://www.javascriptkeycode.com
 * @default 44
 * @type number
 *
 * @param imageType
 * @desc What type of image should be generated. Can be png, jpeg or webp
 * @default png
 * @type text
 *
 * @param imageQuality
 * @desc If the imageType is jpeg or webp, you can set this to a number between 0 and 100 indicating the quality of the image
 * @default 70
 * @type number
 *
 * @param imagePath
 * @desc The path where the images will be saved
 * @default ./Mapshots
 * @type text
 *
 * @param fullDebug
 * @desc When enabled on map 636 (procedural map), generates and screenshots all world coordinates
 * @default false
 * @type boolean
 * @on Enable Full Debug Screenshots
 * @off Disable Full Debug Screenshots
 *
 * @param autoCaptureMode
 * @desc Automatically capture a screenshot every time player transfers to map 636 (with coordinates)
 * @default false
 * @type boolean
 * @on Enable Auto Capture
 * @off Disable Auto Capture
 *
 * @param commandDebugMode
 * @desc When enabled, allows manual navigation with auto-teleport at borders based on player step direction
 * @default false
 * @type boolean
 * @on Enable Command Debug Mode
 * @off Disable Command Debug Mode
 *
 * @help
 * Check keycodes at  http://www.javascriptkeycode.com
 *
 * FULL DEBUG MODE:
 * When fullDebug is enabled and you take a screenshot on map 636 (procedural map),
 * it will automatically generate and take screenshots for all world map coordinates.
 * Each screenshot will be saved with the filename format: coordX,coordY.png
 * This is useful for visualizing the entire procedural world generation.
 *
 * AUTO CAPTURE MODE:
 * When autoCaptureMode is enabled, the plugin automatically captures a screenshot
 * every time the player transfers to map 636 (procedural map). The screenshot will
 * be saved with the coordinates in the Mapshots/Fulldebug folder as coordX,coordY.png
 *
 * COMMAND DEBUG MODE:
 * When commandDebugMode is enabled, the player can navigate the procedural world manually.
 * When the player walks towards a map border in any direction, they will be automatically
 * teleported to the opposite border of the adjacent world coordinate, allowing seamless
 * exploration of the procedural world by walking.
 */
var Imported = Imported || {};

var OrangeMapshotMZ = OrangeMapshotMZ || {};

(function ($) {
    "use strict";

    var parameters = $plugins.filter(function (plugin) {
        return plugin.description.indexOf('<OrangeMapshotMZ>') >= 0;
    });
    if (parameters.length === 0) {
        throw new Error("Couldn't find OrangeMapshotMZ parameters.");
    }
    $.Parameters = parameters[0].parameters;

    $.Param = {};
    $.Param.useMapName = $.Parameters.useMapName !== "false";
    $.Param.drawAutoShadows = $.Parameters.drawAutoShadows !== "false";
    $.Param.drawEvents = $.Parameters.drawEvents !== "false";
    $.Param.layerType = Number($.Parameters.layerType || 0);
    $.Param.imageType = $.Parameters.imageType || 'png';
    $.Param.imagePath = $.Parameters.imagePath || './Mapshots';
    $.Param.imageQuality = Number($.Parameters.imageQuality || 70);
    $.Param.fullDebug = $.Parameters.fullDebug === "true";
    $.Param.autoCaptureMode = $.Parameters.autoCaptureMode === "true";
    $.Param.commandDebugMode = $.Parameters.commandDebugMode === "true";

    $.Param.keyCode = Number($.Parameters.keyCode || 44);

    $.imageType = function () {
        if ($.Param.imageType == 'webp') return 'image/webp';
        if ($.Param.imageType == 'jpeg' || $.Param.imageType == 'jpg') return 'image/jpeg';
        return 'image/png';
    };

    $.imageRegex = function () {
        if ($.Param.imageType == 'webp') return (/^data:image\/webp;base64,/);
        if ($.Param.imageType == 'jpeg' || $.Param.imageType == 'jpg') return (/^data:image\/jpeg;base64,/);

        return (/^data:image\/png;base64,/);
    };

    $.fileExtension = function () {
        if ($.Param.imageType == 'webp') return '.webp';
        if ($.Param.imageType == 'jpeg' || $.Param.imageType == 'jpg') return '.jpg';
        return '.png';
    };

    $.imageQuality = function () {
        if ($.fileExtension() == '.jpg' || $.fileExtension() == '.webp') {
            return Math.min($.Param.imageQuality, 100) / 100;
        }

        return 1;
    };

    $.baseFileName = function () {
        var mapName = ($gameMap._mapId).padZero(3);
        if ($.Param.useMapName && $dataMapInfos[$gameMap._mapId]) {
            mapName = $dataMapInfos[$gameMap._mapId].name;
        } else {
            mapName = 'Map' + mapName;
        }

        return mapName;
    };

    $.getMapshot = function () {
        var lowerBitmap;
        var upperBitmap;

        switch ($.Param.layerType) {
            case 1:
                lowerBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                upperBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                SceneManager._scene._spriteset._tilemap._paintEverything(lowerBitmap, upperBitmap);

                return [lowerBitmap, upperBitmap];
            case 2:
                var groundBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var ground2Bitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var lowerBitmapLayer = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var upperBitmapLayer = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var shadowBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var lowerEvents = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var normalEvents = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                var upperEvents = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());

                SceneManager._scene._spriteset._tilemap._paintLayered(groundBitmap, ground2Bitmap, lowerBitmapLayer, upperBitmapLayer, shadowBitmap, lowerEvents, normalEvents, upperEvents);
                return [groundBitmap, ground2Bitmap, lowerBitmapLayer, upperBitmapLayer, shadowBitmap, lowerEvents, normalEvents, upperEvents];
            default:
                lowerBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                upperBitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                SceneManager._scene._spriteset._tilemap._paintEverything(lowerBitmap, upperBitmap);

                var bitmap = new Bitmap($dataMap.width * $gameMap.tileWidth(), $dataMap.height * $gameMap.tileHeight());
                bitmap.blt(lowerBitmap, 0, 0, lowerBitmap.width, lowerBitmap.height, 0, 0, lowerBitmap.width, lowerBitmap.height);
                bitmap.blt(upperBitmap, 0, 0, upperBitmap.width, upperBitmap.height, 0, 0, upperBitmap.width, upperBitmap.height);
                return [bitmap];
        }
    };

    function MapShotTileMap() {
    }

    MapShotTileMap.prototype = Object.create(Tilemap.prototype);
    MapShotTileMap.prototype.constructor = MapShotTileMap;

    MapShotTileMap.prototype._drawAutotile = function (bitmap, tileId, dx, dy) {
        var autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
        var kind = Tilemap.getAutotileKind(tileId);
        var shape = Tilemap.getAutotileShape(tileId);
        var tx = kind % 8;
        var ty = Math.floor(kind / 8);
        var bx = 0;
        var by = 0;
        var setNumber = 0;
        var isTable = false;

        if (Tilemap.isTileA1(tileId)) {
            var waterSurfaceIndex = [0, 1, 2, 1][this.animationFrame % 4];
            setNumber = 0;
            if (kind === 0) {
                bx = waterSurfaceIndex * 2;
                by = 0;
            } else if (kind === 1) {
                bx = waterSurfaceIndex * 2;
                by = 3;
            } else if (kind === 2) {
                bx = 6;
                by = 0;
            } else if (kind === 3) {
                bx = 6;
                by = 3;
            } else {
                bx = Math.floor(tx / 4) * 8;
                by = ty * 6 + Math.floor(tx / 2) % 2 * 3;
                if (kind % 2 === 0) {
                    bx += waterSurfaceIndex * 2;
                }
                else {
                    bx += 6;
                    autotileTable = Tilemap.WATERFALL_AUTOTILE_TABLE;
                    by += this.animationFrame % 3;
                }
            }
        } else if (Tilemap.isTileA2(tileId)) {
            setNumber = 1;
            bx = tx * 2;
            by = (ty - 2) * 3;
            isTable = this._isTableTile(tileId);
        } else if (Tilemap.isTileA3(tileId)) {
            setNumber = 2;
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
        } else if (Tilemap.isTileA4(tileId)) {
            setNumber = 3;
            bx = tx * 2;
            by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
            if (ty % 2 === 1) {
                autotileTable = Tilemap.WALL_AUTOTILE_TABLE;
            }
        }

        var table = autotileTable[shape];
        var source = this._bitmaps[setNumber];

        if (table && source) {
            var w1 = this.tileWidth / 2;
            var h1 = this.tileHeight / 2;
            for (var i = 0; i < 4; i++) {
                var qsx = table[i][0];
                var qsy = table[i][1];
                var sx1 = (bx * 2 + qsx) * w1;
                var sy1 = (by * 2 + qsy) * h1;
                var dx1 = dx + (i % 2) * w1;
                var dy1 = dy + Math.floor(i / 2) * h1;
                if (isTable && (qsy === 1 || qsy === 5)) {
                    var qsx2 = qsx;
                    var qsy2 = 3;
                    if (qsy === 1) {
                        qsx2 = [0, 3, 2, 1][qsx];
                    }
                    var sx2 = (bx * 2 + qsx2) * w1;
                    var sy2 = (by * 2 + qsy2) * h1;
                    bitmap.blt(source, sx2, sy2, w1, h1, dx1, dy1, w1, h1);
                    dy1 += h1 / 2;
                    bitmap.blt(source, sx1, sy1, w1, h1 / 2, dx1, dy1, w1, h1 / 2);
                } else {
                    bitmap.blt(source, sx1, sy1, w1, h1, dx1, dy1, w1, h1);
                }
            }
        }
    };

    MapShotTileMap.prototype._drawNormalTile = function(bitmap, tileId, dx, dy) {
        var setNumber = 0;

        if (Tilemap.isTileA5(tileId)) {
            setNumber = 4;
        } else {
            setNumber = 5 + Math.floor(tileId / 256);
        }

        var w = this.tileWidth;
        var h = this.tileHeight;
        var sx = (Math.floor(tileId / 128) % 2 * 8 + tileId % 8) * w;
        var sy = (Math.floor(tileId % 256 / 8) % 16) * h;

        var source = this._bitmaps[setNumber];
        if (source) {
            bitmap.blt(source, sx, sy, w, h, dx, dy, w, h);
        }
    };

    MapShotTileMap.prototype._drawTableEdge = function(bitmap, tileId, dx, dy) {
        if (Tilemap.isTileA2(tileId)) {
            var autotileTable = Tilemap.FLOOR_AUTOTILE_TABLE;
            var kind = Tilemap.getAutotileKind(tileId);
            var shape = Tilemap.getAutotileShape(tileId);
            var tx = kind % 8;
            var ty = Math.floor(kind / 8);
            var setNumber = 1;
            var bx = tx * 2;
            var by = (ty - 2) * 3;
            var table = autotileTable[shape];

            if (table) {
                var source = this._bitmaps[setNumber];
                var w1 = this.tileWidth / 2;
                var h1 = this.tileHeight / 2;
                for (var i = 0; i < 2; i++) {
                    var qsx = table[2 + i][0];
                    var qsy = table[2 + i][1];
                    var sx1 = (bx * 2 + qsx) * w1;
                    var sy1 = (by * 2 + qsy) * h1 + h1 / 2;
                    var dx1 = dx + (i % 2) * w1;
                    var dy1 = dy + Math.floor(i / 2) * h1;
                    bitmap.blt(source, sx1, sy1, w1, h1 / 2, dx1, dy1, w1, h1 / 2);
                }
            }
        }
    };

    MapShotTileMap.prototype._drawShadow = function(bitmap, shadowBits, dx, dy) {
        if (shadowBits & 0x0f) {
            var w1 = this.tileWidth / 2;
            var h1 = this.tileHeight / 2;
            var color = 'rgba(0,0,0,0.5)';
            for (var i = 0; i < 4; i++) {
                if (shadowBits & (1 << i)) {
                    var dx1 = dx + (i % 2) * w1;
                    var dy1 = dy + Math.floor(i / 2) * h1;
                    bitmap.fillRect(dx1, dy1, w1, h1, color);
                }
            }
        }
    };

    Tilemap.prototype._drawTileOldStyle = function (bitmap, tileId, dx, dy) {
        if (Tilemap.isVisibleTile(tileId)) {
            if (Tilemap.isAutotile(tileId)) {
                MapShotTileMap.prototype._drawAutotile.call(this, bitmap, tileId, dx, dy);
            } else {
                MapShotTileMap.prototype._drawNormalTile.call(this, bitmap, tileId, dx, dy);
            }
        }
    };

    Tilemap.prototype._paintEverything = function (lowerBitmap, upperBitmap) {
        var tileCols = $dataMap.width;
        var tileRows = $dataMap.height;

        for (var y = 0; y < tileRows; y++) {
            for (var x = 0; x < tileCols; x++) {
                this._paintTilesOnBitmap(lowerBitmap, upperBitmap, x, y);
            }
        }

        if ($.Param.drawEvents !== false) {
            this._paintCharacters(lowerBitmap, 0);
            this._paintCharacters(lowerBitmap, 1);
            this._paintCharacters(upperBitmap, 2);
        }
    };

    Tilemap.prototype._paintLayered = function (groundBitmap, ground2Bitmap, lowerBitmap, upperLayer, shadowBitmap, lowerEvents, normalEvents, upperEvents) {
        var tileCols = $dataMap.width;
        var tileRows = $dataMap.height;

        for (var y = 0; y < tileRows; y++) {
            for (var x = 0; x < tileCols; x++) {
                this._paintTileOnLayers(groundBitmap, ground2Bitmap, lowerBitmap, upperLayer, shadowBitmap, x, y);
            }
        }

        this._paintCharacters(lowerEvents, 0);
        this._paintCharacters(normalEvents, 1);
        this._paintCharacters(upperEvents, 2);
    };

    Tilemap.prototype._paintCharacters = function (bitmap, priority) {
        this.children.forEach(function (child) {
            if (child instanceof Sprite_Character) {
                if (child._character !== null) {
                    if (child._character instanceof Game_Player || child._character instanceof Game_Follower || child._character instanceof Game_Vehicle) return;
                }

                child.update();

                if (child._characterName === '' && child._tileId === 0) return;
                if (priority !== undefined && (!child._character || child._character._priorityType !== priority)) return;

                var x = child.x - child._frame.width / 2 + $gameMap._displayX * $gameMap.tileWidth();
                var y = child.y - child._frame.height + $gameMap._displayY * $gameMap.tileHeight();

                bitmap.blt(child.bitmap, child._frame.x, child._frame.y, child._frame.width, child._frame.height, x, y, child._frame.width, child._frame.height);
            }
        });
    };

    Tilemap.prototype._paintTileOnLayers = function (groundBitmap, ground2Bitmap, lowerBitmap, upperBitmap, shadowBitmap, x, y) {
        var tableEdgeVirtualId = 10000;
        var mx = x;
        var my = y;
        var dx = (mx * this.tileWidth);
        var dy = (my * this.tileHeight);
        var lx = dx / this.tileWidth;
        var ly = dy / this.tileHeight;
        var tileId0 = this._readMapData(mx, my, 0);
        var tileId1 = this._readMapData(mx, my, 1);
        var tileId2 = this._readMapData(mx, my, 2);
        var tileId3 = this._readMapData(mx, my, 3);
        var shadowBits = this._readMapData(mx, my, 4);
        var upperTileId1 = this._readMapData(mx, my - 1, 1);

        if (groundBitmap !== undefined) {
            groundBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        }

        if (ground2Bitmap !== undefined) {
            ground2Bitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        }

        if (lowerBitmap !== undefined) {
            lowerBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        }

        if (upperBitmap !== undefined) {
            upperBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        }

        if (shadowBitmap !== undefined) {
            shadowBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        }

        var me = this;

        function drawTiles(bitmap, tileId, shadowBits, upperTileId1) {
            if (tileId < 0) {
                if ($.Param.drawAutoShadows && shadowBits !== undefined) {
                    MapShotTileMap.prototype._drawShadow.call(me, bitmap, shadowBits, dx, dy);
                }
            } else if (tileId >= tableEdgeVirtualId) {
                MapShotTileMap.prototype._drawTableEdge.call(me, bitmap, upperTileId1, dx, dy);
            } else {
                me._drawTileOldStyle(bitmap, tileId, dx, dy);
            }
        }

        if (groundBitmap !== undefined) {
            drawTiles(groundBitmap, tileId0, undefined, upperTileId1);

            if (shadowBitmap !== undefined && tileId0 < 0) {
                drawTiles(shadowBitmap, tileId0, shadowBits, upperTileId1);
            }
        }

        if (ground2Bitmap !== undefined) {
            drawTiles(ground2Bitmap, tileId1, undefined, upperTileId1);

            if (shadowBitmap !== undefined && tileId1 < 0) {
                drawTiles(shadowBitmap, tileId1, shadowBits, upperTileId1);
            }
        }

        if (lowerBitmap !== undefined) {
            drawTiles(lowerBitmap, tileId2, undefined, upperTileId1);

            if (shadowBitmap !== undefined && tileId2 < 0) {
                drawTiles(shadowBitmap, tileId2, shadowBits, upperTileId1);
            }
        }

        if (upperBitmap !== undefined) {
            drawTiles(upperBitmap, tileId3, shadowBits, upperTileId1);

            if (shadowBitmap !== undefined && tileId3 < 0) {
                drawTiles(shadowBitmap, tileId3, shadowBits, upperTileId1);
            }
        }
    };

    Tilemap.prototype._paintTilesOnBitmap = function (lowerBitmap, upperBitmap, x, y) {
        var tableEdgeVirtualId = 10000;
        var mx = x;
        var my = y;
        var dx = (mx * this.tileWidth);
        var dy = (my * this.tileHeight);
        var lx = dx / this.tileWidth;
        var ly = dy / this.tileHeight;
        var tileId0 = this._readMapData(mx, my, 0);
        var tileId1 = this._readMapData(mx, my, 1);
        var tileId2 = this._readMapData(mx, my, 2);
        var tileId3 = this._readMapData(mx, my, 3);
        var shadowBits = this._readMapData(mx, my, 4);
        var upperTileId1 = this._readMapData(mx, my - 1, 1);
        var lowerTiles = [];
        var upperTiles = [];

        if (this._isHigherTile(tileId0)) {
            upperTiles.push(tileId0);
        } else {
            lowerTiles.push(tileId0);
        }
        if (this._isHigherTile(tileId1)) {
            upperTiles.push(tileId1);
        } else {
            lowerTiles.push(tileId1);
        }

        lowerTiles.push(-shadowBits);

        if (this._isTableTile(upperTileId1) && !this._isTableTile(tileId1)) {
            if (!Tilemap.isShadowingTile(tileId0)) {
                lowerTiles.push(tableEdgeVirtualId + upperTileId1);
            }
        }

        if (this._isOverpassPosition(mx, my)) {
            upperTiles.push(tileId2);
            upperTiles.push(tileId3);
        } else {
            if (this._isHigherTile(tileId2)) {
                upperTiles.push(tileId2);
            } else {
                lowerTiles.push(tileId2);
            }
            if (this._isHigherTile(tileId3)) {
                upperTiles.push(tileId3);
            } else {
                lowerTiles.push(tileId3);
            }
        }

        lowerBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);
        upperBitmap.clearRect(dx, dy, this.tileWidth, this.tileHeight);

        for (var i = 0; i < lowerTiles.length; i++) {
            var lowerTileId = lowerTiles[i];
            if (lowerTileId < 0) {
                if ($.Param.drawAutoShadows) {
                    MapShotTileMap.prototype._drawShadow.call(this, lowerBitmap, shadowBits, dx, dy);
                }
            } else if (lowerTileId >= tableEdgeVirtualId) {
                MapShotTileMap.prototype._drawTableEdge.call(this, lowerBitmap, upperTileId1, dx, dy);
            } else {
                this._drawTileOldStyle(lowerBitmap, lowerTileId, dx, dy);
            }
        }

        for (var j = 0; j < upperTiles.length; j++) {
            this._drawTileOldStyle(upperBitmap, upperTiles[j], dx, dy);
        }
    };

    /**
     * Full debug screenshot mode for procedural maps
     * Generates and takes screenshots for a 6x6 grid of coordinates
     * centered at the current player position
     * Saves each screenshot as coordX,coordY.png
     */
    $.saveFullDebugScreenshots = function () {
        if (!Utils.isNwjs()) return;

        // Check if we're on procedural map (map 636)
        if ($gameMap._mapId !== 636) {
            console.warn('Full debug screenshots only work on map 636 (procedural map)');
            return;
        }

        var fs = require('fs');
        var path = $.Param.imagePath + '/FullDebug';
        var regex = $.imageRegex();
        var ext = $.fileExtension();
        var screenshotsGenerated = 0;
        var startTime = Date.now();
        var currentWorldX = $gameVariables.value(43);
        var currentWorldY = $gameVariables.value(44);

        // Calculate 6x6 grid bounds with current position as top-left corner
        var gridSize = 64;
        var minWorldX = currentWorldX;
        var minWorldY = currentWorldY;
        var maxWorldX = currentWorldX + gridSize - 1;
        var maxWorldY = currentWorldY + gridSize - 1;

        var targetWorldX = minWorldX;
        var targetWorldY = minWorldY;

        console.log('Starting full debug screenshot generation for 6x6 grid of coordinates...');
        console.log('Grid bounds: (' + minWorldX + ',' + minWorldY + ') to (' + maxWorldX + ',' + maxWorldY + ')');

        try {
            // Create FullDebug directory
            fs.mkdir(path, { recursive: true }, function (err) {
                if (err && err.code !== 'EEXIST') {
                    console.error('Failed to create directory:', err);
                    return;
                }

                // Hook into Scene_Map.onMapLoaded to capture screenshots after map transitions
                var _onMapLoadedProto = SceneManager._scene.constructor.prototype;
                const _Scene_Map_onMapLoaded = _onMapLoadedProto.onMapLoaded;
                var _restoreOnMapLoaded = function () {
                    _onMapLoadedProto.onMapLoaded = _Scene_Map_onMapLoaded;
                };
                var pendingScreenshots = [];
                var isProcessing = false;

                _onMapLoadedProto.onMapLoaded = function () {
                    _Scene_Map_onMapLoaded.call(this);

                    if ($gameMap.mapId() === 636) {  // PROC_MAP_ID
                        var captureX = $gameVariables.value(43);
                        var captureY = $gameVariables.value(44);
                        var currentBiome = $gameSystem._procGenData ? $gameSystem._procGenData.currentBiome : 'Unknown';

                        // Skip Ocean biomes
                        if (currentBiome === 'Ocean') {
                            console.log('Skipping Ocean biome at (' + captureX + ',' + captureY + ')');
                            isProcessing = false;
                            processNextCoordinate();
                            return;
                        }

                        // Take screenshot after map is fully loaded
                        setTimeout(function () {
                            try {
                                // Guard: the scene may have changed during the async wait.
                                var spriteset = SceneManager._scene && SceneManager._scene._spriteset;
                                if (!spriteset || !spriteset._tilemap) {
                                    console.warn('Spriteset/tilemap unavailable; skipping screenshot for (' + captureX + ',' + captureY + ')');
                                    isProcessing = false;
                                    processNextCoordinate();
                                    return;
                                }

                                var snaps = $.getMapshot();
                                var fileName = path + '/' + captureX + ',' + captureY + ext;

                                // Advance the sequence only once per coordinate, after every
                                // layer for this coordinate has been written.
                                var pendingWrites = snaps.length;
                                var coordinateDone = false;
                                var finishCoordinate = function () {
                                    if (coordinateDone) return;
                                    coordinateDone = true;
                                    isProcessing = false;
                                    processNextCoordinate();
                                };

                                var callback = function (error) {
                                    if (error) {
                                        console.error('Error saving screenshot for (' + captureX + ',' + captureY + '):', error);
                                    } else {
                                        screenshotsGenerated++;
                                        console.log('Screenshot ' + screenshotsGenerated + ': (' + captureX + ',' + captureY + ') [' + currentBiome + ']');
                                    }

                                    pendingWrites--;
                                    if (pendingWrites <= 0) {
                                        finishCoordinate();
                                    }
                                };

                                for (var i = 0; i < snaps.length; i++) {
                                    var urlData = snaps[i].canvas.toDataURL($.imageType(), $.imageQuality());
                                    var base64Data = urlData.replace(regex, "");
                                    var fileNameWithLayer = fileName;

                                    if (snaps.length > 1) {
                                        fileNameWithLayer = fileName.replace(ext, '_layer' + i + ext);
                                    }

                                    fs.writeFile(fileNameWithLayer, base64Data, 'base64', callback);
                                }
                            } catch (error) {
                                console.error('Error taking screenshot for coordinate (' + captureX + ',' + captureY + '):', error);
                                isProcessing = false;
                                processNextCoordinate();
                            }
                        }, 300);  // Wait for tilemap to render
                    }
                };

                // Build the zigzag pattern for 6x6 grid, skipping existing images
                var coordinateSequence = [];
                for (var xOffset = 0; xOffset < 6; xOffset++) {
                    if (xOffset % 2 === 0) {
                        // Even columns: go down (increasing Y)
                        for (var yOffset = 0; yOffset < 6; yOffset++) {
                            var x = minWorldX + xOffset;
                            var y = minWorldY + yOffset;
                            var fileName = path + '/' + x + ',' + y + ext;

                            // Check if file already exists
                            if (!fs.existsSync(fileName)) {
                                coordinateSequence.push({
                                    x: x,
                                    y: y
                                });
                            } else {
                                console.log('Skipping existing screenshot: (' + x + ',' + y + ')');
                            }
                        }
                    } else {
                        // Odd columns: go up (decreasing Y)
                        for (var yOffset = 5; yOffset >= 0; yOffset--) {
                            var x = minWorldX + xOffset;
                            var y = minWorldY + yOffset;
                            var fileName = path + '/' + x + ',' + y + ext;

                            // Check if file already exists
                            if (!fs.existsSync(fileName)) {
                                coordinateSequence.push({
                                    x: x,
                                    y: y
                                });
                            } else {
                                console.log('Skipping existing screenshot: (' + x + ',' + y + ')');
                            }
                        }
                    }
                }
                var sequenceIndex = 0;

                if (coordinateSequence.length === 0) {
                    console.log('All coordinates already have screenshots. Nothing to capture.');
                    $gameMessage.add('All screenshots already exist in\n' + path.replace(/\\/g, '\\\\'));
                    _restoreOnMapLoaded();
                    return;
                }

                console.log('Coordinates to capture: ' + coordinateSequence.length + '/36');

                // Function to process the next coordinate
                var processNextCoordinate = function () {
                    if (isProcessing) return;

                    if (sequenceIndex >= coordinateSequence.length) {
                        // All done
                        console.log('All coordinates processed!');
                        var totalTime = (Date.now() - startTime) / 1000;
                        console.log('Full debug screenshot generation complete! Generated ' + screenshotsGenerated + ' screenshots in ' + totalTime + ' seconds');
                        $gameMessage.add('Full debug screenshots saved to\n' + path.replace(/\\/g, '\\\\'));
                        _restoreOnMapLoaded();
                        return;
                    }

                    isProcessing = true;
                    var currentX = $gameVariables.value(43);
                    var currentY = $gameVariables.value(44);
                    var nextCoord = coordinateSequence[sequenceIndex];
                    targetWorldX = nextCoord.x;
                    targetWorldY = nextCoord.y;

                    // Determine direction to move based on target coordinates
                    var moveDirection = 0;
                    var edgeX = 0;
                    var edgeY = 0;

                    if (currentX < targetWorldX) {
                        // Move east - teleport to right edge
                        moveDirection = 6;
                        edgeX = 127;  // Right edge (map width is 128, 0-127)
                        edgeY = $gamePlayer.y;
                    } else if (currentX > targetWorldX) {
                        // Move west - teleport to left edge
                        moveDirection = 4;
                        edgeX = 0;   // Left edge
                        edgeY = $gamePlayer.y;
                    } else if (currentY < targetWorldY) {
                        // Move south - teleport to bottom edge
                        moveDirection = 2;
                        edgeX = $gamePlayer.x;
                        edgeY = 127;  // Bottom edge
                    } else if (currentY > targetWorldY) {
                        // Move north - teleport to top edge
                        moveDirection = 8;
                        edgeX = $gamePlayer.x;
                        edgeY = 0;   // Top edge
                    } else {
                        // At target, move to next coordinate in sequence
                        sequenceIndex++;
                        isProcessing = false;
                        processNextCoordinate();
                        return;
                    }

                    // Teleport player to the edge
                    $gamePlayer.setPosition(edgeX, edgeY);
                    $gamePlayer.setDirection(moveDirection);

                    // Move in that direction to trigger border crossing
                    setTimeout(function () {
                        $gamePlayer.moveStraight(moveDirection);
                    }, 100);
                };

                // Initialize: start with the min coordinates and begin processing
                processNextCoordinate();
            });

        } catch (error) {
            console.error('An error occurred during full debug screenshot generation:', error);
        }
    };

    $.saveMapshot = function () {
        if (!Utils.isNwjs()) return;

        var fs = require('fs');
        var path = $.Param.imagePath;

        try {
            fs.mkdir(path, function () {
                try {
                    var fileName = path + '/' + $.baseFileName();
                    var ext = $.fileExtension();
                    var names = [fileName + ext];
                    var regex = $.imageRegex();

                    switch ($.Param.layerType) {
                        case 1:
                            names = [
                                fileName + ' Lower' + ext,
                                fileName + ' Upper' + ext
                            ];
                            break;
                        case 2:
                            names = [
                                fileName + ' Ground' + ext,
                                fileName + ' Ground 2' + ext,
                                fileName + ' Lower' + ext,
                                fileName + ' Upper' + ext,
                                fileName + ' Shadows' + ext,
                                fileName + ' Lower Events' + ext,
                                fileName + ' Normal Events' + ext,
                                fileName + ' Upper Events' + ext
                            ];

                            break;
                        default:
                            names = [fileName + ext];
                            break;
                    }

                    var snaps = $.getMapshot();

                    var callback = function (error) {
                        if (error !== undefined && error !== null) {
                            console.error('An error occured while saving the mapshot', error);
                        }
                    };

                    for (var i = 0; i < names.length; i++) {
                        var urlData = snaps[i].canvas.toDataURL($.imageType(), $.imageQuality());
                        var base64Data = urlData.replace(regex, "");

                        fs.writeFile(names[i], base64Data, 'base64', callback);
                    }
                } catch (error) {
                    if (error !== undefined && error !== null) {
                        console.error('An error occured while saving the map shot:', error);
                    }
                }
            });

            var nodePath = require('path');
            var longPath = nodePath.resolve(path);

            if (process.platform == 'win32' && $._openedFolder === undefined) {
                $._openedFolder = true;

                setTimeout(function () {
                    var exec = require('child_process').exec;
                    exec('explorer ' + longPath);
                }, 100);
            } else {
                $gameMessage.add('Mapshot saved to \n' + longPath.replace(/\\/g, '\\\\').match(/.{1,40}/g).join('\n'));
            }

        } catch (error) {
            if (error !== undefined && error !== null) {
                console.error('An error occured while saving the mapshot:', error);
            }
        }
    };

    $.autoCaptureOnTransfer = function () {
        if (!Utils.isNwjs()) return;
        if (!$.Param.autoCaptureMode) return;
        if ($gameMap._mapId !== 636) return;

        var fs = require('fs');
        var path = $.Param.imagePath + '/Fulldebug';
        var regex = $.imageRegex();
        var ext = $.fileExtension();
        var currentWorldX = $gameVariables.value(43);
        var currentWorldY = $gameVariables.value(44);

        try {
            fs.mkdir(path, { recursive: true }, function (err) {
                if (err && err.code !== 'EEXIST') {
                    console.error('Failed to create Fulldebug directory:', err);
                    return;
                }

                try {
                    var snaps = $.getMapshot();
                    var fileName = path + '/' + currentWorldX + ',' + currentWorldY + ext;

                    var callback = function (error) {
                        if (error) {
                            console.error('Error saving autocapture for (' + currentWorldX + ',' + currentWorldY + '):', error);
                        } else {
                            console.log('Autocaptured: (' + currentWorldX + ',' + currentWorldY + ')');
                        }
                    };

                    for (var i = 0; i < snaps.length; i++) {
                        var urlData = snaps[i].canvas.toDataURL($.imageType(), $.imageQuality());
                        var base64Data = urlData.replace(regex, "");
                        var fileNameWithLayer = fileName;

                        if (snaps.length > 1) {
                            fileNameWithLayer = fileName.replace(ext, '_layer' + i + ext);
                        }

                        fs.writeFile(fileNameWithLayer, base64Data, 'base64', callback);
                    }
                } catch (error) {
                    console.error('Error taking autocapture screenshot:', error);
                }
            });
        } catch (error) {
            console.error('An error occurred during autocapture:', error);
        }
    };

    /**
     * Command Debug Mode: Handle border crossing with auto-teleport
     * When player walks to a map border, teleport them to adjacent world coordinate
     * based on their movement direction
     */
    $.handleCommandDebugBorderCross = function () {
        if (!$.Param.commandDebugMode) return;
        if ($gameMap._mapId !== 636) return;

        var currentX = $gamePlayer.x;
        var currentY = $gamePlayer.y;
        var direction = $gamePlayer.direction();
        var worldX = $gameVariables.value(43);
        var worldY = $gameVariables.value(44);
        var newWorldX = worldX;
        var newWorldY = worldY;
        var newMapX = currentX;
        var newMapY = currentY;
        var shouldTeleport = false;

        // Check borders and determine if we need to cross
        // Direction 2 = down, 4 = left, 6 = right, 8 = up
        if (currentY >= 127 && direction === 2) {
            // At bottom, moving south
            newWorldY++;
            newMapY = 0;
            shouldTeleport = true;
        } else if (currentY <= 0 && direction === 8) {
            // At top, moving north
            newWorldY--;
            newMapY = 127;
            shouldTeleport = true;
        } else if (currentX >= 127 && direction === 6) {
            // At right, moving east
            newWorldX++;
            newMapX = 0;
            shouldTeleport = true;
        } else if (currentX <= 0 && direction === 4) {
            // At left, moving west
            newWorldX--;
            newMapX = 127;
            shouldTeleport = true;
        }

        if (shouldTeleport) {
            // Set new world coordinates
            $gameVariables.setValue(43, newWorldX);
            $gameVariables.setValue(44, newWorldY);

            // Transfer to procedural map at new position
            $gamePlayer.reserveTransfer(636, newMapX, newMapY, direction);
            console.log('[CommandDebug] Crossed border: (' + worldX + ',' + worldY + ') -> (' + newWorldX + ',' + newWorldY + ')');
        }
    };

    $.onKeyUp = function (event) {
        if (event.keyCode == $.Param.keyCode) {
            if (SceneManager._scene instanceof Scene_Map) {
                // Check if full debug mode is enabled and we're on procedural map 636
                if ($.Param.fullDebug && $gameMap._mapId === 636) {
                    $gameMessage.add('Starting full debug screenshot generation...');
                    $.saveFullDebugScreenshots();
                } else {
                    $.saveMapshot();
                }
            }
        }
    };

    // Hook into Scene_Map.onMapLoaded to trigger autocapture
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);
        $.autoCaptureOnTransfer();
    };

    // Hook into Game_Player.update to handle command debug border crossing
    const _Game_Player_update = Game_Player.prototype.update;
    Game_Player.prototype.update = function (sceneActive) {
        _Game_Player_update.call(this, sceneActive);
        $.handleCommandDebugBorderCross();
    };

    document.addEventListener('keyup', $.onKeyUp);
})(OrangeMapshotMZ);

Imported.OrangeMapshotMZ = 1.7;
