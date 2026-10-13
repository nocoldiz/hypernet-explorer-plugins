//=============================================================================
// 3D Battler System - Unique Low-Tier (level 10-20 one-offs)
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke one-off models for distinctive level 10-20 enemies that
 * previously rode a shared rig. First batch toward the "unique model per monster"
 * goal. Each maps its enemy's <Archetype:> part keys so dismemberment works.
 * Requires 3DBattlerSystem; loads LAST so its name pins win.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Unique Low-Tier
 * ============================================================================
 *
 * One-off showpiece models assigned by exact name (registerNamed outranks the
 * Archetype meta). Parts follow each enemy's ARCHETYPE keys:
 *
 *   Haunting Scarecrow  (Humanoid)    HEAD, TORSO, LEFT/RIGHT_UPPER_ARM,
 *                                     LEFT/RIGHT_THIGH
 *   Pocket Watch Scarab (Insectoid)   HEAD, THORAX, ABDOMEN, MANDIBLES,
 *                                     LEFT_LEG, RIGHT_LEG
 *   Permafrost Beetle   (Insectoid)   (same insect keys)
 *   Wooden Flower       (Tree)        CROWN, TRUNK, ROOTS, BRANCH_1, BRANCH_2
 *   Bog Leech           (SegmentWorm) HEAD, HEART_SEGMENT, BODY_SEGMENT, TAIL
 *
 * Level 1-5 roster (bespoke): Frost Mite, Glitch Mite, Prism Beetle, Tomb
 * Scarab (Insectoid), Cactus Sprout (Plant), Data Leech (SegmentWorm),
 * Training Dummy and Little Scarecrow (Scarecrow keys).
 *
 * See docs/3d_unique_models_plan.md for the roadmap. MUST load AFTER
 * BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler UniqueLow] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const UL_PROFILES = {
        scarecrow:    { variant: 'scarecrow',    scale: 2.6, texturePool: 'fur',  bodyColor: 0xb89a5a, accent: 0x8ad0ff, hue: [0.11, 0.04], sat: [0.30, 0.10], lit: [0.55, 0.10] },
        clockscarab:  { variant: 'clockscarab',  scale: 2.0, texturePool: 'metal', bodyColor: 0xb8923a, accent: 0xff5a1a, hue: [0.10, 0.04], sat: [0.45, 0.10], lit: [0.45, 0.10] },
        frostbeetle:  { variant: 'frostbeetle',  scale: 2.0, texturePool: 'crystal', bodyColor: 0x5a8ab0, accent: 0xbfeaff, hue: [0.55, 0.06], sat: [0.35, 0.12], lit: [0.50, 0.12] },
        woodenflower: { variant: 'woodenflower', scale: 2.0, texturePool: 'wood', bodyColor: 0x6a5236, accent: 0xe85a8a, hue: [0.09, 0.04], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        bogleech:     { variant: 'bogleech',     scale: 2.3, texturePool: 'flesh', bodyColor: 0x3a7a74, accent: 0x1a979a, hue: [0.96, 0.05], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        u_porphyrinleech: { variant: 'bogleech', scale: 2.3, texturePool: 'flesh', bodyColor: 0x5a1a3a, accent: 0xc21a4a, hue: [0.92, 0.05], sat: [0.55, 0.12], lit: [0.34, 0.10] },
        // ── Level 1-5 roster (bespoke, were beetle / leech / flower / scarecrow reskins) ──
        lv_frostmite:       { variant: 'lv_frostmite',       scale: 1.6, texturePool: 'crystal', bodyColor: 0xc8e4f0, accent: 0x3a2a6a, hue: [0.55, 0.05], sat: [0.25, 0.10], lit: [0.78, 0.06] },
        lv_cactussprout:    { variant: 'lv_cactussprout',    scale: 1.7, texturePool: 'foliage', bodyColor: 0x4a8a3a, accent: 0xff5aa0, hue: [0.30, 0.05], sat: [0.45, 0.10], lit: [0.36, 0.08], front: true },
        lv_glitchmite:      { variant: 'lv_glitchmite',      scale: 1.6, texturePool: 'metal',   bodyColor: 0x2a2a3a, accent: 0x33ff66, hue: [0.70, 0.05], sat: [0.20, 0.08], lit: [0.25, 0.06] },
        lv_dataleech:       { variant: 'lv_dataleech',       scale: 2.0, texturePool: 'flesh',   bodyColor: 0x2a3a4a, accent: 0x3ae0ff, hue: [0.56, 0.05], sat: [0.35, 0.10], lit: [0.26, 0.06] },
        lv_prismbeetle:     { variant: 'lv_prismbeetle',     scale: 1.8, texturePool: 'crystal', bodyColor: 0xb8c8e8, accent: 0xffffff, hue: [0.62, 0.20], sat: [0.35, 0.10], lit: [0.70, 0.08] },
        lv_tombscarab:      { variant: 'lv_tombscarab',      scale: 1.8, texturePool: 'metal',   bodyColor: 0xc8962a, accent: 0x1a3a9a, hue: [0.11, 0.03], sat: [0.60, 0.10], lit: [0.46, 0.06] },
        lv_trainingdummy:   { variant: 'lv_trainingdummy',   scale: 2.3, texturePool: 'fur',     bodyColor: 0xb89a5a, accent: 0xc0281e, hue: [0.11, 0.03], sat: [0.40, 0.10], lit: [0.52, 0.08], front: true },
        lv_littlescarecrow: { variant: 'lv_littlescarecrow', scale: 1.9, texturePool: 'fur',     bodyColor: 0xc8a860, accent: 0x6a8ac0, hue: [0.12, 0.03], sat: [0.45, 0.10], lit: [0.55, 0.08], front: true },
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    class UniqueLowBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = UL_PROFILES[creatureType] || UL_PROFILES.scarecrow;
            super(scale, offsetY, battler, profile, 0, creatureType || 'scarecrow');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            if (this.variant === 'scarecrow') this.facingYaw = 0;
            if (profile.front) this.facingYaw = 0;
            this._legs = [];
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m); return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }
        _eye(parent, x, y, z, r, accent, glow) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, glow ? accent : 0));
            e.position.set(x, y, z); parent.add(e); return e;
        }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'clockscarab':  this._buildBeetle('clock'); break;
                case 'frostbeetle':  this._buildBeetle('frost'); break;
                case 'woodenflower': this._buildWoodenFlower(); break;
                case 'bogleech':     this._buildBogLeech(); break;
                case 'lv_frostmite':       this._buildFrostMite(); break;
                case 'lv_cactussprout':    this._buildCactusSprout(); break;
                case 'lv_glitchmite':      this._buildGlitchMite(); break;
                case 'lv_dataleech':       this._buildDataLeech(); break;
                case 'lv_prismbeetle':     this._buildPrismBeetle(); break;
                case 'lv_tombscarab':      this._buildTombScarab(); break;
                case 'lv_trainingdummy':   this._buildTrainingDummy(); break;
                case 'lv_littlescarecrow': this._buildLittleScarecrow(); break;
                default:             this._buildScarecrow(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Haunting Scarecrow (Humanoid keys) ───────────────────────────────
        _buildScarecrow() {
            const burlap = this._skinMat(0xb89a5a, 0.85);
            const wood = this._mat(0x5a4028, 1.0, 0.85);
            const straw = this._mat(0xd8b85a, 1.0, 0.9);
            const cloth = this._mat(0x3a2a18, 1.0, 0.85);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 7), wood); post.position.set(0, 1.25, -0.16); this.bodyGroup.add(post);
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 7), wood); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.95, -0.16); this.bodyGroup.add(bar);

            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.95, 9), burlap); this.torso.position.set(0, 1.5, 0); this.bodyGroup.add(this.torso);
            for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const s = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 4), straw); s.position.set(Math.cos(a) * 0.28, 1.08, Math.sin(a) * 0.2); s.rotation.x = Math.PI; this.torso.add(s); }

            this.head = new THREE.Group();
            const sack = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), burlap); sack.scale.set(1, 1.12, 1); this.head.add(sack);
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), cloth); brim.position.y = 0.2; this.head.add(brim);
            const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 8), cloth); hat.position.y = 0.4; this.head.add(hat);
            const xEye = (x) => { const a = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.02), this._mat(0x140d08, 1.0, 0.6)); a.position.set(x, 0.05, 0.26); a.rotation.z = 0.7; this.head.add(a); const b = a.clone(); b.rotation.z = -0.7; this.head.add(b); };
            xEye(-0.11); xEye(0.11);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.02), this._mat(0x140d08, 1.0, 0.6)); mouth.position.set(0, -0.11, 0.26); this.head.add(mouth);
            this.head.position.set(0, 2.32, 0); this.bodyGroup.add(this.head);

            this.larm = this._ragLimb(burlap, straw, -0.62, 1.92, 0.5, true);
            this.rarm = this._ragLimb(burlap, straw, 0.62, 1.92, 0.5, true);
            this.lleg = this._ragLimb(burlap, straw, -0.13, 1.0, 0.85, false);
            this.rleg = this._ragLimb(burlap, straw, 0.13, 1.0, 0.85, false);

            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['HEAD', 'SKULL', 'FACE', 'BRAIN'], this.head);
            set(['TORSO', 'BODY', 'CORE', 'SPINE', 'RIBCAGE'], this.torso);
            set(['LEFT_UPPER_ARM', 'LEFT_ARM', 'LEFT_HAND'], this.larm);
            set(['RIGHT_UPPER_ARM', 'RIGHT_ARM', 'RIGHT_HAND'], this.rarm);
            set(['LEFT_THIGH', 'LEFT_LEG'], this.lleg);
            set(['RIGHT_THIGH', 'RIGHT_LEG'], this.rleg);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'SPINE', 'RIBCAGE'], hide: [this.torso, this.head, this.larm, this.rarm, this.lleg, this.rleg] },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [this.head] },
                { gone: ['LEFT_UPPER_ARM', 'LEFT_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_UPPER_ARM', 'RIGHT_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_THIGH', 'LEFT_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_THIGH', 'RIGHT_LEG'], hide: [this.rleg] },
            ];
        }
        _ragLimb(cloth, straw, x, y, len, isArm) {
            const g = new THREE.Group();
            const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, len, 7), cloth); limb.position.y = -len / 2; g.add(limb);
            const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), straw); tuft.position.y = -len - 0.04; tuft.rotation.x = Math.PI; g.add(tuft);
            g.position.set(x, y, isArm ? -0.05 : 0); if (isArm) g.rotation.z = x < 0 ? 0.25 : -0.25;
            this.bodyGroup.add(g); return g;
        }

        // ── Beetles (Insectoid keys): clockwork scarab / frost beetle ────────
        _buildBeetle(kind) {
            const p = this.profile;
            const isFrost = kind === 'frost';
            const shellMat = this._skinMat(p.bodyColor, isFrost ? 0.25 : 0.4);
            const dark = this._mat(isFrost ? 0x2a4a6a : 0x3a2e1a, 1.0, 0.5);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), shellMat); this.thorax.position.set(0, 0.92, 0.22); this.bodyGroup.add(this.thorax);

            this.abdomen = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), shellMat); dome.scale.set(1, 0.85, 1.2); this.abdomen.add(dome);
            if (isFrost) {
                this._iceMat = this._mat(p.accent, 0.75, 0.15, p.accent); this._iceMat.emissiveIntensity = 0.35;
                for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), this._iceMat); const a = this.idRand() * 6.28, r = this.idRand() * 0.3; c.position.set(Math.cos(a) * r, 0.18 + this.idRand() * 0.2, Math.sin(a) * r - 0.1); c.rotation.set(this.idRand() * 0.6 - 0.3, 0, this.idRand() * 0.6 - 0.3); this.abdomen.add(c); }
            } else {
                const face = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), this._mat(0xf0e8d0, 1.0, 0.4)); face.position.y = 0.33; this.abdomen.add(face);
                for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; const tick = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.06), dark); tick.position.set(Math.cos(a) * 0.28, 0.355, Math.sin(a) * 0.28); this.abdomen.add(tick); }
                this.hourHand = new THREE.Group(); const hh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.18), dark); hh.position.z = 0.09; this.hourHand.add(hh); this.hourHand.position.y = 0.37; this.abdomen.add(this.hourHand);
                this.minHand = new THREE.Group(); const mh = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 0.26), dark); mh.position.z = 0.13; this.minHand.add(mh); this.minHand.position.y = 0.38; this.abdomen.add(this.minHand);
            }
            this.abdomen.position.set(0, 0.92, -0.38); this.bodyGroup.add(this.abdomen);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), shellMat));
            this._eye(this.head, -0.09, 0.05, 0.15, 0.05, p.accent, true);
            this._eye(this.head, 0.09, 0.05, 0.15, 0.05, p.accent, true);
            this.mandibles = new THREE.Group();
            for (const mx of [-0.08, 0.08]) { const md = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 5), dark); md.position.set(mx, -0.06, 0.2); md.rotation.x = 1.4; md.rotation.z = mx > 0 ? -0.3 : 0.3; this.mandibles.add(md); }
            this.head.add(this.mandibles);
            this.head.position.set(0, 0.9, 0.52); this.bodyGroup.add(this.head);

            this.legsL = new THREE.Group(); this.legsR = new THREE.Group();
            for (let i = 0; i < 3; i++) { this.legsL.add(this._beetleLeg(dark, -1, i)); this.legsR.add(this._beetleLeg(dark, 1, i)); }
            this.bodyGroup.add(this.legsL, this.legsR);

            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['HEAD', 'SKULL', 'FACE'], this.head);
            set(['THORAX', 'BODY', 'CORE', 'CEPHALOTHORAX'], this.thorax);
            set(['ABDOMEN', 'TAIL'], this.abdomen);
            set(['MANDIBLES', 'PINCER_LEFT', 'PINCER_RIGHT'], this.mandibles);
            set(['LEFT_LEG'], this.legsL);
            set(['RIGHT_LEG'], this.legsR);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['THORAX', 'BODY', 'CORE', 'CEPHALOTHORAX'], hide: [this.thorax, this.abdomen, this.head, this.mandibles, this.legsL, this.legsR] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['LEFT_LEG'], hide: [this.legsL] },
                { gone: ['RIGHT_LEG'], hide: [this.legsR] },
            ];
        }
        _beetleLeg(mat, side, i) {
            const g = new THREE.Group();
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.4, 5), mat); seg.rotation.z = side * 1.1; seg.position.set(side * 0.18, -0.05, 0); g.add(seg);
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.3, 5), mat); foot.rotation.z = side * 0.4; foot.position.set(side * 0.34, -0.28, 0); g.add(foot);
            g.position.set(side * 0.22, 0.9, 0.3 - i * 0.3); g._side = side; return g;
        }

        // ── Wooden Flower (Tree keys) ────────────────────────────────────────
        _buildWoodenFlower() {
            const bark = this._skinMat(0x6a5236, 0.85);
            const leaf = this._mat(0x4f9d3a, 1.0, 0.7);
            const petalMat = this._mat(this.profile.accent, 1.0, 0.6);
            this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.05, 8), bark); this.stem.position.set(0, 0.9, 0); this.bodyGroup.add(this.stem);
            for (const ly of [0.75, 1.05]) for (const lx of [-1, 1]) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), leaf); lf.scale.set(1.5, 0.3, 0.7); lf.position.set(lx * 0.2, ly, 0); lf.rotation.z = lx * 0.5; this.stem.add(lf); }

            this.crown = new THREE.Group();
            this.crown.add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(0xf0d040, 1.0, 0.5)));
            for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const petal = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), petalMat); petal.scale.set(0.55, 0.22, 1.0); petal.position.set(Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27); petal.lookAt(0, 0, 0); this.crown.add(petal); }
            this._eye(this.crown, -0.07, 0.04, 0.17, 0.04, 0x111111, false);
            this._eye(this.crown, 0.07, 0.04, 0.17, 0.04, 0x111111, false);
            this.crown.position.set(0, 1.6, 0); this.crown.rotation.x = -0.35; this.bodyGroup.add(this.crown);

            this.branch1 = this._tendril(bark, -1); this.branch2 = this._tendril(bark, 1);
            this.roots = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; const r = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 5), bark); r.position.set(Math.cos(a) * 0.18, 0.26, Math.sin(a) * 0.18); r.rotation.set(Math.PI - 0.35, 0, a); this.roots.add(r); }
            this.bodyGroup.add(this.roots);

            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['CROWN', 'CANOPY', 'FLOWER', 'HEAD', 'CAP'], this.crown);
            set(['TRUNK', 'STEM', 'BODY', 'CORE'], this.stem);
            set(['ROOTS', 'FOOT', 'FEET'], this.roots);
            set(['BRANCH_1', 'VINE_1', 'LEFT_ARM'], this.branch1);
            set(['BRANCH_2', 'VINE_2', 'RIGHT_ARM'], this.branch2);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['TRUNK', 'STEM', 'BODY', 'CORE'], hide: [this.stem, this.crown, this.branch1, this.branch2] },
                { gone: ['CROWN', 'CANOPY', 'FLOWER', 'HEAD'], hide: [this.crown] },
                { gone: ['BRANCH_1', 'VINE_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2', 'VINE_2'], hide: [this.branch2] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
        }
        _tendril(mat, side) {
            const g = new THREE.Group();
            let y = 0, z = 0, r = 0.05;
            for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.24, 6), mat); s.position.set(0, y, z); s.rotation.x = 0.3; g.add(s); const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), mat); thorn.position.set(0, y, z + r + 0.04); thorn.rotation.x = Math.PI / 2; g.add(thorn); y -= 0.2; z += 0.08; r *= 0.85; }
            g.position.set(side * 0.18, 1.25, 0); g.rotation.z = side * 0.7; g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Bog Leech (SegmentWorm keys) ─────────────────────────────────────
        _buildBogLeech() {
            const flesh = this._skinMat(this.profile.bodyColor, 0.5);
            const blood = this._mat(this.profile.accent, 1.0, 0.4, 0x5a0a14); blood.emissiveIntensity = 0.35;
            this.head = new THREE.Group();
            const sucker = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.2, 12), flesh); sucker.rotation.x = Math.PI / 2; this.head.add(sucker);
            const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), this._mat(0x2a0a10, 1.0, 0.6)); maw.rotation.x = Math.PI / 2; maw.position.z = 0.1; this.head.add(maw);
            for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), this._mat(0xf0e0d0, 1.0, 0.4)); tooth.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.12); tooth.rotation.x = -Math.PI / 2; this.head.add(tooth); }
            this.head.position.set(0, 1.05, 0.72); this.bodyGroup.add(this.head);

            this.bodySeg = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), flesh); this.bodySeg.position.set(0, 1.0, 0.35); this.bodySeg.scale.set(1, 1, 1.2); this.bodyGroup.add(this.bodySeg);
            this.heartSeg = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12), blood); this.heartSeg.position.set(0, 0.98, -0.05); this.bodyGroup.add(this.heartSeg);
            this.seg3 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), flesh); this.seg3.position.set(0, 1.0, -0.46); this.bodyGroup.add(this.seg3);
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), flesh); this.tail.position.set(0, 1.0, -0.78); this.bodyGroup.add(this.tail);

            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heartSeg, BODY_SEGMENT: this.bodySeg, TAIL: this.tail, CORE: this.heartSeg };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'CORE', 'BODY'], hide: [this.heartSeg, this.head, this.bodySeg, this.seg3, this.tail] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
            this._leechSegs = [this.head, this.bodySeg, this.heartSeg, this.seg3, this.tail];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');

            switch (this.variant) {
                case 'scarecrow': {
                    const sway = Math.sin(t * 1.3) * 0.05;
                    this.model.rotation.z = sway;
                    this.model.position.y = this._baseY + Math.sin(t * 1.1) * 0.02 * this.scale;
                    const flail = fast ? Math.sin(t * 9) * 0.6 : Math.sin(t * 1.6) * 0.18;
                    if (this.larm) this.larm.rotation.x = flail;
                    if (this.rarm) this.rarm.rotation.x = -flail;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.7) * 0.08;
                    break;
                }
                case 'clockscarab':
                case 'frostbeetle': {
                    const scut = fast ? 9 : 3;
                    if (this.legsL) this.legsL.rotation.z = Math.sin(t * scut) * 0.18;
                    if (this.legsR) this.legsR.rotation.z = -Math.sin(t * scut) * 0.18;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * scut)) * 0.02 * this.scale;
                    if (this.mandibles) this.mandibles.rotation.x = fast ? Math.abs(Math.sin(t * 10)) * 0.4 : 0;
                    if (this.hourHand) this.hourHand.rotation.y = -t * 0.25;
                    if (this.minHand) this.minHand.rotation.y = -t * (fast ? 6 : 2.5); // steals seconds
                    if (this._iceMat) this._iceMat.emissiveIntensity = 0.3 + Math.sin(t * 4) * 0.25;
                    break;
                }
                case 'woodenflower': {
                    this.model.rotation.z = Math.sin(t * 1.2) * 0.05;
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.03 * this.scale;
                    if (this.crown) this.crown.rotation.y = Math.sin(t * 0.8) * 0.3;
                    const whip = fast ? Math.sin(t * 10) * 0.5 : Math.sin(t * 1.8) * 0.15;
                    if (this.branch1) this.branch1.rotation.x = whip;
                    if (this.branch2) this.branch2.rotation.x = -whip;
                    break;
                }
                case 'lv_frostmite':
                case 'lv_glitchmite':
                case 'lv_prismbeetle':
                case 'lv_tombscarab': {
                    // Scuttle: each leg swings on its hip in its own phase.
                    const f = fast ? 10 : 3.2, amp = fast ? 0.32 : 0.16;
                    this._legs.forEach(g => { if (g.visible) g.rotation.y = Math.sin(t * f + g._phase) * amp * g._side; });
                    if (this.mandibles) this.mandibles.rotation.x = fast ? Math.abs(Math.sin(t * 12)) * 0.35 : 0;
                    if (this.variant === 'lv_glitchmite') {
                        // Stutter: snap to a jittered pose on a hard step, never smooth.
                        const step = Math.floor(t * 8);
                        const j = (k) => { const x = Math.sin(step * 12.9898 + k * 78.233) * 43758.5; return (x - Math.floor(x)) - 0.5; };
                        this.model.position.y = this._baseY + (j(1) > 0.3 ? 0.02 * this.scale : 0);
                        if (this._ghosts) { this._ghosts.children[0].position.x = -0.12 + j(2) * 0.08; this._ghosts.children[1].position.x = 0.12 + j(3) * 0.08; this._ghosts.visible = j(4) > -0.3; }
                    } else {
                        this.model.position.y = this._baseY + Math.abs(Math.sin(t * f)) * 0.01 * this.scale;
                    }
                    if (this.variant === 'lv_prismbeetle' && this._fan) { this._fan.rotation.y = Math.sin(t * 1.3) * 0.25; this._fan.scale.z = fast ? 1.3 + Math.sin(t * 14) * 0.3 : 1; }
                    if (this.variant === 'lv_tombscarab' && this._sun) this._sun.rotation.y = t * 0.6;
                    break;
                }
                case 'lv_dataleech': {
                    // A travelling wave along the body; packets pulse in the heart.
                    const speed = fast ? 7 : 2.5;
                    if (this._dlSegs) this._dlSegs.forEach(s => { s.position.x = s._bx + Math.sin(t * speed - s._i * 0.7) * 0.04; s.position.y = 0.16 + Math.max(0, Math.sin(t * speed - s._i * 0.7)) * 0.02; });
                    if (this._packets) this._packets.position.x = Math.sin(t * 3) * 0.04;
                    if (this._bufferArc) this._bufferArc.rotation.z = -t * 4;
                    if (this.maw) this.maw.position.y = 0.15 + (fast ? Math.abs(Math.sin(t * 10)) * 0.05 : 0);
                    break;
                }
                case 'lv_cactussprout': {
                    this.model.rotation.z = Math.sin(t * 1.4) * 0.03;
                    const jab = fast ? Math.sin(t * 9) * 0.6 : Math.sin(t * 1.6) * 0.1;
                    if (this.vine1) this.vine1.rotation.z = jab;
                    if (this.vine2) this.vine2.rotation.z = -jab;
                    if (this.flower) this.flower.rotation.y = t * 0.4;
                    break;
                }
                case 'lv_trainingdummy': {
                    // Rocks on its stand; the swivel arms spin round to hit back.
                    this.model.rotation.z = Math.sin(t * 1.3) * 0.04;
                    const spin = fast ? Math.sin(t * 8) * 0.9 : Math.sin(t * 1.1) * 0.12;
                    if (this.larm) this.larm.rotation.y = spin;
                    if (this.rarm) this.rarm.rotation.y = spin;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.7) * 0.06;
                    break;
                }
                case 'lv_littlescarecrow': {
                    this.model.rotation.z = Math.sin(t * 1.2) * 0.04;
                    const flap = fast ? Math.sin(t * 10) * 0.7 : Math.sin(t * 2.1) * 0.22;
                    if (this.larm) this.larm.rotation.z = -flap;
                    if (this.rarm) this.rarm.rotation.z = flap;
                    if (this.head) this.head.rotation.z = -0.18 + Math.sin(t * 1.5) * 0.06;
                    if (this._crow) this._crow.rotation.x = Math.max(0, Math.sin(t * 2.7)) * 0.3;
                    break;
                }
                case 'bogleech': {
                    const speed = fast ? 6 : 3;
                    if (this._leechSegs) this._leechSegs.forEach((s, i) => { if (s && s.visible) s.position.y = (this._segBaseY(s, i)) + Math.sin(t * speed - i * 0.8) * 0.06; });
                    if (this.heartSeg) { const pl = 1.0 + Math.sin(t * (fast ? 7 : 3)) * 0.12; this.heartSeg.scale.setScalar(pl); if (this.heartSeg.material) this.heartSeg.material.emissiveIntensity = 0.35 + Math.sin(t * 5) * 0.25; }
                    if (this.head) this.head.rotation.z = Math.sin(t * 2) * 0.12;
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.03 * this.scale;
                    break;
                }
            }
        }
        _segBaseY() { return 1.0; }

        // ── Level 1-5 roster: shared helpers ─────────────────────────────────
        _strut(parent, mat, a, b, r0, r1, seg) { return this.addStrut(parent, mat, a, b, r0, r1, seg || 5); }
        // One jointed insect leg as a group pivoting at its hip: thigh out and
        // up to the knee, shin down to a foot on the ground. `hipY` is the hip
        // height above the floor, so the foot always lands at y 0.
        _insectLeg(mat, side, x, hipY, z, reach, dz, r) {
            const g = new THREE.Group(); g.position.set(side * x, hipY, z); this.bodyGroup.add(g);
            const knee = V(side * reach * 0.55, 0.1, dz * 0.5), foot = V(side * reach, -hipY, dz);
            this._strut(g, mat, V(0, 0, 0), knee, r, r * 0.85, 4);
            this._strut(g, mat, knee, foot, r * 0.85, r * 0.45, 4);
            g._side = side; g._phase = this._legs.length * 1.7; this._legs.push(g);
            return g;
        }
        // Insectoid keys. legs = { L: [front, middle, rear], R: [...] }; an
        // entry may be an array (a mite's fourth pair rides with the rear key).
        _wireInsect(o) {
            const grp = (x) => Array.isArray(x) ? x : [x];
            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['HEAD', 'SKULL', 'FACE'], o.head);
            set(['THORAX', 'BODY', 'CORE', 'CEPHALOTHORAX'], o.thorax);
            set(['ABDOMEN', 'TAIL'], o.abdomen);
            set(['MANDIBLES', 'PINCER_LEFT', 'PINCER_RIGHT', 'MAW', 'JAWS'], o.mandibles);
            const keys = [['LEFT_LEG', 'RIGHT_LEG'], ['MIDDLE_LEFT_LEG', 'MIDDLE_RIGHT_LEG'], ['REAR_LEFT_LEG', 'REAR_RIGHT_LEG']];
            const rules = [];
            keys.forEach(([lk, rk], i) => {
                const l = grp(o.legs.L[i]), r = grp(o.legs.R[i]);
                m[lk] = l[0]; m[rk] = r[0];
                rules.push({ gone: [lk], hide: l }, { gone: [rk], hide: r });
            });
            const allLegs = [].concat(...o.legs.L.map(grp), ...o.legs.R.map(grp));
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['THORAX', 'BODY', 'CORE', 'CEPHALOTHORAX'], hide: [o.thorax, o.abdomen, o.head, o.mandibles, ...allLegs, ...(o.extra || [])].filter(Boolean) },
                { gone: ['ABDOMEN', 'TAIL'], hide: [o.abdomen].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [o.head, o.mandibles].filter(Boolean) },
                { gone: ['MANDIBLES'], hide: [o.mandibles].filter(Boolean) },
                ...rules
            ];
        }

        // ── Frost Mite: a glassy eight-legged ice mite, its gut showing ──────
        _buildFrostMite() {
            const p = this.profile;
            const glass = this._skinMat(p.bodyColor, 0.15); glass.opacity = 0.62;
            const legMat = this._mat(0xa8c8dc, 1, 0.3);
            this.thorax = new THREE.Group(); this.thorax.position.set(0, 0.36, 0); this.bodyGroup.add(this.thorax);
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), glass); body.scale.set(1, 0.75, 1.15); this.thorax.add(body);
            // The odd detail: a dark, coiled gut visible through the ice.
            const gut = new THREE.Mesh(new THREE.TorusKnotGeometry(0.08, 0.035, 24, 5), this._mat(p.accent, 1, 0.6, 0x14082a)); gut.position.y = -0.02; this.thorax.add(gut);
            // A frozen sprig of moss stuck to its back, rimed with a crystal.
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; this._strut(this.thorax, this._mat(0x4a7a3a, 1, 0.8), V(0, 0.2, -0.05), V(Math.cos(a) * 0.09, 0.32, -0.05 + Math.sin(a) * 0.09), 0.018, 0.008, 3); }
            const rime = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this._mat(0xeaffff, 0.9, 0.1, 0x88ccee)); rime.position.set(0.03, 0.3, -0.04); this.thorax.add(rime);
            this.abdomen = body;
            // HEAD: the small mouth-cone with two dot eyes; MANDIBLES: chelicerae + palps.
            this.head = new THREE.Group(); this.head.position.set(0, 0.34, 0.32); this.bodyGroup.add(this.head);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), glass));
            for (const s of [-1, 1]) this._eye(this.head, s * 0.045, 0.05, 0.06, 0.018, 0x111111, false);
            this.mandibles = new THREE.Group(); this.mandibles.position.set(0, 0.32, 0.38); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) {
                this._strut(this.mandibles, legMat, V(s * 0.025, 0, 0), V(s * 0.03, -0.06, 0.08), 0.02, 0.008, 3);
                this._strut(this.mandibles, legMat, V(s * 0.05, 0.01, -0.02), V(s * 0.1, -0.03, 0.07), 0.012, 0.006, 3);
            }
            // Eight short legs, each with a frost bristle at the knee.
            const L = [], R = [];
            for (let i = 0; i < 4; i++) {
                const z = 0.2 - i * 0.14, dz = (0.12 - i * 0.08);
                L.push(this._insectLeg(legMat, -1, 0.2, 0.3, z, 0.3, dz, 0.025));
                R.push(this._insectLeg(legMat, 1, 0.2, 0.3, z, 0.3, dz, 0.025));
            }
            [...L, ...R].forEach(g => { const b = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.06, 3), this._mat(0xeaffff, 1, 0.1)); b.position.set(g._side * 0.165, 0.13, 0); g.add(b); });
            this._wireInsect({ head: this.head, thorax: this.thorax, abdomen: this.abdomen, mandibles: this.mandibles, legs: { L: [L[0], L[1], [L[2], L[3]]], R: [R[0], R[1], [R[2], R[3]]] } });
        }

        // ── Cactus Sprout (Plant keys): a squat barrel cactus in a cracked pot ─
        _buildCactusSprout() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.6);
            const spine = this._mat(0xf4ecc8, 1, 0.4);
            const clay = this._mat(0xb8582e, 1, 0.9);
            // ROOTS: the terracotta pot, split down one side with roots poking out.
            this.roots = new THREE.Group(); this.bodyGroup.add(this.roots);
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.36, 8), clay); pot.position.y = 0.18; this.roots.add(pot);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 4, 8), clay); rim.rotation.x = Math.PI / 2; rim.position.y = 0.36; this.roots.add(rim);
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.04), this._mat(0x2a140a, 1, 1)); crack.position.set(0.18, 0.18, 0.24); crack.rotation.set(0, -0.6, 0.25); this.roots.add(crack);
            for (const [y, a] of [[0.1, 0.6], [0.2, 0.75], [0.26, 0.5]]) this._strut(this.roots, this._mat(0xd8c8a0, 1, 0.9), V(Math.sin(a) * 0.24, y, Math.cos(a) * 0.24), V(Math.sin(a) * 0.4, y - 0.08, Math.cos(a) * 0.4), 0.018, 0.006, 3);
            // STEM: the ribbed barrel with spine tufts and a cross face.
            this.stem = new THREE.Group(); this.stem.position.y = 0.36; this.bodyGroup.add(this.stem);
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.5, 8), green); core.position.y = 0.25; this.stem.add(core);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), green); dome.position.y = 0.5; this.stem.add(dome);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + Math.PI / 8, rib = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.42, 2, 4), green);
                rib.position.set(Math.cos(a) * 0.25, 0.27, Math.sin(a) * 0.25); this.stem.add(rib);
                if (Math.sin(a) > 0.6) continue;                            // the face stays clear
                for (const y of [0.12, 0.32]) for (const t of [-0.5, 0, 0.5]) {
                    const s = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.1, 3), spine);
                    s.position.set(Math.cos(a) * 0.33, y, Math.sin(a) * 0.33); s.quaternion.setFromUnitVectors(V(0, 1, 0), V(Math.cos(a + t), 0.3, Math.sin(a + t)).normalize()); this.stem.add(s);
                }
            }
            for (const s of [-1, 1]) {
                this._eye(this.stem, s * 0.085, 0.36, 0.3, 0.035, 0x111111, false);
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), this._mat(0x1e3a14, 1, 0.6)); brow.position.set(s * 0.085, 0.41, 0.3); brow.rotation.z = -s * 0.4; this.stem.add(brow);
            }
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 3, 8, Math.PI), this._mat(0x1e3a14, 1, 0.6)); mouth.position.set(0, 0.24, 0.31); this.stem.add(mouth);
            // A mohawk of long spines over the top, and the flower among them (FLOWER).
            for (let i = 0; i < 7; i++) this._strut(this.stem, spine, V(0, 0.68, -0.15 + i * 0.05), V(0, 0.86 - Math.abs(i - 3) * 0.03, -0.18 + i * 0.06), 0.012, 0.003, 3);
            this.flower = new THREE.Group(); this.flower.position.set(0.1, 0.72, 0.06); this.stem.add(this.flower);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2, pt = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 3), this._mat(p.accent, 1, 0.5)); pt.position.set(Math.cos(a) * 0.05, 0.04, Math.sin(a) * 0.05); pt.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); this.flower.add(pt); }
            this.flower.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), this._mat(0xffd84a, 1, 0.5)));
            // VINE_1/2: prickly-pear paddles growing off the barrel like mitts.
            const pad = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.27, 0.62, 0.02); this.bodyGroup.add(g);
                const paddle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), green); paddle.scale.set(0.9, 1.3, 0.35); paddle.position.set(side * 0.1, 0.12, 0); paddle.rotation.z = -side * 0.5; g.add(paddle);
                for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.08, 3), spine); s.position.set(side * (0.08 + k * 0.04), 0.06 + k * 0.06, 0.05); s.rotation.x = Math.PI / 2; g.add(s); }
                g._side = side; return g;
            };
            this.vine1 = pad(-1); this.vine2 = pad(1);
            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['FLOWER', 'HEAD', 'CROWN'], this.flower); set(['STEM', 'BODY', 'CORE', 'TRUNK'], this.stem);
            set(['ROOTS', 'FOOT', 'FEET'], this.roots); set(['VINE_1', 'LEFT_ARM'], this.vine1); set(['VINE_2', 'RIGHT_ARM'], this.vine2); set(['MAW', 'MOUTH'], mouth);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['STEM', 'BODY', 'CORE'], hide: [this.stem, this.flower, this.vine1, this.vine2] },
                { gone: ['FLOWER'], hide: [this.flower] },
                { gone: ['VINE_1'], hide: [this.vine1] },
                { gone: ['VINE_2'], hide: [this.vine2] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
        }

        // ── Glitch Mite: a half-rendered bug made of pixels ─────────────────
        // Built from cubes on a voxel grid (so neighbours share faces), one
        // slice shoved sideways, the back half drawn as bare wireframe and a
        // red and a cyan ghost copy drifting off it.
        _buildGlitchMite() {
            const p = this.profile;
            const vox = this._skinMat(p.bodyColor, 0.5);
            const glow = this._mat(p.accent, 1, 0.3, p.accent);
            const wire = this._mat(p.accent, 1, 0.3, p.accent); wire.wireframe = true;
            const U = 0.1;
            const cubes = (parent, mat, list) => list.forEach(([x, y, z]) => { const c = new THREE.Mesh(new THREE.BoxGeometry(U, U, U), mat); c.position.set(x * U, y * U, z * U); parent.add(c); });
            this.thorax = new THREE.Group(); this.thorax.position.set(0, 0.3, 0); this.bodyGroup.add(this.thorax);
            const th = [];
            for (let x = -1; x <= 1; x++) for (let y = 0; y <= 1; y++) for (let z = 0; z <= 1; z++) if (!(x === 1 && y === 1 && z === 1)) th.push([x, y, z]);
            cubes(this.thorax, vox, th);
            const slice = new THREE.Group(); slice.position.x = 0.05; this.thorax.add(slice);   // the shoved slice
            cubes(slice, vox, [[-1, 0, 2], [0, 0, 2], [1, 0, 2], [0, 1, 2]]);
            this.abdomen = new THREE.Group(); this.abdomen.position.set(0, 0.3, 0); this.bodyGroup.add(this.abdomen);
            cubes(this.abdomen, vox, [[-1, 0, -1], [0, 0, -1], [1, 0, -1], [0, 1, -1], [-1, 1, -1], [0, 0, -2], [1, 0, -2], [0, 1, -2]]);
            cubes(this.abdomen, wire, [[-1, 0, -2], [0, 0, -3], [0, 1, -3], [1, 0, -3]]);
            this.head = new THREE.Group(); this.head.position.set(0, 0.35, 0.3); this.bodyGroup.add(this.head);
            cubes(this.head, vox, [[0, 0, 0], [-1, 0, 0], [0, 1, 0], [-1, 1, 0]]);
            this.head.position.x = 0.05;
            for (const x of [-1, 0]) { const e = new THREE.Mesh(new THREE.BoxGeometry(U * 0.5, U * 0.5, U * 0.3), glow); e.position.set(x * U, U * 1.1, U * 0.55); this.head.add(e); }
            this.mandibles = new THREE.Group(); this.mandibles.position.set(0.0, 0.33, 0.4); this.bodyGroup.add(this.mandibles);
            cubes(this.mandibles, glow, [[-1, 0, 0], [0, 0, 0]]);
            cubes(this.mandibles, glow, [[-1, 0, 1], [0, 0, 1]].map(([x, y, z]) => [x * 1.3, y, z]));
            // Pixel legs: stair-stepped cube chains down to the floor.
            const L = [], R = [];
            for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
                const g = new THREE.Group(); g.position.set(side * 0.05, 0.3, 0.1 - i * 0.12); this.bodyGroup.add(g);
                cubes(g, vox, [[side * 1, 0, 0], [side * 2, -1, 0], [side * 2, -2, 0]]);
                const tip = new THREE.Mesh(new THREE.BoxGeometry(U, U * 0.5, U), glow); tip.position.set(side * 2 * U, -2.75 * U, 0); g.add(tip);
                g._side = side; g._phase = this._legs.length * 1.7; this._legs.push(g);
                (side < 0 ? L : R).push(g);
            }
            // RGB ghost copies of the head and thorax, slid off to either side.
            this._ghosts = new THREE.Group(); this._ghosts.userData.float = true; this.bodyGroup.add(this._ghosts);
            [[0xff2040, -0.12], [0x20e0ff, 0.12]].forEach(([c, dx]) => {
                const ghost = new THREE.Group(); ghost.position.set(dx, 0.3, 0); this._ghosts.add(ghost);
                cubes(ghost, this._mat(c, 0.28, 0.3, c), th.filter((_, k) => k % 2 === 0));
            });
            this._wireInsect({ head: this.head, thorax: this.thorax, abdomen: this.abdomen, mandibles: this.mandibles, legs: { L, R }, extra: [this._ghosts] });
        }

        // ── Data Leech (SegmentWorm keys): a ribbed leech that drinks cables ─
        _buildDataLeech() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            const glow = this._mat(p.accent, 1, 0.3, p.accent);
            const gold = this._mat(0xd8b040, 1, 0.3, 0x2a1a00);
            // An S-curve of flattened overlapping segments lying on the floor,
            // each seam banded with a glowing rib.
            const path = []; for (let i = 0; i < 9; i++) { const u = i / 8; path.push(V(Math.sin(u * Math.PI * 1.6) * 0.16, 0.16, 0.62 - u * 1.3)); }
            this._dlSegs = [];
            const seg = (i, r, mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 5), mat); m.position.copy(path[i]); m.scale.set(1.1, 0.62, 1.15); m._bx = path[i].x; m._i = i; this.bodyGroup.add(m); this._dlSegs.push(m); return m; };
            this.bodySeg = new THREE.Group(); this.bodyGroup.add(this.bodySeg);
            const radii = [0.17, 0.19, 0.2, 0.21, 0.22, 0.21, 0.19, 0.16, 0.12];
            const segs = radii.map((r, i) => seg(i, r, skin));
            this.heartSeg = segs[4];
            this.heartSeg.material = this._mat(p.bodyColor, 0.55, 0.3, 0x0a2a3a);
            const packets = new THREE.Group(); this.heartSeg.add(packets); this._packets = packets;
            for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), glow); b.position.set((k - 1.5) * 0.09, 0, 0); packets.add(b); }
            for (let i = 0; i < 8; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(radii[i] * 0.95, 0.02, 3, 10), glow); ring.position.copy(path[i]).lerp(path[i + 1], 0.5); ring.scale.set(1.1, 0.62, 1); ring.lookAt(path[i + 1].x, ring.position.y, path[i + 1].z); this.bodySeg.add(ring); }
            // HEAD: the front segment with a row of eyespots; MAW: a plug sucker.
            this.head = new THREE.Group(); this.head.position.copy(path[0]); this.bodyGroup.add(this.head);
            for (let k = 0; k < 5; k++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), this._mat(0x111111, 1, 0.2)); e.position.set((k - 2) * 0.04, 0.1, 0.06 - Math.abs(k - 2) * 0.02); this.head.add(e); }
            this.maw = new THREE.Group(); this.maw.position.set(path[0].x, 0.15, path[0].z + 0.17); this.bodyGroup.add(this.maw);
            const plug = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.12), this._mat(0x1a1e24, 1, 0.4)); this.maw.add(plug);
            for (let k = 0; k < 4; k++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.06), gold); pin.position.set((k - 1.5) * 0.04, 0, 0.08); this.maw.add(pin); }
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 3, 8), skin); lip.position.z = 0.02; lip.scale.y = 0.6; this.maw.add(lip);
            // TAIL: trailing off into a cable that ends in a jack.
            this.tail = new THREE.Group(); this.bodyGroup.add(this.tail);
            const end = path[8], c = new THREE.CatmullRomCurve3([end.clone(), V(end.x - 0.1, 0.1, end.z - 0.2), V(end.x + 0.05, 0.04, end.z - 0.4), V(end.x + 0.2, 0.04, end.z - 0.5)]);
            this.tail.add(new THREE.Mesh(new THREE.TubeGeometry(c, 10, 0.03, 4, false), this._mat(0x101214, 1, 0.5)));
            const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6), gold); jack.rotation.z = Math.PI / 2; jack.position.set(end.x + 0.23, 0.04, end.z - 0.5); this.tail.add(jack);
            // The odd detail: a buffering ring turning over its back on a stalk.
            this._buffer = new THREE.Group(); this._buffer.position.set(path[4].x, 0.2, path[4].z); this.bodyGroup.add(this._buffer);
            this._strut(this._buffer, skin, V(0, 0, 0), V(0, 0.22, 0), 0.025, 0.015, 4);
            const arc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 3, 12, Math.PI * 1.5), glow); arc.position.y = 0.32; this._buffer.add(arc); this._bufferArc = arc;
            const track = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 3, 12), this._mat(p.bodyColor, 1, 0.5)); track.position.y = 0.32; this._buffer.add(track);
            this._partMeshMap = { HEAD: this.head, MAW: this.maw, JAWS: this.maw, HEART_SEGMENT: this.heartSeg, CORE: this.heartSeg, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT', 'CORE', 'BODY'], hide: [...segs, this.head, this.maw, this.bodySeg, this.tail, this._buffer] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head, this.maw, segs[0]] },
                { gone: ['MAW', 'JAWS'], hide: [this.maw] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg, this._buffer] },
                { gone: ['TAIL'], hide: [this.tail, segs[8]] },
            ];
        }

        // ── Prism Beetle: a faceted shell that splits light into colours ────
        _buildPrismBeetle() {
            const p = this.profile;
            const glass = this._skinMat(p.bodyColor, 0.1); glass.opacity = 0.85;
            const dark = this._mat(0x2a2a3a, 1, 0.4);
            const SPECTRUM = [0xff3030, 0xff9a20, 0xffe030, 0x40e050, 0x3080ff, 0x9a40ff];
            this.thorax = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), glass); this.thorax.scale.set(1.2, 0.8, 1); this.thorax.position.set(0, 0.42, 0.2); this.bodyGroup.add(this.thorax);
            // ABDOMEN: two triangular prism elytra, each facet a band of spectrum.
            this.abdomen = new THREE.Group(); this.abdomen.position.set(0, 0.42, -0.2); this.bodyGroup.add(this.abdomen);
            for (const s of [-1, 1]) {
                const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 3), glass); case_.rotation.set(Math.PI / 2, 0, s * 0.3); case_.position.set(s * 0.12, 0.02, 0); this.abdomen.add(case_);
                SPECTRUM.forEach((c, k) => { const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.08), this._mat(c, 0.9, 0.2, c)); band.position.set(s * 0.17, 0.13, 0.24 - k * 0.095); band.rotation.z = s * 0.45; this.abdomen.add(band); });
            }
            // HEAD with a glass prism horn throwing a fan of colour forward.
            this.head = new THREE.Group(); this.head.position.set(0, 0.42, 0.42); this.bodyGroup.add(this.head);
            this.head.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), glass));
            for (const s of [-1, 1]) this._eye(this.head, s * 0.07, 0.03, 0.08, 0.03, 0x111111, false);
            const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 3), this._mat(0xf0f8ff, 0.7, 0.05, 0x445566)); horn.position.set(0, 0.14, 0.08); horn.rotation.x = 0.7; this.head.add(horn);
            this._fan = new THREE.Group(); this._fan.position.set(0, 0.23, 0.18); this.head.add(this._fan);
            SPECTRUM.forEach((c, k) => { const ray = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.34), this._mat(c, 0.55, 0.2, c)); ray.position.set(0, 0, 0.16); const pivot = new THREE.Group(); pivot.rotation.y = (k - 2.5) * 0.12; pivot.rotation.x = -0.25; pivot.add(ray); this._fan.add(pivot); });
            this.mandibles = new THREE.Group(); this.mandibles.position.set(0, 0.37, 0.52); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) this._strut(this.mandibles, dark, V(s * 0.03, 0, 0), V(s * 0.02, -0.03, 0.09), 0.018, 0.006, 3);
            const L = [], R = [];
            for (let i = 0; i < 3; i++) { const z = 0.24 - i * 0.18; L.push(this._insectLeg(dark, -1, 0.12, 0.38, z, 0.36, 0.1 - i * 0.1, 0.022)); R.push(this._insectLeg(dark, 1, 0.12, 0.38, z, 0.36, 0.1 - i * 0.1, 0.022)); }
            this._wireInsect({ head: this.head, thorax: this.thorax, abdomen: this.abdomen, mandibles: this.mandibles, legs: { L, R } });
        }

        // ── Tomb Scarab: a gilded scarab holding up a lapis sun ─────────────
        _buildTombScarab() {
            const p = this.profile;
            const gold = this._skinMat(p.bodyColor, 0.3);
            const lapis = this._mat(p.accent, 1, 0.3, 0x060a20);
            const dark = this._mat(0x2a1e0a, 1, 0.5);
            // ABDOMEN: the broad flat elytra dome, banded with lapis inlay.
            this.abdomen = new THREE.Group(); this.abdomen.position.set(0, 0.3, -0.12); this.bodyGroup.add(this.abdomen);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.scale.set(1, 0.6, 1.15); this.abdomen.add(dome);
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.9), dark); seam.position.set(0, 0.22, 0); seam.rotation.x = 0; this.abdomen.add(seam);
            for (const r of [0.3, 0.38]) { const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 3, 14, Math.PI), lapis); band.rotation.set(Math.PI / 2, 0, 0); band.scale.set(1, 1.15, 1); band.position.y = 0.04 + (0.4 - r) * 0.8; this.abdomen.add(band); }
            const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.08, 10), dark); belly.scale.z = 1.15; belly.position.y = -0.02; this.abdomen.add(belly);
            // THORAX: the pronotum shield, engraved with an eye glyph.
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), gold); this.thorax.scale.set(1.15, 0.6, 0.8); this.thorax.position.set(0, 0.3, 0.3); this.bodyGroup.add(this.thorax);
            const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 3, 8), lapis); glyph.scale.set(1.4, 0.7, 1); glyph.position.set(0, 0.13, 0.12); glyph.rotation.x = -0.6; this.thorax.add(glyph);
            // HEAD: the rake-toothed clypeus.
            this.head = new THREE.Group(); this.head.position.set(0, 0.3, 0.5); this.bodyGroup.add(this.head);
            const clyp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 8, 1, false, -Math.PI / 2, Math.PI), gold); clyp.position.y = 0.0; this.head.add(clyp);
            for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k + 0.5) * Math.PI / 5, t = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 3), gold); t.position.set(Math.sin(a) * 0.17, 0, Math.cos(a) * 0.17); t.quaternion.setFromUnitVectors(V(0, 1, 0), V(Math.sin(a), 0, Math.cos(a))); this.head.add(t); }
            for (const s of [-1, 1]) this._eye(this.head, s * 0.11, 0.04, 0.04, 0.025, 0x111111, false);
            this.mandibles = new THREE.Group(); this.mandibles.position.set(0, 0.27, 0.6); this.bodyGroup.add(this.mandibles);
            for (const s of [-1, 1]) this._strut(this.mandibles, dark, V(s * 0.04, 0, 0), V(s * 0.015, -0.02, 0.07), 0.016, 0.005, 3);
            // FRONT legs reared up holding the lapis sun over the head; the rest walk.
            const reared = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.16, 0.32, 0.38); this.bodyGroup.add(g);
                const elbow = V(side * 0.1, 0.24, 0.06), hand = V(-side * 0.04, 0.5, 0.1);
                this._strut(g, gold, V(0, 0, 0), elbow, 0.03, 0.026, 4); this._strut(g, gold, elbow, hand, 0.026, 0.02, 4);
                for (let k = 0; k < 3; k++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 3), gold); tooth.position.copy(elbow).lerp(hand, 0.3 + k * 0.25); tooth.position.x += side * 0.025; tooth.rotation.z = -side * Math.PI / 2; g.add(tooth); }
                g._side = side; return g;
            };
            const fl = reared(-1), fr = reared(1);
            this._sun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), lapis); this._sun.position.set(0, 0.86, 0.48); this.bodyGroup.add(this._sun);
            const L = [fl], R = [fr];
            for (let i = 0; i < 2; i++) { const z = 0.12 - i * 0.28; L.push(this._insectLeg(gold, -1, 0.3, 0.28, z, 0.4, -0.05 - i * 0.1, 0.026)); R.push(this._insectLeg(gold, 1, 0.3, 0.28, z, 0.4, -0.05 - i * 0.1, 0.026)); }
            this._wireInsect({ head: this.head, thorax: this.thorax, abdomen: this.abdomen, mandibles: this.mandibles, legs: { L, R }, extra: [this._sun] });
            this._cascadeRules.push({ gone: ['LEFT_LEG'], hide: [this._sun] }, { gone: ['RIGHT_LEG'], hide: [this._sun] });
        }

        // ── Training Dummy (Scarecrow keys): it took one blow too many ──────
        _buildTrainingDummy() {
            const p = this.profile;
            const burlap = this._skinMat(p.bodyColor, 0.9);
            const wood = this._mat(0x6a4a2a, 1, 0.85);
            const straw = this._mat(0xe0c060, 1, 0.9);
            const leather = this._mat(0x5a3418, 1, 0.7);
            // LEGS: the two crossed planks of its stand, a centre post up through it.
            const plank = (rot) => { const g = new THREE.Group(); this.bodyGroup.add(g); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.14), wood); pl.position.y = 0.06; pl.rotation.y = rot; g.add(pl); return g; };
            this.lleg = plank(Math.PI / 4); this.rleg = plank(-Math.PI / 4);
            // TORSO: post, stuffed sack with rope bands, a painted target, a rip.
            this.torso = new THREE.Group(); this.bodyGroup.add(this.torso);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 6), wood); post.position.y = 0.85; this.torso.add(post);
            const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.75, 8), burlap); sack.position.y = 1.15; sack.scale.set(1, 1, 0.85); this.torso.add(sack);
            for (const y of [0.85, 1.48]) { const rope = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 3, 10), this._mat(0xa88a50, 1, 0.9)); rope.rotation.x = Math.PI / 2; rope.scale.set(1.05, 0.9, 1); rope.position.y = y; this.torso.add(rope); }
            [[0.17, 0xf0e8d8], [0.12, p.accent], [0.07, 0xf0e8d8], [0.03, p.accent]].forEach(([r, c], k) => { const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 10), this._mat(c, 1, 0.8)); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.18, 0.245 + k * 0.004); this.torso.add(ring); });
            for (let i = 0; i < 5; i++) this._strut(this.torso, straw, V(-0.2, 0.98, 0.14), V(-0.32 - (i % 3) * 0.04, 0.9 + i * 0.03, 0.2 + (i % 2) * 0.05), 0.012, 0.004, 3);
            // The odd detail: a broken practice sword stuck in its side.
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.012), this._mat(0x9aa0a8, 1, 0.3)); blade.position.set(0.32, 1.25, 0.04); blade.rotation.z = 1.0; this.torso.add(blade);
            const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.08), leather); hilt.position.set(0.48, 1.36, 0.04); hilt.rotation.z = 1.0; this.torso.add(hilt);
            // ARMS: padded pegs on a swivel bar through the shoulders.
            const arm = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.22, 1.4, 0); this.bodyGroup.add(g);
                const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 6), wood); peg.rotation.z = Math.PI / 2; peg.position.x = side * 0.27; g.add(peg);
                for (const x of [0.18, 0.34]) { const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 6), leather); wrap.rotation.z = Math.PI / 2; wrap.position.x = side * x; g.add(wrap); }
                const mitt = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), leather); mitt.position.x = side * 0.58; g.add(mitt);
                g._side = side; return g;
            };
            this.larm = arm(-1); this.rarm = arm(1);
            // HEAD: a sack head under a dented upturned bucket, crude painted face.
            this.head = new THREE.Group(); this.head.position.set(0, 1.72, 0); this.bodyGroup.add(this.head);
            this._strut(this.head, wood, V(0, -0.22, 0), V(0, 0.0, 0), 0.06, 0.06, 6);
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), burlap); this.head.add(ball);
            const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.22, 8), this._mat(0x7a8088, 1, 0.4)); bucket.position.set(0.02, 0.17, -0.02); bucket.rotation.z = 0.15; this.head.add(bucket);
            const dent = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), this._mat(0x5a6068, 1, 0.5)); dent.scale.z = 0.4; dent.position.set(0.12, 0.2, 0.15); this.head.add(dent);
            for (const s of [-1, 1]) { const x = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.02), this._mat(0x1a1008, 1, 0.8)); x.position.set(-0.07, 0.02, 0.19); x.rotation.z = s * 0.8; this.head.add(x); }
            const oEye = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 3, 8), this._mat(0x1a1008, 1, 0.8)); oEye.position.set(0.07, 0.02, 0.19); this.head.add(oEye);
            const mouth = new THREE.Group(); mouth.position.set(0, -0.09, 0.18); this.head.add(mouth);
            mouth.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.02), this._mat(0x1a1008, 1, 0.8)));
            for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.02), this._mat(0x1a1008, 1, 0.8)); st.position.x = -0.05 + k * 0.033; mouth.add(st); }
            this._wireScarecrowParts(mouth, [blade, hilt]);
        }

        // ── Little Scarecrow (Scarecrow keys): small, lopsided, a crow on it ─
        _buildLittleScarecrow() {
            const p = this.profile;
            const burlap = this._skinMat(p.bodyColor, 0.9);
            const wood = this._mat(0x5a4028, 1, 0.85);
            const straw = this._mat(0xe0c060, 1, 0.9);
            const shirt = this._mat(p.accent, 1, 0.85);
            // TORSO: a crooked stake with its crossbar, and a patched shirt.
            this.torso = new THREE.Group(); this.bodyGroup.add(this.torso);
            this._strut(this.torso, wood, V(0, 0, 0), V(0.08, 1.55, 0), 0.05, 0.04, 5);
            this._strut(this.torso, wood, V(-0.5, 1.3, 0.02), V(0.55, 1.36, 0.02), 0.035, 0.035, 5);
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 7), shirt); body.position.set(0.06, 1.05, 0.04); body.rotation.z = -0.06; this.torso.add(body);
            for (const [x, y, c] of [[-0.1, 1.12, 0xc84a2a], [0.12, 0.92, 0x5a8a3a]]) { const patch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), this._mat(c, 1, 0.9)); patch.position.set(x, y, 0.26); this.torso.add(patch); }
            for (let i = 0; i < 6; i++) this._strut(this.torso, straw, V(0.06, 0.8, 0), V(0.06 + Math.cos(i) * 0.2, 0.66, Math.sin(i) * 0.15), 0.014, 0.004, 3);
            // ARMS: empty floppy sleeves hanging off the crossbar, straw at the cuffs.
            const sleeve = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.38, 1.33, 0.02); this.bodyGroup.add(g);
                const c = new THREE.CatmullRomCurve3([V(-side * 0.16, 0, 0), V(side * 0.05, -0.04, 0.02), V(side * 0.14, -0.22, 0.04), V(side * 0.12, -0.42, 0.06)]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.075, 6, false), shirt));
                for (let k = 0; k < 4; k++) this._strut(g, straw, V(side * 0.12, -0.4, 0.06), V(side * (0.1 + k * 0.02), -0.56, 0.04 + (k - 1.5) * 0.03), 0.012, 0.004, 3);
                g._side = side; return g;
            };
            this.larm = sleeve(-1); this.rarm = sleeve(1);
            // The odd detail: a crow sitting on the left end of the crossbar.
            this._crow = new THREE.Group(); this._crow.position.set(-0.47, 1.3, 0.02); this.bodyGroup.add(this._crow);
            const black = this._mat(0x14141a, 1, 0.5);
            const cbody = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), black); cbody.scale.set(0.8, 0.9, 1.3); cbody.position.y = 0.11; this._crow.add(cbody);
            const chead = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), black); chead.position.set(0, 0.2, 0.08); this._crow.add(chead);
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 3), this._mat(0x3a3a30, 1, 0.4)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.2, 0.15); this._crow.add(beak);
            this._eye(this._crow, 0.03, 0.22, 0.11, 0.012, 0xddcc33, true);
            const ctail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.12), black); ctail.position.set(0, 0.08, -0.14); ctail.rotation.x = -0.4; this._crow.add(ctail);
            for (const s of [-1, 1]) this._strut(this._crow, this._mat(0x3a3a30, 1, 0.4), V(s * 0.025, 0.06, 0), V(s * 0.025, 0.03, 0.01), 0.008, 0.006, 3);
            // LEGS: lopsided - one stuffed trouser leg dangling long, one short and tied off.
            const trouser = (side, len) => {
                const g = new THREE.Group(); g.position.set(0.06 + side * 0.09, 0.8, 0.04); this.bodyGroup.add(g);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, len, 6), this._mat(0x4a5a7a, 1, 0.9)); leg.position.y = -len / 2; g.add(leg);
                for (let k = 0; k < 3; k++) this._strut(g, straw, V(0, -len, 0), V((k - 1) * 0.04, -len - 0.08, 0.02), 0.012, 0.004, 3);
                return g;
            };
            this.lleg = trouser(-1, 0.42); this.rleg = trouser(1, 0.2);
            // HEAD: sack head, mismatched button eyes, a stitched mouth and a
            // huge floppy hat with a drooping brim.
            this.head = new THREE.Group(); this.head.position.set(0.1, 1.6, 0.02); this.head.rotation.z = -0.18; this.bodyGroup.add(this.head);
            const sack = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), burlap); sack.scale.set(1, 1.1, 1); this.head.add(sack);
            const btn = (x, y, r, c) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 8), this._mat(c, 1, 0.4)); b.rotation.x = Math.PI / 2; b.position.set(x, y, 0.18); this.head.add(b); for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.02), this._mat(0x111111, 1, 0.5)); h.position.set(x + s * r * 0.3, y, 0.192); this.head.add(h); } };
            btn(-0.07, 0.04, 0.05, 0xc0281e); btn(0.08, 0.05, 0.03, 0x2a5ac0);
            const mouth = new THREE.Group(); mouth.position.set(0, -0.07, 0.17); this.head.add(mouth);
            for (let k = 0; k < 5; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), this._mat(0x1a1008, 1, 0.8)); st.position.set(-0.06 + k * 0.03, Math.abs(k - 2) * 0.008, 0); st.rotation.z = (k % 2 ? 0.4 : -0.4); mouth.add(st); }
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.03, 9), this._mat(0x6a5030, 1, 0.9)); brim.position.y = 0.14; brim.rotation.set(0.15, 0, 0.2); this.head.add(brim);
            const crown = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 7), this._mat(0x6a5030, 1, 0.9)); crown.position.set(-0.02, 0.29, 0); crown.rotation.z = 0.35; this.head.add(crown);
            this._wireScarecrowParts(mouth, [this._crow]);
        }

        // Scarecrow keys shared by the two straw-folk above.
        _wireScarecrowParts(mouth, extra) {
            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['HEAD', 'SKULL', 'FACE', 'BRAIN'], this.head);
            set(['TORSO', 'BODY', 'CORE', 'SPINE', 'RIBCAGE'], this.torso);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_HAND'], this.larm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_HAND'], this.rarm);
            set(['LEFT_LEG', 'LEFT_THIGH'], this.lleg);
            set(['RIGHT_LEG', 'RIGHT_THIGH'], this.rleg);
            set(['MOUTH', 'JAWS', 'MAW'], mouth);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'SPINE', 'RIBCAGE'], hide: [this.torso, this.head, this.larm, this.rarm, ...(extra || [])].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [this.head] },
                { gone: ['MOUTH'], hide: [mouth] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.lleg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rleg] },
            ];
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.4 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'scarecrow' ? 0.8 : 1.3);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new UniqueLowBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = UL_PROFILES;
    // scarecrow is canonically registered by 3DBattler_Humanoid.js (with aliases scarecrows/strawman);
    // omitted here so those aliases keep routing to that family instead of being shadowed.
    reg('clockscarab',  { aliases: ['clockscarab'], scale: S.clockscarab.scale, weapon: 0, create: make });
    reg('frostbeetle',  { aliases: ['frostbeetle'], scale: S.frostbeetle.scale, weapon: 0, create: make });
    reg('woodenflower', { aliases: ['woodenflower'], scale: S.woodenflower.scale, weapon: 0, create: make });
    reg('bogleech',     { aliases: ['bogleech'], scale: S.bogleech.scale, weapon: 0, create: make });
    ['lv_frostmite', 'lv_cactussprout', 'lv_glitchmite', 'lv_dataleech', 'lv_prismbeetle', 'lv_tombscarab', 'lv_trainingdummy', 'lv_littlescarecrow']
        .forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        scarecrow: ["Haunting Scarecrow"],
        clockscarab: ["Pocket Watch Scarab"],
        frostbeetle: ["Permafrost Beetle"],
        woodenflower: ["Wooden Flower"],
        bogleech: ["Bog Leech"],
        lv_frostmite:       ["Frost Mite"],
        lv_cactussprout:    ["Cactus Sprout"],
        lv_glitchmite:      ["Glitch Mite"],
        lv_dataleech:       ["Data Leech"],
        lv_prismbeetle:     ["Prism Beetle"],
        lv_tombscarab:      ["Tomb Scarab"],
        lv_trainingdummy:   ["Training Dummy"],
        lv_littlescarecrow: ["Little Scarecrow"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Unique low-tier models registered');

    ;[['u_porphyrinleech',2.3]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
