//=============================================================================
// 3D Battler System - Arachnid & Insect Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Many-legged procedural 3D battlers (spider, scorpion, insectoid,
 * insect swarm, spider-human hybrid). Requires 3DBattlerSystem first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Arachnid & Insect Family
 * ============================================================================
 *
 * Multi-legged crawlers (no physics) sharing a leg builder and the part-losing
 * engine plus per-monster-id variation from window.Battler3D.Base.
 *
 * Registered: Spider, Scorpion, Insectoid, InsectSwarm, SpiderHumanHybrid
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Arachnid] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const AR_PROFILES = {
        spider:            { variant: 'spider', scale: 2.3, texturePool: 'void', bodyColor: 0x2a2230, accent: 0xff3344, legs: 8, hue: [0.78, 0.06], sat: [0.35, 0.15], lit: [0.20, 0.08] },
        scorpion:          { variant: 'scorpion', scale: 2.4, texturePool: 'stone', bodyColor: 0x6a4a2a, accent: 0xffd24a, legs: 8, hue: [0.08, 0.05], sat: [0.45, 0.15], lit: [0.34, 0.10] },
        insectoid:         { variant: 'insectoid', scale: 2.3, texturePool: 'green', bodyColor: 0x4a6a2a, accent: 0x99ff44, legs: 6, hue: [0.28, 0.10], sat: [0.50, 0.15], lit: [0.34, 0.10] },
        insectswarm:       { variant: 'swarm', scale: 2.4, texturePool: 'void', bodyColor: 0x18262a, accent: 0x33aaff, hue: [0.12, 0.06], sat: [0.40, 0.15], lit: [0.30, 0.10] },
        spiderhumanhybrid: { variant: 'hybrid', scale: 2.8, texturePool: 'void', bodyColor: 0x3a2a3a, accent: 0xff3344, legs: 6, hue: [0.80, 0.06], sat: [0.35, 0.15], lit: [0.26, 0.08] },
        electroarachnid:   { variant: 'electroarachnid', scale: 2.5, texturePool: 'void', bodyColor: 0x1c2440, accent: 0x55ccff, legs: 8, hue: [0.58, 0.05], sat: [0.50, 0.15], lit: [0.22, 0.08] },
        marshmurkweb:      { variant: 'marshmurkweb', scale: 2.7, texturePool: 'green', bodyColor: 0x33402a, accent: 0x88aa44, legs: 8, hue: [0.27, 0.06], sat: [0.40, 0.15], lit: [0.20, 0.08] },
        silkenenchantress: { variant: 'silkenenchantress', scale: 2.8, texturePool: 'void', bodyColor: 0x4a3a52, accent: 0xeeccff, legs: 6, front: true, hue: [0.82, 0.06], sat: [0.30, 0.12], lit: [0.30, 0.08] },
        voidweaver:        { variant: 'voidweaver', scale: 2.6, texturePool: 'void', bodyColor: 0x0a0814, accent: 0xaa66ff, legs: 8, hue: [0.74, 0.05], sat: [0.45, 0.15], lit: [0.08, 0.05] },
        fleshweaverspider: { variant: 'fleshweaverspider', scale: 2.8, texturePool: 'void', bodyColor: 0x8a4a4a, accent: 0xff6666, legs: 6, front: true, hue: [0.00, 0.04], sat: [0.45, 0.15], lit: [0.34, 0.10] },
        probabilityspider: { variant: 'probabilityspider', scale: 2.4, texturePool: 'void', bodyColor: 0x303048, accent: 0x99ffee, legs: 8, hue: [0.50, 0.40], sat: [0.40, 0.20], lit: [0.30, 0.12] },
        // Level 1-5 roster, each on a build of its own.
        lv_seraphmoth:           { variant: 'lv_seraphmoth', scale: 2.0, texturePool: 'pale', bodyColor: 0xf0ece0, accent: 0xffd27a, hue: [0.12, 0.04], sat: [0.15, 0.08], lit: [0.85, 0.05] },
        lv_silkweaverapprentice: { variant: 'lv_silkweaverapprentice', scale: 2.4, texturePool: 'pale', bodyColor: 0xd8d0e0, accent: 0xf4f0ff, legs: 6, front: true, hue: [0.75, 0.05], sat: [0.15, 0.08], lit: [0.70, 0.06] }
    };

    class ArachnidBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = AR_PROFILES[creatureType] || AR_PROFILES.spider;
            super(scale, offsetY, battler, profile, 0, creatureType || 'spider');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._legs = [];
            // The spider-human hybrid has an upright torso -> face front.
            if (this.variant === 'hybrid' || profile.front) this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'scorpion':  this._buildScorpion(); break;
                case 'insectoid': this._buildInsectoid(); break;
                case 'swarm':     this._buildSwarm(); break;
                case 'hybrid':    this._buildHybrid(); break;
                case 'electroarachnid':   this._buildElectroArachnid(); break;
                case 'marshmurkweb':      this._buildMarshMurkweb(); break;
                case 'silkenenchantress': this._buildSilkenEnchantress(); break;
                case 'voidweaver':        this._buildVoidWeaver(); break;
                case 'fleshweaverspider': this._buildFleshweaverSpider(); break;
                case 'probabilityspider': this._buildProbabilitySpider(); break;
                case 'lv_seraphmoth':           this._buildSeraphMoth(); break;
                case 'lv_silkweaverapprentice': this._buildSilkWeaverApprentice(); break;
                default:          this._buildSpider(); break;
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
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            eye.position.set(x, y, z); parent.add(eye); return eye;
        }

        // One jointed leg pivoting at the body edge, splaying out then down.
        _leg(mat, x, z, outX, hipY, len) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, len, 6), mat);
            upper.position.set(outX * 0.5 * len, -len * 0.12, 0); upper.rotation.z = outX * 1.1; g.add(upper);
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.025, len * 1.1, 6), mat);
            lower.position.set(outX * 0.95 * len, -len * 0.7, 0); lower.rotation.z = outX * 0.2; g.add(lower);
            g.position.set(x, hipY, z);
            g._outX = outX;
            this.bodyGroup.add(g);
            this._legs.push(g);
            return g;
        }

        // Build N legs/side along the body's z extent; returns [left[], right[]].
        _buildLegs(mat, perSide, hipY, zFront, zBack, len) {
            const left = [], right = [];
            for (let i = 0; i < perSide; i++) {
                const z = zFront + (zBack - zFront) * (perSide === 1 ? 0.5 : i / (perSide - 1));
                left.push(this._leg(mat, -0.34, z, -1, hipY, len));
                right.push(this._leg(mat, 0.34, z, 1, hipY, len));
            }
            return { left, right };
        }

        // ── Spider ───────────────────────────────────────────────────────────
        _buildSpider() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), mat);
            this.cephalothorax.position.set(0, 0.95, 0.35); this.cephalothorax.scale.set(1.0, 0.8, 1.1);
            this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat);
            this.abdomen.position.set(0, 1.0, -0.35); this.abdomen.scale.set(1.0, 0.9, 1.2);
            this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.09 + (i % 2) * 0.18, 0.06 - Math.floor(i / 2) * 0.1, 0.14, 0.04, p.accent);
            this.head.position.set(0, 0.98, 0.66); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            const fMat = this._mat(0x111111, 1.0, 0.4);
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), fMat); f.position.set(fx, 0.86, 0.74); f.rotation.x = 0.3; this.bodyGroup.add(f); this.fangs.add(f); }
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), mat);
            this.spinnerets.position.set(0, 1.0, -0.85); this.spinnerets.rotation.x = 1.7; this.bodyGroup.add(this.spinnerets);

            const legs = this._buildLegs(mat, 4, 0.95, 0.55, -0.55, 0.55);
            this._partMeshMap.CEPHALOTHORAX = this.cephalothorax;
            this._partMeshMap.ABDOMEN = this.abdomen;
            this._partMeshMap.HEAD = this.head;
            this._partMeshMap.FANGS = this.fangs;
            this._partMeshMap.SPINNERETS = this.spinnerets;
            const order = ['LEFT_LEG', 'MID_LEFT_LEG', 'MID_REAR_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.fangs, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Scorpion ─────────────────────────────────────────────────────────
        _buildScorpion() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), mat);
            this.cephalothorax.position.set(0, 0.85, 0.2); this.cephalothorax.scale.set(1.0, 0.7, 1.3);
            this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat);
            this.abdomen.position.set(0, 0.85, -0.5); this.abdomen.scale.set(1.0, 0.7, 1.2);
            this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mat);
            this.head.position.set(0, 0.9, 0.62); this.bodyGroup.add(this.head);
            this._eye(this.head, -0.07, 0.05, 0.1, 0.04, p.accent);
            this._eye(this.head, 0.07, 0.05, 0.1, 0.04, p.accent);

            // Curling tail of segments ending in a stinger.
            this.tail = new THREE.Group();
            let ty = 0.9, tz = -0.7;
            for (let i = 0; i < 5; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 10, 10), mat);
                seg.position.set(0, ty, tz); this.tail.add(seg);
                ty += 0.16; tz += 0.02 * i;
            }
            this.bodyGroup.add(this.tail);
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 6), this._mat(p.accent, 1.0, 0.4, p.accent));
            this.stinger.position.set(0, ty + 0.05, tz + 0.18); this.stinger.rotation.x = 1.2;
            this.tail.add(this.stinger);

            // Pincers.
            this.pincerL = this._pincer(mat, -0.3); this.pincerR = this._pincer(mat, 0.3);

            const legs = this._buildLegs(mat, 4, 0.82, 0.4, -0.4, 0.5);
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR };
            const order = ['LEFT_LEG', 'MID_LEFT_LEG', 'MID_REAR_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.pincerL, this.pincerR, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail] },
                { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] },
                { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }
        _pincer(mat, x) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), mat);
            arm.position.set(x * 0.4, 0, 0.3); arm.rotation.x = 1.3; g.add(arm);
            const claw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
            claw.position.set(x * 0.6, 0, 0.6); claw.scale.set(0.7, 0.6, 1.2); g.add(claw);
            g.position.set(0, 0.85, 0);
            this.bodyGroup.add(g); return g;
        }

        // ── Insectoid ────────────────────────────────────────────────────────
        _buildInsectoid() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), mat);
            this.thorax.position.set(0, 0.95, 0.0); this.thorax.scale.set(1, 0.9, 1.2);
            this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), mat);
            this.abdomen.position.set(0, 0.95, -0.55); this.abdomen.scale.set(1, 0.9, 1.5);
            this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat); h.scale.set(1.1, 1, 0.9); this.head.add(h);
            this._eye(this.head, -0.14, 0.05, 0.16, 0.08, p.accent);
            this._eye(this.head, 0.14, 0.05, 0.16, 0.08, p.accent);
            // Antennae.
            for (const ax of [-0.08, 0.08]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), mat); a.position.set(ax, 0.28, 0.05); a.rotation.x = -0.5; this.head.add(a); }
            this.head.position.set(0, 1.0, 0.5); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            const mMat = this._mat(0x222018, 1.0, 0.5);
            for (const mx of [-0.08, 0.08]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), mMat); m.position.set(mx, 0.88, 0.72); m.rotation.x = 1.4; this.bodyGroup.add(m); this.mandibles.add(m); }

            const legs = this._buildLegs(mat, 3, 0.92, 0.4, -0.4, 0.5);
            this._partMeshMap = { HEAD: this.head, THORAX: this.thorax, ABDOMEN: this.abdomen, MANDIBLES: this.mandibles };
            const order = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [this.thorax, this.head, this.mandibles, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['MANDIBLES'], hide: [this.mandibles] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Insect swarm: a cloud of small bugs grouped into the 5 parts ──────
        _buildSwarm() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            const makeCluster = (cy, n, spread, glow) => {
                const g = new THREE.Group();
                for (let i = 0; i < n; i++) {
                    const bug = new THREE.Mesh(new THREE.SphereGeometry(0.07 + this.idRand() * 0.04, 6, 6), glow ? this._mat(p.accent, 0.95, 0.4, p.accent) : mat);
                    bug.position.set((this.idRand() - 0.5) * spread, (this.idRand() - 0.5) * spread, (this.idRand() - 0.5) * spread);
                    bug._seed = this.idRand() * 6.28;
                    g.add(bug);
                }
                g.position.y = cy;
                g.userData.float = true;   // a cloud of separate bugs, apart by design
                this.bodyGroup.add(g);
                return g;
            };
            this.abdomen = makeCluster(1.0, 10, 1.0, false);   // main mass
            this.wings = makeCluster(1.3, 6, 1.1, false);
            this.legs = makeCluster(0.7, 6, 0.9, false);
            this.mandibles = makeCluster(1.0, 4, 0.5, true);
            this.stingers = makeCluster(0.85, 4, 0.7, true);
            this._partMeshMap = { ABDOMEN: this.abdomen, WINGS: this.wings, LEGS: this.legs, MANDIBLES: this.mandibles, STINGERS: this.stingers };
            this._cascadeRules = [
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.wings, this.legs, this.mandibles, this.stingers] },
                { gone: ['WINGS'], hide: [this.wings] },
                { gone: ['LEGS'], hide: [this.legs] },
                { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['STINGERS'], hide: [this.stingers] },
            ];
        }

        // ── Spider-human hybrid: humanoid top on a spider abdomen + 6 legs ────
        _buildHybrid() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat);
            this.body.position.set(0, 0.85, -0.3); this.body.scale.set(1.1, 0.8, 1.3);
            this.bodyGroup.add(this.body);
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 10), mat);
            this.torso.position.set(0, 1.35, 0.1); this.bodyGroup.add(this.torso);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), mat); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.2, 0.05, p.accent);
            this._eye(this.head, 0.1, 0.05, 0.2, 0.05, p.accent);
            this.head.position.set(0, 1.8, 0.1); this.bodyGroup.add(this.head);
            // Arms.
            for (const ax of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 8), mat);
                arm.position.set(ax * 0.32, 1.4, 0.1); arm.rotation.z = ax * 0.5; this.bodyGroup.add(arm);
                if (ax < 0) this._leftArmMesh = arm; else this._rightArmMesh = arm;
            }
            const legs = this._buildLegs(mat, 3, 0.82, 0.2, -0.7, 0.6);
            this._partMeshMap = { BODY: this.body, TORSO: this.torso, HEAD: this.head, LEFT_ARM: this._leftArmMesh, RIGHT_ARM: this._rightArmMesh };
            const order = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.torso, this.head, this._leftArmMesh, this._rightArmMesh, ...this._legs] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this._leftArmMesh, this._rightArmMesh] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this._leftArmMesh] },
                { gone: ['RIGHT_ARM'], hide: [this._rightArmMesh] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // Shared 8-leg spider wiring helper used by several variants below.
        _wireSpider8(legs) {
            const order = ['LEFT_LEG', 'MID_LEFT_LEG', 'MID_REAR_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            return order.concat(orderR);
        }

        // ── Electro Arachnid: electric-blue spider, arc nodes on glands/legs ──
        _buildElectroArachnid() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.35);
            const sparkMat = this._mat(p.accent, 1.0, 0.2, p.accent);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), mat);
            this.cephalothorax.position.set(0, 0.95, 0.35); this.cephalothorax.scale.set(1.0, 0.75, 1.1);
            this.bodyGroup.add(this.cephalothorax);
            // Bloated abdomen ringed with capacitor nodes.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 14), mat);
            this.abdomen.position.set(0, 1.02, -0.4); this.abdomen.scale.set(1.0, 1.0, 1.15);
            this.bodyGroup.add(this.abdomen);
            this._arcNodes = [];
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * 6.28;
                const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), sparkMat);
                // Abdomen-local: a ring of terminals studding its equator.
                node.position.set(Math.cos(a) * 0.5, Math.sin(a * 3) * 0.12, Math.sin(a) * 0.5);
                this.abdomen.add(node); this._arcNodes.push(node);
            }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.09 + (i % 2) * 0.18, 0.06 - Math.floor(i / 2) * 0.1, 0.14, 0.045, p.accent);
            this.head.position.set(0, 0.98, 0.66); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), sparkMat); f.position.set(fx, 0.86, 0.72); f.rotation.x = 0.4; this.bodyGroup.add(f); this.fangs.add(f); }
            // Silk glands glowing as twin arc terminals.
            this.spinnerets = new THREE.Group();
            for (const sx of [-0.1, 0.1]) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), sparkMat); s.position.set(sx, 1.0, -0.88); s.rotation.x = 1.7; this.bodyGroup.add(s); this.spinnerets.add(s); }

            const legs = this._buildLegs(mat, 4, 0.95, 0.55, -0.55, 0.6);
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, FANGS: this.fangs, SPINNERETS: this.spinnerets };
            const legKeys = this._wireSpider8(legs);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.fangs, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legKeys.map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Marsh Murkweb: bloated swamp spider, algae drapes on legs ────────
        _buildMarshMurkweb() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.85);
            const algaeMat = this._mat(p.accent, 0.9, 0.95);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), mat);
            this.cephalothorax.position.set(0, 0.78, 0.3); this.cephalothorax.scale.set(1.1, 0.6, 1.0);
            this.bodyGroup.add(this.cephalothorax);
            // Massively bloated, sagging abdomen.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 14), mat);
            this.abdomen.position.set(0, 0.82, -0.55); this.abdomen.scale.set(1.2, 1.0, 1.3);
            this.bodyGroup.add(this.abdomen);
            // Algae blobs draped over the abdomen.
            for (let i = 0; i < 5; i++) {
                const blob = new THREE.Mesh(new THREE.SphereGeometry(0.12 + this.idRand() * 0.08, 6, 6), algaeMat);
                blob.position.set((this.idRand() - 0.5) * 0.7, 0.3 + this.idRand() * 0.2, (this.idRand() - 0.5) * 0.6);
                blob.scale.set(1, 0.5, 1); this.abdomen.add(blob);
            }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), mat); h.scale.set(1, 0.8, 1); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.08 + (i % 2) * 0.16, 0.04 - Math.floor(i / 2) * 0.08, 0.16, 0.04, p.accent);
            this.head.position.set(0, 0.82, 0.62); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            const fMat = this._mat(0x1a1410, 1.0, 0.6);
            for (const fx of [-0.07, 0.07]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), fMat); f.position.set(fx, 0.7, 0.7); f.rotation.x = 0.3; this.bodyGroup.add(f); this.fangs.add(f); }
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 6), mat);
            this.spinnerets.position.set(0, 0.82, -1.1); this.spinnerets.rotation.x = 1.7; this.bodyGroup.add(this.spinnerets);

            const legs = this._buildLegs(mat, 4, 0.78, 0.55, -0.6, 0.75);
            // Dangle algae strands from each leg hip.
            this._legs.forEach(leg => {
                const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.005, 0.5, 4), algaeMat);
                strand.position.set(leg._outX * 0.4, -0.5, 0); leg.add(strand);
            });
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, FANGS: this.fangs, SPINNERETS: this.spinnerets };
            const legKeys = this._wireSpider8(legs);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.fangs, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legKeys.map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Silken Enchantress: graceful drider, female torso + 6 legs ───────
        _buildSilkenEnchantress() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            const skin = this._skinMat(0xddc0a8, 0.6);
            // Sleek silk-spinning abdomen.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 14), mat);
            this.body.position.set(0, 0.8, -0.35); this.body.scale.set(1.0, 0.85, 1.4);
            this.bodyGroup.add(this.body);
            // Silk thread trailing from the spinneret.
            const silk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), this._mat(p.accent, 0.7, 0.9, p.accent));
            silk.position.set(0, -0.3, -0.44); silk.rotation.x = 0.4; this.body.add(silk);
            // Slim feminine torso, curved waist via tapered cylinder.
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.65, 12), skin);
            this.torso.position.set(0, 1.35, 0.05); this.bodyGroup.add(this.torso);
            // Bust hint.
            for (const bx of [-0.08, 0.08]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skin); b.position.set(bx, 0.13, 0.13); this.torso.add(b); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skin); this.head.add(h);
            // Flowing silk hair.
            const hair = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 10), this._mat(p.accent, 0.85, 0.7));
            hair.position.set(0, 0.05, -0.08); hair.scale.set(1, 1.2, 1.1); this.head.add(hair);
            this._eye(this.head, -0.08, 0.02, 0.18, 0.04, p.accent);
            this._eye(this.head, 0.08, 0.02, 0.18, 0.04, p.accent);
            this.head.position.set(0, 1.82, 0.05); this.bodyGroup.add(this.head);
            // Graceful arms raised as if weaving.
            for (const ax of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.6, 8), skin);
                arm.position.set(ax * 0.28, 1.45, 0.15); arm.rotation.z = ax * 0.8; arm.rotation.x = -0.4; this.bodyGroup.add(arm);
                if (ax < 0) this._leftArmMesh = arm; else this._rightArmMesh = arm;
            }
            const legs = this._buildLegs(mat, 3, 0.76, 0.25, -0.7, 0.7);
            this._partMeshMap = { BODY: this.body, TORSO: this.torso, HEAD: this.head, LEFT_ARM: this._leftArmMesh, RIGHT_ARM: this._rightArmMesh };
            const order = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.torso, this.head, this._leftArmMesh, this._rightArmMesh, ...this._legs] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this._leftArmMesh, this._rightArmMesh] },
                { gone: ['HEAD'], hide: [this.head] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Void Weaver: cosmic-horror spider, void-black with starry abdomen ─
        _buildVoidWeaver() {
            const p = this.profile;
            const mat = this._mat(p.bodyColor, 0.85, 0.2);
            this.cephalothorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat);
            this.cephalothorax.position.set(0, 0.95, 0.35); this.cephalothorax.scale.set(1.0, 0.8, 1.1);
            this.bodyGroup.add(this.cephalothorax);
            // Starry abdomen: dark sphere studded with glowing star points.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 16), mat);
            this.abdomen.position.set(0, 1.0, -0.4); this.abdomen.scale.set(1.0, 0.95, 1.2);
            this.bodyGroup.add(this.abdomen);
            const starMat = this._mat(0xffffff, 1.0, 0.1, 0xffffff);
            for (let i = 0; i < 16; i++) {
                const star = new THREE.Mesh(new THREE.SphereGeometry(0.02 + this.idRand() * 0.02, 5, 5), Math.random() < 0.4 ? this._mat(p.accent, 1.0, 0.1, p.accent) : starMat);
                const u = this.idRand() * 6.28, v = this.idRand() * Math.PI;
                star.position.set(Math.sin(v) * Math.cos(u) * 0.5, Math.sin(v) * Math.sin(u) * 0.48, Math.cos(v) * 0.6);
                this.abdomen.add(star);
            }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat); this.head.add(h);
            for (let i = 0; i < 6; i++) this._eye(this.head, -0.12 + (i % 3) * 0.12, 0.06 - Math.floor(i / 3) * 0.1, 0.14, 0.04, p.accent);
            this.head.position.set(0, 0.98, 0.66); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            const fMat = this._mat(p.accent, 1.0, 0.3, p.accent);
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), fMat); f.position.set(fx, 0.85, 0.72); f.rotation.x = 0.4; this.bodyGroup.add(f); this.fangs.add(f); }
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 6), fMat);
            this.spinnerets.position.set(0, 1.0, -0.92); this.spinnerets.rotation.x = 1.7; this.bodyGroup.add(this.spinnerets);

            const legs = this._buildLegs(mat, 4, 0.95, 0.55, -0.55, 0.65);
            // Half-phased legs: rear pair semi-transparent.
            this._legs.forEach((leg, i) => { if (i >= 4) leg.children.forEach(c => { if (c.material) { c.material = this._mat(p.bodyColor, 0.4, 0.2); } }); });
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, FANGS: this.fangs, SPINNERETS: this.spinnerets };
            const legKeys = this._wireSpider8(legs);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.fangs, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legKeys.map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Fleshweaver Spider: drider with raw fleshy humanoid torso ────────
        _buildFleshweaverSpider() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.55);
            const raw = this._mat(0xaa3333, 1.0, 0.4);
            // Pulsing fleshy abdomen.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), flesh);
            this.body.position.set(0, 0.85, -0.3); this.body.scale.set(1.15, 0.85, 1.3);
            this.bodyGroup.add(this.body);
            // Sinew bumps.
            for (let i = 0; i < 5; i++) { const sin = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), raw); sin.position.set((this.idRand() - 0.5) * 0.6, 0.1 + this.idRand() * 0.2, (this.idRand() - 0.5) * 0.5); this.body.add(sin); }
            // Raw exposed-muscle torso.
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.72, 10), raw);
            this.torso.position.set(0, 1.35, 0.1); this.bodyGroup.add(this.torso);
            // Visible ribs.
            for (let i = 0; i < 3; i++) { const y = -0.18 + i * 0.16; const rib = new THREE.Mesh(new THREE.TorusGeometry(0.29 - y * 0.083 + 0.012, 0.025, 6, 12, Math.PI), this._mat(0xe8d8c0, 1.0, 0.5)); rib.position.set(0, y, 0); rib.rotation.x = Math.PI / 2; this.torso.add(rib); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), flesh); this.head.add(h);
            // Gaping fanged maw.
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(0x330000, 1.0, 0.5)); maw.position.set(0, -0.05, 0.18); this.head.add(maw);
            this._eye(this.head, -0.09, 0.07, 0.18, 0.05, p.accent);
            this._eye(this.head, 0.09, 0.07, 0.18, 0.05, p.accent);
            this.head.position.set(0, 1.82, 0.1); this.bodyGroup.add(this.head);
            // Arms holding a skin-tapestry strand.
            for (const ax of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.62, 8), raw);
                arm.position.set(ax * 0.34, 1.4, 0.15); arm.rotation.z = ax * 0.6; arm.rotation.x = -0.3; this.bodyGroup.add(arm);
                if (ax < 0) this._leftArmMesh = arm; else this._rightArmMesh = arm;
            }
            const tapestry = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), this._mat(0xcc8866, 0.9, 0.7));
            tapestry.position.set(0, 1.25, 0.45); tapestry.material.side = THREE.DoubleSide; this.bodyGroup.add(tapestry);
            const legs = this._buildLegs(flesh, 3, 0.82, 0.2, -0.7, 0.65);
            this._partMeshMap = { BODY: this.body, TORSO: this.torso, HEAD: this.head, LEFT_ARM: this._leftArmMesh, RIGHT_ARM: this._rightArmMesh };
            const order = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.torso, this.head, this._leftArmMesh, this._rightArmMesh, tapestry, ...this._legs] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this._leftArmMesh, this._rightArmMesh, tapestry] },
                { gone: ['HEAD'], hide: [this.head] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ── Probability Spider: shimmering translucent quantum arachnid ──────
        _buildProbabilitySpider() {
            const p = this.profile;
            const mat = this._mat(p.bodyColor, 0.45, 0.1, p.accent);
            this.cephalothorax = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), mat);
            this.cephalothorax.position.set(0, 0.95, 0.35); this.cephalothorax.scale.set(1.0, 0.8, 1.1);
            this.bodyGroup.add(this.cephalothorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), mat);
            this.abdomen.position.set(0, 1.0, -0.35); this.abdomen.scale.set(1.0, 0.9, 1.2);
            this.bodyGroup.add(this.abdomen);
            // Probability cloud: ghostly duplicate abdomens flickering nearby.
            this._ghosts = [];
            for (let i = 0; i < 3; i++) {
                const gh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), this._mat(p.accent, 0.15, 0.1, p.accent));
                gh.position.set((this.idRand() - 0.5) * 0.4, 0, 0);
                gh._seed = this.idRand() * 6.28; this.abdomen.add(gh); this._ghosts.push(gh);
            }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), mat); this.head.add(h);
            for (let i = 0; i < 4; i++) this._eye(this.head, -0.09 + (i % 2) * 0.18, 0.06 - Math.floor(i / 2) * 0.1, 0.14, 0.045, p.accent);
            this.head.position.set(0, 0.98, 0.66); this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            const fMat = this._mat(p.accent, 0.6, 0.2, p.accent);
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), fMat); f.position.set(fx, 0.86, 0.72); f.rotation.x = 0.4; this.bodyGroup.add(f); this.fangs.add(f); }
            this.spinnerets = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 6), mat);
            this.spinnerets.position.set(0, 1.0, -0.85); this.spinnerets.rotation.x = 1.7; this.bodyGroup.add(this.spinnerets);

            const legs = this._buildLegs(mat, 4, 0.95, 0.55, -0.55, 0.55);
            // Flickering translucent legs.
            this._legs.forEach((leg, i) => { leg._flicker = this.idRand() * 6.28; });
            this._partMeshMap = { CEPHALOTHORAX: this.cephalothorax, ABDOMEN: this.abdomen, HEAD: this.head, FANGS: this.fangs, SPINNERETS: this.spinnerets };
            const legKeys = this._wireSpider8(legs);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: [this.cephalothorax, this.head, this.fangs, ...this._legs] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.spinnerets] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['SPINNERETS'], hide: [this.spinnerets] },
                ...legKeys.map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        // ════ Level 1-5 roster ═══════════════════════════════════════════════

        // A tapered rod between two points of the parent's space.
        _rod(parent, mat, a, b, r0, r1, sides) {
            return this.addStrut(parent, mat, new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2]), r0, r1, sides || 5);
        }

        // ── Seraph Moth: a six-winged white moth that carries its own votive
        // candle, a halo over its head and a flutter of lesser moths about it.
        _buildSeraphMoth() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9);
            const gold = this._mat(p.accent, 1.0, 0.3, p.accent);
            const wingMat = this._mat(0xf6f2e8, 0.85, 0.6); wingMat.side = THREE.DoubleSide;
            const dark = this._mat(0x3a3020, 1.0, 0.6);
            this._smGlow = [gold];
            // ABDOMEN: the furred body, thick end forward.
            this.abdomen = new THREE.Group(); this.bodyGroup.add(this.abdomen);
            const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur); thorax.position.set(0, 1.3, 0.1); this.abdomen.add(thorax);
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.05, 0.6, 6), fur); tail.position.set(0, 1.26, -0.24); tail.rotation.x = Math.PI / 2; this.abdomen.add(tail);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fur); head.position.set(0, 1.32, 0.36); this.abdomen.add(head);
            this._eye(this.abdomen, -0.07, 1.34, 0.45, 0.035); this._eye(this.abdomen, 0.07, 1.34, 0.45, 0.035);
            for (const s of [-1, 1]) {
                this._rod(this.abdomen, dark, [s * 0.04, 1.42, 0.4], [s * 0.2, 1.62, 0.5], 0.01, 0.007, 3);
                for (let k = 1; k <= 3; k++) { const f = k / 4; this._rod(this.abdomen, dark, [s * (0.04 + 0.16 * f), 1.42 + 0.2 * f, 0.4 + 0.1 * f], [s * (0.09 + 0.16 * f), 1.4 + 0.2 * f, 0.46 + 0.1 * f], 0.005, 0.003, 3); }
            }
            // MANDIBLES: the coiled proboscis and two palps.
            this.mandibles = new THREE.Group(); this.bodyGroup.add(this.mandibles);
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 8, Math.PI * 1.6), dark); coil.position.set(0, 1.2, 0.42); coil.rotation.y = Math.PI / 2; this.mandibles.add(coil);
            for (const s of [-1, 1]) this._rod(this.mandibles, fur, [s * 0.04, 1.26, 0.44], [s * 0.05, 1.18, 0.5], 0.015, 0.008, 4);
            // WINGS: three pairs like a seraph's, one raised, one spread, one
            // lowered, each hinged on the thorax so the beat swings the tip only.
            this.wings = new THREE.Group(); this.bodyGroup.add(this.wings);
            this._smWings = [];
            const pairs = [
                { y: 1.38, z: 0.14, lift: 1.0, sweep: -0.2, len: 0.75, w: 0.45 },
                { y: 1.32, z: 0.06, lift: 0.05, sweep: 0.25, len: 0.95, w: 0.55 },
                { y: 1.24, z: -0.02, lift: -0.7, sweep: 0.6, len: 0.7, w: 0.4 }
            ];
            const spotMat = this._mat(p.accent, 1.0, 0.3, p.accent); spotMat.side = THREE.DoubleSide; this._smGlow.push(spotMat);
            pairs.forEach((d, i) => {
                for (const s of [-1, 1]) {
                    const g = new THREE.Group(); g.position.set(s * 0.1, d.y, d.z); g.rotation.z = s * d.lift;
                    const blade = new THREE.Group(); blade.rotation.y = s * d.sweep; g.add(blade);
                    const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), wingMat); m.scale.set(d.len, d.w, 1); m.rotation.x = -Math.PI / 2; m.position.x = s * d.len * 0.47; blade.add(m);
                    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), spotMat); spot.position.set(s * d.len * 0.62, 0.006, 0); spot.rotation.x = -Math.PI / 2; blade.add(spot);
                    g._side = s; g._lift = d.lift; g._phase = i * 0.7;
                    this.wings.add(g); this._smWings.push(g);
                }
            });
            // A halo hanging over the head, apart from it by design.
            this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 4, 16), gold); this.halo.position.set(0, 1.62, 0.3); this.halo.rotation.x = Math.PI / 2; this.halo.userData.float = true; this.bodyGroup.add(this.halo);
            // LEGS: six thin legs gripping the rim of the candle it carries.
            this.legsGroup = new THREE.Group(); this.bodyGroup.add(this.legsGroup);
            const wax = this._mat(0xf4ecd8, 1.0, 0.7);
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 8), wax); candle.position.set(0, 0.62, 0.08); this.legsGroup.add(candle);
            for (const [x, z] of [[0.08, 0.12], [-0.06, 0.02]]) { const drip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), wax); drip.position.set(x, 0.74, z); drip.scale.y = 1.8; this.legsGroup.add(drip); }
            this._rod(this.legsGroup, dark, [0, 0.78, 0.08], [0, 0.86, 0.08], 0.008, 0.008, 3);
            this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), this._mat(0xffa83a, 0.95, 0.3, 0xff8a1a)); this.flame.position.set(0, 0.91, 0.08); this.legsGroup.add(this.flame);
            for (const z of [0.18, 0.1, 0.02]) for (const s of [-1, 1]) {
                const hip = [s * 0.06, 1.16, z], knee = [s * 0.2, 1.0, z], foot = [s * 0.08, 0.76, 0.08 + (z - 0.1) * 0.4];
                this._rod(this.legsGroup, dark, hip, knee, 0.014, 0.011, 4); this._rod(this.legsGroup, dark, knee, foot, 0.011, 0.007, 4);
            }
            // STINGERS: tassels of wing powder trailing off the tail.
            this.stingers = new THREE.Group(); this.bodyGroup.add(this.stingers);
            for (const s of [-1, 0, 1]) { const tas = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 4), fur); tas.position.set(s * 0.04, 1.22, -0.6); tas.rotation.x = -Math.PI / 2 - 0.4; tas.rotation.z = s * 0.3; this.stingers.add(tas); }
            // The lesser moths, circling: meant to hang in the air.
            this._smSwarm = new THREE.Group(); this._smSwarm.userData.float = true; this._smSwarm.position.set(0, 1.2, 0); this.bodyGroup.add(this._smSwarm);
            const mini = this._mat(0xf6f2e8, 0.9, 0.6); mini.side = THREE.DoubleSide;
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2, rr = 0.85 + this.idRand() * 0.35;
                const g = new THREE.Group(); g.position.set(Math.cos(a) * rr, (this.idRand() - 0.5) * 0.9, Math.sin(a) * rr); g.rotation.y = -a;
                g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), fur));
                for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.06, 3), mini); w.position.set(s * 0.05, 0, 0); w.rotation.x = -Math.PI / 2 + s * 0.4; g.add(w); }
                this._smSwarm.add(g);
            }
            this._partMeshMap = { ABDOMEN: this.abdomen, WINGS: this.wings, LEGS: this.legsGroup, MANDIBLES: this.mandibles, STINGERS: this.stingers };
            this._cascadeRules = [
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.wings, this.legsGroup, this.mandibles, this.stingers, this.halo] },
                { gone: ['WINGS'], hide: [this.wings] },
                { gone: ['LEGS'], hide: [this.legsGroup] },
                { gone: ['MANDIBLES'], hide: [this.mandibles] },
                { gone: ['STINGERS'], hide: [this.stingers] }
            ];
        }

        // ── Silk Weaver Apprentice: a young drider hunched over a clumsy tangle
        // of silk, her hair pinned up with two of her own shed leg-tips.
        _buildSilkWeaverApprentice() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.45);
            const skin = this._skinMat(0xe8dcd0, 0.6);
            const mark = this._mat(0x5a3a6a, 1.0, 0.5), hair = this._mat(0x2a1a3a, 1.0, 0.8);
            const silk = this._mat(p.accent, 0.75, 0.9, 0x222233); silk.side = THREE.DoubleSide;
            // BODY: a small round abdomen with an hourglass on its back.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), chitin); this.body.position.set(0, 0.66, -0.46); this.body.scale.set(1, 0.85, 1.2); this.bodyGroup.add(this.body);
            for (const z of [0.07, -0.07]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.1), mark); b.position.set(0, 0.37, z); b.rotation.y = Math.PI / 4; this.body.add(b); }
            // Sticky thread from the spinnerets to a tangle of web on the floor.
            this._rod(this.body, silk, [0, -0.1, -0.37], [0, -0.78, -0.6], 0.01, 0.01, 3);
            const web = new THREE.Mesh(new THREE.CircleGeometry(0.18, 6), silk); web.position.set(0, -0.775, -0.6); web.rotation.x = -Math.PI / 2; this.body.add(web);
            const joint = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), chitin); joint.position.set(0, 0.7, -0.04); this.bodyGroup.add(joint);
            // TORSO: slim and hunched, a silk shawl about the shoulders.
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.5, 8), skin); this.torso.position.set(0, 1.02, 0.02); this.torso.rotation.x = 0.15; this.bodyGroup.add(this.torso);
            const shawl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.14, 8, 1, true), silk); shawl.position.set(0, 0.16, 0); this.torso.add(shawl);
            // HEAD: four eyes in a row, a bun skewered by two leg-tips.
            this.head = new THREE.Group(); this.head.position.set(0, 1.4, 0.08); this.bodyGroup.add(this.head);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin));
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); cap.position.set(0, 0.01, -0.02); cap.rotation.x = -0.35; this.head.add(cap);
            const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), hair); bun.position.set(0, 0.12, -0.12); this.head.add(bun);
            this._rod(this.head, chitin, [-0.13, 0.06, -0.1], [0.14, 0.2, -0.15], 0.012, 0.004, 4);
            this._rod(this.head, chitin, [0.12, 0.05, -0.08], [-0.12, 0.22, -0.16], 0.012, 0.004, 4);
            this._eye(this.head, -0.045, 0.02, 0.125, 0.028); this._eye(this.head, 0.045, 0.02, 0.125, 0.028);
            this._eye(this.head, -0.09, 0.06, 0.1, 0.017); this._eye(this.head, 0.09, 0.06, 0.1, 0.017);
            this.fangs = new THREE.Group(); this.head.add(this.fangs);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, 4), chitin); f.position.set(s * 0.025, -0.1, 0.1); f.rotation.x = Math.PI; this.fangs.add(f); }
            // Both arms and the tangle hang off one shoulder rig, so they fidget together.
            this._armRig = new THREE.Group(); this._armRig.position.set(0, 1.22, 0.04); this.bodyGroup.add(this._armRig);
            const hands = [];
            for (const s of [-1, 1]) {
                const arm = new THREE.Group(); arm.position.set(s * 0.15, 0, 0); this._armRig.add(arm);
                this._rod(arm, skin, [0, 0, 0], [s * 0.1, -0.2, 0.12], 0.04, 0.032, 6);
                this._rod(arm, skin, [s * 0.1, -0.2, 0.12], [-s * 0.03, -0.24, 0.3], 0.032, 0.026, 6);
                const hand = new THREE.Group(); hand.position.set(-s * 0.03, -0.24, 0.3); arm.add(hand);
                hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), skin));
                for (const k of [-1, 0, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.07, 3), skin); f.position.set(-s * 0.03, k * 0.02, 0.03); f.rotation.z = s * Math.PI / 2; hand.add(f); }
                hands.push(hand);
            }
            this.leftHand = hands[0]; this.rightHand = hands[1];
            this.tangle = new THREE.Group(); this.tangle.position.set(0, -0.24, 0.36); this._armRig.add(this.tangle);
            const snarl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), this._mat(p.accent, 0.7, 0.9)); snarl.material.wireframe = true; this.tangle.add(snarl);
            this.tangle.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), silk));
            // Six spider legs set along the abdomen's flanks.
            const legs = { left: [], right: [] };
            for (const [z, hx] of [[-0.22, 0.26], [-0.46, 0.3], [-0.7, 0.26]]) {
                legs.left.push(this._leg(chitin, -hx, z, -1, 0.62, 0.5)); legs.right.push(this._leg(chitin, hx, z, 1, 0.62, 0.5));
            }
            this._partMeshMap = { BODY: this.body, TORSO: this.torso, HEAD: this.head, LEFT_HAND: this.leftHand, RIGHT_HAND: this.rightHand, FANGS: this.fangs };
            const order = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'];
            const orderR = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            legs.left.forEach((l, i) => { this._partMeshMap[order[i]] = l; });
            legs.right.forEach((l, i) => { this._partMeshMap[orderR[i]] = l; });
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, joint, this.torso, this.head, this._armRig, ...this._legs] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this._armRig] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['LEFT_HAND'], hide: [this.leftHand] },
                { gone: ['RIGHT_HAND'], hide: [this.rightHand] },
                ...order.concat(orderR).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack');
            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.15 : 0;
            this.model.rotation.z = hitJolt;
            this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 8 : 2.5))) * (fast ? 0.08 : 0.02) * this.scale;

            // Scuttle: legs wiggle with alternating phase.
            const rate = fast ? 9 : 3;
            this._legs.forEach((leg, i) => {
                if (!leg.visible) return;
                leg.rotation.x = Math.sin(t * rate + i * 0.8) * (fast ? 0.3 : 0.12);
            });

            if (this.variant === 'scorpion' && this.tail && this.tail.visible) {
                this.tail.rotation.x = (fast ? -0.4 : 0) + Math.sin(t * (fast ? 7 : 2)) * 0.15;
            }
            if (this.variant === 'swarm') {
                [this.abdomen, this.wings, this.legs, this.mandibles, this.stingers].forEach((cl, ci) => {
                    if (!cl || !cl.visible) return;
                    cl.children.forEach(b => {
                        const s = b._seed || 0;
                        b.position.x += Math.sin(t * 4 + s) * 0.004;
                        b.position.y += Math.cos(t * 5 + s) * 0.004;
                    });
                    cl.rotation.y = t * (0.4 + ci * 0.1);
                });
            }
            if (this.variant === 'electroarachnid' && this._arcNodes) {
                this._arcNodes.forEach((n, i) => {
                    const f = 0.7 + Math.abs(Math.sin(t * 6 + i)) * 0.6;
                    if (n.material) n.material.emissiveIntensity = f;
                    n.scale.setScalar(0.8 + Math.sin(t * 8 + i) * 0.25);
                });
            }
            if (this.variant === 'probabilityspider') {
                if (this._ghosts) this._ghosts.forEach(g => {
                    g.position.x = (Math.sin(t * 3 + g._seed) * 0.25);
                    if (g.material) g.material.opacity = 0.05 + Math.abs(Math.sin(t * 2 + g._seed)) * 0.2;
                });
                this._legs.forEach(leg => { if (!leg.visible) return; leg.children.forEach(c => { if (c.material) c.material.opacity = 0.3 + Math.abs(Math.sin(t * 5 + (leg._flicker || 0))) * 0.55; }); });
            }
            if (this.variant === 'lv_seraphmoth') {
                if (this._smWings) this._smWings.forEach(w => { if (w.visible) w.rotation.z = w._side * (w._lift + Math.sin(t * (fast ? 16 : 6) + w._phase) * 0.3); });
                if (this._smSwarm) this._smSwarm.rotation.y = t * (fast ? 2.4 : 0.8);
                if (this.halo) this.halo.position.y = 1.62 + Math.sin(t * 1.5) * 0.03;
                if (this.flame) this.flame.scale.set(1, 0.85 + Math.abs(Math.sin(t * 9)) * 0.3, 1);
                if (this._smGlow) this._smGlow[0].emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2)) * 0.4;
            }
            if (this.variant === 'lv_silkweaverapprentice') {
                if (this._armRig && this._armRig.visible) this._armRig.rotation.x = fast ? -Math.abs(Math.sin(t * 6)) * 0.5 : Math.sin(t * 1.8) * 0.08;
                if (this.tangle) this.tangle.rotation.y = t * 0.6;
                if (this.head) this.head.rotation.z = Math.sin(t * 1.2) * 0.08;
            }
            if (this.variant === 'voidweaver' && this.abdomen && this.abdomen.visible) {
                this.abdomen.children.forEach((s, i) => { if (s.material && s.material.emissive) s.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 4 + i * 1.3)) * 0.7; });
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.3 * this.scale;
            // Legs curl inward on death.
            this._legs.forEach((leg, i) => { if (leg.visible) leg.rotation.x = prog * (leg._outX || 1) * 1.2; });
            if (this.variant === 'swarm') this.model.rotation.y = prog * 4;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ArachnidBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = AR_PROFILES;
    reg('spider',            { aliases: ['spider', 'spiders', 'arachnid', 'tarantula'], scale: S.spider.scale, weapon: 0, create: make });
    reg('scorpion',          { aliases: ['scorpion', 'scorpions'], scale: S.scorpion.scale, weapon: 0, create: make });
    reg('insectoid',         { aliases: ['insectoid', 'insect', 'insects', 'bug', 'beetle', 'ant', 'mantis'], scale: S.insectoid.scale, weapon: 0, create: make });
    reg('insectswarm',       { aliases: ['insectswarm', 'swarm', 'locusts', 'bees', 'hornets'], scale: S.insectswarm.scale, weapon: 0, create: make });
    reg('spiderhumanhybrid', { aliases: ['spiderhumanhybrid', 'arachne', 'driderr'], scale: S.spiderhumanhybrid.scale, weapon: 0, create: make });
    reg('electroarachnid',   { aliases: ['electroarachnid'], scale: S.electroarachnid.scale, weapon: 0, create: make });
    reg('marshmurkweb',      { aliases: ['marshmurkweb'], scale: S.marshmurkweb.scale, weapon: 0, create: make });
    reg('silkenenchantress', { aliases: ['silkenenchantress'], scale: S.silkenenchantress.scale, weapon: 0, create: make });
    reg('voidweaver',        { aliases: ['voidweaver'], scale: S.voidweaver.scale, weapon: 0, create: make });
    reg('fleshweaverspider', { aliases: ['fleshweaverspider'], scale: S.fleshweaverspider.scale, weapon: 0, create: make });
    reg('probabilityspider', { aliases: ['probabilityspider'], scale: S.probabilityspider.scale, weapon: 0, create: make });
    // Level 1-5 roster.
    reg('lv_seraphmoth',           { aliases: ['lv_seraphmoth'],           scale: S.lv_seraphmoth.scale,           weapon: 0, create: make });
    reg('lv_silkweaverapprentice', { aliases: ['lv_silkweaverapprentice'], scale: S.lv_silkweaverapprentice.scale, weapon: 0, create: make });

    const NAMED = {
        electroarachnid:   ["Electro Arachnid"],
        marshmurkweb:      ["Marsh Murkweb"],
        silkenenchantress: ["Silken Enchantress"],
        voidweaver:        ["Void Weaver"],
        fleshweaverspider: ["Fleshweaver Spider"],
        probabilityspider: ["Probability Spider"],
        lv_seraphmoth:           ["Seraph Moth"],
        lv_silkweaverapprentice: ["Silk Weaver Apprentice"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Arachnid family registered');

    ;[['u_umbermothswarm',2.4],['u_soldierantcolony',2.4]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
