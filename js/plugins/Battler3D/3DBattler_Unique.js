//=============================================================================
// 3D Battler System - Unique Bosses
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke one-off 3D models for unique/boss enemies. Assign one to a
 * specific enemy with a note tag. Requires 3DBattlerSystem (core) first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Unique Bosses
 * ============================================================================
 *
 * These are distinctive, hand-shaped models meant for specific named enemies
 * rather than whole archetype groups. Pin one to an enemy with a note tag (this
 * overrides archetype/name detection):
 *
 *   <Battler3D: cyclops>
 *   <Battler3D: lich>
 *   <Battler3D: krakenlord>
 *   <Battler3D: worldtree>
 *   <Battler3D: crystalmonarch>
 *
 * They map the common body-part keys (HEAD/TORSO/CORE/arms/legs/...) so the
 * goblin-style dismemberment still works whatever archetype the enemy uses, and
 * they reuse the per-monster-id texture / colour / shape variation.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Unique] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const UQ_PROFILES = {
        cyclops:        { variant: 'cyclops', scale: 4.4, texturePool: 'flesh', bodyColor: 0xb08868, accent: 0xffe066, hue: [0.07, 0.04], sat: [0.40, 0.12], lit: [0.50, 0.10] },
        lich:           { variant: 'lich', scale: 3.0, texturePool: 'bone', bodyColor: 0xe8e0d0, robe: 0x2a1838, accent: 0x9b40ff, hue: [0.11, 0.04], sat: [0.10, 0.06], lit: [0.80, 0.08] },
        krakenlord:     { variant: 'kraken', scale: 3.6, texturePool: 'water', bodyColor: 0x2a5a5a, accent: 0x66ffcc, hue: [0.50, 0.10], sat: [0.45, 0.15], lit: [0.30, 0.10] },
        worldtree:      { variant: 'worldtree', scale: 5.0, texturePool: 'wood', bodyColor: 0x6b4a2b, crown: 0x2f7d32, accent: 0xffd24a, hue: [0.10, 0.04], sat: [0.40, 0.12], lit: [0.34, 0.10] },
        crystalmonarch: { variant: 'monarch', scale: 4.0, texturePool: 'crystal', bodyColor: 0x8a66e0, accent: 0xfff2a0, hue: [0.74, 0.12], sat: [0.55, 0.15], lit: [0.50, 0.10] }
    };

    class UniqueBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = UQ_PROFILES[creatureType] || UQ_PROFILES.cyclops;
            super(scale, offsetY, battler, profile, 0, creatureType || 'cyclops');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._floaters = [];
            // Humanoid-shaped bosses face front; the world-tree stays angled.
            if (this.variant !== 'worldtree') this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'lich':      this._buildLich(); break;
                case 'kraken':    this._buildKraken(); break;
                case 'worldtree': this._buildWorldTree(); break;
                case 'monarch':   this._buildMonarch(); break;
                default:          this._buildCyclops(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0xffe9c0, 1.0, 0.3));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil); parent.add(eye); return eye;
        }

        // Map every common body-part key to whatever meshes exist so the enemy's
        // real archetype parts still drive dismemberment + hit-flash.
        _mapCommon(parts) {
            const m = this._partMeshMap;
            const set = (keys, mesh) => { if (mesh) keys.forEach(k => { m[k] = mesh; }); };
            set(['HEAD', 'SKULL', 'BRAIN', 'HORN', 'HORNS', 'BEAK', 'EYES', 'EYE', 'ABYSSAL_EYE', 'FACE', 'HEAD_ONE'], parts.head);
            set(['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'MANTLE', 'CEPHALOTHORAX', 'THORAX', 'MASS', 'TRASH_PILE', 'SHELL', 'NUCLEUS', 'CROWN', 'TRUNK', 'HEART_CHAMBER', 'CHASSIS'], parts.body);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'EMBER_ARMS', 'PINCER_LEFT', 'LEFT_APPENDAGE', 'TENTACLE_ONE', 'LEFT_SPIRE'], parts.leftArm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'PINCER_RIGHT', 'RIGHT_APPENDAGE', 'TENTACLE_TWO', 'RIGHT_SPIRE', 'CLAWS'], parts.rightArm);
            set(['LEFT_LEG', 'LEFT_THIGH', 'ASH_LEGS', 'FRONT_LEFT_PAW', 'FEET'], parts.leftLeg);
            set(['RIGHT_LEG', 'RIGHT_THIGH', 'GEAR_LEGS', 'FRONT_RIGHT_PAW', 'REAR_LEFT_LEG'], parts.rightLeg);
        }

        // ── Cyclops: hulking one-eyed brute with a club ──────────────────────
        _buildCyclops() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.8);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 1.4, 12), mat);
            this.body.position.set(0, 1.4, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 14), mat); this.head.add(h);
            const eye = this._eye(this.head, 0, 0.08, 0.45, 0.22, p.accent);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), mat); brow.position.set(0, 0.28, 0.42); this.head.add(brow);
            this.head.position.set(0, 2.5, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._arm(mat, -1, 0.7, 1.9);
            this.rightArm = this._arm(mat, 1, 0.7, 1.9);
            // Club in the right hand.
            const club = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 8), this.applySkin(this._mat(0x6b4a2b, 1.0, 0.9)));
            club.position.set(0.9, 0.5, 0); club.rotation.z = 0.3; this.rightArm.add(club);
            this.leftLeg = this._leg(mat, -0.3); this.rightLeg = this._leg(mat, 0.3);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
            ];
        }
        _arm(mat, side, r, y) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 1.0, 8), mat);
            upper.position.y = -0.4; g.add(upper);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mat); hand.position.y = -0.95; g.add(hand);
            g.position.set(side * r, y, 0); g.rotation.z = -side * 0.2; g._side = side;
            this.bodyGroup.add(g); return g;
        }
        _leg(mat, x) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 1.1, 8), mat); thigh.position.y = -0.55; g.add(thigh);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.5), mat); foot.position.set(0, -1.15, 0.1); g.add(foot);
            g.position.set(x, 0.7, 0); this.bodyGroup.add(g); return g;
        }

        // ── Lich: floating robed skeletal sorcerer ───────────────────────────
        _buildLich() {
            const p = this.profile;
            const boneMat = this._skinMat(p.bodyColor, 0.6);
            const robeMat = this._mat(p.robe, 0.96, 0.85);
            this.body = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 12), robeMat);
            this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), boneMat); sk.scale.set(0.9, 1.1, 0.95); this.head.add(sk);
            this._eye(this.head, -0.12, 0.02, 0.22, 0.07, p.accent);
            this._eye(this.head, 0.12, 0.02, 0.22, 0.07, p.accent);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.18), boneMat); jaw.position.set(0, -0.24, 0.1); this.head.add(jaw);
            this.head.position.set(0, 2.2, 0); this.bodyGroup.add(this.head);
            // Floating crown.
            this.crown = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 6, 12), this._mat(0xd4af37, 1.0, 0.3, p.accent));
            this.crown.position.set(0, 2.55, 0); this.crown.rotation.x = Math.PI / 2; this.bodyGroup.add(this.crown);
            this._floaters.push(this.crown);
            // Floating orb-hands.
            this.leftArm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent));
            this.leftArm.position.set(-0.7, 1.5, 0.3); this.bodyGroup.add(this.leftArm); this._floaters.push(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent));
            this.rightArm.position.set(0.7, 1.5, 0.3); this.bodyGroup.add(this.rightArm); this._floaters.push(this.rightArm);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._partMeshMap.HORN = this.crown; this._partMeshMap.HORNS = this.crown;
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.body, this.head, this.crown, this.leftArm, this.rightArm] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head, this.crown] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
            ];
        }

        // ── Kraken lord: tentacle-faced sea horror with many arms ────────────
        _buildKraken() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.3, 12), mat);
            this.body.position.set(0, 1.3, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14), mat); h.scale.set(1, 1.3, 1); this.head.add(h);
            this._eye(this.head, -0.18, 0.1, 0.32, 0.1, p.accent);
            this._eye(this.head, 0.18, 0.1, 0.32, 0.1, p.accent);
            // Face tentacles.
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI - Math.PI / 2;
                const ft = new THREE.Group(); let py = 0;
                for (let s = 0; s < 4; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.07 - s * 0.012, 8, 8), mat); seg.position.y = py; ft.add(seg); py -= 0.14; }
                ft.position.set(Math.sin(a) * 0.2, -0.2, 0.36); ft.rotation.x = 0.6; this.head.add(ft); this._floaters.push(ft);
            }
            this.head.position.set(0, 2.3, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._tentacleArm(mat, -1); this.rightArm = this._tentacleArm(mat, 1);
            // Extra lower tentacles as "legs".
            this.leftLeg = this._tentacleArm(mat, -0.5, 0.7); this.rightLeg = this._tentacleArm(mat, 0.5, 0.7);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'MANTLE'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'TENTACLE_ONE'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'TENTACLE_TWO'], hide: [this.rightArm] },
            ];
        }
        _tentacleArm(mat, side, yBase) {
            const g = new THREE.Group(); let py = 0;
            for (let s = 0; s < 6; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.14 - s * 0.018, 8, 8), mat); seg.position.set(side > 0 ? 1 : -1, py, 0).multiplyScalar(0.08 * s); py -= 0.18; g.add(seg); }
            g.position.set(Math.sign(side) * 0.5, yBase !== undefined ? yBase : 1.5, 0); g._side = Math.sign(side);
            this.bodyGroup.add(g); this._floaters.push(g); return g;
        }

        // ── World tree: colossal tree with a carved face and root-arms ───────
        _buildWorldTree() {
            const p = this.profile;
            const barkMat = this._skinMat(p.bodyColor, 1.0);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 2.4, 10), barkMat);
            this.body.position.set(0, 1.4, 0); this.bodyGroup.add(this.body);
            // Carved face on the trunk.
            this.head = new THREE.Group();
            this._eye(this.head, -0.2, 0.05, 0.42, 0.1, p.accent);
            this._eye(this.head, 0.2, 0.05, 0.42, 0.1, p.accent);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), this._mat(0x1a0f08, 1.0, 0.8)); mouth.position.set(0, -0.3, 0.42); this.head.add(mouth);
            this.head.position.set(0, 1.6, 0); this.bodyGroup.add(this.head);
            // Crown of foliage.
            this.crown = new THREE.Group();
            const crownMat = this.applySkin(this._mat(p.crown, 1.0, 0.85));
            for (const [x, y, z, r] of [[0, 3.2, 0, 1.0], [-0.7, 2.9, 0.2, 0.7], [0.68, 2.86, -0.2, 0.64], [0, 3.6, -0.2, 0.6]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), crownMat); b.position.set(x, y, z); this.crown.add(b); }
            this.bodyGroup.add(this.crown);
            // Branch arms + roots.
            this.leftArm = this._branch(barkMat, -1); this.rightArm = this._branch(barkMat, 1);
            this.leftLeg = this._root(barkMat, -0.4); this.rightLeg = this._root(barkMat, 0.4);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.leftLeg, rightLeg: this.rightLeg });
            this._partMeshMap.CROWN = this.crown;
            this._cascadeRules = [
                { gone: ['TRUNK', 'BODY', 'CORE', 'TORSO'], hide: [this.body, this.head, this.crown, this.leftArm, this.rightArm] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
            ];
        }
        _branch(mat, side) {
            const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.2, 7), mat);
            b.position.set(side * 0.5, 2.2, 0); b.rotation.z = side * 1.0; this.bodyGroup.add(b); b._side = side; return b;
        }
        _root(mat, x) {
            const r = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 6), mat);
            r.position.set(x, 0.3, 0.2); r.rotation.x = Math.PI - 0.5; this.bodyGroup.add(r); return r;
        }

        // ── Crystal monarch: towering crystal sovereign on a shard throne ────
        _buildMonarch() {
            const p = this.profile;
            const mat = this.applySkin(this._mat(p.bodyColor, 0.8, 0.2, p.bodyColor));
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 1.6, 6), mat);
            this.body.position.set(0, 1.4, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), this._mat(p.accent, 0.95, 0.15, p.accent)); this.head.add(h);
            // Crown spikes.
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), mat); sp.position.set(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2); this.head.add(sp); }
            this.head.position.set(0, 2.5, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._spire(mat, -1); this.rightArm = this._spire(mat, 1);
            // Floating shards orbiting.
            this.shards = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this._mat(p.accent, 0.9, 0.2, p.accent)); sh.position.set(Math.cos(a) * 1.0, 1.6 + Math.sin(a) * 0.3, Math.sin(a) * 1.0); this.shards.add(sh); }
            this.bodyGroup.add(this.shards); this._floaters.push(this.shards);
            this._mapCommon({ head: this.head, body: this.body, leftArm: this.leftArm, rightArm: this.rightArm, leftLeg: this.body, rightLeg: this.body });
            this._partMeshMap.CRYSTALS = this.shards; this._partMeshMap.SHIELD_CRYSTAL = this.shards;
            this._cascadeRules = [
                { gone: ['CORE', 'BODY', 'TORSO'], hide: [this.body, this.head, this.leftArm, this.rightArm, this.shards] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_SPIRE'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_SPIRE'], hide: [this.rightArm] },
                { gone: ['CRYSTALS', 'SHIELD_CRYSTAL'], hide: [this.shards] },
            ];
        }
        _spire(mat, side) {
            const s = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.1, 5), mat);
            s.position.set(side * 0.5, 1.4, 0); s.rotation.z = side * 0.5; this.bodyGroup.add(s); s._side = side; return s;
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack');
            const hitJolt = anim === 'hit' ? Math.sin(t * 24) * Math.exp(-t * 6) * 0.1 : 0;
            this.model.rotation.z = hitJolt;

            const floats = (this.variant === 'lich' || this.variant === 'monarch' || this.variant === 'kraken');
            this.model.position.y = this._baseY + Math.sin(t * 1.3) * (floats ? 0.1 : 0.03) * this.scale;

            if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 1.2) * 0.15;

            // Arm raise on attack.
            const raise = fast ? -1.0 - Math.abs(Math.sin(t * 7)) * 0.5 : -0.2;
            if (this.leftArm && this.leftArm.rotation) this.leftArm.rotation.z = (this.leftArm._side || -1) * 0.2 + (fast ? raise * 0.3 : Math.sin(t * 2) * 0.1);
            if (this.rightArm && this.rightArm.rotation) this.rightArm.rotation.z = (this.rightArm._side || 1) * 0.2 - (fast ? raise * 0.3 : Math.sin(t * 2) * 0.1);

            // Orbiting / floating bits.
            this._floaters.forEach((f, i) => {
                if (!f.visible) return;
                if (f === this.shards) f.rotation.y = t * 0.6;
                else if (f === this.crown) f.position.y = 2.55 + Math.sin(t * 2) * 0.05;
                else f.rotation.z = Math.sin(t * (fast ? 6 : 2.5) + i) * 0.3;
            });

            if (this.variant === 'monarch' || this.variant === 'lich') {
                if (this.head) this.head.rotation.x = t * 0.4;
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.3);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.6 * this.scale;
            this.model.rotation.z = prog * 0.9;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new UniqueBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = UQ_PROFILES;
    reg('cyclops',        { aliases: ['cyclops', 'cyclopes'], scale: S.cyclops.scale, weapon: 0, create: make });
    reg('lich',           { aliases: ['lich', 'liches', 'archlich'], scale: S.lich.scale, weapon: 0, create: make });
    reg('krakenlord',     { aliases: ['krakenlord', 'cthulhu', 'eldritchlord'], scale: S.krakenlord.scale, weapon: 0, create: make });
    reg('worldtree',      { aliases: ['worldtree', 'yggdrasil', 'elderent'], scale: S.worldtree.scale, weapon: 0, create: make });
    reg('crystalmonarch', { aliases: ['crystalmonarch', 'gemking', 'prismlord'], scale: S.crystalmonarch.scale, weapon: 0, create: make });

    debugLog('Unique bosses registered');
})();
