//=============================================================================
// TargetShootingRange.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc First-person low-poly 3D shooting range v1.0.0
 * @author Esoteric Heavy Industries
 * @version 1.0.0
 *
 * @help TargetShootingRange.js
 *
 * A first-person target range rendered with three.js through the shared PSX
 * shader (PSXShader.js), built the way the surf break and the bowling alley
 * are: real geometry, a real simulation underneath it, and a HUD drawn in a
 * 240-line virtual framebuffer with the labels on top of it as crisp type.
 *
 * The weapon in frame is not a picture. It is the same Sprite_3DWeapon the
 * battle overlay raises (Weapon3DOverlay.js), built, posed, aimed and fired by
 * WeaponSystemProcedural, so every gun and bow in the database handles here
 * exactly as it does in a fight. Nothing is equipped on the actor: the range
 * hands you something over the counter and takes it back at the door.
 *
 * ONLY WHAT SHOOTS
 * The rack holds weapon types 7, 8 and 9 (Bow, Projectile, Gun) and nothing
 * else. A sword has no business on a firing line.
 *
 * WHAT COMES OUT OF THE BARREL IS NOT ALWAYS A BULLET
 *   Gun (9)         hitscan, with a tracer, a magazine and a reload
 *   Bow (7)         a real arrow: 62 m/s, and it falls the whole way
 *   Projectile (8)  slower and heavier still, so far targets need loft
 * A distant bull with a bow is therefore a different shot from a distant bull
 * with a rifle, which is the entire reason for having both on the counter.
 *
 * CONTROLS
 *   MOUSE          look; the first click grabs the pointer
 *   ARROWS         look, for anyone not using a mouse
 *   RIGHT STICK    look, on a pad
 *   CLICK / R1 R2  shoot (Z or Enter do it too)
 *   D-PAD UP/DOWN  change weapon, and raise the rack list
 *   WHEEL, L2      the same, on a mouse and on the left trigger
 *   Q / E          the same, on a keyboard
 *   SHIFT          reload, when the thing in hand has a magazine
 *   ESC            leave the range
 *
 * The d-pad is the rack and nothing else: on a pad the range is aimed with the
 * right stick, so up and down on the cross are free to step the weapon, and the
 * arrow KEYS still aim for anyone playing without a mouse.
 *
 * THE RACK LIST
 * Stepping the weapon raises the rack down the right-hand
 * side of the screen: every ranged weapon in the game in alphabetical order,
 * with the one in hand lit. It fades out on its own a moment after the last
 * change. The party leader's own weapon is the one dealt first whenever it is
 * something that shoots, so you walk up to the line with what you carry.
 *
 * TARGETS
 *   Bullseye plates   still, on posts; the rings pay 8 / 15 / 25
 *   Poppers           steel silhouettes that stand up for a few seconds, 30
 *   Bottles           sliding along a rail at close range, 20
 *   Clays             launched across the range and falling, 60
 * Hits in a row build a multiplier. A miss puts it back to one, so the range
 * is not a question of how fast you can pull but of how honest your aim is.
 *
 * Requires js/libs/three.min.js. Uses Battler3D/PSXShader.js when present.
 *
 * @param roundSeconds
 * @text Round Length
 * @type number
 * @min 20
 * @max 300
 * @desc How many seconds the range stays hot.
 * @default 75
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
 * @desc Multiplier on mouse and arrow-key aiming.
 * @default 1.00
 *
 * @param resultVariable
 * @text Result Variable
 * @type variable
 * @desc Variable the final score is written to. 0 writes nowhere.
 * @default 0
 *
 * @command startTargetRange
 * @text Start Shooting Range
 * @desc Opens the first-person target range.
 */

(() => {
    'use strict';

    const PLUGIN_NAME = 'TargetShootingRange';
    const P = PluginManager.parameters(PLUGIN_NAME);
    const numP = (key, def) => {
        const v = parseFloat(P[key]);
        return isFinite(v) ? v : def;
    };

    const ROUND_SECONDS = Math.max(20, Math.round(numP('roundSeconds', 75)));
    const RENDER_SCALE  = Math.max(0.3, Math.min(1, numP('renderScale', 0.72)));
    const LOOK_SPEED    = Math.max(0.2, Math.min(3, numP('lookSpeed', 1)));
    const RESULT_VAR    = Math.round(numP('resultVariable', 0));

    //=========================================================================
    // Tunables. Metres and seconds throughout, the player at the origin
    // looking down -Z, which is the way a three.js camera faces by default.
    //=========================================================================
    const RANGE_LEN   = 72;      // firing line to backstop
    const RANGE_HALF  = 21;      // half the width between the side walls
    const EYE_H       = 1.62;    // eye height at the counter
    const SIM_DT      = 1 / 60;
    const RENDER_FPS  = 30;      // the 3D pass; the simulation stays at 60

    // The bottle rail. Near and low: the bottles must clear neither the eye
    // line to the closest plate (z -17, face bottom y 1.15) nor the popper
    // berms behind it, or a moving target would screen every still one.
    const RAIL_Z      = -10;     // rail distance from the firing line
    const RAIL_Y      = 0.55;    // rail top; a bottle stands ~0.7 above it

    const PITCH_MIN   = -0.62;
    const PITCH_MAX   = 0.42;
    const YAW_LIM     = 0.95;    // the lane is a lane: you cannot turn around

    // The PSX pass, pushed harder than the battle default. A range is flat
    // colour and hard edges and wants the wobble.
    const PSX_HARD = { vertexSnap: 0.6, colorLevels: 0.8, dither: 1.25 };

    // Scoring.
    const PTS = { bullInner: 25, bullMid: 15, bullOuter: 8, popper: 30, bottle: 20, clay: 60 };
    const PAR_SCORE = 1200;

    // Weapon behaviour by database type. `mag` of 0 is a thing with no
    // magazine, which is every bow ever made.
    const WTYPE_BOW  = 7;
    const WTYPE_THRW = 8;
    const WTYPE_GUN  = 9;
    const BALLISTICS = {
        [WTYPE_GUN]:  { hitscan: true,  cooldown: 0.17, mag: 10, reload: 1.5, speed: 0,  grav: 0,    kick: 0.030 },
        [WTYPE_BOW]:  { hitscan: false, cooldown: 0.85, mag: 0,  reload: 0,   speed: 62, grav: 9.81, kick: 0.012 },
        [WTYPE_THRW]: { hitscan: false, cooldown: 0.62, mag: 0,  reload: 0,   speed: 34, grav: 11.5, kick: 0.016 }
    };

    // How long the rack stays up after the last change.
    const RACK_HOLD  = 2.8;
    const RACK_ROWS  = 12;
    const TRIGGER_ON = 0.55;     // an analog trigger counts as pulled past here
    const TRIGGER_OFF = 0.30;    // and released back under here

    //=========================================================================
    // Helpers
    //=========================================================================
    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const rand  = (a, b) => a + Math.random() * (b - a);
    const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

    function three3DReady() {
        return typeof THREE !== 'undefined' && typeof THREE.WebGLRenderer === 'function';
    }

    function weaponsReady() {
        return !!(window.Sprite_3DWeapon && window.WeaponThreeScene && window.WeaponSystemProcedural);
    }

    /** Ranged weapons only, alphabetical, without the database's own dividers. */
    function rangedWeapons() {
        if (typeof $dataWeapons === 'undefined' || !$dataWeapons) return [];
        const out = [];
        for (const w of $dataWeapons) {
            if (!w || !w.name) continue;
            if (!BALLISTICS[w.wtypeId]) continue;
            // '<-- Gun -->' and its siblings are section markers in the editor,
            // not weapons, and nobody can shoot one.
            if (/^<--/.test(w.name)) continue;
            out.push(w);
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }

    /** What the party leader walks in carrying, when it is something that shoots. */
    function leaderRangedWeapon() {
        try {
            const actor = $gameParty && $gameParty.members()[0];
            if (!actor) return null;
            for (const w of actor.weapons()) {
                if (w && w.name && BALLISTICS[w.wtypeId]) return w;
            }
        } catch (e) { /* an empty party is not an error here */ }
        return null;
    }

    function se(name, pitch, volume) {
        try {
            AudioManager.playSe({ name: name, volume: volume == null ? 80 : volume, pitch: pitch || 100, pan: 0 });
        } catch (e) { /* a missing SE must never break a game */ }
    }

    //=========================================================================
    // RangeWorld3D: the range itself, and everything standing in it.
    //=========================================================================
    class RangeWorld3D {
        constructor(width, height) {
            this._w = width;
            this._h = height;
            this._junk = [];
            this._targets = [];
            this._hitMeshes = [];
            this._projectiles = [];
            this._debris = [];
            this._tracers = [];
            this._time = 0;
            this._initThree();
            this._buildGround();
            this._buildWalls();
            this._buildFiringPoint();
            this._buildHills();
            this._buildPlates();
            this._buildRail();
            this._buildPopperBerms();
        }

        get domElement() { return this.renderer.domElement; }

        //--- three.js scaffolding --------------------------------------------

        _initThree() {
            this.scene = new THREE.Scene();
            // Sky and haze are the same colour on purpose: the backstop and the
            // hills behind it have to dissolve into the sky rather than end
            // against a seam a shade off it.
            const sky = 0x39405c, haze = sky;
            this.scene.background = new THREE.Color(sky);
            this.scene.fog = new THREE.Fog(haze, 34, 160);

            this.camera = new THREE.PerspectiveCamera(70, this._w / this._h, 0.05, 400);
            this.camera.rotation.order = 'YXZ';
            this.camera.position.set(0, EYE_H, 0);
            this.scene.add(this.camera);

            this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
            this.renderer.setPixelRatio(1);
            this.renderer.setSize(Math.round(this._w * RENDER_SCALE), Math.round(this._h * RENDER_SCALE), false);
            this.renderer.setClearColor(sky, 1);

            this.scene.add(new THREE.AmbientLight(0xffffff, 0.46));
            const key = new THREE.DirectionalLight(0xffe0b0, 0.85);
            key.position.set(-24, 34, 12);
            this.scene.add(key);
            this.scene.add(new THREE.HemisphereLight(sky, 0x2a2419, 0.5));
        }

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
                map: o.map || null
            });
            this._junk.push(m);
            return m;
        }

        _geo(g) { this._junk.push(g); return g; }

        /**
         * A material per colour, kept. Everything transient (tracers, chips,
         * arrows, the poppers and clays that come and go all round) would
         * otherwise mint one per shot and hold it until the scene closed.
         */
        _matFor(color, opts) {
            const key = color + '|' + (opts ? JSON.stringify(opts) : '');
            this._matCache = this._matCache || {};
            if (!this._matCache[key]) {
                const m = this._mat(color, opts);
                // Nothing walks these meshes with _track, so the shader is put
                // on the material itself, once, where it is made.
                const PSX = window.PSXShader;
                if (PSX && PSX.applyToMaterial) {
                    if (PSX.withScale) PSX.withScale(PSX_HARD, () => PSX.applyToMaterial(m));
                    else PSX.applyToMaterial(m);
                }
                this._matCache[key] = m;
            }
            return this._matCache[key];
        }

        /** One unit cube, scaled per use, for the same reason. */
        _unitBox() {
            if (!this._unit) this._unit = this._geo(new THREE.BoxGeometry(1, 1, 1));
            return this._unit;
        }

        /** A box off the shared cube: shape comes from the scale, not a mesh. */
        _sbox(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._unitBox(), mat);
            mesh.scale.set(w, h, d);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        _box(w, h, d, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.BoxGeometry(w, h, d)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        _cyl(rt, rb, h, seg, mat, x, y, z, parent) {
            const mesh = new THREE.Mesh(this._geo(new THREE.CylinderGeometry(rt, rb, h, seg)), mat);
            mesh.position.set(x, y, z);
            (parent || this.scene).add(mesh);
            return mesh;
        }

        //--- the range --------------------------------------------------------

        _buildGround() {
            const dirt = this._mat(0x4a4433);
            const g = this._box(RANGE_HALF * 2 + 6, 1, RANGE_LEN + 30, dirt, 0, -0.5, -RANGE_LEN / 2 + 6);
            this._track(g);

            // The lane itself: a paler strip of raked gravel running downrange,
            // which is what tells the eye how far away anything is.
            const gravel = this._mat(0x5c5642);
            this._track(this._box(16, 0.06, RANGE_LEN, gravel, 0, 0.03, -RANGE_LEN / 2));

            // Cross bands every ten metres. Distance on a flat plain is
            // unreadable without them.
            const band = this._mat(0x6e6650);
            for (let d = 10; d < RANGE_LEN; d += 10) {
                this._track(this._box(16, 0.05, 0.35, band, 0, 0.07, -d));
            }
        }

        _buildWalls() {
            const concrete = this._mat(0x59565c);
            const earth = this._mat(0x3d3527);
            for (const s of [-1, 1]) {
                this._track(this._box(1.2, 5, RANGE_LEN + 12, concrete, s * RANGE_HALF, 2.5, -RANGE_LEN / 2 + 4));
            }
            // Backstop: a bank of earth with a timber revetment across its face.
            this._track(this._box(RANGE_HALF * 2, 9, 5, earth, 0, 4.5, -RANGE_LEN - 2));
            const timber = this._mat(0x4d3a26);
            for (let i = 0; i < 7; i++) {
                this._track(this._box(RANGE_HALF * 2, 0.9, 0.4, timber, 0, 0.7 + i * 1.15, -RANGE_LEN + 0.4));
            }
        }

        _buildFiringPoint() {
            const post = this._mat(0x4a3a28);
            const roof = this._mat(0x39332c);
            const bench = this._mat(0x6b5335);
            for (const x of [-5.5, 5.5]) {
                for (const z of [1.6, -3.2]) {
                    this._track(this._box(0.28, 3.6, 0.28, post, x, 1.8, z));
                }
            }
            this._track(this._box(13, 0.28, 6.4, roof, 0, 3.7, -0.8));
            this._track(this._box(11, 0.22, 1.1, bench, 0, 1.02, -1.5));
            for (const x of [-4.6, 0, 4.6]) {
                this._track(this._box(0.16, 1.0, 0.16, bench, x, 0.5, -1.5));
            }

            // Distance boards down the left-hand side.
            for (const d of [10, 25, 45, 65]) {
                const sign = this._makeSign(T('TargetRange.metres', { n: d }));
                this._track(this._box(0.12, 1.4, 0.12, post, -13.4, 0.7, -d));
                const board = new THREE.Mesh(this._geo(new THREE.PlaneGeometry(1.5, 0.75)), sign);
                board.position.set(-13.4, 1.65, -d);
                this.scene.add(board);
                this._track(board);
            }

            // Floodlights, because the range is lit and the sky is not.
            const lamp = this._mat(0xffe9b8, { emissive: 0x6b5a30 });
            for (const s of [-1, 1]) {
                for (const d of [18, 42]) {
                    this._track(this._box(0.2, 6, 0.2, post, s * (RANGE_HALF - 2), 3, -d));
                    this._track(this._box(1.1, 0.35, 0.6, lamp, s * (RANGE_HALF - 2.4), 6, -d));
                }
            }
        }

        _makeSign(text) {
            const cv = document.createElement('canvas');
            cv.width = 64; cv.height = 32;
            const c = cv.getContext('2d');
            c.fillStyle = '#141821';
            c.fillRect(0, 0, 64, 32);
            c.fillStyle = '#e6c273';
            c.fillRect(0, 0, 64, 2);
            c.fillRect(0, 30, 64, 2);
            c.font = 'bold 18px monospace';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(text, 32, 17);
            const tex = new THREE.CanvasTexture(cv);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            this._junk.push(tex);
            return this._mat(0xffffff, { map: tex, flat: true, side: THREE.DoubleSide });
        }

        _buildHills() {
            const hill = this._mat(0x333c4e);
            for (let i = 0; i < 7; i++) {
                const m = new THREE.Mesh(this._geo(new THREE.ConeGeometry(rand(14, 26), rand(10, 22), 5)), hill);
                m.position.set(rand(-90, 90), 2, -RANGE_LEN - rand(30, 90));
                m.rotation.y = rand(0, Math.PI);
                this.scene.add(m);
                this._track(m);
            }
        }

        //--- targets ----------------------------------------------------------

        /** Registers a target and its collidable meshes with the raycaster. */
        _addTarget(t) {
            this._targets.push(t);
            for (const m of t.hit) {
                m.userData.rangeTarget = t;
                this._hitMeshes.push(m);
            }
            return t;
        }

        _dropTarget(t) {
            const i = this._targets.indexOf(t);
            if (i >= 0) this._targets.splice(i, 1);
            for (const m of t.hit) {
                const j = this._hitMeshes.indexOf(m);
                if (j >= 0) this._hitMeshes.splice(j, 1);
            }
            if (t.group && t.group.parent) t.group.parent.remove(t.group);
        }

        /**
         * Bullseye plates. The face is one disc with two rings laid a
         * millimetre in front of it, so the ray hits the plate and the ring is
         * worked out from where on the face it landed rather than from which
         * mesh it struck: a bullet does not care how the paint is layered.
         */
        _buildPlates() {
            const rows = [
                { x: -8.5, z: -17 }, { x: -2.9, z: -25 },
                { x: 2.9, z: -34 }, { x: 8.5, z: -45 }
            ];
            const post = this._mat(0x4a3a28);
            const white = this._mat(0xe8e2d2);
            const red = this._mat(0xc4402c);
            const gold = this._mat(0xe6c273);
            for (const r of rows) {
                const g = new THREE.Group();
                g.position.set(r.x, 0, r.z);
                this.scene.add(g);
                this._track(this._box(0.14, 1.5, 0.14, post, 0, 0.75, 0, g));
                const face = this._cyl(0.8, 0.8, 0.1, 12, white, 0, 1.95, 0, g);
                face.rotation.x = Math.PI / 2;
                this._cyl(0.44, 0.44, 0.12, 12, red, 0, 1.95, 0.02, g).rotation.x = Math.PI / 2;
                this._cyl(0.17, 0.17, 0.14, 10, gold, 0, 1.95, 0.03, g).rotation.x = Math.PI / 2;
                this._track(g);
                this._addTarget({
                    kind: 'plate', group: g, hit: [face], alive: true,
                    centre: new THREE.Vector3(r.x, 1.95, r.z), radius: 0.8,
                    respawn: 0, spin: 0
                });
            }
        }

        /**
         * Bottles crossing a rail at close range, the fairground row. It sits
         * low and near, under the line to every plate behind it: a moving
         * target that blocked the still ones would only be in the way.
         */
        _buildRail() {
            const steel = this._mat(0x6a6d74);
            this._track(this._box(26, 0.14, 0.5, steel, 0, RAIL_Y, RAIL_Z));
            for (const x of [-11, 0, 11]) {
                this._track(this._box(0.16, RAIL_Y, 0.16, steel, x, RAIL_Y / 2, RAIL_Z));
            }
            const glass = this._mat(0x3f8f5e, { transparent: true, opacity: 0.92 });
            for (let i = 0; i < 4; i++) {
                const x = -12 + i * 8;
                const g = new THREE.Group();
                g.position.set(x, 0, RAIL_Z);
                this.scene.add(g);
                const body = this._cyl(0.13, 0.16, 0.44, 7, glass, 0, RAIL_Y + 0.29, 0, g);
                this._cyl(0.06, 0.1, 0.2, 6, glass, 0, RAIL_Y + 0.59, 0, g);
                this._track(g);
                this._addTarget({
                    kind: 'bottle', group: g, hit: [body], alive: true,
                    centre: new THREE.Vector3(x, RAIL_Y + 0.29, RAIL_Z), radius: 0.2,
                    x: x, dir: i % 2 ? -1 : 1, speed: rand(2.4, 4.2), respawn: 0
                });
            }
        }

        /** Small banks the steel silhouettes stand up from behind. */
        _buildPopperBerms() {
            const earth = this._mat(0x40382a);
            this._popperSlots = [];
            const spots = [
                { x: -12, z: -21 }, { x: -6, z: -30 }, { x: 0, z: -22 },
                { x: 6, z: -38 }, { x: 12, z: -28 }, { x: -3, z: -48 }, { x: 9, z: -56 }
            ];
            for (const s of spots) {
                this._track(this._box(3.4, 1.25, 0.7, earth, s.x, 0.62, s.z));
                this._popperSlots.push({ x: s.x, z: s.z, busy: false });
            }
        }

        /** A silhouette rises from a free berm, stands for a while, drops. */
        spawnPopper() {
            const free = this._popperSlots.filter(s => !s.busy);
            if (free.length === 0) return null;
            const slot = pick(free);
            slot.busy = true;
            const steel = this._matFor(0x8c8f96);
            const g = new THREE.Group();
            g.position.set(slot.x, 0, slot.z);
            this.scene.add(g);
            const inner = new THREE.Group();
            g.add(inner);
            const torso = this._sbox(0.62, 1.0, 0.12, steel, 0, 0.5, 0, inner);
            const head = this._sbox(0.3, 0.32, 0.12, steel, 0, 1.16, 0, inner);
            inner.position.y = -1.4;                 // hidden inside the berm
            return this._addTarget({
                kind: 'popper', group: g, inner: inner, hit: [torso, head], alive: true,
                slot: slot, centre: new THREE.Vector3(slot.x, 1.4, slot.z), radius: 0.62,
                rise: 0, life: rand(2.6, 4.4), fall: 0
            });
        }

        /** A clay launched across the range from one of the trap houses. */
        spawnClay() {
            const s = Math.random() < 0.5 ? -1 : 1;
            const clayMat = this._matFor(0xe07a2c);
            if (!this._clayGeo) this._clayGeo = this._geo(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 9));
            const g = new THREE.Group();
            g.position.set(s * 15, 1.6, -rand(16, 26));
            this.scene.add(g);
            const disc = new THREE.Mesh(this._clayGeo, clayMat);
            g.add(disc);
            return this._addTarget({
                kind: 'clay', group: g, hit: [disc], alive: true,
                centre: g.position.clone(), radius: 0.36,
                vel: new THREE.Vector3(-s * rand(7, 11), rand(5.5, 7.5), -rand(1.5, 5)),
                spin: rand(6, 12)
            });
        }

        //--- shots ------------------------------------------------------------

        aimRay() {
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            return { origin: this.camera.position.clone(), dir: dir };
        }

        /**
         * One hitscan segment. Returns the scored hit, or null. Shared by the
         * gun (one segment the length of the range) and by every step an arrow
         * takes, so a slow arrow cannot tunnel through a bottle between frames.
         */
        castSegment(origin, dir, distance) {
            // three r128 does not refresh world matrices for a raycast, and the
            // renderer only does it at half the simulation rate, so a bottle
            // would be shot where it was two frames ago. Flagged rather than
            // forced: this costs one traversal a frame, not one a bullet.
            if (this._mwStale !== false) {
                this.scene.updateMatrixWorld();
                this._mwStale = false;
            }
            if (!this._ray) this._ray = new THREE.Raycaster();
            this._ray.set(origin, dir);
            this._ray.near = 0;
            this._ray.far = distance;
            const hits = this._ray.intersectObjects(this._hitMeshes, false);
            for (const h of hits) {
                const t = h.object.userData.rangeTarget;
                if (t && t.alive) return { target: t, point: h.point, object: h.object };
            }
            return null;
        }

        /** A visible line of flight for a bullet nobody could otherwise see. */
        addTracer(from, to) {
            const mid = from.clone().add(to).multiplyScalar(0.5);
            const len = from.distanceTo(to);
            const mat = this._matFor(0xfff0b0, { emissive: 0xffd070, transparent: true, opacity: 0.85 });
            const m = new THREE.Mesh(this._unitBox(), mat);
            m.scale.set(0.035, 0.035, len);
            m.position.copy(mid);
            m.lookAt(to);
            this.scene.add(m);
            this._tracers.push({ mesh: m, mat: mat, life: 0.07 });
        }

        /** A projectile that has to fly there: arrows, bolts, stones, spears. */
        addProjectile(origin, dir, speed, grav) {
            const mat = this._matFor(0x8a6a3a);
            const m = new THREE.Mesh(this._unitBox(), mat);
            m.scale.set(0.045, 0.045, 0.85);
            m.position.copy(origin);
            this.scene.add(m);
            const p = {
                mesh: m, pos: origin.clone(),
                vel: dir.clone().multiplyScalar(speed),
                grav: grav, life: 4, hit: null
            };
            this._projectiles.push(p);
            return p;
        }

        /** Chips knocked off whatever was struck. */
        burst(at, color, count, force) {
            const mat = this._matFor(color);
            for (let i = 0; i < count; i++) {
                const s = rand(0.05, 0.14);
                const m = new THREE.Mesh(this._unitBox(), mat);
                m.scale.set(s, s, s);
                m.position.copy(at);
                this.scene.add(m);
                this._debris.push({
                    mesh: m,
                    vel: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(force),
                    life: rand(0.5, 1.1)
                });
            }
        }

        //--- per-frame --------------------------------------------------------

        placeCamera(yaw, pitch) {
            this.camera.position.set(0, EYE_H, 0);
            this.camera.rotation.set(pitch, yaw, 0);
        }

        /**
         * @param {function} onHit called with (target, point) when a flying
         *   projectile arrives; a hitscan shot is scored by the caller.
         * @param {function} onMiss called when one falls short or flies out,
         *   so an arrow that goes nowhere costs the streak a bullet would.
         */
        update(dt, onHit, onMiss) {
            this._time += dt;
            this._updateTargets(dt);
            this._mwStale = true;
            this._updateProjectiles(dt, onHit, onMiss);
            this._updateDebris(dt);
            this._updateTracers(dt);
        }

        _updateTargets(dt) {
            for (let i = this._targets.length - 1; i >= 0; i--) {
                const t = this._targets[i];
                switch (t.kind) {
                    case 'plate': this._updatePlate(t, dt); break;
                    case 'bottle': this._updateBottle(t, dt); break;
                    case 'popper': this._updatePopper(t, dt); break;
                    case 'clay': this._updateClay(t, dt); break;
                }
            }
        }

        _updatePlate(t, dt) {
            if (t.alive) return;
            // Knocked over: it swings down on its post and is stood back up.
            t.spin = Math.min(Math.PI / 2, t.spin + dt * 7);
            t.group.rotation.x = -t.spin;
            t.respawn -= dt;
            if (t.respawn <= 0) {
                t.alive = true;
                t.spin = 0;
                t.group.rotation.x = 0;
                for (const m of t.hit) if (this._hitMeshes.indexOf(m) < 0) this._hitMeshes.push(m);
            }
        }

        _updateBottle(t, dt) {
            if (!t.alive) {
                t.respawn -= dt;
                if (t.respawn > 0) return;
                t.alive = true;
                t.group.visible = true;
                t.x = t.dir > 0 ? -12.5 : 12.5;
                for (const m of t.hit) if (this._hitMeshes.indexOf(m) < 0) this._hitMeshes.push(m);
            }
            t.x += t.dir * t.speed * dt;
            if (t.x > 12.5) { t.x = 12.5; t.dir = -1; }
            if (t.x < -12.5) { t.x = -12.5; t.dir = 1; }
            t.group.position.x = t.x;
            t.centre.set(t.x, RAIL_Y + 0.29, RAIL_Z);
        }

        _updatePopper(t, dt) {
            if (!t.alive) {
                t.fall += dt * 6;
                t.inner.rotation.x = -Math.min(1.4, t.fall);
                t.inner.position.y = Math.max(-1.4, t.inner.position.y - dt * 3);
                if (t.fall > 0.9) { t.slot.busy = false; this._dropTarget(t); }
                return;
            }
            if (t.rise < 1) {
                t.rise = Math.min(1, t.rise + dt * 4);
                t.inner.position.y = -1.4 + t.rise * 1.4;
                return;
            }
            t.life -= dt;
            if (t.life <= 0) {
                t.alive = false;
                for (const m of t.hit) {
                    const j = this._hitMeshes.indexOf(m);
                    if (j >= 0) this._hitMeshes.splice(j, 1);
                }
            }
        }

        _updateClay(t, dt) {
            if (!t.alive) { this._dropTarget(t); return; }
            t.vel.y -= 9.81 * dt;
            t.group.position.addScaledVector(t.vel, dt);
            t.group.rotation.z += t.spin * dt;
            t.centre.copy(t.group.position);
            const p = t.group.position;
            if (p.y < 0.2 || Math.abs(p.x) > RANGE_HALF || p.z < -RANGE_LEN) {
                t.alive = false;
                this._dropTarget(t);
            }
        }

        _updateProjectiles(dt, onHit, onMiss) {
            for (let i = this._projectiles.length - 1; i >= 0; i--) {
                const p = this._projectiles[i];
                const prev = p.pos.clone();
                p.vel.y -= p.grav * dt;
                p.pos.addScaledVector(p.vel, dt);
                const step = p.pos.clone().sub(prev);
                const dist = step.length();
                if (dist > 0.0001) {
                    const dir = step.clone().normalize();
                    const hit = this.castSegment(prev, dir, dist);
                    if (hit) {
                        onHit(hit.target, hit.point);
                        this._killProjectile(i);
                        continue;
                    }
                    p.mesh.position.copy(p.pos);
                    p.mesh.lookAt(p.pos.clone().add(dir));
                }
                p.life -= dt;
                if (p.life <= 0 || p.pos.y < 0 || p.pos.z < -RANGE_LEN - 4) {
                    if (onMiss) onMiss(p.pos.clone());
                    this._killProjectile(i);
                }
            }
        }

        _killProjectile(i) {
            const p = this._projectiles[i];
            if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
            this._projectiles.splice(i, 1);
        }

        _updateDebris(dt) {
            for (let i = this._debris.length - 1; i >= 0; i--) {
                const d = this._debris[i];
                d.vel.y -= 12 * dt;
                d.mesh.position.addScaledVector(d.vel, dt);
                d.mesh.rotation.x += dt * 6;
                d.mesh.rotation.y += dt * 4;
                d.life -= dt;
                if (d.life <= 0) {
                    if (d.mesh.parent) d.mesh.parent.remove(d.mesh);
                    this._debris.splice(i, 1);
                }
            }
        }

        // A tracer is four frames long and the material behind it is shared, so
        // it goes out by being taken away rather than by being faded: fading a
        // shared material would fade every other tracer with it.
        _updateTracers(dt) {
            for (let i = this._tracers.length - 1; i >= 0; i--) {
                const t = this._tracers[i];
                t.life -= dt;
                if (t.life <= 0) {
                    if (t.mesh.parent) t.mesh.parent.remove(t.mesh);
                    this._tracers.splice(i, 1);
                }
            }
        }

        /** Takes a struck target out of play and says what it was worth. */
        score(target, point) {
            if (!target.alive) return 0;
            if (target.kind === 'plate') {
                // Which ring, from where on the face it landed.
                const dx = point.x - target.centre.x;
                const dy = point.y - target.centre.y;
                const r = Math.sqrt(dx * dx + dy * dy);
                const pts = r < 0.17 ? PTS.bullInner : (r < 0.44 ? PTS.bullMid : PTS.bullOuter);
                target.alive = false;
                target.respawn = 2.2;
                target.spin = 0;
                for (const m of target.hit) {
                    const j = this._hitMeshes.indexOf(m);
                    if (j >= 0) this._hitMeshes.splice(j, 1);
                }
                this.burst(point, 0xe8e2d2, 6, 2.2);
                return pts;
            }
            if (target.kind === 'popper') {
                target.alive = false;
                target.fall = 0;
                for (const m of target.hit) {
                    const j = this._hitMeshes.indexOf(m);
                    if (j >= 0) this._hitMeshes.splice(j, 1);
                }
                this.burst(point, 0x8c8f96, 5, 2.0);
                return PTS.popper;
            }
            if (target.kind === 'bottle') {
                target.alive = false;
                target.respawn = 3.0;
                target.group.visible = false;
                for (const m of target.hit) {
                    const j = this._hitMeshes.indexOf(m);
                    if (j >= 0) this._hitMeshes.splice(j, 1);
                }
                this.burst(point, 0x3f8f5e, 9, 3.0);
                return PTS.bottle;
            }
            if (target.kind === 'clay') {
                target.alive = false;
                this.burst(point, 0xe07a2c, 10, 3.4);
                this._dropTarget(target);
                return PTS.clay;
            }
            return 0;
        }

        render() {
            const PSX = window.PSXShader;
            if (PSX && PSX.render) PSX.render(this.renderer, this.scene, this.camera);
            else this.renderer.render(this.scene, this.camera);
        }

        dispose() {
            for (const item of this._junk) {
                if (item && item.dispose) {
                    try { item.dispose(); } catch (e) { /* already gone */ }
                }
            }
            this._junk = [];
            this._targets = [];
            this._hitMeshes = [];
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
    // RangeWeapon: the thing in the shooter's hands.
    //
    // The same first-person layer a battle uses (Sprite_3DWeapon over the
    // shared WeaponThreeScene overlay), so a weapon idles, sways, kicks and
    // ejects its cases here exactly as it does in a fight. Nothing is ever
    // equipped on the actor: the rack lends, and takes it back at the door.
    //=========================================================================
    const RangeWeapon = {
        _sprite: null,
        _weapon: null,
        _held: false,
        _list: [],
        _index: 0,
        _cool: 0,
        _ammo: 0,
        _reloading: 0,

        available() { return three3DReady() && weaponsReady(); },

        /** Raise the overlay for the whole session and deal the first weapon. */
        begin() {
            if (this._held || !this.available()) return;
            this._list = rangedWeapons();
            if (this._list.length === 0) return;
            // ONE reference for the whole session: re-rolling the weapon would
            // otherwise take the overlay's ref count to zero for a moment, and
            // each of those destroys and rebuilds a WebGL context.
            window.WeaponThreeScene.ref();
            this._held = true;
            // What the leader walked in carrying, when it shoots.
            const own = leaderRangedWeapon();
            const at = own ? this._list.findIndex(w => w.id === own.id) : -1;
            this._index = at >= 0 ? at : 0;
            this.equip(this._index);
        },

        list() { return this._list; },
        index() { return this._index; },
        weapon() { return this._weapon; },

        ballistics() {
            return (this._weapon && BALLISTICS[this._weapon.wtypeId]) || BALLISTICS[WTYPE_GUN];
        },

        magazine() { return this.ballistics().mag; },
        ammo() { return this._ammo; },
        isReloading() { return this._reloading > 0; },

        equip(i) {
            if (!this._held || this._list.length === 0) return;
            this._index = ((i % this._list.length) + this._list.length) % this._list.length;
            const weapon = this._list[this._index];
            // The same patch the battle spriteset applies before building one:
            // without it the procedural models, poses and motions are absent.
            WeaponSystemProcedural.patchSprite3DWeapon();
            if (this._sprite) this._sprite.terminate();
            this._weapon = weapon;
            this._sprite = new Sprite_3DWeapon(
                weapon,
                Math.round(Graphics.width * 0.40),
                Math.round(Graphics.height * 0.80)
            );
            this._ammo = this.magazine();
            this._reloading = 0;
            this._cool = 0.25;
        },

        step(delta) { this.equip(this._index + delta); },

        /** True when the thing in hand actually goes off. */
        canFire() {
            if (!this._sprite || !this._weapon) return false;
            if (this._cool > 0 || this._reloading > 0) return false;
            if (this.magazine() > 0 && this._ammo <= 0) return false;
            return true;
        },

        fire() {
            if (!this.canFire()) return false;
            const b = this.ballistics();
            this._cool = b.cooldown;
            if (this.magazine() > 0) this._ammo--;
            this._sprite.playAnimation(null);
            if (window.WeaponSounds) window.WeaponSounds.play(this._weapon);
            return true;
        },

        reload() {
            if (this.magazine() <= 0 || this._reloading > 0) return false;
            if (this._ammo >= this.magazine()) return false;
            this._reloading = this.ballistics().reload;
            if (this._sprite && this._sprite.playReload) this._sprite.playReload();
            se('Equip1', 110, 60);
            return true;
        },

        update(dt) {
            if (this._cool > 0) this._cool -= dt;
            if (this._reloading > 0) {
                this._reloading -= dt;
                if (this._reloading <= 0) this._ammo = this.magazine();
            }
            const s = this._sprite;
            if (!s) return;
            // Point it where the crosshair is: dead centre, every frame.
            s._aimPoint = { x: Graphics.width / 2, y: Graphics.height / 2 };
            s.update();
            window.WeaponThreeScene.render();
        },

        setVisible(visible) {
            const canvas = window.WeaponThreeScene && window.WeaponThreeScene.canvas;
            if (canvas) canvas.style.display = visible ? 'block' : 'none';
        },

        end() {
            if (!this._held) return;
            const canvas = window.WeaponThreeScene.canvas;
            if (canvas) { canvas.style.display = 'block'; canvas.style.zIndex = '10'; }
            if (this._sprite) this._sprite.terminate();
            this._sprite = null;
            this._weapon = null;
            this._list = [];
            this._held = false;
            // Last, so the count only reaches zero once the sprite has let go.
            window.WeaponThreeScene.deref();
        }
    };

    //=========================================================================
    // Scene_TargetRange
    //=========================================================================
    const ST = { READY: 'ready', RUN: 'run', RESULT: 'result', ABORT: 'abort' };

    // Q and E step the rack, the keyboard's own L2 and R2. Both are spoken for
    // by the core mapper (pageup / a direction), so they are claimed on the way
    // in and handed straight back on the way out.
    const RANGE_KEYS = { 81: 'rangePrev', 69: 'rangeNext' };

    class Scene_TargetRange extends Scene_MenuBase {
        initialize() {
            super.initialize();
            this._world = null;
            this._state = ST.READY;
            this._yaw = 0;
            this._pitch = -0.03;
            this._recoil = 0;
            this._timer = 3;
            this._score = 0;
            this._shots = 0;
            this._hits = 0;
            this._streak = 0;
            this._bestStreak = 0;
            this._mult = 1;
            this._banner = '';
            this._bannerColor = null;
            this._bannerT = 0;
            this._status = '';
            this._pops = [];        // floating "+25" marks near the crosshair
            this._rackT = 0;
            this._renderAcc = 0;
            this._popperTimer = 1.2;
            this._clayTimer = 4;
            this._hudTick = 0;
            this._lt = false;
            this._rt = false;
        }

        //--- construction -----------------------------------------------------

        create() {
            super.create();
            if (!three3DReady()) {
                this.createHud();
                this._state = ST.ABORT;
                this._status = T('TargetRange.noThree');
                return;
            }
            if (rangedWeapons().length === 0 || !weaponsReady()) {
                this.createHud();
                this._state = ST.ABORT;
                this._status = T('TargetRange.nothingOnRack');
                return;
            }
            this._world = new RangeWorld3D(Graphics.width, Graphics.height);
            this.createWorldSprite();
            this.createHud();
            this._bindKeys();
            this._bindMouse();
            this._startAmbience();
            RangeWeapon.begin();
            this.showBanner(T('TargetRange.rangeHot'), '#fff2c6', 1.4);
            if (window.MinigameFun) window.MinigameFun.played('Target Shooting');
        }

        // A blurred snapshot of the map is a wasted upload behind an opaque 3D
        // view that covers every pixel of the screen.
        createBackground() {
            this._backgroundSprite = new Sprite(new Bitmap(8, 8));
            this._backgroundSprite.bitmap.fillAll('#0a0d16');
            this._backgroundSprite.scale.set(Graphics.width / 8, Graphics.height / 8);
            this.addChild(this._backgroundSprite);
        }

        createWorldSprite() {
            const texture = PIXI.Texture.from(this._world.domElement);
            if (texture.baseTexture) texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            this._worldSprite = new PIXI.Sprite(texture);
            this._worldSprite.width = Graphics.width;
            this._worldSprite.height = Graphics.height;
            const idx = this._windowLayer ? this.getChildIndex(this._windowLayer) : this.children.length;
            this.addChildAt(this._worldSprite, idx);
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

        _bindKeys() {
            this._savedKeys = {};
            for (const code in RANGE_KEYS) {
                this._savedKeys[code] = Input.keyMapper[code];
                Input.keyMapper[code] = RANGE_KEYS[code];
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

        /**
         * The mouse. The first click only grabs the pointer, exactly as it does
         * in a dream; every click after that is a shot. Without the lock the
         * range still plays on the arrow keys, so a denied lock is not a wall.
         */
        _bindMouse() {
            this._onMouseMove = (e) => {
                if (document.pointerLockElement !== document.body) return;
                this._yaw = clamp(this._yaw - e.movementX * 0.0022 * LOOK_SPEED, -YAW_LIM, YAW_LIM);
                this._pitch = clamp(this._pitch - e.movementY * 0.0022 * LOOK_SPEED, PITCH_MIN, PITCH_MAX);
            };
            this._onMouseDown = (e) => {
                if (e.button !== 0) return;
                if (this._state === ST.RESULT || this._state === ST.ABORT) return;
                if (document.pointerLockElement !== document.body) {
                    if (document.body.requestPointerLock) document.body.requestPointerLock();
                    return;
                }
                this.shoot();
            };
            this._onWheel = (e) => {
                this.stepWeapon(e.deltaY > 0 ? 1 : -1);
            };
            document.addEventListener('mousemove', this._onMouseMove);
            document.addEventListener('mousedown', this._onMouseDown);
            document.addEventListener('wheel', this._onWheel, { passive: true });
        }

        _unbindMouse() {
            if (this._onMouseMove) document.removeEventListener('mousemove', this._onMouseMove);
            if (this._onMouseDown) document.removeEventListener('mousedown', this._onMouseDown);
            if (this._onWheel) document.removeEventListener('wheel', this._onWheel);
            this._onMouseMove = this._onMouseDown = this._onWheel = null;
            if (document.pointerLockElement === document.body && document.exitPointerLock) {
                document.exitPointerLock();
            }
        }

        // saveBgs RETURNS the ambience the party walked in with rather than
        // storing it, so it is held here and handed back on the way out.
        _startAmbience() {
            try {
                this._savedBgs = AudioManager.saveBgs();
                this._bgsSaved = true;
                AudioManager.playBgs({ name: 'grass-wind', volume: 45, pitch: 100, pan: 0 });
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

        //--- flow -------------------------------------------------------------

        showBanner(text, color, seconds) {
            this._banner = text;
            this._bannerColor = color || null;
            this._bannerT = seconds || 1.4;
        }

        /** Another weapon off the rack, and the rack comes up to show it. */
        stepWeapon(delta) {
            if (this._state === ST.ABORT || this._state === ST.RESULT) return;
            this._rackT = RACK_HOLD;
            if (!delta) return;
            RangeWeapon.step(delta);
            if (typeof SoundManager !== 'undefined') SoundManager.playCursor();
        }

        shoot() {
            if (this._state !== ST.RUN) return;
            if (!RangeWeapon.canFire()) {
                // An empty magazine is a click, and then it fills itself.
                if (RangeWeapon.magazine() > 0 && RangeWeapon.ammo() <= 0 && !RangeWeapon.isReloading()) {
                    RangeWeapon.reload();
                }
                return;
            }
            if (!RangeWeapon.fire()) return;
            const b = RangeWeapon.ballistics();
            this._shots++;
            this._recoil += b.kick;
            const ray = this._world.aimRay();
            if (b.hitscan) {
                const hit = this._world.castSegment(ray.origin, ray.dir, RANGE_LEN + 12);
                const end = hit ? hit.point : ray.origin.clone().addScaledVector(ray.dir, RANGE_LEN + 6);
                // Out of the muzzle, not out of the eye: a tracer that starts
                // dead centre reads as a laser pointer, not as a shot.
                const muzzle = ray.origin.clone()
                    .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(this._world.camera.quaternion), 0.22)
                    .addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(this._world.camera.quaternion), -0.16);
                this._world.addTracer(muzzle, end);
                if (hit) this.land(hit.target, hit.point);
                else this.miss(end);
            } else {
                this._world.addProjectile(ray.origin.clone().addScaledVector(ray.dir, 0.6), ray.dir, b.speed, b.grav);
            }
        }

        /** A hit, whatever brought it about. */
        land(target, point) {
            const base = this._world.score(target, point);
            if (base <= 0) return;
            this._hits++;
            this._streak++;
            this._bestStreak = Math.max(this._bestStreak, this._streak);
            this._mult = Math.min(5, 1 + Math.floor(this._streak / 4));
            const gained = base * this._mult;
            this._score += gained;
            this._pops.push({ text: '+' + gained, life: 0.9, y: 0, color: target.kind === 'clay' ? '#93d86e' : '#fff2c6' });
            if (target.kind === 'clay') se('Break', 110, 80);
            else if (target.kind === 'bottle') se('Break', 130, 70);
            else if (base === PTS.bullInner) se('Bell3', 130, 75);
            else se('Bell1', 100, 60);
            if (this._mult > 1 && this._streak % 4 === 0) {
                this.showBanner('x' + this._mult, '#e6c273', 0.9);
            }
        }

        /** A shot that found nothing. The streak is the only thing it costs. */
        miss(at) {
            this._streak = 0;
            this._mult = 1;
            if (at) this._world.burst(at, 0x6a6250, 4, 1.6);
            se('Miss', 120, 40);
        }

        finish() {
            this._state = ST.RESULT;
            this._won = this._score >= PAR_SCORE;
            this.showBanner(T('TargetRange.rangeCold'), this._won ? '#93d86e' : '#e6c273', 2.0);
            se(this._won ? 'Applause1' : 'Buzzer1', 100, 70);
            // No party and no variables on the title screen's free-play run.
            if (RESULT_VAR > 0 && typeof $gameVariables !== 'undefined' && $gameVariables) {
                $gameVariables.setValue(RESULT_VAR, this._score);
            }
            if (window.MinigameFun) {
                if (this._won) window.MinigameFun.won('Target Shooting');
                else window.MinigameFun.lost('Target Shooting');
            }
            if (document.pointerLockElement === document.body && document.exitPointerLock) {
                document.exitPointerLock();
            }
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

            if (this._bannerT > 0) this._bannerT -= dt;
            if (this._rackT > 0) this._rackT -= dt;

            // Look first, then place the camera, THEN read the trigger: a shot
            // has to leave along the barrel as it is pointing this frame, not
            // as it was pointing on the last one.
            this._updateLook(dt);
            this._world.placeCamera(this._yaw, this._pitch + this._recoil);
            this._updateInput(dt);

            switch (this._state) {
                case ST.READY: this._updateReady(dt); break;
                case ST.RUN: this._updateRun(dt); break;
                case ST.RESULT: this._updateResult(); break;
            }

            this._world.update(dt,
                (target, point) => this.land(target, point),
                (at) => this.miss(at));
            RangeWeapon.update(dt);
            this._updatePops(dt);
            this._renderFrame(dt);
            this._drawHud();
        }

        _updateReady(dt) {
            this._timer -= dt;
            this._status = T('TargetRange.standByCount', { n: Math.max(1, Math.ceil(this._timer)) });
            if (this._timer <= 0) {
                this._state = ST.RUN;
                this._timer = ROUND_SECONDS;
                this._status = '';
                se('Buzzer1', 120, 60);
            }
        }

        _updateRun(dt) {
            this._timer -= dt;
            this._popperTimer -= dt;
            this._clayTimer -= dt;
            if (this._popperTimer <= 0) {
                this._world.spawnPopper();
                this._popperTimer = rand(1.4, 2.8);
            }
            if (this._clayTimer <= 0) {
                this._world.spawnClay();
                this._clayTimer = rand(4.5, 8);
            }
            if (this._timer <= 0) {
                this._timer = 0;
                this.finish();
            }
        }

        _updateResult() {
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                this.popScene();
            }
        }

        /**
         * The buttons. R1 and R2 are both the trigger, on the pad and at the
         * keyboard both; the d-pad, the wheel and L2 change what is in hand,
         * and only ever one weapon per press, so a held button does not run the
         * rack.
         */
        _updateInput(dt) {
            if (this._state === ST.RUN) {
                if (Input.isTriggered('ok') || Input.isTriggered('pagedown')) this.shoot();
                if (Input.isTriggered('shift')) RangeWeapon.reload();
            }
            if (Input.isTriggered('rangePrev')) this.stepWeapon(-1);
            if (Input.isTriggered('rangeNext')) this.stepWeapon(1);

            const pads = window.AnalogStickInput;
            if (!pads) return;

            // UP and DOWN on the d-pad are the rack. They have to be read as
            // raw buttons: core folds the left stick into the same Input
            // directions, and the stick is not asking for another weapon.
            if (pads.isButtonTriggered && pads.hasPad && pads.hasPad()) {
                if (pads.isButtonTriggered(pads.BUTTON.DPAD_UP)) this.stepWeapon(-1);
                if (pads.isButtonTriggered(pads.BUTTON.DPAD_DOWN)) this.stepWeapon(1);
            }

            // L2 / R2. The core gamepad mapper does not carry the analog
            // triggers, so they are read through the shared helper and edged
            // here rather than polled as buttons.
            if (pads.leftTrigger) {
                const lt = pads.leftTrigger();
                const rt = pads.rightTrigger ? pads.rightTrigger() : 0;
                if (!this._lt && lt > TRIGGER_ON) { this._lt = true; this.stepWeapon(-1); }
                else if (this._lt && lt < TRIGGER_OFF) this._lt = false;
                // The trigger finger is the trigger finger: R2 shoots.
                if (!this._rt && rt > TRIGGER_ON) { this._rt = true; this.shoot(); }
                else if (this._rt && rt < TRIGGER_OFF) this._rt = false;
            }
        }

        _updateLook(dt) {
            const k = 1.5 * LOOK_SPEED * dt;
            let dy = 0, dp = 0;
            const pads = window.AnalogStickInput;
            // Up and down on the d-pad are the rack, not the elevation, so a
            // press on either is taken off the aim. The arrow KEYS still aim:
            // core folds the pad's directions into the same Input actions, so
            // the only way to tell them apart is the raw button.
            const dpadY = pads && pads.hasPad && pads.hasPad() &&
                (pads.isButtonPressed(pads.BUTTON.DPAD_UP) ||
                 pads.isButtonPressed(pads.BUTTON.DPAD_DOWN));
            if (Input.isPressed('left')) dy += k;
            if (Input.isPressed('right')) dy -= k;
            if (Input.isPressed('up') && !dpadY) dp += k * 0.7;
            if (Input.isPressed('down') && !dpadY) dp -= k * 0.7;

            // The right stick, where there is one.
            if (pads && pads.rightX) {
                dy -= pads.rightX() * 2.4 * LOOK_SPEED * dt;
                dp -= pads.rightY() * 1.8 * LOOK_SPEED * dt;
            }

            // Dragging works whenever the pointer is not locked, so the range
            // is playable on a trackpad and on a touchscreen.
            if (document.pointerLockElement !== document.body) {
                if (TouchInput.isPressed()) {
                    if (this._lastTouch) {
                        dy -= (TouchInput.x - this._lastTouch.x) * 0.005 * LOOK_SPEED;
                        dp -= (TouchInput.y - this._lastTouch.y) * 0.005 * LOOK_SPEED;
                    }
                    this._lastTouch = { x: TouchInput.x, y: TouchInput.y };
                } else {
                    this._lastTouch = null;
                }
            }

            this._yaw = clamp(this._yaw + dy, -YAW_LIM, YAW_LIM);
            this._pitch = clamp(this._pitch + dp, PITCH_MIN, PITCH_MAX);
            // The muzzle comes back down on its own, the way an arm does.
            this._recoil -= this._recoil * Math.min(1, dt * 7);
        }

        _updatePops(dt) {
            for (let i = this._pops.length - 1; i >= 0; i--) {
                const p = this._pops[i];
                p.life -= dt;
                p.y -= dt * 16;
                if (p.life <= 0) this._pops.splice(i, 1);
            }
        }

        // The 3D pass is rasterised at half the simulation rate: the range is a
        // still scene with a handful of moving parts and does not need 60.
        _renderFrame(dt) {
            this._renderAcc += dt;
            const step = 1 / RENDER_FPS;
            if (this._renderAcc < step) return;
            this._renderAcc = 0;
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
            this._hudTick++;
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

            this._drawScoreline(bmp, H, D, w, h);
            this._drawReticle(bmp, H, D, w, h);
            this._drawWeaponPlate(bmp, H, D, w, h);
            if (this._rackT > 0) this._drawRack(bmp, H, D, w, h);
            this._drawPops(bmp, w, h);

            if (this._status) {
                bmp.fillRect(0, h - 11, w, 11, D.black);
                bmp.fillRect(0, h - 11, w, 1, D.gold);
                this._hudText(bmp, this._status, 2, h - 10, w - 4, 'center', D.ink, 8);
            }
            if (this._bannerT > 0 && this._banner) {
                const bw = Math.min(w - 40, 170);
                const bx = Math.round((w - bw) / 2);
                const by = Math.round(h * 0.22);
                H.decoPanel(bmp, bx, by, bw, 24, { hairline: false, step: 2 });
                this._hudText(bmp, this._banner, bx, by + 2, bw, 'center',
                    this._bannerColor || D.goldHi, 16);
            }
            if (this._state === ST.RESULT) this._drawResult(bmp, H, D, w, h);
            if (this._hudDom) this._hudDom.end();
        }

        _drawScoreline(bmp, H, D, w, h) {
            H.decoPanel(bmp, 3, 3, 100, 34, { hairline: false, step: 1 });
            this._hudText(bmp, T('TargetRange.title'), 6, 2, 94, 'left', D.gold, 8);
            const secs = Math.max(0, Math.ceil(this._timer));
            this._hudText(bmp, this._state === ST.READY ? T('TargetRange.standBy') : T('TargetRange.seconds', { n: secs }),
                6, 11, 94, 'left', secs <= 10 && this._state === ST.RUN ? D.red : D.dim, 8);
            this._hudText(bmp, String(this._score), 6, 21, 94, 'right', D.goldHi, 16);

            // Streak and multiplier, the only number that changes how you shoot.
            if (this._mult > 1) {
                H.decoPanel(bmp, 3, 40, 46, 13, { hairline: false, corners: false, step: 1 });
                this._hudText(bmp, 'x' + this._mult, 6, 41, 40, 'left', D.goldHi, 8);
                this._hudText(bmp, String(this._streak), 6, 41, 40, 'right', D.dim, 8);
            }
        }

        _drawReticle(bmp, H, D, w, h) {
            if (this._state === ST.RESULT) return;
            const cx = Math.round(w / 2), cy = Math.round(h / 2);
            // The sight opens up while the shot is still settling, so the kick
            // is something you can see as well as feel.
            const spread = 3 + Math.round(this._recoil * 120);
            const ok = RangeWeapon.canFire() || this._state !== ST.RUN;
            H.reticle(bmp, cx, cy, spread, ok ? D.goldHi : D.red, { len: 4, dot: true, dotColor: D.gold });
        }

        /** What is in hand, bottom right: name, type and what is left in it. */
        _drawWeaponPlate(bmp, H, D, w, h) {
            const weapon = RangeWeapon.weapon();
            if (!weapon) return;
            const pw = 108, ph = 26;
            const px = w - pw - 3, py = h - ph - 14;
            H.decoPanel(bmp, px, py, pw, ph, { hairline: false, step: 1 });
            this._hudText(bmp, weapon.name, px + 4, py + 2, pw - 8, 'left', D.ink, 8);
            const mag = RangeWeapon.magazine();
            let right;
            if (RangeWeapon.isReloading()) right = T('TargetRange.reloading');
            else if (mag > 0) right = RangeWeapon.ammo() + '/' + mag;
            else right = T('TargetRange.nocked');
            this._hudText(bmp, right, px + 4, py + 13, pw - 8, 'right',
                RangeWeapon.isReloading() ? D.red : D.gold, 8);
            const kind = weapon.wtypeId === WTYPE_GUN ? T('TargetRange.kindGun')
                : (weapon.wtypeId === WTYPE_BOW ? T('TargetRange.kindBow') : T('TargetRange.kindThrown'));
            this._hudText(bmp, kind, px + 4, py + 13, pw - 8, 'left', D.faint, 8);
        }

        /**
         * The rack, down the right-hand side: every ranged weapon in the game
         * in alphabetical order, windowed around the one in hand. It is raised
         * by the wheel and by the triggers and lies back down on its own.
         */
        _drawRack(bmp, H, D, w, h) {
            const list = RangeWeapon.list();
            if (list.length === 0) return;
            const idx = RangeWeapon.index();
            const rows = Math.min(RACK_ROWS, list.length);
            const rowH = 10;
            const pw = 112;
            const ph = 15 + rows * rowH + 5;
            const px = w - pw - 3;
            const py = 22;

            // The last half second is a fade, and a framebuffer HUD fades by
            // going away rather than by turning translucent: the panel simply
            // is not drawn on alternate repaints near the end.
            if (this._rackT < 0.5 && this._hudTick % 4 < 2) return;

            H.decoPanel(bmp, px, py, pw, ph, {
                step: 1, hairline: false,
                title: T('TargetRange.rack'), titleRight: (idx + 1) + '/' + list.length,
                dom: this._hudDom
            });

            let top = idx - Math.floor(rows / 2);
            top = clamp(top, 0, Math.max(0, list.length - rows));
            for (let i = 0; i < rows; i++) {
                const n = top + i;
                const y = py + 15 + i * rowH;
                const on = n === idx;
                if (on) H.decoSelect(bmp, px + 3, y - 1, pw - 6, rowH);
                this._hudText(bmp, list[n].name, px + 7, y, pw - 14, 'left',
                    on ? D.goldHi : D.dim, 8);
            }

            // Where the window sits in a list far longer than it.
            if (list.length > rows) {
                const trackH = rows * rowH;
                const barH = Math.max(4, Math.round(trackH * rows / list.length));
                const barY = py + 15 + Math.round((trackH - barH) * top / (list.length - rows));
                bmp.fillRect(px + pw - 4, py + 15, 1, trackH, D.goldLo);
                bmp.fillRect(px + pw - 5, barY, 3, barH, D.gold);
            }
        }

        _drawPops(bmp, w, h) {
            const cx = Math.round(w / 2), cy = Math.round(h / 2);
            for (let i = 0; i < this._pops.length; i++) {
                const p = this._pops[i];
                if (p.life < 0.3 && this._hudTick % 4 < 2) continue;
                this._hudText(bmp, p.text, cx - 30, cy - 22 + Math.round(p.y), 60, 'center', p.color, 8);
            }
        }

        _drawResult(bmp, H, D, w, h) {
            const cw = 196, ch = 88;
            const cx = Math.round((w - cw) / 2), cy = Math.round((h - ch) / 2);
            H.decoPanel(bmp, cx, cy, cw, ch, { step: 3 });
            this._hudText(bmp, this._won ? T('TargetRange.qualified') : T('TargetRange.notQualified'), cx, cy + 7, cw, 'center',
                this._won ? '#93d86e' : '#d9533d', 16);
            H.decoRule(bmp, cx + 10, cy + 30, cw - 20, D.goldLo);
            const acc = this._shots > 0 ? Math.round(this._hits * 100 / this._shots) : 0;
            this._hudText(bmp, T('TargetRange.scorePar', { score: this._score, par: PAR_SCORE }), cx, cy + 34, cw, 'center', D.ink, 8);
            this._hudText(bmp, T('TargetRange.hitsAccuracy', { hits: this._hits, shots: this._shots, acc: acc }),
                cx, cy + 46, cw, 'center', D.dim, 8);
            this._hudText(bmp, T('TargetRange.bestRun', { n: this._bestStreak }), cx, cy + 58, cw, 'center', D.dim, 8);
        }

        //--- teardown ---------------------------------------------------------

        terminate() {
            super.terminate();
            this._restoreKeys();
            this._unbindMouse();
            RangeWeapon.end();
            this._stopAmbience();
            if (this._hudDom) {
                try { this._hudDom.destroy(); } catch (e) { /* already gone */ }
                this._hudDom = null;
            }
            if (this._worldSprite) {
                if (this._worldSprite.parent) this._worldSprite.parent.removeChild(this._worldSprite);
                this._worldSprite.destroy({ texture: true, baseTexture: true });
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
    window.Scene_TargetRange = Scene_TargetRange;

    const open = () => SceneManager.push(Scene_TargetRange);
    PluginManager.registerCommand(PLUGIN_NAME, 'startTargetRange', open);
    window.startTargetShootingRange = open;
})();
