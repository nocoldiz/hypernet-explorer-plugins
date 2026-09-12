//=============================================================================
// VoxelWorldAutopilot.js
// VoxelWorld: the road autopilot and the weapon held on foot
//
// Part of the VoxelWorld suite. The ground of that world is a field of small
// destructible voxels; this module is one slice of the machinery laid over it.
// Load order is fixed in plugins.js and every module reads the shared state it
// needs off window.VoxelWorld.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc VoxelWorld - the road autopilot and the weapon held on foot
 * @author Omni-Lex
 *
 * @help
 * the road autopilot and the weapon held on foot.
 *
 * One module of the VoxelWorld suite (VoxelWorldCore.js loads first). It
 * declares no plugin commands of its own; those live in VoxelWorldSystem.js.
 */

(() => {
    'use strict';

    const VW = window.VoxelWorld;
    if (!VW) { console.error('[VoxelWorld] core not loaded before VoxelWorldAutopilot.js'); return; }

    const {
        RECOIL_KICK, ROAD_HALF_LANE, ROAD_LANE_OFF, ROAD_OPPOSITE, ROAD_STEP, WORLD_TILE_SIZE,
        isRoadTile, pickRandomRoadTile, roadExitsFrom, WEAPON_Z
    } = VW;

    // Which of the four edges a heading points at, and how well. The road graph
    // is a compass of four sides, a driver's heading is any angle, and the two
    // meet here: the dot product of the heading with each side's step, largest
    // wins. _driveAngle is atan2(dx, dz), so the heading vector is (sin, cos).
    function headingDot(side, angle) {
        const step = ROAD_STEP[side];
        return Math.sin(angle) * step[0] + Math.cos(angle) * step[1];
    }
    function sideForHeading(angle) {
        let best = 'e', bestD = -Infinity;
        for (const side in ROAD_STEP) {
            const d = headingDot(side, angle);
            if (d > bestD) { bestD = d; best = side; }
        }
        return best;
    }

    // =========================================================================
    // RoadAutopilot
    //
    // Drives the camper along the world's tagged road network on its own: it
    // plans a few tiles ahead through the road graph, picking a random way out
    // whenever a crossroad or T-junction offers one (never doubling back unless
    // the road dead-ends), and feeds the ordinary vehicle physics a steering /
    // throttle / brake input as if a driver were at the wheel. Waypoints sit in
    // the KERB-SIDE lane of the right-hand carriageway, so the camper keeps to
    // its own side of the road and leaves the paint down the middle of that
    // carriageway, and the lane past it, to the traffic overtaking.
    // =========================================================================
    const AUTO_CRUISE_KMH   = 78;    // open road
    const AUTO_BEND_KMH     = 50;    // gentle bend ahead
    const AUTO_TURN_KMH     = 33;    // 90 degree turn ahead
    const AUTO_LOOKAHEAD    = 6;     // waypoints kept planned ahead
    const AUTO_REACH_DIST   = 45;    // world units: waypoint counts as reached
    const AUTO_LOST_TIME    = 5;     // seconds off the asphalt before recovering
    const AUTO_STALL_TIME   = 7;     // seconds barely moving before recovering

    class RoadAutopilot {
        constructor(scene, tileX, tileY) {
            this._scene    = scene;
            this.controls  = { throttle: 0, brake: false, steer: 0 };
            this._wps      = [];      // planned waypoints (world x/z + travel dir)
            this._exitTile = null;    // tile the planned route runs into next
            this._lastAngle = null;   // previous heading, for the steering damper
            // Which side of the road the route is laid down: +1 is the
            // right-hand carriageway, the side everything drives on out here.
            // The lane assist flips it when the driver is already over on the
            // other one, rather than hauling them across the median.
            this._laneSign = 1;
            this._lostTime = 0;
            this._stallTime = 0;
            this._plan(tileX, tileY);
        }

        // ---- planning -------------------------------------------------------

        // Restart the route on the given tile, heading down whichever road leaves
        // it, and aim the camper along that first leg.
        _plan(tileX, tileY) {
            this._wps.length = 0;
            this._exitTile = null;
            const exits = roadExitsFrom(tileX, tileY, null);
            const side  = exits.length ? exits[Math.floor(Math.random() * exits.length)] : 'e';
            this._pushLeg(tileX, tileY, null, side);
            while (this._wps.length < AUTO_LOOKAHEAD) {
                if (!this._extend()) break;
            }
            // Face the camper down the first leg so it pulls away cleanly.
            const step = ROAD_STEP[side];
            this._scene._driveAngle = Math.atan2(step[0], step[1]);
        }

        // Queue the drive across one tile: in through `from` (null on the first
        // tile) and out through `side`. Straight through, that is the tile centre
        // and the edge crossed, both in the right-hand lane. Around a bend, it is
        // the same quarter-circle the corner tile's asphalt is built on, so the
        // camper follows the curve instead of cutting across the verge.
        _pushLeg(tileX, tileY, from, side) {
            const ts   = WORLD_TILE_SIZE;
            // Right of the carriageway's own broken line, which is where the
            // traffic drives too (see TrafficManager): never on the paint.
            const lane = ROAD_LANE_OFF + ROAD_HALF_LANE;
            const off  = lane * (this._laneSign || 1);
            const step = ROAD_STEP[side];
            const ax = step[0], az = step[1];
            const cx = tileX * ts + ts * 0.5, cz = tileY * ts + ts * 0.5;
            this._exitTile = { x: tileX + ax, y: tileY + az, from: ROAD_OPPOSITE[side] };

            const turning = from && side !== from && ROAD_OPPOSITE[from] !== side;
            if (!turning) {
                // Right of the direction of travel, matching the traffic's lane rule.
                const rx = az, rz = -ax;
                this._wps.push({ x: cx + rx * off, z: cz + rz * off, ax, az });
                this._wps.push({ x: cx + rx * off + ax * ts * 0.5,
                                 z: cz + rz * off + az * ts * 0.5, ax, az });
                return;
            }

            // Pivot: the tile corner shared by the entry and the exit edge.
            const inStep = ROAD_STEP[from];
            const px = cx + (inStep[0] + ax) * ts * 0.5;
            const pz = cz + (inStep[1] + az) * ts * 0.5;
            // Inside or outside lane, depending on which side of the road the
            // incoming lane sits relative to the pivot.
            const iax = -inStep[0], iaz = -inStep[1];          // incoming heading
            const onPivotSide = (iaz * (px - cx) + (-iax) * (pz - cz)) > 0;
            const laneR = ts * 0.5 + (onPivotSide ? -off : off);
            const a0 = Math.atan2(cz + inStep[1] * ts * 0.5 - pz, cx + inStep[0] * ts * 0.5 - px);
            let sweep = Math.atan2(cz + az * ts * 0.5 - pz, cx + ax * ts * 0.5 - px) - a0;
            while (sweep >  Math.PI) sweep -= Math.PI * 2;
            while (sweep < -Math.PI) sweep += Math.PI * 2;

            const STEPS = 4;
            let prevX = px + laneR * Math.cos(a0), prevZ = pz + laneR * Math.sin(a0);
            for (let i = 1; i <= STEPS; i++) {
                const a = a0 + sweep * (i / STEPS);
                const x = px + laneR * Math.cos(a), z = pz + laneR * Math.sin(a);
                const dx = x - prevX, dz = z - prevZ;
                const len = Math.hypot(dx, dz) || 1;
                this._wps.push({ x, z, ax: dx / len, az: dz / len });
                prevX = x; prevZ = z;
            }
        }

        // Plan one more tile past the end of the route, choosing at random when
        // the junction offers more than one way on.
        _extend() {
            const next = this._exitTile;
            if (!next || !isRoadTile(next.x, next.y)) return false;
            let exits = roadExitsFrom(next.x, next.y, next.from);
            // Dead end: the only way on is back the way we came.
            if (!exits.length) exits = [next.from];
            const side = exits[Math.floor(Math.random() * exits.length)];
            this._pushLeg(next.x, next.y, next.from, side);
            return true;
        }

        // ---- driving --------------------------------------------------------

        // Keep the route topped up, drop the waypoints already driven past, and
        // hand back the one being steered at. Null means the route has run out:
        // what to do about that is the caller's business, because the answer is
        // not the same for a camper driving itself and for a driver being
        // helped along by one (see RoadFollow).
        _advance() {
            const s = this._scene;
            while (this._wps.length < AUTO_LOOKAHEAD) {
                if (!this._extend()) break;
            }
            // Drop waypoints that have been reached or driven past.
            while (this._wps.length > 1) {
                const wp = this._wps[0];
                const dx = wp.x - s._vanX, dz = wp.z - s._vanZ;
                const passed = (s._vanX - wp.x) * wp.ax + (s._vanZ - wp.z) * wp.az > 0;
                if (!passed && (dx * dx + dz * dz) > AUTO_REACH_DIST * AUTO_REACH_DIST) break;
                this._wps.shift();
            }
            // The route ran out (the road left the map, or the tags stop).
            if (this._wps.length === 1) {
                const last = this._wps[0];
                const done = (s._vanX - last.x) * last.ax + (s._vanZ - last.z) * last.az > 0;
                if (done && !this._extend()) return null;
            }
            return this._wps[0] || null;
        }

        // The wheel, for one waypoint: the heading error onto the lock, damped
        // by how fast the vehicle is already turning so it settles onto the lane
        // instead of weaving across it. The error itself is left on _headingErr,
        // which is half of how far ahead the road bends.
        _steerTo(wp, delta) {
            const s = this._scene;
            const dx = wp.x - s._vanX, dz = wp.z - s._vanZ;
            let err = Math.atan2(dx, dz) - s._driveAngle;
            while (err >  Math.PI) err -= Math.PI * 2;
            while (err < -Math.PI) err += Math.PI * 2;
            let yawRate = 0;
            if (this._lastAngle != null && delta > 0) {
                let d = s._driveAngle - this._lastAngle;
                while (d >  Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                yawRate = d / delta;
            }
            this._lastAngle = s._driveAngle;
            this._headingErr = err;
            return Math.max(-1, Math.min(1, err * 2.6 - yawRate * 0.45));
        }

        update(delta) {
            const s = this._scene;
            const wp = this._advance();
            if (!wp) { this._recover(); return; }

            const steer = this._steerTo(wp, delta);
            const err   = this._headingErr;

            // Slow down for whatever the road does next: sum the heading changes
            // waiting over the next few waypoints (a bend's worth of arc adds up
            // to about a radian) and pick a speed to take them at.
            let bend = Math.abs(err) * 0.5;
            const scan = Math.min(4, this._wps.length);
            for (let i = 0; i + 1 < scan; i++) {
                bend += Math.abs(this._angleBetween(this._wps[i], this._wps[i + 1]));
            }
            const targetKmh = bend > 1.4 ? AUTO_TURN_KMH
                            : bend > 0.5 ? AUTO_BEND_KMH
                            : AUTO_CRUISE_KMH;
            const v = s._speedKmh || 0;
            this.controls.steer    = steer;
            this.controls.throttle = v < targetKmh ? Math.min(1, 0.3 + (targetKmh - v) / 14) : 0;
            this.controls.brake    = v > targetKmh * 1.3;

            this._watchdog(delta, v);
        }

        // Heading change from the leg into `a` to the leg into `b`, in radians.
        _angleBetween(a, b) {
            let d = Math.atan2(b.ax, b.az) - Math.atan2(a.ax, a.az);
            while (d >  Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            return d;
        }

        // Off the asphalt or wedged against something for too long: pick a fresh
        // stretch of road elsewhere in the world rather than grinding in place.
        _watchdog(delta, kmh) {
            const s  = this._scene;
            const tx = Math.floor(s._vanX / WORLD_TILE_SIZE);
            const ty = Math.floor(s._vanZ / WORLD_TILE_SIZE);
            this._lostTime  = isRoadTile(tx, ty) ? 0 : this._lostTime + delta;
            this._stallTime = kmh > 4 ? 0 : this._stallTime + delta;
            if (this._lostTime > AUTO_LOST_TIME || this._stallTime > AUTO_STALL_TIME) this._recover();
        }

        // Drop the camper back onto a random road tile, stopped and level.
        _recover() {
            const s    = this._scene;
            const tile = pickRandomRoadTile();
            if (!tile) return;
            this._lostTime = 0;
            this._stallTime = 0;
            this._lastAngle = null;
            s._vanX = tile.x * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
            s._vanZ = tile.y * WORLD_TILE_SIZE + WORLD_TILE_SIZE * 0.5;
            s._velX = 0; s._velZ = 0;
            s._fwdSpeed = 0; s._latSpeed = 0;
            s._speedKmh = 0; s._speedUnitsSigned = 0; s._steerSmooth = 0;
            s._groundPitch = 0; s._groundRoll = 0;
            this._plan(tile.x, tile.y);
            s._van.group.rotation.x = 0;
            s._van.group.rotation.z = 0;
            s._van.group.rotation.y = s._driveAngle;
            // Spread the new neighbourhood's build over the next frames: the
            // ground height comes from the biome data, not from the meshes, so
            // the camper is on solid ground before the chunks catch up.
            s._terrain.update(s._vanX, s._vanZ);
            s._vanY = s._resolveEnv();
            s._van.group.position.set(s._vanX, s._vanY, s._vanZ);
        }
    }

    // =========================================================================
    // RoadFollow, the lane assist
    //
    // A road out here is a hundred and fifty units of tarmac across a five
    // hundred unit square, and holding a vehicle on it with taps of A and D for
    // kilometres at a time is work rather than driving. So the road steers
    // itself: on the asphalt, and only while nobody is touching the wheel, the
    // same waypoint machinery the title screen's autopilot uses holds the
    // vehicle in its lane, takes the bends, and carries straight on through
    // junctions.
    //
    // The driver is never overruled. The moment the wheel moves the assist lets
    // go, and it stays let go for a beat after their hands come off, so a swerve
    // round a boulder is a swerve and not a fight with the steering. It comes
    // back on its own once they are straight on the road again.
    //
    // What it does NOT touch is the throttle, the brake or the boost: how fast
    // the vehicle goes down the road it is holding is entirely the driver's.
    // =========================================================================

    // How far the wheel has to move before the assist lets go of it. A pad's
    // resting drift is well under this; a key press is a full lock.
    const FOLLOW_HANDS_ON = 0.12;
    // ...and how long it stays let go after the driver stops steering, so the
    // end of a deliberate swerve is not snatched back mid-manoeuvre.
    const FOLLOW_RELEASE  = 1.2;    // seconds
    // Under this it does not steer at all: parking, turning round and nudging
    // up to something are the driver's own business.
    const FOLLOW_MIN_KMH  = 14;
    // Pointed this far off the lane it is not lane keeping any more, it is
    // somebody driving off the road on purpose. The assist stands down and
    // waits to be driven back onto it.
    const FOLLOW_MAX_ERR  = Math.PI * 0.4;

    class RoadFollow extends RoadAutopilot {
        constructor(scene) {
            const ts = WORLD_TILE_SIZE;
            // The base plans a route in its constructor; _plan below is the one
            // that runs, and it plans off the driver's own heading.
            super(scene, Math.floor(scene._vanX / ts), Math.floor(scene._vanZ / ts));
            this._release = 0;      // seconds left of hands-on
        }

        // ---- planning -------------------------------------------------------

        // The route is the road the DRIVER is on, taken the way they are already
        // pointing. Nothing here touches _driveAngle: the autopilot may aim the
        // camper down its first leg, the assist may not turn the wheel for a
        // driver who has not asked it to.
        _plan(tileX, tileY) {
            this._wps.length = 0;
            this._exitTile = null;
            const s = this._scene;
            if (!s || !isRoadTile(tileX, tileY)) return;
            const angle = s._driveAngle;
            const from  = ROAD_OPPOSITE[sideForHeading(angle)];
            const side  = this._bestExit(tileX, tileY, from, angle);
            if (!side) return;
            this._laneSign = this._laneSignAt(tileX, tileY, side);
            this._pushLeg(tileX, tileY, from, side);
            while (this._wps.length < AUTO_LOOKAHEAD) {
                if (!this._extend()) break;
            }
        }

        // Whichever way out of the tile carries on closest to the way we are
        // already going: a junction is driven STRAIGHT through unless the road
        // itself bends, and the turn is never chosen for the driver.
        _bestExit(tileX, tileY, from, angle) {
            const exits = roadExitsFrom(tileX, tileY, from);
            let best = null, bestD = -Infinity;
            for (const side of exits) {
                const d = headingDot(side, angle);
                if (d > bestD) { bestD = d; best = side; }
            }
            return best;
        }

        // Which carriageway the vehicle is actually on, as seen from the way it
        // is travelling: +1 to the right of the tile's centreline, -1 to the
        // left. Keeping the side they are on is the whole difference between an
        // assist and a hand on the wheel pulling them over the median.
        _laneSignAt(tileX, tileY, side) {
            const s = this._scene;
            const ts = WORLD_TILE_SIZE;
            const step = ROAD_STEP[side];
            const cx = tileX * ts + ts * 0.5, cz = tileY * ts + ts * 0.5;
            // Right of the direction of travel, the same frame _pushLeg lays
            // its waypoints out in.
            const right = (s._vanX - cx) * step[1] + (s._vanZ - cz) * (-step[0]);
            return right < 0 ? -1 : 1;
        }

        _extend() {
            const next = this._exitTile;
            if (!next || !isRoadTile(next.x, next.y)) return false;
            // The heading we arrive on this tile with, which is the opposite of
            // the edge we came in by.
            const inStep = ROAD_STEP[ROAD_OPPOSITE[next.from]];
            const angle  = Math.atan2(inStep[0], inStep[1]);
            const side   = this._bestExit(next.x, next.y, next.from, angle);
            if (!side) return false;
            this._pushLeg(next.x, next.y, next.from, side);
            return true;
        }

        // The assist never picks the vehicle up and puts it somewhere else: that
        // is the title screen's camper, driving in a world nobody is playing.
        _watchdog() {}
        _recover() { this._wps.length = 0; }

        // ---- the wheel -------------------------------------------------------

        // Returns the steering the assist wants, or null when it is standing
        // down and the driver's own input should be used as it is.
        //
        //   driverSteer  what the wheel is being given by hand this frame
        //   driving      whether the party is at the wheel at all
        steer(delta, driverSteer, driving) {
            if (Math.abs(driverSteer) > FOLLOW_HANDS_ON) {
                this._release = FOLLOW_RELEASE;
                this._lastAngle = null;
            } else if (this._release > 0) {
                this._release = Math.max(0, this._release - delta);
            }
            // Standing down. The route is dropped rather than kept warm: coming
            // back onto the road after a swerve, a stale lane a square behind is
            // worse than no lane at all, and planning one costs a handful of
            // tile lookups.
            if (!driving || this._release > 0 || !this._eligible()) {
                this._wps.length = 0;
                // ...and the damper forgets where the vehicle was pointing. A
                // heading remembered from before a stand-down is a yaw rate of
                // whole radians per frame, which would slam the wheel to full
                // lock the moment the assist came back.
                this._lastAngle = null;
                return null;
            }

            const s  = this._scene;
            const ts = WORLD_TILE_SIZE;
            const tx = Math.floor(s._vanX / ts), tz = Math.floor(s._vanZ / ts);
            if (!this._wps.length) this._plan(tx, tz);
            let wp = this._advance();
            // The route ran out under the vehicle (the tags stop carrying on
            // from a junction): plan again from where it actually is. Only
            // worth doing if there was a route to run out - a plan that came
            // back empty a line ago will come back empty again.
            if (!wp && this._wps.length) { this._plan(tx, tz); wp = this._wps[0]; }
            if (!wp) return null;

            // Pointed somewhere else entirely: they are leaving the road, or
            // driving back down it the other way. Either way this is not a lane
            // to be held, so the route is thrown away and the assist waits to be
            // driven back onto one. Measured against the way the LANE runs, not
            // against the bearing of the next waypoint: a vehicle sitting level
            // with one it has yet to reach is ninety degrees off the mark and is
            // still perfectly straight on the road.
            let off = Math.atan2(wp.ax, wp.az) - s._driveAngle;
            while (off >  Math.PI) off -= Math.PI * 2;
            while (off < -Math.PI) off += Math.PI * 2;
            if (Math.abs(off) > FOLLOW_MAX_ERR) {
                this._wps.length = 0;
                this._lastAngle = null;
                return null;
            }
            return this._steerTo(wp, delta);
        }

        // Only on the asphalt, only under way, and only with the wheels down.
        // _fwdSpeed is signed, so reversing is out with everything else.
        _eligible() {
            const s = this._scene;
            if (!s) return false;
            if (s._env !== 'road' || s._flying || s._dived || s._airborne) return false;
            if (s._isFastTravelActive && s._isFastTravelActive()) return false;
            if (!(s._fwdSpeed > FOLLOW_MIN_KMH)) return false;
            const ts = WORLD_TILE_SIZE;
            return isRoadTile(Math.floor(s._vanX / ts), Math.floor(s._vanZ / ts));
        }
    }

    // =========================================================================
    // VoxelWorldScene
    // =========================================================================
    // =========================================================================
    // The weapon in the driver's hands.
    //
    // Whatever the party leader has equipped, drawn by the layer a battle draws
    // a first-person weapon with: Sprite_3DWeapon over the shared
    // WeaponThreeScene overlay (Weapon3DOverlay.js), built, posed and swung by
    // WeaponSystemProcedural. It is their real equipment, so it changes when
    // they change it, and both hands show when they are dual wielding or
    // holding claws, exactly as in a fight.
    //
    // It is only in frame while the driver is WALKING ('foot'). In the cabin,
    // at the wheel and in every camera mode it is put away: hands are on the
    // wheel, and a weapon hanging in front of a driving view reads as a bug.
    // =========================================================================
    const CamperWeapon = {
        _right: null,
        _left: null,
        _held: false,
        _visible: false,
        // The layer has been handed to a battle being fought over the world.
        _battle: false,

        available() {
            return !!(window.THREE && window.Sprite_3DWeapon && window.WeaponThreeScene &&
                      window.WeaponSystemProcedural);
        },

        /** Raise the overlay for the whole drive. */
        begin() {
            if (this._held || !this.available()) return;
            // One reference for the drive: swapping a weapon must never take the
            // count to zero, since each of those destroys and rebuilds a WebGL
            // context and the browser force-loses the oldest one it has.
            window.WeaponThreeScene.ref();
            this._held = true;
            this._onMouseDown = this._onMouseDown || ((e) => {
                if (!VoxelWorldSystem.isActive() || e.button !== 0) return;
                if (document.pointerLockElement !== document.body) return;   // the first click only grabs the mouse
                // Holding a block, not a weapon: that click is a wall going up,
                // not a blow being thrown (VoxelWorldDigging's BlockBar).
                const sc = VoxelWorldSystem._scene;
                if (sc && sc._tool && sc._tool.bar && !sc._tool.bar.holdingWeapon) return;
                CamperWeapon.swing();
            });
            document.addEventListener('mousedown', this._onMouseDown);
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) {
                // Over the world, and under everything the game lays on top of
                // it: a toast and the quick bar are read, a held weapon is seen.
                canvas.style.zIndex = String(WEAPON_Z);
                // Put away until the driver is out of the van. The canvas keeps
                // whatever was last drawn into it, so starting hidden is also
                // what stops a battle's last frame hanging over the road.
                canvas.style.display = 'none';
            }
        },

        /** Only on foot: the one mode where the driver is walking about. */
        showsIn(viewMode) { return viewMode === 'foot'; },

        /**
         * A fight has opened over the world (VoxelWorldScene#beginBattleView),
         * and the fight draws a first-person weapon of its own - through this
         * very layer, since Spriteset_Battle and the drive share the one
         * overlay. So the drive hands it over for the length of the fight:
         *
         *  - its own two models come down, or the driver's blade would hang in
         *    frame beside the one the battle puts there;
         *  - the layer drops back to the height a battle draws it at, the world
         *    being drawn into the game's own canvas underneath by then;
         *  - and it is LEFT SHOWING. The battle's overlay code only ever
         *    renders into this canvas, never reveals it, so a canvas the drive
         *    had hidden stays hidden and the party fights bare-handed on
         *    screen while holding a sword.
         */
        suspendForBattle() {
            if (!this._held || this._battle) return;
            this._battle = true;
            for (const slot of ['_right', '_left']) {
                if (this[slot]) this[slot].terminate();
                this[slot] = null;
            }
            this._visible = false;
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) {
                canvas.style.zIndex  = '10';
                canvas.style.display = 'block';
            }
        },

        /** The fight is over: the layer comes back to the drive, put away. */
        resumeFromBattle() {
            if (!this._battle) return;
            this._battle = false;
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) {
                canvas.style.zIndex = String(WEAPON_Z);
                // update() is what puts it back in frame, and only once the
                // driver is out of the van again.
                canvas.style.display = 'none';
            }
        },

        /**
         * Puts the leader's own weapons in frame, rebuilding only what changed.
         * An empty right hand is not empty: it holds the fist of the character's
         * archetype, the same as in battle.
         */
        refresh() {
            if (!this._held) return;
            let right = null, left = null;
            const actor = (typeof $gameParty !== 'undefined' && $gameParty) ? $gameParty.leader() : null;
            if (actor) {
                const weapons = actor.weapons();
                right = weapons[0] || null;
                const claws = right && right.wtypeId === 10;
                if (weapons.length >= 2 || claws) left = weapons[1] || null;
                if (!right) right = WeaponSystemProcedural.unarmedWeaponFor(actor);
            }
            this._right = this._set('_right', right, false);
            this._left = this._set('_left', left, true);
        },

        _set(slot, weapon, isLeft) {
            const held = this[slot];
            if (!weapon) {
                if (held) held.terminate();
                return null;
            }
            if (held && held._weapon === weapon) return held;
            if (held) held.terminate();
            WeaponSystemProcedural.patchSprite3DWeapon();
            return new Sprite_3DWeapon(weapon, weaponScreenX(isLeft), weaponScreenY());
        },

        /**
         * The weapon in the leader's hands is their EQUIPMENT and nothing else.
         * The d-pad used to step a rack out here - every weapon in the party's
         * bags, cycled in the field and equipped on the spot - which meant the
         * blade you were fighting with could change under a thumb that meant to
         * pick a block. It changes in one place now, the equip screen, and this
         * layer only draws whatever is found there (see refresh()).
         */

        /** One blow at a time, out of whichever hand is holding something. */
        swing() {
            if (!this._visible) return;
            const s = this._right || this._left;
            if (!s || !s._weapon) return;
            if (s._animData || s._clipPlaying) return;
            s.playAnimation(null);
            if (this._left && this._left !== s && !this._left._animData) {
                this._left.playAnimation(null);
            }
            if (window.WeaponSounds) window.WeaponSounds.play(s._weapon);

            // Whatever was under the crosshair when it went off has just been
            // picked a fight with. The scene owns that: it knows what is
            // standing out there and how far this weapon reaches.
            {
                const sc = VoxelWorldSystem._scene;
                if (sc && sc._weaponStrike) sc._weaponStrike(s._weapon);
            }

            // A gun tagged <RecoilJump> (the Vector gun, Bubba's shotgun) throws
            // whoever fires it: the shove is straight back off the muzzle, so
            // pointing one at your own feet launches you into the air instead of
            // pushing you along the ground. Only on foot, and only in this scene,
            // where there is a body to shove.
            const w = s._weapon;
            if (w && w.note && /<RecoilJump>/i.test(w.note)) {
                const sc = VoxelWorldSystem._scene;
                if (sc && sc._viewMode === 'foot' && sc._fpc && sc._fpc.recoilKick) {
                    sc._fpc.recoilKick(RECOIL_KICK);
                }
            }
        },

        /** Called once a frame by the drive's own loop. */
        update(viewMode, menuOpen) {
            if (!this._held) return;
            // The fight has the layer: it holds the models and it does the
            // drawing (see suspendForBattle).
            if (this._battle) return;
            const show = !menuOpen && this.showsIn(viewMode);
            if (show !== this._visible) {
                this._visible = show;
                const canvas = window.WeaponThreeScene.canvas;
                if (canvas) canvas.style.display = show ? 'block' : 'none';
                if (show) this.refresh();
            }
            if (!show) return;
            // Cheap enough to re-read every frame, and it is the only way a
            // weapon changed in the menu turns up in the driver's hand.
            this.refresh();
            if (typeof Input !== 'undefined' && Input.isTriggered('pagedown')) this.swing();
            this._updatePad();
            for (const s of [this._right, this._left]) {
                if (!s) continue;
                s._aimPoint = null;
                s.update();
            }
            window.WeaponThreeScene.render();
        },

        /**
         * The pad, walking about outside the van. R2 is the trigger finger, the
         * same as it is in a dream and on the shooting range, and it has to be
         * read raw: core's mapper does not carry the analog triggers at all.
         * The d-pad is the quick bar's (VoxelWorldScene#_updateBarInput), not a
         * weapon rack's - nothing out here changes what is equipped.
         */
        _updatePad() {
            const pads = window.AnalogStickInput;
            if (!pads || !pads.hasPad || !pads.hasPad()) return;
            const rt = pads.rightTrigger ? pads.rightTrigger() : 0;
            if (!this._rtDown && rt > 0.55) { this._rtDown = true; this.swing(); }
            else if (this._rtDown && rt < 0.30) this._rtDown = false;
        },

        end() {
            if (!this._held) return;
            this._battle = false;
            if (this._onMouseDown) document.removeEventListener('mousedown', this._onMouseDown);
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) { canvas.style.display = 'block'; canvas.style.zIndex = '10'; }
            for (const slot of ['_right', '_left']) {
                if (this[slot]) this[slot].terminate();
                this[slot] = null;
            }
            this._held = false;
            this._visible = false;
            this._rtDown = false;
            // Last, so the count only reaches zero once the sprites have let go.
            window.WeaponThreeScene.deref();
        }
    };

    // Where a held weapon sits on screen, in game pixels. The same numbers the
    // battle overlay uses (Weapon3DOverlay), read off the plugin's own
    // parameters so the two never drift apart.
    function weaponScreenX(isLeft) {
        const p = PluginManager.parameters('WeaponSystem') || {};
        const wide = ($gameSystem && $gameSystem.getCurrentResolution &&
            $gameSystem.getCurrentResolution() === '16:9');
        const sx = wide ? 1.568 : 1;
        if (isLeft) return Math.round(200 * sx);
        return Math.round(Number(p.weaponSpriteX || 650) * sx) - 120;
    }
    function weaponScreenY() {
        const p = PluginManager.parameters('WeaponSystem') || {};
        const wide = ($gameSystem && $gameSystem.getCurrentResolution &&
            $gameSystem.getCurrentResolution() === '16:9');
        return Math.round(Number(p.weaponSpriteY || 450) * (wide ? 1.154 : 1));
    }

    // Handed to the rest of the suite.
    Object.assign(VW, {
        AUTO_BEND_KMH, AUTO_CRUISE_KMH, AUTO_LOOKAHEAD, AUTO_LOST_TIME,
        AUTO_REACH_DIST, AUTO_STALL_TIME, AUTO_TURN_KMH, CamperWeapon,
        FOLLOW_HANDS_ON, FOLLOW_MAX_ERR, FOLLOW_MIN_KMH, FOLLOW_RELEASE,
        RoadAutopilot, RoadFollow, weaponScreenX, weaponScreenY
    });
})();
