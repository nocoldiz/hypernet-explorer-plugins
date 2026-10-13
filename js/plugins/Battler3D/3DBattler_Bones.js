//=============================================================================
// 3D Battler System - Bone Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke skeleton one-off models (ancient skeleton, bone warrior,
 * crypt sentinel, rotting skeleton) + name-based assignment. Requires
 * 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Bone Uniques
 * ============================================================================
 *
 * Distinct procedural skeletons shaped from each enemy's flavour text, assigned
 * by exact name (override with <Battler3D: key>). They map the Skeleton
 * (humanoid) archetype keys (HEAD/TORSO + arm/leg keys) so dismemberment works.
 *
 * Registered: ancientskeleton, bonewarrior, cryptsentinel, rottingskeleton,
 * and the level 1-5 lv_rattlingribcage and lv_chatteringskull (Ghost keys)
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Bones] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const K_PROFILES = {
        ancientskeleton: { variant: 'ancientskeleton', scale: 2.0, texturePool: 'bone', bodyColor: 0xcfc6a8, accent: 0x886633, hue: [0.12, 0.04], sat: [0.25, 0.08], lit: [0.66, 0.08] },
        bonewarrior:     { variant: 'bonewarrior',     scale: 2.1, texturePool: 'bone', bodyColor: 0xe0dcc8, accent: 0x8899aa, hue: [0.12, 0.03], sat: [0.12, 0.06], lit: [0.74, 0.06] },
        cryptsentinel:   { variant: 'cryptsentinel',   scale: 2.3, texturePool: 'bone', bodyColor: 0xd8d0bc, accent: 0x66aaff, hue: [0.12, 0.03], sat: [0.15, 0.06], lit: [0.70, 0.08] },
        rottingskeleton: { variant: 'rottingskeleton', scale: 2.0, texturePool: 'bone', bodyColor: 0xc8c0a0, accent: 0x6a7a3a, hue: [0.18, 0.05], sat: [0.25, 0.08], lit: [0.60, 0.08] },
        // ── Bespoke splits off bonewarrior ────────────────────────────────
        // Bone Warrior: clean-boned drilled soldier, helmet + sword + shield.
        bon_bonewarrior:      { variant: 'bon_bonewarrior',      scale: 2.1, texturePool: 'bone', bodyColor: 0xe0dcc8, accent: 0x8899aa, hue: [0.12, 0.03], sat: [0.12, 0.06], lit: [0.74, 0.06] },
        // Restless Revenant: chain-dragging grave-cold thing, no armour.
        bon_restlessrevenant: { variant: 'bon_restlessrevenant', scale: 2.1, texturePool: 'bone', bodyColor: 0xb8bcc0, accent: 0x7fa0b0, hue: [0.55, 0.04], sat: [0.10, 0.06], lit: [0.62, 0.08] },
        // Gilded Lichling: gold-leafed ancient dead, ornate crown + scepter.
        bon_gildedlichling:   { variant: 'bon_gildedlichling',   scale: 2.2, texturePool: 'bone', bodyColor: 0xe8e0c0, accent: 0xffcc44, hue: [0.12, 0.03], sat: [0.20, 0.06], lit: [0.72, 0.06] },
        // ── Bespoke splits off rottingskeleton ────────────────────────────
        // Rotting Skeleton: rusted-blade brittle skeleton with clinging rot.
        bon_rottingskeleton:  { variant: 'bon_rottingskeleton',  scale: 2.0, texturePool: 'bone', bodyColor: 0xc8c0a0, accent: 0x6a7a3a, hue: [0.18, 0.05], sat: [0.25, 0.08], lit: [0.60, 0.08] },
        // Cinder-Wrapped Thrall: charred bones with smouldering ember motes.
        bon_cinderthrall:     { variant: 'bon_cinderthrall',     scale: 2.0, texturePool: 'bone', bodyColor: 0x6a5048, accent: 0xff6622, hue: [0.03, 0.03], sat: [0.35, 0.10], lit: [0.36, 0.08] },
        // Sunken Pallbearer: waterlogged bog-corpse, dripping, algae-stained.
        bon_sunkenpallbearer: { variant: 'bon_sunkenpallbearer', scale: 2.1, texturePool: 'bone', bodyColor: 0xa8aa88, accent: 0x88aa55, hue: [0.28, 0.05], sat: [0.22, 0.08], lit: [0.52, 0.08] },
        // ── Level 1-5 roster (bespoke) ────────────────────────────────────
        // Rattling Ribcage: a headless barrel of ribs on two long legs, a candle
        // burning where the heart was and its jaw hung from a rib on a string.
        lv_rattlingribcage: { variant: 'lv_rattlingribcage', scale: 2.0, texturePool: 'bone', bodyColor: 0xd8ceb0, accent: 0xffb040, hue: [0.12, 0.04], sat: [0.20, 0.08], lit: [0.70, 0.08] },
        // Chattering Skull (Ghost keys): a floating skull in a jester's cap,
        // jaw on a hinge, a ghostly spine trailing under it.
        lv_chatteringskull: { variant: 'lv_chatteringskull', scale: 1.8, texturePool: 'bone', bodyColor: 0xeee4c8, accent: 0x88ffcc, hue: [0.12, 0.03], sat: [0.18, 0.06], lit: [0.82, 0.06] }
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    class BoneBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = K_PROFILES[creatureType] || K_PROFILES.ancientskeleton;
            super(scale, offsetY, battler, profile, 0, creatureType || 'ancientskeleton');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        // Per-enemy variation: clone the shared profile, jitter colours, and tint
        // by the enemy's own name so a shared skeleton group reads as individuals.
        _jit(hex, amt) { let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; const f = () => 1 + (this.idRand() - 0.5) * 2 * amt; r = Math.max(0, Math.min(255, Math.round(r * f()))); g = Math.max(0, Math.min(255, Math.round(g * f()))); b = Math.max(0, Math.min(255, Math.round(b * f()))); return (r << 16) | (g << 8) | b; }
        _enemyName() { try { const id = this.battler && this.battler.enemyId && this.battler.enemyId(); if (id && typeof $dataEnemies !== 'undefined' && $dataEnemies[id]) return String($dataEnemies[id].name || ''); } catch (e) {} return ''; }
        _varyProfile() {
            const p = Object.assign({}, this.profile);
            p.bodyColor = this._jit(p.bodyColor, 0.08); p.accent = this._jit(p.accent, 0.12);
            const nm = this._enemyName().toLowerCase(), has = w => nm.indexOf(w) >= 0;
            if (has('cinder') || has('ember') || has('charred') || has('ashen') || has('scorch')) { p.accent = 0xff6622; p.bodyColor = this._jit(0x6a5048, 0.06); }
            else if (has('salt') || has('frost') || has('frozen') || has('rime') || has('winter')) { p.accent = 0x88e0ff; p.bodyColor = this._jit(0xd6dce0, 0.05); }
            else if (has('gilded') || has('golden')) { p.accent = 0xffcc44; }
            else if (has('crypt') || has('grave') || has('sunken') || has('murk') || has('bog') || has('mire')) { p.accent = 0x88aa55; p.bodyColor = this._jit(0xa8aa88, 0.06); }
            else if (has('plague') || has('festering') || has('rotting') || has('pox') || has('withered')) { p.accent = 0x9acc4a; p.bodyColor = this._jit(0xb8b890, 0.06); }
            else if (has('blood') || has('crimson') || has('scarlet')) { p.accent = 0xcc2233; }
            else if (has('shadow') || has('void') || has('night') || has('umbral')) { p.accent = 0x9933cc; }
            this.profile = p;
        }
        _boneLimb(x, y, mat) {
            const g = new THREE.Group();
            const u = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.36, 6), mat); u.position.y = -0.16; g.add(u);
            const joint = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat); joint.position.y = -0.34; g.add(joint);
            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.34, 6), mat); l.position.y = -0.52; g.add(l);
            const end = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat); end.position.y = -0.7; g.add(end);
            g.position.set(x, y, 0); this.bodyGroup.add(g); return g;
        }
        _skeletonBase(o) {
            o = o || {};
            const p = this.profile;
            const bone = o.mat || this._skinMat(p.bodyColor, 0.6);
            this._boneMat = bone;
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), bone); skull.scale.set(1, 1.05, 1.05); this.head.add(skull);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.22), bone); jaw.position.set(0, -0.2, 0.04); this.head.add(jaw); this.head._jaw = jaw;
            for (const ex of [-0.1, 0.1]) { const soc = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(0x0a0a08, 1, 0.3, o.eyeGlow || null)); soc.position.set(ex, 0.02, 0.22); this.head.add(soc); }
            this.head.position.set(0, 1.55, 0); this.bodyGroup.add(this.head);
            this.torso = new THREE.Group();
            const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), bone); this.torso.add(spine);
            for (let i = 0; i < 4; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.015, 0.02, 6, 12, Math.PI), bone); rib.position.y = 0.22 - i * 0.13; rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI; this.torso.add(rib); rib._ancient = i; }
            const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), bone); pelvis.position.y = -0.42; this.torso.add(pelvis);
            this.torso.position.set(0, 1.0, 0); this.bodyGroup.add(this.torso);
            this.leftArm = this._boneLimb(-0.28, 1.28, bone); this.rightArm = this._boneLimb(0.28, 1.28, bone);
            this.leftLeg = this._boneLimb(-0.12, 0.55, bone); this.rightLeg = this._boneLimb(0.12, 0.55, bone);
            this._partMeshMap = {};
            ['HEAD', 'SKULL', 'BRAIN', 'TEETH', 'MOUTH', 'EYE_LEFT', 'EYE_RIGHT', 'HELMET'].forEach(k => this._partMeshMap[k] = this.head);
            ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'HEART', 'MASS', 'PELVIS', 'CHESTPLATE'].forEach(k => this._partMeshMap[k] = this.torso);
            ['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_FOREARM', 'LEFT_HAND', 'PAULDRON_LEFT'].forEach(k => this._partMeshMap[k] = this.leftArm);
            ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_FOREARM', 'RIGHT_HAND', 'CLAWS'].forEach(k => this._partMeshMap[k] = this.rightArm);
            ['LEFT_LEG', 'LEFT_THIGH', 'LEFT_SHIN', 'LEFT_FOOT', 'GREAVES_LEFT'].forEach(k => this._partMeshMap[k] = this.leftLeg);
            ['RIGHT_LEG', 'RIGHT_THIGH', 'RIGHT_SHIN', 'RIGHT_FOOT', 'GREAVES_RIGHT'].forEach(k => this._partMeshMap[k] = this.rightLeg);
            const extra = (o.extra || []).filter(Boolean);
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.torso, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, ...extra] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            this._varyProfile();
            switch (this.variant) {
                case 'bonewarrior':          this._buildBoneWarrior(); break;
                case 'cryptsentinel':        this._buildCryptSentinel(); break;
                case 'rottingskeleton':      this._buildRottingSkeleton(); break;
                case 'bon_bonewarrior':      this._buildBonBoneWarrior(); break;
                case 'bon_restlessrevenant': this._buildBonRestlessRevenant(); break;
                case 'bon_gildedlichling':   this._buildBonGildedLichling(); break;
                case 'bon_rottingskeleton':  this._buildBonRottingSkeleton(); break;
                case 'bon_cinderthrall':     this._buildBonCinderThrall(); break;
                case 'bon_sunkenpallbearer': this._buildBonSunkenPallbearer(); break;
                case 'lv_rattlingribcage':   this._buildRattlingRibcage(); break;
                case 'lv_chatteringskull':   this._buildChatteringSkull(); break;
                default:                     this._buildAncientSkeleton(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Ancient Skeleton: crumbling, cracked, shedding dust ─────────────
        _buildAncientSkeleton() {
            const p = this.profile;
            this._skeletonBase({});
            // A couple of ribs already missing (remove last rib visually).
            const ribs = this.torso.children.filter(c => c._ancient !== undefined);
            if (ribs[3]) ribs[3].visible = false;
            // Cracks across the skull.
            for (let i = 0; i < 3; i++) { const crack = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.18, 0.02), this._mat(0x4a4030, 1, 0.7)); crack.position.set((this.idRand() - 0.5) * 0.3, 0.05, 0.24); crack.rotation.z = this.idRand() * 1.5; this.head.add(crack); }
            // Falling dust.
            this.dust = new THREE.Group();
            this.dust.userData.float = true;   // falling dust by design
            for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 5), this._mat(p.accent, 0.6, 0.9)); d.position.set((this.idRand() - 0.5) * 0.6, 0.4 + this.idRand() * 1.2, (this.idRand() - 0.5) * 0.4); d._t = this.idRand(); this.dust.add(d); }
            this.bodyGroup.add(this.dust);
            this._cascadeRules[0].hide.push(this.dust);
        }

        // ── Bone Warrior: helmeted skeleton with sword and shield ──────────
        _buildBoneWarrior() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: 0x66ccff });
            const steel = this._mat(p.accent, 1.0, 0.4);
            // Helmet.
            const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), steel); helm.position.y = 0.04; helm.scale.set(1.1, 1.1, 1.1); this.head.add(helm);
            const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), steel); nasal.position.set(0, -0.02, 0.28); this.head.add(nasal);
            // Sword in right hand.
            this.weapon = new THREE.Group();
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.02), steel); blade.position.y = 0.4; this.weapon.add(blade);
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), this._mat(0x6a5030, 1, 0.5)); guard.position.y = 0.08; this.weapon.add(guard);
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), this._mat(0x3a2a18, 1, 0.6)); this.weapon.add(grip);
            this.weapon.position.set(0.32, 0.95, 0.1); this.bodyGroup.add(this.weapon);
            // Round shield on left arm.
            this.shield = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 16), this._mat(0x7a6242, 1, 0.6)); this.shield.position.set(-0.36, 1.1, 0.12); this.shield.rotation.x = Math.PI / 2; this.bodyGroup.add(this.shield);
            const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), steel); boss.position.set(-0.36, 1.1, 0.18); this.bodyGroup.add(boss);
            this._partMeshMap.SHIELD = this.shield;
            this._cascadeRules[0].hide.push(this.weapon, this.shield, boss);
        }

        // ── Crypt Sentinel: tall tomb-guardian with a halberd and cloak ────
        _buildCryptSentinel() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: p.accent });
            // Tattered cloak draped behind.
            this.cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 10, 1, true), this._mat(0x2a3038, 0.92, 0.85)); this.cloak.position.set(0, 0.9, -0.18); this.bodyGroup.add(this.cloak);
            // Halberd in right hand.
            this.weapon = new THREE.Group();
            const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), this._mat(0x3a2a18, 1, 0.7)); this.weapon.add(haft);
            const axe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), this._mat(p.accent, 1, 0.4)); axe.position.set(0.14, 0.62, 0); this.weapon.add(axe);
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 6), this._mat(p.accent, 1, 0.4, p.accent)); spike.position.y = 0.92; this.weapon.add(spike);
            this.weapon.position.set(0.34, 1.0, 0.1); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.cloak, this.weapon);
        }

        // ── Rotting Skeleton: bone with clinging rot and a rusted blade ────
        _buildRottingSkeleton() {
            const p = this.profile;
            this._skeletonBase({});
            // Rot patches clinging to the bones.
            this.rot = new THREE.Group();
            for (let i = 0; i < 7; i++) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.07 + this.idRand() * 0.05, 8, 8), this._mat(p.accent, 0.95, 0.85)); patch.position.set((this.idRand() - 0.5) * 0.5, 0.6 + this.idRand() * 0.8, 0.1 + this.idRand() * 0.15); patch.scale.set(1, 0.7, 0.6); this.rot.add(patch); }
            this.bodyGroup.add(this.rot);
            // Jagged rusted blade.
            this.weapon = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 4), this._mat(0x6a4a32, 1, 0.85)); this.weapon.position.set(0.32, 1.2, 0.1); this.weapon.scale.set(1, 1, 0.3); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.rot, this.weapon);
        }

        // ── Bone Warrior (split): drilled soldier, plumed helm, longsword ──
        _buildBonBoneWarrior() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: 0x66ccff });
            const steel = this._mat(p.accent, 1.0, 0.4);
            // Crested helmet with a bone plume.
            const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), steel); helm.position.y = 0.05; helm.scale.set(1.1, 1.15, 1.1); this.head.add(helm);
            const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.34), this._skinMat(p.bodyColor, 0.6)); crest.position.set(0, 0.28, -0.02); this.head.add(crest);
            const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), steel); nasal.position.set(0, -0.02, 0.28); this.head.add(nasal);
            // Longsword in the right hand.
            this.weapon = new THREE.Group();
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.02), steel); blade.position.y = 0.44; this.weapon.add(blade);
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), this._mat(0x6a5030, 1, 0.5)); guard.position.y = 0.08; this.weapon.add(guard);
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 6), this._mat(0x3a2a18, 1, 0.6)); this.weapon.add(grip);
            this.weapon.position.set(0.32, 0.95, 0.1); this.bodyGroup.add(this.weapon);
            // Kite shield on the left arm.
            this.shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.05, 3), this._mat(0x7a6242, 1, 0.6)); this.shield.position.set(-0.36, 1.08, 0.12); this.shield.rotation.set(Math.PI / 2, 0, Math.PI); this.bodyGroup.add(this.shield);
            const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), steel); boss.position.set(-0.36, 1.08, 0.18); this.bodyGroup.add(boss);
            this._partMeshMap.SHIELD = this.shield;
            this._cascadeRules[0].hide.push(this.weapon, this.shield, boss);
        }

        // ── Restless Revenant: chain-dragging grave-cold dead, unarmed ─────
        _buildBonRestlessRevenant() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: p.accent });
            // Rusted manacles on the wrists trailing a dangling chain (links
            // interlocked and hung off the wrist bone).
            const iron = this._mat(0x554a44, 1, 0.75);
            this.chains = new THREE.Group();
            for (const side of [-1, 1]) {
                const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 6, 12), iron); cuff.position.set(side * 0.28, 0.65, 0.02); cuff.rotation.x = Math.PI / 2; this.chains.add(cuff);
                for (let i = 0; i < 4; i++) { const link = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 5, 10), iron); link.position.set(side * 0.28 + (this.idRand() - 0.5) * 0.02, 0.6 - i * 0.06, 0.02); link.rotation.x = (i % 2) * Math.PI / 2; this.chains.add(link); }
            }
            this.bodyGroup.add(this.chains);
            // Grave-cold vapour clinging to the ribcage.
            this.frost = new THREE.Group();
            this.frost.userData.float = true;   // drifting vapour by design
            for (let i = 0; i < 6; i++) { const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.05 + this.idRand() * 0.03, 6, 6), this._mat(0xbfe0ec, 0.35, 0.9, 0x335566)); wisp.position.set((this.idRand() - 0.5) * 0.5, 0.7 + this.idRand() * 0.6, 0.05 + this.idRand() * 0.12); wisp._t = this.idRand(); this.frost.add(wisp); }
            this.bodyGroup.add(this.frost);
            this._cascadeRules[0].hide.push(this.chains, this.frost);
        }

        // ── Gilded Lichling: gold-leafed ancient dead, crown and scepter ───
        _buildBonGildedLichling() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: 0xffcc44 });
            const gold = this._mat(p.accent, 1.0, 0.3, 0x3a2a08);
            // Spiked crown.
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12, 1, true), gold); band.material.side = THREE.DoubleSide; band.position.y = 0.16; this.head.add(band);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), gold); pt.position.set(Math.cos(a) * 0.27, 0.27, Math.sin(a) * 0.27); this.head.add(pt); }
            // Gilded ribs (alternate ribs plated in gold).
            const ribs = this.torso.children.filter(c => c._ancient !== undefined);
            ribs.forEach((rib, i) => { if (i % 2 === 0) { const plate = new THREE.Mesh(new THREE.TorusGeometry(0.2 - i * 0.015, 0.025, 6, 12, Math.PI), gold); plate.position.copy(rib.position); plate.rotation.copy(rib.rotation); this.torso.add(plate); } });
            // Ornate scepter in the right hand.
            this.weapon = new THREE.Group();
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), gold); shaft.position.y = 0.1; this.weapon.add(shaft);
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), this._mat(0x66ffcc, 0.9, 0.3, 0x22aa88)); orb.position.y = 0.6; this.weapon.add(orb);
            this.weapon.position.set(0.34, 1.0, 0.1); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.weapon);
        }

        // ── Rotting Skeleton (split): brittle bone, clinging rot, rusted blade
        _buildBonRottingSkeleton() {
            const p = this.profile;
            this._skeletonBase({});
            // Rot patches clinging to the bones.
            this.rot = new THREE.Group();
            for (let i = 0; i < 7; i++) { const patch = new THREE.Mesh(new THREE.SphereGeometry(0.07 + this.idRand() * 0.05, 8, 8), this._mat(p.accent, 0.95, 0.85)); patch.position.set((this.idRand() - 0.5) * 0.5, 0.6 + this.idRand() * 0.8, 0.1 + this.idRand() * 0.15); patch.scale.set(1, 0.7, 0.6); this.rot.add(patch); }
            this.bodyGroup.add(this.rot);
            // Jagged rusted blade.
            this.weapon = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.72, 4), this._mat(0x6a4a32, 1, 0.85)); this.weapon.position.set(0.32, 1.2, 0.1); this.weapon.scale.set(1, 1, 0.3); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.rot, this.weapon);
        }

        // ── Cinder-Wrapped Thrall: charred bones, ember motes, burnt wraps ─
        _buildBonCinderThrall() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: 0xff6622, mat: this._skinMat(p.bodyColor, 0.9) });
            // Scorched cloth wrappings.
            const wrap = this._mat(0x2a1a12, 0.95, 0.95); wrap.side = THREE.DoubleSide;
            const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.7, 8, 1, true), wrap); shroud.position.y = 0.0; this.torso.add(shroud);
            // Smouldering ember motes drifting up from the body.
            this.embers = new THREE.Group();
            this.embers.userData.float = true;   // rising embers by design
            for (let i = 0; i < 10; i++) { const em = new THREE.Mesh(new THREE.SphereGeometry(0.02 + this.idRand() * 0.015, 5, 5), this._mat(p.accent, 0.9, 0.4, 0xff8833)); em.position.set((this.idRand() - 0.5) * 0.55, 0.4 + this.idRand() * 1.2, (this.idRand() - 0.5) * 0.35); em._t = this.idRand(); this.embers.add(em); }
            this.bodyGroup.add(this.embers);
            // Charred jagged club.
            this.weapon = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 0.66, 5), this._mat(0x1a120c, 1, 0.95)); this.weapon.position.set(0.32, 1.15, 0.1); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.embers, this.weapon);
        }

        // ── Sunken Pallbearer: waterlogged bog-corpse, dripping, algae-hung ─
        _buildBonSunkenPallbearer() {
            const p = this.profile;
            this._skeletonBase({ eyeGlow: 0x66aa88 });
            // Algae strands hanging off the ribs and arms.
            const algae = this._mat(p.accent, 0.9, 0.85);
            this.weeds = new THREE.Group();
            for (let i = 0; i < 8; i++) { const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.005, 0.18 + this.idRand() * 0.12, 4), algae); const a = this.idRand() * Math.PI * 2; strand.position.set(Math.cos(a) * 0.22, 0.7 + this.idRand() * 0.5, Math.sin(a) * 0.15 + 0.08); strand.rotation.z = (this.idRand() - 0.5) * 0.4; this.weeds.add(strand); }
            this.bodyGroup.add(this.weeds);
            // Dripping water droplets.
            this.drips = new THREE.Group();
            this.drips.userData.float = true;   // falling drips by design
            for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 5), this._mat(0x557766, 0.6, 0.2, 0x113322)); d.position.set((this.idRand() - 0.5) * 0.5, 0.4 + this.idRand() * 1.1, 0.1 + this.idRand() * 0.12); d._t = this.idRand(); this.drips.add(d); }
            this.bodyGroup.add(this.drips);
            // Waterlogged plank carried as a bludgeon.
            this.weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.05), this._mat(0x3a4838, 1, 0.9)); this.weapon.position.set(0.32, 1.15, 0.1); this.bodyGroup.add(this.weapon);
            this._cascadeRules[0].hide.push(this.weeds, this.drips, this.weapon);
        }

        // ── Rattling Ribcage: a ribcage walking about looking for its skull ─
        // TORSO is the barrel of ribs on its spine and pelvis; HEAD is the
        // empty stack of neck bones on top (there is no skull); JAWS is the
        // jawbone it keeps hung off a rib; a candle burns inside the ribs.
        _buildRattlingRibcage() {
            const p = this.profile;
            const bone = this._skinMat(p.bodyColor, 0.6);
            this._boneMat = bone;
            this.torso = new THREE.Group(); this.torso.position.set(0, 1.05, 0); this.bodyGroup.add(this.torso);
            const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.22), bone); pelvis.position.y = -0.3; this.torso.add(pelvis);
            this.addStrut(this.torso, bone, V(0, -0.3, -0.12), V(0, 0.55, -0.16), 0.05, 0.045, 6);
            for (let k = 0; k < 6; k++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 6), bone); v.position.set(0, -0.15 + k * 0.13, -0.135 - k * 0.004); this.torso.add(v); }
            // Barrel ribs: full loops from the spine round to a sternum bar.
            const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.04), bone); sternum.position.set(0, 0.25, 0.22); sternum.rotation.x = -0.12; this.torso.add(sternum);
            this._ribs = [];
            for (let k = 0; k < 6; k++) {
                const y = 0.02 + k * 0.09, w = 0.24 + Math.sin((k + 0.5) / 6 * Math.PI) * 0.08;
                // A unit ring squashed into an oval hoop (scale: width, depth, bone thickness).
                const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 4, 14), bone);
                rib.rotation.x = Math.PI / 2; rib.position.set(0, y, 0.03); rib.scale.set(w, 0.19 + k * 0.006, 0.22);
                this.torso.add(rib); this._ribs.push(rib);
            }
            // The candle stub where the heart was.
            const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), bone); shelf.position.set(0, 0.0, 0.0); this.torso.add(shelf);
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.14, 6), this._mat(0xf0e8c8, 1, 0.7)); candle.position.set(0, 0.085, 0.0); this.torso.add(candle);
            this._flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), this._mat(p.accent, 0.95, 0.3, 0xff8a20)); this._flame.position.set(0, 0.2, 0.0); this.torso.add(this._flame);
            // HEAD: just the neck vertebrae, ending in nothing.
            this.head = new THREE.Group(); this.head.position.set(0, 1.6, -0.16); this.bodyGroup.add(this.head);
            for (let k = 0; k < 3; k++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05 - k * 0.006, 0.055 - k * 0.006, 0.05, 6), bone); v.position.y = k * 0.06; this.head.add(v); const spur = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 3), bone); spur.position.set(0, k * 0.06, -0.06); spur.rotation.x = -1.8; this.head.add(spur); }
            this.addStrut(this.head, bone, V(0, -0.05, 0), V(0, 0.13, 0), 0.025, 0.02, 4);
            // JAWS: the jaw hung on a string from the lowest left rib.
            this.jaw = new THREE.Group(); this.jaw.position.set(-0.25, 1.08, 0.05); this.bodyGroup.add(this.jaw);
            this.addStrut(this.jaw, this._mat(0x6a5a40, 1, 0.9), V(0, 0, 0), V(0, -0.22, 0), 0.006, 0.006, 3);
            const jawBone = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI), bone); jawBone.rotation.x = Math.PI / 2; jawBone.rotation.z = Math.PI; jawBone.position.set(0, -0.24, 0.0); this.jaw.add(jawBone);
            for (let k = 0; k < 4; k++) { const a = Math.PI * (0.2 + k * 0.2); const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), bone); t.position.set(Math.cos(a) * 0.08, -0.22, Math.sin(a) * 0.08 - 0.0); this.jaw.add(t); }
            // Arms: two short bone arms off the top ribs; legs: long, with feet.
            this.leftArm = this._boneLimb(-0.3, 1.45, bone); this.rightArm = this._boneLimb(0.3, 1.45, bone);
            this.leftArm.scale.setScalar(0.8); this.rightArm.scale.setScalar(0.8);
            this.leftArm.rotation.z = -0.15; this.rightArm.rotation.z = 0.15;
            this.leftLeg = this._boneLimb(-0.13, 0.78, bone); this.rightLeg = this._boneLimb(0.13, 0.78, bone);
            for (const leg of [this.leftLeg, this.rightLeg]) { const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.2), bone); foot.position.set(0, -0.73, 0.06); leg.add(foot); }
            const m = {}, set = (ks, me) => ks.forEach(k => m[k] = me);
            set(['HEAD', 'SKULL', 'BRAIN', 'NECK'], this.head);
            set(['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'HEART', 'PELVIS'], this.torso);
            set(['JAWS', 'MOUTH', 'TEETH'], this.jaw);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_HAND'], this.leftArm); set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_HAND'], this.rightArm);
            set(['LEFT_LEG', 'LEFT_THIGH', 'LEFT_FOOT'], this.leftLeg); set(['RIGHT_LEG', 'RIGHT_THIGH', 'RIGHT_FOOT'], this.rightLeg);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.torso, this.head, this.jaw, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['JAWS'], hide: [this.jaw] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
            ];
        }

        // ── Chattering Skull (Ghost keys): a joker of a floating skull ──────
        // FACE is the cranium with its jester's cap, MAW the hinged jaw (it
        // pivots at the back of the skull, so it never leaves it), CORE the
        // ghostly spine trailing below, LEFT_WISP / RIGHT_WISP the spirit
        // flames curling off its temples.
        _buildChatteringSkull() {
            const p = this.profile;
            const bone = this._skinMat(p.bodyColor, 0.5);
            const dark = this._mat(0x0a0806, 1, 0.6);
            const ghost = this._mat(p.accent, 0.45, 0.3, p.accent);
            this.face = new THREE.Group(); this.face.position.set(0, 1.35, 0); this.bodyGroup.add(this.face);
            const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), bone); cranium.scale.set(1, 0.95, 1.08); this.face.add(cranium);
            const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.3), bone); cheek.position.set(0, -0.16, 0.08); this.face.add(cheek);
            for (const s of [-1, 1]) {
                const sock = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 5), dark); sock.position.set(s * 0.11, -0.01, 0.25); sock.scale.z = 0.6; this.face.add(sock);
                const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 4), this._mat(p.accent, 1, 0.2, p.accent)); glint.position.set(s * 0.11, -0.01, 0.29); this.face.add(glint);
            }
            const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 3), dark); nose.position.set(0, -0.11, 0.3); nose.rotation.x = Math.PI; this.face.add(nose);
            for (let k = 0; k < 6; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.03), this._mat(0xf8f2e0, 1, 0.4)); t.position.set((k - 2.5) * 0.04, -0.24, 0.22); this.face.add(t); }
            // The jester's cap: two floppy points with bells, a band round the brow.
            const capRed = this._mat(0xb02030, 1, 0.8), capPurple = this._mat(0x5a2a8a, 1, 0.8);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.04, 4, 12), capPurple); band.rotation.x = Math.PI / 2 - 0.2; band.position.y = 0.12; this.face.add(band);
            this._bells = [];
            for (const s of [-1, 1]) {
                const c = new THREE.CatmullRomCurve3([V(s * 0.08, 0.2, 0), V(s * 0.22, 0.42, -0.02), V(s * 0.38, 0.4, 0.0), V(s * 0.44, 0.24, 0.04)]);
                this.face.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.07, 5, false), s < 0 ? capRed : capPurple));
                const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), this._mat(0xe8c040, 1, 0.3, 0x3a2a00)); bell.position.set(s * 0.44, 0.19, 0.04); this.face.add(bell); this._bells.push(bell);
            }
            // MAW: the lower jaw hinged at the back of the skull.
            this.maw = new THREE.Group(); this.maw.position.set(0, -0.2, -0.08); this.face.add(this.maw);
            const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 4, 9, Math.PI), bone); jaw.rotation.set(Math.PI / 2, 0, 0); jaw.position.set(0, -0.05, 0.12); jaw.scale.set(1, 1.2, 1); this.maw.add(jaw);
            this.addStrut(this.maw, bone, V(-0.15, 0.02, -0.02), V(-0.17, -0.05, 0.12), 0.035, 0.035, 4);
            this.addStrut(this.maw, bone, V(0.15, 0.02, -0.02), V(0.17, -0.05, 0.12), 0.035, 0.035, 4);
            for (let k = 0; k < 6; k++) { const a = Math.PI * (0.15 + k * 0.14); const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), this._mat(0xf8f2e0, 1, 0.4)); t.position.set(-Math.cos(a) * 0.17, -0.01, 0.12 + Math.sin(a) * 0.2); this.maw.add(t); }
            // CORE: a ghostly spine trailing off beneath it.
            this.core = new THREE.Group(); this.core.position.set(0, 1.08, -0.06); this.bodyGroup.add(this.core);
            this._spine = [];
            for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.075 - k * 0.011, 6, 4), ghost); v.position.set(0, -k * 0.09, -k * 0.03); v.scale.y = 0.7; this.core.add(v); v._k = k; this._spine.push(v); }
            this.addStrut(this.core, ghost, V(0, 0.15, 0.02), V(0, 0, 0), 0.05, 0.05, 5);
            // LEFT_WISP / RIGHT_WISP: spirit flames off the temples.
            const wisp = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.27, 1.38, -0.04); this.bodyGroup.add(g);
                for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06 - k * 0.012, 0.2, 5), ghost); f.position.set(side * (0.06 + k * 0.08), 0.06 + k * 0.05, -k * 0.03); f.rotation.z = -side * (0.9 + k * 0.2); g.add(f); }
                g._side = side; return g;
            };
            this.leftWisp = wisp(-1); this.rightWisp = wisp(1);
            this._partMeshMap = { FACE: this.face, HEAD: this.face, SKULL: this.face, MAW: this.maw, JAWS: this.maw, MOUTH: this.maw, CORE: this.core, BODY: this.core, LEFT_WISP: this.leftWisp, RIGHT_WISP: this.rightWisp };
            this._cascadeRules = [
                { gone: ['CORE', 'BODY'], hide: [this.core, this.face, this.leftWisp, this.rightWisp] },
                { gone: ['FACE', 'HEAD', 'SKULL'], hide: [this.face, this.leftWisp, this.rightWisp] },
                { gone: ['MAW', 'JAWS'], hide: [this.maw] },
                { gone: ['LEFT_WISP'], hide: [this.leftWisp] },
                { gone: ['RIGHT_WISP'], hide: [this.rightWisp] },
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
            // Shared: jaw chatter + slight bony sway.
            if (this.head && this.head._jaw) this.head._jaw.position.y = -0.2 - Math.abs(Math.sin(t * (fast ? 12 : 5))) * 0.05;
            if (this.torso) this.torso.rotation.z = Math.sin(t * 1.5) * 0.03;
            if (this.leftArm) this.leftArm.rotation.x = Math.sin(t * 1.8) * 0.12;

            switch (this.variant) {
                case 'ancientskeleton': {
                    this.model.rotation.z = Math.sin(t * 8) * 0.01; // crumbly tremble
                    if (this.dust) this.dust.children.forEach(d => { d.position.y -= 0.01; if (d.position.y < 0.3) d.position.y = 1.5; });
                    break;
                }
                case 'bonewarrior': {
                    if (this.weapon) this.weapon.rotation.x = fast ? -Math.PI / 2 + Math.sin(t * 12) * 0.6 : Math.sin(t * 1.5) * 0.1; // sword ready / swing
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.8 : -0.2;
                    break;
                }
                case 'cryptsentinel': {
                    if (this.cloak) this.cloak.rotation.z = Math.sin(t * 1.2) * 0.04;
                    if (this.weapon) this.weapon.rotation.z = 0.05 + (fast ? Math.sin(t * 8) * 0.3 : 0); // guard / strike
                    break;
                }
                case 'rottingskeleton': {
                    if (this.weapon) this.weapon.rotation.x = fast ? Math.sin(t * 10) * 0.5 : 0.1;
                    break;
                }
                case 'bon_bonewarrior': {
                    if (this.weapon) this.weapon.rotation.x = fast ? -Math.PI / 2 + Math.sin(t * 12) * 0.6 : Math.sin(t * 1.5) * 0.1; // sword ready / swing
                    if (this.rightArm) this.rightArm.rotation.x = fast ? -0.8 : -0.2;
                    break;
                }
                case 'bon_restlessrevenant': {
                    if (this.chains) this.chains.rotation.z = Math.sin(t * 1.1) * 0.05; // chains sway
                    if (this.frost) this.frost.children.forEach(w => { w.position.y += Math.sin(t * 1.5 + w._t * 6) * 0.002; });
                    break;
                }
                case 'bon_gildedlichling': {
                    if (this.weapon) this.weapon.rotation.z = 0.04 + (fast ? Math.sin(t * 8) * 0.25 : Math.sin(t * 1.3) * 0.03); // scepter gesture
                    break;
                }
                case 'bon_rottingskeleton': {
                    if (this.weapon) this.weapon.rotation.x = fast ? Math.sin(t * 10) * 0.5 : 0.1;
                    break;
                }
                case 'bon_cinderthrall': {
                    if (this.embers) this.embers.children.forEach(e => { e.position.y += 0.012; if (e.position.y > 1.8) e.position.y = 0.4; });
                    if (this.weapon) this.weapon.rotation.x = fast ? Math.sin(t * 10) * 0.5 : 0.08;
                    break;
                }
                case 'lv_rattlingribcage': {
                    // A stiff-legged walk that rattles the ribs; the jaw swings on its string.
                    const step = Math.sin(t * (fast ? 7 : 2.4)) * (fast ? 0.35 : 0.18);
                    if (this.leftLeg) this.leftLeg.rotation.x = step;
                    if (this.rightLeg) this.rightLeg.rotation.x = -step;
                    if (this.leftArm) this.leftArm.rotation.x = -step * 0.6 + (fast ? -0.6 : 0);
                    if (this.rightArm) this.rightArm.rotation.x = step * 0.6 + (fast ? -0.6 : 0);
                    if (this._ribs) this._ribs.forEach((r, i) => { r.rotation.z = Math.sin(t * 22 + i) * (fast ? 0.05 : 0.02); });
                    if (this.jaw) { this.jaw.rotation.x = Math.sin(t * 2.1) * 0.25; this.jaw.rotation.z = Math.sin(t * 1.7) * 0.15; }
                    if (this._flame) this._flame.scale.y = 0.8 + Math.abs(Math.sin(t * 9)) * 0.4;
                    break;
                }
                case 'lv_chatteringskull': {
                    // Floats and chatters: the jaw clacks on its hinge, bells jingle.
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.06 * this.scale;
                    if (this.maw) this.maw.rotation.x = Math.abs(Math.sin(t * (fast ? 16 : 7))) * (fast ? 0.45 : 0.22);
                    if (this.face) this.face.rotation.z = Math.sin(t * 1.3) * 0.12;
                    if (this._bells) this._bells.forEach((b, i) => { b.position.y = 0.19 + Math.sin(t * 9 + i * 2) * 0.012; });
                    if (this._spine) this._spine.forEach(v => { v.position.x = Math.sin(t * 2.4 - v._k * 0.8) * 0.02 * v._k; });
                    [this.leftWisp, this.rightWisp].forEach(w => { if (w) w.rotation.z = w._side * Math.sin(t * 3.3) * 0.15; });
                    break;
                }
                case 'bon_sunkenpallbearer': {
                    if (this.weeds) this.weeds.rotation.z = Math.sin(t * 1.2) * 0.04; // waterweed drift
                    if (this.drips) this.drips.children.forEach(d => { d.position.y -= 0.014; if (d.position.y < 0.3) d.position.y = 1.4; });
                    if (this.weapon) this.weapon.rotation.x = fast ? Math.sin(t * 9) * 0.5 : 0.06;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Collapse into a heap of bones.
            this.model.position.y = this._baseY - prog * 0.35 * this.scale;
            if (this.head) this.head.position.y = 1.55 - prog * 1.0;
            if (this.torso) this.torso.scale.y = 1 - prog * 0.6;
            this.model.rotation.z = prog * 0.3;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new BoneBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = K_PROFILES;
    reg('ancientskeleton', { aliases: ['ancientskeleton'], scale: S.ancientskeleton.scale, weapon: 0, create: make });
    reg('bonewarrior',     { aliases: ['bonewarrior'],     scale: S.bonewarrior.scale,     weapon: 0, create: make });
    reg('cryptsentinel',   { aliases: ['cryptsentinel'],   scale: S.cryptsentinel.scale,   weapon: 0, create: make });
    reg('rottingskeleton', { aliases: ['rottingskeleton'], scale: S.rottingskeleton.scale, weapon: 0, create: make });
    // Bespoke per-enemy splits (narrow aliases; pinned by exact name below).
    reg('bon_bonewarrior',      { aliases: ['bon_bonewarrior'],      scale: S.bon_bonewarrior.scale,      weapon: 0, create: make });
    reg('bon_restlessrevenant', { aliases: ['bon_restlessrevenant'], scale: S.bon_restlessrevenant.scale, weapon: 0, create: make });
    reg('bon_gildedlichling',   { aliases: ['bon_gildedlichling'],   scale: S.bon_gildedlichling.scale,   weapon: 0, create: make });
    reg('bon_rottingskeleton',  { aliases: ['bon_rottingskeleton'],  scale: S.bon_rottingskeleton.scale,  weapon: 0, create: make });
    reg('bon_cinderthrall',     { aliases: ['bon_cinderthrall'],     scale: S.bon_cinderthrall.scale,     weapon: 0, create: make });
    reg('bon_sunkenpallbearer', { aliases: ['bon_sunkenpallbearer'], scale: S.bon_sunkenpallbearer.scale, weapon: 0, create: make });
    reg('lv_rattlingribcage',   { aliases: ['lv_rattlingribcage'],   scale: S.lv_rattlingribcage.scale,   weapon: 0, create: make });
    reg('lv_chatteringskull',   { aliases: ['lv_chatteringskull'],   scale: S.lv_chatteringskull.scale,   weapon: 0, create: make });

    const NAMED = {
        ancientskeleton: ["Ancient Skeleton"],
        bonewarrior:     [],
        cryptsentinel:   ["Crypt Sentinel"],
        rottingskeleton: [],
        bon_bonewarrior:      ["Bone Warrior"],
        bon_restlessrevenant: ["Restless Revenant"],
        bon_gildedlichling:   ["Gilded Lichling"],
        bon_rottingskeleton:  ["Rotting Skeleton"],
        bon_cinderthrall:     ["Cinder-Wrapped Thrall"],
        bon_sunkenpallbearer: ["Sunken Pallbearer"],
        lv_rattlingribcage:   ["Rattling Ribcage"],
        lv_chatteringskull:   ["Chattering Skull"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Bone uniques registered');
})();
