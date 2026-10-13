//=============================================================================
// 3D Battler System - Draconic Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Winged beast procedural 3D battlers (dragon, hydra, phoenix,
 * manticore). Requires 3DBattlerSystem (core) to load first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Draconic Family
 * ============================================================================
 *
 * Large winged creatures (no physics) sharing wing/leg builders and the shared
 * part-losing engine + per-monster-id variation from window.Battler3D.Base.
 *
 * Registered: Dragon, Hydra, Phoenix, Manticore
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Draconic] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const DR_PROFILES = {
        dragon:    { variant: 'dragon', scale: 4.0, texturePool: 'green', bodyColor: 0x3a6a3a, wingColor: 0x244024, accent: 0xff6a1a, hue: [0.32, 0.12], sat: [0.50, 0.18], lit: [0.32, 0.10] },
        hydra:     { variant: 'hydra', scale: 3.8, texturePool: 'water', bodyColor: 0x2a6a7a, wingColor: 0x183848, accent: 0x66ffcc, hue: [0.50, 0.10], sat: [0.50, 0.15], lit: [0.34, 0.10] },
        phoenix:   { variant: 'phoenix', scale: 3.4, texturePool: 'fire', bodyColor: 0xff6a1a, wingColor: 0xff9020, accent: 0xfff2a0, hue: [0.05, 0.05], sat: [0.90, 0.08], lit: [0.52, 0.10] },
        manticore: { variant: 'manticore', scale: 3.6, texturePool: 'fur', bodyColor: 0x7a4a2a, wingColor: 0x3a2418, accent: 0xff3322, hue: [0.06, 0.04], sat: [0.50, 0.15], lit: [0.34, 0.10] },
        firedragonling:  { variant: 'firedragonling', scale: 2.2, texturePool: 'fire', bodyColor: 0xb02212, wingColor: 0x801810, accent: 0xff7a1a, hue: [0.02, 0.03], sat: [0.80, 0.10], lit: [0.40, 0.10] },
        frostdragon:     { variant: 'frostdragon', scale: 4.6, texturePool: 'water', bodyColor: 0xaad0ec, wingColor: 0x7ab0d8, accent: 0xcdeeff, hue: [0.56, 0.06], sat: [0.40, 0.12], lit: [0.62, 0.10] },
        icedragonling:   { variant: 'icedragonling', scale: 2.2, texturePool: 'water', bodyColor: 0x9cd6f4, wingColor: 0x6fb6e0, accent: 0xe6faff, hue: [0.54, 0.05], sat: [0.55, 0.12], lit: [0.58, 0.10] },
        juvenileicewyrm: { variant: 'juvenileicewyrm', scale: 3.0, texturePool: 'water', bodyColor: 0x8ec8e8, wingColor: 0x6aaed6, accent: 0xdcf6ff, hue: [0.53, 0.05], sat: [0.45, 0.12], lit: [0.56, 0.10] },
        mercurydragon:   { variant: 'mercurydragon', scale: 4.0, texturePool: 'metal', bodyColor: 0xc8ccd2, wingColor: 0x9aa0a8, accent: 0xeef2f6, hue: [0.60, 0.04], sat: [0.05, 0.05], lit: [0.66, 0.08] },
        moltendragon:    { variant: 'moltendragon', scale: 4.2, texturePool: 'fire', bodyColor: 0x1a1410, wingColor: 0x100c08, accent: 0xff5a08, hue: [0.05, 0.04], sat: [0.85, 0.10], lit: [0.18, 0.08] },
        multiheadedhydra: { variant: 'multiheadedhydra', scale: 4.0, texturePool: 'water', bodyColor: 0x2e7a3a, wingColor: 0x1c4a26, accent: 0xaaff66, hue: [0.30, 0.08], sat: [0.55, 0.12], lit: [0.34, 0.10] },
        permafrostdragon: { variant: 'permafrostdragon', scale: 4.4, texturePool: 'water', bodyColor: 0xeaf4ff, wingColor: 0xc8e2f4, accent: 0xbdf0ff, hue: [0.55, 0.05], sat: [0.20, 0.10], lit: [0.74, 0.08] },
        stormdragonling:  { variant: 'stormdragonling', scale: 2.2, texturePool: 'thunder', bodyColor: 0x6a3aa0, wingColor: 0x4a2880, accent: 0xccaaff, hue: [0.76, 0.06], sat: [0.55, 0.12], lit: [0.42, 0.10] },
        thunderdragonling: { variant: 'thunderdragonling', scale: 2.4, texturePool: 'thunder', bodyColor: 0xe8c43a, wingColor: 0xc89a20, accent: 0xfff0a0, hue: [0.13, 0.04], sat: [0.75, 0.10], lit: [0.50, 0.10] },
        volcanicwyvern:   { variant: 'volcanicwyvern', scale: 3.8, texturePool: 'fire', bodyColor: 0x3a1610, wingColor: 0x281008, accent: 0xff6a12, hue: [0.04, 0.04], sat: [0.80, 0.10], lit: [0.22, 0.08] },
        youngmagmadrake:  { variant: 'youngmagmadrake', scale: 2.8, texturePool: 'fire', bodyColor: 0xd86a1a, wingColor: 0xb04e10, accent: 0xffb040, hue: [0.06, 0.03], sat: [0.80, 0.10], lit: [0.46, 0.10] },
        abyssalseadragon: { variant: 'abyssalseadragon', scale: 4.0, texturePool: 'water', bodyColor: 0x1e7a82, wingColor: 0x145a66, accent: 0x66f0d8, hue: [0.50, 0.06], sat: [0.60, 0.12], lit: [0.34, 0.10] },
        entropywyrm:      { variant: 'entropywyrm', scale: 4.2, texturePool: 'thunder', bodyColor: 0x2a103e, wingColor: 0x1a0a2a, accent: 0xc890ff, hue: [0.78, 0.06], sat: [0.65, 0.12], lit: [0.22, 0.08] },
        geodehydra:       { variant: 'geodehydra', scale: 4.0, texturePool: 'metal', bodyColor: 0x6a6478, wingColor: 0x4a4458, accent: 0xb070ff, hue: [0.74, 0.08], sat: [0.30, 0.12], lit: [0.40, 0.10] },
        mirehydra:        { variant: 'mirehydra', scale: 3.8, texturePool: 'green', bodyColor: 0x4a5a2a, wingColor: 0x344020, accent: 0x9aff5a, hue: [0.24, 0.08], sat: [0.50, 0.12], lit: [0.28, 0.10] },
        miredragon:       { variant: 'miredragon', scale: 3.9, texturePool: 'green', bodyColor: 0x52502a, wingColor: 0x3a3820, accent: 0x8aff66, hue: [0.20, 0.08], sat: [0.45, 0.12], lit: [0.28, 0.10] },
        skyserpent:       { variant: 'skyserpent', scale: 4.0, texturePool: 'thunder', bodyColor: 0x6aa8e0, wingColor: 0xcfe6ff, accent: 0xfff088, hue: [0.56, 0.06], sat: [0.45, 0.12], lit: [0.52, 0.10] },
        ancientdragonep:      { variant: 'ancientdragonep', scale: 4.8, texturePool: 'metal', bodyColor: 0x4a5240, wingColor: 0x303828, accent: 0x66e0ff, hue: [0.30, 0.06], sat: [0.25, 0.10], lit: [0.30, 0.08] },
        crimsonmagmadrake:    { variant: 'crimsonmagmadrake', scale: 3.9, texturePool: 'fire', bodyColor: 0x8a1212, wingColor: 0x5a0c0c, accent: 0xff7010, hue: [0.00, 0.03], sat: [0.85, 0.10], lit: [0.30, 0.10] },
        dragonofdeathnergal:  { variant: 'dragonofdeathnergal', scale: 4.4, texturePool: 'metal', bodyColor: 0x14140e, wingColor: 0x0c0c08, accent: 0x9aff5a, hue: [0.30, 0.06], sat: [0.55, 0.12], lit: [0.16, 0.06] },
        entropywyrmep:        { variant: 'entropywyrmep', scale: 4.6, texturePool: 'thunder', bodyColor: 0x1a0a30, wingColor: 0x100620, accent: 0xd8a0ff, hue: [0.78, 0.06], sat: [0.70, 0.12], lit: [0.20, 0.08] },
        celestialdragonanshar: { variant: 'celestialdragonanshar', scale: 4.6, texturePool: 'thunder', bodyColor: 0x161640, wingColor: 0x0c0c2a, accent: 0xfff0a0, hue: [0.66, 0.06], sat: [0.55, 0.12], lit: [0.26, 0.08] },
        primaloceandragonabzu: { variant: 'primaloceandragonabzu', scale: 4.5, texturePool: 'water', bodyColor: 0x103a6a, wingColor: 0x0a2a50, accent: 0x66f0ff, hue: [0.58, 0.06], sat: [0.65, 0.12], lit: [0.30, 0.10] },
        searingmagmawyrm: { variant: 'searingmagmawyrm', scale: 4.0, texturePool: 'fire', bodyColor: 0x241410, wingColor: 0x1a0e08, accent: 0xff6a10, hue: [0.04, 0.04], sat: [0.85, 0.10], lit: [0.16, 0.08] },
        // Level 1-5 roster: a squat three-headed hatchling still wearing its egg.
        lv_hydrahatchling: { variant: 'lv_hydrahatchling', scale: 2.0, texturePool: 'green', bodyColor: 0x7d8a4e, wingColor: 0x2e3a1e, accent: 0xffd23a, hue: [0.20, 0.06], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        dragonofwisdomenki: { variant: 'dragonofwisdomenki', scale: 4.6, texturePool: 'water', bodyColor: 0x18306a, wingColor: 0x122550, accent: 0xf0c850, hue: [0.62, 0.05], sat: [0.60, 0.12], lit: [0.30, 0.10] }
    };

    class DraconicBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = DR_PROFILES[creatureType] || DR_PROFILES.dragon;
            super(scale, offsetY, battler, profile, 0, creatureType || 'dragon');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._wings = [];
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'hydra':     this._buildHydra(); break;
                case 'phoenix':   this._buildPhoenix(); break;
                case 'manticore': this._buildManticore(); break;
                case 'firedragonling':  this._buildFireDragonling(); break;
                case 'frostdragon':     this._buildFrostDragon(); break;
                case 'icedragonling':   this._buildIceDragonling(); break;
                case 'juvenileicewyrm': this._buildJuvenileIceWyrm(); break;
                case 'mercurydragon':   this._buildMercuryDragon(); break;
                case 'moltendragon':    this._buildMoltenDragon(); break;
                case 'multiheadedhydra': this._buildMultiHeadedHydra(); break;
                case 'permafrostdragon': this._buildPermafrostDragon(); break;
                case 'stormdragonling':  this._buildStormDragonling(); break;
                case 'thunderdragonling': this._buildThunderDragonling(); break;
                case 'volcanicwyvern':   this._buildVolcanicWyvern(); break;
                case 'youngmagmadrake':  this._buildYoungMagmaDrake(); break;
                case 'abyssalseadragon': this._buildAbyssalSeaDragon(); break;
                case 'entropywyrm':      this._buildEntropyWyrm(); break;
                case 'geodehydra':       this._buildGeodeHydra(); break;
                case 'mirehydra':        this._buildMireHydra(); break;
                case 'miredragon':       this._buildMireDragon(); break;
                case 'skyserpent':       this._buildSkySerpent(); break;
                case 'ancientdragonep':       this._buildAncientDragonEp(); break;
                case 'crimsonmagmadrake':     this._buildCrimsonMagmaDrake(); break;
                case 'dragonofdeathnergal':   this._buildDragonOfDeathNergal(); break;
                case 'entropywyrmep':         this._buildEntropyWyrmEp(); break;
                case 'celestialdragonanshar': this._buildCelestialDragonAnshar(); break;
                case 'primaloceandragonabzu': this._buildPrimalOceanDragonAbzu(); break;
                case 'searingmagmawyrm':      this._buildSearingMagmaWyrm(); break;
                case 'dragonofwisdomenki':    this._buildDragonOfWisdomEnki(); break;
                case 'lv_hydrahatchling':     this._buildHydraHatchling(); break;
                default:          this._buildDragon(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough), side: THREE.DoubleSide,
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            eye.position.set(x, y, z); parent.add(eye); return eye;
        }
        // A wing spreads outward from its own shoulder. The shared builder fans
        // its fingers toward -side, which crossed every wing over the back to
        // the far flank (and flapped it down through the body), so a wing that
        // comes back crossed is rebuilt from the other hand and keeps its side.
        _wing(mat, side, x, y, z) {
            let g = this.buildDragonWing(mat, side, x, y, z);
            const tips = g._wingTips || [];
            const far = tips[tips.length - 1];
            if (far && far.x * side < 0) {
                this.bodyGroup.remove(g);
                const i = this._wings.indexOf(g); if (i >= 0) this._wings.splice(i, 1);
                g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
                g = this.buildDragonWing(mat, -side, x, y, z);
                g._side = side;
            }
            return g;
        }
        // A point on a wing's membrane, a fraction `u` of the way from the
        // shoulder to finger `k`'s tip, so wing decor rides on the skin and
        // flaps with it instead of hanging in the air beside it.
        _wingPoint(w, k, u) {
            const tips = w._wingTips || [];
            const t = tips[Math.min(k, tips.length - 1)];
            return t ? new THREE.Vector3(t.x * u, t.y * u, 0.03) : new THREE.Vector3(0, 0, 0.03);
        }
        // An extra bone laid along finger `k`, knuckle to tip (the default
        // wing's knuckle stands 0.48 up the arm), so ribs follow the struts.
        _wingRib(w, mat, k, r) {
            const tips = w._wingTips || [];
            const t = tips[Math.min(k, tips.length - 1)];
            if (t) this.addStrut(w, mat, new THREE.Vector3(0, 0.48, 0.03), new THREE.Vector3(t.x, t.y, 0.03), r, r * 0.6);
        }
        _limb(mat, x, y, z, len) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, len, 8), mat);
            upper.position.y = -len * 0.4; g.add(upper);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.3), mat);
            foot.position.set(0, -len * 0.85, 0.08); g.add(foot);
            g.position.set(x, y, z);
            this.bodyGroup.add(g);
            return g;
        }
        _neckHead(mat, baseX, baseY, baseZ, accent, curl) {
            const g = new THREE.Group();
            let py = 0, pz = 0, pr = 0.2, prevPt = new THREE.Vector3(0, 0, 0);
            for (let i = 0; i < 4; i++) {
                const r = 0.2 - i * 0.02;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
                seg.position.set(0, py, pz); g.add(seg);
                const pt = new THREE.Vector3(0, py, pz);
                if (i > 0) this.addStrut(g, mat, prevPt, pt, pr * 0.85, r * 0.85);
                prevPt = pt; pr = r;
                py += 0.26; pz += curl * 0.06 * i;
            }
            const head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat); sk.scale.set(1, 0.9, 1.4); head.add(sk);
            this._eye(head, -0.11, 0.07, 0.2, 0.05, accent);
            this._eye(head, 0.11, 0.07, 0.2, 0.05, accent);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.3), this._mat(0x2a0a0a, 1.0, 0.6));
            jaw.position.set(0, -0.12, 0.18); head.add(jaw);
            head.position.set(0, py + 0.1, pz + 0.18); head.rotation.x = 0.3;
            g.add(head);
            this.addStrut(g, mat, prevPt, head.position, pr * 0.85, 0.18);
            g._head = head;
            g.position.set(baseX, baseY, baseZ);
            this.bodyGroup.add(g);
            return g;
        }

        // ── Dragon ───────────────────────────────────────────────────────────
        _buildDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.55);
            const wingMat = this._mat(p.wingColor, 0.92, 0.7);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), mat);
            this.body.position.set(0, 1.2, 0); this.body.scale.set(1.0, 0.9, 1.6);
            this.bodyGroup.add(this.body);
            this.neck = this._neckHead(mat, 0, 1.4, 0.7, p.accent, 1);
            this.head = this.neck._head;
            // Fire-breath organ: a glow in the throat.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), this._mat(p.accent, 0.9, 0.3, p.accent));
            this.fireOrgan.position.set(0, 1.55, 0.6); this.bodyGroup.add(this.fireOrgan);
            this.lWing = this._wing(wingMat, -1, -0.3, 1.6, -0.1);
            this.rWing = this._wing(wingMat, 1, 0.3, 1.6, -0.1);
            this.leftLeg = this._limb(mat, -0.4, 0.95, 0.2, 0.8);
            this.rightLeg = this._limb(mat, 0.4, 0.95, 0.2, 0.8);
            this.tail = this._tail(mat, 1);

            this._partMeshMap = { BODY: this.body, NECK: this.neck, HEAD: this.head, FIRE_BREATH_ORGAN: this.fireOrgan, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.neck, this.fireOrgan, this.lWing, this.rWing, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['NECK'], hide: [this.neck] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FIRE_BREATH_ORGAN'], hide: [this.fireOrgan] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _tail(mat, dir) {
            const g = new THREE.Group();
            let py = 1.2, pz = -0.7, pr = 0.22, prevPt = new THREE.Vector3(0, py, pz);
            for (let i = 0; i < 5; i++) {
                const r = 0.22 - i * 0.035;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
                seg.position.set(0, py, pz); g.add(seg);
                const pt = new THREE.Vector3(0, py, pz);
                if (i > 0) this.addStrut(g, mat, prevPt, pt, pr * 0.85, r * 0.85);
                prevPt = pt; pr = r;
                pz -= 0.3; py -= 0.05 * i;
            }
            this.bodyGroup.add(g); return g;
        }

        // ── Hydra: three serpentine heads on one body ─────────────────────────
        _buildHydra() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.55);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), mat);
            this.body.position.set(0, 1.0, 0); this.body.scale.set(1.2, 0.9, 1.2);
            this.bodyGroup.add(this.body);
            this.head1 = this._neckHead(mat, -0.35, 1.3, 0.3, p.accent, 1);
            this.head2 = this._neckHead(mat, 0.0, 1.4, 0.45, p.accent, 0);
            this.head3 = this._neckHead(mat, 0.35, 1.3, 0.3, p.accent, -1);
            this.tail = this._tail(mat, 1);
            this._partMeshMap = { BODY: this.body, HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail] },
                { gone: ['HEAD_ONE'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Phoenix: fiery bird with a glowing core ───────────────────────────
        _buildPhoenix() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            const featherMat = this._mat(p.wingColor, 0.95, 0.6, p.accent);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), mat);
            this.body.position.set(0, 1.1, 0); this.body.scale.set(1, 1.3, 1);
            this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(p.accent, 0.95, 0.2, p.accent));
            this.core.position.set(0, 1.1, 0); this.bodyGroup.add(this.core);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), mat); this.head.add(h);
            this.lEye = this._eye(this.head, -0.1, 0.05, 0.18, 0.05, p.accent);
            this.rEye = this._eye(this.head, 0.1, 0.05, 0.18, 0.05, p.accent);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), this._mat(0xe8a23a, 1.0, 0.5));
            this.beak.position.set(0, -0.02, 0.26); this.beak.rotation.x = Math.PI / 2; this.head.add(this.beak);
            this.head.position.set(0, 1.55, 0.1); this.bodyGroup.add(this.head);
            // Tail feathers plume.
            this.feathers = new THREE.Group();
            for (let i = -2; i <= 2; i++) {
                const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 4), featherMat);
                f.position.set(i * 0.12, 0.7, -0.4); f.rotation.x = -2.4 + i * 0.05; f.scale.set(1, 1, 0.2);
                this.feathers.add(f);
            }
            this.bodyGroup.add(this.feathers);
            this.lWing = this._wing(featherMat, -1, -0.25, 1.2, 0);
            this.rWing = this._wing(featherMat, 1, 0.25, 1.2, 0);
            this.talons = new THREE.Group();
            for (const tx of [-0.14, 0.14]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 5), this._mat(0xc8902a, 1.0, 0.6)); t.position.set(tx, 0.78, 0.05); t.rotation.x = Math.PI; this.talons.add(t); }
            this.bodyGroup.add(this.talons);

            this._partMeshMap = { CORE: this.core, FEATHERS: this.feathers, BEAK: this.beak, TALONS: this.talons, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, LEFT_EYE: this.lEye, RIGHT_EYE: this.rEye };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.body, this.head, this.feathers, this.lWing, this.rWing, this.talons] },
                { gone: ['FEATHERS'], hide: [this.feathers] },
                { gone: ['BEAK'], hide: [this.beak] },
                { gone: ['TALONS'], hide: [this.talons] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_EYE'], hide: [this.lEye] },
                { gone: ['RIGHT_EYE'], hide: [this.rEye] },
            ];
        }

        // ── Manticore: winged lion ────────────────────────────────────────────
        _buildManticore() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            const wingMat = this._mat(p.wingColor, 0.92, 0.7);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 12), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.0, 0);
            this.bodyGroup.add(this.body);
            // Lion head with a mane.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), mat); this.head.add(sk);
            const mane = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), this._mat(0x5a3418, 1.0, 0.9)); mane.position.z = -0.1; mane.scale.set(1.1, 1.1, 0.8); this.head.add(mane);
            this.lEye = this._eye(this.head, -0.13, 0.06, 0.28, 0.06, p.accent);
            this.rEye = this._eye(this.head, 0.13, 0.06, 0.28, 0.06, p.accent);
            this.head.position.set(0, 1.2, 0.75); this.bodyGroup.add(this.head);
            this.flPaw = this._limb(mat, -0.3, 0.95, 0.5, 0.8);
            this.frPaw = this._limb(mat, 0.3, 0.95, 0.5, 0.8);
            this.rlLeg = this._limb(mat, -0.3, 0.95, -0.5, 0.8);
            this.rrLeg = this._limb(mat, 0.3, 0.95, -0.5, 0.8);
            this.lWing = this._wing(wingMat, -1, -0.3, 1.4, -0.1);
            this.rWing = this._wing(wingMat, 1, 0.3, 1.4, -0.1);
            // Scorpion-like tail.
            this.tail = this._tail(mat, 1);
            const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), this._mat(p.accent, 1.0, 0.4, p.accent));
            stinger.position.set(0, 1.1, -2.0); stinger.rotation.x = -1.0; this.tail.add(stinger);

            this._partMeshMap = {
                SKULL: this.head, BRAIN: this.head, SPINE: this.body, RIBCAGE: this.body,
                FRONT_LEFT_PAW: this.flPaw, FRONT_RIGHT_PAW: this.frPaw, REAR_LEFT_LEG: this.rlLeg, REAR_RIGHT_LEG: this.rrLeg,
                LEFT_WING: this.lWing, RIGHT_WING: this.rWing, LEFT_EYE: this.lEye, RIGHT_EYE: this.rEye
            };
            this._cascadeRules = [
                { gone: ['SPINE', 'RIBCAGE'], hide: [this.body, this.head, this.flPaw, this.frPaw, this.rlLeg, this.rrLeg, this.lWing, this.rWing, this.tail] },
                { gone: ['SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['FRONT_LEFT_PAW'], hide: [this.flPaw] },
                { gone: ['FRONT_RIGHT_PAW'], hide: [this.frPaw] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rlLeg] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rrLeg] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_EYE'], hide: [this.lEye] },
                { gone: ['RIGHT_EYE'], hide: [this.rEye] },
            ];
        }

        // Shared rig wiring for the dragon body plan (HEAD/NECK/BODY/wings/legs/tail + fire organ).
        _wireDragonRig() {
            this._partMeshMap = { BODY: this.body, NECK: this.neck, HEAD: this.head, FIRE_BREATH_ORGAN: this.fireOrgan, LEFT_WING: this.lWing, RIGHT_WING: this.rWing, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.neck, this.fireOrgan, this.lWing, this.rWing, this.leftLeg, this.rightLeg, this.tail] },
                { gone: ['NECK'], hide: [this.neck] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['FIRE_BREATH_ORGAN'], hide: [this.fireOrgan] },
                { gone: ['LEFT_WING'], hide: [this.lWing] },
                { gone: ['RIGHT_WING'], hide: [this.rWing] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Fire Dragonling: tiny chubby red hatchling wreathed in embers ──────
        _buildFireDragonling() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            const wingMat = this._mat(p.wingColor, 0.9, 0.6, p.accent);
            // Pudgy round hatchling belly.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), mat);
            this.body.position.set(0, 0.9, 0); this.body.scale.set(1.1, 1.05, 1.15);
            this.bodyGroup.add(this.body);
            // Stubby short neck.
            this.neck = new THREE.Group();
            const nseg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 10), mat);
            nseg.position.y = 0.15; this.neck.add(nseg);
            this.neck.position.set(0, 1.35, 0.25); this.bodyGroup.add(this.neck);
            // Big-eyed cute head with oversized snout.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), mat); sk.scale.set(1, 0.95, 1.05); this.head.add(sk);
            this._eye(this.head, -0.15, 0.08, 0.26, 0.09, p.accent);
            this._eye(this.head, 0.15, 0.08, 0.26, 0.09, p.accent);
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mat); snout.position.set(0, -0.1, 0.32); snout.scale.set(1, 0.8, 1.3); this.head.add(snout);
            // Two tiny nub horns.
            for (const hx of [-0.12, 0.12]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), this._mat(0xffcf80, 1.0, 0.4)); horn.position.set(hx, 0.32, -0.05); this.head.add(horn); }
            this.head.position.set(0, 1.7, 0.4); this.bodyGroup.add(this.head);
            // Flame spurt at the mouth.
            this.fireOrgan = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), this._mat(p.accent, 0.85, 0.2, p.accent));
            this.fireOrgan.position.set(0, 1.6, 0.85); this.fireOrgan.rotation.x = Math.PI / 2; this.bodyGroup.add(this.fireOrgan);
            // Ember-flecked small wings.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.1, -0.05);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.1, -0.05);
            // Tiny stubby legs.
            this.leftLeg = this._limb(mat, -0.32, 0.55, 0.15, 0.45);
            this.rightLeg = this._limb(mat, 0.32, 0.55, 0.15, 0.45);
            // Short curly tail.
            this.tail = new THREE.Group();
            let ty = 0.9, tz = -0.5, tr = 0.17, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 4; i++) { const r = 0.17 - i * 0.03; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.22; ty -= 0.06 * i; }
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), this._mat(p.accent, 0.9, 0.3, p.accent)); tip.position.set(0, ty, tz - 0.1); tip.rotation.x = -Math.PI / 2; this.tail.add(tip);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Frost Dragon: colossal glacial dragon with frost-rimed scales ─────
        _buildFrostDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.35);
            const wingMat = this._mat(p.wingColor, 0.85, 0.45, p.accent);
            const riceMat = this._mat(p.accent, 1.0, 0.2, p.accent); // frost crystals
            // Long massive torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 1.4, 8, 16), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.3, -0.1);
            this.bodyGroup.add(this.body);
            // Jagged ice spines along the back.
            for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45 - i * 0.04, 5), riceMat); sp.position.set(0, 1.85, 0.6 - i * 0.35); this.body.parent && this.bodyGroup.add(sp); }
            // Long neck.
            this.neck = this._neckHead(mat, 0, 1.6, 0.8, p.accent, 1);
            this.head = this.neck._head;
            // Crown of frost horns on the head.
            for (const hx of [-0.18, 0.18]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), riceMat); horn.position.set(hx, 0.3, -0.1); horn.rotation.x = -0.4; this.head.add(horn); }
            // Frost-breath organ (cold mist glow).
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(p.accent, 0.8, 0.15, p.accent));
            this.fireOrgan.position.set(0, 1.9, 0.9); this.bodyGroup.add(this.fireOrgan);
            // Huge wings.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.9, -0.1);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.9, -0.1);
            this.lWing.scale.setScalar(1.5); this.rWing.scale.setScalar(1.5);
            // Sturdy legs.
            this.leftLeg = this._limb(mat, -0.5, 1.0, 0.2, 1.0);
            this.rightLeg = this._limb(mat, 0.5, 1.0, 0.2, 1.0);
            // Long sweeping tail with ice-shard tip.
            this.tail = this._tail(mat, 1);
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 5), riceMat); ttip.position.set(0, 1.0, -2.3); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this._wireDragonRig();
        }

        // ── Ice Dragonling: small icy hatchling exhaling crystalline shards ───
        _buildIceDragonling() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            const wingMat = this._mat(p.wingColor, 0.85, 0.4, p.accent);
            const crysMat = this._mat(p.accent, 0.95, 0.2, p.accent);
            // Slim small body (octahedron-faceted, crystalline read).
            this.body = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 1), mat);
            this.body.position.set(0, 0.95, 0); this.body.scale.set(0.9, 0.85, 1.2);
            this.bodyGroup.add(this.body);
            // Short neck.
            this.neck = new THREE.Group();
            const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.4, 8), mat); ns.position.y = 0.2; this.neck.add(ns);
            this.neck.position.set(0, 1.3, 0.3); this.bodyGroup.add(this.neck);
            // Angular faceted head.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), mat); sk.scale.set(1, 0.9, 1.3); this.head.add(sk);
            this._eye(this.head, -0.13, 0.05, 0.22, 0.07, p.accent);
            this._eye(this.head, 0.13, 0.05, 0.22, 0.07, p.accent);
            const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), crysMat); horn.position.set(0, 0.25, -0.05); this.head.add(horn);
            this.head.position.set(0, 1.7, 0.45); this.bodyGroup.add(this.head);
            // Crystalline shard breath (cluster of small crystals).
            this.fireOrgan = new THREE.Group();
            for (let i = 0; i < 4; i++) { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 4), crysMat); sh.position.set((this.idRand() - 0.5) * 0.2, (this.idRand() - 0.5) * 0.15, 0.1 + i * 0.06); sh.rotation.x = Math.PI / 2; this.fireOrgan.add(sh); }
            this.fireOrgan.position.set(0, 1.62, 0.8); this.bodyGroup.add(this.fireOrgan);
            // Small thin wings.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.15, -0.05);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.15, -0.05);
            // Slim legs.
            this.leftLeg = this._limb(mat, -0.3, 0.6, 0.15, 0.5);
            this.rightLeg = this._limb(mat, 0.3, 0.6, 0.15, 0.5);
            // Short tail with crystal tip.
            this.tail = new THREE.Group();
            let ty = 0.95, tz = -0.55, tr = 0.15, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 4; i++) { const r = 0.15 - i * 0.025; const seg = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.8, r * 0.8); tPrev = pt; tr = r; tz -= 0.24; }
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), crysMat); ttip.position.set(0, ty, tz - 0.1); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Juvenile Ice Wyrm: long serpentine wingless-ish icy body ──────────
        _buildJuvenileIceWyrm() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.45);
            const finMat = this._mat(p.wingColor, 0.7, 0.4, p.accent);
            const crysMat = this._mat(p.accent, 0.95, 0.2, p.accent);
            // Long serpentine body built from a chain of segments arching upright.
            this.body = new THREE.Group();
            let sy = 0.6, sz = -0.7, sr = 0.38, sPrev = new THREE.Vector3(0, sy, sz);
            for (let i = 0; i < 8; i++) {
                const r = Math.max(0.16, 0.38 - Math.abs(i - 2) * 0.02);
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
                seg.position.set(0, sy, sz); this.body.add(seg);
                const pt = new THREE.Vector3(0, sy, sz);
                if (i > 0) this.addStrut(this.body, mat, sPrev, pt, sr * 0.85, r * 0.85);
                sPrev = pt; sr = r;
                sy += (i < 4 ? 0.18 : -0.02); sz += 0.22;
            }
            this.bodyGroup.add(this.body);
            // Neck = top of the serpentine arch.
            this.neck = new THREE.Group();
            const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8), mat); nk.position.y = 0.25; nk.rotation.x = 0.5; this.neck.add(nk);
            this.neck.position.set(0, sy + 0.1, sz - 0.1); this.bodyGroup.add(this.neck);
            // Sleek serpent head.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat); sk.scale.set(0.9, 0.8, 1.6); this.head.add(sk);
            this._eye(this.head, -0.1, 0.08, 0.25, 0.06, p.accent);
            this._eye(this.head, 0.1, 0.08, 0.25, 0.06, p.accent);
            const frill = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 6), finMat); frill.position.set(0, 0.1, -0.15); frill.scale.set(1, 1, 0.2); this.head.add(frill);
            this.head.position.set(0, sy + 0.5, sz + 0.35); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // Frost breath.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), this._mat(p.accent, 0.8, 0.15, p.accent));
            this.fireOrgan.position.set(0, sy + 0.45, sz + 0.85); this.bodyGroup.add(this.fireOrgan);
            // Vestigial finlike "wings" (small membrane fins on the sides).
            this.lWing = this._wing(finMat, -1, -0.3, 1.0, -0.2); this.lWing.scale.setScalar(0.6);
            this.rWing = this._wing(finMat, 1, 0.3, 1.0, -0.2); this.rWing.scale.setScalar(0.6);
            // Tiny clawed forelimbs (legs).
            this.leftLeg = this._limb(mat, -0.28, 0.5, 0.0, 0.4);
            this.rightLeg = this._limb(mat, 0.28, 0.5, 0.0, 0.4);
            // Tapering tail off the base of the body.
            this.tail = new THREE.Group();
            let ty = 0.55, tz = -0.85, tr = 0.2, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.2 - i * 0.03; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.26; ty -= 0.02; }
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), crysMat); ttip.position.set(0, ty, tz - 0.12); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Mercury Dragon: liquid-metal chrome dragon with reflective sheen ──
        _buildMercuryDragon() {
            const p = this.profile;
            const mat = this._mat(p.bodyColor, 1.0, 0.05); mat.metalness = 1.0; this.applySkin(mat);
            const wingMat = this._mat(p.wingColor, 0.9, 0.1); wingMat.metalness = 1.0;
            // Smooth blobby liquid-metal torso.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 16), mat);
            this.body.position.set(0, 1.2, 0); this.body.scale.set(1.0, 0.95, 1.5);
            this.bodyGroup.add(this.body);
            // Droplet bulges to read as flowing mercury.
            for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.2 - i * 0.03, 12, 12), mat); d.position.set((this.idRand() - 0.5) * 0.6, 1.2 + (this.idRand() - 0.5) * 0.4, (this.idRand() - 0.5) * 0.8); this.bodyGroup.add(d); }
            // Sleek chrome neck/head.
            this.neck = this._neckHead(mat, 0, 1.45, 0.7, p.accent, 1);
            this.head = this.neck._head;
            // Liquid teardrop crest.
            const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), mat); crest.position.set(0, 0.3, -0.1); crest.rotation.x = -0.5; this.head.add(crest);
            // Glowing molten-metal breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(p.accent, 0.95, 0.1, p.accent));
            this.fireOrgan.position.set(0, 1.6, 0.6); this.bodyGroup.add(this.fireOrgan);
            // Big mirror wings.
            this.lWing = this._wing(wingMat, -1, -0.35, 1.7, -0.1); this.lWing.scale.setScalar(1.25);
            this.rWing = this._wing(wingMat, 1, 0.35, 1.7, -0.1); this.rWing.scale.setScalar(1.25);
            // Legs.
            this.leftLeg = this._limb(mat, -0.42, 0.95, 0.2, 0.85);
            this.rightLeg = this._limb(mat, 0.42, 0.95, 0.2, 0.85);
            // Tail that thins into a sharp liquid point.
            this.tail = this._tail(mat, 1);
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 8), mat); ttip.position.set(0, 1.15, -2.1); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this._wireDragonRig();
        }

        // ── Molten Dragon: deformed black-scaled dragon dripping magma ────────
        _buildMoltenDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.85);
            const wingMat = this._mat(p.wingColor, 0.85, 0.85);
            const lavaMat = this._mat(p.accent, 1.0, 0.4, p.accent);
            // Lumpy, deformed asymmetric torso.
            this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 1), mat);
            this.body.position.set(0, 1.2, 0); this.body.scale.set(1.05, 0.9, 1.5);
            this.bodyGroup.add(this.body);
            // Glowing magma cracks (lava veins poking from the body).
            for (let i = 0; i < 5; i++) { const crack = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), lavaMat); crack.position.set((this.idRand() - 0.5) * 0.9, 1.2 + (this.idRand() - 0.5) * 0.6, (this.idRand() - 0.5) * 1.1); crack.scale.set(1.4, 0.5, 1.4); this.bodyGroup.add(crack); }
            // Twisted neck/head.
            this.neck = this._neckHead(mat, 0.08, 1.45, 0.7, p.accent, 1.4);
            this.head = this.neck._head;
            // Jagged broken horns (uneven).
            const horn1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 5), mat); horn1.position.set(-0.14, 0.28, -0.05); horn1.rotation.z = 0.3; this.head.add(horn1);
            const horn2 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), mat); horn2.position.set(0.16, 0.24, -0.05); horn2.rotation.z = -0.6; this.head.add(horn2);
            // Molten breath organ glowing in the throat.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.95, 0.3, p.accent));
            this.fireOrgan.position.set(0.08, 1.6, 0.6); this.bodyGroup.add(this.fireOrgan);
            // Ragged, holed wings.
            this.lWing = this._wing(wingMat, -1, -0.35, 1.7, -0.1);
            this.rWing = this._wing(wingMat, 1, 0.32, 1.6, -0.15);
            // Heavy uneven legs.
            this.leftLeg = this._limb(mat, -0.45, 0.95, 0.2, 0.95);
            this.rightLeg = this._limb(mat, 0.42, 0.9, 0.15, 0.8);
            // Lava-dripping tail.
            this.tail = this._tail(mat, 1);
            const drip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lavaMat); drip.position.set(0, 1.0, -2.0); drip.scale.set(1, 1.6, 1); this.tail.add(drip);
            this._wireDragonRig();
        }

        // ── Multi-Headed Hydra: bulky body, 3 heads on long serpentine necks ──
        _buildMultiHeadedHydra() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            // Long serpentine neck builder (taller than _neckHead) reused for 3 heads.
            const longNeck = (bx, by, bz, lean) => {
                const g = new THREE.Group();
                let py = 0, pz = 0, pr = 0.22, prevPt = new THREE.Vector3(0, 0, 0);
                for (let i = 0; i < 7; i++) {
                    const r = 0.22 - i * 0.018;
                    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
                    seg.position.set(lean * 0.05 * i, py, pz); g.add(seg);
                    const pt = new THREE.Vector3(lean * 0.05 * i, py, pz);
                    if (i > 0) this.addStrut(g, mat, prevPt, pt, pr * 0.85, r * 0.85);
                    prevPt = pt; pr = r;
                    py += 0.3; pz += 0.04 * i;
                }
                const head = new THREE.Group();
                const sk = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat); sk.scale.set(0.9, 0.85, 1.7); head.add(sk);
                this._eye(head, -0.1, 0.07, 0.28, 0.05, p.accent);
                this._eye(head, 0.1, 0.07, 0.28, 0.05, p.accent);
                const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.3), this._mat(0x0a2a0a, 1.0, 0.6));
                jaw.position.set(0, -0.11, 0.22); head.add(jaw);
                const frill = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 6), this._mat(p.accent, 0.85, 0.4, p.accent));
                frill.position.set(0, 0.1, -0.18); frill.scale.set(1, 1, 0.18); head.add(frill);
                head.position.set(lean * 0.35, py + 0.1, pz + 0.2); head.rotation.x = 0.35;
                g.add(head);
                this.addStrut(g, mat, prevPt, head.position, pr * 0.85, 0.2);
                g._head = head;
                g.position.set(bx, by, bz); g.rotation.z = lean * 0.12;
                this.bodyGroup.add(g);
                return g;
            };
            // Bulky low slung body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 14), mat);
            this.body.position.set(0, 1.0, -0.1); this.body.scale.set(1.4, 1.0, 1.5);
            this.bodyGroup.add(this.body);
            // Stumpy support legs (visual only, part of body cascade).
            for (const lx of [-0.55, 0.55]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.7, 8), mat); leg.position.set(lx, 0.45, 0.15); this.body.add(leg); }
            this.head1 = longNeck(-0.42, 1.5, 0.4, -1);
            this.head2 = longNeck(0.0, 1.6, 0.5, 0);
            this.head3 = longNeck(0.42, 1.5, 0.4, 1);
            // Thick muscular tail.
            this.tail = new THREE.Group();
            let ty = 0.9, tz = -0.9, tr = 0.3, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.3 - i * 0.04; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.32; ty -= 0.05 * i; }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { BODY: this.body, HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail] },
                { gone: ['HEAD_ONE'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Permafrost Dragon: white dragon caked in jagged icicle spikes ─────
        _buildPermafrostDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.3);
            const wingMat = this._mat(p.wingColor, 0.8, 0.35, p.accent);
            const iceMat = this._mat(p.accent, 0.95, 0.1, p.accent);
            // Broad frosted torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.3, 8, 16), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.3, -0.1);
            this.bodyGroup.add(this.body);
            // Rows of jagged icicle spikes along the back (large -> small).
            for (let i = 0; i < 7; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55 - i * 0.05, 4), iceMat); sp.position.set((i % 2 ? 0.07 : -0.07), 1.85 - i * 0.02, 0.7 - i * 0.28); sp.rotation.z = (i % 2 ? 0.2 : -0.2); this.bodyGroup.add(sp); }
            // Long neck/head.
            this.neck = this._neckHead(mat, 0, 1.55, 0.75, p.accent, 1);
            this.head = this.neck._head;
            // Icicle crown horns.
            for (const hx of [-0.16, 0.0, 0.16]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 4), iceMat); horn.position.set(hx, 0.32, -0.05); horn.rotation.x = -0.3; this.head.add(horn); }
            // Frost-breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.8, 0.1, p.accent));
            this.fireOrgan.position.set(0, 1.85, 0.9); this.bodyGroup.add(this.fireOrgan);
            // Big wings studded with ice spikes along the leading edge.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.8, -0.1); this.lWing.scale.setScalar(1.4);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.8, -0.1); this.rWing.scale.setScalar(1.4);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 3; i++) { const tip = this._wingPoint(w, i, 1.0); const spk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), iceMat); spk.position.copy(tip); spk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(new THREE.Vector3(0, 0.48, 0.03)).normalize()); spk.translateY(0.1); w.add(spk); } }
            // Sturdy legs.
            this.leftLeg = this._limb(mat, -0.48, 1.0, 0.2, 0.95);
            this.rightLeg = this._limb(mat, 0.48, 1.0, 0.2, 0.95);
            // Icicle-tipped tail.
            this.tail = this._tail(mat, 1);
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 4), iceMat); ttip.position.set(0, 1.0, -2.3); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this._wireDragonRig();
        }

        // ── Storm Dragonling: small purple dragon crackling with electric arcs ─
        _buildStormDragonling() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.45);
            const wingMat = this._mat(p.wingColor, 0.85, 0.4, p.accent);
            const arcMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            // Lean little body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 12), mat);
            this.body.position.set(0, 0.95, 0); this.body.scale.set(0.95, 1.0, 1.25);
            this.bodyGroup.add(this.body);
            // Zig-zag lightning bolts arcing off the body.
            for (let i = 0; i < 4; i++) {
                const bolt = new THREE.Group();
                let by = 0; let bz = 0;
                for (let s = 0; s < 3; s++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), arcMat); seg.position.set((s % 2 ? 0.06 : -0.06), by, bz); seg.rotation.z = (s % 2 ? 0.5 : -0.5); bolt.add(seg); by += 0.16; }
                const a = (i / 4) * Math.PI * 2;
                bolt.position.set(Math.cos(a) * 0.55, 0.95, Math.sin(a) * 0.5); this.bodyGroup.add(bolt);
            }
            // Short neck.
            this.neck = new THREE.Group();
            const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.4, 8), mat); ns.position.y = 0.2; this.neck.add(ns);
            this.neck.position.set(0, 1.3, 0.3); this.bodyGroup.add(this.neck);
            // Sharp angular head with swept-back lightning horns.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat); sk.scale.set(0.95, 0.9, 1.3); this.head.add(sk);
            this._eye(this.head, -0.12, 0.06, 0.22, 0.07, p.accent);
            this._eye(this.head, 0.12, 0.06, 0.22, 0.07, p.accent);
            for (const hx of [-0.13, 0.13]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.4, 4), arcMat); horn.position.set(hx, 0.22, -0.12); horn.rotation.x = -0.8; this.head.add(horn); }
            this.head.position.set(0, 1.68, 0.45); this.bodyGroup.add(this.head);
            // Crackling spark breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), this._mat(p.accent, 0.9, 0.1, p.accent));
            this.fireOrgan.position.set(0, 1.6, 0.78); this.bodyGroup.add(this.fireOrgan);
            // Small thin wings.
            this.lWing = this._wing(wingMat, -1, -0.38, 1.1, -0.05);
            this.rWing = this._wing(wingMat, 1, 0.38, 1.1, -0.05);
            // Slim legs.
            this.leftLeg = this._limb(mat, -0.3, 0.6, 0.15, 0.5);
            this.rightLeg = this._limb(mat, 0.3, 0.6, 0.15, 0.5);
            // Forked lightning-bolt tail.
            this.tail = new THREE.Group();
            let ty = 0.9, tz = -0.5, tr = 0.14, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 3; i++) { const r = 0.14 - i * 0.025; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.22; }
            const fork = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 4), arcMat); fork.position.set(0, ty, tz - 0.1); fork.rotation.x = -Math.PI / 2; this.tail.add(fork);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Thunder Dragonling: squat yellow drake, huge resonating throat sac ─
        _buildThunderDragonling() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            const wingMat = this._mat(p.wingColor, 0.85, 0.45, p.accent);
            const sacMat = this._mat(p.accent, 0.7, 0.2, p.accent);
            // Squat wide body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), mat);
            this.body.position.set(0, 0.85, 0); this.body.scale.set(1.3, 0.85, 1.1);
            this.bodyGroup.add(this.body);
            // Thick short neck.
            this.neck = new THREE.Group();
            const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.3, 10), mat); ns.position.y = 0.15; this.neck.add(ns);
            this.neck.position.set(0, 1.15, 0.35); this.bodyGroup.add(this.neck);
            // Big wide head.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat); sk.scale.set(1.2, 0.85, 1.0); this.head.add(sk);
            this._eye(this.head, -0.17, 0.1, 0.24, 0.08, p.accent);
            this._eye(this.head, 0.17, 0.1, 0.24, 0.08, p.accent);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), this._mat(0x4a3a08, 1.0, 0.6)); jaw.position.set(0, -0.18, 0.16); this.head.add(jaw);
            this.head.position.set(0, 1.5, 0.5); this.bodyGroup.add(this.head);
            // Oversized resonating throat sac (the fire-breath organ).
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), sacMat);
            this.fireOrgan.position.set(0, 1.2, 0.6); this.fireOrgan.scale.set(1.1, 0.95, 1.0); this.bodyGroup.add(this.fireOrgan);
            // Concentric sonic ring around the throat.
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 16), this._mat(p.accent, 0.6, 0.2, p.accent)); ring.position.set(0, 0, 0.05); this.fireOrgan.add(ring);
            // Short stubby wings.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.0, -0.05); this.lWing.scale.setScalar(0.7);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.0, -0.05); this.rWing.scale.setScalar(0.7);
            // Thick short legs.
            this.leftLeg = this._limb(mat, -0.4, 0.5, 0.15, 0.45);
            this.rightLeg = this._limb(mat, 0.4, 0.5, 0.15, 0.45);
            // Short fat tail.
            this.tail = new THREE.Group();
            let ty = 0.78, tz = -0.55, tr = 0.22, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 4; i++) { const r = 0.22 - i * 0.04; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.24; }
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Volcanic Wyvern: bipedal wyvern, magma-forged plates, big wings ───
        _buildVolcanicWyvern() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.7);
            const wingMat = this._mat(p.wingColor, 0.88, 0.6, p.accent);
            const lavaMat = this._mat(p.accent, 1.0, 0.35, p.accent);
            // Upright wyvern torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.0, 8, 14), mat);
            this.body.position.set(0, 1.2, 0); this.body.rotation.x = 0.5;
            this.bodyGroup.add(this.body);
            // Magma-glow seams between forged scale plates.
            for (let i = 0; i < 4; i++) { const seam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.06), lavaMat); seam.position.set(0, 1.6 - i * 0.3, 0.4 - i * 0.12); seam.rotation.x = 0.5; this.bodyGroup.add(seam); }
            // Neck reaching forward/up.
            this.neck = this._neckHead(mat, 0, 1.7, 0.45, p.accent, 1);
            this.head = this.neck._head;
            // Jutting back-swept horns.
            for (const hx of [-0.14, 0.14]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 5), this._mat(0x1a0a06, 1.0, 0.6)); horn.position.set(hx, 0.26, -0.15); horn.rotation.x = -1.0; this.head.add(horn); }
            // Glowing molten throat organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.95, 0.25, p.accent));
            this.fireOrgan.position.set(0, 2.0, 0.7); this.bodyGroup.add(this.fireOrgan);
            // Large wings (wyverns' wings double as forelimbs -> big).
            this.lWing = this._wing(wingMat, -1, -0.4, 1.7, -0.1); this.lWing.scale.setScalar(1.5);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.7, -0.1); this.rWing.scale.setScalar(1.5);
            // Two powerful rear legs only.
            this.leftLeg = this._limb(mat, -0.38, 0.95, 0.1, 1.0);
            this.rightLeg = this._limb(mat, 0.38, 0.95, 0.1, 1.0);
            // Long counterbalancing tail with a spaded magma tip.
            this.tail = this._tail(mat, 1);
            const spade = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 4), lavaMat); spade.position.set(0, 1.0, -2.1); spade.rotation.x = -Math.PI / 2; spade.scale.set(1, 1, 0.4); this.tail.add(spade);
            this._wireDragonRig();
        }

        // ── Young Magma Drake: juvenile orange drake, half-formed scales ──────
        _buildYoungMagmaDrake() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            const wingMat = this._mat(p.wingColor, 0.85, 0.55, p.accent);
            const lavaMat = this._mat(p.accent, 0.95, 0.3, p.accent);
            // Plump young body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), mat);
            this.body.position.set(0, 1.0, 0); this.body.scale.set(1.05, 0.95, 1.3);
            this.bodyGroup.add(this.body);
            // Patches of still-forming scales (small raised plates over bare hide).
            for (let i = 0; i < 6; i++) { const sc = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12, 0), mat); sc.position.set((this.idRand() - 0.5) * 0.8, 1.0 + (this.idRand() - 0.5) * 0.6, 0.2 + (this.idRand() - 0.5) * 0.6); sc.rotation.set(this.idRand() * 3, this.idRand() * 3, 0); this.bodyGroup.add(sc); }
            // A couple of glowing cracks where new scales push through.
            for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), lavaMat); cr.position.set((this.idRand() - 0.5) * 0.7, 1.0 + (this.idRand() - 0.5) * 0.5, 0.3 + (this.idRand() - 0.5) * 0.5); cr.scale.set(1.3, 0.5, 1.3); this.bodyGroup.add(cr); }
            // Short neck.
            this.neck = new THREE.Group();
            const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 8), mat); ns.position.y = 0.2; this.neck.add(ns);
            this.neck.position.set(0, 1.4, 0.3); this.bodyGroup.add(this.neck);
            // Young rounded head with tiny nub horns.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat); sk.scale.set(1, 0.95, 1.1); this.head.add(sk);
            this._eye(this.head, -0.14, 0.07, 0.24, 0.08, p.accent);
            this._eye(this.head, 0.14, 0.07, 0.24, 0.08, p.accent);
            for (const hx of [-0.1, 0.1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), mat); horn.position.set(hx, 0.28, -0.04); this.head.add(horn); }
            this.head.position.set(0, 1.78, 0.45); this.bodyGroup.add(this.head);
            // Small fire breath spurt.
            this.fireOrgan = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), this._mat(p.accent, 0.85, 0.25, p.accent));
            this.fireOrgan.position.set(0, 1.7, 0.82); this.fireOrgan.rotation.x = Math.PI / 2; this.bodyGroup.add(this.fireOrgan);
            // Small underdeveloped wings.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.2, -0.05); this.lWing.scale.setScalar(0.75);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.2, -0.05); this.rWing.scale.setScalar(0.75);
            // Stubby legs.
            this.leftLeg = this._limb(mat, -0.34, 0.6, 0.15, 0.55);
            this.rightLeg = this._limb(mat, 0.34, 0.6, 0.15, 0.55);
            // Short tail with a small ember tip.
            this.tail = new THREE.Group();
            let ty = 0.95, tz = -0.6, tr = 0.18, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 4; i++) { const r = 0.18 - i * 0.03; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.24; ty -= 0.04 * i; }
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), lavaMat); tip.position.set(0, ty, tz - 0.1); tip.rotation.x = -Math.PI / 2; this.tail.add(tip);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Abyssal Sea Dragon: teal sea-dragon, finned wings, gills, coiling ─
        _buildAbyssalSeaDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.35);
            const finMat = this._mat(p.wingColor, 0.6, 0.3, p.accent);
            const glowMat = this._mat(p.accent, 0.9, 0.2, p.accent);
            // Serpentine coiling torso (S-curve chain of segments).
            this.body = new THREE.Group();
            let by = 1.0, bz = -0.5, br = 0.42, bPrev = new THREE.Vector3(Math.sin(0) * 0.35, by, bz);
            for (let i = 0; i < 8; i++) {
                const r = 0.42 - Math.abs(i - 3) * 0.03;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
                const bx = Math.sin(i * 0.9) * 0.35;
                seg.position.set(bx, by, bz); this.body.add(seg);
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += (i < 4 ? 0.1 : 0.02); bz += 0.28;
            }
            // Dorsal sail fin running down the spine.
            for (let i = 0; i < 5; i++) { const sail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 4), finMat); sail.position.set(Math.sin(i * 0.9) * 0.3, 1.35 + i * 0.05, -0.3 + i * 0.28); sail.scale.set(1, 1, 0.15); this.body.add(sail); }
            this.bodyGroup.add(this.body);
            // Long forward neck.
            this.neck = this._neckHead(mat, 0.3, 1.55, 1.7, p.accent, 0.6);
            this.head = this.neck._head;
            // Flaring gill frill around the head.
            for (let g = 0; g < 6; g++) { const a = (g / 6) * Math.PI - Math.PI / 2; const gill = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), finMat); gill.position.set(Math.cos(a) * 0.25, -0.05, -0.18 + Math.sin(a) * 0.1); gill.rotation.z = Math.cos(a) * 1.2; gill.scale.set(1, 1, 0.2); this.head.add(gill); }
            // Bioluminescent lure organ on the brow.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), glowMat);
            this.fireOrgan.position.set(0.3, 1.95, 1.95); this.bodyGroup.add(this.fireOrgan);
            // Finned wings (broad webbed pectoral fins).
            this.lWing = this._wing(finMat, -1, -0.4, 1.4, 0.2); this.lWing.scale.set(1.3, 0.8, 1);
            this.rWing = this._wing(finMat, 1, 0.4, 1.4, 0.2); this.rWing.scale.set(1.3, 0.8, 1);
            // Webbed flipper legs.
            this.leftLeg = this._limb(mat, -0.36, 0.85, 0.2, 0.7);
            this.rightLeg = this._limb(mat, 0.36, 0.85, 0.2, 0.7);
            const fin1 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 5), finMat); fin1.position.y = -0.7; fin1.scale.set(1, 0.5, 1.4); this.leftLeg.add(fin1);
            const fin2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 5), finMat); fin2.position.y = -0.7; fin2.scale.set(1, 0.5, 1.4); this.rightLeg.add(fin2);
            // Eel-like tail ending in a wide caudal fin.
            this.tail = new THREE.Group();
            let ty = 1.0, tz = -0.8, tr = 0.26, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.26 - i * 0.035; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); const tx = Math.sin(i * 0.8) * 0.2; seg.position.set(tx, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.3; ty -= 0.04 * i; }
            const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 4), finMat); fluke.position.set(0, ty, tz - 0.15); fluke.rotation.x = -Math.PI / 2; fluke.scale.set(1, 1, 0.15); this.tail.add(fluke);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Entropy Wyrm: void-purple wyrm dissolving into starry static ──────
        _buildEntropyWyrm() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.6);
            const wingMat = this._mat(p.wingColor, 0.85, 0.7, p.accent);
            const starMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            // Long tapering wyrm torso, segments shrinking toward the dissolving end.
            this.body = new THREE.Group();
            let by = 1.2, bz = -0.6, br = 0.5, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 7; i++) {
                const r = 0.5 - i * 0.05;
                const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
                seg.position.set(0, by, bz); seg.rotation.set(this.idRand() * 3, this.idRand() * 3, 0); this.body.add(seg);
                const pt = new THREE.Vector3(0, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += 0.05; bz += 0.3;
            }
            this.bodyGroup.add(this.body);
            // Static fizz: tiny scattered cube "particles" dissolving off the edges.
            const fizz = new THREE.Group(); fizz.userData.float = true; this.bodyGroup.add(fizz);
            for (let i = 0; i < 14; i++) { const px = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), starMat); px.position.set((this.idRand() - 0.5) * 1.6, 1.2 + (this.idRand() - 0.5) * 1.0, (this.idRand() - 0.5) * 2.0); fizz.add(px); }
            // Cosmic neck/head.
            this.neck = this._neckHead(mat, 0, 1.55, 0.9, p.accent, 1.2);
            this.head = this.neck._head;
            // Halo of orbiting stars round the skull.
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const st = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06, 0), starMat); st.position.set(Math.cos(a) * 0.34, 0.18, Math.sin(a) * 0.34); this.head.add(st); }
            // Void singularity breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0x000000, 1.0, 0.1, p.accent));
            this.fireOrgan.position.set(0, 1.65, 0.95); this.bodyGroup.add(this.fireOrgan);
            // Ragged starfield wings.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.7, -0.1); this.lWing.scale.setScalar(1.3);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.7, -0.1); this.rWing.scale.setScalar(1.3);
            // Vestigial legs.
            this.leftLeg = this._limb(mat, -0.4, 0.9, 0.15, 0.8);
            this.rightLeg = this._limb(mat, 0.4, 0.9, 0.15, 0.8);
            // Tail that frays into pure static (shrinking cubes).
            this.tail = new THREE.Group();
            let ty = 1.15, tz = -0.85, tr = 0.24, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.24 - i * 0.035; const seg = new THREE.Mesh(i < 3 ? new THREE.SphereGeometry(r, 10, 10) : new THREE.BoxGeometry(r, r, r), i < 3 ? mat : starMat); const tx = (this.idRand() - 0.5) * 0.2 * i; seg.position.set(tx, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.8, r * 0.8); tPrev = pt; tr = r; tz -= 0.3; }
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Geode Hydra: crystalline 3-headed hydra, geode-crusted heads ──────
        _buildGeodeHydra() {
            const p = this.profile;
            const mat = this._mat(p.bodyColor, 1.0, 0.4); this.applySkin(mat); // rocky neck stone
            const crysMat = this._mat(p.accent, 0.95, 0.1, p.accent);     // geode crystal
            // Rocky neck + geode head: faceted stone neck, crystal-clustered skull.
            const geodeNeck = (bx, by, bz, lean) => {
                const g = new THREE.Group();
                let py = 0, pz = 0, pr = 0.24, prevPt = new THREE.Vector3(0, 0, 0);
                for (let i = 0; i < 5; i++) {
                    const r = 0.24 - i * 0.025;
                    const seg = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
                    seg.position.set(lean * 0.05 * i, py, pz); seg.rotation.y = this.idRand() * 3; g.add(seg);
                    const pt = new THREE.Vector3(lean * 0.05 * i, py, pz);
                    if (i > 0) this.addStrut(g, mat, prevPt, pt, pr * 0.8, r * 0.8);
                    prevPt = pt; pr = r;
                    py += 0.3; pz += 0.04 * i;
                }
                const head = new THREE.Group();
                const sk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat); head.add(sk);
                // Geode crust: ring of crystals jutting from the skull.
                for (let c = 0; c < 7; c++) { const a = (c / 7) * Math.PI * 2; const cr = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 4), crysMat); cr.position.set(Math.cos(a) * 0.26, Math.sin(a) * 0.12, 0.05); cr.rotation.z = -a + Math.PI / 2; head.add(cr); }
                this._eye(head, -0.1, 0.04, 0.26, 0.05, p.accent);
                this._eye(head, 0.1, 0.04, 0.26, 0.05, p.accent);
                head.position.set(lean * 0.25, py + 0.1, pz + 0.18); head.rotation.x = 0.3;
                g.add(head);
                this.addStrut(g, mat, prevPt, head.position, pr * 0.8, 0.2);
                g._head = head;
                g.position.set(bx, by, bz); g.rotation.z = lean * 0.1;
                this.bodyGroup.add(g);
                return g;
            };
            // Jagged crystalline boulder body.
            this.body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, 0), mat);
            this.body.position.set(0, 1.0, -0.1); this.body.scale.set(1.3, 1.0, 1.4);
            this.bodyGroup.add(this.body);
            // Crystal clusters erupting from the back.
            for (let i = 0; i < 6; i++) { const cl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 5), crysMat); cl.position.set((this.idRand() - 0.5) * 0.9, 1.5 + (this.idRand() - 0.5) * 0.3, (this.idRand() - 0.5) * 0.9); cl.rotation.set(this.idRand(), this.idRand() * 3, this.idRand() - 0.5); this.bodyGroup.add(cl); }
            this.head1 = geodeNeck(-0.42, 1.4, 0.4, -1);
            this.head2 = geodeNeck(0.0, 1.55, 0.5, 0);
            this.head3 = geodeNeck(0.42, 1.4, 0.4, 1);
            // Stubby rocky tail spangled with crystals.
            this.tail = new THREE.Group();
            let ty = 0.9, tz = -0.9, tr = 0.28, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 5; i++) { const r = 0.28 - i * 0.045; const seg = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.8, r * 0.8); tPrev = pt; tr = r; tz -= 0.3; ty -= 0.04 * i; }
            const ttip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), crysMat); ttip.position.set(0, ty, tz - 0.12); ttip.rotation.x = -Math.PI / 2; this.tail.add(ttip);
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { BODY: this.body, HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail] },
                { gone: ['HEAD_ONE'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Mire Hydra: swampy 3-headed hydra dripping venomous mire ──────────
        _buildMireHydra() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.85);
            const venomMat = this._mat(p.accent, 0.85, 0.3, p.accent);
            // Sagging swamp neck + venom-dripping maw.
            const mireNeck = (bx, by, bz, lean) => {
                const g = new THREE.Group();
                let py = 0, pz = 0, pr = 0.24, prevPt = new THREE.Vector3(0, 0, 0);
                for (let i = 0; i < 6; i++) {
                    const r = 0.24 - i * 0.02;
                    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat);
                    seg.position.set(lean * 0.04 * i, py, pz); g.add(seg);
                    const pt = new THREE.Vector3(lean * 0.04 * i, py, pz);
                    if (i > 0) this.addStrut(g, mat, prevPt, pt, pr * 0.85, r * 0.85);
                    prevPt = pt; pr = r;
                    py += 0.26; pz += 0.05 * i;
                }
                const head = new THREE.Group();
                const sk = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat); sk.scale.set(1, 0.8, 1.5); head.add(sk);
                const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.34), this._mat(0x1a200a, 1.0, 0.7)); jaw.position.set(0, -0.13, 0.24); head.add(jaw);
                this._eye(head, -0.1, 0.08, 0.28, 0.05, p.accent);
                this._eye(head, 0.1, 0.08, 0.28, 0.05, p.accent);
                // Venom mire dripping from the jaw.
                for (let d = 0; d < 3; d++) { const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05 + d * 0.01, 8, 8), venomMat); drip.position.set((d - 1) * 0.08, -0.22 - d * 0.05, 0.28); drip.scale.set(1, 1.8, 1); head.add(drip); }
                head.position.set(lean * 0.28, py + 0.1, pz + 0.18); head.rotation.x = 0.4;
                g.add(head);
                this.addStrut(g, mat, prevPt, head.position, pr * 0.85, 0.2);
                g._head = head;
                g.position.set(bx, by, bz); g.rotation.z = lean * 0.14;
                this.bodyGroup.add(g);
                return g;
            };
            // Bloated muddy body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.76, 14, 12), mat);
            this.body.position.set(0, 0.95, -0.1); this.body.scale.set(1.35, 0.9, 1.45);
            this.bodyGroup.add(this.body);
            // Slime patches / bog growths on the back.
            for (let i = 0; i < 5; i++) { const slime = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), venomMat); slime.position.set((this.idRand() - 0.5) * 1.0, 1.4 + (this.idRand() - 0.5) * 0.3, (this.idRand() - 0.5) * 1.0); slime.scale.set(1.3, 0.6, 1.3); this.bodyGroup.add(slime); }
            this.head1 = mireNeck(-0.4, 1.35, 0.45, -1);
            this.head2 = mireNeck(0.0, 1.5, 0.55, 0);
            this.head3 = mireNeck(0.4, 1.35, 0.45, 1);
            // Thick muddy tail.
            this.tail = new THREE.Group();
            let ty = 0.85, tz = -0.9, tr = 0.3, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.3 - i * 0.04; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); seg.position.set(0, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(0, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.3; ty -= 0.04 * i; }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { BODY: this.body, HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail] },
                { gone: ['HEAD_ONE'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Hydra Hatchling: squat newborn hydra, three short banded necks that
        // bicker over every bite, a cap of its own eggshell still stuck to the
        // back and a glowing yolk sac sagging under the belly. Low and wide on
        // four splayed stubs, body nose to tail along Z.
        _buildHydraHatchling() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.75);
            const bandMat = this._mat(p.wingColor, 1.0, 0.8);
            const bellyMat = this._mat(0xd8c89a, 1.0, 0.85);
            const shellMat = this._mat(0xeae2c8, 1.0, 0.6);
            const yolkMat = this._mat(0xffb43a, 0.82, 0.3, 0xff9a1a);
            const toothMat = this._mat(0xf4f0e0, 1.0, 0.4);
            // Barrel: a faceted egg-shaped lump, longer than it is wide.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 7), mat);
            this.body.position.set(0, 0.62, 0); this.body.scale.set(1.0, 0.7, 1.35);
            this.bodyGroup.add(this.body);
            // Dark bands round the barrel (rings in the XY plane, squashed to the body).
            for (const [bz, br] of [[0.08, 0.49], [-0.3, 0.45]]) { const band = new THREE.Mesh(new THREE.TorusGeometry(br, 0.04, 4, 12), bandMat); band.position.set(0, 0.62, bz); band.scale.set(1, 0.7, 1); this.bodyGroup.add(band); }
            // Pale underbelly plate and the yolk sac it has not finished absorbing.
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 5), bellyMat); belly.position.set(0, 0.5, 0.12); belly.scale.set(1.0, 0.55, 1.3); this.bodyGroup.add(belly);
            this.yolk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), yolkMat); this.yolk.position.set(0, 0.34, 0.05); this.yolk.scale.set(1.0, 0.8, 1.25); this.bodyGroup.add(this.yolk);
            // The odd detail: a jagged cap of its own eggshell still worn on the back.
            const shell = new THREE.Group();
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 3, 0, Math.PI * 2, 0, Math.PI * 0.4), shellMat); shell.add(cap);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12 + (i % 2) * 0.06, 3), shellMat); tooth.position.set(Math.cos(a) * 0.27, 0.06 + (i % 2) * 0.03, Math.sin(a) * 0.27); tooth.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); shell.add(tooth); }
            shell.position.set(0.06, 0.82, -0.18); shell.rotation.set(-0.15, 0, 0.32); this.bodyGroup.add(shell);
            // Three short necks of uneven length, the side heads turned in on the middle one.
            const hatchNeck = (bx, by, bz, segs, lean, big) => {
                const g = new THREE.Group();
                let prev = new THREE.Vector3(0, 0, 0), pr = 0.13;
                for (let i = 0; i < segs; i++) {
                    const r = 0.13 - i * 0.015;
                    const pt = new THREE.Vector3(lean * 0.05 * i, 0.16 * i, 0.07 * i);
                    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), i % 2 ? bandMat : mat); seg.position.copy(pt); g.add(seg);
                    if (i > 0) this.addStrut(g, i % 2 ? bandMat : mat, prev, pt, pr * 0.85, r * 0.85, 6);
                    prev = pt; pr = r;
                }
                const head = new THREE.Group();
                const sk = new THREE.Mesh(new THREE.DodecahedronGeometry(big ? 0.17 : 0.15, 0), mat); sk.scale.set(1, 0.85, 1.3); head.add(sk);
                const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), mat); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.01, 0.24); head.add(snout);
                // Lower jaw on its own hinge so the heads can snap at each other.
                const jaw = new THREE.Group(); jaw.position.set(0, -0.07, 0.08);
                const jb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.2), bellyMat); jb.position.set(0, -0.02, 0.1); jaw.add(jb);
                for (const tx of [-0.035, 0.035]) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 3), toothMat); tooth.position.set(tx, 0.02, 0.17); jaw.add(tooth); }
                head.add(jaw);
                head.position.set(prev.x + lean * 0.04, prev.y + 0.12, prev.z + 0.12);
                head.rotation.y = -lean * 0.55;
                g.add(head);
                this.addStrut(g, mat, prev, head.position, pr * 0.85, 0.11, 6);
                g.position.set(bx, by, bz);
                g._head = head; g._jaw = jaw;
                this.bodyGroup.add(g);
                return g;
            };
            this.head1 = hatchNeck(-0.24, 0.8, 0.45, 3, -1, false);
            this.head2 = hatchNeck(0.0, 0.85, 0.5, 4, 0, true);
            this.head3 = hatchNeck(0.24, 0.8, 0.45, 2, 1, false);
            // Mismatched eyes: the left head has one huge milky eye, the right a
            // pair of beads, the middle the yolk-gold glare of the one in charge.
            this._eye(this.head1._head, -0.09, 0.05, 0.08, 0.065, 0xe8f0d0);
            this._eye(this.head1._head, 0.08, 0.06, 0.11, 0.025, 0x111111);
            for (const ex of [-0.08, 0.08]) this._eye(this.head2._head, ex, 0.07, 0.12, 0.04, p.accent);
            for (const ex of [-0.07, 0.07]) this._eye(this.head3._head, ex, 0.06, 0.11, 0.03, 0xff5a2a);
            // Four stubby legs splayed out to the sides.
            this._hatchLegs = [];
            for (const [lx, lz] of [[-1, 0.3], [1, 0.3], [-1, -0.3], [1, -0.3]]) {
                const leg = new THREE.Group(); leg.position.set(lx * 0.32, 0.5, lz);
                const foot = new THREE.Vector3(lx * 0.14, -0.44, 0.03);
                this.addStrut(leg, mat, new THREE.Vector3(0, 0, 0), foot, 0.125, 0.085, 6);
                const pad = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.19), mat); pad.position.set(foot.x, foot.y - 0.02, foot.z + 0.04); leg.add(pad);
                for (let c = -1; c <= 1; c++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 3), toothMat); claw.position.set(foot.x + c * 0.045, foot.y - 0.02, foot.z + 0.15); claw.rotation.x = Math.PI / 2; leg.add(claw); }
                this.bodyGroup.add(leg); this._hatchLegs.push(leg);
            }
            // Short banded tail ending in a little three-spined frill.
            this.tail = new THREE.Group();
            let ty = 0.6, tz = -0.6, tr = 0.16, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 4; i++) { const r = 0.16 - i * 0.03; const pt = new THREE.Vector3(0, ty, tz); const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), i % 2 ? bandMat : mat); seg.position.copy(pt); this.tail.add(seg); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85, 6); tPrev = pt; tr = r; tz -= 0.2; ty -= 0.04 * i; }
            for (let i = -1; i <= 1; i++) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 3), bandMat); fin.position.set(i * 0.06, tPrev.y + 0.04, tPrev.z - 0.08); fin.rotation.set(-1.2, 0, i * 0.5); fin.scale.set(1, 1, 0.3); this.tail.add(fin); }
            this.bodyGroup.add(this.tail);
            this._partMeshMap = { BODY: this.body, HEAD_ONE: this.head1, HEAD_TWO: this.head2, HEAD_THREE: this.head3, TAIL: this.tail, MAW: this.head2._jaw };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head1, this.head2, this.head3, this.tail, this.yolk, shell].concat(this._hatchLegs) },
                { gone: ['HEAD_ONE'], hide: [this.head1] },
                { gone: ['HEAD_TWO'], hide: [this.head2] },
                { gone: ['HEAD_THREE'], hide: [this.head3] },
                { gone: ['TAIL'], hide: [this.tail] },
                { gone: ['MAW'], hide: [this.head2._jaw] },
            ];
        }

        // ── Mire Dragon: mud-caked swamp dragon, tattered wings, corrosive fog ─
        _buildMireDragon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.9);
            const wingMat = this._mat(p.wingColor, 0.75, 0.85);
            const fogMat = this._mat(p.accent, 0.45, 0.4, p.accent);
            const mudMat = this._mat(0x3a3018, 1.0, 0.95);
            // Low slung mud-caked torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.2, 8, 14), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.1, -0.1);
            this.bodyGroup.add(this.body);
            // Clumps of caked mud stuck over the hide.
            for (let i = 0; i < 7; i++) { const mud = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), mudMat); mud.position.set((this.idRand() - 0.5) * 1.0, 1.1 + (this.idRand() - 0.5) * 0.6, (this.idRand() - 0.5) * 1.3); mud.scale.set(1.2, 0.7, 1.2); this.bodyGroup.add(mud); }
            // Drooping neck/head.
            this.neck = this._neckHead(mat, 0, 1.4, 0.75, p.accent, 0.8);
            this.head = this.neck._head;
            // Mud-clotted brow ridge.
            const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.2), mudMat); ridge.position.set(0, 0.22, 0.05); this.head.add(ridge);
            // Corrosive fog exhale (translucent expanding cloud).
            this.fireOrgan = new THREE.Group();
            for (let i = 0; i < 4; i++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + i * 0.05, 10, 10), fogMat); puff.position.set((this.idRand() - 0.5) * 0.25, (this.idRand() - 0.5) * 0.2, 0.1 + i * 0.18); this.fireOrgan.add(puff); }
            this.fireOrgan.position.set(0, 1.5, 0.95); this.bodyGroup.add(this.fireOrgan);
            // Tattered, holed wings.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.6, -0.1);
            this.rWing = this._wing(wingMat, 1, 0.38, 1.55, -0.15);
            for (const w of [this.lWing, this.rWing]) { const tear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), this._mat(0x000000, 0.0, 0.5)); tear.visible = false; w.add(tear); }
            // Heavy mud-clogged legs.
            this.leftLeg = this._limb(mat, -0.46, 0.9, 0.2, 0.9);
            this.rightLeg = this._limb(mat, 0.46, 0.88, 0.15, 0.85);
            // Muck-dripping tail.
            this.tail = this._tail(mat, 1);
            const sludge = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), fogMat); sludge.position.set(0, 1.0, -2.0); sludge.scale.set(1, 1.7, 1); this.tail.add(sludge);
            this._wireDragonRig();
        }

        // ── Sky Serpent: lightning-veined slender sky dragon, feathered wings ──
        _buildSkySerpent() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.45);
            const featherMat = this._mat(p.wingColor, 0.95, 0.5, p.accent);
            const boltMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            // Long slender coiling serpent body (sinuous chain of thin segments).
            this.body = new THREE.Group();
            let by = 0.9, bz = -0.7, br = 0.3, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 10; i++) {
                const r = 0.3 - Math.abs(i - 4) * 0.015;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
                const bx = Math.sin(i * 0.7) * 0.4;
                seg.position.set(bx, by, bz); this.body.add(seg);
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += (i < 5 ? 0.16 : -0.01); bz += 0.24;
            }
            // Lightning veins crawling along the spine.
            for (let i = 0; i < 6; i++) { const vein = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.22), boltMat); vein.position.set(Math.sin(i * 0.7) * 0.36, 1.0 + i * 0.13, -0.5 + i * 0.24); vein.rotation.z = (i % 2 ? 0.4 : -0.4); this.body.add(vein); }
            this.bodyGroup.add(this.body);
            // Slender forward neck/head.
            this.neck = this._neckHead(mat, 0.4, 1.95, 1.55, p.accent, 0.5);
            this.head = this.neck._head;
            // Trailing whisker barbels.
            for (const wx of [-0.16, 0.16]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.005, 0.6, 5), mat); wh.position.set(wx, -0.05, 0.2); wh.rotation.set(0.4, 0, wx > 0 ? -0.3 : 0.3); this.head.add(wh); }
            // Lightning spark breath.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), boltMat);
            this.fireOrgan.position.set(0.4, 2.0, 1.8); this.bodyGroup.add(this.fireOrgan);
            // Feathered wings: layered cone feathers fanning out.
            const featherWing = (side, x, y, z) => {
                const g = new THREE.Group();
                for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7 + i * 0.08, 5), featherMat); f.position.set(side * (0.2 + i * 0.18), i * 0.04, 0); f.rotation.z = side * (1.1 - i * 0.08); f.scale.set(1, 1, 0.2); g.add(f); }
                g.position.set(x, y, z); g._side = side; this.bodyGroup.add(g); this._wings.push(g); return g;
            };
            // The coil sways to +x here, so the wings and legs sit on it, not on the spine line.
            this.lWing = featherWing(-1, 0.17, 1.5, -0.1);
            this.rWing = featherWing(1, 0.57, 1.5, -0.1);
            // Small clawed legs under the first coils.
            this.leftLeg = this._limb(mat, 0.08, 0.95, -0.46, 0.84);
            this.rightLeg = this._limb(mat, 0.44, 0.95, -0.46, 0.84);
            // Tapering coiling tail with a feathered tip.
            this.tail = new THREE.Group();
            let ty = 0.85, tz = -0.85, tr = 0.2, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 6; i++) { const r = 0.2 - i * 0.028; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mat); const tx = Math.sin(i * 0.8) * 0.25; seg.position.set(tx, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.28; ty -= 0.02 * i; }
            for (let i = -1; i <= 1; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5), featherMat); f.position.set(i * 0.1, ty, tz - 0.2); f.rotation.x = -Math.PI / 2 + i * 0.2; f.scale.set(1, 1, 0.2); this.tail.add(f); }
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Ancient Dragon (:EP): huge battle-scarred elder, temporal runes ───
        _buildAncientDragonEp() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.8);
            const wingMat = this._mat(p.wingColor, 0.9, 0.85);
            const runeMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            const scarMat = this._mat(0x1a1c14, 1.0, 0.95);
            // Massive heavy elder torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.7, 8, 16), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.4, -0.1);
            this.bodyGroup.add(this.body);
            // Worn battle scars gouged across the hide.
            for (let i = 0; i < 6; i++) { const sc = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.05), scarMat); sc.position.set((this.idRand() - 0.5) * 0.8, 1.4 + (this.idRand() - 0.5) * 0.7, 0.5 + (this.idRand() - 0.5) * 0.9); sc.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3); this.bodyGroup.add(sc); }
            // Glowing temporal runes floating over the back (ring glyphs).
            for (let i = 0; i < 5; i++) { const rune = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 12), runeMat); rune.position.set((i - 2) * 0.32, 2.15, 0.6 - i * 0.3); rune.rotation.x = Math.PI / 2; this.bodyGroup.add(rune); }
            // Thick ancient neck/head.
            this.neck = this._neckHead(mat, 0, 1.75, 0.85, p.accent, 1);
            this.head = this.neck._head;
            // Broken sweeping crown horns (one chipped short).
            const h1 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 6), mat); h1.position.set(-0.18, 0.34, -0.12); h1.rotation.x = -0.6; this.head.add(h1);
            const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), mat); h2.position.set(0.18, 0.3, -0.1); h2.rotation.set(-0.6, 0, 0.3); this.head.add(h2);
            // Time-charged breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(p.accent, 0.9, 0.1, p.accent));
            this.fireOrgan.position.set(0, 1.95, 0.95); this.bodyGroup.add(this.fireOrgan);
            // Enormous tattered wings.
            this.lWing = this._wing(wingMat, -1, -0.5, 1.95, -0.1); this.lWing.scale.setScalar(1.7);
            this.rWing = this._wing(wingMat, 1, 0.5, 1.95, -0.1); this.rWing.scale.setScalar(1.7);
            // Thick pillar legs.
            this.leftLeg = this._limb(mat, -0.55, 1.0, 0.2, 1.1);
            this.rightLeg = this._limb(mat, 0.55, 1.0, 0.2, 1.1);
            // Long heavy tail with a rune-etched club.
            this.tail = this._tail(mat, 1);
            const club = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), mat); club.position.set(0, 0.9, -2.08); this.tail.add(club);
            const cr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 12), runeMat); cr.position.copy(club.position); cr.rotation.y = Math.PI / 2; this.tail.add(cr);
            this._wireDragonRig();
        }

        // ── Crimson Magma Drake: feral red drake, cracked molten scales ───────
        _buildCrimsonMagmaDrake() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.65);
            const wingMat = this._mat(p.wingColor, 0.88, 0.6, p.accent);
            const moltenMat = this._mat(p.accent, 1.0, 0.3, p.accent);
            // Lean feral hunched torso.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), mat);
            this.body.position.set(0, 1.15, 0); this.body.scale.set(1.0, 0.85, 1.55);
            this.bodyGroup.add(this.body);
            // Cracked molten fissures glowing between scales.
            for (let i = 0; i < 7; i++) { const fis = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.4), moltenMat); fis.position.set((this.idRand() - 0.5) * 0.9, 1.15 + (this.idRand() - 0.5) * 0.6, (this.idRand() - 0.5) * 1.1); fis.rotation.set(0, this.idRand() * 3, this.idRand() * 3); this.bodyGroup.add(fis); }
            // Low predatory neck/head.
            this.neck = this._neckHead(mat, 0, 1.3, 0.85, p.accent, 0.8);
            this.head = this.neck._head;
            // Back-swept feral horns.
            for (const hx of [-0.16, 0.16]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 5), this._mat(0x2a0606, 1.0, 0.6)); horn.position.set(hx, 0.24, -0.16); horn.rotation.x = -1.1; this.head.add(horn); }
            // Lower-jaw fangs jutting up from the open maw.
            for (const fx of [-0.1, 0.1]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), this._mat(0xffeecc, 1.0, 0.4)); fang.position.set(fx, -0.1, 0.28); fang.rotation.x = Math.PI; this.head.add(fang); }
            // Blazing maw breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 8), this._mat(p.accent, 0.85, 0.2, p.accent));
            this.fireOrgan.position.set(0, 1.45, 1.0); this.fireOrgan.rotation.x = Math.PI / 2; this.bodyGroup.add(this.fireOrgan);
            // Membrane wings with glowing cracked struts.
            this.lWing = this._wing(wingMat, -1, -0.4, 1.65, -0.1); this.lWing.scale.setScalar(1.25);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.65, -0.1); this.rWing.scale.setScalar(1.25);
            // Crouched powerful legs.
            this.leftLeg = this._limb(mat, -0.42, 0.9, 0.25, 0.85);
            this.rightLeg = this._limb(mat, 0.42, 0.9, 0.25, 0.85);
            // Whipping tail with a molten blade tip.
            this.tail = this._tail(mat, 1);
            const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 4), moltenMat); blade.position.set(0, 1.05, -2.15); blade.rotation.x = -Math.PI / 2; blade.scale.set(1, 1, 0.3); this.tail.add(blade);
            this._wireDragonRig();
        }

        // ── Dragon of Death (Nergal): skeletal black death-dragon, exposed ribs ─
        _buildDragonOfDeathNergal() {
            const p = this.profile;
            const boneMat = this._skinMat(p.bodyColor, 0.9);
            const wingMat = this._mat(p.wingColor, 0.55, 0.85);
            const plagueMat = this._mat(p.accent, 0.85, 0.2, p.accent);
            // Gaunt spine instead of a fleshy body (chain of vertebrae).
            this.body = new THREE.Group();
            let by = 1.25, bz = -0.6;
            for (let i = 0; i < 8; i++) {
                const vert = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), boneMat);
                vert.position.set(0, by, bz); this.body.add(vert);
                // Exposed curved ribs sprouting from each vertebra.
                for (const side of [-1, 1]) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 10, Math.PI), boneMat); rib.position.set(0, by, bz); rib.rotation.set(0, side > 0 ? 0 : Math.PI, side > 0 ? -1.2 : 1.2); this.body.add(rib); }
                bz += 0.26; by += (i < 4 ? 0.02 : -0.03);
            }
            this.bodyGroup.add(this.body);
            // Skeletal neck/head.
            this.neck = this._neckHead(boneMat, 0, 1.45, 0.85, p.accent, 0.9);
            this.head = this.neck._head;
            // Bony horns and a fanged elongated skull.
            for (const hx of [-0.14, 0.14]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), boneMat); horn.position.set(hx, 0.28, -0.1); horn.rotation.x = -0.7; this.head.add(horn); }
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), boneMat); snout.position.set(0, -0.05, 0.3); snout.rotation.x = Math.PI / 2; this.head.add(snout);
            // Sickly green plague-breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 0.7, 0.15, p.accent));
            this.fireOrgan.position.set(0, 1.6, 1.0); this.bodyGroup.add(this.fireOrgan);
            // Tattered translucent wings (just the finger-bones + thin shreds).
            this.lWing = this._wing(wingMat, -1, -0.4, 1.7, -0.1); this.lWing.scale.set(1.3, 1.4, 1);
            this.rWing = this._wing(wingMat, 1, 0.4, 1.7, -0.1); this.rWing.scale.set(1.3, 1.4, 1);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 3; i++) this._wingRib(w, boneMat, i, 0.025); }
            // Bony stick legs with clawed feet.
            this.leftLeg = this._limb(boneMat, -0.42, 0.95, 0.2, 1.0);
            this.rightLeg = this._limb(boneMat, 0.42, 0.95, 0.2, 1.0);
            // Skeletal whip tail of vertebrae ending in a barbed point.
            this.tail = new THREE.Group();
            let ty = 1.2, tz = -0.85;
            for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 - i * 0.016, 0), boneMat); seg.position.set(0, ty, tz); this.tail.add(seg); tz -= 0.26; ty -= 0.02 * i; }
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 4), plagueMat); barb.position.set(0, ty, tz - 0.12); barb.rotation.x = -Math.PI / 2; this.tail.add(barb);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Entropy Wyrm (:EP): enhanced cosmic wyrm of swirling void-energy ──
        _buildEntropyWyrmEp() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            const wingMat = this._mat(p.wingColor, 0.7, 0.7, p.accent);
            const voidMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            // Coiling void torus-segmented torso (rings of swirling energy).
            this.body = new THREE.Group();
            let by = 1.1, bz = -0.7, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 8; i++) {
                const seg = new THREE.Mesh(new THREE.TorusGeometry(0.32 - i * 0.018, 0.14, 8, 14), mat);
                const bx = Math.sin(i * 1.1) * 0.4;
                seg.position.set(bx, by, bz); seg.rotation.set(Math.PI / 2, this.idRand() * 3, 0); this.body.add(seg);
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, 0.1, 0.1);
                bPrev = pt;
                by += (i < 4 ? 0.16 : -0.02); bz += 0.28;
            }
            this.bodyGroup.add(this.body);
            // Dissolving starry scales spiralling outward as glowing motes.
            const motes = new THREE.Group(); motes.userData.float = true; this.bodyGroup.add(motes);
            for (let i = 0; i < 22; i++) { const sz = 0.04 + this.idRand() * 0.06; const mote = new THREE.Mesh(new THREE.OctahedronGeometry(sz, 0), voidMat); const a = i * 0.9; mote.position.set(Math.cos(a) * (0.7 + this.idRand() * 0.9), 1.1 + (this.idRand() - 0.5) * 1.4, Math.sin(a) * 0.4 + (this.idRand() - 0.5) * 1.6); motes.add(mote); }
            // Cosmic skull on a swirling neck.
            this.neck = this._neckHead(mat, 0, 1.5, 0.95, p.accent, 1.4);
            this.head = this.neck._head;
            // Twin orbiting accretion rings round the head.
            for (let i = 0; i < 2; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 + i * 0.1, 0.02, 6, 20), voidMat); ring.rotation.set(1.0 + i, i * 0.8, 0); this.head.add(ring); }
            // Pure-void singularity breath (black core + bright rim).
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this._mat(0x000000, 1.0, 0.05, p.accent));
            this.fireOrgan.position.set(0, 1.6, 1.0); this.bodyGroup.add(this.fireOrgan);
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 6, 18), voidMat); halo.position.copy(this.fireOrgan.position); halo.rotation.x = Math.PI / 2; this.bodyGroup.add(halo);
            // Wide starfield energy wings.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.75, -0.1); this.lWing.scale.setScalar(1.5);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.75, -0.1); this.rWing.scale.setScalar(1.5);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, 0), voidMat); st.position.copy(this._wingPoint(w, i, 0.45 + i * 0.12)); w.add(st); } }
            // Vestigial energy claws.
            this.leftLeg = this._limb(mat, -0.4, 0.95, 0.0, 0.95);
            this.rightLeg = this._limb(mat, 0.4, 0.95, 0.0, 0.95);
            // The coil weaves off the spine line, so each hip reaches up to the ring above it.
            this.addStrut(this.leftLeg, mat, new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0.09, 0.55, 0.04), 0.12, 0.1);
            this.addStrut(this.rightLeg, mat, new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0.06, 0.41, 0.11), 0.12, 0.1);
            // Tail unravelling into a stream of shrinking void cubes.
            this.tail = new THREE.Group();
            let ty = 1.05, tz = -0.9;
            for (let i = 0; i < 8; i++) { const r = 0.26 - i * 0.028; const seg = new THREE.Mesh(i < 3 ? new THREE.TorusGeometry(Math.max(0.08, r), 0.08, 6, 12) : new THREE.OctahedronGeometry(Math.max(0.05, r), 0), i < 3 ? mat : voidMat); if (i < 3) seg.rotation.x = Math.PI / 2; seg.position.set((this.idRand() - 0.5) * 0.25 * i, ty, tz); if (i >= 3) seg.userData.float = true; this.tail.add(seg); tz -= 0.3; }
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Celestial Dragon (Anshar): galaxy-scaled, star-speckled wings ─────
        _buildCelestialDragonAnshar() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            const wingMat = this._mat(p.wingColor, 0.85, 0.4, p.accent);
            const starMat = this._mat(p.accent, 1.0, 0.1, p.accent);
            // Long graceful celestial torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.5, 8, 16), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.35, -0.1);
            this.bodyGroup.add(this.body);
            // Galaxy-scale star speckles dusted across the body.
            for (let i = 0; i < 18; i++) { const star = new THREE.Mesh(new THREE.TetrahedronGeometry(0.04 + this.idRand() * 0.03, 0), starMat); star.position.set((this.idRand() - 0.5) * 1.1, 1.35 + (this.idRand() - 0.5) * 0.9, (this.idRand() - 0.5) * 1.6); this.bodyGroup.add(star); }
            // Radiant cosmic aura ring around the body.
            const aura = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 8, 28), this._mat(p.accent, 0.45, 0.1, p.accent)); aura.position.set(0, 1.35, -0.1); aura.rotation.x = 1.2; this.bodyGroup.add(aura);
            // Elegant neck/head.
            this.neck = this._neckHead(mat, 0, 1.7, 0.85, p.accent, 1);
            this.head = this.neck._head;
            // Radiant antler-like star crown.
            for (const hx of [-0.16, 0.0, 0.16]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.55, 5), starMat); horn.position.set(hx, 0.34, -0.06); horn.rotation.x = -0.3; this.head.add(horn); }
            // Brilliant star breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), this._mat(p.accent, 0.95, 0.05, p.accent));
            this.fireOrgan.position.set(0, 1.95, 0.95); this.bodyGroup.add(this.fireOrgan);
            // Vast star-speckled wings.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.85, -0.1); this.lWing.scale.setScalar(1.6);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.85, -0.1); this.rWing.scale.setScalar(1.6);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, 0), starMat); st.position.copy(this._wingPoint(w, i % 4, 0.3 + this.idRand() * 0.6)); w.add(st); } }
            // Slender legs.
            this.leftLeg = this._limb(mat, -0.46, 1.0, 0.2, 1.0);
            this.rightLeg = this._limb(mat, 0.46, 1.0, 0.2, 1.0);
            // Long flowing tail trailing a comet-tail of stars.
            this.tail = this._tail(mat, 1);
            const comet = new THREE.Group(); comet.userData.float = true; this.tail.add(comet);
            for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.TetrahedronGeometry(0.06 - i * 0.006, 0), starMat); sp.position.set((this.idRand() - 0.5) * 0.3, 1.0 - i * 0.02, -2.0 - i * 0.28); comet.add(sp); }
            this._wireDragonRig();
        }

        // ── Primal Ocean Dragon (Abzu): deep-blue, finned wings, water mane ───
        _buildPrimalOceanDragonAbzu() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.3);
            const finMat = this._mat(p.wingColor, 0.55, 0.25, p.accent);
            const waterMat = this._mat(p.accent, 0.5, 0.15, p.accent);
            // Long coiling eel-like ocean body (sweeping S-curve).
            this.body = new THREE.Group();
            let by = 1.0, bz = -0.7, br = 0.44, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 9; i++) {
                const r = 0.44 - Math.abs(i - 3) * 0.03;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat);
                const bx = Math.sin(i * 0.8) * 0.45;
                seg.position.set(bx, by, bz); this.body.add(seg);
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += (i < 4 ? 0.12 : 0.01); bz += 0.27;
            }
            this.bodyGroup.add(this.body);
            // Flowing translucent water mane running down the spine.
            for (let i = 0; i < 8; i++) { const flow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 5), waterMat); flow.position.set(Math.sin(i * 0.8) * 0.42, 1.2 + i * 0.06, -0.45 + i * 0.27); flow.rotation.set(-0.3, 0, Math.sin(i) * 0.3); flow.scale.set(1, 1, 0.3); this.body.add(flow); }
            // Long forward neck/head.
            this.neck = this._neckHead(mat, 0.35, 1.6, 1.75, p.accent, 0.5);
            this.head = this.neck._head;
            // Trailing fin whiskers and a finned crest.
            for (const wx of [-0.15, 0.15]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.005, 0.7, 5), mat); wh.position.set(wx, -0.05, 0.2); wh.rotation.set(0.5, 0, wx > 0 ? -0.3 : 0.3); this.head.add(wh); }
            const crest = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 5), finMat); crest.position.set(0, 0.2, -0.12); crest.scale.set(1, 1, 0.18); this.head.add(crest);
            // Surging water-jet breath organ.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(p.accent, 0.7, 0.1, p.accent));
            this.fireOrgan.position.set(0.35, 2.0, 2.0); this.bodyGroup.add(this.fireOrgan);
            // Broad webbed finned wings.
            this.lWing = this._wing(finMat, -1, -0.45, 1.5, 0.2); this.lWing.scale.set(1.5, 0.9, 1);
            this.rWing = this._wing(finMat, 1, 0.45, 1.5, 0.2); this.rWing.scale.set(1.5, 0.9, 1);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 3; i++) this._wingRib(w, mat, i, 0.018); }
            // Flipper legs.
            this.leftLeg = this._limb(mat, -0.4, 0.85, 0.2, 0.75);
            this.rightLeg = this._limb(mat, 0.4, 0.85, 0.2, 0.75);
            const fl1 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 5), finMat); fl1.position.y = -0.7; fl1.scale.set(1, 0.5, 1.5); this.leftLeg.add(fl1);
            const fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 5), finMat); fl2.position.y = -0.7; fl2.scale.set(1, 0.5, 1.5); this.rightLeg.add(fl2);
            // Coiling tail ending in a wide caudal fluke.
            this.tail = new THREE.Group();
            let ty = 1.0, tz = -0.85, tr = 0.28, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 7; i++) { const r = 0.28 - i * 0.032; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); const tx = Math.sin(i * 0.8) * 0.25; seg.position.set(tx, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.3; ty -= 0.03 * i; }
            const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.55, 4), finMat); fluke.position.set(0, ty, tz - 0.15); fluke.rotation.x = -Math.PI / 2; fluke.scale.set(1, 1, 0.15); this.tail.add(fluke);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Searing Magma Wyrm: lithe wingless molten-rock serpent, lava-vein body ─
        _buildSearingMagmaWyrm() {
            const p = this.profile;
            const rockMat = this._skinMat(p.bodyColor, 0.95);     // dark cooled crust
            const finMat = this._mat(0x140a06, 0.85, 0.85, p.accent); // vestigial heat fins
            const lavaMat = this._mat(p.accent, 1.0, 0.3, p.accent);  // molten glow
            // Long sinuous serpentine body: thick chain of cooled-rock segments arching up then down.
            this.body = new THREE.Group();
            let by = 0.65, bz = -0.8, br = 0.42, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 10; i++) {
                const r = Math.max(0.18, 0.42 - Math.abs(i - 3) * 0.025);
                const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
                const bx = Math.sin(i * 0.65) * 0.32;
                seg.position.set(bx, by, bz); seg.rotation.set(this.idRand() * 3, this.idRand() * 3, 0); this.body.add(seg);
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, rockMat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += (i < 4 ? 0.2 : -0.04); bz += 0.26;
            }
            // Molten glowing veins running between the crust plates the length of the spine.
            for (let i = 0; i < 12; i++) { const t2 = i / 12; const vein = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), lavaMat); vein.position.set(Math.sin(t2 * 6.5) * 0.34, 0.7 + Math.sin(t2 * Math.PI) * 1.5, -0.8 + i * 0.24); vein.scale.set(1.5, 0.5, 1.0); this.body.add(vein); }
            this.bodyGroup.add(this.body);
            // Short thick neck rising from the crest of the arch.
            this.neck = new THREE.Group();
            const ns = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.55, 9), rockMat); ns.position.y = 0.28; ns.rotation.x = 0.4; this.neck.add(ns);
            const nlava = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), lavaMat); nlava.position.set(0, 0.28, 0.12); nlava.rotation.x = 0.4; this.neck.add(nlava);
            this.neck.position.set(Math.sin(3 * 0.65) * 0.32, by + 0.15, bz - 0.1); this.bodyGroup.add(this.neck);
            // Blocky molten-rock serpent head with a glowing cracked maw.
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), rockMat); sk.scale.set(0.95, 0.85, 1.6); this.head.add(sk);
            this._eye(this.head, -0.13, 0.08, 0.26, 0.07, p.accent);
            this._eye(this.head, 0.13, 0.08, 0.26, 0.07, p.accent);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.34), lavaMat); maw.position.set(0, -0.12, 0.26); this.head.add(maw);
            for (const hx of [-0.13, 0.13]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), rockMat); horn.position.set(hx, 0.24, -0.12); horn.rotation.x = -0.9; this.head.add(horn); }
            this.head.position.set(Math.sin(3 * 0.65) * 0.32, by + 0.55, bz + 0.4); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // Searing magma-breath organ glowing at the maw.
            this.fireOrgan = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 8), this._mat(p.accent, 0.85, 0.15, p.accent));
            this.fireOrgan.position.set(Math.sin(3 * 0.65) * 0.32, by + 0.45, bz + 0.95); this.fireOrgan.rotation.x = Math.PI / 2; this.bodyGroup.add(this.fireOrgan);
            // Wingless: only vestigial heat-fin ridges where wings would be (small, non-flapping).
            this.lWing = this._wing(finMat, -1, -0.32, 1.0, -0.2); this.lWing.scale.set(0.45, 0.45, 0.45);
            this.rWing = this._wing(finMat, 1, 0.32, 1.0, -0.2); this.rWing.scale.set(0.45, 0.45, 0.45);
            // Tiny clawed magma forelimbs.
            this.leftLeg = this._limb(rockMat, -0.3, 0.5, 0.05, 0.45);
            this.rightLeg = this._limb(rockMat, 0.3, 0.5, 0.05, 0.45);
            // Long tapering molten tail trailing off the base, ending in a glowing ember tip.
            this.tail = new THREE.Group();
            let ty = 0.6, tz = -0.95, tr = 0.24, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 8; i++) { const r = Math.max(0.06, 0.24 - i * 0.025); const seg = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i < 6 ? rockMat : lavaMat); const tx = Math.sin(i * 0.7) * 0.2; seg.position.set(tx, ty, tz); this.tail.add(seg); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, rockMat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.28; ty -= 0.015 * i; }
            const ember = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), lavaMat); ember.position.set(0, ty, tz - 0.05); ember.scale.set(1, 1.4, 1); this.tail.add(ember);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        // ── Dragon of Wisdom (Enki): cosmic blue-gold dragon, many eyes, whiskers, third-eye ─
        _buildDragonOfWisdomEnki() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.35);
            const goldMat = this._mat(p.accent, 1.0, 0.25, p.accent); goldMat.metalness = 0.6;
            const wingMat = this._mat(p.wingColor, 0.7, 0.4, p.accent);
            const eyeMat = this._mat(0xffffff, 1.0, 0.1, 0xf0e0a0); // serene glowing eye
            // Sage gold "wisdom eye" helper scattered across the scales.
            const wisdomEye = (parent, x, y, z, r) => {
                const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), eyeMat);
                e.position.set(x, y, z); parent.add(e);
                const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.3, r * 0.3, 6, 12), goldMat);
                ring.position.set(x, y, z); ring.lookAt(x * 2, y * 2, z * 2 + 1); parent.add(ring);
                return e;
            };
            // Long, serene, gold-ringed coiling torso (calm S-curve).
            this.body = new THREE.Group();
            let by = 1.1, bz = -0.8, br = 0.5, bPrev = new THREE.Vector3(0, by, bz);
            for (let i = 0; i < 9; i++) {
                const r = Math.max(0.2, 0.5 - Math.abs(i - 3) * 0.028);
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), mat);
                const bx = Math.sin(i * 0.55) * 0.32;
                seg.position.set(bx, by, bz); this.body.add(seg);
                // Gold scale-ring banding every other segment.
                if (i % 2 === 0) { const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.04, 6, 18), goldMat); band.position.copy(seg.position); band.rotation.y = Math.PI / 2; this.body.add(band); }
                const pt = new THREE.Vector3(bx, by, bz);
                if (i > 0) this.addStrut(this.body, mat, bPrev, pt, br * 0.85, r * 0.85);
                bPrev = pt; br = r;
                by += (i < 4 ? 0.16 : 0.0); bz += 0.26;
            }
            this.bodyGroup.add(this.body);
            // Many serene eyes opened along the flanks of the body.
            for (let i = 0; i < 6; i++) { const t2 = i / 6; wisdomEye(this.body, (i % 2 ? 1 : -1) * 0.4, 1.0 + Math.sin(t2 * Math.PI) * 1.0, -0.6 + i * 0.28, 0.07); }
            // Graceful upward neck rising from the crest of the coil.
            this.neck = new THREE.Group();
            let ny = 0, nz = 0, nr = 0.24, nPrev = new THREE.Vector3(0, ny, nz);
            for (let i = 0; i < 5; i++) { const r = 0.24 - i * 0.02; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); seg.position.set(0, ny, nz); this.neck.add(seg); const pt = new THREE.Vector3(0, ny, nz); if (i > 0) this.addStrut(this.neck, mat, nPrev, pt, nr * 0.85, r * 0.85); nPrev = pt; nr = r; ny += 0.28; nz += 0.05 * i; }
            const ncoil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), goldMat); ncoil.position.set(0, 0.7, 0.1); this.neck.add(ncoil);
            this.neck.position.set(Math.sin(3 * 0.55) * 0.32, by + 0.2, bz - 0.2); this.bodyGroup.add(this.neck);
            // Broad serene head facing forward (front-facing, all-knowing).
            this.head = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), mat); sk.scale.set(1.15, 0.9, 1.3); this.head.add(sk);
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), mat); snout.position.set(0, -0.06, 0.34); snout.scale.set(1, 0.8, 1.2); this.head.add(snout);
            this._eye(this.head, -0.16, 0.06, 0.3, 0.07, p.accent);
            this._eye(this.head, 0.16, 0.06, 0.3, 0.07, p.accent);
            // Glowing third-eye on the brow.
            this.thirdEye = wisdomEye(this.head, 0, 0.22, 0.22, 0.1);
            // Gilded antler/brow ridges.
            for (const hx of [-0.18, 0.18]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.5, 6), goldMat); horn.position.set(hx, 0.3, -0.08); horn.rotation.x = -0.5; this.head.add(horn); }
            // Long flowing whiskers trailing from the snout.
            for (const wx of [-0.16, 0.16]) {
                const whisker = new THREE.Group();
                let wy = 0, wz = 0;
                for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.035 - i * 0.004, 6, 6), goldMat); seg.position.set(wx * (1 + i * 0.15), wy, wz); whisker.add(seg); wy -= 0.08; wz += 0.16; }
                whisker.position.set(0, -0.05, 0.3); this.head.add(whisker);
            }
            this.head.position.set(Math.sin(3 * 0.55) * 0.32, by + 0.65, bz + 0.3); this.bodyGroup.add(this.head);
            // Cosmic-knowledge breath organ: a serene glowing orb at the maw.
            this.fireOrgan = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), this._mat(p.accent, 0.85, 0.1, p.accent));
            this.fireOrgan.position.set(Math.sin(3 * 0.55) * 0.32, by + 0.55, bz + 0.85); this.bodyGroup.add(this.fireOrgan);
            // Broad serene wings with gold-traced ribs.
            this.lWing = this._wing(wingMat, -1, -0.45, 1.7, -0.1); this.lWing.scale.set(1.5, 1.3, 1);
            this.rWing = this._wing(wingMat, 1, 0.45, 1.7, -0.1); this.rWing.scale.set(1.5, 1.3, 1);
            for (const w of [this.lWing, this.rWing]) { for (let i = 0; i < 3; i++) this._wingRib(w, goldMat, i, 0.022); }
            // Stately gilded-clawed legs.
            this.leftLeg = this._limb(mat, -0.46, 0.9, 0.2, 0.95);
            this.rightLeg = this._limb(mat, 0.46, 0.9, 0.2, 0.95);
            const claw1 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), goldMat); claw1.position.y = -0.82; claw1.rotation.x = Math.PI; this.leftLeg.add(claw1);
            const claw2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), goldMat); claw2.position.y = -0.82; claw2.rotation.x = Math.PI; this.rightLeg.add(claw2);
            // Long flowing tail trailing more serene eyes and a gold tassel.
            this.tail = new THREE.Group();
            let ty = 1.1, tz = -0.95, tr = 0.28, tPrev = new THREE.Vector3(0, ty, tz);
            for (let i = 0; i < 7; i++) { const r = 0.28 - i * 0.032; const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); const tx = Math.sin(i * 0.6) * 0.2; seg.position.set(tx, ty, tz); this.tail.add(seg); if (i % 2 === 1) wisdomEye(this.tail, tx, ty + 0.2, tz, 0.05); const pt = new THREE.Vector3(tx, ty, tz); if (i > 0) this.addStrut(this.tail, mat, tPrev, pt, tr * 0.85, r * 0.85); tPrev = pt; tr = r; tz -= 0.3; ty -= 0.025 * i; }
            const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), goldMat); tassel.position.set(0, ty, tz - 0.12); tassel.rotation.x = -Math.PI / 2; tassel.scale.set(1, 1, 0.4); this.tail.add(tassel);
            this.bodyGroup.add(this.tail);
            this._wireDragonRig();
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack');
            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.12 : 0;
            this.model.rotation.z = hitJolt;
            this.model.position.y = this._baseY + Math.sin(t * 1.3) * 0.06 * this.scale;

            // Wing flap about the shoulder hinge: side * + raises a wing, and the
            // upstroke stops with the leading finger upright.
            const flap = Math.sin(t * (fast ? 7 : 3)) * 0.45;
            this._wings.forEach(w => { if (w.visible) w.rotation.z = (w._side || 1) * (0.05 + flap); });

            // Glow pulses.
            if (this.fireOrgan && this.fireOrgan.material) this.fireOrgan.material.emissiveIntensity = (fast ? 1.5 : 0.5) + Math.sin(t * 6) * 0.4;
            if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.6 + Math.sin(t * 5) * 0.4;

            // Heads/neck sway (dragon/hydra).
            [this.neck, this.head1, this.head2, this.head3].forEach((nh, i) => {
                if (nh && nh.visible) nh.rotation.z = Math.sin(t * 2 + i) * 0.12;
            });
            if (this.tail && this.tail.visible) this.tail.rotation.y = Math.sin(t * 1.6) * 0.12;
            if (this.feathers && this.feathers.visible) this.feathers.rotation.z = Math.sin(t * 2) * 0.06;

            // Hydra Hatchling: the side heads turn in and snap at the middle one,
            // which lunges forward on an attack; each neck pivots at its root.
            if (this.variant === 'lv_hydrahatchling') {
                const spat = Math.sin(t * (fast ? 9 : 3.2));
                if (this.head1 && this.head1.visible) this.head1.rotation.y = 0.2 + Math.max(0, spat) * 0.35;
                if (this.head3 && this.head3.visible) this.head3.rotation.y = -0.2 - Math.max(0, -spat) * 0.35;
                if (this.head2 && this.head2.visible) this.head2.rotation.x = fast ? Math.max(0, Math.sin(t * 6)) * 0.45 : Math.sin(t * 1.7) * 0.08;
                [this.head1, this.head2, this.head3].forEach((h, i) => { if (h && h._jaw) h._jaw.rotation.x = 0.08 + Math.max(0, Math.sin(t * (fast ? 14 : 5) + i * 2.1)) * 0.45; });
                if (this.yolk && this.yolk.visible) this.yolk.material.emissiveIntensity = 0.4 + Math.sin(t * 2.4) * 0.2;
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.5 * this.scale;
            this.model.rotation.z = prog * 1.0;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new DraconicBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = DR_PROFILES;
    reg('dragon',    { aliases: ['dragon', 'dragons', 'wyvern', 'drake', 'wyrm', 'dragonling', 'draconic', 'rex', 'tyrannosaurus', 'raptor', 'saurolophus'], scale: S.dragon.scale, weapon: 0, create: make });
    reg('hydra',     { aliases: ['hydra', 'hydras'], scale: S.hydra.scale, weapon: 0, create: make });
    reg('phoenix',   { aliases: ['phoenix', 'phoenixes', 'firebird'], scale: S.phoenix.scale, weapon: 0, create: make });
    reg('manticore', { aliases: ['manticore', 'manticores'], scale: S.manticore.scale, weapon: 0, create: make });
    reg('firedragonling',  { aliases: ['firedragonling'], scale: S.firedragonling.scale, weapon: 0, create: make });
    reg('frostdragon',     { aliases: ['frostdragon'], scale: S.frostdragon.scale, weapon: 0, create: make });
    reg('icedragonling',   { aliases: ['icedragonling'], scale: S.icedragonling.scale, weapon: 0, create: make });
    reg('juvenileicewyrm', { aliases: ['juvenileicewyrm'], scale: S.juvenileicewyrm.scale, weapon: 0, create: make });
    reg('mercurydragon',   { aliases: ['mercurydragon'], scale: S.mercurydragon.scale, weapon: 0, create: make });
    reg('moltendragon',    { aliases: ['moltendragon'], scale: S.moltendragon.scale, weapon: 0, create: make });
    reg('multiheadedhydra', { aliases: ['multiheadedhydra'], scale: S.multiheadedhydra.scale, weapon: 0, create: make });
    reg('permafrostdragon', { aliases: ['permafrostdragon'], scale: S.permafrostdragon.scale, weapon: 0, create: make });
    reg('stormdragonling',  { aliases: ['stormdragonling'], scale: S.stormdragonling.scale, weapon: 0, create: make });
    reg('thunderdragonling', { aliases: ['thunderdragonling'], scale: S.thunderdragonling.scale, weapon: 0, create: make });
    reg('volcanicwyvern',   { aliases: ['volcanicwyvern'], scale: S.volcanicwyvern.scale, weapon: 0, create: make });
    reg('youngmagmadrake',  { aliases: ['youngmagmadrake'], scale: S.youngmagmadrake.scale, weapon: 0, create: make });
    reg('abyssalseadragon', { aliases: ['abyssalseadragon'], scale: S.abyssalseadragon.scale, weapon: 0, create: make });
    reg('entropywyrm',      { aliases: ['entropywyrm'], scale: S.entropywyrm.scale, weapon: 0, create: make });
    reg('geodehydra',       { aliases: ['geodehydra'], scale: S.geodehydra.scale, weapon: 0, create: make });
    reg('mirehydra',        { aliases: ['mirehydra'], scale: S.mirehydra.scale, weapon: 0, create: make });
    reg('miredragon',       { aliases: ['miredragon'], scale: S.miredragon.scale, weapon: 0, create: make });
    reg('skyserpent',       { aliases: ['skyserpent'], scale: S.skyserpent.scale, weapon: 0, create: make });
    reg('ancientdragonep',       { aliases: ['ancientdragonep'], scale: S.ancientdragonep.scale, weapon: 0, create: make });
    reg('crimsonmagmadrake',     { aliases: ['crimsonmagmadrake'], scale: S.crimsonmagmadrake.scale, weapon: 0, create: make });
    reg('dragonofdeathnergal',   { aliases: ['dragonofdeathnergal'], scale: S.dragonofdeathnergal.scale, weapon: 0, create: make });
    reg('entropywyrmep',         { aliases: ['entropywyrmep'], scale: S.entropywyrmep.scale, weapon: 0, create: make });
    reg('celestialdragonanshar', { aliases: ['celestialdragonanshar'], scale: S.celestialdragonanshar.scale, weapon: 0, create: make });
    reg('primaloceandragonabzu', { aliases: ['primaloceandragonabzu'], scale: S.primaloceandragonabzu.scale, weapon: 0, create: make });
    reg('searingmagmawyrm',      { aliases: ['searingmagmawyrm'], scale: S.searingmagmawyrm.scale, weapon: 0, create: make });
    reg('dragonofwisdomenki',    { aliases: ['dragonofwisdomenki'], scale: S.dragonofwisdomenki.scale, weapon: 0, create: make });
    reg('lv_hydrahatchling',     { aliases: ['lv_hydrahatchling'], scale: S.lv_hydrahatchling.scale, weapon: 0, create: make });

    const NAMED = {
        firedragonling: ["Fire Dragonling"],
        frostdragon: ["Frost Dragon"],
        icedragonling: ["Ice Dragonling"],
        juvenileicewyrm: ["Juvenile Ice Wyrm"],
        mercurydragon: ["Mercury Dragon"],
        moltendragon: ["Molten Dragon"],
        multiheadedhydra: ["Multi-Headed Hydra"],
        permafrostdragon: ["Permafrost Dragon"],
        stormdragonling: ["Storm Dragonling"],
        thunderdragonling: ["Thunder Dragonling"],
        volcanicwyvern: ["Volcanic Wyvern"],
        youngmagmadrake: ["Young Magma Drake"],
        abyssalseadragon: ["Abyssal Sea Dragon"],
        entropywyrm: ["Entropy Wyrm"],
        geodehydra: ["Geode Hydra"],
        mirehydra: ["Mire Hydra"],
        miredragon: ["Mire Dragon"],
        skyserpent: ["Sky Serpent"],
        ancientdragonep: ["Ancient Dragon :EP"],
        crimsonmagmadrake: ["Crimson Magma Drake"],
        dragonofdeathnergal: ["Dragon of Death Nergal"],
        entropywyrmep: ["Entropy Wyrm :EP"],
        celestialdragonanshar: ["Celestial Dragon Anshar"],
        primaloceandragonabzu: ["Primal Ocean Dragon Abzu"],
        searingmagmawyrm: ["Searing Magma Wyrm"],
        dragonofwisdomenki: ["Dragon of Wisdom Enki ", "Dragon of Wisdom Enki"],
        lv_hydrahatchling: ["Hydra Hatchling"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Draconic family registered');
})();
