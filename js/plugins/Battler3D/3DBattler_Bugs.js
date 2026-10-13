//=============================================================================
// 3D Battler System - Bug Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke insectoid one-off models (disco beetle, ladybug,
 * grasshopper, acid ant, draconic dragonfly, buzzing bumblebee, blood mosquito)
 * + name-based assignment. Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Bug Uniques
 * ============================================================================
 *
 * Distinct procedural insects shaped from each enemy's flavour text, assigned by
 * exact name (override with <Battler3D: key>). They map the Insectoid archetype
 * body-part keys (HEAD/THORAX/ABDOMEN/MANDIBLES + the six leg keys) so
 * dismemberment + hit-flash work, and reuse the base per-id variation + gestures.
 *
 * Registered: discobeetle, ladybug, grasshopper, acidant, dragonfly,
 *             bumblebee, bloodmosquito
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Bugs] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const B_PROFILES = {
        discobeetle:   { variant: 'discobeetle',   scale: 1.8, texturePool: 'metal',   bodyColor: 0x24242c, accent: 0xff44cc, hue: [0.80, 0.20], sat: [0.20, 0.10], lit: [0.30, 0.10] },
        ladybug:       { variant: 'ladybug',       scale: 1.6, texturePool: 'fire',    bodyColor: 0xcc2222, accent: 0x111111, hue: [0.01, 0.03], sat: [0.70, 0.10], lit: [0.45, 0.08] },
        grasshopper:   { variant: 'grasshopper',   scale: 1.9, texturePool: 'foliage', bodyColor: 0x6aaa3a, accent: 0x223311, hue: [0.28, 0.06], sat: [0.50, 0.12], lit: [0.45, 0.10] },
        acidant:       { variant: 'acidant',       scale: 1.8, texturePool: 'wood',    bodyColor: 0x3a2a1a, accent: 0x9bff44, hue: [0.08, 0.04], sat: [0.45, 0.12], lit: [0.30, 0.08] },
        dragonfly:     { variant: 'dragonfly',     scale: 1.9, texturePool: 'crystal', bodyColor: 0x2a8a7a, accent: 0x66ddff, hue: [0.48, 0.10], sat: [0.45, 0.15], lit: [0.45, 0.10] },
        bumblebee:     { variant: 'bumblebee',     scale: 1.7, texturePool: 'fur',     bodyColor: 0xf0c020, accent: 0x111111, hue: [0.13, 0.03], sat: [0.75, 0.10], lit: [0.52, 0.08] },
        bloodmosquito: { variant: 'bloodmosquito', scale: 1.7, texturePool: 'flesh',   bodyColor: 0x5a1a1a, accent: 0xcc2233, hue: [0.99, 0.04], sat: [0.55, 0.12], lit: [0.32, 0.08] },
        crawlinghand:    { variant: 'crawlinghand',    scale: 1.7, texturePool: 'flesh',   bodyColor: 0xdee6ad, accent: 0x885a33, hue: [0.05, 0.03], sat: [0.30, 0.10], lit: [0.62, 0.08], front: true },
        engorgedtick:    { variant: 'engorgedtick',    scale: 1.8, texturePool: 'flesh',   bodyColor: 0x7a1414, accent: 0xaa2a2a, hue: [0.99, 0.03], sat: [0.70, 0.12], lit: [0.30, 0.08] },
        firecentipede:   { variant: 'firecentipede',   scale: 2.0, texturePool: 'fire',    bodyColor: 0x301008, accent: 0xff6a18, hue: [0.05, 0.04], sat: [0.85, 0.10], lit: [0.30, 0.10] },
        frostscarab:     { variant: 'frostscarab',     scale: 1.8, texturePool: 'crystal', bodyColor: 0x9fc8e6, accent: 0xddf4ff, hue: [0.56, 0.06], sat: [0.35, 0.12], lit: [0.62, 0.08] },
        gloomwurm:       { variant: 'gloomwurm',       scale: 2.2, texturePool: 'flesh',   bodyColor: 0x2a2230, accent: 0x6a3a8a, hue: [0.78, 0.06], sat: [0.30, 0.12], lit: [0.22, 0.08] },
        gutturalmaggotus:{ variant: 'gutturalmaggotus',scale: 2.0, texturePool: 'flesh',   bodyColor: 0xe9dcc0, accent: 0xbcd84a, hue: [0.14, 0.05], sat: [0.30, 0.12], lit: [0.60, 0.08] },
        hivemindtermite:   { variant: 'hivemindtermite',   scale: 1.8, texturePool: 'wood',    bodyColor: 0xe7dcc2, accent: 0xc8a85a, hue: [0.10, 0.04], sat: [0.25, 0.10], lit: [0.62, 0.08] },
        junglestalker:     { variant: 'junglestalker',     scale: 2.0, texturePool: 'foliage', bodyColor: 0x3c7a22, accent: 0xb6ff3a, hue: [0.27, 0.06], sat: [0.60, 0.12], lit: [0.34, 0.10] },
        luminouslocustking:{ variant: 'luminouslocustking',scale: 2.0, texturePool: 'crystal', bodyColor: 0x4a9a3a, accent: 0xfff070, hue: [0.20, 0.08], sat: [0.55, 0.12], lit: [0.45, 0.10] },
        magmacentipede:    { variant: 'magmacentipede',    scale: 2.1, texturePool: 'fire',    bodyColor: 0x18120f, accent: 0xff5a12, hue: [0.05, 0.04], sat: [0.85, 0.10], lit: [0.20, 0.10] },
        mothshadestalker:  { variant: 'mothshadestalker',  scale: 1.9, texturePool: 'fur',     bodyColor: 0x554a55, accent: 0xc8a0e0, hue: [0.78, 0.06], sat: [0.25, 0.10], lit: [0.40, 0.08] },
        swampscorpion:     { variant: 'swampscorpion',     scale: 1.9, texturePool: 'foliage', bodyColor: 0x4a5a2a, accent: 0x9bd84a, hue: [0.22, 0.05], sat: [0.45, 0.12], lit: [0.30, 0.08] },
        toxicghost:        { variant: 'toxicghost',        scale: 1.9, texturePool: 'flesh',   bodyColor: 0x6aa83a, accent: 0xcaff44, hue: [0.26, 0.05], sat: [0.55, 0.12], lit: [0.42, 0.08] },
        venomousdragonfly: { variant: 'venomousdragonfly', scale: 2.0, texturePool: 'crystal', bodyColor: 0x4a8a3a, accent: 0xb4ff3a, hue: [0.30, 0.10], sat: [0.55, 0.15], lit: [0.45, 0.10] },
        chromatictick:     { variant: 'chromatictick',     scale: 1.7, texturePool: 'metal',   bodyColor: 0x222230, accent: 0x40ffd0, hue: [0.50, 0.40], sat: [0.70, 0.20], lit: [0.40, 0.12] },
        mindflayermoth:    { variant: 'mindflayermoth',    scale: 2.1, texturePool: 'fur',     bodyColor: 0x5a3a8a, accent: 0xff44dd, hue: [0.76, 0.20], sat: [0.55, 0.20], lit: [0.45, 0.12], front: true },
        emotionalleech:    { variant: 'emotionalleech',    scale: 1.8, texturePool: 'flesh',   bodyColor: 0xe87aa0, accent: 0xff4d88, hue: [0.94, 0.05], sat: [0.50, 0.12], lit: [0.58, 0.10] },
        memoryleech:       { variant: 'memoryleech',       scale: 1.8, texturePool: 'flesh',   bodyColor: 0x6a7a92, accent: 0xaecade, hue: [0.58, 0.05], sat: [0.25, 0.10], lit: [0.50, 0.10] },
        thoughtparasite:        { variant: 'thoughtparasite',        scale: 1.7, texturePool: 'crystal', bodyColor: 0xb8c8e0, accent: 0xa0d8ff, hue: [0.58, 0.06], sat: [0.20, 0.10], lit: [0.62, 0.10] },
        emberbackhellscorpion:  { variant: 'emberbackhellscorpion',  scale: 2.0, texturePool: 'fire',    bodyColor: 0x141014, accent: 0xff5a14, hue: [0.04, 0.04], sat: [0.85, 0.10], lit: [0.16, 0.08] },
        gravityworm:            { variant: 'gravityworm',            scale: 2.2, texturePool: 'crystal', bodyColor: 0x14121c, accent: 0x6a3aff, hue: [0.72, 0.06], sat: [0.40, 0.12], lit: [0.16, 0.08] },
        temporalhornet:         { variant: 'temporalhornet',         scale: 1.8, texturePool: 'metal',   bodyColor: 0xf0c020, accent: 0x88e0ff, hue: [0.13, 0.04], sat: [0.75, 0.10], lit: [0.52, 0.08] },
        // Level 1-5 roster, each on a build of its own.
        lv_dungbeetle:        { variant: 'lv_dungbeetle', scale: 1.5, texturePool: 'metal', bodyColor: 0x2a2018, accent: 0x8a5a2a, hue: [0.07, 0.04], sat: [0.35, 0.10], lit: [0.18, 0.06] },
        lv_gardenpillbug:     { variant: 'lv_gardenpillbug', scale: 1.3, texturePool: 'stone', bodyColor: 0x6a6e74, accent: 0xe8d27a, hue: [0.58, 0.06], sat: [0.08, 0.08], lit: [0.40, 0.08] },
        lv_picnicgnat:        { variant: 'lv_picnicgnat', scale: 1.2, texturePool: 'void', bodyColor: 0x2a2a20, accent: 0xcc3355, hue: [0.15, 0.06], sat: [0.20, 0.10], lit: [0.18, 0.06] },
        lv_hearthcricket:     { variant: 'lv_hearthcricket', scale: 1.4, texturePool: 'wood', bodyColor: 0x4a3020, accent: 0xff7a22, hue: [0.07, 0.03], sat: [0.45, 0.10], lit: [0.22, 0.06] },
        lv_redfireant:        { variant: 'lv_redfireant', scale: 1.4, texturePool: 'fire', bodyColor: 0xa8301c, accent: 0xffd040, hue: [0.02, 0.03], sat: [0.70, 0.10], lit: [0.38, 0.08] },
        lv_meadowfirefly:     { variant: 'lv_meadowfirefly', scale: 1.4, texturePool: 'wood', bodyColor: 0x3a2c22, accent: 0xd8ff5a, hue: [0.08, 0.04], sat: [0.35, 0.10], lit: [0.22, 0.06] },
        lv_ponddamselfly:     { variant: 'lv_ponddamselfly', scale: 1.5, texturePool: 'crystal', bodyColor: 0x2a6aa8, accent: 0x7ad8ff, hue: [0.57, 0.06], sat: [0.60, 0.10], lit: [0.42, 0.08] },
        lv_lampmoth:          { variant: 'lv_lampmoth', scale: 1.5, texturePool: 'fur', bodyColor: 0x8a8478, accent: 0xffc84a, hue: [0.10, 0.04], sat: [0.12, 0.06], lit: [0.50, 0.08] },
        lv_lostglove:         { variant: 'lv_lostglove', scale: 1.5, texturePool: 'fur', bodyColor: 0x9a3a3a, accent: 0x2a2a3a, hue: [0.98, 0.06], sat: [0.50, 0.15], lit: [0.38, 0.08] },
        lv_paperwasp:         { variant: 'lv_paperwasp', scale: 1.5, texturePool: 'wood', bodyColor: 0x3a2a14, accent: 0xf0c030, hue: [0.10, 0.03], sat: [0.55, 0.10], lit: [0.25, 0.06] },
        lv_stablehorsefly:    { variant: 'lv_stablehorsefly', scale: 1.5, texturePool: 'flesh', bodyColor: 0x4a4440, accent: 0x5aff9a, hue: [0.08, 0.05], sat: [0.15, 0.08], lit: [0.30, 0.06] },
        lv_locustnymph:       { variant: 'lv_locustnymph', scale: 1.4, texturePool: 'foliage', bodyColor: 0x8aa83a, accent: 0x1a1a10, hue: [0.20, 0.06], sat: [0.55, 0.10], lit: [0.45, 0.08] },
        lv_dreammoth:         { variant: 'lv_dreammoth', scale: 1.4, texturePool: 'fur', bodyColor: 0xb89ad8, accent: 0xfff2a8, hue: [0.76, 0.05], sat: [0.35, 0.10], lit: [0.66, 0.06] },
        lv_rustbeetle:        { variant: 'lv_rustbeetle', scale: 1.4, texturePool: 'metal', bodyColor: 0xa8501c, accent: 0x5a5a60, hue: [0.05, 0.03], sat: [0.60, 0.10], lit: [0.36, 0.06] },
        lv_noodleworm:        { variant: 'lv_noodleworm', scale: 1.5, texturePool: 'flesh', bodyColor: 0xf0dcae, accent: 0xd84a2a, hue: [0.12, 0.03], sat: [0.50, 0.10], lit: [0.78, 0.06] },
        lv_syringemosquito:   { variant: 'lv_syringemosquito', scale: 1.4, texturePool: 'metal', bodyColor: 0x3a3a42, accent: 0xd01a2a, hue: [0.65, 0.05], sat: [0.10, 0.06], lit: [0.25, 0.06] },
        lv_pillbeetle:        { variant: 'lv_pillbeetle', scale: 1.3, texturePool: 'crystal', bodyColor: 0xd02a3a, accent: 0xf4f0e6, hue: [0.98, 0.04], sat: [0.70, 0.10], lit: [0.46, 0.06] },
        lv_mannequinhand:     { variant: 'lv_mannequinhand', scale: 1.5, texturePool: 'pale', bodyColor: 0xe8d8c8, accent: 0xc81a2a, hue: [0.07, 0.03], sat: [0.20, 0.08], lit: [0.82, 0.06] },
        lv_kitchenroach:      { variant: 'lv_kitchenroach', scale: 1.4, texturePool: 'wood', bodyColor: 0x5a2a12, accent: 0xd8b070, hue: [0.06, 0.03], sat: [0.60, 0.10], lit: [0.24, 0.06] },
        lv_implanttick:       { variant: 'lv_implanttick', scale: 1.5, texturePool: 'metal', bodyColor: 0x7a8088, accent: 0x3aff6a, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.48, 0.08] },
        lv_quartztick:        { variant: 'lv_quartztick', scale: 1.4, texturePool: 'crystal', bodyColor: 0xe8a0c0, accent: 0x6a3a5a, hue: [0.92, 0.04], sat: [0.50, 0.10], lit: [0.72, 0.06] },
        lv_gladiatorcricket:  { variant: 'lv_gladiatorcricket', scale: 1.6, texturePool: 'metal', bodyColor: 0x6a4a1c, accent: 0xc81a1a, hue: [0.10, 0.03], sat: [0.50, 0.10], lit: [0.34, 0.06] },
        lv_dragontick:        { variant: 'lv_dragontick', scale: 1.6, texturePool: 'fire', bodyColor: 0x6a1a14, accent: 0x5aa838, hue: [0.01, 0.03], sat: [0.60, 0.10], lit: [0.26, 0.06] },
        lv_pondskater:        { variant: 'lv_pondskater', scale: 1.5, texturePool: 'water', bodyColor: 0x3a3024, accent: 0x9ad0e8, hue: [0.08, 0.04], sat: [0.30, 0.10], lit: [0.22, 0.06] }
    };

    class BugBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = B_PROFILES[creatureType] || B_PROFILES.ladybug;
            super(scale, offsetY, battler, profile, 0, creatureType || 'ladybug');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._legs = []; this.legL = []; this.legR = [];
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
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0x111111, 1.0, 0.2));
            eye.position.set(x, y, z);
            const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 8, 8), this._mat(accent || 0xffffff, 1.0, 0.2, accent));
            shine.position.set(0, r * 0.2, r * 0.7); eye.add(shine);
            parent.add(eye); return eye;
        }

        // Standard 2-segment insect leg.
        _bugLeg(side, z, y, mat) {
            const g = new THREE.Group();
            const u = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.34, 4), mat); u.position.set(side * 0.16, -0.04, 0); u.rotation.z = side * 1.0; g.add(u);
            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.32, 4), mat); l.position.set(side * 0.34, -0.26, 0); l.rotation.z = side * 0.2; g.add(l);
            g.position.set(0, y, z); g._side = side; this.bodyGroup.add(g); this._legs.push(g); return g;
        }
        // Build the 6 legs + wire the archetype part-keys/cascade.
        _wireBug(o) {
            const mat = o.mat, ys = o.legY;
            // A builder with its own jointed legs hands them in (front to back).
            if (o.legsL) { this.legL = o.legsL.slice(); this.legR = o.legsR.slice(); }
            else (o.legZs || [0.25, 0.0, -0.25]).forEach(z => { this.legL.push(this._bugLeg(-1, z, ys, mat)); this.legR.push(this._bugLeg(1, z, ys, mat)); });
            const mand = o.mandibles || null;
            this._partMeshMap = { HEAD: o.head, THORAX: o.thorax, ABDOMEN: o.abdomen };
            if (mand) this._partMeshMap.MANDIBLES = mand;
            const lk = ['LEFT_LEG', 'MIDDLE_LEFT_LEG', 'REAR_LEFT_LEG'], rk = ['RIGHT_LEG', 'MIDDLE_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            this.legL.forEach((l, i) => { this._partMeshMap[lk[i]] = l; });
            this.legR.forEach((l, i) => { this._partMeshMap[rk[i]] = l; });
            const extra = (o.extra || []).filter(Boolean);
            this._cascadeRules = [
                { gone: ['THORAX'], hide: [o.thorax, o.head, mand, ...extra, ...this._legs].filter(Boolean) },
                { gone: ['ABDOMEN'], hide: [o.abdomen, ...extra].filter(Boolean) },
                { gone: ['HEAD'], hide: [o.head] },
                mand ? { gone: ['MANDIBLES'], hide: [mand] } : null,
                ...lk.concat(rk).map(k => ({ gone: [k], hide: [this._partMeshMap[k]] }))
            ].filter(Boolean);
        }
        // Two stalks rising from the brow, each tip bead sat on its stalk's end.
        _antennae(head, mat, accent) {
            const tipMat = this._mat(accent, 1.0, 0.3, accent);
            for (const s of [-1, 1]) {
                const base = new THREE.Vector3(s * 0.06, 0.1, 0.08), tip = new THREE.Vector3(s * 0.12, 0.36, 0.16);
                this.addStrut(head, mat, base, tip, 0.012, 0.009, 4);
                const bead = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), tipMat); bead.position.copy(tip); head.add(bead);
            }
        }

        // A tapered rod from a to b (parent space), thin end at b.
        _rod(parent, mat, a, b, r0, r1, sides) {
            return this.addStrut(parent, mat, new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2]), r0, r1, sides || 4);
        }

        // A jointed leg whose Group sits at the hip, so the scuttle (rotation.x)
        // swings it about the joint. pts are hip-relative [knee, foot] or
        // [knee, ankle, foot] for the right side; the left is mirrored in x.
        _jointLeg(side, hip, pts, mat, r, jointMat) {
            const g = new THREE.Group();
            let prev = [0, 0, 0];
            pts.forEach((p, i) => {
                const q = [side * p[0], p[1], p[2]];
                const t = 1 - i / pts.length;
                this._rod(g, mat, prev, q, r * (0.6 + 0.4 * t), r * (0.45 + 0.4 * t), 4);
                if (i < pts.length - 1) { const k = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 5, 4), jointMat || mat); k.position.set(q[0], q[1], q[2]); g.add(k); }
                prev = q;
            });
            g.position.set(side * hip[0], hip[1], hip[2]); g._side = side;
            this.bodyGroup.add(g); this._legs.push(g);
            return g;
        }

        // A wing hinged at the thorax: the Group sits on the wing root and the
        // membrane lies outward from it, so the flap (rotation.z, about the
        // body's long axis) swings the tip and never lifts the root off the
        // body. sweep yaws the blade back, lift is the resting dihedral.
        _hingeWing(side, x, y, z, o) {
            const g = new THREE.Group();
            const blade = new THREE.Group(); blade.rotation.y = side * (o.sweep || 0); g.add(blade);
            let m;
            if (o.shape) {
                // An outline drawn root-outward: [out, back] pairs in units of len / width.
                const sh = new THREE.Shape();
                o.shape.forEach((q, i) => { if (i) sh.lineTo(q[0] * o.len, q[1] * o.width); else sh.moveTo(q[0] * o.len, q[1] * o.width); });
                m = new THREE.Mesh(new THREE.ShapeGeometry(sh), o.mat); m.scale.set(side, 1, 1);
            } else {
                m = new THREE.Mesh(new THREE.CircleGeometry(0.5, o.seg || 10), o.mat);
                m.scale.set(o.len, o.width, 1); m.position.x = side * o.len * 0.47;
            }
            m.rotation.x = -Math.PI / 2; blade.add(m);
            if (o.veins) for (let v = 0; v < (o.veinCount || 2); v++) {
                const off = (v - ((o.veinCount || 2) - 1) / 2) * o.width * 0.28;
                this._rod(blade, o.veins, [0, 0.004, off * 0.3], [side * o.len * 0.88, 0.004, off], 0.008, 0.004, 3);
            }
            g.position.set(side * Math.abs(x), y, z); g.rotation.z = side * (o.lift || 0);
            g._side = side; g._blade = blade; g._lift = o.lift || 0; g._amp = o.amp === undefined ? 0.45 : o.amp;
            g._rate = o.rate || 28; g._rateFast = o.rateFast || (g._rate * 1.4); g._phase = o.phase || 0;
            if (!this.wings) { this.wings = new THREE.Group(); this.bodyGroup.add(this.wings); }
            this.wings.add(g); (this._wingHinges = this._wingHinges || []).push(g);
            return g;
        }
        _wingPair(x, y, z, o) { return [this._hingeWing(-1, x, y, z, o), this._hingeWing(1, x, y, z, o)]; }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'discobeetle':   this._buildDiscoBeetle(); break;
                case 'grasshopper':   this._buildGrasshopper(); break;
                case 'acidant':       this._buildAcidAnt(); break;
                case 'dragonfly':     this._buildDragonfly(); break;
                case 'bumblebee':     this._buildBumblebee(); break;
                case 'bloodmosquito': this._buildMosquito(); break;
                case 'crawlinghand':  this._buildCrawlingHand(); break;
                case 'engorgedtick':  this._buildEngorgedTick(); break;
                case 'firecentipede': this._buildFireCentipede(); break;
                case 'frostscarab':   this._buildFrostScarab(); break;
                case 'gloomwurm':     this._buildGloomwurm(); break;
                case 'gutturalmaggotus': this._buildGutturalMaggotus(); break;
                case 'hivemindtermite':  this._buildHivemindTermite(); break;
                case 'junglestalker':    this._buildJungleStalker(); break;
                case 'luminouslocustking': this._buildLocustKing(); break;
                case 'magmacentipede':   this._buildMagmaCentipede(); break;
                case 'mothshadestalker': this._buildMothshadeStalker(); break;
                case 'swampscorpion':    this._buildSwampScorpion(); break;
                case 'toxicghost':       this._buildToxicGhost(); break;
                case 'venomousdragonfly':this._buildVenomousDragonfly(); break;
                case 'chromatictick':    this._buildChromaticTick(); break;
                case 'mindflayermoth':   this._buildMindFlayerMoth(); break;
                case 'emotionalleech':   this._buildEmotionalLeech(); break;
                case 'memoryleech':      this._buildMemoryLeech(); break;
                case 'thoughtparasite':       this._buildThoughtParasite(); break;
                case 'emberbackhellscorpion': this._buildEmberbackHellscorpion(); break;
                case 'gravityworm':           this._buildGravityWorm(); break;
                case 'temporalhornet':        this._buildTemporalHornet(); break;
                case 'lv_dungbeetle':          this._buildLvDungBeetle(); break;
                case 'lv_gardenpillbug':       this._buildLvGardenPillbug(); break;
                case 'lv_picnicgnat':          this._buildLvPicnicGnat(); break;
                case 'lv_hearthcricket':       this._buildLvHearthCricket(); break;
                case 'lv_redfireant':          this._buildLvRedFireAnt(); break;
                case 'lv_meadowfirefly':       this._buildLvMeadowFirefly(); break;
                case 'lv_ponddamselfly':       this._buildLvPondDamselfly(); break;
                case 'lv_lampmoth':            this._buildLvLampMoth(); break;
                case 'lv_lostglove':           this._buildLvLostGlove(); break;
                case 'lv_paperwasp':           this._buildLvPaperWasp(); break;
                case 'lv_stablehorsefly':      this._buildLvStableHorsefly(); break;
                case 'lv_locustnymph':         this._buildLvLocustNymph(); break;
                case 'lv_dreammoth':           this._buildLvDreamMoth(); break;
                case 'lv_rustbeetle':          this._buildLvRustBeetle(); break;
                case 'lv_noodleworm':          this._buildLvNoodleWorm(); break;
                case 'lv_syringemosquito':     this._buildLvSyringeMosquito(); break;
                case 'lv_pillbeetle':          this._buildLvPillBeetle(); break;
                case 'lv_mannequinhand':       this._buildLvMannequinHand(); break;
                case 'lv_kitchenroach':        this._buildLvKitchenRoach(); break;
                case 'lv_implanttick':         this._buildLvImplantTick(); break;
                case 'lv_quartztick':          this._buildLvQuartzTick(); break;
                case 'lv_gladiatorcricket':    this._buildLvGladiatorCricket(); break;
                case 'lv_dragontick':          this._buildLvDragonTick(); break;
                case 'lv_pondskater':          this._buildLvPondSkater(); break;
                default:              this._buildLadybug(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Disco Beetle: a mirrored disco-ball carapace, ALL funk ───────────
        _buildDiscoBeetle() {
            const p = this.profile;
            const bodyMat = this._mat(0x1c1c22, 1.0, 0.4);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bodyMat); this.thorax.position.set(0, 0.95, 0.0); this.thorax.scale.set(1, 0.9, 1.1); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 14), bodyMat); this.abdomen.position.set(0, 1.0, -0.45); this.abdomen.scale.set(1.1, 1.0, 1.3); this.bodyGroup.add(this.abdomen);
            // Mirror-tile disco ball over the abdomen dome.
            this._discoMats = [];
            this.carapace = new THREE.Group();
            const tileGeo = new THREE.BoxGeometry(0.12, 0.12, 0.025);
            const cx0 = 0, cy0 = 1.0, cz0 = -0.45;
            for (let i = 0; i < 24; i++) {
                const theta = this.idRand() * Math.PI * 2, phi = Math.acos(this.idRand()) * 0.95;
                const x = Math.sin(phi) * Math.cos(theta) * 0.55, y = Math.cos(phi) * 0.5, z = Math.sin(phi) * Math.sin(theta) * 0.65;
                const m = this._mat(0xffffff, 1.0, 0.12, 0x222222); this._discoMats.push(m);
                const tile = new THREE.Mesh(tileGeo, m);
                tile.position.set(cx0 + x, cy0 + y, cz0 + z);
                tile.lookAt(cx0 + x * 2, cy0 + y * 2, cz0 + z * 2);
                this.carapace.add(tile);
            }
            this.bodyGroup.add(this.carapace);
            // Head + glowing antennae.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), bodyMat); this.head.add(h);
            this._eye(this.head, -0.11, 0.04, 0.14, 0.07, p.accent); this._eye(this.head, 0.11, 0.04, 0.14, 0.07, p.accent);
            this._antennae(this.head, bodyMat, p.accent);
            this.head.position.set(0, 1.0, 0.35); this.bodyGroup.add(this.head);
            // Funky light rays beaming out of the ball.
            this.rays = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const ray = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.8, 4), this._mat(0xffffff, 0.32, 0.3, 0xffffff));
                ray.position.set(Math.cos(a) * 0.55, 1.5, Math.sin(a) * 0.35 - 0.45);
                ray.rotation.z = Math.PI / 2 - a; ray.rotation.x = Math.sin(a) * 0.6; ray._a = a;
                this.rays.add(ray);
            }
            this.bodyGroup.add(this.rays);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.carapace, this.rays], legY: 0.92, mat: bodyMat });
        }

        // ── Ladybug: red domed elytra with black spots, opens to fly ─────────
        _buildLadybug() {
            const p = this.profile;
            const red = this._skinMat(p.bodyColor, 0.4);
            const black = this._mat(0x141414, 1.0, 0.5);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), black); this.thorax.position.set(0, 0.85, 0.32); this.thorax.scale.set(1.2, 0.7, 0.9); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), black); this.abdomen.position.set(0, 0.78, -0.15); this.abdomen.scale.set(1.05, 1.0, 1.25); this.bodyGroup.add(this.abdomen);
            // Elytra halves (the two red wing-cases) split down the middle.
            this.leftWing = this._elytron(-1, red, black); this.rightWing = this._elytron(1, red, black);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), black); h.scale.set(1.2, 0.8, 0.9); this.head.add(h);
            this._eye(this.head, -0.1, 0.03, 0.13, 0.06, p.accent); this._eye(this.head, 0.1, 0.03, 0.13, 0.06, p.accent);
            this._antennae(this.head, black, 0x884400);
            this.head.position.set(0, 0.86, 0.56); this.bodyGroup.add(this.head);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.leftWing, this.rightWing], legY: 0.72, mat: black });
        }
        // One wing-case: a quarter ellipsoid covering its own side of the
        // abdomen, hinged on the top midline so it lifts open outward. The
        // spots sit on the shell's own surface and open with it.
        _elytron(side, red, black) {
            const a = 0.506, b = 0.483, c = 0.598;
            const g = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 8, side > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI / 2), red);
            shell.scale.set(a / 0.46, b / 0.46, c / 0.46); shell.position.y = -b; g.add(shell);
            const zAxis = new THREE.Vector3(0, 0, 1);
            for (const [sx, sz] of [[0.24, 0.26], [0.3, -0.02], [0.2, -0.3]]) {
                const x = side * sx, z = sz, h = b * Math.sqrt(Math.max(0, 1 - (x / a) ** 2 - (z / c) ** 2));
                const n = new THREE.Vector3(x / (a * a), h / (b * b), z / (c * c)).normalize();
                const spot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 7), black);
                spot.quaternion.setFromUnitVectors(zAxis, n);
                spot.position.set(x, h - b, z).addScaledVector(n, 0.006); g.add(spot);
            }
            g.position.set(0, 0.78 + b, -0.15); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Grasshopper: long green body with huge sprung hind legs ──────────
        _buildGrasshopper() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.5);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), green); this.thorax.position.set(0, 0.8, 0.2); this.thorax.scale.set(1, 1.1, 1.3); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.95, 10), green); this.abdomen.position.set(0, 0.8, -0.55); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), green); h.scale.set(0.9, 1.2, 1.0); this.head.add(h);
            this._eye(this.head, -0.12, 0.06, 0.1, 0.08, p.accent); this._eye(this.head, 0.12, 0.06, 0.1, 0.08, p.accent);
            this._antennae(this.head, green, 0x335511);
            this.head.position.set(0, 0.86, 0.5); this.bodyGroup.add(this.head);
            // Big sprung hind legs (the iconic part).
            this.hindLeft = this._hopperLeg(-1, green); this.hindRight = this._hopperLeg(1, green);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.hindLeft, this.hindRight], legY: 0.72, legZs: [0.4, 0.2], mat: green });
        }
        _hopperLeg(side, mat) {
            const g = new THREE.Group();
            const thighGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.07, 0.32, 4, 8) : new THREE.CylinderGeometry(0.13, 0.05, 0.42, 6);
            const thigh = new THREE.Mesh(thighGeo, mat);
            thigh.position.set(side * 0.18, 0.05, 0); thigh.rotation.z = side * 0.5; g.add(thigh);
            const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 5), mat); shin.position.set(side * 0.34, -0.2, -0.05); shin.rotation.z = -side * 0.4; g.add(shin);
            g.position.set(0, 0.72, -0.4); g._side = side; this.bodyGroup.add(g); return g;
        }

        // ── Acid Ant: three-segment ant with acid-dripping mandibles ─────────
        _buildAcidAnt() {
            const p = this.profile;
            const chitin = this._skinMat(p.bodyColor, 0.45);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), chitin); h.scale.set(1.1, 1, 0.9); this.head.add(h);
            this._eye(this.head, -0.13, 0.05, 0.14, 0.07, p.accent); this._eye(this.head, 0.13, 0.05, 0.14, 0.07, p.accent);
            this._antennae(this.head, chitin, p.accent);
            this.head.position.set(0, 0.92, 0.55); this.bodyGroup.add(this.head);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), chitin); this.thorax.position.set(0, 0.92, 0.05); this.thorax.scale.set(1, 0.95, 1.2); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), chitin); this.abdomen.position.set(0, 0.95, -0.55); this.abdomen.scale.set(1, 1.05, 1.35); this.bodyGroup.add(this.abdomen);
            // Acid mandibles + drip.
            this.mandibles = new THREE.Group();
            const acid = this._mat(p.accent, 0.95, 0.3, p.accent);
            for (const mx of [-0.1, 0.1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 4), chitin); m.position.set(mx, 0.86, 0.78); m.rotation.x = 1.5; m.rotation.z = -mx * 2; this.mandibles.add(m); }
            this.acidDrop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), acid); this.acidDrop.position.set(0, 0.8, 0.82); this.acidDrop.scale.y = 1.4; this.mandibles.add(this.acidDrop);
            this.bodyGroup.add(this.mandibles);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legY: 0.86, mat: chitin });
        }

        // ── Draconic Dragonfly: long body, four iridescent wings ─────────────
        _buildDragonfly() {
            const p = this.profile;
            const body = this._skinMat(p.bodyColor, 0.4);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), body); this.thorax.position.set(0, 1.05, 0.1); this.thorax.scale.set(1, 1, 1.2); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.04, 1.3, 10), body); this.abdomen.position.set(0, 1.05, -0.75); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0x223344, 1.0, 0.2, p.accent)); eyeL.position.set(-0.12, 0, 0.05); this.head.add(eyeL);
            const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0x223344, 1.0, 0.2, p.accent)); eyeR.position.set(0.12, 0, 0.05); this.head.add(eyeR);
            this.head.position.set(0, 1.05, 0.42); this.bodyGroup.add(this.head);
            // Four veined, iridescent wings hinged on the top of the thorax; the
            // hind pair beats a little behind the fore pair.
            const wingMat = this._mat(p.accent, 0.35, 0.2, p.accent);
            this._wingPair(0.1, 1.2, 0.18, { len: 1.0, width: 0.3, mat: wingMat, sweep: 0.05, lift: 0.08, amp: 0.45, rate: 28, rateFast: 40 });
            this._wingPair(0.1, 1.2, -0.02, { len: 0.95, width: 0.32, mat: wingMat, sweep: 0.22, lift: 0.08, amp: 0.45, rate: 28, rateFast: 40, phase: 1.2 });
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.wings], legY: 0.98, legZs: [0.25, 0.05], mat: body });
        }

        // ── Buzzing Bumblebee: round fuzzy striped body, little wings ────────
        _buildBumblebee() {
            const p = this.profile;
            const fuzz = this._skinMat(p.bodyColor, 0.95);
            const black = this._mat(0x141210, 1.0, 0.8);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), fuzz); this.thorax.position.set(0, 0.95, 0.25); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), fuzz); this.abdomen.position.set(0, 0.95, -0.35); this.abdomen.scale.set(1, 1, 1.25); this.bodyGroup.add(this.abdomen);
            for (let i = 0; i < 2; i++) { const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.06, 8, 16), black); stripe.position.set(0, 0.95, -0.2 - i * 0.3); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1, 1.05, 1); this.bodyGroup.add(stripe); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), black); this.head.add(h);
            this._eye(this.head, -0.1, 0.03, 0.14, 0.06, p.accent); this._eye(this.head, 0.1, 0.03, 0.14, 0.06, p.accent);
            this._antennae(this.head, black, 0x664400);
            this.head.position.set(0, 0.98, 0.58); this.bodyGroup.add(this.head);
            const wingMat = this._mat(0xeef4ff, 0.4, 0.2);
            this._wingPair(0.12, 1.22, 0.2, { len: 0.6, width: 0.3, mat: wingMat, sweep: 0.5, lift: 0.35, amp: 0.5, rate: 32, rateFast: 44 });
            // Stinger on the abdomen tip.
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), black); this.stinger.position.set(0, 0.95, -0.92); this.stinger.rotation.x = -Math.PI / 2; this.bodyGroup.add(this.stinger);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.wings, this.stinger], legY: 0.78, mat: black });
        }

        // ── Blood Mosquito: thin body, long proboscis, blood-filled abdomen ──
        _buildMosquito() {
            const p = this.profile;
            const body = this._skinMat(p.bodyColor, 0.5);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), body); this.thorax.position.set(0, 1.0, 0.1); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), this._mat(p.accent, 0.9, 0.35, 0x440a0a)); this.abdomen.position.set(0, 1.0, -0.52); this.abdomen.scale.set(1, 1, 2.1); this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), body); this.head.add(h);
            this._eye(this.head, -0.08, 0.03, 0.1, 0.06, p.accent); this._eye(this.head, 0.08, 0.03, 0.1, 0.06, p.accent);
            // Long needle proboscis.
            this.proboscis = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.55, 5), this._mat(0x221015, 1.0, 0.4)); this.proboscis.position.set(0, -0.02, 0.32); this.proboscis.rotation.x = Math.PI / 2; this.head.add(this.proboscis);
            this.head.position.set(0, 1.0, 0.42); this.bodyGroup.add(this.head);
            const wingMat = this._mat(0xdfe6ee, 0.35, 0.2);
            this._wingPair(0.08, 1.14, 0.05, { len: 0.8, width: 0.18, mat: wingMat, sweep: 0.6, lift: 0.15, amp: 0.45, rate: 34, rateFast: 46 });
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, extra: [this.wings, this.proboscis], legY: 0.92, mat: body });
        }

        // ── Crawling Hand: severed pale hand walking on its 5 fingers ────────
        _buildCrawlingHand() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.6);
            // Palm (the core / body).
            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.6), flesh);
            this.core.position.set(0, 0.55, 0); this.bodyGroup.add(this.core);
            // Cut wrist stump at the back with raw bone.
            const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.18, 8), this._mat(0x9a2a2a, 1.0, 0.5));
            stump.position.set(0, 0.55, -0.36); stump.rotation.x = Math.PI / 2; this.bodyGroup.add(stump);
            const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), this._mat(0xf0eede, 1.0, 0.5));
            bone.position.set(0, 0.55, -0.44); bone.rotation.x = Math.PI / 2; this.bodyGroup.add(bone);
            // Five fingers acting as legs (4 forward + thumb to the side).
            this._fingers = [];
            const fingerDefs = [[-0.2, 0.34, 0], [-0.07, 0.36, 0], [0.07, 0.36, 0], [0.2, 0.32, 0], [-0.3, 0.05, 1]];
            for (const [fx, fz, thumb] of fingerDefs) {
                const g = new THREE.Group();
                // Knuckle, an arched first joint, then the fingertip down to the floor.
                const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), flesh); g.add(knuckle);
                const mid = thumb ? [-0.14, 0.0, 0.06] : [0, 0.04, 0.18], end = thumb ? [-0.24, -0.4, 0.12] : [0, -0.4, 0.3];
                this._rod(g, flesh, [0, 0, 0], mid, 0.045, 0.04, 6);
                const joint = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), flesh); joint.position.set(mid[0], mid[1], mid[2]); g.add(joint);
                this._rod(g, flesh, mid, end, 0.038, 0.026, 6);
                const nail = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), this._mat(0xd8cbb0, 1.0, 0.4)); nail.position.set(end[0], end[1], end[2]); g.add(nail);
                g.position.set(fx, 0.5, fz); g._thumb = thumb; this.bodyGroup.add(g); this._fingers.push(g); this._legs.push(g);
            }
            // Face on the BACK of the hand.
            this.head = new THREE.Group();
            this._eye(this.head, -0.12, 0.0, 0.0, 0.06, p.accent); this._eye(this.head, 0.12, 0.0, 0.0, 0.06, p.accent);
            const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), this._mat(0x6a1a26, 1.0, 0.5));
            mouth.position.set(0, -0.14, 0.0); mouth.rotation.z = Math.PI; this.head.add(mouth);
            this.head.position.set(0, 0.66, 0.05); this.bodyGroup.add(this.head);
            // Two wisp-tendrils trailing up from the wrist.
            this._wisps = [];
            for (const wx of [-1, 1]) {
                // Rooted on the wrist stump; the group sways about that root.
                const w = new THREE.Group();
                const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.55, 5), this._mat(p.accent, 0.45, 0.3, p.accent)); cone.position.y = 0.26; w.add(cone);
                w.position.set(wx * 0.07, 0.62, -0.36); w.rotation.x = -0.5; w._sx = wx; w._mat = cone.material; this.bodyGroup.add(w); this._wisps.push(w);
            }
            this._partMeshMap = { FACE: this.head, CORE: this.core, LEFT_WISP: this._wisps[0], RIGHT_WISP: this._wisps[1] };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.head, stump, bone, ...this._fingers, ...this._wisps] },
                { gone: ['FACE'], hide: [this.head] },
                { gone: ['LEFT_WISP'], hide: [this._wisps[0]] },
                { gone: ['RIGHT_WISP'], hide: [this._wisps[1]] }
            ];
        }

        // ── Engorged Tick: tiny head, swollen blood-red abdomen, many legs ───
        _buildEngorgedTick() {
            const p = this.profile;
            const chitin = this._mat(0x3a0c0c, 1.0, 0.5);
            const blood = this._skinMat(p.bodyColor, 0.35);
            // Massive bloated abdomen dominates.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 16), blood); this.abdomen.position.set(0, 0.85, -0.3); this.abdomen.scale.set(1.05, 1.15, 1.1); this.bodyGroup.add(this.abdomen);
            // Engorgement seams.
            for (let i = 0; i < 3; i++) { const seam = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.03, 6, 18), this._mat(0x4a1010, 1.0, 0.5)); seam.position.set(0, 0.85 + (i - 1) * 0.22, -0.3); seam.rotation.x = Math.PI / 2; this.bodyGroup.add(seam); }
            // Small thorax + tiny head jutting forward.
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), chitin); this.thorax.position.set(0, 0.62, 0.3); this.thorax.scale.set(1.2, 0.7, 1); this.bodyGroup.add(this.thorax);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), chitin); h.scale.set(1, 0.7, 1.2); this.head.add(h);
            this._eye(this.head, -0.05, 0.02, 0.06, 0.025, p.accent); this._eye(this.head, 0.05, 0.02, 0.06, 0.025, p.accent);
            this.head.position.set(0, 0.6, 0.46); this.bodyGroup.add(this.head);
            // Mandible piercing mouthparts.
            this.mandibles = new THREE.Group();
            for (const mx of [-0.04, 0.04]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 4), chitin); m.position.set(mx, 0.58, 0.58); m.rotation.x = 1.5; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legY: 0.5, legZs: [0.34, 0.18, 0.02], mat: chitin });
        }

        // ── Fire Centipede: long glowing segmented body, dozens of legs ──────
        _buildFireCentipede() {
            const p = this.profile;
            const shellMat = this._mat(p.bodyColor, 1.0, 0.4, 0x661500);
            const glowMat = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._segGlow = [glowMat];
            // Head with mandibles.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), shellMat); h.scale.set(1.1, 0.9, 1); this.head.add(h);
            this._eye(this.head, -0.1, 0.05, 0.14, 0.05, p.accent); this._eye(this.head, 0.1, 0.05, 0.14, 0.05, p.accent);
            this.head.position.set(0, 0.85, 0.7); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const mx of [-0.09, 0.09]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 4), glowMat); m.position.set(mx, 0.82, 0.92); m.rotation.x = 1.4; m.rotation.z = -mx * 3; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            // Long chain of segments curving back; glowing gaps between plates.
            this._segments = [];
            const N = 8;
            for (let i = 0; i < N; i++) {
                const z = 0.45 - i * 0.26;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), shellMat); seg.scale.set(1.1, 0.85, 1); seg.position.set(0, 0.85, z); this.bodyGroup.add(seg); this._segments.push(seg);
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 14), this._mat(p.accent, 1.0, 0.3, p.accent)); ring.position.set(0, 0.85, z + 0.13); ring.rotation.x = Math.PI / 2; this.bodyGroup.add(ring); this._ride(seg, ring); this._segGlow.push(ring.material);
            }
            // Thorax = first body segment, abdomen = last (for the rig).
            this.thorax = this._segments[0]; this.abdomen = this._segments[N - 1];
            // Wire base 6 legs, then add MANY more burning legs along the body.
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legY: 0.78, legZs: [0.3, 0.1, -0.1], mat: shellMat });
            for (let i = 0; i < N; i++) { const z = 0.45 - i * 0.26; for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.3, 4), glowMat); leg.position.set(s * 0.22, 0.72, z); leg.rotation.z = s * 1.0; this.bodyGroup.add(leg); this._ride(this._segments[i], leg); } }
        }

        // ── Frost Scarab: round beetle, crystalline frost-rimed carapace ─────
        _buildFrostScarab() {
            const p = this.profile;
            const carapaceMat = this._mat(0x6f9fc0, 1.0, 0.25);
            const ice = this._mat(p.accent, 0.7, 0.1, 0x224455);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), carapaceMat); this.thorax.position.set(0, 0.82, 0.28); this.thorax.scale.set(1.2, 0.7, 0.9); this.bodyGroup.add(this.thorax);
            // Big round domed abdomen carapace.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2), carapaceMat); this.abdomen.position.set(0, 0.72, -0.15); this.abdomen.scale.set(1.1, 1.1, 1.3); this.bodyGroup.add(this.abdomen);
            // Frost crystal shards rimed over the dome.
            this._frost = [];
            for (let i = 0; i < 14; i++) {
                const a = this.idRand() * Math.PI * 2, r = 0.2 + this.idRand() * 0.32;
                const shard = new THREE.Mesh(new THREE.ConeGeometry(0.04 + this.idRand() * 0.03, 0.16 + this.idRand() * 0.12, 4), ice);
                shard.position.set(Math.cos(a) * r, 0.95 + this.idRand() * 0.18, -0.15 + Math.sin(a) * r * 1.1);
                shard.rotation.set(this.idRand() * 0.6 - 0.3, a, this.idRand() * 0.6 - 0.3); this.bodyGroup.add(shard); this._frost.push(shard);
            }
            this.head = new THREE.Group();
            const hh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), carapaceMat); hh.scale.set(1.2, 0.7, 0.9); this.head.add(hh);
            // Clypeus shovel-plate of a scarab.
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.04, 8), carapaceMat); plate.position.set(0, 0.0, 0.16); plate.rotation.x = 1.2; this.head.add(plate);
            this._eye(this.head, -0.13, 0.03, 0.1, 0.05, p.accent); this._eye(this.head, 0.13, 0.03, 0.1, 0.05, p.accent);
            this.head.position.set(0, 0.84, 0.56); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const mx of [-0.08, 0.08]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), ice); m.position.set(mx, 0.8, 0.74); m.rotation.x = 1.5; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: this._frost, legY: 0.66, mat: carapaceMat });
        }

        // A part dressed onto a swaying segment (leg, ring, sac) follows that
        // segment sideways instead of staying behind as the body slides away.
        // Held in this._riders too, which keeps the draw-call merge off them.
        _ride(seg, mesh) { if (seg && mesh) { mesh._rideX = mesh.position.x; (seg._riders = seg._riders || []).push(mesh); (this._riders = this._riders || []).push(mesh); } return mesh; }
        _swayRiders() {
            const segs = this._wormSegs || this._segments;
            if (segs) segs.forEach(s => { if (s._riders) s._riders.forEach(r => { r.position.x = r._rideX + s.position.x; }); });
        }

        // Shared worm builder: chain of HEAD/HEART_SEGMENT/BODY_SEGMENT/TAIL.
        _buildWorm(opt) {
            const segMat = opt.segMat, N = opt.count || 7;
            this._wormSegs = [];
            const headR = opt.headR || 0.34;
            // Head.
            this.head = new THREE.Group();
            const hh = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 12), segMat); hh.scale.set(1, 0.95, 1.15); this.head.add(hh);
            this.head.position.set(0, opt.y, 0.6); this.bodyGroup.add(this.head);
            if (opt.onHead) opt.onHead(this.head);
            // Body chain receding back. Segment index 0 = closest behind head.
            const segGeos = [];
            for (let i = 0; i < N; i++) {
                const z = 0.35 - i * (opt.spacing || 0.34);
                const taper = 1 - (i / N) * (opt.taper || 0.55);
                const r = (opt.bodyR || 0.36) * taper;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), segMat); seg.scale.set(1.05, 0.95, 1.1); seg.position.set(0, opt.y, z); this.bodyGroup.add(seg);
                this._wormSegs.push(seg); segGeos.push(seg);
                if (opt.onSeg) opt.onSeg(seg, i, r, z);
            }
            // Tail = a tapered cone past the last segment.
            const lastZ = 0.35 - (N - 1) * (opt.spacing || 0.34);
            this.tail = new THREE.Mesh(new THREE.ConeGeometry((opt.bodyR || 0.36) * 0.35, 0.5, 8), segMat); this.tail.position.set(0, opt.y, lastZ - 0.34); this.tail.rotation.x = -Math.PI / 2; this.bodyGroup.add(this.tail);
            // Map: HEART_SEGMENT = the front (vital) body chunk, BODY_SEGMENT = the rest.
            const heart = segGeos[0];
            this._partMeshMap = { HEAD: this.head, HEART_SEGMENT: heart, BODY_SEGMENT: segGeos[Math.floor(N / 2)], TAIL: this.tail };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT'], hide: [this.head, this.tail, ...segGeos] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['BODY_SEGMENT'], hide: segGeos.slice(1).concat(this.tail) },
                { gone: ['TAIL'], hide: [this.tail] }
            ];
        }

        // ── Gloomwurm: titanic sightless segmented worm, shadow miasma ───────
        _buildGloomwurm() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            this._buildWorm({
                segMat: skin, count: 8, y: 0.7, headR: 0.4, bodyR: 0.42, spacing: 0.36, taper: 0.45,
                onHead: (head) => {
                    // No eyes: a radial maw of inward fangs instead.
                    const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.1, 0.2, 12), this._mat(0x140a18, 1.0, 0.6)); maw.position.set(0, 0, 0.32); maw.rotation.x = Math.PI / 2; head.add(maw);
                    this._fangs = [];
                    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), this._mat(0xcabfd0, 1.0, 0.4)); f.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.18, 0.34); f.rotation.x = 1.0; f.rotation.z = -a; head.add(f); }
                },
                onSeg: (seg, i) => {
                    // Shadow miasma haze sphere around every other segment.
                    if (i % 2 === 0) { const haze = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), this._mat(p.accent, 0.16, 0.9, p.accent)); haze.position.copy(seg.position); this.bodyGroup.add(haze); this._ride(seg, haze); (this._miasma = this._miasma || []).push(haze); }
                }
            });
            if (this._miasma) this._cascadeRules[0].hide.push(...this._miasma);
        }

        // ── Guttural Maggotus: bloated pale maggot bursting with spore pustules
        _buildGutturalMaggotus() {
            const p = this.profile;
            const flesh = this._skinMat(p.bodyColor, 0.55);
            this._buildWorm({
                segMat: flesh, count: 7, y: 0.6, headR: 0.3, bodyR: 0.44, spacing: 0.3, taper: 0.3,
                onHead: (head) => {
                    // Blunt sucking mouth, tiny vestigial dark spots.
                    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 12), this._mat(0x8a6a55, 1.0, 0.5)); mouth.position.set(0, -0.02, 0.28); mouth.rotation.x = 0.2; head.add(mouth);
                    this._eye(head, -0.08, 0.06, 0.22, 0.03, 0x442222); this._eye(head, 0.08, 0.06, 0.22, 0.03, 0x442222);
                },
                onSeg: (seg, i, r, z) => {
                    // Spore pustules erupting along segment.
                    for (let k = 0; k < 4; k++) {
                        const a = this.idRand() * Math.PI * 2;
                        const pus = new THREE.Mesh(new THREE.SphereGeometry(0.06 + this.idRand() * 0.04, 8, 6), this._mat(p.accent, 1.0, 0.4, 0x3a4a10));
                        pus.position.set(Math.cos(a) * r * 0.95, 0.6 + Math.sin(a) * r * 0.6, z + (this.idRand() - 0.5) * 0.18);
                        this.bodyGroup.add(pus); (this._pustules = this._pustules || []).push(pus);
                    }
                }
            });
            if (this._pustules) this._cascadeRules[0].hide.push(...this._pustules);
        }

        // ── Hivemind Termite: pale soldier termite, swollen abdomen, big jaws ─
        _buildHivemindTermite() {
            const p = this.profile;
            const pale = this._skinMat(p.bodyColor, 0.55);
            const amber = this._mat(p.accent, 1.0, 0.4);
            // Hardened darker head capsule.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), amber); h.scale.set(1.1, 0.85, 1.15); this.head.add(h);
            this._eye(this.head, -0.11, 0.04, 0.16, 0.04, 0x221100); this._eye(this.head, 0.11, 0.04, 0.16, 0.04, 0x221100);
            this._antennae(this.head, amber, p.accent);
            this.head.position.set(0, 0.84, 0.6); this.bodyGroup.add(this.head);
            // Oversized curved soldier mandibles.
            this.mandibles = new THREE.Group();
            for (const mx of [-1, 1]) {
                const m = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 12, Math.PI * 0.8), amber);
                m.position.set(mx * 0.08, 0.84, 0.86); m.rotation.set(Math.PI / 2, 0, mx > 0 ? -0.5 : Math.PI + 0.5); this.mandibles.add(m);
            }
            this.bodyGroup.add(this.mandibles);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), pale); this.thorax.position.set(0, 0.82, 0.12); this.thorax.scale.set(1, 0.9, 1.1); this.bodyGroup.add(this.thorax);
            // Swollen pale physogastric abdomen (segmented bulge).
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 14), pale); this.abdomen.position.set(0, 0.82, -0.6); this.abdomen.scale.set(1.05, 1.05, 1.5); this.bodyGroup.add(this.abdomen);
            this._segRings = [];
            for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 16), this._mat(0xcabf9a, 1.0, 0.6)); ring.position.set(0, 0.82, -0.3 - i * 0.24); ring.rotation.x = Math.PI / 2; const sc = 1 - i * 0.12; ring.scale.set(sc, sc, 1); this.bodyGroup.add(ring); this._segRings.push(ring); }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: this._segRings, legY: 0.7, mat: amber });
        }

        // ── Jungle Stalker: venomous green segmented worm-centipede predator ──
        _buildJungleStalker() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.55);
            const venom = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._jsVenom = [venom];
            this._buildWorm({
                segMat: green, count: 8, y: 0.75, headR: 0.3, bodyR: 0.3, spacing: 0.3, taper: 0.5,
                onHead: (head) => {
                    this._eye(head, -0.12, 0.07, 0.16, 0.06, p.accent); this._eye(head, 0.12, 0.07, 0.16, 0.06, p.accent);
                    // Venom fangs jutting forward.
                    this.mandibles = new THREE.Group();
                    for (const mx of [-0.08, 0.08]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 4), venom); f.position.set(mx, -0.04, 0.34); f.rotation.x = 1.5; f.rotation.z = -mx * 3; head.add(f); }
                    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), venom); drip.position.set(0, -0.12, 0.42); drip.scale.y = 1.5; head.add(drip); this._jsDrip = drip;
                },
                onSeg: (seg, i, r, z) => {
                    // Bristly legs + a venom stripe down each segment.
                    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.3, 4), green); leg.position.set(s * (r + 0.06), 0.62, z); leg.rotation.z = s * 1.1; this.bodyGroup.add(leg); this._ride(seg, leg); (this._jsLegs = this._jsLegs || []).push(leg); }
                    const stripe = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 6), venom); stripe.position.set(0, 0.75 + r * 0.7, z); stripe.scale.set(0.6, 0.4, 1); this.bodyGroup.add(stripe); this._ride(seg, stripe); this._jsVenom.push(stripe.material);
                }
            });
            const extra = (this._jsLegs || []).concat(this.mandibles ? [this.mandibles] : []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Luminous Locust King: regal glowing locust, crown, long wings ────
        _buildLocustKing() {
            const p = this.profile;
            const body = this._skinMat(p.bodyColor, 0.5);
            const glow = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._lkGlow = [glow];
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), body); this.thorax.position.set(0, 0.95, 0.18); this.thorax.scale.set(1, 1.1, 1.3); this.bodyGroup.add(this.thorax);
            // Long ridged abdomen.
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.07, 1.0, 10), body); this.abdomen.position.set(0, 0.95, -0.6); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), body); h.scale.set(0.9, 1.2, 1.0); this.head.add(h);
            this._eye(this.head, -0.12, 0.06, 0.1, 0.08, p.accent); this._eye(this.head, 0.12, 0.06, 0.1, 0.08, p.accent);
            // Glowing crown-crest of spikes.
            this._crown = [];
            for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32; const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22 + (2 - Math.abs(i - 2)) * 0.1, 4), glow); spike.position.set(Math.sin(a) * 0.16, 0.22, -0.02); spike.rotation.z = -a; this.head.add(spike); this._crown.push(spike); this._lkGlow.push(spike.material); }
            this._antennae(this.head, body, p.accent);
            this.head.position.set(0, 0.98, 0.52); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const mx of [-0.07, 0.07]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 4), body); m.position.set(mx, 0.9, 0.72); m.rotation.x = 1.5; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            // Long folded membranous wings.
            const wingMat = this._mat(p.accent, 0.32, 0.2, p.accent); this._lkGlow.push(wingMat);
            this._wingPair(0.1, 1.15, 0.08, { len: 1.15, width: 0.42, mat: wingMat, sweep: 1.25, lift: 0.15, amp: 0.25, rate: 10, rateFast: 24 });
            // Big sprung jumping hind legs.
            this._lkHind = [];
            for (const side of [-1, 1]) {
                const g = new THREE.Group();
                const thighGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.06, 0.3, 4, 8) : new THREE.CylinderGeometry(0.12, 0.05, 0.4, 6);
                const thigh = new THREE.Mesh(thighGeo, body); thigh.position.set(side * 0.16, 0.05, 0); thigh.rotation.z = side * 0.5; g.add(thigh);
                const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.5, 5), body); shin.position.set(side * 0.32, -0.22, -0.05); shin.rotation.z = -side * 0.4; g.add(shin);
                g.position.set(0, 0.82, -0.35); g._side = side; this.bodyGroup.add(g); this._lkHind.push(g);
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings].concat(this._crown).concat(this._lkHind), legY: 0.78, legZs: [0.36, 0.16], mat: body });
        }

        // ── Magma Centipede: black rock segments, glowing molten cracks ──────
        _buildMagmaCentipede() {
            const p = this.profile;
            const rock = this._mat(p.bodyColor, 1.0, 0.85);
            const molten = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._mcGlow = [molten];
            this._buildWorm({
                segMat: rock, count: 9, y: 0.78, headR: 0.28, bodyR: 0.32, spacing: 0.28, taper: 0.45,
                onHead: (head) => {
                    this._eye(head, -0.1, 0.05, 0.16, 0.05, p.accent); this._eye(head, 0.1, 0.05, 0.16, 0.05, p.accent);
                    this.mandibles = new THREE.Group();
                    for (const mx of [-0.08, 0.08]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 4), molten); m.position.set(mx, 0, 0.32); m.rotation.x = 1.5; m.rotation.z = -mx * 3; head.add(m); }
                },
                onSeg: (seg, i, r, z) => {
                    // Molten crack ring glowing in the gap between plates.
                    const crack = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, 0.035, 6, 14), this._mat(p.accent, 1.0, 0.3, p.accent)); crack.position.set(0, 0.78, z + 0.14); crack.rotation.x = Math.PI / 2; this.bodyGroup.add(crack); this._ride(seg, crack); this._mcGlow.push(crack.material); (this._mcCracks = this._mcCracks || []).push(crack);
                    // Stubby rock legs.
                    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.01, 0.26, 4), rock); leg.position.set(s * (r + 0.04), 0.64, z); leg.rotation.z = s * 1.1; this.bodyGroup.add(leg); this._ride(seg, leg); (this._mcLegs = this._mcLegs || []).push(leg); }
                }
            });
            const extra = (this._mcLegs || []).concat(this._mcCracks || []).concat(this.mandibles ? [this.mandibles] : []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Mothshade Stalker: furred dusky moth, big eye-pattern wings ──────
        _buildMothshadeStalker() {
            const p = this.profile;
            const fuzz = this._skinMat(p.bodyColor, 0.95);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), fuzz); this.thorax.position.set(0, 0.95, 0.2); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, 0.7, 10), fuzz); this.abdomen.position.set(0, 0.95, -0.5); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            // Fur tufts on the abdomen.
            for (let i = 0; i < 3; i++) { const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.02, 8, 6), fuzz); tuft.position.set(0, 0.95, -0.3 - i * 0.22); this.bodyGroup.add(tuft); }
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), fuzz); this.head.add(h);
            this._eye(this.head, -0.1, 0.02, 0.12, 0.07, p.accent); this._eye(this.head, 0.1, 0.02, 0.12, 0.07, p.accent);
            // Big feathery plumose antennae.
            for (const ax of [-1, 1]) {
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.4, 4), fuzz); stem.position.set(ax * 0.1, 0.22, 0.05); stem.rotation.z = ax * 0.5; stem.rotation.x = -0.4; this.head.add(stem);
                for (let k = 0; k < 5; k++) { const barb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.02), fuzz); barb.position.set(ax * (0.12 + k * 0.05), 0.18 + k * 0.07, 0.07); barb.rotation.z = ax * 0.5; this.head.add(barb); }
            }
            this.head.position.set(0, 0.98, 0.5); this.bodyGroup.add(this.head);
            // Large eye-pattern wings (mandibles slot stays a small proboscis coil).
            this.mandibles = new THREE.Group();
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), this._mat(0x2a2030, 1.0, 0.5)); coil.position.set(0, 0.88, 0.66); this.mandibles.add(coil); this.bodyGroup.add(this.mandibles);
            const wingMat = this._mat(p.bodyColor, 0.85, 0.7); const eyeMat = this._mat(p.accent, 1.0, 0.4, p.accent);
            const pupilMat = this._mat(0x100810, 1.0, 0.4);
            this._mothEyes = [eyeMat];
            const flap = { lift: 0.15, amp: 0.3, rate: 4, rateFast: 14 };
            for (const sx of [-1, 1]) {
                const fore = this._hingeWing(sx, 0.12, 1.08, 0.25, Object.assign({ len: 1.0, width: 0.8, mat: wingMat, sweep: -0.1 }, flap));
                this._hingeWing(sx, 0.12, 1.05, 0.05, Object.assign({ len: 0.8, width: 0.7, mat: wingMat, sweep: 0.5 }, flap));
                // Hypnotic eye spot painted on the fore wing.
                const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), eyeMat); spot.position.set(sx * 0.5, 0.01, 0); spot.rotation.x = -Math.PI / 2; fore._blade.add(spot);
                const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), pupilMat); pupil.position.set(sx * 0.5, 0.02, 0); pupil.rotation.x = -Math.PI / 2; fore._blade.add(pupil);
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings], legY: 0.78, legZs: [0.3, 0.1], mat: fuzz });
        }

        // ── Swamp Scorpion: muddy green, two pincers, 8 legs, arched stinger ─
        _buildSwampScorpion() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.55);
            const venom = this._mat(p.accent, 1.0, 0.3, p.accent);
            // Cephalothorax (front body plate).
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), shell); this.cephalo.position.set(0, 0.55, 0.35); this.cephalo.scale.set(1.2, 0.6, 1.2); this.bodyGroup.add(this.cephalo);
            // Head with eyes set on top of the cephalothorax.
            this.head = new THREE.Group();
            this._eye(this.head, -0.08, 0, 0.0, 0.05, p.accent); this._eye(this.head, 0.08, 0, 0.0, 0.05, p.accent);
            this._eye(this.head, 0, 0.04, 0.1, 0.035, p.accent);
            this.head.position.set(0, 0.66, 0.45); this.bodyGroup.add(this.head);
            // Segmented mesosoma abdomen.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), shell); this.abdomen.position.set(0, 0.55, -0.25); this.abdomen.scale.set(1.1, 0.7, 1.3); this.bodyGroup.add(this.abdomen);
            this._scorpRings = [];
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.28 - i * 0.03, 0.03, 6, 14), this._mat(0x3a4a1f, 1.0, 0.6)); r.position.set(0, 0.55, -0.1 - i * 0.16); r.rotation.x = Math.PI / 2; this.bodyGroup.add(r); this._scorpRings.push(r); }
            // Arched tail (metasoma) curling up and over, with bulb + stinger.
            this.tail = new THREE.Group();
            const segCount = 5; let px = 0, py = 0, pz = -0.55; const tailMeshes = [];
            for (let i = 0; i < segCount; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.008, 10, 8), shell);
                const ang = 0.4 + i * 0.45; px = 0; py = 0.55 + i * 0.18; pz = -0.55 + i * 0.04 - Math.sin(ang) * 0.02;
                seg.position.set(px, py, pz + i * 0.02); this.tail.add(seg); tailMeshes.push(seg);
            }
            // Venom bulb + stinger at the tip.
            this.stinger = new THREE.Group();
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), venom); bulb.position.set(0, 1.4, -0.32); bulb.scale.set(1, 1.2, 1); this.stinger.add(bulb);
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 5), venom); barb.position.set(0, 1.32, -0.18); barb.rotation.x = -1.0; this.stinger.add(barb);
            this.tail.add(this.stinger); this.bodyGroup.add(this.tail);
            // Two big pincer arms (pedipalps).
            const makePincer = (side) => {
                const g = new THREE.Group();
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), shell); upper.position.set(side * 0.1, 0, 0.12); upper.rotation.z = side * 0.6; upper.rotation.x = -0.6; g.add(upper);
                const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.28, 6), shell); fore.position.set(side * 0.26, 0.05, 0.34); fore.rotation.x = -1.0; g.add(fore);
                const claw = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), shell); claw.position.set(side * 0.3, 0.1, 0.5); claw.scale.set(1, 0.7, 1.3); g.add(claw);
                for (const f of [-1, 1]) { const finger = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 5), shell); finger.position.set(side * 0.3 + f * 0.05, 0.1, 0.66); finger.rotation.x = -1.6; g.add(finger); }
                g.position.set(side * 0.28, 0.6, 0.55); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.pincerL = makePincer(-1); this.pincerR = makePincer(1);
            // Eight walking legs.
            this._scorpLegs = [];
            const legKeysL = ['LEFT_LEG', 'MID_LEFT_LEG', 'MID_REAR_LEFT_LEG', 'REAR_LEFT_LEG'];
            const legKeysR = ['RIGHT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            const legZs = [0.4, 0.18, -0.02, -0.22];
            const scorpLeg = (side, z) => {
                const g = new THREE.Group();
                const u = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.36, 4), shell); u.position.set(side * 0.18, -0.04, 0); u.rotation.z = side * 1.1; g.add(u);
                const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.008, 0.34, 4), shell); l.position.set(side * 0.38, -0.28, 0); l.rotation.z = side * 0.25; g.add(l);
                g.position.set(0, 0.5, z); g._side = side; this.bodyGroup.add(g); this._legs.push(g); this._scorpLegs.push(g); return g;
            };
            const legMeshesL = legZs.map(z => scorpLeg(-1, z));
            const legMeshesR = legZs.map(z => scorpLeg(1, z));
            // Rig mapping.
            this._partMeshMap = {
                HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen,
                TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR
            };
            legKeysL.forEach((k, i) => { this._partMeshMap[k] = legMeshesL[i]; });
            legKeysR.forEach((k, i) => { this._partMeshMap[k] = legMeshesR[i]; });
            const allMeshes = [this.head, this.cephalo, this.abdomen, this.tail, this.stinger, this.pincerL, this.pincerR]
                .concat(this._scorpRings).concat(legMeshesL).concat(legMeshesR);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: allMeshes },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail, this.stinger].concat(this._scorpRings) },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail, this.stinger] },
                { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] },
                { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
                ...legKeysL.map((k, i) => ({ gone: [k], hide: [legMeshesL[i]] })),
                ...legKeysR.map((k, i) => ({ gone: [k], hide: [legMeshesR[i]] }))
            ];
        }

        // ── Toxic Ghost: sickly green segmented parasite worm, egg-sacs, venom drip
        _buildToxicGhost() {
            const p = this.profile;
            const slime = this._skinMat(p.bodyColor, 0.35);
            const venom = this._mat(p.accent, 1.0, 0.25, p.accent);
            this._tgVenom = [venom];
            this._buildWorm({
                segMat: slime, count: 7, y: 0.7, headR: 0.3, bodyR: 0.34, spacing: 0.3, taper: 0.4,
                onHead: (head) => {
                    // Lamprey rasp-maw + tiny vestigial eyes.
                    const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.08, 0.16, 12), this._mat(0x2a4a14, 1.0, 0.5)); maw.position.set(0, -0.02, 0.28); maw.rotation.x = Math.PI / 2; head.add(maw);
                    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), this._mat(0xe8ffb0, 1.0, 0.4)); tooth.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.13, 0.32); tooth.rotation.x = 1.0; tooth.rotation.z = -a; head.add(tooth); }
                    this._eye(head, -0.1, 0.1, 0.18, 0.03, p.accent); this._eye(head, 0.1, 0.1, 0.18, 0.03, p.accent);
                    // Venom drip from the maw.
                    const drip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), venom); drip.position.set(0, -0.14, 0.34); drip.scale.y = 1.5; head.add(drip); this._tgDrip = drip;
                },
                onSeg: (seg, i, r, z) => {
                    // Translucent egg-sacs bulging from alternate segments.
                    if (i % 2 === 1) {
                        for (const s of [-1, 1]) { const sac = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), this._mat(0xd8ff8a, 0.6, 0.2, 0x3a5a10)); sac.position.set(s * r * 0.9, 0.7, z); this.bodyGroup.add(sac); this._ride(seg, sac); (this._tgEggs = this._tgEggs || []).push(sac); }
                    }
                    // Venom sheen blister on top.
                    const blob = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 6), venom); blob.position.set(0, 0.7 + r * 0.7, z); this.bodyGroup.add(blob); this._ride(seg, blob); this._tgVenom.push(blob.material);
                }
            });
            const extra = (this._tgEggs || []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Venomous Dragonfly: long thin abdomen, four iridescent wings, fangs
        _buildVenomousDragonfly() {
            const p = this.profile;
            const body = this._skinMat(p.bodyColor, 0.4);
            const venom = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._vdVenom = [venom];
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), body); this.thorax.position.set(0, 1.05, 0.12); this.thorax.scale.set(1, 1, 1.2); this.bodyGroup.add(this.thorax);
            // Very long thin segmented abdomen.
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.03, 1.6, 10), body); this.abdomen.position.set(0, 1.05, -0.9); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09 - i * 0.012, 0.018, 6, 12), venom); ring.position.set(0, 1.05, -0.35 - i * 0.3); ring.rotation.x = Math.PI / 2; this.bodyGroup.add(ring); this._vdVenom.push(ring.material); }
            // Venom barb at the tail tip.
            this.tailBarb = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), venom); this.tailBarb.position.set(0, 1.05, -1.78); this.tailBarb.rotation.x = -Math.PI / 2; this.bodyGroup.add(this.tailBarb); this._vdVenom.push(this.tailBarb.material);
            // Big compound eyes head.
            this.head = new THREE.Group();
            const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0x2a3a14, 1.0, 0.2, p.accent)); eyeL.position.set(-0.12, 0, 0.05); this.head.add(eyeL); this._vdVenom.push(eyeL.material);
            const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), this._mat(0x2a3a14, 1.0, 0.2, p.accent)); eyeR.position.set(0.12, 0, 0.05); this.head.add(eyeR); this._vdVenom.push(eyeR.material);
            this.head.position.set(0, 1.05, 0.46); this.bodyGroup.add(this.head);
            // Venom fangs / mandibles.
            this.mandibles = new THREE.Group();
            for (const mx of [-0.07, 0.07]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), venom); m.position.set(mx, 0.98, 0.68); m.rotation.x = 1.5; m.rotation.z = -mx * 3; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            // Four long veined iridescent wings hinged on the thorax.
            const wingMat = this._mat(p.accent, 0.32, 0.15, p.accent); this._vdVenom.push(wingMat);
            const veinMat = this._mat(0x244411, 0.6, 0.4);
            this._wingPair(0.1, 1.2, 0.2, { len: 1.5, width: 0.3, mat: wingMat, veins: veinMat, veinCount: 3, seg: 14, sweep: 0.04, lift: 0.06, amp: 0.45, rate: 30, rateFast: 42 });
            this._wingPair(0.1, 1.2, -0.02, { len: 1.4, width: 0.32, mat: wingMat, veins: veinMat, veinCount: 3, seg: 14, sweep: 0.2, lift: 0.06, amp: 0.45, rate: 30, rateFast: 42, phase: 1.2 });
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, this.tailBarb], legY: 0.98, legZs: [0.25, 0.08], mat: body });
        }

        // ── Chromatic Tick: round neon iridescent shell, contagion-ooze segments
        _buildChromaticTick() {
            const p = this.profile;
            const shell = this._mat(0x1c1c26, 1.0, 0.2);
            const ooze = this._mat(p.accent, 0.9, 0.2, p.accent);
            this._ctShell = []; this._ctOoze = [ooze];
            this._buildWorm({
                segMat: shell, count: 5, y: 0.7, headR: 0.22, bodyR: 0.34, spacing: 0.26, taper: 0.15,
                onHead: (head) => {
                    this._eye(head, -0.08, 0.04, 0.12, 0.04, p.accent); this._eye(head, 0.08, 0.04, 0.12, 0.04, p.accent);
                    // Tiny piercing rostrum.
                    const rost = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), ooze); rost.position.set(0, -0.04, 0.24); rost.rotation.x = Math.PI / 2; head.add(rost); this._ctOoze.push(rost.material);
                },
                onSeg: (seg, i, r, z) => {
                    // Iridescent neon hex-plates over the round shell.
                    for (let k = 0; k < 5; k++) {
                        const a = (k / 5) * Math.PI * 2 + i * 0.4;
                        const plate = new THREE.Mesh(new THREE.CircleGeometry(r * 0.42, 6), this._mat(0xffffff, 1.0, 0.1, 0x222222));
                        const px = Math.cos(a) * r * 0.85, py = 0.7 + Math.sin(a) * r * 0.6;
                        plate.position.set(px, py, z); plate.lookAt(px * 2, py * 2 - 0.7, z); this.bodyGroup.add(plate); this._ctShell.push(plate.material);
                    }
                    // Contagion ooze dripping below.
                    const drop = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 8, 6), ooze); drop.position.set(0, 0.7 - r * 0.8, z); drop.scale.y = 1.4; this.bodyGroup.add(drop); this._ctOoze.push(drop.material); (this._ctDrops = this._ctDrops || []).push(drop);
                }
            });
            const extra = (this._ctDrops || []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Mind Flayer Moth: psychedelic eye-pattern wings, tentacle face ──────
        _buildMindFlayerMoth() {
            const p = this.profile;
            const fuzz = this._skinMat(p.bodyColor, 0.95);
            const psy = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._mfPsy = [psy];
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), fuzz); this.thorax.position.set(0, 0.95, 0.2); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.09, 0.75, 10), fuzz); this.abdomen.position.set(0, 0.95, -0.55); this.abdomen.rotation.x = Math.PI / 2; this.bodyGroup.add(this.abdomen);
            for (let i = 0; i < 3; i++) { const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.15 - i * 0.025, 8, 6), fuzz); tuft.position.set(0, 0.95, -0.34 - i * 0.24); this.bodyGroup.add(tuft); }
            // Illithid head: pale dome with a writhing tentacle-mouth (no real eyes).
            this.head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), this._mat(0x7a5aa0, 1.0, 0.6)); skull.scale.set(1, 1.1, 0.95); this.head.add(skull);
            this._eye(this.head, -0.1, 0.06, 0.13, 0.04, p.accent); this._eye(this.head, 0.1, 0.06, 0.13, 0.04, p.accent);
            this._mfTents = [];
            for (let i = 0; i < 4; i++) {
                const a = (i - 1.5) * 0.18;
                const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3, 5), this._mat(0x6a4a90, 1.0, 0.55)); t1.position.set(Math.sin(a) * 0.1, -0.12, 0.16); t1.rotation.x = 1.4; t1.rotation.z = a * 2; this.head.add(t1); this._mfTents.push(t1);
            }
            this.head.position.set(0, 0.98, 0.5); this.bodyGroup.add(this.head);
            // Mandibles slot = coiled proboscis under the tentacles.
            this.mandibles = new THREE.Group();
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12), this._mat(0x3a2050, 1.0, 0.5)); coil.position.set(0, 0.86, 0.66); this.mandibles.add(coil); this.bodyGroup.add(this.mandibles);
            // Huge psychedelic eye-pattern wings.
            const wingMat = this._mat(p.bodyColor, 0.9, 0.7);
            const pupilMat = this._mat(0x100018, 1.0, 0.3);
            const flap = { lift: 0.15, amp: 0.3, rate: 4, rateFast: 14 };
            for (const sx of [-1, 1]) {
                const fore = this._hingeWing(sx, 0.14, 1.1, 0.25, Object.assign({ len: 1.24, width: 1.05, mat: wingMat, seg: 16, sweep: -0.1 }, flap));
                this._hingeWing(sx, 0.14, 1.07, 0.02, Object.assign({ len: 1.0, width: 0.9, mat: wingMat, seg: 16, sweep: 0.55 }, flap));
                // Concentric psychic-eye rings painted on the fore wing.
                for (let r = 0; r < 3; r++) {
                    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06 + r * 0.07, 0.1 + r * 0.07, 16), psy);
                    ring.position.set(sx * 0.62, 0.01 + r * 0.001, 0); ring.rotation.x = -Math.PI / 2; fore._blade.add(ring);
                }
                const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), pupilMat); pupil.position.set(sx * 0.62, 0.014, 0); pupil.rotation.x = -Math.PI / 2; fore._blade.add(pupil);
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings].concat(this._mfTents), legY: 0.78, legZs: [0.3, 0.1], mat: fuzz });
        }

        // Shared glistening leech builder (sucker-mouth segmented slug).
        _buildLeech(opt) {
            const slime = this._skinMat(opt.bodyColor, 0.2);
            const ringMat = this._mat(opt.ringColor, 1.0, 0.4);
            this._leechRings = [];
            this._buildWorm({
                segMat: slime, count: 8, y: 0.55, headR: 0.26, bodyR: 0.3, spacing: 0.28, taper: 0.25,
                onHead: (head) => {
                    // Concentric ringed sucker mouth at the front.
                    this._suckerMouth = new THREE.Group();
                    for (let r = 0; r < (opt.ringed ? 3 : 1); r++) {
                        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08 + r * 0.06, 0.025, 8, 16), this._mat(opt.maw, 1.0, 0.35));
                        ring.position.set(0, -0.02, 0.24); this._suckerMouth.add(ring); this._leechRings.push(ring.material);
                    }
                    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), this._mat(opt.maw, 1.0, 0.5)); pit.position.set(0, -0.02, 0.25); this._suckerMouth.add(pit);
                    head.add(this._suckerMouth);
                    this._eye(head, -0.09, 0.08, 0.14, 0.025, opt.accent); this._eye(head, 0.09, 0.08, 0.14, 0.025, opt.accent);
                },
                onSeg: (seg, i, r, z) => {
                    // Annular body ring between each segment (leech annulations).
                    const ann = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, 0.022, 6, 14), ringMat); ann.position.set(0, 0.55, z + (opt.spacing || 0.28) * 0.5); ann.rotation.x = Math.PI / 2; this.bodyGroup.add(ann); (this._leechAnn = this._leechAnn || []).push(ann);
                    // Glistening highlight blob.
                    const sheen = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 6, 5), this._mat(0xffffff, 0.4, 0.05, 0x444444)); sheen.position.set(r * 0.4, 0.55 + r * 0.6, z); this.bodyGroup.add(sheen);
                }
            });
            const extra = (this._leechAnn || []).concat(this._suckerMouth ? [this._suckerMouth] : []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Emotional Leech: glistening pink slug, big sucker mouth ──────────────
        _buildEmotionalLeech() {
            const p = this.profile;
            this._buildLeech({ bodyColor: p.bodyColor, ringColor: 0xc24a70, maw: 0x8a2a48, accent: p.accent, ringed: false });
        }

        // ── Memory Leech: grey-blue slug, ringed sucker mouth ───────────────────
        _buildMemoryLeech() {
            const p = this.profile;
            this._buildLeech({ bodyColor: p.bodyColor, ringColor: 0x47596e, maw: 0x2a3a4a, accent: p.accent, ringed: true });
        }

        // ── Thought Parasite: translucent flickering tick-worm, phasing in/out ──
        _buildThoughtParasite() {
            const p = this.profile;
            // Ghostly translucent worm body.
            const ghost = this._mat(p.bodyColor, 0.5, 0.15, p.accent);
            this._tpGhost = [ghost];
            this._buildWorm({
                segMat: ghost, count: 6, y: 0.7, headR: 0.26, bodyR: 0.3, spacing: 0.28, taper: 0.35,
                onHead: (head) => {
                    // Bulging psychic eyes + a barbed proboscis.
                    this._eye(head, -0.11, 0.06, 0.12, 0.07, p.accent); this._eye(head, 0.11, 0.06, 0.12, 0.07, p.accent);
                    const ros = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.3, 5), this._mat(p.accent, 0.7, 0.1, p.accent)); ros.position.set(0, -0.06, 0.3); ros.rotation.x = Math.PI / 2; head.add(ros); this._tpGhost.push(ros.material);
                    // Wiggling sensory cilia probing forward.
                    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.4; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.002, 0.24, 4), ghost); c.position.set(Math.sin(a) * 0.1, 0.04, 0.2); c.rotation.x = 1.2; c.rotation.z = a; head.add(c); }
                },
                onSeg: (seg, i, r, z) => {
                    // Faint phasing aura sphere over each segment.
                    const aura = new THREE.Mesh(new THREE.SphereGeometry(r * 1.4, 10, 8), this._mat(p.accent, 0.12, 0.05, p.accent));
                    aura.position.set(0, 0.7, z); this.bodyGroup.add(aura); this._ride(seg, aura); this._tpGhost.push(aura.material); (this._tpAura = this._tpAura || []).push(aura);
                    // Tick-worm bristle barbs.
                    for (const s of [-1, 1]) { const barb = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14, 4), ghost); barb.position.set(s * r * 0.9, 0.7, z); barb.rotation.z = s * 1.2; this.bodyGroup.add(barb); this._ride(seg, barb); }
                }
            });
            if (this._tpAura) this._cascadeRules[0].hide.push(...this._tpAura);
        }

        // ── Emberback Hellscorpion: black carapace, magma cracks, fiery stinger ─
        _buildEmberbackHellscorpion() {
            const p = this.profile;
            const obsidian = this._mat(p.bodyColor, 1.0, 0.85);
            const magma = this._mat(p.accent, 1.0, 0.3, p.accent);
            this._ehGlow = [magma];
            const crackOn = (mesh, n, rad) => {
                for (let i = 0; i < n; i++) {
                    const a = this.idRand() * Math.PI * 2;
                    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.18 + this.idRand() * 0.12), this._mat(p.accent, 1.0, 0.3, p.accent));
                    cr.position.set(Math.cos(a) * rad * 0.7, rad * 0.6, Math.sin(a) * rad * 0.7);
                    cr.rotation.set(this.idRand(), a, this.idRand()); mesh.add(cr); this._ehGlow.push(cr.material);
                }
            };
            // Cephalothorax front plate with glowing cracks.
            this.cephalo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), obsidian); this.cephalo.position.set(0, 0.6, 0.35); this.cephalo.scale.set(1.25, 0.6, 1.2); this.bodyGroup.add(this.cephalo); crackOn(this.cephalo, 5, 0.36);
            // Head with menacing red eyes.
            this.head = new THREE.Group();
            this._eye(this.head, -0.09, 0, 0.02, 0.05, p.accent); this._eye(this.head, 0.09, 0, 0.02, 0.05, p.accent);
            this._eye(this.head, 0, 0.05, 0.1, 0.04, p.accent);
            this.head.position.set(0, 0.7, 0.5); this.bodyGroup.add(this.head);
            // Segmented abdomen with molten seams.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), obsidian); this.abdomen.position.set(0, 0.6, -0.28); this.abdomen.scale.set(1.1, 0.7, 1.35); this.bodyGroup.add(this.abdomen); crackOn(this.abdomen, 4, 0.32);
            this._ehSeams = [];
            for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.TorusGeometry(0.3 - i * 0.03, 0.028, 6, 16), magma); s.position.set(0, 0.6, -0.12 - i * 0.16); s.rotation.x = Math.PI / 2; this.bodyGroup.add(s); this._ehSeams.push(s); this._ehGlow.push(s.material); }
            // Arched metasoma tail curling up to a fiery stinger.
            this.tail = new THREE.Group();
            for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i * 0.008, 10, 8), obsidian); seg.position.set(0, 0.6 + i * 0.2, -0.55 + i * 0.05); this.tail.add(seg); }
            this.stinger = new THREE.Group();
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), magma); bulb.position.set(0, 1.55, -0.3); bulb.scale.set(1, 1.3, 1); this.stinger.add(bulb); this._ehGlow.push(bulb.material);
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 5), this._mat(p.accent, 1.0, 0.2, 0xffaa33)); barb.position.set(0, 1.46, -0.14); barb.rotation.x = -1.0; this.stinger.add(barb); this._ehGlow.push(barb.material);
            // Ember sparks rising from the stinger.
            for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), this._mat(0xffcc44, 0.8, 0.2, 0xffcc44)); sp.position.set((this.idRand() - 0.5) * 0.1, 1.6 + i * 0.06, -0.3); this.stinger.add(sp); this._ehGlow.push(sp.material); }
            this.tail.add(this.stinger); this.bodyGroup.add(this.tail);
            // Two big pincer claws with magma seams.
            const makePincer = (side) => {
                const g = new THREE.Group();
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6), obsidian); upper.position.set(side * 0.1, 0, 0.12); upper.rotation.z = side * 0.6; upper.rotation.x = -0.6; g.add(upper);
                const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.3, 6), obsidian); fore.position.set(side * 0.28, 0.05, 0.36); fore.rotation.x = -1.0; g.add(fore);
                const claw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), obsidian); claw.position.set(side * 0.32, 0.1, 0.54); claw.scale.set(1, 0.7, 1.4); g.add(claw); crackOn(claw, 2, 0.13);
                for (const f of [-1, 1]) { const finger = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 5), obsidian); finger.position.set(side * 0.32 + f * 0.06, 0.1, 0.72); finger.rotation.x = -1.6; g.add(finger); }
                g.position.set(side * 0.3, 0.65, 0.58); g._side = side; this.bodyGroup.add(g); return g;
            };
            this.pincerL = makePincer(-1); this.pincerR = makePincer(1);
            // Eight legs glowing faintly at the joints.
            const legKeysL = ['LEFT_LEG', 'MID_LEFT_LEG', 'MID_REAR_LEFT_LEG', 'REAR_LEFT_LEG'];
            const legKeysR = ['RIGHT_LEG', 'MID_RIGHT_LEG', 'MID_REAR_RIGHT_LEG', 'REAR_RIGHT_LEG'];
            const legZs = [0.42, 0.2, -0.02, -0.24];
            const ehLeg = (side, z) => {
                const g = new THREE.Group();
                const u = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 0.38, 4), obsidian); u.position.set(side * 0.18, -0.04, 0); u.rotation.z = side * 1.1; g.add(u);
                const joint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), magma); joint.position.set(side * 0.36, -0.24, 0); g.add(joint); this._ehGlow.push(joint.material);
                const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.008, 0.34, 4), obsidian); l.position.set(side * 0.4, -0.42, 0); l.rotation.z = side * 0.25; g.add(l);
                g.position.set(0, 0.54, z); g._side = side; this.bodyGroup.add(g); this._legs.push(g); return g;
            };
            const legMeshesL = legZs.map(z => ehLeg(-1, z));
            const legMeshesR = legZs.map(z => ehLeg(1, z));
            this._partMeshMap = {
                HEAD: this.head, CEPHALOTHORAX: this.cephalo, ABDOMEN: this.abdomen,
                TAIL: this.tail, STINGER: this.stinger, PINCER_LEFT: this.pincerL, PINCER_RIGHT: this.pincerR
            };
            legKeysL.forEach((k, i) => { this._partMeshMap[k] = legMeshesL[i]; });
            legKeysR.forEach((k, i) => { this._partMeshMap[k] = legMeshesR[i]; });
            const allMeshes = [this.head, this.cephalo, this.abdomen, this.tail, this.stinger, this.pincerL, this.pincerR]
                .concat(this._ehSeams).concat(legMeshesL).concat(legMeshesR);
            this._cascadeRules = [
                { gone: ['CEPHALOTHORAX'], hide: allMeshes },
                { gone: ['ABDOMEN'], hide: [this.abdomen, this.tail, this.stinger].concat(this._ehSeams) },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['TAIL'], hide: [this.tail, this.stinger] },
                { gone: ['STINGER'], hide: [this.stinger] },
                { gone: ['PINCER_LEFT'], hide: [this.pincerL] },
                { gone: ['PINCER_RIGHT'], hide: [this.pincerR] },
                ...legKeysL.map((k, i) => ({ gone: [k], hide: [legMeshesL[i]] })),
                ...legKeysR.map((k, i) => ({ gone: [k], hide: [legMeshesR[i]] }))
            ];
        }

        // ── Gravity Worm: dark segmented serpent warping space, event-horizon glow
        _buildGravityWorm() {
            const p = this.profile;
            const voidMat = this._mat(p.bodyColor, 1.0, 0.3, 0x100820);
            this._gwRings = [];
            this._buildWorm({
                segMat: voidMat, count: 9, y: 0.75, headR: 0.32, bodyR: 0.36, spacing: 0.34, taper: 0.5,
                onHead: (head) => {
                    // Eyeless head: a collapsing dark maw ringed by an accretion disc.
                    const maw = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.04, 0.22, 14), this._mat(0x000000, 1.0, 0.4)); maw.position.set(0, 0, 0.3); maw.rotation.x = Math.PI / 2; head.add(maw);
                    const disc = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.4, 24), this._mat(p.accent, 0.55, 0.1, p.accent)); disc.position.set(0, 0, 0.3); disc.rotation.z = 0.3; head.add(disc); this._gwRings.push(disc.material); this._gwDisc = disc;
                    // A pair of faint singularity glints.
                    this._eye(head, -0.1, 0.08, 0.14, 0.03, p.accent); this._eye(head, 0.1, 0.08, 0.14, 0.03, p.accent);
                },
                onSeg: (seg, i, r, z) => {
                    // Concentric event-horizon halo warping around each segment.
                    const halo = new THREE.Mesh(new THREE.TorusGeometry(r * 1.5, 0.02, 8, 20), this._mat(p.accent, 0.4, 0.1, p.accent));
                    halo.position.set(0, 0.75, z); halo.rotation.x = Math.PI / 2 + Math.sin(i) * 0.3; this.bodyGroup.add(halo); this._ride(seg, halo); this._gwRings.push(halo.material); (this._gwHalos = this._gwHalos || []).push(halo);
                    // Lensing shimmer shell pulled toward the body.
                    const lens = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 12, 10), this._mat(0x3a2a6a, 0.16, 0.05, p.accent)); lens.position.set(0, 0.75, z); this.bodyGroup.add(lens); this._ride(seg, lens); this._gwRings.push(lens.material); (this._gwLens = this._gwLens || []).push(lens);
                }
            });
            const extra = (this._gwHalos || []).concat(this._gwLens || []);
            if (extra.length) this._cascadeRules[0].hide.push(...extra);
        }

        // ── Temporal Hornet: golden striped hornet, big stinger, time-warp wings ─
        _buildTemporalHornet() {
            const p = this.profile;
            const gold = this._skinMat(p.bodyColor, 0.4);
            const black = this._mat(0x141008, 1.0, 0.7);
            this.thorax = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), gold); this.thorax.position.set(0, 0.98, 0.2); this.thorax.scale.set(1, 0.95, 1.1); this.bodyGroup.add(this.thorax);
            // Striped tapering abdomen.
            this.abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14), gold); this.abdomen.position.set(0, 0.98, -0.4); this.abdomen.scale.set(1, 1, 1.7); this.bodyGroup.add(this.abdomen);
            for (let i = 0; i < 3; i++) { const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.33 - i * 0.04, 0.05, 8, 16), black); stripe.position.set(0, 0.98, -0.3 - i * 0.28); stripe.rotation.x = Math.PI / 2; const sc = 1 - i * 0.1; stripe.scale.set(sc, sc, 1); this.bodyGroup.add(stripe); }
            // Big stinger at the tail.
            this.stinger = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 6), black); this.stinger.position.set(0, 0.98, -1.0); this.stinger.rotation.x = -Math.PI / 2; this.bodyGroup.add(this.stinger);
            // Head with mandibles + antennae.
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), gold); h.scale.set(1.1, 0.9, 0.95); this.head.add(h);
            this._eye(this.head, -0.12, 0.03, 0.1, 0.07, p.accent); this._eye(this.head, 0.12, 0.03, 0.1, 0.07, p.accent);
            this._antennae(this.head, black, p.accent);
            this.head.position.set(0, 1.0, 0.56); this.bodyGroup.add(this.head);
            this.mandibles = new THREE.Group();
            for (const mx of [-0.08, 0.08]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 4), black); m.position.set(mx, 0.92, 0.72); m.rotation.x = 1.5; m.rotation.z = -mx * 3; this.mandibles.add(m); }
            this.bodyGroup.add(this.mandibles);
            // Shimmering time-warped wings with afterimage echo planes.
            const wingMat = this._mat(p.accent, 0.42, 0.15, p.accent);
            const echoMat = this._mat(p.accent, 0.18, 0.1, p.accent);
            this._thWings = [wingMat, echoMat];
            // The real wings, then a faint time-echo of each on the same root that
            // beats a beat behind and swept further back.
            this._wingPair(0.1, 1.17, 0.15, { len: 1.3, width: 0.4, mat: wingMat, seg: 14, sweep: 0.35, lift: 0.2, amp: 0.5, rate: 30, rateFast: 42 });
            this._thEcho = this._wingPair(0.1, 1.17, 0.1, { len: 1.3, width: 0.4, mat: echoMat, seg: 14, sweep: 0.55, lift: 0.2, amp: 0.5, rate: 30, rateFast: 42, phase: -0.7 });
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, this.stinger], legY: 0.82, mat: black });
        }

        // ════ Level 1-5 roster: small fry with a build of their own ══════════

        _ball(parent, mat, r, pos, scl, seg) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg ? seg[0] : 10, seg ? seg[1] : 8), mat);
            m.position.set(pos[0], pos[1], pos[2]); if (scl) m.scale.set(scl[0], scl[1], scl[2]);
            parent.add(m); return m;
        }
        // Leg pairs front to back from [{ hip, pts, r }]; returns { L, R }.
        _legSet(defs, mat, jointMat) {
            const L = [], R = [];
            defs.forEach(d => { L.push(this._jointLeg(-1, d.hip, d.pts, mat, d.r || 0.022, jointMat)); R.push(this._jointLeg(1, d.hip, d.pts, mat, d.r || 0.022, jointMat)); });
            return { L, R };
        }
        // A ring hugging a body: rotate its axis (z) onto dir.
        _band(parent, mat, pos, radius, tube, dir) {
            const t = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 4, 10), mat);
            t.position.set(pos[0], pos[1], pos[2]);
            if (dir) t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
            parent.add(t); return t;
        }
        // CrawlingHand archetype keys for a hand built of finger groups.
        _wireHand(o) {
            const fk = ['THUMB', 'INDEX_FINGER', 'MIDDLE_FINGER', 'RING_FINGER', 'LITTLE_FINGER'];
            this._partMeshMap = { PALM: o.palm, WRIST_STUMP: o.stump, KNUCKLES: o.knuckles, NAILS: o.nails[0] };
            fk.forEach((k, i) => { this._partMeshMap[k] = o.fingers[i]; });
            this._cascadeRules = [
                { gone: ['PALM'], hide: [o.palm, o.stump, o.knuckles, ...o.fingers, ...(o.extra || [])] },
                { gone: ['WRIST_STUMP'], hide: [o.stump] },
                { gone: ['KNUCKLES'], hide: [o.knuckles] },
                { gone: ['NAILS'], hide: o.nails },
                ...fk.map((k, i) => ({ gone: [k], hide: [o.fingers[i]] }))
            ];
        }

        // ── Dung Beetle: shovel-faced, head down, hind legs up on its ball ───
        _buildLvDungBeetle() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.35);
            const dark = this._mat(0x140e08, 1.0, 0.5);
            this.thorax = this._ball(this.bodyGroup, shell, 0.26, [0, 0.5, 0.2], [1.2, 0.7, 0.9]);
            this.abdomen = this._ball(this.bodyGroup, shell, 0.36, [0, 0.6, -0.2], [1.05, 0.75, 1.15]); this.abdomen.rotation.x = 0.35;
            this.head = new THREE.Group(); this.head.position.set(0, 0.4, 0.44); this.bodyGroup.add(this.head);
            this._ball(this.head, shell, 0.15, [0, 0, 0], [1.2, 0.8, 1]);
            // Toothed shovel of a face and one horn curling back over the head.
            const shovel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.04, 6), shell); shovel.position.set(0, -0.04, 0.1); shovel.rotation.x = 0.3; this.head.add(shovel);
            for (const tx of [-0.11, -0.04, 0.04, 0.11]) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), dark); tooth.position.set(tx, -0.08, 0.3); tooth.rotation.x = Math.PI / 2; this.head.add(tooth); }
            this._rod(this.head, shell, [0, 0.06, 0.02], [0, 0.26, -0.04], 0.045, 0.03, 5);
            this._rod(this.head, shell, [0, 0.26, -0.04], [0, 0.34, -0.2], 0.03, 0.008, 5);
            this._eye(this.head, -0.15, 0.03, 0.05, 0.035, 0xffaa44); this._eye(this.head, 0.15, 0.03, 0.05, 0.035, 0xffaa44);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, dark, [s * 0.05, -0.08, 0.1], [s * 0.02, -0.12, 0.22], 0.025, 0.008, 4);
            // The ball: lumpy dung bristling with straw, a lost coin pressed into it.
            const dung = this._skinMat(p.accent, 0.95);
            this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), dung); this.ball.position.set(0, 0.44, -0.92); this.bodyGroup.add(this.ball);
            const straw = this._mat(0xd8b04a, 1.0, 0.8), up = new THREE.Vector3(0, 1, 0);
            for (const d of [[0.6, 0.6, 0.2], [-0.7, 0.3, -0.4], [0.2, -0.3, -0.9], [-0.3, 0.8, 0.3], [0.8, -0.2, -0.5]]) {
                const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
                const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 3), straw);
                const lean = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.6).add(dir).normalize();
                st.position.copy(dir).multiplyScalar(0.42); st.quaternion.setFromUnitVectors(up, lean); this.ball.add(st);
            }
            const cdir = new THREE.Vector3(0.4, 0.6, -0.7).normalize();
            const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 8), this._mat(0xe8c040, 1.0, 0.2, 0x3a2a00));
            coin.position.copy(cdir).multiplyScalar(0.4); coin.quaternion.setFromUnitVectors(up, cdir); this.ball.add(coin);
            const legs = this._legSet([
                { hip: [0.16, 0.4, 0.32], pts: [[0.16, -0.06, 0.12], [0.2, -0.4, 0.22]], r: 0.028 },
                { hip: [0.2, 0.42, 0.05], pts: [[0.22, -0.04, -0.02], [0.36, -0.42, -0.06]], r: 0.026 },
                { hip: [0.18, 0.5, -0.3], pts: [[0.22, 0.28, -0.12], [0.02, 0.16, -0.36]], r: 0.028 }
            ], dark);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.ball], legsL: legs.L, legsR: legs.R, mat: shell });
        }

        // ── Garden Pillbug: an arched woodlouse of overlapping grey plates ────
        _buildLvGardenPillbug() {
            const p = this.profile;
            const plateA = this._skinMat(p.bodyColor, 0.45), plateB = this._skinMat(0x4a4e56, 0.5);
            const belly = this._mat(0x34343a, 1.0, 0.7), spot = this._mat(p.accent, 1.0, 0.5);
            this.belly = this._ball(this.bodyGroup, belly, 0.3, [0, 0.36, 0], [1.05, 0.55, 1.75]);
            this.thorax = new THREE.Group(); this.abdomen = new THREE.Group(); this.bodyGroup.add(this.thorax); this.bodyGroup.add(this.abdomen);
            // Seven plates laid along an arch, each turned to follow it.
            for (let i = 0; i < 7; i++) {
                const phi = 1.05 - i * 0.33, w = 1.0 - Math.abs(i - 2.5) * 0.06;
                const pl = this._ball(i < 3 ? this.thorax : this.abdomen, i % 2 ? plateB : plateA, 0.3, [0, 0.2 + 0.42 * Math.cos(phi), 0.42 * Math.sin(phi)], [1.25 * w, 0.42, 0.55]);
                pl.rotation.x = phi;
                // A row of pale spots down each flank, the woodlouse's tell.
                if (i % 2 === 0) for (const s of [-1, 1]) this._ball(pl, spot, 0.04, [s * 0.24, 0.16, 0], null, [6, 4]);
            }
            this.head = new THREE.Group(); this.head.position.set(0, 0.27, 0.46); this.bodyGroup.add(this.head);
            this._ball(this.head, belly, 0.12, [0, 0, 0], [1.3, 0.7, 0.9]);
            this._eye(this.head, -0.11, 0.03, 0.05, 0.025, 0xffffff); this._eye(this.head, 0.11, 0.03, 0.05, 0.025, 0xffffff);
            for (const s of [-1, 1]) { this._rod(this.head, belly, [s * 0.08, 0.02, 0.06], [s * 0.2, 0.1, 0.24], 0.016, 0.012); this._rod(this.head, belly, [s * 0.2, 0.1, 0.24], [s * 0.28, -0.06, 0.36], 0.012, 0.007); }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, belly, [s * 0.03, -0.04, 0.08], [s * 0.015, -0.08, 0.14], 0.015, 0.005);
            // Twin uropods at the tail.
            this._uropods = [];
            for (const s of [-1, 1]) this._uropods.push(this._rod(this.bodyGroup, belly, [s * 0.08, 0.34, -0.42], [s * 0.15, 0.3, -0.58], 0.03, 0.01));
            const defs = [];
            for (let i = 0; i < 7; i++) defs.push({ hip: [0.2, 0.3, 0.36 - i * 0.12], pts: [[0.12, -0.06, 0.02], [0.2, -0.3, 0.04]], r: 0.018 });
            const legs = this._legSet(defs, belly);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.belly, ...this._uropods],
                legsL: [legs.L[0], legs.L[3], legs.L[6]], legsR: [legs.R[0], legs.R[3], legs.R[6]], mat: plateA });
        }

        // ── Picnic Gnat: a hunched gnat with a jam drop, its cloud about it ──
        _buildLvPicnicGnat() {
            const p = this.profile;
            this._flyer = true;
            const body = this._skinMat(p.bodyColor, 0.6);
            this.thorax = this._ball(this.bodyGroup, body, 0.16, [0, 1.1, 0.04], [1, 1.15, 1.1]);
            this.abdomen = this._rod(this.bodyGroup, body, [0, 1.06, -0.06], [0, 0.94, -0.6], 0.1, 0.035, 6);
            this.head = new THREE.Group(); this.head.position.set(0, 1.07, 0.22); this.bodyGroup.add(this.head);
            this._ball(this.head, body, 0.09, [0, 0, 0]);
            const eyeMat = this._mat(p.accent, 1.0, 0.3, 0x400810);
            for (const s of [-1, 1]) this._ball(this.head, eyeMat, 0.065, [s * 0.06, 0.02, 0.04], null, [8, 6]);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            this._rod(this.mandibles, body, [0, -0.06, 0.06], [0, -0.17, 0.14], 0.015, 0.006);
            // A stolen drop of jam clings to the tip of its abdomen.
            this.jam = this._ball(this.bodyGroup, this._mat(p.accent, 0.85, 0.15, 0x3a0010), 0.11, [0, 0.86, -0.64], [1, 1.3, 1]);
            const legs = this._legSet([
                { hip: [0.05, 1.0, 0.1], pts: [[0.14, -0.2, 0.06], [0.18, -0.58, 0.1]], r: 0.012 },
                { hip: [0.05, 1.0, 0.04], pts: [[0.16, -0.2, 0.0], [0.2, -0.6, 0.0]], r: 0.012 },
                { hip: [0.05, 1.0, -0.02], pts: [[0.14, -0.2, -0.06], [0.18, -0.62, -0.12]], r: 0.012 }
            ], body);
            this._wingPair(0.05, 1.2, 0.04, { len: 0.72, width: 0.2, mat: this._mat(0xe8eef8, 0.35, 0.2), sweep: 0.85, lift: 0.12, amp: 0.55, rate: 40, rateFast: 52 });
            // The rest of the cloud: tiny gnats orbiting it, meant to hang in the air.
            this._gnatCloud = new THREE.Group(); this._gnatCloud.userData.float = true; this._gnatCloud.position.set(0, 1.0, 0); this.bodyGroup.add(this._gnatCloud);
            const mini = this._mat(0x1a1a14, 1.0, 0.6), miniWing = this._mat(0xeef2ff, 0.4, 0.2);
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2, rr = 0.6 + this.idRand() * 0.3;
                const g = new THREE.Group(); g.position.set(Math.cos(a) * rr, (this.idRand() - 0.5) * 0.6, Math.sin(a) * rr); g.rotation.y = -a;
                this._ball(g, mini, 0.035, [0, 0, 0], [1, 1, 1.6], [6, 4]);
                for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.04, 5), miniWing); w.scale.set(1.5, 0.6, 1); w.position.set(s * 0.05, 0.02, 0); w.rotation.x = -Math.PI / 2; g.add(w); }
                this._gnatCloud.add(g);
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.jam, this.wings], legsL: legs.L, legsR: legs.R, mat: body });
        }

        // ── Hearth Cricket: sooty, flat-backed, whip antennae, an ember file ──
        _buildLvHearthCricket() {
            const p = this.profile;
            const brown = this._skinMat(p.bodyColor, 0.55), soot = this._mat(0x1a1410, 1.0, 0.85);
            const ember = this._mat(p.accent, 1.0, 0.4, p.accent); this._emberMats = [ember];
            this.thorax = this._ball(this.bodyGroup, brown, 0.2, [0, 0.42, 0.2], [1.2, 0.85, 1.0]);
            this.abdomen = this._ball(this.bodyGroup, brown, 0.26, [0, 0.4, -0.26], [1, 0.7, 1.5]);
            // Wings folded flat on the back; the singing file across them glows like a coal.
            this.wingCase = new THREE.Group(); this.bodyGroup.add(this.wingCase);
            for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.62), soot); w.position.set(s * 0.1, 0.56, -0.24); w.rotation.z = -s * 0.12; this.wingCase.add(w); }
            for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.02), ember); r.position.set(0, 0.577, -0.02 - k * 0.05); this.wingCase.add(r); }
            this.head = new THREE.Group(); this.head.position.set(0, 0.42, 0.42); this.bodyGroup.add(this.head);
            this._ball(this.head, brown, 0.17, [0, 0, 0]);
            this._eye(this.head, -0.1, 0.05, 0.12, 0.04, p.accent); this._eye(this.head, 0.1, 0.05, 0.12, 0.04, p.accent);
            // Antennae longer than the whole body, swept back over it.
            for (const s of [-1, 1]) {
                const pts = [[s * 0.05, 0.12, 0.08], [s * 0.22, 0.42, -0.15], [s * 0.36, 0.5, -0.75], [s * 0.42, 0.36, -1.35]];
                for (let i = 0; i < 3; i++) this._rod(this.head, soot, pts[i], pts[i + 1], 0.014 - i * 0.003, 0.011 - i * 0.003, 3);
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, soot, [s * 0.05, -0.1, 0.12], [s * 0.02, -0.16, 0.2], 0.025, 0.008);
            this._cerci = [];
            for (const s of [-1, 1]) this._cerci.push(this._rod(this.bodyGroup, soot, [s * 0.05, 0.42, -0.6], [s * 0.2, 0.48, -0.92], 0.025, 0.008));
            const lL = [], lR = [];
            for (const s of [-1, 1]) {
                const out = s < 0 ? lL : lR;
                out.push(this._jointLeg(s, [0.14, 0.36, 0.3], [[0.12, -0.1, 0.1], [0.2, -0.36, 0.18]], soot, 0.02));
                out.push(this._jointLeg(s, [0.12, 0.38, 0.08], [[0.18, -0.08, 0.0], [0.3, -0.38, -0.04]], soot, 0.02));
                out.push(this._jointLeg(s, [0.2, 0.42, -0.18], [[0.18, 0.26, -0.22], [0.24, -0.42, -0.48]], brown, 0.05, soot));
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wingCase, ...this._cerci], legsL: lL, legsR: lR, mat: brown });
        }

        // ── Red Fire Ant: a soldier with a head too big for it, sting raised ──
        _buildLvRedFireAnt() {
            const p = this.profile;
            const red = this._skinMat(p.bodyColor, 0.4), dark = this._mat(0x2a0a06, 1.0, 0.4);
            const venom = this._mat(p.accent, 1.0, 0.2, p.accent); this._venomMats = [venom];
            this.head = new THREE.Group(); this.head.position.set(0, 0.62, 0.5); this.bodyGroup.add(this.head);
            this._ball(this.head, red, 0.26, [0, 0, 0], [1.15, 0.9, 1]);
            this._eye(this.head, -0.19, 0.06, 0.12, 0.045, p.accent); this._eye(this.head, 0.19, 0.06, 0.12, 0.045, p.accent);
            // Elbowed antennae: a long scape, a knee, then the whip.
            for (const s of [-1, 1]) {
                this._rod(this.head, dark, [s * 0.08, 0.12, 0.18], [s * 0.22, 0.36, 0.26], 0.02, 0.016);
                this._ball(this.head, dark, 0.024, [s * 0.22, 0.36, 0.26], null, [5, 4]);
                this._rod(this.head, dark, [s * 0.22, 0.36, 0.26], [s * 0.38, 0.3, 0.52], 0.016, 0.01);
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) { this._rod(this.mandibles, dark, [s * 0.1, -0.08, 0.2], [s * 0.2, -0.1, 0.38], 0.045, 0.03, 5); this._rod(this.mandibles, dark, [s * 0.2, -0.1, 0.38], [s * 0.05, -0.12, 0.5], 0.03, 0.008, 5); }
            this.thorax = this._ball(this.bodyGroup, red, 0.16, [0, 0.6, 0.12], [1, 0.95, 1.6]);
            // Thin waist with its little node, then the banded gaster held high.
            this._waist = this._rod(this.bodyGroup, red, [0, 0.58, -0.08], [0, 0.6, -0.28], 0.05, 0.05, 5);
            this._ball(this._waist, red, 0.07, [0, 0, 0.05], [1, 0.6, 1.2], [6, 5]);
            this.abdomen = this._ball(this.bodyGroup, red, 0.3, [0, 0.68, -0.52], [1, 0.88, 1.25]); this.abdomen.rotation.x = 0.25;
            for (const z of [0.08, -0.06, -0.18]) this._band(this.abdomen, dark, [0, 0, z], Math.sqrt(0.09 - z * z), 0.02);
            const sting = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), dark); sting.position.set(0, 0.02, -0.34); sting.rotation.x = -Math.PI / 2; this.abdomen.add(sting);
            this._ball(this.abdomen, venom, 0.035, [0, 0.02, -0.42], null, [6, 4]);
            const legs = this._legSet([
                { hip: [0.1, 0.55, 0.26], pts: [[0.22, 0.14, 0.1], [0.42, -0.55, 0.22]] },
                { hip: [0.1, 0.55, 0.12], pts: [[0.24, 0.14, 0.0], [0.44, -0.55, 0.0]] },
                { hip: [0.1, 0.55, -0.02], pts: [[0.22, 0.14, -0.1], [0.42, -0.55, -0.24]] }
            ], dark);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this._waist], legsL: legs.L, legsR: legs.R, mat: red });
        }

        // ── Meadow Firefly: shield-hooded beetle with a two-lamp tail ────────
        _buildLvMeadowFirefly() {
            const p = this.profile;
            this._flyer = true;
            const brown = this._skinMat(p.bodyColor, 0.5), shieldMat = this._mat(0xd87a4a, 1.0, 0.5), black = this._mat(0x141010, 1.0, 0.5);
            const lantern = this._mat(p.accent, 1.0, 0.3, p.accent); this._lanterns = [lantern];
            this.thorax = this._ball(this.bodyGroup, brown, 0.16, [0, 1.02, 0.18], [1, 0.9, 1.1]);
            // The pronotum: a flat hood over the head with two blood-red spots.
            this.shield = this._ball(this.bodyGroup, shieldMat, 0.2, [0, 1.12, 0.3], [1.15, 0.4, 1.0]);
            for (const s of [-1, 1]) this._ball(this.shield, this._mat(0xc81a1a, 1.0, 0.5), 0.045, [s * 0.08, 0.18, 0.05], null, [6, 4]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.02, 0.42); this.bodyGroup.add(this.head);
            this._ball(this.head, black, 0.09, [0, 0, 0]);
            this._eye(this.head, -0.06, 0.0, 0.05, 0.035, p.accent); this._eye(this.head, 0.06, 0.0, 0.05, 0.035, p.accent);
            for (const s of [-1, 1]) {
                this._rod(this.head, black, [s * 0.04, 0.04, 0.06], [s * 0.14, 0.2, 0.3], 0.012, 0.008);
                for (let k = 1; k <= 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), black); b.position.set(s * (0.04 + 0.025 * k), 0.04 + 0.04 * k, 0.06 + 0.06 * k); this.head.add(b); }
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, black, [s * 0.03, -0.05, 0.06], [s * 0.01, -0.09, 0.12], 0.012, 0.004);
            this.abdomen = this._ball(this.bodyGroup, brown, 0.17, [0, 0.98, -0.2], [1, 0.8, 1.9]);
            this._lamps = [this._ball(this.bodyGroup, lantern, 0.15, [0, 0.94, -0.5], [1, 0.8, 1.1]), this._ball(this.bodyGroup, lantern, 0.11, [0, 0.92, -0.66])];
            // Wing cases raised stiffly, the hind wings beating beneath them.
            const caseMat = this._mat(0x3a2418, 1.0, 0.5);
            this._wingPair(0.06, 1.12, 0.12, { len: 0.6, width: 0.2, mat: caseMat, sweep: 1.2, lift: 0.75, amp: 0.06, rate: 6, rateFast: 10 });
            this._wingPair(0.06, 1.1, 0.08, { len: 0.75, width: 0.26, mat: this._mat(0xe8d8a8, 0.35, 0.2), sweep: 0.55, lift: 0.1, amp: 0.55, rate: 30, rateFast: 42 });
            const legs = this._legSet([
                { hip: [0.06, 0.96, 0.24], pts: [[0.12, -0.14, 0.04], [0.14, -0.42, 0.08]], r: 0.014 },
                { hip: [0.06, 0.96, 0.16], pts: [[0.14, -0.14, 0.0], [0.16, -0.44, -0.02]], r: 0.014 },
                { hip: [0.06, 0.96, 0.08], pts: [[0.12, -0.14, -0.06], [0.14, -0.44, -0.14]], r: 0.014 }
            ], black);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.shield, this.wings, ...this._lamps], legsL: legs.L, legsR: legs.R, mat: brown });
        }

        // ── Pond Damselfly: barbell head, needle body, wings folded up in a V ─
        _buildLvPondDamselfly() {
            const p = this.profile;
            this._flyer = true;
            const blue = this._skinMat(p.bodyColor, 0.35), black = this._mat(0x101418, 1.0, 0.4), eyeMat = this._mat(p.accent, 1.0, 0.2, p.accent);
            this.thorax = this._ball(this.bodyGroup, blue, 0.14, [0, 1.06, 0.06], [0.9, 1.2, 1.15]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.1, 0.24); this.bodyGroup.add(this.head);
            this._ball(this.head, blue, 0.07, [0, 0, 0], [2.0, 0.9, 0.9]);
            for (const s of [-1, 1]) this._ball(this.head, eyeMat, 0.085, [s * 0.17, 0, 0], null, [8, 6]);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, black, [s * 0.03, -0.04, 0.04], [s * 0.01, -0.08, 0.1], 0.014, 0.004);
            const a = [0, 1.04, -0.06], b = [0, 0.98, -1.35];
            this.abdomen = this._rod(this.bodyGroup, blue, a, b, 0.045, 0.03, 5);
            // Black rings down the needle, and the clasper fork at its end.
            this._rings = [];
            for (let k = 1; k <= 7; k++) { const f = k / 8; this._rings.push(this._band(this.bodyGroup, black, [0, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], 0.045 - 0.015 * f, 0.012, [0, b[1] - a[1], b[2] - a[2]])); }
            for (const s of [-1, 1]) this._rings.push(this._rod(this.bodyGroup, black, [0, 0.98, -1.33], [s * 0.05, 1.0, -1.45], 0.012, 0.005));
            const wingMat = this._mat(0xd8f0ff, 0.3, 0.2), stigma = this._mat(0x1a2030, 1.0, 0.4);
            const ws = this._wingPair(0.03, 1.18, 0.1, { len: 0.95, width: 0.13, mat: wingMat, sweep: 0.95, lift: 0.95, amp: 0.2, rate: 14, rateFast: 26 })
                .concat(this._wingPair(0.03, 1.18, 0.02, { len: 0.9, width: 0.13, mat: wingMat, sweep: 1.05, lift: 0.9, amp: 0.2, rate: 14, rateFast: 26, phase: 0.8 }));
            ws.forEach(w => { const st = new THREE.Mesh(new THREE.CircleGeometry(0.035, 5), stigma); st.position.set(w._side * 0.82, 0.004, 0); st.rotation.x = -Math.PI / 2; w._blade.add(st); });
            // Spiny legs held forward as a basket for catching gnats.
            const legs = this._legSet([
                { hip: [0.04, 0.98, 0.14], pts: [[0.1, -0.12, 0.14], [0.12, -0.3, 0.26]], r: 0.012 },
                { hip: [0.04, 0.98, 0.08], pts: [[0.12, -0.12, 0.06], [0.16, -0.34, 0.12]], r: 0.012 },
                { hip: [0.04, 0.98, 0.02], pts: [[0.12, -0.12, -0.02], [0.18, -0.36, 0.0]], r: 0.012 }
            ], black);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, ...this._rings], legsL: legs.L, legsR: legs.R, mat: blue });
        }

        // ── Lamp Moth: dusty delta wings, lamp-bright eyes, a haze of powder ──
        _buildLvLampMoth() {
            const p = this.profile;
            this._flyer = true;
            const fur = this._skinMat(p.bodyColor, 0.95), dusty = this._mat(0x9a9284, 0.95, 0.9), dark = this._mat(0x3a342c, 1.0, 0.8);
            const lamp = this._mat(p.accent, 1.0, 0.2, p.accent); this._lampEyes = [lamp];
            this.thorax = this._ball(this.bodyGroup, fur, 0.22, [0, 1.08, 0.12]);
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.06, 5, 10), fur); collar.position.set(0, 1.1, 0.3); this.bodyGroup.add(collar);
            this.abdomen = this._rod(this.bodyGroup, fur, [0, 1.06, -0.04], [0, 1.0, -0.62], 0.14, 0.06, 6);
            this._ball(this.abdomen, fur, 0.07, [0, 0.29, 0], null, [6, 4]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.08, 0.38); this.bodyGroup.add(this.head);
            this._ball(this.head, fur, 0.12, [0, 0, 0]);
            for (const s of [-1, 1]) this._ball(this.head, lamp, 0.055, [s * 0.08, 0.02, 0.07], null, [8, 6]);
            // Combed antennae.
            for (const s of [-1, 1]) {
                this._rod(this.head, dark, [s * 0.04, 0.08, 0.06], [s * 0.2, 0.3, 0.16], 0.012, 0.008);
                for (let k = 1; k <= 4; k++) { const f = k / 5; this._rod(this.head, dark, [s * (0.04 + 0.16 * f), 0.08 + 0.22 * f, 0.06 + 0.1 * f], [s * (0.08 + 0.16 * f), 0.06 + 0.22 * f, 0.12 + 0.1 * f], 0.006, 0.003, 3); }
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8, Math.PI * 1.6), dark); coil.position.set(0, -0.1, 0.06); coil.rotation.y = Math.PI / 2; this.mandibles.add(coil);
            // Broad triangular wings held flat, a dark zigzag across each.
            const delta = [[0, -0.15], [1.0, 0.05], [0.85, 0.55], [0, 0.55]];
            const flap = { mat: dusty, shape: delta, lift: 0.08, amp: 0.3, rate: 5, rateFast: 14 };
            for (const s of [-1, 1]) {
                const w = this._hingeWing(s, 0.1, 1.16, 0.14, Object.assign({ len: 0.95, width: 0.9, sweep: 0.15 }, flap));
                this._rod(w._blade, dark, [s * 0.1, 0.004, -0.22], [s * 0.45, 0.004, -0.12], 0.012, 0.012, 3);
                this._rod(w._blade, dark, [s * 0.45, 0.004, -0.12], [s * 0.78, 0.004, -0.3], 0.012, 0.008, 3);
            }
            // Wing powder shaken loose, hanging in the air around it.
            this._dust = new THREE.Group(); this._dust.userData.float = true; this._dust.position.set(0, 1.05, -0.1); this.bodyGroup.add(this._dust);
            const powder = this._mat(0xd8d0c0, 0.35, 0.9);
            for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const d = this._ball(this._dust, powder, 0.05 + this.idRand() * 0.04, [Math.cos(a) * 0.9, (this.idRand() - 0.5) * 0.5, Math.sin(a) * 0.7], null, [6, 4]); d._y = d.position.y; }
            const legs = this._legSet([
                { hip: [0.08, 0.96, 0.2], pts: [[0.12, -0.1, 0.06], [0.16, -0.3, 0.1]], r: 0.016 },
                { hip: [0.08, 0.96, 0.1], pts: [[0.14, -0.1, 0.0], [0.18, -0.32, -0.02]], r: 0.016 },
                { hip: [0.08, 0.96, 0.0], pts: [[0.12, -0.1, -0.06], [0.16, -0.32, -0.12]], r: 0.016 }
            ], fur);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, collar], legsL: legs.L, legsR: legs.R, mat: fur });
        }

        // ── Lost Glove: a woollen glove on four fat fingers, button eyes ─────
        _buildLvLostGlove() {
            const p = this.profile;
            const wool = this._skinMat(p.bodyColor, 0.95), rib = this._mat(0x6a2020, 1.0, 0.95);
            const buttonMat = this._mat(p.accent, 1.0, 0.3), darn = this._mat(0xd8c060, 1.0, 0.9), thread = this._mat(0x201818, 1.0, 0.8);
            this.palm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.48), wool); this.palm.position.set(0, 0.5, 0); this.bodyGroup.add(this.palm);
            // Ribbed cuff with a crust of snow.
            this.cuff = new THREE.Group(); this.cuff.position.set(0, 0.5, -0.22); this.bodyGroup.add(this.cuff);
            const cuffBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.24, 8, 1, true), rib); cuffBody.position.z = -0.12; cuffBody.rotation.x = Math.PI / 2; this.cuff.add(cuffBody);
            for (let k = 0; k < 4; k++) this._band(this.cuff, rib, [0, 0, -0.03 - k * 0.06], 0.21, 0.02);
            const snow = this._mat(0xf4f8ff, 1.0, 0.9);
            for (const d of [[0.12, 0.17, -0.1], [-0.05, 0.2, -0.16], [-0.15, 0.13, -0.05]]) this._ball(this.cuff, snow, 0.05, d, null, [6, 4]);
            // A face sewn on the back of the hand: two buttons and an X-stitch mouth.
            for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), buttonMat); b.position.set(s * 0.11, 0.59, -0.08); this.bodyGroup.add(b); }
            for (let k = -1; k <= 1; k++) { this._rod(this.bodyGroup, thread, [k * 0.07 - 0.025, 0.582, 0.08], [k * 0.07 + 0.025, 0.582, 0.13], 0.008, 0.008, 3); this._rod(this.bodyGroup, thread, [k * 0.07 + 0.025, 0.582, 0.08], [k * 0.07 - 0.025, 0.582, 0.13], 0.008, 0.008, 3); }
            this.knuckles = new THREE.Group(); this.bodyGroup.add(this.knuckles);
            for (const x of [-0.16, -0.05, 0.05, 0.16]) this._ball(this.knuckles, wool, 0.05, [x, 0.58, 0.22], null, [6, 4]);
            // Fingers: fat woollen tubes walking on darned tips; the little one is empty and drags.
            this._fingers = []; this._darns = [];
            const defs = [
                { at: [-0.26, 0.5, 0.0], pts: [[-0.14, 0.02, 0.06], [-0.24, -0.46, 0.1]] },
                { at: [-0.18, 0.5, 0.22], pts: [[0, 0.06, 0.14], [0, -0.12, 0.3], [0, -0.46, 0.36]] },
                { at: [-0.06, 0.5, 0.22], pts: [[0, 0.07, 0.16], [0, -0.12, 0.34], [0, -0.46, 0.4]] },
                { at: [0.06, 0.5, 0.22], pts: [[0, 0.06, 0.14], [0, -0.12, 0.3], [0, -0.46, 0.36]] },
                { at: [0.18, 0.5, 0.22], pts: [[0, -0.04, 0.16], [0, -0.3, 0.26], [0, -0.48, 0.32]], limp: true }
            ];
            defs.forEach(d => {
                const g = this._jointLeg(1, [0, d.at[1], d.at[2]], d.pts, wool, d.limp ? 0.04 : 0.055);
                g.position.x = d.at[0];
                const e = d.pts[d.pts.length - 1];
                this._ball(g, wool, d.limp ? 0.04 : 0.055, e, null, [6, 4]);
                const patch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), darn); patch.position.set(e[0], e[1] + 0.03, e[2] + 0.04); g.add(patch);
                this._darns.push(patch); this._fingers.push(g);
            });
            this._wireHand({ palm: this.palm, stump: this.cuff, knuckles: this.knuckles, nails: this._darns, fingers: this._fingers });
        }

        // ── Paper Wasp: wasp-waisted, dangling legs, clutching a scrap of comb
        _buildLvPaperWasp() {
            const p = this.profile;
            this._flyer = true;
            const black = this._skinMat(p.bodyColor, 0.45), yellow = this._mat(p.accent, 1.0, 0.45);
            this.thorax = this._ball(this.bodyGroup, black, 0.15, [0, 1.1, 0.12], [1, 1.05, 1.3]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.12, 0.36); this.bodyGroup.add(this.head);
            this._ball(this.head, black, 0.12, [0, 0, 0], [1.1, 1, 0.9]);
            for (const s of [-1, 1]) this._ball(this.head, this._mat(0x3a1a0a, 1.0, 0.3), 0.06, [s * 0.09, 0.02, 0.04], [0.8, 1.4, 0.8], [8, 6]);
            this._ball(this.head, yellow, 0.05, [0, -0.03, 0.09], null, [6, 4]);
            this._antennae(this.head, black, p.accent);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, yellow, [s * 0.04, -0.08, 0.06], [s * 0.02, -0.13, 0.12], 0.018, 0.006);
            this._waist = this._rod(this.bodyGroup, black, [0, 1.06, -0.06], [0, 1.0, -0.34], 0.035, 0.03, 5);
            this.abdomen = this._ball(this.bodyGroup, black, 0.17, [0, 0.98, -0.62], [1, 1, 1.9]);
            for (const z of [0.06, -0.02, -0.09]) this._band(this.abdomen, yellow, [0, 0, z], Math.sqrt(0.0289 - z * z), 0.022);
            const sting = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), this._mat(0x1a1408, 1.0, 0.4)); sting.position.set(0, 0, -0.2); sting.rotation.x = -Math.PI / 2; this.abdomen.add(sting);
            this._wingPair(0.07, 1.22, 0.14, { len: 0.85, width: 0.2, mat: this._mat(0xc89a4a, 0.4, 0.2), sweep: 0.45, lift: 0.25, amp: 0.5, rate: 34, rateFast: 46 });
            // A scrap of grey paper comb clutched in the front feet.
            this.comb = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 6), this._mat(0xb8b0a0, 1.0, 0.95)); this.comb.position.set(0, 0.8, 0.42); this.bodyGroup.add(this.comb);
            const cell = this._mat(0x5a5248, 1.0, 0.9);
            for (let k = 0; k < 7; k++) { const a = k * Math.PI / 3, rr = k === 6 ? 0 : 0.085; const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.064, 6), cell); c.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); this.comb.add(c); }
            const legs = this._legSet([
                { hip: [0.05, 1.02, 0.2], pts: [[0.1, -0.08, 0.14], [0.06, -0.2, 0.22]], r: 0.014 },
                { hip: [0.06, 1.02, 0.1], pts: [[0.18, -0.12, 0.02], [0.24, -0.5, -0.04]], r: 0.014 },
                { hip: [0.06, 1.02, 0.0], pts: [[0.18, -0.2, -0.12], [0.22, -0.62, -0.24]], r: 0.014 }
            ], black, yellow);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, this._waist, this.comb], legsL: legs.L, legsR: legs.R, mat: black });
        }

        // ── Stable Horsefly: a fat drone with huge banded rainbow eyes ───────
        _buildLvStableHorsefly() {
            const p = this.profile;
            this._flyer = true;
            const grey = this._skinMat(p.bodyColor, 0.6), dark = this._mat(0x1a1612, 1.0, 0.6);
            const eyeA = this._mat(p.accent, 1.0, 0.2, 0x0a3a1a), eyeB = this._mat(0xc83a9a, 1.0, 0.25);
            this.thorax = this._ball(this.bodyGroup, grey, 0.26, [0, 1.05, 0.04], [1.1, 1, 1.1]);
            this.abdomen = this._ball(this.bodyGroup, grey, 0.28, [0, 1.0, -0.42], [1.15, 0.7, 1.25]);
            for (const z of [0.1, 0.0, -0.1]) { const tri = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.05, 3), this._mat(0xc8c0a8, 1.0, 0.8)); tri.position.set(0, Math.sqrt(0.0784 - z * z) - 0.01, z); this.abdomen.add(tri); }
            this.head = new THREE.Group(); this.head.position.set(0, 1.05, 0.34); this.bodyGroup.add(this.head);
            this._ball(this.head, grey, 0.14, [0, 0, 0], [1.3, 1, 0.8]);
            for (const s of [-1, 1]) {
                const eye = this._ball(this.head, eyeA, 0.17, [s * 0.11, 0.02, 0.05], null, [10, 8]);
                for (const y of [-0.08, 0.0, 0.08]) { const st = this._band(eye, eyeB, [0, y, 0], Math.sqrt(0.0289 - y * y) + 0.004, 0.016); st.rotation.x = Math.PI / 2; }
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, dark, [s * 0.03, -0.1, 0.06], [s * 0.01, -0.3, 0.16], 0.03, 0.006, 4);
            const smoke = this._mat(0x8a8a90, 0.45, 0.3), blot = this._mat(0x3a3028, 0.8, 0.6);
            this._wingPair(0.1, 1.25, 0.05, { len: 1.0, width: 0.42, mat: smoke, sweep: 0.6, lift: 0.12, amp: 0.5, rate: 36, rateFast: 48 })
                .forEach(w => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6), blot); b.position.set(w._side * 0.5, 0.004, 0.04); b.rotation.x = -Math.PI / 2; w._blade.add(b); });
            const legs = this._legSet([
                { hip: [0.12, 0.9, 0.16], pts: [[0.2, -0.16, 0.06], [0.26, -0.48, 0.1]], r: 0.026 },
                { hip: [0.12, 0.9, 0.04], pts: [[0.22, -0.16, 0.0], [0.28, -0.5, -0.02]], r: 0.026 },
                { hip: [0.12, 0.9, -0.08], pts: [[0.2, -0.16, -0.08], [0.26, -0.5, -0.16]], r: 0.026 }
            ], dark);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings], legsL: legs.L, legsR: legs.R, mat: grey });
        }

        // ── Locust Nymph: wingless, head too big, banded like a warning ──────
        _buildLvLocustNymph() {
            const p = this.profile;
            const green = this._skinMat(p.bodyColor, 0.5), band = this._mat(p.accent, 1.0, 0.6), yellow = this._mat(0xe8c83a, 1.0, 0.6);
            this.head = new THREE.Group(); this.head.position.set(0, 0.66, 0.44); this.bodyGroup.add(this.head);
            this._ball(this.head, green, 0.24, [0, 0, 0], [0.9, 1.15, 1]);
            // One eye bigger than the other.
            this._eye(this.head, -0.17, 0.08, 0.08, 0.07, 0xffffff); this._eye(this.head, 0.17, 0.08, 0.08, 0.085, 0xffffff);
            this._antennae(this.head, green, 0x2a3a10);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, band, [s * 0.05, -0.2, 0.08], [s * 0.02, -0.28, 0.14], 0.03, 0.01);
            this.thorax = this._ball(this.bodyGroup, green, 0.2, [0, 0.6, 0.16], [1.1, 0.95, 1.15]);
            this._band(this.thorax, band, [0, 0, -0.06], Math.sqrt(0.04 - 0.0036), 0.025);
            this._buds = [];
            for (const s of [-1, 1]) { const bud = this._ball(this.bodyGroup, this._mat(0x6a8a2a, 1.0, 0.5), 0.1, [s * 0.15, 0.66, 0.0], [0.5, 0.25, 1.2], [6, 4]); bud.rotation.z = -s * 0.4; this._buds.push(bud); }
            const a = [0, 0.6, -0.04], b = [0, 0.5, -0.66];
            this.abdomen = this._rod(this.bodyGroup, green, a, b, 0.17, 0.08, 8);
            this._ball(this.abdomen, green, 0.08, [0, 0.31, 0], null, [8, 6]);
            this._rings = [];
            [0.2, 0.4, 0.6, 0.8].forEach((f, i) => this._rings.push(this._band(this.bodyGroup, i % 2 ? yellow : band, [0, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], 0.17 - 0.09 * f + 0.004, 0.022, [0, b[1] - a[1], b[2] - a[2]])));
            const lL = [], lR = [];
            for (const s of [-1, 1]) {
                const out = s < 0 ? lL : lR;
                out.push(this._jointLeg(s, [0.12, 0.5, 0.26], [[0.12, -0.14, 0.08], [0.2, -0.5, 0.14]], green, 0.022));
                out.push(this._jointLeg(s, [0.14, 0.5, 0.1], [[0.16, -0.12, 0.0], [0.28, -0.5, -0.04]], green, 0.022));
                out.push(this._jointLeg(s, [0.15, 0.55, -0.06], [[0.14, 0.32, -0.22], [0.22, -0.55, -0.42]], green, 0.045, band));
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [...this._buds, ...this._rings], legsL: lL, legsR: lR, mat: green });
        }

        // ── Dream Moth: a lilac puff with sleepy lidded eyes and moon wings ──
        _buildLvDreamMoth() {
            const p = this.profile;
            this._flyer = true;
            const fluff = this._skinMat(p.bodyColor, 0.95), lilac = this._mat(0x9a7ac0, 0.9, 0.8), dark = this._mat(0x2a2038, 1.0, 0.5);
            const moon = this._mat(p.accent, 1.0, 0.3, p.accent); this._moonMats = [moon];
            this.thorax = this._ball(this.bodyGroup, fluff, 0.26, [0, 1.1, 0.1]);
            this._collar = new THREE.Group(); this.bodyGroup.add(this._collar);
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this._ball(this._collar, fluff, 0.08, [Math.cos(a) * 0.18, 1.1 + Math.sin(a) * 0.16, 0.3], null, [6, 4]); }
            this.abdomen = this._ball(this.bodyGroup, fluff, 0.2, [0, 1.04, -0.3], [1, 1, 1.5]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.1, 0.42); this.bodyGroup.add(this.head);
            this._ball(this.head, fluff, 0.13, [0, 0, 0]);
            // Sleepy eyes: dark beads half covered by heavy furred lids.
            for (const s of [-1, 1]) {
                this._ball(this.head, dark, 0.06, [s * 0.08, 0, 0.08], null, [8, 6]);
                const lid = new THREE.Mesh(new THREE.SphereGeometry(0.066, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fluff); lid.position.set(s * 0.08, 0, 0.08); lid.rotation.x = 0.45; this.head.add(lid);
            }
            for (const s of [-1, 1]) {
                this._rod(this.head, dark, [s * 0.04, 0.1, 0.04], [s * 0.18, 0.32, 0.12], 0.01, 0.007);
                for (let k = 1; k <= 3; k++) { const f = k / 4; this._rod(this.head, dark, [s * (0.04 + 0.14 * f), 0.1 + 0.22 * f, 0.04 + 0.08 * f], [s * (0.09 + 0.14 * f), 0.08 + 0.22 * f, 0.1 + 0.08 * f], 0.005, 0.003, 3); }
            }
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI * 1.7), dark); coil.position.set(0, -0.12, 0.08); coil.rotation.y = Math.PI / 2; this.mandibles.add(coil);
            const flap = { mat: lilac, seg: 12, lift: 0.3, amp: 0.35, rate: 5, rateFast: 12 };
            for (const s of [-1, 1]) {
                const fore = this._hingeWing(s, 0.12, 1.22, 0.16, Object.assign({ len: 0.9, width: 0.85, sweep: -0.05 }, flap));
                this._hingeWing(s, 0.12, 1.18, 0.0, Object.assign({ len: 0.7, width: 0.65, sweep: 0.55, phase: 0.4 }, flap));
                const cres = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 8, 1, 0, Math.PI), moon); cres.position.set(s * 0.5, 0.006, 0); cres.rotation.x = -Math.PI / 2; fore._blade.add(cres);
            }
            // Bubbles of the dreams it has sipped, drifting overhead.
            this._dreams = new THREE.Group(); this._dreams.userData.float = true; this.bodyGroup.add(this._dreams);
            const bubble = this._mat(p.accent, 0.3, 0.1, p.accent);
            for (let i = 0; i < 4; i++) { const d = this._ball(this._dreams, bubble, 0.05 + i * 0.012, [(i - 1.5) * 0.22, 1.65 + (i % 2) * 0.18, 0.1 - i * 0.08], null, [8, 6]); d._y = d.position.y; }
            const legs = this._legSet([
                { hip: [0.08, 1.0, 0.2], pts: [[0.1, -0.1, 0.04], [0.12, -0.26, 0.06]], r: 0.016 },
                { hip: [0.08, 0.98, 0.1], pts: [[0.12, -0.1, 0.0], [0.14, -0.28, -0.02]], r: 0.016 },
                { hip: [0.08, 0.98, 0.0], pts: [[0.1, -0.1, -0.04], [0.12, -0.28, -0.08]], r: 0.016 }
            ], fluff);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings, this._collar], legsL: legs.L, legsR: legs.R, mat: fluff });
        }

        // ── Rust Beetle: a riveted iron box of a beetle chewing a bent nail ──
        _buildLvRustBeetle() {
            const p = this.profile;
            const rust = this._skinMat(p.bodyColor, 0.8), iron = this._mat(p.accent, 1.0, 0.4), flake = this._mat(0xd8782a, 1.0, 0.9);
            this.thorax = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.3), rust); this.thorax.position.set(0, 0.46, 0.24); this.bodyGroup.add(this.thorax);
            this.abdomen = new THREE.Group(); this.bodyGroup.add(this.abdomen);
            for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.22, 0.62), rust); e.position.set(s * 0.115, 0.5, -0.22); e.rotation.z = -s * 0.05; this.abdomen.add(e); }
            for (const s of [-1, 1]) for (const z of [0.02, -0.2, -0.42]) this._ball(this.abdomen, iron, 0.025, [s * 0.2, 0.61, z], null, [5, 4]);
            // Rust flakes lifting off the shell.
            for (const [x, z, rx, rz] of [[0.1, -0.05, 0.5, 0.3], [-0.12, -0.3, -0.6, 0.4], [0.06, -0.44, 0.7, -0.5], [-0.05, 0.1, -0.4, -0.6]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.08), flake); f.position.set(x, 0.615, z); f.rotation.set(rx, 0, rz); this.abdomen.add(f); }
            this.head = new THREE.Group(); this.head.position.set(0, 0.42, 0.45); this.bodyGroup.add(this.head);
            this.head.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), rust));
            this._eye(this.head, -0.12, 0.03, 0.06, 0.03, 0xffcc66); this._eye(this.head, 0.12, 0.03, 0.06, 0.03, 0xffcc66);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), iron); m.position.set(s * 0.06, -0.02, 0.15); m.rotation.x = Math.PI / 2; this.mandibles.add(m); }
            // The bent nail it is gnawing.
            this._rod(this.mandibles, iron, [-0.28, -0.02, 0.17], [0.05, -0.02, 0.18], 0.016, 0.016, 4);
            this._rod(this.mandibles, iron, [0.05, -0.02, 0.18], [0.22, 0.08, 0.2], 0.016, 0.006, 4);
            const nailHead = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 6), iron); nailHead.position.set(-0.28, -0.02, 0.17); nailHead.rotation.z = Math.PI / 2; this.mandibles.add(nailHead);
            const legs = this._legSet([
                { hip: [0.18, 0.4, 0.3], pts: [[0.18, 0.04, 0.0], [0.3, -0.4, 0.05]], r: 0.03 },
                { hip: [0.18, 0.4, 0.06], pts: [[0.2, 0.04, 0.0], [0.32, -0.4, 0.0]], r: 0.03 },
                { hip: [0.18, 0.4, -0.18], pts: [[0.18, 0.04, 0.0], [0.3, -0.4, -0.05]], r: 0.03 }
            ], rust, iron);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legsL: legs.L, legsR: legs.R, mat: rust });
        }

        // ── Noodle Worm: a limp noodle rising out of its bowl, chopsticks in ─
        _buildLvNoodleWorm() {
            const p = this.profile;
            const noodle = this._skinMat(p.bodyColor, 0.4), porcelain = this._mat(0xe8eef4, 1.0, 0.3), blue = this._mat(0x2a4aa8, 1.0, 0.3);
            const broth = this._mat(0xc87a2a, 0.85, 0.2), wood = this._mat(0x8a5a2a, 1.0, 0.7);
            this.bowl = new THREE.Group(); this.bodyGroup.add(this.bowl);
            const cup = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), porcelain); cup.position.y = 0.44; this.bowl.add(cup);
            this._band(this.bowl, blue, [0, 0.44, 0], 0.44, 0.025, [0, 1, 0]);
            const soup = new THREE.Mesh(new THREE.CircleGeometry(0.43, 12), broth); soup.position.y = 0.38; soup.rotation.x = -Math.PI / 2; this.bowl.add(soup);
            for (const [a, b] of [[[0.12, 0.3, 0.12], [0.4, 1.1, 0.34]], [[0.18, 0.3, 0.04], [0.48, 1.05, 0.2]]]) this._rod(this.bowl, wood, a, b, 0.02, 0.012, 4);
            // Loose noodles flopped over the rim.
            this._drape = [];
            for (const s of [-1, 1]) {
                const arc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 8, Math.PI), noodle); arc.position.set(s * 0.44, 0.42, -0.1); this.bowl.add(arc); this._drape.push(arc);
                this._drape.push(this._rod(this.bowl, noodle, [s * 0.54, 0.42, -0.1], [s * 0.56, 0.22, -0.08], 0.03, 0.026));
            }
            // The worm: one long noodle rising from the broth, pivoting at the surface.
            this.noodle = new THREE.Group(); this.noodle.position.set(0, 0.36, -0.05); this.bodyGroup.add(this.noodle);
            const P = [[0, 0, 0], [0.1, 0.22, -0.05], [0.12, 0.47, 0.0], [0.04, 0.67, 0.1], [-0.06, 0.82, 0.23], [-0.06, 0.9, 0.39], [0, 0.87, 0.55]];
            const rods = [], joints = [];
            for (let i = 0; i < P.length - 1; i++) {
                rods.push(this._rod(this.noodle, noodle, P[i], P[i + 1], 0.07 - i * 0.002, 0.068 - i * 0.002, 6));
                if (i) joints.push(this._ball(this.noodle, noodle, 0.068, P[i], null, [6, 4]));
            }
            this.head = new THREE.Group(); this.head.position.set(0, 0.88, 0.6); this.noodle.add(this.head);
            this._ball(this.head, noodle, 0.1, [0, 0, 0], [1, 0.9, 1.15]);
            this._eye(this.head, -0.05, 0.05, 0.07, 0.02, 0xffffff); this._eye(this.head, 0.05, 0.05, 0.07, 0.02, 0xffffff);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.016, 4, 8), this._mat(p.accent, 1.0, 0.5)); this.maw.position.set(0, -0.02, 0.11); this.head.add(this.maw);
            this._noodleRods = rods; this._noodleJoints = joints;
            this._partMeshMap = { HEAD: this.head, MAW: this.maw, HEART_SEGMENT: rods[4], BODY_SEGMENT: rods[2], TAIL: rods[0] };
            this._cascadeRules = [
                { gone: ['HEART_SEGMENT'], hide: [this.head, ...rods, ...joints, ...this._drape] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['MAW'], hide: [this.maw] },
                { gone: ['BODY_SEGMENT'], hide: rods.slice(0, 4).concat(joints.slice(0, 3), this._drape) },
                { gone: ['TAIL'], hide: [rods[0], ...this._drape] }
            ];
        }

        // ── Syringe Mosquito: the abdomen a glass barrel, a steel needle nose ─
        _buildLvSyringeMosquito() {
            const p = this.profile;
            this._flyer = true;
            const body = this._skinMat(p.bodyColor, 0.5), steel = this._mat(0xc8ccd4, 1.0, 0.2), glass = this._mat(0xd8eef8, 0.35, 0.05);
            const blood = this._mat(p.accent, 0.9, 0.3, 0x400808), black = this._mat(0x15151a, 1.0, 0.5);
            this.thorax = this._ball(this.bodyGroup, body, 0.16, [0, 1.1, 0.08], [1, 1.1, 1.1]);
            this.head = new THREE.Group(); this.head.position.set(0, 1.08, 0.28); this.bodyGroup.add(this.head);
            this._ball(this.head, body, 0.09, [0, 0, 0]);
            this._eye(this.head, -0.06, 0.02, 0.05, 0.045, p.accent); this._eye(this.head, 0.06, 0.02, 0.05, 0.045, p.accent);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.07, 6), steel); hub.position.set(0, -0.03, 0.1); hub.rotation.x = Math.PI / 2; this.mandibles.add(hub);
            this._rod(this.mandibles, steel, [0, -0.03, 0.12], [0, -0.16, 0.75], 0.012, 0.003, 4);
            // The barrel: glass, graduated, half full, flange and plunger at the back.
            this.abdomen = new THREE.Group(); this.bodyGroup.add(this.abdomen);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), glass); barrel.position.set(0, 1.06, -0.37); barrel.rotation.x = Math.PI / 2; this.abdomen.add(barrel);
            this._fill = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), blood); this._fill.position.set(0, 1.06, -0.53); this._fill.rotation.x = Math.PI / 2; this.abdomen.add(this._fill);
            for (let k = 0; k < 5; k++) this._band(this.abdomen, black, [0, 1.06, -0.14 - k * 0.11], 0.112, 0.006);
            const flange = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.03), steel); flange.position.set(0, 1.06, -0.69); this.abdomen.add(flange);
            this._plunger = new THREE.Group(); this._plungerZ = -0.69; this._plunger.position.set(0, 1.06, -0.69); this.abdomen.add(this._plunger);
            this._rod(this._plunger, steel, [0, 0, 0.2], [0, 0, -0.26], 0.025, 0.025, 5);
            const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 8), steel); thumb.position.z = -0.27; thumb.rotation.x = Math.PI / 2; this._plunger.add(thumb);
            this._wingPair(0.05, 1.22, 0.04, { len: 0.78, width: 0.16, mat: this._mat(0xe0e8f0, 0.35, 0.2), sweep: 0.65, lift: 0.15, amp: 0.5, rate: 40, rateFast: 52 });
            const legs = this._legSet([
                { hip: [0.05, 1.0, 0.14], pts: [[0.24, -0.08, 0.12], [0.34, -0.72, 0.22]], r: 0.012 },
                { hip: [0.05, 1.0, 0.06], pts: [[0.26, -0.06, 0.0], [0.38, -0.74, 0.0]], r: 0.012 },
                { hip: [0.05, 1.0, -0.02], pts: [[0.24, -0.08, -0.14], [0.32, -0.74, -0.28]], r: 0.012 }
            ], black);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wings], legsL: legs.L, legsR: legs.R, mat: body });
        }

        // ── Pill Beetle: a red and white medicine capsule on stubby legs ─────
        _buildLvPillBeetle() {
            const p = this.profile;
            const red = this._skinMat(p.bodyColor, 0.25), white = this._mat(p.accent, 1.0, 0.25), black = this._mat(0x141414, 1.0, 0.5);
            const hemi = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            this.abdomen = new THREE.Group(); this.abdomen.position.set(0, 0.42, 0); this.bodyGroup.add(this.abdomen);
            const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.36, 12), white); bc.position.z = -0.18; bc.rotation.x = Math.PI / 2; this.abdomen.add(bc);
            const bcap = hemi(0.3, white); bcap.position.z = -0.36; bcap.rotation.x = -Math.PI / 2; this.abdomen.add(bcap);
            this.thorax = new THREE.Group(); this.thorax.position.set(0, 0.42, 0); this.bodyGroup.add(this.thorax);
            const fc = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.36, 12), red); fc.position.z = 0.18; fc.rotation.x = Math.PI / 2; this.thorax.add(fc);
            const fcap = hemi(0.305, red); fcap.position.z = 0.36; fcap.rotation.x = Math.PI / 2; this.thorax.add(fcap);
            // The seam where the halves join, a score line and a stamped dose.
            this._band(this.thorax, black, [0, 0, 0], 0.306, 0.012);
            const score = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.3), black); score.position.set(0, 0.305, 0.2); this.thorax.add(score);
            for (const x of [-0.12, 0.12]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.02), black); d.position.set(x, 0.29, -0.2); this.abdomen.add(d); }
            this.head = new THREE.Group(); this.head.position.set(0, 0.3, 0.62); this.bodyGroup.add(this.head);
            this._ball(this.head, black, 0.11, [0, 0, 0], [1.2, 0.8, 1]);
            this._eye(this.head, -0.07, 0.03, 0.07, 0.025, 0xffffff); this._eye(this.head, 0.07, 0.03, 0.07, 0.025, 0xffffff);
            for (const s of [-1, 1]) this._rod(this.head, black, [s * 0.05, 0.05, 0.06], [s * 0.14, 0.12, 0.18], 0.01, 0.006);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, black, [s * 0.03, -0.04, 0.08], [s * 0.01, -0.07, 0.14], 0.012, 0.004);
            const legs = this._legSet([
                { hip: [0.16, 0.2, 0.24], pts: [[0.1, -0.04, 0.02], [0.16, -0.2, 0.04]], r: 0.02 },
                { hip: [0.16, 0.2, 0.0], pts: [[0.1, -0.04, 0.0], [0.17, -0.2, 0.0]], r: 0.02 },
                { hip: [0.16, 0.2, -0.24], pts: [[0.1, -0.04, -0.02], [0.16, -0.2, -0.04]], r: 0.02 }
            ], black);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legsL: legs.L, legsR: legs.R, mat: black });
        }

        // ── Mannequin Hand: glossy jointed fingers high-stepping like a spider
        _buildLvMannequinHand() {
            const p = this.profile;
            const plastic = this._skinMat(p.bodyColor, 0.2), steel = this._mat(0xb0b4bc, 1.0, 0.25), nailMat = this._mat(p.accent, 1.0, 0.3);
            this.palm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.44), plastic); this.palm.position.set(0, 0.78, 0); this.bodyGroup.add(this.palm);
            this.knuckles = new THREE.Group(); this.bodyGroup.add(this.knuckles);
            for (const x of [-0.15, -0.05, 0.05, 0.15]) this._ball(this.knuckles, plastic, 0.06, [x, 0.8, 0.22], null, [8, 6]);
            // Wrist socket and the bare display rod it was pulled off.
            this.socket = new THREE.Group(); this.socket.position.set(0, 0.78, -0.22); this.bodyGroup.add(this.socket);
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 8), plastic); cup.position.z = -0.06; cup.rotation.x = Math.PI / 2; this.socket.add(cup);
            this._band(this.socket, steel, [0, 0, -0.13], 0.13, 0.018);
            this._rod(this.socket, steel, [0, 0, -0.08], [0, 0.2, -0.42], 0.03, 0.03, 5);
            this._fingers = []; this._nails = [];
            const defs = [
                { at: [-0.21, 0.78, 0.02], pts: [[-0.14, 0.04, 0.06], [-0.26, -0.3, 0.1], [-0.3, -0.78, 0.12]] },
                { at: [-0.15, 0.8, 0.24], pts: [[0, 0.1, 0.13], [0, 0.0, 0.28], [0, -0.5, 0.34], [0, -0.8, 0.36]] },
                { at: [-0.05, 0.8, 0.24], pts: [[0, 0.12, 0.14], [0, 0.02, 0.32], [0, -0.5, 0.38], [0, -0.8, 0.4]] },
                { at: [0.05, 0.8, 0.24], pts: [[0, 0.1, 0.13], [0, 0.0, 0.28], [0, -0.5, 0.34], [0, -0.8, 0.36]] },
                { at: [0.15, 0.8, 0.24], pts: [[0, 0.08, 0.11], [0, -0.02, 0.24], [0, -0.5, 0.28], [0, -0.8, 0.3]] }
            ];
            defs.forEach((d, i) => {
                const g = this._jointLeg(1, [0, d.at[1], d.at[2]], d.pts, plastic, 0.04);
                g.position.x = d.at[0];
                const e = d.pts[d.pts.length - 1];
                const nail = this._ball(g, nailMat, 0.028, [e[0], e[1] + 0.05, e[2] + 0.03], [1, 1.2, 0.5], [6, 4]); this._nails.push(nail);
                // A price tag still looped on the ring finger.
                if (i === 3) {
                    const mid = [0, 0.05, 0.065];
                    this._band(g, steel, mid, 0.045, 0.01, [0, 0.1, 0.13]);
                    this._rod(g, this._mat(0x8a6a4a, 1.0, 0.8), [0, 0.0, 0.08], [0.02, -0.24, 0.12], 0.006, 0.006, 3);
                    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.012), this._mat(0xf0e8d0, 1.0, 0.8)); tag.position.set(0.02, -0.3, 0.12); g.add(tag);
                }
                this._fingers.push(g);
            });
            this._wireHand({ palm: this.palm, stump: this.socket, knuckles: this.knuckles, nails: this._nails, fingers: this._fingers });
        }

        // ── Kitchen Roach: flat and glossy, one antenna kinked back ──────────
        _buildLvKitchenRoach() {
            const p = this.profile;
            const brown = this._skinMat(p.bodyColor, 0.25), rim = this._mat(p.accent, 1.0, 0.4), dark = this._mat(0x2a1408, 1.0, 0.4);
            this.abdomen = this._ball(this.bodyGroup, brown, 0.4, [0, 0.3, -0.18], [0.85, 0.22, 1.35]);
            this.wingCovers = new THREE.Group(); this.bodyGroup.add(this.wingCovers);
            for (const s of [-1, 1]) { const w = this._ball(this.wingCovers, brown, 0.38, [s * 0.16, 0.37, -0.22], [0.48, 0.13, 1.25]); w.rotation.y = -s * 0.07; }
            this.thorax = this._ball(this.bodyGroup, brown, 0.26, [0, 0.36, 0.28], [1.15, 0.26, 0.85]);
            const edge = this._band(this.bodyGroup, rim, [0, 0.35, 0.28], 0.27, 0.025, [0, 1, 0]); edge.scale.set(1.1, 0.82, 1);
            this.head = new THREE.Group(); this.head.position.set(0, 0.27, 0.48); this.bodyGroup.add(this.head);
            this._ball(this.head, dark, 0.1, [0, 0, 0], [1.1, 0.8, 0.9]);
            this._eye(this.head, -0.07, 0.03, 0.06, 0.025, p.accent); this._eye(this.head, 0.07, 0.03, 0.06, 0.025, p.accent);
            const antL = [[-0.04, 0.04, 0.06], [-0.2, 0.12, 0.5], [-0.45, 0.18, 0.95], [-0.72, 0.08, 1.25]];
            const antR = [[0.04, 0.04, 0.06], [0.2, 0.16, 0.42], [0.35, 0.3, 0.3], [0.55, 0.24, -0.3]];
            for (const pts of [antL, antR]) for (let i = 0; i < 3; i++) this._rod(this.head, dark, pts[i], pts[i + 1], 0.012 - i * 0.003, 0.009 - i * 0.003, 3);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, dark, [s * 0.04, -0.05, 0.06], [s * 0.015, -0.08, 0.12], 0.015, 0.005);
            this._cerci = [];
            for (const s of [-1, 1]) this._cerci.push(this._rod(this.bodyGroup, dark, [s * 0.08, 0.3, -0.7], [s * 0.18, 0.33, -0.86], 0.02, 0.006));
            const defs = [
                { hip: [0.16, 0.3, 0.2], pts: [[0.22, 0.08, 0.08], [0.42, -0.3, 0.18]] },
                { hip: [0.18, 0.3, 0.0], pts: [[0.25, 0.08, 0.0], [0.48, -0.3, -0.02]] },
                { hip: [0.18, 0.3, -0.25], pts: [[0.24, 0.08, -0.12], [0.46, -0.3, -0.32]] }
            ];
            const legs = this._legSet(defs, dark);
            // Spines along each shin.
            defs.forEach((d, i) => [legs.L[i], legs.R[i]].forEach(g => {
                const s = g._side, k = d.pts[0], f0 = d.pts[1];
                for (const f of [0.35, 0.65]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.06, 3), dark); sp.position.set(s * (k[0] + (f0[0] - k[0]) * f + 0.012), k[1] + (f0[1] - k[1]) * f + 0.02, k[2] + (f0[2] - k[2]) * f); sp.rotation.z = -s * 0.8; g.add(sp); }
            }));
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.wingCovers, edge, ...this._cerci], legsL: legs.L, legsR: legs.R, mat: brown });
        }

        // Tick body plan shared by the three level-one ticks: a small hooded
        // front, a capitulum head and eight legs (the fourth pair unkeyed).
        _tickLegs(mat, jointMat, hipX, hipY, zs, reach, r) {
            const defs = zs.map((z, i) => ({ hip: [hipX, hipY, z], pts: [[0.2, 0.12, (1.5 - i) * 0.06], [reach, -hipY, (1.5 - i) * 0.16]], r }));
            const legs = this._legSet(defs, mat, jointMat);
            return { L: legs.L.slice(0, 3), R: legs.R.slice(0, 3) };
        }

        // ── Implant Tick: a steel tick with a blinking light, jacked in ──────
        _buildLvImplantTick() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.3), dark = this._mat(0x22252a, 1.0, 0.4), copper = this._mat(0xc87a3a, 1.0, 0.3);
            const led = this._mat(p.accent, 1.0, 0.2, p.accent); this._ledMat = led;
            const trace = this._mat(p.accent, 0.9, 0.3, p.accent);
            this.abdomen = this._ball(this.bodyGroup, metal, 0.42, [0, 0.5, -0.15], [1, 0.6, 1.2], [12, 8]);
            for (const z of [0.15, -0.05, -0.22]) this._band(this.abdomen, dark, [0, 0, z], Math.sqrt(0.1764 - z * z), 0.02);
            for (const [x, z, len] of [[0.12, 0.05, 0.2], [-0.12, -0.1, 0.24], [0.0, -0.3, 0.14]]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, len), trace); tr.position.set(x, Math.sqrt(0.1764 - x * x - z * z) - 0.004, z); this.abdomen.add(tr); }
            this._ball(this.abdomen, led, 0.05, [0, 0.415, 0.05], null, [6, 4]);
            this.thorax = this._ball(this.bodyGroup, dark, 0.2, [0, 0.46, 0.24], [1.1, 0.55, 0.9]);
            this.head = new THREE.Group(); this.head.position.set(0, 0.42, 0.42); this.bodyGroup.add(this.head);
            this._ball(this.head, metal, 0.08, [0, 0, 0], [1.2, 0.7, 1.3]);
            this._eye(this.head, -0.05, 0.03, 0.06, 0.02, p.accent); this._eye(this.head, 0.05, 0.03, 0.06, 0.02, p.accent);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 4), copper); c.position.set(s * 0.03, -0.02, 0.12); c.rotation.x = Math.PI / 2; this.mandibles.add(c); }
            // A cable from its mouthparts down to a jack plug on the floor.
            this.cable = new THREE.Group(); this.bodyGroup.add(this.cable);
            const cab = this._mat(0x1a1a1e, 1.0, 0.6), C = [[0, 0.4, 0.5], [0.05, 0.25, 0.72], [0.18, 0.06, 0.88], [0.4, 0.04, 0.98]];
            for (let i = 0; i < 3; i++) this._rod(this.cable, cab, C[i], C[i + 1], 0.02, 0.02, 4);
            const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), cab); plug.position.set(0.47, 0.04, 1.0); plug.rotation.z = Math.PI / 2; this.cable.add(plug);
            this._rod(this.cable, copper, [0.54, 0.04, 1.0], [0.66, 0.04, 1.0], 0.016, 0.012, 4);
            const legs = this._tickLegs(dark, copper, 0.16, 0.44, [0.26, 0.12, -0.04, -0.2], 0.42, 0.028);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.cable], legsL: legs.L, legsR: legs.R, mat: metal });
        }

        // ── Quartz Tick: a pink crystal cluster for a body, one big sail ─────
        _buildLvQuartzTick() {
            const p = this.profile;
            const quartz = this._mat(p.bodyColor, 0.8, 0.1, 0x30101c), core = this._mat(p.accent, 1.0, 0.3), up = new THREE.Vector3(0, 1, 0);
            this.abdomen = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), quartz); this.abdomen.position.set(0, 0.5, -0.15); this.abdomen.scale.set(1, 0.8, 1.15); this.bodyGroup.add(this.abdomen);
            this.abdomen.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), core));
            const pts = [[0, 1, -0.3, 0.11, 0.62], [0.6, 0.7, 0.1, 0.06, 0.28], [-0.6, 0.7, 0.0, 0.06, 0.3], [0.4, 0.6, -0.7, 0.07, 0.3], [-0.4, 0.5, -0.8, 0.05, 0.24], [0.8, 0.2, -0.4, 0.05, 0.22], [-0.8, 0.3, -0.3, 0.05, 0.2]];
            for (const [x, y, z, r, h] of pts) { const d = new THREE.Vector3(x, y, z).normalize(); const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), quartz); c.position.copy(d).multiplyScalar(0.26 + h * 0.4); c.quaternion.setFromUnitVectors(up, d); this.abdomen.add(c); }
            this.thorax = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), quartz); this.thorax.position.set(0, 0.46, 0.24); this.thorax.scale.set(1.2, 0.6, 1.0); this.bodyGroup.add(this.thorax);
            this.head = new THREE.Group(); this.head.position.set(0, 0.42, 0.42); this.bodyGroup.add(this.head);
            this.head.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), quartz));
            this._eye(this.head, -0.04, 0.03, 0.05, 0.02, 0xffffff); this._eye(this.head, 0.04, 0.03, 0.05, 0.02, 0xffffff);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 4), core); c.position.set(s * 0.03, -0.02, 0.1); c.rotation.x = Math.PI / 2; this.mandibles.add(c); }
            const legs = this._tickLegs(quartz, core, 0.14, 0.44, [0.26, 0.12, -0.04, -0.2], 0.4, 0.022);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legsL: legs.L, legsR: legs.R, mat: quartz });
        }

        // ── Dragon Tick: a scaly tick wearing a stolen dragon scale as a shield
        _buildLvDragonTick() {
            const p = this.profile;
            const scaly = this._skinMat(p.bodyColor, 0.55), scaly2 = this._mat(0x4a120c, 1.0, 0.6), dark = this._mat(0x2a0a08, 1.0, 0.5);
            const plate = this._mat(p.accent, 1.0, 0.25, 0x102a08);
            const glow = this._mat(0xff6a1a, 0.9, 0.3, 0xff6a1a); this._dtGlow = glow;
            this.abdomen = this._ball(this.bodyGroup, scaly, 0.4, [0, 0.46, -0.15], [1, 0.55, 1.2]);
            for (const a of [-0.6, -0.2, 0.2, 0.6]) for (const s of [-1, 1]) { const sc = this._ball(this.abdomen, scaly2, 0.07, [s * Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4], [0.5, 1, 1.2], [6, 4]); sc.rotation.y = s * a; }
            this._ball(this.bodyGroup, glow, 0.3, [0, 0.34, -0.15], [1, 0.3, 1.1]);
            this.shieldScale = this._ball(this.bodyGroup, plate, 0.36, [0, 0.66, -0.12], [0.9, 0.16, 1.3], [10, 6]); this.shieldScale.rotation.x = -0.08;
            this._rod(this.bodyGroup, dark, [0, 0.715, 0.2], [0, 0.715, -0.42], 0.015, 0.015, 3);
            for (const x of [-0.12, 0, 0.12]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), dark); sp.position.set(x, 0.66, -0.58 + Math.abs(x) * 0.2); sp.rotation.x = -Math.PI / 2; this.bodyGroup.add(sp); }
            this.thorax = this._ball(this.bodyGroup, dark, 0.18, [0, 0.44, 0.26], [1.15, 0.55, 0.9]);
            this.head = new THREE.Group(); this.head.position.set(0, 0.4, 0.44); this.bodyGroup.add(this.head);
            this._ball(this.head, scaly, 0.09, [0, 0, 0], [1.2, 0.7, 1.3]);
            this._eye(this.head, -0.05, 0.03, 0.07, 0.022, 0xff8a2a); this._eye(this.head, 0.05, 0.03, 0.07, 0.022, 0xff8a2a);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) { this._rod(this.mandibles, dark, [s * 0.03, -0.02, 0.1], [s * 0.04, -0.06, 0.2], 0.018, 0.012); this._rod(this.mandibles, dark, [s * 0.04, -0.06, 0.2], [s * 0.01, -0.1, 0.24], 0.012, 0.004); }
            const legs = this._tickLegs(dark, scaly2, 0.14, 0.42, [0.26, 0.12, -0.02, -0.16], 0.34, 0.04);
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: [this.shieldScale], legsL: legs.L, legsR: legs.R, mat: scaly });
        }

        // ── Gladiator Cricket: bronze helmet, red crest, spiked kicking legs ─
        _buildLvGladiatorCricket() {
            const p = this.profile;
            const bronze = this._skinMat(p.bodyColor, 0.35), body = this._mat(0x4a3a20, 1.0, 0.6), plume = this._mat(p.accent, 1.0, 0.8), spike = this._mat(0xd8d0b0, 1.0, 0.5);
            this.abdomen = this._ball(this.bodyGroup, body, 0.2, [0, 0.58, -0.32], [0.9, 0.8, 1.9]);
            for (const z of [0.08, -0.02, -0.12]) this._band(this.abdomen, bronze, [0, 0, z], Math.sqrt(0.04 - z * z), 0.018);
            this.thorax = this._ball(this.bodyGroup, bronze, 0.22, [0, 0.62, 0.16], [1.1, 0.85, 1.25]);
            // The crest: a fan of red plumes along the helmet's ridge.
            this._crest = [];
            for (let k = 0; k < 6; k++) { const z = 0.38 - k * 0.09, y = 0.62 + 0.187 * Math.sqrt(Math.max(0, 1 - ((z - 0.16) / 0.275) ** 2)); const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2 + (k === 2 || k === 3 ? 0.06 : 0), 4), plume); c.position.set(0, y + 0.08, z); c.rotation.x = -0.3; this.bodyGroup.add(c); this._crest.push(c); }
            this.head = new THREE.Group(); this.head.position.set(0, 0.6, 0.42); this.bodyGroup.add(this.head);
            this._ball(this.head, body, 0.15, [0, 0, 0]);
            for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.12), bronze); g.position.set(s * 0.12, -0.02, 0.04); this.head.add(g); }
            this._eye(this.head, -0.08, 0.05, 0.11, 0.035, 0xffeeaa); this._eye(this.head, 0.08, 0.05, 0.11, 0.035, 0xffeeaa);
            this._antennae(this.head, body, p.accent);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            for (const s of [-1, 1]) this._rod(this.mandibles, body, [s * 0.05, -0.08, 0.1], [s * 0.02, -0.14, 0.18], 0.025, 0.008);
            const lL = [], lR = [];
            for (const s of [-1, 1]) {
                const out = s < 0 ? lL : lR;
                out.push(this._jointLeg(s, [0.12, 0.54, 0.3], [[0.16, 0.06, 0.16], [0.2, 0.22, 0.3]], body, 0.024, bronze));
                out.push(this._jointLeg(s, [0.15, 0.52, 0.08], [[0.2, 0.0, 0.0], [0.32, -0.52, 0.02]], body, 0.024, bronze));
                const hind = this._jointLeg(s, [0.13, 0.56, -0.14], [[0.16, 0.36, -0.18], [0.24, -0.56, -0.46]], bronze, 0.05, body);
                for (const f of [0.2, 0.4, 0.6, 0.8]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 3), spike); sp.position.set(s * (0.16 + 0.08 * f), 0.36 - 0.92 * f, -0.18 - 0.28 * f - 0.03); sp.rotation.x = -1.2; hind.add(sp); }
                out.push(hind);
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, extra: this._crest, legsL: lL, legsR: lR, mat: bronze });
        }

        // ── Pond Skater: a sliver of a bug on four huge oars, dimpling water ─
        _buildLvPondSkater() {
            const p = this.profile;
            const dark = this._skinMat(p.bodyColor, 0.5), silver = this._mat(0xc8d0d8, 1.0, 0.3);
            this.thorax = this._ball(this.bodyGroup, dark, 0.1, [0, 0.3, 0.05], [0.9, 0.7, 1.8]);
            this.abdomen = this._ball(this.bodyGroup, dark, 0.08, [0, 0.29, -0.25], [0.9, 0.65, 2.0]);
            this._ball(this.thorax, silver, 0.07, [0, -0.04, 0], [1.1, 0.6, 1]);
            this.head = new THREE.Group(); this.head.position.set(0, 0.31, 0.3); this.bodyGroup.add(this.head);
            this._ball(this.head, dark, 0.065, [0, 0, 0], [1, 0.85, 1.2]);
            this._eye(this.head, -0.055, 0.02, 0.03, 0.035, p.accent); this._eye(this.head, 0.055, 0.02, 0.03, 0.035, p.accent);
            this.mandibles = new THREE.Group(); this.head.add(this.mandibles);
            this._rod(this.mandibles, dark, [0, -0.03, 0.06], [0, -0.1, 0.12], 0.01, 0.004);
            const lL = [], lR = [];
            this._ripples = [];
            for (const s of [-1, 1]) {
                const out = s < 0 ? lL : lR;
                out.push(this._jointLeg(s, [0.05, 0.28, 0.18], [[0.08, -0.04, 0.1], [0.07, -0.12, 0.2]], dark, 0.012));
                out.push(this._jointLeg(s, [0.06, 0.28, 0.04], [[0.45, 0.14, 0.22], [1.15, -0.28, 0.62]], dark, 0.015));
                out.push(this._jointLeg(s, [0.06, 0.28, -0.08], [[0.38, 0.1, -0.28], [0.9, -0.28, -0.95]], dark, 0.014));
                // A dimple where each oar presses the water, and a ring spreading from it.
                for (const leg of out.slice(1)) {
                    const foot = leg === out[1] ? [s * 1.15, -0.28, 0.62] : [s * 0.9, -0.28, -0.95];
                    const dim = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), this._mat(p.accent, 0.45, 0.1)); dim.position.set(foot[0], foot[1] + 0.004, foot[2]); dim.rotation.x = -Math.PI / 2; leg.add(dim);
                    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 12), this._mat(p.accent, 0.6, 0.1)); ring.position.set(foot[0], foot[1] + 0.006, foot[2]); ring.rotation.x = -Math.PI / 2; ring.userData.float = true; leg.add(ring); this._ripples.push(ring);
                }
            }
            this._wireBug({ thorax: this.thorax, abdomen: this.abdomen, head: this.head, mandibles: this.mandibles, legsL: lL, legsR: lR, mat: dark });
        }

        // Per-creature motion for the level 1-5 roster.
        _lvAnim(t, fast) {
            switch (this.variant) {
                case 'lv_dungbeetle': if (this.ball && this.ball.visible) this.ball.rotation.x = t * (fast ? 2.4 : 0.7); break;
                case 'lv_picnicgnat':
                    if (this._gnatCloud) this._gnatCloud.rotation.y = t * (fast ? 3 : 1.2);
                    if (this.jam && this.jam.visible) this.jam.scale.y = 1.3 + Math.sin(t * 2.5) * 0.15;
                    break;
                case 'lv_hearthcricket': if (this._emberMats) this._emberMats.forEach((m, i) => { m.emissiveIntensity = 0.35 + Math.abs(Math.sin(t * 3 + i)) * 0.5; }); break;
                case 'lv_redfireant': if (this._venomMats) this._venomMats[0].emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 4)) * 0.5; break;
                case 'lv_meadowfirefly': if (this._lanterns) this._lanterns[0].emissiveIntensity = 0.25 + Math.pow(Math.max(0, Math.sin(t * (fast ? 6 : 2))), 3) * 1.4; break;
                case 'lv_lampmoth':
                    if (this._dust) { this._dust.rotation.y = t * 0.4; this._dust.children.forEach((d, i) => { d.position.y = d._y + Math.sin(t * 1.3 + i) * 0.06; }); }
                    if (this._lampEyes) this._lampEyes[0].emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.3;
                    break;
                case 'lv_dreammoth':
                    if (this._dreams) this._dreams.children.forEach((d, i) => { d.position.y = d._y + Math.sin(t * 0.9 + i * 1.3) * 0.08; });
                    if (this._moonMats) this._moonMats[0].emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 1.2)) * 0.4;
                    break;
                case 'lv_noodleworm':
                    if (this.noodle && this.noodle.visible) { this.noodle.rotation.z = Math.sin(t * (fast ? 5 : 1.6)) * 0.12; this.noodle.rotation.x = fast ? Math.abs(Math.sin(t * 5)) * 0.3 : Math.sin(t * 1.1) * 0.05; }
                    if (this.head) this.head.rotation.x = Math.sin(t * 2.2) * 0.15;
                    break;
                case 'lv_syringemosquito': {
                    const pump = Math.abs(Math.sin(t * (fast ? 6 : 1.5)));
                    if (this._plunger) this._plunger.position.z = this._plungerZ - pump * 0.06;
                    if (this._fill) this._fill.scale.y = 0.85 + pump * 0.3;
                    if (this.head && fast) this.head.rotation.x = pump * 0.3;
                    break;
                }
                case 'lv_pillbeetle': this.model.rotation.z = Math.sin(t * (fast ? 7 : 1.6)) * (fast ? 0.14 : 0.05); break;
                case 'lv_implanttick': if (this._ledMat) this._ledMat.emissiveIntensity = (Math.sin(t * (fast ? 14 : 4)) > 0.3) ? 1.4 : 0.15; break;
                case 'lv_dragontick': if (this._dtGlow) this._dtGlow.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2)) * 0.5; break;
                case 'lv_pondskater':
                    if (this._ripples) this._ripples.forEach((r, i) => { const k = (t * 0.8 + i * 0.27) % 1; r.scale.set(1 + k * 1.2, 1 + k * 1.2, 1); r.material.opacity = 0.6 * (1 - k); });
                    break;
            }
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            const flyer = this._flyer || (this.variant === 'dragonfly' || this.variant === 'bumblebee' || this.variant === 'bloodmosquito' || this.variant === 'temporalhornet');
            this.model.position.y = this._baseY + Math.sin(t * 1.3) * (flyer ? 0.07 : 0.02) * this.scale;
            // Default leg scuttle for the walkers.
            if (!flyer) this._legs.forEach((lg, i) => { if (lg.visible) lg.rotation.x = Math.sin(t * (fast ? 9 : 4) + i * 1.1) * 0.18; });
            // Every hinged wing beats about its root on the thorax.
            if (this._wingHinges) this._wingHinges.forEach(w => { if (w.visible) w.rotation.z = w._side * (w._lift + Math.sin(t * (fast ? w._rateFast : w._rate) + w._phase) * w._amp); });

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'discobeetle': {
                    this._discoMats.forEach((m, i) => { const hue = (t * 0.4 + i * 0.07) % 1; m.color.setHSL(hue, 1.0, 0.6); m.emissive.setHSL(hue, 1.0, 0.4); m.emissiveIntensity = 0.6 + Math.sin(t * 6 + i) * 0.4; });
                    if (this.carapace) this.carapace.rotation.y = t * 1.3;
                    if (this.rays) { this.rays.rotation.y = -t * 1.6; this.rays.children.forEach((r, i) => { const hue = (t * 0.5 + i * 0.16) % 1; r.material.color.setHSL(hue, 1, 0.6); r.material.emissive.setHSL(hue, 1, 0.5); }); }
                    this.model.rotation.z = Math.sin(t * 4) * 0.12;       // boogie
                    this.model.position.x = baseX + Math.sin(t * 2) * 0.06 * this.scale;
                    this._legs.forEach((lg, i) => { if (lg.visible) lg.rotation.x = Math.sin(t * 8 + i) * 0.32; });
                    if (this.head) this.head.rotation.z = Math.sin(t * 4 + 1) * 0.16;
                    break;
                }
                case 'ladybug': {
                    const open = fast ? 1.0 : (0.15 + Math.max(0, Math.sin(t * 0.5)) * 0.2);
                    // Each case lifts outward about its midline hinge.
                    if (this.leftWing) this.leftWing.rotation.z = -open * 0.9;
                    if (this.rightWing) this.rightWing.rotation.z = open * 0.9;
                    break;
                }
                case 'grasshopper': {
                    const crouch = fast ? Math.abs(Math.sin(t * 6)) : 0;
                    [this.hindLeft, this.hindRight].forEach(lg => { if (lg) lg.rotation.x = crouch * 0.5; });
                    if (fast) this.model.position.y = this._baseY + Math.abs(Math.sin(t * 6)) * 0.25 * this.scale; // hops
                    break;
                }
                case 'acidant': {
                    if (this.mandibles) this.mandibles.children.forEach((m, i) => { if (m.geometry.type === 'ConeGeometry') m.rotation.z = (i ? -1 : 1) * (0.2 + Math.abs(Math.sin(t * (fast ? 8 : 3))) * 0.3); });
                    if (this.acidDrop) { this.acidDrop.position.y = 0.8 - ((t * 0.5) % 1) * 0.2; this.acidDrop.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.3; }
                    break;
                }
                case 'dragonfly':
                case 'bumblebee':
                case 'bloodmosquito': {
                    this.model.position.y = this._baseY + Math.sin(t * 2.2) * 0.06 * this.scale + 0.04 * this.scale;
                    if (this.variant === 'bloodmosquito' && this.proboscis) this.head.rotation.x = fast ? Math.abs(Math.sin(t * 7)) * 0.4 : 0;
                    break;
                }
                case 'crawlinghand': {
                    if (this._fingers) this._fingers.forEach((f, i) => { if (f.visible && !f._thumb) f.rotation.x = Math.sin(t * (fast ? 9 : 4) + i * 1.3) * 0.3; });
                    if (this._wisps) this._wisps.forEach(w => { if (w.visible) { w.rotation.z = Math.sin(t * 2 + w._sx) * 0.3; w._mat.emissiveIntensity = 0.4 + Math.sin(t * 3 + w._sx) * 0.3; } });
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.5) * 0.08;
                    break;
                }
                case 'engorgedtick': {
                    if (this.abdomen && this.abdomen.visible) { const pulse = 1 + Math.sin(t * (fast ? 7 : 3)) * 0.04; this.abdomen.scale.set(1.05 * pulse, 1.15 * pulse, 1.1 * pulse); }
                    break;
                }
                case 'firecentipede': {
                    if (this._segGlow) this._segGlow.forEach((m, i) => { m.emissiveIntensity = 0.6 + Math.sin(t * 5 + i * 0.6) * 0.45; });
                    if (this._segments) this._segments.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 6 : 3) - i * 0.7) * 0.12 * this.scale; });
                    if (this.mandibles && this.mandibles.visible) this.mandibles.children.forEach((m, i) => { m.rotation.z = (i ? -1 : 1) * (0.2 + Math.abs(Math.sin(t * 4)) * 0.3); });
                    break;
                }
                case 'frostscarab': {
                    if (this._frost) this._frost.forEach((s, i) => { if (s.visible) s.material.opacity = 0.5 + Math.abs(Math.sin(t * 1.5 + i)) * 0.4; });
                    this.model.rotation.y = Math.sin(t * 0.8) * 0.06;
                    break;
                }
                case 'gloomwurm': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 4 : 1.8) - i * 0.6) * 0.14 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 1.8 - 8) * 0.16 * this.scale;
                    if (this._miasma) this._miasma.forEach((h, i) => { h.material.opacity = 0.1 + Math.abs(Math.sin(t * 1.2 + i)) * 0.12; h.rotation.y = t * 0.4 + i; });
                    if (this._fangs && this.head && this.head.visible) this.head.rotation.z = Math.sin(t * 1.2) * 0.1;
                    break;
                }
                case 'gutturalmaggotus': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) { const w = 1 + Math.sin(t * (fast ? 6 : 2.5) - i * 0.8) * 0.05; s.scale.set(1.05 * w, 0.95 * w, 1.1); } });
                    if (this._pustules) this._pustules.forEach((pu, i) => { pu.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 3 + i)) * 0.4; });
                    break;
                }
                case 'hivemindtermite': {
                    if (this.mandibles && this.mandibles.visible) this.mandibles.children.forEach((m, i) => { m.rotation.z = (i ? Math.PI + 0.5 : -0.5) + (i ? 1 : -1) * Math.abs(Math.sin(t * (fast ? 8 : 2.5))) * 0.25; });
                    if (this.abdomen && this.abdomen.visible) { const pulse = 1 + Math.sin(t * 2) * 0.02; this.abdomen.scale.set(1.05 * pulse, 1.05 * pulse, 1.5); }
                    break;
                }
                case 'junglestalker': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 5 : 2.2) - i * 0.7) * 0.13 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 2.2 - 7) * 0.15 * this.scale;
                    if (this._jsVenom) this._jsVenom.forEach((m, i) => { m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.4; });
                    if (this._jsDrip) { this._jsDrip.position.y = -0.12 - ((t * 0.5) % 1) * 0.12; }
                    break;
                }
                case 'luminouslocustking': {
                    if (this._lkGlow) this._lkGlow.forEach((m, i) => { m.emissiveIntensity = 0.5 + Math.sin(t * 4 + i * 0.5) * 0.4; });
                    if (this._lkHind && fast) this._lkHind.forEach(lg => { if (lg.visible) lg.rotation.x = Math.abs(Math.sin(t * 6)) * 0.4; });
                    this.model.position.y = this._baseY + Math.sin(t * 2) * 0.04 * this.scale;
                    break;
                }
                case 'magmacentipede': {
                    if (this._mcGlow) this._mcGlow.forEach((m, i) => { m.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 4 + i * 0.5)) * 0.5; });
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 5 : 2.4) - i * 0.6) * 0.12 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 2.4 - 8) * 0.14 * this.scale;
                    break;
                }
                case 'mothshadestalker': {
                    if (this._mothEyes) this._mothEyes.forEach((m, i) => { m.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 2 + i * 1.5)) * 0.5; });
                    this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.05 * this.scale;
                    break;
                }
                case 'swampscorpion': {
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * (fast ? 7 : 1.5)) * (fast ? 0.25 : 0.08);
                    [this.pincerL, this.pincerR].forEach((pc, i) => { if (pc && pc.visible) pc.rotation.y = (i ? -1 : 1) * (0.1 + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.25); });
                    break;
                }
                case 'toxicghost': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 5 : 2.2) - i * 0.7) * 0.12 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 2.2 - 7) * 0.14 * this.scale;
                    if (this._tgVenom) this._tgVenom.forEach((m, i) => { m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.4; });
                    if (this._tgEggs) this._tgEggs.forEach((e, i) => { if (e.visible) { const w = 1 + Math.sin(t * 2 + i) * 0.1; e.scale.set(w, w, w); } });
                    if (this._tgDrip) this._tgDrip.position.y = -0.14 - ((t * 0.5) % 1) * 0.12;
                    break;
                }
                case 'venomousdragonfly': {
                    if (this._vdVenom) this._vdVenom.forEach((m, i) => { m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i * 0.4)) * 0.4; });
                    this.model.position.y = this._baseY + Math.sin(t * 2.2) * 0.06 * this.scale + 0.04 * this.scale;
                    if (this.abdomen && this.abdomen.visible) this.abdomen.rotation.z = Math.sin(t * 1.4) * 0.04;
                    break;
                }
                case 'chromatictick': {
                    if (this._ctShell) this._ctShell.forEach((m, i) => { const hue = (t * 0.35 + i * 0.05) % 1; m.color.setHSL(hue, 1.0, 0.6); m.emissive.setHSL(hue, 1.0, 0.35); m.emissiveIntensity = 0.5 + Math.sin(t * 5 + i) * 0.4; });
                    if (this._ctOoze) this._ctOoze.forEach((m, i) => { m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.4; });
                    if (this._ctDrops) this._ctDrops.forEach((d, i) => { if (d.visible) d.position.y = (0.7 - 0.25) - ((t * 0.4 + i * 0.2) % 1) * 0.12; });
                    this.model.rotation.y = Math.sin(t * 0.7) * 0.06;
                    break;
                }
                case 'mindflayermoth': {
                    if (this._mfPsy) this._mfPsy.forEach((m, i) => { const hue = (t * 0.25 + i * 0.08) % 1; m.color.setHSL(hue, 0.9, 0.6); m.emissive.setHSL(hue, 0.9, 0.45); m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2.5 + i)) * 0.5; });
                    if (this._mfTents) this._mfTents.forEach((tn, i) => { if (tn.visible) tn.rotation.z = Math.sin(t * (fast ? 6 : 2.5) + i * 1.2) * 0.4; });
                    this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.05 * this.scale;
                    break;
                }
                case 'emotionalleech':
                case 'memoryleech': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) { const w = 1 + Math.sin(t * (fast ? 6 : 2.6) - i * 0.9) * 0.12; s.scale.set(1.05 * w, 0.95 / w, 1.1 * w); } });
                    if (this.head && this.head.visible) this.head.position.z = 0.6 + Math.sin(t * (fast ? 6 : 2.6)) * 0.06 * this.scale;
                    if (this._leechRings) this._leechRings.forEach((m, i) => { m.opacity = 0.7 + Math.abs(Math.sin(t * 3 + i)) * 0.3; });
                    break;
                }
                case 'thoughtparasite': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 5 : 2.2) - i * 0.8) * 0.12 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 2.2 - 6) * 0.13 * this.scale;
                    // Flicker between visible and near-invisible (phasing).
                    const phase = 0.25 + Math.abs(Math.sin(t * 1.6)) * 0.6 + (Math.sin(t * 11) > 0.7 ? -0.4 : 0);
                    if (this._tpGhost) this._tpGhost.forEach((m, i) => { m.opacity = Math.max(0.05, phase * (m.userData && m.userData.aura ? 0.4 : 1)); m.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 4 + i)) * 0.4; });
                    if (this._tpAura) this._tpAura.forEach((a, i) => { if (a.visible) a.rotation.y = t * 0.6 + i; });
                    break;
                }
                case 'emberbackhellscorpion': {
                    if (this._ehGlow) this._ehGlow.forEach((m, i) => { m.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 4 + i * 0.4)) * 0.5; });
                    if (this.tail && this.tail.visible) this.tail.rotation.x = Math.sin(t * (fast ? 7 : 1.5)) * (fast ? 0.28 : 0.1);
                    [this.pincerL, this.pincerR].forEach((pc, i) => { if (pc && pc.visible) pc.rotation.y = (i ? -1 : 1) * (0.1 + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.25); });
                    break;
                }
                case 'gravityworm': {
                    if (this._wormSegs) this._wormSegs.forEach((s, i) => { if (s.visible) s.position.x = Math.sin(t * (fast ? 4 : 1.7) - i * 0.6) * 0.14 * this.scale; });
                    if (this.tail && this.tail.visible) this.tail.position.x = Math.sin(t * 1.7 - 8) * 0.16 * this.scale;
                    if (this._gwRings) this._gwRings.forEach((m, i) => { m.opacity = (m.opacity > 0.45 ? 0.4 : (0.15 + Math.abs(Math.sin(t * 2 + i)) * 0.3)); m.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3 + i)) * 0.4; });
                    if (this._gwDisc && this._gwDisc.visible) this._gwDisc.rotation.z = t * 1.2;
                    if (this._gwHalos) this._gwHalos.forEach((h, i) => { if (h.visible) h.rotation.z = t * (0.6 + i * 0.05) * (i % 2 ? 1 : -1); });
                    this.model.rotation.z = Math.sin(t * 0.9) * 0.04;
                    break;
                }
                case 'temporalhornet': {
                    if (this._thWings) this._thWings.forEach((m, i) => { m.opacity = (i === 0 ? 0.42 : 0.18) * (0.6 + Math.abs(Math.sin(t * 5 + i)) * 0.6); m.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 4 + i)) * 0.4; });
                    this.model.position.y = this._baseY + Math.sin(t * 2.2) * 0.06 * this.scale + 0.04 * this.scale;
                    if (this.abdomen && this.abdomen.visible) this.abdomen.rotation.z = Math.sin(t * 1.5) * 0.03;
                    break;
                }
                default:
                    if (this._lvAnim) this._lvAnim(t, fast);
                    break;
            }
            this._swayRiders();
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.2);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.2 * this.scale;
            this.model.rotation.z = prog * 0.6;               // tip onto its back
            this._legs.forEach((lg, i) => { if (lg) lg.rotation.x = prog * 1.2 * (i % 2 ? 1 : -1); });
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new BugBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = B_PROFILES;
    // Narrow aliases (key only) so generic tokens can't hijack other enemies;
    // the real enemies are pinned by exact name below.
    reg('discobeetle',   { aliases: ['discobeetle'],   scale: S.discobeetle.scale,   weapon: 0, create: make });
    reg('ladybug',       { aliases: ['ladybug'],       scale: S.ladybug.scale,       weapon: 0, create: make });
    reg('grasshopper',   { aliases: ['grasshopper'],   scale: S.grasshopper.scale,   weapon: 0, create: make });
    reg('acidant',       { aliases: ['acidant'],       scale: S.acidant.scale,       weapon: 0, create: make });
    reg('dragonfly',     { aliases: ['dragonfly'],     scale: S.dragonfly.scale,     weapon: 0, create: make });
    reg('bumblebee',     { aliases: ['bumblebee'],     scale: S.bumblebee.scale,     weapon: 0, create: make });
    reg('bloodmosquito', { aliases: ['bloodmosquito'], scale: S.bloodmosquito.scale, weapon: 0, create: make });
    reg('crawlinghand',     { aliases: ['crawlinghand'],     scale: S.crawlinghand.scale,     weapon: 0, create: make });
    reg('engorgedtick',     { aliases: ['engorgedtick'],     scale: S.engorgedtick.scale,     weapon: 0, create: make });
    reg('firecentipede',    { aliases: ['firecentipede'],    scale: S.firecentipede.scale,    weapon: 0, create: make });
    reg('frostscarab',      { aliases: ['frostscarab'],      scale: S.frostscarab.scale,      weapon: 0, create: make });
    reg('gloomwurm',        { aliases: ['gloomwurm'],        scale: S.gloomwurm.scale,        weapon: 0, create: make });
    reg('gutturalmaggotus', { aliases: ['gutturalmaggotus'], scale: S.gutturalmaggotus.scale, weapon: 0, create: make });
    reg('hivemindtermite',   { aliases: ['hivemindtermite'],   scale: S.hivemindtermite.scale,   weapon: 0, create: make });
    reg('junglestalker',     { aliases: ['junglestalker'],     scale: S.junglestalker.scale,     weapon: 0, create: make });
    reg('luminouslocustking',{ aliases: ['luminouslocustking'],scale: S.luminouslocustking.scale,weapon: 0, create: make });
    reg('magmacentipede',    { aliases: ['magmacentipede'],    scale: S.magmacentipede.scale,    weapon: 0, create: make });
    reg('mothshadestalker',  { aliases: ['mothshadestalker'],  scale: S.mothshadestalker.scale,  weapon: 0, create: make });
    reg('swampscorpion',     { aliases: ['swampscorpion'],     scale: S.swampscorpion.scale,     weapon: 0, create: make });
    reg('toxicghost',        { aliases: ['toxicghost'],        scale: S.toxicghost.scale,        weapon: 0, create: make });
    reg('venomousdragonfly', { aliases: ['venomousdragonfly'], scale: S.venomousdragonfly.scale, weapon: 0, create: make });
    reg('chromatictick',     { aliases: ['chromatictick'],     scale: S.chromatictick.scale,     weapon: 0, create: make });
    reg('mindflayermoth',    { aliases: ['mindflayermoth'],    scale: S.mindflayermoth.scale,    weapon: 0, create: make });
    reg('emotionalleech',    { aliases: ['emotionalleech'],    scale: S.emotionalleech.scale,    weapon: 0, create: make });
    reg('memoryleech',       { aliases: ['memoryleech'],       scale: S.memoryleech.scale,       weapon: 0, create: make });
    reg('thoughtparasite',        { aliases: ['thoughtparasite'],        scale: S.thoughtparasite.scale,        weapon: 0, create: make });
    reg('emberbackhellscorpion',  { aliases: ['emberbackhellscorpion'],  scale: S.emberbackhellscorpion.scale,  weapon: 0, create: make });
    reg('gravityworm',            { aliases: ['gravityworm'],            scale: S.gravityworm.scale,            weapon: 0, create: make });
    reg('temporalhornet',         { aliases: ['temporalhornet'],         scale: S.temporalhornet.scale,         weapon: 0, create: make });
    // Level 1-5 roster.
    reg('lv_dungbeetle',         { aliases: ['lv_dungbeetle'],          scale: S.lv_dungbeetle.scale,          weapon: 0, create: make });
    reg('lv_gardenpillbug',      { aliases: ['lv_gardenpillbug'],       scale: S.lv_gardenpillbug.scale,       weapon: 0, create: make });
    reg('lv_picnicgnat',         { aliases: ['lv_picnicgnat'],          scale: S.lv_picnicgnat.scale,          weapon: 0, create: make });
    reg('lv_hearthcricket',      { aliases: ['lv_hearthcricket'],       scale: S.lv_hearthcricket.scale,       weapon: 0, create: make });
    reg('lv_redfireant',         { aliases: ['lv_redfireant'],          scale: S.lv_redfireant.scale,          weapon: 0, create: make });
    reg('lv_meadowfirefly',      { aliases: ['lv_meadowfirefly'],       scale: S.lv_meadowfirefly.scale,       weapon: 0, create: make });
    reg('lv_ponddamselfly',      { aliases: ['lv_ponddamselfly'],       scale: S.lv_ponddamselfly.scale,       weapon: 0, create: make });
    reg('lv_lampmoth',           { aliases: ['lv_lampmoth'],            scale: S.lv_lampmoth.scale,            weapon: 0, create: make });
    reg('lv_lostglove',          { aliases: ['lv_lostglove'],           scale: S.lv_lostglove.scale,           weapon: 0, create: make });
    reg('lv_paperwasp',          { aliases: ['lv_paperwasp'],           scale: S.lv_paperwasp.scale,           weapon: 0, create: make });
    reg('lv_stablehorsefly',     { aliases: ['lv_stablehorsefly'],      scale: S.lv_stablehorsefly.scale,      weapon: 0, create: make });
    reg('lv_locustnymph',        { aliases: ['lv_locustnymph'],         scale: S.lv_locustnymph.scale,         weapon: 0, create: make });
    reg('lv_dreammoth',          { aliases: ['lv_dreammoth'],           scale: S.lv_dreammoth.scale,           weapon: 0, create: make });
    reg('lv_rustbeetle',         { aliases: ['lv_rustbeetle'],          scale: S.lv_rustbeetle.scale,          weapon: 0, create: make });
    reg('lv_noodleworm',         { aliases: ['lv_noodleworm'],          scale: S.lv_noodleworm.scale,          weapon: 0, create: make });
    reg('lv_syringemosquito',    { aliases: ['lv_syringemosquito'],     scale: S.lv_syringemosquito.scale,     weapon: 0, create: make });
    reg('lv_pillbeetle',         { aliases: ['lv_pillbeetle'],          scale: S.lv_pillbeetle.scale,          weapon: 0, create: make });
    reg('lv_mannequinhand',      { aliases: ['lv_mannequinhand'],       scale: S.lv_mannequinhand.scale,       weapon: 0, create: make });
    reg('lv_kitchenroach',       { aliases: ['lv_kitchenroach'],        scale: S.lv_kitchenroach.scale,        weapon: 0, create: make });
    reg('lv_implanttick',        { aliases: ['lv_implanttick'],         scale: S.lv_implanttick.scale,         weapon: 0, create: make });
    reg('lv_quartztick',         { aliases: ['lv_quartztick'],          scale: S.lv_quartztick.scale,          weapon: 0, create: make });
    reg('lv_gladiatorcricket',   { aliases: ['lv_gladiatorcricket'],    scale: S.lv_gladiatorcricket.scale,    weapon: 0, create: make });
    reg('lv_dragontick',         { aliases: ['lv_dragontick'],          scale: S.lv_dragontick.scale,          weapon: 0, create: make });
    reg('lv_pondskater',         { aliases: ['lv_pondskater'],          scale: S.lv_pondskater.scale,          weapon: 0, create: make });

    const NAMED = {
        discobeetle:   ["Disco Beetle"],
        ladybug:       ["Ladybug"],
        grasshopper:   ["Grasshopper"],
        acidant:       ["Acid Ant"],
        dragonfly:     ["Draconic Dragonfly"],
        bumblebee:     ["Buzzing Bumblebee"],
        bloodmosquito: ["Blood Mosquito"],
        crawlinghand:     ["Crawling Hand", "Hand Crawler", "Finger Worm", "Tongue Leech"],
        engorgedtick:     ["Engorged Tick Swarm"],
        firecentipede:    ["Fire Centipede"],
        frostscarab:      ["Frost Scarab"],
        gloomwurm:        ["Gloomwurm"],
        gutturalmaggotus: ["Guttural Maggotus"],
        hivemindtermite:   ["Hivemind Termite"],
        junglestalker:     ["Jungle Stalker"],
        luminouslocustking:["Luminous Locust King"],
        magmacentipede:    ["Magma Centipede"],
        mothshadestalker:  ["Mothshade Stalker"],
        swampscorpion:     ["Swamp Scorpion"],
        toxicghost:        ["Toxic Ghost"],
        venomousdragonfly: ["Venomous Dragonfly"],
        chromatictick:     ["Chromatic Tick"],
        mindflayermoth:    ["Mind Flayer Moth"],
        emotionalleech:    ["Emotional Leech"],
        memoryleech:       ["Memory Leech"],
        thoughtparasite:        ["Thought Parasite"],
        emberbackhellscorpion:  ["Emberback Hellscorpion"],
        gravityworm:            ["Gravity Worm"],
        temporalhornet:         ["Temporal Hornet"],
        lv_dungbeetle:         ["Dung Beetle"],
        lv_gardenpillbug:      ["Garden Pillbug"],
        lv_picnicgnat:         ["Picnic Gnat"],
        lv_hearthcricket:      ["Hearth Cricket"],
        lv_redfireant:         ["Red Fire Ant"],
        lv_meadowfirefly:      ["Meadow Firefly"],
        lv_ponddamselfly:      ["Pond Damselfly"],
        lv_lampmoth:           ["Lamp Moth"],
        lv_lostglove:          ["Lost Glove"],
        lv_paperwasp:          ["Paper Wasp"],
        lv_stablehorsefly:     ["Stable Horsefly"],
        lv_locustnymph:        ["Locust Nymph"],
        lv_dreammoth:          ["Dream Moth"],
        lv_rustbeetle:         ["Rust Beetle"],
        lv_noodleworm:         ["Noodle Worm"],
        lv_syringemosquito:    ["Syringe Mosquito"],
        lv_pillbeetle:         ["Pill Beetle"],
        lv_mannequinhand:      ["Mannequin Hand"],
        lv_kitchenroach:       ["Kitchen Roach"],
        lv_implanttick:        ["Implant Tick"],
        lv_quartztick:         ["Quartz Tick"],
        lv_gladiatorcricket:   ["Gladiator Cricket"],
        lv_dragontick:         ["Dragon Tick"],
        lv_pondskater:         ["Pond Skater"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Bug uniques registered');

    ;[['u_fingerworm',1.7],['u_tongueleech',1.7],['u_handcrawler',1.7],['u_maatsseveredhand',1.7]].forEach(([k,sc]) => reg(k, { aliases: [k], scale: sc, weapon: 0, create: make }));
})();
