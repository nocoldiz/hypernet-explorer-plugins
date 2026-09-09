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
