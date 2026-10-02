/*:
 * @target MZ
 * @plugindesc Mod Manager UI, Parchment DOM overlay for ModManager.js
 * @author Omni-Lex
 * @help ModManagerUI.js
 * ============================================================================
 * DOM layer for Scene_ModManager.
 * Must be listed AFTER ModManager.js in the Plugin Manager.
 *
 * Controls:
 *   Up / Down / W / S  , navigate mod list
 *   Right / D          , open actions panel
 *   Left / A / Cancel  , close actions panel / back to title
 *   OK / Enter         , toggle selected mod (in list) or execute action
 *   L1 / Q / PgUp      , move selected mod up (higher priority)
 *   R1 / W / PgDn      , move selected mod down (lower priority)
 *   Mouse click        , select; click again to toggle
 *   Right-click        , open actions panel for that mod
 * ============================================================================
 */

(function () {
    'use strict';

    if (typeof ModManager === 'undefined' || !ModManager.initialize) {
        throw new Error('ModManagerUI.js requires ModManager.js to be loaded first!');
    }

    // =========================================================================
    // Localisation
    // =========================================================================


    function getT() {
        return T.obj('ModManagerUI');
    }

    const ACTIONS = ['toggle', 'moveUp', 'moveDown'];

    // =========================================================================
    // Input manager
    // =========================================================================
    const UIModManagerInputManager = {
        _scene:  null,
        _active: false,

        activate(scene) { this._scene = scene; this._active = true; },
        deactivate()    { this._active = false; this._scene = null; },

        update() {
            if (!this._active || !this._scene) return;
            const scene = this._scene;

            // WASD hold-repeat simulation
            for (const dir of ['up', 'down', 'left', 'right']) {
                if (scene._wasdHeld[dir]) {
                    scene._wasdHoldFrames[dir]++;
                    const t = scene._wasdHoldFrames[dir];
                    if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                        scene._wasdInput[dir] = true;
                    }
                } else {
                    scene._wasdHoldFrames[dir] = 0;
                }
            }

            const isUp    = Input.isRepeated('up')    || scene._wasdInput.up;
            const isDown  = Input.isRepeated('down')  || scene._wasdInput.down;
            const isLeft  = Input.isRepeated('left')  || scene._wasdInput.left;
            const isRight = Input.isRepeated('right') || scene._wasdInput.right;
            scene._wasdInput.up = scene._wasdInput.down = scene._wasdInput.left = scene._wasdInput.right = false;

            // L1 / R1, reorder from anywhere
            if (Input.isTriggered('pageup')) {
                scene._moveMod(-1);
                return;
            }
            if (Input.isTriggered('pagedown')) {
                scene._moveMod(1);
                return;
            }

            // Cancel / back
            if (Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                if (scene._activeSection === 'actions') {
                    SoundManager.playCancel();
                    scene._activeSection = 'list';
                    scene._refreshDOM();
                } else {
                    SoundManager.playCancel();
                    SceneManager.pop();
                }
                return;
            }

            if (scene._activeSection === 'list') {
                this._handleListInput(scene, isUp, isDown, isRight);
            } else {
                this._handleActionsInput(scene, isUp, isDown, isLeft);
            }
        },

        _handleListInput(scene, isUp, isDown, isRight) {
            const total = ModManager.mods.length;
            const idx   = scene._selectedModIndex;

            if (isUp && idx > 0) {
                scene._selectedModIndex = idx - 1;
                SoundManager.playCursor();
                scene._updateListHighlight();
            } else if (isDown && idx < total - 1) {
                scene._selectedModIndex = idx + 1;
                SoundManager.playCursor();
                scene._updateListHighlight();
            } else if (isRight && total > 0) {
                scene._activeSection       = 'actions';
                scene._selectedActionIndex = 0;
                SoundManager.playCursor();
                scene._refreshDOM();
            }

            if (Input.isTriggered('ok')) {
                scene._toggleSelectedMod();
            }
        },

        _handleActionsInput(scene, isUp, isDown, isLeft) {
            const idx = scene._selectedActionIndex;

            if (isUp && idx > 0) {
                scene._selectedActionIndex = idx - 1;
                SoundManager.playCursor();
                scene._updateActionsHighlight();
            } else if (isDown && idx < ACTIONS.length - 1) {
                scene._selectedActionIndex = idx + 1;
                SoundManager.playCursor();
                scene._updateActionsHighlight();
            } else if (isLeft) {
                scene._activeSection = 'list';
                SoundManager.playCursor();
                scene._refreshDOM();
            }

            if (Input.isTriggered('ok')) {
                const action = ACTIONS[scene._selectedActionIndex];
                if (action === 'toggle')   scene._toggleSelectedMod();
                if (action === 'moveUp')   scene._moveMod(-1);
                if (action === 'moveDown') scene._moveMod(1);
            }
        }
    };

    // =========================================================================
    // Scene_ModManager
    // =========================================================================
    class Scene_ModManager extends Scene_MenuBase {
        create() {
            super.create();

            // WASD state
            this._wasdInput      = { up: false, down: false, left: false, right: false };
            this._wasdHeld       = { up: false, down: false, left: false, right: false };
            this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };

            this._wasdListener = (e) => {
                if (e.repeat) return;
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; e.preventDefault(); }
                if (k === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; e.preventDefault(); }
                if (k === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; e.preventDefault(); }
                if (k === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; e.preventDefault(); }
            };
            this._wasdUpListener = (e) => {
                const k = e.key.toLowerCase();
                if (k === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
                if (k === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
                if (k === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
                if (k === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
            };
            window.addEventListener('keydown', this._wasdListener);
            window.addEventListener('keyup',   this._wasdUpListener);

            // DOM state
            this._selectedModIndex    = 0;
            this._activeSection       = 'list'; // 'list' | 'actions'
            this._selectedActionIndex = 0;

            // Build container
            this._container = document.createElement('div');
            this._container.id = 'mod-manager-container';
            this._container.style.opacity    = '0';
            this._container.style.transition = 'opacity 0.22s ease-out';
            document.body.appendChild(this._container);

            this._refreshDOM();
            UIModManagerInputManager.activate(this);
            setTimeout(() => { if (this._container) this._container.style.opacity = '1'; }, 16);
        }

        update() {
            Scene_MenuBase.prototype.update.call(this);
            UIModManagerInputManager.update();
        }

        terminate() {
            if (this._wasdListener) {
                window.removeEventListener('keydown', this._wasdListener);
                window.removeEventListener('keyup',   this._wasdUpListener);
                this._wasdListener = this._wasdUpListener = null;
            }
            UIModManagerInputManager.deactivate();
            ModManager.saveModConfig();
            if (this._container) {
                const c = this._container;
                c.style.transition    = 'opacity 0.2s ease-out';
                c.style.opacity       = '0';
                c.style.pointerEvents = 'none';
                setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 200);
                this._container = null;
            }
            Scene_MenuBase.prototype.terminate.call(this);
        }

        // ── data mutators ────────────────────────────────────────────────────

        _toggleSelectedMod() {
            const mod = ModManager.mods[this._selectedModIndex];
            if (!mod) return;
            mod.active = !mod.active;
            SoundManager.playOk();
            this._refreshDOM();
        }

        _moveMod(dir) {
            const idx    = this._selectedModIndex;
            const mods   = ModManager.mods;
            const newIdx = idx + dir;
            if (newIdx < 0 || newIdx >= mods.length) return;
            [mods[idx], mods[newIdx]] = [mods[newIdx], mods[idx]];
            this._selectedModIndex = newIdx;
            SoundManager.playEquip();
            this._refreshDOM();
        }

        // ── HTML builders ─────────────────────────────────────────────────────

        _buildLeftPageHTML(T) {
            const mods = ModManager.mods;
            let listHTML = '';
            if (mods.length === 0) {
                listHTML = `<div class="item-grid-empty">${T.noMods}</div>`;
            } else {
                mods.forEach((mod, i) => {
                    const sel        = i === this._selectedModIndex && this._activeSection === 'list';
                    const statusCls  = mod.active ? 'mod-slot-status--on' : 'mod-slot-status--off';
                    const statusText = mod.active ? T.active.toUpperCase() : T.inactive.toUpperCase();
                    listHTML += `
                        <div class="mod-slot${sel ? ' selected' : ''}" data-idx="${i}">
                            <span class="mod-slot-order">#${i + 1}</span>
                            <span class="mod-slot-status ${statusCls}">[${statusText}]</span>
                            <span class="mod-slot-name">${mod.name}</span>
                        </div>`;
                });
            }
            return `
                <div class="page-header-bar">
                    <button class="back-button" id="mod-back-btn">${T.back}</button>
                    <h2 class="title">${T.title}</h2>
                </div>
                <div class="mod-list" id="mod-list">${listHTML}</div>
                <div class="mod-hint-bar">${T.hint}</div>`;
        }

        _buildRightPageHTML(T) {
            const mod = ModManager.mods[this._selectedModIndex];
            if (!mod) {
                return `
                    <div class="item-inspect item-inspect--empty">  // i18n-ignore  css classes
                        <div class="inspect-placeholder-icon"></div>
                        <div class="inspect-placeholder-text">${T.noMods}</div>
                    </div>`;
            }

            const isWorkshop  = !!mod.path;
            const sourceLabel = isWorkshop ? T.workshop : T.local;
            const pathDisplay = isWorkshop ? mod.path : `mods/${mod.name}/`;  // i18n-ignore  asset path
            const statusCls   = mod.active ? 'mod-slot-status--on' : 'mod-slot-status--off';
            const statusText  = mod.active ? T.active : T.inactive;

            const actionsHTML = [
                { key: 'toggle',   label: T.toggle   },
                { key: 'moveUp',   label: T.moveUp   },
                { key: 'moveDown', label: T.moveDown  }
            ].map((a, i) => {
                const sel = this._activeSection === 'actions' && i === this._selectedActionIndex;
                return `<button class="inspect-btn${sel ? ' selected' : ''}" data-action="${a.key}">${a.label}</button>`;
            }).join('');

            return `
                <div class="item-inspect">
                    <div class="inspect-header">
                        <div class="inspect-title-box">
                            <div class="inspect-name">${mod.name}</div>
                            <div class="inspect-rarity ${statusCls}">${sourceLabel}, ${statusText}</div>
                        </div>
                    </div>
                    <div class="inspect-lore">
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T.source}</span>
                            <span class="inspect-spec-value">${sourceLabel}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T.path}</span>
                            <span class="inspect-spec-value mod-path-value">${pathDisplay}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${T.priority}</span>
                            <span class="inspect-spec-value">#${this._selectedModIndex + 1} / ${ModManager.mods.length}</span>
                        </div>
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-value">${T.restart}</span>
                        </div>
                    </div>
                    <div class="inspect-actions">${actionsHTML}</div>
                </div>`;
        }

        // ── DOM update methods ────────────────────────────────────────────────

        _refreshDOM() {
            if (!this._container) return;
            const T = getT();
            this._container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page" id="mod-left-page">${this._buildLeftPageHTML(T)}</div>
                    <div class="right-page" id="mod-right-page">${this._buildRightPageHTML(T)}</div>
                </div>`;
            this._wireAllEvents();
        }

        // In-place highlight toggle, only toggles .selected on list items and swaps right page
        _updateListHighlight() {
            if (!this._container) return;
            this._container.querySelectorAll('.mod-slot').forEach((slot, i) => {
                slot.classList.toggle('selected', i === this._selectedModIndex && this._activeSection === 'list');
            });
            const focused = this._container.querySelectorAll('.mod-slot')[this._selectedModIndex];
            if (focused) focused.scrollIntoView({ block: 'nearest' });

            const rightPage = this._container.querySelector('#mod-right-page');
            if (rightPage) {
                rightPage.innerHTML = this._buildRightPageHTML(getT());
                this._wireRightPageEvents();
            }
        }

        // In-place highlight on action buttons only
        _updateActionsHighlight() {
            if (!this._container) return;
            this._container.querySelectorAll('.inspect-btn[data-action]').forEach((btn, i) => {
                btn.classList.toggle('selected', i === this._selectedActionIndex);
            });
        }

        // ── event wiring ──────────────────────────────────────────────────────

        _wireAllEvents() {
            const backBtn = this._container.querySelector('#mod-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    SoundManager.playCancel();
                    SceneManager.pop();
                });
            }
            this._wireListEvents();
            this._wireRightPageEvents();
        }

        _wireListEvents() {
            this._container.querySelectorAll('.mod-slot').forEach(slot => {
                slot.addEventListener('click', () => {
                    const idx = parseInt(slot.dataset.idx, 10);
                    if (idx === this._selectedModIndex && this._activeSection === 'list') {
                        this._toggleSelectedMod();
                    } else {
                        this._selectedModIndex = idx;
                        this._activeSection    = 'list';
                        SoundManager.playCursor();
                        this._refreshDOM();
                    }
                });
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const idx = parseInt(slot.dataset.idx, 10);
                    this._selectedModIndex    = idx;
                    this._activeSection       = 'actions';
                    this._selectedActionIndex = 0;
                    SoundManager.playCursor();
                    this._refreshDOM();
                });
            });
        }

        _wireRightPageEvents() {
            this._container.querySelectorAll('.inspect-btn[data-action]').forEach((btn, i) => {
                btn.addEventListener('mouseover', () => {
                    // Hover steers only while the mouse is what is moving: a
                    // scrolled or rebuilt row slides under a resting pointer and
                    // fires this too (PointerSteering, Core/AnalogStickInput.js).
                    if (window.PointerSteering && !window.PointerSteering.isSteering()) return;
                    if (this._activeSection !== 'actions') return;
                    this._selectedActionIndex = i;
                    this._updateActionsHighlight();
                });
                btn.addEventListener('click', () => {
                    this._activeSection       = 'actions';
                    this._selectedActionIndex = i;
                    const action = btn.dataset.action;
                    if (action === 'toggle')   this._toggleSelectedMod();
                    if (action === 'moveUp')   this._moveMod(-1);
                    if (action === 'moveDown') this._moveMod(1);
                });
            });
        }
    }

    window.Scene_ModManager = Scene_ModManager;

})();
