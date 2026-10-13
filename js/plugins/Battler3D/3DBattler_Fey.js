//=============================================================================
// 3D Battler System - Fey Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke fairy one-off models (flower pixie, mischievous sprite,
 * dream weaver) + name-based assignment. Requires 3DBattlerSystem + families.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Fey Uniques
 * ============================================================================
 *
 * Distinct procedural winged faeries shaped from each enemy's flavour text,
 * pinned by exact name. They map the Fairy (humanoid) archetype keys
 * (HEAD/TORSO + arm/leg/wing keys) so dismemberment works.
 *
 * Registered: flowerpixie, mischievoussprite, dreamweaver
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Fey] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const Y_PROFILES = {
        flowerpixie:       { variant: 'flowerpixie',       scale: 1.7, texturePool: 'pale',    bodyColor: 0xffd0e0, accent: 0xffee66, hue: [0.92, 0.06], sat: [0.35, 0.10], lit: [0.75, 0.08] },
        mischievoussprite: { variant: 'mischievoussprite', scale: 1.6, texturePool: 'foliage', bodyColor: 0x9ad06a, accent: 0xffff88, hue: [0.28, 0.06], sat: [0.45, 0.12], lit: [0.60, 0.10] },
        dreamweaver:       { variant: 'dreamweaver',       scale: 2.0, texturePool: 'void',    bodyColor: 0xe0a0db, accent: 0xadaaff, hue: [0.72, 0.08], sat: [0.35, 0.12], lit: [0.62, 0.08] },
        // ── Level 1-5 fey on their own bespoke builds ──
        lv_dewdroppixie:   { variant: 'lv_dewdroppixie',   scale: 1.5, texturePool: 'foliage', bodyColor: 0xa8d8b8, accent: 0xbfefff, hue: [0.40, 0.06], sat: [0.35, 0.10], lit: [0.66, 0.08] },
    };

    class FeyBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = Y_PROFILES[creatureType] || Y_PROFILES.flowerpixie;
            super(scale, offsetY, battler, profile, 0, creatureType || 'flowerpixie');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0;
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
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(0xffffff, 1.0, 0.2));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 6, 6), this._mat(accent || 0x224488, 1.0, 0.2, accent)); pup.position.set(0, 0, r * 0.6); eye.add(pup);
            parent.add(eye); return eye;
        }
        _feyLimb(x, y, mat) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.42, 5), mat);
            g.position.set(x, y, 0); this.bodyGroup.add(g); return g;
        }
        _feyWing(side, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), mat); upper.scale.set(0.6, 1, 1); upper.position.set(side * 0.25, 0.15, 0);
            const lower = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), mat); lower.scale.set(0.5, 1, 1); lower.position.set(side * 0.22, -0.14, 0);
            g.add(upper, lower); g.position.set(side * 0.14, 1.25, -0.12); g.rotation.y = side * 0.5; g._side = side; this.bodyGroup.add(g); return g;
        }
        _feyBase(o) {
            o = o || {};
            const p = this.profile;
            const skin = o.mat || this._skinMat(p.bodyColor, 0.5);
            this._feyMat = skin;
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), skin); this.torso.position.set(0, 1.0, 0); this.bodyGroup.add(this.torso);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), skin); this.head.add(h);
            this._eye(this.head, -0.08, 0.02, 0.16, 0.05, o.eyeColor || 0x224488); this._eye(this.head, 0.08, 0.02, 0.16, 0.05, o.eyeColor || 0x224488);
            const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 10, Math.PI), this._mat(0xcc6677, 1, 0.4)); smile.position.set(0, -0.08, 0.18); smile.rotation.z = Math.PI; this.head.add(smile);
            if (o.ears) for (const ex of [-0.18, 0.18]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), skin); ear.position.set(ex, 0.04, 0); ear.rotation.z = ex * 2; this.head.add(ear); }
            this.head.position.set(0, 1.42, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._feyLimb(-0.16, 1.15, skin); this.rightArm = this._feyLimb(0.16, 1.15, skin);
            this.leftLeg = this._feyLimb(-0.07, 0.72, skin); this.rightLeg = this._feyLimb(0.07, 0.72, skin);
            const wingMat = this._mat(o.wingColor || 0xffffff, 0.45, 0.2, o.wingGlow || null);
            this.leftWing = this._feyWing(-1, wingMat); this.rightWing = this._feyWing(1, wingMat);
            this.aura = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), this._mat(p.accent, 0.12, 0.2, p.accent)); this.aura.position.y = 1.1; this.bodyGroup.add(this.aura);
            this._partMeshMap = {};
            ['HEAD', 'SKULL', 'BRAIN', 'FACE'].forEach(k => this._partMeshMap[k] = this.head);
            ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'PELVIS', 'MASS', 'ROBE'].forEach(k => this._partMeshMap[k] = this.torso);
            ['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_HAND'].forEach(k => this._partMeshMap[k] = this.leftArm);
            ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_HAND'].forEach(k => this._partMeshMap[k] = this.rightArm);
            ['LEFT_LEG', 'LEFT_THIGH', 'LEFT_FOOT'].forEach(k => this._partMeshMap[k] = this.leftLeg);
            ['RIGHT_LEG', 'RIGHT_THIGH', 'RIGHT_FOOT'].forEach(k => this._partMeshMap[k] = this.rightLeg);
            this._partMeshMap.LEFT_WING = this.leftWing; this._partMeshMap.RIGHT_WING = this.rightWing;
            const extra = (o.extra || []).filter(Boolean);
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.torso, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.leftWing, this.rightWing, this.aura, ...extra] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'mischievoussprite': this._buildSprite(); break;
                case 'dreamweaver':       this._buildDreamWeaver(); break;
                case 'lv_dewdroppixie':   this._buildLvDewdropPixie(); break;
                default:                  this._buildFlowerPixie(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Flower Pixie: petal skirt, flower cap, drifting pollen ─────────
        _buildFlowerPixie() {
            const p = this.profile;
            this._feyBase({ eyeColor: 0x886622, wingColor: 0xffe0f0, wingGlow: 0xffaad0 });
            // Petal skirt.
            this.skirt = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), this._mat(p.accent, 1, 0.5)); petal.position.set(Math.cos(a) * 0.14, 0.78, Math.sin(a) * 0.14); petal.rotation.x = -1.2; petal.rotation.y = a; this.skirt.add(petal); }
            this.bodyGroup.add(this.skirt);
            // Flower cap.
            this.cap = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), this._mat(p.accent, 1, 0.5)); petal.position.set(Math.cos(a) * 0.12, 1.6, Math.sin(a) * 0.12); petal.rotation.x = -0.6; this.cap.add(petal); }
            this.bodyGroup.add(this.cap);
            // Pollen motes.
            this.pollen = new THREE.Group(); this.pollen.userData.float = true; // drifting motes, meant to hang free
            for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 5), this._mat(p.accent, 0.9, 0.2, p.accent)); m.position.set((this.idRand() - 0.5) * 0.9, 0.7 + this.idRand() * 1.0, (this.idRand() - 0.5) * 0.6); m._t = this.idRand(); this.pollen.add(m); }
            this.bodyGroup.add(this.pollen);
            this._cascadeRules[0].hide.push(this.skirt, this.cap, this.pollen);
        }

        // ── Mischievous Sprite: leafy imp with a firefly glow trail ───────
        _buildSprite() {
            const p = this.profile;
            this._feyBase({ ears: true, eyeColor: 0x335511, wingColor: 0xddffcc, wingGlow: 0x99ff66 });
            // Leaf collar.
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), this._mat(p.bodyColor, 1, 0.6)); leaf.position.set(Math.cos(a) * 0.16, 1.18, Math.sin(a) * 0.16); leaf.rotation.x = -1.0; this.bodyGroup.add(leaf); }
            // Firefly motes orbiting.
            this.fireflies = new THREE.Group(); this.fireflies.userData.orbit = true;
            for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.95, 0.2, p.accent)); f._a = (i / 5) * Math.PI * 2; this.fireflies.add(f); }
            this.bodyGroup.add(this.fireflies);
            this._cascadeRules[0].hide.push(this.fireflies);
        }

        // ── Dream Weaver: ethereal fae with crescent staff and star motes ─
        _buildDreamWeaver() {
            const p = this.profile;
            this._feyBase({ eyeColor: 0x6688cc, wingColor: 0xccddff, wingGlow: 0x88bbff });
            this._feyMat.opacity = 0.85;
            // Flowing robe over the legs.
            this.robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 10, 1, true), this._mat(p.bodyColor, 0.8, 0.6)); this.robe.position.set(0, 0.6, 0); this.bodyGroup.add(this.robe);
            // Crescent moon staff.
            this.staff = new THREE.Group();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 6), this._mat(0x8a7a5a, 1, 0.6)); this.staff.add(rod);
            const moon = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 16, Math.PI * 1.3), this._mat(p.accent, 1, 0.3, p.accent)); moon.position.y = 0.5; this.staff.add(moon);
            this.staff.position.set(0.28, 1.0, 0.05); this.staff.rotation.z = -0.1; this.bodyGroup.add(this.staff);
            // Star motes.
            this.stars = new THREE.Group(); this.stars.userData.orbit = true;
            for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.04, 0), this._mat(p.accent, 0.9, 0.2, p.accent)); const a = (i / 9) * Math.PI * 2; s.position.set(Math.cos(a) * 0.7, 1.1 + Math.sin(a * 2) * 0.4, Math.sin(a) * 0.5); s._a = a; this.stars.add(s); }
            this.bodyGroup.add(this.stars);
            this._cascadeRules[0].hide.push(this.robe, this.staff, this.stars);
        }

        // ── Dewdrop Pixie: a thumb-sized pixie in a helmet of dew ───────────
        // Her head sits inside a big dewdrop with its point on top, she flies
        // on two pairs of long dragonfly wings tipped with frost, wears a skirt
        // of curled leaves, keeps a frosty pouch of dew at her hip and holds a
        // freezing droplet up over her head, ready to throw.
        _buildLvDewdropPixie() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const dew = this._mat(p.accent, 0.4, 0.05, 0x6699bb), leaf = this._mat(0x4a8a3a, 1, 0.7), frost = this._mat(0xeaffff, 0.9, 0.1, 0x88ccee);
            const limb = (x, y, len, r) => { const g = new THREE.Group(); g.position.set(x, y, 0); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.7, len, 5), skin); m.position.y = -len / 2; g.add(m); g._len = len; this.bodyGroup.add(g); return g; };
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.32, 6), skin); this.torso.position.y = 0.95; this.bodyGroup.add(this.torso);
            // Skirt of curled leaves round the hips.
            this.skirt = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const lf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), leaf); lf.scale.set(0.55, 1, 0.18); lf.position.set(Math.cos(a) * 0.1, 0.74, Math.sin(a) * 0.1); lf.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5); this.skirt.add(lf); }
            this.bodyGroup.add(this.skirt);
            // Head inside its dewdrop helmet.
            this.head = new THREE.Group(); this.head.position.set(0, 1.24, 0);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), skin));
            this._eye(this.head, -0.045, 0.01, 0.1, 0.035, 0x1a4a7a); this._eye(this.head, 0.045, 0.01, 0.1, 0.035, 0x1a4a7a);
            this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), this._mat(0x8a3a4a, 1, 0.5)); this.mouth.position.set(0, -0.055, 0.11); this.head.add(this.mouth);
            for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 4), skin); ear.position.set(sx * 0.15, 0.04, 0); ear.rotation.z = -sx * 1.2; this.head.add(ear); }
            const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), dew); bubble.position.y = 0.02; this.head.add(bubble);
            const point = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), dew); point.position.y = 0.26; this.head.add(point);
            this.bodyGroup.add(this.head);
            // Arms: the left hangs, the right holds the droplet up over her head.
            this.leftArm = limb(-0.1, 1.07, 0.26, 0.03); this.rightArm = limb(0.1, 1.07, 0.26, 0.03);
            this.rightArm.rotation.z = 2.6; this.leftArm.rotation.z = -0.25;
            this.drop = new THREE.Group(); this.drop.position.y = -0.33; this.rightArm.add(this.drop);
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), dew); this.drop.add(ball);
            const dtip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.12, 6), dew); dtip.position.y = -0.1; dtip.rotation.x = Math.PI; this.drop.add(dtip);
            // Legs, dangling as she hovers.
            this.leftLeg = limb(-0.04, 0.8, 0.4, 0.03); this.rightLeg = limb(0.04, 0.8, 0.4, 0.03);
            for (const lg of [this.leftLeg, this.rightLeg]) { const ft = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), leaf); ft.position.set(0, -0.42, 0.02); ft.rotation.x = 1.9; lg.add(ft); }
            // The pouch of dew on her belt.
            this.dustSac = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), frost); this.dustSac.position.set(0.11, 0.84, 0.05); this.bodyGroup.add(this.dustSac);
            const belt = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 3, 10), leaf); belt.rotation.x = Math.PI / 2; belt.position.y = 0.82; this.bodyGroup.add(belt);
            // Dragonfly wings: two long blades a side, pivoting at the back.
            const mkWing = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.05, 1.05, -0.08);
                for (const [ty, rz, len] of [[0.04, 0.28, 0.34], [-0.04, -0.3, 0.29]]) {
                    const w = new THREE.Mesh(new THREE.CircleGeometry(len, 8), this._mat(0xdff4ff, 0.45, 0.1, 0x88bbdd)); w.scale.set(1, 0.24, 1);
                    const holder = new THREE.Group(); holder.position.y = ty; holder.rotation.z = side * rz; w.position.x = side * len * 0.95; holder.add(w);
                    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), frost); tip.position.x = side * len * 1.85; holder.add(tip);
                    g.add(holder);
                }
                this.bodyGroup.add(g); return g;
            };
            this.leftWing = mkWing(-1); this.rightWing = mkWing(1);
            this._partMeshMap = {
                HEAD: this.head, TORSO: this.torso, BODY: this.torso, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm,
                LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing,
                PIXIE_DUST_SAC: this.dustSac, MOUTH: this.mouth
            };
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE'], hide: [this.torso, this.skirt, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.leftWing, this.rightWing, this.dustSac, belt] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['LEFT_WING'], hide: [this.leftWing] },
                { gone: ['RIGHT_WING'], hide: [this.rightWing] },
                { gone: ['PIXIE_DUST_SAC'], hide: [this.dustSac] },
                { gone: ['MOUTH'], hide: [this.mouth] },
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 2.6) * 0.07 * this.scale;
            // Buzzing wings.
            if (this.leftWing) this.leftWing.rotation.y = 0.5 + Math.sin(t * (fast ? 34 : 24)) * 0.5;
            if (this.rightWing) this.rightWing.rotation.y = -0.5 - Math.sin(t * (fast ? 34 : 24)) * 0.5;
            if (this.aura && this.aura.material) this.aura.material.opacity = 0.1 + Math.abs(Math.sin(t * 2)) * 0.08;
            if (this.leftArm) this.leftArm.rotation.z = 0.2 + Math.sin(t * 2) * 0.2;
            if (this.rightArm) this.rightArm.rotation.z = -0.2 - Math.sin(t * 2) * 0.2;

            switch (this.variant) {
                case 'flowerpixie': {
                    if (this.pollen) this.pollen.children.forEach(m => { m.position.y -= 0.008; if (m.position.y < 0.5) m.position.y = 1.7; });
                    if (this.skirt) this.skirt.rotation.y = Math.sin(t * 1.5) * 0.2;
                    break;
                }
                case 'mischievoussprite': {
                    if (this.fireflies) this.fireflies.children.forEach((f, i) => { const a = f._a + t * (fast ? 4 : 2); f.position.set(Math.cos(a) * 0.6, 1.1 + Math.sin(a * 2) * 0.4, Math.sin(a) * 0.5); f.material.emissiveIntensity = 0.5 + Math.sin(t * 6 + i) * 0.5; });
                    break;
                }
                case 'lv_dewdroppixie': {
                    // Dragonfly wings beat up and down rather than sweeping.
                    const beat = Math.sin(t * (fast ? 40 : 28)) * 0.35;
                    if (this.leftWing) this.leftWing.rotation.set(0, 0.25, -beat);
                    if (this.rightWing) this.rightWing.rotation.set(0, -0.25, beat);
                    if (this.rightArm) this.rightArm.rotation.z = 2.6 + (fast ? Math.sin(t * 9) * 0.5 : Math.sin(t * 2) * 0.08);
                    if (this.leftArm) this.leftArm.rotation.z = -0.25;
                    if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(t * 2.6) * 0.15;
                    if (this.rightLeg) this.rightLeg.rotation.x = -Math.sin(t * 2.6) * 0.15;
                    break;
                }
                case 'dreamweaver': {
                    if (this.stars) this.stars.children.forEach((s, i) => { s.rotation.y = t * 1.5 + i; s.material.emissiveIntensity = 0.4 + Math.sin(t * 3 + i) * 0.4; });
                    if (this.staff && fast) this.staff.rotation.z = -0.1 + Math.sin(t * 6) * 0.3;
                    if (this.robe) this.robe.rotation.y = Math.sin(t * 1.0) * 0.06;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.4 * this.scale;
            this.model.rotation.z = prog * 0.7;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new FeyBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = Y_PROFILES;
    reg('flowerpixie',       { aliases: ['flowerpixie'],       scale: S.flowerpixie.scale,       weapon: 0, create: make });
    reg('mischievoussprite', { aliases: ['mischievoussprite'], scale: S.mischievoussprite.scale, weapon: 0, create: make });
    reg('dreamweaver',       { aliases: ['dreamweaver'],       scale: S.dreamweaver.scale,       weapon: 0, create: make });
    reg('lv_dewdroppixie',   { aliases: ['lv_dewdroppixie'],   scale: S.lv_dewdroppixie.scale,   weapon: 0, create: make });

    const NAMED = {
        flowerpixie:       ["Flower Pixie"],
        mischievoussprite: ["Mischievous Sprite"],
        dreamweaver:       ["Dream Weaver"],
        lv_dewdroppixie:   ["Dewdrop Pixie"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Fey uniques registered');

    ;[['u_oneiricphantom',2.0]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
