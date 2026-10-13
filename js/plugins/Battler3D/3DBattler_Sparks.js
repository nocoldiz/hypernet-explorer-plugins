//=============================================================================
// 3D Battler System - Spark Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke oddball "elemental"-archetype one-off models
 * (electromagnetic ghoul, fidget sprite, lizard sniper) + name-based assignment.
 * Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Spark Uniques
 * ============================================================================
 *
 * Three enemies tagged <Archetype: Elemental> whose flavour text is anything
 * but a generic elemental. Pinned by exact name, they map the generic Elemental
 * keys (CORE/UPPER_FORM/LOWER_FORM/LEFT_APPENDAGE/RIGHT_APPENDAGE) so
 * dismemberment + hit-flash work.
 *
 * Registered: electromagneticghoul, fidgetsprite, lizardsniper
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Sparks] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const E_PROFILES = {
        electromagneticghoul: { variant: 'electromagneticghoul', scale: 2.2, texturePool: 'void',    bodyColor: 0x4a5a6a, accent: 0x66ddff, hue: [0.55, 0.08], sat: [0.40, 0.12], lit: [0.40, 0.10] },
        fidgetsprite:         { variant: 'fidgetsprite',         scale: 1.8, texturePool: 'crystal', bodyColor: 0xaaccdd, accent: 0xffaa44, hue: [0.55, 0.10], sat: [0.35, 0.12], lit: [0.62, 0.10] },
        lizardsniper:         { variant: 'lizardsniper',         scale: 2.0, texturePool: 'foliage', bodyColor: 0x5a7a3a, accent: 0xcc4422, hue: [0.28, 0.06], sat: [0.45, 0.12], lit: [0.42, 0.10] },
        // ── Level 1-5 sprites and motes, each on its own bespoke build ──
        lv_puddlesprite: { variant: 'lv_puddlesprite', scale: 1.5, texturePool: 'water',   bodyColor: 0x5aa8d8, accent: 0xe8f8ff, hue: [0.56, 0.05], sat: [0.50, 0.12], lit: [0.58, 0.08] },
        lv_embermote:    { variant: 'lv_embermote',    scale: 1.3, texturePool: 'fire',    bodyColor: 0x3a2018, accent: 0xff8a22, hue: [0.04, 0.03], sat: [0.45, 0.10], lit: [0.22, 0.06] },
        lv_staticsprite: { variant: 'lv_staticsprite', scale: 1.5, texturePool: 'fur',     bodyColor: 0xb85a48, accent: 0xbfe8ff, hue: [0.03, 0.04], sat: [0.40, 0.10], lit: [0.48, 0.08] },
        lv_stellarmote:  { variant: 'lv_stellarmote',  scale: 1.3, texturePool: 'crystal', bodyColor: 0xfff0c0, accent: 0xaad0ff, hue: [0.13, 0.04], sat: [0.40, 0.10], lit: [0.82, 0.06] }
    };

    class SparkBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = E_PROFILES[creatureType] || E_PROFILES.fidgetsprite;
            super(scale, offsetY, battler, profile, 0, creatureType || 'fidgetsprite');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this.facingYaw = 0;
        }

        _mat(color, opacity, rough, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: (rough === undefined ? 0.5 : rough),
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                transparent: true, opacity: (opacity === undefined ? 1.0 : opacity)
            });
            this._materials.push(m);
            return m;
        }
        _skinMat(color, rough) { return this.applySkin(this._mat(color, 1.0, rough === undefined ? 0.5 : rough)); }
        _eye(parent, x, y, z, r, accent) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), this._mat(accent || 0xffcc33, 1.0, 0.2, accent));
            eye.position.set(x, y, z);
            const pup = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 1.2, r * 0.3), this._mat(0x000000, 1.0, 0.1)); pup.position.set(0, 0, r * 0.7); eye.add(pup);
            parent.add(eye); return eye;
        }
        _wireElemental(o) {
            this._partMeshMap = {};
            this._partMeshMap.CORE = o.core;
            ['UPPER_FORM', 'BODY', 'TORSO', 'CHASSIS'].forEach(k => this._partMeshMap[k] = o.body);
            ['LOWER_FORM', 'LEGS', 'PELVIS'].forEach(k => this._partMeshMap[k] = o.legs);
            ['LEFT_APPENDAGE', 'LEFT_ARM', 'LEFT_UPPER_ARM'].forEach(k => this._partMeshMap[k] = o.larm);
            ['RIGHT_APPENDAGE', 'RIGHT_ARM', 'RIGHT_UPPER_ARM', 'ARM_CANNON'].forEach(k => this._partMeshMap[k] = o.rarm);
            const extra = (o.extra || []).filter(Boolean);
            const all = [o.core, o.body, o.legs, o.larm, o.rarm, ...extra].filter(Boolean);
            this._cascadeRules = [
                { gone: ['CORE'], hide: all },
                { gone: ['UPPER_FORM', 'BODY'], hide: [o.body, o.larm, o.rarm, ...extra].filter(Boolean) },
                { gone: ['LOWER_FORM', 'LEGS'], hide: [o.legs].filter(Boolean) },
                { gone: ['LEFT_APPENDAGE', 'LEFT_ARM'], hide: [o.larm].filter(Boolean) },
                { gone: ['RIGHT_APPENDAGE', 'RIGHT_ARM'], hide: [o.rarm].filter(Boolean) },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'electromagneticghoul': this._buildEMGhoul(); break;
                case 'lizardsniper':         this._buildLizardSniper(); break;
                case 'lv_puddlesprite':      this._buildLvPuddleSprite(); break;
                case 'lv_embermote':         this._buildLvEmberMote(); break;
                case 'lv_staticsprite':      this._buildLvStaticSprite(); break;
                case 'lv_stellarmote':       this._buildLvStellarMote(); break;
                default:                     this._buildFidget(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Electromagnetic Ghoul: a glitchy EM wraith with signal bars ────
        _buildEMGhoul() {
            const p = this.profile;
            const staticMat = this._skinMat(p.bodyColor, 0.4); staticMat.opacity = 0.7;
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this._mat(p.accent, 1, 0.2, p.accent)); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            this.body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 14), staticMat); this.body.position.y = 1.0; this.body.scale.set(1, 1.3, 1); this.bodyGroup.add(this.body);
            // Distorted ghoul face.
            this._eye(this.bodyGroup, -0.13, 1.08, 0.34, 0.06, p.accent); this._eye(this.bodyGroup, 0.13, 1.08, 0.34, 0.06, p.accent);
            // Lightning-arc arms.
            this.larm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), this._mat(p.accent, 0.85, 0.2, p.accent)); this.larm.position.set(-0.4, 1.05, 0); this.larm.rotation.z = 0.8; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 5), this._mat(p.accent, 0.85, 0.2, p.accent)); this.rarm.position.set(0.4, 1.05, 0); this.rarm.rotation.z = -0.8; this.bodyGroup.add(this.rarm);
            // Static tail (lower form).
            this.legs = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10), staticMat); this.legs.position.y = 0.45; this.legs.rotation.x = Math.PI; this.bodyGroup.add(this.legs);
            // Floating signal bars.
            this.bars = new THREE.Group();
            for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08 + i * 0.06, 0.05), this._mat(p.accent, 0.9, 0.2, p.accent)); bar.position.set(0.5 + i * 0.08, 1.3 + i * 0.03, 0); bar._i = i; this.bars.add(bar); }
            this.bodyGroup.add(this.bars);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm, extra: [this.bars] });
        }

        // ── Fidget Sprite: a hyperactive spinning whirlwind ───────────────
        _buildFidget() {
            const p = this.profile;
            const wind = this._skinMat(p.bodyColor, 0.3); wind.opacity = 0.6;
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), this._mat(p.accent, 1, 0.2, p.accent)); this.core.position.y = 1.0; this.bodyGroup.add(this.core);
            // Swirling vortex body.
            this.body = new THREE.Group();
            for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18 + i * 0.12, 0.05, 8, 18), wind); ring.position.y = 0.7 + i * 0.25; ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1, 0.6 + i * 0.2); this.body.add(ring); }
            this.bodyGroup.add(this.body);
            // Three spinning arm-blades.
            this.spin = new THREE.Group();
            for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), this._mat(p.accent, 0.8, 0.2, p.accent)); blade.position.set(Math.cos(a) * 0.4, 1.0, Math.sin(a) * 0.4); blade.rotation.z = Math.PI / 2; blade.rotation.y = a; this.spin.add(blade); }
            this.bodyGroup.add(this.spin);
            this.larm = this.spin; this.rarm = this.spin;
            // The funnel tail reaches up into the core: a shorter one left the
            // lowest ring and the tail hanging under the sprite on their own.
            this.legs = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), wind); this.legs.position.y = 0.52; this.legs.rotation.x = Math.PI; this.bodyGroup.add(this.legs);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.spin, rarm: this.spin });
        }

        // ── Lizard Sniper: a small reptile biped shouldering a long rifle ─
        _buildLizardSniper() {
            const p = this.profile;
            const scale = this._skinMat(p.bodyColor, 0.5);
            this.body = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 8), scale); this.body.add(torso);
            // Reptile head with snout.
            const head = new THREE.Group();
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), scale); skull.scale.set(1, 0.9, 1.3); head.add(skull);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 6), scale); snout.position.set(0, -0.02, 0.24); snout.rotation.x = Math.PI / 2; head.add(snout);
            this._eye(head, -0.1, 0.06, 0.16, 0.05, 0xffcc33); this._eye(head, 0.1, 0.06, 0.16, 0.05, 0xffcc33);
            head.position.set(0, 0.45, 0); this.body.add(head);
            this.body.position.set(0, 1.0, 0); this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), this._mat(p.accent, 1, 0.3, p.accent)); this.core.position.set(0, 1.0, 0.05); this.bodyGroup.add(this.core);
            // Arms; right shoulders the rifle.
            this.larm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 6), scale); this.larm.position.set(-0.26, 1.05, 0.12); this.larm.rotation.set(-0.6, 0, 0.4); this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.45, 6), scale); this.rarm.position.set(0.26, 1.05, 0.12); this.rarm.rotation.set(-0.8, 0, -0.3); this.bodyGroup.add(this.rarm);
            // Sniper rifle.
            this.rifle = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), this._mat(0x2a2a2a, 1, 0.4)); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.3; this.rifle.add(barrel);
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3), this._mat(0x4a3320, 1, 0.6)); stock.position.z = -0.3; this.rifle.add(stock);
            const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), this._mat(p.accent, 1, 0.3, p.accent)); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.08, 0.1); this.rifle.add(scope);
            this.rifle.position.set(0.1, 1.05, 0.2); this.rifle.rotation.y = 0.1; this.bodyGroup.add(this.rifle);
            // Legs + tail (lower form).
            this.legs = new THREE.Group();
            for (const lx of [-0.12, 0.12]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 6), scale); leg.position.set(lx, 0.45, 0); this.legs.add(leg); }
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 6), scale); tail.position.set(0, 0.7, -0.4); tail.rotation.x = -1.0; this.legs.add(tail);
            this.bodyGroup.add(this.legs);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm, extra: [this.rifle] });
        }

        // A rod from point a to point b (a strand, a bolt segment, a spike).
        _lvBone(parent, a, b, r0, r1, mat, seg) {
            const A = new THREE.Vector3(a[0], a[1], a[2]), d = new THREE.Vector3(b[0], b[1], b[2]).sub(A), len = d.length();
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg || 5), mat);
            m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
            parent.add(m); return m;
        }

        // ── Puddle Sprite: a giggling raindrop standing up out of its puddle ─
        // A teardrop of rainwater rising from a flat puddle ringed with a
        // milk-crown splash, two arms of beaded droplets flung up in glee, a
        // wide giggling mouth and a bright bubble for a heart.
        _buildLvPuddleSprite() {
            const p = this.profile;
            const water = this._skinMat(p.bodyColor, 0.15); water.opacity = 0.78;
            const foam = this._mat(p.accent, 0.9, 0.2);
            this.legs = new THREE.Group();
            const puddle = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.04, 10), water); puddle.position.y = 0.02; this.legs.add(puddle);
            this.crown = [];
            for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 4), foam); sp.position.set(Math.cos(a) * 0.32, 0.1, Math.sin(a) * 0.32); sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); this.crown.push(sp); this.legs.add(sp); }
            this.bodyGroup.add(this.legs);
            this.body = new THREE.Group();
            const drop = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), water); drop.position.y = 0.32; this.body.add(drop);
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.35, 8), water); tip.position.y = 0.7; this.body.add(tip);
            this._eye(this.body, -0.1, 0.44, 0.25, 0.05, 0x224466); this._eye(this.body, 0.1, 0.44, 0.25, 0.05, 0x224466);
            this.maw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this._mat(0x0a2a4a, 1, 0.4)); this.maw.scale.set(1.5, 1, 0.6); this.maw.position.set(0, 0.32, 0.27); this.body.add(this.maw);
            this.bodyGroup.add(this.body);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), this._mat(0xffffff, 0.95, 0.1, p.accent)); this.core.position.set(0, 0.3, 0.05); this.bodyGroup.add(this.core);
            // Arms: beaded droplets, pivoting at the shoulder.
            const mkArm = (sx) => {
                const g = new THREE.Group(); g.position.set(sx * 0.27, 0.42, 0);
                [[0, 0, 0.07], [0.08, 0.06, 0.06], [0.15, 0.13, 0.05], [0.2, 0.21, 0.045]].forEach(([x, y, r]) => { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), water); b.position.set(sx * x, y, 0); g.add(b); });
                this.bodyGroup.add(g); return g;
            };
            this.larm = mkArm(-1); this.rarm = mkArm(1);
            // Raindrops falling round it: free in the air by design.
            this.rain = new THREE.Group(); this.rain.userData.float = true;
            for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 4, 3), foam); d.scale.y = 2; d.position.set((this.idRand() - 0.5) * 1.1, 0.4 + this.idRand() * 0.9, (this.idRand() - 0.5) * 0.6); this.rain.add(d); }
            this.bodyGroup.add(this.rain);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm, extra: [this.rain] });
            this._partMeshMap.MAW = this.maw;
        }

        // ── Ember Mote: a runaway coal with a flame for hair ────────────────
        // A cracked black crust with glowing seams and the live coal bulging
        // through the front, a tuft of flame on top, two little spark jets for
        // arms and a comet trail of cooling sparks hanging under it.
        _buildLvEmberMote() {
            const p = this.profile;
            const crust = this._skinMat(p.bodyColor, 0.9);
            const glow = this._mat(p.accent, 1, 0.2, p.accent), hot = this._mat(0xffe08a, 0.95, 0.1, 0xffaa33);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), hot); this.core.position.set(0, 0.86, 0.15); this.bodyGroup.add(this.core);
            this.body = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 0), crust); shell.position.y = 1.0; this.body.add(shell);
            for (let i = 0; i < 5; i++) { const a = i * 1.26; const seam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.025), glow); seam.position.set(Math.cos(a) * 0.2, 1.0 + Math.sin(a * 1.7) * 0.12, Math.sin(a) * 0.2); seam.rotation.set(0, -a, Math.sin(a) * 0.6); this.body.add(seam); }
            this.flames = [];
            for (const [x, h, r, rz] of [[0, 0.38, 0.1, 0], [-0.09, 0.26, 0.07, 0.4], [0.09, 0.28, 0.07, -0.4]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), glow); f.position.set(x, 1.22 + h * 0.3, 0); f.rotation.z = rz; this.flames.push(f); this.body.add(f); }
            for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.02), hot); eye.position.set(sx * 0.08, 1.07, 0.23); eye.rotation.z = sx * 0.3; this.body.add(eye); }
            this.maw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.02), hot); this.maw.position.set(0, 0.98, 0.26); this.maw.rotation.z = 0.15; this.body.add(this.maw);
            this.bodyGroup.add(this.body);
            this.larm = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), glow); this.larm.position.set(-0.3, 1.02, 0); this.larm.rotation.z = Math.PI / 2 - 0.3; this.bodyGroup.add(this.larm);
            this.rarm = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), glow); this.rarm.position.set(0.3, 1.02, 0); this.rarm.rotation.z = -Math.PI / 2 + 0.3; this.bodyGroup.add(this.rarm);
            this.legs = new THREE.Group();
            [[0, 0.8, -0.04, 0.09], [0, 0.68, -0.1, 0.07], [0, 0.58, -0.16, 0.055], [0, 0.51, -0.21, 0.04]].forEach(([x, y, z, r], i) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), i ? glow : crust); s.position.set(x, y, z); this.legs.add(s); });
            this.bodyGroup.add(this.legs);
            this.strays = new THREE.Group(); this.strays.userData.float = true;
            for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.03, 0), hot); s.position.set((this.idRand() - 0.5) * 0.9, 0.7 + this.idRand() * 0.8, (this.idRand() - 0.5) * 0.5); this.strays.add(s); }
            this.bodyGroup.add(this.strays);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm, extra: [this.strays] });
            this._partMeshMap.MAW = this.maw;
        }

        // ── Static Sprite: a ball of jumper wool with its hair on end ───────
        // A wound ball of red wool bristling with static-raised fibres, one big
        // and one small eye, two crackling zigzag arms, and a loose strand of
        // yarn trailing to the ground with a spark at its frayed end.
        _buildLvStaticSprite() {
            const p = this.profile;
            const wool = this._skinMat(p.bodyColor, 0.95);
            const spark = this._mat(p.accent, 1, 0.2, p.accent), yarn = this._mat(p.bodyColor, 1, 0.95);
            this.body = new THREE.Group();
            const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), wool); ball.position.y = 0.95; this.body.add(ball);
            for (const [rx, ry] of [[1.57, 0], [0.6, 0.8], [2.2, 1.9], [1.2, 2.7]]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 14), yarn); w.position.y = 0.95; w.rotation.set(rx, ry, 0); this.body.add(w); }
            this.frizz = [];
            for (let i = 0; i < 12; i++) {
                const th = (i / 12) * Math.PI * 2, ph = 0.35 + (i % 3) * 0.3;
                const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
                const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.24, 3), yarn);
                f.position.set(0, 0.95, 0).addScaledVector(dir, 0.38); f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                this.frizz.push(f); this.body.add(f);
            }
            this._eye(this.body, -0.1, 0.99, 0.25, 0.075, 0xffffee); this._eye(this.body, 0.12, 1.02, 0.26, 0.04, 0xffffee);
            this.maw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), this._mat(0x1a0808, 1, 0.5)); this.maw.position.set(0, 0.85, 0.28); this.maw.rotation.z = -0.2; this.body.add(this.maw);
            this.bodyGroup.add(this.body);
            // Zigzag bolt arms, joined end to end out of the ball's sides.
            const mkBolt = (sx) => {
                const g = new THREE.Group(); g.position.set(sx * 0.26, 0.95, 0);
                const pts = [[0, 0, 0], [sx * 0.16, 0.08, 0], [sx * 0.22, -0.04, 0], [sx * 0.38, 0.06, 0]];
                for (let i = 0; i < 3; i++) this._lvBone(g, pts[i], pts[i + 1], 0.025, 0.025, spark, 4);
                this.bodyGroup.add(g); return g;
            };
            this.larm = mkBolt(-1); this.rarm = mkBolt(1);
            this.legs = new THREE.Group();
            const sp = [[0, 0.68, 0], [0.06, 0.5, 0.05], [0.02, 0.32, 0.12], [0.1, 0.16, 0.14]];
            for (let i = 0; i < 3; i++) this._lvBone(this.legs, sp[i], sp[i + 1], 0.022, 0.02, yarn);
            this.zap = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), spark); this.zap.position.set(0.1, 0.14, 0.14); this.legs.add(this.zap);
            this.bodyGroup.add(this.legs);
            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), spark); this.core.position.set(0, 0.67, 0); this.bodyGroup.add(this.core);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm });
            this._partMeshMap.MAW = this.maw;
        }

        // ── Stellar Mote: a speck of starlight with a ring and a pet moon ───
        // A small bright nucleus with a sleepy face, sharp star points shooting
        // out of it on every axis, a thin tilted ring threaded through its two
        // side points and a pebble of a moon riding that ring.
        _buildLvStellarMote() {
            const p = this.profile;
            const light = this._skinMat(p.bodyColor, 0.2); light.emissive = new THREE.Color(p.bodyColor); light.emissiveIntensity = 0.5;
            const blue = this._mat(p.accent, 0.9, 0.2, p.accent);
            this.star = new THREE.Group(); this.star.position.y = 1.0; this.bodyGroup.add(this.star);
            this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), light); this.star.add(this.core);
            for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.01), this._mat(0x2a2a4a, 1, 0.5)); e.position.set(sx * 0.045, 0.02, 0.126); this.core.add(e); }
            this.maw = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 3, 6, Math.PI), this._mat(0x2a2a4a, 1, 0.5)); this.maw.position.set(0, -0.035, 0.122); this.maw.rotation.z = Math.PI; this.core.add(this.maw);
            const point = (parent, dir, len, r, mat) => { const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(); const c = new THREE.Mesh(new THREE.ConeGeometry(r, len, 4), mat); c.position.copy(d).multiplyScalar(0.06 + len / 2); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); parent.add(c); return c; };
            this.body = new THREE.Group(); this.star.add(this.body);
            point(this.body, [0, 1, 0], 0.4, 0.06, light); point(this.body, [0, 0, 1], 0.3, 0.05, light); point(this.body, [0, 0, -1], 0.3, 0.05, light);
            for (const [x, y] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) point(this.body, [x, y, 0], 0.2, 0.035, blue);
            // The ring passes through the two side points.
            this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 3, 18), blue); this.ring.rotation.x = Math.PI / 2 + 0.45; this.body.add(this.ring);
            this.larm = new THREE.Group(); point(this.larm, [-1, 0, 0], 0.45, 0.05, light); this.star.add(this.larm);
            this.rarm = new THREE.Group(); point(this.rarm, [1, 0, 0], 0.45, 0.05, light); this.star.add(this.rarm);
            this.legs = new THREE.Group(); point(this.legs, [0, -1, 0], 0.55, 0.06, light); this.star.add(this.legs);
            // The pet moon rides the ring: it is meant to hang off it.
            this.moon = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), this._mat(0xa8a090, 1, 0.8)); this.moon.userData.orbit = true; this.body.add(this.moon);
            this._wireElemental({ core: this.core, body: this.body, legs: this.legs, larm: this.larm, rarm: this.rarm });
            this._partMeshMap.MAW = this.maw;
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this._baseX === null) this._baseX = this.model.position.x;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            if (this.core && this.core.material) this.core.material.emissiveIntensity = 1.0 + Math.sin(t * 5) * 0.5;

            const baseX = this._baseX !== null ? this._baseX : this.model.position.x;
            switch (this.variant) {
                case 'electromagneticghoul': {
                    this.model.position.y = this._baseY + Math.sin(t * 2) * 0.06 * this.scale;
                    // Glitchy jitter.
                    this.model.position.x = baseX + (Math.sin(t * 37) > 0.7 ? 1 : 0) * 0.04 * this.scale;
                    if (this.larm) this.larm.material.emissiveIntensity = (fast ? 1.5 : 0.8) + Math.sin(t * 20) * 0.6;
                    if (this.rarm) this.rarm.material.emissiveIntensity = (fast ? 1.5 : 0.8) + Math.cos(t * 23) * 0.6;
                    if (this.bars) this.bars.children.forEach(b => { b.material.emissiveIntensity = Math.abs(Math.sin(t * 4 + b._i)) * 1.2; });
                    break;
                }
                case 'fidgetsprite': {
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.05 * this.scale;
                    if (this.spin) this.spin.rotation.y += (fast ? 30 : 18) * deltaTime; // constant spin
                    if (this.body) this.body.rotation.y -= (fast ? 12 : 7) * deltaTime;
                    this.model.rotation.z = Math.sin(t * 6) * 0.04;
                    break;
                }
                case 'lv_puddlesprite': {
                    this.model.position.y = this._baseY;
                    const sq = Math.sin(t * (fast ? 9 : 3));
                    if (this.body) this.body.scale.set(1 - sq * 0.05, 1 + sq * 0.08, 1 - sq * 0.05);
                    if (this.larm) this.larm.rotation.z = -0.2 - Math.abs(sq) * 0.3;
                    if (this.rarm) this.rarm.rotation.z = 0.2 + Math.abs(sq) * 0.3;
                    if (this.crown) this.crown.forEach((c, i) => c.scale.setScalar(0.8 + Math.abs(Math.sin(t * 4 + i)) * 0.3));
                    if (this.rain) this.rain.children.forEach(d => { d.position.y -= 0.02; if (d.position.y < 0.1) d.position.y = 1.3; });
                    break;
                }
                case 'lv_embermote': {
                    this.model.position.y = this._baseY + Math.sin(t * 2.4) * 0.06 * this.scale;
                    if (this.flames) this.flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 11 + i) * 0.15, 1 + Math.sin(t * 9 + i * 2) * 0.25, 1); });
                    if (this.legs) this.legs.rotation.z = Math.sin(t * 2) * 0.12;
                    if (this.larm) this.larm.material.emissiveIntensity = (fast ? 1.6 : 0.8) + Math.sin(t * 15) * 0.4;
                    break;
                }
                case 'lv_staticsprite': {
                    this.model.position.y = this._baseY + Math.sin(t * 3) * 0.04 * this.scale;
                    if (this.frizz) this.frizz.forEach((f, i) => f.scale.set(1, 0.85 + Math.abs(Math.sin(t * 13 + i * 1.7)) * 0.3, 1));
                    if (this.larm) this.larm.rotation.z = Math.sin(t * (fast ? 24 : 9)) * 0.15;
                    if (this.rarm) this.rarm.rotation.z = -Math.sin(t * (fast ? 24 : 9) + 1) * 0.15;
                    if (this.zap) this.zap.material.emissiveIntensity = Math.sin(t * 19) > 0.5 ? 2.0 : 0.6;
                    break;
                }
                case 'lv_stellarmote': {
                    this.model.position.y = this._baseY + Math.sin(t * 2) * 0.07 * this.scale;
                    if (this.star) { this.star.rotation.y = Math.sin(t * 0.8) * 0.4; this.star.rotation.z = Math.sin(t * 1.3) * 0.1; }
                    if (this.body) this.body.scale.setScalar(1 + Math.sin(t * (fast ? 14 : 5)) * 0.06);
                    if (this.moon) { const a = t * (fast ? 4 : 1.6), c = Math.cos(0.45); this.moon.position.set(Math.cos(a) * 0.3, -Math.sin(a) * 0.3 * Math.sin(0.45), Math.sin(a) * 0.3 * c); }
                    break;
                }
                case 'lizardsniper': {
                    this.model.position.y = this._baseY + Math.sin(t * 1.4) * 0.02 * this.scale;
                    if (this.legs) this.legs.children.forEach((c, i) => { if (i === 2) c.rotation.z = Math.sin(t * 2) * 0.15; }); // tail sway
                    if (this.rifle && fast) this.rifle.position.z = 0.2 - Math.abs(Math.sin(t * 10)) * 0.12; // recoil
                    if (this.body) this.body.rotation.y = Math.sin(t * 1.0) * 0.06;
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.1);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            if (this.variant === 'lizardsniper') { this.model.position.y = this._baseY - prog * 0.3 * this.scale; this.model.rotation.z = prog * 1.0; }
            else { const sc = (1.0 - prog * 0.6); this.model.scale.multiplyScalar(1); this.bodyGroup.scale.setScalar(this.scale * sc); }
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new SparkBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = E_PROFILES;
    reg('electromagneticghoul', { aliases: ['electromagneticghoul'], scale: S.electromagneticghoul.scale, weapon: 0, create: make });
    reg('fidgetsprite',         { aliases: ['fidgetsprite'],         scale: S.fidgetsprite.scale,         weapon: 0, create: make });
    reg('lizardsniper',         { aliases: ['lizardsniper'],         scale: S.lizardsniper.scale,         weapon: 0, create: make });
    ['lv_puddlesprite', 'lv_embermote', 'lv_staticsprite', 'lv_stellarmote'].forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        electromagneticghoul: ["Electromagnetic Ghoul"],
        fidgetsprite:         ["Fidget Sprite"],
        lizardsniper:         ["Lizard Sniper"],
        lv_puddlesprite:      ["Puddle Sprite"],
        lv_embermote:         ["Ember Mote"],
        lv_staticsprite:      ["Static Sprite"],
        lv_stellarmote:       ["Stellar Mote"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Spark uniques registered');
})();
