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
    if (!window.CharSwitcher) {
        window.CharSwitcher = {
            isControllerConnected() {
                const pads = navigator.getGamepads ? navigator.getGamepads() : [];
                for (let i = 0; i < pads.length; i++) {
                    if (pads[i] && pads[i].connected) return true;
                }
                return false;
            },
            // Hint HTML for the left/right of the switcher, per current input device.
            parts(memberCount) {
                if (!memberCount || memberCount <= 1) return { left: '', right: '' };
                if (this.isControllerConnected()) {
                    return {
                        left: '<span class="char-switch-hint">L</span>',
                        right: '<span class="char-switch-hint">R</span>'
                    };
                }
                return { left: '', right: '<span class="char-switch-hint">TAB</span>' };
            },
            // Hints + tabs row, without an outer wrapper (caller supplies one).
            inner(tabsRowHTML, memberCount) {
                const p = this.parts(memberCount);
                return p.left + tabsRowHTML + p.right;
            },
            // Hints + tabs row wrapped in a .companion-switcher flex row.
            wrap(tabsRowHTML, memberCount) {
                return `<div class="companion-switcher">${this.inner(tabsRowHTML, memberCount)}</div>`;
            },
            // Cycle characters via Tab (next) / Shift+Tab (previous), keyboard only.
            installTabKey(scene, onCycle) {
                if (scene._charSwitchTabListener) return;
                scene._charSwitchTabListener = (e) => {
                    if (e.key !== 'Tab') return;
                    e.preventDefault();
                    if (this.isControllerConnected()) return;
                    onCycle(e.shiftKey ? -1 : 1);
                };
                window.addEventListener('keydown', scene._charSwitchTabListener);
            },
            removeTabKey(scene) {
                if (scene._charSwitchTabListener) {
                    window.removeEventListener('keydown', scene._charSwitchTabListener);
                    scene._charSwitchTabListener = null;
                }
            }
        };
    }

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
        this._activeArea        = 'commands'; // 'commands' | 'slots' | 'inventory'
        this._commandIndex      = 0;          // 0: Equip, 1: Optimize, 2: Random, 3: Clear
        this._slotIndex         = 0;
        this._inventoryIndex    = 0;

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
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

                const scene = new THREE.Scene();
                scene.add(new THREE.AmbientLight(0xffffff, 0.95));
                const dl1 = new THREE.DirectionalLight(0xffffff, 0.7); dl1.position.set(3, 5, 4);   scene.add(dl1);
                const dl2 = new THREE.DirectionalLight(0xffffff, 0.4); dl2.position.set(-3, -5, -4); scene.add(dl2);

                const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 50);
                camera.position.set(0, 0, 2.7);

                let model = null;

                const setupModelPosition = (m) => {
                    const box    = new THREE.Box3().setFromObject(m);
                    const size   = box.getSize(new THREE.Vector3());
                    const center = box.getCenter(new THREE.Vector3());
                    m.position.sub(center);
                    const scaleFactor = 1.85 / (Math.max(size.x, size.y, size.z) || 1);
                    m.scale.set(scaleFactor, scaleFactor, scaleFactor);
                    m.rotation.set(0.1, -0.4, 0.35);
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

                let _previewLastTime = performance.now();
                const animate = () => {
                    previewEntry.rafId = requestAnimationFrame(animate);

                    const now     = performance.now();
                    const deltaMs = Math.min(now - _previewLastTime, 50);
                    _previewLastTime = now;

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

    Scene_Equip.prototype.init3DWeaponPreview = function () {
        this.cleanup3DWeaponPreview();

        // Whatever the first two hands are holding, shields included: a shield
        // has a model of its own, built through the weapon pipeline
        // (WeaponSystemProcedural.shieldWeaponFor).
        const equips  = this._hoverPreviewEquips || this._actor.equips();
        const weapons = [];
        // Keyed by the hand, not by how many cards have been filled: the card
        // for the second hand is canvas 1 even when the first hand is empty.
        [equips[0], equips[1]].forEach((item, index) => {
            const model = previewModelFor(item);
            if (model) weapons.push({ item: model, canvasId: 'weapon-preview-canvas-' + index });
        });
        if (weapons.length === 0) return;

        this._previewRenderers = [];
        weapons.forEach(wData => {
            const entry = window.Weapon3DPreview.mount(document.getElementById(wData.canvasId), wData.item);
            if (entry) this._previewRenderers.push(entry);
        });
    };

    Scene_Equip.prototype.cleanup3DWeaponPreview = function () {
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

    Scene_Equip.prototype.getInventoryItemsForSlot = function () {
        const actor   = this._actor;
        const slotId  = this._slotIndex;
        if (slotId < 0) return [];

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

    Scene_Equip.prototype._buildRightPageHTML = function () {
        const actor = this._actor;
        const lang  = ConfigManager.language || 'en';
        const t     = i18n[lang] || i18n['en'];

        // Build tempActor for stat-delta preview when browsing inventory
        let tempActor = null;
        if (this._activeArea === 'inventory') {
            const itemList = this.getInventoryItemsForSlot();
            if (itemList.length > 0) {
                this._inventoryIndex = Math.max(0, Math.min(itemList.length - 1, this._inventoryIndex));
                const selectedItem   = itemList[this._inventoryIndex];
                tempActor = JsonEx.makeDeepCopy(actor);
                tempActor.forceChangeEquip(this._slotIndex, selectedItem.isRemoveOption ? null : selectedItem);
            }
        }

        // Expose to 3D preview init
        this._hoverPreviewEquips = tempActor ? tempActor.equips() : null;

        // Weapon scaling: which base stat(s) the equipped weapon(s) scale on.
        // Instead of a separate "Scaling: STR" line, the scaling stat's own
        // label in the grid below is picked out in gold.
        // Whatever is in the character's hands, in slot order. With more than
        // two hands the first two are the ones the page reports on.
        const holder  = tempActor || actor;
        const held    = window.HandSlots ? window.HandSlots.heldItems(holder)
                                         : [holder.equips()[0], holder.equips()[1]];
        const [weapon1, weapon2] = held || [];
        const getCodes = (s) => {
            if (!s) return [];
            if (s === 'MIX') return ['STR', 'DEX'];
            if (s === 'ARC') return ['STR', 'INT'];
            return [s];
        };

        const s1 = actor.getWeaponScalingType(weapon1);
        const s2 = actor.getWeaponScalingType(weapon2);
        const scalingCodes = new Set([...getCodes(s1), ...getCodes(s2)]);
        if (scalingCodes.size === 0) scalingCodes.add('STR');

        // Proficiency grade (F to S) per scaling code, read off the weapon that
        // earns it. Shown right of the stat's own abbreviation in the grid below.
        const weaponProf = window.WeaponProficiency;
        const codeGradeMap = {};
        if (weaponProf && weapon1 && DataManager.isWeapon(weapon1)) {
            const grade1 = weaponProf.gradeFor(actor, weapon1);
            getCodes(s1).forEach(code => { codeGradeMap[code] = grade1; });
        }
        if (weaponProf && weapon2 && DataManager.isWeapon(weapon2)) {
            const grade2 = weaponProf.gradeFor(actor, weapon2);
            getCodes(s2).forEach(code => { codeGradeMap[code] = grade2; });
        }

        // Base + alchemical stats, interleaved into one 3-column grid: the
        // custom stats (Arcane/Substance/Stealth/Intimidation) ride as plain
        // numbers in the third column rather than their own bars.
        const cBefore = actor.calculateCustomStats();
        const cAfter  = tempActor ? tempActor.calculateCustomStats() : cBefore;
        const gridStats = [
            { label: t.hp,  code: null,  key: 'HP',  percent: false, valBefore: actor.mhp, valAfter: tempActor ? tempActor.mhp : actor.mhp },
            { label: t.mp,  code: null,  key: 'MP',  percent: false, valBefore: actor.mmp, valAfter: tempActor ? tempActor.mmp : actor.mmp },
            { label: t.arcane, code: null, key: 'ARCANE', percent: true, valBefore: cBefore.arcane, valAfter: cAfter.arcane },

            { label: t.str, code: 'STR', key: 'STR', percent: false, valBefore: actor.atk, valAfter: tempActor ? tempActor.atk : actor.atk },
            { label: t.con, code: 'CON', key: 'CON', percent: false, valBefore: actor.def, valAfter: tempActor ? tempActor.def : actor.def },
            { label: t.substance, code: null, key: 'SUBSTANCE', percent: true, valBefore: cBefore.substance, valAfter: cAfter.substance },

            { label: t.int, code: 'INT', key: 'INT', percent: false, valBefore: actor.mat, valAfter: tempActor ? tempActor.mat : actor.mat },
            { label: t.wis, code: 'WIS', key: 'WIS', percent: false, valBefore: actor.mdf, valAfter: tempActor ? tempActor.mdf : actor.mdf },
            { label: t.stealth, code: null, key: 'STEALTH', percent: true, valBefore: cBefore.stealth, valAfter: cAfter.stealth },

            { label: t.dex, code: 'DEX', key: 'DEX', percent: false, valBefore: actor.agi, valAfter: tempActor ? tempActor.agi : actor.agi },
            { label: t.psi, code: 'PSI', key: 'PSI', percent: false, valBefore: actor.luk, valAfter: tempActor ? tempActor.luk : actor.luk },
            { label: t.intimidation, code: null, key: 'INTIMIDATION', percent: true, valBefore: cBefore.intimidation, valAfter: cAfter.intimidation }
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
                if (tempActor && modDiff !== 0) {
                    modBonusHtml = `<span class="stat-diff equip-stat-diff ${modDiff > 0 ? 'positive' : 'negative'}">[${modDiff > 0 ? '+' + modDiff : modDiff} Mod]</span>`;
                }
            }

            statsGridHTML += `
                <div class="inspect-spec-row stat-row${isScaling ? ' stat-row--scaling' : ''}"${stat.key ? ` data-stat="${stat.key}"` : ''}>
                    <span class="${labelCls}">${labelHtml}</span>
                    <span class="inspect-spec-value stat-val-container">
                        <span class="${valCls}">${valBeforeFormatted}</span>
                        ${tempActor && diff !== 0 ? `➔ <span class="stat-val-new">${valAfterFormatted}</span>` : ''}
                        ${stat.code ? modBonusHtml : diffHtml}
                    </span>
                </div>`;
        }

        // Weapon preview box
        const w0 = weapon1;
        const w1 = weapon2;
        const hasW0   = !!previewModelFor(w0);
        const hasW1   = !!previewModelFor(w1);
        const hasThree = typeof THREE !== 'undefined';

        // The bench stands wherever the party stands: the ground behind the
        // pieces is the battleground this map fights on (BattleSystem/
        // AnimatedBattleBackgrounds.js), not a grey box.
        const groundImg = (typeof window.getMapBattlebackImage === 'function')
            ? window.getMapBattlebackImage() : null;
        const groundStyle = groundImg
            ? ` style="background-image:url('${groundImg.replace(/['"]/g, '')}');"` : '';

        let previewBoxHTML = '<div class="weapon-previews-container">';

        const cardClass = (hasW0 && hasW1) ? 'weapon-preview-card--half' : 'weapon-preview-card--single';

        // The preview is the weapon's real 3D model, the same one the battle
        // overlay holds. Without three.js there is nothing to draw it with, so
        // the card falls back to the item's icon on its rarity ring.
        const addCardHTML = (weapon, canvasId) => {
            if (hasThree) {
                return `<div class="weapon-preview-card ${cardClass}"${groundStyle}><canvas id="weapon-preview-canvas-${canvasId}" width="140" height="380"></canvas></div>`;
            }
            const iconIdx    = weapon.iconIndex;
            const iconStyle  = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
            const rarityCls  = window.ItemSystemUtils ? window.ItemSystemUtils.itemRarityClass(weapon) : 'rarity--common';
            const inner = `<div class="weapon-preview-icon-wrapper"><div class="weapon-preview-icon-circle ${rarityCls}"><div class="item-icon" style="${iconStyle}"></div></div></div>`;
            return `<div class="weapon-preview-card ${cardClass}"${groundStyle}>${inner}</div>`;
        };

        if (hasW0) previewBoxHTML += addCardHTML(w0, 0);
        if (hasW1) previewBoxHTML += addCardHTML(w1, 1);
        previewBoxHTML += '</div>';

        // Dynamic lore for the previewed/equipped item (resolves {nation}/{leader}/... tokens).
        let loreItem = null;
        if (this._activeArea === 'inventory') {
            const list = this.getInventoryItemsForSlot();
            const sel  = list[this._inventoryIndex];
            if (sel && !sel.isRemoveOption) loreItem = sel;
        } else if (this._slotIndex != null) {
            loreItem = actor.equips()[this._slotIndex];
        }
        // Short description (what it does) above the combinatorial lore.
        let loreHTML = '';
        if (loreItem) {
            const dt = (loreItem.meta && loreItem.meta.DamageType) ||
                (loreItem.note && (loreItem.note.match(/<DamageType:\s*([^>]+)>/i) || [])[1]);
            if (dt) {
                loreHTML += `<div class="equip-damage-type"><span class="equip-damage-type-label">${T('Equip.damageType')}:</span> <strong>${escapeHtml(String(dt).trim())}</strong></div>`;
            }
            const wtype = DataManager.isWeapon(loreItem) ? ($dataSystem.weaponTypes[loreItem.wtypeId] || '') : '';
            if (wtype) {
                loreHTML += `<div class="equip-damage-type"><span class="equip-damage-type-label">${T('Equip.weaponType')}:</span> <strong>${escapeHtml(String(wtype).trim())}</strong></div>`;
            }
        }
        if (loreItem && loreItem.description && String(loreItem.description).trim()) {
            let desc = String(loreItem.description).trim();
            if (window.translateText && typeof window.translateText === 'function') desc = window.translateText(desc);
            // Database descriptions are hard-wrapped for the message window;
            // only a blank line is a real break here, the rest reflows.
            desc = desc.replace(/\s*\n\s*\n\s*/g, '<br><br>').replace(/\s*\n\s*/g, ' ');
            loreHTML += `<div class="equip-desc">${desc}</div>`;
        }
        if (loreItem && window.ItemSystemUtils && typeof window.ItemSystemUtils.loreFor === 'function') {
            const loreText = window.ItemSystemUtils.loreFor(loreItem);
            if (loreText) loreHTML += `<div class="equip-lore">${loreText}</div>`;
        }

        return `
            <div class="equip-right-content ui-detail">
                ${previewBoxHTML}
                <div class="bottom-stats-block">
                    <div class="inspect-spec-grid stats-grid stats-grid--2col equip-stats-col">${statsGridHTML}</div>
                    <div class="equip-lore-col">${loreHTML}</div>
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
        const useItalian  = ConfigManager.language === 'it';

        // ── Left: command bar ──────────────────────────────────────────────────

        const commands      = ['equip', 'optimize', 'random', 'clear'];
        const commandLabels = [t.equip, t.optimize, t.random, t.clear];
        // The command rail is the same rail the Skills menu wears: the backpack's
        // own chips, so a row of tabs reads the same wherever it is met.
        let commandsBtnsHTML = '';
        commands.forEach((cmd, idx) => {
            let cls = 'backpack-tab';
            if (idx === this._commandIndex && this._activeArea === 'commands') cls += ' active selected';  // i18n-ignore  css classes
            commandsBtnsHTML += `<div class="${cls}" data-cmd="${cmd}">${commandLabels[idx]}</div>`;
        });

        const allMembers = $gameParty.allMembers();
        let tabsHTML = '';
        allMembers.forEach((member, idx) => {
            const sel = member === actor ? 'selected' : '';
            tabsHTML += `<div class="companion-tab ${sel}" data-actor-idx="${idx}">${member.name()}</div>`;
        });

        const switcherHTML = enableSwitching
            ? window.CharSwitcher.inner(`<div class="companion-tabs-row">${tabsHTML}</div>`, allMembers.length)
            : `<div class="companion-tabs-row">${tabsHTML}</div>`;

        const commandBarHTML = `
            <div class="equip-command-bar">
                <div class="backpack-tabs equip-commands">
                    <div class="backpack-tabs-row">${commandsBtnsHTML}</div>
                </div>
            </div>`;

        // ── Left: main content (slots or inventory) ────────────────────────────

        let mainContentHTML = '';
        const backBtnText   = T('Equip.back');

        if (this._activeArea === 'inventory') {
            const itemList  = this.getInventoryItemsForSlot();
            const slotName  = actor.equipSlotName(this._slotIndex) || t.emptySlot;

            mainContentHTML = `
                <div class="inventory-header">
                    <span>${slotName}</span>
                    <span class="inventory-back-btn" id="inventory-back">◀ ${t.clear}</span>
                </div>`;

            if (itemList.length === 0) {
                mainContentHTML += `<div class="placeholder-message">${useItalian ? 'Nessun equipaggiamento disponibile...' : 'No matching equipment available...'}</div>`;
            } else {
                mainContentHTML += '<div class="backpack-grid equip-pick-grid">';
                const shortName = k => T('Equip.short.' + k);
                const paramNames = [shortName('hp'), shortName('mp'), shortName('str'), shortName('con'),
                                    shortName('int'), shortName('wis'), shortName('dex'), shortName('psi')];
                const getParams  = a => [a.mhp, a.mmp, a.atk, a.def, a.mat, a.mdf, a.agi, a.luk];
                const beforeParams = getParams(actor);
                // Mutate _equips directly rather than through changeEquip/forceChangeEquip:
                // param() already reads traits (including PARAM-rate modifiers like the
                // percentage boosts/penalties some weapons carry) straight off the
                // battler's live equips, and going through the change hooks would also
                // fire saveCustomStatsToVariables for every row in the list.
                const diffActor = JsonEx.makeDeepCopy(actor);
                // The bench walks the same lines the backpack walks: a heading
                // opens each type, the rows under it are pockets, and the
                // layout the cursor moves through is recorded as it is built.
                this._invLayout = [];
                let row = [];
                let lastGroup = null;
                const closeRow = () => { if (row.length) { this._invLayout.push(row); row = []; } };
                itemList.forEach((item, idx) => {
                    const focused = idx === this._inventoryIndex ? 'selected' : '';
                    if (item.isRemoveOption) {
                        closeRow();
                        this._invLayout.push([idx]);
                        mainContentHTML += `
                            <div class="item-slot equip-pick-row equip-pick-row--full ${focused}" data-idx="${idx}">
                                <div class="item-icon-empty">✖</div>
                                <div class="item-slot-info">
                                    <div class="item-slot-name inventory-remove-name">${item.name}</div>
                                </div>
                            </div>`;
                        return;
                    }
                    const group = equipGroupOf(item);
                    if (group !== lastGroup) {
                        lastGroup = group;
                        closeRow();
                        mainContentHTML += `<div class="backpack-group-title">${escapeHtml(group)}</div>`;
                    }
                    if (row.length >= 3) closeRow();
                    row.push(idx);

                    const iconIdx   = item.iconIndex;
                    const iconStyle = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
                    const rarity    = window.ItemSystemUtils.getItemRarity(item);
                    const gi = new Game_Item();
                    gi.setObject(item);
                    diffActor._equips[this._slotIndex] = gi;
                    const afterParams = getParams(diffActor);
                    // Only the stats this piece actually moves, as short signed
                    // chips; the full description lives on the right page.
                    const paramDesc  = [];
                    for (let p = 0; p < 8; p++) {
                        const delta = afterParams[p] - beforeParams[p];
                        if (delta !== 0) {
                            const cls = delta > 0 ? 'positive' : 'negative';
                            paramDesc.push(`<span class="equip-delta-chip ${cls}">${paramNames[p]} ${delta>0?'+':''}${delta}</span>`);
                        }
                    }
                    // Weapons below Intermediate proficiency fight at reduced
                    // stats; flag the tier the character is actually at.
                    const prof = window.WeaponProficiency;
                    const untrained = prof && DataManager.isWeapon(item) && prof.isUntrained(actor, item);
                    const profTag = untrained
                        ? `<span class="item-proficiency-tag">${prof.levelNameFor(actor, item) || t.untrained}</span>`
                        : '';
                    mainContentHTML += `
                        <div class="item-slot equip-pick-row ${focused}" data-idx="${idx}">
                            <div class="item-rarity-bar ${window.ItemSystemUtils.rarityClass(rarity)}"></div>
                            <div class="item-slot-icon"><div class="item-icon" style="${iconStyle}"></div></div>
                            <div class="item-slot-info">
                                <div class="item-name-row"><span class="item-slot-name">${item.name}</span>${profTag}</div>
                                <div class="item-slot-meta equip-delta-row">${paramDesc.join('')}</div>
                            </div>
                        </div>`;
                });
                closeRow();
                mainContentHTML += '</div>';
            }
        } else {
            const slots  = actor.equipSlots();
            const equips = actor.equips();
            slots.forEach((etypeId, idx) => {
                const slotTypeName  = actor.equipSlotName(idx) || t.emptySlot;
                const equippedItem  = equips[idx];
                const focused       = (idx === this._slotIndex && this._activeArea === 'slots') ? 'focused' : '';

                let slotItemHTML = '';
                if (equippedItem) {
                    const iconIdx   = equippedItem.iconIndex;
                    const iconStyle = `background:url('img/system/IconSet.png') -${(iconIdx%16)*32}px -${Math.floor(iconIdx/16)*32}px no-repeat;`;
                    const rarity    = window.ItemSystemUtils.getItemRarity(equippedItem);
                    const prof      = window.WeaponProficiency;
                    const profTag   = (prof && DataManager.isWeapon(equippedItem) && prof.isUntrained(actor, equippedItem))
                        ? `<span class="item-proficiency-tag">${prof.levelNameFor(actor, equippedItem) || t.untrained}</span>`
                        : '';
                    slotItemHTML = `
                        <div class="item-rarity-bar ${window.ItemSystemUtils.rarityClass(rarity)}"></div>
                        <div class="item-icon" style="${iconStyle}"></div>
                        <span class="item-name">${equippedItem.name}</span>${profTag}`;
                } else {
                    slotItemHTML = `<div class="item-icon-empty">☐</div><span class="item-name-empty">${t.emptySlot}</span>`;
                }

                mainContentHTML += `
                    <div class="equip-slot-row ${focused}" data-idx="${idx}">
                        <div class="slot-label-col">${slotTypeName}</div>
                        <div class="slot-item-col">${slotItemHTML}</div>
                    </div>`;
            });
        }

        // ── Build / reuse DOM structure ────────────────────────────────────────

        let spread = container.querySelector('.book-spread');
        if (!spread) {
            container.innerHTML = `
                <div class="book-spread">
                    <div class="left-page">
                        <div class="page-header-bar">
                            <div class="back-button focusable">${backBtnText}</div>
                            <h2 class="title">${t.equip}</h2>
                        </div>
                        <div class="left-commands-area"></div>
                        <div class="left-content-area equip-main-content"></div>
                    </div>
                    <div class="right-page">
                        <div class="companion-switcher" id="equip-companion-switcher"></div>
                        <div class="right-content-area"></div>
                    </div>
                </div>`;
            spread = container.querySelector('.book-spread');

            spread.querySelector('.back-button').addEventListener('click', (e) => {
                e.stopPropagation();
                SoundManager.playCancel();
                SceneManager._scene.popScene();
            });

            const leftCA = spread.querySelector('.left-content-area');
            if (leftCA) leftCA.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        }

        // Selective area updates
        const switcherSlot = spread.querySelector('#equip-companion-switcher');
        if (switcherSlot) switcherSlot.innerHTML = switcherHTML;
        spread.querySelector('.left-commands-area').innerHTML = commandBarHTML;

        const leftContentArea = spread.querySelector('.left-content-area');
        const savedScroll     = leftContentArea.scrollTop;
        leftContentArea.innerHTML = mainContentHTML;
        leftContentArea.scrollTop = savedScroll;

        this.cleanup3DWeaponPreview();
        spread.querySelector('.right-content-area').innerHTML = this._buildRightPageHTML();
        this.init3DWeaponPreview();

        // ── Mouse / click bindings ─────────────────────────────────────────────

        this._bindStatTooltips();

        container.querySelectorAll('.equip-commands .backpack-tab').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                this._commandIndex = idx;
                this._activeArea   = 'commands';
                this.executeCommandAction(btn.getAttribute('data-cmd'));
            });
        });

        container.querySelectorAll('.companion-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const idx    = parseInt(tab.getAttribute('data-actor-idx'));
                const target = $gameParty.allMembers()[idx];
                if (target && target !== this._actor) {
                    SoundManager.playOk();
                    this._actor             = target;
                    this._currentActorIndex = $gameParty.allMembers().indexOf(target);
                    this._refreshDOM();
                }
            });
        });

        if (this._activeArea !== 'inventory') {
            container.querySelectorAll('.equip-slot-row').forEach(row => {
                row.addEventListener('click', () => {
                    this._slotIndex  = parseInt(row.getAttribute('data-idx'));
                    this._activeArea = 'slots';
                    SoundManager.playOk();
                    this.openInventorySelection();
                });
            });
        } else {
            const backBtn = container.querySelector('#inventory-back');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    this._activeArea = 'slots';
                    SoundManager.playCancel();
                    this._refreshDOM();
                });
            }
            container.querySelectorAll('.equip-pick-row').forEach(row => {
                row.addEventListener('mouseover', () => {
                    const idx = parseInt(row.getAttribute('data-idx'));
                    if (idx !== this._inventoryIndex) {
                        this._inventoryIndex = idx;
                        this._updateInventoryHighlight();
                    }
                });
                row.addEventListener('click', () => {
                    this._inventoryIndex = parseInt(row.getAttribute('data-idx'));
                    this.equipSelectedItem();
                });
            });
        }
    };

    // =============================================================================
    // Selective highlight updates (avoids full DOM rebuild on navigation)
    // =============================================================================

    Scene_Equip.prototype._updateSlotHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.querySelectorAll('.equip-slot-row').forEach((row, idx) => {
            row.classList.toggle('focused', idx === this._slotIndex);
        });
        const focused = container.querySelector('.equip-slot-row.focused');
        if (focused) focused.scrollIntoView({ block: 'nearest' });
        SoundManager.playCursor();
    };

    // Hovering a stat row explains what that stat does, on the same card the
    // character sheet uses. The right page is rebuilt on every selection, so
    // the rows are rebound each time it is.
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

    Scene_Equip.prototype._updateInventoryHighlight = function () {
        const container = document.getElementById('equip-container');
        if (!container) return;
        container.querySelectorAll('.equip-pick-row').forEach(row => {
            const idx = parseInt(row.getAttribute('data-idx'));
            row.classList.toggle('selected', idx === this._inventoryIndex);
        });
        const focused = container.querySelector('.equip-pick-row.selected');
        if (focused) focused.scrollIntoView({ block: 'nearest' });

        // Rebuild only the right page (stat deltas change per selected item)
        this.cleanup3DWeaponPreview();
        const rightArea = container.querySelector('.right-content-area');
        if (rightArea) rightArea.innerHTML = this._buildRightPageHTML();
        this.init3DWeaponPreview();
        this._bindStatTooltips();
        SoundManager.playCursor();
    };

    // =============================================================================
    // Actions
    // =============================================================================

    Scene_Equip.prototype.openInventorySelection = function () {
        this._activeArea     = 'inventory';
        this._inventoryIndex = 0;
        this._refreshDOM();
    };

    Scene_Equip.prototype.equipSelectedItem = function () {
        const itemList = this.getInventoryItemsForSlot();
        if (itemList.length === 0) return;
        const selected = itemList[this._inventoryIndex];
        this._actor.changeEquip(this._slotIndex, selected.isRemoveOption ? null : selected);
        SoundManager.playEquip();
        this._activeArea = 'slots';
        this._refreshDOM();
    };

    Scene_Equip.prototype.executeCommandAction = function (cmd) {
        switch (cmd) {
            case 'equip':
                this._activeArea = 'slots';
                this._slotIndex  = 0;
                SoundManager.playOk();
                break;
            case 'optimize':
                this._actor.optimizeEquipments();
                SoundManager.playEquip();
                break;
            case 'random':
                this._actor.randomEquipments();
                SoundManager.playEquip();
                break;
            case 'clear':
                this._actor.clearEquipments();
                SoundManager.playEquip();
                break;
        }
        this._refreshDOM();
    };

    // =============================================================================
    // Keyboard & Gamepad input
    // =============================================================================

    Scene_Equip.prototype.updateUIEquipInput = function () {
        // WASD hold-repeat simulation
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

        // L1/R1, character switching from anywhere in the scene
        if (enableSwitching) {
            if (Input.isTriggered('pageup'))   { this.switchToPreviousCharacter(); return; }
            if (Input.isTriggered('pagedown')) { this.switchToNextCharacter();     return; }
        }

        const isOk       = Input.isTriggered('ok');
        const isCancel    = Input.isTriggered('escape') || Input.isTriggered('cancel') || TouchInput.isCancelled();

        // ── Commands area ──────────────────────────────────────────────────────
        if (this._activeArea === 'commands') {
            if (isRight) {
                this._commandIndex = (this._commandIndex + 1) % 4;
                SoundManager.playCursor();
                this._refreshDOM();
            } else if (isLeft) {
                this._commandIndex = (this._commandIndex - 1 + 4) % 4;
                SoundManager.playCursor();
                this._refreshDOM();
            } else if (isDown) {
                this._activeArea = 'slots';
                this._slotIndex  = 0;
                SoundManager.playCursor();
                this._refreshDOM();
            } else if (isOk) {
                const cmds = ['equip', 'optimize', 'random', 'clear'];
                this.executeCommandAction(cmds[this._commandIndex]);
            } else if (isCancel) {
                SoundManager.playCancel();
                this.popScene();
            }

        // ── Slots area ─────────────────────────────────────────────────────────
        } else if (this._activeArea === 'slots') {
            const maxSlots = this._actor.equipSlots().length;

            if (isDown) {
                if (this._slotIndex < maxSlots - 1) {
                    this._slotIndex++;
                    this._updateSlotHighlight();
                }
            } else if (isUp) {
                if (this._slotIndex === 0) {
                    this._activeArea = 'commands';
                    SoundManager.playCursor();
                    this._refreshDOM();
                } else {
                    this._slotIndex--;
                    this._updateSlotHighlight();
                }
            } else if (enableSwitching && isLeft) {
                this.switchToPreviousCharacter();
            } else if (enableSwitching && isRight) {
                this.switchToNextCharacter();
            } else if (isOk) {
                SoundManager.playOk();
                this.openInventorySelection();
            } else if (isCancel) {
                this._activeArea = 'commands';
                SoundManager.playCancel();
                this._refreshDOM();
            }

        // ── Inventory area, 2D grid navigation ────────────────────────────────
        } else if (this._activeArea === 'inventory') {
            const itemList = this.getInventoryItemsForSlot();
            const total    = itemList.length;
            const idx      = this._inventoryIndex;
            // The rows are the ones the page was actually built with: type
            // headings break a line early, so counting three at a time would
            // walk off the list the reader sees.
            const layout   = this._invLayout && this._invLayout.length
                ? this._invLayout
                : (() => { const rows = []; for (let i = 0; i < total; i += 3) rows.push(itemList.slice(i, i + 3).map((_, k) => i + k)); return rows; })();
            let r = -1, c = 0;
            for (let i = 0; i < layout.length; i++) {
                const at = layout[i].indexOf(idx);
                if (at >= 0) { r = i; c = at; break; }
            }
            const moveTo = (row, col) => {
                const line = layout[row];
                if (!line || !line.length) return;
                const target = line[Math.min(col, line.length - 1)];
                if (target != null && target !== this._inventoryIndex) {
                    this._inventoryIndex = target;
                    this._updateInventoryHighlight();
                }
            };

            if (isOk) {
                this.equipSelectedItem();
            } else if (isCancel) {
                this._activeArea = 'slots';
                SoundManager.playCancel();
                this._refreshDOM();
            } else if (r < 0) {
                // Nothing focused yet: any direction lands on the first row.
                moveTo(0, 0);
            } else if (isDown) {
                moveTo(r + 1, c);
            } else if (isUp) {
                moveTo(r - 1, c);
            } else if (isRight) {
                if (c + 1 < layout[r].length) moveTo(r, c + 1);
                else moveTo(r + 1, 0);
            } else if (isLeft) {
                if (c > 0) moveTo(r, c - 1);
                else if (r > 0) moveTo(r - 1, (layout[r - 1] || []).length - 1);
            }
        }
    };
})();
