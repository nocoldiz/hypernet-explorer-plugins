//=============================================================================
// 3D Battler System - Serpent Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke serpent one-off models (young fake hydra, abyssal serpent,
 * crushing boa) + name-based assignment. Requires 3DBattlerSystem + families.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Serpent Uniques
 * ============================================================================
 *
 * Distinct procedural serpents shaped from each enemy's flavour text, pinned by
 * exact name. They map the Serpent archetype keys (HEAD/FANGS/BODY_SEGMENT_1/
 * BODY_SEGMENT_2/TAIL) so dismemberment works.
 *
 * Registered: youngfakehydra, abyssalserpent, crushingboa, lv_grasssnakelet
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Serpents] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const R_PROFILES = {
        youngfakehydra: { variant: 'youngfakehydra', scale: 2.0, texturePool: 'foliage', bodyColor: 0x6a8a4a, accent: 0xff5555, hue: [0.28, 0.06], sat: [0.45, 0.12], lit: [0.45, 0.10] },
        abyssalserpent: { variant: 'abyssalserpent', scale: 2.4, texturePool: 'void',    bodyColor: 0x1a3a5a, accent: 0x66ffdd, hue: [0.55, 0.08], sat: [0.55, 0.12], lit: [0.32, 0.08] },
        crushingboa:    { variant: 'crushingboa',    scale: 2.6, texturePool: 'wood',    bodyColor: 0x7a6a4a, accent: 0xaa8855, hue: [0.10, 0.05], sat: [0.40, 0.10], lit: [0.42, 0.10] },
        dreamserpent:   { variant: 'dreamserpent',   scale: 2.8, texturePool: 'void',    bodyColor: 0x9a7ac0, accent: 0xddccff, hue: [0.72, 0.10], sat: [0.40, 0.14], lit: [0.55, 0.10] },
        dunefang:       { variant: 'dunefang',       scale: 2.2, texturePool: 'sand',    bodyColor: 0xc8a96a, accent: 0x99ee55, hue: [0.10, 0.05], sat: [0.45, 0.10], lit: [0.55, 0.10] },
        embercentipede: { variant: 'embercentipede', scale: 2.4, texturePool: 'lava',    bodyColor: 0x552222, accent: 0xff7722, hue: [0.03, 0.04], sat: [0.60, 0.12], lit: [0.35, 0.10] },
        glacierserpent: { variant: 'glacierserpent', scale: 2.6, texturePool: 'ice',     bodyColor: 0x8fc6e6, accent: 0xeaffff, hue: [0.55, 0.06], sat: [0.40, 0.12], lit: [0.62, 0.10] },
        jungleconstrictor: { variant: 'jungleconstrictor', scale: 2.6, texturePool: 'foliage', bodyColor: 0x3a6a2a, accent: 0xccdd44, hue: [0.30, 0.06], sat: [0.50, 0.12], lit: [0.38, 0.10] },
        sandcobra:      { variant: 'sandcobra',      scale: 2.2, texturePool: 'sand',    bodyColor: 0xc9b079, accent: 0x884422, hue: [0.11, 0.05], sat: [0.42, 0.10], lit: [0.56, 0.10] },
        theviper:       { variant: 'theviper',       scale: 2.2, texturePool: 'foliage', bodyColor: 0x4a5a2a, accent: 0xbb33ff, hue: [0.24, 0.06], sat: [0.50, 0.12], lit: [0.34, 0.10] },
        titananaconda:  { variant: 'titananaconda',  scale: 3.0, texturePool: 'wood',    bodyColor: 0x44502a, accent: 0xaadd55, hue: [0.22, 0.05], sat: [0.42, 0.10], lit: [0.30, 0.08] },
        worldserpent:   { variant: 'worldserpent',   scale: 3.4, texturePool: 'wood',    bodyColor: 0x6a5a3a, accent: 0xffdd88, hue: [0.10, 0.05], sat: [0.38, 0.10], lit: [0.40, 0.10] },
        gloomscalebasilisk: { variant: 'gloomscalebasilisk', scale: 2.6, texturePool: 'void', bodyColor: 0x1a1622, accent: 0x66ff66, hue: [0.74, 0.06], sat: [0.30, 0.10], lit: [0.18, 0.06] },
        tempestwyvern:  { variant: 'tempestwyvern',  scale: 2.8, texturePool: 'void',    bodyColor: 0x33405a, accent: 0x88ddff, hue: [0.58, 0.06], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        // ── Level 1-5 starter roster (bespoke) ──
        lv_grasssnakelet: { variant: 'grasssnakelet', scale: 1.6, texturePool: 'foliage', bodyColor: 0x4a7a32, accent: 0xf0d040, hue: [0.27, 0.05], sat: [0.45, 0.10], lit: [0.36, 0.06] }
    };

    class SerpentBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = R_PROFILES[creatureType] || R_PROFILES.crushingboa;
            super(scale, offsetY, battler, profile, 0, creatureType || 'crushingboa');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.5 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.45 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0xffcc33, 1.0, 0.2, accent));
            eye.position.set(x, y, z);
            const slit = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 1.2, r * 0.3), this._mat(0x000000, 1.0, 0.1)); slit.position.set(0, 0, r * 0.7); eye.add(slit);
            parent.add(eye); return eye;
        }
        _serpentBase(o) {
            o = o || {};
            const p = this.profile;
            const skin = o.mat || this._skinMat(p.bodyColor, 0.45);
            this._serpMat = skin;
            const th = o.thick || 1.0;
            this.tail = new THREE.Mesh(new THREE.TorusGeometry(0.4 * th, 0.16 * th, 10, 20), skin); this.tail.position.set(0, 0.25, 0); this.tail.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tail);
            this.seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * th, 0.24 * th, 0.6, 12), skin); this.seg2.position.set(0, 0.7, 0); this.bodyGroup.add(this.seg2);
            this.seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * th, 0.18 * th, 0.6, 12), skin); this.seg1.position.set(0, 1.2, 0.05); this.seg1.rotation.x = -0.2; this.bodyGroup.add(this.seg1);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2 * (o.headMul || 1), 12, 10), skin); skull.scale.set(1, 0.8, 1.3); this.head.add(skull);
            this._eye(this.head, -0.1, 0.05, 0.1, 0.05, o.eyeColor || 0xffcc33); this._eye(this.head, 0.1, 0.05, 0.1, 0.05, o.eyeColor || 0xffcc33);
            this.fangs = new THREE.Group();
            for (const fx of [-0.06, 0.06]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.13, 4), this._mat(0xfafafa, 1, 0.3)); fang.position.set(fx, -0.12, 0.18); fang.rotation.x = Math.PI; this.fangs.add(fang); }
            this.head.add(this.fangs);
            this.head.position.set(0, 1.55, 0.18); this.bodyGroup.add(this.head);
            const extra = (o.extra || []).filter(Boolean);
            this._partMeshMap = { HEAD: this.head, FANGS: this.fangs, BODY_SEGMENT_1: this.seg1, BODY_SEGMENT_2: this.seg2, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY_SEGMENT_2'], hide: [this.seg2, this.seg1, this.head, ...extra] },
                { gone: ['BODY_SEGMENT_1'], hide: [this.seg1, this.head] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'abyssalserpent': this._buildAbyssalSerpent(); break;
                case 'crushingboa':    this._buildCrushingBoa(); break;
                case 'dreamserpent':   this._buildDreamSerpent(); break;
                case 'dunefang':       this._buildDuneFang(); break;
                case 'embercentipede': this._buildEmberCentipede(); break;
                case 'glacierserpent': this._buildGlacierSerpent(); break;
                case 'jungleconstrictor': this._buildJungleConstrictor(); break;
                case 'sandcobra':      this._buildSandCobra(); break;
                case 'theviper':       this._buildTheViper(); break;
                case 'titananaconda':  this._buildTitanAnaconda(); break;
                case 'worldserpent':   this._buildWorldSerpent(); break;
                case 'gloomscalebasilisk': this._buildGloomscaleBasilisk(); break;
                case 'tempestwyvern':  this._buildTempestWyvern(); break;
                case 'grasssnakelet':  this._buildGrassSnakelet(); break;
                default:               this._buildFakeHydra(); break;
            }
            if (this.seg1 && this.head && !this._ownPose) this._rigNeck();
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // The neck (seg1) bends at its root on seg2 and carries the head on its
        // tip. Posing the head on its own (a lunge of 0.4 straight forward)
        // pulled it clean off the neck on every strike.
        _rigNeck() {
            const s = this.seg1;
            const up = new THREE.Vector3(0, 0.3, 0).applyEuler(s.rotation);
            this._neckPivot = s.position.clone().sub(up);
            this._neckRot0 = s.rotation.clone();
            this._headOff = this.head.position.clone().sub(s.position).sub(up);
            this._nv = new THREE.Vector3(); this._nv2 = new THREE.Vector3();
            this._ne = new THREE.Euler(); this._ne2 = new THREE.Euler();
        }
        _poseNeck(lean, sway) {
            const s = this.seg1;
            s.rotation.set(this._neckRot0.x + lean, 0, this._neckRot0.z + sway);
            const up = this._nv.set(0, 0.3, 0).applyEuler(s.rotation);
            s.position.copy(this._neckPivot).add(up);
            const off = this._nv2.copy(this._headOff).applyEuler(this._ne2.set(lean, 0, sway));
            this.head.position.copy(this._neckPivot).addScaledVector(up, 2).add(off);
        }

        // ── Young Fake Hydra: one real head + two googly fake puppet heads ──
        _buildFakeHydra() {
            const p = this.profile;
            this._serpentBase({ eyeColor: 0xffee33 });
            this.fakeHeads = new THREE.Group();
            for (const sx of [-1, 1]) {
                const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), this._serpMat); neck.position.set(sx * 0.22, 1.3, 0); neck.rotation.z = sx * 0.5; this.fakeHeads.add(neck);
                const fh = new THREE.Group();
                const fs = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this._serpMat); fs.scale.set(1, 0.8, 1.2); fh.add(fs);
                // Oversized googly fake eyes (stitched-on).
                for (const ex of [-0.07, 0.07]) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(0xffffff, 1, 0.2)); w.position.set(ex, 0.05, 0.12); const pp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(0x111111, 1, 0.1)); pp.position.set(0, 0, 0.05); w.add(pp); fh.add(w); }
                fh.position.set(sx * 0.42, 1.55, 0); fh._sx = sx; this.fakeHeads.add(fh);
            }
            // Laid out in body space, then carried by the neck so the puppet heads
            // sway with it instead of staying behind when it weaves.
            this.seg1.updateMatrix();
            this.fakeHeads.applyMatrix4(this.seg1.matrix.clone().invert());
            this.seg1.add(this.fakeHeads);
            this._cascadeRules[0].hide.push(this.fakeHeads);
            this._cascadeRules[1].hide.push(this.fakeHeads);
        }

        // ── Abyssal Serpent: deep-sea, hypnotic glowing scale spots, fins ──
        _buildAbyssalSerpent() {
            const p = this.profile;
            this._serpentBase({ eyeColor: p.accent });
            // Hypnotic luminous spots up the body.
            this.spots = new THREE.Group();
            for (let i = 0; i < 10; i++) { const a = this.idRand() * Math.PI * 2; const y = 0.5 + this.idRand() * 1.0; const spot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), this._mat(p.accent, 0.9, 0.2, p.accent)); spot.position.set(Math.cos(a) * 0.22, y, 0.2 + Math.sin(a) * 0.05); this.spots.add(spot); }
            this.bodyGroup.add(this.spots);
            // Dorsal fin crest.
            this.crest = new THREE.Group();
            for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), this._mat(p.accent, 0.6, 0.3, p.accent)); fin.position.set(0, 0.8 + i * 0.2, -0.18); fin.scale.set(0.4, 1, 1); this.crest.add(fin); }
            this.bodyGroup.add(this.crest);
            this._cascadeRules[0].hide.push(this.spots, this.crest);
        }

        // ── Crushing Boa: a thick, muscular tree-trunk constrictor ─────────
        _buildCrushingBoa() {
            const p = this.profile;
            this._serpentBase({ thick: 1.5, headMul: 1.3, eyeColor: 0xccaa44 });
            // Heavy muscle banding.
            this.bands = new THREE.Group();
            for (let i = 0; i < 5; i++) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.01, 0.04, 6, 16), this._mat(p.accent, 1, 0.6)); band.position.set(0, 0.5 + i * 0.18, 0); band.rotation.x = Math.PI / 2; this.bands.add(band); }
            this.bodyGroup.add(this.bands);
            this._cascadeRules[0].hide.push(this.bands);
        }

        // ── Dream Serpent High Priest: colossal, ghostly translucent coils, halo ──
        _buildDreamSerpent() {
            const p = this.profile;
            // Phantom-light translucent skin.
            const ghost = this._mat(p.bodyColor, 0.45, 0.2, p.accent);
            this._serpentBase({ mat: ghost, thick: 1.3, headMul: 1.4, eyeColor: p.accent });
            // Floating halo crown of light rings above the head.
            this.halo = new THREE.Group();
            for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18 - i * 0.04, 0.012, 6, 24), this._mat(p.accent, 0.7, 0.1, p.accent)); ring.position.set(0, 0.34 + i * 0.06, 0); ring.rotation.x = Math.PI / 2; this.halo.add(ring); }
            this.halo.userData.float = true; // a crown of light hovering over the brow
            this.head.add(this.halo);
            // Drifting dream-motes orbiting the coils.
            this.motes = new THREE.Group();
            this.motes.userData.float = true;
            for (let i = 0; i < 12; i++) { const a = this.idRand() * Math.PI * 2; const r = 0.3 + this.idRand() * 0.2; const mote = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), this._mat(p.accent, 0.8, 0.1, p.accent)); mote.position.set(Math.cos(a) * r, 0.4 + this.idRand() * 1.2, Math.sin(a) * r); mote._a = a; mote._r = r; this.motes.add(mote); }
            this.bodyGroup.add(this.motes);
            this._cascadeRules[0].hide.push(this.motes);
        }

        // ── Dune Fang: sandy serpent with huge venom-dripping fangs, ridged sand scutes ──
        _buildDuneFang() {
            const p = this.profile;
            this._serpentBase({ headMul: 1.2, eyeColor: 0xddaa44 });
            // Oversized venom fangs replacing the small base ones.
            this.fangs.scale.set(2.2, 2.4, 2.2);
            // Glistening toxin droplets at fang tips.
            this.venom = new THREE.Group();
            // Formed at the fang tips in the head's own space, so they strike
            // with it; each falls away and re-forms, so they are floaters.
            for (const vx of [-0.132, 0.132]) { const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), this._mat(p.accent, 0.85, 0.2, p.accent)); drop.scale.set(1, 1.4, 1); drop.position.set(vx, -0.47, 0.4); this.venom.add(drop); }
            this.venom.userData.float = true;
            this.head.add(this.venom);
            // Dorsal sand-ridge scutes running the spine.
            this.scutes = new THREE.Group();
            for (let i = 0; i < 6; i++) { const scute = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 4), this._mat(p.bodyColor, 1, 0.8)); scute.position.set(0, 0.55 + i * 0.18, -0.16); scute.rotation.x = -0.4; this.scutes.add(scute); }
            this.bodyGroup.add(this.scutes);
            this._cascadeRules[0].hide.push(this.scutes);
            this._cascadeRules[2].hide.push(this.venom); // venom tied to head
            this._cascadeRules[3].hide.push(this.venom); // and to fangs
        }

        // ── Ember Centipede: many-legged armoured segments glowing with embers ──
        _buildEmberCentipede() {
            const p = this.profile;
            this._serpentBase({ thick: 1.1, eyeColor: p.accent });
            // Glowing ember-cracks between chitin plates, plus segmented legs.
            this.plates = new THREE.Group();
            this.legs = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const y = 0.45 + i * 0.24;
                const plate = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), this._mat(p.bodyColor, 1, 0.55)); plate.scale.set(1.1, 0.7, 1.1); plate.position.set(0, y, 0); this.plates.add(plate);
                const glow = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 5, 14), this._mat(p.accent, 0.95, 0.2, p.accent)); glow.position.set(0, y, 0); glow.rotation.x = Math.PI / 2; this.plates.add(glow);
                // pair of legs each side per segment
                for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.32, 5), this._mat(0x331111, 1, 0.6)); leg.position.set(sx * 0.22, y - 0.06, 0); leg.rotation.z = sx * 0.9; leg._sx = sx; leg._i = i; this.legs.add(leg); }
            }
            this.bodyGroup.add(this.plates);
            this.bodyGroup.add(this.legs);
            // Mandible pincers around the mouth.
            this.mandibles = new THREE.Group();
            for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), this._mat(0x221008, 1, 0.4)); m.position.set(sx * 0.1, -0.08, 0.16); m.rotation.set(Math.PI / 2.4, 0, sx * 0.5); this.mandibles.add(m); }
            this.head.add(this.mandibles);
            this._cascadeRules[0].hide.push(this.plates, this.legs);
        }

        // ── Glacier Serpent: jagged ice-drake with crystalline frost spines ──
        _buildGlacierSerpent() {
            const p = this.profile;
            const iceMat = this._mat(p.bodyColor, 0.8, 0.15, 0x224455);
            this._serpentBase({ mat: iceMat, thick: 1.25, headMul: 1.3, eyeColor: p.accent });
            // Sharp crystalline frost spines erupting from the back.
            this.shards = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const y = 0.45 + this.idRand() * 1.1; const r = 0.16 + this.idRand() * 0.06; const shard = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22 + this.idRand() * 0.14, 4), this._mat(p.accent, 0.85, 0.1, 0x335577)); shard.position.set(Math.cos(a) * r, y, Math.sin(a) * r * 0.6 - 0.05); shard.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6); this.shards.add(shard); }
            this.bodyGroup.add(this.shards);
            // Frosty breath crystals near the jaw.
            this.frost = new THREE.Group();
            for (let i = 0; i < 4; i++) { const fc = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), this._mat(p.accent, 0.7, 0.1, 0x335577)); fc.position.set((this.idRand() - 0.5) * 0.2, -0.1 - this.idRand() * 0.1, 0.25 + this.idRand() * 0.15); this.frost.add(fc); }
            this.head.add(this.frost);
            this._cascadeRules[0].hide.push(this.shards);
        }

        // ── Jungle Constrictor: thick coiled green snake with leafy diamond pattern ──
        _buildJungleConstrictor() {
            const p = this.profile;
            this._serpentBase({ thick: 1.6, headMul: 1.2, eyeColor: 0xddcc33 });
            // Looped coil ring around the lower body (crushing posture).
            this.coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 10, 24), this._serpMat); this.coil.position.set(0, 0.5, 0); this.coil.rotation.x = Math.PI / 2.2; this.bodyGroup.add(this.coil);
            // Diamond camouflage scale patches along the spine.
            this.diamonds = new THREE.Group();
            for (let i = 0; i < 6; i++) { const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), this._mat(p.accent, 1, 0.5)); dia.scale.set(1, 0.4, 1.3); dia.position.set(0, 0.55 + i * 0.18, 0.18); this.diamonds.add(dia); }
            this.bodyGroup.add(this.diamonds);
            // Forked venom tongue.
            this.tongue = new THREE.Group();
            for (const tx of [-0.03, 0.03]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 4), this._mat(0x992233, 1, 0.4)); t.position.set(tx, -0.1, 0.28); t.rotation.x = Math.PI / 2.2; this.tongue.add(t); }
            this.head.add(this.tongue);
            this._cascadeRules[0].hide.push(this.coil, this.diamonds);
        }

        // ── Sand Cobra: reared upright serpent with a wide flared hood ──
        _buildSandCobra() {
            const p = this.profile;
            this._serpentBase({ headMul: 1.25, eyeColor: 0xccaa33 });
            // Rear the upper body up and tilt head forward (striking pose).
            if (this.seg1) this.seg1.rotation.x = -0.5;
            // Wide flared hood behind the head.
            this.hood = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), this._serpMat);
            this.hood.scale.set(1.3, 0.35, 0.55); this.hood.position.set(0, 0.05, -0.12); this.hood.rotation.x = -0.9; this.head.add(this.hood);
            // Spectacle marking on the hood back.
            this.mark = new THREE.Group();
            for (const mx of [-0.12, 0.12]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 18), this._mat(p.accent, 1, 0.4)); ring.position.set(mx, 0.02, -0.32); ring.rotation.x = -0.9; this.mark.add(ring); }
            this.head.add(this.mark);
            // Hood is structurally part of the head -> cascades with HEAD already.
        }

        // ── The Viper: slender sinister poisoner, diamond pattern, venom drip ──
        _buildTheViper() {
            const p = this.profile;
            this._serpentBase({ thick: 0.7, headMul: 0.95, eyeColor: p.accent });
            // Arrowhead viper skull plates pinching the snout.
            this.brow = new THREE.Group();
            for (const sx of [-1, 1]) { const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), this._mat(p.bodyColor, 1, 0.5)); ridge.position.set(sx * 0.12, 0.08, 0.04); ridge.rotation.set(0, 0, sx * 0.5); this.brow.add(ridge); }
            this.head.add(this.brow);
            // Diamond venom-pattern band down the slim body.
            this.pattern = new THREE.Group();
            for (let i = 0; i < 8; i++) { const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this._mat(p.accent, 1, 0.4, p.accent)); dia.scale.set(1, 0.3, 1.6); dia.position.set(0, 0.45 + i * 0.16, 0.13); this.pattern.add(dia); }
            this.bodyGroup.add(this.pattern);
            // Exotic venom dripping off the fangs.
            this.drip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), this._mat(p.accent, 0.9, 0.2, p.accent)); this.drip.scale.set(1, 1.6, 1); this.drip.position.set(0.06, -0.21, 0.18); this.drip.userData.float = true; this.head.add(this.drip); // off the fang tip
            this._cascadeRules[0].hide.push(this.pattern, this.drip);
            this._cascadeRules[3].hide.push(this.drip); // drip tied to fangs
        }

        // ── Titan Anaconda: colossal dark olive crusher, immense girth ──
        _buildTitanAnaconda() {
            const p = this.profile;
            this._serpentBase({ thick: 2.2, headMul: 1.5, eyeColor: 0x99bb44 });
            // Enormous overlapping coil loops conveying crushing girth.
            this.loops = new THREE.Group();
            for (let i = 0; i < 3; i++) { const loop = new THREE.Mesh(new THREE.TorusGeometry(0.5 - i * 0.06, 0.26, 12, 28), this._serpMat); loop.position.set(0, 0.4 + i * 0.18, 0); loop.rotation.x = Math.PI / 2 + i * 0.12; loop.rotation.z = i * 0.4; this.loops.add(loop); }
            this.bodyGroup.add(this.loops);
            // Mottled blotches across the broad back.
            this.blotches = new THREE.Group();
            for (let i = 0; i < 10; i++) { const a = this.idRand() * Math.PI * 2; const y = 0.4 + this.idRand() * 1.1; const b = new THREE.Mesh(new THREE.CircleGeometry(0.09 + this.idRand() * 0.05, 8), this._mat(0x222a11, 1, 0.6)); b.position.set(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4); b.lookAt(Math.cos(a) * 2, y, Math.sin(a) * 2); this.blotches.add(b); }
            this.bodyGroup.add(this.blotches);
            this._cascadeRules[0].hide.push(this.loops, this.blotches);
        }

        // ── World Serpent: mythic mountain-encircling colossus, runed scales ──
        _buildWorldSerpent() {
            const p = this.profile;
            this._serpentBase({ thick: 2.0, headMul: 1.6, eyeColor: p.accent });
            // A vast encircling outer ring representing its world-girdling body.
            this.girdle = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.22, 14, 40), this._serpMat); this.girdle.position.set(0, 0.6, 0); this.girdle.rotation.x = Math.PI / 2.3; this.bodyGroup.add(this.girdle);
            // Glowing ancient runes inscribed along the body.
            this.runes = new THREE.Group();
            for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rune = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.07, 6, 1), this._mat(p.accent, 0.9, 0.1, p.accent)); rune.position.set(Math.cos(a) * 0.85, 0.6, Math.sin(a) * 0.85); rune.lookAt(0, 0.6, 0); rune._a = a; this.runes.add(rune); }
            this.bodyGroup.add(this.runes);
            // A crown of jagged ancient horns over the great head.
            this.horns = new THREE.Group();
            for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), this._mat(0xddccaa, 1, 0.5)); horn.position.set(sx * 0.13, 0.18, -0.08); horn.rotation.set(-0.4, 0, sx * 0.4); this.horns.add(horn); }
            this.head.add(this.horns);
            this._cascadeRules[0].hide.push(this.girdle, this.runes);
        }

        // ── Gloomscale Basilisk: subterranean shadow-scaled petrifier, glowing eyes ──
        _buildGloomscaleBasilisk() {
            const p = this.profile;
            const dark = this._mat(p.bodyColor, 1, 0.7);
            this._serpentBase({ mat: dark, thick: 1.2, headMul: 1.25, eyeColor: p.accent });
            // Enlarge & intensify the petrifying glowing eyes.
            this.head.children.forEach(c => { if (c.geometry && c.geometry.type === 'SphereGeometry' && c.material && c.material.emissive && c.material.emissiveIntensity > 0) c.scale.setScalar(1.8); });
            // Overlapping ridged shadow-scale plates along the spine.
            this.shadowScales = new THREE.Group();
            for (let i = 0; i < 9; i++) { const sc = new THREE.Mesh(new THREE.CircleGeometry(0.14, 3), this._mat(0x0c0a12, 1, 0.8)); sc.scale.set(1, 1.4, 1); sc.position.set(0, 0.42 + i * 0.14, 0.15); sc.rotation.x = -0.3; this.shadowScales.add(sc); }
            this.bodyGroup.add(this.shadowScales);
            // A creeping petrifying mist hugging the ground.
            this.mist = new THREE.Group();
            for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 + this.idRand() * 0.06, 6, 6), this._mat(0x445533, 0.3, 0.9, 0x223311)); m.position.set((this.idRand() - 0.5) * 0.7, 0.18 + this.idRand() * 0.1, (this.idRand() - 0.5) * 0.7); this.mist.add(m); }
            this.bodyGroup.add(this.mist);
            this._cascadeRules[0].hide.push(this.shadowScales);
        }

        // ── Tempest Wyvern: winged storm serpent crackling with lightning ──
        _buildTempestWyvern() {
            const p = this.profile;
            this._serpentBase({ thick: 1.1, headMul: 1.2, eyeColor: p.accent });
            // Two membranous storm wings flaring from the coil.
            this.wings = new THREE.Group();
            for (const sx of [-1, 1]) {
                const wing = new THREE.Group();
                const memb = new THREE.Mesh(new THREE.CircleGeometry(0.5, 3), this._mat(p.bodyColor, 0.6, 0.4, p.accent)); memb.scale.set(1, 0.7, 1); wing.add(memb);
                for (let r = 0; r < 3; r++) { const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.5, 5), this._mat(0x222b3a, 1, 0.5)); rib.position.set(0, 0, 0); rib.rotation.z = -0.5 + r * 0.4; rib.position.y = -0.1 + r * 0.05; wing.add(rib); }
                wing.position.set(sx * 0.28, 0.95, -0.05); wing.rotation.y = sx * 0.5; wing.rotation.z = sx * -0.3; wing._sx = sx; this.wings.add(wing);
            }
            this.bodyGroup.add(this.wings);
            // Crackling lightning arcs leaping along the spine.
            this.arcs = new THREE.Group();
            for (let i = 0; i < 6; i++) { const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 4), this._mat(p.accent, 0.95, 0.1, p.accent)); arc.position.set((this.idRand() - 0.5) * 0.1, 0.5 + i * 0.18, 0.16); arc.rotation.z = (this.idRand() - 0.5) * 1.2; this.arcs.add(arc); }
            this.bodyGroup.add(this.arcs);
            this._cascadeRules[0].hide.push(this.wings, this.arcs);
        }

        // ── Grass Snakelet: a thin green youngster laid in an S on the ground,
        // neck reared, yellow-and-black collar, mouth wide in a hiss ─────────
        _buildGrassSnakelet() {
            const p = this.profile;
            this._ownPose = true; // its own neck, not the coiled base's
            const skin = this._skinMat(p.bodyColor, 0.45);
            const bar = this._mat(0x14140c, 1, 0.6);
            const collar = this._mat(p.accent, 1, 0.4);
            this.segs = [];
            const N = 22;
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1);
                const r = 0.11 * (1 - u * 0.7) + 0.02;
                const rise = u < 0.3 ? Math.pow((0.3 - u) / 0.3, 1.6) * 0.42 : 0;
                const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), skin);
                m.position.set(Math.sin(u * Math.PI * 2.4) * 0.15 * Math.min(1, u * 3), r * 0.9 + rise, 0.25 - u * 1.25);
                m._base = m.position.clone(); m._u = u;
                if (i > 2 && i % 2 === 0) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, r * 0.7, r * 0.35), bar); b.position.set(s * r * 0.93, 0, 0); m.add(b); }
                this.bodyGroup.add(m); this.segs.push(m);
            }
            // The collar: yellow crescents just behind the head, a black band after.
            const s1 = this.segs[1], r1 = s1.geometry.parameters.radius;
            for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.TorusGeometry(r1 * 0.8, 0.03, 4, 8, Math.PI), collar); c.position.set(s * r1 * 0.55, 0.02, 0); c.rotation.set(0, s * Math.PI / 2, Math.PI / 2); s1.add(c); }
            const s2 = this.segs[2]; const band = new THREE.Mesh(new THREE.TorusGeometry(s2.geometry.parameters.radius * 0.98, 0.03, 4, 10), bar); band.rotation.x = 0.4; s2.add(band);
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), skin); skull.scale.set(0.9, 0.72, 1.35); this.head.add(skull);
            for (const s of [-1, 1]) { const e = this._eye(this.head, s * 0.08, 0.035, 0.06, 0.035, 0xd8a838); e.children[0].scale.set(1, 0.3, 1); }
            const throat = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), this._mat(0xd8607a, 1, 0.5)); throat.scale.set(0.9, 0.35, 1.2); throat.position.set(0, -0.05, 0.05); this.head.add(throat);
            // Lower jaw hinged at the back of the head, dropped open to hiss.
            this._jaw = new THREE.Group(); this._jaw.position.set(0, -0.05, -0.06); this.head.add(this._jaw);
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), skin); jaw.scale.set(0.82, 0.28, 1.3); jaw.position.z = 0.1; this._jaw.add(jaw);
            this._jaw.rotation.x = 0.45;
            this.fangs = new THREE.Group(); this.head.add(this.fangs);
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.05, 4), this._mat(0xf8f4ea, 1, 0.3)); f.position.set(s * 0.04, -0.06, 0.12); f.rotation.x = Math.PI; this.fangs.add(f); }
            this._tongue = new THREE.Group(); this._tongue.position.set(0, -0.06, 0.1); this.head.add(this._tongue);
            for (const s of [-1, 1]) { const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.14, 3), this._mat(0x2a1a2a, 1, 0.5)); tg.rotation.set(Math.PI / 2 - 0.2, s * 0.25, 0); tg.position.set(s * 0.012, -0.012, 0.07); this._tongue.add(tg); }
            this._headOff = new THREE.Vector3(0, 0.02, 0.13);
            this.head.position.copy(this.segs[0].position).add(this._headOff); this.bodyGroup.add(this.head);
            this.seg1 = this.segs[3]; this.seg2 = this.segs[9]; this.tail = this.segs[N - 1];
            this._partMeshMap = { HEAD: this.head, FANGS: this.fangs, BODY_SEGMENT_1: this.seg1, BODY_SEGMENT_2: this.seg2, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY_SEGMENT_2'], hide: [this.head, ...this.segs] },
                { gone: ['BODY_SEGMENT_1'], hide: [this.head, ...this.segs.slice(0, 4)] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['TAIL'], hide: this.segs.slice(N - 4) },
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.02 * this.scale;
            // Shared weave: head/upper body sway.
            const weave = Math.sin(t * (fast ? 4 : 1.6));
            if (this._neckPivot) {
                const lunge = fast ? Math.abs(Math.sin(t * 8)) * 0.7 : 0;
                this._poseNeck(lunge, -weave * 0.25);
                this.head.rotation.z = -weave * 0.3; this.head.rotation.x = lunge * 0.4;
            }

            switch (this.variant) {
                case 'youngfakehydra': {
                    if (this.fakeHeads) this.fakeHeads.children.forEach((c, i) => { if (c._sx !== undefined) { c.rotation.z = Math.sin(t * (fast ? 7 : 3) + i) * 0.4; c.position.y = 1.55 + Math.sin(t * 4 + i) * 0.06; } });
                    break;
                }
                case 'abyssalserpent': {
                    if (this.spots) this.spots.children.forEach((s, i) => { s.material.emissiveIntensity = 0.4 + Math.sin(t * 2 + i * 0.6) * 0.5; });
                    if (this.crest) this.crest.children.forEach((f, i) => { f.material.emissiveIntensity = 0.3 + Math.sin(t * 3 + i) * 0.3; });
                    break;
                }
                case 'crushingboa': {
                    if (fast && this.tail) this.tail.scale.setScalar(1 + Math.abs(Math.sin(t * 6)) * 0.1); // constrict
                    break;
                }
                case 'dreamserpent': {
                    if (this.halo) this.halo.rotation.y = t * 0.6;
                    if (this.motes) this.motes.children.forEach((m, i) => { const a = m._a + t * 0.5; m.position.x = Math.cos(a) * m._r; m.position.z = Math.sin(a) * m._r; m.material.emissiveIntensity = 0.4 + Math.sin(t * 3 + i) * 0.4; });
                    break;
                }
                case 'dunefang': {
                    if (this.venom) this.venom.children.forEach((d, i) => { d.position.y = -0.47 - (((t * 0.4 + i * 0.5) % 1) * 0.12); });
                    break;
                }
                case 'embercentipede': {
                    if (this.legs) this.legs.children.forEach((l) => { l.rotation.x = Math.sin(t * (fast ? 10 : 5) + l._i * 0.8 + (l._sx > 0 ? Math.PI : 0)) * 0.35; });
                    if (this.plates) this.plates.children.forEach((c, i) => { if (c.material.emissive) c.material.emissiveIntensity = 0.3 + Math.sin(t * 4 + i) * 0.4; });
                    break;
                }
                case 'glacierserpent': {
                    if (this.shards) this.shards.children.forEach((s, i) => { s.material.emissiveIntensity = 0.2 + Math.sin(t * 1.5 + i) * 0.2; });
                    break;
                }
                case 'jungleconstrictor': {
                    if (this.tongue) this.tongue.children.forEach((tg, i) => { tg.position.z = 0.28 + Math.abs(Math.sin(t * (fast ? 8 : 3))) * 0.08; });
                    if (this.coil && fast) this.coil.scale.setScalar(1 + Math.abs(Math.sin(t * 6)) * 0.12);
                    break;
                }
                case 'sandcobra': {
                    if (this.hood) { const flare = fast ? 1.0 : (0.7 + Math.sin(t * 2) * 0.3); this.hood.scale.set(1.3 * flare, 0.35, 0.55); }
                    break;
                }
                case 'theviper': {
                    if (this.pattern) this.pattern.children.forEach((d, i) => { d.material.emissiveIntensity = 0.3 + Math.sin(t * 2.5 + i * 0.5) * 0.4; });
                    if (this.drip) this.drip.position.y = -0.21 - (((t * 0.5) % 1) * 0.14);
                    break;
                }
                case 'titananaconda': {
                    if (this.loops) this.loops.children.forEach((l, i) => { l.rotation.z = i * 0.4 + Math.sin(t * (fast ? 5 : 1.2) + i) * 0.08; if (fast) l.scale.setScalar(1 + Math.abs(Math.sin(t * 6)) * 0.06); });
                    break;
                }
                case 'worldserpent': {
                    if (this.girdle) this.girdle.rotation.z = Math.sin(t * 0.4) * 0.05;
                    if (this.runes) this.runes.children.forEach((r, i) => { r.material.emissiveIntensity = 0.3 + Math.sin(t * 1.5 + r._a * 2) * 0.5; });
                    break;
                }
                case 'gloomscalebasilisk': {
                    if (this.mist) this.mist.children.forEach((m, i) => { m.position.y = 0.18 + Math.sin(t * 1.2 + i) * 0.05; m.material.opacity = 0.2 + Math.abs(Math.sin(t + i)) * 0.2; });
                    break;
                }
                case 'grasssnakelet': {
                    // A travelling wave along the S, the reared neck striking forward.
                    const rate = fast ? 7 : 2.6, strike = fast ? Math.max(0, Math.sin(t * 6)) : 0;
                    this.segs.forEach((s, i) => {
                        s.position.x = s._base.x + Math.sin(t * rate - i * 0.55) * 0.04 * (0.3 + s._u);
                        const k = s._u < 0.3 ? (0.3 - s._u) / 0.3 : 0;
                        s.position.z = s._base.z + strike * 0.18 * k * k; s.position.y = s._base.y + strike * 0.04 * k;
                    });
                    if (this.head) this.head.position.copy(this.segs[0].position).add(this._headOff);
                    if (this._jaw) this._jaw.rotation.x = 0.45 + (fast ? strike * 0.4 : Math.abs(Math.sin(t * 3)) * 0.15);
                    if (this._tongue) { const f = Math.sin(t * 9); this._tongue.visible = f > -0.2; this._tongue.scale.z = 0.6 + Math.abs(f) * 0.6; }
                    break;
                }
                case 'tempestwyvern': {
                    if (this.wings) this.wings.children.forEach((w) => { w.rotation.z = w._sx * (-0.3 + Math.sin(t * (fast ? 8 : 3)) * 0.4); });
                    if (this.arcs) this.arcs.children.forEach((a, i) => { a.visible = Math.sin(t * 12 + i * 1.7) > 0.2; a.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 10 + i)) * 0.6; });
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Slumps over backwards, the head going down with the neck.
            if (this._neckPivot) this._poseNeck(-prog * 1.2, 0);
            this.model.rotation.z = prog * 0.4;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new SerpentBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = R_PROFILES;
    reg('youngfakehydra', { aliases: ['youngfakehydra'], scale: S.youngfakehydra.scale, weapon: 0, create: make });
    reg('abyssalserpent', { aliases: ['abyssalserpent'], scale: S.abyssalserpent.scale, weapon: 0, create: make });
    reg('crushingboa',    { aliases: ['crushingboa'],    scale: S.crushingboa.scale,    weapon: 0, create: make });
    reg('dreamserpent',   { aliases: ['dreamserpent'],   scale: S.dreamserpent.scale,   weapon: 0, create: make });
    reg('dunefang',       { aliases: ['dunefang'],       scale: S.dunefang.scale,       weapon: 0, create: make });
    reg('embercentipede', { aliases: ['embercentipede'], scale: S.embercentipede.scale, weapon: 0, create: make });
    reg('glacierserpent', { aliases: ['glacierserpent'], scale: S.glacierserpent.scale, weapon: 0, create: make });
    reg('jungleconstrictor', { aliases: ['jungleconstrictor'], scale: S.jungleconstrictor.scale, weapon: 0, create: make });
    reg('sandcobra',      { aliases: ['sandcobra'],      scale: S.sandcobra.scale,      weapon: 0, create: make });
    reg('theviper',       { aliases: ['theviper'],       scale: S.theviper.scale,       weapon: 0, create: make });
    reg('titananaconda',  { aliases: ['titananaconda'],  scale: S.titananaconda.scale,  weapon: 0, create: make });
    reg('worldserpent',   { aliases: ['worldserpent'],   scale: S.worldserpent.scale,   weapon: 0, create: make });
    reg('gloomscalebasilisk', { aliases: ['gloomscalebasilisk'], scale: S.gloomscalebasilisk.scale, weapon: 0, create: make });
    reg('tempestwyvern',  { aliases: ['tempestwyvern'],  scale: S.tempestwyvern.scale,  weapon: 0, create: make });
    reg('lv_grasssnakelet', { aliases: ['lv_grasssnakelet'], scale: S.lv_grasssnakelet.scale, weapon: 0, create: make });

    const NAMED = {
        youngfakehydra: ["Young Fake Hydra"],
        abyssalserpent: ["Abyssal Serpent"],
        crushingboa:    ["Crushing Boa"],
        dreamserpent:   ["Dream Serpent High Priest"],
        dunefang:       ["Dune Fang"],
        embercentipede: ["Ember Centipede"],
        glacierserpent: ["Glacier Serpent"],
        jungleconstrictor: ["Jungle Constrictor"],
        sandcobra:      ["Sand Cobra"],
        theviper:       ["The Viper"],
        titananaconda:  ["Titan Anaconda"],
        worldserpent:   ["World Serpent"],
        gloomscalebasilisk: ["Gloomscale Basilisk"],
        tempestwyvern:  ["Tempest Wyvern"],
        lv_grasssnakelet: ["Grass Snakelet"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Serpent uniques registered');
})();
