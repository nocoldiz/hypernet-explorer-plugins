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
 * js/i18n/<lang>/plugins/AnimatedTarotReading.json.
 *
 * Requires: Battler3D/PSXShader (loads earlier), js/libs/three.min.js.
 * Optional: Core/AnalogStickInput for stick and trigger camera control.
 *
 * The deck is also an item. A tarot deck in the backpack draws its own
 * buttons instead of Use, through <Actions: tarotRead, tarotPick,
 * tarotSpread> and the ItemActions registry:
 *   Read tarots   a three card reading for a chosen party member
 *   Pick a card   one card off a shuffled deck, upright or reversed
 *   Free spread   the deck loose on the table, under a physics solver:
 *                 drag cards about, turn them over, shuffle, cut, deal to
 *                 hand and lay them out, build a house of cards or
 *                 scramble the lot face down
 *
 * @command openTarot
 * @text Open Tarot Reading
 * @desc Opens the tarot card reading interface
 *
 * @command pickOneCard
 * @text Pick a Card
 * @desc Draws one card off a shuffled deck and reads what it means
 *
 * @command freeSpread
 * @text Free Spread
 * @desc Opens the deck on the table to be handled freely
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
    // The one card the pick turns over. It is never offered in the spread
    // menu, so it stands beside the list rather than in it, and is given the
    // same treatment by the loop below.
    const SINGLE_SPREAD = { id: 'single', slots: [{ x: 0, z: 0 }] };

    for (const spread of SPREADS.concat([SINGLE_SPREAD])) {
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
    // THE FREE SPREAD
    //
    // A sandbox rather than a reading: the whole deck is on the cloth and the
    // player handles it. Cards are thin boxes in a small rigid body solver
    // written for this table - there is no physics engine in the project, and
    // a house of cards only stands if friction and resting contacts are
    // answered properly, so this is a sequential impulse solver with Baumgarte
    // correction, two substeps a frame, and bodies that fall asleep once they
    // settle so a finished castle costs nothing to hold up.
    //
    // Units are the table's: a card is 0.62 x 1.04 and the cloth is at y=0.008.
    //=========================================================================
    const SAND_G = -9.4;             // gravity, table units per second squared
    const SAND_SUB = 2;              // physics substeps per frame
    const SAND_ITER = 8;             // solver iterations per substep
    const SAND_FRICTION = 0.92;      // card on card: high, and what holds a castle up
    const SAND_REST = 0.02;          // cards do not bounce
    const SAND_SLOP = 0.0015;        // penetration tolerated before it is pushed out
    const SAND_BAUM = 0.3;           // how hard penetration is corrected
    const SAND_SLEEP_T = 0.5;       // how long it has to be still before it sleeps
    const SAND_SLEEP_D = 0.0012;    // travel in a frame below which a card is still
    // A card resting on the cloth still carries one substep of gravity in its
    // velocity, because the contact that cancels it is found on the NEXT
    // substep. Anything slower than twice that is standing still.
    const SAND_SLEEP_V = Math.abs(SAND_G) / 60 / SAND_SUB * 2;
    const SAND_SLEEP_W = 0.35;
    const SAND_MARGIN = 0.004;      // cards are in contact a hair before they touch
    const SAND_WAKE_V = 0.22;       // speed a card has to carry to disturb a sleeping one
    const TABLE_Y = 0.008;           // the cloth
    const SAND_RIM = TABLE_R - 0.18; // the rim that keeps cards on the table

    // One card in the sandbox: a box body, with the mesh hung off it and told
    // where to be once a frame.
    class CardBody {
        constructor(arcana) {
            this.arcana = arcana;
            this.p = new THREE.Vector3(0, TABLE_Y + CARD_T, 0);
            this.q = new THREE.Quaternion();
            this.v = new THREE.Vector3();
            this.w = new THREE.Vector3();
            this.half = new THREE.Vector3(CARD_W / 2, CARD_T / 2, CARD_H / 2);
            // A card weighs next to nothing. The inertia is a box's, which is
            // what makes one stood on its edge topple the way it should.
            this.mass = 0.02;
            this.invMass = 1 / this.mass;
            const k = this.mass / 12;
            const x2 = (2 * this.half.x) ** 2;
            const y2 = (2 * this.half.y) ** 2;
            const z2 = (2 * this.half.z) ** 2;
            this.invI = new THREE.Vector3(
                1 / (k * (y2 + z2)),
                1 / (k * (x2 + z2)),
                1 / (k * (x2 + y2))
            );
            this.asleep = false;
            this.stillT = 0;
            this.held = false;      // the player has it under the cursor
            this.inDeck = false;    // stacked in the deck, out of the simulation
            this.inHand = false;    // held in hand, off the table entirely
            this.faceUp = false;
            this.reversed = false;
            this.mesh = null;
            this.root = null;
            this._m = new THREE.Matrix4();
            this.markPose();
        }

        // The three axes of the box in world space.
        axes() {
            this._m.makeRotationFromQuaternion(this.q);
            const e = this._m.elements;
            return [
                new THREE.Vector3(e[0], e[1], e[2]),
                new THREE.Vector3(e[4], e[5], e[6]),
                new THREE.Vector3(e[8], e[9], e[10])
            ];
        }

        corners() {
            const a = this.axes();
            const out = [];
            for (let sx = -1; sx <= 1; sx += 2) {
                for (let sy = -1; sy <= 1; sy += 2) {
                    for (let sz = -1; sz <= 1; sz += 2) {
                        out.push(new THREE.Vector3().copy(this.p)
                            .addScaledVector(a[0], sx * this.half.x)
                            .addScaledVector(a[1], sy * this.half.y)
                            .addScaledVector(a[2], sz * this.half.z));
                    }
                }
            }
            return out;
        }

        radius() { return this.half.length(); }

        wake() { this.asleep = false; this.stillT = 0; }

        // The pose at the end of the last frame, and how far this one moved
        // from it: a length in table units, with the turn counted as the arc
        // a corner of the card swept.
        markPose() {
            this._lastP = this._lastP || new THREE.Vector3();
            this._lastQ = this._lastQ || new THREE.Quaternion();
            this._lastP.copy(this.p);
            this._lastQ.copy(this.q);
        }

        poseDelta() {
            if (!this._lastP) return Infinity;
            const moved = this.p.distanceTo(this._lastP);
            const dot = Math.min(1, Math.abs(this.q.dot(this._lastQ)));
            const turn = 2 * Math.acos(dot);
            return moved + turn * this.radius();
        }

        simulated() { return !this.held && !this.inDeck && !this.inHand; }

        // What the solver may push around. A sleeping card holds up the one
        // resting on it exactly as the table does, which is what lets a
        // finished castle cost nothing to stand.
        movable() { return this.simulated() && !this.asleep; }

        // Velocity of a point given as an offset from the centre.
        pointVelocity(r) {
            return new THREE.Vector3().copy(this.w).cross(r).add(this.v);
        }

        // An impulse at r. A held card is immovable, which is what lets the
        // player press one card against another without the held one flying off.
        applyImpulse(j, r) {
            if (!this.movable()) return;
            this.v.addScaledVector(j, this.invMass);
            this.w.add(this.inverseInertiaTimes(new THREE.Vector3().copy(r).cross(j)));
        }

        // I^-1 * t, with the tensor taken in body space where it is diagonal.
        inverseInertiaTimes(t) {
            const inv = new THREE.Quaternion().copy(this.q).invert();
            const local = t.clone().applyQuaternion(inv);
            local.set(local.x * this.invI.x, local.y * this.invI.y, local.z * this.invI.z);
            return local.applyQuaternion(this.q);
        }
    }

    // The solver. Contacts are found by sampling the corners of each box
    // against the faces of the other, which is enough for shapes as flat as
    // these and keeps a leaning pair steady where a single point manifold
    // would jitter it apart.
    class CardPhysics {
        constructor() {
            this.bodies = [];
            this.contacts = [];
        }

        add(body) { this.bodies.push(body); return body; }
        clear() { this.bodies.length = 0; }

        step(dt) {
            const h = dt / SAND_SUB;
            for (let s = 0; s < SAND_SUB; s++) {
                this.integrate(h);
                this.collide();
                for (let i = 0; i < SAND_ITER; i++) this.solve(h);
            }
            this.separate();
            this.sleepPass(dt);
        }

        integrate(h) {
            for (const b of this.bodies) {
                if (b.asleep || !b.simulated()) continue;
                b.v.y += SAND_G * h;
                b.v.multiplyScalar(0.998);
                b.w.multiplyScalar(0.985);
                b.p.addScaledVector(b.v, h);
                // q += 0.5 * w * q, renormalised.
                const wq = new THREE.Quaternion(b.w.x * h * 0.5, b.w.y * h * 0.5, b.w.z * h * 0.5, 0);
                wq.multiply(b.q);
                b.q.set(b.q.x + wq.x, b.q.y + wq.y, b.q.z + wq.z, b.q.w + wq.w).normalize();
            }
        }

        collide() {
            this.contacts.length = 0;
            const live = this.bodies.filter(b => !b.inDeck && !b.inHand);
            for (const b of live) this.collideTable(b);
            for (let i = 0; i < live.length; i++) {
                for (let j = i + 1; j < live.length; j++) {
                    const a = live[i];
                    const c = live[j];
                    if (a.asleep && c.asleep) continue;
                    if (a.p.distanceTo(c.p) > a.radius() + c.radius()) continue;
                    this.collidePair(a, c);
                }
            }
        }

        // The cloth, and the rim that keeps the deck on a round table.
        collideTable(b) {
            const up = new THREE.Vector3(0, 1, 0);
            for (const corner of b.corners()) {
                // sep is the gap: positive is clear air, negative is overlap.
                const sep = corner.y - TABLE_Y;
                if (sep < SAND_MARGIN) {
                    this.contacts.push({
                        a: b, b: null, n: up, sep,
                        ra: new THREE.Vector3().subVectors(corner, b.p), rb: null
                    });
                }
                const radial = Math.hypot(corner.x, corner.z);
                if (radial > SAND_RIM - SAND_MARGIN) {
                    this.contacts.push({
                        a: b, b: null,
                        n: new THREE.Vector3(-corner.x, 0, -corner.z).normalize(),
                        sep: SAND_RIM - radial,
                        ra: new THREE.Vector3().subVectors(corner, b.p), rb: null
                    });
                }
            }
        }

        // The shallowest face of `box` that `point` lies inside, as a normal
        // pointing out of the box, or null when the point is outside it.
        static faceOf(box, point) {
            const rel = new THREE.Vector3().subVectors(point, box.p);
            const axes = box.axes();
            let best = null;
            for (let i = 0; i < 3; i++) {
                const d = rel.dot(axes[i]);
                const h = box.half.getComponent(i);
                if (Math.abs(d) > h) return null;
                const depth = h - Math.abs(d);
                if (!best || depth < best.depth) {
                    best = { depth, n: axes[i].clone().multiplyScalar(d >= 0 ? 1 : -1) };
                }
            }
            return best;
        }

        // Box against box, by separating axis. Fifteen axes are tried: the
        // three faces of each card and the nine cross products of their edges.
        // The shallowest one is the contact normal.
        //
        // Where a face wins, the manifold is the incident face of the other
        // card clipped against the sides of the reference face, which gives up
        // to four points: that is what makes a card lie flat on a stack, and
        // what makes the ridge of a leaning card bear properly under the flat
        // one laid across it. Where a cross product wins, the two cards meet
        // edge to edge - the apex of a pair in a house of cards - and the
        // contact is at the point the edges pass closest, laid twice along the
        // ridge when the edges run parallel so the pair cannot rack sideways.
        collidePair(a, c) {
            const ax = a.axes();
            const cx = c.axes();
            const offset = new THREE.Vector3().subVectors(c.p, a.p);
            const extent = (box, axes, n) =>
                Math.abs(n.dot(axes[0])) * box.half.x +
                Math.abs(n.dot(axes[1])) * box.half.y +
                Math.abs(n.dot(axes[2])) * box.half.z;

            let best = null;
            const consider = (n, kind, i, j) => {
                if (n.lengthSq() < 1e-10) return true;      // degenerate axis, skip it
                n.normalize();
                // The gap along this axis: positive is clear air between the
                // two cards, negative is overlap. The axis that matters is the
                // one where they are furthest apart (or least overlapped), and
                // a face is preferred over a cross product of the same gap
                // because a face manifold is the better behaved of the two.
                const gap = Math.abs(offset.dot(n)) - extent(a, ax, n) - extent(c, cx, n);
                if (gap > SAND_MARGIN) return false;        // far enough apart to ignore
                const score = gap + (kind === 'edge' ? 0 : 1e-4);
                if (!best || score > best.score) best = { score, gap, n: n.clone(), kind, i, j };
                return true;
            };

            for (let i = 0; i < 3; i++) if (!consider(ax[i].clone(), 'a', i, -1)) return;
            for (let j = 0; j < 3; j++) if (!consider(cx[j].clone(), 'c', -1, j)) return;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    if (!consider(new THREE.Vector3().crossVectors(ax[i], cx[j]), 'edge', i, j)) return;
                }
            }
            if (!best) return;

            // Every contact is written with the normal pointing the way the
            // FIRST card has to move to get out: that is what the solver
            // applies to a, and the reverse of what it applies to b, and it
            // is the same convention the cloth and the rim are written in.
            if (offset.dot(best.n) > 0) best.n.negate();

            if (best.kind === 'edge') this.edgeContact(a, c, ax, cx, best);
            else this.faceContact(a, c, ax, cx, best);
        }

        // The four corners of the face of `box` whose outward normal is
        // closest to `n`, in order around the face.
        static faceCorners(box, axes, n) {
            let axis = 0;
            let bestDot = -Infinity;
            let sign = 1;
            for (let i = 0; i < 3; i++) {
                const d = axes[i].dot(n);
                if (Math.abs(d) > bestDot) { bestDot = Math.abs(d); axis = i; sign = d >= 0 ? 1 : -1; }
            }
            const u = (axis + 1) % 3;
            const v = (axis + 2) % 3;
            const centre = box.p.clone().addScaledVector(axes[axis], sign * box.half.getComponent(axis));
            const hu = box.half.getComponent(u);
            const hv = box.half.getComponent(v);
            return {
                axis, sign,
                normal: axes[axis].clone().multiplyScalar(sign),
                points: [
                    centre.clone().addScaledVector(axes[u], hu).addScaledVector(axes[v], hv),
                    centre.clone().addScaledVector(axes[u], hu).addScaledVector(axes[v], -hv),
                    centre.clone().addScaledVector(axes[u], -hu).addScaledVector(axes[v], -hv),
                    centre.clone().addScaledVector(axes[u], -hu).addScaledVector(axes[v], hv)
                ],
                // Side planes of the face, each with its normal pointing OUT
                // of the face: the clipper keeps what lies behind them.
                sides: [
                    { n: axes[u].clone(), o: centre.clone().addScaledVector(axes[u], hu) },
                    { n: axes[u].clone().negate(), o: centre.clone().addScaledVector(axes[u], -hu) },
                    { n: axes[v].clone(), o: centre.clone().addScaledVector(axes[v], hv) },
                    { n: axes[v].clone().negate(), o: centre.clone().addScaledVector(axes[v], -hv) }
                ]
            };
        }

        // Sutherland-Hodgman: keep the part of the polygon on the inner side
        // of the plane, cutting the edges that cross it.
        static clipToPlane(points, planeN, planeO) {
            const out = [];
            for (let i = 0; i < points.length; i++) {
                const cur = points[i];
                const next = points[(i + 1) % points.length];
                const dc = planeN.dot(new THREE.Vector3().subVectors(cur, planeO));
                const dn = planeN.dot(new THREE.Vector3().subVectors(next, planeO));
                if (dc <= 0) out.push(cur.clone());
                if ((dc > 0) !== (dn > 0)) {
                    const t = dc / (dc - dn);
                    out.push(new THREE.Vector3().lerpVectors(cur, next, t));
                }
            }
            return out;
        }

        faceContact(a, c, ax, cx, best) {
            // The reference face belongs to whichever card owns the winning
            // axis; the incident face is the other card's face that most
            // directly opposes it.
            const refIsA = best.kind === 'a';
            const ref = refIsA ? a : c;
            const inc = refIsA ? c : a;
            const refAxes = refIsA ? ax : cx;
            const incAxes = refIsA ? cx : ax;
            // best.n is the way A has to move to get clear, so the face of the
            // reference card that is doing the bearing is the one looking at
            // the other card: away from A when A owns the axis, along it when
            // C does.
            const n = refIsA ? best.n.clone().negate() : best.n.clone();

            const refFace = CardPhysics.faceCorners(ref, refAxes, n);
            const incFace = CardPhysics.faceCorners(inc, incAxes, n.clone().negate());

            let poly = incFace.points.map(p => p.clone());
            for (const side of refFace.sides) {
                poly = CardPhysics.clipToPlane(poly, side.n, side.o);
                if (!poly.length) return;
            }

            const planeO = refFace.points[0];
            for (const point of poly) {
                // Each point carries its own gap to the reference face, so
                // a card resting at a slight angle is answered corner by
                // corner rather than by one averaged number.
                const sep = refFace.normal.dot(new THREE.Vector3().subVectors(point, planeO));
                if (sep > SAND_MARGIN) continue;
                // A card is a plate, so a clipped point can come out the far
                // side of it and read as an enormous penetration that no pair
                // of touching cards ever has. The separating axis has already
                // said how deep the two really are, and no point may claim to
                // be deeper than that.
                if (sep < best.gap - SAND_MARGIN) continue;
                // The contact normal is always written from A toward C, so the
                // solver never has to ask which card owned the reference face.
                this.contacts.push({
                    a, b: c,
                    n: best.n.clone(),
                    sep,
                    ra: new THREE.Vector3().subVectors(point, a.p),
                    rb: new THREE.Vector3().subVectors(point, c.p)
                });
            }
        }

        edgeContact(a, c, ax, cx, best) {
            const n = best.n;
            // Walk out to the edge of each box along the two axes that are not
            // the edge's own direction.
            const support = (box, axes, own, sign) => {
                const point = box.p.clone();
                for (let k = 0; k < 3; k++) {
                    if (k === own) continue;
                    const d = axes[k].dot(n) * sign;
                    point.addScaledVector(axes[k], (d >= 0 ? 1 : -1) * box.half.getComponent(k));
                }
                return point;
            };
            const pa = support(a, ax, best.i, 1);
            const pc = support(c, cx, best.j, -1);

            // Closest points of the two edge lines.
            const da = ax[best.i];
            const dc = cx[best.j];
            const r = new THREE.Vector3().subVectors(pa, pc);
            const dotAA = da.dot(da), dotCC = dc.dot(dc), dotAC = da.dot(dc);
            const denom = dotAA * dotCC - dotAC * dotAC;
            if (Math.abs(denom) < 1e-9) return;
            const ha = a.half.getComponent(best.i);
            const hc = c.half.getComponent(best.j);
            const ta = THREE.MathUtils.clamp((dotAC * dc.dot(r) - dotCC * da.dot(r)) / denom, -ha, ha);
            const tc = THREE.MathUtils.clamp((dotAA * dc.dot(r) - dotAC * da.dot(r)) / denom, -hc, hc);
            const point = pa.clone().addScaledVector(da, ta)
                .add(pc.clone().addScaledVector(dc, tc)).multiplyScalar(0.5);

            // Parallel ridges meet along a segment, not at a point. One contact
            // there would let a leaning pair fold sideways, so the manifold is
            // laid at both ends of the segment they share.
            const ridge = da.clone().normalize();
            const parallel = Math.abs(ridge.dot(dc.clone().normalize()));
            const spread = parallel > 0.98 ? Math.min(ha, hc) * 0.8 : 0;
            const points = spread > 0
                ? [point.clone().addScaledVector(ridge, -spread), point.clone().addScaledVector(ridge, spread)]
                : [point];

            for (const at of points) {
                this.contacts.push({
                    a, b: c, n: n.clone(), sep: best.gap,
                    ra: new THREE.Vector3().subVectors(at, a.p),
                    rb: new THREE.Vector3().subVectors(at, c.p)
                });
            }
        }

        // The mass a contact sees along `n`: the textbook
        // 1/m + (I^-1 (r x n)) x r . n, summed over both bodies.
        effectiveMass(a, b, ra, rb, n) {
            const part = (body, r) => {
                if (!body || !body.movable()) return 0;
                const rn = new THREE.Vector3().copy(r).cross(n);
                const angular = body.inverseInertiaTimes(rn).cross(r).dot(n);
                return body.invMass + angular;
            };
            return part(a, ra) + part(b, rb);
        }

        // Is this card doing something a sleeping neighbour should notice?
        static disturbs(body) {
            if (!body || body.asleep) return false;
            if (body.held) return true;
            if (!body.simulated()) return false;
            return body.v.length() > SAND_WAKE_V || body.w.length() > SAND_WAKE_V * 4;
        }

        // Two directions across the contact, so friction can be accumulated
        // along a fixed pair of axes instead of whichever way the card happened
        // to be sliding on the iteration that looked.
        static basis(n) {
            const helper = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            const t1 = new THREE.Vector3().crossVectors(n, helper).normalize();
            const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
            return [t1, t2];
        }

        // Sequential impulses, with the impulse at each contact ACCUMULATED
        // over the iterations. That accumulation is what makes friction mean
        // anything: Coulomb's limit is a fraction of the total normal force at
        // the contact, and an iteration's own small increment is nowhere near
        // it. Without this a leaning pair slides its feet out and the whole
        // castle sits down.
        solve(h) {
            for (const contact of this.contacts) {
                const { a, b, n, ra, rb } = contact;
                if (!contact.basis) {
                    contact.basis = CardPhysics.basis(n);
                    contact.jn = 0;
                    contact.jt = [0, 0];
                }
                const va = a.pointVelocity(ra);
                const vb = b ? b.pointVelocity(rb) : new THREE.Vector3();
                const rel = new THREE.Vector3().subVectors(va, vb);
                const vn = rel.dot(n);
                const eff = this.effectiveMass(a, b, ra, rb, n);
                if (eff <= 0) continue;
                // Where the cards already overlap, the contact pushes them
                // apart (gently, and only past the slop). Where they are a
                // hair short of touching it is a speculative contact: it may
                // take out exactly as much approach speed as would close the
                // gap this step, and no more, so a card set down on a castle
                // comes to rest against it instead of bouncing off thin air.
                // Overlap is not pushed out here: a velocity solver that
                // does that hands the stack energy it never had, and a
                // castle levitates. It is taken out of the POSITIONS after
                // the solve instead, which can only ever give ground back.
                const sep = contact.sep;
                const bias = sep > 0 ? -sep / h : 0;
                const wanted = (-(1 + SAND_REST) * vn + bias) / eff;
                const total = Math.max(0, contact.jn + wanted);
                const applied = total - contact.jn;
                contact.jn = total;
                // A sleeping card is woken by something ARRIVING, not by what
                // is already standing on it: a card thrown into a castle, or
                // one the player has hold of, brings the storey down, while
                // the weight of the storey above never does. A structure that
                // has settled therefore stays exactly as it was built until
                // it is disturbed, and the collapse spreads from card to card
                // as each one it topples starts moving in its turn.
                if (a.asleep && CardPhysics.disturbs(b)) a.wake();
                if (b && b.asleep && CardPhysics.disturbs(a)) b.wake();
                const impulse = new THREE.Vector3().copy(n).multiplyScalar(applied);
                a.applyImpulse(impulse, ra);
                if (b) b.applyImpulse(impulse.clone().negate(), rb);

                // Coulomb friction, bounded by the normal impulse the contact
                // has taken in total.
                const max = contact.jn * SAND_FRICTION;
                for (let k = 0; k < 2; k++) {
                    const tangent = contact.basis[k];
                    const effT = this.effectiveMass(a, b, ra, rb, tangent);
                    if (effT <= 0) continue;
                    const vt = new THREE.Vector3().subVectors(a.pointVelocity(ra),
                        b ? b.pointVelocity(rb) : new THREE.Vector3()).dot(tangent);
                    const wantT = -vt / effT;
                    const totalT = Math.max(-max, Math.min(max, contact.jt[k] + wantT));
                    const appliedT = totalT - contact.jt[k];
                    contact.jt[k] = totalT;
                    const friction = tangent.clone().multiplyScalar(appliedT);
                    a.applyImpulse(friction, ra);
                    if (b) b.applyImpulse(friction.clone().negate(), rb);
                }
            }
        }

        // Stillness is judged by how far a card actually travelled over the
        // frame, not by the velocity left on it: a card resting on the cloth
        // keeps one substep of gravity in v that the next contact cancels, so
        // a velocity test would hold the whole table awake forever.
        // What is left overlapping after the velocity solve is eased apart by
        // moving the cards themselves, in proportion to how light they are.
        // Nothing here touches a velocity, so the stack cannot gain energy.
        separate() {
            for (const contact of this.contacts) {
                if (contact.sep >= -SAND_SLOP) continue;
                const a = contact.a;
                const b = contact.b;
                const wa = a.movable() ? a.invMass : 0;
                const wb = (b && b.movable()) ? b.invMass : 0;
                const sum = wa + wb;
                if (sum <= 0) continue;
                const excess = Math.min(-contact.sep - SAND_SLOP, 0.02) * SAND_BAUM;
                a.p.addScaledVector(contact.n, excess * (wa / sum));
                if (b) b.p.addScaledVector(contact.n, -excess * (wb / sum));
            }
        }

        sleepPass(dt) {
            for (const b of this.bodies) {
                // A sleeping card is only ever roused by wake(), never by
                // this pass: a card that has just been PLACED - a castle
                // built, a deck restacked - has moved a long way since the
                // last frame without anything having happened to it.
                if (b.asleep || !b.simulated()) { b.stillT = 0; b.markPose(); continue; }
                const moved = b.poseDelta();
                b.markPose();
                // A card squeezed between two sleeping ones is shoved to
                // and fro by the separation pass without ever going
                // anywhere, so a slow enough card counts as still too.
                const crawling = b.v.length() < SAND_SLEEP_V && b.w.length() < SAND_SLEEP_W;
                if (moved < SAND_SLEEP_D || crawling) {
                    b.stillT += dt;
                    if (b.stillT > SAND_SLEEP_T) {
                        b.asleep = true;
                        b.v.set(0, 0, 0);
                        b.w.set(0, 0, 0);
                    }
                } else {
                    b.stillT = 0;
                    b.asleep = false;
                }
            }
        }

        // Everything settled. The castle counts itself built once this is true.
        atRest() { return this.bodies.every(b => b.asleep || !b.simulated()); }
    }

    // The sandbox stage: the parlour and the table of the reading, with the
    // spread machinery left idle and a loose deck of bodies on the cloth
    // instead. TarotTable3D animates this._cards toward their slots, so the
    // free cards are kept in a list of its own and nothing fights over them.
    class SandboxTable3D extends TarotTable3D {
        constructor(width, height) {
            super(width, height);
            this.physics = new CardPhysics();
            this.free = [];
            this._buildFreeDeck();
        }

        _buildFreeDeck() {
            for (let arcana = 0; arcana < tarotKeys.length; arcana++) {
                const body = new CardBody(arcana);
                body.reversed = this._rand() < 0.42;
                const frontMat = this._mat({ map: this._loadArcana(arcana), color: 0xffffff });
                const geo = this._geo(new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H));
                const mesh = new THREE.Mesh(geo, [
                    this._edgeMat, this._edgeMat,
                    frontMat,            // +Y, the face
                    this._backMat,       // -Y, the back
                    this._edgeMat, this._edgeMat
                ]);
                softPSX(() => {
                    if (window.PSXShader) window.PSXShader.applyToObject(mesh);
                });
                const root = new THREE.Group();
                root.add(mesh);
                this.scene.add(root);
                body.mesh = mesh;
                body.root = root;
                this.physics.add(body);
                this.free.push(body);
            }
            this.gatherToDeck(true);
        }

        get deckCards() { return this.free.filter(b => b.inDeck); }
        get handCards() { return this.free.filter(b => b.inHand); }
        get tableCards() { return this.free.filter(b => !b.inDeck && !b.inHand); }

        // Where the deck stands, and how high a given position in it sits.
        deckAnchor() { return { x: this.deckHome.x, z: this.deckHome.z }; }

        // Every card back in one square stack, face down. `instant` skips the
        // settle and is what the table is first drawn with.
        gatherToDeck(instant) {
            const anchor = this.deckAnchor();
            const deck = this.free.slice();
            deck.forEach((body, i) => {
                body.inDeck = true;
                body.inHand = false;
                body.held = false;
                body.faceUp = false;
                body.deckOrder = i;
                body.v.set(0, 0, 0);
                body.w.set(0, 0, 0);
                body.p.set(anchor.x, TABLE_Y + CARD_T / 2 + i * CARD_T, anchor.z);
                body.q.identity();
                body.asleep = true;
            });
            if (instant) this.syncMeshes();
        }

        // Fisher-Yates over the deck order, which is the only thing a shuffle
        // is: the stack looks the same, the order under it does not.
        shuffleDeck() {
            const deck = this.deckCards;
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(this._rand() * (i + 1));
                const t = deck[i].deckOrder;
                deck[i].deckOrder = deck[j].deckOrder;
                deck[j].deckOrder = t;
            }
            this.restackDeck();
            return deck.length;
        }

        // A cut: the top half lifted off and set down beside the bottom half,
        // then dropped back on top, which is how the order actually changes.
        cutDeck() {
            const deck = this.deckCards.sort((a, b) => a.deckOrder - b.deckOrder);
            if (deck.length < 2) return 0;
            const at = Math.floor(deck.length * (0.35 + this._rand() * 0.3));
            const bottom = deck.slice(0, at);
            const top = deck.slice(at);
            top.concat(bottom).forEach((body, i) => { body.deckOrder = i; });
            this.restackDeck();
            return at;
        }

        restackDeck() {
            const anchor = this.deckAnchor();
            this.deckCards.sort((a, b) => a.deckOrder - b.deckOrder).forEach((body, i) => {
                body.p.set(anchor.x, TABLE_Y + CARD_T / 2 + i * CARD_T, anchor.z);
                body.q.identity();
                body.faceUp = false;
                body.asleep = true;
            });
        }

        // The top card of the deck, which is the one a click on the stack takes.
        topOfDeck() {
            const deck = this.deckCards;
            if (!deck.length) return null;
            return deck.reduce((best, b) => (!best || b.deckOrder > best.deckOrder ? b : best), null);
        }

        drawToHand() {
            const card = this.topOfDeck();
            if (!card) return null;
            card.inDeck = false;
            card.inHand = true;
            card.faceUp = true;
            return card;
        }

        // Laying a card from the hand onto the cloth at a point, face up and
        // flat, with a little drop so it settles against whatever is there.
        placeFromHand(card, x, z) {
            if (!card || !card.inHand) return false;
            card.inHand = false;
            card.inDeck = false;
            card.faceUp = true;
            card.p.set(x, TABLE_Y + CARD_T * 3, z);
            card.q.identity();
            if (card.faceUp) card.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0);
            card.v.set(0, -0.2, 0);
            card.w.set(0, 0, 0);
            card.wake();
            this.wakeAround(card);
            return true;
        }

        // Anything near a card the player has just touched is roused, so
        // pulling one out from under a castle brings the castle down instead
        // of leaving it standing on nothing.
        wakeAround(body, radius) {
            if (!body) return 0;
            const r = radius || CARD_H * 1.6;
            let woken = 0;
            for (const other of this.free) {
                if (other === body || !other.simulated() || !other.asleep) continue;
                if (other.p.distanceTo(body.p) > r) continue;
                other.wake();
                woken++;
            }
            return woken;
        }

        flipCard(card) {
            if (!card || card.inDeck || card.inHand) return false;
            card.faceUp = !card.faceUp;
            const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
            card.q.multiply(flip);
            card.p.y += CARD_T;
            card.wake();
            this.wakeAround(card);
            return true;
        }

        // Every card out of the deck, face down, thrown about the cloth: the
        // scramble. Positions are kept inside the rim and off the deck itself.
        scramble() {
            const cards = this.free.filter(b => !b.inHand);
            cards.forEach((body) => {
                body.inDeck = false;
                body.held = false;
                body.faceUp = false;
                const angle = this._rand() * Math.PI * 2;
                const radius = this._rand() * (SAND_RIM - CARD_H * 0.6);
                body.p.set(Math.cos(angle) * radius, TABLE_Y + CARD_T / 2 + this._rand() * 0.5, Math.sin(angle) * radius);
                // Face down: the back is -Y, so a half turn about Z presents it.
                body.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
                body.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._rand() * Math.PI * 2));
                body.v.set((this._rand() - 0.5) * 0.4, 0, (this._rand() - 0.5) * 0.4);
                body.w.set(0, (this._rand() - 0.5) * 2, 0);
                body.wake();
            });
            return cards.length;
        }

        // A house of cards from everything on the table. Each storey is a row
        // of leaning pairs with a flat card spanning every neighbouring pair;
        // the storey above is one pair shorter. Cards are placed at rest and
        // the solver holds them there, so it stands until something hits it.
        buildCastle() {
            const cards = this.free.filter(b => !b.inHand);
            if (cards.length < 2) return { levels: 0, used: 0 };
            cards.forEach(b => { b.inDeck = false; b.held = false; b.faceUp = this._rand() < 0.5; });

            // A card stood on edge is turned about Z, so the side that ends up
            // vertical is its WIDTH and its long side lies flat along Z: that
            // is how a real house of cards is built, each pair a wide A facing
            // the player. The apex of a pair is the card's width foreshortened
            // by the lean.
            const LEAN = 0.30;                            // radians off vertical
            const storeyH = Math.cos(LEAN) * CARD_W;      // how tall one A stands
            const footHalf = Math.sin(LEAN) * CARD_W / 2; // its centre, off the apex
            // The two tops are set to just touch. The solver keeps a contact
            // margin, so a card that touches is a card that bears.
            const apexBite = 0.0;
            // Pairs are pitched closer together than a card is long, so the
            // flat span laid over two of them has a bearing at each end.
            const pairW = CARD_H * 0.82;
            const pool = cards.slice();
            let used = 0;
            let levels = 0;

            // How many pairs the base can be: each storey costs its pairs plus
            // the spans under the storey above, and the whole row has to fit
            // between the rims.
            let pairs = 1;
            while (this.castleCost(pairs + 1) <= pool.length && (pairs + 1) * pairW < SAND_RIM * 1.7) pairs++;

            let y = TABLE_Y;
            for (let level = pairs; level >= 1; level--) {
                const width = level * pairW;
                const x0 = -width / 2 + pairW / 2;
                for (let i = 0; i < level; i++) {
                    const cx = x0 + i * pairW;
                    for (const side of [-1, 1]) {
                        const body = pool.pop();
                        if (!body) return this.finishCastle(levels, used);
                        // The card on the left leans right and the one on the
                        // right leans left, so the two tops meet over cx.
                        body.p.set(cx - side * (footHalf - apexBite), y + storeyH / 2, 0);
                        body.q.setFromEuler(new THREE.Euler(0, 0, side * (Math.PI / 2 - LEAN)));
                        body.v.set(0, 0, 0);
                        body.w.set(0, 0, 0);
                        body.asleep = true;
                        used++;
                    }
                }
                levels++;
                // Every layer is set a hair into the one below it, for the
                // same reason the two tops of a pair are.
                y += storeyH - apexBite;
                // The flat span the next storey stands on, one per gap.
                if (level > 1) {
                    for (let i = 0; i < level - 1; i++) {
                        const body = pool.pop();
                        if (!body) return this.finishCastle(levels, used);
                        body.p.set(x0 + i * pairW + pairW / 2, y + CARD_T / 2, 0);
                        body.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
                        body.v.set(0, 0, 0);
                        body.w.set(0, 0, 0);
                        body.asleep = true;
                        used++;
                    }
                    y += CARD_T - apexBite;
                }
            }
            // Whatever is left over is laid flat out of the way rather than
            // left standing wherever it happened to be.
            pool.forEach((body, i) => {
                const angle = (i / Math.max(1, pool.length)) * Math.PI * 2;
                body.p.set(Math.cos(angle) * (SAND_RIM - CARD_H * 0.6), TABLE_Y + CARD_T / 2, Math.sin(angle) * (SAND_RIM - CARD_H * 0.6));
                body.q.identity();
                body.v.set(0, 0, 0);
                body.w.set(0, 0, 0);
                body.asleep = true;
            });
            return this.finishCastle(levels, used);
        }

        // Cards a castle of this many base pairs needs: two per pair on every
        // storey, plus a span across each gap under the storey above.
        castleCost(basePairs) {
            let total = 0;
            for (let level = basePairs; level >= 1; level--) {
                total += level * 2;
                if (level > 1) total += level - 1;
            }
            return total;
        }

        finishCastle(levels, used) { return { levels, used }; }

        // The card under the cursor, deck included, or null.
        pickBody(ndcX, ndcY) {
            if (!THREE.Raycaster) return null;
            this._ray = this._ray || new THREE.Raycaster();
            this._ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
            const meshes = this.free.filter(b => !b.inHand).map(b => b.mesh);
            const hits = this._ray.intersectObjects(meshes, false);
            if (!hits.length) return null;
            const body = this.free.find(b => b.mesh === hits[0].object);
            return body ? { body, point: hits[0].point } : null;
        }

        // Where a ray through the cursor meets the cloth: where a card in hand
        // is laid down, and where a held one is dragged to.
        pickCloth(ndcX, ndcY, height) {
            if (!THREE.Raycaster) return null;
            this._ray = this._ray || new THREE.Raycaster();
            this._ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(height !== undefined ? height : TABLE_Y));
            const hit = new THREE.Vector3();
            if (!this._ray.ray.intersectPlane(plane, hit)) return null;
            const radial = Math.hypot(hit.x, hit.z);
            if (radial > SAND_RIM) {
                hit.x *= SAND_RIM / radial;
                hit.z *= SAND_RIM / radial;
            }
            return hit;
        }

        // The mesh follows the body, and a card in hand is parked out of sight
        // under the table rather than being added and removed from the scene.
        syncMeshes() {
            for (const body of this.free) {
                if (!body.root) continue;
                if (body.inHand) {
                    body.root.visible = false;
                    continue;
                }
                body.root.visible = true;
                body.root.position.copy(body.p);
                body.root.quaternion.copy(body.q);
            }
        }

        update(dt, focusIndex) {
            super.update(dt, focusIndex);
            this.physics.step(dt);
            this.syncMeshes();
        }
    }

    // The buttons across the foot of the free spread. Ids are matched in
    // pressButton; the faces are translated.
    // i18n-ignore-start  button ids, never printed
    const SAND_BUTTONS = ['shuffle', 'cut', 'castle', 'scramble', 'gather'];
    // i18n-ignore-end

    class Scene_TarotSandbox extends Scene_TarotBase {
        initialize() {
            super.initialize();
            this._buttonIndex = 0;
            this._grab = null;
            this._press = null;
            this._handIndex = 0;
            this._heldHand = null;
            this._status = '';
            this._statusT = 0;
        }

        create() {
            super.create();
            if (this._fatal) return;
            // The spread machinery is idle here, but the camera still asks the
            // spread how far back to stand.
            this._spread = SPREADS[0];
            this._table.setSpread(this._spread);
            this._table.dist = 5.0;
            this._table.homeDist = 5.0;
            this.setBanner(uiText('sandboxTitle').toUpperCase(), 2.2);
            playSe('Book1', 90, 60);
        }

        createTable() {
            const scale = 0.88;
            const w = Math.round(Graphics.width * scale);
            const h = Math.round(Graphics.height * scale);
            this._table = new SandboxTable3D(w, h);
            // The decorative stack belongs to the reading; here the deck is
            // made of real cards and the prop would sit inside them.
            if (this._table._deckHalves) this._table._deckHalves.forEach(m => { m.visible = false; });

            const texture = PIXI.Texture.from(this._table.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._tableSprite = new PIXI.Sprite(texture);
            this._tableSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._tableSprite, idx);
        }

        //--- input ------------------------------------------------------------

        // The sandbox answers the pointer itself: a press on a card takes hold
        // of it, a press anywhere else is the camera's to orbit.
        updateCameraInput(dt) {
            if (this._statusT > 0) this._statusT -= dt;
            this.updateButtonInput();

            if (this._grab) { this.updateGrab(); return; }

            if (TouchInput.isTriggered()) {
                const x = TouchInput.x;
                const y = TouchInput.y;
                if (this.hitButton(x, y)) return;
                if (this.hitHand(x, y)) return;
                const hit = this.pickAt(x, y);
                if (hit) {
                    this._press = { body: hit.body, x, y, t: 0, moved: false };
                    return;
                }
            }
            if (this._press) {
                this._press.t += dt;
                const moved = Math.abs(TouchInput.x - this._press.x) + Math.abs(TouchInput.y - this._press.y);
                if (TouchInput.isPressed() && moved > 4) {
                    this.beginGrab(this._press.body);
                    this._press = null;
                    return;
                }
                if (!TouchInput.isPressed()) {
                    // A press that never travelled: the deck deals a card into
                    // the hand, a card on the cloth turns over.
                    const body = this._press.body;
                    this._press = null;
                    if (body.inDeck) this.drawCard();
                    else { this._table.flipCard(body); playSe('Book2', 140, 45); }
                    return;
                }
                return;
            }
            super.updateCameraInput(dt);
        }

        // The base class reads a click as a pick into the spread, which the
        // sandbox has no use for.
        onTableClick() { }

        pickAt(x, y) {
            const ndcX = (x / Graphics.width) * 2 - 1;
            const ndcY = -((y / Graphics.height) * 2 - 1);
            return this._table.pickBody(ndcX, ndcY);
        }

        clothAt(x, y, height) {
            const ndcX = (x / Graphics.width) * 2 - 1;
            const ndcY = -((y / Graphics.height) * 2 - 1);
            return this._table.pickCloth(ndcX, ndcY, height);
        }

        beginGrab(body) {
            if (!body) return;
            if (body.inDeck) {
                // Dragging off the stack takes the card with you.
                body.inDeck = false;
            }
            body.held = true;
            body.inHand = false;
            body.wake();
            const lift = TABLE_Y + CARD_H * 0.55;
            this._table.wakeAround(body);
            this._grab = { body, lift, last: body.p.clone(), vel: new THREE.Vector3() };
            playSe('Book2', 150, 40);
        }

        updateGrab() {
            const grab = this._grab;
            const body = grab.body;
            if (!TouchInput.isPressed()) {
                body.held = false;
                // Let go with the speed it was moving at, so a card can be
                // thrown across the cloth or set down gently.
                body.v.copy(grab.vel).multiplyScalar(0.6);
                body.wake();
                this._grab = null;
                return;
            }
            const point = this.clothAt(TouchInput.x, TouchInput.y, grab.lift);
            if (point) {
                grab.vel.subVectors(point, grab.last).multiplyScalar(6);
                grab.last.copy(point);
                body.p.copy(point);
                body.v.set(0, 0, 0);
                body.w.set(0, 0, 0);
            }
        }

        //--- buttons and hand -------------------------------------------------

        // Button rectangles, in the HUD's virtual pixels.
        buttonRects() {
            const W = hudW();
            const count = SAND_BUTTONS.length;
            const margin = 6;
            const gap = 2;
            const w = Math.floor((W - margin * 2 - gap * (count - 1)) / count);
            const h = 15;
            const y = hudH() - h - 5;
            return SAND_BUTTONS.map((id, i) => ({
                id, x: margin + i * (w + gap), y, w, h
            }));
        }

        handRects() {
            const W = hudW();
            const hand = this._table.handCards;
            const w = 26;
            const gap = 2;
            const total = hand.length * w + Math.max(0, hand.length - 1) * gap;
            const x0 = Math.floor((W - total) / 2);
            return hand.map((body, i) => ({
                body, x: x0 + i * (w + gap), y: hudH() - 15 - 5 - 26, w, h: 24
            }));
        }

        // Screen pixels to the HUD's own coordinates.
        toHud(x, y) {
            return {
                x: (x / Graphics.width) * hudW(),
                y: (y / Graphics.height) * hudH()
            };
        }

        inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

        hitButton(x, y) {
            const p = this.toHud(x, y);
            const rect = this.buttonRects().find(r => this.inRect(p, r));
            if (!rect) return false;
            this._buttonIndex = SAND_BUTTONS.indexOf(rect.id);
            this.pressButton(rect.id);
            return true;
        }

        // A card in hand is taken by clicking it, and laid down by clicking the
        // cloth; clicking it again puts it back on the deck.
        hitHand(x, y) {
            const p = this.toHud(x, y);
            const rect = this.handRects().find(r => this.inRect(p, r));
            if (rect) {
                this._heldHand = (this._heldHand === rect.body) ? null : rect.body;
                SoundManager.playCursor();
                return true;
            }
            if (this._heldHand) {
                const point = this.clothAt(x, y);
                if (point) {
                    this._table.placeFromHand(this._heldHand, point.x, point.z);
                    this._heldHand = null;
                    playSe('Book2', 120, 55);
                    return true;
                }
            }
            return false;
        }

        updateButtonInput() {
            if (Input.isRepeated('right')) {
                this._buttonIndex = (this._buttonIndex + 1) % SAND_BUTTONS.length;
                SoundManager.playCursor();
            } else if (Input.isRepeated('left')) {
                this._buttonIndex = (this._buttonIndex + SAND_BUTTONS.length - 1) % SAND_BUTTONS.length;
                SoundManager.playCursor();
            } else if (Input.isTriggered('ok')) {
                this.pressButton(SAND_BUTTONS[this._buttonIndex]);
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        drawCard() {
            const card = this._table.drawToHand();
            if (!card) { SoundManager.playBuzzer(); return; }
            playSe('Book2', 160, 45);
            this.say(uiText('sandboxDrawn'), { name: cardName(card.arcana) });
        }

        pressButton(id) {
            const table = this._table;
            switch (id) {
                case 'shuffle': {
                    const n = table.shuffleDeck();
                    playSe('Book1', 100, 70);
                    this.say(n ? uiText('sandboxShuffled') : uiText('sandboxDeckEmpty'));
                    break;
                }
                case 'cut': {
                    const at = table.cutDeck();
                    playSe('Book2', 110, 60);
                    this.say(at ? uiText('sandboxCutDone') : uiText('sandboxDeckEmpty'));
                    break;
                }
                case 'castle': {
                    const built = table.buildCastle();
                    playSe('Book1', 130, 70);
                    this.say(built.levels ? uiText('sandboxCastleBuilt') : uiText('sandboxCastleFew'),
                        { levels: built.levels, cards: built.used });
                    break;
                }
                case 'scramble': {
                    const n = table.scramble();
                    playSe('Book2', 90, 70);
                    this.say(uiText('sandboxScrambled'), { count: n });
                    break;
                }
                case 'gather': {
                    table.gatherToDeck();
                    this._heldHand = null;
                    playSe('Book1', 90, 65);
                    this.say(uiText('sandboxGathered'));
                    break;
                }
            }
        }

        say(text, params) {
            let out = String(text || '');
            if (params) {
                for (const key of Object.keys(params)) {
                    out = out.split('{' + key + '}').join(String(params[key]));
                }
            }
            this._status = out;
            this._statusT = 3.2;
        }

        //--- frame ------------------------------------------------------------

        updatePhase() { }

        cameraTarget() { return { x: 0, y: 0.25, z: 0 }; }

        paintHud(bmp) {
            if (this._fatal) {
                plate(bmp, 20, 100, hudW() - 40, 40, {});
                hudText(bmp, this._fatal, 20, 116, hudW() - 40, 'center', RED, 8);
                return;
            }
            const W = hudW();

            // Title, deck count and what is in hand.
            plate(bmp, 4, 4, W - 8, 16, { title: true });
            hudText(bmp, uiText('sandboxTitle'), 8, 8, W - 16, 'left', INK, 8);
            hudText(bmp, T('AnimatedTarotReading.ui.sandboxDeck', { count: this._table.deckCards.length }),
                8, 8, W - 16, 'right', DIMINK, 8);

            if (this._statusT > 0 && this._status) {
                const lines = wrapLines(bmp, this._status, W - 24, 8);
                const h = 8 + lines.length * 10;
                plate(bmp, 8, 24, W - 16, h, {});
                lines.forEach((line, i) => hudText(bmp, line, 12, 28 + i * 10, W - 24, 'left', GOLD_HI, 8));
            }

            // The hand, face up, above the buttons.
            const hand = this.handRects();
            for (const rect of hand) {
                const selected = this._heldHand === rect.body;
                plate(bmp, rect.x, rect.y, rect.w, rect.h, {});
                brackets(bmp, rect.x, rect.y, rect.w, rect.h, selected ? GOLD_HI : GOLD_LO, 4);
                hudText(bmp, ROMAN[rect.body.arcana], rect.x, rect.y + 8, rect.w, 'center',
                    selected ? GOLD_HI : INK, 8);
            }

            // The buttons.
            for (let i = 0; i < SAND_BUTTONS.length; i++) {
                const rect = this.buttonRects()[i];
                const focused = i === this._buttonIndex;
                plate(bmp, rect.x, rect.y, rect.w, rect.h, {});
                if (focused) brackets(bmp, rect.x, rect.y, rect.w, rect.h, GOLD_HI, 4);
                hudText(bmp, uiText('sandbox' + rect.id.charAt(0).toUpperCase() + rect.id.slice(1)),
                    rect.x, rect.y + 4, rect.w, 'center', focused ? GOLD_HI : DIMINK, 8);
            }
        }

        drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            bmp.clear();
            bmp.drawText(uiText('sandboxTitle'), 16, 16, Graphics.width - 32, 24, 'left');
            bmp.drawText(T('AnimatedTarotReading.ui.sandboxDeck', { count: this._table.deckCards.length }),
                16, 48, Graphics.width - 32, 24, 'left');
            if (this._status) bmp.drawText(this._status, 16, 80, Graphics.width - 32, 24, 'left');
        }

    }

    //=========================================================================
    // PICK A CARD
    //
    // One card off a shuffled deck, turned over where it lies: the arcana, the
    // way up it fell, and one of the meanings that orientation carries.
    //=========================================================================
    class Scene_TarotPick extends Scene_TarotBase {
        initialize() {
            super.initialize();
            this._phase = 'shuffle';
            this._shuffleT = 0;
            this._draw = null;
            this._meaning = '';
            this._revealT = 0;
        }

        create() {
            super.create();
            if (this._fatal) return;
            this._spread = SPREADS[0];
            this._table.setSpread(SINGLE_SPREAD);
            this.setBanner(uiText('pickTitle').toUpperCase(), 1.8);
            playSe('Book1', 90, 60);
        }

        updatePhase(dt) {
            if (this._phase === 'shuffle') {
                this._shuffleT += dt / 1.3;
                this._table.setShuffle(clamp(this._shuffleT, 0, 1), 0);
                if (this._shuffleT >= 1) {
                    this._table.setShuffle(0, 0);
                    this._draw = drawArcana(1)[0];
                    this._table.createCards([this._draw]);
                    this._table.beginDeal();
                    this._phase = 'deal';
                }
                return;
            }
            if (this._phase === 'deal') {
                if (this._table.isDealt()) {
                    this._table.revealCard(0);
                    this._meaning = cardMeaning(this._draw.arcana, this._draw.reversed);
                    this.startTyping(this._meaning);
                    playSe('Book2', 120, 70);
                    this._phase = 'read';
                }
                return;
            }
            // The reading stands until it is dismissed; OK draws another.
            this._revealT += dt;
            if (this._revealT > 0.6 && Input.isTriggered('ok')) {
                SoundManager.playOk();
                this._phase = 'shuffle';
                this._shuffleT = 0;
                this._revealT = 0;
                this._meaning = '';
                this._table.clearCards();
            } else if (Input.isTriggered('cancel')) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        hoverIndex() { return this._phase === 'read' ? 0 : -1; }

        paintHud(bmp) {
            if (this._fatal) {
                plate(bmp, 20, 100, hudW() - 40, 40, {});
                hudText(bmp, this._fatal, 20, 116, hudW() - 40, 'center', RED, 8);
                return;
            }
            const W = hudW();
            plate(bmp, 4, 4, W - 8, 16, { title: true });
            hudText(bmp, uiText('pickTitle'), 8, 8, W - 16, 'left', INK, 8);

            if (this._phase !== 'read' || !this._draw) return;

            const arcana = this._draw.arcana;
            const reversed = this._draw.reversed;
            plate(bmp, 8, hudH() - MEANING_H - 8, W - 16, MEANING_H, {});
            const head = ROMAN[arcana] + '  ' + cardName(arcana).toUpperCase();
            hudText(bmp, head, 12, hudH() - MEANING_H - 3, W - 24, 'left', GOLD_HI, 8);
            hudText(bmp, reversed ? uiText('reversed') : uiText('upright'),
                12, hudH() - MEANING_H - 3, W - 24, 'right', reversed ? RED : VIOLET, 8);
            rule(bmp, 12, hudH() - MEANING_H + 9, W - 24, GOLD_LO);
            const lines = wrapLines(bmp, this.typedText(), W - 24, 8);
            lines.slice(0, 4).forEach((line, i) => {
                hudText(bmp, line, 12, hudH() - MEANING_H + 14 + i * 10, W - 24, 'left', INK, 8);
            });
        }

        drawAscii() {
            const bmp = this._asciiSprite.bitmap;
            bmp.clear();
            bmp.drawText(uiText('pickTitle'), 16, 16, Graphics.width - 32, 24, 'left');
            if (this._phase === 'read' && this._draw) {
                bmp.drawText(cardName(this._draw.arcana) + ' - ' +
                    (this._draw.reversed ? uiText('reversed') : uiText('upright')),
                    16, 48, Graphics.width - 32, 24, 'left');
                bmp.drawText(this._meaning, 16, 80, Graphics.width - 32, 24, 'left');
            }
        }

    }

    //=========================================================================
    // The deck as an item
    //
    // A deck of tarot is not drunk, eaten or worn, so the backpack draws the
    // three things it is actually for in place of Use. The buttons come from
    // <Actions: tarotRead, tarotPick, tarotSpread> written on the item; the
    // registry lives in ItemSystem, which loads first.
    //=========================================================================

    // A tarot scene cannot open over the backpack's own DOM overlay, so the
    // table is asked for the way an item's common event asks for it: the
    // backpack closes, the map comes back, and the scene opens on top of it.
    function openFromMenu(sceneClass, data) {
        $gameTemp._tarotPending = { scene: sceneClass, data: data || null };
        const scene = SceneManager._scene;
        if (scene && scene.popScene) scene.popScene();
        SceneManager.goto(Scene_Map);
    }

    const _Scene_Map_start_tarot = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function () {
        _Scene_Map_start_tarot.call(this);
        const pending = $gameTemp ? $gameTemp._tarotPending : null;
        if (!pending) return;
        $gameTemp._tarotPending = null;
        SceneManager.push(pending.scene);
        if (pending.data) SceneManager.prepareNextScene(pending.data);
    };

    // The reading one member of the party gives another: the same three card
    // quiz the reader gives an NPC, with the chosen companion in the chair.
    function readingFor(actor) {
        return {
            name: actor ? actor.name() : T('AnimatedTarotReading.npc.name'),
            perfectMessage: T('AnimatedTarotReading.npc.perfectLong'),
            goodMessage: T('AnimatedTarotReading.npc.goodLong'),
            averageMessage: T('AnimatedTarotReading.npc.averageLong'),
            poorMessage: T('AnimatedTarotReading.npc.poorLong')
        };
    }

    if (window.ItemActions) {
        window.ItemActions.register('tarotRead', {
            labelKey: 'AnimatedTarotReading.ui.actionRead',
            titleKey: 'AnimatedTarotReading.ui.actionReadWho',
            needsTarget: true,
            handler: (item, actor) => openFromMenu(Scene_TarotNPC, readingFor(actor))
        });
        window.ItemActions.register('tarotPick', {
            labelKey: 'AnimatedTarotReading.ui.actionPick',
            handler: () => openFromMenu(Scene_TarotPick)
        });
        window.ItemActions.register('tarotSpread', {
            labelKey: 'AnimatedTarotReading.ui.actionSpread',
            handler: () => openFromMenu(Scene_TarotSandbox)
        });
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
    PluginManager.registerCommand(pluginName, 'pickOneCard', () => {
        SceneManager.push(Scene_TarotPick);
    });

    PluginManager.registerCommand(pluginName, 'freeSpread', () => {
        SceneManager.push(Scene_TarotSandbox);
    });

    window.Scene_Tarot = Scene_Tarot;
    window.Scene_TarotNPC = Scene_TarotNPC;
    window.Scene_TarotPick = Scene_TarotPick;
    window.Scene_TarotSandbox = Scene_TarotSandbox;
})();
