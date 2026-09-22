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
        this._draggedItem       = null;
        this._dragSource        = null;

        // WASD state
        this._wasdInput      = { up: false, down: false, left: false, right: false };
        this._wasdHeld       = { up: false, down: false, left: false, right: false };
        this._wasdHoldFrames = { up: 0,     down: 0,     left: 0,     right: 0     };

        this._wasdListener = (event) => {
            if (event.repeat) return;
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdInput.up    = true; this._wasdHeld.up    = true; event.preventDefault(); }
            if (key === 's') { this._wasdInput.down  = true; this._wasdHeld.down  = true; event.preventDefault(); }
            if (key === 'a') { this._wasdInput.left  = true; this._wasdHeld.left  = true; event.preventDefault(); }
            if (key === 'd') { this._wasdInput.right = true; this._wasdHeld.right = true; event.preventDefault(); }
        };
        this._wasdUpListener = (event) => {
            const key = event.key.toLowerCase();
            if (key === 'w') { this._wasdHeld.up    = false; this._wasdHoldFrames.up    = 0; }
            if (key === 's') { this._wasdHeld.down  = false; this._wasdHoldFrames.down  = 0; }
            if (key === 'a') { this._wasdHeld.left  = false; this._wasdHoldFrames.left  = 0; }
            if (key === 'd') { this._wasdHeld.right = false; this._wasdHoldFrames.right = 0; }
        };
        window.addEventListener('keydown', this._wasdListener);
        window.addEventListener('keyup',   this._wasdUpListener);

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
        this.updateUIEquipInput();
        Scene_MenuBase.prototype.update.call(this);
    };

    Scene_Equip.prototype.terminate = function () {
        if (this._wasdListener) {
            window.removeEventListener('keydown', this._wasdListener);
            window.removeEventListener('keyup',   this._wasdUpListener);
            this._wasdListener   = null;
            this._wasdUpListener = null;
        }
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

            // Build one viewport on `canvas` for `item`. Returns a record the
            // caller keeps and later hands back to disposeAll(), or null when
            // three.js is missing or the canvas is not in the document.
            function mount(canvas, item) {
                if (typeof THREE === 'undefined' || !canvas || !item) return null;

                const rect   = canvas.getBoundingClientRect();
                const width  = rect.width  || 140;
                const height = rect.height || 380;

                const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
                renderer.setSize(width, height);
                // Render at 1:1 device pixels. This is a small pane beside a
                // page of text, and the hi-DPI multiplier (up to four times the
                // fragment work on a Retina screen) is the single biggest cost
                // here and buys almost nothing visually - the same call the
                // codex's specimen viewer settled on. The equip bench puts two
                // of these up at once, beside the game's own render loop.
                renderer.setPixelRatio(1);

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

                if (item.model3d && THREE.GLTFLoader) {
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
                    const isWeapon = item.wtypeId !== undefined;
                    const pModel = isWeapon
                        ? (window.WeaponSystemProcedural && WeaponSystemProcedural.createModel(item))
                        : (window.ItemModelSystem && window.ItemModelSystem.createModel(item));
                    if (pModel) setupModelPosition(pModel);
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

                // Scratch objects reused every frame to avoid per-frame allocations.
                const _scratchDeltaRot = new THREE.Euler();
                const _scratchDeltaPos = new THREE.Vector3();

                // Capped to ~30fps for the same reason: the piece turning on the
                // stand is drawn alongside the map's own loop, and at the
                // screen's full rate it competes with it for no visible gain.
                // The whole frame's worth of time is handed to the tick when it
                // does run, so everything on the model moves at its own speed.
                const PREVIEW_FRAME_MS = 1000 / 30;
                let _frameAcc = 0;
                let _previewLastTime = performance.now();
                const animate = () => {
                    previewEntry.rafId = requestAnimationFrame(animate);

                    const now = performance.now();
                    _frameAcc += Math.min(now - _previewLastTime, 50);
                    _previewLastTime = now;
                    if (_frameAcc < PREVIEW_FRAME_MS) return;
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

                    if (model && window.WeaponSystemProcedural) {
                        // Gears, drifting shards and pulsing runes declared by the
                        // model itself, same as in battle.
                        WeaponSystemProcedural.tickModelParts(model, deltaMs);
                        // A reconstruction, when one has been started on it: the
                        // call is free on a model that is not coming apart.
                        if (WeaponSystemProcedural.tickVectorSwitch) {
                            WeaponSystemProcedural.tickVectorSwitch(model, deltaMs);
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
                };
                animate();

                return previewEntry;
            }

            function disposeAll(entries) {
                if (!entries) return;
                entries.forEach(p => {
                    if (p.rafId) cancelAnimationFrame(p.rafId);
                    p.renderer.dispose();
                    p.canvas.removeEventListener('mousedown',  p.listeners.mousedown);
                    p.canvas.removeEventListener('mousemove',  p.listeners.mousemove);
                    window.removeEventListener('mouseup',      p.listeners.mouseup);
                    p.canvas.removeEventListener('wheel',      p.listeners.wheel);
                    p.canvas.removeEventListener('touchstart', p.listeners.touchstart);
                    p.canvas.removeEventListener('touchmove',  p.listeners.touchmove);
                    window.removeEventListener('touchend',     p.listeners.touchend);
                    // dispose() releases this scene's GPU resources but leaves the
                    // WebGL context itself alive. The browser caps how many contexts
                    // may live at once and force-loses the OLDEST once the cap is
                    // passed: that is the game's own canvas, after which PIXI
                    // silently stops rendering and the picture freezes for the rest
                    // of the session. Release it here, and swap in a clean canvas
                    // node for the next preview, since a lost context never comes
                    // back on the element it was taken from.
                    try { if (p.renderer.forceContextLoss) p.renderer.forceContextLoss(); } catch (e) {}
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

    // A preview card is a fresh WebGL context and a weapon model built from
    // scratch by the procedural pipeline, and there are two of them. Walking
    // the bench with a held key would ask for a pair per step, and the browser
    // force-loses the game's own context once the cap of live ones is passed,
    // so the pieces are only put on the stand once the cursor comes to rest.
    const PREVIEW_SETTLE_MS = 90;

    Scene_Equip.prototype.init3DWeaponPreview = function () {
        this.cleanup3DWeaponPreview();
        if (this._viewMode !== 'detail' || !this._inspectedItem) return;

        const modelItem = previewModelFor(this._inspectedItem) || this._inspectedItem;
        this._previewTimer = setTimeout(() => {
            this._previewTimer = 0;
            this._previewRenderers = [];
            const canvas = document.getElementById('weapon-preview-canvas-inspect');
            if (!canvas) return;
            const entry = window.Weapon3DPreview.mount(canvas, modelItem);
            if (entry) this._previewRenderers.push(entry);
        }, PREVIEW_SETTLE_MS);
    };

    Scene_Equip.prototype.cleanup3DWeaponPreview = function () {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = 0;
        }
        window.Weapon3DPreview.disposeAll(this._previewRenderers);
        this._previewRenderers = [];
    };

    // =============================================================================
    // Actor switching
    // =============================================================================

    Scene_Equip.prototype.switchToPreviousCharacter = function () {
        const party = $gameParty.allMembers();
        if (party.length <= 1) return;
        this._currentActorIndex = (this._currentActorIndex - 1 + party.length) % party.length;
        this._actor = party[this._currentActorIndex];
        if (switchSound) SoundManager.playCursor();
        this._refreshDOM();
    };

    Scene_Equip.prototype.switchToNextCharacter = function () {
        const party = $gameParty.allMembers();
        if (party.length <= 1) return;
        this._currentActorIndex = (this._currentActorIndex + 1) % party.length;
        this._actor = party[this._currentActorIndex];
        if (switchSound) SoundManager.playCursor();
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
    // character wearing the same things; only the slot being fitted is changed
    // on it, which is what forceChangeEquip is for.
    Scene_Equip.prototype.standInActor = function () {
        const actor = this._actor;
        const stamp = `${actorKey(actor)}|${actor.equips().map(e => (e ? e.id : 0)).join('.')}|${actor.level || 0}`;
        if (!this._standIn || this._standInStamp !== stamp) {
            this._standIn      = JsonEx.makeDeepCopy(actor);
            this._standInStamp = stamp;
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

    const equipCategoryOf = (item) => {
        if (!item) return '';
        if (DataManager.isWeapon(item)) {
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

    Scene_Equip.prototype.getFilteredPartyEquipment = function () {
        let weapons = ($gameParty && typeof $gameParty.weapons === 'function') ? $gameParty.weapons() : [];
        let armors  = ($gameParty && typeof $gameParty.armors === 'function')  ? $gameParty.armors()  : [];
        if (weapons.length === 0 && armors.length === 0 && $gameParty && typeof $gameParty.equipItems === 'function') {
            const all = $gameParty.equipItems();
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
                const cat = equipCategoryOf(it);
                if (!order.has(cat)) order.set(cat, order.size);
            });
            result.sort((a, b) => order.get(equipCategoryOf(a)) - order.get(equipCategoryOf(b)));
        }
        return result;
    };

    // =============================================================================
    // Right Page: 3 Party Members Paperdolls (Triangle disposition) & 3D Detail
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
        return filtered.slice(0, 3);
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
            const bodyPart = window.HandSlots && window.HandSlots.bodyPartName ? window.HandSlots.bodyPartName(actor, slotId) : '';
            const equipped = equips[slotId];
            const isFocused = (this._activeArea === 'paperdoll' && this._memberIndex === memberIdx && this._slotIndex === slotId);

            let contentHtml = '';
            if (equipped) {
                const iconIdx   = equipped.iconIndex;
                const iconStyle = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
                const rarity    = window.ItemSystemUtils ? window.ItemSystemUtils.getItemRarity(equipped) : 'common';
                const rarityCls = window.ItemSystemUtils ? window.ItemSystemUtils.rarityClass(rarity) : 'rarity--common';

                let statText = '';
                if (equipped.params) {
                    if (equipped.params[2] > 0) statText = `+${equipped.params[2]} ATK`;
                    else if (equipped.params[3] > 0) statText = `+${equipped.params[3]} DEF`;
                }

                contentHtml = `
                    <div class="slot-equipped-content" draggable="true" data-member-idx="${memberIdx}" data-slot-idx="${slotId}">
                        <div class="item-rarity-bar ${rarityCls}"></div>
                        <div class="slot-item-icon"><div class="item-icon" style="${iconStyle}"></div></div>
                        <div class="slot-item-info">
                            <div class="slot-item-name" title="${escapeHtml(equipped.name)}">${escapeHtml(equipped.name)}</div>
                            ${statText ? `<div class="slot-item-stat">${statText}</div>` : ''}
                        </div>
                        <button class="slot-remove-btn" data-member-idx="${memberIdx}" data-slot-idx="${slotId}" title="${t.unequip || 'Unequip'}">✖</button>
                    </div>`;
            } else {
                contentHtml = `
                    <div class="slot-empty-content">
                        <span class="slot-empty-glyph">☐</span>
                        <span class="slot-empty-text">${escapeHtml(slotName)}</span>
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

        const className = actor.currentClass ? actor.currentClass().name : '';

        const sT = (k, def) => (t.short && t.short[k]) || def;
        const totalStatsList = [
            { key: 'HP',  label: sT('hp', 'HP'),   val: actor.mhp, isBase: false },
            { key: 'MP',  label: sT('mp', 'MP'),   val: actor.mmp, isBase: false },
            { key: 'STR', label: sT('str', 'STR'), val: actor.atk, isBase: true },
            { key: 'CON', label: sT('con', 'CON'), val: actor.def, isBase: true },
            { key: 'INT', label: sT('int', 'INT'), val: actor.mat, isBase: true },
            { key: 'WIS', label: sT('wis', 'WIS'), val: actor.mdf, isBase: true },
            { key: 'DEX', label: sT('dex', 'DEX'), val: actor.agi, isBase: true },
            { key: 'PSI', label: sT('psi', 'PSI'), val: actor.luk, isBase: true }
        ];
        let totalStatsHtml = '<div class="inspect-spec-grid stats-grid stats-grid--4col paperdoll-stats-grid">';
        totalStatsList.forEach(st => {
            let modHtml = '';
            if (st.isBase) {
                const mod = Math.floor((st.val - 10) / 2);
                const modStr = mod >= 0 ? '+' + mod : String(mod);
                modHtml = ` <span class="equip-stat-mod">(${modStr})</span>`;
            }
            totalStatsHtml += `
                <div class="inspect-spec-row stat-row" data-stat="${st.key}">
                    <span class="inspect-spec-label stat-label">${escapeHtml(st.label)}</span>
                    <span class="inspect-spec-value stat-val-container">
                        <span class="stat-val">${st.val}${modHtml}</span>
                    </span>
                </div>`;
        });
        totalStatsHtml += '</div>';

        return `
            <div class="paperdoll-container member-equip-container ${isActorActive ? 'active-actor' : ''}" data-member-idx="${memberIdx}">
                <div class="paperdoll-actor-bar">
                    <span class="paperdoll-actor-name">${escapeHtml(actor.name())}</span>
                    <span class="paperdoll-actor-class">${escapeHtml(className)} (Lv. ${actor.level})</span>
                </div>
                <div class="paperdoll-slots-grid">
                    <div class="paperdoll-slots-row paperdoll-slots-row--upper">
                        ${upperBoxesHtml}
                    </div>
                    <div class="paperdoll-slots-row paperdoll-body-slots">
                        ${bodyBoxesHtml}
                    </div>
                </div>
                ${dualPenalised ? `<div class="paperdoll-dual-warning">${escapeHtml(t.dualPenaltyWarning ? t.dualPenaltyWarning.replace('{n}', penaltyPct) : '')}</div>` : ''}
                ${totalStatsHtml}
            </div>`;
    };

    Scene_Equip.prototype._buildPartyPaperdollsHTML = function () {
        const members = this.partyMembers();
        let rowsHtml = '';
        members.forEach((member, idx) => {
            if (member) {
                rowsHtml += `
                    <div class="paperdoll-row-item" data-member-idx="${idx}">
                        ${this._buildSinglePaperdollHTML(member, idx)}
                    </div>`;
            }
        });

        return `<div class="party-paperdolls-stacked">${rowsHtml}</div>`;
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
            }
        }

        if (item === undefined && this._inspectedItem !== undefined) {
            item = this._inspectedItem;
        }

        if (this._inspectedSlotIdx >= 0) {
            targetSlot = this._inspectedSlotIdx;
            if (item === undefined) item = actor.equips()[targetSlot];
        } else if (this._slotIndex != null && this._slotIndex >= 0) {
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

        if (targetSlot < 0) {
            targetSlot = (window.HandSlots && typeof window.HandSlots.targetSlotFor === 'function')
                ? window.HandSlots.targetSlotFor(actor, item)
                : -1;
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

        const tempActor = this.standInActor();
        const isEquippedHere = actor.equips()[targetSlot] === item;
        if (!isEquippedHere) {
            tempActor.forceChangeEquip(targetSlot, item);
        }

        const s1 = actor.getWeaponScalingType(item);
        const getCodes = (s) => {
            if (!s) return [];
            if (s === 'MIX') return ['STR', 'DEX'];
            if (s === 'ARC') return ['STR', 'INT'];
            return [s];
        };
        const scalingCodes = new Set(getCodes(s1));
        if (scalingCodes.size === 0 && DataManager.isWeapon(item)) scalingCodes.add('STR');

        const weaponProf = window.WeaponProficiency;
        const codeGradeMap = {};
        if (weaponProf && DataManager.isWeapon(item)) {
            const grade = weaponProf.gradeFor(actor, item);
            getCodes(s1).forEach(c => { codeGradeMap[c] = grade; });
        }

        const sh = t.short || {};
        const S = (key, full) => sh[key] || full;
        const cBefore = actor.calculateCustomStats();
        const cAfter  = tempActor ? tempActor.calculateCustomStats() : cBefore;
        const gridStats = [
            { label: S('hp', t.hp),  code: null,  key: 'HP',  percent: false, valBefore: actor.mhp, valAfter: tempActor ? tempActor.mhp : actor.mhp },
            { label: S('mp', t.mp),  code: null,  key: 'MP',  percent: false, valBefore: actor.mmp, valAfter: tempActor ? tempActor.mmp : actor.mmp },
            { label: S('arcane', t.arcane), code: null, key: 'ARCANE', percent: true, valBefore: cBefore.arcane, valAfter: cAfter.arcane },

            { label: S('str', t.str), code: 'STR', key: 'STR', percent: false, valBefore: actor.atk, valAfter: tempActor ? tempActor.atk : actor.atk },
            { label: S('con', t.con), code: 'CON', key: 'CON', percent: false, valBefore: actor.def, valAfter: tempActor ? tempActor.def : actor.def },
            { label: S('substance', t.substance), code: null, key: 'SUBSTANCE', percent: true, valBefore: cBefore.substance, valAfter: cAfter.substance },

            { label: S('int', t.int), code: 'INT', key: 'INT', percent: false, valBefore: actor.mat, valAfter: tempActor ? tempActor.mat : actor.mat },
            { label: S('wis', t.wis), code: 'WIS', key: 'WIS', percent: false, valBefore: actor.mdf, valAfter: tempActor ? tempActor.mdf : actor.mdf },
            { label: S('stealth', t.stealth), code: null, key: 'STEALTH', percent: true, valBefore: cBefore.stealth, valAfter: cAfter.stealth },

            { label: S('dex', t.dex), code: 'DEX', key: 'DEX', percent: false, valBefore: actor.agi, valAfter: tempActor ? tempActor.agi : actor.agi },
            { label: S('psi', t.psi), code: 'PSI', key: 'PSI', percent: false, valBefore: actor.luk, valAfter: tempActor ? tempActor.luk : actor.luk },
            { label: S('intimidation', t.intimidation), code: null, key: 'INTIMIDATION', percent: true, valBefore: cBefore.intimidation, valAfter: cAfter.intimidation }
        ];

        let statsGridHTML = '';
        for (const stat of gridStats) {
            const unit = stat.percent ? '%' : '';
            const diff = stat.valAfter - stat.valBefore;
            const diffHtml = diff > 0 ? `<span class="stat-diff positive">+${diff}${unit}</span>`
                           : diff < 0 ? `<span class="stat-diff negative">${diff}${unit}</span>` : '';
            const isScaling = !!(stat.code && scalingCodes.has(stat.code));
            const grade     = isScaling ? codeGradeMap[stat.code] : null;
            const labelCls  = isScaling ? 'inspect-spec-label stat-label stat-label--scaling' : 'inspect-spec-label stat-label';
            const valCls    = isScaling ? 'stat-val stat-val--scaling' : 'stat-val';
            const labelHtml = grade ? `${stat.label} <span class="stat-scaling-grade">(${grade})</span>` : stat.label;

            let valBeforeFormatted = `${stat.valBefore}${unit}`;
            let valAfterFormatted = `${stat.valAfter}${unit}`;
            let modBonusHtml = '';

            if (stat.code) {
                const modBefore = Math.floor((stat.valBefore - 10) / 2);
                const modBeforeStr = modBefore >= 0 ? '+' + modBefore : String(modBefore);
                const modAfter = Math.floor((stat.valAfter - 10) / 2);
                const modAfterStr = modAfter >= 0 ? '+' + modAfter : String(modAfter);
                valBeforeFormatted = `${stat.valBefore} <span class="equip-stat-mod">(${modBeforeStr})</span>`;
                valAfterFormatted = `${stat.valAfter} <span class="equip-stat-mod">(${modAfterStr})</span>`;
                const modDiff = modAfter - modBefore;
                if (modDiff !== 0) {
                    modBonusHtml = `<span class="stat-diff equip-stat-diff ${modDiff > 0 ? 'positive' : 'negative'}">[${modDiff > 0 ? '+' + modDiff : modDiff} Mod]</span>`;
                }
            }

            statsGridHTML += `
                <div class="inspect-spec-row stat-row${isScaling ? ' stat-row--scaling' : ''}"${stat.key ? ` data-stat="${stat.key}"` : ''}>
                    <span class="${labelCls}">${labelHtml}</span>
                    <span class="inspect-spec-value stat-val-container">
                        <span class="${valCls}">${valBeforeFormatted}</span>
                        ${diff !== 0 ? `➔ <span class="stat-val-new">${valAfterFormatted}</span>` : ''}
                        ${stat.code ? modBonusHtml : diffHtml}
                    </span>
                </div>`;
        }

        let dtHtml = '';
        const dt = (item.meta && item.meta.DamageType) ||
            (item.note && (item.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
        if (dt) {
            dtHtml += `<div class="equip-damage-type"><span class="equip-damage-type-label">${T('Equip.damageType')}:</span> <strong>${escapeHtml(String(dt).trim())}</strong></div>`;
        }
        const wtype = DataManager.isWeapon(item) ? (($dataSystem.weaponTypes || [])[item.wtypeId] || '') : '';
        if (wtype) {
            dtHtml += `<div class="equip-damage-type"><span class="equip-damage-type-label">${T('Equip.weaponType')}:</span> <strong>${escapeHtml(String(wtype).trim())}</strong></div>`;
        }

        let descHtml = '';
        if (item.description && String(item.description).trim()) {
            let desc = String(item.description).trim();
            if (window.translateText && typeof window.translateText === 'function') desc = window.translateText(desc);
            desc = desc.replace(/\s*\n\s*\n\s*/g, '<br><br>').replace(/\s*\n\s*/g, ' ');
            descHtml = `<div class="equip-desc">${desc}</div>`;
        }
        let loreHtml = '';
        if (window.ItemSystemUtils && typeof window.ItemSystemUtils.loreFor === 'function') {
            const loreText = window.ItemSystemUtils.loreFor(item);
            if (loreText) loreHtml = `<div class="equip-lore">${loreText}</div>`;
        }

        const isCurrentlyWorn = actor.equips().includes(item);
        const actionButtons = isCurrentlyWorn
            ? `<button class="equip-action-btn unequip-now-btn focusable" data-slot="${targetSlot}">${t.unequip || 'Unequip'}</button>`
            : `<button class="equip-action-btn equip-now-btn focusable" data-slot="${targetSlot}">${t.equip || 'Equip'}</button>`;

        return `
            <div class="paperdoll-detail-view">
                <div class="detail-header">
                    <div class="detail-item-title">${escapeHtml(item.name)}</div>
                </div>
                <div class="detail-preview-row">
                    <div class="detail-preview-box">
                        <canvas id="weapon-preview-canvas-inspect" width="220" height="200"></canvas>
                    </div>
                    <div class="inspect-spec-grid stats-grid stats-grid--2col equip-stats-col detail-stats-side">${statsGridHTML}</div>
                </div>
                <div class="bottom-stats-block">
                    ${dtHtml}
                    <div class="equip-lore-col">
                        ${descHtml}
                        ${loreHtml}
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
                    const cat = equipCategoryOf(item);
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

                let statBadge = '';
                if (item.params) {
                    if (item.params[2] > 0) statBadge = `<span class="equip-card-stat">+${item.params[2]} ATK</span>`;
                    else if (item.params[3] > 0) statBadge = `<span class="equip-card-stat">+${item.params[3]} DEF</span>`;
                }

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
                                <span class="equip-card-name">${escapeHtml(item.name)}</span>
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
                        <div class="left-commands-area"></div>
                        <div class="left-content-area equip-main-content"></div>
                    </div>
                    <div class="right-page">
                        <div class="right-page-header">
                            <div class="companion-switcher" id="equip-companion-switcher"></div>
                        </div>
                        <div class="right-content-area"></div>
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
        this.cleanup3DWeaponPreview();
        rightArea.innerHTML = this._buildRightPageHTML();
        if (this._viewMode === 'detail') {
            this.init3DWeaponPreview();
            this._bindStatTooltips();
        }
        this._bindRightPageEvents();
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

        if (!targetItem) {
            const fits = window.HandSlots ? window.HandSlots.slotFits(targetActor, targetSlotId, srcItem) : true;
            if (!fits) {
                /* silent equip menu */
                return;
            }
            /* silent equip menu */
            srcActor.changeEquip(srcSlotId, null);
            targetActor.changeEquip(targetSlotId, srcItem);
        } else {
            const fitsTarget = window.HandSlots ? window.HandSlots.slotFits(targetActor, targetSlotId, srcItem) : true;
            const fitsSrc = window.HandSlots ? window.HandSlots.slotFits(srcActor, srcSlotId, targetItem) : true;
            if (!fitsTarget || !fitsSrc) {
                /* silent equip menu */
                return;
            }
            /* silent equip menu */
            srcActor.changeEquip(srcSlotId, targetItem);
            targetActor.changeEquip(targetSlotId, srcItem);
        }
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
                } else {
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
                }
            });

            slotEl.addEventListener('dragleave', () => {
                slotEl.classList.remove('drag-over');
            });

            slotEl.addEventListener('drop', (e) => {
                e.preventDefault();
                slotEl.classList.remove('drag-over');
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
                this._inspectedItem = equipped;
                this._inspectedSlotIdx = slotId;
                this._viewMode = 'detail';
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
                    if (this._activeTab !== tabId) {
                        if (typeof SoundManager !== 'undefined' && SoundManager.playCursor) SoundManager.playCursor();
                        this._activeTab = tabId;
                        this._gridIndex = 0;
                        this._refreshRightPage();
                    }
                });
            });

            const items = this.getFilteredPartyEquipment();
            container.querySelectorAll('.equip-card').forEach(card => {
                const idx = parseInt(card.getAttribute('data-idx'));
                const item = items[idx];
                if (!item) return;

                card.addEventListener('dragstart', (e) => {
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

                card.addEventListener('dragend', () => {
                    this._clearSlotHighlights();
                    this._draggedItem = null;
                    this._dragSource = null;
                });

                card.addEventListener('click', () => {
                    /* silent equip menu */
                    this._inspectedItem = item;
                    this._inspectedSlotIdx = -1;
                    this._viewMode = 'detail';
                    this._refreshRightPage();
                });
            });

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
        container.querySelectorAll('.stat-row[data-stat]').forEach(row => {
            const key   = row.getAttribute('data-stat');
            const label = ((row.querySelector('.stat-label') || {}).textContent || key).trim();
            row.addEventListener('mousemove',  (e) => showStatTooltip(e, key, label));
            row.addEventListener('mouseleave', hideStatTooltip);
        });
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
            const targetSlot = window.HandSlots ? window.HandSlots.emptySlotFor(this._actor, selected) : 0;
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
        for (const dir of ['up', 'down', 'left', 'right']) {
            if (this._wasdHeld[dir]) {
                this._wasdHoldFrames[dir]++;
                const t = this._wasdHoldFrames[dir];
                if (t > Input.keyRepeatWait && (t - Input.keyRepeatWait) % Input.keyRepeatInterval === 0) {
                    this._wasdInput[dir] = true;
                }
            } else {
                this._wasdHoldFrames[dir] = 0;
            }
        }

        const isDown  = Input.isTriggered('down')  || Input.isRepeated('down')  || this._wasdInput.down;
        const isUp    = Input.isTriggered('up')    || Input.isRepeated('up')    || this._wasdInput.up;
        const isRight = Input.isTriggered('right') || Input.isRepeated('right') || this._wasdInput.right;
        const isLeft  = Input.isTriggered('left')  || Input.isRepeated('left')  || this._wasdInput.left;
        this._wasdInput.up = this._wasdInput.down = this._wasdInput.left = this._wasdInput.right = false;

        if (enableSwitching) {
            if (Input.isTriggered('pageup')) {
                const party = $gameParty.allMembers();
                if (party.length > 1) {
                    this.switchToPreviousCharacter();
                    const members = this.partyMembers();
                    const mIdx = members.indexOf(this._actor);
                    if (mIdx >= 0) this._memberIndex = mIdx;
                    if (this._activeArea === 'paperdoll') this._updateSlotHighlight();
                }
                return;
            }
            if (Input.isTriggered('pagedown')) {
                const party = $gameParty.allMembers();
                if (party.length > 1) {
                    this.switchToNextCharacter();
                    const members = this.partyMembers();
                    const mIdx = members.indexOf(this._actor);
                    if (mIdx >= 0) this._memberIndex = mIdx;
                    if (this._activeArea === 'paperdoll') this._updateSlotHighlight();
                }
                return;
            }
        }

        const isOk     = Input.isTriggered('ok');
        const isCancel = Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled();

        if (this._viewMode === 'detail') {
            if (isCancel) {
                if (typeof SoundManager !== 'undefined' && SoundManager.playCancel) SoundManager.playCancel();
                this._viewMode = 'paperdoll';
                this.cleanup3DWeaponPreview();
                this._refreshRightPage();
                this._activeArea = 'grid';
                this._updateInventoryHighlight();
                return;
            }

            const container = document.getElementById('equip-container');
            const btns = container ? container.querySelectorAll('.detail-actions-row .equip-action-btn') : [];

            if (isLeft || isRight) {
                if (btns.length > 1) {
                    this._detailBtnIndex = (this._detailBtnIndex === 0) ? 1 : 0;
                    this._updateDetailButtonsHighlight();
                }
                return;
            }

            if (isOk) {
                const activeBtn = btns[this._detailBtnIndex];
                if (activeBtn) {
                    activeBtn.click();
                } else {
                    const target = this._inspectedSlotIdx >= 0 ? this._inspectedSlotIdx : (window.HandSlots ? window.HandSlots.emptySlotFor(this._actor, this._inspectedItem) : 0);
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
            } else if (isLeft) {
                if (this._gridIndex > 0) {
                    this._gridIndex--;
                    this._updateInventoryHighlight();
                }
            } else if (isRight) {
                if (this._gridIndex < items.length - 1) {
                    this._gridIndex++;
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

            if (isRight) {
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
                } else if (this._memberIndex < members.length - 1) {
                    this._memberIndex++;
                    this._actor = members[this._memberIndex];
                    this._slotIndex = 0;
                    this._updateSlotHighlight();
                }
            } else if (isUp) {
                if (this._slotIndex >= 4) {
                    this._slotIndex -= 4;
                    this._updateSlotHighlight();
                } else if (this._memberIndex > 0) {
                    this._memberIndex--;
                    this._actor = members[this._memberIndex];
                    const prevSlotsCount = this._actor ? this._actor.equipSlots().length : 1;
                    this._slotIndex = Math.min(this._slotIndex, prevSlotsCount - 1);
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
                } else {
                    /* silent equip menu */
                }
            }
        }
    };
})();
