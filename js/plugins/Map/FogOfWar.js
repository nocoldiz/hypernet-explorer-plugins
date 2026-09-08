/*:
 * @target MZ
 * @plugindesc v4.0 High-performance fog of war system with vision cones and smooth transitions (Optimized, Persistent, Configurable).
 * @author Omni-Lex (Modified)
 *
 * @param Vision Angle
 * @desc Default vision angle for the player in degrees (360 for full circle)
 * @default 120
 * @type number
 * @min 1
 * @max 360
 *
 * @param Exempt Event Names
 * @desc Events with these names will always be visible (comma-separated)
 * @default NPC,Chest,Trigger
 * @type text
 *
 * @param Vision Blocking Event Names
 * @desc Events with these names will block vision (comma-separated)
 * @default Wall,Pillar,Column,Obstacle
 * @type text
 *
 * @param Update Frequency
 * @desc How often to update fog of war (1 = every frame, 2 = every other frame, etc.)
 * @default 3
 * @type number
 * @min 1
 *
 * @param Ray Count
 * @desc Minimum number of rays cast for vision. More rays are added automatically when the vision range needs them.
 * @default 60
 * @type number
 * @min 10
 * @max 360
 *
 * @param Reset On New Game
 * @desc Reset fog of war data when starting a new game
 * @default true
 * @type boolean
 *
 * @param Chunk Size
 * @desc Size of each fog of war rendering chunk in tiles (smaller = more responsive, larger = better performance)
 * @default 8
 * @type number
 * @min 4
 * @max 32
 *
 * @param Never Seen Color
 * @desc Color for tiles never seen (CSS format)
 * @default #000000
 * @type string
 *
 * @param Previously Seen Color
 * @desc Color for tiles seen before but not currently visible (CSS format)
 * @default rgba(0,0,0,0.6)
 * @type string
 *
 * @param Vision Smoothing
 * @desc How smoothly vision follows the player (0-1, higher is smoother)
 * @default 0.5
 * @type number
 * @decimals 2
 * @min 0.1
 * @max 1.0
 *
 * @param Transition Duration
 * @desc Duration of transition between visible and previously seen (in frames)
 * @default 15
 * @type number
 * @min 1
 * @max 120
 *
 * @param Edge Feathering
 * @desc How much to soften the edges of visible area (0-1, higher is softer)
 * @default 0.3
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 *
 * @param Add To Options Menu
 * @desc Add Fog of War toggle to options menu
 * @default true
 * @type boolean
 *
 * @param Options Menu Text
 * @desc Text to display in the options menu
 * @default Fog of War (WIP)
 * @type string
 *
 * @command toggleFogOfWar
 * @text Toggle Fog of War
 * @desc Enables or disables the fog of war system
 *
 * @param enable
 * @text Enable
 * @desc Enable or disable fog of war
 * @type boolean
 * @default true
 *
 * @command resetFogOfWar
 * @text Reset Fog of War
 * @desc Resets fog of war data for the current map or all maps
 *
 * @param target
 * @text Target
 * @desc Reset current map or all maps
 * @type select
 * @option Current Map
 * @value current
 * @option All Maps
 * @value all
 * @default current
 *
 * @param Reveal Transition Duration
 * @desc Duration of transition when revealing tiles (in frames). Lower values = faster transition.
 * @default 10
 * @type number
 * @min 1
 * @max 60
 *
 * @command revealEntireMap
 * @text Reveal Entire Map
 * @desc Reveals the entire current map
 *
 * @command disableFogForMap
 * @text Disable Fog For Map
 * @desc Disables (or re-enables) fog of war for the current map only
 *
 * @param disable
 * @text Disable
 * @desc Disable fog of war for this map
 * @type boolean
 * @default true
 */

(function () {
    'use strict';

    // RMMZ keys BOTH the parameter set and the plugin commands by the file name
    // (Utils.extractFileName over the plugins.js entry, lowercased), so a plugin
    // that names itself anything else reads an empty parameter set and every
    // event command it registers is a silent no-op. This file is FogOfWar.js and
    // the events call it as "Map/FogOfWar", so the file name is the one name
    // that answers; "FOG_OF_WAR" is kept as a command alias for the older events
    // that still address it that way.
    const pluginName = "FogOfWar";
    const LEGACY_PLUGIN_NAME = "FOG_OF_WAR";
    const COMMAND_KEYS = [pluginName, LEGACY_PLUGIN_NAME];
    const parameters = PluginManager.parameters(pluginName);

    function registerFogCommand(commandName, handler) {
        for (const key of COMMAND_KEYS) {
            PluginManager.registerCommand(key, commandName, handler);
        }
    }

    //=============================================================================
    // Constants & Configuration
    //
    // Three declared parameters are deliberately NOT read: "Vision Angle" (the
    // cone is fixed at VISION_ANGLE below, and the configured 360 would turn
    // every character into a lighthouse), "Transition Duration" (superseded by
    // "Reveal Transition Duration") and "Edge Feathering" (the feathering pass
    // was removed). They stay declared so the plugins.js parameter set is not
    // rewritten under existing installs.
    //=============================================================================

    const DEFAULT_VISION_RANGE = 10;
    const EXEMPT_EVENT_NAMES = (parameters['Exempt Event Names'] || "NPC,Chest,Trigger").split(',').map(s => s.trim()).filter(Boolean);
    const VISION_BLOCKING_EVENT_NAMES = ("Dungeon door,Door,Locked Door,Wall,Pillar,Column,Room,Obstacle").split(',').map(s => s.trim().toLowerCase());  // i18n-ignore  event names
    const UPDATE_FREQUENCY = Math.max(1, Number(parameters['Update Frequency'] || 3));
    const CHUNK_SIZE = Math.max(2, Number(parameters['Chunk Size'] || 8));
    const NEVER_SEEN_COLOR = parameters['Never Seen Color'] || '#000000';
    const PREVIOUSLY_SEEN_COLOR = parameters['Previously Seen Color'] || 'rgba(0,0,0,0.4)';
    const REVEAL_TRANSITION_DURATION = Math.max(1, Number(parameters['Reveal Transition Duration'] || 16));
    const VISION_SMOOTHING = Number(parameters['Vision Smoothing'] || 0.9);
    const ADD_TO_OPTIONS_MENU = parameters['Add To Options Menu'] !== 'false';
    const OPTIONS_MENU_TEXT = parameters['Options Menu Text'] || 'Fog of War (WIP)';
    const RESET_ON_NEW_GAME = parameters['Reset On New Game'] !== 'false';

    const VISION_ANGLE = 110;
    const VISION_ARC = VISION_ANGLE * Math.PI / 180;

    // How many rays the cone is cut into. The configured "Ray Count" is only a
    // FLOOR: a fixed fan is a fan of gaps, because the distance between two
    // neighbouring rays grows with the range. At the configured 10 rays over a
    // 110 degree cone, 18% of the tiles inside the cone at range 10 (and 35% at
    // the range 15 a rooftop grants) were never touched by any ray and stayed
    // pitch black, which is what read as "the screen goes black". Two rays per
    // tile of arc at the far edge covers the cone completely at every range.
    const MIN_RAY_COUNT = Math.min(720, Math.max(8, Number(parameters['Ray Count'] || 60)));
    const RAYS_PER_ARC_TILE = 2;
    const MAX_RAY_COUNT = 720;

    function rayCountFor(range, arc) {
        const arcTiles = Math.max(1, range * Math.max(0.05, arc));
        return Math.min(MAX_RAY_COUNT, Math.max(MIN_RAY_COUNT, Math.ceil(arcTiles * RAYS_PER_ARC_TILE)));
    }

    // Map Feature Constants
    const TERRAIN_WALL = 4;
    const TERRAIN_ROOF = 7;
    const REGION_BLOCK = 10;
    const REGION_EXTENDED_VIEW = 11;
    // Region 30 tiles separate different interiors placed on the same map
    // (same convention as MousePan's interior-divider clamping). They always
    // block vision, and on maps where fog is otherwise disabled they still
    // confine what is visible to the player's current interior.
    const REGION_DIVIDER = 30;
    // Region 31 tiles are exempt from fog of war: they stay fully revealed no
    // matter where the vision sources are. Divider tiles (region 30) touching
    // one of them are revealed as well, but only while player 1 or player 2 is
    // actually facing them (inside the vision cone).
    const REGION_FOG_EXEMPT = 31;

    const OCEAN_BIOME = "Ocean";  // i18n-ignore  biome id

    // Fog states.
    const STATE_UNSEEN = 0;
    const STATE_SEEN = 1;
    const STATE_VISIBLE = 2;

    // Vision blocker classes stored in the terrain cache.
    const BLOCK_NONE = 0;
    const BLOCK_WALL = 1;
    const BLOCK_ROOF = 2;
    const BLOCK_ALWAYS = 3;

    // Buffers rebuilt from scratch by initializeFogOfWar on every Game_Map.setup
    // (which also runs on load). They are made non-enumerable so JsonEx leaves
    // them out of the savegame: they are large typed arrays and _eventMap holds
    // live Game_Event references, which JsonEx would serialize as a second copy
    // of every event on the map.
    const TRANSIENT_MAP_FIELDS = [
        '_fogOfWarData', '_fogTransitionTimers', '_dirtyChunks', '_dirtyChunkScratch',
        '_activeTransitions', '_transitionDoneScratch', '_terrainCache', '_eventMap', '_eventMapOccupied', '_eventMapSig',
        '_visibleIndices', '_lastVisibleIndices', '_currentFrameVisible',
        '_fogExemptIndices', '_fogPeekDividerIndices', '_eventVisionConeTiles',
        '_fogDiveWater', '_fogDiveKey', '_wallBfsQueue', '_wallBfsVisitedStamp', '_wallBfsStamp'
    ];

    //=============================================================================
    // Module state
    //=============================================================================

    // Enabled by the plugin command; ANDed with the player's option below.
    let commandEnabled = true;
    // Set when the fog keeps throwing. The player's saved option is never
    // rewritten (the old code wrote ConfigManager.fogOfWar = false and saved it,
    // so one transient error turned the feature off for good); a single failure
    // only takes the current map out, and the session is given up on after
    // ERROR_LIMIT of them.
    const ERROR_LIMIT = 3;
    let sessionDisabled = false;
    let errorCount = 0;
    let updateCounter = 0;

    // Deferred full refresh, in frames. Replaces the old setTimeout(..., 100)
    // calls, which ran on wall-clock time and could land in another scene.
    let pendingRefreshFrames = 0;
    let pendingRefreshReload = false;

    function fogEnabled() {
        // Off unless the player turned it on: the option defaults to false, so
        // an undefined/missing value must read as "off" too.
        return !sessionDisabled && commandEnabled && ConfigManager.fogOfWar === true;
    }

    function requestFullRefresh(frames, reload) {
        pendingRefreshFrames = Math.max(pendingRefreshFrames, Math.max(1, frames | 0));
        if (reload) pendingRefreshReload = true;
    }

    function fogError(e) {
        errorCount++;
        if ($gameMap) {
            $gameMap._fogOfWarDisabled = true;
            // "Disabled" alone is not enough on a map carrying region-30
            // interior dividers (MousePan's convention, unrelated to fog):
            // isDividerOnlyFog() reads _fogOfWarDisabled as "fog is inactive,
            // so fall back to enforcing dividers", not "something broke, show
            // everything". Left unmarked, an error here fails CLOSED - the
            // whole map goes black except the player's current flood-filled
            // room and whatever is exempt from fog (NPC/Chest/Trigger events,
            // region 31) - instead of failing open. This flag tells
            // isDividerOnlyFog() and fogOfWarState() to skip the divider
            // fallback and reveal the map outright, the actual fail-safe.
            $gameMap._fogOfWarErrorFallback = true;
        }
        if (errorCount >= ERROR_LIMIT) sessionDisabled = true;
        console.error(`FogOfWar: error ${errorCount}/${ERROR_LIMIT}, fog off for this map` +
            (sessionDisabled ? ' and for the rest of the session' : ''), e);
    }

    // Hide the transient buffers from JsonEx. Called from both initialize and
    // setup: a Game_Map restored from a savegame is decoded, never constructed,
    // so its property descriptors have to be re-declared on load.
    function hideTransientFields(map) {
        for (const key of TRANSIENT_MAP_FIELDS) {
            const desc = Object.getOwnPropertyDescriptor(map, key);
            if (desc && !desc.enumerable) continue;
            if (desc && !desc.configurable) continue;
            Object.defineProperty(map, key, {
                value: desc ? map[key] : undefined,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }

    function parseCssColor(cssColor) {
        const css = String(cssColor || '').trim();
        if (css.startsWith('#')) {
            const hex = css.slice(1);
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                return (r << 16) | (g << 8) | b;
            }
            const value = parseInt(hex.slice(0, 6), 16);
            return isNaN(value) ? 0x000000 : value;
        }
        const rgbaMatch = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (rgbaMatch) {
            return (parseInt(rgbaMatch[1], 10) << 16) | (parseInt(rgbaMatch[2], 10) << 8) | parseInt(rgbaMatch[3], 10);
        }
        return 0x000000;
    }

    // One reading of "how opaque is a tile that has been seen but is not visible
    // now". The old code answered this twice with different fallbacks (0.4 in
    // the state target, 1.0 in the palette), so a hex colour made the two
    // disagree and the palette stopped separating seen from never-seen.
    function cssAlpha(cssColor, fallback) {
        const match = String(cssColor || '').match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
        if (match) {
            const value = parseFloat(match[1]);
            if (!isNaN(value)) return Math.min(1, Math.max(0, value));
        }
        const hex = String(cssColor || '').trim();
        if (/^#[0-9a-f]{8}$/i.test(hex)) return parseInt(hex.slice(7, 9), 16) / 255;
        return fallback;
    }

    const BASE_ALPHA = cssAlpha(PREVIOUSLY_SEEN_COLOR, 0.4);
    const SEEN_TIMER_TARGET = Math.floor(BASE_ALPHA * 255);

    function timerTargetFor(state) {
        if (state === STATE_VISIBLE) return 0;
        if (state === STATE_SEEN) return SEEN_TIMER_TARGET;
        return 255;
    }

    function visionSources() {
        const list = [];
        if ($gamePlayer) list.push($gamePlayer);
        const split = window.$gameSplitScreen;
        if (split && split.active && split.p2Event) list.push(split.p2Event);
        return list;
    }

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    registerFogCommand("toggleFogOfWar", args => {
        commandEnabled = args.enable === "true";
        if (commandEnabled) sessionDisabled = false;
        if (ADD_TO_OPTIONS_MENU) {
            ConfigManager.fogOfWar = commandEnabled;
            ConfigManager.save();
        }
        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
            SceneManager._scene._spriteset.refreshFogOfWar(true);
        }
    });

    registerFogCommand("disableFogForMap", args => {
        const disable = args.disable === "true";
        if (!$gameMap) return;
        $gameMap._fogOfWarDisabled = disable;
        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
            SceneManager._scene._spriteset.refreshFogOfWar(!disable);
        }
    });

    registerFogCommand("resetFogOfWar", args => {
        const target = args.target || "current";
        if (target === "current") {
            $gameSystem.resetFogOfWarForMap($gameMap.fogDataKey());
        } else {
            $gameSystem.resetAllFogOfWar();
        }
        $gameMap.initializeFogOfWar();
        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
            SceneManager._scene._spriteset.refreshFogOfWar(true);
        }
    });

    registerFogCommand("revealEntireMap", () => {
        if (!$gameMap || !$gameMap.ensureFogBuffers()) return;
        const data = $gameMap._fogOfWarData;
        for (let i = 0; i < data.length; i++) {
            $gameMap.setFogOfWarStateByIndex(i, STATE_VISIBLE, true);
        }
        $gameMap._forceVisionUpdate = true;
        $gameMap.markAllChunksDirty();
        $gameSystem.saveCurrentFogData();
        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
            SceneManager._scene._spriteset.refreshFogOfWar();
        }
    });

    //=============================================================================
    // DataManager & ConfigManager
    //=============================================================================

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function () {
        _DataManager_setupNewGame.call(this);
        if (RESET_ON_NEW_GAME && $gameSystem) {
            $gameSystem.resetAllFogOfWar();
        }
    };

    // Work in progress: off unless the player opts in, both here and in
    // character creation (CharacterCreation.js).
    ConfigManager.fogOfWar = false;

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function () {
        const config = _ConfigManager_makeData.call(this);
        config.fogOfWar = this.fogOfWar;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function (config) {
        _ConfigManager_applyData.call(this, config);
        this.fogOfWar = this.readFlag(config, 'fogOfWar', false);
    };

    if (ADD_TO_OPTIONS_MENU) {
        if (window.GameOptions) {
            window.GameOptions.registerOption('fogOfWar', OPTIONS_MENU_TEXT,
                () => ConfigManager.fogOfWar,
                (value) => ConfigManager.fogOfWar = value,
                'gameplay', 'boolean');
        } else {
            const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
            Window_Options.prototype.addGeneralOptions = function () {
                _Window_Options_addGeneralOptions.call(this);
                this.addCommand(OPTIONS_MENU_TEXT, 'fogOfWar');
            };
        }
    }

    //=============================================================================
    // Game_System - fog persistence
    //
    // Fog states live in window.$fogOfWarData (one entry per map) and are
    // written to their own save file, not into the savegame object graph.
    //=============================================================================

    Game_System.prototype.getFogOfWarData = function (mapId) {
        if (!window.$fogOfWarData) window.$fogOfWarData = {};
        return window.$fogOfWarData[mapId] || null;
    };

    Game_System.prototype.setFogOfWarData = function (mapId, data) {
        if (!window.$fogOfWarData) window.$fogOfWarData = {};
        window.$fogOfWarData[mapId] = data;
    };

    Game_System.prototype.saveCurrentFogData = function () {
        if (!$gameMap || !$gameMap._fogOfWarData) return;
        const key = $gameMap.fogDataKey ? $gameMap.fogDataKey() : $gameMap.mapId();
        // Store compact Uint8Array snapshot in memory without bloating with transition timers
        this.setFogOfWarData(key, new Uint8Array($gameMap._fogOfWarData));
    };

    Game_System.prototype.resetFogOfWarForMap = function (mapId) {
        if (window.$fogOfWarData && window.$fogOfWarData[mapId]) {
            delete window.$fogOfWarData[mapId];
        }
    };

    Game_System.prototype.resetAllFogOfWar = function () {
        window.$fogOfWarData = {};
    };

    Game_System.prototype.reloadFogOfWarLighting = function () {
        if (!$gameMap) return;
        $gameMap._terrainCacheDirty = true;
        $gameMap.initializeFogOfWar();
        if ($gamePlayer) $gameMap.updateFogOfWar();
    };

    const _DataManager_saveGame = DataManager.saveGame;
    DataManager.saveGame = function (savefileId) {
        // Fog data is not serialized during play, so sync the current map's fog
        // into window.$fogOfWarData at save time.
        if ($gameSystem) $gameSystem.saveCurrentFogData();
        return _DataManager_saveGame.call(this, savefileId).then(contents => {
            if (window.$fogOfWarData) {
                // Prepare a clean JSON-serializable object without saving redundant transition timers
                const serializable = {};
                for (const mapKey of Object.keys(window.$fogOfWarData)) {
                    const entry = window.$fogOfWarData[mapKey];
                    if (entry instanceof Uint8Array) {
                        serializable[mapKey] = Array.from(entry);
                    } else if (entry && entry.states) {
                        serializable[mapKey] = Array.from(entry.states);
                    } else if (Array.isArray(entry)) {
                        serializable[mapKey] = entry;
                    }
                }
                // Chain the fog write into the returned promise so the main save
                // does not resolve until fog persistence completes (or fails).
                return StorageManager.saveObject(`fog_${savefileId}`, serializable)
                    .catch(e => console.error("FogOfWar: Failed to save fog data", e))
                    .then(() => contents);
            }
            return contents;
        });
    };

    const _DataManager_loadGame = DataManager.loadGame;
    DataManager.loadGame = function (savefileId) {
        return _DataManager_loadGame.call(this, savefileId).then(success => {
            if (!success) return success;
            return StorageManager.loadObject(`fog_${savefileId}`).then(fogData => {
                window.$fogOfWarData = fogData || {};
                return true;
            }).catch(e => {
                console.log("FogOfWar: No fog data found or error loading it", e);
                window.$fogOfWarData = {};
                return true; // Still success for main load
            });
        });
    };

    //=============================================================================
    // Game_Map - lifecycle
    //=============================================================================

    const _Game_Map_initialize = Game_Map.prototype.initialize;
    Game_Map.prototype.initialize = function () {
        _Game_Map_initialize.call(this);
        hideTransientFields(this);
        this._fogOfWarData = null;
        this._fogTransitionTimers = null;
        this._dirtyChunks = null;
        this._activeTransitions = new Set();
        this._transitionDoneScratch = [];
        this._terrainCache = null;
        this._eventMap = [];
        this._eventMapOccupied = [];
        this._eventMapSig = null;
        this._visibleIndices = [];
        this._lastVisibleIndices = [];
        this._currentFrameVisible = null;
        this._fogExemptIndices = [];
        this._fogPeekDividerIndices = [];
        this._fogDiveWater = null;
        this.resetVisionTracking();
        this._visionRange = DEFAULT_VISION_RANGE;
        this._forceVisionUpdate = true;
    };

    Game_Map.prototype.resetVisionTracking = function () {
        this._playerLastX = -1;
        this._playerLastY = -1;
        this._playerLastDir = -1;
        this._player2LastX = -1;
        this._player2LastY = -1;
        this._player2LastDir = -1;
        this._visionX = 0;
        this._visionY = 0;
        this._visionX2 = 0;
        this._visionY2 = 0;
        this._dividerFogKey = null;
    };

    //=============================================================================
    // Procedural structures
    //
    // Every procedural interior shares map id 636 with the open-air square it
    // was entered from, so the map id alone can neither say whether fog belongs
    // here nor keep one cellar's explored tiles apart from the next one's.
    // window.ProceduralInteriors is the only thing that can tell them apart,
    // and the key below is what the fog is filed under while one is loaded.
    //
    // Only the surface structures are fogged. The layers below the surface are
    // deliberately left alone: they are open descents, not rooms.
    //=============================================================================

    function proceduralInteriorFogKey() {
        const api = window.ProceduralInteriors;
        if (!api || typeof api.currentStructureBiome !== 'function') return null;
        let biome = "";
        try {
            biome = api.currentStructureBiome() || "";
        } catch (e) {
            return null;
        }
        if (!biome) return null;
        const data = ($gameSystem && $gameSystem._procGenData) || {};
        const x = data.originX === undefined ? "?" : data.originX;
        const y = data.originY === undefined ? "?" : data.originY;
        return `636:${x},${y}:${biome}`;
    }

    // What the current map's fog is stored under. Every authored map is its own
    // id; a procedural structure is its square and biome, so walking out of one
    // cellar and into the next does not hand the second one the first one's
    // explored tiles.
    Game_Map.prototype.fogDataKey = function () {
        return this._procInteriorFogKey || this._mapId;
    };

    // Only one procedural structure is ever the current one, and its explored
    // tiles are worth nothing once the party has left the square, so drop the
    // other structures' fog rather than let the table grow for a whole session.
    function pruneStaleProceduralFog(keepKey) {
        const store = window.$fogOfWarData;
        if (!store) return;
        for (const key of Object.keys(store)) {
            if (typeof key === 'string' && key.startsWith('636:') && key !== keepKey) {
                delete store[key];
            }
        }
    }

    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        const previousMapId = this._mapId;
        _Game_Map_setup.call(this, mapId);
        hideTransientFields(this);

        // MovementInteractionSystem caches the diving water tiles on the map it
        // built them for. It is a Set on Game_Map, so it does not survive a
        // savegame (JsonEx turns it into a plain {} whose .has throws) and it is
        // not cleared on a transfer, which left the fog reading another map's
        // tile indices. Drop it whenever the map underneath it changes.
        if (previousMapId !== mapId || !this.hasUsableDiveWater()) {
            this._underwaterWaterTiles = null;
        }

        this._fogOfWarDisabled = false;
        this._fogOfWarErrorFallback = false;
        this._visibleFogOfWar = false;
        this._isExteriorMap = false;
        if ($dataMap && $dataMap.note) {
            this._fogOfWarDisabled = $dataMap.note.includes("<DisableFogOfWar>");
            this._visibleFogOfWar = $dataMap.note.includes("<VisibleFogOfWar>");
            this._isExteriorMap = $dataMap.note.includes("<Exterior>");
        }

        // A procedural structure (Dungeon, Crypt, Sewer, LootCellar,
        // TempleInside, CaveDen, PatronVault...) is generated onto map 636 and
        // so inherits that map's <Exterior> note, which is only true of the
        // open-air square it was entered from. Inside one, the roof is a roof.
        this._procInteriorFogKey = proceduralInteriorFogKey();
        if (this._procInteriorFogKey) this._isExteriorMap = false;

        // The world map (315) and the procedural map (636) are the same world
        // and must never carry fog. Force it off entirely, dividers included:
        // region 30 means something else on the world map, so the divider-only
        // fog path below must not claim it either (#57). The one exception is a
        // procedural structure standing on 636: it is an enclosed place of its
        // own and is fogged like any authored dungeon.
        this._fogOfWarForceOff = (mapId === 315 || (mapId === 636 && !this._procInteriorFogKey));
        if (this._fogOfWarForceOff) {
            $gameSystem.resetFogOfWarForMap(mapId);
            this._fogOfWarDisabled = true;
        }
        pruneStaleProceduralFog(this._procInteriorFogKey);

        this.resetVisionTracking();
        this.initializeFogOfWar();
        this.loadVisionRangeFromMapNotes();

        // $gamePlayer is still standing on the outgoing map's tile here
        // (performTransfer locates it after setup), so these are placeholders;
        // _forceVisionUpdate makes the first real update snap them into place.
        if ($gamePlayer) {
            this._visionX = $gamePlayer.x;
            this._visionY = $gamePlayer.y;
        }
        const split = window.$gameSplitScreen;
        if (split && split.active && split.p2Event) {
            this._visionX2 = split.p2Event.x;
            this._visionY2 = split.p2Event.y;
        } else {
            this._visionX2 = this._visionX;
            this._visionY2 = this._visionY;
        }
    };

    Game_Map.prototype.loadVisionRangeFromMapNotes = function () {
        this._visionRange = DEFAULT_VISION_RANGE;
        if ($dataMap && $dataMap.note) {
            const match = $dataMap.note.match(/<VisionRange:(\d+)>/i);
            if (match) {
                const value = parseInt(match[1], 10);
                if (!isNaN(value) && value > 0) this._visionRange = value;
            }
        }
    };

    Game_Map.prototype.visionRange = function () {
        return this._visionRange || DEFAULT_VISION_RANGE;
    };

    Game_Map.prototype.initializeFogOfWar = function () {
        hideTransientFields(this);

        const size = this.width() * this.height();
        const savedData = $gameSystem ? $gameSystem.getFogOfWarData(this.fogDataKey()) : null;

        let rawStates = null;
        if (savedData) {
            if (savedData instanceof Uint8Array && savedData.length === size) {
                rawStates = savedData;
            } else if (savedData.states && savedData.states.length === size) {
                rawStates = savedData.states;
            } else if (Array.isArray(savedData) && savedData.length === size) {
                rawStates = savedData;
            }
        }

        if (rawStates) {
            this._fogOfWarData = new Uint8Array(rawStates);
        } else {
            this._fogOfWarData = new Uint8Array(size);
        }

        this._fogTransitionTimers = new Int16Array(size);
        for (let i = 0; i < size; i++) {
            this._fogTransitionTimers[i] = timerTargetFor(this._fogOfWarData[i]);
        }

        this._activeTransitions = new Set();
        this._transitionDoneScratch = [];
        this._terrainCache = new Uint8Array(size);
        this._terrainCacheDirty = true;

        const chunksX = Math.ceil(this.width() / CHUNK_SIZE);
        const chunksY = Math.ceil(this.height() / CHUNK_SIZE);
        this._dirtyChunks = new Uint8Array(chunksX * chunksY).fill(1);

        this.refreshEventMap();

        this._visibleIndices = [];
        this._currentFrameVisible = new Uint8Array(size);
        this._lastVisibleIndices = [];

        // One pass over the map fills the terrain cache AND the region lists
        // (the old code walked every tile three separate times).
        this.refreshTerrainCache();
        this.refreshDiveRestriction();
        this.applyFogExemptTiles(true);

        for (let i = 0; i < size; i++) {
            if (this._fogOfWarData[i] === STATE_VISIBLE) this._lastVisibleIndices.push(i);
        }

        this._playerLastX = -1;
        this._playerLastY = -1;
        this._playerLastDir = -1;
        this._player2LastX = -1;
        this._player2LastY = -1;
        this._player2LastDir = -1;
        this._dividerFogKey = null;
        this._forceVisionUpdate = true;
    };

    // Every entry point calls this before touching the buffers. A Game_Map that
    // came back from a savegame, or one whose map size changed under it, can be
    // holding plain objects where typed arrays are expected (JsonEx does not
    // preserve either typed arrays or Sets), and the old code answered that in
    // four different places with three different guards.
    Game_Map.prototype.ensureFogBuffers = function () {
        const size = this.width() * this.height();
        if (size <= 0) return false;

        const badStates = !this._fogOfWarData || typeof this._fogOfWarData.fill !== 'function' || this._fogOfWarData.length !== size;
        const badTimers = !this._fogTransitionTimers || typeof this._fogTransitionTimers.fill !== 'function' || this._fogTransitionTimers.length !== size;
        if (badStates || badTimers) {
            this.initializeFogOfWar();
            return !!this._fogOfWarData && this._fogOfWarData.length === size;
        }

        if (!(this._activeTransitions instanceof Set)) this._activeTransitions = new Set();
        if (!Array.isArray(this._transitionDoneScratch)) this._transitionDoneScratch = [];
        if (!this._currentFrameVisible || typeof this._currentFrameVisible.fill !== 'function' || this._currentFrameVisible.length !== size) {
            this._currentFrameVisible = new Uint8Array(size);
        }
        if (!Array.isArray(this._visibleIndices)) this._visibleIndices = [];
        if (!Array.isArray(this._lastVisibleIndices)) this._lastVisibleIndices = [];
        if (!Array.isArray(this._fogExemptIndices)) this._fogExemptIndices = [];
        if (!Array.isArray(this._fogPeekDividerIndices)) this._fogPeekDividerIndices = [];
        if (!Array.isArray(this._eventMap)) this._eventMap = [];
        if (!Array.isArray(this._eventMapOccupied)) this._eventMapOccupied = [];

        const chunkCount = Math.ceil(this.width() / CHUNK_SIZE) * Math.ceil(this.height() / CHUNK_SIZE);
        if (!this._dirtyChunks || typeof this._dirtyChunks.fill !== 'function' || this._dirtyChunks.length !== chunkCount) {
            this._dirtyChunks = new Uint8Array(chunkCount).fill(1);
        }
        if (!this._terrainCache || typeof this._terrainCache.fill !== 'function' || this._terrainCache.length !== size) {
            this._terrainCache = new Uint8Array(size);
            this._terrainCacheDirty = true;
        }
        return true;
    };

    Game_Map.prototype.normalizePos = function (x, y) {
        if (this.isLoopHorizontal()) x = (x + this.width()) % this.width();
        if (this.isLoopVertical()) y = (y + this.height()) % this.height();
        return { x, y, isValid: x >= 0 && y >= 0 && x < this.width() && y < this.height() };
    };

    //=============================================================================
    // Game_Map - event map
    //=============================================================================

    // Rebuild the event map only when an event actually changed tile (or its
    // priority changed) since the last rebuild - the full rebuild is expensive.
    Game_Map.prototype.refreshEventMapIfNeeded = function () {
        const events = this.events();
        const needed = events.length * 3;
        let sig = this._eventMapSig;
        let dirty = false;
        if (!sig || typeof sig.length !== 'number' || sig.length !== needed || typeof sig.subarray !== 'function') {
            sig = new Int32Array(needed);
            this._eventMapSig = sig;
            dirty = true;
        }
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const prio = typeof event.priorityType === 'function' ? event.priorityType() : 0;
            const j = i * 3;
            if (sig[j] !== event.x || sig[j + 1] !== event.y || sig[j + 2] !== prio) {
                sig[j] = event.x;
                sig[j + 1] = event.y;
                sig[j + 2] = prio;
                dirty = true;
            }
        }
        if (dirty) this.refreshEventMap();
    };

    Game_Map.prototype.refreshEventMap = function () {
        const width = this.width();
        const size = width * this.height();
        if (!Array.isArray(this._eventMap) || this._eventMap.length !== size) {
            this._eventMap = new Array(size);
            this._eventMapOccupied = [];
        } else {
            // Fast sparse clear: only reset indices where events were actually recorded
            const occupied = this._eventMapOccupied || [];
            for (let i = 0; i < occupied.length; i++) {
                const idx = occupied[i];
                if (this._eventMap[idx]) this._eventMap[idx].length = 0;
            }
            occupied.length = 0;
        }

        const occupied = this._eventMapOccupied || (this._eventMapOccupied = []);
        const events = this.events();
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            event._isVisionBlocking = this.isVisionBlockingEvent(event);
            if (this.isValid(event.x, event.y)) {
                const index = event.y * width + event.x;
                if (!this._eventMap[index]) {
                    this._eventMap[index] = [event];
                    occupied.push(index);
                } else {
                    if (this._eventMap[index].length === 0) occupied.push(index);
                    this._eventMap[index].push(event);
                }
            }
        }
    };

    Game_Map.prototype.isVisionBlockingEvent = function (event) {
        if (!event || typeof event.event !== 'function') return false;
        const data = event.event();
        if (!data || (typeof event.priorityType === 'function' && event.priorityType() !== 1)) return false;

        const name = (data.name || "").toLowerCase();
        return VISION_BLOCKING_EVENT_NAMES.some(blocker => blocker && name.includes(blocker));
    };

    Game_Map.prototype.isEnemyEvent = function (event) {
        if (!event || typeof event.event !== 'function') return false;
        const data = event.event();
        return !!(data && data.note && /^\d+$/.test(data.note.trim()));
    };

    Game_Map.prototype.isExemptEventName = function (event) {
        if (!event || typeof event.event !== 'function') return false;
        // Event names are static, so cache the result on the event.
        if (event._fowExempt === undefined) {
            const data = event.event();
            event._fowExempt = !!(data && EXEMPT_EVENT_NAMES.some(exempt => (data.name || "").includes(exempt)));
        }
        return event._fowExempt;
    };

    //=============================================================================
    // Game_Map - terrain cache and region lists
    //=============================================================================

    // One walk of the map answers three questions: what blocks vision, where
    // the fog-exempt tiles (region 31) are, and which divider tiles (region 30)
    // touch one of them.
    Game_Map.prototype.refreshTerrainCache = function () {
        const width = this.width();
        const height = this.height();
        const size = width * height;

        if (!this._terrainCache || typeof this._terrainCache.fill !== 'function' || this._terrainCache.length !== size) {
            this._terrainCache = new Uint8Array(size);
        }

        const exempt = [];
        const dividers = [];
        let hasDividers = false;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const tag = this.terrainTag(x, y);
                const region = this.regionId(x, y);

                let blockType = BLOCK_NONE;
                if (region === REGION_BLOCK) blockType = BLOCK_ALWAYS;
                else if (region === REGION_DIVIDER) blockType = BLOCK_ALWAYS; // interior divider: always blocks
                else if (region === REGION_EXTENDED_VIEW) blockType = BLOCK_NONE;
                else if (tag === TERRAIN_WALL) blockType = BLOCK_WALL;
                else if (tag === TERRAIN_ROOF) blockType = BLOCK_ROOF;

                this._terrainCache[index] = blockType;

                if (region === REGION_FOG_EXEMPT) exempt.push(index);
                else if (region === REGION_DIVIDER) {
                    hasDividers = true;
                    dividers.push(index);
                }
            }
        }

        this._fogExemptIndices = exempt;
        this._fogPeekDividerIndices = exempt.length > 0 ? this.dividersTouching(exempt, dividers) : [];
        this._hasVisionDividers = this._fogOfWarForceOff ? false : hasDividers;
        this._terrainCacheDirty = false;
    };

    // The divider tiles standing in the 8-neighbourhood of a fog-exempt tile.
    Game_Map.prototype.dividersTouching = function (exempt, dividers) {
        if (!dividers.length) return [];
        const width = this.width();
        const height = this.height();
        const isDivider = new Uint8Array(width * height);
        for (let i = 0; i < dividers.length; i++) isDivider[dividers[i]] = 1;

        const taken = new Uint8Array(width * height);
        const peek = [];
        for (let i = 0; i < exempt.length; i++) {
            const x = exempt[i] % width;
            const y = (exempt[i] / width) | 0;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const nx = x + ox;
                    const ny = y + oy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const index = ny * width + nx;
                    if (taken[index] || !isDivider[index]) continue;
                    taken[index] = 1;
                    peek.push(index);
                }
            }
        }
        return peek;
    };

    Game_Map.prototype.detectVisionDividers = function () {
        if (this._fogOfWarForceOff) return false;
        if (this._terrainCacheDirty) this.refreshTerrainCache();
        return !!this._hasVisionDividers;
    };

    Game_Map.prototype.isVisionBlocking = function (x, y, playerOnRoof = false) {
        const width = this.width();
        if (x < 0 || y < 0 || x >= width || y >= this.height()) return true;
        if (this._terrainCacheDirty) this.refreshTerrainCache();

        const staticBlocks = this._terrainCache[y * width + x];
        if (playerOnRoof ? (staticBlocks === BLOCK_ALWAYS) : (staticBlocks > BLOCK_NONE)) return true;

        const events = this._eventMap ? this._eventMap[y * width + x] : null;
        if (events) {
            for (let i = 0; i < events.length; i++) {
                if (events[i]._isVisionBlocking) return true;
            }
        }
        return false;
    };

    //=============================================================================
    // Game_Map - the diving restriction
    //
    // While the party is underwater only water tiles may be revealed, so the
    // dry map around the dive stays black. That rule used to be evaluated per
    // TILE inside setFogOfWarStateByIndex (re-deriving the proc-gen dive state,
    // Array.includes and all, several hundred times a frame) and, worse, it
    // refused EVERY reveal when the map carried no water cache - which is the
    // case on any map the dive did not start on, on a savegame loaded while
    // underwater, and on a procedural ocean layer, where nothing calls
    // enterDiveMode at all. The result was a map nothing could ever reveal:
    // one flat black sheet over the whole screen.
    //
    // It is now resolved ONCE per fog pass into a tile set, and when no usable
    // water answer exists the restriction is simply dropped.
    //=============================================================================

    Game_Map.prototype.hasUsableDiveWater = function () {
        const set = this._underwaterWaterTiles;
        return !!(set && typeof set.has === 'function' && typeof set.size === 'number' && set.size > 0);
    };

    Game_Map.prototype.isPartyDiving = function () {
        if ($gamePlayer && $gamePlayer._isDiving) return true;
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || !pg.biomeLayerStack || pg.biomeLayerStack.length === 0) return false;
        return pg.currentBiome === OCEAN_BIOME || pg.biomeLayerStack.indexOf(OCEAN_BIOME) >= 0;
    };

    Game_Map.prototype.buildDiveWaterSet = function () {
        const width = this.width();
        const height = this.height();
        const set = new Set();
        const ask = window.MovementSystem && typeof window.MovementSystem.isWaterTile === 'function'
            ? window.MovementSystem.isWaterTile
            : null;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const isWater = ask ? ask(x, y) : (this.regionId(x, y) === 99 || this.terrainTag(x, y) === 3);
                if (isWater) set.add(y * width + x);
            }
        }
        return set;
    };

    Game_Map.prototype.refreshDiveRestriction = function () {
        const diving = this.isPartyDiving();
        const key = diving ? this._mapId + ':' + this.width() + 'x' + this.height() : '';
        if (key === this._fogDiveKey) return;
        this._fogDiveKey = key;

        if (!diving) {
            this._fogDiveWater = null;
            return;
        }
        if (this.hasUsableDiveWater()) {
            this._fogDiveWater = this._underwaterWaterTiles;
            return;
        }
        const built = this.buildDiveWaterSet();
        // No water anywhere means the "diving" reading is wrong for this map
        // (a stale proc-gen layer stack, a transfer out of the dive). Leave the
        // map unrestricted rather than blacking it out.
        this._fogDiveWater = built.size > 0 ? built : null;
    };

    //=============================================================================
    // Game_Map - fog state
    //=============================================================================

    Game_Map.prototype.fogOfWarState = function (x, y) {
        if (window.dreamActive) return STATE_VISIBLE;
        // On divider maps the real fog data still matters even when fog is
        // globally off / disabled for the map, so we don't short-circuit here.
        if ((this._fogOfWarDisabled || !fogEnabled()) && (!this._hasVisionDividers || this._fogOfWarErrorFallback)) return STATE_VISIBLE;
        const pos = this.normalizePos(x, y);
        if (!pos.isValid) return STATE_UNSEEN;
        if (this.regionId(pos.x, pos.y) === REGION_FOG_EXEMPT) return STATE_VISIBLE;
        if (!this._fogOfWarData) return STATE_VISIBLE;
        return this._fogOfWarData[pos.y * this.width() + pos.x] || STATE_UNSEEN;
    };

    Game_Map.prototype.isPositionVisible = function (x, y) {
        return this.fogOfWarState(x, y) === STATE_VISIBLE;
    };

    Game_Map.prototype.fogTransitionTimer = function (x, y) {
        const pos = this.normalizePos(x, y);
        if (!pos.isValid || !this._fogTransitionTimers) return 0;
        return this._fogTransitionTimers[pos.y * this.width() + pos.x] || 0;
    };

    Game_Map.prototype.setFogOfWarState = function (x, y, state, force = false) {
        const pos = this.normalizePos(x, y);
        if (pos.isValid) {
            this.setFogOfWarStateByIndex(pos.y * this.width() + pos.x, state, force);
        }
    };

    // force = reveal even under the diving restriction. Used for the tiles a
    // vision source is standing on, which must never be blacked out.
    Game_Map.prototype.setFogOfWarStateByIndex = function (index, state, force = false) {
        const data = this._fogOfWarData;
        if (!data || index < 0 || index >= data.length) return;

        if (state === STATE_VISIBLE && !force && this._fogDiveWater && !this._fogDiveWater.has(index)) {
            return; // Do not reveal tiles that are not water while diving
        }

        if (data[index] !== state) {
            data[index] = state;
            if (!(this._activeTransitions instanceof Set)) this._activeTransitions = new Set();
            this._activeTransitions.add(index);

            const width = this.width();
            this.markChunkDirty(index % width, (index / width) | 0);
        }

        if (state === STATE_VISIBLE && this._currentFrameVisible && !this._currentFrameVisible[index]) {
            this._currentFrameVisible[index] = 1;
            this._visibleIndices.push(index);
        }
    };

    Game_Map.prototype.markChunkDirty = function (x, y) {
        if (!this._dirtyChunks) return;
        const chunkX = (x / CHUNK_SIZE) | 0;
        const chunkY = (y / CHUNK_SIZE) | 0;
        const chunksX = Math.ceil(this.width() / CHUNK_SIZE);
        const chunksY = Math.ceil(this.height() / CHUNK_SIZE);
        if (chunkX >= 0 && chunkY >= 0 && chunkX < chunksX && chunkY < chunksY) {
            this._dirtyChunks[chunkY * chunksX + chunkX] = 1;
        }
    };

    Game_Map.prototype.markAllChunksDirty = function () {
        const chunksX = Math.ceil(this.width() / CHUNK_SIZE);
        const chunksY = Math.ceil(this.height() / CHUNK_SIZE);
        this._dirtyChunks = new Uint8Array(chunksX * chunksY).fill(1);
    };

    Game_Map.prototype.getDirtyChunks = function () {
        // Reuse a scratch array; callers consume the result synchronously.
        const result = Array.isArray(this._dirtyChunkScratch) ? this._dirtyChunkScratch : (this._dirtyChunkScratch = []);
        result.length = 0;
        if (!this._dirtyChunks) return result;
        for (let i = 0; i < this._dirtyChunks.length; i++) {
            if (this._dirtyChunks[i]) result.push(i);
        }
        return result;
    };

    Game_Map.prototype.clearDirtyChunks = function () {
        if (this._dirtyChunks && typeof this._dirtyChunks.fill === 'function') {
            this._dirtyChunks.fill(0);
        }
    };

    Game_Map.prototype.updateTransitionTimers = function () {
        if (!(this._activeTransitions instanceof Set) || this._activeTransitions.size === 0) return;
        if (!this._fogOfWarData || !this._fogTransitionTimers) return;

        const width = this.width();
        const timers = this._fogTransitionTimers;
        const data = this._fogOfWarData;
        const step = Math.ceil(255 / REVEAL_TRANSITION_DURATION);
        const done = this._transitionDoneScratch || (this._transitionDoneScratch = []);
        done.length = 0;

        for (const index of this._activeTransitions) {
            if (index < 0 || index >= data.length) { done.push(index); continue; }
            const target = timerTargetFor(data[index]);
            const current = timers[index];

            if (current < target) {
                timers[index] = Math.min(target, current + step);
                this.markChunkDirty(index % width, (index / width) | 0);
            } else if (current > target) {
                timers[index] = Math.max(target, current - step);
                this.markChunkDirty(index % width, (index / width) | 0);
            }

            if (timers[index] === target) done.push(index);
        }

        for (let i = 0; i < done.length; i++) this._activeTransitions.delete(done[i]);
    };

    // Force every region-31 tile to the revealed state. Passing snap = true
    // also zeroes its transition timer so it never fades in.
    Game_Map.prototype.applyFogExemptTiles = function (snap = false) {
        const list = this._fogExemptIndices;
        const data = this._fogOfWarData;
        if (!list || list.length === 0 || !data) return;
        const width = this.width();

        for (let i = 0; i < list.length; i++) {
            const index = list[i];
            if (index >= data.length) continue;

            // Exempt tiles are exempt from the diving restriction too.
            this.setFogOfWarStateByIndex(index, STATE_VISIBLE, true);

            if (snap && this._fogTransitionTimers && this._fogTransitionTimers[index] !== 0) {
                this._fogTransitionTimers[index] = 0;
                if (this._activeTransitions instanceof Set) this._activeTransitions.delete(index);
                this.markChunkDirty(index % width, (index / width) | 0);
            }
        }
    };

    // True when the tile falls inside the character's vision cone (same angle
    // and range the rays use). Adjacent tiles always count, whatever the facing.
    Game_Map.prototype.isTileInVisionCone = function (char, x, y) {
        if (!char) return false;
        const cx = Math.round(char._realX);
        const cy = Math.round(char._realY);
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > this.visionRange()) return false;
        if (distance <= 1.5) return true;

        const baseAngle = { 2: Math.PI / 2, 4: Math.PI, 6: 0, 8: -Math.PI / 2 }[char.direction()];
        if (baseAngle === undefined) return false;

        let diff = Math.atan2(dy, dx) - baseAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) <= VISION_ARC / 2;
    };

    // Reveal the divider tiles bordering a region-31 tile, but only the ones a
    // vision source is currently looking at.
    Game_Map.prototype.revealPeekedDividers = function (chars) {
        const list = this._fogPeekDividerIndices;
        if (!list || list.length === 0 || !chars || chars.length === 0) return;
        const width = this.width();

        for (let i = 0; i < list.length; i++) {
            const index = list[i];
            const x = index % width;
            const y = (index / width) | 0;
            for (let c = 0; c < chars.length; c++) {
                if (this.isTileInVisionCone(chars[c], x, y)) {
                    this.setFogOfWarStateByIndex(index, STATE_VISIBLE, true);
                    break;
                }
            }
        }
    };

    //=============================================================================
    // Game_Map - divider-only fog
    //=============================================================================

    // True when this map should render fog purely to enforce interior dividers
    // (region 30) - i.e. it has dividers but fog is otherwise inactive.
    Game_Map.prototype.isDividerOnlyFog = function () {
        if (this._fogOfWarForceOff || this._fogOfWarErrorFallback) return false;
        return !!this._hasVisionDividers &&
            (!fogEnabled() || this._fogOfWarDisabled) &&
            !window.dreamActive;
    };

    // Flood-fill the player's current interior, stopping at region-30 dividers
    // (the divider tiles themselves are included so their walls stay visible).
    // Returns a Uint8Array mask (1 = visible), or null for "no enclosure" -
    // the player is standing on a divider or the area isn't walled off, in
    // which case the caller reveals everything (mirrors MousePan's semantics).
    Game_Map.prototype.computeInteriorTiles = function (px, py) {
        const w = this.width();
        const h = this.height();
        if (px < 0 || py < 0 || px >= w || py >= h) return null;
        if (this.regionId(px, py) === REGION_DIVIDER) return null;

        const visited = new Uint8Array(w * h);
        const start = py * w + px;
        const stack = [start];
        visited[start] = 1;
        let hitDivider = false;

        while (stack.length) {
            const idx = stack.pop();
            const x = idx % w;
            const y = (idx / w) | 0;
            for (let n = 0; n < 4; n++) {
                const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0);
                const ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0);
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const nidx = ny * w + nx;
                if (visited[nidx]) continue;
                visited[nidx] = 1;
                if (this.regionId(nx, ny) === REGION_DIVIDER) {
                    // Divider wall stays visible but vision does not cross it.
                    hitDivider = true;
                    continue;
                }
                stack.push(nidx);
            }
        }

        if (!hitDivider) return null;
        return visited;
    };

    // Reveal only the player's current interior and black out everything else.
    // Used when fog is otherwise inactive but the map has region-30 dividers.
    Game_Map.prototype.updateDividerFog = function () {
        if (!this.ensureFogBuffers() || !$gamePlayer) return;
        const size = this.width() * this.height();
        const sources = visionSources();
        if (sources.length === 0) return;

        const force = this._forceVisionUpdate;
        // Facing is part of the key: the peeked divider tiles depend on it.
        let key = '';
        for (let i = 0; i < sources.length; i++) {
            key += Math.round(sources[i].x) + ',' + Math.round(sources[i].y) + ',' + sources[i].direction() + ';';
        }
        if (!force && key === this._dividerFogKey) {
            this.updateTransitionTimers();
            this.updateEventVisibility(false);
            return;
        }
        this._dividerFogKey = key;
        this._forceVisionUpdate = false;
        this.refreshDiveRestriction();

        // Union each vision source's interior. A null (open / on-divider) result
        // means that source can see everything.
        let revealAll = false;
        let mask = null;
        for (let i = 0; i < sources.length; i++) {
            const tiles = this.computeInteriorTiles(Math.round(sources[i].x), Math.round(sources[i].y));
            if (!tiles) { revealAll = true; break; }
            if (!mask) {
                mask = tiles;
            } else {
                for (let j = 0; j < size; j++) if (tiles[j]) mask[j] = 1;
            }
        }

        for (let i = 0; i < size; i++) {
            const see = revealAll || (mask && mask[i]);
            this.setFogOfWarStateByIndex(i, see ? STATE_VISIBLE : STATE_UNSEEN);
        }

        // Whatever else the pass decided, the tiles the party is standing on
        // are visible: a fog rule must never blind the player to their own feet.
        for (let i = 0; i < sources.length; i++) {
            this.setFogOfWarState(Math.round(sources[i].x), Math.round(sources[i].y), STATE_VISIBLE, true);
        }

        this.applyFogExemptTiles();
        this.revealPeekedDividers(sources);

        if (force) {
            // Snap the transition alpha so the interior appears immediately
            // instead of fading in on map entry.
            const timers = this._fogTransitionTimers;
            const data = this._fogOfWarData;
            for (let i = 0; i < size; i++) timers[i] = timerTargetFor(data[i]);
            if (this._activeTransitions instanceof Set) this._activeTransitions.clear();
            this.markAllChunksDirty();
        }

        this.updateTransitionTimers();
        this.updateEventVisibility(force);
    };

    //=============================================================================
    // Game_Map - the vision pass
    //=============================================================================

    Game_Map.prototype.updateFogOfWar = function () {
        if (window.dreamActive) return;

        // Divider maps with fog otherwise inactive: render only the interior
        // walls, so the player cannot see across region-30 dividers.
        if (this.isDividerOnlyFog()) {
            this.updateDividerFog();
            return;
        }

        if (!fogEnabled() || this._fogOfWarDisabled) return;
        if (!$gamePlayer || !this.ensureFogBuffers()) return;

        const sources = visionSources();
        if (sources.length === 0) return;

        const isInitial = this._forceVisionUpdate;
        let needsVisionUpdate = isInitial;

        this.updateTransitionTimers();

        // Movement and vision smoothing, per source.
        for (let i = 0; i < sources.length; i++) {
            const char = sources[i];
            const primary = i === 0;
            const lastX = primary ? this._playerLastX : this._player2LastX;
            const lastY = primary ? this._playerLastY : this._player2LastY;
            const lastDir = primary ? this._playerLastDir : this._player2LastDir;
            let visionX = primary ? this._visionX : this._visionX2;
            let visionY = primary ? this._visionY : this._visionY2;

            const positionChanged = Math.abs(char.x - lastX) > 0.2 || Math.abs(char.y - lastY) > 0.2;
            const directionChanged = char.direction() !== lastDir;

            const realX = char._realX;
            const realY = char._realY;
            const isSmoothing = Math.abs(visionX - realX) > 0.05 || Math.abs(visionY - realY) > 0.05;

            if (positionChanged || directionChanged || isSmoothing) needsVisionUpdate = true;

            if (directionChanged || isInitial || Math.abs(realX - visionX) > 2 || Math.abs(realY - visionY) > 2) {
                visionX = realX;
                visionY = realY;
            } else if (positionChanged) {
                visionX += (realX - visionX) * VISION_SMOOTHING;
                visionY += (realY - visionY) * VISION_SMOOTHING;
            } else {
                visionX = realX;
                visionY = realY;
            }

            if (primary) { this._visionX = visionX; this._visionY = visionY; }
            else { this._visionX2 = visionX; this._visionY2 = visionY; }

            if (positionChanged || directionChanged) {
                if (primary) {
                    this._playerLastX = char.x;
                    this._playerLastY = char.y;
                    this._playerLastDir = char.direction();
                } else {
                    this._player2LastX = char.x;
                    this._player2LastY = char.y;
                    this._player2LastDir = char.direction();
                }
            }
        }

        if (needsVisionUpdate) {
            this._forceVisionUpdate = false;
            this.refreshDiveRestriction();
            this._currentFrameVisible.fill(0);
            this._visibleIndices = [];
            this.refreshEventMapIfNeeded();

            for (let i = 0; i < sources.length; i++) {
                const visionX = i === 0 ? this._visionX : this._visionX2;
                const visionY = i === 0 ? this._visionY : this._visionY2;
                this.calculateVision(visionX, visionY, sources[i].direction(), sources[i]);
            }

            this.applyFogExemptTiles();
            this.revealPeekedDividers(sources);

            if (isInitial) {
                for (let i = 0; i < this._visibleIndices.length; i++) {
                    const index = this._visibleIndices[i];
                    this._fogTransitionTimers[index] = 0;
                    this._activeTransitions.delete(index);
                }
            }

            const fogData = this._fogOfWarData;
            const currentVisible = this._currentFrameVisible;

            if (isInitial) {
                // Full scan on forced updates: external reveals (plugin
                // commands, refreshFogOfWar) may have set tiles to state 2
                // outside the tracked visible set.
                for (let i = 0; i < fogData.length; i++) {
                    if (fogData[i] === STATE_VISIBLE && !currentVisible[i]) {
                        this.setFogOfWarStateByIndex(i, STATE_SEEN);
                    }
                }
            } else {
                // Only previously visible tiles can need demoting to state 1.
                const last = this._lastVisibleIndices;
                for (let i = 0; i < last.length; i++) {
                    const index = last[i];
                    if (fogData[index] === STATE_VISIBLE && !currentVisible[index]) {
                        this.setFogOfWarStateByIndex(index, STATE_SEEN);
                    }
                }
            }
            this._lastVisibleIndices = this._visibleIndices;
        }

        this.updateEventVisibility(isInitial);
    };

    // Eye-damage blindness for fog of war is disabled: a character with both
    // eyes destroyed used to lose almost all terrain reveal (calculateVision
    // and castRay skip terrain when blind, leaving only the immediate 3x3
    // tile and whatever events fall inside the traced cone), which read
    // exactly like a stuck-black-screen bug. Always answer sighted.
    Game_Map.prototype.visionEyesFor = function (char) {
        return { left: true, right: true, blind: false };
    };

    Game_Map.prototype.calculateVision = function (centerX, centerY, direction, character) {
        if (!this.ensureFogBuffers()) return;

        const char = character || $gamePlayer;
        if (!char) return;

        const charActualX = Math.round(char._realX);
        const charActualY = Math.round(char._realY);
        const playerOnRoof = this.terrainTag(charActualX, charActualY) === TERRAIN_ROOF ||
            this.regionId(charActualX, charActualY) === REGION_EXTENDED_VIEW;

        let range = this.visionRange();
        if (playerOnRoof) range *= 1.5;

        const eyes = this.visionEyesFor(char);
        const blind = eyes.blind;

        // A passable terrain-4 tile (a gate cut into a wall, a walkable rampart,
        // a rock arch) still reads as vision blocking, and the rays start one
        // tile behind the character, so the first tile every forward ray walks
        // into is the one the character is standing on. Exempt that single tile
        // so the cone is exactly what it would be on open ground.
        const standingIndex = charActualY * this.width() + charActualX;
        const exemptIndex = (this.terrainTag(charActualX, charActualY) === TERRAIN_WALL &&
            this.checkPassage(charActualX, charActualY, 0x0f)) ? standingIndex : -1;

        if (char === $gamePlayer) {
            this._hasZeroEyes = blind;
            if (blind) this._eventVisionConeTiles = new Set();
        }

        // The tile underfoot and its neighbours are always revealed, blind or
        // not: a character can feel where they are standing, and without this a
        // blind party had literally nothing on screen, which is indistinguishable
        // from the fog being broken. Only the tile actually stood on ignores the
        // diving restriction (it is water anyway while diving), so the look of a
        // dive is unchanged.
        this.setFogOfWarState(charActualX, charActualY, STATE_VISIBLE, true);
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                if (ox === 0 && oy === 0) continue;
                const nx = charActualX + ox;
                const ny = charActualY + oy;
                if (this.isValid(nx, ny)) this.setFogOfWarState(nx, ny, STATE_VISIBLE);
            }
        }

        if (!blind) {
            this.revealWallTilesAbovePlayer(charActualX, charActualY);
        }

        const baseAngle = { 2: Math.PI / 2, 4: Math.PI, 6: 0, 8: Math.PI * 3 / 2 }[direction] || 0;
        const offsetDist = 1.0;
        const dx = direction === 6 ? -offsetDist : direction === 4 ? offsetDist : 0;
        const dy = direction === 2 ? -offsetDist : direction === 8 ? offsetDist : 0;

        const visionOriginX = centerX + 0.5 + dx;
        const visionOriginY = centerY + 0.5 + dy;
        const effectiveRange = range + offsetDist;

        const halfAngle = VISION_ARC / 2;
        let startAngle = baseAngle - halfAngle;
        let angleSpan = VISION_ARC;

        // One eye sees half the cone, on that eye's side.
        if (!blind && !eyes.left) {
            startAngle = baseAngle;
            angleSpan = halfAngle;
        } else if (!blind && !eyes.right) {
            startAngle = baseAngle - halfAngle;
            angleSpan = halfAngle;
        }

        const rays = rayCountFor(effectiveRange, angleSpan);
        for (let i = 0; i < rays; i++) {
            const angle = startAngle + (angleSpan * (i + 0.5) / rays);
            this.castRay(visionOriginX, visionOriginY, angle, effectiveRange, playerOnRoof, blind, exemptIndex);
        }
    };

    Game_Map.prototype.castRay = function (startX, startY, angle, maxDistance, playerOnRoof = false, blind = false, exemptIndex = -1) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const width = this.width();
        const height = this.height();
        const isLoopH = this.isLoopHorizontal();
        const isLoopV = this.isLoopVertical();

        let tileX = Math.floor(startX);
        let tileY = Math.floor(startY);

        const deltaDistX = dx === 0 ? Infinity : Math.abs(1 / dx);
        const deltaDistY = dy === 0 ? Infinity : Math.abs(1 / dy);
        let sideDistX;
        let sideDistY;
        let stepX;
        let stepY;

        if (dx < 0) {
            stepX = -1;
            sideDistX = dx === 0 ? Infinity : (startX - tileX) * deltaDistX;
        } else {
            stepX = 1;
            sideDistX = dx === 0 ? Infinity : (tileX + 1.0 - startX) * deltaDistX;
        }

        if (dy < 0) {
            stepY = -1;
            sideDistY = dy === 0 ? Infinity : (startY - tileY) * deltaDistY;
        } else {
            stepY = 1;
            sideDistY = dy === 0 ? Infinity : (tileY + 1.0 - startY) * deltaDistY;
        }

        let dist = 0;

        while (dist < maxDistance) {
            if (sideDistX < sideDistY) {
                dist = sideDistX;
                sideDistX += deltaDistX;
                tileX += stepX;
            } else {
                dist = sideDistY;
                sideDistY += deltaDistY;
                tileY += stepY;
            }

            if (dist > maxDistance) break;

            let checkX = tileX;
            let checkY = tileY;
            if (isLoopH) checkX = (checkX + width) % width;
            if (isLoopV) checkY = (checkY + height) % height;

            if (checkX < 0 || checkY < 0 || checkX >= width || checkY >= height) break;

            const checkIndex = checkY * width + checkX;
            const blocked = checkIndex !== exemptIndex && this.isVisionBlocking(checkX, checkY, playerOnRoof);

            if (blind) {
                // A blind character maps the room by ear and touch: the cone is
                // still traced, but only so events inside it can be sensed. No
                // terrain is revealed.
                if (!this._eventVisionConeTiles) this._eventVisionConeTiles = new Set();
                this._eventVisionConeTiles.add(checkIndex);
                if (blocked) break;
                continue;
            }

            if (blocked) {
                const wasRevealed = this._fogOfWarData[checkIndex] === STATE_VISIBLE;
                this.setFogOfWarStateByIndex(checkIndex, STATE_VISIBLE);
                if (!wasRevealed) {
                    const tag = this.terrainTag(checkX, checkY);
                    if (tag === TERRAIN_WALL || (tag === TERRAIN_ROOF && this._isExteriorMap)) {
                        this.revealConnectedTerrainTiles(checkX, checkY);
                    }
                }
                break;
            }

            this.setFogOfWarStateByIndex(checkIndex, STATE_VISIBLE);
        }
    };

    Game_Map.prototype.revealWallTilesAbovePlayer = function (playerX, playerY) {
        const checkAndReveal = (x, basePathY) => {
            if (this.isValid(x, basePathY) && this.terrainTag(x, basePathY) === TERRAIN_WALL) {
                for (let y = 1; y <= 4; y++) {
                    const tileY = basePathY + 1 - y;
                    if (this.isValid(x, tileY)) this.setFogOfWarState(x, tileY, STATE_VISIBLE);
                }
            }
        };

        checkAndReveal(playerX, playerY - 1);
        checkAndReveal(playerX - 1, playerY);
        checkAndReveal(playerX + 1, playerY);

        const wallY = playerY - 1;
        if (this.isValid(playerX, wallY) && this.terrainTag(playerX, wallY) === TERRAIN_WALL) {
            for (let y = 1; y <= 4; y++) {
                const tileY = playerY - y;
                if (this.isValid(playerX - 1, tileY) && this.terrainTag(playerX - 1, tileY) === TERRAIN_WALL) {
                    this.setFogOfWarState(playerX - 1, tileY, STATE_VISIBLE);
                }
                if (this.isValid(playerX + 1, tileY) && this.terrainTag(playerX + 1, tileY) === TERRAIN_WALL) {
                    this.setFogOfWarState(playerX + 1, tileY, STATE_VISIBLE);
                }
            }
        }
    };

    // Seeing one tile of a wall face reveals the run of wall it belongs to, so
    // a room's outline appears whole rather than in slivers.
    Game_Map.prototype.revealConnectedTerrainTiles = function (startX, startY) {
        const originTag = this.terrainTag(startX, startY);
        const width = this.width();
        const height = this.height();
        const size = width * height;
        const MAX_TILES = 300;

        // Reusable flat queue and stamp buffers to eliminate heap allocation
        if (!this._wallBfsQueue || this._wallBfsQueue.length < MAX_TILES + 8) {
            this._wallBfsQueue = new Int32Array(MAX_TILES + 16);
        }
        if (!this._wallBfsVisitedStamp || this._wallBfsVisitedStamp.length !== size) {
            this._wallBfsVisitedStamp = new Int32Array(size);
            this._wallBfsStamp = 1;
        } else {
            this._wallBfsStamp = (this._wallBfsStamp + 1) | 0;
            if (this._wallBfsStamp <= 0) {
                this._wallBfsVisitedStamp.fill(0);
                this._wallBfsStamp = 1;
            }
        }

        const stamp = this._wallBfsStamp;
        const visitedStamp = this._wallBfsVisitedStamp;
        const queue = this._wallBfsQueue;
        let head = 0;
        let tail = 0;

        const startIdx = startY * width + startX;
        visitedStamp[startIdx] = stamp;
        queue[tail++] = startIdx;

        while (head < tail && tail <= MAX_TILES) {
            const idx = queue[head++];
            const x = idx % width;
            const y = (idx / width) | 0;
            for (let n = 0; n < 4; n++) {
                const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0);
                const ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0);
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const nidx = ny * width + nx;
                if (visitedStamp[nidx] === stamp) continue;
                visitedStamp[nidx] = stamp;
                if (this.terrainTag(nx, ny) === originTag) {
                    this.setFogOfWarStateByIndex(nidx, STATE_VISIBLE);
                    if (tail < queue.length) {
                        queue[tail++] = nidx;
                    }
                }
            }
        }
    };

    //=============================================================================
    // Game_Map - event visibility
    //=============================================================================

    Game_Map.prototype.updateEventVisibility = function (snap = false) {
        this._eventVisibilityCounter = (this._eventVisibilityCounter || 0) + 1;
        if (this._eventVisibilityCounter < 3 && !snap) return;
        this._eventVisibilityCounter = 0;
        if (!$gamePlayer) return;

        const p1x = $gamePlayer.x;
        const p1y = $gamePlayer.y;
        const split = window.$gameSplitScreen;
        const p2 = (split && split.active && split.p2Event) ? split.p2Event : null;
        const width = this.width();
        const events = this.events();

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            // Proximity to ANY player reveals the event
            let isBordering = Math.abs(event.x - p1x) <= 1 && Math.abs(event.y - p1y) <= 1;
            if (!isBordering && p2) {
                isBordering = Math.abs(event.x - p2.x) <= 1 && Math.abs(event.y - p2.y) <= 1;
            }

            let isVisible;
            if (this._hasZeroEyes) {
                isVisible = !!(this._eventVisionConeTiles && this._eventVisionConeTiles.has(event.y * width + event.x));
            } else {
                isVisible = this.isPositionVisible(event.x, event.y);
            }

            if (this._visibleFogOfWar && this.fogOfWarState(event.x, event.y) >= STATE_SEEN) {
                isVisible = true;
            }

            event._fogOfWarBorderingPlayer = isBordering;
            event.updateFogOfWarVisibility(isBordering || isVisible, snap);
        }
    };

    //=============================================================================
    // Game_Event
    //=============================================================================

    const _Game_Event_initialize = Game_Event.prototype.initialize;
    Game_Event.prototype.initialize = function (mapId, eventId) {
        _Game_Event_initialize.call(this, mapId, eventId);
        this._fogOfWarVisible = true;
        this._fogOfWarTransitioning = false;
        this._fogOfWarTransitionTimer = 0;
        this._isEnemy = false;
        this._fogOfWarBorderingPlayer = false;
    };

    // An enemy event out of sight fades out after a beat; anything else simply
    // greys out, so the player keeps the map furniture they have already found.
    const ENEMY_FADE_DELAY = 60;

    Game_Event.prototype.updateFogOfWarVisibility = function (isVisible, snap = false) {
        if (this._fogOfWarBorderingPlayer) isVisible = true;
        if (this._fogOfWarVisible === isVisible) return;

        this._isEnemy = $gameMap.isEnemyEvent(this);
        const hides = this._isEnemy && !$gameMap.isExemptEventName(this) && !this._fogOfWarBorderingPlayer;

        this._fogOfWarVisible = isVisible;

        if (isVisible) {
            this._opacity = 255;
            this._transparent = false;
            this._fogOfWarTransitioning = !snap;
            this._fogOfWarTransitionTimer = snap ? 0 : REVEAL_TRANSITION_DURATION;
            return;
        }

        if (!hides) {
            this._opacity = 255;
            this._transparent = false;
            this._fogOfWarTransitioning = false;
            this._fogOfWarTransitionTimer = 0;
            return;
        }

        if (snap) {
            this._fogOfWarTransitioning = false;
            this._fogOfWarTransitionTimer = 0;
            this._opacity = 0;
            this._transparent = true;
        } else {
            this._fogOfWarTransitioning = true;
            this._fogOfWarTransitionTimer = ENEMY_FADE_DELAY + REVEAL_TRANSITION_DURATION * 4;
        }
    };

    Game_Event.prototype.updateFogOfWarTransition = function () {
        if (!this._fogOfWarTransitioning) return;

        this._fogOfWarTransitionTimer--;
        const duration = REVEAL_TRANSITION_DURATION;

        if (!this._isEnemy || $gameMap.isExemptEventName(this)) {
            if (this._fogOfWarTransitionTimer <= 0) this._fogOfWarTransitioning = false;
            return;
        }

        if (this._fogOfWarVisible) {
            const fadeRatio = Math.max(0, 1 - (this._fogOfWarTransitionTimer / duration));
            this._opacity = Math.floor(255 * fadeRatio);
            this._transparent = false;
            if (this._fogOfWarTransitionTimer <= 0) {
                this._fogOfWarTransitioning = false;
                this._opacity = 255;
            }
            return;
        }

        const fadeDuration = duration * 4;
        if (this._fogOfWarTransitionTimer > fadeDuration) {
            this._opacity = 255; // still inside the delay
        } else {
            this._opacity = Math.floor(255 * Math.max(0, this._fogOfWarTransitionTimer / fadeDuration));
        }
        if (this._fogOfWarTransitionTimer <= 0) {
            this._fogOfWarTransitioning = false;
            this._opacity = 0;
            this._transparent = true;
        }
    };

    Game_Event.prototype.isFogOfWarGrayscale = function () {
        if (this._fogOfWarBorderingPlayer) return false;
        return !this._fogOfWarVisible && !this._isEnemy && !$gameMap.isExemptEventName(this);
    };

    Game_Event.prototype.isFogOfWarTransitioning = function () {
        return this._fogOfWarTransitioning;
    };

    const _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function () {
        _Game_Event_update.call(this);
        this.updateFogOfWarTransition();
    };

    //=============================================================================
    // Game_Player
    //=============================================================================

    const _Game_Player_updateNonmoving = Game_Player.prototype.updateNonmoving;
    Game_Player.prototype.updateNonmoving = function (wasMoving, sceneActive) {
        _Game_Player_updateNonmoving.call(this, wasMoving, sceneActive);
        // A step just finished: refresh the cone now rather than waiting for the
        // throttled call in Spriteset_Map.update.
        if (wasMoving && sceneActive && $gameMap) {
            try {
                $gameMap.updateFogOfWar();
            } catch (e) {
                fogError(e);
            }
        }
    };

    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function () {
        const sameMap = this._newMapId === $gameMap.mapId();
        // Persist the outgoing map's fog before it is replaced (periodic
        // serialization during play was removed for performance).
        if (!sameMap && this.isTransferring()) {
            $gameSystem.saveCurrentFogData();
        }
        _Game_Player_performTransfer.call(this);
        if (sameMap && $gameMap) {
            $gameMap._forceVisionUpdate = true;
            $gameMap._dividerFogKey = null;
            requestFullRefresh(1, false);
        }
    };

    //=============================================================================
    // Scene_Map & Scene_Load
    //=============================================================================

    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);
        // Events and prefabs are still being injected on this frame, so let a
        // few frames pass before the definitive refresh. Frames, not
        // setTimeout: a wall-clock timer could fire in another scene entirely.
        requestFullRefresh(4, false);
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start.call(this);
        if ($gameSystem && $gameSystem._needsFogOfWarRefresh) {
            requestFullRefresh(4, !!$gameSystem._forceFogReload);
            $gameSystem._needsFogOfWarRefresh = false;
            $gameSystem._forceFogReload = false;
        }
    };

    const _Scene_Load_onLoadSuccess = Scene_Load.prototype.onLoadSuccess;
    Scene_Load.prototype.onLoadSuccess = function () {
        _Scene_Load_onLoadSuccess.call(this);
        $gameSystem._needsFogOfWarRefresh = true;
        $gameSystem._forceFogReload = true;
    };

    //=============================================================================
    // Spriteset_Map
    //=============================================================================

    const _Spriteset_Map_createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function () {
        _Spriteset_Map_createUpperLayer.call(this);
        this.createFogOfWarLayer();
    };

    Spriteset_Map.prototype.createFogOfWarLayer = function () {
        this._fogContainer = new PIXI.Container();
        this.addChild(this._fogContainer);

        this._fogCanvas = document.createElement('canvas');
        this._fogCanvas.width = 1;
        this._fogCanvas.height = 1;
        this._fogCtx = this._fogCanvas.getContext('2d', { willReadFrequently: true });

        this._fogTexture = PIXI.Texture.from(this._fogCanvas);
        this._fogTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this._fogSprite = new PIXI.Sprite(this._fogTexture);
        this._fogSprite.scale.set($gameMap ? $gameMap.tileWidth() : 48, $gameMap ? $gameMap.tileHeight() : 48);
        this._fogContainer.addChild(this._fogSprite);

        this._fogPixels = null;
        this._fogImageData = null;
        this._wasFogOfWarActive = false;
        this.refreshFogOfWar(true);
    };

    // True when the fog layer should be drawn at all on this map.
    Spriteset_Map.prototype.isFogOfWarActive = function () {
        if (window.dreamActive || !$gameMap) return false;
        if ($gameMap.isDividerOnlyFog()) return true;
        return fogEnabled() && !$gameMap._fogOfWarDisabled;
    };

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function () {
        _Spriteset_Map_update.call(this);
        if (!this._fogContainer) return;

        if (!this.isFogOfWarActive()) {
            this._fogContainer.visible = false;
            if (this._wasFogOfWarActive) {
                this.cleanupFogOfWarEvents();
                this._wasFogOfWarActive = false;
            }
            pendingRefreshFrames = 0;
            pendingRefreshReload = false;
            return;
        }

        // Coming back from disabled (option toggled, map note lifted) has to
        // rebuild the layer: the old code only ever set visible = false here and
        // left the fog invisible until something else called refreshFogOfWar.
        if (!this._wasFogOfWarActive) {
            this._wasFogOfWarActive = true;
            requestFullRefresh(1, false);
        }
        this._fogContainer.visible = true;

        this._fogContainer.x = -Math.round($gameMap.displayX() * $gameMap.tileWidth());
        this._fogContainer.y = -Math.round($gameMap.displayY() * $gameMap.tileHeight());

        try {
            if (pendingRefreshFrames > 0 && --pendingRefreshFrames === 0) {
                const reload = pendingRefreshReload;
                pendingRefreshReload = false;
                if (reload && $gameSystem) $gameSystem.reloadFogOfWarLighting();
                $gameMap._forceVisionUpdate = true;
                this.refreshFogOfWar(true);
                this.updateEventVisibility();
                return;
            }

            // Single throttled call site for fog updates. On skipped frames
            // still tick transitions and event visibility so fades and event
            // reveal keep their original per-frame cadence.
            updateCounter = (updateCounter + 1) % UPDATE_FREQUENCY;
            if (updateCounter === 0) {
                $gameMap.updateFogOfWar();
            } else {
                $gameMap.updateTransitionTimers();
                $gameMap.updateEventVisibility(false);
            }

            const dirtyChunks = $gameMap.getDirtyChunks();
            if (dirtyChunks.length > 0) {
                this.updateDirtyChunks(dirtyChunks);
                $gameMap.clearDirtyChunks();
            }
        } catch (e) {
            // Session-only: the player's saved option is never rewritten.
            fogError(e);
            this._fogContainer.visible = false;
            return;
        }

        this.updateEventVisibility();
    };

    Spriteset_Map.prototype.cleanupFogOfWarEvents = function () {
        if ($gameMap) {
            const events = $gameMap.events();
            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                event._fogOfWarVisible = true;
                event._fogOfWarTransitioning = false;
                event._fogOfWarTransitionTimer = 0;
                event._opacity = 255;
                event._transparent = false;
            }
        }
        if (this._characterSprites) {
            for (let i = 0; i < this._characterSprites.length; i++) {
                this.clearFogFilter(this._characterSprites[i]);
            }
        }
    };

    Spriteset_Map.prototype.clearFogFilter = function (sprite) {
        if (!sprite) return;
        if (sprite._fogColorToneApplied) {
            if (typeof sprite.setColorTone === 'function') {
                sprite.setColorTone([0, 0, 0, 0]);
            }
            sprite._fogColorToneApplied = false;
        }
        if (sprite._fogColorFilter && sprite.filters) {
            sprite.filters = sprite.filters.filter(f => f !== sprite._fogColorFilter);
            if (!sprite.filters.length) sprite.filters = null;
            sprite._fogColorFilter = null;
        }
    };

    // Size the fog canvas to the map. Returns false when the map is not ready.
    Spriteset_Map.prototype.resizeFogCanvas = function () {
        if (!$gameMap || !$dataMap || !this._fogCanvas) return false;
        const mapWidth = $gameMap.width();
        const mapHeight = $gameMap.height();
        if (mapWidth <= 0 || mapHeight <= 0) return false;

        if (this._fogPixels && this._fogCanvas.width === mapWidth && this._fogCanvas.height === mapHeight) {
            return true;
        }

        this._fogCanvas.width = mapWidth;
        this._fogCanvas.height = mapHeight;
        this._fogImageData = this._fogCtx.createImageData(mapWidth, mapHeight);
        this._fogPixels = this._fogImageData.data;
        this._fogPixels32 = new Uint32Array(this._fogImageData.data.buffer);

        // Build the replacement BEFORE destroying the old one, so the sprite is
        // never left holding a destroyed texture for even one frame.
        const previous = this._fogTexture;
        delete this._fogCanvas._pixiId;
        this._fogTexture = PIXI.Texture.from(this._fogCanvas);
        this._fogTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        this._fogSprite.texture = this._fogTexture;
        this._fogSprite.scale.set($gameMap.tileWidth(), $gameMap.tileHeight());
        if (previous && previous !== this._fogTexture) {
            try {
                previous.destroy(true);
            } catch (e) {
                console.warn('FogOfWar: could not release the previous fog texture', e);
            }
        }
        return true;
    };

    Spriteset_Map.prototype.refreshFogOfWar = function (fullRefresh = false) {
        if (!this._fogContainer) return;
        if (!this.isFogOfWarActive()) {
            this._fogContainer.visible = false;
            return;
        }
        this._fogContainer.visible = true;
        this._wasFogOfWarActive = true;

        try {
            if (fullRefresh && this.resizeFogCanvas()) {
                $gameMap.ensureFogBuffers();
                // Scene_Map.prototype.create reloads $dataMap from disk on
                // EVERY scene creation, not only on a real transfer - closing
                // any menu/HypernetOS app/UI overlay recreates Scene_Map and
                // silently swaps $dataMap under the running game, without ever
                // calling Game_Map.setup() (that only happens on a transfer).
                // ensureFogBuffers() does not know the map data changed - it
                // only rebuilds the terrain/region cache when the buffer SIZE
                // is wrong - so isVisionBlocking(), the region-31 exempt list
                // and the region-30 divider list could all still be judging
                // the map against whatever it looked like before the reload.
                // A full refresh (which onMapLoaded already requests after
                // every scene creation) is the one signal that $dataMap may
                // have just changed, so force the cache to rebuild here.
                $gameMap.refreshTerrainCache();
                if ($gameMap.isDividerOnlyFog()) {
                    // Interior-divider maps reveal the whole current room rather
                    // than a vision cone.
                    $gameMap._forceVisionUpdate = true;
                    $gameMap._dividerFogKey = null;
                    $gameMap.updateDividerFog();
                } else {
                    const sources = visionSources();
                    $gameMap.refreshDiveRestriction();
                    $gameMap.refreshEventMapIfNeeded();
                    for (let i = 0; i < sources.length; i++) {
                        const p = sources[i];
                        if (i === 0) {
                            $gameMap._visionX = p._realX;
                            $gameMap._visionY = p._realY;
                        } else {
                            $gameMap._visionX2 = p._realX;
                            $gameMap._visionY2 = p._realY;
                        }
                        $gameMap.calculateVision(p._realX, p._realY, p.direction(), p);
                    }
                    $gameMap.applyFogExemptTiles(true);
                    $gameMap.revealPeekedDividers(sources);
                    $gameMap.updateTransitionTimers();
                }
                $gameMap.markAllChunksDirty();
            }

            const dirtyChunks = $gameMap.getDirtyChunks();
            if (dirtyChunks.length > 0) {
                this.updateDirtyChunks(dirtyChunks);
                $gameMap.clearDirtyChunks();
            }
        } catch (e) {
            fogError(e);
            this._fogContainer.visible = false;
        }
    };

    // alpha (0-255) -> RGBA. A tile darker than the "previously seen" level is
    // one that was never seen, so it takes the never-seen colour.
    Spriteset_Map.prototype.buildColorLut = function () {
        this._colorLut = new Uint8ClampedArray(256 * 4);
        this._colorLut32 = new Uint32Array(256);
        const neverSeen = parseCssColor(NEVER_SEEN_COLOR);
        const prevSeen = parseCssColor(PREVIOUSLY_SEEN_COLOR);

        const nsR = (neverSeen >> 16) & 0xFF;
        const nsG = (neverSeen >> 8) & 0xFF;
        const nsB = neverSeen & 0xFF;

        const psR = (prevSeen >> 16) & 0xFF;
        const psG = (prevSeen >> 8) & 0xFF;
        const psB = prevSeen & 0xFF;

        // Determine endianness for 32-bit packed word writes
        const testBuf = new ArrayBuffer(4);
        new Uint32Array(testBuf)[0] = 0x11223344;
        const isLittleEndian = new Uint8Array(testBuf)[0] === 0x44;

        for (let i = 0; i < 256; i++) {
            const isBlack = (i / 255) > BASE_ALPHA + 0.05;
            const r = isBlack ? nsR : psR;
            const g = isBlack ? nsG : psG;
            const b = isBlack ? nsB : psB;
            const a = i;

            this._colorLut[i * 4 + 0] = r;
            this._colorLut[i * 4 + 1] = g;
            this._colorLut[i * 4 + 2] = b;
            this._colorLut[i * 4 + 3] = a;

            if (isLittleEndian) {
                this._colorLut32[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
            } else {
                this._colorLut32[i] = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
            }
        }
    };

    Spriteset_Map.prototype.updateDirtyChunks = function (dirtyChunks) {
        if (!dirtyChunks || dirtyChunks.length === 0 || !$gameMap) return;
        if (!this._fogPixels && !this.resizeFogCanvas()) return;

        const timers = $gameMap._fogTransitionTimers;
        const mapWidth = $gameMap.width();
        const mapHeight = $gameMap.height();
        // A timer array that does not match the canvas would write garbage (or
        // undefined, which reads as a fully transparent tile) across the map.
        if (!timers || timers.length !== mapWidth * mapHeight) return;
        if (this._fogCanvas.width !== mapWidth || this._fogCanvas.height !== mapHeight) {
            if (!this.resizeFogCanvas()) return;
        }

        if (!this._colorLut32) this.buildColorLut();

        const chunksX = Math.ceil(mapWidth / CHUNK_SIZE);
        const chunksY = Math.ceil(mapHeight / CHUNK_SIZE);
        const pixels32 = this._fogPixels32;
        const lut32 = this._colorLut32;

        let minDirtyX = mapWidth;
        let minDirtyY = mapHeight;
        let maxDirtyX = 0;
        let maxDirtyY = 0;

        for (let i = 0; i < dirtyChunks.length; i++) {
            const chunkIndex = dirtyChunks[i];
            const chunkX = chunkIndex % chunksX;
            const chunkY = (chunkIndex / chunksX) | 0;
            if (chunkY >= chunksY) continue;

            const startX = chunkX * CHUNK_SIZE;
            const startY = chunkY * CHUNK_SIZE;
            const endX = Math.min(startX + CHUNK_SIZE, mapWidth);
            const endY = Math.min(startY + CHUNK_SIZE, mapHeight);

            if (startX < minDirtyX) minDirtyX = startX;
            if (startY < minDirtyY) minDirtyY = startY;
            if (endX > maxDirtyX) maxDirtyX = endX;
            if (endY > maxDirtyY) maxDirtyY = endY;

            for (let y = startY; y < endY; y++) {
                const rowOffset = y * mapWidth;
                for (let x = startX; x < endX; x++) {
                    const timerVal = timers[rowOffset + x] & 0xFF;
                    pixels32[rowOffset + x] = lut32[timerVal];
                }
            }
        }

        if (maxDirtyX > minDirtyX && maxDirtyY > minDirtyY) {
            const dirtyW = maxDirtyX - minDirtyX;
            const dirtyH = maxDirtyY - minDirtyY;
            this._fogCtx.putImageData(this._fogImageData, 0, 0, minDirtyX, minDirtyY, dirtyW, dirtyH);
            if (this._fogTexture && this._fogTexture.baseTexture && this._fogTexture.baseTexture.resource) {
                this._fogTexture.update();
            }
        }
    };

    Spriteset_Map.prototype.updateEventVisibility = function () {
        const sprites = this._characterSprites;
        if (!sprites) return;
        for (let i = 0; i < sprites.length; i++) {
            const sprite = sprites[i];
            if (!(sprite._character instanceof Game_Event)) continue;
            const event = sprite._character;
            sprite.opacity = event.opacity();

            const isGrayscale = event.isFogOfWarGrayscale() ||
                (event.isFogOfWarTransitioning && event.isFogOfWarTransitioning());

            if (isGrayscale) {
                if (!sprite._fogColorToneApplied) {
                    if (typeof sprite.setColorTone === 'function') {
                        sprite.setColorTone([0, 0, 0, 255]);
                    }
                    sprite._fogColorToneApplied = true;
                }
            } else if (sprite._fogColorToneApplied) {
                this.clearFogFilter(sprite);
            }
        }
    };

})();
