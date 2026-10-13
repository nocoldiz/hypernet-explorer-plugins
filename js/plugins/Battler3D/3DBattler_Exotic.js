//=============================================================================
// 3D Battler System - Exotic Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Exotic procedural 3D battlers (crystal entity, mineral, bacterial,
 * gorgon, abyssal leviathan, ophanim, centaur). Requires 3DBattlerSystem first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Exotic Family
 * ============================================================================
 *
 * A grab-bag of unusual body plans (no physics) sharing the part-losing engine
 * and per-monster-id variation from window.Battler3D.Base.
 *
 * Registered: CrystalEntity, Mineral, Bacterial, Gorgon, AbyssalLeviathan,
 *             Ophanim, Centaur, and the level 1-5 Ophanim Ringlet
 *             (lv_ophanimringlet)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Exotic] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const EX_PROFILES = {
        crystalentity:    { variant: 'crystal', scale: 2.6, texturePool: 'crystal', bodyColor: 0x66d4e0, accent: 0xfff2a0, hue: [0.50, 0.15], sat: [0.55, 0.15], lit: [0.55, 0.10] },
        mineral:          { variant: 'mineral', scale: 2.4, texturePool: 'stone', bodyColor: 0x8a7a5a, accent: 0x66ddaa, hue: [0.10, 0.06], sat: [0.25, 0.12], lit: [0.42, 0.10] },
        bacterial:        { variant: 'bacterial', scale: 2.2, texturePool: 'foliage', bodyColor: 0x88cc66, accent: 0xddff66, hue: [0.28, 0.10], sat: [0.45, 0.15], lit: [0.50, 0.10] },
        gorgon:           { variant: 'gorgon', scale: 2.7, texturePool: 'green', bodyColor: 0x6a8a4a, accent: 0xffd24a, hue: [0.28, 0.08], sat: [0.45, 0.15], lit: [0.40, 0.10] },
        abyssalleviathan: { variant: 'leviathan', scale: 3.4, texturePool: 'void', bodyColor: 0x162838, accent: 0x33ddff, hue: [0.55, 0.06], sat: [0.50, 0.15], lit: [0.18, 0.06] },
        ophanim:          { variant: 'ophanim', scale: 2.8, texturePool: 'pale', bodyColor: 0xa8fff9, accent: 0xc0fffe, hue: [0.12, 0.04], sat: [0.45, 0.15], lit: [0.70, 0.10] },
        centaur:          { variant: 'centaur', scale: 3.2, texturePool: 'fur', bodyColor: 0x7a5230, accent: 0xffd24a, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.36, 0.10] },
        totemguardian:    { variant: 'totemguardian', scale: 2.9, texturePool: 'wood', bodyColor: 0x8a5a32, accent: 0xffcc44, hue: [0.08, 0.04], sat: [0.40, 0.12], lit: [0.38, 0.08], front: true },
        toteminitiate:    { variant: 'toteminitiate', scale: 2.2, texturePool: 'stone', bodyColor: 0xc8c0b0, accent: 0x88ccff, hue: [0.10, 0.04], sat: [0.12, 0.08], lit: [0.66, 0.08], front: true },
        cindermawhound:   { variant: 'cindermawhound', scale: 2.5, texturePool: 'ash', bodyColor: 0x33302e, accent: 0xff5522, hue: [0.04, 0.03], sat: [0.30, 0.12], lit: [0.20, 0.06] },
        crystalhoarder:   { variant: 'crystalhoarder', scale: 2.7, texturePool: 'crystal', bodyColor: 0x9a86c4, accent: 0xffd24a, hue: [0.74, 0.08], sat: [0.40, 0.12], lit: [0.55, 0.10], front: true },
        crystalsiren:     { variant: 'crystalsiren', scale: 2.7, texturePool: 'crystal', bodyColor: 0xf0a0d0, accent: 0xffe0ff, hue: [0.90, 0.06], sat: [0.55, 0.12], lit: [0.66, 0.08], front: true },
        emeraldstalker:   { variant: 'emeraldstalker', scale: 2.7, texturePool: 'crystal', bodyColor: 0x2aa05a, accent: 0xaaff66, hue: [0.38, 0.06], sat: [0.60, 0.12], lit: [0.42, 0.08], front: true },
        // Ophanim Ringlet (level 1-5, bespoke): one eyed wheel, a staring
        // central eye on spokes, three gyroscope rings and two tiny wings.
        lv_ophanimringlet: { variant: 'lv_ophanimringlet', scale: 2.0, texturePool: 'pale', bodyColor: 0xf0e2b0, accent: 0x3a8aff, hue: [0.12, 0.04], sat: [0.40, 0.12], lit: [0.72, 0.08], front: true }
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    class ExoticBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = EX_PROFILES[creatureType] || EX_PROFILES.crystalentity;
            super(scale, offsetY, battler, profile, 0, creatureType || 'crystalentity');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            // Upright/biped-topped exotics (gorgon, centaur) face front.
            if (this.variant === 'gorgon' || this.variant === 'centaur') this.facingYaw = 0;
            if (profile.front) this.facingYaw = 0;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'mineral':   this._buildMineral(); break;
                case 'bacterial': this._buildBacterial(); break;
                case 'gorgon':    this._buildGorgon(); break;
                case 'leviathan': this._buildLeviathan(); break;
                case 'ophanim':   this._buildOphanim(); break;
                case 'centaur':   this._buildCentaur(); break;
                case 'totemguardian': this._buildTotem(true); break;
                case 'toteminitiate': this._buildTotem(false); break;
                case 'cindermawhound': this._buildCindermaw(); break;
                case 'crystalhoarder': this._buildHoarder(); break;
                case 'crystalsiren':  this._buildSiren(); break;
                case 'emeraldstalker': this._buildStalker(); break;
                case 'lv_ophanimringlet': this._buildOphanimRinglet(); break;
                default:          this._buildCrystal(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(0xffe9c0, 1.0, 0.3));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil); parent.add(eye); return eye;
        }
        _shard(mat, x, y, z, h, rot) {
            const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, h, 5), mat);
            m.position.set(x, y, z); if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
            this.bodyGroup.add(m); return m;
        }

        // ── Crystal entity ────────────────────────────────────────────────────
        _buildCrystal() {
            const p = this.profile;
            const mat = this.applySkin(this._mat(p.bodyColor, 0.85, 0.25, p.bodyColor));
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), this._mat(p.accent, 0.95, 0.2, p.accent));
            this.core.position.set(0, 1.1, 0); this.bodyGroup.add(this.core);
            this.leftSpire = this._shard(mat, -0.45, 1.0, 0, 1.0, [0, 0, 0.5]);
            this.rightSpire = this._shard(mat, 0.45, 1.0, 0, 1.0, [0, 0, -0.5]);
            this.focusGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), this._mat(0xffffff, 0.95, 0.1, p.accent));
            this.focusGem.position.set(0, 1.7, 0.1); this.bodyGroup.add(this.focusGem);
            this.shieldCrystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), this._mat(p.bodyColor, 0.22, 0.2));
            this.shieldCrystal.position.set(0, 1.1, 0); this.bodyGroup.add(this.shieldCrystal);
            this._partMeshMap = { CORE: this.core, LEFT_SPIRE: this.leftSpire, RIGHT_SPIRE: this.rightSpire, FOCUS_GEM: this.focusGem, SHIELD_CRYSTAL: this.shieldCrystal };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.leftSpire, this.rightSpire, this.focusGem, this.shieldCrystal] },
                { gone: ['LEFT_SPIRE'], hide: [this.leftSpire] },
                { gone: ['RIGHT_SPIRE'], hide: [this.rightSpire] },
                { gone: ['FOCUS_GEM'], hide: [this.focusGem] },
                { gone: ['SHIELD_CRYSTAL'], hide: [this.shieldCrystal] },
            ];
        }

        // ── Mineral: a rocky boulder with crystal veins ───────────────────────
        _buildMineral() {
            const p = this.profile;
            const rockMat = this._skinMat(p.bodyColor, 0.95);
            this.shell = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), rockMat);
            this.shell.position.set(0, 0.9, 0); this.bodyGroup.add(this.shell);
            this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), this._mat(p.accent, 0.95, 0.2, p.accent));
            this.core.position.set(0, 0.9, 0); this.bodyGroup.add(this.core);
            this.crystals = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI;
                const c = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), this._mat(p.accent, 0.9, 0.2, p.accent));
                c.position.set(Math.sin(e) * Math.cos(a) * 0.6, 0.9 + Math.cos(e) * 0.6, Math.sin(e) * Math.sin(a) * 0.6);
                c.lookAt(c.position.clone().multiplyScalar(2)); c.rotateX(Math.PI / 2);
                this.crystals.add(c);
            }
            this.bodyGroup.add(this.crystals);
            this.veins = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 6, 16), this._mat(p.accent, 0.8, 0.3, p.accent));
            this.veins.position.set(0, 0.9, 0); this.veins.rotation.x = 1.0; this.bodyGroup.add(this.veins);
            this._partMeshMap = { CORE: this.core, SHELL: this.shell, CRYSTALS: this.crystals, VEINS: this.veins };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.shell, this.crystals, this.veins] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['CRYSTALS'], hide: [this.crystals] },
                { gone: ['VEINS'], hide: [this.veins] },
            ];
        }

        // ── Bacterial: a microbe (nucleus, membrane, flagellum, toxin sacs) ───
        _buildBacterial() {
            const p = this.profile;
            this.membrane = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 14), this.applySkin(this._mat(p.bodyColor, 0.45, 0.4)));
            this.membrane.position.set(0, 1.0, 0); this.membrane.scale.set(1.3, 1.0, 1.0);
            this.bodyGroup.add(this.membrane);
            this.nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), this._mat(p.accent, 0.95, 0.3, p.accent));
            this.nucleus.position.set(0, 1.0, 0); this.bodyGroup.add(this.nucleus);
            this.toxinSacs = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const a = this.idRand() * Math.PI * 2;
                const sac = new THREE.Mesh(new THREE.SphereGeometry(0.1 + this.idRand() * 0.05, 8, 8), this._mat(0x88ff44, 0.9, 0.3, 0x224400));
                sac.position.set(Math.cos(a) * 0.35, 1.0 + (this.idRand() - 0.5) * 0.4, Math.sin(a) * 0.3);
                this.toxinSacs.add(sac);
            }
            this.bodyGroup.add(this.toxinSacs);
            this.flagellum = new THREE.Group();
            const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, -0.3, -0.4), new THREE.Vector3(-0.1, -0.5, -0.8), new THREE.Vector3(0.05, -0.6, -1.2)]);
            this.flagellum.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.03, 5, false), this.applySkin(this._mat(p.bodyColor, 0.9, 0.5))));
            this.flagellum.position.set(-0.7, 1.0, 0);
            this.bodyGroup.add(this.flagellum);
            this._partMeshMap = { NUCLEUS: this.nucleus, MEMBRANE: this.membrane, FLAGELLUM: this.flagellum, TOXIN_SACS: this.toxinSacs };
            this._cascadeRules = [
                { gone: ['NUCLEUS'], hide: [this.nucleus, this.membrane, this.flagellum, this.toxinSacs] },
                { gone: ['MEMBRANE'], hide: [this.membrane] },
                { gone: ['FLAGELLUM'], hide: [this.flagellum] },
                { gone: ['TOXIN_SACS'], hide: [this.toxinSacs] },
            ];
        }

        // ── Gorgon: humanoid upper body, snake hair, serpent lower body ───────
        _buildGorgon() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.lowerBody = new THREE.Group();
            let py = 0.3, pz = 0;
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.34 - i * 0.04, 10, 10), mat); seg.position.set(Math.sin(i) * 0.15, py, pz); this.lowerBody.add(seg); py += 0.18; pz -= 0.05; }
            this.bodyGroup.add(this.lowerBody);
            this.upperBody = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 10), mat);
            this.upperBody.position.set(0, 1.5, 0); this.bodyGroup.add(this.upperBody);
            const headG = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), mat); headG.add(h);
            this.eyes = new THREE.Group();
            this.eyes.add(this._eye(headG, -0.1, 0.05, 0.22, 0.06, p.accent));
            this.eyes.add(this._eye(headG, 0.1, 0.05, 0.22, 0.06, p.accent));
            headG.add(this.eyes);
            headG.position.set(0, 1.95, 0); this.bodyGroup.add(headG);
            this._headG = headG;
            // Snake hair.
            this.snakeHair = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI - Math.PI / 2;
                const snake = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), this._mat(0x4a8a3a, 1.0, 0.5));
                snake.position.set(Math.sin(a) * 0.22, 2.18, Math.cos(a) * 0.12); snake.rotation.x = -0.3;
                this.snakeHair.add(snake);
            }
            this.bodyGroup.add(this.snakeHair);
            this._partMeshMap = { EYES: this.eyes, SNAKE_HAIR: this.snakeHair, UPPER_BODY: this.upperBody, LOWER_BODY: this.lowerBody };
            this._cascadeRules = [
                { gone: ['LOWER_BODY'], hide: [this.lowerBody, this.upperBody, headG, this.snakeHair] },
                { gone: ['UPPER_BODY'], hide: [this.upperBody, headG, this.snakeHair] },
                { gone: ['SNAKE_HAIR'], hide: [this.snakeHair] },
                { gone: ['EYES'], hide: [this.eyes] },
            ];
        }

        // ── Abyssal leviathan: huge eye + maw + dorsal plates + tentacles ─────
        _buildLeviathan() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.heartChamber = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 14), mat);
            this.heartChamber.position.set(0, 1.1, 0); this.heartChamber.scale.set(1.3, 1.0, 1.4);
            this.bodyGroup.add(this.heartChamber);
            this.eye = this._eye(this.bodyGroup, 0, 1.25, 0.7, 0.3, p.accent);
            this.maw = new THREE.Group();
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x050a14, 1.0, 0.5));
            mouth.position.set(0, 0, 0.5); mouth.rotation.x = -1.2; this.maw.add(mouth);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), this._mat(0xddeeff, 1.0, 0.3, p.accent)); tt.position.set(Math.cos(a) * 0.32, 0.8, 0.55 + Math.sin(a) * 0.1); tt.rotation.x = 1.5; this.maw.add(tt); }
            this.bodyGroup.add(this.maw);
            this.dorsalPlates = new THREE.Group();
            for (let i = 0; i < 5; i++) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), mat); pl.position.set(0, 1.6 + i * 0.02, -0.5 + i * 0.22); pl.scale.set(1, 1, 0.4); this.dorsalPlates.add(pl); }
            this.bodyGroup.add(this.dorsalPlates);
            this.tentacles = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                let py = 0.7;
                for (let s = 0; s < 5; s++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - s * 0.018, 8, 8), mat); seg.position.set(Math.cos(a) * (0.5 + s * 0.08), py, Math.sin(a) * (0.5 + s * 0.08)); this.tentacles.add(seg); py -= 0.16; }
            }
            this.bodyGroup.add(this.tentacles);
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsalPlates, TENTACLES: this.tentacles, HEART_CHAMBER: this.heartChamber };
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.heartChamber, this.eye, this.maw, this.dorsalPlates, this.tentacles] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['DORSAL_PLATES'], hide: [this.dorsalPlates] },
                { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Ophanim: four nested rings of eyes (a wheel angel) ────────────────
        _buildOphanim() {
            const p = this.profile;
            const ringMat = this.applySkin(this._mat(p.bodyColor, 0.9, 0.3, 0x332200));
            const wheels = [];
            for (let i = 0; i < 4; i++) {
                const w = new THREE.Mesh(new THREE.TorusGeometry(0.55 - i * 0.02, 0.06, 8, 24), ringMat);
                w.position.set(0, 1.2, 0);
                w.rotation.set(Math.PI / 2 * (i % 2), (i / 4) * Math.PI, i * 0.4);
                this.bodyGroup.add(w); wheels.push(w);
            }
            this.wheel1 = wheels[0]; this.wheel2 = wheels[1]; this.wheel3 = wheels[2]; this.wheel4 = wheels[3];
            this._wheels = wheels;
            this.eyeRing = new THREE.Group();
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this.eyeRing.add(this._eye(this.eyeRing, Math.cos(a) * 0.3, 1.2 + Math.sin(a) * 0.3, 0.1, 0.09, p.accent)); }
            this.bodyGroup.add(this.eyeRing);
            this._partMeshMap = { WHEEL_ONE: this.wheel1, WHEEL_TWO: this.wheel2, WHEEL_THREE: this.wheel3, WHEEL_FOUR: this.wheel4, EYE_RING: this.eyeRing };
            this._cascadeRules = [
                { gone: ['EYE_RING'], hide: [this.eyeRing, ...this._wheels] },
                { gone: ['WHEEL_ONE'], hide: [this.wheel1] },
                { gone: ['WHEEL_TWO'], hide: [this.wheel2] },
                { gone: ['WHEEL_THREE'], hide: [this.wheel3] },
                { gone: ['WHEEL_FOUR'], hide: [this.wheel4] },
            ];
        }

        // ── Ophanim Ringlet: the first wheel of a heavenly watcher ────────────
        // WHEEL_ONE is a thick gilded ring facing the viewer with a row of eyes
        // set into its face that blink in turn as it rolls; the EYE_RING is the
        // single great eye at the hub on four spokes, which never blinks;
        // WHEEL_TWO..FOUR are thin gyroscope hoops cutting through the main
        // ring at three tilts; MOUTH is a small lipped mouth on the low spoke.
        _buildOphanimRinglet() {
            const p = this.profile;
            const gold = this.applySkin(this._mat(p.bodyColor, 1.0, 0.3, 0x2a2008));
            const hub = V(0, 1.3, 0);
            this.wheel1 = new THREE.Group(); this.wheel1.position.copy(hub); this.bodyGroup.add(this.wheel1);
            this.wheel1.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.09, 6, 16), gold));
            this._rimEyes = [];
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2, e = this._eye(this.wheel1, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.08, 0.07, p.accent);
                this._rimEyes.push(e);
            }
            // The hub eye on its four spokes (not on the wheel, so it stays upright).
            this.eyeRing = new THREE.Group(); this.eyeRing.position.copy(hub); this.bodyGroup.add(this.eyeRing);
            for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i / 4) * Math.PI * 2; this.addStrut(this.eyeRing, gold, V(0, 0, 0), V(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0), 0.03, 0.02, 5); }
            const great = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), this._mat(0xfff8ea, 1, 0.2)); this.eyeRing.add(great);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this._mat(p.accent, 1, 0.2, p.accent)); iris.position.z = 0.13; iris.scale.z = 0.6; this.eyeRing.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), this._mat(0x05050a, 1, 0.2)); pupil.position.z = 0.175; pupil.scale.z = 0.5; this.eyeRing.add(pupil);
            this._greatIris = iris;
            // MOUTH: on a short drop below the hub eye.
            this.mouth = new THREE.Group(); this.mouth.position.set(0, 1.08, 0.04); this.bodyGroup.add(this.mouth);
            this.addStrut(this.mouth, gold, V(0, 0.12, -0.04), V(0, 0, 0), 0.025, 0.025, 4);
            const lips = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 4, 10), this._mat(0xc85a6a, 1, 0.5)); lips.scale.y = 0.45; lips.position.z = 0.02; this.mouth.add(lips);
            // Gyroscope hoops: radius set inside the main ring's tube so each
            // hoop passes through it wherever the two cross.
            const hoopMat = this._mat(p.bodyColor, 0.9, 0.25, 0x2a2008);
            const hoops = [];
            for (let i = 0; i < 3; i++) {
                const g = new THREE.Group(); g.position.copy(hub); g.rotation.set(0.4 + i * 0.9, i * 1.1, 0); this.bodyGroup.add(g);
                g.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 4, 20), hoopMat)); hoops.push(g);
            }
            this.wheel2 = hoops[0]; this.wheel3 = hoops[1]; this.wheel4 = hoops[2];
            // Two small feathered wings on the rim, the odd cherub touch.
            this._wings = [];
            for (const s of [-1, 1]) {
                const w = new THREE.Group(); w.position.set(hub.x + s * 0.56, hub.y + 0.05, -0.02); this.bodyGroup.add(w);
                for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3 - k * 0.04, 3), this._mat(0xffffff, 1, 0.6)); f.position.set(s * (0.1 + k * 0.03), 0.06 + k * 0.03, -0.01 * k); f.rotation.z = -s * (1.1 + k * 0.25); f.scale.z = 0.3; w.add(f); }
                w._side = s; this._wings.push(w);
            }
            this._wheels = [this.wheel1, ...hoops];
            this._partMeshMap = { WHEEL_ONE: this.wheel1, WHEEL_TWO: this.wheel2, WHEEL_THREE: this.wheel3, WHEEL_FOUR: this.wheel4, EYE_RING: this.eyeRing, MOUTH: this.mouth, CORE: this.eyeRing };
            this._cascadeRules = [
                { gone: ['EYE_RING', 'CORE'], hide: [this.eyeRing, this.mouth, ...this._wheels, ...this._wings] },
                { gone: ['WHEEL_ONE'], hide: [this.wheel1, ...this._wings] },
                { gone: ['WHEEL_TWO'], hide: [this.wheel2] },
                { gone: ['WHEEL_THREE'], hide: [this.wheel3] },
                { gone: ['WHEEL_FOUR'], hide: [this.wheel4] },
                { gone: ['MOUTH'], hide: [this.mouth] },
            ];
        }

        // ── Centaur: humanoid torso on a horse body ───────────────────────────
        _buildCentaur() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.7);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.2, 12), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 1.0, -0.2);
            this.bodyGroup.add(this.body);
            this.frontLeft = this._leg(mat, -0.24, 0.3); this.frontRight = this._leg(mat, 0.24, 0.3);
            this.rearLeft = this._leg(mat, -0.24, -0.65); this.rearRight = this._leg(mat, 0.24, -0.65);
            // Humanoid upper.
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.7, 10), mat);
            this.torso.position.set(0, 1.6, 0.35); this.bodyGroup.add(this.torso);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), mat); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.2, 0.05, 0x111111); this._eye(this.head, 0.1, 0.05, 0.2, 0.05, 0x111111);
            this.head.position.set(0, 2.05, 0.35); this.bodyGroup.add(this.head);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 8), mat);
            this.leftArm.position.set(-0.36, 1.6, 0.35); this.leftArm.rotation.z = -0.2; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.6, 8), mat);
            this.rightArm.position.set(0.36, 1.6, 0.35); this.rightArm.rotation.z = 0.2; this.bodyGroup.add(this.rightArm);
            this._partMeshMap = { BODY: this.body, TORSO: this.torso, HEAD: this.head, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.torso, this.head, this.leftArm, this.rightArm, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight] },
                { gone: ['TORSO'], hide: [this.torso, this.head, this.leftArm, this.rightArm] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }
        _leg(mat, x, z) {
            const g = new THREE.Group();
            const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.6, 8), mat); thigh.position.y = -0.3; g.add(thigh);
            const hoof = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), mat); hoof.position.y = -0.62; g.add(hoof);
            g.position.set(x, 0.95, z); this.bodyGroup.add(g); return g;
        }

        // ── Totem (guardian = stacked wooden faces; initiate = single stone) ──
        // Parts: CORE, LEFT_ARM, RIGHT_ARM, EYES, BASE.
        _buildTotem(guardian) {
            const p = this.profile;
            const woodMat = this._skinMat(p.bodyColor, guardian ? 0.85 : 0.55);
            const faceCount = guardian ? 3 : 1;
            const colW = guardian ? 0.42 : 0.34;
            this.core = new THREE.Group();
            this.eyes = new THREE.Group();
            const baseY = 0.55;
            const fh = guardian ? 0.5 : 0.55;
            for (let i = 0; i < faceCount; i++) {
                const fy = baseY + i * fh + fh * 0.5;
                // Carved face block: a rounded box (cylinder w/ many sides reads as carved log).
                const block = new THREE.Mesh(new THREE.CylinderGeometry(colW, colW * 0.94, fh, 8), woodMat);
                block.position.set(0, fy, 0); this.core.add(block);
                // Protruding carved snout/nose.
                const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), woodMat);
                nose.position.set(0, fy - 0.04, colW * 0.85); nose.rotation.x = Math.PI / 2; this.core.add(nose);
                // Carved brow ridge.
                const brow = new THREE.Mesh(new THREE.BoxGeometry(colW * 1.5, 0.08, 0.12), woodMat);
                brow.position.set(0, fy + fh * 0.28, colW * 0.7); this.core.add(brow);
                // Eyes (topmost face glows brightest).
                const eyeGlow = (i === faceCount - 1) ? p.accent : 0x000000;
                const er = guardian ? 0.07 : 0.08;
                this.eyes.add(this._eye(this.core, -colW * 0.45, fy + 0.06, colW * 0.78, er, eyeGlow || p.accent));
                this.eyes.add(this._eye(this.core, colW * 0.45, fy + 0.06, colW * 0.78, er, eyeGlow || p.accent));
            }
            this.bodyGroup.add(this.core);
            this.bodyGroup.add(this.eyes);
            // Stubby branch arms.
            const armY = baseY + fh * (guardian ? 1.0 : 0.5);
            this.leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.55, 6), woodMat);
            this.leftArm.position.set(-colW - 0.15, armY, 0); this.leftArm.rotation.z = 0.9; this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.55, 6), woodMat);
            this.rightArm.position.set(colW + 0.15, armY, 0); this.rightArm.rotation.z = -0.9; this.bodyGroup.add(this.rightArm);
            // Rooted base: a flared stump with splayed roots.
            this.base = new THREE.Group();
            const stump = new THREE.Mesh(new THREE.CylinderGeometry(colW * 1.05, colW * 1.3, baseY, 8), woodMat);
            stump.position.set(0, baseY * 0.5, 0); this.base.add(stump);
            const rootN = guardian ? 5 : 3;
            for (let i = 0; i < rootN; i++) {
                const a = (i / rootN) * Math.PI * 2;
                const root = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 5), woodMat);
                root.position.set(Math.cos(a) * colW * 1.1, 0.06, Math.sin(a) * colW * 1.1);
                root.rotation.set(Math.PI * 0.6, 0, -a); this.base.add(root);
            }
            this.bodyGroup.add(this.base);
            this._partMeshMap = { CORE: this.core, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm, EYES: this.eyes, BASE: this.base };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.leftArm, this.rightArm, this.eyes, this.base] },
                { gone: ['BASE'], hide: [this.base, this.core, this.leftArm, this.rightArm, this.eyes] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
                { gone: ['EYES'], hide: [this.eyes] },
            ];
        }

        // ── Cindermaw Hound: quadruped, spiked collar, ember maw ──────────────
        // Parts: HEAD, COLLAR, BODY, LEFT_LEG, RIGHT_LEG, HIND_LEFT_LEG, HIND_RIGHT_LEG.
        _buildCindermaw() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.85);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.1, 10), mat);
            this.body.rotation.x = Math.PI / 2; this.body.position.set(0, 0.9, 0);
            this.bodyGroup.add(this.body);
            // Glowing ember cracks down the back.
            for (let i = 0; i < 4; i++) {
                const crack = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 1.0, 0.3, p.accent));
                crack.position.set(0, 1.18, 0.4 - i * 0.26); this.body.add(crack);
            }
            // Head with smouldering maw.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat);
            skull.scale.set(0.9, 0.85, 1.2); this.head.add(skull);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.32, 8), mat);
            snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.28); this.head.add(snout);
            // Ember maw glow inside the snout + spark particles.
            const maw = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this._mat(0xff3300, 0.95, 0.3, 0xff5522));
            maw.position.set(0, -0.04, 0.42); this.head.add(maw);
            this.emberSparks = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const sp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 5), this._mat(p.accent, 0.9, 0.2, p.accent));
                sp.position.set((this.idRand() - 0.5) * 0.18, -0.02 + this.idRand() * 0.12, 0.46 + this.idRand() * 0.1);
                this.emberSparks.add(sp);
            }
            this.head.add(this.emberSparks);
            this._eye(this.head, -0.12, 0.08, 0.2, 0.05, p.accent);
            this._eye(this.head, 0.12, 0.08, 0.2, 0.05, p.accent);
            this.head.position.set(0, 1.15, 0.55); this.bodyGroup.add(this.head);
            // Spiked collar.
            this.collar = new THREE.Group();
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 6, 14), this._mat(0x222222, 1.0, 0.5));
            band.rotation.x = 0.4; this.collar.add(band);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), this._mat(0x999999, 1.0, 0.3));
                spike.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
                spike.lookAt(spike.position.clone().multiplyScalar(2)); spike.rotateX(Math.PI / 2);
                this.collar.add(spike);
            }
            this.collar.position.set(0, 1.0, 0.32); this.bodyGroup.add(this.collar);
            // Legs.
            this.frontLeft = this._houndLeg(mat, -0.2, 0.42); this.frontRight = this._houndLeg(mat, 0.2, 0.42);
            this.hindLeft = this._houndLeg(mat, -0.2, -0.42); this.hindRight = this._houndLeg(mat, 0.2, -0.42);
            // Smoke tail.
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), this._mat(p.accent, 0.6, 0.4, p.accent));
            tail.position.set(0, 1.0, -0.65); tail.rotation.x = -0.8; this.body.add ? this.bodyGroup.add(tail) : null;
            this._partMeshMap = { HEAD: this.head, COLLAR: this.collar, BODY: this.body, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, HIND_LEFT_LEG: this.hindLeft, HIND_RIGHT_LEG: this.hindRight };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.collar, this.frontLeft, this.frontRight, this.hindLeft, this.hindRight] },
                { gone: ['HEAD'], hide: [this.head, this.collar] },
                { gone: ['COLLAR'], hide: [this.collar] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['HIND_LEFT_LEG'], hide: [this.hindLeft] },
                { gone: ['HIND_RIGHT_LEG'], hide: [this.hindRight] },
            ];
        }
        _houndLeg(mat, x, z) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 6), mat); upper.position.y = -0.25; g.add(upper);
            const paw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mat); paw.position.y = -0.52; g.add(paw);
            g.position.set(x, 0.85, z); this.bodyGroup.add(g); return g;
        }

        // ── Crystal Hoarder: crystal body studded with coins/gems, twin spires ─
        // Parts: CORE, LEFT_SPIRE, RIGHT_SPIRE, FOCUS_GEM, SHIELD_CRYSTAL.
        _buildHoarder() {
            const p = this.profile;
            const crystalMat = this.applySkin(this._mat(p.bodyColor, 0.8, 0.2, p.bodyColor));
            // Lumpy hoard body.
            this.core = new THREE.Group();
            const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), crystalMat);
            body.position.set(0, 1.0, 0); this.core.add(body);
            // Embedded gold coins + gem loot all over.
            const coinMat = this._mat(0xffcc33, 1.0, 0.25, 0x553300);
            for (let i = 0; i < 9; i++) {
                const a = this.idRand() * Math.PI * 2, e = this.idRand() * Math.PI;
                const isGem = this.idRand() > 0.6;
                const loot = isGem
                    ? new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), this._mat([0xff4488, 0x44ff88, 0x4488ff][i % 3], 0.95, 0.15, 0x222222))
                    : new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), coinMat);
                const rr = 0.5;
                loot.position.set(Math.sin(e) * Math.cos(a) * rr, 1.0 + Math.cos(e) * rr, Math.sin(e) * Math.sin(a) * rr);
                loot.lookAt(loot.position.clone().multiplyScalar(2));
                this.core.add(loot);
            }
            this.bodyGroup.add(this.core);
            // Twin blunt shoulder spires.
            this.leftSpire = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), crystalMat);
            this.leftSpire.position.set(-0.5, 1.4, 0); this.leftSpire.rotation.z = 0.5; this.bodyGroup.add(this.leftSpire);
            this.rightSpire = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), crystalMat);
            this.rightSpire.position.set(0.5, 1.4, 0); this.rightSpire.rotation.z = -0.5; this.bodyGroup.add(this.rightSpire);
            // Focus gem: a big golden treasure octahedron.
            this.focusGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), this._mat(p.accent, 0.95, 0.15, p.accent));
            this.focusGem.position.set(0, 1.0, 0.55); this.bodyGroup.add(this.focusGem);
            // Shield crystal: translucent shell.
            this.shieldCrystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), this._mat(p.bodyColor, 0.2, 0.2));
            this.shieldCrystal.position.set(0, 1.0, 0); this.bodyGroup.add(this.shieldCrystal);
            this._wireCrystal();
        }

        // ── Crystal Siren: graceful pink figure, chime spires, focus gem ──────
        _buildSiren() {
            const p = this.profile;
            const crystalMat = this.applySkin(this._mat(p.bodyColor, 0.7, 0.15, p.bodyColor));
            // Elegant tapered figure (torso + head).
            this.core = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.4, 1.3, 8), crystalMat);
            torso.position.set(0, 0.95, 0); this.core.add(torso);
            const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), crystalMat);
            head.position.set(0, 1.75, 0); head.scale.set(0.8, 1.2, 0.8); this.core.add(head);
            // Glowing facial focus (siren's lure) on the head.
            const lure = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 1.0, 0.2, p.accent));
            lure.position.set(0, 1.72, 0.16); this.core.add(lure);
            this.bodyGroup.add(this.core);
            // Resonating chime-spires: thin tall paired rods that flank like wings.
            this.leftSpire = new THREE.Group();
            this.rightSpire = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const len = 0.8 - i * 0.18;
                const lc = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, len, 6), crystalMat);
                lc.position.set(-0.4 - i * 0.12, 1.3, -0.1); lc.rotation.z = 0.3 + i * 0.12; this.leftSpire.add(lc);
                const rc = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, len, 6), crystalMat);
                rc.position.set(0.4 + i * 0.12, 1.3, -0.1); rc.rotation.z = -0.3 - i * 0.12; this.rightSpire.add(rc);
            }
            this.bodyGroup.add(this.leftSpire); this.bodyGroup.add(this.rightSpire);
            // Focus gem: glowing heart-gem at chest.
            this.focusGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), this._mat(p.accent, 0.95, 0.1, p.accent));
            this.focusGem.position.set(0, 1.15, 0.32); this.bodyGroup.add(this.focusGem);
            // Shield crystal: soft aura.
            this.shieldCrystal = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), this._mat(p.bodyColor, 0.16, 0.2));
            this.shieldCrystal.position.set(0, 1.1, 0); this.bodyGroup.add(this.shieldCrystal);
            this._wireCrystal();
        }

        // ── Emerald Stalker: green predator, forward blade spires, fanged gem ─
        _buildStalker() {
            const p = this.profile;
            const crystalMat = this.applySkin(this._mat(p.bodyColor, 0.55, 0.12, p.bodyColor));
            // Crouched angular predator core.
            this.core = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
            torso.position.set(0, 1.0, 0); torso.scale.set(1.0, 0.8, 1.4); this.core.add(torso);
            // Faceted forward head.
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 5), crystalMat);
            head.position.set(0, 1.05, 0.5); head.rotation.x = Math.PI / 2; this.core.add(head);
            this.bodyGroup.add(this.core);
            // Forward-swept blade spires (sharp, aimed ahead).
            this.leftSpire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.95, 4), crystalMat);
            this.leftSpire.position.set(-0.4, 1.35, 0.15); this.leftSpire.rotation.set(-1.1, 0, 0.4); this.bodyGroup.add(this.leftSpire);
            this.rightSpire = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.95, 4), crystalMat);
            this.rightSpire.position.set(0.4, 1.35, 0.15); this.rightSpire.rotation.set(-1.1, 0, -0.4); this.bodyGroup.add(this.rightSpire);
            // Fanged focus gem: a glowing maw of small fang-cones around a gem.
            this.focusGem = new THREE.Group();
            const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), this._mat(p.accent, 0.95, 0.1, p.accent));
            this.focusGem.add(gem);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xeeffee, 1.0, 0.2, 0x113311));
                fang.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.04);
                fang.lookAt(fang.position.clone().multiplyScalar(2)); fang.rotateX(Math.PI / 2);
                this.focusGem.add(fang);
            }
            this.focusGem.position.set(0, 1.05, 0.75); this.bodyGroup.add(this.focusGem);
            // Shield crystal: jagged predatory shell.
            this.shieldCrystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 0), this._mat(p.bodyColor, 0.18, 0.2));
            this.shieldCrystal.position.set(0, 1.0, 0); this.bodyGroup.add(this.shieldCrystal);
            this._wireCrystal();
        }

        // Shared rig wiring for the spire-class crystal bodies.
        _wireCrystal() {
            this._partMeshMap = { CORE: this.core, LEFT_SPIRE: this.leftSpire, RIGHT_SPIRE: this.rightSpire, FOCUS_GEM: this.focusGem, SHIELD_CRYSTAL: this.shieldCrystal };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.leftSpire, this.rightSpire, this.focusGem, this.shieldCrystal] },
                { gone: ['LEFT_SPIRE'], hide: [this.leftSpire] },
                { gone: ['RIGHT_SPIRE'], hide: [this.rightSpire] },
                { gone: ['FOCUS_GEM'], hide: [this.focusGem] },
                { gone: ['SHIELD_CRYSTAL'], hide: [this.shieldCrystal] },
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
            // Four-legged models only stride while really travelling (overworld
            // walk) or lunging on an attack; standing in battle they keep still.
            const stride = this.strideMul(fast);
            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.14 : 0;
            this.model.rotation.z = hitJolt;
            this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;

            switch (this.variant) {
                case 'crystal':
                case 'mineral': {
                    if (this.core) this.core.rotation.y = t * 0.8;
                    if (this.shieldCrystal) this.shieldCrystal.rotation.y = -t * 0.4;
                    if (this.crystals) this.crystals.rotation.y = t * 0.3;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4;
                    break;
                }
                case 'bacterial': {
                    if (this.membrane) { const s = 1.0 + Math.sin(t * 2.5) * 0.06; this.membrane.scale.set(1.3 * s, 1.0 / s, 1.0 * s); }
                    if (this.flagellum) this.flagellum.rotation.z = Math.sin(t * (fast ? 14 : 8)) * 0.4;
                    if (this.nucleus) this.nucleus.position.x = Math.sin(t * 1.5) * 0.08;
                    break;
                }
                case 'gorgon': {
                    if (this.snakeHair) this.snakeHair.children.forEach((s, i) => s.rotation.z = Math.sin(t * 3 + i) * 0.25);
                    if (this._headG) this._headG.rotation.y = Math.sin(t * 1.2) * 0.2;
                    break;
                }
                case 'leviathan': {
                    if (this.tentacles) this.tentacles.children.forEach((s, i) => { s.position.y += Math.sin(t * 3 + i * 0.3) * 0.003; });
                    if (this.eye) this.eye.scale.y = 1.0 - Math.pow(Math.max(0, Math.sin(t * 0.3 * Math.PI * 2)), 14) * 0.9;
                    break;
                }
                case 'ophanim': {
                    if (this._wheels) this._wheels.forEach((w, i) => { w.rotation.z += (i % 2 ? 0.02 : -0.02) * (fast ? 2 : 1); });
                    if (this.eyeRing) this.eyeRing.rotation.z = t * 0.5;
                    break;
                }
                case 'lv_ophanimringlet': {
                    // The wheel rolls, the rim eyes blink one after another, the
                    // hoops spin, and the great eye never looks away.
                    if (this.wheel1) this.wheel1.rotation.z = t * (fast ? 2.4 : 0.6);
                    if (this._rimEyes) this._rimEyes.forEach((e, i) => { const ph = (t * 1.6 - i * 0.35) % 3.5; e.scale.y = (ph > 0 && ph < 0.18) ? 0.15 : 1; });
                    [this.wheel2, this.wheel3, this.wheel4].forEach((h, i) => { if (h) h.rotation.z = t * (i % 2 ? -1 : 1) * (fast ? 3 : 1.1); });
                    if (this._wings) this._wings.forEach(w => { w.rotation.z = w._side * Math.sin(t * (fast ? 14 : 6)) * 0.25; });
                    if (this._greatIris && this._greatIris.material) this._greatIris.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2)) * 0.5;
                    break;
                }
                case 'centaur': {
                    const gait = fast ? 8 : 2.4;
                    [this.frontLeft, this.rearRight].forEach(l => { if (l) l.rotation.x = Math.sin(t * gait) * 0.2 * stride; });
                    [this.frontRight, this.rearLeft].forEach(l => { if (l) l.rotation.x = Math.sin(t * gait + Math.PI) * 0.2 * stride; });
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.6) * 0.05;
                    break;
                }
                case 'totemguardian':
                case 'toteminitiate': {
                    if (this.eyes) this.eyes.children.forEach(e => { if (e.material) e.material.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.3; });
                    if (this.leftArm) this.leftArm.rotation.z = 0.9 + Math.sin(t * 1.5) * 0.06;
                    if (this.rightArm) this.rightArm.rotation.z = -0.9 - Math.sin(t * 1.5) * 0.06;
                    break;
                }
                case 'cindermawhound': {
                    const gait = fast ? 9 : 3;
                    [this.frontLeft, this.hindRight].forEach(l => { if (l) l.rotation.x = Math.sin(t * gait) * 0.25 * stride; });
                    [this.frontRight, this.hindLeft].forEach(l => { if (l) l.rotation.x = Math.sin(t * gait + Math.PI) * 0.25 * stride; });
                    if (this.emberSparks) this.emberSparks.children.forEach((s, i) => { s.position.y += Math.sin(t * 6 + i) * 0.004; if (s.material) s.material.emissiveIntensity = 0.5 + Math.sin(t * 8 + i) * 0.4; });
                    if (this.head) this.head.rotation.x = Math.sin(t * 1.3) * 0.06;
                    break;
                }
                case 'crystalhoarder':
                case 'crystalsiren':
                case 'emeraldstalker': {
                    if (this.core) this.core.rotation.y = Math.sin(t * (fast ? 3 : 1.0)) * 0.12;
                    if (this.shieldCrystal) this.shieldCrystal.rotation.y = t * 0.3;
                    if (this.focusGem) { this.focusGem.rotation.y = t * 1.2; if (this.focusGem.material) this.focusGem.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4; }
                    if (this.variant === 'crystalsiren' && this.leftSpire && this.rightSpire) {
                        this.leftSpire.rotation.y = Math.sin(t * 2) * 0.1;
                        this.rightSpire.rotation.y = -Math.sin(t * 2) * 0.1;
                    }
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.4 * this.scale;
            this.model.rotation.z = prog * (this.variant === 'centaur' ? 1.2 : 0.6);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ExoticBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = EX_PROFILES;
    reg('crystalentity',    { aliases: ['crystalentity', 'crystal', 'crystals', 'gem', 'shard'], scale: S.crystalentity.scale, weapon: 0, create: make });
    reg('mineral',          { aliases: ['mineral', 'minerals', 'rock', 'boulder', 'ore'], scale: S.mineral.scale, weapon: 0, create: make });
    reg('bacterial',        { aliases: ['bacterial', 'bacteria', 'microbe', 'germ', 'virus', 'amoeba'], scale: S.bacterial.scale, weapon: 0, create: make });
    reg('gorgon',           { aliases: ['gorgon', 'gorgons', 'medusa'], scale: S.gorgon.scale, weapon: 0, create: make });
    // abyssalleviathan is canonically registered by 3DBattler_Aquatic.js (which loads first).
    // Its unique 'leviathan' alias is preserved there; 'behemoth' is owned by the colossus
    // archetype (3DBattler_Bosses.js), so registering it here would only shadow both.
    reg('ophanim',          { aliases: ['ophanim', 'ophan', 'thronebearer'], scale: S.ophanim.scale, weapon: 0, create: make });
    reg('centaur',          { aliases: ['centaur', 'centaurs'], scale: S.centaur.scale, weapon: 0, create: make });
    reg('lv_ophanimringlet', { aliases: ['lv_ophanimringlet'], scale: S.lv_ophanimringlet.scale, weapon: 0, create: make });

    // Exact-name pins (also parsed by scripts/gen_3d_models_doc.js).
    const NAMED = {
        lv_ophanimringlet: ["Ophanim Ringlet"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Exotic family registered');

    ;[['u_archangelmortifier',2.8]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
