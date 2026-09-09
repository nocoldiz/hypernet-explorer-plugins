//=============================================================================
// AnimatedHorseRace.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Animated Horse Race v3.0.0 - A real turf course in 3D
 * (three.js / PSXShader) with procedural runners.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 * @help AnimatedHorseRace.js
 *
 * A racecourse standing in the world rather than a row of bars sliding across
 * a page: mown turf, running rails, a starting gate that springs open, distance
 * poles, a winning post and a grandstand, rendered with three.js through the
 * shared PSXShader the way BowlingMinigame.js draws its alley and
 * AnimatedSlotMachine.js its cabinet.
 *
 * The runners are the game's own procedural creatures. Each one is built by
 * window.Battler3D (the 3D battler families) from ITS OWN NAME: the name is
 * hashed and that hash is handed to the battler system as the identity it keys
 * a species' coat, colour, texture and proportions to, so "Midnight Storm" is
 * the same horse in every world and no two names ever produce the same animal.
 * The name also decides the breed, so an ordinary name brings a horse to the
 * gate and one of the sillier ones can bring a unicorn, a hellhound, a hare or
 * an elephant. The silks are cut from the same hash and worn twice: on the
 * jockey and on the number cloth over the runner's flank, so the colour beside
 * a name on the race card is the colour running down the track.
 *
 * It is heard as well as seen: the crowd is a bed under the whole meeting, the
 * gates clang and the bell rings at the off, hooves roll past at the cadence
 * the leaders are actually running, a whip cracks when a runner makes its move,
 * and the post is a bell, a cheer or a groan. Every sound is a file in audio/se
 * named by a parameter, so the whole meeting can be re-voiced.
 *
 * The HUD is built the way a PlayStation built one, minus the television: a
 * 240-line virtual framebuffer upscaled with nearest filtering for the boxes,
 * keylines and block gauges, with every label on top of them as crisp HTML type
 * (window.PSXHud / PSXHud.domPanel), dressed in the same gold on black the
 * alley, the court and the cabinet wear. No scanlines, no vignette.
 *
 * Opened from the title screen's free-play arcade the meeting runs on play
 * money (a local chip stack), never on the party's arcade tokens, and re-stakes
 * the player instead of locking them out when the stack runs dry.
 *
 * Use Plugin Command: "Open Horse Race"
 * or Script Call: SceneManager.push(Scene_HorseRace);
 *
 * Controls:
 *   Up / Down .................. Move down the race card
 *   Left / Right ............... Change the stake (hold Shift for ten)
 *   Enter / Z / click .......... Back the horse under the cursor
 *   Esc / X .................... Leave
 *
 * Requires js/libs/three.min.js, Battler3D/PSXShader.js and the 3D battler
 * families; without them the meeting is still run and settled on the card.
 *
 * @param minBet
 * @text Minimum Bet
 * @desc Minimum tokens to bet
 * @type number
 * @default 1
 *
 * @param maxBet
 * @text Maximum Bet
 * @desc Maximum tokens to bet
 * @type number
 * @default 100
 *
 * @param tokenItemId
 * @text Token Item ID
 * @desc ID of the token item in database (124 = Arcade Token)
 * @type number
 * @default 124
 *
 * @param ---Sound Effects---
 * @default
 *
 * @param crowdBgs
 * @parent ---Sound Effects---
 * @text Crowd Loop
 * @desc The crowd under the whole meeting, played as a BGS.
 * @type file
 * @dir audio/bgs/
 * @default People1
 *
 * @param gateSe
 * @parent ---Sound Effects---
 * @text Starting Gate
 * @desc The stalls springing open.
 * @type file
 * @dir audio/se/
 * @default Items/metalLatch
 *
 * @param bellSe
 * @parent ---Sound Effects---
 * @text Off Bell
 * @desc The bell that starts the race.
 * @type file
 * @dir audio/se/
 * @default Bell1
 *
 * @param hoofSe
 * @parent ---Sound Effects---
 * @text Hoofbeat
 * @desc One hoof on turf, played at the cadence the leaders are running.
 * @type file
 * @dir audio/se/
 * @default StepSound/gravel
 *
 * @param whipSe
 * @parent ---Sound Effects---
 * @text Whip
 * @desc A jockey asking for more.
 * @type file
 * @dir audio/se/
 * @default Whip1
 *
 * @param neighSe
 * @parent ---Sound Effects---
 * @text Runner Call
 * @desc A runner sounding off at the gate and at the post.
 * @type file
 * @dir audio/se/
 * @default Horse
 *
 * @param postSe
 * @parent ---Sound Effects---
 * @text Winning Post
 * @desc The bell as the winner passes the post.
 * @type file
 * @dir audio/se/
 * @default Bell3
 *
 * @param cheerSe
 * @parent ---Sound Effects---
 * @text Crowd Cheer
 * @desc The stand when the player's pick wins.
 * @type file
 * @dir audio/se/
 * @default Applause1
 *
 * @param groanSe
 * @parent ---Sound Effects---
 * @text Crowd Groan
 * @desc The stand when it does not.
 * @type file
 * @dir audio/se/
 * @default Down1
 *
 * @param betSe
 * @parent ---Sound Effects---
 * @text Stake Sound
 * @desc A chip moving up or down the stack.
 * @type file
 * @dir audio/se/
 * @default Casino/chip_lay_1
 *
 * @param slipSe
 * @parent ---Sound Effects---
 * @text Bet Struck
 * @desc The bet going on.
 * @type file
 * @dir audio/se/
 * @default Casino/chips_stack_1
 *
 * @param denySe
 * @parent ---Sound Effects---
 * @text Refused
 * @desc A bet the purse cannot cover.
 * @type file
 * @dir audio/se/
 * @default Buzzer1
 *
 * @command openHorseRace
 * @text Open Horse Race
 * @desc Opens the horse racing minigame
 */

(() => {
    'use strict';

    const pluginName = "AnimatedHorseRace";
    const parameters = PluginManager.parameters(pluginName);
    const MIN_BET = parseInt(parameters['minBet']) || 1;
    const MAX_BET = parseInt(parameters['maxBet']) || 9999;
    const TOKEN_ITEM_ID = parseInt(parameters['tokenItemId']) || 124;
    // Play-money bankroll for the title screen's free-play arcade.
    const FREE_PLAY_CHIPS = 50;

    // Forward declaration: the scene class is defined near the bottom, the
    // plugin command needs the binding to exist now.
    let Scene_HorseRace;

    PluginManager.registerCommand(pluginName, "openHorseRace", () => {
        SceneManager.push(Scene_HorseRace);
    });

    //=========================================================================
    // Sound. A racecourse is mostly heard: the crowd is a bed the whole meeting
    // sits on, the gates and the bell are the off, the hooves are the race
    // itself and the post is a bell followed by whichever noise the stand makes.
    // Every one of them is a file named by a parameter.
    //=========================================================================
    const se = (key, def, volume) => ({
        name: parameters[key] || def, volume: volume, pitch: 100
    });

    const SE = {
        gate:  se('gateSe', 'Items/metalLatch', 75),
        bell:  se('bellSe', 'Bell1', 80),
        hoof:  se('hoofSe', 'StepSound/gravel', 34),
        whip:  se('whipSe', 'Weapons/Whip1', 62),
        neigh: se('neighSe', 'Horse', 70),
        post:  se('postSe', 'Bell3', 85),
        cheer: se('cheerSe', 'Applause1', 90),
        groan: se('groanSe', 'Down1', 55),
        bet:   se('betSe', 'Casino/chip_lay_1', 55),
        slip:  se('slipSe', 'Casino/chips_stack_1', 70),
        deny:  se('denySe', 'Buzzer1', 70)
    };

    const CROWD_BGS = parameters['crowdBgs'] || 'People1';

    function playSe(sound, pitch, volume, pan) {
        if (!sound || !sound.name) return;
        AudioManager.playSe({
            name: sound.name,
            volume: Math.round(Math.max(0, volume != null ? volume : sound.volume)),
            pitch: Math.round(Math.max(50, Math.min(150, pitch != null ? pitch : sound.pitch))),
            pan: Math.round(Math.max(-100, Math.min(100, pan || 0)))
        });
    }

    //=========================================================================
    // Identity. Everything about a runner that is not its form on the day is a
    // function of its NAME, so the same name always brings the same animal to
    // the gate whatever else the world has done since.
    //=========================================================================
    function hashStr(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    function mulberry32(a) {
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function pickWeighted(table, rng) {
        let total = 0;
        for (const row of table) total += row[1];
        let roll = rng() * total;
        for (const row of table) {
            roll -= row[1];
            if (roll <= 0) return row[0];
        }
        return table[table.length - 1][0];
    }

    // Which creature a name brings. An ordinary name is nearly always a horse;
    // the sillier half of the name bank is where the meeting gets its hares and
    // its hellhounds. Every key here is a registered 3D battler archetype.
    const KIND_NORMAL = [['horse', 82], ['unicorn', 11], ['beast', 7]];
    const KIND_WEIRD = [
        ['horse', 32], ['unicorn', 17], ['hellhound', 14],
        ['beast', 13], ['rabbit', 12], ['elephant', 7], ['centaur', 5]
    ];
    // Withers height in metres, so an elephant is an elephant next to a hare.
    const KIND_HEIGHT = {
        horse: 1.78, unicorn: 1.74, hellhound: 1.42,
        beast: 1.38, rabbit: 1.05, elephant: 2.75, centaur: 2.15
    };

    // Racing silks, in pairs (field, device) so a set reads at a distance.
    const SILKS = [
        ['#d94a3a', '#f4e3c0'], ['#2f6fd0', '#f4e3c0'], ['#3f9b52', '#101010'],
        ['#e8c23f', '#4a2a10'], ['#6f3fb0', '#f4e3c0'], ['#e8762f', '#101010'],
        ['#1d9ea8', '#f4e3c0'], ['#c23f8a', '#f4e3c0'], ['#101010', '#e8c23f'],
        ['#f0eee6', '#c22a2a'], ['#7a5230', '#f0eee6'], ['#4a5c8a', '#e8c23f']
    ];
    const SILK_PATTERNS = ['solid', 'hoops', 'sash', 'quarters', 'star', 'chevron'];

    function identityFor(name, weird) {
        const h = hashStr(name);
        const rng = mulberry32(h);
        const silk = SILKS[Math.floor(rng() * SILKS.length) % SILKS.length];
        return {
            // The identity the 3D battler system keys a species' look to. Kept
            // inside the ordinary enemy id range so nothing downstream chokes
            // on it, and derived from the name alone.
            seedId: 1 + (h % 9973),
            kind: pickWeighted(weird ? KIND_WEIRD : KIND_NORMAL, rng),
            silk: silk[0],
            device: silk[1],
            pattern: SILK_PATTERNS[Math.floor(rng() * SILK_PATTERNS.length) % SILK_PATTERNS.length],
            // How this one runs: where in the race it wants to be, so the field
            // is not six copies of the same pace.
            frontRunner: rng()
        };
    }

    //=========================================================================
    // The field. Thirty horses per world, six of them drawn for each race.
    //=========================================================================
    function getNamePart(type) {
        return T.list('AnimatedHorseRace.' + type);
    }

    class SeededRandom {
        constructor(seed) { this.seed = seed; }
        next() {
            this.seed = (this.seed * 9301 + 49297) % 233280;
            return this.seed / 233280;
        }
    }

    function worldSeed() {
        let historySeed = 19002001;
        try {
            if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
                historySeed = window.HistoryManager.getSeed();
            } else if (typeof $gameSystem !== 'undefined' && $gameSystem && $gameSystem._historySeed !== undefined) {
                historySeed = $gameSystem._historySeed;
            }
        } catch (e) { /* the default seed is a perfectly good world */ }
        return historySeed % 1000000;
    }

    function generateHorsePool() {
        const rng = new SeededRandom(worldSeed());
        const pool = [];

        const normalPrefixes = getNamePart('normalPrefixes');
        const normalSuffixes = getNamePart('normalSuffixes');
        const weirdPrefixes = getNamePart('weirdPrefixes');
        const weirdSuffixes = getNamePart('weirdSuffixes');

        for (let i = 0; i < 30; i++) {
            let name;
            let weird = false;
            if (rng.next() < 0.4 && weirdPrefixes.length && weirdSuffixes.length) {
                weird = true;
                const prefix = weirdPrefixes[Math.floor(rng.next() * weirdPrefixes.length)];
                const suffix = weirdSuffixes[Math.floor(rng.next() * weirdSuffixes.length)];
                name = `${prefix} ${suffix}`;
            } else if (rng.next() < 0.6 || !normalSuffixes.length) {
                name = normalPrefixes[Math.floor(rng.next() * normalPrefixes.length)] || 'Runner';
            } else {
                const prefix = normalPrefixes[Math.floor(rng.next() * normalPrefixes.length)];
                const suffix = normalSuffixes[Math.floor(rng.next() * normalSuffixes.length)];
                name = `${prefix} ${suffix}`;
            }
            const identity = identityFor(name, weird);
            pool.push(Object.assign({
                id: i,
                name: name,
                weird: weird,
                strength: 0.3 + rng.next() * 0.4,
                luck: 0.3 + rng.next() * 0.4,
                position: 0,
                odds: 0
            }, identity));
        }
        return pool;
    }

    let globalHorsePool = null;
    function getHorsePool() {
        if (!globalHorsePool) globalHorsePool = generateHorsePool();
        return globalHorsePool;
    }

    // True when the race was opened from the title screen's free-play arcade,
    // which runs on a throwaway game context with no save behind it.
    function isFreePlay() {
        const arcade = window.MinigameArcade;
        return !!(arcade && arcade.isFreePlay && arcade.isFreePlay());
    }

    //=========================================================================
    // The course, in metres. Every figure below is a real one: a length is what
    // a length is, and the runners cover the ground at a speed a horse covers
    // it at, which is what makes the camera work follow a race rather than a
    // progress bar.
    //=========================================================================
    const LANES = 6;
    const LANE_W = 2.9;
    const RACE_LEN = 380;              // gate to post
    const RUNOFF = 90;                 // pull-up ground past the post
    const APPROACH = 34;               // ground behind the gate
    const HALF_TRACK = (LANES * LANE_W) / 2 + 2.4;
    const LENGTH_M = 2.4;              // one length, for the running order
    const PACE = 21.5;                 // rating -> metres per second

    // A battler model is built around the middle of its body, so the figure the
    // race is run in (how far the NOSE has gone) is not where the model stands.
    const NOSE_AHEAD = 1.6;
    const SEAT_SHARE = 0.72;           // where a back is, as a share of the measured height
    const GATE_FRONT = -0.3;           // the plane the doors are hung on
    const GATE_BACK = -4.1;            // the back of the stalls

    const laneZ = (lane) => (lane - (LANES - 1) / 2) * LANE_W;

    //=========================================================================
    // The model. One runner's race is written ONCE, here, because the price on
    // the card is quoted by running this same code a few hundred times before
    // the gates open. A book priced off anything else is a book a player can
    // beat by reading the form: the first version of this race estimated a win
    // chance from the strength and luck terms and paid out on that, while the
    // race itself was very nearly decided at the off, so backing the favourite
    // returned 144% of stake and the house lost money on every meeting.
    //
    // The two halves of that fix are both here: the abilities are close
    // together (a field of racehorses differs by a few percent, not by two to
    // one) and what a runner does on the day is a CORRELATED wobble rather than
    // per-frame noise. White noise averages itself away over a thousand frames
    // and leaves ability to decide everything; a slow drift means a runner
    // travels well or badly in patches, which is what beats a better horse.
    //=========================================================================
    const FORM_SPREAD = 0.20;    // race-day form, rolled once per runner
    const DRIFT_SIGMA = 1.05;    // how far a runner's travelling wanders
    const DRIFT_PULL = 0.85;     // and how quickly it is pulled back
    const SURGE_RATE = 0.5;      // runs at the finish per second, once in range

    function newRunState(horse, rnd) {
        return {
            ability: 0.90 + horse.strength * 0.20,     // 0.96 .. 1.04
            stay: 0.93 + horse.luck * 0.14,            // 0.97 .. 1.03
            form: 1 + (rnd() - 0.5) * FORM_SPREAD,
            drain: 0.034 * (1.6 - horse.luck),
            shape: (horse.frontRunner - 0.5) * 0.30,
            stamina: 1, pos: 0, drift: 0, v: 0,
            surged: false, surgeT: 0, justSurged: false
        };
    }

    // One step, in seconds. Written to be step-size independent (the drift is
    // scaled by the square root of the step, the surge by the step itself) so
    // the pricing model can run the same race in quarter-second strides that
    // the course runs at sixtieths and get the same answer.
    function stepRun(s, dt, rnd) {
        // The exact discretisation of the wobble rather than a rough one: the
        // rough form leaves a quarter-second stride noisier than a sixtieth,
        // which would make the book a shade more sure of a short-priced runner
        // than the race it is pricing actually is.
        const decay = Math.exp(-DRIFT_PULL * dt);
        const kick = Math.sqrt((1 - decay * decay) / (2 * DRIFT_PULL));
        s.drift = s.drift * decay + (rnd() - 0.5) * DRIFT_SIGMA * kick;
        s.stamina = Math.max(0.45, s.stamina - dt * s.drain);

        const progress = s.pos / RACE_LEN;
        // Where a runner wants to be in the race: a front runner spends itself
        // early, a closer keeps something for the straight.
        const shape = 1 + s.shape * (1 - progress * 2);

        s.justSurged = false;
        if (!s.surged && progress > 0.62 && s.stamina > 0.5 && rnd() < dt * SURGE_RATE) {
            s.surged = true;
            s.surgeT = 2.6;
            s.justSurged = true;
        }
        if (s.surgeT > 0) s.surgeT -= dt;

        s.v = Math.max(1, PACE * s.ability * s.stay * s.form * shape *
            Math.pow(s.stamina, 0.55) * (1 + s.drift) * (s.surgeT > 0 ? 1.10 : 1));
        s.pos += s.v * dt;
        return s.v;
    }

    // A price is carried to one decimal under 5/1 and whole above it, because
    // whole numbers alone cannot express a short one: a runner with a one in
    // three chance is worth about 2.7/1 after the house takes its cut, and
    // rounding that to 2/1 made the favourite the WORST bet on the card, so
    // reading the form actively cost the player money.
    const oddsText = (odds) => (odds >= 10 ? String(Math.round(odds)) : odds.toFixed(1));
    const payout = (bet, odds) => Math.max(1, Math.floor(bet * odds));

    // Run the whole thing out in quarter-second strides and answer who won.
    // Used only for pricing, so it does not care about anything but the order.
    function simulateRace(horses, rnd) {
        const states = horses.map(h => newRunState(h, rnd));
        for (let step = 0; step < 600; step++) {
            let done = false;
            for (const s of states) {
                if (s.pos < RACE_LEN) stepRun(s, 0.25, rnd);
                if (s.pos >= RACE_LEN) done = true;
            }
            if (done) break;
        }
        let best = 0;
        for (let i = 1; i < states.length; i++) {
            if (states[i].pos > states[best].pos) best = i;
        }
        return best;
    }

    const STATE = { SELECTION: 'selection', RACING: 'racing', RESULTS: 'results' };

    const CAM = { PADDOCK: 'paddock', BROADCAST: 'broadcast', HEADON: 'headon', POST: 'post' };

    // The course is built and rendered through the player's own retro settings,
    // dialled slightly DOWN: a whole landscape snapped hard at 240 lines turns
    // the rails into a staircase. The tunables are scaled rather than replaced,
    // so switching the shader off in the options still switches it off here.
    const PSX_TURF = { vertexSnap: 1.6, colorLevels: 1.2, dither: 0.8, downscale: 1 };

    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_TURF, fn)
        : fn();

    //=========================================================================
    // Track3D - the three.js stage. Renders to its own canvas which the scene
    // composites as a PIXI sprite, the same approach the bowling, basketball
    // and slot machine scenes use.
    //=========================================================================
    class Track3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed() >>> 0);
            this._disposables = [];
            this._runners = [];
            this._gates = [];
            this._crowd = null;
            this._time = 0;
            this._camMode = CAM.PADDOCK;
            this._camPos = new THREE.Vector3(-20, 7, 24);
            this._camLook = new THREE.Vector3(4, 1.6, 0);
            this._wantPos = this._camPos.clone();
            this._wantLook = this._camLook.clone();

            this._initThree();
            softPSX(() => {
                this._buildSky();
                this._buildTurf();
                this._buildRails();
                this._buildDistancePoles();
                this._buildGate();
                this._buildPost();
                this._buildStand();
                this._buildScenery();
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.Fog(0xbcd0e0, 260, 1400);
            this.camera = new THREE.PerspectiveCamera(52, this._w / this._h, 0.5, 3000);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x9dc0dd, 1);

            this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x3c5a2a, 0.85));
            const sun = new THREE.DirectionalLight(0xfff0d0, 0.85);
            sun.position.set(-120, 180, 90);
            this.scene.add(sun);
        }

        //--- helpers ---------------------------------------------------------

        _mat(options) {
            const m = new THREE.MeshLambertMaterial(options);
            this._disposables.push(m);
            return m;
        }

        _basic(options) {
            const m = new THREE.MeshBasicMaterial(options);
            this._disposables.push(m);
            return m;
        }

        _geo(g) {
            this._disposables.push(g);
            return g;
        }

        _box(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

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

        //--- the ground and the sky -------------------------------------------

        _buildSky() {
            const tex = this._canvasTexture(8, 128, (ctx, w, h) => {
                const grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0.00, '#2f5f9c');
                grad.addColorStop(0.42, '#7fb0da');
                grad.addColorStop(0.72, '#bcd6e6');
                grad.addColorStop(1.00, '#d8e2d4');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
            });
            const dome = new THREE.Mesh(
                this._geo(new THREE.SphereGeometry(1600, 18, 12)),
                this._basic({ map: tex, side: THREE.BackSide, fog: false })
            );
            dome.position.set(RACE_LEN / 2, 0, 0);
            this.scene.add(dome);

            // A handful of slabs standing in for weather. Flat and unlit, the
            // way a period renderer would have afforded them.
            const cloudMat = this._basic({ color: 0xf2f6fa, fog: false });
            for (let i = 0; i < 9; i++) {
                const r = this._rand;
                const cloud = new THREE.Mesh(
                    this._geo(new THREE.BoxGeometry(120 + r() * 220, 16 + r() * 14, 70 + r() * 90)),
                    cloudMat
                );
                cloud.position.set(-300 + r() * 1200, 210 + r() * 120, -700 + r() * 1400);
                this.scene.add(cloud);
            }
        }

        // Mown turf: the bands a roller leaves, running across the course, so
        // the ground reads as ground and the speed reads as speed.
        _buildTurf() {
            const tex = this._canvasTexture(32, 32, (ctx, w, h) => {
                ctx.fillStyle = '#3f7a34';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#4a8c3c';
                ctx.fillRect(0, 0, w / 2, h);
                for (let i = 0; i < 180; i++) {
                    const x = Math.floor(this._rand() * w);
                    const y = Math.floor(this._rand() * h);
                    ctx.fillStyle = this._rand() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(210,235,160,0.10)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }, (RACE_LEN + RUNOFF + APPROACH) / 14, (HALF_TRACK * 2) / 14);

            const len = RACE_LEN + RUNOFF + APPROACH;
            const turf = new THREE.Mesh(
                this._geo(new THREE.PlaneGeometry(len, HALF_TRACK * 2, 24, 3)),
                this._mat({ map: tex })
            );
            turf.rotation.x = -Math.PI / 2;
            turf.position.set(len / 2 - APPROACH, 0, 0);
            this.scene.add(turf);

            // The infield and the outfield, flat and darker, so the course does
            // not float on nothing when the camera swings wide.
            const groundMat = this._mat({ color: 0x3a6b30 });
            const apron = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(2600, 1800)), groundMat);
            apron.rotation.x = -Math.PI / 2;
            apron.position.set(RACE_LEN / 2, -0.06, 0);
            this.scene.add(apron);

            // The line at the post, painted on the grass.
            this._box(0.8, 0.02, HALF_TRACK * 2 - 1, this._mat({ color: 0xf4f2e8 }),
                RACE_LEN, 0.03, 0);
        }

        _buildRails() {
            const railMat = this._mat({ color: 0xf0ece0 });
            const postMat = this._mat({ color: 0xdad4c4 });
            const len = RACE_LEN + RUNOFF + APPROACH;
            const midX = len / 2 - APPROACH;

            for (const side of [-1, 1]) {
                const z = side * HALF_TRACK;
                this._box(len, 0.09, 0.09, railMat, midX, 1.15, z);
                this._box(len, 0.09, 0.09, railMat, midX, 0.72, z);
            }

            // Posts as one instanced mesh: a rail is four hundred of the same
            // stick and there is no reason to submit each of them separately.
            const step = 6;
            const perSide = Math.floor(len / step) + 1;
            const count = perSide * 2;
            const geo = this._geo(new THREE.BoxGeometry(0.13, 1.3, 0.13));
            const posts = new THREE.InstancedMesh(geo, postMat, count);
            const m = new THREE.Matrix4();
            let i = 0;
            for (const side of [-1, 1]) {
                for (let k = 0; k < perSide; k++) {
                    m.makeTranslation(-APPROACH + k * step, 0.65, side * HALF_TRACK);
                    posts.setMatrixAt(i++, m);
                }
            }
            posts.instanceMatrix.needsUpdate = true;
            this.scene.add(posts);
            this._disposables.push(posts);
        }

        // The poles that tell a jockey how much is left. Every hundred metres,
        // painted, with the last one before the post in red.
        _buildDistancePoles() {
            const white = this._mat({ color: 0xf0ece0 });
            const red = this._mat({ color: 0xc23a2a });
            const green = this._mat({ color: 0x2f6f3a });
            for (let d = 100; d < RACE_LEN; d += 100) {
                const last = (RACE_LEN - d) <= 100;
                const pole = this._box(0.16, 2.1, 0.16, white, RACE_LEN - d, 1.05, -HALF_TRACK - 0.9);
                const plate = new THREE.Mesh(
                    this._geo(new THREE.BoxGeometry(0.9, 0.55, 0.08)),
                    last ? red : green
                );
                plate.position.set(0, 1.2, 0.06);
                pole.add(plate);
            }
        }

        // Six stalls with doors that swing out of the way at the off. The stalls
        // have depth, because the runners stand IN them: the doors are hung on
        // the front plane and the dividers run back from it.
        _buildGate() {
            const frame = this._mat({ color: 0x2f4a6a });
            const doorMat = this._mat({ color: 0xd8d2c0 });
            const roofMat = this._mat({ color: 0x24384f });
            const depth = GATE_FRONT - GATE_BACK;
            const midX = (GATE_FRONT + GATE_BACK) / 2;

            this._box(depth + 0.4, 0.3, HALF_TRACK * 2, roofMat, midX, 2.9, 0);
            for (let lane = 0; lane <= LANES; lane++) {
                const z = laneZ(0) - LANE_W / 2 + lane * LANE_W;
                // A divider between stalls, and an upright at each end of it.
                this._box(depth, 2.2, 0.1, frame, midX, 1.2, z);
                this._box(0.22, 2.75, 0.22, frame, GATE_FRONT, 1.38, z);
                this._box(0.22, 2.75, 0.22, frame, GATE_BACK, 1.38, z);
            }
            for (let lane = 0; lane < LANES; lane++) {
                // The door is hung on a pivot at the inside edge of its stall so
                // it swings forward and out of the runner's way.
                const hinge = new THREE.Group();
                hinge.position.set(GATE_FRONT, 1.2, laneZ(lane) - LANE_W / 2 + 0.08);
                const door = new THREE.Mesh(
                    this._geo(new THREE.BoxGeometry(0.09, 2.0, LANE_W - 0.2)),
                    doorMat
                );
                door.position.set(0, 0, (LANE_W - 0.2) / 2);
                hinge.add(door);
                this.scene.add(hinge);
                this._gates.push({ hinge: hinge, open: 0 });
            }
        }

        _buildPost() {
            const white = this._mat({ color: 0xf2eee0 });
            const gold = this._mat({ color: 0xd9b463 });
            const black = this._mat({ color: 0x14100e });

            for (const side of [-1, 1]) {
                this._box(0.5, 6.2, 0.5, white, RACE_LEN, 3.1, side * (HALF_TRACK + 1.1));
                this._box(0.7, 0.3, 0.7, gold, RACE_LEN, 6.35, side * (HALF_TRACK + 1.1));
            }
            // The crossbeam, and the wire under it the winner breaks.
            this._box(0.5, 0.5, HALF_TRACK * 2 + 2.2, black, RACE_LEN, 6.0, 0);
            this._box(0.09, 0.09, HALF_TRACK * 2 + 2.2, gold, RACE_LEN, 2.6, 0);

            const boardTex = this._canvasTexture(128, 40, (ctx, w, h) => {
                ctx.fillStyle = '#14100e';
                ctx.fillRect(0, 0, w, h);
                ctx.strokeStyle = '#e6c273';
                ctx.lineWidth = 3;
                ctx.strokeRect(3, 3, w - 6, h - 6);
                ctx.fillStyle = '#e6c273';
                for (let i = 0; i < 6; i++) ctx.fillRect(14 + i * 18, 16, 10, 8);
            });
            const board = new THREE.Mesh(
                this._geo(new THREE.PlaneGeometry(9, 2.6)),
                this._basic({ map: boardTex, side: THREE.DoubleSide })
            );
            board.position.set(RACE_LEN, 7.8, 0);
            board.rotation.y = -Math.PI / 2;
            this.scene.add(board);
        }

        // The stand at the post: tiers, a roof, flags and a crowd that moves.
        _buildStand() {
            const z0 = HALF_TRACK + 9;
            const concrete = this._mat({ color: 0x8f8b80 });
            const shade = this._mat({ color: 0x5a5750 });
            const roofMat = this._mat({ color: 0x3a3f4a });

            const tiers = 7;
            for (let t = 0; t < tiers; t++) {
                this._box(96, 1.4, 3.2, t % 2 ? concrete : shade,
                    RACE_LEN - 12, 1.0 + t * 1.25, z0 + t * 3.0);
            }
            // Roof on columns over the back of the stand.
            this._box(96, 0.6, 16, roofMat, RACE_LEN - 12, 13.4, z0 + 10);
            for (let i = 0; i < 7; i++) {
                this._box(0.7, 12.5, 0.7, shade, RACE_LEN - 54 + i * 14, 6.6, z0 + 17);
            }

            // The crowd: one instanced block per body, bobbed on the spot, which
            // at this distance is a crowd. It is dealt over a handful of meshes
            // rather than coloured per instance, because this three build only
            // applies a per-instance colour to materials that already carry
            // vertex colours: one mesh a colour is both correct and cheap.
            const rows = tiers, perRow = 44;
            const shirts = 8;
            const geo = this._geo(new THREE.BoxGeometry(0.6, 1.1, 0.5));
            const meshes = [];
            const perMesh = Math.ceil((rows * perRow) / shirts);
            for (let s = 0; s < shirts; s++) {
                const mat = this._mat({
                    color: new THREE.Color().setHSL(s / shirts, 0.30 + this._rand() * 0.35, 0.42 + this._rand() * 0.26)
                });
                const mesh = new THREE.InstancedMesh(geo, mat, perMesh);
                mesh.count = 0;
                this.scene.add(mesh);
                this._disposables.push(mesh);
                meshes.push(mesh);
            }
            const m = new THREE.Matrix4();
            const seats = [];
            let i = 0;
            for (let r = 0; r < rows; r++) {
                for (let k = 0; k < perRow; k++) {
                    const x = RACE_LEN - 56 + k * 2.05 + (this._rand() - 0.5) * 0.7;
                    const y = 2.2 + r * 1.25;
                    const z = z0 + r * 3.0 - 0.6;
                    const mesh = meshes[i % shirts];
                    const slot = mesh.count++;
                    m.makeTranslation(x, y, z);
                    mesh.setMatrixAt(slot, m);
                    seats.push({ mesh, slot, x, y, z, phase: this._rand() * 6.28 });
                    i++;
                }
            }
            for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
            this._crowd = { meshes, seats, matrix: new THREE.Matrix4(), excite: 0 };

            // Flags along the front of the roof.
            for (let i2 = 0; i2 < 9; i2++) {
                const x = RACE_LEN - 52 + i2 * 12;
                this._box(0.12, 3.4, 0.12, shade, x, 15.3, z0 + 2.4);
                const flagMat = this._basic({
                    color: new THREE.Color().setHSL(this._rand(), 0.6, 0.5),
                    side: THREE.DoubleSide
                });
                const flag = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(2.2, 1.3)), flagMat);
                flag.position.set(x + 1.1, 16.4, z0 + 2.4);
                this.scene.add(flag);
            }
        }

        // Trees behind the rails and hills behind those: the two things that
        // make a flat plane read as a place.
        _buildScenery() {
            const trunkMat = this._mat({ color: 0x4a3524 });
            const leafMat = this._mat({ color: 0x2f5f2c });
            const perSide = 70;
            const count = perSide * 2;
            const trunkGeo = this._geo(new THREE.CylinderGeometry(0.4, 0.5, 3.4, 6));
            const leafGeo = this._geo(new THREE.ConeGeometry(3.2, 8.5, 7));
            const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
            const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
            const m = new THREE.Matrix4();
            const s = new THREE.Vector3();
            const q = new THREE.Quaternion();
            const p = new THREE.Vector3();
            let i = 0;
            for (const side of [-1, 1]) {
                for (let k = 0; k < perSide; k++) {
                    const x = -APPROACH - 20 + (k / perSide) * (RACE_LEN + RUNOFF + 60);
                    const z = side * (HALF_TRACK + 22 + this._rand() * 26);
                    const sc = 0.7 + this._rand() * 0.9;
                    p.set(x + (this._rand() - 0.5) * 9, 1.7 * sc, z);
                    s.set(sc, sc, sc);
                    m.compose(p, q, s);
                    trunks.setMatrixAt(i, m);
                    p.set(p.x, 6.4 * sc, p.z);
                    m.compose(p, q, s);
                    leaves.setMatrixAt(i, m);
                    i++;
                }
            }
            trunks.instanceMatrix.needsUpdate = true;
            leaves.instanceMatrix.needsUpdate = true;
            this.scene.add(trunks);
            this.scene.add(leaves);
            this._disposables.push(trunks, leaves);

            const hillMat = this._mat({ color: 0x53704a });
            for (let k = 0; k < 7; k++) {
                const hill = new THREE.Mesh(this._geo(new THREE.SphereGeometry(1, 10, 7)), hillMat);
                hill.position.set(-300 + this._rand() * 1100, -20, (this._rand() > 0.5 ? 1 : -1) * (420 + this._rand() * 380));
                hill.scale.set(180 + this._rand() * 220, 60 + this._rand() * 70, 180 + this._rand() * 200);
                this.scene.add(hill);
            }
        }

        //--- the runners ------------------------------------------------------

        // The silks, painted once per runner and worn on the jockey and on the
        // number cloth, so a colour on the race card is a colour on the track.
        _silkTexture(horse, number) {
            return this._canvasTexture(32, 32, (ctx, w, h) => {
                ctx.fillStyle = horse.silk;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = horse.device;
                switch (horse.pattern) {
                    case 'hoops':
                        for (let y = 0; y < h; y += 10) ctx.fillRect(0, y, w, 5);
                        break;
                    case 'sash':
                        ctx.save();
                        ctx.translate(w / 2, h / 2);
                        ctx.rotate(0.7);
                        ctx.fillRect(-w, -4, w * 2, 8);
                        ctx.restore();
                        break;
                    case 'quarters':
                        ctx.fillRect(0, 0, w / 2, h / 2);
                        ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
                        break;
                    case 'star':
                        ctx.beginPath();
                        for (let k = 0; k < 10; k++) {
                            const a = (Math.PI * 2 * k) / 10 - Math.PI / 2;
                            const r = k % 2 ? 4 : 11;
                            const px = w / 2 + Math.cos(a) * r;
                            const py = h / 2 + Math.sin(a) * r;
                            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.fill();
                        break;
                    case 'chevron':
                        for (let k = 0; k < 3; k++) {
                            ctx.beginPath();
                            ctx.moveTo(0, 6 + k * 10);
                            ctx.lineTo(w / 2, 1 + k * 10);
                            ctx.lineTo(w, 6 + k * 10);
                            ctx.lineTo(w, 10 + k * 10);
                            ctx.lineTo(w / 2, 5 + k * 10);
                            ctx.lineTo(0, 10 + k * 10);
                            ctx.closePath();
                            ctx.fill();
                        }
                        break;
                    default:
                        break;
                }
                if (number) {
                    ctx.fillStyle = 'rgba(0,0,0,0.55)';
                    ctx.fillRect(9, 8, 14, 16);
                    ctx.fillStyle = '#f4f0e2';
                    ctx.font = 'bold 15px monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(number), 16, 17);
                }
            });
        }

        // A rider, built at the size of a rider on a horse and then scaled once,
        // as a whole, to whatever actually came out of the stalls. Every figure
        // below is in metres on a 1.75m animal; the group's own scale is the
        // ONLY place the animal's real size is applied.
        _buildJockey(horse, height) {
            const g = new THREE.Group();
            const silkTex = this._silkTexture(horse, 0);
            const silkMat = this._mat({ map: silkTex, color: 0xffffff });
            const skinMat = this._mat({ color: 0xc99a72 });
            const bootMat = this._mat({ color: 0x2a1c14 });
            const leatherMat = this._mat({ color: 0x2a1c14 });

            const torso = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.34, 0.42, 0.30)), silkMat);
            torso.position.set(0, 0.30, 0);
            torso.rotation.x = -0.55;
            g.add(torso);

            const head = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.11, 8, 6)), skinMat);
            head.position.set(0, 0.56, 0.10);
            g.add(head);
            const cap = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.13, 8, 5)), silkMat);
            cap.position.set(0, 0.60, 0.10);
            cap.scale.set(1, 0.75, 1.1);
            g.add(cap);

            // Legs tucked up short, the way a jockey rides.
            for (const side of [-1, 1]) {
                const thigh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.11, 0.30, 0.13)), silkMat);
                thigh.position.set(side * 0.16, 0.16, -0.02);
                thigh.rotation.x = 0.9;
                g.add(thigh);
                const boot = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.10, 0.10, 0.24)), bootMat);
                boot.position.set(side * 0.17, 0.06, 0.16);
                g.add(boot);
            }

            // The right arm holds the whip and is the one that moves.
            const arm = new THREE.Group();
            const upper = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.09, 0.26, 0.09)), silkMat);
            upper.position.set(0, -0.13, 0);
            arm.add(upper);
            const whip = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.015, 0.01, 0.42, 5)), leatherMat);
            whip.position.set(0, -0.34, -0.10);
            whip.rotation.x = 0.5;
            arm.add(whip);
            arm.position.set(0.19, 0.44, 0.02);
            arm.rotation.x = 0.4;
            g.add(arm);

            const leftArm = new THREE.Mesh(this._geo(new THREE.BoxGeometry(0.09, 0.30, 0.09)), silkMat);
            leftArm.position.set(-0.19, 0.32, 0.14);
            leftArm.rotation.x = 1.0;
            g.add(leftArm);

            g.scale.setScalar(height / 1.75);
            return { group: g, arm: arm };
        }

        // A number cloth on each flank, so a runner is identifiable from either
        // side of the course. Hung on the body the model actually has rather
        // than an assumed one, since a hare and an elephant both run here.
        _addNumberCloths(holder, horse, number, halfWidth, height) {
            const tex = this._silkTexture(horse, number);
            const mat = this._basic({ map: tex, side: THREE.DoubleSide });
            const w = height * 0.44;
            for (const side of [-1, 1]) {
                const cloth = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(w, w * 0.8)), mat);
                cloth.position.set(side * (halfWidth + 0.02), height * 0.58, -height * 0.05);
                cloth.rotation.y = side * Math.PI / 2;
                holder.add(cloth);
            }
        }

        // Build one runner and put it in its stall. The model comes from the 3D
        // battler families, handed the runner's NAME hash as the identity it
        // keys a species' coat, colour and proportions to.
        addRunner(horse, lane) {
            const holder = new THREE.Group();
            holder.position.set(GATE_FRONT - NOSE_AHEAD, 0, laneZ(lane));
            holder.rotation.y = Math.PI / 2;   // battler models face +Z; the course runs along +X
            this.scene.add(holder);

            const entry = {
                horse, lane, holder,
                model: null, jockey: null, arm: null,
                ready: false, alive: true, height: KIND_HEIGHT[horse.kind] || 1.75,
                stride: 0, whipT: 0
            };
            this._runners.push(entry);

            const B3D = window.Battler3D;
            if (!B3D || typeof B3D.create !== 'function') return entry;

            // A breed whose family plugin is not installed still runs; it runs
            // as a horse, and at a horse's height rather than its own.
            let kind = horse.kind;
            try {
                if (B3D.list && B3D.list().indexOf(kind) < 0) kind = 'horse';
            } catch (e) { kind = 'horse'; }
            entry.height = KIND_HEIGHT[kind] || 1.75;

            // The battler system folds whatever battle a model was last built
            // for into its identity. Here the ONLY thing allowed to decide what
            // a runner looks like is its name, so that is put aside and given
            // back afterwards.
            const savedOrigin = B3D._battleOriginSeed;
            let model = null;
            try {
                B3D._battleOriginSeed = 0;
                const fake = { enemyId: () => horse.seedId, index: () => 0 };
                model = B3D.create(kind, 0, 0, fake);
            } catch (e) {
                model = null;
            } finally {
                B3D._battleOriginSeed = savedOrigin;
            }
            if (!model) return entry;

            Promise.resolve(model.load(null, 0, 0, 0)).then(() => {
                // The field can be dismissed while a model is still building.
                if (!entry.alive || !this.scene || !model.model) return;
                const root = model.model;

                // Measured, not assumed: the families build at wildly different
                // sizes, so the animal is scaled by what it actually measures
                // and stood on the turf rather than through it.
                const box = new THREE.Box3().setFromObject(root);
                const h = Math.max(0.001, box.max.y - box.min.y);
                const k = entry.height / h;
                root.scale.multiplyScalar(k);
                root.position.set(0, -box.min.y * k, 0);
                holder.add(root);

                const halfWidth = ((box.max.x - box.min.x) * k) / 2;
                // The seat is the animal's BACK, not the top of its head: a
                // measured height runs up to whichever ear is held highest, so
                // a rider parked at that figure floats above the horse.
                entry.seatY = entry.height * SEAT_SHARE;
                const jockey = this._buildJockey(horse, entry.height);
                jockey.group.position.set(0, entry.seatY, -entry.height * 0.04);
                holder.add(jockey.group);
                this._addNumberCloths(holder, horse, lane + 1, halfWidth, entry.height);

                if (window.PSXShader && window.PSXShader.applyToObject) {
                    window.PSXShader.applyToObject(holder);
                }
                entry.model = model;
                entry.jockey = jockey.group;
                entry.arm = jockey.arm;
                entry.ready = true;
                try {
                    model.setGaitSpeed(2);
                    model.playGait('walk');
                } catch (e) { /* some families auto-idle */ }
            }).catch(() => { /* a runner that will not build simply runs unseen */ });

            return entry;
        }

        runnersReady() {
            return this._runners.length > 0 && this._runners.every(r => r.ready);
        }

        // A new race is a new field on the SAME course. The animals are taken
        // apart and the stalls closed again; the scene, its renderer and its
        // WebGL context are left alone, because a context per race is a context
        // the browser will eventually refuse to hand out.
        clearRunners() {
            for (const entry of this._runners) this._disposeRunner(entry);
            this._runners = [];
            for (const gate of this._gates) {
                gate.open = 0;
                gate.hinge.rotation.y = 0;
            }
            if (this._crowd) this._crowd.excite = 0;
        }

        _disposeRunner(entry) {
            if (entry.holder) {
                if (entry.holder.parent) entry.holder.parent.remove(entry.holder);
                entry.holder.traverse(obj => {
                    if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        for (const m of mats) if (m.dispose) m.dispose();   // textures stay cached
                    }
                });
            } else if (entry.model && typeof entry.model.dispose === 'function') {
                try { entry.model.dispose(); } catch (e) { /* the family owns it */ }
            }
            entry.model = null;
            entry.holder = null;
            entry.ready = false;
            entry.alive = false;
        }

        // Called once as the race starts: the stalls bang open, the field
        // changes gait and the crowd gets to its feet.
        breakGates() {
            for (const gate of this._gates) gate.open = 0.0001;
            for (const entry of this._runners) {
                if (!entry.model) continue;
                try {
                    entry.model.setGaitSpeed(6);
                    entry.model.playGait('run');
                } catch (e) { /* ignore */ }
            }
            if (this._crowd) this._crowd.excite = 1;
        }

        // Where each runner stands this frame, in metres down the course.
        placeRunners(positions, dt) {
            for (let i = 0; i < this._runners.length; i++) {
                const entry = this._runners[i];
                if (!entry.holder) continue;
                const p = positions[i] || { x: 0, speed: 0 };
                entry.holder.position.x = p.x;
                // A gallop is a bound, not a slide: the body rises and falls at
                // the cadence the animal is actually running at.
                entry.stride += dt * (2.6 + p.speed * 0.22);
                const bound = Math.sin(entry.stride * Math.PI * 2);
                entry.holder.position.y = Math.max(0, bound * 0.10 * Math.min(1, p.speed / 8));
                entry.holder.rotation.z = -bound * 0.035;
                if (entry.jockey) {
                    // The rider takes the bound on their knees, out of the
                    // saddle, half a beat behind the horse.
                    entry.jockey.position.y = entry.seatY + entry.height * Math.sin(entry.stride * Math.PI * 2 - 0.8) * 0.018;
                    entry.jockey.rotation.x = -0.12 + bound * 0.05;
                }
                if (entry.arm) {
                    entry.whipT = Math.max(0, entry.whipT - dt * 2.2);
                    entry.arm.rotation.x = 0.4 - Math.sin(Math.min(1, entry.whipT) * Math.PI) * 1.5;
                }
            }
        }

        whipAt(index) {
            const entry = this._runners[index];
            if (entry) entry.whipT = 1;
        }

        // The whole field on one gait, for the pull-up after the post.
        setFieldGait(gait, speedTag) {
            for (const entry of this._runners) {
                if (!entry.model) continue;
                try {
                    entry.model.setGaitSpeed(speedTag);
                    entry.model.playGait(gait);
                } catch (e) { /* ignore */ }
            }
        }

        setCameraMode(mode) { this._camMode = mode; }

        // The camera is a rail car on the outside of the course for the body of
        // the race, a fixed head-on lens at the post for the finish, and a
        // walk-round in the paddock while the betting is open.
        aimCamera(focus) {
            const t = this._time;
            // Every shot has to be able to answer before the first runner has
            // moved, so a missing focus reads as "at the gate".
            focus = focus || { lead: 0, leadZ: 0, centre: 0, centreZ: 0 };
            switch (this._camMode) {
                case CAM.BROADCAST: {
                    this._wantPos.set(focus.lead - 11, 6.4 + Math.sin(t * 0.4) * 0.25, HALF_TRACK + 17);
                    this._wantLook.set(focus.centre + 5, 1.7, focus.centreZ * 0.5);
                    break;
                }
                case CAM.HEADON: {
                    this._wantPos.set(RACE_LEN + 34, 5.4, focus.leadZ * 0.35);
                    this._wantLook.set(focus.lead - 4, 1.8, focus.centreZ * 0.4);
                    break;
                }
                case CAM.POST: {
                    this._wantPos.set(focus.lead + 11, 3.2, focus.leadZ + 8.5);
                    this._wantLook.set(focus.lead, 1.5, focus.leadZ);
                    break;
                }
                default: {
                    // Paddock: a slow walk round the field while the book is open.
                    const a = t * 0.16;
                    this._wantPos.set(GATE_FRONT + 3 + Math.cos(a) * 16, 4.4 + Math.sin(a * 0.6) * 1.2, Math.sin(a) * 16);
                    this._wantLook.set(GATE_FRONT - 1.4, 1.5, 0);
                    break;
                }
            }
        }

        update(dt, focus) {
            this._time += dt;

            // The stalls, once they have been let go.
            for (const gate of this._gates) {
                if (gate.open > 0 && gate.open < 1) {
                    gate.open = Math.min(1, gate.open + dt * 2.6);
                    gate.hinge.rotation.y = -gate.open * 1.9;
                }
            }

            for (const entry of this._runners) {
                if (entry.model && typeof entry.model.update === 'function') {
                    try { entry.model.update(dt); } catch (e) { /* ignore */ }
                }
            }

            if (this._crowd) {
                const c = this._crowd;
                c.excite = Math.max(0, Math.min(1, c.excite + (focus && focus.excite ? dt : -dt * 0.3)));
                const amp = 0.06 + c.excite * 0.42;
                for (const seat of c.seats) {
                    const lift = Math.abs(Math.sin(this._time * (2.2 + c.excite * 2.4) + seat.phase)) * amp;
                    c.matrix.makeTranslation(seat.x, seat.y + lift, seat.z);
                    seat.mesh.setMatrixAt(seat.slot, c.matrix);
                }
                for (const mesh of c.meshes) mesh.instanceMatrix.needsUpdate = true;
            }

            if (focus) this.aimCamera(focus);
            const k = 1 - Math.pow(0.001, dt);
            this._camPos.lerp(this._wantPos, Math.min(1, k * 1.6));
            this._camLook.lerp(this._wantLook, Math.min(1, k * 2.2));
            this.camera.position.copy(this._camPos);
            this.camera.lookAt(this._camLook);
            // The race directs its own shots; the right stick lets the player
            // look around whichever one is running (window.Controller), and the
            // shot springs back the moment the stick is let go.
            if (!this._orbit && window.Controller) this._orbit = window.Controller.orbit({});
            if (this._orbit) {
                this._orbit.update(dt);
                this._orbit.applyTo(this.camera, this._camLook);
            }
        }

        // A camera that has to be somewhere sensible on the very first frame,
        // rather than sliding in from wherever the last shot left it.
        snapCamera(focus) {
            this.aimCamera(focus);
            this._camPos.copy(this._wantPos);
            this._camLook.copy(this._wantLook);
            this.camera.position.copy(this._camPos);
            this.camera.lookAt(this._camLook);
        }

        render() {
            if (!this.renderer) return;
            if (window.PSXShader) {
                softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            for (const entry of this._runners) this._disposeRunner(entry);
            this._runners = [];
            for (const item of this._disposables) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._disposables = [];
            this.scene = null;
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
    // Scene_HorseRace
    //=========================================================================
    Scene_HorseRace = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._gameState = STATE.SELECTION;
            this._bet = MIN_BET;
            this._cursor = 0;
            this._selectedHorse = -1;
            this._raceHorses = [];
            this._finishOrder = [];
            this._raceTime = 0;
            this._lastWin = 0;
            this._won = false;
            this._winner = null;
            this._notice = '';
            this._freePlay = isFreePlay();
            this._chips = FREE_PLAY_CHIPS;
            this._threeReady = typeof THREE !== 'undefined' && typeof THREE.WebGLRenderer === 'function';
            // The press that opened the meeting must not also strike a bet on
            // the first frame the scene is live.
            this._arming = 15;
            this._hoofT = 0;
            this._commentT = 0;
            this._resultsHold = 0;
            this.setupNewRace();
        }

        // ---- the wallet ---------------------------------------------------
        // One funding source for the whole scene. In the free-play arcade it is
        // a local chip stack, so the party's arcade tokens are never asked for;
        // in a real game it is the token item.
        tokenItem() {
            return $dataItems[TOKEN_ITEM_ID];
        }

        walletName() {
            if (this._freePlay) return T('AnimatedHorseRace.tokens');
            const item = this.tokenItem();
            return item ? item.name : T('AnimatedHorseRace.tokens');
        }

        walletCount() {
            if (this._freePlay) return this._chips;
            const item = this.tokenItem();
            return item ? $gameParty.numItems(item) : 0;
        }

        walletSpend(amount) {
            if (this._freePlay) {
                this._chips = Math.max(0, this._chips - amount);
                return;
            }
            const item = this.tokenItem();
            if (item) $gameParty.loseItem(item, amount);
        }

        walletGain(amount) {
            if (this._freePlay) {
                this._chips += amount;
                return;
            }
            const item = this.tokenItem();
            if (item) $gameParty.gainItem(item, amount);
        }

        // Free play is never a dead end: an empty stack is simply re-staked.
        // A real game reports honestly whether the player can still bet.
        ensureStake() {
            if (!this._freePlay) return this.walletCount() >= MIN_BET;
            if (this._chips < MIN_BET) {
                this._chips = FREE_PLAY_CHIPS;
                this._notice = T('AnimatedHorseRace.restake', { amount: FREE_PLAY_CHIPS });
            }
            return true;
        }

        cannotBetText() {
            const item = this.tokenItem();
            if (!item) return T('AnimatedHorseRace.noTokens');
            return T('AnimatedHorseRace.notEnoughTokens', {
                tokenName: item.name,
                current: $gameParty.numItems(item),
                needed: MIN_BET
            });
        }

        // ---- lifecycle ----------------------------------------------------
        create() {
            super.create();
            RACE_DOMS = [];
            this.createTrack();
            this.createUI();
            this.startCrowd();
            this.enterSelection();
        }

        // A flat sky gradient behind everything: the 3D course covers it, and
        // it is what shows when three.js is missing.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#3c6a9c', '#7fa06a', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createTrack() {
            if (!this._threeReady) return;
            // Rendering a little below native and scaling up with nearest
            // filtering keeps the period edge without smearing the turf.
            const scale = 0.86;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            try {
                this._track = new Track3D(w, h);
            } catch (e) {
                console.error('[AnimatedHorseRace] the course could not be built', e);
                this._track = null;
                return;
            }
            const texture = PIXI.Texture.from(this._track.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._trackSprite = new PIXI.Sprite(texture);
            this._trackSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._trackSprite, idx);
            this.parade();
        }

        // The field walks out for the punters to look at while the book is open.
        parade() {
            if (!this._track) return;
            this._fieldOut = false;
            this._raceHorses.forEach((horse, lane) => this._track.addRunner(horse, lane));
            this._track.setCameraMode(CAM.PADDOCK);
            this._track.snapCamera(null);
        }

        createUI() {
            this._banner = new Sprite_RaceBanner();
            this.addChild(this._banner);

            this._card = new Sprite_RaceCard(this);
            this.addChild(this._card);

            this._slip = new Sprite_RaceSlip(this);
            this.addChild(this._slip);

            this._order = new Sprite_RaceOrder(this);
            this.addChild(this._order);

            this._result = new Sprite_RaceResult(this);
            this.addChild(this._result);

            this._status = new Sprite_RaceStatus();
            this.addChild(this._status);

            // The pixel font arrives asynchronously; repaint what was drawn once.
            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._banner) return;
                    this._banner.refresh();
                    this._card.refresh();
                    this._slip.refresh();
                    this._order.refresh();
                    this._result.refresh();
                    this._status.refresh();
                });
            }
        }

        // saveBgs RETURNS the ambience the party walked in with rather than
        // storing it, so it is held here and handed back on the way out.
        startCrowd() {
            try {
                this._savedBgs = AudioManager.saveBgs();
                if (CROWD_BGS) {
                    AudioManager.playBgs({ name: CROWD_BGS, volume: 40, pitch: 100, pan: 0 });
                }
            } catch (e) { /* a meeting with no crowd is still a meeting */ }
        }

        stopCrowd() {
            try {
                const saved = this._savedBgs;
                if (saved && saved.name) AudioManager.replayBgs(saved);
                else AudioManager.stopBgs();
            } catch (e) { /* ignore */ }
            this._savedBgs = null;
        }

        setCrowdVolume(volume) {
            try {
                const bgs = AudioManager._currentBgs;
                if (!bgs || bgs.name !== CROWD_BGS) return;
                const v = Math.round(Math.max(0, Math.min(100, volume)));
                if (bgs.volume === v) return;
                bgs.volume = v;
                AudioManager.updateBgsParameters(bgs);
            } catch (e) { /* ignore */ }
        }

        terminate() {
            super.terminate();
            for (const dom of RACE_DOMS) {
                try { dom.destroy(); } catch (e) { /* already gone */ }
            }
            RACE_DOMS = [];
            this.stopCrowd();
            if (this._trackSprite) {
                if (this._trackSprite.parent) this._trackSprite.parent.removeChild(this._trackSprite);
                this._trackSprite.destroy();
                this._trackSprite = null;
            }
            if (this._track) {
                this._track.dispose();
                this._track = null;
            }
        }

        // ---- race setup ---------------------------------------------------
        setupNewRace() {
            const pool = getHorsePool();
            const picked = [];
            let guard = 0;
            while (picked.length < LANES && guard++ < 500) {
                const index = Math.floor(Math.random() * pool.length);
                if (!picked.includes(index)) picked.push(index);
            }
            this._raceHorses = picked.map(index => {
                const horse = Object.assign({}, pool[index]);
                horse.position = 0;
                horse.overrun = 0;
                horse.lastSpeed = 0;
                horse.finishT = 0;
                horse.run = null;
                return horse;
            });
            this.assignOdds();
            this._finishOrder = [];
            this._selectedHorse = -1;
            this._cursor = 0;
            this._raceTime = 0;
            this._winner = null;
        }

        // The book. Every price is quoted by running the race itself a couple of
        // hundred times and counting: nothing else can be trusted to price a
        // model as tangled as this one, and any independent estimate drifts away
        // from what actually happens the moment the race is retuned.
        assignOdds() {
            const HOUSE_EDGE = 0.20;
            const TRIALS = 200;
            const horses = this._raceHorses;
            const n = horses.length;
            const wins = new Array(n).fill(0);
            for (let t = 0; t < TRIALS; t++) wins[simulateRace(horses, Math.random)]++;
            horses.forEach((h, i) => {
                // Smoothed, so a runner that lost every trial is a long price
                // rather than an infinite one.
                const p = (wins[i] + 1) / (TRIALS + n);
                const fair = (1 / p) * (1 - HOUSE_EDGE);
                h.chance = p;
                h.odds = Math.max(1.2, fair < 5 ? Math.round(fair * 10) / 10 : Math.round(fair));
            });
        }

        // ---- selection -----------------------------------------------------
        enterSelection() {
            this._gameState = STATE.SELECTION;
            this._canBet = this.ensureStake();
            this._bet = Math.max(MIN_BET, Math.min(this._bet, Math.min(MAX_BET, this.walletCount() || MIN_BET)));
            if (this._track) this._track.setCameraMode(CAM.PADDOCK);
            this.setCrowdVolume(38);
            this._card.visible = true;
            this._slip.visible = true;
            this._order.visible = false;
            this._result.visible = false;
            this._card.refresh();
            this._slip.refresh();
            // The animals are built asynchronously, so the board says the field
            // is being led out until every one of them is actually standing.
            const led = !this._track || this._track.runnersReady();
            this._banner.setMessage(this._notice ||
                T(led ? 'AnimatedHorseRace.parading' : 'AnimatedHorseRace.leadingOut'));
            this._fieldOut = led;
            this._notice = '';
            this._status.setText(T('AnimatedHorseRace.controlsSelect'));
            if (!this._canBet) this._banner.setMessage(this.cannotBetText());
        }

        moveCursor(delta) {
            const max = this._raceHorses.length;
            this._cursor = (this._cursor + delta + max) % max;
            SoundManager.playCursor();
            this._card.refresh();
            this._slip.refresh();
        }

        changeBet(amount) {
            const oldBet = this._bet;
            const currentMax = Math.min(MAX_BET, Math.max(MIN_BET, this.walletCount()));
            this._bet = Math.max(MIN_BET, Math.min(currentMax, this._bet + amount));
            if (this._bet !== oldBet) {
                playSe(SE.bet, this._bet > oldBet ? 116 : 94);
                this._slip.refresh();
            } else {
                playSe(SE.deny, 100, 40);
            }
        }

        confirmPick() {
            if (!this._canBet) {
                playSe(SE.deny);
                return;
            }
            if (this.walletCount() < this._bet) {
                playSe(SE.deny);
                this._banner.setMessage(this.cannotBetText());
                return;
            }
            this._selectedHorse = this._cursor;
            playSe(SE.slip);
            this.startRace();
        }

        // ---- the race ------------------------------------------------------
        startRace() {
            this._gameState = STATE.RACING;
            this._raceTime = 0;
            this._hoofT = 0;
            this._commentT = 0;
            this.walletSpend(this._bet);

            this._raceHorses.forEach(horse => {
                horse.run = newRunState(horse, Math.random);
                horse.position = 0;
                horse.overrun = 0;
                horse.finishT = 0;
                horse.lastSpeed = 0;
            });

            this._card.visible = false;
            this._slip.visible = false;
            this._order.visible = true;
            this._order.refresh();
            this._banner.setMessage(T('AnimatedHorseRace.theyreOff'));
            this._status.setText(T('AnimatedHorseRace.controlsRace'));
            this.setCrowdVolume(62);

            playSe(SE.gate);
            playSe(SE.bell, 108);
            playSe(SE.neigh, 96 + Math.floor(Math.random() * 16), 60);
            if (this._track) {
                this._track.breakGates();
                this._track.setCameraMode(CAM.BROADCAST);
                this._track.snapCamera(this.cameraFocus());
            }
        }

        // The race as it is watched, run on the same model the book was priced
        // from: the only thing this adds is the noise, the camera and the sound.
        updateRace(dt) {
            this._raceTime += dt;
            const horses = this._raceHorses;
            for (const horse of horses) {
                if (horse.position >= RACE_LEN) continue;
                const s = horse.run;
                const before = s.pos;
                const v = stepRun(s, dt, Math.random);
                horse.position = s.pos;

                // The run at the finish: a runner with something left asks for
                // it inside the final furlong, and is heard doing so.
                if (s.justSurged) {
                    playSe(SE.whip, 96 + Math.floor(Math.random() * 20));
                    if (this._track) this._track.whipAt(horses.indexOf(horse));
                    this._banner.setMessage(T('AnimatedHorseRace.surge', { name: horse.name }));
                    this._commentT = 2.2;
                }

                if (horse.position >= RACE_LEN) {
                    // Crossed inside this frame: the moment matters, because the
                    // whole field can be covered by a length.
                    const over = (RACE_LEN - before) / Math.max(0.0001, horse.position - before);
                    horse.finishT = this._raceTime - dt * (1 - over);
                    horse.position = RACE_LEN;
                    if (!this._finishOrder.includes(horse.id)) {
                        this._finishOrder.push(horse.id);
                        if (this._finishOrder.length === 1) {
                            playSe(SE.post, 100);
                            this._winner = horse;
                        }
                    }
                }
                horse.lastSpeed = v;
            }

            // Anything past the post keeps galloping into the run-off rather
            // than stopping dead on the line.
            for (const horse of horses) {
                if (horse.position >= RACE_LEN && horse.finishT) {
                    horse.overrun = (horse.overrun || 0) + dt * 12;
                }
            }

            this.updateRaceSound(dt);
            this.updateCommentary(dt);
            // The order changes smoothly and repainting a panel sixty times a
            // second to move a gauge four pixels is not worth the fill.
            if ((this._raceFrame = (this._raceFrame || 0) + 1) % 4 === 0) this._order.refresh();

            const done = this._finishOrder.length >= horses.length;
            if (done || this._raceTime > 90) this.endRace();
        }

        leader() {
            let best = this._raceHorses[0];
            for (const horse of this._raceHorses) {
                if (horse.position > best.position) best = horse;
            }
            return best;
        }

        // Where each model stands, from where each NOSE has got to.
        runnerPositions() {
            return this._raceHorses.map(h => ({
                x: h.position + (h.overrun || 0) - NOSE_AHEAD,
                speed: h.lastSpeed || 0
            }));
        }

        cameraFocus() {
            const lead = this.leader();
            let sum = 0;
            for (const horse of this._raceHorses) sum += horse.position;
            return {
                lead: lead.position + (lead.overrun || 0),
                leadZ: laneZ(this._raceHorses.indexOf(lead)),
                centre: sum / Math.max(1, this._raceHorses.length),
                centreZ: 0,
                excite: this._gameState === STATE.RACING && lead.position > RACE_LEN * 0.75
            };
        }

        // Hooves are a rhythm, not a sample per animal: one roll at the cadence
        // the leaders are running, panned to where the field is on the screen.
        updateRaceSound(dt) {
            const lead = this.leader();
            const speed = lead.lastSpeed || 12;
            this._hoofT -= dt;
            if (this._hoofT <= 0) {
                this._hoofT = Math.max(0.055, 0.30 - speed * 0.011);
                const near = 1 - Math.min(1, Math.abs(RACE_LEN - lead.position) / RACE_LEN);
                playSe(SE.hoof, 88 + Math.floor(Math.random() * 26),
                    SE.hoof.volume * (0.55 + near * 0.55),
                    Math.round(Math.sin(this._raceTime * 1.7) * 25));
            }
            const runIn = lead.position / RACE_LEN;
            this.setCrowdVolume(52 + runIn * 38);
        }

        updateCommentary(dt) {
            this._commentT -= dt;
            if (this._commentT > 0) return;
            this._commentT = 3.4;
            const lead = this.leader();
            const left = Math.max(0, Math.round(RACE_LEN - lead.position));
            if (this._finishOrder.length > 0) {
                this._banner.setMessage(T('AnimatedHorseRace.pastThePost', { name: this._winner ? this._winner.name : lead.name }));
            } else if (left <= 201) {
                this._banner.setMessage(T('AnimatedHorseRace.finalFurlong'));
            } else {
                this._banner.setMessage(T('AnimatedHorseRace.leading', { name: lead.name, m: left }));
            }
        }

        endRace() {
            this._gameState = STATE.RESULTS;
            this._resultsHold = 1.6;
            this._pullUp = 9;

            // The order the post saw, which is not always the order the array is
            // in: two runners can cross inside the same frame.
            const crossed = this._raceHorses.filter(h => h.finishT > 0)
                .sort((a, b) => a.finishT - b.finishT);
            const unfinished = this._raceHorses.filter(h => !h.finishT)
                .sort((a, b) => b.position - a.position);
            const order = crossed.concat(unfinished);
            this._finishOrder = order.map(h => h.id);

            const winnerHorse = order[0] || this._raceHorses[0];
            this._winner = winnerHorse;

            // A photograph is called when the first two cannot be separated by
            // half a length.
            this._photo = !!(order[1] && Math.abs(order[0].finishT - order[1].finishT) < 0.09);

            let winAmount = 0;
            let won = false;
            if (this._selectedHorse !== -1 && this._raceHorses[this._selectedHorse].id === winnerHorse.id) {
                const horse = this._raceHorses[this._selectedHorse];
                winAmount = payout(this._bet, horse.odds);
                won = true;
                this.walletGain(winAmount);
                if (winAmount >= this._bet * 5) $gameScreen.startFlash([255, 255, 255, 110], 30);
            }
            this._lastWin = winAmount;
            this._won = won;

            if (window.MinigameFun) {
                const stake = { spec: 'Card Counting', gambling: true };
                won ? window.MinigameFun.won(stake) : window.MinigameFun.lost(stake);
            }

            playSe(SE.neigh, 92 + Math.floor(Math.random() * 20), 70);
            playSe(won ? SE.cheer : SE.groan);
            this.setCrowdVolume(won ? 80 : 34);

            if (this._track) this._track.setCameraMode(CAM.POST);
            this._banner.setMessage(this._photo
                ? T('AnimatedHorseRace.photoFinish')
                : (won
                    ? T('AnimatedHorseRace.winMessage', { horseName: winnerHorse.name, amount: winAmount })
                    : T('AnimatedHorseRace.loseMessage', { horseName: winnerHorse.name })));
        }

        showResults() {
            this._order.visible = false;
            this._result.visible = true;
            this._result.refresh();
            this._status.setText(T('AnimatedHorseRace.controlsResults'));
        }

        startNewRace() {
            SoundManager.playOk();
            this.setupNewRace();
            if (this._track) {
                // A new field on the same course: the old animals are taken
                // apart and the new ones led out, and the renderer never moves.
                this._track.clearRunners();
                this.parade();
            }
            this._result.visible = false;
            this.enterSelection();
        }

        // ---- update loop ----------------------------------------------------
        update() {
            super.update();
            const dt = 1 / 60;

            if (!this._fieldOut && this._gameState === STATE.SELECTION &&
                this._track && this._track.runnersReady()) {
                this._fieldOut = true;
                this._banner.setMessage(T('AnimatedHorseRace.parading'));
            }

            switch (this._gameState) {
                case STATE.SELECTION: this.updateSelectionInput(); break;
                case STATE.RACING: this.updateRace(dt); break;
                case STATE.RESULTS: this.updateResults(dt); break;
            }

            if (this._track) {
                if (this._gameState === STATE.RACING || this._gameState === STATE.RESULTS) {
                    this._track.placeRunners(this.runnerPositions(), dt);
                    // Head-on for the last stretch, then round to the winner.
                    if (this._gameState === STATE.RACING) {
                        const lead = this.leader();
                        this._track.setCameraMode(lead.position > RACE_LEN * 0.86 ? CAM.HEADON : CAM.BROADCAST);
                    }
                } else {
                    this._track.placeRunners(this._raceHorses.map((h, i) => ({
                        // Before the off the field stands in the stalls, shifting.
                        x: GATE_FRONT - NOSE_AHEAD - (i % 2) * 0.25, speed: 1.2
                    })), dt);
                }
                this._track.update(dt, this.cameraFocus());
                this._track.render();
                if (this._trackSprite && this._trackSprite.texture) this._trackSprite.texture.update();
            }

            // The HTML labels are painted when a widget repaints, which is not
            // every frame: this keeps them on their sprite when one is shown,
            // hidden or moved in between.
            for (const dom of RACE_DOMS) dom.sync();
        }

        updateSelectionInput() {
            if (this._arming > 0) {
                this._arming--;
                return;
            }
            if (Input.isRepeated('down')) this.moveCursor(1);
            else if (Input.isRepeated('up')) this.moveCursor(-1);
            else if (Input.isRepeated('right')) this.changeBet(Input.isPressed('shift') ? 10 : 1);
            else if (Input.isRepeated('left')) this.changeBet(Input.isPressed('shift') ? -10 : -1);
            else if (Input.isTriggered('ok')) this.confirmPick();
            else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            this.updateSelectionTouch();
        }

        // The card and the slip take a click as well as a key: the row under the
        // pointer is picked, and the two ends of the stepper move the stake.
        updateSelectionTouch() {
            if (TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            // isMoved is a drag; a pointer merely passing over the card is a
            // hover, which is the one that has to move the cursor.
            const moved = TouchInput.isHovered() || TouchInput.isMoved() || TouchInput.isTriggered();
            if (moved) {
                const row = this._card.rowAt(TouchInput.x, TouchInput.y);
                if (row >= 0 && row !== this._cursor) {
                    this._cursor = row;
                    SoundManager.playCursor();
                    this._card.refresh();
                    this._slip.refresh();
                }
            }
            if (!TouchInput.isTriggered()) return;
            const step = this._slip.stepAt(TouchInput.x, TouchInput.y);
            if (step !== 0) {
                this.changeBet(step);
                return;
            }
            if (this._slip.isOnStrike(TouchInput.x, TouchInput.y) ||
                this._card.rowAt(TouchInput.x, TouchInput.y) >= 0) {
                this.confirmPick();
            }
        }

        updateResults(dt) {
            // The field does not stop dead on the line: it runs on and is
            // pulled up over the next couple of seconds.
            if (this._pullUp > 0) {
                this._pullUp = Math.max(0, this._pullUp - dt * 4.5);
                for (const horse of this._raceHorses) {
                    horse.overrun = (horse.overrun || 0) + this._pullUp * dt;
                    horse.lastSpeed = this._pullUp;
                }
                if (this._pullUp === 0 && this._track) this._track.setFieldGait('walk', 1);
            }
            if (this._resultsHold > 0) {
                this._resultsHold -= dt;
                if (this._resultsHold <= 0) this.showResults();
                return;
            }
            if (Input.isTriggered('ok') || TouchInput.isTriggered()) this.startNewRace();
            else if (Input.isTriggered('cancel') || TouchInput.isCancelled()) this.popScene();
        }
    };

    //=========================================================================
    // HUD. Drawn in a 240-line virtual framebuffer and upscaled with nearest
    // filtering, the way a PlayStation drew its overlays: an 8px bitmap face,
    // hard one-pixel shadows, block gauges. Dressed art deco, gold on black,
    // matching the alley, the court, the tarot parlour and the slot cabinet:
    // see PSXHud.DECO and the deco* primitives in PSXShader.js.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    // Every DOM handle the widgets have taken, so they can be re-laid out when
    // one moves and torn down when the scene ends.
    let RACE_DOMS = [];

    // Shared plumbing for every low-resolution widget below.
    class Sprite_PSXWidget extends Sprite {
        constructor(vw, vh, vx, vy) {
            super();
            this._vw = vw;
            this._vh = vh;
            this.bitmap = new Bitmap(vw, vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            if (vx != null) this.x = Math.round(vx * s);
            if (vy != null) this.y = Math.round(vy * s);
        }

        // The box, its keylines and its gauges stay in the bitmap, where a one
        // pixel keyline belongs. The lettering goes to a DOM panel pinned to
        // this sprite, in the same virtual coordinates, so the browser draws it
        // at the display's own resolution instead of the framebuffer's.
        dom() {
            const H = HUD();
            if (!H || !H.domPanel) return null;
            if (!this._dom) {
                this._dom = H.domPanel(this);
                RACE_DOMS.push(this._dom);
            }
            return this._dom;
        }

        beginText() {
            const d = this.dom();
            if (d) d.begin();
        }

        hudText(str, x, y, w, align, color, size, opts) {
            if (this._dom) this._dom.text(str, x, y, w, align, color, size, opts);
            else if (HUD()) HUD().text(this.bitmap, str, x, y, w, align, color, size, opts);
        }

        endText() {
            if (this._dom) this._dom.end();
        }

        // Screen pixels to this widget's own virtual pixels, for hit testing.
        localPoint(px, py) {
            const s = hudScale() || 1;
            return { x: (px - this.x) / s, y: (py - this.y) / s };
        }

        contains(px, py) {
            if (!this.visible) return false;
            const p = this.localPoint(px, py);
            return p.x >= 0 && p.y >= 0 && p.x < this._vw && p.y < this._vh;
        }
    }

    //=========================================================================
    // The meeting's name across the top, with whatever the course has to say
    // under it.
    //=========================================================================
    class Sprite_RaceBanner extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 26, 0, 0);
            this._message = '';
            this.refresh();
        }

        setMessage(text) {
            if (this._message === text) return;
            this._message = text || '';
            this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('AnimatedHorseRace.title'),
                titleRight: T('AnimatedHorseRace.subtitle'),
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });
            this.hudText(this._message, 6, 13, this._vw - 12, 'center', D.ink, 8);
            this.endText();
        }
    }

    //=========================================================================
    // The race card: the field, its form and its price.
    //=========================================================================
    const CARD_ROW_H = 25;
    const CARD_TOP = 12;

    class Sprite_RaceCard extends Sprite_PSXWidget {
        constructor(scene) {
            super(Math.max(150, hudW() - 132), CARD_TOP + LANES * CARD_ROW_H + 5, 4, 30);
            this._scene = scene;
            this.refresh();
        }

        // Which runner is under a screen point, or -1.
        rowAt(px, py) {
            if (!this.contains(px, py)) return -1;
            const p = this.localPoint(px, py);
            const row = Math.floor((p.y - CARD_TOP) / CARD_ROW_H);
            return (row >= 0 && row < this._scene._raceHorses.length) ? row : -1;
        }

        refresh() {
            const H = HUD();
            if (!H || !this._scene) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            const horses = this._scene._raceHorses;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('AnimatedHorseRace.field'),
                titleRight: T('AnimatedHorseRace.odds'),
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });

            horses.forEach((horse, i) => {
                const y = CARD_TOP + i * CARD_ROW_H;
                if (i === this._scene._cursor) {
                    H.decoSelect(bmp, 3, y, this._vw - 6, CARD_ROW_H - 2, D.gold);
                }
                // Gate number in a plate, then the silks as they will be worn.
                bmp.fillRect(6, y + 3, 11, 11, D.goldLo);
                bmp.fillRect(7, y + 4, 9, 9, D.black);
                this.hudText(String(i + 1), 7, y + 3, 9, 'center', D.gold, 8);

                bmp.fillRect(21, y + 3, 11, 11, D.goldLo);
                bmp.fillRect(22, y + 4, 9, 9, horse.silk);
                bmp.fillRect(24, y + 6, 5, 5, horse.device);

                // The top line is the name and the price, the one under it the
                // breed and the form: a name is long and a 4:3 window is 320
                // virtual pixels wide, so the two cannot share a line.
                this.hudText(horse.name, 36, y + 2, this._vw - 82, 'left', D.ink, 8);
                this.hudText(`${oddsText(horse.odds)}/1`, this._vw - 42, y + 2, 38, 'right',
                    i === this._scene._cursor ? D.goldHi : D.gold, 8);

                this.hudText(T('AnimatedHorseRace.runnerKind.' + horse.kind),
                    36, y + 12, this._vw - 130, 'left', D.faint, 8);

                // Form, as the two terms the price is actually made of.
                const spd = (horse.strength - 0.3) / 0.4;
                const grt = (horse.luck - 0.3) / 0.4;
                const gx = this._vw - 92;
                this.hudText(T('AnimatedHorseRace.statSpeed'), gx, y + 12, 16, 'left', D.dim, 8);
                H.decoBar(bmp, gx + 17, y + 15, 26, 5, spd);
                this.hudText(T('AnimatedHorseRace.statGrit'), gx + 46, y + 12, 16, 'left', D.dim, 8);
                H.decoBar(bmp, gx + 63, y + 15, 26, 5, grt);

                if (i < horses.length - 1) {
                    H.decoRule(bmp, 6, y + CARD_ROW_H - 2, this._vw - 12, D.goldLo);
                }
            });
            this.endText();
        }
    }

    //=========================================================================
    // The betting slip: the purse, the stake and what it stands to return.
    //=========================================================================
    const SLIP_STEP_Y = 26;

    class Sprite_RaceSlip extends Sprite_PSXWidget {
        constructor(scene) {
            super(124, 92, 0, 30);
            this._scene = scene;
            this.x = Math.round((hudW() - 128) * hudScale());
            this.refresh();
        }

        // The four arrows of the stepper, left to right.
        stepAt(px, py) {
            if (!this.contains(px, py)) return 0;
            const p = this.localPoint(px, py);
            if (p.y < SLIP_STEP_Y || p.y > SLIP_STEP_Y + 12) return 0;
            if (p.x >= 6 && p.x < 20) return -10;
            if (p.x >= 20 && p.x < 34) return -1;
            if (p.x >= 90 && p.x < 104) return 1;
            if (p.x >= 104 && p.x < 118) return 10;
            return 0;
        }

        isOnStrike(px, py) {
            if (!this.contains(px, py)) return false;
            const p = this.localPoint(px, py);
            return p.y >= this._vh - 16;
        }

        refresh() {
            const H = HUD();
            if (!H || !this._scene) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            const scene = this._scene;
            const horse = scene._raceHorses[scene._cursor] || null;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('AnimatedHorseRace.bet'), headerH: 9, hairline: false, step: 1, dom: this._dom
            });

            // In free play the stack IS the house's, so the label says so
            // rather than fighting the purse line for the same row.
            const freePlay = scene._freePlay;
            this.hudText(freePlay ? T('AnimatedHorseRace.freePlay') : scene.walletName(),
                6, 13, 64, 'left', freePlay ? D.jade : D.dim, 8);
            this.hudText(String(scene.walletCount()), this._vw - 50, 13, 44, 'right', D.ink, 8);

            // The stepper: two arrows a side, the stake between them.
            bmp.fillRect(4, SLIP_STEP_Y - 1, this._vw - 8, 13, D.sel);
            this.hudText('<<', 6, SLIP_STEP_Y, 14, 'center', D.gold, 8);
            this.hudText('<', 20, SLIP_STEP_Y, 14, 'center', D.gold, 8);
            this.hudText(String(scene._bet), 34, SLIP_STEP_Y, 56, 'center', D.goldHi, 8);
            this.hudText('>', 90, SLIP_STEP_Y, 14, 'center', D.gold, 8);
            this.hudText('>>', 104, SLIP_STEP_Y, 14, 'center', D.gold, 8);

            const rows = [
                [T('AnimatedHorseRace.selected'), horse ? horse.name : '-', horse ? D.ink : D.faint],
                [T('AnimatedHorseRace.odds'), horse ? `${oddsText(horse.odds)}/1` : '-', D.gold],
                [T('AnimatedHorseRace.potentialWin'), horse ? String(payout(scene._bet, horse.odds)) : '-', D.green]
            ];
            rows.forEach(([label, value, color], i) => {
                const y = 44 + i * 11;
                this.hudText(label, 6, y, 60, 'left', D.dim, 8);
                this.hudText(String(value), this._vw - 62, y, 56, 'right', color, 8);
            });

            H.decoRule(bmp, 6, this._vh - 17, this._vw - 12, D.goldLo);
            this.hudText(T('AnimatedHorseRace.placeBet'), 6, this._vh - 13, this._vw - 12, 'center',
                scene._canBet ? D.goldHi : D.faint, 8);
            this.endText();
        }
    }

    //=========================================================================
    // The running order, live: who is in front, by how far, and how much of the
    // course is left.
    //=========================================================================
    const ORDER_ROW_H = 13;

    class Sprite_RaceOrder extends Sprite_PSXWidget {
        constructor(scene) {
            super(146, 22 + LANES * ORDER_ROW_H + 6, 4, 30);
            this._scene = scene;
            this.visible = false;
        }

        refresh() {
            const H = HUD();
            if (!H || !this._scene || !this.visible) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            const scene = this._scene;
            const horses = scene._raceHorses.slice().sort((a, b) => b.position - a.position);
            const lead = horses[0] ? horses[0].position : 0;
            const left = Math.max(0, Math.round(RACE_LEN - lead));

            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('AnimatedHorseRace.runningOrder'),
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });
            this.hudText(T('AnimatedHorseRace.toRun', { m: left }), 6, 12, this._vw - 12, 'center', D.dim, 8);

            horses.forEach((horse, place) => {
                const y = 22 + place * ORDER_ROW_H;
                const index = scene._raceHorses.indexOf(horse);
                const mine = index === scene._selectedHorse;
                if (mine) H.decoSelect(bmp, 3, y - 1, this._vw - 6, ORDER_ROW_H - 1, D.jade);

                this.hudText(String(place + 1), 6, y, 8, 'right', D.gold, 8);
                bmp.fillRect(18, y + 1, 8, 8, horse.silk);
                bmp.fillRect(20, y + 3, 4, 4, horse.device);
                this.hudText(horse.name, 30, y, 62, 'left', mine ? D.goldHi : D.ink, 8);

                const behind = (lead - horse.position) / LENGTH_M;
                const label = place === 0
                    ? T('AnimatedHorseRace.inFront')
                    : T('AnimatedHorseRace.lengths', { n: behind < 0.25 ? T('AnimatedHorseRace.nose') : behind.toFixed(1) });
                this.hudText(label, this._vw - 52, y, 46, 'right', place === 0 ? D.gold : D.dim, 8);
            });

            // One gauge for the whole field: where the race has got to.
            H.decoBar(bmp, 6, this._vh - 8, this._vw - 12, 5, lead / RACE_LEN);
            this.endText();
        }
    }

    //=========================================================================
    // The result: the winner, the frame and what the slip paid.
    //=========================================================================
    class Sprite_RaceResult extends Sprite_PSXWidget {
        constructor(scene) {
            super(196, 148, 0, 0);
            this._scene = scene;
            this.x = Math.round(((hudW() - 196) / 2) * hudScale());
            this.y = Math.round(34 * hudScale());
            this.visible = false;
        }

        refresh() {
            const H = HUD();
            if (!H || !this._scene || !this.visible) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            const scene = this._scene;
            const winner = scene._winner;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('AnimatedHorseRace.raceResults'),
                titleRight: scene._photo ? T('AnimatedHorseRace.photoTag') : '',
                headerH: 9, hairline: false, step: 2, dom: this._dom
            });
            H.decoSunburst(bmp, 6, this._vh - 6, 22, D.goldLo, { from: Math.PI * 1.5, span: Math.PI / 2 });

            if (winner) {
                bmp.fillRect(8, 15, 14, 14, D.goldLo);
                bmp.fillRect(9, 16, 12, 12, winner.silk);
                bmp.fillRect(12, 19, 6, 6, winner.device);
                this.hudText(winner.name, 26, 16, this._vw - 34, 'left', D.goldHi, 8);
                this.hudText(T('AnimatedHorseRace.winner'), 26, 25, this._vw - 34, 'left', D.dim, 8);
            }

            this.hudText(scene._won ? T('AnimatedHorseRace.youWon') : T('AnimatedHorseRace.youLost'),
                6, 36, this._vw - 12, 'center', scene._won ? D.green : D.red, 8);
            H.decoRule(bmp, 8, 47, this._vw - 16, D.goldLo);

            const lines = scene._won
                ? [[T('AnimatedHorseRace.bet'), scene._bet, D.ink],
                   [T('AnimatedHorseRace.won'), scene._lastWin, D.green],
                   [T('AnimatedHorseRace.profit'), scene._lastWin - scene._bet, D.green]]
                : [[T('AnimatedHorseRace.lost'), scene._bet, D.red]];
            lines.forEach(([label, value, color], i) => {
                const y = 52 + i * 10;
                this.hudText(label, 10, y, 80, 'left', D.dim, 8);
                this.hudText(String(value), this._vw - 76, y, 66, 'right', color, 8);
            });

            // The frame, in the order the post saw it.
            const top = 52 + lines.length * 10 + 4;
            this.hudText(T('AnimatedHorseRace.frame'), 10, top, this._vw - 20, 'left', D.gold, 8);
            const places = T.list('AnimatedHorseRace.placeOrdinal');
            scene._finishOrder.forEach((id, place) => {
                const horse = scene._raceHorses.find(h => h.id === id);
                if (!horse || place > 5) return;
                const y = top + 10 + place * 10;
                this.hudText(places[place] || String(place + 1), 10, y, 20, 'left', D.dim, 8);
                bmp.fillRect(32, y + 1, 8, 8, horse.silk);
                bmp.fillRect(34, y + 3, 4, 4, horse.device);
                this.hudText(horse.name, 44, y, this._vw - 56, 'left',
                    place === 0 ? D.gold : D.ink, 8);
            });
            this.endText();
        }
    }

    //=========================================================================
    // The hint strip. An RMMZ windowskin frame is the one thing on screen that
    // could never have come off a PlayStation, so it is a sprite.
    //=========================================================================
    class Sprite_RaceStatus extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 13, 0, 0);
            this.y = Graphics.height - Math.round(13 * hudScale());
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
            this.beginText();
            if (!this._text) { this.endText(); return; }
            bmp.fillRect(0, 0, this._vw, this._vh, D.black);
            bmp.fillRect(0, 0, this._vw, 1, D.gold);
            this.hudText(this._text, 2, 2, this._vw - 4, 'center', D.ink, 8);
            this.endText();
        }
    }

    window.Scene_HorseRace = Scene_HorseRace;

})();
