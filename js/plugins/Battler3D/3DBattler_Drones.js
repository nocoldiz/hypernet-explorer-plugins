//=============================================================================
// 3D Battler System - Drone Uniques
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke drone one-off models (surveillance drone, cryo drone, data
 * drone) + name-based assignment. Requires 3DBattlerSystem + families first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Drone Uniques
 * ============================================================================
 *
 * Distinct procedural quadcopters shaped from each enemy's flavour text, pinned
 * by exact name. They map the Drone archetype keys (CHASSIS/SENSOR_ARRAY/
 * LEFT_PROP/RIGHT_PROP) so dismemberment + hit-flash work.
 *
 * Registered: surveillancedrone, cryodrone, datadrone, and the level 1-5
 * roster: lv_toydrone, lv_roguevacuumbot, lv_satellitegnat,
 * lv_lobbysecuritydrone (these also map JAWS)
 *
 * MUST load AFTER the other Battler3D family plugins.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Drones] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const D_PROFILES = {
        surveillancedrone: { variant: 'surveillancedrone', scale: 1.9, texturePool: 'metal', bodyColor: 0x6a7079, accent: 0xff2222, hue: [0.58, 0.05], sat: [0.10, 0.06], lit: [0.5, 0.1] },
        cryodrone:         { variant: 'cryodrone',         scale: 2.0, texturePool: 'water', bodyColor: 0x9ac0d8, accent: 0x66ddff, hue: [0.55, 0.06], sat: [0.30, 0.10], lit: [0.6, 0.08] },
        datadrone:         { variant: 'datadrone',         scale: 1.9, texturePool: 'metal', bodyColor: 0x3a4a5a, accent: 0x33ff88, hue: [0.45, 0.08], sat: [0.30, 0.10], lit: [0.4, 0.08] },
        aethersplicer:     { variant: 'aethersplicer',     scale: 2.0, texturePool: 'metal', bodyColor: 0x4a4254, accent: 0xbb66ff, hue: [0.74, 0.07], sat: [0.28, 0.10], lit: [0.45, 0.10], front: true },
        // ── Level 1-5 roster (bespoke, were surveillance / data drone reskins) ──
        // Toy Drone: a cheap plastic quad with ring guards and googly eyes.
        lv_toydrone:          { variant: 'lv_toydrone',          scale: 1.6, texturePool: 'pale',  bodyColor: 0xd8342a, accent: 0xffd23a, hue: [0.00, 0.04], sat: [0.60, 0.10], lit: [0.48, 0.08] },
        // Rogue Vacuum Bot: a floor puck with spinning side brushes and a shoelace.
        lv_roguevacuumbot:    { variant: 'lv_roguevacuumbot',    scale: 2.2, texturePool: 'metal', bodyColor: 0x3a3e46, accent: 0x33e0ff, hue: [0.60, 0.04], sat: [0.10, 0.05], lit: [0.30, 0.06] },
        // Satellite Gnat: a gold-foil satellite on gnat legs, solar-panel wings.
        lv_satellitegnat:     { variant: 'lv_satellitegnat',     scale: 1.7, texturePool: 'metal', bodyColor: 0xc89a3a, accent: 0xff3322, hue: [0.11, 0.04], sat: [0.55, 0.10], lit: [0.50, 0.08] },
        // Lobby Security Drone: a floating kiosk in a security cap, badge on a lanyard.
        lv_lobbysecuritydrone:{ variant: 'lv_lobbysecuritydrone',scale: 2.0, texturePool: 'pale',  bodyColor: 0xc8c2b4, accent: 0xff2a2a, hue: [0.12, 0.03], sat: [0.10, 0.05], lit: [0.70, 0.06] }
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);

    class DroneBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = D_PROFILES[creatureType] || D_PROFILES.surveillancedrone;
            super(scale, offsetY, battler, profile, 0, creatureType || 'surveillancedrone');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
            this._blades = [];
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
        _rotor(sx, sz, metal) {
            const g = new THREE.Group();
            // The boom runs diagonally out of the chassis centre to the motor, so
            // every rotor is held by the body instead of hanging beside it.
            const mx = sx * 0.36, mz = sz * 0.36, len = Math.hypot(mx, mz);
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 5), metal); arm.rotation.set(0, Math.atan2(-mz, mx), Math.PI / 2); arm.position.set(mx * 0.5, 0, mz * 0.5); g.add(arm);
            const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), metal); motor.position.set(mx, 0.03, mz); g.add(motor);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.05), this._mat(0x222222, 0.7, 0.4)); blade.position.set(mx, 0.08, mz); g.add(blade); this._blades.push(blade);
            g.position.set(0, 1.05, 0); return g;
        }
        _droneBase(o) {
            o = o || {};
            const p = this.profile;
            const metal = o.mat || this._skinMat(p.bodyColor, 0.4);
            this._droneMat = metal;
            this.chassis = new THREE.Group();
            const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), metal); this.chassis.add(core);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal); dome.position.y = 0.1; this.chassis.add(dome);
            this.chassis.position.set(0, 1.0, 0); this.bodyGroup.add(this.chassis);
            // Gimballed camera sensor.
            this.sensorArray = new THREE.Group();
            const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), this._mat(0x111111, 1, 0.2)); this.sensorArray.add(gimbal);
            const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 12), this._mat(p.accent, 1, 0.2, p.accent)); lens.rotation.x = Math.PI / 2; lens.position.z = 0.1; this.sensorArray.add(lens); this.sensorArray._lens = lens;
            this.sensorArray.position.set(0, 0.86, 0.18); this.bodyGroup.add(this.sensorArray);
            // Two prop groups (left/right pairs).
            this.leftProp = new THREE.Group(); this.rightProp = new THREE.Group();
            this.leftProp.add(this._rotor(-1, 1, metal)); this.leftProp.add(this._rotor(-1, -1, metal));
            this.rightProp.add(this._rotor(1, 1, metal)); this.rightProp.add(this._rotor(1, -1, metal));
            this.bodyGroup.add(this.leftProp, this.rightProp);
            this._partMeshMap = { CHASSIS: this.chassis, SENSOR_ARRAY: this.sensorArray, LEFT_PROP: this.leftProp, RIGHT_PROP: this.rightProp };
            this._cascadeRules = [
                { gone: ['CHASSIS'], hide: [this.chassis, this.sensorArray, this.leftProp, this.rightProp, ...(o.extra || []).filter(Boolean)] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['LEFT_PROP'], hide: [this.leftProp] },
                { gone: ['RIGHT_PROP'], hide: [this.rightProp] },
            ];
        }

        async load(physicsWorld /*, sx, sy, sz */) {
            this.physicsWorld = physicsWorld;
            switch (this.variant) {
                case 'cryodrone': this._buildCryoDrone(); break;
                case 'datadrone': this._buildDataDrone(); break;
                case 'aethersplicer': this._buildAetherSplicer(); break;
                case 'lv_toydrone':           this._buildToyDrone(); break;
                case 'lv_roguevacuumbot':     this._buildVacuumBot(); break;
                case 'lv_satellitegnat':      this._buildSatelliteGnat(); break;
                case 'lv_lobbysecuritydrone': this._buildLobbyDrone(); break;
                default:          this._buildSurveillanceDrone(); break;
            }
            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        // ── Surveillance Drone: antenna + blinking warning light ───────────
        _buildSurveillanceDrone() {
            const p = this.profile;
            this._droneBase({});
            this.antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), this._mat(0x141414, 1, 0.4)); this.antenna.position.set(-0.18, 0.26, -0.15); this.chassis.add(this.antenna);
            this.blip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), this._mat(p.accent, 1, 0.3, p.accent)); this.blip.position.set(0, 1.22, -0.2); this.bodyGroup.add(this.blip);
            this._cascadeRules[0].hide.push(this.blip);
        }

        // ── Cryo Drone: frost emitters and icicle spikes ───────────────────
        _buildCryoDrone() {
            const p = this.profile;
            this._droneBase({});
            this.frost = new THREE.Group();
            for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; const ice = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 5), this._mat(p.accent, 0.85, 0.2, p.accent)); ice.position.set(Math.cos(a) * 0.28, 0.82, Math.sin(a) * 0.28); ice.rotation.x = Math.PI; this.frost.add(ice); }
            this.bodyGroup.add(this.frost);
            this.mist = new THREE.Group();
            this.mist.userData.float = true;   // cold vapour falling off it by design
            for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this._mat(0xddf4ff, 0.4, 0.2)); m.position.set((this.idRand() - 0.5) * 0.7, 0.7 - this.idRand() * 0.3, (this.idRand() - 0.5) * 0.7); m._t = this.idRand(); this.mist.add(m); }
            this.bodyGroup.add(this.mist);
            this._cascadeRules[0].hide.push(this.frost, this.mist);
        }

        // ── Data Drone: a glitchy holographic screen-face ──────────────────
        _buildDataDrone() {
            const p = this.profile;
            this._droneBase({});
            this.screen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), this._mat(0x081810, 0.9, 0.3, p.accent)); this.screen.position.set(0, 0.04, 0.255); this.chassis.add(this.screen);
            this.dataBits = new THREE.Group();
            for (let i = 0; i < 10; i++) { const bit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.01), this._mat(p.accent, 0.9, 0.2, p.accent)); bit.position.set(-0.16 + (i % 5) * 0.08, 0.12 - Math.floor(i / 5) * 0.08, 0.262); bit._t = this.idRand(); this.dataBits.add(bit); }
            this.chassis.add(this.dataBits);
            this._cascadeRules[0].hide.push(this.screen, this.dataBits);
        }

        // ── Aether Splicer: fractured floating frame + arcing splicer arms ──
        _buildAetherSplicer() {
            const p = this.profile;
            const metal = this._skinMat(p.bodyColor, 0.35);
            // Fractured chassis: a ring of cracked-apart tetra shards floating around a core gap.
            this.chassis = new THREE.Group();
            const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), this._mat(0x1a1622, 1, 0.3, p.accent)); this.chassis.add(core); this.chassis._core = core;
            this._shards = [];
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const sh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16 + this.idRand() * 0.06, 0), metal);
                const r = 0.34 + this.idRand() * 0.05;
                sh.position.set(Math.cos(a) * r, 0.02 * (i % 2 ? 1 : -1), Math.sin(a) * r);
                sh.rotation.set(this.idRand() * 3, this.idRand() * 3, this.idRand() * 3);
                sh._a = a; sh._r = r; this._shards.push(sh); this.chassis.add(sh);
            }
            this.chassis.position.set(0, 1.0, 0); this.bodyGroup.add(this.chassis);
            // Sensor array: a faceted scanner crystal on a forward stalk facing the camera.
            this.sensorArray = new THREE.Group();
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.18, 6), metal); stalk.rotation.x = Math.PI / 2; stalk.position.z = 0.09; this.sensorArray.add(stalk);
            const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), this._mat(p.accent, 0.85, 0.15, p.accent)); crystal.position.z = 0.22; this.sensorArray.add(crystal); this.sensorArray._crystal = crystal;
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), this._mat(0xffffff, 1, 0.1, 0xffffff)); pupil.position.z = 0.31; this.sensorArray.add(pupil);
            this.sensorArray.position.set(0, 1.0, 0.2); this.bodyGroup.add(this.sensorArray);
            // Two spinning rotor props on outrigger arms.
            this.leftProp = new THREE.Group(); this.rightProp = new THREE.Group();
            this.leftProp.add(this._rotor(-1, 0, metal)); this.rightProp.add(this._rotor(1, 0, metal));
            this.leftProp.children[0].position.set(-0.2, 0.0, 0); this.rightProp.children[0].position.set(0.2, 0.0, 0);
            this.leftProp.position.set(0, 1.0, 0); this.rightProp.position.set(0, 1.0, 0);
            this.bodyGroup.add(this.leftProp, this.rightProp);
            // Arcing electric splicer arms: jointed segmented limbs reaching down/out.
            this.splicers = new THREE.Group(); this._arcs = [];
            for (let s = -1; s <= 1; s += 2) {
                const arm = new THREE.Group();
                let px = s * 0.18, py = 0.9, pz = 0.0;
                for (let j = 0; j < 4; j++) {
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.03 - j * 0.005, 0.04 - j * 0.005, 0.16, 5), metal);
                    px += s * 0.07; py -= 0.13; pz += 0.04;
                    seg.position.set(px, py, pz); seg.rotation.z = s * (0.4 + j * 0.18); arm.add(seg);
                }
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), this._mat(p.accent, 1, 0.2, p.accent)); tip.position.set(px + s * 0.05, py - 0.08, pz); tip.rotation.z = s * 1.2; arm.add(tip); arm._tip = tip;
                this._arcs.push(arm); this.splicers.add(arm);
            }
            this.bodyGroup.add(this.splicers);
            this._partMeshMap = { CHASSIS: this.chassis, SENSOR_ARRAY: this.sensorArray, LEFT_PROP: this.leftProp, RIGHT_PROP: this.rightProp };
            this._cascadeRules = [
                { gone: ['CHASSIS'], hide: [this.chassis, this.sensorArray, this.leftProp, this.rightProp, this.splicers] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['LEFT_PROP'], hide: [this.leftProp, this._arcs[0]] },
                { gone: ['RIGHT_PROP'], hide: [this.rightProp, this._arcs[1]] },
            ];
        }

        _strut(parent, mat, a, b, r0, r1, seg) { return this.addStrut(parent, mat, a, b, r0, r1, seg || 5); }
        // A spinning two-blade prop centred on (x, y, z) of `parent`.
        _blade(parent, x, y, z, len, mat) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.045), mat);
            b.position.set(x, y, z); parent.add(b); this._blades.push(b); return b;
        }
        _wireDrone(jaws, extra) {
            this._partMeshMap = { CHASSIS: this.chassis, SENSOR_ARRAY: this.sensorArray, LEFT_PROP: this.leftProp, RIGHT_PROP: this.rightProp, JAWS: jaws, CORE: this.chassis, BODY: this.chassis };
            this._cascadeRules = [
                { gone: ['CHASSIS', 'CORE', 'BODY'], hide: [this.chassis, this.sensorArray, this.leftProp, this.rightProp, jaws, ...(extra || [])].filter(Boolean) },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['LEFT_PROP'], hide: [this.leftProp] },
                { gone: ['RIGHT_PROP'], hide: [this.rightProp] },
                { gone: ['JAWS'], hide: [jaws].filter(Boolean) },
            ];
        }

        // ── Toy Drone: a bargain-bin quadcopter that never found its controller ─
        // Shiny red plastic, oversized ring guards, stuck-on googly eyes, a toy
        // grabber claw underneath and a picnic napkin snagged on one skid.
        _buildToyDrone() {
            const p = this.profile;
            const plastic = this._skinMat(p.bodyColor, 0.35);
            const yellow = this._mat(p.accent, 1, 0.35);
            const grey = this._mat(0x2a2a2e, 1, 0.5);
            this.chassis = new THREE.Group(); this.chassis.position.set(0, 1.0, 0); this.bodyGroup.add(this.chassis);
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), plastic); shell.scale.set(1.25, 0.55, 1.25); this.chassis.add(shell);
            const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), yellow); canopy.position.set(0, 0.06, -0.03); this.chassis.add(canopy);
            // Skids: two bent struts each side down to a runner.
            for (const s of [-1, 1]) {
                this._strut(this.chassis, grey, V(s * 0.12, -0.06, 0.08), V(s * 0.18, -0.24, 0.1), 0.014, 0.014, 4);
                this._strut(this.chassis, grey, V(s * 0.12, -0.06, -0.08), V(s * 0.18, -0.24, -0.1), 0.014, 0.014, 4);
                this._strut(this.chassis, grey, V(s * 0.18, -0.24, -0.16), V(s * 0.18, -0.24, 0.16), 0.016, 0.016, 4);
            }
            // The napkin: a red check cloth hanging off the left runner.
            const napkin = new THREE.Group(); napkin.position.set(-0.18, -0.24, -0.1); this.chassis.add(napkin);
            for (let i = 0; i < 4; i++) { const sq = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.008), this._mat(i % 3 ? 0xf0ece0 : 0xc82a2a, 1, 0.9)); sq.position.set((i % 2) * 0.07 - 0.035, -0.04 - Math.floor(i / 2) * 0.07, 0); sq.rotation.y = 0.4; napkin.add(sq); }
            this._napkin = napkin;
            // Rotors on X booms, each in a fat ring guard.
            this.leftProp = new THREE.Group(); this.rightProp = new THREE.Group();
            for (const [sx, sz] of [[-1, 1], [-1, -1], [1, 1], [1, -1]]) {
                const g = sx < 0 ? this.leftProp : this.rightProp;
                const hub = V(sx * 0.36, 1.03, sz * 0.36);
                this._strut(g, plastic, V(sx * 0.12, 1.0, sz * 0.12), hub, 0.025, 0.02, 4);
                const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.07, 6), grey); motor.position.copy(hub); g.add(motor);
                this._blade(g, hub.x, hub.y + 0.05, hub.z, 0.3, this._mat(0x1a1a1a, 0.8, 0.4));
                const guard = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 4, 12), yellow); guard.rotation.x = Math.PI / 2; guard.position.set(hub.x, hub.y + 0.04, hub.z); g.add(guard);
                for (const a of [0, Math.PI]) { const ang = Math.atan2(sz, sx) + Math.PI / 2 + a; this._strut(g, yellow, V(hub.x, hub.y + 0.02, hub.z), V(hub.x + Math.cos(ang) * 0.19, hub.y + 0.04, hub.z + Math.sin(ang) * 0.19), 0.012, 0.012, 3); }
            }
            this.bodyGroup.add(this.leftProp, this.rightProp);
            // SENSOR_ARRAY: googly eyes with loose rolling pupils, and a sticker grin.
            this.sensorArray = new THREE.Group(); this.sensorArray.position.set(0, 1.0, 0.25); this.bodyGroup.add(this.sensorArray);
            this._pupils = [];
            for (const s of [-1, 1]) {
                const white = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 10), this._mat(0xffffff, 1, 0.2)); white.rotation.x = Math.PI / 2; white.position.set(s * 0.08, 0.04, 0); this.sensorArray.add(white);
                const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), this._mat(0x111111, 1, 0.3)); pupil.rotation.x = Math.PI / 2; pupil.position.set(s * 0.08, 0.02, 0.02); this.sensorArray.add(pupil); this._pupils.push(pupil);
            }
            const grin = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), this._mat(0x111111, 1, 0.4)); grin.rotation.z = Math.PI; grin.position.set(0, -0.02, -0.02); this.sensorArray.add(grin);
            // Low-battery LED blinking on the canopy.
            this._led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), this._mat(0xff2020, 1, 0.3, 0xff2020)); this._led.position.set(0, 0.13, -0.03); this.chassis.add(this._led);
            // JAWS: a toy grabber claw on a short stalk under the belly.
            const claw = new THREE.Group(); claw.position.set(0, 0.92, 0.06); this.bodyGroup.add(claw);
            this._strut(claw, grey, V(0, 0.04, 0), V(0, -0.1, 0), 0.015, 0.015, 4);
            this._clawFingers = [];
            for (let i = 0; i < 3; i++) {
                const f = new THREE.Group(); f.position.y = -0.1; f.rotation.y = (i / 3) * Math.PI * 2; claw.add(f);
                this._strut(f, yellow, V(0, 0, 0), V(0, -0.06, 0.05), 0.012, 0.008, 3);
                this._strut(f, yellow, V(0, -0.06, 0.05), V(0, -0.11, 0.02), 0.008, 0.005, 3);
                this._clawFingers.push(f);
            }
            this._wireDrone(claw);
        }

        // ── Rogue Vacuum Bot: a floor puck that swallows shoelaces ─────────
        // It never flies: a flat round body on two wheels, two spinning side
        // brushes, a lidar turret, angry bumper LEDs and a lace in its intake.
        _buildVacuumBot() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.4);
            const dark = this._mat(0x16181c, 1, 0.6);
            const glow = this._mat(p.accent, 1, 0.3, p.accent);
            this.chassis = new THREE.Group(); this.bodyGroup.add(this.chassis);
            const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.48, 0.2, 14), shell); puck.position.y = 0.16; this.chassis.add(puck);
            const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.03, 14), this._mat(0x5a606a, 1, 0.3)); lid.position.y = 0.27; this.chassis.add(lid);
            const button = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 12), glow); button.rotation.x = Math.PI / 2; button.position.set(0, 0.29, 0.16); this.chassis.add(button); this._button = button;
            // Front bumper arc with two narrowed LED eyes on it.
            const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 4, 14, Math.PI), dark); bumper.rotation.x = Math.PI / 2; bumper.position.y = 0.12; this.chassis.add(bumper);
            for (const s of [-1, 1]) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), this._mat(0xff3a1a, 1, 0.3, 0xff3a1a)); led.position.set(s * 0.1, 0.15, 0.505); led.rotation.z = s * 0.3; this.chassis.add(led); }
            for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8), dark); w.rotation.z = Math.PI / 2; w.position.set(s * 0.3, 0.07, -0.02); this.chassis.add(w); }
            // SENSOR_ARRAY: the lidar turret, a slow spinning cap.
            this.sensorArray = new THREE.Group(); this.sensorArray.position.set(0, 0.28, -0.12); this.bodyGroup.add(this.sensorArray);
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.07, 10), dark); post.position.y = 0.03; this.sensorArray.add(post);
            const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), glow); window_.position.set(0, 0.04, 0.085); this.sensorArray.add(window_);
            // LEFT_PROP / RIGHT_PROP: the spinning three-armed side brushes.
            const brush = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.34, 0.05, 0.3); this.bodyGroup.add(g);
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6), dark); hub.position.y = 0.02; g.add(hub);
                const spin = new THREE.Group(); g.add(spin);
                for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; this._strut(spin, this._mat(0x9aa0a8, 1, 0.8), V(0, 0, 0), V(Math.cos(a) * 0.2, -0.03, Math.sin(a) * 0.2), 0.02, 0.006, 3); }
                g._spin = spin; return g;
            };
            this.leftProp = brush(-1); this.rightProp = brush(1);
            // JAWS: the intake slot, a grubby shoelace and a stolen sock.
            const jaws = new THREE.Group(); jaws.position.set(0, 0.06, 0.36); this.bodyGroup.add(jaws);
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.08), this._mat(0x050506, 1, 0.8)); jaws.add(slot);
            const lace = new THREE.CatmullRomCurve3([V(0.04, 0, 0.02), V(0.1, -0.02, 0.16), V(-0.02, -0.03, 0.3), V(0.08, -0.04, 0.42), V(0.02, -0.04, 0.52)]);
            jaws.add(new THREE.Mesh(new THREE.TubeGeometry(lace, 10, 0.012, 3, false), this._mat(0xe8e0d0, 1, 0.9)));
            const aglet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 4), dark); aglet.rotation.x = Math.PI / 2; aglet.position.set(0.02, -0.04, 0.55); jaws.add(aglet);
            const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 2, 6), this._mat(0x3a7a4a, 1, 1)); sock.rotation.set(Math.PI / 2, 0, 0.6); sock.position.set(-0.12, 0.0, 0.08); jaws.add(sock);
            this._wireDrone(jaws);
        }

        // ── Satellite Gnat: a fallen satellite, gold foil on gnat legs ─────
        _buildSatelliteGnat() {
            const p = this.profile;
            const foil = this._skinMat(p.bodyColor, 0.25);
            const frame = this._mat(0x8a8e96, 1, 0.4);
            const cell = this._mat(0x1a2a6a, 1, 0.2, 0x0a1440);
            this.chassis = new THREE.Group(); this.chassis.position.set(0, 1.05, 0); this.bodyGroup.add(this.chassis);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.3), foil); this.chassis.add(body);
            // Crumpled foil: two skewed slabs worked over the box.
            for (const [x, y, z, rx, rz] of [[0.02, 0.06, 0.04, 0.2, -0.15], [-0.03, -0.05, -0.06, -0.15, 0.2]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), foil); c.position.set(x, y, z); c.rotation.set(rx, 0.3, rz); this.chassis.add(c); }
            // Six gnat legs hanging, each bent once at the knee.
            for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
                const hip = V(s * 0.1, -0.09, 0.1 - i * 0.1), knee = V(s * 0.2, -0.24, 0.12 - i * 0.12), foot = V(s * 0.17, -0.48, 0.16 - i * 0.16);
                this._strut(this.chassis, frame, hip, knee, 0.01, 0.009, 3); this._strut(this.chassis, frame, knee, foot, 0.009, 0.005, 3);
            }
            // Whip antenna with a blinking bead.
            this._strut(this.chassis, frame, V(-0.06, 0.1, -0.1), V(-0.14, 0.52, -0.2), 0.008, 0.005, 3);
            this._beacon = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), this._mat(p.accent, 1, 0.3, p.accent)); this._beacon.position.set(-0.14, 0.53, -0.2); this.chassis.add(this._beacon);
            // LEFT_PROP / RIGHT_PROP: solar panel wings on a hinge, two leaves each.
            const wing = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.12, 1.08, 0); this.bodyGroup.add(g);
                this._strut(g, frame, V(0, 0, 0), V(side * 0.16, 0.04, 0), 0.015, 0.015, 4);
                for (let k = 0; k < 2; k++) {
                    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.012), cell); panel.position.set(side * (0.29 + k * 0.25), 0.04 + k * 0.06, -0.02); panel.rotation.z = side * 0.24; g.add(panel);
                    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.02, 0.02), frame); rim.position.set(side * (0.29 + k * 0.25), 0.04 + k * 0.06, -0.02); rim.rotation.z = side * 0.24; g.add(rim);
                }
                g._side = side; return g;
            };
            this.leftProp = wing(-1); this.rightProp = wing(1);
            // SENSOR_ARRAY: a dish on the nose with one red eye at its feed.
            this.sensorArray = new THREE.Group(); this.sensorArray.position.set(0, 1.07, 0.15); this.bodyGroup.add(this.sensorArray);
            const dish = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 4, 0, Math.PI * 2, 0, 0.9), this._mat(0xe8e8e0, 1, 0.3)); dish.rotation.x = -Math.PI / 2; dish.position.z = 0.15; this.sensorArray.add(dish);
            this._strut(this.sensorArray, frame, V(0, 0, 0), V(0, 0, 0.14), 0.02, 0.02, 4);
            this._strut(this.sensorArray, frame, V(0, 0, 0.06), V(0, 0, 0.26), 0.012, 0.012, 3);
            this._eyeLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), this._mat(p.accent, 1, 0.3, p.accent)); this._eyeLed.position.z = 0.27; this.sensorArray.add(this._eyeLed);
            // JAWS: a thin probe proboscis jutting down and forward.
            const jaws = new THREE.Group(); jaws.position.set(0, 0.97, 0.13); this.bodyGroup.add(jaws);
            this._strut(jaws, frame, V(0, 0, 0), V(0, -0.16, 0.2), 0.016, 0.006, 3);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), this._mat(0x6a6e76, 1, 0.3)); tip.position.set(0, -0.16, 0.2); jaws.add(tip);
            this._wireDrone(jaws);
        }

        // ── Lobby Security Drone: a floating kiosk on patrol ───────────────
        // Corporate beige drum, a peaked security cap, a red badge-scanner
        // visor, two ducted side fans, a taser arm and its own ID on a lanyard.
        _buildLobbyDrone() {
            const p = this.profile;
            const shell = this._skinMat(p.bodyColor, 0.4);
            const navy = this._mat(0x1a2440, 1, 0.6);
            const dark = this._mat(0x222428, 1, 0.5);
            this.chassis = new THREE.Group(); this.chassis.position.set(0, 1.1, 0); this.bodyGroup.add(this.chassis);
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.52, 10), shell); this.chassis.add(drum);
            const base = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell); base.position.y = -0.26; this.chassis.add(base);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.205, 0.06, 10), navy); band.position.y = -0.08; this.chassis.add(band);
            // The cap: crown, peak and a gold badge.
            const cap = new THREE.Group(); cap.position.y = 0.26; this.chassis.add(cap);
            const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.12, 10), navy); crown.position.y = 0.06; cap.add(crown);
            const peak = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.14), dark); peak.position.set(0, 0.01, 0.24); peak.rotation.x = 0.2; cap.add(peak);
            const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), this._mat(0xd8b040, 1, 0.3, 0x3a2a00)); badge.scale.z = 0.4; badge.position.set(0, 0.08, 0.235); cap.add(badge);
            // Lanyard and ID card on the chest.
            const card = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.012), this._mat(0xf4f4f0, 1, 0.5)); card.position.set(0.0, -0.17, 0.215); card.rotation.x = -0.1; this.chassis.add(card);
            const photo = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.005), this._mat(0x6a8ab0, 1, 0.5)); photo.position.set(-0.02, -0.15, 0.223); this.chassis.add(photo);
            this._strut(this.chassis, this._mat(0x2a6ad0, 1, 0.8), V(-0.12, 0.12, 0.17), V(-0.03, -0.11, 0.215), 0.008, 0.008, 3);
            this._strut(this.chassis, this._mat(0x2a6ad0, 1, 0.8), V(0.12, 0.12, 0.17), V(0.03, -0.11, 0.215), 0.008, 0.008, 3);
            // SENSOR_ARRAY: the red scanning visor slit and its fan of light.
            this.sensorArray = new THREE.Group(); this.sensorArray.position.set(0, 1.22, 0.2); this.bodyGroup.add(this.sensorArray);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.04), this._mat(0x200606, 1, 0.3)); this.sensorArray.add(visor);
            this._scan = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.045), this._mat(p.accent, 1, 0.3, p.accent)); this._scan.position.z = 0.003; this.sensorArray.add(this._scan);
            const beam = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4, 1, true), this._mat(p.accent, 0.25, 0.3, p.accent)); beam.rotation.x = -Math.PI / 2; beam.position.set(0, -0.06, 0.2); beam.scale.set(1, 1, 0.15); this.sensorArray.add(beam);
            // LEFT_PROP / RIGHT_PROP: ducted fans on stub pylons.
            const fan = (side) => {
                const g = new THREE.Group(); g.position.set(side * 0.2, 1.0, 0); this.bodyGroup.add(g);
                this._strut(g, dark, V(0, 0, 0), V(side * 0.2, 0.0, 0), 0.03, 0.025, 5);
                const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.08, 10, 1, true), shell); duct.position.set(side * 0.33, 0, 0); g.add(duct);
                const ductRim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 4, 10), navy); ductRim.rotation.x = Math.PI / 2; ductRim.position.set(side * 0.33, 0.04, 0); g.add(ductRim);
                this._strut(g, dark, V(side * 0.2, 0, 0), V(side * 0.33, 0, 0), 0.015, 0.015, 3);
                this._blade(g, side * 0.33, 0, 0, 0.22, dark);
                g._side = side; return g;
            };
            this.leftProp = fan(-1); this.rightProp = fan(1);
            // JAWS: a two-joint taser arm on the right with sparking prongs.
            const jaws = new THREE.Group(); jaws.position.set(0.16, 0.92, 0.08); this.bodyGroup.add(jaws);
            this._strut(jaws, dark, V(0, 0, 0), V(0.08, -0.12, 0.14), 0.022, 0.018, 4);
            this._strut(jaws, dark, V(0.08, -0.12, 0.14), V(0.06, -0.1, 0.32), 0.018, 0.014, 4);
            for (const s of [-1, 1]) this._strut(jaws, this._mat(0xb0b4bc, 1, 0.3), V(0.06, -0.1, 0.32), V(0.06 + s * 0.025, -0.1, 0.38), 0.006, 0.004, 3);
            this._spark = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), this._mat(0x9ad8ff, 0.9, 0.2, 0x66ccff)); this._spark.position.set(0.06, -0.1, 0.39); jaws.add(this._spark);
            this._taser = jaws;
            this._wireDrone(jaws);
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime, anim = this.currentAnimation;
            let growth = 1.0;
            if (anim === 'spawn') growth = Math.min(1.0, t / 0.8);
            this.applyModelScale(growth);
            const fast = (anim === 'attack' || anim === 'specialattack');
            this.model.position.y = this._baseY + Math.sin(t * 2.5) * 0.06 * this.scale;
            this.model.rotation.z = Math.sin(t * 1.8) * 0.04; // hover wobble
            // Spinning rotors.
            this._blades.forEach((b, i) => { b.rotation.y += (fast ? 50 : 36) * deltaTime; });
            if (this.sensorArray) this.sensorArray.rotation.y = Math.sin(t * (fast ? 4 : 1.5)) * 0.5; // scanning

            switch (this.variant) {
                case 'surveillancedrone': {
                    if (this.blip && this.blip.material) this.blip.material.emissiveIntensity = Math.abs(Math.sin(t * (fast ? 9 : 4))) * 1.2;
                    if (this.sensorArray && this.sensorArray._lens) this.sensorArray._lens.material.emissiveIntensity = 0.4 + Math.sin(t * 3) * 0.3;
                    break;
                }
                case 'cryodrone': {
                    if (this.mist) this.mist.children.forEach(m => { m.position.y -= 0.008; if (m.position.y < 0.3) m.position.y = 0.8; });
                    if (this.frost) this.frost.rotation.y = t * 0.6;
                    break;
                }
                case 'datadrone': {
                    if (this.dataBits) this.dataBits.children.forEach((b, i) => { b.position.y -= 0.02; if (b.position.y < -0.08) b.position.y = 0.16; b.material.emissiveIntensity = 0.5 + Math.sin(t * 8 + i) * 0.5; });
                    if (this.screen) this.screen.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * (fast ? 12 : 5))) * 0.5; // flicker
                    break;
                }
                case 'lv_toydrone': {
                    // Cheap and wobbly: a lurching hover, eyes rattling loose.
                    this.model.rotation.z = Math.sin(t * 3.1) * 0.1;
                    this.model.rotation.x = Math.sin(t * 2.3) * 0.06;
                    if (this._pupils) this._pupils.forEach((pu, i) => { pu.position.x = (i ? 0.08 : -0.08) + Math.sin(t * 7 + i * 2) * 0.025; pu.position.y = 0.04 + Math.cos(t * 5.3 + i) * 0.025; });
                    if (this._led && this._led.material) this._led.material.emissiveIntensity = (Math.sin(t * 6) > 0.3) ? 1.0 : 0.0;
                    if (this._clawFingers) { const open = fast ? 0.2 + Math.abs(Math.sin(t * 8)) * 0.5 : 0.1; this._clawFingers.forEach(f => { f.rotation.x = open; }); }
                    if (this._napkin) this._napkin.rotation.x = Math.sin(t * 4) * 0.25;
                    break;
                }
                case 'lv_roguevacuumbot': {
                    // A floor robot: no hover; it bumps and turns.
                    this.model.position.y = this._baseY;
                    this.model.rotation.z = Math.sin(t * 9) * 0.008;
                    if (this.leftProp && this.leftProp._spin) this.leftProp._spin.rotation.y += (fast ? 20 : 9) * deltaTime;
                    if (this.rightProp && this.rightProp._spin) this.rightProp._spin.rotation.y -= (fast ? 20 : 9) * deltaTime;
                    if (this.sensorArray) this.sensorArray.rotation.y = t * 2;
                    if (this._button && this._button.material) this._button.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 2)) * 0.6;
                    break;
                }
                case 'lv_satellitegnat': {
                    // Solar wings beat slowly; the beacon and the eye blink.
                    const beat = Math.sin(t * (fast ? 9 : 3)) * (fast ? 0.35 : 0.18);
                    if (this.leftProp) this.leftProp.rotation.y = beat;
                    if (this.rightProp) this.rightProp.rotation.y = -beat;
                    if (this._beacon && this._beacon.material) this._beacon.material.emissiveIntensity = (Math.sin(t * 5) > 0.6) ? 1.2 : 0.1;
                    if (this._eyeLed && this._eyeLed.material) this._eyeLed.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 2)) * 0.7;
                    break;
                }
                case 'lv_lobbysecuritydrone': {
                    // Officious patrol: steady hover, scanner sweeping, taser jabs.
                    this.model.rotation.z = Math.sin(t * 1.2) * 0.02;
                    if (this._scan) this._scan.position.x = Math.sin(t * (fast ? 8 : 2.5)) * 0.1;
                    if (this.sensorArray) this.sensorArray.rotation.y = 0;
                    if (this._taser) this._taser.position.z = 0.08 + (fast ? Math.max(0, Math.sin(t * 10)) * 0.08 : 0);
                    if (this._spark && this._spark.material) this._spark.material.emissiveIntensity = fast ? (Math.sin(t * 30) > 0 ? 1.6 : 0.2) : 0.2;
                    break;
                }
                case 'aethersplicer': {
                    // Fractured shards drift in/out around the core gap.
                    if (this._shards) this._shards.forEach((sh, i) => { const r = sh._r + Math.sin(t * 1.6 + i) * 0.05; sh.position.x = Math.cos(sh._a) * r; sh.position.z = Math.sin(sh._a) * r; sh.rotation.y += deltaTime * (0.4 + i * 0.05); });
                    if (this.chassis && this.chassis._core) this.chassis._core.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3)) * 0.6;
                    if (this.sensorArray && this.sensorArray._crystal) this.sensorArray._crystal.rotation.y += deltaTime * 2.2;
                    // Splicer arm tips crackle with electric arcs (random flicker).
                    if (this._arcs) this._arcs.forEach((arm, i) => { arm.rotation.z = Math.sin(t * (fast ? 6 : 2) + i * Math.PI) * 0.12; if (arm._tip) arm._tip.material.emissiveIntensity = (this.idRand() + Math.sin(t * 14 + i)) > (fast ? 0.2 : 0.9) ? 1.6 : 0.2; });
                    break;
                }
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime, prog = Math.min(1.0, t / 1.0);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Loses lift and tumbles.
            this.model.position.y = this._baseY - prog * prog * 1.4 * this.scale;
            this.model.rotation.z = prog * 1.6;
            this.model.rotation.x = prog * 0.8;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new DroneBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    const S = D_PROFILES;
    reg('surveillancedrone', { aliases: ['surveillancedrone'], scale: S.surveillancedrone.scale, weapon: 0, create: make });
    reg('cryodrone',         { aliases: ['cryodrone'],         scale: S.cryodrone.scale,         weapon: 0, create: make });
    reg('datadrone',         { aliases: ['datadrone'],         scale: S.datadrone.scale,         weapon: 0, create: make });
    reg('aethersplicer',     { aliases: ['aethersplicer'],     scale: S.aethersplicer.scale,     weapon: 0, create: make });
    ['lv_toydrone', 'lv_roguevacuumbot', 'lv_satellitegnat', 'lv_lobbysecuritydrone']
        .forEach(k => reg(k, { aliases: [k], scale: S[k].scale, weapon: 0, create: make }));

    const NAMED = {
        surveillancedrone: ["Surveillance Drone"],
        cryodrone:         ["Cryo Drone"],
        datadrone:         ["Data Drone"],
        aethersplicer:     ["Aether Splicer"],
        lv_toydrone:           ["Toy Drone"],
        lv_roguevacuumbot:     ["Rogue Vacuum Bot"],
        lv_satellitegnat:      ["Satellite Gnat"],
        lv_lobbysecuritydrone: ["Lobby Security Drone"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Drone uniques registered');
})();
