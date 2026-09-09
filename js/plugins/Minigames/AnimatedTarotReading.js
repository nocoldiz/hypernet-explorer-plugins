/*:
 * @target MZ
 * @plugindesc 3D Tarot Reading Table v2.0.0 - PSX-shaded three.js table with animated spreads
 * @author Omni-Lex & Antigravity
 * @help
 * ============================================================================
 * Animated Tarot Reading
 * ============================================================================
 *
 * A reading now happens on a real table: a three.js scene rendered through the
 * shared PSXShader (vertex snapping, 4-bit colour, ordered dither, low-res
 * upscale) with a PSXHud overlay drawn in a 240-line virtual framebuffer, the
 * way a PlayStation drew its menus. The lacquer and keylines are framebuffer
 * work; the lettering on them is crisp HTML type (PSXHud.domPanel), and there
 * is no scanline or vignette pass over any of it.
 *
 * The deck riffles, the reader cuts it, cards fly to their positions face down
 * and turn over one at a time. The focused card lifts off the cloth and
 * billboards toward the camera while targeting brackets track it in screen
 * space.
 *
 * Spreads:
 *   Three Card       past / present / future
 *   Elemental Cross  five cards
 *   Horseshoe        seven cards
 *   Celtic Cross     ten cards, with the crossing card
 *
 * Camera: the player can orbit, pan and zoom at any time.
 *   Orbit   mouse drag        / right analog stick
 *   Zoom    mouse wheel      / L2 + R2 triggers, or L1 + R1
 *   Pan     SHIFT + orbit     / X(square) + right stick
 *   Recentre  tap SHIFT (X/square) without moving the view
 *
 * Card art comes from img/arcana/0.png .. 21.png, meanings from
 * js/i18n/<lang>/tarot.json.
 *
 * Requires: Battler3D/PSXShader (loads earlier), js/libs/three.min.js.
 * Optional: Core/AnalogStickInput for stick and trigger camera control.
 *
 * @command openTarot
 * @text Open Tarot Reading
 * @desc Opens the tarot card reading interface
 *
 * @command readTarotToNPC
 * @text Read Tarot to NPC
 * @desc Read tarot cards to an NPC with a guessing game
 *
 * @arg npcName
 * @text NPC Name
 * @desc Name of the NPC receiving the reading
 * @type string
 * @default Villager
 *
 * @arg perfectMessage
 * @text Perfect Score Message
 * @desc Message when all 3 cards are guessed correctly
 * @type multiline_string
 * @default Amazing! Your reading was perfectly accurate!\nI'm impressed by your mystical abilities!
 *
 * @arg goodMessage
 * @text Good Score Message
 * @desc Message when 2 cards are guessed correctly
 * @type multiline_string
 * @default Good reading! You got most of it right.\nYou have real potential as a fortune teller.
 *
 * @arg averageMessage
 * @text Average Score Message
 * @desc Message when 1 card is guessed correctly
 * @type multiline_string
 * @default Your reading was partially correct.\nPerhaps you need more practice with the cards.
 *
 * @arg poorMessage
 * @text Poor Score Message
 * @desc Message when no cards are guessed correctly
 * @type multiline_string
 * @default That reading didn't resonate with me at all...\nMaybe the spirits weren't speaking clearly today.
 */

(() => {
    'use strict';

    const pluginName = 'AnimatedTarotReading';

    //=========================================================================
    // i18n
    //=========================================================================
    // Card meanings live in the namespace as objects, so T.obj is the accessor.
    const _tarotCardData = (key) => T.obj('AnimatedTarotReading.cards.' + key) || null;

    // Returns a non-empty meaning array for the given orientation, with a safe
    // fallback so callers never index into undefined before i18n finishes loading.
    const _tarotPool = (data, isReversed) => {
        const pool = data ? (isReversed ? data.reversed : data.upright) : null;
        return (Array.isArray(pool) && pool.length) ? pool : [T('AnimatedTarotReading.ui.unclear')];
    };


    // i18n-ignore-start: these are the lookup keys into the cards.* subtree of
    // js/i18n/<lang>/plugins/AnimatedTarotReading.json and are identical in every
    // language. The visible card name is cards.<key>.name, which is translated.
    const tarotKeys = [
        'The Fool', 'The Magician', 'The High Priestess', 'The Empress', 'The Emperor',
        'The Hierophant', 'The Lovers', 'The Chariot', 'Strength', 'The Hermit',
        'Wheel of Fortune', 'Justice', 'The Hanged Man', 'Death', 'Temperance',
        'The Devil', 'The Tower', 'The Star', 'The Moon', 'The Sun',
        'Judgement', 'The World'
    ];
    // i18n-ignore-end

    // Roman numerals of the Major Arcana, printed on the HUD plate the way a
    // real deck prints them.
    const ROMAN = [
        '0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
        'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'
    ];

    // One keyword per arcana, used to compose the closing synthesis line.
    const KEYWORD = [
        'BEGINNING', 'WILL', 'SECRECY', 'ABUNDANCE', 'ORDER', 'TRADITION', 'UNION',
        'RESOLVE', 'COURAGE', 'SOLITUDE', 'FATE', 'BALANCE', 'SUSPENSION', 'ENDING',
        'MEASURE', 'BONDAGE', 'RUPTURE', 'HOPE', 'ILLUSION', 'CLARITY', 'RECKONING',
        'COMPLETION'
    ];

    const cardName = (arcana) => {
        const data = _tarotCardData(tarotKeys[arcana]);
        return (data && data.name) ? data.name : tarotKeys[arcana];
    };

    // The widest name the deck can print, in virtual pixels. The layout list
    // cuts its plate to this, so a long arcana (THE HIGH PRIESTESS in English,
    // and longer again once translated) is printed whole instead of being
    // guillotined a letter short of the reversed marker. Measured once per
    // language: the deck does not change inside a reading.
    let _widestName = -1;
    let _widestNameLang = null;
    function widestCardName(bmp) {
        const H = HUD();
        if (!H || !bmp) return 0;
        const lang = (window.ConfigManager && ConfigManager.language) || 'en';
        if (_widestName >= 0 && _widestNameLang === lang) return _widestName;
        bmp.fontFace = H.FONT;
        bmp.fontSize = 8;
        let widest = 0;
        for (let i = 0; i < tarotKeys.length; i++) {
            widest = Math.max(widest, bmp.measureTextWidth(cardName(i).toUpperCase()));
        }
        _widestNameLang = lang;
        _widestName = Math.ceil(widest);
        return _widestName;
    }

    const cardMeaning = (arcana, reversed) => {
        const pool = _tarotPool(_tarotCardData(tarotKeys[arcana]), reversed);
        return pool[Math.floor(Math.random() * pool.length)];
    };

    const uiText = (key) => T('AnimatedTarotReading.ui.' + key);

    //=========================================================================
    // Spreads. Slot coordinates are in table units (x right, z toward the
    // viewer) and are re-centred on the cloth when the spread is chosen.
    //=========================================================================
    const CARD_W = 0.62;
    const CARD_H = 1.04;
    const CARD_T = 0.014;
    const TABLE_R = 2.95;

    const SPREADS = [
        {
            id: 'three',
            slots: [
                { x: -0.86, z: 0 },
                { x: 0, z: 0 },
                { x: 0.86, z: 0 }
            ]
        },
        {
            id: 'cross',
            slots: [
                { x: 0, z: 0 },
                { x: -1.0, z: 0 },
                { x: 1.0, z: 0 },
                { x: 0, z: -1.3 },
                { x: 0, z: 1.3 }
            ]
        },
        {
            id: 'horseshoe',
            slots: (() => {
                const R = 1.62;
                return Array.from({ length: 7 }, (_, i) => {
                    const a = (-70 + i * (140 / 6)) * Math.PI / 180;
                    return {
                        x: R * Math.sin(a),
                        z: 0.8 - R * Math.cos(a),
                        yaw: a * 0.45
                    };
                });
            })()
        },
        {
            id: 'celtic',
            slots: [
                { x: 0, z: 0 },
                { x: 0, z: 0, yaw: Math.PI / 2, lift: CARD_T * 1.6 },
                { x: 0, z: 1.05 },
                { x: -0.95, z: 0 },
                { x: 0, z: -1.05 },
                { x: 0.95, z: 0 },
                { x: 2.0, z: 1.2 },
                { x: 2.0, z: 0.4 },
                { x: 2.0, z: -0.4 },
                { x: 2.0, z: -1.2 }
            ]
        }
    ];

    // Centre each spread on the cloth and record how much table it occupies, so
    // the camera can frame a ten card working as readily as a three card one.
    for (const spread of SPREADS) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const s of spread.slots) {
            minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
            minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
        }
        const ox = (minX + maxX) / 2;
        const oz = (minZ + maxZ) / 2;
        let radius = 0;
        for (const s of spread.slots) {
            s.x -= ox;
            s.z -= oz;
            radius = Math.max(radius, Math.sqrt(s.x * s.x + s.z * s.z));
        }
        spread.radius = radius + CARD_H * 0.5;
        spread.count = spread.slots.length;
        // Display copy is resolved on read, never frozen at load time.
        const base = 'AnimatedTarotReading.spreads.' + spread.id;
        Object.defineProperty(spread, 'name', { get: () => T(base + '.name') });
        Object.defineProperty(spread, 'blurb', { get: () => T(base + '.blurb') });
        spread.slots.forEach((slot, i) => Object.defineProperty(slot, 'label', {
            get: () => T(base + '.slots.' + i)
        }));
    }

    //=========================================================================
    // Small utilities
    //=========================================================================
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    // Shortest-arc interpolation, so a card swinging to face the camera never
    // takes the long way round.
    const lerpAngle = (a, b, t) => {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return a + d * t;
    };
    const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const easeInOut = (t) => {
        t = clamp(t, 0, 1);
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    function worldSeed() {
        try {
            if (window.HistoryManager && HistoryManager.getSeed) return HistoryManager.getSeed() >>> 0;
        } catch (e) { /* pre-boot */ }
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

    // A missing sound file must never take a reading down with it.
    function playSe(name, pitch, volume, pan) {
        try {
            AudioManager.playSe({
                name: name,
                volume: volume == null ? 70 : volume,
                pitch: pitch == null ? 100 : pitch,
                pan: pan || 0
            });
        } catch (e) { /* cosmetic */ }
    }

    // The tarot table wants its wobble dialled down: the cards carry readable
    // artwork and full vertex snapping turns the pips into noise.
    function softPSX(fn) {
        if (!window.PSXShader || !window.PSXShader.withScale) return fn();
        return window.PSXShader.withScale(
            { vertexSnap: 2.0, colorLevels: 1.4, dither: 0.6, downscale: 1.15 },
            fn
        );
    }

    //=========================================================================
    // HUD. Everything is authored in a 240 line virtual framebuffer and
    // upscaled with nearest filtering: 8px bitmap type on solid black plates,
    // gold keylines, stepped corners and knocked-out header bands. The parlour
    // is lit by candles; anything translucent laid over it was unreadable, so
    // the panels are lacquer and the type sits on top of them.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudH = () => 240;

    // The reading's own accents on top of the shared art deco palette.
    const DECO = () => (HUD() ? HUD().DECO : {});
    const GOLD = '#e6c273';
    const GOLD_HI = '#fff2c6';
    const GOLD_DIM = '#c0a468';
    const GOLD_LO = '#8d6f2c';
    const VIOLET = '#c6a3ea';
    const INK = '#f6e8c4';
    const DIMINK = '#c0a468';
    const FAINT = '#7d6836';
    const RED = '#d9533d';

    // Height of the meaning box across the bottom. The layout list sizes its
    // rows against this, so the two are kept in one place.
    const MEANING_H = 66;

    // A lacquered plate: black field, gold keyline, stepped corners. `title`
    // turns the top strip into a gold band with the lettering knocked out.
    function plate(bmp, x, y, w, h, opts) {
        const H = HUD();
        if (!H) return;
        H.decoPanel(bmp, x, y, w, h, opts || {});
    }

    // Corner ticks, for the brackets that track a card out on the cloth. These
    // are drawn straight onto the scene rather than onto a plate, so they stay
    // thin: they are a sight, not a frame.
    function brackets(bmp, x, y, w, h, color, len) {
        const L = len || 5;
        bmp.fillRect(x, y, L, 1, color);
        bmp.fillRect(x, y, 1, L, color);
        bmp.fillRect(x + w - L, y, L, 1, color);
        bmp.fillRect(x + w - 1, y, 1, L, color);
        bmp.fillRect(x, y + h - L, 1, L, color);
        bmp.fillRect(x, y + h - 1, L, 1, color);
        bmp.fillRect(x + w - L, y + h - 1, L, 1, color);
        bmp.fillRect(x + w - 1, y + h - L, 1, L, color);
    }

    // Hairline broken by a centre lozenge.
    function rule(bmp, x, y, w, color) {
        const H = HUD();
        if (!H) return;
        H.decoRule(bmp, x, y, w, color || GOLD_LO);
    }

    // The lacquer, the keylines and the gauges stay in the framebuffer; the type
    // goes to the HTML layer over it, in the same virtual coordinates, so an 8px
    // face is never stretched across four device pixels. Set by the live scene's
    // createHudLayer, so the drawing helpers below need no scene reference.
    let hudDom = null;

    function hudText(bmp, str, x, y, w, align, color, size, opts) {
        const H = HUD();
        if (!H) return;
        if (hudDom) hudDom.text(str, x, y, w, align, color, size, opts);
        else H.text(bmp, str, x, y, w, align, color, size, opts);
    }

    // Word wrap against the pixel font's own metrics. The caller has already
    // decided on the case; PSXHud.text is given raw so it does not upper it twice.
    function wrapLines(bmp, text, maxW, size) {
        const H = HUD();
        if (!H) return [String(text)];
        bmp.fontFace = H.FONT;
        bmp.fontSize = size;
        const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (line && bmp.measureTextWidth(test) > maxW) {
                lines.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines.length ? lines : [''];
    }

    //=========================================================================
    // TarotTable3D - the three.js stage. Renders to its own small canvas which
    // the scene composites as a PIXI sprite, the same approach the bowling
    // alley and the tournament arena use.
    //=========================================================================
    class TarotTable3D {
        constructor(width, height) {
            this._w = Math.max(160, Math.floor(width));
            this._h = Math.max(120, Math.floor(height));
            this._rand = mulberry32(worldSeed());
            this._disposables = [];
            this._cards = [];
            this._time = 0;
            this._shake = 0;

            // Camera rig. yaw is measured from +Z, pitch up from the cloth.
            this.yaw = 0;
            this.pitch = 0.86;
            this.dist = 4.2;
            this.pan = { x: 0, y: 0 };
            this.target = { x: 0, y: 0.1, z: 0 };
            this._lookAt = { x: 0, y: 0.1, z: 0 };

            this._initThree();
            softPSX(() => {
                this._buildRoom();
                this._buildTable();
                this._buildProps();
                this._buildDeck();
                this._buildFocusRing();
                // Patch every material in one pass. Cards built later carry
                // their own applyToObject call, because they are made after
                // this block has restored the global tunables.
                if (window.PSXShader) window.PSXShader.applyToObject(this.scene);
            });
            this.updateCamera(1);
        }

        get domElement() { return this.renderer.domElement; }

        //--- setup ----------------------------------------------------------

        _initThree() {
            const fogColor = 0x070510;
            this.scene = new THREE.Scene();
            this.scene.background = new THREE.Color(fogColor);
            this.scene.fog = new THREE.Fog(fogColor, 5.5, 15);

            this.camera = new THREE.PerspectiveCamera(52, this._w / this._h, 0.05, 60);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(fogColor, 1);

            this.scene.add(new THREE.AmbientLight(0x3b3560, 0.55));

            // The reader's own lamp, hanging low over the cloth.
            this._lamp = new THREE.PointLight(0xffd9a0, 1.65, 9, 2);
            this._lamp.position.set(0, 2.3, 0.4);
            this.scene.add(this._lamp);

            const fill = new THREE.DirectionalLight(0x6a5cc0, 0.35);
            fill.position.set(-3, 4, 4);
            this.scene.add(fill);

            this._candleLights = [];
        }

        _track(obj) { this._disposables.push(obj); return obj; }
        _geo(g) { this._disposables.push(g); return g; }

        _mat(opts) {
            const m = new THREE.MeshLambertMaterial(opts);
            this._disposables.push(m);
            return m;
        }

        _canvasTexture(w, h, draw, repeatX, repeatY) {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            draw(canvas.getContext('2d'), w, h, this._rand);
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

        _fileTexture(name, repeat) {
            if (!THREE.TextureLoader) return null;
            const tex = new THREE.TextureLoader().load('img/textures/' + name);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            if (repeat) tex.repeat.set(repeat, repeat);
            this._disposables.push(tex);
            return tex;
        }

        //--- room -----------------------------------------------------------

        _buildRoom() {
            const floorTex = this._fileTexture('brown_stone.jpg', 8);
            const floor = new THREE.Mesh(
                this._geo(new THREE.CircleGeometry(9, 16)),
                this._mat({ map: floorTex, color: 0x4a4038 })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.y = -0.95;
            this.scene.add(floor);

            const wallTex = this._fileTexture('dark_brown_marble.jpg', 4);
            const wall = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(9, 9, 7, 14, 1, true)),
                this._mat({ map: wallTex, color: 0x3a3040, side: THREE.BackSide })
            );
            wall.position.y = 2.2;
            this.scene.add(wall);

            // Dust in the lamplight. Points cost one draw call and read as PSX
            // sprite haze once the downsample pass has had it.
            const count = 120;
            const positions = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                const a = this._rand() * Math.PI * 2;
                const r = 0.6 + this._rand() * 3.4;
                positions[i * 3] = Math.cos(a) * r;
                positions[i * 3 + 1] = 0.15 + this._rand() * 2.1;
                positions[i * 3 + 2] = Math.sin(a) * r;
            }
            const geo = this._geo(new THREE.BufferGeometry());
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const dustMat = new THREE.PointsMaterial({
                color: 0xffe0a8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false
            });
            this._disposables.push(dustMat);
            this._dust = new THREE.Points(geo, dustMat);
            this.scene.add(this._dust);
        }

        _buildTable() {
            const clothTex = this._canvasTexture(256, 256, (ctx, w, h, rand) => {
                ctx.fillStyle = '#2a0f21';
                ctx.fillRect(0, 0, w, h);
                // Velvet nap: thousands of one pixel flecks, no gradients.
                for (let i = 0; i < 5200; i++) {
                    const x = Math.floor(rand() * w);
                    const y = Math.floor(rand() * h);
                    const up = rand() > 0.5;
                    ctx.fillStyle = up ? 'rgba(96,32,72,0.28)' : 'rgba(12,4,14,0.32)';
                    ctx.fillRect(x, y, 1, 1);
                }
                const cx = w / 2, cy = h / 2;
                // Gilt zodiac ring with twelve stations.
                const ring = (r, color, width) => {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = width;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                };
                ring(w * 0.44, 'rgba(217,178,90,0.45)', 2);
                ring(w * 0.41, 'rgba(141,106,42,0.40)', 1);
                ring(w * 0.26, 'rgba(217,178,90,0.28)', 1);
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2;
                    const r1 = w * 0.415, r2 = w * 0.44;
                    ctx.strokeStyle = 'rgba(217,178,90,0.55)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
                    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
                    ctx.stroke();
                    // A blocky glyph at each station. At this resolution the
                    // shape matters more than the sign.
                    const gx = cx + Math.cos(a) * (w * 0.475) - 3;
                    const gy = cy + Math.sin(a) * (w * 0.475) - 3;
                    ctx.fillStyle = 'rgba(217,178,90,0.40)';
                    ctx.fillRect(gx, gy, 6, 1);
                    ctx.fillRect(gx + (i % 3), gy + 2, 3, 1);
                    ctx.fillRect(gx, gy + 4, 6, 1);
                }
                // Worn patches where hands have rested for decades.
                for (let i = 0; i < 8; i++) {
                    const x = rand() * w, y = rand() * h, r = 6 + rand() * 16;
                    ctx.fillStyle = 'rgba(140,72,104,0.10)';
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            const top = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.12, 28)),
                [
                    this._mat({ color: 0x3a1a12 }),
                    this._mat({ map: clothTex, color: 0xbfb0b8 }),
                    this._mat({ color: 0x1a0a12 })
                ]
            );
            top.position.y = -0.06;
            this.scene.add(top);

            // Carved skirt and a single heavy pedestal.
            const woodTex = this._fileTexture('golden_brown_leather.jpg', 6);
            const skirt = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(TABLE_R * 1.01, TABLE_R * 0.94, 0.22, 28, 1, true)),
                this._mat({ map: woodTex, color: 0x5a3a26 })
            );
            skirt.position.y = -0.22;
            this.scene.add(skirt);

            const column = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.34, 0.5, 0.72, 8)),
                this._mat({ map: woodTex, color: 0x4a3020 })
            );
            column.position.y = -0.69;
            this.scene.add(column);

            const foot = new THREE.Mesh(
                this._geo(new THREE.CylinderGeometry(0.95, 1.15, 0.16, 8)),
                this._mat({ map: woodTex, color: 0x3e281a })
            );
            foot.position.y = -0.87;
            this.scene.add(foot);
        }

        _buildProps() {
            const brass = this._mat({ color: 0x8a6a34, emissive: 0x1a1206 });
            const wax = this._mat({ color: 0xe8dcc0 });
            const flameMat = this._mat({ color: 0xffb04a, emissive: 0xff8c1a });

            this._flames = [];
            const candleAt = (x, z) => {
                const g = new THREE.Group();
                const dish = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 8)), brass);
                dish.position.y = 0.015;
                g.add(dish);
                const stick = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.05, 0.06, 0.36, 8)), wax);
                stick.position.y = 0.21;
                g.add(stick);
                const flame = new THREE.Mesh(this._geo(new THREE.ConeGeometry(0.035, 0.13, 5)), flameMat);
                flame.position.y = 0.45;
                g.add(flame);
                g.position.set(x, 0, z);
                this.scene.add(g);

                const light = new THREE.PointLight(0xffa64a, 1.15, 5.5, 2);
                light.position.set(x, 0.48, z);
                this.scene.add(light);
                this._candleLights.push({ light: light, base: 1.15, phase: this._rand() * 6.28 });
                this._flames.push(flame);
            };
            candleAt(-2.42, -1.12);
            candleAt(2.42, -1.12);

            // Crystal ball on the far edge, catching the lamp.
            const ballStand = new THREE.Mesh(this._geo(new THREE.TorusGeometry(0.14, 0.05, 5, 10)), brass);
            ballStand.rotation.x = Math.PI / 2;
            ballStand.position.set(0, 0.05, -2.42);
            this.scene.add(ballStand);

            const ballMat = this._mat({
                color: 0x7aa6d8, emissive: 0x1c3a66, transparent: true, opacity: 0.72
            });
            this._ball = new THREE.Mesh(this._geo(new THREE.SphereGeometry(0.2, 10, 7)), ballMat);
            this._ball.position.set(0, 0.24, -2.42);
            this.scene.add(this._ball);

            this._ballLight = new THREE.PointLight(0x66aaff, 0.6, 3.2, 2);
            this._ballLight.position.copy(this._ball.position);
            this.scene.add(this._ballLight);

            // Incense bowl, smouldering.
            const bowl = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 8)), brass);
            bowl.position.set(2.35, 0.06, 1.3);
            this.scene.add(bowl);

            const smokeCount = 26;
            const sp = new Float32Array(smokeCount * 3);
            this._smokeSeed = [];
            for (let i = 0; i < smokeCount; i++) {
                sp[i * 3] = 2.35; sp[i * 3 + 1] = 0.12; sp[i * 3 + 2] = 1.3;
                this._smokeSeed.push({ t: this._rand(), sway: this._rand() * 6.28 });
            }
            const sgeo = this._geo(new THREE.BufferGeometry());
            sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
            const smokeMat = new THREE.PointsMaterial({
                color: 0xb8b0c8, size: 0.07, transparent: true, opacity: 0.35, depthWrite: false
            });
            this._disposables.push(smokeMat);
            this._smoke = new THREE.Points(sgeo, smokeMat);
            this.scene.add(this._smoke);

            // Loose coins, scattered by the same world seed every visit.
            const coinMat = this._mat({ color: 0xa8873c, emissive: 0x201804 });
            for (let i = 0; i < 6; i++) {
                const a = this._rand() * Math.PI * 2;
                const r = 2.1 + this._rand() * 0.6;
                const coin = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 7)), coinMat);
                coin.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r + 0.9);
                coin.rotation.y = this._rand() * 3;
                this.scene.add(coin);
            }
        }

        _buildDeck() {
            this._backTex = this._canvasTexture(96, 160, drawCardBack);
            this._edgeMat = this._mat({ color: 0xe0d6b8 });
            this._backMat = this._mat({ map: this._backTex, color: 0xffffff });

            this.deckHome = { x: -2.32, y: 0.0, z: 1.28 };

            // The stack the reader shuffles and cuts, drawn as two halves so a
            // riffle can pull them apart.
            const stackGeo = this._geo(new THREE.BoxGeometry(CARD_W, CARD_T * 16, CARD_H));
            const stackMats = [
                this._edgeMat, this._edgeMat, this._backMat,
                this._edgeMat, this._edgeMat, this._edgeMat
            ];
            this._deckHalves = [];
            for (let i = 0; i < 2; i++) {
                const half = new THREE.Mesh(stackGeo, stackMats);
                half.position.set(this.deckHome.x, 0.11 + i * 0.115, this.deckHome.z);
                half.rotation.y = 0.18;
                this.scene.add(half);
                this._deckHalves.push(half);
            }
        }

        // A dashed halo that marks the card under the cursor on the cloth.
        _buildFocusRing() {
            const ring = new THREE.Mesh(
                this._geo(new THREE.RingGeometry(CARD_H * 0.55, CARD_H * 0.66, 16, 1)),
                this._mat({ color: 0xd9b25a, emissive: 0x6a4a10, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.008;
            ring.visible = false;
            this.scene.add(ring);
            this._focusRing = ring;
        }

        //--- cards ----------------------------------------------------------

        // Frame the whole spread, then remember it as the camera's home so a
        // recentre after free-look puts the working back on screen.
        setSpread(spread) {
            this.spread = spread;
            this.homeDist = clamp(2.1 + spread.radius * 1.45, 3.0, 7.2);
            this.dist = this.homeDist;
            this.homePitch = spread.count >= 7 ? 1.0 : 0.84;
            this.pitch = this.homePitch;
            this.yaw = 0;
            this.pan.x = this.pan.y = 0;
        }

        // Builds one card per slot, face down at the deck, ready to be dealt.
        // Art is loaded per card so a three card reading never pays for the
        // other nineteen textures.
        createCards(draws) {
            this.clearCards();
            draws.forEach((draw, i) => {
                const slot = this.spread.slots[i];
                const frontTex = this._loadArcana(draw.arcana);
                const frontMat = this._mat({ map: frontTex, color: 0xffffff });

                const geo = this._geo(new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H));
                const mesh = new THREE.Mesh(geo, [
                    this._edgeMat, this._edgeMat,
                    frontMat,                       // +Y, the face
                    this._backMat,                  // -Y, the back
                    this._edgeMat, this._edgeMat
                ]);
                mesh.rotation.y = draw.reversed ? Math.PI : 0;
                softPSX(() => {
                    if (window.PSXShader) window.PSXShader.applyToObject(mesh);
                });

                const flipG = new THREE.Group();
                flipG.rotation.z = Math.PI;     // face down until it is turned
                flipG.add(mesh);
                const tiltG = new THREE.Group();
                tiltG.add(flipG);
                const pivot = new THREE.Group();
                pivot.add(tiltG);
                const root = new THREE.Group();
                root.add(pivot);
                root.position.set(this.deckHome.x, 0.22, this.deckHome.z);
                this.scene.add(root);

                this._cards.push({
                    index: i,
                    arcana: draw.arcana,
                    reversed: draw.reversed,
                    label: slot.label,
                    root: root, pivot: pivot, tilt: tiltG, flip: flipG, mesh: mesh,
                    home: {
                        x: slot.x,
                        y: 0.008 + CARD_T / 2 + (slot.lift || 0),
                        z: slot.z,
                        yaw: slot.yaw || 0
                    },
                    dealT: 0, dealDelay: i * 0.13, dealing: false,
                    flipT: 0, flipping: false, revealed: false,
                    focusT: 0, spin: (this._rand() * 2 - 1) * 4
                });
            });
        }

        _loadArcana(arcana) {
            if (!THREE.TextureLoader) return null;
            const tex = new THREE.TextureLoader().load('img/arcana/' + arcana + '.png');
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
            else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            this._disposables.push(tex);
            return tex;
        }

        clearCards() {
            for (const card of this._cards) {
                if (card.root.parent) card.root.parent.remove(card.root);
            }
            this._cards = [];
        }

        get cards() { return this._cards; }

        beginDeal() {
            for (const card of this._cards) card.dealing = true;
        }

        isDealt() {
            return this._cards.length > 0 && this._cards.every(c => c.dealT >= 1);
        }

        revealCard(index) {
            const card = this._cards[index];
            if (!card || card.revealed || card.dealT < 1) return false;
            card.revealed = true;
            card.flipping = true;
            return true;
        }

        //--- animation ------------------------------------------------------

        // shuffleT runs 0..1 across the riffle; cutT flashes when the player
        // cuts the deck.
        setShuffle(t, cut) {
            this._shuffleT = t;
            this._cutT = cut || 0;
        }

        update(dt, focusIndex) {
            this._time += dt;
            this._animateAmbience(dt);
            this._animateDeck();
            this._animateCards(dt, focusIndex);
        }

        _animateAmbience(dt) {
            for (const c of this._candleLights) {
                c.phase += dt * (6 + Math.sin(this._time * 3.1) * 2);
                const flicker = 0.78 + Math.sin(c.phase) * 0.13 + Math.sin(c.phase * 2.7) * 0.09;
                c.light.intensity = c.base * flicker;
            }
            for (let i = 0; i < this._flames.length; i++) {
                const f = this._flames[i];
                f.scale.set(1, 0.86 + Math.sin(this._time * 9 + i) * 0.16, 1);
            }
            if (this._ball) {
                this._ball.rotation.y += dt * 0.25;
                const pulse = 0.5 + Math.sin(this._time * 1.3) * 0.18;
                if (this._ballLight) this._ballLight.intensity = pulse;
            }
            if (this._dust) this._dust.rotation.y += dt * 0.035;

            if (this._smoke) {
                const pos = this._smoke.geometry.attributes.position;
                for (let i = 0; i < this._smokeSeed.length; i++) {
                    const s = this._smokeSeed[i];
                    s.t += dt * 0.16;
                    if (s.t > 1) s.t -= 1;
                    const rise = s.t;
                    pos.array[i * 3] = 2.35 + Math.sin(s.sway + rise * 5) * rise * 0.22;
                    pos.array[i * 3 + 1] = 0.12 + rise * 1.5;
                    pos.array[i * 3 + 2] = 1.3 + Math.cos(s.sway + rise * 4) * rise * 0.16;
                }
                pos.needsUpdate = true;
            }
        }

        _animateDeck() {
            const t = this._shuffleT || 0;
            if (!this._deckHalves.length) return;
            // Three riffles across the phase, plus a slap when the halves meet.
            const beat = (t * 3) % 1;
            const spread = Math.sin(beat * Math.PI) * (t > 0 && t < 1 ? 1 : 0);
            for (let i = 0; i < 2; i++) {
                const dir = i === 0 ? -1 : 1;
                const half = this._deckHalves[i];
                half.position.x = this.deckHome.x + dir * spread * 0.34;
                half.position.y = 0.11 + i * 0.115 + spread * 0.16;
                half.rotation.z = dir * spread * 0.5;
                half.rotation.y = 0.18 + dir * spread * 0.22;
            }
            if (this._cutT > 0) {
                const c = this._cutT;
                this._deckHalves[1].position.y += c * 0.42;
                this._deckHalves[1].position.x += c * 0.3;
                this._deckHalves[1].rotation.z += c * 0.7;
            }
        }

        _animateCards(dt, focusIndex) {
            for (const card of this._cards) {
                // Deal: an arc from the deck to the slot, spinning as it goes.
                if (card.dealing && card.dealT < 1) {
                    card.dealDelay -= dt;
                    if (card.dealDelay <= 0) {
                        const wasFlying = card.dealT > 0;
                        card.dealT = clamp(card.dealT + dt / 0.46, 0, 1);
                        if (!wasFlying) playSe('Book2', 150, 45);
                        if (card.dealT >= 1) playSe('Book1', 165, 35);
                    }
                }
                const d = easeOut(card.dealT);
                const arc = Math.sin(clamp(card.dealT, 0, 1) * Math.PI) * 0.55;

                // Flip: a half turn about the card's long axis, lifted clear of
                // the cloth so it does not clip through its neighbours.
                if (card.flipping && card.flipT < 1) {
                    card.flipT = clamp(card.flipT + dt / 0.42, 0, 1);
                    if (card.flipT >= 1) card.flipping = false;
                }
                const f = easeInOut(card.flipT);

                const focused = card.index === focusIndex;
                const wantFocus = focused ? 1 : 0;
                card.focusT += (wantFocus - card.focusT) * clamp(dt * 7, 0, 1);
                // Only a turned card rises to be read; a face down one just hovers.
                const readT = card.focusT * (card.revealed ? 1 : 0);

                const hover = focused && !card.revealed
                    ? 0.035 + Math.sin(this._time * 4) * 0.012
                    : 0;

                card.root.position.x = lerp(this.deckHome.x, card.home.x, d);
                card.root.position.z = lerp(this.deckHome.z, card.home.z, d);
                card.root.position.y = lerp(0.22, card.home.y, d)
                    + arc
                    + hover
                    + Math.sin(f * Math.PI) * 0.3
                    + readT * (0.62 + this.dist * 0.05);

                const flightYaw = card.home.yaw + (1 - d) * card.spin;
                card.pivot.rotation.y = lerpAngle(flightYaw, this.yaw, readT);
                card.tilt.rotation.x = (Math.PI / 2 - this.pitch) * readT;
                card.flip.rotation.z = Math.PI * (1 - f);
                card.root.scale.setScalar(1 + readT * 0.12);
            }

            const ring = this._focusRing;
            if (ring) {
                const card = this._cards[focusIndex];
                ring.visible = !!card && card.dealT >= 1 && !card.revealed;
                if (ring.visible) {
                    ring.position.set(card.home.x, 0.008, card.home.z);
                    ring.rotation.z = this._time * 1.6;
                    const pulse = 0.55 + Math.sin(this._time * 5) * 0.25;
                    ring.material.opacity = pulse;
                }
            }
        }

        //--- camera ---------------------------------------------------------

        // Applies the player's orbit, pan and zoom on top of whatever the
        // reading is currently framing.
        applyCameraInput(input, dt) {
            if (input.pan) {
                this.pan.x = clamp(this.pan.x - input.x * dt * 2.6, -2.2, 2.2);
                this.pan.y = clamp(this.pan.y + input.y * dt * 2.0, -1.4, 1.8);
            } else {
                this.yaw -= input.x * dt * 2.2;
                this.pitch = clamp(this.pitch + input.y * dt * 1.5, 0.16, 1.42);
            }
            if (input.zoom) {
                this.dist = clamp(this.dist + input.zoom * dt * 6.0, 2.0, 9.0);
            }
            if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
            if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
        }

        recentreCamera() {
            this._recentre = true;
        }

        // targetPos is where the reading wants the camera pointed (the table,
        // or the card being turned); the player's pan rides on top of it.
        updateCamera(dt, targetPos) {
            if (this._recentre) {
                this._recentre = false;
                this.yaw = 0;
                this.pitch = this.homePitch || 0.86;
                this.dist = this.homeDist || 4.2;
                this.pan.x = this.pan.y = 0;
            }

            const t = targetPos || { x: 0, y: 0.1, z: 0 };
            const k = clamp(dt * 6, 0, 1);
            this.target.x += (t.x - this.target.x) * k;
            this.target.y += (t.y - this.target.y) * k;
            this.target.z += (t.z - this.target.z) * k;

            // Pan slides along the camera's own right vector and world up, so
            // dragging feels the same whichever way the table has been spun.
            const rightX = Math.cos(this.yaw);
            const rightZ = -Math.sin(this.yaw);
            const lx = this.target.x + rightX * this.pan.x;
            const ly = this.target.y + this.pan.y;
            const lz = this.target.z + rightZ * this.pan.x;

            const cp = Math.cos(this.pitch);
            const px = lx + Math.sin(this.yaw) * cp * this.dist;
            const py = ly + Math.sin(this.pitch) * this.dist;
            const pz = lz + Math.cos(this.yaw) * cp * this.dist;

            this._shake = Math.max(0, this._shake - dt * 2.2);
            const s = this._shake * 0.05;
            this.camera.position.set(
                px + (Math.random() - 0.5) * s,
                py + (Math.random() - 0.5) * s,
                pz
            );
            this.camera.lookAt(lx, ly, lz);
            this._lookAt = { x: lx, y: ly, z: lz };
        }

        shake(amount) {
            this._shake = Math.max(this._shake, amount);
        }

        // World position -> HUD virtual pixels, for the targeting brackets.
        projectToHud(x, y, z) {
            const v = new THREE.Vector3(x, y, z);
            v.project(this.camera);
            return {
                x: (v.x * 0.5 + 0.5) * hudW(),
                y: (-v.y * 0.5 + 0.5) * hudH(),
                visible: v.z < 1
            };
        }

        // Screen click -> the card under the cursor, or -1.
        pickCard(ndcX, ndcY) {
            if (!THREE.Raycaster || !this._cards.length) return -1;
            this._ray = this._ray || new THREE.Raycaster();
            this._ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
            const meshes = this._cards.map(c => c.mesh);
            const hits = this._ray.intersectObjects(meshes, false);
            if (!hits.length) return -1;
            const hit = hits[0].object;
            const card = this._cards.find(c => c.mesh === hit);
            return card ? card.index : -1;
        }

        render() {
            if (window.PSXShader) {
                softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }

        dispose() {
            this.clearCards();
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

    // The reverse of every card in the deck: gilt filigree on indigo, drawn
    // small so it stays chunky once it is nearest-filtered onto the mesh.
    function drawCardBack(ctx, w, h) {
        ctx.fillStyle = '#0e0a24';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#8d6a2a';
        ctx.fillRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = '#1b1546';
        ctx.fillRect(4, 4, w - 8, h - 8);
        ctx.strokeStyle = '#d9b25a';
        ctx.lineWidth = 1;
        ctx.strokeRect(7.5, 7.5, w - 15, h - 15);

        // Diamond lattice across the field.
        ctx.strokeStyle = 'rgba(141,106,42,0.55)';
        for (let y = 10; y < h - 10; y += 12) {
            for (let x = 10; x < w - 10; x += 12) {
                ctx.beginPath();
                ctx.moveTo(x + 6, y);
                ctx.lineTo(x + 12, y + 6);
                ctx.lineTo(x + 6, y + 12);
                ctx.lineTo(x, y + 6);
                ctx.closePath();
                ctx.stroke();
            }
        }

        // The eight pointed star of the reader's own guild.
        const cx = w / 2, cy = h / 2;
        const star = (r1, r2, rot, color) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const a = rot + (i / 16) * Math.PI * 2;
                const r = i % 2 === 0 ? r1 : r2;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        };
        star(30, 12, -Math.PI / 2, '#d9b25a');
        star(20, 8, 0, '#1b1546');
        ctx.fillStyle = '#d9b25a';
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0e0a24';
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();

        // Moons at head and foot.
        for (const my of [22, h - 22]) {
            ctx.fillStyle = '#8d6a2a';
            ctx.beginPath();
            ctx.arc(cx, my, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1b1546';
            ctx.beginPath();
            ctx.arc(cx + 2.5, my, 5.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    //=========================================================================
    // CameraRig - collects orbit / pan / zoom from mouse, keyboard and pad.
    //=========================================================================
    class CameraRig {
        constructor() {
            this._dragging = false;
            this._dragged = false;
            this._lastX = 0;
            this._lastY = 0;
            this._shiftHeld = false;
            this._shiftMoved = false;
            this.clickPick = -1;
            this.recentre = false;
        }

        // Returns { x, y, zoom, pan } in roughly normalized units per second.
        read() {
            const out = { x: 0, y: 0, zoom: 0, pan: false };
            const A = window.AnalogStickInput;

            // Modifier: SHIFT on the keyboard, X / square on a pad.
            const shift = Input.isPressed('shift');
            if (shift && !this._shiftHeld) this._shiftMoved = false;
            out.pan = shift;

            // Right stick orbits (or pans while the modifier is down), at the
            // speed and the handedness the controller layer keeps for every
            // camera in the game (window.Controller).
            const C = window.Controller;
            if (A) {
                const gain = C ? C.cameraSpeed() : 1;
                const invert = (C && C.invertCameraY()) ? -1 : 1;
                out.x += A.rightX() * 1.6 * gain;
                out.y -= A.rightY() * 1.6 * gain * invert;
                out.zoom += (A.leftTrigger() - A.rightTrigger()) * 1.4;
            }

            // Mouse: drag to look, wheel to zoom. A press that never travels
            // more than a few pixels stays a click, so cards remain selectable.
            if (TouchInput.isPressed()) {
                if (!this._dragging) {
                    this._dragging = true;
                    this._dragged = false;
                    this._lastX = TouchInput.x;
                    this._lastY = TouchInput.y;
                } else {
                    const dx = TouchInput.x - this._lastX;
                    const dy = TouchInput.y - this._lastY;
                    if (Math.abs(dx) + Math.abs(dy) > 3) this._dragged = true;
                    if (this._dragged) {
                        out.x += dx * 0.16;
                        out.y -= dy * 0.16;
                    }
                    this._lastX = TouchInput.x;
                    this._lastY = TouchInput.y;
                }
            } else if (this._dragging) {
                this._dragging = false;
                if (!this._dragged) {
                    this.clickPick = 1;      // consumed by the scene as a pick
                    this.clickX = this._lastX;
                    this.clickY = this._lastY;
                }
            }

            const wheel = TouchInput.wheelY || 0;
            if (wheel) out.zoom += clamp(wheel / 60, -3, 3) * 4;

            // L1 / R1 also step the zoom, for pads without analog triggers.
            if (Input.isPressed('pageup')) out.zoom += 1.1;
            if (Input.isPressed('pagedown')) out.zoom -= 1.1;

            if (Math.abs(out.x) + Math.abs(out.y) > 0.02) this._shiftMoved = true;

            // Tapping the modifier without moving the view puts it back home.
            if (this._shiftHeld && !shift && !this._shiftMoved) this.recentre = true;
            this._shiftHeld = shift;

            return out;
        }

        takeClick() {
            if (this.clickPick !== 1) return null;
            this.clickPick = -1;
            return { x: this.clickX, y: this.clickY };
        }

        takeRecentre() {
            if (!this.recentre) return false;
            this.recentre = false;
            return true;
        }
    }

    //=========================================================================
    // Scene_TarotBase - everything the two readings share: the table, the CRT
    // pass, the HUD layer, the camera rig and teardown.
    //=========================================================================
    class Scene_TarotBase extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._t = 0;
            this._threeReady = typeof THREE !== 'undefined';
            this._rig = new CameraRig();
            this._focusIndex = 0;
            this._banner = '';
            this._bannerT = 0;
            this._typed = 0;
            this._typeTarget = '';
        }

        create() {
            super.create();
            if (this._windowLayer) this._windowLayer.visible = false;
            if (this._cancelButton) this._cancelButton.visible = false;

            if (!this._threeReady) {
                this.createHudLayer();
                this._fatal = 'THREE.JS IS NOT LOADED';
                return;
            }
            this.createTable();
            this.createHudLayer();
            this.createAsciiLayer();
            if (window.MinigameFun) window.MinigameFun.played('Tarot Reading');
        }

        // A blurred map snapshot would only be a wasted upload behind an
        // opaque 3D view.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#050410');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createTable() {
            // Rendering a little below native and scaling up with nearest
            // filtering is the cheap option and keeps a period edge on the
            // artwork. Kept close to native: the cards carry readable pips.
            const scale = 0.88;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._table = new TarotTable3D(w, h);

            const texture = PIXI.Texture.from(this._table.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._tableSprite = new PIXI.Sprite(texture);
            this._tableSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._tableSprite, idx);
        }

        createHudLayer() {
            if (!window.PSXHud) return;
            this._hud = window.PSXHud.layer(hudW());
            this.addChild(this._hud.sprite);
            this._hudDom = window.PSXHud.domPanel(this._hud);
            hudDom = this._hudDom;
        }

        // One place to open and close the HTML type layer, so a subclass's paint
        // pass (and its early returns) never has to remember to.
        drawHud() {
            if (!this._hud) return;
            const bmp = this._hud.bitmap;
            bmp.clear();
            if (this._hudDom) this._hudDom.begin();
            this.paintHud(bmp);
            if (this._hudDom) this._hudDom.end();
        }

        paintHud(bmp) {}

        createAsciiLayer() {
            this._asciiSprite = new Sprite(new Bitmap(Graphics.width, Graphics.height));
            this._asciiSprite.bitmap.fontFace = 'Square';
            this._asciiSprite.bitmap.fontSize = 16;
            this._asciiSprite.visible = false;
            this.addChild(this._asciiSprite);
        }

        //--- shared per-frame work ------------------------------------------

        update() {
            super.update();
            const dt = 1 / 60;
            this._t += dt;

            if (this._fatal) {
                this.drawHud();
                if (Input.isTriggered('ok') || Input.isTriggered('cancel')) this.popScene();
                return;
            }

            this.updateCameraInput(dt);
            this.updatePhase(dt);

            if (this._bannerT > 0) {
                this._bannerT -= dt;
            }
            this.updateTypewriter(dt);

            this._table.update(dt, this.hoverIndex());
            this._table.updateCamera(dt, this.cameraTarget());

            const ascii = !!ConfigManager.asciiModeEnabled;
            if (this._tableSprite) this._tableSprite.visible = !ascii;
            if (this._hud) this._hud.sprite.visible = !ascii;
            if (this._asciiSprite) this._asciiSprite.visible = ascii;
            // The ascii pass paints its own frame and never calls drawHud, so the
            // HTML labels have to be parked by hand or they hang over it.
            if (ascii && this._hudDom) this._hudDom.clear();

            if (!ascii) {
                this._table.render();
                if (this._tableSprite && this._tableSprite.texture) this._tableSprite.texture.update();
                this.drawHud();
            } else {
                this.drawAscii();
            }
        }

        updateCameraInput(dt) {
            const input = this._rig.read();
            this._table.applyCameraInput(input, dt);
            if (this._rig.takeRecentre()) {
                this._table.recentreCamera();
                SoundManager.playCursor();
            }
            const click = this._rig.takeClick();
            if (click) this.onTableClick(click.x, click.y);
        }

        onTableClick(x, y) {
            const ndcX = (x / Graphics.width) * 2 - 1;
            const ndcY = -((y / Graphics.height) * 2 - 1);
            const picked = this._table.pickCard(ndcX, ndcY);
            if (picked >= 0) this.onCardPicked(picked);
        }

        // Subclass hooks.
        updatePhase() { }
        onCardPicked() { }
        hoverIndex() { return -1; }
        cameraTarget() { return { x: 0, y: 0.1, z: 0 }; }
        drawAscii() { }

        //--- shared HUD pieces ----------------------------------------------

        setBanner(text, seconds) {
            this._banner = text;
            this._bannerT = seconds == null ? 1.8 : seconds;
        }

        // Meanings arrive letter by letter; OK dumps the rest.
        startTyping(text) {
            this._typeTarget = String(text || '');
            this._typed = 0;
        }

        finishTyping() {
            if (this._typed < this._typeTarget.length) {
                this._typed = this._typeTarget.length;
                return true;
            }
            return false;
        }

        updateTypewriter(dt) {
            if (this._typed < this._typeTarget.length) {
                this._typed = Math.min(this._typeTarget.length, this._typed + dt * 62);
            }
        }

        typedText() {
            return this._typeTarget.slice(0, Math.floor(this._typed));
        }

        // The marquee across the top: one gold band, black lettering, a fan of
        // rays in each corner of the field below it.
        drawTitlePlate(bmp, left, right) {
            const w = hudW();
            const H = HUD();
            plate(bmp, 3, 3, w - 6, 15, {
                title: left, titleRight: right, headerH: 11, hairline: false, step: 1
            });
            if (H) {
                // Quarter fans hanging off the marquee, sweeping down and away
                // from each corner so they never reach back over the lettering.
                H.decoSunburst(bmp, 4, 19, 10, GOLD_LO, { from: 0, span: Math.PI / 2, rays: 4, dashed: false });
                H.decoSunburst(bmp, w - 5, 19, 10, GOLD_LO, { from: Math.PI / 2, span: Math.PI / 2, rays: 4, dashed: false });
            }
        }

        drawBanner(bmp) {
            if (!(this._bannerT > 0) || !this._banner) return;
            const w = hudW();
            const bw = Math.min(w - 40, 216);
            const bx = Math.floor((w - bw) / 2);
            const by = 26;
            plate(bmp, bx, by, bw, 19, { accent: GOLD, step: 2 });
            hudText(bmp, this._banner, bx, by + 4, bw, 'center', GOLD_HI, 8);
        }

        // The black strip that closes the HUD off at the bottom.
        drawControls(bmp) {
            const w = hudW();
            const y = hudH() - 13;
            bmp.fillRect(0, y, w, 13, DECO().black || '#08070b');
            bmp.fillRect(0, y, w, 1, GOLD_LO);
        }

        // Targeting brackets locked onto a card in screen space. This is the
        // one piece of HUD that has to be redrawn every frame, because it
        // tracks the camera.
        drawCardTracker(bmp, card, label, color) {
            if (!card || card.dealT < 0.85) return;
            const p = this._table.projectToHud(
                card.root.position.x, card.root.position.y + 0.05, card.root.position.z
            );
            if (!p.visible) return;
            const halfW = Math.round(26 + card.focusT * 10);
            const halfH = Math.round(40 + card.focusT * 16);
            const x = Math.round(p.x - halfW);
            const y = Math.round(p.y - halfH);
            brackets(bmp, x, y, halfW * 2, halfH * 2, color || GOLD, 8);
            if (label) {
                hudText(bmp, label, x - 20, y - 11, halfW * 2 + 40, 'center', color || GOLD, 8);
            }
        }

        drawPsiBox(bmp, x, y, w) {
            const h = 28;
            const psi = this.medianPartyPsi();
            plate(bmp, x, y, w, h, {
                title: 'PSI', titleRight: String(psi), headerH: 11, hairline: false, step: 1
            });
            const H = HUD();
            if (H) H.decoBar(bmp, x + 4, y + 15, w - 8, 9, clamp(psi / 20, 0, 1), { color: VIOLET });
        }

        medianPartyPsi() {
            const lucks = $gameParty.members().map(a => a.luk);
            if (!lucks.length) return 10;
            lucks.sort((a, b) => a - b);
            const mid = Math.floor(lucks.length / 2);
            return Math.round(lucks.length % 2 ? lucks[mid] : (lucks[mid - 1] + lucks[mid]) / 2);
        }

        drawFatal(bmp) {
            const w = hudW();
            const y = Math.floor(hudH() / 2) - 16;
            plate(bmp, 20, y, w - 40, 32, { accent: RED, accentLo: '#7a2c20' });
            hudText(bmp, this._fatal, 20, y + 10, w - 40, 'center', RED, 8);
        }

        //--- teardown --------------------------------------------------------

        terminate() {
            super.terminate();
            if (this._hudDom) {
                this._hudDom.destroy();
                if (hudDom === this._hudDom) hudDom = null;
                this._hudDom = null;
            }
            if (this._tableSprite) {
                if (this._tableSprite.parent) this._tableSprite.parent.removeChild(this._tableSprite);
                this._tableSprite.destroy();
                this._tableSprite = null;
            }
            if (this._table) {
                this._table.dispose();
                this._table = null;
            }
        }
    }

    //=========================================================================
    // Scene_Tarot - the solo reading.
    //=========================================================================
    class Scene_Tarot extends Scene_TarotBase {
        initialize() {
            super.initialize();
            this._phase = 'select';
            this._menuIndex = 0;
            this._shuffleT = 0;
            this._cutT = 0;
            this._cut = false;
            this._draws = [];
            this._synthesis = '';
        }

        create() {
            super.create();
            if (this._fatal) return;
            this._table.setSpread(SPREADS[0]);
        }

        //--- flow ------------------------------------------------------------

        updatePhase(dt) {
            switch (this._phase) {
                case 'select': return this.updateSelect();
                case 'shuffle': return this.updateShuffle(dt);
                case 'deal': return this.updateDeal();
                case 'read': return this.updateRead();
                case 'done': return this.updateDone();
            }
        }

        // RMMZ core already folds the LEFT stick into up/down/left/right, so
        // discrete navigation reads Input alone; adding AnalogStickInput's own
        // pulses here would move the cursor twice per flick.
        updateSelect() {
            const down = Input.isRepeated('down');
            const up = Input.isRepeated('up');
            if (down) {
                SoundManager.playCursor();
                this._menuIndex = (this._menuIndex + 1) % SPREADS.length;
                this._table.setSpread(SPREADS[this._menuIndex]);
            } else if (up) {
                SoundManager.playCursor();
                this._menuIndex = (this._menuIndex - 1 + SPREADS.length) % SPREADS.length;
                this._table.setSpread(SPREADS[this._menuIndex]);
            } else if (Input.isTriggered('ok')) {
                SoundManager.playOk();
                this.beginShuffle();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        beginShuffle() {
            this._spread = SPREADS[this._menuIndex];
            this._table.setSpread(this._spread);
            this._phase = 'shuffle';
            this._shuffleT = 0;
            this._cut = false;
            this._cutT = 0;
            this.setBanner('SHUFFLING THE ARCANA', 1.6);
            playSe('Book1', 90, 60);
        }

        updateShuffle(dt) {
            this._shuffleT += dt / 2.4;
            // A riffle every third of the phase; the shuffle sound rides along.
            const beat = Math.floor(this._shuffleT * 3);
            if (beat !== this._lastBeat) {
                this._lastBeat = beat;
                if (this._shuffleT < 1) playSe('Book1', 85 + beat * 12, 45);
            }
            // Cutting the deck is optional; the player who takes it gets the
            // flourish and a slightly different draw.
            if (!this._cut && Input.isTriggered('ok')) {
                this._cut = true;
                this._cutT = 0.001;
                playSe('Book2', 120, 70);
                this.setBanner('THE DECK IS CUT', 1.2);
                this._table.shake(0.6);
            }
            if (this._cut) this._cutT = Math.min(1, this._cutT + dt * 3);
            this._table.setShuffle(clamp(this._shuffleT, 0, 1), this._cutT > 0 ? Math.sin(this._cutT * Math.PI) : 0);

            if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            if (this._shuffleT >= 1) {
                this._table.setShuffle(0, 0);
                this.beginDeal();
            }
        }

        beginDeal() {
            this._draws = drawArcana(this._spread.count);
            this._table.createCards(this._draws);
            this._table.beginDeal();
            this._phase = 'deal';
            this._focusIndex = 0;
            this.setBanner('LAYING THE SPREAD', 1.4);
        }

        updateDeal() {
            if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
                return;
            }
            if (this._table.isDealt()) {
                this._phase = 'read';
                this.setBanner('TURN THE CARDS', 1.6);
            }
        }

        updateRead() {
            const count = this._table.cards.length;
            const next = Input.isRepeated('right') || Input.isRepeated('down');
            const prev = Input.isRepeated('left') || Input.isRepeated('up');

            if (next) {
                SoundManager.playCursor();
                this._focusIndex = (this._focusIndex + 1) % count;
                this.onFocusChanged();
            } else if (prev) {
                SoundManager.playCursor();
                this._focusIndex = (this._focusIndex - 1 + count) % count;
                this.onFocusChanged();
            } else if (Input.isTriggered('ok')) {
                if (this.finishTyping()) return;
                this.onCardPicked(this._focusIndex);
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        onFocusChanged() {
            const card = this._table.cards[this._focusIndex];
            if (card && card.revealed) {
                this.startTyping(card.prophecy);
            } else {
                this.startTyping('');
            }
        }

        onCardPicked(index) {
            if (this._phase !== 'read') return;
            const card = this._table.cards[index];
            if (!card) return;
            this._focusIndex = index;

            if (card.revealed) {
                // Already turned: re-read it rather than doing nothing.
                this.startTyping(card.prophecy);
                SoundManager.playCursor();
                return;
            }

            if (this._table.revealCard(index)) {
                card.prophecy = cardMeaning(card.arcana, card.reversed);
                playSe('Book1', 135, 80);
                playSe('Magic1', 130, 35);
                this._table.shake(0.5);
                this.startTyping(card.prophecy);
                this.setBanner(cardName(card.arcana).toUpperCase(), 1.4);

                if (this._table.cards.every(c => c.revealed)) {
                    this._synthesis = buildSynthesis(this._table.cards);
                    this._phase = 'done';
                    playSe('Bell3', 110, 55);
                }
            }
        }

        updateDone() {
            const count = this._table.cards.length;
            const next = Input.isRepeated('right') || Input.isRepeated('down');
            const prev = Input.isRepeated('left') || Input.isRepeated('up');
            if (next) {
                SoundManager.playCursor();
                this._focusIndex = (this._focusIndex + 1) % count;
                this.onFocusChanged();
            } else if (prev) {
                SoundManager.playCursor();
                this._focusIndex = (this._focusIndex - 1 + count) % count;
                this.onFocusChanged();
            } else if (Input.isTriggered('ok')) {
                this.finishTyping();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        //--- framing ---------------------------------------------------------

        hoverIndex() {
            return (this._phase === 'read' || this._phase === 'done') ? this._focusIndex : -1;
        }

        cameraTarget() {
            if (this._phase === 'select') return { x: 0, y: 0.1, z: 0 };
            if (this._phase === 'shuffle') {
                const d = this._table.deckHome;
                return { x: d.x * 0.55, y: 0.2, z: d.z * 0.55 };
            }
            const card = this._table.cards[this._focusIndex];
            if (card && card.revealed && card.focusT > 0.3) {
                // Ease toward the card being read without losing the spread.
                return {
                    x: card.home.x * 0.55,
                    y: 0.25,
                    z: card.home.z * 0.55
                };
            }
            return { x: 0, y: 0.1, z: 0 };
        }

        //--- HUD --------------------------------------------------------------

        paintHud(bmp) {
            if (this._fatal) { this.drawFatal(bmp); return; }

            if (this._phase === 'select') {
                this.drawSelectHud(bmp);
            } else {
                this.drawReadingHud(bmp);
            }
            this.drawBanner(bmp);
        }

        drawSelectHud(bmp) {
            const w = hudW();
            const H = HUD();
            this.drawTitlePlate(bmp, uiText('title'), uiText('chooseSpread'));

            // Wide enough that a blurb gets two full lines instead of being
            // guillotined mid-sentence, which is what a one line clamp did.
            const pw = Math.min(w - 20, 268);
            const px = Math.floor((w - pw) / 2);
            const py = 38;
            const rowH = 28;
            const listY = py + 14;
            const ph = 14 + SPREADS.length * rowH + 22;
            plate(bmp, px, py, pw, ph, { title: T('AnimatedTarotReading.ui.readerOffers'), headerH: 11 });

            SPREADS.forEach((spread, i) => {
                const y = listY + i * rowH;
                const on = i === this._menuIndex;
                if (on && H) H.decoSelect(bmp, px + 3, y - 1, pw - 6, rowH - 2, GOLD);
                if (on) hudText(bmp, '>', px + 7, y + 1, 10, 'left', GOLD_HI, 8, { raw: true });
                hudText(bmp, spread.name, px + 17, y + 1, pw - 66, 'left', on ? INK : DIMINK, 8);
                hudText(bmp, spread.count + ' CARDS', px + 17, y + 1, pw - 24, 'right',
                    on ? GOLD_HI : GOLD_LO, 8);
                const blurb = wrapLines(bmp, spread.blurb, pw - 30, 8);
                for (let l = 0; l < Math.min(2, blurb.length); l++) {
                    hudText(bmp, blurb[l], px + 17, y + 10 + l * 8, pw - 30, 'left',
                        on ? GOLD_DIM : FAINT, 8);
                }
            });

            const fy = py + ph - 20;
            rule(bmp, px + 6, fy, pw - 12, GOLD_LO);
            hudText(bmp, 'PSI ' + this.medianPartyPsi(), px + 6, fy + 4, pw - 12, 'left', GOLD_DIM, 8);
            hudText(bmp, 'READER  ' + ($gameParty.leader() ? $gameParty.leader().name() : 'NOBODY'),
                px + 6, fy + 4, pw - 12, 'right', VIOLET, 8);

            this.drawControls(bmp);
        }

        drawReadingHud(bmp) {
            const w = hudW();
            const cards = this._table.cards;
            const spread = this._spread;
            this.drawTitlePlate(bmp, spread.name, this._phase === 'done' ? uiText('readingComplete') : uiText('title'));

            // Left column: the positions and what has been turned. The plate is
            // cut to the longest name the deck can print, never narrower than it
            // used to be and never past about half the width, so THE HIGH PRIESTESS
            // reads whole instead of stopping a letter short of the marker. Type
            // stays on the 8px grid wherever the plate can be made wide enough;
            // only a screen too narrow for the language drops it a notch.
            const nameX = 24;
            const rGutter = 16;
            const capW = Math.floor(w * 0.52);
            const widest = widestCardName(bmp);
            let nameSize = 8;
            let need = nameX + widest + rGutter + 4;
            if (need > capW) {
                // A screen too narrow for this language's longest name at full
                // size: one notch down buys the whole name back.
                nameSize = 6;
                need = nameX + Math.ceil(widest * nameSize / 8) + rGutter + 2;
            }
            const lw = Math.max(Math.min(126, Math.floor(w * 0.33)), Math.min(capW, need));
            const ly = 22;
            // Rows shrink so that even a ten card working stops clear of the
            // meaning box across the bottom, whose lid is the one fixed line
            // this list has to respect.
            const boxTop = hudH() - MEANING_H - 16;
            const avail = boxTop - (ly + 15) - 6;
            const rowH = Math.max(9, Math.min(13, Math.floor(avail / Math.max(1, spread.count))));
            const lh = 21 + spread.count * rowH;
            plate(bmp, 3, ly, lw, lh, { title: T('AnimatedTarotReading.ui.layout'), headerH: 11 });

            cards.forEach((card, i) => {
                const y = ly + 15 + i * rowH;
                const on = i === this._focusIndex;
                if (on) HUD().decoSelect(bmp, 5, y - 1, lw - 10, rowH, GOLD);
                const shown = card.revealed
                    ? cardName(card.arcana).toUpperCase()
                    : '- - -';
                // Wide enough for a two digit position: the tenth card is the
                // one that would have run into the name.
                hudText(bmp, (i + 1) + '.', 9, y, 14, 'left', on ? GOLD_HI : GOLD_LO, 8);
                // The name stops clear of the reversed marker's gutter, so a
                // name that still has to be clipped can never read as if it
                // ended in an R.
                hudText(bmp, shown, nameX, y + Math.floor((8 - nameSize) / 2),
                    lw - nameX - rGutter, 'left',
                    card.revealed ? (on ? INK : DIMINK) : FAINT, nameSize);
                if (card.revealed && card.reversed) {
                    hudText(bmp, 'R', 8, y, lw - 15, 'right', RED, 8);
                }
            });

            // Right column: who is reading, and the state of the working.
            const rw = Math.min(88, Math.floor(w * 0.24));
            const rx = w - rw - 3;
            this.drawPsiBox(bmp, rx, ly, rw);

            const turned = cards.filter(c => c.revealed).length;
            plate(bmp, rx, ly + 32, rw, 28, {
                title: 'TURNED', titleRight: turned + '/' + cards.length, headerH: 11, hairline: false, step: 1
            });
            HUD().decoBar(bmp, rx + 4, ly + 47, rw - 8, 9,
                cards.length ? turned / cards.length : 0, { color: GOLD });

            // Brackets tracking the focused card out on the cloth.
            const focus = cards[this._focusIndex];
            if (focus) {
                this.drawCardTracker(bmp, focus, focus.label, focus.revealed ? GOLD : VIOLET);
            }

            // The meaning box across the bottom.
            this.drawMeaningBox(bmp, focus);

            this.drawControls(bmp);
        }

        drawMeaningBox(bmp, card) {
            const w = hudW();
            const bh = MEANING_H;
            const by = hudH() - bh - 16;

            if (!card) {
                plate(bmp, 3, by, w - 6, bh, { accent: GOLD_LO });
                return;
            }

            if (!card.revealed) {
                plate(bmp, 3, by, w - 6, bh, {
                    title: card.label, titleRight: 'FACE DOWN', headerH: 11, accent: GOLD_LO
                });
                hudText(bmp, 'THE CARD LIES FACE DOWN.',
                    8, by + 20, w - 16, 'left', DIMINK, 8);
                hudText(bmp, 'NOTHING IS DECIDED UNTIL IT IS SEEN.',
                    8, by + 32, w - 16, 'left', FAINT, 8);
                return;
            }

            const orient = card.reversed ? uiText('reversed') : uiText('upright');
            plate(bmp, 3, by, w - 6, bh, {
                title: ROMAN[card.arcana] + '  ' + cardName(card.arcana),
                titleRight: card.label + '  /  ' + orient,
                headerH: 11
            });

            // The prophecy, typed out. Once every card is turned the synthesis
            // takes the final line instead of a fourth line of meaning.
            const lines = wrapLines(bmp, this.typedText(), w - 22, 8);
            const maxLines = this._synthesis ? 3 : 4;
            for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
                hudText(bmp, lines[i], 9, by + 17 + i * 10, w - 18, 'left', INK, 8, { raw: true });
            }
            if (this._synthesis) {
                rule(bmp, 9, by + 48, w - 24, GOLD_LO);
                hudText(bmp, this._synthesis, 9, by + 51, w - 18, 'left', VIOLET, 8, { raw: true });
            }
        }

        //--- ASCII fallback ---------------------------------------------------

        drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            bmp.clear();
            bmp.textColor = '#c8f0d0';
            const ch = 18;
            let row = 1;
            const line = (s) => bmp.drawText(s, 12, ch * row++, Graphics.width - 24, ch, 'left');

            if (this._phase === 'select') {
                line('== TAROT READING ==');
                SPREADS.forEach((s, i) => {
                    line((i === this._menuIndex ? ' > ' : '   ') + s.name + '  (' + s.count + ')');
                });
                return;
            }
            line('== ' + this._spread.name + ' ==');
            this._table.cards.forEach((c, i) => {
                const mark = i === this._focusIndex ? '>' : ' ';
                const name = c.revealed
                    ? cardName(c.arcana) + (c.reversed ? ' (R)' : '')
                    : T('AnimatedTarotReading.ui.faceDown');
                line(mark + ' ' + c.label + ': ' + name);
            });
            line('');
            const focus = this._table.cards[this._focusIndex];
            if (focus && focus.revealed) {
                const words = String(focus.prophecy).split(' ');
                let buf = '';
                for (const wd of words) {
                    if ((buf + ' ' + wd).length > 62) { line(buf); buf = wd; }
                    else buf = buf ? buf + ' ' + wd : wd;
                }
                if (buf) line(buf);
            }
        }
    }

    //=========================================================================
    // Scene_TarotNPC - the same table, read to somebody else, with the
    // player guessing which meaning belongs to the card.
    //=========================================================================
    class Scene_TarotNPC extends Scene_TarotBase {
        prepare(npcData) {
            this._npcData = npcData;
        }

        initialize() {
            super.initialize();
            this._phase = 'shuffle';
            this._shuffleT = 0;
            this._cardIndex = 0;
            this._correct = 0;
            this._choices = [];
            this._choiceIndex = 0;
            this._committed = false;
            this._result = null;
            this._resultT = 0;
        }

        create() {
            super.create();
            // Fallback so a missing prepare() never leaves _npcData undefined.
            if (!this._npcData) {
                this._npcData = {
                    name: T('AnimatedTarotReading.npc.name'),
                    perfectMessage: T('AnimatedTarotReading.npc.perfect'),
                    goodMessage: T('AnimatedTarotReading.npc.good'),
                    averageMessage: T('AnimatedTarotReading.npc.average'),
                    poorMessage: T('AnimatedTarotReading.npc.poor')
                };
            }
            if (this._fatal) return;
            this._spread = SPREADS[0];
            this._table.setSpread(this._spread);
            this.setBanner('READING FOR ' + String(this._npcData.name).toUpperCase(), 2.0);
            playSe('Book1', 90, 60);
        }

        //--- flow -------------------------------------------------------------

        updatePhase(dt) {
            switch (this._phase) {
                case 'shuffle': return this.updateShuffle(dt);
                case 'deal': return this.updateDeal();
                case 'quiz': return this.updateQuiz(dt);
                case 'result': return this.updateResult(dt);
            }
        }

        updateShuffle(dt) {
            this._shuffleT += dt / 1.9;
            this._table.setShuffle(clamp(this._shuffleT, 0, 1), 0);
            if (this._shuffleT >= 1) {
                this._table.setShuffle(0, 0);
                this._draws = drawArcana(3);
                this._table.createCards(this._draws);
                this._table.beginDeal();
                this._phase = 'deal';
                this.setBanner('LAYING THE SPREAD', 1.2);
            }
        }

        updateDeal() {
            if (!this._table.isDealt()) return;
            this._phase = 'quiz';
            this._cardIndex = 0;
            this.beginCard();
        }

        // Turns the current card over and builds the three meanings to choose
        // between: the card's own, plus two belonging to other arcana.
        beginCard() {
            const card = this._table.cards[this._cardIndex];
            this._table.revealCard(this._cardIndex);
            playSe('Book1', 135, 80);
            this._table.shake(0.4);

            const correct = cardMeaning(card.arcana, card.reversed);
            card.prophecy = correct;

            const wrong = [];
            const used = [card.arcana];
            let attempts = 0;
            while (wrong.length < 2 && attempts < 120) {
                attempts++;
                const other = Math.floor(Math.random() * 22);
                if (used.includes(other)) continue;
                used.push(other);
                const meaning = cardMeaning(other, Math.random() < 0.5);
                // _tarotPool always returns a usable array (even before i18n
                // loads), so guard against every pool collapsing to the same
                // fallback and producing three identical choices.
                if (meaning !== correct && !wrong.includes(meaning)) wrong.push(meaning);
            }
            let filler = 1;
            while (wrong.length < 2) {
                const placeholder = T('AnimatedTarotReading.ui.unclearNumbered', { n: filler });
                if (placeholder !== correct && !wrong.includes(placeholder)) wrong.push(placeholder);
                filler++;
            }

            this._choices = [correct, wrong[0], wrong[1]];
            for (let i = this._choices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._choices[i], this._choices[j]] = [this._choices[j], this._choices[i]];
            }
            this._answer = this._choices.indexOf(correct);
            this._choiceIndex = 0;
            this._committed = false;
            this._result = null;
            this._resultT = 0;
            this.setBanner(cardName(card.arcana).toUpperCase(), 1.3);
        }

        updateQuiz(dt) {
            if (this._committed) {
                this._resultT += dt;
                if (this._resultT >= 1.6) {
                    this._cardIndex++;
                    if (this._cardIndex < this._table.cards.length) {
                        this.beginCard();
                    } else {
                        this._phase = 'result';
                        this._resultT = 0;
                        playSe('Bell3', 110, 55);
                    }
                }
                return;
            }

            const len = this._choices.length;
            if (Input.isRepeated('down')) {
                SoundManager.playCursor();
                this._choiceIndex = (this._choiceIndex + 1) % len;
            } else if (Input.isRepeated('up')) {
                SoundManager.playCursor();
                this._choiceIndex = (this._choiceIndex - 1 + len) % len;
            } else if (Input.isTriggered('ok')) {
                this.selectChoice(this._choiceIndex);
            }
        }

        selectChoice(index) {
            if (this._committed || this._phase !== 'quiz') return;
            this._committed = true;
            const right = index === this._answer;
            this._result = { index: index, correct: right };
            if (right) {
                this._correct++;
                SoundManager.playOk();
                playSe('Magic1', 120, 45);
            } else {
                SoundManager.playBuzzer();
                this._table.shake(1.0);
            }
        }

        // The 3D card is clickable during the quiz too, as a way to look at it
        // more closely; the answer is still chosen from the list.
        onCardPicked(index) {
            if (this._phase !== 'quiz') return;
            if (index === this._cardIndex) SoundManager.playCursor();
        }

        updateResult(dt) {
            this._resultT += dt;
            if (this._resultT > 0.6 && (Input.isTriggered('ok') || Input.isTriggered('cancel'))) {
                this.endReading();
            }
        }

        endReading() {
            let message;
            if (this._correct === 3) message = this._npcData.perfectMessage;
            else if (this._correct === 2) message = this._npcData.goodMessage;
            else if (this._correct === 1) message = this._npcData.averageMessage;
            else message = this._npcData.poorMessage;

            $gameMessage.setBackground(0);
            $gameMessage.setPositionType(2);

            window.skipLocalization = true;
            String(message).split('\n').forEach(line => $gameMessage.add(line));
            window.skipLocalization = false;

            this.popScene();
        }

        //--- framing -----------------------------------------------------------

        hoverIndex() {
            return (this._phase === 'quiz') ? this._cardIndex : -1;
        }

        cameraTarget() {
            if (this._phase === 'shuffle') {
                const d = this._table.deckHome;
                return { x: d.x * 0.55, y: 0.2, z: d.z * 0.55 };
            }
            const card = this._table.cards[this._cardIndex];
            if (this._phase === 'quiz' && card) {
                return { x: card.home.x * 0.5, y: 0.25, z: card.home.z * 0.5 };
            }
            return { x: 0, y: 0.1, z: 0 };
        }

        //--- HUD ----------------------------------------------------------------

        paintHud(bmp) {
            if (this._fatal) { this.drawFatal(bmp); return; }

            const w = hudW();
            this.drawTitlePlate(bmp,
                T('AnimatedTarotReading.ui.npcTitle', { name: String(this._npcData.name) }),
                this._correct + ' / 3 TRUE');

            // Score column.
            const rw = Math.min(88, Math.floor(w * 0.24));
            const rx = w - rw - 3;
            plate(bmp, rx, 22, rw, 28, { title: 'RESONANCE', headerH: 11, hairline: false, step: 1 });
            HUD().decoBar(bmp, rx + 4, 37, rw - 8, 9, this._correct / 3, { color: GOLD });
            this.drawPsiBox(bmp, rx, 54, rw);

            if (this._phase === 'result') {
                this.drawResultCard(bmp);
                this.drawBanner(bmp);
                this.drawControls(bmp);
                return;
            }

            const card = this._table.cards[this._cardIndex];
            if (card && this._phase === 'quiz') {
                this.drawCardTracker(bmp, card, card.label, GOLD);
                this.drawChoices(bmp, card);
            }

            this.drawBanner(bmp);
            this.drawControls(bmp);
        }

        drawChoices(bmp, card) {
            const w = hudW();
            const bh = 86;
            const by = hudH() - bh - 16;
            const orient = card.reversed ? uiText('reversed') : uiText('upright');
            plate(bmp, 3, by, w - 6, bh, {
                title: ROMAN[card.arcana] + '  ' + cardName(card.arcana) + '  /  ' + orient,
                titleRight: card.label,
                headerH: 11
            });

            const GREEN = '#93d86e';
            const rowH = 22;
            this._choices.forEach((choice, i) => {
                const y = by + 17 + i * rowH;
                const on = i === this._choiceIndex && !this._committed;
                let color = on ? INK : DIMINK;
                let accent = null;
                if (this._committed) {
                    if (i === this._answer) { color = GREEN; accent = GREEN; }
                    else if (this._result && i === this._result.index) { color = RED; accent = RED; }
                    else color = FAINT;
                }
                if (on || accent) HUD().decoSelect(bmp, 5, y - 2, w - 10, rowH - 2, accent || GOLD);
                const mark = accent ? (accent === GREEN ? '+' : 'X') : (on ? '>' : '.');
                hudText(bmp, mark, 9, y, 10, 'left', accent || GOLD_HI, 8, { raw: true });
                const lines = wrapLines(bmp, choice, w - 36, 8);
                hudText(bmp, lines[0] || '', 19, y, w - 28, 'left', color, 8, { raw: true });
                if (lines[1]) hudText(bmp, lines[1], 19, y + 9, w - 28, 'left', color, 8, { raw: true });
            });
        }

        drawResultCard(bmp) {
            const w = hudW();
            const pw = Math.min(w - 40, 252);
            const px = Math.floor((w - pw) / 2);
            const py = 68;
            const ph = 88;
            const H = HUD();
            plate(bmp, px, py, pw, ph, {
                title: T('AnimatedTarotReading.ui.readingDone'), titleAlign: 'center', headerH: 11
            });
            if (H) {
                H.decoSunburst(bmp, px + 1, py + 13, 12, GOLD_LO, { from: 0, span: Math.PI / 2, rays: 5, dashed: false });
                H.decoSunburst(bmp, px + pw - 2, py + 13, 12, GOLD_LO, { from: Math.PI, span: -Math.PI / 2, rays: 5, dashed: false });
            }

            const verdict = this._correct === 3 ? 'A TRUE SEER'
                : this._correct === 2 ? 'MOSTLY TRUE'
                    : this._correct === 1 ? 'HALF HEARD'
                        : 'THE SPIRITS WERE QUIET';
            hudText(bmp, verdict, px, py + 18, pw, 'center', GOLD_HI, 8);
            hudText(bmp, this._correct + ' OF 3 MEANINGS READ TRUE', px, py + 30, pw, 'center', DIMINK, 8);
            rule(bmp, px + 8, py + 44, pw - 16, GOLD_LO);

            this._table.cards.forEach((card, i) => {
                const y = py + 50 + i * 11;
                hudText(bmp, card.label, px + 9, y, pw - 18, 'left', DIMINK, 8);
                hudText(bmp, cardName(card.arcana).toUpperCase() + (card.reversed ? ' (R)' : ''),
                    px + 9, y, pw - 18, 'right', INK, 8);
            });
        }

        drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            bmp.clear();
            bmp.textColor = '#c8f0d0';
            const ch = 18;
            let row = 1;
            const line = (s) => bmp.drawText(s, 12, ch * row++, Graphics.width - 24, ch, 'left');
            line('== READING FOR ' + this._npcData.name + ' ==');
            line('CORRECT: ' + this._correct + ' / 3');
            line('');
            if (this._phase === 'quiz') {
                const card = this._table.cards[this._cardIndex];
                line(cardName(card.arcana) + (card.reversed ? ' (Reversed)' : ''));
                this._choices.forEach((c, i) => {
                    line((i === this._choiceIndex ? ' > ' : '   ') + c.slice(0, 60));
                });
            } else if (this._phase === 'result') {
                line(T('AnimatedTarotReading.ui.readingDone'));
            }
        }
    }

    //=========================================================================
    // Draw and synthesis
    //=========================================================================

    // A fresh shuffle of the Major Arcana, dealt off the top.
    function drawArcana(count) {
        const deck = Array.from({ length: 22 }, (_, i) => i);
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck.slice(0, count).map(arcana => ({
            arcana: arcana,
            reversed: Math.random() < 0.42
        }));
    }

    // One closing line drawn from the shape of the spread rather than any one
    // card: how much of it came up reversed, and what the working turns on.
    function buildSynthesis(cards) {
        const reversed = cards.filter(c => c.reversed).length;
        const ratio = reversed / Math.max(1, cards.length);
        const anchor = cards[cards.length - 1];
        const key = KEYWORD[anchor.arcana];
        let tone;
        if (ratio >= 0.66) tone = 'THE SPREAD RUNS AGAINST YOU';
        else if (ratio >= 0.34) tone = 'THE SPREAD IS DIVIDED';
        else if (reversed === 0) tone = 'THE SPREAD RUNS CLEAN';
        else tone = 'THE SPREAD RUNS WITH YOU';
        return tone + '. IT TURNS ON ' + key + '.';
    }

    //=========================================================================
    // Plugin commands
    //=========================================================================
    PluginManager.registerCommand(pluginName, 'openTarot', () => {
        SceneManager.push(Scene_Tarot);
    });

    PluginManager.registerCommand(pluginName, 'readTarotToNPC', args => {
        const npcData = {
            name: T.param(args.npcName, 'AnimatedTarotReading.npc.name'),
            perfectMessage: T.param(args.perfectMessage, 'AnimatedTarotReading.npc.perfectLong'),
            goodMessage: T.param(args.goodMessage, 'AnimatedTarotReading.npc.goodLong'),
            averageMessage: T.param(args.averageMessage, 'AnimatedTarotReading.npc.averageLong'),
            poorMessage: T.param(args.poorMessage, 'AnimatedTarotReading.npc.poorLong')
        };
        SceneManager.push(Scene_TarotNPC);
        // Pass data via prepareNextScene: SceneManager._scene is still the
        // OUTGOING scene right after push, so assigning to it would never
        // reach the new scene.
        SceneManager.prepareNextScene(npcData);
    });

    // Exposed for the title screen's minigame list and the split-screen
    // hot-seat registry, both of which look these up by name.
    window.Scene_Tarot = Scene_Tarot;
    window.Scene_TarotNPC = Scene_TarotNPC;
})();
