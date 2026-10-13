//=============================================================================
// 3D Battler System - Small Fauna Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke small-creature one-off models (frogs, axolotl, slug-snail,
 * lobster, crab, scorpion, worms) + name-based assignment. Requires
 * 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Small Fauna Uniques
 * ============================================================================
 *
 * Distinct procedural small creatures shaped from each enemy's flavour text,
 * assigned by exact name. Each maps its SOURCE archetype's body-part keys:
 *   frog/amphibian -> HEAD/TONGUE/LEFT_LEG/RIGHT_LEG
 *   snail          -> SHELL/BODY/FOOT/TENTACLE_1/TENTACLE_2/EYE
 *   crustacean     -> CARAPACE/ABDOMEN/CLAW_LEFT/CLAW_RIGHT/FRONT_LEG/REAR_LEG/ANTENNAE
 *   scorpion       -> CEPHALOTHORAX/ABDOMEN/HEAD/TAIL/STINGER/PINCER_LEFT/PINCER_RIGHT
 *   worm           -> HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL
 *
 * Registered: boghatchling, gardenfrog, deathaxolotl, maggotslail, freelobster,
 *             tidecrab, desertscorpion, caveworm, earthworm
 * Level 1-5 roster (lv_*): compostworm, dunewormling, crystalglowworm,
 *             puddletoad, bogtadpole, canopytreefrog, canetoad, cindernewt,
 *             bottlecaphermitcrab, shorecrab, ditchcrayfish, coconutcrab,
 *             mosssnail, caveglowsnail, geodesnail
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler SmallFauna] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

    const F_PROFILES = {
        boghatchling:   { variant: 'boghatchling',   scale: 1.4, texturePool: 'foliage', bodyColor: 0x5a6a3a, accent: 0xffcc33, hue: [0.25, 0.06], sat: [0.40, 0.10], lit: [0.40, 0.08] },
        gardenfrog:     { variant: 'gardenfrog',     scale: 1.5, texturePool: 'foliage', bodyColor: 0x4a9a3a, accent: 0xccdd44, hue: [0.30, 0.06], sat: [0.50, 0.10], lit: [0.45, 0.08] },
        deathaxolotl:   { variant: 'deathaxolotl',   scale: 1.7, texturePool: 'pale',    bodyColor: 0xe0a8c0, accent: 0x88ff66, hue: [0.92, 0.05], sat: [0.30, 0.10], lit: [0.70, 0.08] },
        maggotslail:    { variant: 'maggotslail',    scale: 1.6, texturePool: 'pale',    bodyColor: 0xe8e0c8, accent: 0xaa8866, hue: [0.10, 0.04], sat: [0.20, 0.08], lit: [0.72, 0.08] },
        freelobster:    { variant: 'freelobster',    scale: 1.8, texturePool: 'fire',    bodyColor: 0xcc4422, accent: 0xee6644, hue: [0.03, 0.03], sat: [0.55, 0.10], lit: [0.42, 0.08] },
        tidecrab:       { variant: 'tidecrab',       scale: 1.7, texturePool: 'water',   bodyColor: 0xcc8844, accent: 0x66bbdd, hue: [0.07, 0.04], sat: [0.45, 0.10], lit: [0.48, 0.08] },
        desertscorpion: { variant: 'desertscorpion', scale: 2.0, texturePool: 'crystal', bodyColor: 0x6a4a2a, accent: 0x88ddee, hue: [0.10, 0.04], sat: [0.40, 0.10], lit: [0.40, 0.08] },
        caveworm:       { variant: 'caveworm',       scale: 1.9, texturePool: 'crystal', bodyColor: 0xc8a0b0, accent: 0x66ffcc, hue: [0.92, 0.06], sat: [0.30, 0.10], lit: [0.60, 0.08] },
        earthworm:      { variant: 'earthworm',      scale: 1.5, texturePool: 'flesh',   bodyColor: 0xc88a8a, accent: 0xaa6a6a, hue: [0.99, 0.04], sat: [0.35, 0.10], lit: [0.58, 0.08] },

        // ── Level 1-5 starter roster (bespoke, one builder each) ─────────────
        lv_compostworm:         { variant: 'compostworm',     scale: 1.5, texturePool: 'flesh',   bodyColor: 0xa8443a, accent: 0xe0a890, hue: [0.99, 0.03], sat: [0.45, 0.10], lit: [0.42, 0.08] },
        lv_dunewormling:        { variant: 'dunewormling',    scale: 1.9, texturePool: 'stone',   bodyColor: 0xc8a86a, accent: 0x9a2a2a, hue: [0.10, 0.04], sat: [0.40, 0.10], lit: [0.55, 0.08] },
        lv_crystalglowworm:     { variant: 'crystalglowworm', scale: 1.7, texturePool: 'pale',    bodyColor: 0xd8d0c0, accent: 0x7affd8, hue: [0.45, 0.06], sat: [0.20, 0.10], lit: [0.78, 0.06] },
        lv_puddletoad:          { variant: 'puddletoad',      scale: 1.5, texturePool: 'foliage', bodyColor: 0x6a6a3a, accent: 0xc8a050, hue: [0.17, 0.05], sat: [0.35, 0.10], lit: [0.36, 0.06] },
        lv_bogtadpole:          { variant: 'bogtadpole',      scale: 1.5, texturePool: 'foliage', bodyColor: 0x4a4a2a, accent: 0xd0c060, hue: [0.16, 0.05], sat: [0.30, 0.10], lit: [0.30, 0.06] },
        lv_canopytreefrog:      { variant: 'canopytreefrog',  scale: 1.6, texturePool: 'foliage', bodyColor: 0x3ac04a, accent: 0xd02a20, hue: [0.33, 0.04], sat: [0.60, 0.10], lit: [0.45, 0.06] },
        lv_canetoad:            { variant: 'canetoad',        scale: 2.0, texturePool: 'stone',   bodyColor: 0x7a5a38, accent: 0xf0ead8, hue: [0.08, 0.04], sat: [0.35, 0.10], lit: [0.36, 0.06] },
        lv_cindernewt:          { variant: 'cindernewt',      scale: 1.7, texturePool: 'fire',    bodyColor: 0x2a201c, accent: 0xff7a22, hue: [0.04, 0.03], sat: [0.20, 0.10], lit: [0.14, 0.05] },
        lv_bottlecaphermitcrab: { variant: 'bottlecaphermit', scale: 1.4, texturePool: 'water',   bodyColor: 0xd86a3a, accent: 0xc8c8d0, hue: [0.05, 0.04], sat: [0.60, 0.10], lit: [0.50, 0.06] },
        lv_shorecrab:           { variant: 'shorecrab',       scale: 1.6, texturePool: 'stone',   bodyColor: 0x4a5a2a, accent: 0xd8c8a0, hue: [0.22, 0.05], sat: [0.35, 0.10], lit: [0.32, 0.06] },
        lv_ditchcrayfish:       { variant: 'ditchcrayfish',   scale: 1.7, texturePool: 'stone',   bodyColor: 0x6a3a24, accent: 0xc8361a, hue: [0.04, 0.03], sat: [0.45, 0.10], lit: [0.32, 0.06] },
        lv_coconutcrab:         { variant: 'coconutcrab',     scale: 1.9, texturePool: 'stone',   bodyColor: 0x4a3a7a, accent: 0xd88a3a, hue: [0.72, 0.05], sat: [0.35, 0.10], lit: [0.36, 0.06] },
        lv_mosssnail:           { variant: 'mosssnail',       scale: 1.6, texturePool: 'foliage', bodyColor: 0x8a7a5a, shell: 0x6a5030, accent: 0x4a8a2a, hue: [0.11, 0.04], sat: [0.25, 0.10], lit: [0.45, 0.06] },
        lv_caveglowsnail:       { variant: 'caveglowsnail',   scale: 1.6, texturePool: 'pale',    bodyColor: 0x5a6a74, shell: 0x4a98f0, accent: 0xd0f0ff, hue: [0.56, 0.04], sat: [0.15, 0.08], lit: [0.42, 0.06] },
        lv_geodesnail:          { variant: 'geodesnail',      scale: 1.6, texturePool: 'stone',   bodyColor: 0x7a6a7a, shell: 0x6a6258, accent: 0xa060ff, hue: [0.82, 0.05], sat: [0.12, 0.08], lit: [0.46, 0.06] }
    };

    class SmallFaunaBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = F_PROFILES[creatureType] || F_PROFILES.gardenfrog;
            super(scale, offsetY, battler, profile, 0, creatureType || 'gardenfrog');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0xffcc33, 1.0, 0.2, accent === 0x111111 ? null : accent));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(0x000000, 1.0, 0.1)); pup.position.set(0, 0, r * 0.6); eye.add(pup);
            parent.add(eye); return eye;
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'boghatchling':   this._buildFrog({}); break;
                case 'gardenfrog':     this._buildFrog({ spots: true }); break;
                case 'deathaxolotl':   this._buildAxolotl(); break;
                case 'maggotslail':    this._buildSnail(); break;
                case 'freelobster':    this._buildCrustacean(false); break;
                case 'tidecrab':       this._buildCrustacean(true); break;
                case 'desertscorpion': this._buildScorpion(); break;
                case 'caveworm':       this._buildWorm(true); break;
                case 'earthworm':      this._buildWorm(false); break;
                case 'compostworm':     this._buildCompostWorm(); break;
                case 'dunewormling':    this._buildDuneWormling(); break;
                case 'crystalglowworm': this._buildCrystalGlowworm(); break;
                case 'puddletoad':      this._buildPuddleToad(); break;
                case 'bogtadpole':      this._buildBogTadpole(); break;
                case 'canopytreefrog':  this._buildCanopyTreeFrog(); break;
                case 'canetoad':        this._buildCaneToad(); break;
                case 'cindernewt':      this._buildCinderNewt(); break;
                case 'bottlecaphermit': this._buildBottlecapHermit(); break;
                case 'shorecrab':       this._buildShoreCrab(); break;
                case 'ditchcrayfish':   this._buildDitchCrayfish(); break;
                case 'coconutcrab':     this._buildCoconutCrab(); break;
                case 'mosssnail':       this._buildMossSnail(); break;
                case 'caveglowsnail':   this._buildCaveGlowsnail(); break;
                case 'geodesnail':      this._buildGeodeSnail(); break;
                default:               this._buildFrog({}); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Frog: squat amphibian, bulging eyes, folded legs, flick tongue ──
        _buildFrog(o) {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            this.head = new THREE.Group();
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), skin); body.scale.set(1.2, 0.85, 1.1); this.head.add(body);
            for (const ex of [-0.2, 0.2]) {
                const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), skin); bulge.position.set(ex, 0.28, 0.18); this.head.add(bulge);
                this._eye(this.head, ex, 0.32, 0.26, 0.09, p.accent);
            }
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 16, Math.PI), this._mat(0x2a1a1a, 1, 0.5)); mouth.position.set(0, -0.1, 0.36); mouth.rotation.z = Math.PI; this.head.add(mouth);
            if (o.spots) for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), this._mat(p.accent, 1, 0.6)); s.position.set((this.idRand() - 0.5) * 0.6, 0.2 + this.idRand() * 0.2, 0.34); s.rotation.x = -0.6; this.head.add(s); }
            this.head.position.set(0, 0.55, 0); this.bodyGroup.add(this.head);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.3), this._mat(0xcc5566, 1, 0.4)); this.tongue.position.set(0, 0.45, 0.4); this.tongue.rotation.x = 0.3; this.tongue.visible = false; this.bodyGroup.add(this.tongue);
            this.leftLeg = this._frogLeg(-1, skin); this.rightLeg = this._frogLeg(1, skin);
            this._partMeshMap = { HEAD: this.head, TONGUE: this.tongue, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['HEAD', 'BODY', 'CORE'], hide: [this.head, this.tongue, this.leftLeg, this.rightLeg] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _frogLeg(side, mat) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.3, 6), mat); thigh.position.set(side * 0.18, 0, 0); thigh.rotation.z = side * 1.0; g.add(thigh);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.18), mat); foot.position.set(side * 0.4, -0.18, 0.12); g.add(foot);
            g.position.set(side * 0.22, 0.3, -0.08); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Death Axolotl: pink salamander with corrosive external gills ────
        _buildAxolotl() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.4);
            this.head = new THREE.Group();
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skin); head.scale.set(1.3, 0.85, 1.0); this.head.add(head);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 14, Math.PI), this._mat(0x884455, 1, 0.4)); mouth.position.set(0, -0.06, 0.3); mouth.rotation.z = Math.PI; this.head.add(mouth);
            for (const ex of [-0.16, 0.16]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(0x111111, 1, 0.2)); e.position.set(ex, 0.08, 0.3); this.head.add(e); }
            this.gills = new THREE.Group();
            for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { const gill = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 5), this._mat(p.accent, 0.9, 0.3, p.accent)); gill.position.set(side * 0.34, 0.1 + i * 0.12, -0.05); gill.rotation.z = side * (1.2 - i * 0.2); this.gills.add(gill); }
            this.head.add(this.gills);
            this.head.position.set(0, 0.5, 0.15); this.bodyGroup.add(this.head);
            this.bodySeg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.8, 8), skin); this.bodySeg.position.set(0, 0.45, -0.45); this.bodySeg.rotation.x = Math.PI / 2; this.bodyGroup.add(this.bodySeg);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 6), this._mat(p.bodyColor, 0.8, 0.4)); this.tailFin.position.set(0, 0.45, -0.9); this.tailFin.rotation.x = -Math.PI / 2; this.tailFin.scale.set(0.3, 1, 1); this.bodyGroup.add(this.tailFin);
            this.leftLeg = this._stubLeg(-1, skin); this.rightLeg = this._stubLeg(1, skin);
            this._partMeshMap = { HEAD: this.head, TONGUE: this.bodySeg, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['HEAD', 'CORE', 'BODY'], hide: [this.head, this.bodySeg, this.tailFin, this.leftLeg, this.rightLeg] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }
        _stubLeg(side, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.26, 6), mat);
            g.position.set(side * 0.22, 0.32, 0.15); g.rotation.z = side * 0.5; this.bodyGroup.add(g); return g;
        }

        // ── Maggot Slail: a bloated carrion grub with a crusty shell ───────
        _buildSnail() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.4);
            this.foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 1.1), flesh); this.foot.position.set(0, 0.18, 0.05); this.bodyGroup.add(this.foot);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), flesh); this.body.position.set(0, 0.42, 0.25); this.body.scale.set(1, 1, 2.0); this.bodyGroup.add(this.body);
            this.segRidges = new THREE.Group();
            for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28 - i * 0.01, 0.03, 6, 12), this._mat(p.bodyColor, 1, 0.5)); ring.position.set(0, 0.42, 0.5 - i * 0.18); ring.rotation.y = Math.PI / 2; this.segRidges.add(ring); }
            this.bodyGroup.add(this.segRidges);
            this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), this._mat(p.accent, 1, 0.85)); this.shell.position.set(0, 0.55, -0.1); this.shell.scale.set(1.1, 1, 1.2); this.bodyGroup.add(this.shell);
            this.t1 = this._snailStalk(-0.1); this.t2 = this._snailStalk(0.1);
            this._partMeshMap = { SHELL: this.shell, BODY: this.body, FOOT: this.foot, TENTACLE_1: this.t1, TENTACLE_2: this.t2, EYE: this.t1 };
            this._cascadeRules = [
                { gone: ['BODY', 'FOOT'], hide: [this.body, this.foot, this.shell, this.segRidges, this.t1, this.t2] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['TENTACLE_1', 'EYE'], hide: [this.t1] },
                { gone: ['TENTACLE_2'], hide: [this.t2] },
            ];
        }
        _snailStalk(x) {
            const g = new THREE.Group();
            const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 5), this._skinMat(this.profile.bodyColor, 0.4)); st.position.y = 0.17; g.add(st);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x111111, 1, 0.2)); eye.position.y = 0.36; g.add(eye);
            g.position.set(x, 0.55, 0.62); g._x = x; this.bodyGroup.add(g); return g;
        }

        // ── Crustacean: lobster (elongated tail) or crab (wide carapace) ───
        _buildCrustacean(wide) {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.4);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(wide ? 0.5 : 0.34, 14, 12), shell); this.carapace.position.set(0, 0.6, wide ? 0 : 0.1); this.carapace.scale.set(wide ? 1.5 : 1.0, wide ? 0.5 : 0.7, wide ? 1.1 : 1.3); this.bodyGroup.add(this.carapace);
            this.antennae = new THREE.Group();
            for (const ex of [-0.12, 0.12]) {
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 5), shell); stalk.position.set(ex, 0.78, 0.4); this.antennae.add(stalk);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x111111, 1, 0.2)); eye.position.set(ex, 0.86, 0.4); this.antennae.add(eye);
            }
            if (!wide) for (const ex of [-0.08, 0.08]) { const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.6, 4), shell); ant.position.set(ex, 0.62, 0.5); ant.rotation.x = 1.2; this.antennae.add(ant); }
            this.bodyGroup.add(this.antennae);
            this.abdomen = new THREE.Group();
            if (wide) { const ab = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), shell); ab.position.set(0, 0.55, -0.35); this.abdomen.add(ab); }
            else {
                let z = -0.2, r = 0.2;
                for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r - 0.03, 0.18, 8), shell); seg.position.set(0, 0.6, z); seg.rotation.x = Math.PI / 2; this.abdomen.add(seg); z -= 0.2; r -= 0.03; }
                const fan = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.2, 6), shell); fan.position.set(0, 0.6, z); fan.rotation.x = -Math.PI / 2; fan.scale.set(1, 1, 0.4); this.abdomen.add(fan);
            }
            this.bodyGroup.add(this.abdomen);
            this.clawL = this._claw(-1, shell, wide); this.clawR = this._claw(1, shell, wide);
            this.frontLeg = this._crustLeg(-1, 0.2, shell, wide); this.rearLeg = this._crustLeg(1, 0.2, shell, wide);
            this._legsExtra = [];
            for (const side of [-1, 1]) for (const lz of [0.0, -0.2]) this._legsExtra.push(this._crustLeg(side, lz, shell, wide));
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae, ...this._legsExtra] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] },
                { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] },
                { gone: ['REAR_LEG'], hide: [this.rearLeg] },
            ];
        }
        _claw(side, mat, wide) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), mat); arm.position.set(side * 0.1, 0, 0); arm.rotation.z = side * 1.0; g.add(arm);
            const base = new THREE.Mesh(new THREE.SphereGeometry(wide ? 0.16 : 0.13, 10, 8), mat); base.position.set(side * 0.36, 0.1, 0.12); g.add(base);
            const upper = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), mat); upper.position.set(side * 0.42, 0.22, 0.2); upper.rotation.x = -1.2; g.add(upper); g._upper = upper;
            const lower = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), mat); lower.position.set(side * 0.34, 0.16, 0.2); lower.rotation.x = -1.5; g.add(lower);
            g.position.set(side * 0.3, 0.6, wide ? 0.35 : 0.45); g._side = side; this.bodyGroup.add(g); return g;
        }
        _crustLeg(side, z, mat, wide) {
            // The lobster's shell is barely half the crab's width, so a hip this
            // far out left the rear pair hanging in the air alongside the tail.
            // Tuck the hip under the body and lengthen the leg to keep the stance.
            const hipX = wide ? 0.45 : 0.34, len = wide ? 0.4 : 0.5;
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, len, 5), mat);
            g.position.set(side * hipX, 0.4, z); g.rotation.z = side * 1.1; g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Desert Scorpion: sand chitin, crystalline pincers + stinger ───
        _buildScorpion() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.45);
            const crys = this._mat(p.accent, 0.92, 0.2, p.accent);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), chitin); this.cephalothorax.position.set(0, 0.6, 0.1); this.cephalothorax.scale.set(1.1, 0.7, 1.3); this.bodyGroup.add(this.cephalothorax);
            this.head = new THREE.Group();
            const hh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), chitin); this.head.add(hh);
            this._eye(this.head, -0.06, 0.05, 0.12, 0.04, 0x111111); this._eye(this.head, 0.06, 0.05, 0.12, 0.04, 0x111111);
            this.head.position.set(0, 0.62, 0.42); this.bodyGroup.add(this.head);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), chitin); this.abdomen.position.set(0, 0.6, -0.4); this.abdomen.scale.set(1, 0.7, 1.3); this.bodyGroup.add(this.abdomen);
            // The tail group sits at its root on the abdomen, so the strike arc
            // bends it about that joint instead of swinging the whole metasoma
            // round the creature's feet.
            this.tail = new THREE.Group();
            let z = -0.08, y = 0, r = 0.1;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), chitin); seg.position.set(0, y, z); this.tail.add(seg); z -= 0.05; y += 0.18; r -= 0.008; }
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), crys); this.stinger.position.set(0, y + 0.1, z + 0.12); this.stinger.rotation.x = 0.8; this.tail.add(this.stinger);
            this.tail.position.set(0, 0.6, -0.62); this.bodyGroup.add(this.tail);
            this.pincerL = this._pincer(-1, chitin, crys); this.pincerR = this._pincer(1, chitin, crys);
            this._legs = [];
            for (const side of [-1, 1]) for (const lz of [0.3, 0.1, -0.1, -0.3]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.42, 5), chitin); lg.position.set(side * 0.4, 0.4, lz); lg.rotation.z = side * 1.1; lg._side = side; this.bodyGroup.add(lg); this._legs.push(lg); }
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR };
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.abdomen, this.tail, this.pincerL, this.pincerR, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] },
                { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
            ];
        }
        // A cylinder of radius r run from point a to point b (local space).
        _strut(parent, a, b, r, mat) {
            const d = new THREE.Vector3().subVectors(b, a), len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 6), mat);
            m.position.copy(a).addScaledVector(d, 0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }

        _pincer(side, mat, crys) {
            const g = new THREE.Group();
            // The arm runs from the shoulder to the claw's palm; laid at a fixed
            // tilt it pointed sideways and left the claw hanging in front of it.
            this._strut(g, new THREE.Vector3(-side * 0.1, 0, -0.05), new THREE.Vector3(side * 0.34, 0.05, 0.32), 0.04, mat);
            const base = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), crys); base.position.set(side * 0.34, 0.05, 0.32); g.add(base);
            const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), crys); f1.position.set(side * 0.4, 0.12, 0.44); f1.rotation.x = -1.3; g.add(f1); g._f1 = f1;
            const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 5), crys); f2.position.set(side * 0.3, 0.08, 0.44); f2.rotation.x = -1.5; g.add(f2);
            g.position.set(side * 0.28, 0.6, 0.4); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Worm: segmented annelid, optionally bioluminescent ─────────────
        _buildWorm(glow) {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin); this.head.position.set(0, 0.6, 0.7); this.head.scale.set(1, 0.9, 1.1); this.bodyGroup.add(this.head);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), this._mat(0x3a1a1a, 1, 0.5)); mouth.position.set(0, 0.6, 0.92); mouth.rotation.x = Math.PI / 2; this.bodyGroup.add(mouth); this.head._mouth = mouth;
            this.segs = [];
            let z = 0.4, r = 0.28;
            this.heartSeg = null; this.bodySeg = null;
            for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), (i === 1 && glow) ? this._mat(p.accent, 1, 0.4, p.accent) : skin); seg.position.set(0, 0.6, z); seg.scale.set(1, 0.9, 1.05); this.bodyGroup.add(seg); this.segs.push(seg); if (i === 1) this.heartSeg = seg; if (i === 3) this.bodySeg = seg; z -= 0.32; r -= 0.015; }
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 8), skin); this.tail.position.set(0, 0.6, z); this.tail.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tail);
            this.glowRings = null;
            if (glow) {
                this.glowRings = new THREE.Group();
                this.segs.forEach(s => { const ring = new THREE.Mesh(new THREE.TorusGeometry(s.geometry.parameters.radius * 1.05, 0.02, 6, 14), this._mat(p.accent, 0.8, 0.3, p.accent)); ring.position.copy(s.position); ring.rotation.x = Math.PI / 2; this.glowRings.add(ring); });
                this.bodyGroup.add(this.glowRings);
            }
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heartSeg, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            const allSegs = [this.head, ...this.segs, this.tail, this.glowRings].filter(Boolean);
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'BODY_SEGMENT'], hide: allSegs },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ════════════════════════════════════════════════════════════════════
        // Level 1-5 starter roster: one bespoke model per enemy (lv_ keys).
        // ════════════════════════════════════════════════════════════════════

        // A jointed limb: a Group at pts[0] holding a strut between each pair
        // of points and a ball at every inner joint, so posing the group swings
        // the whole limb about its root. Points are in the parent's space.
        _limb(parent, pts, r, mat, taper) {
            const g = new THREE.Group(); g.position.copy(pts[0]);
            const k = taper === undefined ? 0.8 : taper;
            let rr = r;
            for (let i = 1; i < pts.length; i++) {
                const a = new THREE.Vector3().subVectors(pts[i - 1], pts[0]);
                const b = new THREE.Vector3().subVectors(pts[i], pts[0]);
                this.addStrut(g, mat, a, b, rr, rr * k, 5);
                if (i < pts.length - 1) { const j = new THREE.Mesh(new THREE.SphereGeometry(rr * k * 1.1, 5, 4), mat); j.position.copy(b); g.add(j); }
                rr *= k;
            }
            g._end = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]);
            (parent || this.bodyGroup).add(g); return g;
        }
        // Splayed toes (cones) fanned forward from a limb's end.
        _toes(limb, n, len, r, mat, side) {
            for (let i = 0; i < n; i++) {
                const a = (i - (n - 1) / 2) * 0.45 + (side || 0) * 0.25;
                const toe = new THREE.Mesh(new THREE.ConeGeometry(r, len, 4), mat);
                const d = new THREE.Vector3(Math.sin(a), -0.15, Math.cos(a)).normalize();
                toe.position.copy(limb._end).addScaledVector(d, len / 2);
                toe.quaternion.setFromUnitVectors(V3(0, 1, 0), d); limb.add(toe);
            }
        }
        _darker(hex, k) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }

        // ── Compost Worm: fat red heap-worm, head reared, scraps stuck on ──
        _buildCompostWorm() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            const dark = this._skinMat(this._darker(p.bodyColor, 0.72), 0.6);
            const band = this._mat(p.accent, 1, 0.5);
            // Rings lie on the heap from the tail and rise into a lifted head.
            this.segs = [];
            const N = 9;
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1);
                const r = (0.17 + 0.06 * Math.sin(u * Math.PI)) * (u > 0.75 ? 1 - (u - 0.75) * 1.6 : 1);
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), i % 2 ? dark : skin);
                m.position.set(Math.sin(u * Math.PI * 1.3) * 0.14, r * 0.92 + (1 - u) * (1 - u) * 0.5, 0.55 - u * 1.45);
                m.scale.set(1, 0.92, 1.2); m._base = m.position.clone(); m._u = u;
                this.bodyGroup.add(m); this.segs.push(m);
            }
            // Swollen pale saddle (clitellum): the heart of the worm.
            const sad = this.segs[3]; sad.material = band; sad.scale.multiplyScalar(1.12);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(sad.geometry.parameters.radius * 1.02, 0.03, 4, 10), dark); sad.add(ring);
            // Kitchen scraps stuck to its back: a cup of eggshell, a curl of peel.
            const s5 = this.segs[5], r5 = s5.geometry.parameters.radius;
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0xf2ead8, 1, 0.6)); shell.position.set(0.04, r5 * 0.9, 0); shell.rotation.z = 0.5; s5.add(shell);
            const s6 = this.segs[6], r6 = s6.geometry.parameters.radius;
            const peel = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 3, 7, Math.PI * 1.3), this._mat(0xe8862a, 1, 0.6)); peel.position.set(-r6 * 0.85, r6 * 0.45, 0); peel.rotation.set(0.4, 1.2, 0); s6.add(peel);
            // Blunt head with a puckered mouth, carried ahead of the first ring.
            this.head = new THREE.Group();
            const hm = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), skin); hm.scale.set(1, 0.9, 1.25); this.head.add(hm);
            const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), skin); lobe.rotation.x = Math.PI / 2; lobe.position.set(0, 0.03, 0.17); this.head.add(lobe);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.024, 4, 8), this._mat(0x3a1414, 1, 0.5)); this.maw.position.set(0, -0.06, 0.15); this.head.add(this.maw);
            this._headOff = V3(0, 0.08, 0.17);
            this.head.position.copy(this.segs[0].position).add(this._headOff); this.head.rotation.x = -0.3;
            this.bodyGroup.add(this.head);
            this._partMeshMap = { HEAD: this.head, MAW: this.maw, HEART_SEGMENT: sad, BODY_SEGMENT: this.segs[5], TAIL: this.segs[N - 1] };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'BODY_SEGMENT'], hide: [this.head, ...this.segs] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['TAIL'], hide: [this.segs[N - 1], this.segs[N - 2]] },
            ];
        }

        // ── Dune Wormling: ringed column bursting out of a sand mound, three-
        // petal jaw over a red throat ringed with hooked teeth ────────────────
        _buildDuneWormling() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.75);
            const ridge = this._skinMat(this._darker(p.bodyColor, 0.68), 0.85);
            const gum = this._mat(p.accent, 1, 0.5);
            const tooth = this._mat(0xeee2c4, 1, 0.4);
            const sand = this._skinMat(0xb89a62, 0.95);
            this.mound = new THREE.Group();
            const dune = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), sand); dune.scale.set(1, 0.32, 1); this.mound.add(dune);
            for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; const peb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07 + this.idRand() * 0.05, 0), ridge); peb.position.set(Math.cos(a) * 0.56, 0.04, Math.sin(a) * 0.56); this.mound.add(peb); }
            this.bodyGroup.add(this.mound);
            // Each ring is a joint nested in the one below, so the column bends
            // as one piece; a dark band hides the crease at every joint.
            this.rings = [];
            const R = [0.3, 0.29, 0.27, 0.25, 0.23], H = 0.27;
            let parent = this.bodyGroup;
            for (let i = 0; i < R.length; i++) {
                const j = new THREE.Group(); j.position.set(0, i === 0 ? 0.1 : H, 0); j.rotation.x = i === 0 ? 0.05 : 0.13; j._rx = j.rotation.x;
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(R[i] * 0.94, R[i], H, 8), skin); seg.position.y = H / 2; j.add(seg); j._seg = seg;
                const bandM = new THREE.Mesh(new THREE.TorusGeometry(R[i], 0.045, 4, 8), ridge); bandM.rotation.x = Math.PI / 2; j.add(bandM);
                parent.add(j); this.rings.push(j); parent = j;
            }
            // Mouth collar on the top ring: throat, tooth ring, sensory pits.
            this.head = new THREE.Group(); this.head.position.y = H; parent.add(this.head);
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.08, 9), ridge); this.head.add(collar);
            const throat = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.3, 8), gum); throat.rotation.x = Math.PI; throat.position.y = -0.1; this.head.add(throat);
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2;
                const tth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 4), tooth);
                tth.position.set(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2);
                tth.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(-Math.cos(a), -0.6, -Math.sin(a)).normalize()); this.head.add(tth);
            }
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; const pit = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), this._mat(0xf4e8c8, 1, 0.3)); pit.position.set(Math.cos(a) * 0.265, 0, Math.sin(a) * 0.265); this.head.add(pit); }
            // Three petal jaws hinged on the collar rim, splayed open.
            this.maw = new THREE.Group(); this.head.add(this.maw);
            this._jaws = [];
            for (let i = 0; i < 3; i++) {
                const a = Math.PI / 2 + i * Math.PI * 2 / 3;
                const hinge = new THREE.Group(); hinge.rotation.order = 'YXZ';
                hinge.position.set(Math.cos(a) * 0.24, 0.03, Math.sin(a) * 0.24);
                hinge.rotation.set(0.55, Math.atan2(Math.cos(a), Math.sin(a)), 0); hinge._open = 0.55;
                const petal = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 3), skin); petal.scale.set(1, 1, 0.3); petal.position.y = 0.16; hinge.add(petal);
                for (let k = 0; k < 2; k++) { const ht = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), tooth); ht.position.set((k - 0.5) * 0.09, 0.12, -0.05); ht.rotation.x = -1.3; hinge.add(ht); }
                this.maw.add(hinge); this._jaws.push(hinge);
            }
            this._partMeshMap = { HEAD: this.head, MAW: this.maw, HEART_SEGMENT: this.rings[2]._seg, BODY_SEGMENT: this.rings[1]._seg, TAIL: this.mound };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'BODY_SEGMENT'], hide: [this.rings[0]] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['TAIL'], hide: [this.mound] },
            ];
        }

        // ── Crystal Glowworm: pale larva draped over a crystal knuckle, head
        // bowed over a curtain of beaded snare threads, lantern tail ─────────
        _buildCrystalGlowworm() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            const glow = this._mat(p.accent, 0.95, 0.3, p.accent); this._glowMat = glow;
            const crys = this._mat(0x9a7ae0, 0.82, 0.15, 0x3a2a70);
            this.crystals = new THREE.Group();
            [[0, 0.22, -0.16, 0.16, 1.7, 0], [-0.17, 0.13, -0.06, 0.1, 1.5, 0.5], [0.16, 0.12, -0.28, 0.11, 1.4, -0.45]].forEach(([x, y, z, r, sy, tilt]) => {
                const c = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), crys); c.position.set(x, y, z); c.scale.set(1, sy, 1); c.rotation.z = tilt; this.crystals.add(c);
            });
            this.bodyGroup.add(this.crystals);
            const curve = new THREE.CatmullRomCurve3([V3(0, 0.95, 0.42), V3(0, 0.8, 0.3), V3(0, 0.62, 0.12), V3(0, 0.6, -0.14), V3(0, 0.42, -0.4), V3(0.05, 0.2, -0.56), V3(0.12, 0.11, -0.7)]);
            this.segs = [];
            const N = 11;
            for (let i = 1; i <= N; i++) {
                const u = i / N, lantern = i >= N - 1;
                const r = lantern ? 0.12 : 0.11 - u * 0.02;
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), lantern ? glow : skin);
                m.position.copy(curve.getPoint(u)); this.bodyGroup.add(m); this.segs.push(m);
                if (!lantern && i % 2 === 0) { const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), glow); dot.position.y = r * 0.92; m.add(dot); }
            }
            this.head = new THREE.Group();
            const hm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), skin); hm.scale.set(1, 0.9, 1.2); this.head.add(hm);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), this._mat(0x101018, 1, 0.2)); e.position.set(s * 0.06, 0.04, 0.11); this.head.add(e); }
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.015, 3, 8), this._mat(0x2a1a2a, 1, 0.5)); this.maw.position.set(0, -0.06, 0.1); this.maw.rotation.x = 0.8; this.head.add(this.maw);
            this.head.position.copy(curve.getPoint(0)); this.head.rotation.x = 0.5; this.bodyGroup.add(this.head);
            // The snare: sticky beaded threads let down from under the head.
            this.snare = new THREE.Group(); this.snare.position.set(0, 0.86, 0.43); this.bodyGroup.add(this.snare);
            this._threads = [];
            const silk = this._mat(0xe8f8f4, 0.7, 0.3);
            [-0.06, -0.03, 0, 0.03, 0.06].forEach((x, i) => {
                const len = 0.42 + ((i * 37) % 5) * 0.06;
                const th = new THREE.Group(); th.position.set(x, 0, 0.01 * i);
                const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 3), silk); line.position.y = -len / 2; th.add(line);
                for (let b = 1; b <= 3; b++) { const bead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), glow); bead.position.y = -len * b / 3.2; th.add(bead); }
                this.snare.add(th); this._threads.push(th);
            });
            const N1 = this.segs.length;
            this._lantern = this.segs[N1 - 2];
            this._partMeshMap = { HEAD: this.head, MAW: this.maw, HEART_SEGMENT: this._lantern, BODY_SEGMENT: this.segs[4], TAIL: this.segs[N1 - 1] };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'BODY_SEGMENT'], hide: [this.head, this.snare, ...this.segs] },
                { gone: ['HEAD'], hide: [this.head, this.snare] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['TAIL'], hide: [this.segs[N1 - 1]] },
            ];
        }

        // Shared Frog part map + cascade for the toads and frogs below.
        _wireFrog(extraBody) {
            this._partMeshMap = { HEAD: this.head, BODY: this.body, TONGUE: this.tongue, VOCAL_SAC: this.vocalSac, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, HIND_LEFT_LEG: this.hindLeft, HIND_RIGHT_LEG: this.hindRight };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.tongue, this.vocalSac, this.leftLeg, this.rightLeg, this.hindLeft, this.hindRight, ...(extraBody || [])].filter(Boolean) },
                { gone: ['HEAD'], hide: [this.head, this.tongue] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['VOCAL_SAC'], hide: [this.vocalSac] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['HIND_LEFT_LEG'], hide: [this.hindLeft] },
                { gone: ['HIND_RIGHT_LEG'], hide: [this.hindRight] },
            ];
        }
        // A bulging eye: ball, a pupil of the given shape, an optional lid.
        _frogEye(parent, x, y, z, r, iris, pupil, lid) {
            const g = new THREE.Group(); g.position.set(x, y, z);
            g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), this._mat(iris, 1, 0.25)));
            const pm = new THREE.Mesh(new THREE.BoxGeometry(pupil[0] * r, pupil[1] * r, 0.02), this._mat(0x080808, 1, 0.2)); pm.position.set(0, pupil[2] || 0, r * 0.94); g.add(pm);
            if (lid) { const l = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), lid); l.rotation.x = -0.45; g.add(l); g._lid = l; } // tipped back: hooded, but the iris shows
            parent.add(g); return g;
        }

        // ── Puddle Toad: squat warty sleeper in its own puddle, lids at half ──
        _buildPuddleToad() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85);
            const wart = this._skinMat(this._darker(p.bodyColor, 0.68), 0.9);
            this.puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.8, 0.02, 10), this._mat(0x34465a, 0.75, 0.1)); this.puddle.position.y = 0.01; this.bodyGroup.add(this.puddle);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), skin); this.body.scale.set(1.3, 0.68, 1.1); this.body.position.set(0, 0.31, -0.05); this.bodyGroup.add(this.body);
            for (let i = 0; i < 11; i++) { const u = 0.25 + this.idRand() * 0.7, v = this.idRand() * Math.PI * 2; const w = new THREE.Mesh(new THREE.SphereGeometry(0.045 + this.idRand() * 0.03, 5, 4), wart); w.position.set(Math.sin(u) * Math.cos(v) * 0.42, Math.cos(u) * 0.42, Math.sin(u) * Math.sin(v) * 0.42); this.body.add(w); }
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin); skull.scale.set(1.3, 0.62, 1.0); this.head.add(skull);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.014, 3, 10, Math.PI), this._mat(0x241a12, 1, 0.6)); mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.3, 1, 1); mouth.position.y = -0.04; this.head.add(mouth);
            this._eyes = [];
            for (const s of [-1, 1]) {
                this._eyes.push(this._frogEye(this.head, s * 0.17, 0.17, 0.1, 0.09, p.accent, [0.95, 0.22, -0.02], skin));
                const gland = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), wart); gland.scale.set(1, 0.7, 1.8); gland.position.set(s * 0.23, 0.1, -0.12); this.head.add(gland);
            }
            this.head.position.set(0, 0.36, 0.36); this.bodyGroup.add(this.head);
            this.vocalSac = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), this._mat(0xa89a68, 1, 0.7)); this.vocalSac.position.set(0, 0.19, 0.5); this.bodyGroup.add(this.vocalSac);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.32), this._mat(0xc85a66, 1, 0.4)); this.tongue.position.set(0, 0.3, 0.72); this.tongue.visible = false; this.bodyGroup.add(this.tongue);
            this.leftLeg = null; this.rightLeg = null; this.hindLeft = null; this.hindRight = null;
            for (const s of [-1, 1]) {
                const arm = this._limb(this.bodyGroup, [V3(s * 0.3, 0.27, 0.24), V3(s * 0.43, 0.15, 0.32), V3(s * 0.41, 0.03, 0.42)], 0.055, skin);
                this._toes(arm, 3, 0.09, 0.022, skin, s);
                const hind = this._limb(this.bodyGroup, [V3(s * 0.36, 0.24, -0.26), V3(s * 0.56, 0.2, -0.14), V3(s * 0.5, 0.05, -0.36), V3(s * 0.54, 0.02, -0.06)], 0.09, skin, 0.72);
                this._toes(hind, 4, 0.12, 0.025, skin, s);
                if (s < 0) { this.leftLeg = arm; this.hindLeft = hind; } else { this.rightLeg = arm; this.hindRight = hind; }
            }
            this._wireFrog([this.puddle]);
        }

        // ── Bog Tadpole: a tadpole that half-turned: one frog eye, one leg-bud,
        // a long finned tail and a sulking brow ─────────────────────────────
        _buildBogTadpole() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const fin = this._mat(this._darker(p.bodyColor, 1.35), 0.55, 0.4);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), skin); this.body.scale.set(1.0, 0.82, 1.2); this.body.position.set(0, 0.36, 0.12); this.bodyGroup.add(this.body);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 4), this._mat(0xb8b07a, 1, 0.6)); belly.scale.set(1.05, 0.5, 1.2); belly.position.set(0, -0.12, 0.04); this.body.add(belly);
            // Face: the left eye already a bulging frog eye under a scowl, the
            // right still a tadpole's pinprick.
            this.head = new THREE.Group(); this.head.position.set(0, 0.36, 0.12); this.bodyGroup.add(this.head);
            this._frogEye(this.head, -0.24, 0.17, 0.26, 0.1, p.accent, [0.9, 0.3, 0]);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.07), skin); brow.position.set(-0.22, 0.28, 0.3); brow.rotation.z = -0.35; this.head.add(brow);
            const pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), this._mat(0x0c0c0c, 1, 0.2)); pin.position.set(0.24, 0.12, 0.34); this.head.add(pin);
            this.tongue = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 4, 8), this._mat(0x2a2018, 1, 0.5)); this.tongue.position.set(0, -0.08, 0.47); this.head.add(this.tongue);
            // Spiracle on the left flank only, as on a real tadpole.
            this.vocalSac = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.1, 5), skin); this.vocalSac.position.set(-0.36, 0.3, -0.02); this.vocalSac.rotation.set(0.6, 0, 1.0); this.bodyGroup.add(this.vocalSac);
            // Tail: nested joints, so the sway bends it instead of slicing it.
            this._tail = [];
            let parent = this.bodyGroup; const L = 0.2;
            for (let i = 0; i < 5; i++) {
                const r = 0.15 - i * 0.025;
                const j = new THREE.Group(); j.position.set(0, i === 0 ? 0.36 : 0, i === 0 ? -0.3 : -L);
                const core = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), skin); core.scale.set(0.8, 1, 1.6); core.position.z = -L / 2; j.add(core);
                const vane = new THREE.Mesh(new THREE.SphereGeometry(r * 2.1, 5, 4), fin); vane.scale.set(0.08, 1, 0.9); vane.position.z = -L / 2; j.add(vane);
                parent.add(j); this._tail.push(j); parent = j;
            }
            this.leftLeg = this._limb(this.bodyGroup, [V3(-0.28, 0.2, 0.3), V3(-0.38, 0.11, 0.38), V3(-0.36, 0.02, 0.46)], 0.035, skin);
            this._toes(this.leftLeg, 3, 0.06, 0.015, skin, -1);
            this.rightLeg = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), skin); this.rightLeg.position.set(0.33, 0.17, 0.3); this.bodyGroup.add(this.rightLeg);
            this.hindLeft = this._limb(this.bodyGroup, [V3(-0.16, 0.24, -0.28), V3(-0.3, 0.12, -0.24), V3(-0.33, 0.02, -0.12)], 0.03, skin);
            this.hindRight = this._limb(this.bodyGroup, [V3(0.16, 0.24, -0.28), V3(0.3, 0.12, -0.24), V3(0.33, 0.02, -0.12)], 0.03, skin);
            for (const [h, s] of [[this.hindLeft, -1], [this.hindRight, 1]]) this._toes(h, 3, 0.07, 0.015, fin, s);
            this._wireFrog([this._tail[0]]);
        }

        // ── Canopy Tree Frog: bright, slim, red bug-eyed, gripping a branch
        // with orange sticky pads ──────────────────────────────────────────
        _buildCanopyTreeFrog() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.35);
            const pad = this._mat(0xff8a2a, 1, 0.3);
            const bark = this._skinMat(0x5a3a22, 0.9);
            this.branch = new THREE.Group();
            const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 1.3, 6), bark); limb.rotation.z = Math.PI / 2; this.branch.add(limb);
            const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.32, 4), bark); twig.position.set(0.48, 0.13, 0.04); twig.rotation.z = -0.7; this.branch.add(twig);
            const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 5, 3), this._mat(0x3a7a2a, 1, 0.5)); leaf.scale.set(1, 0.12, 0.5); leaf.position.set(0.62, 0.26, 0.04); leaf.rotation.z = 0.5; this.branch.add(leaf);
            this.branch.position.set(0, 0.14, -0.08); this.bodyGroup.add(this.branch);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin); this.body.scale.set(0.95, 0.8, 1.35); this.body.rotation.x = -0.35; this.body.position.set(0, 0.42, -0.02); this.bodyGroup.add(this.body);
            for (const s of [-1, 1]) {
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.42), this._mat(0x3a6ad8, 1, 0.4)); stripe.position.set(s * 0.245, 0, 0); this.body.add(stripe);
            }
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), skin); skull.scale.set(1.3, 0.78, 1.05); this.head.add(skull);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 3, 10, Math.PI), this._mat(0x1a3a12, 1, 0.5)); mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.3, 1, 1); mouth.position.y = -0.04; this.head.add(mouth);
            this._eyes = [this._frogEye(this.head, -0.17, 0.1, 0.02, 0.1, p.accent, [0.22, 1.1, 0]), this._frogEye(this.head, 0.17, 0.1, 0.02, 0.1, p.accent, [0.22, 1.1, 0])];
            this.head.position.set(0, 0.6, 0.27); this.bodyGroup.add(this.head);
            this.vocalSac = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), this._mat(0xe8e070, 1, 0.5)); this.vocalSac.position.set(0, 0.47, 0.37); this.bodyGroup.add(this.vocalSac);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.3), this._mat(0xd85a6a, 1, 0.4)); this.tongue.position.set(0, 0.55, 0.6); this.tongue.visible = false; this.bodyGroup.add(this.tongue);
            const grip = (lg, s) => { for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 3), pad); d.position.copy(lg._end).add(V3(s * (i - 1) * 0.045, 0.0, 0.03)); d.scale.set(1, 0.6, 1); lg.add(d); } };
            for (const s of [-1, 1]) {
                const arm = this._limb(this.bodyGroup, [V3(s * 0.15, 0.4, 0.18), V3(s * 0.29, 0.28, 0.2), V3(s * 0.22, 0.23, -0.02)], 0.04, skin);
                grip(arm, s);
                const hind = this._limb(this.bodyGroup, [V3(s * 0.17, 0.36, -0.24), V3(s * 0.4, 0.44, -0.06), V3(s * 0.34, 0.27, -0.3), V3(s * 0.28, 0.23, -0.13)], 0.055, skin, 0.75);
                grip(hind, s);
                if (s < 0) { this.leftLeg = arm; this.hindLeft = hind; } else { this.rightLeg = arm; this.hindRight = hind; }
            }
            this._wireFrog([this.branch]);
        }

        // ── Cane Toad: a huge warty slab with bony brow crests and shoulder
        // glands weeping milky poison ───────────────────────────────────────
        _buildCaneToad() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.9);
            const wart = this._skinMat(this._darker(p.bodyColor, 0.62), 0.95);
            const milk = this._mat(p.accent, 0.95, 0.15);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), skin); this.body.scale.set(1.35, 0.78, 1.2); this.body.position.set(0, 0.42, -0.05); this.bodyGroup.add(this.body);
            for (let i = 0; i < 18; i++) { const u = 0.2 + this.idRand() * 0.85, v = this.idRand() * Math.PI * 2; const w = new THREE.Mesh(new THREE.SphereGeometry(0.04 + this.idRand() * 0.04, 4, 3), wart); w.position.set(Math.sin(u) * Math.cos(v) * 0.5, Math.cos(u) * 0.5, Math.sin(u) * Math.sin(v) * 0.5); this.body.add(w); }
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), skin); skull.scale.set(1.35, 0.58, 1.0); this.head.add(skull);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.018, 3, 10, Math.PI), this._mat(0x2a1a10, 1, 0.6)); mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.35, 1, 1); mouth.position.y = -0.05; this.head.add(mouth);
            this._eyes = [];
            for (const s of [-1, 1]) {
                this._eyes.push(this._frogEye(this.head, s * 0.22, 0.15, 0.1, 0.075, 0xc8a040, [0.9, 0.25, 0]));
                // Bony crest: a ridge over the eye that runs back towards the gland.
                const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.3), wart); crest.position.set(s * 0.14, 0.2, -0.02); crest.rotation.y = s * 0.3; this.head.add(crest);
            }
            this.head.position.set(0, 0.5, 0.5); this.bodyGroup.add(this.head);
            // Parotoid glands on the shoulders, each with beads of milky venom.
            this._drips = [];
            for (const s of [-1, 1]) {
                const gland = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), wart); gland.scale.set(0.9, 0.7, 1.6); gland.position.set(s * 0.34, 0.66, 0.16); this.bodyGroup.add(gland);
                for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), milk); d.position.set(s * (0.36 + k * 0.02), 0.58, 0.06 + k * 0.1); d.scale.set(1, 1.8, 1); this.bodyGroup.add(d); this._drips.push(d); }
            }
            this.vocalSac = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), this._mat(0xb89a70, 1, 0.8)); this.vocalSac.position.set(0, 0.3, 0.7); this.bodyGroup.add(this.vocalSac);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.4), this._mat(0xc85a5a, 1, 0.4)); this.tongue.position.set(0, 0.42, 0.98); this.tongue.visible = false; this.bodyGroup.add(this.tongue);
            for (const s of [-1, 1]) {
                const arm = this._limb(this.bodyGroup, [V3(s * 0.4, 0.34, 0.3), V3(s * 0.58, 0.2, 0.38), V3(s * 0.52, 0.03, 0.5)], 0.085, skin);
                this._toes(arm, 4, 0.12, 0.03, skin, s);
                const hind = this._limb(this.bodyGroup, [V3(s * 0.5, 0.3, -0.3), V3(s * 0.74, 0.24, -0.1), V3(s * 0.62, 0.07, -0.38), V3(s * 0.66, 0.03, -0.05)], 0.11, skin, 0.75);
                this._toes(hind, 4, 0.15, 0.035, skin, s);
                if (s < 0) { this.leftLeg = arm; this.hindLeft = hind; } else { this.rightLeg = arm; this.hindRight = hind; }
            }
            this._wireFrog();
        }

        // ── Cinder Newt: soot-black salamander with an ember crest, glowing
        // flank cracks and a smouldering tail tip ────────────────────────────
        _buildCinderNewt() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            const ember = this._mat(p.accent, 1, 0.3, p.accent);
            this._emberMat = ember;
            this.torso = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5), skin); this.torso.scale.set(1.1, 0.75, 2.2); this.torso.position.set(0, 0.19, 0); this.bodyGroup.add(this.torso);
            for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1, z = -0.15 + (i >> 1) * 0.1; const crack = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), ember); crack.scale.set(0.5, 1, 2.2); crack.position.set(s * 0.2, 0.02, z / 2.2); this.torso.add(crack); }
            this._crest = [];
            for (let i = 0; i < 7; i++) {
                const z = 0.36 - i * 0.12, h = 0.12 - Math.abs(i - 3) * 0.015;
                const spk = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), ember);
                spk.position.set(0, 0.19 + 0.15 * Math.sqrt(Math.max(0, 1 - (z / 0.44) * (z / 0.44))) + h / 2 - 0.02, z); spk.rotation.x = -0.25;
                this.bodyGroup.add(spk); this._crest.push(spk);
            }
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), skin); skull.scale.set(1.15, 0.62, 1.35); this.head.add(skull);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), ember); e.position.set(s * 0.12, 0.06, 0.1); this.head.add(e); }
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 3, 8, Math.PI), this._mat(0x0a0606, 1, 0.5)); lip.rotation.x = Math.PI / 2; lip.scale.set(1.15, 1.35, 1); lip.position.y = -0.03; this.head.add(lip);
            this.tongue = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.16), this._mat(0xff5a2a, 1, 0.4, 0xff3a00)); f.position.set(s * 0.02, 0, 0.08); f.rotation.y = s * 0.2; this.tongue.add(f); }
            this.tongue.position.set(0, -0.03, 0.22); this.tongue.visible = false; this.head.add(this.tongue);
            this.head.position.set(0, 0.22, 0.52); this.bodyGroup.add(this.head);
            // Laterally flattened tail as nested joints with a crest fin.
            this._tail = [];
            let parent = this.bodyGroup; const L = 0.17;
            for (let i = 0; i < 6; i++) {
                const r = 0.14 - i * 0.02;
                const j = new THREE.Group(); j.position.set(0, i === 0 ? 0.19 : 0, i === 0 ? -0.36 : -L); j.rotation.x = i === 0 ? 0 : 0.04;
                const core = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), i === 5 ? ember : skin); core.scale.set(0.75, 1, 1.6); core.position.z = -L / 2; j.add(core);
                const vane = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 4, 3), skin); vane.scale.set(0.12, 0.8, 1.1); vane.position.set(0, r * 0.6, -L / 2); j.add(vane);
                parent.add(j); this._tail.push(j); parent = j;
            }
            const legs = [];
            for (const z of [0.28, -0.26]) for (const s of [-1, 1]) {
                const lg = this._limb(this.bodyGroup, [V3(s * 0.15, 0.17, z), V3(s * 0.34, 0.2, z + 0.03), V3(s * 0.42, 0.02, z + 0.12)], 0.045, skin);
                this._toes(lg, 4, 0.06, 0.016, skin, s); legs.push(lg);
            }
            [this.leftLeg, this.rightLeg, this.hindLeft, this.hindRight] = legs;
            this._partMeshMap = { HEAD: this.head, TORSO: this.torso, TONGUE: this.tongue, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['TORSO'], hide: [this.torso, this.head, this.leftLeg, this.rightLeg, this.hindLeft, this.hindRight, this._tail[0], ...this._crest] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // Shared Crustacean part map + cascade.
        _wireCrust(extra) {
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae, MANDIBLES: this.mandibles };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae, this.mandibles, ...(extra || [])].filter(Boolean) },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] },
                { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] },
                { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
                { gone: ['MANDIBLES'], hide: [this.mandibles] },
            ];
        }
        // Walking legs: one limb per (side, z), split into a front and a rear
        // group for the two leg parts. hipX, knee lift, reach and leg radius.
        _crustLegs(mat, zs, hipX, hipY, knee, reach, r) {
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            this.bodyGroup.add(this.frontLeg, this.rearLeg);
            this._walkers = [];
            zs.forEach((z, i) => { for (const s of [-1, 1]) {
                const lg = this._limb(i < zs.length / 2 ? this.frontLeg : this.rearLeg, [V3(s * hipX, hipY, z), V3(s * (hipX + reach * 0.5), hipY + knee, z * 1.15), V3(s * (hipX + reach), 0.0, z * 1.35)], r, mat, 0.7);
                lg._side = s; lg._i = i; this._walkers.push(lg);
            } });
        }
        // A pincer: arm limb from the shoulder through the elbow to the wrist,
        // a palm, a fixed finger and a hinged one (this claw's ._finger).
        _pincerArm(side, pts, palmR, mat, fingerMat) {
            const arm = this._limb(this.bodyGroup, pts, palmR * 0.35, mat, 0.85);
            const e = arm._end, prev = new THREE.Vector3().subVectors(pts[pts.length - 2], pts[0]);
            const dir = new THREE.Vector3().subVectors(e, prev).normalize();
            const palm = new THREE.Mesh(new THREE.SphereGeometry(palmR, 6, 5), mat); palm.scale.set(0.75, 0.8, 1.35);
            palm.position.copy(e).addScaledVector(dir, palmR * 0.9); palm.quaternion.setFromUnitVectors(V3(0, 0, 1), dir); arm.add(palm);
            const tip = palm.position.clone().addScaledVector(dir, palmR * 1.1);
            const fixed = new THREE.Mesh(new THREE.ConeGeometry(palmR * 0.38, palmR * 1.6, 4), fingerMat || mat);
            fixed.position.copy(tip).addScaledVector(dir, palmR * 0.6).add(V3(side * palmR * 0.2, -palmR * 0.25, 0)); fixed.quaternion.setFromUnitVectors(V3(0, 1, 0), dir); arm.add(fixed);
            // The hinge is aimed down the claw; the flex group inside it is what
            // opens and shuts, so the bite is a clean turn about the knuckle.
            const hinge = new THREE.Group(); hinge.position.copy(tip).add(V3(-side * palmR * 0.15, palmR * 0.3, 0)); hinge.quaternion.setFromUnitVectors(V3(0, 1, 0), dir);
            const flex = new THREE.Group(); hinge.add(flex);
            const mov = new THREE.Mesh(new THREE.ConeGeometry(palmR * 0.34, palmR * 1.5, 4), fingerMat || mat); mov.position.y = palmR * 0.7; flex.add(mov);
            arm.add(hinge); arm._finger = flex; arm._palm = palm; arm._side = side;
            return arm;
        }
        // A short eye stalk with a black bead; pushed into this.antennae.
        _stalkEye(x, y, z, len, mat) {
            this.addStrut(this.antennae, mat, V3(x, y, z), V3(x * 1.2, y + len, z + 0.02), 0.02, 0.016, 4);
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), this._mat(0x0a0a0a, 1, 0.2)); e.position.set(x * 1.2, y + len + 0.02, z + 0.02); this.antennae.add(e);
        }

        // ── Bottlecap Hermit Crab: a soft little crab living in a crimped
        // bottle cap, logo and all, one claw far bigger than the other ────────
        _buildBottlecapHermit() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.45);
            const capMat = this._mat(0xb8282a, 1, 0.35);
            const metal = this._mat(p.accent, 1, 0.25);
            this.abdomen = new THREE.Group();
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), capMat); this.abdomen.add(cap);
            for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const flute = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04), metal); flute.position.set(Math.cos(a) * 0.31, -0.07, Math.sin(a) * 0.31); flute.rotation.y = -a; this.abdomen.add(flute); }
            const logo = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.012, 12), this._mat(0xf4f0e0, 1, 0.4)); logo.position.y = 0.106; this.abdomen.add(logo);
            const mark = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 3, 5), capMat); mark.rotation.x = Math.PI / 2; mark.position.y = 0.115; this.abdomen.add(mark);
            const hollow = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.01, 12), this._mat(0x140c0a, 1, 0.8)); hollow.position.y = -0.101; this.abdomen.add(hollow);
            this.abdomen.position.set(0, 0.3, -0.18); this.abdomen.rotation.x = -1.05; this.bodyGroup.add(this.abdomen);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), shell); this.carapace.scale.set(1.15, 0.8, 1.0); this.carapace.position.set(0, 0.3, 0.05); this.bodyGroup.add(this.carapace);
            this.antennae = new THREE.Group(); this.bodyGroup.add(this.antennae);
            for (const s of [-1, 1]) {
                this._stalkEye(s * 0.06, 0.38, 0.14, 0.16, shell);
                this.addStrut(this.antennae, shell, V3(s * 0.03, 0.33, 0.18), V3(s * 0.16, 0.52, 0.42), 0.01, 0.006, 3);
            }
            this.mandibles = new THREE.Group(); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), shell); m.position.set(s * 0.04, 0.24, 0.2); m.rotation.x = 2.2; this.mandibles.add(m); }
            this.clawR = this._pincerArm(1, [V3(0.1, 0.27, 0.14), V3(0.25, 0.24, 0.26), V3(0.24, 0.22, 0.36)], 0.11, shell);
            this.clawL = this._pincerArm(-1, [V3(-0.1, 0.27, 0.14), V3(-0.19, 0.22, 0.22), V3(-0.18, 0.2, 0.3)], 0.055, shell);
            this._crustLegs(shell, [0.1, -0.02], 0.12, 0.24, 0.06, 0.2, 0.026);
            this._wireCrust();
        }

        // ── Shore Crab: a broad green-brown trapezoid, serrated brow, barnacled
        // back and both claws raised in warning ─────────────────────────────
        _buildShoreCrab() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.6);
            const bar = this._mat(p.accent, 1, 0.8);
            this.carapace = new THREE.Group();
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.13, 7), shell); plate.scale.set(1.25, 1, 0.95); this.carapace.add(plate);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.scale.set(1.25, 0.3, 0.95); dome.position.y = 0.06; this.carapace.add(dome);
            for (const k of [-2, -1, 1, 2]) { const a = Math.PI / 2 + k * 0.34; const d = V3(Math.cos(a), 0, Math.sin(a)); const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), shell); t.position.set(d.x * 0.5, 0.02, d.z * 0.38); t.quaternion.setFromUnitVectors(V3(0, 1, 0), d); this.carapace.add(t); }
            // Barnacles: little volcano cones, each with a dark vent.
            [[0.18, 0.08], [-0.12, -0.06], [0.0, -0.16], [-0.24, 0.1], [0.26, -0.1]].forEach(([x, z]) => {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.06, 6), bar); b.position.set(x, 0.12 * Math.sqrt(Math.max(0, 1 - (x / 0.5) * (x / 0.5) - (z / 0.38) * (z / 0.38))) + 0.07, z); this.carapace.add(b);
                const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 5), this._mat(0x1a1612, 1, 0.8)); vent.position.y = 0.031; b.add(vent);
            });
            this.carapace.position.set(0, 0.42, 0); this.bodyGroup.add(this.carapace);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 3), shell); this.abdomen.scale.set(1.2, 0.4, 0.8); this.abdomen.position.set(0, 0.34, -0.26); this.bodyGroup.add(this.abdomen);
            this.antennae = new THREE.Group(); this.bodyGroup.add(this.antennae);
            for (const s of [-1, 1]) {
                this._stalkEye(s * 0.08, 0.46, 0.3, 0.08, shell);
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.03), shell); brow.position.set(s * 0.1, 0.6, 0.34); brow.rotation.z = s * 0.45; this.antennae.add(brow);
            }
            this.mandibles = new THREE.Group(); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.03), shell); m.position.set(s * 0.04, 0.36, 0.35); this.mandibles.add(m); }
            this.clawL = this._pincerArm(-1, [V3(-0.3, 0.42, 0.24), V3(-0.48, 0.54, 0.36), V3(-0.42, 0.74, 0.44)], 0.11, shell);
            this.clawR = this._pincerArm(1, [V3(0.3, 0.42, 0.24), V3(0.48, 0.54, 0.36), V3(0.42, 0.74, 0.44)], 0.11, shell);
            const lone = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, 0.05, 6), bar); lone.position.copy(this.clawR._palm.position).add(V3(0.06, 0.04, 0)); this.clawR.add(lone);
            this._crustLegs(shell, [0.15, 0.02, -0.12, -0.25], 0.38, 0.4, 0.12, 0.36, 0.036);
            this._wireCrust();
        }

        // ── Ditch Crayfish: muddy, red-clawed, rostrum out, claws raised, tail
        // fanned on the ground behind ───────────────────────────────────────
        _buildDitchCrayfish() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.6);
            const red = this._skinMat(p.accent, 0.5);
            const mud = this._skinMat(0x4a3a24, 1);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 5), shell); this.carapace.scale.set(1.05, 0.8, 1.65); this.carapace.position.set(0, 0.36, 0.12); this.bodyGroup.add(this.carapace);
            const ros = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), shell); ros.position.set(0, 0.06, 0.24); ros.rotation.x = Math.PI / 2 - 0.15; this.carapace.add(ros);
            for (let i = 0; i < 3; i++) { const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + i * 0.012, 0), mud); clod.position.set((i - 1) * 0.1, 0.17, -0.05 + i * 0.06); this.carapace.add(clod); }
            // Tail: five nested plates trailing back, then the fan.
            this.abdomen = new THREE.Group(); this.abdomen.position.set(0, 0.36, -0.18); this.bodyGroup.add(this.abdomen);
            this._tail = [];
            let parent = this.abdomen; const L = 0.15;
            for (let i = 0; i < 5; i++) {
                const r = 0.16 - i * 0.017;
                const j = new THREE.Group(); j.position.z = i === 0 ? 0 : -L; j.rotation.x = i === 0 ? 0.04 : -0.12; j._rx = j.rotation.x;
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, L * 1.25, 6), shell); seg.rotation.x = -Math.PI / 2; seg.scale.set(1, 1, 0.75); seg.position.z = -L / 2; j.add(seg);
                parent.add(j); this._tail.push(j); parent = j;
            }
            for (let k = -2; k <= 2; k++) { const fan = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 3), shell); fan.scale.set(1, 1, 0.25); fan.position.set(k * 0.06, 0, -L - 0.06); fan.rotation.set(-Math.PI / 2, 0, k * 0.35); parent.add(fan); }
            this.antennae = new THREE.Group(); this.bodyGroup.add(this.antennae);
            for (const s of [-1, 1]) {
                this._stalkEye(s * 0.06, 0.45, 0.38, 0.06, shell);
                this.addStrut(this.antennae, red, V3(s * 0.04, 0.4, 0.46), V3(s * 0.26, 0.56, 0.74), 0.014, 0.01, 3);
                this.addStrut(this.antennae, red, V3(s * 0.26, 0.56, 0.74), V3(s * 0.6, 0.5, 0.3), 0.01, 0.005, 3);
            }
            this.mandibles = new THREE.Group(); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), shell); m.position.set(s * 0.04, 0.27, 0.42); m.rotation.x = 2.3; this.mandibles.add(m); }
            this.clawL = this._pincerArm(-1, [V3(-0.14, 0.32, 0.3), V3(-0.32, 0.38, 0.44), V3(-0.28, 0.46, 0.64)], 0.1, red);
            this.clawR = this._pincerArm(1, [V3(0.14, 0.32, 0.3), V3(0.32, 0.38, 0.44), V3(0.28, 0.46, 0.64)], 0.1, red);
            for (const c of [this.clawL, this.clawR]) for (let k = 0; k < 3; k++) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), shell); knob.position.copy(c._palm.position).add(V3(c._side * 0.06, 0.05, (k - 1) * 0.06)); c.add(knob); }
            this._crustLegs(shell, [0.16, 0.06, -0.04, -0.14], 0.14, 0.28, 0.07, 0.26, 0.024);
            this._wireCrust();
        }

        // ── Coconut Crab: towering purple-blue climber on long orange legs,
        // a coconut cracked in its great left claw ──────────────────────────
        _buildCoconutCrab() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.5);
            const leg = this._skinMat(p.accent, 0.55);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), shell); this.carapace.scale.set(1.2, 0.72, 1.05); this.carapace.position.set(0, 0.58, 0.05); this.bodyGroup.add(this.carapace);
            for (const s of [-1, 1]) { const groove = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 3, 8, Math.PI), this._mat(0x241a34, 1, 0.6)); groove.position.set(s * 0.12, 0.21, 0.02); groove.rotation.set(-Math.PI / 2, 0, -s * Math.PI / 2); this.carapace.add(groove); }
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5), leg); this.abdomen.scale.set(1, 0.8, 1.2); this.abdomen.position.set(0, 0.44, -0.34); this.bodyGroup.add(this.abdomen);
            this.antennae = new THREE.Group(); this.bodyGroup.add(this.antennae);
            for (const s of [-1, 1]) {
                this._stalkEye(s * 0.1, 0.7, 0.32, 0.12, shell);
                this.addStrut(this.antennae, leg, V3(s * 0.05, 0.64, 0.36), V3(s * 0.3, 0.98, 0.62), 0.014, 0.008, 3);
            }
            this.mandibles = new THREE.Group(); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), leg); m.position.set(s * 0.05, 0.5, 0.36); m.rotation.x = 2.2; this.mandibles.add(m); }
            this.clawL = this._pincerArm(-1, [V3(-0.3, 0.55, 0.25), V3(-0.52, 0.5, 0.4), V3(-0.42, 0.44, 0.58)], 0.16, shell, leg);
            this.clawR = this._pincerArm(1, [V3(0.3, 0.55, 0.25), V3(0.46, 0.5, 0.36), V3(0.38, 0.45, 0.5)], 0.1, shell, leg);
            // The coconut, gripped between the fingers of the big claw.
            this.coconut = new THREE.Group();
            const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), this._skinMat(0x6a4426, 1)); this.coconut.add(nut);
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.1), this._mat(0xf4f0e4, 1, 0.5)); crack.position.set(0.12, 0.02, 0.05); crack.rotation.z = 0.4; this.coconut.add(crack);
            this.coconut.position.copy(this.clawL._palm.position).add(V3(0.05, -0.1, 0.2)); this.clawL.add(this.coconut);
            this._crustLegs(leg, [0.14, -0.06, -0.24], 0.32, 0.5, 0.26, 0.56, 0.045);
            this._wireCrust([this.coconut]);
        }

        // Shared Snail part map + cascade.
        _wireSnail(extra) {
            this._partMeshMap = { SHELL: this.shell, BODY: this.body, FOOT: this.foot, TENTACLE_1: this.t1, TENTACLE_2: this.t2, EYE: this.t1, MOUTH: this.mouth };
            this._cascadeRules = [
                { gone: ['BODY', 'FOOT'], hide: [this.body, this.foot, this.shell, this.t1, this.t2, this.mouth, ...(extra || [])].filter(Boolean) },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['TENTACLE_1', 'EYE'], hide: [this.t1] },
                { gone: ['TENTACLE_2'], hide: [this.t2] },
                { gone: ['MOUTH'], hide: [this.mouth] },
            ];
        }
        // Foot, raised neck, eye stalks, feelers and mouth shared by the snails.
        _snailBody(skin, footR, footY, neckZ, eyeMat, stalkLen) {
            this.foot = new THREE.Mesh(new THREE.SphereGeometry(footR, 8, 4), skin); this.foot.scale.set(0.92, 0.34, 2.3); this.foot.position.set(0, footY, 0.05); this.bodyGroup.add(this.foot);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), skin); this.body.scale.set(1, 1.4, 1.2); this.body.position.set(0, footY + 0.18, neckZ); this.bodyGroup.add(this.body);
            const top = footY + 0.36;
            const stalk = (x) => {
                const g = new THREE.Group(); g.position.set(x, top - 0.04, neckZ + 0.04);
                const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, stalkLen, 4), skin); st.position.y = stalkLen / 2; g.add(st);
                const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), eyeMat); e.position.y = stalkLen + 0.02; g.add(e);
                g.rotation.z = -x * 1.6; this.bodyGroup.add(g); return g;
            };
            this.t1 = stalk(-0.07); this.t2 = stalk(0.07);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 4), skin); f.position.set(s * 0.08, footY + 0.12, neckZ + 0.18); f.rotation.set(1.3, 0, -s * 0.4); this.bodyGroup.add(f); }
            this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.016, 3, 8), this._mat(0x2a1a1a, 1, 0.6)); this.mouth.position.set(0, footY + 0.1, neckZ + 0.17); this.bodyGroup.add(this.mouth);
        }

        // ── Moss Snail: a coiled shell carrying its own little garden: moss,
        // toadstools, grass and a flower, over a glistening slime trail ──────
        _buildMossSnail() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const shellMat = this._skinMat(p.shell, 0.8);
            const moss = this._skinMat(p.accent, 1);
            this._snailBody(skin, 0.28, 0.1, 0.5, this._mat(0x101010, 1, 0.2), 0.28);
            const trail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.6), this._mat(0xd8e8f0, 0.45, 0.05)); trail.position.set(0, 0.005, -0.72); this.bodyGroup.add(trail);
            this.shell = new THREE.Group();
            const whorl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), shellMat); whorl.scale.set(0.75, 1, 1); this.shell.add(whorl);
            for (const s of [-1, 1]) [[0.22, 0.2], [0.14, 0.235], [0.07, 0.25]].forEach(([r, x]) => { const c = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 10), this._skinMat(this._darker(p.shell, 0.7), 0.8)); c.rotation.y = Math.PI / 2; c.position.x = s * x; this.shell.add(c); });
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), moss); cap.scale.set(0.95, 0.45, 1.1); cap.position.y = 0.27; this.shell.add(cap);
            // The garden, rooted in the moss and swaying as one.
            this.garden = new THREE.Group(); this.garden.position.y = 0.38; this.shell.add(this.garden);
            const shroom = (x, z, h, r, col) => {
                const st = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.4, h, 5), this._mat(0xf0e8d0, 1, 0.6)); st.position.set(x, h / 2 - 0.02, z); this.garden.add(st);
                const cp = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(col, 1, 0.5)); cp.scale.set(1, 0.7, 1); cp.position.set(x, h - 0.03, z); this.garden.add(cp);
                return cp;
            };
            const red = shroom(0.06, 0.04, 0.14, 0.07, 0xc8302a);
            for (let i = 0; i < 3; i++) { const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 3, 2), this._mat(0xffffff, 1, 0.5)); dot.position.set(Math.cos(i * 2.1) * 0.04, 0.035, Math.sin(i * 2.1) * 0.04); red.add(dot); }
            shroom(-0.07, -0.06, 0.09, 0.045, 0xc8a070);
            for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.18, 3), this._mat(0x6aa83a, 1, 0.6)); blade.position.set(-0.1 + i * 0.05, 0.07, 0.1 - i * 0.02); blade.rotation.z = (i - 1.5) * 0.25; this.garden.add(blade); }
            const fstem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 3), this._mat(0x4a8a2a, 1, 0.6)); fstem.position.set(-0.02, 0.09, -0.12); this.garden.add(fstem);
            const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), this._mat(0xf8d030, 1, 0.4)); bloom.position.set(-0.02, 0.2, -0.12); this.garden.add(bloom);
            for (let i = 0; i < 4; i++) { const pet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), this._mat(0xf8f4f0, 1, 0.4)); pet.position.set(Math.cos(i * Math.PI / 2) * 0.035, 0, Math.sin(i * Math.PI / 2) * 0.035); bloom.add(pet); }
            this.shell.position.set(0, 0.48, -0.14); this.bodyGroup.add(this.shell);
            this._wireSnail([trail]);
        }

        // ── Cave Glowsnail: a tall glassy spire lit blue from inside, an open
        // rasping mouth and two lured moths circling the glow ────────────────
        _buildCaveGlowsnail() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            const glass = this._mat(p.shell, 0.82, 0.15, p.shell); glass.emissiveIntensity = 0.45; this._glowMat = glass;
            const win = this._mat(p.accent, 1, 0.1, p.accent);
            this._snailBody(skin, 0.24, 0.08, 0.45, this._mat(0xc8d0d8, 1, 0.3), 0.18);
            const radula = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.06), this._mat(0xd87a8a, 1, 0.4)); radula.position.set(0, -0.01, 0.02); this.mouth.add(radula);
            this.mouth.scale.setScalar(1.35);
            this.shell = new THREE.Group();
            let y = 0, r = 0.26;
            for (let k = 0; k < 5; k++) {
                const w = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 4), glass); w.scale.set(1, 0.72, 1); w.position.y = y; this.shell.add(w);
                const a = k * 1.9; const wd = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 4, 3), win); wd.position.set(Math.cos(a) * r * 0.95, y, Math.sin(a) * r * 0.95); this.shell.add(wd);
                y += r * 0.95; r *= 0.74;
            }
            const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 1.1, r * 3, 5), glass); tip.position.y = y + r * 0.8; this.shell.add(tip);
            this.shell.position.set(0, 0.36, -0.12); this.shell.rotation.x = -0.5; this.bodyGroup.add(this.shell);
            // Moths drawn to the light: deliberate floaters, circling the spire.
            this.moths = [];
            const wingMat = this._mat(0xe8dcc0, 0.9, 0.6);
            for (let i = 0; i < 2; i++) {
                const m = new THREE.Group(); m.userData.float = true;
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 4), this._mat(0x5a4a3a, 1, 0.6)); b.rotation.x = Math.PI / 2; m.add(b);
                for (const s of [-1, 1]) { const wg = new THREE.Mesh(new THREE.CircleGeometry(0.05, 3), wingMat); wg.position.x = s * 0.04; wg.rotation.x = -Math.PI / 2; m.add(wg); }
                m._a = i * Math.PI; m.position.set(Math.cos(m._a) * 0.42, 0.95, -0.25 + Math.sin(m._a) * 0.42); this.bodyGroup.add(m); this.moths.push(m);
            }
            this._wireSnail(this.moths);
        }

        // ── Geode Snail: its shell a split geode, the cut face turned out to
        // show a cave of violet crystals ────────────────────────────────────
        _buildGeodeSnail() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            const stone = this._skinMat(p.shell, 1);
            const lining = this._mat(0x3a2050, 1, 0.6);
            const crys = this._mat(p.accent, 0.92, 0.12, p.accent); crys.emissiveIntensity = 0.3; this._glowMat = crys;
            this._snailBody(skin, 0.3, 0.09, 0.5, this._mat(0x101010, 1, 0.2), 0.22);
            this.shell = new THREE.Group();
            const rind = new THREE.Mesh(new THREE.SphereGeometry(0.38, 7, 5, 0, Math.PI), stone); this.shell.add(rind);
            const inner = new THREE.Mesh(new THREE.SphereGeometry(0.33, 7, 5, 0, Math.PI), lining); this.shell.add(inner);
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.03, 3, 14), stone); this.shell.add(lip);
            // Crystals on the inner wall, pointing out through the cut face.
            for (let i = 0; i < 10; i++) {
                const th = 0.3 + this.idRand() * 2.5, ph = 0.35 + this.idRand() * 2.4;
                const d = V3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th));
                const c = new THREE.Mesh(new THREE.ConeGeometry(0.035 + this.idRand() * 0.02, 0.12 + this.idRand() * 0.08, 4), crys);
                c.position.copy(d).multiplyScalar(0.3);
                c.quaternion.setFromUnitVectors(V3(0, 1, 0), V3(-d.x, -d.y, -d.z - 1.2).normalize()); this.shell.add(c);
            }
            for (const [x, y] of [[0.12, 0.3], [-0.16, 0.26]]) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), crys); s.scale.set(0.7, 1.6, 0.7); s.position.set(x, y, 0.12); this.shell.add(s); }
            this.shell.position.set(0, 0.48, -0.12); this.shell.rotation.y = -2.2; this.bodyGroup.add(this.shell);
            this._wireSnail();
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.02 * this.scale;

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'boghatchling':
                case 'gardenfrog': {
                    if (fast) this.model.position.y = this._baseY + Math.abs(Math.sin(t * 7)) * 0.2 * this.scale; // hop
                    if (this.head) this.head.scale.y = 0.85 + Math.sin(t * 3) * 0.04; // throat
                    if (this.tongue) { this.tongue.visible = fast; if (fast) this.tongue.scale.z = 1 + Math.abs(Math.sin(t * 9)) * 2; }
                    break;
                }
                case 'deathaxolotl': {
                    if (this.gills) this.gills.children.forEach((g, i) => { g.rotation.z = g.rotation.z * 0 + (g.position.x < 0 ? 1 : -1) * (0.9 + Math.sin(t * 4 + i) * 0.3); });
                    if (this.tailFin) this.tailFin.rotation.z = Math.sin(t * 3) * 0.3;
                    this.model.position.y = this._baseY + Math.sin(t * 2) * 0.05 * this.scale;
                    break;
                }
                case 'maggotslail': {
                    if (this.body) this.body.scale.z = 2.0 + Math.sin(t * (fast ? 5 : 2)) * 0.2; // peristalsis
                    [this.t1, this.t2].forEach((s, i) => { if (s) s.rotation.z = Math.sin(t * 1.5 + i) * 0.25; });
                    break;
                }
                case 'freelobster':
                case 'tidecrab': {
                    [this.clawL, this.clawR].forEach((c, i) => { if (c && c._upper) c._upper.rotation.x = -1.2 - (fast ? Math.abs(Math.sin(t * 9 + i)) : Math.abs(Math.sin(t * 2 + i))) * 0.5; });
                    if (this.antennae) this.antennae.rotation.z = Math.sin(t * 2) * 0.06;
                    [this.frontLeg, this.rearLeg, ...(this._legsExtra || [])].forEach((lg, i) => { if (lg) lg.rotation.z = (lg._side || 1) * 1.1 + Math.sin(t * (fast ? 8 : 4) + i) * 0.18; });
                    if (this.variant === 'tidecrab') this.model.position.x = baseX + Math.sin(t * 1.5) * 0.04 * this.scale; // sidle
                    break;
                }
                case 'desertscorpion': {
                    if (this.tail) this.tail.rotation.x = fast ? 0.35 + Math.sin(t * 9) * 0.3 : Math.sin(t * 1.5) * 0.12; // strike arc, forward over the back
                    if (this.stinger) this.stinger.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.3;
                    [this.pincerL, this.pincerR].forEach((pc, i) => { if (pc && pc._f1) pc._f1.rotation.x = -1.3 - (fast ? Math.abs(Math.sin(t * 8 + i)) : Math.abs(Math.sin(t * 2 + i))) * 0.4; });
                    if (this._legs) this._legs.forEach((lg, i) => { lg.rotation.z = lg._side * 1.1 + Math.sin(t * (fast ? 8 : 4) + i) * 0.15; });
                    break;
                }
                case 'caveworm':
                case 'earthworm': {
                    // Undulating segments.
                    if (this.segs) this.segs.forEach((s, i) => { s.position.y = 0.6 + Math.sin(t * (fast ? 6 : 3) - i * 0.7) * 0.08; });
                    if (this.head) this.head.position.y = 0.6 + Math.sin(t * (fast ? 6 : 3) + 0.7) * 0.08;
                    if (this.glowRings) { this.glowRings.children.forEach((rg, i) => { rg.position.y = this.segs[i] ? this.segs[i].position.y : rg.position.y; rg.material.emissiveIntensity = 0.4 + Math.sin(t * 3 + i) * 0.4; }); }
                    break;
                }
                case 'compostworm': {
                    // Lashing travels down the rings; on a strike the front rears.
                    const rate = fast ? 7 : 2.4;
                    this.segs.forEach((s, i) => { const w = Math.sin(t * rate - i * 0.75); s.position.x = s._base.x + w * 0.07 * (0.4 + (1 - s._u)); s.position.y = s._base.y + (fast ? Math.max(0, Math.sin(t * 7)) * 0.16 * Math.max(0, 1 - s._u * 3) : 0); });
                    if (this.head) { this.head.position.copy(this.segs[0].position).add(this._headOff); this.head.rotation.y = Math.sin(t * rate + 0.75) * 0.25; }
                    break;
                }
                case 'dunewormling': {
                    const rate = fast ? 5 : 1.6;
                    this.rings.forEach((j, i) => { j.rotation.z = Math.sin(t * rate - i * 0.7) * 0.06; j.rotation.x = j._rx + (fast ? Math.max(0, Math.sin(t * 6)) * 0.12 : Math.sin(t * 1.1 - i) * 0.03); });
                    const open = fast ? 0.55 + Math.abs(Math.sin(t * 6)) * 0.6 : 0.55 + Math.sin(t * 1.4) * 0.12;
                    if (this._jaws) this._jaws.forEach(h => { h.rotation.x = open; });
                    break;
                }
                case 'crystalglowworm': {
                    if (this._glowMat) this._glowMat.emissiveIntensity = 0.5 + Math.sin(t * 2.2) * 0.35;
                    if (this._threads) this._threads.forEach((th, i) => { th.rotation.z = Math.sin(t * 1.3 + i) * 0.12; th.rotation.x = Math.cos(t * 1.1 + i * 0.7) * 0.1; });
                    if (this.head) this.head.rotation.x = 0.5 + (fast ? Math.abs(Math.sin(t * 6)) * 0.3 : Math.sin(t * 1.2) * 0.06);
                    break;
                }
                case 'puddletoad':
                case 'canetoad':
                case 'canopytreefrog':
                case 'bogtadpole': {
                    const slow = this.variant === 'canetoad' ? 0.6 : 1;
                    if (this.vocalSac && this.variant !== 'bogtadpole') this.vocalSac.scale.setScalar(1 + Math.abs(Math.sin(t * 2.2 * slow)) * 0.35);
                    // Only the toad hops: the others would lift their puddle or branch.
                    if (fast && this.variant === 'canetoad') this.model.position.y = this._baseY + Math.abs(Math.sin(t * 4)) * 0.12 * this.scale;
                    if (this.tongue && this.variant !== 'bogtadpole') { const out = fast && Math.sin(t * 6) > 0.3; this.tongue.visible = out; if (out) this.tongue.scale.z = 1 + Math.abs(Math.sin(t * 9)) * 1.5; }
                    if (this._eyes) this._eyes.forEach((e, i) => { if (e._lid) e._lid.rotation.x = -0.45 + Math.pow(Math.abs(Math.sin(t * 0.7 + i * 0.2)), 30) * 0.9; else e.rotation.y = Math.sin(t * 0.9 + i) * 0.3; });
                    if (this._drips) this._drips.forEach((d, i) => { d.scale.y = 1.8 + Math.abs(Math.sin(t * 0.8 + i)) * 0.8; });
                    if (this._tail) this._tail.forEach((j, i) => { j.rotation.y = Math.sin(t * (fast ? 9 : 4) - i * 0.8) * 0.3; });
                    if (this.variant === 'bogtadpole' && this.head) this.head.rotation.z = Math.sin(t * 1.4) * 0.05;
                    break;
                }
                case 'cindernewt': {
                    if (this._tail) this._tail.forEach((j, i) => { j.rotation.y = Math.sin(t * (fast ? 7 : 2.5) - i * 0.7) * 0.22; });
                    if (this._emberMat) this._emberMat.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 3.1)) * 0.6;
                    if (this.head) this.head.rotation.x = fast ? -Math.abs(Math.sin(t * 6)) * 0.35 : Math.sin(t * 1.3) * 0.05;
                    if (this.tongue) this.tongue.visible = fast && Math.sin(t * 6) > 0.4;
                    break;
                }
                case 'bottlecaphermit':
                case 'shorecrab':
                case 'ditchcrayfish':
                case 'coconutcrab': {
                    const sp = fast ? 9 : 3;
                    if (this._walkers) this._walkers.forEach(lg => { lg.rotation.x = Math.sin(t * sp + lg._i * 1.3 + (lg._side > 0 ? Math.PI : 0)) * 0.12; });
                    [this.clawL, this.clawR].forEach((c, i) => { if (c && c._finger) c._finger.rotation.x = -(fast ? Math.abs(Math.sin(t * 9 + i)) : Math.abs(Math.sin(t * 1.8 + i))) * 0.45; });
                    if (this.variant === 'shorecrab') {
                        this.model.position.x = baseX + Math.sin(t * 1.4) * 0.05 * this.scale; // sidle
                        [this.clawL, this.clawR].forEach((c, i) => { if (c) c.rotation.x = -(fast ? Math.abs(Math.sin(t * 7)) * 0.35 : Math.sin(t * 2 + i) * 0.08); });
                    }
                    if (this.variant === 'ditchcrayfish' && this._tail) this._tail.forEach(j => { j.rotation.x = j._rx - (fast ? Math.max(0, Math.sin(t * 8)) * 0.22 : 0); });
                    if (this.variant === 'coconutcrab' && this.clawL) this.clawL.rotation.x = fast ? -Math.abs(Math.sin(t * 5)) * 0.4 : Math.sin(t * 1.2) * 0.05;
                    if (this.antennae) this.antennae.rotation.y = Math.sin(t * 2.2) * 0.05;
                    break;
                }
                case 'mosssnail':
                case 'caveglowsnail':
                case 'geodesnail': {
                    if (this.foot) this.foot.scale.z = 2.3 + Math.sin(t * (fast ? 5 : 1.6)) * 0.12;
                    [this.t1, this.t2].forEach((s, i) => { if (s) s.rotation.z = (i ? -1 : 1) * 0.11 + Math.sin(t * 1.5 + i) * 0.2; });
                    if (this.garden) this.garden.rotation.z = Math.sin(t * 1.3) * 0.06;
                    if (this._glowMat) this._glowMat.emissiveIntensity = (this.variant === 'caveglowsnail' ? 0.45 : 0.3) + Math.sin(t * 1.7) * 0.2;
                    if (this.moths) this.moths.forEach(m => { const a = m._a + t * 1.6; m.position.set(Math.cos(a) * 0.42, 0.95 + Math.sin(t * 3 + m._a) * 0.08, -0.25 + Math.sin(a) * 0.42); m.rotation.y = -a; });
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.12 * this.scale;
            this.model.rotation.z = prog * 0.7;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new SmallFaunaBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = F_PROFILES;
    Object.keys(S).forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        boghatchling:   ["Bog Hatchling"],
        gardenfrog:     ["Garden Frog"],
        deathaxolotl:   ["Death Axolotl"],
        maggotslail:    ["Maggot Slail"],
        freelobster:    ["Free Lobster"],
        tidecrab:       ["Tide Crab"],
        desertscorpion: ["Desert Scorpion"],
        caveworm:       ["Bioluminescent Caveworm"],
        earthworm:      ["Earthworm"],
        lv_compostworm:         ["Compost Worm"],
        lv_dunewormling:        ["Dune Wormling"],
        lv_crystalglowworm:     ["Crystal Glowworm"],
        lv_puddletoad:          ["Puddle Toad"],
        lv_bogtadpole:          ["Bog Tadpole"],
        lv_canopytreefrog:      ["Canopy Tree Frog"],
        lv_canetoad:            ["Cane Toad"],
        lv_cindernewt:          ["Cinder Newt"],
        lv_bottlecaphermitcrab: ["Bottlecap Hermit Crab"],
        lv_shorecrab:           ["Shore Crab"],
        lv_ditchcrayfish:       ["Ditch Crayfish"],
        lv_coconutcrab:         ["Coconut Crab"],
        lv_mosssnail:           ["Moss Snail"],
        lv_caveglowsnail:       ["Cave Glowsnail"],
        lv_geodesnail:          ["Geode Snail"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Small fauna uniques registered');
})();
