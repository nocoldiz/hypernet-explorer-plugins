//=============================================================================
// 3D Battler System - Critter Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke small-quadruped one-off models (baby bunny, cautious
 * opossum, skunk, taxidoggo) + name-based assignment. Requires 3DBattlerSystem
 * + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Critter Uniques
 * ============================================================================
 *
 * Distinct procedural small mammals shaped from each enemy's flavour text,
 * assigned by exact name (override with <Battler3D: key>). They map the Beast
 * (quadruped) archetype keys (BODY/HEAD + the four leg keys) so dismemberment
 * works, and reuse the base per-id variation + gestures.
 *
 * Registered: babybunny, opossum, skunk, taxidoggo, curiousrabbit, direrabbit,
 * and the level 1-5 starters lv_hedgerabbit, lv_opossumkit, lv_straypup,
 * lv_snowdrifthare, lv_sulkyskunklet
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Critters] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const C_PROFILES = {
        babybunny: { variant: 'babybunny', scale: 1.6, texturePool: 'fur', bodyColor: 0xe8e0d8, accent: 0xff8a9a, hue: [0.07, 0.04], sat: [0.12, 0.06], lit: [0.78, 0.08] },
        opossum:   { variant: 'opossum',   scale: 1.7, texturePool: 'fur', bodyColor: 0x9a9088, accent: 0xddaaaa, hue: [0.08, 0.04], sat: [0.10, 0.05], lit: [0.55, 0.08] },
        skunk:     { variant: 'skunk',     scale: 1.7, texturePool: 'fur', bodyColor: 0x1a1a1a, accent: 0xeeeeee, hue: [0.0, 0.0], sat: [0.0, 0.04], lit: [0.12, 0.05] },
        taxidoggo: { variant: 'taxidoggo', scale: 1.8, texturePool: 'fur', bodyColor: 0x8a6a44, accent: 0x88e0cc, hue: [0.08, 0.04], sat: [0.40, 0.10], lit: [0.42, 0.08] },
        curiousrabbit: { variant: 'curiousrabbit', scale: 1.5, texturePool: 'fur', bodyColor: 0xc9b89a, accent: 0xff9999, hue: [0.09, 0.04], sat: [0.20, 0.08], lit: [0.62, 0.08] },
        direrabbit:    { variant: 'direrabbit',    scale: 2.1, texturePool: 'fur', bodyColor: 0x6a5a48, accent: 0xcc3333, hue: [0.07, 0.04], sat: [0.30, 0.10], lit: [0.38, 0.08] },
        // Level 1-5 starter critters, each on its own builder.
        lv_hedgerabbit:   { variant: 'lv_hedgerabbit',   scale: 1.5, texturePool: 'fur', bodyColor: 0x7a5a3a, accent: 0xb0181a, hue: [0.07, 0.03], sat: [0.35, 0.10], lit: [0.36, 0.08] },
        lv_opossumkit:    { variant: 'lv_opossumkit',    scale: 1.4, texturePool: 'fur', bodyColor: 0x8a8480, accent: 0xe6a4a6, hue: [0.08, 0.04], sat: [0.06, 0.05], lit: [0.50, 0.08] },
        lv_straypup:      { variant: 'lv_straypup',      scale: 1.6, texturePool: 'fur', bodyColor: 0xa0784a, accent: 0xb8bcc0, hue: [0.08, 0.03], sat: [0.40, 0.10], lit: [0.42, 0.08] },
        lv_snowdrifthare: { variant: 'lv_snowdrifthare', scale: 1.6, texturePool: 'fur', bodyColor: 0xf2f2f0, accent: 0x6fd0ff, hue: [0.55, 0.05], sat: [0.04, 0.04], lit: [0.90, 0.05] },
        lv_sulkyskunklet: { variant: 'lv_sulkyskunklet', scale: 1.5, texturePool: 'fur', bodyColor: 0x161616, accent: 0xf0f0ea, hue: [0.0, 0.0], sat: [0.0, 0.04], lit: [0.10, 0.04] }
    };

    class CritterBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = C_PROFILES[creatureType] || C_PROFILES.babybunny;
            super(scale, offsetY, battler, profile, 0, creatureType || 'babybunny');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.legs = [];
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.8 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.5 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.8 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), this._mat(0x0a0a0a, 1.0, 0.2));
            eye.position.set(x, y, z);
            const shine = new THREE.Mesh(new THREE.SphereGeometry(r * 0.4, 6, 6), this._mat(accent || 0xffffff, 1.0, 0.2, accent));
            shine.position.set(0, r * 0.25, r * 0.7); eye.add(shine);
            parent.add(eye); return eye;
        }
        // A leg hinges at the hip: the group sits inside the body and the shank
        // hangs below it, so the shuffle swings the paw and never the hip.
        _critLeg(x, z, bodyY, mat) {
            const g = new THREE.Group(); g.position.set(x, bodyY - 0.105, z);
            const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.45, 6), mat);
            shank.position.y = -0.225; g.add(shank);
            g._x = x; g._z = z; this.legs.push(g); this.bodyGroup.add(g); return g;
        }
        _quadBase(o) {
            o = o || {};
            const p = this.profile;
            const mat = o.mat || this._skinMat(p.bodyColor, 0.85);
            this._critMat = mat;
            this.body = new THREE.Mesh(new THREE.SphereGeometry(o.bodyR || 0.42, 14, 12), mat);
            this.body.position.set(0, o.bodyY || 0.7, 0); this.body.scale.copy(o.bodyScale || new THREE.Vector3(1, 0.9, 1.5)); this.bodyGroup.add(this.body);
            this.head = new THREE.Group();
            const h = new THREE.Mesh(new THREE.SphereGeometry(o.headR || 0.28, 14, 12), mat); if (o.headScale) h.scale.copy(o.headScale); this.head.add(h);
            this.head.position.set(0, (o.bodyY || 0.7) + (o.headDY || 0.12), (o.headZ || 0.55)); this.bodyGroup.add(this.head);
            const by = o.bodyY || 0.7, zf = o.legZF || 0.35, zr = o.legZR || 0.35;
            this.frontLeft = this._critLeg(-0.2, zf, by, mat); this.frontRight = this._critLeg(0.2, zf, by, mat);
            this.rearLeft = this._critLeg(-0.2, -zr, by, mat); this.rearRight = this._critLeg(0.2, -zr, by, mat);
            const extra = (o.extra || []).filter(Boolean);
            this._partMeshMap = {
                BODY: this.body, TORSO: this.body, SPINE: this.body, RIBCAGE: this.body, HEAD: this.head, SKULL: this.head, BRAIN: this.head,
                LEFT_LEG: this.frontLeft, FRONT_LEFT_PAW: this.frontLeft, RIGHT_LEG: this.frontRight, FRONT_RIGHT_PAW: this.frontRight,
                REAR_LEFT_LEG: this.rearLeft, HIND_LEFT_LEG: this.rearLeft, REAR_RIGHT_LEG: this.rearRight, HIND_RIGHT_LEG: this.rearRight
            };
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE'], hide: [this.body, this.head, this.frontLeft, this.frontRight, this.rearLeft, this.rearRight, ...extra] },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [this.rearRight] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'opossum':   this._buildOpossum(); break;
                case 'skunk':     this._buildSkunk(); break;
                case 'taxidoggo': this._buildTaxidoggo(); break;
                case 'curiousrabbit': this._buildRabbit(false); break;
                case 'direrabbit':    this._buildRabbit(true); break;
                case 'lv_hedgerabbit':   this._buildHedgeRabbit(); break;
                case 'lv_opossumkit':    this._buildOpossumKit(); break;
                case 'lv_straypup':      this._buildStrayPup(); break;
                case 'lv_snowdrifthare': this._buildSnowdriftHare(); break;
                case 'lv_sulkyskunklet': this._buildSulkySkunklet(); break;
                default:          this._buildBunny(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Baby Bunny: cute leveret with razor buck-teeth ──────────────────
        _buildBunny() {
            const p = this.profile;
            this._quadBase({ bodyR: 0.4, bodyScale: new THREE.Vector3(1, 1.0, 1.3), headR: 0.3, headDY: 0.18, headZ: 0.42, legZF: 0.28, legZR: 0.3 });
            this._eye(this.head, -0.15, 0.05, 0.22, 0.08, p.accent); this._eye(this.head, 0.15, 0.05, 0.22, 0.08, p.accent);
            // Long ears.
            this.ears = new THREE.Group();
            const earGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.06, 0.4, 4, 8) : new THREE.CylinderGeometry(0.07, 0.04, 0.5, 6);
            for (const ex of [-0.12, 0.12]) { const ear = new THREE.Mesh(earGeo, this._critMat); ear.position.set(ex, 0.4, -0.02); ear.rotation.z = ex * 0.3; this.ears.add(ear); }
            this.head.add(this.ears);
            // Razor buck-teeth.
            for (const tx of [-0.05, 0.05]) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), this._mat(0xfafafa, 1.0, 0.3)); tooth.position.set(tx, -0.16, 0.26); this.head.add(tooth); }
            // Fluffy tail.
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), this._mat(0xffffff, 1.0, 0.95)); this.tail.position.set(0, 0.72, -0.5); this.bodyGroup.add(this.tail);
        }

        // ── Cautious Opossum: pointed snout, hairless pink tail ─────────────
        _buildOpossum() {
            const p = this.profile;
            this._quadBase({ bodyR: 0.4, bodyScale: new THREE.Vector3(1, 0.85, 1.6), headR: 0.24, headDY: 0.08, headZ: 0.6 });
            // Long pointed snout.
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), this._critMat); snout.position.set(0, -0.02, 0.22); snout.rotation.x = Math.PI / 2; this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), this._mat(p.accent, 1.0, 0.4)); nose.position.set(0, -0.02, 0.42); this.head.add(nose);
            this._eye(this.head, -0.12, 0.06, 0.1, 0.06, 0x111111); this._eye(this.head, 0.12, 0.06, 0.1, 0.06, 0x111111);
            // Small round ears.
            for (const ex of [-0.16, 0.16]) { const ear = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), this._mat(0x2a2420, 1.0, 0.7)); ear.position.set(ex, 0.2, 0); this.head.add(ear); }
            // Hairless pink curling tail.
            // Each bead steps back by less than its own radius, so the curl is
            // one unbroken rope (the old fixed 0.12 stride left the tip hanging
            // in the air once the beads had shrunk).
            this.tail = new THREE.Group();
            const tailMat = this._mat(p.accent, 1.0, 0.6);
            // The group sits at the root, so the sway pivots there.
            let px = 0, pz = 0, py = 0;
            for (let i = 0; i < 8; i++) {
                const r = 0.07 - i * 0.006;
                const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), tailMat); seg.position.set(px, py, pz); this.tail.add(seg);
                pz -= r * 1.3; py += i > 3 ? r * 0.6 : 0; px += r * 0.45 * (i > 2 ? 1 : 0);
            }
            this.tail.position.set(0, 0.7, -0.6);
            this.bodyGroup.add(this.tail);
        }

        // ── Skunk: black body, white back stripe, big raised tail ───────────
        _buildSkunk() {
            const p = this.profile;
            this._quadBase({ bodyR: 0.4, bodyScale: new THREE.Vector3(1, 0.9, 1.5), headR: 0.24, headDY: 0.06, headZ: 0.55 });
            const white = this._mat(p.accent, 1.0, 0.9);
            // White stripe along the back.
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 1.1), white); stripe.position.set(0, 1.04, -0.05); this.bodyGroup.add(stripe);
            const headStripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.3), white); headStripe.position.set(0, 0.2, 0.0); this.head.add(headStripe);
            this._eye(this.head, -0.12, 0.04, 0.18, 0.055, 0xffffff); this._eye(this.head, 0.12, 0.04, 0.18, 0.055, 0xffffff);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0x222222, 1.0, 0.4)); nose.position.set(0, -0.02, 0.24); this.head.add(nose);
            // Big bushy raised tail (black with a white plume).
            this.tail = new THREE.Group();
            const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), this._critMat); t1.position.set(0, 0.3, 0); t1.scale.set(0.8, 1.3, 0.8); this.tail.add(t1);
            const plume = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), white); plume.position.set(0, 0.55, 0); plume.scale.set(0.8, 1.1, 0.8); this.tail.add(plume);
            this.tail.position.set(0, 0.8, -0.6); this.tail.rotation.x = -0.5; this.bodyGroup.add(this.tail);
        }

        // ── Taxidoggo: a stiff, glassy-eyed taxidermied dog ─────────────────
        _buildTaxidoggo() {
            const p = this.profile;
            this._quadBase({ bodyR: 0.42, bodyScale: new THREE.Vector3(1, 0.95, 1.6), headR: 0.27, headDY: 0.2, headZ: 0.6 });
            // Snout.
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.26), this._critMat); snout.position.set(0, -0.04, 0.22); this.head.add(snout);
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), this._mat(0x161616, 1.0, 0.3)); nose.position.set(0, -0.02, 0.36); this.head.add(nose);
            // Over-bright glassy taxidermy eyes.
            this._eye(this.head, -0.13, 0.07, 0.2, 0.075, p.accent); this._eye(this.head, 0.13, 0.07, 0.2, 0.075, p.accent);
            // Floppy ears.
            for (const ex of [-0.22, 0.22]) { const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.04), this._critMat); ear.position.set(ex, 0.08, 0); ear.rotation.z = ex * 0.5; this.head.add(ear); }
            // Visible stitch seam down the body + a mounting plaque.
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.0), this._mat(0x3a2a1a, 1.0, 0.6)); seam.position.set(0, 1.02, 0); this.bodyGroup.add(seam);
            const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), this._mat(0x4a3220, 1.0, 0.5)); plaque.position.set(0, 0.12, 0); this.bodyGroup.add(plaque);
            // Stiff straight tail sticking out.
            this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.4, 6), this._critMat); this.tail.position.set(0, 0.78, -0.6); this.tail.rotation.x = -1.2; this.bodyGroup.add(this.tail);
        }

        // ── Rabbit: timid leveret (curious) or hulking matted brute (dire) ──
        _buildRabbit(dire) {
            const p = this.profile;
            this._quadBase({ bodyR: dire ? 0.46 : 0.36, bodyScale: new THREE.Vector3(1, 1.0, 1.25), headR: dire ? 0.32 : 0.26, headDY: 0.18, headZ: 0.45, legZF: 0.28, legZR: 0.3 });
            this._eye(this.head, -0.14, 0.05, 0.2, 0.08, p.accent); this._eye(this.head, 0.14, 0.05, 0.2, 0.08, p.accent);
            this.ears = new THREE.Group();
            const earGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.06, dire ? 0.5 : 0.42, 4, 8) : new THREE.CylinderGeometry(0.07, 0.04, dire ? 0.6 : 0.5, 6);
            for (const ex of [-0.12, 0.12]) { const ear = new THREE.Mesh(earGeo, this._critMat); ear.position.set(ex, dire ? 0.5 : 0.42, -0.02); ear.rotation.z = ex * (dire ? 0.5 : 0.2); this.ears.add(ear); }
            this.head.add(this.ears);
            for (const tx of [-0.05, 0.05]) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, dire ? 0.16 : 0.1, 0.04), this._mat(0xfafafa, 1.0, 0.3)); tooth.position.set(tx, -0.16, 0.22); this.head.add(tooth); }
            this.tail = new THREE.Mesh(new THREE.SphereGeometry(dire ? 0.16 : 0.13, 10, 10), this._mat(0xffffff, 1.0, 0.95)); this.tail.position.set(0, 0.72, -0.5); this.bodyGroup.add(this.tail);
            if (dire) for (let i = 0; i < 6; i++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), this._critMat); tuft.position.set((this.idRand() - 0.5) * 0.6, 0.95, (this.idRand() - 0.5) * 0.8); tuft.rotation.x = this.idRand(); this.bodyGroup.add(tuft); }
        }

        //=====================================================================
        // Level 1-5 starter critters (lv_*). Low, faceted, each with one odd
        // detail. this.body is a GROUP (the torso mesh plus everything worn on
        // it), every leg is a pivot group at its hip, the head pivots at the
        // neck, and the tail at its root.
        //=====================================================================
        _lvM(color, rough, emissive) { return this._mat(color, 1.0, rough === undefined ? 0.85 : rough, emissive); }
        _lvBlob(r, mat, sx, sy, sz, ws, hs) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws || 9, hs || 7), mat);
            m.scale.set(sx || 1, sy || 1, sz || 1); return m;
        }
        _lvAt(mesh, x, y, z, parent) { mesh.position.set(x, y, z); (parent || this.body).add(mesh); return mesh; }
        _lvRod(a, b, r0, r1, mat, parent, seg) {
            const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg || 5), mat);
            m.position.copy(a).addScaledVector(d, 0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }
        // Points a mesh's +Y along `dir` (a spike, a quill, a hair).
        _lvAim(mesh, dir) { mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); return mesh; }
        _lvTorso(r, mat, sx, sy, sz, y, z, tilt) {
            this.body = new THREE.Group(); this.bodyGroup.add(this.body);
            this.bodyMesh = this._lvBlob(r, mat, sx, sy, sz);
            this.bodyMesh.position.set(0, y, z || 0); this.bodyMesh.rotation.x = tilt || 0;
            this.body.add(this.bodyMesh); return this.bodyMesh;
        }
        _lvHeadAt(x, y, z) { this.head = new THREE.Group(); this.head.position.set(x, y, z); this.bodyGroup.add(this.head); return this.head; }
        // A leg: pivot at the hip (x, y, z), shank of `len` straight down so the
        // paw lands on y = 0, and an optional paw shape.
        _lvLimb(x, y, z, len, r0, r1, mat, paw) {
            const g = new THREE.Group(); g.position.set(x, y, z);
            const shank = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 6), mat); shank.position.y = -len / 2; g.add(shank);
            if (paw) { paw.position.y += -len + (paw._lift || 0); g.add(paw); }
            this.legs.push(g); this.bodyGroup.add(g); return g;
        }
        _lvQuadParts(o) {
            o = o || {};
            const m = {}, set = (ks, mesh) => { if (mesh) ks.forEach(k => m[k] = mesh); };
            set(['BODY', 'TORSO', 'SPINE', 'RIBCAGE'], this.body);
            set(['HEAD', 'SKULL', 'BRAIN'], this.head);
            set(['LEFT_LEG', 'FRONT_LEFT_PAW'], this.frontLeft); set(['RIGHT_LEG', 'FRONT_RIGHT_PAW'], this.frontRight);
            set(['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], this.rearLeft); set(['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], this.rearRight);
            set(['TAIL'], this.tail); set(['MOUTH', 'JAW'], this.mouth);
            set(['EARS'], this.ears); set(['TEETH'], this.teeth);
            this._partMeshMap = m;
            const limbs = [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight];
            this._cascadeRules = [
                { gone: ['BODY', 'TORSO', 'SPINE', 'RIBCAGE'], hide: [this.body, this.head, ...limbs, this.tail, ...(o.extra || [])].filter(Boolean) },
                { gone: ['HEAD', 'SKULL', 'BRAIN'], hide: [this.head] },
                { gone: ['LEFT_LEG', 'FRONT_LEFT_PAW'], hide: [this.frontLeft] },
                { gone: ['RIGHT_LEG', 'FRONT_RIGHT_PAW'], hide: [this.frontRight] },
                { gone: ['REAR_LEFT_LEG', 'HIND_LEFT_LEG'], hide: [this.rearLeft] },
                { gone: ['REAR_RIGHT_LEG', 'HIND_RIGHT_LEG'], hide: [this.rearRight] },
                { gone: ['TAIL'], hide: [this.tail].filter(Boolean) },
                { gone: ['MOUTH', 'JAW'], hide: [this.mouth].filter(Boolean) },
                { gone: ['EARS'], hide: [this.ears].filter(Boolean) },
                { gone: ['TEETH'], hide: [this.teeth].filter(Boolean) },
            ].filter(r => r.hide.length);
        }
        _lvEye(parent, x, y, z, r, iris, shine) {
            const e = this._lvBlob(r, this._lvM(iris, 0.25), 1, 1, 1, 8, 6); e.position.set(x, y, z); parent.add(e);
            const pu = this._lvBlob(r * 0.55, this._lvM(0x080808, 0.2), 1, 1, 1, 6, 4); pu.position.set(0, 0, r * 0.62); e.add(pu);
            if (shine !== false) { const s = this._lvBlob(r * 0.22, this._lvM(0xffffff, 0.2, 0xffffff), 1, 1, 1, 4, 3); s.position.set(r * 0.25, r * 0.3, r * 0.85); e.add(s); }
            return e;
        }

        // ── Hedge Rabbit: brown hedgerow rabbit with heavy thumping haunches
        //    and the hedge still caught in its fur: burrs and a hawthorn twig ─
        // Archetype Rabbit: HEAD/BODY/EARS/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/
        // REAR_RIGHT_LEG/TAIL/TEETH.
        _buildHedgeRabbit() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9), pale = this._lvM(0xd6c4a2), pink = this._lvM(0xd89a9a, 0.6);
            this._lvTorso(0.36, fur, 1.0, 0.92, 1.3, 0.46, -0.02);
            this._lvAt(this._lvBlob(0.3, fur, 1.05, 1.0, 1.0), 0, 0.52, -0.2);             // high rump
            this._lvAt(this._lvBlob(0.18, pale, 1.0, 1.0, 0.8), 0, 0.38, 0.3);             // pale chest
            // Burrs and a snagged hawthorn twig with its berries.
            const burr = this._lvM(0x56602e, 0.9), thorn = this._lvM(0x3a2a18, 0.8), berry = this._lvM(0xb0181a, 0.4);
            [[-0.2, 0.7, -0.1], [0.24, 0.66, 0.06], [0.08, 0.78, -0.26], [-0.3, 0.5, 0.12], [0.3, 0.46, -0.3]].forEach(([x, y, z]) => {
                const b = this._lvAt(new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), burr), x, y, z);
                for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.06, 3), burr); this._lvAim(sp, new THREE.Vector3(Math.cos(k * 2.1), 0.6, Math.sin(k * 2.1))); sp.position.copy(sp.up.clone().applyQuaternion(sp.quaternion).multiplyScalar(0.04)); b.add(sp); }
            });
            const twig = new THREE.Group(); twig.position.set(0.12, 0.8, -0.32); twig.rotation.set(0.3, 0.4, -0.5); this.body.add(twig);
            this._lvRod(new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, 0.26, 0), 0.016, 0.008, thorn, twig);
            for (let k = 0; k < 3; k++) {
                const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.06, 3), thorn); t.position.set(k % 2 ? 0.025 : -0.025, 0.06 + k * 0.07, 0); t.rotation.z = k % 2 ? -1.1 : 1.1; twig.add(t);
                const bb = this._lvBlob(0.025, berry, 1, 1, 1, 6, 4); bb.position.set(k % 2 ? -0.03 : 0.03, 0.1 + k * 0.07, 0.01); twig.add(bb);
            }
            // Head: lateral amber eyes, split lip, ears laid back in warning.
            const h = this._lvHeadAt(0, 0.62, 0.34);
            h.add(this._lvAt(this._lvBlob(0.19, fur, 0.9, 0.95, 1.15), 0, 0.1, 0.12, h));
            this.muzzle = this._lvAt(this._lvBlob(0.1, pale, 1.1, 0.85, 1.0), 0, 0.04, 0.3, h);
            this._lvAt(this._lvBlob(0.026, pink, 1, 1, 1, 6, 4), 0, 0.075, 0.39, h);
            this._lvEye(h, -0.15, 0.15, 0.2, 0.05, 0x8a4a12); this._lvEye(h, 0.15, 0.15, 0.2, 0.05, 0x8a4a12);
            this.ears = new THREE.Group(); this.ears.position.set(0, 0.24, 0.06); h.add(this.ears);
            for (const s of [-1, 1]) {
                const ear = new THREE.Group(); ear.position.set(s * 0.07, 0, 0); ear.rotation.set(-1.0, 0, -s * 0.18); this.ears.add(ear);
                ear.add(this._lvAt(this._lvBlob(0.07, fur, 0.7, 3.2, 0.35, 6, 5), 0, 0.2, 0, ear));
                ear.add(this._lvAt(this._lvBlob(0.07, pink, 0.42, 2.6, 0.2, 6, 4), 0, 0.2, 0.016, ear));
            }
            this.teeth = new THREE.Group(); this.teeth.position.set(0, -0.01, 0.375); h.add(this.teeth);
            for (const s of [-1, 1]) this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.06, 0.02), this._lvM(0xf4f0e6, 0.3)), s * 0.016, -0.02, 0, this.teeth);
            // Front legs: thin, from the chest.
            const paw = () => this._lvBlob(0.05, fur, 1.0, 0.6, 1.3, 6, 4);
            this.frontLeft  = this._lvLimb(-0.13, 0.34, 0.26, 0.34, 0.05, 0.04, fur, (() => { const q = paw(); q.position.z = 0.03; q._lift = 0.03; return q; })());
            this.frontRight = this._lvLimb( 0.13, 0.34, 0.26, 0.34, 0.05, 0.04, fur, (() => { const q = paw(); q.position.z = 0.03; q._lift = 0.03; return q; })());
            // Hind legs: a heavy haunch, then the long flat foot it thumps with.
            const hind = (s) => {
                const g = new THREE.Group(); g.position.set(s * 0.22, 0.42, -0.22);
                g.add(this._lvAt(this._lvBlob(0.17, fur, 0.7, 1.0, 1.25), 0, -0.06, 0, g));
                this._lvRod(new THREE.Vector3(0, -0.12, -0.04), new THREE.Vector3(0, -0.37, -0.1), 0.06, 0.045, fur, g);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.38), fur); foot.position.set(0, -0.39, 0.04); g.add(foot);
                this.legs.push(g); this.bodyGroup.add(g); return g;
            };
            this.rearLeft = hind(-1); this.rearRight = hind(1);
            // Cotton tail, flicked up.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.6, -0.46); this.bodyGroup.add(this.tail);
            this._lvAt(this._lvBlob(0.1, this._lvM(0xf6f2ea, 0.95), 1, 1, 1, 6, 5), 0, 0.03, -0.03, this.tail);
            this._lvQuadParts({ extra: [this.ears, this.teeth] });
            this._lvCfg = { kind: 'rabbit' };
        }

        // ── Opossum Kit: a grizzled young opossum frozen in a fake faint,
        //    tongue lolling out of a fifty-tooth grin, tail curled in a loop ──
        // Archetype Beast: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/
        // REAR_RIGHT_LEG/TAIL/MOUTH.
        _buildOpossumKit() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), face = this._lvM(0xeeeae2), black = this._lvM(0x1e1c1c), pink = this._lvM(0xe6a4a6, 0.6), tooth = this._lvM(0xf6f2e6, 0.3);
            this._lvTorso(0.3, fur, 0.9, 0.8, 1.5, 0.34, 0);
            // Grizzled guard hairs bristling along the back.
            for (let i = 0; i < 9; i++) {
                const a = -0.8 + (i % 3) * 0.8, z = -0.3 + Math.floor(i / 3) * 0.25;
                const k = Math.sqrt(Math.max(0.1, 1 - (z / 0.45) * (z / 0.45)));
                const dir = new THREE.Vector3(Math.sin(a), Math.cos(a), -0.3);
                const hair = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 3), face), dir);
                this._lvAt(hair, Math.sin(a) * 0.27 * k * 0.95, 0.34 + Math.cos(a) * 0.24 * k * 0.95, z);
            }
            const h = this._lvHeadAt(0, 0.4, 0.38);
            h.add(this._lvAt(this._lvBlob(0.15, face, 0.95, 0.9, 1.05), 0, 0.04, 0.1, h));
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), face); snout.rotation.x = Math.PI / 2; this._lvAt(snout, 0, 0.0, 0.28, h);
            this._lvAt(this._lvBlob(0.03, pink, 1, 1, 1, 6, 4), 0, 0, 0.39, h);
            this._lvEye(h, -0.08, 0.08, 0.19, 0.036, 0x0c0c0c); this._lvEye(h, 0.08, 0.08, 0.19, 0.036, 0x0c0c0c);
            for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.016, 8), black); ear.rotation.x = Math.PI / 2; this._lvAt(ear, s * 0.1, 0.15, 0.04, h); }
            // Upper teeth along the snout, then the jaw hanging open with more.
            for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.035, 3), tooth); t.rotation.x = Math.PI; this._lvAt(t, s * 0.03, -0.035, 0.2 + k * 0.04, h); }
            this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.04, 0.16); this.mouth.rotation.x = 0.4; h.add(this.mouth);
            const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), face); jaw.rotation.x = Math.PI / 2; this._lvAt(jaw, 0, 0, 0.1, this.mouth);
            for (let k = 0; k < 3; k++) for (const s of [-1, 1]) this._lvAt(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 3), tooth), s * 0.022, 0.025, 0.06 + k * 0.035, this.mouth);
            const tongue = this._lvBlob(0.03, pink, 0.7, 0.3, 2.2, 6, 4); tongue.rotation.set(0.6, 0.55, 0); this._lvAt(tongue, 0.05, -0.04, 0.1, this.mouth);
            // Short black legs ending in bare pink hands.
            const hand = () => { const g = new THREE.Group(); g._lift = 0.015; const palm = this._lvBlob(0.05, pink, 1.2, 0.45, 1.2, 6, 4); g.add(palm); for (let f = 0; f < 4; f++) { const fg = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 3), pink); fg.rotation.x = Math.PI / 2; fg.position.set(-0.04 + f * 0.027, -0.005, 0.06); g.add(fg); } return g; };
            this.frontLeft  = this._lvLimb(-0.16, 0.24, 0.24, 0.24, 0.045, 0.035, black, hand());
            this.frontRight = this._lvLimb( 0.16, 0.24, 0.24, 0.24, 0.045, 0.035, black, hand());
            this.rearLeft   = this._lvLimb(-0.17, 0.24, -0.24, 0.24, 0.05, 0.04, black, hand());
            this.rearRight  = this._lvLimb( 0.17, 0.24, -0.24, 0.24, 0.05, 0.04, black, hand());
            // Bare prehensile tail: grey at the root, then pink, curled in a loop.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.34, -0.4); this.bodyGroup.add(this.tail);
            let n = 0;
            const bead = (y, z, r) => { this._lvAt(this._lvBlob(r, n++ < 3 ? fur : pink, 1, 1, 1, 6, 4), 0, y, z, this.tail); };
            for (let i = 0; i < 6; i++) bead(-i * 0.008, -i * 0.04, 0.045 - i * 0.002);
            const R = 0.13, cy = -0.04 + R, cz = -0.24;
            for (let a = 0, i = 0; a < Math.PI * 1.75; a += 0.24, i++) bead(cy - R * Math.cos(a), cz - R * Math.sin(a), Math.max(0.02, 0.034 - i * 0.0012));
            this._lvQuadParts();
            this._lvCfg = { kind: 'opossum' };
        }

        // ── Stray Pup: skinny muddy pup, ribs showing like bands, one ear up
        //    and one flopped, a fraying rope collar with a tin tag ────────────
        // Archetype Beast: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/
        // REAR_RIGHT_LEG/TAIL/MOUTH.
        _buildStrayPup() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.9), mud = this._lvM(0x4e3a26), rib = this._lvM(0x6e5032), dark = this._lvM(0x141210, 0.4), pink = this._lvM(0xd87a84, 0.5);
            this._lvTorso(0.26, fur, 0.75, 0.8, 1.6, 0.6, 0);
            // Ribs: hoops under the skin of the chest, lower half only.
            for (const z of [0.04, 0.12, 0.2]) {
                const R = 0.2 * Math.sqrt(1 - (z / 0.416) * (z / 0.416)) + 0.004;
                const hoop = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 3, 10, Math.PI * 1.1), rib);
                hoop.rotation.z = Math.PI * 0.95; hoop.scale.set(0.98, 1.04, 1); this._lvAt(hoop, 0, 0.6, z);
            }
            [[0.14, 0.56, -0.18], [-0.12, 0.66, -0.26], [-0.15, 0.5, 0.1]].forEach(([x, y, z]) => this._lvAt(this._lvBlob(0.1, mud, 0.6, 0.8, 1.2), x, y, z));
            // Head on a short neck, big hopeful eyes under worried brows.
            const h = this._lvHeadAt(0, 0.68, 0.34);
            this._lvRod(new THREE.Vector3(0, -0.02, -0.02), new THREE.Vector3(0, 0.14, 0.1), 0.085, 0.075, fur, h);
            h.add(this._lvAt(this._lvBlob(0.17, fur, 0.95, 0.9, 1.0), 0, 0.17, 0.14, h));
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.16), fur), 0, 0.1, 0.3, h);
            this._lvAt(this._lvBlob(0.035, dark, 1.2, 0.9, 1, 6, 4), 0, 0.135, 0.38, h);
            this._lvEye(h, -0.08, 0.21, 0.27, 0.045, 0x5a3412); this._lvEye(h, 0.08, 0.21, 0.27, 0.045, 0x5a3412);
            for (const s of [-1, 1]) { const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.03), mud); brow.rotation.z = s * 0.45; this._lvAt(brow, s * 0.075, 0.27, 0.27, h); }
            const earUp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 4), fur); earUp.rotation.z = 0.25; this._lvAt(earUp, -0.1, 0.33, 0.1, h);
            const flop = new THREE.Group(); flop.position.set(0.11, 0.29, 0.1); flop.rotation.z = -2.5; h.add(flop);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.03), mud), 0, 0.08, 0, flop);
            this.mouth = new THREE.Group(); this.mouth.position.set(0, 0.05, 0.3); h.add(this.mouth);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.12), fur), 0, 0, 0.02, this.mouth);
            const tongue = this._lvBlob(0.035, pink, 0.8, 0.3, 1.4, 6, 4); tongue.rotation.x = 0.7; this._lvAt(tongue, 0, -0.04, 0.07, this.mouth);
            // Rope collar with a tin tag.
            const collar = new THREE.Group(); collar.position.set(0, 0.06, 0.04); collar.rotation.x = Math.PI / 2 - 0.65; h.add(collar);
            this._lvAt(new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 10), this._lvM(0x9a7a44, 0.95)), 0, 0, 0, collar);
            const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 6), this._lvM(0xb8bcc0, 0.3)); tag.rotation.x = Math.PI / 2; this._lvAt(tag, 0, -0.12, 0, collar);
            // Long thin legs on oversized paws.
            const paw = () => { const q = this._lvBlob(0.065, fur, 1.0, 0.55, 1.3, 6, 4); q.position.z = 0.03; q._lift = 0.035; return q; };
            this.frontLeft  = this._lvLimb(-0.11, 0.5, 0.26, 0.5, 0.04, 0.034, fur, paw());
            this.frontRight = this._lvLimb( 0.11, 0.5, 0.26, 0.5, 0.04, 0.034, fur, paw());
            this.rearLeft   = this._lvLimb(-0.12, 0.5, -0.28, 0.5, 0.045, 0.034, fur, paw());
            this.rearRight  = this._lvLimb( 0.12, 0.5, -0.28, 0.5, 0.045, 0.034, fur, paw());
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.66, -0.38); this.bodyGroup.add(this.tail);
            this._lvRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.15, -0.16), 0.03, 0.014, fur, this.tail);
            this._lvQuadParts();
            this._lvCfg = { kind: 'pup' };
        }

        // ── Snowdrift Hare: white hare sitting bolt upright on snowshoe hind
        //    feet, ice-blue eyes, rimed whiskers, one ear kinked at the middle ─
        // Archetype Beast: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/
        // REAR_RIGHT_LEG/TAIL/MOUTH.
        _buildSnowdriftHare() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), tip = this._lvM(0x101010), rime = this._lvM(0xcff0ff, 0.2, 0x5ab0d8), pink = this._lvM(0xd8a0a8, 0.6);
            this._lvTorso(0.3, fur, 0.9, 1.25, 0.95, 0.5, -0.05, 0.35);
            for (const s of [-1, 1]) this._lvAt(this._lvBlob(0.2, fur, 0.6, 1.0, 1.3), s * 0.2, 0.32, -0.12);
            const h = this._lvHeadAt(0, 0.82, 0.08);
            h.add(this._lvAt(this._lvBlob(0.17, fur, 0.9, 0.95, 1.1), 0, 0.1, 0.08, h));
            this._lvAt(this._lvBlob(0.08, fur, 1.1, 0.85, 1.0), 0, 0.05, 0.24, h);
            this._lvAt(this._lvBlob(0.022, pink, 1, 1, 1, 6, 4), 0, 0.075, 0.32, h);
            const eL = this._lvEye(h, -0.13, 0.14, 0.15, 0.036, 0x6fd0ff), eR = this._lvEye(h, 0.13, 0.14, 0.15, 0.036, 0x6fd0ff);
            eL.material.emissive = new THREE.Color(0x2a80b0); eL.material.emissiveIntensity = 0.6; eR.material = eL.material;
            // Frost-rimed whiskers.
            for (const s of [-1, 1]) for (let k = 0; k < 3; k++) this._lvRod(new THREE.Vector3(s * 0.05, 0.05, 0.28), new THREE.Vector3(s * 0.2, 0.08 - k * 0.04, 0.3), 0.006, 0.004, rime, h, 3);
            // Ears: the left one straight up, the right bent forward at the joint.
            this.ears = new THREE.Group(); this.ears.position.set(0, 0.25, 0.04); h.add(this.ears);
            const earL = new THREE.Group(); earL.position.set(-0.06, 0, 0); earL.rotation.z = 0.12; this.ears.add(earL);
            this._lvAt(this._lvBlob(0.06, fur, 0.75, 4.5, 0.35, 6, 5), 0, 0.26, 0, earL);
            const tL = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), tip); this._lvAt(tL, 0, 0.53, 0, earL);
            const earR = new THREE.Group(); earR.position.set(0.06, 0, 0); earR.rotation.z = -0.12; this.ears.add(earR);
            this._lvAt(this._lvBlob(0.06, fur, 0.75, 2.4, 0.35, 6, 5), 0, 0.13, 0, earR);
            this.earKink = new THREE.Group(); this.earKink.position.set(0, 0.25, 0); this.earKink.rotation.x = 1.0; earR.add(this.earKink);
            this._lvAt(this._lvBlob(0.055, fur, 0.75, 2.4, 0.35, 6, 5), 0, 0.12, 0, this.earKink);
            const tR = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.1, 4), tip); this._lvAt(tR, 0, 0.27, 0, this.earKink);
            this.mouth = new THREE.Group(); this.mouth.position.set(0, 0.0, 0.27); h.add(this.mouth);
            this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.01), tip), 0, 0.01, 0.02, this.mouth);
            for (const s of [-1, 1]) this._lvAt(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.045, 0.015), this._lvM(0xf8f6ee, 0.3)), s * 0.013, -0.03, 0.01, this.mouth);
            // Short forelegs from the chest; long snowshoe hind feet.
            const paw = () => { const q = this._lvBlob(0.05, fur, 1.0, 0.6, 1.3, 6, 4); q.position.z = 0.02; q._lift = 0.03; return q; };
            this.frontLeft  = this._lvLimb(-0.1, 0.38, 0.14, 0.38, 0.04, 0.035, fur, paw());
            this.frontRight = this._lvLimb( 0.1, 0.38, 0.14, 0.38, 0.04, 0.035, fur, paw());
            const hind = (s) => {
                const g = new THREE.Group(); g.position.set(s * 0.2, 0.3, -0.12);
                this._lvRod(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.26, -0.04), 0.06, 0.045, fur, g);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.46), fur); foot.position.set(0, -0.275, 0.1); g.add(foot);
                for (let k = 0; k < 4; k++) { const fr = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 3), fur); fr.rotation.x = Math.PI / 2; fr.position.set(-0.05 + k * 0.033, -0.28, 0.36); g.add(fr); }
                this.legs.push(g); this.bodyGroup.add(g); return g;
            };
            this.rearLeft = hind(-1); this.rearRight = hind(1);
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.3, -0.31); this.bodyGroup.add(this.tail);
            this._lvAt(this._lvBlob(0.08, fur, 1, 1, 1, 6, 5), 0, 0, -0.03, this.tail);
            this._lvQuadParts({ extra: [this.ears] });
            this._lvCfg = { kind: 'hare' };
        }

        // ── Sulky Skunklet: young spotted skunk, broken white dashes, bottle-
        //    brush tail fanned straight up, heavy-lidded eyes and a pout ─────
        // Archetype Beast: HEAD/BODY/LEFT_LEG/RIGHT_LEG/REAR_LEFT_LEG/
        // REAR_RIGHT_LEG/TAIL/MOUTH.
        _buildSulkySkunklet() {
            const p = this.profile;
            const fur = this._skinMat(p.bodyColor, 0.95), white = this._lvM(p.accent, 0.9), pink = this._lvM(0xd88a96, 0.5);
            this._lvTorso(0.28, fur, 0.95, 0.85, 1.35, 0.36, 0);
            // Broken stripes: three rows of dashes laid on the hide, offset.
            for (let row = 0; row < 3; row++) {
                const a = (row - 1) * 0.85;
                for (let k = 0; k < 3; k++) {
                    const z = -0.24 + k * 0.2 + (row === 1 ? 0.1 : 0);
                    if (z > 0.28) continue;
                    const kk = Math.sqrt(1 - (z / 0.378) * (z / 0.378));
                    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.11), white);
                    dash.rotation.z = -a; this._lvAt(dash, Math.sin(a) * 0.266 * kk, 0.36 + Math.cos(a) * 0.238 * kk, z);
                }
            }
            const h = this._lvHeadAt(0, 0.42, 0.32);
            h.add(this._lvAt(this._lvBlob(0.15, fur, 1.0, 0.9, 1.05), 0, 0.03, 0.1, h));
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 5), fur); snout.rotation.x = Math.PI / 2; this._lvAt(snout, 0, -0.01, 0.25, h);
            this._lvAt(this._lvBlob(0.024, this._lvM(0x0a0a0a, 0.3), 1, 1, 1, 6, 4), 0, 0, 0.31, h);
            this._lvAt(this._lvBlob(0.05, white, 0.6, 0.3, 1.4, 6, 4), 0, 0.15, 0.17, h);       // forehead blaze
            for (const s of [-1, 1]) {
                this._lvEye(h, s * 0.07, 0.06, 0.2, 0.03, 0x2a1a10, false);
                // Heavy drooping lid: the top half of a shell, tipped forward.
                const lid = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fur);
                lid.rotation.x = 0.55; this._lvAt(lid, s * 0.07, 0.065, 0.2, h);
                const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 7), fur); ear.rotation.x = Math.PI / 2; this._lvAt(ear, s * 0.1, 0.14, 0.05, h);
                this._lvAt(this._lvBlob(0.028, white, 1, 0.7, 0.6, 6, 4), s * 0.1, -0.02, 0.15, h);
            }
            this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.055, 0.22); h.add(this.mouth);
            this._lvAt(this._lvBlob(0.032, pink, 1.3, 0.55, 0.7, 6, 4), 0, 0, 0.02, this.mouth); // the pout
            const paw = () => { const q = this._lvBlob(0.045, white, 1.0, 0.5, 1.3, 6, 4); q.position.z = 0.02; q._lift = 0.022; return q; };
            this.frontLeft  = this._lvLimb(-0.14, 0.24, 0.22, 0.24, 0.045, 0.04, fur, paw());
            this.frontRight = this._lvLimb( 0.14, 0.24, 0.22, 0.24, 0.045, 0.04, fur, paw());
            this.rearLeft   = this._lvLimb(-0.15, 0.24, -0.22, 0.24, 0.05, 0.042, fur, paw());
            this.rearRight  = this._lvLimb( 0.15, 0.24, -0.22, 0.24, 0.05, 0.042, fur, paw());
            // Bottle-brush tail: a core with hairs bristling off it all the way up.
            this.tail = new THREE.Group(); this.tail.position.set(0, 0.42, -0.32); this.bodyGroup.add(this.tail);
            this._lvRod(new THREE.Vector3(0, -0.04, 0.02), new THREE.Vector3(0, 0.5, -0.08), 0.07, 0.03, fur, this.tail);
            for (let i = 0; i < 14; i++) {
                const u = 0.12 + (i / 13) * 0.8, a = i * 2.4;
                const dir = new THREE.Vector3(Math.cos(a), 0.55, Math.sin(a));
                const hair = this._lvAim(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 3), i % 3 ? fur : white), dir);
                hair.position.set(dir.x * 0.08, -0.04 + u * 0.54 + dir.y * 0.06, 0.02 - u * 0.1 + dir.z * 0.08);
                this.tail.add(hair);
            }
            this._lvAt(this._lvBlob(0.07, white, 1, 1.4, 1, 6, 5), 0, 0.5, -0.08, this.tail);
            this._lvQuadParts();
            this._lvCfg = { kind: 'skunklet' };
        }

        _lvPose(t, anim) {
            const fast = (anim === 'attack' || anim === 'specialattack');
            const c = this._lvCfg;
            this.model.position.y = this._baseY;
            this.model.rotation.x = 0; this.model.rotation.z = 0;
            const step = (lg, i, amp, rate) => { if (lg && lg.visible) lg.rotation.x = Math.sin(t * rate + i * Math.PI) * amp; };
            switch (c.kind) {
                case 'rabbit': {
                    step(this.frontLeft, 0, 0.12, 3); step(this.frontRight, 1, 0.12, 3);
                    // A warning thump with the right hind foot, both in a kick.
                    const thump = Math.pow(Math.max(0, Math.sin(t * 2.4)), 6);
                    if (fast) {
                        const k = Math.abs(Math.sin(t * 8)) * 0.8;
                        if (this.rearLeft) this.rearLeft.rotation.x = -k;
                        if (this.rearRight) this.rearRight.rotation.x = -k;
                        this.model.rotation.x = 0.15 * k;
                    } else {
                        if (this.rearLeft) this.rearLeft.rotation.x = 0;
                        if (this.rearRight) this.rearRight.rotation.x = -thump * 0.45;
                    }
                    if (this.ears) this.ears.rotation.x = Math.sin(t * 5) * 0.08 - thump * 0.15;
                    if (this.muzzle) { const w = 1 + Math.sin(t * 14) * 0.06; this.muzzle.scale.set(1.1 * w, 0.85, 1.0); }
                    break;
                }
                case 'opossum': {
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => step(lg, i, 0.1, 2.2));
                    // Every few seconds it starts to keel over in a fake faint.
                    const faint = Math.pow(Math.max(0, Math.sin(t * 0.7)), 10);
                    this.model.rotation.z = faint * 0.35 + Math.sin(t * 9) * 0.01;
                    if (this.head) this.head.rotation.z = Math.sin(t * 2.2) * 0.1;
                    if (this.mouth) this.mouth.rotation.x = 0.4 + (fast ? Math.abs(Math.sin(t * 12)) * 0.45 : faint * 0.2);
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.5) * 0.25;
                    break;
                }
                case 'pup': {
                    [this.frontLeft, this.frontRight, this.rearLeft, this.rearRight].forEach((lg, i) => step(lg, i, fast ? 0.35 : 0.12, fast ? 9 : 3));
                    if (this.tail) this.tail.rotation.y = Math.sin(t * (fast ? 8 : 14)) * 0.5;
                    if (this.head) { this.head.rotation.z = Math.sin(t * 0.9) * 0.18; this.head.rotation.x = fast ? Math.max(0, Math.sin(t * 10)) * 0.4 : 0; }
                    break;
                }
                case 'hare': {
                    step(this.frontLeft, 0, 0.08, 2); step(this.frontRight, 1, 0.08, 2);
                    const drum = Math.pow(Math.max(0, Math.sin(t * 3.2)), 4);
                    if (fast) {
                        const k = Math.abs(Math.sin(t * 9)) * 0.7;
                        if (this.rearLeft) this.rearLeft.rotation.x = -k;
                        if (this.rearRight) this.rearRight.rotation.x = -k;
                    } else {
                        if (this.rearLeft) this.rearLeft.rotation.x = 0;
                        if (this.rearRight) this.rearRight.rotation.x = -drum * 0.35;
                    }
                    if (this.ears) this.ears.rotation.z = Math.sin(t * 1.3) * 0.08;
                    if (this.earKink) this.earKink.rotation.x = 1.0 + Math.sin(t * 2.6) * 0.15;
                    if (this.head) this.head.rotation.y = Math.sin(t * 0.8) * 0.2;
                    break;
                }
                case 'skunklet': {
                    // Sulky stamping with the front feet, tail up and fanned.
                    const stamp = (ph) => -Math.pow(Math.max(0, Math.sin(t * (fast ? 9 : 4) + ph)), 3) * 0.5;
                    if (this.frontLeft) this.frontLeft.rotation.x = stamp(0);
                    if (this.frontRight) this.frontRight.rotation.x = stamp(Math.PI);
                    if (this.tail) { this.tail.rotation.x = fast ? 0.5 : Math.sin(t * 1.6) * 0.08; this.tail.rotation.z = Math.sin(t * 2.1) * 0.12; }
                    if (this.head) this.head.rotation.x = 0.12 + Math.sin(t * 1.2) * 0.05;
                    break;
                }
            }
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            if (this._lvCfg) { this._lvPose(t, anim); return; }
            this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.02 * this.scale;
            // Default gentle leg shuffle.
            if (this.variant !== 'taxidoggo') this.legs.forEach((lg, i) => { if (lg.visible) lg.rotation.x = Math.sin(t * (fast ? 7 : 3) + i * 1.4) * 0.16; });

            switch (this.variant) {
                case 'babybunny': {
                    // Frantic little hops.
                    const hop = Math.abs(Math.sin(t * (fast ? 9 : 5)));
                    this.model.position.y = this._baseY + hop * (fast ? 0.22 : 0.1) * this.scale;
                    if (this.ears) this.ears.rotation.x = Math.sin(t * 6) * 0.12;
                    if (this.head) this.head.rotation.x = -hop * 0.2;
                    break;
                }
                case 'opossum': {
                    if (this.tail) this.tail.rotation.y = Math.sin(t * 1.5) * 0.2;
                    if (this.head) this.head.rotation.z = Math.sin(t * 2.2) * 0.1; // nervous sniff
                    break;
                }
                case 'skunk': {
                    const raise = fast ? -1.4 : -0.5 + Math.sin(t * 2) * 0.1;
                    if (this.tail) this.tail.rotation.x = raise; // tail up = warning
                    break;
                }
                case 'taxidoggo': {
                    // Barely moves: a stiff, unnatural wobble.
                    this.model.rotation.z = Math.sin(t * 3) * 0.02;
                    this.model.position.y = this._baseY + Math.abs(Math.sin(t * 1.2)) * 0.01 * this.scale;
                    break;
                }
                case 'curiousrabbit':
                case 'direrabbit': {
                    const heavy = this.variant === 'direrabbit';
                    const hop = Math.abs(Math.sin(t * (fast ? 9 : (heavy ? 4 : 6))));
                    this.model.position.y = this._baseY + hop * (fast ? 0.22 : (heavy ? 0.16 : 0.12)) * this.scale;
                    if (this.ears) this.ears.rotation.x = Math.sin(t * (heavy ? 3 : 6)) * 0.12;
                    if (this.head) this.head.rotation.x = -hop * 0.15;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            this.model.position.y = this._baseY - prog * 0.1 * this.scale;
            this.model.rotation.z = prog * 1.3; // keel over
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new CritterBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = C_PROFILES;
    reg('babybunny', { aliases: ['babybunny'], scale: S.babybunny.scale, weapon: 0, create: make });
    reg('opossum',   { aliases: ['opossum'],   scale: S.opossum.scale,   weapon: 0, create: make });
    reg('skunk',     { aliases: ['skunk'],     scale: S.skunk.scale,     weapon: 0, create: make });
    reg('taxidoggo', { aliases: ['taxidoggo'], scale: S.taxidoggo.scale, weapon: 0, create: make });
    reg('curiousrabbit', { aliases: ['curiousrabbit'], scale: S.curiousrabbit.scale, weapon: 0, create: make });
    reg('direrabbit',    { aliases: ['direrabbit'],    scale: S.direrabbit.scale,    weapon: 0, create: make });
    reg('lv_hedgerabbit',   { aliases: ['lv_hedgerabbit'],   scale: S.lv_hedgerabbit.scale,   weapon: 0, create: make });
    reg('lv_opossumkit',    { aliases: ['lv_opossumkit'],    scale: S.lv_opossumkit.scale,    weapon: 0, create: make });
    reg('lv_straypup',      { aliases: ['lv_straypup'],      scale: S.lv_straypup.scale,      weapon: 0, create: make });
    reg('lv_snowdrifthare', { aliases: ['lv_snowdrifthare'], scale: S.lv_snowdrifthare.scale, weapon: 0, create: make });
    reg('lv_sulkyskunklet', { aliases: ['lv_sulkyskunklet'], scale: S.lv_sulkyskunklet.scale, weapon: 0, create: make });

    const NAMED = {
        babybunny: ["Baby Bunny"],
        opossum:   ["Cautious Opossum"],
        skunk:     ["Skunk"],
        taxidoggo: ["Taxidoggo"],
        curiousrabbit: ["Curious Rabbit"],
        direrabbit:    ["Dire Rabbit"],
        lv_hedgerabbit:   ["Hedge Rabbit"],
        lv_opossumkit:    ["Opossum Kit"],
        lv_straypup:      ["Stray Pup"],
        lv_snowdrifthare: ["Snowdrift Hare"],
        lv_sulkyskunklet: ["Sulky Skunklet"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Critter uniques registered');
})();
