/*:
 * @target MZ
 * @plugindesc Quick Main Menu v1.0.0 - the menu's pockets on a wheel, held open on the field
 * @author OmniLex.ai
 * @help QuickMainMenuLayout.js
 *
 * HOLD Tab (keyboard) or Y (pad) out on the map and the menu's pockets come up
 * in a small list beside the party, each with the icon it wears on the pockets
 * page, in alphabetical order. Walk it with the arrows, the left stick or the
 * mouse; let the key go and whatever the cursor is on opens. Let it go without
 * having held it long enough and nothing happens at all, so the tap each key
 * already had is untouched: Tab still steps the item hotbar, Y still opens the
 * menu.
 *
 * It is a way of reaching one pocket without the page in between, not a second
 * menu: everything on it is the same voice, the same icon and the same scene
 * the pockets page offers.
 *
 * ===========================================================================
 * *** ONE LIST, IN THE OTHER FILE. KEEP THE TWO IN STEP. ***
 * ===========================================================================
 * THIS FILE CONTAINS NO LIST OF MENU VOICES AND MUST NEVER CONTAIN ONE.
 *
 * Every pocket drawn here is read at runtime from window.MainMenuVoices, which
 * UI/CustomMainMenuLayout.js publishes out of its own VOICES table - the very
 * table its pockets page is built from. So a pocket added, renamed, re-iconed
 * or removed over there is added, renamed, re-iconed or removed here on the
 * same save, and neither file can drift from the other.
 *
 * If you are changing the menu's voices:
 *   - the entry goes in VOICES in UI/CustomMainMenuLayout.js, and nowhere else;
 *   - its icon goes in COMMAND_ICONS in that same file;
 *   - if it has to open from the field, give it an entry in MAP_HOTKEY_ACTIONS
 *     there too, or it will be a row in this list that does nothing;
 *   - change NOTHING here. If you find yourself about to write a symbol name
 *     into this file, add the field you want to that table instead.
 *
 * test/test_quick_main_menu.js fails if this file names a voice of its own, or
 * if a voice of that table cannot be opened from the field.
 *
 * No plugin parameters.
 */

(() => {
    'use strict';

    const T = (key, fallback) => {
        const s = window.Hendrix_Localization && window.Hendrix_Localization.t
            ? window.Hendrix_Localization.t(key)
            : null;
        return (s && s !== key) ? s : (fallback !== undefined ? fallback : key);
    };

    const ROOT_ID = 'quick-main-menu';

    // How long a key has to be down before this is a HOLD rather than the tap
    // the key already meant. Short enough that a deliberate hold feels
    // immediate, long enough that stepping the hotbar never flashes a list up.
    const HOLD_FRAMES = 14;

    // ------------------------------------------------------------------ state
    let open = false;
    let index = 0;
    let entries = [];
    let held = 0;
    let root = null;
    // 'key' or 'pad', so the release that closes the list is the release of the
    // very thing that opened it.
    let openedBy = null;

    // ------------------------------------------------------------------ input
    // Y on a pad has no Input.gamepadMapper action of its own that is not also
    // a key, so it is read raw the same way the map reads the stick clicks
    // (UI/CustomMainMenuLayout.js) - otherwise every key sharing 'menu' would
    // hold the list open too.
    function padExtraHeld() {
        const pads = window.AnalogStickInput;
        if (!pads || !pads.isButtonPressed || !pads.BUTTON) return false;
        return !!pads.isButtonPressed(pads.BUTTON.Y);
    }

    function keyHeld() {
        return typeof Input !== 'undefined' && !!Input.isPressed && Input.isPressed('tab');
    }

    function typingInField() {
        const el = typeof document !== 'undefined' ? document.activeElement : null;
        if (!el) return false;
        const tag = (el.tagName || '').toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
    }

    // Where the list is allowed up at all: out on the map, with nothing else
    // over it. A fight played out on the map is somebody else's keyboard, and
    // so is the 3D world drawn over a Scene_Map that never went away.
    function available() {
        if (typeof SceneManager === 'undefined') return false;
        if (!(SceneManager._scene instanceof Scene_Map)) return false;
        if (SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return false;
        if (typeof $gameMap === 'undefined' || !$gameMap || !$gameMessage) return false;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return false;
        if (typeof $gameTemp !== 'undefined' && $gameTemp._sleepMenuOpen) return false;
        if (window.VoxelWorldSystem && window.VoxelWorldSystem.isActive &&
            window.VoxelWorldSystem.isActive()) return false;
        if (window.$gameSplitScreen && window.$gameSplitScreen.active) return false;
        if (typingInField()) return false;
        return !!window.MainMenuVoices;
    }

    // ----------------------------------------------------------------- voices
    // Read, never written down. See the note at the head of this file.
    function readVoices() {
        const voices = window.MainMenuVoices;
        if (!voices || !voices.list) return [];
        return voices.list()
            .filter((v) => (voices.visible ? voices.visible(v.symbol) : true))
            // A pocket with no way of opening from the field would be a row that
            // did nothing when it was picked.
            .filter((v) => window.MenuHotkeys && window.MenuHotkeys.has(v.symbol))
            // Alphabetical by the name actually drawn, so the order is the one
            // the player is reading rather than the order the page happens to
            // group them in. Localised, so the Italian list reads in Italian
            // order rather than in English order with Italian words on it.
            .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    }

    // ------------------------------------------------------------------- draw
    function iconStyle(i) {
        return '--icon-col:' + (i % 16) + ';--icon-row:' + Math.floor(i / 16);
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[c]);
    }

    function build() {
        if (root && root.parentNode) return root;
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'qmm';
        document.body.appendChild(root);
        return root;
    }

    function render() {
        const el = build();
        const rows = entries.map((v, i) => {
            const on = i === index ? ' qmm-on' : '';
            const off = v.enabled ? '' : ' qmm-off';
            return '<div class="qmm-row' + on + off + '" data-qmm="' + i + '">' + // i18n-ignore: markup and a data attribute name
                '<span class="icon menu-icon qmm-icon" style="' + iconStyle(v.icon) + '"></span>' +
                '<span class="qmm-label">' + escapeHtml(v.label) + '</span>' +
                '</div>';
        }).join('');
        const title = escapeHtml(T('QuickMenu.title'));
        const html = '<div class="qmm-head">' + title + '</div>' +
            '<div class="qmm-list">' + rows + '</div>';
        if (el.innerHTML !== html) el.innerHTML = html;
        scrollIntoView();
    }

    // The list is taller than the strip it is read through once the party
    // carries every pocket, so the cursor keeps itself on screen.
    function scrollIntoView() {
        if (!root) return;
        const list = root.querySelector('.qmm-list');
        const row = root.querySelector('.qmm-row.qmm-on');
        if (!list || !row || !row.getBoundingClientRect) return;
        const r = row.getBoundingClientRect();
        const p = list.getBoundingClientRect();
        if (r.top < p.top) list.scrollTop -= (p.top - r.top) + 6;
        else if (r.bottom > p.bottom) list.scrollTop += (r.bottom - p.bottom) + 6;
    }

    function destroy() {
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = null;
    }

    // ------------------------------------------------------------------- open
    function show(by) {
        entries = readVoices();
        if (!entries.length) return false;
        open = true;
        openedBy = by;
        index = 0;
        render();
        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
        return true;
    }

    // Closing WITHOUT picking: the hold was let go on nothing, or the situation
    // went away under it.
    function close() {
        open = false;
        openedBy = null;
        entries = [];
        destroy();
    }

    // Closing BY picking, which is what a release on a row means.
    function pick() {
        const chosen = entries[index];
        close();
        if (!chosen) return;
        if (!chosen.enabled) {
            if (typeof SoundManager !== 'undefined') SoundManager.playBuzzer();
            return;
        }
        window.MainMenuVoices.run(chosen.symbol, SceneManager._scene);
    }

    function step(delta) {
        if (!entries.length) return;
        index = (index + delta + entries.length) % entries.length;
        if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
        render();
    }

    // ------------------------------------------------------------------ frame
    function update() {
        const key = keyHeld();
        const pad = padExtraHeld();

        if (!available()) {
            if (open) close();
            held = 0;
            return;
        }

        if (!open) {
            // The hold has to grow out of ONE of the two, and the release that
            // closes the list is the release of that same one.
            if (key || pad) {
                held++;
                if (held >= HOLD_FRAMES) show(key ? 'key' : 'pad');
            } else {
                held = 0;
            }
            return;
        }

        // Still open: let go and take whatever the cursor is on.
        const stillHeld = openedBy === 'pad' ? pad : key;
        if (!stillHeld) {
            held = 0;
            pick();
            return;
        }

        if (Input.isRepeated('down')) step(1);
        else if (Input.isRepeated('up')) step(-1);
        // A list read down a column: left and right are the same two steps, so
        // a player who reaches sideways is not answered with nothing.
        else if (Input.isRepeated('right')) step(1);
        else if (Input.isRepeated('left')) step(-1);
        // Confirm while still holding, for a player who would rather press than
        // let go. Cancel drops the list without opening anything.
        else if (Input.isTriggered('ok')) { pick(); return; }
        else if (Input.isTriggered('cancel')) { close(); return; }
    }

    // While the list is up it owns the directions, or the party walks under it
    // and the hotbar steps behind it.
    const _Scene_Map_updateMenuHotkeys = Scene_Map.prototype.updateMenuHotkeys;
    Scene_Map.prototype.updateMenuHotkeys = function () {
        if (open) return;
        _Scene_Map_updateMenuHotkeys.call(this);
    };

    const _Game_Player_canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function () {
        if (open) return false;
        return _Game_Player_canMove.call(this);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function () {
        _Scene_Map_update.call(this);
        update();
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function () {
        close();
        held = 0;
        _Scene_Map_terminate.call(this);
    };

    // The mouse reads the same list: hovering moves the cursor, clicking takes
    // the row. Bound on the document because the list itself is built and
    // thrown away as it opens and closes.
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('mousemove', (e) => {
            if (!open || !root) return;
            const row = e.target && e.target.closest && e.target.closest('.qmm-row');
            if (!row) return;
            const at = Number(row.dataset.qmm);
            if (!Number.isFinite(at) || at === index) return;
            index = at;
            render();
        });

        document.addEventListener('mousedown', (e) => {
            if (!open || !root) return;
            const row = e.target && e.target.closest && e.target.closest('.qmm-row');
            if (!row) return;
            e.preventDefault();
            e.stopPropagation();
            index = Number(row.dataset.qmm) || 0;
            pick();
        }, true);
    }

    // Asked by anything that needs to know the field is not the player's this
    // frame, and by Map/MapLegend.js, which names the hold on its controls list.
    window.QuickMainMenu = {
        isOpen: () => open,
        entries: () => entries.slice(),
        // For the tests, and for anything that wants to raise it by hand.
        open: (by) => show(by || 'key'),
        close,
        HOLD_FRAMES,
    };
})();
