/*:
 * @target MZ
 * @plugindesc Low-poly 3D basketball free-throw minigame v2.0.0
 * @author Omni-Lex
 * @version 2.0.0
 *
 * @help BasketballMinigame.js
 *
 * A 3D free-throw shootout against a CPU opponent, rendered with three.js
 * through the shared PSXShader the same way BowlingMinigame.js draws its alley.
 * The court is a real half court in metres (4.57 m free-throw line, 3.048 m rim,
 * 0.2286 m rim radius, 1.83 x 1.07 m backboard) and the ball is a real
 * projectile: it arcs under gravity, clatters off the rim ring, banks off the
 * backboard and drops through the net.
 *
 * The court itself is drawn over the battleback of wherever the player is
 * standing (the map's <Biome> tag, the procedural biome on map 636, or the
 * map's own battleback1), so the game is played outdoors in the woods, in a
 * cave, or on an alien planet depending on where the cabinet or hoop is.
 *
 * The input flow is the aim/power/spin oscillating-slider one shared with the
 * bowling minigame:
 *   Aim step    Left/Right walks the shot left and right of the rim (hold to
 *               steer, let go and it sweeps on its own). OK to lock.
 *   Power step  OK to stop the power bar. Dead centre is the perfect distance.
 *   Touch step  OK to stop the backspin bar. Backspin softens rim bounces and
 *               gives the shooter's roll; a flat ball rattles straight out.
 *   Cancel      steps back one stage, or quits from the aim step.
 *
 * There is no shooter model, the camera stands where the shooter would.
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
 * @param Gravity
 * @parent ---Physics Settings---
 * @desc Downward acceleration in m/s^2 (real gravity is 9.81).
 * @type number
 * @decimals 2
 * @default 9.81
 *
 * @param Rim Bounce
 * @parent ---Physics Settings---
 * @desc Base rim elasticity (0-1). Backspin softens this further.
 * @type number
 * @decimals 2
 * @default 0.55
 *
 * @param Backboard Bounce
 * @parent ---Physics Settings---
 * @desc Backboard elasticity (0-1).
 * @type number
 * @decimals 2
 * @default 0.55
 *
 * @param ---Sound Effects---
 * @default
 *
 * @param Throw Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when the ball is thrown.
 * @type file
 * @dir audio/se/
 *
 * @param Swish Sound
 * @parent ---Sound Effects---
 * @desc The sound effect played when a shot goes in.
 * @type file
 * @dir audio/se/
 *
 * @param Rim Hit Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for the ball hitting the rim.
 * @type file
 * @dir audio/se/
 *
 * @param Backboard Hit Sound
 * @parent ---Sound Effects---
 * @desc The sound effect for the ball hitting the backboard.
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
 * @param Shots Per Game
 * @parent ---Game Variables---
 * @desc Number of shots each side takes.
 * @type number
 * @min 1
 * @max 10
 * @default 5
 *
 * @param Difficulty Level
 * @parent ---Game Variables---
 * @desc Difficulty level (1=Easy, 2=Normal, 3=Hard)
 * @type number
 * @min 1
 * @max 3
 * @default 2
 *
 * @command startBasketballGame
 * @text Start Basketball Game
 * @desc Opens the 3D basketball minigame.
 */

(() => {
    'use strict';

    const pluginName = "BasketballMinigame";
    const params = PluginManager.parameters(pluginName);

    const num = (key, def) => {
        const v = parseFloat(params[key]);
        return isFinite(v) ? v : def;
    };

    // The old 2D game measured gravity in pixels per frame squared, so a value
    // carried over from that version would be nonsense here.
    const GRAVITY = (() => {
        const g = num('Gravity', 9.81);
        return g < 4 ? 9.81 : g;
    })();
    const RIM_BOUNCE = num('Rim Bounce', 0.55);
    const BACKBOARD_BOUNCE = num('Backboard Bounce', 0.55);
    const DIFFICULTY = Math.max(1, Math.min(3, Math.round(num('Difficulty Level', 2))));
    const SHOTS_PER_GAME = Math.max(1, Math.round(num('Shots Per Game', 5)));
    const gameResultVariable = parseInt(params['Game Result Variable'], 10) || 0;

    const se = (key, def, volume) => ({
        name: params[key] || def, volume: volume || 90, pitch: 100, pan: 0
    });
    const throwSound = se('Throw Sound', '', 90);
    const swishSound = se('Swish Sound', '', 100);
    const rimSound = se('Rim Hit Sound', '', 90);
    const backboardSound = se('Backboard Hit Sound', '', 90);

    // Forward declaration: the scene class is defined near the bottom, the
    // plugin command needs the binding to exist now.
    let Scene_BasketballMinigame;

    PluginManager.registerCommand(pluginName, "startBasketballGame", () => {
        SceneManager.push(Scene_BasketballMinigame);
    });

    //=========================================================================
    // Court dimensions (metres). The backboard face is the z origin and the
    // shooter stands at positive z, so every shot travels toward -z. x is
    // across the court with 0 on the centre line, y is up from the floor.
    //=========================================================================
    const RIM_Y = 3.048;               // 10 feet
    const RIM_R = 0.2286;              // 18 inch hoop
    const RIM_TUBE = 0.018;
    const RIM_Z = 0.375;               // hoop centre, clear of the backboard

    const BOARD_HALF_W = 0.9144;       // 1.83 m wide
    const BOARD_BOTTOM = 2.90;
    const BOARD_TOP = BOARD_BOTTOM + 1.067;
    const BOARD_THICK = 0.04;

    const BALL_R = 0.119;
    const SHOT_Z = 4.57;               // free-throw line, 15 feet out
    const SHOT_Y = 2.05;               // release height
    const BASELINE_Z = -1.22;          // the board overhangs the baseline
    const KEY_HALF_W = 2.44;
    const FLOOR_W = 15.0;
    const FLOOR_Z0 = BASELINE_Z - 0.8;
    const FLOOR_Z1 = 13.0;

    // Launch elevation. Everything about the shot except the lateral aim and
    // the speed is fixed, so power reads as pure distance.
    const ELEVATION = 55 * Math.PI / 180;
    // Full stick is a comfortable miss: about a third of a metre off line.
    const MAX_AIM_ANGLE = 4.5 * Math.PI / 180;

    // Speed that drops the ball onto the rim centre from the release point, so
    // the power meter can be centred on it and the CPU has something to aim at.
    const PERFECT_SPEED = (() => {
        const dz = SHOT_Z - RIM_Z;
        const dy = RIM_Y - SHOT_Y;
        const den = 2 * Math.pow(Math.cos(ELEVATION), 2) * (dz * Math.tan(ELEVATION) - dy);
        return den > 0 ? Math.sqrt(GRAVITY * dz * dz / den) : 7.3;
    })();
    const SPEED_MIN = PERFECT_SPEED * 0.80;
    const SPEED_MAX = PERFECT_SPEED * 1.20;

    const STATE = {
        AIM: 'aim',
        POWER: 'power',
        TOUCH: 'touch',
        CPU: 'cpu',
        FLIGHT: 'flight',
        SCORING: 'scoring',
        GAMEOVER: 'gameover'
    };

    // The court is built and rendered through the player's own retro settings,
    // dialled DOWN from the global default: the court lines and the ball read
    // better clean, and the period flavour is carried by the HUD. The tunables
    // are scaled rather than replaced, so switching the shader off in the
    // options still switches it off here.
    const PSX_SOFTEN = { vertexSnap: 1.5, colorLevels: 1.3, dither: 0.6, downscale: 1 };

    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    //=========================================================================
    // Deterministic RNG so the hardwood grain and the ball look identical for
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
    // Backdrop. The court is dropped into whatever the player is looking at,
    // so the battleback is resolved exactly the way a fight on this spot would
    // resolve it: map <Biome> tag first, then the procedural map's biome, then
    // the interior/exterior default, and finally the map's own battleback1.
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
    // Court3D - the three.js stage. Renders to its own small canvas which the
    // scene composites as a PIXI sprite over the battleback, the same approach
    // the bowling and tournament scenes use.
    //=========================================================================
    const CAM_SHOOT = 'shoot';
    const CAM_FLIGHT = 'flight';
    const CAM_SCORE = 'score';

    class Court3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed());
            this._disposables = [];
            this._camMode = CAM_SHOOT;
            this._camPos = { x: 0, y: 2.55, z: SHOT_Z + 2.6 };
            this._camLook = { x: 0, y: RIM_Y, z: RIM_Z };
            this._shake = 0;

            this._initThree();
            softPSX(() => {
                this._buildFloor();
                this._buildMarkings();
                this._buildHoop();
                this._buildBall();
                this._buildAimGuide();
            });
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            // No background: the canvas stays transparent so the battleback
            // behind it shows through and the court reads as part of the world.
            this.camera = new THREE.PerspectiveCamera(55, this._w / this._h, 0.05, 120);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            this.scene.add(new THREE.AmbientLight(0xc8d4ff, 0.72));

            const sun = new THREE.DirectionalLight(0xfff2d0, 0.85);
            sun.position.set(3.5, 9, 7);
            this.scene.add(sun);

            const hoopLight = new THREE.PointLight(0xffe3b0, 0.9, 9, 2);
            hoopLight.position.set(0, 4.4, RIM_Z + 1.2);
            this.scene.add(hoopLight);
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

        _hardwoodTexture() {
            const rand = this._rand;
            return this._canvasTexture(64, 64, (ctx, w, h) => {
                ctx.fillStyle = '#c08b4e';
                ctx.fillRect(0, 0, w, h);
                for (let y = 0; y < h; y += 8) {
                    ctx.fillStyle = '#966633';
                    ctx.fillRect(0, y, w, 1);
                }
                for (let i = 0; i < 150; i++) {
                    const gx = Math.floor(rand() * w);
                    const gy = Math.floor(rand() * h);
                    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,225,180,0.09)';
                    ctx.fillRect(gx, gy, 1 + Math.floor(rand() * 4), 1);
                }
            }, 8, 10);
        }

        _ballTexture() {
            return this._canvasTexture(64, 32, (ctx, w, h) => {
                ctx.fillStyle = '#e8720f';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255,180,90,0.35)';
                ctx.fillRect(0, 0, w, 6);
                ctx.strokeStyle = '#2b1704';
                ctx.lineWidth = 2;
                // Two seams around the ball and two curving over it, which is
                // as much of a basketball as eight texels per seam can carry.
                ctx.beginPath();
                ctx.moveTo(0, h / 2);
                ctx.lineTo(w, h / 2);
                ctx.moveTo(w * 0.25, 0);
                ctx.lineTo(w * 0.25, h);
                ctx.moveTo(w * 0.75, 0);
                ctx.lineTo(w * 0.75, h);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(w * 0.5, h * 0.5, h * 0.42, 0, Math.PI * 2);
                ctx.stroke();
            });
        }

        //--- geometry -------------------------------------------------------

        _buildFloor() {
            const depth = FLOOR_Z1 - FLOOR_Z0;
            const mat = this._mat({ map: this._hardwoodTexture() });
            this._box(FLOOR_W, 0.12, depth, mat, 0, -0.06, (FLOOR_Z0 + FLOOR_Z1) / 2);
        }

        // Court lines as flat geometry rather than one painted floor texture:
        // every marking then sits at its real world coordinate.
        _buildMarkings() {
            const paint = this._mat({ color: 0xf3ecd8, side: THREE.DoubleSide });
            const y = 0.006;

            // Baseline, key rails and the free-throw line.
            this._box(FLOOR_W, 0.004, 0.06, paint, 0, y, BASELINE_Z);
            const keyDepth = SHOT_Z - BASELINE_Z;
            const keyMidZ = (BASELINE_Z + SHOT_Z) / 2;
            this._box(0.06, 0.004, keyDepth, paint, -KEY_HALF_W, y, keyMidZ);
            this._box(0.06, 0.004, keyDepth, paint, KEY_HALF_W, y, keyMidZ);
            this._box(KEY_HALF_W * 2, 0.004, 0.06, paint, 0, y, SHOT_Z);

            // Free-throw circle, the restricted-area arc and the three point
            // line. RingGeometry lies in XY and is rotated flat so that its
            // local +y becomes world +z, which puts theta 0..PI on the court
            // side of the basket rather than out behind the baseline.
            this._ring(1.75, 1.81, 0, SHOT_Z, paint, 0, Math.PI * 2);
            this._ring(1.20, 1.25, 0, RIM_Z, paint, 0, Math.PI);
            this._ring(6.70, 6.75, 0, RIM_Z, paint, 0, Math.PI);
        }

        _ring(inner, outer, x, z, mat, thetaStart, thetaLength) {
            const geo = this._geo(new THREE.RingGeometry(inner, outer, 40, 1, thetaStart, thetaLength));
            geo.rotateX(Math.PI / 2);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, 0.008, z);
            this.scene.add(mesh);
            return mesh;
        }

        _buildHoop() {
            const boardMat = this._mat({ color: 0xf2f2ee });
            const trimMat = this._mat({ color: 0xcc2222 });
            const steelMat = this._mat({ color: 0x3a3a44 });
            const rimMat = this._mat({ color: 0xff6a10 });

            const boardMidY = (BOARD_BOTTOM + BOARD_TOP) / 2;
            this._box(BOARD_HALF_W * 2, BOARD_TOP - BOARD_BOTTOM, BOARD_THICK,
                boardMat, 0, boardMidY, -BOARD_THICK / 2);

            // Board border.
            const bw = BOARD_HALF_W * 2;
            this._box(bw, 0.05, 0.01, trimMat, 0, BOARD_BOTTOM + 0.025, 0.006);
            this._box(bw, 0.05, 0.01, trimMat, 0, BOARD_TOP - 0.025, 0.006);
            this._box(0.05, BOARD_TOP - BOARD_BOTTOM, 0.01, trimMat, -BOARD_HALF_W + 0.025, boardMidY, 0.006);
            this._box(0.05, BOARD_TOP - BOARD_BOTTOM, 0.01, trimMat, BOARD_HALF_W - 0.025, boardMidY, 0.006);

            // Shooter's square above the rim.
            const sqW = 0.59;
            const sqH = 0.45;
            const sqMidY = RIM_Y + sqH / 2;
            this._box(sqW, 0.04, 0.01, trimMat, 0, RIM_Y, 0.006);
            this._box(sqW, 0.04, 0.01, trimMat, 0, RIM_Y + sqH, 0.006);
            this._box(0.04, sqH, 0.01, trimMat, -sqW / 2, sqMidY, 0.006);
            this._box(0.04, sqH, 0.01, trimMat, sqW / 2, sqMidY, 0.006);

            // Stanchion: a pole behind the board with an arm out to it.
            this._box(0.16, BOARD_TOP - 0.1, 0.16, steelMat, 0, (BOARD_TOP - 0.1) / 2, -1.1);
            this._box(0.12, 0.12, 1.1, steelMat, 0, boardMidY - 0.2, -0.6);
            this._box(0.9, 0.06, 0.9, steelMat, 0, 0.03, -1.1);

            // Rim, and the plate that hangs it off the board.
            const torus = this._geo(new THREE.TorusGeometry(RIM_R, RIM_TUBE, 6, 14));
            torus.rotateX(-Math.PI / 2);
            const rim = new THREE.Mesh(torus, rimMat);
            rim.position.set(0, RIM_Y, RIM_Z);
            this.scene.add(rim);
            this._box(0.24, 0.05, RIM_Z, rimMat, 0, RIM_Y, RIM_Z / 2);

            this._buildNet();
            if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
        }

        // The net is line work, which is both cheap and the only way twelve
        // strands ever looked on hardware this old.
        _buildNet() {
            const strands = 12;
            const rings = [0, 0.16, 0.30, 0.42];
            const radiusAt = (d) => RIM_R * (1 - d * 0.62);
            const pts = [];

            for (let i = 0; i < strands; i++) {
                const a = (i / strands) * Math.PI * 2;
                for (let r = 0; r < rings.length - 1; r++) {
                    const d0 = rings[r];
                    const d1 = rings[r + 1];
                    // Alternate the twist so the strands cross like real mesh.
                    const twist = (r % 2 === 0 ? 1 : -1) * (Math.PI / strands);
                    pts.push(
                        Math.cos(a) * radiusAt(d0), RIM_Y - d0, RIM_Z + Math.sin(a) * radiusAt(d0),
                        Math.cos(a + twist) * radiusAt(d1), RIM_Y - d1, RIM_Z + Math.sin(a + twist) * radiusAt(d1)
                    );
                }
            }
            // Horizontal hoops holding the strands together.
            for (const d of rings.slice(1)) {
                const rr = radiusAt(d);
                for (let i = 0; i < strands; i++) {
                    const a0 = (i / strands) * Math.PI * 2;
                    const a1 = ((i + 1) / strands) * Math.PI * 2;
                    pts.push(
                        Math.cos(a0) * rr, RIM_Y - d, RIM_Z + Math.sin(a0) * rr,
                        Math.cos(a1) * rr, RIM_Y - d, RIM_Z + Math.sin(a1) * rr
                    );
                }
            }

            const geo = this._geo(new THREE.BufferGeometry());
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            const mat = new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.85 });
            this._disposables.push(mat);
            this._net = new THREE.LineSegments(geo, mat);
            this.scene.add(this._net);
        }

        _buildBall() {
            const geo = this._geo(new THREE.SphereGeometry(BALL_R, 12, 10));
            this._ballMesh = new THREE.Mesh(geo, this._mat({ map: this._ballTexture() }));
            this._ballMesh.position.set(0, SHOT_Y, SHOT_Z);
            this.scene.add(this._ballMesh);
            if (window.PSXShader) window.PSXShader.applyToObject(this._ballMesh);
        }

        _buildAimGuide() {
            const g = new THREE.Group();
            const mat = this._mat({ color: 0x59f2ff, emissive: 0x1a6a75 });
            mat.transparent = true;
            mat.opacity = 0.7;
            const reach = SHOT_Z - RIM_Z;
            this._box(0.05, 0.004, reach, mat, 0, 0.012, -reach / 2, g);
            g.position.set(0, 0, SHOT_Z);
            this.scene.add(g);
            this._aimGuide = g;
        }

        //--- per-frame sync --------------------------------------------------

        setBall(p) {
            this._ballMesh.position.set(p.x, p.y, p.z);
        }

        spinBall(axis, angle) {
            this._ballMesh.rotateOnWorldAxis(axis, angle);
        }

        resetBall() {
            this._ballMesh.position.set(0, SHOT_Y, SHOT_Z);
            this._ballMesh.rotation.set(0, 0, 0);
        }

        // Lateral aim angle in radians, positive toward +x.
        setAimGuide(angle, visible) {
            this._aimGuide.visible = visible;
            this._aimGuide.rotation.y = -angle;
        }

        shake(amount) {
            this._shake = Math.min(1.2, this._shake + amount);
        }

        setCameraMode(mode) {
            this._camMode = mode;
        }

        updateCamera(dt, ball) {
            let target = { x: 0, y: 2.55, z: SHOT_Z + 2.6 };
            let look = { x: 0, y: RIM_Y - 0.1, z: RIM_Z };
            let lerp = 0.12;

            if (this._camMode === CAM_FLIGHT && ball) {
                target = { x: ball.x * 0.5, y: 2.75, z: Math.max(RIM_Z + 2.0, ball.z + 2.3) };
                look = { x: ball.x, y: ball.y, z: ball.z };
                lerp = 0.16;
            } else if (this._camMode === CAM_SCORE) {
                target = { x: 1.7, y: 2.5, z: RIM_Z + 2.5 };
                look = { x: 0, y: RIM_Y - 0.35, z: RIM_Z };
                lerp = 0.09;
            }

            const k = 1 - Math.pow(1 - lerp, Math.max(0.2, dt * 60));
            this._camPos.x += (target.x - this._camPos.x) * k;
            this._camPos.y += (target.y - this._camPos.y) * k;
            this._camPos.z += (target.z - this._camPos.z) * k;
            this._camLook.x += (look.x - this._camLook.x) * k;
            this._camLook.y += (look.y - this._camLook.y) * k;
            this._camLook.z += (look.z - this._camLook.z) * k;

            this._shake = Math.max(0, this._shake - dt * 2.2);
            const s = this._shake;
            this.camera.position.set(
                this._camPos.x + (Math.random() - 0.5) * s * 0.06,
                this._camPos.y + (Math.random() - 0.5) * s * 0.06,
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
    // BallFlight - the shot itself. Kept apart from the renderer so the
    // physics can be read (and tuned) without three.js in the way.
    //=========================================================================
    class BallFlight {
        constructor(aimAngle, speed, spin) {
            this.p = { x: 0, y: SHOT_Y, z: SHOT_Z };
            const horiz = speed * Math.cos(ELEVATION);
            this.v = {
                x: horiz * Math.sin(aimAngle),
                y: speed * Math.sin(ELEVATION),
                z: -horiz * Math.cos(aimAngle)
            };
            this.spin = Math.max(-1, Math.min(1, spin));
            this.made = false;
            this.madeAt = -1;
            this.time = 0;
            this.restTime = 0;
            this.floorHits = 0;
            this.hitRim = false;
            this.hitBoard = false;
        }

        speed() {
            return Math.sqrt(this.v.x * this.v.x + this.v.y * this.v.y + this.v.z * this.v.z);
        }

        // One substep. Returns the events this step produced so the scene can
        // play the sounds and shake the camera without re-deriving them.
        step(dt) {
            const events = { rim: false, board: false, scored: false, floor: false };
            const prevY = this.p.y;

            this.v.y -= GRAVITY * dt;
            this.p.x += this.v.x * dt;
            this.p.y += this.v.y * dt;
            this.p.z += this.v.z * dt;
            this.time += dt;

            if (this._board()) { events.board = true; this.hitBoard = true; }
            if (this._rim()) { events.rim = true; this.hitRim = true; }

            // Through the hoop: the centre has to clear the ring by a ball
            // radius, anything wider is a rim hit and was handled above.
            if (!this.made && this.v.y < 0 && prevY > RIM_Y && this.p.y <= RIM_Y) {
                const dx = this.p.x;
                const dz = this.p.z - RIM_Z;
                if (Math.sqrt(dx * dx + dz * dz) < RIM_R - BALL_R) {
                    this.made = true;
                    this.madeAt = this.time;
                    events.scored = true;
                    // The net drags the ball straight down.
                    this.v.x *= 0.25;
                    this.v.z *= 0.25;
                    this.v.y *= 0.55;
                }
            }

            if (this.p.y - BALL_R <= 0) {
                this.p.y = BALL_R;
                if (this.v.y < 0) {
                    if (Math.abs(this.v.y) > 0.6) {
                        events.floor = true;
                        this.floorHits++;
                    }
                    this.v.y = -this.v.y * 0.62;
                }
                this.v.x *= 0.82;
                this.v.z *= 0.82;
            }

            if (this.p.y - BALL_R < 0.02 && this.speed() < 0.9) this.restTime += dt;
            else this.restTime = 0;

            return events;
        }

        // The board face sits at z = 0 and is hit from the +z side.
        _board() {
            if (this.v.z >= 0) return false;
            if (this.p.z - BALL_R > 0) return false;
            if (this.p.z < -BALL_R - BOARD_THICK) return false;
            if (Math.abs(this.p.x) > BOARD_HALF_W + BALL_R * 0.5) return false;
            if (this.p.y < BOARD_BOTTOM - BALL_R || this.p.y > BOARD_TOP + BALL_R) return false;

            this.p.z = BALL_R;
            this.v.z = -this.v.z * BACKBOARD_BOUNCE;
            this.v.x *= 0.85;
            this.v.y *= 0.92;
            return true;
        }

        // Collision against the rim ring, treated as a torus: find the closest
        // point on the ring and bounce off the tube around it.
        _rim() {
            const dx = this.p.x;
            const dz = this.p.z - RIM_Z;
            const radial = Math.sqrt(dx * dx + dz * dz);
            if (radial < 1e-5) return false;

            const ringX = (dx / radial) * RIM_R;
            const ringZ = RIM_Z + (dz / radial) * RIM_R;
            const ox = this.p.x - ringX;
            const oy = this.p.y - RIM_Y;
            const oz = this.p.z - ringZ;
            const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
            const minD = BALL_R + RIM_TUBE;
            if (d >= minD || d < 1e-5) return false;

            const nx = ox / d, ny = oy / d, nz = oz / d;
            const dot = this.v.x * nx + this.v.y * ny + this.v.z * nz;
            const soft = Math.max(0, this.spin) * 0.45;
            const bounce = Math.max(0.12, RIM_BOUNCE * (1 - soft));
            if (dot < 0) {
                this.v.x -= (1 + bounce) * dot * nx;
                this.v.y -= (1 + bounce) * dot * ny;
                this.v.z -= (1 + bounce) * dot * nz;
                // The shooter's roll: backspin drags the ball back over the
                // ring instead of kicking it away.
                const roll = Math.max(0, this.spin) * 0.9;
                this.v.x -= (dx / radial) * roll;
                this.v.z -= (dz / radial) * roll;
            }
            const push = minD - d;
            this.p.x += nx * push;
            this.p.y += ny * push;
            this.p.z += nz * push;
            return true;
        }

        // The result is known well before the ball stops moving, so the shot
        // ends a beat after the swish or after the miss has bounced twice
        // rather than making the player watch the ball roll to a halt.
        isFinished() {
            if (this.madeAt >= 0 && this.time - this.madeAt > 0.8) return true;
            return this.floorHits >= 2 || this.restTime > 0.3 || this.time > 6 ||
                this.p.z > FLOOR_Z1 || this.p.z < FLOOR_Z0 - 3 ||
                Math.abs(this.p.x) > FLOOR_W / 2 + 2;
        }
    }

    //=========================================================================
    // Scene_BasketballMinigame
    //=========================================================================
    Scene_BasketballMinigame = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._flight = null;
            this._shotsPerGame = SHOTS_PER_GAME;
            this._playerShots = [];
            this._cpuShots = [];
            // Who is shooting the other half of the rack: a companion, a local
            // off the map, or the player's own head. Read once, so the same
            // person stays on the line for the whole game.
            this._standIn = window.MinigameOpponent?.pick() ?? null;
            this._currentShotIndex = 0;
            this._isPlayerTurn = true;
            this._state = STATE.AIM;
            this._threeReady = typeof THREE !== 'undefined';

            this._meterSpeed = DIFFICULTY === 1 ? 0.75 : DIFFICULTY === 3 ? 1.3 : 1.0;
            this._cpuAccuracy = DIFFICULTY === 1 ? 0.65 : DIFFICULTY === 3 ? 0.92 : 0.8;

            this._aimValue = 0;
            this._aimDirection = 1;
            this._powerValue = 0;
            this._powerDirection = 1;
            this._spinValue = 0;
            this._spinDirection = 1;
        }

        //--- construction ----------------------------------------------------

        create() {
            super.create();
            if (!this._threeReady) {
                this.createUI();
                this._statusWindow.setText(T('Basketball.noThree'));
                this._state = STATE.GAMEOVER;
                return;
            }
            this.createCourt();
            this.createUI();
            this.startTurn();
        }

        // The blurred map snapshot is replaced by the battleback of wherever
        // the player is standing, which the transparent 3D court sits on.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#101a2c', '#060811', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);

            const bitmap = backdropBitmap();
            if (!bitmap) return;
            this._backdropSprite = new Sprite(bitmap);
            this.addChild(this._backdropSprite);
            bitmap.addLoadListener(() => this.fitBackdrop());
            this.fitBackdrop();

            // Knocked back a little so the court and the meters stay readable
            // over a bright outdoor photo.
            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll('rgba(4, 6, 14, 0.35)');
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

        createCourt() {
            // Rendering a little below native and scaling up with nearest
            // filtering keeps a period edge without smearing the court lines.
            const scale = 0.88;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._court = new Court3D(w, h);

            const texture = PIXI.Texture.from(this._court.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._courtSprite = new PIXI.Sprite(texture);
            this._courtSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._courtSprite, idx);
        }

        createUI() {
            this._scoreboard = new Sprite_BasketballScoreboard(this._shotsPerGame, this.opponentName());
            this.addChild(this._scoreboard);

            this._powerMeter = new Sprite_PowerMeter(6, 60, "POWER");
            this.addChild(this._powerMeter);

            this._spinMeter = new Sprite_SpinMeter(hudW() - 40, 60, "TOUCH");
            this.addChild(this._spinMeter);

            this._statusWindow = new Sprite_BasketballStatus();
            this.addChild(this._statusWindow);

            this._resultWindow = new Sprite_BasketballResult();
            this.addChild(this._resultWindow);

            // The pixel font arrives asynchronously; repaint what was drawn once.
            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._scoreboard) return;
                    const last = this._scoreboard._last || [[], []];
                    this._scoreboard.refresh(last[0], last[1]);
                    this._statusWindow.refresh();
                    this._powerMeter.refresh();
                    this._spinMeter.refresh();
                });
            }
        }

        //--- helpers ---------------------------------------------------------

        aimAngle() {
            return (this._aimValue / 60) * MAX_AIM_ANGLE;
        }

        shooterLabel() {
            return this._isPlayerTurn ? T('Basketball.player') : this.opponentName();
        }

        opponentName() {
            return window.MinigameOpponent
                ? window.MinigameOpponent.nameOf(this._standIn, T('Basketball.cpu'))
                : T('Basketball.cpu');
        }

        refreshAimGuide() {
            if (!this._court) return;
            const aiming = this._state === STATE.AIM || this._state === STATE.POWER ||
                this._state === STATE.TOUCH;
            this._court.setAimGuide(this.aimAngle(), aiming && this._isPlayerTurn);
        }

        //--- game flow -------------------------------------------------------

        startTurn() {
            this._flight = null;
            this._aimValue = 0;
            this._aimDirection = 1;
            this._powerValue = 0;
            this._powerDirection = 1;
            this._spinValue = 0;
            this._spinDirection = 1;

            if (this._court) {
                this._court.resetBall();
                this._court.setCameraMode(CAM_SHOOT);
            }

            if (this._isPlayerTurn) {
                this._state = STATE.AIM;
                this._statusWindow.setText(T('Basketball.aimPrompt'));
            } else {
                this._state = STATE.CPU;
                this._cpuWait = 50;
                this._statusWindow.setText(T('Basketball.cpuLiningUp', { opponent: this.opponentName() }));
            }
            this.refreshAimGuide();
        }

        update() {
            super.update();

            switch (this._state) {
                case STATE.AIM: this.updateAiming(); break;
                case STATE.POWER: this.updatePower(); break;
                case STATE.TOUCH: this.updateTouch(); break;
                case STATE.CPU: this.updateCpuThinking(); break;
                case STATE.FLIGHT: this.updateFlight(); break;
                case STATE.SCORING: this.updateScoring(); break;
                case STATE.GAMEOVER: this.updateGameOver(); break;
            }

            // The HTML labels are painted when a widget repaints, which is not
            // every frame: this keeps them on their sprite when one is shown,
            // hidden or moved in between.
            for (const dom of BALL_DOMS) dom.sync();

            // Redraw last, so the composited texture always shows the state the
            // logic above just produced rather than the previous frame's.
            if (this._court) {
                this._court.updateCamera(1 / 60, this._flight ? this._flight.p : null);
                this._court.render();
                if (this._courtSprite && this._courtSprite.texture) {
                    this._courtSprite.texture.update();
                }
            }
        }

        updateAiming() {
            let steered = false;
            if (Input.isPressed('left')) {
                this._aimValue -= 2 * this._meterSpeed;
                steered = true;
            }
            if (Input.isPressed('right')) {
                this._aimValue += 2 * this._meterSpeed;
                steered = true;
            }
            if (!steered) {
                this._aimValue += this._aimDirection * 2 * this._meterSpeed;
                if (this._aimValue > 60 || this._aimValue < -60) this._aimDirection *= -1;
            }
            this._aimValue = Math.max(-60, Math.min(60, this._aimValue));
            this.refreshAimGuide();

            if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._state = STATE.POWER;
                this._statusWindow.setText(T('Basketball.powerPrompt'));
                this._powerMeter.show();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        updatePower() {
            this._powerValue += this._powerDirection * 3 * this._meterSpeed;
            if (this._powerValue > 100 || this._powerValue < 0) {
                this._powerDirection *= -1;
                this._powerValue = Math.max(0, Math.min(100, this._powerValue));
            }
            this._powerMeter.setValue(this._powerValue);

            if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._powerMeter.hide();
                this._state = STATE.TOUCH;
                this._statusWindow.setText(T('Basketball.setTouch'));
                this._spinMeter.show();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this._powerMeter.hide();
                this._state = STATE.AIM;
                this._statusWindow.setText(T('Basketball.aimPrompt'));
            }
        }

        updateTouch() {
            this._spinValue += this._spinDirection * 0.04 * this._meterSpeed;
            if (this._spinValue > 1 || this._spinValue < -1) {
                this._spinDirection *= -1;
                this._spinValue = Math.max(-1, Math.min(1, this._spinValue));
            }
            this._spinMeter.setValue(this._spinValue);

            if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._spinMeter.hide();
                this.shoot(this.aimAngle(), this._powerValue, this._spinValue);
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this._spinMeter.hide();
                this._state = STATE.POWER;
                this._statusWindow.setText(T('Basketball.powerPrompt'));
                this._powerMeter.show();
            }
        }

        updateCpuThinking() {
            this._cpuWait--;
            if (this._cpuWait > 0) return;

            // The power meter is centred on the perfect shot, so the CPU aims
            // for the middle of it and misses by however much its skill allows.
            const variance = 1 - this._cpuAccuracy;
            const aim = (Math.random() - 0.5) * 2 * variance * MAX_AIM_ANGLE * 1.6;
            const power = Math.max(0, Math.min(100, 50 + (Math.random() - 0.5) * 2 * variance * 60));
            const spin = Math.max(-1, Math.min(1, 0.4 + (Math.random() - 0.5) * variance * 2));
            this.shoot(aim, power, spin);
        }

        //--- the shot --------------------------------------------------------

        shoot(aimAngle, power, spin) {
            const speed = SPEED_MIN + (Math.max(0, Math.min(100, power)) / 100) * (SPEED_MAX - SPEED_MIN);
            this._flight = new BallFlight(aimAngle, speed, spin);
            this._state = STATE.FLIGHT;
            this._statusWindow.setText("");
            this._rimPlayed = false;
            this._boardPlayed = false;

            if (this._court) {
                this._court.setAimGuide(0, false);
                this._court.setCameraMode(CAM_FLIGHT);
                this._court.setBall(this._flight.p);
            }
            if (throwSound.name) AudioManager.playSe(throwSound);
        }

        updateFlight() {
            const flight = this._flight;
            if (!flight) return;

            // Substepped so a fast ball cannot tunnel through the rim tube.
            const dt = 1 / 240;
            for (let i = 0; i < 4; i++) {
                const events = flight.step(dt);
                if (events.board && !this._boardPlayed) {
                    this._boardPlayed = true;
                    if (backboardSound.name) AudioManager.playSe(backboardSound);
                    this._court.shake(0.35);
                }
                if (events.rim && !this._rimPlayed) {
                    this._rimPlayed = true;
                    if (rimSound.name) AudioManager.playSe(rimSound);
                    this._court.shake(0.5);
                }
                if (events.scored) {
                    if (swishSound.name) AudioManager.playSe(swishSound);
                    this._court.setCameraMode(CAM_SCORE);
                    this._statusWindow.setText(flight.hitRim || flight.hitBoard ? T('Basketball.itsGood') : T('Basketball.swish'));
                }
            }

            this._court.setBall(flight.p);
            this.spinBallMesh(flight, dt * 4);

            if (flight.isFinished()) this.endShot(flight.made);
        }

        // Roll the ball around the axis across its flight path, so it tumbles
        // forward through the air and keeps rolling once it lands.
        spinBallMesh(flight, dt) {
            const v = flight.v;
            const horiz = Math.sqrt(v.x * v.x + v.z * v.z);
            if (horiz < 0.01) return;
            const axis = new THREE.Vector3(-v.z / horiz, 0, v.x / horiz);
            const rate = horiz / BALL_R + flight.spin * 6;
            this._court.spinBall(axis, -rate * dt);
        }

        endShot(made) {
            this._flight = null;
            this._lastMade = made;
            this._state = STATE.SCORING;
            this._wait = 45;
            this._statusWindow.setText(made ? T('Basketball.score') : T('Basketball.miss'));
        }

        updateScoring() {
            if (this._wait > 0) {
                this._wait--;
                return;
            }
            this.recordShot(this._lastMade);
            this.nextTurn();
        }

        recordShot(made) {
            const arr = this._isPlayerTurn ? this._playerShots : this._cpuShots;
            arr.push(!!made);
            this._scoreboard.refresh(this._playerShots, this._cpuShots, this.opponentName());
        }

        nextTurn() {
            if (this._isPlayerTurn) {
                this._isPlayerTurn = false;
                this.startTurn();
            } else {
                this._isPlayerTurn = true;
                this._currentShotIndex++;
                if (this._currentShotIndex >= this._shotsPerGame) {
                    this._state = STATE.GAMEOVER;
                    this.showResult();
                } else {
                    this.startTurn();
                }
            }
        }

        updateGameOver() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel')) {
                SoundManager.playOk();
                this.popScene();
            }
        }

        showResult() {
            const playerTotal = this._playerShots.filter(Boolean).length;
            const cpuTotal = this._cpuShots.filter(Boolean).length;

            let result = "";
            let resultValue = 0;

            if (playerTotal > cpuTotal) {
                result = "VICTORY!";
                resultValue = 1;
            } else if (cpuTotal > playerTotal) {
                result = "DEFEAT";
                resultValue = 2;
            } else {
                result = "DRAW";
                resultValue = 3;
            }

            if (gameResultVariable > 0) {
                $gameVariables.setValue(gameResultVariable, resultValue);
            }

            if (window.MinigameFun) {
                if (resultValue === 1) window.MinigameFun.won('Basketball');
                else if (resultValue === 2) window.MinigameFun.lost('Basketball');
                else window.MinigameFun.draw('Basketball');
            }

            // MinigameFun pays the party; a local who was talked into a
            // shootout is paid their own leisure here.
            window.MinigameOpponent?.payFun(this._standIn);

            this._resultWindow.show();
            this._resultWindow.setText(result, T('Basketball.finalScore', { player: playerTotal, opponent: this.opponentName(), opponentScore: cpuTotal }));
            this._statusWindow.setText('');
        }

        //--- teardown --------------------------------------------------------

        terminate() {
            super.terminate();
            // The HTML labels sit outside the scene graph and would otherwise
            // survive the scene that made them.
            for (const dom of BALL_DOMS) dom.destroy();
            BALL_DOMS = [];
            if (this._courtSprite) {
                if (this._courtSprite.parent) this._courtSprite.parent.removeChild(this._courtSprite);
                this._courtSprite.destroy();
                this._courtSprite = null;
            }
            if (this._court) {
                this._court.dispose();
                this._court = null;
            }
        }
    }

    //=============================================================================
    // HUD. Drawn in a 320-wide virtual framebuffer and upscaled with nearest
    // filtering, the way a PlayStation drew its overlays: an 8px bitmap face,
    // hard one-pixel shadows, block gauges. Dressed art deco, gold on black
    // lacquer, matching the alley and the tarot parlour: see PSXHud.DECO and
    // the deco* primitives in PSXShader.js.
    //=============================================================================
    const HUD = () => window.PSXHud;
    // 240 virtual scanlines, width derived from the aspect: see PSXHud.BASE_H.
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    // Every DOM handle the widgets have taken, so they can be re-laid out when
    // one moves and torn down when the scene ends.
    let BALL_DOMS = [];

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
                BALL_DOMS.push(this._dom);
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

    //=============================================================================
    // Sprite_PowerMeter (same layout/behavior as BowlingMinigame.js)
    //=============================================================================
    class Sprite_PowerMeter extends Sprite_PSXWidget {
        constructor(vx, vy, label) {
            super(34, 118, vx, vy);
            this._label = label;
            this.visible = false;
            this._value = 0;
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
            H.decoVBar(bmp, 10, 15, 14, 96, Math.max(0, Math.min(1, this._value / 100)), {
                colorAt: t => (t < 0.4 ? D.red : (t < 0.75 ? D.gold : D.green)),
                mark: 0.5,              // the perfect shot is dead centre
                markColor: D.goldHi
            });
            this.endText();
        }
    }

    //=============================================================================
    // Sprite_SpinMeter (same layout/behavior as BowlingMinigame.js)
    //=============================================================================
    class Sprite_SpinMeter extends Sprite_PSXWidget {
        constructor(vx, vy, label) {
            super(34, 118, vx, vy);
            this._label = label;
            this.visible = false;
            this._value = 0;
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
            H.decoVBar(bmp, 10, 15, 14, 96, Math.max(-1, Math.min(1, this._value)), {
                center: true,
                colorAt: t => (t > 0.5 ? D.gold : D.jade)
            });
            this.hudText('+', 0, 14, this._vw, 'center', D.dim, 8);
            this.hudText('-', 0, 104, this._vw, 'center', D.dim, 8);
            this.endText();
        }
    }

    //=============================================================================
    // Sprite_BasketballScoreboard
    //=============================================================================
    class Sprite_BasketballScoreboard extends Sprite_PSXWidget {
        constructor(shotsPerGame, opponentName) {
            super(hudW(), 34, 0, 0);
            this._shotsPerGame = shotsPerGame;
            this.refresh([], [], opponentName);
        }

        refresh(playerShots, cpuShots, opponentName) {
            const H = HUD();
            if (!H) return;
            if (opponentName) this._opponentName = opponentName;
            this._last = [playerShots, cpuShots];
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { hairline: false, step: 1 });
            this.drawRow(T('Basketball.player'), playerShots, 4);
            this.drawRow(this._opponentName || T('Basketball.cpu'), cpuShots, 19);
            this.endText();
        }

        // Shots are square pips, filled for a make and hollow for a miss: a
        // circle drawn with an arc would be the one anti-aliased thing here.
        drawRow(name, shots, y) {
            const H = HUD();
            const bmp = this.bitmap;
            const D = H.DECO;
            this.hudText(name, 7, y + 1, 46, 'left', D.gold, 8);

            const pip = 9, gap = 4, startX = 56;
            for (let i = 0; i < this._shotsPerGame; i++) {
                const x = startX + i * (pip + gap);
                // An empty slot is a hollow square, a make fills it with gold,
                // a miss leaves the hollow and crosses it through.
                bmp.fillRect(x, y, pip, pip, '#12100a');
                bmp.fillRect(x, y, pip, 1, D.goldLo);
                bmp.fillRect(x, y + pip - 1, pip, 1, D.goldLo);
                bmp.fillRect(x, y, 1, pip, D.goldLo);
                bmp.fillRect(x + pip - 1, y, 1, pip, D.goldLo);
                if (i < shots.length) {
                    if (shots[i]) bmp.fillRect(x + 2, y + 2, pip - 4, pip - 4, D.gold);
                    else {
                        for (let d = 2; d < pip - 2; d++) {
                            bmp.fillRect(x + d, y + d, 1, 1, D.faint);
                            bmp.fillRect(x + pip - 1 - d, y + d, 1, 1, D.faint);
                        }
                    }
                }
            }

            const made = shots.filter(Boolean).length;
            this.hudText(`${made}/${this._shotsPerGame}`, this._vw - 35, y + 1, 30, 'right', D.ink, 8);
        }
    }

    //=============================================================================
    // Status strip and result card, as sprites: an RMMZ windowskin frame is the
    // one thing on screen that could never have come off a PlayStation.
    //=============================================================================
    class Sprite_BasketballStatus extends Sprite_PSXWidget {
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

    class Sprite_BasketballResult extends Sprite_PSXWidget {
        constructor() {
            super(172, 56);
            this.x = Math.round((Graphics.width - this._vw * hudScale()) / 2);
            this.y = Math.round((Graphics.height - this._vh * hudScale()) / 2);
            this.visible = false;
        }

        show() { this.visible = true; }
        hide() { this.visible = false; }

        setText(result, score) {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { step: 3 });
            H.decoSunburst(bmp, 1, 11, 12, D.goldLo, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
            H.decoSunburst(bmp, this._vw - 2, 11, 12, D.goldLo, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            const col = result === "VICTORY!" ? D.green : (result === "DEFEAT" ? D.red : D.goldHi);
            this.hudText(result, 0, 7, this._vw, 'center', col, 16);
            H.decoRule(bmp, 10, 28, this._vw - 20, D.goldLo);
            this.hudText(score, 0, 31, this._vw, 'center', D.ink, 8);
            this.endText();
        }
    }

    window.Scene_BasketballMinigame = Scene_BasketballMinigame;

})();
