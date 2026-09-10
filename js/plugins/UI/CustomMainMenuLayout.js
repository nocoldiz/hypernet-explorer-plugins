/*:
 * @target MZ
 * @plugindesc Fully custom D&D 5e-style Parchment Character Sheet & Adventure Manual UI DOM Overlay [Claude+GPT].
 * @author Esoteric Heavy Industries
 *
 * @help
 * This plugin:
 * - Overlays a gorgeous procedural tea-stained parchment double-page manual.
 * - Left Page: Commands Pockets with classic typography, icons, and hotkeys.
 * - Right Page: D&D 5e Character Sheet mapping stats to STR, CON, DEX, INT, WIS, and PSI.
 * - Renders alchemical fluid tubes for HP/MP/TP and exhaustion bars for Hunger/Sleep.
 * - Renders companion circular frames to switch active character sheets dynamically.
 * - Renders dynamic pixel character portraits directly on DOM canvases.
 * - Maintains full keyboard, mouse, and gamepad arrow key navigation support.
 * - Owns the game's hotkey layout, laid out to Bethesda (Skyrim/Fallout)
 *   muscle memory. Every key lives in the HOTKEYS table near the top of the
 *   file, which drives Input.keyMapper, the badges on the pockets tiles, the
 *   in-menu shortcuts and the on-map shortcuts at once.
 *
 *     Tab  Open / close the menu        J  Journal (Quest Log)
 *     I    Inventory                    U  Magic (Spells)
 *     C    Character (Status)           O  Outfit (Equip)
 *     M    Map (minimap toggle)         R  Rest (Wait / Sleep)
 *     B    Build                        V  Vehicles
 *     H    Help (Codex)                 F  Factions
 *     K    Cooking                      N  Training
 *     Y    Bestiary                     G  Sandbox (tester only)
 *     1-9  Favourite items (on the map)
 *     1/2/3 Thinker / Multiplayer / Hypernet (inside the menu only)
 *     F9   Quicksave, F10 Quickload (Core/SaveSystem.js)
 *
 *   W/A/S/D move, Z/X are ok/cancel and Q/E zoom the world map
 *   (Map/WorldMap.js), so none of those are available for commands. T is
 *   world map <-> procedural map (Map/WorldMapReturn.js). Assets, Biologics
 *   and Options have no dedicated hotkey and open from their pockets tile.
 */

(function () {
    const pluginName = "CustomMainMenuLayout";

    // Escape user-controllable text (player/party/pet names) before innerHTML
    // injection so a `<` in a name can't break or inject markup.
    const HTML_ESCAPES = {
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    };
    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
    }

    // While Em travels with the party the needs cards and the workforce tile
    // answer to her register instead of the clinical one
    // (CharacterCreationPresets.emLabel). Every other pockets tile keeps its
    // ordinary label. Every other party gets the fallback passed in here, so
    // this is a no-op on an ordinary run.
    function emLabel(key, label) {
        return window.CharacterPresets?.emLabel?.(key, label) ?? label;
    }

    // Both travel entries that offer the world map are one row doing three jobs:
    // on Earth it goes back to map 315, on another planet's surface there is no
    // world map to go back to and the press opens the landing-site picker
    // instead, and on a floor of the tower it calls the lift, which is the only
    // way off a floor (WorldMapReturn's commandWorldMap decides, this only
    // names it).
    function worldMapReturnLabel() {
        if (window.GalaxySim?.isAlienSurface?.()) return T('MainMenu.cmd.chooseLandingSite');
        if (window.DungeonFloors?.insideTower?.()) return T('MainMenu.cmd.returnToElevator');
        return T('MainMenu.cmd.returnToWorldMap');
    }

    // The 3D voxel world (VoxelWorld/*) is up behind the menu. The map under it
    // is whatever the party walked out of - very often map 315 itself, since a
    // free walk starts from the world map - so the travel page cannot decide
    // what to offer from the map id alone: out here the only entry that makes
    // sense is "return to the world map", which ends the walk or the drive and
    // puts the party down on the square they reached. "Stop travel" would visit
    // that square instead, generating a procedural map nobody asked for.
    // A map noted <disableReturn> holds the party: WorldMapReturn refuses the
    // press, so the row is not offered either (Map/WorldMapReturn.js).
    function returnDisabled() {
        return !!window.WorldMapReturn?.isReturnDisabled?.();
    }

    function inVoxelWorld() {
        return !!(window.VoxelWorldSystem && window.VoxelWorldSystem.isActive() &&
                  !window.VoxelWorldSystem.isTitleDrive());
    }

    // The Hyperdeck tile is always usable: every party owns a deck, and the
    // deck decides for itself whether it can boot. It used to be gated on
    // carrying an internet-capable device, which is no longer what the machine
    // is made of.

    // The Alchemistry bench is a thing you carry, not a place: the tile is only
    // usable while the party holds the portable kit, and is greyed out (rather
    // than hidden) the way the Hypernet tile is when no device is carried.
    const ALCHEMISTRY_KIT_ITEM_ID = 390;

    function isAlchemistryAvailable() {
        if (typeof $gameParty === "undefined" || !$gameParty || typeof $dataItems === "undefined") return false;
        const kit = $dataItems[ALCHEMISTRY_KIT_ITEM_ID];
        return !!(kit && $gameParty.hasItem(kit));
    }

    // =========================================================================
    // Hotkey layout (Bethesda-style)
    // =========================================================================
    // ONE table drives everything: the Input.keyMapper entries, the badge
    // printed on each pockets tile, the in-menu shortcuts and the on-map
    // shortcuts. Add keys here and nowhere else, the badge and the key it
    // claims used to be declared separately and had drifted apart on half the
    // commands (Equip advertised U but listened on E, Save advertised I but
    // listened on A, ...).
    //
    // The layout follows Skyrim/Fallout muscle memory:
    //   I Inventory · J Journal (Quest Log) · U Magic(Spells)
    //   C Character(Status) · M Map · O Outfit(Equip) · R Rest(Wait)
    //   B Build · H Help · Tab open/close menu
    //   F5 quicksave · F9 quickload (see Core/SaveSystem.js)
    //
    // Reserved and unavailable: W/A/S/D (movement), Z/X (ok/cancel),
    // Q/E (Map/WorldMap.js zoom, that plugin loads later and wins the mapping),
    // T (Map/WorldMapReturn.js: world map <-> procedural map toggle).
    //
    // Assets, Biologics and Options lost their keys to Help, Spells and Equip
    // respectively: they carry no badge and open from their pockets tile.
    // `input` overrides the derived "letter_<key>" symbol for keys another
    // plugin already owns; `code` is omitted for those so we don't fight over
    // Input.keyMapper.
    const HOTKEYS = [
        { symbol: "item",        key: "I", code: 73 },
        { symbol: "quest_log",   key: "J", code: 74 },
        { symbol: "skill",       key: "U", code: 85 },
        { symbol: "status1",     key: "C", code: 67 },
        { symbol: "equip",       key: "O", code: 79 },
        { symbol: "sleep_menu",  key: "R", code: 82 },
        { symbol: "world_map",   key: "M", input: "world_map_toggle" }, // owned by Map/WorldMap.js
        { symbol: "vehicles",    key: "V", code: 86 },
        { symbol: "build",       key: "B", code: 66 },
        { symbol: "help",        key: "H", code: 72 },
        { symbol: "training",    key: "N", code: 78 },
        // Digits stay the favourites hotbar on the map (ItemSystem/
        // ItemSystemInventory.js already maps 1-9 to it, Skyrim-style), so these
        // one only listens on the symbol that plugin defines and is reachable
        // by key from inside the menu, never from the field.
        { symbol: "thinker",     key: "1", input: "1" },
    ];

    // Input symbol each hotkey listens on, and the badge lookup used by the
    // pockets tiles. Commands missing from HOTKEYS (Save, Resign, Dynamics,
    // Pets, Tools, Assets, Biologics, Options) simply render without a badge.
    HOTKEYS.forEach(h => { h.input = h.input || ("letter_" + h.key.toLowerCase()); });
    const HOTKEY_LABELS = {};
    HOTKEYS.forEach(h => { HOTKEY_LABELS[h.symbol] = h.key; });

    // The one key legend the menu is allowed: the letter beside the entry it
    // belongs to. It names the device actually in use, so a player on a pad is
    // never shown a key their controller does not have.
    const hotkeyBadge = label => (label && Input.lastInputDevice && Input.lastInputDevice() === 'pad')
        ? ""
        : (label ? `<span class="hotkey-badge">${label}</span>` : "");

    // Attribute points are handed out one every few levels and are only spent
    // from the Status sheet, so the pockets page is the last place a player
    // sees before forgetting them. window.StatPoints (Status scene) is the
    // only authority on what is still unspent: this just sums the pool over
    // the whole active party so one badge speaks for everybody.
    const partyStatPointsAvailable = () => {
        const points = window.StatPoints;
        if (!points || typeof $gameParty === "undefined" || !$gameParty) return 0;
        return ($gameParty.members() || []).reduce(
            (sum, member) => sum + (points.available(member) || 0), 0);
    };

    // Every index here is a cell of img/system/IconSet.png (16 cells to a row,
    // 464 cells in all). The sheet has been redrawn since these were first
    // picked, so they are chosen from what the cell actually shows today, not
    // from what it used to hold: keep them in step with js/db/Sprites/Icons.json
    // whenever the sheet changes again.
    const COMMAND_ICONS = {
        item: 209,
        equip: 137,
        skill: 70,
        status1: 188,
        specializations: 87,
        vector_gun: 115,
        sleep_menu: 205,
        save: 121,
        search: 79,
        cooking: 219,
        thinker: 290,
        alchemistry: 180,
        build: 210,
        quest_log: 231,
        diary: 189,
        training: 193,
        research: 225,
        bestiary: 291,
        cards: 416,
        world_map: 190,
        factions: 132,
        biologics: 84,
        augments: 143,
        help: 186,
        options: 83,
        tools: 216,
        dynamics: 196,
        sandbox: 245,
        multiplayer: 246,
        hypernet: 306,
        radio: 80,
        gameEnd: 214,
        assets: 313,
        deeds: 192,
        pets: 298,
        vehicles: 195,
        army: 131
    };

    // The rows that are not main-menu commands: the World Map page, the Tools
    // pocket and the Dynamics tiles. They live here so every icon the menu
    // draws is picked from one table instead of being spelled out inline.
    const PAGE_ICONS = {
        travelReturn: 140,
        travelGoUp: 73,
        travelGoDown: 74,
        travelMinimap: 151,
        travelOpenMap: 190,
        travelAtlas: 229,
        travelResume: 249,
        travelStop: 282,
        returnToShip: 296,
        hexphone: 206,
        alchemistryKit: 180,
        dynamicsRoster: 196,
        dynamicsTurnOrder: 220,
        dynamicsWiki: 234,
        dynamicsHistory: 230,
        deedsRent: 313
    };

    // One cell of the sheet, as an inline background. Every icon in the menu
    // goes through here: the offsets used to be written out by hand at a dozen
    // call sites, which is how half of them drifted off their cell.
    //
    // The sheet is drawn at 32px to the cell but the menu draws its icons in a
    // smaller box, so the whole sheet is scaled to that box instead of being
    // sampled on the native grid: sampling it natively is what cut every icon
    // down to its top left corner (the magnifier lost its handle). The box
    // size comes from --icon-size on the element, so one stylesheet rule
    // decides it and the offsets follow; the fallback keeps the icons whole
    // even if the rule is missing.
    // The cell the icon sits in is handed over as two custom properties and
    // .menu-icon in css/theme.css does the drawing: the sheet owns the sprite
    // box, the offsets follow from it, and no call site paints anything.
    const iconStyle = index =>
        "--icon-col:" + (index % 16) + ";--icon-row:" + Math.floor(index / 16);


    // =========================================================================
    // Resources Loader & ConfigManager Persistence
    // =========================================================================




    // =========================================================================
    // Input tracking fallback for RPG Maker
    // =========================================================================
    let lastInputType = 'keyboard';
    const _Input_onKeyDown = Input._onKeyDown;
    Input._onKeyDown = function (event) {
        _Input_onKeyDown.call(this, event);
        lastInputType = 'keyboard';
    };

    const _TouchInput_onTrigger = TouchInput._onTrigger;
    TouchInput._onTrigger = function (x, y) {
        _TouchInput_onTrigger.call(this, x, y);
        lastInputType = 'mouse';
    };

    const _Input_pollGamepads = Input._pollGamepads;
    Input._pollGamepads = function () {
        _Input_pollGamepads.call(this);
        const gamepads = navigator.getGamepads();
        if (gamepads) {
            for (const gamepad of gamepads) {
                if (gamepad && gamepad.buttons.some(b => b.pressed)) {
                    lastInputType = 'gamepad';
                    break;
                }
            }
        }
    };

    // Claim the keys declared in HOTKEYS. Entries without a `code` are owned by
    // another plugin (see the table) and are only listened to, never remapped.
    HOTKEYS.forEach(h => {
        if (h.code) Input.keyMapper[h.code] = h.input;
    });

    // =========================================================================
    // UIMenuInputManager (Full keyboard & gamepad menu navigator overlay)
    // =========================================================================
    class UIMenuInputManager {
        static init(menuContainer) {
            this.container = menuContainer;
            this.activeElements = [];
            this.focusIndex = 0;
            this.active = false;
            this.cols = 2;
        }

        static activate(cols = 2) {
            this.activeElements = Array.from(this.container.querySelectorAll('.focusable'));
            this.focusIndex = 0;
            this.cols = cols;
            this.active = true;
            this.buildRows();
            this.updateFocus();
        }

        // The commands pockets are split into logical groups of any size, so a tile's
        // column is no longer just (index % cols): a group with an odd number of
        // entries shifts everything after it. Bucket the focusable tiles into real
        // visual rows by their on-screen position and navigate on that instead.
        // this._rows stays null when geometry is unavailable (hidden container),
        // in which case navigation falls back to the flat index maths.
        static buildRows() {
            this._rows = null;
            const boxes = this.activeElements.map(el => el.getBoundingClientRect());
            if (!boxes.length || boxes.every(b => !b.width && !b.height)) return;

            const rows = [];
            boxes.forEach((box, i) => {
                const row = rows.find(r => Math.abs(r.top - box.top) <= Math.max(4, box.height / 2));
                if (row) row.items.push({ index: i, left: box.left });
                else rows.push({ top: box.top, items: [{ index: i, left: box.left }] });
            });
            rows.sort((a, b) => a.top - b.top);
            rows.forEach(r => r.items.sort((a, b) => a.left - b.left));
            this._rows = rows;
        }

        // Position of the focused tile as [row, column] within this._rows.
        static focusPosition() {
            if (!this._rows) return null;
            for (let r = 0; r < this._rows.length; r++) {
                const c = this._rows[r].items.findIndex(it => it.index === this.focusIndex);
                if (c >= 0) return [r, c];
            }
            return null;
        }

        // Step one row up or down, landing on the tile horizontally closest to the
        // one we left. Wraps around the ends like the old index maths did.
        static moveRow(delta) {
            const pos = this.focusPosition();
            if (!pos) return false;
            const [row, col] = pos;
            const left = this._rows[row].items[col].left;
            const target = this._rows[(row + delta + this._rows.length) % this._rows.length];
            let best = target.items[0];
            target.items.forEach(it => {
                if (Math.abs(it.left - left) < Math.abs(best.left - left)) best = it;
            });
            this.focusIndex = best.index;
            return true;
        }

        // Step within the current row; does not wrap onto the neighbouring rows.
        static moveColumn(delta) {
            const pos = this.focusPosition();
            if (!pos) return false;
            const [row, col] = pos;
            const next = this._rows[row].items[col + delta];
            if (!next) return true;
            this.focusIndex = next.index;
            return true;
        }

        static deactivate() {
            this.active = false;
        }

        static update() {
            if (!this.active) return;

            // A focused text field owns the keyboard (the search bar above the
            // party cards, a pet's name field). Their key events are stopped at
            // the element so Input never sees the typing, but the gamepad poll
            // and any key pressed before the field took focus still reach here,
            // and "I" must type an i rather than open the backpack.
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

            // Walking the party comes before the back-out check because TAB is
            // shared between the two: while the roster cards are on the page it
            // steps to the next member (so the needs panel reports each of them
            // in turn), and only the cancel key leaves the menu. The shoulder
            // buttons do the same on a pad, backwards and forwards.
            const menuScene = SceneManager._scene;
            if (menuScene && menuScene.canCycleSelectedActor && menuScene.canCycleSelectedActor()) {
                if (Input.isTriggered('pageup')) {
                    menuScene.cycleSelectedActor(-1);
                    return;
                }
                if (Input.isTriggered('pagedown') || Input.isTriggered('tab')) {
                    menuScene.cycleSelectedActor(1);
                    return;
                }
            }

            // Backing out is answered before anything else: a page can be empty
            // of focusable tiles (a Followers list with nobody in it, a Vehicles
            // list with nothing owned) and the cancel key still has to work
            // there, so it must not sit behind the focus-ring guard below.
            if (Input.isTriggered('cancel') || Input.isTriggered('tab')) {
                // Tab backs out of the menu the way it opened it (Bethesda).
                const scene = SceneManager._scene;
                if (!scene || !scene.backOutOneLevel || !scene.backOutOneLevel()) {
                    SoundManager.playCancel();
                    if (scene) scene.popScene();
                }
                return;
            }

            if (this.activeElements.length === 0) return;

            let moved = false;
            const len = this.activeElements.length;

            if (Input.isTriggered('down') || Input.isRepeated('down')) {
                if (!this.moveRow(1)) {
                    if (this.focusIndex + this.cols < len) {
                        this.focusIndex += this.cols;
                    } else {
                        this.focusIndex = this.focusIndex % this.cols;
                    }
                }
                moved = true;
            } else if (Input.isTriggered('up') || Input.isRepeated('up')) {
                if (!this.moveRow(-1)) {
                    if (this.focusIndex - this.cols >= 0) {
                        this.focusIndex -= this.cols;
                    } else {
                        let target = Math.floor((len - 1) / this.cols) * this.cols + (this.focusIndex % this.cols);
                        if (target >= len) target -= this.cols;
                        this.focusIndex = target >= 0 ? target : 0;
                    }
                }
                moved = true;
            } else if (Input.isTriggered('right') || Input.isRepeated('right')) {
                if (this.moveColumn(1)) {
                    moved = true;
                } else if (this.focusIndex % this.cols < this.cols - 1 && this.focusIndex + 1 < len) {
                    this.focusIndex += 1;
                    moved = true;
                }
            } else if (Input.isTriggered('left') || Input.isRepeated('left')) {
                if (this.moveColumn(-1)) {
                    moved = true;
                } else if (this.focusIndex % this.cols > 0) {
                    this.focusIndex -= 1;
                    moved = true;
                }
            } else if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                const el = this.activeElements[this.focusIndex];
                if (el) el.click();
            }

            // Keyboard direct hotkeys when the menu is open. The Sandbox tile is
            // hidden unless the actor is named Test or sandbox mode is active
            // (#92), and triggerHotkey only fires on tiles that exist, so the
            // gate is implicit.
            HOTKEYS.forEach(h => {
                if (Input.isTriggered(h.input)) this.triggerHotkey(h.symbol);
            });

            if (moved) {
                SoundManager.playCursor();
                this.updateFocus();
            }
        }

        static triggerHotkey(symbol) {
            const el = this.container.querySelector(`[data-symbol="${symbol}"]`);
            // Greyed-out tiles (Sleep away from a bed, Build on the world map)
            // stop mouse clicks through pointer-events, but el.click() ignores
            // that, so the hotkey has to respect it explicitly.
            if (el && el.style.pointerEvents !== "none") {
                SoundManager.playOk();
                el.click();
            }
        }

        static updateFocus() {
            this.activeElements.forEach((el, idx) => {
                if (idx === this.focusIndex) {
                    el.classList.add('selected');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('selected');
                }
            });
        }
    }

    // Published so menus living in other plugins can hand the navigator over; WorldMapReturn
    // suspends it while the world map choice window owns the input.
    window.UIMenuInputManager = UIMenuInputManager;

    // =========================================================================
    // Canvas window paint deferral
    // =========================================================================
    // Every parchment menu in the game still builds the engine's own windows,
    // because that is where the plugins hang their command handlers (see
    // triggerUICommand), and then hides all of them in the same frame because
    // the DOM overlay draws the menu itself. Scene_Menu does it at the end of
    // create() below; the backpack does it at ItemSystemInventory.js
    // Scene_EnhancedItem.prototype.create, and so on through every scene
    // reachable from the pockets.
    //
    // Painting those windows into contents bitmaps nobody ever sees is pure
    // waste on every open, and it is the expensive half of building them:
    // Window_MenuStatus blits a 144x144 face plus three gauges per party member
    // (pulling those faces through ImageManager to do it), and the backpack's
    // item list lays out an icon and two text runs for every single thing the
    // party is carrying.
    //
    // So: painting is suspended for the whole of any menu scene's create(), and
    // settled up the instant it returns (SceneManager.onSceneCreate, which runs
    // immediately after create() and before the scene is ever rendered).
    // Windows still on screen at that point paint right there, so nothing
    // flashes blank; windows the scene hid stay unpainted, and pick the work up
    // on their next update if they are ever shown after all. Only the drawing is
    // ever skipped, never makeCommandList or anything else a plugin reads back.
    let deferringMenuWindowPaint = false;
    const deferredPaintWindows = [];

    const _Window_Selectable_drawAllItems = Window_Selectable.prototype.drawAllItems;
    Window_Selectable.prototype.drawAllItems = function () {
        if (deferringMenuWindowPaint) {
            if (!this._dndPaintPending) {
                this._dndPaintPending = true;
                deferredPaintWindows.push(this);
            }
            return;
        }
        _Window_Selectable_drawAllItems.call(this);
    };

    const _Window_Selectable_update = Window_Selectable.prototype.update;
    Window_Selectable.prototype.update = function () {
        if (this._dndPaintPending && this.visible) {
            this._dndPaintPending = false;
            this.paint();
        }
        _Window_Selectable_update.call(this);
    };

    // Scene_MenuBase.prototype.create is the first thing every menu scene's own
    // create() calls, so this is the earliest point at which the suspension can
    // start and still cover the whole scene.
    const _Scene_MenuBase_create = Scene_MenuBase.prototype.create;
    Scene_MenuBase.prototype.create = function () {
        deferringMenuWindowPaint = true;
        _Scene_MenuBase_create.call(this);
    };

    // Belt and braces: if a scene's create() ever throws, onSceneCreate below
    // never runs, and without this the suspension would stay latched on for the
    // rest of the session and every list in the game would draw blank.
    const _SceneManager_changeScene = SceneManager.changeScene;
    SceneManager.changeScene = function () {
        deferringMenuWindowPaint = false;
        deferredPaintWindows.length = 0;
        _SceneManager_changeScene.call(this);
    };

    const _SceneManager_onSceneCreate = SceneManager.onSceneCreate;
    SceneManager.onSceneCreate = function () {
        deferringMenuWindowPaint = false;
        while (deferredPaintWindows.length > 0) {
            const win = deferredPaintWindows.pop();
            if (win._dndPaintPending && win.visible) {
                win._dndPaintPending = false;
                win.paint();
            }
        }
        _SceneManager_onSceneCreate.call(this);
    };

    // =========================================================================
    // Scene_Menu - Intercept and replace layout with D&D HTML Overlay
    // =========================================================================
    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function () {
        // Clear TouchInput immediately to prevent the opening right-click/touch from carrying over and immediately closing the menu!
        if (typeof TouchInput !== 'undefined' && typeof TouchInput.clear === 'function') {
            TouchInput.clear();
        }

        const members = $gameParty.members();
        const actor = $gameParty.menuActor();
        this._selectedActorIndex = members.indexOf(actor);
        if (this._selectedActorIndex < 0) this._selectedActorIndex = 0;
        // Nobody has been singled out yet, so the addictions card opens on the
        // party as a whole. Clicking a member card pins it to that member.
        this._needsActorPinned = false;
        this._isToolsPage = false;
        this._isDynamicsPage = false;
        this._isDeedsPage = false;
        this._dynamicsDrag = null;
        this._isPetsPage = false;
        this._petAbandonId = null;
        this._isVehiclesPage = false;
        this._rightClickStartedOnMenu = false;

        // Painting of the windows built in here is suspended for the whole of
        // create() and settled up once it returns, see the deferral above.
        _Scene_Menu_create.call(this);

        // Hide ALL default game canvas windows to clean the screen
        if (this._commandWindow) this._commandWindow.visible = false;
        if (this._statusWindow) this._statusWindow.visible = false;
        if (this._goldWindow) this._goldWindow.visible = false;
        if (this._hungerSleepStatusWindow) this._hungerSleepStatusWindow.visible = false;
        if (this._timeTemperatureWindow) this._timeTemperatureWindow.visible = false;
        if (this._bountyWindow) this._bountyWindow.visible = false;
        if (this._menuRightColumnWindow) this._menuRightColumnWindow.visible = false;
        if (this._cancelButton) this._cancelButton.visible = false;

        // Check if our persistent menu DOM container already exists in the body
        const existing = document.getElementById('menu-container');
        if (existing) {
            this._dndContainer = existing;

            // Cancel any pending backdrop dissolve scheduled by the outgoing transition
            // so the menu doesn't fade away just as we return to it.
            if (existing._dndHideTimer) {
                clearTimeout(existing._dndHideTimer);
                existing._dndHideTimer = null;
            }
            existing._dndHideToken = (existing._dndHideToken || 0) + 1;
            // Out of backdrop duty: the CSS stacking order (1000) and the
            // layout are both the stylesheet's again.
            // "menu-fading-out" and the missing "menu-shown" are the outgoing
            // dissolve's leftovers: it sets opacity 0 and pointer-events none,
            // and its rule sits after "menu-snapped-in" in the sheet, so leaving
            // it on hands back an invisible, unclickable menu that only ESC exits.
            existing.classList.remove("menu-backdrop", "menu-dissolved", "menu-fading-out");
            existing.classList.add("menu-shown");

            UIMenuInputManager.init(this._dndContainer);
            this.addMenuEventListeners(); // Ensure context menu right-click listener is bound

            // Preferences is the one submenu that cannot change a single thing
            // the spread prints: it edits settings, and everything it does to
            // the look of the menu (theme, UI and font scale) is a CSS custom
            // property the standing DOM picks up on its own. Rebuilding both
            // pages for it only throws the drawn parchment away and paints the
            // portraits again, which is the redraw you see on the way back, so
            // the pages are left exactly as they were and only the navigator is
            // bound again.
            if (SceneManager.isPreviousScene(Scene_Options) &&
                this._dndContainer.querySelector(".book-spread")) {
                UIMenuInputManager.activate(4);
                if (window.MenuSearch) window.MenuSearch.afterRender(this);
            } else {
                this.refreshUIMenuDOM(false); // Draw instantly in background
            }



            // Temporarily disable entrance animation so it doesn't flicker/rustle
            const spread = this._dndContainer.querySelector(".book-spread");
            if (spread) spread.classList.add("menu-no-entrance");

            // Snap the parchment back in instantly (no fade). The content is already
            // drawn above, so it covers the outgoing window's scene change in one frame
            // instead of cross-fading through it.
            this._dndContainer.classList.add("menu-snapped-in");
        } else {
            // First open: create DOM container fresh
            this.createUIMenuDOM();
        }
    };

    // Re-read the focusable tiles after something has replaced part of a page
    // without going through a full refreshUIMenuDOM (the search page patches
    // just its results list as the player types, see CustomMainMenuSearch.js).
    // Without this the navigator would keep walking DOM nodes that are gone.
    Scene_Menu.prototype.rebindMenuFocus = function () {
        UIMenuInputManager.activate(4);
    };

    Scene_Menu.prototype.selectedActor = function () {
        const members = $gameParty.members();
        return members[this._selectedActorIndex] || members[0];
    };

    Scene_Menu.prototype.switchSelectedActor = function (index) {
        // Even re-picking the member already shown is a deliberate pick, so it
        // opens their own addiction bars in place of the party summary.
        if (index === this._selectedActorIndex && this._needsActorPinned) return;
        SoundManager.playCursor();
        this._needsActorPinned = true;
        this._selectedActorIndex = index;
        this.updateRightPageSelection();
    };

    // TAB / L1-R1 and a clicked bio card both land here: only the selection
    // highlight and the needs/addiction readings actually change, so this
    // patches those two things in place (letting the CSS transition already on
    // .party-bio-card animate it) instead of fading out and rebuilding the
    // whole right page for a value change.
    Scene_Menu.prototype.updateRightPageSelection = function () {
        const spread = this._dndContainer ? this._dndContainer.querySelector(".book-spread") : null;
        const rightPageContainer = spread ? spread.querySelector(".right-page") : null;
        const partyList = rightPageContainer ? rightPageContainer.querySelector(".party-bio-list") : null;

        // The travel codex and a live search own the right page instead of the
        // party sheet, so there is nothing here to patch: fall back to the
        // normal fade/rebuild.
        if (!partyList) {
            this.refreshUIMenuDOM(true);
            return;
        }

        partyList.querySelectorAll(".party-bio-card").forEach((el, idx) => {
            el.classList.toggle("selected", idx === this._selectedActorIndex);
        });
    };

    // The one way out of the menu, so the Back stamp in the header bar, the
    // cancel key and the pad's B button all leave by the same door: back one
    // level if a pocket page is open, out of the menu if none is.
    Scene_Menu.prototype.uiBackOut = function () {
        if (this.backOutOneLevel && this.backOutOneLevel()) return;
        SoundManager.playCancel();
        this.popScene();
    };

    // The roster cards only exist on the sheet that carries the needs panel, so
    // the party walk is offered exactly where it has something to move: not on
    // the travel codex, not while a search has taken the spread over, and not
    // for a party of one.
    Scene_Menu.prototype.canCycleSelectedActor = function () {
        if (window.MenuSearch && window.MenuSearch.isActive()) return false;
        return $gameParty.members().length > 1;
    };

    Scene_Menu.prototype.cycleSelectedActor = function (delta) {
        const members = $gameParty.members();
        if (members.length < 2) return;
        const count = members.length;
        const next = ((this._selectedActorIndex + delta) % count + count) % count;
        this.switchSelectedActor(next);
    };

    Scene_Menu.prototype.getMemberNeeds = function (mem) {
        // Shared needs vocabulary lives in TimeDateSystem.js (window.PartyNeeds),
        // so the menu and the travel HUD report identical values.
        if (window.PartyNeeds) return window.PartyNeeds.getMemberNeeds(mem);

        // Fallback if TimeDateSystem hasn't loaded: player keeps full needs at 100.
        const profile = window.NPCSocietyRegistry?.getProfile?.(mem.name());
        const isPlayer = mem.actorId() === 1;
        return {
            hunger:  isPlayer ? (mem.hungerPercent ? mem.hungerPercent() : 100) : Math.round(profile?.hunger  ?? 100),
            sleep:   isPlayer ? (mem.sleepPercent  ? mem.sleepPercent()  : 100) : Math.round(profile?.sleep   ?? 100),
            hygiene: isPlayer ? 100 : Math.round(profile?.hygiene ?? 100),
            social:  isPlayer ? 100 : Math.round(profile?.social  ?? 100),
            leisure: isPlayer ? 100 : Math.round(profile?.leisure ?? 100),
        };
    };

    Scene_Menu.prototype.showToolsPage = function () {
        SoundManager.playOk();
        this._isToolsPage = true;
        this.refreshUIMenuDOM(true); // Enable premium smooth transitions!
    };

    Scene_Menu.prototype.hideToolsPage = function () {
        SoundManager.playCancel();
        this._isToolsPage = false;
        this.refreshUIMenuDOM(true); // Enable premium smooth transitions!
    };

    Scene_Menu.prototype.addMenuEventListeners = function () {
        if (!this._dndContainer || this._dndContainer._hasContextMenuListener) return;

        this._rightClickStartedOnMenu = false;

        this._dndContainer.addEventListener('mousedown', (event) => {
            if (event.button === 2) { // Right click down
                this._rightClickStartedOnMenu = true;
            }
        });

        this._dndContainer.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation(); // Stop event propagation so standard TouchInput on document does not receive it

            if (!this._rightClickStartedOnMenu) {
                return; // Ignore right-clicks that started on the map and were only released here
            }
            this._rightClickStartedOnMenu = false;

            const scene = SceneManager._scene;
            if (scene && scene.isActive()) {
                if (!scene.backOutOneLevel || !scene.backOutOneLevel()) {
                    SoundManager.playCancel();
                    scene.popScene();
                }
            }
        });

        this._dndContainer._hasContextMenuListener = true;
    };

    Scene_Menu.prototype.createUIMenuDOM = function () {
        this._dndContainer = document.createElement('div');
        this._dndContainer.id = 'menu-container';
        // Transparent only while the fade below is pending: #menu-container is
        // shared with two dozen other screens and is visible by default.
        this._dndContainer.classList.add('menu-entering');
        document.body.appendChild(this._dndContainer);

        this.addMenuEventListeners(); // Ensure context menu right-click listener is bound

        UIMenuInputManager.init(this._dndContainer);
        this.refreshUIMenuDOM(false); // Initial load: draw instantly

        // Force reflow and trigger smooth fade-in
        setTimeout(() => {
            if (this._dndContainer) {
                this._dndContainer.classList.remove("menu-entering");
                this._dndContainer.classList.add("menu-shown");
            }
        }, 16);
    };

    Scene_Menu.prototype.fadeTransitionLeftPage = function (newHtml, newKey) {
        const spread = this._dndContainer ? this._dndContainer.querySelector(".book-spread") : null;
        if (!spread) return;
        const leftPageContainer = spread.querySelector(".left-page");
        if (!leftPageContainer) return;

        // The page turn is one class; how long it takes and how far the sheet
        // slides are decided in css/theme.css, not here.
        leftPageContainer.classList.add("page-turn", "page-turn--out");

        setTimeout(() => {
            this._dndLastLeftPageKey = newKey;
            leftPageContainer.innerHTML = newHtml;

            // Pets page renders its portraits on the left page.
            this.drawAllPetPortraits();
            // Dynamics roster renders its member portraits on the left page.
            this.drawAllRosterPortraits();
            // Vehicles page renders its sprites on the left page, and stands
            // the selected one on the turntable on the right.
            this.drawAllVehicleSprites();

            // Re-bind focusable commands in new list immediately so keyboard/gamepad navigation finds them
            UIMenuInputManager.activate(4);
            if (window.MenuSearch) window.MenuSearch.afterRender(this);

            leftPageContainer.classList.remove("page-turn--out");
        }, 120);
    };

    Scene_Menu.prototype.fadeTransitionRightPage = function (newHtml, actor) {
        const spread = this._dndContainer ? this._dndContainer.querySelector(".book-spread") : null;
        if (!spread) return;
        const rightPageContainer = spread.querySelector(".right-page");
        if (!rightPageContainer) return;

        rightPageContainer.classList.add("page-turn", "page-turn--out");

        setTimeout(() => {
            rightPageContainer.innerHTML = newHtml;

            // Render Canvases for portraits
            this.drawAllPartyPortraits();
            if (window.MenuSearch) window.MenuSearch.afterRender(this);

            rightPageContainer.classList.remove("page-turn--out");
        }, 120);
    };

    // Single back-out ladder shared by the ESC/Tab key, the gamepad cancel button
    // and the right-click handler, so a newly added pockets page can never be
    // wired into one path and forgotten in another. Returns true when a nested
    // page absorbed the cancel; false means "nothing nested left, close the menu".
    // Each hideXPage() plays its own cancel SE, so callers must not play one too.
    Scene_Menu.prototype.backOutOneLevel = function () {
        // A live search covers both pages, so it is the first thing a cancel
        // takes back (CustomMainMenuSearch.js).
        if (window.MenuSearch && window.MenuSearch.isActive()) {
            window.MenuSearch.clear(this);
            return true;
        }
        if (this._isToolsPage) {
            this.hideToolsPage();
        } else if (this._isDynamicsPage) {
            this.hideDynamicsPage();
        } else if (this._isDeedsPage) {
            this.hideDeedsPage();
        } else if (this._isPetsPage) {
            this.hidePetsPage();
        } else if (this._isVehiclesPage) {
            this.hideVehiclesPage();
        } else {
            return false;
        }
        return true;
    };

    Scene_Menu.prototype.showDynamicsPage = function () {
        SoundManager.playOk();
        this._isDynamicsPage = true;
        this._dynamicsDrag = null;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.hideDynamicsPage = function () {
        SoundManager.playCancel();
        this._dynamicsDrag = null;
        this._isDynamicsPage = false;
        this.refreshUIMenuDOM(true);
    };

    // The deeds: every town the party founded, who lives in it and what it
    // pays them. The register itself belongs to the world folder and is owned
    // by Crafting/FurnitureSystem.js (window.TownFounding); this page only
    // reads it and hands over the rent.
    Scene_Menu.prototype.showDeedsPage = function () {
        SoundManager.playOk();
        this._isDeedsPage = true;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.hideDeedsPage = function () {
        SoundManager.playCancel();
        this._isDeedsPage = false;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.collectDeedsRent = function () {
        const TF = window.TownFounding;
        if (!TF) return;
        const total = TF.collectRent();
        if (total > 0) {
            SoundManager.playShop();
            window.ParchmentToast?.show?.(T('Towns.deeds.collected', { amount: TF.formatMoney(total) }));
        } else {
            SoundManager.playBuzzer();
            window.ParchmentToast?.show?.(T('Towns.deeds.nothingDue'));
        }
        this.refreshUIMenuDOM(true);
    };

    // Every category of property the party can hold gets its own section, and
    // a section with nothing in it says so rather than vanishing: an empty
    // register still tells you what there is to own.
    Scene_Menu.prototype.deedsHouseRows = function () {
        const re = $gameSystem && $gameSystem.realEstateData;
        if (!re || !Array.isArray(re.properties) || !Array.isArray(re.ownedProperties)) return '';
        let rows = '';
        for (const pid of re.ownedProperties) {
            const prop = re.properties.find(p => p && p.id === pid);
            if (!prop) continue;
            const rent = (prop.currentOccupants || 0) * (prop.rentPerOccupant || 0);
            rows += `
                        <div class="deed-row">
                            <div class="deed-name">${escapeHtml(prop.name || '')}</div>
                            <div class="deed-where">${escapeHtml(prop.location || '')}</div>
                            <div class="deed-stat">${T('Towns.deeds.colType')}: ${escapeHtml(prop.type || '')}</div>
                            <div class="deed-stat">${T('Towns.deeds.colOccupancy')}: ${prop.currentOccupants || 0} / ${prop.maxOccupants || 0}</div>
                            <div class="deed-stat">${T('Towns.deeds.rentPerDay', { amount: '€' + rent.toLocaleString() })}</div>
                        </div>`;
        }
        return rows;
    };

    // Shops are the one deed that is also a place of work: a row here opens the
    // shop's management book (Economy/ShopManagementUI.js) on that shop rather
    // than on whichever one an event last made current.
    Scene_Menu.prototype.deedsShopRows = function () {
        const SM = window.ShopManagement;
        const shops = SM && SM.getShops ? SM.getShops() : null;
        if (!shops) return '';
        let rows = '';
        for (const id of Object.keys(shops)) {
            const shop = shops[id];
            if (!shop) continue;
            const where = SM.shopDisplayName ? SM.shopDisplayName(shop) : String(id);
            const place = shop.location ? `<div class="deed-where">${escapeHtml(shop.location)}</div>` : '';
            rows += `
                        <div class="deed-row command-item focusable" tabindex="0" onclick="SceneManager._scene?.openShopDeed?.('${escapeHtml(String(id))}')">
                            <div class="deed-name">${escapeHtml(where)}</div>
                            ${place}
                            <div class="deed-stat">${T('Towns.deeds.colCategory')}: ${escapeHtml(shop.category || '')}</div>
                            <div class="deed-stat">${T('Towns.deeds.colBalance')}: ${SM.formatEuroPrice ? SM.formatEuroPrice(shop.balance || 0) : (shop.balance || 0)}</div>
                            <div class="deed-note">${T('Towns.deeds.manageShop')}</div>
                        </div>`;
        }
        return rows;
    };

    Scene_Menu.prototype.openShopDeed = function (shopId) {
        const SM = window.ShopManagement;
        if (!SM || !SM.openManagement) { SoundManager.playBuzzer(); return; }
        if (SM.openManagement(shopId)) SoundManager.playOk();
        else SoundManager.playBuzzer();
    };

    Scene_Menu.prototype.deedsAnimalRows = function () {
        const AG = window.AnimalGrowthSystem;
        const owned = (AG && AG.listOwnedAnimals) ? (AG.listOwnedAnimals() || []) : [];
        let rows = '';
        for (const animal of owned) {
            const where = animal.mapName || (AG.mapDisplayName ? AG.mapDisplayName(animal.mapKey) : '');
            rows += `
                        <div class="deed-row">
                            <div class="deed-name">${escapeHtml(animal.animalId || '')}</div>
                            <div class="deed-where">${escapeHtml(where || '')}</div>
                            <div class="deed-stat">${T('Towns.deeds.colStage')}: ${escapeHtml(animal.stageName || animal.stage || '')}</div>
                        </div>`;
        }
        return rows;
    };

    Scene_Menu.prototype.generateUIDeedsPageHTML = function () {
        const TF = window.TownFounding;
        const towns = (TF && TF.list) ? TF.list() : [];
        let townRows = '';
        let due = 0;
        for (const town of towns) {
            const residents = TF.residents(town);
            const capacity = TF.capacity(town);
            due += TF.rentDue(town);
            const where = T('Towns.deeds.square', { x: town.worldX, y: town.worldY }) +
                (town.planet ? ' ' + T('Towns.deeds.onPlanet', { planet: town.planet }) : '');
            townRows += `
                        <div class="deed-row">
                            <div class="deed-name">${escapeHtml(town.name)}</div>
                            <div class="deed-where">${escapeHtml(where)}</div>
                            <div class="deed-stat">${T('Towns.deeds.colHouses')}: ${town.houses || 0}</div>
                            <div class="deed-stat">${T('Towns.deeds.colShops')}: ${town.shops || 0}</div>
                            <div class="deed-stat">${T('Towns.deeds.colResidents')}: ${residents} / ${capacity}</div>
                            <div class="deed-stat">${T('Towns.deeds.rentPerDay', { amount: TF.formatMoney(TF.rentPerDay(town)) })}</div>
                            <div class="deed-note">${residents >= capacity ? T('Towns.deeds.full') : T('Towns.deeds.growing')}</div>
                        </div>`;
        }
        const sections = [
            { title: T('Towns.deeds.sectionTowns'), rows: townRows, empty: T('Towns.deeds.empty') },
            { title: T('Towns.deeds.sectionHouses'), rows: this.deedsHouseRows(), empty: T('Towns.deeds.emptyHouses') },
            { title: T('Towns.deeds.sectionShops'), rows: this.deedsShopRows(), empty: T('Towns.deeds.emptyShops') },
            { title: T('Towns.deeds.sectionAnimals'), rows: this.deedsAnimalRows(), empty: T('Towns.deeds.emptyAnimals') }
        ];
        const board = sections.map(sec => `
                        <div class="dyn-section-title">${sec.title}</div>
                        ${sec.rows || `<div class="roster-empty">${sec.empty}</div>`}`).join('');
        const collect = towns.length
            ? `<div class="command-item focusable" onclick="SceneManager._scene?.collectDeedsRent?.()">
                            <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.deedsRent)}"></span>
                            <span>${T('Towns.deeds.collect')} · ${TF.formatMoney(due)}</span>
                        </div>`
            : '';
        return `
                <div class="tools-pockets">
                    <div class="page-header-bar">
                        <div class="back-button" onclick="SceneManager._scene?.hideDeedsPage?.()">${T('Towns.deeds.back')}</div>
                        <h2 class="tools-title">${T('Towns.deeds.title')}</h2>
                        ${collect}
                    </div>
                    <div class="deed-board">${board}</div>
                </div>`;
    };

    Scene_Menu.prototype.showPetsPage = function () {
        SoundManager.playOk();
        this._isPetsPage = true;
        this._petRenameId = null;
        this._petAbandonId = null;
        this._petTrainId = null;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.hidePetsPage = function () {
        SoundManager.playCancel();
        this._isPetsPage = false;
        // An open name field or a pending abandonment is dropped with the page,
        // so coming back never reopens it half-typed or one press from parting
        // with somebody.
        this._petRenameId = null;
        this._petAbandonId = null;
        this._petTrainId = null;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.showVehiclesPage = function () {
        SoundManager.playOk();
        this._isVehiclesPage = true;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.hideVehiclesPage = function () {
        SoundManager.playCancel();
        this._isVehiclesPage = false;
        this.refreshUIMenuDOM(true);
    };

    // Summon an owned vehicle: close the menu (back to the map) then teleport the
    // vehicle beside the player. Spawning needs Scene_Map, so it runs after popScene.
    Scene_Menu.prototype.spawnUIVehicle = function (key) {
        if (!window.MergedVehicleSystem) return;
        // Indoors (a house, a vehicle cabin, or a procedural interior such as a
        // dungeon, sewer or loot cellar) there is nowhere for most vehicles to
        // land, so the button is inert rather than closing the menu on a summon
        // that cannot happen. The bike answers true everywhere.
        if (window.MergedVehicleSystem.canSpawnHere &&
            !window.MergedVehicleSystem.canSpawnHere(key)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        this.popScene();
        setTimeout(() => {
            if (window.MergedVehicleSystem) window.MergedVehicleSystem.spawnVehicleByKey(key);
        }, 100);
    };

    // Open the repair / upgrade workshop for an owned vehicle (pushes its scene
    // on top of the menu; backing out returns here).
    Scene_Menu.prototype.repairUIVehicle = function (key) {
        if (!window.MergedVehicleSystem) return;
        SoundManager.playOk();
        window.MergedVehicleSystem.openRepairByKey(key);
    };

    // Sending away whatever the party called. Unlike abandoning an animal this
    // breaks no law: a summon was never anyone's to keep.
    Scene_Menu.prototype.dismissSummonUI = function () {
        if (!window.SummonSystem || !window.SummonSystem.dismissMapSummon) return;
        SoundManager.playCancel();
        window.SummonSystem.dismissMapSummon();
        this.refreshUIMenuDOM(false);
    };

    // Combat training. Picking a drill takes over the row's button strip the
    // same way renaming does, so there is no way to abandon or re-leash a
    // companion with the class chips open.
    Scene_Menu.prototype.startPetTraining = function (petId) {
        if (!window.PetSystem || !window.PetSystem.canTrain(petId)) return;
        SoundManager.playOk();
        this._petRenameId = null;
        this._petAbandonId = null;
        this._petTrainId = petId;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.cancelPetTraining = function () {
        if (this._petTrainId == null) return;
        SoundManager.playCancel();
        this._petTrainId = null;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.confirmPetTraining = function (classId) {
        const petId = this._petTrainId;
        if (petId == null || !window.PetSystem) return;
        if (!window.PetSystem.startTraining(petId, classId)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        this._petTrainId = null;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.stopPetTraining = function (petId) {
        if (!window.PetSystem) return;
        SoundManager.playCancel();
        window.PetSystem.stopTraining(petId);
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.promotePetTrainee = function (petId) {
        if (!window.PetSystem) return;
        if (!window.PetSystem.promoteTrainee(petId)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.setActivePet = function (petId) {
        if (!window.PetSystem) return;
        SoundManager.playOk();
        window.PetSystem.setActivePet(petId);
        this.refreshUIMenuDOM(false);
    };

    // Climbing onto a ridable companion. The mount is not a vehicle anyone can
    // summon: it is the animal already travelling with the party, so the menu
    // closes back onto the map and the party is put on its back there.
    Scene_Menu.prototype.ridePet = function (petId) {
        const vs = window.MergedVehicleSystem;
        if (!vs || !vs.mountPet || !window.PetSystem?.isRidable?.(petId)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        this.popScene();
        setTimeout(() => {
            if (window.MergedVehicleSystem) window.MergedVehicleSystem.mountPet(petId);
        }, 100);
    };

    // Getting off again, which can be done from where the menu stands: the
    // animal is left standing on the tile the party stopped at.
    Scene_Menu.prototype.dismountPet = function () {
        const vs = window.MergedVehicleSystem;
        if (!vs || !vs.dismount) return;
        SoundManager.playOk();
        vs.dismount();
        this.refreshUIMenuDOM(false);
    };

    // Abandoning a companion. A follower came along of its own accord and may
    // leave the same way, but a pet or a child left behind is a charge with a
    // bounty on it, so the row asks once and says what it will cost.
    Scene_Menu.prototype.petAbandonWarning = function (pet) {
        const charge = window.PetSystem?.abandonCrimeFor?.(pet.id);
        if (!charge) return T('MainMenu.pets.abandonFree', { name: escapeHtml(pet.name) });
        const fine = window.CrimeSystem
            ? window.CrimeSystem.goldToEuros(charge.bounty || 0)
            : String(charge.bounty || 0);
        return T('MainMenu.pets.abandonWarn', {
            name: escapeHtml(pet.name),
            crime: escapeHtml(charge.name || ''),
            fine: fine,
        });
    };

    Scene_Menu.prototype.startPetAbandon = function (petId) {
        if (!window.PetSystem || !window.PetSystem.getPet(petId)) return;
        SoundManager.playOk();
        this._petRenameId = null;
        this._petAbandonId = petId;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.cancelPetAbandon = function () {
        if (this._petAbandonId == null) return;
        SoundManager.playCancel();
        this._petAbandonId = null;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.confirmPetAbandon = function () {
        const petId = this._petAbandonId;
        if (petId == null || !window.PetSystem) return;
        SoundManager.playCancel();
        this._petAbandonId = null;
        window.PetSystem.abandonPet(petId);
        this.refreshUIMenuDOM(false);
    };

    // Renaming a pet: the row turns into a name field (see the Pets page), which
    // takes the keyboard for itself. Every key event is stopped at the field so
    // the menu's own navigator and the hotkey mapper never see the typing, which
    // is why Enter and Escape are answered here rather than by the menu.
    Scene_Menu.prototype.startPetRename = function (petId) {
        if (!window.PetSystem || !window.PetSystem.getPet(petId)) return;
        SoundManager.playOk();
        this._petAbandonId = null;
        this._petRenameId = petId;
        this.refreshUIMenuDOM(false);
        const field = document.getElementById('pet-rename-input');
        if (field) {
            field.focus();
            field.select();
        }
    };

    Scene_Menu.prototype.cancelPetRename = function () {
        if (this._petRenameId == null) return;
        SoundManager.playCancel();
        this._petRenameId = null;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.confirmPetRename = function () {
        const petId = this._petRenameId;
        if (petId == null || !window.PetSystem) return;
        const field = document.getElementById('pet-rename-input');
        const typed = field ? field.value : '';
        // An empty name is refused by renamePet, so the pet simply keeps the one
        // it has instead of turning into a blank row.
        if (!String(typed).trim()) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        window.PetSystem.renamePet(petId, typed);
        this._petRenameId = null;
        this.refreshUIMenuDOM(false);
    };

    Scene_Menu.prototype.onPetRenameKey = function (event) {
        if (!event) return;
        event.stopPropagation();
        if (event.key === 'Enter') {
            event.preventDefault();
            this.confirmPetRename();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.cancelPetRename();
        }
    };

    // Draws a pet record's overworld sprite (Down-facing frame) onto its canvas.
    Scene_Menu.prototype.drawPetPortrait = function (pet, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !pet || !pet.characterName) return;

        const bitmap = ImageManager.loadCharacter(pet.characterName);
        const drawPortrait = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.imageSmoothingEnabled = false;

            const isBig = ImageManager.isBigCharacter(pet.characterName);
            const pw = bitmap.width / (isBig ? 3 : 12);
            const ph = bitmap.height / (isBig ? 4 : 8);

            const charIndex = pet.characterIndex || 0;
            const sx = ((charIndex % 4) * 3 + 1) * pw;
            const sy = (Math.floor(charIndex / 4) * 4) * ph;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fit = Math.min(canvas.width / pw, canvas.height / ph);
            const dw = pw * fit;
            const dh = ph * fit;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, dx, dy, dw, dh);
        };

        if (bitmap.isReady()) drawPortrait();
        else bitmap.addLoadListener(drawPortrait);
    };

    Scene_Menu.prototype.drawAllPetPortraits = function () {
        // The canvases only exist on the Pets page, so anywhere else this was
        // one getElementById plus a character-sheet load per pet, child and
        // follower on every refresh, all of it landing on nothing.
        if (!this._isPetsPage) return;
        // A summon with no registry record of its own still has a row and a
        // canvas, and it is drawn from the same sprite fields a pet carries.
        const summon = window.SummonSystem?.mapSummonInfo?.() ?? null;
        if (summon && !summon.petId) this.drawPetPortrait(summon, 'summon-canvas');
        if (!window.PetSystem) return;
        // The companion being read on the right page wears the same portrait
        // its row does, on a canvas of its own.
        const read = window.PetSystem.getPet(this._petsSelected);
        if (read) this.drawPetPortrait(read, 'pet-sheet-canvas');
        window.PetSystem.getPets().forEach(pet => {
            this.drawPetPortrait(pet, `pet-canvas-${pet.id}`);
        });
    };

    // Draws a vehicle's overworld character sprite (Left-facing frame) onto its
    // Vehicles-menu canvas.
    Scene_Menu.prototype.drawVehicleSprite = function (info, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !info || !info.spriteName) return;

        const bitmap = ImageManager.loadCharacter(info.spriteName);
        const render = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx || !bitmap.width || !bitmap.height) return;
            ctx.imageSmoothingEnabled = false;

            const isBig = ImageManager.isBigCharacter(info.spriteName);
            const pw = bitmap.width / (isBig ? 3 : 12);
            const ph = bitmap.height / (isBig ? 4 : 8);
            const blockX = isBig ? 0 : (info.spriteIndex % 4) * 3;
            const blockY = isBig ? 0 : Math.floor(info.spriteIndex / 4) * 4;
            const sx = (blockX + 1) * pw; // middle (standing) pattern
            const sy = (blockY + 1) * ph; // row 1 = left-facing direction

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fit = Math.min(canvas.width / pw, canvas.height / ph);
            const dw = pw * fit;
            const dh = ph * fit;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, dx, dy, dw, dh);
        };

        if (bitmap.isReady()) render();
        else bitmap.addLoadListener(render);
    };

    Scene_Menu.prototype.drawAllVehicleSprites = function () {
        if (!this._isVehiclesPage || !window.MergedVehicleSystem || !window.MergedVehicleSystem.getOwnedVehicles) return;
        window.MergedVehicleSystem.getOwnedVehicles().forEach(v => {
            this.drawVehicleSprite(v, `vehicle-canvas-${v.key}`);
        });
    };

    // =========================================================================
    // Party Dynamics page: one screen, three lists.
    //   active   , who is travelling right now: leader, turn order, Empathize
    //   inactive , everyone this world has ever benched, waiting to be called
    //              back (a character-creation dossier apiece)
    //   past     , every member who no longer travels along, with the date they
    //              left and, when it applies, their date of death
    // A row is dragged from Active into Inactive and back to change the party
    // on the spot. The road is the only place that allows it: inside a
    // procedural structure (Dungeon, Crypt, LootCellar and the rest of the
    // catalogue) or anywhere in the Omega Tower the party is stuck with the
    // people it walked in with.
    // =========================================================================

    // Three travellers is the ceiling character creation builds to, so it is
    // the ceiling here as well.
    const DYNAMICS_MAX_ACTIVE = 3;

    // Every board action is called from an onclick in the parchment, which is a
    // DOM handler and not a frame of the game loop. RMMZ only guards the loop:
    // an error raised out here reaches window.onerror instead, which stops the
    // loop, calls AudioManager.stopAll and draws its error box ON THE CANVAS,
    // under this overlay. The player is left with a menu that no longer answers
    // anything, no music and no way out but Alt+F4, and no message saying what
    // happened. So a board action that fails says so and leaves the menu
    // working; the error itself goes to the console, and from there into
    // debug-log.txt (Debug/ForceConsole.js), where it can be read.
    const guardedBoardAction = (fn) => function (...args) {
        try {
            return fn.apply(this, args);
        } catch (e) {
            console.error("[Dynamics] roster action failed", e);
            SoundManager.playBuzzer();
            window.ParchmentToast?.show?.(T('MainMenu.dynamics.actionFailed'),
                { severity: 'warning', duration: 220 });
            // The party may have changed before the throw, so the board is
            // redrawn from what it actually holds now rather than left lying.
            try { this.refreshUIMenuDOM(false); } catch (e2) { /* beyond redrawing */ }
        }
    };

    // '' when the party may be rearranged, otherwise the i18n key under
    // MainMenu.dynamics that says why it may not.
    Scene_Menu.prototype.dynamicsSwapLocked = function () {
        if (window.DungeonFloors?.insideTower?.()) return 'lockedTower';
        if (window.ProceduralInteriors?.currentStructureBiome?.()) return 'lockedStructure';
        return '';
    };

    Scene_Menu.prototype.openDynamicsWiki = function () {
        if (!window.NPCEmpathize?.openWiki) return;
        SoundManager.playOk();
        window.NPCEmpathize.openWiki('party');
    };

    Scene_Menu.prototype.promoteUIPartyLeader = guardedBoardAction(function (actorId) {
        // Handing over the lead is the same act here as it is with Tab out on
        // the map (Core/AutoIdleExplorer.js): the two of them exchange tiles, so
        // the party is standing where it was once the menu closes again. That
        // path reorders through PartyRoster.setLeader itself; the plain call is
        // the fallback for when the map layer is not loaded.
        const lead = window.AutoIdleExplorer?.lead;
        const ok = lead?.switchTo
            ? lead.switchTo(actorId, { pan: false })
            : !!window.PartyRoster?.setLeader?.(actorId)?.ok;
        if (!ok) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playOk();
        // The leader is the menu's default actor, so keep the right page in sync.
        this._selectedActorIndex = 0;
        this.refreshUIMenuDOM(false);
    });

    // Turn order is the party's own marching order; the first nudge pins the
    // order the player is looking at, so nothing jumps about.
    Scene_Menu.prototype.moveUITurnOrder = guardedBoardAction(function (actorId, delta) {
        if (!window.BattleTurnOrder?.move?.(actorId, delta)) {
            SoundManager.playBuzzer();
            return;
        }
        SoundManager.playCursor();
        this.refreshUIMenuDOM(false);
    });

    // Benching a companion: they leave the party and wait on the Inactive list,
    // where the same page calls them back. Nothing about it is one-way any
    // more, so it asks no second time.
    Scene_Menu.prototype.retireUIMember = guardedBoardAction(function (actorId) {
        const actor = $gameActors.actor(actorId);
        const name = actor ? actor.name() : '';
        if (this.dynamicsSwapLocked()) {
            SoundManager.playBuzzer();
            window.ParchmentToast?.show?.(T('MainMenu.dynamics.' + this.dynamicsSwapLocked()),
                { severity: 'warning', duration: 200 });
            return;
        }
        const result = window.CharacterPresets?.retirePartyMember?.(actorId);

        if (!result || !result.ok) {
            SoundManager.playBuzzer();
            const reason = result ? result.reason : '';
            const message = reason === 'lastMember'
                ? T('MainMenu.dynamics.partyEmpty')
                : reason === 'isLeader'
                    ? T('MainMenu.dynamics.isLeader', { name })
                    : reason === 'storyLocked'
                        ? T('MainMenu.dynamics.storyLocked', { name })
                        : T('MainMenu.dynamics.cannotRetire', { name: name || T('MainMenu.roster.thatMember') });
            window.ParchmentToast?.show?.(message, { severity: 'warning', duration: 200 });
            this.refreshUIMenuDOM(false);
            return;
        }

        SoundManager.playOk();
        window.ParchmentToast?.show?.(
            T('MainMenu.dynamics.nowInactive', { name }),
            { severity: 'info', duration: 220 }
        );
        // The roster shrank, so the right-page selection may point past the end.
        this._selectedActorIndex = Math.min(this._selectedActorIndex, $gameParty.members().length - 1);
        this.refreshUIMenuDOM(false);
    });

    // Calls an inactive member back into a free party slot. The bench is
    // world-scoped (world.json "retiredCharacters"), so it holds everyone every
    // savegame of this world has ever benched, and taking one clears them from
    // the bench for all of them.
    Scene_Menu.prototype.reactivateUIMember = guardedBoardAction(function (presetId) {
        if (this.dynamicsSwapLocked()) {
            SoundManager.playBuzzer();
            window.ParchmentToast?.show?.(T('MainMenu.dynamics.' + this.dynamicsSwapLocked()),
                { severity: 'warning', duration: 200 });
            return;
        }
        const result = window.CharacterPresets?.unretirePartyMember?.(presetId);

        if (!result || !result.ok) {
            SoundManager.playBuzzer();
            const message = (result && result.reason === 'partyFull')
                ? T('MainMenu.dynamics.inactiveFull')
                : T('MainMenu.dynamics.cannotRejoin', { name: T('MainMenu.roster.thatMember') });
            window.ParchmentToast?.show?.(message, { severity: 'warning', duration: 200 });
            this.refreshUIMenuDOM(false);
            return;
        }

        SoundManager.playOk();
        window.ParchmentToast?.show?.(
            T('MainMenu.dynamics.rejoined', { name: result.preset.name }),
            { severity: 'info', duration: 220 }
        );
        this.refreshUIMenuDOM(false);
    });

    // The board itself: one page, three lists. Active at the top (who is on the
    // road right now), Inactive under it (everyone this world has ever benched)
    // and the former members at the foot, read only. A member is moved between
    // the first two lists by dragging their row into the other one, or with the
    // button on the row for anyone playing with a pad or the keyboard.
    Scene_Menu.prototype.generateUIDynamicsPageHTML = function () {
        const members = $gameParty.members();
        const bench   = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
        const locked  = this.dynamicsSwapLocked();
        const canBench  = !locked && members.length > 1;
        const hasRoom   = !locked && members.length < DYNAMICS_MAX_ACTIVE;
        const wikiEnabled = !!window.NPCEmpathize?.openWiki;
        const order = window.BattleTurnOrder?.members?.() ?? [];
        const dexLabel = escapeHtml(TextManager.param(6));

        const drag = (kind, id, movable) => movable
            ? ` draggable="true" ondragstart="SceneManager._scene?.onDynamicsDragStart?.(event, '${kind}', ${id})" ondragend="SceneManager._scene?.onDynamicsDragEnd?.()"`
            : '';
        const zone = (kind) => ` ondragover="SceneManager._scene?.onDynamicsDragOver?.(event)" ondrop="SceneManager._scene?.onDynamicsDrop?.(event, '${kind}')"`;

        // ---- Active -------------------------------------------------------
        let activeRows = '';
        members.forEach((mem, idx) => {
            const actorId  = mem.actorId();
            const isLeader = (idx === 0);
            const turnIdx  = order.findIndex(m => m.actorId() === actorId);
            const first    = turnIdx === 0;
            const last     = turnIdx === order.length - 1;
            const step = (delta, label, disabled) => (disabled || turnIdx < 0
                ? `<div class="command-item roster-action--fixed is-disabled">${label}</div>`
                : `<div class="command-item focusable roster-action--fixed" onclick="SceneManager._scene?.moveUITurnOrder?.(${actorId}, ${delta})">${label}</div>`);

            // Story mode keeps the party in one pair of hands, so the offer to
            // hand it over is not made (PartyRoster.canSwitchLeader).
            const canLead = window.PartyRoster?.canSwitchLeader?.() !== false;
            const leaderBtn = isLeader
                ? `<div class="command-item roster-action is-disabled">${T('MainMenu.roster.leader')}</div>`
                : !canLead
                    ? `<div class="command-item roster-action is-disabled">${T('MainMenu.roster.makeLeader')}</div>`
                    : `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.promoteUIPartyLeader?.(${actorId})">${T('MainMenu.roster.makeLeader')}</div>`;
            // The leader stays: hand the party over first, then bench them. In
            // the story mode neither Em nor Bubba leaves the party at all.
            const storyLocked = window.PartyRoster?.isStoryLocked?.(actorId) === true;
            const benchBtn = (canBench && !isLeader && !storyLocked)
                ? `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.retireUIMember?.(${actorId})">${T('MainMenu.roster.setInactive')}</div>`
                : `<div class="command-item roster-action is-disabled">${T('MainMenu.roster.setInactive')}</div>`;

            activeRows += `
                        <div class="npc-dynamics-member dyn-row roster-row"${drag('active', actorId, canBench && !isLeader && !storyLocked)}>
                            <div class="dyn-order">${turnIdx >= 0 ? turnIdx + 1 : '-'}</div>
                            <div class="portrait-frame">
                                <canvas id="roster-canvas-${actorId}" width="48" height="48"></canvas>
                            </div>
                            <div class="roster-action">
                                <div class="roster-name">
                                    ${escapeHtml(mem.name())}
                                    <span class="roster-sub">${escapeHtml(mem.currentClass() ? mem.currentClass().name : '')} ${T('MainMenu.roster.levelAbbr')}${mem.level} · ${dexLabel} ${mem.agi}${isLeader ? ' · ' + T('MainMenu.roster.leader') : ''}</span>
                                </div>
                                <div class="roster-actions">
                                    ${leaderBtn}
                                    ${benchBtn}
                                    <div class="command-item focusable roster-action" onclick="window.NPCEmpathize?.openForActor(${actorId})">${T('MainMenu.roster.empathize')}</div>
                                    ${step(-1, T('MainMenu.dynamics.moveUp'), first)}
                                    ${step(1, T('MainMenu.dynamics.moveDown'), last)}
                                </div>
                            </div>
                        </div>`;
        });
        if (!activeRows) activeRows = `<div class="roster-empty">${T('MainMenu.dynamics.noMembers')}</div>`;

        // ---- Busy ---------------------------------------------------------
        // Whoever is away on a work contract (Work/WorkSystem.js): out of the
        // party for the hours the shift runs, not benched and not gone. The
        // rows are read only, since the only thing that ends a shift is the
        // clock reaching the end of it.
        let busyRows = '';
        (window.WorkSystem?.Shifts?.list?.() ?? []).forEach(entry => {
            const actor = $gameActors.actor(entry.actorId);
            if (!actor) return;
            const left = window.WorkSystem.Shifts.remaining(entry);
            const hours = Math.floor(left / 60);
            const mins  = Math.round(left % 60);
            const className = $dataClasses[actor._classId] ? $dataClasses[actor._classId].name : '';
            busyRows += `
                        <div class="npc-dynamics-member dyn-row roster-row">
                            <div class="portrait-frame">
                                <canvas id="busy-canvas-${entry.actorId}" width="48" height="48"></canvas>
                            </div>
                            <div class="roster-action">
                                <div class="roster-name">
                                    ${escapeHtml(actor.name())}
                                    <span class="roster-sub">${escapeHtml(className)} ${T('MainMenu.roster.levelAbbr')}${actor.level}</span>
                                </div>
                                <div class="roster-since">${T('MainMenu.dynamics.busyAt', {
                                    job: escapeHtml(window.WorkSystem.jobName(entry.job)),
                                    time: T('MainMenu.dynamics.busyRemaining', { hours: hours, minutes: mins })
                                })}</div>
                            </div>
                        </div>`;
        });
        const busySection = busyRows
            ? `<h3 class="dyn-section-title">${T('MainMenu.dynamics.busyTitle')}</h3>
                        <div class="dyn-slot">
                            ${busyRows}
                        </div>`
            : '';

        // ---- Inactive -----------------------------------------------------
        let benchRows = '';
        bench.forEach(preset => {
            const className = preset.retiredClassName
                || ($dataClasses[preset.classId] ? $dataClasses[preset.classId].name : '');
            const since = preset.retiredDate
                ? T('MainMenu.dynamics.inactiveSince', { date: escapeHtml(preset.retiredDate) })
                : '';
            const recallBtn = hasRoom
                ? `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.reactivateUIMember?.(${preset.id})">${T('MainMenu.roster.setActive')}</div>`
                : `<div class="command-item roster-action is-disabled">${T('MainMenu.roster.setActive')}</div>`;

            benchRows += `
                        <div class="npc-dynamics-member dyn-row roster-row"${drag('bench', preset.id, hasRoom)}>
                            <div class="portrait-frame">
                                <canvas id="bench-canvas-${preset.id}" width="48" height="48"></canvas>
                            </div>
                            <div class="roster-action">
                                <div class="roster-name">
                                    ${escapeHtml(preset.name)}
                                    <span class="roster-sub">${escapeHtml(className)} ${T('MainMenu.roster.levelAbbr')}${preset.level || 1}</span>
                                </div>
                                <div class="roster-since">${since}</div>
                                <div class="roster-actions">${recallBtn}</div>
                            </div>
                        </div>`;
        });
        // An empty bench is the normal state of a world, so the section is not
        // drawn at all rather than printing a line saying it is empty.
        // It stays up while somebody can still be dragged onto it.
        const benchSection = (benchRows || canBench)
            ? `<h3 class="dyn-section-title">${T('MainMenu.dynamics.inactiveTitle')}</h3>
                        <div class="dyn-slot" id="dyn-zone-bench"${zone('bench')}>
                            ${benchRows}
                        </div>`
            : '';

        // ---- Former members ------------------------------------------------
        const STATUS_LABELS = {
            active:  { label: T('MainMenu.roster.travelling'), band: "roster--active" },
            retired: { label: T('MainMenu.roster.inactive'),   band: "roster--retired" },
            left:    { label: T('MainMenu.roster.departed'),   band: "roster--left" },
            died:    { label: T('MainMenu.roster.dead'),       band: "roster--died" },
        };
        // Only the people who are no longer travelling: the two lists above
        // already say everything about the ones who are.
        const entries = (window.PartyRoster?.history?.() ?? []).filter(e => e.status !== 'active');
        let pastRows = '';
        entries.forEach(entry => {
            const status = STATUS_LABELS[entry.status] || STATUS_LABELS.left;
            const dates = [];
            if (entry.joinedDate) dates.push(T('MainMenu.roster.joined', { date: escapeHtml(entry.joinedDate) }));
            if (entry.status === 'died' && entry.deathDate) dates.push(T('MainMenu.roster.died', { date: escapeHtml(entry.deathDate) }));
            else if (entry.status === 'retired' && entry.leftDate) dates.push(T('MainMenu.roster.retired', { date: escapeHtml(entry.leftDate) }));
            else if (entry.status === 'left' && entry.leftDate) dates.push(T('MainMenu.roster.left', { date: escapeHtml(entry.leftDate) }));
            const dateLine = dates.length ? dates.join(' · ') : T('MainMenu.roster.dateUnrecorded');

            pastRows += `
                        <div class="npc-dynamics-member roster-past-row">
                            <div class="roster-past-name">
                                ${escapeHtml(entry.name)}${entry.status === 'died' ? ' <span class="roster-past-died">✝</span>' : ''}
                                <span class="roster-past-status ${status.band}">${status.label}</span>
                            </div>
                            <div class="roster-past-detail">
                                ${escapeHtml(entry.className || '')}${entry.className ? ' · ' : ''}${T('MainMenu.roster.levelAbbr')}${entry.level}${entry.isLeader ? T('MainMenu.roster.partyLeader') : ''}
                            </div>
                            <div class="roster-past-date">${dateLine}</div>
                        </div>`;
        });
        if (!pastRows) pastRows = `<div class="roster-empty">${T('MainMenu.roster.noRecords')}</div>`;

        // Only the reason the board is frozen is worth printing. How to drag a
        // row is a control hint, and the game prints none of those.
        const note = locked
            ? `<div class="dyn-lock">${T('MainMenu.dynamics.' + locked)}</div>`
            : '';

        const wikiBtn = wikiEnabled
            ? `<div class="command-item focusable dyn-wiki" onclick="SceneManager._scene?.openDynamicsWiki?.()">
                            <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.dynamicsWiki)}"></span>
                            <span>${T('MainMenu.dynamics.wiki')}</span>
                        </div>`
            : '';

        return `
                <div class="tools-pockets">
                    <div class="page-header-bar">
                        <div class="back-button" onclick="SceneManager._scene?.hideDynamicsPage?.()">${T('MainMenu.dynamics.back')}</div>
                        <h2 class="tools-title">${T('MainMenu.dynamics.title')}</h2>
                        ${wikiBtn}
                    </div>
                    ${note}
                    <div class="dyn-board">
                        <h3 class="dyn-section-title">${T('MainMenu.dynamics.activeTitle', { count: members.length, max: DYNAMICS_MAX_ACTIVE })}</h3>
                        <div class="dyn-slot" id="dyn-zone-active"${zone('active')}>
                            ${activeRows}
                        </div>
                        ${busySection}
                        ${benchSection}
                        <h3 class="dyn-section-title">${T('MainMenu.dynamics.pastTitle')}</h3>
                        <div class="dyn-past">
                            ${pastRows}
                        </div>
                    </div>
                </div>`;
    };

    // ---- Dragging a member between the two lists ---------------------------
    // The drop does exactly what the row's own button does, so the two ways in
    // never drift apart: everything below funnels into retireUIMember and
    // reactivateUIMember.
    Scene_Menu.prototype.onDynamicsDragStart = function (event, kind, id) {
        this._dynamicsDrag = { kind, id };
        try { event.dataTransfer.setData('text/plain', kind + ':' + id); } catch (e) {}
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    };

    Scene_Menu.prototype.onDynamicsDragEnd = function () {
        this._dynamicsDrag = null;
        document.querySelectorAll('.dyn-slot').forEach(el => el.classList.remove('dyn-slot--over'));
    };

    Scene_Menu.prototype.onDynamicsDragOver = function (event) {
        if (!this._dynamicsDrag) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        const zone = event.currentTarget;
        if (zone && zone.classList) zone.classList.add('dyn-slot--over');
    };

    Scene_Menu.prototype.onDynamicsDrop = guardedBoardAction(function (event, target) {
        event.preventDefault();
        const drag = this._dynamicsDrag;
        this.onDynamicsDragEnd();
        if (!drag) return;
        // Dropped back where it came from: nothing to do, and no buzzer for it.
        if (drag.kind === target) return;
        if (target === 'bench') this.retireUIMember(drag.id);
        else this.reactivateUIMember(drag.id);
    });

    // The World Map pocket has no page of its own: it opens the zoomable map
    // straight away. The rows that page used to carry live in the pockets (the
    // return, the layer shifts and the atlas) or in the options (the minimap).
    Scene_Menu.prototype.showWorldMapPage = function () {
        this.triggerUITravel("open");
    };

    Scene_Menu.prototype.triggerUITravel = function (action) {
        SoundManager.playOk();
        if (action === "return") {
            if (typeof this.commandWorldMap === "function") {
                this.commandWorldMap();
            } else {
                console.warn("commandWorldMap is not defined on Scene_Menu!");
            }
        } else if (action === "goUp") {
            if (typeof this.commandGoUp === "function") {
                this.commandGoUp();
            } else {
                console.warn("commandGoUp is not defined on Scene_Menu!");
            }
        } else if (action === "goDown") {
            if (typeof this.commandGoDown === "function") {
                this.commandGoDown();
            } else {
                console.warn("commandGoDown is not defined on Scene_Menu!");
            }
        } else if (action === "open") {
            if (typeof this.commandOpenWorldMap === "function") {
                this.commandOpenWorldMap();
            } else {
                console.warn("commandOpenWorldMap is not defined on Scene_Menu!");
            }
        } else if (action === "atlas") {
            // The atlas is a scene of its own: it opens over the menu and the
            // menu is still there when it closes, so nothing is popped here.
            if (window.WorldAtlas) {
                window.WorldAtlas.open();
            } else {
                console.warn("WorldAtlas is not loaded!");
            }
        } else if (action === "stop") {
            if (typeof this.commandStop === "function") {
                this.commandStop();
            } else {
                console.warn("commandStop is not defined on Scene_Menu!");
            }
        }
    };

    // "Return to Ship" (alien planet surface only): board the Starship interior
    // via VehicleSystem, then close the menu so the reserved transfer runs.
    Scene_Menu.prototype.commandReturnToShip = function () {
        if (window.MergedVehicleSystem &&
            typeof window.MergedVehicleSystem.enterAirshipInterior === "function") {
            AudioManager.playSe({ name: "Teleport", pan: 0, pitch: 100, volume: 90 });
            // Skip the interior command's own SE so the teleport isn't doubled.
            window.MergedVehicleSystem.enterAirshipInterior({ silent: true });
            SceneManager.pop();
        } else {
            SoundManager.playBuzzer();
            console.warn("commandReturnToShip: MergedVehicleSystem unavailable.");
        }
    };

    // Vehicles page: "Teleport to Ship" on the Starship row boards its interior.
    Scene_Menu.prototype.teleportToShipUI = function () {
        if (window.MergedVehicleSystem &&
            typeof window.MergedVehicleSystem.enterAirshipInterior === "function") {
            AudioManager.playSe({ name: "Teleport", pan: 0, pitch: 100, volume: 90 });
            window.MergedVehicleSystem.enterAirshipInterior({ silent: true });
            SceneManager.pop();
        } else {
            SoundManager.playBuzzer();
        }
    };

    // The left page's identity: which page is showing, plus everything about
    // that page's own state that changes what it says. It is worked out before
    // the page itself is built so an unchanged page can be left alone instead of
    // rendered into a string that is then thrown away: clicking a party card
    // redraws only the right page, but used to rebuild all ~45 pockets tiles
    // (and every T() lookup behind them) to compare a key and discard the result.
    Scene_Menu.prototype.uiLeftPageKey = function () {
        // Every edit on the Dynamics board (a promotion, somebody benched,
        // somebody called back off the bench) changes the page without changing
        // which page it is, so all of it is folded into the key.
        const dynamicsKey = this._isDynamicsPage
            ? [
                $gameParty.members().map(mem => mem.actorId()).join('-'),
                (window.CharacterPresets?.getAvailableRetiredPresets?.() ?? []).map(p => p.id).join('-'),
                // Reordering the turn order leaves the party itself untouched,
                // so the pinned order has to be part of the key of its own.
                (window.BattleTurnOrder?.pinned?.() ?? []).join('-')
            ].join(':')
            : '';
        // Abandoning a pet, handing the leash to another one, renaming one or
        // opening the name field or the abandonment warning changes the page
        // without changing which page it is, so all of it is part of the key.
        const petsKey = this._isPetsPage
            ? [
                (window.PetSystem?.getPets?.() ?? []).map(p => `${p.id}.${p.name}`).join('-'),
                window.PetSystem?.getActivePet?.()?.id ?? 0,
                // Getting on or off a companion swaps its buttons over.
                window.MergedVehicleSystem?.getMountedPet?.()?.id ?? 0,
                this._petRenameId || 0,
                this._petAbandonId || 0,
                this._petTrainId || 0,
                // Which companion the right page is reading.
                this._petsSelected || 0,
                // A drill advancing, finishing or being called off changes the
                // row without changing anything else on the page.
                (window.PetSystem?.getPets?.() ?? [])
                    .map(p => `${p.id}.${p.training ? p.training.done + '/' + (p.training.ready ? 1 : 0) : ''}`).join('-'),
                // Calling something, or sending it away, adds or removes a row.
                window.SummonSystem?.mapSummonInfo?.()?.name ?? ''
            ].join(':')
            : '';
        // A search takes over the left page, and every change to the query, the
        // filters or the selected row redraws it, so the whole search state is
        // part of the key.
        const searchKey = window.MenuSearch ? window.MenuSearch.stateKey() : '';
        return `${this._isToolsPage}_${this._isDynamicsPage}${dynamicsKey}_${this._isDeedsPage}_${this._isPetsPage}${petsKey}_${this._isVehiclesPage}_${searchKey}`;
    };

    // Uniform needs palette: gold when healthy, orange when low, red when
    // critical. Every needs bar shares this so the page reads as one scale
    // instead of one arbitrary hue per need. Addictions read the other way
    // round: the bar fills with the craving, so a full one is somebody in
    // withdrawal, not somebody content.

    // The needs/addiction cards for the selected member, as a stable-keyed
    // list. Shared by the full render (generateUIRightPageHTML) and the TAB
    // in-place update (updateRightPageSelection) below, so the two never
    // drift apart from each other.
    // Every need (and every craving) of ONE member. The right page prints this
    // under each roster card, so the panel is per person and there is no
    // combined party summary to keep in step with it.
    Scene_Menu.prototype.getUINeedsCardDefs = function (mem) {
        const needs = this.getMemberNeeds(mem) || {};
        const raw = [
            { key: 'hunger',  label: emLabel("needHunger",  T('MainMenu.need.hunger')),  val: needs.hunger ?? 100 },
            { key: 'sleep',   label: emLabel("needSleep",   T('MainMenu.need.sleep')),   val: needs.sleep ?? 100 },
            { key: 'hygiene', label: emLabel("needHygiene", T('MainMenu.need.hygiene')), val: needs.hygiene },
            { key: 'social',  label: emLabel("needSocial",  T('MainMenu.need.social')),  val: needs.social },
            { key: 'leisure', label: emLabel("needLeisure", T('MainMenu.need.fun')),     val: needs.leisure }
        ];
        const defs = raw
            .filter(n => n.val !== null && n.val !== undefined)
            // Hunger reads past full: over 100% the card keeps printing the
            // real number and turns amber, red at the overeating line
            // (window.NeedGauge.hungerBand). Every other meter stops at 100.
            .map(n => ({
                key: n.key,
                label: n.label,
                val: Math.round(n.val),
                band: n.key === 'hunger'
                    ? window.NeedGauge.hungerBand(n.val)
                    : window.NeedGauge.band(n.val),
            }));

        // Cravings read the other way round: the bar fills with the want, so a
        // full one is somebody in withdrawal.
        const addictions = window.AddictionSystem;
        if (addictions) {
            addictions.cravingsFor(mem).forEach(c => {
                const val = Math.round(c.value);
                defs.push({ key: `addiction-${c.key}`, label: escapeHtml(c.label), val, band: window.NeedGauge.cravingBand(val) });
            });
        }
        return defs;
    };

    Scene_Menu.prototype.renderUINeedsCardHTML = function (def) {
        // Every need of a member on one card: the label and its percentage on
        // the top line, the meter under them. The number and the bar fill share
        // the band class, so the reading is the same colour whichever of the two
        // the eye lands on first.
        return `<span class="survival-card" data-need="${def.key}">`
            + `<span class="survival-head"><span class="survival-lbl">${def.label}</span>`
            + `<span class="survival-val gauge-ink ${def.band}">${def.val}%</span></span>`
            + `<span class="survival-track"><span class="survival-fill gauge-fill ${def.band}" style="--ui-bar-w:${Math.max(0, Math.min(100, def.val))}%"></span></span>`
            + `</span>`;
    };

    // The garage: whichever vehicle is selected on the left page, read the way
    // the save screen reads a party - the square of the world map it is standing
    // in, with a pin on its tile - rather than as a 3D turntable. Where a
    // vehicle is matters more than what it looks like, and the picture of the
    // place answers it at a glance. The verbs of the fleet (summon it, take it
    // in for repairs, beam aboard) are the action strip at the foot of the card.
    Scene_Menu.prototype.canSpawnUIVehicle = function (key) {
        return !window.MergedVehicleSystem?.canSpawnHere ||
            window.MergedVehicleSystem.canSpawnHere(key);
    };

    // The world is 256 tiles square, read as eight sectors of 32 by the same
    // arithmetic the save screen uses, so both screens name a place alike.
    Scene_Menu.prototype.vehicleMapSquareHTML = function (v) {
        const wx = Number(v.parkedWorldX) || 0;
        const wy = Number(v.parkedWorldY) || 0;
        if (!v.parkedAt || (!wx && !wy)) return '';
        const col = Math.max(1, Math.min(8, Math.floor(wx / 32) + 1));
        const row = Math.max(1, Math.min(8, Math.floor(wy / 32) + 1));
        const pinX = (((wx % 32) + 0.5) / 32) * 100;
        const pinY = (((wy % 32) + 0.5) / 32) * 100;
        return `
            <div class="save-map-section">
                <div class="save-map-meta-bar">
                    <div class="save-map-meta-item">
                        <span class="detail-label">${T('MainMenu.label.worldCoordinates')}</span>
                        <span class="save-coords-badge">X: ${wx} | Y: ${wy}</span>
                    </div>
                    <div class="save-map-meta-item">
                        <span class="detail-label">${T('MainMenu.label.sector')}</span>
                        <span class="save-sector-badge">${T('MainMenu.vehicles.sectorValue', { row, col })}</span>
                    </div>
                </div>
                <div class="save-map-segment-frame">
                    <img class="save-map-segment-img" src="img/worldmap/row-${row}-column-${col}.jpg"
                         onerror="this.onerror=null; this.src='img/worldmap/row-6-column-3.jpg';" />
                    <div class="save-map-pin" style="--ui-at-x:${pinX.toFixed(1)}%; --ui-at-y:${pinY.toFixed(1)}%">
                        <div class="save-pin-dot"></div>
                        <div class="save-pin-label">${escapeHtml(v.name)}</div>
                    </div>
                </div>
            </div>`;
    };

    // The five attributes a companion carries, drawn as a grid of cells rather
    // than a run of dotted text: the same numbers, read down a column instead
    // of along a line. Shared by the list row and the right-page sheet.
    Scene_Menu.prototype.petStatGridHTML = function (pet) {
        if (!pet) return '';
        const attrs = pet.attrs || { STR: 10, CON: 10, INT: 10, WIS: 10, PSI: 10 };
        const SL = window.CCStatLabel || ((k) => k);
        const cells = ['STR', 'CON', 'INT', 'WIS', 'PSI'].map(key => `
                <div class="pet-stat-cell">
                    <span class="pet-stat-key">${escapeHtml(SL(key))}</span>
                    <span class="pet-stat-val">${attrs[key] ?? 10}</span>
                </div>`).join('');
        return `<div class="pet-stat-grid">${cells}</div>`;
    };

    // Clicking a row on the Followers page reads that companion onto the right
    // page, the way clicking a party card switches the sheet everywhere else.
    Scene_Menu.prototype.selectPetRow = function (petId) {
        if (this._petsSelected === petId) return;
        this._petsSelected = petId;
        this.refreshUIMenuDOM(true);
    };

    // The right page of the Followers spread: everything about the one
    // companion being read, which the list row has no width for. The left page
    // keeps the verbs; this side is the sheet.
    Scene_Menu.prototype.generateUIPetSheetHTML = function () {
        const pets = window.PetSystem ? window.PetSystem.getPets() : [];
        if (!pets.length) {
            return `<div class="ui-empty"><span class="ui-empty-text">${T('MainMenu.pets.none')}</span></div>`;
        }
        const sel = pets.find(p => p.id === this._petsSelected) || pets[0];
        this._petsSelected = sel.id;

        const className = (id) => {
            const data = $dataClasses && $dataClasses[id];
            if (!data) return '';
            return window.CCDbName ? window.CCDbName(data) : data.name;
        };
        const activeId = window.PetSystem?.getActivePet?.()?.id ?? null;
        const typeLabel = sel.isChild
            ? T('MainMenu.roster.child')
            : (sel.isFollower ? T('MainMenu.roster.follower') : T('MainMenu.roster.pet'));

        const facts = [
            [T('MainMenu.pets.sheetKind'), typeLabel],
            [T('MainMenu.pets.sheetLevel'), String(sel.level || 1)],
            [T('MainMenu.pets.sheetLeash'),
                sel.id === activeId ? T('MainMenu.roster.following') : T('MainMenu.pets.sheetWaiting')],
        ];
        if (sel.enemyName) facts.push([T('MainMenu.pets.sheetOrigin'), sel.enemyName]);
        if (sel.isChild && sel.parentName) facts.push([T('MainMenu.pets.sheetParent'), sel.parentName]);
        if (sel.bornOn) facts.push([T('MainMenu.pets.sheetBorn'), sel.bornOn]);
        const drill = window.PetSystem?.trainingInfo?.(sel.id) ?? null;
        if (drill) {
            const percent = drill.ready ? 100
                : Math.floor(100 * (drill.done || 0) / Math.max(1, drill.need));
            facts.push([T('MainMenu.pets.sheetTraining'),
                `${className(drill.classId)} ${percent}%`]);
        }
        const factRows = facts.map(([label, value]) => `
                <div class="pet-sheet-row">
                    <span class="pet-sheet-label">${label}</span>
                    <span class="pet-sheet-value">${escapeHtml(String(value))}</span>
                </div>`).join('');

        const traits = [
            sel.sentient ? T('MainMenu.pets.traitSentient') : null,
            sel.magical ? T('MainMenu.pets.traitMagical') : null,
            sel.geneticFreak ? T('MainMenu.pets.traitGeneticFreak') : null,
        ].filter(Boolean);
        const traitPanel = traits.length ? `
                <div class="pets-group-title">${T('MainMenu.pets.sheetTraits')}</div>
                <div class="pet-note">${traits.join(' · ')}</div>` : '';

        const skills = (sel.skillIds || [])
            .map(id => $dataSkills && $dataSkills[id])
            .filter(Boolean)
            .map(sk => `<div class="pet-sheet-row"><span class="pet-sheet-label">${escapeHtml(
                window.CCDbName ? window.CCDbName(sk) : sk.name)}</span></div>`).join('');
        const skillPanel = skills ? `
                <div class="pets-group-title">${T('MainMenu.pets.sheetSkills')}</div>
                ${skills}` : '';

        const notePanel = sel.note && !/^<Talk>$/i.test(String(sel.note).trim())
            ? `<div class="pet-note">${escapeHtml(sel.note)}</div>` : '';

        return `
            <div class="ui-detail">
                <div class="ui-detail-head">
                    <div class="portrait-frame">
                        <canvas id="pet-sheet-canvas" width="48" height="48"></canvas>
                    </div>
                    <div class="ui-detail-titles">
                        <h3>${escapeHtml(sel.name)}</h3>
                        <span class="roster-sub">${typeLabel} · ${T('MainMenu.roster.levelAbbr')}${sel.level || 1}</span>
                    </div>
                </div>
                <div class="ui-detail-scroll">
                    ${this.petStatGridHTML(sel.isChild ? null : sel)}
                    <div class="pets-group-title">${T('MainMenu.pets.sheetFacts')}</div>
                    ${factRows}
                    ${traitPanel}
                    ${skillPanel}
                    ${notePanel}
                </div>
            </div>`;
    };

    Scene_Menu.prototype.generateUIGarageHTML = function () {
        const owned = (window.MergedVehicleSystem && window.MergedVehicleSystem.getOwnedVehicles)
            ? window.MergedVehicleSystem.getOwnedVehicles() : [];
        if (!owned.length) {
            return `<div class="ui-empty"><span class="ui-empty-text">${T('MainMenu.vehicles.none')}</span></div>`;
        }
        const sel = owned.find(v => v.key === this._vehiclesSelected) || owned[0];
        this._vehiclesSelected = sel.key;

        // The tank, the place and the fleet's own reading of the condition are
        // all on the card in the list; the right page answers the one question
        // the card cannot fit, which is the state of every single part.
        const parts = Array.isArray(sel.parts) ? sel.parts : [];
        const partRow = (p) => {
            const pct = Math.round((p.health / p.max) * 100);
            const band = this.uiVehicleBand(pct);
            return `
            <div class="vehicle-part-row${p.critical ? ' is-critical' : ''}">
                <span class="vehicle-part-name">${escapeHtml(p.label)}${p.critical
                    ? `<span class="vehicle-part-critical">${T('VehicleRepair.critical')}</span>` : ''}</span>
                <span class="vehicle-meter"><span class="vehicle-meter-fill ${band}" style="--ui-bar-w:${pct}%"></span></span>
                <span class="vehicle-part-pct ${band}">${pct}%</span>
            </div>`;
        };
        const partsPanel = parts.length
            ? `<div class="vehicle-parts-panel">
                   <div class="pets-group-title">${T('MainMenu.vehicles.partsTitle')}</div>
                   ${parts.map(partRow).join('')}
               </div>`
            : '';

        // A summon that cannot happen is greyed where it stands rather than
        // taken off the strip, so the row of verbs never moves under the hand.
        const canSpawn = this.canSpawnUIVehicle(sel.key);
        const spawnBtn = canSpawn
            ? `<div class="inspect-btn focusable" onclick="SceneManager._scene?.spawnUIVehicle?.('${sel.key}')">${T('MainMenu.vehicles.spawn')}</div>`
            : `<div class="inspect-btn unusable" title="${escapeHtml(T('MainMenu.vehicles.spawnIndoors'))}">${T('MainMenu.vehicles.spawn')}</div>`;
        const repairBtn = sel.hasRepair
            ? `<div class="inspect-btn focusable" onclick="SceneManager._scene?.repairUIVehicle?.('${sel.key}')">${T('MainMenu.roster.repair')}</div>`
            : '';
        const boardBtn = sel.type === 'airship'
            ? `<div class="inspect-btn focusable" onclick="SceneManager._scene?.teleportToShipUI?.()">${T('MainMenu.cmd.teleportToShip')}</div>`
            : '';

        return `
            <div class="ui-detail">
                <div class="ui-detail-head">
                    <div class="ui-detail-titles">
                        <h3>${escapeHtml(sel.name)}</h3>
                    </div>
                </div>
                <div class="ui-detail-scroll">
                    ${this.vehicleMapSquareHTML(sel)}
                    ${partsPanel}
                </div>
                <div class="inspect-actions inspect-actions--row">
                    ${spawnBtn}${repairBtn}${boardBtn}
                </div>
            </div>`;
    };

    // One band for every vehicle meter, read the way a need gauge is read, so
    // fuel, condition and a single part are all inked by the same rule.
    Scene_Menu.prototype.uiVehicleBand = function (pct) {
        if (pct >= 70) return 'band-good';
        if (pct >= 30) return 'band-warn';
        return 'band-bad';
    };

    // How sound the vehicle is: the weighted average its status card prints,
    // with the parts total under it as a bar, and the word for a vehicle that
    // will not move at all because a critical part is gone.
    Scene_Menu.prototype.uiVehicleConditionHTML = function (v) {
        if (v.condition == null) return '';
        const pct = Math.max(0, Math.min(100, v.condition));
        const band = this.uiVehicleBand(pct);
        const hpLine = (v.hp != null && v.mhp)
            ? T('MainMenu.vehicles.integrity', { hp: Math.round(v.hp), max: Math.round(v.mhp) })
            : '';
        const brokenLine = v.broken
            ? `<span class="vehicle-broken-tag">${T('MainMenu.vehicles.broken')}</span>`
            : '';
        return `
            <div class="vehicle-card-line">
                <span class="vehicle-card-label">${T('VehicleSystem.status.condition')}</span>
                <span class="vehicle-card-value ${band}">${Math.round(pct)}%${hpLine ? ' · ' + hpLine : ''}</span>
            </div>
            <span class="vehicle-meter"><span class="vehicle-meter-fill ${band}" style="--ui-bar-w:${pct.toFixed(0)}%"></span></span>
            ${brokenLine}`;
    };

    // The parts worth naming on a card: everything below full, worst first, and
    // never more than three of them. A whole vehicle says so in one line.
    Scene_Menu.prototype.uiVehiclePartsSummaryHTML = function (v) {
        const parts = Array.isArray(v.parts) ? v.parts : [];
        if (!parts.length) return '';
        const worn = parts
            .filter(p => p.health < p.max)
            .sort((a, b) => a.health - b.health);
        if (!worn.length) {
            return `<span class="vehicle-parts-line vehicle-parts-line--sound">${T('MainMenu.vehicles.allPartsSound')}</span>`;
        }
        const shown = worn.slice(0, 3).map(p => {
            const pct = Math.round((p.health / p.max) * 100);
            return `<span class="vehicle-part-chip ${this.uiVehicleBand(pct)}${p.critical ? ' is-critical' : ''}">`
                + `${escapeHtml(p.label)} ${pct}%</span>`;
        }).join('');
        const rest = worn.length - 3;
        const more = rest > 0
            ? `<span class="vehicle-part-chip vehicle-part-chip--more">${T('MainMenu.vehicles.morePartsWorn', { count: rest })}</span>`
            : '';
        return `<span class="vehicle-parts-line">${shown}${more}</span>`;
    };

    // Clicking a vehicle in the list puts THAT one on the right page.
    Scene_Menu.prototype.selectUIVehicle = function (key) {
        if (this._vehiclesSelected === key) return;
        SoundManager.playCursor();
        this._vehiclesSelected = key;
        this.refreshUIMenuDOM(true);
    };

    Scene_Menu.prototype.generateUIRightPageHTML = function () {
        // The world map codex and the search result card are self-contained, so
        // the party cards, the needs bars and the clock block below are only
        // gathered when the sheet they belong to is the one being drawn.
        if (this._isVehiclesPage) return this.generateUIGarageHTML();
        if (this._isPetsPage) return this.generateUIPetSheetHTML();
        if (window.MenuSearch && window.MenuSearch.isActive()) {
            // While searching, the right page is the selected result's own
            // detail card. The field that found it is on the left page with the
            // results, as it is in every other list menu.
            return window.MenuSearch.rightPageHTML();
        }

        // Parse survival parameters safely
        const weatherName = (window.WeatherNames && window.weatherName)
            ? window.WeatherNames.label(window.weatherName)
            : T('MainMenu.weather.clear');
        const temperature = $gameVariables.value(61) || 20;

        // Money formatting
        const goldValue = $gameParty ? $gameParty._gold : 0;
        const formattedGold = this.formatUIMoneyValue(goldValue);
        const currencyUnit = $dataSystem ? $dataSystem.currencyUnit : "€";

        // Army upkeep row (only rendered while the player fields troops)
        let armyUpkeepHTML = "";
        if (typeof $gameArmy !== "undefined" && $gameArmy && $gameArmy.getTroopCount() > 0) {
            const formattedUpkeep = this.formatUIMoneyValue($gameArmy.getTotalWeeklyCost());
            armyUpkeepHTML = `
                    <div class="clock-row">
                        <span class="clock-label">${T('MainMenu.label.armyUpkeep')}</span>
                        <span class="clock-value bounty-highlight">${formattedUpkeep} ${currencyUnit}/week</span>
                    </div>`;
        }

        // Bounty, and how badly the police want the party for it. The two say
        // different things - the bounty is the standing record, the heat is
        // whether anyone is looking right now - so they sit on the same row
        // rather than in two places the eye has to join up. The chip goes red
        // once the heat is past the threshold an officer gives chase at, which
        // is the only number on this page that changes what happens on the map.
        const bountyValue = $gameVariables.value(66) || 0;
        let formattedBounty = T('MainMenu.roster.none');
        if (bountyValue > 0) {
            formattedBounty = (bountyValue / 100).toFixed(2) + " " + currencyUnit;
        }
        let wantedHTML = "";
        const heatPercent = window.CrimeSystem ? window.CrimeSystem.heatPercent() : 0;
        if (heatPercent > 0) {
            const chasing = window.CrimeSystem.isWanted();
            wantedHTML = `<span class="wanted-chip${chasing ? ' wanted-chip--chased' : ''}"
                        title="${T('MainMenu.label.wantedHeat')}">${T('MainMenu.value.wantedLevel', { pct: heatPercent })}</span>`;
        }

        // Date/Time
        const gameMinutes = $gameVariables.value(114) || 0;
        const dateTime = this.getUIDateTime(gameMinutes);

        const members = $gameParty.members();

        // Party bio cards: every member is rendered as a full portrait + name/class
        // + HP/MP/AP block (same template as the old single header). The active
        // member is highlighted; clicking a card makes that member active so the
        // needs panel and Skills/Equip/Status commands target them.
        let partyBioHTML = '';
        members.forEach((mem, idx) => {
            const memHpPct = Math.floor(mem.hpRate() * 100);
            const memHpBand = memHpPct <= 25 ? 'gauge-band--bad'
                : memHpPct <= 50 ? 'gauge-band--warn' : '';
            // MP and AP read as plain white numbers; they only take a colour
            // when the pool is running low, on the same bands as HP.
            const memMpPct = mem.mmp > 0 ? Math.floor(mem.mpRate() * 100) : 100;
            const memMpBand = memMpPct <= 25 ? 'gauge-band--bad'
                : memMpPct <= 50 ? 'gauge-band--warn' : '';
            const memTpPct = Math.floor(mem.tpRate() * 100);
            const memTpBand = memTpPct <= 25 ? 'gauge-band--bad'
                : memTpPct <= 50 ? 'gauge-band--warn' : '';
            const isSelected = (idx === this._selectedActorIndex);
            partyBioHTML += `
              <div class="party-bio-block">
                <div class="bio-row party-bio-card${isSelected ? ' selected' : ''}"${''/* i18n-ignore: css classes */}
                     onclick="SceneManager._scene.switchSelectedActor(${idx})">
                    <div class="portrait-frame">
                        <canvas id="actor-canvas-${idx}" width="48" height="48"></canvas>
                    </div>
                    <div class="bio-text">
                        <h3 class="char-name">${escapeHtml(mem.name())}</h3>
                        <p class="char-class">${mem.currentClass() ? mem.currentClass().name : T('MainMenu.roster.classless')} (${T('MainMenu.roster.levelAbbr')} ${mem.level})</p>
                    </div>
                    <div class="bio-vitals">
                        <div class="bio-vital"><span class="bio-vital-lbl">${T('MainMenu.vital.hp')}</span><span class="bio-vital-val gauge-ink ${memHpBand}">${mem.hp}/${mem.mhp}</span></div>
                        <div class="bio-vital"><span class="bio-vital-lbl">${T('MainMenu.vital.mp')}</span><span class="bio-vital-val gauge-ink ${memMpBand}">${mem.mp}/${mem.mmp}</span></div>
                        <div class="bio-vital"><span class="bio-vital-lbl">${T('MainMenu.vital.ap')}</span><span class="bio-vital-val gauge-ink ${memTpBand}">${Math.floor(mem.tp)}</span></div>
                    </div>
                </div>
                <div class="survival-box">
                    ${this.getUINeedsCardDefs(mem).map(def => this.renderUINeedsCardHTML(def)).join('')}
                </div>
              </div>
            `;
        });


        return `
            <div class="party-bio-list">
                ${partyBioHTML}
            </div>

            <div class="right-tools">
                <div class="right-tools-title">${T('MainMenu.page.tools')}</div>
                <div class="right-tools-grid">
                    <div class="command-item focusable" data-symbol="hexphone" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUICommand === 'function') SceneManager._scene.triggerUICommand('hexphone')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.hexphone)}"></span>
                        <span>${T('MainMenu.tools.hexphone')}</span>
                    </div>
                    ${isAlchemistryAvailable() ? `
                    <div class="command-item focusable" data-symbol="alchemistry" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUICommand === 'function') SceneManager._scene.triggerUICommand('alchemistry')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.alchemistryKit)}"></span>
                        <span>${T('MainMenu.tools.alchemistryKit')}</span>
                    </div>` : ''}
                    ${this.generateUIToolItemsListHTML()}
                </div>
            </div>

            <div class="pockets-clock">
                <div class="clock-row">
                    <span class="clock-label">${T('MainMenu.label.timeDate')}</span>
                    <span class="clock-value">${dateTime.dateShort} | ${dateTime.time24}</span>
                </div>
                <div class="clock-row">
                    <span class="clock-label">${T('MainMenu.label.weather')}</span>
                    <span class="clock-value">${weatherName} (${temperature}°C)</span>
                </div>
                <div class="clock-row">
                    <span class="clock-label">${T('MainMenu.label.currentCash')}</span>
                    <span class="clock-value cash-highlight">${formattedGold} ${currencyUnit}</span>
                </div>${armyUpkeepHTML}
                <div class="clock-row">
                    <span class="clock-label">${T('MainMenu.label.currentBounty')}</span>
                    <span class="clock-value bounty-highlight">${formattedBounty}${wantedHTML}</span>
                </div>
            </div>
        `;
    };

    // Left Page: Commands Pockets, Tools Pockets, or Travel Pockets
    Scene_Menu.prototype.generateUILeftPageHTML = function () {
        let leftPageHTML = "";
        if (window.MenuSearch && window.MenuSearch.isActive()) {
            // A live query takes the whole left page: the results list and its
            // filter/sort bar (CustomMainMenuSearch.js).
            leftPageHTML = window.MenuSearch.leftPageHTML();
        } else if (this._isToolsPage) {
            // Render Tools List
            leftPageHTML = `
                <div class="tools-pockets">
                    <div class="page-header-bar">
                        <div class="back-button" onclick="if(SceneManager._scene && typeof SceneManager._scene.hideToolsPage === 'function') SceneManager._scene.hideToolsPage()">${T('MainMenu.dynamics.back')}</div>
                        <h2 class="tools-title">${T('MainMenu.page.tools')}</h2>
                    </div>
                    <div class="commands-grid">
                        <div class="command-item focusable" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUICommand === 'function') SceneManager._scene.triggerUICommand('hexphone')">
                            <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.hexphone)}"></span>
                            <span>${T('MainMenu.tools.hexphone')}</span>
                        </div>
                        ${isAlchemistryAvailable() ? `
                        <div class="command-item focusable" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUICommand === 'function') SceneManager._scene.triggerUICommand('alchemistry')">
                            <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.alchemistryKit)}"></span>
                            <span>${T('MainMenu.tools.alchemistryKit')}</span>
                        </div>` : ''}
                        ${this.generateUIToolItemsListHTML()}
                    </div>
                </div>
            `;
        } else if (this._isDynamicsPage) {
            leftPageHTML = this.generateUIDynamicsPageHTML();
        } else if (this._isDeedsPage) {
            leftPageHTML = this.generateUIDeedsPageHTML();
        } else if (this._isPetsPage) {
            const pets = window.PetSystem ? window.PetSystem.getPets() : [];
            const activePet = window.PetSystem ? window.PetSystem.getActivePet() : null;
            const activeId = activePet ? activePet.id : null;
            // Whatever the party has called and is walking with (SummonSystem.js).
            // A familiar is an animal somebody owns as well as a rite they cast,
            // so it already has a row here: that row gets the send-away button
            // rather than the creature being listed twice.
            const summon = window.SummonSystem?.mapSummonInfo?.() ?? null;
            const summonPetId = summon ? (summon.petId || 0) : 0;
            const summonNote = (info) => info.bound
                ? T('MainMenu.pets.summonBound')
                : T('MainMenu.pets.summonSteps', { steps: info.stepsLeft });
            const dismissBtn = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.dismissSummonUI?.()">${T('MainMenu.pets.dismissSummon')}</div>`;
            const className = (id) => {
                const data = $dataClasses && $dataClasses[id];
                if (!data) return '';
                return window.CCDbName ? window.CCDbName(data) : data.name;
            };

            const petRow = (pet) => {
                const isActive = (pet.id === activeId);
                const isRenaming = (this._petRenameId === pet.id);
                const isAbandoning = (this._petAbandonId === pet.id);
                const isChoosingDrill = (this._petTrainId === pet.id);
                const drill = window.PetSystem?.trainingInfo?.(pet.id) ?? null;
                const typeLabel = pet.isChild
                    ? T('MainMenu.roster.child')
                    : (pet.isFollower ? T('MainMenu.roster.follower') : T('MainMenu.roster.pet'));
                const activeBtn = isActive
                    ? `<div class="command-item roster-action is-disabled">${T('MainMenu.roster.following')}</div>`
                    : `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.setActivePet?.(${pet.id})">${T('MainMenu.roster.setActive')}</div>`;
                const activeTag = isActive ? ` · ${T('MainMenu.pets.active')}` : '';
                const isSummoned = (summonPetId === pet.id);
                const summonTag = isSummoned ? ` · ${T('MainMenu.pets.summoned')}` : '';
                const isMounted = !!window.MergedVehicleSystem?.isMounted?.(pet.id);
                const mountTag = isMounted ? ` · ${T('MainMenu.pets.mounted')}` : '';
                // While a pet is being renamed its row hands the whole button
                // strip over to the name field, so there is no way to abandon or
                // re-leash it by mistake with the keyboard captured by typing.
                const maxLen = window.PetSystem?.NAME_MAX_LENGTH ?? 16;
                let buttons;
                if (isRenaming) {
                    buttons = `<input type="text" id="pet-rename-input" class="pet-rename-input pet-rename-field"
                            maxlength="${maxLen}" autocomplete="off" spellcheck="false"
                            value="${escapeHtml(pet.name)}"
                            onkeydown="SceneManager._scene?.onPetRenameKey?.(event)"
                            onkeyup="event.stopPropagation()"
                            onkeypress="event.stopPropagation()">
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.confirmPetRename?.()">${T('MainMenu.roster.confirm')}</div>
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.cancelPetRename?.()">${T('MainMenu.roster.cancel')}</div>`;
                } else if (isAbandoning) {
                    // Walking away from a dependent is an offence, so the row
                    // says which charge and what it costs before it is done.
                    buttons = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.confirmPetAbandon?.()">${T('MainMenu.roster.confirm')}</div>
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.cancelPetAbandon?.()">${T('MainMenu.roster.cancel')}</div>`;
                } else if (isChoosingDrill) {
                    // The drills this creature's archetype supports, as chips.
                    // A humanoid that talks is offered the whole civilised
                    // roster, so the strip scrolls rather than pushing the rest
                    // of the page off the parchment.
                    const options = window.PetSystem?.trainingOptions?.(pet.id) ?? [];
                    const chips = options.map(id => `
                        <div class="command-item focusable roster-action--fixed" onclick="SceneManager._scene?.confirmPetTraining?.(${id})">${escapeHtml(className(id))}</div>`).join('');
                    buttons = `<div class="pet-class-chips">${chips}</div>
                        <div class="command-item focusable roster-action--fixed" onclick="SceneManager._scene?.cancelPetTraining?.()">${T('MainMenu.roster.cancel')}</div>`;
                } else {
                    // A companion being drilled is doing one thing only: the
                    // row offers finishing it or calling it off, nothing else.
                    let drillBtns = '';
                    if (drill && drill.ready) {
                        drillBtns = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.promotePetTrainee?.(${pet.id})">${T('MainMenu.pets.trainJoin')}</div>
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.stopPetTraining?.(${pet.id})">${T('MainMenu.pets.trainStop')}</div>`;
                    } else if (drill) {
                        drillBtns = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.stopPetTraining?.(${pet.id})">${T('MainMenu.pets.trainStop')}</div>`;
                    } else if (window.PetSystem?.canTrain?.(pet.id)) {
                        drillBtns = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.startPetTraining?.(${pet.id})">${T('MainMenu.pets.train')}</div>`;
                    }
                    // A creature the party can sit on is offered the saddle
                    // instead of a place in the vehicle menu: there is no
                    // summoning a mount, only climbing onto the one that is
                    // already here. Party members are actors and never appear
                    // on this page at all, so none of them is ever ridable.
                    let rideBtns = '';
                    if (isMounted) {
                        rideBtns = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.dismountPet?.()">${T('MainMenu.pets.dismount')}</div>`;
                    } else if (window.PetSystem?.isRidable?.(pet.id)) {
                        rideBtns = `<div class="command-item focusable roster-action" onclick="SceneManager._scene?.ridePet?.(${pet.id})">${T('MainMenu.pets.ride')}</div>`;
                    }
                    buttons = `${activeBtn}
                        ${isSummoned ? dismissBtn : ''}
                        ${rideBtns}
                        ${drillBtns}
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.startPetAbandon?.(${pet.id})">${T('MainMenu.pets.abandon')}</div>
                        <div class="command-item focusable roster-action" onclick="SceneManager._scene?.startPetRename?.(${pet.id})">${T('MainMenu.pets.rename')}</div>`;
                }
                const parentLine = pet.isChild && pet.parentName
                    ? `<div class="pet-note">${T('MainMenu.pets.childOf', { parent: escapeHtml(pet.parentName) })}</div>`
                    : '';
                const warning = isAbandoning
                    ? `<div class="pet-warning">${this.petAbandonWarning(pet)}</div>`
                    : '';
                // What the drill is doing right now, or what one would cost.
                let drillLine = '';
                if (isChoosingDrill) {
                    drillLine = T('MainMenu.pets.trainChoose', {
                        days: window.PetSystem?.trainingDays?.(pet.id) ?? 0,
                    });
                } else if (drill && drill.ready) {
                    drillLine = T('MainMenu.pets.trainReady', { className: className(drill.classId) });
                } else if (drill) {
                    const percent = Math.floor(100 * (drill.done || 0) / Math.max(1, drill.need));
                    drillLine = T('MainMenu.pets.trainProgress', {
                        className: className(drill.classId),
                        percent: percent,
                    });
                    // Only the companion on the leash is being drilled; the rest
                    // are waiting their turn, and the row says so.
                    if (!isActive) drillLine += ' ' + T('MainMenu.pets.trainPaused');
                }
                const drillNote = drillLine
                    ? `<div class="pet-drill">${escapeHtml(drillLine)}</div>`
                    : '';
                // The three optional traits chosen when the companion was taken
                // in (or carried over from its <Talk> tag) each lean its base
                // attributes one way; a child inherits none of them and skips
                // the line entirely.
                let traitsLine = '';
                if (!pet.isChild) {
                    const traitTags = [
                        pet.sentient ? T('MainMenu.pets.traitSentient') : null,
                        pet.magical ? T('MainMenu.pets.traitMagical') : null,
                        pet.geneticFreak ? T('MainMenu.pets.traitGeneticFreak') : null,
                    ].filter(Boolean).join(' · ');
                    traitsLine = this.petStatGridHTML(pet)
                        + (traitTags ? `<div class="pet-note">${traitTags}</div>` : '');
                }
                const isRead = (this._petsSelected === pet.id);
                return `
                    <div class="npc-dynamics-member roster-row focusable${isRead ? ' selected' : ''}" tabindex="0"
                         onclick="SceneManager._scene?.selectPetRow?.(${pet.id})">
                        <div class="portrait-frame">
                            <canvas id="pet-canvas-${pet.id}" width="48" height="48"></canvas>
                        </div>
                        <div class="roster-action">
                            <div class="entity-name">
                                ${escapeHtml(pet.name)}
                                <span class="roster-sub">${typeLabel}${activeTag}${summonTag}${mountTag} · ${T('MainMenu.roster.levelAbbr')}${pet.level}</span>
                            </div>
                            ${isSummoned ? `<div class="pet-note">${summonNote(summon)}</div>` : ''}
                            ${traitsLine}
                            ${drillNote}
                            ${parentLine}
                            ${warning}
                            <div class="entity-actions">
                                ${buttons}
                            </div>
                        </div>
                    </div>`;
            };

            // A rite the party is walking with that is nobody's animal: it has no
            // registry record of its own, so it is drawn as a row of its own and
            // the only thing that can be done with it is to send it away.
            const summonRows = (summon && !summonPetId) ? `
                    <div class="npc-dynamics-member roster-row">
                        <div class="portrait-frame">
                            <canvas id="summon-canvas" width="48" height="48"></canvas>
                        </div>
                        <div class="roster-action">
                            <div class="entity-name">
                                ${escapeHtml(summon.name)}
                                <span class="roster-sub">${T('MainMenu.pets.summoned')} · ${T('MainMenu.roster.levelAbbr')}${summon.level}</span>
                            </div>
                            <div class="pet-note">${summonNote(summon)}</div>
                            <div class="entity-actions">
                                ${dismissBtn}
                            </div>
                        </div>
                    </div>` : '';

            // Three kinds of company, kept apart: animals taken in, offspring
            // born to the party, and creatures that talked their way in.
            const groups = [
                { label: T('MainMenu.pets.groupPets'), rows: pets.filter(p => !p.isChild && !p.isFollower) },
                { label: T('MainMenu.pets.groupChildren'), rows: pets.filter(p => p.isChild) },
                { label: T('MainMenu.pets.groupFollowers'), rows: pets.filter(p => !p.isChild && p.isFollower) },
            ];
            let petRows = groups
                .filter(g => g.rows.length)
                .map(g => `
                    <div class="pets-group-title">${g.label}</div>
                    ${g.rows.map(petRow).join('')}`)
                .join('');
            if (!pets.length && !summonRows) {
                petRows = `<div class="roster-empty">${T('MainMenu.pets.none')}</div>`;
            }
            if (summonRows) {
                petRows = `
                    <div class="pets-group-title">${T('MainMenu.pets.groupSummons')}</div>
                    ${summonRows}${petRows}`;
            }
            leftPageHTML = `
                <div class="tools-pockets">
                    <div class="page-header-bar">
                        <div class="back-button" onclick="SceneManager._scene?.hidePetsPage?.()">${T('MainMenu.dynamics.back')}</div>
                        <h2 class="tools-title">${T('MainMenu.page.pets')}</h2>
                    </div>
                    <div class="ui-list pockets-scroll pets-list">${petRows}</div>
                </div>`;
        } else if (this._isVehiclesPage) {
            const vehicles = window.MergedVehicleSystem && window.MergedVehicleSystem.getOwnedVehicles
                ? window.MergedVehicleSystem.getOwnedVehicles() : [];
            // Indoors (a house, a vehicle's own cabin, a procedural interior
            // such as a dungeon, crypt, sewer, loot cellar or cave) only the
            // bike can be summoned. The list still shows every vehicle; it is
            // the Spawn button on the right page that goes inert there.
            let anyBlocked = false;
            let vehicleRows = '';
            vehicles.forEach(v => {
                if (!this.canSpawnUIVehicle(v.key)) anyBlocked = true;
                // A card says everything the fleet is read for before anything
                // is clicked: which vehicle, what is in the tank, how sound it
                // is, which parts are worn or gone, and where it was left.
                const fuelLine = v.usesFuel
                    ? T('MainMenu.vehicles.fuel', { fuel: Math.floor(v.fuel), max: v.max })
                    : T('MainMenu.vehicles.noFuelNeeded');
                const parkedLine = v.parkedAt
                    ? `${T('MainMenu.vehicles.parkedAt')} ${escapeHtml(v.parkedAt)}`
                    : T('MainMenu.vehicles.noLocation');
                const isShown = (this._vehiclesSelected || vehicles[0].key) === v.key;

                const fuelPct = (v.usesFuel && v.max)
                    ? Math.max(0, Math.min(100, (v.fuel / v.max) * 100)) : null;
                const fuelBar = fuelPct == null ? '' : `
                    <span class="vehicle-meter"><span class="vehicle-meter-fill ${this.uiVehicleBand(fuelPct)}"
                          style="--ui-bar-w:${fuelPct.toFixed(0)}%"></span></span>`;
                const conditionHTML = this.uiVehicleConditionHTML(v);
                const partsHTML = this.uiVehiclePartsSummaryHTML(v);

                vehicleRows += `
                    <div class="vehicle-card focusable${isShown ? ' selected' : ''}${v.broken ? ' vehicle-card--broken' : ''}"
                         onclick="SceneManager._scene?.selectUIVehicle?.('${v.key}')"
                         title="${escapeHtml(T('MainMenu.vehicles.show'))}">
                        <div class="vehicle-card-head">
                            <canvas id="vehicle-canvas-${v.key}" class="vehicle-row-sprite" width="96" height="96"></canvas>
                            <span class="entity-name">${escapeHtml(v.name)}</span>
                        </div>
                        <div class="vehicle-card-line">
                            <span class="vehicle-card-label">${T('VehicleSystem.status.fuel')}</span>
                            <span class="vehicle-card-value">${fuelLine}</span>
                        </div>
                        ${fuelBar}
                        ${conditionHTML}
                        ${partsHTML}
                        <span class="parked-at">${parkedLine}</span>
                    </div>`;
            });
            if (!vehicles.length) {
                vehicleRows = `<div class="ui-empty"><span class="ui-empty-text">${T('MainMenu.vehicles.none')}</span></div>`;
            }
            const indoorsNote = anyBlocked
                ? `<div class="ui-empty-note vehicles-indoors-note">${T('MainMenu.vehicles.spawnIndoors')}</div>`
                : '';
            leftPageHTML = `
                <div class="tools-pockets">
                    <div class="page-header-bar">
                        <div class="back-button focusable" onclick="SceneManager._scene?.hideVehiclesPage?.()">${T('MainMenu.dynamics.back')}</div>
                        <h2 class="title">${T('MainMenu.page.vehicles')}</h2>
                    </div>
                    ${indoorsNote}
                    <div class="ui-list vehicles-grid">${vehicleRows}</div>
                </div>`;
        } else {
            // T jumps straight between the world map and the procedural map
            // (Map/WorldMapReturn.js), skipping the "Visit / Make a camp / Cancel"
            // choice window entirely, so both hand-rolled travel tiles below carry
            // its badge like any other hotkeyed command tile.
            const worldMapToggleBadge = hotkeyBadge('T');

            // On the world map (315) surface the "Stop travel" command as the
            // first pockets entry: it visits whatever tile the party is standing
            // on (settlement, hardcoded location, or a freshly generated
            // procedural map), the same destination the T hotkey reaches directly.
            // The underground layer shifts, kept from the retired travel page:
            // on a procedural map with a lower layer they are the only way down
            // and back up again.
            let layerShiftHTML = "";
            if ($gameMap.mapId() === 636) {
                const procGenData = $gameSystem._procGenData;
                const isUnderground = !!(procGenData && procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0);
                const currentBiome = procGenData && procGenData.currentBiome && window.ProcGenUtils
                    ? window.ProcGenUtils.getBiomeByName(procGenData.currentBiome) : null;
                if (isUnderground) {
                    layerShiftHTML = `
                    <div class="command-item focusable" data-symbol="travel_goUp" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUITravel === 'function') SceneManager._scene.triggerUITravel('goUp')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.travelGoUp)}"></span>
                        <span>${T('MainMenu.travel.goUp')}</span>
                    </div>`;
                } else if (currentBiome && currentBiome.lowerLayer) {
                    layerShiftHTML = `
                    <div class="command-item focusable" data-symbol="travel_goDown" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUITravel === 'function') SceneManager._scene.triggerUITravel('goDown')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.travelGoDown)}"></span>
                        <span>${T('MainMenu.travel.goDown')}</span>
                    </div>`;
                }
            }

            // The atlas sits with the records, not with travel: it is the
            // political sheet, who holds what and what the weather does there.
            // Nothing travels.
            const atlasHTML = (window.WorldAtlas && window.WorldAtlas.isAvailable()) ? `
                    <div class="command-item focusable" data-symbol="travel_atlas" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUITravel === 'function') SceneManager._scene.triggerUITravel('atlas')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.travelAtlas)}"></span>
                        <span>${T('MainMenu.travel.openAtlas')}</span>
                    </div>
            ` : "";

            // Story mode's own entry: Em's vector gun and the two operating
            // modes it runs. VectorGunSystem.js says whether there is a gun to
            // open at all, so the tile is absent on every other playthrough.
            const vectorGunHTML = (window.VectorGun && window.VectorGun.available())
                ? this.generateUICommandItemHTML(T('VectorGun.menu'), "vector_gun")
                : "";

            const stopTravelHTML = ($gameMap.mapId() === 315 && !inVoxelWorld()) ? `
                    <div class="command-item focusable" data-symbol="travel_stop" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUITravel === 'function') SceneManager._scene.triggerUITravel('stop')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.travelStop)}"></span>
                        <span>${T('MainMenu.cmd.stopTravel')}</span>
                        ${worldMapToggleBadge}
                    </div>
            ` : "";

            // Off the world map, surface the "Return to map" travel command as
            // the very first pockets entry, copied from the World Map submenu, so
            // the player can bail out to map 315 without drilling in. It is not
            // the procedural map's alone: a house, a shop, a cellar or a
            // hand-made town map is left the same way (Map/WorldMapReturn.js).
            const procReturnHTML = (($gameMap.mapId() !== 315 || inVoxelWorld()) && !returnDisabled()) ? `
                    <div class="command-item focusable" data-symbol="travel_return" onclick="if(SceneManager._scene && typeof SceneManager._scene.triggerUITravel === 'function') SceneManager._scene.triggerUITravel('return')">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.travelReturn)}"></span>
                        <span>${worldMapReturnLabel()}</span>
                        ${worldMapToggleBadge}
                    </div>
            ` : "";

            // "Return to Ship" teleports into the Starship interior via
            // VehicleSystem. It is offered whenever the party is planetside and
            // hasn't reboarded: on an alien planet surface, at any hand-authored
            // landing location (tracked by _awayFromShip until they return), and
            // always on the world map (map 315).
            const onAlienSurface = $gameMap.mapId() === 636 &&
                !!(window.GalaxySim && window.GalaxySim.isAlienSurface && window.GalaxySim.isAlienSurface());
            const awayFromShip = !!($gameSystem && $gameSystem._awayFromShip);
            const showReturnToShip = onAlienSurface || awayFromShip || $gameMap.mapId() === 315;
            const returnToShipHTML = showReturnToShip ? `
                    <div class="command-item focusable" data-symbol="return_to_ship" onclick="if(SceneManager._scene && typeof SceneManager._scene.commandReturnToShip === 'function') SceneManager._scene.commandReturnToShip()">
                        <span class="icon menu-icon" style="${iconStyle(PAGE_ICONS.returnToShip)}"></span>
                        <span>${T('MainMenu.cmd.returnToShip')}</span>
                    </div>
            ` : "";

            const topHeaderHTML = `
                <div class="page-header-bar">
                    <div class="back-button" onclick="SceneManager._scene?.uiBackOut?.()">${T('MainMenu.dynamics.back')}</div>
                    <h2 class="tools-title">${T('MainMenu.page.main')}</h2>
                    <div class="menu-top-header-main"></div>
                </div>
            `;

            {
                // Detailed mode: full 3-column pockets layout
                const commandGroups = [
                    // Sandbox: tester/sandbox-only tools
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.sandbox'), "sandbox"),
                    ],
                    // Character: your active member's sheet, gear and body
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.backpack'), "item"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.equip'), "equip"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.skills'), "skill"),
                        vectorGunHTML,
                        this.generateUICommandItemHTML(T('MainMenu.cmd.status'), "status1"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.specializations'), "specializations"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.biologics'), "biologics"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.augments'), "augments"),
                    ],
                    // Travel & rest
                    [
                        stopTravelHTML,
                        procReturnHTML,
                        returnToShipHTML,
                        this.generateUICommandItemHTML(T('MainMenu.cmd.worldMap'), "world_map"),
                        layerShiftHTML,
                        this.generateUICommandItemHTML(T('MainMenu.cmd.vehicles'), "vehicles"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.wait'), "sleep_menu"),
                    ],
                    // Activities: things you do in the world
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.cooking'), "cooking"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.thinker'), "thinker"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.alchemistry'), "alchemistry"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.build'), "build"),
                    ],
                    // Records & standing: the pockets you consult
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.find'), "search"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.questLog'), "quest_log"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.diary'), "diary"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.hyperdeck'), "hypernet"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.radio'), "radio"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.bestiary'), "bestiary"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.cards'), "cards"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.archive'), "help"),
                        atlasHTML,
                        this.generateUICommandItemHTML(T('MainMenu.cmd.factions'), "factions"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.research'), "research"),
                    ],
                    // Party: the people and creatures travelling with you
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.dynamics'), "dynamics"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.assets'), "assets"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.deeds'), "deeds"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.pets'), "pets"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.training'), "training"),
                        this.generateUICommandItemHTML(emLabel("menuWorkforce", T('MainMenu.cmd.workforce')), "army"),
                    ],
                    // System: meta / out-of-world
                    [
                        this.generateUICommandItemHTML(T('MainMenu.cmd.save'), "save"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.multiplayer'), "multiplayer"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.preferences'), "options"),
                        this.generateUICommandItemHTML(T('MainMenu.cmd.resign'), "gameEnd"),
                    ],
                ];

                // One heading per group, in the same order as commandGroups
                // above. The sandbox group is unlabelled (it only ever shows for
                // testers), so its slot is empty and simply prints no header.
                const groupTitles = [
                    "",
                    T('MainMenu.group.party'),
                    T('MainMenu.group.worldMap'),
                    T('MainMenu.group.create'),
                    T('MainMenu.group.archive'),
                    T('MainMenu.group.manageParty'),
                    T('MainMenu.group.game'),
                ];
                const commandsHTML = commandGroups
                    .map((group, i) => {
                        const items = group.filter((html) => html && html.trim()).join("\n");
                        if (!items) return "";
                        const title = groupTitles[i];
                        const header = title
                            ? `<div class="command-group-header">${title}</div>\n`
                            : "";
                        return header + items;
                    })
                    .filter((html) => html)
                    .join("\n");

                leftPageHTML = `
                    ${topHeaderHTML}
                    <div class="commands-grid">
                        ${commandsHTML}
                    </div>
                `;
            }
        }

        return leftPageHTML;
    };

    Scene_Menu.prototype.refreshUIMenuDOM = function (useTransitions = false) {
        if (!this._dndContainer) return;

        const actor = this.selectedActor();
        if (!actor) return;

        // Clamp selected actor index in case the party shrank since last render.
        if (this._selectedActorIndex >= $gameParty.members().length) {
            this._selectedActorIndex = 0;
        }

        const leftPageKey = this.uiLeftPageKey();
        let spread = this._dndContainer.querySelector(".book-spread");

        if (!spread) {
            // Initial load - Render instantly. Building the page can settle the
            // state it was built from (the search results clamp their own
            // selection, see gather() in CustomMainMenuSearch), so the key that
            // is remembered is always read back afterwards.
            const leftHTML = this.generateUILeftPageHTML();
            this._dndLastLeftPageKey = this.uiLeftPageKey();
            this._dndContainer.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        ${leftHTML}
                    </div>
                    <div class="right-page">
                        ${this.generateUIRightPageHTML()}
                    </div>
                </div>
            `;
            spread = this._dndContainer.querySelector(".book-spread");

            // Render Canvases for portraits immediately
            this.drawAllPartyPortraits();
            this.drawAllPetPortraits();
            this.drawAllRosterPortraits();
            this.drawAllVehicleSprites();

            // Re-bind input mappings
            UIMenuInputManager.activate(4);
            if (window.MenuSearch) window.MenuSearch.afterRender(this);
        } else {
            // Subsequent updates. The left page is only built when it is going
            // to be used: most refreshes come from the right page (a party card
            // picked, a need ticking over) and leave the pockets untouched.
            if (useTransitions) {
                // Smooth transition switching
                if (this._dndLastLeftPageKey !== leftPageKey) {
                    const leftHTML = this.generateUILeftPageHTML();
                    this.fadeTransitionLeftPage(leftHTML, this.uiLeftPageKey());
                }
                this.fadeTransitionRightPage(this.generateUIRightPageHTML(), actor);
            } else {
                // Direct updates (e.g. for simple state reflows if any)
                const leftPageContainer = spread.querySelector(".left-page");
                const rightPageContainer = spread.querySelector(".right-page");

                if (this._dndLastLeftPageKey !== leftPageKey || !leftPageContainer.innerHTML.trim()) {
                    leftPageContainer.innerHTML = this.generateUILeftPageHTML();
                    this._dndLastLeftPageKey = this.uiLeftPageKey();
                }

                if (rightPageContainer) {
                    rightPageContainer.innerHTML = this.generateUIRightPageHTML();
                }

                // Render Canvases for portraits
                this.drawAllPartyPortraits();
                this.drawAllPetPortraits();
                this.drawAllRosterPortraits();
                this.drawAllVehicleSprites();

                // Re-bind input mappings
                UIMenuInputManager.activate(4);
                if (window.MenuSearch) window.MenuSearch.afterRender(this);
            }
        }
    };

    Scene_Menu.prototype.generateUICommandItemHTML = function (label, symbol) {
        // Sandbox is hidden entirely unless the player is named "test" (any
        // case) or sandbox mode is active.
        const sandboxTester = $gameActors && $gameActors.actor(1) && $gameActors.actor(1).name().toLowerCase() === "test";
        const sandboxActive = !!($gameSystem && $gameSystem._isSandboxMode);
        if (symbol === "sandbox") {
            if (!sandboxTester && !sandboxActive) return "";
        }

        const iconIndex = COMMAND_ICONS[symbol] || 0;
        const hotkey = hotkeyBadge(HOTKEY_LABELS[symbol]);

        // Check if command is enabled in standard menu list
        // Waiting is always allowed: it only runs the clock forward and never
        // rests the party, so no bed or camp is needed for the tile.
        let enabled = true;
        if (symbol === "build") enabled = window.FurnitureSystem?.canBuildOnCurrentMap?.() ?? ($gameMap.mapId() !== 315);
        if (symbol === "sandbox") enabled = sandboxTester || sandboxActive;
        if (symbol === "alchemistry") enabled = isAlchemistryAvailable();
        // Rosters with nothing in them: the tile stays visible so the player
        // knows the pocket exists, but it cannot be opened onto an empty page.
        if (symbol === "pets") enabled = (window.PetSystem?.getPets?.() ?? []).length > 0;
        if (symbol === "vehicles") {
            enabled = (window.MergedVehicleSystem?.getOwnedVehicles?.() ?? []).length > 0;
        }
        if (symbol === "army") enabled = (typeof $gameArmy !== "undefined" && $gameArmy?.getTroopCount?.() > 0);

        // A pocket that exists but cannot be opened from here reads as the
        // shared disabled tile; the focus ring already walks past it.
        const disabledClass = enabled ? "" : " is-disabled";

        let clickAction = `if(SceneManager._scene && typeof SceneManager._scene.triggerUICommand === 'function') SceneManager._scene.triggerUICommand('${symbol}')`;
        if (symbol === "tools") {
            clickAction = `if(SceneManager._scene && typeof SceneManager._scene.showToolsPage === 'function') SceneManager._scene.showToolsPage()`;
        }
        if (symbol === "pets") {
            clickAction = `if(SceneManager._scene && typeof SceneManager._scene.showPetsPage === 'function') SceneManager._scene.showPetsPage()`;
        }
        if (symbol === "vehicles") {
            clickAction = `if(SceneManager._scene && typeof SceneManager._scene.showVehiclesPage === 'function') SceneManager._scene.showVehiclesPage()`;
        }
        if (symbol === "dynamics") {
            // Dynamics is a hub: roster management, the Empathize wiki's Party
            // section, and the roster history.
            clickAction = `if(SceneManager._scene && typeof SceneManager._scene.showDynamicsPage === 'function') SceneManager._scene.showDynamicsPage()`;
        }

        // The Status tile carries the party's unspent attribute points, so a
        // level up that handed one out is visible without opening the sheet.
        let pointsAlert = "";
        if (symbol === "status1") {
            const pending = partyStatPointsAvailable();
            if (pending > 0) {
                const hint = escapeHtml(T('MainMenu.cmd.statusPointsHint', { points: pending }));
                pointsAlert = `<span class="command-item-alert" title="${hint}">` +
                    `${escapeHtml(T('MainMenu.cmd.statusPoints', { points: pending }))}</span>`;
            }
        }

        return `
            <div class="command-item focusable${disabledClass}" data-symbol="${symbol}" onclick="${clickAction}">
                <span class="icon menu-icon" style="${iconStyle(iconIndex)}"></span>
                <span>${label}</span>
                ${pointsAlert}
                ${hotkey}
            </div>
        `;
    };

    Scene_Menu.prototype.generateUIToolItemsListHTML = function () {
        let html = "";
        const seen = new Set();
        for (let i = 1; i < $dataItems.length; i++) {
            const item = $dataItems[i];
            if (!item) continue;
            const category = item.meta ? (item.meta.category || item.meta.Category) : null;
            if (!category || String(category).trim().toLowerCase() !== "tools") continue;
            if (!$gameParty.hasItem(item)) continue;
            if (seen.has(item.id)) continue;
            seen.add(item.id);
            const iconIndex = item.iconIndex || 0;
            html += `
                <div class="command-item focusable" data-symbol="tool_${item.id}" onclick="if(SceneManager._scene && typeof SceneManager._scene.useUIToolItem === 'function') SceneManager._scene.useUIToolItem(${item.id})">
                    <span class="icon menu-icon" style="${iconStyle(iconIndex)}"></span>
                    <span>${item.name}</span>
                </div>
            `;
        }
        return html;
    };

    // Draws every party member's portrait into its own bio-card canvas.
    Scene_Menu.prototype.drawAllPartyPortraits = function () {
        $gameParty.members().forEach((mem, idx) => {
            this.drawUIActorPortrait(mem, `actor-canvas-${idx}`);
        });
    };

    // The Dynamics board renders its own portraits on the left page, keyed by
    // actor id so a leader swap doesn't shuffle the sprites.
    Scene_Menu.prototype.drawAllRosterPortraits = function () {
        if (!this._isDynamicsPage) return;
        $gameParty.members().forEach(mem => {
            this.drawUIActorPortrait(mem, `roster-canvas-${mem.actorId()}`);
        });
        // Whoever is out on a shift is a real actor, just not in the party.
        (window.WorkSystem?.Shifts?.list?.() ?? []).forEach(entry => {
            const actor = $gameActors.actor(entry.actorId);
            if (actor) this.drawUIActorPortrait(actor, `busy-canvas-${entry.actorId}`);
        });
        // The bench has dossiers, not actors: drawUIActorPortrait only ever asks
        // for the sprite sheet and the index, so hand it those two.
        const bench = window.CharacterPresets?.getAvailableRetiredPresets?.() ?? [];
        bench.forEach(preset => {
            if (!preset.sprite) return;
            this.drawUIActorPortrait({
                characterName: () => preset.sprite || '',
                characterIndex: () => preset.spriteIndex || 0
            }, `bench-canvas-${preset.id}`);
        });
    };

    // Renders actor graphic directly on canvas
    Scene_Menu.prototype.drawUIActorPortrait = function (actor, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const bitmap = ImageManager.loadCharacter(actor.characterName());
        const drawPortrait = () => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            // A sheet that never arrived leaves a bitmap with no size behind
            // it, and drawImage throws on a source of width or height zero.
            // This runs from the bitmap's own load listener, outside the game
            // loop, so that throw would take the whole game down with it (see
            // guardedBoardAction): draw nothing at all instead. An inactive
            // dossier is the likeliest one to hit it, since it carries the
            // name of a sheet from the world folder that this build of the
            // game may no longer ship.
            if (!bitmap.width || !bitmap.height) return;

            ctx.imageSmoothingEnabled = false;

            const isBig = ImageManager.isBigCharacter(actor.characterName());
            const pw = bitmap.width / (isBig ? 3 : 12);
            const ph = bitmap.height / (isBig ? 4 : 8);

            const charIndex = actor.characterIndex();
            const sx = ((charIndex % 4) * 3 + 1) * pw; // Down center frame coordinate
            const sy = (Math.floor(charIndex / 4) * 4) * ph; // Down face line row

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            // Draw sprite preserving its aspect ratio, centered inside the canvas (#165)
            const fit = Math.min(canvas.width / pw, canvas.height / ph);
            const dw = pw * fit;
            const dh = ph * fit;
            const dx = (canvas.width - dw) / 2;
            const dy = (canvas.height - dh) / 2;
            ctx.drawImage(bitmap.canvas, sx, sy, pw, ph, dx, dy, dw, dh);
        };

        if (bitmap.isReady()) {
            drawPortrait();
        } else {
            bitmap.addLoadListener(drawPortrait);
        }
    };

    Scene_Menu.prototype.triggerUICommand = function (symbol) {
        // Prepare active actor index for skills/equips/status page mapping
        const personalSymbols = ["skill", "equip", "status1", "thinker", "specializations"];
        if (personalSymbols.includes(symbol)) {
            $gameParty.setMenuActor(this.selectedActor());

            // Directly push personal scenes to bypass hidden status selector
            if (symbol === "skill") {
                SceneManager.push(Scene_Skill);
                return;
            } else if (symbol === "equip") {
                SceneManager.push(Scene_Equip);
                return;
            } else if (symbol === "status1") {
                SceneManager.push(Scene_Status);
                return;
            } else if (symbol === "specializations") {
                if (typeof Scene_Specializations !== "undefined") {
                    SceneManager.push(Scene_Specializations);
                } else if (typeof window.Scene_Specializations !== "undefined") {
                    SceneManager.push(window.Scene_Specializations);
                } else {
                    console.warn("Scene_Specializations is not defined!");
                }
                return;
            }
        }

        let commandSymbol = symbol;
        if (symbol === "world_map") {
            commandSymbol = "worldMapMenu";
        }

        if (this._commandWindow && this._commandWindow._handlers[commandSymbol]) {
            this._commandWindow.callHandler(commandSymbol);
        } else {
            // Scene navigation direct fallback just in case handlers mapping gets bypassed
            switch (symbol) {
                case "world_map":
                case "worldMapMenu":
                    if (typeof this.commandWorldMapMenu === 'function') {
                        this.commandWorldMapMenu();
                    } else {
                        console.warn("commandWorldMapMenu is not defined on Scene_Menu!");
                    }
                    break;
                case "item":
                    SceneManager.push(Scene_EnhancedItem);
                    break;
                case "skill":
                    SceneManager.push(Scene_Skill);
                    break;
                case "equip":
                    SceneManager.push(Scene_Equip);
                    break;
                case "status1":
                    SceneManager.push(Scene_Status);
                    break;
                case "save":
                    SceneManager.push(Scene_Save);
                    break;
                case "options":
                    SceneManager.push(Scene_Options);
                    break;
                case "gameEnd":
                    SceneManager.push(Scene_GameEnd);
                    break;
                case "quest_log":
                    SceneManager.push(Scene_KanbanQuest);
                    break;
                case "training":
                    SceneManager.push(Scene_SkillEncyclopedia);
                    break;
                case "research":
                    if (typeof Scene_TechTree !== "undefined") {
                        SceneManager.push(Scene_TechTree);
                    } else {
                        console.warn("Scene_TechTree is not defined!");
                    }
                    break;
                case "cooking":
                    if (typeof Scene_Cooking !== "undefined") {
                        SceneManager.push(Scene_Cooking);
                    } else {
                        console.warn("Scene_Cooking is not defined!");
                    }
                    break;
                case "alchemistry":
                    if (typeof window.Scene_Alchemistry !== "undefined") {
                        SceneManager.push(window.Scene_Alchemistry);
                    } else {
                        console.warn("Scene_Alchemistry is not defined!");
                    }
                    break;
                case "help":
                    // Guarded like every other tile above: HelpMenu.js owns the scene, and a
                    // bare push threw a ReferenceError whenever that plugin was not loaded.
                    if (typeof window.Scene_Help !== "undefined") {
                        SceneManager.push(window.Scene_Help);
                    } else {
                        console.warn("Scene_Help is not defined!");
                    }
                    break;
                case "hypernet":
                    // The tile opens the machine, not the desktop: the Hyperdeck
                    // boots into Archways XP once it has the parts to do it. The
                    // map W-key shortcut and the OpenHypernetOS plugin command
                    // still go straight to the desktop with no boot (#68).
                    if (window.Scene_HyperDeck) {
                        SceneManager.push(window.Scene_HyperDeck);
                    } else if (window.Scene_HypernetOS) {
                        SceneManager.push(window.Scene_HypernetOS);
                    } else {
                        console.warn("Scene_HyperDeck is not defined!");
                    }
                    break;
                case "radio":
                    // The set is a panel over the live map rather than a scene,
                    // so the menu closes first and the cabinet is raised on the
                    // map underneath it.
                    if (window.TunableRadio) {
                        this.popScene();
                        setTimeout(() => {
                            if (window.TunableRadio) window.TunableRadio.open();
                        }, 100);
                    } else {
                        console.warn("TunableRadio is not defined!");
                    }
                    break;
                case "dynamics":
                    this.showDynamicsPage();
                    break;
                case "vector_gun":
                    if (window.Scene_VectorGun) {
                        SceneManager.push(window.Scene_VectorGun);
                    } else {
                        console.warn("Scene_VectorGun is not defined!");
                    }
                    break;
                case "diary":
                    if (window.Scene_Diary) {
                        SceneManager.push(window.Scene_Diary);
                    } else {
                        console.warn("Scene_Diary is not defined!");
                    }
                    break;
                case "pets":
                    this.showPetsPage();
                    break;
                case "army":
                    if (typeof Scene_Army !== "undefined") {
                        SceneManager.push(Scene_Army);
                    } else if (typeof window.Scene_Army !== "undefined") {
                        SceneManager.push(window.Scene_Army);
                    } else {
                        console.warn("Scene_Army is not defined!");
                    }
                    break;
                case "build":
                    // Close the pause menu and open the on-map build overlay.
                    $gameTemp._fbOpenPending = true;
                    this.popScene();
                    break;
                case "bestiary":
                    if (typeof Scene_CDCollection !== "undefined") {
                        SceneManager.push(Scene_CDCollection);
                    } else {
                        console.warn("Scene_CDCollection is not defined!");
                    }
                    break;
                case "cards":
                    if (typeof Scene_CardCollection !== "undefined") {
                        SceneManager.push(Scene_CardCollection);
                    } else if (typeof window.Scene_CardCollection !== "undefined") {
                        SceneManager.push(window.Scene_CardCollection);
                    } else {
                        console.warn("Scene_CardCollection is not defined!");
                    }
                    break;
                case "factions":
                    if (typeof Scene_FactionStatus !== "undefined") {
                        SceneManager.push(Scene_FactionStatus);
                    } else {
                        console.warn("Scene_FactionStatus is not defined!");
                    }
                    break;
                case "biologics":
                    if (typeof Scene_BiologicSimulation !== "undefined") {
                        SceneManager.push(Scene_BiologicSimulation);
                    } else {
                        console.warn("Scene_BiologicSimulation is not defined!");
                    }
                    break;
                case "augments":
                    if (typeof Scene_PartyAugments !== "undefined") {
                        SceneManager.push(Scene_PartyAugments);
                    } else {
                        console.warn("Scene_PartyAugments is not defined!");
                    }
                    break;
                case "search":
                    // The Find entry in the Archive group: the search bar itself no
                    // longer sits in the header, so this command is the way onto
                    // the search page.
                    if (window.MenuSearch && window.MenuSearch.open) {
                        window.MenuSearch.open();
                    }
                    break;
                case "sandbox":
                    if (typeof Scene_SandboxMenu !== "undefined") {
                        SceneManager.push(Scene_SandboxMenu);
                    } else {
                        console.warn("Scene_SandboxMenu is not defined!");
                    }
                    break;
                case "deeds":
                    this.showDeedsPage();
                    break;
                case "assets":
                    if (typeof Scene_AssetsMenu !== "undefined") {
                        SceneManager.push(Scene_AssetsMenu);
                    } else if (typeof window.Scene_AssetsMenu !== "undefined") {
                        SceneManager.push(window.Scene_AssetsMenu);
                    } else {
                        console.warn("Scene_AssetsMenu is not defined!");
                    }
                    break;
                case "thinker":
                    if (typeof Scene_Thinker !== "undefined") {
                        SceneManager.push(Scene_Thinker);
                    } else {
                        console.warn("Scene_Thinker is not defined!");
                    }
                    break;
                case "sleep_menu":
                    // Back to the map first, the wait popup lives there.
                    SceneManager.pop();
                    setTimeout(() => {
                        const map = SceneManager._scene;
                        if (!(map instanceof Scene_Map)) return;
                        // Waiting, with a rough sleep reachable from the same
                        // popup: a full night's rest still needs a bed,
                        // campfire, tent or a world-map camp.
                        if (map.openWaitMenu) map.openWaitMenu();
                    }, 200);
                    break;
                default:
                    console.warn("D&D Overlay triggered fallback for unknown symbol:", symbol);
                    break;
            }
        }
    };

    Scene_Menu.prototype.useUIToolItem = function (itemId) {
        const item = $dataItems[itemId];
        if (item && $gameParty.hasItem(item)) {
            SoundManager.playUseItem();
            if (item.consumable) {
                $gameParty.loseItem(item, 1);
            }
            const action = new Game_Action($gameParty.leader());
            action.setItemObject(item);
            action.applyGlobal();
            this.popScene();
        }
    };

    // Helper: DateTime Parser
    Scene_Menu.prototype.getUIDateTime = function (minutes) {
        const date = new Date(2001, 0, 1, 10, 0, 0);
        date.setMinutes(date.getMinutes() + minutes);

        const months = [
            "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
        ];

        const dayNum = String(date.getDate()).padStart(2, "0");
        const monthNum = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const yearShort = String(year).slice(-2);
        const hours = String(date.getHours()).padStart(2, "0");
        const mins = String(date.getMinutes()).padStart(2, "0");

        return {
            time24: `${hours}:${mins}`,
            dateShort: `${dayNum}/${monthNum}/${yearShort}`
        };
    };

    Scene_Menu.prototype.formatUIMoneyValue = function (value) {
        const valueStr = value.toString();
        if (valueStr.length <= 2) {
            return "0." + valueStr.padStart(2, '0');
        }
        const mainPart = valueStr.slice(0, -2);
        const decimalPart = valueStr.slice(-2);
        const result = mainPart + "." + decimalPart;
        return result.endsWith(".00") ? mainPart : result;
    };

    Scene_Menu.prototype.getUIReproductionName = function (type) {
        switch (type) {
            case -1: return T('MainMenu.reproduction.none');
            case 0: return T('MainMenu.reproduction.testicles');
            case 1: return T('MainMenu.reproduction.uterus');
            case 2: return T('MainMenu.reproduction.oviparous');
            case 3: return T('MainMenu.reproduction.plant');
            case 4: return T('MainMenu.reproduction.mitosis');
            default: return T('MainMenu.reproduction.unknown');
        }
    };

    Scene_Menu.prototype.getUIGenderName = function (gender) {
        switch (gender) {
            case 0: return T('MainMenu.gender.male');
            case 1: return T('MainMenu.gender.female');
            case 2: return T('MainMenu.gender.nonBinary');
            case 3: return T('MainMenu.gender.cocoon');
            default: return T('MainMenu.gender.fluid');
        }
    };

    // Direct Hooks for MZ Scene_Menu update cycles
    const _Scene_Menu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function () {
        _Scene_Menu_update.call(this);
        // Intercept inputs with UIMenuInputManager
        UIMenuInputManager.update();
    };

    // Clean up DOM overlays on leaving Scene_Menu
    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function () {
        // The turntable holds a live WebGL context; leaving the menu hands it back.
        _Scene_Menu_terminate.call(this);
        UIMenuInputManager.deactivate();

        const isReturningToMap = SceneManager.isNextScene(Scene_Map) || (SceneManager._nextScene instanceof Scene_Map);

        if (this._dndContainer) {
            const container = this._dndContainer;
            if (isReturningToMap) {
                // Completely destroy the DOM instantly when returning to map to ensure no lingering events or elements block clicks!
                if (container.parentNode) {
                    container.parentNode.removeChild(container);
                }
                this._dndContainer = null;
            } else {
                // Opening a linked submenu: instead of cross-fading the menu out (which
                // briefly blends two pages), keep the parchment fully visible as a
                // backdrop so the incoming window fades IN over it. The new scene's own
                // DOM overlay is appended after this one, so it naturally stacks on top.
                container.classList.add("menu-snapped-in", "menu-backdrop");
                // Sit just above the game canvas but below any incoming overlay so the
                // new window always renders on top of the backdrop, whatever its z-index.


                // Once the incoming window has settled on top, gently dissolve the
                // backdrop so it never blocks canvas-only submenus. Re-entering the
                // menu (see create) cancels this pending dissolve.
                if (container._dndHideTimer) clearTimeout(container._dndHideTimer);
                const token = (container._dndHideToken = (container._dndHideToken || 0) + 1);
                container._dndHideTimer = setTimeout(() => {
                    if (container._dndHideToken !== token) return; // superseded by re-open
                    container._dndHideTimer = null;
                    container.classList.remove("menu-snapped-in", "menu-shown");
                    container.classList.add("menu-fading-out");

                    // Once it has finished dissolving, take it out of the layout
                    // rather than leaving a transparent full-screen parchment
                    // behind. An opacity:0 tree is still a laid-out tree: it
                    // matches every "#menu-container ..." rule in theme.css and
                    // is re-styled and re-measured along with the submenu's own
                    // spread on top of it, for as long as the player stays in
                    // that submenu. create() below puts it back.
                    container._dndHideTimer = setTimeout(() => {
                        if (container._dndHideToken !== token) return;
                        container._dndHideTimer = null;
                        container.classList.add("menu-dissolved");
                    }, 400);
                }, 250);
            }
        }
    };

    // =========================================================================
    // External map hotkey interception fallbacks
    // =========================================================================
    const _Scene_Map_updateScene = Scene_Map.prototype.updateScene;
    Scene_Map.prototype.updateScene = function () {
        _Scene_Map_updateScene.call(this);
        if (!SceneManager.isSceneChanging() && this.isActive() && !this.isBusy()) {
            this.updateMenuHotkeys();
        }
    };

    // What each hotkey does when pressed on the map. Commands with no entry
    // here are menu-only: World Map is handled by Map/WorldMap.js itself,
    // Pets opens a page inside Scene_Menu, and the digit commands
    // (Thinker, Multiplayer, Hypernet) must not fire on the field because the
    // number row is the favourites hotbar there.
    // Keys live in HOTKEYS, actions live here.
    const MAP_HOTKEY_ACTIONS = {
        item:       () => pushMapScene(typeof Scene_EnhancedItem !== "undefined" && Scene_EnhancedItem),
        skill:      () => pushPersonalScene(typeof Scene_Skill !== "undefined" && Scene_Skill),
        equip:      () => pushPersonalScene(typeof Scene_Equip !== "undefined" && Scene_Equip),
        status1:    () => pushPersonalScene(typeof Scene_Status !== "undefined" && Scene_Status),
        quest_log:  () => pushMapScene(typeof Scene_KanbanQuest !== "undefined" && Scene_KanbanQuest),
        help:       () => pushMapScene(typeof Scene_Help !== "undefined" && Scene_Help),
        cooking:    () => pushMapScene(typeof Scene_Cooking !== "undefined" && Scene_Cooking),
        training:   () => pushMapScene(typeof Scene_SkillEncyclopedia !== "undefined" && Scene_SkillEncyclopedia),
        bestiary:   () => pushMapScene(typeof Scene_CDCollection !== "undefined" && Scene_CDCollection),
        factions:   () => pushMapScene(typeof Scene_FactionStatus !== "undefined" && Scene_FactionStatus),
        biologics:  () => pushMapScene(typeof Scene_BiologicSimulation !== "undefined" && Scene_BiologicSimulation),
        augments:   () => pushMapScene(typeof Scene_PartyAugments !== "undefined" && Scene_PartyAugments),
        assets:     () => pushMapScene(typeof Scene_AssetsMenu !== "undefined" && Scene_AssetsMenu),
        options:    () => pushMapScene(typeof Scene_Options !== "undefined" && Scene_Options),
        // The garage as a choice window rather than a menu page: on the field the
        // key lists every owned vehicle and either walks up to the one parked
        // here or calls another one over (Vehicle/VehicleSystem.js).
        vehicles:   () => {
            if (!window.MergedVehicleSystem?.showVehicleListMenu) return;
            SoundManager.playOk();
            window.MergedVehicleSystem.showVehicleListMenu();
        },
        sandbox:    () => {
            if ($gameSystem && $gameSystem._isSandboxMode) {
                pushMapScene(typeof Scene_SandboxMenu !== "undefined" && Scene_SandboxMenu);
            }
        },
        build:      scene => {
            const canBuild = window.FurnitureSystem?.canBuildOnCurrentMap?.() ?? ($gameMap.mapId() !== 315);
            if (canBuild) {
                SoundManager.playOk();
                PluginManager.callCommand(scene, 'FurnitureSystem', 'openBuilder', {});
            }
        },
        // Bethesda's wait key: passes the clock, and may also lie down where
        // the party stands for part of a night's rest (Core/TimeDateSystemUI.js).
        sleep_menu: scene => {
            if (!scene.openWaitMenu) return;
            SoundManager.playOk();
            scene.openWaitMenu();
        }
    };

    function pushMapScene(sceneClass) {
        if (!sceneClass) return;
        SoundManager.playOk();
        SceneManager.push(sceneClass);
    }

    // The hotkey layout, handed out so that a world drawn OVER the map can run
    // the same keys the map runs. VoxelWorld is a DOM overlay with its own
    // keyboard handling and Scene_Map's updateMenuHotkeys never gets a look in
    // while it is up, so it asks for this table instead of keeping a second
    // copy of it that would drift (which is exactly what the badges and the
    // bindings did before they were merged into HOTKEYS).
    //
    //   list()   every hotkey: { symbol, key, input, code }
    //   run(sym) do what that key does on the map. False when the key opens
    //            nothing from the field (Pets is a page inside Scene_Menu; the
    //            digits are the item hotbar out there).
    window.MenuHotkeys = {
        list: () => HOTKEYS.slice(),
        labels: () => Object.assign({}, HOTKEY_LABELS),
        has: symbol => !!MAP_HOTKEY_ACTIONS[symbol],
        run(symbol, scene) {
            const action = MAP_HOTKEY_ACTIONS[symbol];
            if (!action) return false;
            action(scene || SceneManager._scene);
            return true;
        }
    };

    // Scenes that read $gameParty.menuActor(): point them at the party leader,
    // the same actor the menu preselects.
    function pushPersonalScene(sceneClass) {
        if (!sceneClass) return;
        $gameParty.setMenuActor($gameParty.members()[0]);
        pushMapScene(sceneClass);
    }

    Scene_Map.prototype.updateMenuHotkeys = function () {
        if ($gameMap.isEventRunning()) return;
        if ($gameTemp._sleepMenuOpen) return; // the wait/rest popup owns the keyboard

        // The pad's half of R. Clicking the left stick has no Input.gamepadMapper
        // action on it, so it is polled raw through AnalogStickInput the same way
        // Map/WorldMap.js polls Start for the map sheet; binding it in the mapper
        // would make every key sharing that action fire twice. Map/MapLegend.js
        // draws it as the wait row's pad chip.
        const padWait = window.AnalogStickInput &&
            window.AnalogStickInput.isButtonTriggered(window.AnalogStickInput.BUTTON.L3);
        if (padWait && MAP_HOTKEY_ACTIONS.sleep_menu) {
            MAP_HOTKEY_ACTIONS.sleep_menu(this);
            return;
        }

        // One key opens one screen. Two hotkeys read as triggered on the same
        // frame (a chord, a stuck gamepad mapping) used to push both scenes, so
        // the player had to close a menu they never asked for to get back to the
        // map. The first match wins and the rest of the frame is ignored.
        for (const h of HOTKEYS) {
            const action = MAP_HOTKEY_ACTIONS[h.symbol];
            if (action && Input.isTriggered(h.input)) { action(this); return; }
        }
    };

    // Tab steps the item hotbar (see ItemSystemHotbar.js), the same as L1/R1;
    // it no longer opens the pause menu. Esc/right-click still work for that.

    Scene_Menu.prototype.commandWorldMapMenu = function () {
        this.showWorldMapPage();
    };

    // ─── The screen snapshot every menu backdrop sits on ────────────────────
    // Scene_Map.terminate snapshots the screen for the incoming menu scene to
    // sit on (rmmz_scenes.js), and Bitmap.snap pays for that twice: a
    // gl.readPixels stall that drains the whole GPU pipeline into JS memory,
    // then PIXI's Extract.arrayPostDivide unpremultiplying those pixels one at
    // a time in a JS loop. At 1280x720 that is ~920k iterations on the very
    // frame the menu opens, and it is the most expensive single thing between
    // the keypress and the parchment appearing.
    //
    // None of it is needed. The snapshot is only ever handed to a Sprite (every
    // SceneManager.backgroundBitmap() consumer in the game does exactly that),
    // and a Sprite wants a GPU texture, so the pixels never have to come back
    // to the CPU at all: the stage is rendered straight into a RenderTexture
    // and the Bitmap is handed out wrapping that texture. Full resolution, no
    // readback, no blur, no downscale.
    function snapBackgroundToTexture(stage) {
        const width = Graphics.width;
        const height = Graphics.height;
        const bitmap = new Bitmap();
        const renderTexture = PIXI.RenderTexture.create({ width, height });
        if (stage) {
            const renderer = Graphics.app.renderer;
            renderer.render(stage, renderTexture);
            stage.worldTransform.identity();
        }

        bitmap._renderTexture = renderTexture;
        bitmap._baseTexture = renderTexture.baseTexture;
        // Bitmap reads its size off the canvas it does not have here, and
        // Sprite refuses to draw a bitmap that never reports itself loaded.
        Object.defineProperty(bitmap, 'width', { value: width, configurable: true });
        Object.defineProperty(bitmap, 'height', { value: height, configurable: true });
        bitmap._loadingState = 'loaded';

        // Insurance for any consumer that wants real pixels (blt, getPixel,
        // anything touching .canvas or .context): pay for the readback then,
        // once, instead of on every menu open. The texture stays the one the
        // sprites are drawing, so it must survive the canvas being built.
        bitmap._ensureCanvas = function () {
            if (this._canvas) return;
            const texture = this._renderTexture;
            const keep = this._baseTexture;
            Bitmap.prototype._createCanvas.call(this, width, height);
            this._baseTexture = keep;
            if (texture) {
                const canvas = Graphics.app.renderer.extract.canvas(texture);
                this._context.drawImage(canvas, 0, 0);
                canvas.width = 0;
                canvas.height = 0;
            }
        };

        bitmap.destroy = function () {
            if (this._renderTexture) {
                this._renderTexture.destroy({ destroyBase: true });
                this._renderTexture = null;
            }
            this._baseTexture = null;
            this._destroyCanvas();
        };

        return bitmap;
    }

    SceneManager.snapForBackground = function () {
        if (this._backgroundBitmap) {
            this._backgroundBitmap.destroy();
        }
        this._backgroundBitmap = snapBackgroundToTexture(this._scene);
    };

    // Override Scene_MenuBase background creation to skip the PIXI blur filter
    // applied to the screen snapshot, avoids the jarring blur/deblur on every window open.
    Scene_MenuBase.prototype.createBackground = function () {
        this._backgroundSprite = new Sprite();
        this._backgroundSprite.bitmap = SceneManager.backgroundBitmap();
        this.addChild(this._backgroundSprite);
        this.setBackgroundOpacity(192);
    };

    // ─── Scene_GameEnd, parchment DOM overlay ───────────────────────────────

    const _Scene_GameEnd_create = Scene_GameEnd.prototype.create;
    Scene_GameEnd.prototype.create = function () {
        _Scene_GameEnd_create.call(this);
        this._commandWindow.opacity = 0;
        this._commandWindow.contentsOpacity = 0;

        const old = document.getElementById('game-end-parchment');
        if (old) old.remove();

        const root = document.createElement('div');
        root.id = 'game-end-parchment';

        const commands = [
            { text: TextManager.gameEnd, handler: 'toTitle' },
            { text: TextManager.cancel,  handler: 'cancel'  }
        ];
        this._geEls = [];
        commands.forEach((cmd, idx) => {
            const el = document.createElement('div');
            el.className = 'game-end-parchment-item';
            el.textContent = cmd.text;
            el.addEventListener('mouseenter', () => this._commandWindow.select(idx));
            el.addEventListener('click', () => {
                SoundManager.playOk();
                this._commandWindow.select(idx);
                this._commandWindow.callHandler(cmd.handler);
            });
            root.appendChild(el);
            this._geEls.push(el);
        });

        document.body.appendChild(root);
        this._geParchment = root;
        this._geLastIdx = -1;
    };

    const _Scene_GameEnd_update = Scene_GameEnd.prototype.update;
    Scene_GameEnd.prototype.update = function () {
        _Scene_GameEnd_update.call(this);
        if (!this._geParchment || !this._commandWindow) return;
        const idx = this._commandWindow.index();
        if (idx !== this._geLastIdx) {
            this._geLastIdx = idx;
            this._geEls.forEach((el, i) => {
                el.classList.toggle('sprite-frame--picked', i === idx);
            });
        }
    };

    const _Scene_GameEnd_terminate = Scene_GameEnd.prototype.terminate;
    Scene_GameEnd.prototype.terminate = function () {
        _Scene_GameEnd_terminate.call(this);
        const el = document.getElementById('game-end-parchment');
        if (el) el.remove();
        this._geParchment = null;
        this._geEls = null;
    };

})();
