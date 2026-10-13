//=============================================================================
// 3D Battler System - Aquatic & Serpentine Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Aquatic / serpentine procedural 3D battlers (fish, octopus, frog,
 * turtle, snail, serpent, worm, amphibian). Requires 3DBattlerSystem first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Aquatic & Serpentine Family
 * ============================================================================
 *
 * Boneless water dwellers and crawlers (no physics) that each build their own
 * geometry and share the part-losing engine plus the per-monster-id shape /
 * texture / colour variation from window.Battler3D.Base.
 *
 * Registered archetypes:
 *   AquaticFish (HEAD, BODY, TAIL_FIN, DORSAL_FIN, LEFT/RIGHT_PECTORAL_FIN)
 *   Octopus     (HEAD, MANTLE, TENTACLE_1..4)
 *   Frog        (HEAD, BODY, TONGUE, VOCAL_SAC, LEFT/RIGHT_LEG, HIND_*_LEG)
 *   Amphibian   (HEAD, TORSO, TONGUE, LEFT_LEG, RIGHT_LEG)
 *   Turtle      (SHELL, HEAD, LEFT/RIGHT_LEG, REAR_*_LEG, TAIL)
 *   Snail       (SHELL, BODY, TENTACLE_1, TENTACLE_2, EYE, FOOT)
 *   Serpent     (HEAD, FANGS, BODY_SEGMENT_1, BODY_SEGMENT_2, TAIL)
 *   SegmentWorm (HEAD, HEART_SEGMENT, BODY_SEGMENT, TAIL)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Aquatic] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const AQ_PROFILES = {
        aquaticfish: { variant: 'fish', scale: 2.2, texturePool: 'water', bodyColor: 0x3a7fb0, accent: 0xffd24a, hue: [0.55, 0.12], sat: [0.50, 0.18], lit: [0.48, 0.12] },
        octopus:     { variant: 'octopus', scale: 2.3, texturePool: 'water', bodyColor: 0x9b3b6a, accent: 0xffd24a, hue: [0.92, 0.10], sat: [0.45, 0.15], lit: [0.42, 0.10] },
        frog:        { variant: 'frog', scale: 2.0, texturePool: 'foliage', bodyColor: 0x4f9d3a, accent: 0xe8e055, hue: [0.30, 0.10], sat: [0.55, 0.15], lit: [0.40, 0.10] },
        amphibian:   { variant: 'amphibian', scale: 2.1, texturePool: 'foliage', bodyColor: 0x6a8d3a, accent: 0xe8e055, hue: [0.25, 0.10], sat: [0.50, 0.15], lit: [0.40, 0.10] },
        turtle:      { variant: 'turtle', scale: 2.4, texturePool: 'stone', bodyColor: 0x4a7d4a, shell: 0x6b5230, hue: [0.30, 0.08], sat: [0.40, 0.12], lit: [0.36, 0.10] },
        snail:       { variant: 'snail', scale: 2.1, texturePool: 'foliage', bodyColor: 0xc9b89a, shell: 0x9a6b3a, accent: 0x111111, hue: [0.09, 0.05], sat: [0.25, 0.12], lit: [0.55, 0.12] },
        serpent:     { variant: 'serpent', scale: 2.6, texturePool: 'green', bodyColor: 0x5a8a3a, accent: 0xffd24a, hue: [0.28, 0.10], sat: [0.55, 0.15], lit: [0.38, 0.10] },
        segmentworm: { variant: 'worm', scale: 2.4, texturePool: 'flesh', bodyColor: 0xc97a6a, accent: 0x8a2a2a, hue: [0.02, 0.05], sat: [0.45, 0.15], lit: [0.50, 0.10] },
        crustacean:  { variant: 'crab', scale: 2.3, texturePool: 'stone', bodyColor: 0xc0392b, accent: 0x111111, hue: [0.02, 0.05], sat: [0.55, 0.15], lit: [0.42, 0.10] },

        coralwarcaster:  { variant: 'coralwarcaster',  scale: 2.5, texturePool: 'water', bodyColor: 0x3a7d6a, shell: 0xd96a5a, accent: 0x55ccff, hue: [0.48, 0.08], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        crystalcarapace: { variant: 'crystalcarapace', scale: 2.5, texturePool: 'stone', bodyColor: 0x4a6d7a, shell: 0x9fd8ee, accent: 0xeaf6ff, hue: [0.55, 0.08], sat: [0.35, 0.12], lit: [0.55, 0.12] },
        gildedzapback:   { variant: 'gildedzapback',   scale: 2.5, texturePool: 'stone', bodyColor: 0x7a6a3a, shell: 0xe8b53a, accent: 0xfff066, hue: [0.13, 0.05], sat: [0.55, 0.12], lit: [0.50, 0.10] },
        krakenleviathan: { variant: 'krakenleviathan', scale: 3.2, texturePool: 'void',  bodyColor: 0x2a3a5a, accent: 0x55ddcc, front: true, hue: [0.60, 0.08], sat: [0.50, 0.15], lit: [0.30, 0.10] },
        krakenspawn:     { variant: 'krakenspawn',     scale: 2.2, texturePool: 'water', bodyColor: 0x5a4a8a, accent: 0x66ccff, hue: [0.72, 0.08], sat: [0.45, 0.15], lit: [0.45, 0.10] },
        luminousjellyfish: { variant: 'luminousjellyfish', scale: 2.3, texturePool: 'void', bodyColor: 0x6a9ad8, accent: 0x88ffee, front: true, hue: [0.55, 0.10], sat: [0.45, 0.15], lit: [0.55, 0.12] },

        paralyticslug:     { variant: 'paralyticslug',     scale: 2.2, texturePool: 'flesh', bodyColor: 0x8a6a9a, accent: 0xbaff3a, front: true, hue: [0.78, 0.08], sat: [0.40, 0.15], lit: [0.48, 0.10] },
        sacredkraken:      { variant: 'sacredkraken',      scale: 3.0, texturePool: 'void',  bodyColor: 0xc9a85a, accent: 0xfff2a0, front: true, hue: [0.12, 0.06], sat: [0.45, 0.12], lit: [0.50, 0.10] },
        seaturtle:         { variant: 'seaturtle',         scale: 2.4, texturePool: 'water', bodyColor: 0x3a8d5a, shell: 0x2f6b3a, hue: [0.38, 0.08], sat: [0.45, 0.12], lit: [0.38, 0.10] },
        shadowtortoise:    { variant: 'shadowtortoise',    scale: 2.4, texturePool: 'void',  bodyColor: 0x2a2a33, shell: 0x14141a, accent: 0x7a4ac9, hue: [0.74, 0.06], sat: [0.30, 0.10], lit: [0.22, 0.08] },
        skullcrusherbrute: { variant: 'skullcrusherbrute', scale: 2.6, texturePool: 'flesh', bodyColor: 0x7a3a4a, accent: 0xffcc55, front: true, hue: [0.97, 0.06], sat: [0.50, 0.15], lit: [0.40, 0.10] },
        volcanicshark:     { variant: 'volcanicshark',     scale: 3.0, texturePool: 'stone', bodyColor: 0x3a2a2a, accent: 0xff5a1a, front: true, hue: [0.03, 0.05], sat: [0.45, 0.15], lit: [0.32, 0.10] },

        windleviathan:    { variant: 'windleviathan',    scale: 3.2, texturePool: 'void',  bodyColor: 0xa8d8e8, accent: 0xeafcff, front: true, hue: [0.52, 0.06], sat: [0.30, 0.12], lit: [0.66, 0.10] },
        abyssalleviathan: { variant: 'abyssalleviathan', scale: 3.4, texturePool: 'void',  bodyColor: 0x441a37, accent: 0x8d33cc, front: true, hue: [0.60, 0.06], sat: [0.55, 0.15], lit: [0.24, 0.10] },
        mindflayer:       { variant: 'mindflayer',       scale: 2.4, texturePool: 'void',  bodyColor: 0x6a4a8a, accent: 0xbb66ff, front: true, hue: [0.78, 0.06], sat: [0.40, 0.12], lit: [0.42, 0.10] },
        shellbreakerbulwark: { variant: 'shellbreakerbulwark', scale: 2.7, texturePool: 'stone', bodyColor: 0x6a5d4a, shell: 0x4a3d2a, accent: 0xb8a890, hue: [0.10, 0.05], sat: [0.35, 0.12], lit: [0.34, 0.10] },
        galeshelltortoise:   { variant: 'galeshelltortoise',   scale: 2.4, texturePool: 'water', bodyColor: 0xc8d0d4, shell: 0xa8b8c0, accent: 0xeafcff, hue: [0.55, 0.05], sat: [0.18, 0.10], lit: [0.62, 0.10] },
        nightcursetortoise:  { variant: 'nightcursetortoise',  scale: 2.5, texturePool: 'void',  bodyColor: 0x3a2a4a, shell: 0x281838, accent: 0xaa44ff, hue: [0.76, 0.06], sat: [0.45, 0.12], lit: [0.26, 0.10] },

        dawnshelltortoise:    { variant: 'dawnshelltortoise',    scale: 2.4, texturePool: 'stone', bodyColor: 0xc9a24a, shell: 0xf2c84a, accent: 0xfff6c0, hue: [0.13, 0.05], sat: [0.55, 0.12], lit: [0.55, 0.10] },
        pyroshelltortoise:    { variant: 'pyroshelltortoise',    scale: 2.4, texturePool: 'stone', bodyColor: 0x4a2a22, shell: 0x2a1410, accent: 0xff5a1a, hue: [0.04, 0.05], sat: [0.55, 0.15], lit: [0.34, 0.10] },
        stormshelltortoise:   { variant: 'stormshelltortoise',   scale: 2.4, texturePool: 'void',  bodyColor: 0x3a4a6a, shell: 0x2a3a55, accent: 0x99ddff, hue: [0.60, 0.06], sat: [0.45, 0.12], lit: [0.40, 0.10] },
        tidalcarapacetortoise:{ variant: 'tidalcarapacetortoise',scale: 2.4, texturePool: 'water', bodyColor: 0x2f6d9a, shell: 0x2a8db8, accent: 0xaef0ff, hue: [0.55, 0.06], sat: [0.50, 0.12], lit: [0.48, 0.10] },

        griefcollector:       { variant: 'griefcollector',       scale: 2.4, texturePool: 'void',  bodyColor: 0x241c30, accent: 0x9aa8ff, front: true, hue: [0.72, 0.06], sat: [0.30, 0.12], lit: [0.24, 0.08] },
        noneuclideancrab:     { variant: 'noneuclideancrab',     scale: 2.4, texturePool: 'void',  bodyColor: 0x161420, accent: 0x8a3aff, hue: [0.74, 0.06], sat: [0.40, 0.12], lit: [0.18, 0.08] },

        terraclawtortoise:     { variant: 'terraclawtortoise',     scale: 2.6, texturePool: 'stone', bodyColor: 0x6a5a3a, shell: 0x5a5048, accent: 0x8a7250, hue: [0.10, 0.05], sat: [0.30, 0.12], lit: [0.34, 0.10] },
        horseshoecrab:         { variant: 'horseshoecrab',         scale: 2.3, texturePool: 'stone', bodyColor: 0x7a4a2a, accent: 0x3a2210, hue: [0.07, 0.04], sat: [0.45, 0.12], lit: [0.34, 0.10] },
        armoredrexlord:        { variant: 'armoredrexlord',        scale: 2.8, texturePool: 'stone', bodyColor: 0x7a6a4a, shell: 0x6a5240, accent: 0xc8b890, hue: [0.10, 0.05], sat: [0.35, 0.12], lit: [0.38, 0.10] },
        steelshelltortoise:    { variant: 'steelshelltortoise',    scale: 2.5, texturePool: 'stone', bodyColor: 0x5a6068, shell: 0x9aa4ae, accent: 0xd8e0e8, hue: [0.58, 0.04], sat: [0.10, 0.08], lit: [0.55, 0.10] },
        primordialdragonturtle:{ variant: 'primordialdragonturtle',scale: 3.0, texturePool: 'water', bodyColor: 0x3a6a7a, shell: 0xa8e0ee, accent: 0xeafcff, hue: [0.52, 0.06], sat: [0.40, 0.12], lit: [0.52, 0.10] },
        // ── Bespoke squids split from the shared 'octopus' rig ──
        aqu_bubblesquid:       { variant: 'aqu_bubblesquid',       scale: 1.9, texturePool: 'water', bodyColor: 0x4a9ad8, accent: 0xbfe9ff, hue: [0.55, 0.08], sat: [0.45, 0.15], lit: [0.55, 0.12] },
        aqu_bubblesquidsecond: { variant: 'aqu_bubblesquidsecond', scale: 1.8, texturePool: 'water', bodyColor: 0x6ac0a8, accent: 0xbaff6a, hue: [0.42, 0.08], sat: [0.45, 0.15], lit: [0.52, 0.12] },
        // ── Level 1-5 starter roster (bespoke, one builder each) ──
        lv_moonjellyling:   { variant: 'moonjellyling',   scale: 1.7, texturePool: 'water', bodyColor: 0xd8e8f8, accent: 0xf0a8d0, hue: [0.58, 0.05], sat: [0.30, 0.10], lit: [0.85, 0.05] },
        lv_voidjellyling:   { variant: 'voidjellyling',   scale: 1.8, texturePool: 'void',  bodyColor: 0x1a142e, accent: 0x9a5aff, hue: [0.74, 0.05], sat: [0.40, 0.10], lit: [0.12, 0.05] },
        lv_tidepooloctopus: { variant: 'tidepooloctopus', scale: 1.6, texturePool: 'water', bodyColor: 0xc85a3a, accent: 0xf0d0a0, hue: [0.04, 0.04], sat: [0.55, 0.10], lit: [0.45, 0.06] },
        lv_templetortoise:  { variant: 'templetortoise',  scale: 2.0, texturePool: 'stone', bodyColor: 0x8a7a5a, shell: 0x5a4a32, accent: 0xc8302a, hue: [0.11, 0.04], sat: [0.25, 0.08], lit: [0.42, 0.06] }
    };

    class AquaticBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = AQ_PROFILES[creatureType] || AQ_PROFILES.aquaticfish;
            super(scale, offsetY, battler, profile, 0, creatureType || 'aquaticfish');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._segments = [];
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'octopus':   this._buildOctopus(); break;
                case 'aqu_bubblesquid':       this._buildBubbleSquid(); break;
                case 'aqu_bubblesquidsecond': this._buildBubbleSquidSecond(); break;
                case 'frog':
                case 'amphibian': this._buildFrog(this.variant === 'amphibian'); break;
                case 'turtle':    this._buildTurtle(); break;
                case 'snail':     this._buildSnail(); break;
                case 'serpent':   this._buildSerpent(); break;
                case 'worm':      this._buildWorm(); break;
                case 'crab':      this._buildCrustacean(); break;
                case 'coralwarcaster':  this._buildCoralWarcaster(); break;
                case 'crystalcarapace': this._buildCrystalCarapace(); break;
                case 'gildedzapback':   this._buildGildedZapback(); break;
                case 'krakenleviathan': this._buildKrakenLeviathan(); break;
                case 'krakenspawn':     this._buildKrakenSpawn(); break;
                case 'luminousjellyfish': this._buildLuminousJellyfish(); break;
                case 'paralyticslug':     this._buildParalyticSlug(); break;
                case 'sacredkraken':      this._buildSacredKraken(); break;
                case 'seaturtle':         this._buildSeaTurtle(); break;
                case 'shadowtortoise':    this._buildShadowTortoise(); break;
                case 'skullcrusherbrute': this._buildSkullcrusherBrute(); break;
                case 'volcanicshark':     this._buildVolcanicShark(); break;
                case 'windleviathan':     this._buildWindLeviathan(); break;
                case 'abyssalleviathan':  this._buildAbyssalLeviathan(); break;
                case 'mindflayer':        this._buildMindFlayer(); break;
                case 'shellbreakerbulwark': this._buildShellbreakerBulwark(); break;
                case 'galeshelltortoise':   this._buildGaleshellTortoise(); break;
                case 'nightcursetortoise':  this._buildNightcurseTortoise(); break;
                case 'dawnshelltortoise':     this._buildDawnshellTortoise(); break;
                case 'pyroshelltortoise':     this._buildPyroshellTortoise(); break;
                case 'stormshelltortoise':    this._buildStormshellTortoise(); break;
                case 'tidalcarapacetortoise': this._buildTidalcarapaceTortoise(); break;
                case 'griefcollector':        this._buildGriefCollector(); break;
                case 'noneuclideancrab':      this._buildNonEuclideanCrab(); break;
                case 'terraclawtortoise':     this._buildTerraclawTortoise(); break;
                case 'horseshoecrab':         this._buildHorseshoeCrab(); break;
                case 'armoredrexlord':        this._buildArmoredRexLord(); break;
                case 'steelshelltortoise':    this._buildSteelshellTortoise(); break;
                case 'primordialdragonturtle': this._buildPrimordialDragonTurtle(); break;
                case 'moonjellyling':   this._buildMoonJellyling(); break;
                case 'voidjellyling':   this._buildVoidJellyling(); break;
                case 'tidepooloctopus': this._buildTidepoolOctopus(); break;
                case 'templetortoise':  this._buildTempleTortoise(); break;
                default:          this._buildFish(); break;
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
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.7 : rough)); }

        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(0xffe9c0, 1.0, 0.3));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 6, 6), this._mat(accent || 0x111111, 1.0, 0.2, accent));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil);
            parent.add(eye); return eye;
        }

        // A tapering, waving appendage (tentacle/segment chain) pivoted at top.
        _chain(mat, x, y, z, segs, r0, len, down) {
            const g = new THREE.Group();
            const parts = [];
            let py = 0;
            for (let i = 0; i < segs; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(r0 - i * (r0 * 0.7 / segs), 8, 8), mat);
                s.position.y = py; g.add(s); parts.push(s);
                py -= len / segs;
            }
            g.position.set(x, y, z);
            if (!down) g.rotation.x = Math.PI; // point up
            g._parts = parts;
            this.bodyGroup.add(g);
            this._segments.push(g);
            return g;
        }

        // A thin strand run down the middle of a _chain, for chains whose beads
        // are spaced wider than they are round: without it the tentacle reads
        // (and measures) as a column of separate floating pearls.
        _thread(chain, mat, r) {
            const n = chain._parts.length;
            if (n < 2) return chain;
            const len = -chain._parts[n - 1].position.y;
            const strand = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.6, len, 5), mat);
            strand.position.y = -len / 2; chain.add(strand);
            return chain;
        }

        // ── Fish ─────────────────────────────────────────────────────────────
        _buildFish() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.5);
            const finMat = this._mat(p.bodyColor, 0.85, 0.6);

            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), bodyMat);
            this.body.position.set(0, 1.0, 0); this.body.scale.set(1.6, 1.0, 0.7);
            this.bodyGroup.add(this.body);

            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), bodyMat);
            h.scale.set(1.1, 1.0, 0.7); this.head.add(h);
            this._eye(this.head, -0.12, 0.08, 0.18, 0.08, 0x111111);
            this._eye(this.head, 0.12, 0.08, 0.18, 0.08, 0x111111);
            this.head.position.set(0.55, 1.0, 0); this.head.rotation.y = Math.PI / 2;
            this.bodyGroup.add(this.head);

            this.tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 4), finMat);
            this.tailFin.position.set(-0.75, 1.0, 0); this.tailFin.rotation.z = Math.PI / 2; this.tailFin.scale.set(1, 1, 0.1);
            this.bodyGroup.add(this.tailFin);
            this.dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 4), finMat);
            this.dorsalFin.position.set(0, 1.42, 0); this.dorsalFin.scale.set(1.6, 1, 0.1);
            this.bodyGroup.add(this.dorsalFin);
            this.lPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), finMat);
            this.lPec.position.set(0.1, 0.95, 0.32); this.lPec.rotation.x = -1.2; this.lPec.scale.set(1, 1, 0.1);
            this.bodyGroup.add(this.lPec);
            this.rPec = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 4), finMat);
            this.rPec.position.set(0.1, 0.95, -0.32); this.rPec.rotation.x = 1.2; this.rPec.scale.set(1, 1, 0.1);
            this.bodyGroup.add(this.rPec);

            this._partMeshMap = { BODY: this.body, HEAD: this.head, TAIL_FIN: this.tailFin, DORSAL_FIN: this.dorsalFin, LEFT_PECTORAL_FIN: this.lPec, RIGHT_PECTORAL_FIN: this.rPec };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.head, this.tailFin, this.dorsalFin, this.lPec, this.rPec] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL_FIN'], hide: [this.tailFin] },
                { gone: ['DORSAL_FIN'], hide: [this.dorsalFin] },
                { gone: ['LEFT_PECTORAL_FIN'], hide: [this.lPec] },
                { gone: ['RIGHT_PECTORAL_FIN'], hide: [this.rPec] },
            ];
        }

        // ── Octopus ──────────────────────────────────────────────────────────
        _buildOctopus() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.5);
            this.mantle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), bodyMat);
            this.mantle.position.set(0, 1.45, 0); this.mantle.scale.set(1.0, 1.3, 1.0);
            this.bodyGroup.add(this.mantle);
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), bodyMat);
            this.head.position.set(0, 1.05, 0);
            this.bodyGroup.add(this.head);
            this._eye(this.head, -0.2, 0.05, 0.3, 0.11, 0x111111);
            this._eye(this.head, 0.2, 0.05, 0.3, 0.11, 0x111111);

            this.tents = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const t = this._chain(bodyMat, Math.cos(a) * 0.28, 0.9, Math.sin(a) * 0.28, 5, 0.13, 0.95, true);
                this.tents.push(t);
            }
            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.tents[0], TENTACLE_2: this.tents[1], TENTACLE_3: this.tents[2], TENTACLE_4: this.tents[3] };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.mantle, ...this.tents] },
                { gone: ['MANTLE'], hide: [this.mantle] },
                { gone: ['TENTACLE_1'], hide: [this.tents[0]] },
                { gone: ['TENTACLE_2'], hide: [this.tents[1]] },
                { gone: ['TENTACLE_3'], hide: [this.tents[2]] },
                { gone: ['TENTACLE_4'], hide: [this.tents[3]] },
            ];
        }

        // ── Shared small-squid rig: streamlined mantle + head + 4 tentacles ──
        // Bubble kind: 'clear' (escape clouds) or 'toxic' (paralytic soap bubbles).
        _buildSquid(bubbleKind) {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.45);
            // Pointed torpedo mantle (squid, not round octopus).
            this.mantle = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 14), bodyMat);
            this.mantle.position.set(0, 1.5, 0); this.mantle.scale.set(1.0, 1.0, 0.85);
            this.bodyGroup.add(this.mantle);
            // Two triangular fins near the mantle tip.
            const finMat = this._mat(p.bodyColor, 0.8, 0.6);
            // Fins are children of the mantle, so they sit in its own space near
            // the tip (body-space y 1.9 put them a body length over the squid).
            for (const fx of [-1, 1]) { const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), finMat); fin.position.set(fx * 0.22, 0.3, 0); fin.rotation.z = fx * 1.1; fin.scale.set(1, 1, 0.15); this.mantle.add(fin); }
            // Head with two large squid eyes.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 12), bodyMat);
            this.head.position.set(0, 1.0, 0); this.head.scale.set(1.0, 0.9, 1.0);
            this.bodyGroup.add(this.head);
            this._eye(this.head, -0.22, 0.06, 0.26, 0.13, p.accent);
            this._eye(this.head, 0.22, 0.06, 0.26, 0.13, p.accent);
            // Four short tentacles.
            this.tents = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const t = this._chain(bodyMat, Math.cos(a) * 0.24, 0.82, Math.sin(a) * 0.24, 5, 0.11, 0.8, true);
                this.tents.push(t);
            }
            // Bubbles it expels.
            this.bubbles = new THREE.Group();
            this.bubbles.userData.float = true; // vented clouds drift free by design
            const bubMat = (bubbleKind === 'toxic')
                ? this._mat(p.accent, 0.4, 0.2, p.accent)
                : this._mat(0xeaf6ff, 0.35, 0.2);
            this._bubbleMat = bubMat;
            for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + this.idRand() * 0.06, 8, 8), bubMat); b.position.set((this.idRand() - 0.5) * 1.0, 0.4 + this.idRand() * 1.4, 0.3 + this.idRand() * 0.4); b._t = this.idRand(); this.bubbles.add(b); }
            this.bodyGroup.add(this.bubbles);

            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.tents[0], TENTACLE_2: this.tents[1], TENTACLE_3: this.tents[2], TENTACLE_4: this.tents[3] };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.mantle, this.bubbles, ...this.tents] },
                { gone: ['MANTLE'], hide: [this.mantle] },
                { gone: ['TENTACLE_1'], hide: [this.tents[0]] },
                { gone: ['TENTACLE_2'], hide: [this.tents[1]] },
                { gone: ['TENTACLE_3'], hide: [this.tents[2]] },
                { gone: ['TENTACLE_4'], hide: [this.tents[3]] },
            ];
        }

        // ── Bubble Squid: pale blue squid venting disorienting bubble clouds ─
        _buildBubbleSquid() { this._buildSquid('clear'); }

        // ── Bubble Squid Second: teal squid blowing toxic paralytic bubbles ─
        _buildBubbleSquidSecond() {
            this._buildSquid('toxic');
            // Tint the eyes bright toxic green and add a puffed poison sac.
            const p = this.profile;
            this.sac = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(p.accent, 0.7, 0.4, p.accent));
            this.sac.position.set(0, 0.78, 0.28); this.head.add(this.sac);
            this._cascadeRules[0].hide.push(this.sac);
        }

        // ── Frog / Amphibian ─────────────────────────────────────────────────
        _buildFrog(isAmphibian) {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.6);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), bodyMat);
            this.body.position.set(0, 0.6, 0); this.body.scale.set(1.1, 0.85, 1.2);
            this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), bodyMat);
            h.scale.set(1.2, 0.7, 1.0); this.head.add(h);
            this._eye(this.head, -0.2, 0.22, 0.18, 0.13, 0x111111);
            this._eye(this.head, 0.2, 0.22, 0.18, 0.13, 0x111111);
            this.head.position.set(0, 0.75, 0.45);
            this.bodyGroup.add(this.head);

            this.vocalSac = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this._mat(p.accent, 0.85, 0.5));
            this.vocalSac.position.set(0, 0.4, 0.42); this.bodyGroup.add(this.vocalSac);
            this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.5), this._mat(0xd8556a, 1.0, 0.5));
            this.tongue.position.set(0, 0.7, 0.7); this.tongue.visible = false;
            this.bodyGroup.add(this.tongue);

            const legMat = bodyMat;
            this.leftLeg = this._frogLeg(legMat, -0.4, 0.5, true);
            this.rightLeg = this._frogLeg(legMat, 0.4, 0.5, true);
            this._partMeshMap = { HEAD: this.head, TONGUE: this.tongue, LEFT_LEG: this.leftLeg, RIGHT_LEG: this.rightLeg };
            const rules = [
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TONGUE'], hide: [this.tongue] },
                { gone: ['LEFT_LEG'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG'], hide: [this.rightLeg] },
            ];
            if (isAmphibian) {
                this._partMeshMap.TORSO = this.body;
                rules.unshift({ gone: ['TORSO'], hide: [this.body, this.head, this.leftLeg, this.rightLeg] });
            } else {
                this.hindLeft = this._frogLeg(legMat, -0.45, -0.4, false);
                this.hindRight = this._frogLeg(legMat, 0.45, -0.4, false);
                this.body2 = this.body;
                this._partMeshMap.BODY = this.body;
                this._partMeshMap.VOCAL_SAC = this.vocalSac;
                this._partMeshMap.HIND_LEFT_LEG = this.hindLeft;
                this._partMeshMap.HIND_RIGHT_LEG = this.hindRight;
                rules.unshift({ gone: ['BODY'], hide: [this.body, this.head, this.vocalSac, this.leftLeg, this.rightLeg, this.hindLeft, this.hindRight] });
                rules.push({ gone: ['VOCAL_SAC'], hide: [this.vocalSac] });
                rules.push({ gone: ['HIND_LEFT_LEG'], hide: [this.hindLeft] });
                rules.push({ gone: ['HIND_RIGHT_LEG'], hide: [this.hindRight] });
            }
            this._cascadeRules = rules;
        }
        _frogLeg(mat, x, z, front) {
            const g = new THREE.Group();
            const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.35, 8), mat);
            upper.position.set(0, -0.15, 0); upper.rotation.x = front ? -0.6 : 0.6; g.add(upper);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.26), mat);
            foot.position.set(0, -0.32, front ? 0.18 : -0.18); g.add(foot);
            g.position.set(x, 0.45, z);
            this.bodyGroup.add(g);
            return g;
        }

        // ── Turtle ───────────────────────────────────────────────────────────
        _buildTurtle() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.8));
            this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            this.shell.position.set(0, 0.7, 0); this.shell.scale.set(1.1, 0.8, 1.3);
            this.bodyGroup.add(this.shell);
            const plastron = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), shellMat);
            plastron.position.set(0, 0.55, 0); plastron.scale.set(1.1, 1, 1.3); this.bodyGroup.add(plastron);

            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
            h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.16, 0.05, 0x111111);
            this._eye(this.head, 0.1, 0.05, 0.16, 0.05, 0x111111);
            this.head.position.set(0, 0.62, 0.75); this.bodyGroup.add(this.head);

            this.frontLeft = this._stub(skinMat, -0.45, 0.45);
            this.frontRight = this._stub(skinMat, 0.45, 0.45);
            this.rearLeft = this._stub(skinMat, -0.45, -0.45);
            this.rearRight = this._stub(skinMat, 0.45, -0.45);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), skinMat);
            this.tail.position.set(0, 0.55, -0.72); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);

            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _stub(mat, x, z) {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.3, 8), mat);
            m.position.set(x, 0.45, z); m.rotation.z = x > 0 ? -0.5 : 0.5;
            this.bodyGroup.add(m); return m;
        }

        // ── Snail ────────────────────────────────────────────────────────────
        _buildSnail() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.5);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.7));
            // Slug body + foot.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), bodyMat);
            this.body.position.set(0, 0.45, 0.2); this.body.scale.set(1.0, 1.0, 2.0);
            this.bodyGroup.add(this.body);
            this.foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 1.1), bodyMat);
            this.foot.position.set(0, 0.18, 0.1); this.bodyGroup.add(this.foot);
            // Spiral-ish shell (stacked tori shrinking).
            this.shell = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 - i * 0.07, 0.14 - i * 0.02, 8, 16), shellMat);
                ring.position.set(0, 0.55 + i * 0.04, -0.25 - i * 0.02); ring.rotation.y = Math.PI / 2;
                this.shell.add(ring);
            }
            this.bodyGroup.add(this.shell);
            // Eye stalks (tentacles) with an eye on top of each.
            this.t1 = this._stalk(bodyMat, -0.1, p.accent);
            this.t2 = this._stalk(bodyMat, 0.1, p.accent);
            this.eyeG = new THREE.Group(); this.eyeG.add(this.t1, this.t2); // group ref for EYE part
            this._partMeshMap = { SHELL: this.shell, BODY: this.body, FOOT: this.foot, TENTACLE_1: this.t1, TENTACLE_2: this.t2, EYE: this.t1 };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.shell, this.foot, this.t1, this.t2] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['FOOT'], hide: [this.foot] },
                { gone: ['TENTACLE_1'], hide: [this.t1] },
                { gone: ['TENTACLE_2'], hide: [this.t2] },
                { gone: ['EYE'], hide: [this.t1, this.t2] },
            ];
        }
        _stalk(mat, x, accent) {
            const g = new THREE.Group();
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), mat);
            stalk.position.y = 0.2; g.add(stalk);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(accent || 0x111111, 1.0, 0.2));
            eye.position.y = 0.42; g.add(eye);
            g.position.set(x, 0.6, 0.55);
            this.bodyGroup.add(g); return g;
        }

        // ── Serpent ──────────────────────────────────────────────────────────
        _buildSerpent() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.5);
            // S-curve body from segments.
            this.seg1 = this._coilSeg(bodyMat, 0, 0.4);
            this.seg2 = this._coilSeg(bodyMat, 1, 0.34);
            this.tail = this._coilSeg(bodyMat, 2, 0.22);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), bodyMat);
            h.scale.set(1.0, 0.8, 1.4); this.head.add(h);
            this._eye(this.head, -0.12, 0.06, 0.2, 0.06, p.accent);
            this._eye(this.head, 0.12, 0.06, 0.2, 0.06, p.accent);
            this.head.position.set(0, 1.15, 0.5);
            this.bodyGroup.add(this.head);
            this.fangs = new THREE.Group();
            const fMat = this._mat(0xf0e6cf, 1.0, 0.4);
            for (const fx of [-0.07, 0.07]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), fMat); f.position.set(fx, -0.05, 0.28); f.rotation.x = Math.PI; this.head.add(f); this.fangs.add(f); }
            this.head.add(this.fangs);

            this._partMeshMap = { HEAD: this.head, FANGS: this.fangs, BODY_SEGMENT_1: this.seg1, BODY_SEGMENT_2: this.seg2, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.fangs] },
                { gone: ['FANGS'], hide: [this.fangs] },
                { gone: ['BODY_SEGMENT_1'], hide: [this.seg1] },
                { gone: ['BODY_SEGMENT_2'], hide: [this.seg2] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _coilSeg(mat, i, r) {
            const a = i * 1.1;
            const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
            seg.position.set(Math.sin(a) * 0.35, 0.5 + i * 0.22, Math.cos(a) * 0.2 - 0.1);
            seg.scale.set(1, 1, 1.3);
            this.bodyGroup.add(seg);
            this._segments.push(seg);
            seg._phase = i;
            return seg;
        }

        // ── Segmented worm ───────────────────────────────────────────────────
        _buildWorm() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.55);
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), bodyMat);
            this.head.position.set(0, 0.5, 0.7); this.bodyGroup.add(this.head);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 8, 12), this._mat(p.accent, 1.0, 0.5));
            mouth.position.set(0, 0, 0.3); this.head.add(mouth);
            this.heartSeg = this._wormSeg(bodyMat, 1, 0.34, p.accent);
            this.bodySeg = this._wormSeg(bodyMat, 2, 0.32, null);
            this.tail = this._wormSeg(bodyMat, 3, 0.2, null);
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: this.heartSeg, BODY_SEGMENT: this.bodySeg, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['HEART_SEGMENT'], hide: [this.heartSeg] },
                { gone: ['BODY_SEGMENT'], hide: [this.bodySeg] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }
        _wormSeg(mat, i, r, accent) {
            const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
            seg.position.set(0, 0.5, 0.7 - i * 0.45); seg.scale.set(1.0, 1.0, 1.2);
            this.bodyGroup.add(seg); this._segments.push(seg); seg._phase = i;
            if (accent) { const glow = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 8, 8), this._mat(accent, 0.9, 0.3, accent)); seg.add(glow); }
            return seg;
        }

        // ── Crustacean (crab/lobster) ─────────────────────────────────────────
        _buildCrustacean() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.5);
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            this.carapace.position.set(0, 0.7, 0); this.carapace.scale.set(1.5, 0.7, 1.1);
            this.bodyGroup.add(this.carapace);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), mat);
            this.abdomen.position.set(0, 0.6, -0.55); this.abdomen.scale.set(1.2, 0.6, 1.0);
            this.bodyGroup.add(this.abdomen);
            this._eye(this.carapace, -0.22, 0.4, 0.5, 0.06, p.accent);
            this._eye(this.carapace, 0.22, 0.4, 0.5, 0.06, p.accent);
            this.antennae = new THREE.Group();
            for (const ax of [-0.12, 0.12]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), mat); a.position.set(ax, 0.95, 0.45); a.rotation.x = -0.7; this.antennae.add(a); }
            this.bodyGroup.add(this.antennae);
            this.clawL = this._crabClaw(mat, -1); this.clawR = this._crabClaw(mat, 1);
            // A couple of walking legs each side, grouped into FRONT_LEG / REAR_LEG.
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (const side of [-1, 1]) {
                for (let i = 0; i < 2; i++) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.55, 6), mat);
                    leg.position.set(side * 0.6, 0.55, 0.2 - i * 0.4); leg.rotation.z = side * 1.1; leg.rotation.x = i * 0.2;
                    (i === 0 ? this.frontLeg : this.rearLeg).add(leg);
                }
            }
            this.bodyGroup.add(this.frontLeg); this.bodyGroup.add(this.rearLeg);
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] },
                { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] },
                { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }
        _crabClaw(mat, side) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 7), mat);
            arm.position.set(side * 0.4, 0, 0.3); arm.rotation.x = 1.2; arm.rotation.z = side * 0.3; g.add(arm);
            const claw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat);
            claw.position.set(side * 0.55, 0, 0.62); claw.scale.set(0.7, 0.5, 1.3); g.add(claw);
            const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), mat);
            pincer.position.set(side * 0.55, 0.12, 0.78); pincer.rotation.x = 1.5; g.add(pincer);
            g.position.set(0, 0.65, 0); g._side = side;
            this.bodyGroup.add(g); return g;
        }

        // ── Shared turtle chassis (shell + head + 4 legs + tail) ──────────────
        // Returns the four stub legs + tail; subclasses build the shell on top.
        _turtleChassis(skinMat, headShape) {
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
            h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.16, 0.05, 0x111111);
            this._eye(this.head, 0.1, 0.05, 0.16, 0.05, 0x111111);
            this.head.position.set(0, 0.62, 0.78); this.bodyGroup.add(this.head);
            this.frontLeft = this._stub(skinMat, -0.5, 0.42);
            this.frontRight = this._stub(skinMat, 0.5, 0.42);
            this.rearLeft = this._stub(skinMat, -0.5, -0.42);
            this.rearRight = this._stub(skinMat, 0.5, -0.42);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), skinMat);
            this.tail.position.set(0, 0.55, -0.78); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
        }
        _turtleRig(extraShellHides) {
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            const all = [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail].concat(extraShellHides || []);
            this._cascadeRules = [
                { gone: ['SHELL'], hide: all },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // Belly plate (plastron) filling the gap between a raised dome and the
        // tops of the legs, so the legs have something to hang from. Built in
        // the shell group's own space and hidden with it.
        _plastron(mat, shellY, legTopY, rx, rz, dz) {
            const h = Math.max(0.1, shellY - legTopY + 0.08);
            const belly = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.92, 1, 12), mat);
            belly.scale.set(rx, h, rz); belly.position.set(0, -h / 2 + 0.04, dz || 0);
            this.shell.add(belly); return belly;
        }

        // ── Coralic Warcaster (coral-encrusted sea turtle + storm orbs) ───────
        _buildCoralWarcaster() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.85));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.1, 0.85, 1.3); this.shell.add(dome);
            // Coral branches sprouting from the carapace.
            const coralMat = this._mat(0xff7a5a, 1.0, 0.7);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const branch = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32 + this.idRand() * 0.18, 5), coralMat);
                branch.position.set(Math.cos(a) * 0.35, 0.45, Math.sin(a) * 0.42);
                branch.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5);
                const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 7), coralMat);
                tip.position.y = 0.2; branch.add(tip);
                this.shell.add(branch);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            // Orbiting storm orbs (kept on the shell group so they vanish with it).
            this.stormOrbs = [];
            const orbMat = this._mat(p.accent, 0.85, 0.3, p.accent);
            for (let i = 0; i < 3; i++) {
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), orbMat);
                orb._a = (i / 3) * Math.PI * 2; orb.userData.float = true;
                this.shell.add(orb); this.stormOrbs.push(orb);
            }
            this._turtleChassis(skinMat);
            this._turtleRig(this.stormOrbs);
        }

        // ── CrystalCarapace Sentinel (jagged crystalline turtle) ──────────────
        _buildCrystalCarapace() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.5);
            const crystalMat = this._mat(p.shell, 0.7, 0.15, 0x335577);
            this.shell = new THREE.Group();
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.applySkin(this._mat(p.shell, 1.0, 0.3)));
            core.scale.set(1.1, 0.8, 1.3); this.shell.add(core);
            // Jagged faceted shards jutting upward from the carapace (octahedra).
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2;
                const ring = 0.1 + (i % 3) * 0.16;
                const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.13 + this.idRand() * 0.08, 0), crystalMat);
                shard.position.set(Math.cos(a) * ring, 0.35 + (i % 3) * 0.12, Math.sin(a) * ring * 1.2);
                shard.rotation.set(this.idRand() * 1.0, a, this.idRand() * 1.0);
                shard.scale.set(0.7, 1.6, 0.7);
                this.shell.add(shard);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig();
        }

        // ── Gilded Zapback (golden turtle crackling with lightning) ───────────
        _buildGildedZapback() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.55);
            const goldMat = this.applySkin(this._mat(p.shell, 1.0, 0.25, 0x4a3a00));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
            dome.scale.set(1.1, 0.85, 1.3); this.shell.add(dome);
            // Raised hexagonal gold plates (scutes) studding the dome.
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 6), goldMat);
                plate.position.set(Math.cos(a) * 0.32, 0.46, Math.sin(a) * 0.4);
                plate.rotation.x = Math.PI / 2 + Math.sin(a) * 0.3; this.shell.add(plate);
            }
            // Lightning arcs: thin bright zig-zag bars arcing over the shell.
            this.arcs = new THREE.Group();
            this.arcs.userData.float = true; // arcing over the shell, not on it
            const arcMat = this._mat(p.accent, 0.9, 0.2, p.accent);
            for (let i = 0; i < 5; i++) {
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 4), arcMat);
                const a = this.idRand() * Math.PI * 2;
                seg.position.set(Math.cos(a) * 0.3, 0.55 + this.idRand() * 0.2, Math.sin(a) * 0.36);
                seg.rotation.set(this.idRand() * 2, this.idRand() * 2, this.idRand() * 2);
                this.arcs.add(seg);
            }
            this.shell.add(this.arcs);
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig();
        }

        // ── Kraken Leviathan (deep-sea horror: eye, maw, plates, tentacles) ───
        _buildKrakenLeviathan() {
            const p = this.profile;
            const fleshMat = this._skinMat(p.bodyColor, 0.6);
            // Bulbous main body.
            this.heartChamber = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 14), fleshMat);
            this.heartChamber.position.set(0, 1.4, 0); this.heartChamber.scale.set(1.0, 1.2, 0.9);
            this.bodyGroup.add(this.heartChamber);
            const heartGlow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), this._mat(0xff3355, 0.85, 0.3, 0xff2244));
            heartGlow.position.set(0, 0, 0.2); this.heartChamber.add(heartGlow);
            // Single huge eye on the front.
            this.eye = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), this._mat(0xfff4d8, 1.0, 0.2));
            this.eye.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 1.0, 0.2, p.accent));
            iris.position.z = 0.22; this.eye.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), this._mat(0x000000, 1.0, 0.2));
            pupil.position.z = 0.34; this.eye.add(pupil);
            this.eye.position.set(0, 1.7, 0.55); this.bodyGroup.add(this.eye);
            // Gaping circular maw lined with teeth, below the eye.
            this.maw = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 10, 16), fleshMat);
            this.maw.add(ring);
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), this._mat(0x3a0a14, 1.0, 0.6));
            gullet.position.z = -0.12; this.maw.add(gullet);
            const teethMat = this._mat(0xf0e6cf, 1.0, 0.3);
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), teethMat);
                tooth.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.08);
                tooth.rotation.set(Math.PI / 2, 0, -a); this.maw.add(tooth);
            }
            this.maw.position.set(0, 1.05, 0.5); this.bodyGroup.add(this.maw);
            // Dorsal plates: row of jagged fins along the top of the body.
            this.dorsalPlates = new THREE.Group();
            const plateMat = this._mat(p.bodyColor, 1.0, 0.5);
            for (let i = 0; i < 5; i++) {
                // Rooted along the crown of the body (an ellipsoid 0.78 tall and
                // 0.585 deep): the old straight row ran on past its back end.
                const h = 0.45 - i * 0.04, z = -0.1 - i * 0.11;
                const plate = new THREE.Mesh(new THREE.ConeGeometry(0.18 - i * 0.02, h, 4), plateMat);
                plate.position.set(0, 1.4 + 0.78 * Math.sqrt(Math.max(0, 1 - (z / 0.585) * (z / 0.585))) + h / 2 - 0.08, z); plate.scale.set(1, 1, 0.18);
                this.dorsalPlates.add(plate);
            }
            this.bodyGroup.add(this.dorsalPlates);
            // Writhing tentacle bundle hanging beneath.
            this.tentacles = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const t = this._chain(fleshMat, Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3, 5, 0.12, 1.1, true);
                this.tentacles.add(t);
            }
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsalPlates, TENTACLES: this.tentacles, HEART_CHAMBER: this.heartChamber };
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.heartChamber, this.eye, this.maw, this.dorsalPlates, this.tentacles] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['DORSAL_PLATES'], hide: [this.dorsalPlates] },
                { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Kraken Spawn (young octopus: pointed mantle, 4 curling tentacles) ─
        _buildKrakenSpawn() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.5);
            // Pointed cone mantle.
            this.mantle = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 14), bodyMat);
            this.mantle.position.set(0, 1.7, 0); this.bodyGroup.add(this.mantle);
            // Rounded head below.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), bodyMat);
            this.head.position.set(0, 1.05, 0); this.head.scale.set(1.0, 0.85, 1.0);
            this.bodyGroup.add(this.head);
            this._eye(this.head, -0.2, 0.06, 0.34, 0.12, p.accent);
            this._eye(this.head, 0.2, 0.06, 0.34, 0.12, p.accent);
            // Four curling tentacles.
            this.tents = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const t = this._chain(bodyMat, Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3, 6, 0.12, 1.0, true);
                this.tents.push(t);
            }
            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.tents[0], TENTACLE_2: this.tents[1], TENTACLE_3: this.tents[2], TENTACLE_4: this.tents[3] };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.mantle, ...this.tents] },
                { gone: ['MANTLE'], hide: [this.mantle] },
                { gone: ['TENTACLE_1'], hide: [this.tents[0]] },
                { gone: ['TENTACLE_2'], hide: [this.tents[1]] },
                { gone: ['TENTACLE_3'], hide: [this.tents[2]] },
                { gone: ['TENTACLE_4'], hide: [this.tents[3]] },
            ];
        }

        // ── Luminous Jellyfish (translucent bell, glowing core, tendrils) ─────
        _buildLuminousJellyfish() {
            const p = this.profile;
            // Translucent dome bell.
            this.bell = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), this._mat(p.bodyColor, 0.45, 0.2, p.accent));
            this.bell.position.set(0, 1.7, 0); this.bell.scale.set(1.1, 1.0, 1.1);
            this.bodyGroup.add(this.bell);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 20), this._mat(p.accent, 0.7, 0.2, p.accent));
            rim.position.set(0, 1.5, 0); rim.rotation.x = Math.PI / 2; this.bell.add(rim); rim.position.y = -0.2;
            // Glowing core suspended inside the bell, doubles as the "EYE".
            this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), this._mat(0xffffcc, 0.9, 0.1, p.accent));
            this.eye.position.set(0, 1.55, 0); this.bodyGroup.add(this.eye);
            // Two long trailing tentacle ribbons + several oral arms.
            const tentMat = this._mat(p.accent, 0.6, 0.3, p.accent);
            this.tentOne = this._thread(this._chain(tentMat, -0.18, 1.45, 0.0, 7, 0.06, 1.5, true), tentMat, 0.022);
            this.tentTwo = this._thread(this._chain(tentMat, 0.18, 1.45, 0.0, 7, 0.06, 1.5, true), tentMat, 0.022);
            this.oralArms = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const arm = this._thread(this._chain(tentMat, Math.cos(a) * 0.25, 1.45, Math.sin(a) * 0.25, 4, 0.045, 0.7, true), tentMat, 0.018);
                this.oralArms.add(arm);
            }
            this._partMeshMap = { BODY: this.bell, EYE: this.eye, TENTACLE_ONE: this.tentOne, TENTACLE_TWO: this.tentTwo };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.bell, this.eye, this.tentOne, this.tentTwo, this.oralArms] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.tentOne] },
                { gone: ['TENTACLE_TWO'], hide: [this.tentTwo] },
            ];
        }

        // ── Paralytic Slug (bloated slug, barbed stinger tentacles, eye-stalks) ─
        _buildParalyticSlug() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.4);
            // Bloated, glossy slug body slumped low and forward.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), bodyMat);
            this.body.position.set(0, 0.7, 0); this.body.scale.set(1.0, 1.1, 1.6);
            this.bodyGroup.add(this.body);
            const mantle = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
            mantle.position.set(0, 0.36, 0.12); mantle.scale.set(1.3, 0.7, 1.4); this.body.add(mantle); // in the body's own space
            // Slimy foot trail underneath.
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 1.3), this._mat(p.accent, 0.5, 0.2, p.accent));
            foot.position.set(0, 0.12, 0.1); this.bodyGroup.add(foot);
            // Eye-stalks on top of the head end.
            this.eye = new THREE.Group();
            for (const ex of [-0.13, 0.13]) {
                const g = new THREE.Group();
                const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6), bodyMat);
                stalk.position.y = 0.25; g.add(stalk);
                const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this._mat(p.accent, 1.0, 0.2, p.accent));
                ball.position.y = 0.52; g.add(ball);
                g.position.set(ex, 1.0, 0.6); this.eye.add(g);
            }
            this.bodyGroup.add(this.eye);
            // Two barbed stinger tentacles dripping neurotoxin.
            this.tentOne = this._stingerTentacle(bodyMat, -0.4, p.accent);
            this.tentTwo = this._stingerTentacle(bodyMat, 0.4, p.accent);
            this._partMeshMap = { BODY: this.body, EYE: this.eye, TENTACLE_ONE: this.tentOne, TENTACLE_TWO: this.tentTwo };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, foot, this.eye, this.tentOne, this.tentTwo] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.tentOne] },
                { gone: ['TENTACLE_TWO'], hide: [this.tentTwo] },
            ];
        }
        _stingerTentacle(mat, x, accent) {
            const g = new THREE.Group();
            for (let i = 0; i < 4; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(0.11 - i * 0.018, 8, 8), mat);
                s.position.y = -i * 0.24; g.add(s);
                // barbs ringing each segment
                for (const bx of [-1, 1]) {
                    const barb = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0xe8e0c8, 1.0, 0.3));
                    barb.position.set(bx * 0.11, -i * 0.24, 0); barb.rotation.z = bx * 1.4; g.add(barb);
                }
            }
            // Dripping neurotoxin tip.
            const drip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(accent, 0.85, 0.2, accent));
            drip.position.y = -0.95; drip.scale.set(1, 1.6, 1); g.add(drip);
            g.position.set(x, 0.75, 0.45); g.rotation.x = -0.4;
            this.bodyGroup.add(g); this._segments.push(g); return g;
        }

        // ── Sacred Kraken (divine octopus: haloed mantle, 4 glowing tentacles) ─
        _buildSacredKraken() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.4);
            // Large bulbous mantle.
            this.mantle = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 14), bodyMat);
            this.mantle.position.set(0, 1.7, 0); this.mantle.scale.set(1.0, 1.3, 1.0);
            this.bodyGroup.add(this.mantle);
            // Golden halo ring floating above the mantle.
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 10, 24), this._mat(p.accent, 0.95, 0.2, p.accent));
            halo.position.set(0, 0.85, 0); halo.rotation.x = Math.PI / 2; halo.userData.float = true; this.mantle.add(halo);
            // Head with sacred eyes.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 12), bodyMat);
            this.head.position.set(0, 1.05, 0.1); this.bodyGroup.add(this.head);
            this._eye(this.head, -0.22, 0.05, 0.36, 0.12, p.accent);
            this._eye(this.head, 0.22, 0.05, 0.36, 0.12, p.accent);
            // Four sacred glowing tentacles, each tipped with a light orb.
            const tentMat = this._mat(p.bodyColor, 1.0, 0.4, 0x2a2000);
            this.tents = [];
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const t = this._chain(tentMat, Math.cos(a) * 0.34, 0.9, Math.sin(a) * 0.34, 6, 0.14, 1.2, true);
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent));
                orb.position.y = -1.1; t.add(orb);
                this.tents.push(t);
            }
            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.tents[0], TENTACLE_2: this.tents[1], TENTACLE_3: this.tents[2], TENTACLE_4: this.tents[3] };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.mantle, ...this.tents] },
                { gone: ['MANTLE'], hide: [this.mantle] },
                { gone: ['TENTACLE_1'], hide: [this.tents[0]] },
                { gone: ['TENTACLE_2'], hide: [this.tents[1]] },
                { gone: ['TENTACLE_3'], hide: [this.tents[2]] },
                { gone: ['TENTACLE_4'], hide: [this.tents[3]] },
            ];
        }

        // ── Sea Turtle (plain green turtle: domed shell, flippers, small head) ─
        _buildSeaTurtle() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.7));
            // Smooth domed carapace with scute lines.
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.15, 0.7, 1.35); this.shell.add(dome);
            const ridgeMat = this.applySkin(this._mat(p.shell, 1.0, 0.5));
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI - Math.PI / 2;
                const scute = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), ridgeMat);
                scute.position.set(Math.sin(a) * 0.45, 0.32, Math.cos(a) * 0.1); scute.scale.set(1, 0.5, 1);
                this.shell.add(scute);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            // Replace stub legs with broad flippers. The chassis stubs come off
            // the body first: left in, they stood orphaned under the flippers.
            [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach(l => this.bodyGroup.remove(l));
            this._plastron(shellMat, 0.7, 0.48, 0.66, 0.8);
            this.frontLeft = this._flipper(skinMat, -0.55, 0.45, 1);
            this.frontRight = this._flipper(skinMat, 0.55, 0.45, 1);
            this.rearLeft = this._flipper(skinMat, -0.5, -0.45, 0.6);
            this.rearRight = this._flipper(skinMat, 0.5, -0.45, 0.6);
            this._turtleRig();
        }
        // A flipper is hinged where it leaves the shell and flaps about that
        // hinge (rotation.z); spun about its own middle it swung clear of the
        // body on every stroke.
        _flipper(mat, x, z, len) {
            const side = x > 0 ? 1 : -1;
            const g = new THREE.Group();
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.55 * len), mat);
            f.position.set(side * 0.12, -0.04, z > 0 ? 0.1 : -0.1); f.rotation.z = -side * 0.4; f.rotation.y = -side * 0.5; g.add(f);
            g.position.set(x - side * 0.12, 0.54, z); g._side = side; g._flap = true;
            this.bodyGroup.add(g); return g;
        }

        // ── Shadow Tortoise (smoke-wreathed cursed tortoise, dark shell) ───────
        _buildShadowTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.2, 0x1a0a2a));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.1, 0.9, 1.25); this.shell.add(dome);
            // Curse-reflecting faceted plates with a purple sheen.
            const facetMat = this._mat(p.accent, 0.8, 0.15, p.accent);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const facet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), facetMat);
                facet.position.set(Math.cos(a) * 0.34, 0.4, Math.sin(a) * 0.42); facet.scale.set(1, 0.6, 1);
                this.shell.add(facet);
            }
            // Wreathing dark smoke puffs hovering around the shell.
            this.smoke = [];
            const smokeMat = this._mat(0x1a1a22, 0.45, 0.9, 0x120822);
            for (let i = 0; i < 6; i++) {
                const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + this.idRand() * 0.08, 8, 8), smokeMat);
                puff._a = (i / 6) * Math.PI * 2; puff._yb = 0.3 + this.idRand() * 0.4; puff.userData.float = true;
                this.shell.add(puff); this.smoke.push(puff);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig(this.smoke);
        }

        // ── Skullcrusher Brute (hulking tentacled mauler, one eye, 2 maul arms) ─
        _buildSkullcrusherBrute() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.55);
            // Hulking lumpy mass body.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 14), bodyMat);
            this.body.position.set(0, 1.0, 0); this.body.scale.set(1.3, 1.1, 1.1);
            this.bodyGroup.add(this.body);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const lump = new THREE.Mesh(new THREE.SphereGeometry(0.22 + this.idRand() * 0.1, 10, 8), bodyMat);
                lump.position.set(Math.cos(a) * 0.6, 1.0 + Math.sin(a) * 0.3, 0.2); this.bodyGroup.add(lump);
                lump._brute = true; this._segments.push(lump); // included in BODY cascade implicitly via hide below
            }
            // Single huge angry eye.
            this.eye = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), this._mat(0xfff0d0, 1.0, 0.2));
            this.eye.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 12), this._mat(p.accent, 1.0, 0.2, p.accent));
            iris.position.z = 0.2; this.eye.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), this._mat(0x000000, 1.0, 0.2));
            pupil.position.z = 0.3; this.eye.add(pupil);
            this.eye.position.set(0, 1.35, 0.65); this.bodyGroup.add(this.eye);
            // Two heavy smashing tentacle arms ending in club-mauls.
            this.tentOne = this._maulArm(bodyMat, -0.85);
            this.tentTwo = this._maulArm(bodyMat, 0.85);
            const lumps = this._segments.filter(s => s._brute);
            this._partMeshMap = { BODY: this.body, EYE: this.eye, TENTACLE_ONE: this.tentOne, TENTACLE_TWO: this.tentTwo };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.eye, this.tentOne, this.tentTwo, ...lumps] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.tentOne] },
                { gone: ['TENTACLE_TWO'], hide: [this.tentTwo] },
            ];
        }
        _maulArm(mat, x) {
            const g = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const s = new THREE.Mesh(new THREE.SphereGeometry(0.18 - i * 0.02, 10, 8), mat);
                s.position.y = -i * 0.32; g.add(s);
            }
            // Bony club head at the end.
            const club = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), this.applySkin(this._mat(0xb8a890, 1.0, 0.5)));
            club.position.y = -1.0; g.add(club);
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), this._mat(0xe8e0c8, 1.0, 0.3));
                spike.position.set(Math.cos(a) * 0.24, -1.0, Math.sin(a) * 0.24); spike.rotation.z = -Math.cos(a) * 1.5; spike.rotation.x = Math.sin(a) * 1.5; g.add(spike);
            }
            g.position.set(x, 1.1, 0.1); g.rotation.z = x > 0 ? -0.25 : 0.25;
            this.bodyGroup.add(g); this._segments.push(g); g._maul = true; return g;
        }

        // ── Volcanic Shark (magma-veined leviathan: maw, dorsal plates, vents) ─
        _buildVolcanicShark() {
            const p = this.profile;
            const bodyMat = this._skinMat(p.bodyColor, 0.55);
            // Sleek elongated shark body with glowing magma veins.
            this.heartChamber = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), bodyMat);
            this.heartChamber.position.set(0, 1.3, 0); this.heartChamber.scale.set(2.0, 0.9, 0.9);
            this.bodyGroup.add(this.heartChamber);
            const heartGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), this._mat(p.accent, 0.9, 0.2, p.accent));
            heartGlow.position.set(-0.2, 0, 0.3); this.heartChamber.add(heartGlow);
            // Magma vein streaks along the flank.
            const veinMat = this._mat(p.accent, 0.95, 0.3, p.accent);
            for (let i = 0; i < 5; i++) {
                const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), veinMat);
                vein.position.set(-0.3 + i * 0.18, 1.3 + (i % 2 ? 0.18 : -0.18), 0.35); vein.rotation.z = Math.PI / 2; vein.rotation.x = 0.3;
                this.bodyGroup.add(vein); this._segments.push(vein); vein._vent = true;
            }
            // Gaping toothy maw at the front.
            this.maw = new THREE.Group();
            const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 12), bodyMat);
            jaw.rotation.z = -Math.PI / 2; this.maw.add(jaw);
            const gullet = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), this._mat(0xff4400, 0.9, 0.4, p.accent));
            gullet.position.x = -0.1; this.maw.add(gullet);
            const teethMat = this._mat(0xf0e6cf, 1.0, 0.3);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), teethMat);
                tooth.position.set(0.18, Math.cos(a) * 0.26, Math.sin(a) * 0.26); tooth.rotation.z = Math.PI / 2; this.maw.add(tooth);
            }
            this.maw.position.set(1.15, 1.3, 0); this.bodyGroup.add(this.maw);
            // Single eye near the maw.
            this.eye = this._eye(this.bodyGroup, 0.9, 1.5, 0.32, 0.1, p.accent);
            // Glowing dorsal plates ridging the spine.
            this.dorsalPlates = new THREE.Group();
            const plateMat = this._mat(p.bodyColor, 1.0, 0.4, p.accent);
            for (let i = 0; i < 5; i++) {
                const plate = new THREE.Mesh(new THREE.ConeGeometry(0.18 - i * 0.02, 0.5 - i * 0.04, 4), plateMat);
                plate.position.set(0.5 - i * 0.4, 1.9, 0); plate.scale.set(1, 1, 0.16);
                this.dorsalPlates.add(plate);
            }
            this.bodyGroup.add(this.dorsalPlates);
            // Steam-vent tentacle tail bundle at the rear.
            this.tentacles = new THREE.Group();
            const tailMat = this._mat(p.bodyColor, 1.0, 0.5);
            for (let i = 0; i < 3; i++) {
                const a = -0.4 + i * 0.4;
                const t = this._chain(tailMat, -1.4, 1.3 + a * 0.3, a * 0.4, 4, 0.1, 0.8, true);
                t.rotation.z = -Math.PI / 2.2; this.tentacles.add(t);
            }
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsalPlates, TENTACLES: this.tentacles, HEART_CHAMBER: this.heartChamber };
            const veins = this._segments.filter(s => s._vent);
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.heartChamber, this.eye, this.maw, this.dorsalPlates, this.tentacles, ...veins] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['DORSAL_PLATES'], hide: [this.dorsalPlates] },
                { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Wind Leviathan (translucent hurricane serpent: wispy maw, vortex coils) ─
        _buildWindLeviathan() {
            const p = this.profile;
            // Translucent swirling cloud-body built from overlapping wispy puffs.
            this.heartChamber = new THREE.Group();
            const cloudMat = this._mat(p.bodyColor, 0.32, 0.95, p.accent);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const puff = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.018 + this.idRand() * 0.12, 12, 10), cloudMat);
                puff.position.set(Math.cos(a) * 0.34, 1.4 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.28); puff.scale.set(1.2, 0.9, 1.1);
                this.heartChamber.add(puff);
            }
            const eyeOfStorm = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), this._mat(p.accent, 0.7, 0.3, p.accent));
            eyeOfStorm.position.set(0, 1.4, 0.2); this.heartChamber.add(eyeOfStorm);
            this.bodyGroup.add(this.heartChamber);
            // Single calm eye-of-the-storm orb high on the front.
            this.eye = new THREE.Group();
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), this._mat(p.accent, 0.6, 0.3, p.accent));
            halo.rotation.x = Math.PI / 2; this.eye.add(halo);
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0xffffff, 0.85, 0.2, p.accent));
            this.eye.add(core);
            this.eye.position.set(0, 1.78, 0.5); this.bodyGroup.add(this.eye);
            // Wispy swirling maw: a funnel cone with a spiral throat.
            this.maw = new THREE.Group();
            const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 14, 1, true), this._mat(p.bodyColor, 0.45, 0.9, p.accent));
            funnel.rotation.x = -Math.PI / 2; this.maw.add(funnel);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 4; const r = 0.05 + (i / 12) * 0.26;
                const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(p.accent, 0.5, 0.4, p.accent));
                wisp.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.1 - (i / 12) * 0.4); this.maw.add(wisp);
            }
            this.maw.position.set(0, 1.05, 0.5); this.bodyGroup.add(this.maw);
            // Dorsal plates: thin translucent wind-blade fins along the back.
            this.dorsalPlates = new THREE.Group();
            const finMat = this._mat(p.accent, 0.4, 0.6, p.accent);
            for (let i = 0; i < 5; i++) {
                const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22 - i * 0.02, 0.55 - i * 0.05, 3), finMat);
                fin.position.set(0, 1.98 - i * 0.07, -0.1 - i * 0.13); fin.scale.set(1, 1, 0.08); fin.rotation.z = (i % 2 ? 0.15 : -0.15); // over the cloud, not past it
                this.dorsalPlates.add(fin);
            }
            this.bodyGroup.add(this.dorsalPlates);
            // Vortex tentacles: spiralling wispy strands trailing below.
            this.tentacles = new THREE.Group();
            const vortexMat = this._mat(p.bodyColor, 0.4, 0.85, p.accent);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const t = this._chain(vortexMat, Math.cos(a) * 0.32, 0.85, Math.sin(a) * 0.32, 6, 0.1, 1.25, true);
                this.tentacles.add(t);
            }
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsalPlates, TENTACLES: this.tentacles, HEART_CHAMBER: this.heartChamber };
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.heartChamber, this.eye, this.maw, this.dorsalPlates, this.tentacles] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['DORSAL_PLATES'], hide: [this.dorsalPlates] },
                { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Abyssal Leviathan (gargantuan deep serpent: huge eye, crushing maw, coils) ─
        _buildAbyssalLeviathan() {
            const p = this.profile;
            const fleshMat = this._skinMat(p.bodyColor, 0.65);
            // Massive serpentine body as a thick coiling chain of segments.
            this.heartChamber = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = i * 0.9;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.6 - i * 0.06, 14, 12), fleshMat);
                seg.position.set(Math.sin(a) * 0.5, 1.4 - i * 0.05, -0.15 - i * 0.32 + Math.cos(a) * 0.18); seg.scale.set(1.1, 1.0, 1.3);
                this.heartChamber.add(seg);
            }
            const heartGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), this._mat(p.accent, 0.85, 0.3, p.accent));
            heartGlow.position.set(0, 1.4, 0.1); this.heartChamber.add(heartGlow);
            this.bodyGroup.add(this.heartChamber);
            // Single enormous eye dominating the head.
            this.eye = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), this._mat(0xf4ffe8, 1.0, 0.2));
            this.eye.add(sclera);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), this._mat(p.accent, 1.0, 0.2, p.accent));
            iris.position.z = 0.26; this.eye.add(iris);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this._mat(0x000000, 1.0, 0.2));
            pupil.position.z = 0.42; this.eye.add(pupil);
            this.eye.position.set(0, 1.85, 0.55); this.bodyGroup.add(this.eye);
            // Crushing maw: wide jaw box lined with long teeth.
            this.maw = new THREE.Group();
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.55), fleshMat);
            this.maw.add(jaw);
            const gullet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), this._mat(0x140a1e, 1.0, 0.7));
            gullet.position.z = 0.12; this.maw.add(gullet);
            const teethMat = this._mat(0xe8e2cf, 1.0, 0.3);
            for (let i = 0; i < 8; i++) {
                for (const ty of [0.22, -0.22]) {
                    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), teethMat);
                    tooth.position.set(-0.3 + i * 0.085, ty, 0.28); tooth.rotation.x = ty > 0 ? Math.PI : 0; this.maw.add(tooth);
                }
            }
            this.maw.position.set(0, 1.1, 0.55); this.bodyGroup.add(this.maw);
            // Dorsal plates: row of huge bony fins down the spine.
            this.dorsalPlates = new THREE.Group();
            const plateMat = this.applySkin(this._mat(p.bodyColor, 1.0, 0.5));
            for (let i = 0; i < 6; i++) {
                const plate = new THREE.Mesh(new THREE.ConeGeometry(0.24 - i * 0.025, 0.6 - i * 0.05, 4), plateMat);
                plate.position.set(Math.sin(i * 0.9) * 0.4, 2.05 - i * 0.05, -0.15 - i * 0.32); plate.scale.set(1, 1, 0.2);
                this.dorsalPlates.add(plate);
            }
            this.bodyGroup.add(this.dorsalPlates);
            // Coiling tentacles trailing from the rear.
            this.tentacles = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const t = this._chain(fleshMat, Math.cos(a) * 0.3, 0.8, -1.5 + Math.sin(a) * 0.3, 6, 0.13, 1.2, true);
                this.tentacles.add(t);
            }
            this._partMeshMap = { EYE: this.eye, MAW: this.maw, DORSAL_PLATES: this.dorsalPlates, TENTACLES: this.tentacles, HEART_CHAMBER: this.heartChamber };
            this._cascadeRules = [
                { gone: ['HEART_CHAMBER'], hide: [this.heartChamber, this.eye, this.maw, this.dorsalPlates, this.tentacles] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['DORSAL_PLATES'], hide: [this.dorsalPlates] },
                { gone: ['TENTACLES'], hide: [this.tentacles] },
            ];
        }

        // ── Mind Flayer (illithid: robed humanoid, octopoid tentacled head, one eye) ─
        _buildMindFlayer() {
            const p = this.profile;
            const robeMat = this._skinMat(p.bodyColor, 0.7);
            const fleshMat = this._mat(0x8a6aa8, 1.0, 0.5);
            // Robed humanoid body (tapered robe + shoulders + arms).
            this.body = new THREE.Group();
            const robe = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 12), robeMat);
            robe.position.y = 0.65; this.body.add(robe);
            const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), robeMat);
            shoulders.position.y = 1.25; shoulders.scale.set(1.4, 0.7, 1.0); this.body.add(shoulders);
            for (const side of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.7, 7), robeMat);
                arm.position.set(side * 0.34, 0.95, 0.05); arm.rotation.z = side * 0.35; this.body.add(arm);
                const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), fleshMat);
                hand.position.set(side * 0.5, 0.62, 0.05); this.body.add(hand);
            }
            this.bodyGroup.add(this.body);
            // Octopoid head: smooth purple bulb sitting on the shoulders.
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), fleshMat);
            this.head.position.set(0, 1.6, 0.02); this.head.scale.set(1.0, 1.2, 1.0); this.body.add(this.head);
            // Single sunken eye on the bulbous head.
            this.eye = new THREE.Group();
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(0xfff0f6, 1.0, 0.2));
            this.eye.add(sclera);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 1.0, 0.2, p.accent));
            pupil.position.z = 0.07; this.eye.add(pupil);
            this.eye.position.set(0, 1.78, 0.26); this.body.add(this.eye);
            // Four facial tentacles below the eye; two are the dismemberable pair.
            const mkTent = (x, z) => {
                const g = new THREE.Group();
                for (let i = 0; i < 5; i++) {
                    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06 - i * 0.008, 7, 7), fleshMat);
                    s.position.set(0, -i * 0.13, i * 0.03); g.add(s);
                }
                const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.014, 0.54, 5), fleshMat);
                strand.position.set(0, -0.26, 0.06); strand.rotation.x = -0.23; g.add(strand);
                // Hung from the lower face in the head's own space; y 1.5 was a
                // body-space height and floated the whole beard over the skull.
                g.position.set(x, -0.12, z); g.rotation.x = -0.35; // swung forward over the chest
                this.head.add(g); this._segments.push(g); return g;
            };
            this.tentOne = mkTent(-0.14, 0.22);
            this.tentTwo = mkTent(0.14, 0.22);
            this.faceExtra = new THREE.Group();
            this.faceExtra.add(mkTent(-0.06, 0.26), mkTent(0.06, 0.26));
            this._partMeshMap = { BODY: this.body, EYE: this.eye, TENTACLE_ONE: this.tentOne, TENTACLE_TWO: this.tentTwo };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.tentOne] },
                { gone: ['TENTACLE_TWO'], hide: [this.tentTwo] },
            ];
        }

        // ── Shellbreaker Bulwark (hulking armored tortoise, thick spiked shell) ─
        _buildShellbreakerBulwark() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.7);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.85));
            this.shell = new THREE.Group();
            // Extremely thick, high domed shell.
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.15, 1.05, 1.3); this.shell.add(dome);
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.14, 10, 20), shellMat);
            rim.position.y = 0.05; rim.rotation.x = Math.PI / 2; rim.scale.set(1.0, 1.0, 0.5); this.shell.add(rim);
            // Heavy spikes studding the carapace in concentric rings.
            const spikeMat = this.applySkin(this._mat(p.accent, 1.0, 0.6));
            const rings = [{ r: 0.0, y: 0.78, n: 1 }, { r: 0.34, y: 0.62, n: 6 }, { r: 0.6, y: 0.32, n: 8 }];
            for (const ring of rings) {
                for (let i = 0; i < ring.n; i++) {
                    const a = (i / ring.n) * Math.PI * 2;
                    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 5), spikeMat);
                    spike.position.set(Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r * 1.15);
                    spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
                    this.shell.add(spike);
                }
            }
            this.shell.position.set(0, 0.75, 0); this.bodyGroup.add(this.shell);
            // Thick blunt head + stocky legs.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), skinMat);
            h.scale.set(1.0, 0.95, 1.2); this.head.add(h);
            this._eye(this.head, -0.12, 0.06, 0.2, 0.06, p.accent);
            this._eye(this.head, 0.12, 0.06, 0.2, 0.06, p.accent);
            this.head.position.set(0, 0.6, 0.85); this.bodyGroup.add(this.head);
            this.frontLeft = this._pillarLeg(skinMat, -0.55, 0.5);
            this.frontRight = this._pillarLeg(skinMat, 0.55, 0.5);
            this.rearLeft = this._pillarLeg(skinMat, -0.55, -0.5);
            this.rearRight = this._pillarLeg(skinMat, 0.55, -0.5);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 6), skinMat);
            this.tail.position.set(0, 0.5, -0.85); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._plastron(shellMat, 0.75, 0.52, 0.72, 0.82);
            this._turtleRig();
        }
        _pillarLeg(mat, x, z) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.4, 8), mat);
            leg.position.set(x, 0.32, z);
            this.bodyGroup.add(leg); return leg;
        }

        // ── Galeshell Tortoise (pale aerodynamic ridged shell trailing gusts) ─
        _buildGaleshellTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.55);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.45));
            this.shell = new THREE.Group();
            // Streamlined teardrop carapace, longer than wide for aerodynamics.
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(0.95, 0.7, 1.5); this.shell.add(dome);
            // Sharp aerodynamic ridges running front-to-back.
            const ridgeMat = this.applySkin(this._mat(p.shell, 1.0, 0.3));
            for (const rx of [-0.3, 0, 0.3]) {
                const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 3), ridgeMat);
                ridge.position.set(rx, 0.36, 0); ridge.scale.set(1, 1, 6.0); ridge.rotation.x = Math.PI / 2;
                this.shell.add(ridge);
            }
            // Trailing gust ribbons streaming off the rear of the shell.
            this.gusts = [];
            const gustMat = this._mat(p.accent, 0.4, 0.6, p.accent);
            for (let i = 0; i < 4; i++) {
                const gust = new THREE.Mesh(new THREE.ConeGeometry(0.1 - i * 0.015, 0.5, 4, 1, true), gustMat);
                gust.position.set((i - 1.5) * 0.16, 0.3, -0.85 - i * 0.05); gust.rotation.x = -Math.PI / 2; gust.scale.set(1, 1, 1.4);
                gust._yb = 0.3 + i * 0.04; this.shell.add(gust); this.gusts.push(gust);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            // Sleek head + swept-back legs.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skinMat);
            h.scale.set(0.85, 0.85, 1.4); this.head.add(h);
            this._eye(this.head, -0.09, 0.05, 0.18, 0.05, p.accent);
            this._eye(this.head, 0.09, 0.05, 0.18, 0.05, p.accent);
            this.head.position.set(0, 0.6, 0.86); this.bodyGroup.add(this.head);
            this.frontLeft = this._stub(skinMat, -0.45, 0.5);
            this.frontRight = this._stub(skinMat, 0.45, 0.5);
            this.rearLeft = this._stub(skinMat, -0.45, -0.5);
            this.rearRight = this._stub(skinMat, 0.45, -0.5);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 6), skinMat);
            this.tail.position.set(0, 0.55, -0.9); this.tail.rotation.x = -1.7; this.bodyGroup.add(this.tail);
            this._plastron(shellMat, 0.7, 0.56, 0.5, 0.82);
            this._turtleRig(this.gusts);
        }

        // ── Nightcurse Tortoise (blighted purple, glowing-rune cursed shell) ─
        _buildNightcurseTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.65);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.3, 0x1a0a2a));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.1, 0.85, 1.25); this.shell.add(dome);
            // Glowing rune sigils inscribed on the carapace (flat emissive discs).
            this.runes = [];
            const runeMat = this._mat(p.accent, 0.95, 0.2, p.accent);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2; const r = 0.18 + (i % 2) * 0.26;
                const rune = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 5), runeMat);
                rune.position.set(Math.cos(a) * r, 0.42 + (i % 2 ? 0.06 : 0.18), Math.sin(a) * r * 1.15);
                rune.lookAt(rune.position.x * 2, rune.position.y + 1, rune.position.z * 2);
                this.shell.add(rune); this.runes.push(rune);
            }
            // Life-draining motes rising off the shell.
            this.motes = [];
            const moteMat = this._mat(p.accent, 0.7, 0.3, p.accent);
            for (let i = 0; i < 6; i++) {
                const mote = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), moteMat);
                mote._a = (i / 6) * Math.PI * 2; mote._yb = 0.5 + this.idRand() * 0.4; mote.userData.float = true;
                this.shell.add(mote); this.motes.push(mote);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            // Blighted head with sickly glowing eyes + gaunt legs.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), skinMat);
            h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.17, 0.05, p.accent);
            this._eye(this.head, 0.1, 0.05, 0.17, 0.05, p.accent);
            this.head.position.set(0, 0.62, 0.82); this.bodyGroup.add(this.head);
            this.frontLeft = this._stub(skinMat, -0.5, 0.46);
            this.frontRight = this._stub(skinMat, 0.5, 0.46);
            this.rearLeft = this._stub(skinMat, -0.5, -0.46);
            this.rearRight = this._stub(skinMat, 0.5, -0.46);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 6), skinMat);
            this.tail.position.set(0, 0.55, -0.82); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._turtleRig(this.runes.concat(this.motes));
        }

        // ── Dawnshell Tortoise (radiant golden sunburst shell, holy light) ────
        _buildDawnshellTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.5);
            const goldMat = this.applySkin(this._mat(p.shell, 1.0, 0.2, 0x6a4a00));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), goldMat);
            dome.scale.set(1.1, 0.85, 1.25); this.shell.add(dome);
            // Sunburst: flat tapering golden rays radiating outward around the dome equator.
            this.rays = [];
            const rayMat = this._mat(p.accent, 0.95, 0.2, p.accent);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const ray = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4 + (i % 2) * 0.18, 3), rayMat);
                ray.position.set(Math.cos(a) * 0.7, 0.22, Math.sin(a) * 0.78);
                ray.rotation.set(Math.PI / 2, -a, 0); ray.scale.set(1, 1, 0.12);
                this.shell.add(ray); this.rays.push(ray);
            }
            // Holy halo orb crowning the shell apex.
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0xfffbe0, 0.9, 0.1, p.accent));
            orb.position.y = 0.62; this.shell.add(orb); this.rays.push(orb);
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 22), rayMat);
            halo.position.y = 0.7; halo.rotation.x = Math.PI / 2; this.shell.add(halo); this.rays.push(halo);
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig(this.rays);
        }

        // ── Pyroshell Tortoise (magma-infused, cracked glowing-lava shell) ────
        _buildPyroshellTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const rockMat = this.applySkin(this._mat(p.shell, 1.0, 0.95, 0x140402));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), rockMat);
            dome.scale.set(1.1, 0.9, 1.25); this.shell.add(dome);
            // Glowing lava fissures: bright cracks snaking across the cooled-rock dome.
            this.fissures = [];
            const lavaMat = this._mat(p.accent, 0.95, 0.4, p.accent);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const crack = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5 + this.idRand() * 0.3), lavaMat);
                crack.position.set(Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.36);
                crack.rotation.set(0.4 + this.idRand() * 0.4, a + this.idRand(), this.idRand() * 0.6);
                this.shell.add(crack); this.fissures.push(crack);
            }
            // Bubbling magma blisters welling up between the plates.
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2;
                const blister = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), lavaMat);
                blister.position.set(Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.48); blister.scale.set(1, 0.6, 1);
                this.shell.add(blister); this.fissures.push(blister);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig(this.fissures);
        }

        // ── Stormshell Tortoise (storm-charged, lightning-arcing shell) ───────
        _buildStormshellTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.55);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.5, 0x0a1424));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.1, 0.85, 1.25); this.shell.add(dome);
            // Jagged conductive rods (lightning antennae) bristling off the carapace.
            const rodMat = this.applySkin(this._mat(0x6a7a90, 1.0, 0.3, 0x223344));
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const rod = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.4, 4), rodMat);
                rod.position.set(Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.4);
                rod.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
                this.shell.add(rod);
            }
            // Lightning bolts arcing between the rods over the dome.
            this.arcs = new THREE.Group();
            this.arcs.userData.float = true; // arcing between the rods by design
            const boltMat = this._mat(p.accent, 0.95, 0.2, p.accent);
            for (let i = 0; i < 6; i++) {
                const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 4), boltMat);
                const a = this.idRand() * Math.PI * 2;
                seg.position.set(Math.cos(a) * 0.32, 0.6 + this.idRand() * 0.25, Math.sin(a) * 0.38);
                seg.rotation.set(this.idRand() * 2.5, this.idRand() * 2.5, this.idRand() * 2.5);
                this.arcs.add(seg);
            }
            this.shell.add(this.arcs);
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig();
        }

        // ── Tidalcarapace Tortoise (wave-sculpted blue shell dripping water) ──
        _buildTidalcarapaceTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.45);
            const shellMat = this.applySkin(this._mat(p.shell, 0.95, 0.25, 0x0a3a55));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
            dome.scale.set(1.1, 0.8, 1.3); this.shell.add(dome);
            // Concentric curling wave-crest ridges sculpted across the carapace.
            const crestMat = this.applySkin(this._mat(p.accent, 0.85, 0.2, 0x2a8db8));
            for (let i = 0; i < 4; i++) {
                const r = 0.18 + i * 0.16;
                const crest = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 18, Math.PI * 1.3), crestMat);
                crest.position.set(0, 0.46 - i * 0.06, 0); crest.rotation.set(Math.PI / 2, 0, i * 0.5);
                crest.scale.set(1, 1, 1.5);
                this.shell.add(crest);
            }
            // Water droplets dripping off the shell rim.
            this.drips = [];
            const dropMat = this._mat(0xbef2ff, 0.7, 0.1, 0x66ccff);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), dropMat);
                drop.scale.set(1, 1.7, 1); drop._a = a; drop._yb = 0.0 - this.idRand() * 0.2; drop.userData.float = true;
                drop.position.set(Math.cos(a) * 0.68, 0.0, Math.sin(a) * 0.78);
                this.shell.add(drop); this.drips.push(drop);
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            this._turtleChassis(skinMat);
            this._turtleRig(this.drips);
        }

        // ── Grief Collector (floating dark mass, many weeping eyes, 2 tentacles) ─
        _buildGriefCollector() {
            const p = this.profile;
            const massMat = this._skinMat(p.bodyColor, 0.8);
            // Lumpy amorphous floating mass built from clustered dark spheres.
            this.body = new THREE.Group();
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 14), massMat);
            this.body.add(core);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const lump = new THREE.Mesh(new THREE.SphereGeometry(0.22 + this.idRand() * 0.12, 10, 9), massMat);
                lump.position.set(Math.cos(a) * 0.4, Math.sin(a * 1.7) * 0.35, Math.sin(a) * 0.35);
                this.body.add(lump);
            }
            this.body.position.set(0, 1.4, 0); this.bodyGroup.add(this.body);
            // Many weeping eyes studding the mass, each trailing a glowing tear.
            this.eyes = [];
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2; const yb = -0.4 + (i % 3) * 0.4;
                const eg = new THREE.Group();
                const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(0xe8e0f0, 1.0, 0.2));
                eg.add(sclera);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(p.accent, 1.0, 0.2, p.accent));
                pupil.position.z = 0.07; eg.add(pupil);
                const tear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), this._mat(p.accent, 0.7, 0.1, p.accent));
                tear.position.set(0, -0.14, 0.06); tear.scale.set(1, 1.8, 1); tear.userData.float = true; eg.add(tear); eg._tear = tear;
                eg.position.set(Math.cos(a) * 0.52, yb, Math.sin(a) * 0.5);
                eg.lookAt(eg.position.x * 3, eg.position.y * 3, eg.position.z * 3 + 1);
                eg._yb = yb;
                this.body.add(eg); this.eyes.push(eg);
            }
            // Primary EYE (largest, front-and-center).
            this.eye = new THREE.Group();
            const bigSclera = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this._mat(0xf0eaf8, 1.0, 0.2));
            this.eye.add(bigSclera);
            const bigPupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 1.0, 0.2, p.accent));
            bigPupil.position.z = 0.13; this.eye.add(bigPupil);
            this.eye.position.set(0, 1.5, 0.55); this.bodyGroup.add(this.eye);
            // Two drifting wispy tentacles trailing below the mass.
            const tentMat = this._mat(p.bodyColor, 0.85, 0.7, 0x120a1c);
            this.tentOne = this._thread(this._chain(tentMat, -0.3, 1.0, 0.1, 6, 0.1, 1.3, true), tentMat, 0.04);
            this.tentTwo = this._thread(this._chain(tentMat, 0.3, 1.0, 0.1, 6, 0.1, 1.3, true), tentMat, 0.04);
            this._partMeshMap = { BODY: this.body, EYE: this.eye, TENTACLE_ONE: this.tentOne, TENTACLE_TWO: this.tentTwo };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.body, this.eye, this.tentOne, this.tentTwo] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.tentOne] },
                { gone: ['TENTACLE_TWO'], hide: [this.tentTwo] },
            ];
        }

        // ── Non-Euclidean Crab (void crab, asymmetric warped claws & carapace) ─
        _buildNonEuclideanCrab() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.35);
            // Warped asymmetric carapace: a skewed icosahedron that reads as folded space.
            this.carapace = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), mat);
            this.carapace.position.set(0.08, 0.72, 0); this.carapace.scale.set(1.6, 0.65, 1.0);
            this.carapace.rotation.set(0.2, 0.4, -0.15);
            this.bodyGroup.add(this.carapace);
            // Void-fold facets: dark prisms protruding at impossible angles.
            const voidMat = this._mat(p.accent, 0.8, 0.1, p.accent);
            for (let i = 0; i < 5; i++) {
                const facet = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16 + this.idRand() * 0.08, 0), voidMat);
                facet.position.set((this.idRand() - 0.5) * 0.9, 0.85 + this.idRand() * 0.3, (this.idRand() - 0.5) * 0.6);
                facet.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3);
                this.carapace.add(facet);
            }
            // Skewed abdomen offset to one side (asymmetry).
            this.abdomen = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
            this.abdomen.position.set(-0.18, 0.6, -0.55); this.abdomen.scale.set(1.3, 0.6, 1.1); this.abdomen.rotation.y = 0.5;
            this.bodyGroup.add(this.abdomen);
            this._eye(this.carapace, -0.2, 0.3, 0.4, 0.05, p.accent);
            this._eye(this.carapace, 0.26, 0.45, 0.3, 0.05, p.accent);
            // Twisting antennae spiralling into themselves.
            this.antennae = new THREE.Group();
            for (const ax of [-0.1, 0.16]) {
                const an = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 5, 10, Math.PI * 1.5), mat);
                an.position.set(ax, 1.05, 0.4); an.rotation.set(-0.6, ax * 4, 0); this.antennae.add(an);
            }
            this.bodyGroup.add(this.antennae);
            // Asymmetric claws: one massive and warped, one small and twisted.
            this.clawL = this._voidClaw(mat, -1, 1.4);
            this.clawR = this._voidClaw(mat, 1, 0.7);
            // Bent walking legs that fold back on themselves.
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (const side of [-1, 1]) {
                for (let i = 0; i < 2; i++) {
                    const leg = new THREE.Group();
                    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.4, 5), mat);
                    thigh.position.y = -0.2; thigh.rotation.z = side * 1.0; leg.add(thigh);
                    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 5), mat);
                    shin.position.set(side * 0.35, -0.4, 0); shin.rotation.z = -side * 1.3; leg.add(shin);
                    leg.position.set(side * 0.55, 0.6, 0.2 - i * 0.4);
                    (i === 0 ? this.frontLeg : this.rearLeg).add(leg);
                }
            }
            this.bodyGroup.add(this.frontLeg); this.bodyGroup.add(this.rearLeg);
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae] },
                { gone: ['ABDOMEN'], hide: [this.abdomen] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] },
                { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] },
                { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }
        _voidClaw(mat, side, sz) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * sz, 0.05 * sz, 0.5 * sz, 6), mat);
            arm.position.set(side * 0.4, 0, 0.3); arm.rotation.x = 1.2; arm.rotation.z = side * (0.3 + sz * 0.1); g.add(arm);
            // Warped boxy pincer (octahedral, reads as folded geometry).
            const claw = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * sz, 0), mat);
            claw.position.set(side * (0.55 + sz * 0.1), 0, 0.62 * sz); claw.scale.set(0.8, 1.3, 1.0); claw.rotation.z = side * 0.6; g.add(claw);
            const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.09 * sz, 0.34 * sz, 4), mat);
            pincer.position.set(side * (0.55 + sz * 0.1), 0.16 * sz, 0.78 * sz); pincer.rotation.x = 1.5; pincer.rotation.z = side * 0.4; g.add(pincer);
            g.position.set(0, 0.68, 0); g._side = side; g.rotation.y = side * 0.25;
            this.bodyGroup.add(g); return g;
        }

        // ── Terraclaw Tortoise (earthen tortoise, rocky boulder shell, heavy clawed legs) ─
        _buildTerraclawTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.85);
            const rockMat = this.applySkin(this._mat(p.shell, 1.0, 0.98));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 9, 0, Math.PI * 2, 0, Math.PI / 2), rockMat);
            dome.scale.set(1.15, 0.95, 1.3); this.shell.add(dome);
            // Chunky angular boulders clustered over the carapace (low-poly dodecahedra).
            const boulderMat = this.applySkin(this._mat(p.accent, 1.0, 1.0));
            const clusters = [{ r: 0.0, y: 0.78, n: 1 }, { r: 0.32, y: 0.6, n: 5 }, { r: 0.58, y: 0.3, n: 7 }];
            for (const c of clusters) {
                for (let i = 0; i < c.n; i++) {
                    const a = (i / c.n) * Math.PI * 2 + c.r;
                    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + this.idRand() * 0.08, 0), boulderMat);
                    rock.position.set(Math.cos(a) * c.r, c.y + this.idRand() * 0.05, Math.sin(a) * c.r * 1.18);
                    rock.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3);
                    this.shell.add(rock);
                }
            }
            this.shell.position.set(0, 0.78, 0); this.bodyGroup.add(this.shell);
            // Blunt rocky head.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), skinMat);
            h.scale.set(0.95, 0.85, 1.2); this.head.add(h);
            this._eye(this.head, -0.11, 0.06, 0.2, 0.05, 0x111111);
            this._eye(this.head, 0.11, 0.06, 0.2, 0.05, 0x111111);
            this.head.position.set(0, 0.62, 0.88); this.bodyGroup.add(this.head);
            // Heavy clawed legs (pillar leg + a trio of stone claws).
            this.frontLeft = this._clawLeg(skinMat, boulderMat, -0.55, 0.5);
            this.frontRight = this._clawLeg(skinMat, boulderMat, 0.55, 0.5);
            this.rearLeft = this._clawLeg(skinMat, boulderMat, -0.55, -0.5);
            this.rearRight = this._clawLeg(skinMat, boulderMat, 0.55, -0.5);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 5), skinMat);
            this.tail.position.set(0, 0.5, -0.88); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._plastron(rockMat, 0.78, 0.53, 0.68, 0.78);
            this._turtleRig();
        }
        _clawLeg(legMat, clawMat, x, z) {
            const g = new THREE.Group();
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.42, 7), legMat);
            leg.position.y = 0.0; g.add(leg);
            for (const cx of [-0.12, 0, 0.12]) {
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), clawMat);
                claw.position.set(cx, -0.24, (z > 0 ? 0.16 : -0.16)); claw.rotation.x = z > 0 ? 1.0 : -1.0; g.add(claw);
            }
            g.position.set(x, 0.32, z);
            this.bodyGroup.add(g); return g;
        }

        // ── Horseshoe Crab (smooth domed carapace, hinged abdomen, long spiked telson) ─
        _buildHorseshoeCrab() {
            const p = this.profile;
            const mat = this._skinMat(p.bodyColor, 0.4);
            // Smooth wide horseshoe-shaped prosoma (front carapace).
            this.carapace = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            this.carapace.position.set(0, 0.55, 0.25); this.carapace.scale.set(1.5, 0.55, 1.2);
            this.bodyGroup.add(this.carapace);
            // Small simple eyes set on the dome.
            this._eye(this.carapace, -0.28, 0.45, 0.2, 0.045, 0x111111);
            this._eye(this.carapace, 0.28, 0.45, 0.2, 0.045, 0x111111);
            // Hinged hexagonal abdomen (opisthosoma) with side spines.
            this.abdomen = new THREE.Group();
            // A flat hexagonal plate lying on the ground (a quarter turn on x
            // stood it on edge like a coin).
            const ab = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.16, 6), mat);
            ab.scale.set(1.0, 1.0, 0.8); this.abdomen.add(ab);
            for (let i = 0; i < 5; i++) {
                const side = i < 2 ? -1 : (i < 4 ? 1 : 0);
                if (side === 0) continue;
                const spine = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 4), mat);
                spine.position.set(side * 0.42, 0, 0.1 - (i % 2) * 0.2); spine.rotation.z = side * 1.3; this.abdomen.add(spine);
            }
            this.abdomen.position.set(0, 0.5, -0.55); this.bodyGroup.add(this.abdomen);
            // Long spiked tail (telson) trailing from the abdomen.
            // Hinged at the abdomen's back edge, in the abdomen's own space; the
            // spike sits half its length along the hinge's axis.
            this.tail = new THREE.Group();
            const telson = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.0, 6), mat);
            telson.position.y = 0.5; this.tail.add(telson);
            this.tail.position.set(0, 0, -0.3); this.tail.rotation.x = -Math.PI / 2 - 0.1; this.abdomen.add(this.tail);
            // Small chelicerae/claws tucked under the front of the carapace.
            this.clawL = this._horseshoeClaw(mat, -1); this.clawR = this._horseshoeClaw(mat, 1);
            // Two front legs and two rear legs grouped under the body.
            this.frontLeg = new THREE.Group(); this.rearLeg = new THREE.Group();
            for (const side of [-1, 1]) {
                for (let i = 0; i < 2; i++) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.45, 5), mat);
                    leg.position.set(side * 0.46, 0.4, 0.4 - i * 0.3); leg.rotation.z = side * 1.0; leg.rotation.x = i * 0.2;
                    (i === 0 ? this.frontLeg : this.rearLeg).add(leg);
                }
            }
            this.bodyGroup.add(this.frontLeg); this.bodyGroup.add(this.rearLeg);
            // Short paired antennae at the leading edge.
            this.antennae = new THREE.Group();
            for (const ax of [-0.1, 0.1]) {
                const an = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 4), mat);
                an.position.set(ax, 0.45, 0.85); an.rotation.x = -0.9; this.antennae.add(an);
            }
            this.bodyGroup.add(this.antennae);
            this._partMeshMap = { CARAPACE: this.carapace, ABDOMEN: this.abdomen, CLAW_LEFT: this.clawL, CLAW_RIGHT: this.clawR, FRONT_LEG: this.frontLeg, REAR_LEG: this.rearLeg, ANTENNAE: this.antennae };
            this._cascadeRules = [
                { gone: ['CARAPACE'], hide: [this.carapace, this.abdomen, this.tail, this.clawL, this.clawR, this.frontLeg, this.rearLeg, this.antennae] },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail] },
                { gone: ['CLAW_LEFT'], hide: [this.clawL] },
                { gone: ['CLAW_RIGHT'], hide: [this.clawR] },
                { gone: ['FRONT_LEG'], hide: [this.frontLeg] },
                { gone: ['REAR_LEG'], hide: [this.rearLeg] },
                { gone: ['ANTENNAE'], hide: [this.antennae] },
            ];
        }
        _horseshoeClaw(mat, side) {
            const g = new THREE.Group();
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 5), mat);
            arm.position.set(side * 0.16, 0, 0.18); arm.rotation.x = 1.1; g.add(arm);
            const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), mat);
            pincer.position.set(side * 0.16, 0.04, 0.34); pincer.rotation.x = 1.4; g.add(pincer);
            g.position.set(0, 0.42, 0.55);
            this.bodyGroup.add(g); return g;
        }

        // ── Armored Rex Lord (ceratopsian fortress: 3 horns, bony frill, armored back) ─
        _buildArmoredRexLord() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.8);
            const boneMat = this.applySkin(this._mat(p.accent, 1.0, 0.6));
            const plateMat = this.applySkin(this._mat(p.shell, 1.0, 0.85));
            // Armored shelled back: low broad carapace ridged with bony plates.
            this.shell = new THREE.Group();
            const back = new THREE.Mesh(new THREE.SphereGeometry(0.66, 14, 11, 0, Math.PI * 2, 0, Math.PI / 2), plateMat);
            back.scale.set(1.25, 0.7, 1.45); this.shell.add(back);
            // Row of bony osteoderm plates down the spine.
            for (let i = 0; i < 5; i++) {
                const plate = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.02, 0.26, 4), boneMat);
                plate.position.set(0, 0.5 - i * 0.04, 0.45 - i * 0.28); plate.scale.set(1, 1, 0.5);
                this.shell.add(plate);
            }
            this.shell.position.set(0, 0.78, -0.1); this.bodyGroup.add(this.shell);
            // Head with bony frill and three horns.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), skinMat);
            skull.scale.set(0.9, 0.85, 1.3); this.head.add(skull);
            // Bony frill: broad fanned plate behind the head.
            const frill = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.32, 0.1, 14, 1, false, 0, Math.PI), boneMat);
            frill.position.set(0, 0.08, -0.18); frill.rotation.set(-0.5, 0, 0); frill.scale.set(1.1, 1.0, 1.0); this.head.add(frill);
            // Two large brow horns + one nose horn.
            this.horns = new THREE.Group();
            for (const hx of [-0.16, 0.16]) {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 6), boneMat);
                horn.position.set(hx, 0.18, 0.28); horn.rotation.x = -0.5; this.horns.add(horn);
            }
            const noseHorn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.32, 6), boneMat);
            noseHorn.position.set(0, 0.0, 0.46); noseHorn.rotation.x = -0.2; this.horns.add(noseHorn);
            this.head.add(this.horns);
            this._eye(this.head, -0.16, 0.05, 0.32, 0.05, 0x111111);
            this._eye(this.head, 0.16, 0.05, 0.32, 0.05, 0x111111);
            this.head.position.set(0, 0.66, 0.95); this.bodyGroup.add(this.head);
            // Stocky pillar legs.
            this.frontLeft = this._pillarLeg(skinMat, -0.58, 0.5);
            this.frontRight = this._pillarLeg(skinMat, 0.58, 0.5);
            this.rearLeft = this._pillarLeg(skinMat, -0.58, -0.5);
            this.rearRight = this._pillarLeg(skinMat, 0.58, -0.5);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 6), skinMat);
            this.tail.position.set(0, 0.5, -0.95); this.tail.rotation.x = -1.7; this.bodyGroup.add(this.tail);
            this._plastron(plateMat, 0.78, 0.52, 0.74, 0.86, 0.1);
            // Custom rig: head loss also drops the horns/frill (children of head).
            this._partMeshMap = { SHELL: this.shell, HEAD: this.head, LEFT_LEG: this.frontLeft, RIGHT_LEG: this.frontRight, REAR_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['SHELL'], hide: [this.shell, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, this.tail] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_LEG'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail] },
            ];
        }

        // ── Steelshell Tortoise (metallic riveted steel-plated shell) ─────────
        _buildSteelshellTortoise() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.5);
            const steelMat = this.applySkin(this._mat(p.shell, 1.0, 0.25, 0x0a0e12));
            const rivetMat = this._mat(p.accent, 1.0, 0.2, 0x222a30);
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), steelMat);
            dome.scale.set(1.1, 0.85, 1.25); this.shell.add(dome);
            // Banded steel plates: flat hex caps bolted around the dome.
            // Each plate is bolted flat onto the dome (an ellipsoid 0.682 x 0.527
            // x 0.775): placed on its surface and turned to its normal. The old
            // fixed heights stood the crown plate and its rivets in the air.
            const DA = 0.682, DB = 0.527, DC = 0.775, up = new THREE.Vector3(0, 1, 0);
            const bands = [{ f: 0.0, n: 1 }, { f: 0.5, n: 6 }, { f: 0.85, n: 8 }];
            for (const b of bands) {
                for (let i = 0; i < b.n; i++) {
                    const a = (i / b.n) * Math.PI * 2;
                    const x = Math.cos(a) * DA * b.f, z = Math.sin(a) * DC * b.f, y = DB * Math.sqrt(1 - b.f * b.f);
                    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 6), steelMat);
                    plate.position.set(x, y, z);
                    plate.quaternion.setFromUnitVectors(up, new THREE.Vector3(x / (DA * DA), y / (DB * DB), z / (DC * DC)).normalize());
                    this.shell.add(plate);
                    // Rivets around each plate, on its face.
                    for (let k = 0; k < 4; k++) {
                        const ra = (k / 4) * Math.PI * 2;
                        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), rivetMat);
                        rivet.position.set(Math.cos(ra) * 0.1, 0.03, Math.sin(ra) * 0.1);
                        plate.add(rivet);
                    }
                }
            }
            this.shell.position.set(0, 0.7, 0); this.bodyGroup.add(this.shell);
            // Steel-plated head + legs.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this.applySkin(this._mat(p.shell, 1.0, 0.3, 0x0a0e12)));
            h.scale.set(0.9, 0.9, 1.2); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.17, 0.05, 0xff4422);
            this._eye(this.head, 0.1, 0.05, 0.17, 0.05, 0xff4422);
            this.head.position.set(0, 0.62, 0.82); this.bodyGroup.add(this.head);
            this.frontLeft = this._stub(skinMat, -0.5, 0.46);
            this.frontRight = this._stub(skinMat, 0.5, 0.46);
            this.rearLeft = this._stub(skinMat, -0.5, -0.46);
            this.rearRight = this._stub(skinMat, 0.5, -0.46);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), skinMat);
            this.tail.position.set(0, 0.55, -0.82); this.tail.rotation.x = -1.8; this.bodyGroup.add(this.tail);
            this._turtleRig();
        }

        // ── Primordial Dragon Turtle (ancient glacier-ice shell, horned draconic head) ─
        _buildPrimordialDragonTurtle() {
            const p = this.profile;
            const skinMat = this._skinMat(p.bodyColor, 0.6);
            const iceMat = this.applySkin(this._mat(p.shell, 0.85, 0.1, 0x2a6a8a));
            this.shell = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 16, 13, 0, Math.PI * 2, 0, Math.PI / 2), iceMat);
            dome.scale.set(1.15, 0.95, 1.35); this.shell.add(dome);
            // Jagged glacier ice spikes jutting from the carapace (sharp tapered prisms).
            const spikeMat = this._mat(p.accent, 0.8, 0.05, 0xaef0ff);
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2; const r = 0.16 + (i % 3) * 0.2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09 + this.idRand() * 0.04, 0.45 + this.idRand() * 0.25, 4), spikeMat);
                spike.position.set(Math.cos(a) * r, 0.45 + (i % 3) * 0.1, Math.sin(a) * r * 1.2);
                spike.rotation.set(Math.sin(a) * 0.4, a, -Math.cos(a) * 0.4);
                this.shell.add(spike);
            }
            this.shell.position.set(0, 0.78, 0); this.bodyGroup.add(this.shell);
            // Horned draconic head.
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), skinMat);
            skull.scale.set(0.85, 0.8, 1.5); this.head.add(skull);
            // Backswept draconic horns + brow ridge.
            const hornMat = this.applySkin(this._mat(0xcfe8f0, 1.0, 0.3));
            for (const hx of [-0.13, 0.13]) {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), hornMat);
                horn.position.set(hx, 0.16, -0.12); horn.rotation.x = 0.9; this.head.add(horn);
            }
            this._eye(this.head, -0.11, 0.08, 0.24, 0.05, p.accent);
            this._eye(this.head, 0.11, 0.08, 0.24, 0.05, p.accent);
            // Icy breath: pale frosted cone puffing from the snout.
            this.breath = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8, 1, true), this._mat(0xeafcff, 0.35, 0.4, 0xaef0ff));
            this.breath.position.set(0, -0.02, 0.62); this.breath.rotation.x = Math.PI / 2; this.breath.scale.set(1, 1, 1.2); this.head.add(this.breath);
            this.head.position.set(0, 0.66, 0.92); this.bodyGroup.add(this.head);
            // Clawed legs + tail.
            this.frontLeft = this._stub(skinMat, -0.55, 0.5);
            this.frontRight = this._stub(skinMat, 0.55, 0.5);
            this.rearLeft = this._stub(skinMat, -0.55, -0.5);
            this.rearRight = this._stub(skinMat, 0.55, -0.5);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 6), skinMat);
            this.tail.position.set(0, 0.52, -0.95); this.tail.rotation.x = -1.7; this.bodyGroup.add(this.tail);
            this._plastron(this.applySkin(this._mat(p.bodyColor, 1.0, 0.7)), 0.78, 0.56, 0.64, 0.84);
            this._turtleRig();
        }

        // ════════════════════════════════════════════════════════════════════
        // Level 1-5 starter roster: one bespoke model per enemy (lv_ keys).
        // ════════════════════════════════════════════════════════════════════
        _dk(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b); return c.getHex(); }
        // A tapering limb through a list of points (struts plus joint balls),
        // as a Group at pts[0] so a turn of the group swings the whole limb.
        _armThrough(parent, pts, r0, r1, mat) {
            const g = new THREE.Group(); g.position.copy(pts[0]);
            const n = pts.length - 1;
            for (let i = 1; i <= n; i++) {
                const ra = r0 + (r1 - r0) * (i - 1) / n, rb = r0 + (r1 - r0) * i / n;
                const a = pts[i - 1].clone().sub(pts[0]), b = pts[i].clone().sub(pts[0]);
                this.addStrut(g, mat, a, b, ra, rb, 5);
                const ball = new THREE.Mesh(new THREE.SphereGeometry(rb * 1.05, 5, 4), mat); ball.position.copy(b); g.add(ball);
            }
            parent.add(g); return g;
        }

        // ── Moon Jellyling: a pale saucer bell with the four pink horseshoes
        // of a moon jelly, a fringe of fine stingers and frilled oral arms ────
        _buildMoonJellyling() {
            const p = this.profile;
            const bellMat = this._mat(p.bodyColor, 0.5, 0.2, p.accent); bellMat.emissiveIntensity = 0.15;
            const pink = this._mat(p.accent, 0.9, 0.3, p.accent); pink.emissiveIntensity = 0.3;
            const arm = this._mat(this._dk(p.bodyColor, 0.92), 0.7, 0.3);
            this.bell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42), bellMat);
            this.bell.scale.set(1, 0.55, 1); this.bell.position.set(0, 1.25, 0); this.bodyGroup.add(this.bell);
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 0.17, z = Math.sin(a) * 0.17;
                const hs = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 4, 10, Math.PI * 1.5), pink);
                hs.position.set(x, Math.sqrt(0.25 - x * x - z * z) + 0.005, z); hs.rotation.set(Math.PI / 2, 0, a); this.bell.add(hs);
            }
            // Rhopalia: the little sense knots round the margin (the EYE part).
            this.eye = new THREE.Group(); this.bell.add(this.eye);
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const r = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), pink); r.position.set(Math.cos(a) * 0.484, 0.124, Math.sin(a) * 0.484); this.eye.add(r); }
            // Margin fringe: follows the rim as the bell pulses.
            this.fringe = new THREE.Group(); this.fringe.position.y = 1.25 + 0.124 * 0.55; this.bodyGroup.add(this.fringe);
            const strand = this._mat(p.bodyColor, 0.6, 0.3);
            for (let k = 0; k < 16; k++) { const a = (k + 0.5) * Math.PI / 8; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.004, 0.26, 3), strand); s.position.set(Math.cos(a) * 0.475, -0.12, Math.sin(a) * 0.475); this.fringe.add(s); }
            // Manubrium: the mouth stalk down the middle of the bell.
            this.beak = new THREE.Group(); this.bodyGroup.add(this.beak);
            this.addStrut(this.beak, arm, new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 1.26, 0), 0.04, 0.06, 5);
            const lip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 6), arm); lip.rotation.x = Math.PI; lip.position.y = 1.2; this.beak.add(lip);
            // Four frilled oral arms trailing from the mouth.
            this.oralArms = [];
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2;
                const ch = this._thread(this._chain(arm, Math.cos(a) * 0.05, 1.18, Math.sin(a) * 0.05, 5, 0.055, 0.62, true), arm, 0.02);
                // Beads pressed into ruffled lobes, so the arm reads as a frilled
                // ribbon rather than a string of pearls.
                ch._parts.forEach(b => { b.scale.set(1.5, 0.75, 0.45); b.rotation.y = -a; });
                ch._parts.forEach((b, i) => { if (i % 2) { const fr = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), pink); fr.scale.set(1.2, 0.25, 0.6); fr.position.set(Math.cos(a) * 0.04, b.position.y, Math.sin(a) * 0.04); fr.rotation.y = -a; ch.add(fr); } });
                this.oralArms.push(ch);
            }
            this._partMeshMap = { BODY: this.bell, EYE: this.eye, TENTACLE_ONE: this.oralArms[0], TENTACLE_TWO: this.oralArms[2], BEAK: this.beak };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.bell, this.fringe, this.beak, ...this.oralArms] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.oralArms[0]] },
                { gone: ['TENTACLE_TWO'], hide: [this.oralArms[2]] },
                { gone: ['BEAK'], hide: [this.beak] },
            ];
        }

        // ── Void Jellyling: a box jelly of starless dark, glowing at the
        // edges, a void at its heart, eye-knots on all four faces ─────────────
        _buildVoidJellyling() {
            const p = this.profile, V = (x, y, z) => new THREE.Vector3(x, y, z);
            const voidMat = this._mat(p.bodyColor, 0.55, 0.15, p.accent); voidMat.emissiveIntensity = 0.12;
            const edge = this._mat(p.accent, 0.95, 0.2, p.accent); edge.emissiveIntensity = 0.8; this._edgeMat = edge;
            const lash = this._mat(this._dk(p.accent, 0.7), 0.75, 0.3, p.accent); lash.emissiveIntensity = 0.25;
            this.bell = new THREE.Group(); this.bell.position.set(0, 1.62, 0); this.bodyGroup.add(this.bell);
            const box = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.55, 4, 1, true), voidMat); box.rotation.y = Math.PI / 4; this.bell.add(box);
            const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.18, 4), voidMat); cap.rotation.y = Math.PI / 4; cap.position.y = 0.364; this.bell.add(cap);
            for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                this.addStrut(this.bell, edge, V(sx * 0.212, 0.275, sz * 0.212), V(sx * 0.255, -0.275, sz * 0.255), 0.014, 0.014, 4);
            }
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), this._mat(0x020104, 1, 0.9)); core.position.y = 0.05; this.bell.add(core);
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 3, 14), edge); halo.position.y = 0.05; halo.rotation.x = 1.1; core.add(halo); halo.position.y = 0;
            // Eye knots, one on each face.
            this.eye = new THREE.Group(); this.bell.add(this.eye);
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2, n = V(Math.sin(a), 0, Math.cos(a));
                const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), this._mat(0xe8e0f8, 1, 0.3)); knob.position.copy(n).multiplyScalar(0.25).setY(-0.12); this.eye.add(knob);
                for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 4, 3), this._mat(0x000000, 1, 0.2)); e.position.set(Math.cos(a) * s * 0.02, 0.012, -Math.sin(a) * s * 0.02).addScaledVector(n, 0.04); knob.add(e); }
            }
            // Manubrium hanging in the open box.
            this.beak = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.42, 5), lash); this.beak.position.y = 0.06; this.bell.add(this.beak);
            // Pedalia at the four lower corners, three lashes from each.
            this.lashes = [];
            [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([sx, sz], ci) => {
                const g = new THREE.Group(); g.position.set(sx * 0.255, -0.275, sz * 0.255); this.bell.add(g);
                const ped = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), lash); ped.scale.set(1, 1, 0.35); ped.rotation.set(Math.PI, Math.atan2(sx, sz), 0); ped.position.y = -0.07; g.add(ped);
                for (let k = 0; k < 3; k++) {
                    const off = (k - 1) * 0.05, len = 0.75 + k * 0.12;
                    const a0 = V(off, -0.14, 0), a1 = V(sx * 0.08 + off, -0.14 - len * 0.6, sz * 0.08), a2 = V(sx * 0.02 + off * 2, -0.14 - len, sz * 0.16 + 0.05);
                    this.addStrut(g, lash, a0, a1, 0.012, 0.009, 3); this.addStrut(g, lash, a1, a2, 0.009, 0.005, 3);
                }
                g._ci = ci; this.lashes.push(g);
            });
            this._partMeshMap = { BODY: this.bell, EYE: this.eye, TENTACLE_ONE: this.lashes[0], TENTACLE_TWO: this.lashes[1], BEAK: this.beak };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [this.bell] },
                { gone: ['EYE'], hide: [this.eye] },
                { gone: ['TENTACLE_ONE'], hide: [this.lashes[0]] },
                { gone: ['TENTACLE_TWO'], hide: [this.lashes[1]] },
                { gone: ['BEAK'], hide: [this.beak] },
            ];
        }

        // ── Tidepool Octopus: a sulky little octopus lording it over its rock
        // pool, arms spread on the water, siphon cocked to ink ───────────────
        _buildTidepoolOctopus() {
            const p = this.profile, V = (x, y, z) => new THREE.Vector3(x, y, z);
            const skin = this._skinMat(p.bodyColor, 0.45);
            const rock = this._skinMat(0x6a6660, 0.95);
            this.pool = new THREE.Group(); this.bodyGroup.add(this.pool);
            const surf = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.03, 12), this._mat(0x3a8aa0, 0.55, 0.05)); surf.position.y = 0.03; this.pool.add(surf);
            for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.2; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + this.idRand() * 0.06, 0), rock); st.position.set(Math.cos(a) * 0.9, 0.07, Math.sin(a) * 0.9); st.scale.set(1, 0.7, 1); this.pool.add(st); }
            const star = new THREE.Group(); star.position.set(Math.cos(0.2) * 0.9, 0.17, Math.sin(0.2) * 0.9); this.pool.add(star);
            for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const leg = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 3), this._mat(0xe86a2a, 1, 0.6)); leg.position.set(Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045); leg.quaternion.setFromUnitVectors(V(0, 1, 0), V(Math.cos(a), 0, Math.sin(a))); star.add(leg); }
            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin); this.head.scale.set(1.1, 0.85, 1); this.head.position.set(0, 0.3, 0.08); this.bodyGroup.add(this.head);
            // Sulky eyes: pupils set low under heavy lids.
            for (const s of [-1, 1]) {
                const eg = new THREE.Group(); eg.position.set(s * 0.15, 0.13, 0.13); this.head.add(eg);
                eg.add(new THREE.Mesh(new THREE.SphereGeometry(0.088, 6, 5), this._mat(0xe8d8a8, 1, 0.3)));
                const pup = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.02), this._mat(0x111111, 1, 0.2)); pup.position.set(0, -0.026, 0.082); eg.add(pup);
                const lid = new THREE.Mesh(new THREE.SphereGeometry(0.096, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), skin); lid.rotation.x = 0.2; lid.rotation.z = s * 0.25; eg.add(lid);
            }
            this.mantle = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skin); this.mantle.scale.set(0.95, 1.2, 1.1); this.mantle.rotation.x = -0.5; this.mantle.position.set(0, 0.52, -0.12); this.bodyGroup.add(this.mantle);
            this.siphon = new THREE.Group(); this.siphon.position.set(-0.24, 0.4, -0.02); this.siphon.rotation.set(0.2, 0, 0.9); this.bodyGroup.add(this.siphon);
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.15, 6), skin); tube.position.y = 0.06; this.siphon.add(tube);
            this.ink = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), this._mat(0x0a0a14, 0.9, 0.2)); this.ink.position.y = 0.15; this.siphon.add(this.ink);
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), this._mat(0x2a1a14, 1, 0.4)); this.beak.position.set(0, 0.12, 0.3); this.beak.rotation.x = 2.2; this.bodyGroup.add(this.beak);
            // Eight arms laid out on the water, tips curling up; paired into the
            // four TENTACLE parts.
            this.armPairs = [new THREE.Group(), new THREE.Group(), new THREE.Group(), new THREE.Group()];
            this.armPairs.forEach(g => this.bodyGroup.add(g));
            this._arms = [];
            for (let k = 0; k < 8; k++) {
                const a = (k + 0.5) / 8 * Math.PI * 2, d = V(Math.sin(a), 0, Math.cos(a));
                const pts = [V(0, 0.16, 0.06).addScaledVector(d, 0.12)];
                for (let j = 1; j <= 6; j++) {
                    const r = 0.12 + j * 0.095;
                    pts.push(V(0, 0.07 + (j >= 5 ? (j - 4) * 0.07 : 0), 0.06).addScaledVector(d, r).add(V(Math.cos(a) * j * 0.012, 0, -Math.sin(a) * j * 0.012)));
                }
                const armG = this._armThrough(this.armPairs[k >> 1], pts, 0.075, 0.028, skin);
                armG._a = a; this._arms.push(armG);
            }
            this._partMeshMap = { HEAD: this.head, MANTLE: this.mantle, TENTACLE_1: this.armPairs[0], TENTACLE_2: this.armPairs[1], TENTACLE_3: this.armPairs[2], TENTACLE_4: this.armPairs[3], BEAK: this.beak };
            this._cascadeRules = [
                { gone: ['HEAD'], hide: [this.head, this.mantle, this.siphon, this.beak, ...this.armPairs] },
                { gone: ['MANTLE'], hide: [this.mantle, this.siphon] },
                { gone: ['TENTACLE_1'], hide: [this.armPairs[0]] },
                { gone: ['TENTACLE_2'], hide: [this.armPairs[1]] },
                { gone: ['TENTACLE_3'], hide: [this.armPairs[2]] },
                { gone: ['TENTACLE_4'], hide: [this.armPairs[3]] },
                { gone: ['BEAK'], hide: [this.beak] },
            ];
        }

        // ── Temple Tortoise: an old high-domed tortoise in mossy scutes, tied
        // with a red temple cord, bell and prayer slips, lettuce in its beak ──
        _buildTempleTortoise() {
            const p = this.profile, V = (x, y, z) => new THREE.Vector3(x, y, z);
            const skinMat = this._skinMat(p.bodyColor, 0.85);
            const shellMat = this.applySkin(this._mat(p.shell, 1.0, 0.85));
            const scuteMat = this.applySkin(this._mat(this._dk(p.shell, 1.45), 1.0, 0.8));
            const cord = this._mat(p.accent, 1, 0.6);
            const gold = this._mat(0xd8a830, 1, 0.25, 0x3a2a00);
            this.shell = new THREE.Group();
            const DA = 0.6, DB = 0.63, DC = 0.732;
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), shellMat); dome.scale.set(1.0, 1.05, 1.22); this.shell.add(dome);
            for (const b of [{ f: 0, n: 1 }, { f: 0.55, n: 6 }, { f: 0.86, n: 8 }]) for (let i = 0; i < b.n; i++) {
                const a = (i / b.n) * Math.PI * 2 + b.f;
                const x = Math.cos(a) * DA * b.f, z = Math.sin(a) * DC * b.f, y = DB * Math.sqrt(1 - b.f * b.f);
                const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.06, 6), scuteMat); sc.position.set(x, y, z);
                sc.quaternion.setFromUnitVectors(V(0, 1, 0), V(x / (DA * DA), y / (DB * DB), z / (DC * DC)).normalize()); this.shell.add(sc);
            }
            [[0.1, -0.3], [-0.22, -0.12], [0.26, 0.05]].forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 3), this._mat(0x5a8a32, 1, 1)); m.scale.set(1, 0.35, 1.3); m.position.set(x, DB * Math.sqrt(Math.max(0, 1 - (x / DA) * (x / DA) - (z / DC) * (z / DC))), z); this.shell.add(m); });
            // The temple cord round the shell, a bell at the front, prayer slips.
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.026, 4, 16), cord); band.scale.set(1, 1.22, 1); band.rotation.x = Math.PI / 2; band.position.y = 0.08; this.shell.add(band);
            this.bell = new THREE.Group(); this.bell.position.set(0, 0.06, 0.73); this.shell.add(this.bell);
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 3, 6), gold); loop.position.y = -0.02; this.bell.add(loop);
            const cup = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.62), gold); cup.position.y = -0.1; this.bell.add(cup);
            const clap = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), gold); clap.position.y = -0.14; this.bell.add(clap);
            for (const s of [-1, 1]) {
                const slip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.006), this._mat(0xf2ead8, 1, 0.8)); slip.position.set(s * 0.6, -0.03, 0.12); slip.rotation.y = s * 1.3; this.shell.add(slip);
                const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.008), cord); mark.position.y = -0.02; slip.add(mark);
            }
            this.shell.position.set(0, 0.52, 0); this.bodyGroup.add(this.shell);
            this._plastron(shellMat, 0.52, 0.34, 0.6, 0.74);
            // Old head on a wrinkled neck, a lettuce leaf in the beak.
            // Pivoted at the root of the neck, so a nod swings neck and head together.
            this.head = new THREE.Group(); this.head.position.set(0, 0.52, 0.56); this.bodyGroup.add(this.head);
            this.addStrut(this.head, skinMat, V(0, 0, 0), V(0, 0.08, 0.3), 0.13, 0.11, 6);
            const hg = new THREE.Group(); hg.position.set(0, 0.1, 0.36); this.head.add(hg);
            for (let k = 0; k < 2; k++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 3, 8), skinMat); w.position.set(0, -0.07 + k * 0.025, -0.24 + k * 0.1); w.rotation.x = 0.25; hg.add(w); }
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), skinMat); skull.scale.set(0.95, 0.85, 1.25); hg.add(skull);
            for (const s of [-1, 1]) {
                this._eye(hg, s * 0.1, 0.05, 0.12, 0.035, 0x111111);
                const lid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.03), skinMat); lid.position.set(s * 0.1, 0.085, 0.13); lid.rotation.z = -s * 0.2; hg.add(lid);
            }
            this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 5), this._mat(0xd8c8a0, 1, 0.5)); this.beak.position.set(0, -0.06, 0.22); this.beak.rotation.x = 1.9; hg.add(this.beak);
            this.leaf = new THREE.Group(); this.leaf.position.set(0.06, -0.08, 0.22); hg.add(this.leaf);
            for (let k = 0; k < 2; k++) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 3), this._mat(k ? 0xb8e070 : 0x8ac84a, 1, 0.6)); lf.scale.set(1.5, 0.18, 0.9); lf.position.set(0.08 + k * 0.05, k * 0.02, -k * 0.02); lf.rotation.set(0.3 * k, 0.4, 0.2 - k * 0.4); this.leaf.add(lf); }
            const leg = (x, z) => {
                const g = new THREE.Group(); g.position.set(x, 0.18, z);
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.36, 7), skinMat); g.add(col);
                for (let k = -1; k <= 1; k++) { const nail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 4), this._mat(0xe0d8c0, 1, 0.5)); nail.position.set(k * 0.07, -0.15, 0.13); nail.rotation.x = 1.4; g.add(nail); }
                this.bodyGroup.add(g); return g;
            };
            this.frontLeft = leg(-0.42, 0.4); this.frontRight = leg(0.42, 0.4); this.rearLeft = leg(-0.42, -0.4); this.rearRight = leg(0.42, -0.4);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), skinMat); this.tail.position.set(0, 0.38, -0.82); this.tail.rotation.x = -1.9; this.bodyGroup.add(this.tail);
            this._turtleRig();
            this._partMeshMap.BEAK = this.beak;
            this._cascadeRules.push({ gone: ['BEAK'], hide: [this.beak, this.leaf] });
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime;
            const anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.7);
            this.applyModelScale(growth);

            const fast = (anim === 'attack' || anim === 'specialattack');
            // Four-legged models only stride while really travelling (overworld
            // walk) or lunging on an attack; standing in battle they keep still.
            const stride = this.strideMul(fast);
            const hitJolt = anim === 'hit' ? Math.sin(t * 26) * Math.exp(-t * 6) * 0.18 : 0;
            this.model.rotation.z = hitJolt;

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'fish': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.1 * this.scale;
                    if (this.tailFin && this.tailFin.visible) this.tailFin.rotation.y = Math.sin(t * (fast ? 14 : 6)) * 0.5;
                    if (this.lPec && this.lPec.visible) this.lPec.rotation.x = -1.2 + Math.sin(t * 5) * 0.3;
                    if (this.rPec && this.rPec.visible) this.rPec.rotation.x = 1.2 - Math.sin(t * 5) * 0.3;
                    break;
                }
                case 'octopus': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.08 * this.scale;
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 7 : 2.5) + i) * 0.35; });
                    break;
                }
                case 'aqu_bubblesquid':
                case 'aqu_bubblesquidsecond': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.1 * this.scale;
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 8 : 3) + i) * 0.4; });
                    if (this.mantle && this.mantle.visible) this.mantle.rotation.z = Math.sin(t * 2) * 0.05;
                    if (this.bubbles) this.bubbles.children.forEach(b => { b.position.y += 0.01 + b._t * 0.006; if (b.position.y > 1.9) { b.position.y = 0.4; b.position.x = (b._t - 0.5) * 1.0; } });
                    if (this.sac) { const s = 1.0 + Math.abs(Math.sin(t * (fast ? 8 : 3))) * 0.3; this.sac.scale.setScalar(s); }
                    break;
                }
                case 'frog':
                case 'amphibian': {
                    // Idle breathe + vocal sac puff; hops on attack; tongue flick.
                    const hop = fast ? Math.abs(Math.sin(t * 6)) * 0.2 : 0;
                    this.model.position.y = this._baseY + hop * this.scale;
                    if (this.vocalSac && this.vocalSac.visible) { const s = 1.0 + Math.abs(Math.sin(t * 2.5)) * 0.4; this.vocalSac.scale.setScalar(s); }
                    if (this.tongue) { const out = fast && Math.sin(t * 6) > 0.5; this.tongue.visible = out; }
                    break;
                }
                case 'turtle': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.02 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = 0.75 + (fast ? 0.1 : 0) + Math.sin(t * 1.5) * 0.03;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 7 : 2) + i) * 0.2 * stride; });
                    break;
                }
                case 'snail': {
                    this.model.position.x = baseX + Math.sin(t * 0.6) * 0.02 * this.scale;
                    if (this.t1 && this.t1.visible) this.t1.rotation.z = Math.sin(t * 1.5) * 0.2;
                    if (this.t2 && this.t2.visible) this.t2.rotation.z = -Math.sin(t * 1.5 + 0.5) * 0.2;
                    break;
                }
                case 'crab': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 7 : 2.5))) * 0.02 * this.scale;
                    const snap = fast ? Math.abs(Math.sin(t * 9)) * 0.5 : Math.sin(t * 2) * 0.12;
                    if (this.clawL && this.clawL.visible) this.clawL.rotation.z = -0.1 - snap;
                    if (this.clawR && this.clawR.visible) this.clawR.rotation.z = 0.1 + snap;
                    if (this.antennae && this.antennae.visible) this.antennae.rotation.z = Math.sin(t * 3) * 0.15;
                    break;
                }
                case 'coralwarcaster':
                case 'crystalcarapace':
                case 'gildedzapback': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.02 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = 0.78 + (fast ? 0.1 : 0) + Math.sin(t * 1.5) * 0.03;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 7 : 2) + i) * 0.2 * stride; });
                    if (this.stormOrbs) this.stormOrbs.forEach((o) => { const a = o._a + t * (fast ? 4 : 1.6); o.position.set(Math.cos(a) * 0.7, 0.55 + Math.sin(t * 2 + o._a) * 0.1, Math.sin(a) * 0.7); });
                    if (this.arcs) { this.arcs.visible = (Math.sin(t * (fast ? 22 : 9)) > 0.2); this.arcs.rotation.y = t * 2; }
                    break;
                }
                case 'krakenleviathan': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.06 * this.scale;
                    if (this.eye && this.eye.visible) this.eye.rotation.y = Math.sin(t * 0.8) * 0.3;
                    if (this.maw && this.maw.visible) { const o = fast ? 0.5 + Math.abs(Math.sin(t * 6)) * 0.5 : 1.0 + Math.sin(t * 1.5) * 0.15; this.maw.scale.set(o, o, 1); }
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 6 : 2) + i) * 0.4; });
                    break;
                }
                case 'krakenspawn': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.5) * 0.1 * this.scale;
                    if (this.mantle && this.mantle.visible) this.mantle.rotation.z = Math.sin(t * 2) * 0.06;
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 8 : 3) + i) * 0.4; });
                    break;
                }
                case 'luminousjellyfish': {
                    // Pulsing bell propulsion + drifting glow.
                    const pulse = 1.0 + Math.sin(t * (fast ? 6 : 2.2)) * 0.12;
                    if (this.bell && this.bell.visible) this.bell.scale.set(1.1 * pulse, 1.0 / pulse, 1.1 * pulse);
                    this.model.position.y = this._baseY + Math.sin(t * 2.2) * 0.12 * this.scale;
                    if (this.eye && this.eye.visible) this.eye.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2.5)) * 0.5;
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.x = Math.sin(t * (fast ? 5 : 2) + i) * 0.2; });
                    break;
                }
                case 'paralyticslug': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.2) * 0.04 * this.scale;
                    if (this.body && this.body.visible) { const s = 1.0 + Math.sin(t * 1.8) * 0.05; this.body.scale.set(1.0 * s, 1.1 / s, 1.6 * s); }
                    if (this.eye && this.eye.visible) this.eye.children.forEach((g, i) => { g.rotation.z = Math.sin(t * 1.5 + i) * 0.2; });
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = (i % 2 ? 1 : -1) * (0.2 + Math.sin(t * (fast ? 6 : 2) + i) * 0.25); });
                    break;
                }
                case 'sacredkraken': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.07 * this.scale;
                    if (this.mantle && this.mantle.visible) this.mantle.children.forEach(c => { if (c.geometry && c.geometry.type === 'TorusGeometry') c.rotation.z = t * 1.2; });
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 6 : 2) + i) * 0.35; });
                    break;
                }
                case 'seaturtle':
                case 'shadowtortoise': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.1) * 0.04 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = 0.78 + (fast ? 0.1 : 0) + Math.sin(t * 1.4) * 0.04;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => {
                        if (!l || !l.visible) return;
                        if (l._flap) l.rotation.z = l._side * Math.sin(t * (fast ? 7 : 2.5) + i) * 0.3 * stride;
                        else l.rotation.x = Math.sin(t * (fast ? 7 : 2.5) + i) * 0.3 * stride;
                    });
                    if (this.smoke) this.smoke.forEach((puff) => { const a = puff._a + t * 0.8; puff.position.set(Math.cos(a) * 0.6, puff._yb + Math.sin(t * 1.5 + puff._a) * 0.15, Math.sin(a) * 0.6); puff.material.opacity = 0.3 + Math.abs(Math.sin(t + puff._a)) * 0.25; });
                    break;
                }
                case 'skullcrusherbrute': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.03 * this.scale;
                    const swing = fast ? Math.sin(t * 8) * 0.7 : Math.sin(t * 2) * 0.2;
                    if (this.tentOne && this.tentOne.visible) this.tentOne.rotation.z = 0.25 + swing;
                    if (this.tentTwo && this.tentTwo.visible) this.tentTwo.rotation.z = -0.25 - swing;
                    if (this.eye && this.eye.visible) this.eye.rotation.y = Math.sin(t * 1.5) * 0.25;
                    break;
                }
                case 'volcanicshark': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.3) * 0.08 * this.scale;
                    this.model.rotation.y = (this.model.rotation.y || 0); // base orientation kept
                    if (this.maw && this.maw.visible) { const o = fast ? 0.5 + Math.abs(Math.sin(t * 6)) * 0.5 : 1.0 + Math.sin(t * 1.5) * 0.12; this.maw.children.forEach(c => { if (c.geometry && c.geometry.type === 'ConeGeometry' && c.position.y === 0) c.scale.y = o; }); this.maw.scale.y = o; }
                    if (this.tentacles && this.tentacles.visible) this.tentacles.children.forEach((g, i) => { g.rotation.x = Math.sin(t * (fast ? 7 : 3) + i) * 0.3; });
                    this._segments.forEach((v) => { if (v._vent && v.visible && v.material) v.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2 + v.position.x)) * 0.5; });
                    break;
                }
                case 'windleviathan':
                case 'abyssalleviathan': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.06 * this.scale;
                    if (this.eye && this.eye.visible) this.eye.rotation.y = Math.sin(t * 0.8) * 0.3;
                    if (this.maw && this.maw.visible) { const o = fast ? 0.5 + Math.abs(Math.sin(t * 6)) * 0.5 : 1.0 + Math.sin(t * 1.5) * 0.15; this.maw.scale.set(o, o, 1); }
                    if (this.heartChamber && this.heartChamber.visible) this.heartChamber.rotation.y = (this.variant === 'windleviathan' ? t * 0.8 : Math.sin(t * 1.2) * 0.1);
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 6 : 2) + i) * 0.4; });
                    break;
                }
                case 'mindflayer': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.05 * this.scale;
                    if (this.head && this.head.visible) this.head.rotation.y = Math.sin(t * 1.0) * 0.2;
                    this._segments.forEach((g, i) => { if (g.visible) { g.rotation.z = Math.sin(t * (fast ? 8 : 3) + i) * 0.4; g.rotation.x = -0.35 + Math.sin(t * (fast ? 6 : 2) + i) * 0.2; } });
                    break;
                }
                case 'shellbreakerbulwark':
                case 'galeshelltortoise':
                case 'nightcursetortoise': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.1) * 0.03 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = (this.variant === 'shellbreakerbulwark' ? 0.85 : 0.84) + (fast ? 0.1 : 0) + Math.sin(t * 1.4) * 0.04;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 7 : 2.5) + i) * 0.2 * stride; });
                    if (this.gusts) this.gusts.forEach((g, i) => { g.material.opacity = 0.25 + Math.abs(Math.sin(t * 3 + i)) * 0.3; g.scale.z = 1.4 + Math.sin(t * 4 + i) * 0.5; });
                    if (this.runes) this.runes.forEach((r, i) => { r.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2 + i)) * 0.6; });
                    if (this.motes) this.motes.forEach((m) => { const a = m._a + t * 0.9; m.position.set(Math.cos(a) * 0.55, m._yb + Math.sin(t * 1.5 + m._a) * 0.2, Math.sin(a) * 0.55); m.material.opacity = 0.4 + Math.abs(Math.sin(t + m._a)) * 0.3; });
                    break;
                }
                case 'dawnshelltortoise':
                case 'pyroshelltortoise':
                case 'stormshelltortoise':
                case 'tidalcarapacetortoise': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.1) * 0.03 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = 0.84 + (fast ? 0.1 : 0) + Math.sin(t * 1.4) * 0.04;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 7 : 2.5) + i) * 0.2 * stride; });
                    if (this.rays) this.rays.forEach((r, i) => { if (r.material) r.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 1.6 + i)) * 0.5; });
                    if (this.fissures) this.fissures.forEach((f, i) => { if (f.material) f.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * (fast ? 5 : 2.4) + i)) * 0.6; });
                    if (this.arcs) { this.arcs.visible = (Math.sin(t * (fast ? 24 : 10)) > 0.1); this.arcs.rotation.y = t * 2.4; }
                    if (this.drips) this.drips.forEach((d) => { const fall = (t * 0.7 + d._a) % 1.0; d.position.y = d._yb - fall * 0.5; d.material.opacity = 0.7 * (1.0 - fall); });
                    break;
                }
                case 'griefcollector': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.07 * this.scale;
                    if (this.body && this.body.visible) this.body.rotation.y = Math.sin(t * 0.6) * 0.2;
                    if (this.eyes) this.eyes.forEach((e, i) => { if (e._tear) { const fall = (t * 0.6 + i * 0.3) % 1.0; e._tear.position.y = -0.14 - fall * 0.4; e._tear.material.opacity = 0.7 * (1.0 - fall); } });
                    this._segments.forEach((g, i) => { if (g.visible) g.rotation.z = Math.sin(t * (fast ? 5 : 1.8) + i) * 0.35; });
                    break;
                }
                case 'noneuclideancrab': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 7 : 2.5))) * 0.03 * this.scale;
                    const snap = fast ? Math.abs(Math.sin(t * 9)) * 0.6 : Math.sin(t * 2) * 0.14;
                    if (this.clawL && this.clawL.visible) this.clawL.rotation.z = -0.15 - snap;
                    if (this.clawR && this.clawR.visible) this.clawR.rotation.z = 0.15 + snap * 0.6;
                    if (this.carapace && this.carapace.visible) { this.carapace.rotation.x = 0.2 + Math.sin(t * 0.7) * 0.15; this.carapace.rotation.y = 0.4 + Math.sin(t * 0.5) * 0.2; }
                    if (this.antennae && this.antennae.visible) this.antennae.rotation.z = Math.sin(t * 2.5) * 0.2;
                    break;
                }
                case 'terraclawtortoise':
                case 'steelshelltortoise':
                case 'armoredrexlord':
                case 'primordialdragonturtle': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.0) * 0.025 * this.scale;
                    if (this.head && this.head.visible) this.head.position.z = (this.variant === 'armoredrexlord' ? 0.95 : (this.variant === 'primordialdragonturtle' ? 0.92 : 0.85)) + (fast ? 0.1 : 0) + Math.sin(t * 1.3) * 0.03;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 7 : 2) + i) * 0.18 * stride; });
                    if (this.horns && this.head && this.head.visible) this.head.rotation.x = (fast ? -0.2 : 0) + Math.sin(t * 1.5) * 0.05;
                    if (this.breath) { this.breath.material.opacity = (fast ? 0.5 : 0.2) + Math.abs(Math.sin(t * (fast ? 6 : 2.2))) * 0.25; this.breath.scale.z = 1.2 + Math.sin(t * 3) * 0.4; }
                    break;
                }
                case 'horseshoecrab': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.02 * this.scale;
                    if (this.tail && this.tail.visible) this.tail.rotation.x = -Math.PI / 2 - 0.1 + (fast ? Math.sin(t * 8) * 0.3 : Math.sin(t * 1.6) * 0.12);
                    if (this.abdomen && this.abdomen.visible) this.abdomen.rotation.x = Math.sin(t * 1.4) * 0.08;
                    [this.frontLeg, this.rearLeg].forEach((l, i) => { if (l && l.visible) l.children.forEach((leg, k) => { leg.rotation.x = (leg.rotation.x || 0) * 0 + (k % 2 ? -1 : 1) * Math.sin(t * (fast ? 7 : 3) + i + k) * 0.2; }); });
                    if (this.antennae && this.antennae.visible) this.antennae.rotation.z = Math.sin(t * 2.5) * 0.12;
                    break;
                }
                case 'moonjellyling': {
                    const pulse = 1.0 + Math.sin(t * (fast ? 6 : 2.2)) * 0.08;
                    if (this.bell && this.bell.visible) this.bell.scale.set(pulse, 0.55 / pulse, pulse);
                    // The fringe rides the rim as the bell squeezes.
                    if (this.fringe) { this.fringe.scale.set(pulse, 1, pulse); this.fringe.position.y = 1.25 + 0.124 * 0.55 / pulse; }
                    this.model.position.y = this._baseY + Math.sin(t * 1.6) * 0.1 * this.scale;
                    if (this.oralArms) this.oralArms.forEach((g, i) => { g.rotation.x = Math.sin(t * 1.8 + i) * 0.15; g.rotation.z = Math.cos(t * 1.5 + i) * 0.15; });
                    break;
                }
                case 'voidjellyling': {
                    const sq = 1.0 + Math.sin(t * (fast ? 6 : 2)) * 0.07;
                    if (this.bell) this.bell.scale.set(sq, 1 / sq, sq);
                    this.model.position.y = this._baseY + Math.sin(t * 1.3) * 0.12 * this.scale;
                    if (this._edgeMat) this._edgeMat.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 1.7)) * 0.6;
                    if (this.lashes) this.lashes.forEach((g, i) => { g.rotation.x = Math.sin(t * 1.4 + i) * (fast ? 0.35 : 0.12); g.rotation.z = Math.cos(t * 1.2 + i * 1.3) * 0.12; });
                    break;
                }
                case 'tidepooloctopus': {
                    if (this.mantle && this.mantle.visible) { const b = 1 + Math.sin(t * (fast ? 5 : 1.8)) * 0.05; this.mantle.scale.set(0.95 * b, 1.2 * b, 1.1 * b); }
                    if (this._arms) this._arms.forEach((g, i) => { g.rotation.y = Math.sin(t * 1.4 + i * 0.9) * 0.1; });
                    if (this.siphon) this.siphon.rotation.z = 0.9 + (fast ? Math.abs(Math.sin(t * 7)) * 0.3 : 0);
                    if (this.ink) this.ink.scale.setScalar(fast ? 1 + Math.abs(Math.sin(t * 7)) * 1.2 : 1);
                    break;
                }
                case 'templetortoise': {
                    this.model.position.y = this._baseY + Math.sin(t * 0.9) * 0.015 * this.scale;
                    if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 1.1) * 0.06 + (fast ? -Math.abs(Math.sin(t * 5)) * 0.2 : 0);
                    if (this.leaf) this.leaf.rotation.z = Math.sin(t * 4) * 0.12; // chewing
                    if (this.bell) this.bell.rotation.z = Math.sin(t * 1.9) * 0.25;
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((l, i) => { if (l && l.visible) l.rotation.x = Math.sin(t * (fast ? 5 : 1.6) + i) * 0.12 * stride; });
                    break;
                }
                case 'serpent':
                case 'worm': {
                    // Slither: each segment sways with a travelling phase.
                    const rate = fast ? 8 : 3;
                    this._segments.forEach((seg) => {
                        if (!seg.visible) return;
                        const ph = seg._phase || 0;
                        if (seg._baseX === undefined) seg._baseX = seg.position.x; // capture S-curve base offset
                        seg.rotation.z = Math.sin(t * rate - ph) * 0.25;
                        seg.position.x = seg._baseX + Math.sin(t * rate - ph) * 0.12 * (this.variant === 'serpent' ? 1 : 0.6);
                    });
                    if (this.head && this.head.visible) {
                        this.head.position.x = Math.sin(t * rate) * 0.14;
                        this.head.rotation.z = Math.sin(t * rate) * 0.2;
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
            this.model.position.y = this._baseY - prog * 0.35 * this.scale;
            this.model.rotation.z = prog * 1.2;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new AquaticBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = AQ_PROFILES;
    reg('aquaticfish', { aliases: ['aquaticfish', 'fish', 'fishes', 'piranha', 'shark', 'catfish', 'eel', 'whale', 'pufferfish', 'guppy', 'seahorse', 'sardine', 'tuna', 'salmon', 'cod', 'bass', 'swordfish', 'marlin', 'anglerfish', 'stingray', 'koi', 'goldfish', 'minnow', 'trout', 'mackerel', 'grouper', 'snapper', 'parrotfish', 'megalodon', 'barracuda', 'reef', 'guppy'], scale: S.aquaticfish.scale, weapon: 0, create: make });
    reg('octopus',     { aliases: ['octopus', 'octopi', 'squid', 'kraken'], scale: S.octopus.scale, weapon: 0, create: make });
    reg('aqu_bubblesquid',       { aliases: ['aqu_bubblesquid'],       scale: S.aqu_bubblesquid.scale,       weapon: 0, create: make });
    reg('aqu_bubblesquidsecond', { aliases: ['aqu_bubblesquidsecond'], scale: S.aqu_bubblesquidsecond.scale, weapon: 0, create: make });
    reg('frog',        { aliases: ['frog', 'frogs', 'toad', 'toads'], scale: S.frog.scale, weapon: 0, create: make });
    reg('amphibian',   { aliases: ['amphibian', 'salamander', 'newt', 'axolotl'], scale: S.amphibian.scale, weapon: 0, create: make });
    reg('turtle',      { aliases: ['turtle', 'turtles', 'tortoise'], scale: S.turtle.scale, weapon: 0, create: make });
    reg('snail',       { aliases: ['snail', 'snails', 'slug'], scale: S.snail.scale, weapon: 0, create: make });
    reg('serpent',     { aliases: ['serpent', 'serpents', 'snake', 'snakes', 'cobra', 'viper'], scale: S.serpent.scale, weapon: 0, create: make });
    reg('segmentworm', { aliases: ['segmentworm', 'worm', 'worms', 'grub', 'maggot'], scale: S.segmentworm.scale, weapon: 0, create: make });
    reg('crustacean',  { aliases: ['crustacean', 'crab', 'crabs', 'lobster', 'shrimp'], scale: S.crustacean.scale, weapon: 0, create: make });
    reg('coralwarcaster',    { aliases: ['coralwarcaster'],    scale: S.coralwarcaster.scale,    weapon: 0, create: make });
    reg('crystalcarapace',   { aliases: ['crystalcarapace'],   scale: S.crystalcarapace.scale,   weapon: 0, create: make });
    reg('gildedzapback',     { aliases: ['gildedzapback'],     scale: S.gildedzapback.scale,     weapon: 0, create: make });
    reg('krakenleviathan',   { aliases: ['krakenleviathan'],   scale: S.krakenleviathan.scale,   weapon: 0, create: make });
    reg('krakenspawn',       { aliases: ['krakenspawn'],       scale: S.krakenspawn.scale,       weapon: 0, create: make });
    reg('luminousjellyfish', { aliases: ['luminousjellyfish'], scale: S.luminousjellyfish.scale, weapon: 0, create: make });
    reg('paralyticslug',     { aliases: ['paralyticslug'],     scale: S.paralyticslug.scale,     weapon: 0, create: make });
    reg('sacredkraken',      { aliases: ['sacredkraken'],      scale: S.sacredkraken.scale,      weapon: 0, create: make });
    reg('seaturtle',         { aliases: ['seaturtle'],         scale: S.seaturtle.scale,         weapon: 0, create: make });
    reg('shadowtortoise',    { aliases: ['shadowtortoise'],    scale: S.shadowtortoise.scale,    weapon: 0, create: make });
    reg('skullcrusherbrute', { aliases: ['skullcrusherbrute'], scale: S.skullcrusherbrute.scale, weapon: 0, create: make });
    reg('volcanicshark',     { aliases: ['volcanicshark'],     scale: S.volcanicshark.scale,     weapon: 0, create: make });
    reg('windleviathan',     { aliases: ['windleviathan'],     scale: S.windleviathan.scale,     weapon: 0, create: make });
    reg('abyssalleviathan',  { aliases: ['abyssalleviathan', 'leviathan'],  scale: S.abyssalleviathan.scale,  weapon: 0, create: make }); // 'leviathan' alias inherited from the deduped Exotic.js registration
    reg('mindflayer',        { aliases: ['mindflayer', 'illithid'], scale: S.mindflayer.scale,    weapon: 0, create: make });
    reg('shellbreakerbulwark', { aliases: ['shellbreakerbulwark'], scale: S.shellbreakerbulwark.scale, weapon: 0, create: make });
    reg('galeshelltortoise',   { aliases: ['galeshelltortoise'],   scale: S.galeshelltortoise.scale,   weapon: 0, create: make });
    reg('nightcursetortoise',  { aliases: ['nightcursetortoise'],  scale: S.nightcursetortoise.scale,  weapon: 0, create: make });
    reg('dawnshelltortoise',     { aliases: ['dawnshelltortoise'],     scale: S.dawnshelltortoise.scale,     weapon: 0, create: make });
    reg('pyroshelltortoise',     { aliases: ['pyroshelltortoise'],     scale: S.pyroshelltortoise.scale,     weapon: 0, create: make });
    reg('stormshelltortoise',    { aliases: ['stormshelltortoise'],    scale: S.stormshelltortoise.scale,    weapon: 0, create: make });
    reg('tidalcarapacetortoise', { aliases: ['tidalcarapacetortoise'], scale: S.tidalcarapacetortoise.scale, weapon: 0, create: make });
    reg('griefcollector',        { aliases: ['griefcollector'],        scale: S.griefcollector.scale,        weapon: 0, create: make });
    reg('noneuclideancrab',      { aliases: ['noneuclideancrab'],      scale: S.noneuclideancrab.scale,      weapon: 0, create: make });
    reg('terraclawtortoise',      { aliases: ['terraclawtortoise'],      scale: S.terraclawtortoise.scale,      weapon: 0, create: make });
    reg('horseshoecrab',          { aliases: ['horseshoecrab'],          scale: S.horseshoecrab.scale,          weapon: 0, create: make });
    reg('armoredrexlord',         { aliases: ['armoredrexlord'],         scale: S.armoredrexlord.scale,         weapon: 0, create: make });
    reg('steelshelltortoise',     { aliases: ['steelshelltortoise'],     scale: S.steelshelltortoise.scale,     weapon: 0, create: make });
    reg('primordialdragonturtle', { aliases: ['primordialdragonturtle'], scale: S.primordialdragonturtle.scale, weapon: 0, create: make });
    reg('lv_moonjellyling',       { aliases: ['lv_moonjellyling'],       scale: S.lv_moonjellyling.scale,       weapon: 0, create: make });
    reg('lv_voidjellyling',       { aliases: ['lv_voidjellyling'],       scale: S.lv_voidjellyling.scale,       weapon: 0, create: make });
    reg('lv_tidepooloctopus',     { aliases: ['lv_tidepooloctopus'],     scale: S.lv_tidepooloctopus.scale,     weapon: 0, create: make });
    reg('lv_templetortoise',      { aliases: ['lv_templetortoise'],      scale: S.lv_templetortoise.scale,      weapon: 0, create: make });

    const NAMED = {
        paralyticslug:     ["Paralytic Slug"],
        sacredkraken:      ["Sacred Kraken"],
        seaturtle:         ["Sea Turtle"],
        shadowtortoise:    ["Shadow Tortoise"],
        skullcrusherbrute: ["Skullcrusher Brute"],
        volcanicshark:     ["Volcanic Shark"],
        coralwarcaster:    ["Coralic Warcaster"],
        crystalcarapace:   ["CrystalCarapace Sentinel"],
        gildedzapback:     ["Gilded Zapback"],
        krakenleviathan:   ["Kraken Leviathan"],
        krakenspawn:       ["Kraken Spawn"],
        luminousjellyfish: ["Luminous Jellyfish"],
        windleviathan:     ["Wind Leviathan"],
        abyssalleviathan:  ["Abyssal Leviathan"],
        mindflayer:        ["Mind Flayer"],
        shellbreakerbulwark: ["Shellbreaker Bulwark"],
        galeshelltortoise:   ["Galeshell Tortoise"],
        nightcursetortoise:  ["Nightcurse Tortoise"],
        dawnshelltortoise:     ["Dawnshell Tortoise"],
        pyroshelltortoise:     ["Pyroshell Tortoise"],
        stormshelltortoise:    ["Stormshell Tortoise"],
        tidalcarapacetortoise: ["Tidalcarapace Tortoise"],
        griefcollector:        ["Grief Collector"],
        noneuclideancrab:      ["Non-Euclidean Crab"],
        terraclawtortoise:      ["Terraclaw Tortoise"],
        horseshoecrab:          ["Horseshoe Crab"],
        armoredrexlord:         ["Armored Rex Lord"],
        steelshelltortoise:     ["Steelshell Tortoise"],
        primordialdragonturtle: ["Primordial Dragon Turtle"],
        lv_moonjellyling:       ["Moon Jellyling"],
        lv_voidjellyling:       ["Void Jellyling"],
        lv_tidepooloctopus:     ["Tidepool Octopus"],
        lv_templetortoise:      ["Temple Tortoise"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    // Repin the Bubble Squid names off the shared octopus rig. These names are
    // also assigned to octopus in 3DBattler_Bosses.js, which loads AFTER this
    // file; defer so our per-enemy squid models win the exact-name lookup.
    const NAMED_LATE = {
        aqu_bubblesquid:       ["Bubble Squid"],
        aqu_bubblesquidsecond: ["Bubble Squid Second"]
    };
    if (window.Battler3D.registerNamed) {
        setTimeout(() => {
            for (const key in NAMED_LATE) NAMED_LATE[key].forEach(n => window.Battler3D.registerNamed(n, key));
        }, 0);
    }

    debugLog('Aquatic family registered');

    ;[['u_maelstromleviathan',3.4],['u_megalodonprime',3.4]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
