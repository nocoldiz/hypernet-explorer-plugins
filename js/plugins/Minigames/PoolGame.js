/*:
 * @target MZ
 * @plugindesc Low-poly 3D pool (billiards) minigame v2.0.0
 * @author Omni-Lex
 * @version 2.0.0
 *
 * @help PoolGame.js
 *
 * A game of pool played on a real table, rendered with three.js through the
 * shared PSXShader the same way BowlingMinigame.js draws its alley and
 * BasketballMinigame.js its court.
 *
 * The table is a 9 foot one in metres (2.54 x 1.27 m of cloth, 57.15 mm balls,
 * six pockets) and the balls are real: they roll under cloth friction, throw
 * each other off on impact, rattle in the jaws and drop.
 *
 * The table is dropped into the battleback of wherever the player is standing
 * (the map's <Biome> tag, the procedural biome on map 636, or the map's own
 * battleback1), so the same cabinet is played in a bar, in a cave or on an
 * alien planet depending on where it stands.
 *
 * The input flow is the aim/power/spin oscillating-slider one shared with the
 * bowling and basketball minigames:
 *   Aim step      Left/Right swing the cue around the cue ball, and holding
 *                 Up or Down while steering slows it to a fine adjustment.
 *                 OK to lock.
 *   Power step    OK to stop the power bar.
 *   English step  OK to stop the side-spin bar. English swerves the cue ball
 *                 as it rolls and throws it off line after a contact.
 *   Cancel        steps back one stage, or quits from the aim step.
 *
 * Player 2 takes the other side whenever the split screen is running, and the
 * CPU plays it otherwise.
 *
 * The HUD is built the way a PlayStation built one, minus the television: a
 * 240-line virtual framebuffer upscaled with nearest filtering for the boxes,
 * keylines and block gauges, with every label on top of them as crisp HTML type
 * (window.PSXHud / PSXHud.domPanel). No scanlines, no vignette.
 *
 * ASCII mode is untouched: with it on the whole game falls back to the flat
 * top-down character readout it always had, drawn on the ASCII canvas.
 *
 * Requires js/libs/three.min.js and Battler3D/PSXShader.js.
 *
 * @param ---Physics Settings---
 * @default
 *
 * @param Cloth Friction
 * @parent ---Physics Settings---
 * @desc Rolling deceleration of a ball in m/s^2. Higher is a slower cloth.
 * @type number
 * @decimals 2
 * @default 0.62
 *
 * @param Cushion Bounce
 * @parent ---Physics Settings---
 * @desc Cushion elasticity (0-1).
 * @type number
 * @decimals 2
 * @default 0.72
 *
 * @param ---Sound Effects---
 * @default
 *
 * @param Cue Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when the cue strikes the ball.
 * @type file
 * @dir audio/se/
 *
 * @param Ball Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when two balls collide.
 * @type file
 * @dir audio/se/
 *
 * @param Cushion Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when a ball hits a cushion.
 * @type file
 * @dir audio/se/
 *
 * @param Pocket Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when a ball drops.
 * @type file
 * @dir audio/se/
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
 * @desc Difficulty level (1=Easy, 2=Normal, 3=Hard)
 * @type number
 * @min 1
 * @max 3
 * @default 2
 *
 * @command openPoolGame
 * @text Open Pool Game
 * @desc Opens the 3D pool minigame.
 */

(() => {
    'use strict';

    // js/plugins.js lists this plugin under its folder, and that folder-
    // qualified name is what the editor writes into the parameter table and
    // into every event that calls the command, while the convention in code
    // here is the bare basename. Both are answered, so neither goes unheard.
    const pluginName = 'PoolGame';
    const PLUGIN_KEYS = ['Minigames/' + pluginName, pluginName];
    const params = PLUGIN_KEYS.reduce((found, key) => {
        const p = PluginManager.parameters(key);
        return Object.keys(p).length ? p : found;
    }, {});

    const num = (key, def) => {
        const v = parseFloat(params[key]);
        return isFinite(v) ? v : def;
    };

    const FRICTION = Math.max(0.15, num('Cloth Friction', 0.62));
    const CUSHION = Math.max(0.3, Math.min(0.95, num('Cushion Bounce', 0.72)));
    const DIFFICULTY = Math.max(1, Math.min(3, Math.round(num('Difficulty Level', 2))));
    const gameResultVariable = parseInt(params['Game Result Variable'], 10) || 0;

    const se = (key, def, volume) => ({
        name: params[key] || def || '', volume: volume || 90, pitch: 100, pan: 0
    });
    const cueSound = se('Cue Sound', '', 90);
    const ballSound = se('Ball Sound', '', 80);
    const cushionSound = se('Cushion Sound', '', 60);
    const pocketSound = se('Pocket Sound', '', 90);

    // Forward declaration: the scene class is defined near the bottom, the
    // plugin command needs the binding to exist now.
    let Scene_Pool;

    for (const key of PLUGIN_KEYS) {
        PluginManager.registerCommand(key, 'openPoolGame', () => {
            SceneManager.push(Scene_Pool);
        });
    }

    //=========================================================================
    // Table dimensions (metres). The cloth is the y = 0 plane, x runs down the
    // length of the table and z across it, both centred on the middle spot.
    //=========================================================================
    const TABLE_L = 2.54;              // 9 foot table, playing surface
    const TABLE_W = 1.27;
    const HALF_L = TABLE_L / 2;
    const HALF_W = TABLE_W / 2;
    const BALL_R = 0.028575;           // 57.15 mm ball
    const POCKET_R = 0.062;
    const MOUTH = 0.085;               // how far a pocket eats into its rails
    const CUSHION_H = 0.036;
    const RAIL_W = 0.11;
    const RAIL_TOP = 0.046;
    const TABLE_H = 0.78;              // cloth height off the floor

    const HEAD_X = -HALF_L / 2;        // head spot, where the cue ball breaks from
    const FOOT_X = HALF_L / 2;         // foot spot, the apex of the rack

    const MAX_SPEED = 4.6;             // m/s off the cue at full power
    const MIN_SPEED = 0.85;
    const STOP_SPEED = 0.035;

    const POCKETS = [
        { x: -HALF_L, z: -HALF_W }, { x: 0, z: -HALF_W }, { x: HALF_L, z: -HALF_W },
        { x: -HALF_L, z: HALF_W }, { x: 0, z: HALF_W }, { x: HALF_L, z: HALF_W }
    ];

    // Ball colours, 1..15. Nine through fifteen repeat the first seven as
    // stripes, which is what a real set does.
    const BALL_COLORS = [
        0xf2c31a, 0x1f4fd8, 0xd12f2f, 0x6b2fa8, 0xe08120,
        0x1f8a3d, 0x8c3320, 0x111111, 0xf2c31a, 0x1f4fd8,
        0xd12f2f, 0x6b2fa8, 0xe08120, 0x1f8a3d, 0x8c3320
    ];

    const STATE = {
        AIM: 'aim',
        POWER: 'power',
        ENGLISH: 'english',
        CPU: 'cpu',
        ROLLING: 'rolling',
        SETTLE: 'settle',
        GAMEOVER: 'gameover'
    };

    // The table is built and rendered through the player's own retro settings,
    // dialled DOWN from the global default: the cloth and the balls read better
    // clean and the period flavour is carried by the HUD. The tunables are
    // scaled rather than replaced, so switching the shader off in the options
    // still switches it off here.
    const PSX_SOFTEN = { vertexSnap: 1.5, colorLevels: 1.3, dither: 0.6, downscale: 1 };

    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    const asciiOn = () => !!(window.AsciiMode && window.AsciiMode.active);

    //=========================================================================
    // Deterministic RNG so the cloth grain and the woodwork look identical for
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
    // Backdrop. The table is dropped into whatever the player is looking at,
    // so the battleback is resolved exactly the way a fight on this spot would
    // resolve it: map <Biome> tag first, then the procedural map's biome, then
    // the interior default, and finally the map's own battleback1.
    //=========================================================================
    function currentBiomeName() {
        try {
            if ($gameMap && typeof $gameMap.getBiome === 'function') {
                const tagged = $gameMap.getBiome();
                if (tagged) return tagged;
            }
            const proc = $gameSystem && $gameSystem._procGenData;
            if (proc && $gameMap && $gameMap.mapId() === 636) {
                if (proc.displayAsIsland) return 'Island';
                if (proc.displayAsBeach) return 'Beach';
                if (proc.currentBiome) return proc.currentBiome;
            }
            if ($gameMap && typeof $gameMap.isInterior === 'function' && $gameMap.isInterior()) {
                return 'Dungeon';
            }
        } catch (e) { /* fall through to the default biome */ }
        return 'Fields';
    }

    function backdropBitmap() {
        try {
            let file = null;
            if (typeof ImageManager.getBiomeBackgroundForPlayer === 'function') {
                const biome = currentBiomeName();
                file = ImageManager.getBiomeBackgroundForPlayer(biome);
                if (!file && biome !== 'Fields') {
                    file = ImageManager.getBiomeBackgroundForPlayer('Fields');
                }
            }
            if (!file && $dataMap && $dataMap.battleback1Name) {
                file = $dataMap.battleback1Name;
            }
            if (file) return ImageManager.loadBattleback1(file);
        } catch (e) { /* no backdrop, the plain gradient is used instead */ }
        return null;
    }

    //=========================================================================
    // PoolTable - the balls and the cloth they roll on. Kept apart from the
    // renderer so the physics can be read (and tuned) without three.js in the
    // way, and so the ASCII readout can be drawn from the same numbers.
    //=========================================================================
    class PoolTable {
        constructor() {
            this.balls = [];
            this.rack();
        }

        rack() {
            this.balls.length = 0;
            this.cue = this._ball(0, HEAD_X, 0);

            // Standard triangle: apex on the foot spot, rows widening away from
            // the cue ball. The eight sits in the middle of the third row.
            const gap = BALL_R * 2 * 1.02;
            const rowStep = gap * Math.sin(Math.PI / 3);
            const order = [1, 9, 2, 10, 3, 8, 11, 4, 12, 5, 13, 6, 14, 7, 15];
            let i = 0;
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col <= row; col++) {
                    const x = FOOT_X + row * rowStep;
                    const z = (col - row / 2) * gap;
                    this._ball(order[i++], x, z);
                }
            }
        }

        _ball(n, x, z) {
            const ball = {
                n: n, x: x, z: z, vx: 0, vz: 0,
                english: 0, spinTime: 0, potted: false
            };
            this.balls.push(ball);
            return ball;
        }

        live() {
            return this.balls.filter(b => !b.potted);
        }

        // Object balls still standing, the eight excluded: the count the eight
        // ball rule is read against.
        objectBallsLeft() {
            return this.balls.filter(b => !b.potted && b.n > 0 && b.n !== 8).length;
        }

        moving() {
            return this.balls.some(b => !b.potted && (b.vx !== 0 || b.vz !== 0));
        }

        strike(angle, speed, english) {
            const cue = this.cue;
            if (cue.potted) return;
            cue.vx = Math.cos(angle) * speed;
            cue.vz = Math.sin(angle) * speed;
            cue.english = Math.max(-1, Math.min(1, english));
            cue.spinTime = 0.55;
        }

        // Put the cue ball back on the head spot after a scratch, walking it up
        // the table if something is already sitting there.
        respot() {
            const cue = this.cue;
            cue.vx = cue.vz = 0;
            cue.english = 0;
            cue.potted = false;
            for (let step = 0; step < 40; step++) {
                cue.x = HEAD_X - step * BALL_R * 2.2;
                cue.z = 0;
                if (cue.x < -HALF_L + BALL_R * 2) cue.x = HEAD_X + step * BALL_R * 2.2;
                const clash = this.balls.some(b => b !== cue && !b.potted &&
                    Math.hypot(b.x - cue.x, b.z - cue.z) < BALL_R * 2.2);
                if (!clash) return;
            }
        }

        // One substep. Returns the events it produced so the scene can play the
        // sounds and shake the camera without re-deriving them.
        step(dt) {
            const events = { ball: 0, cushion: 0, potted: [], impact: 0 };

            for (const b of this.balls) {
                if (b.potted) continue;
                const speed = Math.hypot(b.vx, b.vz);
                if (speed > 0) {
                    // English swerves the ball while the spin is still on it.
                    if (b.spinTime > 0 && b.english !== 0) {
                        b.spinTime -= dt;
                        const swerve = b.english * 0.55 * dt;
                        const nx = -b.vz / speed, nz = b.vx / speed;
                        b.vx += nx * swerve * speed;
                        b.vz += nz * swerve * speed;
                    }
                    const drop = FRICTION * dt;
                    if (speed <= drop + STOP_SPEED) {
                        b.vx = b.vz = 0;
                    } else {
                        const k = (speed - drop) / speed;
                        b.vx *= k;
                        b.vz *= k;
                    }
                }
                b.x += b.vx * dt;
                b.z += b.vz * dt;
            }

            this._cushions(events);
            this._contacts(events);
            this._pockets(events);
            return events;
        }

        // A cushion is only there between the pockets: in a pocket mouth the
        // ball carries on into the jaws instead of bouncing.
        _cushions(events) {
            const limX = HALF_L - BALL_R;
            const limZ = HALF_W - BALL_R;
            for (const b of this.balls) {
                if (b.potted) continue;

                // Short rails, cut by the two corner pockets on that end.
                if (b.x > limX || b.x < -limX) {
                    if (Math.abs(b.z) < HALF_W - MOUTH) {
                        b.x = b.x > 0 ? limX : -limX;
                        if (b.vx !== 0) {
                            events.cushion++;
                            events.impact = Math.max(events.impact, Math.abs(b.vx));
                        }
                        b.vx = -b.vx * CUSHION;
                        b.vz *= 0.96;
                    }
                }
                // Long rails, cut by a corner pocket at each end and the side
                // pocket in the middle.
                if (b.z > limZ || b.z < -limZ) {
                    const inMouth = Math.abs(b.x) < MOUTH || Math.abs(b.x) > HALF_L - MOUTH;
                    if (!inMouth) {
                        b.z = b.z > 0 ? limZ : -limZ;
                        if (b.vz !== 0) {
                            events.cushion++;
                            events.impact = Math.max(events.impact, Math.abs(b.vz));
                        }
                        b.vz = -b.vz * CUSHION;
                        b.vx *= 0.96;
                    }
                }

                // The jaws behind a pocket mouth, so a ball that misses the drop
                // rattles back onto the cloth instead of leaving the table.
                const jawX = HALF_L + POCKET_R * 0.9;
                const jawZ = HALF_W + POCKET_R * 0.9;
                if (b.x > jawX) { b.x = jawX; b.vx = -b.vx * 0.45; }
                if (b.x < -jawX) { b.x = -jawX; b.vx = -b.vx * 0.45; }
                if (b.z > jawZ) { b.z = jawZ; b.vz = -b.vz * 0.45; }
                if (b.z < -jawZ) { b.z = -jawZ; b.vz = -b.vz * 0.45; }
            }
        }

        _contacts(events) {
            const list = this.balls;
            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                if (a.potted) continue;
                for (let j = i + 1; j < list.length; j++) {
                    const b = list[j];
                    if (b.potted) continue;

                    const dx = b.x - a.x;
                    const dz = b.z - a.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist >= BALL_R * 2 || dist < 1e-6) continue;

                    const nx = dx / dist, nz = dz / dist;
                    const dvn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
                    // Overlapping but separating: leave them to it.
                    if (dvn < 0) {
                        // Equal masses, so the normal components are simply
                        // swapped, less the small loss a real contact takes.
                        const imp = dvn * 0.97;
                        a.vx += imp * nx; a.vz += imp * nz;
                        b.vx -= imp * nx; b.vz -= imp * nz;

                        // Throw: side spin on the striking ball drags the object
                        // ball a little off the true contact line.
                        const spinner = Math.abs(a.english) > Math.abs(b.english) ? a : b;
                        if (spinner.spinTime > 0 && spinner.english !== 0) {
                            const throwK = spinner.english * 0.08 * Math.abs(dvn);
                            a.vx += -nz * throwK; a.vz += nx * throwK;
                            b.vx += -nz * throwK; b.vz += nx * throwK;
                            spinner.spinTime *= 0.5;
                        }

                        events.ball++;
                        events.impact = Math.max(events.impact, Math.abs(dvn));
                    }

                    const overlap = (BALL_R * 2 - dist) / 2;
                    a.x -= nx * overlap; a.z -= nz * overlap;
                    b.x += nx * overlap; b.z += nz * overlap;
                }
            }
        }

        _pockets(events) {
            for (const b of this.balls) {
                if (b.potted) continue;
                for (const p of POCKETS) {
                    if (Math.hypot(b.x - p.x, b.z - p.z) < POCKET_R) {
                        b.potted = true;
                        b.vx = b.vz = 0;
                        b.english = 0;
                        events.potted.push(b.n);
                        break;
                    }
                }
            }
        }

        // Where the cue ball would first meet something along a line, which is
        // what the aiming guide draws and what the CPU checks a path with.
        cast(fromX, fromZ, angle, ignore) {
            const dx = Math.cos(angle), dz = Math.sin(angle);
            let best = 6.0;
            let hit = null;

            for (const b of this.balls) {
                if (b.potted || b === ignore) continue;
                const ox = b.x - fromX, oz = b.z - fromZ;
                const along = ox * dx + oz * dz;
                if (along <= 0) continue;
                const perp = Math.abs(ox * dz - oz * dx);
                const reach = BALL_R * 2;
                if (perp > reach) continue;
                const t = along - Math.sqrt(reach * reach - perp * perp);
                if (t > 0 && t < best) { best = t; hit = b; }
            }

            // The rails, so the guide stops at the cloth's edge.
            const wallT = (limit, o, d) => {
                if (Math.abs(d) < 1e-6) return Infinity;
                const t1 = (limit - o) / d, t2 = (-limit - o) / d;
                const t = Math.max(t1, t2);
                return t > 0 ? t : Infinity;
            };
            const railT = Math.min(
                wallT(HALF_L - BALL_R, fromX, dx),
                wallT(HALF_W - BALL_R, fromZ, dz)
            );
            if (railT < best) { best = railT; hit = null; }

            return { dist: Math.max(0.02, best), ball: hit };
        }
    }

    //=========================================================================
    // Table3D - the three.js stage. Renders to its own small canvas which the
    // scene composites as a PIXI sprite over the battleback, the same approach
    // the bowling and basketball scenes use.
    //=========================================================================
    const CAM_AIM = 'aim';
    const CAM_ROLL = 'roll';
    const CAM_TABLE = 'table';

    class Table3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed());
            this._disposables = [];
            this._ballMeshes = new Map();
            this._camMode = CAM_AIM;
            this._camPos = { x: -HALF_L - 0.9, y: 0.5, z: 0 };
            this._camLook = { x: 0, y: 0, z: 0 };
            this._shake = 0;

            this._initThree();
            softPSX(() => {
                this._buildRoom();
                this._buildTable();
                this._buildLamps();
                this._buildCue();
                this._buildGuide();
                // One pass over the finished stage, so the lamps and the aiming
                // guide wear the same look as the table under them.
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            // No background: the canvas stays transparent so the battleback
            // behind it shows through and the table reads as part of the world.
            this.camera = new THREE.PerspectiveCamera(52, this._w / this._h, 0.05, 60);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            // Kept deliberately low: the two lamps over the table carry most of
            // the light, and their pools on the cloth only read as pools if the
            // rest of the room is not lit to the same level.
            this.scene.add(new THREE.AmbientLight(0x9fb0cc, 0.45));

            const key = new THREE.DirectionalLight(0xfff0d4, 0.35);
            key.position.set(1.5, 4, 2.2);
            this.scene.add(key);
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

        _box(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        //--- procedural textures --------------------------------------------

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

        _clothTexture() {
            const rand = this._rand;
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = '#116b3a';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 900; i++) {
                    const x = Math.floor(rand() * w), y = Math.floor(rand() * h);
                    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }, 10, 5);
        }

        _woodTexture(base, grain) {
            const rand = this._rand;
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = base;
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 60; i++) {
                    const y = Math.floor(rand() * h);
                    ctx.fillStyle = grain;
                    ctx.globalAlpha = 0.12 + rand() * 0.2;
                    ctx.fillRect(0, y, w, 1);
                }
                ctx.globalAlpha = 1;
            }, 6, 2);
        }

        _floorTexture() {
            const rand = this._rand;
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = '#2a2119';
                ctx.fillRect(0, 0, w, h);
                for (let y = 0; y < h; y += 16) {
                    ctx.fillStyle = '#1a140f';
                    ctx.fillRect(0, y, w, 1);
                }
                for (let i = 0; i < 200; i++) {
                    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,220,170,0.05)' : 'rgba(0,0,0,0.12)';
                    ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 2, 1);
                }
            }, 8, 8);
        }

        // A ball is one 128x64 strip: the poles carry the stripe (white for a
        // solid, its own colour for a striped ball) and the equator carries the
        // number in its spot, twice around so it is nearly always in view.
        _ballTexture(n) {
            const solid = n <= 8;
            const color = n === 0 ? '#f4f2ea' : '#' + BALL_COLORS[n - 1].toString(16).padStart(6, '0');
            return this._canvasTexture(128, 64, (ctx, w, h) => {
                if (n === 0) {
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = '#c0392b';
                    ctx.beginPath();
                    ctx.arc(w * 0.25, h * 0.5, 4, 0, Math.PI * 2);
                    ctx.fill();
                    return;
                }
                if (solid) {
                    ctx.fillStyle = color;
                    ctx.fillRect(0, 0, w, h);
                } else {
                    ctx.fillStyle = '#f4f2ea';
                    ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = color;
                    ctx.fillRect(0, h * 0.28, w, h * 0.44);
                }
                ctx.fillStyle = '#f4f2ea';
                ctx.strokeStyle = 'rgba(0,0,0,0.25)';
                for (const u of [0.25, 0.75]) {
                    ctx.beginPath();
                    ctx.arc(w * u, h * 0.5, 11, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.fillStyle = '#111111';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                for (const u of [0.25, 0.75]) {
                    ctx.fillText(String(n), w * u, h * 0.5 + 1);
                }
            });
        }

        //--- geometry -------------------------------------------------------

        // Boards under the table, wide enough that no camera ever reaches the
        // edge of them and finds the backdrop behind the floor.
        _buildRoom() {
            const floor = this._mat({ map: this._floorTexture() });
            this._box(16, 0.06, 16, floor, 0, -TABLE_H - 0.03, 0);
        }

        _buildTable() {
            const cloth = this._mat({ map: this._clothTexture() });
            const rail = this._mat({ map: this._woodTexture('#4a2c17', '#2b170b') });
            const rubber = this._mat({ color: 0x0d5a30 });
            const hole = this._mat({ color: 0x05060a });
            const brass = this._mat({ color: 0xc8a960 });

            // The cloth is the y = 0 plane and everything else is stacked
            // around it: the body just under it, the cushions standing on its
            // edge and the rails outside those.
            const cw = 0.035;                          // cushion width
            const outerL = TABLE_L + (cw + RAIL_W) * 2;
            const outerW = TABLE_W + (cw + RAIL_W) * 2;

            this._box(TABLE_L, 0.02, TABLE_W, cloth, 0, -0.01, 0);
            this._box(outerL, 0.18, outerW, rail, 0, -0.092, 0);

            // Cushions, cut where the pockets eat into them.
            const segLong = (HALF_L - MOUTH * 2) / 2;
            for (const sz of [-1, 1]) {
                for (const sx of [-1, 1]) {
                    const mid = sx * (MOUTH + segLong);
                    this._box(segLong * 2, CUSHION_H, cw, rubber,
                        mid, CUSHION_H / 2, sz * (HALF_W + cw / 2));
                }
                this._box(cw, CUSHION_H, TABLE_W - MOUTH * 2, rubber,
                    sz * (HALF_L + cw / 2), CUSHION_H / 2, 0);
            }

            // Rails, outside the cushions so neither is drawn inside the other.
            const railMidL = HALF_W + cw + RAIL_W / 2;
            const railMidS = HALF_L + cw + RAIL_W / 2;
            this._box(outerL, RAIL_TOP, RAIL_W, rail, 0, RAIL_TOP / 2, railMidL);
            this._box(outerL, RAIL_TOP, RAIL_W, rail, 0, RAIL_TOP / 2, -railMidL);
            this._box(RAIL_W, RAIL_TOP, TABLE_W + cw * 2, rail, railMidS, RAIL_TOP / 2, 0);
            this._box(RAIL_W, RAIL_TOP, TABLE_W + cw * 2, rail, -railMidS, RAIL_TOP / 2, 0);

            // Pockets: a dark shaft under each mouth, with a brass ring on top.
            for (const p of POCKETS) {
                const shaft = new THREE.Mesh(
                    this._geo(new THREE.CylinderGeometry(POCKET_R, POCKET_R * 0.7, 0.14, 10)), hole);
                // A hair proud of the cloth, so the mouth is drawn over it
                // rather than fighting it for the same plane.
                shaft.position.set(p.x, -0.069, p.z);
                this.scene.add(shaft);
                const ring = new THREE.Mesh(
                    this._geo(new THREE.RingGeometry(POCKET_R, POCKET_R + 0.012, 12)), brass);
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(p.x, 0.003, p.z);
                this.scene.add(ring);
            }

            // Sight diamonds down the rails.
            for (let i = 1; i <= 3; i++) {
                const x = (HALF_L / 4) * i;
                for (const sx of [-1, 1]) {
                    for (const sz of [-1, 1]) {
                        this._box(0.014, 0.002, 0.014, brass, sx * x, RAIL_TOP + 0.001, sz * railMidL);
                    }
                }
            }

            // Legs, from the underside of the body down to the floor.
            const legTop = -0.182;
            const legH = TABLE_H + legTop;
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    this._box(0.13, legH, 0.13, rail,
                        sx * (HALF_L - 0.02), legTop - legH / 2, sz * (HALF_W - 0.02));
                }
            }

            this._buildBalls();
        }

        _buildBalls() {
            const geo = this._geo(new THREE.SphereGeometry(BALL_R, 12, 10));
            for (let n = 0; n <= 15; n++) {
                const mesh = new THREE.Mesh(geo, this._mat({ map: this._ballTexture(n) }));
                mesh.position.set(0, BALL_R, 0);
                this.scene.add(mesh);
                this._ballMeshes.set(n, mesh);
            }
        }

        // The lamps a pool table is always played under, and the two lights
        // that are the reason the cloth is lit and the room is not.
        _buildLamps() {
            const shade = this._mat({ color: 0x1b2430, side: THREE.DoubleSide });
            const glow = this._mat({ color: 0xffe6b0, emissive: 0xffe6b0 });
            for (const sx of [-1, 1]) {
                const x = sx * (HALF_L / 2);
                const cone = new THREE.Mesh(
                    this._geo(new THREE.CylinderGeometry(0.10, 0.22, 0.16, 10, 1, true)), shade);
                cone.position.set(x, 0.86, 0);
                this.scene.add(cone);
                this._box(0.02, 0.55, 0.02, shade, x, 1.20, 0);
                const bulb = new THREE.Mesh(
                    this._geo(new THREE.SphereGeometry(0.045, 8, 6)), glow);
                bulb.position.set(x, 0.80, 0);
                this.scene.add(bulb);

                const light = new THREE.PointLight(0xffe7bc, 0.6, 3.0, 2);
                light.position.set(x, 0.78, 0);
                this.scene.add(light);
            }
        }

        // The cue: a tapered shaft with a wrapped butt, held in a group so the
        // whole thing swings around the cue ball as one.
        _buildCue() {
            const group = new THREE.Group();
            const shaftMat = this._mat({ color: 0xd8b271 });
            const buttMat = this._mat({ color: 0x2d1a10 });
            const tipMat = this._mat({ color: 0x2a4a86 });
            const collarMat = this._mat({ color: 0xe8dfc0 });

            // Shorter than a real 1.45 m cue on purpose: the aiming camera
            // stands 1.36 m behind the cue ball, and a full length butt would
            // be drawn through it at full draw.
            const len = 1.05;
            const shaft = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.0065, 0.0135, len * 0.55, 7)), shaftMat);
            shaft.rotation.z = Math.PI / 2;
            shaft.position.x = -len * 0.275;
            group.add(shaft);

            const butt = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.0135, 0.0165, len * 0.45, 7)), buttMat);
            butt.rotation.z = Math.PI / 2;
            butt.position.x = -len * 0.775;
            group.add(butt);

            const collar = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.0138, 0.0138, 0.02, 7)), collarMat);
            collar.rotation.z = Math.PI / 2;
            collar.position.x = -len * 0.55;
            group.add(collar);

            const tip = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.0065, 0.0065, 0.015, 7)), tipMat);
            tip.rotation.z = Math.PI / 2;
            tip.position.x = -0.004;
            group.add(tip);

            // Tilted the way a cue is really held, butt end up off the cloth.
            group.rotation.z = 0.07;
            const pivot = new THREE.Group();
            pivot.add(group);
            pivot.position.set(HEAD_X, BALL_R, 0);
            this.scene.add(pivot);
            this._cue = pivot;
            this._cueBody = group;
        }

        // The aiming guide: a line along the shot and a ghost ball where the
        // cue ball would first meet something.
        _buildGuide() {
            const group = new THREE.Group();
            const lineMat = this._mat({ color: 0x8ff4ff, emissive: 0x2a7a86 });
            lineMat.transparent = true;
            lineMat.opacity = 0.55;

            const line = this._box(1, 0.002, 0.006, lineMat, 0.5, 0.001, 0, group);
            this._guideLine = line;

            const ghostMat = this._mat({ color: 0xd8f6ff, emissive: 0x35707c });
            ghostMat.transparent = true;
            ghostMat.opacity = 0.35;
            const ghost = new THREE.Mesh(this._geo(new THREE.SphereGeometry(BALL_R, 8, 6)), ghostMat);
            ghost.position.set(1, BALL_R, 0);
            group.add(ghost);
            this._ghost = ghost;

            this.scene.add(group);
            this._guide = group;
        }

        //--- per-frame sync --------------------------------------------------

        syncBalls(table, dt) {
            for (const b of table.balls) {
                const mesh = this._ballMeshes.get(b.n);
                if (!mesh) continue;
                mesh.visible = !b.potted;
                if (b.potted) continue;
                mesh.position.set(b.x, BALL_R, b.z);

                const speed = Math.hypot(b.vx, b.vz);
                if (speed > 0.001 && dt > 0) {
                    // Rolling without slipping: the axis is across the path.
                    const axis = new THREE.Vector3(-b.vz / speed, 0, b.vx / speed);
                    mesh.rotateOnWorldAxis(axis, (speed / BALL_R) * dt);
                }
            }
        }

        setCue(x, z, angle, pull, visible) {
            this._cue.visible = visible;
            if (!visible) return;
            this._cue.position.set(x, BALL_R, z);
            this._cue.rotation.y = -angle;
            this._cueBody.position.x = -(BALL_R + 0.012 + pull * 0.20);
        }

        setGuide(x, z, angle, dist, visible) {
            this._guide.visible = visible;
            if (!visible) return;
            this._guide.position.set(x, 0, z);
            this._guide.rotation.y = -angle;
            this._guideLine.scale.x = Math.max(0.02, dist);
            this._guideLine.position.x = Math.max(0.02, dist) / 2;
            this._ghost.position.x = dist;
        }

        shake(amount) {
            this._shake = Math.min(1.2, this._shake + amount);
        }

        setCameraMode(mode) {
            this._camMode = mode;
        }

        // The aim camera stands behind the cue ball looking down the shot, the
        // rolling one pulls back to a three-quarter view of the whole table and
        // the table one hangs over it.
        updateCamera(dt, cue, angle, snap) {
            let target, look, lerp = 0.12;

            if (this._camMode === CAM_AIM && cue) {
                const dx = Math.cos(angle), dz = Math.sin(angle);
                target = { x: cue.x - dx * 1.36, y: 0.56, z: cue.z - dz * 1.36 };
                look = { x: cue.x + dx * 0.90, y: 0.0, z: cue.z + dz * 0.90 };
                lerp = 0.18;
            } else if (this._camMode === CAM_TABLE) {
                target = { x: 0, y: 2.05, z: 1.30 };
                look = { x: 0, y: 0, z: 0 };
                lerp = 0.08;
            } else {
                target = { x: -1.70, y: 1.35, z: 1.55 };
                look = { x: 0, y: 0, z: 0 };
                lerp = 0.10;
            }

            const k = snap ? 1 : 1 - Math.pow(1 - lerp, Math.max(0.2, dt * 60));
            this._camPos.x += (target.x - this._camPos.x) * k;
            this._camPos.y += (target.y - this._camPos.y) * k;
            this._camPos.z += (target.z - this._camPos.z) * k;
            this._camLook.x += (look.x - this._camLook.x) * k;
            this._camLook.y += (look.y - this._camLook.y) * k;
            this._camLook.z += (look.z - this._camLook.z) * k;

            this._shake = Math.max(0, this._shake - dt * 2.4);
            const s = this._shake;
            this.camera.position.set(
                this._camPos.x + (Math.random() - 0.5) * s * 0.03,
                this._camPos.y + (Math.random() - 0.5) * s * 0.03,
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
            this._ballMeshes.clear();
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
    // HUD. Drawn in a 240-line virtual framebuffer and upscaled with nearest
    // filtering, the way a PlayStation drew its overlays: an 8px bitmap face,
    // hard one-pixel shadows, block gauges. Dressed art deco, gold on black
    // lacquer, matching the alley and the court: see PSXHud.DECO and the deco*
    // primitives in PSXShader.js.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    // Every DOM handle the widgets have taken, so they can be re-laid out when
    // one moves and torn down when the scene ends.
    let POOL_DOMS = [];

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
                POOL_DOMS.push(this._dom);
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
    }

    class Sprite_PoolMeter extends Sprite_PSXWidget {
        constructor(vx, vy, label, centred) {
            super(34, 118, vx, vy);
            this._label = label;
            this._centred = !!centred;
            this._value = 0;
            this.visible = false;
        }

        setValue(value) {
            this._value = value;
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
                title: this._label, titleAlign: 'center', headerH: 9, hairline: false, step: 1,
                dom: this._dom
            });
            if (this._centred) {
                H.decoVBar(bmp, 10, 15, 14, 96, Math.max(-1, Math.min(1, this._value)), {
                    center: true,
                    colorAt: t => (t > 0.5 ? D.gold : D.jade)
                });
                this.hudText('+', 0, 14, this._vw, 'center', D.dim, 8);
                this.hudText('-', 0, 104, this._vw, 'center', D.dim, 8);
            } else {
                H.decoVBar(bmp, 10, 15, 14, 96, Math.max(0, Math.min(1, this._value / 100)), {
                    colorAt: t => (t < 0.4 ? D.jade : (t < 0.78 ? D.gold : D.red))
                });
            }
            this.endText();
        }
    }

    //=========================================================================
    // The scoreboard: who is at the table, what each side has taken off it and
    // how much is left standing.
    //=========================================================================
    class Sprite_PoolScoreboard extends Sprite_PSXWidget {
        constructor() {
            super(150, 46, 5, 5);
            this._data = null;
        }

        refresh(data) {
            const H = HUD();
            if (!H) return;
            if (data) this._data = data;
            const d = this._data;
            if (!d) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, {
                title: T('PoolGame.hud.title'), titleAlign: 'left',
                titleRight: T('PoolGame.hud.onTable', { count: d.onTable }),
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });
            this.drawRow(d.playerName, d.playerScore, d.turn === 1, 15);
            this.drawRow(d.opponentName, d.opponentScore, d.turn === 2, 29);
            this.endText();
        }

        // The side at the table wears a lit plate with a gold spine, which is
        // the one thing on the board that has to be read at a glance.
        drawRow(name, score, active, y) {
            const H = HUD();
            const D = H.DECO;
            const bmp = this.bitmap;
            if (active) H.decoSelect(bmp, 5, y - 1, this._vw - 10, 12, D.gold);
            this.hudText(name, 10, y, 96, 'left', active ? D.goldHi : D.dim, 8);
            this.hudText(String(score), this._vw - 34, y, 24, 'right', active ? D.ink : D.faint, 8);
        }
    }

    //=========================================================================
    // Status strip and result card, as sprites: an RMMZ windowskin frame is the
    // one thing on screen that could never have come off a PlayStation.
    //=========================================================================
    class Sprite_PoolStatus extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 14, 0, 0);
            this.y = Graphics.height - Math.round(14 * hudScale());
            this._text = null;
        }

        setText(text) {
            if (this._text === text) return;
            this._text = text;
            this.refresh();
        }

        // The ASCII readout prints the same line the strip is carrying.
        text() {
            return this._text || '';
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

    class Sprite_PoolResult extends Sprite_PSXWidget {
        constructor() {
            super(172, 56);
            this.x = Math.round((Graphics.width - this._vw * hudScale()) / 2);
            this.y = Math.round((Graphics.height - this._vh * hudScale()) / 2);
            this.visible = false;
        }

        show() { this.visible = true; }

        setText(result, score, tone) {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { step: 3 });
            H.decoSunburst(bmp, 1, 11, 12, D.goldLo, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
            H.decoSunburst(bmp, this._vw - 2, 11, 12, D.goldLo, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            const col = tone === 1 ? D.green : (tone === 2 ? D.red : D.goldHi);
            this.hudText(result, 0, 7, this._vw, 'center', col, 16);
            H.decoRule(bmp, 10, 28, this._vw - 20, D.goldLo);
            this.hudText(score, 0, 31, this._vw, 'center', D.ink, 8);
            this.endText();
        }
    }

    //=========================================================================
    // Scene_Pool
    //=========================================================================
    const P2_KEYS = {
        ok: 'action', cancel: 'dash',
        left: 'left', right: 'right', up: 'up', down: 'down'
    };

    Scene_Pool = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._table = new PoolTable();
            this._state = STATE.AIM;
            // Who is racked up against the player when nobody is holding the
            // second pad: a companion, a local off the map, or the player's own
            // head. Read once, so the same person is at the table all frame.
            this._standIn = window.MinigameOpponent?.pick() ?? null;
            this._isPlayerTurn = true;
            this._playerScore = 0;
            this._opponentScore = 0;
            this._threeReady = typeof THREE !== 'undefined';
            this._winner = 0;
            this._timer = 0;
            this._rollTime = 0;
            this._settleFrames = 0;
            this._soundCooldown = 0;

            this._meterSpeed = DIFFICULTY === 1 ? 0.75 : DIFFICULTY === 3 ? 1.3 : 1.0;
            this._cpuAccuracy = DIFFICULTY === 1 ? 0.62 : DIFFICULTY === 3 ? 0.93 : 0.8;

            this._angle = 0;
            this._power = 0;
            this._powerDir = 1;
            this._english = 0;
            this._englishDir = 1;
            this._snapCamera = true;
        }

        //--- construction ----------------------------------------------------

        // Without three.js there is no table to look at, but the game itself
        // is only the physics and the ASCII readout draws straight from those,
        // so the frame is still played out rather than refused.
        create() {
            super.create();
            this.createUI();
            this.createAsciiLayer();
            if (this._threeReady) this.createTable();
            this.beginShot();
        }

        // The blurred map snapshot is replaced by the battleback of wherever
        // the player is standing, which the transparent 3D table sits on.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#141018', '#05050a', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);

            const bitmap = backdropBitmap();
            if (!bitmap) return;
            this._backdropSprite = new Sprite(bitmap);
            this.addChild(this._backdropSprite);
            bitmap.addLoadListener(() => this.fitBackdrop());
            this.fitBackdrop();

            // Knocked well back: a pool room is lit by the lamps over the table
            // and the walls are the dark half of the picture.
            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll('rgba(3, 4, 10, 0.55)');
            shade.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(shade);
        }

        fitBackdrop() {
            const sprite = this._backdropSprite;
            if (!sprite || !sprite.bitmap || !sprite.bitmap.width) return;
            const scale = Math.max(
                Graphics.width / sprite.bitmap.width,
                Graphics.height / sprite.bitmap.height
            );
            sprite.scale.set(scale, scale);
            sprite.x = (Graphics.width - sprite.bitmap.width * scale) / 2;
            sprite.y = Graphics.height - sprite.bitmap.height * scale;
        }

        createTable() {
            // Rendering a little below native and scaling up with nearest
            // filtering keeps a period edge without smearing the cloth.
            const scale = 0.88;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._view = new Table3D(w, h);

            const texture = PIXI.Texture.from(this._view.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._viewSprite = new PIXI.Sprite(texture);
            this._viewSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._viewSprite, idx);
            this._view.syncBalls(this._table, 0);
        }

        createUI() {
            this._scoreboard = new Sprite_PoolScoreboard();
            this.addChild(this._scoreboard);

            this._powerMeter = new Sprite_PoolMeter(6, 62, T('PoolGame.hud.power'), false);
            this.addChild(this._powerMeter);

            this._englishMeter = new Sprite_PoolMeter(hudW() - 40, 62, T('PoolGame.hud.english'), true);
            this.addChild(this._englishMeter);

            this._status = new Sprite_PoolStatus();
            this.addChild(this._status);

            this._result = new Sprite_PoolResult();
            this.addChild(this._result);

            this.refreshScoreboard();

            // The pixel font arrives asynchronously; repaint what was drawn once.
            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._scoreboard) return;
                    this.refreshScoreboard();
                    this._status.refresh();
                    this._powerMeter.refresh();
                    this._englishMeter.refresh();
                });
            }
        }

        createAsciiLayer() {
            this._asciiActive = false;
        }

        //--- helpers ---------------------------------------------------------

        isSplitScreen() {
            return !!(window.$gameSplitScreen && window.$gameSplitScreen.active);
        }

        isCpuTurn() {
            return !this._isPlayerTurn && !this.isSplitScreen();
        }

        opponentName() {
            if (this.isSplitScreen()) return T('PoolGame.player2');
            return window.MinigameOpponent
                ? window.MinigameOpponent.nameOf(this._standIn, T('PoolGame.player2Cpu'))
                : T('PoolGame.player2Cpu');
        }

        shooterName() {
            return this._isPlayerTurn ? T('PoolGame.player1') : this.opponentName();
        }

        // Input source for whoever is at the table.
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

        refreshScoreboard() {
            if (!this._scoreboard) return;
            this._scoreboard.refresh({
                playerName: T('PoolGame.player1'),
                opponentName: this.opponentName(),
                playerScore: this._playerScore,
                opponentScore: this._opponentScore,
                onTable: this._table.live().filter(b => b.n > 0).length,
                turn: this._isPlayerTurn ? 1 : 2
            });
        }

        refreshAiming() {
            if (!this._view) return;
            const cue = this._table.cue;
            const aiming = this._state === STATE.AIM || this._state === STATE.POWER ||
                this._state === STATE.ENGLISH;
            // The cue is drawn back by however much power is on the bar, and
            // rests just off the ball while the shot is only being lined up.
            const pull = (this._state === STATE.POWER || this._state === STATE.ENGLISH)
                ? this._power / 100 : 0.15;
            this._view.setCue(cue.x, cue.z, this._angle, aiming ? pull : 0, aiming && !cue.potted);
            if (aiming && !cue.potted) {
                const shot = this._table.cast(cue.x, cue.z, this._angle, cue);
                this._view.setGuide(cue.x, cue.z, this._angle, shot.dist, true);
            } else {
                this._view.setGuide(0, 0, 0, 0, false);
            }
        }

        //--- game flow -------------------------------------------------------

        beginShot() {
            this._power = 0;
            this._powerDir = 1;
            this._english = 0;
            this._englishDir = 1;
            this._rollTime = 0;
            this._settleFrames = 0;
            if (this._view) this._view.setCameraMode(CAM_AIM);

            if (this.isCpuTurn()) {
                this._state = STATE.CPU;
                this._timer = 50;
                this._status.setText(T('PoolGame.liningUp', { player: this.shooterName() }));
            } else {
                this._state = STATE.AIM;
                // Point the cue at the nearest ball so a turn opens on something
                // sensible rather than wherever the last player left it.
                this._angle = this.angleToNearestBall();
                this._status.setText(T('PoolGame.aimPrompt', { player: this.shooterName() }));
            }
            this.refreshScoreboard();
            this.refreshAiming();
        }

        angleToNearestBall() {
            const cue = this._table.cue;
            let best = this._angle;
            let bestD = Infinity;
            for (const b of this._table.balls) {
                if (b.potted || b === cue) continue;
                const d = Math.hypot(b.x - cue.x, b.z - cue.z);
                if (d < bestD) {
                    bestD = d;
                    best = Math.atan2(b.z - cue.z, b.x - cue.x);
                }
            }
            return best;
        }

        update() {
            super.update();

            const ascii = asciiOn();
            this.syncAsciiVisibility(ascii);

            switch (this._state) {
                case STATE.AIM: this.updateAim(); break;
                case STATE.POWER: this.updatePower(); break;
                case STATE.ENGLISH: this.updateEnglish(); break;
                case STATE.CPU: this.updateCpu(); break;
                case STATE.ROLLING: this.updateRolling(); break;
                case STATE.SETTLE: this.updateSettle(); break;
                case STATE.GAMEOVER: this.updateGameOver(); break;
            }

            if (this._soundCooldown > 0) this._soundCooldown--;

            if (ascii) {
                this.renderAscii();
                return;
            }

            // Nothing is drawn of the table without three.js, so the strip says
            // why rather than leaving an empty room.
            if (!this._threeReady) this._status.setText(T('PoolGame.noThree'));

            // The HTML labels are painted when a widget repaints, which is not
            // every frame: this keeps them on their sprite when one is shown,
            // hidden or moved in between.
            for (const dom of POOL_DOMS) dom.sync();

            // Redraw last, so the composited texture always shows the state the
            // logic above just produced rather than the previous frame's.
            if (this._view) {
                this._view.updateCamera(1 / 60, this._table.cue, this._angle, this._snapCamera);
                this._snapCamera = false;
                this._view.render();
                if (this._viewSprite && this._viewSprite.texture) {
                    this._viewSprite.texture.update();
                }
            }
        }

        updateAim() {
            const c = this.ctl();
            const fine = c.pressed('up') || c.pressed('down');
            const step = (fine ? 0.004 : 0.022) * this._meterSpeed;
            if (c.pressed('left')) this._angle -= step;
            if (c.pressed('right')) this._angle += step;
            this.refreshAiming();

            if (c.triggered('ok')) {
                SoundManager.playOk();
                this._state = STATE.POWER;
                this._powerMeter.setValue(this._power);
                this._powerMeter.visible = true;
                this._status.setText(T('PoolGame.powerPrompt', { player: this.shooterName() }));
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        updatePower() {
            this._power += this._powerDir * 2.6 * this._meterSpeed;
            if (this._power >= 100) { this._power = 100; this._powerDir = -1; }
            if (this._power <= 0) { this._power = 0; this._powerDir = 1; }
            this._powerMeter.setValue(this._power);
            this.refreshAiming();

            const c = this.ctl();
            if (c.triggered('ok')) {
                SoundManager.playOk();
                this._state = STATE.ENGLISH;
                this._englishMeter.setValue(this._english);
                this._englishMeter.visible = true;
                this._status.setText(T('PoolGame.englishPrompt', { player: this.shooterName() }));
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this._powerMeter.visible = false;
                this._state = STATE.AIM;
                this._status.setText(T('PoolGame.aimPrompt', { player: this.shooterName() }));
            }
        }

        updateEnglish() {
            this._english += this._englishDir * 0.035 * this._meterSpeed;
            if (this._english >= 1) { this._english = 1; this._englishDir = -1; }
            if (this._english <= -1) { this._english = -1; this._englishDir = 1; }
            this._englishMeter.setValue(this._english);

            const c = this.ctl();
            if (c.triggered('ok')) {
                SoundManager.playOk();
                this.shoot(this._angle, this._power, this._english);
            } else if (c.triggered('cancel')) {
                SoundManager.playCancel();
                this._englishMeter.visible = false;
                this._state = STATE.POWER;
                this._status.setText(T('PoolGame.powerPrompt', { player: this.shooterName() }));
            }
        }

        //--- the CPU ---------------------------------------------------------

        updateCpu() {
            if (this._timer-- > 0) return;
            const plan = this.planCpuShot();
            const err = (1 - this._cpuAccuracy);
            this._angle = plan.angle + (Math.random() - 0.5) * err * 0.22;
            this._power = Math.max(12, Math.min(100, plan.power + (Math.random() - 0.5) * err * 45));
            this._english = (Math.random() - 0.5) * 0.5;
            this.refreshAiming();
            this.shoot(this._angle, this._power, this._english);
        }

        // Look for a ball that can be cut into a pocket: the ghost ball behind
        // it has to be reachable and the cut has to be under a right angle.
        planCpuShot() {
            const table = this._table;
            const cue = table.cue;
            const legal = table.objectBallsLeft() > 0
                ? table.balls.filter(b => !b.potted && b.n > 0 && b.n !== 8)
                : table.balls.filter(b => !b.potted && b.n === 8);

            let best = null;
            for (const ball of legal) {
                for (const p of POCKETS) {
                    const toPocket = Math.hypot(p.x - ball.x, p.z - ball.z);
                    if (toPocket < 1e-4) continue;
                    const gx = ball.x - ((p.x - ball.x) / toPocket) * BALL_R * 2;
                    const gz = ball.z - ((p.z - ball.z) / toPocket) * BALL_R * 2;
                    const toGhost = Math.hypot(gx - cue.x, gz - cue.z);
                    if (toGhost < 1e-4) continue;

                    const angle = Math.atan2(gz - cue.z, gx - cue.x);
                    // The cut angle: straight on is best, past a right angle is
                    // not a shot at all.
                    const cut = ((p.x - ball.x) / toPocket) * ((gx - cue.x) / toGhost) +
                        ((p.z - ball.z) / toPocket) * ((gz - cue.z) / toGhost);
                    if (cut < 0.25) continue;

                    // Something in the way of the cue ball is the end of it.
                    const shot = table.cast(cue.x, cue.z, angle, cue);
                    if (shot.ball !== ball) continue;

                    const score = cut * 2.2 - toPocket * 0.35 - toGhost * 0.3;
                    if (!best || score > best.score) {
                        best = {
                            score: score, angle: angle,
                            power: Math.max(28, Math.min(92, 26 + (toPocket + toGhost) * 22))
                        };
                    }
                }
            }
            if (best) return best;

            // Nothing on: hit the nearest legal ball and leave it at that.
            let target = legal[0];
            let bestD = Infinity;
            for (const b of legal) {
                const d = Math.hypot(b.x - cue.x, b.z - cue.z);
                if (d < bestD) { bestD = d; target = b; }
            }
            if (!target) return { angle: this._angle, power: 45 };
            return {
                angle: Math.atan2(target.z - cue.z, target.x - cue.x),
                power: 35 + Math.random() * 30
            };
        }

        //--- the shot --------------------------------------------------------

        shoot(angle, power, english) {
            this._powerMeter.visible = false;
            this._englishMeter.visible = false;
            this._pottedThisShot = [];
            this._eightPotted = false;
            this._scratched = false;
            this._ballsBeforeShot = this._table.objectBallsLeft();

            const speed = MIN_SPEED + (Math.max(0, Math.min(100, power)) / 100) * (MAX_SPEED - MIN_SPEED);
            this._table.strike(angle, speed, english);
            this._state = STATE.ROLLING;
            this._rollTime = 0;
            this._settleFrames = 0;
            this._status.setText('');
            if (this._view) {
                this._view.setCue(0, 0, 0, 0, false);
                this._view.setGuide(0, 0, 0, 0, false);
                this._view.setCameraMode(CAM_ROLL);
            }
            this.playSe(cueSound, 100);
        }

        updateRolling() {
            const dt = 1 / 240;
            let events = null;
            for (let i = 0; i < 4; i++) {
                const e = this._table.step(dt);
                if (!events) events = e;
                else {
                    events.ball += e.ball;
                    events.cushion += e.cushion;
                    events.impact = Math.max(events.impact, e.impact);
                    for (const n of e.potted) events.potted.push(n);
                }
            }
            this._rollTime += dt * 4;

            if (events.ball && this._soundCooldown <= 0) {
                this.playSe(ballSound, 100 + Math.floor(Math.random() * 25));
                this._soundCooldown = 3;
                if (this._view) this._view.shake(Math.min(0.4, events.impact * 0.08));
            } else if (events.cushion && this._soundCooldown <= 0) {
                this.playSe(cushionSound, 90);
                this._soundCooldown = 5;
            }

            for (const n of events.potted) {
                this.playSe(pocketSound, 110);
                if (n === 0) this._scratched = true;
                else if (n === 8) this._eightPotted = true;
                else this._pottedThisShot.push(n);
            }

            if (this._view) this._view.syncBalls(this._table, dt * 4);

            if (!this._table.moving()) this._settleFrames++;
            else this._settleFrames = 0;

            if (this._settleFrames > 8 || this._rollTime > 16) {
                this._state = STATE.SETTLE;
                this._timer = 30;
                this.resolveShot();
            }
        }

        updateSettle() {
            if (this._timer-- > 0) return;
            if (this._winner) {
                this.showResult();
                return;
            }
            this._isPlayerTurn = this._nextIsPlayer;
            this.beginShot();
        }

        // What the shot did, said in one line, and whose turn it is next.
        resolveShot() {
            const potted = this._pottedThisShot.length;
            if (potted) {
                if (this._isPlayerTurn) this._playerScore += potted;
                else this._opponentScore += potted;
            }

            if (this._scratched) this._table.respot();
            if (this._view) this._view.syncBalls(this._table, 0);

            if (this._eightPotted) {
                // The eight is the end of the frame either way: down early it
                // loses the game, down last it wins it.
                const clean = this._ballsBeforeShot === 0 && !this._scratched;
                const shooterWon = clean;
                this._winner = (this._isPlayerTurn === shooterWon) ? 1 : 2;
                this._status.setText(clean ? T('PoolGame.eightGood') : T('PoolGame.eightEarly'));
                this._timer = 70;
                this.refreshScoreboard();
                if (this._view) this._view.setCameraMode(CAM_TABLE);
                return;
            }

            if (this._table.objectBallsLeft() === 0 && !this._table.balls.some(b => !b.potted && b.n === 8)) {
                this._winner = this._playerScore === this._opponentScore ? 3 :
                    (this._playerScore > this._opponentScore ? 1 : 2);
                this._timer = 60;
                this.refreshScoreboard();
                return;
            }

            // The table stays with a shooter who potted cleanly.
            const keepsTable = potted > 0 && !this._scratched;
            this._nextIsPlayer = keepsTable ? this._isPlayerTurn : !this._isPlayerTurn;

            if (this._scratched) {
                this._status.setText(T('PoolGame.scratch'));
            } else if (potted) {
                this._status.setText(T('PoolGame.potted', { count: potted }));
            } else {
                this._status.setText(T('PoolGame.nothingDown'));
            }
            this.refreshScoreboard();
        }

        updateGameOver() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                this.popScene();
            }
        }

        showResult() {
            this._state = STATE.GAMEOVER;
            const value = this._winner || 3;
            if (gameResultVariable > 0) $gameVariables.setValue(gameResultVariable, value);

            if (window.MinigameFun) {
                if (value === 1) window.MinigameFun.won('Billiards');
                else if (value === 2) window.MinigameFun.lost('Billiards');
                else window.MinigameFun.draw('Billiards');
            }

            // MinigameFun pays the party; a local who was talked into a frame
            // of pool is paid their own leisure here.
            if (!this.isSplitScreen()) window.MinigameOpponent?.payFun(this._standIn);

            const label = value === 1 ? T('PoolGame.victory') :
                (value === 2 ? T('PoolGame.defeat') : T('PoolGame.draw'));
            this._result.show();
            this._result.setText(label, T('PoolGame.finalScore', {
                player: T('PoolGame.player1'), playerScore: this._playerScore,
                opponent: this.opponentName(), opponentScore: this._opponentScore
            }), value);
            this._status.setText(T('PoolGame.pressAnyKey'));
            if (this._view) this._view.setCameraMode(CAM_TABLE);
        }

        playSe(sound, pitch) {
            if (!sound || !sound.name) return;
            AudioManager.playSe({
                name: sound.name, volume: sound.volume,
                pitch: pitch || sound.pitch, pan: 0
            });
        }

        //--- ASCII mode -------------------------------------------------------
        //
        // With ASCII mode on the table is read from above as characters, the
        // way it always was: the 3D view, the deco HUD and its HTML type all
        // stand down and the ASCII canvas has the screen to itself.

        syncAsciiVisibility(ascii) {
            if (ascii === this._asciiActive) return;
            this._asciiActive = ascii;

            if (ascii && window.AsciiMode) {
                window.AsciiMode.createCanvas();
                if (window.AsciiMode.canvas) window.AsciiMode.canvas.style.display = 'block';
            } else if (window.AsciiMode && window.AsciiMode.canvas) {
                window.AsciiMode.canvas.style.display = 'none';
            }

            if (this._viewSprite) this._viewSprite.visible = !ascii;
            if (this._backdropSprite) this._backdropSprite.visible = !ascii;
            if (this._scoreboard) this._scoreboard.visible = !ascii;
            if (this._status) this._status.visible = !ascii;
            if (this._result) this._result.visible = !ascii && this._state === STATE.GAMEOVER;
            if (ascii) {
                this._powerMeter.visible = false;
                this._englishMeter.visible = false;
                // The HTML type is pinned to sprites that have just been hidden;
                // one sync takes it off the screen with them.
                for (const dom of POOL_DOMS) dom.sync();
            } else {
                this._powerMeter.visible = this._state === STATE.POWER;
                this._englishMeter.visible = this._state === STATE.ENGLISH;
            }
        }

        renderAscii() {
            const ctx = window.AsciiMode && window.AsciiMode.context;
            const canvas = window.AsciiMode && window.AsciiMode.canvas;
            if (!ctx || !canvas) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // The cloth, drawn as large as the canvas allows with the same
            // aspect the real table has.
            const scale = Math.min((canvas.width * 0.82) / TABLE_L, (canvas.height * 0.72) / TABLE_W);
            const w = TABLE_L * scale;
            const h = TABLE_W * scale;
            const x0 = (canvas.width - w) / 2;
            const y0 = (canvas.height - h) / 2 + canvas.height * 0.04;
            const mapX = (x) => x0 + (x + HALF_L) * scale;
            const mapY = (z) => y0 + (z + HALF_W) * scale;

            ctx.fillStyle = '#0a3c0a';
            ctx.fillRect(x0, y0, w, h);
            ctx.strokeStyle = '#8b4513';
            ctx.lineWidth = Math.max(2, scale * 0.05);
            ctx.strokeRect(x0, y0, w, h);

            const fontSize = Math.max(10, Math.floor(scale * BALL_R * 2.6));
            ctx.font = `${fontSize}px ${window.AsciiMode.fontFamily || 'monospace'}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.fillStyle = '#000000';
            for (const p of POCKETS) {
                ctx.beginPath();
                ctx.arc(mapX(p.x), mapY(p.z), POCKET_R * scale, 0, Math.PI * 2);
                ctx.fill();
            }

            for (const b of this._table.balls) {
                if (b.potted) continue;
                if (b.n === 0) ctx.fillStyle = '#FFFFFF';
                else if (b.n === 8) ctx.fillStyle = '#BBBBBB';
                else if (b.n < 8) ctx.fillStyle = '#FFFF00';
                else ctx.fillStyle = '#00FFFF';
                ctx.fillText(b.n === 0 ? '@' : String(b.n), mapX(b.x), mapY(b.z));
            }

            // The cue and its line, while somebody is still aiming.
            const aiming = this._state === STATE.AIM || this._state === STATE.POWER ||
                this._state === STATE.ENGLISH;
            const cue = this._table.cue;
            if (aiming && !cue.potted) {
                const shot = this._table.cast(cue.x, cue.z, this._angle, cue);
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(mapX(cue.x), mapY(cue.z));
                ctx.lineTo(mapX(cue.x + Math.cos(this._angle) * shot.dist),
                    mapY(cue.z + Math.sin(this._angle) * shot.dist));
                ctx.stroke();

                const pull = BALL_R * 2 + (this._power / 100) * 0.22;
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = Math.max(3, scale * 0.02);
                ctx.beginPath();
                ctx.moveTo(mapX(cue.x - Math.cos(this._angle) * pull),
                    mapY(cue.z - Math.sin(this._angle) * pull));
                ctx.lineTo(mapX(cue.x - Math.cos(this._angle) * (pull + 1.2)),
                    mapY(cue.z - Math.sin(this._angle) * (pull + 1.2)));
                ctx.stroke();
            }

            const lh = Math.max(16, Math.floor((window.AsciiMode.fontSize || 24) * 0.8));
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.font = `${lh}px ${window.AsciiMode.fontFamily || 'monospace'}`;
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`${T('PoolGame.player1')} ${this._playerScore}   ` +
                `${this.opponentName()} ${this._opponentScore}`, 20, lh + 4);
            ctx.fillStyle = '#FFFFFF';
            const line = this._status ? this._status.text() : '';
            ctx.fillText(line || T('PoolGame.aimPrompt', { player: this.shooterName() }),
                20, lh * 2 + 8);

            const bar = (v, n) => {
                const filled = Math.max(0, Math.min(n, Math.round(v * n)));
                return '[' + '='.repeat(filled) + ' '.repeat(n - filled) + ']';
            };
            ctx.fillStyle = '#00FFFF';
            ctx.fillText(`${T('PoolGame.hud.power')} ${bar(this._power / 100, 10)}`, 20, lh * 3 + 12);
            ctx.fillText(`${T('PoolGame.hud.english')} ${bar((this._english + 1) / 2, 10)}`, 20, lh * 4 + 16);

            if (this._state === STATE.GAMEOVER) {
                const label = this._winner === 1 ? T('PoolGame.victory') :
                    (this._winner === 2 ? T('PoolGame.defeat') : T('PoolGame.draw'));
                ctx.textAlign = 'center';
                ctx.fillStyle = '#FFD700';
                ctx.fillText(label, canvas.width / 2, canvas.height - lh * 2);
            }
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            // The HTML labels sit outside the scene graph and would otherwise
            // survive the scene that made them.
            for (const dom of POOL_DOMS) dom.destroy();
            POOL_DOMS = [];
            if (window.AsciiMode && window.AsciiMode.canvas) {
                window.AsciiMode.canvas.style.display = 'none';
            }
            if (this._viewSprite) {
                if (this._viewSprite.parent) this._viewSprite.parent.removeChild(this._viewSprite);
                this._viewSprite.destroy();
                this._viewSprite = null;
            }
            if (this._view) {
                this._view.dispose();
                this._view = null;
            }
        }
    };

    // Exposed for the title screen's minigame list and the split-screen
    // hot-seat registry, both of which look the class up by name.
    window.Scene_Pool = Scene_Pool;
})();
