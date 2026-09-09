/*:
 * @target MZ
 * @plugindesc v2.0.0 Procedural clamshell cases, faces and component models for the Hyperdeck.
 * @author Omni-Lex
 *
 * @help
 * HyperDeckModels.js
 *
 * Geometry only. This plugin owns no scene, no state and no input: it hands
 * HyperDeck.js finished three.js objects and the numbers needed to lay a grid
 * out on top of them.
 *
 * The shell is clear plastic, the way every good handheld of the period was
 * sold at least once: a smoked violet you can see the board through. Which is
 * the point, because the board is what the player is building.
 *
 * Exposes window.HyperDeckModels:
 *   CASES                     the case catalogue
 *   FACES                     the three things the lower half can be
 *   SHELL_FINISHES            what the shell can be moulded or wrapped in
 *   caseById(id)              one case definition, or the first one
 *   randomCase(rng)           a case definition, picked with the given rng
 *   buildCase(THREE, def, o)  the clamshell; o.finish overrides the shell
 *   buildFace(THREE, def, s, o) the lower half: keyboard, handheld or phone;
 *                              o.finish is the shell the lid is wearing
 *   buildComponent(THREE, c)  one component model, sized to its footprint
 *
 * A CASE definition carries:
 *   id        stable key, also the i18n suffix (HyperDeck.case.<id>)
 *   cols/rows the component grid
 *   blocked   [[c, r], ...] cells the hinge channel and the bays eat, so the
 *             boards are irregular rather than plain rectangles
 *
 * Every case in the catalogue leaves exactly BOARD_CELLS cells free. A case is
 * a shape to solve, never an amount of room: cols * rows - blocked.length is
 * the same number for all of them, and only the disposition changes.
 *   screen    { w, h } aspect of the lid panel, in cells
 *   shell     { tint, accent } the moulding colour and the button colour
 *   build     shape flavour, read by buildCase
 *
 * buildCase returns:
 *   { root, base, lidPivot, lidShell, screenMesh, screenCanvas, screenTexture,
 *     boardMesh, powerButton, metrics, cellSize, lidDepth, screenSize,
 *     clearShell, disposables }
 *
 * Nothing here reads $gameSystem, and nothing here is localized: the only
 * strings are the i18n KEYS the caller resolves.
 */

(() => {
    'use strict';

    // One grid cell, in world units. Everything else is derived from it. Every
    // case carries the same number of cells, so the cell is small enough that a
    // 48 cell board is still a machine you could hold rather than a table.
    const CELL = 0.235;
    const BASE_THICK = 0.16;
    // The board is sunk into the tray rather than laid across the top of it,
    // and everything fitted to it is squashed to fit in the space that leaves.
    // Component models are drawn up to about 0.18 tall, which stood a memory
    // stick straight through the lid.
    const BOARD_Y = -0.05;
    const PART_Y = BOARD_Y + 0.015;
    // 0.4 rather than 0.5 so even the tallest arcane part clears the lower
    // half as well as the rim: at 0.5 a fitted module poked up through the
    // keyboard when the face slid back in.
    const PART_HEIGHT_SCALE = 0.4;
    const LID_THICK = 0.11;
    const MARGIN = 0.22;

    // How see-through the moulding is. Enough to read the board underneath,
    // not so much that the case stops being an object.
    const SHELL_OPACITY = 0.46;

    //=========================================================================
    // Catalogue
    //=========================================================================
    // i18n-ignore-start  ids, file names and palette keys, never shown raw
    const CLEAR_VIOLET = 0x9a72e2;

    // Free cells every case must leave. Kept as a constant so a new case can be
    // checked against it at a glance: cols * rows - blocked.length === this.
    const BOARD_CELLS = 48;

    const CASES = [
        {
            // Wide and shallow, two hinge bosses eating the back corners.
            id: 'slab', cols: 10, rows: 5, build: 'slab',
            blocked: [[0, 0], [9, 0]],
            screen: { w: 7.6, h: 4.2 },
            shell: { tint: CLEAR_VIOLET, accent: 0xd6c4ff }
        },
        {
            // Tapers towards the player, so the front corners are moulding.
            id: 'wedge', cols: 9, rows: 6, build: 'wedge',
            blocked: [[0, 5], [1, 5], [7, 5], [8, 5], [0, 4], [8, 4]],
            screen: { w: 6.9, h: 4.2 },
            shell: { tint: CLEAR_VIOLET, accent: 0xffd9a8 }
        },
        {
            // Stands tall like a ledger, with the spine channel down one side.
            id: 'book', cols: 6, rows: 9, build: 'book',
            blocked: [[0, 0], [0, 1], [0, 7], [0, 8], [5, 0], [5, 8]],
            screen: { w: 5.0, h: 5.6 },
            shell: { tint: CLEAR_VIOLET, accent: 0xf0b878 }
        },
        {
            // Square and stubborn, one post through the middle of the board.
            id: 'brick', cols: 7, rows: 7, build: 'brick',
            blocked: [[3, 3]],
            screen: { w: 5.0, h: 4.0 },
            shell: { tint: CLEAR_VIOLET, accent: 0xe8d24a }
        },
        {
            // A pocket organiser: the whole right hand column is a fixed bay.
            id: 'palmtop', cols: 9, rows: 6, build: 'palmtop',
            blocked: [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5]],
            screen: { w: 5.8, h: 3.4 },
            shell: { tint: CLEAR_VIOLET, accent: 0x9fdcff }
        },
        {
            // Two hinges, and the channel between them splits the board in half.
            id: 'dualhinge', cols: 10, rows: 6, build: 'dualhinge',
            blocked: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
                [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5]],
            screen: { w: 8.0, h: 4.6 },
            shell: { tint: CLEAR_VIOLET, accent: 0xff9c66 }
        }
    ];

    // The lower half is a choice, not a consequence of the case.
    const FACES = ['keyboard', 'handheld', 'phone'];

    // What the shell can be. A `clear` entry is moulded plastic you can see the
    // board through; a `tex` entry is a sheet off the shared texture library,
    // which makes the case solid.
    const SHELL_FINISHES = [
        { id: 'clear-violet', clear: CLEAR_VIOLET },
        { id: 'clear-berry', clear: 0xe0559c },
        { id: 'clear-ice', clear: 0x7ec8f0 },
        { id: 'clear-jade', clear: 0x5fd0a8 },
        { id: 'clear-amber', clear: 0xe8a94a },
        { id: 'clear-smoke', clear: 0x8d94a6 },
        { id: 'grey_concrete.jpg', tex: 'grey_concrete.jpg' },
        { id: 'brown_grey_slate.jpg', tex: 'brown_grey_slate.jpg' },
        { id: 'golden_brown_leather.jpg', tex: 'golden_brown_leather.jpg' },
        { id: 'beige_sandstone.jpg', tex: 'beige_sandstone.jpg' },
        { id: 'copper_patina.jpg', tex: 'copper_patina.jpg' },
        { id: 'malachite.jpg', tex: 'malachite.jpg' },
        { id: 'dark_gold_swirl.jpg', tex: 'dark_gold_swirl.jpg' },
        { id: 'violet_psychedelic.jpg', tex: 'violet_psychedelic.jpg' }
    ];

    // What each component line is made of, for the parts that are not board.
    const PART_SURFACE = {
        Mundane: { metal: 'warm_grey_stone.jpg', rep: 2, board: '#0f3d24', mask: '#12512f' },
        Both: { metal: 'copper_patina.jpg', rep: 2, board: '#123449', mask: '#17455f' },
        Magical: { metal: 'malachite.jpg', rep: 1, board: '#2a1638', mask: '#3a1e4e' }
    };
    // i18n-ignore-end

    //=========================================================================
    // Loading and helpers
    //=========================================================================
    const _texCache = new Map();
    function loadTex(name, repeat) {
        if (!name || typeof THREE === 'undefined' || !THREE.TextureLoader) return null;
        const key = name + '@' + (repeat || 1);
        let t = _texCache.get(key);
        if (t) return t;
        t = new THREE.TextureLoader().load('img/textures/' + name);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (repeat) t.repeat.set(repeat, repeat);
        if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        _texCache.set(key, t);
        return t;
    }

    function maker(THREE, sink) {
        return {
            geo(g) { sink.push(g); return g; },
            mat(opts) {
                const m = new THREE.MeshLambertMaterial(opts);
                sink.push(m);
                return m;
            },
            box(w, h, d, material, x, y, z, parent) {
                const mesh = new THREE.Mesh(this.geo(new THREE.BoxGeometry(w, h, d)), material);
                mesh.position.set(x, y, z);
                if (parent) parent.add(mesh);
                return mesh;
            },
            cyl(rt, rb, h, seg, material, x, y, z, parent) {
                const mesh = new THREE.Mesh(
                    this.geo(new THREE.CylinderGeometry(rt, rb, h, seg)), material);
                mesh.position.set(x, y, z);
                if (parent) parent.add(mesh);
                return mesh;
            },
            canvasTexture(w, h, draw, repeat) {
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                draw(canvas.getContext('2d'), w, h);
                const tex = new THREE.CanvasTexture(canvas);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                if (repeat) {
                    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                    tex.repeat.set(repeat, repeat);
                }
                sink.push(tex);
                return { texture: tex, canvas: canvas };
            }
        };
    }

    function seeded(seed) {
        let s = (seed | 0) || 1;
        return function () {
            s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
            return ((s >>> 0) % 100000) / 100000;
        };
    }

    function shade(hex, amount) {
        const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) + amount));
        const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) + amount));
        const b = Math.min(255, Math.max(0, (hex & 255) + amount));
        return (r << 16) | (g << 8) | b;
    }

    // Moulded plastic you can see through, or a solid sheet, depending on what
    // the player picked in the finish tray. depthWrite is off on the clear
    // shells so the board inside is never punched out of the picture by the
    // wall in front of it.
    // The colour a clear shell is moulded in, which the lower half matches.
    function shellTint(def, finishId) {
        const chosen = SHELL_FINISHES.find(f => f.id === finishId);
        return (chosen && chosen.clear) || def.shell.tint;
    }

    function shellMaterials(mk, def, finishId) {
        const chosen = SHELL_FINISHES.find(f => f.id === finishId);
        if (chosen && chosen.tex) {
            return {
                body: mk.mat({ color: 0xffffff, map: loadTex(chosen.tex, 3) }),
                trim: mk.mat({ color: 0xbdbdbd, map: loadTex(chosen.tex, 6) }),
                clear: false
            };
        }
        const tint = (chosen && chosen.clear) || def.shell.tint;
        const glass = extra => mk.mat(Object.assign({
            color: tint,
            transparent: true,
            opacity: SHELL_OPACITY,
            depthWrite: false
        }, extra || {}));
        return {
            body: glass(),
            trim: glass({ color: shade(tint, -50), opacity: SHELL_OPACITY + 0.16 }),
            clear: true
        };
    }

    //=========================================================================
    // Textures
    //=========================================================================
    // A populated printed circuit board: solder mask, a hatched ground pour,
    // routed traces with real corners, vias, pads and a little silkscreen.
    // Drawn at 256 so the traces survive being looked at from a hand's length.
    function pcbTexture(mk, rng, surface) {
        return mk.canvasTexture(256, 256, (ctx, w, h) => {
            ctx.fillStyle = surface.board;
            ctx.fillRect(0, 0, w, h);

            ctx.strokeStyle = surface.mask;
            ctx.lineWidth = 6;
            for (let i = -h; i < w; i += 14) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + h, h);
                ctx.stroke();
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (let i = 0; i < 34; i++) {
                const gold = rng() < 0.75;
                ctx.strokeStyle = gold ? 'rgba(214, 176, 78, 0.9)' : 'rgba(178, 190, 200, 0.75)';
                ctx.lineWidth = rng() < 0.25 ? 3 : 1.6;
                let x = Math.floor(rng() * w);
                let y = Math.floor(rng() * h);
                ctx.beginPath();
                ctx.moveTo(x, y);
                const legs = 2 + Math.floor(rng() * 3);
                for (let k = 0; k < legs; k++) {
                    if (k % 2 === 0) x += (rng() < 0.5 ? -1 : 1) * (16 + rng() * 60);
                    else y += (rng() < 0.5 ? -1 : 1) * (16 + rng() * 60);
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            for (let i = 0; i < 60; i++) {
                const x = rng() * w;
                const y = rng() * h;
                ctx.fillStyle = 'rgba(226, 196, 118, 0.95)';
                ctx.beginPath();
                ctx.arc(x, y, 3.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.beginPath();
                ctx.arc(x, y, 1.3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = 'rgba(206, 210, 216, 0.9)';
            for (let i = 0; i < 26; i++) {
                const x = Math.floor(rng() * (w - 16));
                const y = Math.floor(rng() * (h - 8));
                const vertical = rng() < 0.5;
                ctx.fillRect(x, y, vertical ? 5 : 6, vertical ? 6 : 5);
                ctx.fillRect(x + (vertical ? 0 : 11), y + (vertical ? 11 : 0),
                    vertical ? 5 : 6, vertical ? 6 : 5);
            }

            ctx.fillStyle = 'rgba(232, 236, 240, 0.55)';
            for (let i = 0; i < 30; i++) {
                const x = rng() * w;
                const y = rng() * h;
                ctx.fillRect(x, y, 2, 5);
                ctx.fillRect(x + 3, y, 2, 5);
            }
        });
    }

    // The dark, faintly scanlined face of a panel that is switched off.
    function screenTexture(mk) {
        return mk.canvasTexture(384, 288, (ctx, w, h) => {
            ctx.fillStyle = '#0a0d0a';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
        });
    }

    // The face of a display component: glass with a scanned grid and a glare.
    function panelFaceTexture(mk, tint) {
        return mk.canvasTexture(64, 64, (ctx, w, h) => {
            ctx.fillStyle = tint;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
            for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
            ctx.lineWidth = 1;
            ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
            const g = ctx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
            g.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
    }

    // The lid of a plastic package: matte black, a laser-etched line of
    // nonsense, and the pin-one dimple.
    function chipLidTexture(mk, rng) {
        return mk.canvasTexture(64, 64, (ctx, w, h) => {
            ctx.fillStyle = '#15161a';
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 400; i++) {
                ctx.fillStyle = 'rgba(255,255,255,' + (rng() * 0.05).toFixed(3) + ')';
                ctx.fillRect(rng() * w, rng() * h, 1, 1);
            }
            ctx.fillStyle = 'rgba(198, 198, 206, 0.6)';
            for (let row = 0; row < 3; row++) {
                const y = 20 + row * 10;
                const n = 5 + Math.floor(rng() * 6);
                for (let i = 0; i < n; i++) ctx.fillRect(12 + i * 4, y, 2, 5);
            }
            ctx.beginPath();
            ctx.arc(9, 9, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fill();
        });
    }

    //=========================================================================
    // The clamshell
    //=========================================================================
    function caseMetrics(def) {
        const boardW = def.cols * CELL;
        const boardD = def.rows * CELL;
        return {
            boardW: boardW,
            boardD: boardD,
            baseW: boardW + MARGIN * 2,
            baseD: boardD + MARGIN * 2
        };
    }

    function cellCentre(def, m, c, r) {
        return {
            x: -m.boardW / 2 + (c + 0.5) * CELL,
            y: PART_Y,
            z: -m.boardD / 2 + (r + 0.5) * CELL
        };
    }

    function buildCase(THREE, def, opts) {
        const o = opts || {};
        const sink = [];
        const mk = maker(THREE, sink);
        const rng = seeded(def.id.length * 977 + def.cols * 31 + def.rows);
        const m = caseMetrics(def);
        const shell = shellMaterials(mk, def, o.finish);
        const accentMat = mk.mat({ color: def.shell.accent });
        const darkMat = mk.mat({ color: 0x1a1a20 });

        const root = new THREE.Group();
        const base = new THREE.Group();
        root.add(base);

        // --- the base -------------------------------------------------------
        // A tray with walls rather than a slab, so a clear shell shows a cavity
        // with a board in it instead of a coloured brick.
        // The rim stands proud of the board rather than stopping level with the
        // floor it sits on. It used to end at y 0, which put the board and
        // everything fitted to it ABOVE the walls: the case read as a tray with
        // a circuit board balanced on the lip instead of one sunk into it.
        const wall = 0.075;
        const rim = 0.06;
        const wallH = BASE_THICK + rim;
        const wallY = -BASE_THICK / 2 + rim / 2;
        mk.box(m.baseW, 0.03, m.baseD, shell.body, 0, -BASE_THICK + 0.015, 0, base);
        mk.box(m.baseW, wallH, wall, shell.body, 0, wallY, -m.baseD / 2 + wall / 2, base);
        mk.box(m.baseW, wallH, wall, shell.body, 0, wallY, m.baseD / 2 - wall / 2, base);
        mk.box(wall, wallH, m.baseD, shell.body, -m.baseW / 2 + wall / 2, wallY, 0, base);
        mk.box(wall, wallH, m.baseD, shell.body, m.baseW / 2 - wall / 2, wallY, 0, base);

        if (def.build === 'brick') {
            const bump = 0.1;
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
                mk.box(bump * 2, wallH + 0.04, bump * 2, darkMat,
                    sx * (m.baseW / 2 - bump), wallY, sz * (m.baseD / 2 - bump), base);
            });
        }

        // The board itself, which is the thing being built.
        const pcb = pcbTexture(mk, rng, PART_SURFACE.Mundane);
        const boardMat = mk.mat({ map: pcb.texture });
        const boardMesh = mk.box(m.boardW, 0.026, m.boardD, boardMat, 0, BOARD_Y, 0, base);

        // Blocked cells get a physical excuse the player can see.
        (def.blocked || []).forEach(([c, r]) => {
            const p = cellCentre(def, m, c, r);
            mk.box(CELL * 0.9, 0.06, CELL * 0.9, darkMat, p.x, PART_Y + 0.02, p.z, base);
        });

        // The front lip caps the rim now that the rim is the tall part, and the
        // power button sits on top of the cap rather than buried in the wall.
        mk.box(m.baseW, 0.03, wall + 0.01, shell.trim, 0, rim, m.baseD / 2 - wall / 2, base);
        const powerButton = mk.cyl(0.055, 0.055, 0.05, 10, accentMat,
            m.baseW / 2 - 0.18, rim + 0.03, m.baseD / 2 - wall / 2, base);
        powerButton.rotation.x = Math.PI / 2;
        powerButton.userData.isPowerButton = true;

        // --- the lid --------------------------------------------------------
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, 0, -m.baseD / 2);
        root.add(lidPivot);

        const lidW = m.baseW;
        const lidD = def.build === 'book' ? m.baseD * 1.02 : m.baseD;
        const lidShell = mk.box(lidW, LID_THICK, lidD, shell.body, 0, LID_THICK / 2, -lidD / 2, lidPivot);
        lidShell.userData.isLid = true;
        mk.box(lidW - 0.08, 0.02, lidD - 0.08, shell.trim, 0, LID_THICK + 0.005, -lidD / 2, lidPivot);

        const scr = screenTexture(mk);
        const screenMat = mk.mat({ map: scr.texture });
        const sw = Math.min(lidW - 0.24, def.screen.w * CELL);
        const sd = Math.min(lidD - 0.24, def.screen.h * CELL);
        const screenMesh = new THREE.Mesh(mk.geo(new THREE.PlaneGeometry(sw, sd)), screenMat);
        screenMesh.rotation.x = -Math.PI / 2;
        screenMesh.position.set(0, LID_THICK + 0.022, -lidD / 2);
        screenMesh.userData.isScreen = true;
        lidPivot.add(screenMesh);

        const barrels = def.build === 'dualhinge' ? [-lidW * 0.28, lidW * 0.28] : [0];
        const barrelLen = def.build === 'dualhinge' ? lidW * 0.34 : lidW * 0.7;
        barrels.forEach(x => {
            const b = mk.cyl(0.07, 0.07, barrelLen, 10, shell.trim, x, 0.06, 0, lidPivot);
            b.rotation.z = Math.PI / 2;
        });

        if (def.build === 'book' || def.build === 'brick') {
            mk.box(0.16, 0.05, 0.06, accentMat, 0, LID_THICK / 2, -lidD + 0.02, lidPivot);
        }

        return {
            root: root,
            base: base,
            lidPivot: lidPivot,
            lidShell: lidShell,
            screenMesh: screenMesh,
            screenCanvas: scr.canvas,
            screenTexture: scr.texture,
            boardMesh: boardMesh,
            powerButton: powerButton,
            metrics: m,
            lidDepth: lidD,
            screenSize: { w: sw, h: sd },
            cellSize: CELL,
            clearShell: shell.clear,
            disposables: sink
        };
    }

    //=========================================================================
    // The lower half
    //=========================================================================
    // Whatever it is, it sits over the board and slides out of the way when the
    // board is opened, so the electronics underneath are what you look at.
    function buildFace(THREE, def, style, opts) {
        const sink = [];
        const mk = maker(THREE, sink);
        const m = caseMetrics(def);
        const group = new THREE.Group();
        const accent = def.shell.accent;

        // The lower half is moulded in one go with the lid, so it wears the
        // same shell: the chosen sheet where the case is solid, and the tinted
        // plastic where it is clear. A clear plate would show the empty inside
        // of the base, so the plate itself stays opaque and only takes the
        // colour, while a textured shell hands it the sheet as well.
        const shell = shellMaterials(mk, def, (opts || {}).finish);
        const plateMat = shell.clear
            ? mk.mat({ color: shade(shellTint(def, (opts || {}).finish), -110) })
            : mk.mat({ color: 0xdedede, map: shell.body.map });
        const keyMat = mk.mat({ color: shade(accent, -70) });
        const darkMat = mk.mat({ color: 0x15161a });
        const litMat = mk.mat({ color: 0x8fd8b0, emissive: 0x123f2a });

        mk.box(m.boardW, 0.022, m.boardD, plateMat, 0, 0.05, 0, group);

        if (style === 'handheld') {
            // A cross, four buttons, two pills and a speaker grille.
            const cx = -m.boardW * 0.28;
            const arm = Math.min(0.09, m.boardW * 0.05);
            mk.box(arm * 3, 0.035, arm, darkMat, cx, 0.075, 0, group);
            mk.box(arm, 0.035, arm * 3, darkMat, cx, 0.075, 0, group);

            const bx = m.boardW * 0.27;
            [[0.10, -0.05], [0.02, -0.13], [0.02, 0.03], [-0.06, -0.05]].forEach(([dx, dz]) => {
                mk.cyl(0.048, 0.048, 0.035, 12, keyMat, bx + dx, 0.075, dz, group);
            });
            [[-0.06, 0.13], [0.04, 0.13]].forEach(([dx, dz]) => {
                const pill = mk.box(0.09, 0.025, 0.035, keyMat, dx, 0.068, dz, group);
                pill.rotation.y = 0.35;
            });
            for (let i = 0; i < 5; i++) {
                for (let j = 0; j < 5; j++) {
                    mk.cyl(0.011, 0.011, 0.02, 6, darkMat,
                        m.boardW * 0.40 + (i - 2) * 0.03, 0.064,
                        m.boardD * 0.30 + (j - 2) * 0.03, group);
                }
            }
            mk.cyl(0.014, 0.014, 0.016, 8, litMat, -m.boardW * 0.44, 0.066, -m.boardD * 0.38, group);
        } else if (style === 'phone') {
            // A candybar handset of the period, the one everybody had: a drilled
            // earpiece grille, a small green screen under a raised bezel, two
            // angled soft keys either side of the navigation key, and four rows
            // of wide pale keys with a ridge along the top edge of each.
            const padMat = mk.mat({ color: 0xd7d4cc });
            const lcdMat = mk.mat({ color: 0x9fbf8a, emissive: 0x22331c });
            const bezelMat = mk.mat({ color: 0x2a2d34 });
            const top = -m.boardD / 2;
            const fw = m.boardW;
            const fd = m.boardD;

            for (let i = 0; i < 7; i++) {
                mk.cyl(0.012, 0.012, 0.008, 6, darkMat,
                    (i - 3) * Math.min(0.034, fw * 0.042), 0.062, top + fd * 0.07, group);
            }

            mk.box(fw * 0.56, 0.02, fd * 0.21, bezelMat, 0, 0.062, top + fd * 0.24, group);
            mk.box(fw * 0.48, 0.016, fd * 0.15, lcdMat, 0, 0.072, top + fd * 0.24, group);

            // The two soft keys splay outwards around the navigation key, which
            // is the shape the whole row is remembered by.
            const softZ = top + fd * 0.40;
            [-1, 1].forEach(side => {
                const soft = mk.box(fw * 0.16, 0.026, fd * 0.07, padMat,
                    side * fw * 0.29, 0.070, softZ, group);
                soft.rotation.y = side * 0.22;
            });
            mk.cyl(Math.min(0.075, fd * 0.055), Math.min(0.075, fd * 0.055), 0.03, 12,
                darkMat, 0, 0.072, softZ, group);

            const kw = Math.min(0.15, fw * 0.19);
            const kd = Math.min(0.075, fd * 0.105);
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 3; col++) {
                    const x = (col - 1) * kw * 1.14;
                    const z = top + fd * 0.53 + row * kd * 1.28;
                    const key = mk.box(kw, 0.026, kd, padMat, x, 0.070, z, group);
                    key.rotation.x = -0.06;
                    mk.box(kw * 0.9, 0.012, kd * 0.16, padMat, x, 0.081, z - kd * 0.3, group);
                }
            }
        } else {
            // The key bed: four staggered rows and a space bar.
            const rows = 4;
            const keysPerRow = Math.max(6, Math.round(m.boardW / 0.14));
            const keyW = (m.boardW - 0.06) / keysPerRow;
            const keyD = Math.min(0.13, (m.boardD - 0.12) / (rows + 1.4));
            for (let r = 0; r < rows; r++) {
                const stagger = (r % 2) * keyW * 0.25;
                for (let k = 0; k < keysPerRow; k++) {
                    const x = -m.boardW / 2 + 0.03 + keyW * (k + 0.5) + stagger;
                    if (x > m.boardW / 2 - 0.02) continue;
                    const z = -m.boardD / 2 + 0.06 + keyD * (r + 0.5) * 1.12;
                    mk.box(keyW * 0.82, 0.028, keyD * 0.8, keyMat, x, 0.074, z, group);
                }
            }
            mk.box(m.boardW * 0.42, 0.028, keyD * 0.8, keyMat, 0, 0.074,
                -m.boardD / 2 + 0.06 + keyD * (rows + 0.5) * 1.12, group);
        }

        group.userData.disposables = sink;
        return group;
    }

    //=========================================================================
    // Component models
    //=========================================================================
    // c = { kind, nature, w, h, seed }. w and h are the footprint in cells
    // AFTER rotation, so the model is always built to the space it will fill.
    function buildComponent(THREE, c) {
        const sink = [];
        const mk = maker(THREE, sink);
        const rng = seeded(c.seed || 1);
        const group = new THREE.Group();

        const w = Math.max(0.08, c.w * CELL - CELL * 0.15);
        const d = Math.max(0.08, c.h * CELL - CELL * 0.15);
        const arcane = c.nature === 'Magical';
        const hybrid = c.nature === 'Both';
        const surface = PART_SURFACE[c.nature] || PART_SURFACE.Mundane;

        const pcb = pcbTexture(mk, rng, surface);
        const pcbMat = mk.mat({ map: pcb.texture });
        const lid = chipLidTexture(mk, rng);
        const chipMat = mk.mat({ map: lid.texture, color: arcane ? 0x8d78a8 : 0xffffff });
        const metalMat = mk.mat({
            color: arcane ? 0xbfae86 : 0xc8ced6,
            map: loadTex(surface.metal, surface.rep)
        });
        const goldMat = mk.mat({ color: 0xd8b24a });
        const capMat = mk.mat({ color: 0xc8a86a });
        const glowMat = mk.mat({
            color: arcane ? 0x9a6fc4 : hybrid ? 0x4f9fb4 : 0xa88b3a,
            emissive: arcane ? 0x321c4c : hybrid ? 0x08313a : 0x000000
        });

        const lengthwise = w >= d;

        // A fitted part is flattened by PART_HEIGHT_SCALE, so every gap written
        // here is worth 0.4 of what it reads as once the part is on the board.
        // Two horizontal faces that end up level flicker against each other, so
        // anything standing on the part's own board starts at the SAME y, sunk
        // below the board's top face: those bottom faces coincide where nobody
        // can see them, and no visible face is ever level with another.
        const DECK = 0.035;   // the top face of the part's own board
        const SEAT = 0.027;   // where everything standing on it begins

        // A row of gold contact fingers along one edge: what a card plugs in by.
        const fingers = () => {
            const n = Math.max(4, Math.round((lengthwise ? w : d) / 0.035));
            for (let i = 0; i < n; i++) {
                const t = (i + 0.5) / n - 0.5;
                mk.box(lengthwise ? (w / n) * 0.6 : 0.02, 0.024,
                    lengthwise ? 0.02 : (d / n) * 0.6, goldMat,
                    lengthwise ? t * w : w / 2 - 0.012, SEAT + 0.012,
                    lengthwise ? d / 2 - 0.012 : t * d, group);
            }
        };

        // A leaded package: a black lid with a leg row down each long side.
        // `clear` is how much room there is beyond the package before the next
        // one starts: the leg row is cut to fit it, so two neighbouring rows
        // never grow into each other and fight over the same space.
        const pkg = (px, pz, pw, pd, hgt, clear) => {
            mk.box(pw, hgt + (DECK - SEAT), pd, chipMat,
                px, SEAT + (hgt + (DECK - SEAT)) / 2, pz, group);
            const legD = Math.min(0.014, Math.max(0.006, (clear || 0.02) * 0.8));
            const legs = Math.max(3, Math.round(pw / 0.022));
            for (let i = 0; i < legs; i++) {
                const t = (i + 0.5) / legs - 0.5;
                mk.box(0.008, 0.018, legD, metalMat, px + t * pw * 0.92, SEAT + 0.009,
                    pz - pd / 2 - legD / 2, group);
                mk.box(0.008, 0.018, legD, metalMat, px + t * pw * 0.92, SEAT + 0.009,
                    pz + pd / 2 + legD / 2, group);
            }
        };

        const kind = c.kind;

        if (kind === 'ram' || kind === 'sound' || kind === 'modem' || kind === 'gpu') {
            mk.box(w, 0.03, d, pcbMat, 0, 0.02, 0, group);
            fingers();
            const n = Math.max(2, Math.round((lengthwise ? w : d) / 0.13));
            for (let i = 0; i < n; i++) {
                const t = (i + 0.5) / n - 0.5;
                const pitch = (lengthwise ? w : d) * 0.82 / n;
                const depth = lengthwise ? d * 0.42 : (d / n) * 0.66;
                pkg(lengthwise ? t * w * 0.82 : 0,
                    lengthwise ? -d * 0.08 : t * d * 0.82,
                    lengthwise ? (w / n) * 0.66 : w * 0.46,
                    depth, 0.026,
                    lengthwise ? 0.02 : (pitch - depth) / 2);
            }
            // Decoupling capacitors, because every board has a row of them.
            // Spaced along the board rather than scattered at random, so two of
            // them can never land in the same place and fight over it.
            for (let i = 0; i < 6; i++) {
                const t = (i + 0.5) / 6 - 0.5;
                mk.box(0.018, 0.028, 0.011, capMat,
                    lengthwise ? t * w * 0.8 : (rng() - 0.5) * w * 0.6,
                    SEAT + 0.014,
                    lengthwise ? (rng() - 0.5) * d * 0.6 : t * d * 0.8, group);
            }
            if (kind === 'gpu') mk.box(w * 0.42, 0.044, d * 0.42, metalMat, 0, 0.089, 0, group);
            if (kind === 'modem') {
                const a = mk.cyl(0.011, 0.011, Math.min(w, d) * 0.9, 6, metalMat, 0, 0.07, d * 0.3, group);
                a.rotation.z = Math.PI / 2;
            }
        } else if (kind === 'cpu') {
            // A substrate, a lidded die and a pin field underneath.
            mk.box(w, 0.026, d, pcbMat, 0, 0.018, 0, group);
            mk.box(w * 0.66, 0.036, d * 0.66, chipMat, 0, 0.041, 0, group);
            mk.box(w * 0.44, 0.024, d * 0.44, metalMat, 0, 0.065, 0, group);
            mk.box(w * 0.18, 0.012, d * 0.18, glowMat, 0, 0.077, 0, group);
            const grid = 5;
            for (let i = 0; i < grid; i++) {
                for (let j = 0; j < grid; j++) {
                    if ((i + j) % 2) continue;
                    mk.cyl(0.006, 0.006, 0.012, 5, goldMat,
                        (i / (grid - 1) - 0.5) * w * 0.82, 0.01,
                        (j / (grid - 1) - 0.5) * d * 0.82, group);
                }
            }
        } else if (kind === 'storage') {
            // A sealed housing, a label, a connector edge and four case screws.
            mk.box(w, 0.075, d, metalMat, 0, 0.045, 0, group);
            mk.box(w * 0.68, 0.016, d * 0.5, mk.mat({ color: 0xd9d4c8 }), 0, 0.0825, 0, group);
            mk.box(w * 0.78, 0.026, 0.03, chipMat, 0, 0.03, d / 2 - 0.018, group);
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
                mk.cyl(0.009, 0.009, 0.008, 6, chipMat, sx * w * 0.42, 0.085, sz * d * 0.4, group);
            });
        } else if (kind === 'display') {
            mk.box(w, 0.028, d, chipMat, 0, 0.018, 0, group);
            const face = panelFaceTexture(mk, arcane ? '#181425' : hybrid ? '#122028' : '#16211c');
            mk.box(w * 0.9, 0.022, d * 0.86, mk.mat({
                color: 0xffffff,
                map: face.texture,
                emissive: arcane ? 0x1a1226 : 0x081210
            }), 0, 0.035, 0, group);
            // The flat ribbon every panel is fed by.
            mk.box(w * 0.3, 0.016, 0.06, mk.mat({ color: 0xc8a05a }), 0, 0.032, d / 2 - 0.012, group);
        } else if (kind === 'battery') {
            const cells = Math.max(1, Math.round(Math.min(w, d) / 0.13));
            if (cells <= 1 || arcane) {
                mk.box(w, 0.09, d, mk.mat({ color: arcane ? 0x2b3f4a : 0x2f3236 }), 0, 0.05, 0, group);
                mk.box(w * 0.5, 0.02, d * 0.5, glowMat, 0, 0.097, 0, group);
                mk.box(w * 0.34, 0.014, 0.02, goldMat, -w * 0.2, 0.094, d * 0.34, group);
            } else {
                for (let i = 0; i < cells; i++) {
                    const t = (i + 0.5) / cells - 0.5;
                    const cyl = mk.cyl(Math.min(w, d) * 0.38, Math.min(w, d) * 0.38,
                        (lengthwise ? w : d) / cells * 0.86, 12, metalMat,
                        lengthwise ? t * w : 0, 0.05, lengthwise ? 0 : t * d, group);
                    if (lengthwise) cyl.rotation.z = Math.PI / 2;
                    else cyl.rotation.x = Math.PI / 2;
                }
                mk.box(lengthwise ? w * 0.9 : 0.02, 0.008, 0.02, goldMat, 0, 0.048, d * 0.42, group);
            }
        } else if (kind === 'cooling') {
            mk.box(w, 0.018, d, metalMat, 0, 0.012, 0, group);
            const fins = Math.max(3, Math.round(w / 0.04));
            for (let i = 0; i < fins; i++) {
                const t = (i + 0.5) / fins - 0.5;
                mk.box(0.011, 0.078, d * 0.9, metalMat, t * w * 0.94, 0.052, 0, group);
            }
            if (rng() < 0.5) {
                const hub = mk.cyl(Math.min(w, d) * 0.2, Math.min(w, d) * 0.2, 0.026, 10,
                    chipMat, 0, 0.095, 0, group);
                hub.userData.spins = true;
            }
        } else {
            mk.box(w, 0.055, d, pcbMat, 0, 0.035, 0, group);
        }

        // The arcane line wears a ring of standing motes instead of a heatsink.
        if (arcane) {
            const r = Math.min(w, d) * 0.42;
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                mk.box(0.022, 0.022, 0.022, glowMat,
                    Math.cos(a) * r, 0.135 + Math.sin(i) * 0.01, Math.sin(a) * r, group);
            }
        }

        // Flattened so a fitted part clears the rim of the case it is in.
        group.scale.y = PART_HEIGHT_SCALE;
        group.userData.disposables = sink;
        group.userData.kind = kind;
        return group;
    }

    //=========================================================================
    window.HyperDeckModels = {
        CELL: CELL,
        BOARD_CELLS: BOARD_CELLS,
        CASES: CASES,
        FACES: FACES,
        SHELL_FINISHES: SHELL_FINISHES,
        caseById(id) {
            return CASES.find(c => c.id === id) || CASES[0];
        },
        randomCase(rng) {
            const r = typeof rng === 'function' ? rng : Math.random;
            return CASES[Math.floor(r() * CASES.length) % CASES.length];
        },
        metrics: caseMetrics,
        cellCentre(def, c, r) {
            return cellCentre(def, caseMetrics(def), c, r);
        },
        buildCase: buildCase,
        buildFace: buildFace,
        buildComponent: buildComponent
    };
})();
