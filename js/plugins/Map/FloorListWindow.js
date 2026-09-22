/*:
 * @target MZ
 * @plugindesc v2.0 Adds a "Floor List" window for selecting generated dungeon floors (sets variable #17 and switch #29). Shows floor display on map 3. <FloorListWindow>
 * @author OmniLex
 *
 * @command showFloorList
 * @text Show Floor List
 * @desc Opens a window listing all generated dungeon floors. Selecting one sets Variable 17 to that floor and turns Switch 29 on; cancel closes the window.
 *
 * @help
 * • Place this plugin **below** DungeonFloorSystem.
 * • The DOM overlay lives in FloorListWindowUI.js, keep it right after
 *   this plugin in the plugin manager.
 * • Call the plugin command "Show Floor List" or via script:
 *   `PluginManager.callCommand(null, "FloorListWindow", "showFloorList", {});`
 *
 * Behavior:
 * - Shows F0 - Hypernet point at the top (sets variable 17 to 0 when selected).
 * - Shows Hypermetro (sets variable 17 to -1 when selected).
 * - If no dungeon is generated yet, shows only the empty message (select to close).
 * - Floors ≤ max explored show as "F12 – Meadows" (map display name).
 * - Floors > max show as "???" (greyed out, skipped when navigating).
 * - Selecting a floor sets game variable #17 to that floor number and
 *   turns switch #29 on.
 * - When on map 3, displays "Floor: X" in top right corner (X = variable 1).
 */

(() => {
    const PLUGIN_NAME   = "FloorListWindow";
    // Fall back to DungeonFloorSystem's own default (variable 2 = max floor reached),
    // never 0, so $gameVariables.value(0) does not lock every floor as "???".
    const MAX_FLOOR_VAR = window.DungeonFloorSystemParams?.maxFloorVariable || 2;
    const FLOOR_DISPLAY_MAP = 3; // Map ID where floor display appears
    const FLOOR_VARIABLE = 1;    // Variable that stores current floor

    PluginManager.registerCommand(PLUGIN_NAME, "showFloorList", () => {
        SceneManager.push(Scene_FloorList);
    });

    //--------------------------------------------------------------------------
    // Localization, consumed by FloorListWindowUI.js
    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Helper function to extract first map ID from comma-separated string
    //--------------------------------------------------------------------------
    function getFirstMapId(mapIdValue) {
        if (typeof mapIdValue === 'string' && mapIdValue.includes(',')) {
            return parseInt(mapIdValue.split(',')[0]);
        }
        return parseInt(mapIdValue);
    }

    //--------------------------------------------------------------------------
    // Helper function to load map display name
    //--------------------------------------------------------------------------
    function getMapDisplayName(mapId, callback) {
        // Extract first map ID if it's a comma-separated string
        const actualMapId = getFirstMapId(mapId);
        const filename = 'Map%1.json'.format(String(actualMapId).padZero(3));
        const xhr = new XMLHttpRequest();
        const url = 'data/' + filename;
        xhr.open('GET', url);
        xhr.overrideMimeType('application/json');
        xhr.onload = function() {
            if (xhr.status < 400) {
                const data = JSON.parse(xhr.responseText);
                callback(data.displayName || null);
            } else {
                callback(null);
            }
        };
        xhr.onerror = function() {
            callback(null);
        };
        xhr.send();
    }

    //--------------------------------------------------------------------------
    // FloorListData, list building, enable rules, selection effects
    //--------------------------------------------------------------------------
    const FloorListData = {
        // Copy lives in js/i18n/<lang>/plugins/FloorList.json.
        text(key) {
            return T('FloorList.' + key);
        },

        // In sandbox mode the shaft has no locked buttons: every floor of the
        // tower, above and below ground, is named and reachable from the lift.
        sandbox() {
            return !!(typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._isSandboxMode);
        },

        // The shaft is listed the way it stands: the floors above ground first,
        // the deepest at the bottom, and the ground itself in between. The
        // cursor opens on it (see initialIndex), so the list is entered at the
        // level the party is used to reading from.
        buildItemList() {
            const data = [];
            const generated = $gameSystem.isDungeonGenerated();

            const sandbox = this.sandbox();

            if (generated) {
                const maxFloor = $gameVariables.value(MAX_FLOOR_VAR) || 0;
                const floors   = $gameSystem._dungeonFloors || [];
                for (let i = floors.length - 1; i >= 1; i--) {
                    if (sandbox || i <= maxFloor) {
                        const mapId = floors[i];
                        const actualMapId = getFirstMapId(mapId);
                        const info  = $dataMapInfos[actualMapId] || {};
                        // Initially use map name, replaced with display name async
                        const name = info.name || T('FloorList.unknownMap');
                        data.push({ floor: i, label: `F${i} - ${name}` });
                    } else {
                        data.push({ floor: i, label: this.text("unknown") });
                    }
                }
            }

            data.push({ floor: 0, label: T('FloorList.hypernetPoint'), isHypernet: true });

            // The lower tower. An unreached floor is never named: which
            // structure it holds is part of what is found down there.
            const tower = window.DungeonFloors;
            if (tower) {
                for (let f = -1; f >= tower.deepestFloor; f--) {
                    // The Tip of the Spear is not a stop on this line.
                    if (f === tower.deepestFloor) continue;
                    data.push({
                        floor: f,
                        label: sandbox || tower.isLowerFloorUnlocked(f)
                            ? tower.lowerFloorLabel(f)
                            : this.text("unknown"),
                    });
                }
            }

            if (!generated) data.push({ floor: null, label: this.text("noFloors") });
            return data;
        },

        // Where the cursor opens: on the ground floor, so the list is entered
        // between the climb and the descent rather than at the top of a hundred
        // unreached floors.
        initialIndex(items) {
            const ground = items.findIndex(item => item && item.floor === 0);
            if (ground >= 0) return ground;
            const first = items.findIndex(item => this.isEnabled(item));
            return first >= 0 ? first : 0;
        },

        // Resolves proper display names from the map JSON files, mutating the
        // item labels in place. Calls onDone once every request has returned.
        loadDisplayNames(items, onDone) {
            if (!$gameSystem.isDungeonGenerated()) {
                if (onDone) onDone();
                return;
            }
            const floors = $gameSystem._dungeonFloors || [];
            const maxFloor = $gameVariables.value(MAX_FLOOR_VAR) || 0;
            const toLoad = [];
            const sandbox = this.sandbox();
            for (let i = 1; i < floors.length && (sandbox || i <= maxFloor); i++) {
                toLoad.push(i);
            }
            if (toLoad.length === 0) {
                if (onDone) onDone();
                return;
            }
            let loadCount = 0;
            for (const i of toLoad) {
                const mapId = floors[i];
                const actualMapId = getFirstMapId(mapId);
                const item = items.find(it => it.floor === i);
                getMapDisplayName(mapId, (displayName) => {
                    if (item && displayName) {
                        item.label = `F${i} - ${displayName}`;
                    } else if (item && !displayName) {
                        const info = $dataMapInfos[actualMapId] || {};
                        item.label = `F${i} - ${info.name || "Unknown"}`;
                    }
                    loadCount++;
                    if (loadCount >= toLoad.length && onDone) onDone();
                });
            }
        },

        isEnabled(item) {
            if (!item) return false;
            if (item.floor === null) return true;
            if (item.floor === 0) return true;
            if (this.sandbox()) return true;
            if (item.floor < 0) {
                const tower = window.DungeonFloors;
                return tower ? tower.isLowerFloorUnlocked(item.floor) : false;
            }
            const maxFloor = $gameVariables.value(MAX_FLOOR_VAR) || 0;
            return item.floor <= maxFloor;
        },

        applySelection(item) {
            if (!item || item.floor === null) return;
            $gameVariables.setValue(17, item.floor);
            $gameSwitches.setValue(29, true);
        },
    };

    //--------------------------------------------------------------------------
    // Window_FloorDisplay - Always visible floor indicator
    //--------------------------------------------------------------------------
    class Window_FloorDisplay extends Window_Base {
        initialize() {
            Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 0, 0));
            this.opacity = 0;
            this.visible = false;
            this._lastFloor = null;

            const old = document.getElementById('html-floor-display');
            if (old) old.remove();
            const el = document.createElement('div');
            el.id = 'html-floor-display';
            el.className = 'html-parchment-overlay';
            this._htmlEl = el;
            document.body.appendChild(el);
            // Position only depends on the canvas geometry, which changes on
            // window/fullscreen resize - reposition then instead of every frame.
            this._onResize = () => this._syncPos();
            window.addEventListener('resize', this._onResize);
            this.refresh();
        }

        destroy(options) {
            if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
            if (this._htmlEl && this._htmlEl.parentNode) this._htmlEl.parentNode.removeChild(this._htmlEl);
            this._htmlEl = null;
            super.destroy(options);
        }

        refresh() {
            if (!this._htmlEl) return;
            const floorNum = $gameVariables.value(FLOOR_VARIABLE);
            this._htmlEl.innerHTML = T('FloorList.floorHud', { num: `<span class="floor-display-num">${floorNum}</span>` });
            this._htmlEl.style.display = 'block';
            this._syncPos();
        }

        _syncPos() {
            const canvas = document.getElementById('gameCanvas');
            if (!canvas || !this._htmlEl) return;
            const r = canvas.getBoundingClientRect();
            const sx = r.width / Graphics.width, sy = r.height / Graphics.height;
            const s = this._htmlEl.style;
            s.right   = (window.innerWidth - r.right + Math.round(10 * sx)) + 'px';
            s.top     = (r.top + Math.round(10 * sy)) + 'px';
            s.left    = 'auto';
            s.padding = `${Math.round(6 * sy)}px ${Math.round(16 * sx)}px`;  // i18n-ignore  css value
            s.fontSize = Math.round(16 * sy) + 'px';
        }

        update() {
            Window_Base.prototype.update.call(this);
            const floor = $gameVariables.value(FLOOR_VARIABLE);
            if (this._lastFloor !== floor) {
                this._lastFloor = floor;
                this.refresh(); // refresh() repositions via _syncPos()
            }
        }
    }

    //--------------------------------------------------------------------------
    // Scene_Map - Add floor display window on map 3
    //--------------------------------------------------------------------------
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this.createFloorDisplayWindow();
    };

    Scene_Map.prototype.createFloorDisplayWindow = function() {
        if ($gameMap.mapId() === FLOOR_DISPLAY_MAP) {
            this._floorDisplayWindow = new Window_FloorDisplay();
            this.addWindow(this._floorDisplayWindow);
        }
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        // Check if we need to add/remove floor display window
        if ($gameMap.mapId() === FLOOR_DISPLAY_MAP && !this._floorDisplayWindow) {
            this.createFloorDisplayWindow();
        } else if ($gameMap.mapId() !== FLOOR_DISPLAY_MAP && this._floorDisplayWindow) {
            this.removeChild(this._floorDisplayWindow);
            // destroy() tears down the #html-floor-display DOM overlay; without it
            // the parchment overlay would stay visible on every other map.
            this._floorDisplayWindow.destroy();
            this._floorDisplayWindow = null;
        }
    };

    //--------------------------------------------------------------------------
    // Scene_FloorList, lifecycle is extended by FloorListWindowUI.js
    //--------------------------------------------------------------------------
    class Scene_FloorList extends Scene_MenuBase {
        create() {
            Scene_MenuBase.prototype.create.call(this);
        }
    }

    // Expose for the UI layer
    window.FloorListData   = FloorListData;
    window.Scene_FloorList = Scene_FloorList;
})();
