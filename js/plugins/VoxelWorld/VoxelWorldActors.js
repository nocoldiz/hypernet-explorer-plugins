//=============================================================================
// VoxelWorldActors.js
// VoxelWorld: first person controller and the fallback camper model
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - first person controller and the fallback camper model
 * @author Omni-Lex
 *
 * @help
 * first person controller and the fallback camper model.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldActors.js'); return; }

    const {
        FLY_CLIMB, FLY_DRAG, FLY_SPEED, FLY_SPRINT_MULT,
        FOOT_BODY_R, FOOT_CABIN_WALK, FOOT_CROUCH_MULT, FOOT_EYE, FOOT_EYE_CROUCH,
        FOOT_GRAVITY, FOOT_JUMP_VEL, FOOT_SPRINT_MULT, FOOT_VAN_HALF_LEN, gravityScale,
        PAD_LOOK_X, PAD_LOOK_Y,
        FOOT_VAN_RADIUS, FOOT_WALK, JUMP_DEBOUNCE_MS, JUMP_DOUBLE_MS,
        SWIM_BUOYANCY, SWIM_DEPTH, SWIM_DRAG, SWIM_ENTRY_SPLASH, SWIM_FLOAT,
        SWIM_RISE, SWIM_SINK, SWIM_SPEED, SWIM_SPRINT_MULT,
        WALL_RUN_CLIMB, WALL_RUN_TIME, WALL_STICK_R
    } = VW;

    // Wall-clock, for the double tap on jump. performance.now where it exists
    // (it is monotonic and does not jump when the system clock is set).
    const nowMs = () => (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();


    // =========================================================================
    // FirstPersonController (Inside Camper)
    // =========================================================================
    class FirstPersonController {
        constructor(camera, bounds) {
            this.camera = camera;
            this.bounds = bounds;
            this.camera.position.set(0, 0, 0);
            this.camera.rotation.set(0, 0, 0);
            this.yaw   = new THREE.Group();
            this.pitch = new THREE.Group();
            this.yaw.position.set(0, 6, 0);    // standing eye height inside the cabin
            // Camera looks down its own -Z; rotate the rig so first person faces
            // the camper's forward (+Z) through the windshield by default.
            this.yaw.rotation.y = Math.PI;
            this.yaw.add(this.pitch);
            this.pitch.add(this.camera);

            this.move     = { forward: false, backward: false, left: false, right: false,
                              sprint: false, jump: false };
            this.velocity = new THREE.Vector3();
            this.direction = new THREE.Vector3();
            this.isLocked = false;
            this.deactivated = false;
            // Seated at the wheel (first-person driving): mouse-look only, the
            // movement keys drive the camper rather than walking the cabin.
            this.drivingSeat = false;

            // Local co-op support. allowPointerLock lets the scene hand the mouse
            // to a single controller (Player 2) while the driver (Player 1) steers
            // with the keyboard / gamepad. inputSource, when set, overrides the
            // default WASD + arrow reads so a second rig can be fed Player 2 input.
            this.allowPointerLock = true;
            this.inputSource = null;   // () => {forward,back,left,right,sprint}

            // On-foot world mode: detached from the camper, free to roam with no
            // distance limit, with terrain following, sprint and jump.
            this.worldMode = false;
            this.anchor    = { x: 0, z: 0 };   // parked camper position (solid-body centre)
            this.getGroundY = null;            // (worldX, worldZ, feetY) => the ground / floor Y
            this.getCeilY   = null;            // (worldX, worldZ, feetY) => the floor above, or null
            this.vy        = 0;                // vertical velocity (jump / gravity)
            this.onGround  = true;
            this._jumpQueued = false;
            this.crouching = false;            // Ctrl: lower, slower, quieter
            this.eyeH      = FOOT_EYE;
            this.wallContact = 0;              // seconds left of "a wall is right there"
            this.wallJumps = 0;                // kicks taken since last touching ground (uncapped)
            this.wallRunning = false;          // sprinting up / along a wall right now
            this.wallRunLeft = WALL_RUN_TIME;  // seconds of wall run left in this stretch
            this.bobT      = 0;                // stride phase, drives head bob + footsteps
            this.landDip   = 0;                // knees bending on a landing, decays
            this.solidAt   = null;             // (x,z,r) => {x,z} pushed out of any building
            this.voxelSolid = null;            // (vx,vy,vz) => is that cube solid
            this.voxelSize  = 0;               // world units to a cube side
            this.onStep    = null;             // called once per stride
            this.onJump    = null;             // called on a jump / wall kick
            this.onLand    = null;             // called on touchdown, 0..1 hardness

            // Water and flight. getWaterY answers with the surface of whatever
            // water stands over a spot (null where the ground there is dry) and
            // canFly with whether the party leader knows how; both are handed in
            // by the scene, and without them nobody swims and nobody flies.
            this.getWaterY  = null;            // (worldX, worldZ) => water surface Y, or null
            this.canFly     = null;            // () => the leader knows the Fly skill
            this.swimming   = false;           // treading water, head out
            this.submerged  = false;           // under the surface
            this.flying     = false;           // off the ground under their own power
            this.onSwim     = null;            // called on entering / leaving the water
            this.onFly      = null;            // called on taking off / landing
            this._jumpPressAt = -1e9;          // last jump press, for the double tap

            this._onMouseMove        = this._onMouseMove.bind(this);
            this._onClick            = this._onClick.bind(this);
            this._onKeyDown          = this._onKeyDown.bind(this);
            this._onKeyUp            = this._onKeyUp.bind(this);
            this._onPointerLockChange = this._onPointerLockChange.bind(this);
            this._initEvents();
        }

        _initEvents() {
            document.addEventListener('mousemove',        this._onMouseMove);
            document.addEventListener('click',            this._onClick);
            document.addEventListener('keydown',          this._onKeyDown);
            document.addEventListener('keyup',            this._onKeyUp);
            document.addEventListener('pointerlockchange', this._onPointerLockChange);
        }

        _onMouseMove(e) {
            if (!this.isLocked) return;
            const mx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            const my = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
            this.yaw.rotation.y   -= mx * 0.002;
            this.pitch.rotation.x -= my * 0.002;
            this.pitch.rotation.x  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch.rotation.x));
        }

        _onClick() {
            if (!this.allowPointerLock) return;
            // A choice list, a line of dialogue, a fight or the main menu is up
            // over the scene: that click is aimed at the window, not at the
            // world, and grabbing the mouse back would take the cursor away
            // from it.
            if (VoxelWorldSystem.isPaused()) return;
            if (VoxelWorldSystem.isActive() && !this.isLocked) {
                document.body.requestPointerLock();
            }
        }

        _onPointerLockChange() {
            this.isLocked = document.pointerLockElement === document.body;
        }

        _onKeyDown(e) {
            if (!VoxelWorldSystem.isActive() || VoxelWorldSystem.isBattleView()) return;
            // A menu is up over the world: that key is being typed at the menu.
            if (VoxelWorldSystem.isPaused()) return;
            switch (e.code) {
                case 'KeyW': this.move.forward   = true; break;
                case 'KeyA': this.move.left      = true; break;
                case 'KeyS': this.move.backward  = true; break;
                case 'KeyD': this.move.right     = true; break;
                case 'ShiftLeft': case 'ShiftRight': this.move.sprint = true; break;
                case 'ControlLeft': case 'ControlRight': case 'KeyC':
                    if (this.worldMode) this.crouching = true; break;
                case 'Space':
                    if (this.worldMode) { this.move.jump = true; this.requestJump(); e.preventDefault(); }
                    break;
            }
        }

        _onKeyUp(e) {
            if (!VoxelWorldSystem.isActive()) return;
            // A key held when the menu opened has to be seen to come up, or the
            // walker jogs on the moment it closes.
            if (VoxelWorldSystem.isPaused()) { this.clearMove(); return; }
            switch (e.code) {
                case 'KeyW': this.move.forward   = false; break;
                case 'KeyA': this.move.left      = false; break;
                case 'KeyS': this.move.backward  = false; break;
                case 'KeyD': this.move.right     = false; break;
                case 'ShiftLeft': case 'ShiftRight': this.move.sprint = false; break;
                case 'ControlLeft': case 'ControlRight': case 'KeyC':
                    this.crouching = false; break;
                case 'Space': this.move.jump = false; break;
            }
        }

        // Enter / leave on-foot world mode. anchor is the parked camper position
        // (with its heading angle, for the solid-body capsule); groundFn maps
        // world (x,z) to terrain height. Caller handles reparenting the rig
        // between the camper group and the scene.
        setWorldMode(on, anchor, groundFn) {
            this.worldMode = !!on;
            this.vy = 0;
            this.onGround = true;
            this.swimming = false;
            this.submerged = false;
            this.flying = false;
            if (on) {
                // A free walk has no camper standing anywhere, so a null anchor
                // means there is no solid body to be pushed out of.
                this.anchor = anchor ? { x: anchor.x, z: anchor.z } : null;
                this.anchorAngle = (anchor && anchor.angle) || 0;
                this.getGroundY = groundFn || null;
            }
        }

        // A jump asked for. Two taps in quick succession is the ask to take off,
        // for whoever leads a party that has somebody in it who can (canFly);
        // two more puts them back down. The key and the pad both report the same
        // press, sometimes a frame apart, so anything inside JUMP_DEBOUNCE_MS of
        // the last one is that same press coming round again rather than a
        // second tap.
        requestJump() {
            if (!this.worldMode) return;
            const t = nowMs();
            const since = t - this._jumpPressAt;
            if (since < JUMP_DEBOUNCE_MS) return;
            this._jumpPressAt = t;
            if (since < JUMP_DOUBLE_MS && !this.swimming &&
                this.canFly && this.canFly()) {
                this.flying = !this.flying;
                this._jumpQueued = false;
                this.vy = this.flying ? FLY_CLIMB * 0.5 : 0;
                if (this.onFly) this.onFly(this.flying);
                return;
            }
            this._jumpQueued = true;
        }

        // Drop every held direction. Called whenever the world stops listening
        // to the keyboard (a fight opens, a fight ends): without it a key that
        // was down when the scene handed the keys over is still down when it
        // takes them back, and the party walks off on its own.
        clearMove() {
            this.move.forward = this.move.backward = false;
            this.move.left = this.move.right = false;
            this.move.sprint = false;
            this.move.jump = false;
            this.crouching = false;
            this._jumpQueued = false;
            this._jumpPressAt = -1e9;
            this.velocity.set(0, 0, 0);
        }

        // Toggle the seated driving pose. While seated the rig stays put (the eye
        // is parked at the driver's seat) and mouse / right-stick look still work.
        setDriving(on) { this.drivingSeat = !!on; }

        update(delta) {
            if (this.deactivated) return;
            if (this.drivingSeat) return;   // seated at the wheel: look only
            // Merge raw WASD (key events above) with arrow keys / d-pad via the
            // Input API, so movement works on keyboard and controller alike.
            // UP and DOWN ON THE PAD'S CROSS are the exception: on foot they
            // run along the quick bar (VoxelWorldScene#_updateBarInput), so they
            // are taken back off the walk. The stick is untouched, and so are the arrow keys: core
            // folds all three into the same Input actions, and only the raw
            // button tells them apart.
            const pads = window.AnalogStickInput;
            const dpadY = !!(pads && pads.hasPad && pads.hasPad() && VW.CamperWeapon._visible &&
                (pads.isButtonPressed(pads.BUTTON.DPAD_UP) ||
                 pads.isButtonPressed(pads.BUTTON.DPAD_DOWN)));
            // A SECOND PLAYER'S rig reads nothing off the keyboard or the
            // shared gamepad at all: both of those are Player 1's, and a rig
            // that listened to them would walk two people with one hand. It is
            // handed its own input instead - which includes turning, since
            // there is only one mouse in the room and Player 1 has it.
            let fwd, back, left, right, sprint;
            if (this.inputSource) {
                const src = this.inputSource() || {};
                fwd = !!src.forward; back = !!src.backward;
                left = !!src.left;   right = !!src.right;
                sprint = !!src.sprint;
                this.crouching = !!src.crouch;
                if (src.jump && !this._srcJumpHeld) this.requestJump();
                this._srcJumpHeld = !!src.jump;
                if (src.turnX) this.yaw.rotation.y -= src.turnX * PAD_LOOK_X * delta;
                if (src.turnY) {
                    this.pitch.rotation.x = Math.max(-1.2, Math.min(1.2,
                        this.pitch.rotation.x - src.turnY * PAD_LOOK_Y * delta));
                }
            } else {
                fwd   = this.move.forward  || (Input.isPressed('up') && !dpadY);
                back  = this.move.backward || (Input.isPressed('down') && !dpadY);
                left  = this.move.left     || Input.isPressed('left');
                right = this.move.right    || Input.isPressed('right');
                sprint = this.move.sprint || Input.isPressed('shift');
            }

            this.direction.z = Number(fwd)   - Number(back);
            this.direction.x = Number(right) - Number(left);
            if (this.direction.lengthSq() > 0) this.direction.normalize();

            if (this.worldMode) {
                this._updateOnFoot(delta, sprint);
            } else {
                this._updateInCabin(delta);
            }
        }

        _updateInCabin(delta) {
            // Eased direct-velocity walk around the cabin, clamped to the interior
            // box. (The old scheme accelerated by speed*delta and then integrated
            // by delta again, which crawled at a fraction of the intended speed
            // and was frame-rate dependent.)
            const k = Math.min(1, delta * 10);
            this.velocity.x += (this.direction.x * FOOT_CABIN_WALK - this.velocity.x) * k;
            this.velocity.z += (this.direction.z * FOOT_CABIN_WALK - this.velocity.z) * k;
            this.yaw.translateX(this.velocity.x * delta);
            this.yaw.translateZ(-this.velocity.z * delta);
            this.yaw.position.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.yaw.position.x));
            this.yaw.position.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, this.yaw.position.z));
            this.yaw.position.y = 6;
        }

        // Out in the world on your own two feet. Which of the three ways of
        // getting about is running depends on what is underneath: dry ground is
        // a walk, water over your head is a swim, and nothing at all under you
        // is flight, for whoever leads a party that knows how.
        _updateOnFoot(delta, sprint) {
            const p = this.yaw.position;
            const feet = p.y - this.eyeH;
            const groundY = this.getGroundY ? this.getGroundY(p.x, p.z, feet) : 0;
            // Water only counts once the bottom has dropped away from under you:
            // anything shallower than that is waded through on foot.
            const waterY = this.getWaterY ? this.getWaterY(p.x, p.z) : null;
            const overHead = waterY != null && (waterY - groundY) > SWIM_DEPTH;

            if (overHead && feet < waterY) {
                if (!this.swimming) this._enterWater();
                this._updateSwim(delta, sprint, waterY, groundY);
                return;
            }
            if (this.swimming) this._leaveWater();
            if (this.flying) { this._updateFly(delta, sprint, groundY); return; }
            this._updateWalk(delta, sprint);
        }

        // Push the walker out of everything solid they have moved into: the
        // parked camper's own chassis, and the buildings the scene answers for.
        // Shared by the walk, the swim and the flight - a wall is a wall
        // whichever of them you meet it in.
        _pushOutOfSolids(delta) {
            // Solid camper: push the walker out of a capsule around the parked
            // chassis so it can be circled but never walked through. Skipped on a
            // free walk, where no camper was ever parked (anchor is null).
            if (this.anchor) {
                const fx = Math.sin(this.anchorAngle || 0), fz = Math.cos(this.anchorAngle || 0);
                const px = this.yaw.position.x - this.anchor.x;
                const pz = this.yaw.position.z - this.anchor.z;
                const along = Math.max(-FOOT_VAN_HALF_LEN, Math.min(FOOT_VAN_HALF_LEN, px * fx + pz * fz));
                const ccx = this.anchor.x + fx * along;
                const ccz = this.anchor.z + fz * along;
                const ox = this.yaw.position.x - ccx;
                const oz = this.yaw.position.z - ccz;
                const od = Math.hypot(ox, oz);
                if (od < FOOT_VAN_RADIUS) {
                    const f = FOOT_VAN_RADIUS / (od || 1);
                    this.yaw.position.x = ccx + ox * f;
                    this.yaw.position.z = ccz + oz * f;
                }
            }

            // Walls: a building is a wall, and you stop at it. The scene answers
            // where the nearest solid pushes you back to (see _resolveSolids);
            // being pushed is also what counts as touching a wall, which is what
            // a wall jump needs to know.
            this.wallContact = Math.max(0, (this.wallContact || 0) - delta);
            this.wallNormalX = this.wallNormalX || 0;
            this.wallNormalZ = this.wallNormalZ || 0;
            this._pushOutOfVoxels();
            if (this.solidAt) {
                const fix = this.solidAt(this.yaw.position.x, this.yaw.position.z, FOOT_BODY_R);
                if (fix) {
                    const ddx = fix.x - this.yaw.position.x;
                    const ddz = fix.z - this.yaw.position.z;
                    if (ddx * ddx + ddz * ddz > 0.0004) {
                        const d = Math.hypot(ddx, ddz);
                        this.wallNormalX = ddx / d;
                        this.wallNormalZ = ddz / d;
                        this.wallContact = 0.22;
                    }
                    this.yaw.position.x = fix.x;
                    this.yaw.position.z = fix.z;
                }
                // Being pushed is the surest sign of a wall, but not the only
                // one: running along a face rather than into it never pushes,
                // and neither does hugging one you are already flush with. A
                // slim reach past the body counts as being on the wall too,
                // which is what keeps a wall run - and a chain of kicks - alive
                // once you stop shoving yourself into the bricks.
                if (this.wallContact <= 0) {
                    const near = this.solidAt(this.yaw.position.x, this.yaw.position.z,
                        FOOT_BODY_R + WALL_STICK_R);
                    if (near) {
                        const ndx = near.x - this.yaw.position.x;
                        const ndz = near.z - this.yaw.position.z;
                        const nd = Math.hypot(ndx, ndz);
                        if (nd > 0.0001) {
                            this.wallNormalX = ndx / nd;
                            this.wallNormalZ = ndz / nd;
                            this.wallContact = 0.12;
                        }
                    }
                }
            }
        }

        // The cubes themselves are walls too. The ground answers for what is
        // UNDER the feet and nothing else, so without this a wall of blocks is
        // walked straight into and the walker ends up standing inside it. The
        // body is a column one cube-and-a-bit above the feet - the first cube
        // off the floor is a step, walked up, and only what stands over that
        // stops anybody.
        //
        // Somebody already embedded - dropped into the rock, a cube placed on
        // top of them, the noclip they were holding let go of inside a wall -
        // is left alone rather than shoved: at that point every direction is a
        // wall and the push would only rattle them between two faces.
        _pushOutOfVoxels() {
            const solid = this.voxelSolid;
            const S = this.voxelSize;
            if (!solid || !S) return;
            const p = this.yaw.position;
            const feet = p.y - this.eyeH;
            const yLo = feet + S * 1.05;          // above the step a walker takes
            const yHi = feet + this.eyeH * 0.95;  // up to the eye
            const vy0 = Math.floor(yLo / S), vy1 = Math.floor(yHi / S);
            const r = FOOT_BODY_R * 0.8;
            const blocked = (vx, vz) => {
                for (let vy = vy0; vy <= vy1; vy++) if (solid(vx, vy, vz)) return true;
                return false;
            };
            // Standing in it already: nothing to push out of, only out of the way.
            if (blocked(Math.floor(p.x / S), Math.floor(p.z / S))) return;

            for (let pass = 0; pass < 3; pass++) {
                let bestPen = 0, bestX = 0, bestZ = 0, bestSide = 0;
                const vx0 = Math.floor((p.x - r) / S), vx1 = Math.floor((p.x + r) / S);
                const vz0 = Math.floor((p.z - r) / S), vz1 = Math.floor((p.z + r) / S);
                for (let vx = vx0; vx <= vx1; vx++) {
                    for (let vz = vz0; vz <= vz1; vz++) {
                        if (!blocked(vx, vz)) continue;
                        const cx = (vx + 0.5) * S, cz = (vz + 0.5) * S;
                        const hw = S * 0.5 + r;
                        const dx = p.x - cx, dz = p.z - cz;
                        if (Math.abs(dx) >= hw || Math.abs(dz) >= hw) continue;
                        const px = hw - Math.abs(dx), pz = hw - Math.abs(dz);
                        const pen = Math.min(px, pz);
                        if (pen > bestPen) {
                            bestPen = pen; bestX = cx; bestZ = cz;
                            bestSide = px < pz ? (dx < 0 ? -1 : 1) : (dz < 0 ? -2 : 2);
                        }
                    }
                }
                if (!bestPen) break;
                const hw = S * 0.5 + r;
                if (bestSide === -1 || bestSide === 1) {
                    p.x = bestX + bestSide * hw;
                    this.wallNormalX = bestSide; this.wallNormalZ = 0;
                } else {
                    p.z = bestZ + (bestSide > 0 ? hw : -hw);
                    this.wallNormalX = 0; this.wallNormalZ = bestSide > 0 ? 1 : -1;
                }
                this.wallContact = 0.22;
            }
        }

        // Jump / OK held down, from the key or from the pad. The edge of that
        // press is a jump (and two of them are a take-off); holding it is what
        // climbs, in the water and in the air alike.
        _liftHeld() {
            if (this.move.jump) return true;
            return typeof Input !== 'undefined' && Input.isPressed('ok');
        }

        // ---------------------------------------------------------------------
        // Swimming
        //
        // Wade out until the bottom drops away and the walk becomes a swim: on
        // the surface the swimmer floats with their head out and strokes flat,
        // and under it they go wherever they are looking, so a dive is nothing
        // more than looking down and swimming on. Jump kicks for the surface,
        // crouch duck-dives, and left alone the water carries them back up.
        // ---------------------------------------------------------------------
        _enterWater() {
            this.swimming = true;
            this.flying   = false;
            this.onGround = false;
            this.wallJumps = 0;
            this.wallRunning = false;
            this.wallRunLeft = WALL_RUN_TIME;
            this._jumpQueued = false;
            const fall = Math.max(0, -this.vy);
            this.vy = 0;
            if (this.onSwim) this.onSwim(true, fall >= SWIM_ENTRY_SPLASH);
        }

        _leaveWater() {
            this.swimming  = false;
            this.submerged = false;
            this.vy = 0;
            if (this.onSwim) this.onSwim(false, false);
        }

        _updateSwim(delta, sprint, waterY, groundY) {
            const p = this.yaw.position;
            // Nobody crouches in water: the eye comes back to standing height
            // and stays there, and the stride (and its footsteps) stops.
            this.eyeH += (FOOT_EYE - this.eyeH) * Math.min(1, delta * 12);
            this.submerged = p.y < waterY;

            const spd = SWIM_SPEED * (sprint ? SWIM_SPRINT_MULT : 1);
            // Pitch drives underwater 3D swim angle, and duck-diving from the surface
            const pitch = this.pitch.rotation.x;
            const cp = Math.cos(pitch);
            const k  = Math.min(1, delta * SWIM_DRAG);
            this.velocity.x += (this.direction.x * spd - this.velocity.x) * k;
            this.velocity.z += (this.direction.z * spd * cp - this.velocity.z) * k;
            this.yaw.translateX(this.velocity.x * delta);
            this.yaw.translateZ(-this.velocity.z * delta);
            this._pushOutOfSolids(delta);

            const sink = !!this.crouching;
            const divingDown = (pitch < -0.1 && this.direction.z > 0) || sink;
            let vy = Math.sin(pitch) * this.direction.z * spd;
            if (this._liftHeld()) vy += SWIM_RISE;
            if (sink) vy -= SWIM_SINK;
            // Buoyancy. Brisk right at the surface, so a swimmer settles onto
            // the water line instead of bobbing through it, and a steady drift
            // upward from any real depth, so being dropped in deep is never a
            // trap. Weak enough at either that a deliberate dive still goes
            // down, and reversed above the line: what comes up must come back.
            if (!sink && !divingDown) {
                const d = (waterY + SWIM_FLOAT) - p.y;
                if (d > 0) {
                    const settle = d * SWIM_BUOYANCY * Math.exp(-d / 12);
                    const drift  = SWIM_RISE * 0.34 * Math.min(1, d / 6);
                    vy += Math.min(SWIM_RISE, Math.max(settle, drift));
                } else {
                    vy += Math.max(-SWIM_RISE, d * SWIM_BUOYANCY);
                }
            } else if (p.y > waterY && divingDown) {
                vy -= SWIM_SINK * 0.5;
            }
            this.vy = vy;
            p.y += vy * delta;

            // The bottom is still the bottom, and a roof over the water is
            // still a roof.
            if (this.getCeilY) {
                const ceil = this.getCeilY(p.x, p.z, p.y - this.eyeH);
                if (ceil != null && p.y > ceil - 0.6) { p.y = ceil - 0.6; this.vy = 0; }
            }
            const floor = groundY + this.eyeH;
            if (p.y < floor) { p.y = floor; this.vy = 0; }

            this._jumpQueued = false;
            this.submerged = p.y < waterY;
            this._updateHeadBob(delta, false, false);
        }

        // ---------------------------------------------------------------------
        // Flight
        //
        // Two taps on jump takes the party off the ground (see requestJump), for
        // as long as whoever leads it knows the Fly skill. In the air they go
        // where they are looking, jump climbs, crouch descends, and setting back
        // down on the ground ends it.
        // ---------------------------------------------------------------------
        _updateFly(delta, sprint, groundY) {
            const p = this.yaw.position;
            this.eyeH += (FOOT_EYE - this.eyeH) * Math.min(1, delta * 12);
            const spd = FLY_SPEED * (sprint ? FLY_SPRINT_MULT : 1);
            const pitch = this.pitch.rotation.x;
            const cp = Math.cos(pitch);
            const k  = Math.min(1, delta * FLY_DRAG);
            this.velocity.x += (this.direction.x * spd - this.velocity.x) * k;
            this.velocity.z += (this.direction.z * spd * cp - this.velocity.z) * k;
            this.yaw.translateX(this.velocity.x * delta);
            this.yaw.translateZ(-this.velocity.z * delta);
            this._pushOutOfSolids(delta);

            let vy = Math.sin(pitch) * this.direction.z * spd;
            if (this._liftHeld()) vy += FLY_CLIMB;
            if (this.crouching)   vy -= FLY_CLIMB;
            this.vy = vy;
            p.y += vy * delta;

            if (this.getCeilY) {
                const ceil = this.getCeilY(p.x, p.z, p.y - this.eyeH);
                if (ceil != null && p.y > ceil - 0.6) { p.y = ceil - 0.6; this.vy = 0; }
            }
            const floor = groundY + this.eyeH;
            if (p.y <= floor) {
                p.y = floor;
                this.vy = 0;
                this.onGround = true;
                this.wallJumps = 0;
                this.wallRunLeft = WALL_RUN_TIME;
                this.flying = false;
                if (this.onFly) this.onFly(false);
            } else {
                this.onGround = false;
            }
            this._jumpQueued = false;
            this._updateHeadBob(delta, false, false);
        }

        _updateWalk(delta, sprint) {
            // Eased walk (crouching, walking or sprinting) in the look direction:
            // velocity ramps in and out instead of starting / stopping instantly,
            // and there is far less of that control in the air, so a jump commits
            // you to the arc you left the ground on.
            const crouch = !!this.crouching;
            const spd = FOOT_WALK * (crouch ? FOOT_CROUCH_MULT : sprint ? FOOT_SPRINT_MULT : 1);
            const k = Math.min(1, delta * (this.onGround ? 9 : 1.6));
            this.velocity.x += (this.direction.x * spd - this.velocity.x) * k;
            this.velocity.z += (this.direction.z * spd - this.velocity.z) * k;
            this.yaw.translateX(this.velocity.x * delta);
            this.yaw.translateZ(-this.velocity.z * delta);

            this._pushOutOfSolids(delta);

            // Gravity, jumping and wall running. On the ground a jump is a jump;
            // in the air, with a wall against you, another press kicks off that
            // wall - as often as you like, so any face can be climbed a kick at
            // a time - and a slide down a wall is slowed by dragging along it.
            // Sprint held on a wall runs it outright: no jump needed, no falling
            // while the run lasts.
            // The eye sinks into a crouch and rises out of it rather than
            // snapping between the two heights (a snap fights the ground check:
            // the moment the eye drops, the walker is "in the air" and stands
            // straight back up).
            const wantEye = crouch ? FOOT_EYE_CROUCH : FOOT_EYE;
            this.eyeH += (wantEye - this.eyeH) * Math.min(1, delta * 12);
            if (Math.abs(wantEye - this.eyeH) < 0.02) this.eyeH = wantEye;
            const feet = this.yaw.position.y - this.eyeH;
            const groundY = (this.getGroundY
                ? this.getGroundY(this.yaw.position.x, this.yaw.position.z, feet) : 0) + this.eyeH;
            // Sprint against a wall is a wall run, and it starts from a standing
            // sprint into the face as readily as from the air: it lifts the feet
            // off the ground itself. Only the run running out (or letting go of
            // sprint, or leaving the wall) hands you back to gravity.
            const wallRun = sprint && this.wallContact > 0 && (this.wallRunLeft || 0) > 0;
            if (wallRun && this.onGround && this.direction.lengthSq() > 0) {
                this.onGround = false;
                this.vy = Math.max(this.vy, FOOT_JUMP_VEL * 0.35);
            }
            this.wallRunning = wallRun && !this.onGround;
            if (this._jumpQueued) {
                this._jumpQueued = false;
                if (this.onGround) {
                    this.vy = FOOT_JUMP_VEL;
                    this.onGround = false;
                    this.wallJumps = 0;
                    this.wallRunLeft = WALL_RUN_TIME;
                    if (this.onJump) this.onJump(false);
                } else if (this.wallContact > 0) {
                    // No cap: a wall you can still touch is a wall you can still
                    // kick off, so a face is climbed one press at a time.
                    this.wallJumps = (this.wallJumps || 0) + 1;
                    this.vy = FOOT_JUMP_VEL * 0.95;
                    // Off the wall and onward: a shove out along its face, kept in
                    // the walker's own frame the way the rest of the movement is.
                    this.velocity.z += FOOT_WALK * 0.55;
                    this.wallContact = 0;
                    this.wallRunning = false;
                    this.wallRunLeft = WALL_RUN_TIME;   // a kick gives the run back
                    if (this.onJump) this.onJump(true);
                }
            }
            if (this.wallRunning) {
                // Up the face while you are driving into it, held where you are
                // when you are not: a hang is a run with nowhere to go.
                this.wallRunLeft = Math.max(0, (this.wallRunLeft || 0) - delta);
                const target = this.direction.lengthSq() > 0 ? WALL_RUN_CLIMB : 0;
                this.vy += (target - this.vy) * Math.min(1, delta * 9);
            } else {
                const sliding = this.wallContact > 0 && this.vy < 0;
                // The pull, and only the pull, is this world's rather than Earth's:
                // the jump above pushes off just as hard wherever you are, so a low
                // gravity world sends the same leap far higher and brings it down
                // far slower.
                this.vy -= FOOT_GRAVITY * gravityScale() * (sliding ? 0.42 : 1) * delta;
            }
            this.yaw.position.y += this.vy * delta;
            // Indoors there is a floor over your head as well as under your feet.
            if (this.getCeilY) {
                const ceil = this.getCeilY(this.yaw.position.x, this.yaw.position.z, feet);
                if (ceil != null && this.yaw.position.y > ceil - 0.6) {
                    this.yaw.position.y = ceil - 0.6;
                    if (this.vy > 0) this.vy = 0;
                }
            }
            if (this.yaw.position.y <= groundY) {
                const landed = !this.onGround;
                this.yaw.position.y = groundY;
                if (landed && this.onLand) this.onLand(Math.min(1, -this.vy / 220));
                this.vy = 0;
                this.onGround = true;
                this.wallJumps = 0;
                this.wallRunning = false;
                this.wallRunLeft = WALL_RUN_TIME;
            } else {
                this.onGround = false;
            }

            this._updateHeadBob(delta, sprint, crouch);
        }

        // The walk itself: the eye rises and falls with the stride, sways a
        // little against it, and rolls by a hair. Every full stride is a
        // footstep, which is where the sound comes from too.
        _updateHeadBob(delta, sprint, crouch) {
            const cam = this.camera;
            if (!cam) return;
            const speed = Math.hypot(this.velocity.x, this.velocity.z);
            if (this.onGround && speed > 4) {
                this.bobT = (this.bobT || 0) + speed * delta * 0.085;
                const amp = crouch ? 0.10 : sprint ? 0.34 : 0.2;
                cam.position.y = Math.sin(this.bobT * 2) * amp;
                cam.position.x = Math.cos(this.bobT) * amp * 0.7;
                cam.rotation.z = Math.cos(this.bobT) * (sprint ? 0.009 : 0.005);
                const stride = Math.floor(this.bobT / Math.PI);
                if (stride !== this._lastStride) {
                    this._lastStride = stride;
                    if (this.onStep) this.onStep(sprint);
                }
            } else {
                const d = Math.max(0, 1 - delta * 9);
                cam.position.y *= d;
                cam.position.x *= d;
                cam.rotation.z *= d;
            }
            if (this.landDip > 0.001) {
                this.landDip = Math.max(0, this.landDip - delta * 3.4);
                cam.position.y -= this.landDip * 2.6;
            }
        }

        // Shoved by something: a gun going off, mostly. The push is in the
        // walker's own frame (z is where they are looking), so a barrel pointed
        // at the ground throws them straight up instead of backward.
        recoilKick(force) {
            const p = this.pitch ? this.pitch.rotation.x : 0;   // negative = looking down
            const up = Math.max(0, -Math.sin(p));
            const back = Math.cos(p);
            this.velocity.z -= back * force;
            // Always a little air with it: on the ground the walk's own friction
            // would eat a level shove in half a second, and being thrown by your
            // own gun should carry you.
            this.vy = Math.max(this.vy, 0) + up * force * 1.5 + back * force * 0.34;
            this.onGround = false;
            this.wallJumps = 0;
            this.wallRunLeft = WALL_RUN_TIME;
        }

        getRig() { return this.yaw; }

        dispose() {
            document.removeEventListener('mousemove',        this._onMouseMove);
            document.removeEventListener('click',            this._onClick);
            document.removeEventListener('keydown',          this._onKeyDown);
            document.removeEventListener('keyup',            this._onKeyUp);
            document.removeEventListener('pointerlockchange', this._onPointerLockChange);
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
        }
    }

    // =========================================================================
    // VanModel
    // =========================================================================
    // Minimal box camper used only if the CamperModel submodule failed to load,
    // so the scene never hard-crashes. Mirrors the CamperModel public API.
    class FallbackCamper {
        constructor(scene) {
            this._scene = scene;
            this.group = new THREE.Group();
            this._body = new THREE.Group();
            this.group.add(this._body);
            scene.add(this.group);
            this.seats = [{ name: 'Driver', pos: new THREE.Vector3(-10, 30, 28) }];  // i18n-ignore  seat id, matched below
            const shell = new THREE.Mesh(new THREE.BoxGeometry(42, 34, 92), new THREE.MeshLambertMaterial({ color: 0xe2e2e2 }));
            shell.position.y = 30; shell.castShadow = shell.receiveShadow = true;
            this._body.add(shell);
            this._wheels = [];
            const tg = new THREE.CylinderGeometry(8, 8, 6, 12).rotateZ(Math.PI / 2);
            const tm = new THREE.MeshLambertMaterial({ color: 0x18181c });
            for (const [x, z] of [[21, 30], [-21, 30], [21, -30], [-21, -30]]) {
                const w = new THREE.Mesh(tg, tm); w.position.set(x, 8, z); w.castShadow = true;
                this.group.add(w); this._wheels.push(w);
            }
        }
        applyMotion(speedUnits, steer, delta) {
            const spin = (speedUnits * delta) / 8;
            for (const w of this._wheels) w.rotation.x += spin;
        }
        setEnv() {}
        update() {}
        hideBody() {
            if (this._body) this._body.visible = false;
            if (this._wheels) for (const w of this._wheels) w.visible = false;
        }
        setVisible(on) {
            if (this._body) this._body.visible = !!on;
            if (this._wheels) for (const w of this._wheels) w.visible = !!on;
            if (this.group) this.group.visible = !!on;
        }
        toggleDoor() {}
        setDoorOpen() {}
        isDoorOpen() { return false; }
        getInteractables() { return []; }
        getDoorWorldPosition() { return null; }
        dispose() { this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this._scene.remove(this.group); }
    }

    // Adapter: the camper is now built by the CamperModel submodule (fully
    // procedural, modular, with interior / doors / seats / upgrade modules).
    // This thin wrapper keeps the scene's call sites stable and degrades to
    // FallbackCamper if the submodule is absent.
    class VanModel {
        constructor(scene) {
            const Factory = (window.HypernetCamper && window.HypernetCamper.CamperModel) || null;
            if (Factory) {
                this._impl = new Factory(scene);
            } else {
                console.warn('[VoxelWorld] CamperModel submodule not found; using fallback camper.');
                this._impl = new FallbackCamper(scene);
            }
            this.group = this._impl.group;
        }
        applyMotion(s, st, dt, roll, pitch, bounce) { this._impl.applyMotion(s, st, dt, roll, pitch, bounce); }
        updateDash(kmh, rpm01, fuel01, brakeOn) {
            if (this._impl.updateDash) this._impl.updateDash(kmh, rpm01, fuel01, brakeOn);
        }
        setEnv(env)        { if (this._impl.setEnv) this._impl.setEnv(env); }
        getEnv()           { return this._impl.getEnv ? this._impl.getEnv() : 'road'; }
        update(dt)         { if (this._impl.update) this._impl.update(dt); }
        hideBody() {
            if (this._impl && this._impl.hideBody) this._impl.hideBody();
            else if (this._impl && this._impl._body) this._impl._body.visible = false;
        }
        setVisible(on) {
            if (this._impl && this._impl.setVisible) {
                this._impl.setVisible(on);
            } else {
                if (this._impl && this._impl._body) this._impl._body.visible = !!on;
                if (this._impl && this._impl._wheels) for (const w of this._impl._wheels) w.visible = !!on;
            }
            if (this.group) this.group.visible = !!on;
        }
        toggleDoor(which)  { if (this._impl.toggleDoor) this._impl.toggleDoor(which); }
        setDoorOpen(open)  { if (this._impl.setDoorOpen) this._impl.setDoorOpen(open); }
        isDoorOpen()       { return this._impl.isDoorOpen ? this._impl.isDoorOpen() : false; }
        getInteractables() { return this._impl.getInteractables ? this._impl.getInteractables() : []; }
        getDoorWorldPosition(target) {
            return this._impl.getDoorWorldPosition ? this._impl.getDoorWorldPosition(target) : null;
        }
        get seats()        { return this._impl.seats || []; }
        dispose()          { this._impl.dispose(); }
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        FallbackCamper, FirstPersonController, VanModel
    });
})();
