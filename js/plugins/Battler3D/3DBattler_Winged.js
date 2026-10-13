//=============================================================================
// 3D Battler System - Winged Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Flying procedural 3D battlers (bat, bird). Requires
 * 3DBattlerSystem (core) to load first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Winged Family
 * ============================================================================
 *
 * Small flyers that hover and flap their wings (no physics). They reuse the
 * shared part-losing engine from window.Battler3D.Base.
 *
 * Registered archetypes:
 *   Bat  (parts: HEAD, BODY, LEFT_WING, RIGHT_WING, FANGS)
 *   Bird (parts: HEAD, BODY, BEAK, LEFT_WING, RIGHT_WING, TALONS)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Winged] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const WINGED_PROFILES = {
        bat: {
            variant: 'bat', scale: 1.9, bodyColor: 0x3a2b3f, wingColor: 0x241a28, texturePool: 'fur',
            hue: [0.80, 0.05], sat: [0.30, 0.10], lit: [0.22, 0.06]
        },
        bird: {
            variant: 'bird', scale: 2.0, bodyColor: 0x6b8cae, wingColor: 0x4f6f93, texturePool: 'pale',
            hue: [0.58, 0.12], sat: [0.45, 0.18], lit: [0.50, 0.12]
        },
        // Bespoke vampiric bat: shadow-slime tattered wings, glowing eyes/fangs.
        shadowbat: {
            variant: 'shadowbat', scale: 2.1, texturePool: 'fur', bodyColor: 0x140d18, accent: 0x7a3aff,
            hue: [0.74, 0.06], sat: [0.40, 0.10], lit: [0.10, 0.04]
        },
        // Bespoke magma drake-bat: molten-cracked wings, screeching sonic maw, ember fangs.
        sonicmoltendrakebat: {
            variant: 'sonicmoltendrakebat', scale: 2.4, texturePool: 'fur', bodyColor: 0x2a0a06, accent: 0xff6a14,
            hue: [0.03, 0.04], sat: [0.70, 0.12], lit: [0.20, 0.06]
        }
    };

    class WingedBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = WINGED_PROFILES[creatureType] || WINGED_PROFILES.bat;
            super(scale, offsetY, battler, profile, 0, creatureType || 'bat');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        // Local material/eye helpers (mirror the Birds family) for bespoke builders.
        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.7 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.7 : 0,
                side: THREE.DoubleSide, transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m); return m;
        }
        _skinMat(color, rough) {
            const m = new THREE.MeshStandardMaterial({ color, map: this.skinTex(), roughness: (rough === undefined ? 0.85 : rough), transparent: true });
            this._materials.push(m); return m;
        }
        _eye(parent, x, y, z, r, color, glow) {
            const e = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(color || 0x111111, 1.0, 0.25, glow ? color : 0));
            e.position.set(x, y, z); parent.add(e); return e;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            const p = this.profile;

            // Bespoke variants build their own distinct geometry.
            if (this.variant === 'shadowbat' || this.variant === 'sonicmoltendrakebat') {
                switch (this.variant) {
                    case 'shadowbat': this._buildShadowbat(); break;
                    case 'sonicmoltendrakebat': this._buildSonicmoltendrakebat(); break;
                }
                this.model = this.bodyGroup;
                this.applyModelScale();
                this.loaded = true;
                return this;
            }
            const skin = this.skinTex();
            const bodyMat = new THREE.MeshStandardMaterial({ color: p.bodyColor, map: skin, roughness: 0.8, transparent: true });
            const wingMat = new THREE.MeshStandardMaterial({ color: p.wingColor, roughness: 0.85, side: THREE.DoubleSide, transparent: true });
            this._materials.push(bodyMat, wingMat);

            // Body (egg-shaped) and head.
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), bodyMat);
            this.body.position.y = 1.0; this.body.scale.set(1.0, 1.2, 1.0);
            this.bodyGroup.add(this.body);

            this.head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), bodyMat);
            this.head.position.set(0, 1.42, 0.05);
            this.bodyGroup.add(this.head);

            // Eyes.
            const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdd22, emissive: 0x332200, roughness: 0.3 });
            const le = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat); le.position.set(-0.09, 0.03, 0.18);
            const re = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat); re.position.set(0.09, 0.03, 0.18);
            this.head.add(le, re);

            // Wings: thin flattened cones swept back; pivoted at the shoulders so
            // they flap by rotating about Z.
            const wingGeo = new THREE.ConeGeometry(0.18, 0.95, 4);
            this.lwing = new THREE.Group();
            const lw = new THREE.Mesh(wingGeo, wingMat); lw.position.set(-0.5, 0, 0); lw.rotation.z = Math.PI / 2; lw.scale.set(1, 1, 0.18);
            this.lwing.add(lw); this.lwing.position.set(-0.1, 1.05, -0.05);
            this.bodyGroup.add(this.lwing);

            this.rwing = new THREE.Group();
            const rw = new THREE.Mesh(wingGeo, wingMat); rw.position.set(0.5, 0, 0); rw.rotation.z = -Math.PI / 2; rw.scale.set(1, 1, 0.18);
            this.rwing.add(rw); this.rwing.position.set(0.1, 1.05, -0.05);
            this.bodyGroup.add(this.rwing);

            this._partMeshMap = { HEAD: this.head, BODY: this.body, LEFT_WING: this.lwing, RIGHT_WING: this.rwing };
            this._cascadeRules = [
                // Body destroyed -> the whole flyer drops apart.
                { gone: ['BODY'], hide: [this.body, this.head, this.lwing, this.rwing] },
                { gone: ['HEAD'], hide: [this.head] },
                { gone: ['LEFT_WING'],  hide: [this.lwing] },
                { gone: ['RIGHT_WING'], hide: [this.rwing] },
            ];

            if (this.variant === 'bird') {
                // Beak + talons.
                const beakMat = new THREE.MeshStandardMaterial({ color: 0xe8a23a, roughness: 0.6 });
                this.beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), beakMat);
                this.beak.position.set(0, -0.02, 0.24); this.beak.rotation.x = Math.PI / 2;
                this.head.add(this.beak);
                this.talons = new THREE.Group();
                const tMat = new THREE.MeshStandardMaterial({ color: 0xc8902a, roughness: 0.7 });
                for (let i = -1; i <= 1; i += 2) {
                    const t = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 5), tMat);
                    t.position.set(i * 0.1, 0.72, 0.05); t.rotation.x = Math.PI;
                    this.talons.add(t);
                }
                this.bodyGroup.add(this.talons);
                this._partMeshMap.BEAK = this.beak;
                this._partMeshMap.TALONS = this.talons;
                this._cascadeRules.push({ gone: ['BEAK'], hide: [this.beak] });
                this._cascadeRules.push({ gone: ['TALONS'], hide: [this.talons] });
            } else {
                // Bat fangs.
                const fangMat = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: 0.5 });
                this.fangs = new THREE.Group();
                for (let i = -1; i <= 1; i += 2) {
                    const f = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 4), fangMat);
                    f.position.set(i * 0.05, -0.12, 0.18); f.rotation.x = Math.PI;
                    this.fangs.add(f);
                }
                this.head.add(this.fangs);
                this._partMeshMap.FANGS = this.fangs;
                this._cascadeRules.push({ gone: ['FANGS'], hide: [this.fangs] });
                // Bat ears.
                const earGeo = new THREE.ConeGeometry(0.06, 0.18, 4);
                const lE = new THREE.Mesh(earGeo, bodyMat); lE.position.set(-0.1, 0.2, 0); lE.rotation.z = 0.2;
                const rE = new THREE.Mesh(earGeo, bodyMat); rE.position.set(0.1, 0.2, 0); rE.rotation.z = -0.2;
                this.head.add(lE, rE);
            }

            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // Shared dismemberment wiring for the bat-bodied bespoke builders.
        // parts: { HEAD, BODY, LEFT_WING, RIGHT_WING, FANGS } meshes/groups.
        _wireBatRig(parts) {
            this.head = parts.HEAD; this.body = parts.BODY;
            this.lwing = parts.LEFT_WING; this.rwing = parts.RIGHT_WING; this.fangs = parts.FANGS;
            this._partMeshMap = {
                HEAD: parts.HEAD, BODY: parts.BODY,
                LEFT_WING: parts.LEFT_WING, RIGHT_WING: parts.RIGHT_WING, FANGS: parts.FANGS
            };
            this._cascadeRules = [
                { gone: ['BODY'], hide: [parts.BODY, parts.HEAD, parts.LEFT_WING, parts.RIGHT_WING, parts.FANGS] },
                { gone: ['HEAD'], hide: [parts.HEAD, parts.FANGS] },
                { gone: ['LEFT_WING'],  hide: [parts.LEFT_WING] },
                { gone: ['RIGHT_WING'], hide: [parts.RIGHT_WING] },
                { gone: ['FANGS'], hide: [parts.FANGS] },
            ];
        }

        // Build one tattered/cracked membrane wing as a sweep of fingered struts
        // joined by a ragged web; returned as a Z-flapping pivot group.
        _membraneWing(side, webMat, boneMat, opts) {
            const o = opts || {};
            const grp = new THREE.Group();
            const fingers = o.fingers || 3;
            const len = o.len || 0.95;
            const spread = o.spread || 0.9;
            for (let i = 0; i < fingers; i++) {
                const f = i / (fingers - 1);                 // 0..1 root->tip fan
                const ang = (0.15 + f * spread);             // splay outward
                // Bone strut.
                const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, len, 5), boneMat);
                bone.position.set(side * (0.05 + f * len * 0.5), -f * 0.12, 0);
                bone.rotation.z = side * (Math.PI / 2 - ang * 0.35);
                grp.add(bone);
                // Ragged web panel between this strut and the next (jagged tip).
                if (i < fingers - 1) {
                    const web = new THREE.Mesh(new THREE.ConeGeometry(0.16 + this.idRand() * 0.05, len * 0.55, 3), webMat);
                    web.position.set(side * (0.18 + f * len * 0.45), -f * 0.18 - 0.1, -0.02);
                    // Flattened in z so the panel lies in the wing's own plane
                    // (it used to stand out flat as a fin to the front and back),
                    // tip pointing out and down between the struts.
                    web.rotation.set(0, 0, -side * (Math.PI / 2 + 0.1 + f * 0.35));
                    web.scale.set(1, 1, 0.12);
                    grp.add(web);
                }
            }
            // Big trailing membrane sheet.
            const sheet = new THREE.Mesh(new THREE.CircleGeometry(len * 0.62, 5), webMat);
            sheet.position.set(side * len * 0.45, -0.18, -0.03);
            sheet.scale.set(1, 0.7, 1);
            sheet.rotation.y = side * 0.25;
            grp.add(sheet);
            grp.position.set(side * 0.16, 1.06, -0.04);
            return grp;
        }

        // --- Shadow Bat: vampiric, near-black slime body, violet glow, shadow web wings.
        _buildShadowbat() {
            const p = this.profile;
            const skin = this._skinMat(p.bodyColor, 0.55);   // wet shadow-slime sheen
            const web = this._mat(0x0a0610, 0.78, 0.6);      // translucent shadow membrane
            const bone = this._mat(0x2a1a3a, 1.0, 0.7);
            const glow = this._mat(p.accent, 1.0, 0.3, p.accent);

            // BODY: drippy egg with a slumped lower drip (slime).
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 16), skin);
            body.position.y = 1.0; body.scale.set(1.0, 1.3, 0.95);
            this.bodyGroup.add(body);
            const drip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 8), skin);
            drip.position.set(0, -0.36, 0); drip.rotation.x = Math.PI; body.add(drip);   // body-local: hangs under the belly

            // HEAD: snub vampiric skull with tall pointed ears.
            const head = new THREE.Group();
            head.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skin));
            const snout = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), skin);
            snout.position.set(0, -0.04, 0.18); snout.scale.set(1, 0.8, 1.1); head.add(snout);
            const earGeo = new THREE.ConeGeometry(0.06, 0.28, 4);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(earGeo, skin);
                ear.position.set(s * 0.12, 0.24, -0.02); ear.rotation.z = -s * 0.18; head.add(ear);
            }
            this._eye(head, -0.09, 0.04, 0.16, 0.055, p.accent, true);
            this._eye(head, 0.09, 0.04, 0.16, 0.055, p.accent, true);
            head.position.set(0, 1.42, 0.04);
            this.bodyGroup.add(head);

            // FANGS: pair of long glowing violet-tipped fangs jutting down.
            const fangs = new THREE.Group();
            for (const s of [-1, 1]) {
                const f = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.13, 5), glow);
                f.position.set(s * 0.05, -0.16, 0.2); f.rotation.x = Math.PI; fangs.add(f);
            }
            head.add(fangs);

            // WINGS: ragged shadow-slime membranes.
            const lwing = this._membraneWing(-1, web, bone, { fingers: 3, len: 0.98, spread: 1.0 });
            const rwing = this._membraneWing(1, web, bone, { fingers: 3, len: 0.98, spread: 1.0 });
            this.bodyGroup.add(lwing, rwing);

            this._wireBatRig({ HEAD: head, BODY: body, LEFT_WING: lwing, RIGHT_WING: rwing, FANGS: fangs });
        }

        // --- Sonic Molten Drakebat: hellish magma drake-bat, cracked glowing wings,
        //     screeching maw, ember fangs, draconic horned head.
        _buildSonicmoltendrakebat() {
            const p = this.profile;
            const hide = this._skinMat(p.bodyColor, 0.8);          // charred drake hide
            const magma = this._mat(0xff7a1a, 0.9, 0.4, 0xff4400); // cracked molten web
            const bone = this._mat(0x1a0805, 1.0, 0.7);            // black wing bones
            const ember = this._mat(0xffd24a, 1.0, 0.3, 0xff7a00); // glowing ember
            const maw = this._mat(0xff3000, 1.0, 0.35, 0xff2000);  // screaming throat glow

            // BODY: barrel drake torso with cracked magma vents (glowing bands).
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 16), hide);
            body.position.y = 1.0; body.scale.set(1.05, 1.2, 1.0);
            this.bodyGroup.add(body);
            for (let i = 0; i < 3; i++) {
                const vent = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.025, 6, 14), ember);
                vent.position.set(0, 0.86 + i * 0.13, 0); vent.rotation.x = Math.PI / 2; vent.scale.set(1, 1, 0.5);
                this.bodyGroup.add(vent);
            }

            // HEAD: angular draconic skull with back-swept horns + open screeching maw.
            const head = new THREE.Group();
            head.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), hide));
            const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 6), hide);
            muzzle.position.set(0, -0.05, 0.22); muzzle.rotation.x = Math.PI / 2; head.add(muzzle);
            // Screeching maw: glowing throat cone inside the open jaw.
            const throat = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), maw);
            throat.position.set(0, -0.08, 0.26); throat.rotation.x = Math.PI / 2; head.add(throat);
            const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), hide);
            jaw.position.set(0, -0.16, 0.22); jaw.rotation.set(Math.PI / 2 + 0.5, 0, 0); head.add(jaw);
            // Back-swept horns.
            const hornGeo = new THREE.ConeGeometry(0.045, 0.34, 5);
            for (const s of [-1, 1]) {
                const horn = new THREE.Mesh(hornGeo, bone);
                horn.position.set(s * 0.13, 0.18, -0.08); horn.rotation.set(-0.9, 0, -s * 0.3); head.add(horn);
            }
            this._eye(head, -0.1, 0.06, 0.13, 0.05, 0xffcc33, true);
            this._eye(head, 0.1, 0.06, 0.13, 0.05, 0xffcc33, true);
            head.position.set(0, 1.44, 0.04);
            this.bodyGroup.add(head);

            // FANGS: row of ember-glowing fangs lining the maw.
            const fangs = new THREE.Group();
            for (const s of [-1, 1]) {
                for (let k = 0; k < 2; k++) {
                    const f = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.1, 4), ember);
                    f.position.set(s * (0.05 + k * 0.05), -0.14 + k * 0.02, 0.24); f.rotation.x = Math.PI; fangs.add(f);
                }
            }
            head.add(fangs);

            // WINGS: wide cracked-magma membranes on black bones.
            const lwing = this._membraneWing(-1, magma, bone, { fingers: 4, len: 1.15, spread: 1.05 });
            const rwing = this._membraneWing(1, magma, bone, { fingers: 4, len: 1.15, spread: 1.05 });
            this.bodyGroup.add(lwing, rwing);

            this._wireBatRig({ HEAD: head, BODY: body, LEFT_WING: lwing, RIGHT_WING: rwing, FANGS: fangs });
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;

            let growth = 1.0;
            if (this.currentAnimation === 'spawn') growth = Math.min(1.0, t / 0.6);
            this.applyModelScale(growth);

            // Flap rate rises during attacks.
            let flapRate = 9;
            if (this.currentAnimation === 'attack') flapRate = 16;
            else if (this.currentAnimation === 'specialattack') flapRate = 22;
            const flap = Math.sin(t * flapRate) * 0.7;
            if (this.lwing && this.lwing.visible) this.lwing.rotation.z = 0.2 + flap;
            if (this.rwing && this.rwing.visible) this.rwing.rotation.z = -0.2 - flap;

            // Bob with the flap; small dart on hit.
            let bob = Math.sin(t * flapRate) * 0.05 + Math.sin(t * 1.4) * 0.08;
            if (this.currentAnimation === 'hit') bob += Math.sin(t * 26) * Math.exp(-t * 6) * 0.16;
            this.model.position.y = this._baseY + bob * this.scale;
            this.model.rotation.z = Math.sin(t * 1.1) * 0.05;

            if (this.head && this.head.visible) this.head.rotation.x = Math.sin(t * 2) * 0.1;
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.0);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Tumble downward.
            this.model.position.y = this._baseY - prog * 0.8 * this.scale;
            this.model.rotation.x = prog * 1.5;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new WingedBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = WINGED_PROFILES;
    reg('bat',  { aliases: ['bat', 'bats'], scale: WINGED_PROFILES.bat.scale, weapon: 0, create: make });
    reg('bird', { aliases: ['bird', 'birds', 'raven', 'crow', 'hawk', 'eagle', 'pigeon', 'jay', 'owl', 'duck', 'flamingo', 'parrot', 'chick', 'chicken', 'crane', 'sparrow', 'finch', 'vulture', 'falcon', 'penguin', 'ostrich', 'peacock', 'swan', 'goose', 'seagull', 'gull', 'pelican', 'heron', 'stork', 'robin', 'cardinal', 'magpie', 'cockatoo', 'toucan'], scale: WINGED_PROFILES.bird.scale, weapon: 0, create: make });

    // Bespoke unique bats.
    reg('shadowbat',          { aliases: ['shadowbat'],          scale: S.shadowbat.scale,          weapon: 0, create: make });
    reg('sonicmoltendrakebat',{ aliases: ['sonicmoltendrakebat'],scale: S.sonicmoltendrakebat.scale,weapon: 0, create: make });

    // Exact-name pins (outrank name-token / <Archetype:> resolution).
    const NAMED = {
        shadowbat: ["Shadow Bat"],
        sonicmoltendrakebat: ["Sonic Molten Drakebat"],
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Winged family registered');
})();
