//=============================================================================
// 3D Battler System - Flora Family
// Version: 1.1.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Rooted/plant procedural 3D battlers (mushroom, plant, tree).
 * Requires 3DBattlerSystem (core) to load first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Flora Family
 * ============================================================================
 *
 * Static, rooted bodies that grow from the ground (no walking, no balance, no
 * ragdoll). They sway gently while alive and topple on death, reusing the
 * shared part-losing engine from window.Battler3D.Base.
 *
 * Registered archetypes:
 *   Mushroom (parts: CAP, STALK, ROOTS, SPORE_SACS)
 *   Plant    (parts: FLOWER, STEM, ROOTS, VINE_1, VINE_2)
 *   Tree     (parts: CROWN, TRUNK, ROOTS, BRANCH_1, BRANCH_2)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Flora] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const FLORA_PROFILES = {
        mushroom: {
            variant: 'mushroom', scale: 2.2, texturePool: 'foliage',
            capColor: 0xc0392b, stalkColor: 0xf3ede0, sporeColor: 0xffffff, rootColor: 0xb9a07a,
            hue: [0.99, 0.04], sat: [0.65, 0.15], lit: [0.42, 0.10]
        },
        plant: {
            variant: 'plant', scale: 2.4, texturePool: 'foliage',
            flowerColor: 0xe84d8a, stemColor: 0x4f9d3a, leafColor: 0x3f8a2c, rootColor: 0x8a6a45,
            hue: [0.30, 0.10], sat: [0.55, 0.15], lit: [0.40, 0.10]
        },
        tree: {
            variant: 'tree', scale: 3.4, texturePool: 'wood',
            crownColor: 0x2f7d32, trunkColor: 0x6b4a2b, rootColor: 0x5a4327,
            hue: [0.33, 0.05], sat: [0.45, 0.12], lit: [0.32, 0.08]
        },
        // ── Bespoke uniques (Plant-key plan: FLOWER/STEM/ROOTS/VINE_1/VINE_2) ──
        elderwoodguardian: { variant: 'elderwoodguardian', scale: 3.6, texturePool: 'wood', bodyColor: 0x5c4326, accent: 0x3f7a2c, front: true, hue: [0.10, 0.04], sat: [0.40, 0.10], lit: [0.30, 0.06] },
        flatwoodsentinel:  { variant: 'flatwoodsentinel',  scale: 3.8, texturePool: 'wood', bodyColor: 0x4a3a26, accent: 0x6a5a3a, front: true, hue: [0.09, 0.03], sat: [0.30, 0.10], lit: [0.26, 0.06] },
        forestsvengeance:  { variant: 'forestsvengeance',  scale: 2.8, texturePool: 'foliage', bodyColor: 0x2c5a22, accent: 0xb03040, front: true, hue: [0.30, 0.08], sat: [0.55, 0.12], lit: [0.34, 0.08] },
        // ── Bespoke uniques (Tree-key plan: CROWN/TRUNK/ROOTS/BRANCH_1/BRANCH_2) ──
        hellthorndryad:    { variant: 'hellthorndryad',    scale: 3.2, texturePool: 'wood', bodyColor: 0x2a1410, accent: 0xff5a1a, front: true, hue: [0.03, 0.03], sat: [0.55, 0.12], lit: [0.22, 0.06] },
        moonlitwendigo:    { variant: 'moonlitwendigo',    scale: 3.4, texturePool: 'pale', bodyColor: 0xd8d2c4, accent: 0x9fe8ff, front: true, hue: [0.55, 0.06], sat: [0.10, 0.06], lit: [0.78, 0.06] },
        mossviper:         { variant: 'mossviper',         scale: 2.6, texturePool: 'foliage', bodyColor: 0x3a6a30, accent: 0x9acc4a, front: true, hue: [0.28, 0.08], sat: [0.50, 0.12], lit: [0.36, 0.08] },
        // ── Bespoke uniques (Mushroom-key plan: CAP/STALK/ROOTS/SPORE_SACS) ──
        motivationalfungoid: { variant: 'motivationalfungoid', scale: 2.3, texturePool: 'foliage', bodyColor: 0xe83a2a, accent: 0xfff0f0, front: true, hue: [0.00, 0.03], sat: [0.75, 0.12], lit: [0.48, 0.08] },
        sporeburstmyconid:   { variant: 'sporeburstmyconid',   scale: 2.7, texturePool: 'foliage', bodyColor: 0x7a6a4a, accent: 0xb8d04a, front: true, hue: [0.12, 0.05], sat: [0.35, 0.12], lit: [0.42, 0.08] },
        // ── Bespoke uniques (Plant-key plan: FLOWER/STEM/ROOTS/VINE_1/VINE_2) ──
        primalsloth:       { variant: 'primalsloth',       scale: 3.0, texturePool: 'wood', bodyColor: 0x6a5236, accent: 0x4a7a3a, front: true, hue: [0.10, 0.05], sat: [0.35, 0.10], lit: [0.34, 0.08] },
        rotwoodentangler:  { variant: 'rotwoodentangler',  scale: 3.2, texturePool: 'wood', bodyColor: 0x4a4028, accent: 0x9aaa5a, front: true, hue: [0.13, 0.06], sat: [0.30, 0.12], lit: [0.28, 0.06] },
        sylvanbarkstalker: { variant: 'sylvanbarkstalker', scale: 2.9, texturePool: 'wood', bodyColor: 0x4a5a32, accent: 0x6a7a3a, front: true, hue: [0.22, 0.07], sat: [0.40, 0.12], lit: [0.32, 0.08] },
        // ── Bespoke uniques (Tree-key plan: CROWN/TRUNK/ROOTS/BRANCH_1/BRANCH_2) ──
        psionicfenbeast:   { variant: 'psionicfenbeast',   scale: 3.3, texturePool: 'wood', bodyColor: 0x2e3a3a, accent: 0xae6aff, front: true, hue: [0.72, 0.08], sat: [0.45, 0.12], lit: [0.30, 0.08] },
        // ── Bespoke uniques (Plant-key plan: FLOWER/STEM/ROOTS/VINE_1/VINE_2) ──
        voidparasiteplant: { variant: 'voidparasiteplant', scale: 2.8, texturePool: 'foliage', bodyColor: 0x241830, accent: 0xb030d0, front: true, hue: [0.78, 0.08], sat: [0.55, 0.12], lit: [0.22, 0.06] },
        phantomchloroblade:{ variant: 'phantomchloroblade',scale: 2.9, texturePool: 'foliage', bodyColor: 0x1a2a24, accent: 0x6affc0, front: true, hue: [0.45, 0.08], sat: [0.45, 0.12], lit: [0.30, 0.08] },
        rattussapscream:   { variant: 'rattussapscream',   scale: 2.5, texturePool: 'foliage', bodyColor: 0x6a5a32, accent: 0x9ad84a, front: true, hue: [0.22, 0.07], sat: [0.45, 0.12], lit: [0.36, 0.08] },
        // ── Bespoke uniques (Mushroom-key plan: CAP/STALK/ROOTS/SPORE_SACS) ──
        luminescentmycelian: { variant: 'luminescentmycelian', scale: 3.4, texturePool: 'foliage', bodyColor: 0x3a5a6a, accent: 0x6affe0, front: true, hue: [0.50, 0.08], sat: [0.45, 0.12], lit: [0.40, 0.08] },
        eldergloomsporemantle: { variant: 'eldergloomsporemantle', scale: 3.6, texturePool: 'foliage', bodyColor: 0x2a2230, accent: 0x8aff5a, front: true, hue: [0.75, 0.08], sat: [0.40, 0.12], lit: [0.24, 0.06] },
        motivationalspeakerep: { variant: 'motivationalspeakerep', scale: 2.6, texturePool: 'foliage', bodyColor: 0xe0a030, accent: 0xfff4d0, front: true, hue: [0.10, 0.04], sat: [0.70, 0.12], lit: [0.50, 0.08] },
        // ── Bespoke uniques (Mushroom-key plan: CAP/STALK/ROOTS/SPORE_SACS) ──
        creepingluminspore: { variant: 'creepingluminspore', scale: 2.4, texturePool: 'foliage', bodyColor: 0x2a4a40, accent: 0x6affc8, front: true, hue: [0.45, 0.08], sat: [0.40, 0.12], lit: [0.30, 0.08] },
        // ── Bespoke uniques (Tree-key plan: CROWN/TRUNK/ROOTS/BRANCH_1/BRANCH_2) ──
        cryingtree:    { variant: 'cryingtree',    scale: 3.4, texturePool: 'wood', bodyColor: 0x4a3a2a, accent: 0x8ad0a0, front: true, hue: [0.09, 0.04], sat: [0.35, 0.10], lit: [0.28, 0.06] },
        backwardstree: { variant: 'backwardstree', scale: 3.4, texturePool: 'wood', bodyColor: 0x5a4830, accent: 0x3f7a2c, front: true, hue: [0.10, 0.04], sat: [0.40, 0.10], lit: [0.30, 0.06] },
        // ── Bespoke uniques (Plant-key plan: FLOWER/STEM/ROOTS/VINE_1/VINE_2) ──
        xylomantiflorous: { variant: 'xylomantiflorous', scale: 2.8, texturePool: 'foliage', bodyColor: 0x4a6a2a, accent: 0xc8a0e0, front: true, hue: [0.28, 0.08], sat: [0.50, 0.12], lit: [0.34, 0.08] }
    };

    class FloraBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = FLORA_PROFILES[creatureType] || FLORA_PROFILES.mushroom;
            super(scale, offsetY, battler, profile, 0, creatureType || 'mushroom');
            this.variant = profile.variant;
            this._materials = [];
            this._deathBaseY = null;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'plant': this._buildPlant(); break;
                case 'tree': this._buildTree(); break;
                case 'elderwoodguardian': this._buildElderwoodGuardian(); break;
                case 'flatwoodsentinel': this._buildFlatwoodSentinel(); break;
                case 'forestsvengeance': this._buildForestsVengeance(); break;
                case 'hellthorndryad': this._buildHellthornDryad(); break;
                case 'moonlitwendigo': this._buildMoonlitWendigo(); break;
                case 'mossviper': this._buildMossViper(); break;
                case 'motivationalfungoid': this._buildMotivationalFungoid(); break;
                case 'sporeburstmyconid': this._buildSporeburstMyconid(); break;
                case 'primalsloth': this._buildPrimalSloth(); break;
                case 'rotwoodentangler': this._buildRotwoodEntangler(); break;
                case 'sylvanbarkstalker': this._buildSylvanBarkstalker(); break;
                case 'psionicfenbeast': this._buildPsionicFenbeast(); break;
                case 'voidparasiteplant': this._buildVoidParasitePlant(); break;
                case 'phantomchloroblade': this._buildPhantomChloroblade(); break;
                case 'rattussapscream': this._buildRattusSapscream(); break;
                case 'luminescentmycelian': this._buildLuminescentMycelian(); break;
                case 'eldergloomsporemantle': this._buildEldergloomSporemantle(); break;
                case 'motivationalspeakerep': this._buildMotivationalSpeakerEP(); break;
                case 'creepingluminspore': this._buildCreepingLuminspore(); break;
                case 'cryingtree': this._buildCryingTree(); break;
                case 'backwardstree': this._buildBackwardsTree(); break;
                case 'xylomantiflorous': this._buildXylomantiFlorous(); break;
                default: this._buildMushroom(); break;
            }

            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.9 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0xffffff, 1.0, 0.2));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(accent || 0x111111, 1.0, 0.2, accent === 0x111111 ? null : accent)); pup.position.set(0, 0, r * 0.6); eye.add(pup);
            parent.add(eye); return eye;
        }

        _buildRoots(color) {
            const rootMat = this._mat(color, 1.0, 1.0);
            const roots = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const ang = (i / 5) * Math.PI * 2;
                const r = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), rootMat);
                r.position.set(Math.cos(ang) * 0.18, -0.1, Math.sin(ang) * 0.18);
                r.rotation.set(Math.PI - 0.5, ang, 0);
                roots.add(r);
            }
            this.bodyGroup.add(roots);
            return roots;
        }

        _buildMushroom() {
            const p = this.profile;
            const skin = this.buildSkinTexture(this.skinTextureFile);
            this.roots = this._buildRoots(p.rootColor);

            const stalkMat = this.applySkin(this._mat(p.stalkColor, 1.0, 0.9));
            this.stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 10), stalkMat);
            this.stalk.position.y = 0.45;
            this.bodyGroup.add(this.stalk);

            const capMat = new THREE.MeshStandardMaterial({ color: p.capColor, map: skin, roughness: 0.85, transparent: true });
            this._materials.push(capMat);
            this.cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
            this.cap.position.y = 0.95; this.cap.scale.set(1.0, 0.7, 1.0);
            this.bodyGroup.add(this.cap);

            const sporeMat = this._mat(p.sporeColor, 1.0, 0.6);
            this.spores = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = this.rand() * Math.PI * 2;
                const rad = 0.18 + this.rand() * 0.22;
                const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05 + this.rand() * 0.03, 8, 8), sporeMat);
                dot.position.set(Math.cos(a) * rad, 0.97 + this.rand() * 0.06, Math.sin(a) * rad);
                this.spores.add(dot);
            }
            this.bodyGroup.add(this.spores);

            this._partMeshMap = { CAP: this.cap, STALK: this.stalk, ROOTS: this.roots, SPORE_SACS: this.spores };
            this._cascadeRules = [
                { gone: ['STALK'], hide: [this.stalk, this.cap, this.spores] },
                { gone: ['CAP'],   hide: [this.cap, this.spores] },
                { gone: ['SPORE_SACS'], hide: [this.spores] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
            this.swayTop = this.cap;
        }

        _buildPlant() {
            const p = this.profile;
            this.roots = this._buildRoots(p.rootColor);

            const stemMat = this.applySkin(this._mat(p.stemColor, 1.0, 0.85));
            this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 8), stemMat);
            this.stem.position.y = 0.55;
            this.bodyGroup.add(this.stem);

            // Flower: a ring of petals around a centre disc.
            const flowerMat = this._mat(p.flowerColor, 1.0, 0.7);
            this.flower = new THREE.Group();
            const centre = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(0xffd24a, 1.0, 0.6));
            this.flower.add(centre);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), flowerMat);
                petal.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18);
                petal.scale.set(1.4, 0.4, 0.8);
                this.flower.add(petal);
            }
            this.flower.position.y = 1.15;
            this.bodyGroup.add(this.flower);

            // Two vines budding off the stem.
            const vineMat = this._mat(p.leafColor, 1.0, 0.85);
            const mkVine = (side) => {
                const g = new THREE.Group();
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(side * 0.18, 0.18, 0.05),
                    new THREE.Vector3(side * 0.32, 0.42, 0.0),
                    new THREE.Vector3(side * 0.22, 0.62, -0.05)
                ]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.035, 5, false), vineMat));
                const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), vineMat);
                leaf.position.set(side * 0.22, 0.62, -0.05); leaf.scale.set(1.6, 0.3, 1.0);
                g.add(leaf);
                g.position.y = 0.5;
                this.bodyGroup.add(g);
                return g;
            };
            this.vine1 = mkVine(-1);
            this.vine2 = mkVine(1);

            this._partMeshMap = { FLOWER: this.flower, STEM: this.stem, ROOTS: this.roots, VINE_1: this.vine1, VINE_2: this.vine2 };
            this._cascadeRules = [
                { gone: ['STEM'], hide: [this.stem, this.flower, this.vine1, this.vine2] },
                { gone: ['FLOWER'], hide: [this.flower] },
                { gone: ['VINE_1'], hide: [this.vine1] },
                { gone: ['VINE_2'], hide: [this.vine2] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
            this.swayTop = this.flower;
        }

        _buildTree() {
            const p = this.profile;
            this.roots = this._buildRoots(p.rootColor);

            const trunkMat = this.applySkin(this._mat(p.trunkColor, 1.0, 1.0));
            this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.4, 9), trunkMat);
            this.trunk.position.y = 0.7;
            this.bodyGroup.add(this.trunk);

            // Two side branches.
            const mkBranch = (side) => {
                const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.6, 6), trunkMat);
                b.position.set(side * 0.2, 1.05, 0);
                b.rotation.z = side * 0.8;
                this.bodyGroup.add(b);
                return b;
            };
            this.branch1 = mkBranch(-1);
            this.branch2 = mkBranch(1);

            // Crown: a cluster of foliage spheres.
            const crownMat = this.applySkin(this._mat(p.crownColor, 1.0, 0.85));
            this.crown = new THREE.Group();
            const blobs = [[0, 1.6, 0, 0.55], [-0.32, 1.45, 0.1, 0.4], [0.32, 1.45, -0.1, 0.4], [0, 1.85, -0.1, 0.38], [0.1, 1.5, 0.3, 0.34]];
            for (const [x, y, z, r] of blobs) {
                const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), crownMat);
                blob.position.set(x, y, z);
                this.crown.add(blob);
            }
            this.bodyGroup.add(this.crown);

            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK'], hide: [this.trunk, this.crown, this.branch1, this.branch2] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['BRANCH_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2'], hide: [this.branch2] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
            this.swayTop = this.crown;
        }

        // ── Shared dismemberment wiring for the bespoke uniques ───────────────
        _wirePlant(extra) {
            extra = (extra || []).filter(Boolean);
            this._partMeshMap = { FLOWER: this.flower, STEM: this.stem, ROOTS: this.roots, VINE_1: this.vine1, VINE_2: this.vine2 };
            this._cascadeRules = [
                { gone: ['STEM'], hide: [this.stem, this.flower, this.roots, this.vine1, this.vine2, ...extra] },
                { gone: ['FLOWER'], hide: [this.flower] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['VINE_1'], hide: [this.vine1] },
                { gone: ['VINE_2'], hide: [this.vine2] },
            ];
            this.swayTop = this.flower;
        }
        _wireTree(extra) {
            extra = (extra || []).filter(Boolean);
            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK'], hide: [this.trunk, this.crown, this.roots, this.branch1, this.branch2, ...extra] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['BRANCH_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2'], hide: [this.branch2] },
            ];
            this.swayTop = this.crown;
        }
        _gnarledLimb(side, mat, yTop, len) {
            const g = new THREE.Group();
            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(side * 0.22, (len || 0.6) * 0.4, 0.06),
                new THREE.Vector3(side * 0.42, (len || 0.6) * 0.7, -0.04),
                new THREE.Vector3(side * 0.36, (len || 0.6), 0.10)
            ]);
            g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.05, 5, false), mat));
            g.position.set(0, yTop || 1.0, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Elderwood Guardian: ancient treant, face in the trunk, leafy crown,
        //    lashing vine arms ─────────────────────────────────────────────────
        _buildElderwoodGuardian() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.95);
            // Gnarled trunk body (STEM) with bark knuckles.
            this.stem = new THREE.Group();
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.5, 9), bark); core.position.y = 0.85; this.stem.add(core);
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1 + this.idRand() * 0.05, 7, 6), bark); knob.position.set(Math.cos(a) * 0.42, 0.55 + (i % 3) * 0.4, Math.sin(a) * 0.42); knob.scale.set(1, 1.4, 0.7); this.stem.add(knob); }
            this.bodyGroup.add(this.stem);
            // A weathered face carved into the trunk.
            const browL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), bark); browL.position.set(-0.13, 1.18, 0.4); browL.rotation.z = -0.25; this.stem.add(browL);
            const browR = browL.clone(); browR.position.x = 0.13; browR.rotation.z = 0.25; this.stem.add(browR);
            this._eye(this.stem, -0.13, 1.05, 0.42, 0.08, 0x6a4a10); this._eye(this.stem, 0.13, 1.05, 0.42, 0.08, 0x6a4a10);
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), this._mat(0x140a04, 1, 0.6)); maw.position.set(0, 0.78, 0.42); maw.scale.set(1.3, 1.6, 0.5); this.stem.add(maw);
            // Leafy canopy crown (FLOWER).
            this.flower = new THREE.Group();
            const canopyMat = this._mat(p.accent, 1, 0.85);
            const blobs = [[0, 0, 0, 0.5], [-0.34, -0.12, 0.1, 0.36], [0.34, -0.12, -0.1, 0.36], [0, 0.18, -0.12, 0.34], [0.12, -0.05, 0.32, 0.3]];
            for (const [x, y, z, r] of blobs) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 11, 10), canopyMat); b.position.set(x, y, z); this.flower.add(b); }
            this.flower.position.set(0, 2.0, 0); this.bodyGroup.add(this.flower);
            // Lashing vine arms (VINE_1/2).
            const vineMat = this._mat(0x4a6a2a, 1, 0.8);
            this.vine1 = this._gnarledLimb(-1, bark, 1.2, 0.7); this.vine2 = this._gnarledLimb(1, bark, 1.2, 0.7);
            for (const v of [this.vine1, this.vine2]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 5), vineMat); tip.position.set(v._side * 0.36, 0.7, 0.1); v.add(tip); }
            this.roots = this._buildRoots(p.bodyColor);
            this._wirePlant([browL, browR, maw]);
        }

        // ── Flatwood Sentinel: a towering flat slab tree-guardian, knothole
        //    eyes, gnarled limbs ───────────────────────────────────────────────
        _buildFlatwoodSentinel() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.92);
            // Wide flat slab body (STEM) - like a standing plank.
            this.stem = new THREE.Group();
            const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.22), wood); slab.position.y = 0.95; this.stem.add(slab);
            // Vertical grain ridges across the face.
            for (let i = 0; i < 5; i++) { const grain = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.7, 0.02), this._mat(p.accent, 1, 0.8)); grain.position.set(-0.32 + i * 0.16, 0.95, 0.12); this.stem.add(grain); }
            this.bodyGroup.add(this.stem);
            // Knothole eyes (dark rings around glowing pits).
            for (const ex of [-0.22, 0.22]) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 8, 14), this._mat(0x1a1208, 1, 0.7)); ring.position.set(ex, 1.4, 0.12); ring.rotation.x = 0.0; this.stem.add(ring);
                this._eye(this.stem, ex, 1.4, 0.14, 0.06, p.accent);
            }
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), this._mat(0x1a1208, 1, 0.7)); mouth.position.set(0, 1.02, 0.13); this.stem.add(mouth);
            // A small mossy crown tuft (FLOWER).
            this.flower = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 4), this._mat(0x4a6a3a, 1, 0.75)); tuft.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.05); tuft.rotation.z = Math.cos(a) * 0.5; this.flower.add(tuft); }
            this.flower.position.set(0, 1.95, 0); this.bodyGroup.add(this.flower);
            // Two gnarled, angular limbs jutting from the slab edges.
            this.vine1 = this._gnarledLimb(-1, wood, 1.15, 0.8); this.vine2 = this._gnarledLimb(1, wood, 1.15, 0.8);
            this.roots = this._buildRoots(p.bodyColor);
            this._wirePlant([mouth]);
        }

        // ── Forest's Vengeance: plant-animal hybrid, thorny vines, fanged maw
        //    flower ────────────────────────────────────────────────────────────
        _buildForestsVengeance() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.7);
            // Hunched bulbous stalk body (STEM) bristling with thorns.
            this.stem = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), flesh); this.stem.position.set(0, 0.8, 0); this.stem.scale.set(1.0, 1.2, 1.0); this.bodyGroup.add(this.stem);
            const thornMat = this._mat(0x6a3a20, 1, 0.6);
            for (let i = 0; i < 14; i++) { const a = this.idRand() * Math.PI * 2, h = 0.4 + this.idRand() * 0.9; const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), thornMat); const rr = 0.4; thorn.position.set(Math.cos(a) * rr, h, Math.sin(a) * rr); thorn.lookAt(Math.cos(a) * 2, h, Math.sin(a) * 2); this.bodyGroup.add(thorn); }
            // Fanged maw flower head (FLOWER): petals + open jaws + teeth.
            this.flower = new THREE.Group();
            const mawMat = this._mat(p.accent, 1, 0.6);
            const upper = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), mawMat); upper.scale.set(1, 0.7, 1); upper.position.y = 0.06; this.flower.add(upper);
            const lower = upper.clone(); lower.rotation.x = Math.PI; lower.position.y = -0.06; this.flower.add(lower);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), this._mat(0xf0e8d0, 1, 0.4)); fang.position.set(Math.cos(a) * 0.22, (i % 2 ? 0.1 : -0.1), Math.sin(a) * 0.22); fang.rotation.x = (i % 2 ? Math.PI : 0); this.flower.add(fang); }
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), this._mat(0x2c5a22, 1, 0.7)); petal.position.set(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34); petal.rotation.z = Math.PI / 2 - 0.3; petal.rotation.y = -a; this.flower.add(petal); }
            const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0xc02030, 1, 0.5)); tongue.scale.set(0.6, 0.4, 1.4); tongue.position.set(0, 0, 0.1); this.flower.add(tongue);
            this.flower.position.set(0, 1.55, 0); this.bodyGroup.add(this.flower);
            // Thorny lashing vines (VINE_1/2).
            const mkThornVine = (side) => {
                const g = this._gnarledLimb(side, this._mat(0x2c5a22, 1, 0.7), 1.0, 0.9);
                for (let i = 1; i <= 4; i++) { const th = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), thornMat); th.position.set(side * 0.18 * (i / 4) + side * 0.12, 0.9 * (i / 5), (i % 2 ? 0.08 : -0.08)); th.rotation.z = side * 1.2; g.add(th); }
                return g;
            };
            this.vine1 = mkThornVine(-1); this.vine2 = mkThornVine(1);
            this.roots = this._buildRoots(0x4a3a22);
            this._wirePlant([upper, lower]);
        }

        // ── Hellthorn Dryad: charred dryad-tree, brimstone sap, flaming flowers ─
        _buildHellthornDryad() {
            const p = this.profile;
            const char = this._skinMat(p.bodyColor, 0.95);
            // Charred dryad trunk (TRUNK) with a cracked-ember body.
            this.trunk = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.5, 9), char); torso.position.y = 0.85; this.trunk.add(torso);
            // Glowing brimstone cracks (emissive).
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2, y = 0.4 + this.idRand() * 1.0; const crack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.02), this._mat(p.accent, 1, 0.4, p.accent)); crack.position.set(Math.cos(a) * 0.26, y, Math.sin(a) * 0.26); crack.lookAt(Math.cos(a) * 2, y, Math.sin(a) * 2); crack.rotation.z = this.idRand(); this.trunk.add(crack); }
            // Dryad face - hollow with smouldering eyes.
            this._eye(this.trunk, -0.1, 1.3, 0.24, 0.07, p.accent); this._eye(this.trunk, 0.1, 1.3, 0.24, 0.07, p.accent);
            this.bodyGroup.add(this.trunk);
            // Dripping brimstone sap beads.
            for (let i = 0; i < 5; i++) { const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 7, 7), this._mat(0xffaa30, 1, 0.3, 0xff7a10)); drip.scale.y = 1.8; drip.position.set((this.idRand() - 0.5) * 0.5, 0.5 + this.idRand() * 0.9, 0.28); this.bodyGroup.add(drip); }
            // Crown of flaming flowers (CROWN).
            this.crown = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2; const fx = Math.cos(a) * 0.26, fz = Math.sin(a) * 0.26;
                const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 9, 8), this._mat(0x3a1008, 1, 0.7)); bloom.position.set(fx, 0, fz); this.crown.add(bloom);
                const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), this._mat(0xff6a1a, 0.9, 0.2, 0xff5a10)); flame.position.set(fx, 0.2, fz); this.crown.add(flame);
            }
            const topFlame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 6), this._mat(0xffd23a, 0.9, 0.2, 0xffb010)); topFlame.position.y = 0.24; this.crown.add(topFlame);
            this.crown.position.set(0, 1.9, 0); this.bodyGroup.add(this.crown);
            // Charred thorny branch-arms (BRANCH_1/2).
            this.branch1 = this._gnarledLimb(-1, char, 1.15, 0.7); this.branch2 = this._gnarledLimb(1, char, 1.15, 0.7);
            for (const b of [this.branch1, this.branch2]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), this._mat(p.accent, 1, 0.4, p.accent)); claw.position.set(b._side * 0.36, 0.7, 0.1); b.add(claw); }
            this.roots = this._buildRoots(p.bodyColor);
            this._wireTree();
        }

        // ── Moonlit Wendigo: gaunt pale tree-spirit, hollow glowing eyes,
        //    antler-branches ──────────────────────────────────────────────────
        _buildMoonlitWendigo() {
            const p = this.profile;
            const pale = this._skinMat(p.bodyColor, 0.8);
            // Gaunt skeletal trunk (TRUNK).
            this.trunk = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.6, 8), pale); torso.position.y = 0.9; this.trunk.add(torso);
            // Exposed rib-like ridges.
            for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.005, 0.02, 6, 12, Math.PI), pale); rib.position.set(0, 0.7 + i * 0.18, 0.04); rib.rotation.x = Math.PI / 2; this.trunk.add(rib); }
            // Elongated skull head with hollow glowing eyes.
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), pale); head.scale.set(0.85, 1.2, 1.0); head.position.set(0, 1.78, 0); this.trunk.add(head);
            this._eye(head, -0.08, 0.02, 0.16, 0.055, p.accent); this._eye(head, 0.08, 0.02, 0.16, 0.055, p.accent);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), pale); jaw.position.set(0, 1.6, 0.1); this.trunk.add(jaw);
            this.bodyGroup.add(this.trunk);
            // Antler-like bare branch crown (CROWN).
            this.crown = new THREE.Group();
            const mkAntler = (side) => {
                const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5), pale); beam.position.set(side * 0.1, 0.25, 0); beam.rotation.z = side * 0.5; this.crown.add(beam);
                for (let i = 0; i < 3; i++) { const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.24, 4), pale); tine.position.set(side * (0.18 + i * 0.06), 0.34 + i * 0.12, (i - 1) * 0.06); tine.rotation.z = side * (0.9 + i * 0.2); this.crown.add(tine); }
            };
            mkAntler(-1); mkAntler(1);
            this.crown.position.set(0, 1.9, 0); this.bodyGroup.add(this.crown);
            // Long spindly arm-branches (BRANCH_1/2).
            this.branch1 = this._gnarledLimb(-1, pale, 1.2, 1.0); this.branch2 = this._gnarledLimb(1, pale, 1.2, 1.0);
            for (const b of [this.branch1, this.branch2]) for (let i = 0; i < 3; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 4), pale); claw.position.set(b._side * (0.34 + i * 0.03), 1.0, (i - 1) * 0.05); claw.rotation.z = b._side * 0.4; b.add(claw); }
            this.roots = this._buildRoots(p.bodyColor);
            this._wireTree([head]);
        }

        // ── Moss Viper: moss-camouflaged plant-snake, fanged bloom head on a
        //    leafy coiled stem ─────────────────────────────────────────────────
        _buildMossViper() {
            const p = this.profile;
            const moss = this._skinMat(p.bodyColor, 0.85);
            // Coiled leafy snake-stem body (STEM).
            this.stem = new THREE.Group();
            const coilCurve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0.3, 0.18, 0.2),
                new THREE.Vector3(-0.28, 0.36, 0.28),
                new THREE.Vector3(-0.3, 0.6, -0.1),
                new THREE.Vector3(0.1, 0.85, -0.2),
                new THREE.Vector3(0.05, 1.2, 0.1)
            ]);
            this.stem.add(new THREE.Mesh(new THREE.TubeGeometry(coilCurve, 40, 0.13, 8, false), moss));
            // Moss tufts / leaf scales along the body for camouflage.
            const pts = coilCurve.getPoints(12);
            for (let i = 2; i < pts.length; i += 2) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), this._mat(p.accent, 1, 0.7)); leaf.position.copy(pts[i]); leaf.position.x += (i % 4 ? 0.1 : -0.1); leaf.rotation.z = (i % 4 ? 0.8 : -0.8); this.stem.add(leaf); }
            this.bodyGroup.add(this.stem);
            // Fanged bloom head (FLOWER) atop the coil.
            this.flower = new THREE.Group();
            const headM = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), moss); headM.scale.set(1.0, 0.8, 1.3); this.flower.add(headM);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 4), this._mat(0xc24a6a, 1, 0.6)); petal.position.set(Math.cos(a) * 0.2, -0.04, Math.sin(a) * 0.2 - 0.05); petal.rotation.x = Math.PI / 2 + 0.5; petal.rotation.z = a; this.flower.add(petal); }
            this._eye(this.flower, -0.09, 0.08, 0.18, 0.05, 0xffcc20); this._eye(this.flower, 0.09, 0.08, 0.18, 0.05, 0xffcc20);
            for (const fx of [-0.06, 0.06]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), this._mat(0xf0e8d0, 1, 0.4)); fang.position.set(fx, -0.14, 0.22); fang.rotation.x = Math.PI; this.flower.add(fang); }
            const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.18), this._mat(0xc02030, 1, 0.5)); tongue.position.set(0, -0.08, 0.32); this.flower.add(tongue); this._mossTongue = tongue;
            this.flower.position.set(0.05, 1.3, 0.1); this.bodyGroup.add(this.flower);
            // Two short leaf-fronds budding off the coil (VINE_1/2).
            const mkFrond = (side) => {
                const g = new THREE.Group();
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 5), moss); stalk.position.set(side * 0.15, 0.15, 0); stalk.rotation.z = side * 0.7; g.add(stalk);
                const blade = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this._mat(p.accent, 1, 0.7)); blade.scale.set(1.8, 0.3, 0.9); blade.position.set(side * 0.32, 0.32, 0); g.add(blade);
                g.position.set(side * 0.16, 0.7, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.vine1 = mkFrond(-1); this.vine2 = mkFrond(1);
            this.roots = this._buildRoots(p.bodyColor);
            this._wirePlant();
        }

        // ── Xylomanti Florous: knotted carnivorous vine-plant woven into
        //    grotesque tangles, a paralytic-spore bloom head, two lashing vines ─
        _buildXylomantiFlorous() {
            const p = this.profile;
            const vineMat = this._skinMat(p.bodyColor, 0.85);
            // Knotted braided stem (STEM): three coiling vines woven into a tangle.
            this.stem = new THREE.Group();
            const braid = (phase, rad) => {
                const pts = [];
                for (let i = 0; i <= 6; i++) {
                    const u = i / 6, y = u * 1.2;
                    const a = phase + u * Math.PI * 3.2;
                    pts.push(new THREE.Vector3(Math.cos(a) * rad * (1 - u * 0.4), y, Math.sin(a) * rad * (1 - u * 0.4)));
                }
                const curve = new THREE.CatmullRomCurve3(pts);
                return new THREE.Mesh(new THREE.TubeGeometry(curve, 34, 0.07, 6, false), vineMat);
            };
            this.stem.add(braid(0, 0.16)); this.stem.add(braid(2.1, 0.16)); this.stem.add(braid(4.2, 0.16));
            // Grotesque swollen knots bulging out of the tangle.
            for (let i = 0; i < 6; i++) { const a = this.idRand() * Math.PI * 2, y = 0.2 + this.idRand() * 0.95; const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09 + this.idRand() * 0.06, 8, 7), vineMat); knot.position.set(Math.cos(a) * 0.14, y, Math.sin(a) * 0.14); knot.scale.set(1.3, 0.8, 1.3); this.stem.add(knot); }
            this.bodyGroup.add(this.stem);
            // Paralytic-spore bloom head (FLOWER): a gaping cup ringed with petals
            // exhaling a haze of drifting spores.
            this.flower = new THREE.Group();
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.1, 0.3, 12, 1, true), this._mat(0x6a3a5a, 1, 0.7)); cup.position.y = 0.04; this.flower.add(cup);
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this._mat(0x2a0a24, 1, 0.6)); gullet.position.y = -0.02; gullet.scale.set(1, 0.7, 1); this.flower.add(gullet);
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const petal = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 4), this._mat(p.accent, 1, 0.6)); petal.position.set(Math.cos(a) * 0.28, 0.1, Math.sin(a) * 0.28); petal.rotation.z = Math.PI / 2 - 0.55; petal.rotation.y = -a; this.flower.add(petal); }
            // Drifting paralytic spore cloud above the bloom.
            this.spores = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = this.rand() * Math.PI * 2, rr = 0.1 + this.rand() * 0.22; const s = new THREE.Mesh(new THREE.SphereGeometry(0.035 + this.rand() * 0.03, 6, 6), this._mat(p.accent, 0.7, 0.3, p.accent)); s._a = a; s._rr = rr; s._yb = 0.2 + this.rand() * 0.3; s.position.set(Math.cos(a) * rr, s._yb, Math.sin(a) * rr); this.spores.add(s); }
            this.flower.add(this.spores);
            this.flower.position.set(0, 1.35, 0); this.bodyGroup.add(this.flower);
            // Two lashing vine-tendrils tipped with snapping bud-mouths (VINE_1/2).
            const mkLash = (side) => {
                const g = this._gnarledLimb(side, vineMat, 0.85, 1.0);
                const bud = new THREE.Mesh(new THREE.SphereGeometry(0.1, 9, 8), this._mat(0x6a3a5a, 1, 0.6)); bud.position.set(side * 0.36, 1.0, 0.1); g.add(bud);
                for (let i = 0; i < 4; i++) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0xe8e0c8, 1, 0.4)); const fa = (i / 4) * Math.PI * 2; fang.position.set(side * 0.36 + Math.cos(fa) * 0.07, 1.0, 0.1 + Math.sin(fa) * 0.07); fang.lookAt(side * 0.36, 1.2, 0.1); g.add(fang); }
                return g;
            };
            this.vine1 = mkLash(-1); this.vine2 = mkLash(1);
            this.roots = this._buildRoots(0x4a3a22);
            this._wirePlant();
        }

        // ── Shared dismemberment wiring for mushroom-plan uniques ─────────────
        _wireMushroom(extra) {
            extra = (extra || []).filter(Boolean);
            this._partMeshMap = { CAP: this.cap, STALK: this.stalk, ROOTS: this.roots, SPORE_SACS: this.spores };
            this._cascadeRules = [
                { gone: ['STALK'], hide: [this.stalk, this.cap, this.roots, this.spores, ...extra] },
                { gone: ['CAP'], hide: [this.cap, this.spores, ...extra] },
                { gone: ['SPORE_SACS'], hide: [this.spores] },
                { gone: ['ROOTS'], hide: [this.roots] },
            ];
            this.swayTop = this.cap;
        }

        // ── Motivational Fungoid: cheery bright-red mushroom, wide smiling cap,
        //    bouncing spore sacs ────────────────────────────────────────────────
        _buildMotivationalFungoid() {
            const p = this.profile;
            // Plump round stalk.
            const stalkMat = this._skinMat(0xfff4e8, 0.85);
            this.stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.85, 12), stalkMat);
            this.stalk.position.y = 0.45; this.stalk.scale.set(1, 1, 1); this.bodyGroup.add(this.stalk);
            // Big jolly eyes + a wide curved smile sit on the stalk-face.
            this._eye(this.stalk, -0.13, 0.18, 0.24, 0.09, 0x222222); this._eye(this.stalk, 0.13, 0.18, 0.24, 0.09, 0x222222);
            const smile = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = -0.9 + (i / 6) * 1.8; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(0x6a1810, 1, 0.5)); seg.position.set(Math.sin(a) * 0.16, -Math.cos(a) * 0.06 - 0.02, 0.27); smile.add(seg); }
            smile.position.set(0, 0.02, 0); this.stalk.add(smile);
            // Rosy cheeks.
            for (const cx of [-0.2, 0.2]) { const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(0xff8a8a, 0.7, 0.4)); cheek.scale.set(1, 0.7, 0.4); cheek.position.set(cx, 0.05, 0.22); this.stalk.add(cheek); }
            // Wide cheerful cap (broad dome) with white polka spots.
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const capMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: skin, roughness: 0.7, transparent: true }); this._materials.push(capMat);
            this.cap = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
            this.cap.position.y = 0.92; this.cap.scale.set(1.25, 0.62, 1.25); this.bodyGroup.add(this.cap);
            const spotMat = this._mat(p.accent, 1, 0.5);
            // The spots are ON the cap, so they are placed on the cap's own
            // dome in the cap's own space. Given body-space heights they were
            // lifted clear of the mushroom by the cap's position and squashed
            // sideways by its scale.
            for (let i = 0; i < 9; i++) {
                const a = this.idRand() * Math.PI * 2, rr = 0.2 + this.idRand() * 0.42;
                const spot = new THREE.Mesh(new THREE.CircleGeometry(0.06 + this.idRand() * 0.04, 10), spotMat);
                spot.position.set(Math.cos(a) * rr, Math.sqrt(Math.max(0, 0.62 * 0.62 - rr * rr)), Math.sin(a) * rr);
                spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spot.position.clone().normalize());
                this.cap.add(spot);
            }
            // Bouncing spore sacs: dangling pom-poms under the cap brim.
            this.spores = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4), stalkMat); stem.position.set(Math.cos(a) * 0.5, 0.86, Math.sin(a) * 0.5); this.spores.add(stem); const sac = new THREE.Mesh(new THREE.SphereGeometry(0.07, 9, 9), this._mat(0xffe24a, 1, 0.4, 0xaa6a00)); sac.position.set(Math.cos(a) * 0.5, 0.76, Math.sin(a) * 0.5); this.spores.add(sac); }
            this.bodyGroup.add(this.spores);
            this.roots = this._buildRoots(0xc9a87a);
            this._wireMushroom([smile]);
        }

        // ── Sporeburst Myconid: bipedal mushroom-man, bulging cap that ruptures
        //    spore clouds ───────────────────────────────────────────────────────
        _buildSporeburstMyconid() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.85);
            // Upright humanoid stalk-body (STALK): torso + two stubby legs + arms.
            this.stalk = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 4, 10), flesh); torso.position.y = 0.7; this.stalk.add(torso);
            for (const lx of [-0.13, 0.13]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 7), flesh); leg.position.set(lx, 0.22, 0); this.stalk.add(leg); const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), flesh); foot.scale.set(1, 0.5, 1.4); foot.position.set(lx, 0.02, 0.04); this.stalk.add(foot); }
            for (const ax of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6), flesh); arm.position.set(ax * 0.26, 0.78, 0); arm.rotation.z = ax * 0.5; this.stalk.add(arm); }
            // Gilled underbelly ridges.
            for (let i = 0; i < 4; i++) { const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.15 + i * 0.01, 0.015, 5, 12, Math.PI), this._mat(0x5a4a32, 1, 0.8)); ridge.position.set(0, 0.55 + i * 0.12, 0.08); ridge.rotation.x = Math.PI / 2; this.stalk.add(ridge); }
            this._eye(this.stalk, -0.08, 0.92, 0.17, 0.06, 0x3a2a10); this._eye(this.stalk, 0.08, 0.92, 0.17, 0.06, 0x3a2a10);
            this.bodyGroup.add(this.stalk);
            // Bulging blistered cap (CAP) - lumpy swollen dome with sac-blisters.
            const capMat = this._mat(0xa89060, 1, 0.8);
            this.cap = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), capMat); dome.scale.set(1.1, 0.95, 1.1); this.cap.add(dome);
            for (let i = 0; i < 10; i++) { const a = this.idRand() * Math.PI * 2, ph = this.idRand() * 0.9; const blister = new THREE.Mesh(new THREE.SphereGeometry(0.08 + this.idRand() * 0.05, 8, 8), this._mat(p.accent, 1, 0.5, 0x3a4a00)); blister.position.set(Math.sin(ph) * Math.cos(a) * 0.44, Math.cos(ph) * 0.42, Math.sin(ph) * Math.sin(a) * 0.44); this.cap.add(blister); }
            this.cap.position.y = 1.18; this.bodyGroup.add(this.cap);
            // Erupting spore cloud (SPORE_SACS): puff-spheres above the cap.
            this.spores = new THREE.Group();
            for (let i = 0; i < 12; i++) { const a = this.idRand() * Math.PI * 2, rr = this.idRand() * 0.5; const puff = new THREE.Mesh(new THREE.SphereGeometry(0.05 + this.idRand() * 0.07, 7, 7), this._mat(0xcfe27a, 0.55, 0.4)); puff.position.set(Math.cos(a) * rr, 1.5 + this.idRand() * 0.5, Math.sin(a) * rr); this.spores.add(puff); }
            this.bodyGroup.add(this.spores);
            this.roots = this._buildRoots(p.bodyColor);
            this._wireMushroom();
        }

        // ── Primal Sloth: shaggy bark-skinned sloth-treant, mossy fur, vine limbs
        _buildPrimalSloth() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.95);
            // Hunched stout trunk-body (STEM).
            this.stem = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), bark); torso.scale.set(1.0, 1.3, 0.9); torso.position.y = 0.85; this.stem.add(torso);
            // Shaggy mossy fur tufts hanging off the body.
            const fur = this._mat(p.accent, 1, 0.9);
            for (let i = 0; i < 22; i++) { const a = this.idRand() * Math.PI * 2, y = 0.45 + this.idRand() * 0.95; const rr = 0.38 + this.idRand() * 0.06; const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2 + this.idRand() * 0.16, 4), fur); tuft.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.9); tuft.rotation.x = Math.PI; tuft.rotation.z = Math.cos(a) * 0.4; this.stem.add(tuft); }
            this.bodyGroup.add(this.stem);
            // Slow drowsy sloth face (FLOWER head) - long snout, half-shut eyes.
            this.flower = new THREE.Group();
            const headM = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), bark); headM.scale.set(0.95, 0.9, 1.1); this.flower.add(headM);
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), bark); snout.scale.set(0.9, 0.8, 1.2); snout.position.set(0, -0.06, 0.22); this.flower.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x1a120a, 1, 0.4)); nose.position.set(0, -0.04, 0.36); this.flower.add(nose);
            for (const ex of [-0.1, 0.1]) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0x2a1e10, 1, 0.8)); patch.scale.set(1, 1.3, 0.4); patch.position.set(ex, 0.05, 0.2); this.flower.add(patch); this._eye(this.flower, ex, 0.04, 0.24, 0.04, 0x111111); }
            this.flower.position.set(0, 1.5, 0.06); this.bodyGroup.add(this.flower);
            // Long curling vine-limb arms with hooked claws (VINE_1/2).
            const vineMat = this._mat(0x5a7a3a, 1, 0.85);
            this.vine1 = this._gnarledLimb(-1, vineMat, 1.05, 1.0); this.vine2 = this._gnarledLimb(1, vineMat, 1.05, 1.0);
            for (const v of [this.vine1, this.vine2]) for (let i = 0; i < 3; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 4), this._mat(0x3a2a18, 1, 0.5)); claw.position.set(v._side * (0.34 + i * 0.04), 1.0, (i - 1) * 0.07); claw.rotation.z = v._side * 1.3; v.add(claw); }
            this.roots = this._buildRoots(p.bodyColor);
            this._wirePlant([snout, nose]);
        }

        // ── Rotwood Entangler: rotting decayed tree-guardian, fungus-spotted bark,
        //    lashing root tendrils ─────────────────────────────────────────────
        _buildRotwoodEntangler() {
            const p = this.profile;
            const rot = this._skinMat(p.bodyColor, 1.0);
            // Crooked, hollowed, decaying trunk (STEM) - open rot-cavity in front.
            this.stem = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.6, 8), rot); torso.position.y = 0.9; this.stem.add(torso);
            const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), this._mat(0x140e06, 1, 0.7)); cavity.scale.set(1, 1.6, 0.5); cavity.position.set(0, 0.95, 0.3); this.stem.add(cavity);
            // Fungus shelf-spots and pale mushroom clusters on the bark.
            for (let i = 0; i < 10; i++) { const a = this.idRand() * Math.PI * 2, y = 0.4 + this.idRand() * 1.1; const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.1, 0.05, 8, 1, false, 0, Math.PI), this._mat(p.accent, 1, 0.7)); shelf.position.set(Math.cos(a) * 0.34, y, Math.sin(a) * 0.34); shelf.rotation.set(Math.PI / 2, 0, -a); this.stem.add(shelf); }
            for (let i = 0; i < 6; i++) { const a = this.idRand() * Math.PI * 2, y = 0.5 + this.idRand() * 0.9; const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0xd8c8a0, 1, 0.6)); cap.position.set(Math.cos(a) * 0.36, y, Math.sin(a) * 0.36); this.stem.add(cap); }
            // Sickly glowering eyes either side of the cavity.
            this._eye(this.stem, -0.16, 1.28, 0.26, 0.06, 0x8aaa3a); this._eye(this.stem, 0.16, 1.28, 0.26, 0.06, 0x8aaa3a);
            this.bodyGroup.add(this.stem);
            // Mouldering broken crown of dead branches (FLOWER).
            this.flower = new THREE.Group();
            for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.4 + this.idRand() * 0.2, 5), rot); twig.position.set(Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16); twig.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); this.flower.add(twig); }
            this.flower.position.set(0, 1.95, 0); this.bodyGroup.add(this.flower);
            // Lashing root-tendril arms (VINE_1/2) tipped with grasping rootlets.
            const tendril = this._mat(0x3a3018, 1, 0.95);
            this.vine1 = this._gnarledLimb(-1, tendril, 0.95, 1.1); this.vine2 = this._gnarledLimb(1, tendril, 0.95, 1.1);
            for (const v of [this.vine1, this.vine2]) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const rootlet = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.18, 4), tendril); rootlet.position.set(v._side * 0.34 + Math.cos(a) * 0.06, 1.08, Math.sin(a) * 0.06); rootlet.rotation.z = v._side * 0.6; v.add(rootlet); }
            this.roots = this._buildRoots(0x2a2010);
            this._wirePlant([cavity]);
        }

        // ── Sylvan Barkstalker: bark-patterned camouflaged plant-stalker, nearly
        //    invisible, thin vine limbs ─────────────────────────────────────────
        _buildSylvanBarkstalker() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.95);
            // Slender flattened bark-board body (STEM) - leaf-edged for camouflage.
            this.stem = new THREE.Group();
            const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.7, 0.16), bark); board.position.y = 0.95; this.stem.add(board);
            // Ragged leaf-fringe edges down both sides (camo silhouette breakup).
            const leafEdge = this._mat(p.accent, 1, 0.8);
            for (let i = 0; i < 7; i++) { for (const sx of [-0.2, 0.2]) { const lf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), leafEdge); lf.position.set(sx, 0.4 + i * 0.2, 0.02); lf.rotation.z = (sx < 0 ? 1.3 : -1.3); this.stem.add(lf); } }
            // Bark grain striations.
            for (let i = 0; i < 4; i++) { const grain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 0.02), this._mat(0x35421f, 1, 0.85)); grain.position.set(-0.1 + i * 0.07, 0.95, 0.08); this.stem.add(grain); }
            // Barely-there narrow vertical-slit eyes (low-glow, camouflaged).
            for (const ex of [-0.07, 0.07]) { const slit = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.1, 0.02), this._mat(0xc8e26a, 0.85, 0.3, 0x4a6a10)); slit.position.set(ex, 1.45, 0.085); this.stem.add(slit); }
            this.bodyGroup.add(this.stem);
            // Sparse leafy head-tuft (FLOWER) blending into foliage.
            this.flower = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this._mat(p.accent, 0.95, 0.8)); leaf.scale.set(1.8, 0.18, 0.9); leaf.position.set(Math.cos(a) * 0.12, this.idRand() * 0.16, Math.sin(a) * 0.12); leaf.rotation.y = a; this.flower.add(leaf); }
            this.flower.position.set(0, 1.85, 0); this.bodyGroup.add(this.flower);
            // Very thin elongated vine limbs (VINE_1/2) - twig-like.
            const twigMat = this._mat(0x4a4a2a, 0.95, 0.9);
            const mkTwigArm = (side) => {
                const g = new THREE.Group();
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.3, 0.3, 0.05), new THREE.Vector3(side * 0.55, 0.55, -0.05), new THREE.Vector3(side * 0.7, 0.85, 0.08)]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.022, 5, false), twigMat));
                for (let i = 0; i < 3; i++) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 4), twigMat); tip.position.set(side * (0.66 + i * 0.03), 0.85, (i - 1) * 0.05); tip.rotation.z = side * 0.5; g.add(tip); }
                g.position.set(0, 1.0, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.vine1 = mkTwigArm(-1); this.vine2 = mkTwigArm(1);
            this.roots = this._buildRoots(p.bodyColor);
            this._wirePlant();
        }

        // ── Psionic Fenbeast: warped bog-tree, psychic glow, floating dust ──────
        _buildPsionicFenbeast() {
            const p = this.profile;
            const bog = this._skinMat(p.bodyColor, 0.92);
            // Warped, twisted bog-trunk (TRUNK) leaning with knotted bulges.
            this.trunk = new THREE.Group();
            const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 0.9, 8), bog); lower.position.y = 0.5; this.trunk.add(lower);
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.9, 8), bog); upper.position.set(0.08, 1.3, 0); upper.rotation.z = -0.18; this.trunk.add(upper);
            for (let i = 0; i < 5; i++) { const a = this.idRand() * Math.PI * 2, y = 0.4 + this.idRand() * 1.1; const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.12 + this.idRand() * 0.06, 8, 7), bog); bulge.position.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.3); bulge.scale.set(1, 0.8, 1); this.trunk.add(bulge); }
            // Pulsing psychic core embedded in the trunk + glowing third-eye.
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), this._mat(p.accent, 0.85, 0.2, p.accent)); core.position.set(0.04, 1.0, 0.26); this.trunk.add(core); this._psiCore = core;
            this._eye(this.trunk, 0, 1.45, 0.22, 0.07, p.accent);
            this.bodyGroup.add(this.trunk);
            // Hovering hallucinatory dust motes (small glowing emissive specks).
            this._psiDust = new THREE.Group();
            for (let i = 0; i < 14; i++) { const a = this.idRand() * Math.PI * 2, rr = 0.4 + this.idRand() * 0.5, y = 0.5 + this.idRand() * 1.6; const mote = new THREE.Mesh(new THREE.SphereGeometry(0.03 + this.idRand() * 0.025, 6, 6), this._mat(0xd8a8ff, 0.7, 0.2, 0xae6aff)); mote.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); mote._a = a; mote._rr = rr; mote._yb = y; this._psiDust.add(mote); }
            this.bodyGroup.add(this._psiDust);
            // Crown of glowing psychic tendrils / will-o-wisp blooms (CROWN).
            this.crown = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const tendril = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.4, 5), bog); tendril.position.set(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14); tendril.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7); this.crown.add(tendril); const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 9), this._mat(0xc89aff, 0.8, 0.2, p.accent)); wisp.position.set(Math.cos(a) * 0.24, 0.34, Math.sin(a) * 0.24); this.crown.add(wisp); }
            this.crown.position.set(0.1, 1.85, 0); this.bodyGroup.add(this.crown);
            // Floating warped branch-arms wreathed in psi-light (BRANCH_1/2).
            this.branch1 = this._gnarledLimb(-1, bog, 1.1, 0.9); this.branch2 = this._gnarledLimb(1, bog, 1.1, 0.9);
            for (const b of [this.branch1, this.branch2]) { const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 9), this._mat(0xc89aff, 0.8, 0.2, p.accent)); orb.position.set(b._side * 0.36, 0.9, 0.1); b.add(orb); }
            this.roots = this._buildRoots(p.bodyColor);
            this._wireTree();
        }

        // ── Void Parasite Plant: carnivorous void-infected pitcher plant, toothy
        //    maw, dark void tendrils ──────────────────────────────────────────────
        _buildVoidParasitePlant() {
            const p = this.profile;
            const husk = this._skinMat(p.bodyColor, 0.6);
            // Bulbous swollen pitcher stalk (STEM) tapering down, void-bruised.
            this.stem = new THREE.Group();
            const pitcher = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.34, 1.2, 10), husk); pitcher.position.y = 0.7; this.stem.add(pitcher);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), husk); belly.scale.set(1, 1.1, 1); belly.position.y = 0.5; this.stem.add(belly);
            // Pulsing void-rot veins glowing across the belly.
            for (let i = 0; i < 8; i++) { const a = this.idRand() * Math.PI * 2, y = 0.35 + this.idRand() * 0.6; const vein = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), this._mat(p.accent, 1, 0.3, p.accent)); vein.position.set(Math.cos(a) * 0.32, y, Math.sin(a) * 0.32); vein.lookAt(Math.cos(a) * 2, y + 1, Math.sin(a) * 2); this.stem.add(vein); }
            this.bodyGroup.add(this.stem);
            // Toothy gaping maw lid (FLOWER): a flared pitcher rim ringed with fangs.
            this.flower = new THREE.Group();
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 10, 18), this._mat(0x3a1a4a, 1, 0.6)); rim.rotation.x = Math.PI / 2; this.flower.add(rim);
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x06020a, 1, 0.5, 0x4a1060)); gullet.rotation.x = Math.PI; gullet.position.y = 0.02; this.flower.add(gullet);
            for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), this._mat(0xe8d8f0, 1, 0.3)); fang.position.set(Math.cos(a) * 0.24, 0.02, Math.sin(a) * 0.24); fang.rotation.x = Math.PI; this.flower.add(fang); }
            this._eye(this.flower, -0.12, 0.16, 0.2, 0.06, p.accent); this._eye(this.flower, 0.12, 0.16, 0.2, 0.06, p.accent);
            this.flower.position.set(0, 1.34, 0); this.bodyGroup.add(this.flower);
            // Two dark grasping void-tendril vines (VINE_1/2).
            const tendrilMat = this._mat(0x1a0e26, 1, 0.5, 0x6a10a0);
            const mkTendril = (side) => {
                const g = this._gnarledLimb(side, tendrilMat, 0.95, 1.1);
                const grip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 9), this._mat(p.accent, 0.9, 0.3, p.accent)); grip.position.set(side * 0.36, 1.1, 0.1); g.add(grip);
                for (let i = 0; i < 3; i++) { const hook = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14, 4), tendrilMat); hook.position.set(side * (0.34 + i * 0.03), 1.0, (i - 1) * 0.06); hook.rotation.z = side * 1.2; g.add(hook); }
                return g;
            };
            this.vine1 = mkTendril(-1); this.vine2 = mkTendril(1);
            this.roots = this._buildRoots(0x140a1c);
            this._wirePlant([belly]);
        }

        // ── Phantom Chloroblade: spectral translucent plant, ebony leaf-blades,
        //    dripping glowing sap ──────────────────────────────────────────────────
        _buildPhantomChloroblade() {
            const p = this.profile;
            const ghost = this._mat(p.bodyColor, 0.45, 0.3, 0x1a3a30);
            this._materials.push(ghost);
            // Slender translucent ghostly stem (STEM).
            this.stem = new THREE.Group();
            const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.3, 8), ghost); core.position.y = 0.65; this.stem.add(core);
            // Glowing sap node knots along the stem.
            for (let i = 0; i < 4; i++) { const node = new THREE.Mesh(new THREE.SphereGeometry(0.07, 9, 9), this._mat(p.accent, 0.7, 0.2, p.accent)); node.position.set(0, 0.25 + i * 0.32, 0.02); this.stem.add(node); }
            this.bodyGroup.add(this.stem);
            // Crown of ebony leaf-BLADES radiating like a flower of swords (FLOWER).
            this.flower = new THREE.Group();
            const bladeMat = this._mat(0x0a0a0a, 0.85, 0.35, 0x103a30);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 4), bladeMat);
                blade.position.set(Math.cos(a) * 0.22, 0.1, Math.sin(a) * 0.22);
                blade.scale.set(0.5, 1, 1.6); blade.rotation.z = Math.cos(a) * 0.9; blade.rotation.x = -Math.sin(a) * 0.9;
                this.flower.add(blade);
                // Glowing sap drip on each blade tip.
                const drip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 7), this._mat(p.accent, 0.8, 0.2, p.accent)); drip.scale.y = 2.0; drip.position.set(Math.cos(a) * 0.36, -0.05, Math.sin(a) * 0.36); this.flower.add(drip);
            }
            const heart = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), this._mat(p.accent, 0.7, 0.2, p.accent)); heart.position.y = 0.06; this.flower.add(heart);
            this.flower.position.set(0, 1.45, 0); this.bodyGroup.add(this.flower);
            // Two drooping spectral leaf-blade vines (VINE_1/2).
            const mkBladeVine = (side) => {
                const g = new THREE.Group();
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.55, 5), ghost); stalk.position.set(side * 0.2, 0.18, 0); stalk.rotation.z = side * 0.7; g.add(stalk);
                const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 4), bladeMat); leaf.scale.set(0.4, 1, 1.3); leaf.position.set(side * 0.42, 0.36, 0); leaf.rotation.z = side * 1.4; g.add(leaf);
                const drip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 7), this._mat(p.accent, 0.8, 0.2, p.accent)); drip.scale.y = 1.8; drip.position.set(side * 0.5, 0.18, 0); g.add(drip);
                g.position.set(0, 0.6, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.vine1 = mkBladeVine(-1); this.vine2 = mkBladeVine(1);
            this.roots = this._buildRoots(0x142420);
            this._wirePlant();
        }

        // ── Rattus Sapscream: venomous rat-fern hybrid, fern fronds, rodent fanged
        //    bloom head dripping corrosive sap ──────────────────────────────────────
        _buildRattusSapscream() {
            const p = this.profile;
            const stalkMat = this._skinMat(p.bodyColor, 0.8);
            // Wiry fern stem (STEM) bundle.
            this.stem = new THREE.Group();
            const main = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 7), stalkMat); main.position.y = 0.6; this.stem.add(main);
            this.bodyGroup.add(this.stem);
            // Rodent fanged bloom HEAD (FLOWER): a rat skull-flower with ears + buck teeth.
            this.flower = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), stalkMat); skull.scale.set(0.9, 0.85, 1.2); this.flower.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 8), stalkMat); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.26); this.flower.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 7), this._mat(0xc0506a, 1, 0.4)); nose.position.set(0, -0.02, 0.4); this.flower.add(nose);
            // Big round rodent ears (petal-like).
            for (const ex of [-0.16, 0.16]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), this._mat(0x4a3a20, 1, 0.7)); ear.scale.set(1, 1, 0.3); ear.position.set(ex, 0.16, -0.02); this.flower.add(ear); }
            this._eye(this.flower, -0.1, 0.05, 0.16, 0.05, 0xaa1010); this._eye(this.flower, 0.1, 0.05, 0.16, 0.05, 0xaa1010);
            // Buck fangs dripping corrosive sap.
            for (const fx of [-0.05, 0.05]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), this._mat(0xe8e0b0, 1, 0.4)); fang.position.set(fx, -0.14, 0.28); fang.rotation.x = Math.PI; this.flower.add(fang); const sap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 7), this._mat(p.accent, 0.9, 0.2, p.accent)); sap.scale.y = 1.8; sap.position.set(fx, -0.26, 0.28); this.flower.add(sap); }
            this.flower.position.set(0, 1.3, 0.04); this.bodyGroup.add(this.flower);
            // Two fern-frond VINES (VINE_1/2): a rachis lined with leaflets.
            const frondMat = this._mat(0x4a8a30, 1, 0.8);
            const mkFrond = (side) => {
                const g = new THREE.Group();
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.2, 0.22, 0.05), new THREE.Vector3(side * 0.36, 0.5, 0), new THREE.Vector3(side * 0.3, 0.78, -0.08)]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 5, false), frondMat));
                const pts = curve.getPoints(8);
                for (let i = 1; i < pts.length; i++) { for (const ls of [-1, 1]) { const leaflet = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), frondMat); leaflet.scale.set(0.5, 1, 1); leaflet.position.copy(pts[i]); leaflet.position.x += ls * 0.1; leaflet.rotation.z = ls * 1.2; g.add(leaflet); } }
                g.position.set(0, 0.45, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.vine1 = mkFrond(-1); this.vine2 = mkFrond(1);
            this.roots = this._buildRoots(0x4a3a22);
            this._wirePlant([snout]);
        }

        // ── Luminescent Mycelian: towering glowing fungal colossus, luminous cap,
        //    drifting spore clouds ───────────────────────────────────────────────────
        _buildLuminescentMycelian() {
            const p = this.profile;
            const stalkMat = this._skinMat(0xbfd8d0, 0.6);
            // Tall thick glowing stalk (STALK) with bioluminescent ring bands.
            this.stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.8, 12), stalkMat);
            this.stalk.position.y = 0.95; this.bodyGroup.add(this.stalk);
            for (let i = 0; i < 5; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.24 - i * 0.012, 0.03, 8, 16), this._mat(p.accent, 0.9, 0.2, p.accent)); band.position.y = 0.45 + i * 0.3; band.rotation.x = Math.PI / 2; this.bodyGroup.add(band); }
            // Wide luminous parasol CAP - glowing gilled underside.
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const capMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: skin, roughness: 0.5, transparent: true, emissive: new THREE.Color(p.accent), emissiveIntensity: 0.35 }); this._materials.push(capMat);
            this.cap = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), capMat); dome.scale.set(1.15, 0.6, 1.15); this.cap.add(dome);
            // Radiating glowing gills underneath.
            for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const gill = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.02), this._mat(p.accent, 0.85, 0.2, p.accent)); gill.position.set(Math.cos(a) * 0.36, -0.06, Math.sin(a) * 0.36); gill.rotation.y = -a; this.cap.add(gill); }
            const glowOrb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.6, 0.2, p.accent)); glowOrb.position.y = -0.1; this.cap.add(glowOrb);
            this.cap.position.y = 1.9; this.bodyGroup.add(this.cap);
            // Drifting luminous SPORE clouds floating around the cap.
            this.spores = new THREE.Group();
            for (let i = 0; i < 16; i++) { const a = this.idRand() * Math.PI * 2, rr = 0.4 + this.idRand() * 0.6, y = 1.5 + this.idRand() * 0.9; const sp = new THREE.Mesh(new THREE.SphereGeometry(0.04 + this.idRand() * 0.05, 7, 7), this._mat(0xc8fff0, 0.6, 0.2, p.accent)); sp.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); sp._a = a; sp._rr = rr; sp._yb = y; this.spores.add(sp); }
            this.bodyGroup.add(this.spores);
            this.roots = this._buildRoots(0x4a6a6a);
            this._wireMushroom();
        }

        // ── Eldergloom Sporemantle: colossal dark mushroom, wide umbrella cap
        //    raining acidic spores ────────────────────────────────────────────────
        _buildEldergloomSporemantle() {
            const p = this.profile;
            const stalkMat = this._skinMat(0x3a3040, 0.85);
            // Massive dark stalk (STALK) with a draped skirt-mantle at its base.
            this.stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.4, 1.7, 11), stalkMat);
            this.stalk.position.y = 0.9; this.bodyGroup.add(this.stalk);
            const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 0.5, 14, 1, true), this._mat(0x261e30, 0.9, 0.85)); mantle.position.y = 0.95; this.bodyGroup.add(mantle); this.stalk.add(mantle);
            // Wide umbrella CAP - very broad shallow dome, dark with acid-pocked pits.
            this.cap = new THREE.Group();
            const umbrella = new THREE.Mesh(new THREE.SphereGeometry(0.85, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), this._mat(p.bodyColor, 1, 0.8)); umbrella.scale.set(1.3, 0.55, 1.3); this.cap.add(umbrella);
            // Drooping cap-rim ribs giving the umbrella silhouette.
            for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const rib = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), this._mat(0x1a141f, 1, 0.85)); rib.position.set(Math.cos(a) * 0.95, -0.04, Math.sin(a) * 0.95); rib.rotation.x = Math.PI; rib.rotation.z = Math.cos(a) * 0.3; this.cap.add(rib); }
            // Glowing acidic pits on the cap surface.
            for (let i = 0; i < 9; i++) { const a = this.idRand() * Math.PI * 2, rr = 0.2 + this.idRand() * 0.6; const pit = new THREE.Mesh(new THREE.SphereGeometry(0.06 + this.idRand() * 0.04, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); pit.position.set(Math.cos(a) * rr, 0.18, Math.sin(a) * rr); this.cap.add(pit); }
            this.cap.position.y = 1.95; this.bodyGroup.add(this.cap);
            // Raining acidic SPORE droplets falling from the cap brim.
            this.spores = new THREE.Group();
            for (let i = 0; i < 16; i++) { const a = this.idRand() * Math.PI * 2, rr = 0.6 + this.idRand() * 0.5; const drop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 7), this._mat(p.accent, 0.7, 0.2, p.accent)); drop.scale.y = 2.0; drop.position.set(Math.cos(a) * rr, 0.6 + this.idRand() * 1.0, Math.sin(a) * rr); drop._fall = this.idRand(); drop._x = Math.cos(a) * rr; drop._z = Math.sin(a) * rr; this.spores.add(drop); }
            this.bodyGroup.add(this.spores);
            this.roots = this._buildRoots(0x201828);
            this._wireMushroom();
        }

        // ── Motivational Speaker :EP: charismatic mushroom-entity, podium-cap,
        //    wide grinning face ─────────────────────────────────────────────────────
        _buildMotivationalSpeakerEP() {
            const p = this.profile;
            const stalkMat = this._skinMat(0xf0e0c0, 0.7);
            // Confident upright stalk-body (STALK) - a podium-stand torso.
            this.stalk = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.6, 4, 12), stalkMat); torso.position.y = 0.6; this.stalk.add(torso);
            // A pointing raised arm gesture (motivational!).
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), stalkMat); arm.position.set(0.3, 0.95, 0.1); arm.rotation.z = -1.0; arm.rotation.x = -0.4; this.stalk.add(arm);
            const fist = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 9), stalkMat); fist.position.set(0.5, 1.2, 0.16); this.stalk.add(fist);
            const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.12, 5), stalkMat); thumb.position.set(0.5, 1.32, 0.16); this.stalk.add(thumb);
            // Big charismatic grinning face on the stalk.
            this._eye(this.stalk, -0.1, 0.78, 0.22, 0.08, 0x222222); this._eye(this.stalk, 0.1, 0.78, 0.22, 0.08, 0x222222);
            const brows = [-0.1, 0.1].map((bx, i) => { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), this._mat(0x5a3a1a, 1, 0.6)); brow.position.set(bx, 0.9, 0.23); brow.rotation.z = (i ? -0.3 : 0.3); this.stalk.add(brow); return brow; });
            const grin = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = -1.0 + (i / 8) * 2.0; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(0x8a2018, 1, 0.5)); seg.position.set(Math.sin(a) * 0.18, -Math.cos(a) * 0.05 - 0.02, 0.25); grin.add(seg); }
            // Bright white teeth in the grin.
            for (let i = 0; i < 5; i++) { const a = -0.7 + (i / 4) * 1.4; const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), this._mat(0xffffff, 1, 0.3)); tooth.position.set(Math.sin(a) * 0.15, 0.6, 0.27); this.stalk.add(tooth); }
            grin.position.set(0, 0.62, 0); this.stalk.add(grin);
            this.bodyGroup.add(this.stalk);
            // Podium-like flat-topped CAP - a broad lectern-disc with a glowing rim.
            this.cap = new THREE.Group();
            const top = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.5, 0.16, 18), this._mat(p.bodyColor, 1, 0.55)); this.cap.add(top);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 10, 24), this._mat(p.accent, 0.9, 0.2, p.accent)); rim.rotation.x = Math.PI / 2; rim.position.y = -0.04; this.cap.add(rim);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(p.bodyColor, 1, 0.55)); dome.scale.set(1, 0.55, 1); dome.position.y = 0.08; this.cap.add(dome);
            // A shiny star emblem on the podium front (the :EP motif).
            const star = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.05, 5), this._mat(p.accent, 1, 0.2, p.accent)); star.rotation.x = Math.PI / 2; star.position.set(0, 0.0, 0.5); this.cap.add(star);
            this.cap.position.y = 1.55; this.bodyGroup.add(this.cap);
            // Confetti-burst SPORE_SACS popping above (celebration energy).
            this.spores = new THREE.Group();
            const colours = [0xff4a4a, 0x4affa0, 0x4a8aff, 0xffe24a, p.accent];
            for (let i = 0; i < 12; i++) { const a = this.idRand() * Math.PI * 2, rr = this.idRand() * 0.5; const bit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), this._mat(colours[i % colours.length], 0.9, 0.3)); bit.position.set(Math.cos(a) * rr, 1.9 + this.idRand() * 0.4, Math.sin(a) * rr); bit.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.spores.add(bit); }
            this.bodyGroup.add(this.spores);
            this.roots = this._buildRoots(0xc8b890);
            this._wireMushroom([arm, fist, thumb, grin, ...brows]);
        }

        // ── Creeping Luminspore: low, sprawling bioluminescent fungus - a flat
        //    creeping cap hugging the ground, glowing spore-pods on crawling roots ─
        _buildCreepingLuminspore() {
            const p = this.profile;
            // Short squat slumped stalk (STALK) - leaning low, not upright.
            const stalkMat = this._skinMat(0x3a5a52, 0.7);
            this.stalk = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.45, 10), stalkMat);
            trunk.position.set(0, 0.22, -0.1); trunk.rotation.x = 0.5; this.stalk.add(trunk);
            // Glowing vein lines crawling up the stalk.
            for (let i = 0; i < 4; i++) { const a = this.idRand() * Math.PI * 2; const vein = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.34, 0.015), this._mat(p.accent, 0.9, 0.2, p.accent)); vein.position.set(Math.cos(a) * 0.18, 0.22, -0.1 + Math.sin(a) * 0.1); vein.rotation.x = 0.5; this.stalk.add(vein); }
            this.bodyGroup.add(this.stalk);
            // Flat creeping CAP - wide low shelf-fan hugging the ground, glowing rim.
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const capMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: skin, roughness: 0.55, transparent: true, emissive: new THREE.Color(p.accent), emissiveIntensity: 0.2 }); this._materials.push(capMat);
            this.cap = new THREE.Group();
            const fan = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), capMat); fan.scale.set(1.4, 0.4, 1.1); this.cap.add(fan);
            // Glowing gill-ridges fanning out underneath.
            for (let i = 0; i < 11; i++) { const a = -1.0 + (i / 10) * 2.0; const gill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.015), this._mat(p.accent, 0.85, 0.2, p.accent)); gill.position.set(Math.sin(a) * 0.34, -0.04, 0.36 - Math.abs(a) * 0.05); gill.rotation.y = -a * 1.2; this.cap.add(gill); }
            this.cap.position.set(0, 0.5, 0.18); this.cap.rotation.x = -0.35; this.bodyGroup.add(this.cap);
            // Crawling ROOTS - long flat tendrils splaying out across the ground.
            this.roots = new THREE.Group();
            const rootMat = this._skinMat(0x2a3a30, 0.95);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * 0.6, 0.02, Math.sin(a) * 0.6), new THREE.Vector3(Math.cos(a) * 0.85, 0.05, Math.sin(a) * 0.85)]);
                this.roots.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.035, 5, false), rootMat));
            }
            this.bodyGroup.add(this.roots);
            // Glowing SPORE_SACS - luminous pods clustered on the creeping roots.
            this.spores = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = this.idRand() * Math.PI * 2, rr = 0.3 + this.idRand() * 0.55; const pod = new THREE.Mesh(new THREE.SphereGeometry(0.07 + this.idRand() * 0.04, 9, 9), this._mat(0xc8fff0, 0.9, 0.2, p.accent)); pod.position.set(Math.cos(a) * rr, 0.08 + this.idRand() * 0.04, Math.sin(a) * rr); pod._yb = pod.position.y; this.spores.add(pod); }
            this.bodyGroup.add(this.spores);
            this._wireMushroom();
            this.swayTop = this.cap;
        }

        // ── Crying Tree: ancient weeping tree, many sorrowful faces in the bark
        //    dripping sap-tears, drooping willow crown ──────────────────────────────
        _buildCryingTree() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 1.0);
            // Broad gnarled weeping TRUNK with multiple sorrowful faces.
            this.trunk = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 1.6, 10), bark); torso.position.y = 0.85; this.trunk.add(torso);
            // Several mournful faces carved at different heights, each weeping.
            this._cryDrips = [];
            const faceY = [0.65, 1.05, 1.4];
            for (let f = 0; f < faceY.length; f++) {
                const fy = faceY[f], fz = 0.3 - f * 0.02, ang = (f - 1) * 0.6, fx0 = Math.sin(ang) * 0.25;
                const fz0 = Math.cos(ang) * 0.3;
                // Downturned sorrowful eyes (sad slits) + dripping tear beads.
                for (const ex of [-0.09, 0.09]) {
                    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x140e08, 1, 0.6)); eye.scale.set(1.2, 0.7, 0.5); eye.position.set(fx0 + ex, fy + 0.08, fz0); eye.rotation.z = (ex < 0 ? -0.4 : 0.4); this.trunk.add(eye);
                    const tear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 7), this._mat(0xbfe8d0, 0.85, 0.2, p.accent)); tear.scale.y = 2.2; tear.position.set(fx0 + ex, fy - 0.06, fz0 + 0.02); tear._x = tear.position.x; tear._z = tear.position.z; tear._top = fy - 0.06; this.trunk.add(tear); this._cryDrips.push(tear);
                }
                // Down-curved frowning mouth (segmented arc, ends pointing down).
                for (let i = 0; i < 5; i++) { const a = -0.8 + (i / 4) * 1.6; const seg = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), this._mat(0x100a06, 1, 0.6)); seg.position.set(fx0 + Math.sin(a) * 0.1, fy - 0.16 + Math.cos(a) * 0.05, fz0); this.trunk.add(seg); }
            }
            this.bodyGroup.add(this.trunk);
            // Drooping willow CROWN - long weeping tendril fronds hanging down.
            this.crown = new THREE.Group();
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), this._mat(0x3a5a3a, 1, 0.85)); cap.scale.set(1.3, 0.7, 1.3); this.crown.add(cap);
            const willowMat = this._mat(0x4a6a44, 1, 0.85);
            for (let i = 0; i < 14; i++) {
                const a = this.idRand() * Math.PI * 2, rr = 0.3 + this.idRand() * 0.25;
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr), new THREE.Vector3(Math.cos(a) * rr * 1.1, -0.3, Math.sin(a) * rr * 1.1), new THREE.Vector3(Math.cos(a) * rr * 1.0, -0.65, Math.sin(a) * rr * 1.0)]);
                this.crown.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.018, 4, false), willowMat));
            }
            this.crown.position.set(0, 1.85, 0); this.bodyGroup.add(this.crown);
            // Drooping branch-arms (BRANCH_1/2) sagging downward in sorrow.
            const mkSadArm = (side) => {
                const g = new THREE.Group();
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.28, 0.05, 0.05), new THREE.Vector3(side * 0.46, -0.2, -0.04), new THREE.Vector3(side * 0.5, -0.55, 0.06)]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.045, 5, false), bark));
                const drop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 7, 7), this._mat(0xbfe8d0, 0.85, 0.2, p.accent)); drop.scale.y = 2.0; drop.position.set(side * 0.5, -0.62, 0.06); g.add(drop);
                g.position.set(0, 1.2, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.branch1 = mkSadArm(-1); this.branch2 = mkSadArm(1);
            this.roots = this._buildRoots(p.bodyColor);
            this._wireTree();
        }

        // ── Backwards Tree: an upside-down tree - leafy crown buried in the soil,
        //    bare clawing roots reaching up into the sky ───────────────────────────
        _buildBackwardsTree() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 1.0);
            // Inverted TRUNK - fat at the bottom (where the buried crown is), tapering up.
            this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.18, 1.4, 9), bark);
            this.trunk.position.y = 0.7; this.bodyGroup.add(this.trunk);
            // Buried leafy CROWN - a half-sunken cluster of foliage at ground level.
            this.crown = new THREE.Group();
            const crownMat = this._mat(p.accent, 1, 0.85);
            const blobs = [[0, 0, 0, 0.42], [-0.34, 0.06, 0.12, 0.32], [0.34, 0.06, -0.1, 0.32], [0.1, -0.06, 0.3, 0.28], [-0.12, -0.02, -0.28, 0.28]];
            for (const [x, y, z, r] of blobs) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 11, 8, 0, Math.PI * 2, 0, Math.PI * 0.7), crownMat); b.position.set(x, y, z); this.crown.add(b); }
            // A dark soil mound ringing the buried crown.
            const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.18, 16), this._mat(0x2a1e12, 1, 1.0)); mound.position.y = 0.02; this.crown.add(mound);
            this.crown.position.set(0, 0.05, 0); this.bodyGroup.add(this.crown);
            // Bare clawing ROOTS reaching UP into the sky (the "branches" of this tree).
            this.roots = new THREE.Group();
            const rootMat = this._skinMat(0x6a5840, 0.95);
            const mkSkyRoot = (side, lean, baseY) => {
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 0.08, 0, 0), new THREE.Vector3(side * (0.12 + lean), 0.4, 0.04), new THREE.Vector3(side * (0.06 + lean), 0.8, -0.05), new THREE.Vector3(side * (0.16 + lean), 1.15, 0.08)]);
                const limb = new THREE.Group();
                limb.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 5, false), rootMat));
                // Clawing twig-fingers at the tip, grasping the sky.
                for (let i = 0; i < 4; i++) { const ta = (i / 4) * Math.PI * 2; const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.2, 4), rootMat); claw.position.set(side * (0.16 + lean) + Math.cos(ta) * 0.06, 1.2, 0.08 + Math.sin(ta) * 0.06); claw.rotation.set(Math.cos(ta) * 0.5, 0, -Math.sin(ta) * 0.5); limb.add(claw); }
                limb.position.set(0, baseY, 0); this.roots.add(limb); return limb;
            };
            this._skyRoot1 = mkSkyRoot(-1, 0.18, 1.3);
            this._skyRoot2 = mkSkyRoot(1, 0.18, 1.3);
            const centerRoot = mkSkyRoot(1, -0.1, 1.35); centerRoot.scale.set(0.9, 1.1, 0.9);
            this.bodyGroup.add(this.roots);
            // Two lower side-roots splaying out (BRANCH_1/2) like an upturned root-ball.
            const mkSideRoot = (side) => {
                const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.3, 0.25, 0.05), new THREE.Vector3(side * 0.5, 0.55, -0.05), new THREE.Vector3(side * 0.58, 0.85, 0.08)]);
                const g = new THREE.Group();
                g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.04, 5, false), rootMat));
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), rootMat); tip.position.set(side * 0.58, 0.95, 0.08); g.add(tip);
                g.position.set(0, 1.25, 0); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.branch1 = mkSideRoot(-1); this.branch2 = mkSideRoot(1);
            // Wire: TRUNK gone hides all; CROWN is the buried bulb; ROOTS (sky roots) +
            // BRANCH_1/2 are the upward limbs. Override cascade so trunk-loss hides skyroots too.
            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK'], hide: [this.trunk, this.crown, this.roots, this.branch1, this.branch2] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['BRANCH_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2'], hide: [this.branch2] },
            ];
            this.swayTop = this.roots;
        }

        animatePose(deltaTime) {
            const t = this.animTime;

            let growth = 1.0;
            if (this.currentAnimation === 'spawn') growth = Math.min(1.0, t / 0.8);

            let sway = Math.sin(t * 1.5) * 0.05;
            if (this.currentAnimation === 'attack') sway += Math.sin(t * 9) * 0.18;
            else if (this.currentAnimation === 'specialattack') sway += Math.sin(t * 12) * 0.28;
            else if (this.currentAnimation === 'hit') sway += Math.sin(t * 28) * Math.exp(-t * 6) * 0.35;

            this.model.rotation.z = sway;
            this.applyModelScale(growth);

            // The crown/cap/flower "breathes" subtly.
            if (this.swayTop && this.swayTop.visible) {
                const b = 1.0 + Math.sin(t * 2.2) * 0.03;
                this.swayTop.scale.setScalar(b);
            }

            // Per-variant idle flavour for the bespoke uniques.
            const fast = (this.currentAnimation === 'attack' || this.currentAnimation === 'specialattack');
            switch (this.variant) {
                case 'elderwoodguardian':
                case 'flatwoodsentinel':
                case 'forestsvengeance':
                case 'hellthorndryad':
                case 'moonlitwendigo': {
                    const v1 = this.vine1 || this.branch1, v2 = this.vine2 || this.branch2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 8) * 0.6 : Math.sin(t * 1.6) * 0.12);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 8 + 0.6) * 0.6 : -Math.sin(t * 1.6 + 0.4) * 0.12);
                    break;
                }
                case 'mossviper': {
                    if (this.flower && this.flower.visible) { this.flower.rotation.y = Math.sin(t * 1.1) * 0.4; this.flower.position.y = 1.3 + Math.sin(t * 1.7) * 0.05; }
                    if (this._mossTongue) this._mossTongue.scale.z = 1 + Math.abs(Math.sin(t * (fast ? 12 : 5))) * 1.4;
                    break;
                }
                case 'motivationalfungoid': {
                    if (this.spores && this.spores.visible) this.spores.position.y = Math.abs(Math.sin(t * (fast ? 9 : 3.5))) * 0.12;
                    if (this.cap && this.cap.visible) this.cap.rotation.z = Math.sin(t * 2.4) * 0.06;
                    break;
                }
                case 'sporeburstmyconid': {
                    if (this.cap && this.cap.visible) { const b = 1 + Math.abs(Math.sin(t * (fast ? 8 : 2))) * (fast ? 0.18 : 0.05); this.cap.scale.setScalar(b); }
                    if (this.spores && this.spores.visible) { this.spores.scale.setScalar(1 + Math.sin(t * (fast ? 7 : 2.5)) * 0.25); this.spores.children.forEach((p, i) => { p.material.opacity = 0.3 + Math.abs(Math.sin(t * 2 + i)) * 0.4; }); }
                    break;
                }
                case 'primalsloth': {
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 6) * 0.5 : Math.sin(t * 0.9) * 0.1);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 6 + 0.5) * 0.5 : -Math.sin(t * 0.9 + 0.5) * 0.1);
                    if (this.flower && this.flower.visible) this.flower.rotation.z = Math.sin(t * 0.7) * 0.08;
                    break;
                }
                case 'rotwoodentangler': {
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 9) * 0.7 : Math.sin(t * 1.4) * 0.18);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 9 + 0.7) * 0.7 : -Math.sin(t * 1.4 + 0.5) * 0.18);
                    break;
                }
                case 'sylvanbarkstalker': {
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 10) * 0.5 : Math.sin(t * 2) * 0.08);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 10 + 0.6) * 0.5 : -Math.sin(t * 2 + 0.4) * 0.08);
                    break;
                }
                case 'psionicfenbeast': {
                    if (this._psiCore) { const g = 0.4 + Math.abs(Math.sin(t * (fast ? 6 : 2.2))) * 0.6; this._psiCore.material.emissiveIntensity = g; this._psiCore.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12); }
                    if (this._psiDust) this._psiDust.children.forEach((m, i) => { const a = m._a + t * 0.5; m.position.set(Math.cos(a) * m._rr, m._yb + Math.sin(t * 1.5 + i) * 0.12, Math.sin(a) * m._rr); });
                    if (this.crown && this.crown.visible) this.crown.rotation.y = t * 0.4;
                    break;
                }
                case 'voidparasiteplant': {
                    if (this.flower && this.flower.visible) { const b = 1 + Math.abs(Math.sin(t * (fast ? 9 : 2.4))) * (fast ? 0.3 : 0.08); this.flower.scale.set(b, 1, b); }
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 10) * 0.7 : Math.sin(t * 1.5) * 0.2);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 10 + 0.6) * 0.7 : -Math.sin(t * 1.5 + 0.5) * 0.2);
                    break;
                }
                case 'phantomchloroblade': {
                    if (this.flower && this.flower.visible) this.flower.rotation.y = t * 0.6;
                    if (this.model) this.model.position.y = (this._deathBaseY === null ? this.model.position.y : this.model.position.y);
                    this._materials.forEach((m, i) => { if (m.transparent && m.opacity > 0.3 && m.opacity < 0.6) m.opacity = 0.35 + Math.abs(Math.sin(t * 1.6 + i)) * 0.2; });
                    break;
                }
                case 'rattussapscream': {
                    if (this.flower && this.flower.visible) { this.flower.position.y = 1.3 + Math.abs(Math.sin(t * (fast ? 10 : 3))) * 0.06; this.flower.rotation.z = Math.sin(t * 2.2) * 0.08; }
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = Math.sin(t * 1.8) * 0.12;
                    if (v2 && v2.visible) v2.rotation.z = -Math.sin(t * 1.8 + 0.4) * 0.12;
                    break;
                }
                case 'luminescentmycelian': {
                    if (this.spores && this.spores.visible) this.spores.children.forEach((s, i) => { const a = s._a + t * 0.35; s.position.set(Math.cos(a) * s._rr, s._yb + Math.sin(t * 1.2 + i) * 0.14, Math.sin(a) * s._rr); s.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 1.5 + i)) * 0.4; });
                    if (this.cap && this.cap.visible) this.cap.children[this.cap.children.length - 1].scale.setScalar(1 + Math.sin(t * 2) * 0.15);
                    break;
                }
                case 'eldergloomsporemantle': {
                    if (this.spores && this.spores.visible) this.spores.children.forEach((d) => { let y = d.position.y - (fast ? 0.05 : 0.02); if (y < 0.2) { y = 1.6 + this.rand() * 0.4; } d.position.set(d._x, y, d._z); });
                    if (this.cap && this.cap.visible) this.cap.rotation.y = Math.sin(t * 0.6) * 0.1;
                    break;
                }
                case 'motivationalspeakerep': {
                    if (this.cap && this.cap.visible) { this.cap.position.y = 1.55 + Math.abs(Math.sin(t * (fast ? 6 : 2.5))) * 0.08; this.cap.rotation.y = Math.sin(t * 1.4) * 0.15; }
                    if (this.spores && this.spores.visible) this.spores.children.forEach((b, i) => { b.rotation.x += 0.05; b.rotation.y += 0.04; b.position.y = 1.9 + Math.abs(Math.sin(t * (fast ? 5 : 2) + i)) * 0.3; });
                    break;
                }
                case 'creepingluminspore': {
                    if (this.spores && this.spores.visible) this.spores.children.forEach((s, i) => { s.position.y = s._yb + Math.abs(Math.sin(t * (fast ? 6 : 1.8) + i)) * 0.05; s.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 1.6 + i)) * 0.5; });
                    if (this.cap && this.cap.visible) this.cap.rotation.z = Math.sin(t * 1.4) * 0.05;
                    break;
                }
                case 'cryingtree': {
                    if (this._cryDrips) this._cryDrips.forEach((tear, i) => { let y = tear.position.y - (fast ? 0.04 : 0.015); if (y < tear._top - 0.55) { y = tear._top; } tear.position.set(tear._x, y, tear._z); });
                    const v1 = this.branch1, v2 = this.branch2;
                    if (v1 && v1.visible) v1.rotation.z = Math.sin(t * 1.2) * 0.08;
                    if (v2 && v2.visible) v2.rotation.z = -Math.sin(t * 1.2 + 0.4) * 0.08;
                    break;
                }
                case 'xylomantiflorous': {
                    if (this.spores && this.spores.visible) this.spores.children.forEach((s, i) => { const a = s._a + t * 0.4; s.position.set(Math.cos(a) * s._rr, s._yb + Math.sin(t * 1.3 + i) * 0.12, Math.sin(a) * s._rr); s.material.opacity = 0.3 + Math.abs(Math.sin(t * 1.6 + i)) * 0.4; });
                    const v1 = this.vine1, v2 = this.vine2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 10) * 0.7 : Math.sin(t * 1.6) * 0.18);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 10 + 0.7) * 0.7 : -Math.sin(t * 1.6 + 0.5) * 0.18);
                    break;
                }
                case 'backwardstree': {
                    if (this.roots && this.roots.visible) this.roots.rotation.z = (fast ? Math.sin(t * 7) * 0.12 : Math.sin(t * 1.3) * 0.05);
                    const v1 = this.branch1, v2 = this.branch2;
                    if (v1 && v1.visible) v1.rotation.z = (fast ? Math.sin(t * 8) * 0.3 : Math.sin(t * 1.5) * 0.08);
                    if (v2 && v2.visible) v2.rotation.z = (fast ? -Math.sin(t * 8 + 0.5) * 0.3 : -Math.sin(t * 1.5 + 0.4) * 0.08);
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.2);
            this.model.rotation.z = -(Math.PI / 2) * prog;
            if (this._deathBaseY === null) this._deathBaseY = this.model.position.y;
            this.model.position.y = this._deathBaseY - prog * 0.3 * this.scale;
            const op = 1.0 - prog;
            for (const mat of this._materials) mat.opacity = op;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new FloraBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    reg('mushroom', { aliases: ['mushroom', 'mushrooms', 'shroom', 'fungus', 'fungi', 'toadstool'], scale: FLORA_PROFILES.mushroom.scale, weapon: 0, create: make });
    reg('plant',    { aliases: ['plant', 'plants', 'flower', 'sprout', 'bloom'], scale: FLORA_PROFILES.plant.scale, weapon: 0, create: make });
    reg('tree',     { aliases: ['tree', 'trees', 'ent', 'treant'], scale: FLORA_PROFILES.tree.scale, weapon: 0, create: make });

    // ── Bespoke uniques ──────────────────────────────────────────────────────
    const S = FLORA_PROFILES;
    reg('elderwoodguardian', { aliases: ['elderwoodguardian'], scale: S.elderwoodguardian.scale, weapon: 0, create: make });
    reg('flatwoodsentinel',  { aliases: ['flatwoodsentinel'],  scale: S.flatwoodsentinel.scale,  weapon: 0, create: make });
    reg('forestsvengeance',  { aliases: ['forestsvengeance'],  scale: S.forestsvengeance.scale,  weapon: 0, create: make });
    reg('hellthorndryad',    { aliases: ['hellthorndryad'],    scale: S.hellthorndryad.scale,    weapon: 0, create: make });
    reg('moonlitwendigo',    { aliases: ['moonlitwendigo'],    scale: S.moonlitwendigo.scale,    weapon: 0, create: make });
    reg('mossviper',         { aliases: ['mossviper'],         scale: S.mossviper.scale,         weapon: 0, create: make });
    reg('motivationalfungoid', { aliases: ['motivationalfungoid'], scale: S.motivationalfungoid.scale, weapon: 0, create: make });
    reg('sporeburstmyconid',   { aliases: ['sporeburstmyconid'],   scale: S.sporeburstmyconid.scale,   weapon: 0, create: make });
    reg('primalsloth',         { aliases: ['primalsloth'],         scale: S.primalsloth.scale,         weapon: 0, create: make });
    reg('rotwoodentangler',    { aliases: ['rotwoodentangler'],    scale: S.rotwoodentangler.scale,    weapon: 0, create: make });
    reg('sylvanbarkstalker',   { aliases: ['sylvanbarkstalker'],   scale: S.sylvanbarkstalker.scale,   weapon: 0, create: make });
    reg('psionicfenbeast',     { aliases: ['psionicfenbeast'],     scale: S.psionicfenbeast.scale,     weapon: 0, create: make });
    reg('voidparasiteplant',   { aliases: ['voidparasiteplant'],   scale: S.voidparasiteplant.scale,   weapon: 0, create: make });
    reg('phantomchloroblade',  { aliases: ['phantomchloroblade'],  scale: S.phantomchloroblade.scale,  weapon: 0, create: make });
    reg('rattussapscream',     { aliases: ['rattussapscream'],     scale: S.rattussapscream.scale,     weapon: 0, create: make });
    reg('luminescentmycelian', { aliases: ['luminescentmycelian'], scale: S.luminescentmycelian.scale, weapon: 0, create: make });
    reg('eldergloomsporemantle', { aliases: ['eldergloomsporemantle'], scale: S.eldergloomsporemantle.scale, weapon: 0, create: make });
    reg('motivationalspeakerep', { aliases: ['motivationalspeakerep'], scale: S.motivationalspeakerep.scale, weapon: 0, create: make });
    reg('creepingluminspore',  { aliases: ['creepingluminspore'],  scale: S.creepingluminspore.scale,  weapon: 0, create: make });
    reg('cryingtree',          { aliases: ['cryingtree'],          scale: S.cryingtree.scale,          weapon: 0, create: make });
    reg('backwardstree',       { aliases: ['backwardstree'],       scale: S.backwardstree.scale,       weapon: 0, create: make });
    reg('xylomantiflorous',    { aliases: ['xylomantiflorous'],    scale: S.xylomantiflorous.scale,    weapon: 0, create: make });

    const NAMED = {
        elderwoodguardian: ["Elderwood Guardian"],
        flatwoodsentinel:  ["Flatwood Sentinel"],
        forestsvengeance:  ["Forest's Vengeance"],
        hellthorndryad:    ["Hellthorn Dryad"],
        moonlitwendigo:    ["Moonlit Wendigo"],
        mossviper:         ["Moss Viper"],
        motivationalfungoid: ["Motivational Fungoid"],
        sporeburstmyconid:   ["Sporeburst Myconid"],
        primalsloth:         ["Primal Sloth"],
        rotwoodentangler:    ["Rotwood Entangler"],
        sylvanbarkstalker:   ["Sylvan Barkstalker"],
        psionicfenbeast:     ["Psionic Fenbeast"],
        voidparasiteplant:   ["Void Parasite Plant"],
        luminescentmycelian: ["Luminescent Mycelian"],
        phantomchloroblade:  ["Phantom Chloroblade"],
        rattussapscream:     ["Rattus Sapscream"],
        eldergloomsporemantle: ["Eldergloom Sporemantle"],
        motivationalspeakerep: ["Motivational Speaker :EP"],
        creepingluminspore:  ["Creeping Luminspore"],
        cryingtree:          ["Crying Tree"],
        backwardstree:       ["Backwards Tree"],
        xylomantiflorous:    ["Xylomanti Florous "]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Flora family registered');
})();
