//=============================================================================
// 3D Battler System - Mechanical Family
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Mechanical procedural 3D battlers (turret, drone, spherical bot).
 * Requires 3DBattlerSystem (core) to load first.
 * @author Omni-Lex
 * @url https://nocoldiz.itch.io/hypernet-explorer
 *
 * @help
 * ============================================================================
 * 3D Battler - Mechanical Family
 * ============================================================================
 *
 * Non-biped machines (no physics): a ground turret, a hovering quad drone and a
 * spinning spherical bot. They reuse the shared part-losing engine from
 * window.Battler3D.Base.
 *
 * Registered archetypes:
 *   Turret    (parts: CORE, GUN_BARREL, SENSOR_ARRAY, ROTATION_MECH, AMMO_CHAMBER)
 *   Drone     (parts: SENSOR_ARRAY, CHASSIS, LEFT_PROP, RIGHT_PROP)
 *   Spherical (parts: CORE, SHELL, SENSOR_ARRAY, SPIN_SPINES, AUX_DRIVES)
 *
 * MUST load AFTER BattleSystem/3DBattlerSystem.
 */

(() => {
    'use strict';

    if (typeof THREE === 'undefined') return;
    if (!window.Battler3D || !window.Battler3D.Base) {
        console.error('[3D Battler Mechanical] Core (3DBattlerSystem) not loaded first.');
        return;
    }

    const Base = window.Battler3D.Base;
    const debugLog = window.Battler3D.debugLog || function () {};

    const MECH_PROFILES = {
        turret:    { variant: 'turret', scale: 2.4, metal: 0x8a8f98, accent: 0xff4422, texturePool: 'metal', hue: [0.05, 0.04], sat: [0.08, 0.05], lit: [0.5, 0.1] },
        drone:     { variant: 'drone', scale: 2.0, metal: 0x6f7c8a, accent: 0x33ddff, texturePool: 'metal', hue: [0.55, 0.04], sat: [0.10, 0.05], lit: [0.5, 0.1] },
        spherical: { variant: 'spherical', scale: 2.2, metal: 0x9aa0aa, accent: 0xffd040, texturePool: 'metal', hue: [0.12, 0.04], sat: [0.10, 0.05], lit: [0.55, 0.1] },
        hydrokineticengine: { variant: 'hydrokineticengine', scale: 2.5, metal: 0x6f8a9a, accent: 0x33bbff, texturePool: 'metal', hue: [0.55, 0.05], sat: [0.20, 0.08], lit: [0.5, 0.1], front: true },
        neuralinterface:    { variant: 'neuralinterface',    scale: 2.3, metal: 0xc8ccd4, accent: 0xff44cc, texturePool: 'metal', hue: [0.85, 0.06], sat: [0.18, 0.08], lit: [0.6, 0.1], front: true },
        prototurret:        { variant: 'prototurret',        scale: 2.5, metal: 0x7a6f55, accent: 0xff6622, texturePool: 'metal', hue: [0.10, 0.04], sat: [0.18, 0.06], lit: [0.45, 0.1] },
        quantumintellect:   { variant: 'quantumintellect',   scale: 2.7, metal: 0x55606a, accent: 0x44ffdd, texturePool: 'metal', hue: [0.5, 0.05], sat: [0.12, 0.06], lit: [0.4, 0.1], front: true },
        frostbacktortoise:  { variant: 'frostbacktortoise',  scale: 2.6, metal: 0xa8c8d8, accent: 0x88eeff, texturePool: 'water', hue: [0.55, 0.05], sat: [0.30, 0.10], lit: [0.65, 0.08] },
        brasssentinelmk4:   { variant: 'brasssentinelmk4',   scale: 2.6, metal: 0xc8962a, accent: 0xffcc33, texturePool: 'metal', hue: [0.11, 0.04], sat: [0.45, 0.10], lit: [0.5, 0.1], front: true },
        // Toy Turret (level 1-5, bespoke): a chunky plastic foam-dart turret on a
        // rubber-footed tripod, a clear dart hopper and its battery hanging out.
        lv_toyturret:       { variant: 'lv_toyturret',       scale: 1.9, metal: 0xff7a1a, accent: 0x2a6aff, texturePool: 'pale', hue: [0.07, 0.03], sat: [0.70, 0.10], lit: [0.52, 0.06] }
    };

    class MechanicalBattler3D extends Base {
        constructor(scale, offsetY, battler, weaponType, creatureType) {
            const profile = MECH_PROFILES[creatureType] || MECH_PROFILES.turret;
            super(scale, offsetY, battler, profile, 0, creatureType || 'turret');
            this.variant = profile.variant;
            this._materials = [];
            this._baseY = null;
        }

        async load(physicsWorld, startX = 0, startY = 0, startZ = 0) {
            this.physicsWorld = physicsWorld; // unused (no ragdoll)
            switch (this.variant) {
                case 'drone': this._buildDrone(); break;
                case 'spherical': this._buildSpherical(); break;
                case 'hydrokineticengine': this._buildHydrokineticEngine(); break;
                case 'neuralinterface': this._buildNeuralInterface(); break;
                case 'prototurret': this._buildProtoTurret(); break;
                case 'quantumintellect': this._buildQuantumIntellect(); break;
                case 'frostbacktortoise': this._buildFrostbackTortoise(); break;
                case 'brasssentinelmk4': this._buildBrassSentinel(); break;
                case 'lv_toyturret': this._buildToyTurret(); break;
                default: this._buildTurret(); break;
            }

            this.model = this.bodyGroup;
            this.applyModelScale();
            this.loaded = true;
            return this;
        }

        _metalMat(color, emissive) {
            const m = new THREE.MeshStandardMaterial({
                color, map: this.skinTex(), emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0,
                metalness: 0.7, roughness: 0.4, transparent: true
            });
            this._materials.push(m);
            return m;
        }

        _buildTurret() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);

            // Rotation mechanism (base) + ammo chamber drum + core housing.
            this.rotationMech = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 12), metal);
            this.rotationMech.position.y = 0.15;
            this.bodyGroup.add(this.rotationMech);

            this.ammoChamber = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 10), metal);
            this.ammoChamber.position.set(-0.2, 0.55, -0.15); this.ammoChamber.rotation.z = Math.PI / 2;
            this.bodyGroup.add(this.ammoChamber);

            this.core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), metal);
            this.core.position.y = 0.6;
            this.bodyGroup.add(this.core);

            // Gun barrel (pivots within the turret head) + sensor eye.
            this.gunBarrel = new THREE.Group();
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10), metal);
            barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.4;
            this.gunBarrel.add(barrel);
            this.gunBarrel.position.set(0, 0.6, 0.2);
            this.bodyGroup.add(this.gunBarrel);

            const eyeMat = this._metalMat(0x220000, p.accent);
            this.sensorArray = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), eyeMat);
            this.sensorArray.position.set(0, 0.7, 0.28);
            this.bodyGroup.add(this.sensorArray);

            this._partMeshMap = {
                CORE: this.core, GUN_BARREL: this.gunBarrel, SENSOR_ARRAY: this.sensorArray,
                ROTATION_MECH: this.rotationMech, AMMO_CHAMBER: this.ammoChamber
            };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.gunBarrel, this.sensorArray, this.ammoChamber] },
                { gone: ['GUN_BARREL'], hide: [this.gunBarrel] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['AMMO_CHAMBER'], hide: [this.ammoChamber] },
                { gone: ['ROTATION_MECH'], hide: [this.rotationMech] },
            ];
        }

        _buildDrone() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);

            this.chassis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), metal);
            this.chassis.position.y = 1.0;
            this.bodyGroup.add(this.chassis);

            const sensMat = this._metalMat(0x001a22, p.accent);
            this.sensorArray = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), sensMat);
            this.sensorArray.position.set(0, 0.9, 0.2); this.sensorArray.scale.set(1, 0.7, 1);
            this.bodyGroup.add(this.sensorArray);

            // Two prop arms with spinning rotor discs.
            const mkProp = (side) => {
                const g = new THREE.Group();
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), metal);
                arm.position.x = side * 0.35; g.add(arm);
                const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 12), this._metalMat(0x333333));
                rotor.position.set(side * 0.6, 0.06, 0);
                g.add(rotor);
                g.position.y = 1.0;
                this.bodyGroup.add(g);
                g._rotor = rotor;
                return g;
            };
            this.leftProp = mkProp(-1);
            this.rightProp = mkProp(1);

            this._partMeshMap = {
                CHASSIS: this.chassis, SENSOR_ARRAY: this.sensorArray,
                LEFT_PROP: this.leftProp, RIGHT_PROP: this.rightProp
            };
            this._cascadeRules = [
                { gone: ['CHASSIS'], hide: [this.chassis, this.sensorArray, this.leftProp, this.rightProp] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['LEFT_PROP'], hide: [this.leftProp] },
                { gone: ['RIGHT_PROP'], hide: [this.rightProp] },
            ];
        }

        _buildSpherical() {
            const p = this.profile;
            const shellMat = this._metalMat(p.metal);

            this.shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), shellMat);
            this.shell.position.y = 0.9;
            this.bodyGroup.add(this.shell);

            this.core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), this._metalMat(0x221a00, p.accent));
            this.core.position.y = 0.9;
            this.bodyGroup.add(this.core);

            const sensMat = this._metalMat(0x001a22, p.accent);
            this.sensorArray = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), sensMat);
            this.sensorArray.position.set(0, 0.9, 0.46);
            this.bodyGroup.add(this.sensorArray);

            // Spin spines: radial blades around the equator.
            this.spinSpines = new THREE.Group();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 4), shellMat);
                spine.position.set(Math.cos(a) * 0.55, 0.9, Math.sin(a) * 0.55);
                spine.rotation.z = Math.PI / 2; spine.rotation.y = -a;
                this.spinSpines.add(spine);
            }
            this.bodyGroup.add(this.spinSpines);

            // Aux drives: small thruster pods below.
            this.auxDrives = new THREE.Group();
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2;
                const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.2, 8), this._metalMat(0x333333, p.accent));
                pod.position.set(Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3);
                this.auxDrives.add(pod);
            }
            this.bodyGroup.add(this.auxDrives);

            this._partMeshMap = {
                CORE: this.core, SHELL: this.shell, SENSOR_ARRAY: this.sensorArray,
                SPIN_SPINES: this.spinSpines, AUX_DRIVES: this.auxDrives
            };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [this.core, this.shell, this.sensorArray, this.spinSpines, this.auxDrives] },
                { gone: ['SHELL'], hide: [this.shell] },
                { gone: ['SENSOR_ARRAY'], hide: [this.sensorArray] },
                { gone: ['SPIN_SPINES'], hide: [this.spinSpines] },
                { gone: ['AUX_DRIVES'], hide: [this.auxDrives] },
            ];
        }

        // Shared humanoid wiring: build a leg/arm rig from passed meshes and set
        // the part map + cascade (root CORE gone -> hide everything).
        _wireBiped(head, core, larm, rarm, lleg, rleg, extra) {
            extra = extra || [];
            this.head = head; this.core = core;
            this.leftArm = larm; this.rightArm = rarm;
            this.leftLeg = lleg; this.rightLeg = rleg;
            this._partMeshMap = {
                HEAD: head, CORE: core, LEFT_ARM: larm, RIGHT_ARM: rarm,
                LEFT_LEG: lleg, RIGHT_LEG: rleg
            };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [head, core, larm, rarm, lleg, rleg, ...extra.filter(Boolean)] },
                { gone: ['HEAD'], hide: [head] },
                { gone: ['LEFT_ARM'], hide: [larm] },
                { gone: ['RIGHT_ARM'], hide: [rarm] },
                { gone: ['LEFT_LEG'], hide: [lleg] },
                { gone: ['RIGHT_LEG'], hide: [rleg] },
            ];
        }

        // Shared turret wiring (CORE/GUN_BARREL/SENSOR_ARRAY/ROTATION_MECH/AMMO_CHAMBER).
        _wireTurret(core, barrel, sensor, rot, ammo, extra) {
            extra = extra || [];
            this.core = core; this.gunBarrel = barrel; this.sensorArray = sensor;
            this.rotationMech = rot; this.ammoChamber = ammo;
            this._partMeshMap = {
                CORE: core, GUN_BARREL: barrel, SENSOR_ARRAY: sensor,
                ROTATION_MECH: rot, AMMO_CHAMBER: ammo
            };
            this._cascadeRules = [
                { gone: ['CORE'], hide: [core, barrel, sensor, ammo, ...extra.filter(Boolean)] },
                { gone: ['GUN_BARREL'], hide: [barrel] },
                { gone: ['SENSOR_ARRAY'], hide: [sensor] },
                { gone: ['AMMO_CHAMBER'], hide: [ammo] },
                { gone: ['ROTATION_MECH'], hide: [rot] },
            ];
        }

        // ── Hydrokinetic Engine: water-jet nozzle arms, transparent tanks, pump core ──
        _buildHydrokineticEngine() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);
            const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.4, metalness: 0.1, roughness: 0.1 });
            this._materials.push(glass);
            const waterMat = this._metalMat(0x1f7fbf, p.accent); waterMat.opacity = 0.85;

            // Core = central pump housing flanked by two transparent water tanks.
            const core = new THREE.Group();
            const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.7, 14), metal); core.add(pump);
            for (const sx of [-1, 1]) {
                const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 12), glass); tank.position.set(sx * 0.42, 0, 0); core.add(tank);
                const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10), waterMat); fluid.position.set(sx * 0.42, -0.06, 0); core.add(fluid);
            }
            core.position.y = 1.1; this.bodyGroup.add(core);

            // Head = bulbous gauge dome with pressure eye.
            const head = new THREE.Group();
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), metal); head.add(dome);
            const eye = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 16), this._metalMat(0x002233, p.accent)); eye.position.z = 0.2; head.add(eye);
            head.position.y = 1.66; this.bodyGroup.add(head);

            // Arms = jet-nozzle launchers (cone nozzles).
            const mkArm = (sx) => {
                const g = new THREE.Group();
                const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), metal); limb.position.y = -0.25; g.add(limb);
                const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12, 1, true), this._metalMat(0x335566, p.accent)); nozzle.position.y = -0.6; nozzle.rotation.x = Math.PI; g.add(nozzle);
                g.position.set(sx * 0.6, 1.25, 0); g.rotation.z = sx * 0.25; this.bodyGroup.add(g); return g;
            };
            const larm = mkArm(-1), rarm = mkArm(1);

            // Legs = stubby hydraulic pistons.
            const mkLeg = (sx) => {
                const g = new THREE.Group();
                const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.55, 10), metal); piston.position.y = -0.28; g.add(piston);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.32), metal); foot.position.y = -0.58; g.add(foot);
                g.position.set(sx * 0.24, 0.7, 0); this.bodyGroup.add(g); return g;
            };
            const lleg = mkLeg(-1), rleg = mkLeg(1);

            this._wireBiped(head, core, larm, rarm, lleg, rleg);
        }

        // ── Neural Interface: domed sensor head, glowing brain-core, cable-tendril arms ──
        _buildNeuralInterface() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);

            // Core = sleek torso shell with an exposed glowing brain orb.
            const core = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 6, 14), metal); core.add(shell);
            const brain = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), this._metalMat(0x330022, p.accent)); brain.position.set(0, 0.1, 0.24); core.add(brain); core._brain = brain;
            core.position.y = 1.1; this.bodyGroup.add(core);

            // Head = smooth sensor dome with a horizontal scanner band.
            const head = new THREE.Group();
            const hd = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), metal); hd.scale.set(1, 0.9, 1); head.add(hd);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 24), this._metalMat(0x110022, p.accent)); band.rotation.x = Math.PI / 2; band.position.z = 0.04; head.add(band); head._band = band;
            head.position.y = 1.72; this.bodyGroup.add(head);

            // Arms = segmented cable tendrils (bezier-ish chain of spheres).
            const mkTendril = (sx) => {
                const g = new THREE.Group();
                let py = 0;
                for (let i = 0; i < 5; i++) {
                    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 8, 8), metal);
                    seg.position.set(sx * i * 0.06, py, 0); g.add(seg); py -= 0.13;
                }
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), this._metalMat(0x110022, p.accent)); tip.position.set(sx * 0.3, py + 0.05, 0); tip.rotation.x = Math.PI; g.add(tip);
                g.position.set(sx * 0.34, 1.25, 0); this.bodyGroup.add(g); return g;
            };
            const larm = mkTendril(-1), rarm = mkTendril(1);

            // Legs = thin poised antigrav struts.
            const mkLeg = (sx) => {
                const g = new THREE.Group();
                const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 8), metal); strut.position.y = -0.3; g.add(strut);
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), this._metalMat(0x110022, p.accent)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.6; g.add(ring);
                g.position.set(sx * 0.18, 0.7, 0); this.bodyGroup.add(g); return g;
            };
            const lleg = mkLeg(-1), rleg = mkLeg(1);

            this._neuTendrils = [larm, rarm];
            this._wireBiped(head, core, larm, rarm, lleg, rleg);
        }

        // ── Proto Turret: ancient turret, rotating adaptive armor plates, single sensor eye ──
        _buildProtoTurret() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);

            // Rotation mech = heavy octagonal base.
            const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.34, 8), metal); rot.position.y = 0.17; this.bodyGroup.add(rot);

            // Ammo chamber = riveted side drum.
            const ammo = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.42, 8), metal); ammo.position.set(-0.3, 0.62, -0.1); ammo.rotation.z = Math.PI / 2; this.bodyGroup.add(ammo);

            // Core = boxy housing wrapped in a ring of rotating adaptive armor plates.
            const core = new THREE.Group();
            const housing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), metal); core.add(housing);
            const plates = new THREE.Group();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.06), metal);
                plate.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42); plate.rotation.y = -a; plates.add(plate);
            }
            core.add(plates); core._plates = plates;
            core.position.y = 0.66; this.bodyGroup.add(core);

            // Gun barrel = chunky cannon.
            const barrel = new THREE.Group();
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.9, 10), metal); tube.rotation.x = Math.PI / 2; tube.position.z = 0.45; barrel.add(tube);
            const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.16, 10), metal); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 0.92; barrel.add(muzzle);
            barrel.position.set(0, 0.66, 0.2); this.bodyGroup.add(barrel);

            // Single sensor eye.
            const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 14), this._metalMat(0x220800, p.accent)); sensor.position.set(0, 0.82, 0.3); this.bodyGroup.add(sensor);

            this._wireTurret(core, barrel, sensor, rot, ammo);
        }

        // ── Toy Turret: a plastic foam-dart turret that hits far too hard ──
        // ROTATION_MECH is the tripod and turntable, CORE the rounded orange
        // body, GUN_BARREL a stubby blue barrel with a dart loaded, AMMO_CHAMBER
        // the clear hopper of darts on top, SENSOR_ARRAY two printed sticker
        // eyes with angry brows, JAWS the battery door hanging open.
        _plastic(color, emissive, opacity) {
            const m = new THREE.MeshStandardMaterial({
                color, roughness: 0.35, metalness: 0.05, transparent: true, opacity: opacity === undefined ? 1 : opacity,
                emissive: new THREE.Color(emissive || 0x000000), emissiveIntensity: emissive ? 0.6 : 0
            });
            this._materials.push(m);
            return m;
        }
        _buildToyTurret() {
            const p = this.profile;
            const orange = this._plastic(p.metal); orange.map = this.skinTex();
            const blue = this._plastic(p.accent);
            const grey = this._plastic(0x3a3a40);
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            const rot = new THREE.Group(); this.bodyGroup.add(rot);
            const table = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 10), grey); table.position.y = 0.36; rot.add(table);
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2 + Math.PI / 2, foot = V(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42);
                this.addStrut(rot, blue, V(0, 0.34, 0), foot, 0.05, 0.04, 6);
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), this._plastic(0x1a1a1a)); pad.scale.y = 0.55; pad.position.copy(foot); rot.add(pad);
            }
            const core = new THREE.Group(); core.position.y = 0.66; this.bodyGroup.add(core);
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 7), orange); shell.scale.set(1.15, 0.85, 1.0); core.add(shell);
            const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 4, 14), blue); stripe.rotation.x = Math.PI / 2; core.add(stripe);
            for (const [x, z] of [[0.3, 0.1], [-0.3, 0.1], [0.25, -0.18], [-0.25, -0.18]]) { const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), grey); screw.position.set(x, -0.1, z); screw.lookAt(x * 3, -0.1, z * 3); screw.rotateX(Math.PI / 2); core.add(screw); }
            const barrel = new THREE.Group(); barrel.position.set(0, 0.62, 0.25); this.bodyGroup.add(barrel);
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.34, 10), blue); tube.rotation.x = Math.PI / 2; tube.position.z = 0.12; barrel.add(tube);
            const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 4, 10), this._plastic(0xff4a1a)); muzzle.position.z = 0.29; barrel.add(muzzle);
            const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), this._plastic(0x3ad04a)); dart.rotation.x = Math.PI / 2; dart.position.z = 0.33; barrel.add(dart);
            const cup = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), this._plastic(0xe02a2a)); cup.rotation.x = Math.PI / 2; cup.position.z = 0.4; barrel.add(cup);
            const ammo = new THREE.Group(); ammo.position.set(0, 0.88, -0.04); this.bodyGroup.add(ammo);
            const hopper = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), this._plastic(0xd8f0ff, null, 0.35)); ammo.add(hopper);
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10), grey); ring.position.y = -0.02; ammo.add(ring);
            [0xff4a4a, 0x3ad04a, 0xffd23a, 0x3a8aff, 0xff7a1a].forEach((c, k) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 5), this._plastic(c)); d.position.set((k - 2) * 0.05, 0.06, (k % 2) * 0.05 - 0.02); d.rotation.z = (k - 2) * 0.3; ammo.add(d); });
            const sensor = new THREE.Group(); sensor.position.set(0, 0.76, 0.24); this.bodyGroup.add(sensor);
            for (const s of [-1, 1]) {
                const white = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10), this._plastic(0xffffff)); white.rotation.x = Math.PI / 2 - 0.35; white.position.set(s * 0.11, 0, 0); sensor.add(white);
                const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.014, 8), this._plastic(0x111111)); pupil.rotation.x = Math.PI / 2 - 0.35; pupil.position.set(s * 0.1, -0.01, 0.006); sensor.add(pupil);
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.02), this._plastic(0x111111)); brow.position.set(s * 0.11, 0.07, -0.02); brow.rotation.z = -s * 0.45; sensor.add(brow);
            }
            const jaws = new THREE.Group(); jaws.position.set(0, 0.6, -0.3); this.bodyGroup.add(jaws);
            const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.02), orange); door.position.set(0, -0.09, -0.03); door.rotation.x = 0.7; jaws.add(door);
            const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 5), grey); hinge.rotation.z = Math.PI / 2; jaws.add(hinge);
            const battery = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 7), this._plastic(0x1a1a1a)); battery.rotation.set(1.2, 0, 0.3); battery.position.set(0.05, -0.04, -0.06); jaws.add(battery);
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 7), this._plastic(0xd8b040)); cap.rotation.set(1.2, 0, 0.3); cap.position.set(0.075, -0.1, -0.14); jaws.add(cap);
            this._wireTurret(core, barrel, sensor, rot, ammo, [jaws]);
            this._partMeshMap.JAWS = jaws;
            this._cascadeRules.push({ gone: ['JAWS'], hide: [jaws] });
            this._toySensor = sensor;
        }

        // ── Frostback Tortoise: ice-clad turret-tortoise, frozen barrel, rotating shell ──
        _buildFrostbackTortoise() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);
            const ice = new THREE.MeshStandardMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.1, emissive: new THREE.Color(p.accent), emissiveIntensity: 0.25 });
            this._materials.push(ice);

            // Rotation mech = four squat tortoise legs on a ring base.
            const rot = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.18, 12), metal); rot.add(ring);
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 8), metal);
                leg.position.set(Math.cos(a) * 0.5, -0.18, Math.sin(a) * 0.5); rot.add(leg);
            }
            rot.position.y = 0.3; this.bodyGroup.add(rot);

            // Ammo chamber = frozen side canister.
            const ammo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8), ice); ammo.position.set(-0.34, 0.62, -0.08); ammo.rotation.z = Math.PI / 2; this.bodyGroup.add(ammo);

            // Core = domed tortoise carapace (frost shell) crowning the emplacement.
            const core = new THREE.Group();
            const carapace = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), metal); carapace.scale.set(1, 0.8, 1); core.add(carapace);
            const frost = new THREE.Group();
            for (let i = 0; i < 7; i++) {
                const a = (i / 7) * Math.PI * 2;
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 5), ice);
                spike.position.set(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32); spike.rotation.x = -0.4 * Math.sin(a); spike.rotation.z = 0.4 * Math.cos(a); frost.add(spike);
            }
            const peak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), ice); peak.position.y = 0.36; frost.add(peak);
            core.add(frost); core.position.y = 0.65; this.bodyGroup.add(core);

            // Gun barrel = ice-encrusted frozen cannon.
            const barrel = new THREE.Group();
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 10), metal); tube.rotation.x = Math.PI / 2; tube.position.z = 0.4; barrel.add(tube);
            const rime = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10), ice); rime.rotation.x = Math.PI / 2; rime.position.z = 0.72; barrel.add(rime);
            barrel.position.set(0, 0.66, 0.25); this.bodyGroup.add(barrel);

            // Sensor = glowing frost eye.
            const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), this._metalMat(0x002233, p.accent)); sensor.position.set(0, 0.78, 0.34); this.bodyGroup.add(sensor);

            this._wireTurret(core, barrel, sensor, rot, ammo);
        }

        // ── Quantum Intellect: heavily-armored mainframe, multi-screen head, bunker core ──
        _buildQuantumIntellect() {
            const p = this.profile;
            const metal = this._metalMat(p.metal);

            // Core = reinforced bunker block with bolted plating + vent slits.
            const core = new THREE.Group();
            const bunker = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.7), metal); core.add(bunker);
            for (const sx of [-1, 1]) {
                const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.3), metal); buttress.position.set(sx * 0.45, 0, 0); core.add(buttress);
            }
            const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.04), this._metalMat(0x001a18, p.accent)); vent.position.set(0, -0.1, 0.36); core.add(vent); core._vent = vent;
            core.position.y = 1.0; this.bodyGroup.add(core);

            // Head = multi-screen array stacked on a short neck.
            const head = new THREE.Group();
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 8), metal); neck.position.y = -0.15; head.add(neck);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.18), metal); head.add(frame);
            const screens = new THREE.Group();
            const sm = this._metalMat(0x001a18, p.accent);
            for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
                const scr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.03), sm);
                scr.position.set((c - 1) * 0.18, (r - 0.5) * 0.18, 0.1); screens.add(scr);
            }
            head.add(screens); head._screens = screens;
            head.position.y = 1.7; this.bodyGroup.add(head);

            // Arms = bulky armored manipulators.
            const mkArm = (sx) => {
                const g = new THREE.Group();
                const upper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), metal); upper.position.y = -0.25; g.add(upper);
                const fist = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), metal); fist.position.y = -0.56; g.add(fist);
                g.position.set(sx * 0.56, 1.2, 0); this.bodyGroup.add(g); return g;
            };
            const larm = mkArm(-1), rarm = mkArm(1);

            // Legs = wide piston-stabilized stompers.
            const mkLeg = (sx) => {
                const g = new THREE.Group();
                const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.26), metal); thigh.position.y = -0.2; g.add(thigh);
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.42), metal); foot.position.y = -0.5; g.add(foot);
                g.position.set(sx * 0.26, 0.55, 0); this.bodyGroup.add(g); return g;
            };
            const lleg = mkLeg(-1), rleg = mkLeg(1);

            this._wireBiped(head, core, larm, rarm, lleg, rleg);
        }

        // ── Brass Sentinel Mk. IV: bulky brass humanoid, riveted plates, valves, visor ──
        _buildBrassSentinel() {
            const p = this.profile;
            const brass = this._metalMat(p.metal);

            // Core = barrel-chested riveted torso with a central pressure valve.
            const core = new THREE.Group();
            const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.8, 14), brass); core.add(chest);
            // Rivet ring.
            const rivets = new THREE.Group();
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * Math.PI * 2;
                const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), brass);
                rivet.position.set(Math.cos(a) * 0.4, 0.25, Math.sin(a) * 0.4); rivets.add(rivet);
            }
            core.add(rivets);
            const valve = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 8, 12), this._metalMat(0x331100, p.accent)); valve.position.set(0, 0.05, 0.36); valve.rotation.x = Math.PI / 2; core.add(valve);
            core.position.y = 1.1; this.bodyGroup.add(core);

            // Head = riveted helm with a glowing horizontal visor slit.
            const head = new THREE.Group();
            const helm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.4), brass); head.add(helm);
            const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 6), brass); crest.position.y = 0.3; head.add(crest);
            const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05), this._metalMat(0x332200, p.accent)); visor.position.set(0, 0.03, 0.21); head.add(visor); head._visor = visor;
            head.position.y = 1.72; this.bodyGroup.add(head);

            // Arms = thick pistoned brass limbs with valve-dampener shoulders.
            const mkArm = (sx) => {
                const g = new THREE.Group();
                const damp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 10), brass); damp.rotation.z = Math.PI / 2; damp.position.y = 0.05; g.add(damp);
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.5, 10), brass); upper.position.y = -0.28; g.add(upper);
                const fist = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), brass); fist.position.y = -0.58; g.add(fist);
                g.position.set(sx * 0.52, 1.3, 0); this.bodyGroup.add(g); return g;
            };
            const larm = mkArm(-1), rarm = mkArm(1);

            // Legs = heavy riveted brass pillars.
            const mkLeg = (sx) => {
                const g = new THREE.Group();
                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.5, 10), brass); thigh.position.y = -0.25; g.add(thigh);
                const boot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.4), brass); boot.position.y = -0.56; g.add(boot);
                g.position.set(sx * 0.24, 0.6, 0); this.bodyGroup.add(g); return g;
            };
            const lleg = mkLeg(-1), rleg = mkLeg(1);

            this._wireBiped(head, core, larm, rarm, lleg, rleg);
        }

        animatePose(deltaTime) {
            if (this._baseY === null) this._baseY = this.model.position.y;
            const t = this.animTime;

            let growth = 1.0;
            if (this.currentAnimation === 'spawn') growth = Math.min(1.0, t / 0.6);
            this.applyModelScale(growth);

            const isTurret = (this.variant === 'turret' || this.variant === 'prototurret' || this.variant === 'frostbacktortoise' || this.variant === 'lv_toyturret');
            const isBiped = (this.variant === 'hydrokineticengine' || this.variant === 'neuralinterface' || this.variant === 'quantumintellect' || this.variant === 'brasssentinelmk4');

            if (isBiped) {
                // Mechanical idle sway + breathing bob; flickering accent lights.
                const att = (this.currentAnimation === 'attack' || this.currentAnimation === 'specialattack');
                this.model.position.y = this._baseY + Math.sin(t * 1.8) * 0.02 * this.scale;
                this.model.rotation.y = Math.sin(t * 0.6) * 0.04;
                const lean = att ? Math.sin(t * 9) * 0.1 : 0;
                if (this.core) this.core.rotation.x = lean;
                if (this.head) this.head.rotation.y = Math.sin(t * 0.9) * 0.18;
                // Per-variant accent flicker.
                if (this.head && this.head._band && this.head._band.material) this.head._band.material.emissiveIntensity = 0.5 + Math.sin(t * 7) * 0.4;
                if (this.head && this.head._visor && this.head._visor.material) this.head._visor.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(t * 3)) * 0.5;
                if (this.head && this.head._screens) this.head._screens.children.forEach((s, i) => { if (s.material) s.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(t * 6 + i * 1.3)) * 0.6; });
                if (this.core && this.core._brain) this.core._brain.rotation.y = t * 1.5;
                if (this._neuTendrils) this._neuTendrils.forEach((tn, k) => { tn.rotation.x = Math.sin(t * 2 + k * Math.PI) * 0.3; });
            } else if (isTurret) {
                // Sweep the barrel/sensor left-right; recoil-kick on attack.
                let yaw = Math.sin(t * 0.8) * 0.6;
                if (this.currentAnimation === 'attack' || this.currentAnimation === 'specialattack') yaw = Math.sin(t * 6) * 0.25;
                if (this.gunBarrel && this.gunBarrel.visible) {
                    this.gunBarrel.rotation.y = yaw;
                    const recoil = (this.currentAnimation === 'attack') ? Math.max(0, Math.sin(t * 18)) * 0.12 : 0;
                    this.gunBarrel.position.z = (this.variant === 'turret' ? 0.2 : (this.variant === 'prototurret' ? 0.2 : 0.25)) - recoil;
                }
                // Adaptive plates / frost shell rotate.
                if (this.core && this.core._plates) this.core._plates.rotation.y = t * 0.8;
                if (this.variant === 'frostbacktortoise' && this.core) this.core.rotation.y = t * 0.4;
                if (this.variant === 'lv_toyturret') {
                    // Cheap motor: the whole head judders and the eyes follow the barrel.
                    if (this.core) this.core.rotation.y = yaw * 0.5;
                    if (this._toySensor) this._toySensor.rotation.y = yaw * 0.5;
                    if (this.ammoChamber) this.ammoChamber.position.y = 0.88 + (this.currentAnimation === 'attack' ? Math.abs(Math.sin(t * 18)) * 0.02 : 0);
                }
                if (this.sensorArray && this.sensorArray.material) {
                    this.sensorArray.material.emissiveIntensity = 0.5 + Math.sin(t * 5) * 0.4;
                }
            } else if (this.variant === 'drone') {
                // Hover bob + spinning rotors + slight banking.
                let bob = Math.sin(t * 2.0) * 0.06;
                if (this.currentAnimation === 'attack') bob += Math.sin(t * 10) * 0.08;
                this.model.position.y = this._baseY + bob * this.scale;
                this.model.rotation.z = Math.sin(t * 1.5) * 0.06;
                const spin = t * 40;
                if (this.leftProp && this.leftProp._rotor) this.leftProp._rotor.rotation.y = spin;
                if (this.rightProp && this.rightProp._rotor) this.rightProp._rotor.rotation.y = -spin;
            } else {
                // Spherical: roll the shell + spin the spines; bob slightly.
                const roll = t * (this.currentAnimation === 'attack' ? 8 : 2.5);
                if (this.spinSpines && this.spinSpines.visible) this.spinSpines.rotation.y = roll;
                if (this.shell && this.shell.visible) this.shell.rotation.y = roll * 0.5;
                if (this.core && this.core.material) this.core.material.emissiveIntensity = 0.5 + Math.sin(t * 6) * 0.4;
                this.model.position.y = this._baseY + Math.sin(t * 2.2) * 0.04 * this.scale;
            }
        }

        deathPose(deltaTime) {
            const t = this.animTime;
            const prog = Math.min(1.0, t / 1.0);
            for (const mat of this._materials) mat.opacity = Math.min(mat.opacity, 1.0 - prog);
            if (this._baseY === null) this._baseY = this.model.position.y;
            // Drop and list to one side as it powers down.
            this.model.position.y = this._baseY - prog * 0.5 * this.scale;
            this.model.rotation.z = prog * 0.8;
        }
    }

    const make = (scale, offsetY, enemy, weaponType, key) =>
        new MechanicalBattler3D(scale, offsetY, enemy, weaponType, key);

    const reg = window.Battler3D.registerArchetype;
    reg('turret',    { aliases: ['turret', 'turrets', 'sentry'], scale: MECH_PROFILES.turret.scale, weapon: 0, create: make });
    reg('drone',     { aliases: ['drone', 'drones', 'quadcopter'], scale: MECH_PROFILES.drone.scale, weapon: 0, create: make });
    reg('spherical', { aliases: ['spherical', 'orb', 'sphere', 'spherebot'], scale: MECH_PROFILES.spherical.scale, weapon: 0, create: make });

    const S = MECH_PROFILES;
    reg('hydrokineticengine', { aliases: ['hydrokineticengine'], scale: S.hydrokineticengine.scale, weapon: 0, create: make });
    reg('neuralinterface',    { aliases: ['neuralinterface'],    scale: S.neuralinterface.scale,    weapon: 0, create: make });
    reg('prototurret',        { aliases: ['prototurret'],        scale: S.prototurret.scale,        weapon: 0, create: make });
    reg('quantumintellect',   { aliases: ['quantumintellect'],   scale: S.quantumintellect.scale,   weapon: 0, create: make });
    reg('frostbacktortoise',  { aliases: ['frostbacktortoise'],  scale: S.frostbacktortoise.scale,  weapon: 0, create: make });
    reg('brasssentinelmk4',   { aliases: ['brasssentinelmk4'],   scale: S.brasssentinelmk4.scale,   weapon: 0, create: make });
    reg('lv_toyturret',       { aliases: ['lv_toyturret'],       scale: S.lv_toyturret.scale,       weapon: 0, create: make });

    const NAMED = {
        hydrokineticengine: ["Hydrokinetic Engine"],
        neuralinterface:    ["Neural Interface"],
        prototurret:        ["Proto Turret"],
        quantumintellect:   ["Quantum Intellect"],
        frostbacktortoise:  ["Frostback Tortoise"],
        brasssentinelmk4:   ["Brass Sentinel Mk. IV"],
        lv_toyturret:       ["Toy Turret"]
    };
    if (window.Battler3D.registerNamed) {
        for (const key in NAMED) NAMED[key].forEach(n => window.Battler3D.registerNamed(n, key));
    }

    debugLog('Mechanical family registered');
})();
