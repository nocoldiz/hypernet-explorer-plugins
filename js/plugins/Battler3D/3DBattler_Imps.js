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
            this.flames = new THREE.Group();
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
            this.soundRings = new THREE.Group();
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
            this.illusions = new THREE.Group();
            for (let i = 0; i < 2; i++) { const ill = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), this._mat(p.accent, 0.3, 0.3, p.accent)); ill.position.set(i ? 0.6 : -0.6, 1.55, 0); ill._i = i; this.illusions.add(ill); }
            this.bodyGroup.add(this.illusions);
            this._cascadeRules[0].hide.push(this.illusions);
        }

        // ── Dodger Imp: a twitchy ember-crackling imp wreathed in sparks ────
        _buildDodgerImp() {
            const p = this.profile;
            this._impBase({ wings: true, eyeColor: 0xff8844, hornColor: 0x281410 });
            this.embers = new THREE.Group();
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

    const NAMED = {
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
