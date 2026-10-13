/*:
 * @target MZ
 * @plugindesc Character Switch Equip Menu UI v1.6.0
 * @author Omni-Lex
 * @version 1.6.0
 * @description DOM scene layer for ItemSystemEquipment. Must be listed AFTER ItemSystemEquipment.js.
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help ItemSystemEquipmentUI.js
 *
 * Reads window.EquipI18n and window.EquipParams exposed by ItemSystemEquipment.js.
 */

(() => {
    'use strict';

    const i18n           = window.EquipI18n;
    const enableSwitching = window.EquipParams.enableSwitching;
    const switchSound     = window.EquipParams.switchSound;

    // The one stat an item's card and slot badge advertise: its first positive
    // param, named with the character sheet's short labels (params 2..7 are
    // STR CON INT WIS DEX PSI), never the engine's ATK / DEF.
    const PARAM_SHORT_KEYS = { 2: 'str', 3: 'con', 4: 'int', 5: 'wis', 6: 'dex', 7: 'psi' };
    const itemStatBadgeText = (item) => {
        if (!item || !item.params) return '';
        const t = i18n[ConfigManager.language || 'en'] || i18n['en'];
        for (let i = 2; i <= 7; i++) {
            if (item.params[i] > 0) {
                const key = PARAM_SHORT_KEYS[i];
                const label = (t.short && t.short[key]) || key.toUpperCase();
                return `+${item.params[i]} ${label}`;
            }
        }
        return '';
    };

    // ── Stat tooltip ──────────────────────────────────────────────────────────
    // The same card the character sheet shows when a stat box is hovered
    // (CharacterCreationDossier.onStatHover): one shared #cc-item-tooltip
    // element, its prose read off the shared CharCreate.statInfo bank so both
    // screens explain a stat with the same words.
    const equipT = (key, fallback) => {
        if (typeof T === 'function') {
            try {
                if (T.has && T.has(key)) {
                    const res = T(key);
                    if (typeof res === 'string' && res.trim() && res !== key) return res;
                }
            } catch (e) {}
        }
        return fallback != null ? fallback : '';
    };

    const statTooltipEl = () => {
        let el = document.getElementById('cc-item-tooltip');
        if (!el) {
            el = document.createElement('div');
            el.id = 'cc-item-tooltip';
            el.className = 'cc-item-tooltip';
            document.body.appendChild(el);
        }
        return el;
    };

    const showStatTooltip = (event, statKey, label) => {
        const desc = equipT('CharCreate.statInfo.' + statKey, '');
        if (!desc) return;
        const el = statTooltipEl();
        el.innerHTML = `
            <div class="cc-item-tooltip-header">
                <span class="cc-item-tooltip-title">${escapeHtml(label)}</span>
            </div>
            <div class="cc-item-tooltip-desc">${desc}</div>`;
        el.style.display = 'block';
        el.style.left = `${Math.min(window.innerWidth - 330, (event.clientX || 100) + 16)}px`;
        el.style.top  = `${Math.min(window.innerHeight - 180, (event.clientY || 100) + 16)}px`;
    };

    const hideStatTooltip = () => {
        const el = document.getElementById('cc-item-tooltip');
        if (el) el.style.display = 'none';
    };

    const escapeHtml = (text) =>
        String(text === undefined || text === null ? '' : text).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );

    // Database names are stored in English and only window text is localized
    // on its way to the bitmap, so a name headed for this DOM is translated here.
    const dbName = (obj) => {
        const raw = (obj && obj.name) || '';
        return (raw && typeof window.translateText === 'function') ? window.translateText(raw) : raw;
    };

    // The heading a piece is filed under on the bench: its weapon type, or its
    // armour type when it has one, falling back to the slot type it fills.
    const equipGroupOf = (item) => {
        if (!item || item.isRemoveOption) return '';
        const tr = (s) => (window.translateText ? window.translateText(String(s)) : String(s));
        if (DataManager.isWeapon(item)) {
            const n = ($dataSystem.weaponTypes || [])[item.wtypeId];
            if (n) return tr(n);
        } else if (DataManager.isArmor(item)) {
            const n = ($dataSystem.armorTypes || [])[item.atypeId];
            if (n) return tr(n);
            const e = ($dataSystem.equipTypes || [])[item.etypeId];
            if (e) return tr(e);
        }
        return tr(T('Equip.otherGroup'));
    };

    // ── Shared character-switcher hint helper (idempotent across plugins) ──────
    // Shows controller bumper hints (L / R) around a .companion-tabs-row when a
    // gamepad is connected, or a single TAB hint otherwise. Also installs a Tab
    // keyboard shortcut that cycles characters only while no controller is
    // connected (the bumpers / pageup-pagedown handle it when one is).
    // The companion tab strip is drawn by window.CharSwitcher, which UI/CustomSceneStatus.js
    // owns. This file used to carry its own copy of it behind an
    // `if (!window.CharSwitcher)` guard, along with six other plugins: only the
    // first one loaded ever ran, so a fix made in any of the others did nothing.

    // =============================================================================
    // Scene_Equip – lifecycle
    // =============================================================================

    const _Scene_Equip_create = Scene_Equip.prototype.create;
    Scene_Equip.prototype.create = function () {
        _Scene_Equip_create.call(this);

        // Hide standard RMMZ windows
        if (this._helpWindow)    { this._helpWindow.deactivate();    this._helpWindow.hide();    }
        if (this._statusWindow)  { this._statusWindow.deactivate();  this._statusWindow.hide();  }
        if (this._commandWindow) { this._commandWindow.deactivate(); this._commandWindow.hide(); }
        if (this._slotWindow)    { this._slotWindow.deactivate();    this._slotWindow.hide();    }
        if (this._itemWindow)    { this._itemWindow.deactivate();    this._itemWindow.hide();    }

        this._currentActorIndex = $gameParty.allMembers().indexOf(this._actor);
        this._memberIndex       = 0;
        this._activeArea        = 'grid'; // 'paperdoll' | 'grid' | 'tabs' | 'commands' | 'back' | 'detail_btn'
        this._commandIndex      = 0;      // 0: Optimize, 1: Random, 2: Clear
        this._tabIndex          = 0;      // equipment category tabs index
        this._detailBtnIndex    = 0;      // 0: Equip/Unequip, 1: Back
        this._slotIndex         = 0;
        this._gridIndex         = 0;
        this._inventoryIndex    = 0;
        this._viewMode          = 'paperdoll'; // 'paperdoll' | 'detail'
        this._activeTab         = 'all';
        this._inspectedItem     = null;
        this._inspectedSlotIdx  = -1;
        // Clicking an empty slot does not open a blank detail page: it narrows
        // the bench on the right to the pieces that actually fit there. -1 is
        // "no slot asked", any slot id is the filter in force.
        this._slotFilterIdx     = -1;
        this._draggedItem       = null;
        this._dragSource        = null;

        // WASD needs no listener of its own: Input.keyMapper already reads the
        // four keys as the four directions, with the one repeat rule.

        if (enableSwitching) {
            window.CharSwitcher.installTabKey(this, (dir) => {
                if (dir > 0) this.switchToNextCharacter();
                else this.switchToPreviousCharacter();
            });
        }

        this.initUIEquip();
        this._refreshDOM();
    };

    Scene_Equip.prototype.update = function () {
        // The full screen viewer owns the screen while it is open: its own key
        // guard eats Escape, a pad's A or B closes it here, and the bench reads
        // nothing else until it is gone.
        const inspect = window.ItemInspect;
        if (inspect && inspect.isModelFullscreenOpen && inspect.isModelFullscreenOpen()) {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || Input.isTriggered('escape')) {
                SoundManager.playCancel();
                inspect.closeModelFullscreen();
            }
            Scene_MenuBase.prototype.update.call(this);
            return;
        }
        this.updateUIEquipInput();
        Scene_MenuBase.prototype.update.call(this);
    };

    Scene_Equip.prototype.terminate = function () {
        if (window.ItemInspect && window.ItemInspect.closeModelFullscreen) window.ItemInspect.closeModelFullscreen();
        window.CharSwitcher.removeTabKey(this);
        hideStatTooltip();
        this.cleanup3DWeaponPreview();
        const container = document.getElementById('equip-container');
        if (container) container.remove();
        Scene_MenuBase.prototype.terminate.call(this);
    };

    // =============================================================================
    // 3D weapon preview
    // =============================================================================
    // The viewer itself is a shared service (window.Weapon3DPreview): one entry,
    // one canvas, orbit / pan / zoom, with the model's own gears, ropes and runes
    // ticking exactly as they do in battle. Any other menu that wants to show a
    // piece in 3D (the main menu's search page, the backpack's inspect card)
    // mounts the same viewer rather than growing a second copy of this loop.
    //
    // It is called Weapon3DPreview because weapons were the first thing it
    // showed, but it takes ANY database entry now: a weapon is built by
    // WeaponSystemProcedural, an item or an armour by ItemModelSystem
    // (ItemSystem/ItemSystemUtils.js). Nothing else about the viewport changes,
    // so a potion turns on the counter the way a sword does.
    if (!window.Weapon3DPreview) {
        window.Weapon3DPreview = (() => {

            // The renderers are kept between previews, the way the battle and
            // the hyperdeck keep theirs: every settled cursor step used to build
            // a fresh WebGL context and throw it away again, recompiling every
            // PSX program each time. A renderer draws offscreen and its picture
            // is copied onto the caller's own canvas, so the canvas a menu laid
            // out (and bound its own clicks to) stays the one on the page. Each
            // live preview holds one renderer to itself; a couple are kept idle
            // for the next one and any more are released as before, so the
            // browser's cap on live contexts never reaches the game's own.
            const IDLE_RENDERERS_KEPT = 2;
            const _idleRenderers = [];

            function contextAlive(renderer) {
                try {
                    const gl = renderer.getContext();
                    return !!gl && !(gl.isContextLost && gl.isContextLost());
                } catch (e) { return false; }
            }

            function acquireRenderer() {
                while (_idleRenderers.length) {
                    const kept = _idleRenderers.pop();
                    if (contextAlive(kept)) return kept;
                    // A lost context (driver reset) never comes back: drop it.
                    try { kept.dispose(); } catch (e) { /* already gone */ }
                }
                const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
                // Render at 1:1 device pixels. This is a small pane beside a
                // page of text, and the hi-DPI multiplier (up to four times the
                // fragment work on a Retina screen) is the single biggest cost
                // here and buys almost nothing visually - the same call the
                // codex's specimen viewer settled on. The equip bench puts two
                // of these up at once, beside the game's own render loop.
                renderer.setPixelRatio(1);
                return renderer;
            }

            function releaseRenderer(renderer) {
                if (!renderer) return;
                if (_idleRenderers.length < IDLE_RENDERERS_KEPT && contextAlive(renderer)) {
                    _idleRenderers.push(renderer);
                    return;
                }
                // dispose() releases this renderer's GPU resources but leaves the
                // WebGL context itself alive. The browser caps how many contexts
                // may live at once and force-loses the OLDEST once the cap is
                // passed: that is the game's own canvas, after which PIXI
                // silently stops rendering and the picture freezes for the rest
                // of the session. A renderer that is not kept is released here.
                try { renderer.dispose(); } catch (e) { /* already gone */ }
                try { if (renderer.forceContextLoss) renderer.forceContextLoss(); } catch (e) {}
            }

            // Build one viewport on `canvas` for `item`. Returns a record the
            // caller keeps and later hands back to disposeAll(), or null when
            // three.js is missing or the canvas is not in the document.
            function mount(canvas, item) {
                if (typeof THREE === 'undefined' || !canvas || !item) return null;

                const rect   = canvas.getBoundingClientRect();
                const width  = rect.width  || 140;
                const height = rect.height || 380;

                const picture = canvas.getContext('2d');
                if (!picture) return null;
                const renderer = acquireRenderer();
                renderer.setSize(width, height, false);
                // The canvas is sized the way the renderer used to size it when
                // it drew straight onto it, so the pane's layout is unchanged.
                canvas.width  = Math.floor(width);
                canvas.height = Math.floor(height);
                canvas.style.width  = width + 'px';
                canvas.style.height = height + 'px';
                let disposed = false;

                const scene = new THREE.Scene();
                scene.add(new THREE.AmbientLight(0xffffff, 0.95));
                const dl1 = new THREE.DirectionalLight(0xffffff, 0.7); dl1.position.set(3, 5, 4);   scene.add(dl1);
                const dl2 = new THREE.DirectionalLight(0xffffff, 0.4); dl2.position.set(-3, -5, -4); scene.add(dl2);

                const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50);
                camera.position.set(0, 0, 2.7);

                let model = null;

                // Posing and framing is ItemModelSystem.framePreview: the piece
                // is turned to its presentation angle FIRST and the silhouette
                // that gives is fitted to this pane, so everything is centred,
                // whole and about the same size whatever shape it is, and
                // however tall or wide the canvas happens to be.
                const setupModelPosition = (m) => {
                    // A model loaded after the stand was taken down is freed
                    // at once: the renderer it would have drawn on is kept.
                    if (disposed) {
                        if (window.disposeWeaponObject3D) window.disposeWeaponObject3D(m);
                        return;
                    }
                    const framed = window.ItemModelSystem &&
                        window.ItemModelSystem.framePreview(m, {
                            distance: camera.position.z,
                            fov: camera.fov,
                            aspect: camera.aspect
                        });
                    if (!framed) {
                        // Nothing to measure: centre it on the stand rather
                        // than leaving it wherever the builder put it.
                        const box = new THREE.Box3().setFromObject(m);
                        m.position.sub(box.getCenter(new THREE.Vector3()));
                    }
                    if (window.PSXShader) window.PSXShader.applyToObject(m);
                    scene.add(m);
                    model = m;
                };

                // Some empty hands are the authored rig rather than a built
                // fist (WeaponSystemProcedural.previewRigFor): the stand shows
                // the same pair of fists the battle holds, idling in their own
                // clip. The rig comes out of the battle's pool and goes back to
                // it when the stand is taken down.
                const WSP = window.WeaponSystemProcedural;
                const rigSpec = (item.wtypeId !== undefined && WSP && WSP.previewRigFor)
                    ? WSP.previewRigFor(item) : null;
                const buildModel = () => {
                    const isWeapon = item.wtypeId !== undefined;
                    const pModel = isWeapon
                        ? (window.WeaponSystemProcedural && WeaponSystemProcedural.createModel(item))
                        : (window.ItemModelSystem && window.ItemModelSystem.createModel(item));
                    if (pModel) setupModelPosition(pModel);
                };

                // Started once the preview's record exists: a warm pool answers
                // in the same call, before the record below has been declared.
                let startRig = null;
                if (rigSpec && THREE.GLTFLoader) {
                    startRig = () => WSP.acquireRig(rigSpec, (entry) => {
                        if (previewEntry.disposed) { WSP.releaseRig(rigSpec, entry); return; }
                        if (!entry) { buildModel(); return; }
                        if (WSP.tintRig) WSP.tintRig(entry, item.unarmedArchetype);
                        const root = entry.scene;
                        const mixer = new THREE.AnimationMixer(root);
                        const rig = {
                            mixer, spec: rigSpec, entry, down: false,
                            clips: WSP.rigActionsFor(mixer, entry.animations)
                        };
                        // A one-shot (the SWITCH lowering or raising the hands)
                        // hands back to the idle, unless they were put away.
                        mixer.addEventListener('finished', () => {
                            if (!rig.down) WSP.playPreviewRig(rig, rigSpec.framePose, true);
                        });
                        // Turned the way the battle holds them, and pivoted on
                        // the fists so dragging turns the hands, not the elbows.
                        const pivot = new THREE.Group();
                        root.position.set(0, 0, 0);
                        root.scale.set(1, 1, 1);
                        const r = rigSpec.rotation;
                        root.rotation.set(
                            THREE.MathUtils.degToRad(r.x),
                            THREE.MathUtils.degToRad(r.y),
                            THREE.MathUtils.degToRad(r.z));
                        pivot.add(root);
                        WSP.playPreviewRig(rig, rigSpec.framePose, true);
                        mixer.update(0);
                        const hands = WSP.handBoundsOf(pivot);
                        const size = hands.getSize(new THREE.Vector3());
                        root.position.sub(hands.getCenter(new THREE.Vector3()));
                        pivot.scale.setScalar(1.2 / Math.max(size.x, size.y, size.z, 1e-6));
                        pivot.userData.rigPreview = rig;
                        previewEntry.rig = rig;
                        scene.add(pivot);
                        model = pivot;
                        WSP.playPreviewRig(rig, 'Equip', false);
                    });
                } else if (item.model3d && THREE.GLTFLoader) {
                    new THREE.GLTFLoader().load(
                        `models/${item.model3d}`,
                        (gltf) => setupModelPosition(gltf.scene),
                        undefined,
                        (err) => console.error('[Weapon3DPreview] Failed to load model:', item.model3d, err)
                    );
                } else {
                    // A weapon is built by the weapon pipeline, anything else by
                    // the item one. Both hand back a plain THREE.Group, so the
                    // rest of the viewport does not care which answered.
                    buildModel();
                }

                let activeButton  = -1;
                let prevPosition  = { x: 0, y: 0 };
                let isDragging    = false;
                const ROTATE_SPEED = 0.01;

                const onStart = (e) => {
                    if (e.button === 0 || e.button === 1) {
                        activeButton = e.button;
                        isDragging   = true;
                        prevPosition = { x: e.clientX, y: e.clientY };
                        if (e.button === 1) e.preventDefault();
                    }
                };
                // The left button turns the piece in the hand, which is what one
                // wants of a weapon on a counter. Sliding the view across it is
                // the wheel button's job, so an ordinary drag never loses the
                // piece off the edge of the pane.
                const onMove = (e) => {
                    if (activeButton === -1) return;
                    const dx = e.clientX - prevPosition.x;
                    const dy = e.clientY - prevPosition.y;
                    if (activeButton === 1) {
                        const panSpeed = 0.002 * camera.position.z;
                        camera.position.x -= dx * panSpeed;
                        camera.position.y += dy * panSpeed;
                    } else if (model) {
                        model.rotation.y += dx * ROTATE_SPEED;
                        model.rotation.x += dy * ROTATE_SPEED;
                    }
                    prevPosition = { x: e.clientX, y: e.clientY };
                };
                const onEnd = (e) => {
                    if (e.button === activeButton || e.type === 'mouseup') {
                        activeButton = -1;
                        isDragging   = false;
                    }
                };
                const onAuxClick = (e) => { if (e.button === 1) e.preventDefault(); };
                const onWheel    = (e) => {
                    e.preventDefault();
                    camera.position.z = Math.max(0.4, Math.min(5.0, camera.position.z + e.deltaY * 0.001));
                };

                const onTouchStart = (e) => {
                    if (e.touches.length === 1) {
                        isDragging   = true;
                        activeButton = 0;
                        prevPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    }
                };
                // A finger turns the piece too: there is no wheel button to pan with.
                const onTouchMove = (e) => {
                    if (e.touches.length === 1) {
                        const dx = e.touches[0].clientX - prevPosition.x;
                        const dy = e.touches[0].clientY - prevPosition.y;
                        if (model) {
                            model.rotation.y += dx * ROTATE_SPEED;
                            model.rotation.x += dy * ROTATE_SPEED;
                        }
                        prevPosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    }
                };
                const onTouchEnd = () => { isDragging = false; activeButton = -1; };

                canvas.addEventListener('mousedown',   onStart);
                canvas.addEventListener('mousemove',   onMove);
                window.addEventListener('mouseup',     onEnd);
                canvas.addEventListener('wheel',       onWheel, { passive: false });
                canvas.addEventListener('auxclick',    onAuxClick);
                canvas.addEventListener('contextmenu', (e) => e.preventDefault());
                canvas.addEventListener('touchstart',  onTouchStart);
                canvas.addEventListener('touchmove',   onTouchMove);
                window.addEventListener('touchend',    onTouchEnd);

                // One preview record per weapon; holds this loop's latest rAF id so
                // cleanup can cancel it (instead of pushing a new id every frame into
                // a shared, unbounded array).
                const previewEntry = {
                    renderer, canvas, camera,
                    listeners: { mousedown: onStart, mousemove: onMove, mouseup: onEnd, wheel: onWheel,
                                 auxclick: onAuxClick, touchstart: onTouchStart, touchmove: onTouchMove, touchend: onTouchEnd },
                    rafId: 0
                };
                if (startRig) startRig();

                // A piece put away while it is still folding (the vector gun's
                // SWITCH) plays the rest of its fold beside its replacement.
                const ghosts = [];

                // The renderer outlives this stand, so the piece's own buffers
                // and textures are freed by hand: losing the context used to do
                // it. A rig is the battle pool's and disposeAll hands it back.
                previewEntry.disposeScene = () => {
                    disposed = true;
                    const drop = (m) => {
                        scene.remove(m);
                        if (window.disposeWeaponObject3D) window.disposeWeaponObject3D(m);
                    };
                    if (model && !(model.userData && model.userData.rigPreview)) drop(model);
                    ghosts.forEach(drop);
                    ghosts.length = 0;
                    model = null;
                    previewEntry.model = null;
                };
                /**
                 * Builds `next` in THIS viewport in place of the piece on it,
                 * with no new WebGL context, canvas or camera: the vector gun's
                 * screen folds one shape into another here, and a remount
                 * flashed an empty pane and threw the camera back mid-morph.
                 * @returns {?THREE.Object3D} the new model, or null when it
                 *   cannot be swapped in place (a rig or a GLB: remount then)
                 */
                previewEntry.swap = (next) => {
                    if (previewEntry.disposed || previewEntry.rig || !model || !next) return null;
                    if (next.model3d || next.wtypeId === undefined || !WSP) return null;
                    if (WSP.previewRigFor && WSP.previewRigFor(next)) return null;
                    const built = WSP.createModel(next);
                    if (!built) return null;
                    const old = model;
                    if (old._vectorSwitch) {
                        ghosts.push(old);
                    } else {
                        scene.remove(old);
                        if (window.disposeWeaponObject3D) window.disposeWeaponObject3D(old);
                    }
                    setupModelPosition(built);
                    previewEntry.model = built;
                    return built;
                };

                // Scratch objects reused every frame to avoid per-frame allocations.
                const _scratchDeltaRot = new THREE.Euler();
                const _scratchDeltaPos = new THREE.Vector3();

                // Capped to ~30fps for the same reason: the piece turning on the
                // stand is drawn alongside the map's own loop, and at the
                // screen's full rate it competes with it for no visible gain.
                // The whole frame's worth of time is handed to the tick when it
                // does run, so everything on the model moves at its own speed.
                const PREVIEW_FRAME_MS = 1000 / 30;
                // The first frame is drawn right away, inside mount, so the
                // shader compile and texture upload land in the menu's opening
                // instead of in a later frame of whatever runs next.
                let _frameAcc = PREVIEW_FRAME_MS;
                let _previewLastTime = performance.now();
                // A caller that tears its page down without disposeAll would
                // leave this loop drawing a detached canvas forever, out on the
                // map too. Once the canvas has been on the page and is gone,
                // the preview lets itself go.
                let _wasConnected = false;
                const animate = () => {
                    if (canvas.isConnected) {
                        _wasConnected = true;
                    } else if (_wasConnected) {
                        if (!previewEntry.disposed) disposeAll([previewEntry]);
                        return;
                    }
                    previewEntry.rafId = requestAnimationFrame(animate);

                    const now = performance.now();
                    _frameAcc += Math.min(now - _previewLastTime, 50);
                    _previewLastTime = now;
                    // A vector gun folding on the stand is drawn at the full
                    // rate: at 30fps its panels step instead of swinging.
                    const folding = !!(model && model._vectorSwitch) || ghosts.length > 0;
                    if (!folding && _frameAcc < PREVIEW_FRAME_MS) return;
                    const deltaMs = _frameAcc;
                    _frameAcc = 0;

                    if (model) {
                        if (!model.userData._prevRot) {
                            model.userData._prevRot = model.rotation.clone();
                            model.userData._prevPos = model.position.clone();
                        }
                        const deltaRot = _scratchDeltaRot.set(
                            model.rotation.x - model.userData._prevRot.x,
                            model.rotation.y - model.userData._prevRot.y,
                            model.rotation.z - model.userData._prevRot.z
                        );
                        const deltaPos = _scratchDeltaPos.copy(model.position).sub(model.userData._prevPos);
                        model.userData._prevRot.copy(model.rotation);
                        model.userData._prevPos.copy(model.position);

                        if (window.WeaponSystemProcedural &&
                            (deltaRot.x !== 0 || deltaRot.y !== 0 || deltaRot.z !== 0 ||
                             deltaPos.x !== 0 || deltaPos.y !== 0 || deltaPos.z !== 0)) {
                            const ropes = [];
                            if (model.userData._verletRope)  ropes.push(model.userData._verletRope);
                            if (model.userData._verletRopes) model.userData._verletRopes.forEach(r => ropes.push(r));
                            if (ropes.length > 0) {
                                model.updateMatrixWorld(true);
                                const worldAnchor = new THREE.Vector3(0, 0, 0).applyMatrix4(model.matrixWorld);
                                for (const rope of ropes) {
                                    for (const p of rope.points) {
                                        if (p.pinned) continue;
                                        const oldPos = p.pos.clone();
                                        p.pos.add(deltaPos);
                                        p.prev.add(deltaPos);
                                        const rotateAround = (point, anchor, euler) => {
                                            const dir = point.clone().sub(anchor);
                                            dir.applyEuler(euler);
                                            point.copy(anchor).add(dir);
                                        };
                                        rotateAround(p.pos,  worldAnchor, deltaRot);
                                        rotateAround(p.prev, worldAnchor, deltaRot);
                                        const rigidDisp = p.pos.clone().sub(oldPos);
                                        const lag = 0.55 * (rope.points.indexOf(p) / rope.points.length);
                                        p.pos.sub(rigidDisp.multiplyScalar(lag));
                                    }
                                }
                            }
                        }
                    }

                    // The model on the stand, published on the record so a menu
                    // can play something on the piece itself: the vector gun's
                    // screen folds the one it is showing into its other shape.
                    previewEntry.model = model;
                    if (previewEntry.rig) previewEntry.rig.mixer.update(deltaMs / 1000);

                    if (model && window.WeaponSystemProcedural) {
                        // Gears, drifting shards and pulsing runes declared by the
                        // model itself, same as in battle.
                        WeaponSystemProcedural.tickModelParts(model, deltaMs);
                        // A reconstruction, when one has been started on it: the
                        // call is free on a model that is not coming apart.
                        if (WeaponSystemProcedural.tickVectorSwitch) {
                            WeaponSystemProcedural.tickVectorSwitch(model, deltaMs);
                            for (let i = ghosts.length - 1; i >= 0; i--) {
                                const ghost = ghosts[i];
                                WeaponSystemProcedural.tickVectorSwitch(ghost, deltaMs);
                                if (ghost._vectorSwitch) continue;
                                scene.remove(ghost);
                                if (window.disposeWeaponObject3D) window.disposeWeaponObject3D(ghost);
                                ghosts.splice(i, 1);
                            }
                        }
                        const ropes = [];
                        if (model.userData._verletRope)  ropes.push(model.userData._verletRope);
                        if (model.userData._verletRopes) model.userData._verletRopes.forEach(r => ropes.push(r));
                        if (ropes.length > 0) {
                            model.updateMatrixWorld(true);
                            const invWorld = model.matrixWorld.clone().invert();
                            const dtSec   = deltaMs / 1000;
                            const worldScale = model.scale.x || 1;
                            for (const rope of ropes) {
                                const worldAnchor = rope.anchorPos.clone().applyMatrix4(model.matrixWorld);
                                WeaponSystemProcedural.tickRope(rope, dtSec, worldAnchor, worldScale);
                                WeaponSystemProcedural.updateRopeMeshes(rope, invWorld);
                            }
                        }
                    }

                    if (window.PSXShader) {
                        window.PSXShader.render(renderer, scene, camera);
                    } else {
                        renderer.render(scene, camera);
                    }
                    // Copied in the same task as the draw, while the offscreen
                    // buffer still holds it.
                    picture.clearRect(0, 0, canvas.width, canvas.height);
                    picture.drawImage(renderer.domElement, 0, 0);
                };
                animate();

                return previewEntry;
            }

            function disposeAll(entries) {
                if (!entries) return;
                entries.forEach(p => {
                    // Taken down once only: a second pass would hand the same
                    // renderer back to the idle pool twice.
                    if (!p || p.disposed) return;
                    if (p.rafId) cancelAnimationFrame(p.rafId);
                    p.disposed = true;
                    // A rig on the stand belongs to the battle's pool: it is
                    // let go of, never freed.
                    if (p.rig && window.WeaponSystemProcedural) {
                        const rig = p.rig;
                        p.rig = null;
                        rig.mixer.stopAllAction();
                        rig.mixer.uncacheRoot(rig.entry.scene);
                        if (rig.entry.scene.parent) rig.entry.scene.parent.remove(rig.entry.scene);
                        WeaponSystemProcedural.releaseRig(rig.spec, rig.entry);
                    }
                    if (p.disposeScene) p.disposeScene();
                    releaseRenderer(p.renderer);
                    p.canvas.removeEventListener('mousedown',  p.listeners.mousedown);
                    p.canvas.removeEventListener('mousemove',  p.listeners.mousemove);
                    window.removeEventListener('mouseup',      p.listeners.mouseup);
                    p.canvas.removeEventListener('wheel',      p.listeners.wheel);
                    p.canvas.removeEventListener('touchstart', p.listeners.touchstart);
                    p.canvas.removeEventListener('touchmove',  p.listeners.touchmove);
                    window.removeEventListener('touchend',     p.listeners.touchend);
                    // A clean canvas node goes in for the next preview, so the
                    // listeners a menu bound to this one go with it.
                    if (p.canvas && p.canvas.parentNode) {
                        p.canvas.parentNode.replaceChild(p.canvas.cloneNode(false), p.canvas);
                    }
                });
            }

            return { mount, disposeAll };
        })();
    }

    // The thing a preview card should draw for a held piece, or null when it is
    // not something held at all.
    function previewModelFor(item) {
        if (!item) return null;
        if (DataManager.isWeapon(item)) return item;
        if (item.etypeId === 2 && window.WeaponSystemProcedural) {
            return window.WeaponSystemProcedural.shieldWeaponFor(item);
        }
        return null;
    }

    // Published alongside mount() so every menu that shows a weapon asks ONE
    // question of one place: the shop counter and the forge would otherwise
    // each decide for themselves what counts as a thing with a model, and a
    // shield -- which has no model of its own and is built through the weapon
    // pipeline by WeaponSystemProcedural.shieldWeaponFor -- is exactly the case
    // a second copy gets wrong. Attached outside the block that builds the
    // service, so it is there whichever plugin happened to create it.
    window.Weapon3DPreview.modelFor = previewModelFor;

    // A preview card is a weapon model built from scratch by the procedural
    // pipeline, and there are two of them. Walking the bench with a held key
    // would ask for a pair per step, so the pieces are only put on the stand
    // once the cursor comes to rest.
    const PREVIEW_SETTLE_MS = 90;

    Scene_Equip.prototype.init3DWeaponPreview = function () {
        this.cleanup3DWeaponPreview();
        if (this._viewMode !== 'detail' || !this._inspectedItem) return;

        this._previewItem = this._inspectedItem;
        const modelItem = previewModelFor(this._inspectedItem) || this._inspectedItem;
        this._previewTimer = setTimeout(() => {
            this._previewTimer = 0;
            this._previewRenderers = [];
            const canvas = document.getElementById('weapon-preview-canvas-inspect');
            if (!canvas) return;
            const entry = window.Weapon3DPreview.mount(canvas, modelItem);
            if (entry) this._previewRenderers.push(entry);
            this._bindPreviewFullscreen(canvas, this._inspectedItem);
        }, PREVIEW_SETTLE_MS);
    };

    // A click on the preview opens the piece full screen, the backpack's own
    // viewer. The same square is dragged to turn the model, so only a press
    // that did not travel counts as a click.
    Scene_Equip.prototype._bindPreviewFullscreen = function (canvas, item) {
        if (!canvas || !item || !window.ItemInspect || !window.ItemInspect.showModelFullscreen) return;
        let downAt = null;
        canvas.addEventListener('mousedown', (e) => { if (e.button === 0) downAt = { x: e.clientX, y: e.clientY }; });
        canvas.addEventListener('mouseup', (e) => {
            if (e.button !== 0 || !downAt) { downAt = null; return; }
            const moved = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
            downAt = null;
            if (moved > 6) return;
            const ref = DataManager.isWeapon(item) ? 'weapon' : (DataManager.isArmor(item) ? 'armor' : 'item');
            window.ItemInspect.showModelFullscreen(ref, item.id);
        });
    };

    Scene_Equip.prototype.cleanup3DWeaponPreview = function () {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = 0;
        }
        window.Weapon3DPreview.disposeAll(this._previewRenderers);
        this._previewRenderers = [];
        this._previewItem = null;
    };

    // The page is redrawn for small things (a button lit, a stat refreshed)
    // while the same piece stays on the stand. The canvas already showing it
    // is carried across the redraw instead of building the model again.
    // Returns the canvas to put back, true when the stand is still waiting to
    // be built (it finds the new canvas itself), or null to rebuild.
    Scene_Equip.prototype._keepPreviewAcrossRedraw = function () {
        if (this._viewMode !== 'detail' || !this._inspectedItem) return null;
        if (this._previewItem !== this._inspectedItem) return null;
        if (this._previewTimer) return true;
        const entry = (this._previewRenderers || [])[0];
        if (!entry || entry.disposed || !entry.canvas || !entry.canvas.isConnected) return null;
        return entry.canvas;
    };

    // =============================================================================
    // Actor switching
    // =============================================================================

    // A piece open on the detail page belongs to the character it was opened
    // for: the next one starts on their own paperdoll, never on the previous
    // character's sword with that character's slot index behind its buttons.
    Scene_Equip.prototype._leaveDetailForSwitch = function () {
        if (this._viewMode !== 'detail') return;
        this._viewMode = 'paperdoll';
        this._inspectedItem = null;
        this._inspectedSlotIdx = -1;
        this._detailBtnIndex = 0;
        if (typeof this.cleanup3DWeaponPreview === 'function') this.cleanup3DWeaponPreview();
    };

    Scene_Equip.prototype.switchToPreviousCharacter = function () {
        const party = $gameParty.allMembers();
        if (party.length <= 1) return;
        this._currentActorIndex = (this._currentActorIndex - 1 + party.length) % party.length;
        this._actor = party[this._currentActorIndex];
        if (switchSound) SoundManager.playCursor();
        this._leaveDetailForSwitch();
        this._refreshDOM();
    };

    Scene_Equip.prototype.switchToNextCharacter = function () {
        const party = $gameParty.allMembers();
        if (party.length <= 1) return;
        this._currentActorIndex = (this._currentActorIndex + 1) % party.length;
        this._actor = party[this._currentActorIndex];
        if (switchSound) SoundManager.playCursor();
        this._leaveDetailForSwitch();
        this._refreshDOM();
    };

    // =============================================================================
    // Inventory helpers
    // =============================================================================

    // Who is at the bench. A dummy standing in for a character (the equip
    // preview windows other menus open) carries no id of its own.
    const actorKey = (actor) => (actor && actor.actorId ? actor.actorId() : 0);

    // What the bench is standing on, as one short string: who is being fitted,
    // which slot is open, what they are already wearing and what the party has
    // to offer. Everything the list below is built out of, and nothing the
    // cursor moves.
    Scene_Equip.prototype.benchStamp = function () {
        const actor = this._actor;
        let stamp = `${actorKey(actor)}|${this._slotIndex}|`;
        if (actor) stamp += actor.equips().map(e => (e ? e.id : 0)).join('.');
        stamp += '|';
        const push = (prefix, bag) => {
            if (!bag) return;
            for (const id in bag) { const n = bag[id]; if (n > 0) stamp += prefix + id + ':' + n + ','; }
        };
        push('w', $gameParty._weapons);
        push('a', $gameParty._armors);
        return stamp;
    };

    // Offering the slot means scanning every weapon and every piece of armour
    // the party owns, asking the character whether each can be worn, and
    // sorting the survivors twice. The right page asks for the list two or
    // three times over while it is built, and it is built again on every
    // cursor step, so the answer is kept until the bench itself moves. Callers
    // read the array; they never write to it.
    Scene_Equip.prototype.getInventoryItemsForSlot = function () {
        const actor   = this._actor;
        const slotId  = this._slotIndex;
        if (slotId < 0) return [];

        const stamp = this.benchStamp();
        if (this._benchListMemo && this._benchListMemo.stamp === stamp) return this._benchListMemo.value;
        const value = this.buildInventoryItemsForSlot();
        this._benchListMemo = { stamp, value };
        return value;
    };

    Scene_Equip.prototype.buildInventoryItemsForSlot = function () {
        const actor   = this._actor;
        const slotId  = this._slotIndex;

        const lang    = ConfigManager.language || 'en';
        const t       = i18n[lang] || i18n['en'];

        let items = [];
        // A hand slot is locked shut while the character has no free hand left
        // to fill it: a two-handed weapon in the other one, an arm lost. There
        // is nothing to offer there until something is put down.
        if (!actor.isEquipChangeOk(slotId)) {
            items.unshift({ name: t.noEquip, id: -1, isRemoveOption: true });
            return items;
        }
        items = actor.slotCandidates(slotId);
        if (window.HandSlots && window.HandSlots.slotKind(actor, slotId)) {
            // Every weapon is equippable now, so weapons this character has no
            // proficiency in are still listed - just pushed below the ones they
            // can actually use. Array#sort is stable, so each group keeps its
            // original order.
            const prof = window.WeaponProficiency;
            if (prof) {
                items.sort((a, b) => prof.compare(actor, a, b));
            }
        }
        // The bench lists like the backpack does: one heading per equipment
        // type, its pieces in alphabetical order underneath. The proficiency
        // sort above only survives as the tag on the row now.
        items.sort((a, b) => {
            const ga = equipGroupOf(a), gb = equipGroupOf(b);
            if (ga !== gb) return ga.localeCompare(gb);
            return String(a.name).localeCompare(String(b.name));
        });
        items.unshift({ name: t.noEquip, id: -1, isRemoveOption: true });
        return items;
    };

    // =============================================================================
    // DOM init (one-time container setup)
    // =============================================================================

    Scene_Equip.prototype.initUIEquip = function () {
        if (!document.getElementById('equip-container')) {
            const container = document.createElement('div');
            container.id    = 'equip-container';
            document.body.appendChild(container);
        }
    };

    // =============================================================================
    // Right-page HTML builder (extracted for selective updates)
    // =============================================================================

    // The stand-in the page tries a piece on, so the numbers beside the real
    // ones are what the character WOULD have. Cloning a Game_Actor serialises
    // its whole object graph, and the page is built again on every cursor step,
    // so one stand-in is kept for as long as it still stands for the same
    // character wearing the same things, and wearing at most the ONE piece
    // being previewed now. A stand-in that already tried something else on is
    // cloned again from the real character first: trying pieces on one after
    // another would otherwise leave every earlier one in place (or a hand
    // emptied by a two-handed one) and the preview would drift.
    //
    // A stand-in never trades with the party: whatever forceChangeEquip or a
    // refresh puts down on it must not land in the real bag.
    const cloneForPreview = (actor) => {
        const copy = JsonEx.makeDeepCopy(actor);
        if (copy) copy.tradeItemWithParty = function () { return true; };
        return copy;
    };

    const trialKey = (slot, item) => (slot >= 0 && item)
        ? `${slot}|${DataManager.isWeapon(item) ? 'w' : 'a'}${item.id}` : '';

    Scene_Equip.prototype.standInActor = function (slot, item) {
        const actor = this._actor;
        const stamp = `${actorKey(actor)}|${actor.equips().map(e => (e ? e.id : 0)).join('.')}|${actor.level || 0}`;
        const trial = (item && actor.equips()[slot] === item) ? '' : trialKey(slot, item);
        if (!this._standIn || this._standInStamp !== stamp
            || (this._standInTrial && this._standInTrial !== trial)) {
            this._standIn      = cloneForPreview(actor);
            this._standInStamp = stamp;
            this._standInTrial = '';
        }
        if (trial && this._standInTrial !== trial) {
            this._standIn.forceChangeEquip(slot, item);
            this._standInTrial = trial;
        }
        return this._standIn;
    };

    // =============================================================================
    // Equipment tabs & items query
    // =============================================================================

    const getWeaponTypeName = (wtypeId) => {
        const key = 'Equip.weaponTypes.' + wtypeId;
        const localized = equipT(key, '');
        if (localized && localized !== key) return localized;
        const wtypes = ($dataSystem && $dataSystem.weaponTypes) || [];
        const raw = wtypes[wtypeId];
        return (raw && window.translateText) ? window.translateText(raw) : (raw || '');
    };

    const getArmorTypeName = (atypeId) => {
        const key = 'Equip.armorTypes.' + atypeId;
        const localized = equipT(key, '');
        if (localized && localized !== key) return localized;
        const atypes = ($dataSystem && $dataSystem.armorTypes) || [];
        const raw = atypes[atypeId];
        return (raw && window.translateText) ? window.translateText(raw) : (raw || '');
    };

    const getEquipTabs = () => {
        const lang = ConfigManager.language || 'en';
        const t    = i18n[lang] || i18n['en'];
        const tabs = [
            { id: 'all', label: t.tabAll || 'All' }
        ];
        const wtypes = ($dataSystem && $dataSystem.weaponTypes) || [];
        for (let i = 1; i < wtypes.length; i++) {
            if (wtypes[i]) {
                const name = (typeof t.weaponTypes === 'object' && t.weaponTypes && typeof t.weaponTypes[i] === 'string' && t.weaponTypes[i].length > 1)
                    ? t.weaponTypes[i]
                    : (getWeaponTypeName(i) || wtypes[i]);
                if (name && name.length > 1) {
                    tabs.push({ id: `w_${i}`, label: name });
                }
            }
        }
        tabs.push({ id: 'shields', label: t.tabShields || 'Shields' });
        tabs.push({ id: 'head', label: t.tabHead || 'Head' });
        tabs.push({ id: 'body', label: t.tabBody || 'Body' });
        tabs.push({ id: 'gear', label: t.tabGear || 'Gear' });

        const atypes = ($dataSystem && $dataSystem.armorTypes) || [];
        for (let j = 1; j < atypes.length; j++) {
            const aname = atypes[j];
            if (aname && aname !== 'Shield' && aname !== 'Equipment') {
                const name = (typeof t.armorTypes === 'object' && t.armorTypes && typeof t.armorTypes[j] === 'string' && t.armorTypes[j].length > 1)
                    ? t.armorTypes[j]
                    : (getArmorTypeName(j) || aname);
                if (name && name.length > 1) {
                    tabs.push({ id: `a_${j}`, label: name });
                }
            }
        }
        return tabs;
    };

    const equipCategoryOf = (item, merged = false) => {
        if (!item) return '';
        if (DataManager.isWeapon(item)) {
            // In the All view every weapon type sits under one header.
            if (merged) {
                const wlang = ConfigManager.language || 'en';
                const wt = i18n[wlang] || i18n['en'];
                return wt.tabWeapons || 'Weapons';
            }
            return getWeaponTypeName(item.wtypeId) || (($dataSystem.weaponTypes || [])[item.wtypeId] || '');
        }
        const lang = ConfigManager.language || 'en';
        const t    = i18n[lang] || i18n['en'];
        if (item.etypeId === 2) return t.tabShields || 'Shields';
        const aname = getArmorTypeName(item.atypeId);
        if (aname && aname.length > 1) return aname;
        if (item.etypeId === 3) return t.tabHead || 'Head';
        if (item.etypeId === 4) return t.tabBody || 'Body';
        return t.tabGear || 'Gear';
    };

    // The bag's weapons and armours as one short string, read off $gameParty's
    // own containers so asking whether anything changed builds no array. Null
    // when the party keeps no such containers (nothing is cached then).
    function equipBagStamp(party) {
        if (!party || !party._weapons || !party._armors) return null;
        let stamp = '';
        for (const id in party._weapons) if (party._weapons[id] > 0) stamp += 'w' + id + ':' + party._weapons[id] + ',';
        for (const id in party._armors)  if (party._armors[id]  > 0) stamp += 'a' + id + ':' + party._armors[id]  + ',';
        return stamp;
    }

    // The bench is asked for on every cursor step, and building it filters and
    // sorts the whole bag. It is kept until the tab, the slot asked about, the
    // character, what they wear, the bag or the language changes.
    Scene_Equip.prototype.getFilteredPartyEquipment = function () {
        const bag = equipBagStamp($gameParty);
        // An empty bag lists what the character could wear instead, which is
        // small and read off them afresh every time.
        if (!bag) return this._buildFilteredPartyEquipment();
        const actor = this._actor || null;
        const slotFilter = this._slotFilterIdx >= 0 ? this._slotFilterIdx : -1;
        const worn = (slotFilter >= 0 && actor && typeof actor.equips === 'function')
            ? actor.equips().map(it => it ? (DataManager.isWeapon(it) ? 'w' : 'a') + it.id : '').join(',')
            : '';
        const key = [this._activeTab || 'all', slotFilter, ConfigManager.language || 'en', worn, bag].join('|');
        const memo = this._benchMemo;
        if (memo && memo.key === key && memo.party === $gameParty && memo.actor === actor &&
            memo.candidates === (actor && actor.slotCandidates)) {
            return memo.list.slice();
        }
        const list = this._buildFilteredPartyEquipment();
        this._benchMemo = { key, party: $gameParty, actor, candidates: actor && actor.slotCandidates, list };
        return list.slice();
    };

    Scene_Equip.prototype._buildFilteredPartyEquipment = function () {
        // An id the database no longer has comes back from the bag as undefined.
        let weapons = (($gameParty && typeof $gameParty.weapons === 'function') ? $gameParty.weapons() : []).filter(Boolean);
        let armors  = (($gameParty && typeof $gameParty.armors === 'function')  ? $gameParty.armors()  : []).filter(Boolean);
        if (weapons.length === 0 && armors.length === 0 && $gameParty && typeof $gameParty.equipItems === 'function') {
            const all = $gameParty.equipItems().filter(Boolean);
            weapons = all.filter(it => DataManager.isWeapon(it));
            armors = all.filter(it => DataManager.isArmor(it));
        }
        if (weapons.length === 0 && armors.length === 0 && this._actor && typeof this._actor.slotCandidates === 'function') {
            const slots = this._actor.equipSlots();
            slots.forEach((_, s) => {
                const cands = this._actor.slotCandidates(s) || [];
                cands.forEach(it => {
                    if (DataManager.isWeapon(it) && !weapons.includes(it)) weapons.push(it);
                    if (DataManager.isArmor(it) && !armors.includes(it)) armors.push(it);
                });
            });
        }
        const tab = this._activeTab || 'all';

        let list = [];
        if (tab === 'all') {
            list = weapons.concat(armors);
        } else if (tab.startsWith('w_')) {
            const wt = parseInt(tab.slice(2));
            list = weapons.filter(w => w && w.wtypeId === wt);
        } else if (tab === 'shields') {
            list = armors.filter(a => a && (a.etypeId === 2 || (a.atypeId && String(($dataSystem.armorTypes || [])[a.atypeId] || '').toLowerCase().includes('shield'))));
        } else if (tab === 'head') {
            list = armors.filter(a => a && a.etypeId === 3);
        } else if (tab === 'body') {
            list = armors.filter(a => a && a.etypeId === 4);
        } else if (tab === 'gear') {
            list = armors.filter(a => a && a.etypeId === 5);
        } else if (tab.startsWith('a_')) {
            const at = parseInt(tab.slice(2));
            list = armors.filter(a => a && a.atypeId === at);
        } else {
            list = weapons.concat(armors);
        }

        // An empty slot was asked about: keep only what that slot accepts.
        if (this._slotFilterIdx >= 0 && this._actor && typeof this._actor.slotCandidates === 'function') {
            const allowed = new Set((this._actor.slotCandidates(this._slotFilterIdx) || []).filter(Boolean));
            list = list.filter(it => allowed.has(it));
        }

        const map = new Map();
        list.forEach(item => {
            if (!item) return;
            const key = (item.wtypeId !== undefined ? 'w_' : 'a_') + item.id;
            if (!map.has(key)) {
                map.set(key, item);
            }
        });
        const result = Array.from(map.values());
        if (tab === 'all') {
            const order = new Map();
            result.forEach(it => {
                const cat = equipCategoryOf(it, true);
                if (!order.has(cat)) order.set(cat, order.size);
            });
            result.sort((a, b) => order.get(equipCategoryOf(a, true)) - order.get(equipCategoryOf(b, true)));
        }
        return result;
    };

    // =============================================================================
    // Right Page: the selected member's paperdoll & 3D Detail
    // =============================================================================

    Scene_Equip.prototype.partyMembers = function () {
        const list = ($gameParty && typeof $gameParty.members === 'function')
            ? $gameParty.members()
            : (($gameParty && typeof $gameParty.allMembers === 'function')
                ? $gameParty.allMembers()
                : (this._actor ? [this._actor] : []));
        const filtered = list.filter(Boolean);
        if (this._actor && !filtered.includes(this._actor)) {
            filtered.unshift(this._actor);
        }
        // Every member: the page shows one at a time, and a cap of three left
        // a fourth member's tab drawing someone else's paperdoll.
        return filtered;
    };

    Scene_Equip.prototype._buildSinglePaperdollHTML = function (actor, memberIdx = 0) {
        if (!actor) return '';
        const lang  = ConfigManager.language || 'en';
        const t     = i18n[lang] || i18n['en'];

        const layout = window.HandSlots
            ? window.HandSlots.layout(actor)
            : { hands: 2, mouth: false, slots: 2, head: true, body: true };
        const equipSlots = actor.equipSlots();
        const equips     = actor.equips();

        const headSlotIdx  = equipSlots.indexOf(3);
        const mouthSlotIdx = layout.mouth ? layout.hands : -1;

        // 3 body slots: clothes, robe, and armour (Light/Heavy armor)
        const clothesSlotIdx = equipSlots.findIndex((_, idx) => window.HandSlots && window.HandSlots.slotKind(actor, idx) === 'clothes');
        const robeSlotIdx    = equipSlots.findIndex((_, idx) => window.HandSlots && window.HandSlots.slotKind(actor, idx) === 'robe');
        const armorSlotIdx   = equipSlots.findIndex((_, idx) => window.HandSlots && window.HandSlots.slotKind(actor, idx) === 'armor');

        const bodySlotIndices = [];
        if (clothesSlotIdx >= 0) bodySlotIndices.push(clothesSlotIdx);
        if (robeSlotIdx >= 0)    bodySlotIndices.push(robeSlotIdx);
        if (armorSlotIdx >= 0)   bodySlotIndices.push(armorSlotIdx);
        if (bodySlotIndices.length === 0) {
            equipSlots.forEach((et, idx) => {
                if (et === 4) bodySlotIndices.push(idx);
            });
        }

        const gearSlotIndices = [];
        equipSlots.forEach((et, idx) => {
            if (et === 5 && idx !== headSlotIdx && !bodySlotIndices.includes(idx) && idx >= layout.slots) {
                gearSlotIndices.push(idx);
            }
        });
        const handSlotIndices = [];
        for (let h = 0; h < layout.hands; h++) {
            handSlotIndices.push(h);
        }

        // What each pair of hands actually comes to. A two-handed weapon sits
        // in one slot and ties up a second one, so the second is drawn as the
        // other half of the same grip rather than as an empty hand the player
        // can fill: holdsFor[slot] is the weapon a hand is lending itself to.
        const HS = window.HandSlots;
        const holdsFor = {};
        if (HS && HS.isTwoHanded) {
            const lent = [];
            for (const h of handSlotIndices) {
                if (lent.includes(h)) continue;
                if (!equips[h] || !HS.isTwoHanded(equips[h])) continue;
                const other = handSlotIndices.find(
                    o => o !== h && !equips[o] && !lent.includes(o));
                if (other === undefined) continue;
                holdsFor[other] = equips[h];
                lent.push(other);
            }
        }
        // The warning the player has to see before they wonder why their
        // damage dropped: a class that was never trained for a weapon in each
        // hand is paying for the second one on both.
        const dualPenalised = !!(HS && HS.isPenalisedDualWield && HS.isPenalisedDualWield(actor));
        const penaltyPct = (HS && HS.UNTRAINED_DUAL_PENALTY)
            ? Math.round((1 - HS.UNTRAINED_DUAL_PENALTY) * 100)
            : 0;

        const isActorActive = (actor === this._actor);

        const renderSlotBox = (slotId) => {
            if (slotId < 0 || slotId >= equipSlots.length) return '';
            const slotName = actor.equipSlotName(slotId) || t.emptySlot;
            const lentTo = holdsFor[slotId];
            if (lentTo) {
                return `
                <div class="paperdoll-slot is-lent" data-member-idx="${memberIdx}" data-slot-idx="${slotId}" data-idx="${slotId}">
                    <div class="slot-header">
                        <span class="slot-title">${escapeHtml(slotName)}</span>
                    </div>
                    <div class="slot-body">
                        <div class="slot-empty-content">
                            <span class="slot-empty-glyph">⇄</span>
                            <span class="slot-empty-text">${escapeHtml(t.slotTwoHandedHeld || '')}</span>
                        </div>
                    </div>
                </div>`;
            }
            // Only a hand names a body part of its own ("Main hand" on the left
            // hand); every other slot's part is its own name, said twice.
            const rawPart = window.HandSlots && window.HandSlots.bodyPartName ? window.HandSlots.bodyPartName(actor, slotId) : '';
            const bodyPart = rawPart && String(rawPart).toLowerCase() !== String(slotName).toLowerCase() ? rawPart : '';
            const equipped = equips[slotId];
            const isFocused = (this._activeArea === 'paperdoll' && this._memberIndex === memberIdx && this._slotIndex === slotId);

            let contentHtml = '';
            if (equipped) {
                const iconIdx   = equipped.iconIndex;
                const iconStyle = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
                const rarity    = window.ItemSystemUtils ? window.ItemSystemUtils.getItemRarity(equipped) : 'common';
                const rarityCls = window.ItemSystemUtils ? window.ItemSystemUtils.rarityClass(rarity) : 'rarity--common';

                const statText = itemStatBadgeText(equipped);

                contentHtml = `
                    <div class="slot-equipped-content" draggable="true" data-member-idx="${memberIdx}" data-slot-idx="${slotId}">
                        <div class="item-rarity-bar ${rarityCls}"></div>
                        <div class="slot-item-icon"><div class="item-icon" style="${iconStyle}"></div></div>
                        <div class="slot-item-info">
                            <div class="slot-item-name" title="${escapeHtml(dbName(equipped))}">${escapeHtml(dbName(equipped))}</div>
                            ${statText ? `<div class="slot-item-stat">${statText}</div>` : ''}
                        </div>
                        <button class="slot-remove-btn" data-member-idx="${memberIdx}" data-slot-idx="${slotId}" title="${t.unequip || 'Unequip'}">✖</button>
                    </div>`;
            } else {
                contentHtml = `
                    <div class="slot-empty-content">
                        <span class="slot-empty-text">${escapeHtml(t.emptySlot)}</span>
                    </div>`;
            }

            const penaltyBadge = (dualPenalised && equipped && equipped.wtypeId)
                ? `<span class="slot-penalty-badge" title="${escapeHtml(t.dualPenaltyHint || '')}">-${penaltyPct}%</span>`
                : '';
            return `
                <div class="paperdoll-slot ${equipped ? 'has-item' : 'is-empty'} ${isFocused ? 'focused' : ''}" data-member-idx="${memberIdx}" data-slot-idx="${slotId}" data-idx="${slotId}">
                    <div class="slot-header">
                        <span class="slot-title">${escapeHtml(slotName)}</span>
                        ${penaltyBadge}
                        ${bodyPart ? `<span class="slot-bodypart">${escapeHtml(bodyPart)}</span>` : ''}
                    </div>
                    <div class="slot-body">
                        ${contentHtml}
                    </div>
                </div>`;
        };

        const handBoxesHtml = handSlotIndices.map(renderSlotBox).join('');
        const mouthBox      = mouthSlotIdx >= 0 ? renderSlotBox(mouthSlotIdx) : '';
        const headBox       = headSlotIdx >= 0 ? renderSlotBox(headSlotIdx) : '';
        const gearBoxes     = gearSlotIndices.map(renderSlotBox).join('');
        const bodyBoxesHtml = bodySlotIndices.map(renderSlotBox).join('');
        const upperBoxesHtml = handBoxesHtml + mouthBox + headBox + gearBoxes;

        const cls = actor.currentClass ? actor.currentClass() : null;
        const className = cls ? dbName(cls) : '';

        const totalStatsHtml = this._paperdollStatsHTML(actor, this._previewActorFor(actor));

        return `
            <div class="paperdoll-container member-equip-container ${isActorActive ? 'active-actor' : ''}" data-member-idx="${memberIdx}">
                <div class="paperdoll-actor-bar">
                    <span class="paperdoll-actor-name">${escapeHtml(actor.name())}</span>
                    <span class="paperdoll-actor-class">${escapeHtml(T('Equip.classLevel', { class: className, level: actor.level }))}</span>
                </div>
                <div class="paperdoll-slots-grid">
                    <div class="paperdoll-slots-row paperdoll-slots-row--upper">
                        ${upperBoxesHtml}
                    </div>
                    <div class="paperdoll-slots-row paperdoll-body-slots">
                        ${bodyBoxesHtml}
                    </div>
                </div>
                ${dualPenalised ? `<div class="paperdoll-dual-warning">${escapeHtml(t.dualPenaltyWarning ? t.dualPenaltyWarning.replace('{n}', penaltyPct).replace('{name}', actor.name()) : '')}</div>` : ''}
                ${totalStatsHtml}
            </div>`;
    };

    // The piece being inspected, tried on the stand-in, when it is one the
    // character is not already wearing: the strip under that character's slots
    // then prints what the numbers WOULD become. Anything else previews nothing.
    Scene_Equip.prototype._previewActorFor = function (actor) {
        const drag = this._dragPreview;
        if (drag) return (drag.actors && drag.actors.get(actor)) || null;
        if (this._viewMode !== 'detail' || !actor || actor !== this._actor) return null;
        const item = this._inspectedItem;
        if (!item) return null;
        // A worn piece inspected from its slot changes nothing. A bench piece
        // is a copy in the bag, even when another of it is worn.
        if (this._inspectedSlotIdx >= 0 && actor.equips()[this._inspectedSlotIdx] === item) return null;
        const fitSlot = (this._inspectedSlotIdx >= 0) ? this._inspectedSlotIdx
            : this.benchTargetSlot(actor, item);
        if (fitSlot < 0) return null;
        return this.standInActor(fitSlot, item);
    };

    // Where a piece from the bench goes when Equip is pressed on it. The
    // paperdoll cursor has nothing to say about it: it always rests on some
    // slot, so reading it sent a helmet at the main hand. In order:
    //   - the empty slot the player asked the bench about, if the piece fits it;
    //   - the first empty slot that takes it with a hand to spare, which is the
    //     free off-hand for a second one-handed weapon;
    //   - the first slot of its kind, whose piece it replaces.
    Scene_Equip.prototype.benchTargetSlot = function (actor, item) {
        if (!actor || !item) return -1;
        const hs = window.HandSlots;
        const fits = (s) => (hs && typeof hs.slotFits === 'function') ? hs.slotFits(actor, s, item)
            : actor.equipSlots()[s] === item.etypeId;
        const asked = this._slotFilterIdx;
        if (asked >= 0 && asked < actor.equipSlots().length && !actor.equips()[asked]
            && fits(asked) && (!actor.isEquipChangeOk || actor.isEquipChangeOk(asked))) {
            return asked;
        }
        if (hs && typeof hs.targetSlotFor === 'function') {
            const slot = hs.targetSlotFor(actor, item);
            if (slot >= 0) return slot;
        }
        if (hs && typeof hs.emptySlotFor === 'function') {
            const slot = hs.emptySlotFor(actor, item);
            if (slot >= 0) return slot;
        }
        const slots = actor.equipSlots();
        for (let i = 0; i < slots.length; i++) if (fits(i)) return i;
        return -1;
    };

    // One member's stats, under their slots: vitals and the six attributes on
    // one row, the four derived stats under them. With a preview actor each
    // column prints the new number and the change beside it, and a weapon's
    // scaling stats read gold.
    Scene_Equip.prototype._paperdollStatsHTML = function (actor, preview) {
        const lang = ConfigManager.language || 'en';
        const t    = i18n[lang] || i18n['en'];
        const sT = (k, def) => (t.short && t.short[k]) || def;
        const after = preview || actor;
        const cBefore = (typeof actor.calculateCustomStats === 'function') ? actor.calculateCustomStats() : null;
        const cAfter  = (preview && typeof preview.calculateCustomStats === 'function') ? preview.calculateCustomStats() : cBefore;

        // The stats the weapon scales on are marked on the strip at all times:
        // the one being inspected while a preview is up, otherwise whatever
        // the character is holding (window.WeaponScaling).
        const scaler = window.WeaponScaling;
        const item = preview ? this._inspectedItem : null;
        const scaledBy = (item && DataManager.isWeapon(item))
            ? [item]
            : (typeof after.weapons === 'function' ? after.weapons() : []);
        const scaling = new Set();
        if (scaler) scaledBy.forEach(w => scaler.statsFor(w).forEach(st => scaling.add(st)));
        const scalingTitle = T('Equip.scalingStat');

        const mainList = [
            { key: 'HP',  label: sT('hp', 'HP'),   before: actor.mhp, after: after.mhp },
            { key: 'MP',  label: sT('mp', 'MP'),   before: actor.mmp, after: after.mmp },
            { key: 'STR', label: sT('str', 'STR'), before: actor.atk, after: after.atk, isBase: true },
            { key: 'CON', label: sT('con', 'CON'), before: actor.def, after: after.def, isBase: true },
            { key: 'DEX', label: sT('dex', 'DEX'), before: actor.agi, after: after.agi, isBase: true },
            { key: 'INT', label: sT('int', 'INT'), before: actor.mat, after: after.mat, isBase: true },
            { key: 'WIS', label: sT('wis', 'WIS'), before: actor.mdf, after: after.mdf, isBase: true },
            { key: 'PSI', label: sT('psi', 'PSI'), before: actor.luk, after: after.luk, isBase: true }
        ];
        const derivedList = cBefore ? [
            { key: 'ARCANE',       label: t.arcane,       before: cBefore.arcane,       after: cAfter.arcane },
            { key: 'SUBSTANCE',    label: t.substance,    before: cBefore.substance,    after: cAfter.substance },
            { key: 'STEALTH',      label: t.stealth,      before: cBefore.stealth,      after: cAfter.stealth },
            { key: 'INTIMIDATION', label: t.intimidation, before: cBefore.intimidation, after: cAfter.intimidation }
        ] : [];

        const statColumn = (st, unit) => {
            unit = unit || '';
            let modHtml = '';
            if (st.isBase) {
                const mod = Math.floor((st.after - 10) / 2);
                modHtml = ` <span class="equip-stat-mod">(${mod >= 0 ? '+' + mod : mod})</span>`;
            }
            const diff = st.after - st.before;
            const diffHtml = diff
                ? ` <span class="stat-diff ${diff > 0 ? 'positive' : 'negative'}">${diff > 0 ? '+' + diff : diff}${unit}</span>`
                : '';
            const scales = scaling.has(st.key);
            const cls = scales ? ' paperdoll-stat-col--scaling' : '';
            const title = scales ? ` title="${escapeHtml(scalingTitle)}"` : '';
            return `
                <div class="paperdoll-stat-col${cls}" data-stat="${st.key}"${title}>
                    <span class="stat-label">${escapeHtml(String(st.label))}</span>
                    <span class="stat-val">${st.after}${unit}${modHtml}${diffHtml}</span>
                </div>`;
        };

        let html = `<div class="paperdoll-stats-strip">${mainList.map(s => statColumn(s)).join('')}</div>`;
        if (derivedList.length) {
            html += `<div class="paperdoll-stats-strip paperdoll-stats-strip--derived">${derivedList.map(s => statColumn(s, '%')).join('')}</div>`;
        }
        return `<div class="paperdoll-stats-grid${preview ? ' paperdoll-stats-grid--preview' : ''}">${html}</div>`;
    };

    // A piece held over a slot is tried on a copy of each character the drop
    // would change: the one receiving it and, for a slot-to-slot move, the one
    // it came from, who takes back whatever the target slot held. Null clears
    // the preview. The copies live only while the cursor stays on that slot.
    Scene_Equip.prototype._setDragPreview = function (memberIdx, slotId) {
        const src = this._dragSource;
        const item = this._draggedItem;
        const key = (memberIdx === null || !item) ? '' : `${memberIdx}|${slotId}|${item.id}|${DataManager.isWeapon(item) ? 'w' : 'a'}`;
        if ((this._dragPreview ? this._dragPreview.key : '') === key) return;
        if (!key) {
            this._dragPreview = null;
        } else {
            const members = this.partyMembers();
            const target = members[memberIdx] || this._actor;
            const actors = new Map();
            const tryOn = (actor, slot, piece) => {
                if (!actor) return null;
                let copy = actors.get(actor);
                if (!copy) { copy = cloneForPreview(actor); actors.set(actor, copy); }
                copy.forceChangeEquip(slot, piece);
                return copy;
            };
            const displaced = target ? target.equips()[slotId] || null : null;
            if (src && src.type === 'slot') {
                const srcActor = members[src.memberIdx] || this._actor;
                if (srcActor !== target || src.slotId !== slotId) {
                    tryOn(srcActor, src.slotId, displaced);
                    tryOn(target, slotId, item);
                }
            } else {
                tryOn(target, slotId, item);
            }
            this._dragPreview = { key, actors };
        }
        this._syncPaperdollStats();
    };

    // Repaints only the strip of the character the detail page is about, so
    // opening, stepping through and closing an inspect keeps it current
    // without rebuilding the slots.
    Scene_Equip.prototype._syncPaperdollStats = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const members = this.partyMembers();
        container.querySelectorAll('.paperdoll-container[data-member-idx]').forEach(box => {
            const actor = members[parseInt(box.getAttribute('data-member-idx'), 10)];
            const grid = box.querySelector('.paperdoll-stats-grid');
            if (!actor || !grid) return;
            const html = this._paperdollStatsHTML(actor, this._previewActorFor(actor));
            if (grid.outerHTML !== html) grid.outerHTML = html;
        });
        this._bindStatTooltips();
    };

    // The right page holds one character at a time: the one the switcher has
    // picked. Their index into partyMembers() is kept on every slot so drag
    // and drop and the stat strip still find the right actor.
    Scene_Equip.prototype._buildPartyPaperdollsHTML = function () {
        const members = this.partyMembers();
        let idx = members.indexOf(this._actor);
        if (idx < 0) idx = Math.max(0, Math.min(this._memberIndex || 0, members.length - 1));
        const member = members[idx];
        if (member) this._memberIndex = idx;
        const rowHtml = member ? `
                    <div class="paperdoll-row-item" data-member-idx="${idx}">
                        ${this._buildSinglePaperdollHTML(member, idx)}
                    </div>` : '';

        return `<div class="party-paperdolls-stacked party-paperdolls-single">${rowHtml}</div>`;
    };

    Scene_Equip.prototype._buildPaperdollHTML = function (specificActor) {
        if (specificActor) {
            return this._buildSinglePaperdollHTML(specificActor, 0);
        }
        return this._buildPartyPaperdollsHTML();
    };

    Scene_Equip.prototype._buildDetailHTML = function () {
        const actor = this._actor;
        const lang  = ConfigManager.language || 'en';
        const t     = i18n[lang] || i18n['en'];

        let item = undefined;
        let targetSlot = -1;

        if (this._activeArea === 'inventory') {
            const list = this.getInventoryItemsForSlot();
            if (list && list[this._inventoryIndex]) {
                item = list[this._inventoryIndex];
                // That list is what the cursor's own slot takes.
                if (this._slotIndex >= 0) targetSlot = this._slotIndex;
            }
        }

        if (item === undefined && this._inspectedItem !== undefined) {
            item = this._inspectedItem;
        }

        if (targetSlot >= 0) {
            // Already settled by the slot list above.
        } else if (this._inspectedSlotIdx >= 0) {
            targetSlot = this._inspectedSlotIdx;
            if (item === undefined) item = actor.equips()[targetSlot];
        } else if (!item && this._slotIndex != null && this._slotIndex >= 0) {
            // Nothing picked off the bench: the page is about the slot under
            // the paperdoll cursor. A bench piece never reads the cursor, it
            // gets a slot of its own below (benchTargetSlot).
            targetSlot = this._slotIndex;
            if (item === undefined) item = actor.equips()[targetSlot];
        }

        if (!item) {
            const slotName = (targetSlot >= 0 && actor && actor.equipSlotName) ? actor.equipSlotName(targetSlot) : '';
            return `
                <div class="paperdoll-detail-view">
                    <div class="detail-header">
                        ${slotName ? `<div class="detail-item-title">${escapeHtml(slotName)}</div>` : ''}
                    </div>
                    <div class="placeholder-message">${t.emptySlot}</div>
                    <div class="detail-actions-row">
                        <button class="equip-action-btn equip-close-btn focusable">${t.backToPaperdoll || t.back || 'Back'}</button>
                    </div>
                </div>`;
        }

        // A piece off the bench is a copy in the bag, never the one worn,
        // even when the character wears another of the same.
        let benchPiece = false;
        if (targetSlot < 0) {
            benchPiece = true;
            targetSlot = this.benchTargetSlot(actor, item);
            if (targetSlot < 0) {
                const isWpn = DataManager.isWeapon(item);
                if (isWpn) {
                    targetSlot = window.HandSlots ? window.HandSlots.emptySlotFor(actor, item) : 0;
                    if (targetSlot < 0) targetSlot = 0;
                } else if (item.etypeId === 2) {
                    targetSlot = 1;
                } else {
                    targetSlot = actor.equipSlots().indexOf(item.etypeId);
                    if (targetSlot < 0) targetSlot = 0;
                }
            }
        }

        const isEquippedHere = actor.equips()[targetSlot] === item;
        const tempActor = isEquippedHere ? this.standInActor() : this.standInActor(targetSlot, item);

        const weaponProf = window.WeaponProficiency;
        const sh = t.short || {};
        const S = (key, full) => sh[key] || full;

        // What the piece is worth in damage, as tiles beside the preview.
        //
        // The stat changes it would make are printed on the right page, under
        // the character's own slots (_paperdollStatsHTML), so this page keeps to
        // the piece itself. For a weapon that is the question anyone is asking:
        // the catalogue's ATK column runs from 0 to 4, so two swords could read
        // identically and hit for very different numbers. BASE is the weapon's
        // own attack power, and next to it what it is actually worth in these
        // hands once proficiency has multiplied it (WeaponProficiency), which is
        // the whole reason an untrained weapon disappoints. DAMAGE is what a
        // basic attack with it would land, taken from window.SkillDetails so it
        // is the same number the skill cards print and is directly comparable.
        const isWeapon = DataManager.isWeapon(item);
        const factTile = (label, valueHtml, extraCls) => `
                <div class="equip-fact${extraCls ? ' ' + extraCls : ''}">
                    <span class="equip-fact-label">${label}</span>
                    <span class="equip-fact-value">${valueHtml}</span>
                </div>`;
        let damageTiles = '';
        const details = window.SkillDetails;
        const attackSkill = (typeof $dataSkills !== 'undefined' && $dataSkills)
            ? $dataSkills[actor.attackSkillId ? actor.attackSkillId() : 1] : null;

        // Armour has no attack of its own, so a damage figure under it only
        // repeats what the character already hits for. Weapons only.
        if (isWeapon && details && typeof details.damageFor === 'function' && attackSkill) {
            const dmgBefore = details.damageFor(attackSkill, actor);
            const dmgAfter = tempActor ? details.damageFor(attackSkill, tempActor) : dmgBefore;
            if (dmgBefore !== null || dmgAfter !== null) {
                const shown = dmgAfter !== null ? dmgAfter : dmgBefore;
                let valueHtml = `<span class="stat-val">${shown}</span>`;
                if (dmgBefore !== null && dmgAfter !== null && dmgAfter !== dmgBefore) {
                    const delta = dmgAfter - dmgBefore;
                    valueHtml += ` <span class="stat-diff ${delta > 0 ? 'positive' : 'negative'}">${delta > 0 ? '+' + delta : delta}</span>`;
                }
                damageTiles += factTile(T('Equip.damage'), valueHtml, 'equip-fact--headline');
            }
        }
        if (isWeapon) {
            // params index 2 is ATK, the engine's own order.
            const basePower = (item.params && item.params[2]) || 0;
            const mult = (weaponProf && typeof weaponProf.multiplier === 'function')
                ? weaponProf.multiplier(actor, item) : 1;
            const inHand = Math.round(basePower * mult);
            let powerHtml = `<span class="stat-val">${basePower}</span>`;
            if (inHand !== basePower) {
                const cls = inHand > basePower ? 'positive' : 'negative';
                powerHtml += ` ➔ <span class="stat-val-new ${cls}">${inHand}</span>`;
            }
            damageTiles += factTile(T('Equip.basePower'), powerHtml);
        }

        let typeTiles = '';
        const wtype = isWeapon ? (($dataSystem.weaponTypes || [])[item.wtypeId] || '') : '';
        if (wtype) {
            typeTiles += factTile(T('Equip.weaponType'), escapeHtml(String(wtype).trim()));
        }
        // Clothes, robe or armour, the same name every item sheet prints.
        const armorKind = (window.ItemSystemUtils && typeof window.ItemSystemUtils.armorTypeName === 'function')
            ? window.ItemSystemUtils.armorTypeName(item) : '';
        if (armorKind) {
            typeTiles += factTile(T('Inventory.spec.label.armorType'), escapeHtml(armorKind));
        }
        // The stats the weapon's attack is worked out from, as the same gold
        // chips the stat strip marks (window.WeaponScaling).
        const scaler = window.WeaponScaling;
        const scalingStats = (isWeapon && scaler) ? scaler.statsFor(item) : [];
        if (scalingStats.length) {
            typeTiles += factTile(T('Equip.scale'), scaler.chipsHTML(scalingStats), 'equip-fact--scaling');
        }
        const dt = (item.meta && item.meta.DamageType) ||
            (item.note && (item.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        if (dt) {
            typeTiles += factTile(T('Equip.damageType'), escapeHtml(String(dt).trim()));
        }
        // A piece tagged with allergens says so here too, as on every item sheet.
        const allergyRows = (window.ItemSystemUtils && typeof window.ItemSystemUtils.allergenRows === 'function')
            ? window.ItemSystemUtils.allergenRows(item) : [];
        for (const [label, val] of allergyRows) typeTiles += factTile(label, escapeHtml(val));

        let factsHtml = '';
        if (damageTiles) factsHtml += `<div class="equip-facts equip-damage-block">${damageTiles}</div>`;
        if (typeTiles)   factsHtml += `<div class="equip-facts">${typeTiles}</div>`;

        // The piece's own numbers and traits, the same two sections the backpack
        // card prints, so a player never has to leave this screen to read them.
        // Trait wording comes from ItemSystemUtils.traitLines, the one table
        // both screens share.
        let paramsHtml = '';
        const paramNames = [S('hp', t.hp), S('mp', t.mp), S('str', t.str), S('con', t.con),
            S('int', t.int), S('wis', t.wis), S('dex', t.dex), S('psi', t.psi)];
        const PARAM_STAT = ['HP', 'MP', 'STR', 'CON', 'INT', 'WIS', 'DEX', 'PSI'];
        const paramChips = (item.params || []).map((val, idx) => {
            if (!val) return '';
            const cls = val > 0 ? 'positive' : 'negative';
            const scales = scalingStats.includes(PARAM_STAT[idx]) ? ' equip-param-chip--scaling' : '';
            return `<span class="equip-param-chip${scales}"><span class="equip-param-name">${paramNames[idx] || T('Inventory.spec.stat')}</span>`
                + `<span class="stat-diff ${cls}">${val > 0 ? '+' + val : val}</span></span>`;
        }).join('');
        if (paramChips) {
            paramsHtml = `<div class="inspect-section-title">${T('Inventory.section.attributeModifiers')}</div>`
                + `<div class="equip-params-block">${paramChips}</div>`;
        }
        let traitsHtml = '';
        const traitList = (window.ItemSystemUtils && typeof window.ItemSystemUtils.traitLines === 'function')
            ? window.ItemSystemUtils.traitLines(item) : [];
        if (window.ItemSystemUtils && typeof window.ItemSystemUtils.handLines === 'function') {
            traitList.push(...window.ItemSystemUtils.handLines(item));
        }
        if (traitList.length) {
            traitsHtml = `<div class="equip-traits-block">${traitList.map(line => `<div class="inspect-bullet-item">${line}</div>`).join('')}</div>`;
        }
        // The piece's special abilities as tags, the same section the backpack
        // card and the skill card draw (ItemSystemUtils.specialLines).
        const specialList = (window.ItemSystemUtils && typeof window.ItemSystemUtils.specialLines === 'function')
            ? window.ItemSystemUtils.specialLines(item) : [];
        if (specialList.length) {
            traitsHtml += `<div class="inspect-section-title">${T('Inventory.section.special')}</div>`
                + `<div class="inspect-quick-pills equip-specials-block">${specialList.map(text =>
                    `<div class="inspect-meta-item inspect-pill inspect-pill--special"><span class="inspect-meta-val inspect-pill-val">${escapeHtml(text)}</span></div>`).join('')}</div>`;
        }

        let descHtml = '';
        if (item.description && String(item.description).trim()) {
            let desc = String(item.description).trim();
            if (window.translateText && typeof window.translateText === 'function') desc = window.translateText(desc);
            desc = desc.replace(/\s*\n\s*\n\s*/g, '<br><br>').replace(/\s*\n\s*/g, ' ');
            descHtml = `<div class="equip-desc">${desc}</div>`;
        }

        const isCurrentlyWorn = !benchPiece && actor.equips()[targetSlot] === item;
        const actionButtons = isCurrentlyWorn
            ? `<button class="equip-action-btn unequip-now-btn focusable" data-slot="${targetSlot}">${t.unequip || 'Unequip'}</button>`
            : `<button class="equip-action-btn equip-now-btn focusable" data-slot="${targetSlot}">${t.equip || 'Equip'}</button>`;

        return `
            <div class="paperdoll-detail-view">
                <div class="detail-header">
                    <div class="detail-item-title">${escapeHtml(dbName(item))}</div>
                </div>
                <div class="detail-preview-row">
                    <div class="detail-preview-box">
                        <canvas id="weapon-preview-canvas-inspect" width="220" height="200"></canvas>
                    </div>
                    <div class="detail-facts-side">
                        ${factsHtml}
                        ${paramsHtml}
                    </div>
                </div>
                <div class="bottom-stats-block">
                    ${traitsHtml}
                    <div class="equip-lore-col">
                        ${descHtml}
                    </div>
                </div>
                <div class="detail-actions-row">
                    ${actionButtons}
                    <button class="equip-action-btn equip-close-btn focusable">${t.backToPaperdoll || t.back || 'Back'}</button>
                </div>
            </div>`;
    };

    Scene_Equip.prototype._buildLeftPageHTML = function () {
        return this._buildPartyPaperdollsHTML();
    };

    Scene_Equip.prototype._buildRightPageHTML = function () {
        if (this._viewMode === 'detail') {
            return this._buildDetailHTML();
        }
        const actor = this._actor;
        const lang  = ConfigManager.language || 'en';
        const t     = i18n[lang] || i18n['en'];

        const tabs = getEquipTabs();
        let tabsHtml = '';
        tabs.forEach(tab => {
            const active = (this._activeTab === tab.id) ? 'active' : '';
            tabsHtml += `<div class="equip-type-tab ${active}" data-tab-id="${tab.id}">${escapeHtml(tab.label)}</div>`;
        });

        const items = this.getFilteredPartyEquipment();
        let cardsHtml = '';
        if (items.length === 0) {
            cardsHtml = `<div class="placeholder-message">${t.emptySlot || 'No equipment in this category...'}</div>`;
        } else {
            const grouped = (this._activeTab || 'all') === 'all';
            let lastCat = null;
            items.forEach((item, idx) => {
                if (grouped) {
                    const cat = equipCategoryOf(item, true);
                    if (cat !== lastCat) {
                        lastCat = cat;
                        cardsHtml += `<div class="equip-group-header">${escapeHtml(cat)}</div>`;
                    }
                }
                const isWpn = DataManager.isWeapon(item);
                const iconIdx = item.iconIndex;
                const iconStyle = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
                const rarity = window.ItemSystemUtils ? window.ItemSystemUtils.getItemRarity(item) : 'common';
                const rarityCls = window.ItemSystemUtils ? window.ItemSystemUtils.rarityClass(rarity) : 'rarity--common';
                const count = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(item) : 1;

                const statText = itemStatBadgeText(item);
                const statBadge = statText ? `<span class="equip-card-stat">${statText}</span>` : '';

                const prof = window.WeaponProficiency;
                const untrained = prof && isWpn && prof.isUntrained(actor, item);
                const profTag = untrained
                    ? `<span class="item-proficiency-tag">${prof.levelNameFor(actor, item) || t.untrained}</span>`
                    : '';

                const isFocused = (this._activeArea === 'grid' && this._gridIndex === idx);

                cardsHtml += `
                    <div class="equip-card ${isFocused ? 'focused' : ''}" draggable="true" data-item-type="${isWpn ? 'weapon' : 'armor'}" data-item-id="${item.id}" data-idx="${idx}">
                        <div class="item-rarity-bar ${rarityCls}"></div>
                        <div class="equip-card-icon"><div class="item-icon" style="${iconStyle}"></div></div>
                        <div class="equip-card-info">
                            <div class="equip-card-name-row">
                                <span class="equip-card-name">${escapeHtml(dbName(item))}</span>
                                ${count > 1 ? `<span class="equip-card-qty">×${count}</span>` : ''}
                            </div>
                            <div class="equip-card-meta">
                                ${statBadge}
                                ${profTag}
                            </div>
                        </div>
                    </div>`;
            });
        }

        return `
            <div class="equip-type-tabs">
                <div class="equip-type-tabs-scroll">
                    ${tabsHtml}
                </div>
            </div>
            <div class="equip-grid-container">
                <div class="equip-grid">
                    ${cardsHtml}
                </div>
            </div>`;
    };

    // =============================================================================
    // Full DOM rebuild
    // =============================================================================

    Scene_Equip.prototype._refreshDOM = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;

        const actor       = this._actor;
        const lang        = ConfigManager.language || 'en';
        const t           = i18n[lang] || i18n['en'];

        const commands      = ['optimize', 'random', 'clear'];
        const commandLabels = [t.optimize, t.random, t.clear];
        let commandsBtnsHTML = '';
        commands.forEach((cmd, idx) => {
            let cls = 'backpack-tab';
            if (idx === this._commandIndex && this._activeArea === 'commands') cls += ' active selected';
            commandsBtnsHTML += `<div class="${cls}" data-cmd="${cmd}">${commandLabels[idx]}</div>`;
        });

        const commandBarHTML = `
            <div class="equip-command-bar">
                <div class="backpack-tabs equip-commands">
                    <div class="backpack-tabs-row">${commandsBtnsHTML}</div>
                </div>
            </div>`;

        let spread = container.querySelector('.book-spread');
        if (!spread && !container.querySelector('.left-content-area')) {
            container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        <div class="page-header-bar">
                            <div class="back-button focusable">${T('Equip.back')}</div>
                            <h2 class="title">${t.equip}</h2>
                        </div>
                        <div class="right-content-area"></div>
                    </div>
                    <div class="right-page">
                        <div class="right-page-header">
                            <div class="companion-switcher" id="equip-companion-switcher"></div>
                        </div>
                        <div class="left-commands-area"></div>
                        <div class="left-content-area equip-main-content"></div>
                    </div>
                </div>`;
            spread = container.querySelector('.book-spread');

            const backBtn = spread.querySelector('.back-button');
            if (backBtn) {
                backBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                    if (SceneManager._scene && SceneManager._scene.popScene) SceneManager._scene.popScene();
                });
            }
        }

        const allMembers = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [actor];
        let tabsHTML = '';
        allMembers.forEach((member, idx) => {
            const sel = member === actor ? 'selected' : '';
            tabsHTML += `<div class="companion-tab ${sel} focusable" data-actor-idx="${idx}">${escapeHtml(member.name())}</div>`;
        });

        const switcherHTML = enableSwitching
            ? window.CharSwitcher.inner(`<div class="companion-tabs-row">${tabsHTML}</div>`, allMembers.length)
            : `<div class="companion-tabs-row">${tabsHTML}</div>`;

        if (spread) {
            const switcherSlot = spread.querySelector('#equip-companion-switcher');
            if (switcherSlot) switcherSlot.innerHTML = switcherHTML;
            const cmdArea = spread.querySelector('.left-commands-area');
            if (cmdArea) cmdArea.innerHTML = commandBarHTML;
        }

        this._refreshLeftPage();
        this._refreshRightPage();

        container.querySelectorAll('.companion-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const idx = parseInt(tab.getAttribute('data-actor-idx'));
                const all = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers() : [];
                const target = all[idx];
                if (target && target !== this._actor) {
                    if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
                    this._actor = target;
                    this._currentActorIndex = idx;
                    const members = this.partyMembers();
                    const mIdx = members.indexOf(target);
                    if (mIdx >= 0) this._memberIndex = mIdx;
                    this._refreshDOM();
                }
            });
        });

        container.querySelectorAll('.equip-commands .backpack-tab').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                this._commandIndex = idx;
                this._activeArea   = 'commands';
                this.executeCommandAction(btn.getAttribute('data-cmd'));
            });
        });
    };

    // =============================================================================
    // Selective page updates & Drag-Drop event bindings
    // =============================================================================

    Scene_Equip.prototype._refreshLeftPage = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const leftArea = container.querySelector('.left-content-area');
        if (!leftArea) return;
        leftArea.innerHTML = this._buildLeftPageHTML();
        this._bindStatTooltips();
        this._bindLeftPageEvents();
    };

    Scene_Equip.prototype._refreshRightPage = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const rightArea = container.querySelector('.right-content-area');
        if (!rightArea) return;
        const kept = this._keepPreviewAcrossRedraw();
        if (!kept) this.cleanup3DWeaponPreview();
        // The bench can shrink under the cursor (the last card equipped from
        // its own detail): the cursor comes back onto the last card standing
        // instead of pointing past the end, with nothing lit and OK dead.
        if (typeof this.getFilteredPartyEquipment === 'function') {
            const count = this.getFilteredPartyEquipment().length;
            this._gridIndex = Math.max(0, Math.min(this._gridIndex || 0, count - 1));
        }
        // Taken out before the page goes, so the preview never sees its canvas
        // leave the document (it lets itself go when that happens).
        if (kept && kept !== true && kept.parentNode) kept.parentNode.removeChild(kept);
        rightArea.innerHTML = this._buildRightPageHTML();
        this._syncPaperdollStats();
        if (this._viewMode === 'detail') {
            const fresh = kept && kept !== true ? document.getElementById('weapon-preview-canvas-inspect') : null;
            if (fresh && fresh.parentNode) {
                fresh.parentNode.replaceChild(kept, fresh);
            } else if (kept !== true) {
                this.init3DWeaponPreview();
            }
            this._bindStatTooltips();
        }
        this._bindRightPageEvents();
    };

    // Moves a worn piece onto another slot, the same character's or a
    // companion's, and the piece that was there (if any) back into the slot it
    // came from. changeEquip only ever takes a piece out of the bag, so both
    // pieces are put down first and then taken up again in their new places;
    // the two-handed rules are changeEquip's own (a two-handed weapon taken up
    // puts down what else was in hand). Anything that does not end where it
    // was sent is undone, so a refused swap leaves both characters as they were.
    Scene_Equip.prototype.swapWornPieces = function (srcActor, srcSlotId, targetActor, targetSlotId) {
        if (!srcActor || !targetActor) return false;
        if (srcActor === targetActor && srcSlotId === targetSlotId) return false;
        const srcItem = srcActor.equips()[srcSlotId] || null;
        const targetItem = targetActor.equips()[targetSlotId] || null;
        if (!srcItem) return false;
        const before = new Map();
        [srcActor, targetActor].forEach(a => { if (!before.has(a)) before.set(a, a.equips()); });

        srcActor.changeEquip(srcSlotId, null);
        if (targetItem) targetActor.changeEquip(targetSlotId, null);
        targetActor.changeEquip(targetSlotId, srcItem);
        if (targetItem) srcActor.changeEquip(srcSlotId, targetItem);

        const done = targetActor.equips()[targetSlotId] === srcItem
            && (!targetItem || srcActor.equips()[srcSlotId] === targetItem);
        if (done) return true;

        // Put everything back where it was: clear every slot first so each
        // piece is in the bag again, then wear the old loadouts.
        before.forEach((equips, actor) => {
            equips.forEach((piece, slot) => { if (actor.equips()[slot]) actor.changeEquip(slot, null); });
        });
        before.forEach((equips, actor) => {
            equips.forEach((piece, slot) => { if (piece) actor.changeEquip(slot, piece); });
        });
        return false;
    };

    Scene_Equip.prototype.executeTransferEquip = function (srcMemberIdx, srcSlotId, targetMemberIdx, targetSlotId) {
        const members = this.partyMembers();
        const srcActor = members[srcMemberIdx] || this._actor;
        const targetActor = members[targetMemberIdx] || this._actor;
        if (!srcActor || !targetActor) return;
        if (srcMemberIdx === targetMemberIdx && srcSlotId === targetSlotId) return;

        const srcItem = srcActor.equips()[srcSlotId];
        const targetItem = targetActor.equips()[targetSlotId];
        if (!srcItem) return;

        const fits = (who, slot, piece) => !piece || !window.HandSlots || window.HandSlots.slotFits(who, slot, piece);
        if (!fits(targetActor, targetSlotId, srcItem) || !fits(srcActor, srcSlotId, targetItem)) {
            /* silent equip menu */
            return;
        }
        /* silent equip menu */
        this.swapWornPieces(srcActor, srcSlotId, targetActor, targetSlotId);
        this._refreshDOM();
    };

    Scene_Equip.prototype._highlightDroppableSlots = function (item, sourceMemberIdx, sourceSlot) {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.classList.add('is-dragging-equip');
        const members = this.partyMembers();
        container.querySelectorAll('.paperdoll-slot').forEach(slotEl => {
            const mIdx = parseInt(slotEl.getAttribute('data-member-idx'));
            const sId  = parseInt(slotEl.getAttribute('data-slot-idx'));
            if (mIdx === sourceMemberIdx && sId === sourceSlot) return;
            const actor = (!isNaN(mIdx) && members[mIdx]) ? members[mIdx] : this._actor;
            if (!actor) return;

            let canFit = window.HandSlots ? window.HandSlots.slotFits(actor, sId, item) : true;
            const targetEquipped = actor.equips()[sId];
            if (targetEquipped && sourceMemberIdx !== undefined && sourceSlot !== undefined) {
                const srcActor = members[sourceMemberIdx] || this._actor;
                if (srcActor && window.HandSlots) {
                    canFit = canFit && window.HandSlots.slotFits(srcActor, sourceSlot, targetEquipped);
                }
            }
            if (canFit) {
                slotEl.classList.add('drag-target-valid');
                slotEl.classList.remove('drag-target-invalid');
            } else {
                slotEl.classList.add('drag-target-invalid');
                slotEl.classList.remove('drag-target-valid');
            }
        });
    };

    Scene_Equip.prototype._clearSlotHighlights = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.classList.remove('is-dragging-equip');
        container.querySelectorAll('.paperdoll-slot').forEach(slotEl => {
            slotEl.classList.remove('drag-target-valid', 'drag-target-invalid', 'drag-over');
        });
    };

    Scene_Equip.prototype._bindLeftPageEvents = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const members = this.partyMembers();

        // Paperdoll container header clicks to select active actor
        container.querySelectorAll('.paperdoll-container').forEach(pEl => {
            pEl.addEventListener('click', (e) => {
                if (e.target.closest('.paperdoll-slot') || e.target.closest('.slot-remove-btn')) return;
                const mIdx = parseInt(pEl.getAttribute('data-member-idx'));
                if (!isNaN(mIdx) && members[mIdx] && members[mIdx] !== this._actor) {
                    if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
                    this._actor = members[mIdx];
                    this._memberIndex = mIdx;
                    this._currentActorIndex = ($gameParty && $gameParty.allMembers) ? $gameParty.allMembers().indexOf(members[mIdx]) : mIdx;
                    this._refreshDOM();
                }
            });
        });

        container.querySelectorAll('.paperdoll-slot').forEach(slotEl => {
            const memberIdx = parseInt(slotEl.getAttribute('data-member-idx')) || 0;
            const slotId    = parseInt(slotEl.getAttribute('data-slot-idx'));
            const actor     = members[memberIdx] || this._actor;

            slotEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                let canDrop = false;
                if (this._draggedItem && actor && window.HandSlots) {
                    canDrop = window.HandSlots.slotFits(actor, slotId, this._draggedItem);
                    if (canDrop && this._dragSource && this._dragSource.type === 'slot' && this._dragSource.memberIdx !== undefined) {
                        const targetEquipped = actor.equips()[slotId];
                        if (targetEquipped) {
                            const srcActor = members[this._dragSource.memberIdx] || this._actor;
                            canDrop = srcActor && window.HandSlots.slotFits(srcActor, this._dragSource.slotId, targetEquipped);
                        }
                    }
                }
                if (canDrop) {
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    slotEl.classList.add('drag-over');
                    this._setDragPreview(memberIdx, slotId);
                } else {
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
                    this._setDragPreview(null);
                }
            });

            slotEl.addEventListener('dragleave', (e) => {
                // Moving onto the slot's own icon or name is still over the slot.
                if (e && e.relatedTarget && slotEl.contains(e.relatedTarget)) return;
                slotEl.classList.remove('drag-over');
                this._setDragPreview(null);
            });

            slotEl.addEventListener('drop', (e) => {
                e.preventDefault();
                slotEl.classList.remove('drag-over');
                this._setDragPreview(null);
                if (this._dragSource && this._dragSource.type === 'slot') {
                    this.executeTransferEquip(this._dragSource.memberIdx, this._dragSource.slotId, memberIdx, slotId);
                    this._refreshDOM();
                } else if (this._dragSource && this._dragSource.type === 'grid') {
                    const item = this._draggedItem;
                    if (item && actor && window.HandSlots && window.HandSlots.slotFits(actor, slotId, item)) {
                        /* silent equip menu */
                        actor.changeEquip(slotId, item);
                        this._refreshDOM();
                    } else {
                        /* silent equip menu */
                    }
                }
                this._clearSlotHighlights();
                this._draggedItem = null;
                this._dragSource = null;
            });

            slotEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('slot-remove-btn')) return;
                const equipped = actor ? actor.equips()[slotId] : null;
                /* silent equip menu */
                this._actor = actor;
                this._memberIndex = memberIdx;
                this._slotIndex = slotId;
                if (!equipped) {
                    // Nothing to inspect: offer what fits here instead.
                    this._slotFilterIdx = slotId;
                    this._inspectedItem = null;
                    this._inspectedSlotIdx = -1;
                    this._gridIndex = 0;
                    this._viewMode = 'paperdoll';
                    this._refreshRightPage();
                    return;
                }
                this._slotFilterIdx = -1;
                this._inspectedItem = equipped;
                this._inspectedSlotIdx = slotId;
                this._viewMode = 'detail';
                this._detailBtnIndex = 0;
                this._refreshRightPage();
            });

            const removeBtn = slotEl.querySelector('.slot-remove-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (actor) {
                        /* silent equip menu */
                        actor.changeEquip(slotId, null);
                        this._refreshDOM();
                    }
                });
            }

            const equippedEl = slotEl.querySelector('.slot-equipped-content');
            if (equippedEl) {
                equippedEl.addEventListener('dragstart', (e) => {
                    const equipped = actor ? actor.equips()[slotId] : null;
                    if (equipped) {
                        this._draggedItem = equipped;
                        this._dragSource = { type: 'slot', memberIdx, slotId, item: equipped };
                        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                        this._highlightDroppableSlots(equipped, memberIdx, slotId);
                    }
                });
                equippedEl.addEventListener('dragend', () => {
                    this._clearSlotHighlights();
                    this._draggedItem = null;
                    this._dragSource = null;
                    this._setDragPreview(null);
                });
            }
        });
    };

    Scene_Equip.prototype._bindRightPageEvents = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;

        if (this._viewMode === 'detail') {
            const backBtn = container.querySelector('.paperdoll-back-btn') || container.querySelector('.equip-close-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                    this._viewMode = 'paperdoll';
                    this.cleanup3DWeaponPreview();
                    this._refreshRightPage();
                });
            }

            const equipBtn = container.querySelector('.equip-now-btn');
            if (equipBtn) {
                equipBtn.addEventListener('click', () => {
                    const targetSlot = parseInt(equipBtn.getAttribute('data-slot'));
                    if (targetSlot >= 0 && this._inspectedItem && this._actor) {
                        /* silent equip menu */
                        this._actor.changeEquip(targetSlot, this._inspectedItem);
                        this._slotFilterIdx = -1;
                        this._viewMode = 'paperdoll';
                        this.cleanup3DWeaponPreview();
                        this._refreshDOM();
                    } else {
                        /* silent equip menu */
                    }
                });
            }

            const unequipBtn = container.querySelector('.unequip-now-btn');
            if (unequipBtn) {
                unequipBtn.addEventListener('click', () => {
                    const targetSlot = parseInt(unequipBtn.getAttribute('data-slot'));
                    if (targetSlot >= 0 && this._actor) {
                        /* silent equip menu */
                        this._actor.changeEquip(targetSlot, null);
                        this._viewMode = 'paperdoll';
                        this.cleanup3DWeaponPreview();
                        this._refreshDOM();
                    }
                });
            }
        } else {
            container.querySelectorAll('.equip-type-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabId = tab.getAttribute('data-tab-id');
                    if (this._activeTab !== tabId || this._slotFilterIdx >= 0) {
                        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
                        this._activeTab = tabId;
                        this._slotFilterIdx = -1;
                        this._gridIndex = 0;
                        this._refreshRightPage();
                    }
                });
            });

            // One listener of each kind on the grid rather than three on every
            // card: a full bag is hundreds of cards, rebuilt on every redraw.
            const items = this.getFilteredPartyEquipment();
            const grid = container.querySelector('.equip-grid');
            const cardItem = (e) => {
                const card = e.target && e.target.closest ? e.target.closest('.equip-card') : null;
                if (!card || !grid.contains(card)) return null;
                return items[parseInt(card.getAttribute('data-idx'))] || null;
            };
            if (grid) {
                grid.addEventListener('dragstart', (e) => {
                    const item = cardItem(e);
                    if (!item) return;
                    this._draggedItem = item;
                    this._dragSource = { type: 'grid', item };
                    if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'copyMove';
                        try {
                            e.dataTransfer.setData('text/plain', JSON.stringify({
                                kind: DataManager.isWeapon(item) ? 'weapon' : 'armor',
                                id: item.id
                            }));
                        } catch (err) {}
                    }
                    this._highlightDroppableSlots(item);
                });

                grid.addEventListener('dragend', (e) => {
                    if (!cardItem(e)) return;
                    this._clearSlotHighlights();
                    this._draggedItem = null;
                    this._dragSource = null;
                    this._setDragPreview(null);
                });

                grid.addEventListener('click', (e) => {
                    const item = cardItem(e);
                    if (!item) return;
                    /* silent equip menu */
                    this._inspectedItem = item;
                    this._inspectedSlotIdx = -1;
                    this._viewMode = 'detail';
                    this._detailBtnIndex = 0;
                    this._refreshRightPage();
                });
            }

            const gridContainer = container.querySelector('.equip-grid-container');
            if (gridContainer) {
                gridContainer.addEventListener('dragover', (e) => {
                    if (this._dragSource && this._dragSource.type === 'slot') {
                        e.preventDefault();
                        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    }
                });
                gridContainer.addEventListener('drop', (e) => {
                    if (this._dragSource && this._dragSource.type === 'slot') {
                        e.preventDefault();
                        const members = this.partyMembers();
                        const srcActor = members[this._dragSource.memberIdx] || this._actor;
                        if (srcActor) {
                            /* silent equip menu */
                            srcActor.changeEquip(this._dragSource.slotId, null);
                            this._refreshDOM();
                        }
                        this._clearSlotHighlights();
                        this._draggedItem = null;
                        this._dragSource = null;
                    }
                });
            }
        }
    };

    Scene_Equip.prototype._bindStatTooltips = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.querySelectorAll('.stat-row[data-stat], .paperdoll-stat-col[data-stat]').forEach(row => {
            if (row.getAttribute('data-tip-bound')) return;
            row.setAttribute('data-tip-bound', '1');
            const key   = row.getAttribute('data-stat');
            const label = ((row.querySelector('.stat-label') || {}).textContent || key).trim();
            row.addEventListener('mousemove',  (e) => showStatTooltip(e, key, label));
            row.addEventListener('mouseleave', hideStatTooltip);
        });
    };

    // The nearest drawn slot of the shown member from the focused one, in the
    // direction (dx, dy). laidOut is false when the page has no geometry yet
    // (nothing measured), and the caller then falls back to index stepping.
    Scene_Equip.prototype._paperdollSlotInDirection = function (dx, dy) {
        const container = document.getElementById('equip-container');
        if (!container) return { laidOut: false, slot: null };
        const boxes = [];
        container.querySelectorAll('.paperdoll-slot').forEach((el) => {
            const mIdx = parseInt(el.getAttribute('data-member-idx'), 10);
            const sId  = parseInt(el.getAttribute('data-slot-idx'), 10);
            if (isNaN(sId) || (!isNaN(mIdx) && mIdx !== this._memberIndex)) return;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            if (!r || (r.width <= 0 && r.height <= 0)) return;
            boxes.push({ slot: sId, x: r.left + r.width / 2, y: r.top + r.height / 2 });
        });
        const from = boxes.find(b => b.slot === this._slotIndex);
        if (!from) return { laidOut: false, slot: null };
        let best = null;
        let bestScore = Infinity;
        for (const b of boxes) {
            if (b.slot === from.slot) continue;
            const ddx = b.x - from.x;
            const ddy = b.y - from.y;
            const along = dx ? ddx * dx : ddy * dy;
            const across = dx ? Math.abs(ddy) : Math.abs(ddx);
            // Ahead in the asked direction, and more ahead than aside.
            if (along <= 4 || across > along * 2) continue;
            const score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = b; }
        }
        return { laidOut: true, slot: best ? best.slot : null };
    };

    Scene_Equip.prototype._updateSlotHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const slots = container.querySelectorAll('.paperdoll-slot');
        slots.forEach((slotEl, idx) => {
            const mIdx = parseInt(slotEl.getAttribute('data-member-idx'));
            const sId  = parseInt(slotEl.getAttribute('data-slot-idx'));
            const isFoc = (!isNaN(mIdx) && !isNaN(sId))
                ? (mIdx === this._memberIndex && sId === this._slotIndex)
                : (idx === this._slotIndex);
            slotEl.classList.toggle('focused', isFoc);
        });
        const focused = container.querySelector('.paperdoll-slot.focused');
        if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
        if (this._viewMode === 'detail') {
            const members = this.partyMembers();
            const actor = members[this._memberIndex] || this._actor;
            this._actor = actor;
            this._inspectedSlotIdx = this._slotIndex;
            this._inspectedItem = actor ? actor.equips()[this._slotIndex] : null;
            this._refreshRightPage();
        }
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._updateInventoryHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.querySelectorAll('.equip-card').forEach((card, idx) => {
            card.classList.toggle('focused', idx === this._gridIndex);
        });
        const focused = container.querySelector('.equip-card.focused');
        if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
        if (this._viewMode === 'detail') {
            const items = this.getFilteredPartyEquipment();
            if (items[this._gridIndex]) {
                this._inspectedItem = items[this._gridIndex];
                this._inspectedSlotIdx = -1;
                this._refreshRightPage();
            }
        }
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._updateTabsHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const tabs = container.querySelectorAll('.equip-type-tab');
        tabs.forEach((tab, idx) => {
            tab.classList.toggle('focused', idx === this._tabIndex);
        });
        const focused = container.querySelector('.equip-type-tab.focused');
        if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._updateCommandsHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const cmds = container.querySelectorAll('.equip-commands .backpack-tab');
        cmds.forEach((cmd, idx) => {
            cmd.classList.toggle('focused', idx === this._commandIndex);
        });
        const focused = container.querySelector('.equip-commands .backpack-tab.focused');
        if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._updateBackHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const backBtn = container.querySelector('.back-button');
        if (backBtn) {
            backBtn.classList.toggle('focused', this._activeArea === 'back');
            if (this._activeArea === 'back' && backBtn.scrollIntoView) backBtn.scrollIntoView({ block: 'nearest' });
        }
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._updateDetailButtonsHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        const btns = container.querySelectorAll('.detail-actions-row .equip-action-btn');
        btns.forEach((btn, idx) => {
            btn.classList.toggle('focused', idx === this._detailBtnIndex);
        });
        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
    };

    Scene_Equip.prototype._clearAllHighlights = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.querySelectorAll('.paperdoll-slot.focused, .equip-card.focused, .equip-type-tab.focused, .equip-commands .backpack-tab.focused, .back-button.focused, .detail-actions-row .equip-action-btn.focused')
            .forEach(el => el.classList.remove('focused'));
    };

    Scene_Equip.prototype.openInventorySelection = function () {
        this._activeArea = 'grid';
        this._gridIndex = 0;
        this._refreshDOM();
    };

    Scene_Equip.prototype.equipSelectedItem = function () {
        const items = this.getFilteredPartyEquipment();
        if (items.length === 0) return;
        const selected = items[this._gridIndex];
        if (selected) {
            const targetSlot = this.benchTargetSlot(this._actor, selected);
            if (targetSlot >= 0) {
                this._actor.changeEquip(targetSlot, selected);
                /* silent equip menu */
                this._refreshDOM();
            }
        }
    };

    Scene_Equip.prototype.executeCommandAction = function (cmd) {
        switch (cmd) {
            case 'optimize':
                this._actor.optimizeEquipments();
                /* silent equip menu */
                break;
            case 'random':
                this._actor.randomEquipments();
                /* silent equip menu */
                break;
            case 'clear':
                this._actor.clearEquipments();
                /* silent equip menu */
                break;
        }
        this._refreshDOM();
    };

    // =============================================================================
    // Keyboard & Gamepad input
    // =============================================================================

    Scene_Equip.prototype.updateUIEquipInput = function () {
        // One reading of the four directions, repeating while held.
        const dir     = window.UINav ? window.UINav.navDir() : null;
        const isDown  = dir === 'down';
        const isUp    = dir === 'up';
        const isRight = dir === 'right';
        const isLeft  = dir === 'left';

        // On this screen Tab is the member, not the tab strip: Tab and
        // Shift+Tab step the character switcher on the right page, the way
        // L2 / R2 do (CharSwitcher, installed with the scene). L1 / R1 still
        // step the equipment-type tabs.
        if (enableSwitching && Input.isTriggered('tab')) {
            if (Input.isPressed('shift')) this.switchToPreviousCharacter();
            else this.switchToNextCharacter();
            return;
        }
        const tabStep = window.UINav ? window.UINav.tabDir() : 0;
        if (tabStep) {
            const tabs = getEquipTabs();
            const at = Math.max(0, tabs.findIndex((t) => t.id === (this._activeTab || 'all')));
            const next = Math.max(0, Math.min(tabs.length - 1, at + tabStep));
            if (tabs[next] && (next !== at || this._slotFilterIdx >= 0)) {
                SoundManager.playCursor();
                this._activeTab = tabs[next].id;
                this._slotFilterIdx = -1;
                this._gridIndex = 0;
                this._refreshRightPage();
            }
            return;
        }

        const isOk     = Input.isTriggered('ok');
        const isCancel = Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled();

        if (this._viewMode === 'detail') {
            if (isCancel) {
                // One level out: back to where the card was opened from, the
                // worn slot on the paperdoll or the piece on the bench.
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                const fromSlot = this._inspectedSlotIdx >= 0;
                this._viewMode = 'paperdoll';
                this.cleanup3DWeaponPreview();
                this._refreshRightPage();
                this._clearAllHighlights();
                if (fromSlot) {
                    this._activeArea = 'paperdoll';
                    this._updateSlotHighlight();
                } else {
                    this._activeArea = 'grid';
                    this._updateInventoryHighlight();
                }
                return;
            }

            const container = document.getElementById('equip-container');
            const btns = container ? container.querySelectorAll('.detail-actions-row .equip-action-btn') : [];

            // The card's buttons are one row: left / right walk every one of
            // them and stop at its ends.
            if (isLeft || isRight) {
                if (btns.length > 1) {
                    const at = Math.max(0, Math.min(btns.length - 1, this._detailBtnIndex || 0));
                    const next = window.UINav
                        ? window.UINav.gridStep(at, isLeft ? 'left' : 'right', btns.length, btns.length)
                        : Math.max(0, Math.min(btns.length - 1, at + (isLeft ? -1 : 1)));
                    if (next !== at) {
                        this._detailBtnIndex = next;
                        this._updateDetailButtonsHighlight();
                    }
                }
                return;
            }

            if (isOk) {
                const activeBtn = btns[this._detailBtnIndex];
                if (activeBtn) {
                    activeBtn.click();
                } else {
                    const target = this._inspectedSlotIdx >= 0 ? this._inspectedSlotIdx : this.benchTargetSlot(this._actor, this._inspectedItem);
                    if (target >= 0 && this._inspectedItem && this._actor) {
                        /* silent equip menu */
                        this._actor.changeEquip(target, this._inspectedItem);
                        this._viewMode = 'paperdoll';
                        this.cleanup3DWeaponPreview();
                        this._refreshDOM();
                    }
                }
                return;
            }
            return;
        }

        if (isCancel) {
            if (this._activeArea === 'tabs' || this._activeArea === 'commands') {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this._clearAllHighlights();
                this._activeArea = 'grid';
                this._updateInventoryHighlight();
                return;
            }
            if (this._activeArea === 'back') {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this.popScene();
                return;
            }
            // The paperdoll is one level in from the bench, where the page
            // opens: Cancel steps back out to the bench rather than closing.
            if (this._activeArea === 'paperdoll') {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this._clearAllHighlights();
                this._activeArea = 'grid';
                this._updateInventoryHighlight();
                return;
            }
            // A bench narrowed to one slot's pieces opens back up first.
            if (this._activeArea === 'grid' && this._slotFilterIdx >= 0) {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this._slotFilterIdx = -1;
                this._gridIndex = 0;
                this._refreshRightPage();
                this._updateInventoryHighlight();
                return;
            }
            if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
            this.popScene();
            return;
        }

        const tabs = getEquipTabs();

        if (this._activeArea === 'tabs') {
            if (isLeft) {
                if (this._tabIndex > 0) {
                    this._tabIndex--;
                    this._updateTabsHighlight();
                }
            } else if (isRight) {
                if (this._tabIndex < tabs.length - 1) {
                    this._tabIndex++;
                    this._updateTabsHighlight();
                }
            } else if (isDown) {
                this._clearAllHighlights();
                this._activeArea = 'grid';
                this._gridIndex = 0;
                this._updateInventoryHighlight();
            } else if (isUp) {
                this._clearAllHighlights();
                this._activeArea = 'commands';
                this._commandIndex = 0;
                this._updateCommandsHighlight();
            } else if (isOk) {
                if (tabs[this._tabIndex]) {
                    /* silent equip menu */
                    this._activeTab = tabs[this._tabIndex].id;
                    this._gridIndex = 0;
                    this._refreshRightPage();
                    this._updateTabsHighlight();
                }
            }
        } else if (this._activeArea === 'commands') {
            const cmds = ['optimize', 'random', 'clear'];
            if (isLeft) {
                if (this._commandIndex > 0) {
                    this._commandIndex--;
                    this._updateCommandsHighlight();
                } else {
                    this._clearAllHighlights();
                    this._activeArea = 'back';
                    this._updateBackHighlight();
                }
            } else if (isRight) {
                if (this._commandIndex < cmds.length - 1) {
                    this._commandIndex++;
                    this._updateCommandsHighlight();
                } else {
                    this._clearAllHighlights();
                    this._activeArea = 'tabs';
                    this._updateTabsHighlight();
                }
            } else if (isDown) {
                this._clearAllHighlights();
                this._activeArea = 'paperdoll';
                this._updateSlotHighlight();
            } else if (isUp) {
                this._clearAllHighlights();
                this._activeArea = 'back';
                this._updateBackHighlight();
            } else if (isOk) {
                /* silent equip menu */
                this.executeCommandAction(cmds[this._commandIndex]);
                this._updateCommandsHighlight();
            }
        } else if (this._activeArea === 'back') {
            if (isDown) {
                this._clearAllHighlights();
                this._activeArea = 'commands';
                this._updateCommandsHighlight();
            } else if (isRight) {
                this._clearAllHighlights();
                this._activeArea = 'commands';
                this._updateCommandsHighlight();
            } else if (isOk) {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this.popScene();
            }
        } else if (this._activeArea === 'grid') {
            const items = this.getFilteredPartyEquipment();
            if (isLeft && this._gridIndex % 2 === 0) {
                this._clearAllHighlights();
                this._activeArea = 'paperdoll';
                this._updateSlotHighlight();
            } else if (isLeft || isRight) {
                // Left / right stay on the drawn row (two across).
                const next = window.UINav
                    ? window.UINav.gridStep(this._gridIndex, isLeft ? 'left' : 'right', items.length, 2)
                    : this._gridIndex;
                if (next !== this._gridIndex) {
                    this._gridIndex = next;
                    this._updateInventoryHighlight();
                }
            } else if (isDown) {
                if (this._gridIndex + 2 < items.length) {
                    this._gridIndex += 2;
                    this._updateInventoryHighlight();
                }
            } else if (isUp) {
                if (this._gridIndex - 2 >= 0) {
                    this._gridIndex -= 2;
                    this._updateInventoryHighlight();
                } else {
                    this._clearAllHighlights();
                    this._activeArea = 'tabs';
                    this._updateTabsHighlight();
                }
            } else if (isOk) {
                if (items[this._gridIndex]) {
                    /* silent equip menu */
                    this._inspectedItem = items[this._gridIndex];
                    this._inspectedSlotIdx = -1;
                    this._viewMode = 'detail';
                    this._detailBtnIndex = 0;
                    this._refreshRightPage();
                    this._updateDetailButtonsHighlight();
                }
            }
        } else if (this._activeArea === 'paperdoll') {
            const members = this.partyMembers();
            const currActor = members[this._memberIndex] || this._actor;
            const slotsCount = currActor ? currActor.equipSlots().length : 0;

            // The slots are walked by where they are drawn: the paperdoll's
            // rows depend on how many hands and gear slots a body has, and a
            // fixed index table left some of them (the third gear slot, extra
            // hands) out of reach of a keyboard or a pad.
            const spatial = (isRight || isLeft || isDown || isUp)
                ? this._paperdollSlotInDirection(isRight ? 1 : isLeft ? -1 : 0, isDown ? 1 : isUp ? -1 : 0)
                : null;
            if (spatial && spatial.laidOut) {
                if (spatial.slot !== null) {
                    this._slotIndex = spatial.slot;
                    this._updateSlotHighlight();
                } else if (isRight) {
                    this._clearAllHighlights();
                    this._activeArea = 'grid';
                    this._updateInventoryHighlight();
                } else if (isUp) {
                    this._clearAllHighlights();
                    this._activeArea = 'commands';
                    this._commandIndex = 0;
                    this._updateCommandsHighlight();
                }
            } else if (isRight) {
                const nextSlot = this._slotIndex + 1;
                if (nextSlot < slotsCount && (this._slotIndex === 0 || this._slotIndex === 1 || this._slotIndex === 2 || this._slotIndex === 4 || this._slotIndex === 5)) {
                    this._slotIndex = nextSlot;
                    this._updateSlotHighlight();
                } else {
                    this._clearAllHighlights();
                    this._activeArea = 'grid';
                    this._updateInventoryHighlight();
                }
            } else if (isLeft) {
                const prevSlot = this._slotIndex - 1;
                if (prevSlot >= 0 && (this._slotIndex === 1 || this._slotIndex === 2 || this._slotIndex === 3 || this._slotIndex === 5 || this._slotIndex === 6)) {
                    this._slotIndex = prevSlot;
                    this._updateSlotHighlight();
                }
            } else if (isDown) {
                if (this._slotIndex < 4 && this._slotIndex + 4 < slotsCount) {
                    this._slotIndex += 4;
                    this._updateSlotHighlight();
                }
            } else if (isUp) {
                if (this._slotIndex >= 4) {
                    this._slotIndex -= 4;
                    this._updateSlotHighlight();
                } else {
                    this._clearAllHighlights();
                    this._activeArea = 'commands';
                    this._commandIndex = 0;
                    this._updateCommandsHighlight();
                }
            } else if (isOk) {
                const worn = currActor ? currActor.equips()[this._slotIndex] : null;
                if (worn) {
                    /* silent equip menu */
                    this._actor = currActor;
                    this._inspectedItem = worn;
                    this._inspectedSlotIdx = this._slotIndex;
                    this._viewMode = 'detail';
                    this._detailBtnIndex = 0;
                    this._refreshRightPage();
                    this._updateDetailButtonsHighlight();
                }
            } else if (Input.isTriggered('menu') && !Input.isTriggered('escape')) {
                const worn = currActor ? currActor.equips()[this._slotIndex] : null;
                if (worn) {
                    /* silent equip menu */
                    currActor.changeEquip(this._slotIndex, null);
                    this._refreshDOM();
                    this._updateSlotHighlight();
                }
            }
        }
    };
})();
