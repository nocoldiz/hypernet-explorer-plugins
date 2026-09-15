/*:
 * @target MZ
 * @plugindesc Monster Tournament Betting v2.2.0 (3D arena, real battles, themed HUD)
 * @author Omni-Lex
 * @version 2.2.0
 * @description Bet on monsters and watch them fight a genuine RPG Maker battle
 * inside a 3D PSX arena, with skills, states, buffs and Effekseer animations.
 * The HUD is a themed HTML overlay (omega_tower / archive_foundation), not RPG
 * Maker windows.
 *
 * @help MonsterTournament.js
 *
 * Single-elimination monster tournament. You pick a fighter, place a bet of the
 * configured token item, and only battles involving your monster are shown.
 *
 * The fights are REAL RPG Maker battles run headlessly between two Game_Enemy
 * instances: the engine's own AI picks each monster's skills, pays their costs,
 * rolls hit/evade/crit, applies the damage formulas, inflicts states, raises
 * buffs/debuffs and ticks slip damage at end of turn. The simulated battle is
 * then replayed in a real-time 3D arena (procedural window.Battler3D models +
 * the shared PSX shader), with each skill's actual MZ/Effekseer animation played
 * over the target and floating damage / state / buff popups.
 *
 * The camera is a free orbit you control at any time - drag the mouse, use WASD,
 * or push the controller right stick to pan around the arena.
 *
 * The HUD (title, fighter stats, betting, banners, the "X uses Skill!" line) is
 * rendered as an HTML overlay styled from the active theme's CSS variable tokens,
 * so it matches every other menu instead of using RPG Maker windows. All HUD
 * navigation goes through the engine Input layer, so keyboard, gamepad and the
 * project's WASD/global key mapper drive it identically:
 *   Selection : Left/Right cycle, OK select, Cancel exit
 *   Betting   : Left/Right +/-1, Up/Down +/-10, OK confirm, Cancel back
 *   Re-bet    : Up/Down choose, OK confirm
 *
 * Requirements (already in the project):
 *   - three.min.js + GLTFLoader.js (index.html)
 *   - Battler3D/3DBattlerSystem.js  (provides window.Battler3D)
 *   - Battler3D/PSXShader.js        (provides window.PSXShader)
 *   - The Battler3D family plugins   (provide the registered archetypes)
 *
 * Selection controls:
 *   - Left / Right : cycle through the eight contenders
 *   - Enter        : choose the highlighted monster
 *
 * Betting controls:
 *   - Left / Right : adjust the bet by 1
 *   - Up / Down    : adjust the bet by 10
 *
 * The fights are fully automatic: attacker lunges and defender reactions play
 * on their own; you just watch (and pan the camera if you like).
 *
 * @param bettingItemId
 * @text Betting Item ID
 * @desc ID of the item used for betting (124 = Arcade Token)
 * @type number
 * @default 124
 *
 * @command startTournament
 * @text Start Tournament
 * @desc Start the monster tournament betting game
 *
 * @command OpenSlamgrimorie
 * @text Open Slamgrimorie
 * @desc Open the wrestling desk on the HypernetOS desktop: both promotions, tonight's card and the book.
 *
 * @command PlayWrestlingPromo
 * @text Play Wrestling Promo
 * @desc Play tonight's promo for one promotion as a bust conversation.
 *
 * @arg federation
 * @text Promotion
 * @type select
 * @option slam
 * @option circle
 * @default slam
 * @desc Which promotion cuts the promo.
 */

(() => {
    'use strict';

    const pluginName = 'MonsterTournament';
    const parameters = PluginManager.parameters(pluginName);
    const bettingItemId = Number(parameters['bettingItemId'] || 124);
    // A fighting game's round clock: a bout is shown for at most this many
    // seconds, after which it is settled where it stands.
    const MT_ROUND_SECONDS = 30;

    PluginManager.registerCommand(pluginName, "startTournament", () => {
        SceneManager.push(Scene_MonsterTournament);
    });

    // Quick sanity check for the 3D stack. If anything is missing the scene
    // refuses to open (rather than rendering a black void) and tells the player.
    function stack3DReady() {
        return typeof THREE !== 'undefined' &&
               typeof THREE.WebGLRenderer === 'function' &&
               window.Battler3D &&
               typeof window.Battler3D.create === 'function' &&
               typeof window.Battler3D.resolveKey === 'function';
    }

    //=========================================================================
    // Headless RPG Maker duel simulation
    //
    // Two real Game_Enemy instances fight a genuine turn-based battle using the
    // engine's own mechanics: enemy AI action selection, skill costs, damage
    // formulas, hit/eva/crit, state infliction, buffs/debuffs and end-of-turn
    // slip damage / regeneration. The result is a list of "beats" the 3D arena
    // plays back, plus the winning side. Side -1 = left, +1 = right.
    //=========================================================================

    const PARAM_NAMES = ['MaxHP', 'MaxMP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
    function paramName(id) {
        try { return TextManager.param(id); } catch (e) { return PARAM_NAMES[id] || T('MonsterTournament.stat'); }
    }

    function statPower(data) {
        // Guard against undefined fighter data / params so the runDuel catch-block
        // fallback cannot itself throw (e.g. a near-empty enemy DB leaves bracket
        // slots without data).
        const p = (data && data.params) || [];
        return (p[0] || 0) + (p[2] || 0) + (p[4] || 0) + (p[5] || 0);
    }
    function statWinnerSide(leftData, rightData) {
        return (statPower(leftData) + Math.random() * 80) >= (statPower(rightData) + Math.random() * 80) ? -1 : 1;
    }
    function fallbackBeats(winnerSide) {
        const loser = -winnerSide;
        const mk = (side, target, skill, results) => ({
            kind: 'action', side, targetSide: target, animationId: 1229,
            magical: false, isFriend: false, userName: T('MonsterTournament.fighter'), skillName: skill, results: results || []
        });
        return [
            mk(loser, winnerSide, T('MonsterTournament.skillAttack')),
            mk(winnerSide, loser, T('MonsterTournament.skillAttack')),
            mk(winnerSide, loser, T('MonsterTournament.skillFinish'), [{ kind: 'death', side: loser }])
        ];
    }

    // Resolve the animation an action shows. A skill animationId of -1 means the
    // user's "normal attack" animation; fall back to a plain hit (1) if unknown.
    function resolveAnimId(subject, item) {
        let a = item.animationId;
        if (a < 0) {
            a = (subject.attackAnimationId1 ? subject.attackAnimationId1() : 0) || 0;
        }
        return a || 0;
    }

    function runDuel(leftData, rightData, record) {
        const out = { beats: [], winnerSide: 0 };
        const prevInBattle = $gameParty._inBattle;
        let L, R;
        try {
            L = new Game_Enemy(leftData.id, 0, 0);
            R = new Game_Enemy(rightData.id, 0, 0);
            L.recoverAll(); R.recoverAll();
            if (L.initTp) L.initTp();
            if (R.initTp) R.initTp();
            // Skills are "battle only" (occasion 1); the engine only allows them
            // while a party is in battle, so flip the flag for the simulation.
            $gameParty._inBattle = true;

            const sideOf = b => (b === L ? -1 : 1);
            // What the fighting-game gauges read: every recorded beat carries a
            // snapshot of both fighters' HP / MP / TP taken right after it
            // resolved, so the bars in the arena follow the very battle the
            // engine already fought instead of guessing at it.
            const snap = (b) => ({
                hp: b.hp, mhp: Math.max(1, b.mhp),
                mp: b.mp, mmp: Math.max(0, b.mmp),
                tp: Math.round(b.tp || 0), mtp: Math.max(1, b.maxTp ? b.maxTp() : 100)
            });
            const gauges = () => ({ '-1': snap(L), '1': snap(R) });
            const pushBeat = (beat) => { beat.gauges = gauges(); out.beats.push(beat); };
            out.startGauges = gauges();
            const oppOf = b => (b === L ? R : L);
            const MAX_TURNS = 16;
            let turn = 0;

            while (L.isAlive() && R.isAlive() && turn < MAX_TURNS) {
                turn++;
                // Act in agility order (with a little jitter so ties vary).
                const order = [L, R].slice().sort((a, b) =>
                    (b.agi * (0.9 + Math.random() * 0.2)) - (a.agi * (0.9 + Math.random() * 0.2)));

                for (const subject of order) {
                    if (!L.isAlive() || !R.isAlive()) break;
                    if (!subject.isAlive()) continue;

                    // Top up TP so TP-gated skills are affordable - otherwise the
                    // AI keeps falling back to the basic Attack and the whole kit
                    // never gets shown.
                    if (subject.setTp) subject.setTp(subject.maxTp());
                    subject.makeActions(); // engine AI picks skills by rating/conditions
                    const actions = subject._actions || [];
                    if (actions.length === 0) { // stunned / asleep / cannot move
                        if (record) pushBeat({ kind: 'skip', side: sideOf(subject) });
                        continue;
                    }

                    for (const action of actions) {
                        if (!subject.isAlive() || !oppOf(subject).isAlive()) break;
                        if (!action.item()) action.setAttack();
                        const item = action.item();
                        if (!item) continue;

                        const isFriend = !!(action.isForFriend && action.isForFriend());
                        const targetB = isFriend ? subject : oppOf(subject);
                        subject.useItem(item); // pay MP/TP cost
                        const animId = resolveAnimId(subject, item);

                        const beat = record ? {
                            kind: 'action',
                            side: sideOf(subject),
                            targetSide: sideOf(targetB),
                            animationId: animId,
                            magical: !!(action.isMagical && action.isMagical()),
                            isFriend: isFriend,
                            userName: subject.name(),
                            skillName: item.name,
                            results: []
                        } : null;

                        // A single malformed skill formula must not abort the
                        // whole duel; on error the beat still plays its anim.
                        try { action.apply(targetB); } catch (err) { /* skip effects */ }
                        const res = targetB.result();

                        if (beat) {
                            if (res.missed || res.evaded) {
                                beat.results.push({ kind: 'miss', side: sideOf(targetB) });
                            } else {
                                if (res.hpDamage > 0) beat.results.push({ kind: 'damage', side: sideOf(targetB), value: res.hpDamage, critical: !!res.critical });
                                else if (res.hpDamage < 0) beat.results.push({ kind: 'heal', side: sideOf(targetB), value: -res.hpDamage });
                                if (res.mpDamage > 0) beat.results.push({ kind: 'mp', side: sideOf(targetB), value: res.mpDamage });
                                const added = res.addedStateObjects ? res.addedStateObjects() : [];
                                added.forEach(s => {
                                    if (s && s.id !== targetB.deathStateId()) beat.results.push({ kind: 'state', side: sideOf(targetB), text: s.name });
                                });
                                (res.addedBuffs || []).forEach(pid => beat.results.push({ kind: 'buff', side: sideOf(targetB), text: paramName(pid) + ' Up' }));
                                (res.addedDebuffs || []).forEach(pid => beat.results.push({ kind: 'buff', side: sideOf(targetB), text: paramName(pid) + ' Down' }));
                            }
                        }

                        if (!targetB.isAlive() && beat) beat.results.push({ kind: 'death', side: sideOf(targetB) });
                        if (beat) pushBeat(beat);
                        if (!oppOf(subject).isAlive()) break;
                    }
                }

                // End of turn: slip damage / regeneration and state/buff ticks.
                [L, R].forEach(b => {
                    if (!b.isAlive()) return;
                    b.onTurnEnd();
                    const r = b.result();
                    if (record && r.hpDamage) pushBeat({ kind: 'slip', side: sideOf(b), value: r.hpDamage });
                    if (!b.isAlive() && record) pushBeat({ kind: 'slipdeath', side: sideOf(b) });
                });
            }

            let winner;
            if (L.isAlive() && !R.isAlive()) winner = L;
            else if (R.isAlive() && !L.isAlive()) winner = R;
            else {
                // Turn cap (or mutual KO): decide by remaining HP ratio and stage
                // a decisive faint on the loser so the visual still resolves.
                const lr = L.hp / Math.max(1, L.mhp), rr = R.hp / Math.max(1, R.mhp);
                winner = lr >= rr ? L : R;
                if (record && L.isAlive() && R.isAlive()) pushBeat({ kind: 'decision', side: sideOf(winner === L ? R : L) });
            }
            out.winnerSide = sideOf(winner);
            out.finalGauges = gauges();
        } catch (e) {
            console.error('[MonsterTournament] duel sim failed; using stat fallback', e);
            out.winnerSide = statWinnerSide(leftData, rightData);
            if (record && out.beats.length === 0) out.beats = fallbackBeats(out.winnerSide);
        } finally {
            $gameParty._inBattle = prevInBattle;
        }
        return out;
    }

    //=========================================================================
    // Arena3D - self-contained three.js stage that renders to its own canvas.
    // The canvas is composited into the RMMZ scene as a PIXI sprite, exactly
    // like 3DBattlerSystem's Battle3DScene does for normal battles.
    //=========================================================================

    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

    // Layout constants (world units). Fighters stand left/right of centre on a
    // ground plane; the camera orbits the centre at a fixed distance.
    const FOOT_Y      = -1.5;  // matches the y used for procedural battlers in battle
    const FIGHT_X     = 2.8;   // distance of each fighter from centre
    // Turn each fighter a full quarter so they squarely face one another,
    // overriding whatever cosmetic facing yaw a model family bakes in.
    const FACE_YAW    = Math.PI * 0.5;
    const MODEL_SCALE = 0.85;  // slightly smaller fighters

    // Orbit camera limits.
    const CAM_DIST  = 12.5;          // distance from the focal point (farther back)
    const CAM_CENTER = () => V3(0, -0.3, 0);
    const PITCH_MIN = -0.25;
    const PITCH_MAX = 1.10;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    class Arena3D {
        constructor(width, height) {
            this._w = width;
            this._h = height;
            this.clock = new THREE.Clock();

            this.fighters = {};      // side(-1/1) -> { battler, rig, baseX }
            this._fx = [];           // active impact bursts
            this._seq = null;        // active choreography step list
            this._seqI = 0;
            this._stepT = 0;
            this._onSeqDone = null;
            this._mode = 'idle';     // idle | solo | duel
            this._soloFighter = null;

            // Set by the scene: bridges 3D beats to the 2D effect/popup layer.
            this.onAnimation = null; // (side, animationId) -> play MZ animation
            this.onPopup = null;     // (side, {text,color})  -> floating popup
            this.onAnnounce = null;  // (text) -> "X uses Skill!" banner
            this.onGauges = null;    // (gauges) -> refresh the HP/MP/TP bars

            // Free-orbit camera the player drives (mouse drag / WASD / right stick).
            this._center = CAM_CENTER();
            this._yaw = 0;           // azimuth (0 = front-on)
            this._pitch = 0.18;      // elevation
            this._dist = CAM_DIST;
            this._shake = 0;

            // Raw key state for WASD panning (DOM listeners bypass the RMMZ Input
            // remapping so they work regardless of the global key mapper).
            this._keys = new Set();
            this._onKeyDown = (e) => { this._keys.add(e.code); };
            this._onKeyUp = (e) => { this._keys.delete(e.code); };
            document.addEventListener('keydown', this._onKeyDown);
            document.addEventListener('keyup', this._onKeyUp);
            this._lastTouch = null;

            this._initThree();
            this._buildArena();
            this._applyCamera();
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(0x141022);
            this.scene.fog = new THREE.Fog(0x141022, 12, 26);

            this.camera = new THREE.PerspectiveCamera(46, this._w / this._h, 0.1, 200);

            this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x141022, 1);

            this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

            const key = new THREE.DirectionalLight(0xfff0d8, 0.95);
            key.position.set(5, 10, 6);
            this.scene.add(key);

            // Cool rim light from behind for that arena spotlight feel.
            const rim = new THREE.DirectionalLight(0x6a7bff, 0.5);
            rim.position.set(-6, 4, -8);
            this.scene.add(rim);
        }

        _buildArena() {
            const group = new THREE.Group();

            // Ground arena disc.
            const discMat = new THREE.MeshStandardMaterial({ color: 0x3a3550, roughness: 0.95, metalness: 0.0 });
            const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 40), discMat);
            disc.rotation.x = -Math.PI / 2;
            disc.position.y = FOOT_Y;
            group.add(disc);

            // Inner ring accent.
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x9a6bff, roughness: 0.6, emissive: 0x2a1a55, emissiveIntensity: 0.6 });
            const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.0, 40), ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = FOOT_Y + 0.02;
            group.add(ring);

            // Surrounding floor (darker) so the disc reads as a platform.
            const floorMat = new THREE.MeshStandardMaterial({ color: 0x0e0b1a, roughness: 1.0 });
            const floor = new THREE.Mesh(new THREE.CircleGeometry(22, 32), floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = FOOT_Y - 0.05;
            group.add(floor);

            this.scene.add(group);
            this._arenaGroup = group;
            if (window.PSXShader) window.PSXShader.applyToObject(group);
        }

        //--- fighter management ------------------------------------------------

        // Build + load a procedural battler for an enemy data entry. Returns the
        // battler instance (with .model populated) or null if it has no archetype.
        async _makeBattler(enemyData) {
            const key = window.Battler3D.resolveKey(enemyData);
            if (!key) return null;
            // A minimal fake battler gives the model a stable per-id appearance
            // without needing a live Game_Enemy.
            const fake = { enemyId: () => enemyData.id, index: () => 0 };
            const battler = window.Battler3D.create(key, undefined, 0, fake, undefined);
            if (!battler) return null;
            try {
                await battler.load(null, 0, 0, 0);
            } catch (e) {
                return null;
            }
            if (!battler.model) return null;
            if (window.PSXShader) window.PSXShader.applyToObject(battler.model);
            return battler;
        }

        _addFighter(side, battler) {
            const rig = new THREE.Group();
            const baseX = side * FIGHT_X;
            const y = FOOT_Y + (battler.offsetY || 0) / 100;
            rig.position.set(baseX, y, 0);
            rig.rotation.y = side < 0 ? FACE_YAW : -FACE_YAW; // turn toward opponent
            rig.scale.setScalar(MODEL_SCALE);
            battler.model.position.set(0, 0, 0);
            rig.add(battler.model);
            this.scene.add(rig);
            battler.playIdleAnimation && battler.playIdleAnimation();
            this.fighters[side] = { battler, rig, baseX };
            return this.fighters[side];
        }

        clearFighters() {
            Object.keys(this.fighters).forEach(k => {
                const f = this.fighters[k];
                if (f && f.rig) {
                    this.scene.remove(f.rig);
                    f.rig.traverse(n => {
                        if (n.isMesh) {
                            if (n.geometry) try { n.geometry.dispose(); } catch (e) {}
                            const mats = Array.isArray(n.material) ? n.material : [n.material];
                            mats.forEach(m => { if (m) try { m.dispose(); } catch (e) {} });
                        }
                    });
                }
            });
            this.fighters = {};
            this._soloFighter = null;
        }

        // Show a single rotating monster (selection / betting preview).
        async showSolo(enemyData) {
            this._mode = 'idle';
            this._seq = null;
            this.clearFighters();
            const battler = await this._makeBattler(enemyData);
            if (!battler) return false;
            const rig = new THREE.Group();
            rig.position.set(0, FOOT_Y + (battler.offsetY || 0) / 100, 0);
            rig.scale.setScalar(MODEL_SCALE);
            battler.model.position.set(0, 0, 0);
            rig.add(battler.model);
            this.scene.add(rig);
            battler.playIdleAnimation && battler.playIdleAnimation();
            this.fighters['solo'] = { battler, rig, baseX: 0 };
            this._soloFighter = this.fighters['solo'];
            this._mode = 'solo';
            return true;
        }

        //--- camera (free orbit, player-driven) --------------------------------

        // Apply relative pan from any input source.
        applyPan(dYaw, dPitch) {
            this._yaw += dYaw;
            this._pitch = clamp(this._pitch + dPitch, PITCH_MIN, PITCH_MAX);
        }

        // Gather pan input (mouse drag, WASD, gamepad right stick) and orbit.
        _updateCameraInput(dt) {
            let dYaw = 0, dPitch = 0;

            // Mouse drag.
            if (typeof TouchInput !== 'undefined' && TouchInput.isPressed()) {
                if (this._lastTouch) {
                    dYaw   -= (TouchInput.x - this._lastTouch.x) * 0.006;
                    dPitch += (TouchInput.y - this._lastTouch.y) * 0.006;
                }
                this._lastTouch = { x: TouchInput.x, y: TouchInput.y };
            } else {
                this._lastTouch = null;
            }

            // WASD.
            const kspeed = 1.5 * dt;
            if (this._keys.has('KeyA')) dYaw += kspeed;
            if (this._keys.has('KeyD')) dYaw -= kspeed;
            if (this._keys.has('KeyW')) dPitch += kspeed;
            if (this._keys.has('KeyS')) dPitch -= kspeed;

            // The right stick, through the one controller layer: the same
            // deadzone, the same speed setting and the same inverted Y as every
            // other camera in the game (window.Controller).
            const C = window.Controller;
            if (C) {
                const stick = C.stick('right');
                const gain = C.cameraSpeed();
                const invert = C.invertCameraY() ? -1 : 1;
                dYaw -= stick.x * 2.2 * gain * dt;
                dPitch -= stick.y * 1.7 * gain * invert * dt;
            }

            if (dYaw || dPitch) this.applyPan(dYaw, dPitch);
        }

        _applyCamera() {
            const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
            const sy = Math.sin(this._yaw), cy = Math.cos(this._yaw);
            const ox = (Math.random() - 0.5) * this._shake;
            const oy = (Math.random() - 0.5) * this._shake;
            this.camera.position.set(
                this._center.x + this._dist * cp * sy + ox,
                this._center.y + this._dist * sp + oy,
                this._center.z + this._dist * cp * cy
            );
            this.camera.lookAt(this._center);
        }

        shake(amount) { this._shake = Math.max(this._shake, amount); }

        // Project a fighter's world position (at height h above its feet) to
        // screen pixels, so the 2D animation/popup layer can track it. Returns
        // null if the fighter is missing or behind the camera.
        fighterScreenPos(side, h) {
            const f = this.fighters[side];
            if (!f) return null;
            this.camera.updateMatrixWorld();
            const world = f.rig.position.clone();
            world.y += (h == null ? 1.0 : h) * MODEL_SCALE;
            const v = world.project(this.camera);
            if (v.z > 1) return null;
            return { x: (v.x * 0.5 + 0.5) * this._w, y: (-v.y * 0.5 + 0.5) * this._h };
        }

        //--- impact bursts -----------------------------------------------------

        spawnSpark(x, y, z, big) {
            const mat = new THREE.MeshBasicMaterial({
                color: big ? 0xffe27a : 0xfff3c0,
                transparent: true,
                opacity: 1,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 0.6 : 0.4, 0), mat);
            mesh.position.set(x, y, z);
            this.scene.add(mesh);
            this._fx.push({ obj: mesh, mat, t: 0, dur: big ? 0.4 : 0.3, grow: big ? 6 : 4 });
        }

        flashRandomPart(battler) {
            if (!battler || !battler.flashBodyPart || !battler._partMeshMap) return;
            const keys = Object.keys(battler._partMeshMap);
            if (!keys.length) return;
            battler.flashBodyPart(keys[Math.floor(Math.random() * keys.length)]);
        }

        //--- duel choreography (driven by the simulated beats) -----------------

        // `beats` is the event log produced by runDuel(); the arena plays each
        // beat in order, triggering 3D animations, the skill's MZ/Effekseer
        // animation (via the onAnimation callback) and damage/state popups (via
        // onPopup). The result has already been decided by the simulation.
        async startDuel(leftData, rightData, beats, onDone) {
            this._mode = 'idle';
            this._seq = null;
            this.clearFighters();

            const left = await this._makeBattler(leftData);
            const right = await this._makeBattler(rightData);
            if (!left || !right) {
                if (onDone) onDone();
                return;
            }
            this._addFighter(-1, left);
            this._addFighter(1, right);

            this._onSeqDone = onDone;
            this._seq = this._buildSteps(beats || []);
            this._seqI = 0;
            this._stepT = 0;
            this._mode = 'duel';
        }

        _buildSteps(beats) {
            const steps = [this._stepPause(1.0)];
            for (const beat of beats) {
                if (beat.kind === 'action') steps.push(this._stepAction(beat));
                else if (beat.kind === 'slip') steps.push(this._stepSlip(beat));
                else if (beat.kind === 'slipdeath' || beat.kind === 'decision') steps.push(this._stepDeath(beat));
                else if (beat.kind === 'skip') steps.push(this._stepPause(0.45));
            }
            steps.push(this._stepVictory());
            return steps;
        }

        _stepPause(d) { return { d: d, start: () => {}, update: () => {} }; }

        _stepAction(beat) {
            const big = !!beat.magical;
            return {
                d: 1.2,
                _impacted: false,
                start: () => {
                    const atk = this.fighters[beat.side];
                    if (atk && atk.battler) atk.battler.playAnimation(big ? 'specialattack' : 'attack', false);
                    if (this.onAnnounce && beat.skillName) {
                        this.onAnnounce(T('MonsterTournament.uses', { user: beat.userName, skill: beat.skillName }));
                    }
                },
                update: function (p, arena) {
                    const atk = arena.fighters[beat.side];
                    if (atk && !beat.isFriend) {
                        const dir = -beat.side; // toward the opponent
                        const lunge = Math.sin(p * Math.PI) * (big ? 0.5 : 1.4);
                        atk.rig.position.x = atk.baseX + dir * lunge;
                    }
                    if (!this._impacted && p >= 0.4) {
                        this._impacted = true;
                        if (beat.animationId && arena.onAnimation) arena.onAnimation(beat.targetSide, beat.animationId);
                        arena._applyBeatResults(beat);
                        arena._reportGauges(beat);
                    }
                }
            };
        }

        // Hand the beat's recorded HP / MP / TP snapshot to the HUD gauges.
        _reportGauges(beat) {
            if (this.onGauges && beat && beat.gauges) this.onGauges(beat.gauges);
        }

        // The round clock ran out: settle the fight where it stands. The loser
        // goes down and the choreography jumps to its closing flourish, so the
        // 30 seconds are a real limit and not just a decoration.
        finishDuelNow(loserSide) {
            if (!this._seq) return;
            const f = this.fighters[loserSide];
            if (f && f.battler && f.battler.currentAnimation !== 'death') {
                f.battler.playAnimation('death', false);
                if (this.onPopup) this.onPopup(loserSide, { text: 'DOWN', color: '#ff5555' });
            }
            this._seqI = this._seq.length - 1;
            this._stepT = 0;
        }

        // Apply a beat's resolved results: defender reactions, sparks, popups.
        _applyBeatResults(beat) {
            let damagedTarget = false, died = false;
            for (const r of beat.results) {
                if (r.kind === 'damage') {
                    damagedTarget = damagedTarget || (r.side === beat.targetSide);
                    if (r.value > 0) {
                        this.spawnSpark(0, -0.35, 0.25, r.critical);
                        this.shake(r.critical ? 0.30 : 0.16);
                        if (this.onPopup) this.onPopup(r.side, { text: String(r.value) + (r.critical ? '!' : ''), color: r.critical ? '#ffd24a' : '#ffffff' });
                    }
                } else if (r.kind === 'heal') {
                    if (this.onPopup) this.onPopup(r.side, { text: '+' + r.value, color: '#7CFF7C' });
                } else if (r.kind === 'mp') {
                    if (this.onPopup) this.onPopup(r.side, { text: r.value + ' MP', color: '#7CC8FF' });
                } else if (r.kind === 'miss') {
                    if (this.onPopup) this.onPopup(r.side, { text: 'MISS', color: '#cccccc' });
                } else if (r.kind === 'state') {
                    if (this.onPopup) this.onPopup(r.side, { text: r.text, color: '#ff9be0' });
                } else if (r.kind === 'buff') {
                    if (this.onPopup) this.onPopup(r.side, { text: r.text, color: '#c9a0ff' });
                } else if (r.kind === 'death') {
                    died = true;
                    const df = this.fighters[r.side];
                    if (df && df.battler) df.battler.playAnimation('death', false);
                    if (this.onPopup) this.onPopup(r.side, { text: 'DOWN', color: '#ff5555' });
                }
            }
            if (damagedTarget && !died) {
                const df = this.fighters[beat.targetSide];
                if (df && df.battler) { df.battler.playAnimation('hit', false); this.flashRandomPart(df.battler); }
            }
        }

        _stepSlip(beat) {
            return {
                d: 0.6,
                _done: false,
                start: () => {},
                update: function (p, arena) {
                    if (!this._done && p >= 0.2) {
                        this._done = true;
                        const dmg = beat.value > 0;
                        if (arena.onPopup) arena.onPopup(beat.side, { text: (dmg ? '' : '+') + Math.abs(beat.value), color: dmg ? '#ff8c8c' : '#7CFF7C' });
                        const f = arena.fighters[beat.side];
                        if (dmg && f && f.battler) arena.flashRandomPart(f.battler);
                        arena._reportGauges(beat);
                    }
                }
            };
        }

        _stepDeath(beat) {
            return {
                d: 1.4,
                start: () => {
                    const f = this.fighters[beat.side];
                    if (f && f.battler) f.battler.playAnimation('death', false);
                    if (this.onPopup) this.onPopup(beat.side, { text: 'DOWN', color: '#ff5555' });
                    this._reportGauges(beat);
                },
                update: () => {}
            };
        }

        // Final beat: whoever is still standing does a triumphant flourish.
        _stepVictory() {
            return {
                d: 1.6,
                start: () => {
                    Object.keys(this.fighters).forEach(k => {
                        const f = this.fighters[k];
                        if (f && f.battler && f.battler.currentAnimation !== 'death') f.battler.playAnimation('specialattack', false);
                    });
                },
                update: () => {}
            };
        }

        //--- main loop ---------------------------------------------------------

        update() {
            const dt = Math.min(this.clock.getDelta(), 0.1);

            // Advance the choreography.
            if (this._seq) {
                const step = this._seq[this._seqI];
                if (step) {
                    if (!step._started) { step._started = true; if (step.start) step.start(); }
                    this._stepT += dt;
                    const p = Math.min(this._stepT / step.d, 1);
                    if (step.update) step.update(p, this);
                    if (this._stepT >= step.d) {
                        this._seqI++;
                        this._stepT = 0;
                        if (this._seqI >= this._seq.length) {
                            this._seq = null;
                            const cb = this._onSeqDone;
                            this._onSeqDone = null;
                            if (cb) cb();
                        }
                    }
                }
            }

            // Solo turntable.
            if (this._mode === 'solo' && this._soloFighter) {
                this._soloFighter.rig.rotation.y += dt * 0.7;
            }

            // Animate battlers.
            Object.keys(this.fighters).forEach(k => {
                const f = this.fighters[k];
                if (f && f.battler && f.battler.update) f.battler.update(dt);
            });

            // Impact bursts.
            for (let i = this._fx.length - 1; i >= 0; i--) {
                const fx = this._fx[i];
                fx.t += dt;
                const q = fx.t / fx.dur;
                const s = 0.3 + fx.grow * q;
                fx.obj.scale.set(s, s, s);
                fx.mat.opacity = Math.max(0, 1 - q);
                if (q >= 1) {
                    this.scene.remove(fx.obj);
                    try { fx.obj.geometry.dispose(); } catch (e) {}
                    try { fx.mat.dispose(); } catch (e) {}
                    this._fx.splice(i, 1);
                }
            }

            // Free-orbit camera: gather player input, decay shake, position it.
            this._updateCameraInput(dt);
            this._shake = Math.max(0, this._shake - dt * 1.6);
            this._applyCamera();
        }

        render() {
            this.update();
            if (window.PSXShader) {
                window.PSXShader.render(this.renderer, this.scene, this.camera);
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            this.clearFighters();
            this._fx.forEach(fx => { this.scene.remove(fx.obj); });
            this._fx = [];
            document.removeEventListener('keydown', this._onKeyDown);
            document.removeEventListener('keyup', this._onKeyUp);
            this._keys.clear();
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer.forceContextLoss && this.renderer.forceContextLoss();
            }
        }
    }

    //=========================================================================
    // Scene_MonsterTournament
    //=========================================================================

    class Scene_MonsterTournament extends Scene_MenuBase {
        create() {
            super.create();

            this.phase = 'selection';
            this.selectedMonsters = [];
            this.currentBets = {};
            this.playerChoice = -1;
            this.tournamentBracket = [];
            this.currentRound = 0;
            this.currentMonsterIndex = 0;
            this.playerMonsterEliminated = false;
            this._betAmount = 1;
            this._addBetIndex = 0;

            this.createHud();

            if (!stack3DReady()) {
                this._aborting = true;
                this.phase = 'aborting';
                SoundManager.playBuzzer();
                this.setTitle(T('MonsterTournament.no3d'));
                this._after(1500, () => this.popScene());
                return;
            }

            this.selectRandomMonsters();
            this.createArena();
            this.createEffectsLayer();
            this.showSelectionMonster();
            this.enterSelection();
        }

        //--- setup -------------------------------------------------------------

        // Only enemies that resolve to a registered 3D archetype are eligible, so
        // every contender has a real model to show.
        selectRandomMonsters() {
            const eligible = $dataEnemies.filter(e => e && e.name && window.Battler3D.resolveKey(e));
            const pool = eligible.length >= 8
                ? eligible
                : $dataEnemies.filter(e => e && e.name); // fallback (rare)

            this.selectedMonsters = [];
            const used = new Set();
            let guard = 0;
            while (this.selectedMonsters.length < 8 && guard++ < 5000) {
                const e = pool[Math.floor(Math.random() * pool.length)];
                if (!e) continue;
                if (used.has(e.id) && this.selectedMonsters.length < pool.length) continue;
                used.add(e.id);
                this.selectedMonsters.push(e);
            }
            for (let i = 0; i < 8; i++) this.currentBets[i] = 0;
        }

        createArena() {
            this._arena = new Arena3D(Graphics.width, Graphics.height);
            const texture = PIXI.Texture.from(this._arena.domElement);
            this._arenaSprite = new PIXI.Sprite(texture);
            this._arenaSprite.x = 0;
            this._arenaSprite.y = 0;
            // Place the arena directly beneath the window layer so all windows,
            // banners and the title draw on top of the 3D view.
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._arenaSprite, idx);
        }

        // A 2D layer above the 3D view (but below the windows) that hosts the
        // skill animations (Effekseer/MV) and floating damage/state popups,
        // positioned by projecting the 3D fighters to screen space.
        createEffectsLayer() {
            this._effectsContainer = new PIXI.Container();
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._effectsContainer, idx);

            this._animationSprites = [];
            this._popups = [];
            this._animTargets = {};
            [-1, 1].forEach(s => {
                const t = new Sprite();
                this._effectsContainer.addChild(t);
                this._animTargets[s] = t;
            });

            // Bridge 3D beats -> 2D effects.
            this._arena.onAnimation = (side, animId) => this.playMZAnimation(side, animId);
            this._arena.onPopup = (side, payload) => this.addPopup(side, payload);
            this._arena.onAnnounce = (text) => this.showAnnounce(text);
            this._arena.onGauges = (gauges) => this.setGauges(gauges);
        }

        // Center-top "EnemyName uses SkillName!" banner, refreshed each action.
        showAnnounce(text) {
            if (!this._announceEl) return;
            this._announceEl.textContent = text;
            this._announceEl.style.opacity = '1';
            this._announceLife = 0;
        }

        // Play a real RPG Maker animation (Effekseer or MV) on a fighter, using
        // the engine's own Sprite_Animation pipeline. The transparent target
        // sprite is repositioned each frame to track the 3D fighter on screen.
        playMZAnimation(side, animationId) {
            const animation = (typeof $dataAnimations !== 'undefined') && $dataAnimations[animationId];
            if (!animation) return;
            const target = this._animTargets[side];
            if (!target) return;
            const isMV = !!animation.frames;
            const Klass = isMV ? Sprite_AnimationMV : Sprite_Animation;
            const sprite = new Klass();
            sprite.targetObjects = [target];
            sprite.setup([target], animation, false, 0, null);
            this._effectsContainer.addChild(sprite);
            this._animationSprites.push(sprite);
        }

        addPopup(side, payload) {
            const text = String(payload.text);
            const bmp = new Bitmap(220, 48);
            bmp.fontFace = $gameSystem.numberFontFace ? $gameSystem.numberFontFace() : $gameSystem.mainFontFace();
            bmp.fontSize = 30;
            bmp.textColor = payload.color || '#ffffff';
            bmp.outlineColor = 'rgba(0,0,0,0.85)';
            bmp.outlineWidth = 5;
            bmp.drawText(text, 0, 0, 220, 48, 'center');
            const sp = new Sprite(bmp);
            sp.anchor.x = 0.5;
            sp.anchor.y = 0.5;
            const pos = this._arena.fighterScreenPos(side, 1.7);
            sp.x = pos ? pos.x : Graphics.width / 2;
            sp.y = pos ? pos.y : Graphics.height / 2;
            this._effectsContainer.addChild(sp);
            this._popups.push({ sp, life: 0, dur: 64, baseY: sp.y });
        }

        updateEffects() {
            // Keep animation target sprites glued to the fighters on screen.
            [-1, 1].forEach(s => {
                const t = this._animTargets[s];
                const p = this._arena.fighterScreenPos(s, 0.8);
                if (t && p) { t.x = p.x; t.y = p.y; }
            });

            // Advance / retire skill animations.
            for (let i = this._animationSprites.length - 1; i >= 0; i--) {
                const sp = this._animationSprites[i];
                let alive = true;
                try { sp.update(); alive = sp.isPlaying(); } catch (e) { alive = false; }
                if (!alive) {
                    this._effectsContainer.removeChild(sp);
                    try { sp.destroy(); } catch (e) {}
                    this._animationSprites.splice(i, 1);
                }
            }

            // Hold the action banner briefly, then fade it (CSS transition).
            if (this._announceEl && this._announceEl.style.opacity === '1') {
                this._announceLife = (this._announceLife || 0) + 1;
                if (this._announceLife > 80) this._announceEl.style.opacity = '0';
            }

            // Float popups up and fade them out.
            for (let i = this._popups.length - 1; i >= 0; i--) {
                const pu = this._popups[i];
                pu.life++;
                pu.sp.y = pu.baseY - pu.life * 0.7;
                pu.sp.opacity = pu.life < pu.dur - 16 ? 255 : Math.max(0, 255 * (pu.dur - pu.life) / 16);
                if (pu.life >= pu.dur) {
                    this._effectsContainer.removeChild(pu.sp);
                    pu.sp.destroy();
                    this._popups.splice(i, 1);
                }
            }
        }

        // Build the HTML HUD overlay. Styled entirely from the active theme's
        // CSS variable tokens (omega_tower.css / archive_foundation.css), so it
        // matches every other DOM menu instead of using RPG Maker windows.
        createHud() {
            const root = document.createElement('div');
            root.id = 'mt-hud';
            root.innerHTML = `
                <div id="mt-title" class="mt-panel"></div>
                <div id="mt-announce"></div>
                <div id="mt-stats" class="mt-panel" style="display:none">
                    <div class="mt-stats-head">
                        <span class="mt-name"></span>
                        <span class="mt-sub"></span>
                    </div>
                    <div class="mt-statgrid"></div>
                    <div class="mt-stats-foot">
                        <span class="mt-power"></span>
                    </div>
                </div>
                <div id="mt-bet" class="mt-panel" style="display:none">
                    <div class="mt-bet-amount">${T('MonsterTournament.ui.bet')} <b>1</b></div>
                    <div class="mt-bet-avail"></div>
                </div>
                <div id="mt-addbet" class="mt-panel" style="display:none">
                    <div class="mt-addbet-title"></div>
                    <div class="mt-opt" data-i="0"></div>
                    <div class="mt-opt" data-i="1">${T('MonsterTournament.ui.keepCurrentBet')}</div>
                </div>
                <div id="mt-fight" style="display:none">
                    <div class="mt-fighter mt-side-left">
                        <div class="mt-fname"></div>
                        <div class="mt-gauges">
                            <div class="mt-gauge mt-hp"><i></i><span></span></div>
                            <div class="mt-gauge mt-mp"><i></i><span></span></div>
                        </div>
                        <div class="mt-tp"><b></b></div>
                    </div>
                    <div class="mt-clock">
                        <div class="mt-clock-num">${MT_ROUND_SECONDS}</div>
                        <div class="mt-clock-lbl">${T('MonsterTournament.ui.time')}</div>
                    </div>
                    <div class="mt-fighter mt-side-right">
                        <div class="mt-fname"></div>
                        <div class="mt-gauges">
                            <div class="mt-gauge mt-hp"><i></i><span></span></div>
                            <div class="mt-gauge mt-mp"><i></i><span></span></div>
                        </div>
                        <div class="mt-tp"><b></b></div>
                    </div>
                </div>
                <div id="mt-banner" style="display:none"></div>
            `;
            document.body.appendChild(root);
            this._hud = root;
            this._titleEl = root.querySelector('#mt-title');
            this._announceEl = root.querySelector('#mt-announce');
            this._statsEl = root.querySelector('#mt-stats');
            this._betEl = root.querySelector('#mt-bet');
            this._addbetEl = root.querySelector('#mt-addbet');
            this._bannerEl = root.querySelector('#mt-banner');
            this._fightEl = root.querySelector('#mt-fight');
            this._clockEl = root.querySelector('.mt-clock-num');
            this._fighterEls = {
                '-1': root.querySelector('.mt-side-left'),
                '1': root.querySelector('.mt-side-right')
            };

            // Mouse support for the add-bet choice (keyboard flow unchanged)
            this._addbetEl.querySelectorAll('.mt-opt').forEach(opt => {
                opt.addEventListener('mouseenter', () => {
                    if (this.phase !== 'addbet') return;
                    this._addBetIndex = Number(opt.dataset.i);
                    this.refreshAddBet();
                });
                opt.addEventListener('click', () => {
                    if (this.phase !== 'addbet') return;
                    SoundManager.playOk();
                    this._addBetIndex = Number(opt.dataset.i);
                    this._addBetIndex === 0 ? this.onAdditionalBetYes() : this.onAdditionalBetNo();
                });
            });

            this.setTitle(T('MonsterTournament.chooseFighter'));
        }

        //--- HUD helpers -------------------------------------------------------

        setTitle(text) { if (this._titleEl) this._titleEl.textContent = text; }

        showBanner(text, kind) {
            if (!this._bannerEl) return;
            this._bannerEl.textContent = text;
            this._bannerEl.className = kind ? ('mt-' + kind) : '';
            this._bannerEl.style.display = '';
        }
        hideBanner() { if (this._bannerEl) this._bannerEl.style.display = 'none'; }

        //--- the fighting-game gauges ------------------------------------------
        // The same three readings a real battle shows - an HP bar, an MP bar and
        // the TP orb - one card per corner with the round clock between them.

        showFightHud(leftData, rightData, gauges) {
            if (!this._fightEl) return;
            const names = { '-1': leftData && leftData.name, '1': rightData && rightData.name };
            ['-1', '1'].forEach(side => {
                const el = this._fighterEls[side];
                if (!el) return;
                el.querySelector('.mt-fname').textContent = names[side] || '';
                el.classList.remove('mt-down');
            });
            this._fightEl.style.display = '';
            this.setGauges(gauges);
            this.setClock(MT_ROUND_SECONDS);
        }

        hideFightHud() { if (this._fightEl) this._fightEl.style.display = 'none'; }

        setGauges(gauges) {
            if (!this._fightEl || !gauges) return;
            ['-1', '1'].forEach(side => {
                const el = this._fighterEls[side];
                const g = gauges[side];
                if (!el || !g) return;
                const hpRatio = Math.max(0, Math.min(1, g.hp / Math.max(1, g.mhp)));
                const mpRatio = g.mmp > 0 ? Math.max(0, Math.min(1, g.mp / g.mmp)) : 0;
                const tpRatio = Math.max(0, Math.min(1, g.tp / Math.max(1, g.mtp)));
                const hp = el.querySelector('.mt-hp');
                hp.querySelector('i').style.width = (hpRatio * 100) + '%';
                hp.querySelector('span').textContent =
                    T('MonsterTournament.ui.hp') + ' ' + g.hp + ' / ' + g.mhp;
                hp.classList.toggle('mt-low', hpRatio <= 0.25);
                const mp = el.querySelector('.mt-mp');
                mp.querySelector('i').style.width = (mpRatio * 100) + '%';
                mp.querySelector('span').textContent =
                    T('MonsterTournament.ui.mp') + ' ' + g.mp + ' / ' + g.mmp;
                // The orb fills as a pie: one conic sweep is the whole of it, so
                // there is no second element to keep in step.
                const tp = el.querySelector('.mt-tp');
                tp.style.setProperty('--mt-tp-fill', (tpRatio * 360) + 'deg');
                tp.querySelector('b').textContent = T('MonsterTournament.ui.tp') + ' ' + g.tp;
                el.classList.toggle('mt-down', g.hp <= 0);
            });
        }

        setClock(seconds) {
            if (!this._clockEl) return;
            const shown = Math.max(0, Math.ceil(seconds));
            this._clockEl.textContent = String(shown);
            this._clockEl.classList.toggle('mt-urgent', shown <= 10);
        }

        // The round clock runs only while a bout is on screen; when it reaches
        // zero the arena settles the fight where it stands. Nothing is re-rolled:
        // the winner was decided by the simulation before the first punch.
        startFightClock(onTimeout) {
            this._fightClock = MT_ROUND_SECONDS;
            this._fightClockAt = performance.now();
            this._onClockOut = onTimeout;
            this.setClock(MT_ROUND_SECONDS);
        }

        stopFightClock() { this._fightClock = null; this._onClockOut = null; }

        updateFightClock() {
            if (this._fightClock === null || this._fightClock === undefined) return;
            const now = performance.now();
            const last = this._fightClockAt || now;
            this._fightClockAt = now;
            this._fightClock = Math.max(0, this._fightClock - (now - last) / 1000);
            this.setClock(this._fightClock);
            if (this._fightClock <= 0) {
                const timeout = this._onClockOut;
                this._fightClock = null;
                this._onClockOut = null;
                if (timeout) timeout();
            }
        }

        refreshStats() {
            const m = this.selectedMonsters[this.currentMonsterIndex];
            if (!m || !this._statsEl) return;
            this._statsEl.querySelector('.mt-name').textContent = m.name;
            this._statsEl.querySelector('.mt-sub').textContent =
                T('MonsterTournament.fighterOf', { index: this.currentMonsterIndex + 1, total: this.selectedMonsters.length });
            const names = [2, 3, 4, 5, 6, 7].map(paramName);
            const grid = this._statsEl.querySelector('.mt-statgrid');
            grid.innerHTML = names.map((n, i) =>
                `<div class="mt-stat"><div class="lbl">${n}</div><div class="val">${m.params[i + 2]}</div></div>`
            ).join('');
            const power = m.params[0] + m.params[2] + m.params[4] + m.params[5];
            this._statsEl.querySelector('.mt-power').textContent = `Combat Power: ${power}`;
        }

        refreshBet() {
            if (!this._betEl) return;
            const maxBet = $gameParty.numItems($dataItems[bettingItemId]);
            this._betEl.querySelector('.mt-bet-amount').innerHTML = `Bet: <b>${this._betAmount}</b>`;
            this._betEl.querySelector('.mt-bet-avail').textContent = `Available: ${maxBet}`;
        }

        refreshAddBet() {
            if (!this._addbetEl) return;
            const bet = this.currentBets[this.playerChoice] || 0;
            this._addbetEl.querySelector('.mt-addbet-title').textContent =
                `${this.selectedMonsters[this.playerChoice].name} advances!`;
            const opts = this._addbetEl.querySelectorAll('.mt-opt');
            opts[0].textContent = T('MonsterTournament.doubleBet', { bet });
            opts.forEach((o, i) => o.classList.toggle('sel', i === this._addBetIndex));
        }

        showSelectionMonster() {
            const data = this.selectedMonsters[this.currentMonsterIndex];
            if (!data) return;
            this._soloToken = (this._soloToken || 0) + 1;
            const token = this._soloToken;
            // Async load; ignore if the player has already cycled away.
            this._arena.showSolo(data).then(() => {
                if (token !== this._soloToken) { /* superseded */ }
            });
            this.refreshStats();
        }

        enterSelection() {
            this.phase = 'selection';
            this._statsEl.style.display = '';
            this._statsEl.classList.add('mt-active');
            this.setTitle(T('MonsterTournament.chooseFighter'));
        }

        //--- frame -------------------------------------------------------------

        update() {
            super.update();

            if (this._arena) {
                // Cap the 3D arena render + full canvas texture upload to ~30fps via a
                // frame accumulator (same approach as Bestiary.js), halving GPU/CPU work.
                const now = performance.now();
                const dt = this._mtLastFrame ? (now - this._mtLastFrame) : 1000;
                this._mtFrameAcc = (this._mtFrameAcc || 0) + Math.min(dt, 50);
                this._mtLastFrame = now;
                if (this._mtFrameAcc >= (1000 / 30)) {
                    this._mtFrameAcc = 0;
                    this._arena.render();
                    if (this._arenaSprite && this._arenaSprite.texture) {
                        this._arenaSprite.texture.update();
                    }
                }
                this.updateEffects();
            }

            this.updateFightClock();
            this.updateInput();
        }

        // All navigation runs through RMMZ Input, so keyboard, gamepad and the
        // project's WASD/global mapper all drive the DOM HUD identically.
        updateInput() {
            switch (this.phase) {
                case 'selection': return this.updateSelectionInput();
                case 'betting':   return this.updateBettingInput();
                case 'addbet':    return this.updateAddBetInput();
            }
        }

        updateSelectionInput() {
            if (Input.isRepeated('right')) this.navigateMonster(1);
            else if (Input.isRepeated('left')) this.navigateMonster(-1);
            else if (Input.isTriggered('ok')) this.onMonsterSelect();
            else if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.popScene(); }
        }

        updateBettingInput() {
            const maxBet = $gameParty.numItems($dataItems[bettingItemId]);
            let changed = false;
            if (Input.isRepeated('right')) { this._betAmount = Math.min(this._betAmount + 1, maxBet); changed = true; }
            else if (Input.isRepeated('left')) { this._betAmount = Math.max(this._betAmount - 1, 1); changed = true; }
            else if (Input.isRepeated('up')) { this._betAmount = Math.min(this._betAmount + 10, maxBet); changed = true; }
            else if (Input.isRepeated('down')) { this._betAmount = Math.max(this._betAmount - 10, 1); changed = true; }
            else if (Input.isTriggered('ok')) { this.onBetConfirm(); return; }
            else if (Input.isTriggered('cancel')) { this.onBetCancel(); return; }
            if (changed) { this.refreshBet(); SoundManager.playCursor(); }
        }

        updateAddBetInput() {
            if (Input.isRepeated('up') || Input.isRepeated('down') ||
                Input.isRepeated('left') || Input.isRepeated('right')) {
                this._addBetIndex = this._addBetIndex === 0 ? 1 : 0;
                this.refreshAddBet();
                SoundManager.playCursor();
            } else if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._addBetIndex === 0 ? this.onAdditionalBetYes() : this.onAdditionalBetNo();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.onAdditionalBetNo();
            }
        }

        navigateMonster(direction) {
            this.currentMonsterIndex = (this.currentMonsterIndex + direction + 8) % 8;
            this.showSelectionMonster();
            SoundManager.playCursor();
        }

        //--- selection / betting ----------------------------------------------

        onMonsterSelect() {
            if ($gameParty.numItems($dataItems[bettingItemId]) <= 0) {
                this.setTitle(T('MonsterTournament.noTokens'));
                SoundManager.playBuzzer();
                this.phase = 'aborting';
                this._after(1500, () => this.popScene());
                return;
            }

            SoundManager.playOk();
            this.playerChoice = this.currentMonsterIndex;
            this.phase = 'betting';
            this._betAmount = 1;
            this._statsEl.style.display = 'none';
            this._statsEl.classList.remove('mt-active');
            this._betEl.style.display = '';
            this._betEl.classList.add('mt-active');
            this.refreshBet();
            this.setTitle(T('MonsterTournament.placeBet', { name: this.selectedMonsters[this.playerChoice].name }));
        }

        onBetConfirm() {
            const betAmount = this._betAmount;
            if (betAmount <= 0 || $gameParty.numItems($dataItems[bettingItemId]) < betAmount) {
                SoundManager.playBuzzer();
                return;
            }
            this.currentBets[this.playerChoice] = betAmount;
            $gameParty.loseItem($dataItems[bettingItemId], betAmount);
            SoundManager.playOk();
            this._betEl.style.display = 'none';
            this._betEl.classList.remove('mt-active');
            this.startTournament();
        }

        onBetCancel() {
            SoundManager.playCancel();
            this._betEl.style.display = 'none';
            this._betEl.classList.remove('mt-active');
            this.showSelectionMonster();
            this.enterSelection();
        }

        //--- tournament --------------------------------------------------------

        startTournament() {
            this.phase = 'tournament';
            if (this._betEl) { this._betEl.style.display = 'none'; this._betEl.classList.remove('mt-active'); }
            if (this._statsEl) { this._statsEl.style.display = 'none'; this._statsEl.classList.remove('mt-active'); }

            this.tournamentBracket = [...Array(8).keys()];
            this.currentRound = 1;
            this.playerMonsterEliminated = false;

            this.simulateRound();
        }

        simulateRound() {
            if (this.tournamentBracket.length === 1) { this.endTournament(); return; }
            if (!this.tournamentBracket.includes(this.playerChoice)) {
                this.playerMonsterEliminated = true;
                this.endTournament();
                return;
            }

            const roundPairs = [];
            for (let i = 0; i < this.tournamentBracket.length; i += 2) {
                roundPairs.push([this.tournamentBracket[i], this.tournamentBracket[i + 1]]);
            }

            const playerPairIndex = roundPairs.findIndex(pair => pair.includes(this.playerChoice));
            if (playerPairIndex === -1) { this.playerMonsterEliminated = true; this.endTournament(); return; }

            // Simulate every non-player battle instantly.
            const nextRound = [];
            for (let i = 0; i < roundPairs.length; i++) {
                if (i === playerPairIndex) continue;
                const [a, b] = roundPairs[i];
                const winner = this.simulateBattle(this.selectedMonsters[a], this.selectedMonsters[b]);
                nextRound.push(winner === this.selectedMonsters[a] ? a : b);
            }

            const playerPair = roundPairs[playerPairIndex];
            const opponentIndex = playerPair[0] === this.playerChoice ? playerPair[1] : playerPair[0];

            this.showPlayerBattle(this.playerChoice, opponentIndex, (winnerIndex) => {
                nextRound.push(winnerIndex);
                if (winnerIndex !== this.playerChoice) {
                    this.playerMonsterEliminated = true;
                    this.endTournament();
                    return;
                }
                this.tournamentBracket = nextRound;
                this.currentRound++;
                if (this.tournamentBracket.length > 1) this.askForAdditionalBet();
                else this.endTournament();
            });
        }

        showPlayerBattle(playerIndex, opponentIndex, callback) {
            const playerMonster = this.selectedMonsters[playerIndex];
            const opponentMonster = this.selectedMonsters[opponentIndex];

            // Run the real battle (player on the left, side -1) and record beats.
            const sim = runDuel(playerMonster, opponentMonster, true);
            const playerWon = sim.winnerSide === -1;
            const winnerIndex = playerWon ? playerIndex : opponentIndex;

            const roundName = this.roundLabel(this.tournamentBracket.length);
            this.setTitle(`${roundName}: ${playerMonster.name}  VS  ${opponentMonster.name}`);

            // The fighting-game board: both fighters' HP, MP and TP and the round
            // clock, live for as long as the bout is on screen.
            this.showFightHud(playerMonster, opponentMonster, sim.startGauges);
            this.startFightClock(() => {
                this.setGauges(sim.finalGauges);
                this._arena.finishDuelNow(-sim.winnerSide);
            });

            this._arena.startDuel(playerMonster, opponentMonster, sim.beats, () => {
                this.stopFightClock();
                this.showBanner(
                    playerWon ? T('MonsterTournament.wins', { name: playerMonster.name }) : T('MonsterTournament.defeated', { name: playerMonster.name }),
                    playerWon ? 'win' : 'lose'
                );
                this._after(1600, () => {
                    this.hideBanner();
                    this.hideFightHud();
                    callback(winnerIndex);
                });
            });
        }

        roundLabel(remaining) {
            if (remaining <= 2) return 'FINAL';
            if (remaining <= 4) return 'SEMI-FINAL';
            if (remaining <= 8) return 'QUARTER-FINAL';
            return 'ROUND';
        }

        // Off-screen battles: run the same simulation, keep only the winner.
        simulateBattle(m1, m2) {
            return runDuel(m1, m2, false).winnerSide === -1 ? m1 : m2;
        }

        //--- additional bet ----------------------------------------------------

        askForAdditionalBet() {
            this.phase = 'addbet';
            this._addBetIndex = 0;
            this.refreshAddBet();
            this._addbetEl.style.display = '';
            this._addbetEl.classList.add('mt-active');
        }

        closeAdditionalBet() {
            if (this._addbetEl) {
                this._addbetEl.style.display = 'none';
                this._addbetEl.classList.remove('mt-active');
            }
            this.phase = 'tournament';
        }

        onAdditionalBetYes() {
            const extra = Math.min(this.currentBets[this.playerChoice], $gameParty.numItems($dataItems[bettingItemId]));
            if (extra > 0) {
                this.currentBets[this.playerChoice] += extra;
                $gameParty.loseItem($dataItems[bettingItemId], extra);
            }
            this.closeAdditionalBet();
            this._after(600, () => this.simulateRound());
        }

        onAdditionalBetNo() {
            this.closeAdditionalBet();
            this._after(600, () => this.simulateRound());
        }

        //--- results -----------------------------------------------------------

        endTournament() {
            this.phase = 'results';
            if (window.MinigameFun) {
                const stake = { spec: 'Animal Training', gambling: true };
                this.playerMonsterEliminated ? window.MinigameFun.lost(stake) : window.MinigameFun.won(stake);
            }

            if (this.playerMonsterEliminated) {
                const lost = this.currentBets[this.playerChoice] || 0;
                this.setTitle(T('MonsterTournament.eliminated', { name: this.selectedMonsters[this.playerChoice].name }));
                this.showBanner(T('MonsterTournament.youLost', { tokens: lost }), 'lose');
            } else {
                // Pari-mutuel odds: the payout multiplier is the field's total
                // power over the chosen monster's power, times a house edge. A
                // flat 8:1 payout was strongly +EV because the player picks the
                // champion after seeing every monster's stats; betting the
                // favorite now pays little, so expected value stays below the stake.
                const stake = this.currentBets[this.playerChoice] || 0;
                const chosenPower = Math.max(1, statPower(this.selectedMonsters[this.playerChoice]));
                let totalPower = 0;
                for (const m of this.selectedMonsters) totalPower += Math.max(1, statPower(m));
                const HOUSE_EDGE = 0.85;
                let multiplier = (totalPower / chosenPower) * HOUSE_EDGE;
                multiplier = Math.max(1.1, Math.min(multiplier, 8)); // never below near-even, cap at old 8x
                const winnings = Math.max(stake, Math.floor(stake * multiplier));
                $gameParty.gainItem($dataItems[bettingItemId], winnings);
                this.setTitle(T('MonsterTournament.champion', { name: this.selectedMonsters[this.playerChoice].name }));
                this.showBanner(T('MonsterTournament.youWon', { tokens: winnings }), 'win');
            }
            this._after(2600, () => this.popScene());
        }

        //--- teardown ----------------------------------------------------------

        // Tracked timeout: cancelled in terminate() and inert after the scene
        // is torn down, so scene-flow callbacks cannot fire against a dead scene.
        _after(ms, fn) {
            if (!this._pendingTimers) this._pendingTimers = [];
            const id = setTimeout(() => {
                if (this._pendingTimers) {
                    this._pendingTimers = this._pendingTimers.filter(t => t !== id);
                }
                if (this._terminated) return;
                fn();
            }, ms);
            this._pendingTimers.push(id);
            return id;
        }

        terminate() {
            this._terminated = true;
            if (this._pendingTimers) {
                this._pendingTimers.forEach(id => clearTimeout(id));
                this._pendingTimers = [];
            }
            if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
            super.terminate();
            if (this._animationSprites) {
                this._animationSprites.forEach(sp => { try { sp.destroy(); } catch (e) {} });
                this._animationSprites = [];
            }
            if (this._popups) {
                this._popups.forEach(pu => { try { pu.sp.destroy(); } catch (e) {} });
                this._popups = [];
            }
            if (this._effectsContainer) {
                if (this._effectsContainer.parent) this._effectsContainer.parent.removeChild(this._effectsContainer);
                this._effectsContainer.destroy({ children: true });
                this._effectsContainer = null;
            }
            if (this._arenaSprite) {
                if (this._arenaSprite.parent) this._arenaSprite.parent.removeChild(this._arenaSprite);
                this._arenaSprite.destroy();
                this._arenaSprite = null;
            }
            if (this._arena) {
                this._arena.dispose();
                this._arena = null;
            }
            if (this._hud) {
                if (this._hud.parentNode) this._hud.parentNode.removeChild(this._hud);
                this._hud = null;
            }
        }
    }

    // Export the scene class.
    window.Scene_MonsterTournament = Scene_MonsterTournament;
})();

//=============================================================================
// SECTION: SLAMGRIMORIE - the magical wrestling league
//=============================================================================
// Two promotions air against each other at the same hour, every night, for
// ever. This section owns all of it: the rosters, the storylines, the cards,
// the match resolver, the ratings war, the book the player bets into, the
// promos that play as bust dialogue, and the Hexapedia articles.
//
// It lives in MonsterTournament.js because this file already owns "fights the
// player bets on and does not control". It is big enough to want a plugin of
// its own and that call is not mine to make.
//
// WHAT IS SIMULATED
//   window.WrestlingLeague.sync()   brings the world up to tonight and is
//   called by every reader, so nothing has to be ticked from outside. A night
//   is resolved once and then it is history: results, records, titles, injuries
//   and audience figures are written into $gameSystem._wrestling and never
//   re-rolled. The card for TOMORROW is booked ahead of time, which is what
//   makes a book to bet into.
//
// ONE DIVISION
//   Neither promotion has ever run a division by gender. Everybody is in the
//   open division, and window.WrestlingLeague is the only answer to who is on
//   a roster: nothing anywhere re-derives it.
//
// MUNDANE WRESTLERS
//   A little over a third of both rosters have no arcana whatsoever. They are
//   flagged mundane, they can never be given a magical style or a hex finish,
//   they are hurt by stipulations built around invocation and they are very
//   hard to beat in a sanctioned straight fall. The commission likes them. The
//   Slamdrome crowd loves them more.
//
// THE WORLD BOOKS THE SHOW
//   Every wrestler is dealt out of js/db/WorldGen/NPCs.json, so a wrestler
//   wears a real sheet, a real bust and a real gender, and the two rules of
//   the world pick which sheets are eligible and what they are allowed to do:
//
//     populationMode  death / empty  no wrestling at all: nobody is promoting
//                                    anything and both channels are dead air
//                     monster        the whole card is creatures and animals
//                     zombie         a zombie roster, same hour, same book
//                     goblin         a Varlenian card
//                     chaos / normal people
//     magicalLevel    severed        every wrestler is mundane, every card is
//                                    a straight fall, there is no hex in it
//                     unbound        almost nobody is mundane and the
//                                    stipulations are all invocation
//                     normal         about a third of each roster is mundane
//
//   window.WrestlingLeague.rules() is the one answer to what this world's
//   league is. Nothing re-derives it from a population mode literal.
//
// TRAINING
//   Following wrestling is a thing a party gets good at: the Wrestling
//   specialization (Specialization.json id 301) is trained a point at a time by
//   watching a show on television, watching a promo, or reading the desk. It is
//   ticked, not awarded per click, so refreshing a page all afternoon teaches
//   nobody anything.
//
// Exposes:
//   window.WrestlingLeague   the simulation and the book
//   window.SlamgrimorieApp   the HypernetOS application (app-slamgrimorie)
//=============================================================================

(() => {
    'use strict';

    const APP_ID = 'app-slamgrimorie';
    const APP_ICON = 76;              // Fist, per js/db/Sprites/Icons.json

    const FEDS = ['slam', 'circle'];  // i18n-ignore  federation ids
    const ROSTER_SIZE = 16;
    const MATCHES_PER_CARD = 6;
    const SHOW_HOUR = 21;
    const MAX_CATCHUP_NIGHTS = 90;    // a world left alone for a year settles quickly
    const HISTORY_NIGHTS = 40;        // nights of results kept per federation
    const MIN_STAKE = 100;            // in gold, i.e. one euro
    const MAX_STAKE = 500000;
    const VIG = 0.92;                 // the house edge baked into a quoted price
    const ODDS_RUNS = 400;
    const MUNDANE_SHARE = 0.38;
    const SPEC_WRESTLING = 'Wrestling';   // i18n-ignore  Specialization.json lookup key (id 301)

    // Styles no mundane wrestler may ever be dealt: each one is an invocation
    // with a wrestling name on it.
    const MAGIC_STYLES = ['hexcaster', 'ritualist', 'puppeteer', 'cryomancer']; // i18n-ignore  style ids
    const PLAIN_STYLES = ['technical', 'brawler', 'highflyer', 'powerhouse',    // i18n-ignore  style ids
                          'shootfighter', 'ironform', 'grinder', 'catchwrestler', 'striker'];
    const ALL_STYLES = PLAIN_STYLES.concat(MAGIC_STYLES);

    const ALIGNMENTS = ['face', 'heel', 'enigma'];                      // i18n-ignore  alignment ids
    const ANGLE_KINDS = ['rivalry', 'betrayal', 'titlechase', 'curse',  // i18n-ignore  storyline ids
                         'possession', 'contract', 'factionwar', 'ghost',
                         'respect', 'invasion'];

    // Busts that can carry a wrestler. Every one of these exists in img/busts.
    const BUSTS = [                                                     // i18n-ignore  image file names
        'Wrestler', 'Gladiator', 'OldGladiator', 'OrcBrawler', 'ElvenBrawler',
        'Biker', 'BikerSkull', 'CreepyJester', 'CyberWitch', 'CyberSamurai',
        'DarkPriestess', 'StreetMonk', 'CatMonk', 'OrcWarrior', 'Mummy',
        'Bouncer', 'Hunter', 'OgreBrute', 'OrcBerserker', 'ElvenBarbarian',
        'MercenaryWarrior', 'Guardian', 'OrcClown', 'ArmorGuardian',
        'GnomeMercenary', 'OrcNomad', 'OrcSamurai', 'AnarchistSamurai',
        'DesertMonk', 'ElvenDeathlord', 'OgreMalformed', 'OrcCriminal'
    ];

    const t  = (k, p) => T('Wrestling.' + k, p);
    const tp = (k) => (T.pool ? T.pool('Wrestling.' + k) : []);
    const tl = (k) => (T.list ? T.list('Wrestling.' + k) : []);

    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const money = (gold) => (window.MoneyFormatter
        ? window.MoneyFormatter.format(Math.round(gold)) : String(Math.round(gold / 100)));

    // ── Seeded randomness ───────────────────────────────────────────────────
    // Every night is reproducible from the world seed and the night number, so
    // two saves of the same world watched the same week saw the same shows.

    function hash(str) {
        let h = 2166136261;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function worldSeed() {
        try {
            if (window.NPCShared && window.NPCShared.worldSeed) return window.NPCShared.worldSeed() >>> 0;
        } catch (e) { /* the simulation suite is not loaded */ }
        return 19002001;
    }

    // Mulberry32: small, fast, and the same number sequence on every machine.
    function rngFrom(key) {
        let a = (hash(key) ^ worldSeed()) >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let x = Math.imul(a ^ (a >>> 15), 1 | a);
            x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    // An unseeded one, for the odds sampler: it must NOT walk the same numbers
    // the real night will walk, or every price would be 1.00 or nothing.
    const freeRng = () => Math.random;

    const pick = (rng, list) => (list && list.length ? list[Math.floor(rng() * list.length) % list.length] : '');
    const pickIdx = (rng, n) => Math.floor(rng() * n) % Math.max(1, n);

    // A line bank entry with {tokens} filled in. Anything unfilled is left
    // alone rather than printed as an empty hole.
    function fill(template, vars) {
        return String(template == null ? '' : template).replace(/\{(\w+)\}/g, (whole, name) =>
            (vars && Object.prototype.hasOwnProperty.call(vars, name)) ? String(vars[name]) : whole);
    }

    // ── State ───────────────────────────────────────────────────────────────

    function tonight() {
        try {
            const mins = window.TimeDateSystem && window.TimeDateSystem.getGameTimeMinutes
                ? window.TimeDateSystem.getGameTimeMinutes() : 0;
            return Math.max(0, Math.floor(Number(mins) / 1440));
        } catch (e) { return 0; }
    }

    function blankState() {
        return {
            rev: 1,
            seed: worldSeed(),
            built: false,
            lastNight: -1,      // the last night whose shows have been resolved
            wrestlers: {},      // id -> wrestler
            feds: {},           // fedId -> { roster:[id], titles:{}, angles:[] }
            cards: {},          // "fed:night" -> card
            ratings: {},        // night -> { slam, circle, reason }
            bets: [],
            bank: 0,            // lifetime net from the book, in gold
        };
    }

    function state() {
        if (typeof $gameSystem === 'undefined' || !$gameSystem) return blankState();
        if (!$gameSystem._wrestling || $gameSystem._wrestling.rev !== 1) {
            $gameSystem._wrestling = blankState();
        }
        return $gameSystem._wrestling;
    }

    // ── What kind of league this world runs ─────────────────────────────────

    const WM = () => window.WorldManager;

    /**
     * The two world axes, answered once, as one object. Everything about the
     * league that is not rolled from the seed is decided here.
     *
     * @returns {object} { enabled, population, magic, mundaneShare,
     *                     allowMagicStyles, forceStraightFalls, sheetKind }
     */
    function rules() {
        const wm = WM();
        let population = 'normal';                       // i18n-ignore  mode id
        let magic = 'normal';                            // i18n-ignore  level id
        try {
            if (wm) {
                if (wm.populationMode) population = String(wm.populationMode());
                if (wm.magicalLevel) magic = String(wm.magicalLevel());
            }
        } catch (e) { /* no world folder: a test world, or the title screen */ }

        // A world with nobody left in it does not run a wrestling promotion.
        // Neither promotion exists, both channels are dead air, and no card is
        // ever booked: there is nothing to bet on because there is nobody to
        // wrestle and nobody to watch.
        const enabled = population !== 'death' && population !== 'empty';

        const severed = magic === 'severed';
        const unbound = magic === 'unbound';
        return {
            enabled,
            population,
            magic,
            // Severed magic means a purely athletic league. Unbound means
            // almost everybody on the card is throwing something.
            mundaneShare: severed ? 1 : (unbound ? 0.08 : MUNDANE_SHARE),
            allowMagicStyles: !severed,
            forceStraightFalls: severed,
            chaosStipulations: unbound,
            sheetKind: population,
        };
    }

    // ── Building a roster ───────────────────────────────────────────────────

    // The sheets this world is allowed to put in a ring, out of the one sprite
    // catalogue (js/db/WorldGen/NPCs.json). A monster world wrestles creatures
    // and animals, a zombie world wrestles the dead, and so on: the roster is
    // drawn from the same pool everything else in the world is drawn from
    // rather than invented here.
    function sheetPool(mode) {
        let db = null;
        try { db = window.WorldGen && window.WorldGen.NPCs; } catch (e) { db = null; }
        if (!db) return [];
        const keep = (e) => {
            if (!e || e.beta) return false;
            if (mode === 'monster') return !!(e.creature || e.animal);
            if (mode === 'zombie') return !!e.zombie;
            if (mode === 'goblin') return !!e.varlenian;
            if (mode === 'chaos') return true;
            // A normal world puts people in the ring, and nothing else.
            return !!e.npc && !e.creature && !e.animal && !e.zombie;
        };
        const out = [];
        Object.keys(db).forEach((key) => {
            const e = db[key];
            if (!keep(e)) return;
            out.push({
                key,
                bust: (Array.isArray(e.busts) && e.busts.length) ? e.busts[0] : null,
                gender: Number.isFinite(e.Gender) ? e.Gender : null,
                magical: !!e.magical,
                creature: !!(e.creature || e.animal),
            });
        });
        // A pool built by walking an object comes out in insertion order, which
        // is stable, so the deal below is reproducible from the seed alone.
        out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        return out;
    }

    function ringName(rng, taken) {
        for (let attempt = 0; attempt < 24; attempt++) {
            const adj = pick(rng, tp('ring.adjective'));
            const noun = pick(rng, tp('ring.noun'));
            const roll = rng();
            let name;
            if (roll < 0.62) name = 'The ' + adj + ' ' + noun;
            else if (roll < 0.85) name = adj + ' ' + noun;
            else name = 'The ' + noun + ' ' + pick(rng, tp('ring.epithet'));
            if (!taken.has(name)) { taken.add(name); return name; }
        }
        return 'The ' + pick(rng, tp('ring.noun')) + ' ' + Math.floor(rng() * 90 + 10);
    }

    function legalName(rng) {
        return pick(rng, tp('ring.given')) + ' ' + pick(rng, tp('ring.family'));
    }

    // Where a wrestler is billed from. Real places if the world has any to
    // offer, so the promotion tours the same continent everything else does.
    function billedFrom(rng) {
        try {
            const dest = window.$dataDestinations || window.Destinations;
            const keys = dest ? Object.keys(dest) : [];
            if (keys.length) return String(pick(rng, keys));
        } catch (e) { /* no destination table in this world */ }
        return pick(rng, tp('school'));
    }

    function makeWrestler(rng, fedId, index, taken, sheet, rule) {
        // A sheet the catalogue already calls non-magical stays non-magical in
        // the ring, and a severed-magic world makes everybody mundane whatever
        // the sheet says.
        const mundane = rule.mundaneShare >= 1
            || (sheet && !sheet.magical && rng() < 0.75)
            || rng() < rule.mundaneShare;
        const styles = (mundane || !rule.allowMagicStyles) ? PLAIN_STYLES : ALL_STYLES;
        const style = pick(rng, styles);
        const name = ringName(rng, taken);
        const stat = (lo, hi) => Math.round(lo + rng() * (hi - lo));
        return {
            id: fedId + ':' + index,                   // i18n-ignore  internal id
            fed: fedId,
            name,
            legal: legalName(rng),
            // One division, every gender in it. The sheet's own gender is kept
            // where it has one, so the wrestler is the person the sprite is.
            gender: (sheet && sheet.gender != null) ? sheet.gender : pickIdx(rng, 4),
            sprite: sheet ? sheet.key : null,
            creature: !!(sheet && sheet.creature),
            mundane,
            style,
            alignment: pick(rng, ALIGNMENTS),
            gimmick: pick(rng, tp('gimmick')),
            school: pick(rng, tp('school')),
            billed: billedFrom(rng),
            finisher: pick(rng, tp('move.finisher')),
            signature: pick(rng, tp('move.signature')),
            bust: (sheet && sheet.bust) ? sheet.bust : pick(rng, BUSTS),
            power: stat(30, 95),
            technique: stat(30, 95),
            arcana: mundane ? 0 : stat(25, 95),
            charisma: stat(25, 98),
            stamina: stat(35, 95),
            durability: stat(30, 95),
            momentum: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            titles: 0,
            condition: 'fit',                          // i18n-ignore  condition id
            conditionUntil: -1,
            debut: 0,
        };
    }

    // The wrestler as a person the rest of the game knows about: a society
    // profile keyed by ring name, so the Empathize panel, the dialogue box and
    // the wiki all draw the same face and the same identity.
    function registerAsNPC(w) {
        try {
            const reg = window.NPCSocietyRegistry;
            if (!reg || !reg.ensureProfile) return;
            if (reg.getProfile(w.name)) return;
            reg.ensureProfile(w.name, null, null, null, {
                initSpec: {
                    bust: w.bust,
                    sprite: w.sprite || undefined,
                    gender: w.gender,
                    job: t('hexapedia.category'),
                    birthplace: w.billed,
                    atk: clamp(Math.round(w.power / 4), 1, 30),
                    mat: clamp(Math.round(w.arcana / 4), 0, 30),
                    agi: clamp(Math.round(w.technique / 4), 1, 30),
                }
            });
        } catch (e) { console.warn('[Slamgrimorie] profile', e); }
    }

    function build(st) {
        if (st.built) return;
        const rule = rules();
        if (!rule.enabled) return;   // a dead world promotes nothing
        st.population = rule.population;
        st.magic = rule.magic;
        const taken = new Set();
        const pool = sheetPool(rule.sheetKind);
        let sheetAt = 0;
        FEDS.forEach((fedId) => {
            const rng = rngFrom('wrestling:roster:' + fedId);
            const roster = [];
            for (let i = 0; i < ROSTER_SIZE; i++) {
                // Walked rather than picked at random, so no world ever books
                // the same sheet twice while the catalogue has spares.
                const sheet = pool.length
                    ? pool[(sheetAt++ + Math.floor(rng() * 3)) % pool.length] : null;
                const w = makeWrestler(rng, fedId, i, taken, sheet, rule);
                st.wrestlers[w.id] = w;
                roster.push(w.id);
            }
            // The Circle bills itself on technique, the Slamdrome on everything
            // else. Nudging the rolled numbers is what makes the two shows feel
            // like two shows rather than one roster cut in half.
            roster.forEach((id) => {
                const w = st.wrestlers[id];
                if (fedId === 'circle') {
                    w.technique = clamp(w.technique + 8, 0, 100);
                    w.charisma = clamp(w.charisma - 6, 0, 100);
                } else {
                    w.charisma = clamp(w.charisma + 8, 0, 100);
                    w.durability = clamp(w.durability + 4, 0, 100);
                }
            });
            const belts = fedId === 'slam'
                ? { open: 'title.slamOpen', second: 'title.slamChaos' }
                : { open: 'title.circleOpen', second: 'title.circleTechnical' };
            const ranked = roster.slice().sort((a, b) => rating(st.wrestlers[b]) - rating(st.wrestlers[a]));
            st.feds[fedId] = {
                roster,
                titles: {
                    open: { key: belts.open, holder: ranked[0], since: 0 },
                    second: { key: belts.second, holder: ranked[3], since: 0 },
                },
                angles: [],
            };
            st.wrestlers[ranked[0]].titles = 1;
            st.wrestlers[ranked[3]].titles = 1;
            seedAngles(st, fedId, rngFrom('wrestling:angles:' + fedId));
            roster.forEach((id) => registerAsNPC(st.wrestlers[id]));
        });
        st.built = true;
    }

    // ── Storylines ──────────────────────────────────────────────────────────

    function seedAngles(st, fedId, rng) {
        const fed = st.feds[fedId];
        fed.angles = [];
        for (let i = 0; i < 4; i++) newAngle(st, fedId, rng, i);
    }

    function newAngle(st, fedId, rng, night) {
        const fed = st.feds[fedId];
        const roster = fed.roster.slice();
        const busy = new Set();
        fed.angles.forEach((a) => { busy.add(a.a); busy.add(a.b); });
        const free = roster.filter((id) => !busy.has(id));
        const pool = free.length >= 2 ? free : roster;
        const a = pick(rng, pool);
        const others = pool.filter((id) => id !== a);
        const b = pick(rng, others.length ? others : roster.filter((id) => id !== a));
        if (!a || !b) return null;
        const kind = pick(rng, ANGLE_KINDS);
        const angle = {
            id: fedId + ':' + kind + ':' + night + ':' + Math.floor(rng() * 9999), // i18n-ignore  internal id
            fed: fedId,
            kind,
            a, b,
            heat: Math.round(25 + rng() * 35),
            beats: [],
            started: night,
            // A storyline runs for a while and then pays off in a match.
            payoff: night + 6 + Math.floor(rng() * 10),
        };
        fed.angles.push(angle);
        return angle;
    }

    function angleTitleKey(st, angle) {
        const fed = st.feds[angle.fed];
        return fed && fed.titles.open ? t(fed.titles.open.key) : '';
    }

    function angleName(st, angle) {
        return fill(t('angle.' + angle.kind + '.name'), {
            a: nameOf(st, angle.a), b: nameOf(st, angle.b), title: angleTitleKey(st, angle)
        });
    }

    function advanceAngles(st, fedId, night, rng) {
        const fed = st.feds[fedId];
        fed.angles.forEach((angle) => {
            const bank = tl('angle.' + angle.kind + '.beat');
            if (bank.length) {
                const beat = fill(bank[(night + angle.started) % bank.length], {
                    a: nameOf(st, angle.a), b: nameOf(st, angle.b), title: angleTitleKey(st, angle)
                });
                angle.beats.unshift({ night, text: beat });
                if (angle.beats.length > 6) angle.beats.length = 6;
            }
            angle.heat = clamp(angle.heat + Math.round(rng() * 8 - 2), 0, 100);
        });
        // A story that has had its payoff match is retired and replaced, so a
        // roster watched for a year is never telling the same four stories.
        const kept = fed.angles.filter((a) => night < a.payoff);
        const retired = fed.angles.length - kept.length;
        fed.angles = kept;
        for (let i = 0; i < retired; i++) newAngle(st, fedId, rng, night);
        while (fed.angles.length < 3) newAngle(st, fedId, rng, night);
    }

    // ── Booking a card ──────────────────────────────────────────────────────

    const cardKey = (fedId, night) => fedId + ':' + night;

    function bookCard(st, fedId, night) {
        const key = cardKey(fedId, night);
        if (st.cards[key]) return st.cards[key];
        const rng = rngFrom('wrestling:card:' + key);
        const fed = st.feds[fedId];
        const available = fed.roster.filter((id) => st.wrestlers[id].condition !== 'suspended');
        const shuffled = available.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
        }
        const used = new Set();
        const matches = [];

        // The storylines that are due get booked first: a payoff match is the
        // whole reason the angle was written.
        fed.angles
            .filter((a) => a.payoff === night || (a.heat > 70 && rng() < 0.5))
            .forEach((a) => {
                if (used.has(a.a) || used.has(a.b)) return;
                if (matches.length >= MATCHES_PER_CARD) return;
                used.add(a.a); used.add(a.b);
                matches.push(makeMatch(st, rng, fedId, night, a.a, a.b, a));
            });

        // Then the title, then whatever is left, paired nearest in rating so
        // the card is not eleven squashes.
        const rest = shuffled.filter((id) => !used.has(id));
        while (rest.length >= 2 && matches.length < MATCHES_PER_CARD) {
            const a = rest.shift();
            const b = rest.shift();
            matches.push(makeMatch(st, rng, fedId, night, a, b, null));
        }

        // The last match of the night is the main event: the hottest angle, or
        // the title, or the best two names on the card.
        matches.sort((m1, m2) => matchWeight(st, m1) - matchWeight(st, m2));
        if (matches.length) {
            matches[matches.length - 1].mainEvent = true;
            const belt = fed.titles.open;
            const meMatch = matches[matches.length - 1];
            if (belt.holder && (meMatch.a === belt.holder || meMatch.b === belt.holder)) {
                meMatch.titleSlot = 'open';                                 // i18n-ignore  slot id
            }
        }
        // The secondary belt goes on whichever earlier match holds it.
        const second = fed.titles.second;
        matches.forEach((m) => {
            if (!m.titleSlot && second.holder && (m.a === second.holder || m.b === second.holder) && rng() < 0.45) {
                m.titleSlot = 'second';                                     // i18n-ignore  slot id
            }
        });

        const card = { fed: fedId, night, matches, resolved: false };
        st.cards[key] = card;
        return card;
    }

    function makeMatch(st, rng, fedId, night, a, b, angle) {
        const all = tp('stipulation');
        const plain = all[0];
        const rule = rules();
        // With magic severed there is no such thing as a hex match: only the
        // grounded stipulations are bookable, and most nights are a straight
        // fall. With magic unbound it is the other way round.
        const stips = rule.forceStraightFalls
            ? all.filter((s) => stipBias(s) <= 0)
            : (rule.chaosStipulations ? all.filter((s) => stipBias(s) >= 0) : all);
        const pool = stips.length ? stips : all;
        // The Circle books a straight fall most nights. The Slamdrome almost
        // never does.
        const plainOdds = rule.forceStraightFalls ? 0.7 : (fedId === 'circle' ? 0.55 : 0.12);
        const stip = rng() < plainOdds ? plain : pick(rng, pool);
        return {
            id: fedId + ':' + night + ':' + a + ':' + b,                    // i18n-ignore  internal id
            fed: fedId, night, a, b,
            stip,
            angleId: angle ? angle.id : null,
            mainEvent: false,
            titleSlot: null,
            result: null,
        };
    }

    function matchWeight(st, m) {
        const wa = st.wrestlers[m.a], wb = st.wrestlers[m.b];
        const star = (w) => w.charisma + w.titles * 25 + w.momentum * 3;
        return star(wa) + star(wb) + (m.angleId ? 60 : 0);
    }

    // ── Resolving a match ───────────────────────────────────────────────────

    // How good a wrestler is in the abstract, before anything about tonight.
    function rating(w) {
        return w.power * 0.24 + w.technique * 0.28 + w.arcana * 0.16
             + w.stamina * 0.14 + w.durability * 0.18;
    }

    // A stipulation either wants arcana or it does not want it at all. This is
    // where a mundane wrestler is punished and where they are dangerous.
    function stipBias(stipText) {
        const s = String(stipText || '');
        const arcane = /Hex|Gravity|Mirror|Candle|Ghost|Summoner|Sealed|Casket|Blindfold|Weather/i.test(s);
        const grounded = /Straight fall|Iron Hour|Chain of Notaries|Two falls|Strap|Lumberjack/i.test(s);
        if (arcane) return 1;
        if (grounded) return -1;
        return 0;
    }

    function scoreFor(st, w, foe, m, ctx) {
        let s = rating(w);
        const bias = stipBias(m.stip);
        if (bias > 0) s += (w.arcana - 45) * 0.30;      // a hex match rewards arcana
        if (bias < 0) s += (w.technique - 45) * 0.22;   // a straight fall rewards the mat
        // A mundane wrestler in a magical stipulation is working uphill, and
        // knows it. In a grounded one they are exactly where they want to be.
        if (w.mundane) s += bias > 0 ? -9 : (bias < 0 ? 7 : 1);
        s += w.momentum * 1.6;
        if (w.condition === 'hurt') s -= 8;
        if (w.condition === 'cursed') s -= 5;
        if (w.condition === 'haunted') s -= 3;
        const fed = st.feds[w.fed];
        if (fed && (fed.titles.open.holder === w.id)) s += 5;
        // Storyline booking: the hotter the angle, the more the promotion
        // protects whoever is chasing, so an upset is live.
        if (ctx && ctx.angle) {
            const chasing = ctx.angle.b === w.id;
            s += (chasing ? 1 : -1) * (ctx.angle.heat / 100) * 5;
        }
        // The Circle is a sport and the Slamdrome is a story: chaos is worth
        // more of the result in one building than the other.
        return s;
    }

    /**
     * One match, start to finish. Deterministic when handed a seeded rng and
     * honest when handed Math.random, which is what lets the odds sampler run
     * the SAME resolver the night will run rather than a model of it.
     *
     * @param {object} st    league state
     * @param {object} m     the booked match
     * @param {function} rng  () => [0,1)
     * @returns {object} { winner, loser, kind, text, titleChange }
     */
    function resolveMatch(st, m, rng) {
        const wa = st.wrestlers[m.a], wb = st.wrestlers[m.b];
        if (!wa || !wb) return null;
        const angle = m.angleId ? findAngle(st, m.fed, m.angleId) : null;
        const ctx = { angle };
        const sa = scoreFor(st, wa, wb, m, ctx);
        const sb = scoreFor(st, wb, wa, m, ctx);
        // A logistic curve rather than a straight comparison: the better
        // wrestler usually wins and never always wins.
        const p = 1 / (1 + Math.exp(-(sa - sb) / 9));
        const aWins = rng() < p;
        const winner = aWins ? wa : wb;
        const loser = aWins ? wb : wa;

        const chaos = m.fed === 'slam' ? 1 : 0.42;
        const roll = rng();
        let kind;
        if (roll < 0.03 * chaos) kind = 'draw';
        else if (roll < 0.09 * chaos) kind = 'double';
        else if (roll < 0.15 * chaos) kind = 'interference';
        else if (roll < 0.20 * chaos) kind = 'disqualification';
        else if (roll < 0.24 * chaos) kind = 'countout';
        else if (roll < 0.30 && !winner.mundane && stipBias(m.stip) > 0) kind = 'banishment';
        else if (roll < 0.52 && winner.technique > winner.power) kind = 'submission';
        else if (roll < 0.62) kind = 'knockout';
        else kind = 'pinfall';

        const third = pick(rng, st.feds[m.fed].roster.filter((id) => id !== m.a && id !== m.b));
        const vars = {
            winner: winner.name, loser: loser.name, move: winner.finisher,
            time: (8 + Math.floor(rng() * 22)) + ':' + String(Math.floor(rng() * 60)).padStart(2, '0'),
            reason: kind === 'interference' ? pick(rng, tp('interferenceDeed')) : pick(rng, tp('dqReason')),
            third: nameOf(st, third),
        };
        return {
            winner: kind === 'draw' || kind === 'double' ? null : winner.id,
            loser: kind === 'draw' || kind === 'double' ? null : loser.id,
            a: m.a, b: m.b,
            nominal: winner.id,     // who the crowd went home thinking had won
            kind,
            text: fill(t('finish.' + kind), vars),
        };
    }

    function findAngle(st, fedId, angleId) {
        const fed = st.feds[fedId];
        return fed ? (fed.angles.find((a) => a.id === angleId) || null) : null;
    }

    function nameOf(st, id) {
        const w = st.wrestlers[id];
        return w ? w.name : '';
    }

    // ── The ratings war ─────────────────────────────────────────────────────

    // Both shows go out at the same hour, so they are not measured separately:
    // one audience is in front of one continent of televisions and it splits.
    function showQuality(st, card) {
        if (!card) return 0;
        let q = 0;
        card.matches.forEach((m) => {
            const wa = st.wrestlers[m.a], wb = st.wrestlers[m.b];
            if (!wa || !wb) return;
            q += (wa.charisma + wb.charisma) / 2;
            q += (wa.titles + wb.titles) * 12;
            if (m.mainEvent) q += 40;
            if (m.titleSlot) q += 35;
            if (m.angleId) {
                const a = findAngle(st, card.fed, m.angleId);
                if (a) q += a.heat * 0.6;
            }
            // The crowd will pay to watch somebody with no hexes at all beat
            // somebody who has them.
            if (wa.mundane !== wb.mundane) q += 14;
        });
        const fed = st.feds[card.fed];
        if (fed) fed.angles.forEach((a) => { q += a.heat * 0.25; });
        return q;
    }

    function rateNight(st, night, rng) {
        const q = {};
        FEDS.forEach((f) => { q[f] = showQuality(st, st.cards[cardKey(f, night)]); });
        // A soft split rather than winner-takes-all: the loser of the hour
        // still has an audience, and a blowout is possible but rare.
        const k = 260;
        const ea = Math.exp((q.slam - q.circle) / k);
        const shareSlam = clamp(ea / (1 + ea) + (rng() - 0.5) * 0.10, 0.18, 0.82);
        const pool = 2600000 + (q.slam + q.circle) * 900 + (rng() - 0.5) * 500000;
        const out = {
            slam: Math.round(pool * shareSlam),
            circle: Math.round(pool * (1 - shareSlam)),
            reason: pick(rng, tp('ratings.reason')),
        };
        out.total = out.slam + out.circle;
        out.winner = out.slam === out.circle ? null : (out.slam > out.circle ? 'slam' : 'circle');
        return out;
    }

    // The line the over/under is set on, published with the card so it can be
    // bet into before the night runs.
    function audienceLine(st, night) {
        let q = 0;
        FEDS.forEach((f) => { q += showQuality(st, st.cards[cardKey(f, night)]); });
        return Math.round((2600000 + q * 900) / 100000) * 100000;
    }

    // ── Running a night ─────────────────────────────────────────────────────

    function runNight(st, night) {
        const rng = rngFrom('wrestling:night:' + night);
        FEDS.forEach((fedId) => {
            const card = bookCard(st, fedId, night);
            if (card.resolved) return;
            card.matches.forEach((m) => {
                const res = resolveMatch(st, m, rng);
                if (!res) return;
                m.result = res;
                applyResult(st, m, res, rng);
            });
            card.resolved = true;
            advanceAngles(st, fedId, night, rng);
        });
        st.ratings[night] = rateNight(st, night, rng);
        settleBets(st, night);
        prune(st, night);
    }

    function applyResult(st, m, res, rng) {
        const wa = st.wrestlers[m.a], wb = st.wrestlers[m.b];
        if (!res.winner) {
            wa.draws++; wb.draws++;
            wa.momentum = clamp(wa.momentum, -6, 6);
            wb.momentum = clamp(wb.momentum, -6, 6);
        } else {
            const win = st.wrestlers[res.winner], lose = st.wrestlers[res.loser];
            win.wins++; lose.losses++;
            win.momentum = clamp(win.momentum + 2, -10, 10);
            lose.momentum = clamp(lose.momentum - 2, -10, 10);
            if (m.titleSlot) {
                const belt = st.feds[m.fed].titles[m.titleSlot];
                // A belt does not change hands on a disqualification or a
                // countout. It never has and the commission will not hear it.
                const clean = res.kind !== 'disqualification' && res.kind !== 'countout';
                if (clean && belt.holder !== win.id) {
                    belt.holder = win.id;
                    belt.since = m.night;
                    win.titles++;
                    res.titleChange = fill(t('finish.titleChange'), {
                        winner: win.name, title: t(belt.key)
                    });
                    notifyTitle(win.name, t(belt.key));
                }
            }
            // Hard finishes hurt people, and the ring remembers for a week.
            if ((res.kind === 'knockout' || res.kind === 'banishment') && rng() < 0.30) {
                lose.condition = res.kind === 'banishment' ? 'cursed' : 'hurt';  // i18n-ignore  condition ids
                lose.conditionUntil = m.night + 2 + Math.floor(rng() * 6);
            }
            if (res.kind === 'disqualification' && rng() < 0.12) {
                lose.condition = 'suspended';                                    // i18n-ignore  condition id
                lose.conditionUntil = m.night + 1 + Math.floor(rng() * 4);
            }
        }
        [wa, wb].forEach((w) => {
            if (w.condition !== 'fit' && w.conditionUntil <= m.night) {
                w.condition = 'fit';                                             // i18n-ignore  condition id
                w.conditionUntil = -1;
            }
        });
    }

    function notifyTitle(winner, title) {
        try {
            if (window.ParchmentToast) {
                window.ParchmentToast.show(t('toast.titleChange', { winner, title }));
            }
        } catch (e) { /* no toast service on the title screen */ }
    }

    // Nights the desk no longer shows are dropped, so a long world does not
    // carry a thousand cards around in its savegame.
    function prune(st, night) {
        const floor = night - HISTORY_NIGHTS;
        Object.keys(st.cards).forEach((key) => {
            const n = Number(key.split(':')[1]);
            if (n < floor) delete st.cards[key];
        });
        Object.keys(st.ratings).forEach((key) => {
            if (Number(key) < floor) delete st.ratings[key];
        });
        st.bets = st.bets.filter((b) => b.night >= floor);
    }

    /**
     * Bring the league up to tonight. Every public reader calls this first, so
     * nothing outside has to know the league needs ticking.
     */
    function sync() {
        const st = state();
        build(st);
        if (!st.built) return st;   // nothing is promoted in a dead world
        const now = tonight();
        if (st.lastNight < 0) st.lastNight = now - 1;
        if (now - st.lastNight > MAX_CATCHUP_NIGHTS) st.lastNight = now - MAX_CATCHUP_NIGHTS;
        while (st.lastNight < now) {
            st.lastNight++;
            runNight(st, st.lastNight);
        }
        // Tomorrow is always booked, because that is what there is to bet on.
        FEDS.forEach((f) => bookCard(st, f, now + 1));
        return st;
    }

    // ── The book ────────────────────────────────────────────────────────────

    // Odds are quoted by running the SAME resolver the night will run, a few
    // hundred times, with free randomness. Nothing models the model.
    function matchProbability(st, m) {
        let winsA = 0, decided = 0;
        const rng = freeRng();
        for (let i = 0; i < ODDS_RUNS; i++) {
            const res = resolveMatch(st, m, rng);
            if (!res || !res.winner) continue;
            decided++;
            if (res.winner === m.a) winsA++;
        }
        if (!decided) return 0.5;
        return clamp(winsA / decided, 0.02, 0.98);
    }

    // The shortest price the book will quote, and it has to be shorter than the
    // fair price of the shortest thing the book will quote a price ON, or that
    // selection is a free bet: at a floor of 1.06 a 98% favourite returns 1.04
    // per unit staked for ever. So the floor is 1.01 and the sampled
    // probability is capped at 0.98, which keeps odds * probability under 1 at
    // both ends and leaves the ordinary margin everywhere in between.
    const MIN_PRICE = 1.01;
    const MAX_P = 0.98;

    function priceOf(p) {
        return Math.max(MIN_PRICE, Math.round((VIG / clamp(p, 0.04, MAX_P)) * 100) / 100);
    }

    function hourProbability(st, night) {
        const rng = freeRng();
        let slam = 0;
        for (let i = 0; i < ODDS_RUNS; i++) {
            const r = rateNight(st, night, rng);
            if (r.winner === 'slam') slam++;
        }
        return clamp(slam / ODDS_RUNS, 0.02, 0.98);
    }

    function audienceProbability(st, night, line) {
        const rng = freeRng();
        let over = 0;
        for (let i = 0; i < ODDS_RUNS; i++) {
            if (rateNight(st, night, rng).total > line) over++;
        }
        return clamp(over / ODDS_RUNS, 0.02, 0.98);
    }

    /**
     * Every market open on a night, each already priced.
     * @param {number} night
     */
    function book(night) {
        const st = sync();
        const out = [];
        FEDS.forEach((fedId) => {
            const card = st.cards[cardKey(fedId, night)];
            if (!card || card.resolved) return;
            card.matches.forEach((m) => {
                const p = matchProbability(st, m);
                out.push({
                    market: 'match',                                   // i18n-ignore  market id
                    night, fed: fedId, ref: m.id,
                    label: t('bet.match', { a: nameOf(st, m.a), b: nameOf(st, m.b) }),
                    stip: m.stip,
                    picks: [
                        { id: m.a, label: nameOf(st, m.a), p, odds: priceOf(p) },
                        { id: m.b, label: nameOf(st, m.b), p: 1 - p, odds: priceOf(1 - p) },
                    ],
                });
            });
        });
        if (out.length) {
            const p = hourProbability(st, night);
            out.push({
                market: 'hour',                                        // i18n-ignore  market id
                night, fed: null, ref: 'hour:' + night,                // i18n-ignore  internal id
                label: t('bet.hour'),
                picks: FEDS.map((f) => ({
                    id: f, label: t('fed.' + f + '.short'),
                    p: f === 'slam' ? p : 1 - p, odds: priceOf(f === 'slam' ? p : 1 - p),
                })),
            });
            const line = audienceLine(st, night);
            const po = audienceProbability(st, night, line);
            out.push({
                market: 'audience',                                    // i18n-ignore  market id
                night, fed: null, ref: 'aud:' + night, line,           // i18n-ignore  internal id
                label: t('bet.audience', { n: num(line) }),
                picks: [
                    { id: 'over', label: t('label.over'), p: po, odds: priceOf(po) },      // i18n-ignore  pick id
                    { id: 'under', label: t('label.under'), p: 1 - po, odds: priceOf(1 - po) },// i18n-ignore  pick id
                ],
            });
        }
        return out;
    }

    /**
     * Stake on one market. The price is frozen at the moment of the bet, the
     * way a betting slip works.
     * @returns {object} { ok, message }
     */
    function placeBet(market, pickId, stake) {
        const st = sync();
        const amount = Math.round(Number(stake) || 0);
        if (st.cards[cardKey(FEDS[0], market.night)] && st.cards[cardKey(FEDS[0], market.night)].resolved) {
            return { ok: false, message: t('bet.closed') };
        }
        if (amount < MIN_STAKE) return { ok: false, message: t('bet.min', { amount: money(MIN_STAKE) }) };
        if (amount > MAX_STAKE) return { ok: false, message: t('bet.max', { amount: money(MAX_STAKE) }) };
        if (typeof $gameParty === 'undefined' || !$gameParty || $gameParty.gold() < amount) {
            return { ok: false, message: t('bet.tooPoor') };
        }
        const chosen = market.picks.find((p) => String(p.id) === String(pickId));
        if (!chosen) return { ok: false, message: t('bet.closed') };
        $gameParty.loseGold(amount);
        st.bets.push({
            night: market.night,
            market: market.market,
            ref: market.ref,
            pick: String(pickId),
            label: chosen.label,
            odds: chosen.odds,
            stake: amount,
            line: market.line || 0,
            settled: false,
        });
        return {
            ok: true,
            message: t('bet.placed', { stake: money(amount), pick: chosen.label, odds: chosen.odds.toFixed(2) })
        };
    }

    function settleBets(st, night) {
        let net = 0;
        st.bets.forEach((bet) => {
            if (bet.settled || bet.night !== night) return;
            bet.settled = true;
            let won = false;
            if (bet.market === 'match') {
                const m = findMatch(st, night, bet.ref);
                won = !!(m && m.result && m.result.winner === bet.pick);
            } else if (bet.market === 'hour') {
                won = st.ratings[night] && st.ratings[night].winner === bet.pick;
            } else if (bet.market === 'audience') {
                const total = st.ratings[night] ? st.ratings[night].total : 0;
                won = bet.pick === 'over' ? total > bet.line : total <= bet.line;
            }
            bet.won = won;
            const payout = won ? Math.round(bet.stake * bet.odds) : 0;
            bet.payout = payout;
            net += payout - bet.stake;
            if (payout && typeof $gameParty !== 'undefined' && $gameParty) $gameParty.gainGold(payout);
        });
        if (net !== 0) {
            st.bank += net;
            try {
                if (window.ParchmentToast) {
                    window.ParchmentToast.show(net > 0
                        ? t('toast.betWon', { amount: money(net) })
                        : t('toast.betLost', { amount: money(-net) }));
                }
            } catch (e) { /* no toast service */ }
        }
    }

    function findMatch(st, night, matchId) {
        for (const fedId of FEDS) {
            const card = st.cards[cardKey(fedId, night)];
            if (!card) continue;
            const m = card.matches.find((x) => x.id === matchId);
            if (m) return m;
        }
        return null;
    }

    // ── Promos ──────────────────────────────────────────────────────────────

    // A promo is a bust conversation between two, three or four wrestlers, cut
    // the way a wrestling segment is cut: somebody opens, somebody answers,
    // and then whoever was not invited walks out.

    function bustName(w) {
        return w ? w.bust : 'Wrestler';
    }

    function promoLine(rng, w, bank, vars) {
        const pool = Array.isArray(bank) ? bank : [];
        // A mundane wrestler has their own things to say about all this, and
        // says them about a third of the time.
        if (w.mundane && rng() < 0.3) {
            const own = tp('mundane.promo');
            if (own.length) return fill(pick(rng, own), vars);
        }
        return fill(pick(rng, pool), vars);
    }

    /**
     * The promo for a night, as dialogue steps ready for the bust stage.
     * @param {string} fedId
     * @param {number} [night]  defaults to tonight
     * @returns {Array} steps for window.StoryDialogue.playSteps
     */
    function promoSteps(fedId, night) {
        const st = sync();
        const n = (night == null) ? tonight() : night;
        const rng = rngFrom('wrestling:promo:' + fedId + ':' + n);
        const fed = st.feds[fedId];
        if (!fed || !fed.angles.length) return [];
        const angle = fed.angles.slice().sort((a, b) => b.heat - a.heat)[0];
        const a = st.wrestlers[angle.a], b = st.wrestlers[angle.b];
        if (!a || !b) return [];
        const belt = t(fed.titles.open.key);
        const hour = SHOW_HOUR + ':00';
        const varsA = { foe: b.name, title: belt, hour, move: a.finisher, school: a.school, w: a.name };
        const varsB = { foe: a.name, title: belt, hour, move: b.finisher, school: b.school, w: b.name };

        const step = (w, text, side) => ({
            imageName: bustName(w),
            displayName: w.name,
            text,
            side,
        });

        const steps = [];
        steps.push(step(a, promoLine(rng, a, tp('promo.open.' + a.alignment), varsA), 'left'));
        steps.push(step(a, fill(pick(rng, tp('promo.callout')), varsA), 'left'));
        steps.push(step(b, fill(pick(rng, tp('promo.answer')), varsB), 'right'));
        steps.push(step(b, promoLine(rng, b, tp('promo.boast'), varsB), 'right'));
        steps.push(step(a, promoLine(rng, a, tp('promo.threat'), varsA), 'left'));

        // Third and fourth voices: a wrestling promo is rarely left alone.
        const others = fed.roster.filter((id) => id !== a.id && id !== b.id);
        if (others.length && rng() < 0.65) {
            const c = st.wrestlers[pick(rng, others)];
            steps.push(step(c, fill(pick(rng, tp('promo.third')), {
                foe: a.name, title: belt, hour, w: c.name
            }), 'right'));
            const rest = others.filter((id) => id !== c.id);
            if (rest.length && rng() < 0.45) {
                const d = st.wrestlers[pick(rng, rest)];
                steps.push(step(d, fill(pick(rng, tp('promo.fourth')), {
                    foe: c.name, title: belt, hour, w: d.name
                }), 'left'));
            }
        }
        steps.push(step(a, fill(pick(rng, tp('promo.close.' + a.alignment)), varsA), 'left'));
        return steps.filter((s) => s.text);
    }

    // ── Training ────────────────────────────────────────────────────────────
    // Following wrestling is a skill. Watching a show, watching a promo or
    // reading the desk all teach it, a little, and the tick interval is what
    // stops a player learning it by refreshing a page.

    function train(points, key, seconds) {
        try {
            const XP = window.SpecializationXP;
            if (!XP || !XP.tick) return;
            XP.tick(SPEC_WRESTLING, points, seconds || 120, { key: 'wrestling:' + key });
        } catch (e) { /* the specialization layer is not loaded */ }
    }

    /**
     * Play tonight's promo on the bust stage. Needs a scene with a bust
     * manager, i.e. the map: called from the app, the OS is closed first by
     * whoever is asking.
     */
    function playPromo(fedId, night) {
        const steps = promoSteps(fedId, night);
        if (!steps.length) return false;
        if (window.StoryDialogue && window.StoryDialogue.playSteps) {
            const played = window.StoryDialogue.playSteps(steps);
            if (played) train(1, 'promo', 60);
            return played;
        }
        return false;
    }

    // ── Hexapedia ───────────────────────────────────────────────────────────

    const slugOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    function wrestlerBySlug(slug) {
        const st = sync();
        const want = String(slug || '').toLowerCase();
        return Object.values(st.wrestlers).find((w) => slugOf(w.name) === want) || null;
    }

    const WIKI_CSS = `
        .wr-doc{font-family:Georgia,'Times New Roman',serif;color:#202122;background:#fff;padding:18px 24px;line-height:1.6}
        .wr-doc h1{font-family:Georgia,serif;font-size:26px;border-bottom:1px solid #a2a9b1;margin:0 0 4px;padding-bottom:6px}
        .wr-doc h2{font-size:19px;border-bottom:1px solid #a2a9b1;margin:20px 0 8px;padding-bottom:4px}
        .wr-doc .wr-sub{color:#54595d;font-style:italic;margin-bottom:14px}
        .wr-box{float:right;width:250px;border:1px solid #a2a9b1;background:#f8f9fa;padding:8px;margin:0 0 12px 16px;font-size:13px}
        .wr-box tr td{padding:3px 4px;vertical-align:top}
        .wr-box tr td:first-child{font-weight:bold;width:40%;color:#54595d}
        .wr-doc ul{margin:6px 0 6px 22px}
        .wr-doc a{color:#3366cc;cursor:pointer;text-decoration:none}
        .wr-doc a:hover{text-decoration:underline}
        .wr-cat{columns:2;column-gap:28px}
        .wr-tag{display:inline-block;padding:1px 7px;border:1px solid #a2a9b1;border-radius:9px;font-size:12px;background:#eaecf0;margin-right:5px}
        .wr-mundane{background:var(--xp-face-4);border-color:var(--xp-silver-3)}
        @media (max-width:520px){.wr-box{float:none;width:auto;margin:0 0 12px}.wr-cat{columns:1}}
    `;

    function categoryHTML() {
        const st = sync();
        if (!st.built) {
            return '<style>' + WIKI_CSS + '</style><div class="wr-doc"><h1>'
                 + esc(t('hexapedia.category')) + '</h1><p>' + esc(t('deadWorld')) + '</p></div>';
        }
        train(1, 'wiki', 180);
        let html = '<style>' + WIKI_CSS + '</style><div class="wr-doc">';
        html += '<h1>' + esc(t('hexapedia.category')) + '</h1>';
        html += '<div class="wr-sub">' + esc(t('hexapedia.categoryIntro')) + '</div>';
        html += '<p>' + esc(t('oneDivision')) + '</p>';
        FEDS.forEach((fedId) => {
            html += '<h2>' + esc(t('fed.' + fedId + '.name')) + '</h2>';
            html += '<p>' + esc(t('fed.' + fedId + '.ethos')) + '</p><div class="wr-cat"><ul>';
            st.feds[fedId].roster.forEach((id) => {
                const w = st.wrestlers[id];
                html += '<li><a data-go="hexapedia.com/wrestler/' + esc(slugOf(w.name)) + '">' + esc(w.name) + '</a>'
                     + (w.mundane ? ' <span class="wr-tag wr-mundane">' + esc(t('mundane.tag')) + '</span>' : '')
                     + '</li>';
            });
            html += '</ul></div>';
        });
        return html + '</div>';
    }

    function wrestlerHTML(w) {
        const st = sync();
        train(1, 'wiki', 180);
        const rng = rngFrom('wrestling:wiki:' + w.id);
        const fed = st.feds[w.fed];
        const ib = T.obj ? T.obj('Wrestling.hexapedia.infobox') : {};
        const row = (k, v) => '<tr><td>' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
        let html = '<style>' + WIKI_CSS + '</style><div class="wr-doc">';
        html += '<h1>' + esc(w.name) + '</h1>';
        html += '<div class="wr-sub">' + esc(t('fed.' + w.fed + '.name')) + ' &middot; ' + esc(t('label.openDivision')) + '</div>';
        html += '<table class="wr-box">';
        html += row(ib.ringName, w.name);
        html += row(ib.legalName, w.legal);
        html += row(ib.promotion, t('fed.' + w.fed + '.short'));
        html += row(ib.billed, w.billed);
        html += row(ib.trained, w.school);
        html += row(ib.style, t('style.' + w.style));
        html += row(ib.arcana, w.mundane ? t('label.noMagic') : String(w.arcana));
        html += row(ib.finisher, w.finisher);
        html += row(ib.alignment, t('alignment.' + w.alignment));
        html += row(ib.record, w.wins + ' / ' + w.losses + ' / ' + w.draws);
        html += row(ib.titles, String(w.titles));
        html += '</table>';

        const bio = tl('hexapedia.bio');
        html += '<p>' + esc(fill(bio[0] || '', {
            w: w.name, fed: t('fed.' + w.fed + '.name'), place: w.billed, gimmick: w.gimmick
        })) + ' ' + esc(fill(bio[1] || '', {
            w: w.name, school: w.school, style: t('style.' + w.style), move: w.finisher
        })) + '</p>';
        if (w.mundane) {
            html += '<p><b>' + esc(fill(t('mundane.wikiLine'), { w: w.name })) + '</b></p>';
        }
        html += '<p>' + esc(fill(bio[3] || '', { fed: t('fed.' + w.fed + '.name') })) + '</p>';

        html += '<h2>' + esc(t('label.record')) + '</h2>';
        const total = w.wins + w.losses + w.draws;
        html += '<p>' + esc(total
            ? fill(t('hexapedia.careerLine'), { wins: w.wins, losses: w.losses, total })
            : t('hexapedia.careerNone')) + '</p>';

        const belts = Object.keys(fed.titles)
            .filter((slot) => fed.titles[slot].holder === w.id)
            .map((slot) => t(fed.titles[slot].key));
        if (belts.length) {
            html += '<p><b>' + esc(t('label.champion')) + ':</b> ' + esc(belts.join(', ')) + '</p>';
        }

        html += '<h2>' + esc(t('hexapedia.anglesHeading')) + '</h2>';
        const mine = fed.angles.filter((a) => a.a === w.id || a.b === w.id);
        if (!mine.length) html += '<p>' + esc(t('hexapedia.noAngles')) + '</p>';
        mine.forEach((a) => {
            html += '<p><b>' + esc(angleName(st, a)) + '</b></p><ul>';
            a.beats.slice(0, 3).forEach((bt) => { html += '<li>' + esc(bt.text) + '</li>'; });
            html += '</ul>';
        });

        html += '<h2>' + esc(t('hexapedia.matchesHeading')) + '</h2><ul>';
        let shown = 0;
        for (let n = st.lastNight; n > st.lastNight - HISTORY_NIGHTS && shown < 8; n--) {
            const card = st.cards[cardKey(w.fed, n)];
            if (!card || !card.resolved) continue;
            card.matches.forEach((m) => {
                if ((m.a !== w.id && m.b !== w.id) || !m.result || shown >= 8) return;
                shown++;
                html += '<li>' + esc(t('label.day', { n })) + ': ' + esc(m.result.text) + '</li>';
            });
        }
        if (!shown) html += '<li>' + esc(t('hexapedia.careerNone')) + '</li>';
        html += '</ul>';
        html += '<p><a data-go="hexapedia.com/wrestlers">' + esc(t('hexapedia.category')) + '</a> &middot; '
             + esc(pick(rng, tp('commentary.' + w.fed))) + '</p>';
        return html + '</div>';
    }

    // The two addresses the wiki answers on. Registered with the browser's live
    // document gateway, because a procedural roster cannot be a file on disk.
    function registerWiki() {
        if (!window.HypernetSites || !window.HypernetSites.registerLive) return;
        window.HypernetSites.registerLive('hexapedia.com/wrestlers', () => ({   // i18n-ignore  address
            title: t('hexapedia.category'), html: categoryHTML()
        }));
        window.HypernetSites.registerLive(/^hexapedia\.com\/wrestler\/(.+)$/, (m) => {
            const w = wrestlerBySlug(m[1]);
            return w ? { title: w.name, html: wrestlerHTML(w) } : null;
        });
    }

    // ── Public face ─────────────────────────────────────────────────────────

    window.WrestlingLeague = {
        FEDS,
        SHOW_HOUR,
        sync,
        tonight,
        rules,
        // The one question every other system asks first: is there wrestling
        // in this world at all? A death or empty world answers no, and the app,
        // both channels and the wiki all say so rather than inventing a card.
        enabled: () => rules().enabled,
        train,
        state: () => sync(),
        wrestler: (id) => sync().wrestlers[id] || null,
        wrestlerBySlug,
        roster: (fedId) => {
            const st = sync();
            return (st.feds[fedId] ? st.feds[fedId].roster : []).map((id) => st.wrestlers[id]);
        },
        card: (fedId, night) => {
            const st = sync();
            return st.cards[cardKey(fedId, night == null ? tonight() : night)] || null;
        },
        angles: (fedId) => {
            const st = sync();
            const fed = st.feds[fedId];
            return fed ? fed.angles.map((a) => Object.assign({ name: angleName(st, a) }, a)) : [];
        },
        titles: (fedId) => {
            const st = sync();
            const fed = st.feds[fedId];
            if (!fed) return [];
            return Object.keys(fed.titles).map((slot) => ({
                slot,
                name: t(fed.titles[slot].key),
                holder: fed.titles[slot].holder ? st.wrestlers[fed.titles[slot].holder] : null,
                since: fed.titles[slot].since,
            }));
        },
        ratings: (night) => sync().ratings[night == null ? tonight() : night] || null,
        ratingsRun: (count) => {
            const st = sync();
            const out = [];
            for (let n = st.lastNight; n > st.lastNight - (count || 10); n--) {
                if (st.ratings[n]) out.push(Object.assign({ night: n }, st.ratings[n]));
            }
            return out;
        },
        audienceLine: (night) => audienceLine(sync(), night == null ? tonight() + 1 : night),
        book,
        placeBet,
        bets: () => sync().bets.slice().reverse(),
        bank: () => sync().bank,
        promoSteps,
        playPromo,
        // The wiki, exposed so the browser and the tests can ask for a page
        // without going through an address.
        categoryHTML,
        wrestlerHTML,
        slugOf,
        // Bared for the test harness: the resolver and the rating model are the
        // two things the odds are quoted off, so they are the two things a test
        // has to be able to hold still.
        _internals: { resolveMatch, rateNight, rating, stipBias, showQuality, rngFrom, fill },
    };

    // ── The application ─────────────────────────────────────────────────────

    const TABS = ['tonight', 'card', 'roster', 'angles', 'betting', 'ratings', 'titles']; // i18n-ignore  tab ids

    const S = {
        app: 'display:flex; flex-direction:column; height:100%; background:var(--xp-face-5); ' +
             "font-family:'Tahoma',sans-serif; font-size:14px; color:var(--xp-ink-2);",
        header: 'display:flex; align-items:center; gap:12px; padding:10px 14px; color:var(--xp-white); ' +
                'background:linear-gradient(to bottom,var(--xp-red-4),var(--xp-red-5)); border-bottom:2px solid var(--xp-red-5);',
        nav: 'width:150px; flex:0 0 150px; background:var(--xp-face-4); border-right:1px solid var(--xp-face-7); ' +
             'padding:8px 0; overflow-y:auto;',
        navItem: 'padding:7px 14px; cursor:pointer; border-left:4px solid transparent;',
        navOn: 'padding:7px 14px; cursor:pointer; border-left:4px solid var(--xp-red-4); background:var(--xp-white); font-weight:bold;',
        panel: 'flex:1; min-width:0; padding:14px 18px; overflow-y:auto; background:var(--xp-white);',
        status: 'display:flex; gap:18px; padding:5px 12px; background:var(--xp-face-4); ' +
                'border-top:1px solid var(--xp-face-7); font-size:12px;',
        card: 'border:1px solid var(--xp-face-7); background:var(--xp-face-5); padding:9px 11px; margin-bottom:8px;',
        h: 'font-size:15px; font-weight:bold; margin:14px 0 7px; color:var(--xp-red-4);',
        btn: 'padding:3px 10px; margin-left:6px; cursor:pointer;',
    };

    const iconHTML = (i, size) => (window.HypernetOS ? window.HypernetOS.getIconHTML(i, size) : '');

    const App = {
        win: null,
        tab: 'tonight',        // i18n-ignore  tab id
        stakeIndex: 2,
        message: '',

        launch() {
            if (!window.HypernetOS || !window.HypernetOS.WindowManager) return;
            sync();
            this.tab = 'tonight';
            this.message = '';
            const contentHTML = `
                <div style="${S.app}">
                    <div style="${S.header}">
                        <div>${iconHTML(APP_ICON, 32)}</div>
                        <div style="flex:1; min-width:0">
                            <div style="font-size:17px; font-weight:bold; letter-spacing:1px">${esc(t('appName'))}</div>
                            <div style="font-size:12px; opacity:0.85">${esc(t('subtitle'))}</div>
                        </div>
                    </div>
                    <div style="display:flex; flex:1; min-height:0">
                        <div id="wr-nav" style="${S.nav}"></div>
                        <div id="wr-panel" style="${S.panel}"></div>
                    </div>
                    <div style="${S.status}">
                        <span>${esc(t('label.day', { n: tonight() }))}</span>
                        <span>${esc(t('label.banked'))}: <b id="wr-bank"></b></span>
                        <span id="wr-msg" style="margin-left:auto; color:var(--xp-red-4)"></span>
                    </div>
                </div>`;
            this.win = window.HypernetOS.WindowManager.createWindow({
                id: APP_ID, title: t('appName'), icon: APP_ICON,
                width: 900, height: 600, contentHTML
            });
            this.renderNav();
            this.render();
        },

        el(sel) { return this.win ? this.win.querySelector(sel) : null; },

        renderNav() {
            const nav = this.el('#wr-nav');
            if (!nav) return;
            nav.innerHTML = '';
            TABS.forEach((id) => {
                const item = document.createElement('div');
                item.className = 'focusable';
                item.tabIndex = 0;
                item.style.cssText = this.tab === id ? S.navOn : S.navItem;
                item.textContent = t('tab.' + id);
                const go = () => { this.tab = id; this.renderNav(); this.render(); };
                item.addEventListener('click', go);
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
                });
                nav.appendChild(item);
            });
        },

        render() {
            const panel = this.el('#wr-panel');
            if (!panel) return;
            const st0 = sync();
            if (!st0.built) {
                panel.innerHTML = '<div style="' + S.h + '">' + esc(t('appName')) + '</div><p>'
                    + esc(t('deadWorld')) + '</p>';
                return;
            }
            // Reading the desk is following wrestling, and following wrestling
            // is how anybody gets good at it.
            train(1, 'desk', 150);
            sync();
            const bank = this.el('#wr-bank');
            if (bank) bank.textContent = money(state().bank);
            const msg = this.el('#wr-msg');
            if (msg) msg.textContent = this.message;
            const fn = {
                tonight: () => this.tonightHTML(),
                card: () => this.cardHTML(),
                roster: () => this.rosterHTML(),
                angles: () => this.anglesHTML(),
                betting: () => this.bettingHTML(),
                ratings: () => this.ratingsHTML(),
                titles: () => this.titlesHTML(),
            }[this.tab];
            panel.innerHTML = fn ? fn() : '';
            panel.scrollTop = 0;
            this.wire(panel);
        },

        wire(panel) {
            panel.querySelectorAll('[data-bet]').forEach((el) => {
                el.className = 'focusable';
                el.tabIndex = 0;
                const act = () => this.doBet(el.dataset.bet, el.dataset.pick);
                el.addEventListener('click', act);
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
                });
            });
            panel.querySelectorAll('[data-promo]').forEach((el) => {
                el.className = 'focusable';
                el.tabIndex = 0;
                const act = () => this.doPromo(el.dataset.promo);
                el.addEventListener('click', act);
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
                });
            });
            const stake = panel.querySelector('#wr-stake');
            if (stake) stake.addEventListener('change', (e) => { this.stakeIndex = Number(e.target.value) || 0; });
        },

        stakes() { return [MIN_STAKE, 500, 2000, 10000, 50000, 200000]; },

        doBet(ref, pickId) {
            const night = tonight() + 1;
            const market = book(night).find((m) => m.ref === ref);
            if (!market) { this.message = t('bet.closed'); this.render(); return; }
            const res = placeBet(market, pickId, this.stakes()[this.stakeIndex] || MIN_STAKE);
            this.message = res.message;
            this.render();
        },

        // The promo is a bust conversation, and busts belong to the map. The
        // desktop is closed on the way out rather than drawing the stage over
        // a window that is about to go away.
        doPromo(fedId) {
            const steps = promoSteps(fedId, tonight());
            if (!steps.length) return;
            try {
                if (window.HypernetOS && window.HypernetOS.shutdown) window.HypernetOS.shutdown();
                else if (typeof SceneManager !== 'undefined') SceneManager.pop();
            } catch (e) { /* not running under the OS */ }
            setTimeout(() => { playPromo(fedId, tonight()); }, 420);
        },

        fedHead(fedId) {
            return '<div style="' + S.h + '">' + esc(t('fed.' + fedId + '.name'))
                 + ' <span style="font-weight:normal;font-size:12px;color:var(--xp-ink-soft)">'
                 + esc(t('fed.' + fedId + '.show')) + '</span></div>';
        },

        matchRow(st, m, withOdds, market) {
            const wa = st.wrestlers[m.a], wb = st.wrestlers[m.b];
            const tag = (w) => w.mundane
                ? '<span style="font-size:11px;border:1px solid var(--xp-silver-3);background:var(--xp-face-4);border-radius:8px;padding:0 5px;margin-left:4px">'
                  + esc(t('mundane.tag')) + '</span>' : '';
            let html = '<div style="' + S.card + '">';
            html += '<div style="font-weight:bold">' + esc(wa.name) + tag(wa) + ' &nbsp;vs&nbsp; ' + esc(wb.name) + tag(wb)
                 + (m.mainEvent ? ' <span style="color:var(--xp-red-4)">[' + esc(t('label.mainEvent')) + ']</span>' : '') + '</div>';
            html += '<div style="font-size:12px;color:var(--xp-ink-soft)">' + esc(m.stip) + '</div>';
            if (m.titleSlot) {
                html += '<div style="font-size:12px;color:var(--xp-ink-3)">' + esc(t(st.feds[m.fed].titles[m.titleSlot].key)) + '</div>';
            }
            if (m.result) {
                html += '<div style="margin-top:4px">' + esc(m.result.text) + '</div>';
                if (m.result.titleChange) html += '<div style="color:var(--xp-red-4);font-weight:bold">' + esc(m.result.titleChange) + '</div>';
            }
            if (withOdds && market) {
                html += '<div style="margin-top:6px">';
                market.picks.forEach((p) => {
                    html += '<span data-bet="' + esc(market.ref) + '" data-pick="' + esc(p.id) + '" style="' + S.btn
                         + 'display:inline-block;border:1px solid var(--xp-face-7);background:var(--xp-face-4)">'
                         + esc(p.label) + ' &nbsp;' + p.odds.toFixed(2) + '</span>';
                });
                html += '</div>';
            }
            return html + '</div>';
        },

        tonightHTML() {
            const st = sync();
            const n = tonight();
            let html = '<p>' + esc(t('label.airtime', { hour: SHOW_HOUR + ':00' })) + '</p>';
            html += '<p style="color:var(--xp-red-4)"><b>' + esc(t('oneDivision')) + '</b></p>';
            // What this world's two rules did to the league, said once, where
            // the player can see why the card looks the way it looks.
            const rule = rules();
            [rule.magic, rule.population].forEach((axis) => {
                if (T.has && T.has('Wrestling.world.' + axis)) {
                    html += '<div style="' + S.card + 'border-left:4px solid var(--xp-red-4)">'
                         + esc(t('world.' + axis)) + '</div>';
                }
            });
            const r = st.ratings[n];
            if (r) {
                html += '<div style="' + S.card + '">' + esc(r.winner
                    ? t('ratings.headline.win', {
                        fed: t('fed.' + r.winner + '.short'),
                        viewers: num(r[r.winner]),
                        rival: num(r[r.winner === 'slam' ? 'circle' : 'slam'])
                      })
                    : t('ratings.headline.tie', { viewers: num(r.slam) }))
                    + '<div style="font-size:12px;color:var(--xp-ink-soft)">' + esc(r.reason) + '</div></div>';
            }
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                const card = st.cards[cardKey(fedId, n)];
                if (!card) { html += '<p>' + esc(t('label.noCard')) + '</p>'; return; }
                card.matches.forEach((m) => { html += this.matchRow(st, m, false, null); });
                html += '<div><span data-promo="' + fedId + '" style="' + S.btn
                     + 'display:inline-block;border:1px solid var(--xp-face-7);background:var(--xp-face-4)">'
                     + esc(t('label.watchPromo')) + '</span></div>';
            });
            return html;
        },

        cardHTML() {
            const st = sync();
            const n = tonight() + 1;
            let html = '<div style="' + S.h + '">' + esc(t('label.tomorrow')) + '</div>';
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                const card = st.cards[cardKey(fedId, n)];
                if (!card) { html += '<p>' + esc(t('label.noCard')) + '</p>'; return; }
                card.matches.forEach((m) => { html += this.matchRow(st, m, false, null); });
            });
            return html;
        },

        rosterHTML() {
            const st = sync();
            let html = '';
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                html += '<div style="font-size:12px;color:var(--xp-ink-soft);margin-bottom:8px">' + esc(t('fed.' + fedId + '.ethos')) + '</div>';
                st.feds[fedId].roster
                    .map((id) => st.wrestlers[id])
                    .sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
                    .forEach((w) => {
                        html += '<div style="' + S.card + '"><b>' + esc(w.name) + '</b>'
                             + (w.mundane ? ' <span style="font-size:11px;border:1px solid var(--xp-silver-3);background:var(--xp-face-4);border-radius:8px;padding:0 5px">'
                                + esc(t('mundane.tag')) + '</span>' : '')
                             + '<div style="font-size:12px;color:var(--xp-ink-soft)">' + esc(w.legal) + ' &middot; '
                             + esc(t('style.' + w.style)) + ' &middot; ' + esc(t('alignment.' + w.alignment))
                             + ' &middot; ' + esc(t('condition.' + w.condition)) + '</div>'
                             + '<div style="font-size:12px">' + esc(t('label.record')) + ': ' + w.wins + '-' + w.losses + '-' + w.draws
                             + ' &middot; ' + esc(t('label.momentum')) + ': ' + (w.momentum > 0 ? '+' : '') + w.momentum
                             + ' &middot; ' + esc(t('label.arcana')) + ': ' + (w.mundane ? esc(t('label.noMagic')) : w.arcana) + '</div>'
                             + '<div style="font-size:12px;color:var(--xp-ink-soft)">' + esc(t('label.finisher')) + ': ' + esc(w.finisher) + '</div>'
                             + '</div>';
                    });
            });
            return html;
        },

        anglesHTML() {
            const st = sync();
            let html = '';
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                st.feds[fedId].angles.forEach((a) => {
                    html += '<div style="' + S.card + '"><b>' + esc(angleName(st, a)) + '</b>'
                         + ' <span style="font-size:12px;color:var(--xp-red-4)">' + esc(t('label.heat')) + ' ' + a.heat + '</span><ul style="margin:6px 0 0 18px">';
                    a.beats.slice(0, 4).forEach((bt) => {
                        html += '<li style="font-size:13px">' + esc(bt.text) + '</li>';
                    });
                    html += '</ul></div>';
                });
            });
            return html;
        },

        bettingHTML() {
            const st = sync();
            const n = tonight() + 1;
            const markets = book(n);
            let html = '<div style="' + S.h + '">' + esc(t('bet.title')) + '</div>';
            html += '<div style="margin-bottom:10px">' + esc(t('label.stake')) + ': <select id="wr-stake">';
            this.stakes().forEach((s, i) => {
                html += '<option value="' + i + '"' + (i === this.stakeIndex ? ' selected' : '') + '>' + esc(money(s)) + '</option>';
            });
            html += '</select></div>';
            if (!markets.length) return html + '<p>' + esc(t('bet.closed')) + '</p>';

            markets.filter((m) => m.market !== 'match').forEach((m) => {
                html += '<div style="' + S.card + '"><b>' + esc(m.label) + '</b><div style="margin-top:6px">';
                m.picks.forEach((p) => {
                    html += '<span data-bet="' + esc(m.ref) + '" data-pick="' + esc(p.id) + '" style="' + S.btn
                         + 'display:inline-block;border:1px solid var(--xp-face-7);background:var(--xp-face-4)">'
                         + esc(p.label) + ' &nbsp;' + p.odds.toFixed(2) + '</span>';
                });
                html += '</div></div>';
            });
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                markets.filter((m) => m.market === 'match' && m.fed === fedId).forEach((m) => {
                    const match = findMatch(st, n, m.ref);
                    if (match) html += this.matchRow(st, match, true, m);
                });
            });

            const open = st.bets.filter((b) => !b.settled);
            html += '<div style="' + S.h + '">' + esc(t('label.openBets')) + '</div>';
            if (!open.length) html += '<p>' + esc(t('label.noBets')) + '</p>';
            open.forEach((b) => {
                html += '<div style="' + S.card + '">' + esc(t('bet.placed', {
                    stake: money(b.stake), pick: b.label, odds: b.odds.toFixed(2)
                })) + '</div>';
            });
            const done = st.bets.filter((b) => b.settled).slice(-8).reverse();
            if (done.length) {
                html += '<div style="' + S.h + '">' + esc(t('label.settled')) + '</div>';
                done.forEach((b) => {
                    html += '<div style="' + S.card + '">' + esc(b.won
                        ? t('bet.won', { amount: money(b.payout), pick: b.label, odds: b.odds.toFixed(2) })
                        : t('bet.lost', { amount: money(b.stake), pick: b.label })) + '</div>';
                });
            }
            return html;
        },

        ratingsHTML() {
            const st = sync();
            let html = '<div style="' + S.h + '">' + esc(t('tab.ratings')) + '</div>';
            html += '<p>' + esc(t('label.airtime', { hour: SHOW_HOUR + ':00' })) + '</p>';
            const runs = window.WrestlingLeague.ratingsRun(14);
            if (!runs.length) return html + '<p>' + esc(t('label.noCard')) + '</p>';
            const peak = Math.max.apply(null, runs.map((r) => Math.max(r.slam, r.circle)));
            html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
            html += '<tr><th style="text-align:left">' + esc(t('label.day', { n: '' })).trim() + '</th>'
                 + '<th style="text-align:right">' + esc(t('fed.slam.short')) + '</th>'
                 + '<th style="text-align:right">' + esc(t('fed.circle.short')) + '</th>'
                 + '<th style="text-align:left;padding-left:12px">' + esc(t('label.share')) + '</th></tr>';
            runs.forEach((r) => {
                const wSlam = Math.round((r.slam / peak) * 90);
                const wCircle = Math.round((r.circle / peak) * 90);
                html += '<tr><td>' + r.night + '</td>'
                     + '<td style="text-align:right' + (r.winner === 'slam' ? ';font-weight:bold' : '') + '">' + num(r.slam) + '</td>'
                     + '<td style="text-align:right' + (r.winner === 'circle' ? ';font-weight:bold' : '') + '">' + num(r.circle) + '</td>'
                     + '<td style="padding-left:12px">'
                     + '<span style="display:inline-block;height:9px;width:' + wSlam + 'px;background:var(--xp-red-4)"></span>'
                     + '<span style="display:inline-block;height:9px;width:' + wCircle + 'px;background:var(--xp-navy-3)"></span>'
                     + '</td></tr>';
            });
            html += '</table>';
            html += '<p style="font-size:12px;color:var(--xp-ink-soft);margin-top:8px">'
                 + '<span style="color:var(--xp-red-4)">&#9632;</span> ' + esc(t('fed.slam.short'))
                 + ' &nbsp; <span style="color:var(--xp-navy-3)">&#9632;</span> ' + esc(t('fed.circle.short')) + '</p>';
            return html;
        },

        titlesHTML() {
            const st = sync();
            let html = '';
            FEDS.forEach((fedId) => {
                html += this.fedHead(fedId);
                window.WrestlingLeague.titles(fedId).forEach((belt) => {
                    html += '<div style="' + S.card + '"><b>' + esc(belt.name) + '</b><div>'
                         + esc(belt.holder ? belt.holder.name : t('label.vacant'))
                         + (belt.holder ? ' &middot; ' + esc(t('label.reign', { n: Math.max(0, st.lastNight - belt.since) })) : '')
                         + '</div></div>';
                });
            });
            return html;
        },
    };

    window.SlamgrimorieApp = App;

    if (window.HypernetOS) {
        window.HypernetOS.registerApp({
            id: APP_ID,
            name: t('appName'),
            icon: APP_ICON,
            launchFn: () => App.launch(),
            desktopShortcut: true,       // a default desktop app, both federations
            category: 'internet',        // i18n-ignore  category id
        });
    }

    // The wiki gateway registers as soon as the browser is up. It loads after
    // this file in some orders and before it in others, so both are covered.
    registerWiki();
    if (!window.HypernetSites || !window.HypernetSites.registerLive) {
        setTimeout(registerWiki, 0);
    }

    PluginManager.registerCommand('MonsterTournament', 'OpenSlamgrimorie', () => {
        if (typeof Scene_HypernetOS === 'undefined') return;
        SceneManager.push(Scene_HypernetOS);
        SceneManager.prepareNextScene({ autoLaunch: APP_ID });
    });

    PluginManager.registerCommand('MonsterTournament', 'PlayWrestlingPromo', (args) => {
        const fed = (args && args.federation) ? String(args.federation) : 'slam';
        playPromo(FEDS.indexOf(fed) >= 0 ? fed : 'slam');
    });
})();
