/*:
 * @target MZ
 * @plugindesc World Map Plugin v2.3.0 (Zoom, Pan, Detail Tiles & Optimized City Labels)
 * @author Omni-Lex
 * @version 2.3.0
 * @description Minimap (Bottom-left) + Interactive Fullscreen Map with Labels + Optimized In-Game City Names.
 *
 * @param mapWidth
 * @text Map Width (Mini)
 * @desc Width of the minimap in pixels (Normal Mode)
 * @type number
 * @min 50
 * @max 500
 * @default 240
 *
 * @param mapHeight
 * @text Map Height (Mini)
 * @desc Height of the minimap in pixels (Normal Mode)
 * @type number
 * @min 50
 * @max 500
 * @default 180
 *
 * @param renderScale
 * @text Render Scale (HiDPI Crispness)
 * @desc Resolution multiplier for sharp/HiDPI rendering (1 = 1x, 2 = 2x HiDPI crisp, 3 = 3x ultra)
 * @type number
 * @min 1
 * @max 4
 * @default 2
 *
 * @param permanentMinimap
 * @text Permanent Minimap
 * @desc Keep the minimap active across maps, scenes, and transfers by default
 * @type boolean
 * @default false
 *
 * @param opacity
 * @text Map Opacity
 * @desc Opacity of the minimap (0-255)
 * @type number
 * @min 0
 * @max 255
 * @default 180
 *
 * @param playerColor
 * @text Player Color
 * @desc Color of the player dot (hex color)
 * @type string
 * @default #FF0000
 *
 * @param labelFontSize
 * @text Teleport Label Size
 * @desc Font size for teleport names on the fullscreen map
 * @type number
 * @default 14
 *
 * @param proceduralZoomLevel
 * @text Procedural Map Zoom Level
 * @desc Zoom level for procedural maps in minimap (smaller = more zoomed in). Default 32 shows full block, 16 shows 1/4th.
 * @type number
 * @min 4
 * @max 128
 * @default 16
 *
 * @command openWorldMap
 * @text Open World Map
 * @desc Manually opens the fullscreen interactive world map (pan/zoom).
 *
 * @command showWorldMap
 * @text Show Minimap
 * @desc Shows the minimap overlay (bottom-left).
 *
 * @command hideWorldMap
 * @text Hide World Map
 * @desc Hides the minimap / world map overlay.
 *
 * @command toggleMinimap
 * @text Toggle Minimap
 * @desc Toggles the minimap overlay on/off.
 *
 * @command showZoomableMap
 * @text Show Zoomable Map
 * @desc Shows the fullscreen zoomable world map.
 *
 * @help WorldMap.js
 *
 * === Controls ===
 * 'M' Key: Cycle Modes (Hidden -> Mini -> Fullscreen).
 *
 * === Fullscreen Mode Controls ===
 * Mouse Drag:  Pan the map.
 * Mouse Wheel: Zoom In / Out.
 * 'Q' Key:     Zoom Out.
 * 'E' Key:     Zoom In.
 *
 * === Setup ===
 * 1. Place 'worldmap.png' in 'img/pictures/'.
 * 2. Create 'img/worldmap/' folder.
 * 3. Place detail tiles in 'img/worldmap/' named:
 * row-1-column-1.png through row-8-column-8.png
 *
 * 4. Name events "Teleport - NameOfPlace" (e.g., "Teleport - Rome").
 *
 * === In-Game City Labels ===
 * City names from teleport events are automatically displayed on the map.
 * Format: "Teleport - CityName" (e.g., "Teleport - Rome" shows "Rome")
 * Labels appear above the event and scroll with the map.
 * Performance: Labels only render when near the visible screen (5 tile buffer).
 * Bitmaps are created lazily when labels first become visible.
 * (Note: Teleport labels on minimap only appear if you are ON the world map).
 */

(() => {
    'use strict';

    const pluginName = 'WorldMap';
    const parameters = PluginManager.parameters(pluginName);

    const mapWidth = Number(parameters['mapWidth']) || 240;
    const mapHeight = Number(parameters['mapHeight']) || 180;
    const renderScale = Math.max(1, Math.min(4, Number(parameters['renderScale']) || 2));
    const permanentMinimap = parameters['permanentMinimap'] === 'true';
    const MINIMAP_SCALE = renderScale;
    const paramOpacity = Number(parameters['opacity']) || 180;
    const playerColor = parameters['playerColor'] || '#FF0000';
    const labelFontSize = Number(parameters['labelFontSize']) || 14;
    const proceduralZoomLevel = Number(parameters['proceduralZoomLevel']) || 16;
    
    // Constants for vehicles
    const boatColor = '#0000FF';
    const shipColor = '#00FF00';
    const airshipColor = '#FFFF00';
    const questMarkerColor = '#FFD76A'; // matches the quest board's focus gold

    // Every word this plugin prints comes out of js/i18n/<lang>/plugins/WorldMap.json.
    function T(key, params) {
        return window.T ? window.T(key, params) : String(key);
    }

    // Map States: 0 = Hidden, 1 = Normal (Mini Zoomed), 2 = Default (Mini Full), 3 = Fullscreen Interactive
    let currentMapState = permanentMinimap ? 1 : 0;

    // Interactive Zoom Variables
    let zoomScale = 0.06; // MIN_ZOOM: the map always opens fully zoomed out
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Cache decoded minimap tile Bitmaps by URL. renderMiniMap runs on every
    // player step, so an uncached Bitmap.load re-decodes the same JPEG each step;
    // caching keeps a single decoded bitmap per tile alive.
    const _tileBitmapCache = {};
    function loadCachedTile(path) {
        let bmp = _tileBitmapCache[path];
        if (!bmp) {
            bmp = Bitmap.load(path);
            _tileBitmapCache[path] = bmp;
        }
        return bmp;
    }

    // Every sprite this plugin caches (the map sprite, the city labels, the quest
    // edge arrows) is held in a module variable that outlives the scene the sprite
    // was parented to. A scene teardown destroys its children, and PIXI nulls the
    // transform of a destroyed display object, so writing x/y/scale on one throws
    // "Cannot read property 'position' of null" (x is an alias for
    // transform.position.x). Anything cached across scenes must be checked for
    // liveness before it is positioned, and rebuilt when it is dead.
    function isLiveSprite(s) {
        return !!(s && s.transform);
    }

    function currentTilemap() {
        const scene = SceneManager._scene;
        return scene && scene._spriteset ? scene._spriteset._tilemap : null;
    }

    // Assign a bitmap to the minimap sprite, freeing the previous per-render
    // bitmap's GPU texture to stop per-step baseTexture churn. Cached/shared
    // bitmaps (the master world image, the fullscreen composite) are never freed.
    function setWorldMapSpriteBitmap(bmp) {
        if (!isLiveSprite(worldMapSprite)) return;
        const old = worldMapSprite.bitmap;
        worldMapSprite.bitmap = bmp;
        if (old && old !== bmp && old !== worldMapBitmap && old !== fullscreenBitmap &&
            old !== blankBitmap && typeof old.destroy === 'function') {
            old.destroy();
        }
    }

    // Key Definitions
    Input.keyMapper[77] = 'world_map_toggle'; // M
    Input.keyMapper[81] = 'map_zoom_out';     // Q
    Input.keyMapper[69] = 'map_zoom_in';      // E

    let worldMapSprite = null;
    let worldMapBitmap = null; // The master source image loaded from disk
    let fullscreenBitmap = null; // Cached fullscreen grid bitmap
    let cityLabelsContainer = null; // Array of city name label sprites on the map

    // --- Live vehicle fast-travel tracking (shows the vehicle crossing the world
    //     map while the player sits inside the vehicle interior) ---
    // Transports that keep the player inside the vehicle interior for the whole
    // trip (no transfer to a dedicated travel map), so world vars 43/44 stay at
    // the origin and can be used as the start of the linear interpolation.
    const VEHICLE_TRANSPORTS = ['camper', 'carsharing'];
    let travelOrigin = null;        // {x, y} world coords captured when travel begins
    let autoOpenedForTravel = false; // true if the minimap was auto-shown for travel
    let travelRefreshCounter = 0;    // throttles the per-frame minimap redraw

    // ------------------------------------------------------------------------
    // WHERE THE PARTY STANDS, IN WORLD UNITS WITH A FRACTION
    // ------------------------------------------------------------------------
    // Vars 43/44 name a whole world square, so a dot drawn from them alone can
    // only ever sit in the middle of its cell and jump the whole cell at a
    // crossing. On the procedural map a square is 64x64 tiles and the stitched
    // window lays several of them side by side, so the party spends dozens of
    // steps inside one: reading how far across the square they already are lets
    // the dot creep across the cell exactly as they creep across the ground.
    //
    // Off the procedural map there is no sub-square position to read. An
    // authored map stands on its square whole, so the party is reported at the
    // centre of it, which is where the dot has always been drawn.
    const PROC_MAP_ID = 636;

    // The world square the party stands on. WorldMapTransfer is the one answer
    // to "where is this" (see its header): it reads the loaded map's own
    // <Coords>, the procedural map's generated origin and an alien landing grid
    // alike, and only falls back to vars 43/44 when nothing else knows. Reading
    // the variables here instead left the chart on whatever square was written
    // last, which is how an interior with a stale or template tag drew the
    // wrong corner of the world.
    function partyWorldSquare() {
        const svc = window.WorldMapTransfer;
        if (svc && typeof svc.currentWorldCoords === 'function' && $gameMap) {
            const wc = svc.currentWorldCoords();
            if (wc && isFinite(wc.x) && isFinite(wc.y)) return { x: wc.x | 0, y: wc.y | 0 };
        }
        return {
            x: ($gameVariables && $gameVariables.value(43)) || 0,
            y: ($gameVariables && $gameVariables.value(44)) || 0
        };
    }

    // How far into its own world square the party stands, 0..1 on each axis.
    // Answers with the square itself too, because on a stitched window the
    // square the party is in is the cell they are standing on, not necessarily
    // the one vars 43/44 have caught up with.
    function playerSquarePosition() {
        const square = partyWorldSquare();
        const result = { squareX: square.x, squareY: square.y, fracX: 0.5, fracY: 0.5 };
        const stitch = window.ProcStitch;
        if (!$gameMap || $gameMap.mapId() !== PROC_MAP_ID || !stitch || !$gamePlayer) return result;

        const size = stitch.cellSize ? stitch.cellSize() : null;
        const cellW = (size && size.width) || 64;
        const cellH = (size && size.height) || 64;
        // The cell the party stands on, when a window is up: without one the
        // whole map IS the square and its origin is 0,0.
        const cell = (stitch.active && stitch.active() && stitch.cellAt)
            ? (stitch.cellAt($gamePlayer.x, $gamePlayer.y) || (stitch.window && stitch.window() && stitch.window().partyCell)) : null;
        const ox = cell ? cell.ox : 0;
        const oy = cell ? cell.oy : 0;
        if (cell) {
            result.squareX = cell.worldX;
            result.squareY = cell.worldY;
        }
        // _realX/_realY are the tween position, so the dot keeps moving between
        // one tile and the next rather than only on whole steps.
        result.fracX = clamp01(($gamePlayer._realX - ox) / cellW);
        result.fracY = clamp01(($gamePlayer._realY - oy) / cellH);
        return result;
    }

    // The same answer as one pair of fractional world coordinates.
    function playerWorldPosition() {
        const p = playerSquarePosition();
        return { x: p.squareX + p.fracX, y: p.squareY + p.fracY };
    }

    function clamp01(v) {
        if (!(v >= 0)) return 0;   // NaN included
        return v > 1 ? 1 : v;
    }

    // Bologna map constants (must match BolognaMapSystem.js)
    const BOLOGNA_MAP_ID = 353;
    const BOLOGNA_ROW_MIN = 3, BOLOGNA_ROW_MAX = 16;
    const BOLOGNA_COL_MIN = 2, BOLOGNA_COL_MAX = 10;
    const BOLOGNA_CELL_PX = 256; // pixels per cell in the assembled fullscreen bitmap
    const BOLOGNA_MAP_TILES = 256; // each Bologna cell map is 256x256 tiles

    // GalaxySim alien-planet surface (map 636, Alien* biome): pixels per
    // landing-grid cell in the fullscreen bitmap. The minimap draws the same
    // grid scaled down to mapWidth/mapHeight instead.
    const ALIEN_GRID_CELL_PX = 96;

    // Expose fullscreen state for compatibility with MousePan.js
    window.isWorldMapFullscreen = function() {
        return currentMapState === 3;
    };

    // Sandbox / debug access: enabled when the party leader is named "Test" or
    // SandboxMode.js has flagged the save. Used to gate click-to-teleport on the
    // Bologna fullscreen overlay.
    function isSandboxEnabled() {
        const leader = $gameParty && $gameParty.leader();
        const isTest = !!(leader && leader.name() === "Test");  // i18n-ignore  debug account name
        return isTest || !!($gameSystem && $gameSystem._isSandboxMode === true);
    }

    // Click tracking for Bologna overlay teleport (distinguishes tap from drag).
    let bolognaPressing = false;
    let bolognaPressX = 0, bolognaPressY = 0, bolognaPressMoved = false;

    // Plugin Commands
    PluginManager.registerCommand(pluginName, "openWorldMap", args => {
        currentMapState = 3;
        focusTileHint = null; // an explicit open follows the party
        resetZoom();
        clearFullscreenCache();
        refreshWorldMapDisplay();
    });

    PluginManager.registerCommand(pluginName, "showWorldMap", args => {
        currentMapState = 1;
        if ($gameSystem) {
            $gameSystem._minimapState = 1;
            $gameSystem._minimapUserHidden = false;
        }
        refreshWorldMapDisplay();
    });

    PluginManager.registerCommand(pluginName, "hideWorldMap", args => {
        currentMapState = 0;
        if ($gameSystem) {
            $gameSystem._minimapState = 0;
            $gameSystem._minimapUserHidden = true;
        }
        refreshWorldMapDisplay();
    });

    PluginManager.registerCommand(pluginName, "toggleMinimap", args => {
        setMinimapVisible(!isMinimapVisible());
    });

    PluginManager.registerCommand(pluginName, "showZoomableMap", args => {
        currentMapState = 3;
        focusTileHint = null; // an explicit open follows the party
        resetZoom();
        clearFullscreenCache();
        refreshWorldMapDisplay();
    });

    // ------------------------------------------------------------------------
    // Initialization & Helpers
    // ------------------------------------------------------------------------

    // The sprite belongs to the scene it was added to. A tile that finishes
    // loading after a map transfer calls refreshWorldMapDisplay from a scene that
    // is no longer the running one, so the sprite is dropped and rebuilt against
    // the live scene rather than kept and written to after it has been destroyed.
    function belongsToCurrentScene(sprite) {
        // Walked rather than compared against parent directly: the sprite is added
        // to the scene, but another plugin may nest it deeper in the same scene.
        let node = sprite;
        while (node) {
            if (node === SceneManager._scene) return true;
            node = node.parent;
        }
        return false;
    }

    function dropStaleWorldMapSprite() {
        if (!worldMapSprite) return;
        if (isLiveSprite(worldMapSprite) && belongsToCurrentScene(worldMapSprite)) return;
        if (isLiveSprite(worldMapSprite) && worldMapSprite.parent) {
            worldMapSprite.parent.removeChild(worldMapSprite);
        }
        worldMapSprite = null;
    }

    function createWorldMapSprite() {
        dropStaleWorldMapSprite();
        if (worldMapSprite) return;
        // Only the map scene owns a world map. Parking the sprite on a menu or a
        // loading scene (an async tile arriving mid-transition) leaves a dangling
        // reference to a sprite that scene will destroy.
        if (!(SceneManager._scene instanceof Scene_Map)) return;

        worldMapSprite = new Sprite();
        worldMapSprite.anchor.x = 0;
        worldMapSprite.anchor.y = 0;

        // Attach to the scene BEFORE anything can call back into this function.
        // An already-cached picture makes addLoadListener fire synchronously, and
        // a sprite that is not yet in the scene tree fails belongsToCurrentScene,
        // so dropStaleWorldMapSprite would discard the half-built sprite and the
        // callback would rebuild it forever (stack overflow).
        const scene = SceneManager._scene;
        if (scene._windowLayer) {
            const windowLayerIndex = scene.children.indexOf(scene._windowLayer);
            if (windowLayerIndex >= 0) {
                scene.addChildAt(worldMapSprite, windowLayerIndex);
            } else {
                scene.addChild(worldMapSprite);
            }
        } else {
            scene.addChild(worldMapSprite);
        }

        // Load the master image (for Fullscreen and Map 315 Mini)
        worldMapBitmap = ImageManager.loadPicture('worldmap');
        worldMapBitmap.addLoadListener(() => {
            // The scene may have changed while the picture was loading.
            if (!isLiveSprite(worldMapSprite) || !belongsToCurrentScene(worldMapSprite)) return;
            // A focus request (a quest detail asking "show me where this is") may
            // have arrived before the picture finished loading, in which case
            // refreshWorldMapDisplay bailed out at the readiness check. Re-apply
            // the focus instead of centring on the raw image, or the pan would be
            // silently thrown away and the map would open on the wrong place.
            if (focusTileHint) {
                focusOverride = { x: focusTileHint.x, y: focusTileHint.y };
                resetZoom();
            } else {
                // Center the map initially for fullscreen mode
                panX = (Graphics.width - worldMapBitmap.width) / 2;
                panY = (Graphics.height - worldMapBitmap.height) / 2;
            }
            refreshWorldMapDisplay();
        });
    }

    // Zoom bounds for the fullscreen map. The map opens fully zoomed out, so the
    // whole world is on screen before the player zooms in on anything.
    const MIN_ZOOM = 0.06;   // low enough that the whole sheet fits one screen
    const MAX_ZOOM = 8.0;

    function resetZoom() {
        zoomScale = MIN_ZOOM;
        centerOnCurrentCoordinates();
    }

    // ------------------------------------------------------------------------
    // Focus requests (quest details asking for "show me where this is")
    //
    // A one-shot world coordinate that centerOnCurrentCoordinates() honours in
    // place of the player's position. Requests are queued on $gameTemp because
    // they are issued from other scenes (the quest board, the quest log) and can
    // only be carried out once Scene_Map is running again.
    // ------------------------------------------------------------------------
    let focusOverride = null;
    // Kept separately from focusOverride, which centerOnCurrentCoordinates consumes
    // immediately: the tile loader needs to know which segment to fetch first, and
    // it runs after the centring pass.
    let focusTileHint = null;

    function focusWorldMapAt(wx, wy) {
        if (wx == null || wy == null) return false;
        focusOverride = { x: Number(wx), y: Number(wy) };
        focusTileHint = { x: Number(wx), y: Number(wy) };
        autoOpenedForTravel = false;
        currentMapState = 3;          // fullscreen, the map the M key cycles to
        clearFullscreenCache();       // rebuild the layer so markers redraw
        resetZoom();
        refreshWorldMapDisplay();
        return true;
    }

    // Callable from any scene: the map opens on the next Scene_Map frame.
    function requestWorldMapFocus(wx, wy) {
        if (wx == null || wy == null) return false;
        if (!$gameTemp) return false;
        $gameTemp._worldMapFocusRequest = { x: Number(wx), y: Number(wy) };
        return true;
    }

    window.WorldMapView = {
        focusAt: focusWorldMapAt,
        // The M key's own toggle, exposed so the menu's world-map pocket can be
        // opened from somewhere other than the key: from the pockets page, and
        // from the quick list held open on the field (UI/QuickMainMenuLayout.js
        // through CustomMainMenuLayout's MAP_HOTKEY_ACTIONS). Without it that
        // pocket was the one voice of the menu with no way of being reached
        // except by pressing M.
        toggle: () => { autoOpenedForTravel = false; toggleMapState(); },
        requestFocusAt: requestWorldMapFocus,
        isMinimapVisible: () => isMinimapVisible(),
        setMinimapVisible: (v) => setMinimapVisible(v),
        // Stand the corner chart aside while a conversation portrait is drawn
        // over its corner, without touching the state the player chose.
        setConversationCover: (v) => setConversationCover(v),
        isConversationCovered: () => conversationCover,
        // The three minimap modes and the one the player picked.
        minimapModes: () => MINIMAP_MODES.slice(),
        minimapMode: () => minimapMode(),
        setMinimapMode: (m) => setMinimapMode(m),
        // A town the party just founded is a new name over a tile: the sprites
        // standing on the map now know nothing about it.
        refreshLabels: () => {
            destinationMarkersCache = null;
            sheetInvalidate();
            if (SceneManager._scene instanceof Scene_Map) {
                createCityLabelsContainer();
                refreshCityLabelSprites();
            }
        },
        // Every named thing on the sheet, in world-tile space. Lent out so a
        // caller does not have to rebuild the gazetteer to ask what is where.
        pins: () => sheetPins().slice(),
        // What the game knows about one world square, as label/value rows.
        readSquare: (x, y) => squareReadout(x, y),
        // The party's own marks. Setting an empty text takes the mark away.
        notes: () => worldNotes().slice(),
        setNote: (x, y, text) => { setNoteAt(x, y, text); sheetInvalidate(); },
        // Which nation's territory is washed over, by Countries.json id.
        highlightCountry: (id) => {
            highlightCountryId = Number(id) || 0;
            fsOverlayKey = null;
            refreshWorldMapDisplay();
        },
    };

    // The towns the party founded on Earth, as world-map tiles (world squares
    // 0-255, the same space every other pin on the sheet is drawn in).
    function foundedTownPins() {
        const TF = window.TownFounding;
        if (!TF || !TF.list) return [];
        try {
            return TF.list().filter(t => !t.planet);
        } catch (e) {
            return [];
        }
    }

    function centerOnCurrentCoordinates() {
        // Bologna fullscreen: center on player position within the assembled cell grid
        if ($gameMap && $gameMap.mapId() === BOLOGNA_MAP_ID) {
            const bState = $gameSystem._bologna;
            if (bState) {
                const px = (bState.col - BOLOGNA_COL_MIN) * BOLOGNA_CELL_PX + ($gamePlayer.x / 256) * BOLOGNA_CELL_PX;
                const py = (bState.row - BOLOGNA_ROW_MIN) * BOLOGNA_CELL_PX + ($gamePlayer.y / 256) * BOLOGNA_CELL_PX;
                panX = Graphics.width / 2 - (px * zoomScale);
                panY = Graphics.height / 2 - (py * zoomScale);
            }
            return;
        }

        // GalaxySim alien planet fullscreen: center on the current landing-grid
        // cell within the planet's own (much smaller) bitmap coordinate space.
        if (isOffEarthView()) {
            const grid = alienGridInfo();
            if (grid) {
                const px = (grid.gx + 0.5) * ALIEN_GRID_CELL_PX;
                const py = (grid.gy + 0.5) * ALIEN_GRID_CELL_PX;
                panX = Graphics.width / 2 - (px * zoomScale);
                panY = Graphics.height / 2 - (py * zoomScale);
            }
            return;
        }

        let centerX, centerY;

        // A pending focus request wins once, then the map goes back to following
        // the player on the next manual open.
        if (focusOverride) {
            centerX = focusOverride.x;
            centerY = focusOverride.y;
            focusOverride = null;
        } else if ($gameMap && $gameMap.mapId() === 315) {
            // If on world map (315), use actual player position
            const playerX = $gamePlayer.x || 0;
            const playerY = $gamePlayer.y || 0;
            centerX = playerX;
            centerY = playerY;
        } else {
            // Otherwise use saved / live world coordinates
            const worldPos = playerWorldPosition();
            centerX = worldPos.x;
            centerY = worldPos.y;
        }

        // Full screen grid is 12288x12288 (8x8 tiles of 1536x1536 pixels each)
        // World coords: 0-255 range maps to 0-12288 pixels (48 pixels per world unit)
        const mapPixelX = centerX * 48;
        const mapPixelY = centerY * 48;

        // Center on this position
        panX = Graphics.width / 2 - (mapPixelX * zoomScale);
        panY = Graphics.height / 2 - (mapPixelY * zoomScale);
    }

    // ------------------------------------------------------------------------
    // Drawing Primitives
    // ------------------------------------------------------------------------

    function drawSquare(ctx, x, y, color, size) {
        const half = size / 2;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x - half), Math.round(y - half), Math.round(size), Math.round(size));
    }
    
    function drawDot(ctx, x, y, color, radius) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, radius), 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(1, radius / 4);
        ctx.stroke();
        ctx.restore();
    }

    // Quest objectives are drawn as gold diamonds so they never read as a
    // teleport (green square) or a vehicle (dot).
    function drawDiamond(ctx, x, y, color, size) {
        const half = size / 2;
        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, size / 5);
        ctx.beginPath();
        ctx.moveTo(x, y - half);
        ctx.lineTo(x + half, y);
        ctx.lineTo(x, y + half);
        ctx.lineTo(x - half, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // One diamond per distinct quest colour sharing this tile, so two different
    // contracts pinned at the same spot don't merge into a single colour. Fans
    // out horizontally around the tile centre when there's more than one.
    function drawQuestTileDiamonds(ctx, x, y, tile, size) {
        const colors = (tile.colors && tile.colors.length) ? tile.colors : [questMarkerColor];
        const n = colors.length;
        const step = size * 0.85;
        const startX = x - ((n - 1) * step) / 2;
        for (let i = 0; i < n; i++) {
            drawDiamond(ctx, startX + i * step, y, colors[i], size);
        }
    }

    // Active quest objectives reduced to world tiles, one entry per tile. Every
    // marker's colour/icon comes from window.KanbanQuest (the single source for
    // "which quest is which colour" everywhere it's pinned - the board card, the
    // in-world compass in WorldMapReturn.js, and this sheet); falling back to
    // ProceduralQuests.questMarkers() directly keeps this sheet working even if
    // the kanban board plugin is ever missing.
    const WORLD_TILES = 256;
    function activeQuestMarkerList() {
        const kb = window.KanbanQuest;
        if (kb && typeof kb.activeMarkers === 'function') {
            try { return kb.activeMarkers(); } catch (e) { }
        }
        const api = window.ProceduralQuests;
        if (!api || typeof api.questMarkers !== 'function') return [];
        try { return api.questMarkers(); } catch (e) { return []; }
    }

    function getQuestMarkerTiles() {
        const byTile = new Map();
        for (const m of activeQuestMarkerList()) {
            if (m.wx == null || m.wy == null) continue;
            const key = m.wx + ',' + m.wy;
            let entry = byTile.get(key);
            if (!entry) { entry = { x: m.wx, y: m.wy, labels: [], colors: [], icons: [], qids: [] }; byTile.set(key, entry); }
            const step = m.multi ? ` ${m.step}/${m.stepCount}` : '';
            const label = m.label + step;
            if (!entry.labels.includes(label)) {
                entry.labels.push(label);
                entry.colors.push(m.color || questMarkerColor);
                entry.icons.push(m.icon || null);
            }
            if (m.qid && !entry.qids.includes(m.qid)) entry.qids.push(m.qid);
        }
        return Array.from(byTile.values());
    }

    // ------------------------------------------------------------------------
    // Quest marker interaction (fullscreen map)
    //
    // Hovering a marker shows the very post-it the quest log would show for it
    // (KanbanQuest.notePreview supplies both the markup and its stylesheet, so the
    // two can never drift); clicking one opens the log on that quest.
    // ------------------------------------------------------------------------
    let questTipEl = null;
    let questTipId = null;

    function removeQuestTip() {
        if (questTipEl) { questTipEl.remove(); questTipEl = null; }
        questTipId = null;
    }

    function showQuestTip(questId, screenX, screenY) {
        if (questTipId === questId && questTipEl) {
            positionQuestTip(screenX, screenY);
            return;
        }
        const preview = window.KanbanQuest && window.KanbanQuest.notePreview
            ? window.KanbanQuest.notePreview(questId) : null;
        if (!preview) { removeQuestTip(); return; }
        removeQuestTip();
        questTipEl = document.createElement('div');
        questTipEl.id = 'wm-quest-tip';
        questTipEl.style.cssText =
            'position:fixed; z-index:90; pointer-events:none; width:300px;';
        questTipEl.insertAdjacentHTML('beforeend', preview.html);
        document.body.appendChild(questTipEl);
        questTipId = questId;
        positionQuestTip(screenX, screenY);
    }

    function positionQuestTip(screenX, screenY) {
        if (!questTipEl) return;
        const pad = 16;
        const w = 300, h = questTipEl.offsetHeight || 180;
        let x = screenX + pad;
        let y = screenY + pad;
        if (x + w > window.innerWidth) x = screenX - w - pad;
        if (y + h > window.innerHeight) y = Math.max(0, screenY - h - pad);
        questTipEl.style.left = x + 'px';
        questTipEl.style.top = y + 'px';
    }

    // The marker under the cursor, or null. Screen space to bitmap space is the
    // inverse of the pan/zoom applied to the sprite.
    function questMarkerAtPointer() {
        const dims = fullscreenMapDims();
        if (!dims || !dims.w || !zoomScale) return null;
        const bx = (TouchInput.x - panX) / zoomScale;
        const by = (TouchInput.y - panY) / zoomScale;
        // Generous in bitmap pixels, because on a 12288px sheet a marker is tiny.
        const radius = Math.max(28, 22 / zoomScale);
        let best = null, bestD = Infinity;
        for (const qt of getQuestMarkerTiles()) {
            const qx = (qt.x / WORLD_TILES) * dims.w;
            const qy = (qt.y / WORLD_TILES) * dims.h;
            const d = Math.abs(qx - bx) + Math.abs(qy - by);
            if (d <= radius * 2 && d < bestD) { bestD = d; best = qt; }
        }
        return best;
    }

    function updateQuestMarkerInteraction() {
        if (currentMapState !== 3) { removeQuestTip(); return; }
        const hit = questMarkerAtPointer();
        if (!hit || !hit.qids || !hit.qids.length) { removeQuestTip(); return; }
        const qid = hit.qids[0];
        showQuestTip(qid, TouchInput.x, TouchInput.y);
        if (TouchInput.isTriggered()) {
            removeQuestTip();
            if (window.KanbanQuest && window.KanbanQuest.openAt && window.KanbanQuest.openAt(qid)) {
                SoundManager.playOk();
                TouchInput.clear();
            }
        }
    }

    // ------------------------------------------------------------------------
    // Off-screen quest markers (fullscreen world map)
    //
    // GTA-style: an objective panned out of view is not lost. It slides onto the
    // border of the screen as an arrow pointing at where it really is, and only
    // goes away once the map has been dragged far enough for the real gold
    // diamond to come into view. These live as screen-space sprites over the map
    // sprite, because the diamonds themselves are painted inside the world
    // bitmap, which is what the pan and the zoom move around.
    // ------------------------------------------------------------------------
    const EDGE_MARKER_MARGIN = 34;  // px between the screen border and the arrow
    const EDGE_MARKER_ARROW = 26;   // arrow sprite size
    let questEdgeContainer = null;
    let questEdgeKey = null;        // signature of the marker set the sprites show
    const questEdgeArrowBitmaps = new Map(); // colour -> cached triangle bitmap

    // A triangle pointing up (-Y); each marker rotates it toward its objective.
    // Cached per colour so every quest keeps its own tinted arrow.
    function edgeArrowBitmap(color) {
        const key = color || questMarkerColor;
        const cached = questEdgeArrowBitmaps.get(key);
        if (cached) return cached;
        const s = EDGE_MARKER_ARROW;
        const bmp = new Bitmap(s, s);
        const ctx = bmp.context;
        ctx.beginPath();
        ctx.moveTo(s / 2, 2);
        ctx.lineTo(s - 3, s - 4);
        ctx.lineTo(s / 2, s - 9);
        ctx.lineTo(3, s - 4);
        ctx.closePath();
        ctx.fillStyle = key;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        bmp.baseTexture.update();
        questEdgeArrowBitmaps.set(key, bmp);
        return bmp;
    }

    // Quest names next to the arrow, in a bitmap only as wide as the text so it
    // can be clamped against the screen edge without leaving a gap. Each line is
    // tinted with its own quest's colour.
    function edgeLabelSprite(labels, colors) {
        const lineH = labelFontSize + 4;
        const probe = new Bitmap(8, 8);
        probe.fontFace = 'GameFont, sans-serif';
        probe.fontSize = labelFontSize;
        probe.fontBold = true;
        let w = 24;
        for (const text of labels) {
            w = Math.max(w, Math.ceil(probe.measureTextWidth(text)) + 12);
        }
        if (probe.destroy) probe.destroy();

        const bmp = new Bitmap(w, lineH * labels.length + 4);
        bmp.fontFace = 'GameFont, sans-serif';
        bmp.fontSize = labelFontSize;
        bmp.fontBold = true;
        bmp.outlineWidth = 4;
        bmp.outlineColor = 'black';
        for (let i = 0; i < labels.length; i++) {
            bmp.textColor = (colors && colors[i]) || questMarkerColor;
            bmp.drawText(labels[i], 0, i * lineH, w, lineH, 'center');
        }
        const sprite = new Sprite(bmp);
        sprite.anchor.x = 0.5;
        return sprite;
    }

    function ensureQuestEdgeContainer() {
        if (!isLiveSprite(worldMapSprite) || !worldMapSprite.parent) return null;
        const parent = worldMapSprite.parent;
        // Destroyed along with the scene it hung on: drop it and rebuild, or the
        // arrows below would be positioned through a null transform.
        if (questEdgeContainer && !isLiveSprite(questEdgeContainer)) {
            questEdgeContainer = null;
            questEdgeKey = null;
        }
        if (!questEdgeContainer) {
            questEdgeContainer = new Sprite();
            questEdgeContainer._groups = [];
        }
        // Sits directly above the map sprite, and follows it if the scene rebuilt.
        if (questEdgeContainer.parent !== parent) {
            if (questEdgeContainer.parent) {
                questEdgeContainer.parent.removeChild(questEdgeContainer);
            }
            parent.addChildAt(questEdgeContainer, parent.children.indexOf(worldMapSprite) + 1);
        }
        return questEdgeContainer;
    }

    function removeQuestEdgeMarkers() {
        if (isLiveSprite(questEdgeContainer) && questEdgeContainer.parent) {
            questEdgeContainer.parent.removeChild(questEdgeContainer);
        }
        questEdgeContainer = null;
        questEdgeKey = null;
    }

    function hideQuestEdgeMarkers() {
        if (!questEdgeContainer) return;
        for (const group of questEdgeContainer._groups) group.visible = false;
    }

    // Rebuilt only when the marker set itself changes; panning just moves sprites.
    function questEdgeSignature(tiles) {
        return tiles.map(t => t.x + ',' + t.y + ':' + t.labels.join('|')).join(';');
    }

    function buildQuestEdgeMarkers(tiles) {
        const container = ensureQuestEdgeContainer();
        if (!container) return null;
        container.removeChildren();
        container._groups = [];
        for (const tile of tiles) {
            const group = new Sprite();
            const arrow = new Sprite(edgeArrowBitmap(tile.colors && tile.colors[0]));
            arrow.anchor.x = 0.5;
            arrow.anchor.y = 0.5;
            const label = edgeLabelSprite(tile.labels, tile.colors);
            group.addChild(arrow);
            group.addChild(label);
            group._arrow = arrow;
            group._label = label;
            group._tile = tile;
            group.visible = false;
            container.addChild(group);
            container._groups.push(group);
        }
        return container;
    }

    function updateQuestEdgeMarkers() {
        // Only the world sheet paints quest diamonds; the Bologna and alien-planet
        // fullscreens are other coordinate spaces entirely.
        if (currentMapState !== 3 || !isLiveSprite(worldMapSprite) ||
            !$gameMap || $gameMap.mapId() === BOLOGNA_MAP_ID || isOffEarthView()) {
            hideQuestEdgeMarkers();
            return;
        }
        const dims = fullscreenMapDims();
        if (!dims || !dims.w || !dims.h || !zoomScale) { hideQuestEdgeMarkers(); return; }

        const tiles = getQuestMarkerTiles();
        const key = questEdgeSignature(tiles);
        if (key !== questEdgeKey) {
            if (!buildQuestEdgeMarkers(tiles)) return;
            questEdgeKey = key;
        }
        const container = ensureQuestEdgeContainer();
        if (!container) return;

        const cx = Graphics.width / 2;
        const cy = Graphics.height / 2;
        const halfW = Math.max(1, cx - EDGE_MARKER_MARGIN);
        const halfH = Math.max(1, cy - EDGE_MARKER_MARGIN);

        for (const group of container._groups) {
            const tile = group._tile;
            const sx = panX + (tile.x / WORLD_TILES) * dims.w * zoomScale;
            const sy = panY + (tile.y / WORLD_TILES) * dims.h * zoomScale;

            // Inside the viewport (minus the band the arrows occupy): the real
            // diamond is doing the job, so the border marker steps aside.
            if (sx >= EDGE_MARKER_MARGIN && sx <= Graphics.width - EDGE_MARKER_MARGIN &&
                sy >= EDGE_MARKER_MARGIN && sy <= Graphics.height - EDGE_MARKER_MARGIN) {
                group.visible = false;
                continue;
            }

            const dx = sx - cx;
            const dy = sy - cy;
            if (!dx && !dy) { group.visible = false; continue; }

            // Push the direction out until it hits the border box.
            const ratio = Math.min(
                Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity,
                Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity);
            const ex = cx + dx * ratio;
            const ey = cy + dy * ratio;

            group.visible = true;
            group._arrow.x = ex;
            group._arrow.y = ey;
            group._arrow.rotation = Math.atan2(dy, dx) + Math.PI / 2;

            // The name goes on whichever side of the arrow has room, and never
            // hangs off the screen it was just clamped to.
            const label = group._label;
            const lw = label.bitmap.width / 2;
            label.x = Math.min(Graphics.width - lw - 4, Math.max(lw + 4, ex));
            label.y = ey < cy
                ? ey + EDGE_MARKER_ARROW / 2 + 2
                : ey - EDGE_MARKER_ARROW / 2 - 2 - label.bitmap.height;
        }
    }

    // ------------------------------------------------------------------------
    // Destination names on the zoomed minimap
    // ------------------------------------------------------------------------
    // The zoomed views marked a town with a bare green square, which said that
    // something was there but never what. Destinations.json is the game's
    // gazetteer: every named place and the world square it sits on, so the
    // names are read straight off it (and off the teleport events on map 315,
    // which are those same places placed as events).

    const MINIMAP_NAME_FONT = 11;
    const MINIMAP_NAME_COLOR = '#FFFFFF';

    let destinationMarkersCache = null;

    // [{ x, y, name }] in world-tile space (0-255), one per catalogued place.
    function getDestinationMarkers() {
        if (destinationMarkersCache) return destinationMarkersCache;
        const dest = window.WorkSystem && window.WorkSystem.Destinations;
        // DataService registers the gazetteer on boot; before that, answer
        // empty without caching so the list is built once it exists.
        if (!dest) return [];
        const out = [];
        for (const key of Object.keys(dest)) {
            const data = dest[key];
            const base = data && data.base;
            if (!base || !Number.isFinite(base.x) || !Number.isFinite(base.y)) continue;
            // The key travels with the name: the readable label is what the
            // sheet writes, but the travel overlay books by the gazetteer key.
            out.push({ x: base.x, y: base.y, key: key, name: destinationLabel(key, data) });
        }
        destinationMarkersCache = out;
        return out;
    }

    // Readable name of a place, from its Destinations.json key.
    function destinationLabel(key, data) {
        if (window.WorkSystem && window.WorkSystem.destinationName) {
            return window.WorkSystem.destinationName(key);
        }
        return (data && data.name) || key;
    }

    // "Teleport - Antwerpen" / "teleport Antwerpen" -> the readable place name.
    function teleportEventLabel(eventName) {
        const key = String(eventName || '')
            .replace(/^teleport\s*/i, '').replace(/^-\s*/, '').trim();
        return key ? destinationLabel(key, null) : '';
    }

    // Names are centred under their marker and kept inside the bitmap. A name
    // that would land on one already drawn is dropped: the minimap is scaled
    // and a pile of overlapping town names reads as noise.
    function drawMinimapNames(ctx, entries, bitmapWidth, bitmapHeight, scale = 1) {
        if (!entries.length) return;
        const fontSize = Math.round(MINIMAP_NAME_FONT * scale);
        ctx.save();
        ctx.font = `bold ${fontSize}px GameFont, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(2, Math.round(3 * scale));
        const taken = [];
        for (const entry of entries) {
            if (!entry.name) continue;
            const halfW = ctx.measureText(entry.name).width / 2 + 1 * scale;
            const cx = Math.max(halfW + 1 * scale, Math.min(bitmapWidth - halfW - 1 * scale, entry.x));
            let ty = entry.y + 5 * scale;
            if (ty + fontSize > bitmapHeight - 14 * scale) ty = entry.y - (6 * scale) - fontSize;
            if (ty < 1) continue;
            const box = { l: cx - halfW, r: cx + halfW, t: ty, b: ty + fontSize + 1 * scale };
            if (taken.some(o => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) continue;
            taken.push(box);
            ctx.strokeText(entry.name, cx, ty);
            ctx.fillStyle = entry.color || MINIMAP_NAME_COLOR;
            ctx.fillText(entry.name, cx, ty);
        }
        ctx.restore();
    }

    function drawLabel(ctx, x, y, text, color, sizePx) {
        const px = sizePx || labelFontSize;
        ctx.save();
        ctx.font = `bold ${px}px GameFont, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // Text Outline (Stroke)
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(3, px / 5);
        ctx.strokeText(text, x + px * 0.6, y); // Offset slightly to right of dot

        // Text Fill
        ctx.fillStyle = color || 'white';
        ctx.fillText(text, x + px * 0.6, y);
        ctx.restore();
    }

    function drawCoordinates(ctx, bitmapWidth, bitmapHeight, coordX, coordY, playerX, playerY, scale = 1) {
        let text = `${coordX}, ${coordY}`;

        // Only append local coordinates if we have them and not on map 315
        if (playerX !== undefined && playerY !== undefined && $gameMap.mapId() !== 315) {
            text += ` | ${playerX}, ${playerY}`;
        }

        const fontSize = Math.round(12 * scale);
        const padding = Math.round(6 * scale);
        const x = bitmapWidth - padding;
        const y = bitmapHeight - padding;

        ctx.save();
        ctx.font = `bold ${fontSize}px GameFont, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';

        // Text Outline (Stroke)
        ctx.strokeStyle = 'black';
        ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
        ctx.strokeText(text, x, y);

        // Text Fill
        ctx.fillStyle = 'white';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    function drawDetailedBlockGrid(ctx, bitmapWidth, bitmapHeight, proceduralZoom, tileScale, scale = 1) {
        // Draw grid lines for the detailed block view minimap
        // proceduralZoom: how many units are shown (e.g., 16 units)
        // tileScale: pixels per unit in the zoomed view

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = Math.max(1, Math.round(1 * scale));

        const pixelsPerUnit = (bitmapWidth / proceduralZoom);

        // Draw vertical grid lines
        for (let i = 0; i <= proceduralZoom; i++) {
            const x = Math.round(i * pixelsPerUnit);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, bitmapHeight);
            ctx.stroke();
        }

        // Draw horizontal grid lines
        for (let i = 0; i <= proceduralZoom; i++) {
            const y = Math.round(i * pixelsPerUnit);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(bitmapWidth, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    // GalaxySim alien-planet surface: the planet's unwrapped equirectangular
    // texture (same source/drawing routine as the in-orbit landing picker,
    // see GalaxySim_Overlay.js's showLandingGrid) scaled to destW x destH,
    // divided into its landing grid, with the player's current cell marked.
    // Returns null when GalaxySim isn't available or no planet is landed.
    function buildAlienPlanetBitmap(destW, destH, scale = 1) {
        const GS = window.GalaxySim;
        if (!GS || !GS.Renderer3D || !GS.Renderer3D.drawPlanetGrid ||
            !GS.getAlienGridInfo || !GS.getAlienGridTextureCanvas) return null;
        const grid = alienGridInfo();
        const textureCanvas = GS.getAlienGridTextureCanvas();
        if (!grid || !textureCanvas) return null;

        const bitmap = new Bitmap(destW, destH);
        bitmap.context.imageSmoothingEnabled = true;
        bitmap.context.imageSmoothingQuality = 'high';
        bitmap.smooth = true;
        GS.Renderer3D.drawPlanetGrid(bitmap.context, {
            textureCanvas,
            destW, destH,
            gridW: grid.w, gridH: grid.h,
            playerCell: { gx: grid.gx, gy: grid.gy },
        });
        // drawPlanetGrid outlines the whole landing cell; the dot inside it says
        // where in that cell the party actually is, so walking a cell moves it
        // gradually instead of only when the outline jumps to the next one.
        const pos = playerSquarePosition();
        const cellW = destW / Math.max(1, grid.w);
        const cellH = destH / Math.max(1, grid.h);
        drawDot(bitmap.context,
            (grid.gx + pos.fracX) * cellW,
            (grid.gy + pos.fracY) * cellH,
            playerColor, 4 * scale);
        drawCoordinates(bitmap.context, destW, destH, grid.gx, grid.gy, $gamePlayer.x, $gamePlayer.y, scale);
        bitmap.baseTexture.update();
        return bitmap;
    }

    function isAlienPlanetSurface() {
        return $gameMap && $gameMap.mapId() === 636 &&
            !!(window.GalaxySim && window.GalaxySim.isAlienSurface && window.GalaxySim.isAlienSurface());
    }

    // Earth's chart is 64 photographed tiles of one planet. Anywhere off that
    // planet it is simply the wrong picture, so the landing grid is drawn for
    // the whole trip and not only while the open surface (map 636) is loaded: a
    // cave, a wreck or a building on another world used to fall through to
    // row-1-column-1 of Earth and read as a coastline nobody was standing on.
    function isOffEarthView() {
        if (isAlienPlanetSurface()) return true;
        const GS = window.GalaxySim;
        return !!(GS && GS.isOffEarth && GS.isOffEarth());
    }

    // The landing grid to chart, on the surface or under it.
    function alienGridInfo() {
        const GS = window.GalaxySim;
        if (!GS) return null;
        if (GS.getAlienGridInfo) {
            const live = GS.getAlienGridInfo();
            if (live) return live;
        }
        return (GS.getOffEarthGridInfo && GS.getOffEarthGridInfo()) || null;
    }

    // ------------------------------------------------------------------------
    // Core Logic
    // ------------------------------------------------------------------------

    // The M key is the world map key: it opens the zoomable map and, pressed
    // again, closes it back to whatever the minimap was doing. It no longer
    // cycles the minimap on and off - that lives in the travel page selector.
    // ONE KEY, ONE TOGGLE, PER FRAME.
    //
    // The M key is read in two places: here, and by the menu's field hotkey
    // scan (UI/CustomMainMenuLayout.js, whose world_map action calls straight
    // back into WorldMapView.toggle - "the same call the key makes, not a
    // second way of opening it"). Input.isTriggered stays true for the whole
    // frame, so BOTH of them fire on the press, and the chart was opened and
    // shut again before a single frame was drawn.
    //
    // It used to survive that: the key cycled three states, so two calls landed
    // on a different one and the double-fire read as a quirk. A strict two-state
    // toggle lands exactly back where it started, and the key looked dead.
    //
    // Rather than pick which of the two readers to silence - and leave the next
    // one to rediscover this - the toggle itself refuses to run twice in the
    // same frame. Whichever reader gets there first wins.
    let lastToggleFrame = -1;

    function toggleMapState() {
        const frame = (typeof Graphics !== 'undefined' && Graphics.frameCount) || 0;
        if (frame === lastToggleFrame) return;
        lastToggleFrame = frame;

        // Off Earth the world sheet is the wrong picture of the wrong planet.
        // The key still means "show me where I am and where I could go", and
        // out there that is the landing grid: the same squares the ship set
        // down on, picked the same way. Orbiting Earth the sheet is right
        // again, and opens as a sheet (sheetTravelTransport refuses to book
        // anything from up there).
        if (currentMapState !== 3 && spaceRoute() === 'landing' && openLandingGridInstead()) {
            return;
        }

        if (currentMapState === 3) {
            currentMapState = savedMinimapState();
            clearFullscreenCache();
            destroyChrome();
            focusTileHint = null;
        } else {
            currentMapState = 3;
            resetZoom();
            clearFullscreenCache(); // drop the streamed layer so markers redraw
        }

        // The fullscreen map is never persisted: _minimapState stays the corner
        // minimap's own state, so closing the map (or a transfer) restores it.
        refreshWorldMapDisplay();
    }

    // ------------------------------------------------------------------------
    // MINIMAP MODE
    // ------------------------------------------------------------------------
    // The corner minimap is not a plain on/off any more: it has three modes,
    // kept in the config so they survive a save.
    //   off        never drawn
    //   exploring  drawn only where the party is exploring unknown ground: a
    //              procedural map, or the landing grid of a planet. The default,
    //              because an authored town has nothing to read off the chart.
    //   always     drawn wherever the map allows it
    const MINIMAP_MODES = ['off', 'exploring', 'always'];
    const DEFAULT_MINIMAP_MODE = 'exploring';

    function minimapMode() {
        const value = ConfigManager && ConfigManager.minimapMode;
        return MINIMAP_MODES.includes(value) ? value : DEFAULT_MINIMAP_MODE;
    }

    function setMinimapMode(mode) {
        ConfigManager.minimapMode = MINIMAP_MODES.includes(mode) ? mode : DEFAULT_MINIMAP_MODE;
        ConfigManager.save();
        refreshWorldMapDisplay();
    }

    // Is the party out exploring? The procedural map (map 636) is the one map
    // the generator builds, on Earth and on an alien landing grid alike, so it
    // answers for both; GalaxySim is asked as well for a planetside scene that
    // is not on that map.
    function isExploringContext() {
        const procId = (window.WorldMapReturn && window.WorldMapReturn.procMapId) || 636;
        if ($gameMap && $gameMap.mapId() === procId) return true;
        return !!(window.GalaxySim && window.GalaxySim.isAlienSurface &&
                  window.GalaxySim.isAlienSurface());
    }

    // Does the current mode let the corner minimap be drawn here at all?
    function modeAllowsMinimap() {
        const mode = minimapMode();
        if (mode === 'off') return false;
        if (mode === 'always') return true;
        return isExploringContext();
    }

    const _ConfigManager_makeData_minimap = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData_minimap.call(this);
        config.minimapMode = minimapMode();
        return config;
    };

    const _ConfigManager_applyData_minimap = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData_minimap.call(this, config);
        this.minimapMode = MINIMAP_MODES.includes(config.minimapMode)
            ? config.minimapMode : DEFAULT_MINIMAP_MODE;
    };

    // Generated ground reads itself out: on a procedural map, surface or
    // underground, and on a planet's landing grid, the corner minimap is up
    // from the moment the party arrives rather than waiting to be switched on.
    // Only an explicit hide (the options row, the travel selector, the plugin
    // command) turns that default off, and it is remembered as such.
    function defaultMinimapState() {
        if (permanentMinimap) return 1;
        if ($gameSystem && $gameSystem._minimapUserHidden) return 0;
        return (modeAllowsMinimap() && isExploringContext()) ? 1 : 0;
    }

    // The minimap state the map falls back to when the fullscreen map closes.
    function savedMinimapState() {
        if ($gameSystem && typeof $gameSystem._minimapState === 'number' &&
            $gameSystem._minimapState > 0 && $gameSystem._minimapState < 3) {
            return $gameSystem._minimapState;
        }
        return defaultMinimapState();
    }

    // The travel page's minimap selector: show or hide the corner minimap
    // without touching the fullscreen map.
    function setMinimapVisible(visible) {
        // Asking for the minimap while the mode says never is a request for the
        // mode to change too; 'exploring' is left alone, it is still a yes.
        if (visible && minimapMode() === 'off') {
            ConfigManager.minimapMode = 'always';
            ConfigManager.save();
        } else if (!visible) {
            ConfigManager.minimapMode = 'off';
            ConfigManager.save();
        }
        currentMapState = visible
            ? (($gameSystem && $gameSystem._lastActiveMinimapState) || 1)
            : 0;
        if ($gameSystem) {
            $gameSystem._minimapState = currentMapState;
            $gameSystem._minimapUserHidden = !visible;
            if (currentMapState > 0) $gameSystem._lastActiveMinimapState = currentMapState;
        }
        refreshWorldMapDisplay();
    }

    function isMinimapVisible() {
        if (!modeAllowsMinimap()) return false;
        // The fullscreen map is not the minimap: while it is up the selector
        // still speaks for the corner map the party had before it opened.
        if (currentMapState === 3) return savedMinimapState() > 0;
        return currentMapState === 1 || currentMapState === 2;
    }

    // A two-sided conversation stands the party's own portrait down the left of
    // the screen, over the very corner the chart is drawn in. While one is up
    // the chart gives way to it; it is put back the moment the busts leave.
    // Raised and dropped by NPC/DialogueSystem's BustManager.
    let conversationCover = false;

    function setConversationCover(on) {
        const want = !!on;
        if (want === conversationCover) return;
        conversationCover = want;
        refreshWorldMapDisplay();
    }

    function refreshWorldMapDisplay() {
        createWorldMapSprite();
        if (!isLiveSprite(worldMapSprite)) return;

        if (currentMapState === 0 || (currentMapState !== 3 && !modeAllowsMinimap())) {
            worldMapSprite.visible = false;
            if (fsLayer) fsLayer.visible = false;
            return;
        }

        // The fullscreen map is opened deliberately and is not the corner chart:
        // only the corner one steps aside for a portrait.
        if (conversationCover && currentMapState !== 3) {
            worldMapSprite.visible = false;
            if (fsLayer) fsLayer.visible = false;
            return;
        }

        // We only hard-check worldMapBitmap for Fullscreen or Map 315.
        // If we are in Detail Mode (Map != 315), we load dynamic images.
        const isBologna = $gameMap && $gameMap.mapId() === BOLOGNA_MAP_ID;
        const isAlienPlanet = isOffEarthView();
        if (currentMapState === 3 && !isBologna && !isAlienPlanet && (!worldMapBitmap || !worldMapBitmap.isReady())) return;

        worldMapSprite.visible = true;

        if (currentMapState === 1 || currentMapState === 2) {
            // --- MINI MODE (High-Resolution Supersampled Rendering) ---
            if (fsLayer) fsLayer.visible = false;
            renderMiniMap();
            worldMapSprite.x = 10;
            worldMapSprite.y = Graphics.height - mapHeight - 10;
            worldMapSprite.scale.x = 1 / MINIMAP_SCALE;
            worldMapSprite.scale.y = 1 / MINIMAP_SCALE;
            worldMapSprite.opacity = paramOpacity;
        } else if (currentMapState === 3) {
            // --- FULLSCREEN ZOOM MODE ---
            renderFullscreenMap();
            worldMapSprite.x = panX;
            worldMapSprite.y = panY;
            worldMapSprite.scale.x = zoomScale;
            worldMapSprite.scale.y = zoomScale;
            worldMapSprite.opacity = 255;
        }
    }

    // ------------------------------------------------------------------------
    // Live Vehicle Fast-Travel Tracking
    // ------------------------------------------------------------------------

    function getTravelData() {
        return ($gameSystem && $gameSystem.getFastTravelData) ? $gameSystem.getFastTravelData() : null;
    }

    // True while a vehicle fast-travel timer is running AND we have captured the
    // world origin, i.e. the vehicle should be shown crossing the world map.
    function isVehicleTravelActive() {
        const data = getTravelData();
        return !!(data && data.timerActive && data.timerRemainingTime > 0 &&
            data.finalDestination && travelOrigin &&
            VEHICLE_TRANSPORTS.includes(data.timerTransport));
    }

    // Continuous 0..1 trip progress. Derived from the travel timer's own
    // remaining/duration (the same clock other systems display) rather than the
    // wall clock, so pausing for a menu/dialog does not desync the vehicle dot.
    function getTravelProgress(data) {
        if (!data || !data.timerDuration) return 0;
        let p;
        if (typeof data.timerRemainingTime === 'number') {
            p = (data.timerDuration - data.timerRemainingTime) / data.timerDuration;
        } else {
            p = 0;
        }
        return Math.max(0, Math.min(1, p));
    }

    // Linearly interpolated world position {x, y} of the travelling vehicle.
    function getTravelVehiclePosition() {
        const data = getTravelData();
        if (!data || !travelOrigin || !data.finalDestination) return null;
        const p = getTravelProgress(data);
        return {
            x: travelOrigin.x + (data.finalDestination.x - travelOrigin.x) * p,
            y: travelOrigin.y + (data.finalDestination.y - travelOrigin.y) * p,
            progress: p
        };
    }

    // Full world overview minimap with the vehicle moving along the origin ->
    // destination line. Shown while the player is inside the vehicle during travel.
    function renderTravelMiniMap() {
        if (!worldMapBitmap || !worldMapBitmap.isReady()) return;

        const data = getTravelData();
        const pos = getTravelVehiclePosition();
        if (!data || !pos) return;

        const targetW = mapWidth * MINIMAP_SCALE;
        const targetH = mapHeight * MINIMAP_SCALE;

        const bitmap = new Bitmap(targetW, targetH);
        bitmap.context.imageSmoothingEnabled = true;
        bitmap.context.imageSmoothingQuality = 'high';
        bitmap.smooth = true;
        bitmap.blt(worldMapBitmap, 0, 0, worldMapBitmap.width, worldMapBitmap.height, 0, 0, targetW, targetH);
        const ctx = bitmap.context;

        // World coords are 0-255; map them across the full minimap.
        const toPx = wx => (wx / 256) * targetW;
        const toPy = wy => (wy / 256) * targetH;

        const ox = toPx(travelOrigin.x), oy = toPy(travelOrigin.y);
        const dx = toPx(data.finalDestination.x), dy = toPy(data.finalDestination.y);
        const vx = toPx(pos.x), vy = toPy(pos.y);

        ctx.save();
        // Full planned route (origin -> destination), dashed faint.
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 2 * MINIMAP_SCALE;
        ctx.setLineDash([4 * MINIMAP_SCALE, 3 * MINIMAP_SCALE]);
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(dx, dy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distance already covered (origin -> current), solid bright.
        ctx.strokeStyle = '#FFD24A';
        ctx.lineWidth = 2 * MINIMAP_SCALE;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(vx, vy);
        ctx.stroke();
        ctx.restore();

        // Origin and destination markers.
        drawSquare(ctx, ox, oy, '#AAAAAA', 5 * MINIMAP_SCALE);
        drawSquare(ctx, dx, dy, '#00FF00', 6 * MINIMAP_SCALE);

        // Moving vehicle dot, coloured by transport.
        const vColor = data.timerTransport === 'camper' ? shipColor
            : data.timerTransport === 'carsharing' ? boatColor
            : playerColor;
        drawDot(ctx, vx, vy, vColor, 5 * MINIMAP_SCALE);

        // Destination name + current interpolated world coordinates.
        if (data.timerDestination) {
            drawLabel(ctx, dx, dy, String(data.timerDestination), 'white', labelFontSize * MINIMAP_SCALE);
        }
        drawCoordinates(ctx, targetW, targetH, Math.round(pos.x), Math.round(pos.y), undefined, undefined, MINIMAP_SCALE);

        setWorldMapSpriteBitmap(bitmap);
    }

    // Render Logic for Mini Map
    // Teleport events are static map data, so the list only changes on map load.
    // Cache it keyed by mapId to avoid regex-testing every event each redraw.
    let teleportEventsCache = null;
    let teleportEventsCacheMapId = -1;
    function getTeleportEvents() {
        const mapId = $gameMap.mapId();
        if (teleportEventsCacheMapId !== mapId || !teleportEventsCache) {
            teleportEventsCache = $gameMap.events().filter(ev => {
                if (!ev || !ev.event()) return false;
                return /^teleport/i.test(ev.event().name || "");
            });
            teleportEventsCacheMapId = mapId;
        }
        return teleportEventsCache;
    }

    function renderMiniMap() {
        const mapId = $gameMap.mapId();

        // While travelling inside a vehicle, replace the local detail view with a
        // full world overview that animates the vehicle moving to its destination.
        if (mapId !== 315 && isVehicleTravelActive()) {
            renderTravelMiniMap();
            return;
        }
        const targetW = mapWidth * MINIMAP_SCALE;
        const targetH = mapHeight * MINIMAP_SCALE;

        // 1. If on World Map (315), show a zoomed-in view around the player
        if (mapId === 315) {
            if (!worldMapBitmap || !worldMapBitmap.isReady()) return;
            // A refresh mid-transfer onto 315 can run before $dataMap is populated.
            if (!$dataMap) return;

            const bitmap = new Bitmap(targetW, targetH);
            bitmap.context.imageSmoothingEnabled = true;
            bitmap.context.imageSmoothingQuality = 'high';
            bitmap.smooth = true;

            if (currentMapState === 1) {
                // --- ZOOMED MINIMAP ---
                const mw = $dataMap.width;
                const mh = $dataMap.height;
                const zoomTiles = (proceduralZoomLevel || 16) * 4; // Show 4x more area on world map
                
                const playerX = $gamePlayer.x;
                const playerY = $gamePlayer.y;

                // Calculate source rect in world map pixels
                const pxPerTileX = worldMapBitmap.width / mw;
                const pxPerTileY = worldMapBitmap.height / mh;

                const halfZoom = zoomTiles / 2;
                const srcXInTiles = Math.max(0, Math.min(mw - zoomTiles, playerX - halfZoom));
                const srcYInTiles = Math.max(0, Math.min(mh - zoomTiles, playerY - halfZoom));

                bitmap.blt(worldMapBitmap,
                    srcXInTiles * pxPerTileX, srcYInTiles * pxPerTileY,
                    zoomTiles * pxPerTileX, zoomTiles * pxPerTileY,
                    0, 0, targetW, targetH);

                const context = bitmap.context;

                // Draw player relative to cropped view
                const gridCellWidth = targetW / zoomTiles;
                const gridCellHeight = targetH / zoomTiles;
                const ppx = Math.floor(((playerX - srcXInTiles) / zoomTiles) * targetW) + gridCellWidth / 2;
                const ppy = Math.floor(((playerY - srcYInTiles) / zoomTiles) * targetH) + gridCellHeight / 2;

                drawDot(context, ppx, ppy, playerColor, 5 * MINIMAP_SCALE);

                // Draw teleport events relative to cropped view. The teleport
                // event list is precomputed per map (see getTeleportEvents) so we
                // don't regex-test every event on the map each redraw.
                const teleportEvents = getTeleportEvents();
                const placeNames = [];
                for (const ev of teleportEvents) {
                    if (!ev || ev._erased) continue;
                    if (ev.x >= srcXInTiles && ev.x < srcXInTiles + zoomTiles &&
                        ev.y >= srcYInTiles && ev.y < srcYInTiles + zoomTiles) {

                        const ex = Math.floor(((ev.x - srcXInTiles) / zoomTiles) * targetW) + gridCellWidth / 2;
                        const ey = Math.floor(((ev.y - srcYInTiles) / zoomTiles) * targetH) + gridCellHeight / 2;

                        drawSquare(context, ex, ey, '#00FF00', 6 * MINIMAP_SCALE);
                        placeNames.push({ x: ex, y: ey, name: teleportEventLabel(ev.event().name) });
                    }
                }
                // Names go on after every square so a marker never covers the
                // name of the place next to it, nearest the party first: where
                // two names collide the closer place is the one worth reading.
                placeNames.sort((a, b) =>
                    Math.hypot(a.x - ppx, a.y - ppy) - Math.hypot(b.x - ppx, b.y - ppy));
                drawMinimapNames(context, placeNames, targetW, targetH, MINIMAP_SCALE);

                // Active quest objectives inside the same cropped window.
                for (const qt of getQuestMarkerTiles()) {
                    if (qt.x < srcXInTiles || qt.x >= srcXInTiles + zoomTiles ||
                        qt.y < srcYInTiles || qt.y >= srcYInTiles + zoomTiles) continue;
                    const qx = Math.floor(((qt.x - srcXInTiles) / zoomTiles) * targetW) + gridCellWidth / 2;
                    const qy = Math.floor(((qt.y - srcYInTiles) / zoomTiles) * targetH) + gridCellHeight / 2;
                    drawQuestTileDiamonds(context, qx, qy, qt, 9 * MINIMAP_SCALE);
                }

                // Draw coordinates
                drawCoordinates(context, targetW, targetH, playerX, playerY, undefined, undefined, MINIMAP_SCALE);
            } else {
                // --- DEFAULT MINIMAP (FULL VIEW) ---
                bitmap.blt(worldMapBitmap, 0, 0, worldMapBitmap.width, worldMapBitmap.height, 0, 0, targetW, targetH);
                // Draw Entities Global
                drawEntitiesOnBitmap(bitmap, targetW, targetH, false, MINIMAP_SCALE);
            }

            setWorldMapSpriteBitmap(bitmap);
            return;
        }

        // 2. Bologna map (353) - show the whole current Bologna cell.
        // The cell tile is only 256px for 256 tiles, so the old 16-tile crop blew
        // a tiny 16px patch up to fill the minimap and looked like illegible mush.
        // Drawing the entire cell keeps the streets readable. State 1 (zoomed)
        // shows a generous window around the player; state 2 shows the full cell.
        if (mapId === BOLOGNA_MAP_ID) {
            const bState = $gameSystem._bologna;
            if (!bState) return;
            const { row, col } = bState;
            const tileBitmap = loadCachedTile(`img/worldmap/bologna/row-${row}-column-${col}.jpg`);
            if (!tileBitmap.isReady()) { tileBitmap.addLoadListener(refreshWorldMapDisplay); return; }
            const bitmap = new Bitmap(targetW, targetH);
            bitmap.context.imageSmoothingEnabled = true;
            bitmap.context.imageSmoothingQuality = 'high';
            bitmap.smooth = true;
            const playerX = $gamePlayer.x;
            const playerY = $gamePlayer.y;

            // In zoomed mode show a 96-tile window; otherwise the entire 256 cell.
            const viewTiles = (currentMapState === 1) ? 96 : BOLOGNA_MAP_TILES;
            const halfZoom = viewTiles / 2;
            const srcX = Math.max(0, Math.min(BOLOGNA_MAP_TILES - viewTiles, playerX - halfZoom));
            const srcY = Math.max(0, Math.min(BOLOGNA_MAP_TILES - viewTiles, playerY - halfZoom));
            const tileScale = tileBitmap.width / BOLOGNA_MAP_TILES;

            bitmap.blt(tileBitmap,
                srcX * tileScale, srcY * tileScale,
                viewTiles * tileScale, viewTiles * tileScale,
                0, 0, targetW, targetH);

            const context = bitmap.context;
            const px = ((playerX - srcX) / viewTiles) * targetW;
            const py = ((playerY - srcY) / viewTiles) * targetH;
            drawDot(context, px, py, playerColor, 5 * MINIMAP_SCALE);
            drawCoordinates(context, targetW, targetH, playerX, playerY, undefined, undefined, MINIMAP_SCALE);
            setWorldMapSpriteBitmap(bitmap);
            return;
        }

        // 2.5. GalaxySim alien planet surface (map 636, Alien* biome): show the
        // planet's own unwrapped landing grid instead of Earth's
        // row-N-column-M tiles, which don't exist for this coordinate space.
        if (isOffEarthView()) {
            const alienBitmap = buildAlienPlanetBitmap(targetW, targetH, MINIMAP_SCALE);
            if (alienBitmap) setWorldMapSpriteBitmap(alienBitmap);
            return;
        }

        // 3. If NOT on Map 315, show the Detailed Block (with procedural zoom)
        // Calculate which 8x8 block we are in. The world position carries the
        // fraction of the square already walked (see playerSquarePosition), so
        // the block view is addressed by the whole square and the dot by the
        // exact spot inside it.
        const worldPos = playerWorldPosition();
        const varX = Math.floor(worldPos.x);
        const varY = Math.floor(worldPos.y);

        // 256 units / 8 blocks = 32 units per block
        const col = Math.min(8, Math.max(1, Math.floor(varX / 32) + 1));
        const row = Math.min(8, Math.max(1, Math.floor(varY / 32) + 1));

        // Load the specific tile image: img/worldmap/row-X-column-Y
        const filename = `row-${row}-column-${col}`;  // i18n-ignore  asset path
        const tileBitmap = loadCachedTile(`img/worldmap/${filename}.jpg`);

        if (!tileBitmap.isReady()) {
            // If the tile isn't loaded yet, try again shortly
            tileBitmap.addLoadListener(refreshWorldMapDisplay);
            return;
        }

        const bitmap = new Bitmap(targetW, targetH);
        bitmap.context.imageSmoothingEnabled = true;
        bitmap.context.imageSmoothingQuality = 'high';
        bitmap.smooth = true;

        // Calculate local coordinates within the 32x32 block. These keep the
        // fraction: 12.25 is a quarter of the way across the block's 13th square.
        const localX = worldPos.x - (col - 1) * 32;
        const localY = worldPos.y - (row - 1) * 32;

        // Calculate the zoom-level view: center on player, show proceduralZoomLevel x proceduralZoomLevel area.
        // The window itself stays on whole squares, so the drawn grid keeps
        // lining up with the world squares it is meant to mark.
        const halfZoom = proceduralZoomLevel / 2;
        const srcX = Math.max(0, Math.min(32 - proceduralZoomLevel, Math.floor(localX) - halfZoom));
        const srcY = Math.max(0, Math.min(32 - proceduralZoomLevel, Math.floor(localY) - halfZoom));

        // Draw the zoomed portion of the tile
        const tileScale = tileBitmap.width / 32; // pixels per unit
        bitmap.blt(tileBitmap,
            srcX * tileScale, srcY * tileScale,
            proceduralZoomLevel * tileScale, proceduralZoomLevel * tileScale,
            0, 0, targetW, targetH);

        // Draw Player Relative to zoomed view
        const context = bitmap.context;

        // Draw grid for detailed block view
        drawDetailedBlockGrid(context, targetW, targetH, proceduralZoomLevel, tileScale, MINIMAP_SCALE);

        // Scale player position to zoomed minimap.
        // (localX - srcX) / proceduralZoomLevel gives position within the zoomed
        // area. localX is fractional and is not rounded to the cell: half a
        // square reads as 0.5 and lands the dot in the middle of its cell, which
        // is where a party off the procedural map is always reported.
        const gridCellWidth = targetW / proceduralZoomLevel;
        const gridCellHeight = targetH / proceduralZoomLevel;
        const px = ((localX - srcX) / proceduralZoomLevel) * targetW;
        const py = ((localY - srcY) / proceduralZoomLevel) * targetH;

        // Catalogued places inside the visible window. The block view is drawn
        // in world units, one unit per world square, so a destination's base
        // square is exactly the cell it is drawn in. Off the world map there
        // are no teleport events to read, so the gazetteer is the only source.
        const viewWorldX = (col - 1) * 32 + srcX;
        const viewWorldY = (row - 1) * 32 + srcY;
        const placeNames = [];
        for (const dest of getDestinationMarkers()) {
            if (dest.x < viewWorldX || dest.x >= viewWorldX + proceduralZoomLevel) continue;
            if (dest.y < viewWorldY || dest.y >= viewWorldY + proceduralZoomLevel) continue;
            const dx = Math.floor(((dest.x - viewWorldX) / proceduralZoomLevel) * targetW) + gridCellWidth / 2;
            const dy = Math.floor(((dest.y - viewWorldY) / proceduralZoomLevel) * targetH) + gridCellHeight / 2;
            drawSquare(context, dx, dy, '#00FF00', 6 * MINIMAP_SCALE);
            placeNames.push({ x: dx, y: dy, name: dest.name });
        }
        // Nearest the party first, so a crowded corner of the map keeps the
        // name of the place actually being walked towards.
        placeNames.sort((a, b) =>
            Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py));
        drawMinimapNames(context, placeNames, targetW, targetH, MINIMAP_SCALE);

        drawDot(context, px, py, playerColor, 5 * MINIMAP_SCALE);

        // Draw coordinates on bottom right, including local player position inside the square
        const localPos = (window.ProcStitch && window.ProcStitch.local && $gameMap.mapId() === PROC_MAP_ID)
            ? window.ProcStitch.local($gamePlayer.x, $gamePlayer.y)
            : { x: $gamePlayer.x, y: $gamePlayer.y };
        drawCoordinates(context, targetW, targetH, varX, varY, localPos.x, localPos.y, MINIMAP_SCALE);

        setWorldMapSpriteBitmap(bitmap);
    }

    // GalaxySim alien planet: unlike Earth's tile grid, the texture is a
    // single already-in-memory canvas, so it can be drawn synchronously with
    // no async load/cache machinery.
    function renderAlienPlanetFullscreen() {
        const grid = alienGridInfo();
        if (!grid) return;
        const w = Math.max(1, grid.w) * ALIEN_GRID_CELL_PX;
        const h = Math.max(1, grid.h) * ALIEN_GRID_CELL_PX;
        const bitmap = buildAlienPlanetBitmap(w, h);
        if (bitmap) setWorldMapSpriteBitmap(bitmap);
    }

    // ------------------------------------------------------------------------
    // Fullscreen world sheet: a streamed layer, not one giant bitmap
    //
    // The sheet is 8x8 JPEG segments of 1536px, i.e. 12288x12288. Compositing
    // that into a single Bitmap allocates a 603MB canvas and uploads it as one
    // texture on every repaint, which is what made opening the map take seconds
    // and, on a tight machine, fail outright.
    //
    // Instead the map is a container carried by worldMapSprite, so pan and zoom
    // still apply once, to the parent:
    //   - a base sprite showing img/pictures/worldmap, the whole world at 1/8
    //     resolution, already in memory for the minimap, so the map opens on the
    //     first frame with nothing to load;
    //   - detail segments streamed in only for the cells the viewport actually
    //     covers, and dropped again when they leave it;
    //   - one small overlay bitmap for the grid, the markers and their labels,
    //     scaled up to sheet space, redrawn only when what it draws changes.
    // ------------------------------------------------------------------------
    const WORLD_SHEET_PX = 12288;   // virtual pixel size of the whole sheet
    const FS_TILE_PX = 1536;
    const FS_GRID = 8;
    const FS_OVERLAY_PX = 3072;     // marker/grid layer, upscaled to sheet space
    const FS_MAX_TILES = 9;         // wider views read fine off the base image
    const FS_MAX_LOADING = 3;

    let fsLayer = null;       // container parented to worldMapSprite
    let fsBase = null;        // whole-world low resolution sprite
    let fsTileLayer = null;   // streamed detail segments
    let fsOverlay = null;     // grid + entity markers
    const fsTiles = new Map(); // "row,col" -> { sprite, bitmap }
    let fsLoading = 0;
    let fsGeneration = 0;     // invalidates in-flight tile loads
    let fsOverlayKey = null;
    let blankBitmap = null;

    // The sheet pixel size, whichever fullscreen view is up. Screen space math
    // used to read worldMapSprite.bitmap.width; the world sheet no longer has a
    // bitmap of its own, so it answers here instead.
    function fullscreenMapDims() {
        if (isLiveSprite(worldMapSprite) && worldMapSprite.bitmap &&
            worldMapSprite.bitmap !== blankBitmap && worldMapSprite.bitmap.width > 1) {
            return { w: worldMapSprite.bitmap.width, h: worldMapSprite.bitmap.height };
        }
        if (fsLayer) return { w: WORLD_SHEET_PX, h: WORLD_SHEET_PX };
        return null;
    }

    function dropFsTile(key) {
        const entry = fsTiles.get(key);
        if (!entry) return;
        fsTiles.delete(key);
        if (entry.sprite && entry.sprite.parent) entry.sprite.parent.removeChild(entry.sprite);
        if (entry.bitmap && typeof entry.bitmap.destroy === 'function') entry.bitmap.destroy();
    }

    // Tears the layer down without destroying anything shared: the base sprite
    // draws worldMapBitmap, which the minimap still needs, so the container is
    // only unparented and the bitmaps this layer owns are freed by hand.
    function destroyFullscreenLayer() {
        fsGeneration++;
        for (const key of Array.from(fsTiles.keys())) dropFsTile(key);
        if (fsBase && fsBase.parent) fsBase.parent.removeChild(fsBase);
        if (fsOverlay) {
            if (fsOverlay.parent) fsOverlay.parent.removeChild(fsOverlay);
            const bmp = fsOverlay.bitmap;
            fsOverlay.bitmap = null;
            if (bmp && typeof bmp.destroy === 'function') bmp.destroy();
        }
        if (fsLayer && fsLayer.parent) fsLayer.parent.removeChild(fsLayer);
        fsLayer = fsBase = fsTileLayer = fsOverlay = null;
        fsOverlayKey = null;
        fsLoading = 0;
    }

    // Everything the fullscreen map caches, dropped in one call.
    function clearFullscreenCache() {
        fullscreenBitmap = null;
        destroyFullscreenLayer();
        removeSheetLayer();
    }

    function ensureFullscreenLayer() {
        if (!isLiveSprite(worldMapSprite)) return null;
        if (fsLayer && isLiveSprite(fsLayer) && fsLayer.parent === worldMapSprite) return fsLayer;
        destroyFullscreenLayer();
        if (!worldMapBitmap || !worldMapBitmap.isReady()) return null;

        fsLayer = new PIXI.Container();

        fsBase = new Sprite(worldMapBitmap);
        const baseScale = WORLD_SHEET_PX / (worldMapBitmap.width || FS_TILE_PX);
        fsBase.scale.set(baseScale, baseScale);
        fsLayer.addChild(fsBase);

        fsTileLayer = new PIXI.Container();
        fsLayer.addChild(fsTileLayer);

        fsOverlay = new Sprite(new Bitmap(FS_OVERLAY_PX, FS_OVERLAY_PX));
        const overlayScale = WORLD_SHEET_PX / FS_OVERLAY_PX;
        fsOverlay.scale.set(overlayScale, overlayScale);
        fsLayer.addChild(fsOverlay);

        worldMapSprite.addChild(fsLayer);
        return fsLayer;
    }

    function loadFsTile(key) {
        const parts = key.split(',');
        const row = Number(parts[0]);
        const col = Number(parts[1]);
        const generation = fsGeneration;
        const bitmap = Bitmap.load(`img/worldmap/row-${row + 1}-column-${col + 1}.jpg`);
        const entry = { sprite: null, bitmap: bitmap };
        fsTiles.set(key, entry);
        fsLoading++;
        bitmap.addLoadListener(() => {
            fsLoading = Math.max(0, fsLoading - 1);
            // Dropped from the viewport, or the whole layer rebuilt, while this
            // segment was still decoding.
            if (generation !== fsGeneration || fsTiles.get(key) !== entry) return;
            if (!fsTileLayer || !isLiveSprite(fsTileLayer)) return;
            const sprite = new Sprite(bitmap);
            sprite.x = col * FS_TILE_PX;
            sprite.y = row * FS_TILE_PX;
            const s = FS_TILE_PX / (bitmap.width || FS_TILE_PX);
            sprite.scale.set(s, s);
            entry.sprite = sprite;
            fsTileLayer.addChild(sprite);
        });
    }

    // Load the segments the viewport covers, drop the ones it left. Cheap enough
    // to run every frame: a handful of divisions plus a set comparison.
    function updateFullscreenStreaming() {
        if (!fsLayer || !isLiveSprite(fsLayer) || !zoomScale) return;
        const cellOf = v => Math.max(0, Math.min(FS_GRID - 1, Math.floor(v / FS_TILE_PX)));
        const c0 = cellOf((-panX) / zoomScale);
        const c1 = cellOf((Graphics.width - panX) / zoomScale);
        const r0 = cellOf((-panY) / zoomScale);
        const r1 = cellOf((Graphics.height - panY) / zoomScale);

        const wanted = new Set();
        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) wanted.add(r + ',' + c);
        }
        for (const key of Array.from(fsTiles.keys())) {
            if (!wanted.has(key)) dropFsTile(key);
        }
        // Zoomed far enough out that a detail segment would be downsampled past
        // the base image anyway: leave the sheet on the base and load nothing.
        if (wanted.size > FS_MAX_TILES) {
            for (const key of Array.from(fsTiles.keys())) dropFsTile(key);
            return;
        }
        for (const key of wanted) {
            if (fsTiles.has(key)) continue;
            if (fsLoading >= FS_MAX_LOADING) break;
            loadFsTile(key);
        }
    }

    // What the overlay draws. Redrawing a 3072px canvas is not free, so it only
    // happens when one of these actually moved.
    function fullscreenOverlaySignature() {
        const world = playerWorldPosition();
        return [
            Math.round(world.x * 4), Math.round(world.y * 4),
            questEdgeSignature(getQuestMarkerTiles()),
            sheetPinSignature(),
            padSquare ? padSquare.x + ',' + padSquare.y : '',
            highlightCountryId,
            $gameMap ? $gameMap.mapId() : 0
        ].join('|');
    }

    function redrawFullscreenOverlay() {
        if (!fsOverlay || !fsOverlay.bitmap) return;
        const bitmap = fsOverlay.bitmap;
        bitmap.clear();
        const ctx = bitmap.context;
        // The picked nation's territory goes down first, under the grid and
        // under every pin: it is the ground being coloured, not a mark on it.
        drawCountryHighlight(ctx, FS_OVERLAY_PX, FS_OVERLAY_PX);
        // The overlay is drawn small and scaled up, so its markers and labels are
        // sized in overlay pixels: the ratio keeps them the size on screen they
        // were when the whole sheet was one 12288px bitmap.
        fsNameCollect = [];
        drawEntitiesOnBitmap(bitmap, FS_OVERLAY_PX, FS_OVERLAY_PX, true, FS_OVERLAY_PX / WORLD_SHEET_PX);
        setSheetNameEntries(fsNameCollect);
        fsNameCollect = null;
        drawPadCursor(ctx, FS_OVERLAY_PX);
    }


    // The controller's square, drawn over everything else on the sheet: it is
    // where the player is looking, and it has to read over a pin and over the
    // nation wash alike.
    function drawPadCursor(ctx, size) {
        if (!padSquare) return;
        const step = size / WORLD_TILES;
        const x = padSquare.x * step;
        const y = padSquare.y * step;
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = Math.max(2, step * 0.5);
        ctx.strokeRect(x, y, step, step);
        ctx.strokeStyle = 'rgba(255, 215, 106, 0.95)';
        ctx.lineWidth = Math.max(1, step * 0.25);
        ctx.strokeRect(x, y, step, step);
        ctx.restore();
    }

    // Render Logic for Fullscreen (8x8 grid of detailed tiles with async loading)
    function renderFullscreenMap() {
        if ($gameMap && $gameMap.mapId() === BOLOGNA_MAP_ID) {
            if (fsLayer) destroyFullscreenLayer();
            setSheetNameEntries([]);
            renderBolognaFullscreen();
            return;
        }
        if (isOffEarthView()) {
            if (fsLayer) destroyFullscreenLayer();
            setSheetNameEntries([]);
            renderAlienPlanetFullscreen();
            return;
        }
        // The world sheet is drawn by the streamed layer, not by a bitmap on the
        // sprite itself; the sprite keeps a 1x1 placeholder so its texture stays
        // valid while the layer under it does the drawing.
        if (!blankBitmap) blankBitmap = new Bitmap(1, 1);
        if (worldMapSprite.bitmap !== blankBitmap) setWorldMapSpriteBitmap(blankBitmap);
        if (!ensureFullscreenLayer()) return;
        fsLayer.visible = true;
        updateFullscreenStreaming();
        const key = fullscreenOverlaySignature();
        if (key !== fsOverlayKey) {
            fsOverlayKey = key;
            redrawFullscreenOverlay();
        }
    }

    function renderBolognaFullscreen() {
        const totalCols = BOLOGNA_COL_MAX - BOLOGNA_COL_MIN + 1; // 9
        const totalRows = BOLOGNA_ROW_MAX - BOLOGNA_ROW_MIN + 1; // 14
        const totalW = totalCols * BOLOGNA_CELL_PX;
        const totalH = totalRows * BOLOGNA_CELL_PX;
        if (!fullscreenBitmap) {
            const target = fullscreenBitmap = new Bitmap(totalW, totalH);
            let loaded = 0;
            const total = totalCols * totalRows;
            for (let r = BOLOGNA_ROW_MIN; r <= BOLOGNA_ROW_MAX; r++) {
                for (let c = BOLOGNA_COL_MIN; c <= BOLOGNA_COL_MAX; c++) {
                    (function(row, col) {
                        const tb = Bitmap.load(`img/worldmap/bologna/row-${row}-column-${col}.jpg`);
                        tb.addLoadListener(() => {
                            // Cache cleared while this tile was loading - drop stale blits.
                            if (fullscreenBitmap !== target) return;
                            const dx = (col - BOLOGNA_COL_MIN) * BOLOGNA_CELL_PX;
                            const dy = (row - BOLOGNA_ROW_MIN) * BOLOGNA_CELL_PX;
                            target.blt(tb, 0, 0, tb.width, tb.height, dx, dy, BOLOGNA_CELL_PX, BOLOGNA_CELL_PX);
                            loaded++;
                            if (loaded === total) {
                                const bState = $gameSystem._bologna;
                                if (bState) {
                                    const ctx2 = target.context;
                                    const cellPx = (bState.col - BOLOGNA_COL_MIN) * BOLOGNA_CELL_PX;
                                    const cellPy = (bState.row - BOLOGNA_ROW_MIN) * BOLOGNA_CELL_PX;
                                    const ppx = cellPx + ($gamePlayer.x / 256) * BOLOGNA_CELL_PX;
                                    const ppy = cellPy + ($gamePlayer.y / 256) * BOLOGNA_CELL_PX;
                                    drawDot(ctx2, ppx, ppy, playerColor, 8);
                                    target.baseTexture.update();
                                }
                                refreshWorldMapDisplay();
                            }
                        });
                    })(r, c);
                }
            }
        }
        setWorldMapSpriteBitmap(fullscreenBitmap);
    }

    function drawEntitiesOnBitmap(bitmap, targetW, targetH, showLabels, scale = 1) {
        // This function draws global entities.
        // If we are in MiniMap mode on a non-315 map, this function is NOT called.
        // This is only for Global Views (Map 315 OR Fullscreen).

        if (!$gameMap || !$gamePlayer) return;

        const context = bitmap.context;
        context.save();

        const mapId = $gameMap.mapId();

        // 1. Teleport Events (Only visible if actual events exist, i.e., on Map 315)
        // If we are on map 10 (Town), $gameMap.events are townspeople, so we generally won't find "teleport" names.
        const events = $gameMap.events();
        
        // We need the world map dimensions for reference
        const wTiles = $dataMap ? $dataMap.width : 256; 
        const hTiles = $dataMap ? $dataMap.height : 256;

        // The fullscreen sheet is 12288px wide and is drawn zoomed out, so a
        // marker and a name sized in bitmap pixels alone render a couple of
        // pixels tall and read as nothing at all. Everything named on the sheet
        // is sized off the sheet itself, the way the quest markers already are.
        const markerPx = Math.max(8 * scale, Math.round(targetW / 400));
        const namePx = Math.max(labelFontSize * scale, Math.round(targetW / 380));
        // Places and founded towns are named in one pass so their names never
        // pile up on each other.
        const placeNames = [];

        // 1. Every named thing the world knows about, from the one pin model
        // (see THE WORLD SHEET below). This used to be read off the teleport
        // EVENTS, which only exist on map 315: the chart opened from a cellar,
        // a camper or a dungeon was a blank sheet with a dot on it. The
        // gazetteer is on hand wherever the chart is opened, so the same places
        // are named from everywhere.
        //
        // Map 315 is still read for its events, because a teleport standing
        // somewhere the gazetteer does not list is a real door on real ground.
        const drawn = new Set();
        for (const pin of sheetPins()) {
            const px = Math.floor((pin.x / WORLD_TILES) * targetW);
            const py = Math.floor((pin.y / WORLD_TILES) * targetH);
            drawn.add(pin.x + ',' + pin.y);
            const color = SHEET_KIND_COLOR[pin.kind] || '#00FF00';
            if (pin.kind === 'note') {
                // The party's own hand: a diamond, so it never reads as a place
                // somebody else put there.
                drawDiamond(context, px, py, color, showLabels ? markerPx : 8 * scale);
            } else if (pin.kind === 'vault') {
                drawDot(context, px, py, color, showLabels ? markerPx * 0.6 : 4 * scale);
            } else {
                drawSquare(context, px, py, color, showLabels ? markerPx : 6 * scale);
            }
            if (showLabels && pin.name) {
                // A town the party raised, a square they wrote down and a mark
                // they left are named before any catalogued place, so a crowded
                // coast never drops the party's own work.
                const entry = { x: px, y: py, wx: pin.x, wy: pin.y, name: pin.name };
                if (pin.kind === 'place') placeNames.push(entry);
                else placeNames.unshift(entry);
            }
        }

        // 1a. Teleport events standing on ground the gazetteer does not list.
        for (const ev of events) {
            if (!ev || ev._erased) continue;
            const name = ev.event().name || "";
            if (/^teleport/i.test(name)) {
                const ex = Math.floor((ev.x / wTiles) * targetW);
                const ey = Math.floor((ev.y / hTiles) * targetH);
                if (drawn.has(ev.x + ',' + ev.y)) continue;

                drawSquare(context, ex, ey, '#00FF00', showLabels ? markerPx : 6 * scale);

                if (showLabels) {
                    // The event carries the Destinations.json key; the sheet
                    // shows that entry's readable name.
                    const labelText = teleportEventLabel(name);
                    if (labelText) placeNames.push({ x: ex, y: ey, wx: ev.x, wy: ev.y, name: labelText });
                }
            }
        }

        if (showLabels && placeNames.length) {
            // On the fullscreen sheet the names are not painted here at all:
            // this bitmap is upscaled four times and then zoomed, which is what
            // made every town name a smear. They are handed to the screen-space
            // label layer, which draws them at screen resolution.
            if (fsNameCollect) fsNameCollect.push(...placeNames);
            else drawMinimapNames(context, placeNames, targetW, targetH, namePx / MINIMAP_NAME_FONT);
        }

        // 1b. Active quest objectives. Always in world-tile space (0-255), which
        // is what the world image and the vars 43/44 coordinates both use.
        const questTiles = getQuestMarkerTiles();
        for (const qt of questTiles) {
            const qx = Math.floor((qt.x / WORLD_TILES) * targetW);
            const qy = Math.floor((qt.y / WORLD_TILES) * targetH);
            drawQuestTileDiamonds(context, qx, qy, qt, showLabels ? markerPx : 8 * scale);
            if (showLabels) {
                for (let i = 0; i < qt.labels.length; i++) {
                    const text = qt.labels[i];
                    const color = qt.colors[i] || questMarkerColor;
                    if (fsNameCollect) fsNameCollect.push({ wx: qt.x, wy: qt.y, name: text, color: color, line: i });
                    else drawLabel(context, qx, qy + i * (namePx + 4 * scale), text, color, namePx);
                }
            }
        }

        // 2. Vehicles, drawn from the position store rather than off the engine's
        // Game_Vehicle objects. A parked vehicle is only physically placed on the
        // map the party is standing on, so reading _mapId showed nothing at all
        // whenever this sheet was opened from anywhere but the world map. The
        // store knows the world square of every park, wherever it really is (a
        // procedural biome, an authored map, a cave), which is the same square the
        // vehicle is drawn on when the party does reach map 315. A vehicle left on
        // another planet has no Earth square and is not drawn.
        const dotSize = showLabels ? 6 * scale : 3 * scale;
        const VEHICLE_DOT_COLOR = { camper: shipColor, airship: airshipColor };
        const owned = (window.MergedVehicleSystem && window.MergedVehicleSystem.getOwnedVehicles)
            ? window.MergedVehicleSystem.getOwnedVehicles() : [];
        for (const v of owned) {
            if (!v.parkedMapId || v.parkedOnPlanet) continue;
            if (!(v.parkedWorldX > 0 || v.parkedWorldY > 0)) continue;
            const vx = Math.floor((v.parkedWorldX / WORLD_TILES) * targetW);
            const vy = Math.floor((v.parkedWorldY / WORLD_TILES) * targetH);
            drawDot(context, vx, vy, VEHICLE_DOT_COLOR[v.key] || boatColor, dotSize);
            if (showLabels) drawLabel(context, vx, vy, v.name, undefined, labelFontSize * scale);
        }

        // 3. Player Global Position
        let px, py;
        if (mapId === 315 && $dataMap) {
            // On actual map: use player XY
            const mw = $dataMap.width;
            const mh = $dataMap.height;
            px = Math.floor(($gamePlayer.x / mw) * targetW) + targetW / (mw * 2);
            py = Math.floor(($gamePlayer.y / mh) * targetH) + targetH / (mh * 2);
        } else {
            // Not on map 315: use the world position (0-256 range), fraction of
            // the square included, so crossing a procedural square walks the dot
            // over instead of teleporting it.
            const world = playerWorldPosition();
            px = (world.x / WORLD_TILES) * targetW;
            py = (world.y / WORLD_TILES) * targetH;
        }
        drawDot(context, px, py, playerColor, showLabels ? 8 * scale : 4 * scale);

        context.restore();
        bitmap.baseTexture.update();
    }

    // ------------------------------------------------------------------------
    // City Labels on Map (In-Game)
    // ------------------------------------------------------------------------

    // City Label Sprite Class
    //
    // PERFORMANCE: these are passive sprites. They carry no per-frame update()
    // of their own. The whole container is driven once per frame by
    // refreshCityLabelSprites(), which computes the shared viewport math a
    // single time instead of every sprite recomputing displayX/tileWidth and
    // doing its own divisions. The bitmap is still built lazily on first reveal.
    class Sprite_CityLabel extends Sprite {
        initialize(tileX, tileY, text) {
            super.initialize();
            this._tileX = tileX;
            this._tileY = tileY;
            this._text = text;
            this._bitmapCreated = false;
            this.z = 7; // Above characters
            this.visible = false; // hidden until positioned by the shared pass
        }

        createBitmap() {
            if (this._bitmapCreated) return;
            this.bitmap = new Bitmap(200, 40);
            this.bitmap.fontSize = labelFontSize;
            this.bitmap.fontFace = 'GameFont, sans-serif';
            this.bitmap.fontBold = true;
            this.bitmap.outlineWidth = 4;
            this.bitmap.outlineColor = 'black';
            this.bitmap.textColor = 'white';
            this.bitmap.drawText(this._text, 0, 0, 200, 40, 'center');
            this.anchor.x = 0.5;
            this.anchor.y = 1;
            this._bitmapCreated = true;
        }
    }

    // Single shared per-frame pass over every city label. Viewport math is done
    // once here, then reused as a cheap bounds test per sprite. Replaces the old
    // pattern of N sprites each calling $gameMap.displayX()/tileWidth() and
    // dividing every frame.
    function refreshCityLabelSprites() {
        if (!cityLabelsContainer || cityLabelsContainer.length === 0) return;
        if (!$gameMap) return;

        // The labels are children of the spriteset's tilemap. A scene change
        // rebuilds that tilemap and destroys them, so a label that is dead or
        // hanging off the previous tilemap is rebuilt against the live one instead
        // of being positioned (which would throw on its null transform).
        const tilemap = currentTilemap();
        const first = cityLabelsContainer[0];
        if (!isLiveSprite(first) || first.parent !== tilemap) {
            if (!tilemap) { removeCityLabels(); return; }
            createCityLabelsContainer();
            if (!cityLabelsContainer || cityLabelsContainer.length === 0) return;
        }

        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();
        const halfW = Graphics.width / tw / 2;
        const halfH = Graphics.height / th / 2;
        const centerX = $gameMap.displayX() + halfW;
        const centerY = $gameMap.displayY() + halfH;
        const bufferTiles = 5;
        const maxX = halfW + bufferTiles;
        const maxY = halfH + bufferTiles;

        for (let i = 0; i < cityLabelsContainer.length; i++) {
            const s = cityLabelsContainer[i];
            const isNear = Math.abs(s._tileX - centerX) <= maxX &&
                           Math.abs(s._tileY - centerY) <= maxY;
            if (!isNear) {
                if (s.visible) s.visible = false;
                continue;
            }
            if (!s._bitmapCreated) s.createBitmap();
            s.x = ($gameMap.adjustX(s._tileX) + 0.5) * tw;
            s.y = $gameMap.adjustY(s._tileY) * th;
            if (!s.visible) s.visible = true;
        }
    }

    function createCityLabelsContainer() {
        const tilemap = currentTilemap();
        if (!tilemap) return;

        // Remove old container if exists
        removeCityLabels();

        // Create labels array
        cityLabelsContainer = [];

        const events = $gameMap.events();
        for (const ev of events) {
            if (!ev || ev._erased) continue;
            const name = ev.event().name || "";

            // Match "Teleport - CityName" or "teleport CityName"
            const match = name.match(/^teleport\s*-?\s*(.+)/i);
            if (match) {
                // The event carries the Destinations.json key; the label on the
                // map is that entry's readable name.
                const key = match[1].trim();
                const cityName = window.WorkSystem?.destinationName
                    ? window.WorkSystem.destinationName(key) : key;
                if (cityName) {
                    const labelSprite = new Sprite_CityLabel(ev.x, ev.y, cityName);
                    tilemap.addChild(labelSprite);
                    cityLabelsContainer.push(labelSprite);
                }
            }
        }

        // Founded towns stand on map 315 without an event of their own, so
        // their names are written straight over their world square.
        if ($gameMap.mapId() === 315) {
            for (const town of foundedTownPins()) {
                const labelSprite = new Sprite_CityLabel(town.worldX, town.worldY, town.name);
                tilemap.addChild(labelSprite);
                cityLabelsContainer.push(labelSprite);
            }
        }

        // Labels another plugin has hung on this map (Bologna's shop signs).
        // They are tiles rather than events, so they cannot be discovered from
        // the event list, but they are drawn and scrolled by exactly the same
        // sprite and the same shared per-frame pass.
        if (extraLabelMapId === $gameMap.mapId()) {
            for (const label of extraLabels) {
                if (!label || !label.text) continue;
                const labelSprite = new Sprite_CityLabel(label.x, label.y, label.text);
                tilemap.addChild(labelSprite);
                cityLabelsContainer.push(labelSprite);
            }
        }
    }

    // ------------------------------------------------------------------------
    // Extra map labels (window.MapLabels)
    // ------------------------------------------------------------------------
    // The city-label sprite is the game's one way of writing a place name over
    // a map tile, so it is lent out rather than copied. Labels are stamped with
    // the map they belong to: map 353 is every Bologna cell and map 636 every
    // world square, so a stale list must never be drawn over the next place.
    let extraLabels = [];
    let extraLabelMapId = 0;

    window.MapLabels = {
        // list: [{ x, y, text }], all on `mapId`. Replaces whatever was set.
        set(mapId, list) {
            extraLabelMapId = Number(mapId) || 0;
            extraLabels = Array.isArray(list) ? list.slice() : [];
            if (SceneManager._scene instanceof Scene_Map && $gameMap &&
                $gameMap.mapId() === extraLabelMapId) {
                createCityLabelsContainer();
                refreshCityLabelSprites();
            }
        },
        clear() {
            extraLabelMapId = 0;
            extraLabels = [];
        },
    };

    // Kept for call-site compatibility. Previously this rebuilt the entire
    // container a second time right after createCityLabelsContainer() (a full
    // teardown + rebuild of every label sprite, twice per refresh). Now it just
    // positions the freshly built sprites once.
    function updateCityLabels() {
        refreshCityLabelSprites();
    }

    function removeCityLabels() {
        if (cityLabelsContainer) {
            for (const label of cityLabelsContainer) {
                // A label already destroyed with its scene has no transform and
                // no parent to detach from.
                if (isLiveSprite(label) && label.parent) {
                    label.parent.removeChild(label);
                }
            }
            cityLabelsContainer = null;
        }
    }

    // ------------------------------------------------------------------------
    // THE WORLD SHEET
    // ------------------------------------------------------------------------
    // -- THE SHEET'S SCREEN LAYER ---------------------------------------------
    //
    // Everything on the chart that has to stay LEGIBLE lives here rather than in
    // the overlay bitmap. That bitmap is 3072px for a 12288px sheet and is then
    // zoomed on top of that, so anything drawn into it is upscaled by up to
    // thirty-two and reads as a smear. This layer is a sibling of the map sprite
    // in screen space: its text is drawn once at screen resolution and only
    // moved as the sheet pans, so a town name is as sharp zoomed right in as it
    // is zoomed right out.
    let sheetLayer = null;
    let sheetGfx = null;
    let sheetNameSprites = [];
    let sheetNameEntries = [];
    let sheetNameKey = null;
    let sheetGfxKey = null;
    let fsNameCollect = null;           // set only while the overlay is redrawing

    const SHEET_NAME_PX = 15;

    function setSheetNameEntries(list) {
        sheetNameEntries = list || [];
        const key = sheetNameEntries.map(e => e.wx + ',' + e.wy + ':' + e.name).join(';');
        if (key === sheetNameKey) return;
        sheetNameKey = key;
        destroySheetNames();
    }

    function destroySheetNames() {
        for (const sprite of sheetNameSprites) {
            if (sprite.parent) sprite.parent.removeChild(sprite);
            if (sprite.bitmap && sprite.bitmap.destroy) sprite.bitmap.destroy();
        }
        sheetNameSprites = [];
    }

    function sheetNameSprite(entry) {
        const probe = new Bitmap(8, 8);
        probe.fontFace = 'GameFont, sans-serif';
        probe.fontSize = SHEET_NAME_PX;
        probe.fontBold = true;
        const w = Math.ceil(probe.measureTextWidth(entry.name)) + 16;
        if (probe.destroy) probe.destroy();
        const h = SHEET_NAME_PX + 10;
        const bmp = new Bitmap(w, h);
        bmp.fontFace = 'GameFont, sans-serif';
        bmp.fontSize = SHEET_NAME_PX;
        bmp.fontBold = true;
        bmp.outlineWidth = 4;
        bmp.outlineColor = 'black';
        bmp.textColor = entry.color || MINIMAP_NAME_COLOR;
        bmp.drawText(entry.name, 0, 0, w, h, 'center');
        const sprite = new Sprite(bmp);
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0;
        sprite._entry = entry;
        return sprite;
    }

    function ensureSheetLayer() {
        if (!isLiveSprite(worldMapSprite) || !worldMapSprite.parent) return null;
        const parent = worldMapSprite.parent;
        if (sheetLayer && !isLiveSprite(sheetLayer)) {
            sheetLayer = null; sheetGfx = null;
            sheetNameSprites = []; sheetNameKey = null; sheetGfxKey = null;
        }
        if (!sheetLayer) {
            sheetLayer = new Sprite();
            sheetGfx = new PIXI.Graphics();
            sheetLayer.addChild(sheetGfx);
        }
        if (sheetLayer.parent !== parent) {
            if (sheetLayer.parent) sheetLayer.parent.removeChild(sheetLayer);
            parent.addChildAt(sheetLayer, parent.children.indexOf(worldMapSprite) + 1);
        }
        return sheetLayer;
    }

    function removeSheetLayer() {
        destroySheetNames();
        if (isLiveSprite(sheetLayer) && sheetLayer.parent) {
            sheetLayer.parent.removeChild(sheetLayer);
        }
        sheetLayer = null;
        sheetGfx = null;
        sheetNameKey = null;
        sheetGfxKey = null;
    }

    // Screen rect of one world square, or null when the sheet is not up.
    function squareScreenRect(x, y) {
        const dims = fullscreenMapDims();
        if (!dims || !dims.w || !dims.h || !zoomScale) return null;
        const cw = (dims.w / WORLD_TILES) * zoomScale;
        const ch = (dims.h / WORLD_TILES) * zoomScale;
        return { x: panX + x * cw, y: panY + y * ch, w: cw, h: ch };
    }

    // The ruled square under the pointer, its eight neighbours, and the square
    // the player has actually picked. The whole sheet is never ruled: a grid
    // over 65536 squares is noise, and the only square anybody is reading is
    // the one they are pointing at.
    function drawSheetGrid(hover, selected) {
        if (!sheetGfx) return;
        const key = (hover ? hover.x + ',' + hover.y : '') + '|' +
                    (selected ? selected.x + ',' + selected.y : '') + '|' +
                    Math.round(panX) + ',' + Math.round(panY) + ',' + zoomScale.toFixed(4);
        if (key === sheetGfxKey) return;
        sheetGfxKey = key;
        sheetGfx.clear();
        if (hover) {
            const cell = squareScreenRect(hover.x, hover.y);
            if (cell && cell.w >= 3) {
                sheetGfx.lineStyle(1, 0xFFFFFF, 0.45);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (hover.x + dx < 0 || hover.y + dy < 0) continue;
                        if (hover.x + dx >= WORLD_TILES || hover.y + dy >= WORLD_TILES) continue;
                        sheetGfx.drawRect(cell.x + dx * cell.w, cell.y + dy * cell.h, cell.w, cell.h);
                    }
                }
                sheetGfx.lineStyle(2, 0xFFFFFF, 0.9);
                sheetGfx.drawRect(cell.x, cell.y, cell.w, cell.h);
            }
        }
        if (selected) {
            const cell = squareScreenRect(selected.x, selected.y);
            if (cell) {
                const w = Math.max(cell.w, 10);
                const h = Math.max(cell.h, 10);
                const cx = cell.x + cell.w / 2 - w / 2;
                const cy = cell.y + cell.h / 2 - h / 2;
                sheetGfx.lineStyle(4, 0x000000, 0.8);
                sheetGfx.drawRect(cx, cy, w, h);
                sheetGfx.lineStyle(2, 0xFFD76A, 1);
                sheetGfx.beginFill(0xFFD76A, 0.22);
                sheetGfx.drawRect(cx, cy, w, h);
                sheetGfx.endFill();
            }
        }
    }

    // One pass over the names: built on first sight, then only moved. A name
    // that would land on one already placed is dropped, exactly as the corner
    // chart drops them, because a crowded coast reads as nothing otherwise.
    function refreshSheetNames() {
        if (!sheetLayer) return;
        if (sheetNameSprites.length !== sheetNameEntries.length) {
            destroySheetNames();
            for (const entry of sheetNameEntries) {
                const sprite = sheetNameSprite(entry);
                sprite.visible = false;
                sheetLayer.addChild(sprite);
                sheetNameSprites.push(sprite);
            }
        }
        const taken = [];
        for (const sprite of sheetNameSprites) {
            const entry = sprite._entry;
            const cell = squareScreenRect(entry.wx, entry.wy);
            if (!cell) { sprite.visible = false; continue; }
            const cx = cell.x + cell.w / 2;
            const cy = cell.y + cell.h / 2 + Math.max(6, cell.h * 0.5) +
                       (entry.line || 0) * (SHEET_NAME_PX + 4);
            const halfW = sprite.bitmap.width / 2;
            if (cx + halfW < 0 || cx - halfW > Graphics.width ||
                cy + sprite.bitmap.height < 0 || cy > Graphics.height) {
                sprite.visible = false;
                continue;
            }
            const box = { l: cx - halfW, r: cx + halfW, t: cy, b: cy + sprite.bitmap.height };
            if (taken.some(o => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) {
                sprite.visible = false;
                continue;
            }
            taken.push(box);
            sprite.x = Math.round(cx);
            sprite.y = Math.round(cy);
            sprite.visible = true;
        }
    }

    // Driven once a frame while the chart is up.
    function refreshSheetLayer() {
        if (currentMapState !== 3 || !isLiveSprite(worldMapSprite) || !worldMapSprite.visible) {
            if (sheetLayer) sheetLayer.visible = false;
            return;
        }
        if (!ensureSheetLayer()) return;
        sheetLayer.visible = true;
        drawSheetGrid(padSquare || squareAtPointer(), selectedSquare);
        refreshSheetNames();
    }


    // The fullscreen chart used to be a picture with a red dot on it. It is now
    // the thing the party plans with, and everything below serves that one idea:
    //
    //   - every place the world knows about is PINNED and NAMED on it, read off
    //     the gazetteer rather than off the teleport events, so the chart says
    //     the same thing wherever it is opened from;
    //   - a pin is a journey. Sitting in a vehicle, clicking a place books the
    //     seat: the travel overlay opens already standing on it, with its own
    //     fare, tank and refusals (Vehicle/FastTravelSystem.js openTo);
    //   - the party writes on it. A square can be marked and a note kept there,
    //     and the marks are saved with the game;
    //   - hovering a square reads it out: where it is, what nation claims it,
    //     what ground is there, whether a river or a road crosses it;
    //   - a country can be picked out of the European roster and its whole
    //     territory washed over, which is the only way to see a border at all;
    //   - and the mouse gets a zoom bar, because a wheel is a poor way to cross
    //     five orders of scale.
    //
    // Everything here is the WORLD sheet only. Bologna and the landing grid of
    // another planet are other coordinate spaces and are left alone.

    const SHEET_KIND_COLOR = {
        place:  '#00FF00',
        town:   '#FFD27F',
        custom: '#8FD8FF',
        vault:  '#C792EA',
        note:   '#FF8FB1',
    };

    // -- What the party wrote on the chart -----------------------------------
    //
    // A mark and, optionally, a line of text kept with it. Saved on the game
    // rather than in the world folder: the marks are one party's reading of the
    // ground, not a fact about the world the way a founded town is.
    function worldNotes() {
        if (!$gameSystem) return [];
        if (!Array.isArray($gameSystem._worldMapNotes)) $gameSystem._worldMapNotes = [];
        return $gameSystem._worldMapNotes;
    }

    function noteAt(x, y) {
        return worldNotes().find(n => n.x === x && n.y === y) || null;
    }

    function setNoteAt(x, y, text) {
        const notes = worldNotes();
        const trimmed = String(text || '').trim();
        const idx = notes.findIndex(n => n.x === x && n.y === y);
        if (!trimmed) {
            if (idx >= 0) notes.splice(idx, 1);
        } else if (idx >= 0) {
            notes[idx].text = trimmed;
        } else {
            notes.push({ x: x, y: y, text: trimmed });
        }
        clearFullscreenCache();
        refreshWorldMapDisplay();
    }

    // -- The squares the party wrote down as travel points --------------------
    // The same list the travel overlay's "add a place" writes into, so a square
    // written down there is a pin here without any further bookkeeping.
    function customTravelPins() {
        const points = $gameSystem && Array.isArray($gameSystem._customTravelPoints)
            ? $gameSystem._customTravelPoints : [];
        return points.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    }

    // -- Patron vaults --------------------------------------------------------
    //
    // A hatch this savegame has recognised, or the square this WORLD proved and
    // unlocked, whichever the party knows about. An unmet vault is never drawn:
    // the whole point of the roster is that the coordinates have to be earned.
    function vaultPins() {
        const PR = window.PatreonRewards;
        if (!PR) return [];
        const out = [];
        const seen = new Set();
        const add = (rec, unlocked) => {
            if (!rec || !Number.isFinite(rec.x) || !Number.isFinite(rec.y)) return;
            const key = rec.x + ',' + rec.y;
            if (seen.has(key)) return;
            seen.add(key);
            const patron = (PR.patronById && rec.id != null) ? PR.patronById(rec.id) : null;
            out.push({
                x: rec.x, y: rec.y,
                name: (patron && patron.name) ? patron.name : T('WorldMap.pin.vaultUnnamed'),
                unlocked: !!unlocked,
            });
        };
        try {
            const claimed = PR.claimedSquare ? PR.claimedSquare() : null;
            add(claimed, true);
            const known = PR.knownHatches ? PR.knownHatches() : [];
            for (const hatch of known) add(hatch, false);
        } catch (e) { /* no world loaded */ }
        return out;
    }

    // -- One pin model --------------------------------------------------------
    //
    // Every named thing on the sheet, in world-tile space (0-255), gathered
    // once. The chart's drawing pass, its hover readout and its click handler
    // all read this same list, so a pin can never be drawn somewhere it cannot
    // be clicked (or the other way round).
    //
    // `destName` is the Destinations.json key a pin can be travelled to by;
    // a pin without one is a place on the chart and nothing more.
    let sheetPinCache = null;
    let sheetPinKey = null;

    function sheetPinSignature() {
        return [
            (window.WorkSystem && window.WorkSystem.Destinations) ? 'g' : '-',
            foundedTownPins().length,
            customTravelPins().length,
            vaultPins().length,
            worldNotes().length,
            worldNotes().map(n => n.x + ',' + n.y).join(';'),
        ].join('|');
    }

    function sheetPins() {
        const key = sheetPinSignature();
        if (sheetPinCache && sheetPinKey === key) return sheetPinCache;

        const pins = [];
        const taken = new Set();
        const push = (pin) => {
            const at = pin.x + ',' + pin.y;
            if (taken.has(at) && pin.kind !== 'note') return;
            taken.add(at);
            pins.push(pin);
        };

        // Catalogued places. The gazetteer, not the teleport events: the events
        // only exist on map 315, so a chart opened from a cellar used to be a
        // blank sheet with a dot on it.
        for (const place of getDestinationMarkers()) {
            push({ x: place.x, y: place.y, kind: 'place', name: place.name, destName: place.key });
        }
        // Towns the party raised. Named over any catalogued place sharing the
        // square, because the party's own work is what they are looking for.
        for (const town of foundedTownPins()) {
            const at = town.worldX + ',' + town.worldY;
            const clash = pins.findIndex(p => (p.x + ',' + p.y) === at);
            if (clash >= 0) pins.splice(clash, 1);
            taken.delete(at);
            push({ x: town.worldX, y: town.worldY, kind: 'town', name: town.name, destName: town.name });
        }
        // A square the party wrote down travels under the overlay's own id for
        // it ("custom:x,y"), not under the name they gave it.
        for (const point of customTravelPins()) {
            push({
                x: point.x, y: point.y, kind: 'custom', name: point.name,
                destName: 'custom:' + point.x + ',' + point.y,   // i18n-ignore  internal id
            });
        }
        for (const vault of vaultPins()) {
            push({
                x: vault.x, y: vault.y, kind: 'vault',
                name: T(vault.unlocked ? 'WorldMap.pin.vaultOpen' : 'WorldMap.pin.vaultKnown',
                        { patron: vault.name }),
            });
        }
        for (const note of worldNotes()) {
            push({ x: note.x, y: note.y, kind: 'note', name: note.text, note: note.text });
        }

        sheetPinCache = pins;
        sheetPinKey = key;
        return pins;
    }

    // The gazetteer reader hands back names; the travel overlay wants keys, so
    // the key is carried alongside. Kept here rather than folded into
    // getDestinationMarkers so the minimap's own name pass is untouched.
    function sheetInvalidate() {
        sheetPinCache = null;
        sheetPinKey = null;
        countryMaskCache = null;
    }

    // -- Reading a square out -------------------------------------------------
    //
    // Everything the game already knows about one world tile, in the order
    // somebody pointing at it wants it: what stands there, who claims it, what
    // ground it is, and what crosses it.
    function squareReadout(x, y) {
        const lines = [];
        const pin = pinAtSquare(x, y);
        if (pin) lines.push({ label: T('WorldMap.read.place'), value: pin.name });

        const country = ($gameSystem && $gameSystem.getCountryFromWorldCoordinates)
            ? $gameSystem.getCountryFromWorldCoordinates(x, y) : null;
        lines.push({
            label: T('WorldMap.read.nation'),
            value: (country && country.country) ? country.country : T('WorldMap.read.unclaimed'),
        });

        // A nation is held by a hyperpower, and on this chart the bloc matters
        // more than the flag: it is who the party answers to on that ground.
        const power = hyperpowerOfCountry(country);
        if (power) lines.push({ label: T('WorldMap.read.power'), value: power });

        let biome = null;
        try {
            if ($gameSystem && $gameSystem.getBiomeFromCache) biome = $gameSystem.getBiomeFromCache(x, y);
        } catch (e) { biome = null; }
        lines.push({
            label: T('WorldMap.read.ground'),
            value: biome
                ? ((window.BiomeNames && window.BiomeNames.display) ? window.BiomeNames.display(biome) : biome)
                : T('WorldMap.read.unsurveyed'),
        });

        const features = [];
        const pg = $gameSystem && $gameSystem._procGenData;
        if (pg && pg.riverCoordMap && pg.riverCoordMap[x + ',' + y]) features.push(T('WorldMap.read.river'));
        if ($gameSystem && $gameSystem.getRoadDirectionFromCache && $gameMap && $gameMap.mapId() === 315) {
            try {
                if ($gameSystem.getRoadDirectionFromCache(x, y)) features.push(T('WorldMap.read.road'));
            } catch (e) { /* not on the world map */ }
        }
        if (features.length) lines.push({ label: T('WorldMap.read.crossed'), value: features.join(', ') });

        // What has been put up on this square, in any savegame of this world
        // (Crafting/FurnitureSystem.js, THE BUILD REGISTER). A square somebody
        // built on is the single most useful thing a chart of open country can
        // say, because nothing else on it distinguishes one field from another.
        const built = (window.BuildRegister && window.BuildRegister.at)
            ? window.BuildRegister.at(x, y) : null;
        if (built) {
            lines.push({
                label: T('WorldMap.read.built'),
                value: built.names.length
                    ? T('WorldMap.read.builtWhat', { count: built.count, what: built.names.join(', ') })
                    : T('WorldMap.read.builtCount', { count: built.count }),
            });
        }

        const note = noteAt(x, y);
        if (note) lines.push({ label: T('WorldMap.read.note'), value: note.text });
        return lines;
    }

    // The bloc holding a nation, as the political simulation reads it now, and
    // as the country table wrote it down otherwise. Neutral ground has none.
    function hyperpowerOfCountry(country) {
        const name = country && country.country;
        if (!name) return '';
        const sim = window.HistoryManager && window.HistoryManager.getNationState
            ? window.HistoryManager.getNationState(name) : null;
        let holder = (sim && sim.controller) || '';
        if (!holder || holder === 'Neutral') holder = country.controller || '';
        if (!holder || holder === 'Neutral') holder = country.faction || '';
        if (!holder || holder === 'Neutral') return '';
        return holder;
    }

    function pinAtSquare(x, y) {
        return sheetPins().find(p => p.x === x && p.y === y) || null;
    }

    // -- Country territory ----------------------------------------------------
    //
    // A border is the one thing a photographed chart cannot show. The region
    // plane painted under map 315 knows exactly which squares a nation holds,
    // so a picked country is washed over square by square out of it.
    //
    // Europe only, per the roster: Countries.json carries a region for every
    // entry and the chart is a chart of Europe.
    let countryMaskCache = null;   // id -> [[x, y], ...]

    function europeanCountries() {
        const list = window.WorldGen && window.WorldGen.Countries;
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.filter(c => {
            if (!c || !c.id || c.region !== 'Europe') return false;   // i18n-ignore  data region id
            if (seen.has(c.id)) return false;                          // duplicated ids resolve first-wins
            seen.add(c.id);
            return true;
        }).sort((a, b) => String(a.country).localeCompare(String(b.country)));
    }

    // Every square painted with a region id, gathered in one sweep of the
    // plane. 65536 lookups, done once and kept: doing it per redraw would cost
    // it on every pan.
    function countryMask() {
        if (countryMaskCache) return countryMaskCache;
        const mask = new Map();
        if (!$gameSystem || !$gameSystem.getWorldRegionId) return mask;
        for (let y = 0; y < WORLD_TILES; y++) {
            for (let x = 0; x < WORLD_TILES; x++) {
                let id = 0;
                try { id = $gameSystem.getWorldRegionId(x, y) | 0; } catch (e) { return mask; }
                if (!id) continue;
                let cells = mask.get(id);
                if (!cells) { cells = []; mask.set(id, cells); }
                cells.push(x, y);
            }
        }
        // Nothing painted at all (no snapshot loaded yet): answer without
        // caching, so the sweep is tried again once the plane exists.
        if (mask.size) countryMaskCache = mask;
        return mask;
    }

    let highlightCountryId = 0;

    function drawCountryHighlight(ctx, targetW, targetH) {
        if (!highlightCountryId) return;
        const cells = countryMask().get(highlightCountryId);
        if (!cells || !cells.length) return;
        const cw = targetW / WORLD_TILES;
        const ch = targetH / WORLD_TILES;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 199, 64, 0.62)';
        for (let i = 0; i < cells.length; i += 2) {
            ctx.fillRect(cells[i] * cw, cells[i + 1] * ch, Math.ceil(cw), Math.ceil(ch));
        }
        // An outline around every washed square: the wash alone disappears over
        // a bright coast, and the picked nation has to be unmistakable.
        ctx.strokeStyle = 'rgba(96, 40, 0, 0.85)';
        ctx.lineWidth = Math.max(1, cw * 0.14);
        for (let i = 0; i < cells.length; i += 2) {
            ctx.strokeRect(cells[i] * cw, cells[i + 1] * ch, Math.ceil(cw), Math.ceil(ch));
        }
        ctx.restore();
    }

    // -- Where the sheet can be travelled from --------------------------------
    //
    // A pin is a journey only when the party is sitting in something that makes
    // journeys. Orbiting Earth the chart is a view through a window: the places
    // are all named and none of them can be set off for.
    function sheetTravelTransport() {
        if (spaceRoute() === 'earth') return null;
        const FT = window.FastTravelSystem;
        if (!FT || typeof FT.transportHere !== 'function') return null;
        return FT.transportHere();
    }

    // -- The sheet's own chrome ----------------------------------------------
    //
    // The zoom bar, the country picker and the readout are DOM: they are
    // pointer furniture, and drawing them into the sheet bitmap would put them
    // under the pan and the zoom that they exist to control.

    const CHROME_ID = 'worldmap-chrome';
    let chromeEl = null;
    let noteModalEl = null;
    let noteModalSquare = null;
    let chromeZoomEl = null;
    let chromeReadoutEl = null;
    let chromeCountryEl = null;
    let chromeSuppressZoom = false;
    let chromePointerIn = false;   // the pointer is over the chrome, not the chart

    // The zoom bar runs on a log scale: the chart spans 0.25x to 8x and a
    // linear bar spends nine tenths of its travel in the last doubling.
    function zoomToSlider(z) {
        const t = (Math.log(z) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM));
        return Math.round(Math.max(0, Math.min(1, t)) * 1000);
    }

    function sliderToZoom(v) {
        const t = Math.max(0, Math.min(1, Number(v) / 1000));
        return Math.exp(Math.log(MIN_ZOOM) + t * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM)));
    }

    function applyZoom(next) {
        const oldScale = zoomScale;
        zoomScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
        if (!isLiveSprite(worldMapSprite) || zoomScale === oldScale) return;
        const ratio = zoomScale / oldScale;
        const cx = Graphics.width / 2;
        const cy = Graphics.height / 2;
        panX = cx - (cx - panX) * ratio;
        panY = cy - (cy - panY) * ratio;
        worldMapSprite.scale.x = zoomScale;
        worldMapSprite.scale.y = zoomScale;
        worldMapSprite.x = panX;
        worldMapSprite.y = panY;
    }

    function chromeWanted() {
        return currentMapState === 3 && !!$gameMap &&
            $gameMap.mapId() !== BOLOGNA_MAP_ID && !isOffEarthView() &&
            SceneManager._scene instanceof Scene_Map;
    }

    function buildChrome() {
        if (chromeEl) return chromeEl;
        const el = document.createElement('div');
        el.id = CHROME_ID;

        const countries = europeanCountries();
        const options = ['<option value="0">' + escapeSheet(T('WorldMap.country.none')) + '</option>']
            .concat(countries.map(c =>
                `<option value="${c.id}">${escapeSheet(c.country)}</option>`)).join('');

        el.innerHTML = `
            <div class="wm-chrome-panel wm-country-box">
                <div class="wm-chrome-title">${escapeSheet(T('WorldMap.country.title'))}</div>
                <select id="wm-country" class="wm-country-select focusable" tabindex="0">${options}</select>
            </div>
            <div class="wm-chrome-panel wm-zoom-box">
                <div class="wm-zoom-mark">+</div>
                <input id="wm-zoom" class="wm-zoom-bar" type="range" min="0" max="1000" step="1"
                       value="${zoomToSlider(zoomScale)}" orient="vertical">
                <div class="wm-zoom-mark">&minus;</div>
            </div>
            <div class="wm-chrome-panel wm-readout" id="wm-readout"></div>
            <div class="wm-chrome-panel wm-sheet-hint">${escapeSheet(T('WorldMap.hint.sheet'))}</div>`;

        document.body.appendChild(el);
        chromeEl = el;
        chromeZoomEl = el.querySelector('#wm-zoom');
        chromeReadoutEl = el.querySelector('#wm-readout');
        chromeCountryEl = el.querySelector('#wm-country');

        chromeZoomEl.addEventListener('input', () => {
            chromeSuppressZoom = true;
            applyZoom(sliderToZoom(chromeZoomEl.value));
            chromeSuppressZoom = false;
        });
        // The bar owns the wheel while the pointer is on it, or the map's own
        // wheel zoom would fight the thumb being dragged.
        chromeZoomEl.addEventListener('wheel', ev => ev.stopPropagation());
        chromeZoomEl.addEventListener('keydown', ev => ev.stopPropagation());

        chromeCountryEl.addEventListener('change', () => {
            highlightCountryId = Number(chromeCountryEl.value) || 0;
            SoundManager.playCursor();
            fsOverlayKey = null;      // the wash is part of the overlay
            refreshWorldMapDisplay();
        });
        chromeCountryEl.addEventListener('keydown', ev => ev.stopPropagation());
        chromeCountryEl.value = String(highlightCountryId || 0);

        // Only the interactive panels claim the pointer: the readout is a label
        // and must not swallow a click on the square it is describing.
        for (const panel of el.querySelectorAll('.wm-zoom-box, .wm-country-box')) {
            panel.addEventListener('pointerenter', () => { chromePointerIn = true; });
            panel.addEventListener('pointerleave', () => { chromePointerIn = false; });
        }
        // ...with the one exception inside the readout: the Show map button IS
        // a button. It is rewritten with every square the pointer crosses, so
        // it is watched by delegation rather than bound each time.
        el.addEventListener('pointerover', ev => {
            if (ev.target.closest('.wm-show-map, .wm-note-btn')) chromePointerIn = true;
        });
        el.addEventListener('pointerout', ev => {
            if (ev.target.closest('.wm-show-map, .wm-note-btn')) chromePointerIn = false;
        });
        el.addEventListener('click', ev => {
            const note = ev.target.closest('[data-wm-note-at]');
            if (note) {
                ev.stopPropagation();
                const at = String(note.dataset.wmNoteAt).split(',');
                openNoteModal(Number(at[0]), Number(at[1]));
                return;
            }
            const hit = ev.target.closest('[data-wm-show]');
            if (!hit) return;
            ev.stopPropagation();
            const parts = String(hit.dataset.wmShow).split(',');
            openSquarePreview(Number(parts[0]), Number(parts[1]));
        });
        return el;
    }

    function destroyChrome() {
        if (chromeEl) { chromeEl.remove(); chromeEl = null; }
        chromeZoomEl = chromeReadoutEl = chromeCountryEl = null;
        chromePointerIn = false;
        readoutKey = null;
        closeNoteModal();
        destroyPreview();
    }

    function escapeSheet(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // The readout follows the pointer's square, and says what can be done with
    // it: travelled to, written on, or only looked at.
    //
    // Only rewritten when the square under the pointer actually changes. It is
    // driven from the frame loop, and rebuilding its markup on every one of
    // them would rewrite a dozen elements sixty times a second to say the same
    // thing.
    let readoutKey = null;

    function refreshReadout(square) {
        if (!chromeReadoutEl) { readoutKey = null; return; }
        const picked = !!(square && selectedSquare &&
            selectedSquare.x === square.x && selectedSquare.y === square.y);
        const key = square ? (square.x + ',' + square.y + (picked ? ':p' : '')) : '';
        if (key === readoutKey) return;
        readoutKey = key;
        if (!square) { chromeReadoutEl.style.display = 'none'; return; }
        const rows = squareReadout(square.x, square.y).map(line =>
            `<div class="wm-read-row"><span class="wm-read-label">${escapeSheet(line.label)}</span>` +
            `<span class="wm-read-value">${escapeSheet(line.value)}</span></div>`).join('');
        const pin = pinAtSquare(square.x, square.y);
        const transport = sheetTravelTransport();
        let action = '';
        if (pin && pin.destName && transport) {
            action = T('WorldMap.hint.travel', { place: pin.name });
        } else if (pin && pin.destName) {
            action = T('WorldMap.hint.needVehicle');
        }
        chromeReadoutEl.style.display = 'block';
        chromeReadoutEl.innerHTML =
            `<div class="wm-read-head">${escapeSheet(T('WorldMap.read.square', { x: square.x, y: square.y }))}</div>` +
            rows + (action ? `<div class="wm-read-action">${escapeSheet(action)}</div>` : '') +
            // Writing on a square is deliberate: it is offered on the square
            // that has been picked, and nowhere else.
            (picked
                ? `<div class="inspect-btn focusable wm-note-btn" data-wm-note-at="${square.x},${square.y}">` +
                  `${escapeSheet(T('WorldMap.note.write'))}</div>`
                : '') +
            // Build the square and look at it before walking onto it. The
            // square is built for the look and thrown away again, so the
            // button is offered for any square, catalogued or bare ground.
            `<div class="inspect-btn focusable wm-show-map" data-wm-show="${square.x},${square.y}">` +
            `${escapeSheet(T('WorldMap.preview.showMap'))}</div>`;
    }

    function syncChrome() {
        if (!chromeWanted()) { destroyChrome(); return; }
        buildChrome();
        if (chromeZoomEl && !chromeSuppressZoom) {
            const want = String(zoomToSlider(zoomScale));
            if (chromeZoomEl.value !== want) chromeZoomEl.value = want;
        }
    }

    // -- Writing on the chart -------------------------------------------------

    // While a box is open over the sheet, the sheet itself stops listening:
    // the note being typed and the square being looked at both own the
    // keyboard, the wheel and the drag for as long as they are up.
    function isSheetTyping() {
        return !!noteModalEl || previewIsOpen();
    }

    function openNoteModal(x, y) {
        if (noteModalEl) return;
        const existing = noteAt(x, y);
        noteModalSquare = { x: x, y: y };
        const el = document.createElement('div');
        el.id = 'wm-note-modal';
        el.innerHTML = `
            <div class="ui-panel wm-note-box">
                <div class="page-header-bar">
                    <h2 class="title">${escapeSheet(T('WorldMap.note.title', { x: x, y: y }))}</h2>
                </div>
                <div class="wm-note-place">${escapeSheet(
                    squareReadout(x, y).map(l => l.value).join(' - '))}</div>
                <input id="wm-note-text" class="wm-note-input focusable" tabindex="0" maxlength="120"
                       value="${escapeSheet(existing ? existing.text : '')}"
                       placeholder="${escapeSheet(T('WorldMap.note.placeholder'))}">
                <div class="inspect-actions wm-note-actions">
                    <div class="inspect-btn focusable" data-wm-note="save">${escapeSheet(T('WorldMap.note.save'))}</div>
                    ${existing ? `<div class="inspect-btn inspect-btn--danger focusable" data-wm-note="delete">${escapeSheet(T('WorldMap.note.delete'))}</div>` : ''}
                    <div class="inspect-btn inspect-btn--secondary focusable" data-wm-note="cancel">${escapeSheet(T('WorldMap.note.cancel'))}</div>
                </div>
            </div>`;
        document.body.appendChild(el);
        noteModalEl = el;

        const input = el.querySelector('#wm-note-text');
        input.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); commitNote(input.value); return; }
            if (ev.key === 'Escape') { ev.preventDefault(); closeNoteModal(); return; }
            ev.stopPropagation();
        });
        el.addEventListener('click', ev => {
            const hit = ev.target.closest('[data-wm-note]');
            if (!hit) return;
            ev.stopPropagation();
            const answer = hit.dataset.wmNote;
            if (answer === 'save') commitNote(input.value);
            else if (answer === 'delete') commitNote('');
            else closeNoteModal();
        });
        setTimeout(() => { try { input.focus(); input.select(); } catch (e) { } }, 0);
        SoundManager.playOk();
    }

    function commitNote(text) {
        if (!noteModalSquare) { closeNoteModal(); return; }
        const square = noteModalSquare;
        closeNoteModal();
        setNoteAt(square.x, square.y, text);
        sheetInvalidate();
        fsOverlayKey = null;
        SoundManager.playOk();
    }

    function closeNoteModal() {
        if (noteModalEl) { noteModalEl.remove(); noteModalEl = null; }
        noteModalSquare = null;
        TouchInput.clear();
    }

    // -- "Show map": looking at the ground before walking onto it ------------
    //
    // A square on the chart is one photographed pixel of Europe, and nothing
    // about it says whether the ground there is a river bend, a crossroads or a
    // wall of trees. The generator already knows: the square is built from the
    // world seed and the biome snapshot, so it comes out the same whether it is
    // built now for a look or in a minute for a walk.
    //
    // So the sheet builds it, renders it once, and shows the picture. The
    // picture is NEVER kept: there is no cache, no file and no bitmap held
    // between openings. Closing the preview destroys the texture, the canvas
    // and the tilemap that drew it, and opening the same square again builds it
    // from scratch.
    //
    // Building a square replaces $gameSystem._procGenData outright (that is what
    // generateOriginBiomeMap is for), which is the record the party's OWN square
    // is standing on. The whole thing is therefore bracketed by a snapshot and
    // a restore, and the restore runs even when the generator throws.
    const PREVIEW_TILE_PX = 48;
    let previewEl = null;
    let previewTilemap = null;
    let previewCanvas = null;
    let previewTexture = null;
    let previewZoom = 1;
    let previewPanX = 0;
    let previewPanY = 0;
    let previewBuilding = false;

    function previewIsOpen() {
        return !!previewEl;
    }

    // The map data for one world square, built and handed back without leaving
    // a trace on the record the party is standing on. Null where the square
    // cannot be built (open ocean, no snapshot loaded, no generator).
    function buildSquareMapData(wx, wy) {
        if (!$gameSystem || typeof $gameSystem.generateOriginBiomeMap !== 'function') return null;
        const savedProcGen = $gameSystem._procGenData;
        const savedX = $gameVariables ? $gameVariables.value(43) : 0;
        const savedY = $gameVariables ? $gameVariables.value(44) : 0;
        let built = null;
        try {
            if (!$gameSystem.generateOriginBiomeMap({ worldX: wx, worldY: wy })) return null;
            const data = $gameSystem._procGenData && $gameSystem._procGenData.generatedMapData;
            if (!data || !data.data || !data.width || !data.height) return null;
            // Copied out before the record goes back: the object about to be
            // restored is the one holding it.
            built = {
                width: data.width, height: data.height,
                tilesetId: data.tilesetId, data: data.data.slice(),
            };
        } catch (e) {
            console.error('[WorldMap] the square could not be built for a look.', e);
            return null;
        } finally {
            // Always, whatever happened: the party's own square must be the one
            // the record describes by the time this returns.
            $gameSystem._procGenData = savedProcGen;
            if ($gameVariables) {
                $gameVariables.setValue(43, savedX);
                $gameVariables.setValue(44, savedY);
            }
        }
        return built;
    }

    // One offscreen tilemap holding the whole square, with no viewport: width
    // and height are the map's full pixel size, so _addAllSpots lays down every
    // tile rather than the window a scene would show.
    function buildPreviewTilemap(mapData) {
        const tileset = $dataTilesets && $dataTilesets[mapData.tilesetId];
        if (!tileset) return null;
        const tilemap = new Tilemap();
        tilemap.tileWidth = PREVIEW_TILE_PX;
        tilemap.tileHeight = PREVIEW_TILE_PX;
        tilemap.setData(mapData.width, mapData.height, mapData.data);
        tilemap.flags = tileset.flags;
        // setBitmaps, not an assignment: it is what hangs the load listeners
        // that make isReady() below mean anything (ImageManager.loadTileset
        // answers an empty bitmap for an empty slot, as the spriteset relies on).
        tilemap.setBitmaps(tileset.tilesetNames.map(name => ImageManager.loadTileset(name)));
        tilemap.width = mapData.width * PREVIEW_TILE_PX;
        tilemap.height = mapData.height * PREVIEW_TILE_PX;
        tilemap.origin.x = 0;
        tilemap.origin.y = 0;
        return tilemap;
    }

    // Draw it, once, into a canvas of its own. PIXI's extract renders the
    // display object through the live renderer, which is the only thing in the
    // game that knows how to put an autotile together.
    function renderPreviewCanvas(tilemap) {
        const app = Graphics._app || (window.Graphics && Graphics.app);
        const renderer = app && app.renderer;
        if (!renderer || !renderer.extract) return null;
        // The bitmaps have to have finished decoding, or the spots are laid
        // down against empty textures and the picture comes out blank.
        tilemap.update();
        tilemap.updateTransform();
        try {
            return renderer.extract.canvas(tilemap);
        } catch (e) {
            console.error('[WorldMap] the square could not be drawn.', e);
            return null;
        }
    }

    function destroyPreview() {
        if (previewEl) { previewEl.remove(); previewEl = null; }
        if (previewTexture && previewTexture.destroy) {
            try { previewTexture.destroy(true); } catch (e) { /* already gone */ }
        }
        previewTexture = null;
        if (previewTilemap && previewTilemap.destroy) {
            // The tileset bitmaps are ImageManager's and are shared with the
            // running map, so only the tilemap's own layers are torn down.
            try { previewTilemap.destroy({ children: true, texture: false, baseTexture: false }); }
            catch (e) { /* already gone */ }
        }
        previewTilemap = null;
        // The canvas is the picture. Dropping the last reference to it is what
        // "the screenshot is not saved" means: nothing else ever held one.
        if (previewCanvas) {
            previewCanvas.width = previewCanvas.height = 0;
            previewCanvas = null;
        }
        previewBuilding = false;
        TouchInput.clear();
    }

    function applyPreviewTransform() {
        if (!previewCanvas) return;
        previewCanvas.style.transform =
            `translate(${previewPanX}px, ${previewPanY}px) scale(${previewZoom})`;
    }

    function openSquarePreview(wx, wy) {
        if (previewEl || previewBuilding) return;
        previewBuilding = true;
        SoundManager.playOk();

        const mapData = buildSquareMapData(wx, wy);
        if (!mapData) {
            previewBuilding = false;
            SoundManager.playBuzzer();
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('WorldMap.preview.unbuildable'));
            }
            return;
        }

        previewTilemap = buildPreviewTilemap(mapData);
        if (!previewTilemap) { destroyPreview(); SoundManager.playBuzzer(); return; }

        const el = document.createElement('div');
        el.id = 'wm-square-preview';
        el.innerHTML = `
            <div class="wm-preview-stage" id="wm-preview-stage">
                <div class="wm-preview-loading">${escapeSheet(T('WorldMap.preview.building'))}</div>
            </div>
            <div class="wm-preview-bar">
                <span class="wm-preview-title">${escapeSheet(
                    T('WorldMap.preview.title', { x: wx, y: wy }))}</span>
                <span class="wm-preview-note">${escapeSheet(T('WorldMap.preview.notKept'))}</span>
                <div class="inspect-btn inspect-btn--secondary focusable" data-wm-preview="close">${
                    escapeSheet(T('WorldMap.preview.close'))}</div>
            </div>`;
        document.body.appendChild(el);
        previewEl = el;

        el.addEventListener('click', ev => {
            if (ev.target.closest('[data-wm-preview="close"]')) {
                ev.stopPropagation();
                destroyPreview();
            }
        });
        // Its own wheel and drag, so the chart underneath neither zooms nor pans
        // while the picture over it is being read.
        el.addEventListener('wheel', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const step = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
            previewZoom = Math.max(0.1, Math.min(4, previewZoom * step));
            applyPreviewTransform();
        }, { passive: false });
        let dragging = false, dragX = 0, dragY = 0;
        el.addEventListener('pointerdown', ev => {
            dragging = true; dragX = ev.clientX; dragY = ev.clientY;
        });
        el.addEventListener('pointermove', ev => {
            if (!dragging) return;
            previewPanX += ev.clientX - dragX;
            previewPanY += ev.clientY - dragY;
            dragX = ev.clientX; dragY = ev.clientY;
            applyPreviewTransform();
        });
        el.addEventListener('pointerup', () => { dragging = false; });
        el.addEventListener('pointerleave', () => { dragging = false; });

        // The tileset images may still be decoding. The picture is drawn on the
        // frame they are all ready, and not before.
        const tilemap = previewTilemap;
        const drawWhenReady = () => {
            if (previewTilemap !== tilemap || !previewEl) return;  // closed while waiting
            if (!tilemap.isReady()) { setTimeout(drawWhenReady, 50); return; }
            const canvas = renderPreviewCanvas(tilemap);
            if (previewTilemap !== tilemap || !previewEl) return;
            const stage = previewEl.querySelector('#wm-preview-stage');
            if (!canvas || !stage) { destroyPreview(); SoundManager.playBuzzer(); return; }
            stage.innerHTML = '';
            canvas.className = 'wm-preview-canvas';
            stage.appendChild(canvas);
            previewCanvas = canvas;
            // Opens showing the whole square, however big the square is.
            const fit = Math.min(
                (window.innerWidth * 0.86) / canvas.width,
                (window.innerHeight * 0.76) / canvas.height);
            previewZoom = Math.max(0.05, Math.min(1, fit));
            previewPanX = previewPanY = 0;
            applyPreviewTransform();
            previewBuilding = false;
        };
        drawWhenReady();
    }

    // -- The pointer over the sheet -------------------------------------------
    //
    // A press that does not move is a tap; a press that moves is the pan the
    // map has always had. The same test the Bologna overlay uses, because it is
    // the same gesture.
    let sheetPressing = false;
    let sheetPressX = 0, sheetPressY = 0, sheetPressMoved = false;

    // Screen pixels -> world square (0-255), or null off the sheet.
    function squareAtPointer() {
        const dims = fullscreenMapDims();
        if (!dims || !dims.w || !dims.h || !zoomScale) return null;
        const bx = (TouchInput.x - panX) / zoomScale;
        const by = (TouchInput.y - panY) / zoomScale;
        const x = Math.floor((bx / dims.w) * WORLD_TILES);
        const y = Math.floor((by / dims.h) * WORLD_TILES);
        if (x < 0 || y < 0 || x >= WORLD_TILES || y >= WORLD_TILES) return null;
        return { x: x, y: y };
    }

    // The pin under the cursor, allowing for the fact that a pin on a
    // 12288px sheet zoomed right out is a couple of pixels across.
    function pinAtPointer() {
        const dims = fullscreenMapDims();
        if (!dims || !dims.w || !zoomScale) return null;
        const bx = (TouchInput.x - panX) / zoomScale;
        const by = (TouchInput.y - panY) / zoomScale;
        const radius = Math.max(24, 18 / zoomScale);
        let best = null, bestD = Infinity;
        for (const pin of sheetPins()) {
            const px = (pin.x / WORLD_TILES) * dims.w;
            const py = (pin.y / WORLD_TILES) * dims.h;
            const d = Math.abs(px - bx) + Math.abs(py - by);
            if (d <= radius * 2 && d < bestD) { bestD = d; best = pin; }
        }
        return best;
    }

    // -- The chart under a controller -----------------------------------------
    //
    // The sheet was built around a pointer: the square being read is whichever
    // one the mouse is over, and everything the chart can do hangs off that.
    // A pad has no pointer, so it is given a cursor of its own - one square,
    // walked with the d-pad - and that square answers every question
    // squareAtPointer() answers for a mouse. The stick keeps panning the sheet
    // (updatePanControls), so the two never argue over the same input.
    let padSquare = null;
    // THE PICKED SQUARE. A click pins the readout to one square: it stays there
    // while the pointer wanders off, until another square is picked or the same
    // one is clicked again. Only a picked square can be written on.
    let selectedSquare = null;
    let padSeenX = -1;
    let padSeenY = -1;

    // Whichever device was used last owns the readout, so the cursor is dropped
    // the moment the mouse moves and the ring is never in two places at once.
    function syncPadCursorToDevice() {
        if (TouchInput.x === padSeenX && TouchInput.y === padSeenY) return;
        padSeenX = TouchInput.x;
        padSeenY = TouchInput.y;
        clearPadCursor();
    }

    function clearPadCursor() {
        if (!padSquare) return;
        padSquare = null;
        // The cursor is drawn into the overlay, and the overlay is cached on a
        // signature, so moving it is a redraw and not a per-frame cost.
        fsOverlayKey = null;
        refreshWorldMapDisplay();
    }

    // The square the sheet is talking about: the pad's, when it has one, and
    // the one under the mouse otherwise. Everything that used to ask
    // squareAtPointer() directly asks this instead.
    function activeSquare() {
        return padSquare || selectedSquare || squareAtPointer();
    }

    // Clicking the square already picked puts it down again.
    function selectSquare(square) {
        if (selectedSquare && square &&
            selectedSquare.x === square.x && selectedSquare.y === square.y) {
            selectedSquare = null;
        } else {
            selectedSquare = square ? { x: square.x, y: square.y } : null;
        }
        readoutKey = null;
        sheetGfxKey = null;
        SoundManager.playCursor();
    }

    function clearSelectedSquare() {
        if (!selectedSquare) return;
        selectedSquare = null;
        readoutKey = null;
        sheetGfxKey = null;
    }

    // The cursor starts where the party is, so the first press of a direction
    // summons it somewhere the player already recognises.
    function padCursorStart() {
        const world = playerWorldPosition();
        const x = Math.max(0, Math.min(WORLD_TILES - 1, Math.floor(world.x)));
        const y = Math.max(0, Math.min(WORLD_TILES - 1, Math.floor(world.y)));
        return { x: x, y: y };
    }

    // The sheet is bigger than the screen at any useful zoom, so the pan follows
    // the cursor out rather than letting it walk off the edge. Only the axis
    // that actually left the margin is moved.
    function keepPadCursorInView() {
        const dims = fullscreenMapDims();
        if (!padSquare || !dims || !dims.w || !dims.h || !isLiveSprite(worldMapSprite)) return;
        const cw = (dims.w / WORLD_TILES) * zoomScale;
        const ch = (dims.h / WORLD_TILES) * zoomScale;
        const sx = panX + (padSquare.x + 0.5) * cw;
        const sy = panY + (padSquare.y + 0.5) * ch;
        const mx = Math.max(cw, Graphics.width * 0.18);
        const my = Math.max(ch, Graphics.height * 0.18);
        if (sx < mx) panX += mx - sx;
        else if (sx > Graphics.width - mx) panX -= sx - (Graphics.width - mx);
        if (sy < my) panY += my - sy;
        else if (sy > Graphics.height - my) panY -= sy - (Graphics.height - my);
        worldMapSprite.x = panX;
        worldMapSprite.y = panY;
    }

    function movePadCursor(dx, dy) {
        if (!padSquare) {
            // The first press only summons the cursor; it does not also step, so
            // the square it appears on is the one the player expected.
            padSquare = padCursorStart();
        } else {
            padSquare = {
                x: Math.max(0, Math.min(WORLD_TILES - 1, padSquare.x + dx)),
                y: Math.max(0, Math.min(WORLD_TILES - 1, padSquare.y + dy))
            };
        }
        fsOverlayKey = null;
        // Walking the cursor puts down whatever square was picked before: the
        // cursor IS the pad's pick, and two picks would fight over the readout.
        selectedSquare = null;
        readoutKey = null;
        sheetGfxKey = null;
        keepPadCursorInView();
        refreshWorldMapDisplay();
        SoundManager.playCursor();
    }

    // Every key the chart answers to while it is up. The mouse keeps its own
    // handler (updateSheetPointer); this is the same set of actions reached
    // without a pointer, so the two stay in step by calling the same functions.
    function updateSheetKeys() {
        // The note box owns the keyboard while it is open (its field stops key
        // events reaching Input), so only a pad ever gets this far, and all it
        // can do there is put the box away.
        if (noteModalEl) {
            if (Input.isTriggered('cancel')) closeNoteModal();
            return;
        }
        if (previewIsOpen()) {
            if (Input.isTriggered('cancel')) destroyPreview();
            return;
        }
        if (Input.isTriggered('cancel')) {
            // A pad has no M key to shut the chart with.
            toggleMapState();
            return;
        }

        let dx = 0, dy = 0;
        if (Input.isRepeated('left')) dx = -1;
        else if (Input.isRepeated('right')) dx = 1;
        else if (Input.isRepeated('up')) dy = -1;
        else if (Input.isRepeated('down')) dy = 1;
        if (dx || dy) { movePadCursor(dx, dy); return; }

        const square = activeSquare();
        if (!square) return;

        // The same two things a mouse can do to a square, on the two keys a pad
        // always has: OK sets off for it (or looks at it, when there is nowhere
        // to set off for) and the shoulder writes on it, as right-click does.
        if (Input.isTriggered('ok')) {
            const pin = pinAtSquare(square.x, square.y);
            if (pin && pin.destName && sheetTravelTransport()) bookPinTravel(pin);
            else selectSquare(square);
        }
    }

    function bookPinTravel(pin) {
        const transport = sheetTravelTransport();
        if (!pin || !pin.destName) return false;
        if (!transport) {
            SoundManager.playBuzzer();
            if (window.ParchmentToast && window.ParchmentToast.show) {
                window.ParchmentToast.show(T('WorldMap.hint.needVehicle'));
            }
            return false;
        }
        const FT = window.FastTravelSystem;
        if (!FT || typeof FT.openTo !== 'function') return false;
        // Shut the chart first: the travel overlay is the thing being looked at
        // now, and a chart still up under it swallows the drag.
        currentMapState = savedMinimapState();
        clearFullscreenCache();
        destroyChrome();
        refreshWorldMapDisplay();
        if (!FT.openTo(pin.destName, transport)) {
            SoundManager.playBuzzer();
            return false;
        }
        SoundManager.playOk();
        TouchInput.clear();
        return true;
    }

    function updateSheetPointer() {
        if (!chromeWanted()) { sheetPressing = false; return; }
        if (isSheetTyping()) { sheetPressing = false; return; }
        syncPadCursorToDevice();
        // The chrome takes its own clicks. Which side of it the pointer is on
        // is answered by the chrome itself (pointerenter / pointerleave), not by
        // mapping game pixels back onto the page: the canvas is letterboxed and
        // scaled, and that arithmetic is exactly what ResolutionSwitcher owns.
        if (chromePointerIn) return;

        refreshReadout(activeSquare());

        // Right-click puts the chart away, the way every other overlay in the
        // game closes on a cancel. Writing on a square is the note button on
        // the readout of a picked square.
        if (TouchInput.isCancelled()) {
            TouchInput.clear();
            toggleMapState();
            return;
        }

        if (TouchInput.isTriggered()) {
            sheetPressing = true;
            sheetPressMoved = false;
            sheetPressX = TouchInput.x;
            sheetPressY = TouchInput.y;
        } else if (sheetPressing && TouchInput.isPressed()) {
            if (Math.abs(TouchInput.x - sheetPressX) > 8 || Math.abs(TouchInput.y - sheetPressY) > 8) {
                sheetPressMoved = true;
            }
        } else if (sheetPressing && TouchInput.isReleased()) {
            sheetPressing = false;
            if (sheetPressMoved) return;
            const pin = pinAtPointer();
            if (pin && pin.destName && sheetTravelTransport()) { bookPinTravel(pin); return; }
            // Anything else is a square being picked: the readout stops
            // following the pointer and stays on it.
            const square = squareAtPointer();
            if (square) {
                clearPadCursor();
                selectSquare(square);
            }
        }
    }

    // -- In orbit, and on the ground of another world -------------------------
    //
    // The chart is a chart of Earth. Off Earth the same key has to mean the same
    // thing - "show me where I am and where I could go" - which off Earth is the
    // landing grid, not a photograph of Belgium. Orbiting Earth itself the chart
    // is right again, but it is being looked at through a window: every place is
    // named and none of them can be set off for from up there.
    const SPACE_HOME_PLANET = 'Earth';   // i18n-ignore  planet id

    function isInShipCabin() {
        return !!($dataMap && $dataMap.note && /<Biome:\s*Space\s*>/i.test($dataMap.note));
    }

    // The planet the ship is in orbit around, as the star map's own record of
    // it, or null when it is under way or parked in open space.
    function orbitedPlanet() {
        const dm = $gameSystem && $gameSystem.starMapData;
        const ship = dm && dm.playerShip;
        if (!ship || !ship.currentPlanet || !ship.currentSystem) return null;
        if (!dm.getSystem) return { name: ship.currentPlanet };
        const system = dm.getSystem(ship.currentSystem);
        const planets = (system && system.planets) || [];
        for (const planet of planets) {
            if (planet && planet.name === ship.currentPlanet) return planet;
            const moons = (planet && planet.moons) || [];
            for (const moon of moons) {
                if (moon && moon.name === ship.currentPlanet) return moon;
            }
        }
        return { name: ship.currentPlanet };
    }

    // 'landing'  the landing grid belongs here, not the chart
    // 'earth'    the chart, read-only, seen from orbit
    // null       ordinary ground: the chart as it has always been
    function spaceRoute() {
        const GS = window.GalaxySim;
        if (!GS) return null;
        if (isAlienPlanetSurface()) return 'landing';
        if (GS.isOffEarth && GS.isOffEarth()) return 'landing';
        if (!isInShipCabin()) return null;
        const planet = orbitedPlanet();
        if (!planet) return null;
        return planet.name === SPACE_HOME_PLANET ? 'earth' : 'landing';
    }

    // Answers true when the key has been dealt with somewhere else.
    function openLandingGridInstead() {
        const GS = window.GalaxySim;
        if (!GS || typeof GS.openLandingGridPicker !== 'function') return false;
        const planet = isAlienPlanetSurface()
            ? null
            : ((GS.getOffEarthPlanet && GS.getOffEarthPlanet()) || orbitedPlanet());
        try {
            if (GS.openLandingGridPicker(planet)) { SoundManager.playOk(); return true; }
        } catch (e) { /* the renderer is not loaded */ }
        return false;
    }


    // ------------------------------------------------------------------------
    // Input & Update Loops
    // ------------------------------------------------------------------------

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        
        // A quest detail asked for the map on a specific world tile before
        // closing itself; carry it out now that the map scene is running.
        if ($gameTemp && $gameTemp._worldMapFocusRequest) {
            const req = $gameTemp._worldMapFocusRequest;
            $gameTemp._worldMapFocusRequest = null;
            focusWorldMapAt(req.x, req.y);
        }

        // Toggle Map. START button is reserved for the sleep wait menu on
        // controller, so the map toggle answers to 'world_map_toggle' (M key).
        if (Input.isTriggered('world_map_toggle') && !isSheetTyping()) {
            // A manual toggle means the player took control; don't auto-hide later.
            autoOpenedForTravel = false;
            toggleMapState();
        }

        // Interactive Controls (Only in Fullscreen Mode)
        if (currentMapState === 3 && isLiveSprite(worldMapSprite)) {
            updateQuestMarkerInteraction();
            // The sheet's own furniture and pointer: the zoom bar, the country
            // picker, the square readout, the pins and the notes.
            syncChrome();
            updateSheetPointer();
            // The pad's own reading of the same sheet. It runs even while a note
            // box or a square preview is up, because closing those is the one
            // thing a controller has to be able to do from in there.
            updateSheetKeys();
            if (!isSheetTyping()) {
                updateZoomControls();
                updatePanControls();
            }
            // The visible segments change with every pan and zoom step, and the
            // check is cheap, so it rides the same frame rather than a redraw.
            updateFullscreenStreaming();
            // Sandbox: tap a cell on the Bologna overlay to teleport there.
            if ($gameMap.mapId() === BOLOGNA_MAP_ID && isSandboxEnabled()) {
                updateBolognaTeleportClick();
            }
        } else if (chromeEl) {
            // The chart is not up any more: its furniture goes with it, however
            // the map was closed.
            destroyChrome();
            clearSelectedSquare();
        }

        // The chart's own screen-space layer: the town names, the ruled square
        // under the pointer and the square that has been picked.
        refreshSheetLayer();

        // Border arrows for objectives the current pan has pushed off-screen.
        // Called outside the fullscreen branch so closing the map also clears them.
        updateQuestEdgeMarkers();

        updateVehicleTravelDisplay();

        // Drive every city label from a single shared pass (cheap bounds test
        // per sprite, viewport math computed once) instead of N per-sprite updates.
        refreshCityLabelSprites();
    };

    // Detects vehicle fast travel starting/ending and keeps the minimap animating
    // the vehicle's live position while the player rides inside the vehicle.
    function updateVehicleTravelDisplay() {
        const data = getTravelData();
        const timerActive = !!(data && data.timerActive && data.timerRemainingTime > 0);
        // Fast path: no travel timer running and nothing currently tracked. This
        // is the common case (no fast travel in progress), so skip the rest.
        if (!timerActive && !travelOrigin) return;

        const vehTravel = timerActive && !!data.finalDestination &&
            VEHICLE_TRANSPORTS.includes(data.timerTransport);

        if (vehTravel && !travelOrigin) {
            // Travel just started: snapshot the world origin (vars 43/44 still hold
            // it because vehicle travel keeps the player on the interior map).
            travelOrigin = partyWorldSquare();
            if (currentMapState === 0) {
                autoOpenedForTravel = true;
                currentMapState = 2; // full world overview
            }
            refreshWorldMapDisplay();
        } else if (!vehTravel && travelOrigin) {
            // Travel ended (arrived/cancelled): drop the tracking and restore state.
            travelOrigin = null;
            if (autoOpenedForTravel) {
                autoOpenedForTravel = false;
                const savedState = ($gameSystem && typeof $gameSystem._minimapState === 'number' &&
                    $gameSystem._minimapState > 0)
                    ? $gameSystem._minimapState
                    : defaultMinimapState();
                currentMapState = savedState;
                refreshWorldMapDisplay();
            }
        }

        // Throttled live redraw so the dot glides toward the destination.
        if (vehTravel && travelOrigin && currentMapState > 0) {
            travelRefreshCounter++;
            if (travelRefreshCounter % 4 === 0) {
                refreshWorldMapDisplay();
            }
        }
    }

    function updateZoomControls() {
        const zoomSpeed = 0.08;
        let zoomChange = 0;

        // Keyboard Zoom
        if (Input.isPressed('map_zoom_in')) zoomChange += zoomSpeed;
        if (Input.isPressed('map_zoom_out')) zoomChange -= zoomSpeed;

        // Mouse Wheel Zoom
        if (TouchInput.wheelY !== 0) {
            // wheelY is usually +/- 100 or 120. Normalize it.
            zoomChange -= (TouchInput.wheelY / 1000);
        }

        // Right analog stick Y zooms (the controller has no zoom button otherwise)
        if (window.AnalogStickInput) {
            const ry = AnalogStickInput.rightY();
            if (ry !== 0) zoomChange -= ry * zoomSpeed; // push up = zoom in
        }

        if (zoomChange !== 0) {
            const oldScale = zoomScale;
            zoomScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale + zoomChange));

            // Calculate zoom towards center of screen
            const ratio = zoomScale / oldScale;
            const centerX = Graphics.width / 2;
            const centerY = Graphics.height / 2;

            panX = centerX - (centerX - panX) * ratio;
            panY = centerY - (centerY - panY) * ratio;

            worldMapSprite.scale.x = zoomScale;
            worldMapSprite.scale.y = zoomScale;
            worldMapSprite.x = panX;
            worldMapSprite.y = panY;
        }
    }

    function updatePanControls() {
        if (TouchInput.isPressed()) {
            if (!isDragging) {
                isDragging = true;
                lastMouseX = TouchInput.x;
                lastMouseY = TouchInput.y;
            } else {
                const dx = TouchInput.x - lastMouseX;
                const dy = TouchInput.y - lastMouseY;
                
                panX += dx;
                panY += dy;
                
                lastMouseX = TouchInput.x;
                lastMouseY = TouchInput.y;
                
                worldMapSprite.x = panX;
                worldMapSprite.y = panY;
            }
        } else {
            isDragging = false;

            // Left analog stick pans the fullscreen map
            if (window.AnalogStickInput) {
                const ax = AnalogStickInput.leftX();
                const ay = AnalogStickInput.leftY();
                if (ax !== 0 || ay !== 0) {
                    const panSpeed = 12; // px/frame at full deflection
                    panX -= ax * panSpeed;
                    panY -= ay * panSpeed;
                    worldMapSprite.x = panX;
                    worldMapSprite.y = panY;
                }
            }
        }
    }

    // Sandbox click-to-teleport on the draggable Bologna fullscreen overlay.
    // A press that does not move (within a small threshold) is treated as a tap:
    // the clicked grid cell + in-cell position become the warp destination.
    function updateBolognaTeleportClick() {
        if (!window.BolognaMapSystem || !window.BolognaMapSystem.teleportToCell) return;

        if (TouchInput.isTriggered()) {
            bolognaPressing = true;
            bolognaPressMoved = false;
            bolognaPressX = TouchInput.x;
            bolognaPressY = TouchInput.y;
        } else if (bolognaPressing && TouchInput.isPressed()) {
            if (Math.abs(TouchInput.x - bolognaPressX) > 8 ||
                Math.abs(TouchInput.y - bolognaPressY) > 8) {
                bolognaPressMoved = true; // it's a drag-pan, not a tap
            }
        } else if (bolognaPressing && TouchInput.isReleased()) {
            bolognaPressing = false;
            if (bolognaPressMoved) return;

            // Convert screen -> assembled-bitmap pixels (undo pan + zoom).
            const bmpX = (TouchInput.x - panX) / zoomScale;
            const bmpY = (TouchInput.y - panY) / zoomScale;

            const col = BOLOGNA_COL_MIN + Math.floor(bmpX / BOLOGNA_CELL_PX);
            const row = BOLOGNA_ROW_MIN + Math.floor(bmpY / BOLOGNA_CELL_PX);
            if (row < BOLOGNA_ROW_MIN || row > BOLOGNA_ROW_MAX ||
                col < BOLOGNA_COL_MIN || col > BOLOGNA_COL_MAX) return;

            // In-cell tile position (cell drawn at BOLOGNA_CELL_PX for 256 tiles).
            const localPxX = bmpX - (col - BOLOGNA_COL_MIN) * BOLOGNA_CELL_PX;
            const localPxY = bmpY - (row - BOLOGNA_ROW_MIN) * BOLOGNA_CELL_PX;
            const tileX = (localPxX / BOLOGNA_CELL_PX) * BOLOGNA_MAP_TILES;
            const tileY = (localPxY / BOLOGNA_CELL_PX) * BOLOGNA_MAP_TILES;

            if (window.BolognaMapSystem.teleportToCell(row, col, tileX, tileY)) {
                // Close the overlay so the player drops back onto the map.
                currentMapState = 0;
                clearFullscreenCache();
                if (worldMapSprite) worldMapSprite.visible = false;
            }
        }
    }

    // Cancel is the sheet's own key while the sheet is up: right-clicking a
    // square writes on it, and Escape shuts the note box. Neither of them may
    // also open the party menu behind the chart.
    const _Scene_Map_isMenuEnabled_WM = Scene_Map.prototype.isMenuEnabled;
    Scene_Map.prototype.isMenuEnabled = function() {
        if (currentMapState === 3) return false;
        return _Scene_Map_isMenuEnabled_WM.call(this);
    };

    // Block player movement when fullscreen map is open
    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        // Block movement if fullscreen map is open (state 3)
        if (currentMapState === 3) {
            return false;
        }
        return _Game_Player_canMove.call(this);
    };

    // Update visuals on movement
    let lastRenderedTileX = -1;
    let lastRenderedTileY = -1;
    const _Game_Player_updateMove = Game_Player.prototype.updateMove;
    Game_Player.prototype.updateMove = function() {
        _Game_Player_updateMove.call(this);
        // Refresh if visible, but only when the player's tile actually changed.
        // updateMove fires every tween frame; the minimap is tile-based, so
        // redrawing (a full new Bitmap) mid-tween produces identical output.
        if (currentMapState > 0 && (this.x !== lastRenderedTileX || this.y !== lastRenderedTileY)) {
            lastRenderedTileX = this.x;
            lastRenderedTileY = this.y;
            refreshWorldMapDisplay();
        }
        // City labels scroll automatically with tilemap, no need to update on every move
    };

    // ------------------------------------------------------------------------
    // Scene Management Cleanup
    // ------------------------------------------------------------------------

    const _Scene_Base_terminate = Scene_Base.prototype.terminate;
    Scene_Base.prototype.terminate = function() {
        _Scene_Base_terminate.call(this);
        if (worldMapSprite) {
            // Unparent the streamed layer first: the scene destroys its children
            // with their textures, and the base sprite draws the shared world
            // picture the minimap still needs.
            destroyFullscreenLayer();
            if (worldMapSprite.parent) worldMapSprite.parent.removeChild(worldMapSprite);
            worldMapSprite = null;
        }
        removeQuestEdgeMarkers(); // sprites belong to the scene that is ending
        removeCityLabels();
        removeQuestTip(); // a DOM overlay must never outlive its scene
        destroyChrome(); // and neither may the sheet's furniture
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        lastRenderedTileX = -1;
        lastRenderedTileY = -1;
        // A new map may be a new world: the pins, and the region plane the
        // country wash is read off, are both gathered again from scratch.
        sheetInvalidate();

        const mapId = $gameMap.mapId();

        // Portraits do not survive a scene change, so neither does the cover
        // they put over the corner chart: a conversation cut short by a
        // transfer must never leave the chart hidden for good.
        conversationCover = false;

        // Where the party now is, filed once through the coordinate service.
        // This used to parse <Coords X Y> here and write vars 43/44 itself,
        // which took the editor template's default pair literally and stamped
        // 79,125 (or a stale hand-written tag) over the party's real square:
        // the chart then drew a corner of the world they had never been to.
        // syncPlayerWorld reads the same tag with the template filtered out and
        // leaves an alien landing grid alone.
        if (window.WorldMapTransfer && window.WorldMapTransfer.syncPlayerWorld) {
            window.WorldMapTransfer.syncPlayerWorld(mapId);
        }

        // Minimap permanence logic: check if the map explicitly disables minimap (<NoMinimap>)
        const noMinimap = !!($dataMap && $dataMap.note && /<NoMinimap>/i.test($dataMap.note));

        // Retrieve persistent minimap state (default to state 0: hidden)
        let savedState = defaultMinimapState();
        if ($gameSystem && typeof $gameSystem._minimapState === 'number' &&
            $gameSystem._minimapState > 0) {
            savedState = $gameSystem._minimapState;
        }

        // Revert Fullscreen (state 3) back to Minimap (state 1) on scene transfer
        if (savedState === 3) {
            savedState = 1;
            if ($gameSystem) $gameSystem._minimapState = 1;
        }

        currentMapState = (noMinimap || !modeAllowsMinimap()) ? 0 : savedState;

        if (currentMapState > 0) {
            createWorldMapSprite();
            refreshWorldMapDisplay();
        } else if (worldMapSprite) {
            worldMapSprite.visible = false;
        }

        // Initialize city labels on map
        const scene = this;
        const startMapId = mapId;
        setTimeout(() => {
            // Skip if the scene terminated or the map changed within the window,
            // so labels are not built against a terminating/wrong tilemap.
            if (SceneManager._scene !== scene) return;
            if (!$gameMap || $gameMap.mapId() !== startMapId) return;
            createCityLabelsContainer();
            updateCityLabels();
        }, 100);
    };

    // Refresh city labels when events change.
    // Game_Map.refresh() can fire many times in quick succession (every switch /
    // self-switch / variable change that touches event pages). Rebuilding the
    // whole label container on each one is wasteful, so we debounce: a single
    // rebuild is scheduled and coalesces all refreshes within the window.
    let cityLabelRebuildPending = false;
    const _Game_Map_refresh = Game_Map.prototype.refresh;
    Game_Map.prototype.refresh = function() {
        _Game_Map_refresh.call(this);
        if (cityLabelRebuildPending) return;
        if (SceneManager._scene instanceof Scene_Map) {
            cityLabelRebuildPending = true;
            setTimeout(() => {
                cityLabelRebuildPending = false;
                // The scene can have changed inside the debounce window; the
                // labels always belong to whichever tilemap is live now.
                if (!(SceneManager._scene instanceof Scene_Map)) return;
                createCityLabelsContainer();
                updateCityLabels();
            }, 100);
        }
    };

    // ===== PERFORMANCE: cull per-frame updates of off-screen static events =====
    // Map 315 is a 256x256 world map with ~200 events, nearly all static
    // action-button teleports (no autonomous movement, no parallel process).
    // The engine already only renders the visible tile window, but it still
    // runs update() on every event each frame. We skip that work for events
    // well off-screen, keeping the full update for events near the camera plus
    // anything that must run regardless of position: parallel (4) / autorun (3)
    // triggers, events currently moving, and events locked in interaction.
    // Scoped to map 315 only so roaming NPCs on other maps are never frozen.
    const _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        if ($gameMap && $gameMap.mapId() === 315 &&
            this._trigger !== 3 && this._trigger !== 4 &&
            !this._locked && !this.isMoving()) {
            const margin = 4;
            const ox = $gameMap.displayX();
            const oy = $gameMap.displayY();
            if (this._realX < ox - margin ||
                this._realX > ox + $gameMap.screenTileX() + margin ||
                this._realY < oy - margin ||
                this._realY > oy + $gameMap.screenTileY() + margin) {
                return;
            }
        }
        _Game_Event_update.call(this);
    };

})();