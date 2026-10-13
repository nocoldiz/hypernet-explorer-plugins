//=============================================================================
// 3D Battler System - Oddment Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke mixed-archetype one-off models (slow turtle, creeping
 * shade, blood mimic, mr. inadequate, crystalline skulker, compressed air) +
 * name-based assignment. Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Oddment Uniques
 * ============================================================================
 *
 * Distinct one-offs across several archetypes, pinned by exact name. Each maps
 * its SOURCE archetype's body-part keys:
 *   turtle      -> SHELL/HEAD/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/REAR_RIGHT_LEG/TAIL
 *   chestmimic  -> CORE/LID/TEETH/TONGUE/FEET
 *   trash       -> TRASH_PILE/LIMBS/EYES/HEART
 *   crystal     -> CORE/SHELL/CRYSTALS/VEINS
 *   stormelem.  -> CORE/BODY/LEFT_RAIN_ARM/RIGHT_RAIN_ARM/LEFT_THUNDER_LEG/RIGHT_THUNDER_LEG
 *
 * Registered: slowturtle, creepingshade, bloodmimic, mrinadequate,
 *             crystallineskulker, compressedair
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Oddments] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const M_PROFILES = {
        slowturtle:         { variant: 'slowturtle',         scale: 1.8, texturePool: 'foliage', bodyColor: 0x5a8a4a, accent: 0x7a6238, hue: [0.28, 0.06], sat: [0.40, 0.10], lit: [0.42, 0.08] },
        creepingshade:      { variant: 'creepingshade',      scale: 2.0, texturePool: 'void',    bodyColor: 0x2a2a35, accent: 0xaa44ff, hue: [0.75, 0.08], sat: [0.30, 0.10], lit: [0.24, 0.08] },
        bloodmimic:         { variant: 'bloodmimic',         scale: 2.4, texturePool: 'wood',    bodyColor: 0x7a3a28, accent: 0xcc2233, hue: [0.04, 0.04], sat: [0.50, 0.12], lit: [0.36, 0.10] },
        mrinadequate:       { variant: 'mrinadequate',       scale: 1.4, texturePool: 'stone',   bodyColor: 0x7a7060, accent: 0x9a9a55, hue: [0.12, 0.05], sat: [0.18, 0.08], lit: [0.45, 0.08] },
        crystallineskulker: { variant: 'crystallineskulker', scale: 2.1, texturePool: 'crystal', bodyColor: 0x88ccdd, accent: 0xffffff, hue: [0.52, 0.10], sat: [0.40, 0.12], lit: [0.62, 0.10] },
        compressedair:      { variant: 'compressedair',      scale: 2.4, texturePool: 'void',    bodyColor: 0xbfcad8, accent: 0xffffff, hue: [0.60, 0.06], sat: [0.10, 0.06], lit: [0.72, 0.08] },
        // ── Level 1-5 oddments, each on its own bespoke build ──
        lv_pondterrapin:      { variant: 'lv_pondterrapin',      scale: 1.7, texturePool: 'foliage', bodyColor: 0x5a6a3a, accent: 0xcc3322, hue: [0.22, 0.05], sat: [0.35, 0.10], lit: [0.36, 0.08] },
        lv_snappinghatchling: { variant: 'lv_snappinghatchling', scale: 1.6, texturePool: 'stone',   bodyColor: 0x4a3a2a, accent: 0xd8d0b8, hue: [0.08, 0.04], sat: [0.30, 0.10], lit: [0.28, 0.06] },
        lv_dustdevil:         { variant: 'lv_dustdevil',         scale: 2.0, texturePool: 'stone',   bodyColor: 0xc8a878, accent: 0x6a4a2a, hue: [0.09, 0.04], sat: [0.35, 0.10], lit: [0.62, 0.08] }
    };

    class OddmentBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = M_PROFILES[creatureType] || M_PROFILES.slowturtle;
            super(scale, offsetY, battler, profile, 0, creatureType || 'slowturtle');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            if (this.variant === 'bloodmimic' || this.variant === 'mrinadequate' || this.variant === 'lv_dustdevil') this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0xffffff, 1.0, 0.2, accent === 0x111111 ? null : accent));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(0x000000, 1.0, 0.1)); pup.position.set(0, 0, r * 0.6); eye.add(pup);
            parent.add(eye); return eye;
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'creepingshade':      this._buildTurtle(true); break;
                case 'bloodmimic':         this._buildBloodMimic(); break;
                case 'mrinadequate':       this._buildInadequate(); break;
                case 'crystallineskulker': this._buildCrystalSkulker(); break;
                case 'compressedair':      this._buildCompressedAir(); break;
                case 'lv_pondterrapin':      this._buildLvPondTerrapin(); break;
                case 'lv_snappinghatchling': this._buildLvSnappingHatchling(); break;
                case 'lv_dustdevil':         this._buildLvDustDevil(); break;
                default:                   this._buildTurtle(false); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Turtle: peaceful (slow) or shadow-infused (creeping shade) ────
        _buildTurtle(shade) {
            const p = this.profile;
            const skinG = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this._skinMat(shade ? 0x1a1a22 : 0x6a5a3a, 0.7);
            this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), shellMat); this.shell.position.set(0, 0.7, 0); this.shell.scale.set(1.2, 0.9, 1.4); this.bodyGroup.add(this.shell);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const plate = new THREE.Mesh(new THREE.CircleGeometry(0.14, 6), this._mat(shade ? 0x101018 : 0x5a4a2a, 1, 0.7)); plate.position.set(Math.cos(a) * 0.3, 0.96, Math.sin(a) * 0.35); plate.rotation.x = -Math.PI / 2; this.bodyGroup.add(plate); }
            const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14), skinG); belly.position.set(0, 0.4, 0); this.bodyGroup.add(belly);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinG); h.scale.set(1, 0.9, 1.3); this.head.add(h);
            this._eye(this.head, -0.08, 0.04, 0.14, 0.045, shade ? p.accent : 0x111111); this._eye(this.head, 0.08, 0.04, 0.14, 0.045, shade ? p.accent : 0x111111);
            this.head.position.set(0, 0.6, 0.6); this.bodyGroup.add(this.head);
            this.frontLeft = this._turtleLeg(-0.34, 0.4, skinG); this.frontRight = this._turtleLeg(0.34, 0.4, skinG);
            this.rearLeft = this._turtleLeg(-0.34, -0.4, skinG); this.rearRight = this._turtleLeg(0.34, -0.4, skinG);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), skinG); this.tail.position.set(0, 0.5, -0.6); this.tail.rotation.x = -Math.PI / 2; this.bodyGroup.add(this.tail);
            const extra = [];
            if (shade) {
                this.wisps = new THREE.Group();
                for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), this._mat(p.accent, 0.5, 0.3, p.accent)); const a = (i / 6) * Math.PI * 2; w.position.set(Math.cos(a) * 0.5, 0.9, Math.sin(a) * 0.55); w._a = a; this.wisps.add(w); }
                this.bodyGroup.add(this.wisps); extra.push(this.wisps);
            }
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL', 'BODY', 'CORE'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail, ...extra] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _turtleLeg(x, z, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.28, 7), mat);
            g.position.set(x, 0.34, z); g.rotation.x = 0.3; this.bodyGroup.add(g); return g;
        }

        // ── Blood Mimic: a bleeding treasure chest with a fanged maw ──────
        _buildBloodMimic() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.6);
            const gold = this._mat(0xb89030, 1, 0.4);
            this.core = new THREE.Group();
            const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.7), wood); box.position.y = 0.55; this.core.add(box);
            for (const by of [0.3, 0.8]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.07, 0.74), gold); trim.position.y = by; this.core.add(trim); }
            this.bodyGroup.add(this.core);
            // The chest box front face is at z=0.35 (box depth 0.7, centred). Teeth
            // and tongue must sit at/just inside that face, lining the mouth - z=0.62
            // floated them well in front of the chest.
            // The mouth lines the panel BETWEEN the two gold trims (y 0.34..0.76).
            // It used to sit at y 0.74..1.00, which straddled the upper trim and
            // pushed the top row's bases clear of the chest lid (box top is 0.90),
            // leaving a row of teeth floating in mid-air above the box.
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.5), this._mat(p.accent, 1, 0.4)); this.tongue.position.set(0, 0.56, 0.24); this.tongue.rotation.x = 0.3; this.bodyGroup.add(this.tongue);
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xf2efe0, 1, 0.4);
            for (let i = 0; i < 8; i++) {
                const tx = -0.42 + i * 0.12;
                const tu = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat); tu.position.set(tx, 0.68, 0.36); tu.rotation.x = Math.PI; this.teeth.add(tu);
                const td = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat); td.position.set(tx, 0.44, 0.36); this.teeth.add(td);
            }
            this.bodyGroup.add(this.teeth);
            // The lid hinges on the BACK TOP RIM and reaches forward from it, so
            // closed it rests squarely on the chest. Centring the slab on the
            // hinge (the old local z of 0) pushed the whole lid behind the box,
            // leaving it hovering free of the model.
            this.lid = new THREE.Group();
            const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.72), wood); lidBox.position.set(0, 0.1, 0.36); this.lid.add(lidBox);
            this._eye(this.lid, -0.26, 0.2, 0.5, 0.1, p.accent); this._eye(this.lid, 0.26, 0.2, 0.5, 0.1, p.accent);
            this.lid.position.set(0, 0.90, -0.36); this.bodyGroup.add(this.lid);
            // Blood drips down the front, running from the lower lip.
            this.blood = new THREE.Group();
            for (let i = 0; i < 5; i++) { const dr = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 0.95, 0.2)); dr.position.set(-0.4 + i * 0.2, 0.36, 0.37); dr.scale.y = 1.8; dr._base = 0.36; dr._t = this.idRand(); this.blood.add(dr); }
            this.bodyGroup.add(this.blood);
            this.feet = new THREE.Group();
            for (const fx of [-0.34, 0.34]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.34), this._mat(0x3a2a1a, 1, 0.8)); foot.position.set(fx, 0.12, 0.1); this.feet.add(foot); }
            this.bodyGroup.add(this.feet);
            this._partMeshMap = { CORE: this.core, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.lid, this.teeth, this.tongue, this.blood, this.feet] },
                { gone: ['LID'], hide: [this.lid] },
                { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Mr. Inadequate: the most pathetic little trash pile ───────────
        _buildInadequate() {
            const p = this.profile;
            const junk = this._skinMat(p.bodyColor, 0.85);
            this.trashPile = new THREE.Group();
            for (let i = 0; i < 6; i++) { const bit = new THREE.Mesh(new THREE.BoxGeometry(0.18 + this.idRand() * 0.1, 0.14 + this.idRand() * 0.1, 0.18), junk); bit.position.set((this.idRand() - 0.5) * 0.4, 0.4 + this.idRand() * 0.3, (this.idRand() - 0.5) * 0.4); bit.rotation.set(this.idRand(), this.idRand(), this.idRand()); this.trashPile.add(bit); }
            this.bodyGroup.add(this.trashPile);
            // Sad droopy eyes.
            this.eyes = new THREE.Group();
            const le = this._eye(this.eyes, -0.1, 0.6, 0.22, 0.07, 0xffffff); const re = this._eye(this.eyes, 0.1, 0.6, 0.22, 0.07, 0xffffff);
            const tear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(0x88bbdd, 0.8, 0.2)); tear.position.set(-0.1, 0.5, 0.26); tear.scale.y = 1.5; this.eyes.add(tear); this.eyes._tear = tear;
            this.bodyGroup.add(this.eyes);
            // Droopy little limbs.
            this.limbs = new THREE.Group();
            for (const lx of [-0.22, 0.22]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.3, 5), junk); arm.position.set(lx, 0.35, 0.05); arm.rotation.z = lx > 0 ? -0.6 : 0.6; this.limbs.add(arm); }
            this.bodyGroup.add(this.limbs);
            // Feebly-beating heart.
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(0xaa4455, 0.9, 0.3, 0x441018)); this.heart.position.set(0, 0.45, 0.2); this.bodyGroup.add(this.heart);
            this._partMeshMap = { TRASH_PILE: this.trashPile, LIMBS: this.limbs, EYES: this.eyes, HEART: this.heart };
            this._cascadeRules = [
                { gone: ['TRASH_PILE', 'CORE', 'BODY'], hide: [this.trashPile, this.eyes, this.limbs, this.heart] },
                { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['LIMBS'], hide: [this.limbs] },
                { gone: ['HEART'], hide: [this.heart] },
            ];
        }

        // ── Crystalline Skulker: prismatic crystal stalker ────────────────
        _buildCrystalSkulker() {
            const p = this.profile;
            const crystalMat = this._skinMat(p.bodyColor, 0.2); crystalMat.opacity = 0.85;
            this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), crystalMat); this.shell.position.y = 0.9; this.shell.scale.set(1, 1.3, 1); this.bodyGroup.add(this.shell);
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), this._mat(p.accent, 1, 0.1, p.accent)); this.core.position.y = 0.9; this.bodyGroup.add(this.core);
            // Protruding prismatic crystals.
            this.crystals = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI; const cr = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 4), crystalMat); cr.position.set(Math.sin(e) * Math.cos(a) * 0.5, 0.9 + Math.cos(e) * 0.5, Math.sin(e) * Math.sin(a) * 0.5); cr.lookAt(Math.sin(e) * Math.cos(a) * 2, 0.9 + Math.cos(e) * 2, Math.sin(e) * Math.sin(a) * 2); this.crystals.add(cr); }
            this.bodyGroup.add(this.crystals);
            // Glowing veins (legs of light).
            this.veins = new THREE.Group();
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const v = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.7, 5), this._mat(p.accent, 0.7, 0.2, p.accent)); v.position.set(Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22); v.rotation.z = Math.cos(a) * 0.3; this.veins.add(v); }
            this.bodyGroup.add(this.veins);
            this._partMeshMap = { CORE: this.core, SHELL: this.shell, CRYSTALS: this.crystals, VEINS: this.veins };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.shell, this.crystals, this.veins] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['CRYSTALS'], hide: [this.crystals] },
                { gone: ['VEINS'], hide: [this.veins] },
            ];
        }

        // ── Compressed Air: a howling razor-wind vortex ───────────────────
        _buildCompressedAir() {
            const p = this.profile;
            const wind = this._skinMat(p.bodyColor, 0.3); wind.opacity = 0.5;
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0xffffff, 0.9, 0.1, 0xffffff)); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            this.body = new THREE.Group();
            for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22 + i * 0.1, 0.04, 8, 20), wind); ring.position.y = 0.5 + i * 0.3; ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1, 0.5); ring._i = i; this.body.add(ring); }
            // A faint funnel of air the rings ride on: its wall passes through
            // every ring, so the vortex reads as one column instead of four
            // hoops stacked in the air over a pair of loose legs.
            const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.12, 1.3, 10, 1, true), this._mat(p.bodyColor, 0.22, 0.3));
            funnel.position.y = 0.85; this.body.add(funnel);
            this.bodyGroup.add(this.body);
            // Razor wind blade-arms.
            this.larm = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7, 3), this._mat(p.accent, 0.6, 0.2, p.accent)); this.larm.position.set(-0.4, 1.0, 0); this.larm.rotation.z = Math.PI / 2; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.7, 3), this._mat(p.accent, 0.6, 0.2, p.accent)); this.rarm.position.set(0.4, 1.0, 0); this.rarm.rotation.z = -Math.PI / 2; this.bodyGroup.add(this.rarm);
            this.lleg = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), wind); this.lleg.position.set(-0.12, 0.4, 0); this.lleg.rotation.x = Math.PI; this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), wind); this.rleg.position.set(0.12, 0.4, 0); this.rleg.rotation.x = Math.PI; this.bodyGroup.add(this.rleg);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.larm, RIGHT_RAIN_ARM: this.rarm, LEFT_THUNDER_LEG: this.lleg, RIGHT_THUNDER_LEG: this.rleg };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.larm, this.rarm, this.lleg, this.rleg] },
                { gone: ['BODY'], hide: [this.body] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_RAIN_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rleg] },
            ];
        }

        // ── Level 1-5 oddments: helpers ─────────────────────────────────────
        // A rod from point a to point b (a neck, a leg, a tail segment).
        _lvBone(parent, a, b, r0, r1, mat, seg) {
            const A = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(b[0], b[1], b[2]).sub(A), len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg || 6), mat);
            m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }
        // Turtle part map: losing the SHELL takes everything with it.
        _lvTurtleWire(extra) {
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail, BEAK: this.beak };
            this._cascadeRules = [
                { gone: ['SHELL', 'BODY', 'CORE'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail, ...(extra || [])] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['BEAK'], hide: [this.beak] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Pond Terrapin: a mossy slider basking on its log ────────────────
        // A low wide shell with raised scutes, moss clumps and moss hanging off
        // the rim, a striped neck stretched out to a head with the red ear
        // patch of a slider, webbed feet gripping the log it suns itself on.
        _buildLvPondTerrapin() {
            const p = this.profile;
            const skin = this._skinMat(0x4a5a2a, 0.6), shellMat = this._skinMat(p.bodyColor, 0.7);
            const moss = this._mat(0x3a7a2a, 1, 0.95), stripe = this._mat(0xd8c84a, 1, 0.6), bark = this._mat(0x5a3a22, 1, 0.95);
            this.log = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.3, 7), bark); trunk.rotation.x = Math.PI / 2; trunk.position.y = 0.21; this.log.add(trunk);
            for (const z of [-0.651, 0.651]) { const ring = new THREE.Mesh(new THREE.CircleGeometry(0.19, 7), this._mat(0xb89a6a, 1, 0.9)); ring.position.set(0, 0.21, z); if (z < 0) ring.rotation.y = Math.PI; this.log.add(ring); }
            this._lvBone(this.log, [0.12, 0.3, -0.3], [0.32, 0.46, -0.42], 0.05, 0.03, bark);
            this.bodyGroup.add(this.log);
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); dome.scale.set(1, 0.5, 1.25); dome.position.y = 0.5; this.shell.add(dome);
            const plastron = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.44, 0.07, 9), this._mat(0xc8b860, 1, 0.7)); plastron.scale.z = 1.25; plastron.position.y = 0.47; this.shell.add(plastron);
            for (const [x, z, r] of [[0, 0.25, 0.13], [0, -0.05, 0.14], [0, -0.33, 0.12], [-0.26, 0.1, 0.11], [0.26, 0.1, 0.11], [-0.26, -0.22, 0.1], [0.26, -0.22, 0.1]]) {
                const nx = x / 0.5, nz = z / 0.625, h = 0.25 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
                const sc = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, 0.04, 6), shellMat); sc.position.set(x, 0.5 + h - 0.005, z); sc.rotation.set(-nz * 0.6, 0, nx * 0.6); this.shell.add(sc);
            }
            for (const [x, z] of [[-0.18, 0.32], [0.3, -0.05], [-0.12, -0.4]]) { const nx = x / 0.5, nz = z / 0.625; const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), moss); m.scale.y = 0.5; m.position.set(x, 0.5 + 0.25 * Math.sqrt(1 - nx * nx - nz * nz), z); this.shell.add(m); }
            for (let i = 0; i < 6; i++) { const a = 0.4 + i * 1.0; const st = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), moss); st.position.set(Math.cos(a) * 0.49, 0.42, Math.sin(a) * 0.61); st.rotation.x = Math.PI; this.shell.add(st); }
            this.bodyGroup.add(this.shell);
            // Neck and head, stretched out to the sun.
            this.head = new THREE.Group();
            this._lvBone(this.head, [0, 0.5, 0.5], [0, 0.6, 0.78], 0.08, 0.07, skin);
            for (const sx of [-1, 1]) this._lvBone(this.head, [sx * 0.07, 0.52, 0.52], [sx * 0.065, 0.62, 0.78], 0.012, 0.012, stripe, 3);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), skin); skull.scale.set(0.9, 0.8, 1.3); skull.position.set(0, 0.63, 0.87); this.head.add(skull);
            for (const sx of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), this._mat(p.accent, 1, 0.5)); ear.scale.set(0.3, 0.6, 1.4); ear.position.set(sx * 0.11, 0.63, 0.82); this.head.add(ear);
                this._eye(this.head, sx * 0.08, 0.68, 0.94, 0.03, 0x111111);
            }
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 4), skin); this.beak.rotation.x = Math.PI / 2; this.beak.position.set(0, 0.6, 1.03); this.head.add(this.beak);
            this.bodyGroup.add(this.head);
            // Webbed feet gripping the log, pivoting where they leave the shell.
            const leg = (sx, z) => {
                const g = new THREE.Group(); g.position.set(sx * 0.4, 0.47, z);
                this._lvBone(g, [0, 0, 0], [-sx * 0.24, -0.08, 0.04], 0.065, 0.05, skin);
                const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 4), skin); foot.scale.set(1.2, 0.45, 1.1); foot.position.set(-sx * 0.27, -0.1, 0.05); g.add(foot);
                for (const k of [-1, 0, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 3), this._mat(0x1a1a10, 1, 0.5)); c.position.set(-sx * 0.27 + k * 0.035, -0.1, 0.13); c.rotation.x = Math.PI / 2; g.add(c); }
                this.bodyGroup.add(g); return g;
            };
            this.frontLeft = leg(-1, 0.35); this.frontRight = leg(1, 0.35); this.rearLeft = leg(-1, -0.38); this.rearRight = leg(1, -0.38);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 5), skin); this.tail.position.set(0, 0.46, -0.7); this.tail.rotation.x = -Math.PI / 2 - 0.3; this.bodyGroup.add(this.tail);
            this._lvTurtleWire();
        }

        // ── Snapping Hatchling: a mud-caked baby snapper, still in its shell ─
        // Half sunk in a mound of mud: a small shell with three saw-toothed
        // keels and a serrated rear edge, an oversized head with a hooked beak
        // gaping open under a scowling brow, a cap of its own eggshell still
        // stuck on top, and a long tail ridged like a saw.
        _buildLvSnappingHatchling() {
            const p = this.profile;
            const skin = this._skinMat(0x5a5040, 0.8), shellMat = this._skinMat(p.bodyColor, 0.85);
            const mud = this._mat(0x3a2a1a, 1, 0.95), egg = this._mat(p.accent, 1, 0.5), horn = this._mat(0x2a2218, 1, 0.5);
            this.mound = new THREE.Mesh(new THREE.SphereGeometry(0.62, 9, 4), mud); this.mound.scale.y = 0.25; this.bodyGroup.add(this.mound);
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); dome.scale.set(1, 0.55, 1.2); dome.position.y = 0.13; this.shell.add(dome);
            for (const x of [-0.13, 0, 0.13]) for (let i = 0; i < 4; i++) {
                const z = 0.24 - i * 0.16, nx = x / 0.35, nz = z / 0.42, h = 0.19 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, x ? 0.08 : 0.11, 4), horn); sp.position.set(x, 0.13 + h + 0.02, z); sp.rotation.x = -0.5; this.shell.add(sp);
            }
            for (let i = 0; i < 5; i++) { const a = Math.PI * 1.2 + i * Math.PI * 0.15; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), horn); sp.position.set(Math.cos(a) * 0.34, 0.14, Math.sin(a) * 0.41); sp.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4); this.shell.add(sp); }
            for (const [x, z] of [[0.2, 0.1], [-0.15, -0.2], [0.05, 0.3]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 3), mud); m.scale.y = 0.4; const nx = x / 0.35, nz = z / 0.42; m.position.set(x, 0.13 + 0.19 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz)), z); this.shell.add(m); }
            this.bodyGroup.add(this.shell);
            // Oversized head on a short thick neck.
            this.head = new THREE.Group(); this.head.position.set(0, 0.22, 0.38);
            this._lvBone(this.head, [0, -0.04, -0.12], [0, 0.04, 0.08], 0.09, 0.09, skin);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), skin); skull.scale.set(1, 0.85, 1.2); skull.position.set(0, 0.08, 0.16); this.head.add(skull);
            for (const sx of [-1, 1]) {
                this._eye(this.head, sx * 0.09, 0.14, 0.27, 0.03, 0xccaa22);
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.04), skin); brow.position.set(sx * 0.08, 0.185, 0.26); brow.rotation.z = sx * 0.4; this.head.add(brow);
            }
            this.beak = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), horn); upper.position.set(0, 0.05, 0.34); upper.rotation.x = Math.PI / 2 + 0.5; this.beak.add(upper);
            this.jaw = new THREE.Group(); this.jaw.position.set(0, -0.02, 0.18);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), horn); lower.position.set(0, -0.02, 0.08); this.jaw.add(lower);
            this.jaw.rotation.x = 0.35; this.beak.add(this.jaw);
            this.head.add(this.beak);
            const capShell = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2.4), egg); capShell.position.set(0.02, 0.2, 0.12); capShell.rotation.z = -0.3; this.head.add(capShell);
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const chip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3), egg); chip.position.set(0.02 + Math.cos(a) * 0.1, 0.24, 0.12 + Math.sin(a) * 0.1); this.head.add(chip); }
            this.bodyGroup.add(this.head);
            const leg = (sx, z) => {
                const g = new THREE.Group(); g.position.set(sx * 0.28, 0.14, z);
                this._lvBone(g, [0, 0, 0], [sx * 0.16, -0.08, z > 0 ? 0.06 : -0.06], 0.055, 0.045, skin);
                for (const k of [-1, 0, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 3), horn); c.position.set(sx * 0.2, -0.09, (z > 0 ? 0.08 : -0.04) + k * 0.03); c.rotation.x = Math.PI / 2; g.add(c); }
                this.bodyGroup.add(g); return g;
            };
            this.frontLeft = leg(-1, 0.2); this.frontRight = leg(1, 0.2); this.rearLeft = leg(-1, -0.22); this.rearRight = leg(1, -0.22);
            // Saw-ridged tail curling off behind.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.14, -0.4);
            const tp = [[0, 0, 0], [0.05, -0.02, -0.18], [0.14, -0.03, -0.32], [0.26, -0.04, -0.4]];
            for (let i = 0; i < 3; i++) { this._lvBone(this.tail, tp[i], tp[i + 1], 0.06 - i * 0.017, 0.045 - i * 0.015, skin); const r = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 3), horn); r.position.set((tp[i][0] + tp[i + 1][0]) / 2, (tp[i][1] + tp[i + 1][1]) / 2 + 0.05 - i * 0.012, (tp[i][2] + tp[i + 1][2]) / 2); this.tail.add(r); }
            this.bodyGroup.add(this.tail);
            this._lvTurtleWire([this.mound]);
        }

        // ── Dust Devil: a gritty whirlwind that has stolen a hat ────────────
        // A sand-coloured funnel of stacked spinning slices, each turning at
        // its own speed so the column twists, two dark hollows for eyes and a
        // howling mouth, two arcing streams of sand for arms, little dust
        // skitters at its foot, and somebody's bowler hat riding on top.
        _buildLvDustDevil() {
            const p = this.profile;
            const sand = this._skinMat(p.bodyColor, 0.95); sand.opacity = 0.9;
            const dark = this._mat(0x2a1a0e, 1, 0.9), felt = this._mat(0x1e1a18, 1, 0.8);
            this.body = new THREE.Group();
            this.spinners = [];
            const tipM = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 7), sand); tipM.rotation.x = Math.PI; tipM.position.y = 0.11; this.body.add(tipM);
            for (let i = 0; i < 7; i++) {
                const g = new THREE.Group(); g.position.y = 0.3 + i * 0.19;
                const r = 0.12 + i * 0.055;
                const slice = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.03, r, 0.26, 9), sand); slice.position.x = (i % 2 ? 0.035 : -0.035); g.add(slice);
                g._spd = (i % 2 ? 1 : -1) * (3 + i * 0.6); this.spinners.push(g); this.body.add(g);
            }
            this.bodyGroup.add(this.body);
            // The stolen bowler, riding the top of the funnel.
            this.hat = new THREE.Group(); this.hat.position.set(0.03, 1.56, 0); this.hat.rotation.z = 0.18;
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), felt); this.hat.add(brim);
            const crown = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), felt); crown.scale.y = 1.3; this.hat.add(crown);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 3, 10), this._mat(0x7a1a1a, 1, 0.7)); band.rotation.x = Math.PI / 2; band.position.y = 0.04; this.hat.add(band);
            this.body.add(this.hat);
            // Face, held still while the slices turn behind it.
            this.face = new THREE.Group();
            for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), dark); e.scale.set(1, 1.4, 0.5); e.position.set(sx * 0.12, 1.08, 0.33); this.face.add(e); }
            this.body.add(this.face);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 4, 8), dark); this.maw.scale.y = 1.4; this.maw.position.set(0, 0.86, 0.3); this.bodyGroup.add(this.maw);
            this.core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), this._mat(0xe8d8a0, 1, 0.3, 0x665522)); this.core.position.set(0, 0.62, 0.22); this.bodyGroup.add(this.core);
            // Sand streams arcing off its sides.
            const stream = (sx) => { const g = new THREE.Group(); g.position.set(sx * 0.33, 1.1, 0); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 9, Math.PI * 0.9), sand); arc.position.x = 0.22; arc.rotation.z = Math.PI; g.add(arc); if (sx < 0) g.rotation.y = Math.PI; this.bodyGroup.add(g); return g; };
            this.larm = stream(-1); this.rarm = stream(1);
            // Dust skitters at its foot.
            this.lleg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), sand); this.lleg.scale.y = 0.5; this.lleg.position.set(-0.15, 0.06, 0.02); this.bodyGroup.add(this.lleg);
            this.rleg = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), sand); this.rleg.scale.y = 0.5; this.rleg.position.set(0.15, 0.06, -0.02); this.bodyGroup.add(this.rleg);
            // Grit flung around it: free in the air by design.
            this.grit = new THREE.Group(); this.grit.userData.orbit = true;
            for (let i = 0; i < 10; i++) { const g = new THREE.Mesh(new THREE.TetrahedronGeometry(0.03, 0), this._mat(p.accent, 1, 0.9)); const a = (i / 10) * Math.PI * 2; g.position.set(Math.cos(a) * 0.6, 0.3 + (i % 5) * 0.25, Math.sin(a) * 0.5); this.grit.add(g); }
            this.bodyGroup.add(this.grit);
            this._partMeshMap = { CORE: this.core, BODY: this.body, LEFT_RAIN_ARM: this.larm, RIGHT_RAIN_ARM: this.rarm, LEFT_THUNDER_LEG: this.lleg, RIGHT_THUNDER_LEG: this.rleg, MAW: this.maw };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.larm, this.rarm, this.lleg, this.rleg, this.maw, this.grit] },
                { gone: ['BODY'], hide: [this.body, this.maw, this.grit] },
                { gone: ['LEFT_RAIN_ARM'], hide: [this.larm] },
                { gone: ['RIGHT_RAIN_ARM'], hide: [this.rarm] },
                { gone: ['LEFT_THUNDER_LEG'], hide: [this.lleg] },
                { gone: ['RIGHT_THUNDER_LEG'], hide: [this.rleg] },
                { gone: ['MAW'], hide: [this.maw] },
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            // Four-legged models only stride while really travelling (overworld
            // walk) or lunging on an attack; standing in battle they keep still.
            const stride = this.strideMul(fast);

            switch (this.variant) {
                case 'slowturtle':
                case 'creepingshade': {
                    this.model.position.y = this._baseY + Math.sin(t * 0.8) * 0.01 * this.scale;
                    if (this.head) this.head.position.z = 0.6 - (fast ? 0 : Math.max(0, Math.sin(t * 0.4)) * 0.35); // shy retract
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = 0.3 + Math.sin(t * (fast ? 5 : 1.5) + i) * 0.15 * stride; });
                    if (this.wisps) this.wisps.children.forEach((w, i) => { w.position.y = 0.9 + Math.sin(t * 2 + w._a) * 0.1; w.material.emissiveIntensity = 0.4 + Math.sin(t * 3 + i) * 0.3; });
                    break;
                }
                case 'bloodmimic': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.02 * this.scale;
                    if (this.lid) this.lid.rotation.x = fast ? -0.7 - Math.abs(Math.sin(t * 8)) * 0.3 : -0.15 + Math.sin(t * 1.5) * 0.1;
                    if (this.tongue) this.tongue.rotation.x = 0.3 + (fast ? Math.sin(t * 9) * 0.3 : 0);
                    if (this.blood) this.blood.children.forEach(dr => { dr.position.y = dr._base - ((t * 0.3 + dr._t) % 1) * 0.16; });
                    break;
                }
                case 'mrinadequate': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.01 * this.scale; // feeble
                    if (this.heart) { const s = 1 + Math.sin(t * 2.5) * 0.2; this.heart.scale.setScalar(s); }
                    if (this.eyes && this.eyes._tear) { this.eyes._tear.position.y = 0.5 - ((t * 0.2) % 1) * 0.3; }
                    if (this.trashPile) this.trashPile.rotation.z = Math.sin(t * 0.8) * 0.03;
                    break;
                }
                case 'crystallineskulker': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.03 * this.scale;
                    if (this.core) { this.core.rotation.y = t * 1.0; this.core.material.emissiveIntensity = 1.0 + Math.sin(t * 4) * 0.6; }
                    if (this.crystals) this.crystals.rotation.y = t * 0.3;
                    if (this.veins) this.veins.children.forEach((v, i) => { v.material.emissiveIntensity = 0.4 + Math.sin(t * 5 + i) * 0.4; });
                    break;
                }
                case 'lv_pondterrapin': {
                    this.model.position.y = this._baseY;
                    if (this.head) this.head.position.z = fast ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 0.6) * 0.015;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => { if (lg) lg.rotation.x = Math.sin(t * (fast ? 6 : 1.2) + i) * 0.12 * stride; });
                    break;
                }
                case 'lv_snappinghatchling': {
                    this.model.position.y = this._baseY;
                    if (this.jaw) this.jaw.rotation.x = fast ? 0.1 + Math.abs(Math.sin(t * 12)) * 0.5 : 0.3 + Math.sin(t * 1.5) * 0.06;
                    if (this.head) this.head.position.z = 0.38 + (fast ? Math.abs(Math.sin(t * 6)) * 0.08 : 0);
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.8) * 0.25;
                    break;
                }
                case 'lv_dustdevil': {
                    this.model.position.y = this._baseY + Math.sin(t * 2) * 0.03 * this.scale;
                    if (this.spinners) this.spinners.forEach(g => { g.rotation.y += g._spd * (fast ? 1.8 : 1) * deltaTime; });
                    if (this.body) this.body.rotation.z = Math.sin(t * 1.3) * 0.05;
                    if (this.hat) this.hat.rotation.y = Math.sin(t * 2.2) * 0.4;
                    if (this.larm) this.larm.rotation.x = Math.sin(t * 4) * 0.25;
                    if (this.rarm) this.rarm.rotation.x = -Math.sin(t * 4) * 0.25;
                    if (this.grit) this.grit.rotation.y = t * (fast ? 6 : 3);
                    break;
                }
                case 'compressedair': {
                    this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.06 * this.scale;
                    if (this.body) this.body.children.forEach(r => { if (r._i === undefined) return; r.rotation.z +=(fast ? 10 : 6) * deltaTime * (1 + r._i * 0.2); });
                    if (this.larm) this.larm.rotation.y = t * (fast ? 16 : 9);
                    if (this.rarm) this.rarm.rotation.y = -t * (fast ? 16 : 9);
                    if (this.core) this.core.material.emissiveIntensity = 1.0 + Math.sin(t * 8) * 0.5;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.2 * this.scale;
            this.model.rotation.z = prog * 0.7;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new OddmentBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = M_PROFILES;
    Object.keys(S).forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        slowturtle:         ["Slow Turtle"],
        creepingshade:      ["Creeping Shade"],
        bloodmimic:         ["Blood Mimic"],
        mrinadequate:       ["Mr. Inadequate"],
        crystallineskulker: ["Crystalline Skulker"],
        compressedair:      ["Compressed air"],
        lv_pondterrapin:      ["Pond Terrapin"],
        lv_snappinghatchling: ["Snapping Hatchling"],
        lv_dustdevil:         ["Dust Devil"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Oddment uniques registered');
})();
