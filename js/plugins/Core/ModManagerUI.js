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
 *
 * Steam Workshop (when the game runs through Steam):
 *   a local mod can be published, then updated, from its actions panel;
 *   a subscribed mod shows its download state, opens its Workshop page and
 *   can be unsubscribed. "Browse Workshop" is offered on every mod.
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

    // The actions panel of one mod, in order. Workshop actions appear only
    // while Steam is up.
    function actionsFor(mod) {
        const list = ['toggle', 'moveUp', 'moveDown'];
        if (!mod || !ModManager.hasWorkshop || !ModManager.hasWorkshop()) return list;
        if (mod.workshop) {
            list.push('openPage', 'unsubscribe');
        } else {
            list.push('publish');
            if (ModManager.workshopIdOf(mod)) list.push('openPage');
        }
        list.push('browse');
        return list;
    }

    function esc(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function toast(text, severity) {
        if (window.ParchmentToast && typeof window.ParchmentToast.show === 'function') {
            window.ParchmentToast.show(text, { severity: severity || 'info' });  // i18n-ignore  severity id
        }
    }

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
            } else if (isDown && idx < scene._actions().length - 1) {
                scene._selectedActionIndex = idx + 1;
                SoundManager.playCursor();
                scene._updateActionsHighlight();
            } else if (isLeft) {
                scene._activeSection = 'list';
                SoundManager.playCursor();
                scene._refreshDOM();
            }

            if (Input.isTriggered('ok')) {
                scene._runAction(scene._actions()[scene._selectedActionIndex]);
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

            // Subscriptions made since the game started (in the Steam client or
            // the browser) show up as soon as the screen opens.
            this._statusTick = 0;
            this._busy = null;
            if (ModManager.refreshWorkshop) ModManager.refreshWorkshop();
            this._statusKey = this._workshopStatusKey();

            this._refreshDOM();
            UIModManagerInputManager.activate(this);
            setTimeout(() => { if (this._container) this._container.style.opacity = '1'; }, 16);
        }

        update() {
            Scene_MenuBase.prototype.update.call(this);
            UIModManagerInputManager.update();
            this._pollWorkshop();
        }

        // Once a second: picks up downloads finishing and new subscriptions,
        // and redraws only when something a player can see has moved.
        _pollWorkshop() {
            if (!ModManager.hasWorkshop || !ModManager.hasWorkshop()) return;
            if (++this._statusTick < 60) return;
            this._statusTick = 0;
            const count = ModManager.mods.length;
            if (ModManager.mods.some(m => m.workshop && !m.path)) ModManager.refreshWorkshop();
            const key = this._workshopStatusKey();
            if (key === this._statusKey && count === ModManager.mods.length) return;
            this._statusKey = key;
            this._selectedModIndex = Math.min(this._selectedModIndex, Math.max(0, ModManager.mods.length - 1));
            this._refreshDOM();
        }

        _workshopStatusKey() {
            if (!ModManager.workshopStatus) return '';
            return ModManager.mods.map(m => {
                const st = ModManager.workshopStatus(m);
                return st ? m.name + ':' + st.status + ':' + Math.floor(st.progress * 20) : '';
            }).join('|');
        }

        _actions() {
            return actionsFor(ModManager.mods[this._selectedModIndex]);
        }

        _runAction(action) {
            if (action === 'toggle')      this._toggleSelectedMod();
            if (action === 'moveUp')      this._moveMod(-1);
            if (action === 'moveDown')    this._moveMod(1);
            if (action === 'publish')     this._publishSelectedMod();
            if (action === 'openPage')    this._openSelectedPage();
            if (action === 'unsubscribe') this._unsubscribeSelectedMod();
            if (action === 'browse')      this._browseWorkshop();
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

        _publishSelectedMod() {
            const mod = ModManager.mods[this._selectedModIndex];
            if (!mod || mod.workshop || this._busy) { SoundManager.playBuzzer(); return; }
            const T = getT();
            const wasPublished = !!ModManager.workshopIdOf(mod);
            SoundManager.playOk();
            this._busy = { name: mod.name, progress: 0 };
            this._refreshDOM();
            ModManager.publishToWorkshop(mod.name, {
                onProgress: (p) => {
                    if (!this._busy) return;
                    this._busy.progress = p;
                    const el = this._container && this._container.querySelector('#mod-busy');
                    if (el) el.textContent = T.publishing.replace('{pct}', Math.round(p * 100));  // i18n-ignore  placeholder name
                }
            }).then(res => {
                this._busy = null;
                toast(wasPublished ? T.updated : T.published, 'success');  // i18n-ignore  severity id
                if (res.needsAgreement) {
                    toast(T.agreement, 'warning');  // i18n-ignore  severity id
                    ModManager.openSteamPage('https://steamcommunity.com/sharedfiles/workshoplegalagreement');  // i18n-ignore  url
                } else if (res.created) {
                    ModManager.openWorkshopPage(res.itemId);
                }
                this._refreshDOM();
            }, err => {
                this._busy = null;
                toast(T.publishFailed.replace('{error}', (err && err.message) || String(err)), 'error');  // i18n-ignore  severity id
                this._refreshDOM();
            });
        }

        _openSelectedPage() {
            const id = ModManager.workshopIdOf(ModManager.mods[this._selectedModIndex]);
            if (!id || !ModManager.openWorkshopPage(id)) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
        }

        _browseWorkshop() {
            if (!ModManager.openWorkshopPage(null)) { SoundManager.playBuzzer(); return; }
            SoundManager.playOk();
        }

        _unsubscribeSelectedMod() {
            const mod = ModManager.mods[this._selectedModIndex];
            if (!mod || !mod.workshop || this._busy) { SoundManager.playBuzzer(); return; }
            const T = getT();
            SoundManager.playOk();
            ModManager.unsubscribeWorkshop(mod).then(() => {
                toast(T.unsubscribed, 'info');  // i18n-ignore  severity id
                this._selectedModIndex = Math.min(this._selectedModIndex, Math.max(0, ModManager.mods.length - 1));
                this._activeSection = 'list';
                this._statusKey = this._workshopStatusKey();
                this._refreshDOM();
            }, err => {
                toast(T.publishFailed.replace('{error}', (err && err.message) || String(err)), 'error');  // i18n-ignore  severity id
            });
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
                            <span class="mod-slot-name">${esc(ModManager.displayName(mod))}</span>
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

            const isWorkshop  = !!mod.workshop;
            const sourceLabel = isWorkshop ? T.workshop : T.local;
            const pathDisplay = isWorkshop ? (mod.path || T.notDownloaded) : `mods/${mod.name}/`;  // i18n-ignore  asset path
            const statusCls   = mod.active ? 'mod-slot-status--on' : 'mod-slot-status--off';
            const statusText  = mod.active ? T.active : T.inactive;
            const manifest    = ModManager.manifestFor(mod);
            const workshopId  = ModManager.workshopIdOf(mod);

            const labels = {
                toggle: T.toggle, moveUp: T.moveUp, moveDown: T.moveDown,
                publish: workshopId ? T.update : T.publish,
                openPage: T.openPage, unsubscribe: T.unsubscribe, browse: T.browse
            };
            const actionsHTML = this._actions().map((key, i) => {
                const sel = this._activeSection === 'actions' && i === this._selectedActionIndex;
                return `<button class="inspect-btn${sel ? ' selected' : ''}" data-action="${key}">${labels[key]}</button>`;
            }).join('');

            const row = (label, value) => value === undefined || value === null || value === '' ? '' : `
                        <div class="inspect-spec-row">
                            <span class="inspect-spec-label">${label}</span>
                            <span class="inspect-spec-value">${esc(value)}</span>
                        </div>`;
            const st = ModManager.workshopStatus ? ModManager.workshopStatus(mod) : null;
            const stText = !st ? '' : st.status === 'downloading'
                ? T.statusDownloading.replace('{pct}', Math.round(st.progress * 100))
                : T['status' + st.status.charAt(0).toUpperCase() + st.status.slice(1)];
            const busy = this._busy && this._busy.name === mod.name
                ? `<div class="inspect-spec-row"><span class="inspect-spec-value" id="mod-busy">${T.publishing.replace('{pct}', Math.round(this._busy.progress * 100))}</span></div>`  // i18n-ignore  markup
                : '';

            return `
                <div class="item-inspect">
                    <div class="inspect-header">
                        <div class="inspect-title-box">
                            <div class="inspect-name">${esc(ModManager.displayName(mod))}</div>
                            <div class="inspect-rarity ${statusCls}">${sourceLabel}, ${statusText}</div>
                        </div>
                    </div>
                    <div class="inspect-lore">${manifest.description ? `
                        <div class="inspect-spec-row"><span class="inspect-spec-value">${esc(manifest.description)}</span></div>` : ''}${row(T.author, manifest.author)}${row(T.version, manifest.version)}${row(T.status, stText)}${row(T.workshopId, workshopId)}${busy}
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
                    this._runAction(btn.dataset.action);
                });
            });
        }
    }

    window.Scene_ModManager = Scene_ModManager;

})();
