/*:
 * @target MZ
 * @plugindesc Pizza Maker 3D - design a pizza on a low poly 3D table, every topping drawn with its own item model, and save it to the recipe book or bake it for a customer.
 * @author nocoldiz
 *
 * @command openPizzaMaker
 * @text Open Pizza Maker
 * @desc Opens the 3D pizza table.
 *
 * @arg mode
 * @type select
 * @option kitchen
 * @option free
 * @default kitchen
 * @desc kitchen saves the pizza to the recipe book; free plays customer orders.
 *
 * @help
 * A dough base on a wooden board, a turntable and the pantry beside it. Up to
 * five toppings, picked from any food in the game, are laid on the pizza with
 * the 3D model each item already has (ItemModelSystem), so a pizza looks like
 * what went on it.
 *
 * Two ways to sit at the table:
 *
 *   kitchen  Opened from the kitchen (CookingSystem.js, "Create pizza"). The
 *            pizza is saved to the pizza book, the same one the star map's
 *            Pizza Delivery console sells from, and the kitchen opens on it in
 *            its Recipes tab, where it is baked out of the pack and eaten by
 *            the whole party.
 *   free     The free play minigame (title screen). A customer orders: two
 *            toppings they crave, one they will not eat and a budget for one
 *            pizza. A pizza is served for up to three stars.
 *
 * The scene follows the 3D minigame look: PSXShader on the stage, the art deco
 * PSXHud panels on top, the battleback of wherever the party stands behind it,
 * and the shared right stick swinging the camera (window.Controller).
 *
 * Pizza recipes live in window.GalaxySim.PizzaDelivery; the table only reads
 * and adds to that book. window.PizzaMaker3D holds the table's own rules.
 */

(() => {
    "use strict";

    const pluginName = "PizzaMaker3D";
    const T = (key, params) => (typeof window.T === "function" ? window.T("PizzaMaker." + key, params) : key);

    const MAX_TOPPINGS = 5;
    const COPIES = 6;                 // pieces of each topping scattered on the pizza
    const PIZZA_R = 1.0;              // the pizza's radius in stage units
    const TOP_Y = 0.075;              // the cheese the toppings sit on
    const PIECE_SIZE = 0.2;           // a topping's longest edge once fitted
    const BAKE_FRAMES = 96;
    const BASE_ITEM = 2113;           // every pizza goes on a Pizza Base
    const ROW_H = 11;
    const MODES = { kitchen: "kitchen", free: "free" };
    const STATE = { PICK: 0, BAKE: 1, RESULT: 2 };

    let Scene_PizzaMaker3D;
    let pendingMode = MODES.kitchen;

    PluginManager.registerCommand(pluginName, "openPizzaMaker", (args) => {
        open({ mode: args && args.mode });
    });

    function open(opts) {
        const mode = opts && opts.mode === MODES.free ? MODES.free : MODES.kitchen;
        pendingMode = mode;
        SceneManager.push(Scene_PizzaMaker3D);
    }

    //=========================================================================
    // Rules (no renderer needed, so the tests can read them)
    //=========================================================================
    function fnv1a(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h >>> 0;
    }

    function mulberry32(a) {
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function book() {
        const GS = window.GalaxySim;
        return GS && GS.PizzaDelivery ? GS.PizzaDelivery : null;
    }

    function itemName(item) {
        if (!item) return "";
        try {
            return typeof window.translateText === "function" ? window.translateText(item.name) : item.name;
        } catch (e) {
            return item.name;
        }
    }

    function foods() {
        const B = book();
        if (B && typeof B.foods === "function") return B.foods();
        const db = (typeof $dataItems !== "undefined" && $dataItems) ? $dataItems : [];
        return db.filter((it) => it && it.name && /<category:\s*Food>/i.test(it.note || ""));
    }

    function owned(item) {
        return (typeof $gameParty !== "undefined" && $gameParty && $gameParty.numItems)
            ? $gameParty.numItems(item) : 0;
    }

    // The pantry beside the table. At the kitchen what the pack holds comes
    // first, then everything else the pizza could be designed with.
    function pantryList(mode) {
        const list = foods().slice().sort((a, b) => itemName(a).localeCompare(itemName(b)));
        if (mode !== MODES.kitchen) return list;
        const have = list.filter((it) => owned(it) > 0);
        const rest = list.filter((it) => owned(it) <= 0);
        return have.concat(rest);
    }

    function toppingCost(id) {
        const B = book();
        if (B && B.toppingCost) return B.toppingCost(id);
        const it = $dataItems && $dataItems[id];
        return it ? Math.round((Number(it.price) || 0) * 0.15) : 0;
    }

    function unitCost(ids) {
        const B = book();
        if (B && B.unitCost) return B.unitCost(ids);
        return 150 + (ids || []).reduce((s, id) => s + toppingCost(id), 0);
    }

    // What is still to be found in the pack to make it: one of each topping
    // and a base.
    function missingFor(ids) {
        const need = (ids || []).slice();
        if ($dataItems[BASE_ITEM]) need.unshift(BASE_ITEM);
        return need.filter((id) => owned($dataItems[id]) <= 0).length;
    }

    function calories(ids) {
        let c = 0;
        for (const id of ids || []) {
            const m = /<calories:\s*(\d+)>/i.exec(($dataItems[id] && $dataItems[id].note) || "");
            if (m) c += Number(m[1]);
        }
        return c;
    }

    // A name off what went on it. A name already in the book gets a number.
    function pizzaName(ids, taken) {
        const names = (ids || []).map((id) => itemName($dataItems[id])).filter(Boolean);
        let base;
        if (!names.length) base = T("name.plain");
        else if (names.length === 1) base = T("name.one", { a: names[0] });
        else if (names.length === 2) base = T("name.two", { a: names[0], b: names[1] });
        else base = T("name.many", { a: names[0] });
        const used = new Set((taken || []).map((s) => String(s).toLowerCase()));
        if (!used.has(base.toLowerCase())) return base;
        for (let n = 2; n < 100; n++) {
            const alt = T("name.numbered", { name: base, n });
            if (!used.has(alt.toLowerCase())) return alt;
        }
        return base;
    }

    // A customer: two toppings they crave, one they will not eat, and what
    // one pizza may cost to make.
    function rollOrder(rand) {
        const r = rand || Math.random;
        const list = foods();
        if (list.length < 3) return null;
        const pick = () => list[Math.floor(r() * list.length)].id;
        const crave = [];
        while (crave.length < 2) {
            const id = pick();
            if (crave.indexOf(id) < 0) crave.push(id);
        }
        let shun = pick();
        while (crave.indexOf(shun) >= 0) shun = pick();
        // Enough for the two craved toppings and a couple more of the same worth.
        const budget = Math.round((unitCost(crave) + toppingCost(crave[0]) + toppingCost(crave[1]) + 200) / 50) * 50;
        return { crave, shun, budget };
    }

    // One star for each craved topping on it, one for leaving the shunned one
    // off without going over the budget.
    function scoreOrder(order, ids) {
        if (!order) return { stars: 0, hits: 0, shunned: false, over: false };
        const tops = ids || [];
        const hits = order.crave.filter((id) => tops.indexOf(id) >= 0).length;
        const shunned = tops.indexOf(order.shun) >= 0;
        const over = unitCost(tops) > order.budget;
        const stars = tops.length ? hits + (!shunned && !over ? 1 : 0) : 0;
        return { stars, hits, shunned, over };
    }

    // Where every piece goes: a sunflower spiral across the pizza, the
    // toppings dealt round it in turn so each one is spread over the whole
    // pizza, nudged a little so the spiral does not read as a pattern.
    function layoutToppings(count, copies, seed) {
        const out = [];
        const n = count * copies;
        if (!n) return out;
        const rand = mulberry32(seed || 1);
        const golden = Math.PI * (3 - Math.sqrt(5));
        const reach = PIZZA_R * 0.74;
        for (let i = 0; i < n; i++) {
            const rr = reach * Math.sqrt((i + 0.5) / n);
            const a = i * golden + (rand() - 0.5) * 0.35;
            const jitter = (rand() - 0.5) * 0.06;
            out.push({
                t: i % count,
                x: Math.cos(a) * (rr + jitter),
                z: Math.sin(a) * (rr + jitter),
                rot: rand() * Math.PI * 2,
                tilt: (rand() - 0.5) * 0.25,
            });
        }
        return out;
    }

    //=========================================================================
    // Backdrop: the battleback of wherever the party stands, the way the other
    // 3D minigames resolve it.
    //=========================================================================
    function currentBiomeName() {
        try {
            if ($gameMap && typeof $gameMap.getBiome === "function") {
                const tagged = $gameMap.getBiome();
                if (tagged) return tagged;
            }
            const proc = $gameSystem && $gameSystem._procGenData;
            if (proc && $gameMap && $gameMap.mapId() === 636 && proc.currentBiome) return proc.currentBiome;
            if ($gameMap && typeof $gameMap.isInterior === "function" && $gameMap.isInterior()) return "Dungeon";
        } catch (e) { /* default below */ }
        return "Fields";
    }

    function backdropBitmap() {
        try {
            let file = null;
            if (typeof ImageManager.getBiomeBackgroundForPlayer === "function") {
                file = ImageManager.getBiomeBackgroundForPlayer(currentBiomeName()) ||
                    ImageManager.getBiomeBackgroundForPlayer("Fields");
            }
            if (!file && $dataMap && $dataMap.battleback1Name) file = $dataMap.battleback1Name;
            if (file) return ImageManager.loadBattleback1(file);
        } catch (e) { /* the gradient alone */ }
        return null;
    }

    //=========================================================================
    // PizzaStage3D: the table, the board, the pizza and its toppings.
    //=========================================================================
    const PSX_SOFTEN = { vertexSnap: 1.4, colorLevels: 1.3, dither: 0.6, downscale: 1 };
    const softPSX = (fn) => (window.PSXShader && window.PSXShader.withScale)
        ? window.PSXShader.withScale(PSX_SOFTEN, fn) : fn();

    function canvasTexture(size, paint) {
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        paint(c.getContext("2d"), size);
        const tex = new THREE.CanvasTexture(c);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        return tex;
    }

    // i18n-ignore-start  colours of procedural textures
    function paintWood(ctx, s, rand) {
        ctx.fillStyle = "#6e4a2a";
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 2) {
            const k = Math.sin(y * 0.21 + rand() * 0.6) * 0.5 + 0.5;
            ctx.fillStyle = k > 0.62 ? "#5a3a20" : (k < 0.2 ? "#7d5632" : "#6a4628");
            ctx.fillRect(0, y, s, 1 + (rand() < 0.3 ? 1 : 0));
        }
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = "#4a2f18";
            ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 3, 2);
        }
    }

    function paintPizzaTop(ctx, s, rand) {
        const c = s / 2;
        ctx.fillStyle = "#e3bf7c";
        ctx.fillRect(0, 0, s, s);
        // Sauce, ragged at the edge.
        ctx.fillStyle = "#b02e1b";
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
            const a = (i / 48) * Math.PI * 2;
            const r = c * (0.86 + (rand() - 0.5) * 0.05);
            const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.fill();
        for (let i = 0; i < 140; i++) {
            const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * c * 0.84;
            ctx.fillStyle = rand() < 0.5 ? "#8f2214" : "#c4421f";
            ctx.fillRect(Math.floor(c + Math.cos(a) * r), Math.floor(c + Math.sin(a) * r), 2, 2);
        }
        // Melted cheese in pools.
        for (let i = 0; i < 26; i++) {
            const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * c * 0.74;
            const rad = c * (0.07 + rand() * 0.09);
            ctx.fillStyle = rand() < 0.7 ? "#f4e2a1" : "#ead07a";
            ctx.beginPath();
            ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, rad, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function paintCrust(ctx, s, rand) {
        ctx.fillStyle = "#d39a52";
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < s * 2; i++) {
            ctx.fillStyle = rand() < 0.5 ? "#a8692e" : "#e7b874";
            ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 2, 1);
        }
    }
    // i18n-ignore-end

    class PizzaStage3D {
        constructor(w, h, seed) {
            this._w = w;
            this._h = h;
            this._disposables = [];
            this._pieces = [];
            this._spin = 0;
            this._spinSpeed = 0.18;
            this._bake = 0;
            this._rand = mulberry32(seed || 7);
            this._initThree();
            softPSX(() => this._build());
            this._camLook = new THREE.Vector3(0, 0.05, 0);
            this.camera.position.set(0, 2.15, 2.35);
            this.camera.lookAt(this._camLook);
        }

        get domElement() { return this.renderer.domElement; }

        _initThree() {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(42, this._w / this._h, 0.05, 60);
            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(this._w, this._h);
            this.renderer.setClearColor(0x000000, 0);
            this.scene.add(new THREE.AmbientLight(0xffe8cc, 0.7));
            const sun = new THREE.DirectionalLight(0xfff2d8, 0.85);
            sun.position.set(2.5, 6, 3.5);
            this.scene.add(sun);
            // The oven: dark until a pizza goes in.
            this._oven = new THREE.PointLight(0xff7a2a, 0, 6, 2);
            this._oven.position.set(0, 1.1, 0.4);
            this.scene.add(this._oven);
        }

        _track(x) { this._disposables.push(x); return x; }

        _build() {
            const rand = this._rand;
            const wood = this._track(canvasTexture(64, (ctx, s) => paintWood(ctx, s, rand)));
            wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
            wood.repeat.set(3, 3);
            const table = new THREE.Mesh(
                this._track(new THREE.BoxGeometry(5.5, 0.2, 3.6)),
                this._track(new THREE.MeshLambertMaterial({ map: wood })));
            table.position.y = -0.16;
            this.scene.add(table);

            this.turntable = new THREE.Group();
            this.scene.add(this.turntable);

            const boardTex = this._track(canvasTexture(64, (ctx, s) => paintWood(ctx, s, rand)));
            const board = new THREE.Mesh(
                this._track(new THREE.CylinderGeometry(PIZZA_R * 1.14, PIZZA_R * 1.14, 0.06, 20)),
                this._track(new THREE.MeshLambertMaterial({ map: boardTex, color: 0xd8b48a })));
            board.position.y = -0.03;
            this.turntable.add(board);

            const topTex = this._track(canvasTexture(128, (ctx, s) => paintPizzaTop(ctx, s, rand)));
            this._topMat = this._track(new THREE.MeshLambertMaterial({ map: topTex }));
            const sideMat = this._track(new THREE.MeshLambertMaterial({ color: 0xd8a560 }));
            const base = new THREE.Mesh(
                this._track(new THREE.CylinderGeometry(PIZZA_R, PIZZA_R, 0.06, 24)),
                [sideMat, this._topMat, sideMat]);
            base.position.y = 0.03;
            this.turntable.add(base);

            const crustTex = this._track(canvasTexture(32, (ctx, s) => paintCrust(ctx, s, rand)));
            crustTex.wrapS = crustTex.wrapT = THREE.RepeatWrapping;
            crustTex.repeat.set(8, 1);
            this._crustMat = this._track(new THREE.MeshLambertMaterial({ map: crustTex }));
            const crust = new THREE.Mesh(
                this._track(new THREE.TorusGeometry(PIZZA_R * 0.96, 0.07, 6, 28)),
                this._crustMat);
            crust.rotation.x = Math.PI / 2;
            crust.position.y = 0.065;
            this.turntable.add(crust);

            this._pieceRoot = new THREE.Group();
            this.turntable.add(this._pieceRoot);
            if (window.PSXShader && window.PSXShader.applyToObject) window.PSXShader.applyToObject(this.scene);
        }

        // One piece of a topping, as the item's own 3D model, laid down and
        // fitted to the size of a slice of something on a pizza.
        _piece(item) {
            const IMS = window.ItemModelSystem;
            let model = null;
            try { model = IMS && IMS.createModel ? IMS.createModel(item) : null; } catch (e) { model = null; }
            if (!model) {
                const hue = (fnv1a(item.name) % 360) / 360;
                const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.55, 0.5) });
                model = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), mat);
                model.userData.pizzaOwned = true;
            }
            const holder = new THREE.Group();
            holder.add(model);
            let box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            // A tall thing (a bottle, a leek) is laid on its side.
            if (size.y > Math.max(size.x, size.z) * 1.4) model.rotation.z = Math.PI / 2;
            box = new THREE.Box3().setFromObject(model);
            box.getSize(size);
            const k = PIECE_SIZE / Math.max(0.0001, size.x, size.y, size.z);
            model.scale.multiplyScalar(k);
            box = new THREE.Box3().setFromObject(model);
            const centre = box.getCenter(new THREE.Vector3());
            model.position.x -= centre.x;
            model.position.z -= centre.z;
            model.position.y -= box.min.y;
            return holder;
        }

        setToppings(ids) {
            this._clearPieces();
            const items = (ids || []).map((id) => $dataItems[id]).filter(Boolean);
            if (!items.length) return;
            const spots = layoutToppings(items.length, COPIES, fnv1a(ids.join(",")));
            softPSX(() => {
                for (const s of spots) {
                    const piece = this._piece(items[s.t]);
                    piece.position.set(s.x, TOP_Y, s.z);
                    piece.rotation.set(s.tilt, s.rot, 0);
                    this._pieceRoot.add(piece);
                    this._pieces.push(piece);
                }
                if (window.PSXShader && window.PSXShader.applyToObject) window.PSXShader.applyToObject(this._pieceRoot);
            });
        }

        // Item models hand out their own materials and shared geometry whose
        // dispose() the model cache has already made harmless.
        _clearPieces() {
            for (const p of this._pieces) {
                this._pieceRoot.remove(p);
                p.traverse((o) => {
                    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
                    if (o.geometry && o.geometry.dispose) o.geometry.dispose();
                });
            }
            this._pieces = [];
        }

        startBake() { this._bake = 0.0001; this._spinSpeed = 1.6; }
        resetBake() {
            this._bake = 0;
            this._spinSpeed = 0.18;
            this._oven.intensity = 0;
            this._topMat.color.setRGB(1, 1, 1);
            this._crustMat.color.setRGB(1, 1, 1);
        }

        turn(d) { this._spin += d; }

        update(dt, bakeT) {
            this._spin += this._spinSpeed * dt;
            this.turntable.rotation.y = this._spin;
            if (this._bake > 0) {
                // The oven glows up and dies away; the crust and cheese brown.
                const t = Math.max(0, Math.min(1, bakeT));
                this._oven.intensity = Math.sin(t * Math.PI) * 2.4;
                const brown = 1 - 0.22 * t;
                this._topMat.color.setRGB(1, brown + 0.06 * t, brown - 0.04 * t);
                this._crustMat.color.setRGB(1, brown, brown - 0.08 * t);
                this._spinSpeed = 1.6 * (1 - t) + 0.18 * t;
            }
            if (!this._orbit && window.Controller) this._orbit = window.Controller.orbit({ minPitch: -0.3, maxPitch: 0.9 });
            this.camera.position.set(0, 2.15, 2.35);
            this.camera.lookAt(this._camLook);
            if (this._orbit) {
                this._orbit.update(dt);
                this._orbit.applyTo(this.camera, this._camLook);
            }
        }

        render() {
            if (window.PSXShader) softPSX(() => window.PSXShader.render(this.renderer, this.scene, this.camera));
            else this.renderer.render(this.scene, this.camera);
        }

        dispose() {
            this._clearPieces();
            for (const x of this._disposables) {
                if (x && x.dispose) { try { x.dispose(); } catch (e) { /* already gone */ } }
            }
            this._disposables = [];
            if (this.renderer) {
                if (window.PSXShader && window.PSXShader.disposeContext) window.PSXShader.disposeContext(this.renderer);
                this.renderer.dispose();
                if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
                this.renderer = null;
            }
        }
    }

    //=========================================================================
    // HUD: art deco panels in the 240 line framebuffer, type on the DOM layer.
    //=========================================================================
    const HUD = () => window.PSXHud;
    const hudW = () => (HUD() ? HUD().baseWidth() : 320);
    const hudScale = () => (HUD() ? HUD().scale() : Graphics.height / 240);
    let PIZZA_DOMS = [];

    function money(gold) {
        const PT = window.ParchmentToast;
        return PT && PT.money ? PT.money(gold) : (Math.round(gold) / 100).toFixed(2);
    }

    class Sprite_PizzaWidget extends Sprite {
        constructor(vw, vh, vx, vy) {
            super();
            this._vw = vw;
            this._vh = vh;
            this._vx = vx;
            this._vy = vy;
            this.bitmap = new Bitmap(vw, vh);
            this.bitmap.smooth = false;
            this.bitmap.outlineWidth = 0;
            if (HUD()) this.bitmap.fontFace = HUD().font();
            const s = hudScale();
            this.scale.set(s, s);
            this.x = Math.round(vx * s);
            this.y = Math.round(vy * s);
        }

        dom() {
            const H = HUD();
            if (!H || !H.domPanel) return null;
            if (!this._dom) {
                this._dom = H.domPanel(this);
                PIZZA_DOMS.push(this._dom);
            }
            return this._dom;
        }

        beginText() { const d = this.dom(); if (d) d.begin(); }
        hudText(str, x, y, w, align, color, size) {
            if (this._dom) this._dom.text(str, x, y, w, align, color, size || 8);
            else if (HUD()) HUD().text(this.bitmap, str, x, y, w, align, color, size || 8);
        }
        endText() { if (this._dom) this._dom.end(); }

        // The panel row under a screen point, or -1.
        rowAt(px, py, top) {
            const s = hudScale();
            const vx = px / s - this._vx, vy = py / s - this._vy - top;
            if (vx < 0 || vx > this._vw || vy < 0) return -1;
            return Math.floor(vy / ROW_H);
        }
    }

    // The pantry: the table's commands, then every food.
    class Sprite_PizzaPantry extends Sprite_PizzaWidget {
        constructor(vh) {
            super(156, vh, 4, 4);
            this._top = 16;
            this.rows = Math.floor((vh - this._top - 4) / ROW_H);
        }

        refresh(view) {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { title: view.title, titleRight: view.titleRight, dom: this._dom, step: 1 });
            const first = view.scroll;
            for (let r = 0; r < this.rows; r++) {
                const i = first + r;
                const e = view.entries[i];
                if (!e) break;
                const y = this._top + r * ROW_H;
                if (i === view.cursor) H.decoSelect(bmp, 3, y, this._vw - 6, ROW_H, D.gold);
                if (e.rule) H.decoRule(bmp, 8, y + ROW_H - 2, this._vw - 16, D.goldLo);
                const col = e.disabled ? D.faint : (e.on ? D.goldHi : (e.command ? D.gold : D.ink));
                this.hudText((e.on ? "+ " : "") + e.label, 8, y, this._vw - 50, "left", col, 8);
                if (e.right) this.hudText(e.right, this._vw - 46, y, 40, "right", e.on ? D.gold : D.dim, 8);
            }
            if (view.entries.length > this.rows) {
                const frac = first / Math.max(1, view.entries.length - this.rows);
                const trackH = this.rows * ROW_H;
                bmp.fillRect(this._vw - 3, this._top, 1, trackH, D.goldLo);
                bmp.fillRect(this._vw - 4, this._top + Math.round(frac * (trackH - 6)), 3, 6, D.gold);
            }
            this.endText();
        }
    }

    // A panel of plain lines under a header band.
    class Sprite_PizzaCard extends Sprite_PizzaWidget {
        refresh(title, lines) {
            const H = HUD();
            if (!H) return;
            const D = H.DECO;
            const bmp = this.bitmap;
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { title, dom: this._dom, step: 1 });
            let y = 15;
            for (const l of lines) {
                if (y + 10 > this._vh) break;
                if (l.rule) { H.decoRule(bmp, 8, y + 4, this._vw - 16, D.goldLo); y += 8; continue; }
                this.hudText(l.text, 7, y, this._vw - 14, l.align || "left", l.color || D.ink, 8);
                y += 10;
            }
            this.endText();
        }
    }

    class Sprite_PizzaStatus extends Sprite_PizzaWidget {
        constructor() {
            super(hudW(), 14, 0, 226);
            this._text = "";
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
            bmp.clear();
            this.beginText();
            H.decoPanel(bmp, 0, 0, this._vw, this._vh, { hairline: false, corners: false });
            this.hudText(this._text, 8, 1, this._vw - 16, "center", H.DECO.ink, 8);
            this.endText();
        }
    }

    //=========================================================================
    // Scene_PizzaMaker3D
    //=========================================================================
    Scene_PizzaMaker3D = class extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._mode = pendingMode;
            pendingMode = MODES.kitchen;
            this._threeReady = typeof THREE !== "undefined";
            this._uiFontExempt = true;
            this._state = STATE.PICK;
            this._toppings = [];
            this._cursor = 0;
            this._scroll = 0;
            this._bakeFrame = 0;
            this._order = this._mode === MODES.free ? rollOrder() : null;
            this._result = null;
            this._pantry = pantryList(this._mode);
            this._status = T(this._mode === MODES.free ? "status.free" : "status.kitchen");
        }

        create() {
            super.create();
            if (this._threeReady) this.createStage();
            this.createUI();
            if (!this._threeReady) this._status = T("noThree");
            this.refreshAll();
        }

        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.gradientFillRect(0, 0, 8, 8, "#2a1a10", "#0c0806", true);  // i18n-ignore  colours
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
            const bitmap = backdropBitmap();
            if (bitmap) {
                this._backdrop = new Sprite(bitmap);
                this.addChild(this._backdrop);
                const fit = () => {
                    const sp = this._backdrop;
                    if (!sp || !sp.bitmap || !sp.bitmap.width) return;
                    const k = Math.max(Graphics.width / sp.bitmap.width, Graphics.height / sp.bitmap.height);
                    sp.scale.set(k, k);
                    sp.x = (Graphics.width - sp.bitmap.width * k) / 2;
                    sp.y = Graphics.height - sp.bitmap.height * k;
                };
                bitmap.addLoadListener(fit);
                fit();
            }
            const shade = new Sprite(new Bitmap(8, 8));
            shade.bitmap.fillAll("rgba(6, 4, 2, 0.45)");  // i18n-ignore  colour
            shade.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(shade);
        }

        createStage() {
            const k = 0.88;
            const w = Math.round(Graphics.width * k), h = Math.round(Graphics.height * k);
            this._stage = new PizzaStage3D(w, h, fnv1a(this._mode + Date.now()));
            const texture = PIXI.Texture.from(this._stage.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._stageSprite = new PIXI.Sprite(texture);
            this._stageSprite.scale.set(Graphics.width / w, Graphics.height / h);
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._stageSprite, idx);
        }

        createUI() {
            this._pantrySprite = new Sprite_PizzaPantry(218);
            this.addChild(this._pantrySprite);
            this._card = new Sprite_PizzaCard(150, 112, hudW() - 154, 4);
            this.addChild(this._card);
            if (this._mode === MODES.free) {
                this._orderCard = new Sprite_PizzaCard(150, 66, hudW() - 154, 120);
                this.addChild(this._orderCard);
            }
            this._statusSprite = new Sprite_PizzaStatus();
            this.addChild(this._statusSprite);
            this._resultCard = new Sprite_PizzaCard(200, 70, Math.round((hudW() - 200) / 2), 150);
            this._resultCard.visible = false;
            this.addChild(this._resultCard);
            if (HUD() && HUD().onFontReady) HUD().onFontReady(() => { if (this._card) this.refreshAll(); });
        }

        //--- what the panels show ---------------------------------------------

        commands() {
            const first = this._mode === MODES.free
                ? { cmd: "serve", label: T("cmd.serve") }
                : { cmd: "save", label: T("cmd.save") };
            return [first, { cmd: "clear", label: T("cmd.clear") }, { cmd: "leave", label: T("cmd.leave"), rule: true }];
        }

        entries() {
            const full = this._toppings.length >= MAX_TOPPINGS;
            const cmds = this.commands().map((c) => Object.assign({ command: true,
                disabled: (c.cmd === "serve" || c.cmd === "save" || c.cmd === "clear") && !this._toppings.length }, c));
            const foodsRows = this._pantry.map((it) => {
                const on = this._toppings.indexOf(it.id) >= 0;
                const right = this._mode === MODES.kitchen
                    ? (owned(it) > 0 ? "x" + owned(it) : "-")
                    : "+" + money(toppingCost(it.id));
                return { item: it, label: itemName(it), right, on, disabled: full && !on };
            });
            return cmds.concat(foodsRows);
        }

        name() {
            const B = book();
            const taken = B && typeof $gameSystem !== "undefined" && $gameSystem ? B.recipes().map((r) => r.name) : [];
            return pizzaName(this._toppings, taken);
        }

        refreshAll() {
            const H = HUD();
            const D = H ? H.DECO : {};
            const entries = this.entries();
            this._entries = entries;
            const rows = this._pantrySprite.rows;
            if (this._cursor < this._scroll) this._scroll = this._cursor;
            if (this._cursor >= this._scroll + rows) this._scroll = this._cursor - rows + 1;
            this._scroll = Math.max(0, Math.min(this._scroll, Math.max(0, entries.length - rows)));
            this._pantrySprite.refresh({
                title: T("pantry"), titleRight: this._toppings.length + "/" + MAX_TOPPINGS,
                entries, cursor: this._cursor, scroll: this._scroll,
            });

            const lines = [];
            for (let i = 0; i < MAX_TOPPINGS; i++) {
                const id = this._toppings[i];
                lines.push(id ? { text: (i + 1) + ". " + itemName($dataItems[id]) }
                    : { text: (i + 1) + ". " + T("emptySlot"), color: D.faint });
            }
            lines.push({ rule: true });
            lines.push({ text: T("card.cost", { cost: money(unitCost(this._toppings)) }), color: D.dim });
            lines.push({ text: T("card.kcal", { kcal: Math.round(calories(this._toppings) * 1.1) }), color: D.dim });
            if (this._mode === MODES.kitchen && $dataItems[BASE_ITEM]) {
                lines.push(owned($dataItems[BASE_ITEM]) > 0
                    ? { text: T("card.base", { n: owned($dataItems[BASE_ITEM]) }), color: D.dim }
                    : { text: T("card.noBase"), color: D.red });
            }
            if (this._mode === MODES.kitchen && this._toppings.length) {
                const missing = missingFor(this._toppings);
                lines.push(missing ? { text: T("card.missing", { n: missing }), color: D.red }
                    : { text: T("card.allInPack"), color: D.green });
            }
            this._card.refresh(this.name(), lines);

            if (this._orderCard && this._order) {
                const o = this._order;
                const on = (id) => this._toppings.indexOf(id) >= 0;
                this._orderCard.refresh(T("order.title"), [
                    { text: T("order.crave", { a: itemName($dataItems[o.crave[0]]) }), color: on(o.crave[0]) ? D.green : D.ink },
                    { text: T("order.crave", { a: itemName($dataItems[o.crave[1]]) }), color: on(o.crave[1]) ? D.green : D.ink },
                    { text: T("order.shun", { a: itemName($dataItems[o.shun]) }), color: on(o.shun) ? D.red : D.dim },
                    { text: T("order.budget", { cost: money(o.budget) }),
                        color: unitCost(this._toppings) > o.budget ? D.red : D.dim },
                ]);
            }
            this._statusSprite.setText(this._status);
        }

        //--- the loop ----------------------------------------------------------

        update() {
            super.update();
            if (this._state === STATE.PICK) this.updatePick();
            else if (this._state === STATE.BAKE) this.updateBake();
            else this.updateResult();
            for (const d of PIZZA_DOMS) if (d.sync) d.sync();
            if (this._stage) {
                this._stage.update(1 / 60, this._bakeFrame / BAKE_FRAMES);
                this._stage.render();
                if (this._stageSprite && this._stageSprite.texture) this._stageSprite.texture.update();
            }
        }

        updatePick() {
            const n = this._entries.length;
            let moved = false;
            if (Input.isRepeated("down")) { this._cursor = (this._cursor + 1) % n; moved = true; }
            else if (Input.isRepeated("up")) { this._cursor = (this._cursor - 1 + n) % n; moved = true; }
            else if (Input.isRepeated("pagedown")) { this._cursor = Math.min(n - 1, this._cursor + this._pantrySprite.rows); moved = true; }
            else if (Input.isRepeated("pageup")) { this._cursor = Math.max(0, this._cursor - this._pantrySprite.rows); moved = true; }
            if (Input.isPressed("left") && this._stage) this._stage.turn(-0.05);
            if (Input.isPressed("right") && this._stage) this._stage.turn(0.05);
            if (TouchInput.wheelY) {
                this._scroll = Math.max(0, this._scroll + (TouchInput.wheelY > 0 ? 3 : -3));
                this._cursor = Math.max(this._scroll, Math.min(this._cursor, this._scroll + this._pantrySprite.rows - 1, n - 1));
                moved = true;
            }
            if (TouchInput.isTriggered()) {
                const r = this._pantrySprite.rowAt(TouchInput.x, TouchInput.y, this._pantrySprite._top);
                if (r >= 0 && r < this._pantrySprite.rows && this._scroll + r < n) {
                    this._cursor = this._scroll + r;
                    this.activate();
                    return;
                }
            }
            if (moved) { SoundManager.playCursor(); this.refreshAll(); return; }
            if (Input.isTriggered("ok")) { this.activate(); return; }
            if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                SoundManager.playCancel();
                this.popScene();
            }
        }

        activate() {
            const e = this._entries[this._cursor];
            if (!e) return;
            if (e.disabled) { SoundManager.playBuzzer(); return; }
            if (e.command) return this.runCommand(e.cmd);
            const id = e.item.id;
            const at = this._toppings.indexOf(id);
            if (at >= 0) this._toppings.splice(at, 1);
            else this._toppings.push(id);
            SoundManager.playOk();
            this._status = at >= 0 ? T("status.removed", { a: e.label }) : T("status.added", { a: e.label });
            if (this._stage) this._stage.setToppings(this._toppings);
            this.refreshAll();
        }

        runCommand(cmd) {
            if (cmd === "leave") { SoundManager.playCancel(); this.popScene(); return; }
            if (cmd === "clear") {
                this._toppings = [];
                if (this._stage) this._stage.setToppings([]);
                SoundManager.playCancel();
                this._status = T("status.cleared");
                this.refreshAll();
                return;
            }
            // save / serve: into the oven.
            SoundManager.playOk();
            this._state = STATE.BAKE;
            this._bakeFrame = 0;
            this._status = T("status.baking");
            if (this._stage) this._stage.startBake();
            this.refreshAll();
        }

        updateBake() {
            this._bakeFrame++;
            if (this._bakeFrame < BAKE_FRAMES && !(this._stage == null && this._bakeFrame > 4)) return;
            this._bakeFrame = BAKE_FRAMES;
            this._state = STATE.RESULT;
            this._result = this._mode === MODES.free ? this.finishOrder() : this.finishSave();
            const H = HUD();
            const D = H ? H.DECO : {};
            this._resultCard.refresh(this._result.title, this._result.lines.map((t) => ({ text: t, align: "center", color: D.ink })));
            this._resultCard.visible = true;
            this._status = T("status.continue");
            this.refreshAll();
        }

        finishSave() {
            const B = book();
            const name = this.name();
            const res = B ? B.createRecipe(name, this._toppings) : { ok: false, reason: "noBook" };
            if (!res.ok) {
                SoundManager.playBuzzer();
                return { ok: false, title: T("result.failTitle"), lines: [T("error." + res.reason)] };
            }
            this._savedId = res.recipe.id;
            const missing = missingFor(this._toppings);
            return {
                ok: true, title: T("result.savedTitle"),
                lines: [res.recipe.name, missing ? T("result.missing", { n: missing }) : T("result.ready")],
            };
        }

        finishOrder() {
            const sc = scoreOrder(this._order, this._toppings);
            const F = window.MinigameFun;
            if (F) {
                try {
                    if (sc.stars >= 3) F.won("Cooking");  // i18n-ignore  Specialization.json id
                    else if (sc.stars === 2) F.draw("Cooking");  // i18n-ignore  Specialization.json id
                    else F.lost("Cooking");  // i18n-ignore  Specialization.json id
                } catch (e) { /* the fun is optional */ }
            }
            if (sc.stars >= 2) SoundManager.playShop ? SoundManager.playShop() : SoundManager.playOk();
            else SoundManager.playBuzzer();
            const lines = [T("result.stars", { n: sc.stars })];
            if (sc.shunned) lines.push(T("result.shunned"));
            else if (sc.over) lines.push(T("result.over"));
            else lines.push(T("result.hits", { n: sc.hits }));
            return { ok: true, title: T("result.servedTitle"), lines, stars: sc.stars };
        }

        updateResult() {
            if (!(Input.isTriggered("ok") || Input.isTriggered("cancel") || TouchInput.isTriggered() || TouchInput.isCancelled())) return;
            SoundManager.playOk();
            if (this._mode === MODES.kitchen) {
                if (this._result && this._result.ok && window.CookingSystem && window.CookingSystem.focusPizzaNextOpen) {
                    window.CookingSystem.focusPizzaNextOpen(this._savedId);
                }
                this.popScene();
                return;
            }
            // Free play: the next customer.
            this._order = rollOrder();
            this._toppings = [];
            this._resultCard.visible = false;
            if (this._stage) { this._stage.resetBake(); this._stage.setToppings([]); }
            this._state = STATE.PICK;
            this._bakeFrame = 0;
            this._status = T("status.free");
            this.refreshAll();
        }

        terminate() {
            super.terminate();
            for (const d of PIZZA_DOMS) d.destroy();
            PIZZA_DOMS = [];
            if (this._stageSprite) {
                if (this._stageSprite.parent) this._stageSprite.parent.removeChild(this._stageSprite);
                this._stageSprite.destroy();
                this._stageSprite = null;
            }
            if (this._stage) { this._stage.dispose(); this._stage = null; }
        }
    };

    window.Scene_PizzaMaker3D = Scene_PizzaMaker3D;
    window.PizzaMaker3D = {
        MODES, MAX_TOPPINGS, COPIES,
        open, foods, pantryList, missingFor, pizzaName, rollOrder, scoreOrder, layoutToppings, unitCost, calories,
    };
})();
