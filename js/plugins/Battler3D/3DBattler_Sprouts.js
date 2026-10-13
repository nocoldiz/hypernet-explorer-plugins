//=============================================================================
// 3D Battler System - Sprout Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke plant one-off models (squeaky turnip fiend, totemic
 * sprout, barkhide bruiser) + name-based assignment. Requires 3DBattlerSystem
 * + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Sprout Uniques
 * ============================================================================
 *
 * Distinct procedural plant-folk shaped from each enemy's flavour text, pinned
 * by exact name. They map the Plant archetype keys (FLOWER/STEM/ROOTS/VINE_1/
 * VINE_2) so dismemberment works.
 *
 * Registered: squeakyturnip, totemicsprout, barkhidebruiser, and the level
 * 1-5 roster: lv_dandeliondrifter, lv_nettlesprout, lv_burrsprout,
 * lv_sproutingspud, lv_saplingtreant (the last on the Tree keys CROWN/TRUNK/
 * ROOTS/BRANCH_1/BRANCH_2).
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Sprouts] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const P_PROFILES = {
        squeakyturnip:   { variant: 'squeakyturnip',   scale: 1.7, texturePool: 'pale', bodyColor: 0xf0e8d8, accent: 0xaa66cc, hue: [0.12, 0.05], sat: [0.12, 0.06], lit: [0.80, 0.06] },
        totemicsprout:   { variant: 'totemicsprout',   scale: 1.9, texturePool: 'wood', bodyColor: 0x8a6a40, accent: 0x66cc66, hue: [0.10, 0.04], sat: [0.40, 0.10], lit: [0.42, 0.08] },
        barkhidebruiser: { variant: 'barkhidebruiser', scale: 2.3, texturePool: 'wood', bodyColor: 0x6a5236, accent: 0x4a7a3a, hue: [0.09, 0.04], sat: [0.40, 0.10], lit: [0.36, 0.08] },
        // ── Level 1-5 roster (bespoke, were squeaky turnip / barkhide reskins) ──
        // Dandelion Drifter: an uprooted dandelion clock with one eye in a bald patch.
        lv_dandeliondrifter: { variant: 'lv_dandeliondrifter', scale: 1.8, texturePool: 'foliage', bodyColor: 0x5e8a34, accent: 0xf2eedc, hue: [0.24, 0.05], sat: [0.45, 0.10], lit: [0.38, 0.08] },
        // Nettle Sprout: square-stemmed, stinging-haired, spiteful mask of leaves.
        lv_nettlesprout:     { variant: 'lv_nettlesprout',     scale: 1.7, texturePool: 'foliage', bodyColor: 0x3e6a2a, accent: 0xc8d27a, hue: [0.28, 0.05], sat: [0.50, 0.10], lit: [0.30, 0.08] },
        // Burr Sprout: a hooked burr ball on a stub, wool and hair caught in it.
        lv_burrsprout:       { variant: 'lv_burrsprout',       scale: 1.6, texturePool: 'wood',    bodyColor: 0x6e5a2c, accent: 0x9a3a8e, hue: [0.11, 0.04], sat: [0.45, 0.10], lit: [0.32, 0.08] },
        // Sprouting Spud: a lumpy cellar potato, many dimpled eyes, pale lashing shoots.
        lv_sproutingspud:    { variant: 'lv_sproutingspud',    scale: 1.7, texturePool: 'pale',    bodyColor: 0xb89a66, accent: 0xe4dcc8, hue: [0.10, 0.04], sat: [0.35, 0.10], lit: [0.55, 0.08] },
        // Sapling Treant: a whippy young tree walking on its pulled-up roots.
        lv_saplingtreant:    { variant: 'lv_saplingtreant',    scale: 2.2, texturePool: 'wood',    bodyColor: 0x7a5a38, accent: 0x6aa040, hue: [0.08, 0.04], sat: [0.40, 0.10], lit: [0.36, 0.08] }
    };

    // Evenly spread unit directions over a sphere (golden spiral), for spines,
    // seed spokes and the like.
    const fibDirs = (n) => {
        const out = [];
        for (let i = 0; i < n; i++) {
            const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
            out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
        }
        return out;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    class SproutBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = P_PROFILES[creatureType] || P_PROFILES.squeakyturnip;
            super(scale, offsetY, battler, profile, 0, creatureType || 'squeakyturnip');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
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
        _vine(side, mat, yTop) {
            const g = new THREE.Group(); let py = 0;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i * 0.01, 8, 8), mat); seg.position.set(side * 0.05 * i, py, 0); py -= 0.16; g.add(seg); }
            g.position.set(side * 0.28, yTop || 1.0, 0); g._side = side; this.bodyGroup.add(g); return g;
        }
        _rootCluster(mat) {
            const g = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const root = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), mat); root.position.set(Math.cos(a) * 0.18, 0.12, Math.sin(a) * 0.18); root.rotation.x = Math.PI; root.rotation.z = Math.cos(a) * 0.4; g.add(root); }
            this.bodyGroup.add(g); return g;
        }
        _wirePlant(extra) {
            extra = (extra || []).filter(Boolean);
            this._partMeshMap = { FLOWER: this.flower, STEM: this.stem, ROOTS: this.roots, VINE_1: this.vine1, VINE_2: this.vine2 };
            this._cascadeRules = [
                { gone: ['STEM', 'CORE', 'BODY', 'TRUNK'], hide: [this.stem, this.flower, this.roots, this.vine1, this.vine2, ...extra] },
                { gone: ['FLOWER', 'CROWN', 'HEAD'], hide: [this.flower] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['VINE_1'], hide: [this.vine1] },
                { gone: ['VINE_2'], hide: [this.vine2] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'totemicsprout':   this._buildTotemicSprout(); break;
                case 'barkhidebruiser': this._buildBarkhide(); break;
                case 'lv_dandeliondrifter': this._buildDandelionDrifter(); break;
                case 'lv_nettlesprout':     this._buildNettleSprout(); break;
                case 'lv_burrsprout':       this._buildBurrSprout(); break;
                case 'lv_sproutingspud':    this._buildSproutingSpud(); break;
                case 'lv_saplingtreant':    this._buildSaplingTreant(); break;
                default:                this._buildTurnip(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Squeaky Turnip Fiend: a goofy turnip on tiny legs ──────────────
        _buildTurnip() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            // Bulb body (STEM slot).
            this.stem = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), flesh); this.stem.position.set(0, 0.75, 0); this.stem.scale.set(1, 1.1, 1); this.bodyGroup.add(this.stem);
            // Purple ridges.
            for (let i = 0; i < 4; i++) { const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.4 - i * 0.02, 0.02, 6, 14, Math.PI), this._mat(p.accent, 1, 0.5)); ridge.position.set(0, 0.9 - i * 0.08, 0); ridge.rotation.x = Math.PI / 2; ridge.rotation.z = (i / 4) * 0.6; this.bodyGroup.add(ridge); }
            // Goofy face.
            this._eye(this.stem, -0.14, 0.09, 0.34, 0.09, 0x111111); this._eye(this.stem, 0.14, 0.09, 0.34, 0.09, 0x111111);   // bulb-local (the bulb sits at y 0.75)
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(0x2a1010, 1, 0.5)); mouth.position.set(0, 0.62, 0.36); mouth.scale.set(1.2, 0.8, 0.5); this.bodyGroup.add(mouth); this._mouth = mouth;
            // Leafy top (FLOWER slot).
            this.flower = new THREE.Group();
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 4), this._mat(0x4a9a3a, 1, 0.6)); leaf.position.set(Math.cos(a) * 0.1, 1.15 + 0.1, Math.sin(a) * 0.1); leaf.rotation.z = Math.cos(a) * 0.5; leaf.rotation.x = Math.sin(a) * 0.5; this.flower.add(leaf); }
            this.bodyGroup.add(this.flower);
            // Tiny stubby legs (ROOTS slot) + arms (vines).
            this.roots = new THREE.Group();
            for (const lx of [-0.16, 0.16]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.2, 6), flesh); leg.position.set(lx, 0.28, 0.05); this.roots.add(leg); }
            this.bodyGroup.add(this.roots);
            this.vine1 = this._vine(-1, flesh, 0.78); this.vine2 = this._vine(1, flesh, 0.78);
            this._wirePlant([mouth]);
        }

        // ── Totemic Sprout: a little carved totem with a leafy crown ──────
        _buildTotemicSprout() {
            const p = this.profile;
            const wood = this._skinMat(p.bodyColor, 0.7);
            // Stacked carved segments (STEM).
            this.stem = new THREE.Group();
            for (let i = 0; i < 3; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.4 - i * 0.03, 0.36, 0.36 - i * 0.02), wood); seg.position.set(0, 0.45 + i * 0.36, 0); this.stem.add(seg); }
            this.bodyGroup.add(this.stem);
            // Carved face with glowing ritual eyes on the top segment.
            this._eye(this.bodyGroup, -0.1, 1.12, 0.2, 0.06, p.accent); this._eye(this.bodyGroup, 0.1, 1.12, 0.2, 0.06, p.accent);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.04), this._mat(0x2a1a10, 1, 0.6)); mouth.position.set(0, 0.98, 0.19); this.bodyGroup.add(mouth);
            // Ritual glyphs.
            for (let i = 0; i < 3; i++) { const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10), this._mat(p.accent, 0.9, 0.3, p.accent)); glyph.position.set((i - 1) * 0.12, 0.5, 0.18); this.bodyGroup.add(glyph); }
            // Leafy crown (FLOWER).
            this.flower = new THREE.Group();
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), this._mat(p.accent, 1, 0.6)); leaf.position.set(Math.cos(a) * 0.12, 1.35, Math.sin(a) * 0.12); leaf.rotation.z = Math.cos(a) * 0.7; leaf.rotation.x = Math.sin(a) * 0.7; this.flower.add(leaf); }
            this.bodyGroup.add(this.flower);
            this.roots = this._rootCluster(wood);
            this.vine1 = this._vine(-1, wood, 0.8); this.vine2 = this._vine(1, wood, 0.8);
            this._wirePlant([mouth]);
        }

        // ── Barkhide Bruiser: a stocky bark-armoured plant brawler ────────
        _buildBarkhide() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.85);
            // Thick trunk (STEM).
            this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.0, 10), bark); this.stem.position.set(0, 0.85, 0); this.bodyGroup.add(this.stem);
            // Bark plates.
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.4, 0.08), bark); plate.position.set(Math.cos(a) * 0.36, 0.85, Math.sin(a) * 0.36); plate.lookAt(Math.cos(a) * 1, 0.85, Math.sin(a) * 1); this.bodyGroup.add(plate); }
            // Head/crown (FLOWER) with a scowling face.
            this.flower = new THREE.Group();
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bark); this.flower.add(head);
            this._eye(this.flower, -0.12, 0.04, 0.24, 0.06, 0x335511); this._eye(this.flower, 0.12, 0.04, 0.24, 0.06, 0x335511);
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.05), bark); brow.position.set(0, 0.14, 0.24); brow.rotation.z = 0.1; this.flower.add(brow);
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), this._mat(p.accent, 1, 0.6)); leaf.position.set(Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12); leaf.rotation.z = Math.cos(a) * 0.6; leaf.rotation.x = Math.sin(a) * 0.6; this.flower.add(leaf); }
            this.flower.position.set(0, 1.5, 0); this.bodyGroup.add(this.flower);
            // Muscular vine arms with fists.
            this.vine1 = this._barkArm(-1, bark); this.vine2 = this._barkArm(1, bark);
            this.roots = this._rootCluster(bark);
            this._wirePlant();
        }
        _barkArm(side, mat) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.5, 8), mat); upper.position.set(side * 0.1, -0.1, 0); upper.rotation.z = side * 0.5; g.add(upper);
            const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat); fist.position.set(side * 0.34, -0.38, 0); g.add(fist); g._fist = fist;
            g.position.set(side * 0.36, 1.1, 0); g._side = side; this.bodyGroup.add(g); return g;
        }

        // A strut between two points (core helper), low-poly by default.
        _strut(parent, mat, a, b, r0, r1, seg) { return this.addStrut(parent, mat, a, b, r0, r1, seg || 5); }

        // ── Dandelion Drifter: a dandelion clock that pulled itself up ─────
        // Stem, seed head and leaves all hang off the stem group, which pivots
        // at the root crown, so the whole plant sways as one piece.
        _buildDandelionDrifter() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.75);
            const fluff = this._mat(p.accent, 0.9, 0.9);
            const tan = this._mat(0x9a7a3a, 1, 0.8);
            this.stem = new THREE.Group(); this.stem.position.set(0, 0.32, 0); this.bodyGroup.add(this.stem);
            const curve = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.06, 0.35, 0.02), V(-0.02, 0.7, 0.06), V(0.06, 1.05, 0.04)]);
            this.stem.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5, false), green));
            // Seed clock (FLOWER): faceted seed core, a ring of parachute
            // spokes, and a bald patch in front where one eye looks out.
            this.flower = new THREE.Group(); this.flower.position.set(0.06, 1.18, 0.04); this.stem.add(this.flower);
            this.flower.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), tan));
            this._strut(this.flower, green, V(0, -0.15, 0), V(0, -0.05, 0), 0.035, 0.05, 5);
            for (const d of fibDirs(34)) {
                if (d.z > 0.62) continue;                                  // the bald patch
                const tip = d.clone().multiplyScalar(0.36);
                this._strut(this.flower, fluff, d.clone().multiplyScalar(0.1), tip, 0.007, 0.007, 3);
                const brolly = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.035, 5, 1, true), fluff);
                brolly.position.copy(tip); brolly.quaternion.setFromUnitVectors(V(0, 1, 0), d); this.flower.add(brolly);
            }
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), this._mat(0xf0e070, 1, 0.3));
            eye.position.set(0, 0.0, 0.1); eye.scale.set(1, 1, 0.7); this.flower.add(eye);
            const slit = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.02), this._mat(0x111111, 1, 0.3)); slit.position.set(0, 0, 0.152); this.flower.add(slit);
            this._eyeBall = eye;
            // Lion-tooth leaves (VINE_1/2): a midrib with backward-hooked teeth.
            const leaf = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.02, 0.36, 0.02); this.stem.add(g);
                this._strut(g, green, V(0, 0, 0), V(side * 0.46, -0.12, 0.06), 0.022, 0.012, 4);
                for (let i = 1; i <= 4; i++) {
                    const u = i / 5, tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05 * (1 - u * 0.5), 0.16, 3), green);
                    tooth.position.set(side * 0.46 * u, -0.12 * u + 0.03, 0.06 * u); tooth.rotation.z = side * 2.2; tooth.scale.z = 0.35; g.add(tooth);
                    const under = tooth.clone(); under.position.y -= 0.06; under.rotation.z = side * 0.9; g.add(under);
                }
                g._side = side; return g;
            };
            this.vine1 = leaf(-1); this.vine2 = leaf(1);
            // Torn-up roots (ROOTS) hanging from a clod of soil: it floats.
            this.roots = new THREE.Group(); this.roots.position.set(0, 0.32, 0); this.bodyGroup.add(this.roots);
            const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), this._mat(0x3a2a18, 1, 1.0)); this.roots.add(clod);
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2, end = V(Math.cos(a) * 0.14, -0.26 - (i % 2) * 0.04, Math.sin(a) * 0.14);
                this._strut(this.roots, tan, V(0, -0.04, 0), end, 0.026, 0.01, 4);
            }
            // A few seeds already blown loose and drifting off.
            this._driftSeeds = new THREE.Group(); this._driftSeeds.userData.float = true;
            for (let i = 0; i < 5; i++) {
                const s = new THREE.Group();
                this._strut(s, fluff, V(0, 0, 0), V(0, 0.12, 0), 0.006, 0.006, 3);
                const b = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.03, 5, 1, true), fluff); b.position.y = 0.12; s.add(b);
                s.position.set(0.4 + this.idRand() * 0.4, 1.3 + this.idRand() * 0.6, -0.2 + this.idRand() * 0.4); s._t = this.idRand();
                this._driftSeeds.add(s);
            }
            this.bodyGroup.add(this._driftSeeds);
            this._wirePlant([this._driftSeeds]);
            this._partMeshMap.MAW = this.flower;
        }

        // ── Nettle Sprout: square stem, stinging hairs, a spiteful leaf mask ─
        _buildNettleSprout() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.7);
            const hairMat = this._mat(0xeef0d8, 1, 0.4);
            this.stem = new THREE.Group(); this.stem.position.set(0, 0.16, 0); this.bodyGroup.add(this.stem);
            const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), green); shaft.position.y = 0.5; this.stem.add(shaft);
            const hair = (parent, x, y, z, dir) => { const h = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.07, 3), hairMat); h.position.set(x, y, z); h.quaternion.setFromUnitVectors(V(0, 1, 0), dir); parent.add(h); };
            for (let i = 0; i < 18; i++) { const side = [V(1, 0.4, 0), V(-1, 0.4, 0), V(0, 0.4, 1), V(0, 0.4, -1)][i % 4].normalize(); hair(this.stem, side.x * 0.045, 0.1 + i * 0.05, side.z * 0.045, side); }
            // A serrated, hairy, heart-shaped leaf on a short stalk.
            const mkLeaf = (parent, len) => {
                const blade = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), green); blade.scale.set(0.8, 0.14, 1.4); blade.position.z = len * 0.5 + 0.12; parent.add(blade);
                this._strut(parent, green, V(0, 0, 0), V(0, 0, len * 0.5), 0.015, 0.015, 4);
                for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 3), green); t.position.set(sx * 0.1, 0, len * 0.5 + 0.03 + k * 0.08); t.rotation.z = -sx * Math.PI / 2; t.scale.z = 0.4; parent.add(t); }
                hair(parent, 0, 0.03, len * 0.5 + 0.12, V(0, 1, 0.3).normalize());
                return blade;
            };
            // Decussate leaf pairs: each pair turned 90 degrees from the last.
            for (let n = 0; n < 2; n++) for (const s of [-1, 1]) {
                const g = new THREE.Group(); g.position.y = 0.42 + n * 0.25; g.rotation.y = (n % 2 ? 0 : Math.PI / 2) + (s < 0 ? Math.PI : 0); g.rotation.x = 0.35; this.stem.add(g); mkLeaf(g, 0.12);
            }
            // The head: a swollen square knot with slit eyes under two scowling
            // leaf brows and a crest of stinging hairs.
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), green); head.position.y = 1.05; this.stem.add(head);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), this._mat(p.accent, 1, 0.3, 0x556600)); eye.position.set(s * 0.05, 1.06, 0.095); eye.rotation.z = s * 0.35; this.stem.add(eye);
                const brow = new THREE.Group(); brow.position.set(s * 0.04, 1.12, 0.07); brow.rotation.set(-0.5, s * 0.6, s * 0.5); this.stem.add(brow); mkLeaf(brow, 0.02).scale.multiplyScalar(0.8);
            }
            for (let i = 0; i < 7; i++) hair(this.stem, (i - 3) * 0.02, 1.15, 0, V((i - 3) * 0.15, 1, -0.2).normalize());
            // FLOWER: drooping catkin tassels hung from under the head.
            this.flower = new THREE.Group(); this.flower.position.y = 1.0; this.stem.add(this.flower);
            for (const a of [0.6, 2.2, 3.9, 5.4]) {
                let prev = V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
                for (let k = 1; k <= 4; k++) {
                    const pt = V(Math.cos(a) * (0.1 + k * 0.05), -k * 0.07, Math.sin(a) * (0.1 + k * 0.05));
                    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), this._mat(p.accent, 1, 0.6)); bead.position.copy(pt); this.flower.add(bead);
                    this._strut(this.flower, green, prev, pt, 0.008, 0.008, 3); prev = pt;
                }
            }
            // VINE_1/2: the big lowest leaves held up like slapping hands.
            const arm = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.04, 0.3, 0); g.rotation.set(0, side * Math.PI / 2, 0); this.stem.add(g);
                const inner = new THREE.Group(); inner.rotation.x = -0.5; g.add(inner); mkLeaf(inner, 0.22).scale.multiplyScalar(1.3);
                g._side = side; return g;
            };
            this.vine1 = arm(-1); this.vine2 = arm(1);
            // ROOTS: four bent rootlets it sidles along on, crab-wise.
            this.roots = new THREE.Group(); this.bodyGroup.add(this.roots);
            for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
                const knee = V(sx * 0.18, 0.2, sz * 0.12), foot = V(sx * 0.26, 0.0, sz * 0.18);
                this._strut(this.roots, green, V(0, 0.2, 0), knee, 0.03, 0.025, 4);
                this._strut(this.roots, green, knee, foot, 0.025, 0.012, 4);
            }
            this._wirePlant([head]);
            this._partMeshMap.MAW = head;
        }

        // ── Burr Sprout: a hooked burr ball with trophies caught in its hooks ─
        _buildBurrSprout() {
            const p = this.profile;
            const brown = this._skinMat(p.bodyColor, 0.8);
            const leafMat = this._mat(0x4e7a2e, 1, 0.75);
            this.stem = new THREE.Group(); this.stem.position.set(0, 0.22, 0); this.bodyGroup.add(this.stem);
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 6), leafMat); stalk.position.y = 0.25; this.stem.add(stalk);
            // FLOWER: the burr itself, a faceted ball bristling with hooks.
            this.flower = new THREE.Group(); this.flower.position.y = 0.72; this.stem.add(this.flower);
            this.flower.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), brown));
            const hookMat = this._mat(0x8a6a34, 1, 0.6);
            for (const d of fibDirs(40)) {
                if (d.z > 0.7 && Math.abs(d.y) < 0.45) continue;           // a clear face
                const base = d.clone().multiplyScalar(0.27), tip = d.clone().multiplyScalar(0.47);
                this._strut(this.flower, hookMat, base, tip, 0.03, 0.008, 4);
                const hook = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.06, 3), hookMat); hook.position.copy(tip);
                hook.quaternion.setFromUnitVectors(V(0, 1, 0), V(-d.x, -d.y + 0.2, -d.z).normalize()); this.flower.add(hook);
            }
            // Purple tuft on top.
            for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, top = V(Math.cos(a) * 0.1, 0.48, Math.sin(a) * 0.1); this._strut(this.flower, this._mat(p.accent, 1, 0.6), V(0, 0.26, 0), top, 0.025, 0.01, 3); }
            // Face peering out between the hooks.
            for (const s of [-1, 1]) { const e = this._eye(this.flower, s * 0.1, 0.06, 0.26, 0.06, 0xd8b020); e.scale.y = 0.7; }
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.04), this._mat(0x1a1008, 1, 0.6)); mouth.position.set(0, -0.08, 0.28); mouth.rotation.z = 0.15; this.flower.add(mouth);
            // Trophies: a tuft of sheep's wool and a lock of red hair caught on it.
            const wool = this._mat(0xf0ece0, 1, 1.0);
            for (const [x, y, z, r] of [[-0.3, 0.12, 0.12, 0.09], [-0.34, 0.04, 0.06, 0.07], [-0.28, 0.2, 0.02, 0.06]]) { const w = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), wool); w.position.set(x, y, z); this.flower.add(w); }
            const hairCurve = new THREE.CatmullRomCurve3([V(0.24, 0.2, 0.1), V(0.36, 0.1, 0.16), V(0.4, -0.1, 0.1), V(0.36, -0.28, 0.14)]);
            this.flower.add(new THREE.Mesh(new THREE.TubeGeometry(hairCurve, 8, 0.012, 3, false), this._mat(0xb83a1a, 1, 0.7)));
            // VINE_1/2: broad burdock leaves on stout stalks; the right one
            // cradles a spare burr ready to fling.
            const leaf = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.06, 0.18, 0); this.stem.add(g);
                this._strut(g, leafMat, V(0, 0, 0), V(side * 0.3, 0.18, 0.08), 0.03, 0.02, 4);
                const blade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 4), leafMat); blade.scale.set(1.3, 0.12, 0.95); blade.position.set(side * 0.48, 0.24, 0.1); blade.rotation.z = side * 0.35; g.add(blade);
                if (side > 0) { const spare = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), hookMat); spare.position.set(0.6, 0.33, 0.12); g.add(spare); g._burr = spare; }
                g._side = side; return g;
            };
            this.vine1 = leaf(-1); this.vine2 = leaf(1);
            this.roots = this._rootCluster(brown);
            this._wirePlant();
            this._partMeshMap.MAW = mouth;
        }

        // ── Sprouting Spud: a forgotten cellar potato that grew teeth of shoots ─
        _buildSproutingSpud() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.9);
            const shoot = this._mat(p.accent, 1, 0.6);
            const C = V(0, 0.42, 0), R = V(0.36, 0.3, 0.52);
            const surf = (dx, dy, dz) => { const d = V(dx, dy, dz).normalize(); return V(C.x + d.x * R.x, C.y + d.y * R.y, C.z + d.z * R.z); };
            // STEM: the tuber, lying nose to tail, with lumps worked into it.
            this.stem = new THREE.Group(); this.bodyGroup.add(this.stem);
            const tuber = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), skin); tuber.position.copy(C); tuber.scale.copy(R); this.stem.add(tuber);
            for (const [dx, dy, dz, r] of [[0.6, 0.5, 0.4, 0.14], [-0.5, 0.3, -0.6, 0.16], [0.2, 0.7, -0.5, 0.12], [-0.4, -0.2, 0.7, 0.11]]) { const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), skin); lump.position.copy(surf(dx, dy, dz)).lerp(C, 0.15); this.stem.add(lump); }
            // Dimpled potato eyes, a few of which are open and real; one is huge.
            const dimple = this._mat(0x4a3420, 1, 0.9);
            [[0.7, 0.4, -0.3], [-0.6, 0.5, 0.2], [0.3, 0.8, 0.3], [-0.2, 0.6, -0.7], [0.8, -0.1, 0.4], [-0.8, 0.0, -0.2]].forEach(([dx, dy, dz]) => {
                const pos = surf(dx, dy, dz), d = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), dimple); d.position.copy(pos); d.scale.set(1.4, 1.4, 0.5); d.lookAt(C.x + (pos.x - C.x) * 2, C.y + (pos.y - C.y) * 2, C.z + (pos.z - C.z) * 2); this.stem.add(d);
            });
            const openEye = (dx, dy, dz, r) => { const e = this._eye(this.stem, 0, 0, 0, r, 0x3a1a10); e.position.copy(surf(dx, dy, dz)).lerp(C, 0.06); return e; };
            this._bigEye = openEye(0.05, 0.3, 1, 0.1);
            openEye(0.5, 0.55, 0.65, 0.045); openEye(-0.45, 0.6, 0.55, 0.035);
            // Short dead-end shoots out of the dimples.
            for (const [dx, dy, dz] of [[0.3, 0.8, 0.3], [-0.2, 0.6, -0.7]]) {
                const a = surf(dx, dy, dz), b = a.clone().add(V(dx * 0.18, 0.22, dz * 0.12));
                this._strut(this.stem, shoot, a.clone().lerp(C, 0.05), b, 0.03, 0.012, 4);
            }
            // FLOWER: knobbly purple buds on top.
            this.flower = new THREE.Group(); this.flower.position.copy(surf(0, 1, -0.15)); this.bodyGroup.add(this.flower);
            for (const [x, z] of [[0, 0], [0.09, 0.05], [-0.07, 0.07]]) { this._strut(this.flower, shoot, V(0, -0.04, 0), V(x, 0.12, z), 0.025, 0.02, 4); const bud = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), this._mat(0x7a3a8a, 1, 0.6)); bud.position.set(x, 0.15, z); this.flower.add(bud); }
            // VINE_1/2: two long pale shoots that lash; each pivots at its eye.
            const lash = (side) => {
                const g = new THREE.Group(); g.position.copy(surf(side, 0.3, 0.25)).lerp(C, 0.05); this.bodyGroup.add(g);
                const c = new THREE.CatmullRomCurve3([V(0, 0, 0), V(side * 0.22, 0.12, 0.08), V(side * 0.38, 0.36, 0.0), V(side * 0.3, 0.58, 0.14), V(side * 0.12, 0.62, 0.2)]);
                g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.03, 4, false), shoot));
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), shoot); tip.position.set(side * 0.08, 0.62, 0.22); tip.rotation.z = side * 1.2; g.add(tip);
                g._side = side; return g;
            };
            this.vine1 = lash(-1); this.vine2 = lash(1);
            // ROOTS: hairy rootlets under the belly down to the floor.
            this.roots = new THREE.Group(); this.bodyGroup.add(this.roots);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, top = surf(Math.cos(a) * 0.5, -1, Math.sin(a) * 0.7).lerp(C, 0.08); this._strut(this.roots, this._mat(0xcfc0a0, 1, 0.9), top, V(top.x * 1.4, 0.0, top.z * 1.3), 0.012, 0.005, 3); }
            this._wirePlant();
            this._partMeshMap.MAW = this.stem;
        }

        // ── Sapling Treant (Tree keys): a young tree on its pulled-up roots ──
        _buildSaplingTreant() {
            const p = this.profile;
            const bark = this._skinMat(p.bodyColor, 0.85);
            const leafMat = this._mat(p.accent, 1, 0.75);
            // TRUNK: a slender leaning trunk with a knot-hole face.
            this.trunk = new THREE.Group(); this.trunk.position.set(0, 0.5, 0); this.bodyGroup.add(this.trunk);
            this._strut(this.trunk, bark, V(0, -0.05, 0), V(0.05, 1.25, -0.02), 0.13, 0.07, 6);
            for (const y of [0.25, 0.7]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115 - y * 0.04, 0.018, 4, 8), bark); ring.position.set(y * 0.04, y, 0); ring.rotation.x = Math.PI / 2; this.trunk.add(ring); }
            for (const s of [-1, 1]) {
                const knot = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.016, 4, 8), this._mat(0x3a2414, 1, 0.8)); knot.position.set(s * 0.045 + 0.03, 0.82, 0.085); knot.rotation.y = s * 0.3; this.trunk.add(knot);
                this._eye(this.trunk, s * 0.045 + 0.03, 0.82, 0.08, 0.025, 0xd8a020);
            }
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.03), this._mat(0x1a1008, 1, 0.8)); crack.position.set(0.03, 0.7, 0.1); crack.rotation.z = -0.25; this.trunk.add(crack);
            // ROOTS: the uprooted root ball split into two walking legs.
            this.roots = new THREE.Group(); this.roots.position.set(0, 0.5, 0); this.bodyGroup.add(this.roots);
            this._rootLegs = [];
            for (const s of [-1, 1]) {
                const leg = new THREE.Group(); this.roots.add(leg);
                for (let k = 0; k < 3; k++) {
                    const knee = V(s * (0.12 + k * 0.02), -0.26, (k - 1) * 0.05), foot = V(s * (0.17 + k * 0.03), -0.48, (k - 1) * 0.1 + 0.04);
                    this._strut(leg, bark, V(s * 0.04, 0, (k - 1) * 0.03), knee, 0.045, 0.035, 4);
                    this._strut(leg, bark, knee, foot, 0.035, 0.012, 4);
                }
                const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06, 0), this._mat(0x3a2a18, 1, 1)); clod.position.set(s * 0.12, -0.26, 0); leg.add(clod);
                this._rootLegs.push(leg);
            }
            // BRANCH_1/2: thin whippy arm-branches with a fork and three leaves.
            const branch = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.04 + 0.03, 1.5, 0); this.bodyGroup.add(g);
                const elbow = V(side * 0.32, 0.1, 0.04), hand = V(side * 0.5, 0.32, 0.06);
                this._strut(g, bark, V(0, 0, 0), elbow, 0.04, 0.028, 5);
                this._strut(g, bark, elbow, hand, 0.028, 0.012, 4);
                this._strut(g, bark, elbow, V(side * 0.46, -0.04, 0.08), 0.02, 0.008, 3);
                for (const [x, y] of [[0.5, 0.36], [0.44, 0.3], [0.47, -0.05]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 3), leafMat); l.scale.set(1.5, 0.3, 0.8); l.position.set(side * x, y, 0.07); l.rotation.z = side * 0.6; g.add(l); }
                g._side = side; return g;
            };
            this.branch1 = branch(-1); this.branch2 = branch(1);
            // CROWN: a sparse top and an abandoned bird's nest with two eggs.
            this.crown = new THREE.Group(); this.crown.position.set(0.05, 1.78, -0.02); this.bodyGroup.add(this.crown);
            for (const [x, y, z, r] of [[0, 0.05, 0, 0.2], [-0.16, -0.02, 0.06, 0.13], [0.15, 0.0, -0.05, 0.14]]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leafMat); c.position.set(x, y, z); this.crown.add(c); }
            const nest = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 4, 9), this._mat(0x6a4a24, 1, 1)); nest.position.set(0.02, 0.2, 0.06); nest.rotation.x = Math.PI / 2; this.crown.add(nest);
            for (const x of [-0.025, 0.03]) { const egg = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), this._mat(0x8ac8d8, 1, 0.4)); egg.scale.y = 1.3; egg.position.set(0.02 + x, 0.22, 0.06); this.crown.add(egg); }
            this._partMeshMap = { CROWN: this.crown, TRUNK: this.trunk, ROOTS: this.roots, BRANCH_1: this.branch1, BRANCH_2: this.branch2 };
            this._cascadeRules = [
                { gone: ['TRUNK', 'CORE', 'BODY'], hide: [this.trunk, this.crown, this.roots, this.branch1, this.branch2] },
                { gone: ['CROWN'], hide: [this.crown] },
                { gone: ['ROOTS'], hide: [this.roots] },
                { gone: ['BRANCH_1'], hide: [this.branch1] },
                { gone: ['BRANCH_2'], hide: [this.branch2] },
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.02 * this.scale;
            // Gentle plant sway + vine idle.
            if (this.stem && this.stem.rotation) this.stem.rotation.z = Math.sin(t * 1.2) * 0.04;
            if (this.vine1) this.vine1.rotation.z = 0.2 + Math.sin(t * 2) * 0.25;
            if (this.vine2) this.vine2.rotation.z = -0.2 - Math.sin(t * 2 + 0.5) * 0.25;

            switch (this.variant) {
                case 'squeakyturnip': {
                    // Squeaky bounce + chattering mouth.
                    const sq = Math.abs(Math.sin(t * (fast ? 9 : 4)));
                    this.model.position.y = this._baseY + sq * (fast ? 0.18 : 0.08) * this.scale;
                    if (this.stem) this.stem.scale.set(1 + sq * 0.06, 1.1 - sq * 0.08, 1 + sq * 0.06);
                    if (this._mouth) this._mouth.scale.y = 0.8 + sq * 0.6;
                    break;
                }
                case 'totemicsprout': {
                    if (this.flower) this.flower.rotation.y = t * 0.5;
                    break;
                }
                case 'barkhidebruiser': {
                    [this.vine1, this.vine2].forEach((v, i) => { if (v) v.rotation.x = fast ? Math.sin(t * 9 + i * Math.PI) * 0.7 : Math.sin(t * 1.5 + i) * 0.1; });
                    break;
                }
                case 'lv_dandeliondrifter': {
                    // Drifts off the ground; the clock turns and the eye rolls.
                    this.model.position.y = this._baseY + (0.05 + Math.sin(t * 1.1) * 0.04) * this.scale;
                    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.7) * 0.5;
                    if (this._eyeBall) this._eyeBall.rotation.y = Math.sin(t * 2.3) * 0.4;
                    if (this.vine1) this.vine1.rotation.z = Math.sin(t * 2.4) * 0.15;
                    if (this.vine2) this.vine2.rotation.z = -Math.sin(t * 2.4 + 0.6) * 0.15;
                    if (this.roots) this.roots.rotation.z = Math.sin(t * 1.3) * 0.1;
                    if (this._driftSeeds) this._driftSeeds.children.forEach(sd => { sd.position.y += 0.004; sd.position.x += 0.002; if (sd.position.y > 2.2) { sd.position.y = 1.3; sd.position.x = 0.4; } });
                    break;
                }
                case 'lv_nettlesprout': {
                    // Leaves slap down on attack; the catkins swing.
                    const slap = fast ? Math.max(0, Math.sin(t * 10)) * 0.9 : Math.sin(t * 1.5) * 0.08;
                    if (this.vine1) this.vine1.rotation.set(0, -Math.PI / 2, slap);
                    if (this.vine2) this.vine2.rotation.set(0, Math.PI / 2, -slap);
                    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.9) * 0.3;
                    break;
                }
                case 'lv_burrsprout': {
                    if (this.flower) this.flower.rotation.y = Math.sin(t * 0.8) * 0.25;
                    const fling = fast ? Math.sin(t * 9) * 0.8 : Math.sin(t * 1.4) * 0.08;
                    if (this.vine2) this.vine2.rotation.z = -0.1 + fling;
                    if (this.vine1) this.vine1.rotation.z = 0.1 - Math.sin(t * 1.4 + 0.5) * 0.08;
                    break;
                }
                case 'lv_sproutingspud': {
                    // The tuber lies still and trembles; the shoots do the lashing.
                    this.model.position.y = this._baseY;
                    if (this.stem) this.stem.rotation.z = Math.sin(t * 13) * 0.008;
                    const lash = fast ? Math.sin(t * 11) * 0.7 : Math.sin(t * 1.7) * 0.18;
                    if (this.vine1) this.vine1.rotation.set(Math.sin(t * 1.3) * 0.15, 0, lash);
                    if (this.vine2) this.vine2.rotation.set(Math.sin(t * 1.3 + 1) * 0.15, 0, -lash);
                    if (this._bigEye) this._bigEye.rotation.y = Math.sin(t * 0.9) * 0.35;
                    break;
                }
                case 'lv_saplingtreant': {
                    // Rocking root-step, whippy branch swats.
                    const step = Math.sin(t * (fast ? 7 : 2.2)) * (fast ? 0.18 : 0.08);
                    if (this._rootLegs) { this._rootLegs[0].rotation.x = step; this._rootLegs[1].rotation.x = -step; }
                    if (this.trunk) this.trunk.rotation.z = Math.sin(t * 1.2) * 0.03;
                    const swat = fast ? Math.sin(t * 10) * 0.6 : Math.sin(t * 1.8) * 0.1;
                    if (this.branch1) this.branch1.rotation.z = swat;
                    if (this.branch2) this.branch2.rotation.z = -swat;
                    if (this.crown) this.crown.rotation.y = Math.sin(t * 0.8) * 0.15;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.2 * this.scale;
            this.model.rotation.z = prog * 1.1; // topples like a felled plant
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new SproutBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = P_PROFILES;
    reg('squeakyturnip',   { aliases: ['squeakyturnip'],   scale: S.squeakyturnip.scale,   weapon: 0, create: make });
    reg('totemicsprout',   { aliases: ['totemicsprout'],   scale: S.totemicsprout.scale,   weapon: 0, create: make });
    reg('barkhidebruiser', { aliases: ['barkhidebruiser'], scale: S.barkhidebruiser.scale, weapon: 0, create: make });
    ['lv_dandeliondrifter', 'lv_nettlesprout', 'lv_burrsprout', 'lv_sproutingspud', 'lv_saplingtreant']
        .forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        squeakyturnip:   ["Squeaky Turnip Fiend"],
        totemicsprout:   ["Totemic Sprout"],
        barkhidebruiser: ["Barkhide Bruiser"],
        lv_dandeliondrifter: ["Dandelion Drifter"],
        lv_nettlesprout:     ["Nettle Sprout"],
        lv_burrsprout:       ["Burr Sprout"],
        lv_sproutingspud:    ["Sprouting Spud"],
        lv_saplingtreant:    ["Sapling Treant"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Sprout uniques registered');
})();
