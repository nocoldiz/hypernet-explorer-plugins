/*:
 * @plugindesc Displays the median level of map encounters in the map name display.
 * @author Omni-Lex
 * @version 1.3.0
 * @target MZ
 * @help
 * ============================================================================
 * OmniLex - Map Level Display
 * ============================================================================
 *
 * This plugin automatically displays a median level for the current map
 * based on the random encounters defined for it.
 *
 * When the player enters a map, the plugin will calculate the median level
 * of all troop encounters and display it next to the map's name,
 * for example: "Whispering Woods Lv. 15".
 *
 * If a map has no display name set, the plugin will use the map's actual
 * name with any numeric prefix removed (e.g., "700 - Hardware store" 
 * becomes "Hardware store").
 *
 * --- How to Set Up Troop Levels ---
 *
 * To set a level for a troop, you must follow a specific rule:
 *
 * 1. For a given Troop ID (e.g., Troop #5 in the database), you must define
 * its level in the note box of the ENEMY with the SAME ID (e.g., Enemy #5).
 *
 * 2. The format in the enemy's note box must be:
 * <Level:XX>
 * (Where XX is the level number)
 *
 * For example, in the note box for Enemy #5:
 * <Level:17>
 *
 * The plugin will read this number. If a troop encounter on the map
 * (e.g., Troop #5) does not have a corresponding enemy with the same ID
 * (Enemy #5) or that enemy does not have a valid <Level:X> tag, it will be
 * ignored in the median calculation.
 *
 * If no valid troop levels can be found for a map, no level will be
 * displayed.
 *
 */

(() => {
    'use strict';

    // Alias Game_Map.setup to calculate the median level on map load.
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function (mapId) {
        _Game_Map_setup.call(this, mapId);
        this.calculateMedianEncounterLevel();

        // Consume a one-shot door-name override, if the transfer that brought
        // the party here was through a Door/Transfer event carrying a Note.
        // See command201 alias below for where this is set.
        this._doorNameOverride = null;
        if ($gameSystem && $gameSystem._doorMapNameOverride) {
            this._doorNameOverride = $gameSystem._doorMapNameOverride;
            $gameSystem._doorMapNameOverride = null;
        }
    };

    // A Door/Transfer event's own Note names the room it leads to better than
    // the destination map's own display name ("Dirty Inn" vs "Interiors"), so
    // when such an event fires a Transfer Player command, its Note is carried
    // over as a one-shot override for the map the party is about to land on.
    const _Game_Interpreter_command201 = Game_Interpreter.prototype.command201;
    Game_Interpreter.prototype.command201 = function (params) {
        const sourceEvent = this._eventId ? $gameMap.event(this._eventId) : null;
        if (sourceEvent) {
            const data = sourceEvent.event();
            const name = (data && data.name) || '';
            const note = ((data && data.note) || '').trim();
            if (note && /door|transfer/i.test(name)) {
                $gameSystem._doorMapNameOverride = note;
            }
        }
        return _Game_Interpreter_command201.call(this, params);
    };

    // Add a new method to Game_Map to perform the calculation.
    Game_Map.prototype.calculateMedianEncounterLevel = function () {
        this._medianEncounterLevel = null;
        const encounterList = this.encounterList();
        if (!encounterList || encounterList.length === 0) {
            return;
        }

        const troopLevels = [];
        const levelRegex = /<Level:\s*(\d+)>/i;

        // Use a Set to only process unique troop IDs, as the median should be
        // based on the variety of troops, not encounter frequency.
        const uniqueTroopIds = new Set(encounterList.map(encounter => encounter.troopId));

        for (const troopId of uniqueTroopIds) {
            // Per the request, check the enemy with the same ID as the troop.
            const enemy = $dataEnemies[troopId];
            if (enemy && enemy.note) {
                const match = enemy.note.match(levelRegex);
                if (match && match[1]) {
                    troopLevels.push(parseInt(match[1], 10));
                }
            }
        }

        if (troopLevels.length > 0) {
            troopLevels.sort((a, b) => a - b);
            const mid = Math.floor(troopLevels.length / 2);
            let median;
            if (troopLevels.length % 2 === 0) {
                // Even number of levels: average the two middle ones and round.
                median = Math.round((troopLevels[mid - 1] + troopLevels[mid]) / 2);
            } else {
                // Odd number of levels: take the middle one.
                median = troopLevels[mid];
            }
            this._medianEncounterLevel = median;
        }
    };

    // Helper method to get the map name without numeric prefix
    Game_Map.prototype.getCleanMapName = function () {
        const mapInfo = $dataMapInfos[this._mapId];
        if (!mapInfo || !mapInfo.name) {
            return '';
        }
        // Remove numeric prefix pattern like "700 - " or "12 - " etc.
        return mapInfo.name.replace(/^\d+\s*-\s*/, '');
    };

    const PROC_MAP_ID = 636;

    // True only while the party is standing on the open procedural surface of the
    // world square they are addressed by, which is the one place a world square's
    // own name belongs in the map banner. WorldMapTransfer is the authority on
    // where a tile is; without it (load order, a stripped build) the map id alone
    // is checked, which still keeps the name off every hand-made map.
    function isOnNamedWorldSquare(map) {
        const pg = $gameSystem && $gameSystem._procGenData;
        if (!pg || pg.originX === undefined || pg.originY === undefined) return false;
        if (map.mapId() !== PROC_MAP_ID) return false;
        const wmt = window.WorldMapTransfer;
        if (!wmt || typeof wmt.locate !== 'function') return true;
        const loc = wmt.locate();
        return !!loc && loc.layer === 0 && !loc.interior && !loc.alien;
    }

    // Alias Game_Map.displayName to append the calculated level.
    const _Game_Map_displayName = Game_Map.prototype.displayName;
    Game_Map.prototype.displayName = function () {
        let mapName = _Game_Map_displayName.call(this);

        // If display name is empty, fallback to cleaned map name
        if (!mapName || mapName.trim() === '') {
            mapName = this.getCleanMapName();
        }

        // A Door/Transfer event's Note beats everything else: it is the one
        // name written for this specific arrival, more specific than the map's
        // own display name or a named world square.
        if (this._doorNameOverride) {
            mapName = this._doorNameOverride;
        }

        // A deed beats every other name: standing inside a floor the party owns
        // (bought, built or inherited from a companion), the banner says whose
        // house it is rather than repeating the reused interior template's name.
        const H = window.ProceduralHouseSystem;
        if (H && typeof H.isInsideHouse === 'function' && typeof H.isCurrentFloorOwned === 'function'
            && H.isInsideHouse() && H.isCurrentFloorOwned()) {
            mapName = window.T ? window.T('ProceduralHouse.yourHouse') : mapName;
        }

        // A named world square (Paris, Milano, ...) names the OPEN SURFACE of that
        // square and nothing else. This used to read _procGenData.originX/originY
        // alone, and those outlive the excursion: walking from Paris into a fire
        // station, a house, a cellar or a dungeon left the banner reading "Paris"
        // over a map with a display name of its own, and since the square is saved
        // with the game no reload cleared it. It is now scoped to the square
        // itself: the procedural map, on its top layer, out in the open (a
        // generated structure and every roofed interior carry their own name), and
        // never on an alien landing, whose grid cells collide with Earth squares by
        // coincidence.
        if (!this._doorNameOverride && window.WorldGen && window.WorldGen.HardcodedBiomeNames && isOnNamedWorldSquare(this)) {
            const procGenData = $gameSystem._procGenData;
            const coordKey = `${procGenData.originX},${procGenData.originY}`;
            if (window.WorldGen.HardcodedBiomeNames[coordKey]) {
                mapName = window.WorldGen.HardcodedBiomeNames[coordKey];
            }
        }

        // Check if player name is Test
        let suffix = "";
        if ($gameParty.leader() && $gameParty.leader().name() === "Test") {  // i18n-ignore  debug account name
            const tileset = $gameMap.tileset();
            if (tileset) {
                suffix = ` [Tileset: ${tileset.id} - ${tileset.name}]`;  // i18n-ignore  debug suffix, Test account only
            }
        }

        // Check if the map has a name and a median level was calculated.
        if (mapName && this._medianEncounterLevel !== null) {
            return `${mapName} Lv. ${this._medianEncounterLevel}${suffix}`;
        }
        return `${mapName}${suffix}`;
    };

    //-----------------------------------------------------------------------------
    // Scene_Map
    //
    // Override the map name window creation to use our custom window.

    const _Scene_Map_createMapNameWindow = Scene_Map.prototype.createMapNameWindow;
    Scene_Map.prototype.createMapNameWindow = function () {
        // Use our custom window instead of the default one. If it refuses to
        // build, the engine's own one is put up instead: every frame of the map
        // asks this window to close itself while a message is up, and a scene
        // without one takes the whole game down with it.
        try {
            const rect = this.mapNameWindowRect();
            this._mapNameWindow = new Window_MapNameWithBorder(rect);
            this.addChild(this._mapNameWindow);
        } catch (e) {
            console.error('MapLevelDisplay: map name window failed', e);
            if (_Scene_Map_createMapNameWindow) _Scene_Map_createMapNameWindow.call(this);
        }
    };

    // ...and the two places the engine talks to that window without ever
    // asking whether it is there. A map reached by a route that never built
    // one (a scene rebuilt under an overlay, a stripped build) must not throw
    // on every frame a line of dialogue is on screen.
    const _Scene_Map_updateMapNameWindow = Scene_Map.prototype.updateMapNameWindow;
    Scene_Map.prototype.updateMapNameWindow = function () {
        if (!this._mapNameWindow) return;
        _Scene_Map_updateMapNameWindow.call(this);
    };

    const _Scene_Map_stop = Scene_Map.prototype.stop;
    Scene_Map.prototype.stop = function () {
        if (!this._mapNameWindow) this._mapNameWindow = { close() {} };
        _Scene_Map_stop.call(this);
    };

    //-----------------------------------------------------------------------------
    // Window_MapNameWithBorder
    //
    // A custom window that displays the map name with a crisp HTML/CSS parchment overlay.

    // Asked on every frame the map name is fading in or out, and it used to
    // take its own getBoundingClientRect each time, which forces a synchronous
    // layout. The shared frame budget (window.FrameBudget, in
    // Core/ParchmentToast.js) reads the canvas box at most once per drawn frame
    // however many overlays ask for it, so the banner reads it from there and
    // only measures the canvas itself when no budget is loaded.
    function _msgGetScale() {
        let r = window.FrameBudget && window.FrameBudget.canvasRect();
        if (!r) {
            const el = document.getElementById('gameCanvas');
            if (!el) return { sx: 1, sy: 1, ox: 0, oy: 0 };
            r = el.getBoundingClientRect();
        }
        return {
            sx: r.width / Graphics.width,
            sy: r.height / Graphics.height,
            ox: r.left,
            oy: r.top
        };
    }

    class Window_MapNameWithBorder extends Window_MapName {
        initialize(rect) {
            super.initialize(rect);
            this.x = 20;
            this.visible = false;

            // Remove stale overlay if any
            const old = document.getElementById('html-map-name-overlay');
            if (old) old.remove();

            const root = document.createElement('div');
            root.id = 'html-map-name-overlay';
            
            this._htmlMapNameRoot = root;
            document.body.appendChild(root);
        }

        destroy(options) {
            if (this._htmlMapNameRoot && this._htmlMapNameRoot.parentNode) {
                this._htmlMapNameRoot.parentNode.removeChild(this._htmlMapNameRoot);
            }
            this._htmlMapNameRoot = null;
            super.destroy(options);
        }

        update() {
            super.update();
            // Keep the canvas window hidden
            this.visible = false;

            if (!this._htmlMapNameRoot) return;

            const s = this._htmlMapNameRoot.style;
            const opacity = this.contentsOpacity;

            // Hidden case (the common one): only the map-name fade being 0. Avoid
            // recomputing displayName() and rewriting styles every frame - just
            // hide once on the transition to hidden.
            if (opacity <= 0) {
                if (this._htmlShown) {
                    s.display = 'none';
                    this._htmlShown = false;
                }
                return;
            }

            const text = $gameMap.displayName();
            if (!text) {
                if (this._htmlShown) {
                    s.display = 'none';
                    this._htmlShown = false;
                }
                return;
            }

            // Reposition/restyle only when the text or layout inputs change (map
            // change / resize), not every frame. Scale is captured here and reused.
            const sc = _msgGetScale();
            const layoutSig = text + '|' + sc.sx + ',' + sc.sy + ',' + sc.ox + ',' + sc.oy;
            if (!this._htmlShown || layoutSig !== this._htmlLayoutSig) {
                this._htmlLayoutSig = layoutSig;
                this._htmlMapNameRoot.textContent = text;
                s.display = 'block';
                s.left = 'auto';
                s.top = (sc.oy + 8 * sc.sy) + 'px';
                const rightEdge = window.innerWidth - (sc.ox + sc.sx * Graphics.width);
                s.right = (rightEdge + 8 * sc.sx) + 'px';
                const padX = Math.round(18 * sc.sx);
                const padY = Math.round(8 * sc.sy);
                s.padding = `${padY}px ${padX}px`;  // i18n-ignore  css value
                const scaledFont = Math.round(20 * sc.sy * 0.85);
                s.fontSize = scaledFont + 'px';
                this._htmlShown = true;
            }

            // Opacity tracks the engine fade every frame.
            s.opacity = (opacity / 255).toString();
        }
    }

    // Make the class globally accessible
    window.Window_MapNameWithBorder = Window_MapNameWithBorder;

})();