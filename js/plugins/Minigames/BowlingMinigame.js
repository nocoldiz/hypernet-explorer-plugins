/*:
 * @target MZ
 * @plugindesc Low-poly PSX-style 3D bowling with real rigid-body pin physics v4.0.0
 * @author Omni-Lex
 * @version 4.0.0
 *
 * @help BowlingMinigame.js
 *
 * A full 3D bowling alley rendered with three.js through the shared PSXShader,
 * in the spirit of the Tekken 3 bowling minigame: chunky untextured-looking
 * geometry, vertex wobble, dithered colours, a camera that rides the ball down
 * the lane and cuts to the pin deck for the strike, and a pinsetter rake that
 * sweeps the deadwood away between rolls. There is no bowler model, the view
 * is the bowler's own; the retro shader also runs softened here (the player's
 * settings scaled, see softPSX) because the alley is watched up close.
 *
 * Everything is simulated in metres with real bowling dimensions:
 *   - 18.29 m from the foul line to the head pin, 1.0668 m lane, 0.2286 m gutters
 *   - 6.35 kg / 0.108 m ball, 1.53 kg / 0.381 m pins on 0.3048 m centres
 *
 * The pins are genuine 3D rigid bodies (capsule collider, quaternion
 * orientation, angular momentum), so they topple, spin, knock each other over,
 * ricochet off the side walls and drop into the pit. The hook is not faked:
 * the ball is released with a tilted spin axis and the lane friction at the
 * contact patch converts that slip into lateral force, exactly like the real
 * thing. More spin means more curve, and the ball straightens out once it
 * stops sliding and starts rolling.
 *
 * CONTROLS
 *   Aim step    Left/Right moves the delivery across the approach,
 *               Up/Down angles the delivery. OK to confirm.
 *   Power step  OK to stop the oscillating power bar.
 *   Spin step   OK to stop the oscillating spin bar (left/right hook).
 *   Cancel      steps back one stage, or quits from the aim step.
 *
 * With SplitScreenMultiplayer active the CPU is replaced by Player 2 and the
 * two take alternate frames hot-seat style, driven by the P2 controller.
 *
 * The HUD is built the way a PlayStation built one, minus the television: a
 * 240-line virtual framebuffer upscaled with nearest filtering for the boxes,
 * keylines and block gauges, with every label on top of them as crisp HTML type
 * (window.PSXHud / PSXHud.domPanel). No scanlines, no vignette.
 *
 * Requires js/libs/three.min.js and Battler3D/PSXShader.js.
 *
 * @param ---Physics Settings---
 * @default
 *
 * @param Ball Mass
 * @parent ---Physics Settings---
 * @desc Mass of the bowling ball in kg.
 * @type number
 * @decimals 2
 * @default 6.35
 *
 * @param Pin Mass
 * @parent ---Physics Settings---
 * @desc Mass of each bowling pin in kg.
 * @type number
 * @decimals 2
 * @default 1.53
 *
 * @param Lane Friction
 * @parent ---Physics Settings---
 * @desc Friction between the ball and the oiled lane. Higher = stronger hook.
 * @type number
 * @decimals 3
 * @default 0.060
 *
 * @param Pin Bounce
 * @parent ---Physics Settings---
 * @desc Pin elasticity on collision (0-1).
 * @type number
 * @decimals 2
 * @default 0.40
 *
 * @param Max Spin Rate
 * @parent ---Physics Settings---
 * @desc Side-axis spin in rad/s at full hook. Higher = wider curve.
 * @type number
 * @decimals 1
 * @default 6.0
 *
 * @param ---Sound Effects---
 * @default
 *
 * @param Roll Sound
 * @parent ---Sound Effects---
 * @desc The sound effect to play when the ball is rolled.
 * @type file
 * @dir audio/se/
 * @default Earth3
 *
 * @param Pin Hit Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for pins being hit.
 * @type file
 * @dir audio/se/
 * @default wood_03
 *
 * @param Strike Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for a strike.
 * @type file
 * @dir audio/se/
 * @default Applause1
 *
 * @param Spare Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for a spare.
 * @type file
 * @dir audio/se/
 * @default Bell2
 *
 * @param Gutter Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for a gutter ball.
 * @type file
 * @dir audio/se/
 * @default Buzzer1
 *
 * @param ---Game Variables---
 * @default
 *
 * @param Game Result Variable
 * @parent ---Game Variables---
 * @desc The game variable ID to store the result (1 for win, 2 for loss, 3 for draw).
 * @type variable
 * @default 0
 *
 * @param Difficulty Level
 * @parent ---Game Variables---
 * @desc Difficulty level (1=Easy, 2=Normal, 3=Hard). Drives meter speed and CPU skill.
 * @type number
 * @min 1
 * @max 3
 * @default 2
 *
 * @command startBowlingGame
 * @text Start Bowling Game
 * @desc Opens the 3D bowling minigame.
 */

(() => {
    'use strict';

    const pluginName = "BowlingMinigame";
    const params = PluginManager.parameters(pluginName);

    const num = (key, def) => {
        const v = parseFloat(params[key]);
        return isFinite(v) ? v : def;
    };

    const BALL_MASS = num('Ball Mass', 6.35);
    const PIN_MASS = num('Pin Mass', 1.53);
    const LANE_FRICTION = num('Lane Friction', 0.06);
    const PIN_BOUNCE = num('Pin Bounce', 0.40);
    const MAX_SPIN_RATE = num('Max Spin Rate', 6.0);
    const DIFFICULTY = Math.max(1, Math.min(3, Math.round(num('Difficulty Level', 2))));

    const se = (key, def, volume) => ({
        name: params[key] || def, volume: volume || 90, pitch: 100, pan: 0
    });
    const rollSound = se('Roll Sound', 'Earth3', 70);
    const pinHitSound = se('Pin Hit Sound', 'wood_03', 90);
    const strikeSound = se('Strike Sound', 'Applause1', 100);
    const spareSound = se('Spare Sound', 'Bell2', 100);
    const gutterSound = se('Gutter Sound', 'Buzzer1', 80);
    const gameResultVariable = parseInt(params['Game Result Variable'], 10) || 0;

    // Forward declaration: the scene class is defined near the bottom, the
    // plugin command needs the binding to exist now.
    let Scene_BowlingMinigame;

    PluginManager.registerCommand(pluginName, "startBowlingGame", () => {
        SceneManager.push(Scene_BowlingMinigame);
    });

    //=========================================================================
    // Alley dimensions (metres). The bowler stands at negative z and the ball
    // travels toward +z; x is across the lane with 0 at the centre line.
    //=========================================================================
    const LANE_HALF = 0.5334;          // half of the 1.0668 m lane
    const GUTTER_W = 0.2286;
    const GUTTER_Y = -0.13;            // gutter channel floor, deep enough that
                                       // a channelled ball rides under the pins
    const FOUL_Z = 0;
    const HEAD_PIN_Z = 18.29;
    const PIN_SPACING = 0.3048;        // 12 inch centres
    const ROW_SPACING = PIN_SPACING * Math.cos(Math.PI / 6);
    const DECK_END_Z = HEAD_PIN_Z + ROW_SPACING * 3 + 0.42;
    const PIT_Y = -1.0;
    const APPROACH_Z = -4.6;
    const ARROWS_Z = 4.57;             // targeting darts, 15 feet out

    const BALL_R = 0.108;
    const PIN_HEIGHT = 0.381;
    const PIN_COM_Y = 0.185;           // centre of mass above the base
    const PIN_CAP_LO = -0.127;         // capsule segment, body space
    const PIN_CAP_HI = 0.115;
    const PIN_CAP_R = 0.055;
    const PIN_BASE_R = 0.026;

    const GRAVITY = { x: 0, y: -9.81, z: 0 };

    // Everything 3D here is built and rendered through the player's own retro
    // settings, dialled DOWN from the global default: lacquered wood and ten
    // white pins want a clean image, and the period flavour is carried by the
    // deco HUD. The tunables are scaled rather than replaced, so switching the
    // shader off in the options still switches it off here.
    const PSX_SOFTEN = { vertexSnap: 1.5, colorLevels: 1.3, dither: 0.6, downscale: 1 };

    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    // How far a full-hook ball drags sideways over the length of the lane,
    // measured from the simulation itself. Only the CPU needs the number, to
    // aim off the curve; the player is expected to learn it by throwing gutter
    // balls like everyone else.
    const HOOK_DRIFT = 0.42;

    // Rolling and air resistance, per second. Without this a toppled pin is a
    // frictionless cylinder and rolls across the deck until the clock runs out.
    const PIN_LINEAR_DAMPING = 1.2;
    const PIN_ANGULAR_DAMPING = 2.0;
    const BALL_DAMPING = 0.05;

    // Standard 4-3-2-1 rack, indexed 0..9 == pins 1..10.
    function pinSpots() {
        const s = PIN_SPACING;
        return [
            { x: 0, z: HEAD_PIN_Z },
            { x: -s * 0.5, z: HEAD_PIN_Z + ROW_SPACING },
            { x: s * 0.5, z: HEAD_PIN_Z + ROW_SPACING },
            { x: -s, z: HEAD_PIN_Z + ROW_SPACING * 2 },
            { x: 0, z: HEAD_PIN_Z + ROW_SPACING * 2 },
            { x: s, z: HEAD_PIN_Z + ROW_SPACING * 2 },
            { x: -s * 1.5, z: HEAD_PIN_Z + ROW_SPACING * 3 },
            { x: -s * 0.5, z: HEAD_PIN_Z + ROW_SPACING * 3 },
            { x: s * 0.5, z: HEAD_PIN_Z + ROW_SPACING * 3 },
            { x: s * 1.5, z: HEAD_PIN_Z + ROW_SPACING * 3 }
        ];
    }

    //=========================================================================
    // Vector / quaternion helpers. Plain objects keep the physics readable and
    // independent of whether three.js has finished loading.
    //=========================================================================
    const V = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });
    const vadd = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
    const vsub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
    const vmul = (a, s) => V(a.x * s, a.y * s, a.z * s);
    const vmad = (a, b, s) => V(a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
    const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const vcross = (a, b) => V(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
    const vlen = (a) => Math.sqrt(vdot(a, a));

    // Rotate a vector by a quaternion: v + 2w(q x v) + 2(q x (q x v)).
    function qrot(q, v) {
        const t = vmul(vcross(V(q.x, q.y, q.z), v), 2);
        return vadd(vadd(v, vmul(t, q.w)), vcross(V(q.x, q.y, q.z), t));
    }

    function qnormalize(q) {
        const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
        q.x /= l; q.y /= l; q.z /= l; q.w /= l;
        return q;
    }

    // Closest points between two segments, used for pin-on-pin contacts.
    function closestSegmentPoints(p1, q1, p2, q2) {
        const d1 = vsub(q1, p1);
        const d2 = vsub(q2, p2);
        const r = vsub(p1, p2);
        const a = vdot(d1, d1);
        const e = vdot(d2, d2);
        const f = vdot(d2, r);
        let s, t;
        if (a < 1e-9 && e < 1e-9) return { s: 0, t: 0, a: p1, b: p2 };
        if (a < 1e-9) {
            s = 0;
            t = Math.max(0, Math.min(1, f / e));
        } else {
            const c = vdot(d1, r);
            if (e < 1e-9) {
                t = 0;
                s = Math.max(0, Math.min(1, -c / a));
            } else {
                const b = vdot(d1, d2);
                const denom = a * e - b * b;
                s = denom > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
                t = (b * s + f) / e;
                if (t < 0) {
                    t = 0;
                    s = Math.max(0, Math.min(1, -c / a));
                } else if (t > 1) {
                    t = 1;
                    s = Math.max(0, Math.min(1, (b - c) / a));
                }
            }
        }
        return { s, t, a: vmad(p1, d1, s), b: vmad(p2, d2, t) };
    }

    // Closest point on a segment to a point, used for ball-on-pin contacts.
    function closestPointOnSegment(p, a, b) {
        const ab = vsub(b, a);
        const denom = vdot(ab, ab);
        if (denom < 1e-9) return a;
        const t = Math.max(0, Math.min(1, vdot(vsub(p, a), ab) / denom));
        return vmad(a, ab, t);
    }

    //=========================================================================
    // Body - a rigid body with a scalar (isotropic) inertia. A full inertia
    // tensor buys very little for pins and a sphere, and the scalar version
    // keeps the solver frame-independent and cheap.
    //=========================================================================
    class Body {
        constructor(mass, inertia, kind) {
            this.kind = kind;
            this.p = V(0, 0, 0);
            this.v = V(0, 0, 0);
            this.q = { x: 0, y: 0, z: 0, w: 1 };
            this.w = V(0, 0, 0);
            this.mass = mass;
            this.invMass = mass > 0 ? 1 / mass : 0;
            this.invI = inertia > 0 ? 1 / inertia : 0;
            this.active = true;
            this.asleep = false;
        }

        reset(x, y, z) {
            this.p = V(x, y, z);
            this.v = V(0, 0, 0);
            this.w = V(0, 0, 0);
            this.q = { x: 0, y: 0, z: 0, w: 1 };
            this.active = true;
            this.asleep = false;
        }

        velAt(point) {
            return vadd(this.v, vcross(this.w, vsub(point, this.p)));
        }

        applyImpulse(J, point) {
            if (!this.invMass) return;
            this.v = vmad(this.v, J, this.invMass);
            this.w = vmad(this.w, vcross(vsub(point, this.p), J), this.invI);
        }

        toWorld(local) {
            return vadd(this.p, qrot(this.q, local));
        }

        upAxis() {
            return qrot(this.q, V(0, 1, 0));
        }

        integrateVelocity(dt) {
            this.v = vmad(this.v, GRAVITY, dt);
            if (this.damping) {
                this.v = vmul(this.v, Math.max(0, 1 - this.damping * dt));
                this.w = vmul(this.w, Math.max(0, 1 - this.angularDamping * dt));
            }
        }

        integratePosition(dt) {
            this.p = vmad(this.p, this.v, dt);
            const q = this.q;
            const w = this.w;
            const hx = 0.5 * dt;
            const dx = (w.x * q.w + w.y * q.z - w.z * q.y) * hx;
            const dy = (w.y * q.w + w.z * q.x - w.x * q.z) * hx;
            const dz = (w.z * q.w + w.x * q.y - w.y * q.x) * hx;
            const dw = (-w.x * q.x - w.y * q.y - w.z * q.z) * hx;
            q.x += dx; q.y += dy; q.z += dz; q.w += dw;
            qnormalize(q);
        }

        speed() {
            return vlen(this.v) + vlen(this.w) * 0.15;
        }
    }

    //=========================================================================
    // BowlWorld - the sequential-impulse solver and the alley collision
    // geometry. Contacts are rebuilt each substep and relaxed over a handful
    // of iterations, which is plenty for eleven bodies.
    //=========================================================================
    const SUBSTEPS = 4;
    const SOLVER_ITERATIONS = 6;

    class BowlWorld {
        constructor() {
            const ballInertia = 0.4 * BALL_MASS * BALL_R * BALL_R;
            const pinSpan = PIN_CAP_HI - PIN_CAP_LO;
            const pinInertia = PIN_MASS * (3 * PIN_CAP_R * PIN_CAP_R + pinSpan * pinSpan) / 12;

            this.ball = new Body(BALL_MASS, ballInertia, 'ball');
            this.ball.active = false;
            this.ball.damping = BALL_DAMPING;
            this.ball.angularDamping = BALL_DAMPING;
            this.pins = [];
            for (let i = 0; i < 10; i++) {
                const pin = new Body(PIN_MASS, pinInertia, 'pin');
                pin.index = i;
                pin.active = false;
                pin.spot = null;
                pin.damping = PIN_LINEAR_DAMPING;
                pin.angularDamping = PIN_ANGULAR_DAMPING;
                this.pins.push(pin);
            }
            this.bodies = [this.ball].concat(this.pins);

            // Per-step reporting the scene turns into sound and camera shake.
            this.events = { pinHits: 0, ballHits: 0, wallHits: 0, impact: 0 };
            this.ballInGutter = false;
        }

        // Height of whatever surface is under a given point.
        surfaceY(x, z) {
            if (z > DECK_END_Z) return PIT_Y;
            if (Math.abs(x) <= LANE_HALF) return 0;
            if (Math.abs(x) <= LANE_HALF + GUTTER_W) return GUTTER_Y;
            return PIT_Y;
        }

        standPin(i, spot) {
            const pin = this.pins[i];
            pin.reset(spot.x, PIN_COM_Y, spot.z);
            pin.spot = { x: spot.x, z: spot.z };
            pin.active = true;
            pin.asleep = false;
        }

        removePin(i) {
            this.pins[i].active = false;
        }

        launchBall(x, z, dir, speed, spin) {
            const b = this.ball;
            b.reset(x, BALL_R, z);
            b.v = V(Math.sin(dir) * speed, 0, Math.cos(dir) * speed);
            // Forward roll about the lateral axis, plus a tilted component that
            // makes the contact patch slip sideways. That slip, not a fudge
            // factor, is what curves the ball.
            b.w = V(
                Math.cos(dir) * speed / BALL_R,
                spin * MAX_SPIN_RATE * 1.6,
                spin * MAX_SPIN_RATE
            );
            b.active = true;
            this.ballInGutter = false;
        }

        step(dt) {
            this.events.pinHits = 0;
            this.events.ballHits = 0;
            this.events.wallHits = 0;
            this.events.impact = 0;
            const h = dt / SUBSTEPS;
            for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
        }

        substep(dt) {
            for (const b of this.bodies) {
                if (b.active && !b.asleep) b.integrateVelocity(dt);
            }

            const contacts = [];
            this.collectContacts(contacts);

            for (let it = 0; it < SOLVER_ITERATIONS; it++) {
                for (const c of contacts) this.solveContact(c, it === 0);
            }
            for (const c of contacts) this.correctPosition(c);

            for (const b of this.bodies) {
                if (b.active && !b.asleep) b.integratePosition(dt);
            }

            this.applyBounds();
        }

        //--- contact generation -------------------------------------------

        collectContacts(out) {
            const ball = this.ball;
            if (ball.active) {
                this.ballFloorContacts(out);
                // A channelled ball rides below deck level and is out of the
                // running: it must not clip the corner pin on its way past.
                if (!this.ballInGutter) {
                    for (const pin of this.pins) {
                        if (pin.active) this.ballPinContact(ball, pin, out);
                    }
                }
            }
            for (let i = 0; i < this.pins.length; i++) {
                const a = this.pins[i];
                if (!a.active) continue;
                this.pinFloorContacts(a, out);
                for (let j = i + 1; j < this.pins.length; j++) {
                    const b = this.pins[j];
                    if (b.active) this.pinPinContact(a, b, out);
                }
            }
        }

        ballFloorContacts(out) {
            const b = this.ball;
            const floor = this.surfaceY(b.p.x, b.p.z);
            const pen = floor + BALL_R - b.p.y;
            if (pen > 0) {
                out.push({
                    a: null, b: b,
                    n: V(0, 1, 0),
                    point: V(b.p.x, floor, b.p.z),
                    pen: pen,
                    e: 0.16,
                    mu: this.ballInGutter ? 0.22 : LANE_FRICTION
                });
            }
        }

        ballPinContact(ball, pin, out) {
            const a = pin.toWorld(V(0, PIN_CAP_LO, 0));
            const b = pin.toWorld(V(0, PIN_CAP_HI, 0));
            const cp = closestPointOnSegment(ball.p, a, b);
            const delta = vsub(cp, ball.p);
            const dist = vlen(delta);
            const minDist = BALL_R + PIN_CAP_R;
            if (dist >= minDist) return;
            const n = dist > 1e-6 ? vmul(delta, 1 / dist) : V(0, 0, 1);
            const point = vmad(ball.p, n, BALL_R);
            const rel = vlen(vsub(pin.velAt(point), ball.velAt(point)));
            if (rel > 1.2) {
                this.events.ballHits++;
                this.events.impact = Math.max(this.events.impact, rel);
            }
            out.push({
                a: ball, b: pin, n: n, point: point,
                pen: minDist - dist, e: 0.52, mu: 0.16
            });
        }

        pinPinContact(pa, pb, out) {
            const a0 = pa.toWorld(V(0, PIN_CAP_LO, 0));
            const a1 = pa.toWorld(V(0, PIN_CAP_HI, 0));
            const b0 = pb.toWorld(V(0, PIN_CAP_LO, 0));
            const b1 = pb.toWorld(V(0, PIN_CAP_HI, 0));
            const cp = closestSegmentPoints(a0, a1, b0, b1);
            const delta = vsub(cp.b, cp.a);
            const dist = vlen(delta);
            const minDist = PIN_CAP_R * 2;
            if (dist >= minDist) return;
            const n = dist > 1e-6 ? vmul(delta, 1 / dist) : V(0, 0, 1);
            const point = vmul(vadd(cp.a, cp.b), 0.5);
            const rel = vlen(vsub(pb.velAt(point), pa.velAt(point)));
            if (rel > 0.9) {
                this.events.pinHits++;
                this.events.impact = Math.max(this.events.impact, rel);
            }
            out.push({
                a: pa, b: pb, n: n, point: point,
                pen: minDist - dist, e: PIN_BOUNCE, mu: 0.2
            });
        }

        // A pin touches the floor through a small ring of support points around
        // its base (so a standing pin has a real support polygon instead of
        // balancing on a single point) plus samples along its capsule (so a
        // toppled pin lies down and rolls).
        pinFloorContacts(pin, out) {
            const ring = 4;
            for (let i = 0; i < ring; i++) {
                const ang = (i / ring) * Math.PI * 2;
                const local = V(Math.cos(ang) * PIN_BASE_R, -PIN_COM_Y, Math.sin(ang) * PIN_BASE_R);
                const wp = pin.toWorld(local);
                const floor = this.surfaceY(wp.x, wp.z);
                const pen = floor - wp.y;
                if (pen > 0) {
                    out.push({
                        a: null, b: pin, n: V(0, 1, 0),
                        point: V(wp.x, floor, wp.z),
                        pen: pen, e: 0.05, mu: 0.45
                    });
                }
            }
            const samples = 5;
            for (let i = 0; i < samples; i++) {
                const t = i / (samples - 1);
                const y = PIN_CAP_LO + (PIN_CAP_HI - PIN_CAP_LO) * t;
                const wp = pin.toWorld(V(0, y, 0));
                const floor = this.surfaceY(wp.x, wp.z);
                const pen = floor + PIN_CAP_R - wp.y;
                if (pen > 0) {
                    out.push({
                        a: null, b: pin, n: V(0, 1, 0),
                        point: V(wp.x, floor, wp.z),
                        pen: pen, e: 0.18, mu: 0.42
                    });
                }
            }
        }

        //--- solver --------------------------------------------------------

        effectiveMass(body, r, n) {
            if (!body) return 0;
            const rn = vcross(r, n);
            return body.invMass + body.invI * vdot(rn, rn);
        }

        solveContact(c, allowRestitution) {
            const A = c.a, B = c.b;
            const rA = A ? vsub(c.point, A.p) : V(0, 0, 0);
            const rB = B ? vsub(c.point, B.p) : V(0, 0, 0);
            const vA = A ? A.velAt(c.point) : V(0, 0, 0);
            const vB = B ? B.velAt(c.point) : V(0, 0, 0);
            const vrel = vsub(vB, vA);
            const vn = vdot(vrel, c.n);
            if (vn > 0) return;

            const k = this.effectiveMass(A, rA, c.n) + this.effectiveMass(B, rB, c.n);
            if (k < 1e-9) return;

            // Only bounce on the first pass; later iterations just remove the
            // remaining approach velocity so resting stacks settle quietly.
            const e = allowRestitution && vn < -0.35 ? c.e : 0;
            const j = -(1 + e) * vn / k;
            const J = vmul(c.n, j);
            if (A) A.applyImpulse(vmul(J, -1), c.point);
            if (B) B.applyImpulse(J, c.point);

            // Coulomb friction along the tangential slip direction. On the ball
            // this is what turns spin into a hook and eventually into rolling.
            const vt = vsub(vrel, vmul(c.n, vn));
            const vtLen = vlen(vt);
            if (vtLen < 1e-5) return;
            const t = vmul(vt, 1 / vtLen);
            const kt = this.effectiveMass(A, rA, t) + this.effectiveMass(B, rB, t);
            if (kt < 1e-9) return;
            let jt = -vtLen / kt;
            const limit = c.mu * Math.abs(j);
            jt = Math.max(-limit, Math.min(limit, jt));
            const Jt = vmul(t, jt);
            if (A) A.applyImpulse(vmul(Jt, -1), c.point);
            if (B) B.applyImpulse(Jt, c.point);
        }

        correctPosition(c) {
            const slop = 0.0008;
            const pen = c.pen - slop;
            if (pen <= 0) return;
            const invA = c.a ? c.a.invMass : 0;
            const invB = c.b ? c.b.invMass : 0;
            const total = invA + invB;
            if (total < 1e-9) return;
            const corr = vmul(c.n, (pen * 0.55) / total);
            if (c.a) c.a.p = vmad(c.a.p, corr, -invA);
            if (c.b) c.b.p = vmad(c.b.p, corr, invB);
        }

        //--- world bounds ---------------------------------------------------

        applyBounds() {
            const outerWall = LANE_HALF + GUTTER_W;

            const ball = this.ball;
            if (ball.active) {
                if (!this.ballInGutter && Math.abs(ball.p.x) > LANE_HALF - BALL_R * 0.45) {
                    this.ballInGutter = true;
                }
                // Once in the channel the ball is trapped between the lane edge
                // and the outer wall and can never climb back onto the lane.
                if (this.ballInGutter) {
                    const side = Math.sign(ball.p.x) || 1;
                    const lo = LANE_HALF + BALL_R * 0.6;
                    const hi = outerWall - BALL_R * 0.6;
                    const clamped = Math.max(lo, Math.min(hi, Math.abs(ball.p.x)));
                    ball.p.x = side * clamped;
                    ball.v.x *= 0.2;
                    ball.v.z *= 0.999;
                }
                if (ball.p.z > DECK_END_Z + 0.8 || ball.p.y < PIT_Y + 0.2) {
                    ball.active = false;
                }
            }

            for (const pin of this.pins) {
                if (!pin.active) continue;
                // Kickback walls flanking the deck: pins ricochet off them.
                const limit = outerWall - PIN_CAP_R;
                if (Math.abs(pin.p.x) > limit) {
                    const side = Math.sign(pin.p.x);
                    pin.p.x = side * limit;
                    if (Math.sign(pin.v.x) === side) {
                        pin.v.x *= -0.45;
                        this.events.wallHits++;
                    }
                }
                if (pin.p.y < PIT_Y + 0.3 || pin.p.z > DECK_END_Z + 1.2) {
                    pin.active = false;
                }
            }
        }

        //--- state queries --------------------------------------------------

        // A pin counts as down when it is tipped past 45 degrees, has been
        // pushed clear of its spot, or has left the deck entirely.
        isPinDown(i) {
            const pin = this.pins[i];
            if (!pin.active) return true;
            if (pin.upAxis().y < 0.72) return true;
            if (pin.p.y < PIN_COM_Y * 0.55) return true;
            if (pin.spot) {
                const dx = pin.p.x - pin.spot.x;
                const dz = pin.p.z - pin.spot.z;
                if (Math.sqrt(dx * dx + dz * dz) > 0.09) return true;
            }
            return false;
        }

        // The roll is over once nothing can still happen: the ball has either
        // left the deck or given up short of it, and every pin has stopped.
        settled() {
            const b = this.ball;
            if (b.active && b.p.z < DECK_END_Z && b.speed() > 0.3) return false;
            for (const pin of this.pins) {
                if (pin.active && pin.speed() > 0.12) return false;
            }
            return true;
        }
    }

    //=========================================================================
    // Deterministic RNG so the alley's wood grain and neon look identical for
    // a given world, the way the rest of the project seeds its procedural art.
    //=========================================================================
    function worldSeed() {
        try {
            if (window.HistoryManager && window.HistoryManager.getSeed) {
                return window.HistoryManager.getSeed() >>> 0;
            }
        } catch (e) { /* fall through to the default */ }
        return 19002001;
    }

    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    //=========================================================================
    // Alley3D - the three.js stage. Renders to its own small canvas which the
    // scene composites as a PIXI sprite, the same approach the tournament and
    // battle scenes use.
    //=========================================================================
    const CAM_AIM = 'aim';
    const CAM_FOLLOW = 'follow';
    const CAM_DECK = 'deck';
    const CAM_RESULT = 'result';

    class Alley3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed());
            this._shake = 0;
            this._camMode = CAM_AIM;
            this._camPos = V(0, 1.35, -2.4);
            this._camLook = V(0, 0.5, 8);
            this._pinMeshes = [];
            this._disposables = [];

            this._initThree();
            softPSX(() => {
                this._buildAlley();
                this._buildPins();
                this._buildBall();
                this._buildRake();
                this._buildAimGuide();
            });
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }
        get width() { return this._w; }
        get height() { return this._h; }

        _initThree() {
            this.scene = new THREE.Scene();
            const fogColor = 0x0b0a14;
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.Fog(fogColor, 14, 34);

            this.camera = new THREE.PerspectiveCamera(58, this._w / this._h, 0.05, 80);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(fogColor, 1);

            this.scene.add(new THREE.AmbientLight(0xb8c4ff, 0.55));

            const key = new THREE.DirectionalLight(0xfff3d8, 0.85);
            key.position.set(2.5, 8, -4);
            this.scene.add(key);

            const deck = new THREE.PointLight(0xffe9c0, 1.5, 12, 2);
            deck.position.set(0, 2.6, HEAD_PIN_Z + 0.6);
            this.scene.add(deck);

            const rim = new THREE.PointLight(0x7a5cff, 0.9, 14, 2);
            rim.position.set(-1.6, 2.2, 4);
            this.scene.add(rim);
        }

        _track(obj) {
            this._disposables.push(obj);
            return obj;
        }

        _mat(options) {
            const m = new THREE.MeshLambertMaterial(options);
            this._disposables.push(m);
            return m;
        }

        _geo(g) {
            this._disposables.push(g);
            return g;
        }

        //--- procedural textures -------------------------------------------

        _canvasTexture(w, h, draw, repeatX, repeatY) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            draw(canvas.getContext('2d'), w, h);
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            if (repeatX || repeatY) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeatX || 1, repeatY || 1);
            }
            this._disposables.push(tex);
            return tex;
        }

        _woodTexture(base, plank) {
            const rand = this._rand;
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, w, h);
                for (let x = 0; x < w; x += 8) {
                    ctx.fillStyle = plank;
                    ctx.fillRect(x, 0, 1, h);
                }
                for (let i = 0; i < 120; i++) {
                    const gx = Math.floor(rand() * w);
                    const gy = Math.floor(rand() * h);
                    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,220,170,0.08)';
                    ctx.fillRect(gx, gy, 1 + Math.floor(rand() * 3), 1);
                }
            }, 3, 40);
        }

        _pinTexture() {
            return this._canvasTexture(32, 64, (ctx, w, h) => {
                ctx.fillStyle = '#f2eee2';
                ctx.fillRect(0, 0, w, h);
                // Two neck stripes. The lathe runs v from the base upward and
                // the canvas is flipped, so low canvas rows are high on the pin.
                ctx.fillStyle = '#c8202a';
                ctx.fillRect(0, 12, w, 4);
                ctx.fillRect(0, 19, w, 4);
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.fillRect(0, h - 6, w, 6);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(2, 0, 3, h);
            });
        }

        _ballTexture() {
            const rand = this._rand;
            const hue = Math.floor(rand() * 360);
            return this._canvasTexture(64, 32, (ctx, w, h) => {
                ctx.fillStyle = '#141118';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 5; i++) {
                    ctx.fillStyle = `hsla(${(hue + i * 14) % 360}, 70%, ${28 + i * 6}%, 0.85)`;
                    ctx.beginPath();
                    ctx.ellipse(rand() * w, rand() * h, 6 + rand() * 12, 3 + rand() * 6, rand() * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(14, 8, 2.5, 0, Math.PI * 2);
                ctx.arc(21, 8, 2.5, 0, Math.PI * 2);
                ctx.arc(17.5, 14, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        _signTexture(text) {
            return this._canvasTexture(128, 32, (ctx, w, h) => {
                ctx.fillStyle = '#12091c';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#ff3fa4';
                ctx.font = 'bold 18px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, w / 2, h / 2 + 1);
                ctx.strokeStyle = '#42e8ff';
                ctx.lineWidth = 2;
                ctx.strokeRect(3, 3, w - 6, h - 6);
            });
        }

        //--- geometry -------------------------------------------------------

        _box(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        _buildAlley() {
            const laneLength = DECK_END_Z - APPROACH_Z + 2;
            const laneMidZ = (APPROACH_Z + DECK_END_Z) / 2;

            const laneMat = this._mat({ map: this._woodTexture('#b98c52', '#8d6338') });
            this._box(LANE_HALF * 2, 0.12, laneLength, laneMat, 0, -0.06, laneMidZ);

            // Pin deck is a slightly paler board section.
            const deckMat = this._mat({ map: this._woodTexture('#cfa670', '#a67c46') });
            this._box(LANE_HALF * 2, 0.125, ROW_SPACING * 3 + 1.0,
                deckMat, 0, -0.062, HEAD_PIN_Z + ROW_SPACING * 1.5 + 0.1);

            // Approach, one shade darker than the lane.
            const approachMat = this._mat({ map: this._woodTexture('#8b6337', '#6a4a29') });
            this._box(LANE_HALF * 2 + GUTTER_W * 2, 0.12, 5.2, approachMat, 0, -0.061, APPROACH_Z + 2.4);

            // Foul line.
            this._box(LANE_HALF * 2 + GUTTER_W * 2, 0.005, 0.04,
                this._mat({ color: 0xf0e0a0 }), 0, 0.003, FOUL_Z);

            // Gutter channels.
            const gutterMat = this._mat({ color: 0x1a1522 });
            for (const side of [-1, 1]) {
                const cx = side * (LANE_HALF + GUTTER_W / 2);
                this._box(GUTTER_W, 0.10, laneLength, gutterMat, cx, GUTTER_Y - 0.05, laneMidZ);
                // Outer kickback wall.
                this._box(0.06, 0.55, laneLength, this._mat({ color: 0x2b2136 }),
                    side * (LANE_HALF + GUTTER_W + 0.03), 0.2, laneMidZ);
            }

            // Targeting arrows.
            const arrowMat = this._mat({ color: 0x2a1c10 });
            for (let i = -3; i <= 3; i++) {
                const geo = this._geo(new THREE.ConeGeometry(0.035, 0.16, 3));
                const arrow = new THREE.Mesh(geo, arrowMat);
                arrow.rotation.x = -Math.PI / 2;
                arrow.position.set(i * 0.1066, 0.004, ARROWS_Z + Math.abs(i) * 0.32);
                this.scene.add(arrow);
            }

            // Pit behind the deck, plus the masking unit above it.
            this._box(LANE_HALF * 2 + GUTTER_W * 2, 0.1, 1.6,
                this._mat({ color: 0x0b0810 }), 0, PIT_Y, DECK_END_Z + 0.8);
            this._box(LANE_HALF * 2 + GUTTER_W * 2 + 0.4, 2.4, 0.16,
                this._mat({ color: 0x241a33 }), 0, 1.5, DECK_END_Z + 1.5);
            this._box(1.5, 0.38, 0.05,
                this._mat({ map: this._signTexture('HYPER BOWL'), emissive: 0x552244 }),
                0, 1.35, DECK_END_Z + 1.4);

            // Neighbouring lanes for depth, each with a decorative rack.
            const neighbourMat = this._mat({ map: this._woodTexture('#7d5c36', '#5d4325') });
            for (const side of [-1, 1]) {
                const ox = side * (LANE_HALF * 2 + GUTTER_W * 2 + 0.5);
                this._box(LANE_HALF * 2, 0.12, laneLength, neighbourMat, ox, -0.07, laneMidZ);
                this._box(LANE_HALF * 2 + 0.4, 2.4, 0.16,
                    this._mat({ color: 0x1e1730 }), ox, 1.5, DECK_END_Z + 1.5);
            }

            // Side walls and ceiling with a run of light panels.
            const wallMat = this._mat({ color: 0x171126 });
            for (const side of [-1, 1]) {
                this._box(0.2, 4, laneLength + 6,
                    wallMat, side * 4.4, 1.8, laneMidZ);
            }
            this._box(9.2, 0.2, laneLength + 6, this._mat({ color: 0x0e0a18 }), 0, 3.6, laneMidZ);
            const panelMat = this._mat({ color: 0x2a2440, emissive: 0x6a5aa8 });
            for (let z = APPROACH_Z; z < DECK_END_Z + 2; z += 3.2) {
                this._box(3.4, 0.06, 0.5, panelMat, 0, 3.44, z);
            }

            // Ball return rack on the right of the approach.
            this._box(0.45, 0.55, 1.4, this._mat({ color: 0x352a48 }),
                LANE_HALF + GUTTER_W + 0.45, 0.28, APPROACH_Z + 1.6);

            if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
        }

        _pinGeometry() {
            // Real pin silhouette, eight radial segments for the PSX look.
            const profile = [
                [0.000, 0.000], [0.028, 0.000], [0.030, 0.018], [0.027, 0.050],
                [0.034, 0.085], [0.048, 0.130], [0.058, 0.170], [0.055, 0.200],
                [0.040, 0.240], [0.027, 0.275], [0.023, 0.300], [0.028, 0.325],
                [0.034, 0.345], [0.030, 0.368], [0.000, PIN_HEIGHT]
            ];
            const points = profile.map(p => new THREE.Vector2(p[0], p[1] - PIN_COM_Y));
            return this._geo(new THREE.LatheGeometry(points, 8));
        }

        _buildPins() {
            const geo = this._pinGeometry();
            const mat = this._mat({ map: this._pinTexture() });
            const spots = pinSpots();
            for (let i = 0; i < 10; i++) {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(spots[i].x, PIN_COM_Y, spots[i].z);
                this.scene.add(mesh);
                this._pinMeshes.push(mesh);
            }
            // Decorative racks on the neighbouring lanes.
            for (const side of [-1, 1]) {
                const ox = side * (LANE_HALF * 2 + GUTTER_W * 2 + 0.5);
                for (const spot of spots) {
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(ox + spot.x, PIN_COM_Y - 0.01, spot.z);
                    this.scene.add(mesh);
                }
            }
            if (window.PSXShader) {
                this._pinMeshes.forEach(m => window.PSXShader.applyToObject(m));
            }
        }

        _buildBall() {
            const geo = this._geo(new THREE.SphereGeometry(BALL_R, 10, 7));
            const mat = this._mat({ map: this._ballTexture() });
            this._ballMesh = new THREE.Mesh(geo, mat);
            this._ballMesh.position.set(0, BALL_R, 0);
            this.scene.add(this._ballMesh);
            if (window.PSXShader) window.PSXShader.applyToObject(this._ballMesh);
        }

        _buildRake() {
            const g = new THREE.Group();
            this._box(LANE_HALF * 2, 0.22, 0.06, this._mat({ color: 0x3d3350 }), 0, 0.11, 0, g);
            this._box(0.06, 0.9, 0.06, this._mat({ color: 0x2a2340 }), -LANE_HALF, 0.6, 0, g);
            this._box(0.06, 0.9, 0.06, this._mat({ color: 0x2a2340 }), LANE_HALF, 0.6, 0, g);
            g.position.set(0, 1.9, HEAD_PIN_Z - 0.35);
            g.visible = false;
            this.scene.add(g);
            this._rake = g;
            if (window.PSXShader) window.PSXShader.applyToObject(g);
        }

        _buildAimGuide() {
            const g = new THREE.Group();
            const line = this._box(0.03, 0.004, 9, this._mat({ color: 0x59f2ff, emissive: 0x1a6a75 }), 0, 0.006, 4.5, g);
            line.material.transparent = true;
            line.material.opacity = 0.75;
            this.scene.add(g);
            this._aimGuide = g;
        }

        //--- per-frame sync --------------------------------------------------

        syncBodies(world) {
            for (let i = 0; i < 10; i++) {
                const pin = world.pins[i];
                const mesh = this._pinMeshes[i];
                mesh.visible = pin.active;
                if (!pin.active) continue;
                mesh.position.set(pin.p.x, pin.p.y, pin.p.z);
                mesh.quaternion.set(pin.q.x, pin.q.y, pin.q.z, pin.q.w);
            }
            const ball = world.ball;
            this._ballMesh.visible = ball.active;
            if (ball.active) {
                this._ballMesh.position.set(ball.p.x, ball.p.y, ball.p.z);
                this._ballMesh.quaternion.set(ball.q.x, ball.q.y, ball.q.z, ball.q.w);
            }
        }

        setHeldBall(x, z, y) {
            this._ballMesh.visible = true;
            this._ballMesh.position.set(x, y, z);
        }

        setAimGuide(x, dir, visible) {
            this._aimGuide.visible = visible;
            this._aimGuide.position.set(x, 0, FOUL_Z);
            this._aimGuide.rotation.y = -dir;
        }

        setRake(progress) {
            // progress 0..1 drives the whole sweep cycle: drop, sweep, lift.
            if (progress <= 0 || progress >= 1) {
                this._rake.visible = false;
                return;
            }
            this._rake.visible = true;
            let y, z;
            if (progress < 0.25) {
                const t = progress / 0.25;
                y = 1.9 - 1.85 * t;
                z = HEAD_PIN_Z - 0.35;
            } else if (progress < 0.7) {
                const t = (progress - 0.25) / 0.45;
                y = 0.05;
                z = HEAD_PIN_Z - 0.35 + (DECK_END_Z + 0.4 - (HEAD_PIN_Z - 0.35)) * t;
            } else {
                const t = (progress - 0.7) / 0.3;
                y = 0.05 + 1.85 * t;
                z = DECK_END_Z + 0.4;
            }
            this._rake.position.set(0, y, z);
        }

        rakeZ() {
            return this._rake.position.z;
        }

        shake(amount) {
            this._shake = Math.min(0.5, this._shake + amount);
        }

        setCameraMode(mode) {
            this._camMode = mode;
        }

        // Camera targets per phase, eased toward each frame. The deck cut is the
        // whole reason to build this in 3D, so it gets a low dramatic angle.
        updateCamera(dt, world, aimX, aimDir) {
            let target, look, lerp;
            switch (this._camMode) {
                case CAM_FOLLOW: {
                    const b = world && world.ball.active ? world.ball.p : V(aimX || 0, BALL_R, 0);
                    target = V(b.x * 0.55, 1.05, b.z - 3.1);
                    look = V(b.x * 0.8, 0.35, b.z + 5.5);
                    lerp = 0.14;
                    break;
                }
                case CAM_DECK:
                    target = V(1.15, 0.78, DECK_END_Z + 0.85);
                    look = V(0, 0.28, HEAD_PIN_Z + ROW_SPACING);
                    lerp = 0.09;
                    break;
                case CAM_RESULT:
                    target = V(0, 2.5, HEAD_PIN_Z - 2.6);
                    look = V(0, 0.2, HEAD_PIN_Z + ROW_SPACING * 1.5);
                    lerp = 0.06;
                    break;
                default: {
                    const ax = aimX || 0;
                    target = V(ax * 0.6, 1.42, APPROACH_Z + 0.35);
                    look = V(ax + Math.sin(aimDir || 0) * 8, 0.55, 8.5);
                    lerp = 0.12;
                    break;
                }
            }
            const k = 1 - Math.pow(1 - lerp, Math.max(0.2, dt * 60));
            this._camPos = vadd(this._camPos, vmul(vsub(target, this._camPos), k));
            this._camLook = vadd(this._camLook, vmul(vsub(look, this._camLook), k));

            this._shake = Math.max(0, this._shake - dt * 1.6);
            const s = this._shake;
            this.camera.position.set(
                this._camPos.x + (Math.random() - 0.5) * s * 0.16,
                this._camPos.y + (Math.random() - 0.5) * s * 0.16,
                this._camPos.z
            );
            this.camera.lookAt(this._camLook.x, this._camLook.y, this._camLook.z);
            // The right stick swings the shot the game just picked around the
            // point it is looking at, and lets it go again when the stick is
            // released. One object does that in every 3D game (window.Controller),
            // so the speed and the inverted Y are the player's setting, once.
            this._padOrbit(dt);
        }

        // Made on first use: a scene built before the controller layer had a
        // chance to load would otherwise never get one.
        _padOrbit(dt) {
            if (!this._orbit && window.Controller) this._orbit = window.Controller.orbit({});
            if (!this._orbit) return;
            this._orbit.update(dt);
            this._orbit.applyTo(this.camera, this._camLook);
        }

        render() {
            if (window.PSXShader) {
                softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            for (const item of this._disposables) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._disposables = [];
            if (this.renderer) {
                if (window.PSXShader && window.PSXShader.disposeContext) {
                    window.PSXShader.disposeContext(this.renderer);
                }
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
                this.renderer = null;
            }
        }
    }

    //=========================================================================
    // Scoring. Frames hold the raw pin counts of each roll; the bonus lookup
    // walks forward through later frames so strikes and spares only score once
    // their fill balls exist.
    //=========================================================================
    function emptyCard() {
        return Array.from({ length: 10 }, () => []);
    }

    function bonusRolls(frames, frameIndex, count) {
        const out = [];
        for (let i = frameIndex + 1; i < 10 && out.length < count; i++) {
            for (const r of frames[i]) {
                out.push(r);
                if (out.length >= count) break;
            }
        }
        return out;
    }

    function tenthNeedsThree(frame) {
        if (frame.length < 2) return frame[0] === 10;
        return frame[0] === 10 || frame[0] + frame[1] === 10;
    }

    // Cumulative score after each frame, or null where it is not yet decidable.
    function cumulativeScores(frames) {
        const out = [];
        let total = 0;
        let stopped = false;
        for (let i = 0; i < 10; i++) {
            const f = frames[i];
            if (stopped || !f.length) { out.push(null); stopped = true; continue; }
            let s = null;
            if (i < 9) {
                if (f[0] === 10) {
                    const b = bonusRolls(frames, i, 2);
                    if (b.length === 2) s = 10 + b[0] + b[1];
                } else if (f.length >= 2) {
                    if (f[0] + f[1] === 10) {
                        const b = bonusRolls(frames, i, 1);
                        if (b.length === 1) s = 10 + b[0];
                    } else {
                        s = f[0] + f[1];
                    }
                }
            } else {
                const need = tenthNeedsThree(f) ? 3 : 2;
                if (f.length >= need) s = f.reduce((a, b) => a + b, 0);
            }
            if (s === null) { out.push(null); stopped = true; continue; }
            total += s;
            out.push(total);
        }
        return out;
    }

    function finalScore(frames) {
        const cum = cumulativeScores(frames);
        for (let i = 9; i >= 0; i--) {
            if (cum[i] !== null) return cum[i];
        }
        return 0;
    }

    //=========================================================================
    // HUD. Every 2D widget here is drawn in a 320-wide virtual framebuffer and
    // upscaled with nearest filtering, the way a PlayStation drew its overlays:
    // an 8px bitmap face, hard one-pixel shadows and gauges built out of
    // discrete blocks. The dressing is art deco, gold on black lacquer, which
    // is what a bowling alley's overhead board looked like before neon: see
    // PSXHud.DECO and the deco* primitives in PSXShader.js.
    //=========================================================================
    const HUD = () => window.PSXHud;
    // 240 virtual scanlines, width derived from the aspect: see PSXHud.BASE_H.
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    // Type on a widget is HTML, not framebuffer pixels: the box, its keylines
    // and its gauges are drawn into the widget's own low-res bitmap, while the
    // lettering goes to a DOM panel pinned to the same sprite and laid out in
    // the same virtual coordinates. An 8px face upscaled three or four times is
    // a staircase; the browser draws it at the display's own resolution.
    // Every handle the scene has handed out, so a moved or rescaled widget can
    // be re-laid out each frame and everything can be torn down at the end.
    let BOWL_DOMS = [];

    function widgetDom(sprite) {
        const H = HUD();
        if (!H || !H.domPanel) return null;
        if (!sprite._dom) {
            sprite._dom = H.domPanel(sprite);
            BOWL_DOMS.push(sprite._dom);
        }
        return sprite._dom;
    }

    function widgetTextBegin(sprite) {
        const dom = widgetDom(sprite);
        if (dom) dom.begin();
    }
    function widgetText(sprite, str, x, y, w, align, color, size, opts) {
        const dom = sprite._dom;
        if (dom) dom.text(str, x, y, w, align, color, size, opts);
        else if (HUD()) HUD().text(sprite.bitmap, str, x, y, w, align, color, size, opts);
    }
    function widgetTextEnd(sprite) {
        if (sprite._dom) sprite._dom.end();
    }

    // A sprite backed by a low-resolution bitmap, positioned in virtual pixels.
    function psxWidget(vw, vh, vx, vy) {
        const bmp = new Bitmap(vw, vh);
        bmp.smooth = false;
        bmp.outlineWidth = 0;
        if (HUD()) bmp.fontFace = HUD().font();
        const sp = new Sprite(bmp);
        const s = hudScale();
        sp.scale.set(s, s);
        sp.x = Math.round((vx || 0) * s);
        sp.y = Math.round((vy || 0) * s);
        return sp;
    }

    //=========================================================================
    // Scoreboard sprite: the overhead monitor of a slightly grubby alley.
    //=========================================================================
    class Sprite_BowlScoreboard extends Sprite {
        constructor() {
            super();
            this._vw = hudW();
            this._vh = 46;
            this.bitmap = new Bitmap(this._vw, this._vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            this.y = 0;
        }

        refresh(playerFrames, cpuFrames, opponentName, activeRow, activeFrame) {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            const w = this._vw;
            bmp.clear();
            widgetTextBegin(this);
            H.decoPanel(bmp, 0, 0, w, this._vh, { hairline: false, step: 1 });

            const labelW = 34;
            const totalW = 26;
            const frameW = Math.floor((w - labelW - totalW - 4) / 10);
            const startX = 2 + labelW;

            // The frame numbers ride a gold band, black on gold, the way an
            // alley's board had them silkscreened.
            bmp.fillRect(2, 1, w - 4, 9, D.gold);
            bmp.fillRect(2, 1, w - 4, 1, D.goldHi);
            for (let i = 0; i < 10; i++) {
                widgetText(this, String(i + 1), startX + i * frameW, -1, frameW, 'center', D.black, 8, { shadow: false });
            }
            widgetText(this, 'TOT', startX + 10 * frameW, -1, totalW, 'center', D.black, 8, { shadow: false });

            this._drawRow("P1", playerFrames, 11, startX, frameW, totalW, activeRow === 0, activeFrame);
            this._drawRow(opponentName, cpuFrames, 28, startX, frameW, totalW, activeRow === 1, activeFrame);
            widgetTextEnd(this);
        }

        _drawRow(name, frames, y, startX, frameW, totalW, active, activeFrame) {
            const H = HUD();
            const bmp = this.bitmap;
            const D = H.DECO;
            widgetText(this, name.slice(0, 6), 5, y + 3, 30, 'left', active ? D.goldHi : D.dim, 8);
            if (active) bmp.fillRect(2, y, 1, 16, D.gold);

            const cum = cumulativeScores(frames);
            for (let i = 0; i < 10; i++) {
                const x = startX + i * frameW;
                const highlight = active && i === activeFrame;
                bmp.fillRect(x, y, frameW - 1, 16, highlight ? D.sel : '#0f0d14');
                bmp.fillRect(x, y, frameW - 1, 1, highlight ? D.goldLo : '#241f14');
                if (highlight) bmp.fillRect(x, y, 1, 16, D.gold);

                const marks = this._marks(frames[i], i);
                const cells = i === 9 ? 3 : 2;
                const cell = Math.floor((frameW - 2) / cells);
                for (let r = 0; r < marks.length; r++) {
                    widgetText(this, marks[r], x + 1 + r * cell, y, cell, 'center', D.ink, 8);
                }
                if (cum[i] !== null) {
                    widgetText(this, String(cum[i]), x, y + 7, frameW - 1, 'center', D.gold, 8);
                }
            }
            widgetText(this, String(finalScore(frames)), startX + 10 * frameW, y + 4, totalW, 'center', D.goldHi, 8);
        }

        // Bowling shorthand: X for a strike, / for a spare, - for a miss.
        _marks(frame, frameIndex) {
            const out = [];
            for (let i = 0; i < frame.length; i++) {
                const v = frame[i];
                if (v === 10) { out.push("X"); continue; }
                const prev = i > 0 ? frame[i - 1] : null;
                const spareBase = frameIndex === 9
                    ? (prev !== null && prev !== 10 ? prev : null)
                    : (i === 1 ? prev : null);
                if (spareBase !== null && spareBase + v === 10) out.push("/");
                else out.push(v === 0 ? "-" : String(v));
            }
            return out;
        }
    }

    //=========================================================================
    // Meters: a vertical power gauge and a centred spin gauge, both styled to
    // match the alley's neon rather than the parchment menus.
    //=========================================================================
    class Sprite_BowlMeter extends Sprite {
        constructor(vx, vy, label, mode) {
            super();
            this._label = label;
            this._mode = mode; // 'power' | 'spin'
            this._value = 0;
            this._vw = 34;
            this._vh = 118;
            this.bitmap = new Bitmap(this._vw, this._vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            this.x = Math.round(vx * s);
            this.y = Math.round(vy * s);
            this.visible = false;
            this.refresh();
        }

        setValue(v) {
            this._value = v;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            widgetTextBegin(this);
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: this._label, titleAlign: 'center', headerH: 9, hairline: false, step: 1,
                dom: this._dom
            });

            const bx = 10, by = 15, bw = 14, bh = 96;
            if (this._mode === 'power') {
                H.decoVBar(bmp, bx, by, bw, bh, Math.max(0, Math.min(1, this._value / 100)), {
                    colorAt: t => (t < 0.5 ? D.green : (t < 0.85 ? D.gold : D.red)),
                    mark: 0.82,             // the sweet spot the CPU aims for
                    markColor: D.goldHi
                });
            } else {
                H.decoVBar(bmp, bx, by, bw, bh, Math.max(-1, Math.min(1, this._value)), {
                    center: true,
                    colorAt: t => (t > 0.5 ? D.gold : D.jade)
                });
                widgetText(this, 'R', 0, by - 1, this._vw, 'center', D.dim, 8);
                widgetText(this, 'L', 0, by + bh - 7, this._vw, 'center', D.dim, 8);
            }
            widgetTextEnd(this);
        }
    }

    //=========================================================================
    // Status strip and result card. Sprites rather than windows: an RMMZ
    // windowskin frame is the one thing on screen that could never have come
    // off a PlayStation.
    //=========================================================================
    class Sprite_BowlStatus extends Sprite {
        constructor() {
            super();
            this._vw = hudW();
            this._vh = 14;
            this.bitmap = new Bitmap(this._vw, this._vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            this.y = Graphics.height - Math.round(this._vh * s);
            this._text = null;
        }

        setText(text) {
            if (this._text === text) return;
            this._text = text;
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            widgetTextBegin(this);
            if (!this._text) { widgetTextEnd(this); return; }
            bmp.fillRect(0, 0, this._vw, this._vh, D.black);
            bmp.fillRect(0, 0, this._vw, 1, D.gold);
            widgetText(this, this._text, 2, 2, this._vw - 4, 'center', D.ink, 8);
            widgetTextEnd(this);
        }
    }

    class Sprite_BowlResult extends Sprite {
        constructor() {
            super();
            this._vw = 172;
            this._vh = 62;
            this.bitmap = new Bitmap(this._vw, this._vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            this.x = Math.round((Graphics.width - this._vw * s) / 2);
            this.y = Math.round((Graphics.height - this._vh * s) / 2);
            this.visible = false;
        }

        show() { this.visible = true; }
        hide() { this.visible = false; }

        setText(result, score, color) {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            widgetTextBegin(this);
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { step: 3 });
            H.decoSunburst(bmp, 1, 12, 13, D.goldLo, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
            H.decoSunburst(bmp, this._vw - 2, 12, 13, D.goldLo, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            widgetText(this, result, 0, 7, this._vw, 'center', color || D.goldHi, 16);
            H.decoRule(bmp, 10, 30, this._vw - 20, D.goldLo);
            widgetText(this, score, 0, 33, this._vw, 'center', D.ink, 8);
            widgetTextEnd(this);
        }
    }

    //=========================================================================
    // Scene_BowlingMinigame
    //=========================================================================
    const STATE = {
        AIM: 'aim',
        POWER: 'power',
        SPIN: 'spin',
        CPU: 'cpu',
        APPROACH: 'approach',
        ROLLING: 'rolling',
        SETTLE: 'settle',
        SWEEP: 'sweep',
        GAMEOVER: 'gameover'
    };

    // Player 2 reads its own controller; the split-screen manager exposes the
    // same six symbols under different names.
    const P2_KEYS = {
        ok: 'action', cancel: 'dash',
        left: 'left', right: 'right', up: 'up', down: 'down'
    };

    Scene_BowlingMinigame = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._world = new BowlWorld();
            this._playerFrames = emptyCard();
            this._cpuFrames = emptyCard();
            // Who is on the next lane when nobody is holding the second pad:
            // a companion, a local off the map, or the player's own head. Read
            // once, so the same person bowls all ten frames.
            this._standIn = window.MinigameOpponent?.pick() ?? null;
            this._frame = 0;
            this._isPlayerTurn = true;
            this._standing = Array(10).fill(true);
            this._state = STATE.AIM;
            this._timer = 0;
            this._banner = "";
            this._bannerTimer = 0;
            this._soundCooldown = 0;
            this._settleFrames = 0;
            this._rollTime = 0;
            this._sweepT = 0;
            this._approachT = 0;
            this._gutterAnnounced = false;
            this._threeReady = typeof THREE !== 'undefined';

            const speed = DIFFICULTY === 1 ? 0.72 : DIFFICULTY === 3 ? 1.3 : 1.0;
            this._meterSpeed = speed;
            this._cpuAccuracy = DIFFICULTY === 1 ? 0.68 : DIFFICULTY === 3 ? 0.94 : 0.84;

            this._aimX = 0;
            this._aimDir = 0;
            this._power = 0;
            this._powerDir = 1;
            this._spin = 0;
            this._spinDir = 1;
        }

        //--- construction ---------------------------------------------------

        create() {
            super.create();
            if (!this._threeReady) {
                this.createUI();
                this._status.setText(T('Bowling.noThree'));
                this._state = STATE.GAMEOVER;
                return;
            }
            this.createAlley();
            this.createUI();
            this.createAsciiLayer();
            this.beginFrame();
        }

        // The blurred map snapshot would only be a wasted upload behind an
        // opaque 3D view.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#05050c');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createAlley() {
            // Rendering a little below native and scaling up with nearest
            // filtering keeps a period edge without turning the pins to mush.
            const scale = 0.86;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._alley = new Alley3D(w, h);

            const texture = PIXI.Texture.from(this._alley.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._alleySprite = new PIXI.Sprite(texture);
            this._alleySprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._alleySprite, idx);
        }

        createUI() {
            this._scoreboard = new Sprite_BowlScoreboard();
            this.addChild(this._scoreboard);

            this._powerMeter = new Sprite_BowlMeter(6, 60, "POWER", 'power');
            this.addChild(this._powerMeter);

            this._spinMeter = new Sprite_BowlMeter(hudW() - 40, 60, "HOOK", 'spin');
            this.addChild(this._spinMeter);

            this._bannerSprite = psxWidget(hudW(), 24, 0, 0);
            this._bannerSprite.y = Math.floor(Graphics.height * 0.34);
            this._bannerSprite.visible = false;
            this.addChild(this._bannerSprite);

            this._status = new Sprite_BowlStatus();
            this.addChild(this._status);

            this._result = new Sprite_BowlResult();
            this.addChild(this._result);

            this.refreshScoreboard();

            // The pixel font arrives asynchronously; repaint what was drawn once.
            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._scoreboard) return;
                    this.refreshScoreboard();
                    this._status.refresh();
                    this._powerMeter.refresh();
                    this._spinMeter.refresh();
                });
            }
        }

        createAsciiLayer() {
            this._asciiSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._asciiSprite.bitmap.fontFace = 'Square';
            this._asciiSprite.bitmap.fontSize = 16;
            this._asciiSprite.visible = false;
            this.addChild(this._asciiSprite);
        }

        //--- helpers ---------------------------------------------------------

        isSplitScreen() {
            return !!(window.$gameSplitScreen && window.$gameSplitScreen.active);
        }

        isCpuTurn() {
            return !this._isPlayerTurn && !this.isSplitScreen();
        }

        opponentName() {
            if (this.isSplitScreen()) return T('Bowling.player2');
            return window.MinigameOpponent
                ? window.MinigameOpponent.nameOf(this._standIn, T('Bowling.cpu'))
                : T('Bowling.cpu');
        }

        // Input source for whoever is currently bowling.
        ctl() {
            if (!this._isPlayerTurn && this.isSplitScreen()) {
                const ss = window.$gameSplitScreen;
                return {
                    pressed: k => !!ss.p2Input[P2_KEYS[k]],
                    triggered: k => ss.isTriggered(P2_KEYS[k])
                };
            }
            return {
                pressed: k => Input.isPressed(k),
                triggered: k => Input.isTriggered(k)
            };
        }

        bowlerLabel() {
            return this._isPlayerTurn ? T('Bowling.player1') : this.opponentName();
        }

        currentFrames() {
            return this._isPlayerTurn ? this._playerFrames : this._cpuFrames;
        }

        refreshScoreboard() {
            this._scoreboard.refresh(
                this._playerFrames, this._cpuFrames, this.opponentName(),
                this._isPlayerTurn ? 0 : 1, this._frame
            );
        }

        playSe(sound, pitch) {
            if (!sound.name) return;
            const s = Object.assign({}, sound);
            if (pitch) s.pitch = pitch;
            AudioManager.playSe(s);
        }

        showBanner(text, color) {
            this._banner = text;
            this._bannerTimer = 90;
            const H = window.PSXHud;
            const sp = this._bannerSprite;
            const bmp = sp.bitmap;
            bmp.clear();
            if (H) {
                // A gold plaque under the call, so it reads against the lane
                // lights instead of fighting them.
                const D = H.DECO;
                const bw = Math.min(hudW() - 60, 190);
                const bx = Math.floor((hudW() - bw) / 2);
                widgetTextBegin(sp);
                H.decoPanel(bmp, bx, 0, bw, 24, { hairline: false, step: 2 });
                widgetText(sp, text, bx, 2, bw, 'center', color || D.goldHi, 16,
                    { shadow: true, shadowColor: D.shadow });
                widgetTextEnd(sp);
            }
            this._bannerSprite.visible = true;
            this._bannerSprite.opacity = 255;
        }

        //--- frame / turn flow ------------------------------------------------

        beginFrame() {
            if (this._frame >= 10) {
                this.finishGame();
                return;
            }
            this._standing = Array(10).fill(true);
            this.rackPins();
            this.refreshScoreboard();
            this.beginRoll();
        }

        rackPins() {
            const spots = pinSpots();
            for (let i = 0; i < 10; i++) {
                if (this._standing[i]) this._world.standPin(i, spots[i]);
                else this._world.removePin(i);
            }
            this._alley.syncBodies(this._world);
        }

        beginRoll() {
            this._world.ball.active = false;
            this._alley.setCameraMode(CAM_AIM);
            this._gutterAnnounced = false;

            this._aimX = 0;
            this._aimDir = 0;
            this._power = 0;
            this._powerDir = 1;
            this._spin = 0;
            this._spinDir = 1;

            if (this.isCpuTurn()) {
                this._state = STATE.CPU;
                this._timer = 50;
                this._status.setText(T('Bowling.cpuThinking', { opponent: this.opponentName() }));
                this.updateHeldBallPose();
                this._alley.setAimGuide(0, 0, false);
                return;
            }

            this._state = STATE.AIM;
            this._status.setText(T('Bowling.aimPrompt', { bowler: this.bowlerLabel() }));
            this.updateHeldBallPose();
        }

        // There is no bowler model: the ball itself is the stand-in, waiting at
        // the top of the approach on the chosen line.
        updateHeldBallPose() {
            const x = this._aimX;
            this._alley.setHeldBall(x, APPROACH_Z + 1.2, 0.95);
            this._alley.setAimGuide(x, this._aimDir, this._state === STATE.AIM);
        }

        startApproach() {
            this._state = STATE.APPROACH;
            this._approachT = 0;
            this._status.setText("");
            this._alley.setAimGuide(0, 0, false);
            this._alley.setCameraMode(CAM_AIM);
        }

        launch() {
            const speed = 5.4 + (this._power / 100) * 4.2;
            const dir = this._aimDir;
            this._world.launchBall(this._aimX, FOUL_Z + 0.1, dir, speed, this._spin);
            this._state = STATE.ROLLING;
            this._rollTime = 0;
            this._settleFrames = 0;
            this._alley.setCameraMode(CAM_FOLLOW);
            this.playSe(rollSound, 80);
        }

        // Everything from here is shared by the human and the CPU.
        endRoll() {
            const before = this._standing.filter(Boolean).length;
            for (let i = 0; i < 10; i++) {
                if (this._standing[i] && this._world.isPinDown(i)) this._standing[i] = false;
            }
            const after = this._standing.filter(Boolean).length;
            const knocked = before - after;

            const frames = this.currentFrames();
            const frame = frames[this._frame];
            frame.push(knocked);

            this.announceRoll(frame, knocked, after);
            this.refreshScoreboard();

            this._state = STATE.SWEEP;
            this._sweepT = 0;
            this._alley.setCameraMode(CAM_RESULT);
        }

        announceRoll(frame, knocked, standing) {
            const isTenth = this._frame === 9;
            const rollIndex = frame.length - 1;
            // Only a ball thrown at a full rack can be a strike, which in the
            // tenth means the previous ball cleared the deck.
            const firstOfRack = rollIndex === 0 || (isTenth && (
                frame[rollIndex - 1] === 10 ||
                (rollIndex === 2 && frame[0] !== 10 && frame[0] + frame[1] === 10)
            ));

            if (knocked === 10 && firstOfRack) {
                this.showBanner("STRIKE!", '#fff2c6');
                this.playSe(strikeSound);
            } else if (standing === 0) {
                this.showBanner("SPARE!", '#e6c273');
                this.playSe(spareSound);
            } else if (knocked === 0) {
                this.showBanner(this._world.ballInGutter ? "GUTTER" : "MISS", '#d9533d');
            } else {
                this.showBanner(`${knocked} PIN${knocked === 1 ? '' : 'S'}`, '#c0a468');
            }
        }

        // Decide what happens after the deadwood has been swept.
        advanceAfterSweep() {
            const frames = this.currentFrames();
            const frame = frames[this._frame];
            const standing = this._standing.filter(Boolean).length;

            if (this._frame < 9) {
                const done = frame[0] === 10 || frame.length >= 2;
                if (done) {
                    this.switchBowler();
                } else {
                    this.rackPins();
                    this.beginRoll();
                }
                return;
            }

            // Tenth frame: a strike or a spare earns a fill ball, and the deck
            // is only re-racked when the previous ball actually cleared it.
            const rolls = frame.length;
            const strikeFirst = frame[0] === 10;
            if (rolls === 1) {
                if (strikeFirst) this._standing = Array(10).fill(true);
                this.rackPins();
                this.beginRoll();
            } else if (rolls === 2) {
                const spare = !strikeFirst && frame[0] + frame[1] === 10;
                if (strikeFirst || spare) {
                    if (spare || standing === 0) this._standing = Array(10).fill(true);
                    this.rackPins();
                    this.beginRoll();
                } else {
                    this.switchBowler();
                }
            } else {
                this.switchBowler();
            }
        }

        switchBowler() {
            if (this._isPlayerTurn) {
                this._isPlayerTurn = false;
                this._standing = Array(10).fill(true);
                this.rackPins();
                this.refreshScoreboard();
                this.beginRoll();
            } else {
                this._isPlayerTurn = true;
                this._frame++;
                this.beginFrame();
            }
        }

        finishGame() {
            const playerTotal = finalScore(this._playerFrames);
            const cpuTotal = finalScore(this._cpuFrames);
            let text, value, color;
            if (playerTotal > cpuTotal) {
                text = T('Bowling.victory'); value = 1; color = '#93d86e';
            } else if (cpuTotal > playerTotal) {
                text = T('Bowling.defeat'); value = 2; color = '#d9533d';
            } else {
                text = T('Bowling.draw'); value = 3; color = '#fff2c6';
            }

            if (gameResultVariable > 0) $gameVariables.setValue(gameResultVariable, value);
            if (window.MinigameFun) {
                if (value === 1) window.MinigameFun.won('Tenpin Bowling');
                else if (value === 2) window.MinigameFun.lost('Tenpin Bowling');
                else window.MinigameFun.draw('Tenpin Bowling');
            }

            // MinigameFun pays the party; a local who was talked into ten
            // frames is paid their own leisure here.
            if (!this.isSplitScreen()) window.MinigameOpponent?.payFun(this._standIn);

            this._state = STATE.GAMEOVER;
            this._alley.setCameraMode(CAM_RESULT);
            this._result.show();
            this._result.setText(text, T('Bowling.finalScore', { player: playerTotal, opponent: this.opponentName(), opponentScore: cpuTotal }), color);
            this._status.setText("");
            this._powerMeter.visible = false;
            this._spinMeter.visible = false;
        }

        //--- update ----------------------------------------------------------

        update() {
            super.update();
            if (!this._threeReady) {
                if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this.popScene();
                return;
            }

            const dt = 1 / 60;
            if (this._soundCooldown > 0) this._soundCooldown--;

            switch (this._state) {
                case STATE.AIM: this.updateAim(); break;
                case STATE.POWER: this.updatePower(); break;
                case STATE.SPIN: this.updateSpin(); break;
                case STATE.CPU: this.updateCpu(); break;
                case STATE.APPROACH: this.updateApproach(dt); break;
                case STATE.ROLLING: this.updateRolling(dt); break;
                case STATE.SETTLE: this.updateSettle(); break;
                case STATE.SWEEP: this.updateSweep(dt); break;
                case STATE.GAMEOVER: this.updateGameOver(); break;
            }

            this.updateBanner();
            this._alley.updateCamera(dt, this._world, this._aimX, this._aimDir);
            this.updateAsciiMode();
            // The HTML labels are painted when a widget repaints, which is not
            // every frame: this keeps them on their sprite when one is shown,
            // hidden or moved in between.
            for (const dom of BOWL_DOMS) dom.sync();

            // Redraw last, so the composited texture always shows the state the
            // logic above just produced rather than the previous frame's.
            if (this._alleySprite && !ConfigManager.asciiModeEnabled) {
                this._alley.render();
                if (this._alleySprite.texture) this._alleySprite.texture.update();
            }
        }

        updateAim() {
            const c = this.ctl();
            const step = 0.012;
            if (c.pressed('left')) this._aimX -= step;
            if (c.pressed('right')) this._aimX += step;
            if (c.pressed('up')) this._aimDir += 0.0016;
            if (c.pressed('down')) this._aimDir -= 0.0016;

            const limit = LANE_HALF - BALL_R - 0.02;
            this._aimX = Math.max(-limit, Math.min(limit, this._aimX));
            this._aimDir = Math.max(-0.075, Math.min(0.075, this._aimDir));
            this.updateHeldBallPose();

            if (c.triggered('ok')) {
                SoundManager.playOk();
                this._state = STATE.POWER;
                this._powerMeter.visible = true;
                this._alley.setAimGuide(0, 0, false);
                this._status.setText(T('Bowling.powerPrompt', { bowler: this.bowlerLabel() }));
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        updatePower() {
            this._power += this._powerDir * 2.4 * this._meterSpeed;
            if (this._power >= 100) { this._power = 100; this._powerDir = -1; }
            if (this._power <= 0) { this._power = 0; this._powerDir = 1; }
            this._powerMeter.setValue(this._power);

            const c = this.ctl();
            if (c.triggered('ok')) {
                SoundManager.playOk();
                this._state = STATE.SPIN;
                this._spinMeter.visible = true;
                this._status.setText(T('Bowling.hookPrompt', { bowler: this.bowlerLabel() }));
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this._powerMeter.visible = false;
                this._state = STATE.AIM;
                this._status.setText(T('Bowling.aimPrompt', { bowler: this.bowlerLabel() }));
            }
        }

        updateSpin() {
            this._spin += this._spinDir * 0.032 * this._meterSpeed;
            if (this._spin >= 1) { this._spin = 1; this._spinDir = -1; }
            if (this._spin <= -1) { this._spin = -1; this._spinDir = 1; }
            this._spinMeter.setValue(this._spin);

            const c = this.ctl();
            if (c.triggered('ok')) {
                SoundManager.playOk();
                this._powerMeter.visible = false;
                this._spinMeter.visible = false;
                this.startApproach();
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this._spinMeter.visible = false;
                this._state = STATE.POWER;
                this._status.setText(T('Bowling.powerPrompt', { bowler: this.bowlerLabel() }));
            }
        }

        updateCpu() {
            if (this._timer-- > 0) return;

            // Aim at the pocket on a full rack, otherwise at the centre of what
            // is left standing, then blur that by the difficulty's accuracy.
            const spots = pinSpots();
            const standingIdx = [];
            for (let i = 0; i < 10; i++) if (this._standing[i]) standingIdx.push(i);

            let targetX = 0;
            if (standingIdx.length === 10) {
                targetX = 0.085 * (Math.random() > 0.5 ? 1 : -1);
            } else if (standingIdx.length) {
                targetX = standingIdx.reduce((a, i) => a + spots[i].x, 0) / standingIdx.length;
            }

            const err = (1 - this._cpuAccuracy) * 0.55;
            const startX = Math.max(-0.4, Math.min(0.4, -targetX * 0.55 + (Math.random() - 0.5) * err));
            const aimAt = targetX + (Math.random() - 0.5) * err * 0.6;

            // Pick a hook, then aim up-lane of where it will drag the ball so
            // the curve finishes on the target rather than past it.
            this._spin = Math.max(-1, Math.min(1, (Math.random() - 0.5) * 1.4));
            this._aimX = startX;
            this._aimDir = Math.atan2(aimAt + this._spin * HOOK_DRIFT - startX, HEAD_PIN_Z);
            this._power = 68 + Math.random() * 26;
            this.updateHeldBallPose();
            this.startApproach();
        }

        // The ball carries itself down the approach and settles onto the lane
        // just short of the foul line, where the release takes over.
        updateApproach(dt) {
            this._approachT += dt;
            const t = Math.min(1, this._approachT / 0.75);
            const startZ = APPROACH_Z + 1.2;
            const endZ = FOUL_Z - 0.35;
            const z = startZ + (endZ - startZ) * t;
            // Held high through the pushaway, then dropped through the release.
            const drop = t < 0.45 ? 0 : Math.pow((t - 0.45) / 0.55, 2);
            const y = 0.95 + (BALL_R - 0.95) * drop;
            this._alley.setHeldBall(this._aimX, z, Math.max(BALL_R, y));

            if (t >= 1) this.launch();
        }

        updateRolling(dt) {
            this._rollTime += dt;
            this._world.step(dt);
            this._alley.syncBodies(this._world);

            const ev = this._world.events;
            if (ev.ballHits && this._soundCooldown <= 0) {
                this.playSe(pinHitSound, 100);
                this._soundCooldown = 4;
                this._alley.shake(Math.min(0.45, ev.impact * 0.05));
            } else if (ev.pinHits && this._soundCooldown <= 0) {
                this.playSe(pinHitSound, 130 + Math.floor(Math.random() * 30));
                this._soundCooldown = 6;
            }

            if (this._world.ballInGutter && !this._gutterAnnounced) {
                this._gutterAnnounced = true;
                this.playSe(gutterSound);
            }

            // Cut to the pin deck just before the ball arrives, Tekken style.
            if (this._world.ball.active && this._world.ball.p.z > HEAD_PIN_Z - 3.4) {
                this._alley.setCameraMode(CAM_DECK);
            }

            if (this._world.settled()) {
                this._settleFrames++;
            } else {
                this._settleFrames = 0;
            }
            if (this._settleFrames > 26 || this._rollTime > 14) {
                this._state = STATE.SETTLE;
                this._timer = 26;
            }
        }

        updateSettle() {
            // Let a leaning pin have its last moment of doubt.
            this._world.step(1 / 60);
            this._alley.syncBodies(this._world);
            if (this._timer-- <= 0) this.endRoll();
        }

        updateSweep(dt) {
            this._sweepT += dt;
            const total = 2.0;
            const p = this._sweepT / total;
            this._alley.setRake(p);

            // The rake carries the deadwood off the deck as it passes.
            if (p > 0.25 && p < 0.72) {
                const rakeZ = this._alley.rakeZ();
                for (let i = 0; i < 10; i++) {
                    const pin = this._world.pins[i];
                    if (pin.active && !this._standing[i] && pin.p.z < rakeZ + 0.1) {
                        pin.active = false;
                    }
                }
                this._alley.syncBodies(this._world);
            }

            if (p >= 1) {
                this._alley.setRake(0);
                this.advanceAfterSweep();
            }
        }

        updateGameOver() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                this.popScene();
            }
        }

        updateBanner() {
            if (this._bannerTimer > 0) {
                this._bannerTimer--;
                if (this._bannerTimer < 20) {
                    this._bannerSprite.opacity = Math.floor((this._bannerTimer / 20) * 255);
                }
                if (this._bannerTimer === 0) this._bannerSprite.visible = false;
            }
        }

        //--- ASCII mode ------------------------------------------------------

        updateAsciiMode() {
            const ascii = ConfigManager.asciiModeEnabled;
            if (this._asciiSprite) {
                this._asciiSprite.visible = ascii;
                if (ascii) this.drawAscii();
            }
            if (this._alleySprite) this._alleySprite.visible = !ascii;
            if (this._scoreboard) this._scoreboard.visible = !ascii;
            if (this._bannerSprite && ascii) this._bannerSprite.visible = false;
            if (ascii) {
                this._powerMeter.visible = false;
                this._spinMeter.visible = false;
            } else {
                this._powerMeter.visible = this._state === STATE.POWER;
                this._spinMeter.visible = this._state === STATE.SPIN;
            }
        }

        // Top-down lane readout, driven by the same physics bodies.
        drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            bmp.clear();
            bmp.fillRect(0, 0, Graphics.width, Graphics.height, '#000000');

            const cw = 10, ch = 16;
            const cols = Math.floor(Graphics.width / cw);
            const rows = Math.floor(Graphics.height / ch);
            const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));

            const topRow = 6;
            const laneRows = rows - topRow - 4;
            const laneCols = Math.min(cols - 4, 23);
            const left = Math.floor((cols - laneCols) / 2);

            const toCol = (x) => left + Math.round(((x + LANE_HALF) / (LANE_HALF * 2)) * (laneCols - 1));
            const toRow = (z) => topRow + Math.round((1 - (z - APPROACH_Z) / (DECK_END_Z - APPROACH_Z)) * (laneRows - 1));

            for (let r = topRow; r < topRow + laneRows; r++) {
                if (left - 1 >= 0) grid[r][left - 1] = '|';
                if (left + laneCols < cols) grid[r][left + laneCols] = '|';
            }
            const foul = toRow(FOUL_Z);
            if (foul >= 0 && foul < rows) {
                for (let c = left; c < left + laneCols; c++) grid[foul][c] = '-';
            }

            for (let i = 0; i < 10; i++) {
                const pin = this._world.pins[i];
                if (!pin.active) continue;
                const r = toRow(pin.p.z), c = toCol(pin.p.x);
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    grid[r][c] = this._world.isPinDown(i) ? 'x' : 'I';
                }
            }
            const ball = this._world.ball;
            if (ball.active) {
                const r = toRow(ball.p.z), c = toCol(ball.p.x);
                if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'O';
            } else if (this._state === STATE.AIM) {
                const r = toRow(APPROACH_Z + 1.2), c = toCol(this._aimX);
                if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'O';
            }

            bmp.textColor = '#FFFFFF';
            for (let r = 0; r < rows; r++) {
                bmp.drawText(grid[r].join(''), 0, r * ch, Graphics.width, ch, 'left');
            }

            bmp.textColor = '#FFE36B';
            const pTotal = finalScore(this._playerFrames);
            const cTotal = finalScore(this._cpuFrames);
            bmp.drawText(T('Bowling.frame', { frame: Math.min(10, this._frame + 1), bowler: this.bowlerLabel() }), 8, 0, Graphics.width, ch, 'left');
            bmp.drawText(`P1 ${pTotal}   ${this.opponentName()} ${cTotal}`, 8, ch, Graphics.width, ch, 'left');
            const bar = (v, n) => '[' + '='.repeat(Math.max(0, Math.min(n, Math.round(v * n)))) +
                ' '.repeat(n - Math.max(0, Math.min(n, Math.round(v * n)))) + ']';
            bmp.drawText(`POWER ${bar(this._power / 100, 10)}`, 8, ch * 2, Graphics.width, ch, 'left');
            bmp.drawText(`HOOK  ${bar((this._spin + 1) / 2, 10)}`, 8, ch * 3, Graphics.width, ch, 'left');
            if (this._banner && this._bannerTimer > 0) {
                bmp.drawText(this._banner, 0, ch * 4, Graphics.width, ch, 'center');
            }
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            // The HTML labels sit outside the scene graph and would otherwise
            // survive the scene that made them.
            for (const dom of BOWL_DOMS) dom.destroy();
            BOWL_DOMS = [];
            if (this._alleySprite) {
                if (this._alleySprite.parent) this._alleySprite.parent.removeChild(this._alleySprite);
                this._alleySprite.destroy();
                this._alleySprite = null;
            }
            if (this._alley) {
                this._alley.dispose();
                this._alley = null;
            }
        }
    };

    // Exposed for the title screen's minigame list and the split-screen
    // hot-seat registry, both of which look the class up by name.
    window.Scene_BowlingMinigame = Scene_BowlingMinigame;

})();
