/*:
 * @target MZ
 * @plugindesc First-person low-poly 3D surfing v2.0.0
 * @author Esoteric Heavy Industries
 * @version 2.0.0
 *
 * @help SurfingMiniGame.js
 *
 * A first-person surfing game rendered with three.js through the shared PSX
 * shader (PSXShader.js), built the way the bowling alley is: real geometry,
 * a real simulation underneath it, and a HUD drawn in a 240-line virtual
 * framebuffer with the labels on top of it as crisp HTML type.
 *
 * The view is the surfer's own. There is no surfer model, because you are
 * standing in it: below you is the board, and it pitches, rolls and slaps
 * across the chop under your feet exactly as the physics says it should.
 *
 * THE WAVE IS NOT A BACKDROP
 * Every wave is a travelling swell with a tilted crest line, so it PEELS:
 * the point where it breaks races along the beach at ten metres a second and
 * the whitewater eats the wave behind it. The whole game is the margin
 * between you and that point.
 *
 *   behind it   the lip lands on your head
 *   0 to 6 m    the pocket: steepest, fastest, and where the barrel is
 *   6 to 30 m   the open face, where turns are cheap
 *   past that   the shoulder: flat, slow, worth nothing
 *
 * None of that is scripted. The face is steep in the pocket because the
 * water is shallower there, you accelerate because you are pointing across a
 * slope and your rails will not let you slide sideways, and you either
 * outrun the section or you do not.
 *
 * INSIDE OR OUTSIDE
 * The map decides which water you get. On an <Exterior> map it is the sea: a
 * beach break under the live sky, carrying the time of day, the map's screen
 * tone and its weather. On an <Interior> map there is no sea, so it is an
 * artificial wave pool instead: a tiled hall with a caisson wave machine at
 * the deep end that fires an identical, perfect, slightly too clean wave
 * every time, a klaxon before each set, lane markings on the bottom and a
 * gallery of people watching you.
 *
 * CONTROLS
 *   W          paddle, then pump for speed
 *   S          stall and brake, to let the section catch up
 *   A / D      carve left and right (L1/R1 on a pad)
 *   SHIFT      tuck and crouch, which is how you fit inside a barrel
 *   SPACE      pop up on the take-off, then jump for airs
 *   ARROWS     look around; dragging the mouse does the same
 *   ESC        leave the water
 *
 * SCORING
 * Speed pays, the pocket pays double, the barrel pays by the second, and a
 * clean landing pays for the air before it. A wipeout ends the ride but you
 * keep what you scored on it. You get a set number of waves, and missing the
 * take-off spends one.
 *
 * Requires js/libs/three.min.js. Uses Battler3D/PSXShader.js when present.
 *
 * @param wavesPerHeat
 * @text Waves Per Heat
 * @type number
 * @min 1
 * @max 10
 * @desc How many waves the player gets before the heat is scored.
 * @default 3
 *
 * @param renderScale
 * @text Render Scale
 * @type number
 * @decimals 2
 * @min 0.30
 * @max 1.00
 * @desc Internal 3D resolution as a fraction of the game resolution.
 * @default 0.72
 *
 * @param lookSpeed
 * @text Look Speed
 * @type number
 * @decimals 2
 * @min 0.20
 * @max 3.00
 * @desc Multiplier on the camera look controls.
 * @default 1.00
 *
 * @param resultVariable
 * @text Result Variable ID
 * @type variable
 * @desc Variable set to 1 on a winning heat, 2 on a losing one. 0 = none.
 * @default 0
 *
 * @command startSurfingGame
 * @text Start Surfing Game
 * @desc Opens the surfing minigame.
 *
 * @command startSurfing
 * @text Start Surfing (alias)
 * @desc Same as Start Surfing Game, kept for older event calls.
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'SurfingMiniGame';
    const P = PluginManager.parameters(PLUGIN_NAME);
    const numP = (key, def) => {
        const v = parseFloat(P[key]);
        return isFinite(v) ? v : def;
    };

    const WAVES_PER_HEAT = Math.max(1, Math.round(numP('wavesPerHeat', 3)));
    const RENDER_SCALE   = Math.max(0.3, Math.min(1, numP('renderScale', 0.72)));
    const LOOK_SPEED     = Math.max(0.2, Math.min(3, numP('lookSpeed', 1)));
    const RESULT_VAR     = Math.round(numP('resultVariable', 0));

    //=========================================================================
    // Tunables. Everything below is metres and seconds.
    //=========================================================================
    const BEACH_Z     = 46;      // where the water meets the sand
    const BREAK_Z     = 12;      // the depth line a crest topples on
    const SHOAL_Z     = -46;     // where a swell first feels the bottom
    const FAR_Z       = -130;    // outer edge of the simulated water
    const SEA_FLOOR   = -9;      // deep-water bed height

    // The hall, when there is one. The wave field needs these too: a pool ride
    // is exactly as long as the pool, and the end wall is a real deadline.
    const POOL_X0      = -110;
    const POOL_X1      = 215;
    const POOL_START_X = -70;

    // Where the line-up sits. On a peeling wave your distance from the beach
    // IS your position along the wave, so sitting out here rather than out
    // there is the difference between taking off in the pocket and taking off
    // on the shoulder with the wave already gone.
    const LINEUP_Z     = 4;

    const EYE_H       = 1.58;    // eye above the board, standing
    const PADDLE_EYE  = 0.48;    // eye above the board, lying on it
    const BOARD_LEN   = 2.15;

    const GRAV        = 16.0;    // airborne gravity
    const SLOPE_ACC   = 30.0;    // how hard a slope pulls the board down it
    const PUMP_ACC    = 7.0;
    const BRAKE_ACC   = 11.0;
    const DRAG_Q      = 0.0100;  // quadratic drag: sets the terminal trim speed
    const DRAG_L      = 0.18;    // linear drag, so a stalled board does stop
    const MAX_SPEED   = 22.0;
    const TURN_RATE   = 1.75;
    const JUMP_V      = 6.2;
    const RAIL_GRIP   = 0.62;    // lateral velocity kept per 1/60 s
    const RAIL_DRIFT  = 0.90;    // ... while braking, which is how you slide

    const SIM_DT      = 1 / 60;
    const RENDER_FPS  = 30;

    // Looking around is a bounded offset on top of the board's own heading.
    const LOOK_YAW_LIM   = 2.35;
    const LOOK_PITCH_MIN = -0.85;
    const LOOK_PITCH_MAX = 0.55;

    // The sea gets a harsher retro pass than the shared default: a wide, almost
    // flat, gently curved surface is exactly where a PlayStation's precision
    // showed most, and hiding that would be hiding the point.
    const PSX_HARD = { vertexSnap: 0.6, colorLevels: 0.8, dither: 1.25 };

    // Water mesh. Rows are packed toward the shore, where the wave actually is,
    // and the columns have to be fine as well: a peeling crest crosses the grid
    // diagonally, so a coarse column spacing would stagger the crest line into
    // a staircase. The far water is fog anyway, so it gets a dozen rows.
    const GRID_COLS  = 84;
    const GRID_WIDTH = 180;
    const GRID_FAR   = 12;       // sparse rows from FAR_Z to NEAR_Z
    const GRID_NEAR  = 56;       // dense rows over the surf zone
    const NEAR_Z     = -58;

    // Scoring.
    const PTS_SPEED    = 1.20;   // per m/s, per second, while on the face
    const PTS_POCKET   = 2.00;   // multiplier while in the pocket
    const PTS_TUBE     = 130;    // per second inside the barrel
    const PTS_CARVE    = 160;
    const PTS_AIR      = 240;
    const PAR_PER_WAVE = 700;

    //=========================================================================
    // Helpers
    //=========================================================================
    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const lerp  = (a, b, t) => a + (b - a) * t;
    const smooth = (e0, e1, x) => {
        const t = clamp((x - e0) / ((e1 - e0) || 1e-6), 0, 1);
        return t * t * (3 - 2 * t);
    };

    // sech(u)^2, the profile of a solitary wave, written out because the water
    // mesh calls it a few thousand times a frame.
    function sech2(u) {
        const a = u < 0 ? -u : u;
        if (a > 6) return 0;
        const e = Math.exp(-a);
        const s = 2 * e / (1 + e * e);
        return s * s;
    }

    function three3DReady() {
        return typeof THREE !== 'undefined' && typeof THREE.WebGLRenderer === 'function';
    }

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

    // Launched from the title screen there is no map to read, so the free-play
    // picker (Titlescreen.js) asks the player where and when instead and leaves
    // the answer here. Null whenever a real game is being played.
    function arcadeSetup() {
        const arcade = window.MinigameArcade;
        return (arcade && arcade.setup) ? arcade.setup() : null;
    }

    // An explicit <Exterior> always wins, so a covered map that still wants the
    // open sea can say so and be believed.
    function isInteriorMap() {
        const setup = arcadeSetup();
        if (setup) return setup.venue === 'interior';
        try {
            if (typeof window.isProceduralInteriorMap === 'function' &&
                window.isProceduralInteriorMap()) return true;
        } catch (e) { /* procedural stack not loaded */ }
        const note = (window.$dataMap && $dataMap.note) || '';
        if (/<Exterior>/i.test(note)) return false;
        return /<Interior>/i.test(note);
    }

    function currentTimeMode() {
        const setup = arcadeSetup();
        if (setup && typeof setup.timeMode === 'number') return setup.timeMode;
        const SR = window.SkyRenderer;
        if (!SR || !SR.getCurrentTimeMode) return 0;
        return SR.getCurrentTimeMode();
    }

    // Sky, water and light for the hour, or the fluorescent tubes of a hall.
    function palette(interior) {
        if (interior) {
            return {
                sky: 0x1c2634, haze: 0x27374a, deep: 0x0d5670, shallow: 0x33b0c8,
                crest: 0x84dcea, foam: 0xf4fcff, bed: 0xa8d8e2, sand: 0xc6cac2,
                light: 0xe8f4ff, lightI: 0.95, ambient: 0.62, night: false,
                fogNear: 25, fogFar: 110, interior: true
            };
        }
        const SR = window.SkyRenderer;
        const T = (SR && SR.TIME_MODES) || { DAY: 0, NIGHT: 1, DUSK: 2, DAWN: 3 };
        switch (currentTimeMode()) {
            case T.NIGHT:
                return {
                    sky: 0x080e26, haze: 0x101a3a, deep: 0x061428, shallow: 0x123a58,
                    crest: 0x2e5f7e, foam: 0xc4d6ea, bed: 0x1a2330, sand: 0x2b3040,
                    light: 0x92aae8, lightI: 0.42, ambient: 0.30, night: true,
                    fogNear: 20, fogFar: 100, interior: false
                };
            case T.DUSK:
                return {
                    sky: 0xd8632c, haze: 0xf6a860, deep: 0x152238, shallow: 0x3a5a7e,
                    crest: 0xd08a5a, foam: 0xffe0c0, bed: 0x4a3c2c, sand: 0xb08a5c,
                    light: 0xffb070, lightI: 0.88, ambient: 0.42, night: false,
                    fogNear: 26, fogFar: 115, interior: false
                };
            case T.DAWN:
                return {
                    sky: 0xefa76e, haze: 0xffd0a4, deep: 0x123048, shallow: 0x3d84a6,
                    crest: 0x8fc6d8, foam: 0xfff0dc, bed: 0x53483a, sand: 0xcdb98c,
                    light: 0xffd8ab, lightI: 0.92, ambient: 0.48, night: false,
                    fogNear: 26, fogFar: 115, interior: false
                };
            default:
                return {
                    sky: 0x7cc0e8, haze: 0xcfeaf6, deep: 0x0b4a70, shallow: 0x1f97b8,
                    crest: 0x86dcea, foam: 0xffffff, bed: 0x9a8558, sand: 0xe0cf9a,
                    light: 0xfff6e2, lightI: 1.10, ambient: 0.55, night: false,
                    fogNear: 30, fogFar: 125, interior: false
                };
        }
    }

    // Named from the world seed, so a given world always surfs the same break
    // and swims in the same hall.
    const BREAK_NAMES = [
        'PUNTA NEGRA', 'CAPO FRETTA', 'THE ORGAN PIPES', 'SALT MOUTH',
        'BAIA DEI CANI', 'LONG SHOULDER', 'CABO SOLOMON', 'THE TELEPHONES',
        'GRAND MARÉE', 'SCOGLIO BIANCO', 'DEAD MONK POINT', 'LA BOCANA'
    ];
    const POOL_NAMES = [
        'AQUA DOME', 'WAVE PALACE', 'LIDO MAXIMA', 'PISCINA TITANO',
        'THE BLUE HANGAR', 'OCEANARIUM 2000', 'HALLE NEPTUN', 'SURF FACTORY'
    ];

    function venueName(interior, rng) {
        const list = interior ? POOL_NAMES : BREAK_NAMES;
        return list[Math.floor(rng() * list.length) % list.length];
    }

    //=========================================================================
    // WaveField - the water itself.
    //
    // A swell is a solitary ridge whose crest line is TILTED, so the point at
    // which it topples runs along the beach instead of arriving everywhere at
    // once. That single fact is what makes a wave rideable: everything else in
    // this class exists to serve it.
    //
    //   crestZ(x) = breakZ + peel * (x - peakX(t))
    //   peakX(t)  = peakX0 + breakSpeed * t        (the point that is breaking)
    //   peel      = -swellSpeed / breakSpeed       (negative rides toward +x)
    //=========================================================================
    class WaveField {
        constructor(interior, rng) {
            this.interior = interior;
            this.rng = rng;
            this.t = 0;
            this.swells = [];
            this._nextId = 1;
        }

        // A rideable swell aimed so its breaking point sweeps past (x, z).
        spawnRide(atX, dirHint) {
            const rng = this.rng;
            const interior = this.interior;
            // A wave pool is a machine: every wave it makes is the same wave.
            const dir = interior ? 1 : (dirHint || (rng() < 0.5 ? -1 : 1));
            const breakSpeed = interior ? 10.5 : 9.0 + rng() * 3.0;
            const swellSpeed = interior ? 6.0 : 5.6 + rng() * 1.6;
            const amp = interior ? 1.00 : 1.20 + rng() * 0.85;
            // A pool ride is as long as the pool. An ocean one is as long as
            // the sandbar felt like being that year.
            const rideLen = interior ? (POOL_X1 - 35 - atX) : 200 + rng() * 70;

            // The peel angle is not decoration: it is the ratio between how fast
            // the water comes in and how fast the break runs down the line.
            const peel = -dir * (swellSpeed / breakSpeed);

            const s = {
                id: this._nextId++,
                ride: true,
                dir: dir,
                amp: amp,
                faceW: interior ? 3.4 : 3.1 + rng() * 1.6,
                backW: interior ? 11 : 10 + rng() * 6,
                peel: peel,
                breakSpeed: breakSpeed * dir,
                breakZ: BREAK_Z - (amp - 1.6) * 1.7,
                // The bar the wave breaks on. A pool floor is poured flat.
                barAmp: interior ? 0 : 4 + rng() * 4,
                barK: (Math.PI * 2) / (70 + rng() * 60),
                barPhase: rng() * Math.PI * 2,
                born: this.t,
                // Start the breaking point up the line so the swell arrives as
                // an unbroken wall and only stands up as it reaches the rider.
                // Far enough to see it coming, near enough not to be a wait.
                peakX0: atX - dir * 78,
                xStart: atX - dir * 150,
                xEnd: atX + dir * rideLen,
                dead: false
            };
            this.swells.push(s);
            return s;
        }

        // Background swells, so the sea is never a single lonely ridge.
        spawnFiller(aroundX) {
            const rng = this.rng;
            if (this.interior) return null;
            const dir = rng() < 0.5 ? -1 : 1;
            const breakSpeed = 9 + rng() * 4;
            const swellSpeed = 5.4 + rng() * 1.8;
            const amp = 0.7 + rng() * 0.9;
            const s = {
                id: this._nextId++,
                ride: false,
                dir: dir,
                amp: amp,
                faceW: 3.4 + rng() * 2.2,
                backW: 12 + rng() * 8,
                peel: -dir * (swellSpeed / breakSpeed),
                breakSpeed: breakSpeed * dir,
                breakZ: BREAK_Z - (amp - 1.6) * 1.7,
                barAmp: 4 + rng() * 4,
                barK: (Math.PI * 2) / (70 + rng() * 60),
                barPhase: rng() * Math.PI * 2,
                born: this.t,
                peakX0: aroundX - dir * (200 + rng() * 220),
                xStart: aroundX - 900,
                xEnd: aroundX + 900,
                dead: false
            };
            this.swells.push(s);
            return s;
        }

        peakX(s) {
            return s.peakX0 + s.breakSpeed * (this.t - s.born);
        }

        crestZ(s, x) {
            return s.breakZ + s.peel * (x - this.peakX(s));
        }

        // The depth line the wave topples on, which is the shape of the sandbar
        // under it. Where the bar is shallow the wave breaks further out, so the
        // break RUNS AHEAD there: that is a section, and sections are the only
        // reason a wave is ever in doubt. A wave pool has a machined concrete
        // floor and therefore no sections at all, which is exactly why a pool
        // wave is a perfect wave and also a slightly boring one.
        breakZAt(s, x) {
            if (!s.barAmp) return s.breakZ;
            return s.breakZ + s.barAmp * Math.sin(x * s.barK + s.barPhase);
        }

        // How far the wave at this point is from falling over, measured along
        // the line in metres. Positive is unbroken water ahead of the curl,
        // negative means the lip has already landed there.
        margin(s, x) {
            return (this.breakZAt(s, x) - this.crestZ(s, x)) / Math.abs(s.peel);
        }

        // 0 offshore and untouched, 1 fully collapsed whitewater.
        breakAmount(s, x) {
            const over = this.crestZ(s, x) - this.breakZAt(s, x);
            return clamp(over / 9, 0, 1);
        }

        // How much of the wave still exists at this point along the line.
        // Measured in a coordinate that runs from 0 at the start of the wave to
        // its length at the end, whichever way the wave happens to be going:
        // doing the arithmetic in world x instead flips the fade for a
        // left-hander and quietly deletes the entire wave.
        alongLife(s, x) {
            const len = (s.xEnd - s.xStart) * s.dir;
            const p = (x - s.xStart) * s.dir;
            return smooth(0, 40, p) * (1 - smooth(len - 55, len, p));
        }

        // Shoaling: a swell stands up as the bottom comes to meet it.
        shoal(s, zc) {
            return 1 + 0.62 * smooth(SHOAL_Z, s.breakZ, zc);
        }

        swellHeight(s, x, z) {
            if (s.dead) return 0;
            const life = this.alongLife(s, x);
            if (life <= 0.001) return 0;
            const zc = this.crestZ(s, x);
            if (zc > BEACH_Z + 6 || zc < FAR_Z - 20) return 0;

            const d = z - zc;
            const fb = this.breakAmount(s, x);
            const sh = this.shoal(s, zc);
            const A = s.amp * sh * life * (1 - 0.42 * fb);

            // The face narrows as the wave stands up and spreads once it has
            // fallen over: a broken wave is a wide low mound of foam. Narrow it
            // much harder than this and the face stops being a face and becomes
            // a wall, which is unrideable rather than impressive.
            const wf = s.faceW * (1 - 0.25 * (sh - 1) / 0.62) * (1 + 2.6 * fb);
            const wb = s.backW * (1 + 0.7 * fb);
            if (d > wf * 7 || d < -wb * 5) return 0;

            let h = A * sech2(d >= 0 ? d / wf : d / wb);
            // The trough the face falls into, which is what you drop down.
            if (d > 0) {
                const u = (d - wf * 2.1) / (wf * 1.35);
                h -= A * 0.32 * Math.exp(-u * u) * (1 - fb * 0.7);
            }
            return h;
        }

        chop(x, z) {
            const t = this.t;
            if (this.interior) {
                // A pool has slop off the walls, not weather.
                return Math.sin(x * 0.9 - t * 3.1) * 0.035 +
                       Math.sin(z * 1.3 + t * 2.4) * 0.028;
            }
            return Math.sin(x * 0.21 + t * 1.9) * 0.11 +
                   Math.sin(z * 0.33 - t * 1.5) * 0.08 +
                   Math.sin((x + z) * 0.09 + t * 0.9) * 0.13;
        }

        height(x, z) {
            let h = this.chop(x, z);
            const list = this.swells;
            for (let i = 0; i < list.length; i++) h += this.swellHeight(list[i], x, z);
            return h;
        }

        // Central differences. Only the surfer asks for this, a few times a
        // frame; the water mesh gets its normals from the grid for free.
        slope(x, z) {
            const e = 0.6;
            const hx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
            const hz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
            return { x: hx, z: hz };
        }

        // Whitewater coverage, for colouring the mesh and for drowning people.
        foamAt(x, z) {
            let f = 0;
            for (const s of this.swells) {
                if (s.dead) continue;
                const fb = this.breakAmount(s, x);
                if (fb <= 0.02) continue;
                const life = this.alongLife(s, x);
                if (life <= 0.02) continue;
                const d = z - this.crestZ(s, x);
                const tail = s.faceW * (1.2 + 7 * fb);
                if (d < -s.faceW * 0.9 || d > tail) continue;
                const along = d < 0 ? 1 : (1 - 0.55 * (d / tail));
                f = Math.max(f, fb * life * along);
            }
            // The shore break is always foam.
            f = Math.max(f, smooth(BEACH_Z - 7, BEACH_Z - 1, z) * 0.9);
            return clamp(f, 0, 1);
        }

        // The push a rider feels from the water itself, on top of the slope.
        // It is nearly nothing out in deep water and everything under a
        // breaking lip, which is what makes the shoulder slow and the pocket
        // fast without either of them being told to be.
        pushAt(s, x, z) {
            if (!s || s.dead) return { x: 0, z: 0 };
            const zc = this.crestZ(s, x);
            const d = z - zc;
            const wf = s.faceW * 2.4;
            if (d < -wf || d > wf * 2) return { x: 0, z: 0 };
            const stand = 0.2 + 1.3 * smooth(SHOAL_Z, s.breakZ, zc);
            const k = sech2(d / wf) * s.amp * 4.4 * stand * this.alongLife(s, x);
            return { x: 0, z: k };
        }

        update(dt) {
            this.t += dt;
            for (const s of this.swells) {
                if (s.dead) continue;
                const p = this.peakX(s);
                // A swell is finished once its breaking point has run off the
                // far end of the line it was given.
                if ((p - s.xEnd) * s.dir > 120) s.dead = true;
            }
            if (this.swells.length > 8) {
                this.swells = this.swells.filter(s => !s.dead);
            }
        }

        clearFinished() {
            this.swells = this.swells.filter(s => !s.dead);
        }
    }

    //=========================================================================
    // Surfer - the board as a rigid body on a moving surface.
    //
    // The board has rails, and rails are the whole trick: lateral velocity is
    // bled off every step, so the down-slope pull of the wave face turns into
    // forward speed the moment you point across it. Trim speed is not a bonus
    // handed out for holding a button, it is what falls out of that.
    //=========================================================================
    class Surfer {
        constructor(field) {
            this.field = field;
            this.reset(0, -10, 0);
        }

        reset(x, z, yaw) {
            this.x = x; this.z = z;
            this.y = this.field.height(x, z);
            this.vx = 0; this.vz = 0; this.vy = 0;
            this.yaw = yaw || 0;
            this.roll = 0;
            this.pitchS = 0;
            this.airborne = false;
            this.airTime = 0;
            this.spin = 0;
            this.crouch = 0;
            this.lastH = this.y;
            this.carveAccum = 0;
            this.carveTimer = 0;
        }

        forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }

        speed() { return Math.sqrt(this.vx * this.vx + this.vz * this.vz); }

        // Speed measured along the board, which is the number that matters.
        trim() {
            const f = this.forward();
            return this.vx * f.x + this.vz * f.z;
        }

        jump(power) {
            if (this.airborne) return false;
            this.vy = JUMP_V * (power || 1) + Math.min(4, this.speed() * 0.14);
            this.airborne = true;
            this.airTime = 0;
            this.spin = 0;
            this.y += 0.05;
            return true;
        }

        // Returns an event string when something worth reporting happened.
        step(dt, input, mode) {
            const F = this.field;
            const h = F.height(this.x, this.z);
            const dhdt = (h - this.lastH) / dt;
            this.lastH = h;
            let event = null;

            this.crouch += ((input.tuck ? 1 : 0) - this.crouch) * Math.min(1, dt * 9);

            if (this.airborne) {
                this.vy -= GRAV * dt;
                this.y += this.vy * dt;
                this.airTime += dt;
                const turn = input.turn * TURN_RATE * 0.75 * dt;
                this.yaw += turn;
                this.spin += Math.abs(turn);
                this.roll += ((-input.turn * 0.5) - this.roll) * Math.min(1, dt * 6);
                if (this.y <= h && this.vy <= 0) {
                    this.y = h;
                    const impact = Math.abs(this.vy);
                    this.airborne = false;
                    event = (impact > 11.5 && !input.tuck) ? 'crash' : 'land';
                    this.vy = 0;
                }
            } else {
                this.y = h;
                const g = F.slope(this.x, this.z);
                const gain = mode === 'paddle' ? SLOPE_ACC * 0.30 : SLOPE_ACC;
                this.vx -= g.x * gain * dt;
                this.vz -= g.z * gain * dt;

                if (mode !== 'paddle' && input.wave) {
                    const push = F.pushAt(input.wave, this.x, this.z);
                    this.vx += push.x * dt;
                    this.vz += push.z * dt;
                }

                // The lip throwing you: if the surface climbs out from under the
                // board faster than the board can stay glued to it, you are off.
                if (mode !== 'paddle' && dhdt > 13 && this.speed() > 7) {
                    this.vy = clamp(dhdt * 0.34, 0, 9.5);
                    this.airborne = true;
                    this.airTime = 0;
                    this.spin = 0;
                    event = 'launch';
                }

                // Rails.
                const f = this.forward();
                const r = { x: f.z, z: -f.x };
                let vf = this.vx * f.x + this.vz * f.z;
                let vl = this.vx * r.x + this.vz * r.z;
                vl *= Math.pow(input.brake ? RAIL_DRIFT : RAIL_GRIP, dt * 60);

                const capF = mode === 'paddle' ? 4.2 : MAX_SPEED;
                if (input.pump) {
                    const room = 1 - clamp(Math.abs(vf) / capF, 0, 1);
                    vf += (mode === 'paddle' ? PUMP_ACC * 0.55 : PUMP_ACC) * room * dt;
                }
                if (input.brake) vf -= BRAKE_ACC * dt * Math.sign(vf || 1);
                vf -= (DRAG_Q * vf * Math.abs(vf) + DRAG_L * vf) * dt;
                vf = clamp(vf, -3, capF);

                this.vx = f.x * vf + r.x * vl;
                this.vz = f.z * vf + r.z * vl;

                const sp = clamp(Math.abs(vf) / 10, 0, 1);
                const rate = TURN_RATE * (0.35 + 0.65 * sp) * (input.brake ? 1.45 : 1) *
                             (mode === 'paddle' ? 0.7 : 1);
                const turn = input.turn * rate * dt;
                this.yaw += turn;

                // Carves are counted, not guessed at: sustained heading change
                // held at speed, then banked when the turn is released.
                if (mode !== 'paddle') {
                    if (Math.abs(input.turn) > 0.2 && sp > 0.45) {
                        this.carveAccum += Math.abs(turn);
                        this.carveTimer = 0.35;
                    } else {
                        this.carveTimer -= dt;
                        if (this.carveTimer <= 0) {
                            if (this.carveAccum > 1.15) event = 'carve';
                            this.carveAccum = 0;
                        }
                    }
                }

                const targetRoll = -input.turn * 0.42 * sp - clamp(g.x, -1, 1) * 0.18;
                this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8);
                this.pitchS += ((-clamp(g.z, -1.4, 1.4) * 0.55) - this.pitchS) * Math.min(1, dt * 7);
            }

            this.x += this.vx * dt;
            this.z += this.vz * dt;
            return event;
        }
    }

    //=========================================================================
    // SurfWorld3D - the three.js stage: sea or hall, and everything standing
    // around it. Rendered to its own canvas which the scene composites as a
    // PIXI sprite, the way the alley and the lake do.
    //=========================================================================
    class SurfWorld3D {
        constructor(width, height, interior, rng, venue) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this.interior = interior;
            this._rng = rng;
            this.venue = venue || '';
            this._pal = palette(interior);
            this._junk = [];
            this._t = 0;
            this._gridX = 0;
            this._underwater = false;

            this._buildGridRows();
            this._initThree();
            this._buildWater();
            this._buildBed();
            if (interior) this._buildHall(); else this._buildCoast();
            this._buildBoard();
            this._buildSpray();
            this._buildWeather();
        }

        get domElement() { return this.renderer.domElement; }

        _track(obj) {
            const PSX = window.PSXShader;
            this._junk.push(obj);
            if (!PSX || !PSX.applyToObject) return obj;
            if (PSX.withScale) PSX.withScale(PSX_HARD, () => PSX.applyToObject(obj));
            else PSX.applyToObject(obj);
            return obj;
        }

        _mat(color, opts) {
            const o = opts || {};
            const m = new THREE.MeshLambertMaterial({
                color: color,
                flatShading: o.flat !== false,
                transparent: !!o.transparent,
                opacity: o.opacity != null ? o.opacity : 1,
                side: o.side || THREE.FrontSide,
                emissive: o.emissive != null ? o.emissive : 0x000000,
                vertexColors: !!o.vertexColors,
                map: o.map || null
            });
            this._junk.push(m);
            return m;
        }

        _geo(g) { this._junk.push(g); return g; }

        _box(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        _canvasTexture(w, h, draw, repeatX, repeatY) {
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            draw(cv.getContext('2d'), w, h);
            const tex = new THREE.CanvasTexture(cv);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            if (repeatX || repeatY) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeatX || 1, repeatY || 1);
            }
            this._junk.push(tex);
            return tex;
        }

        //---------------------------------------------------------------------
        // Stage
        //---------------------------------------------------------------------
        _initThree() {
            const pal = this._pal;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(pal.sky);
            this.scene.fog = new THREE.Fog(pal.haze, pal.fogNear, pal.fogFar);

            this.camera = new THREE.PerspectiveCamera(72, this._w / this._h, 0.08, 600);
            this.camera.rotation.order = 'YXZ';
            this.scene.add(this.camera);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(Math.round(this._w * RENDER_SCALE), Math.round(this._h * RENDER_SCALE), false);
            this.renderer.setClearColor(pal.sky, 1);

            this.scene.add(new THREE.AmbientLight(0xffffff, pal.ambient));
            const key = new THREE.DirectionalLight(pal.light, pal.lightI);
            key.position.set(this.interior ? 0 : -30, 40, this.interior ? 10 : -25);
            this.scene.add(key);
            this._key = key;
            this._keyBase = pal.lightI;
            const fill = new THREE.HemisphereLight(pal.sky, pal.bed, 0.42);
            this.scene.add(fill);
        }

        // Rows bunched toward the shore: the far half of the water is scenery,
        // the near half is the game.
        _buildGridRows() {
            const rows = [];
            for (let i = 0; i < GRID_FAR; i++) {
                rows.push(FAR_Z + (NEAR_Z - FAR_Z) * (i / GRID_FAR));
            }
            for (let i = 0; i <= GRID_NEAR; i++) {
                rows.push(NEAR_Z + (BEACH_Z + 4 - NEAR_Z) * (i / GRID_NEAR));
            }
            this._rows = rows;
        }

        _buildWater() {
            const rows = this._rows;
            const cols = GRID_COLS;
            const nx = cols + 1, nz = rows.length;
            const pos = new Float32Array(nx * nz * 3);
            const col = new Float32Array(nx * nz * 3);
            const nrm = new Float32Array(nx * nz * 3);
            const idx = [];

            for (let j = 0; j < nz; j++) {
                for (let i = 0; i < nx; i++) {
                    const k = (j * nx + i) * 3;
                    pos[k] = -GRID_WIDTH / 2 + GRID_WIDTH * (i / cols);
                    pos[k + 1] = 0;
                    pos[k + 2] = rows[j];
                    nrm[k + 1] = 1;
                }
            }
            for (let j = 0; j < nz - 1; j++) {
                for (let i = 0; i < nx - 1; i++) {
                    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                    idx.push(a, c, b, b, c, d);
                }
            }

            const geo = this._geo(new THREE.BufferGeometry());
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
            geo.setIndex(idx);

            const mat = this._mat(0xffffff, { vertexColors: true, transparent: true, opacity: 0.94 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.renderOrder = 2;
            this.scene.add(mesh);
            this._water = mesh;
            this._waterNX = nx;
            this._waterNZ = nz;
            this._track(mesh);
        }

        _bedTexture() {
            const rng = this._rng;
            if (this.interior) {
                // Pool tiling with a lane stripe: the one thing that tells you,
                // even underwater, that this ocean has an owner.
                return this._canvasTexture(64, 64, (ctx, w, h) => {
                    ctx.fillStyle = '#cfe8ef'; ctx.fillRect(0, 0, w, h);
                    ctx.strokeStyle = '#9dc2ce'; ctx.lineWidth = 1;
                    for (let i = 0; i <= w; i += 8) {
                        ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, h); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(w, i + 0.5); ctx.stroke();
                    }
                    ctx.fillStyle = '#2b4d8a';
                    ctx.fillRect(0, 28, w, 8);
                }, 22, 10);
            }
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = '#b09a68'; ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 260; i++) {
                    const x = Math.floor(rng() * w), y = Math.floor(rng() * h);
                    ctx.fillStyle = rng() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,240,200,0.12)';
                    ctx.fillRect(x, y, 1 + Math.floor(rng() * 3), 1);
                }
                for (let y = 0; y < h; y += 6) {
                    ctx.fillStyle = 'rgba(90,70,40,0.16)';
                    ctx.fillRect(0, y, w, 2);
                }
            }, 14, 12);
        }

        // The bottom. It has to agree with the wave field: the break line is
        // where the wave topples, so the bed there must be shallow and still
        // under water. Let it rise above the waterline any earlier and the surf
        // would be breaking on dry sand.
        _bedYAt(z) {
            const deep = this.interior ? -3.6 : SEA_FLOOR;
            const shelf = -2.6;
            return z <= BREAK_Z
                ? lerp(deep, shelf, smooth(SHOAL_Z - 34, BREAK_Z, z))
                : lerp(shelf, 1.4, smooth(BREAK_Z, BEACH_Z, z));
        }

        _buildBed() {
            const SEGX = 40, SEGZ = 34;
            const geo = this._geo(new THREE.PlaneGeometry(GRID_WIDTH + 60, BEACH_Z + 10 - FAR_Z, SEGX, SEGZ));
            geo.rotateX(-Math.PI / 2);
            geo.translate(0, 0, (BEACH_Z + 10 + FAR_Z) / 2);
            const p = geo.attributes.position;
            const rng = this._rng;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), z = p.getZ(i);
                let y = this._bedYAt(z);
                // A poured pool floor is flat; a sandbar is not.
                if (!this.interior) {
                    y += Math.sin(x * 0.09) * 0.5 + Math.sin(z * 0.17 + 1.1) * 0.4;
                }
                p.setY(i, y);
            }
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, this._mat(this._pal.bed, { map: this._bedTexture() }));
            this.scene.add(mesh);
            this._bed = mesh;
            this._track(mesh);

            if (this.interior) return;
            // Reef heads, which is why the wave breaks where it breaks.
            const rocks = new THREE.Group();
            const rockMat = this._mat(this._pal.night ? 0x2a3038 : 0x6b6558);
            for (let i = 0; i < 26; i++) {
                const r = 0.8 + rng() * 2.4;
                const x = (rng() * 2 - 1) * (GRID_WIDTH / 2);
                const z = lerp(SHOAL_Z, BEACH_Z - 14, rng());
                const rock = new THREE.Mesh(this._geo(new THREE.DodecahedronGeometry(r, 0)), rockMat);
                rock.position.set(x, this._bedYAt(z) + r * 0.3, z);
                rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
                rocks.add(rock);
            }
            this.scene.add(rocks);
            this._rocks = rocks;
            this._track(rocks);
        }

        //---------------------------------------------------------------------
        // Exterior: an actual coast
        //---------------------------------------------------------------------
        _buildCoast() {
            const pal = this._pal;
            const rng = this._rng;

            // No sky dome: the scene's clear colour IS the sky, and the water
            // fades into a paler haze as it goes out, which is the whole of how
            // a horizon at sea reads. A dome would only cost a draw call to
            // paint the same colour twice.

            // Sun or moon, low over the water where it belongs.
            const discGeo = this._geo(new THREE.CircleGeometry(pal.night ? 7 : 11, 12));
            const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
                color: pal.night ? 0xdfe6ff : 0xfff4c8, fog: false
            }));
            disc.position.set(-160, pal.night ? 90 : 46, -330);
            disc.lookAt(0, 10, 0);
            this.scene.add(disc);
            this._junk.push(disc.material);

            if (pal.night) {
                const N = 260;
                const sp = new Float32Array(N * 3);
                for (let i = 0; i < N; i++) {
                    const a = rng() * Math.PI * 2;
                    const e = 0.10 + rng() * 0.9;
                    const r = 380;
                    sp[i * 3] = Math.cos(a) * r * Math.cos(e);
                    sp[i * 3 + 1] = Math.sin(e) * r * 0.85 + 20;
                    sp[i * 3 + 2] = Math.sin(a) * r * Math.cos(e);
                }
                const g = this._geo(new THREE.BufferGeometry());
                g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
                const stars = new THREE.Points(g, new THREE.PointsMaterial({
                    color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false
                }));
                this.scene.add(stars);
                this._junk.push(stars.material);
            } else {
                // Clouds are exempt from the fog: they are further away than
                // the fog ever reaches, and a fogged cloud is just sky.
                const cloudMat = new THREE.MeshBasicMaterial({ color: pal.haze, fog: false });
                this._junk.push(cloudMat);
                const clouds = new THREE.Group();
                for (let i = 0; i < 16; i++) {
                    const w = 26 + rng() * 60;
                    const c = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, 4 + rng() * 6, 14 + rng() * 20)), cloudMat);
                    c.position.set((rng() * 2 - 1) * 420, 60 + rng() * 55, -120 - rng() * 300);
                    clouds.add(c);
                }
                this.scene.add(clouds);
                this._clouds = clouds;
            }

            // Headlands, sitting right at the edge of the haze so the sea has
            // somewhere to end. Any further out and the fog would eat them.
            const landMat = this._mat(pal.night ? 0x141c26 : 0x4b5b3a);
            const head = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const w = 90 + rng() * 160;
                const hgt = 14 + rng() * 34;
                const m = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, hgt, 40)), landMat);
                m.position.set((rng() * 2 - 1) * 300, hgt / 2 - 6, -102 - rng() * 22);
                head.add(m);
            }
            this.scene.add(head);
            this._track(head);

            // The beach, and the strip of things standing on it. It repeats
            // along the line every REPEAT metres and is re-anchored to the
            // rider, so a two hundred metre ride never runs out of coast.
            const REPEAT = 60;
            this._beachRepeat = REPEAT;
            const beach = new THREE.Group();
            const sandMat = this._mat(pal.sand);
            for (let t = -3; t <= 3; t++) {
                const ox = t * REPEAT;
                const strip = new THREE.Mesh(this._geo(new THREE.BoxGeometry(REPEAT + 0.5, 4, 46)), sandMat);
                strip.position.set(ox, -0.6, BEACH_Z + 22);
                beach.add(strip);
            }
            const trunkMat = this._mat(pal.night ? 0x231a12 : 0x5a4227);
            const frondMat = this._mat(pal.night ? 0x16281a : 0x36692f);
            const clothMat = this._mat(pal.night ? 0x3a2430 : 0xd8483c);
            for (let t = -3; t <= 3; t++) {
                const ox = t * REPEAT;
                for (let i = 0; i < 3; i++) {
                    const x = ox + (rng() * 2 - 1) * REPEAT * 0.45;
                    const z = BEACH_Z + 8 + rng() * 26;
                    const hgt = 5 + rng() * 4;
                    const trunk = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.18, 0.3, hgt, 5)), trunkMat);
                    trunk.position.set(x, 1.2 + hgt / 2, z);
                    trunk.rotation.z = (rng() - 0.5) * 0.25;
                    beach.add(trunk);
                    for (let f = 0; f < 5; f++) {
                        const frond = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.5, 3.4, 3)), frondMat);
                        const a = (f / 5) * Math.PI * 2;
                        frond.position.set(x + Math.cos(a) * 1.3, 1.2 + hgt + 0.4, z + Math.sin(a) * 1.3);
                        frond.rotation.set(Math.cos(a) * 1.1, -a, Math.sin(a) * 1.1);
                        beach.add(frond);
                    }
                }
                const para = new THREE.Mesh(this._geo(new THREE.ConeGeometry(2.2, 1.4, 7)), clothMat);
                para.position.set(ox + (rng() * 2 - 1) * 18, 3.4, BEACH_Z + 12 + rng() * 10);
                beach.add(para);
                const pole = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.06, 0.06, 3, 4)), trunkMat);
                pole.position.set(para.position.x, 2.2, para.position.z);
                beach.add(pole);
            }
            this.scene.add(beach);
            this._beach = beach;
            this._track(beach);
        }

        //---------------------------------------------------------------------
        // Interior: the wave pool
        //---------------------------------------------------------------------
        _tileTexture(base, grout, band) {
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = grout; ctx.lineWidth = 1;
                for (let i = 0; i <= w; i += 8) {
                    ctx.beginPath(); ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, h); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0, i + 0.5); ctx.lineTo(w, i + 0.5); ctx.stroke();
                }
                if (band) { ctx.fillStyle = band; ctx.fillRect(0, 8, w, 8); }
            }, 10, 3);
        }

        _signTexture(text) {
            return this._canvasTexture(256, 48, (ctx, w, h) => {
                ctx.fillStyle = '#0d1526'; ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#39c6e8'; ctx.lineWidth = 3;
                ctx.strokeRect(4, 4, w - 8, h - 8);
                ctx.fillStyle = '#ffd447';
                ctx.font = 'bold 26px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(text).slice(0, 18), w / 2, h / 2 + 2);
            });
        }

        _buildHall() {
            const rng = this._rng;
            const HALL_X0 = POOL_X0, HALL_X1 = POOL_X1;      // along the ride
            const HALL_W = HALL_X1 - HALL_X0;
            const HALL_MID = (HALL_X0 + HALL_X1) / 2;
            const ROOF_Y = 15;
            const MACHINE_Z = FAR_Z + 40;
            // The hall is laid out from the water outwards, so moving the
            // waterline never leaves the building standing over dry concrete.
            const COPE_Z = BEACH_Z + 3;      // the lip of the pool
            const DECK_Z = BEACH_Z + 9;      // wet deck outside it
            const STAND_Z = BEACH_Z + 15;    // first row of the gallery
            const WALL_Z = BEACH_Z + 40;     // back wall behind the seats
            const Z_LO = MACHINE_Z - 14;
            const Z_MID = (WALL_Z + Z_LO) / 2;
            const Z_LEN = WALL_Z - Z_LO;

            const wallMat = this._mat(0xe4eef2, { map: this._tileTexture('#e4eef2', '#a8bdc6', '#2f6fa8') });
            const deckMat = this._mat(0xc9cec6);
            const trimMat = this._mat(0x2f6fa8);

            // Long walls either side of the pool, and the two ends. They start
            // below the pool floor, so there is no gap to see under the water.
            this._box(HALL_W, 15, 1.2, wallMat, HALL_MID, 4.0, WALL_Z);
            this._box(HALL_W, 15, 1.2, wallMat, HALL_MID, 4.0, Z_LO);
            this._box(1.2, 15, Z_LEN, wallMat, HALL_X0 - 8, 4.0, Z_MID);
            this._box(1.2, 15, Z_LEN, wallMat, HALL_X1 + 8, 4.0, Z_MID);

            // Ceiling, trusses and the tube lights that make everything in here
            // the same shadowless colour.
            this._box(HALL_W + 20, 1, Z_LEN + 20, this._mat(0x2a3038), HALL_MID, ROOF_Y + 0.5, Z_MID);
            const trussMat = this._mat(0x555f6a);
            const lampMat = this._mat(0xf6ffff, { emissive: 0xbfe6ff });
            for (let x = HALL_X0; x <= HALL_X1; x += 26) {
                this._box(1.0, 0.8, Z_LEN + 16, trussMat, x, ROOF_Y - 0.9, Z_MID);
                for (let z = MACHINE_Z + 10; z < DECK_Z; z += 34) {
                    this._box(7, 0.3, 1.6, lampMat, x + 8, ROOF_Y - 1.7, z);
                }
            }

            // Pool coping all the way round, and the wet deck outside it.
            this._box(HALL_W + 6, 1.6, 14, deckMat, HALL_MID, -0.3, DECK_Z);
            this._box(HALL_W + 6, 0.5, 1.4, trimMat, HALL_MID, 0.45, COPE_Z);
            this._box(8, 1.6, DECK_Z - Z_LO, deckMat, HALL_X0 - 3.5, -0.3, (DECK_Z + Z_LO) / 2);
            this._box(8, 1.6, DECK_Z - Z_LO, deckMat, HALL_X1 + 3.5, -0.3, (DECK_Z + Z_LO) / 2);

            // The machine: a bank of caissons that drop and shove the water.
            const caissonMat = this._mat(0x8d959c);
            const gateMat = this._mat(0xd8a028);
            this._box(HALL_W, 9, 8, caissonMat, HALL_MID, 3, MACHINE_Z - 6);
            this._gates = [];
            for (let x = HALL_X0 + 6; x < HALL_X1; x += 16) {
                const gate = this._box(13, 5.5, 1.6, gateMat, x, 1.4, MACHINE_Z);
                this._gates.push(gate);
            }
            this._box(30, 4, 0.4,
                this._mat(0xffffff, { map: this._signTexture(this.venue || 'WAVE POOL'), emissive: 0x223344 }),
                HALL_MID, 9.5, MACHINE_Z - 1.7);

            // The gallery, and the people in it who have paid to watch you fall.
            const standMat = this._mat(0xb7bcb4);
            const stand = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const step = new THREE.Mesh(this._geo(new THREE.BoxGeometry(HALL_W, 1.2, 4)), standMat);
                step.position.set(HALL_MID, 0.6 + i * 1.2, STAND_Z + i * 4);
                stand.add(step);
            }
            const shirts = [0xd8483c, 0x3c74d8, 0xe0c24a, 0x54b264, 0xd0d0d0, 0x9a5cc0];
            const headMat = this._mat(0xd9b48a);
            for (let i = 0; i < 70; i++) {
                const row = Math.floor(rng() * 5);
                const x = HALL_X0 + rng() * HALL_W;
                const y = 1.2 + row * 1.2;
                const z = STAND_Z + row * 4;
                const body = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.6, 1.1, 0.5)),
                    this._mat(shirts[Math.floor(rng() * shirts.length)]));
                body.position.set(x, y + 0.55, z);
                stand.add(body);
                const head = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.36, 0.36, 0.36)), headMat);
                head.position.set(x, y + 1.32, z);
                stand.add(head);
            }
            this.scene.add(stand);
            this._stand = stand;
            this._track(stand);

            // A lifeguard chair, a lane-rope float line and a life ring: the
            // furniture that says this water is supervised.
            const chair = new THREE.Group();
            const poleMat = this._mat(0xdad2b8);
            for (const dx of [-0.8, 0.8]) {
                for (const dz of [-0.8, 0.8]) {
                    const leg = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.09, 0.09, 4, 4)), poleMat);
                    leg.position.set(dx, 2, dz);
                    chair.add(leg);
                }
            }
            const seat = new THREE.Mesh(this._geo(new THREE.BoxGeometry(2.2, 0.25, 2.2)), poleMat);
            seat.position.y = 4;
            chair.add(seat);
            const ring = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.45, 0.14, 5, 10)), this._mat(0xe8552e));
            ring.position.set(1.3, 4.6, 0);
            chair.add(ring);
            chair.position.set(HALL_X0 - 3, 0.4, DECK_Z - 4);
            this.scene.add(chair);
            this._track(chair);

            const floatMat = this._mat(0xf0d020);
            const floats = new THREE.Group();
            for (let x = HALL_X0 + 4; x < HALL_X1; x += 3.2) {
                const f = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.22, 5, 4)), floatMat);
                f.position.set(x, 0.1, BEACH_Z - 4);
                floats.add(f);
            }
            this.scene.add(floats);
            this._track(floats);

            // Nothing at the far end but a wall, which is the point of a pool:
            // the ride has a length and you can see it from the take-off.
            this._box(2, 8, 40, trimMat, HALL_X1 + 2, 3, BEACH_Z - 24);
        }

        //---------------------------------------------------------------------
        // The board, which is the only part of you that is on screen
        //---------------------------------------------------------------------
        _buildBoard() {
            const rng = this._rng;
            const deckColors = [0xf2f2f2, 0xffd23f, 0x3ad7ef, 0xe8552e, 0x8ce04f, 0xe061c8];
            const deck = deckColors[Math.floor(rng() * deckColors.length)];
            const stripe = deckColors[Math.floor(rng() * deckColors.length)];

            const g = new THREE.Group();

            // A blank is an ellipsoid; a board is an ellipsoid with the nose
            // pulled to a point, which is one loop over the vertices.
            const blank = new THREE.SphereGeometry(0.5, 10, 6);
            const p = blank.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i) * 0.56, y = p.getY(i) * 0.085, z = p.getZ(i) * (BOARD_LEN / 2) / 0.5;
                const t = clamp(z / (BOARD_LEN / 2), -1, 1);
                const taper = t > 0 ? 1 - t * t * 0.72 : 1 - t * t * 0.30;
                p.setXYZ(i, x * taper, y * (1 - Math.abs(t) * 0.35), z);
            }
            blank.computeVertexNormals();
            this._geo(blank);
            const board = new THREE.Mesh(blank, this._mat(deck));
            g.add(board);

            const line = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.07, 0.03, BOARD_LEN * 0.86)), this._mat(stripe));
            line.position.y = 0.055;
            g.add(line);

            const finMat = this._mat(0x1c1c22);
            const fin = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.16, 0.34, 3)), finMat);
            fin.rotation.x = Math.PI;
            fin.position.set(0, -0.22, -BOARD_LEN / 2 + 0.28);
            g.add(fin);
            for (const dx of [-0.26, 0.26]) {
                const side = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.11, 0.24, 3)), finMat);
                side.rotation.x = Math.PI;
                side.position.set(dx, -0.16, -BOARD_LEN / 2 + 0.5);
                g.add(side);
            }

            // Wax, and two feet standing in it.
            const waxMat = this._mat(0xd8d2be);
            const wax = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.46, 0.02, 1.0)), waxMat);
            wax.position.set(0, 0.07, -0.25);
            g.add(wax);
            const footMat = this._mat(0x2c2f38);
            this._feet = [];
            for (const fz of [-0.62, 0.18]) {
                const foot = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.19, 0.13, 0.42)), footMat);
                foot.position.set(fz < 0 ? -0.07 : 0.07, 0.13, fz);
                foot.rotation.y = fz < 0 ? 0.5 : 0.22;
                g.add(foot);
                this._feet.push(foot);
            }

            // Leash, tail to ankle. Cheap, and its absence would be noticed.
            const leash = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.015, 0.015, 0.62, 4)), this._mat(0x1a1a1a));
            leash.position.set(-0.07, 0.06, -0.92);
            leash.rotation.x = 1.05;
            g.add(leash);

            this.scene.add(g);
            this._board = g;
            this._track(g);
        }

        //---------------------------------------------------------------------
        // Spray
        //---------------------------------------------------------------------
        _buildSpray() {
            const N = 260;
            this._sprayN = N;
            this._sprayPos = new Float32Array(N * 3);
            this._sprayVel = new Float32Array(N * 3);
            this._sprayLife = new Float32Array(N);
            this._sprayHead = 0;
            for (let i = 0; i < N; i++) this._sprayPos[i * 3 + 1] = -999;

            const geo = this._geo(new THREE.BufferGeometry());
            geo.setAttribute('position', new THREE.BufferAttribute(this._sprayPos, 3));
            const mat = new THREE.PointsMaterial({
                color: this._pal.foam, size: 0.28, transparent: true, opacity: 0.85, fog: true
            });
            this._junk.push(mat);
            const pts = new THREE.Points(geo, mat);
            pts.frustumCulled = false;
            this.scene.add(pts);
            this._spray = pts;
        }

        emitSpray(x, y, z, n, spread, up) {
            for (let i = 0; i < n; i++) {
                const k = this._sprayHead;
                this._sprayHead = (this._sprayHead + 1) % this._sprayN;
                this._sprayPos[k * 3] = x + (Math.random() - 0.5) * 0.7;
                this._sprayPos[k * 3 + 1] = y + Math.random() * 0.4;
                this._sprayPos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.7;
                this._sprayVel[k * 3] = (Math.random() - 0.5) * spread;
                this._sprayVel[k * 3 + 1] = up * (0.5 + Math.random());
                this._sprayVel[k * 3 + 2] = (Math.random() - 0.5) * spread;
                this._sprayLife[k] = 0.5 + Math.random() * 0.7;
            }
        }

        _updateSpray(dt) {
            const pos = this._sprayPos, vel = this._sprayVel, life = this._sprayLife;
            for (let i = 0; i < this._sprayN; i++) {
                if (life[i] <= 0) continue;
                life[i] -= dt;
                if (life[i] <= 0) { pos[i * 3 + 1] = -999; continue; }
                vel[i * 3 + 1] -= 11 * dt;
                pos[i * 3] += vel[i * 3] * dt;
                pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
                pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
            }
            this._spray.geometry.attributes.position.needsUpdate = true;
        }

        // Rain and snow off the map, so the sea is not always having a nice day.
        _buildWeather() {
            if (this.interior) return;
            const type = ($gameScreen && $gameScreen.weatherType) ? $gameScreen.weatherType() : 'none';
            if (!type || type === 'none') return;
            const N = type === 'storm' ? 800 : 420;
            const pos = new Float32Array(N * 3);
            for (let i = 0; i < N; i++) {
                pos[i * 3] = (Math.random() * 2 - 1) * 70;
                pos[i * 3 + 1] = Math.random() * 44;
                pos[i * 3 + 2] = -Math.random() * 100 + 20;
            }
            const geo = this._geo(new THREE.BufferGeometry());
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const snow = type === 'snow';
            const mat = new THREE.PointsMaterial({
                color: snow ? 0xffffff : 0xa8c8e0,
                size: snow ? 1.0 : 0.5,
                transparent: true, opacity: snow ? 0.9 : 0.55, fog: false
            });
            this._junk.push(mat);
            const pts = new THREE.Points(geo, mat);
            pts.frustumCulled = false;
            this.scene.add(pts);
            this._weather = { points: pts, snow: snow, fall: snow ? 5 : 34 };
        }

        //---------------------------------------------------------------------
        // Per-frame
        //---------------------------------------------------------------------
        // Rebuild the water surface around the rider. The grid is re-anchored in
        // whole cells so the mesh never appears to crawl under the board, and
        // the normals come out of the grid itself rather than a full recompute.
        syncWater(field, centerX) {
            const cell = GRID_WIDTH / GRID_COLS;
            const originX = Math.round(centerX / cell) * cell;
            this._gridX = originX;
            this._water.position.x = originX;
            if (this._bed) this._bed.position.x = originX;
            if (this._rocks) this._rocks.position.x = Math.round(centerX / 120) * 120;

            const geo = this._water.geometry;
            const pos = geo.attributes.position.array;
            const col = geo.attributes.color.array;
            const nrm = geo.attributes.normal.array;
            const nx = this._waterNX, nz = this._waterNZ;

            if (!this._cols) {
                const pal = this._pal;
                this._cols = {
                    deep: new THREE.Color(pal.deep),
                    shallow: new THREE.Color(pal.shallow),
                    crest: new THREE.Color(pal.crest),
                    foam: new THREE.Color(pal.foam),
                    tmp: new THREE.Color()
                };
            }
            const deep = this._cols.deep, shallow = this._cols.shallow;
            const crest = this._cols.crest, foam = this._cols.foam, c = this._cols.tmp;

            for (let j = 0; j < nz; j++) {
                for (let i = 0; i < nx; i++) {
                    const k = (j * nx + i) * 3;
                    const wx = pos[k] + originX;
                    const wz = pos[k + 2];
                    const h = field.height(wx, wz);
                    pos[k + 1] = h;

                    c.copy(deep).lerp(shallow, smooth(SHOAL_Z - 40, BEACH_Z - 4, wz));
                    c.lerp(crest, clamp(h * 0.42, 0, 0.75));
                    const f = field.foamAt(wx, wz);
                    if (f > 0) c.lerp(foam, f);
                    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
                }
            }

            // Normals from finite differences over the grid we just filled.
            for (let j = 0; j < nz; j++) {
                const jm = j > 0 ? j - 1 : j;
                const jp = j < nz - 1 ? j + 1 : j;
                for (let i = 0; i < nx; i++) {
                    const im = i > 0 ? i - 1 : i;
                    const ip = i < nx - 1 ? i + 1 : i;
                    const k = (j * nx + i) * 3;
                    const dx = (pos[(j * nx + ip) * 3 + 1] - pos[(j * nx + im) * 3 + 1]) /
                               ((pos[(j * nx + ip) * 3] - pos[(j * nx + im) * 3]) || 1);
                    const dz = (pos[(jp * nx + i) * 3 + 1] - pos[(jm * nx + i) * 3 + 1]) /
                               ((pos[(jp * nx + i) * 3 + 2] - pos[(jm * nx + i) * 3 + 2]) || 1);
                    const len = Math.sqrt(dx * dx + 1 + dz * dz) || 1;
                    nrm[k] = -dx / len; nrm[k + 1] = 1 / len; nrm[k + 2] = -dz / len;
                }
            }

            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
            geo.attributes.normal.needsUpdate = true;
        }

        syncBoard(surfer, visible) {
            const g = this._board;
            g.visible = visible !== false;
            if (!g.visible) return;
            g.position.set(surfer.x, surfer.y + 0.06, surfer.z);
            g.rotation.set(0, 0, 0);
            g.rotation.order = 'YXZ';
            g.rotation.y = surfer.yaw;
            g.rotation.x = surfer.pitchS;
            g.rotation.z = surfer.roll;
            const stance = surfer.crouch;
            for (const f of this._feet) f.position.y = 0.13 - stance * 0.01;
        }

        // The eye rides a little behind the front foot, and a little lower when
        // you tuck: that is why the nose of the board is always in shot.
        placeCamera(surfer, lookYaw, lookPitch, eyeH, extraRoll) {
            const yaw = surfer.yaw + lookYaw;
            const f = { x: Math.sin(surfer.yaw), z: Math.cos(surfer.yaw) };
            const back = 0.30;
            this.camera.position.set(
                surfer.x - f.x * back,
                surfer.y + eyeH,
                surfer.z - f.z * back
            );
            this.camera.rotation.set(
                lookPitch + surfer.pitchS * 0.35,
                yaw,
                surfer.roll * 0.55 + (extraRoll || 0)
            );
        }

        // Speed is sold with the lens, not with a number.
        setSpeedFov(speed) {
            const target = 72 + clamp(speed / MAX_SPEED, 0, 1) * 16;
            this.camera.fov += (target - this.camera.fov) * 0.08;
            this.camera.updateProjectionMatrix();
        }

        // Inside a barrel the sky is a metre of falling water, so the light goes
        // with it. Underwater, everything does.
        setMood(tube, underwater) {
            const pal = this._pal;
            if (underwater !== this._underwater) {
                this._underwater = underwater;
                const c = underwater ? new THREE.Color(pal.deep) : new THREE.Color(pal.sky);
                this.scene.background = c;
                this.scene.fog.color.set(underwater ? pal.deep : pal.haze);
                this.scene.fog.near = underwater ? 0.5 : pal.fogNear;
                this.scene.fog.far = underwater ? 26 : pal.fogFar;
            }
            const want = this._keyBase * (underwater ? 0.35 : (1 - tube * 0.55));
            this._key.intensity += (want - this._key.intensity) * 0.15;
        }

        update(dt, field, surfer) {
            this._t += dt;
            this._updateSpray(dt);

            if (this._clouds) this._clouds.position.x = Math.sin(this._t * 0.02) * 20;
            if (this._weather) {
                const w = this._weather;
                const p = w.points.geometry.attributes.position;
                const arr = p.array;
                for (let i = 1; i < arr.length; i += 3) {
                    arr[i] -= w.fall * dt;
                    if (arr[i] < 0) arr[i] += 44;
                }
                p.needsUpdate = true;
                w.points.position.set(surfer.x, 0, surfer.z);
            }
            if (this._beach) {
                const R = this._beachRepeat;
                this._beach.position.x = Math.round(surfer.x / R) * R;
            }
            if (this._gates && this._gateT != null) {
                this._gateT = Math.max(0, this._gateT - dt);
                const drop = smooth(0, 0.55, this._gateT) * 2.6;
                for (const gate of this._gates) gate.position.y = 1.4 - drop;
            }
        }

        // The caissons slam when the machine fires: the interior's one moment
        // of theatre, and the cue that a wave is coming.
        fireGates() {
            if (!this._gates) return;
            this._gateT = 0.9;
        }

        render() {
            const PSX = window.PSXShader;
            if (PSX && PSX.render) {
                if (PSX.withScale) PSX.withScale(PSX_HARD, () => PSX.render(this.renderer, this.scene, this.camera));
                else PSX.render(this.renderer, this.scene, this.camera);
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            for (const item of this._junk) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._junk = [];
            if (this.renderer) {
                const PSX = window.PSXShader;
                if (PSX && PSX.disposeContext) PSX.disposeContext(this.renderer);
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
                this.renderer = null;
            }
        }
    }

    //=========================================================================
    // Scene_SurfingGame
    //=========================================================================
    const ST = {
        LINEUP: 'lineup',
        RIDE: 'ride',
        WIPEOUT: 'wipeout',
        KICKOUT: 'kickout',
        RESULT: 'result',
        ABORT: 'abort'
    };

    // WASD is not the movement map everywhere in this project, so the scene
    // claims those four keys under names of its own and hands them straight
    // back on the way out. The arrow keys keep their meaning and drive the head.
    const SURF_KEYS = { 87: 'surfPump', 65: 'surfLeft', 83: 'surfBrake', 68: 'surfRight' };

    class Scene_SurfingGame extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._interior = isInteriorMap();
            this._rng = mulberry32(worldSeed() ^ (this._interior ? 0x5eA51de : 0x0cea11));
            this._venue = venueName(this._interior, this._rng);
            this._field = null;
            this._world = null;
            this._surfer = null;
            this._state = ST.LINEUP;
            this._waveNo = 0;
            this._score = 0;
            this._rideScore = 0;
            this._best = 0;
            this._timer = 0;
            this._rideTime = 0;
            this._tube = 0;
            this._tubeTime = 0;
            this._banner = '';
            this._bannerColor = null;
            this._bannerT = 0;
            this._status = '';
            this._lookYaw = 0;
            this._lookPitch = -0.20;
            this._margin = 99;
            this._renderAcc = 0;
            this._seCool = 0;
            this._popPrompt = false;
            this._missed = false;
            this._wipeSpin = 0;
        }

        //--- construction -----------------------------------------------------

        create() {
            super.create();
            if (!three3DReady()) {
                this.createHud();
                this._state = ST.ABORT;
                this._status = 'THREE.JS IS NOT LOADED - SURFING UNAVAILABLE';
                return;
            }
            this._field = new WaveField(this._interior, this._rng);
            this._world = new SurfWorld3D(Graphics.width, Graphics.height, this._interior, this._rng, this._venue);
            this._surfer = new Surfer(this._field);
            this.createWorldSprite();
            this.createHud();
            this.createAsciiLayer();
            this._bindKeys();
            this._startAmbience();

            if (!this._interior) {
                for (let i = 0; i < 2; i++) this._field.spawnFiller(0);
            }
            this.beginLineup();

            if (window.MinigameFun) window.MinigameFun.played('Surfing');
        }

        // A blurred snapshot of the map is a wasted upload behind an opaque
        // 3D view that covers every pixel of the screen.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#04070d');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createWorldSprite() {
            const texture = PIXI.Texture.from(this._world.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._worldSprite = new PIXI.Sprite(texture);
            this._worldSprite.width = Graphics.width;
            this._worldSprite.height = Graphics.height;
            // Outdoors the sea wears the map's own screen tone, so the hour the
            // player walked in with carries into the water. A hall has its own
            // lights and has no business being tinted by the weather outside,
            // and a free-play session was given its hour by hand: neither wants
            // a tone laid over the palette that was asked for.
            if (!this._interior && !arcadeSetup() && typeof ColorFilter === 'function') {
                this._worldFilter = new ColorFilter();
                this._worldSprite.filters = [this._worldFilter];
                this._syncTone(true);
            }
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._worldSprite, idx);
        }

        _syncTone(force) {
            if (!this._worldFilter) return;
            const tone = ($gameScreen && $gameScreen.tone) ? $gameScreen.tone() : null;
            if (!tone) return;
            const prev = this._lastTone;
            if (!force && prev && prev[0] === tone[0] && prev[1] === tone[1] &&
                prev[2] === tone[2] && prev[3] === tone[3]) return;
            this._lastTone = tone.slice();
            this._worldFilter.setColorTone(this._lastTone);
        }

        createHud() {
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            if (window.PSXHud) {
                this._hud = window.PSXHud.layer();
                this._hudSprite = this._hud.sprite;
                this._hudDom = window.PSXHud.domPanel(this._hud);
            } else {
                const bmp = new Bitmap(Graphics.width, Graphics.height);
                this._hudSprite = new Sprite(bmp);
                this._hud = { bitmap: bmp, w: Graphics.width, h: Graphics.height };
            }
            this.addChildAt(this._hudSprite, idx);
        }

        createAsciiLayer() {
            this._asciiSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._asciiSprite.bitmap.fontFace = 'Square';
            this._asciiSprite.bitmap.fontSize = 16;
            this._asciiSprite.visible = false;
            this.addChild(this._asciiSprite);
        }

        _bindKeys() {
            this._savedKeys = {};
            for (const code in SURF_KEYS) {
                this._savedKeys[code] = Input.keyMapper[code];
                Input.keyMapper[code] = SURF_KEYS[code];
            }
            Input.clear();
        }

        _restoreKeys() {
            if (!this._savedKeys) return;
            for (const code in this._savedKeys) {
                if (this._savedKeys[code] === undefined) delete Input.keyMapper[code];
                else Input.keyMapper[code] = this._savedKeys[code];
            }
            this._savedKeys = null;
            Input.clear();
        }

        // saveBgs RETURNS the ambience the party walked in with rather than
        // storing it, so it is held here and handed back on the way out.
        _startAmbience() {
            try {
                this._savedBgs = AudioManager.saveBgs();
                this._bgsSaved = true;
                AudioManager.playBgs({
                    name: this._interior ? 'Wave1' : 'Sea',
                    volume: this._interior ? 55 : 75,
                    pitch: this._interior ? 90 : 100,
                    pan: 0
                });
            } catch (e) { this._bgsSaved = false; }
        }

        // The ambience the party walked in with, or silence if they walked in
        // with none. replayBgs takes that saved object: called bare it throws,
        // and the loop keeps rolling under whatever menu comes next.
        _stopAmbience() {
            if (!this._bgsSaved) return;
            this._bgsSaved = false;
            try {
                const saved = this._savedBgs;
                if (saved && saved.name) AudioManager.replayBgs(saved);
                else AudioManager.stopBgs();
            } catch (e) { /* nothing to go back to */ }
            this._savedBgs = null;
        }

        _se(name, pitch, volume) {
            try {
                AudioManager.playSe({ name: name, volume: volume == null ? 80 : volume, pitch: pitch || 100, pan: 0 });
            } catch (e) { /* a missing SE must never break a game */ }
        }

        //--- flow -------------------------------------------------------------

        showBanner(text, color, seconds) {
            this._banner = text;
            this._bannerColor = color || null;
            this._bannerT = seconds || 1.6;
        }

        beginLineup() {
            this._waveNo++;
            if (this._waveNo > WAVES_PER_HEAT) { this.finish(); return; }

            this._field.clearFinished();
            this._rideScore = 0;
            this._rideTime = 0;
            this._tubeTime = 0;
            this._tube = 0;
            this._missed = false;
            this._popPrompt = false;
            this._lookYaw = 0;
            this._lookPitch = -0.20;

            const startX = this._interior ? POOL_START_X : 0;
            this._swell = this._field.spawnRide(startX, this._interior ? 1 : null);
            // Keep some background swell in the water, or by the third wave the
            // sea has nothing in it but the one you are waiting for.
            if (!this._interior) this._field.spawnFiller(startX);
            // Sitting up, facing the horizon, waiting for it like everybody does.
            this._surfer.reset(startX, LINEUP_Z, Math.PI);
            this._state = ST.LINEUP;
            this._timer = 0;
            if (this._interior) {
                this._world.fireGates();
                this._se('Buzzer1', 70, 60);
            }
            this._status = this._interior ? 'MACHINE ARMED' : 'SET APPROACHING';
            this.showBanner(`WAVE ${this._waveNo} / ${WAVES_PER_HEAT}`, '#fff2c6', 1.4);
        }

        popUp() {
            const F = this._field, s = this._swell, u = this._surfer;
            // d is how far SHOREWARD of the crest you are. It starts large and
            // positive with the swell still out to sea, falls to zero as the
            // crest arrives under you, and goes negative once it has gone by.
            const d = u.z - F.crestZ(s, u.x);
            const zc = F.crestZ(s, u.x);
            const margin = F.margin(s, u.x);

            if (d > 9 || zc < SHOAL_Z + 6) {
                this.showBanner('TOO EARLY', '#d9533d', 1.1);
                this._se('Buzzer1', 130, 55);
                return;
            }
            if (d < -2.5) {
                this._missWave('THE WAVE WENT WITHOUT YOU');
                return;
            }
            if (margin > 60) {
                this._missWave('TOO FAR DOWN THE LINE');
                return;
            }

            // On your feet, pointing down the line, with the drop still to come.
            u.yaw = s.dir > 0 ? 1.05 : -1.05;
            u.vx = s.dir * 3.5;
            u.vz = 3.0;
            this._state = ST.RIDE;
            this._rideTime = 0;
            this._status = '';
            this.showBanner('DROP IN!', '#93d86e', 1.0);
            this._se('Water1', 110, 80);
        }

        _missWave(reason) {
            this._missed = true;
            this.showBanner('MISSED IT', '#d9533d', 1.6);
            this._status = reason;
            this._state = ST.KICKOUT;
            this._timer = 1.8;
            this._se('Buzzer1', 90, 60);
        }

        wipeout(reason) {
            if (this._state !== ST.RIDE) return;
            this._state = ST.WIPEOUT;
            this._timer = 2.4;
            this._wipeSpin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
            this.showBanner('WIPEOUT', '#d9533d', 2.0);
            this._status = reason || '';
            this._se('Splash', 90, 95);
            this._se('Dive', 80, 70);
            const u = this._surfer;
            this._world.emitSpray(u.x, u.y + 0.4, u.z, 60, 7, 1.6);
            this._bankRide();
        }

        kickOut(reason) {
            if (this._state !== ST.RIDE) return;
            this._state = ST.KICKOUT;
            this._timer = 2.0;
            this._status = reason || '';
            this.showBanner('KICK OUT', '#e6c273', 1.6);
            this._se('Water3', 100, 70);
            this._bankRide();
        }

        _bankRide() {
            this._score += Math.round(this._rideScore);
            this._best = Math.max(this._best, Math.round(this._rideScore));
        }

        finish() {
            this._state = ST.RESULT;
            const par = PAR_PER_WAVE * WAVES_PER_HEAT;
            this._won = this._score >= par;
            if (RESULT_VAR > 0) $gameVariables.setValue(RESULT_VAR, this._won ? 1 : 2);
            if (window.MinigameFun) {
                if (this._won) window.MinigameFun.won('Surfing');
                else window.MinigameFun.lost('Surfing');
            }
            this._se(this._won ? 'Applause1' : 'Buzzer1', 100, 85);
            this._status = '';
        }

        //--- input ------------------------------------------------------------

        _readInput() {
            const turn =
                (Input.isPressed('surfRight') || Input.isPressed('pagedown') ? 1 : 0) -
                (Input.isPressed('surfLeft') || Input.isPressed('pageup') ? 1 : 0);
            return {
                turn: turn,
                pump: Input.isPressed('surfPump'),
                brake: Input.isPressed('surfBrake'),
                tuck: Input.isPressed('shift'),
                wave: this._swell
            };
        }

        _updateLook(dt) {
            let dy = 0, dp = 0;
            const k = 1.9 * LOOK_SPEED * dt;
            if (Input.isPressed('left'))  dy += k;
            if (Input.isPressed('right')) dy -= k;
            if (Input.isPressed('up'))    dp += k * 0.6;
            if (Input.isPressed('down'))  dp -= k * 0.6;

            if (TouchInput.isPressed()) {
                if (this._lastTouch) {
                    dy -= (TouchInput.x - this._lastTouch.x) * 0.006 * LOOK_SPEED;
                    dp -= (TouchInput.y - this._lastTouch.y) * 0.006 * LOOK_SPEED;
                }
                this._lastTouch = { x: TouchInput.x, y: TouchInput.y };
            } else {
                this._lastTouch = null;
            }

            // The right stick, at the game-wide camera speed and handedness
            // (window.Controller), so looking down the wave feels the same as
            // looking around any other 3D scene.
            const C = window.Controller;
            if (C) {
                const stick = C.stick('right');
                if (stick.x || stick.y) {
                    const gain = C.cameraSpeed();
                    const invert = C.invertCameraY() ? -1 : 1;
                    dy -= stick.x * k * 1.1 * gain;
                    dp -= stick.y * k * 0.7 * gain * invert;
                }
            }

            this._lookYaw = clamp(this._lookYaw + dy, -LOOK_YAW_LIM, LOOK_YAW_LIM);
            this._lookPitch = clamp(this._lookPitch + dp, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
            // The head drifts back to looking down the line when it is let go.
            if (!dy) this._lookYaw -= this._lookYaw * Math.min(1, dt * 1.1);
            if (!dp) this._lookPitch += (-0.20 - this._lookPitch) * Math.min(1, dt * 0.8);
        }

        //--- update -----------------------------------------------------------

        update() {
            super.update();
            const dt = SIM_DT;

            if (this._state === ST.ABORT) {
                this._drawHud();
                if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this.popScene();
                return;
            }
            if (Input.isTriggered('cancel') && this._state !== ST.RESULT) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }

            if (this._seCool > 0) this._seCool -= dt;
            if (this._bannerT > 0) this._bannerT -= dt;

            this._field.update(dt);
            this._updateLook(dt);

            switch (this._state) {
                case ST.LINEUP:  this.updateLineup(dt); break;
                case ST.RIDE:    this.updateRide(dt); break;
                case ST.WIPEOUT: this.updateWipeout(dt); break;
                case ST.KICKOUT: this.updateKickout(dt); break;
                case ST.RESULT:  this.updateResult(dt); break;
            }

            this._world.update(dt, this._field, this._surfer);
            if (!this._interior) this._syncTone(false);
            this._renderFrame(dt);
            this._drawHud();
            this._updateAscii();
        }

        updateLineup(dt) {
            const F = this._field, s = this._swell, u = this._surfer;
            this._timer += dt;
            const input = this._readInput();
            u.step(dt, input, 'paddle');

            const d = u.z - F.crestZ(s, u.x);
            const zc = F.crestZ(s, u.x);
            const ready = zc > SHOAL_Z + 6 && d > -2.5 && d < 9;
            if (ready && !this._popPrompt) {
                this._popPrompt = true;
                this._se('Water3', 120, 55);
            }
            this._status = ready
                ? 'NOW!'
                : (this._interior ? 'MACHINE ARMED' : 'SET APPROACHING');

            if (Input.isTriggered('ok')) this.popUp();
            else if (d < -6) this._missWave('THE WAVE WENT WITHOUT YOU');

            this._world.syncBoard(u, true);
            this._world.placeCamera(u, this._lookYaw, this._lookPitch, PADDLE_EYE, 0);
            this._world.setSpeedFov(0);
            this._world.setMood(0, false);
        }

        updateRide(dt) {
            const F = this._field, s = this._swell, u = this._surfer;
            const input = this._readInput();
            this._rideTime += dt;

            if (Input.isTriggered('ok') && !u.airborne) {
                if (u.jump(1)) {
                    this._se('Water3', 130, 60);
                    this._world.emitSpray(u.x, u.y, u.z, 10, 3, 1.2);
                }
            }

            const event = u.step(dt, input, 'ride');
            const speed = u.speed();
            const margin = F.margin(s, u.x);
            this._margin = margin;
            const foam = F.foamAt(u.x, u.z);
            const d = u.z - F.crestZ(s, u.x);
            const alive = F.alongLife(s, u.x);

            // The barrel: inside the pocket, low on the face, tucked under the
            // lip. It is a place on the wave, not a cutscene.
            const inPocket = margin > -0.5 && margin < 7;
            const tube = (inPocket && d > 0.4 && d < s.faceW * 1.9 && input.tuck) ? 1 : 0;
            this._tube += (tube - this._tube) * Math.min(1, dt * 6);
            if (this._tube > 0.5) {
                this._tubeTime += dt;
                this._rideScore += PTS_TUBE * dt;
                if (this._tubeTime > 0.6 && this._bannerT <= 0) {
                    this.showBanner('IN THE BARREL', '#5fc9a8', 1.2);
                }
            }

            // Points. Speed is the base, the pocket doubles it, the shoulder is
            // worth about as much as standing on the beach.
            const zone = margin < 0 ? 0.4 : (margin < 7 ? PTS_POCKET : (margin < 30 ? 1 : 0.25));
            if (!u.airborne) this._rideScore += speed * PTS_SPEED * zone * dt;

            switch (event) {
                case 'carve':
                    this._rideScore += PTS_CARVE * (zone > 1 ? 1.5 : 1);
                    this.showBanner('CARVE', '#e6c273', 0.9);
                    this._world.emitSpray(u.x, u.y + 0.2, u.z, 18, 4, 1.4);
                    if (this._seCool <= 0) { this._se('Water2', 120, 55); this._seCool = 0.35; }
                    break;
                case 'launch':
                    this.showBanner('AIR', '#fff2c6', 0.9);
                    this._se('Wind1', 130, 55);
                    break;
                case 'land': {
                    if (u.airTime > 0.35) {
                        const spinBonus = Math.floor(u.spin / (Math.PI / 2)) * 120;
                        this._rideScore += PTS_AIR * u.airTime + spinBonus;
                        this.showBanner(spinBonus > 0 ? 'SPIN LANDED' : 'STOMPED', '#93d86e', 1.1);
                    }
                    this._world.emitSpray(u.x, u.y, u.z, 16, 3.5, 1.0);
                    this._se('Water1', 105, 60);
                    break;
                }
                case 'crash':
                    this.wipeout('BLEW THE LANDING');
                    return;
            }

            // Spray off the rail, which is the only reason to look down.
            if (!u.airborne && speed > 6 && Math.random() < 0.6) {
                const back = 0.9;
                this._world.emitSpray(
                    u.x - Math.sin(u.yaw) * back, u.y + 0.1, u.z - Math.cos(u.yaw) * back,
                    1 + Math.floor(speed / 9), 1.4 + Math.abs(input.turn) * 3, 0.7);
            }

            // Endings.
            if (!u.airborne && foam > 0.62 && margin < 4) {
                this.wipeout('CAUGHT BY THE SECTION');
                return;
            }
            if (!u.airborne && d > 0.6 && speed < 2.6 && Math.abs(F.slope(u.x, u.z).z) > 0.55) {
                this.wipeout('PEARLED THE NOSE');
                return;
            }
            if (u.z > BEACH_Z - 4) {
                this.kickOut(this._interior ? 'WASHED UP ON THE BEACH END' : 'RODE IT TO THE SAND');
                return;
            }
            if (alive < 0.05) {
                this.kickOut(this._interior ? 'THAT IS THE END OF THE POOL' : 'THE WAVE SHOULDERED OFF');
                return;
            }
            if (margin > 90) { this.kickOut('OUT ON THE SHOULDER'); return; }

            const eye = EYE_H - u.crouch * 0.44;
            this._world.syncBoard(u, true);
            this._world.placeCamera(u, this._lookYaw, this._lookPitch, eye, 0);
            this._world.setSpeedFov(speed);
            this._world.setMood(this._tube, false);
            this._status = '';
        }

        updateWipeout(dt) {
            const u = this._surfer;
            this._timer -= dt;
            // Tumbled, held down, then let up. The board goes its own way.
            u.y += (this._field.height(u.x, u.z) - 1.6 - u.y) * Math.min(1, dt * 2.2);
            u.vx *= 0.94; u.vz *= 0.94;
            u.x += u.vx * dt; u.z += u.vz * dt;
            u.roll += this._wipeSpin * dt;

            this._world.syncBoard(u, false);
            this._world.placeCamera(u, this._lookYaw + this._wipeSpin * 0.5, -0.1, 0.5, u.roll);
            this._world.setSpeedFov(4);
            this._world.setMood(0, this._world.camera.position.y < this._field.height(u.x, u.z));
            if (this._timer <= 0) this.beginLineup();
        }

        updateKickout(dt) {
            const u = this._surfer;
            this._timer -= dt;
            u.vx *= 0.96; u.vz *= 0.96;
            u.x += u.vx * dt; u.z += u.vz * dt;
            u.y = this._field.height(u.x, u.z);
            this._world.syncBoard(u, true);
            this._world.placeCamera(u, this._lookYaw, this._lookPitch, EYE_H, 0);
            this._world.setSpeedFov(u.speed());
            this._world.setMood(0, false);
            if (this._timer <= 0) {
                if (this._missed) this._bankRide();
                this.beginLineup();
            }
        }

        updateResult() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                this.popScene();
            }
        }

        // The water mesh is the expensive part, so it is rebuilt at the same
        // cadence the 3D pass is rasterised at, not once per logic step.
        _renderFrame(dt) {
            if (this._isAscii()) return;
            this._renderAcc += dt;
            const step = 1 / RENDER_FPS;
            if (this._renderAcc < step) return;
            this._renderAcc = 0;
            this._world.syncWater(this._field, this._surfer.x);
            this._world.render();
            if (this._worldSprite && this._worldSprite.texture) this._worldSprite.texture.update();
        }

        //--- HUD --------------------------------------------------------------

        _hudText(bmp, str, x, y, w, align, color, size, opts) {
            if (this._hudDom) this._hudDom.text(str, x, y, w, align, color, size, opts);
            else if (window.PSXHud) window.PSXHud.text(bmp, str, x, y, w, align, color, size, opts);
        }

        _drawHud() {
            if (!window.PSXHud || !this._hud) return;
            this._hudTick = (this._hudTick || 0) + 1;
            if (this._hudTick % 2) return;
            const H = window.PSXHud;
            const D = H.DECO;
            const bmp = this._hud.bitmap;
            const w = this._hud.w, h = this._hud.h;
            bmp.clear();
            if (this._hudDom) this._hudDom.begin();

            if (this._state === ST.ABORT) {
                H.decoPanel(bmp, 20, h / 2 - 14, w - 40, 28, { step: 2 });
                this._hudText(bmp, this._status, 20, h / 2 - 8, w - 40, 'center', D.red, 8);
                if (this._hudDom) this._hudDom.end();
                return;
            }

            // Scoreline.
            H.decoPanel(bmp, 3, 3, 104, 34, { hairline: false, step: 1 });
            this._hudText(bmp, this._venue, 6, 2, 98, 'left', D.gold, 8);
            this._hudText(bmp, `WAVE ${Math.min(this._waveNo, WAVES_PER_HEAT)}/${WAVES_PER_HEAT}`,
                6, 11, 98, 'left', D.dim, 8);
            this._hudText(bmp, String(Math.round(this._score + this._rideScore)),
                6, 21, 98, 'right', D.goldHi, 16);

            // Where you are on the wave. This gauge is the game: the red band on
            // the left is the whitewater, the gold pip is you.
            if (this._state === ST.RIDE) {
                const gx = 3, gy = h - 46, gw = 128, gh = 20;
                H.decoPanel(bmp, gx, gy, gw, gh, { hairline: false, step: 1 });
                const bx = gx + 4, by = gy + 11, bw = gw - 8, bh = 5;
                bmp.fillRect(bx, by, bw, bh, '#0f0d14');
                const zoneW = Math.round(bw * 0.14);
                bmp.fillRect(bx, by, zoneW, bh, '#4a1c16');
                bmp.fillRect(bx + zoneW, by, Math.round(bw * 0.16), bh, '#2f4a2a');
                const t = clamp((this._margin + 14) / 104, 0, 1);
                const px = bx + Math.round(t * (bw - 2));
                bmp.fillRect(px, by - 2, 2, bh + 4, this._margin < 0 ? D.red : D.goldHi);
                const label = this._margin < 0 ? 'INSIDE'
                    : (this._margin < 7 ? 'POCKET'
                    : (this._margin < 30 ? 'FACE' : 'SHOULDER'));
                this._hudText(bmp, label, gx + 4, gy + 1, gw - 8, 'left', D.dim, 8);
                this._hudText(bmp, `${Math.round(this._margin)}M`, gx + 4, gy + 1, gw - 8, 'right', D.gold, 8);

                // Speed.
                const sx = gx, sy = h - 24, sw = 128, sh = 20;
                H.decoPanel(bmp, sx, sy, sw, sh, { hairline: false, step: 1 });
                H.decoBar(bmp, sx + 30, sy + 6, sw - 36, 8, clamp(this._surfer.speed() / MAX_SPEED, 0, 1), {
                    colorAt: t2 => (t2 < 0.55 ? D.jade : (t2 < 0.85 ? D.gold : D.goldHi))
                });
                this._hudText(bmp, 'SPD', sx + 4, sy + 5, 26, 'left', D.dim, 8);
            }

            // Prompt strip.
            if (this._status) {
                bmp.fillRect(0, h - 11, w, 11, D.black);
                bmp.fillRect(0, h - 11, w, 1, D.gold);
                this._hudText(bmp, this._status, 2, h - 10, w - 4, 'center', D.ink, 8);
            }

            // Banner.
            if (this._bannerT > 0 && this._banner) {
                const bw2 = Math.min(w - 40, 180);
                const bx2 = Math.round((w - bw2) / 2);
                const by2 = Math.round(h * 0.24);
                H.decoPanel(bmp, bx2, by2, bw2, 24, { hairline: false, step: 2 });
                this._hudText(bmp, this._banner, bx2, by2 + 2, bw2, 'center',
                    this._bannerColor || D.goldHi, 16, { shadow: true, shadowColor: D.shadow });
            }

            if (this._state === ST.RESULT) this._drawResult(bmp, w, h);
            if (this._hudDom) this._hudDom.end();
        }

        _drawResult(bmp, w, h) {
            const H = window.PSXHud;
            const D = H.DECO;
            const cw = 190, ch = 76;
            const cx = Math.round((w - cw) / 2), cy = Math.round((h - ch) / 2);
            H.decoPanel(bmp, cx, cy, cw, ch, { step: 3 });
            H.decoSunburst(bmp, cx + 1, cy + 12, 13, D.goldLo, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
            H.decoSunburst(bmp, cx + cw - 2, cy + 12, 13, D.goldLo, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            this._hudText(bmp, this._won ? 'HEAT WON' : 'HEAT LOST', cx, cy + 7, cw, 'center',
                this._won ? '#93d86e' : '#d9533d', 16);
            H.decoRule(bmp, cx + 10, cy + 30, cw - 20, D.goldLo);
            this._hudText(bmp, `TOTAL ${this._score}`, cx, cy + 34, cw, 'center', D.ink, 8);
            this._hudText(bmp, `BEST WAVE ${this._best}   PAR ${PAR_PER_WAVE * WAVES_PER_HEAT}`,
                cx, cy + 44, cw, 'center', D.dim, 8);
        }

        //--- ASCII ------------------------------------------------------------

        _isAscii() {
            if (window.AsciiMode && window.AsciiMode.active) return true;
            return !!(window.ConfigManager && ConfigManager.asciiModeEnabled);
        }

        _updateAscii() {
            const on = this._isAscii();
            if (this._asciiSprite) {
                this._asciiSprite.visible = on;
                if (on) this._drawAscii();
            }
            if (this._worldSprite) this._worldSprite.visible = !on;
        }

        // Looking down on the wave from above: the crest line, the part of it
        // that has already fallen over, and you.
        _drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            const F = this._field, s = this._swell, u = this._surfer;
            bmp.clear();
            bmp.fillRect(0, 0, Graphics.width, Graphics.height, '#000000');

            const cw = 10, chh = 16;
            const cols = Math.floor(Graphics.width / cw);
            const rows = Math.floor(Graphics.height / chh);
            const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));

            const top = 5;
            const viewW = 160, viewD = 70;
            const toCol = (x) => Math.round(((x - u.x + viewW / 2) / viewW) * (cols - 1));
            const toRow = (z) => top + Math.round(((z - (u.z - viewD * 0.35)) / viewD) * (rows - top - 2));

            if (s) {
                for (let c = 0; c < cols; c++) {
                    const x = u.x + (c / (cols - 1)) * viewW - viewW / 2;
                    const r = toRow(F.crestZ(s, x));
                    if (r < top || r >= rows) continue;
                    const broken = F.breakAmount(s, x) > 0.1;
                    if (F.alongLife(s, x) > 0.05) grid[r][c] = broken ? '#' : '~';
                }
            }
            const br = toRow(BEACH_Z), pc = toCol(u.x), pr = toRow(u.z);
            if (br >= top && br < rows) for (let c = 0; c < cols; c++) grid[br][c] = '=';
            if (pr >= top && pr < rows && pc >= 0 && pc < cols) grid[pr][pc] = 'A';

            bmp.textColor = '#FFFFFF';
            for (let r = 0; r < rows; r++) bmp.drawText(grid[r].join(''), 0, r * chh, Graphics.width, chh, 'left');

            bmp.textColor = '#FFE36B';
            bmp.drawText(T('Surfing.hud.wave', { venue: this._venue, wave: Math.min(this._waveNo, WAVES_PER_HEAT), total: WAVES_PER_HEAT }),
                8, 0, Graphics.width, chh, 'left');
            bmp.drawText(T('Surfing.hud.stats', { score: Math.round(this._score + this._rideScore), speed: this._surfer.speed().toFixed(1), margin: Math.round(this._margin) }),
                8, chh, Graphics.width, chh, 'left');
            if (this._banner && this._bannerT > 0) {
                bmp.drawText(this._banner, 0, chh * 2, Graphics.width, chh, 'center');
            }
            if (this._status) bmp.drawText(this._status, 0, chh * 3, Graphics.width, chh, 'center');
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            this._restoreKeys();
            this._stopAmbience();
            if (this._hudDom) {
                try { this._hudDom.destroy(); } catch (e) { /* already gone */ }
                this._hudDom = null;
            }
            if (this._worldSprite) {
                if (this._worldSprite.parent) this._worldSprite.parent.removeChild(this._worldSprite);
                this._worldSprite.destroy();
                this._worldSprite = null;
            }
            if (this._world) {
                this._world.dispose();
                this._world = null;
            }
        }
    }

    //=========================================================================
    // Registration
    //=========================================================================
    window.Scene_SurfingGame = Scene_SurfingGame;

    const open = () => SceneManager.push(Scene_SurfingGame);
    PluginManager.registerCommand(PLUGIN_NAME, 'startSurfingGame', open);
    // SandboxMode and older common events call it by the shorter name.
    PluginManager.registerCommand(PLUGIN_NAME, 'startSurfing', open);

    window.startSurfingMiniGame = open;
})();
