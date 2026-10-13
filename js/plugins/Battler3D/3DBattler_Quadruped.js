//=============================================================================
// 3D Battler System - Quadruped Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Four-legged procedural 3D battlers (beast, horse, unicorn,
 * hellhound, rabbit, elephant). Requires 3DBattlerSystem (core) first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Quadruped Family
 * ============================================================================
 *
 * A shared four-legged body plan (horizontal torso, head, tail, four legs that
 * trot/gallop) with optional features (ears, horn, trunk, tusks, collar). No
 * physics; reuses the shared part-losing engine and the per-monster-id shape /
 * texture / colour variation from window.Battler3D.Base.
 *
 * Leg part names differ per archetype (REAR_* vs HIND_*); both map to the same
 * four legs, so dismemberment works for every variant.
 *
 * Registered archetypes: Beast, Horse, Unicorn, Hellhound, Rabbit, Elephant
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Quadruped] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const QUAD_PROFILES = {
        beast:     { scale: 2.6, bodyColor: 0x6b5642, texturePool: 'fur', feat: { tail: 1 },                        hue: [0.08, 0.05], sat: [0.35, 0.15], lit: [0.34, 0.10] },
        horse:     { scale: 3.0, bodyColor: 0x7a5230, texturePool: 'fur', feat: { tail: 1, mane: 1 },                hue: [0.07, 0.04], sat: [0.45, 0.15], lit: [0.34, 0.10] },
        unicorn:   { scale: 3.0, bodyColor: 0xf2ecf5, texturePool: 'pale', feat: { tail: 1, mane: 1, horn: 1 },      hue: [0.78, 0.06], sat: [0.20, 0.12], lit: [0.82, 0.08] },
        hellhound: { scale: 2.6, bodyColor: 0x2a1a18, texturePool: 'void', emissive: 0x551100, feat: { collar: 1 }, hue: [0.02, 0.03], sat: [0.55, 0.15], lit: [0.20, 0.08] },
        rabbit:    { scale: 1.7, bodyColor: 0xcfc3b0, texturePool: 'fur', feat: { tail: 1, ears: 1 },                hue: [0.09, 0.04], sat: [0.20, 0.10], lit: [0.66, 0.12] },
        elephant:  { scale: 3.8, bodyColor: 0x8a8d92, texturePool: 'stone', feat: { trunk: 1, tusks: 1 },           hue: [0.60, 0.05], sat: [0.06, 0.04], lit: [0.50, 0.10] },

        // Bespoke per-name variants (distinct geometry; map ARM->foreleg, LEG->hindleg).
        basilisk:              { variant: 'basilisk',              scale: 3.2, texturePool: 'scale', bodyColor: 0x3f6b3a, accent: 0xe8c000, hue: [0.30, 0.06], sat: [0.45, 0.12], lit: [0.32, 0.08] },
        bogscalehunter:        { variant: 'bogscalehunter',        scale: 2.7, texturePool: 'scale', bodyColor: 0x4a5e3a, accent: 0x9bff5a, hue: [0.27, 0.06], sat: [0.40, 0.12], lit: [0.30, 0.08], front: true },
        celestialtrex:         { variant: 'celestialtrex',         scale: 3.4, texturePool: 'void',  bodyColor: 0x2a2150, accent: 0x9ad8ff, hue: [0.70, 0.10], sat: [0.50, 0.15], lit: [0.28, 0.08], front: true },
        cobaltrex:             { variant: 'cobaltrex',             scale: 3.4, texturePool: 'scale', bodyColor: 0x2f5a8a, accent: 0x1f3fc0, hue: [0.60, 0.06], sat: [0.55, 0.12], lit: [0.36, 0.10], front: true },
        cinderthroat:          { variant: 'cinderthroat',          scale: 2.9, texturePool: 'scale', bodyColor: 0x3a1c14, accent: 0xff5a14, emissive: 0x661500, hue: [0.03, 0.03], sat: [0.55, 0.12], lit: [0.22, 0.08] },
        crystalbacksceloporus: { variant: 'crystalbacksceloporus', scale: 2.4, texturePool: 'scale', bodyColor: 0x7a6a4a, accent: 0x6fd6ff, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.40, 0.10] },

        fenclawbrute:          { variant: 'fenclawbrute',          scale: 3.3, texturePool: 'scale', bodyColor: 0x4d5e2a, accent: 0x9bd400, emissive: 0x223300, hue: [0.22, 0.06], sat: [0.50, 0.12], lit: [0.30, 0.08], front: true },
        frogmonk:              { variant: 'frogmonk',              scale: 2.4, texturePool: 'scale', bodyColor: 0x3a7a4a, accent: 0xff7a1e, emissive: 0x551500, hue: [0.34, 0.06], sat: [0.45, 0.12], lit: [0.36, 0.08], front: true },
        fungalsnapjaw:         { variant: 'fungalsnapjaw',         scale: 3.0, texturePool: 'scale', bodyColor: 0x3c4a30, accent: 0x7affc8, emissive: 0x103322, hue: [0.32, 0.06], sat: [0.40, 0.12], lit: [0.28, 0.08] },
        marshjawheloderma:     { variant: 'marshjawheloderma',     scale: 2.7, texturePool: 'scale', bodyColor: 0x6a3a2a, accent: 0xffb000, hue: [0.06, 0.04], sat: [0.55, 0.12], lit: [0.32, 0.08] },
        marshjawstalker:       { variant: 'marshjawstalker',       scale: 2.9, texturePool: 'scale', bodyColor: 0x445a34, accent: 0x8bff5a, hue: [0.27, 0.06], sat: [0.45, 0.12], lit: [0.30, 0.08], front: true },
        mossscaleamphibolurus: { variant: 'mossscaleamphibolurus', scale: 2.8, texturePool: 'scale', bodyColor: 0x40663a, accent: 0x6fa83a, hue: [0.30, 0.06], sat: [0.42, 0.12], lit: [0.30, 0.08] },

        sandstridervaranus:    { variant: 'sandstridervaranus',    scale: 2.9, texturePool: 'scale', bodyColor: 0xd8cfa8, accent: 0xeae4cf, hue: [0.12, 0.04], sat: [0.18, 0.08], lit: [0.62, 0.10] },
        spinescalepogona:      { variant: 'spinescalepogona',      scale: 2.5, texturePool: 'scale', bodyColor: 0xb0843a, accent: 0xe8c060, hue: [0.10, 0.05], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        venomfangarcher:       { variant: 'venomfangarcher',       scale: 2.8, texturePool: 'scale', bodyColor: 0x3a5a44, accent: 0x9bff5a, hue: [0.38, 0.06], sat: [0.42, 0.12], lit: [0.30, 0.08], front: true },
        hellfiremammoth:       { variant: 'hellfiremammoth',       scale: 4.0, texturePool: 'fur',   bodyColor: 0x5a3a2a, accent: 0xff5a14, emissive: 0x551100, hue: [0.05, 0.04], sat: [0.40, 0.12], lit: [0.30, 0.08] },
        stompingelephant:      { variant: 'stompingelephant',      scale: 4.1, texturePool: 'stone', bodyColor: 0x8a8d92, accent: 0xf0e6cf, hue: [0.60, 0.05], sat: [0.06, 0.04], lit: [0.50, 0.10] },
        tyrantcrocodilian:     { variant: 'tyrantcrocodilian',     scale: 3.6, texturePool: 'scale', bodyColor: 0x35402a, accent: 0xb8a060, hue: [0.24, 0.06], sat: [0.40, 0.12], lit: [0.26, 0.08] },

        velociraptor:          { variant: 'velociraptor',          scale: 2.6, texturePool: 'scale', bodyColor: 0x7a6a3a, accent: 0xc83a2a, hue: [0.10, 0.06], sat: [0.45, 0.12], lit: [0.36, 0.10], front: true },
        dragonmonkep:          { variant: 'dragonmonkep',          scale: 2.9, texturePool: 'scale', bodyColor: 0x6a3a2a, accent: 0xffb000, emissive: 0x551500, hue: [0.06, 0.04], sat: [0.50, 0.12], lit: [0.34, 0.08], front: true },
        primordialterrorrex:   { variant: 'primordialterrorrex',   scale: 4.2, texturePool: 'scale', bodyColor: 0x4a3a30, accent: 0x9b1a14, emissive: 0x330800, hue: [0.04, 0.04], sat: [0.45, 0.12], lit: [0.26, 0.08], front: true }
    };

    class QuadrupedBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = QUAD_PROFILES[creatureType] || QUAD_PROFILES.beast;
            super(scale, offsetY, battler, profile, 0, creatureType || 'beast');
            this.variant = profile.variant || null;
            this._materials = [];
            this._baseY = null;
            if (profile.front) this.facingYaw = 0; // upright/biped creatures face the camera
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)

            // Bespoke per-name variants build distinct geometry instead of the
            // shared feat-driven rig.
            switch (this.variant) {
                case 'basilisk':              this._buildBasilisk(); break;
                case 'bogscalehunter':        this._buildBogscaleHunter(); break;
                case 'celestialtrex':         this._buildCelestialTrex(); break;
                case 'cobaltrex':             this._buildCobaltRex(); break;
                case 'cinderthroat':          this._buildCinderthroat(); break;
                case 'crystalbacksceloporus': this._buildCrystalbackSceloporus(); break;
                case 'fenclawbrute':          this._buildFenclawBrute(); break;
                case 'frogmonk':              this._buildFrogMonk(); break;
                case 'fungalsnapjaw':         this._buildFungalSnapjaw(); break;
                case 'marshjawheloderma':     this._buildMarshjawHeloderma(); break;
                case 'marshjawstalker':       this._buildMarshjawStalker(); break;
                case 'mossscaleamphibolurus': this._buildMossscaleAmphibolurus(); break;
                case 'sandstridervaranus':    this._buildSandstriderVaranus(); break;
                case 'spinescalepogona':      this._buildSpinescalePogona(); break;
                case 'venomfangarcher':       this._buildVenomfangArcher(); break;
                case 'hellfiremammoth':       this._buildHellfireMammoth(); break;
                case 'stompingelephant':      this._buildStompingElephant(); break;
                case 'tyrantcrocodilian':     this._buildTyrantCrocodilian(); break;
                case 'velociraptor':          this._buildVelociraptor(); break;
                case 'dragonmonkep':          this._buildDragonMonkEP(); break;
                case 'primordialterrorrex':   this._buildPrimordialTerrorRex(); break;
                default:                      this._buildGeneric(); break;
            }
            if (this.variant) {
                this.model = this.bodyGroup;
                this.applyModelScale();
                this.loaded = true;
                return this;
            }
            return this._finishGeneric();
        }

        _buildGeneric() {
            const p = this.profile;
            const feat = p.feat || {};
            const furMat = new THREE.MeshStandardMaterial({
                color: p.bodyColor, map: this.skinTex(), roughness: 0.85, transparent: true,
                emissive: new THREE.Color(p.emissive || 0x000000), emissiveIntensity: p.emissive ? 0.4 : 0
            });
            this._materials.push(furMat);

            // Torso (horizontal) on four legs.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 12), furMat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.0, 0);
            this.bodyGroup.add(this.body);
            const rump = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 12), furMat);
            rump.position.set(0, 1.0, -0.6); this.body.parent && this.bodyGroup.add(rump);

            // Neck + head at the front (+z).
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 10), furMat);
            neck.position.set(0, 0.2, 0.0); neck.rotation.x = 0.6; this.head.add(neck);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), furMat);
            skull.position.set(0, 0.42, 0.18); skull.scale.set(1.0, 0.9, 1.2); this.head.add(skull);
            this._eye(skull, -0.13, 0.05, 0.22, 0.06, p.emissive || 0x111111);
            this._eye(skull, 0.13, 0.05, 0.22, 0.06, p.emissive || 0x111111);
            this.head.position.set(0, 1.1, 0.66);
            this.bodyGroup.add(this.head);

            // Optional features.
            if (feat.ears) {
                this.ears = new THREE.Group();
                for (const ex of [-0.12, 0.12]) {
                    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), furMat);
                    ear.position.set(ex, 0.7, 0.12); ear.scale.set(1, 1, 0.5);
                    this.ears.add(ear);
                }
                this.head.add(this.ears);
            }
            if (feat.horn) {
                this.horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 8), this._mat(0xffe9c0, 1.0, 0.4));
                this.horn.position.set(0, 0.62, 0.34); this.horn.rotation.x = -0.4;
                this.head.add(this.horn);
            }
            if (feat.trunk) {
                // Continuous proboscis: anchored at the bottom-front of the face,
                // each segment chains off the previous one along a forward+down
                // direction that droops a little more every step, so it reads as
                // one connected trunk instead of a stack of tilted discs.
                this.trunk = new THREE.Group();
                this.trunk.position.set(0, 0.28, 0.44);
                let py = 0, pz = 0, ang = 0.2; const len = 0.16;
                for (let i = 0; i < 6; i++) {
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - i * 0.013, 0.10 - i * 0.013, len, 8), furMat);
                    const dy = -Math.sin(ang) * len, dz = Math.cos(ang) * len;
                    seg.position.set(0, py + dy / 2, pz + dz / 2);
                    seg.rotation.x = Math.PI / 2 + ang; // align cylinder axis with the (down,forward) step
                    this.trunk.add(seg);
                    py += dy; pz += dz; ang += 0.28;
                }
                this.head.add(this.trunk);
            }
            if (feat.tusks) {
                this.tusks = new THREE.Group();
                const tuskMat = this._mat(0xf0e6cf, 1.0, 0.4);
                for (const tx of [-0.16, 0.16]) {
                    const tk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), tuskMat);
                    tk.position.set(tx, 0.2, 0.32); tk.rotation.x = 1.9;
                    this.tusks.add(tk);
                }
                this.head.add(this.tusks);
            }
            if (feat.collar) {
                this.collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), this._mat(0x551111, 1.0, 0.5, p.emissive));
                this.collar.position.set(0, 0.1, 0.0); this.collar.rotation.x = 0.6;
                this.head.add(this.collar);
            }
            if (feat.mane) {
                const maneMat = this._mat(0x3a2614, 1.0, 0.9);
                const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), maneMat);
                mane.position.set(0, 0.25, -0.05); mane.rotation.x = 0.6; this.head.add(mane);
            }

            // Four legs (pivoted at the hip so they swing in a gait).
            this.frontLeft  = this._leg(furMat, -0.26, 0.45);
            this.frontRight = this._leg(furMat, 0.26, 0.45);
            this.rearLeft   = this._leg(furMat, -0.26, -0.45);
            this.rearRight  = this._leg(furMat, 0.26, -0.45);

            // Tail.
            if (feat.tail) {
                this.tail = new THREE.Group();
                const tailMat = feat.mane ? this._mat(0x3a2614, 1.0, 0.9) : furMat;
                let py = 0;
                for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.02, 8, 8), tailMat); s.position.y = py; this.tail.add(s); py -= 0.16; }
                this.tail.position.set(0, 1.05, -0.78);
                this.bodyGroup.add(this.tail);
            }

            this._genericFeat = feat;
        }

        _finishGeneric() {
            this.model = this.bodyGroup;
            this.applyModelScale();
            this._wire(this._genericFeat || {});
            this.loaded = true;
            return this;
        }

        // ── Basilisk: massive low-slung reptile, hypnotic eyes, heavy tail ────
        _buildBasilisk() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.6, 14), skin);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);
            // Dorsal ridge of crests.
            for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), this._mat(p.accent, 1.0, 0.5)); c.position.set(0, 1.32, 0.5 - i * 0.22); this.bodyGroup.add(c); }
            // Long head with hypnotic glowing eyes and a forked tongue.
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 10), skin); neck.rotation.x = 1.0; neck.position.set(0, 0.1, 0.2); this.head.add(neck);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 10), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.7, 1); snout.position.set(0, 0.32, 0.5); this.head.add(snout);
            this._eye(this.head, -0.16, 0.42, 0.42, 0.1, p.accent); this._eye(this.head, 0.16, 0.42, 0.42, 0.1, p.accent);
            const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 4), this._mat(0xcc2244, 1.0, 0.4)); tongue.rotation.x = -Math.PI / 2; tongue.position.set(0, 0.3, 0.86); this.head.add(tongue);
            this.head.position.set(0, 1.1, 0.7); this.bodyGroup.add(this.head);
            const fl = this._reptLeg(skin, -0.34, 0.5, 0.5, p.accent), fr = this._reptLeg(skin, 0.34, 0.5, 0.5, p.accent);
            const rl = this._reptLeg(skin, -0.36, -0.5, 0.55, p.accent), rr = this._reptLeg(skin, 0.36, -0.5, 0.55, p.accent);
            this.frontLeft = fl; this.frontRight = fr; this.rearLeft = rl; this.rearRight = rr;
            this.tail = this._segTail(skin, 7, 0.26, 1.0, false);
            this._wireRept();
        }

        // ── Bogscale Hunter: lean upright lizardfolk, hooked claws, drool ─────
        _buildBogscaleHunter() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.65);
            // Upright torso leaning forward.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 6, 12), skin); this.body.position.set(0, 1.35, 0); this.body.rotation.x = 0.25; this.bodyGroup.add(this.body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin); chest.position.set(0, 1.55, 0.18); this.bodyGroup.add(chest);
            // Flat predatory reptile head with slit eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.5), skin); skull.position.set(0, 0, 0.05); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.42), this._mat(0x2a3320, 1.0, 0.6)); jaw.position.set(0, -0.14, 0.12); this.head.add(jaw);
            for (let i = 0; i < 4; i++) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), this._mat(0xeedfc0, 1.0, 0.5)); fang.position.set(-0.12 + i * 0.08, -0.1, 0.26); fang.rotation.x = Math.PI; this.head.add(fang); }
            this._eye(this.head, -0.13, 0.06, 0.2, 0.06, p.accent); this._eye(this.head, 0.13, 0.06, 0.2, 0.06, p.accent);
            this.head.position.set(0, 1.95, 0.22); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // Arms = clawed forelimbs raised in ambush.
            this.frontLeft = this._clawArm(skin, -1, p); this.frontRight = this._clawArm(skin, 1, p);
            // Legs = digitigrade hind legs.
            this.rearLeft = this._reptLeg(skin, -0.2, -0.05, 0.5, p.accent); this.rearLeft.position.set(-0.2, 1.0, -0.05);
            this.rearRight = this._reptLeg(skin, 0.2, -0.05, 0.5, p.accent); this.rearRight.position.set(0.2, 1.0, -0.05);
            this.tail = this._segTail(skin, 6, 0.18, 1.0, false);
            this._wireRept();
        }
        _clawArm(mat, side, p) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.45, 8), mat); upper.position.y = -0.22; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 8), mat); fore.position.set(0, -0.55, 0.18); fore.rotation.x = 0.8; g.add(fore);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 4), this._mat(0xeedfc0, 1.0, 0.4)); claw.position.set(i * 0.06, -0.74, 0.38); claw.rotation.x = -0.4; g.add(claw); }
            g.position.set(side * 0.3, 1.55, 0.18); g.rotation.z = side * 0.25; g.rotation.x = -0.4; this.bodyGroup.add(g); return g;
        }

        // ── Celestial T-rex: cosmic biped, star-speckled, glowing nebula maw ──
        _buildCelestialTrex() {
            const p = this.profile;
            const skin = this._mat(p.bodyColor, 1.0, 0.4, 0x140a30);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 8, 14), skin); this.body.rotation.x = 0.5; this.body.position.set(0, 1.6, 0); this.bodyGroup.add(this.body);
            // Star speckles across the torso.
            for (let i = 0; i < 22; i++) { const a = this.idRand() * 6.28 + i, rr = 0.42; const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 1.0, 0.2, p.accent)); s.position.set(Math.cos(a) * rr, 1.6 + Math.sin(i * 1.7) * 0.5, Math.sin(a) * rr * 0.7 + 0.1); this.bodyGroup.add(s); }
            // Big-jawed head glowing inside like a nebula.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.6), skin); skull.position.set(0, 0.05, 0.1); this.head.add(skull);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.5), this._mat(0x6a3aff, 1.0, 0.2, 0x6a3aff)); maw.material.emissiveIntensity = 1.2; maw.position.set(0, -0.16, 0.2); this.head.add(maw);
            this._eye(this.head, -0.14, 0.1, 0.28, 0.07, p.accent); this._eye(this.head, 0.14, 0.1, 0.28, 0.07, p.accent);
            this.head.position.set(0, 2.45, 0.3); this.head.rotation.x = 0.2; this.bodyGroup.add(this.head);
            // Tiny forearms (arms).
            this.frontLeft = this._trexArm(skin, -1, 1.9); this.frontRight = this._trexArm(skin, 1, 1.9);
            // Powerful hind legs.
            this.rearLeft = this._reptLeg(skin, -0.26, 0.0, 0.6, p.accent); this.rearLeft.position.set(-0.26, 1.0, 0.0);
            this.rearRight = this._reptLeg(skin, 0.26, 0.0, 0.6, p.accent); this.rearRight.position.set(0.26, 1.0, 0.0);
            this.tail = this._segTail(skin, 7, 0.3, 1.1, false);
            this._wireRept();
        }
        _trexArm(mat, side, baseY) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 7), mat); upper.position.y = -0.15; g.add(upper);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat); hand.position.y = -0.3; g.add(hand);
            for (const cx of [-0.04, 0.04]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0xeedfc0, 1.0, 0.4)); claw.position.set(cx, -0.36, 0.06); claw.rotation.x = -0.6; g.add(claw); }
            g.position.set(side * 0.36, baseY, 0.28); g.rotation.x = -0.7; this.bodyGroup.add(g); return g;
        }

        // ── Cobalt-footed Rex: dino-cat hybrid, cat ears, blue feet ──────────
        _buildCobaltRex() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            const footMat = this._mat(p.accent, 1.0, 0.45, p.accent);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.44, 0.9, 8, 14), skin); this.body.rotation.x = 0.55; this.body.position.set(0, 1.6, 0); this.bodyGroup.add(this.body);
            // Cat-like head with big ears and feline eyes.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skin); skull.scale.set(1, 0.92, 1.15); skull.position.set(0, 0.05, 0.1); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.34), skin); snout.position.set(0, -0.06, 0.34); this.head.add(snout);
            for (const ex of [-0.2, 0.2]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 5), skin); ear.position.set(ex, 0.36, 0.0); ear.scale.set(1, 1, 0.5); this.head.add(ear); const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), this._mat(0xff9bbf, 1.0, 0.6)); inner.position.set(ex, 0.34, 0.02); inner.scale.set(1, 1, 0.4); this.head.add(inner); }
            this._eye(this.head, -0.14, 0.08, 0.3, 0.08, 0x7cff5a); this._eye(this.head, 0.14, 0.08, 0.3, 0.08, 0x7cff5a);
            this.head.position.set(0, 2.45, 0.3); this.head.rotation.x = 0.15; this.bodyGroup.add(this.head);
            this.frontLeft = this._trexArm(skin, -1, 1.95); this.frontRight = this._trexArm(skin, 1, 1.95);
            // Cobalt-glowing powerful feet.
            this.rearLeft = this._reptLeg(skin, -0.28, 0.0, 0.62, p.accent); this.rearLeft.position.set(-0.28, 1.0, 0.0);
            this.rearRight = this._reptLeg(skin, 0.28, 0.0, 0.62, p.accent); this.rearRight.position.set(0.28, 1.0, 0.0);
            const glow1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), footMat); glow1.position.y = -1.05; this.rearLeft.add(glow1);
            const glow2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), footMat); glow2.position.y = -1.05; this.rearRight.add(glow2);
            this.tail = this._segTail(skin, 6, 0.16, 1.15, false);
            this._wireRept();
        }

        // ── Cinderthroat Varanus: volcanic monitor, glowing throat, ash hide ─
        _buildCinderthroat() {
            const p = this.profile;
            const skin = this._mat(p.bodyColor, 1.0, 0.8, p.emissive);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.5, 14), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);
            // Cracked-lava ridges glowing along the back.
            for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), this._mat(p.accent, 1.0, 0.3, p.accent)); c.material.emissiveIntensity = 1.0; c.position.set(0, 1.3, 0.55 - i * 0.2); this.bodyGroup.add(c); }
            // Long monitor head with a fire-bright throat pouch.
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.45, 10), skin); neck.rotation.x = 1.0; neck.position.set(0, 0.08, 0.18); this.head.add(neck);
            const throat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), this._mat(0xff7a14, 1.0, 0.2, 0xff5a00)); throat.material.emissiveIntensity = 1.3; throat.scale.set(1, 0.8, 1.1); throat.position.set(0, 0.0, 0.28); this.head.add(throat);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 10), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.65, 1); snout.position.set(0, 0.28, 0.5); this.head.add(snout);
            this._eye(this.head, -0.13, 0.36, 0.4, 0.07, p.accent); this._eye(this.head, 0.13, 0.36, 0.4, 0.07, p.accent);
            this.head.position.set(0, 1.08, 0.68); this.bodyGroup.add(this.head);
            const fl = this._reptLeg(skin, -0.34, 0.46, 0.48, p.accent), fr = this._reptLeg(skin, 0.34, 0.46, 0.48, p.accent);
            const rl = this._reptLeg(skin, -0.36, -0.46, 0.52, p.accent), rr = this._reptLeg(skin, 0.36, -0.46, 0.52, p.accent);
            this.frontLeft = fl; this.frontRight = fr; this.rearLeft = rl; this.rearRight = rr;
            this.tail = this._segTail(skin, 7, 0.24, 1.0, true, p.accent);
            this._wireRept();
        }

        // ── Crystalback Sceloporus: small fence lizard, crystal spine ─────────
        _buildCrystalbackSceloporus() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.75);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 6, 12), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.7, 0); this.bodyGroup.add(this.body);
            // Jagged crystal cluster running the spine.
            const crystalMat = this._mat(p.accent, 0.85, 0.15, p.accent);
            for (let i = 0; i < 9; i++) { const ang = (i % 3 - 1) * 0.4; const cz = 0.55 - i * 0.14; const cr = new THREE.Mesh(new THREE.ConeGeometry(0.07 + (i % 2) * 0.03, 0.26 + (i % 3) * 0.1, 4), crystalMat); cr.position.set((i % 2 ? 0.06 : -0.06), 0.96, cz); cr.rotation.z = ang; this.bodyGroup.add(cr); }
            // Blunt spiny lizard head.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.36), skin); skull.position.set(0, 0, 0.06); this.head.add(skull);
            for (const sx of [-0.13, 0.13]) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), crystalMat); spike.position.set(sx, 0.12, -0.02); spike.rotation.x = -0.5; this.head.add(spike); }
            this._eye(this.head, -0.11, 0.05, 0.16, 0.05, 0x222222); this._eye(this.head, 0.11, 0.05, 0.16, 0.05, 0x222222);
            this.head.position.set(0, 0.78, 0.6); this.bodyGroup.add(this.head);
            // Splayed sprawling legs.
            const sp = (x, z) => { const g = this._reptLeg(skin, x, z, 0.32, p.accent); g.position.set(x, 0.66, z); g.rotation.z = (x < 0 ? -0.5 : 0.5); return g; };
            this.frontLeft = sp(-0.34, 0.4); this.frontRight = sp(0.34, 0.4);
            this.rearLeft = sp(-0.36, -0.4); this.rearRight = sp(0.36, -0.4);
            this.tail = this._segTail(skin, 6, 0.14, 0.72, false);
            this._wireRept();
        }

        // ── Fenclaw Brute: towering bipedal lizardfolk warlord, huge claws ───
        _buildFenclawBrute() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            // Hulking barrel chest + broad shoulders.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.9, 8, 14), skin); this.body.position.set(0, 1.5, 0); this.bodyGroup.add(this.body);
            const shoulders = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.55), skin); shoulders.position.set(0, 2.0, 0.05); this.bodyGroup.add(shoulders);
            // Toxin-coated hide: glowing pustules dotted over the back.
            for (let i = 0; i < 8; i++) { const a = this.idRand() * 6.28; const pus = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); pus.material.emissiveIntensity = 0.9; pus.position.set(Math.cos(a) * 0.45, 1.3 + this.idRand() * 0.8, -0.25 + this.idRand() * 0.2); this.bodyGroup.add(pus); }
            // Crested reptilian head, jutting underbite.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.6), skin); skull.position.set(0, 0, 0.08); this.head.add(skull);
            const crest = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), this._mat(p.accent, 1.0, 0.5)); crest.position.set(0, 0.28, -0.05); this.head.add(crest);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.46), this._mat(0x2c3a18, 1.0, 0.6)); jaw.position.set(0, -0.2, 0.14); this.head.add(jaw);
            for (let i = 0; i < 5; i++) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), this._mat(0xe8dcb8, 1.0, 0.5)); fang.position.set(-0.16 + i * 0.08, -0.12, 0.3); this.head.add(fang); }
            this._eye(this.head, -0.16, 0.08, 0.3, 0.08, p.accent); this._eye(this.head, 0.16, 0.08, 0.3, 0.08, p.accent);
            this.head.position.set(0, 2.55, 0.2); this.head.rotation.x = 0.2; this.bodyGroup.add(this.head);
            // Massive armor-rending claws.
            this.frontLeft = this._brawnArm(skin, -1, p); this.frontRight = this._brawnArm(skin, 1, p);
            // Thick pillar hind legs.
            this.rearLeft = this._reptLeg(skin, -0.32, 0.0, 0.7, p.accent); this.rearLeft.position.set(-0.32, 1.0, 0.0);
            this.rearRight = this._reptLeg(skin, 0.32, 0.0, 0.7, p.accent); this.rearRight.position.set(0.32, 1.0, 0.0);
            this.tail = this._segTail(skin, 7, 0.26, 1.05, false);
            this._wireRept();
        }
        _brawnArm(mat, side, p) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.55, 9), mat); upper.position.y = -0.27; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 9), mat); fore.position.set(0, -0.7, 0.22); fore.rotation.x = 0.7; g.add(fore);
            const fist = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), mat); fist.position.set(0, -0.95, 0.42); g.add(fist);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 4), this._mat(0xd8c8a0, 1.0, 0.4)); claw.position.set(i * 0.09, -0.95, 0.62); claw.rotation.x = -0.5; g.add(claw); }
            g.position.set(side * 0.55, 2.0, 0.1); g.rotation.z = side * 0.2; g.rotation.x = -0.3; this.bodyGroup.add(g); return g;
        }

        // ── Frog Monk: bipedal scaled frog ascetic, flaming fists ────────────
        _buildFrogMonk() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            // Round amphibian belly torso.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), skin); this.body.scale.set(1.0, 0.95, 0.85); this.body.position.set(0, 1.35, 0); this.bodyGroup.add(this.body);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), this._mat(0xcfe8a0, 1.0, 0.5)); belly.scale.set(1, 0.9, 0.6); belly.position.set(0, 1.25, 0.32); this.bodyGroup.add(belly);
            // Wide frog head with bulging eyes and a broad grin.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), skin); skull.scale.set(1.25, 0.85, 1.0); this.head.add(skull);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 16, Math.PI), this._mat(0x222018, 1.0, 0.6)); mouth.position.set(0, -0.1, 0.32); mouth.rotation.x = Math.PI / 2; this.head.add(mouth);
            for (const ex of [-0.26, 0.26]) { const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin); bulge.position.set(ex, 0.22, 0.12); this.head.add(bulge); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this._mat(0xffd200, 1.0, 0.2, 0xaa7700)); eye.position.set(ex, 0.26, 0.2); this.head.add(eye); }
            this.head.position.set(0, 1.95, 0.12); this.bodyGroup.add(this.head);
            // Arms ending in ember-blazing fists.
            this.frontLeft = this._emberFist(skin, -1, p); this.frontRight = this._emberFist(skin, 1, p);
            // Crouched powerful frog legs.
            this.rearLeft = this._frogLeg(skin, -0.26); this.rearRight = this._frogLeg(skin, 0.26);
            // Stubby vestigial tail.
            this.tail = this._segTail(skin, 3, 0.12, 1.1, false);
            this.tail.position.z = -0.42;   // rooted in the rump, not a hand behind it
            this._wireRept();
        }
        _emberFist(mat, side, p) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8), mat); upper.position.y = -0.2; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.36, 8), mat); fore.position.set(0, -0.5, 0.16); fore.rotation.x = 0.9; g.add(fore);
            const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), this._mat(p.accent, 1.0, 0.2, p.accent)); ember.material.emissiveIntensity = 1.3; ember.position.set(0, -0.66, 0.34); g.add(ember); this['_fist' + side] = ember;
            g.position.set(side * 0.42, 1.5, 0.12); g.rotation.z = side * 0.3; g.rotation.x = -0.5; this.bodyGroup.add(g); return g;
        }
        _frogLeg(mat, x) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.4, 8), mat); thigh.position.set(0, -0.18, 0.05); thigh.rotation.x = -0.5; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.42, 8), mat); shin.position.set(0, -0.5, 0.18); shin.rotation.x = 0.7; g.add(shin);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.34), mat); foot.position.set(0, -0.72, 0.3); g.add(foot);
            g.position.set(x, 1.0, 0.0); this.bodyGroup.add(g); return g;
        }

        // ── Fungal Snapjaw: quadruped alligator sprouting glowing mushrooms ──
        _buildFungalSnapjaw() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.7, 14), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);
            // Armored osteoderm ridges along the back.
            for (let i = 0; i < 8; i++) { const sc = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), skin); sc.position.set(0, 1.3, 0.6 - i * 0.2); this.bodyGroup.add(sc); }
            // Luminosporic mushrooms growing from the hide.
            const stalkMat = this._mat(0xe8e0d0, 1.0, 0.6);
            for (let i = 0; i < 7; i++) { const a = (this.idRand() - 0.5); const sx = a * 0.7; const sz = 0.55 - i * 0.18; const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.18, 6), stalkMat); stalk.position.set(sx, 1.32, sz); this.bodyGroup.add(stalk); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(p.accent, 1.0, 0.3, p.accent)); cap.material.emissiveIntensity = 1.0; cap.position.set(sx, 1.42, sz); this.bodyGroup.add(cap); }
            // Long broad alligator snout full of teeth.
            this.head = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.7), skin); upper.position.set(0, 0.06, 0.32); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.62), this._mat(0x2a3320, 1.0, 0.6)); lower.position.set(0, -0.1, 0.3); this.head.add(lower);
            for (let i = 0; i < 6; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xe8dcb8, 1.0, 0.5)); tooth.position.set((i % 2 ? 0.12 : -0.12), -0.02, 0.12 + (i >> 1) * 0.18); tooth.rotation.x = Math.PI; this.head.add(tooth); }
            this._eye(this.head, -0.14, 0.16, 0.0, 0.06, p.accent); this._eye(this.head, 0.14, 0.16, 0.0, 0.06, p.accent);
            this.head.position.set(0, 0.92, 0.78); this.bodyGroup.add(this.head);
            const fl = this._reptLeg(skin, -0.36, 0.5, 0.42, p.accent), fr = this._reptLeg(skin, 0.36, 0.5, 0.42, p.accent);
            const rl = this._reptLeg(skin, -0.38, -0.5, 0.46, p.accent), rr = this._reptLeg(skin, 0.38, -0.5, 0.46, p.accent);
            this.frontLeft = fl; this.frontRight = fr; this.rearLeft = rl; this.rearRight = rr;
            for (const leg of [fl, fr, rl, rr]) leg.rotation.z = (leg.position.x < 0 ? -0.45 : 0.45);
            this.tail = this._segTail(skin, 8, 0.26, 0.95, false);
            this._wireRept();
        }

        // ── Marshjaw Heloderma: venomous beaded Gila monster, dripping jaws ──
        _buildMarshjawHeloderma() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 8, 14), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.78, 0); this.bodyGroup.add(this.body);
            // Beaded scales: warning-colour bumps in bands across the body.
            const beadMat = this._mat(p.accent, 1.0, 0.5);
            for (let i = 0; i < 18; i++) { const a = this.idRand() * 6.28; const r = 0.4; const bead = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), beadMat); bead.position.set(Math.cos(a) * r, 0.78 + Math.sin(a) * r * 0.5, (this.idRand() - 0.5) * 1.3); this.bodyGroup.add(bead); }
            // Blunt heavy head with venom-dripping jaws.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin); skull.scale.set(1.1, 0.8, 1.3); skull.position.set(0, 0.02, 0.18); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.42), this._mat(0x2a1810, 1.0, 0.6)); jaw.position.set(0, -0.14, 0.26); this.head.add(jaw);
            for (const dx of [-0.1, 0.1]) { const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x9bff5a, 0.85, 0.2, 0x4aaa20)); drip.scale.set(1, 1.6, 1); drip.position.set(dx, -0.26, 0.34); this.head.add(drip); }
            this._eye(this.head, -0.14, 0.12, 0.34, 0.05, 0x331100); this._eye(this.head, 0.14, 0.12, 0.34, 0.05, 0x331100);
            this.head.position.set(0, 0.82, 0.66); this.bodyGroup.add(this.head);
            // Short sprawling limbs.
            const sp = (x, z, len) => { const g = this._reptLeg(skin, x, z, len, p.accent); g.position.set(x, 0.72, z); g.rotation.z = (x < 0 ? -0.6 : 0.6); return g; };
            this.frontLeft = sp(-0.38, 0.42, 0.36); this.frontRight = sp(0.38, 0.42, 0.36);
            this.rearLeft = sp(-0.4, -0.42, 0.4); this.rearRight = sp(0.4, -0.42, 0.4);
            this.tail = this._segTail(skin, 6, 0.24, 0.82, false);
            this._wireRept();
        }

        // ── Marshjaw Stalker: hulking bipedal lizardfolk, venom fangs ────────
        _buildMarshjawStalker() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.65);
            // Hunched ambush-predator torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.85, 7, 13), skin); this.body.position.set(0, 1.4, 0); this.body.rotation.x = 0.35; this.bodyGroup.add(this.body);
            const back = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin); back.position.set(0, 1.7, -0.18); this.bodyGroup.add(back);
            // Mottled camouflage blotches.
            for (let i = 0; i < 9; i++) { const a = this.idRand() * 6.28; const blot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), this._mat(0x2c4020, 1.0, 0.8)); blot.scale.set(1, 0.5, 1); blot.position.set(Math.cos(a) * 0.36, 1.2 + this.idRand() * 0.7, Math.sin(a) * 0.3); this.bodyGroup.add(blot); }
            // Narrow ambush head with venom-laced fangs and frill.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.52), skin); skull.position.set(0, 0, 0.06); this.head.add(skull);
            const frill = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.1, 8), this._mat(0x6a8a3a, 0.9, 0.6)); frill.position.set(0, 0.08, -0.16); frill.rotation.x = -1.2; frill.scale.set(1, 1, 0.3); this.head.add(frill);
            for (let i = 0; i < 2; i++) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), this._mat(0xcfe8a0, 1.0, 0.3, 0x4aaa20)); fang.position.set(-0.08 + i * 0.16, -0.16, 0.24); fang.rotation.x = Math.PI; this.head.add(fang); }
            this._eye(this.head, -0.12, 0.06, 0.24, 0.06, p.accent); this._eye(this.head, 0.12, 0.06, 0.24, 0.06, p.accent);
            this.head.position.set(0, 2.0, 0.28); this.head.rotation.x = 0.4; this.bodyGroup.add(this.head);
            // Clawed forelimbs poised to ambush.
            this.frontLeft = this._clawArm(skin, -1, p); this.frontRight = this._clawArm(skin, 1, p);
            // Crouched digitigrade hind legs.
            this.rearLeft = this._reptLeg(skin, -0.22, -0.05, 0.55, p.accent); this.rearLeft.position.set(-0.22, 1.0, -0.05);
            this.rearRight = this._reptLeg(skin, 0.22, -0.05, 0.55, p.accent); this.rearRight.position.set(0.22, 1.0, -0.05);
            this.tail = this._segTail(skin, 7, 0.2, 1.0, false);
            this._wireRept();
        }

        // ── Mossscale Amphibolurus: quadruped forest dragon lizard, frill ────
        _buildMossscaleAmphibolurus() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 7, 13), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.82, 0); this.bodyGroup.add(this.body);
            // Mossy fronds draping the spine and flanks.
            const mossMat = this._mat(p.accent, 1.0, 0.95);
            for (let i = 0; i < 11; i++) { const sz = 0.6 - i * 0.12; const side = (i % 2 ? 1 : -1); const frond = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), mossMat); frond.position.set(side * 0.14, 1.08, sz); frond.rotation.z = side * 0.7; frond.rotation.x = -0.3; this.bodyGroup.add(frond); }
            for (let i = 0; i < 5; i++) { const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), mossMat); dorsal.position.set(0, 1.18, 0.4 - i * 0.18); this.bodyGroup.add(dorsal); }
            // Dragon-lizard head with a spreading frilled crest.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.46), skin); skull.position.set(0, 0, 0.08); this.head.add(skull);
            const frill = new THREE.Mesh(new THREE.CircleGeometry(0.36, 12), this._mat(0x88aa44, 0.9, 0.6)); frill.position.set(0, 0.02, -0.16); frill.material.side = THREE.DoubleSide; this.head.add(frill);
            for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5) * 2.4; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), mossMat); spike.position.set(Math.sin(a) * 0.34, Math.cos(a) * 0.34 + 0.02, -0.18); spike.rotation.z = -a; this.head.add(spike); }
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 8), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.7, 1); snout.position.set(0, -0.02, 0.36); this.head.add(snout);
            this._eye(this.head, -0.11, 0.06, 0.18, 0.05, 0xffcc44); this._eye(this.head, 0.11, 0.06, 0.18, 0.05, 0xffcc44);
            this.head.position.set(0, 0.86, 0.74); this.bodyGroup.add(this.head);
            const sp = (x, z, len) => { const g = this._reptLeg(skin, x, z, len, p.accent); g.position.set(x, 0.76, z); g.rotation.z = (x < 0 ? -0.4 : 0.4); return g; };
            this.frontLeft = sp(-0.34, 0.48, 0.4); this.frontRight = sp(0.34, 0.48, 0.4);
            this.rearLeft = sp(-0.36, -0.48, 0.44); this.rearRight = sp(0.36, -0.48, 0.44);
            this.tail = this._segTail(skin, 9, 0.18, 0.84, false);
            this._wireRept();
        }

        // ── Sandstrider Varanus: slender desert monitor, glassy pale scales ──
        _buildSandstriderVaranus() {
            const p = this.profile;
            const skin = this._mat(p.bodyColor, 0.92, 0.25); // glassy: low roughness, slight translucency
            this.applySkin(skin);
            // Long lean low-slung torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.35, 8, 14), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.78, 0); this.bodyGroup.add(this.body);
            // Pale glassy sheen plates faintly catching light along the flanks.
            const glassMat = this._mat(p.accent, 0.6, 0.1, 0x554a30);
            for (let i = 0; i < 9; i++) { const side = (i % 2 ? 1 : -1); const pl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.2), glassMat); pl.position.set(side * 0.3, 0.86, 0.55 - i * 0.16); pl.rotation.x = 0.2; this.bodyGroup.add(pl); }
            // Long narrow snouted head with a flicking forked tongue.
            this.head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.5, 10), skin); neck.rotation.x = 1.1; neck.position.set(0, 0.06, 0.18); this.head.add(neck);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.72, 9), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.6, 1); snout.position.set(0, 0.26, 0.52); this.head.add(snout);
            const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.26, 4), this._mat(0xcc4466, 1.0, 0.4)); tongue.rotation.x = -Math.PI / 2; tongue.position.set(0, 0.24, 0.92); this.head.add(tongue);
            this._eye(this.head, -0.12, 0.32, 0.36, 0.06, 0xffd060); this._eye(this.head, 0.12, 0.32, 0.36, 0.06, 0xffd060);
            this.head.position.set(0, 0.86, 0.72); this.bodyGroup.add(this.head);
            // Splayed silent padded feet on sprawling limbs.
            const sp = (x, z, len) => { const g = this._reptLeg(skin, x, z, len, 0); g.position.set(x, 0.7, z); g.rotation.z = (x < 0 ? -0.55 : 0.55); const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin); pad.scale.set(1.2, 0.5, 1.2); pad.position.y = -len * 1.7; g.add(pad); return g; };
            this.frontLeft = sp(-0.34, 0.5, 0.4); this.frontRight = sp(0.34, 0.5, 0.4);
            this.rearLeft = sp(-0.36, -0.5, 0.44); this.rearRight = sp(0.36, -0.5, 0.44);
            this.tail = this._segTail(skin, 9, 0.2, 0.82, false);
            this._wireRept();
        }

        // ── Spinescale Pogona: bearded dragon bristling with bone spines ─────
        _buildSpinescalePogona() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.8);
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 7, 13), skin); this.body.rotation.x = Math.PI / 2; this.body.scale.set(1.15, 1, 1); this.body.position.set(0, 0.78, 0); this.bodyGroup.add(this.body);
            // Rows of bone spines bristling along the flanks and spine.
            const spineMat = this._mat(0xe8dcb8, 1.0, 0.55);
            for (let i = 0; i < 10; i++) { const z = 0.55 - i * 0.13; const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), spineMat); dorsal.position.set(0, 1.16, z); this.bodyGroup.add(dorsal); for (const side of [-1, 1]) { const lat = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 4), spineMat); lat.position.set(side * 0.42, 0.82, z); lat.rotation.z = side * 1.3; this.bodyGroup.add(lat); } }
            // Triangular dragon head with a spiked throat fan (beard).
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.42), skin); skull.position.set(0, 0.02, 0.06); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 6), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.7, 1); snout.position.set(0, -0.02, 0.3); this.head.add(snout);
            // Spiked beard fan hanging under the jaw.
            const beard = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this._mat(0x5a3a1a, 1.0, 0.85)); beard.position.set(0, -0.14, 0.18); beard.scale.set(1.1, 1.2, 0.7); this.head.add(beard);
            for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.2; const bspike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), spineMat); bspike.position.set(Math.sin(a) * 0.24, -0.26, 0.18 + Math.cos(a) * 0.02); bspike.rotation.z = Math.sin(a); bspike.rotation.x = 0.6; this.head.add(bspike); }
            this._eye(this.head, -0.13, 0.08, 0.18, 0.055, 0xaa5500); this._eye(this.head, 0.13, 0.08, 0.18, 0.055, 0xaa5500);
            // Head lifted off the shoulders the way a bearded dragon basks.
            this.head.position.set(0, 0.98, 0.68); this.bodyGroup.add(this.head);
            const sp = (x, z, len) => { const g = this._reptLeg(skin, x, z, len, p.accent); g.position.set(x, 0.72, z); g.rotation.z = (x < 0 ? -0.5 : 0.5); return g; };
            this.frontLeft = sp(-0.4, 0.46, 0.36); this.frontRight = sp(0.4, 0.46, 0.36);
            this.rearLeft = sp(-0.42, -0.46, 0.4); this.rearRight = sp(0.42, -0.46, 0.4);
            this.tail = this._segTail(skin, 8, 0.18, 0.82, true, spineMat.color.getHex());
            this._wireRept();
        }

        // ── Venomfang Archer: bipedal reptilian hunter, bow + toxin arrows ───
        _buildVenomfangArcher() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            // Lean upright archer torso.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.78, 7, 13), skin); this.body.position.set(0, 1.4, 0); this.body.rotation.x = 0.12; this.bodyGroup.add(this.body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin); chest.position.set(0, 1.62, 0.1); this.bodyGroup.add(chest);
            // Quiver of toxin-tipped arrows slung on the back.
            const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 8), this._mat(0x4a3320, 1.0, 0.7)); quiver.position.set(0.16, 1.55, -0.24); quiver.rotation.x = -0.3; this.bodyGroup.add(quiver);
            for (let i = -1; i <= 1; i++) { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5), this._mat(0x8a6a3a, 1.0, 0.6)); shaft.position.set(0.16 + i * 0.04, 1.78, -0.28); shaft.rotation.x = -0.3; this.bodyGroup.add(shaft); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), this._mat(p.accent, 1.0, 0.2, p.accent)); tip.material.emissiveIntensity = 0.9; tip.position.set(0.16 + i * 0.04, 1.96, -0.34); this.bodyGroup.add(tip); }
            // Narrow viper head with dripping venom fangs.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.4), skin); skull.position.set(0, 0, 0.05); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 6), skin); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.26); this.head.add(snout);
            for (const fx of [-0.06, 0.06]) { const fang = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), this._mat(0xcfe8a0, 1.0, 0.3, 0x4aaa20)); fang.position.set(fx, -0.16, 0.22); fang.rotation.x = Math.PI; this.head.add(fang); }
            this._eye(this.head, -0.11, 0.06, 0.2, 0.055, p.accent); this._eye(this.head, 0.11, 0.06, 0.2, 0.055, p.accent);
            this.head.position.set(0, 2.0, 0.2); this.head.rotation.x = 0.2; this.bodyGroup.add(this.head);
            // Left arm grips a drawn bow; right arm draws the string.
            this.frontLeft = this._bowArm(skin, -1, p); this.frontRight = this._drawArm(skin, 1);
            // Digitigrade hind legs.
            this.rearLeft = this._reptLeg(skin, -0.2, -0.02, 0.55, p.accent); this.rearLeft.position.set(-0.2, 1.0, -0.02);
            this.rearRight = this._reptLeg(skin, 0.2, -0.02, 0.55, p.accent); this.rearRight.position.set(0.2, 1.0, -0.02);
            this.tail = this._segTail(skin, 6, 0.16, 1.0, false);
            this.tail.position.z = -0.36;   // rooted at the base of the spine
            this._wireRept();
        }
        _bowArm(mat, side, p) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 8), mat); upper.position.y = -0.21; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 8), mat); fore.position.set(0, -0.5, 0.2); fore.rotation.x = 1.0; g.add(fore);
            // Vertical bow held out in front of the fist.
            const bow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 14, Math.PI * 1.2), this._mat(0x6a4a28, 1.0, 0.6)); bow.position.set(0, -0.66, 0.42); bow.rotation.z = Math.PI / 2; g.add(bow);
            const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 4), this._mat(0xddddcc, 1.0, 0.4)); string.position.set(0, -0.66, 0.42); g.add(string);
            g.position.set(side * 0.3, 1.6, 0.18); g.rotation.z = side * 0.2; g.rotation.x = -0.5; this.bodyGroup.add(g); return g;
        }
        _drawArm(mat, side) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 8), mat); upper.position.y = -0.21; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.36, 8), mat); fore.position.set(0, -0.46, 0.06); fore.rotation.x = 0.4; g.add(fore);
            const fist = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat); fist.position.set(0, -0.6, 0.12); g.add(fist);
            g.position.set(side * 0.3, 1.6, 0.05); g.rotation.z = side * 0.15; g.rotation.x = -0.2; this.bodyGroup.add(g); return g;
        }

        // ── Hellfire Mammoth: woolly mammoth, flaming tusks, impenetrable hide ─
        _buildHellfireMammoth() {
            const p = this.profile;
            const wool = this._mat(p.bodyColor, 1.0, 0.95, p.emissive);
            this.applySkin(wool);
            // Massive shaggy domed body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), wool); this.body.scale.set(1.0, 1.0, 1.35); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), wool); hump.position.set(0, 1.55, 0.45); this.bodyGroup.add(hump);
            // Shaggy wool tufts hanging off the flanks.
            for (let i = 0; i < 14; i++) { const a = this.idRand() * 6.28; const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5), wool); tuft.position.set(Math.cos(a) * 0.6, 0.85 - this.idRand() * 0.4, Math.sin(a) * 0.7); tuft.rotation.set(Math.PI - 0.3 + this.idRand() * 0.4, 0, a); this.bodyGroup.add(tuft); }
            // Domed head with trunk and flame-wreathed tusks.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), wool); skull.scale.set(1, 1.2, 0.95); skull.position.set(0, 0.1, 0.1); this.head.add(skull);
            this._eye(this.head, -0.2, 0.12, 0.36, 0.06, 0xff6600); this._eye(this.head, 0.2, 0.12, 0.36, 0.06, 0xff6600);
            this.head.position.set(0, 1.5, 0.85); this.bodyGroup.add(this.head);
            // Drooping trunk: one connected chain curving down and forward.
            this.trunk = new THREE.Group();
            this.trunk.position.set(0, -0.05, 0.42);
            { let py = 0, pz = 0, ang = 0.15; const len = 0.2;
              for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15 - i * 0.014, 0.14 - i * 0.014, len, 9), wool); const dy = -Math.sin(ang) * len, dz = Math.cos(ang) * len; seg.position.set(0, py + dy / 2, pz + dz / 2); seg.rotation.x = Math.PI / 2 + ang; this.trunk.add(seg); py += dy; pz += dz; ang += 0.26; } }
            this.head.add(this.trunk);
            // Curved tusks wreathed in supernatural flame.
            this.tusks = new THREE.Group();
            const ivory = this._mat(0xf0e6cf, 1.0, 0.4);
            for (const tx of [-0.26, 0.26]) {
                const tk = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12, Math.PI * 0.9), ivory); tk.position.set(tx, -0.1, 0.3); tk.rotation.set(0.4, 0, tx < 0 ? -0.4 : 0.4); this.tusks.add(tk);
                for (let f = 0; f < 4; f++) { const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), this._mat(p.accent, 0.85, 0.2, p.accent)); flame.material.emissiveIntensity = 1.4; flame.position.set(tx + (tx < 0 ? -1 : 1) * f * 0.04, -0.1 - f * 0.06, 0.5 - f * 0.08); this.tusks.add(flame); }
            }
            this.head.add(this.tusks);
            // Four thick pillar legs.
            this.frontLeft = this._pillarLeg(wool, -0.36, 0.4); this.frontRight = this._pillarLeg(wool, 0.36, 0.4);
            this.rearLeft = this._pillarLeg(wool, -0.36, -0.45); this.rearRight = this._pillarLeg(wool, 0.36, -0.45);
            this._wirePachyderm();
        }

        // ── Stomping Elephant: titanic grey pachyderm, big ears, bone-crushing ─
        _buildStompingElephant() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.85);
            // Enormous barrel body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), skin); this.body.scale.set(1.0, 0.95, 1.4); this.body.position.set(0, 1.25, 0); this.bodyGroup.add(this.body);
            // Big domed head with broad flapping ears.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), skin); skull.scale.set(1.05, 1.1, 0.9); skull.position.set(0, 0.05, 0.08); this.head.add(skull);
            for (const side of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), skin); ear.material.side = THREE.DoubleSide; ear.position.set(side * 0.42, 0.04, -0.05); ear.rotation.y = side * 0.6; ear.scale.set(0.85, 1.1, 1); this.head.add(ear); }
            this._eye(this.head, -0.2, 0.08, 0.34, 0.05, 0x221100); this._eye(this.head, 0.2, 0.08, 0.34, 0.05, 0x221100);
            this.head.position.set(0, 1.55, 0.82); this.bodyGroup.add(this.head);
            // Long muscular trunk: one connected chain curving down and forward.
            this.trunk = new THREE.Group();
            this.trunk.position.set(0, -0.05, 0.40);
            { let py = 0, pz = 0, ang = 0.1; const len = 0.18;
              for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14 - i * 0.013, 0.13 - i * 0.013, len, 9), skin); const dy = -Math.sin(ang) * len, dz = Math.cos(ang) * len; seg.position.set(0, py + dy / 2, pz + dz / 2); seg.rotation.x = Math.PI / 2 + ang; this.trunk.add(seg); py += dy; pz += dz; ang += 0.24; } }
            this.head.add(this.trunk);
            // Straight ivory tusks.
            this.tusks = new THREE.Group();
            const ivory = this._mat(p.accent, 1.0, 0.4);
            for (const tx of [-0.2, 0.2]) { const tk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 7), ivory); tk.position.set(tx, -0.18, 0.34); tk.rotation.set(1.6, 0, tx < 0 ? -0.2 : 0.2); this.tusks.add(tk); }
            this.head.add(this.tusks);
            // Four bone-crushing pillar legs with broad feet.
            this.frontLeft = this._pillarLeg(skin, -0.38, 0.42); this.frontRight = this._pillarLeg(skin, 0.38, 0.42);
            this.rearLeft = this._pillarLeg(skin, -0.38, -0.48); this.rearRight = this._pillarLeg(skin, 0.38, -0.48);
            this._wirePachyderm();
        }

        // A thick pillar leg with a broad crushing foot (pachyderms).
        _pillarLeg(mat, x, z) {
            const g = new THREE.Group();
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.05, 12), mat); leg.position.y = -0.52; g.add(leg);
            const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.16, 12), mat); foot.position.y = -1.05; g.add(foot);
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI - Math.PI / 2; const nail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), this._mat(0xd8cdb0, 1.0, 0.5)); nail.position.set(Math.cos(a) * 0.22, -1.12, Math.sin(a) * 0.1 + 0.2); g.add(nail); }
            g.position.set(x, 1.05, z); this.bodyGroup.add(g); return g;
        }
        // Pachyderm dismemberment: BODY + four LEG/HIND_LEG + HEAD + TRUNK + TUSKS.
        _wirePachyderm() {
            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['BODY', 'TORSO', 'SPINE', 'RIBCAGE', 'CORE'], this.body);
            set(['HEAD', 'SKULL', 'BRAIN', 'NECK'], this.head);
            set(['TRUNK'], this.trunk);
            set(['TUSKS'], this.tusks);
            set(['LEFT_LEG', 'FRONT_LEFT_PAW', 'LEFT_LEG_FRONT'], this.frontLeft);
            set(['RIGHT_LEG', 'FRONT_RIGHT_PAW', 'RIGHT_LEG_FRONT'], this.frontRight);
            set(['HIND_LEFT_LEG', 'REAR_LEFT_LEG'], this.rearLeft);
            set(['HIND_RIGHT_LEG', 'REAR_RIGHT_LEG'], this.rearRight);
            this._partMeshMap = m;
            const all = [this.body, this.head, this.trunk, this.tusks, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].filter(Boolean);
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE', 'CORE'], hide: all },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head, this.trunk, this.tusks] },
                { gone: ['TRUNK'], hide: [this.trunk] },
                { gone: ['TUSKS'], hide: [this.tusks] },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['HIND_LEFT_LEG', 'REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['HIND_RIGHT_LEG', 'REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }

        // ── Tyrant Crocodilian: ship-sized armored crocodile, steel-crush jaws ─
        _buildTyrantCrocodilian() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.9);
            // Long massive low-slung body.
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 2.0, 16), skin); this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.85, 0); this.bodyGroup.add(this.body);
            // Heavy armored scutes ridging the back in double rows.
            const scuteMat = this._mat(p.accent, 1.0, 0.6);
            for (let i = 0; i < 10; i++) { const z = 0.8 - i * 0.18; for (const side of [-0.16, 0.16]) { const sc = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 4), scuteMat); sc.position.set(side, 1.32, z); this.bodyGroup.add(sc); } const mid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.16), skin); mid.position.set(0, 1.34, z); this.bodyGroup.add(mid); }
            // Enormous steel-crushing jaws.
            this.head = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 1.0), skin); upper.position.set(0, 0.1, 0.45); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.9), this._mat(0x252c1a, 1.0, 0.7)); lower.position.set(0, -0.1, 0.42); this.head.add(lower);
            for (let i = 0; i < 9; i++) { const z = 0.08 + i * 0.1; for (const side of [-0.17, 0.17]) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), this._mat(0xe8dcb8, 1.0, 0.5)); tooth.position.set(side, -0.02, z); tooth.rotation.x = Math.PI; this.head.add(tooth); } }
            const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.3), skin); ridge.position.set(0, 0.22, 0.0); this.head.add(ridge);
            this._eye(this.head, -0.18, 0.28, 0.05, 0.07, 0xccaa33); this._eye(this.head, 0.18, 0.28, 0.05, 0.07, 0xccaa33);
            this.head.position.set(0, 0.92, 0.95); this.bodyGroup.add(this.head);
            // Stout sprawling armored legs.
            const sp = (x, z, len) => { const g = this._reptLeg(skin, x, z, len, p.accent); g.position.set(x, 0.78, z); g.rotation.z = (x < 0 ? -0.6 : 0.6); return g; };
            this.frontLeft = sp(-0.46, 0.6, 0.46); this.frontRight = sp(0.46, 0.6, 0.46);
            this.rearLeft = sp(-0.48, -0.6, 0.5); this.rearRight = sp(0.48, -0.6, 0.5);
            this.tail = this._segTail(skin, 10, 0.34, 1.0, true, p.accent);
            this._wireRept();
        }

        // ── Velociraptor: lean feathered biped, sickle toe-claw on each foot ──
        _buildVelociraptor() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            // Horizontal counterbalanced raptor torso, tilted forward.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.85, 7, 13), skin); this.body.rotation.x = 1.25; this.body.position.set(0, 1.45, 0); this.bodyGroup.add(this.body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), skin); chest.scale.set(1, 0.9, 1.1); chest.position.set(0, 1.55, 0.22); this.bodyGroup.add(chest);
            // Quill feather rows running the spine and forearms (banded accent).
            const quillMat = this._mat(p.accent, 1.0, 0.85);
            for (let i = 0; i < 9; i++) { const side = (i % 2 ? 1 : -1); const q = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.26 - i * 0.012, 4), quillMat); q.position.set(side * 0.08, 1.62 + i * 0.01, 0.2 - i * 0.085); q.rotation.x = -0.6; q.rotation.z = side * 0.4; this.bodyGroup.add(q); }
            // Long low sleek head, slit eyes, narrow toothed snout.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.34), skin); skull.position.set(0, 0, 0.02); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 6), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.7, 1); snout.position.set(0, -0.03, 0.28); this.head.add(snout);
            for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4), this._mat(0xeedfc0, 1.0, 0.5)); t.position.set(i < 2 ? -0.05 : 0.05, -0.1, 0.18 + (i % 2) * 0.12); t.rotation.x = Math.PI; this.head.add(t); }
            this._eye(this.head, -0.1, 0.06, 0.14, 0.05, 0xffcc00); this._eye(this.head, 0.1, 0.06, 0.14, 0.05, 0xffcc00);
            const crest = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), quillMat); crest.position.set(0, 0.16, -0.06); crest.rotation.x = -0.5; this.head.add(crest);
            this.head.position.set(0, 1.95, 0.6); this.head.rotation.x = 0.3; this.bodyGroup.add(this.head);
            // Small grasping fore-arms with three hooked fingers.
            this.frontLeft = this._raptorArm(skin, -1); this.frontRight = this._raptorArm(skin, 1);
            // Digitigrade hind legs each ending in a raised sickle toe-claw.
            this.rearLeft = this._sickleLeg(skin, -0.2, p); this.rearRight = this._sickleLeg(skin, 0.2, p);
            // Long stiff feathered balancing tail.
            this.tail = this._segTail(skin, 8, 0.16, 1.05, false);
            this._wireRept();
        }
        _raptorArm(mat, side) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.32, 7), mat); upper.position.y = -0.16; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.3, 7), mat); fore.position.set(0, -0.42, 0.12); fore.rotation.x = 0.8; g.add(fore);
            for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 4), this._mat(0xeedfc0, 1.0, 0.4)); claw.position.set(i * 0.04, -0.56, 0.26); claw.rotation.x = -0.3; g.add(claw); }
            g.position.set(side * 0.26, 1.55, 0.22); g.rotation.z = side * 0.3; g.rotation.x = -0.6; this.bodyGroup.add(g); return g;
        }
        _sickleLeg(mat, x, p) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.5, 8), mat); thigh.position.set(0, -0.22, 0.04); thigh.rotation.x = -0.45; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 8), mat); shin.position.set(0, -0.6, 0.12); shin.rotation.x = 0.7; g.add(shin);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.24), mat); foot.position.set(0, -0.82, 0.22); g.add(foot);
            // Iconic raised killing sickle claw on the inner toe.
            const sickle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 5, 10, Math.PI * 0.8), this._mat(p.accent, 1.0, 0.4)); sickle.position.set(0, -0.74, 0.34); sickle.rotation.set(0.4, 0, -1.0); g.add(sickle);
            g.position.set(x, 1.0, 0.0); this.bodyGroup.add(g); return g;
        }

        // ── Dragon Monk :EP: bipedal martial master, scaled fists, horns, robe ─
        _buildDragonMonkEP() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            // Upright disciplined humanoid torso wrapped in a sash robe.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 7, 13), skin); this.body.position.set(0, 1.45, 0); this.bodyGroup.add(this.body);
            const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12), this._mat(0x8a1f14, 1.0, 0.8)); robe.position.set(0, 1.05, 0); this.bodyGroup.add(robe);
            const sash = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), this._mat(p.accent, 1.0, 0.4)); sash.position.set(0, 1.35, 0); sash.rotation.x = Math.PI / 2; this.bodyGroup.add(sash);
            // Draconic head with curved horns and a glowing inner-fire maw.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.4), skin); skull.position.set(0, 0, 0.05); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 6), skin); snout.rotation.x = Math.PI / 2; snout.scale.set(1, 0.75, 1); snout.position.set(0, -0.05, 0.3); this.head.add(snout);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.2), this._mat(p.accent, 1.0, 0.2, p.accent)); maw.material.emissiveIntensity = 1.2; maw.position.set(0, -0.13, 0.26); this.head.add(maw);
            for (const hx of [-0.13, 0.13]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34, 5), this._mat(0xe8dcb8, 1.0, 0.45)); horn.position.set(hx, 0.2, -0.04); horn.rotation.set(-0.7, 0, hx < 0 ? -0.4 : 0.4); this.head.add(horn); }
            for (let i = 0; i < 2; i++) { const whisk = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.4, 4), this._mat(0xe8dcb8, 1.0, 0.6)); whisk.position.set(i ? 0.13 : -0.13, -0.1, 0.32); whisk.rotation.set(1.2, 0, i ? 0.3 : -0.3); this.head.add(whisk); }
            this._eye(this.head, -0.11, 0.07, 0.2, 0.05, p.accent); this._eye(this.head, 0.11, 0.07, 0.2, 0.05, p.accent);
            this.head.position.set(0, 2.0, 0.16); this.bodyGroup.add(this.head);
            // Scaled fists raised in a martial-arts guard, knuckles glowing.
            this.frontLeft = this._monkFist(skin, -1, p, -0.5); this.frontRight = this._monkFist(skin, 1, p, -0.2);
            // Strong braced stance legs.
            this.rearLeft = this._reptLeg(skin, -0.2, 0.02, 0.55, p.accent); this.rearLeft.position.set(-0.2, 1.0, 0.05); this.rearLeft.rotation.z = -0.18;
            this.rearRight = this._reptLeg(skin, 0.2, 0.02, 0.55, p.accent); this.rearRight.position.set(0.2, 1.0, -0.05); this.rearRight.rotation.z = 0.18;
            // Spiked dragon tail sweeping behind for balance.
            this.tail = this._segTail(skin, 7, 0.16, 1.0, true, p.accent);
            this._wireRept();
        }
        _monkFist(mat, side, p, lift) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.42, 8), mat); upper.position.y = -0.21; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 8), mat); fore.position.set(0, -0.52, 0.16); fore.rotation.x = 1.0 + lift; g.add(fore);
            const fist = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), mat); fist.position.set(0, -0.68, 0.34); g.add(fist);
            // Knuckle scale-plates glowing with dragon ki.
            for (let i = -1; i <= 1; i++) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), this._mat(p.accent, 1.0, 0.2, p.accent)); kn.material.emissiveIntensity = 1.1; kn.position.set(i * 0.06, -0.62, 0.45); g.add(kn); }
            g.position.set(side * 0.34, 1.55, 0.14); g.rotation.z = side * 0.35; g.rotation.x = -0.6; this.bodyGroup.add(g); return g;
        }

        // ── Primordial Terror Rex: colossal apex tyrannosaur, adamantine jaws ──
        _buildPrimordialTerrorRex() {
            const p = this.profile;
            const skin = this._mat(p.bodyColor, 1.0, 0.85, p.emissive);
            this.applySkin(skin);
            // Towering deep-chested torso slung forward over the hips.
            this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.58, 1.2, 9, 16), skin); this.body.rotation.x = 0.6; this.body.position.set(0, 1.85, 0); this.bodyGroup.add(this.body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), skin); chest.scale.set(1.1, 1, 1.1); chest.position.set(0, 2.0, 0.35); this.bodyGroup.add(chest);
            // Jagged battle-scarred dorsal spines + bony osteoderms.
            const spineMat = this._mat(0x2a1a14, 1.0, 0.7);
            for (let i = 0; i < 9; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 4), spineMat); sp.position.set(0, 2.3 - i * 0.16, 0.1 - i * 0.14); sp.rotation.x = -0.3; this.bodyGroup.add(sp); }
            for (let i = 0; i < 10; i++) { const a = this.idRand() * 6.28; const sc = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), spineMat); sc.position.set(Math.cos(a) * 0.58, 1.6 + this.idRand() * 0.9, Math.sin(a) * 0.5 + 0.2); this.bodyGroup.add(sc); }
            // Enormous adamantine-crushing skull with massed dagger teeth.
            this.head = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 1.0), skin); upper.position.set(0, 0.12, 0.35); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.9), this._mat(0x2c1c14, 1.0, 0.7)); lower.position.set(0, -0.2, 0.32); this.head.add(lower);
            const glow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.8), this._mat(p.accent, 1.0, 0.2, p.accent)); glow.material.emissiveIntensity = 1.0; glow.position.set(0, -0.04, 0.34); this.head.add(glow);
            for (let i = 0; i < 7; i++) { const z = 0.05 + i * 0.12; for (const side of [-0.2, 0.2]) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 4), this._mat(0xe8dcb8, 1.0, 0.4)); tooth.position.set(side, -0.04, z); tooth.rotation.x = Math.PI; this.head.add(tooth); } }
            for (const bx of [-0.2, 0.2]) { const brow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 4), spineMat); brow.position.set(bx, 0.34, 0.1); this.head.add(brow); }
            this._eye(this.head, -0.22, 0.28, 0.18, 0.09, p.accent); this._eye(this.head, 0.22, 0.28, 0.18, 0.09, p.accent);
            this.head.position.set(0, 2.85, 0.45); this.head.rotation.x = 0.2; this.bodyGroup.add(this.head);
            // Vestigial but vicious clawed forearms.
            this.frontLeft = this._trexArm(skin, -1, 2.2); this.frontRight = this._trexArm(skin, 1, 2.2);
            // Titanic pillar hind legs with rending talons.
            this.rearLeft = this._reptLeg(skin, -0.36, 0.0, 0.92, p.accent); this.rearLeft.position.set(-0.36, 1.2, 0.0);
            this.rearRight = this._reptLeg(skin, 0.36, 0.0, 0.92, p.accent); this.rearRight.position.set(0.36, 1.2, 0.0);
            // Massive counterbalancing tail.
            this.tail = this._segTail(skin, 9, 0.38, 1.3, false);
            this._wireRept();
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

        // ── Shared limb helpers for the bespoke variants ─────────────────────
        // A reptilian leg pivoted at the hip (used by both fore- and hind-legs).
        _reptLeg(mat, x, z, len, foot) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, len, 8), mat); thigh.position.y = -len * 0.5; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, len * 0.7, 8), mat); shin.position.y = -len - len * 0.3; g.add(shin);
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.26), mat); f.position.set(0, -len * 1.7, 0.07); g.add(f);
            if (foot) for (const cx of [-0.06, 0, 0.06]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), this._mat(foot, 1.0, 0.5)); claw.position.set(cx, -len * 1.72, 0.2); claw.rotation.x = Math.PI * 0.55; g.add(claw); }
            g.position.set(x, 0.92, z); this.bodyGroup.add(g); return g;
        }
        // A tapering segmented tail trailing behind (-z).
        _segTail(mat, segs, r0, baseY, spikes, spikeColor) {
            const g = new THREE.Group();
            let y = 0, z = 0, r = r0;
            for (let i = 0; i < segs; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); s.position.set(0, y, z); g.add(s);
                if (spikes) { const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 1.5, 4), this._mat(spikeColor, 1.0, 0.5)); sp.position.set(0, y + r, z); g.add(sp); }
                z -= r * 1.5; r *= 0.84; y -= 0.03;
            }
            g.position.set(0, baseY, -0.7); this.bodyGroup.add(g); return g;
        }
        // Standard reptile dismemberment wiring for the ARM/LEG/TAIL part plan.
        _wireRept(extra) {
            const m = {}, set = (ks, me) => { if (me) ks.forEach(k => m[k] = me); };
            set(['BODY', 'TORSO', 'SPINE', 'RIBCAGE', 'CORE'], this.body);
            set(['HEAD', 'SKULL', 'BRAIN', 'NECK'], this.head);
            set(['LEFT_ARM', 'FRONT_LEFT_PAW', 'LEFT_LEG_FRONT'], this.frontLeft);
            set(['RIGHT_ARM', 'FRONT_RIGHT_PAW', 'RIGHT_LEG_FRONT'], this.frontRight);
            set(['LEFT_LEG', 'REAR_LEFT_LEG', 'HIND_LEFT_LEG'], this.rearLeft);
            set(['RIGHT_LEG', 'REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], this.rearRight);
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            const all = [this.body, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail].concat(extra || []).filter(Boolean);
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE', 'CORE'], hide: all },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_ARM', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['LEFT_LEG', 'REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['RIGHT_LEG', 'REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [this.rearRight] },
            ];
            if (this.tail) this._cascadeRules.push({ gone: ['TAIL'], hide: [this.tail] });
        }

        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            eye.position.set(x, y, z); parent.add(eye); return eye;
        }

        _leg(mat, x, z) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.55, 8), mat);
            thigh.position.y = -0.27; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.4, 8), mat);
            shin.position.y = -0.72; g.add(shin);
            const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat);
            hoof.position.y = -0.92; g.add(hoof);
            g.position.set(x, 0.92, z);
            this.bodyGroup.add(g);
            return g;
        }

        _wire(feat) {
            this._partMeshMap = {
                BODY: this.body, HEAD: this.head, SKULL: this.head, BRAIN: this.head, TORSO: this.body, SPINE: this.body, RIBCAGE: this.body,
                LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight,
                FRONT_LEFT_PAW: this.frontLeft, FRONT_RIGHT_PAW: this.frontRight,
                REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight,
                HIND_LEFT_LEG: this.rearLeft, HIND_RIGHT_LEG: this.rearRight,
            };
            const rules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE'], hide: [this.body, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [this.rearRight] },
            ];
            if (this.tail)   { this._partMeshMap.TAIL = this.tail;   rules.push({ gone: ['TAIL'], hide: [this.tail] }); }
            if (this.ears)   { this._partMeshMap.EARS = this.ears;   rules.push({ gone: ['EARS'], hide: [this.ears] }); }
            if (this.horn)   { this._partMeshMap.HORN = this.horn;   rules.push({ gone: ['HORN'], hide: [this.horn] }); }
            if (this.trunk)  { this._partMeshMap.TRUNK = this.trunk; rules.push({ gone: ['TRUNK'], hide: [this.trunk] }); }
            if (this.tusks)  { this._partMeshMap.TUSKS = this.tusks; rules.push({ gone: ['TUSKS'], hide: [this.tusks] }); }
            if (this.collar) { this._partMeshMap.COLLAR = this.collar; rules.push({ gone: ['COLLAR'], hide: [this.collar] }); }
            this._cascadeRules = rules;
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;

            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            // Gait: diagonal leg pairs swing in anti-phase; faster on attack.
            // The stride only plays while the creature really travels (overworld
            // walk) or lunges on an attack: standing in a battle it keeps its
            // feet planted and just breathes.
            const fast = (anim === 'attack' || anim === 'specialattack');
            const stride = this.strideMul(fast);
            const gait = fast ? 9 : 2.4;
            const amp = (fast ? 0.6 : (anim === 'hit' ? 0.0 : 0.22)) * stride;
            const swing = (leg, ph) => { if (leg && leg.visible) leg.rotation.x = Math.sin(t * gait + ph) * amp; };
            swing(this.frontLeft, 0); swing(this.rearRight, 0);
            swing(this.frontRight, Math.PI); swing(this.rearLeft, Math.PI);

            // Body bob in sync with the gait + hit jolt; a slow breathing rise
            // takes its place while the creature stands.
            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.15 : 0;
            const bob = stride
                ? Math.abs(Math.sin(t * gait)) * (fast ? 0.12 : 0.03) * this.scale
                : (0.5 + Math.sin(t * 1.3) * 0.5) * 0.012 * this.scale;
            this.model.position.y = this._baseY + bob;
            this.model.rotation.z = hitJolt;

            if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 1.6) * 0.06 + (fast ? 0.1 : 0);
            if (this.tail && this.tail.visible) this.tail.rotation.z = Math.sin(t * 3) * 0.3;
            if (this.ears && this.ears.visible) this.ears.rotation.x = Math.sin(t * 2.2) * 0.12;
            if (this.trunk && this.trunk.visible) this.trunk.rotation.x = Math.sin(t * 1.8) * 0.12;
            if (this.collar && this.collar.material) this.collar.material.emissiveIntensity = 0.4 + Math.sin(t * 4) * 0.3;
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Collapse onto its side.
            this.model.position.y = this._baseY - prog * 0.35 * this.scale;
            this.model.rotation.z = prog * 1.4;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new QuadrupedBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = QUAD_PROFILES;
    reg('beast',     { aliases: ['beast', 'beasts', 'wolf', 'wolves', 'warg', 'lion', 'bear', 'boar', 'hog', 'pig', 'fox', 'cat', 'panther', 'tiger', 'leopard', 'jaguar', 'lynx', 'cougar', 'puma', 'squirrel', 'opossum', 'raccoon', 'hyena', 'mole', 'kangaroo', 'beaver', 'porcupine', 'rhinoceros', 'rhino', 'camel', 'badger', 'weasel', 'ferret', 'goat', 'ram', 'sheep', 'cow', 'donkey', 'monkey', 'gorilla', 'ape', 'deer', 'stag', 'elk', 'moose', 'bison', 'buffalo', 'skunk', 'lemming', 'hound', 'jackal', 'coyote', 'mongoose', 'otter', 'wolverine'], scale: S.beast.scale, weapon: 0, create: make });
    reg('horse',     { aliases: ['horse', 'horses', 'pony', 'mare', 'stallion'], scale: S.horse.scale, weapon: 0, create: make });
    reg('unicorn',   { aliases: ['unicorn', 'unicorns'], scale: S.unicorn.scale, weapon: 0, create: make });
    reg('hellhound', { aliases: ['hellhound', 'hellhounds', 'cerberus', 'hound', 'dog'], scale: S.hellhound.scale, weapon: 0, create: make });
    reg('rabbit',    { aliases: ['rabbit', 'rabbits', 'bunny', 'hare'], scale: S.rabbit.scale, weapon: 0, create: make });
    reg('elephant',  { aliases: ['elephant', 'elephants', 'mammoth'], scale: S.elephant.scale, weapon: 0, create: make });

    reg('basilisk',              { aliases: ['basilisk'], scale: S.basilisk.scale, weapon: 0, create: make });
    reg('bogscalehunter',        { aliases: ['bogscalehunter'], scale: S.bogscalehunter.scale, weapon: 0, create: make });
    reg('celestialtrex',         { aliases: ['celestialtrex'], scale: S.celestialtrex.scale, weapon: 0, create: make });
    reg('cobaltrex',             { aliases: ['cobaltrex'], scale: S.cobaltrex.scale, weapon: 0, create: make });
    reg('cinderthroat',          { aliases: ['cinderthroat'], scale: S.cinderthroat.scale, weapon: 0, create: make });
    reg('crystalbacksceloporus', { aliases: ['crystalbacksceloporus'], scale: S.crystalbacksceloporus.scale, weapon: 0, create: make });

    reg('fenclawbrute',          { aliases: ['fenclawbrute'], scale: S.fenclawbrute.scale, weapon: 0, create: make });
    reg('frogmonk',              { aliases: ['frogmonk'], scale: S.frogmonk.scale, weapon: 0, create: make });
    reg('fungalsnapjaw',         { aliases: ['fungalsnapjaw'], scale: S.fungalsnapjaw.scale, weapon: 0, create: make });
    reg('marshjawheloderma',     { aliases: ['marshjawheloderma'], scale: S.marshjawheloderma.scale, weapon: 0, create: make });
    reg('marshjawstalker',       { aliases: ['marshjawstalker'], scale: S.marshjawstalker.scale, weapon: 0, create: make });
    reg('mossscaleamphibolurus', { aliases: ['mossscaleamphibolurus'], scale: S.mossscaleamphibolurus.scale, weapon: 0, create: make });

    reg('sandstridervaranus',    { aliases: ['sandstridervaranus'], scale: S.sandstridervaranus.scale, weapon: 0, create: make });
    reg('spinescalepogona',      { aliases: ['spinescalepogona'], scale: S.spinescalepogona.scale, weapon: 0, create: make });
    reg('venomfangarcher',       { aliases: ['venomfangarcher'], scale: S.venomfangarcher.scale, weapon: 0, create: make });
    reg('hellfiremammoth',       { aliases: ['hellfiremammoth'], scale: S.hellfiremammoth.scale, weapon: 0, create: make });
    reg('stompingelephant',      { aliases: ['stompingelephant'], scale: S.stompingelephant.scale, weapon: 0, create: make });
    reg('tyrantcrocodilian',     { aliases: ['tyrantcrocodilian'], scale: S.tyrantcrocodilian.scale, weapon: 0, create: make });
    reg('velociraptor',          { aliases: ['velociraptor'], scale: S.velociraptor.scale, weapon: 0, create: make });
    reg('dragonmonkep',          { aliases: ['dragonmonkep'], scale: S.dragonmonkep.scale, weapon: 0, create: make });
    reg('primordialterrorrex',   { aliases: ['primordialterrorrex'], scale: S.primordialterrorrex.scale, weapon: 0, create: make });

    const NAMED = {
        basilisk: ["Basilisk"],
        bogscalehunter: ["Bogscale Hunter"],
        celestialtrex: ["Celestial Tyrannosaurus"],
        cobaltrex: ["Cobalt-footed Rex"],
        cinderthroat: ["Cinderthroat Varanus"],
        crystalbacksceloporus: ["Crystalback Sceloporus"],
        fenclawbrute: ["Fenclaw Brute"],
        frogmonk: ["Frog Monk"],
        fungalsnapjaw: ["Fungal Snapjaw"],
        marshjawheloderma: ["Marshjaw Heloderma"],
        marshjawstalker: ["Marshjaw Stalker"],
        mossscaleamphibolurus: ["Mossscale Amphibolurus"],
        sandstridervaranus: ["Sandstrider Varanus"],
        spinescalepogona: ["Spinescale Pogona"],
        venomfangarcher: ["Venomfang Archer"],
        hellfiremammoth: ["Hellfire Mammoth"],
        stompingelephant: ["Stomping Elephant"],
        tyrantcrocodilian: ["Tyrant Crocodilian"],
        velociraptor: ["Velociraptor"],
        dragonmonkep: ["Dragon Monk :EP"],
        primordialterrorrex: ["Primordial Terror Rex"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Quadruped family registered');
})();
