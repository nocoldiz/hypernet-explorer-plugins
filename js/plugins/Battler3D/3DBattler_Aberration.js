//=============================================================================
// 3D Battler System - Aberration Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Oddball boneless procedural 3D battlers: chest mimics, eyes,
 * tentacles, totems and mutant masses. Requires 3DBattlerSystem (core) first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Aberration Family
 * ============================================================================
 *
 * A grab-bag of non-standard body plans (no physics) that each build their own
 * geometry but share the part-losing engine from window.Battler3D.Base. Body
 * size/shape, colour and (where used) texture vary per monster id.
 *
 * Registered archetypes:
 *   ChestMimic        (CORE, LID, TEETH, TONGUE, FEET)        - a treasure mimic
 *   TentacledCreature (EYE, TENTACLE_ONE, TENTACLE_TWO, BODY) - floating eye
 *   Voidspawn         (ABYSSAL_EYE, MAW, VOID_TENDRIL_1/2, CORE)
 *   TrashCreature     (TRASH_PILE, LIMBS, EYES, HEART)
 *   Totem             (CORE, LEFT_ARM, RIGHT_ARM, EYES, BASE)
 *   SpikyMonster      (SPIKES, BODY, EYES, LEFT_LEG, RIGHT_LEG)
 *   Mutant            (HEAD, MASS, EXTRA_LIMB_1, EXTRA_LIMB_2, EYE_CLUSTER, TAIL_SPIKE)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Aberration] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const ABERRATION_PROFILES = {
        chestmimic:        { variant: 'chestmimic', scale: 2.2, texturePool: 'wood', wood: 0x6b4a2b, accent: 0xc0392b, hue: [0.08, 0.04], sat: [0.45, 0.15], lit: [0.35, 0.10] },
        tentacledcreature: { variant: 'tentacled', scale: 2.2, texturePool: 'crystal', bodyColor: 0x7a3b8a, accent: 0xffd24a, hue: [0.78, 0.10], sat: [0.45, 0.15], lit: [0.40, 0.10] },
        voidspawn:         { variant: 'voidspawn', scale: 2.4, texturePool: 'void', bodyColor: 0x1a1030, accent: 0x9b40ff, hue: [0.74, 0.06], sat: [0.55, 0.15], lit: [0.16, 0.06] },
        trashcreature:     { variant: 'trash', scale: 2.3, texturePool: 'stone', bodyColor: 0x5a5040, accent: 0x66dd55, hue: [0.18, 0.08], sat: [0.20, 0.12], lit: [0.34, 0.10] },
        totem:             { variant: 'totem', scale: 2.8, texturePool: 'wood', wood: 0x7a5630, accent: 0x33ddaa, hue: [0.08, 0.04], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        spikymonster:      { variant: 'spiky', scale: 2.1, texturePool: 'stone', bodyColor: 0x3a4a5a, accent: 0xff5522, hue: [0.58, 0.10], sat: [0.35, 0.15], lit: [0.32, 0.10] },
        mutant:            { variant: 'mutant', scale: 2.5, texturePool: 'flesh', bodyColor: 0x8a6f7a, accent: 0xaaff33, hue: [0.92, 0.10], sat: [0.30, 0.15], lit: [0.42, 0.10] },
        floatingeye:       { variant: 'floatingeye', scale: 2.2, texturePool: 'flesh', bodyColor: 0x8cc06a, accent: 0xe433ff, front: true, hue: [0.98, 0.06], sat: [0.40, 0.15], lit: [0.46, 0.10] },
        nervoussystem:     { variant: 'nervoussystem', scale: 2.4, texturePool: 'flesh', bodyColor: 0xe0c0c8, accent: 0x55ffd0, front: true, hue: [0.95, 0.05], sat: [0.30, 0.12], lit: [0.50, 0.10] },
        realitybender:     { variant: 'realitybender', scale: 2.6, texturePool: 'void', bodyColor: 0x14102a, accent: 0xff40d0, front: true, hue: [0.80, 0.10], sat: [0.55, 0.15], lit: [0.18, 0.06] },
        recursiveparadox:  { variant: 'recursiveparadox', scale: 2.6, texturePool: 'void', bodyColor: 0x101830, accent: 0x40e0ff, front: true, hue: [0.58, 0.08], sat: [0.55, 0.15], lit: [0.20, 0.06] },
        sentientmeme:      { variant: 'sentientmeme', scale: 2.4, texturePool: 'void', bodyColor: 0x2a1840, accent: 0xffe040, front: true, hue: [0.82, 0.08], sat: [0.60, 0.15], lit: [0.30, 0.10] },
        shoggoth:          { variant: 'shoggoth', scale: 2.7, texturePool: 'void', bodyColor: 0x0c0c12, accent: 0xffffff, front: true, hue: [0.66, 0.06], sat: [0.20, 0.10], lit: [0.10, 0.05] },
        voidmanipulator:   { variant: 'voidmanipulator', scale: 2.6, texturePool: 'void', bodyColor: 0x141022, accent: 0xb060ff, front: true, hue: [0.76, 0.08], sat: [0.55, 0.15], lit: [0.16, 0.06] },
        advertisementbadger: { variant: 'advertisementbadger', scale: 2.4, texturePool: 'void', bodyColor: 0xd83020, accent: 0xffe020, front: true, hue: [0.02, 0.08], sat: [0.70, 0.15], lit: [0.45, 0.10] },
        livingtheorem:     { variant: 'livingtheorem', scale: 2.5, texturePool: 'void', bodyColor: 0x0a1426, accent: 0x40ffd0, front: true, hue: [0.50, 0.08], sat: [0.55, 0.15], lit: [0.14, 0.06] },
        leylineaneurysm:   { variant: 'leylineaneurysm', scale: 2.5, texturePool: 'void', bodyColor: 0x2a0a30, accent: 0xff40a0, front: true, hue: [0.88, 0.08], sat: [0.55, 0.15], lit: [0.20, 0.08] },
        timeloopstalker:   { variant: 'timeloopstalker', scale: 2.6, texturePool: 'void', bodyColor: 0x101822, accent: 0x60d0ff, front: true, hue: [0.56, 0.08], sat: [0.45, 0.15], lit: [0.18, 0.06] },
        u_eyeballslug:     { variant: 'eyeballslug', scale: 2.2, texturePool: 'flesh', bodyColor: 0x7a8a4a, accent: 0xffe14a, front: true, hue: [0.24, 0.08], sat: [0.38, 0.14], lit: [0.40, 0.10] },
        // Level 1-5 starters, each on its own builder (no shared rig).
        lv_gardenslug:     { variant: 'lv_gardenslug',    scale: 1.9, texturePool: 'flesh', bodyColor: 0x9a6a32, accent: 0xd8e0e8, hue: [0.08, 0.04], sat: [0.45, 0.10], lit: [0.40, 0.08] },
        lv_ditchleech:     { variant: 'lv_ditchleech',    scale: 1.9, texturePool: 'void',  bodyColor: 0x22221a, accent: 0xc82030, hue: [0.15, 0.05], sat: [0.15, 0.08], lit: [0.14, 0.05] },
        lv_nosypeeper:     { variant: 'lv_nosypeeper',    scale: 2.0, texturePool: 'flesh', bodyColor: 0xc89080, accent: 0x3a7ad8, hue: [0.03, 0.04], sat: [0.35, 0.10], lit: [0.56, 0.08] },
        lv_staplermimic:   { variant: 'lv_staplermimic',  scale: 1.9, texturePool: 'metal', bodyColor: 0x6a6e74, accent: 0xc02020, hue: [0.58, 0.04], sat: [0.06, 0.04], lit: [0.44, 0.08] },
        lv_lostdollhead:   { variant: 'lv_lostdollhead',  scale: 1.9, texturePool: 'pale',  bodyColor: 0xf0e6dc, accent: 0x5a8ad8, hue: [0.07, 0.03], sat: [0.20, 0.06], lit: [0.86, 0.05] },
        lv_littercritter:  { variant: 'lv_littercritter', scale: 1.9, texturePool: 'stone', bodyColor: 0x26262c, accent: 0x9ae040, hue: [0.66, 0.04], sat: [0.06, 0.04], lit: [0.16, 0.05] }
    };

    class AberrationBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = ABERRATION_PROFILES[creatureType] || ABERRATION_PROFILES.chestmimic;
            super(scale, offsetY, battler, profile, 0, creatureType || 'chestmimic');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'tentacled': this._buildTentacled(); break;
                case 'voidspawn': this._buildVoidspawn(); break;
                case 'trash':     this._buildTrash(); break;
                case 'totem':     this._buildTotem(); break;
                case 'spiky':     this._buildSpiky(); break;
                case 'mutant':    this._buildMutant(); break;
                case 'floatingeye':      this._buildFloatingEye(); break;
                case 'nervoussystem':    this._buildNervousSystem(); break;
                case 'realitybender':    this._buildRealityBender(); break;
                case 'recursiveparadox': this._buildRecursiveParadox(); break;
                case 'sentientmeme':     this._buildSentientMeme(); break;
                case 'shoggoth':         this._buildShoggoth(); break;
                case 'voidmanipulator':     this._buildVoidManipulator(); break;
                case 'advertisementbadger': this._buildAdvertisementBadger(); break;
                case 'livingtheorem':       this._buildLivingTheorem(); break;
                case 'leylineaneurysm':     this._buildLeylineAneurysm(); break;
                case 'timeloopstalker':     this._buildTimeLoopStalker(); break;
                case 'eyeballslug':         this._buildEyeballSlug(); break;
                case 'lv_gardenslug':       this._buildLvGardenSlug(); break;
                case 'lv_ditchleech':       this._buildLvDitchLeech(); break;
                case 'lv_nosypeeper':       this._buildLvNosyPeeper(); break;
                case 'lv_staplermimic':     this._buildLvStaplerMimic(); break;
                case 'lv_lostdollhead':     this._buildLvLostDollHead(); break;
                case 'lv_littercritter':    this._buildLvLitterCritter(); break;
                default:          this._buildChestMimic(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
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

        _eye(parent, x, y, z, r, accent) {
            const white = this._mat(0xffe9c0, 1.0, 0.3);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), white);
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7);
            eye.add(pupil);
            parent.add(eye);
            return eye;
        }

        // ── Chest mimic: a fanged treasure chest with little feet ────────────
        _buildChestMimic() {
            const p = this.profile;
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const woodMat = new THREE.MeshStandardMaterial({ color: p.wood, map: skin, roughness: 0.85, transparent: true });
            this._materials.push(woodMat);
            const goldMat = this._mat(0xd4af37, 1.0, 0.3);
            const mouthMat = this._mat(0x2a0a0a, 1.0, 0.6);

            // Core chest box + gold trim.
            this.core = new THREE.Group();
            const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.7), woodMat);
            box.position.y = 0.5; this.core.add(box);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.3, 0.62), mouthMat);
            mouth.position.y = 0.78; this.core.add(mouth);
            for (const yy of [0.22, 0.78]) {
                const trim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.72), goldMat);
                trim.position.y = yy; this.core.add(trim);
            }
            this.bodyGroup.add(this.core);

            // Lid (hinged at the back, opens upward) + teeth on its rim.
            this.lid = new THREE.Group();
            const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.7), woodMat);
            lidBox.position.set(0, 0.09, 0.35); this.lid.add(lidBox);
            const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.07, 0.72), goldMat);
            lidTrim.position.set(0, 0.02, 0.35); this.lid.add(lidTrim);
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xf2efe0, 1.0, 0.4);
            for (let i = 0; i < 7; i++) {
                const tx = -0.42 + i * 0.14;
                const tUp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat);
                tUp.position.set(tx, -0.02, 0.66); tUp.rotation.x = Math.PI; this.teeth.add(tUp);
                const tDn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat);
                tDn.position.set(tx, 0.0, 0.66); this.core.add(tDn); tDn.position.y = 0.0;
            }
            this.lid.add(this.teeth);
            this.lid.position.set(0, 0.92, -0.35); // hinge at the back
            this.bodyGroup.add(this.lid);
            this._eye(this.lid, -0.25, 0.16, 0.2, 0.1, p.accent);
            this._eye(this.lid, 0.25, 0.16, 0.2, 0.1, p.accent);

            // Tongue lolling out of the mouth.
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.5), this._mat(p.accent, 1.0, 0.5));
            this.tongue.position.set(0, 0.74, 0.5); this.tongue.rotation.x = 0.3;
            this.bodyGroup.add(this.tongue);

            // Stubby feet.
            this.feet = new THREE.Group();
            const footMat = this._mat(0x3a2a1a, 1.0, 0.8);
            for (const fx of [-0.32, 0.32]) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.34), footMat);
                foot.position.set(fx, 0.09, 0.08); this.feet.add(foot);
            }
            this.bodyGroup.add(this.feet);

            this._partMeshMap = { CORE: this.core, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.lid, this.teeth, this.tongue, this.feet] },
                { gone: ['LID'],  hide: [this.lid, this.teeth] },
                { gone: ['TEETH'], hide: [this.teeth] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['FEET'], hide: [this.feet] },
            ];
        }

        // ── Floating eye with two tentacles ──────────────────────────────────
        _buildTentacled() {
            const p = this.profile;
            const bodyMat = this.applySkin(this._mat(p.bodyColor, 0.95, 0.5));
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), bodyMat);
            this.body.position.y = 1.05; this.body.scale.set(1.0, 0.9, 1.0);
            this.bodyGroup.add(this.body);
            this.eyeball = this._eye(this.bodyGroup, 0, 1.05, 0.42, 0.26, p.accent);

            this.t1 = this._tentacle(-0.28, p.bodyColor); this.bodyGroup.add(this.t1);
            this.t2 = this._tentacle(0.28, p.bodyColor); this.bodyGroup.add(this.t2);

            this._partMeshMap = { BODY: this.body, EYE: this.eyeball, TENTACLE_ONE: this.t1, TENTACLE_TWO: this.t2 };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.eyeball, this.t1, this.t2] },
                { gone: ['EYE'], hide: [this.eyeball] },
                { gone: ['TENTACLE_ONE'], hide: [this.t1] },
                { gone: ['TENTACLE_TWO'], hide: [this.t2] },
            ];
        }

        _tentacle(x, color) {
            const g = new THREE.Group();
            const mat = this._mat(color, 0.95, 0.6);
            let py = 0.6;
            for (let i = 0; i < 4; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12 - i * 0.02, 8, 8), mat);
                seg.position.set(0, py, 0); g.add(seg);
                py -= 0.18;
            }
            g.position.set(x, 0.7, 0.1);
            g._segCount = 4;
            return g;
        }

        // ── Voidspawn: dark orb with a great eye, a maw and tendrils ──────────
        _buildVoidspawn() {
            const p = this.profile;
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), this.applySkin(this._mat(p.bodyColor, 0.92, 0.4, 0x1a0033)));
            this.core.position.y = 1.05;
            this.bodyGroup.add(this.core);
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.15, 0.44, 0.22, p.accent);

            // Maw: a ring of jagged teeth around a dark opening at the bottom.
            this.maw = new THREE.Group();
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), this._mat(0x050008, 1.0, 0.5));
            this.maw.add(mouth);
            const toothMat = this._mat(0xddd0ff, 1.0, 0.4, p.accent);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), toothMat);
                t.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24);
                t.rotation.x = Math.cos(a) * 0.5; t.rotation.z = -Math.sin(a) * 0.5;
                this.maw.add(t);
            }
            this.maw.position.set(0, 0.72, 0.2);
            this.bodyGroup.add(this.maw);

            this.tendril1 = this._tentacle(-0.34, p.bodyColor); this.bodyGroup.add(this.tendril1);
            this.tendril2 = this._tentacle(0.34, p.bodyColor); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Trash creature: a heap of junk with a glowing heart ──────────────
        _buildTrash() {
            const p = this.profile;
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const junkMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: skin, roughness: 1.0, transparent: true });
            this._materials.push(junkMat);

            this.trashPile = new THREE.Group();
            const lumps = [[0, 0.5, 0, 0.5], [-0.35, 0.35, 0.1, 0.32], [0.32, 0.4, -0.1, 0.34], [0.05, 0.85, 0.05, 0.3], [-0.2, 0.7, -0.15, 0.26]];
            for (const [x, y, z, r] of lumps) {
                const geo = (this.idRand() > 0.5)
                    ? new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6)
                    : new THREE.SphereGeometry(r, 8, 8);
                const lump = new THREE.Mesh(geo, junkMat);
                lump.position.set(x, y, z);
                lump.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3);
                this.trashPile.add(lump);
            }
            this.bodyGroup.add(this.trashPile);

            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(p.accent, 1.0, 0.3, p.accent));
            this.heart.position.set(0, 0.6, 0.1);
            this.bodyGroup.add(this.heart);

            this.eyes = new THREE.Group();
            this.eyes.add(this._eye(this.eyes, -0.18, 0.8, 0.28, 0.1, 0x111111));
            this.eyes.add(this._eye(this.eyes, 0.2, 0.72, 0.26, 0.08, 0x111111));
            this.bodyGroup.add(this.eyes);

            this.limbs = new THREE.Group();
            const limbMat = this._mat(0x444038, 1.0, 0.9);
            for (const lx of [-0.5, 0.5]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.5, 6), limbMat);
                arm.position.set(lx, 0.5, 0); arm.rotation.z = lx > 0 ? -0.7 : 0.7;
                this.limbs.add(arm);
            }
            this.bodyGroup.add(this.limbs);

            this._partMeshMap = { TRASH_PILE: this.trashPile, LIMBS: this.limbs, EYES: this.eyes, HEART: this.heart };
            this._cascadeRules = [
                { gone: ['TRASH_PILE'], hide: [this.trashPile, this.limbs, this.eyes, this.heart] },
                { gone: ['LIMBS'], hide: [this.limbs] },
                { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['HEART'], hide: [this.heart] },
            ];
        }

        // ── Totem: a stacked carved pillar with stubby arms ──────────────────
        _buildTotem() {
            const p = this.profile;
            const skin = this.buildSkinTexture(this.skinTextureFile);
            const woodMat = new THREE.MeshStandardMaterial({ color: p.wood, map: skin, roughness: 0.9, transparent: true });
            this._materials.push(woodMat);

            this.base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8), woodMat);
            this.base.position.y = 0.15;
            this.bodyGroup.add(this.base);

            this.core = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 8), woodMat);
                seg.position.y = 0.5 + i * 0.5; this.core.add(seg);
            }
            this.bodyGroup.add(this.core);

            this.eyesG = new THREE.Group();
            this.eyesG.add(this._eye(this.eyesG, -0.16, 1.45, 0.42, 0.11, p.accent));
            this.eyesG.add(this._eye(this.eyesG, 0.16, 1.45, 0.42, 0.11, p.accent));
            this.bodyGroup.add(this.eyesG);

            this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), woodMat);
            this.leftArm.position.set(-0.55, 1.0, 0); this.leftArm.rotation.z = 0.4;
            this.bodyGroup.add(this.leftArm);
            this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), woodMat);
            this.rightArm.position.set(0.55, 1.0, 0); this.rightArm.rotation.z = -0.4;
            this.bodyGroup.add(this.rightArm);

            this._partMeshMap = { CORE: this.core, BASE: this.base, EYES: this.eyesG, LEFT_ARM: this.leftArm, RIGHT_ARM: this.rightArm };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.eyesG, this.leftArm, this.rightArm] },
                { gone: ['BASE'], hide: [this.base] },
                { gone: ['EYES'], hide: [this.eyesG] },
                { gone: ['LEFT_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM'], hide: [this.rightArm] },
            ];
        }

        // ── Spiky monster: a spined ball on two little legs ──────────────────
        _buildSpiky() {
            const p = this.profile;
            const bodyMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.6));
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), bodyMat);
            this.body.position.y = 0.85;
            this.bodyGroup.add(this.body);

            this.spikes = new THREE.Group();
            const spikeMat = this._mat(p.accent, 1.0, 0.5);
            for (let i = 0; i < 14; i++) {
                const u = this.idRand(), v = this.idRand();
                const theta = u * Math.PI * 2, phi = Math.acos(2 * v - 1);
                const dx = Math.sin(phi) * Math.cos(theta), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(theta);
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 5), spikeMat);
                spike.position.set(dx * 0.5, 0.85 + dy * 0.5, dz * 0.5);
                spike.lookAt(dx * 2, 0.85 + dy * 2, dz * 2);
                spike.rotateX(Math.PI / 2);
                this.spikes.add(spike);
            }
            this.bodyGroup.add(this.spikes);

            this.eyes = new THREE.Group();
            this.eyes.add(this._eye(this.eyes, -0.16, 0.92, 0.44, 0.11, 0x111111));
            this.eyes.add(this._eye(this.eyes, 0.16, 0.92, 0.44, 0.11, 0x111111));
            this.bodyGroup.add(this.eyes);

            const legMat = this._mat(0x2a2a2a, 1.0, 0.8);
            this.leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.5, 6), legMat);
            this.leftLeg.position.set(-0.2, 0.25, 0); this.bodyGroup.add(this.leftLeg);
            this.rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.5, 6), legMat);
            this.rightLeg.position.set(0.2, 0.25, 0); this.bodyGroup.add(this.rightLeg);

            this._partMeshMap = { BODY: this.body, SPIKES: this.spikes, EYES: this.eyes, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.spikes, this.eyes, this.leftLeg, this.rightLeg] },
                { gone: ['SPIKES'], hide: [this.spikes] },
                { gone: ['EYES'], hide: [this.eyes] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
        }

        // ── Mutant: a lumpy mass with a head, extra limbs and an eye cluster ──
        _buildMutant() {
            const p = this.profile;
            const fleshMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.55));

            this.mass = new THREE.Group();
            const lumps = [[0, 0.6, 0, 0.5], [-0.3, 0.45, 0.1, 0.34], [0.3, 0.55, -0.1, 0.36], [0.0, 0.95, 0.0, 0.34]];
            for (const [x, y, z, r] of lumps) {
                const lump = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), fleshMat);
                lump.position.set(x, y, z); this.mass.add(lump);
            }
            this.bodyGroup.add(this.mass);

            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), fleshMat);
            this.head.position.set(0.05, 1.35, 0.05); this.head.scale.set(1, 1.1, 1);
            this.bodyGroup.add(this.head);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this._mat(0x2a0a0a, 1.0, 0.5));
            mouth.position.set(0, -0.08, 0.26); mouth.scale.set(1.4, 0.7, 0.6); this.head.add(mouth);

            this.eyeCluster = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const ex = -0.2 + this.idRand() * 0.4, ey = 1.25 + this.idRand() * 0.25, ez = 0.2 + this.idRand() * 0.15;
                this.eyeCluster.add(this._eye(this.eyeCluster, ex, ey, ez, 0.06 + this.idRand() * 0.05, p.accent));
            }
            this.bodyGroup.add(this.eyeCluster);

            const limbMat = this._mat(p.bodyColor, 1.0, 0.6);
            const mkLimb = (x, ry) => {
                const g = new THREE.Group();
                let py = 0;
                for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.02, 8, 8), limbMat); s.position.y = py; g.add(s); py -= 0.2; }
                g.position.set(x, 0.7, 0); g.rotation.z = ry;
                this.bodyGroup.add(g);
                return g;
            };
            this.extraLimb1 = mkLimb(-0.55, 0.6);
            this.extraLimb2 = mkLimb(0.55, -0.6);

            this.tailSpike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), this._mat(p.accent, 1.0, 0.4));
            this.tailSpike.position.set(0, 0.4, -0.45); this.tailSpike.rotation.x = -2.2;
            this.bodyGroup.add(this.tailSpike);

            this._partMeshMap = { MASS: this.mass, HEAD: this.head, EXTRA_LIMB_1: this.extraLimb1, EXTRA_LIMB_2: this.extraLimb2, EYE_CLUSTER: this.eyeCluster, TAIL_SPIKE: this.tailSpike };
            this._cascadeRules = [
                { gone: ['MASS'], hide: [this.mass, this.head, this.extraLimb1, this.extraLimb2, this.eyeCluster, this.tailSpike] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['EXTRA_LIMB_1'], hide: [this.extraLimb1] },
                { gone: ['EXTRA_LIMB_2'], hide: [this.extraLimb2] },
                { gone: ['EYE_CLUSTER'], hide: [this.eyeCluster] },
                { gone: ['TAIL_SPIKE'], hide: [this.tailSpike] },
            ];
        }

        // ── Floating eye slug: one giant eyeball on a fleshy slug-mass, two
        //    eyestalk tendrils and a cluster of tiny eyes. (Mutant part keys.) ─
        _buildFloatingEye() {
            const p = this.profile;
            const fleshMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.45));

            // Slug-like fleshy mass: a flattened tapering body lying low.
            this.mass = new THREE.Group();
            const slugSegs = [[0, 0.32, -0.05, 0.42], [0, 0.28, 0.35, 0.34], [0, 0.24, 0.62, 0.24], [0, 0.36, -0.42, 0.3]];
            for (const [x, y, z, r] of slugSegs) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), fleshMat);
                seg.position.set(x, y, z); seg.scale.set(1.2, 0.75, 1.0); this.mass.add(seg);
            }
            this.bodyGroup.add(this.mass);

            // Single huge eyeball perched up front, veined sclera + big iris.
            this.head = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 18), this._mat(0xfff0d8, 1.0, 0.25));
            this.head.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 14), this._mat(p.accent, 1.0, 0.2, p.accent));
            iris.position.z = 0.34; iris.scale.set(1, 1, 0.5); this.head.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(0x080808, 1.0, 0.2));
            pupil.position.z = 0.46; pupil.scale.set(1, 1, 0.4); this.head.add(pupil);
            this.head.position.set(0, 0.85, 0.18);
            this.bodyGroup.add(this.head);

            // Two waving eyestalk tendrils each capped with a tiny eye.
            const mkStalk = (x) => {
                const g = new THREE.Group();
                const mat = this._mat(p.bodyColor, 1.0, 0.55);
                let py = 0;
                for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 8, 8), mat); s.position.y = py; g.add(s); py += 0.16; }
                this._eye(g, 0, py, 0, 0.08, p.accent);
                g.position.set(x, 0.55, -0.1); g.rotation.z = x > 0 ? -0.4 : 0.4;
                this.bodyGroup.add(g);
                return g;
            };
            this.extraLimb1 = mkStalk(-0.42);
            this.extraLimb2 = mkStalk(0.42);

            // Cluster of small eyes studding the mass.
            this.eyeCluster = new THREE.Group();
            for (let i = 0; i < 5; i++) {
                const a = this.idRand() * Math.PI * 2, rr = 0.2 + this.idRand() * 0.2;
                this._eye(this.eyeCluster, Math.cos(a) * rr, 0.4 + this.idRand() * 0.2, 0.3 + Math.sin(a) * rr, 0.05 + this.idRand() * 0.04, 0x111111);
            }
            this.bodyGroup.add(this.eyeCluster);

            // Little tail nub spike at the back.
            this.tailSpike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), this._mat(p.accent, 1.0, 0.4));
            this.tailSpike.position.set(0, 0.34, -0.6); this.tailSpike.rotation.x = -2.4;
            this.bodyGroup.add(this.tailSpike);

            this._partMeshMap = { MASS: this.mass, HEAD: this.head, EXTRA_LIMB_1: this.extraLimb1, EXTRA_LIMB_2: this.extraLimb2, EYE_CLUSTER: this.eyeCluster, TAIL_SPIKE: this.tailSpike };
            this._cascadeRules = [
                { gone: ['MASS'], hide: [this.mass, this.head, this.extraLimb1, this.extraLimb2, this.eyeCluster, this.tailSpike] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['EXTRA_LIMB_1'], hide: [this.extraLimb1] },
                { gone: ['EXTRA_LIMB_2'], hide: [this.extraLimb2] },
                { gone: ['EYE_CLUSTER'], hide: [this.eyeCluster] },
                { gone: ['TAIL_SPIKE'], hide: [this.tailSpike] },
            ];
        }

        // ── Eyeball Slug: a ringed leech crawling flat on the ground, every
        //    segment grown over with eyeballs, a gaping rasping sucker at the
        //    front and a swollen heart-segment behind it. (SegmentWorm keys.) ──
        _buildEyeballSlug() {
            const p = this.profile;
            const fleshMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.35));
            const ringMat = this._mat(p.accent, 1.0, 0.5);

            // Mid body: annulated segments lying low, tapering back, each ring
            // separated by a darker collar and topped with a staring eye.
            this.mass = new THREE.Group();
            const segs = [[0.30, 0.30, 0.34], [0.28, 0.06, 0.30], [0.25, -0.20, 0.27]];
            for (const [r, z, y] of segs) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fleshMat);
                seg.position.set(0, y, z); seg.scale.set(1.25, 0.8, 1.0); this.mass.add(seg);
                const collar = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.03, 6, 14), ringMat);
                collar.position.set(0, y, z - r * 0.5); collar.rotation.y = Math.PI / 2; collar.scale.set(1.0, 0.8, 1.25);
                this.mass.add(collar);
                this._eye(this.mass, (this.idRand() - 0.5) * 0.24, y + r * 0.62, z, 0.07 + this.idRand() * 0.03, 0x111111);
            }
            // Wet trail smeared under the body.
            const slimeMat = this._mat(p.accent, 0.28, 0.15, p.accent);
            for (let i = 0; i < 3; i++) {
                const s = new THREE.Mesh(new THREE.CircleGeometry(0.22 - i * 0.05, 12), slimeMat);
                s.rotation.x = -Math.PI / 2; s.position.set(0, 0.02, -0.5 - i * 0.3); this.mass.add(s);
            }
            this.bodyGroup.add(this.mass);

            // Heart segment: the swollen ring behind the head, a lit organ
            // visible through the skin.
            this.core = new THREE.Group();
            const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), fleshMat);
            bulge.scale.set(1.2, 0.9, 1.05); this.core.add(bulge);
            this.heart = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(0xc03040, 0.85, 0.3, 0xff2a3a));
            this.heart.position.set(0, 0.06, 0.12); this.core.add(this.heart);
            this.core.position.set(0, 0.34, 0.5); this.bodyGroup.add(this.core);

            // Head: a raised sucker mouth, ring of rasping teeth, one big eye
            // over it and two beady eyestalks.
            this.head = new THREE.Group();
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.34, 14), fleshMat);
            snout.rotation.x = Math.PI / 2; this.head.add(snout);
            const gum = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 8, 16), ringMat);
            gum.position.z = 0.17; this.head.add(gum);
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(0x2a0a12, 1.0, 0.6));
            gullet.position.z = 0.14; gullet.scale.set(1, 1, 0.6); this.head.add(gullet);
            this.teeth = new THREE.Group();
            const toothMat = this._mat(0xfff0d8, 1.0, 0.3);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 4), toothMat);
                tooth.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.2);
                tooth.rotation.set(Math.PI / 2, 0, -a);
                this.teeth.add(tooth);
            }
            this.head.add(this.teeth);
            // The one eye the thing is named for, sat above the mouth.
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), this._mat(0xfff0d8, 1.0, 0.25));
            sclera.position.set(0, 0.3, 0.06); this.head.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), this._mat(p.accent, 1.0, 0.2, p.accent));
            iris.position.set(0, 0.3, 0.22); iris.scale.set(1, 1, 0.5); this.head.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), this._mat(0x080808, 1.0, 0.2));
            pupil.position.set(0, 0.3, 0.27); pupil.scale.set(1, 1, 0.4); this.head.add(pupil);
            this.stalks = new THREE.Group();
            for (const sx of [-0.22, 0.22]) {
                const g = new THREE.Group();
                const stalkMat = this._mat(p.bodyColor, 1.0, 0.5);
                let py = 0;
                for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.055 - i * 0.008, 8, 8), stalkMat); s.position.y = py; g.add(s); py += 0.11; }
                this._eye(g, 0, py, 0, 0.06, 0x111111);
                g.position.set(sx, 0.24, -0.02); g.rotation.z = sx > 0 ? -0.45 : 0.45;
                this.stalks.add(g);
            }
            this.head.add(this.stalks);
            this.head.position.set(0, 0.4, 0.98); this.bodyGroup.add(this.head);

            // Tail: two shrinking rings dragging behind the body.
            this.tail = new THREE.Group();
            for (let i = 0; i < 2; i++) {
                const r = 0.2 - i * 0.07;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), fleshMat);
                seg.position.set(0, 0.22 - i * 0.05, -0.5 - i * 0.3); seg.scale.set(1.15, 0.8, 1.0);
                this.tail.add(seg);
            }
            this.bodyGroup.add(this.tail);

            this._partMeshMap = {
                HEAD: this.head, HEART_SEGMENT: this.core, HEART: this.core,
                BODY_SEGMENT: this.mass, BODY: this.mass, MASS: this.mass, TAIL: this.tail
            };
            this._cascadeRules = [
                { gone: ['BODY_SEGMENT', 'BODY', 'MASS'], hide: [this.mass, this.core, this.head, this.tail] },
                { gone: ['HEART_SEGMENT', 'HEART'], hide: [this.core] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Nervous System: a glowing web of nerves around a brain-core, one
        //    eye and two dangling nerve-tendrils. (Voidspawn part keys.) ───────
        _buildNervousSystem() {
            const p = this.profile;
            const nerveMat = this._mat(p.accent, 0.95, 0.4, p.accent);

            // Brain-core: two lobed hemispheres = the central node.
            this.core = new THREE.Group();
            for (const lx of [-0.16, 0.16]) {
                const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), this.applySkin(this._mat(p.bodyColor, 1.0, 0.4)));
                lobe.position.set(lx, 1.1, 0); lobe.scale.set(1, 0.9, 1.15); this.core.add(lobe);
            }
            this.bodyGroup.add(this.core);

            // Radiating web of thin nerve filaments fanning out from the brain.
            this.maw = new THREE.Group(); // (web of nerves mapped to MAW)
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2, len = 0.5 + this.idRand() * 0.5;
                const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.006, len, 5), nerveMat);
                const ex = Math.cos(a) * 0.55, ez = Math.sin(a) * 0.35;
                fil.position.set(ex * 0.5, 1.1 + (this.idRand() - 0.5) * 0.6, ez * 0.5);
                fil.lookAt(ex * 1.6, 1.1 + Math.cos(a) * 0.7, ez * 1.6); fil.rotateX(Math.PI / 2);
                this.maw.add(fil);
                const node = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), nerveMat);
                node.position.copy(fil.position); this.maw.add(node);
            }
            this.bodyGroup.add(this.maw);

            // Single staring eye nested in front of the brain.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.05, 0.4, 0.2, 0x222222);

            // Two long dangling nerve-tendrils (spinal cords).
            const mkNerve = (x) => {
                const g = new THREE.Group();
                let py = 0.6;
                for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i * 0.008, 8, 8), nerveMat); s.position.set(Math.sin(i) * 0.06, py, 0); g.add(s); py -= 0.16; }
                g.position.set(x, 0.85, 0.05);
                return g;
            };
            this.tendril1 = mkNerve(-0.22); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkNerve(0.22); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Reality Bender: a warped void-mass with a fractured prism core that
        //    bends space, one eye, two distorting tendrils. (Voidspawn keys.) ──
        _buildRealityBender() {
            const p = this.profile;

            // Warped void-mass: overlapping distorted spheres (the bent space).
            this.maw = new THREE.Group(); // outer warp shell mapped to MAW
            for (let i = 0; i < 5; i++) {
                const warp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 - i * 0.03, 0), this._mat(p.bodyColor, 0.4 + i * 0.08, 0.2, 0x220044));
                warp.position.set((this.idRand() - 0.5) * 0.4, 1.05 + (this.idRand() - 0.5) * 0.4, (this.idRand() - 0.5) * 0.3);
                warp.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3);
                warp.scale.set(1 + this.idRand() * 0.6, 1 + this.idRand() * 0.6, 1 + this.idRand() * 0.6);
                this.maw.add(warp);
            }
            this.bodyGroup.add(this.maw);

            // Fractured prism core: sharp octahedral crystal shards.
            this.core = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this._mat(p.accent, 0.9, 0.1, p.accent));
                const a = (i / 6) * Math.PI * 2;
                shard.position.set(Math.cos(a) * 0.18, 1.05 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.12);
                shard.rotation.set(a, a * 1.5, 0); shard.scale.set(1, 1.8, 1); this.core.add(shard);
            }
            this.bodyGroup.add(this.core);

            // Single warped eye floating before the prism.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.1, 0.42, 0.2, p.accent);

            // Two distorting tendrils that twist away.
            this.tendril1 = this._tentacle(-0.36, p.bodyColor); this.bodyGroup.add(this.tendril1);
            this.tendril2 = this._tentacle(0.36, p.bodyColor); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Recursive Paradox: concentric impossible loops (torii) nested around
        //    a core eye and a maw. (Voidspawn part keys.) ─────────────────────
        _buildRecursiveParadox() {
            const p = this.profile;

            // Nested concentric rings on alternating axes = impossible loops.
            this.maw = new THREE.Group(); // ring system mapped to MAW
            const ringMat = this._mat(p.accent, 0.85, 0.2, p.accent);
            for (let i = 0; i < 5; i++) {
                const r = 0.55 - i * 0.09;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 28), ringMat);
                ring.position.y = 1.05;
                ring.rotation.x = (i % 2 === 0) ? Math.PI / 2 : 0;
                ring.rotation.y = (i % 3 === 0) ? Math.PI / 4 : 0;
                ring.rotation.z = i * 0.4;
                ring._ringAxis = i % 3;
                this.maw.add(ring);
            }
            this.bodyGroup.add(this.maw);

            // Core: a dark recursive sphere with self-similar bumps.
            this.core = new THREE.Group();
            const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), this.applySkin(this._mat(p.bodyColor, 1.0, 0.4, 0x001020)));
            coreSphere.position.y = 1.05; this.core.add(coreSphere);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const bump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(p.bodyColor, 1.0, 0.4));
                bump.position.set(Math.cos(a) * 0.2, 1.05 + Math.sin(a) * 0.1, 0.12); this.core.add(bump);
            }
            this.bodyGroup.add(this.core);

            // Central eye + a maw-mouth slit beneath it (recursion's centre).
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.1, 0.22, 0.13, p.accent);
            this._mawMouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(0x050008, 1.0, 0.5));
            this._mawMouth.position.set(0, 0.92, 0.2); this._mawMouth.scale.set(1.6, 0.5, 0.6); this.core.add(this._mawMouth);

            this.tendril1 = this._tentacle(-0.3, p.bodyColor); this.bodyGroup.add(this.tendril1);
            this.tendril2 = this._tentacle(0.3, p.bodyColor); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Sentient Meme: a garish grinning cartoon-face blob, big goofy eye,
        //    wide curved maw, two noodly tendrils. (Voidspawn part keys.) ──────
        _buildSentientMeme() {
            const p = this.profile;

            // Round cartoonish blob face.
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 18), this.applySkin(this._mat(p.bodyColor, 1.0, 0.35, 0x110022)));
            this.core.position.y = 1.1; this.core.scale.set(1.1, 1.05, 0.9);
            this.bodyGroup.add(this.core);

            // One big goofy off-centre eye with a huge pupil.
            this.abyssalEye = this._eye(this.bodyGroup, -0.12, 1.25, 0.46, 0.26, 0x111111);
            // A tiny lopsided second eye for goofiness (rides on the big eye group).
            this._eye(this.abyssalEye, 0.6, -0.1, 0.0, 0.4, 0x111111);

            // Wide grinning maw: a curved row of blocky teeth.
            this.maw = new THREE.Group();
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 20, Math.PI), this._mat(p.accent, 1.0, 0.4, p.accent));
            lip.position.set(0, 0.95, 0.42); lip.rotation.x = Math.PI; this.maw.add(lip);
            const gum = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(0x300010, 1.0, 0.5));
            gum.position.set(0, 0.96, 0.36); gum.rotation.x = Math.PI; gum.scale.set(1.1, 0.5, 0.6); this.maw.add(gum);
            for (let i = 0; i < 7; i++) {
                const tx = -0.27 + i * 0.09;
                const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.05), this._mat(0xfffff0, 1.0, 0.4));
                tooth.position.set(tx, 0.99, 0.46); this.maw.add(tooth);
            }
            this.bodyGroup.add(this.maw);

            // Two noodly rubber-hose tendril arms.
            const mkNoodle = (x) => {
                const g = new THREE.Group();
                const mat = this._mat(p.bodyColor, 1.0, 0.4);
                let py = 0, px = 0;
                for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat); s.position.set(px, py, 0); g.add(s); py -= 0.14; px += (x > 0 ? 0.06 : -0.06) * Math.sin(i); }
                g.position.set(x, 0.9, 0.1);
                return g;
            };
            this.tendril1 = mkNoodle(-0.45); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkNoodle(0.45); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Shoggoth: a protoplasmic black bubbling mass studded with shifting
        //    eyes and mouths, two pseudopod tendrils. (Voidspawn part keys.) ───
        _buildShoggoth() {
            const p = this.profile;
            const protoMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.6, 0x040406));

            // Lumpy bubbling protoplasmic mass mapped to CORE.
            this.core = new THREE.Group();
            const bubbles = [[0, 0.6, 0, 0.55], [-0.38, 0.5, 0.12, 0.36], [0.36, 0.55, -0.1, 0.38], [0.05, 1.0, 0.05, 0.36], [-0.2, 0.85, -0.18, 0.28], [0.25, 0.9, 0.2, 0.26]];
            this._bubbleMeshes = [];
            for (const [x, y, z, r] of bubbles) {
                const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), protoMat);
                b.position.set(x, y, z); b._baseR = r; this.core.add(b); this._bubbleMeshes.push(b);
            }
            this.bodyGroup.add(this.core);

            // Shifting eyes scattered over the surface mapped to ABYSSAL_EYE.
            this.abyssalEye = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = this.idRand() * Math.PI * 2, ph = this.idRand() * Math.PI;
                const rr = 0.5;
                this._eye(this.abyssalEye, Math.sin(ph) * Math.cos(a) * rr, 0.65 + Math.cos(ph) * 0.4, 0.2 + Math.sin(ph) * Math.sin(a) * rr, 0.06 + this.idRand() * 0.06, p.accent);
            }
            this.bodyGroup.add(this.abyssalEye);

            // Puckered mouths scattered over the mass mapped to MAW.
            this.maw = new THREE.Group();
            const mouthMat = this._mat(0x100008, 1.0, 0.5);
            const toothMat = this._mat(0xeeeeee, 1.0, 0.4);
            for (let i = 0; i < 4; i++) {
                const mg = new THREE.Group();
                const hole = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), mouthMat);
                hole.scale.set(1.3, 0.6, 0.6); mg.add(hole);
                for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 4), toothMat); t.position.set(-0.08 + k * 0.04, 0, 0.06); mg.add(t); }
                const a = this.idRand() * Math.PI * 2;
                mg.position.set(Math.cos(a) * 0.4, 0.55 + this.idRand() * 0.4, 0.25 + Math.sin(a) * 0.25);
                mg.rotation.y = a; this.maw.add(mg);
            }
            this.bodyGroup.add(this.maw);

            // Two pseudopod tendrils oozing out the sides.
            this.tendril1 = this._tentacle(-0.42, p.bodyColor); this.bodyGroup.add(this.tendril1);
            this.tendril2 = this._tentacle(0.42, p.bodyColor); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Void Manipulator: a cloaked hovering figure tearing open a swirling
        //    void portal, glowing eye, two energy tendrils. (Voidspawn keys.) ──
        _buildVoidManipulator() {
            const p = this.profile;
            const cloakMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.7, 0x10001a));

            // Cloaked figure: a tapering hooded robe cone with a hollow hood.
            this.core = new THREE.Group();
            const robe = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 10, 1, true), cloakMat);
            robe.position.y = 0.7; this.core.add(robe);
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), cloakMat);
            hood.position.y = 1.4; hood.scale.set(1, 1.2, 1); this.core.add(hood);
            const shadow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this._mat(0x000000, 1.0, 0.9));
            shadow.position.set(0, 1.3, 0.05); this.core.add(shadow);
            this.bodyGroup.add(this.core);

            // Swirling void portal being torn open in front of the figure (MAW).
            this.maw = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const r = 0.5 - i * 0.1;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04 + i * 0.01, 8, 24), this._mat(p.accent, 0.85 - i * 0.12, 0.2, p.accent));
                ring.position.set(0, 1.0, 0.45); ring.rotation.z = i * 0.7; ring._spin = (i % 2 ? -1 : 1) * (1 + i * 0.4);
                this.maw.add(ring);
            }
            const rift = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), this._mat(0x05000a, 1.0, 0.9, 0x1a0033));
            rift.position.set(0, 1.0, 0.44); this.maw.add(rift);
            this.bodyGroup.add(this.maw);

            // Glowing eye peering from the hood.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.32, 0.24, 0.13, p.accent);

            // Two crackling energy tendrils (sleeve-hands reaching to the rift).
            const mkBolt = (x) => {
                const g = new THREE.Group();
                const mat = this._mat(p.accent, 0.95, 0.3, p.accent);
                let py = 0, pz = 0;
                for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 - i * 0.012, 0), mat); s.position.set(0, py, pz); g.add(s); py -= 0.1; pz += 0.12; }
                g.position.set(x, 1.0, 0.1);
                return g;
            };
            this.tendril1 = mkBolt(-0.4); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkBolt(0.4); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Advertisement Badger: a garish floating billboard-sign with a
        //    blinking eye-logo, a slot maw, two cable tendrils. (Voidspawn keys.)
        _buildAdvertisementBadger() {
            const p = this.profile;

            // Billboard panel: a big flat lit signboard with a frame.
            this.core = new THREE.Group();
            const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 0.12), this.applySkin(this._mat(p.bodyColor, 1.0, 0.4, 0x401000)));
            board.position.y = 1.1; this.core.add(board);
            const frameMat = this._mat(0x222222, 1.0, 0.5);
            for (const [w, h, x, y] of [[1.42, 0.08, 0, 1.55], [1.42, 0.08, 0, 0.65], [0.08, 0.98, -0.67, 1.1], [0.08, 0.98, 0.67, 1.1]]) {
                const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frameMat); bar.position.set(x, y, 0); this.core.add(bar);
            }
            // Marquee bulbs around the frame.
            const bulbMat = this._mat(p.accent, 1.0, 0.3, p.accent);
            for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), bulbMat); b.position.set(-0.6 + i * 0.133, 1.55, 0.08); this.core.add(b); }
            // Support post under the sign.
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6), frameMat); post.position.y = 0.35; this.core.add(post);
            this.bodyGroup.add(this.core);

            // Blinking eye-logo in the centre of the board.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.22, 0.12, 0.2, p.accent);

            // Slot maw: a horizontal letterbox slot with thin teeth (a mail/cash slot).
            this.maw = new THREE.Group();
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.08), this._mat(0x100000, 1.0, 0.6));
            slot.position.set(0, 0.82, 0.1); this.maw.add(slot);
            for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), this._mat(0xffe0a0, 1.0, 0.4)); t.position.set(-0.3 + i * 0.075, 0.84, 0.14); this.maw.add(t); }
            this.bodyGroup.add(this.maw);

            // Two dangling power-cable tendrils.
            const mkCable = (x) => {
                const g = new THREE.Group();
                const mat = this._mat(0x202020, 1.0, 0.6);
                let py = 0;
                for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), mat); s.position.set(Math.sin(i * 0.9) * 0.07, py, 0); g.add(s); py -= 0.14; }
                const plug = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.08), this._mat(p.accent, 1.0, 0.4, p.accent)); plug.position.y = py + 0.02; g.add(plug);
                g.position.set(x, 0.6, 0);
                return g;
            };
            this.tendril1 = mkCable(-0.5); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkCable(0.5); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Living Theorem: a floating constellation of glowing equation-glyphs
        //    and geometric lines around a core eye, two formula tendrils. ──────
        _buildLivingTheorem() {
            const p = this.profile;
            const glyphMat = this._mat(p.accent, 0.95, 0.25, p.accent);

            // Core: a dim mathematical heart-node + an eye nested in it.
            this.core = new THREE.Group();
            const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), this.applySkin(this._mat(p.bodyColor, 0.85, 0.3, 0x002028)));
            node.position.y = 1.05; this.core.add(node);
            this.bodyGroup.add(this.core);
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.05, 0.26, 0.14, p.accent);

            // Constellation of glyphs (MAW): small glowing primitives = symbols,
            // joined by thin geometric line-struts forming a proof-diagram.
            this.maw = new THREE.Group();
            const orbit = [];
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2, rr = 0.5 + (i % 3) * 0.12;
                const gy = 1.05 + Math.sin(a * 2) * 0.4;
                const pos = new THREE.Vector3(Math.cos(a) * rr, gy, Math.sin(a) * rr * 0.5 + 0.1);
                const shapes = [new THREE.TorusGeometry(0.08, 0.02, 6, 12), new THREE.BoxGeometry(0.12, 0.04, 0.04), new THREE.TetrahedronGeometry(0.09, 0), new THREE.RingGeometry(0.05, 0.09, 10)];
                const glyph = new THREE.Mesh(shapes[i % shapes.length], glyphMat);
                glyph.position.copy(pos); glyph.rotation.set(this.idRand() * 3, this.idRand() * 3, 0);
                this.maw.add(glyph); orbit.push(pos);
            }
            // Geometric connecting lines between consecutive glyphs.
            for (let i = 0; i < orbit.length; i++) {
                const a = orbit[i], b = orbit[(i + 2) % orbit.length];
                const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
                const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), this._mat(p.accent, 0.45, 0.3, p.accent));
                strut.position.copy(mid); strut.lookAt(b); strut.rotateX(Math.PI / 2); this.maw.add(strut);
            }
            // The proof-diagram orbits the node and its glyphs tumble, by design.
            this.maw.userData.float = true;
            this.bodyGroup.add(this.maw);

            // Two formula tendrils: chains of tiny glyph beads trailing down.
            const mkFormula = (x) => {
                const g = new THREE.Group();
                let py = 0;
                for (let i = 0; i < 5; i++) {
                    const geo = (i % 2) ? new THREE.BoxGeometry(0.06, 0.06, 0.06) : new THREE.TetrahedronGeometry(0.05, 0);
                    const s = new THREE.Mesh(geo, glyphMat); s.position.set(Math.sin(i) * 0.05, py, 0); s.rotation.set(i, i, 0); g.add(s); py -= 0.14;
                }
                // Loose glyph beads hanging in the air under the node, by design.
                g.position.set(x, 0.85, 0.05); g.userData.float = true;
                return g;
            };
            this.tendril1 = mkFormula(-0.3); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkFormula(0.3); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Leyline Aneurysm: a throbbing knot of tangled glowing leyline-threads
        //    bulging around a core, curdling magic. (Voidspawn part keys.) ──────
        _buildLeylineAneurysm() {
            const p = this.profile;
            const threadMat = this._mat(p.accent, 0.95, 0.35, p.accent);

            // Pulsing core bulge: a swollen vein-knot (the aneurysm sac).
            this.core = new THREE.Group();
            const sac = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), this.applySkin(this._mat(p.bodyColor, 1.0, 0.4, 0x300018)));
            sac.position.y = 1.05; sac.scale.set(1.1, 0.95, 1.0); this.core.add(sac);
            // Bulging sub-blisters on the sac surface.
            for (let i = 0; i < 5; i++) {
                const a = this.idRand() * Math.PI * 2, ph = this.idRand() * Math.PI;
                const bl = new THREE.Mesh(new THREE.SphereGeometry(0.13 + this.idRand() * 0.06, 10, 10), this.applySkin(this._mat(p.bodyColor, 1.0, 0.4)));
                bl.position.set(Math.sin(ph) * Math.cos(a) * 0.4, 1.05 + Math.cos(ph) * 0.35, Math.sin(ph) * Math.sin(a) * 0.4 + 0.05); this.core.add(bl);
            }
            this.bodyGroup.add(this.core);

            // Tangled glowing leyline-threads wrapped around the knot (MAW).
            this.maw = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const r = 0.46 + this.idRand() * 0.16;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022 + this.idRand() * 0.02, 6, 22), threadMat);
                ring.position.y = 1.05;
                ring.rotation.set(this.idRand() * Math.PI, this.idRand() * Math.PI, this.idRand() * Math.PI);
                ring.scale.set(1, 0.7 + this.idRand() * 0.5, 1);
                this.maw.add(ring);
            }
            // Glowing pinch-nodes where threads cross.
            for (let i = 0; i < 6; i++) {
                const a = this.idRand() * Math.PI * 2;
                const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), threadMat);
                knot.position.set(Math.cos(a) * 0.5, 1.05 + (this.idRand() - 0.5) * 0.7, Math.sin(a) * 0.4); this.maw.add(knot);
            }
            this.bodyGroup.add(this.maw);

            // Pained eye buried in the knot.
            this.abyssalEye = this._eye(this.bodyGroup, 0.05, 1.12, 0.36, 0.13, 0x220000);

            // Two frayed curdling-magic thread tendrils dribbling down.
            const mkThread = (x) => {
                const g = new THREE.Group();
                let py = 0.4;
                for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i * 0.01, 7, 7), threadMat); s.position.set(Math.sin(i * 1.4) * 0.09, py, 0); g.add(s); py -= 0.13; }
                g.position.set(x, 0.85, 0.08);
                return g;
            };
            this.tendril1 = mkThread(-0.32); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkThread(0.32); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ── Time-Loop Stalker: a stuttering figure with motion-blur after-images
        //    repeating one step, clock-glyph core, two tendrils. (Voidspawn keys.)
        _buildTimeLoopStalker() {
            const p = this.profile;

            // Stalking humanoid + faint repeated after-images stepping forward.
            this.core = new THREE.Group();
            this._afterImages = [];
            const mkFigure = (z, op, mat) => {
                const f = new THREE.Group();
                const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), mat); torso.position.y = 1.0; f.add(torso);
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), mat); head.position.y = 1.45; f.add(head);
                // a stepping leg (mid-stride) and a planted leg.
                const legA = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), mat); legA.position.set(-0.1, 0.45, 0.14); legA.rotation.x = 0.5; f.add(legA);
                const legB = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), mat); legB.position.set(0.1, 0.45, -0.1); legB.rotation.x = -0.3; f.add(legB);
                const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.4, 4, 6), mat); arm.position.set(0.22, 1.0, 0.1); arm.rotation.z = -0.4; f.add(arm);
                f.position.z = z; f.position.x = z * 0.5;
                return f;
            };
            // Three trailing after-image ghosts behind the solid figure.
            for (let i = 3; i >= 1; i--) {
                const ghost = mkFigure(-i * 0.22, 0.18, this._mat(p.accent, 0.16, 0.5, p.accent));
                this.core.add(ghost); this._afterImages.push(ghost);
            }
            this._solidFigure = mkFigure(0, 1.0, this.applySkin(this._mat(p.bodyColor, 1.0, 0.6, 0x081018)));
            this.core.add(this._solidFigure);
            this.bodyGroup.add(this.core);

            // Clock-glyph core (MAW): a clock face with hands hovering at chest.
            this.maw = new THREE.Group();
            const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 20), this._mat(0x05101a, 1.0, 0.4, p.accent));
            face.rotation.x = Math.PI / 2; face.position.set(0, 1.05, 0.24); this.maw.add(face);
            for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), this._mat(p.accent, 1.0, 0.3, p.accent)); tick.position.set(Math.cos(a) * 0.22, 1.05 + Math.sin(a) * 0.22, 0.27); this.maw.add(tick); }
            this._clockHandH = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.02), this._mat(p.accent, 1.0, 0.3, p.accent)); this._clockHandH.position.set(0, 1.05, 0.28); this._clockHandH.geometry = this._clockHandH.geometry.clone().translate(0, 0.07, 0); this.maw.add(this._clockHandH);
            this._clockHandM = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), this._mat(0xffffff, 1.0, 0.3, p.accent)); this._clockHandM.position.set(0, 1.05, 0.28); this._clockHandM.geometry = this._clockHandM.geometry.clone().translate(0, 0.1, 0); this.maw.add(this._clockHandM);
            this.bodyGroup.add(this.maw);

            // Glowing eye in the hooded head.
            this.abyssalEye = this._eye(this.bodyGroup, 0, 1.45, 0.18, 0.1, p.accent);

            // Two flickering chrono-tendrils trailing as smeared time-streaks.
            const mkStreak = (x) => {
                const g = new THREE.Group();
                let py = 0, op = 0.9;
                for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07 - i * 0.008, 8, 8), this._mat(p.accent, op, 0.4, p.accent)); s.position.set(0, py, -i * 0.07); g.add(s); py -= 0.13; op -= 0.14; }
                g.position.set(x, 0.85, 0);
                return g;
            };
            this.tendril1 = mkStreak(-0.3); this.bodyGroup.add(this.tendril1);
            this.tendril2 = mkStreak(0.3); this.bodyGroup.add(this.tendril2);

            this._partMeshMap = { CORE: this.core, ABYSSAL_EYE: this.abyssalEye, MAW: this.maw, VOID_TENDRIL_1: this.tendril1, VOID_TENDRIL_2: this.tendril2 };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.abyssalEye, this.maw, this.tendril1, this.tendril2] },
                { gone: ['ABYSSAL_EYE'], hide: [this.abyssalEye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['VOID_TENDRIL_1'], hide: [this.tendril1] },
                { gone: ['VOID_TENDRIL_2'], hide: [this.tendril2] },
            ];
        }

        // ══ Level 1-5 starters: each its own body plan, not a reskin ════════
        // `root` takes every part with it; every other key hides only itself.
        _lvWire(parts, root) {
            const all = [];
            this._partMeshMap = {};
            for (const k in parts) if (parts[k]) { this._partMeshMap[k] = parts[k]; if (all.indexOf(parts[k]) < 0) all.push(parts[k]); }
            this._cascadeRules = [{ gone: [root], hide: all }];
            for (const k in parts) if (parts[k] && k !== root) this._cascadeRules.push({ gone: [k], hide: [parts[k]] });
        }

        // ── Garden Slug: a fat glistening slug with a mantle saddle, long eye
        //    tentacles and a nibbled lettuce leaf stuck to its back ─────────
        //    (SegmentWorm keys: HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL/MAW.)
        _buildLvGardenSlug() {
            const p = this.profile;
            const skin = this.applySkin(this._mat(p.bodyColor, 1.0, 0.25));
            const spot = this._mat(0x2a1a0a, 1.0, 0.4);
            const slime = this._mat(p.accent, 0.35, 0.1, p.accent);
            // BODY_SEGMENT: the long soft body on a frilled foot, spotted on top.
            this.mass = new THREE.Group();
            for (const [z, r] of [[0.32, 0.3], [0.02, 0.33], [-0.3, 0.29]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), skin); s.position.set(0, 0.26, z); s.scale.set(1.0, 0.8, 1.15); this.mass.add(s); }
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 5), this._mat(0xc8a070, 1.0, 0.4)); foot.position.set(0, 0.07, 0.0); foot.scale.set(0.95, 0.18, 2.0); this.mass.add(foot);
            for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (i % 3) * 0.015, 6, 4), spot); s.position.set((i % 2 ? 0.12 : -0.1) + (i % 3 - 1) * 0.05, 0.46 - (i % 2) * 0.03, 0.25 - i * 0.1); s.scale.y = 0.35; this.mass.add(s); }
            this.bodyGroup.add(this.mass);
            // HEART_SEGMENT: the mantle saddle with its breathing pore.
            this.core = new THREE.Group();
            const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 7), skin); mantle.scale.set(1.05, 0.62, 1.35); this.core.add(mantle);
            for (let i = 0; i < 3; i++) { const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.05, 0.012, 3, 12), spot); ridge.rotation.x = Math.PI / 2; ridge.scale.set(1.1, 1.4, 1); ridge.position.y = 0.17 - i * 0.01; this.core.add(ridge); }
            const pore = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.02, 4, 8), this._mat(0x1a0a04, 1.0, 0.5)); pore.position.set(0.3, 0.0, -0.05); pore.rotation.y = Math.PI / 2; this.core.add(pore);
            // The nibbled lettuce leaf it carries on its back.
            const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.2, 7), this._mat(0x6ac04a, 1.0, 0.6)); leaf.material.side = THREE.DoubleSide; leaf.rotation.set(-Math.PI / 2 + 0.25, 0, 0.6); leaf.position.set(-0.08, 0.2, -0.06); this.core.add(leaf);
            const vein = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), this._mat(0xd8f0a0, 1.0, 0.6)); vein.rotation.y = 0.6; vein.position.set(-0.08, 0.215, -0.06); this.core.add(vein);
            this.core.position.set(0, 0.42, 0.22); this.bodyGroup.add(this.core);
            // HEAD: blunt head, two long eye tentacles and two short feelers.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 9, 7), skin); h.scale.set(1, 0.85, 1.1); this.head.add(h);
            this.slugStalks = [];
            for (const sx of [-1, 1]) {
                const st = new THREE.Group();
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.4, 5), skin); rod.position.y = 0.2; st.add(rod);
                const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), this._mat(0x101010, 1.0, 0.2)); knob.position.y = 0.41; st.add(knob);
                st.position.set(sx * 0.08, 0.12, 0.06); st.rotation.set(0.45, 0, -sx * 0.35); this.head.add(st); this.slugStalks.push(st);
                const feel = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), skin); feel.position.set(sx * 0.1, -0.06, 0.24); feel.rotation.x = 1.3; this.head.add(feel);
            }
            this.head.position.set(0, 0.3, 0.62); this.bodyGroup.add(this.head);
            // MAW: the mouth under the head, a pale rasping radula.
            this.maw = new THREE.Group();
            const lip = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 8), this._mat(0x5a2a1a, 1.0, 0.5)); this.maw.add(lip);
            const rad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.05), this._mat(0xe8a0a0, 1.0, 0.4)); rad.position.z = 0.02; this.maw.add(rad);
            this.maw.position.set(0, 0.17, 0.82); this.maw.rotation.x = 0.9; this.bodyGroup.add(this.maw);
            // TAIL: a keeled taper with the silver trail it lays behind.
            this.tail = new THREE.Group();
            const taper = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 7), skin); taper.rotation.x = -Math.PI / 2; taper.scale.set(1, 0.75, 1); taper.position.set(0, 0.2, -0.72); this.tail.add(taper);
            const keel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.4), skin); keel.position.set(0, 0.32, -0.68); keel.rotation.x = -0.25; this.tail.add(keel);
            for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CircleGeometry(0.2 - i * 0.04, 9), slime); t.rotation.x = -Math.PI / 2; t.position.set(0, 0.012, -0.75 - i * 0.28); this.tail.add(t); }
            this.bodyGroup.add(this.tail);
            this._lvWire({ BODY_SEGMENT: this.mass, HEART_SEGMENT: this.core, HEAD: this.head, TAIL: this.tail, MAW: this.maw }, 'BODY_SEGMENT');
        }

        // ── Ditch Leech: a black swollen leech reared up in a question mark,
        //    tail sucker on the ground, a belly full of someone's blood ─────
        //    (SegmentWorm keys.)
        _buildLvDitchLeech() {
            const p = this.profile;
            const skin = this.applySkin(this._mat(p.bodyColor, 1.0, 0.15));
            const ring = this._mat(0x0a0a08, 1.0, 0.3);
            const stripe = this._mat(0xd8782a, 1.0, 0.5);
            const path = [[0.15, -0.58], [0.32, -0.48], [0.5, -0.32], [0.6, -0.1], [0.6, 0.12], [0.52, 0.3], [0.5, 0.48], [0.58, 0.62], [0.7, 0.72]];
            const radii = [0.2, 0.19, 0.18, 0.19, 0.2, 0.18, 0.16, 0.15, 0.14];
            // BODY_SEGMENT: annulated rings along the arch, orange flank dots.
            this.mass = new THREE.Group();
            let prev = null;
            path.forEach(([y, z], i) => {
                if (i === 4) { prev = new THREE.Vector3(0, y, z); return; }
                const s = new THREE.Mesh(new THREE.SphereGeometry(radii[i], 9, 7), skin); s.position.set(0, y, z); s.scale.set(1.1, 0.95, 1.0); this.mass.add(s);
                const cur = new THREE.Vector3(0, y, z);
                if (prev) {
                    this.addStrut(this.mass, skin, prev, cur, radii[i - 1] * 0.85, radii[i] * 0.85, 7);
                    const c = new THREE.Mesh(new THREE.TorusGeometry(radii[i] * 0.98, 0.015, 3, 12), ring); c.position.copy(prev).lerp(cur, 0.5); c.lookAt(cur); this.mass.add(c);
                }
                for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), stripe); d.position.set(sx * radii[i] * 1.06, y + 0.04, z); this.mass.add(d); }
                prev = cur;
            });
            this.bodyGroup.add(this.mass);
            // HEART_SEGMENT: the swollen, translucent blood belly at the crest.
            this.core = new THREE.Group();
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), this._mat(0x4a0a10, 0.75, 0.1, 0x200004)); belly.scale.set(1.1, 1.0, 1.15); this.core.add(belly);
            this.leechBlood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), this._mat(p.accent, 1.0, 0.3, 0x600008)); this.core.add(this.leechBlood);
            this.core.position.set(0, 0.6, 0.12); this.bodyGroup.add(this.core);
            // HEAD: the anterior sucker turned forward, an arc of eyespots on top.
            this.head = new THREE.Group();
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.16, 9), skin); cup.rotation.x = Math.PI / 2; this.head.add(cup);
            for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), this._mat(0xf0e080, 1.0, 0.2, 0x403000)); e.position.set(Math.sin(a) * 0.1, 0.12 + Math.cos(a) * 0.02, -0.02); this.head.add(e); }
            this.head.position.set(0, 0.74, 0.82); this.head.rotation.x = 0.5; this.bodyGroup.add(this.head);
            // MAW: three toothed jaws set in a Y inside the sucker.
            this.maw = new THREE.Group();
            const throat = new THREE.Mesh(new THREE.CircleGeometry(0.13, 9), this._mat(0x3a0408, 1.0, 0.8)); this.maw.add(throat);
            for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), this._mat(0xe8d8c0, 1.0, 0.3)); jaw.position.set(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.02); jaw.rotation.z = a - Math.PI / 2; this.maw.add(jaw); }
            this.maw.position.set(0, 0, 0.085); this.head.add(this.maw);
            // TAIL: the posterior sucker gripping the ground.
            this.tail = new THREE.Group();
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.08, 10), skin); disc.position.set(0, 0.04, -0.62); this.tail.add(disc);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 3, 12), ring); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.06, -0.62); this.tail.add(rim);
            this.bodyGroup.add(this.tail);
            this._lvWire({ BODY_SEGMENT: this.mass, HEART_SEGMENT: this.core, HEAD: this.head, TAIL: this.tail, MAW: this.maw }, 'BODY_SEGMENT');
        }

        // ── Nosy Peeper: a bloodshot eye squinting between its lids, dangling
        //    its optic nerve, a stolen window frame held up to peer through ─
        //    (Mutant keys: HEAD/MASS/EXTRA_LIMB_1/2/EYE_CLUSTER/TAIL_SPIKE/MAW.)
        _buildLvNosyPeeper() {
            const p = this.profile;
            const flesh = this.applySkin(this._mat(p.bodyColor, 1.0, 0.5));
            const vein = this._mat(0xc81828, 1.0, 0.4, 0x400000);
            // HEAD: the eye itself, squinting between two lids, veins over it.
            this.head = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), this._mat(0xf4ece0, 1.0, 0.25)); this.head.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), this._mat(p.accent, 1.0, 0.2, p.accent)); iris.position.z = 0.33; iris.scale.z = 0.5; this.head.add(iris);
            this.peepPupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this._mat(0x060606, 1.0, 0.2)); this.peepPupil.position.z = 0.4; this.peepPupil.scale.z = 0.4; this.head.add(this.peepPupil);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2, pts = [];
                for (let k = 0; k < 3; k++) { const th = 0.55 + k * 0.32; pts.push(new THREE.Vector3(Math.cos(a + k * 0.25) * Math.sin(th) * 0.4, Math.sin(a + k * 0.25) * Math.sin(th) * 0.4, Math.cos(th) * 0.4)); }
                for (let k = 1; k < 3; k++) this.addStrut(this.head, vein, pts[k - 1], pts[k], 0.012, 0.008, 3);
            }
            this.peepLids = [];
            for (const sgn of [1, -1]) {
                const lid = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 6, 0, Math.PI * 2, 0, Math.PI * (sgn > 0 ? 0.3 : 0.28)), flesh);
                const piv = new THREE.Group(); piv.add(lid); lid.rotation.x = sgn > 0 ? 0.1 : Math.PI - 0.05; piv._base = lid.rotation.x; piv._lid = lid; piv._sgn = sgn;
                this.head.add(piv); this.peepLids.push(piv);
            }
            this.head.position.set(0, 1.2, 0.08); this.bodyGroup.add(this.head);
            // MASS: the fleshy socket cupping the back of the eye, ridged.
            this.mass = new THREE.Group();
            const cupM = new THREE.Mesh(new THREE.SphereGeometry(0.44, 11, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), flesh); cupM.rotation.x = Math.PI / 2; this.mass.add(cupM);
            for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.06, 0.03, 4, 12), flesh); r.position.z = -0.3 - i * 0.05; this.mass.add(r); }
            this.mass.position.set(0, 1.2, 0.0); this.bodyGroup.add(this.mass);
            // MAW: a small puckered mouth on the socket rim under the eye.
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.025, 4, 8), this._mat(0x7a2a2a, 1.0, 0.4)); this.maw.position.set(0, 0.8, 0.05); this.maw.rotation.x = 1.1; this.bodyGroup.add(this.maw);
            // TAIL_SPIKE: the optic nerve dangling below, ending in a spike.
            this.tailSpike = new THREE.Group();
            const nPts = [[0, 0, 0], [0.05, -0.18, -0.04], [-0.02, -0.36, -0.06], [0.04, -0.52, -0.05]].map(a => new THREE.Vector3(...a));
            for (let k = 1; k < nPts.length; k++) this.addStrut(this.tailSpike, flesh, nPts[k - 1], nPts[k], 0.07 - k * 0.012, 0.06 - k * 0.012, 6);
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), this._mat(0xe8dcc0, 1.0, 0.4)); spike.rotation.x = Math.PI; spike.position.set(0.04, -0.6, -0.05); this.tailSpike.add(spike);
            this.tailSpike.position.set(0, 0.86, -0.2); this.bodyGroup.add(this.tailSpike);
            // EYE_CLUSTER: three little eyes budding along the nerve.
            this.eyeCluster = new THREE.Group();
            for (let k = 1; k < 4; k++) this._eye(this.eyeCluster, nPts[k].x + (k % 2 ? 0.05 : -0.05), nPts[k].y, nPts[k].z + 0.03, 0.04, p.accent);
            this.tailSpike.add(this.eyeCluster);
            // EXTRA_LIMB_1: a tendril holding up the stolen window frame.
            const tendril = (sx, reach) => {
                const g = new THREE.Group();
                const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.2, -0.05, 0.06), new THREE.Vector3(sx * 0.36, 0.04, 0.12), reach];
                for (let k = 1; k < pts.length; k++) this.addStrut(g, flesh, pts[k - 1], pts[k], 0.05 - k * 0.01, 0.04 - k * 0.01, 5);
                g.position.set(sx * 0.4, 1.05, -0.1); this.bodyGroup.add(g); return g;
            };
            this.extraLimb1 = tendril(-1, new THREE.Vector3(-0.48, 0.18, 0.2));
            const frame = new THREE.Group(), wood = this._mat(0x6a4a2a, 1.0, 0.8);
            for (const [w, h, x, y] of [[0.4, 0.04, 0, 0.2], [0.4, 0.04, 0, -0.2], [0.04, 0.44, -0.2, 0], [0.04, 0.44, 0.2, 0], [0.025, 0.4, 0, 0], [0.4, 0.025, 0, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), wood); b.position.set(x, y, 0); frame.add(b); }
            frame.position.set(-0.48, 0.18, 0.2); frame.rotation.y = 0.5; this.extraLimb1.add(frame);
            // EXTRA_LIMB_2: a tendril trailing a torn scrap of net curtain.
            this.extraLimb2 = tendril(1, new THREE.Vector3(0.5, -0.1, 0.18));
            const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.01), this._mat(0xf0ecd8, 0.75, 0.9)); curtain.position.set(0.52, -0.27, 0.18); curtain.rotation.z = -0.15; this.extraLimb2.add(curtain);
            this._lvWire({ MASS: this.mass, HEAD: this.head, EXTRA_LIMB_1: this.extraLimb1, EXTRA_LIMB_2: this.extraLimb2, EYE_CLUSTER: this.eyeCluster, TAIL_SPIKE: this.tailSpike, MAW: this.maw }, 'MASS');
        }

        // ── Stapler Mimic: an office stapler on six crab legs, one eye on the
        //    hinge, staples for teeth, a tongue over the anvil ──────────────
        //    (ChestMimic keys: CORE/LID/TEETH/TONGUE/FEET.)
        _buildLvStaplerMimic() {
            const p = this.profile;
            const metal = this.applySkin(this._mat(p.bodyColor, 1.0, 0.35));
            const chrome = this._mat(0xd0d4d8, 1.0, 0.15);
            const steel = this._mat(0xe0e0e8, 1.0, 0.2);
            const staple = (g, x, y, z, down) => {
                const top = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.015, 0.015), steel); top.position.set(x, y, z); g.add(top);
                for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.015), steel); leg.position.set(x + sx * 0.05, y + (down ? -0.03 : 0.03), z); g.add(leg); }
            };
            // CORE: the base plate, the shiny anvil, the hinge block and its eye.
            this.core = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 1.15), metal); base.position.set(0, 0.2, 0); this.core.add(base);
            const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 10, 1, false, 0, Math.PI), metal); nose.position.set(0, 0.2, 0.575); nose.rotation.y = -Math.PI / 2; this.core.add(nose);
            const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.16), chrome); anvil.position.set(0, 0.26, 0.42); this.core.add(anvil);
            const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.22), metal); hinge.position.set(0, 0.36, -0.46); this.core.add(hinge);
            this._eye(this.core, 0, 0.38, -0.34, 0.08, p.accent);
            for (let i = 0; i < 4; i++) staple(this.core, 0, 0.27, 0.1 + i * 0.07, false);
            this.bodyGroup.add(this.core);
            // LID: the top arm hinged at the back, red stripe down its spine.
            this.lid = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 1.08), metal); arm.position.set(0, 0.04, 0.5); this.lid.add(arm);
            const armNose = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 10, 1, false, 0, Math.PI), metal); armNose.position.set(0, 0.04, 1.04); armNose.rotation.y = -Math.PI / 2; this.lid.add(armNose);
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.8), this._mat(p.accent, 1.0, 0.4)); band.position.set(0, 0.12, 0.5); this.lid.add(band);
            // TEETH: rows of staples biting down from under the arm.
            this.teeth = new THREE.Group();
            for (let i = 0; i < 6; i++) staple(this.teeth, 0, -0.04, 0.45 + i * 0.09, true);
            this.lid.add(this.teeth);
            this.lid.position.set(0, 0.43, -0.48); this.lid.rotation.x = -0.32; this.bodyGroup.add(this.lid);
            // TONGUE: a grey-pink tongue lolling out over the anvil.
            this.tongue = new THREE.Group();
            const tg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.34), this._mat(0xc87a8a, 1.0, 0.5)); tg.position.z = 0.17; this.tongue.add(tg);
            const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), this._mat(0xc87a8a, 1.0, 0.5)); tip.position.z = 0.34; this.tongue.add(tip);
            this.tongue.position.set(0, 0.27, 0.35); this.tongue.rotation.x = 0.25; this.bodyGroup.add(this.tongue);
            // FEET: six jointed crab legs under the base plate.
            this.feet = new THREE.Group();
            for (const z of [-0.35, 0.0, 0.35]) for (const sx of [-1, 1]) {
                const leg = new THREE.Group();
                const up = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.22, 4), metal); up.position.set(sx * 0.1, 0.03, 0); up.rotation.z = -sx * 1.1; leg.add(up);
                const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.2, 4), metal); lo.position.set(sx * 0.2, -0.05, 0); lo.rotation.z = sx * 0.35; leg.add(lo);
                leg.position.set(sx * 0.16, 0.15, z); this.feet.add(leg);
            }
            this.bodyGroup.add(this.feet);
            this._lvWire({ CORE: this.core, LID: this.lid, TEETH: this.teeth, TONGUE: this.tongue, FEET: this.feet }, 'CORE');
        }

        // ── Lost Doll Head: a cracked porcelain head rolling on its cheek, one
        //    lid stuck half shut, a music box ticking where the brain was ───
        //    (SeveredHead keys.)
        _buildLvLostDollHead() {
            const p = this.profile;
            const porcelain = this.applySkin(this._mat(p.bodyColor, 1.0, 0.18));
            const hairMat = this._mat(0x6a3a1a, 1.0, 0.7);
            const dark = this._mat(0x140c0c, 1.0, 0.8);
            const brass = this._mat(0xc8a040, 1.0, 0.3);
            this.dollRoot = new THREE.Group();
            // HEAD: the porcelain skull with its ringlets, bow and crack.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), porcelain); skull.scale.set(1, 1.06, 0.96); this.head.add(skull);
            for (const [x, y, rz, len] of [[-0.08, 0.32, 0.5, 0.18], [0.02, 0.24, -0.3, 0.14], [0.1, 0.18, 0.6, 0.1]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.015, len, 0.015), dark); c.position.set(x, y, 0.3); c.rotation.z = rz; c.lookAt(x * 3, y * 3, 2); this.head.add(c); }
            const chip = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), dark); chip.position.set(0.24, 0.24, 0.27); chip.lookAt(0.72, 0.72, 0.81); this.head.add(chip);
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.455, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat); cap.scale.set(1, 1.07, 0.98); cap.rotation.x = -0.35; this.head.add(cap);
            for (let i = 0; i < 6; i++) { const a = Math.PI * 0.85 + (i / 5) * Math.PI * 1.3, ringlet = new THREE.Group(); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.02, 4, 8), hairMat); r.position.y = -k * 0.06; r.rotation.y = k * 0.8; ringlet.add(r); } ringlet.position.set(Math.cos(a) * 0.38, -0.05, Math.sin(a) * 0.36 - 0.02); this.head.add(ringlet); }
            for (const sx of [-1, 1]) { const bow = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), this._mat(0xd84a6a, 1.0, 0.5)); bow.rotation.z = sx * Math.PI / 2; bow.position.set(sx * 0.1, 0.44, -0.08); this.head.add(bow); }
            this.dollRoot.add(this.head);
            // LEFT/RIGHT_EYE: glass eyes with lashes; the right lid sticks half shut.
            const eye = (sx) => {
                const g = new THREE.Group();
                const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 9, 7), this._mat(0xfafaf4, 1.0, 0.1)); g.add(ball);
                const iris = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this._mat(p.accent, 1.0, 0.1, p.accent)); iris.position.z = 0.045; iris.scale.z = 0.5; g.add(iris);
                const pup = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), this._mat(0x050505, 1.0, 0.1)); pup.position.z = 0.068; g.add(pup);
                for (let k = 0; k < 3; k++) { const lash = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), dark); lash.position.set((k - 1) * 0.035, 0.08, 0.04); lash.rotation.z = (k - 1) * 0.4; g.add(lash); }
                const lid = new THREE.Mesh(new THREE.SphereGeometry(0.085, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), porcelain); lid.rotation.x = sx > 0 ? 1.1 : 0.2; g.add(lid); g._lid = lid;
                g.position.set(sx * 0.15, 0.06, 0.35); this.dollRoot.add(g); return g;
            };
            this.leftEye = eye(-1); this.rightEye = eye(1);
            // NOSE, cheeks-ears, MOUTH and TEETH.
            this.nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), porcelain); this.nose.position.set(0, -0.06, 0.41); this.dollRoot.add(this.nose);
            this.leftEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5, 0, Math.PI), porcelain); this.leftEar.position.set(-0.41, 0.0, 0); this.leftEar.rotation.y = -Math.PI / 2; this.dollRoot.add(this.leftEar);
            this.rightEar = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5, 0, Math.PI), porcelain); this.rightEar.position.set(0.41, 0.0, 0); this.rightEar.rotation.y = Math.PI / 2; this.dollRoot.add(this.rightEar);
            this.mouth = new THREE.Group();
            for (const sx of [-1, 1]) { const lip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), this._mat(0xc02838, 1.0, 0.3)); lip.position.x = sx * 0.025; lip.scale.set(1.2, 0.7, 0.6); this.mouth.add(lip); }
            this.mouth.position.set(0, -0.18, 0.37); this.dollRoot.add(this.mouth);
            this.teeth = new THREE.Group();
            for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.022, 0.01), this._mat(0xffffff, 1.0, 0.2)); t.position.set(sx * 0.011, -0.012, 0.025); this.teeth.add(t); }
            this.mouth.add(this.teeth);
            // BRAIN: a music box mechanism showing through a hole at the crown.
            this.brain = new THREE.Group();
            const hole = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), dark); hole.rotation.x = -Math.PI / 2; this.brain.add(hole);
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), brass); drum.rotation.z = Math.PI / 2; drum.position.y = 0.02; this.brain.add(drum);
            for (let i = 0; i < 5; i++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.01), brass); pin.position.set(-0.06 + i * 0.03, 0.075, (i % 2) * 0.02 - 0.01); this.brain.add(pin); }
            this.dollGear = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 4, 8), brass); this.dollGear.position.set(0.0, 0.03, -0.07); this.brain.add(this.dollGear);
            this.brain.position.set(0.1, 0.4, -0.15); this.brain.rotation.set(-0.3, 0, -0.25); this.dollRoot.add(this.brain);
            // NECK_STUMP: the hollow porcelain neck, a frayed string end hanging out.
            this.neckStump = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 9, 1, true), porcelain); this.neckStump.add(neck);
            const inside = new THREE.Mesh(new THREE.CircleGeometry(0.15, 9), dark); inside.rotation.x = Math.PI / 2; inside.position.y = -0.06; this.neckStump.add(inside);
            const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), this._mat(0xd8c8a0, 1.0, 0.9)); cord.position.set(0.05, -0.14, 0.02); cord.rotation.z = 0.4; this.neckStump.add(cord);
            this.neckStump.position.set(0, -0.44, -0.04); this.dollRoot.add(this.neckStump);
            // Built level; animatePose rolls it onto its cheek, as if it had
            // just rolled to a stop and keeps rocking there.
            this.dollRoot.position.set(0, 0.62, 0); this.dollRoot.rotation.set(0.15, 0, 0); this.bodyGroup.add(this.dollRoot);
            this._lvWire({ HEAD: this.head, BRAIN: this.brain, LEFT_EYE: this.leftEye, RIGHT_EYE: this.rightEye, NOSE: this.nose, LEFT_EAR: this.leftEar, RIGHT_EAR: this.rightEar, MOUTH: this.mouth, TEETH: this.teeth, NECK_STUMP: this.neckStump }, 'HEAD');
        }

        // ── Litter Critter: a knotted bin bag up on two corner-feet, tie ears
        //    sticking up like a rabbit's, eyes in a tear, a can for a heart ─
        //    (TrashCreature keys: TRASH_PILE/LIMBS/EYES/HEART/MAW.)
        _buildLvLitterCritter() {
            const p = this.profile;
            const bag = this.applySkin(this._mat(p.bodyColor, 1.0, 0.18));
            const crease = this._mat(0x3a3a44, 1.0, 0.3);
            const news = this._mat(0xd8d4c4, 1.0, 0.9);
            // TRASH_PILE: the bag, its creases, the knotted neck and tie ears.
            this.pile = new THREE.Group();
            const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 1), bag); sack.scale.set(1.0, 1.15, 0.92); sack.position.y = 0.72; this.pile.add(sack);
            for (let i = 0; i < 5; i++) { const a = i * 1.25; const c = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.02), crease); c.position.set(Math.cos(a) * 0.46, 0.68, Math.sin(a) * 0.42); c.rotation.z = Math.cos(a) * 0.3; this.pile.add(c); }
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 0.18, 7), bag); neck.position.y = 1.29; this.pile.add(neck);
            const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), bag); knot.position.y = 1.4; this.pile.add(knot);
            this.bagEars = [];
            for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.36, 4), bag); ear.scale.z = 0.35; ear.position.set(sx * 0.1, 1.55, 0); ear.rotation.z = -sx * 0.35; this.pile.add(ear); this.bagEars.push(ear); }
            const draw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 3, 10), this._mat(0xe8c020, 1.0, 0.5)); draw.position.set(0, 1.32, 0.04); draw.rotation.x = 1.2; this.pile.add(draw);
            this.bodyGroup.add(this.pile);
            // MAW: a ragged tear low on the front, rubbish spilling out of it.
            this.maw = new THREE.Group();
            const tear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), this._mat(0x060608, 1.0, 0.9)); tear.scale.set(1.3, 0.7, 0.35); this.maw.add(tear);
            for (let i = 0; i < 4; i++) { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 3), bag); const a = i * 1.6; sh.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.11, 0.02); sh.rotation.z = a - Math.PI / 2; this.maw.add(sh); }
            const peel = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), this._mat(0xe8d040, 1.0, 0.6)); peel.position.set(-0.08, -0.1, 0.06); peel.rotation.set(0.6, 0, 0.9); this.maw.add(peel);
            const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), news); ball.position.set(0.1, -0.08, 0.06); this.maw.add(ball);
            this.maw.position.set(0, 0.52, 0.42); this.bodyGroup.add(this.maw);
            // HEART: a crushed can glowing inside the tear.
            this.heart = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); this.heart.position.set(0.02, 0.53, 0.38); this.heart.rotation.set(0.3, 0, 0.6); this.heart.scale.y = 0.7; this.bodyGroup.add(this.heart);
            // EYES: two eyes shining out of a smaller split higher up.
            this.eyes = new THREE.Group();
            const split = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), this._mat(0x060608, 1.0, 0.9)); split.scale.set(1.5, 0.45, 0.35); this.eyes.add(split);
            for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), this._mat(p.accent, 1.0, 0.2, p.accent)); e.position.set(sx * 0.07, 0, 0.03); this.eyes.add(e); }
            this.eyes.position.set(0, 0.88, 0.43); this.bodyGroup.add(this.eyes);
            // LIMBS: two bag-corner feet and two rolled-newspaper arms.
            this.limbs = new THREE.Group(); this._litterLegs = []; this._litterArms = [];
            for (const sx of [-1, 1]) {
                const leg = new THREE.Group();
                const shin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 5), bag); shin.rotation.x = Math.PI; shin.position.y = -0.1; leg.add(shin);
                const sole = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), bag); sole.scale.set(1, 0.4, 1.4); sole.position.set(0, -0.22, 0.04); leg.add(sole);
                leg.position.set(sx * 0.2, 0.26, 0.02); this.limbs.add(leg); this._litterLegs.push(leg);
                const arm = new THREE.Group();
                const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.4, 6), news); roll.position.y = -0.2; arm.add(roll);
                for (let k = 0; k < 3; k++) { const line = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 3, 8), crease); line.rotation.x = Math.PI / 2; line.position.y = -0.08 - k * 0.1; arm.add(line); }
                arm.position.set(sx * 0.44, 0.86, 0.04); arm.rotation.z = sx * 0.45; this.limbs.add(arm); this._litterArms.push(arm);
            }
            this.bodyGroup.add(this.limbs);
            this._lvWire({ TRASH_PILE: this.pile, LIMBS: this.limbs, EYES: this.eyes, HEART: this.heart, MAW: this.maw }, 'TRASH_PILE');
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;
            const anim = this.currentAnimation;

            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.2 : 0;

            switch (this.variant) {
                case 'chestmimic': {
                    // Lid chomps open/closed; faster + lunge on attack.
                    const rate = (anim === 'attack' || anim === 'specialattack') ? 11 : 2.2;
                    const open = (Math.sin(t * rate) * 0.5 + 0.5) * (anim === 'attack' ? 1.2 : 0.7);
                    if (this.lid && this.lid.visible) this.lid.rotation.x = -open;
                    if (this.tongue && this.tongue.visible) this.tongue.rotation.x = 0.3 + Math.sin(t * 4) * 0.15;
                    this.model.position.y = this._baseY + (anim === 'attack' ? Math.abs(Math.sin(t * rate)) * 0.1 * this.scale : 0);
                    this.model.rotation.z = hitJolt;
                    break;
                }
                case 'tentacled':
                case 'voidspawn': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.1 * this.scale;
                    this.model.rotation.z = Math.sin(t * 0.9) * 0.05 + hitJolt;
                    const tA = this.t1 || this.tendril1, tB = this.t2 || this.tendril2;
                    if (tA && tA.visible) tA.rotation.z = Math.sin(t * 3) * 0.3;
                    if (tB && tB.visible) tB.rotation.z = -Math.sin(t * 3 + 1) * 0.3;
                    const eye = this.eyeball || this.abyssalEye;
                    if (eye) eye.scale.y = 1.0 - Math.pow(Math.max(0, Math.sin(t * 0.3 * Math.PI * 2)), 14) * 0.9;
                    if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.4;
                    break;
                }
                case 'totem': {
                    this.model.rotation.z = Math.sin(t * 1.2) * 0.04 + hitJolt;
                    if (this.eyesG) this.eyesG.children.forEach(e => { if (e.children[0] && e.children[0].material) e.children[0].material.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.4; });
                    break;
                }
                case 'spiky': {
                    // Idle breathe; bristle the spikes outward on attack; little hops.
                    const hop = (anim === 'attack') ? Math.abs(Math.sin(t * 8)) * 0.12 : Math.sin(t * 2) * 0.03;
                    this.model.position.y = this._baseY + hop * this.scale;
                    const bristle = (anim === 'attack' || anim === 'specialattack') ? 1.0 + Math.abs(Math.sin(t * 9)) * 0.25 : 1.0;
                    if (this.spikes && this.spikes.visible) this.spikes.scale.setScalar(bristle);
                    this.model.rotation.z = hitJolt;
                    break;
                }
                case 'trash':
                case 'mutant': {
                    // Wet throb + twitching limbs.
                    const throb = 1.0 + Math.sin(t * 3) * 0.05;
                    const mass = this.mass || this.trashPile;
                    if (mass && mass.visible) mass.scale.set(throb, 1.0 / throb, throb);
                    if (this.heart && this.heart.material) this.heart.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4;
                    if (this.extraLimb1 && this.extraLimb1.visible) this.extraLimb1.rotation.z = 0.6 + Math.sin(t * 4) * 0.25;
                    if (this.extraLimb2 && this.extraLimb2.visible) this.extraLimb2.rotation.z = -0.6 - Math.sin(t * 4 + 1) * 0.25;
                    this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.04 * this.scale;
                    this.model.rotation.z = hitJolt;
                    break;
                }
                case 'floatingeye': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.7) * 0.08 * this.scale;
                    this.model.rotation.z = Math.sin(t * 0.8) * 0.04 + hitJolt;
                    if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 1.2) * 0.4;
                    if (this.extraLimb1 && this.extraLimb1.visible) this.extraLimb1.rotation.z = 0.4 + Math.sin(t * 3) * 0.3;
                    if (this.extraLimb2 && this.extraLimb2.visible) this.extraLimb2.rotation.z = -0.4 - Math.sin(t * 3 + 1) * 0.3;
                    break;
                }
                case 'eyeballslug': {
                    // Peristaltic crawl: the rings squash forward one after the
                    // other, the sucker gapes and the eyestalks sway.
                    const fast = (anim === 'attack' || anim === 'specialattack' || anim === 'run');
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.02 * this.scale;
                    this.model.rotation.z = hitJolt;
                    if (this.mass && this.mass.visible) this.mass.children.forEach((c, i) => {
                        if (c.geometry && c.geometry.type === 'SphereGeometry') {
                            const w = Math.sin(t * (fast ? 7 : 3) - i * 0.9) * 0.06;
                            c.scale.set(1.25 + w, 0.8 - w * 0.5, 1.0 + w);
                        }
                    });
                    if (this.heart && this.heart.material) this.heart.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4;
                    if (this.head && this.head.visible) {
                        this.head.rotation.y = fast ? 0 : Math.sin(t * 1.1) * 0.25;
                        this.head.rotation.x = -0.1 + Math.sin(t * 2) * 0.05;
                        const gape = fast ? 1.0 + Math.abs(Math.sin(t * 9)) * 0.4 : 1.0 + Math.sin(t * 2) * 0.06;
                        if (this.teeth) this.teeth.scale.set(gape, gape, 1);
                        if (this.stalks) this.stalks.children.forEach((g, i) => { g.rotation.z = (i ? -0.45 : 0.45) + Math.sin(t * 3 + i) * 0.2; });
                    }
                    break;
                }
                case 'nervoussystem': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.07 * this.scale;
                    this.model.rotation.z = hitJolt;
                    const pulse = 0.4 + (Math.sin(t * 8) * 0.5 + 0.5) * 0.6;
                    if (this.maw && this.maw.visible) this.maw.children.forEach(c => { if (c.material) c.material.emissiveIntensity = pulse; });
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 2.5) * 0.25;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 2.5 + 1) * 0.25;
                    break;
                }
                case 'realitybender': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.3) * 0.06 * this.scale;
                    this.model.rotation.y = Math.sin(t * 0.5) * 0.1;
                    this.model.rotation.z = hitJolt;
                    if (this.core && this.core.visible) { this.core.rotation.y = t * 1.5; this.core.children.forEach((s, i) => { s.scale.y = 1.8 + Math.sin(t * 4 + i) * 0.5; }); }
                    if (this.maw && this.maw.visible) this.maw.children.forEach((w, i) => { w.rotation.y += deltaTime * (0.5 + i * 0.2); });
                    const tA = this.tendril1, tB = this.tendril2;
                    if (tA && tA.visible) tA.rotation.z = Math.sin(t * 3.5) * 0.4;
                    if (tB && tB.visible) tB.rotation.z = -Math.sin(t * 3.5 + 1) * 0.4;
                    break;
                }
                case 'recursiveparadox': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;
                    this.model.rotation.z = hitJolt;
                    if (this.maw && this.maw.visible) this.maw.children.forEach((ring, i) => {
                        const sp = (i % 2 === 0) ? 1.2 : -0.9;
                        if (ring._ringAxis === 0) ring.rotation.z += deltaTime * sp;
                        else if (ring._ringAxis === 1) ring.rotation.y += deltaTime * sp;
                        else ring.rotation.x += deltaTime * sp;
                    });
                    if (this.core && this.core.visible) this.core.rotation.y = -t * 0.8;
                    break;
                }
                case 'sentientmeme': {
                    const wob = Math.sin(t * 3) * 0.06;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 2)) * 0.05 * this.scale;
                    this.model.rotation.z = Math.sin(t * 2.2) * 0.08 + hitJolt;
                    if (this.core && this.core.visible) this.core.scale.set(1.1 + wob, 1.05 - wob, 0.9);
                    if (this.abyssalEye && this.abyssalEye.visible) this.abyssalEye.scale.setScalar(1.0 + Math.sin(t * 5) * 0.12);
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 4) * 0.5;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 4 + 1.5) * 0.5;
                    break;
                }
                case 'shoggoth': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.04 * this.scale;
                    this.model.rotation.z = hitJolt;
                    if (this._bubbleMeshes) this._bubbleMeshes.forEach((b, i) => { const s = 1.0 + Math.sin(t * 3 + i * 1.3) * 0.18; b.scale.setScalar(s); });
                    if (this.abyssalEye && this.abyssalEye.visible) this.abyssalEye.children.forEach((e, i) => { e.scale.y = 1.0 - Math.pow(Math.max(0, Math.sin(t * 0.5 + i)), 12) * 0.9; });
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 2.2) * 0.35;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 2.2 + 1) * 0.35;
                    break;
                }
                case 'voidmanipulator': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.07 * this.scale;
                    this.model.rotation.z = Math.sin(t * 0.7) * 0.04 + hitJolt;
                    if (this.maw && this.maw.visible) this.maw.children.forEach(r => { if (r._spin) r.rotation.z += deltaTime * r._spin; });
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 3.5) * 0.35;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 3.5 + 1) * 0.35;
                    if (this.abyssalEye) this.abyssalEye.scale.y = 1.0 - Math.pow(Math.max(0, Math.sin(t * 0.4 * Math.PI * 2)), 14) * 0.9;
                    break;
                }
                case 'advertisementbadger': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.06 * this.scale;
                    this.model.rotation.z = Math.sin(t * 1.5) * 0.05 + hitJolt;
                    // Blinking eye-logo + marquee shimmer.
                    if (this.abyssalEye) this.abyssalEye.scale.y = (Math.sin(t * 3) > 0.7) ? 0.1 : 1.0;
                    if (this.core && this.core.visible) this.core.children.forEach((c, i) => { if (c.material && c.material.emissiveIntensity) c.material.emissiveIntensity = 0.4 + (Math.sin(t * 6 + i) * 0.5 + 0.5) * 0.6; });
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 2) * 0.2;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 2 + 1) * 0.2;
                    break;
                }
                case 'lv_gardenslug': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    this.model.position.y = this._baseY;
                    this.model.rotation.z = hitJolt;
                    if (this.mass && this.mass.visible) this.mass.children.forEach((c, i) => { if (i < 3) { const w = Math.sin(t * (fast ? 6 : 2.2) - i * 1.1) * 0.05; c.scale.set(1.0 - w, 0.8 + w, 1.15 + w); } });
                    if (this.slugStalks) this.slugStalks.forEach((st, i) => { st.rotation.x = 0.45 + Math.sin(t * 1.7 + i * 2) * 0.2; st.rotation.z = (i ? -0.35 : 0.35) + Math.sin(t * 1.3 + i) * 0.12; });
                    if (this.head && this.head.visible) this.head.position.z = 0.62 + (fast ? Math.max(0, Math.sin(t * 7)) * 0.1 : 0);
                    break;
                }
                case 'lv_ditchleech': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    this.model.position.y = this._baseY;
                    this.model.rotation.z = hitJolt;
                    if (this.head && this.head.visible) { this.head.rotation.y = Math.sin(t * (fast ? 5 : 1.3)) * 0.35; this.head.rotation.x = 0.5 + Math.sin(t * (fast ? 8 : 1.9)) * 0.18; }
                    if (this.leechBlood) { const s = 1 + Math.sin(t * 2.6) * 0.08; this.leechBlood.scale.setScalar(s); }
                    if (this.maw) this.maw.rotation.z = t * (fast ? 4 : 0.8);
                    break;
                }
                case 'lv_nosypeeper': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.06 * this.scale;
                    this.model.rotation.z = hitJolt;
                    const blink = Math.sin(t * 1.9) > 0.94 ? 0.5 : 0;
                    if (this.peepLids) this.peepLids.forEach(pv => { pv.rotation.x = pv._sgn * (Math.sin(t * 0.7) * 0.08 + blink - (fast ? 0.25 : 0)); });
                    if (this.peepPupil) this.peepPupil.position.x = Math.sin(t * 1.3) * 0.06;
                    if (this.head && this.head.visible) this.head.position.z = 0.08 + (fast ? Math.abs(Math.sin(t * 7)) * 0.1 : 0);
                    if (this.tailSpike) this.tailSpike.rotation.z = Math.sin(t * 1.6) * 0.15;
                    [this.extraLimb1, this.extraLimb2].forEach((l, i) => { if (l) l.rotation.z = Math.sin(t * 1.2 + i * 2) * 0.08; });
                    break;
                }
                case 'lv_staplermimic': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    this.model.position.y = this._baseY;
                    this.model.rotation.z = hitJolt;
                    const open = (Math.sin(t * (fast ? 11 : 2.0)) * 0.5 + 0.5) * (fast ? 0.55 : 0.25);
                    if (this.lid && this.lid.visible) this.lid.rotation.x = -(0.08 + open);
                    if (this.tongue && this.tongue.visible) this.tongue.rotation.y = Math.sin(t * 3) * 0.2;
                    if (this.feet) this.feet.children.forEach((lg, i) => { lg.rotation.x = Math.sin(t * (fast ? 14 : 4) + i * 1.3) * (fast ? 0.25 : 0.08); });
                    break;
                }
                case 'lv_lostdollhead': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    this.model.position.y = this._baseY + Math.sin(t * 1.1) * 0.04 * this.scale;
                    if (this.dollRoot) { this.dollRoot.rotation.z = 0.42 + Math.sin(t * 1.2) * 0.15 + hitJolt; this.dollRoot.rotation.x = 0.15 + (fast ? Math.sin(t * 9) * 0.25 : 0); }
                    if (this.rightEye && this.rightEye._lid) this.rightEye._lid.rotation.x = Math.sin(t * 2.7) > 0.85 ? 0.3 : 1.1;
                    if (this.dollGear) this.dollGear.rotation.z = t * 3;
                    break;
                }
                case 'lv_littercritter': {
                    const fast = (anim === 'attack' || anim === 'specialattack');
                    const sw = Math.sin(t * (fast ? 9 : 3));
                    this.model.position.y = this._baseY + Math.abs(sw) * 0.02 * this.scale;
                    this.model.rotation.z = hitJolt + sw * 0.05;
                    if (this._litterLegs) this._litterLegs.forEach((l, i) => { l.rotation.x = (i ? -sw : sw) * 0.25; });
                    if (this._litterArms) this._litterArms.forEach((a, i) => { a.rotation.x = (i ? sw : -sw) * (fast ? 0.7 : 0.3); });
                    if (this.bagEars) this.bagEars.forEach((e, i) => { e.rotation.z = (i ? -0.35 : 0.35) + Math.sin(t * 2.5 + i) * 0.12; });
                    if (this.heart && this.heart.material) this.heart.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 0.6;
                    break;
                }
                case 'livingtheorem': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.3) * 0.06 * this.scale;
                    this.model.rotation.z = hitJolt;
                    if (this.maw && this.maw.visible) { this.maw.rotation.y = t * 0.4; this.maw.children.forEach((g, i) => { g.rotation.x += deltaTime * (0.5 + (i % 3) * 0.3); }); }
                    if (this.core && this.core.visible) this.core.rotation.y = t * 0.8;
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 2.4) * 0.25;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 2.4 + 1) * 0.25;
                    break;
                }
                case 'leylineaneurysm': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.05 * this.scale;
                    this.model.rotation.z = hitJolt;
                    // Throbbing pulse of the aneurysm sac.
                    const throb = 1.0 + Math.pow(Math.max(0, Math.sin(t * 4)), 3) * 0.18;
                    if (this.core && this.core.visible) this.core.scale.set(throb, throb, throb);
                    if (this.maw && this.maw.visible) { this.maw.rotation.y = t * 0.3; this.maw.children.forEach(c => { if (c.material) c.material.emissiveIntensity = 0.4 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.6; }); }
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 2.6) * 0.3;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 2.6 + 1) * 0.3;
                    break;
                }
                case 'timeloopstalker': {
                    this.model.rotation.z = hitJolt;
                    // Stuttering loop: solid figure jerks forward then snaps back.
                    const loop = (t % 0.9) / 0.9;
                    const step = loop < 0.7 ? (loop / 0.7) : (1 - (loop - 0.7) / 0.3);
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 6)) * 0.02 * this.scale;
                    if (this._solidFigure) this._solidFigure.position.z = step * 0.25;
                    if (this._afterImages) this._afterImages.forEach((g, i) => { g.children.forEach(c => { if (c.material) c.material.opacity = 0.16 * (Math.sin(t * 5 - i) * 0.5 + 0.5); }); });
                    if (this._clockHandH) this._clockHandH.rotation.z = -t * 1.2;
                    if (this._clockHandM) this._clockHandM.rotation.z = -t * 8;
                    if (this.tendril1 && this.tendril1.visible) this.tendril1.rotation.z = Math.sin(t * 3) * 0.2;
                    if (this.tendril2 && this.tendril2.visible) this.tendril2.rotation.z = -Math.sin(t * 3 + 1) * 0.2;
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
            this.model.rotation.z = prog * 0.6;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new AberrationBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = ABERRATION_PROFILES;
    reg('chestmimic',        { aliases: ['chestmimic', 'mimic', 'mimics', 'chest'], scale: S.chestmimic.scale, weapon: 0, create: make });
    reg('tentacledcreature', { aliases: ['tentacledcreature', 'tentacled', 'beholder', 'gazer'], scale: S.tentacledcreature.scale, weapon: 0, create: make });
    reg('voidspawn',         { aliases: ['voidspawn', 'void', 'abyssal', 'eldritch'], scale: S.voidspawn.scale, weapon: 0, create: make });
    reg('trashcreature',     { aliases: ['trashcreature', 'trash', 'junk', 'garbage', 'heap'], scale: S.trashcreature.scale, weapon: 0, create: make });
    reg('totem',             { aliases: ['totem', 'totems', 'idol'], scale: S.totem.scale, weapon: 0, create: make });
    reg('spikymonster',      { aliases: ['spikymonster', 'spiky', 'urchin', 'spikeball'], scale: S.spikymonster.scale, weapon: 0, create: make });
    reg('mutant',            { aliases: ['mutant', 'mutants', 'aberration', 'horror'], scale: S.mutant.scale, weapon: 0, create: make });
    reg('floatingeye',       { aliases: ['floatingeye'], scale: S.floatingeye.scale, weapon: 0, create: make });
    reg('nervoussystem',     { aliases: ['nervoussystem'], scale: S.nervoussystem.scale, weapon: 0, create: make });
    reg('realitybender',     { aliases: ['realitybender'], scale: S.realitybender.scale, weapon: 0, create: make });
    reg('recursiveparadox',  { aliases: ['recursiveparadox'], scale: S.recursiveparadox.scale, weapon: 0, create: make });
    reg('sentientmeme',      { aliases: ['sentientmeme'], scale: S.sentientmeme.scale, weapon: 0, create: make });
    reg('shoggoth',          { aliases: ['shoggoth'], scale: S.shoggoth.scale, weapon: 0, create: make });
    reg('voidmanipulator',     { aliases: ['voidmanipulator'], scale: S.voidmanipulator.scale, weapon: 0, create: make });
    reg('advertisementbadger', { aliases: ['advertisementbadger'], scale: S.advertisementbadger.scale, weapon: 0, create: make });
    reg('livingtheorem',       { aliases: ['livingtheorem'], scale: S.livingtheorem.scale, weapon: 0, create: make });
    reg('leylineaneurysm',     { aliases: ['leylineaneurysm'], scale: S.leylineaneurysm.scale, weapon: 0, create: make });
    reg('timeloopstalker',     { aliases: ['timeloopstalker'], scale: S.timeloopstalker.scale, weapon: 0, create: make });
    ['lv_gardenslug', 'lv_ditchleech', 'lv_nosypeeper', 'lv_staplermimic', 'lv_lostdollhead', 'lv_littercritter'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        floatingeye:      ["Wandering Eyeball"],
        u_eyeballslug:    ["Eyeball Slug"],
        nervoussystem:    ["Nervous System"],
        realitybender:    ["Reality Bender"],
        recursiveparadox: ["Recursive Paradox"],
        sentientmeme:     ["Sentient Meme"],
        shoggoth:         ["Shoggoth"],
        voidmanipulator:     ["Void Manipulator"],
        advertisementbadger: ["Advertisement Badger"],
        livingtheorem:       ["Living Theorem"],
        lv_gardenslug:       ["Garden Slug"],
        lv_ditchleech:       ["Ditch Leech"],
        lv_nosypeeper:       ["Nosy Peeper"],
        lv_staplermimic:     ["Stapler Mimic"],
        lv_lostdollhead:     ["Lost Doll Head"],
        lv_littercritter:    ["Litter Critter"],
        leylineaneurysm:     ["Leyline Aneurysm"],
        timeloopstalker:     ["Time-Loop Stalker"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Aberration family registered');

    reg('u_eyeballslug', { aliases: ['u_eyeballslug'], scale: S.u_eyeballslug.scale, weapon: 0, create: make });
})();
