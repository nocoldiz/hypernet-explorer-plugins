//=============================================================================
// AnimatedSlotMachine.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Low-poly 3D art deco slot machine v3.0.0 (three.js / PSXShader)
 * @author Omni-Lex
 * @version 3.0.0
 * @url
 * @help AnimatedSlotMachine.js
 *
 * A real cabinet standing on the floor, rendered with three.js through the
 * shared PSXShader the same way BowlingMinigame.js draws its alley and
 * BasketballMinigame.js its court. The reels are drums: each symbol is a plate
 * on one facet of a low-poly cylinder, so a spin is the drum turning, the
 * frame of the machine crops it to three rows, and a landing overruns its stop
 * and springs back the way a mechanical reel does.
 *
 * Symbols are drawn from the game's IconSet (img/system/IconSet.png), so they
 * always match the project's art style, and each one's average colour becomes
 * its pip in the payout table.
 *
 * The cabinet is dropped into whatever the party is looking at: the battleback
 * of the map's <Biome> tag, the procedural biome on map 636, or the map's own
 * battleback1, so the machine stands in a bar, in a cave or on an alien planet
 * depending on where it was found.
 *
 * It is heard as a mechanism as well as seen as one: the arm clunks, the motor
 * runs for exactly as long as the drums do, each strip ticks past its detents
 * as it slows, each drum falls into place a note lower than the one before it,
 * and a payout is coins clattering into the tray. Every sound is a file in
 * audio/se named by a parameter, so the whole set can be swapped.
 *
 * The HUD is built the way a 32-bit console built one, minus the television: a
 * 240-line virtual framebuffer upscaled with nearest filtering for the boxes,
 * keylines and block gauges, with every label on top of them as crisp HTML type
 * (window.PSXHud / PSXHud.domPanel). No scanlines, no vignette.
 *
 * Open with Plugin Command: "Open Slot Machine"
 * or Script Call: SceneManager.push(Scene_SlotMachine);
 *
 * Controls:
 *   Enter / Z / click .......... Pull the lever
 *   Up / Down .................. Change bet by 10
 *   Left / Right ............... Change bet by 1
 *   Esc / X .................... Exit
 *
 * Requires js/libs/three.min.js and Battler3D/PSXShader.js.
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
 * @param slotIcons
 * @text Slot Icon Indices
 * @desc Comma-separated IconSet indices used as reel symbols
 *       (rarest/highest payout LAST). 5-10 recommended.
 * @type string
 * @default 73,76,77,64,84,87,160,162
 *
 * @param ---Sound Effects---
 * @default
 *
 * @param leverSe
 * @parent ---Sound Effects---
 * @text Lever Sound
 * @desc The clunk of the arm being pulled down.
 * @type file
 * @dir audio/se/
 * @default Switch2
 *
 * @param insertSe
 * @parent ---Sound Effects---
 * @text Coin In Sound
 * @desc The bet dropping into the slot.
 * @type file
 * @dir audio/se/
 * @default Coin
 *
 * @param motorSe
 * @parent ---Sound Effects---
 * @text Reel Motor Sound
 * @desc The drums running, played once as a spin starts.
 * @type file
 * @dir audio/se/
 * @default Machine
 *
 * @param tickSe
 * @parent ---Sound Effects---
 * @text Reel Tick Sound
 * @desc One stop passing the payline, heard as a drum slows down.
 * @type file
 * @dir audio/se/
 * @default Items/metal_small1
 *
 * @param stopSe
 * @parent ---Sound Effects---
 * @text Reel Stop Sound
 * @desc A drum coming to rest against its detent.
 * @type file
 * @dir audio/se/
 * @default Switch1
 *
 * @param betSe
 * @parent ---Sound Effects---
 * @text Bet Change Sound
 * @desc The chip click as the stake goes up or down.
 * @type file
 * @dir audio/se/
 * @default Casino/chip_lay_1
 *
 * @param coinSe
 * @parent ---Sound Effects---
 * @text Payout Coin Sound
 * @desc A coin landing in the tray.
 * @type file
 * @dir audio/se/
 * @default Coin
 *
 * @param winSe
 * @parent ---Sound Effects---
 * @text Win Sound
 * @desc The bell for an ordinary win.
 * @type file
 * @dir audio/se/
 * @default Bell2
 *
 * @param jackpotSe
 * @parent ---Sound Effects---
 * @text Jackpot Sound
 * @desc The house coming down on a top combination.
 * @type file
 * @dir audio/se/
 * @default Applause1
 *
 * @param loseSe
 * @parent ---Sound Effects---
 * @text No Match Sound
 * @desc The quiet note a losing spin ends on.
 * @type file
 * @dir audio/se/
 * @default Down1
 *
 * @param denySe
 * @parent ---Sound Effects---
 * @text Refusal Sound
 * @desc Played when the wallet cannot cover the stake.
 * @type file
 * @dir audio/se/
 * @default Buzzer1
 *
 * @command openSlotMachine
 * @text Open Slot Machine
 * @desc Opens the slot machine minigame
 */

(() => {
    'use strict';

    const pluginName = "AnimatedSlotMachine";
    const parameters = PluginManager.parameters(pluginName);
    const MIN_BET = parseInt(parameters['minBet']) || 1;
    const MAX_BET = parseInt(parameters['maxBet']) || 100;
    const TOKEN_ITEM_ID = parseInt(parameters['tokenItemId']) || 124;

    // Payout multiplier for three-of-a-kind, by symbol rarity index.
    const MULT_TABLE = [3, 4, 5, 8, 12, 18, 30, 50, 75, 120];
    function multForIndex(i) {
        return MULT_TABLE[i] != null ? MULT_TABLE[i] : Math.round(3 * Math.pow(1.7, i));
    }

    // Build the symbol set from the parameter list of IconSet indices.
    const SYMBOLS = (() => {
        const raw = String(parameters['slotIcons'] || '73,76,77,64,84,87,160,162');
        const icons = raw.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => Number.isFinite(n) && n >= 0);
        if (icons.length < 3) icons.push(73, 76, 77);
        return icons.map((icon, i) => ({ icon, mult: multForIndex(i) }));
    })();
    const SYMBOL_COUNT = SYMBOLS.length;

    // Weighted target pool, higher payouts appear less often for balance.
    const WEIGHTED_POOL = (() => {
        const pool = [];
        SYMBOLS.forEach((s, i) => {
            const weight = Math.max(1, Math.round(60 / s.mult));
            for (let w = 0; w < weight; w++) pool.push(i);
        });
        return pool;
    })();
    // `rng` is optional: a function answering [0, 1), Math.random when absent.
    function pickTarget(rng) {
        const r = typeof rng === 'function' ? rng() : Math.random();
        return WEIGHTED_POOL[Math.floor(r * WEIGHTED_POOL.length)];
    }

    // What three drums pay on a stake of `bet`: three of a kind pays the
    // symbol's multiple, any pair pays 1.5x (see checkWin for why), anything
    // else nothing. The one answer for the cabinet and for simulateSpin.
    function payoutFor(targets, bet) {
        const [a, b, c] = targets;
        if (a === b && b === c) {
            const mult = SYMBOLS[a].mult;
            return { win: bet * mult, mult, level: mult >= 25 ? 2 : 1, kind: 'jackpot' };
        }
        if (a === b || b === c || a === c) {
            const win = Math.floor(bet * 1.5);
            return { win, mult: 1.5, level: win > 0 ? 1 : 0, kind: 'pair' };
        }
        return { win: 0, mult: 0, level: 0, kind: 'none' };
    }

    // A spin with nobody at the cabinet: an NPC pulling the lever
    // (NPCSimulationCore MINIGAME PLAY). Same weighted drums and the same pay
    // table as the scene, so the house keeps the same edge. `rng` is a
    // function answering [0, 1). Returns { targets, win, mult, kind }.
    function simulateSpin(bet, rng) {
        const stake = Math.max(0, Math.floor(Number(bet) || 0));
        const targets = [pickTarget(rng), pickTarget(rng), pickTarget(rng)];
        const pay = payoutFor(targets, stake);
        return { targets, win: pay.win, mult: pay.mult, kind: pay.kind };
    }

    window.AnimatedSlotMachine = { simulateSpin, payoutFor, MULT_TABLE: MULT_TABLE.slice(), SYMBOL_COUNT };

    //=========================================================================
    // Sound. A slot machine is a mechanical instrument and most of what it says
    // it says with its own metal: the arm, the motor, a stop passing under the
    // payline, a drum falling into its detent, coins in the tray. Every one of
    // them is a file in audio/se named by a parameter, so a project that wants
    // a different cabinet only has to change the names.
    //=========================================================================
    const se = (key, def, volume) => ({
        name: parameters[key] || def, volume: volume, pitch: 100
    });

    const SE = {
        lever: se('leverSe', 'Switch2', 80),
        insert: se('insertSe', 'Coin', 55),
        motor: se('motorSe', 'Machine', 38),
        tick: se('tickSe', 'Items/metal_small1', 30),
        stop: se('stopSe', 'Switch1', 70),
        bet: se('betSe', 'Casino/chip_lay_1', 55),
        coin: se('coinSe', 'Coin', 42),
        win: se('winSe', 'Bell2', 90),
        jackpot: se('jackpotSe', 'Applause1', 95),
        lose: se('loseSe', 'Down1', 45),
        deny: se('denySe', 'Buzzer1', 70)
    };

    function playSe(sound, pitch, volume) {
        if (!sound || !sound.name) return;
        AudioManager.playSe({
            name: sound.name,
            volume: Math.round(volume != null ? volume : sound.volume),
            pitch: Math.round(pitch != null ? pitch : sound.pitch),
            pan: 0
        });
    }

    // Opened from the title screen's free-play arcade the machine runs on a
    // throwaway game context, so every visit starts from the same fixed
    // bankroll instead of carrying over whatever the last visit left behind.
    const FREE_PLAY_TOKENS = 50;

    function isFreePlay() {
        const arcade = window.MinigameArcade;
        return !!(arcade && arcade.isFreePlay && arcade.isFreePlay());
    }

    // Forward declaration: the scene class is defined near the bottom, the
    // plugin command needs the binding to exist now.
    let Scene_SlotMachine;

    PluginManager.registerCommand(pluginName, "openSlotMachine", () => {
        SceneManager.push(Scene_SlotMachine);
    });

    //=========================================================================
    // Cabinet dimensions (metres), all derived from the one figure that
    // matters: how tall a symbol is printed on the reel strip. A drum carrying
    // more stops is a bigger drum rather than a drum with smaller symbols,
    // which is how a real machine is built and what keeps the geometry honest
    // when the icon list in the parameters changes length.
    //=========================================================================
    const SYM_PITCH = 0.09;                  // arc height of one symbol
    const REEL_LEN = 0.115;                  // drum width
    const REEL_GAP = 0.014;

    // A three-symbol window over an eight-stop drum would be 135 degrees of it,
    // so the top and bottom rows would be edge-on. The strip is repeated until
    // the drum carries at least fourteen stops and the window is a gentle arc.
    const STRIP_COPIES = Math.max(1, Math.ceil(14 / SYMBOL_COUNT));
    const STOPS = SYMBOL_COUNT * STRIP_COPIES;
    const STEP = (Math.PI * 2) / STOPS;
    const DRUM_R = (SYM_PITCH * STOPS) / (Math.PI * 2);

    // A drum at speed passes hundreds of stops a second and a click for each of
    // them is a buzz rather than a machine. The strip is only heard once it has
    // slowed to where the ear can count it: at a quintic ease-out that is the
    // last four or five detents, spacing out as the drum settles, which is what
    // makes the end of a spin the part worth listening to.
    const TICK_SPEED = STEP * 26;

    // Roughly how long the default motor sample runs, which is all the pitch
    // it is played at needs to know. A replacement of another length is only
    // ever a little fast or a little slow, never silent.
    const MOTOR_LEN = 2.8;

    const WIN_W = REEL_LEN * 3 + REEL_GAP * 2;
    const WIN_H = SYM_PITCH * 2.9;           // three rows, cropped a little
    const CAB_W = WIN_W + 0.17;
    const CAB_D = DRUM_R * 2 + 0.12;
    const FRAME_T = 0.04;                    // front panel thickness
    const BODY_TOP = WIN_H / 2 + 0.31;
    const BODY_BOT = -WIN_H / 2 - 0.40;
    const DRUM_Z = -(DRUM_R + 0.015);        // front of the drum just inside
    const FLOOR_Y = BODY_BOT - 0.78;

    const STATE = {
        IDLE: 'idle',
        SPINNING: 'spinning',
        SETTLING: 'settling',
        PAYOUT: 'payout'
    };

    // The cabinet is built and rendered through the player's own retro
    // settings, dialled DOWN from the global default: the reel symbols and the
    // gold keylines read better clean, and the period flavour is carried by the
    // HUD. The tunables are scaled rather than replaced, so switching the
    // shader off in the options still switches it off here.
    const PSX_SOFTEN = { vertexSnap: 1.5, colorLevels: 1.3, dither: 0.6, downscale: 1 };

    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn)
        : fn();

    //=========================================================================
    // Deterministic RNG so the cabinet's lacquer and carpet look identical for
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
    // IconArt - the IconSet, cut into cells a canvas can draw. The sheet is
    // almost always cached by the time a cabinet is opened, but it is still an
    // async load, so everything drawn from it can be redrawn once it lands.
    //=========================================================================
    const IconArt = {
        _tint: {},

        bitmap() {
            if (!this._bitmap) this._bitmap = ImageManager.loadSystem('IconSet');
            return this._bitmap;
        },

        ready() {
            const bmp = this.bitmap();
            return !!(bmp && bmp.isReady && bmp.isReady() && bmp.width);
        },

        onReady(cb) {
            const bmp = this.bitmap();
            if (!bmp) return;
            if (this.ready()) cb();
            else bmp.addLoadListener(() => cb());
        },

        // Source rectangle of one icon on the sheet.
        rect(index) {
            const w = ImageManager.iconWidth || 32;
            const h = ImageManager.iconHeight || 32;
            return { x: (index % 16) * w, y: Math.floor(index / 16) * h, w, h };
        },

        source() {
            const bmp = this.bitmap();
            if (!bmp) return null;
            return bmp.image || bmp.canvas || null;
        },

        draw(ctx, index, dx, dy, size) {
            const src = this.source();
            if (!src || !this.ready()) return false;
            const r = this.rect(index);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(src, r.x, r.y, r.w, r.h, dx, dy, size, size);
            return true;
        },

        // The average of an icon's opaque pixels, which is what a symbol is
        // reduced to in the payout table: a nine pixel pip cannot carry the
        // drawing, but it can carry the colour it is drawn in.
        tint(index) {
            if (this._tint[index]) return this._tint[index];
            let hex = '#e6c273';
            try {
                const r = this.rect(index);
                const cv = document.createElement('canvas');
                cv.width = r.w;
                cv.height = r.h;
                const ctx = cv.getContext('2d');
                if (this.draw(ctx, index, 0, 0, r.w)) {
                    const px = ctx.getImageData(0, 0, r.w, r.h).data;
                    let sr = 0, sg = 0, sb = 0, n = 0;
                    for (let i = 0; i < px.length; i += 4) {
                        if (px[i + 3] < 64) continue;
                        sr += px[i]; sg += px[i + 1]; sb += px[i + 2]; n++;
                    }
                    if (n > 0) {
                        const to = v => Math.min(255, Math.round(v / n * 1.15))
                            .toString(16).padStart(2, '0');
                        hex = '#' + to(sr) + to(sg) + to(sb);
                        this._tint[index] = hex;
                    }
                }
            } catch (e) { /* a tainted or unloaded sheet keeps the gold default */ }
            return hex;
        }
    };

    //=========================================================================
    // Backdrop. The cabinet is dropped into whatever the player is looking at,
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
    // Cabinet3D - the three.js stage. Renders to its own small canvas which the
    // scene composites as a PIXI sprite over the battleback, the same approach
    // the bowling and basketball scenes use.
    //=========================================================================
    const CAM_WIDE = 'wide';
    const CAM_REELS = 'reels';
    const CAM_WIN = 'win';

    const CAM_SHOTS = {
        [CAM_WIDE]:  { pos: { x: 0.62, y: -0.16, z: 2.40 }, look: { x: 0, y: -0.24, z: 0 }, lerp: 0.06 },
        [CAM_REELS]: { pos: { x: 0.11, y: 0.035, z: 0.78 }, look: { x: 0, y: 0, z: -0.10 }, lerp: 0.10 },
        [CAM_WIN]:   { pos: { x: 0.44, y: -0.02, z: 1.22 }, look: { x: 0, y: -0.06, z: 0 }, lerp: 0.07 }
    };

    class Cabinet3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed());
            this._disposables = [];
            this._plates = [];
            this._bulbs = [];
            this._coins = [];
            this._camMode = CAM_WIDE;
            this._camPos = Object.assign({}, CAM_SHOTS[CAM_WIDE].pos);
            this._camLook = Object.assign({}, CAM_SHOTS[CAM_WIDE].look);
            this._shake = 0;
            this._time = 0;
            this._leverT = 1;
            this._flash = 0;
            this._coinSfx = 0;

            // One entry per drum: where it is, where it is going and how long
            // the trip takes. A stopped reel simply holds its angle. `stop` is
            // which detent it was last standing over, so a drum that has turned
            // past one can be heard doing it.
            this._reels = [0, 1, 2].map(() => ({
                angle: 0, from: 0, to: 0, t: 0, dur: 1, spinning: false, stop: 0
            }));

            this._initThree();
            softPSX(() => {
                this._buildRoom();
                this._buildStand();
                this._buildBody();
                this._buildMarquee();
                this._buildConsole();
                this._buildReels();
                this._buildLever();
                this._buildBulbs();
                this._buildCoins();
                // Patched once, after every part of the cabinet exists: a
                // material built afterwards would keep its smooth shading and
                // its filtered texture and stand out from the rest.
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            // No background: the canvas stays transparent so the battleback
            // behind it shows through and the cabinet reads as part of the
            // room the party is standing in.
            this.camera = new THREE.PerspectiveCamera(45, this._w / this._h, 0.05, 60);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);

            this.scene.add(new THREE.AmbientLight(0xb8c4e0, 0.62));

            const key = new THREE.DirectionalLight(0xfff0cf, 0.75);
            key.position.set(2.2, 3.4, 3.0);
            this.scene.add(key);

            // The lamp inside the hood, which is the only thing lighting the
            // reel faces once the camera is down among them.
            this._reelLight = new THREE.PointLight(0xffe2ac, 1.15, 2.2, 2);
            this._reelLight.position.set(0, WIN_H * 0.5, 0.30);
            this.scene.add(this._reelLight);

            // The marquee's own glow, which is what flashes on a jackpot.
            this._marqueeLight = new THREE.PointLight(0xffcf70, 0.55, 2.0, 2);
            this._marqueeLight.position.set(0, BODY_TOP - 0.10, 0.42);
            this.scene.add(this._marqueeLight);
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
            tex.userData = { canvas, draw };
            this._disposables.push(tex);
            return tex;
        }

        // Redraw a canvas texture in place, for the two things that depend on
        // an asset arriving late: the icon sheet and the pixel font.
        _repaint(tex) {
            if (!tex || !tex.userData || !tex.userData.canvas) return;
            const cv = tex.userData.canvas;
            tex.userData.draw(cv.getContext('2d'), cv.width, cv.height);
            tex.needsUpdate = true;
        }

        //--- procedural textures ---------------------------------------------

        _carpetTexture() {
            const rand = this._rand;
            return this._canvasTexture(32, 32, (ctx, w, h) => {
                ctx.fillStyle = '#4a1420';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 240; i++) {
                    const x = Math.floor(rand() * w);
                    const y = Math.floor(rand() * h);
                    ctx.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.20)' : 'rgba(210,140,80,0.10)';
                    ctx.fillRect(x, y, 1, 1);
                }
                // A faint deco lozenge, repeated to a carpet pattern.
                ctx.strokeStyle = 'rgba(200,150,70,0.20)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(w / 2, 2); ctx.lineTo(w - 2, h / 2);
                ctx.lineTo(w / 2, h - 2); ctx.lineTo(2, h / 2);
                ctx.closePath();
                ctx.stroke();
            }, 14, 14);
        }

        // The cabinet's lacquer: black with a gold fleck, so a flat box face
        // still has something to catch the light.
        _lacquerTexture() {
            const rand = this._rand;
            return this._canvasTexture(32, 32, (ctx, w, h) => {
                ctx.fillStyle = '#14100e';
                ctx.fillRect(0, 0, w, h);
                for (let i = 0; i < 90; i++) {
                    const x = Math.floor(rand() * w);
                    const y = Math.floor(rand() * h);
                    ctx.fillStyle = rand() > 0.65 ? 'rgba(230,194,115,0.13)' : 'rgba(0,0,0,0.30)';
                    ctx.fillRect(x, y, 1, 1);
                }
            }, 3, 3);
        }

        // One printed cell of a reel strip: the icon on cream stock with the
        // strip's own hairline top and bottom.
        _symbolTexture(index) {
            const icon = SYMBOLS[index].icon;
            return this._canvasTexture(48, 48, (ctx, w, h) => {
                ctx.clearRect(0, 0, w, h);
                const grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, '#f6eeda');
                grad.addColorStop(1, '#ddd0b2');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#8d6f2c';
                ctx.fillRect(0, 0, w, 1);
                ctx.fillRect(0, h - 1, w, 1);
                IconArt.draw(ctx, icon, 4, 4, w - 8);
            });
        }

        _marqueeTexture() {
            const title = T('SlotMachine.ui.title');
            const sub = T('SlotMachine.ui.subtitle');
            const font = (window.PSXHud && window.PSXHud.font) ? window.PSXHud.font() : 'monospace';
            return this._canvasTexture(256, 96, (ctx, w, h) => {
                ctx.fillStyle = '#0a0810';
                ctx.fillRect(0, 0, w, h);
                // The sunburst every deco lobby put over a doorway, in the one
                // place on the cabinet with room for it.
                ctx.strokeStyle = 'rgba(141,111,44,0.55)';
                ctx.lineWidth = 2;
                for (let i = 0; i <= 12; i++) {
                    const a = Math.PI + (Math.PI * i) / 12;
                    ctx.beginPath();
                    ctx.moveTo(w / 2, h);
                    ctx.lineTo(w / 2 + Math.cos(a) * w, h + Math.sin(a) * w);
                    ctx.stroke();
                }
                ctx.strokeStyle = '#e6c273';
                ctx.lineWidth = 3;
                ctx.strokeRect(4, 4, w - 8, h - 8);
                ctx.strokeStyle = '#8d6f2c';
                ctx.lineWidth = 1;
                ctx.strokeRect(11, 11, w - 22, h - 22);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff2c6';
                ctx.font = `bold 40px '${font}', Georgia, serif`;
                ctx.fillText(String(title).toUpperCase(), w / 2, h * 0.40);
                ctx.fillStyle = '#e6c273';
                ctx.font = `18px '${font}', Georgia, serif`;
                ctx.fillText(String(sub).toUpperCase(), w / 2, h * 0.73);
            });
        }

        //--- geometry ---------------------------------------------------------

        _buildRoom() {
            const mat = this._mat({ map: this._carpetTexture() });
            this._box(9, 0.1, 9, mat, 0, FLOOR_Y - 0.05, -1.2);
        }

        _buildStand() {
            const dark = this._mat({ color: 0x1a1512 });
            const gold = this._mat({ color: 0xa5842f });
            const topY = BODY_BOT;
            const h = topY - FLOOR_Y;
            this._box(CAB_W * 0.74, h, CAB_D * 0.74, dark, 0, FLOOR_Y + h / 2, -CAB_D * 0.42);
            // A plinth and a collar, the two mouldings that make a box a stand.
            this._box(CAB_W * 0.86, 0.05, CAB_D * 0.86, gold, 0, FLOOR_Y + 0.025, -CAB_D * 0.42);
            this._box(CAB_W * 0.82, 0.035, CAB_D * 0.82, gold, 0, topY - 0.017, -CAB_D * 0.42);
        }

        // The body is panels rather than one solid box, because the reel
        // window is a real hole: the drums stand inside the cabinet and the
        // front frame crops them to three rows.
        _buildBody() {
            const shell = this._mat({ map: this._lacquerTexture() });
            const gold = this._mat({ color: 0xd9b463 });
            const inner = this._mat({ color: 0x0b0a10 });

            const bodyH = BODY_TOP - BODY_BOT;
            const midY = (BODY_TOP + BODY_BOT) / 2;
            const backZ = -CAB_D;
            const frameZ = -FRAME_T / 2;

            // Front frame: the four pieces around the window opening.
            const sideW = (CAB_W - WIN_W) / 2;
            const winTop = WIN_H / 2;
            const winBot = -WIN_H / 2;
            this._box(sideW, bodyH, FRAME_T, shell, -(WIN_W + sideW) / 2, midY, frameZ);
            this._box(sideW, bodyH, FRAME_T, shell, (WIN_W + sideW) / 2, midY, frameZ);
            this._box(WIN_W, BODY_TOP - winTop, FRAME_T, shell, 0, (BODY_TOP + winTop) / 2, frameZ);
            this._box(WIN_W, winBot - BODY_BOT, FRAME_T, shell, 0, (BODY_BOT + winBot) / 2, frameZ);

            // Sides, back, cap and floor of the shell.
            this._box(0.03, bodyH, CAB_D, shell, -CAB_W / 2 + 0.015, midY, -CAB_D / 2);
            this._box(0.03, bodyH, CAB_D, shell, CAB_W / 2 - 0.015, midY, -CAB_D / 2);
            this._box(CAB_W, bodyH, 0.03, inner, 0, midY, backZ + 0.015);
            this._box(CAB_W, 0.03, CAB_D, shell, 0, BODY_TOP - 0.015, -CAB_D / 2);
            this._box(CAB_W, 0.03, CAB_D, shell, 0, BODY_BOT + 0.015, -CAB_D / 2);

            // Gold bezel around the window, and the stepped corner blocks that
            // make the front read as deco rather than as a television.
            const bez = 0.016;
            this._box(WIN_W + bez * 2, bez, 0.012, gold, 0, winTop + bez / 2, 0.006);
            this._box(WIN_W + bez * 2, bez, 0.012, gold, 0, winBot - bez / 2, 0.006);
            this._box(bez, WIN_H + bez * 2, 0.012, gold, -(WIN_W + bez) / 2, 0, 0.006);
            this._box(bez, WIN_H + bez * 2, 0.012, gold, (WIN_W + bez) / 2, 0, 0.006);
            for (const sx of [-1, 1]) {
                for (let i = 0; i < 3; i++) {
                    const w = 0.05 - i * 0.014;
                    this._box(w, 0.012, 0.01, gold,
                        sx * (CAB_W / 2 - 0.03 - w / 2), winTop + 0.05 + i * 0.018, 0.006);
                }
            }

            // The crown: three stepping slabs, the deco ziggurat.
            for (let i = 0; i < 3; i++) {
                const w = CAB_W - i * 0.09;
                const d = CAB_D * 0.55 - i * 0.03;
                const mat = i === 1 ? gold : shell;
                this._box(w, 0.035, d, mat, 0, BODY_TOP + 0.018 + i * 0.035, -d / 2 + 0.02);
            }
        }

        _buildMarquee() {
            this._marqueeTex = this._marqueeTexture();
            const mat = this._mat({
                map: this._marqueeTex, emissive: 0x6b5220, emissiveMap: this._marqueeTex
            });
            const w = WIN_W + 0.05;
            const h = w * 96 / 256;
            this._marquee = this._box(w, h, 0.014, mat, 0, WIN_H / 2 + 0.175, 0.008);
        }

        // Refresh the marquee once the pixel font has landed; the texture is
        // painted once at build time and the face arrives asynchronously.
        refreshMarquee() {
            this._repaint(this._marqueeTex);
        }

        // Redraw every reel strip, for when the icon sheet arrives late.
        refreshSymbols() {
            for (const tex of this._symbolTextures || []) this._repaint(tex);
        }

        _buildConsole() {
            const shell = this._mat({ map: this._lacquerTexture() });
            const gold = this._mat({ color: 0xd9b463 });
            const steel = this._mat({ color: 0x555a66 });

            const deckY = -WIN_H / 2 - 0.10;
            // A sloped deck under the window, the shelf a player leans on.
            const deck = this._box(WIN_W + 0.06, 0.02, 0.13, gold, 0, deckY, 0.055);
            deck.rotation.x = -0.42;

            // Coin slot and its escutcheon.
            this._box(0.05, 0.012, 0.01, steel, WIN_W / 2 - 0.03, deckY + 0.035, 0.10);

            // The three console buttons, lit while the machine is idle.
            this._buttons = [];
            const geo = this._geo(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 10));
            const colors = [0xd9533d, 0xe6c273, 0x5fc9a8];
            for (let i = 0; i < 3; i++) {
                const mat = this._basic({ color: colors[i] });
                const btn = new THREE.Mesh(geo, mat);
                btn.position.set(-0.06 + i * 0.06, deckY + 0.028, 0.095);
                btn.rotation.x = Math.PI / 2 - 0.42;
                this.scene.add(btn);
                this._buttons.push({ mesh: btn, mat, base: new THREE.Color(colors[i]) });
            }

            // The payout tray, a recess with a lip the coins land in.
            const trayY = BODY_BOT + 0.10;
            this._box(WIN_W * 0.7, 0.012, 0.09, steel, 0, trayY, 0.045);
            this._box(WIN_W * 0.7, 0.045, 0.012, gold, 0, trayY + 0.022, 0.088);
            this._trayY = trayY + 0.012;
        }

        _buildReels() {
            const drumMat = this._mat({ color: 0xe4d8bc });
            const rimMat = this._mat({ color: 0x8f8d86 });
            const shadeMat = this._basic({ color: 0x05040a, transparent: true, opacity: 0.55 });
            const dividerMat = this._mat({ color: 0x2a2318 });

            // One drum body shared in shape by all three reels: a prism with a
            // facet per stop, so each printed plate lies flat on the metal.
            const drumGeo = this._geo(
                new THREE.CylinderGeometry(DRUM_R, DRUM_R, REEL_LEN, STOPS, 1, false)
            );
            drumGeo.rotateZ(Math.PI / 2);

            // One texture and one material per symbol, shared by every plate
            // that prints it: three drums of sixteen stops is forty-eight
            // plates and only eight different things printed on them.
            this._symbolTextures = SYMBOLS.map((s, i) => this._symbolTexture(i));
            const plateMats = this._symbolTextures.map(tex => this._mat({ map: tex }));
            const plateSide = Math.min(REEL_LEN * 0.9, 2 * DRUM_R * Math.sin(STEP / 2) * 0.98);
            const plateGeo = this._geo(new THREE.PlaneGeometry(plateSide, plateSide));

            this._drums = [];
            for (let r = 0; r < 3; r++) {
                const x = (r - 1) * (REEL_LEN + REEL_GAP);
                const group = new THREE.Group();
                group.position.set(x, 0, DRUM_Z);
                this.scene.add(group);

                const body = new THREE.Mesh(drumGeo, [drumMat, rimMat, rimMat]);
                group.add(body);

                // The strip: stop k carries symbol k modulo the symbol count,
                // repeated around the drum, so the same reading of a landing
                // works whichever copy came round.
                for (let k = 0; k < STOPS; k++) {
                    const theta = k * STEP;
                    const plate = new THREE.Mesh(plateGeo, plateMats[k % SYMBOL_COUNT]);
                    plate.position.set(0, -Math.sin(theta) * (DRUM_R + 0.0015),
                        Math.cos(theta) * (DRUM_R + 0.0015));
                    plate.rotation.x = theta;
                    group.add(plate);
                    this._plates.push(plate);
                }
                this._drums.push(group);
            }

            // Dividers between the drums and the shading that fakes the depth
            // of the hood over the top and bottom rows.
            for (const sx of [-1, 1]) {
                this._box(0.008, WIN_H, 0.02, dividerMat,
                    sx * (REEL_LEN + REEL_GAP) / 2, 0, -0.004);
            }
            const shadeH = WIN_H * 0.30;
            for (const sy of [-1, 1]) {
                const q = new THREE.Mesh(
                    this._geo(new THREE.PlaneGeometry(WIN_W, shadeH)), shadeMat
                );
                q.position.set(0, sy * (WIN_H / 2 - shadeH / 2), -0.008);
                this.scene.add(q);
            }

            // The payline: one bar across the middle row with an arrowhead at
            // each end, the only red on the whole cabinet.
            const line = this._basic({ color: 0xd9533d });
            this._box(WIN_W, 0.004, 0.004, line, 0, 0, -0.006);
            for (const sx of [-1, 1]) {
                this._box(0.014, 0.014, 0.004, line, sx * (WIN_W / 2 - 0.007), 0, -0.006);
            }
        }

        _buildLever() {
            const steel = this._mat({ color: 0x9aa0ac });
            const knobMat = this._mat({ color: 0xd0342a, emissive: 0x2a0705 });
            const mountMat = this._mat({ color: 0x4a4640 });

            const px = CAB_W / 2 + 0.025;
            const py = WIN_H / 2 - 0.02;
            const pz = -0.12;

            const mount = this._geo(new THREE.CylinderGeometry(0.028, 0.032, 0.05, 8));
            mount.rotateZ(Math.PI / 2);
            const mm = new THREE.Mesh(mount, mountMat);
            mm.position.set(px - 0.01, py, pz);
            this.scene.add(mm);

            const arm = new THREE.Group();
            arm.position.set(px + 0.012, py, pz);
            this.scene.add(arm);
            this._leverArm = arm;

            const shaft = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.009, 0.011, 0.22, 6)), steel
            );
            shaft.position.set(0, 0.11, 0);
            arm.add(shaft);

            const knob = new THREE.Mesh(
                this._geo(new THREE.SphereGeometry(0.032, 10, 8)), knobMat
            );
            knob.position.set(0, 0.235, 0);
            arm.add(knob);
        }

        _buildBulbs() {
            const geo = this._geo(new THREE.SphereGeometry(0.012, 6, 5));
            const y = BODY_TOP + 0.128;
            const count = 11;
            for (let i = 0; i < count; i++) {
                const mat = this._basic({ color: 0xffe2ac });
                const bulb = new THREE.Mesh(geo, mat);
                const t = count > 1 ? i / (count - 1) : 0.5;
                bulb.position.set(-CAB_W / 2 + 0.06 + t * (CAB_W - 0.12), y, 0.02);
                this.scene.add(bulb);
                this._bulbs.push({ mat, phase: i });
            }
        }

        // A payout is coins into the tray, so a fixed pool of them is built up
        // front and thrown when there is something to pay.
        _buildCoins() {
            const geo = this._geo(new THREE.CylinderGeometry(0.019, 0.019, 0.005, 8));
            geo.rotateX(Math.PI / 2);
            const mat = this._mat({ color: 0xe8c04a, emissive: 0x3a2c06 });
            for (let i = 0; i < 24; i++) {
                const mesh = new THREE.Mesh(geo, mat);
                mesh.visible = false;
                this.scene.add(mesh);
                this._coins.push({ mesh, life: 0, v: { x: 0, y: 0, z: 0 }, spin: 0 });
            }
        }

        //--- reels ------------------------------------------------------------

        // Where the drum has to end up for `symbol` to sit on the payline. A
        // plate's bearing is its own angle plus the drum's, so the plate on the
        // line is the one whose sum is zero: the landing angle is the negative
        // of a carrying stop's, plus however many whole turns it takes to be
        // at least `minTravel` further on than the drum is now.
        _landingAngle(current, symbol, minTravel) {
            let best = Infinity;
            const TAU = Math.PI * 2;
            for (let k = symbol; k < STOPS; k += SYMBOL_COUNT) {
                const base = -k * STEP;
                const turns = Math.ceil((current + minTravel - base) / TAU);
                const a = base + turns * TAU;
                if (a < best) best = a;
            }
            return best === Infinity ? current + minTravel : best;
        }

        startSpin(targets) {
            const TAU = Math.PI * 2;
            let last = 0;
            for (let r = 0; r < 3; r++) {
                const reel = this._reels[r];
                reel.from = reel.angle;
                reel.to = this._landingAngle(reel.angle, targets[r], TAU * (3 + r));
                reel.t = 0;
                reel.dur = 1.45 + r * 0.5;
                reel.spinning = true;
                reel.stop = Math.floor(reel.angle / STEP);
                last = Math.max(last, reel.dur);
            }
            // The motor runs for as long as the last drum does, so its pitch is
            // read off the spin rather than set: pitch is playback rate, and
            // stretching a MOTOR_LEN second sample over the spin makes a long
            // spin a deeper motor that runs out about where the reels stop.
            playSe(SE.motor, Math.max(70, Math.min(150, Math.round(MOTOR_LEN * 100 / last))));
        }

        get spinning() {
            return this._reels.some(r => r.spinning);
        }

        // Advance the drums. Returns the index of a reel that came to rest this
        // frame, or -1, so the scene can click for it.
        updateReels(dt) {
            let landed = -1;
            let ticked = false;
            for (let r = 0; r < 3; r++) {
                const reel = this._reels[r];
                if (!reel.spinning) continue;
                const was = reel.angle;
                reel.t += dt;
                const u = Math.min(1, reel.t / reel.dur);
                const eased = 1 - Math.pow(1 - u, 5);
                let angle = reel.from + (reel.to - reel.from) * eased;
                // The kickback: a mechanical reel overruns its stop by a third
                // of a symbol and springs back onto it. Measured in radians
                // rather than as a share of the trip, so it is the same nudge
                // whether the drum turned three times or six.
                if (u > 0.82) {
                    const k = (u - 0.82) / 0.18;
                    angle += Math.sin(k * Math.PI) * STEP * 0.30 * (1 - k * 0.4);
                }
                reel.angle = angle;

                // One click per detent the strip has turned past, but only
                // once the drum is slow enough for them to be separate sounds,
                // and only one click a frame however many drums crossed one.
                const stop = Math.floor(angle / STEP);
                if (stop !== reel.stop) {
                    const speed = Math.abs(angle - was) / Math.max(dt, 1 / 240);
                    if (!ticked && speed < TICK_SPEED) {
                        playSe(SE.tick, 116 + Math.floor(Math.random() * 14));
                        ticked = true;
                    }
                    reel.stop = stop;
                }

                if (u >= 1) {
                    reel.angle = reel.to;
                    reel.spinning = false;
                    landed = r;
                    // Each drum falls a little heavier than the one before it,
                    // so a spin ends on its lowest note.
                    playSe(SE.stop, 112 - r * 11, SE.stop.volume + r * 6);
                }
                this._drums[r].rotation.x = reel.angle;
            }
            return landed;
        }

        //--- the rest of the cabinet -------------------------------------------

        pullLever() {
            this._leverT = 0;
            playSe(SE.lever, 92 + Math.floor(Math.random() * 10));
        }

        shake(amount) {
            this._shake = Math.min(1.2, this._shake + amount);
        }

        // Light the house up: 1 is an ordinary win, 2 a jackpot.
        celebrate(level) {
            this._flash = level >= 2 ? 2.4 : 1.0;
        }

        // Thrown out of the hopper mouth just above the tray, with barely any
        // forward speed: a coin that cleared the lip would fall out of the
        // machine and through the carpet.
        payCoins(count) {
            const n = Math.min(this._coins.length, Math.max(1, count));
            for (let i = 0; i < n; i++) {
                const coin = this._coins[i];
                coin.life = 1.6 + Math.random() * 0.6;
                coin.mesh.visible = true;
                coin.mesh.position.set(
                    (Math.random() - 0.5) * WIN_W * 0.3,
                    this._trayY + 0.13,
                    0.015 + Math.random() * 0.02
                );
                coin.v = {
                    x: (Math.random() - 0.5) * 0.22,
                    y: 0.10 + Math.random() * 0.25,
                    z: 0.03 + Math.random() * 0.10
                };
                coin.spin = (Math.random() - 0.5) * 20;
            }
        }

        _updateCoins(dt) {
            this._coinSfx = Math.max(0, this._coinSfx - dt);
            for (const coin of this._coins) {
                if (coin.life <= 0) continue;
                coin.life -= dt;
                coin.v.y -= 4.2 * dt;
                coin.mesh.position.x += coin.v.x * dt;
                coin.mesh.position.y += coin.v.y * dt;
                coin.mesh.position.z += coin.v.z * dt;
                coin.mesh.rotation.z += coin.spin * dt;
                if (coin.mesh.position.y < this._trayY && coin.v.y < 0) {
                    // Two dozen coins bouncing would be two dozen samples on
                    // top of each other, so the tray is heard as a clatter: a
                    // coin only rings if one has not rung very recently, and
                    // only if it hit the tray with something behind it.
                    if (this._coinSfx <= 0 && coin.v.y < -0.12) {
                        playSe(SE.coin, 92 + Math.floor(Math.random() * 34));
                        this._coinSfx = 0.06 + Math.random() * 0.05;
                    }
                    coin.mesh.position.y = this._trayY;
                    coin.v.y *= -0.35;
                    coin.v.x *= 0.6;
                    coin.v.z *= 0.6;
                    coin.spin *= 0.5;
                }
                if (coin.life <= 0) coin.mesh.visible = false;
            }
        }

        _updateLever(dt) {
            if (this._leverT >= 1) return;
            this._leverT = Math.min(1, this._leverT + dt / 0.75);
            const u = this._leverT;
            // Down hard, then back up on a spring that overshoots once.
            const down = u < 0.28 ? (u / 0.28) : Math.max(0, 1 - (u - 0.28) / 0.72);
            const spring = u > 0.85 ? Math.sin((u - 0.85) / 0.15 * Math.PI) * 0.12 : 0;
            this._leverArm.rotation.x = down * 1.45 - spring;
        }

        _updateLights(dt) {
            this._flash = Math.max(0, this._flash - dt);
            const chase = this._flash > 0 ? 14 : (this.spinning ? 9 : 3.2);
            for (let i = 0; i < this._bulbs.length; i++) {
                const b = this._bulbs[i];
                const lit = this._flash > 0
                    ? (Math.sin(this._time * chase) > 0 ? 1 : 0)
                    : (Math.sin(this._time * chase - b.phase * 0.8) * 0.5 + 0.5);
                const v = 0.28 + lit * 0.72;
                b.mat.color.setRGB(v, v * 0.88, v * 0.62);
            }
            this._marqueeLight.intensity = 0.5 + (this._flash > 0 ? 1.4 : 0) *
                (Math.sin(this._time * 16) * 0.5 + 0.5);
            this._reelLight.intensity = 1.1 + (this._flash > 0 ? 0.6 : 0);
            for (let i = 0; i < this._buttons.length; i++) {
                const btn = this._buttons[i];
                const pulse = this.spinning ? 0.55
                    : 0.7 + Math.sin(this._time * 2.4 - i * 1.1) * 0.3;
                btn.mat.color.copy(btn.base).multiplyScalar(pulse);
            }
        }

        setCameraMode(mode) {
            this._camMode = mode;
        }

        updateCamera(dt) {
            const shot = CAM_SHOTS[this._camMode] || CAM_SHOTS[CAM_WIDE];
            const k = 1 - Math.pow(1 - shot.lerp, Math.max(0.2, dt * 60));
            this._camPos.x += (shot.pos.x - this._camPos.x) * k;
            this._camPos.y += (shot.pos.y - this._camPos.y) * k;
            this._camPos.z += (shot.pos.z - this._camPos.z) * k;
            this._camLook.x += (shot.look.x - this._camLook.x) * k;
            this._camLook.y += (shot.look.y - this._camLook.y) * k;
            this._camLook.z += (shot.look.z - this._camLook.z) * k;

            this._shake = Math.max(0, this._shake - dt * 2.2);
            const s = this._shake;
            // A slow drift so a machine nobody is playing is not a still frame.
            const drift = Math.sin(this._time * 0.35) * 0.012;
            this.camera.position.set(
                this._camPos.x + drift + (Math.random() - 0.5) * s * 0.02,
                this._camPos.y + (Math.random() - 0.5) * s * 0.02,
                this._camPos.z
            );
            this.camera.lookAt(this._camLook.x, this._camLook.y, this._camLook.z);
        }

        update(dt) {
            this._time += dt;
            this._updateLever(dt);
            this._updateCoins(dt);
            this._updateLights(dt);
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
    // Scene_SlotMachine
    //=========================================================================
    Scene_SlotMachine = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._bet = MIN_BET;
            this._lastWin = 0;
            this._state = STATE.IDLE;
            this._targets = [0, 0, 0];
            this._wait = 0;
            // The press or click that opened the cabinet must not also spend a
            // bet on the first frame the scene is live.
            this._arming = 15;
            this._threeReady = typeof THREE !== 'undefined';
        }

        //--- construction ----------------------------------------------------

        create() {
            super.create();
            this.resetFreePlayTokens();
            if (!this._threeReady) {
                this.createUI();
                this._status.setText(T('SlotMachine.noThree'));
                this._state = STATE.PAYOUT;
                this._wait = -1;
                return;
            }
            this.createCabinet();
            this.createUI();
            this._banner.setMessage(T('SlotMachine.ui.pressSpin'));
            this._status.setText('');
            this.refreshStats();
        }

        // The blurred map snapshot is replaced by the battleback of wherever
        // the player is standing, which the transparent 3D cabinet sits on.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, '#171021', '#060409', true);
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);

            const bitmap = backdropBitmap();
            if (!bitmap) return;
            this._backdropSprite = new Sprite(bitmap);
            this.addChild(this._backdropSprite);
            bitmap.addLoadListener(() => this.fitBackdrop());
            this.fitBackdrop();

            // Knocked well back: the cabinet is the lit thing in the room and
            // the 8px type has to read over whatever is behind it.
            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll('rgba(3, 2, 8, 0.55)');
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

        createCabinet() {
            // Rendering a little below native and scaling up with nearest
            // filtering keeps a period edge without smearing the reel symbols.
            const scale = 0.88;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._cabinet = new Cabinet3D(w, h);

            const texture = PIXI.Texture.from(this._cabinet.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._cabinetSprite = new PIXI.Sprite(texture);
            this._cabinetSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._cabinetSprite, idx);

            // The reel strips are printed from the icon sheet, which is very
            // probably cached and just occasionally is not.
            IconArt.onReady(() => {
                if (this._cabinet) this._cabinet.refreshSymbols();
                if (this._paytable) this._paytable.refresh();
            });
        }

        createUI() {
            this._banner = new Sprite_SlotBanner();
            this.addChild(this._banner);

            this._stats = new Sprite_SlotStats();
            this.addChild(this._stats);

            this._paytable = new Sprite_SlotPaytable();
            this.addChild(this._paytable);

            this._status = new Sprite_SlotStatus();
            this.addChild(this._status);

            // The pixel font arrives asynchronously; repaint what was drawn
            // once, the marquee included since it is painted in the same face.
            if (window.PSXHud) {
                window.PSXHud.onFontReady(() => {
                    if (!this._banner) return;
                    this._banner.refresh();
                    this._stats.refresh();
                    this._paytable.refresh();
                    this._status.refresh();
                    if (this._cabinet) this._cabinet.refreshMarquee();
                });
            }
        }

        //--- helpers ---------------------------------------------------------

        // In free play the wallet is set back to the fixed bankroll on entry, so
        // reopening the machine from the title's minigame list always deals the
        // same starting tokens. A real save is never touched.
        resetFreePlayTokens() {
            if (!isFreePlay()) return;
            const tokens = $dataItems[TOKEN_ITEM_ID];
            if (!tokens) return;
            const arcade = window.MinigameArcade;
            const want = (arcade && arcade.STIPEND_TOKENS) || FREE_PLAY_TOKENS;
            const have = $gameParty.numItems(tokens);
            if (have < want) $gameParty.gainItem(tokens, want - have);
            else if (have > want) $gameParty.loseItem(tokens, have - want);
        }

        currentTokens() {
            const tokens = $dataItems[TOKEN_ITEM_ID];
            return tokens ? $gameParty.numItems(tokens) : 0;
        }

        refreshStats() {
            if (this._stats) this._stats.setStats(this.currentTokens(), this._bet, this._lastWin);
        }

        changeBet(amount) {
            const oldBet = this._bet;
            this._bet = Math.max(MIN_BET, Math.min(MAX_BET, this._bet + amount));
            if (this._bet !== oldBet) {
                // A chip up the stack is pitched above a chip down it, so the
                // stake can be heard moving without looking at the number.
                playSe(SE.bet, this._bet > oldBet ? 118 : 96);
                this.refreshStats();
                this._stats.flashBet();
            }
        }

        //--- game flow --------------------------------------------------------

        update() {
            super.update();

            switch (this._state) {
                case STATE.IDLE: this.updateIdle(); break;
                case STATE.SPINNING: this.updateSpinning(); break;
                case STATE.SETTLING: this.updateSettling(); break;
                case STATE.PAYOUT: this.updatePayout(); break;
            }

            // The HTML labels are painted when a widget repaints, which is not
            // every frame: this keeps them on their sprite when one is shown,
            // hidden or moved in between.
            for (const dom of SLOT_DOMS) dom.sync();

            // Redraw last, so the composited texture always shows the state the
            // logic above just produced rather than the previous frame's.
            if (this._cabinet) {
                const dt = 1 / 60;
                this._cabinet.update(dt);
                this._cabinet.updateCamera(dt);
                this._cabinet.render();
                if (this._cabinetSprite && this._cabinetSprite.texture) {
                    this._cabinetSprite.texture.update();
                }
            }
        }

        updateIdle() {
            if (this._arming > 0) {
                this._arming--;
                return;
            }
            if (Input.isRepeated('up')) this.changeBet(10);
            else if (Input.isRepeated('down')) this.changeBet(-10);
            else if (Input.isRepeated('right')) this.changeBet(1);
            else if (Input.isRepeated('left')) this.changeBet(-1);

            if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            if (Input.isTriggered('ok') || TouchInput.isTriggered()) this.spin();
        }

        spin() {
            const tokens = $dataItems[TOKEN_ITEM_ID];
            if (!tokens) {
                playSe(SE.deny);
                this._banner.setMessage(T('SlotMachine.noTokens'));
                return;
            }
            const tokenCount = $gameParty.numItems(tokens);
            if (tokenCount < this._bet) {
                playSe(SE.deny);
                this._banner.setMessage(
                    T('SlotMachine.notEnoughTokens', { have: tokenCount, need: this._bet })
                );
                return;
            }

            $gameParty.loseItem(tokens, this._bet);
            for (let i = 0; i < 3; i++) this._targets[i] = pickTarget();

            // The stake goes in first, then the arm comes down and the drums
            // start: the order a player would hear standing at the cabinet.
            playSe(SE.insert, 100 + Math.floor(Math.random() * 16));
            this._state = STATE.SPINNING;
            this._cabinet.pullLever();
            this._cabinet.startSpin(this._targets);
            this._cabinet.setCameraMode(CAM_REELS);
            this._banner.setMessage(T('SlotMachine.spinning'));
            this.refreshStats();
        }

        updateSpinning() {
            // The drum makes its own noise as it falls into its detent; what is
            // left for the scene is the knock the cabinet takes from it.
            const landed = this._cabinet.updateReels(1 / 60);
            if (landed >= 0) this._cabinet.shake(0.25);
            if (!this._cabinet.spinning) {
                this._state = STATE.SETTLING;
                this._wait = 18;
            }
        }

        updateSettling() {
            if (this._wait > 0) {
                this._wait--;
                return;
            }
            this.checkWin();
        }

        updatePayout() {
            // A negative wait is the "three.js is missing" dead end: no reels
            // to watch, so the only thing left is a way out.
            if (this._wait < 0) {
                if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this.popScene();
                return;
            }
            if (this._wait > 0) {
                this._wait--;
                return;
            }
            this._state = STATE.IDLE;
            this._cabinet.setCameraMode(CAM_WIDE);
            this._status.setText('');
        }

        checkWin() {
            // A pair happens on ~33% of spins with 3 reels (higher with fewer
            // symbols). Paying bet*2 pushed the overall RTP above 100% for the
            // recommended 5-symbol setups. Pay bet*1.5 so the house keeps an
            // edge across the whole recommended 5-10 symbol range (payoutFor).
            const pay = payoutFor(this._targets, this._bet);
            const winAmount = pay.win;
            const level = pay.level;
            let message = '';
            if (pay.kind === 'jackpot') {
                message = T('SlotMachine.jackpot', { amount: winAmount, mult: pay.mult });
            } else if (pay.kind === 'pair') {
                message = T('SlotMachine.pair', { amount: winAmount });
            }

            if (winAmount > 0) {
                const tokens = $dataItems[TOKEN_ITEM_ID];
                $gameParty.gainItem(tokens, winAmount);
                this._lastWin = winAmount;
                // A pair rings the bell once; three of a kind brings the house
                // in over the top of it, and the tray answers either way.
                playSe(SE.win, level >= 2 ? 108 : 100);
                if (level >= 2) playSe(SE.jackpot);
                this._cabinet.celebrate(level);
                this._cabinet.payCoins(Math.round(4 + Math.min(20, winAmount / 6)));
                this._cabinet.setCameraMode(CAM_WIN);
                if (window.MinigameFun) window.MinigameFun.won({ spec: 'Card Counting', gambling: true });
            } else {
                this._lastWin = 0;
                message = T('SlotMachine.noMatch');
                playSe(SE.lose);
                if (window.MinigameFun) window.MinigameFun.lost({ spec: 'Card Counting', gambling: true });
            }

            this._banner.setMessage(message);
            this.refreshStats();
            this._state = STATE.PAYOUT;
            this._wait = winAmount > 0 ? (level >= 2 ? 130 : 80) : 40;
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            // The HTML labels sit outside the scene graph and would otherwise
            // survive the scene that made them.
            for (const dom of SLOT_DOMS) dom.destroy();
            SLOT_DOMS = [];
            if (this._cabinetSprite) {
                if (this._cabinetSprite.parent) this._cabinetSprite.parent.removeChild(this._cabinetSprite);
                this._cabinetSprite.destroy();
                this._cabinetSprite = null;
            }
            if (this._cabinet) {
                this._cabinet.dispose();
                this._cabinet = null;
            }
        }
    }

    //=============================================================================
    // HUD. Drawn in a 240-line virtual framebuffer and upscaled with nearest
    // filtering, the way a 32-bit console drew its overlays: an 8px bitmap face,
    // hard one-pixel shadows, block gauges. Dressed art deco, gold on black
    // lacquer, matching the alley, the court and the tarot parlour: see
    // PSXHud.DECO and the deco* primitives in PSXShader.js.
    //=============================================================================
    const HUD = () => window.PSXHud;
    // 240 virtual scanlines, width derived from the aspect: see PSXHud.BASE_H.
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);

    // Every DOM handle the widgets have taken, so they can be re-laid out when
    // one moves and torn down when the scene ends.
    let SLOT_DOMS = [];

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
                SLOT_DOMS.push(this._dom);
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
    // Sprite_SlotBanner - the machine's name across the top, with whatever it
    // last had to say to the player under it.
    //=============================================================================
    class Sprite_SlotBanner extends Sprite_PSXWidget {
        constructor() {
            super(hudW(), 28, 0, 0);
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
                title: T('SlotMachine.ui.title'),
                titleRight: T('SlotMachine.ui.subtitle'),
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });
            this.hudText(this._message, 6, 14, this._vw - 12, 'center', D.ink, 8);
            this.endText();
        }
    }

    //=============================================================================
    // Sprite_SlotStats - the three numbers a player watches.
    //=============================================================================
    class Sprite_SlotStats extends Sprite_PSXWidget {
        constructor() {
            super(112, 52, 6, 0);
            this.y = Math.round((240 - 52 - 18) * hudScale());
            this._tokens = 0;
            this._bet = 0;
            this._lastWin = 0;
            this._flash = 0;
            this.refresh();
        }

        setStats(tokens, bet, lastWin) {
            if (this._tokens === tokens && this._bet === bet && this._lastWin === lastWin) return;
            this._tokens = tokens;
            this._bet = bet;
            this._lastWin = lastWin;
            this.refresh();
        }

        flashBet() {
            this._flash = 12;
            this.refresh();
        }

        update() {
            super.update();
            if (this._flash > 0 && --this._flash === 0) this.refresh();
        }

        refresh() {
            const H = HUD();
            if (!H) return;
            const bmp = this.bitmap;
            const D = H.DECO;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { hairline: false, step: 2 });
            const rows = [
                [T('SlotMachine.ui.tokens'), this._tokens, D.ink],
                [T('SlotMachine.ui.bet'), this._bet, this._flash > 0 ? D.goldHi : D.jade],
                [T('SlotMachine.ui.lastWin'), this._lastWin, this._lastWin > 0 ? D.green : D.faint]
            ];
            rows.forEach(([label, value, color], i) => {
                const y = 7 + i * 13;
                this.hudText(label, 7, y, 62, 'left', D.dim, 8);
                this.hudText(String(value), this._vw - 45, y, 38, 'right', color, 8);
                if (i < rows.length - 1) H.decoRule(bmp, 7, y + 11, this._vw - 14, D.goldLo);
            });
            this.endText();
        }
    }

    //=============================================================================
    // Sprite_SlotPaytable - the top four combinations, each symbol standing in
    // as a pip in its own average colour: nine pixels cannot carry the drawing,
    // but they can carry what it is drawn in.
    //=============================================================================
    class Sprite_SlotPaytable extends Sprite_PSXWidget {
        constructor() {
            super(118, 52, 0, 0);
            this.x = Math.round((hudW() - 124) * hudScale());
            this.y = Math.round((240 - 52 - 18) * hudScale());
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
                title: T('SlotMachine.ui.payouts'), titleAlign: 'center',
                headerH: 9, hairline: false, step: 1, dom: this._dom
            });

            const top = SYMBOLS.map((s, i) => ({ s, i }))
                .sort((a, b) => b.s.mult - a.s.mult)
                .slice(0, Math.min(4, SYMBOL_COUNT));
            top.forEach(({ s }, row) => {
                const y = 14 + row * 9;
                const tint = IconArt.tint(s.icon);
                for (let k = 0; k < 3; k++) {
                    const x = 9 + k * 9;
                    bmp.fillRect(x, y, 7, 7, D.goldLo);
                    bmp.fillRect(x + 1, y + 1, 5, 5, tint);
                }
                this.hudText(`X${s.mult}`, this._vw - 46, y - 1, 38, 'right', D.gold, 8);
            });
            this.endText();
        }
    }

    //=============================================================================
    // Status strip. An RMMZ windowskin frame is the one thing on screen that
    // could never have come off a 32-bit console, so the hint line is a sprite.
    //=============================================================================
    class Sprite_SlotStatus extends Sprite_PSXWidget {
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

    window.Scene_SlotMachine = Scene_SlotMachine;

})();
