//=============================================================================
// 3D Battler System - Fish Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Distinct procedural 3D models for the many "aquaticfish" enemies:
 * shark (predatory fish), reeffish (small fish), eel (sinuous), jellyfish
 * (floating bell + tentacles) and merfolk (aquatic humanoid). Splits the single
 * fish rig into recognisable body plans. Requires 3DBattlerSystem + loads AFTER
 * 3DBattler_Aquatic to override its shared `aquaticfish` aliases.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Fish Family
 * ============================================================================
 *
 * Every "aquaticfish" enemy carries <Archetype: AquaticFish>, which the core
 * resolves before name-token aliases, so registerNamed (which outranks the meta)
 * pins each one to its body plan. Five shared shapes:
 *
 *   shark     - streamlined predator: pointed snout, toothy jaws, tall dorsal,
 *               crescent tail (sharks, swordfish, angler, megalodon, whale...)
 *   reeffish  - small flat-bodied bright fish, big eyes, forked tail
 *   eel       - long sinuous segmented body that undulates, fanged head
 *   jellyfish - translucent pulsing bell with a glowing rim + trailing tentacles
 *   merfolk   - aquatic humanoid: torso, arms, head-fins and a finned fish tail
 *               (sirens, deep ones, coral guardians)
 *
 * Frog-bodied "Abyssal Hunter" is routed to the existing Aquatic `frog`.
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem AND 3DBattler_Aquatic.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Fish] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const FISH_PROFILES = {
        shark:     { variant: 'shark',     scale: 2.6, texturePool: 'water', bodyColor: 0x6a7a86, accent: 0xbfe6ff, hue: [0.56, 0.06], sat: [0.18, 0.10], lit: [0.45, 0.10] },
        reeffish:  { variant: 'reeffish',  scale: 1.7, texturePool: 'water', bodyColor: 0xe8a83a, accent: 0x3a7fb0, hue: [0.08, 0.55], sat: [0.65, 0.20], lit: [0.52, 0.12] },
        eel:       { variant: 'eel',       scale: 2.5, texturePool: 'water', bodyColor: 0x4a7a5a, accent: 0xb9ff6a, hue: [0.40, 0.18], sat: [0.45, 0.15], lit: [0.40, 0.10] },
        jellyfish: { variant: 'jellyfish', scale: 2.3, texturePool: 'water', bodyColor: 0x9b6ad0, accent: 0x6affd0, hue: [0.74, 0.18], sat: [0.45, 0.18], lit: [0.62, 0.12] },
        merfolk:   { variant: 'merfolk',   scale: 2.6, texturePool: 'water', bodyColor: 0x4f9da8, accent: 0x7fe0d0, hue: [0.48, 0.12], sat: [0.40, 0.15], lit: [0.50, 0.12] },

        // ── Bespoke split rigs ───────────────────────────────────────────────
        // reeffish splits
        fsh_desperatepufferfish: { variant: 'puffer',    scale: 1.7, texturePool: 'water', bodyColor: 0xe0c24a, accent: 0xf5f0d0, hue: [0.12, 0.05], sat: [0.60, 0.10], lit: [0.55, 0.08] },
        fsh_parrotfishgrazer:    { variant: 'parrotfish', scale: 1.8, texturePool: 'water', bodyColor: 0x2fa86a, accent: 0xf07fc0, hue: [0.42, 0.30], sat: [0.60, 0.15], lit: [0.50, 0.10] },
        fsh_reefguppy:           { variant: 'guppy',     scale: 1.4, texturePool: 'water', bodyColor: 0x3aa0d8, accent: 0xffd24a, hue: [0.55, 0.10], sat: [0.60, 0.15], lit: [0.55, 0.10] },
        fsh_rubberfamiliar:      { variant: 'rubberduck', scale: 1.6, texturePool: 'water', bodyColor: 0xf2d21a, accent: 0xe06a1a, hue: [0.13, 0.03], sat: [0.85, 0.05], lit: [0.55, 0.05] },
        // shark splits
        fsh_sealpup:             { variant: 'seal',      scale: 2.0, texturePool: 'water', bodyColor: 0xdcdce4, accent: 0x2a2a30, hue: [0.60, 0.06], sat: [0.06, 0.06], lit: [0.80, 0.08] },
        fsh_bloatedwhale:        { variant: 'whale',     scale: 3.4, texturePool: 'water', bodyColor: 0x6c8aa0, accent: 0xbfe0f0, hue: [0.56, 0.06], sat: [0.22, 0.08], lit: [0.52, 0.08] },
        fsh_reefshark:           { variant: 'sleekshark', scale: 2.4, texturePool: 'water', bodyColor: 0x5f7480, accent: 0x9fd8ff, hue: [0.55, 0.06], sat: [0.20, 0.08], lit: [0.46, 0.08] },
        fsh_zombiewhale:         { variant: 'whale',     scale: 3.4, texturePool: 'water', bodyColor: 0x5a6a52, accent: 0x9fb86a, hue: [0.28, 0.10], sat: [0.28, 0.10], lit: [0.38, 0.08] },
        fsh_accursedstonefish:   { variant: 'stonefish', scale: 2.0, texturePool: 'stone', bodyColor: 0x6a5a44, accent: 0x8a3a2a, hue: [0.08, 0.06], sat: [0.30, 0.12], lit: [0.34, 0.08] },
        fsh_crimsonfish:         { variant: 'crimsonfish', scale: 2.3, texturePool: 'water', bodyColor: 0xa02020, accent: 0xff6a5a, hue: [0.00, 0.04], sat: [0.70, 0.12], lit: [0.42, 0.08] },
        fsh_hammerheadenforcer:  { variant: 'hammerhead', scale: 2.7, texturePool: 'water', bodyColor: 0x6a7a86, accent: 0xbfe6ff, hue: [0.56, 0.05], sat: [0.18, 0.08], lit: [0.44, 0.08] },
        fsh_luminousangler:      { variant: 'angler',    scale: 2.6, texturePool: 'water', bodyColor: 0x2a3038, accent: 0x9affe0, hue: [0.58, 0.10], sat: [0.30, 0.15], lit: [0.30, 0.08] },
        fsh_swordfishsovereign:  { variant: 'swordfish', scale: 2.7, texturePool: 'water', bodyColor: 0x3a5f8a, accent: 0xbfe6ff, hue: [0.58, 0.06], sat: [0.45, 0.12], lit: [0.44, 0.08] },
        fsh_tonnodimensionale:   { variant: 'tuna',      scale: 2.5, texturePool: 'water', bodyColor: 0x4a6a9a, accent: 0xd06aff, hue: [0.60, 0.14], sat: [0.45, 0.18], lit: [0.46, 0.10] },
        fsh_wrathdolphin:        { variant: 'dolphin',   scale: 2.5, texturePool: 'water', bodyColor: 0x7f9aa8, accent: 0xff5a4a, hue: [0.55, 0.06], sat: [0.20, 0.08], lit: [0.52, 0.08] },
        fsh_megalodon:           { variant: 'megashark', scale: 3.6, texturePool: 'water', bodyColor: 0x50606c, accent: 0xcfe6ff, hue: [0.56, 0.05], sat: [0.16, 0.06], lit: [0.40, 0.06] },
        // merfolk splits
        fsh_coralguardian:       { variant: 'coralguard', scale: 2.6, texturePool: 'water', bodyColor: 0xd06a7a, accent: 0xf0a0b0, hue: [0.96, 0.06], sat: [0.45, 0.15], lit: [0.52, 0.10] },
        fsh_sirenapprentice:     { variant: 'siren',     scale: 2.4, texturePool: 'water', bodyColor: 0x5fb0c0, accent: 0x9fe8f0, hue: [0.52, 0.06], sat: [0.45, 0.12], lit: [0.55, 0.10] },
        fsh_deeponehybrid:       { variant: 'deepone',   scale: 2.6, texturePool: 'water', bodyColor: 0x3a6a5a, accent: 0x8aff9a, hue: [0.42, 0.10], sat: [0.45, 0.15], lit: [0.40, 0.08] },
        fsh_seafoamenchantress:  { variant: 'siren',     scale: 2.6, texturePool: 'water', bodyColor: 0x6fd0c0, accent: 0xd0fff0, hue: [0.48, 0.06], sat: [0.40, 0.12], lit: [0.60, 0.10] },
        fsh_sirenenchantress:    { variant: 'siren',     scale: 2.6, texturePool: 'water', bodyColor: 0x8a5fc0, accent: 0xe0a0ff, hue: [0.76, 0.08], sat: [0.45, 0.12], lit: [0.52, 0.10] },
        fsh_sirensniper:         { variant: 'siren',     scale: 2.5, texturePool: 'water', bodyColor: 0x4f9da8, accent: 0xffd24a, hue: [0.50, 0.06], sat: [0.40, 0.12], lit: [0.50, 0.10] },
        fsh_etherealtactician:   { variant: 'siren',     scale: 2.6, texturePool: 'water', bodyColor: 0x9fb0d0, accent: 0xbfd8ff, hue: [0.60, 0.06], sat: [0.28, 0.10], lit: [0.62, 0.10] },
        fsh_abyssalsiren:        { variant: 'siren',     scale: 2.6, texturePool: 'water', bodyColor: 0x2a3a6a, accent: 0x6a8aff, hue: [0.62, 0.08], sat: [0.50, 0.12], lit: [0.34, 0.08] },
        // jellyfish splits
        fsh_toxicanemone:        { variant: 'anemone',   scale: 2.2, texturePool: 'water', bodyColor: 0xd06ab0, accent: 0xaeff5a, hue: [0.88, 0.14], sat: [0.55, 0.15], lit: [0.55, 0.10] },
        fsh_nightmareshark:      { variant: 'nightjelly', scale: 2.6, texturePool: 'water', bodyColor: 0x6a3a8a, accent: 0xff4a8a, hue: [0.80, 0.12], sat: [0.50, 0.15], lit: [0.40, 0.08] },
        // eel splits
        fsh_deepfrosteel:        { variant: 'eel',       scale: 2.6, texturePool: 'water', bodyColor: 0x5a8ab0, accent: 0xd0f0ff, hue: [0.56, 0.08], sat: [0.40, 0.12], lit: [0.55, 0.10] },
        fsh_lakelurkerserpent:   { variant: 'seaserpent', scale: 3.0, texturePool: 'water', bodyColor: 0x3a5a4a, accent: 0x7fbf6a, hue: [0.38, 0.12], sat: [0.45, 0.12], lit: [0.36, 0.08] },
        fsh_umbilicalstrangler:  { variant: 'seaserpent', scale: 2.8, texturePool: 'water', bodyColor: 0x8a5a6a, accent: 0xd08a9a, hue: [0.96, 0.08], sat: [0.35, 0.12], lit: [0.42, 0.08] }
    };

    class FishBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = FISH_PROFILES[creatureType] || FISH_PROFILES.shark;
            super(scale, offsetY, battler, profile, 0, creatureType || 'shark');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._segments = [];
            this._tents = [];
            if (this.variant === 'merfolk' || this.variant === 'coralguard' || this.variant === 'siren' || this.variant === 'deepone') this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.6 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m); return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent, glow) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(0xffffff, 1.0, 0.2));
            e.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 6, 6), this._mat(accent || 0x111111, 1.0, 0.2, glow ? accent : 0));
            pupil.position.z = r * 0.6; e.add(pupil); parent.add(e); return e;
        }

        async load(physicsWorld) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'reeffish':  this._buildReefFish(); break;
                case 'eel':       this._buildEel(); break;
                case 'jellyfish': this._buildJellyfish(); break;
                case 'merfolk':   this._buildMerfolk(); break;
                case 'puffer':    this._buildPuffer(); break;
                case 'parrotfish': this._buildParrotfish(); break;
                case 'guppy':     this._buildGuppy(); break;
                case 'rubberduck': this._buildRubberDuck(); break;
                case 'seal':      this._buildSeal(); break;
                case 'whale':     this._buildWhale(); break;
                case 'sleekshark': this._buildSleekShark(); break;
                case 'stonefish': this._buildStonefish(); break;
                case 'crimsonfish': this._buildCrimsonFish(); break;
                case 'hammerhead': this._buildHammerhead(); break;
                case 'angler':    this._buildAngler(); break;
                case 'swordfish': this._buildSwordfish(); break;
                case 'tuna':      this._buildTuna(); break;
                case 'dolphin':   this._buildDolphin(); break;
                case 'megashark': this._buildMegaShark(); break;
                case 'coralguard': this._buildCoralGuardian(); break;
                case 'siren':     this._buildSiren(); break;
                case 'deepone':   this._buildDeepOne(); break;
                case 'anemone':   this._buildAnemone(); break;
                case 'nightjelly': this._buildNightmareJelly(); break;
                case 'seaserpent': this._buildSeaSerpent(); break;
                default:          this._buildShark(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Shark: streamlined predator (long axis +z) ───────────────────────
        _buildShark() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.bodyColor, 0.92, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), skin);
            this.body.scale.set(1.0, 0.85, 2.0); this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 12), skin); snout.rotation.x = Math.PI / 2; snout.position.z = 0.2; snout.scale.set(1, 0.7, 1); this.head.add(snout);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.18), this._mat(0x190d0d, 1.0, 0.6)); mouth.position.set(0, -0.13, 0.3); this.head.add(mouth);
            for (let i = -2; i <= 2; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), this._mat(0xfff0e0, 1.0, 0.4)); tooth.position.set(i * 0.08, -0.09, 0.4); tooth.rotation.x = Math.PI; this.head.add(tooth); }
            this._eye(this.head, -0.2, 0.08, 0.12, 0.05, 0x111111, false);
            this._eye(this.head, 0.2, 0.08, 0.12, 0.05, 0x111111, false);
            this.head.position.set(0, 1.05, 0.7); this.bodyGroup.add(this.head);

            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 3), finMat); this.dorsalFin.position.set(0, 1.52, 0.0); this.dorsalFin.scale.set(0.4, 1, 1.5); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Group();
            const tf = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 3), finMat); tf.scale.set(1, 1, 0.12); this.tailFin.add(tf);
            this.tailFin.position.set(0, 1.05, -0.98); this.bodyGroup.add(this.tailFin);
            this.lPec = this._pec(finMat, -1, 0.25); this.rPec = this._pec(finMat, 1, 0.25);

            this._wireFish({ withFins: true });
        }
        _pec(mat, side, z) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 3), mat); f.scale.set(1, 1, 0.1);
            f.position.set(side * 0.4, 0.92, z); f.rotation.set(0, 0, side * 1.5); f.rotation.x = side * 0.4; this.bodyGroup.add(f); return f;
        }

        // ── Reef fish: small flat bright body, forked tail ───────────────────
        _buildReefFish() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.accent, 0.85, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skin); this.body.scale.set(0.55, 1.1, 1.0); this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            const lips = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(p.accent, 1.0, 0.5)); lips.position.set(0, -0.02, 0.34); this.body.add(lips);
            this._eye(this.body, -0.16, 0.1, 0.16, 0.08, 0x111111, false);
            this._eye(this.body, 0.16, 0.1, 0.16, 0.08, 0x111111, false);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), finMat); this.dorsalFin.position.set(0, 1.42, -0.05); this.dorsalFin.scale.set(0.18, 1, 1.4); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Group();
            for (const yy of [0.12, -0.12]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 3), finMat); t.scale.set(0.12, 1, 1); t.position.set(0, yy, 0); t.rotation.x = Math.PI / 2; t.rotation.z = yy > 0 ? 0.4 : -0.4; this.tailFin.add(t); }
            this.tailFin.position.set(0, 1.0, -0.4); this.bodyGroup.add(this.tailFin);
            this.lPec = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 3), finMat); this.lPec.scale.set(1, 1, 0.1); this.lPec.position.set(-0.28, 0.95, 0.05); this.lPec.rotation.z = 1.4; this.bodyGroup.add(this.lPec);
            this.rPec = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 3), finMat); this.rPec.scale.set(1, 1, 0.1); this.rPec.position.set(0.28, 0.95, 0.05); this.rPec.rotation.z = -1.4; this.bodyGroup.add(this.rPec);
            this._wireFish({ withFins: true });
        }

        // ── Eel: long sinuous segmented body (long axis +x) ──────────────────
        _buildEel() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skin); h.scale.set(1, 0.9, 1.3); this.head.add(h);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.16), this._mat(0x140d0d, 1.0, 0.6)); jaw.position.set(0, -0.1, 0.16); this.head.add(jaw);
            for (const fx of [-0.06, 0.06]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), this._mat(0xfff0e0, 1.0, 0.4)); f.position.set(fx, -0.06, 0.2); f.rotation.x = Math.PI; this.head.add(f); }
            this._eye(this.head, -0.11, 0.05, 0.14, 0.05, p.accent, true);
            this._eye(this.head, 0.11, 0.05, 0.14, 0.05, p.accent, true);
            this.head.position.set(0.95, 1.0, 0); this.head.rotation.y = Math.PI / 2; this.bodyGroup.add(this.head);
            let x = 0.7, r = 0.21;
            for (let i = 0; i < 7; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), skin); seg.scale.set(1.25, 1, 1);
                const fin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 1.6, 3), this._mat(p.bodyColor, 0.75, 0.6)); fin.scale.set(0.1, 1, 1); fin.position.y = r * 1.1; seg.add(fin);
                seg.position.set(x, 1.0, 0); this.bodyGroup.add(seg); this._segments.push(seg); x -= 0.28; r *= 0.9;
            }
            this.body = this._segments[0];
            this.tail = this._segments[this._segments.length - 1];
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'FANGS', 'EYES'], this.head);
            set(['BODY', 'CORE', 'TORSO'], this.body);
            this._segments.forEach((s, i) => { m['BODY_SEGMENT_' + (i + 1)] = s; });
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'TORSO'], hide: [this.head, ...this._segments] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Jellyfish: translucent pulsing bell + trailing tentacles ─────────
        _buildJellyfish() {
            const p = this.profile;
            const bellMat = this._mat(p.bodyColor, 0.42, 0.25, p.accent); bellMat.emissiveIntensity = 0.3;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), bellMat);
            this.body.scale.set(1, 0.95, 1); this.body.position.set(0, 1.5, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            this.rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 22), this._mat(p.accent, 0.85, 0.3, p.accent)); this.rim.rotation.x = Math.PI / 2; this.rim.position.set(0, 1.5, 0); this.bodyGroup.add(this.rim);
            this.tentacles = new THREE.Group(); this._tents = [];
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2, rad = (i % 2 ? 0.42 : 0.26);
                const tg = new THREE.Group();
                for (let j = 0; j < 4; j++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.24, 5), this._mat(p.accent, 0.65, 0.3)); seg.position.y = -0.13 - j * 0.24; tg.add(seg); }
                tg.position.set(Math.cos(a) * rad, 1.5, Math.sin(a) * rad); this.tentacles.add(tg); this._tents.push(tg);
            }
            this.bodyGroup.add(this.tentacles);
            this.tail = this.tentacles;
            this._partMeshMap = { BODY: this.body, BELL: this.body, CORE: this.body, HEAD: this.body, TENTACLES: this.tentacles, TAIL: this.tentacles };
            this._cascadeRules = [
                { gone: ['BODY', 'BELL', 'CORE', 'HEAD'], hide: [this.body, this.rim, this.tentacles] },
                { gone: ['TENTACLES', 'TAIL'], hide: [this.tentacles] },
            ];
        }

        // ── Merfolk: aquatic humanoid torso + arms + finned fish tail ────────
        _buildMerfolk() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.accent, 0.8, 0.5);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.75, 12), skin); this.body.position.set(0, 1.55, 0); this.bodyGroup.add(this.body);
            const collar = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin); collar.position.set(0, 1.9, 0); collar.scale.set(1, 0.7, 1); this.bodyGroup.add(collar);

            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), skin));
            for (const ex of [-0.18, 0.18]) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 4), finMat); fin.scale.set(1, 1, 0.18); fin.position.set(ex, 0.06, -0.04); fin.rotation.z = ex > 0 ? -0.7 : 0.7; this.head.add(fin); }
            this._eye(this.head, -0.08, 0.02, 0.18, 0.045, p.accent, true);
            this._eye(this.head, 0.08, 0.02, 0.18, 0.045, p.accent, true);
            this.head.position.set(0, 2.15, 0); this.bodyGroup.add(this.head);

            this.leftArm = this._arm(skin, -1); this.rightArm = this._arm(skin, 1);

            // Downward-curving scaly tail ending in a horizontal fluke.
            this.tail = new THREE.Group();
            let y = 0, r = 0.27;
            for (let i = 0; i < 4; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), skin); seg.position.set(0, y, 0); seg.scale.set(1, 1, 0.8); this.tail.add(seg); y -= 0.28; r *= 0.82; }
            const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.42, 3), finMat); fluke.scale.set(1, 0.4, 0.12); fluke.position.set(0, y + 0.06, 0); this.tail.add(fluke);
            this.tail.position.set(0, 1.2, 0); this.bodyGroup.add(this.tail);

            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'FACE', 'EYES'], this.head);
            set(['BODY', 'TORSO', 'CORE', 'CHEST', 'SPINE'], this.body);
            set(['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_HAND'], this.leftArm);
            set(['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_HAND'], this.rightArm);
            set(['TAIL', 'LEFT_LEG', 'RIGHT_LEG'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE', 'CHEST', 'SPINE'], hide: [this.body, collar, this.head, this.leftArm, this.rightArm, this.tail] },
                { gone: ['HEAD', 'SKULL', 'FACE'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _arm(mat, side) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 8), mat); upper.position.y = -0.2; g.add(upper);
            const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 8), mat); fore.position.y = -0.58; g.add(fore);
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat); hand.position.y = -0.8; g.add(hand);
            g.position.set(side * 0.26, 1.78, 0.02); g.rotation.z = side * 0.5; g._side = side; this.bodyGroup.add(g); return g;
        }

        // Shared fish part map (shark/reeffish) + cascade.
        _wireFish() {
            this._partMeshMap = { BODY: this.body, TORSO: this.body, CORE: this.body, HEAD: this.head, TAIL_FIN: this.tailFin, TAIL: this.tailFin, DORSAL_FIN: this.dorsalFin, LEFT_PECTORAL_FIN: this.lPec, RIGHT_PECTORAL_FIN: this.rPec };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.tailFin, this.dorsalFin, this.lPec, this.rPec].filter(Boolean) },
                { gone: ['HEAD'], hide: [this.head !== this.body ? this.head : null].filter(Boolean) },
                { gone: ['TAIL_FIN', 'TAIL'], hide: [this.tailFin] },
                { gone: ['DORSAL_FIN'], hide: [this.dorsalFin] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.lPec] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rPec] },
            ];
        }

        // Shared cascade wiring for a simple head+body+tail fish where the
        // named meshes are already assigned on `this`. Extra parts hide on core loss.
        _wireCore(extra) {
            const parts = (extra || []).filter(Boolean);
            const m = { BODY: this.body, TORSO: this.body, CORE: this.body };
            if (this.head) { m.HEAD = this.head; m.SKULL = this.head; }
            if (this.tail) { m.TAIL = this.tail; }
            this._partMeshMap = m;
            const rules = [{ gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.tail, ...parts].filter(Boolean) }];
            if (this.head && this.head !== this.body) rules.push({ gone: ['HEAD', 'SKULL'], hide: [this.head] });
            if (this.tail && this.tail !== this.body) rules.push({ gone: ['TAIL'], hide: [this.tail] });
            this._cascadeRules = rules;
        }

        // ── Puffer: round spiny inflatable ball, small fins ──────────────────
        _buildPuffer() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            const spineMat = this._mat(p.accent, 1.0, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), skin); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            for (let i = 0; i < 40; i++) {
                const a = this.idRand() * Math.PI * 2 + i, b = (i / 40) * Math.PI;
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), spineMat);
                const sx = Math.sin(b) * Math.cos(a), sy = Math.cos(b), sz = Math.sin(b) * Math.sin(a);
                sp.position.set(sx * 0.5, sy * 0.5, sz * 0.5); sp.lookAt(sx * 2, sy * 2, sz * 2); sp.rotateX(Math.PI / 2);
                this.body.add(sp);
            }
            this._eye(this.body, -0.2, 0.16, 0.4, 0.09, 0x111111, false);
            this._eye(this.body, 0.2, 0.16, 0.4, 0.09, 0x111111, false);
            const lips = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this._mat(0x140d0d, 1.0, 0.6)); lips.position.set(0, -0.02, 0.5); this.body.add(lips);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 3), this._mat(p.accent, 0.85, 0.6)); this.tailFin.scale.set(0.12, 1, 1); this.tailFin.position.set(0, 1.1, -0.55); this.tailFin.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this._wireCore([]);
        }

        // ── Parrotfish: flat body, beak mouth, bright dorsal ─────────────────
        _buildParrotfish() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            const finMat = this._mat(p.accent, 0.85, 0.55);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skin); this.body.scale.set(0.55, 1.05, 1.15); this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 8), this._mat(0xe8ecf0, 1.0, 0.4)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.02, 0.4); this.body.add(beak);
            this._eye(this.body, -0.16, 0.14, 0.2, 0.08, 0x111111, false);
            this._eye(this.body, 0.16, 0.14, 0.2, 0.08, 0x111111, false);
            this.dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.7), finMat); this.dorsalFin.position.set(0, 1.5, -0.05); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.4, 3), finMat); this.tailFin.scale.set(0.1, 1, 1); this.tailFin.position.set(0, 1.05, -0.5); this.tailFin.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this._wireCore([this.dorsalFin]);
        }

        // ── Guppy: tiny striped body, big flowing tail ───────────────────────
        _buildGuppy() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.4);
            const finMat = this._mat(p.accent, 0.7, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin); this.body.scale.set(0.6, 0.9, 1.4); this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            this._eye(this.body, -0.12, 0.06, 0.2, 0.07, 0x111111, false);
            this._eye(this.body, 0.12, 0.06, 0.2, 0.07, 0x111111, false);
            this.tailFin = new THREE.Group();
            for (const yy of [0.16, 0, -0.16]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 3), finMat); t.scale.set(0.08, 1, 1); t.position.set(0, yy, 0); t.rotation.x = Math.PI / 2; t.rotation.z = yy * 2; this.tailFin.add(t); }
            this.tailFin.position.set(0, 1.0, -0.42); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this._wireCore([]);
        }

        // ── Rubber Familiar: enchanted bath duck toy ─────────────────────────
        _buildRubberDuck() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.35);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 14), skin); this.body.scale.set(1, 0.9, 1.1); this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);
            const tailUp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 6), skin); tailUp.position.set(0, 0.2, -0.36); tailUp.rotation.x = -0.9; this.body.add(tailUp);
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), skin));
            const bill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.24), this._mat(p.accent, 1.0, 0.4)); bill.position.set(0, -0.04, 0.24); this.head.add(bill);
            this._eye(this.head, -0.1, 0.08, 0.2, 0.05, 0x111111, false);
            this._eye(this.head, 0.1, 0.08, 0.2, 0.05, 0x111111, false);
            this.head.position.set(0, 1.4, 0.18); this.bodyGroup.add(this.head);
            this.tail = null;
            this._wireCore([]);
        }

        // ── Seal pup: small round body, front flippers, whiskers ─────────────
        _buildSeal() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.4);
            const flipMat = this._mat(p.bodyColor, 0.9, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), skin); this.body.scale.set(0.9, 0.85, 1.6); this.body.position.set(0, 0.95, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), skin));
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), skin); snout.scale.set(1, 0.8, 1.2); snout.position.set(0, -0.04, 0.22); this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x1a1a1a, 1.0, 0.4)); nose.position.set(0, -0.02, 0.34); this.head.add(nose);
            for (const wx of [-0.06, 0.06]) for (const wy of [-0.04, 0.04]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4), this._mat(0xf0f0f0, 1.0, 0.5)); w.rotation.z = Math.PI / 2; w.position.set(wx < 0 ? -0.2 : 0.2, wy - 0.03, 0.24); this.head.add(w); }
            this._eye(this.head, -0.1, 0.06, 0.2, 0.07, 0x111111, false);
            this._eye(this.head, 0.1, 0.06, 0.2, 0.07, 0x111111, false);
            this.head.position.set(0, 1.1, 0.6); this.bodyGroup.add(this.head);
            this.lPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 4), flipMat); this.lPec.scale.set(1, 1, 0.3); this.lPec.position.set(-0.34, 0.8, 0.2); this.lPec.rotation.set(0.3, 0, 1.4); this.bodyGroup.add(this.lPec);
            this.rPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 4), flipMat); this.rPec.scale.set(1, 1, 0.3); this.rPec.position.set(0.34, 0.8, 0.2); this.rPec.rotation.set(0.3, 0, -1.4); this.bodyGroup.add(this.rPec);
            this.tail = new THREE.Group();
            for (const s of [-1, 1]) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), flipMat); fl.scale.set(1, 1, 0.25); fl.position.set(s * 0.1, 0, 0); fl.rotation.set(Math.PI / 2, 0, s * 0.5); this.tail.add(fl); }
            this.tail.position.set(0, 0.95, -0.62); this.bodyGroup.add(this.tail);
            this._partMeshMap = { BODY: this.body, TORSO: this.body, CORE: this.body, HEAD: this.head, LEFT_PECTORAL_FIN: this.lPec, RIGHT_PECTORAL_FIN: this.rPec, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.lPec, this.rPec, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.lPec] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rPec] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Whale: huge rounded body, fluke, blowhole (zombie tint via profile)
        _buildWhale() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.bodyColor, 0.95, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), skin); this.body.scale.set(1.0, 0.95, 2.2); this.body.position.set(0, 1.2, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), skin); jaw.scale.set(1, 0.7, 1.1); this.head.add(jaw);
            const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.5), this._mat(0x140d0d, 1.0, 0.6)); mouthLine.position.set(0, -0.16, 0.2); this.head.add(mouthLine);
            const blow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 8), this._mat(0x1a1a1a, 1.0, 0.5)); blow.position.set(0, 0.42, -0.2); this.head.add(blow);
            this._eye(this.head, -0.42, -0.02, 0.2, 0.07, 0x111111, false);
            this._eye(this.head, 0.42, -0.02, 0.2, 0.07, 0x111111, false);
            this.head.position.set(0, 1.2, 1.1); this.bodyGroup.add(this.head);
            this.tailFin = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 3), finMat); f.scale.set(1, 1, 0.14); f.position.set(s * 0.3, 0, 0); f.rotation.set(Math.PI / 2, 0, s * 0.7); this.tailFin.add(f); }
            this.tailFin.position.set(0, 1.2, -1.5); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._whaleFin(finMat, -1); this.rPec = this._whaleFin(finMat, 1);
            this._partMeshMap = { BODY: this.body, TORSO: this.body, CORE: this.body, HEAD: this.head, TAIL: this.tailFin, TAIL_FIN: this.tailFin, LEFT_PECTORAL_FIN: this.lPec, RIGHT_PECTORAL_FIN: this.rPec };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.tailFin, this.lPec, this.rPec] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL_FIN', 'TAIL'], hide: [this.tailFin] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.lPec] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rPec] },
            ];
        }
        _whaleFin(mat, side) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), mat); f.scale.set(1, 1, 0.16);
            f.position.set(side * 0.55, 1.0, 0.3); f.rotation.set(0.3, 0, side * 1.3); this.bodyGroup.add(f); return f;
        }

        // ── Sleek reef shark: slimmer than base shark, longer tail ───────────
        _buildSleekShark() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.45);
            const finMat = this._mat(p.bodyColor, 0.92, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), skin); this.body.scale.set(0.85, 0.8, 2.4); this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 12), skin); snout.rotation.x = Math.PI / 2; snout.position.z = 0.25; snout.scale.set(1, 0.7, 1); this.head.add(snout);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.14), this._mat(0x190d0d, 1.0, 0.6)); mouth.position.set(0, -0.1, 0.34); this.head.add(mouth);
            this._eye(this.head, -0.16, 0.06, 0.14, 0.045, 0x111111, false);
            this._eye(this.head, 0.16, 0.06, 0.14, 0.045, 0x111111, false);
            this.head.position.set(0, 1.05, 0.8); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 3), finMat); this.dorsalFin.position.set(0, 1.5, 0.1); this.dorsalFin.scale.set(0.34, 1, 1.3); this.bodyGroup.add(this.dorsalFin);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(0x141414, 1.0, 0.5)); tip.position.y = 0.32; this.dorsalFin.add(tip);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.8, 3), finMat); this.tailFin.scale.set(1, 1, 0.1); this.tailFin.position.set(0, 1.05, -1.1); this.tailFin.rotation.x = 0.2; this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.35); this.rPec = this._pec(finMat, 1, 0.35);
            this._wireFish();
        }

        // ── Stonefish: lumpy camouflaged blob with venom spines ──────────────
        _buildStonefish() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.9);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), skin); this.body.scale.set(1.4, 0.7, 1.0); this.body.position.set(0, 0.9, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            for (let i = 0; i < 14; i++) {
                const lump = new THREE.Mesh(new THREE.SphereGeometry(0.1 + this.idRand() * 0.14, 8, 8), skin);
                const a = this.idRand() * Math.PI * 2;
                lump.position.set(Math.cos(a) * (0.3 + this.idRand() * 0.35), 0.2 + this.idRand() * 0.2, Math.sin(a) * (0.2 + this.idRand() * 0.3));
                this.body.add(lump);
            }
            const spineMat = this._mat(p.accent, 1.0, 0.5, p.accent); spineMat.emissiveIntensity = 0.3;
            for (let i = 0; i < 8; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 4), spineMat); sp.position.set((i - 3.5) * 0.14, 0.42, -0.1 + this.idRand() * 0.2); this.body.add(sp); }
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.1), this._mat(0x2a0d0d, 1.0, 0.7)); mouth.position.set(0, -0.14, 0.5); this.body.add(mouth);
            this._eye(this.body, -0.18, 0.16, 0.42, 0.06, 0x1a1a1a, false);
            this._eye(this.body, 0.18, 0.16, 0.42, 0.06, 0x1a1a1a, false);
            this.tail = null;
            this._wireCore([]);
        }

        // ── Crimson fish: bulky blood-mutated fish with pincers ──────────────
        _buildCrimsonFish() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.4);
            const finMat = this._mat(p.accent, 0.85, 0.55, p.accent); finMat.emissiveIntensity = 0.2;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), skin); this.body.scale.set(0.7, 1.1, 1.3); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            const lips = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), this._mat(0x3a0808, 1.0, 0.5)); lips.position.set(0, -0.06, 0.42); this.body.add(lips);
            this._eye(this.body, -0.18, 0.18, 0.3, 0.09, 0xffdd33, true);
            this._eye(this.body, 0.18, 0.18, 0.3, 0.09, 0xffdd33, true);
            this.lPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4), finMat); this.lPec.scale.set(1, 1, 0.3); this.lPec.position.set(-0.4, 0.95, 0.1); this.lPec.rotation.z = 1.3; this.bodyGroup.add(this.lPec);
            this.rPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 4), finMat); this.rPec.scale.set(1, 1, 0.3); this.rPec.position.set(0.4, 0.95, 0.1); this.rPec.rotation.z = -1.3; this.bodyGroup.add(this.rPec);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 3), finMat); this.dorsalFin.scale.set(0.2, 1, 1.4); this.dorsalFin.position.set(0, 1.55, -0.05); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 3), finMat); this.tailFin.scale.set(0.12, 1, 1); this.tailFin.position.set(0, 1.1, -0.6); this.tailFin.rotation.x = Math.PI / 2; this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this._wireFish();
        }

        // ── Hammerhead: shark body + wide T-shaped head ──────────────────────
        _buildHammerhead() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.bodyColor, 0.92, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), skin); this.body.scale.set(0.9, 0.85, 2.1); this.body.position.set(0, 1.05, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.34), skin); this.head.add(bar);
            const snoutBar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 0.2), skin); snoutBar.position.z = 0.22; this.head.add(snoutBar);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.14), this._mat(0x190d0d, 1.0, 0.6)); mouth.position.set(0, -0.12, 0.24); this.head.add(mouth);
            this._eye(this.head, -0.52, 0.02, 0.06, 0.07, 0x111111, false);
            this._eye(this.head, 0.52, 0.02, 0.06, 0.07, 0x111111, false);
            this.head.position.set(0, 1.05, 0.85); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 3), finMat); this.dorsalFin.scale.set(0.4, 1, 1.4); this.dorsalFin.position.set(0, 1.55, 0.0); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.75, 3), finMat); this.tailFin.scale.set(1, 1, 0.12); this.tailFin.position.set(0, 1.05, -1.0); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.3); this.rPec = this._pec(finMat, 1, 0.3);
            this._wireFish();
        }

        // ── Angler: fat body, huge fanged jaw, glowing lure on stalk ─────────
        _buildAngler() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 14), skin); this.body.scale.set(1.1, 1.0, 1.1); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), skin); upper.scale.set(1.2, 1, 1); this.head.add(upper);
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.5), skin); lower.position.set(0, -0.24, 0.1); this.head.add(lower);
            const fangMat = this._mat(0xfff0e0, 1.0, 0.4);
            for (let i = -3; i <= 3; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), fangMat); t.position.set(i * 0.1, -0.06, 0.3); t.rotation.x = Math.PI; this.head.add(t); const b = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), fangMat); b.position.set(i * 0.1, -0.2, 0.3); this.head.add(b); }
            this._eye(this.head, -0.16, 0.16, 0.28, 0.07, 0xaaffee, true);
            this._eye(this.head, 0.16, 0.16, 0.28, 0.07, 0xaaffee, true);
            this.head.position.set(0, 1.15, 0.5); this.bodyGroup.add(this.head);
            this.lure = new THREE.Group();
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 6), skin); stalk.position.y = 0.3; stalk.rotation.x = 0.5; this.lure.add(stalk);
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), this._mat(p.accent, 1.0, 0.2, p.accent)); bulb.material.emissiveIntensity = 1.2; bulb.position.set(0, 0.56, 0.3); this.lure.add(bulb);
            const glow = new THREE.PointLight(p.accent, 1.2, 4); glow.position.copy(bulb.position); this.lure.add(glow);
            this.lure.position.set(0, 1.5, 0.4); this.bodyGroup.add(this.lure);
            this.tail = null;
            this._partMeshMap = { BODY: this.body, TORSO: this.body, CORE: this.body, HEAD: this.head, LURE: this.lure };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.lure] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LURE'], hide: [this.lure] },
            ];
        }

        // ── Swordfish: sleek body + very long bill ───────────────────────────
        _buildSwordfish() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.4);
            const finMat = this._mat(p.accent, 0.85, 0.5);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), skin); this.body.scale.set(0.8, 0.9, 2.3); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skin); this.head.add(dome);
            this.bill = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.3, 8), this._mat(0xcfd8e0, 1.0, 0.3)); this.bill.rotation.x = Math.PI / 2; this.bill.position.z = 0.75; this.head.add(this.bill);
            this._eye(this.head, -0.2, 0.08, 0.1, 0.06, 0x111111, false);
            this._eye(this.head, 0.2, 0.08, 0.1, 0.06, 0x111111, false);
            this.head.position.set(0, 1.1, 0.85); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.7, 3), finMat); this.dorsalFin.scale.set(0.14, 1, 1.2); this.dorsalFin.position.set(0, 1.6, 0.1); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.55, 3), finMat); f.scale.set(1, 1, 0.1); f.position.set(0, s * 0.24, 0); f.rotation.z = s * 0.5; this.tailFin.add(f); }
            this.tailFin.position.set(0, 1.1, -1.05); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.4); this.rPec = this._pec(finMat, 1, 0.4);
            this._partMeshMap = { BODY: this.body, TORSO: this.body, CORE: this.body, HEAD: this.head, BILL: this.head, TAIL: this.tailFin, TAIL_FIN: this.tailFin, DORSAL_FIN: this.dorsalFin, LEFT_PECTORAL_FIN: this.lPec, RIGHT_PECTORAL_FIN: this.rPec };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'CORE'], hide: [this.body, this.head, this.tailFin, this.dorsalFin, this.lPec, this.rPec] },
                { gone: ['HEAD', 'BILL'], hide: [this.head] },
                { gone: ['TAIL_FIN', 'TAIL'], hide: [this.tailFin] },
                { gone: ['DORSAL_FIN'], hide: [this.dorsalFin] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.lPec] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rPec] },
            ];
        }

        // ── Tuna: torpedo body + finlet row, dimensional shimmer accents ─────
        _buildTuna() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.35);
            const finMat = this._mat(p.accent, 0.85, 0.4, p.accent); finMat.emissiveIntensity = 0.3;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), skin); this.body.scale.set(0.85, 1.0, 2.2); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 12), skin); snout.rotation.x = Math.PI / 2; snout.position.z = 0.2; this.head.add(snout);
            this._eye(this.head, -0.18, 0.06, 0.05, 0.07, 0x111111, false);
            this._eye(this.head, 0.18, 0.06, 0.05, 0.07, 0x111111, false);
            this.head.position.set(0, 1.1, 0.85); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), finMat); this.dorsalFin.scale.set(0.14, 1, 1.2); this.dorsalFin.position.set(0, 1.55, 0.2); this.bodyGroup.add(this.dorsalFin);
            for (let i = 0; i < 4; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 3), finMat); fl.scale.set(0.4, 1, 1); fl.position.set(0, 1.45, -0.3 - i * 0.15); this.bodyGroup.add(fl); }
            this.tailFin = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 3), finMat); f.scale.set(1, 1, 0.1); f.position.set(0, s * 0.22, 0); f.rotation.z = s * 0.6; this.tailFin.add(f); }
            this.tailFin.position.set(0, 1.1, -1.0); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.35); this.rPec = this._pec(finMat, 1, 0.35);
            this._wireFish();
        }

        // ── Dolphin: sleek smooth body, beak, curved dorsal ──────────────────
        _buildDolphin() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.3);
            const finMat = this._mat(p.bodyColor, 0.95, 0.4);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), skin); this.body.scale.set(0.9, 0.9, 2.3); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const melon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), skin); this.head.add(melon);
            const beak = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 10), skin); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.06, 0.28); this.head.add(beak);
            const smile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), this._mat(p.accent, 1.0, 0.4, p.accent)); smile.material.emissiveIntensity = 0.4; smile.position.set(0, -0.14, 0.22); this.head.add(smile);
            this._eye(this.head, -0.2, 0.02, 0.12, 0.05, 0x111111, false);
            this._eye(this.head, 0.2, 0.02, 0.12, 0.05, 0x111111, false);
            this.head.position.set(0, 1.1, 0.85); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 3), finMat); this.dorsalFin.scale.set(0.14, 1, 1.0); this.dorsalFin.position.set(0, 1.5, 0.0); this.dorsalFin.rotation.x = -0.5; this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Group();
            for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 3), finMat); f.scale.set(1, 1, 0.14); f.position.set(s * 0.22, 0, 0); f.rotation.set(Math.PI / 2, 0, s * 0.7); this.tailFin.add(f); }
            this.tailFin.position.set(0, 1.1, -1.05); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.4); this.rPec = this._pec(finMat, 1, 0.4);
            this._wireFish();
        }

        // ── Megalodon: massive shark, oversized toothy maw ───────────────────
        _buildMegaShark() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            const finMat = this._mat(p.bodyColor, 0.92, 0.65);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14), skin); this.body.scale.set(1.05, 0.9, 2.4); this.body.position.set(0, 1.1, 0); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.0, 14), skin); snout.rotation.x = Math.PI / 2; snout.position.z = 0.2; snout.scale.set(1.1, 0.8, 1); this.head.add(snout);
            const maw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), this._mat(0x160808, 1.0, 0.6)); maw.position.set(0, -0.2, 0.42); this.head.add(maw);
            const fangMat = this._mat(0xfff4e6, 1.0, 0.4);
            for (let i = -4; i <= 4; i++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), fangMat); t.position.set(i * 0.08, -0.14, 0.55); t.rotation.x = Math.PI; this.head.add(t); const b = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), fangMat); b.position.set(i * 0.08, -0.28, 0.55); this.head.add(b); }
            this._eye(this.head, -0.28, 0.12, 0.2, 0.06, 0x111111, false);
            this._eye(this.head, 0.28, 0.12, 0.2, 0.06, 0x111111, false);
            this.head.position.set(0, 1.1, 1.0); this.bodyGroup.add(this.head);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 3), finMat); this.dorsalFin.scale.set(0.4, 1, 1.4); this.dorsalFin.position.set(0, 1.7, 0.0); this.bodyGroup.add(this.dorsalFin);
            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 3), finMat); this.tailFin.scale.set(1, 1, 0.12); this.tailFin.position.set(0, 1.1, -1.35); this.bodyGroup.add(this.tailFin);
            this.tail = this.tailFin;
            this.lPec = this._pec(finMat, -1, 0.4); this.rPec = this._pec(finMat, 1, 0.4);
            this.lPec.scale.set(1.6, 1.6, 0.12); this.rPec.scale.set(1.6, 1.6, 0.12);
            this._wireFish();
        }

        // ── Coral Guardian: merfolk clad in jagged coral plates ──────────────
        _buildCoralGuardian() {
            this._buildMerfolk();
            const coralMat = this._mat(this.profile.accent, 0.95, 0.7);
            for (let i = 0; i < 10; i++) {
                const branch = new THREE.Mesh(new THREE.ConeGeometry(0.05 + this.idRand() * 0.05, 0.2 + this.idRand() * 0.2, 4), coralMat);
                const a = this.idRand() * Math.PI * 2;
                branch.position.set(Math.cos(a) * 0.24, 1.4 + this.idRand() * 0.5, Math.sin(a) * 0.2);
                branch.rotation.set(this.idRand() * 1.2 - 0.6, a, this.idRand() * 1.2 - 0.6);
                this.body.add(branch);
            }
        }

        // ── Siren: elegant merfolk, longer hair-fins + song aura eyes ────────
        _buildSiren() {
            this._buildMerfolk();
            const hairMat = this._mat(this.profile.accent, 0.75, 0.4);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.5, 5), hairMat);
                strand.position.set(Math.cos(a) * 0.18, -0.12, Math.sin(a) * 0.18 - 0.08);
                strand.rotation.x = 0.3; this.head.add(strand);
            }
        }

        // ── Deep One: hunched fish-human hybrid, gill frills, bulbous eyes ───
        _buildDeepOne() {
            this._buildMerfolk();
            // Gills and eyes are cut into the head, so they are placed in the
            // head's own space. The head already stands at y 2.15, so the
            // body-space heights these were written at put them a whole body
            // length above the creature.
            const gillMat = this._mat(this.profile.accent, 0.85, 0.6);
            for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
                const gill = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.14), gillMat);
                gill.position.set(s * 0.18, -0.03 + i * 0.02, -0.02 - i * 0.05); this.head.add(gill);
            }
            const bigEyeMat = this._mat(this.profile.accent, 1.0, 0.2, this.profile.accent); bigEyeMat.emissiveIntensity = 0.5;
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), bigEyeMat); e.position.set(s * 0.11, 0.01, 0.16); this.head.add(e); }
        }

        // ── Toxic Anemone: sessile column + dense neon stinging tentacles ────
        _buildAnemone() {
            const p = this.profile;
            const column = this._mat(p.bodyColor, 0.85, 0.5);
            this.body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.7, 14), column); this.body.position.set(0, 0.85, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.12, 14), column); disc.position.set(0, 1.22, 0); this.body.add(disc);
            this.tentacles = new THREE.Group(); this._tents = [];
            const tMat = this._mat(p.accent, 0.9, 0.3, p.accent); tMat.emissiveIntensity = 0.4;
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2, rad = 0.14 + (i % 3) * 0.1;
                const tg = new THREE.Group();
                for (let j = 0; j < 3; j++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.2, 5), tMat); seg.position.y = 0.1 + j * 0.18; tg.add(seg); }
                tg.position.set(Math.cos(a) * rad, 1.28, Math.sin(a) * rad); tg.rotation.z = Math.cos(a) * 0.3; tg.rotation.x = Math.sin(a) * 0.3; this.tentacles.add(tg); this._tents.push(tg);
            }
            this.bodyGroup.add(this.tentacles);
            this.tail = this.tentacles;
            this._partMeshMap = { BODY: this.body, CORE: this.body, HEAD: this.body, TENTACLES: this.tentacles, TAIL: this.tentacles };
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'HEAD'], hide: [this.body, this.tentacles] },
                { gone: ['TENTACLES', 'TAIL'], hide: [this.tentacles] },
            ];
        }

        // ── Nightmare jelly: giant hypnotic bell, pattern glow, long tentacles
        _buildNightmareJelly() {
            const p = this.profile;
            const bellMat = this._mat(p.bodyColor, 0.4, 0.2, p.accent); bellMat.emissiveIntensity = 0.4;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), bellMat);
            this.body.scale.set(1, 1.05, 1); this.body.position.set(0, 1.6, 0); this.bodyGroup.add(this.body);
            this.head = this.body;
            for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28 + i * 0.14, 0.02, 6, 24), this._mat(p.accent, 0.7, 0.2, p.accent)); ring.material.emissiveIntensity = 0.8; ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.55 - i * 0.02, 0); this.body.add(ring); }
            this.rim = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.05, 8, 26), this._mat(p.accent, 0.85, 0.3, p.accent)); this.rim.rotation.x = Math.PI / 2; this.rim.position.set(0, 1.6, 0); this.bodyGroup.add(this.rim);
            this.tentacles = new THREE.Group(); this._tents = [];
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2, rad = (i % 2 ? 0.56 : 0.34);
                const tg = new THREE.Group();
                for (let j = 0; j < 6; j++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.28, 5), this._mat(p.accent, 0.55, 0.3)); seg.position.y = -0.16 - j * 0.28; tg.add(seg); }
                tg.position.set(Math.cos(a) * rad, 1.6, Math.sin(a) * rad); this.tentacles.add(tg); this._tents.push(tg);
            }
            this.bodyGroup.add(this.tentacles);
            this.tail = this.tentacles;
            this._partMeshMap = { BODY: this.body, BELL: this.body, CORE: this.body, HEAD: this.body, TENTACLES: this.tentacles, TAIL: this.tentacles };
            this._cascadeRules = [
                { gone: ['BODY', 'BELL', 'CORE', 'HEAD'], hide: [this.body, this.rim, this.tentacles] },
                { gone: ['TENTACLES', 'TAIL'], hide: [this.tentacles] },
            ];
        }

        // ── Sea serpent: longer, thicker eel with coils and finned crest ─────
        _buildSeaSerpent() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.5);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), skin); h.scale.set(1, 0.85, 1.5); this.head.add(h);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22), this._mat(0x140d0d, 1.0, 0.6)); jaw.position.set(0, -0.14, 0.22); this.head.add(jaw);
            const fangMat = this._mat(0xfff0e0, 1.0, 0.4);
            for (const fx of [-0.1, 0, 0.1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), fangMat); f.position.set(fx, -0.08, 0.28); f.rotation.x = Math.PI; this.head.add(f); }
            const crest = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 3), this._mat(p.accent, 0.8, 0.5)); crest.scale.set(0.1, 1, 1.2); crest.position.set(0, 0.28, -0.05); this.head.add(crest);
            this._eye(this.head, -0.14, 0.08, 0.2, 0.06, p.accent, true);
            this._eye(this.head, 0.14, 0.08, 0.2, 0.06, p.accent, true);
            this.head.position.set(1.2, 1.0, 0); this.head.rotation.y = Math.PI / 2; this.bodyGroup.add(this.head);
            this._segments = [];
            let x = 0.85, r = 0.3;
            for (let i = 0; i < 9; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), skin); seg.scale.set(1.2, 1, 1);
                const fin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 1.7, 3), this._mat(p.accent, 0.7, 0.5)); fin.scale.set(0.1, 1, 1); fin.position.y = r * 1.1; seg.add(fin);
                seg.position.set(x, 1.0, 0); this.bodyGroup.add(seg); this._segments.push(seg); x -= 0.3; r *= 0.92;
            }
            this.body = this._segments[0];
            this.tail = this._segments[this._segments.length - 1];
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['HEAD', 'SKULL', 'FANGS', 'EYES'], this.head);
            set(['BODY', 'CORE', 'TORSO'], this.body);
            this._segments.forEach((s, i) => { m['BODY_SEGMENT_' + (i + 1)] = s; });
            set(['TAIL'], this.tail);
            this._partMeshMap = m;
            this._cascadeRules = [
                { gone: ['BODY', 'CORE', 'TORSO'], hide: [this.head, ...this._segments] },
                { gone: ['HEAD', 'SKULL'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.6);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'shark': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.06 * this.scale;
                    this.model.rotation.y = Math.sin(t * (fast ? 7 : 2.5)) * 0.12;
                    if (this.tailFin && this.tailFin.visible) this.tailFin.rotation.y = Math.sin(t * (fast ? 12 : 5)) * 0.5;
                    if (this.lPec && this.lPec.visible) this.lPec.rotation.x = 0.4 + Math.sin(t * 3) * 0.2;
                    if (this.rPec && this.rPec.visible) this.rPec.rotation.x = -0.4 - Math.sin(t * 3) * 0.2;
                    break;
                }
                case 'reeffish': {
                    this.model.position.x = baseX + Math.sin(t * 2.2) * 0.04 * this.scale;
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.05 * this.scale;
                    if (this.tailFin && this.tailFin.visible) this.tailFin.rotation.y = Math.sin(t * (fast ? 16 : 9)) * 0.5;
                    break;
                }
                case 'eel': {
                    const speed = fast ? 7 : 3.5;
                    this._segments.forEach((s, i) => { if (s.visible) s.position.z = Math.sin(t * speed - i * 0.7) * 0.16; });
                    if (this.head && this.head.visible) this.head.position.z = Math.sin(t * speed + 0.7) * 0.16;
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;
                    break;
                }
                case 'jellyfish': {
                    const pulse = 1.0 + Math.sin(t * (fast ? 6 : 2.4)) * 0.16;
                    if (this.body) this.body.scale.set(1.0 / Math.sqrt(pulse), pulse, 1.0 / Math.sqrt(pulse));
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.12 * this.scale;
                    if (this.rim && this.rim.material) this.rim.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4;
                    this._tents.forEach((g, i) => { if (g.visible) { g.rotation.x = Math.sin(t * 2 + i) * 0.25; g.rotation.z = Math.cos(t * 2 + i) * 0.25; } });
                    break;
                }
                case 'merfolk':
                case 'coralguard':
                case 'siren':
                case 'deepone': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.06 * this.scale;
                    if (this.tail && this.tail.visible) this.tail.rotation.z = Math.sin(t * (fast ? 5 : 2.2)) * 0.25;
                    const wave = fast ? Math.sin(t * 6) * 0.4 : Math.sin(t * 1.8) * 0.18;
                    if (this.leftArm) this.leftArm.rotation.z = 0.5 + wave;
                    if (this.rightArm) this.rightArm.rotation.z = -0.5 - wave;
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.4) * 0.06;
                    break;
                }
                // Fish-shaped bespoke rigs: sway body, waggle tail fin, flap pecs.
                case 'sleekshark':
                case 'hammerhead':
                case 'crimsonfish':
                case 'swordfish':
                case 'tuna':
                case 'dolphin':
                case 'megashark':
                case 'whale': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.06 * this.scale;
                    this.model.rotation.y = Math.sin(t * (fast ? 7 : 2.5)) * 0.1;
                    if (this.tailFin && this.tailFin.visible) this.tailFin.rotation.y = Math.sin(t * (fast ? 12 : 5)) * 0.45;
                    if (this.lPec && this.lPec.visible) this.lPec.rotation.x = 0.4 + Math.sin(t * 3) * 0.2;
                    if (this.rPec && this.rPec.visible) this.rPec.rotation.x = -0.4 - Math.sin(t * 3) * 0.2;
                    break;
                }
                // Compact fish: gentle bob and tail flick.
                case 'puffer':
                case 'parrotfish':
                case 'guppy': {
                    this.model.position.x = baseX + Math.sin(t * 2.2) * 0.03 * this.scale;
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.05 * this.scale;
                    if (this.tailFin && this.tailFin.visible) this.tailFin.rotation.y = Math.sin(t * (fast ? 16 : 9)) * 0.5;
                    break;
                }
                case 'rubberduck': {
                    this.model.position.y = this._baseY + Math.sin(t * 2.6) * 0.05 * this.scale;
                    this.model.rotation.z = Math.sin(t * 2) * 0.08;
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.6) * 0.1;
                    break;
                }
                case 'seal': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.05 * this.scale;
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * (fast ? 8 : 3.5)) * 0.3;
                    if (this.lPec && this.lPec.visible) this.lPec.rotation.x = Math.sin(t * 3) * 0.3;
                    if (this.rPec && this.rPec.visible) this.rPec.rotation.x = -Math.sin(t * 3) * 0.3;
                    if (this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.4) * 0.08;
                    break;
                }
                case 'stonefish': {
                    // Nearly still, camouflaged; only slight breathing.
                    const breath = 1.0 + Math.sin(t * 1.2) * 0.03;
                    if (this.body) this.body.scale.set(1.4 * breath, 0.7, 1.0 * breath);
                    this.model.position.y = this._baseY + Math.sin(t * 0.8) * 0.02 * this.scale;
                    break;
                }
                case 'angler': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;
                    this.model.rotation.y = Math.sin(t * (fast ? 6 : 2)) * 0.08;
                    if (this.lure && this.lure.visible) { this.lure.rotation.z = Math.sin(t * 1.6) * 0.3; this.lure.rotation.x = Math.cos(t * 1.3) * 0.2; }
                    break;
                }
                case 'anemone': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.03 * this.scale;
                    this._tents.forEach((g, i) => { if (g.visible) { g.rotation.x += Math.sin(t * 2.5 + i) * 0.01; g.rotation.z += Math.cos(t * 2.5 + i) * 0.01; } });
                    break;
                }
                case 'nightjelly': {
                    const pulse = 1.0 + Math.sin(t * (fast ? 6 : 2.4)) * 0.16;
                    if (this.body) this.body.scale.set(1.0 / Math.sqrt(pulse), 1.05 * pulse, 1.0 / Math.sqrt(pulse));
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.12 * this.scale;
                    if (this.rim && this.rim.material) this.rim.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.4;
                    this._tents.forEach((g, i) => { if (g.visible) { g.rotation.x = Math.sin(t * 2 + i) * 0.25; g.rotation.z = Math.cos(t * 2 + i) * 0.25; } });
                    break;
                }
                case 'seaserpent': {
                    const speed = fast ? 7 : 3.5;
                    this._segments.forEach((s, i) => { if (s.visible) s.position.z = Math.sin(t * speed - i * 0.6) * 0.22; });
                    if (this.head && this.head.visible) this.head.position.z = Math.sin(t * speed + 0.6) * 0.22;
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Roll belly-up and sink; the base death fade handles opacity.
            this.model.position.y = this._baseY - prog * 0.5 * this.scale;
            const humanoid = (this.variant === 'merfolk' || this.variant === 'coralguard' || this.variant === 'siren' || this.variant === 'deepone');
            this.model.rotation.z = prog * (humanoid ? 0.9 : 2.6);
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new FishBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = FISH_PROFILES;
    // Override the fish tokens previously owned by the generic Aquatic `aquaticfish`
    // rig (this file loads after Aquatic).
    reg('shark',     { aliases: ['shark', 'sharks', 'megalodon', 'swordfish', 'angler', 'anglerfish', 'whale', 'dolphin', 'orca', 'seal', 'stonefish', 'barracuda', 'piranha', 'marlin', 'grouper', 'tuna', 'tonno', 'hammerhead'], scale: S.shark.scale, weapon: 0, create: make });
    reg('reeffish',  { aliases: ['reeffish', 'guppy', 'sardine', 'seahorse', 'pufferfish', 'puffer', 'parrotfish', 'minnow', 'goldfish', 'koi', 'clownfish', 'angelfish', 'tetra', 'anchovy', 'reef', 'fish', 'fishes'], scale: S.reeffish.scale, weapon: 0, create: make });
    reg('eel',       { aliases: ['eel', 'eels', 'lamprey', 'moray'], scale: S.eel.scale, weapon: 0, create: make });
    reg('jellyfish', { aliases: ['jellyfish', 'jelly', 'anemone', 'medusa', 'cnidarian'], scale: S.jellyfish.scale, weapon: 0, create: make });
    // Note: no 'siren' alias - several <Archetype: Siren> enemies have their own
    // bespoke/keyword models (e.g. Coral Enchantress -> witch). The siren fish
    // below are pinned by exact name instead.
    reg('merfolk',   { aliases: ['merfolk', 'mermaid', 'merman', 'naiad', 'nereid', 'undine'], scale: S.merfolk.scale, weapon: 0, create: make });

    // ── Bespoke split rig registrations (narrow aliases; pinned by exact name)
    reg('fsh_desperatepufferfish', { aliases: ['fsh_desperatepufferfish'], scale: S.fsh_desperatepufferfish.scale, weapon: 0, create: make });
    reg('fsh_parrotfishgrazer',    { aliases: ['fsh_parrotfishgrazer'],    scale: S.fsh_parrotfishgrazer.scale, weapon: 0, create: make });
    reg('fsh_reefguppy',           { aliases: ['fsh_reefguppy'],           scale: S.fsh_reefguppy.scale, weapon: 0, create: make });
    reg('fsh_rubberfamiliar',      { aliases: ['fsh_rubberfamiliar'],      scale: S.fsh_rubberfamiliar.scale, weapon: 0, create: make });
    reg('fsh_sealpup',             { aliases: ['fsh_sealpup'],             scale: S.fsh_sealpup.scale, weapon: 0, create: make });
    reg('fsh_bloatedwhale',        { aliases: ['fsh_bloatedwhale'],        scale: S.fsh_bloatedwhale.scale, weapon: 0, create: make });
    reg('fsh_reefshark',           { aliases: ['fsh_reefshark'],           scale: S.fsh_reefshark.scale, weapon: 0, create: make });
    reg('fsh_zombiewhale',         { aliases: ['fsh_zombiewhale'],         scale: S.fsh_zombiewhale.scale, weapon: 0, create: make });
    reg('fsh_accursedstonefish',   { aliases: ['fsh_accursedstonefish'],   scale: S.fsh_accursedstonefish.scale, weapon: 0, create: make });
    reg('fsh_crimsonfish',         { aliases: ['fsh_crimsonfish'],         scale: S.fsh_crimsonfish.scale, weapon: 0, create: make });
    reg('fsh_hammerheadenforcer',  { aliases: ['fsh_hammerheadenforcer'],  scale: S.fsh_hammerheadenforcer.scale, weapon: 0, create: make });
    reg('fsh_luminousangler',      { aliases: ['fsh_luminousangler'],      scale: S.fsh_luminousangler.scale, weapon: 0, create: make });
    reg('fsh_swordfishsovereign',  { aliases: ['fsh_swordfishsovereign'],  scale: S.fsh_swordfishsovereign.scale, weapon: 0, create: make });
    reg('fsh_tonnodimensionale',   { aliases: ['fsh_tonnodimensionale'],   scale: S.fsh_tonnodimensionale.scale, weapon: 0, create: make });
    reg('fsh_wrathdolphin',        { aliases: ['fsh_wrathdolphin'],        scale: S.fsh_wrathdolphin.scale, weapon: 0, create: make });
    reg('fsh_megalodon',           { aliases: ['fsh_megalodon'],           scale: S.fsh_megalodon.scale, weapon: 0, create: make });
    reg('fsh_coralguardian',       { aliases: ['fsh_coralguardian'],       scale: S.fsh_coralguardian.scale, weapon: 0, create: make });
    reg('fsh_sirenapprentice',     { aliases: ['fsh_sirenapprentice'],     scale: S.fsh_sirenapprentice.scale, weapon: 0, create: make });
    reg('fsh_deeponehybrid',       { aliases: ['fsh_deeponehybrid'],       scale: S.fsh_deeponehybrid.scale, weapon: 0, create: make });
    reg('fsh_seafoamenchantress',  { aliases: ['fsh_seafoamenchantress'],  scale: S.fsh_seafoamenchantress.scale, weapon: 0, create: make });
    reg('fsh_sirenenchantress',    { aliases: ['fsh_sirenenchantress'],    scale: S.fsh_sirenenchantress.scale, weapon: 0, create: make });
    reg('fsh_sirensniper',         { aliases: ['fsh_sirensniper'],         scale: S.fsh_sirensniper.scale, weapon: 0, create: make });
    reg('fsh_etherealtactician',   { aliases: ['fsh_etherealtactician'],   scale: S.fsh_etherealtactician.scale, weapon: 0, create: make });
    reg('fsh_abyssalsiren',        { aliases: ['fsh_abyssalsiren'],        scale: S.fsh_abyssalsiren.scale, weapon: 0, create: make });
    reg('fsh_toxicanemone',        { aliases: ['fsh_toxicanemone'],        scale: S.fsh_toxicanemone.scale, weapon: 0, create: make });
    reg('fsh_nightmareshark',      { aliases: ['fsh_nightmareshark'],      scale: S.fsh_nightmareshark.scale, weapon: 0, create: make });
    reg('fsh_deepfrosteel',        { aliases: ['fsh_deepfrosteel'],        scale: S.fsh_deepfrosteel.scale, weapon: 0, create: make });
    reg('fsh_lakelurkerserpent',   { aliases: ['fsh_lakelurkerserpent'],   scale: S.fsh_lakelurkerserpent.scale, weapon: 0, create: make });
    reg('fsh_umbilicalstrangler',  { aliases: ['fsh_umbilicalstrangler'],  scale: S.fsh_umbilicalstrangler.scale, weapon: 0, create: make });

    //=========================================================================
    // Name assignments (AquaticFish-tagged enemies; registerNamed outranks the
    // Archetype meta). Catfish is handled by the CatHybrids family.
    const NAMED = {
        // Shared rigs kept as fallbacks; split names moved to bespoke keys below.
        shark: [],
        reeffish: ["Golden Seahorse", "Sardine School"],
        eel: [],
        jellyfish: [],
        merfolk: [],
        frog: ["Abyssal Hunter"],
        // Bespoke per-enemy split rigs.
        fsh_desperatepufferfish: ["Desperate Pufferfish"],
        fsh_parrotfishgrazer: ["Parrotfish Grazer"],
        fsh_reefguppy: ["Reef Guppy"],
        fsh_rubberfamiliar: ["Rubber Familiar"],
        fsh_sealpup: ["Seal Pup"],
        fsh_bloatedwhale: ["Bloated Whale"],
        fsh_reefshark: ["Reef Shark"],
        fsh_zombiewhale: ["Zombie Whale"],
        fsh_accursedstonefish: ["Accursed Stonefish"],
        fsh_crimsonfish: ["Crimson Fish"],
        fsh_hammerheadenforcer: ["Hammerhead Enforcer"],
        fsh_luminousangler: ["Luminous Angler"],
        fsh_swordfishsovereign: ["Swordfish Sovereign"],
        fsh_tonnodimensionale: ["Tonno Dimensionale"],
        fsh_wrathdolphin: ["Wrath Dolphin"],
        fsh_megalodon: ["Megalodon"],
        fsh_coralguardian: ["Coral Guardian"],
        fsh_sirenapprentice: ["Siren Apprentice"],
        fsh_deeponehybrid: ["Deep One Hybrid"],
        fsh_seafoamenchantress: ["Seafoam Enchantress"],
        fsh_sirenenchantress: ["Siren Enchantress"],
        fsh_sirensniper: ["Siren Sniper"],
        fsh_etherealtactician: ["Ethereal Tactician"],
        fsh_abyssalsiren: ["Abyssal Siren"],
        fsh_toxicanemone: ["Toxic Anemone"],
        fsh_nightmareshark: ["Nightmare Shark"],
        fsh_deepfrosteel: ["Deep Frost Eel"],
        fsh_lakelurkerserpent: ["Lake Lurker Serpent"],
        fsh_umbilicalstrangler: ["Umbilical Strangler"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Fish family registered');
})();
