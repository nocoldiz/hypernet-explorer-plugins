//=============================================================================
// 3D Battler System - Imp Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke demon/imp one-off models (ember imp, kazoo imp, pocket-
 * dimension imp, discord demon, dodger imp) + name-based assignment. Requires
 * 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Imp Uniques
 * ============================================================================
 *
 * Distinct procedural imps shaped from each enemy's flavour text, assigned by
 * exact name (override with <Battler3D: key>). They map the Demon (humanoid)
 * archetype body-part keys (HEAD/TORSO + arm/leg/wing/tail keys) so
 * dismemberment works, and reuse the base per-id variation + gestures.
 *
 * Registered: emberimp, kazooimp, pocketimp, discorddemon, dodgerimp
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Imps] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const I_PROFILES = {
        emberimp:     { variant: 'emberimp',     scale: 1.8, texturePool: 'fire',  bodyColor: 0xcc4422, accent: 0xff8822, hue: [0.03, 0.03], sat: [0.65, 0.10], lit: [0.42, 0.10] },
        kazooimp:     { variant: 'kazooimp',     scale: 1.7, texturePool: 'void',  bodyColor: 0x7a4aaa, accent: 0xffcc33, hue: [0.74, 0.06], sat: [0.40, 0.12], lit: [0.45, 0.10] },
        pocketimp:    { variant: 'pocketimp',    scale: 1.8, texturePool: 'crystal',bodyColor: 0x3a8a8a, accent: 0xaa66ff, hue: [0.48, 0.08], sat: [0.40, 0.12], lit: [0.42, 0.10] },
        discorddemon: { variant: 'discorddemon', scale: 2.1, texturePool: 'flesh', bodyColor: 0x8a2a3a, accent: 0xff44aa, hue: [0.96, 0.05], sat: [0.55, 0.12], lit: [0.38, 0.10] },
        dodgerimp:    { variant: 'dodgerimp',    scale: 1.9, texturePool: 'fire',  bodyColor: 0x4a2a26, accent: 0xff6622, hue: [0.04, 0.03], sat: [0.50, 0.12], lit: [0.30, 0.10] },
        md_glimmeringsuccubus: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xaa66ff, accent: 0xccffff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'succubus' } },
        md_sulphurwhisperling: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'whisper' } },
        md_pactboundfiend: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a1a2a, accent: 0xff3344, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'fiend' } },
        md_hollowsuccubus: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a6a72, accent: 0xaaccff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'succubus' } },
        md_pactboundnixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a1a2a, accent: 0xff3344, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_gibberinghexweaver: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x4a6a3a, accent: 0x88ff66, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'hexweaver' } },
        md_sulphurshade: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'shade' } },
        md_caperinghexweaver: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'hexweaver' } },
        md_brimstonenixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_caperingfiend: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'fiend' } },
        md_glimmeringhexweaver: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xaa66ff, accent: 0xccffff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'hexweaver' } },
        md_twilightpixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a2a5a, accent: 0xaa66ff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'pixie' } },
        md_glimmeringsprite: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xaa66ff, accent: 0xccffff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'sprite' } },
        md_pactbounddevilkin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a1a2a, accent: 0xff3344, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'devilkin' } },
        md_caperingtrickster: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'trickster' } },
        md_brimstonewhisperling: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'whisper' } },
        md_sulphurcambion: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'cambion' } },
        md_glimmeringtrickster: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xaa66ff, accent: 0xccffff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'trickster' } },
        md_spitefuldevilkin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x7a2a2a, accent: 0xff4444, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'devilkin' } },
        md_hollowwhisperling: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a6a72, accent: 0xaaccff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'whisper' } },
        md_caperingpixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'pixie' } },
        md_mockingshade: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x2a6a6a, accent: 0x44ddcc, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'shade' } },
        md_sulphursprite: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'sprite' } },
        md_gibberingsprite: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x4a6a3a, accent: 0x88ff66, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'sprite' } },
        md_brimstonesprite: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'sprite' } },
        md_gibberingtrickster: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x4a6a3a, accent: 0x88ff66, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'trickster' } },
        md_spitefultormentor: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x7a2a2a, accent: 0xff4444, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'tormentor' } },
        md_spitefulcambion: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x7a2a2a, accent: 0xff4444, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'cambion' } },
        md_hollowpixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a6a72, accent: 0xaaccff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'pixie' } },
        md_glimmeringdevilkin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xaa66ff, accent: 0xccffff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'devilkin' } },
        md_spitefulpixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x7a2a2a, accent: 0xff4444, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'pixie' } },
        md_caperingdevilkin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'devilkin' } },
        md_whisperingnixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a3a6a, accent: 0x8888ff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_leeringsprite: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a5a2a, accent: 0x88dd44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'sprite' } },
        md_mockingwhisperling: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x2a6a6a, accent: 0x44ddcc, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'whisper' } },
        md_sulphurnixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_hollowimp: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a6a72, accent: 0xaaccff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'imp' } },
        md_caperingnixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a4a8a, accent: 0xff66dd, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_twilightgremlin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a2a5a, accent: 0xaa66ff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'gremlin' } },
        md_fangedimp: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x6a1a1a, accent: 0xff2222, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'imp' } },
        md_leeringpixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a5a2a, accent: 0x88dd44, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'pixie' } },
        md_whisperingtormentor: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a3a6a, accent: 0x8888ff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'tormentor' } },
        md_mockingnixie: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x2a6a6a, accent: 0x44ddcc, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'nixie' } },
        md_hexingcambion: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x5a2a6a, accent: 0xcc44ff, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'cambion' } },
        md_brimstonecambion: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'cambion' } },
        md_brimstonefiend: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'fiend' } },
        md_twilightshade: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x3a2a5a, accent: 0xaa66ff, hue:[0.74,0.10], sat:[0.45,0.14], lit:[0.40,0.12], spec:{ form:'shade' } },
        md_sulphurgremlin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0xbbaa33, accent: 0xddff44, hue:[0.74,0.10], sat:[0.45,0.14], lit:[0.40,0.12], spec:{ form:'gremlin' } },
        md_brimstonedevilkin: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x8a3a1a, accent: 0xff7722, hue:[0.74,0.10], sat:[0.45,0.14], lit:[0.40,0.12], spec:{ form:'devilkin' } },
        // ── Level 1-5 imps, each on its own bespoke build (no shared rig) ──
        lv_hiccupimp:     { variant: 'lv_hiccupimp',     scale: 1.4, texturePool: 'flesh', bodyColor: 0xd07a98, accent: 0x9fe8ff, hue: [0.93, 0.04], sat: [0.45, 0.10], lit: [0.60, 0.08] },
        lv_pocketimp:     { variant: 'lv_pocketimp',     scale: 1.5, texturePool: 'green', bodyColor: 0x6a8a3a, accent: 0xff5a1a, hue: [0.24, 0.05], sat: [0.40, 0.10], lit: [0.40, 0.08] },
        lv_loosetoothimp: { variant: 'lv_loosetoothimp', scale: 1.6, texturePool: 'flesh', bodyColor: 0x8a5a6a, accent: 0xf2ead2, hue: [0.95, 0.04], sat: [0.30, 0.10], lit: [0.42, 0.08] },
        lv_mushroomimp:   { variant: 'lv_mushroomimp',   scale: 1.5, texturePool: 'pale',  bodyColor: 0xd8c8a0, accent: 0xc8281e, hue: [0.11, 0.04], sat: [0.30, 0.10], lit: [0.70, 0.08] },
        lv_batwingedimp:  { variant: 'lv_batwingedimp',  scale: 1.7, texturePool: 'flesh', bodyColor: 0x5a3a3a, accent: 0xff3322, hue: [0.02, 0.04], sat: [0.30, 0.10], lit: [0.30, 0.08] },
        md_gibberingfiend: { variant: 'mdemon', scale: 1.8, texturePool: 'void', bodyColor: 0x4a6a3a, accent: 0x88ff66, hue: [0.74,0.10], sat: [0.45,0.14], lit: [0.40,0.12], spec: { form: 'fiend' } },
    };

    class ImpBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = I_PROFILES[creatureType] || I_PROFILES.emberimp;
            super(scale, offsetY, battler, profile, 0, creatureType || 'emberimp');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0; // bipedal imps face the viewer
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity), side: THREE.DoubleSide
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.6 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(accent || 0xffee44, 1.0, 0.2, accent));
            eye.position.set(x, y, z);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.45, 8, 8), this._mat(0x000000, 1.0, 0.1));
            pupil.position.set(0, 0, r * 0.7); eye.add(pupil);
            parent.add(eye); return eye;
        }
        _impLimb(x, y, mat, arm) {
            const g = new THREE.Group();
            const u = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.42, 6), mat); u.position.y = -0.18; g.add(u);
            const end = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat); end.position.y = -0.4; g.add(end);
            if (arm) for (const fx of [-0.05, 0, 0.05]) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), this._mat(0x1a1410, 1, 0.5)); claw.position.set(fx, -0.47, 0.04); g.add(claw); }
            g.position.set(x, y, 0); g._x = x; g._arm = arm; this.bodyGroup.add(g); return g;
        }
        _batWing(side, mat) {
            const g = new THREE.Group();
            const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.4, 3), this._mat(this.profile.bodyColor, 0.7, 0.6));
            membrane.scale.set(1, 0.85, 1); membrane.position.x = side * 0.32; g.add(membrane);
            g.position.set(side * 0.26, 1.28, -0.18); g.rotation.y = side * 0.5; g._side = side; this.bodyGroup.add(g); return g;
        }
        _impBase(o) {
            o = o || {};
            const p = this.profile;
            const mat = o.mat || this._skinMat(p.bodyColor, 0.6);
            this._impMat = mat;
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.7, 10), mat); this.torso.position.set(0, 1.0, 0); this.bodyGroup.add(this.torso);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat); belly.position.set(0, 0.85, 0.05); belly.scale.set(1, 0.9, 0.9); this.bodyGroup.add(belly);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), mat); h.scale.set(1, 0.95, 0.95); this.head.add(h);
            this._eye(this.head, -0.12, 0.04, 0.24, 0.07, o.eyeColor || p.accent); this._eye(this.head, 0.12, 0.04, 0.24, 0.07, o.eyeColor || p.accent);
            const grin = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), this._mat(0x1a0a0a, 1, 0.5)); grin.position.set(0, -0.12, 0.26); grin.rotation.z = Math.PI; this.head.add(grin);
            if (o.horns !== false) for (const hx of [-0.14, 0.14]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 6), this._mat(o.hornColor || 0x2a1a14, 1, 0.5)); horn.position.set(hx, 0.28, -0.02); horn.rotation.z = hx * 0.5; horn.rotation.x = -0.3; this.head.add(horn); }
            for (const ex of [-0.28, 0.28]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), mat); ear.position.set(ex, 0.06, -0.02); ear.rotation.z = ex * 1.5; this.head.add(ear); }
            this.head.position.set(0, 1.55, 0); this.bodyGroup.add(this.head);
            this.leftArm = this._impLimb(-0.34, 1.2, mat, true); this.rightArm = this._impLimb(0.34, 1.2, mat, true);
            this.leftLeg = this._impLimb(-0.14, 0.62, mat, false); this.rightLeg = this._impLimb(0.14, 0.62, mat, false);
            // Curling barbed tail.
            // Each segment steps by its own radius plus the next one's, and
            // the barb is seated on the LAST segment rather than one step past
            // it: a fixed step down a tapering tail left it as a dotted line
            // with the sting hanging off the end.
            this.tail = new THREE.Group();
            let py = 0, pz = 0, r = 0.07;
            for (let i = 0; i < 5; i++) {
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat); seg.position.set(0, py, pz); this.tail.add(seg);
                if (i === 4) break;
                const next = 0.07 - (i + 1) * 0.01;
                const step = (r + next) * 0.95;
                py -= step / 7; pz -= step; r = next;
            }
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 5), this._mat(o.hornColor || 0x2a1a14, 1, 0.5)); barb.position.set(0, py, pz - 0.06); barb.rotation.x = -Math.PI / 2; this.tail.add(barb);
            this.tail.position.set(0, 0.75, -0.25); this.bodyGroup.add(this.tail);
            if (o.wings) { this.leftWing = this._batWing(-1, mat); this.rightWing = this._batWing(1, mat); }
            // Part map (humanoid keys).
            this._partMeshMap = {};
            ['HEAD', 'SKULL', 'BRAIN', 'HORNS', 'FANGS', 'TEETH', 'MOUTH', 'EYE_LEFT', 'EYE_RIGHT'].forEach(k => this._partMeshMap[k] = this.head);
            ['TORSO', 'BODY', 'CORE', 'RIBCAGE', 'HEART', 'MASS', 'PELVIS'].forEach(k => this._partMeshMap[k] = this.torso);
            ['LEFT_ARM', 'LEFT_UPPER_ARM', 'LEFT_FOREARM', 'LEFT_HAND'].forEach(k => this._partMeshMap[k] = this.leftArm);
            ['RIGHT_ARM', 'RIGHT_UPPER_ARM', 'RIGHT_FOREARM', 'RIGHT_HAND', 'CLAWS'].forEach(k => this._partMeshMap[k] = this.rightArm);
            ['LEFT_LEG', 'LEFT_THIGH', 'LEFT_SHIN', 'LEFT_FOOT'].forEach(k => this._partMeshMap[k] = this.leftLeg);
            ['RIGHT_LEG', 'RIGHT_THIGH', 'RIGHT_SHIN', 'RIGHT_FOOT'].forEach(k => this._partMeshMap[k] = this.rightLeg);
            this._partMeshMap.TAIL = this.tail;
            if (this.leftWing) { this._partMeshMap.LEFT_WING = this.leftWing; this._partMeshMap.RIGHT_WING = this.rightWing; }
            const wings = [this.leftWing, this.rightWing].filter(Boolean);
            const extra = (o.extra || []).filter(Boolean);
            this._cascadeRules = [
                { gone: ['TORSO', 'BODY', 'CORE', 'RIBCAGE'], hide: [this.torso, belly, this.head, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg, this.tail, ...wings, ...extra] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_ARM', 'LEFT_UPPER_ARM'], hide: [this.leftArm] },
                { gone: ['RIGHT_ARM', 'RIGHT_UPPER_ARM'], hide: [this.rightArm] },
                { gone: ['LEFT_LEG', 'LEFT_THIGH'], hide: [this.leftLeg] },
                { gone: ['RIGHT_LEG', 'RIGHT_THIGH'], hide: [this.rightLeg] },
                { gone: ['TAIL'], hide: [this.tail] },
                this.leftWing ? { gone: ['LEFT_WING'], hide: [this.leftWing] } : null,
                this.rightWing ? { gone: ['RIGHT_WING'], hide: [this.rightWing] } : null,
            ].filter(Boolean);
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'kazooimp':     this._buildKazooImp(); break;
                case 'pocketimp':    this._buildPocketImp(); break;
                case 'discorddemon': this._buildDiscordDemon(); break;
                case 'dodgerimp':    this._buildDodgerImp(); break;
                case 'mdemon':       this._buildMinorDemon(); break;
                case 'lv_hiccupimp':     this._buildLvHiccupImp(); break;
                case 'lv_pocketimp':     this._buildLvPocketImp(); break;
                case 'lv_loosetoothimp': this._buildLvLooseToothImp(); break;
                case 'lv_mushroomimp':   this._buildLvMushroomImp(); break;
                case 'lv_batwingedimp':  this._buildLvBatWingedImp(); break;
                default:             this._buildEmberImp(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Ember Imp: a fiery sprite trailing little flame bursts ──────────
        _buildEmberImp() {
            const p = this.profile;
            this._impBase({ wings: true, eyeColor: 0xffdd44, hornColor: 0x3a1a10 });
            this.flames = new THREE.Group(); this.flames.userData.float = true; // bursts trail around the imp, not on it
            for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const f = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), this._mat(p.accent, 0.9, 0.2, 0xff5500)); f.position.set(Math.cos(a) * 0.45, 0.9 + (i % 2) * 0.5, Math.sin(a) * 0.4); f._a = a; this.flames.add(f); }
            this.bodyGroup.add(this.flames);
            this._cascadeRules[0].hide.push(this.flames);
        }

        // ── Kazoo Imp: a goofy imp blasting a kazoo, sound rings flying ─────
        _buildKazooImp() {
            const p = this.profile;
            this._impBase({ eyeColor: 0x66ccff, hornColor: 0x2a2040 });
            // The kazoo held to its mouth.
            this.kazoo = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), this._mat(p.accent, 1.0, 0.3, p.accent)); body.rotation.z = Math.PI / 2; this.kazoo.add(body);
            const bell = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 8), this._mat(p.accent, 1.0, 0.3)); bell.position.x = 0.2; bell.rotation.z = -Math.PI / 2; this.kazoo.add(bell);
            this.kazoo.position.set(0.0, 1.4, 0.32); this.bodyGroup.add(this.kazoo);
            // Annoying sound rings.
            // The rings fly off the bell on purpose; the marker says so.
            this.soundRings = new THREE.Group(); this.soundRings.userData.float = true;
            for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.015, 6, 16), this._mat(p.accent, 0.7, 0.3, p.accent)); r.position.set(0.4, 1.4, 0.3); r.rotation.y = Math.PI / 2; r._i = i; this.soundRings.add(r); }
            this.bodyGroup.add(this.soundRings);
            this._cascadeRules[0].hide.push(this.kazoo, this.soundRings);
        }

        // ── Pocket-Dimension Imp: pops through a little floating portal ─────
        _buildPocketImp() {
            const p = this.profile;
            this._impBase({ wings: true, eyeColor: 0xcc99ff, hornColor: 0x203a3a });
            this.portal = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 10, 24), this._mat(p.accent, 0.9, 0.3, p.accent)); this.portal.add(ring);
            const sheen = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), this._mat(0x110022, 0.55, 0.2, 0x220044)); sheen.position.z = -0.01; this.portal.add(sheen);
            this.portal.position.set(0.7, 1.0, -0.2); this.portal.rotation.y = -0.5; this.bodyGroup.add(this.portal);
            this._cascadeRules[0].hide.push(this.portal);
        }

        // ── Discord Demon: two-faced fiend spinning illusory duplicate heads ─
        _buildDiscordDemon() {
            const p = this.profile;
            this._impBase({ wings: true, eyeColor: 0xff66cc, hornColor: 0x3a1020 });
            // A second face leering from the back of the head.
            this._eye(this.head, -0.12, 0.04, -0.24, 0.06, 0x66ffaa); this._eye(this.head, 0.12, 0.04, -0.24, 0.06, 0x66ffaa);
            const backGrin = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12, Math.PI), this._mat(0x0a0a0a, 1, 0.5)); backGrin.position.set(0, -0.1, -0.26); this.head.add(backGrin);
            // Illusory duplicate heads orbiting.
            this.illusions = new THREE.Group(); this.illusions.userData.orbit = true;
            for (let i = 0; i < 2; i++) { const ill = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), this._mat(p.accent, 0.3, 0.3, p.accent)); ill.position.set(i ? 0.6 : -0.6, 1.55, 0); ill._i = i; this.illusions.add(ill); }
            this.bodyGroup.add(this.illusions);
            this._cascadeRules[0].hide.push(this.illusions);
        }

        // ── Dodger Imp: a twitchy ember-crackling imp wreathed in sparks ────
        _buildDodgerImp() {
            const p = this.profile;
            this._impBase({ wings: true, eyeColor: 0xff8844, hornColor: 0x281410 });
            this.embers = new THREE.Group(); this.embers.userData.float = true; // rising sparks hang in the air by design
            for (let i = 0; i < 12; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), this._mat(p.accent, 0.95, 0.2, p.accent)); e.position.set((this.idRand() - 0.5) * 0.8, 0.5 + this.idRand() * 1.3, (this.idRand() - 0.5) * 0.6); e._t = this.idRand(); e._base = e.position.y; this.embers.add(e); }
            this.bodyGroup.add(this.embers);
            this._cascadeRules[0].hide.push(this.embers);
        }

        // ── Minor demon/sprite: name-driven imp whose form-word picks a flourish ─
        _buildMinorDemon() {
            const p = this.profile, s = p.spec || {}, ac = p.accent, form = s.form || 'imp';
            const winged = ['succubus', 'fiend', 'nixie', 'cambion', 'pixie', 'devilkin'].indexOf(form) !== -1;
            const translucent = ['shade', 'whisper', 'sprite'].indexOf(form) !== -1;
            let mat;
            if (translucent) { mat = this._skinMat(p.bodyColor, 0.5); mat.opacity = 0.55; }
            this._impBase({ wings: winged, eyeColor: ac, hornColor: s.hornColor || 0x2a1a14, mat });
            // The aura turns around the demon and is meant to hang in the air,
            // which is what the marker says: nothing inside it is a limb that
            // has come off.
            this.demonAura = new THREE.Group(); this.demonAura.userData.aura = true;
            this.bodyGroup.add(this.demonAura); this._cascadeRules[0].hide.push(this.demonAura);
            const g = this.demonAura;
            switch (form) {
                case 'hexweaver': for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const rune = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 4), this._mat(ac, 0.85, 0.2, ac)); rune.position.set(Math.cos(a) * 0.55, 1.3, Math.sin(a) * 0.5); rune.rotation.set(a, a, 0); g.add(rune); } break;
                case 'succubus': for (const x of [-0.2, 0.2]) { const heart = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(ac, 0.85, 0.2, ac)); heart.position.set(x, 1.75, 0.2); g.add(heart); } break;
                case 'trickster': case 'sprite': case 'pixie': for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const mo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), this._mat(ac, 0.85, 0.2, ac)); mo.position.set(Math.cos(a) * 0.55, 1.2 + Math.sin(i) * 0.4, Math.sin(a) * 0.5); g.add(mo); } break;
                case 'tormentor': for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const hook = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), this._mat(0xcfd8e0, 1, 0.3)); hook.position.set(Math.cos(a) * 0.5, 1.1, Math.sin(a) * 0.5); hook.rotation.z = a; g.add(hook); } break;
                case 'nixie': for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(ac, 0.7, 0.15, ac)); drop.scale.y = 1.6; drop.position.set(Math.cos(a) * 0.45, 0.9 + (i % 2) * 0.3, Math.sin(a) * 0.4); g.add(drop); } break;
                // The big ears hang off the head, so they are placed in the
                // head's own space. At the body-space height they were written
                // at they floated a head's length above the skull.
                case 'gremlin': for (const ex of [-0.34, 0.34]) { const bigEar = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 5), this._impMat || this._skinMat(p.bodyColor, 0.6)); bigEar.position.set(ex, 0.05, -0.04); bigEar.rotation.z = ex * 1.8; this.head.add(bigEar); } break;
                default: { const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), this._mat(ac, 0.18, 0.2, ac)); halo.position.y = 1.1; g.add(halo); break; }
            }
        }

        // ── Level 1-5 imps: helpers ──────────────────────────────────────────
        // A limb fixed at its joint and laid along `dir`: the mesh is offset
        // inside a pivot at the joint, so turning the pivot swings it from the
        // shoulder or hip, never about its own middle. The tip is local (0,-len,0).
        _lvReach(parent, x, y, z, dir, len, r0, r1, mat) {
            const g = new THREE.Group(); g.position.set(x, y, z);
            g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 6), mat); m.position.y = -len / 2; g.add(m);
            g._len = len; parent.add(g); return g;
        }
        // A rod from point a to point b (a bone, a spar, a tail segment).
        _lvBone(parent, a, b, r0, r1, mat) {
            const A = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(b[0], b[1], b[2]).sub(A), len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat);
            m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }
        // Part map + cascade: losing a root key hides every mapped part.
        _lvWire(map, root, extra) {
            this._partMeshMap = {};
            for (const k in map) if (map[k]) this._partMeshMap[k] = map[k];
            const all = [...new Set(Object.values(map).filter(Boolean).concat(extra || []))];
            this._cascadeRules = [{ gone: root, hide: all }];
            for (const k in map) if (map[k] && root.indexOf(k) < 0) this._cascadeRules.push({ gone: [k], hide: [map[k]] });
        }

        // ── Hiccup Imp: a pink balloon of an imp jolted by every hic ────────
        // One swollen round belly with a little head perched on it, both hands
        // clamped over its mouth, a glowing diaphragm band round its middle that
        // flashes on each hic, and spark shards spiking out of its back.
        _buildLvHiccupImp() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);
            const glow = this._mat(p.accent, 0.95, 0.2, p.accent);
            this.torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 7), skin); this.torso.position.y = 0.66; this.torso.scale.set(1, 1.05, 0.92); this.bodyGroup.add(this.torso);
            this.band = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.045, 5, 12), glow); this.band.rotation.x = Math.PI / 2; this.band.position.y = 0.62; this.bodyGroup.add(this.band);
            // Head: puffed cheeks round a small round "hic" mouth.
            this.head = new THREE.Group(); this.head.position.set(0, 1.16, 0.02);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), skin));
            for (const sx of [-1, 1]) { const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), skin); cheek.position.set(sx * 0.14, -0.05, 0.1); this.head.add(cheek); }
            this._eye(this.head, -0.08, 0.07, 0.17, 0.045, 0x66ddff); this._eye(this.head, 0.08, 0.07, 0.17, 0.045, 0x66ddff);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 4, 8), this._mat(0x3a0a18, 1, 0.5)); this.maw.position.set(0, -0.09, 0.2); this.head.add(this.maw);
            this.horns = new THREE.Group();
            for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), this._mat(0x5a2a3a, 1, 0.5)); h.position.set(sx * 0.08, 0.2, 0); h.rotation.z = -sx * 0.3; this.horns.add(h); }
            this.head.add(this.horns);
            for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 4), skin); ear.position.set(sx * 0.22, 0.05, 0); ear.rotation.z = -sx * 1.3; this.head.add(ear); }
            this.bodyGroup.add(this.head);
            // Arms: both hands clamped over the mouth.
            const hand = (g) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), skin); h.position.y = -g._len; g.add(h); return g; };
            this.armL = hand(this._lvReach(this.bodyGroup, -0.34, 0.86, 0.06, [0.32, 0.26, 0.17], 0.34, 0.065, 0.05, skin));
            this.armR = hand(this._lvReach(this.bodyGroup, 0.34, 0.86, 0.06, [-0.32, 0.26, 0.17], 0.34, 0.065, 0.05, skin));
            // Stubby legs on flat round feet.
            this.legs = new THREE.Group();
            for (const sx of [-1, 1]) { const lg = this._lvReach(this.legs, sx * 0.17, 0.3, 0, [0, -1, 0], 0.2, 0.07, 0.06, skin); const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), skin); foot.scale.set(1, 0.5, 1.4); foot.position.set(0, -0.23, 0.05); lg.add(foot); }
            this.bodyGroup.add(this.legs);
            // Spark shards bursting out of the upper back, half sunk in the skin.
            this.sparks = [];
            for (const [sx, sy] of [[-0.18, 0.95], [0.02, 1.0], [0.2, 0.92]]) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), glow); sp.position.set(sx, sy, -0.27); sp.rotation.set(-0.7, 0, -sx * 1.4); this.sparks.push(sp); this.bodyGroup.add(sp); }
            // A short corkscrew tail.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.45, -0.32);
            [[0, 0, -0.05, 0.05], [0, 0.06, -0.1, 0.045], [0, 0.13, -0.1, 0.04]].forEach(([x, y, z, r]) => { const sg = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), skin); sg.position.set(x, y, z); this.tail.add(sg); });
            this.bodyGroup.add(this.tail);
            this._lvWire({ TORSO: this.torso, HEAD: this.head, HORNS: this.horns, LEFT_CLAW: this.armL, RIGHT_CLAW: this.armR, TAIL: this.tail, MAW: this.maw, LEGS: this.legs }, ['TORSO', 'BODY', 'CORE'], [this.band, ...this.sparks]);
        }

        // ── Pocket Imp: a lanky grinning imp living in a coat pocket ────────
        // Only its top half shows: it leans out of a stitched cloth pocket with
        // the flap thrown back, a stolen coin held up in one hand and the hot
        // coal it swapped in for it glowing in the other. Its tail pokes out
        // of a hole in the pocket's side.
        _buildLvPocketImp() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            const cloth = this._mat(0x4a3a5a, 1, 0.9), thread = this._mat(0xd8c890, 1, 0.8);
            this.pocket = new THREE.Group();
            const bag = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.34), cloth); bag.position.y = 0.28; this.pocket.add(bag);
            const flapPivot = new THREE.Group(); flapPivot.position.set(0, 0.56, -0.17); flapPivot.rotation.x = 1.1;
            const flap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.24), cloth); flap.position.z = -0.12; flapPivot.add(flap);
            const button = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), this._mat(0xb89030, 1, 0.3)); button.position.set(0, 0.04, -0.2); flapPivot.add(button);
            this.pocket.add(flapPivot);
            for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.012), thread); st.position.set(-0.32 + i * 0.08, 0.05, 0.172); this.pocket.add(st); }
            for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.045, 0.012), thread); st.position.set(sx * 0.33, 0.12 + i * 0.09, 0.172); this.pocket.add(st); }
            const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), this._mat(0x0a0608, 1, 0.9)); hole.position.set(0.362, 0.3, 0); hole.rotation.y = Math.PI / 2; this.pocket.add(hole);
            this.bodyGroup.add(this.pocket);
            // The imp itself, bobbing in and out of the pocket.
            this.imp = new THREE.Group(); this.bodyGroup.add(this.imp);
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.52, 7), skin); this.torso.position.y = 0.62; this.imp.add(this.torso);
            this.head = new THREE.Group(); this.head.position.set(0, 1.02, 0.03);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), skin));
            for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), skin); ear.position.set(sx * 0.3, 0.03, -0.02); ear.rotation.z = -sx * Math.PI / 2; this.head.add(ear); }
            this._eye(this.head, -0.07, 0.04, 0.15, 0.05, 0xffcc33); this._eye(this.head, 0.075, 0.05, 0.15, 0.04, 0xffcc33);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 4, 10, Math.PI), this._mat(0x1a0a0a, 1, 0.5)); this.maw.position.set(0, -0.06, 0.15); this.maw.rotation.z = Math.PI; this.head.add(this.maw);
            this.horns = new THREE.Group();
            for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), this._mat(0x2a1a14, 1, 0.5)); h.position.set(sx * 0.07, 0.18, -0.03); this.horns.add(h); }
            this.head.add(this.horns);
            this.imp.add(this.head);
            // Arms: the coin held up high, the coal held out low.
            this.armL = this._lvReach(this.imp, -0.14, 0.8, 0, [-0.5, 0.75, 0.3], 0.34, 0.045, 0.035, skin);
            const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8), this._mat(0xe0b040, 1, 0.3, 0x553300)); coin.position.y = -0.4; coin.rotation.x = Math.PI / 2; this.armL.add(coin);
            this.armR = this._lvReach(this.imp, 0.14, 0.8, 0, [0.6, -0.2, 0.6], 0.32, 0.045, 0.035, skin);
            this.coal = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), this._mat(0x3a1008, 1, 0.8, p.accent)); this.coal.position.y = -0.38; this.armR.add(this.coal);
            for (const g of [this.armL, this.armR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), skin); h.position.y = -g._len; g.add(h); }
            // Tail out of the side hole, curling up.
            this.tail = new THREE.Group(); this.tail.position.set(0.36, 0.3, 0);
            [[0.04, 0, 0, 0.04], [0.09, 0.04, 0, 0.035], [0.11, 0.1, 0, 0.03], [0.1, 0.15, 0, 0.026]].forEach(([x, y, z, r]) => { const sg = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), skin); sg.position.set(x, y, z); this.tail.add(sg); });
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), this._mat(0x2a1a14, 1, 0.5)); barb.position.set(0.09, 0.2, 0); this.tail.add(barb);
            this.pocket.add(this.tail);
            this._lvWire({ TORSO: this.torso, HEAD: this.head, HORNS: this.horns, LEFT_CLAW: this.armL, RIGHT_CLAW: this.armR, TAIL: this.tail, MAW: this.maw }, ['TORSO', 'BODY', 'CORE']);
        }

        // ── Loose Tooth Imp: a gap-toothed imp hoarding teeth in a sack ─────
        // Hunched on bent goat legs, a huge underbite jaw full of gaps, a
        // necklace of pulled teeth, a lumpy sack slung over one shoulder with
        // teeth poking out, and long pliers fingers on the other hand.
        _buildLvLooseToothImp() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.6);
            const tooth = this._mat(p.accent, 1, 0.35), dark = this._mat(0x1a0a0a, 1, 0.5);
            this.torso = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin); this.torso.position.set(0, 0.9, 0); this.torso.scale.set(1, 1.15, 0.85); this.torso.rotation.x = 0.25; this.bodyGroup.add(this.torso);
            // Necklace of pulled teeth round the neck.
            this.necklace = new THREE.Group(); this.necklace.position.y = 1.19;
            const cord = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 4, 12), this._mat(0x4a3020, 1, 0.8)); cord.rotation.x = Math.PI / 2; this.necklace.add(cord);
            for (let i = 0; i < 5; i++) { const a = Math.PI * 0.2 + i * Math.PI * 0.15; const tt = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), tooth); tt.position.set(Math.cos(a) * 0.15, -0.04, Math.sin(a) * 0.15); tt.rotation.x = Math.PI; this.necklace.add(tt); }
            this.bodyGroup.add(this.necklace);
            // Head: a cranium over a jutting, hinged underbite jaw.
            this.head = new THREE.Group(); this.head.position.set(0, 1.36, 0.1);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skin); skull.scale.set(1.1, 0.85, 1); this.head.add(skull);
            this._eye(this.head, -0.1, 0.06, 0.2, 0.035, 0xffee44); this._eye(this.head, 0.1, 0.08, 0.19, 0.065, 0xffee44);
            for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 4), skin); ear.position.set(sx * 0.27, 0.12, -0.02); ear.rotation.z = -sx * 0.7; this.head.add(ear); }
            this.horns = new THREE.Group();
            for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), this._mat(0x2a1a14, 1, 0.5)); h.position.set(sx * 0.1, 0.22, -0.06); h.rotation.set(-0.6, 0, -sx * 0.3); this.horns.add(h); }
            this.head.add(this.horns);
            // Two big buck teeth with the gap between them.
            for (const sx of [-1, 1]) { const bt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.03), tooth); bt.position.set(sx * 0.055, -0.13, 0.21); this.head.add(bt); }
            this.maw = new THREE.Group(); this.maw.position.set(0, -0.1, -0.04);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.36), skin); jaw.position.set(0, -0.06, 0.15); this.maw.add(jaw);
            const gum = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.06), dark); gum.position.set(0, 0, 0.3); this.maw.add(gum);
            for (const tx of [-0.13, -0.04, 0.12]) { const lt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), tooth); lt.position.set(tx, 0.03, 0.3); this.maw.add(lt); }
            this.head.add(this.maw); this.bodyGroup.add(this.head);
            // Left arm: the tooth sack slung up over the shoulder.
            this.armL = this._lvReach(this.bodyGroup, -0.27, 1.1, 0, [-0.15, 0.6, -0.45], 0.32, 0.05, 0.04, skin);
            this.sack = new THREE.Group(); this.sack.position.y = -0.32; this.armL.add(this.sack);
            const sackBody = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), this._mat(0x7a6040, 1, 0.9)); sackBody.position.y = -0.2; sackBody.scale.set(1, 1.15, 1); this.sack.add(sackBody);
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.08, 5), this._mat(0x7a6040, 1, 0.9)); neck.position.y = -0.03; this.sack.add(neck);
            for (const [x, z] of [[0.08, 0.06], [-0.06, 0.1], [0.02, -0.12]]) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), tooth); tt.position.set(x, -0.38, z); tt.rotation.x = Math.PI; this.sack.add(tt); }
            // Right arm: long thin pliers fingers reaching out.
            this.armR = this._lvReach(this.bodyGroup, 0.27, 1.1, 0.04, [0.25, -0.45, 0.8], 0.36, 0.05, 0.04, skin);
            for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.2, 4), this._mat(0x2a1a14, 1, 0.5)); f.position.set(sx * 0.025, -0.45, 0); f.rotation.z = Math.PI + sx * 0.15; this.armR.add(f); }
            // Bent goat legs: thigh forward, shin back, long foot.
            this.legs = new THREE.Group();
            for (const sx of [-1, 1]) {
                const thigh = new THREE.Group(); thigh.position.set(sx * 0.13, 0.62, 0); thigh.rotation.x = -0.7;
                const tm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.3, 6), skin); tm.position.y = -0.15; thigh.add(tm);
                const knee = new THREE.Group(); knee.position.y = -0.3; knee.rotation.x = 1.2; thigh.add(knee);
                const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.4, 6), skin); sm.position.y = -0.2; knee.add(sm);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), this._mat(0x2a1a14, 1, 0.6)); foot.position.set(0, -0.41, 0.07); foot.rotation.x = -0.5; knee.add(foot);
                this.legs.add(thigh);
            }
            this.bodyGroup.add(this.legs);
            // A thin tail ending in a tooth.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.68, -0.18);
            this._lvBone(this.tail, [0, 0, 0], [0, -0.12, -0.2], 0.035, 0.025, skin);
            this._lvBone(this.tail, [0, -0.12, -0.2], [0, -0.06, -0.38], 0.025, 0.018, skin);
            const tipTooth = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), tooth); tipTooth.position.set(0, -0.02, -0.42); tipTooth.rotation.x = -0.6; this.tail.add(tipTooth);
            this.bodyGroup.add(this.tail);
            this._lvWire({ TORSO: this.torso, HEAD: this.head, HORNS: this.horns, LEFT_CLAW: this.armL, RIGHT_CLAW: this.armR, TAIL: this.tail, MAW: this.maw, LEGS: this.legs }, ['TORSO', 'BODY', 'CORE'], [this.necklace]);
        }

        // ── Mushroom Imp: a squat imp under a red toadstool cap ─────────────
        // Its head is a spotted red cap with a fringe of gills, the face glowing
        // up out of the shade beneath; two little toadstools grow from its
        // shoulders, it stands on splayed root toes and clutches a puffball.
        _buildLvMushroomImp() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.7);
            const capMat = this._mat(p.accent, 1, 0.6), spotMat = this._mat(0xf4ecd8, 1, 0.7), gillMat = this._mat(0xb8a080, 1, 0.8);
            this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 7), skin); this.torso.position.y = 0.55; this.bodyGroup.add(this.torso);
            this.head = new THREE.Group(); this.head.position.set(0, 0.95, 0);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), skin));
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.position.y = 0.08; cap.scale.set(1, 0.6, 1); this.head.add(cap);
            for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const gill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.02), gillMat); gill.position.set(Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3); gill.rotation.y = -a; this.head.add(gill); }
            for (const [phi, th, r] of [[0.5, 0.4, 0.06], [0.9, 1.9, 0.07], [0.8, 3.6, 0.05], [1.1, 5.0, 0.06], [0.2, 2.8, 0.05], [1.2, 0.9, 0.05]]) {
                const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), spotMat); sp.scale.y = 0.4;
                sp.position.set(Math.sin(phi) * Math.cos(th) * 0.42, 0.08 + Math.cos(phi) * 0.25, Math.sin(phi) * Math.sin(th) * 0.42); this.head.add(sp);
            }
            this._eye(this.head, -0.07, -0.02, 0.17, 0.045, 0xeeff66); this._eye(this.head, 0.07, -0.02, 0.17, 0.045, 0xeeff66);
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8, Math.PI), this._mat(0x2a1a0a, 1, 0.5)); this.maw.position.set(0, -0.1, 0.17); this.maw.rotation.z = Math.PI; this.head.add(this.maw);
            // Two baby toadstools sprouting from the crown stand in for horns.
            this.horns = new THREE.Group();
            for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.1, 5), spotMat); st.position.set(sx * 0.12, 0.33, 0); this.horns.add(st); const mc = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), capMat); mc.position.set(sx * 0.12, 0.37, 0); this.horns.add(mc); }
            this.head.add(this.horns); this.bodyGroup.add(this.head);
            // Shoulder toadstools.
            this.shrooms = new THREE.Group();
            for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.14, 5), spotMat); st.position.set(sx * 0.19, 0.82, -0.08); st.rotation.z = -sx * 0.4; this.shrooms.add(st); const mc = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), capMat); mc.position.set(sx * 0.22, 0.88, -0.08); mc.rotation.z = -sx * 0.4; this.shrooms.add(mc); }
            this.bodyGroup.add(this.shrooms);
            // Arms: a puffball held in front, the other hand raised to throw.
            this.armL = this._lvReach(this.bodyGroup, -0.22, 0.72, 0, [0.25, -0.5, 0.8], 0.28, 0.05, 0.04, skin);
            this.puffball = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), this._mat(0xb89a6a, 1, 0.9)); this.puffball.position.y = -0.36; this.armL.add(this.puffball);
            this.armR = this._lvReach(this.bodyGroup, 0.22, 0.72, 0, [0.5, 0.7, -0.2], 0.28, 0.05, 0.04, skin);
            for (const g of [this.armL, this.armR]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), skin); h.position.y = -g._len; g.add(h); }
            // Stubby legs on splayed root toes.
            this.legs = new THREE.Group();
            for (const sx of [-1, 1]) { const lg = this._lvReach(this.legs, sx * 0.1, 0.32, 0, [0, -1, 0], 0.22, 0.08, 0.07, skin); for (const a of [-0.6, 0, 0.6]) { const toe = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.18, 4), skin); toe.position.set(Math.sin(a) * 0.07, -0.25, Math.cos(a) * 0.07); toe.rotation.set(Math.cos(a) * 1.3, 0, -Math.sin(a) * 1.3); lg.add(toe); } }
            this.bodyGroup.add(this.legs);
            // A root tendril trailing behind like a tail.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.4, -0.2);
            this._lvBone(this.tail, [0, 0, 0], [0, -0.2, -0.18], 0.035, 0.025, skin);
            this._lvBone(this.tail, [0, -0.2, -0.18], [0.05, -0.38, -0.34], 0.025, 0.012, skin);
            this.bodyGroup.add(this.tail);
            // Spores drifting off it, free in the air by design.
            this.spores = new THREE.Group(); this.spores.userData.float = true;
            for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 3), this._mat(0xe8e0a0, 0.8, 0.3, 0x887722)); s.position.set((this.idRand() - 0.5) * 1.0, 0.6 + this.idRand() * 0.9, (this.idRand() - 0.5) * 0.6); this.spores.add(s); }
            this.bodyGroup.add(this.spores);
            this._lvWire({ TORSO: this.torso, HEAD: this.head, HORNS: this.horns, LEFT_CLAW: this.armL, RIGHT_CLAW: this.armR, TAIL: this.tail, MAW: this.maw, LEGS: this.legs }, ['TORSO', 'BODY', 'CORE'], [this.shrooms, this.spores]);
        }

        // ── Bat-Winged Imp: a stunted leathery imp on fingered bat wings ────
        // A hunched round body pitched forward in flight, a pug-nosed head with
        // enormous bat ears and a cackling fanged maw, real bat wings (arm bone,
        // three finger spars and the skin stretched between), dangling talons.
        _buildLvBatWingedImp() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.65);
            const bone = this._mat(0x3a2424, 1, 0.6), membrane = this._mat(0x7a4a40, 0.85, 0.7), dark = this._mat(0x140808, 1, 0.5);
            this.torso = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), skin); this.torso.position.y = 1.2; this.torso.scale.set(1, 1.1, 0.9); this.torso.rotation.x = 0.35; this.bodyGroup.add(this.torso);
            this.head = new THREE.Group(); this.head.position.set(0, 1.52, 0.14);
            this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), skin));
            for (const sx of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 4), skin); ear.position.set(sx * 0.17, 0.22, -0.02); ear.rotation.z = -sx * 0.4; this.head.add(ear);
                const inner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), this._mat(0xb06a6a, 1, 0.6)); inner.position.set(sx * 0.175, 0.2, 0.02); inner.rotation.z = -sx * 0.4; this.head.add(inner);
            }
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), skin); nose.scale.set(1.2, 0.8, 0.7); nose.position.set(0, 0.0, 0.2); this.head.add(nose);
            for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), dark); n.position.set(sx * 0.03, 0.0, 0.255); this.head.add(n); }
            this._eye(this.head, -0.09, 0.08, 0.17, 0.04, p.accent); this._eye(this.head, 0.09, 0.08, 0.17, 0.04, p.accent);
            this.maw = new THREE.Group(); this.maw.position.set(0, -0.11, 0.15);
            const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), dark); mouth.scale.set(1.3, 0.8, 0.8); this.maw.add(mouth);
            for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), this._mat(0xf0e8d0, 1, 0.3)); f.position.set(sx * 0.05, -0.02, 0.04); f.rotation.x = Math.PI; this.maw.add(f); }
            this.head.add(this.maw); this.bodyGroup.add(this.head);
            // Wings: pivot at the shoulder blade, a real bat hand inside each.
            const mkWing = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.2, 1.36, -0.12); g._side = side;
                const wrist = [side * 0.62, 0.12, 0], tips = [[side * 1.02, 0.12, 0], [side * 0.98, -0.26, 0], [side * 0.62, -0.42, 0]], low = [side * 0.12, -0.3, 0];
                this._lvBone(g, [0, 0, 0], [side * 0.32, 0.22, 0], 0.04, 0.035, bone);
                this._lvBone(g, [side * 0.32, 0.22, 0], wrist, 0.035, 0.028, bone);
                tips.forEach(tp => this._lvBone(g, wrist, tp, 0.022, 0.01, bone));
                const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), bone); thumb.position.set(wrist[0], wrist[1] + 0.06, 0); g.add(thumb);
                const v = [[0, 0, 0], [side * 0.32, 0.22, 0], wrist, ...tips, low];
                const tri = [0, 1, 2, 2, 3, 4, 2, 4, 5, 2, 5, 6, 0, 2, 6];
                const pos = []; tri.forEach(i => pos.push(v[i][0], v[i][1], v[i][2] - 0.005));
                const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
                g.add(new THREE.Mesh(geo, membrane));
                this.bodyGroup.add(g); return g;
            };
            this.leftWing = mkWing(-1); this.rightWing = mkWing(1);
            // Dangling legs with three talons each.
            this.claws = new THREE.Group();
            for (const sx of [-1, 1]) { const lg = this._lvReach(this.claws, sx * 0.12, 1.0, 0, [0, -1, 0.15], 0.26, 0.06, 0.04, skin); for (const a of [-0.4, 0, 0.4]) { const tl = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), bone); tl.position.set(Math.sin(a) * 0.04, -0.3, Math.cos(a) * 0.04); tl.rotation.x = Math.PI - 0.5; lg.add(tl); } }
            this.bodyGroup.add(this.claws);
            // A long whip tail ending in an arrowhead.
            this.tail = new THREE.Group(); this.tail.position.set(0, 1.0, -0.2);
            this._lvBone(this.tail, [0, 0, 0], [0, -0.15, -0.25], 0.035, 0.025, skin);
            this._lvBone(this.tail, [0, -0.15, -0.25], [0, -0.1, -0.5], 0.025, 0.016, skin);
            const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), bone); arrow.position.set(0, -0.09, -0.55); arrow.rotation.x = -Math.PI / 2; this.tail.add(arrow);
            this.bodyGroup.add(this.tail);
            this._lvWire({ CORE: this.torso, TORSO: this.torso, HEAD: this.head, LEFT_WING: this.leftWing, RIGHT_WING: this.rightWing, TAIL: this.tail, CLAWS: this.claws, MAW: this.maw }, ['CORE', 'TORSO', 'BODY']);
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 2.0) * 0.05 * this.scale;
            // Shared idle: tail sway, arm idle, wing flutter.
            if (this.tail) this.tail.rotation.y = Math.sin(t * 2.5) * 0.4;
            if (this.leftArm) this.leftArm.rotation.x = Math.sin(t * 2 + (fast ? Math.sin(t * 9) : 0)) * 0.2;
            if (this.rightArm) this.rightArm.rotation.x = -Math.sin(t * 2) * 0.2;
            if (this.leftWing) this.leftWing.rotation.y = 0.5 + Math.sin(t * (fast ? 14 : 7)) * 0.4;
            if (this.rightWing) this.rightWing.rotation.y = -0.5 - Math.sin(t * (fast ? 14 : 7)) * 0.4;

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'emberimp': {
                    if (this.flames) this.flames.children.forEach((f, i) => { const s = 1 + Math.sin(t * (fast ? 12 : 7) + i) * 0.4; f.scale.set(s, 1.0 / Math.sqrt(s), s); f.material.emissiveIntensity = (fast ? 1.6 : 0.9) + Math.sin(t * 9 + i) * 0.5; });
                    break;
                }
                case 'kazooimp': {
                    // Hands up to the kazoo, head puffs, sound rings fly out.
                    if (this.leftArm) this.leftArm.rotation.x = -1.0; if (this.rightArm) this.rightArm.rotation.x = -1.0;
                    if (this.head) this.head.scale.setScalar(1 + Math.abs(Math.sin(t * (fast ? 12 : 6))) * 0.05);
                    if (this.soundRings) this.soundRings.children.forEach(r => { const ph = (t * (fast ? 2.5 : 1.4) + r._i * 0.33) % 1; r.position.x = 0.4 + ph * 0.6; const s = 1 + ph * 2; r.scale.set(s, s, 1); r.material.opacity = 0.7 * (1 - ph); });
                    break;
                }
                case 'pocketimp': {
                    if (this.portal) { this.portal.children[1].rotation.z = t * 1.5; this.portal.position.y = 1.0 + Math.sin(t * 1.5) * 0.1; }
                    // Phase flicker.
                    const ph = 0.6 + Math.abs(Math.sin(t * (fast ? 6 : 2))) * 0.4;
                    if (this._impMat) this._impMat.opacity = ph;
                    break;
                }
                case 'discorddemon': {
                    if (this.illusions) this.illusions.children.forEach((ill, i) => { const a = t * (fast ? 3 : 1.5) + i * Math.PI; ill.position.x = Math.cos(a) * 0.6; ill.position.z = Math.sin(a) * 0.4; ill.material.opacity = 0.2 + (Math.sin(t * 4 + i) * 0.5 + 0.5) * 0.3; });
                    if (this.head) this.head.rotation.y = Math.sin(t * 1.5) * 0.3; // looks both ways
                    break;
                }
                case 'dodgerimp': {
                    // Twitchy dodging side-steps + rising embers.
                    this.model.position.x = baseX + Math.sin(t * (fast ? 11 : 5)) * 0.05 * this.scale;
                    if (this.embers) this.embers.children.forEach(e => { e.position.y += 0.015 + e._t * 0.01; if (e.position.y > 1.9) e.position.y = 0.4; e.material.emissiveIntensity = 0.6 + Math.sin(t * 12 + e._t * 6) * 0.4; });
                    break;
                }
                case 'mdemon': {
                    if (this.demonAura) this.demonAura.rotation.y = t * (fast ? 2.2 : 1.0);
                    break;
                }
                case 'lv_hiccupimp': {
                    // A hic every 1.4 s: the belly swells, the band flashes, it jumps.
                    const ph = (t % 1.4) / 1.4, hic = ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) : 0;
                    this.model.position.y = this._baseY + (Math.sin(t * 2) * 0.03 + hic * 0.14) * this.scale;
                    if (this.torso) this.torso.scale.set(1 + hic * 0.08, 1.05 + hic * 0.1, 0.92 + hic * 0.06);
                    if (this.band) this.band.material.emissiveIntensity = 0.5 + hic * 2.0;
                    if (this.sparks) this.sparks.forEach(sp => sp.scale.setScalar(0.7 + hic * 0.6));
                    if (this.head) this.head.rotation.x = -hic * 0.25;
                    break;
                }
                case 'lv_pocketimp': {
                    this.model.position.y = this._baseY;
                    if (this.imp) this.imp.position.y = Math.sin(t * (fast ? 7 : 2)) * 0.05;
                    if (this.coal) this.coal.material.emissiveIntensity = 0.8 + Math.sin(t * 5) * 0.4;
                    break;
                }
                case 'lv_loosetoothimp': {
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 3)) * 0.02 * this.scale;
                    if (this.maw) this.maw.rotation.x = Math.abs(Math.sin(t * (fast ? 14 : 6))) * 0.3;
                    if (this.sack) this.sack.rotation.z = Math.sin(t * 2.2) * 0.2;
                    if (this.head) this.head.rotation.z = Math.sin(t * 4) * 0.06;
                    break;
                }
                case 'lv_mushroomimp': {
                    this.model.position.y = this._baseY;
                    if (this.head) this.head.rotation.z = Math.sin(t * 1.6) * 0.08;
                    if (this.spores) this.spores.children.forEach(sp => { sp.position.y += 0.006; if (sp.position.y > 1.6) sp.position.y = 0.6; });
                    break;
                }
                case 'lv_batwingedimp': {
                    const flap = Math.sin(t * (fast ? 16 : 9)) * 0.5;
                    if (this.leftWing) this.leftWing.rotation.set(0, -0.3, -flap);
                    if (this.rightWing) this.rightWing.rotation.set(0, 0.3, flap);
                    this.model.position.y = this._baseY + (0.05 + Math.sin(t * (fast ? 16 : 9)) * 0.04) * this.scale;
                    if (this.maw) this.maw.scale.y = 1 + Math.abs(Math.sin(t * 6)) * 0.4;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.3 * this.scale;
            this.model.rotation.z = prog * 0.9;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new ImpBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = I_PROFILES;
    reg('emberimp',     { aliases: ['emberimp'],     scale: S.emberimp.scale,     weapon: 0, create: make });
    reg('kazooimp',     { aliases: ['kazooimp'],     scale: S.kazooimp.scale,     weapon: 0, create: make });
    reg('pocketimp',    { aliases: ['pocketimp'],    scale: S.pocketimp.scale,    weapon: 0, create: make });
    reg('discorddemon', { aliases: ['discorddemon'], scale: S.discorddemon.scale, weapon: 0, create: make });
    reg('dodgerimp',    { aliases: ['dodgerimp'],    scale: S.dodgerimp.scale,    weapon: 0, create: make });
    ["md_twilightshade","md_sulphurgremlin","md_brimstonedevilkin"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));
    ["md_glimmeringsuccubus","md_sulphurwhisperling","md_pactboundfiend","md_hollowsuccubus","md_pactboundnixie","md_gibberinghexweaver","md_sulphurshade","md_caperinghexweaver","md_brimstonenixie","md_caperingfiend","md_glimmeringhexweaver","md_twilightpixie","md_glimmeringsprite","md_pactbounddevilkin","md_caperingtrickster","md_brimstonewhisperling","md_sulphurcambion","md_glimmeringtrickster","md_spitefuldevilkin","md_hollowwhisperling","md_caperingpixie","md_mockingshade","md_sulphursprite","md_gibberingsprite","md_brimstonesprite","md_gibberingtrickster","md_spitefultormentor","md_spitefulcambion","md_hollowpixie","md_glimmeringdevilkin","md_spitefulpixie","md_caperingdevilkin","md_whisperingnixie","md_leeringsprite","md_mockingwhisperling","md_sulphurnixie","md_hollowimp","md_caperingnixie","md_twilightgremlin","md_fangedimp","md_leeringpixie","md_whisperingtormentor","md_mockingnixie","md_hexingcambion","md_brimstonecambion","md_brimstonefiend","md_gibberingfiend"].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    ['lv_hiccupimp', 'lv_pocketimp', 'lv_loosetoothimp', 'lv_mushroomimp', 'lv_batwingedimp'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        lv_hiccupimp:     ["Hiccup Imp"],
        lv_pocketimp:     ["Pocket Imp"],
        lv_loosetoothimp: ["Loose Tooth Imp"],
        lv_mushroomimp:   ["Mushroom Imp"],
        lv_batwingedimp:  ["Bat-Winged Imp"],
        emberimp:     ["Ember Imp"],
        kazooimp:     ["Kazoo Imp"],
        pocketimp:    ["Pocket-Dimension Imp"],
        discorddemon: ["Discord Demon"],
        dodgerimp:    ["Dodger Imp"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Imp uniques registered');
})();
