//=============================================================================
// Weapon 3D Models - Firearms
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for firearms. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Firearms
 * ============================================================================
 *
 * One family per weapon type. This one owns every Gun weapon (wtypeId 9):
 * the generic silhouette the type falls back to, the note-tagged one-offs of
 * that type, and every bespoke per-weapon model in it.
 *
 * NOT listed in plugins.js. WeaponSystemProcedural.js injects this file at
 * runtime from its WEAPON3D_FAMILIES list, the same way 3DBattlerSystem.js
 * loads its 3DBattler_* families. Adding a model means adding a builder here
 * and, for a bespoke one, its database id to the unique map below.
 *
 * Every builder takes (weapon, rand) where rand is a seeded RNG derived from
 * the world's history seed, and returns a THREE.Group whose grip sits below
 * the origin with the weapon running along +Y. Shared construction helpers
 * (_plate, _bladeOutline, _hilt, _crossguard, _rivets, seg, wantsTrim, the
 * colour palettes and the material shorthands) live on WeaponSystemProcedural
 * itself, so they are available as `this` inside a builder.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.WeaponSystemProcedural) {
    console.error('[Weapon3D_Guns] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Guns',
    unique: {
      427: 'createSuctionCupDartGunModel',              // Suction Cup Dart Gun
      428: 'createUnreliablePistolModel',               // Unreliable Pistol
      429: 'createRustyRifleModel',                     // Rusty Rifle
      430: 'createSandFilledHoseModel',                 // Sand-Filled Hose
      431: 'createModifiedCapGunModel',                 // Modified Cap Gun
      432: 'createBikePumpAirGunModel',                 // Bike Pump Air Gun
      433: 'createPotatoCannonModel',                   // Potato Cannon
      434: 'createPipeGunModel',                        // Pipe Gun
      435: 'createPressureGunModel',                    // Pressure Gun
      436: 'createGardenSprayerFlamerModel',            // Garden Sprayer Flamer
      437: 'createRubbleLauncherModel',                 // Rubble Launcher
      438: 'createSeedGunModel',                        // Seed Gun
      439: 'createBambooBlowgunModel',                  // Bamboo Blowgun
      440: 'createSpudLauncherDeluxeModel',             // Spud Launcher Deluxe
      441: 'createFlintlockPistolModel',                // Flintlock Pistol
      442: 'createCombatantAnglerModel',                // Combatant Angler
      443: 'createWheellockPistolModel',                // Wheellock Pistol
      444: 'createPistolModel',                         // Pistol
      445: 'createMusketModel',                         // Musket
      446: 'createTShirtCannonModel',                   // Extreme T-Shirt Cannon
      447: 'createMatchlockMusketModel',                // Matchlock Musket
      448: 'createPepperboxRevolverModel',              // Pepperbox Revolver
      449: 'createDuelingPistolModel',                  // Dueling Pistol
      450: 'createFlintlockBlunderbussModel',        // Flintlock Blunderbuss
      451: 'createTaserRifleModel',                     // Taser Rifle
      452: 'createHandCannonModel',                     // Hand Cannon
      453: 'createRifledMusketModel',                   // Rifled Musket
      454: 'createPercussionRevolverModel',             // Percussion Revolver
      455: 'createBlunderbussModel',                    // Blunderbuss
      456: 'createNineMilPistolModel',                  // 9mm Pistol
      457: 'createRiotGunModel',                        // Riot Gun
      458: 'createBreechLoadingRifleModel',             // Breech-Loading Rifle
      459: 'createBubbasShotgunModel',                  // Bubba'sShotgun
      460: 'createShotgunPlainModel',                   // Shotgun
      461: 'createSixShooterModel',                     // Six-Shooter
      462: 'createLeverActionRifleModel',               // Lever Action Rifle
      463: 'createMilitaryBoltActionModel',             // Military Bolt-Action
      464: 'createGasLauncherModel',                    // Gas Launcher
      465: 'createDoubleBarrelShotgunModel',            // Double-Barrel Shotgun
      466: 'createTranquilizerRifleModel',              // Tranquilizer Rifle
      467: 'createSMGPlainModel',                       // SMG
      468: 'createBoltActionRifleModel',                // Bolt-Action Rifle
      469: 'createTommyGunModel',                       // Tommy Gun
      470: 'createAirPistolModel',                      // Air Pistol
      471: 'createVolleyGunModel',                      // Volley Gun
      472: 'createPDWModel',                            // PDW
      473: 'createParalyzerModel',                      // Paralyzer
      474: 'createCompactSMGModel',                     // Compact SMG
      475: 'createM1GarandModel',                       // M1 Garand
      476: 'createDoubleBarrelPistolModel',             // Double-Barrel Pistol           // Flintlock Blunderbuss
      477: 'createMP40Model',                           // MP40
      478: 'createAssaultRifleModel',                   // Assault Rifle
      479: 'createMagnumRevolverModel',                 // Magnum Revolver
      480: 'createGatlingGunModel',                     // Gatling Gun
      481: 'createAKSUModel',                           // AKS-74U
      482: 'createMatchGradePistolModel',               // Match Grade Pistol
      483: 'createM14Model',                            // M14 Battle Rifle
      484: 'createWaterJetCutterModel',                 // Water Jet Cutter
      485: 'createCombatShotgunModel',                  // Combat Shotgun
      486: 'createMotorGatlingModel',                   // Gatling Gun
      487: 'createModularCombatRifleModel',             // Modular Combat Rifle
      488: 'createGrenadeLauncherModel',                // Grenade Launcher
      489: 'createSniperRifleBespokeModel',             // Sniper Rifle
      490: 'createBullpupRifleModel',                   // Bullpup Rifle
      491: 'createFlamethrowerBespokeModel',            // Flamethrower
      492: 'createMarksmanRifleModel',                  // Marksman Rifle
      493: 'createTacticalCarbineModel',                // Tactical Carbine
      494: 'createTacticalShotgunModel',                // Tactical Shotgun
      495: 'createHeatRayModel',                        // Heat Ray
      496: 'createDMRModel',                            // DMR
      497: 'createHeavyMachineGunModel',                // Heavy Machine Gun
      498: 'createLaserRifleModel',                     // Laser Rifle
      499: 'createPlasmaRifleModel',                    // Plasma Rifle
      500: 'createCyberarmCannonModel',                 // Cyberarm Cannon
      501: 'createPrecisionRifleModel',                 // Precision Rifle
      502: 'createOpticalBeamSystemModel',              // Optical Beam System
      503: 'createLMGModel',                            // LMG
      504: 'createAntiMaterialRifleModel',              // Anti-Material Rifle
      505: 'createRPGModel',                            // RPG
      506: 'createSmartGrenadeLauncherModel',           // Smart Grenade Launcher
      507: 'createMicroMissileArrayModel',              // Micro-Missile Array
      508: 'createDisposableRocketModel',               // Disposable Rocket
      509: 'createHeavySniperModel',                    // Heavy Sniper
      510: 'createHMGModel',                            // HMG
      511: 'createBrainwaveAmplifierModel',             // Brainwave Amplifier
      512: 'createPolymorphicArsenalModel',             // Polymorphic Arsenal
      513: 'createMANPADSModel',                        // MANPADS
      514: 'createMindPiercerModel',                    // Mind Piercer
      515: 'createNeuralDisruptorModel',                // Neural Disruptor
      516: 'createCoilgunModel',                        // Coilgun
      517: 'createAntiMaterialBullpupModel',            // Anti-Material Rifle
      518: 'createRailgunPrototypeModel',               // Railgun Prototype
      519: 'createHeadacheInducerModel',                // EHI Headache Inducer
      520: 'createCrudeProjectorModel',                 // EHI Crude Projector
      521: 'createMinigunBespokeModel',                 // Minigun
      522: 'createAdaptiveCombatAIModel',               // Adaptive Combat AI
      523: 'createThoughtProjectorModel',               // Thought Projector
      524: 'createMemeticRifleModel',                   // EHI Memetic Rifle
      525: 'createVectorGunModel',                      // Vector gun
      526: 'createVarleniaBeamRifleModel',              // Varlenia Beam Rifle
      527: 'createRealityDistortionCannonModel',        // Reality Distortion Cannon
      528: 'createSmartTrackingRifleModel',             // Smart Tracking Rifle
    },
    models: {
      // Type 9: Gun.
      //
      // Built from a real parts list rather than a handful of fixed
      // silhouettes: receiver, barrel and muzzle device, handguard, action,
      // fire control, grip, feed, furniture and optic are each modelled and
      // assembled per weapon, so two rifles of the same class still differ in
      // barrel length, handguard style, magazine, stock and sight.
      //
      // The parts that MOVE when it is fired carry a `userData.gun` tag
      // (trigger, hammer, slide/bolt/charging, cylinder, shell, muzzle). The
      // core keeps those out of the static mesh merge, drives them from
      // tickGun, and hangs the muzzle flash off the muzzle tag; everything
      // else collapses into a few draw calls.
      createGunModel(weapon, rand) {
        const group = new THREE.Group();
        const cls = this.gunClassOf(weapon);
        const m = this.weightOf(weapon);

        const parkerised = this.getRandomColor(rand, [0x24262A, 0x2E3238, 0x3A3F45, 0x1C1E22]);
        const accent = this.getRandomColor(rand, [0x6E7378, 0x8A8F95, 0x4A4F55, 0x2A2E34]);
        const furnitureColor = this.getRandomColor(rand, [0x2A2C30, 0x4A3A28, 0x2E3A2A, 0x1A1A1E]);

        const steel = this._mat(parkerised, { roughness: 0.5, metalness: 0.85 });
        const bright = this._mat(accent, { roughness: 0.32, metalness: 0.92 });
        const polymer = this._mat(furnitureColor, { roughness: 0.78, metalness: 0.06 });
        const rubber = this._mat(0x141416, { roughness: 0.95, metalness: 0.02 });
        const brass = this._cast(0xC9A227);
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });

        // ── Proportions, from the class and the weight tag ────────────────
        const long = cls === 'rifle' || cls === 'sniper' || cls === 'shotgun';
        const barrelLen = (cls === 'sniper' ? 0.42 : long ? 0.32 : cls === 'smg' ? 0.2 : 0.15) + rand() * 0.05;
        const cal = (cls === 'shotgun' ? 0.017 : cls === 'sniper' ? 0.011 : 0.009) + rand() * 0.002;
        const recvLen = long ? 0.2 : 0.13;
        const heavy = m >= 4000;

        // ── Receiver: an upper and a lower, with the seam between them ─────
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, recvLen), steel);
        upper.position.set(0, 0.014, 0.01);
        group.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.042, recvLen * 0.8), cls === 'rifle' || cls === 'smg' ? polymer : steel);
        lower.position.set(0, -0.024, 0.0);
        group.add(lower);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.004, recvLen * 0.9), bright);
        seam.position.set(0, -0.008, 0.008);
        group.add(seam);
        // Takedown pins.
        for (const z of [recvLen * 0.34, -recvLen * 0.3]) {
          const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, this.seg(8, 5)), bright);
          pin.rotation.z = Math.PI / 2;
          pin.position.set(0, -0.018, z);
          group.add(pin);
        }
        // Ejection port, cut into the right side.
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.045), rubber);
        port.position.set(0.019, 0.02, 0.03);
        group.add(port);
        const deflector = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.016), steel);
        deflector.position.set(0.02, 0.03, 0.008);
        deflector.rotation.z = -0.4;
        group.add(deflector);

        // ── Barrel, gas system and muzzle device ──────────────────────────
        const barrelZ = recvLen * 0.5 + barrelLen / 2 + 0.01;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(cal * 1.5, cal * 1.7, barrelLen, this.seg(10, 6)), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.022, barrelZ);
        group.add(barrel);
        if (cls === 'shotgun' && rand() > 0.5) {
          // Side-by-side second tube.
          const under = new THREE.Mesh(new THREE.CylinderGeometry(cal * 1.3, cal * 1.4, barrelLen * 0.92, this.seg(9, 6)), steel);
          under.rotation.x = Math.PI / 2;
          under.position.set(0, 0.022 - cal * 2.6, barrelZ - 0.01);
          group.add(under);
        }
        if (!long && cls !== 'revolver') {
          // Recoil spring tube under a pistol's barrel.
          const guide = new THREE.Mesh(new THREE.CylinderGeometry(cal * 0.7, cal * 0.7, barrelLen * 0.8, this.seg(8, 5)), bright);
          guide.rotation.x = Math.PI / 2;
          guide.position.set(0, 0.008, barrelZ - 0.01);
          group.add(guide);
        }
        if (long) {
          const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.03), bright);
          gasBlock.position.set(0, 0.026, barrelZ + barrelLen * 0.18);
          group.add(gasBlock);
          const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, barrelLen * 0.5, this.seg(7, 5)), bright);
          gasTube.rotation.x = Math.PI / 2;
          gasTube.position.set(0, 0.04, barrelZ - barrelLen * 0.05);
          group.add(gasTube);
        }

        // Muzzle device: this is also where the flash is hung.
        const muzzle = new THREE.Group();
        muzzle.position.set(0, 0.022, barrelZ + barrelLen / 2 + 0.02);
        muzzle.userData.gun = 'muzzle';
        const device = Math.floor(rand() * 3);
        if (device === 0) {
          // Compensator, with its ports cut through the top.
          const body = new THREE.Mesh(new THREE.CylinderGeometry(cal * 2.1, cal * 2.1, 0.04, this.seg(9, 6)), bright);
          body.rotation.x = Math.PI / 2;
          muzzle.add(body);
          for (let i = 0; i < 3; i++) {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(cal * 3, 0.004, 0.005), rubber);
            slot.position.set(0, cal * 1.6, -0.012 + i * 0.011);
            muzzle.add(slot);
          }
        } else if (device === 1) {
          // Prong flash hider.
          const cage = new THREE.Mesh(new THREE.CylinderGeometry(cal * 2.0, cal * 1.7, 0.045, this.seg(9, 6), 1, true), bright);
          cage.rotation.x = Math.PI / 2;
          muzzle.add(cage);
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            const gap = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.03), rubber);
            gap.position.set(Math.cos(a) * cal * 1.9, Math.sin(a) * cal * 1.9, 0.006);
            muzzle.add(gap);
          }
        } else {
          // Suppressor: long, plain, and it makes the whole gun read heavier.
          const can = new THREE.Mesh(new THREE.CylinderGeometry(cal * 2.6, cal * 2.6, 0.11, this.seg(10, 6)), steel);
          can.rotation.x = Math.PI / 2;
          can.position.z = 0.04;
          muzzle.add(can);
          for (let i = 0; i < 4; i++) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(cal * 2.65, 0.0022, this.seg(4, 3), this.seg(10, 6)), rubber);
            rib.position.z = 0.005 + i * 0.024;
            muzzle.add(rib);
          }
        }
        group.add(muzzle);

        // ── Handguard / forend ────────────────────────────────────────────
        if (long || cls === 'smg') {
          const hgLen = barrelLen * 0.62;
          const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.024, hgLen, this.seg(9, 6)), polymer);
          hg.rotation.x = Math.PI / 2;
          hg.position.set(0, 0.02, barrelZ - barrelLen * 0.16);
          group.add(hg);
          // Vent slots or M-LOK cuts down both sides.
          if (this.wantsTrim()) {
            for (let i = 0; i < 5; i++) {
              for (const s of [-1, 1]) {
                const cut = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.016), rubber);
                cut.position.set(s * 0.021, 0.02, barrelZ - hgLen * 0.42 + i * (hgLen * 0.2));
                group.add(cut);
              }
            }
          }
          // Top rail.
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, recvLen + hgLen * 0.8), bright);
          rail.position.set(0, 0.042, 0.04);
          group.add(rail);
          if (this.wantsTrim()) {
            for (let i = 0; i < 7; i++) {
              const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.004, 0.004), steel);
              tooth.position.set(0, 0.046, -0.03 + i * 0.026);
              group.add(tooth);
            }
          }
        }

        // ── Action: what actually moves ───────────────────────────────────
        if (cls === 'revolver') {
          const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, this.seg(12, 7)), bright);
          cylinder.rotation.x = Math.PI / 2;
          cylinder.position.set(0, 0.012, 0.012);
          cylinder.userData.gun = 'cylinder';
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.052, this.seg(8, 5)), rubber);
            chamber.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, 0);
            cylinder.add(chamber);
            const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, this.seg(8, 5)), brass);
            rim.position.set(Math.cos(a) * 0.017, Math.sin(a) * 0.017, -0.026);
            cylinder.add(rim);
          }
          group.add(cylinder);
          const crane = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, this.seg(7, 5)), bright);
          crane.rotation.x = Math.PI / 2;
          crane.position.set(0, 0.012, 0.012);
          group.add(crane);
          const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.012), bright);
          hammer.position.set(0, 0.042, -recvLen * 0.42);
          hammer.userData.gun = 'hammer';
          group.add(hammer);
          const spur = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.014), bright);
          spur.position.set(0, 0.054, -recvLen * 0.46);
          hammer.add(spur);
        } else if (long || cls === 'smg') {
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.05), bright);
          bolt.position.set(0.02, 0.026, 0.03);
          bolt.userData.gun = 'bolt';
          group.add(bolt);
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, this.seg(7, 5)), bright);
          handle.rotation.z = Math.PI / 2;
          handle.position.set(0.014, 0, 0);
          bolt.add(handle);
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), rubber);
          knob.position.set(0.028, 0, 0);
          bolt.add(knob);
        } else {
          const slide = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.03, recvLen * 1.5), steel);
          slide.position.set(0, 0.03, 0.03);
          slide.userData.gun = 'slide';
          group.add(slide);
          // Cocking serrations at the rear.
          if (this.wantsTrim()) {
            for (let i = 0; i < 6; i++) {
              const serr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.003), rubber);
              serr.position.set(0, 0, -recvLen * 0.6 + i * 0.008);
              slide.add(serr);
            }
          }
          const rear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.008), bright);
          rear.position.set(0, 0.018, -recvLen * 0.62);
          slide.add(rear);
        }

        // The case on its way out, hidden until a round is fired.
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(cal * 1.2, cal * 1.2, cal * 4, this.seg(8, 5)), brass);
        shell.rotation.z = Math.PI / 2;
        shell.position.set(0.026, 0.024, 0.03);
        shell.visible = false;
        shell.userData.gun = 'shell';
        group.add(shell);

        // ── Fire control ──────────────────────────────────────────────────
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.1), steel);
        guard.position.set(0, -0.032, -0.012);
        guard.rotation.set(0, Math.PI / 2, -0.35);
        group.add(guard);
        const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.006), bright);
        trigger.position.set(0, -0.03, -0.008);
        trigger.userData.gun = 'trigger';
        group.add(trigger);
        const selector = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(7, 5)), bright);
        selector.rotation.z = Math.PI / 2;
        selector.position.set(0, -0.012, -recvLen * 0.34);
        group.add(selector);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.005), bright);
        lever.position.set(-0.016, -0.018, -recvLen * 0.34);
        lever.rotation.z = 0.5;
        group.add(lever);

        // ── Grip ──────────────────────────────────────────────────────────
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.095, 0.038), polymer);
        grip.position.set(0, -0.078, -0.03);
        grip.rotation.x = long ? 0.12 : Math.PI / 8;
        group.add(grip);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.006), rubber);
            panel.position.set(0, -0.05 - i * 0.018, -0.048 - i * 0.002);
            group.add(panel);
          }
        }
        const beaver = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.02), steel);
        beaver.position.set(0, -0.034, -recvLen * 0.44);
        group.add(beaver);

        // ── Feed ──────────────────────────────────────────────────────────
        if (cls !== 'revolver') {
          const drum = cls === 'smg' && rand() > 0.55;
          if (drum) {
            const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.022, this.seg(14, 8)), steel);
            pan.position.set(0, -0.07, -0.005);
            group.add(pan);
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.026, this.seg(9, 6)), bright);
            hub.position.set(0, -0.07, -0.005);
            group.add(hub);
          } else {
            const magLen = long ? 0.11 : 0.075;
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, magLen, 0.03), cls === 'sniper' ? steel : polymer);
            mag.position.set(0, -0.032 - magLen / 2, -0.004);
            mag.rotation.x = long ? -0.12 : 0;
            mag.userData.gun = 'magazine';
            group.add(mag);
            const floor = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.034), rubber);
            floor.position.set(0, -0.034 - magLen, -0.004);
            group.add(floor);
            const catchBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, this.seg(7, 5)), bright);
            catchBtn.rotation.z = Math.PI / 2;
            catchBtn.position.set(0.017, -0.03, 0.0);
            group.add(catchBtn);
          }
        }

        // ── Furniture ─────────────────────────────────────────────────────
        if (long || (cls === 'smg' && rand() > 0.5)) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, this.seg(9, 6)), steel);
          tube.rotation.x = Math.PI / 2;
          tube.position.set(0, 0.006, -recvLen * 0.5 - 0.045);
          group.add(tube);
          const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.09), polymer);
          stock.position.set(0, 0.0, -recvLen * 0.5 - 0.07);
          group.add(stock);
          const comb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.07), polymer);
          comb.position.set(0, 0.03, -recvLen * 0.5 - 0.065);
          group.add(comb);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.056, 0.012), rubber);
          pad.position.set(0, 0.0, -recvLen * 0.5 - 0.118);
          group.add(pad);
          const sling = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(9, 6)), bright);
          sling.position.set(0.016, -0.014, -recvLen * 0.5 - 0.06);
          sling.rotation.y = Math.PI / 2;
          group.add(sling);
        }

        // ── Sights ────────────────────────────────────────────────────────
        const optic = cls === 'sniper' ? 2 : Math.floor(rand() * 3);
        if (optic === 2) {
          const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.14, this.seg(12, 7)), steel);
          scope.rotation.x = Math.PI / 2;
          scope.position.set(0, 0.062, 0.03);
          group.add(scope);
          const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.019, 0.03, this.seg(12, 7)), steel);
          bell.rotation.x = Math.PI / 2;
          bell.position.set(0, 0.062, 0.105);
          group.add(bell);
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, this.seg(12, 7)), glass);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(0, 0.062, 0.12);
          group.add(lens);
          for (const z of [0.075, -0.01]) {
            const ring = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.012), bright);
            ring.position.set(0, 0.052, z);
            group.add(ring);
          }
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, this.seg(9, 6)), bright);
          turret.position.set(0, 0.08, 0.04);
          group.add(turret);
        } else if (optic === 1) {
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.05), steel);
          body.position.set(0, 0.062, 0.04);
          group.add(body);
          const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.002), glass);
          window_.position.set(0, 0.064, 0.065);
          group.add(window_);
          const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.03), bright);
          mount.position.set(0, 0.05, 0.04);
          group.add(mount);
        } else {
          const front = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.005), bright);
          front.position.set(0, 0.038, barrelZ + barrelLen * 0.34);
          group.add(front);
          const hood = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.002, this.seg(4, 3), this.seg(9, 6), Math.PI), bright);
          hood.position.set(0, 0.036, barrelZ + barrelLen * 0.34);
          hood.rotation.x = Math.PI / 2;
          group.add(hood);
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.005), bright);
          notch.position.set(0, 0.044, -recvLen * 0.3);
          group.add(notch);
        }

        // ── Accessories, on the heavier weapons that can carry them ───────
        if (heavy && this.wantsTrim()) {
          const laser = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.036), steel);
          laser.position.set(-0.024, 0.016, barrelZ - barrelLen * 0.2);
          group.add(laser);
          const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, this.seg(7, 5)), this._glow(0xFF2A2A, 0.9));
          emitter.rotation.x = Math.PI / 2;
          emitter.position.set(-0.024, 0.016, barrelZ - barrelLen * 0.2 + 0.02);
          group.add(emitter);
          const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.05, this.seg(9, 6)), polymer);
          foregrip.position.set(0, -0.008, barrelZ - barrelLen * 0.22);
          foregrip.rotation.x = 0.18;
          group.add(foregrip);
        }

        return group;
      },

      // <RocketLauncher>, Shoulder-mounted tube launcher with exhaust
      createRocketLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const tubeMat    = new THREE.MeshStandardMaterial({ color: 0x2A3A2A, roughness: 0.6, metalness: 0.5 });
        const metalMat   = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.75 });
        const gripMat    = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 });
        const warheadMat = new THREE.MeshStandardMaterial({ color: 0x886633, roughness: 0.5, metalness: 0.3 });

        const tubeR = 0.025, tubeL = 0.28;
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, tubeL, 10), tubeMat);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0);
        group.add(tube);

        // Muzzle rim
        const muzzleRim = new THREE.Mesh(new THREE.TorusGeometry(tubeR * 1.05, 0.005, 6, 12), metalMat);
        muzzleRim.rotation.x = Math.PI / 2;
        muzzleRim.position.set(0, 0.02, tubeL / 2);
        group.add(muzzleRim);

        // Back exhaust cone
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(tubeR * 1.4, tubeR, 0.05, 10), tubeMat);
        exhaust.rotation.x = -Math.PI / 2;
        exhaust.position.set(0, 0.02, -tubeL / 2 - 0.025);
        group.add(exhaust);

        // Pistol grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.03), gripMat);
        grip.position.set(0, -0.055, 0.02);
        grip.rotation.x = Math.PI / 10;
        group.add(grip);

        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 8, Math.PI), metalMat);
        trig.position.set(0, -0.01, 0.02);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Shoulder rest
        const shoulderPad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), gripMat);
        shoulderPad.position.set(0, 0.015, -tubeL / 2 - 0.045);
        group.add(shoulderPad);

        // Top carry handle
        const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.025, 0.055), tubeMat);
        topHandle.position.set(0, 0.06, 0.04);
        group.add(topHandle);

        // Rocket tip visible at muzzle
        const rocketTip = new THREE.Mesh(new THREE.ConeGeometry(tubeR * 0.8, 0.04, 8), warheadMat);
        rocketTip.rotation.x = Math.PI / 2;
        rocketTip.position.set(0, 0.02, tubeL / 2 + 0.02);
        group.add(rocketTip);

        // Sight rail
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.12), metalMat);
        rail.position.set(0, 0.055, 0.04);
        group.add(rail);
        return group;
      },

      // <Minigun>, Six-barrel rotating gatling cannon
      createMinigunModel(weapon, rand) {
        const group = new THREE.Group();
        const metalMat  = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.80 });
        const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.5, metalness: 0.60 });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.90 });
        const gripMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9  });

        // Central housing
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.15, 12), darkMat);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(0, 0.02, 0);
        group.add(housing);

        // Six barrels
        const numBarrels = 6, barrelOffset = 0.03, barrelL = 0.22;
        for (let i = 0; i < numBarrels; i++) {
          const angle = (i / numBarrels) * Math.PI * 2;
          const bx = Math.cos(angle) * barrelOffset;
          const by = Math.sin(angle) * barrelOffset;
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, barrelL, 6), accentMat);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(bx, 0.02 + by, barrelL / 2 + 0.075);
          group.add(barrel);
          const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.014, 6), metalMat);
          muzzle.rotation.x = Math.PI / 2;
          muzzle.position.set(bx, 0.02 + by, barrelL + 0.075 + 0.007);
          group.add(muzzle);
        }

        // Front barrel cage
        const frontRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 12), metalMat);
        frontRing.rotation.x = Math.PI / 2;
        frontRing.position.set(0, 0.02, 0.075);
        group.add(frontRing);

        // Rear motor housing
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), darkMat);
        motor.rotation.x = Math.PI / 2;
        motor.position.set(0, 0.02, -0.12);
        group.add(motor);

        // Dual grips
        const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.025), gripMat);
        handleL.position.set(-0.05, -0.035, 0);
        handleL.rotation.x = Math.PI / 12;
        group.add(handleL);
        const handleR = handleL.clone();
        handleR.position.x = 0.05;
        group.add(handleR);

        // Ammo feed
        const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.09, 6), darkMat);
        feed.rotation.z = Math.PI / 4;
        feed.position.set(0.07, -0.02, -0.05);
        group.add(feed);
        return group;
      },

      // <Flamethrower>, Tank body + hose + barrel + flame cone
      createFlamethrowerModel(weapon, rand) {
        const group = new THREE.Group();
        const tankMat   = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.5, metalness: 0.60 });
        const hoseMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.10 });
        const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.35, metalness: 0.85 });
        const gripMat   = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9  });
        const fireMat   = new THREE.MeshStandardMaterial({ color: 0xFF4400, emissive: 0xFF2200, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 });
        const outerFire = new THREE.MeshStandardMaterial({ color: 0xFF8800, emissive: 0xFF4400, emissiveIntensity: 0.6, transparent: true, opacity: 0.5  });

        // Fuel tank
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10), tankMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, 0.01, -0.10);
        group.add(tank);
        // Pressure gauge
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), nozzleMat);
        gauge.position.set(0.04, 0.03, -0.10);
        group.add(gauge);

        // Hose (curved)
        const hoseCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0.01, -0.02),
          new THREE.Vector3(0, -0.04, 0.03),
          new THREE.Vector3(0, 0.01, 0.07)
        );
        group.add(new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 8, 0.008, 6, false), hoseMat));

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.15, 8), nozzleMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.01, 0.16);
        group.add(barrel);

        // Nozzle
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, 8), nozzleMat);
        nozzle.rotation.x = -Math.PI / 2;
        nozzle.position.set(0, 0.01, 0.265);
        group.add(nozzle);

        // Grip + trigger guard
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.075, 0.03), gripMat);
        grip.position.set(0, -0.048, 0.06);
        grip.rotation.x = Math.PI / 10;
        group.add(grip);
        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, 4, 8, Math.PI), nozzleMat);
        trig.position.set(0, -0.006, 0.06);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Flame cones
        const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.065, 8), fireMat);
        flameCore.rotation.x = -Math.PI / 2;
        flameCore.position.set(0, 0.01, 0.325);
        group.add(flameCore);
        const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.10, 8), outerFire);
        flameOuter.rotation.x = -Math.PI / 2;
        flameOuter.position.set(0, 0.01, 0.345);
        group.add(flameOuter);
        return group;
      },

      // <Shotgun>, Pump-action or double-barrel shotgun
      createShotgunModel(weapon, rand) {
        const group = new THREE.Group();
        const metalColor = this.getRandomColor(rand, [0x222222, 0x444444, 0x666666]);
        const woodColor  = this.getRandomColor(rand, this.handleColors);
        const metalMat = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.8 });
        const woodMat  = new THREE.MeshStandardMaterial({ color: woodColor,  roughness: 0.85 });
        const gripMat  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A,   roughness: 0.9  });

        const isDouble = rand() > 0.45;
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.045, 0.09), metalMat);
        receiver.position.set(0, 0.012, -0.02);
        group.add(receiver);

        if (isDouble) {
          const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.009, 0.22, 8), metalMat);
          b1.rotation.x = Math.PI / 2;
          b1.position.set(0.009, 0.012, 0.135);
          group.add(b1);
          const b2 = b1.clone();
          b2.position.x = -0.009;
          group.add(b2);
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.22), metalMat);
          rib.position.set(0, 0.017, 0.135);
          group.add(rib);
        } else {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.24, 8), metalMat);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(0, 0.012, 0.155);
          group.add(barrel);
          // Pump slide
          const slide = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.06), woodMat);
          slide.position.set(0, 0.004, 0.12);
          group.add(slide);
        }

        // Wood stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.042, 0.16), woodMat);
        stock.position.set(0, 0.01, -0.16);
        stock.rotation.x = -Math.PI / 28;
        group.add(stock);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.06), woodMat);
        cheek.position.set(0, 0.035, -0.17);
        group.add(cheek);

        // Pistol grip + trigger guard
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.07, 0.03), woodMat);
        grip.position.set(0, -0.04, -0.04);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 8, Math.PI), metalMat);
        trig.position.set(0, -0.008, 0);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Front bead sight
        const sight = new THREE.Mesh(new THREE.SphereGeometry(0.004, 4, 4), metalMat);
        sight.position.set(0, 0.024, isDouble ? 0.24 : 0.27);
        group.add(sight);
        return group;
      },

      // <SniperRifle>, Long-barrel precision rifle with scope + bipod
      createSniperRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const metalMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.80 });
        const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.5, metalness: 0.60 });
        const gripMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9  });
        const scopeMat  = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.85 });
        const lensMat   = new THREE.MeshStandardMaterial({ color: 0x113355, roughness: 0.05, emissive: 0x001133, emissiveIntensity: 0.3 });

        // Very long barrel
        const barrelL = 0.35;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, barrelL, 8), metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.015, barrelL / 2 + 0.04);
        group.add(barrel);

        // Muzzle brake with slots
        const muzzleBrake = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.025, 8), metalMat);
        muzzleBrake.rotation.x = Math.PI / 2;
        muzzleBrake.position.set(0, 0.015, barrelL + 0.055);
        group.add(muzzleBrake);
        for (let i = 0; i < 3; i++) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.006), darkMat);
          slot.position.set(0, 0.029, barrelL + 0.04 + i * 0.007);
          group.add(slot);
        }

        // Receiver
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.10), metalMat);
        receiver.position.set(0, 0.012, 0.01);
        group.add(receiver);

        // Bolt handle
        const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.035, 6), metalMat);
        boltBody.rotation.z = Math.PI / 2;
        boltBody.position.set(0.035, 0.015, 0.025);
        group.add(boltBody);
        const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), metalMat);
        boltKnob.position.set(0.05, 0.015, 0.025);
        group.add(boltKnob);

        // Long stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.035, 0.20), gripMat);
        stock.position.set(0, 0.01, -0.155);
        stock.rotation.x = -Math.PI / 30;
        group.add(stock);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.07), gripMat);
        cheek.position.set(0, 0.036, -0.14);
        group.add(cheek);

        // Pistol grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.065, 0.028), gripMat);
        grip.position.set(0, -0.038, -0.04);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);

        // Scope tube
        const scopeL = 0.14;
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, scopeL, 10), scopeMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.054, 0);
        group.add(scope);
        // Lenses
        const frontLens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), lensMat);
        frontLens.position.set(0, 0.054, scopeL / 2);
        group.add(frontLens);
        const rearLens = frontLens.clone();
        rearLens.rotation.y = Math.PI;
        rearLens.position.set(0, 0.054, -scopeL / 2);
        group.add(rearLens);
        // Turret dials
        const turretT = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 6), scopeMat);
        turretT.position.set(0, 0.072, 0.005);
        group.add(turretT);
        const turretS = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 6), scopeMat);
        turretS.rotation.z = Math.PI / 2;
        turretS.position.set(0.03, 0.054, 0.005);
        group.add(turretS);

        // Bipod legs
        for (let side = -1; side <= 1; side += 2) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.04, 0.004), metalMat);
          leg.position.set(side * 0.012, -0.01, 0.22);
          leg.rotation.z = side * Math.PI / 12;
          group.add(leg);
        }

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.055, 0.018), darkMat);
        mag.position.set(0, -0.04, 0.01);
        group.add(mag);
        return group;
      },

      // <SMG>, Compact submachine gun with foregrip and folded stock
      createSMGModel(weapon, rand) {
        const group = new THREE.Group();
        const bodyColor   = this.getRandomColor(rand, [0x222222, 0x333333, 0x1A1A2A, 0x2D3A2A]);
        const accentColor = this.getRandomColor(rand, [0x444444, 0x555555, 0xAAAAAA]);
        const bodyMat   = new THREE.MeshStandardMaterial({ color: bodyColor,   roughness: 0.5, metalness: 0.75 });
        const metalMat  = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.35, metalness: 0.85 });
        const gripMat   = new THREE.MeshStandardMaterial({ color: 0x1A1A1A,    roughness: 0.9  });

        // Compact receiver
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.12), bodyMat);
        body.position.set(0, 0.01, -0.01);
        group.add(body);

        // Short barrel + muzzle
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.08, 8), metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.015, 0.10);
        group.add(barrel);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.012, 8), metalMat);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.015, 0.15);
        group.add(muzzle);

        // Angled pistol grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.032), gripMat);
        grip.position.set(0, -0.047, -0.01);
        grip.rotation.x = Math.PI / 10;
        group.add(grip);

        // Trigger guard
        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, 4, 8, Math.PI), metalMat);
        trig.position.set(0, -0.008, 0.02);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Vertical foregrip
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 0.018), gripMat);
        foregrip.position.set(0, -0.038, 0.07);
        foregrip.rotation.x = -Math.PI / 14;
        group.add(foregrip);

        // Tall box magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.085, 0.02), bodyMat);
        mag.position.set(0, -0.05, -0.025);
        group.add(mag);

        // Folded wire stock
        const stockH = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.065), metalMat);
        stockH.position.set(0, 0.01, -0.10);
        group.add(stockH);
        const stockV = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.035, 0.008), metalMat);
        stockV.position.set(0, -0.008, -0.13);
        group.add(stockV);

        // Iron sight post
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.01, 0.006), metalMat);
        frontSight.position.set(0, 0.04, 0.14);
        group.add(frontSight);
        return group;
      },

      // <Railgun>, Electromagnetic accelerator with coil rings
      createRailgunModel(weapon, rand) {
        const group = new THREE.Group();
        const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.45, metalness: 0.85 });
        const railMat  = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.2,  metalness: 0.95 });
        const coilMat  = new THREE.MeshStandardMaterial({ color: 0x00AAFF, roughness: 0.3,  metalness: 0.6, emissive: 0x0033FF, emissiveIntensity: 0.4 });
        const capMat   = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.4,  metalness: 0.8 });
        const gripMat  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        // Barrel housing
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.38, 8), bodyMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.06);
        group.add(barrel);

        // Parallel rail bars
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.38), railMat);
          rail.position.set(side * 0.018, 0.02 + side * 0.012, 0.06);
          group.add(rail);
        }

        // Electromagnetic coil rings (6 spaced along barrel)
        for (let i = 0; i < 6; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), coilMat);
          coil.rotation.y = Math.PI / 2;
          coil.position.set(0, 0.02, -0.12 + i * 0.065);
          group.add(coil);
        }

        // Power capacitor bank on top
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.02, 0.09), capMat);
        cap.position.set(0, 0.044, 0.02);
        group.add(cap);

        // Receiver body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.038, 0.1), bodyMat);
        body.position.set(0, 0.02, -0.07);
        group.add(body);

        // Pistol grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.07, 0.03), gripMat);
        grip.position.set(0, -0.028, -0.06);
        grip.rotation.x = Math.PI / 12;
        group.add(grip);

        // Trigger guard
        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 4, 8, Math.PI), railMat);
        trig.position.set(0, -0.006, -0.04);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Bipod legs at front
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.06, 5), railMat);
          leg.position.set(side * 0.022, -0.012, 0.16);
          leg.rotation.z = side * 0.55;
          group.add(leg);
        }

        // Muzzle brake
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.022, 8), railMat);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.02, 0.26);
        group.add(muzzle);

        // Scope
        const scopeBody = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.07, 8), bodyMat);
        scopeBody.rotation.x = Math.PI / 2;
        scopeBody.position.set(0, 0.057, 0.01);
        group.add(scopeBody);
        const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.005, 8), coilMat);
        scopeLens.rotation.x = Math.PI / 2;
        scopeLens.position.set(0, 0.057, 0.048);
        group.add(scopeLens);

        return group;
      },

      // <ArmCannon>, Cybernetic forearm-mounted weapon platform
      createArmCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const bodyColor = this.getRandomColor(rand, [0x223344, 0x332233, 0x223322, 0x443322]);
        const bodyMat   = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4,  metalness: 0.85 });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x8899AA,  roughness: 0.2,  metalness: 0.95 });
        const energyMat = new THREE.MeshStandardMaterial({ color: 0x00EEFF,  roughness: 0.1,  metalness: 0.3, emissive: 0x00AACC, emissiveIntensity: 0.6 });
        const darkMat   = new THREE.MeshStandardMaterial({ color: 0x111111,  roughness: 0.9 });

        // Forearm cuff (wide flat body)
        const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.065, 0.22), bodyMat);
        group.add(cuff);

        // Rounded edge cylinders
        for (const side of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.22, 8), bodyMat);
          edge.rotation.x = Math.PI / 2;
          edge.position.set(side * 0.055, 0, 0);
          group.add(edge);
        }

        // Main barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10), accentMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.01, 0.155);
        group.add(barrel);

        // Barrel energy ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 16), energyMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(0, 0.01, 0.195);
        group.add(ring);

        // Energy cell on back
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.06, 8), energyMat);
        cell.rotation.x = Math.PI / 2;
        cell.position.set(0, 0.01, -0.13);
        group.add(cell);

        // Vent slats on top
        for (let i = 0; i < 4; i++) {
          const vent = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.005, 0.012), darkMat);
          vent.position.set(0, 0.035, -0.04 + i * 0.022);
          group.add(vent);
        }

        // Side panel accents
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.045, 0.14), accentMat);
          panel.position.set(side * 0.052, 0.005, 0.02);
          group.add(panel);
        }

        return group;
      },

      // ============================================================
      // Shared firearm parts
      // ============================================================
      // Every bespoke gun below is assembled out of these plus its own
      // distinguishing pieces. They tag the parts that move (see tickGun in
      // WeaponSystemProcedural), so a builder never animates anything itself.

      /** Trigger and guard, tagged so the finger actually pulls it. */
      _gunTrigger(group, mat, x, y, z, opts) {
        const o = opts || {};
        const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.005, o.long ? 0.026 : 0.02, 0.006), mat);
        trigger.position.set(x, y, z);
        if (o.curl) trigger.rotation.x = o.curl;
        trigger.userData.gun = 'trigger';
        group.add(trigger);
        if (o.guard !== false) {
          const guard = new THREE.Mesh(
            new THREE.TorusGeometry(o.guardR || 0.018, 0.0035, this.seg(5, 4), this.seg(12, 7), Math.PI * (o.guardArc || 1.1)), mat);
          guard.position.set(x, y - 0.004, z - 0.002);
          guard.rotation.set(0, Math.PI / 2, o.guardTilt === undefined ? -0.35 : o.guardTilt);
          group.add(guard);
        }
        return trigger;
      },

      /**
       * A black-powder lock: the cock that swings, its jaws, the pan and
       * frizzen it strikes, and the plate they all sit on. `kind` picks
       * matchlock / wheellock / flintlock / percussion.
       */
      _gunLock(group, steel, brass, kind, x, y, z) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.032, 0.06), steel);
        plate.position.set(x + 0.016, y, z);
        group.add(plate);

        const cock = new THREE.Group();
        cock.position.set(x + 0.018, y + 0.012, z - 0.012);
        cock.userData.gun = 'hammer';
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.008), steel);
        arm.position.y = 0.012;
        cock.add(arm);
        if (kind === 'percussion') {
          const nose = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.012), steel);
          nose.position.set(0, 0.03, 0.008);
          cock.add(nose);
        } else if (kind === 'matchlock') {
          const serpentine = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(10, 6), Math.PI), steel);
          serpentine.position.y = 0.026;
          serpentine.rotation.y = Math.PI / 2;
          cock.add(serpentine);
          const match = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.05, this.seg(6, 4)), this._wood(0x3A2A1C));
          match.position.set(0, 0.04, 0.014);
          match.rotation.x = 0.6;
          cock.add(match);
          const coal = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), this._glow(0xFF5A1A, 1.1));
          coal.position.set(0, 0.055, 0.028);
          coal.userData.pulse = { min: 0.4, max: 1.3, freq: 1.2 };
          cock.add(coal);
        } else {
          // Flint held between two jaws, with the screw that clamps them.
          const jawLower = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.014), steel);
          jawLower.position.set(0, 0.028, 0.004);
          cock.add(jawLower);
          const flint = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.012), this._mat(0x3A3A3E, { roughness: 0.6, metalness: 0.2 }));
          flint.position.set(0, 0.036, 0.006);
          cock.add(flint);
          const jawUpper = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.005, 0.014), steel);
          jawUpper.position.set(0, 0.043, 0.004);
          cock.add(jawUpper);
          const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.016, this.seg(6, 4)), brass);
          screw.position.set(0, 0.038, -0.008);
          screw.rotation.x = Math.PI / 2;
          cock.add(screw);
        }
        group.add(cock);

        if (kind !== 'percussion') {
          const pan = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.014), brass);
          pan.position.set(x + 0.016, y + 0.014, z + 0.012);
          group.add(pan);
          const frizzen = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.006), steel);
          frizzen.position.set(x + 0.018, y + 0.024, z + 0.018);
          frizzen.rotation.x = -0.4;
          group.add(frizzen);
        } else {
          const nipple = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.012, this.seg(6, 4)), steel);
          nipple.position.set(x + 0.01, y + 0.02, z + 0.004);
          nipple.rotation.z = -0.6;
          group.add(nipple);
        }
        if (kind === 'wheellock') {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(12, 7)), steel);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(x + 0.02, y + 0.004, z + 0.006);
          wheel.userData.gun = 'cylinder';
          group.add(wheel);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.007), brass);
            spoke.position.set(Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0);
            spoke.rotation.z = a;
            wheel.add(spoke);
          }
        }
        return group;
      },

      /** A full-length shoulder stock: forend, wrist, comb and butt. */
      _gunStock(group, wood, metal, opts) {
        const o = opts || {};
        const backTo = o.back === undefined ? -0.19 : o.back;
        const foreTo = o.fore === undefined ? 0.26 : o.fore;

        const forend = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, foreTo), wood);
        forend.position.set(0, -0.008, foreTo / 2);
        group.add(forend);
        const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.09), wood);
        wrist.position.set(0, -0.024, backTo * 0.35);
        wrist.rotation.x = -0.16;
        group.add(wrist);
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.062, 0.11), wood);
        butt.position.set(0, -0.036, backTo);
        butt.rotation.x = -0.1;
        group.add(butt);
        const comb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.08), wood);
        comb.position.set(0, -0.006, backTo + 0.02);
        group.add(comb);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.064, 0.008), metal);
        plate.position.set(0, -0.04, backTo - 0.056);
        group.add(plate);
        if (o.ramrod !== false) {
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.003, foreTo * 0.9, this.seg(7, 5)), wood);
          rod.rotation.x = Math.PI / 2;
          rod.position.set(0, -0.024, foreTo * 0.5);
          group.add(rod);
        }
        return group;
      },

      /** Barrel bands or pipes holding a barrel to a stock. */
      _gunBands(group, mat, radius, from, to, count) {
        const n = this.isLowDetail() ? Math.max(2, Math.round(count * 0.6)) : count;
        for (let i = 0; i < n; i++) {
          const z = from + (i / Math.max(1, n - 1)) * (to - from);
          const band = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.0035, this.seg(4, 3), this.seg(10, 6)), mat);
          band.position.set(0, 0.014, z);
          group.add(band);
        }
        return group;
      },

      /** The case on its way out, hidden until a round is fired. */
      _gunShell(group, mat, x, y, z, cal) {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(cal || 0.006, cal || 0.006, (cal || 0.006) * 4, this.seg(8, 5)), mat);
        shell.rotation.z = Math.PI / 2;
        shell.position.set(x, y, z);
        shell.visible = false;
        shell.userData.gun = 'shell';
        group.add(shell);
        return shell;
      },

      /** Revolver cylinder with its chambers and case rims, tagged to index. */
      _gunCylinder(group, steel, brass, x, y, z, radius, chambers) {
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 1.9, this.seg(12, 7)), steel);
        cyl.rotation.x = Math.PI / 2;
        cyl.position.set(x, y, z);
        cyl.userData.gun = 'cylinder';
        const n = chambers || 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const bore = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.24, radius * 0.24, radius * 2, this.seg(8, 5)), this._mat(0x111114, { roughness: 0.9 }));
          bore.position.set(Math.cos(a) * radius * 0.63, Math.sin(a) * radius * 0.63, 0);
          cyl.add(bore);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, radius * 0.22, this.seg(8, 5)), brass);
          rim.position.set(Math.cos(a) * radius * 0.63, Math.sin(a) * radius * 0.63, -radius * 0.95);
          cyl.add(rim);
          // The flutes cut between chambers to save weight.
          const flute = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.3, radius * 0.12, radius * 1.6), this._mat(0x14161A, { roughness: 0.8, metalness: 0.4 }));
          flute.position.set(Math.cos(a + Math.PI / n) * radius, Math.sin(a + Math.PI / n) * radius, 0);
          flute.rotation.z = a + Math.PI / n;
          cyl.add(flute);
        }
        group.add(cyl);
        return cyl;
      },
      // ---- 427: Suction Cup Dart Gun -----------------------------------------
      createSuctionCupDartGunModel(weapon, rand) {
        const group = new THREE.Group();
        const shellColor = this.getRandomColor(rand, [0xE8342B, 0x1D6FD6, 0xF5C518]);
        const body = this._mat(shellColor, { roughness: 0.6, metalness: 0.05 });
        const trim = this._mat(0xF4A100, { roughness: 0.65, metalness: 0.05 });
        const rubber = this._mat(0xE8A0A0, { roughness: 0.95, metalness: 0.0 });
        const dark = this._mat(0x2A2A2E, { roughness: 0.8, metalness: 0.1 });

        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.062, 0.13), body);
        shell.position.set(0, 0.012, 0.03);
        group.add(shell);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.004, 0.128), trim);
        seam.position.set(0, 0.012, 0.03);
        group.add(seam);
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.06, this.seg(10, 6)), trim);
        bore.rotation.x = Math.PI / 2;
        bore.position.set(0, 0.02, 0.115);
        group.add(bore);
        // The dart still in the barrel, cup first.
        const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(9, 6)), trim);
        dart.rotation.x = Math.PI / 2;
        dart.position.set(0, 0.02, 0.13);
        group.add(dart);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.008, 0.014, this.seg(10, 6)), rubber);
        cup.rotation.x = -Math.PI / 2;
        cup.position.set(0, 0.02, 0.158);
        group.add(cup);
        // Cocking slide on top, and the spring visible through a slot.
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.05), trim);
        slide.position.set(0, 0.048, 0.0);
        slide.userData.gun = 'slide';
        group.add(slide);
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.07), dark);
        slot.position.set(0, 0.044, 0.02);
        group.add(slot);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.036), body);
        grip.position.set(0, -0.062, -0.026);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        this._gunTrigger(group, trim, 0, -0.024, -0.006, { guardR: 0.017 });
        const sticker = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.02, 0.03), trim);
        sticker.position.set(0.02, 0.014, 0.01);
        group.add(sticker);
        return group;
      },

      // ---- 428: Unreliable Pistol --------------------------------------------
      createUnreliablePistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x74797F, { roughness: 0.68, metalness: 0.7 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.3 });
        const grip = this._wood(0x4A3524);
        const tape = this._wood(0x2A2A2A);
        const brass = this._cast(0xB9902A);

        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.042, 0.11), steel);
        frame.position.set(0, 0.008, 0.01);
        group.add(frame);
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.028, 0.12), steel);
        slide.position.set(0, 0.034, 0.016);
        slide.rotation.z = 0.03;               // it has never sat straight
        slide.userData.gun = 'slide';
        group.add(slide);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.05, this.seg(9, 6)), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.09);
        group.add(barrel);
        // Rust in the places a rag never reaches, and tape holding the rest on.
        for (let i = 0; i < 4; i++) {
          const patch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.018), rust);
          patch.position.set((rand() - 0.5) * 0.03, 0.01 + rand() * 0.04, -0.02 + rand() * 0.11);
          patch.rotation.set(rand(), rand(), rand());
          group.add(patch);
        }
        for (let i = 0; i < 2; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.012), tape);
          wrap.position.set(0, 0.014, -0.02 + i * 0.07);
          group.add(wrap);
        }
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.008), steel);
        hammer.position.set(0, 0.05, -0.048);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.034), grip);
        stock.position.set(0, -0.06, -0.03);
        stock.rotation.x = Math.PI / 8;
        group.add(stock);
        this._gunTrigger(group, steel, 0, -0.024, -0.006, {});
        this._gunShell(group, brass, 0.024, 0.034, 0.02, 0.006);
        return group;
      },

      // ---- 429: Rusty Rifle ---------------------------------------------------
      createRustyRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const rust = this._mat(0x8A4B22, { roughness: 0.98, metalness: 0.3 });
        const steel = this._mat(0x6E7378, { roughness: 0.8, metalness: 0.6 });
        const wood = this._wood(0x5C4033);
        const brass = this._cast(0xA0842A);

        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.046, 0.14), rust);
        receiver.position.set(0, 0.012, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.3, this.seg(9, 6)), rust);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.23);
        group.add(barrel);
        // Pitting all the way down it, which is why nobody wants this one.
        const pits = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < pits; i++) {
          const a = rand() * Math.PI * 2;
          const pit = new THREE.Mesh(new THREE.SphereGeometry(0.005 + rand() * 0.004, this.seg(6, 4), this.seg(4, 3)), steel);
          pit.position.set(Math.cos(a) * 0.012, 0.024 + Math.sin(a) * 0.012, 0.1 + rand() * 0.26);
          group.add(pit);
        }
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.05), steel);
        bolt.position.set(0.02, 0.026, 0.03);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(7, 5)), steel);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.016, 0, 0);
        bolt.add(handle);
        this._gunStock(group, wood, brass, { fore: 0.24, back: -0.18 });
        this._gunBands(group, rust, 0.02, 0.13, 0.24, 2);
        this._gunTrigger(group, steel, 0, -0.03, -0.03, { guardR: 0.019 });
        this._gunShell(group, brass, 0.026, 0.026, 0.03, 0.006);
        return group;
      },

      // ---- 430: Sand-Filled Hose ----------------------------------------------
      createSandFilledHoseModel(weapon, rand) {
        const group = new THREE.Group();
        const hose = this._mat(0x1E5A2A, { roughness: 0.9, metalness: 0.05 });
        const brass = this._cast(0xB9902A);
        const tape = this._wood(0x33332E);
        const sand = this._mat(0xC8B078, { roughness: 1.0, metalness: 0.0 });

        // Not a gun at all: a garden hose packed with sand, held like one.
        const run = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.3, this.seg(11, 7)), hose);
        run.rotation.x = Math.PI / 2;
        run.position.set(0, 0.014, 0.11);
        group.add(run);
        // The ribbing moulded into it, all the way along.
        const ribs = this.isLowDetail() ? 6 : 12;
        for (let i = 0; i < ribs; i++) {
          const rib = new THREE.Mesh(new THREE.TorusGeometry(0.0195, 0.002, this.seg(4, 3), this.seg(10, 6)), hose);
          rib.position.set(0, 0.014, -0.03 + i * (0.28 / ribs));
          group.add(rib);
        }
        const coupler = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.03, this.seg(11, 7)), brass);
        coupler.rotation.x = Math.PI / 2;
        coupler.position.set(0, 0.014, 0.25);
        group.add(coupler);
        const spill = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, this.seg(9, 6)), sand);
        spill.rotation.x = Math.PI / 2;
        spill.position.set(0, 0.014, 0.278);
        group.add(spill);
        const bend = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.019, this.seg(6, 4), this.seg(12, 7), Math.PI), hose);
        bend.position.set(0, -0.016, -0.04);
        bend.rotation.set(0, Math.PI / 2, 0);
        group.add(bend);
        // The tape is wound round the bend that serves as a grip; stepped
        // further down it left the last wraps hanging under the hose.
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.005, this.seg(4, 3), this.seg(10, 6)), tape);
          wrap.position.set(0, -0.038 - i * 0.009, -0.04);
          wrap.rotation.x = Math.PI / 2;
          wrap.scale.z = 0.6;
          group.add(wrap);
        }
        this._gunTrigger(group, brass, 0, -0.03, -0.008, { guard: false });
        return group;
      },

      // ---- 431: Modified Cap Gun ----------------------------------------------
      createModifiedCapGunModel(weapon, rand) {
        const group = new THREE.Group();
        const toy = this._mat(0xC0392B, { roughness: 0.55, metalness: 0.15 });
        const chrome = this._mat(0xC8CED4, { roughness: 0.2, metalness: 0.95 });
        const weld = this._cast(0x9A6A3A);
        const dark = this._mat(0x2A2A2E, { roughness: 0.8, metalness: 0.15 });
        const brass = this._cast(0xB9902A);

        // A cowboy cap gun that somebody has made real, badly.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.09), toy);
        frame.position.set(0, 0.01, 0.0);
        group.add(frame);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.12, this.seg(10, 6)), chrome);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.1);
        group.add(barrel);
        // The steel liner welded into the toy barrel, sticking out at the end.
        const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, this.seg(9, 6)), dark);
        liner.rotation.x = Math.PI / 2;
        liner.position.set(0, 0.024, 0.115);
        group.add(liner);
        for (let i = 0; i < 3; i++) {
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(6, 4), this.seg(4, 3)), weld);
          bead.scale.set(1.8, 0.6, 1);
          bead.position.set(0, 0.033, 0.05 + i * 0.03);
          group.add(bead);
        }
        this._gunCylinder(group, chrome, brass, 0, 0.012, 0.01, 0.02, 6);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.008), chrome);
        hammer.position.set(0, 0.044, -0.04);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.032), toy);
        grip.position.set(0, -0.056, -0.026);
        grip.rotation.x = Math.PI / 7;
        group.add(grip);
        const star = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.002, 5), chrome);
        star.rotation.y = Math.PI / 2;
        star.rotation.z = Math.PI / 2;
        star.position.set(0.014, -0.05, -0.026);
        group.add(star);
        this._gunTrigger(group, chrome, 0, -0.022, -0.008, {});
        return group;
      },

      // ---- 432: Bike Pump Air Gun ---------------------------------------------
      createBikePumpAirGunModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.85 });
        const black = this._mat(0x1E1E22, { roughness: 0.8, metalness: 0.1 });
        const hose = this._mat(0x2A2A2E, { roughness: 0.9, metalness: 0.05 });

        // A track pump laid on its side with a barrel taped to it.
        const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.19, this.seg(12, 7)), alloy);
        cylinder.rotation.x = Math.PI / 2;
        cylinder.position.set(0, 0.0, 0.02);
        group.add(cylinder);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.026, 0.014, this.seg(12, 7)), black);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(0, 0.0, -0.082);
        group.add(cap);
        // The plunger rod: pulled back to charge it, so it is the action.
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, this.seg(9, 6)), alloy);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(0, 0.0, -0.13);
        rod.userData.gun = 'slide';
        group.add(rod);
        const tHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.07, this.seg(9, 6)), black);
        tHandle.rotation.z = Math.PI / 2;
        tHandle.position.set(0, 0, -0.06);
        rod.add(tHandle);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.16, this.seg(9, 6)), alloy);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.09);
        group.add(barrel);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, this.seg(12, 7)), black);
        gauge.position.set(0, 0.03, -0.03);
        gauge.rotation.x = Math.PI / 2;
        group.add(gauge);
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.014, 0.002), this._glow(0xE8342B, 0.6));
        needle.position.set(0, 0.036, -0.026);
        needle.userData.spin = { axis: 'z', speed: 0.8 };
        group.add(needle);
        const feed = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), hose);
        feed.position.set(0, 0.018, 0.05);
        feed.rotation.set(0, Math.PI / 2, 0.8);
        group.add(feed);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.03), black);
        grip.position.set(0, -0.062, -0.03);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        this._gunTrigger(group, alloy, 0, -0.03, -0.008, {});
        return group;
      },

      // ---- 433: Potato Cannon -------------------------------------------------
      createPotatoCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const pvc = this._mat(0xE8E4DA, { roughness: 0.55, metalness: 0.03 });
        const purple = this._mat(0x6B4A8B, { roughness: 0.7, metalness: 0.05 });
        const grey = this._mat(0x8A8F95, { roughness: 0.7, metalness: 0.2 });
        const spud = this._mat(0xC8A870, { roughness: 0.95, metalness: 0.0 });

        // Drain pipe, a reducer, a screw cap and a barbecue igniter.
        const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.16, this.seg(12, 7)), pvc);
        chamber.rotation.x = Math.PI / 2;
        chamber.position.set(0, 0.01, -0.02);
        group.add(chamber);
        const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.03, this.seg(12, 7)), pvc);
        endCap.rotation.x = Math.PI / 2;
        endCap.position.set(0, 0.01, -0.11);
        group.add(endCap);
        const threads = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < threads; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.0455, 0.0025, this.seg(4, 3), this.seg(12, 7)), pvc);
          t.position.set(0, 0.01, -0.1 + i * 0.008);
          group.add(t);
        }
        const reducer = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.042, 0.05, this.seg(12, 7)), pvc);
        reducer.rotation.x = Math.PI / 2;
        reducer.position.set(0, 0.01, 0.085);
        group.add(reducer);
        const glue = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.004, this.seg(4, 3), this.seg(12, 7)), purple);
        glue.position.set(0, 0.01, 0.062);
        group.add(glue);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.22, this.seg(11, 7)), pvc);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.01, 0.22);
        group.add(barrel);
        // The potato, loaded and slightly proud of the muzzle.
        const potato = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(9, 6), this.seg(7, 5)), spud);
        potato.scale.set(1, 1, 1.5);
        potato.position.set(0, 0.01, 0.325);
        group.add(potato);
        const igniter = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.02), grey);
        igniter.position.set(0.03, 0.02, -0.06);
        group.add(igniter);
        const spark = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, this.seg(6, 4)), grey);
        spark.rotation.z = Math.PI / 2;
        spark.position.set(0.018, 0.02, -0.06);
        group.add(spark);
        this._gunTrigger(group, grey, 0.03, -0.002, -0.06, { guard: false });
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.014), grey);
        strap.position.set(0, -0.03, 0.03);
        group.add(strap);
        return group;
      },

      // ---- 434: Pipe Gun ------------------------------------------------------
      createPipeGunModel(weapon, rand) {
        const group = new THREE.Group();
        const galv = this._mat(0x9BA1A7, { roughness: 0.62, metalness: 0.75 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.3 });
        const wood = this._wood(0x6E4A2A);
        const tape = this._wood(0x2A2A2A);
        const brass = this._cast(0xB9902A);

        // Two pipes and a nail: one slides inside the other, and the nail is
        // the firing pin.
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.2, this.seg(10, 6)), galv);
        outer.rotation.x = Math.PI / 2;
        outer.position.set(0, 0.02, 0.11);
        group.add(outer);
        const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, this.seg(10, 6)), galv);
        coupling.rotation.x = Math.PI / 2;
        coupling.position.set(0, 0.02, 0.02);
        group.add(coupling);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, this.seg(9, 6)), rust);
        inner.rotation.x = Math.PI / 2;
        inner.position.set(0, 0.02, -0.04);
        inner.userData.gun = 'slide';
        group.add(inner);
        const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.02, this.seg(10, 6)), galv);
        endCap.rotation.x = Math.PI / 2;
        endCap.position.set(0, 0.02, -0.095);
        group.add(endCap);
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, this.seg(6, 4)), rust);
        nail.rotation.x = Math.PI / 2;
        nail.position.set(0, 0.02, -0.105);
        group.add(nail);
        const nailHead = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, this.seg(7, 5)), rust);
        nailHead.rotation.x = Math.PI / 2;
        nailHead.position.set(0, 0.02, -0.12);
        group.add(nailHead);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.11), wood);
        stock.position.set(0, -0.03, -0.02);
        stock.rotation.x = -0.14;
        group.add(stock);
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.03, 0.014), tape);
          wrap.position.set(0, -0.008, -0.05 + i * 0.05);
          group.add(wrap);
        }
        this._gunTrigger(group, galv, 0, -0.032, -0.03, { guard: false });
        this._gunShell(group, brass, 0.02, 0.02, 0.0, 0.007);
        return group;
      },

      // ---- 435: Pressure Gun --------------------------------------------------
      createPressureGunModel(weapon, rand) {
        const group = new THREE.Group();
        const tank = this._mat(0x2E6B8B, { roughness: 0.45, metalness: 0.6 });
        const steel = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.88 });
        const hose = this._mat(0x1A1A1E, { roughness: 0.9, metalness: 0.05 });
        const warn = this._glow(0xFFB300, 0.8);

        // Industrial: a pressure vessel, a regulator and a lance.
        const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.15, this.seg(12, 7)), tank);
        vessel.rotation.x = Math.PI / 2;
        vessel.position.set(0, -0.01, -0.03);
        group.add(vessel);
        for (const z of [-0.105, 0.045]) {
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.038, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), tank);
          dome.rotation.x = z < 0 ? Math.PI / 2 : -Math.PI / 2;
          dome.position.set(0, -0.01, z);
          group.add(dome);
        }
        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.005, this.seg(4, 3), this.seg(14, 8)), steel);
        belt.position.set(0, -0.01, -0.03);
        group.add(belt);
        const regulator = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.03), steel);
        regulator.position.set(0, 0.036, 0.03);
        group.add(regulator);
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, this.seg(10, 6)), steel);
        knob.position.set(0, 0.058, 0.03);
        knob.userData.spin = { axis: 'y', speed: 0.4 };
        group.add(knob);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(12, 7)), warn);
        dial.rotation.x = Math.PI / 2;
        dial.position.set(0.02, 0.036, 0.046);
        dial.userData.pulse = { min: 0.3, max: 1.1, freq: 1.6 };
        group.add(dial);
        const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.2, this.seg(9, 6)), steel);
        lance.rotation.x = Math.PI / 2;
        lance.position.set(0, 0.036, 0.15);
        group.add(lance);
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.026, this.seg(9, 6)), steel);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.036, 0.26);
        group.add(nozzle);
        for (let i = 0; i < 3; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.4), hose);
          coil.position.set(-0.03, 0.01 + i * 0.012, 0.01);
          coil.rotation.set(0.5, 0.4, 0.6);
          group.add(coil);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.032), hose);
        grip.position.set(0, -0.05, 0.07);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, steel, 0, -0.014, 0.096, {});
        return group;
      },

      // ---- 436: Garden Sprayer Flamer -----------------------------------------
      createGardenSprayerFlamerModel(weapon, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(0x1E7A3A, { roughness: 0.7, metalness: 0.05 });
        const amber = this._mat(0xC8A030, { roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.6 });
        const fuel = this._mat(0xE8B44A, { roughness: 0.2, metalness: 0.1 });
        const brass = this._cast(0xB9902A);
        const flame = this._glow(0xFF6A1A, 1.1);
        const hose = this._mat(0x1A1A1E, { roughness: 0.9, metalness: 0.05 });

        // A weedkiller sprayer with a lit pilot on the wand.
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.17, this.seg(12, 7)), amber);
        bottle.rotation.x = Math.PI / 2;
        bottle.position.set(0, -0.014, -0.04);
        group.add(bottle);
        const level = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.09, this.seg(12, 7)), fuel);
        level.rotation.x = Math.PI / 2;
        level.position.set(0, -0.02, -0.05);
        group.add(level);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.024, this.seg(11, 7)), plastic);
        lid.rotation.x = Math.PI / 2;
        lid.position.set(0, -0.014, 0.055);
        group.add(lid);
        const pumpHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, this.seg(9, 6)), plastic);
        pumpHandle.rotation.x = Math.PI / 2;
        pumpHandle.position.set(0, 0.036, -0.09);
        pumpHandle.userData.gun = 'slide';
        group.add(pumpHandle);
        const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.24, this.seg(9, 6)), brass);
        wand.rotation.x = Math.PI / 2;
        wand.position.set(0, 0.03, 0.16);
        group.add(wand);
        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.024, this.seg(9, 6)), brass);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.03, 0.29);
        group.add(nozzle);
        // The pilot flame, which is the modification.
        const pilot = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(6, 4)), flame);
        pilot.position.set(0.014, 0.042, 0.27);
        pilot.userData.pulse = { min: 0.5, max: 1.4, freq: 3.4 };
        pilot.userData.sway = { axis: 'z', amp: 0.16, freq: 2.8 };
        group.add(pilot);
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), hose);
          coil.position.set(-0.024, 0.0 + i * 0.014, 0.04);
          coil.rotation.set(0.4, 0.5, 0.7);
          group.add(coil);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.03), plastic);
        grip.position.set(0, -0.05, 0.08);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, brass, 0, -0.014, 0.104, {});
        return group;
      },

      // ---- 437: Rubble Launcher -----------------------------------------------
      createRubbleLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const drum = this._mat(0x7A5A3A, { roughness: 0.85, metalness: 0.4 });
        const steel = this._mat(0x6E7378, { roughness: 0.7, metalness: 0.7 });
        const crete = this._mat(0xA8A49C, { roughness: 1.0, metalness: 0.0 });
        const strap = this._wood(0x33332E);

        // A hopper of broken masonry over a length of ducting: whatever is in
        // it comes out of the front.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.052, 0.3, this.seg(12, 7)), steel);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.01, 0.12);
        group.add(tube);
        const flange = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, this.seg(4, 3), this.seg(14, 8)), steel);
        flange.position.set(0, 0.01, 0.26);
        group.add(flange);
        const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.032, 0.1, this.seg(10, 6)), drum);
        hopper.position.set(0, 0.08, 0.02);
        group.add(hopper);
        const chunks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < chunks; i++) {
          const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.014 + rand() * 0.01, 0), crete);
          c.position.set((rand() - 0.5) * 0.07, 0.12 + rand() * 0.02, 0.02 + (rand() - 0.5) * 0.06);
          c.rotation.set(rand(), rand(), rand());
          group.add(c);
        }
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.05, this.seg(12, 7)), steel);
        breech.rotation.x = Math.PI / 2;
        breech.position.set(0, 0.01, -0.05);
        breech.userData.gun = 'bolt';
        group.add(breech);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.01), steel);
        lever.position.set(0.05, 0.03, -0.05);
        lever.rotation.z = -0.4;
        group.add(lever);
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.053, 0.005, this.seg(4, 3), this.seg(12, 7)), strap);
          band.position.set(0, 0.01, 0.03 + i * 0.09);
          group.add(band);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.034), strap);
        grip.position.set(0, -0.065, -0.02);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.06, this.seg(9, 6)), strap);
        foregrip.position.set(0, -0.05, 0.16);
        group.add(foregrip);
        this._gunTrigger(group, steel, 0, -0.028, 0.006, { guardR: 0.02 });
        return group;
      },

      // ---- 438: Seed Gun ------------------------------------------------------
      createSeedGunModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x5B4227);
        const leaf = this._mat(0x4E9A3A, { roughness: 0.6, metalness: 0.05 });
        const husk = this._mat(0xC8A02A, { roughness: 0.6, metalness: 0.1 });
        const sap = this._glow(0xB8FF5A, 0.7);

        // Grown rather than machined: a seed pod magazine feeding a hollow
        // branch, with a vine trigger.
        const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.14, this.seg(9, 6)), bark);
        stock.rotation.x = Math.PI / 2;
        stock.position.set(0, 0.0, -0.04);
        group.add(stock);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.22, this.seg(9, 6)), bark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.008, 0.14);
        group.add(barrel);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.03, this.seg(10, 6)), leaf);
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(0, 0.008, 0.26);
        group.add(mouth);
        // Pod magazine slung under it, the seeds visible through a split.
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.032, this.seg(10, 6), this.seg(8, 5)), husk);
        pod.scale.set(0.7, 1.5, 0.7);
        pod.position.set(0, -0.05, 0.02);
        group.add(pod);
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.026), sap);
        split.position.set(0, -0.05, 0.038);
        split.userData.pulse = { min: 0.3, max: 1.0, freq: 1.1 };
        group.add(split);
        const seeds = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < seeds; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(6, 4), this.seg(5, 4)), husk);
          s.position.set(0, -0.07 + i * 0.016, 0.04);
          group.add(s);
        }
        // Vines wound round the barrel, and a leaf that moves.
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.003, this.seg(4, 3), this.seg(9, 6)), leaf);
          coil.position.set(0, 0.008, 0.06 + i * 0.05);
          coil.rotation.set(Math.PI / 2 + 0.2, 0, i * 0.6);
          group.add(coil);
        }
        const frond = this._plate([[0, 0], [0.03, 0.02], [0.045, 0.05], [0.01, 0.035]], 0.004, leaf);
        frond.position.set(0.014, 0.02, 0.12);
        frond.userData.sway = { axis: 'z', amp: 0.14, freq: 1.2 };
        group.add(frond);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, this.seg(9, 6)), bark);
        grip.position.set(0, -0.06, -0.03);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        this._gunTrigger(group, leaf, 0, -0.026, -0.006, {});
        return group;
      },

      // ---- 439: Bamboo Blowgun ------------------------------------------------
      createBambooBlowgunModel(weapon, rand) {
        const group = new THREE.Group();
        const bamboo = this._mat(0xC8B878, { roughness: 0.75, metalness: 0.03 });
        const node = this._mat(0x9A8A50, { roughness: 0.8, metalness: 0.03 });
        const cord = this._wood(0x8A6236);
        const dartMat = this._wood(0x3A2A1C);
        const featherMat = this._mat(0xE8342B, { roughness: 0.9, metalness: 0.02 });

        // One length of bamboo, its nodes still on it, and a quiver of darts
        // lashed alongside.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.52, this.seg(10, 6)), bamboo);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.01, 0.16);
        group.add(tube);
        const nodes = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < nodes; i++) {
          const n = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, this.seg(10, 6)), node);
          n.rotation.x = Math.PI / 2;
          n.position.set(0, 0.01, -0.06 + i * 0.11);
          group.add(n);
        }
        const mouthpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, 0.03, this.seg(10, 6)), node);
        mouthpiece.rotation.x = Math.PI / 2;
        mouthpiece.position.set(0, 0.01, -0.11);
        group.add(mouthpiece);
        // Darts in a bundle under the tube, flights out.
        const darts = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < darts; i++) {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.07, this.seg(6, 4)), dartMat);
          d.rotation.x = Math.PI / 2;
          d.position.set(-0.012 + i * 0.008, -0.018, 0.02);
          group.add(d);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.012, this.seg(5, 4)), featherMat);
          fl.rotation.x = -Math.PI / 2;
          fl.position.set(-0.012 + i * 0.008, -0.018, -0.018);
          group.add(fl);
        }
        for (let i = 0; i < 3; i++) {
          const lash = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, this.seg(4, 3), this.seg(9, 6)), cord);
          lash.position.set(0, -0.004, -0.01 + i * 0.05);
          lash.rotation.x = Math.PI / 2;
          lash.scale.y = 1.6;
          group.add(lash);
        }
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, this.seg(9, 6)), cord);
        grip.rotation.x = Math.PI / 2;
        grip.position.set(0, 0.01, 0.05);
        group.add(grip);
        this._gunTrigger(group, node, 0, -0.014, 0.05, { guard: false });
        return group;
      },

      // ---- 440: Spud Launcher Deluxe ------------------------------------------
      createSpudLauncherDeluxeModel(weapon, rand) {
        const group = new THREE.Group();
        const pvc = this._mat(0x2A4A8B, { roughness: 0.45, metalness: 0.05 });
        const white = this._mat(0xE8E4DA, { roughness: 0.5, metalness: 0.03 });
        const alloy = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.85 });
        const glow = this._glow(0x4FC3F7, 0.9);
        const spud = this._mat(0xC8A870, { roughness: 0.95, metalness: 0.0 });

        // The version with the money spent on it: a real combustion chamber,
        // a spark gap you can see, a scope and a shoulder stock.
        const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.17, this.seg(14, 8)), pvc);
        chamber.rotation.x = Math.PI / 2;
        chamber.position.set(0, 0.006, -0.02);
        group.add(chamber);
        const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.09), white);
        window_.position.set(0.036, 0.02, -0.02);
        group.add(window_);
        const arc = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.03, 0.003), glow);
        arc.position.set(0.03, 0.02, -0.02);
        arc.userData.pulse = { min: 0.0, max: 1.6, freq: 6.0 };
        group.add(arc);
        for (const z of [-0.11, 0.07]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.006, this.seg(4, 3), this.seg(14, 8)), alloy);
          ring.position.set(0, 0.006, z);
          group.add(ring);
        }
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.04, 0.03, this.seg(12, 7)), alloy);
        breech.rotation.x = Math.PI / 2;
        breech.position.set(0, 0.006, -0.12);
        breech.userData.gun = 'bolt';
        group.add(breech);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.26, this.seg(12, 7)), white);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.006, 0.21);
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.03, this.seg(12, 7)), alloy);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.006, 0.35);
        group.add(brake);
        const round_ = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(9, 6), this.seg(7, 5)), spud);
        round_.scale.z = 1.5;
        round_.position.set(0, 0.006, 0.36);
        group.add(round_);
        // Scope, because of course there is one.
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, this.seg(11, 7)), alloy);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.066, 0.03);
        group.add(scope);
        for (const z of [-0.01, 0.06]) {
          const mount = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.012), alloy);
          mount.position.set(0, 0.056, z);
          group.add(mount);
        }
        const stockTube = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.1), pvc);
        stockTube.position.set(0, -0.02, -0.17);
        group.add(stockTube);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.012), alloy);
        pad.position.set(0, -0.024, -0.222);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.034), pvc);
        grip.position.set(0, -0.062, -0.07);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, alloy, 0, -0.026, -0.044, {});
        return group;
      },

      // ---- 441: Flintlock Pistol ----------------------------------------------
      createFlintlockPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.4, metalness: 0.86 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(this.getRandomColor(rand, [0x5C3317, 0x4A2A14, 0x6B4423]));

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.19, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.105);
        group.add(barrel);
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 8), steel);
        breech.rotation.x = Math.PI / 2;
        breech.position.set(0, 0.024, 0.0);
        group.add(breech);
        const tang = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.04), brass);
        tang.position.set(0, 0.038, -0.028);
        group.add(tang);
        // Full walnut stock down to the muzzle, with brass furniture.
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.2), walnut);
        stock.position.set(0, 0.004, 0.1);
        group.add(stock);
        const capMount = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.02, this.seg(10, 6)), brass);
        capMount.rotation.x = Math.PI / 2;
        capMount.position.set(0, 0.012, 0.198);
        group.add(capMount);
        const ramrod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.0025, 0.17, this.seg(7, 5)), walnut);
        ramrod.rotation.x = Math.PI / 2;
        ramrod.position.set(0, -0.006, 0.11);
        group.add(ramrod);
        this._gunLock(group, steel, brass, 'flintlock', 0, 0.014, -0.01);
        // The dropped, swelling grip a duelling pistol lives or dies by.
        const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.05), walnut);
        wrist.position.set(0, -0.02, -0.04);
        wrist.rotation.x = -0.3;
        group.add(wrist);
        const butt = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(10, 6), this.seg(8, 5)), walnut);
        butt.scale.set(1, 1.35, 1.1);
        butt.position.set(0, -0.072, -0.076);
        group.add(butt);
        const buttCap = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(10, 6), this.seg(6, 4), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brass);
        buttCap.scale.set(1, 1.1, 1.1);
        buttCap.position.set(0, -0.082, -0.078);
        group.add(buttCap);
        this._gunTrigger(group, steel, 0, -0.02, -0.024, { guardR: 0.017, guardArc: 1.3 });
        return group;
      },

      // ---- 442: Combatant Angler ----------------------------------------------
      createCombatantAnglerModel(weapon, rand) {
        const group = new THREE.Group();
        const rodMat = this._mat(0x1E3A5A, { roughness: 0.4, metalness: 0.3 });
        const alloy = this._mat(0x9BA1A7, { roughness: 0.35, metalness: 0.9 });
        const cork = this._mat(0xC8A870, { roughness: 0.95, metalness: 0.0 });
        const line = this._mat(0xE8E8E0, { roughness: 0.6, metalness: 0.1 });

        // A spear-fishing gun built on a rod: a reel that turns, a rail, and a
        // barbed shaft loaded on it.
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.4, this.seg(9, 6)), rodMat);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(0, 0.014, 0.19);
        group.add(rod);
        const guides = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < guides; i++) {
          const t = i / (guides - 1);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008 + (1 - t) * 0.004, 0.0018, this.seg(4, 3), this.seg(9, 6)), alloy);
          ring.position.set(0, 0.03, 0.08 + t * 0.3);
          group.add(ring);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.008), alloy);
          foot.position.set(0, 0.022, 0.08 + t * 0.3);
          group.add(foot);
        }
        // The spear shaft, along the rod and past the tip.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.46, this.seg(7, 5)), alloy);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0.03, 0.23);
        group.add(shaft);
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, this.seg(7, 5)), alloy);
        point.rotation.x = Math.PI / 2;
        point.position.set(0, 0.03, 0.47);
        group.add(point);
        for (let i = 0; i < 2; i++) {
          const barb = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, 3), alloy);
          barb.position.set(0.006, 0.03, 0.43 - i * 0.03);
          barb.rotation.z = -2.2;
          group.add(barb);
        }
        // Reel: it spins, because a reel that does not is just a lump.
        const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, this.seg(14, 8)), alloy);
        reel.rotation.y = Math.PI / 2;
        reel.position.set(0.024, -0.014, 0.04);
        reel.userData.spin = { axis: 'x', speed: 1.4 };
        group.add(reel);
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.022, this.seg(12, 7)), line);
        spool.rotation.y = Math.PI / 2;
        spool.position.set(0.024, -0.014, 0.04);
        group.add(spool);
        const crank = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.005), alloy);
        crank.position.set(0.04, -0.014, 0.04);
        crank.userData.spin = { axis: 'x', speed: 1.4 };
        group.add(crank);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.05), alloy);
        seat.position.set(0, -0.008, 0.02);
        group.add(seat);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.12, this.seg(10, 6)), cork);
        handle.rotation.x = Math.PI / 2;
        handle.position.set(0, 0.012, -0.06);
        group.add(handle);
        this._gunTrigger(group, alloy, 0, -0.014, 0.0, { guard: false });
        return group;
      },

      // ---- 443: Wheellock Pistol ----------------------------------------------
      createWheellockPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x5E6368, { roughness: 0.42, metalness: 0.86 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x4A2A14);
        const bone = this._mat(0xD9CDAF, { roughness: 0.7, metalness: 0.05 });

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.2, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.11);
        group.add(barrel);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.032, 0.19), walnut);
        stock.position.set(0, 0.006, 0.095);
        group.add(stock);
        this._gunLock(group, steel, brass, 'wheellock', 0, 0.016, -0.005);
        // Spanner key on a chain, without which it does not work at all.
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.006), steel);
        key.position.set(-0.026, 0.02, -0.02);
        key.userData.sway = { axis: 'z', amp: 0.25, freq: 1.1 };
        group.add(key);
        // Bone inlay in the stock, which is what these were really about.
        const inlays = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < inlays; i++) {
          const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 6), bone);
          dot.rotation.z = Math.PI / 2;
          dot.position.set(0.014, -0.01 + (i % 3) * 0.012, 0.02 + Math.floor(i / 3) * 0.05);
          group.add(dot);
        }
        const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.06), walnut);
        wrist.position.set(0, -0.024, -0.05);
        wrist.rotation.x = -0.42;
        group.add(wrist);
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(11, 7), this.seg(8, 5)), bone);
        pommel.scale.set(1, 0.9, 0.9);
        pommel.position.set(0, -0.075, -0.096);
        group.add(pommel);
        const cap = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(12, 7)), brass);
        cap.position.set(0, -0.062, -0.088);
        cap.rotation.x = 1.2;
        group.add(cap);
        this._gunTrigger(group, steel, 0, -0.022, -0.02, { guardR: 0.016, guardArc: 1.2 });
        return group;
      },

      // ---- 444: Pistol --------------------------------------------------------
      createPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x3A3F45, { roughness: 0.42, metalness: 0.88 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const polymer = this._mat(0x1E2024, { roughness: 0.8, metalness: 0.06 });
        const brass = this._cast(0xC9A227);

        // The plain service automatic: nothing on it that is not needed.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.036, 0.13), polymer);
        frame.position.set(0, -0.004, 0.01);
        group.add(frame);
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.036, 0.15), steel);
        slide.position.set(0, 0.028, 0.02);
        slide.userData.gun = 'slide';
        group.add(slide);
        for (let i = 0; i < 6; i++) {
          const serr = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.003), polymer);
          serr.position.set(0, 0, -0.055 + i * 0.008);
          slide.add(serr);
        }
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.04), polymer);
        port.position.set(0.016, 0.034, 0.03);
        slide.add(port);
        const rear = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.008), bright);
        rear.position.set(0, 0.02, -0.066);
        slide.add(rear);
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.006), bright);
        front.position.set(0, 0.02, 0.068);
        slide.add(front);
        const muzzleRing = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, this.seg(10, 6)), bright);
        muzzleRing.rotation.x = Math.PI / 2;
        muzzleRing.position.set(0, 0.026, 0.098);
        muzzleRing.userData.gun = 'muzzle';
        group.add(muzzleRing);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.036), polymer);
        grip.position.set(0, -0.07, -0.026);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        for (let i = 0; i < 4; i++) {
          const stipple = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.006), steel);
          stipple.position.set(0, -0.046 - i * 0.02, -0.044 - i * 0.002);
          group.add(stipple);
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.084, 0.028), steel);
        mag.position.set(0, -0.07, -0.024);
        mag.rotation.x = Math.PI / 9;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const floorplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.034), polymer);
        floorplate.position.set(0, -0.118, -0.04);
        group.add(floorplate);
        this._gunTrigger(group, bright, 0, -0.026, -0.006, {});
        this._gunShell(group, brass, 0.026, 0.036, 0.05, 0.005);
        return group;
      },

      // ---- 445: Musket --------------------------------------------------------
      createMusketModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.45, metalness: 0.84 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x5C3317);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.46, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.25);
        group.add(barrel);
        const muzzleBand = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, this.seg(10, 6)), brass);
        muzzleBand.rotation.x = Math.PI / 2;
        muzzleBand.position.set(0, 0.026, 0.47);
        group.add(muzzleBand);
        this._gunStock(group, walnut, brass, { fore: 0.44, back: -0.2 });
        this._gunBands(group, brass, 0.024, 0.16, 0.42, 3);
        this._gunLock(group, steel, brass, 'flintlock', 0, 0.014, -0.01);
        this._gunTrigger(group, steel, 0, -0.032, -0.03, { guardR: 0.02, guardArc: 1.3 });
        // The bayonet lug, which is most of what a musket was for.
        const lug = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.016), steel);
        lug.position.set(0, 0.042, 0.44);
        group.add(lug);
        const sling = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, this.seg(4, 3), this.seg(9, 6)), brass);
        sling.position.set(0, -0.03, 0.2);
        sling.rotation.y = Math.PI / 2;
        group.add(sling);
        return group;
      },

      // ---- 446: Extreme T-Shirt Cannon ----------------------------------------
      createTShirtCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const shellColor = this.getRandomColor(rand, [0xE8342B, 0x1D6FD6, 0x1E9B4B]);
        const shell = this._mat(shellColor, { roughness: 0.5, metalness: 0.15 });
        const alloy = this._mat(0xB8BEC4, { roughness: 0.35, metalness: 0.9 });
        const black = this._mat(0x1A1A1E, { roughness: 0.85, metalness: 0.06 });
        const cloth = this._mat(0xF4F4F0, { roughness: 1.0, metalness: 0.0 });

        // Stadium hardware: a big air tank, a wide bore and a hopper of shirts.
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.18, this.seg(14, 8)), shell);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, -0.01, -0.03);
        group.add(tank);
        for (const z of [-0.12, 0.06]) {
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.042, this.seg(14, 8), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), shell);
          dome.rotation.x = z < 0 ? Math.PI / 2 : -Math.PI / 2;
          dome.position.set(0, -0.01, z);
          group.add(dome);
        }
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.26, this.seg(14, 8)), alloy);
        bore.rotation.x = Math.PI / 2;
        bore.position.set(0, 0.042, 0.18);
        group.add(bore);
        const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.036, 0.04, this.seg(14, 8)), shell);
        flare.rotation.x = Math.PI / 2;
        flare.position.set(0, 0.042, 0.32);
        group.add(flare);
        // A shirt half out of the muzzle, and a hopper of more.
        const loaded = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(10, 6), this.seg(8, 5)), cloth);
        loaded.position.set(0, 0.042, 0.34);
        group.add(loaded);
        const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.07), black);
        hopper.position.set(0, 0.09, 0.03);
        group.add(hopper);
        for (let i = 0; i < 2; i++) {
          const roll = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(9, 6), this.seg(7, 5)), cloth);
          roll.position.set(-0.012 + i * 0.024, 0.118, 0.03);
          group.add(roll);
        }
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, this.seg(10, 6)), alloy);
        valve.position.set(0, 0.014, 0.06);
        group.add(valve);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(12, 7)), alloy);
        wheel.position.set(0.036, 0.014, 0.06);
        wheel.rotation.y = Math.PI / 2;
        wheel.userData.spin = { axis: 'x', speed: 0.5 };
        group.add(wheel);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.036), black);
        grip.position.set(0, -0.068, 0.05);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.06, this.seg(9, 6)), black);
        foregrip.position.set(0, -0.02, 0.22);
        group.add(foregrip);
        this._gunTrigger(group, alloy, 0, -0.03, 0.076, { guardR: 0.02 });
        return group;
      },

      // ---- 447: Matchlock Musket ----------------------------------------------
      createMatchlockMusketModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x63686D, { roughness: 0.55, metalness: 0.78 });
        const brass = this._cast(0xA0842A);
        const oak = this._wood(0x6B4423);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 0.5, 8), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.27);
        group.add(barrel);
        this._gunStock(group, oak, brass, { fore: 0.46, back: -0.2, ramrod: true });
        this._gunBands(group, steel, 0.026, 0.16, 0.46, 4);
        this._gunLock(group, steel, brass, 'matchlock', 0, 0.014, -0.01);
        // The spare coil of slow match, wound round the wrist of the stock.
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(4, 3), this.seg(10, 6)), this._wood(0x3A2A1C));
          coil.position.set(0, -0.026, -0.07 - i * 0.012);
          coil.rotation.x = Math.PI / 2 + 0.2;
          group.add(coil);
        }
        this._gunTrigger(group, steel, 0, -0.034, -0.03, { long: true, guard: false });
        const forkRest = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.06, this.seg(7, 5)), oak);
        forkRest.position.set(0, -0.04, 0.34);
        group.add(forkRest);
        return group;
      },

      // ---- 448: Pepperbox Revolver --------------------------------------------
      createPepperboxRevolverModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x5E6368, { roughness: 0.45, metalness: 0.85 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x4A2A14);

        // No barrel: the whole cluster of them turns, which is the entire idea
        // and the reason nobody kept making them.
        const cluster = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.13, this.seg(12, 7)), steel);
        cluster.rotation.x = Math.PI / 2;
        cluster.position.set(0, 0.024, 0.07);
        cluster.userData.gun = 'cylinder';
        group.add(cluster);
        const bores = 6;
        for (let i = 0; i < bores; i++) {
          const a = (i / bores) * Math.PI * 2;
          const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.132, this.seg(8, 5)), this._mat(0x111114, { roughness: 0.9 }));
          bore.position.set(Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0);
          cluster.add(bore);
          const flute = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.13), steel);
          flute.position.set(Math.cos(a + Math.PI / bores) * 0.03, Math.sin(a + Math.PI / bores) * 0.03, 0);
          flute.rotation.z = a + Math.PI / bores;
          cluster.add(flute);
        }
        const arbor = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.15, this.seg(8, 5)), brass);
        arbor.rotation.x = Math.PI / 2;
        arbor.position.set(0, 0.024, 0.07);
        group.add(arbor);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.05), steel);
        frame.position.set(0, 0.014, -0.01);
        group.add(frame);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.01), steel);
        hammer.position.set(0, 0.05, -0.026);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.03), steel);
        bar.position.set(0, 0.044, 0.0);
        group.add(bar);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.034), walnut);
        grip.position.set(0, -0.05, -0.036);
        grip.rotation.x = Math.PI / 7;
        group.add(grip);
        const buttCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.036), brass);
        buttCap.position.set(0, -0.09, -0.05);
        group.add(buttCap);
        this._gunTrigger(group, steel, 0, -0.018, -0.014, { guardR: 0.015, guardArc: 1.2 });
        return group;
      },

      // ---- 449: Dueling Pistol ------------------------------------------------
      createDuelingPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3A4E, { roughness: 0.22, metalness: 0.94 });
        const gold = this._cast(0xD9A62A);
        const walnut = this._wood(0x3A1F10);

        // Made in a matched pair, in a fitted case, for one purpose. Octagonal
        // barrel, set trigger, and gold at every join.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.22, 8), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.12);
        group.add(barrel);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.2), blued);
        rib.position.set(0, 0.04, 0.12);
        group.add(rib);
        const foresight = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.006, 0.005), gold);
        foresight.position.set(0, 0.045, 0.216);
        group.add(foresight);
        const backsight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.006), gold);
        backsight.position.set(0, 0.043, 0.03);
        group.add(backsight);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.03, 0.16), walnut);
        stock.position.set(0, 0.006, 0.08);
        group.add(stock);
        this._gunLock(group, blued, gold, 'flintlock', 0, 0.016, -0.008);
        // Chequering on the wrist, which is the tell of an expensive one.
        const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.06), walnut);
        wrist.position.set(0, -0.024, -0.048);
        wrist.rotation.x = -0.36;
        group.add(wrist);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const cut = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.002, 0.05), blued);
            cut.position.set(0, -0.012 - i * 0.012, -0.05);
            cut.rotation.x = -0.36;
            group.add(cut);
          }
        }
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.03), walnut);
        butt.position.set(0, -0.07, -0.086);
        butt.rotation.x = -0.36;
        group.add(butt);
        const buttCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.034), gold);
        buttCap.position.set(0, -0.092, -0.094);
        group.add(buttCap);
        // Set trigger: two of them, the front one hair-light.
        this._gunTrigger(group, gold, 0, -0.022, -0.02, { guardR: 0.018, guardArc: 1.4 });
        const setTrigger = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.004), gold);
        setTrigger.position.set(0, -0.024, -0.032);
        group.add(setTrigger);
        return group;
      },

      // ---- 450: Flintlock Blunderbuss -----------------------------------------
      createFlintlockBlunderbussModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.82 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x5C3317);

        // The bell is the whole point: it does nothing ballistically and
        // everything for the look of the thing.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.26, this.seg(12, 7)), brass);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.16);
        group.add(barrel);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.026, 0.08, this.seg(14, 8)), brass);
        bell.rotation.x = Math.PI / 2;
        bell.position.set(0, 0.026, 0.32);
        group.add(bell);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, this.seg(4, 3), this.seg(16, 9)), brass);
        lip.position.set(0, 0.026, 0.358);
        group.add(lip);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, this.seg(4, 3), this.seg(12, 7)), brass);
        ring.position.set(0, 0.026, 0.06);
        group.add(ring);
        this._gunStock(group, walnut, brass, { fore: 0.22, back: -0.17, ramrod: false });
        this._gunLock(group, steel, brass, 'flintlock', 0, 0.014, -0.01);
        this._gunTrigger(group, steel, 0, -0.032, -0.026, { guardR: 0.019, guardArc: 1.3 });
        const sling = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, this.seg(4, 3), this.seg(9, 6)), brass);
        sling.position.set(0, -0.03, 0.14);
        sling.rotation.y = Math.PI / 2;
        group.add(sling);
        return group;
      }
,

      // ---- 451: Taser Rifle ---------------------------------------------------
      createTaserRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE8B400, { roughness: 0.55, metalness: 0.15 });
        const black = this._mat(0x1E2024, { roughness: 0.8, metalness: 0.1 });
        const copper = this._mat(0xB87333, { roughness: 0.3, metalness: 0.9 });
        const arc = this._glow(0x9CE4FF, 1.4);

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.06, 0.2), shell);
        body.position.set(0, 0.008, 0.03);
        group.add(body);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.19), black);
        rail.position.set(0, 0.042, 0.03);
        group.add(rail);
        // Two electrode prongs with the arc jumping between them.
        for (const s of [-1, 1]) {
          const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.14, this.seg(9, 6)), copper);
          prong.rotation.x = Math.PI / 2;
          prong.position.set(s * 0.018, 0.022, 0.2);
          group.add(prong);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, this.seg(7, 5)), copper);
          tip.rotation.x = Math.PI / 2;
          tip.position.set(s * 0.018, 0.022, 0.278);
          group.add(tip);
        }
        const rungs = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < rungs; i++) {
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.003, 0.003), arc);
          bolt.position.set(0, 0.022, 0.16 + i * 0.028);
          bolt.rotation.z = (i % 2 ? 1 : -1) * 0.4;
          bolt.userData.pulse = { min: 0.0, max: 1.8, freq: 8 + i, phase: i * 1.9 };
          group.add(bolt);
        }
        // Capacitor bank down the side, charging in sequence.
        for (let i = 0; i < 3; i++) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, this.seg(10, 6)), black);
          cap.rotation.z = Math.PI / 2;
          cap.position.set(0.026, 0.0, -0.01 + i * 0.036);
          group.add(cap);
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(4, 3), this.seg(10, 6)), arc);
          band.position.set(0.026, 0.0, -0.01 + i * 0.036);
          band.rotation.y = Math.PI / 2;
          band.userData.pulse = { min: 0.1, max: 1.2, freq: 1.6, phase: i * 1.1 };
          group.add(band);
        }
        const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.036), black);
        cartridge.position.set(0, -0.038, 0.02);
        cartridge.userData.gun = 'magazine';
        group.add(cartridge);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), black);
        stock.position.set(0, -0.01, -0.13);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.034), black);
        grip.position.set(0, -0.056, -0.05);
        grip.rotation.x = 0.16;
        group.add(grip);
        this._gunTrigger(group, copper, 0, -0.024, -0.02, {});
        return group;
      },

      // ---- 452: Hand Cannon ---------------------------------------------------
      createHandCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x4A4F55, { roughness: 0.85, metalness: 0.6 });
        const bronze = this._mat(0xA8762A, { roughness: 0.55, metalness: 0.8 });
        const pole = this._wood(0x6B4423);
        const ember = this._glow(0xFF5A1A, 1.0);

        // The oldest firearm there is: a cast tube on a stick, fired by
        // poking a hot wire into a hole in the top.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.24, this.seg(12, 7)), bronze);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.03, 0.16);
        group.add(tube);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.04, this.seg(12, 7)), bronze);
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(0, 0.03, 0.29);
        group.add(mouth);
        const rings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.037 - i * 0.002, 0.007, this.seg(4, 3), this.seg(14, 8)), bronze);
          ring.position.set(0, 0.03, 0.06 + i * 0.06);
          group.add(ring);
        }
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.06, this.seg(12, 7)), bronze);
        breech.rotation.x = Math.PI / 2;
        breech.position.set(0, 0.03, 0.02);
        group.add(breech);
        // The touch hole and the linstock that lights it.
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, this.seg(7, 5)), iron);
        hole.position.set(0, 0.066, 0.02);
        group.add(hole);
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.09, this.seg(6, 4)), iron);
        wire.position.set(0.02, 0.076, -0.01);
        wire.rotation.z = 0.5;
        wire.userData.gun = 'hammer';
        group.add(wire);
        const coal = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(4, 3)), ember);
        coal.position.set(0.001, 0.06, 0.02);
        coal.userData.pulse = { min: 0.4, max: 1.4, freq: 1.4 };
        group.add(coal);
        // The stave it is socketed onto, tucked under the arm.
        const stave = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.34, this.seg(9, 6)), pole);
        stave.rotation.x = Math.PI / 2 + 0.24;
        stave.position.set(0, -0.02, -0.14);
        group.add(stave);
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.05, this.seg(10, 6)), iron);
        socket.rotation.x = Math.PI / 2 + 0.12;
        socket.position.set(0, 0.014, -0.02);
        group.add(socket);
        // The bands ride the stave, so their height comes off the stave's own
        // tilt. Sloped the other way, the last one hung under the pole.
        for (let i = 0; i < 3; i++) {
          const bz = -0.1 - i * 0.05;
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(4, 3), this.seg(10, 6)), iron);
          band.rotation.x = Math.PI / 2 + 0.24;
          band.position.set(0, -0.02 - (bz + 0.14) * 0.244, bz);
          group.add(band);
        }
        return group;
      },

      // ---- 453: Rifled Musket -------------------------------------------------
      createRifledMusketModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x3A4048, { roughness: 0.35, metalness: 0.9 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x4A2A14);

        // The last of the muzzle-loaders and the best of them: percussion lock,
        // rifled bore, and real sights for the first time.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.48, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.26);
        group.add(barrel);
        this._gunStock(group, walnut, brass, { fore: 0.44, back: -0.2 });
        this._gunBands(group, blued, 0.023, 0.18, 0.42, 3);
        this._gunLock(group, blued, brass, 'percussion', 0, 0.014, -0.01);
        // Ladder sight, folded up, and a blade at the muzzle.
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.04, 0.004), blued);
        ladder.position.set(0, 0.05, 0.08);
        group.add(ladder);
        for (let i = 0; i < 3; i++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.006), blued);
          step.position.set(0, 0.04 + i * 0.012, 0.08);
          group.add(step);
        }
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.006), brass);
        blade.position.set(0, 0.042, 0.47);
        group.add(blade);
        const capBox = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.024), brass);
        capBox.position.set(-0.016, -0.02, -0.05);
        group.add(capBox);
        this._gunTrigger(group, blued, 0, -0.032, -0.03, { guardR: 0.02, guardArc: 1.3 });
        return group;
      },

      // ---- 454: Percussion Revolver -------------------------------------------
      createPercussionRevolverModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3A4E, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x4A2A14);

        // Cap and ball: no cartridges, so there is a loading lever slung under
        // the barrel and a nipple behind every chamber.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.18, 8), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.14);
        group.add(barrel);
        const lug = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.16), blued);
        lug.position.set(0, 0.014, 0.13);
        group.add(lug);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.13), blued);
        lever.position.set(0, -0.002, 0.13);
        lever.rotation.x = 0.06;
        group.add(lever);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.014), blued);
        latch.position.set(0, 0.0, 0.204);
        group.add(latch);
        const cyl = this._gunCylinder(group, blued, brass, 0, 0.024, 0.028, 0.022, 6);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const nipple = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0035, 0.008, this.seg(6, 4)), blued);
          nipple.position.set(Math.cos(a) * 0.014, Math.sin(a) * 0.014, -0.026);
          cyl.add(nipple);
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.044, 0.05), blued);
        frame.position.set(0, 0.018, -0.02);
        group.add(frame);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.026, 0.01), blued);
        hammer.position.set(0, 0.05, -0.038);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const spur = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.014), blued);
        spur.position.set(0, 0.014, -0.006);
        hammer.add(spur);
        // The plough-handle grip these all had.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.086, 0.036), walnut);
        grip.position.set(0, -0.054, -0.04);
        grip.rotation.x = Math.PI / 6.5;
        group.add(grip);
        const backstrap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.006), brass);
        backstrap.position.set(0, -0.054, -0.058);
        backstrap.rotation.x = Math.PI / 6.5;
        group.add(backstrap);
        this._gunTrigger(group, blued, 0, -0.018, -0.014, { guardR: 0.016, guardArc: 1.3 });
        return group;
      },

      // ---- 455: Blunderbuss ---------------------------------------------------
      createBlunderbussModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x5E6368, { roughness: 0.6, metalness: 0.78 });
        const brass = this._cast(0xA0842A);
        const oak = this._wood(0x6B4423);

        // The plain coaching version of the flintlock one: iron rather than
        // brass, shorter, and with a spring bayonet folded over the barrel.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.017, 0.22, this.seg(11, 7)), iron);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.14);
        group.add(barrel);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.024, 0.07, this.seg(14, 8)), iron);
        bell.rotation.x = Math.PI / 2;
        bell.position.set(0, 0.026, 0.28);
        group.add(bell);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.005, this.seg(4, 3), this.seg(14, 8)), iron);
        lip.position.set(0, 0.026, 0.314);
        group.add(lip);
        // Folding bayonet along the top, latched down.
        const bayonet = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.14), iron);
        bayonet.position.set(0, 0.05, 0.16);
        group.add(bayonet);
        const bayTip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, 4), iron);
        bayTip.rotation.x = Math.PI / 2;
        bayTip.position.set(0, 0.05, 0.245);
        group.add(bayTip);
        const catch_ = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.01), brass);
        catch_.position.set(0, 0.046, 0.086);
        group.add(catch_);
        this._gunStock(group, oak, brass, { fore: 0.2, back: -0.16, ramrod: false });
        this._gunLock(group, iron, brass, 'flintlock', 0, 0.014, -0.01);
        this._gunTrigger(group, iron, 0, -0.03, -0.026, { guardR: 0.018, guardArc: 1.3 });
        return group;
      },

      // ---- 456: 9mm Pistol ----------------------------------------------------
      createNineMilPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x2E3238, { roughness: 0.4, metalness: 0.9 });
        const bright = this._mat(0xA8AEB4, { roughness: 0.28, metalness: 0.94 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.82, metalness: 0.05 });
        const brass = this._cast(0xC9A227);
        const dot = this._glow(0x8AFF6A, 0.6);

        // A modern striker-fired service pistol, in detail: accessory rail,
        // three-dot sights, extended beavertail, the lot.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.038, 0.14), polymer);
        frame.position.set(0, -0.006, 0.012);
        group.add(frame);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.05), polymer);
        rail.position.set(0, -0.024, 0.058);
        group.add(rail);
        for (let i = 0; i < 3; i++) {
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), steel);
          notch.position.set(0, -0.028, 0.044 + i * 0.012);
          group.add(notch);
        }
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.155), steel);
        slide.position.set(0, 0.03, 0.022);
        slide.userData.gun = 'slide';
        group.add(slide);
        for (let i = 0; i < 7; i++) {
          const serr = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.028, 0.003), polymer);
          serr.position.set(0, 0, -0.058 + i * 0.007);
          slide.add(serr);
        }
        for (let i = 0; i < 4; i++) {
          const fserr = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.022, 0.003), polymer);
          fserr.position.set(0, 0, 0.05 + i * 0.007);
          slide.add(fserr);
        }
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.042), polymer);
        port.position.set(0.015, 0.006, 0.028);
        slide.add(port);
        const rear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.008), bright);
        rear.position.set(0, 0.022, -0.07);
        slide.add(rear);
        for (const s of [-1, 1]) {
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.0022, this.seg(6, 4), this.seg(4, 3)), dot);
          d.position.set(s * 0.006, 0.023, -0.074);
          slide.add(d);
        }
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.009, 0.005), bright);
        front.position.set(0, 0.023, 0.072);
        slide.add(front);
        const fdot = new THREE.Mesh(new THREE.SphereGeometry(0.0024, this.seg(6, 4), this.seg(4, 3)), dot);
        fdot.position.set(0, 0.026, 0.07);
        slide.add(fdot);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, this.seg(10, 6)), bright);
        crown.rotation.x = Math.PI / 2;
        crown.position.set(0, 0.028, 0.1);
        crown.userData.gun = 'muzzle';
        group.add(crown);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.104, 0.036), polymer);
        grip.position.set(0, -0.072, -0.03);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const beaver = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.024), polymer);
        beaver.position.set(0, -0.026, -0.056);
        group.add(beaver);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.023, 0.09, 0.028), steel);
        mag.position.set(0, -0.072, -0.028);
        mag.rotation.x = Math.PI / 9;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.036), polymer);
        base.position.set(0, -0.124, -0.045);
        group.add(base);
        const release = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, this.seg(7, 5)), steel);
        release.rotation.z = Math.PI / 2;
        release.position.set(0.016, -0.03, -0.012);
        group.add(release);
        const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.024), steel);
        slideStop.position.set(-0.016, -0.004, 0.0);
        group.add(slideStop);
        this._gunTrigger(group, steel, 0, -0.028, -0.008, { curl: 0.2 });
        this._gunShell(group, brass, 0.026, 0.036, 0.05, 0.005);
        return group;
      },

      // ---- 457: Riot Gun ------------------------------------------------------
      createRiotGunModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x24262A, { roughness: 0.6, metalness: 0.7 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const orange = this._mat(0xE07A18, { roughness: 0.6, metalness: 0.1 });
        const brass = this._cast(0xB9902A);

        // Police pump gun with an orange forend, so nobody mistakes what it is
        // loaded with.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.16), black);
        receiver.position.set(0, 0.01, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.3, this.seg(11, 7)), black);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.25);
        group.add(barrel);
        const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.28, this.seg(10, 6)), black);
        magTube.rotation.x = Math.PI / 2;
        magTube.position.set(0, -0.006, 0.23);
        group.add(magTube);
        const capNut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, 0.016, this.seg(10, 6)), orange);
        capNut.rotation.x = Math.PI / 2;
        capNut.position.set(0, -0.006, 0.378);
        group.add(capNut);
        // The pump: this is the action.
        const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, this.seg(11, 7)), orange);
        pump.rotation.x = Math.PI / 2;
        pump.position.set(0, 0.012, 0.2);
        pump.userData.gun = 'slide';
        group.add(pump);
        for (let i = 0; i < 5; i++) {
          const groove = new THREE.Mesh(new THREE.TorusGeometry(0.0245, 0.003, this.seg(4, 3), this.seg(12, 7)), black);
          groove.position.set(0, 0, -0.032 + i * 0.016);
          pump.add(groove);
        }
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(7, 5), this.seg(5, 4)), orange);
        bead.position.set(0, 0.05, 0.39);
        group.add(bead);
        const shellCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.09), black);
        shellCarrier.position.set(-0.022, 0.014, 0.0);
        group.add(shellCarrier);
        for (let i = 0; i < 4; i++) {
          const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, this.seg(8, 5)), orange);
          spare.rotation.z = Math.PI / 2;
          spare.position.set(-0.03, 0.014, -0.03 + i * 0.02);
          group.add(spare);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.056, 0.12), polymer);
        stock.position.set(0, -0.012, -0.12);
        stock.rotation.x = -0.1;
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.012), polymer);
        pad.position.set(0, -0.018, -0.184);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.075, 0.034), polymer);
        grip.position.set(0, -0.05, -0.046);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, black, 0, -0.024, -0.02, { guardR: 0.02 });
        this._gunShell(group, orange, 0.03, 0.014, 0.02, 0.009);
        return group;
      },

      // ---- 458: Breech-Loading Rifle ------------------------------------------
      createBreechLoadingRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x3A4048, { roughness: 0.38, metalness: 0.88 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x5C3317);

        // The moment it stopped being a muzzle-loader: a hinged block at the
        // breech that swings up and out of the way.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.42, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.25);
        group.add(barrel);
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.046, 0.1), blued);
        receiver.position.set(0, 0.016, 0.0);
        group.add(receiver);
        // The block, standing open.
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.04, 0.04), blued);
        block.position.set(0, 0.05, 0.01);
        block.rotation.x = -0.9;
        block.userData.gun = 'bolt';
        group.add(block);
        const thumbpiece = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.016), blued);
        thumbpiece.position.set(0, 0.02, -0.016);
        block.add(thumbpiece);
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(8, 5)), brass);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(0, 0.036, 0.03);
        group.add(hinge);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.026, 0.01), blued);
        hammer.position.set(0.016, 0.04, -0.04);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        this._gunStock(group, walnut, brass, { fore: 0.38, back: -0.2 });
        this._gunBands(group, blued, 0.023, 0.2, 0.36, 2);
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.004), blued);
        ladder.position.set(0, 0.048, 0.08);
        group.add(ladder);
        this._gunTrigger(group, blued, 0, -0.032, -0.028, { guardR: 0.02, guardArc: 1.3 });
        this._gunShell(group, brass, 0.028, 0.03, 0.0, 0.007);
        return group;
      },

      // ---- 459: Bubba's Shotgun -----------------------------------------------
      // Bubba's own, and it has been improved with whatever was in the truck.
      createBubbasShotgunModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x3A3F45, { roughness: 0.55, metalness: 0.78 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.3 });
        const wood = this._wood(0x6B4423);
        const tape = this._wood(0x2A2A2A);
        const red = this._mat(0xC0392B, { roughness: 0.7, metalness: 0.1 });
        const chrome = this._mat(0xC8CED4, { roughness: 0.2, metalness: 0.95 });

        // Sawn off short, then given back some length by a bolted-on choke.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.13), blued);
        receiver.position.set(0, 0.012, 0.01);
        group.add(receiver);
        for (const s of [-1, 1]) {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.19, this.seg(10, 6)), blued);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(s * 0.018, 0.032, 0.17);
          group.add(barrel);
          const cut = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, this.seg(4, 3), this.seg(11, 7)), rust);
          cut.position.set(s * 0.018, 0.032, 0.26);
          group.add(cut);
        }
        const choke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), chrome);
        choke.position.set(0, 0.032, 0.29);
        group.add(choke);
        for (let i = 0; i < 2; i++) {
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.064, 6), rust);
          bolt.rotation.z = Math.PI / 2;
          bolt.position.set(0, 0.032, 0.276 + i * 0.026);
          group.add(bolt);
        }
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.03), blued);
        lever.position.set(0, 0.042, -0.03);
        lever.rotation.y = 0.4;
        lever.userData.gun = 'bolt';
        group.add(lever);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.008), blued);
        hammer.position.set(0.012, 0.046, -0.05);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        // Pistol grip where a stock used to be, held on with tape and hope.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.04), wood);
        grip.position.set(0, -0.058, -0.05);
        grip.rotation.x = Math.PI / 7;
        group.add(grip);
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.028, 0.044), tape);
          wrap.position.set(0, -0.03 - i * 0.026, -0.038 - i * 0.012);
          wrap.rotation.x = Math.PI / 7;
          group.add(wrap);
        }
        // Shells taped to the side, because pockets are for other people.
        for (let i = 0; i < 3; i++) {
          const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, this.seg(8, 5)), red);
          sh.rotation.x = Math.PI / 2;
          sh.position.set(-0.026, 0.006 + i * 0.019, 0.02);
          group.add(sh);
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, this.seg(8, 5)), chrome);
          head.rotation.x = Math.PI / 2;
          head.position.set(-0.026, 0.006 + i * 0.019, -0.006);
          group.add(head);
        }
        const strapTape = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.062, 0.03), tape);
        strapTape.position.set(-0.026, 0.024, 0.02);
        group.add(strapTape);
        this._gunTrigger(group, blued, 0, -0.024, -0.02, { guard: false });
        this._gunShell(group, red, 0.03, 0.03, 0.0, 0.009);
        return group;
      },

      // ---- 460: Shotgun -------------------------------------------------------
      createShotgunPlainModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3238, { roughness: 0.45, metalness: 0.85 });
        const walnut = this._wood(0x5C3317);
        const red = this._mat(0xC0392B, { roughness: 0.7, metalness: 0.1 });
        const brass = this._cast(0xC9A227);

        // The plain pump gun: wooden furniture, a bead at the muzzle and
        // nothing else on it.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.052, 0.15), blued);
        receiver.position.set(0, 0.012, 0.01);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.36, this.seg(11, 7)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.27);
        group.add(barrel);
        const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, this.seg(10, 6)), blued);
        magTube.rotation.x = Math.PI / 2;
        magTube.position.set(0, -0.002, 0.25);
        group.add(magTube);
        const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, this.seg(11, 7)), walnut);
        pump.rotation.x = Math.PI / 2;
        pump.position.set(0, 0.014, 0.2);
        pump.userData.gun = 'slide';
        group.add(pump);
        for (let i = 0; i < 6; i++) {
          const groove = new THREE.Mesh(new THREE.TorusGeometry(0.0245, 0.0028, this.seg(4, 3), this.seg(12, 7)), blued);
          groove.position.set(0, 0, -0.038 + i * 0.015);
          pump.add(groove);
        }
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0035, this.seg(7, 5), this.seg(5, 4)), brass);
        bead.position.set(0, 0.052, 0.44);
        group.add(bead);
        const liftGate = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.008, 0.05), blued);
        liftGate.position.set(0, -0.014, 0.01);
        group.add(liftGate);
        this._gunStock(group, walnut, blued, { fore: 0.0, back: -0.19, ramrod: false });
        const safety = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(7, 5)), blued);
        safety.rotation.z = Math.PI / 2;
        safety.position.set(0, -0.012, -0.06);
        group.add(safety);
        this._gunTrigger(group, blued, 0, -0.026, -0.028, { guardR: 0.02 });
        this._gunShell(group, red, 0.03, 0.024, 0.01, 0.009);
        return group;
      },

      // ---- 461: Six-Shooter ---------------------------------------------------
      createSixShooterModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3A4E, { roughness: 0.28, metalness: 0.93 });
        const nickel = this._mat(0xC8CED4, { roughness: 0.16, metalness: 0.96 });
        const ivory = this._mat(0xE8E0CC, { roughness: 0.5, metalness: 0.05 });
        const brass = this._cast(0xC9A227);

        // Single action, ejector rod along the barrel, ivory grips: the one
        // everybody pictures.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.19, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.14);
        group.add(barrel);
        const ejectorHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.15, this.seg(9, 6)), blued);
        ejectorHousing.rotation.x = Math.PI / 2;
        ejectorHousing.position.set(0.014, 0.016, 0.13);
        group.add(ejectorHousing);
        const ejectorHead = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.014, this.seg(9, 6)), nickel);
        ejectorHead.rotation.x = Math.PI / 2;
        ejectorHead.position.set(0.014, 0.016, 0.05);
        group.add(ejectorHead);
        const foresight = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.008, 0.012), blued);
        foresight.position.set(0, 0.04, 0.222);
        group.add(foresight);
        this._gunCylinder(group, blued, brass, 0, 0.024, 0.028, 0.021, 6);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.046, 0.05), blued);
        frame.position.set(0, 0.018, -0.02);
        group.add(frame);
        const topStrap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.086), blued);
        topStrap.position.set(0, 0.044, 0.01);
        group.add(topStrap);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.028, 0.01), nickel);
        hammer.position.set(0, 0.052, -0.04);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const spur = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.007, 0.016), nickel);
        spur.position.set(0, 0.016, -0.006);
        hammer.add(spur);
        const loadingGate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.02), blued);
        loadingGate.position.set(0.02, 0.024, 0.006);
        group.add(loadingGate);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.088, 0.036), ivory);
        grip.position.set(0, -0.054, -0.042);
        grip.rotation.x = Math.PI / 6.5;
        group.add(grip);
        const backstrap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.092, 0.006), brass);
        backstrap.position.set(0, -0.054, -0.06);
        backstrap.rotation.x = Math.PI / 6.5;
        group.add(backstrap);
        const buttCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.036), brass);
        buttCap.position.set(0, -0.096, -0.058);
        group.add(buttCap);
        this._gunTrigger(group, nickel, 0, -0.018, -0.016, { guardR: 0.016, guardArc: 1.3 });
        return group;
      },

      // ---- 462: Lever Action Rifle --------------------------------------------
      createLeverActionRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3238, { roughness: 0.4, metalness: 0.88 });
        const brass = this._cast(0xC9A227);
        const walnut = this._wood(0x5C3317);

        // The lever IS the action, and it is the whole silhouette.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.056, 0.14), brass);
        receiver.position.set(0, 0.012, 0.0);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.4, 8), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.27);
        group.add(barrel);
        const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.38, this.seg(10, 6)), blued);
        magTube.rotation.x = Math.PI / 2;
        magTube.position.set(0, 0.006, 0.26);
        group.add(magTube);
        const forend = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), walnut);
        forend.position.set(0, 0.018, 0.14);
        group.add(forend);
        const bandRing = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(4, 3), this.seg(12, 7)), blued);
        bandRing.position.set(0, 0.018, 0.208);
        group.add(bandRing);
        // The loop, hanging under the wrist.
        const lever = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(5, 4), this.seg(14, 8), Math.PI * 1.5), brass);
        lever.position.set(0, -0.044, -0.02);
        lever.rotation.set(0, Math.PI / 2, 0.5);
        lever.userData.gun = 'bolt';
        group.add(lever);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.024, 0.01), blued);
        hammer.position.set(0, 0.05, -0.06);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.005), blued);
        ladder.position.set(0, 0.042, 0.09);
        group.add(ladder);
        const stockWrist = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.09), walnut);
        stockWrist.position.set(0, -0.014, -0.1);
        stockWrist.rotation.x = -0.12;
        group.add(stockWrist);
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.07, 0.09), walnut);
        butt.position.set(0, -0.03, -0.18);
        butt.rotation.x = -0.1;
        group.add(butt);
        const crescentPlate = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.076, 0.01), blued);
        crescentPlate.position.set(0, -0.034, -0.228);
        group.add(crescentPlate);
        this._gunTrigger(group, blued, 0, -0.03, -0.03, { guard: false });
        this._gunShell(group, brass, 0.026, 0.03, 0.0, 0.006);
        return group;
      },

      // ---- 463: Military Bolt-Action ------------------------------------------
      createMilitaryBoltActionModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x33383E, { roughness: 0.5, metalness: 0.82 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const walnut = this._wood(0x6B4423);
        const brass = this._cast(0xB9902A);

        // Service rifle: full-length stock, handguard over the barrel, sling
        // swivels, and a straight bolt handle.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.16), blued);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.42, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.028, 0.3);
        group.add(barrel);
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.24), walnut);
        handguard.position.set(0, 0.042, 0.24);
        group.add(handguard);
        this._gunStock(group, walnut, blued, { fore: 0.4, back: -0.2, ramrod: false });
        this._gunBands(group, blued, 0.024, 0.22, 0.42, 2);
        // The bolt, with its straight handle out to the side.
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, this.seg(10, 6)), bright);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.008, 0.03, 0.01);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, this.seg(7, 5)), bright);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.02, 0, -0.03);
        bolt.add(handle);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), bright);
        knob.position.set(0.042, 0, -0.03);
        bolt.add(knob);
        const magFloor = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.06), blued);
        magFloor.position.set(0, -0.03, 0.006);
        group.add(magFloor);
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.02), blued);
        rearSight.position.set(0, 0.05, 0.11);
        group.add(rearSight);
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.005), blued);
        frontSight.position.set(0, 0.046, 0.49);
        group.add(frontSight);
        const wings = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.002, this.seg(4, 3), this.seg(10, 6), Math.PI), blued);
        wings.position.set(0, 0.042, 0.49);
        wings.rotation.x = Math.PI / 2;
        group.add(wings);
        for (const z of [0.16, -0.14]) {
          const swivel = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(9, 6)), blued);
          swivel.position.set(0, -0.032, z);
          swivel.rotation.y = Math.PI / 2;
          group.add(swivel);
        }
        this._gunTrigger(group, blued, 0, -0.03, -0.03, { guardR: 0.02 });
        this._gunShell(group, brass, 0.026, 0.03, 0.02, 0.006);
        return group;
      },

      // ---- 464: Gas Launcher --------------------------------------------------
      createGasLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x4A5240, { roughness: 0.75, metalness: 0.35 });
        const black = this._mat(0x1E2024, { roughness: 0.8, metalness: 0.15 });
        const alloy = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.85 });
        const yellow = this._mat(0xE0B400, { roughness: 0.6, metalness: 0.1 });

        // Big bore, low pressure: a break-action launcher with a revolving
        // drum of canisters.
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, this.seg(14, 8)), olive);
        drum.rotation.x = Math.PI / 2;
        drum.position.set(0, 0.02, 0.02);
        drum.userData.gun = 'cylinder';
        group.add(drum);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.092, this.seg(9, 6)), black);
          bore.position.set(Math.cos(a) * 0.034, Math.sin(a) * 0.034, 0);
          drum.add(bore);
          const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.05, this.seg(9, 6)), yellow);
          canister.position.set(Math.cos(a) * 0.034, Math.sin(a) * 0.034, -0.03);
          drum.add(canister);
        }
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, this.seg(9, 6)), alloy);
        axle.rotation.x = Math.PI / 2;
        axle.position.set(0, 0.02, 0.02);
        group.add(axle);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.16, this.seg(12, 7)), olive);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.05, 0.15);
        group.add(barrel);
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.06, this.seg(12, 7)), black);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 0.05, 0.2);
        group.add(shroud);
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.005), black);
        ladder.position.set(0, 0.086, 0.06);
        ladder.rotation.x = -0.4;
        group.add(ladder);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.12), black);
        stock.position.set(0, -0.006, -0.11);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.06, 0.014), black);
        pad.position.set(0, -0.01, -0.176);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.034), black);
        grip.position.set(0, -0.05, -0.05);
        grip.rotation.x = 0.16;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.06, this.seg(9, 6)), black);
        foregrip.position.set(0, -0.02, 0.13);
        group.add(foregrip);
        this._gunTrigger(group, alloy, 0, -0.022, -0.024, { guardR: 0.02 });
        return group;
      },

      // ---- 465: Double-Barrel Shotgun -----------------------------------------
      createDoubleBarrelShotgunModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2A2E34, { roughness: 0.35, metalness: 0.9 });
        const case_ = this._mat(0xA89060, { roughness: 0.45, metalness: 0.55 });
        const walnut = this._wood(0x5C3317);
        const red = this._mat(0xC0392B, { roughness: 0.7, metalness: 0.1 });

        // Side by side, with a case-hardened action and a rib between the
        // tubes. The top lever is what opens it.
        for (const s of [-1, 1]) {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.42, this.seg(11, 7)), blued);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(s * 0.018, 0.03, 0.27);
          group.add(barrel);
        }
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.42), blued);
        rib.position.set(0, 0.044, 0.27);
        group.add(rib);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0035, this.seg(7, 5), this.seg(5, 4)), case_);
        bead.position.set(0, 0.05, 0.475);
        group.add(bead);
        const action = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.11), case_);
        action.position.set(0, 0.014, 0.01);
        group.add(action);
        const topLever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.05), blued);
        topLever.position.set(0, 0.042, -0.03);
        topLever.rotation.y = 0.35;
        topLever.userData.gun = 'bolt';
        group.add(topLever);
        for (const s of [-1, 1]) {
          const hammerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, this.seg(7, 5)), blued);
          hammerPin.rotation.z = Math.PI / 2;
          hammerPin.position.set(s * 0.026, 0.02, 0.02);
          group.add(hammerPin);
        }
        const forend = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.14), walnut);
        forend.position.set(0, 0.006, 0.14);
        group.add(forend);
        const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.09), walnut);
        wrist.position.set(0, -0.014, -0.09);
        wrist.rotation.x = -0.14;
        group.add(wrist);
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.066, 0.1), walnut);
        butt.position.set(0, -0.03, -0.18);
        butt.rotation.x = -0.1;
        group.add(butt);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.07, 0.01), blued);
        pad.position.set(0, -0.034, -0.232);
        group.add(pad);
        // Two triggers, one per barrel, which is the giveaway.
        this._gunTrigger(group, blued, 0, -0.026, -0.02, { guardR: 0.022, guardArc: 1.2 });
        const second = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.018, 0.005), blued);
        second.position.set(0, -0.028, -0.034);
        group.add(second);
        this._gunShell(group, red, 0.03, 0.028, 0.0, 0.009);
        return group;
      },

      // ---- 466: Tranquilizer Rifle --------------------------------------------
      createTranquilizerRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x3A4A38, { roughness: 0.7, metalness: 0.3 });
        const alloy = this._mat(0xA8AEB4, { roughness: 0.35, metalness: 0.9 });
        const glass = this._mat(0xBFD8E0, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const serum = this._glow(0x7CFF3D, 0.7);
        const black = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.06 });

        // Compressed air, a long light barrel and darts you can see: field
        // veterinary kit that somebody took to work.
        const airTank = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, this.seg(11, 7)), alloy);
        airTank.rotation.x = Math.PI / 2;
        airTank.position.set(0, -0.026, 0.06);
        group.add(airTank);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, this.seg(11, 7)), black);
        gauge.position.set(0, -0.006, 0.0);
        gauge.rotation.x = Math.PI / 2;
        group.add(gauge);
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.14), olive);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.36, this.seg(10, 6)), alloy);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.27);
        group.add(barrel);
        // The dart, in the breech, with its serum showing.
        const dartBody = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.04, this.seg(9, 6)), glass);
        dartBody.rotation.x = Math.PI / 2;
        dartBody.position.set(0, 0.03, 0.1);
        group.add(dartBody);
        const dose = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, this.seg(9, 6)), serum);
        dose.rotation.x = Math.PI / 2;
        dose.position.set(0, 0.03, 0.098);
        dose.userData.pulse = { min: 0.4, max: 1.0, freq: 0.9 };
        group.add(dose);
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.018, this.seg(6, 4)), this._mat(0xE8342B, { roughness: 0.95 }));
        tuft.rotation.x = -Math.PI / 2;
        tuft.position.set(0, 0.03, 0.074);
        group.add(tuft);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.07, this.seg(9, 6)), alloy);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.006, 0.03, 0.0);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(7, 5)), alloy);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.016, 0, -0.02);
        bolt.add(handle);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, this.seg(11, 7)), black);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.066, 0.05);
        group.add(scope);
        for (const z of [0.01, 0.08]) {
          const mount = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.012), black);
          mount.position.set(0, 0.056, z);
          group.add(mount);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.13), olive);
        stock.position.set(0, -0.006, -0.11);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.058, 0.012), black);
        pad.position.set(0, -0.01, -0.18);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.032), olive);
        grip.position.set(0, -0.05, -0.05);
        grip.rotation.x = 0.16;
        group.add(grip);
        this._gunTrigger(group, alloy, 0, -0.022, -0.026, {});
        return group;
      },

      // ---- 467: SMG -----------------------------------------------------------
      createSMGPlainModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x24262A, { roughness: 0.5, metalness: 0.8 });
        const polymer = this._mat(0x18191C, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xC9A227);

        // Compact, boxy, and built around a magazine that goes through the
        // grip.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.17), black);
        receiver.position.set(0, 0.012, 0.02);
        group.add(receiver);
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.09, this.seg(11, 7)), black);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 0.024, 0.14);
        group.add(shroud);
        const vents = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < vents; i++) {
          const a = (i / vents) * Math.PI * 2;
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.036, this.seg(6, 4)), polymer);
          hole.rotation.z = Math.PI / 2;
          hole.position.set(Math.cos(a) * 0.017, 0.024 + Math.sin(a) * 0.017, 0.14);
          hole.rotation.y = a;
          group.add(hole);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.12, this.seg(9, 6)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.16);
        group.add(barrel);
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.05), bright);
        bolt.position.set(0.02, 0.03, 0.02);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.024, this.seg(7, 5)), bright);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.014, 0, 0);
        bolt.add(handle);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.038), polymer);
        grip.position.set(0, -0.062, -0.02);
        group.add(grip);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.11, 0.03), black);
        mag.position.set(0, -0.07, -0.02);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const floor = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.034), polymer);
        floor.position.set(0, -0.128, -0.02);
        group.add(floor);
        // Folding stock, at the moment folded.
        for (const s of [-1, 1]) {
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, this.seg(7, 5)), bright);
          strut.rotation.x = Math.PI / 2;
          strut.position.set(s * 0.024, 0.006, -0.1);
          group.add(strut);
        }
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), bright);
        shoulder.position.set(0, 0.006, -0.17);
        group.add(shoulder);
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.008), black);
        rearSight.position.set(0, 0.044, -0.05);
        group.add(rearSight);
        this._gunTrigger(group, bright, 0, -0.024, 0.028, {});
        this._gunShell(group, brass, 0.03, 0.03, 0.04, 0.005);
        return group;
      },

      // ---- 468: Bolt-Action Rifle ---------------------------------------------
      createBoltActionRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3238, { roughness: 0.38, metalness: 0.88 });
        const bright = this._mat(0xA8AEB4, { roughness: 0.28, metalness: 0.93 });
        const walnut = this._wood(0x4A2A14);
        const brass = this._cast(0xB9902A);

        // A sporting rifle rather than a service one: no handguard, a checked
        // stock, a scope and a bent bolt handle that clears it.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.046, 0.16), blued);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.44, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.31);
        group.add(barrel);
        this._gunStock(group, walnut, blued, { fore: 0.26, back: -0.2, ramrod: false });
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, this.seg(10, 6)), bright);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.008, 0.03, 0.0);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const handleArm = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(7, 5)), bright);
        handleArm.rotation.set(0, 0, Math.PI / 2 - 0.5);
        handleArm.position.set(0.016, -0.008, -0.03);
        bolt.add(handleArm);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(8, 5), this.seg(6, 4)), bright);
        knob.position.set(0.03, -0.02, -0.03);
        bolt.add(knob);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, this.seg(12, 7)), blued);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.068, 0.04);
        group.add(scope);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.03, this.seg(12, 7)), blued);
        bell.rotation.x = Math.PI / 2;
        bell.position.set(0, 0.068, 0.12);
        group.add(bell);
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.016, this.seg(10, 6)), blued);
        turret.position.set(0, 0.086, 0.05);
        group.add(turret);
        for (const z of [-0.01, 0.09]) {
          const ring = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.012), bright);
          ring.position.set(0, 0.056, z);
          group.add(ring);
        }
        const magFloor = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.07), blued);
        magFloor.position.set(0, -0.03, 0.006);
        group.add(magFloor);
        this._gunTrigger(group, blued, 0, -0.03, -0.028, { guardR: 0.019 });
        this._gunShell(group, brass, 0.026, 0.03, 0.02, 0.006);
        return group;
      },

      // ---- 469: Tommy Gun -----------------------------------------------------
      createTommyGunModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2A2E34, { roughness: 0.4, metalness: 0.88 });
        const walnut = this._wood(0x5C3317);
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xC9A227);

        // The drum, the finned barrel and the vertical foregrip: nothing else
        // looks like it.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.16), blued);
        receiver.position.set(0, 0.014, 0.01);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.22, this.seg(10, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.19);
        group.add(barrel);
        // Cooling fins, the ones nobody needed but everybody remembers.
        const fins = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < fins; i++) {
          const fin = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, this.seg(4, 3), this.seg(12, 7)), blued);
          fin.position.set(0, 0.03, 0.11 + i * 0.019);
          group.add(fin);
        }
        const comp = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.04), blued);
        comp.position.set(0, 0.03, 0.31);
        group.add(comp);
        for (let i = 0; i < 3; i++) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.004, 0.005), walnut);
          slot.position.set(0, 0.042, 0.3 + i * 0.011);
          group.add(slot);
        }
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.026, this.seg(16, 9)), blued);
        drum.position.set(0, -0.042, 0.02);
        drum.rotation.x = Math.PI / 2;
        drum.userData.gun = 'magazine';
        group.add(drum);
        const drumHub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, this.seg(10, 6)), bright);
        drumHub.position.set(0, -0.042, 0.02);
        drumHub.rotation.x = Math.PI / 2;
        group.add(drumHub);
        const winder = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.006), bright);
        winder.position.set(0, -0.042, 0.036);
        winder.userData.spin = { axis: 'z', speed: 0.6 };
        group.add(winder);
        const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, this.seg(9, 6)), bright);
        boltHandle.position.set(0, 0.046, 0.0);
        boltHandle.userData.gun = 'bolt';
        group.add(boltHandle);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.07, this.seg(10, 6)), walnut);
        foregrip.position.set(0, -0.038, 0.13);
        group.add(foregrip);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), walnut);
        grip.position.set(0, -0.056, -0.03);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.058, 0.12), walnut);
        stock.position.set(0, -0.008, -0.14);
        stock.rotation.x = -0.1;
        group.add(stock);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.062, 0.01), blued);
        plate.position.set(0, -0.014, -0.202);
        group.add(plate);
        this._gunTrigger(group, blued, 0, -0.024, -0.008, { guardR: 0.019 });
        this._gunShell(group, brass, 0.028, 0.03, 0.02, 0.005);
        return group;
      },

      // ---- 470: Air Pistol ----------------------------------------------------
      createAirPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x4A4F55, { roughness: 0.4, metalness: 0.85 });
        const bright = this._mat(0xB8BEC4, { roughness: 0.25, metalness: 0.93 });
        const beech = this._wood(0xC8A870);

        // Break-barrel target pistol: the barrel is the cocking lever, so it
        // is hinged and sitting open.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.042, 0.13), alloy);
        receiver.position.set(0, 0.014, -0.01);
        group.add(receiver);
        const barrelPivot = new THREE.Group();
        barrelPivot.position.set(0, 0.03, 0.05);
        barrelPivot.rotation.x = -0.22;
        barrelPivot.userData.gun = 'slide';
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.18, this.seg(10, 6)), alloy);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.09;
        barrelPivot.add(barrel);
        const breechBlock = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.03), bright);
        breechBlock.position.z = 0.005;
        barrelPivot.add(breechBlock);
        const foresight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.01, 0.006), bright);
        foresight.position.set(0, 0.016, 0.174);
        barrelPivot.add(foresight);
        group.add(barrelPivot);
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, this.seg(8, 5)), bright);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(0, 0.03, 0.05);
        group.add(hinge);
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.014), bright);
        rearSight.position.set(0, 0.042, -0.06);
        group.add(rearSight);
        const elev = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, this.seg(8, 5)), bright);
        elev.position.set(0, 0.05, -0.06);
        group.add(elev);
        // Anatomical target grip, which is most of the mass.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.095, 0.05), beech);
        grip.position.set(0, -0.062, -0.036);
        grip.rotation.x = Math.PI / 10;
        group.add(grip);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.03), beech);
        shelf.position.set(0, -0.105, -0.05);
        group.add(shelf);
        const thumbrest = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(9, 6), this.seg(6, 4)), beech);
        thumbrest.scale.set(0.5, 1, 1);
        thumbrest.position.set(-0.018, -0.05, -0.032);
        group.add(thumbrest);
        this._gunTrigger(group, bright, 0, -0.026, -0.03, { guardR: 0.018, guardArc: 1.3 });
        return group;
      },

      // ---- 471: Volley Gun ----------------------------------------------------
      createVolleyGunModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x5E6368, { roughness: 0.5, metalness: 0.82 });
        const brass = this._cast(0xB9902A);
        const walnut = this._wood(0x5C3317);

        // Seven barrels in a bundle, all fired at once, and famous mostly for
        // breaking the shoulders of the men issued with it.
        const cluster = new THREE.Group();
        cluster.position.set(0, 0.03, 0.2);
        const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.34, this.seg(10, 6)), iron);
        centre.rotation.x = Math.PI / 2;
        cluster.add(centre);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.34, this.seg(10, 6)), iron);
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0);
          cluster.add(b);
        }
        group.add(cluster);
        const bands = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < bands; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, this.seg(4, 3), this.seg(14, 8)), brass);
          band.position.set(0, 0.03, 0.07 + i * 0.09);
          group.add(band);
        }
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.05, this.seg(12, 7)), iron);
        breech.rotation.x = Math.PI / 2;
        breech.position.set(0, 0.03, 0.01);
        group.add(breech);
        this._gunStock(group, walnut, brass, { fore: 0.06, back: -0.18, ramrod: false });
        this._gunLock(group, iron, brass, 'flintlock', 0, 0.014, -0.02);
        this._gunTrigger(group, iron, 0, -0.03, -0.036, { guardR: 0.019, guardArc: 1.3 });
        return group;
      },

      // ---- 472: PDW -----------------------------------------------------------
      createPDWModel(weapon, rand) {
        const group = new THREE.Group();
        const polymer = this._mat(0x22242A, { roughness: 0.82, metalness: 0.06 });
        const alloy = this._mat(0x6E7378, { roughness: 0.4, metalness: 0.88 });
        const bright = this._mat(0xA8AEB4, { roughness: 0.3, metalness: 0.92 });
        const glow = this._glow(0xFF3A3A, 0.7);
        const brass = this._cast(0xC9A227);

        // Modern personal defence weapon: one polymer shell, a magazine lying
        // flat along the top, and everything ambidextrous.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.062, 0.24), polymer);
        shell.position.set(0, 0.008, 0.04);
        group.add(shell);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.15), this._mat(0x2E3238, { roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.75 }));
        mag.position.set(0, 0.048, 0.03);
        mag.userData.gun = 'magazine';
        group.add(mag);
        // The rounds visible through the translucent body, lying on their side.
        const rounds = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < rounds; i++) {
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.024, this.seg(6, 4)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0, 0.052, -0.03 + i * 0.016);
          group.add(r);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.1, this.seg(9, 6)), alloy);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.014, 0.2);
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.026, this.seg(10, 6)), alloy);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.014, 0.25);
        group.add(brake);
        const optic = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.05), polymer);
        optic.position.set(0, 0.076, 0.09);
        group.add(optic);
        const reticle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.002), glow);
        reticle.position.set(0, 0.076, 0.116);
        reticle.userData.pulse = { min: 0.4, max: 1.1, freq: 1.4 };
        group.add(reticle);
        const charging = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 0.03), bright);
        charging.position.set(0.024, 0.03, 0.09);
        charging.userData.gun = 'charging';
        group.add(charging);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.04), polymer);
        grip.position.set(0, -0.058, -0.01);
        grip.rotation.x = 0.08;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.03), polymer);
        foregrip.position.set(0, -0.038, 0.15);
        group.add(foregrip);
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.014), polymer);
        shoulder.position.set(0, 0.004, -0.085);
        group.add(shoulder);
        const sling = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(9, 6)), bright);
        sling.position.set(0.022, -0.02, -0.07);
        sling.rotation.y = Math.PI / 2;
        group.add(sling);
        this._gunTrigger(group, bright, 0, -0.022, 0.03, { curl: 0.2 });
        this._gunShell(group, brass, 0.03, 0.0, 0.06, 0.004);
        return group;
      },

      // ---- 473: Paralyzer -----------------------------------------------------
      createParalyzerModel(weapon, rand) {
        const group = new THREE.Group();
        const white = this._mat(0xE4E8EC, { roughness: 0.35, metalness: 0.4 });
        const grey = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.7 });
        const pulseColor = this.getRandomColor(rand, [0x7DD3FF, 0xC77DFF]);
        const emitter = this._glow(pulseColor, 1.3);
        const dark = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.1 });

        // Clinical rather than military: a nerve-block emitter in a moulded
        // white shell, with rings that fire in sequence down the barrel.
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.18, this.seg(14, 8)), white);
        shell.rotation.x = Math.PI / 2;
        shell.position.set(0, 0.02, 0.03);
        group.add(shell);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.18), grey);
        spine.position.set(0, 0.052, 0.03);
        group.add(spine);
        const rings = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026 - i * 0.002, 0.004, this.seg(4, 3), this.seg(14, 8)), emitter);
          ring.position.set(0, 0.02, 0.13 + i * 0.028);
          ring.userData.pulse = { min: 0.05, max: 1.5, freq: 2.2, phase: -i * 0.7 };
          group.add(ring);
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, this.seg(6, 4)), grey);
          strut.rotation.x = Math.PI / 2;
          strut.position.set(0, 0.046, 0.2);
          if (i === 0) group.add(strut);
        }
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, this.seg(9, 6)), emitter);
        core.rotation.x = Math.PI / 2;
        core.position.set(0, 0.02, 0.19);
        core.userData.pulse = { min: 0.5, max: 1.6, freq: 3.4 };
        group.add(core);
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.04), dark);
        cell.position.set(0, -0.03, 0.0);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.004), emitter);
        gauge.position.set(0.016, -0.03, 0.02);
        gauge.userData.pulse = { min: 0.3, max: 1.0, freq: 0.8 };
        group.add(gauge);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), white);
        grip.position.set(0, -0.06, -0.05);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.008), dark);
        pad.position.set(0, -0.058, -0.07);
        pad.rotation.x = Math.PI / 9;
        group.add(pad);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.05), white);
        brace.position.set(0, 0.01, -0.09);
        group.add(brace);
        this._gunTrigger(group, grey, 0, -0.026, -0.026, {});
        return group;
      },

      // ---- 474: Compact SMG ---------------------------------------------------
      createCompactSMGModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x1E2024, { roughness: 0.55, metalness: 0.78 });
        const polymer = this._mat(0x18191C, { roughness: 0.86, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xC9A227);

        // Machine pistol: everything cut down until it fits under a coat.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.11), black);
        receiver.position.set(0, 0.012, 0.01);
        group.add(receiver);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.12), black);
        upper.position.set(0, 0.042, 0.015);
        group.add(upper);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.06, this.seg(9, 6)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.09);
        group.add(barrel);
        const threads = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.016, this.seg(9, 6)), bright);
        threads.rotation.x = Math.PI / 2;
        threads.position.set(0, 0.026, 0.118);
        group.add(threads);
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.04), bright);
        bolt.position.set(0.018, 0.042, 0.01);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.036), polymer);
        grip.position.set(0, -0.056, -0.01);
        group.add(grip);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.08, 0.028), black);
        mag.position.set(0, -0.062, -0.01);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const extension = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.03), polymer);
        extension.position.set(0, -0.11, -0.01);
        group.add(extension);
        // Wire stock, folded flat along the side.
        for (const s of [-1, 1]) {
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.1, this.seg(7, 5)), bright);
          wire.rotation.x = Math.PI / 2;
          wire.position.set(s * 0.02, 0.014, -0.08);
          group.add(wire);
        }
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.01, 0.016), bright);
        cap.position.set(0, 0.014, -0.132);
        group.add(cap);
        const foreStrap = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), polymer);
        foreStrap.position.set(0, -0.012, 0.06);
        foreStrap.rotation.set(0, Math.PI / 2, Math.PI);
        group.add(foreStrap);
        this._gunTrigger(group, bright, 0, -0.022, 0.018, {});
        this._gunShell(group, brass, 0.026, 0.042, 0.03, 0.004);
        return group;
      },

      // ---- 475: M1 Garand -----------------------------------------------------
      createM1GarandModel(weapon, rand) {
        const group = new THREE.Group();
        const parked = this._mat(0x36393E, { roughness: 0.62, metalness: 0.72 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const walnut = this._wood(0x6B4423);
        const brass = this._cast(0xC9A227);

        // The gas-operated one, with the op rod down the right side and the
        // clip standing proud of the receiver.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.16), parked);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.4, this.seg(10, 6)), parked);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.3);
        group.add(barrel);
        // Op rod and its gas cylinder, the parts that make it a Garand.
        const opRod = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.34), bright);
        opRod.position.set(0.02, 0.016, 0.24);
        opRod.userData.gun = 'bolt';
        group.add(opRod);
        const opHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.016, this.seg(9, 6)), bright);
        opHandle.rotation.z = Math.PI / 2;
        opHandle.position.set(0.028, 0.02, 0.07);
        opRod.add(opHandle);
        const gasCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, this.seg(10, 6)), parked);
        gasCyl.rotation.x = Math.PI / 2;
        gasCyl.position.set(0, 0.03, 0.47);
        group.add(gasCyl);
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.005), parked);
        frontSight.position.set(0, 0.052, 0.482);
        group.add(frontSight);
        for (const s of [-1, 1]) {
          const wing = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.008), parked);
          wing.position.set(s * 0.008, 0.05, 0.482);
          group.add(wing);
        }
        const rearAperture = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.003, this.seg(4, 3), this.seg(10, 6)), parked);
        rearAperture.position.set(0, 0.046, -0.05);
        group.add(rearAperture);
        for (const s of [-1, 1]) {
          const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, this.seg(9, 6)), parked);
          knob.rotation.z = Math.PI / 2;
          knob.position.set(s * 0.018, 0.042, -0.05);
          group.add(knob);
        }
        // The clip, sitting up in the open action.
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.05), bright);
        clip.position.set(0, 0.042, 0.01);
        clip.userData.gun = 'magazine';
        group.add(clip);
        for (let i = 0; i < 3; i++) {
          const round_ = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, this.seg(7, 5)), brass);
          round_.rotation.x = Math.PI / 2;
          round_.position.set(-0.007 + i * 0.007, 0.05, 0.01);
          group.add(round_);
        }
        this._gunStock(group, walnut, parked, { fore: 0.36, back: -0.2, ramrod: false });
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.18), walnut);
        handguard.position.set(0, 0.046, 0.24);
        group.add(handguard);
        this._gunBands(group, parked, 0.024, 0.2, 0.4, 2);
        this._gunTrigger(group, parked, 0, -0.03, -0.03, { guardR: 0.02 });
        this._gunShell(group, brass, 0.028, 0.042, 0.03, 0.006);
        return group;
      },

      // ---- 476: Double-Barrel Pistol ------------------------------------------
      createDoubleBarrelPistolModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2E3238, { roughness: 0.34, metalness: 0.9 });
        const case_ = this._mat(0xA89060, { roughness: 0.45, metalness: 0.55 });
        const walnut = this._wood(0x4A2A14);
        const brass = this._cast(0xC9A227);

        // A shotgun's action shrunk to fit a coat pocket: two barrels, two
        // hammers, two triggers and no pretence of range.
        for (const s of [-1, 1]) {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.13, this.seg(11, 7)), blued);
          barrel.rotation.x = Math.PI / 2;
          barrel.position.set(s * 0.015, 0.03, 0.1);
          group.add(barrel);
          const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.008), case_);
          hammer.position.set(s * 0.014, 0.05, -0.048);
          if (s === 1) hammer.userData.gun = 'hammer';
          group.add(hammer);
          const spur = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.005, 0.012), case_);
          spur.position.set(s * 0.014, 0.062, -0.054);
          group.add(spur);
        }
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.13), blued);
        rib.position.set(0, 0.042, 0.1);
        group.add(rib);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(6, 4), this.seg(4, 3)), brass);
        bead.position.set(0, 0.047, 0.162);
        group.add(bead);
        const action = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.046, 0.07), case_);
        action.position.set(0, 0.018, 0.0);
        group.add(action);
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.036), blued);
        lever.position.set(0, 0.042, -0.024);
        lever.rotation.y = 0.4;
        lever.userData.gun = 'bolt';
        group.add(lever);
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.044, this.seg(8, 5)), blued);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(0, 0.008, 0.032);
        group.add(hinge);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.036), walnut);
        grip.position.set(0, -0.052, -0.042);
        grip.rotation.x = Math.PI / 7;
        group.add(grip);
        const buttCap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.01, 0.038), brass);
        buttCap.position.set(0, -0.092, -0.058);
        group.add(buttCap);
        this._gunTrigger(group, blued, 0, -0.02, -0.014, { guardR: 0.018, guardArc: 1.2 });
        const second = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.005), blued);
        second.position.set(0, -0.022, -0.026);
        group.add(second);
        this._gunShell(group, brass, 0.028, 0.03, 0.0, 0.007);
        return group;
      }
,

      /** Picatinny rail with its teeth, the mounting point of every modern gun. */
      _gunRail(group, mat, tooth, x, y, z, len) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, len), mat);
        rail.position.set(x, y, z);
        group.add(rail);
        const n = this.isLowDetail() ? 4 : Math.max(3, Math.round(len / 0.024));
        for (let i = 0; i < n; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.004, 0.004), tooth);
          t.position.set(x, y + 0.004, z - len / 2 + 0.012 + i * ((len - 0.024) / Math.max(1, n - 1)));
          group.add(t);
        }
        return group;
      },

      /** Sight: 0 irons, 1 red dot, 2 magnified scope. */
      _gunOptic(group, body, bright, glass, kind, x, y, z) {
        if (kind === 2) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.13, this.seg(12, 7)), body);
          tube.rotation.x = Math.PI / 2;
          tube.position.set(x, y, z);
          group.add(tube);
          const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.03, this.seg(12, 7)), body);
          bell.rotation.x = Math.PI / 2;
          bell.position.set(x, y, z + 0.08);
          group.add(bell);
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, this.seg(12, 7)), glass);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(x, y, z + 0.095);
          group.add(lens);
          const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, this.seg(9, 6)), bright);
          turret.position.set(x, y + 0.02, z + 0.01);
          group.add(turret);
          const windage = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, this.seg(9, 6)), bright);
          windage.rotation.z = Math.PI / 2;
          windage.position.set(x + 0.02, y, z + 0.01);
          group.add(windage);
          for (const dz of [-0.045, 0.045]) {
            const ring = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.012), bright);
            ring.position.set(x, y - 0.012, z + dz);
            group.add(ring);
          }
        } else if (kind === 1) {
          const shell = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.05), body);
          shell.position.set(x, y, z);
          group.add(shell);
          const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.002), glass);
          window_.position.set(x, y, z + 0.026);
          group.add(window_);
          const mount = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.03), bright);
          mount.position.set(x, y - 0.022, z);
          group.add(mount);
        } else {
          const rear = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.003, this.seg(4, 3), this.seg(10, 6)), bright);
          rear.position.set(x, y, z - 0.05);
          group.add(rear);
          const front = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.005), bright);
          front.position.set(x, y, z + 0.09);
          group.add(front);
          for (const s of [-1, 1]) {
            const wing = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.008), bright);
            wing.position.set(x + s * 0.008, y - 0.002, z + 0.09);
            group.add(wing);
          }
        }
        return group;
      },

      /**
       * AR-pattern core: upper and lower receiver, magazine well, buffer tube
       * and pistol grip. Most modern rifles here are this plus their own
       * handguard, barrel and furniture.
       */
      _gunAR(group, body, polymer, bright, opts) {
        const o = opts || {};
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.042, 0.17), body);
        upper.position.set(0, 0.026, 0.02);
        group.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.036, 0.13), polymer);
        lower.position.set(0, -0.012, 0.0);
        group.add(lower);
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.044), polymer);
        port.position.set(0.018, 0.03, 0.03);
        group.add(port);
        const deflector = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.022, 0.018), body);
        deflector.position.set(0.02, 0.04, 0.008);
        deflector.rotation.z = -0.45;
        group.add(deflector);
        const forward = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, this.seg(8, 5)), bright);
        forward.rotation.z = Math.PI / 2;
        forward.position.set(0.02, 0.02, -0.03);
        group.add(forward);
        const charging = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.05), bright);
        charging.position.set(0, 0.05, -0.07);
        charging.userData.gun = 'charging';
        group.add(charging);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.008), bright);
        latch.position.set(-0.012, 0.05, -0.09);
        group.add(latch);
        if (o.mag !== false) {
          const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, o.magLen || 0.11, 0.03), o.magMat || polymer);
          mag.position.set(0, -0.032 - (o.magLen || 0.11) / 2, -0.004);
          mag.rotation.x = -0.14;
          mag.userData.gun = 'magazine';
          group.add(mag);
          const floor = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.034), polymer);
          floor.position.set(0, -0.036 - (o.magLen || 0.11), 0.012);
          group.add(floor);
          const release = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, this.seg(7, 5)), bright);
          release.rotation.z = Math.PI / 2;
          release.position.set(0.018, -0.024, -0.014);
          group.add(release);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.036), polymer);
        grip.position.set(0, -0.066, -0.06);
        grip.rotation.x = 0.28;
        group.add(grip);
        if (o.stock !== false) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, this.seg(10, 6)), body);
          tube.rotation.x = Math.PI / 2;
          tube.position.set(0, 0.016, -0.12);
          group.add(tube);
          const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.09), polymer);
          stock.position.set(0, 0.006, -0.14);
          group.add(stock);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.056, 0.012), this._mat(0x141416, { roughness: 0.95 }));
          pad.position.set(0, 0.002, -0.19);
          group.add(pad);
        }
        this._gunTrigger(group, bright, 0, -0.03, -0.03, { curl: 0.2, guardR: 0.02 });
        return group;
      },

      // ---- 477: MP40 ----------------------------------------------------------
      createMP40Model(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.82 });
        const bakelite = this._mat(0x3A2A1C, { roughness: 0.75, metalness: 0.08 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xC9A227);

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.16, this.seg(12, 7)), blued);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0.02);
        group.add(tube);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.14, this.seg(9, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.17);
        group.add(barrel);
        const restBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.014, this.seg(10, 6)), bakelite);
        restBar.rotation.x = Math.PI / 2;
        restBar.position.set(0, 0.012, 0.23);
        group.add(restBar);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, this.seg(8, 5)), bright);
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(-0.024, 0.03, 0.03);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        // The magazine housing, which is also the foregrip: the mistake every
        // soldier made was holding the magazine itself.
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.036), blued);
        housing.position.set(0, -0.024, 0.02);
        group.add(housing);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.12, 0.028), blued);
        mag.position.set(0, -0.104, 0.02);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.09), bakelite);
        receiver.position.set(0, -0.006, -0.08);
        group.add(receiver);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.032), bakelite);
        grip.position.set(0, -0.052, -0.07);
        group.add(grip);
        // Underfolding stock, folded.
        for (const s of [-1, 1]) {
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, this.seg(7, 5)), bright);
          strut.rotation.x = Math.PI / 2 - 0.15;
          strut.position.set(s * 0.014, -0.05, -0.13);
          group.add(strut);
        }
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.01, 0.03), bright);
        plate.position.set(0, -0.068, -0.19);
        group.add(plate);
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.006), blued);
        sight.position.set(0, 0.042, -0.05);
        group.add(sight);
        this._gunTrigger(group, bright, 0, -0.024, -0.038, {});
        this._gunShell(group, brass, 0.026, 0.03, 0.03, 0.005);
        return group;
      },

      // ---- 478: Assault Rifle -------------------------------------------------
      createAssaultRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x2E3238, { roughness: 0.5, metalness: 0.82 });
        const polymer = this._mat(0x1C1E22, { roughness: 0.84, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const brass = this._cast(0xC9A227);

        this._gunAR(group, body, polymer, bright, { magLen: 0.12 });
        const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.023, 0.17, this.seg(11, 7)), polymer);
        handguard.rotation.x = Math.PI / 2;
        handguard.position.set(0, 0.024, 0.19);
        group.add(handguard);
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            for (const s of [-1, 1]) {
              const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.018), body);
              slot.position.set(s * 0.021, 0.024, 0.13 + i * 0.03);
              group.add(slot);
            }
          }
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.12, this.seg(9, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.32);
        group.add(barrel);
        const gasBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.03), bright);
        gasBlock.position.set(0, 0.03, 0.29);
        group.add(gasBlock);
        const hider = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.04, this.seg(10, 6), 1, true), bright);
        hider.rotation.x = Math.PI / 2;
        hider.position.set(0, 0.024, 0.4);
        hider.userData.gun = 'muzzle';
        group.add(hider);
        this._gunRail(group, body, bright, 0, 0.052, 0.12, 0.28);
        this._gunOptic(group, body, bright, this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }), 1, 0, 0.072, 0.02);
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.005);
        return group;
      },

      // ---- 479: Magnum Revolver -----------------------------------------------
      createMagnumRevolverModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8A9096, { roughness: 0.22, metalness: 0.95 });
        const dark = this._mat(0x2A2E34, { roughness: 0.4, metalness: 0.85 });
        const rubber = this._mat(0x18181A, { roughness: 0.95, metalness: 0.02 });
        const brass = this._cast(0xC9A227);

        // Stainless, ported, and far more gun than anybody needs.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.2, this.seg(11, 7)), steel);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.028, 0.15);
        group.add(barrel);
        const underlug = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.19), steel);
        underlug.position.set(0, 0.01, 0.15);
        group.add(underlug);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, 0.2), steel);
        rib.position.set(0, 0.043, 0.15);
        group.add(rib);
        // Compensator cuts along the top of the barrel.
        for (let i = 0; i < 4; i++) {
          const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.008), dark);
          port.position.set(0, 0.044, 0.19 + i * 0.014);
          group.add(port);
        }
        const foresight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.012), dark);
        foresight.position.set(0, 0.052, 0.235);
        group.add(foresight);
        const rearBlade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.014), dark);
        rearBlade.position.set(0, 0.05, 0.02);
        group.add(rearBlade);
        this._gunCylinder(group, steel, brass, 0, 0.026, -0.01, 0.024, 6);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.052, 0.06), steel);
        frame.position.set(0, 0.02, -0.05);
        group.add(frame);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.028, 0.012), dark);
        hammer.position.set(0, 0.054, -0.074);
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.03), steel);
        latch.position.set(-0.016, 0.024, -0.038);
        group.add(latch);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.044), rubber);
        grip.position.set(0, -0.056, -0.07);
        grip.rotation.x = Math.PI / 8;
        group.add(grip);
        for (let i = 0; i < 4; i++) {
          const finger = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, this.seg(4, 3), this.seg(10, 6), Math.PI), rubber);
          finger.position.set(0, -0.03 - i * 0.022, -0.052 - i * 0.01);
          finger.rotation.set(Math.PI / 2 + 0.3, 0, 0);
          group.add(finger);
        }
        this._gunTrigger(group, dark, 0, -0.02, -0.044, { guardR: 0.018, guardArc: 1.3 });
        return group;
      },

      // ---- 480: Gatling Gun ---------------------------------------------------
      createGatlingGunModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB8860B, { roughness: 0.4, metalness: 0.88 });
        const iron = this._mat(0x4A4F55, { roughness: 0.65, metalness: 0.75 });
        const wood = this._wood(0x6B4423);

        // The original hand-cranked one: six barrels, a gravity hopper and a
        // crank that has to keep turning.
        const cluster = new THREE.Group();
        cluster.position.set(0, 0.03, 0.16);
        cluster.userData.gun = 'cylinder';
        cluster.userData.spin = { axis: 'z', speed: 1.2 };
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.3, this.seg(9, 6)), iron);
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0);
          cluster.add(b);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.31, this.seg(10, 6)), brass);
        hub.rotation.x = Math.PI / 2;
        cluster.add(hub);
        for (const dz of [-0.13, 0.13]) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, this.seg(14, 8)), brass);
          plate.rotation.x = Math.PI / 2;
          plate.position.z = dz;
          cluster.add(plate);
        }
        group.add(cluster);
        const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, this.seg(14, 8)), brass);
        casing.rotation.x = Math.PI / 2;
        casing.position.set(0, 0.03, -0.02);
        group.add(casing);
        // Gravity hopper, with rounds visible in the top.
        const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.11, 0.05), iron);
        hopper.position.set(0, 0.11, -0.02);
        hopper.userData.gun = 'magazine';
        group.add(hopper);
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(7, 5)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0, 0.15 + i * 0.012, -0.02);
          group.add(r);
        }
        // The crank, turning.
        const crankAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, this.seg(8, 5)), iron);
        crankAxle.rotation.z = Math.PI / 2;
        crankAxle.position.set(0.05, 0.03, -0.02);
        group.add(crankAxle);
        const crankArm = new THREE.Group();
        crankArm.position.set(0.062, 0.03, -0.02);
        crankArm.userData.spin = { axis: 'x', speed: 1.2 };
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.008), iron);
        arm.position.y = 0.022;
        crankArm.add(arm);
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.026, this.seg(9, 6)), wood);
        knob.rotation.z = Math.PI / 2;
        knob.position.set(0.012, 0.046, 0);
        crankArm.add(knob);
        group.add(crankArm);
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.03), iron);
        yoke.position.set(0, -0.02, -0.02);
        group.add(yoke);
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.03), wood);
        spade.position.set(0, -0.07, -0.06);
        spade.rotation.x = 0.24;
        group.add(spade);
        this._gunTrigger(group, iron, 0, -0.03, -0.036, { guard: false });
        return group;
      },

      // ---- 481: AKS-74U -------------------------------------------------------
      createAKSUModel(weapon, rand) {
        const group = new THREE.Group();
        const blued = this._mat(0x2A2E34, { roughness: 0.55, metalness: 0.78 });
        const plum = this._mat(0x6B3A28, { roughness: 0.65, metalness: 0.12 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.32, metalness: 0.9 });
        const brass = this._cast(0xC9A227);

        // The short one: a stamped receiver, a booster on the muzzle and a
        // stock that folds against the side.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.048, 0.15), blued);
        receiver.position.set(0, 0.012, 0.0);
        group.add(receiver);
        const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.13), blued);
        dustCover.position.set(0, 0.042, 0.0);
        group.add(dustCover);
        const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.09, this.seg(9, 6)), blued);
        gasTube.rotation.x = Math.PI / 2;
        gasTube.position.set(0, 0.042, 0.11);
        group.add(gasTube);
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.09), plum);
        handguard.position.set(0, 0.012, 0.11);
        group.add(handguard);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.08, this.seg(9, 6)), blued);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.18);
        group.add(barrel);
        const booster = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.05, this.seg(11, 7)), blued);
        booster.rotation.x = Math.PI / 2;
        booster.position.set(0, 0.02, 0.24);
        booster.userData.gun = 'muzzle';
        group.add(booster);
        const frontBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.024), blued);
        frontBlock.position.set(0, 0.026, 0.2);
        group.add(frontBlock);
        const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.04), bright);
        carrier.position.set(0.02, 0.04, 0.02);
        carrier.userData.gun = 'bolt';
        group.add(carrier);
        const selector = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.012), blued);
        selector.position.set(0.018, 0.014, -0.02);
        group.add(selector);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.09, 0.028), plum);
        mag.position.set(0, -0.062, 0.01);
        mag.rotation.x = -0.32;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.032), plum);
        grip.position.set(0, -0.05, -0.05);
        grip.rotation.x = 0.24;
        group.add(grip);
        // Side-folding stock, folded along the receiver.
        const strutTop = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, this.seg(7, 5)), blued);
        strutTop.rotation.x = Math.PI / 2;
        strutTop.position.set(-0.024, 0.03, -0.06);
        group.add(strutTop);
        const strutBot = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, this.seg(7, 5)), blued);
        strutBot.rotation.x = Math.PI / 2;
        strutBot.position.set(-0.024, -0.004, -0.06);
        group.add(strutBot);
        const shoulderPlate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.044, 0.014), blued);
        shoulderPlate.position.set(-0.024, 0.014, -0.124);
        group.add(shoulderPlate);
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.014), blued);
        rearSight.position.set(0, 0.056, 0.05);
        group.add(rearSight);
        this._gunTrigger(group, bright, 0, -0.024, -0.022, { guardR: 0.02 });
        this._gunShell(group, brass, 0.028, 0.04, 0.02, 0.006);
        return group;
      },

      // ---- 482: Match Grade Pistol --------------------------------------------
      createMatchGradePistolModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x3A4048, { roughness: 0.25, metalness: 0.94 });
        const bright = this._mat(0xC0C6CC, { roughness: 0.15, metalness: 0.96 });
        const walnut = this._wood(0x4A2A14);
        const gold = this._cast(0xD9A62A);
        const brass = this._cast(0xC9A227);

        // A target automatic: everything tuned, everything adjustable, and an
        // enormous rear sight.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.15), steel);
        frame.position.set(0, -0.004, 0.02);
        group.add(frame);
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.038, 0.17), steel);
        slide.position.set(0, 0.032, 0.03);
        slide.userData.gun = 'slide';
        group.add(slide);
        // Lightening cuts through the slide, the sign of a race gun.
        for (let i = 0; i < 3; i++) {
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.016), walnut);
          cut.position.set(0, 0.006, -0.02 + i * 0.03);
          slide.add(cut);
        }
        for (let i = 0; i < 8; i++) {
          const serr = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.002), bright);
          serr.position.set(0, 0, -0.07 + i * 0.007);
          slide.add(serr);
        }
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.018), bright);
        rearSight.position.set(0, 0.056, -0.045);
        group.add(rearSight);
        const elevScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, this.seg(8, 5)), gold);
        elevScrew.position.set(0, 0.066, -0.045);
        group.add(elevScrew);
        const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.006), bright);
        frontSight.position.set(0, 0.054, 0.104);
        group.add(frontSight);
        const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, this.seg(12, 7)), bright);
        bushing.rotation.x = Math.PI / 2;
        bushing.position.set(0, 0.03, 0.112);
        bushing.userData.gun = 'muzzle';
        group.add(bushing);
        const compensator = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.05), steel);
        compensator.position.set(0, 0.03, 0.14);
        group.add(compensator);
        for (let i = 0; i < 3; i++) {
          const port = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.004, 0.006), walnut);
          port.position.set(0, 0.044, 0.126 + i * 0.014);
          group.add(port);
        }
        const beaver = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.03), steel);
        beaver.position.set(0, -0.022, -0.06);
        group.add(beaver);
        const hammer = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, this.seg(4, 3), this.seg(10, 6)), bright);
        hammer.position.set(0, 0.048, -0.078);
        hammer.rotation.y = Math.PI / 2;
        hammer.userData.gun = 'hammer';
        group.add(hammer);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.038), walnut);
        grip.position.set(0, -0.072, -0.036);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const check = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.002, 0.036), gold);
            check.position.set(0, -0.04 - i * 0.016, -0.042 - i * 0.002);
            check.rotation.x = Math.PI / 9;
            group.add(check);
          }
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.096, 0.03), bright);
        mag.position.set(0, -0.076, -0.034);
        mag.rotation.x = Math.PI / 9;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const wellFunnel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.016, 0.042), gold);
        wellFunnel.position.set(0, -0.03, -0.024);
        group.add(wellFunnel);
        this._gunTrigger(group, gold, 0, -0.03, -0.008, { curl: 0.1 });
        this._gunShell(group, brass, 0.026, 0.038, 0.06, 0.005);
        return group;
      },

      // ---- 483: M14 Battle Rifle ----------------------------------------------
      createM14Model(weapon, rand) {
        const group = new THREE.Group();
        const parked = this._mat(0x33383E, { roughness: 0.58, metalness: 0.74 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const walnut = this._wood(0x6B4423);
        const brass = this._cast(0xC9A227);

        // Wood-stocked, full-power, and heavier than everything that replaced
        // it: the last of that kind.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.18), parked);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.34, this.seg(10, 6)), parked);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.28);
        group.add(barrel);
        const opRod = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.3), bright);
        opRod.position.set(0.02, 0.016, 0.24);
        opRod.userData.gun = 'bolt';
        group.add(opRod);
        const opHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.016, this.seg(9, 6)), bright);
        opHandle.rotation.z = Math.PI / 2;
        opHandle.position.set(0.028, 0.018, 0.05);
        opRod.add(opHandle);
        const gasCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.06, this.seg(10, 6)), parked);
        gasCyl.rotation.x = Math.PI / 2;
        gasCyl.position.set(0, 0.03, 0.4);
        group.add(gasCyl);
        const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.05, this.seg(11, 7)), parked);
        flash.rotation.x = Math.PI / 2;
        flash.position.set(0, 0.03, 0.46);
        flash.userData.gun = 'muzzle';
        group.add(flash);
        const bayoLug = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, 0.02), parked);
        bayoLug.position.set(0, 0.016, 0.44);
        group.add(bayoLug);
        this._gunStock(group, walnut, parked, { fore: 0.3, back: -0.2, ramrod: false });
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), walnut);
        handguard.position.set(0, 0.048, 0.24);
        group.add(handguard);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.036), parked);
        mag.position.set(0, -0.058, 0.01);
        mag.rotation.x = -0.2;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.003, this.seg(4, 3), this.seg(10, 6)), parked);
        aperture.position.set(0, 0.048, -0.06);
        group.add(aperture);
        const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.005), parked);
        frontPost.position.set(0, 0.05, 0.43);
        group.add(frontPost);
        this._gunTrigger(group, parked, 0, -0.03, -0.03, { guardR: 0.02 });
        this._gunShell(group, brass, 0.028, 0.042, 0.03, 0.006);
        return group;
      },

      // ---- 484: Water Jet Cutter ----------------------------------------------
      createWaterJetCutterModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const blue = this._mat(0x1E5A8B, { roughness: 0.5, metalness: 0.4 });
        const hose = this._mat(0x1A1A1E, { roughness: 0.9, metalness: 0.05 });
        const jet = this._glow(0x9CE4FF, 1.1);
        const grit = this._mat(0xC8B078, { roughness: 1.0, metalness: 0.0 });

        // Industrial abrasive cutter: an intensifier, an abrasive hopper and a
        // sapphire orifice that does the actual work.
        const intensifier = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, this.seg(12, 7)), blue);
        intensifier.rotation.x = Math.PI / 2;
        intensifier.position.set(0, 0.0, 0.0);
        group.add(intensifier);
        for (let i = 0; i < 4; i++) {
          const rib = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, this.seg(4, 3), this.seg(12, 7)), steel);
          rib.position.set(0, 0.0, -0.06 + i * 0.04);
          group.add(rib);
        }
        const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.016, 0.07, this.seg(11, 7)), steel);
        hopper.position.set(0, 0.056, -0.02);
        group.add(hopper);
        const gritFill = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.04, this.seg(11, 7)), grit);
        gritFill.position.set(0, 0.056, -0.02);
        group.add(gritFill);
        const mixingTube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.16, this.seg(10, 6)), steel);
        mixingTube.rotation.x = Math.PI / 2;
        mixingTube.position.set(0, 0.008, 0.15);
        group.add(mixingTube);
        const orifice = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, 0.02, this.seg(10, 6)), jet);
        orifice.rotation.x = Math.PI / 2;
        orifice.position.set(0, 0.008, 0.24);
        orifice.userData.pulse = { min: 0.5, max: 1.4, freq: 3.0 };
        group.add(orifice);
        const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0028, 0.1, this.seg(7, 5)), jet);
        stream.rotation.x = Math.PI / 2;
        stream.position.set(0, 0.008, 0.3);
        stream.userData.pulse = { min: 0.2, max: 1.2, freq: 5.5 };
        group.add(stream);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, this.seg(11, 7)), steel);
        gauge.rotation.x = Math.PI / 2;
        gauge.position.set(0.026, 0.02, 0.05);
        group.add(gauge);
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, this.seg(4, 3), this.seg(10, 6), Math.PI), hose);
          coil.position.set(-0.026, -0.02 + i * 0.014, -0.05);
          coil.rotation.set(0.4, 0.5, 0.8);
          group.add(coil);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), hose);
        grip.position.set(0, -0.062, -0.04);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.05, this.seg(9, 6)), hose);
        foregrip.position.set(0, -0.03, 0.11);
        group.add(foregrip);
        this._gunTrigger(group, steel, 0, -0.026, -0.016, {});
        return group;
      },

      // ---- 485: Combat Shotgun ------------------------------------------------
      createCombatShotgunModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x24262A, { roughness: 0.55, metalness: 0.75 });
        const polymer = this._mat(0x18191C, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.32, metalness: 0.9 });
        const red = this._mat(0xC0392B, { roughness: 0.7, metalness: 0.1 });

        // Semi-auto, box-fed, and covered in rail: everything the plain pump
        // gun is not.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.056, 0.19), black);
        receiver.position.set(0, 0.012, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.019, 0.26, this.seg(11, 7)), black);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.24);
        group.add(barrel);
        const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.18, this.seg(11, 7), 1, true), bright);
        heatShield.rotation.x = Math.PI / 2;
        heatShield.position.set(0, 0.032, 0.22);
        group.add(heatShield);
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const slot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.02), black);
            slot.position.set(0, 0.055, 0.15 + i * 0.026);
            group.add(slot);
          }
        }
        const choke = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.019, 0.04, this.seg(11, 7)), bright);
        choke.rotation.x = Math.PI / 2;
        choke.position.set(0, 0.032, 0.38);
        choke.userData.gun = 'muzzle';
        group.add(choke);
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.016, 0.04), bright);
        bolt.position.set(0.022, 0.03, 0.05);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), polymer);
        mag.position.set(0, -0.062, 0.02);
        mag.userData.gun = 'magazine';
        group.add(mag);
        for (let i = 0; i < 3; i++) {
          const witness = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.006, 0.006), red);
          witness.position.set(0, -0.04 - i * 0.026, 0.041);
          group.add(witness);
        }
        this._gunRail(group, black, bright, 0, 0.05, 0.05, 0.2);
        this._gunOptic(group, black, bright, this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 }), 1, 0, 0.072, 0.02);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), polymer);
        grip.position.set(0, -0.058, -0.07);
        grip.rotation.x = 0.24;
        group.add(grip);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.056, 0.11), polymer);
        stock.position.set(0, 0.0, -0.14);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.062, 0.014), polymer);
        pad.position.set(0, -0.004, -0.2);
        group.add(pad);
        this._gunTrigger(group, bright, 0, -0.026, -0.04, { guardR: 0.021 });
        this._gunShell(group, red, 0.032, 0.03, 0.05, 0.009);
        return group;
      },

      // ---- 486: Gatling Gun (motorised) ---------------------------------------
      createMotorGatlingModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.8 });
        const bright = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const warn = this._glow(0xFFB300, 0.8);
        const brass = this._cast(0xC9A227);

        // The powered descendant of 480: an electric drive, a belt feed and no
        // crank at all.
        const cluster = new THREE.Group();
        cluster.position.set(0, 0.02, 0.2);
        cluster.userData.gun = 'cylinder';
        cluster.userData.spin = { axis: 'z', speed: 7.0 };
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.32, this.seg(9, 6)), bright);
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.024, Math.sin(a) * 0.024, 0);
          cluster.add(b);
        }
        const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.014, this.seg(14, 8)), dark);
        clamp.rotation.x = Math.PI / 2;
        clamp.position.z = 0.14;
        cluster.add(clamp);
        group.add(cluster);
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.13, this.seg(14, 8)), dark);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(0, 0.02, 0.0);
        group.add(housing);
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.08, this.seg(12, 7)), dark);
        motor.rotation.z = Math.PI / 2;
        motor.position.set(-0.06, 0.02, 0.0);
        group.add(motor);
        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.003, this.seg(4, 3), this.seg(12, 7)), bright);
          fin.rotation.y = Math.PI / 2;
          fin.position.set(-0.085 + i * 0.018, 0.02, 0.0);
          group.add(fin);
        }
        // Belt of rounds curling up out of a box.
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), dark);
        box.position.set(0, -0.07, -0.04);
        box.userData.gun = 'magazine';
        group.add(box);
        const links = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < links; i++) {
          const t = i / links;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.024, this.seg(7, 5)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0.014, -0.035 + t * 0.06, -0.03 + Math.sin(t * 3) * 0.01);
          group.add(r);
        }
        const heat = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.004, this.seg(4, 3), this.seg(14, 8)), warn);
        heat.position.set(0, 0.02, 0.06);
        heat.userData.pulse = { min: 0.15, max: 1.2, freq: 2.0 };
        group.add(heat);
        const spade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.026), dark);
        spade.position.set(0, -0.03, -0.09);
        group.add(spade);
        for (const s of [-1, 1]) {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, this.seg(9, 6)), dark);
          handle.position.set(s * 0.05, -0.06, -0.09);
          group.add(handle);
        }
        this._gunTrigger(group, bright, 0.05, -0.086, -0.075, { guard: false });
        return group;
      },

      // ---- 487: Modular Combat Rifle ------------------------------------------
      createModularCombatRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x3A4038, { roughness: 0.55, metalness: 0.75 });
        const polymer = this._mat(0x23261F, { roughness: 0.84, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Rail on every face, and something bolted to most of them.
        this._gunAR(group, body, polymer, bright, { magLen: 0.12 });
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), body);
        handguard.position.set(0, 0.024, 0.2);
        group.add(handguard);
        this._gunRail(group, body, bright, 0, 0.05, 0.14, 0.34);
        for (const s of [-1, 1]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.18), bright);
          side.position.set(s * 0.022, 0.024, 0.2);
          group.add(side);
        }
        const under = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.18), bright);
        under.position.set(0, 0.002, 0.2);
        group.add(under);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.1, this.seg(9, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.34);
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.04, this.seg(11, 7)), bright);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.024, 0.41);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        this._gunOptic(group, body, bright, glass, 2, 0, 0.078, 0.03);
        // Under-barrel launcher, a laser and a vertical grip: the modules.
        const launcher = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.11, this.seg(11, 7)), body);
        launcher.rotation.x = Math.PI / 2;
        launcher.position.set(0, -0.014, 0.24);
        group.add(launcher);
        const launchTrigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.006), bright);
        launchTrigger.position.set(0, -0.03, 0.18);
        group.add(launchTrigger);
        const laser = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.034), polymer);
        laser.position.set(-0.026, 0.024, 0.16);
        group.add(laser);
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, this.seg(7, 5)), this._glow(0xFF2A2A, 1.0));
        dot.rotation.x = Math.PI / 2;
        dot.position.set(-0.026, 0.024, 0.18);
        dot.userData.pulse = { min: 0.4, max: 1.2, freq: 2.4 };
        group.add(dot);
        const vgrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.024), polymer);
        vgrip.position.set(0, -0.042, 0.14);
        group.add(vgrip);
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.005);
        return group;
      },

      // ---- 488: Grenade Launcher ----------------------------------------------
      createGrenadeLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x3E4A32, { roughness: 0.72, metalness: 0.4 });
        const black = this._mat(0x1E2024, { roughness: 0.82, metalness: 0.12 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.35, metalness: 0.88 });
        const gold = this._cast(0xB9902A);

        // Single shot, break action, 40mm: a very short fat tube and a very
        // long sight ladder.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.031, 0.24, this.seg(14, 8)), olive);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.026, 0.16);
        group.add(tube);
        const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, this.seg(4, 3), this.seg(14, 8)), black);
        muzzleRing.position.set(0, 0.026, 0.278);
        muzzleRing.userData.gun = 'muzzle';
        group.add(muzzleRing);
        // The barrel slides forward to load, so it is the action.
        const slideCatch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), bright);
        slideCatch.position.set(-0.026, 0.026, 0.06);
        slideCatch.userData.gun = 'slide';
        group.add(slideCatch);
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.11), black);
        receiver.position.set(0, -0.006, 0.0);
        group.add(receiver);
        // Leaf sight, folded up, with its ladder graduations.
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.09, 0.005), black);
        ladder.position.set(0, 0.08, 0.06);
        ladder.rotation.x = -0.15;
        group.add(ladder);
        const rungs = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < rungs; i++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.006), bright);
          rung.position.set(0, 0.046 + i * 0.012, 0.062 + i * 0.002);
          group.add(rung);
        }
        const slider = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.008), bright);
        slider.position.set(0, 0.07, 0.064);
        group.add(slider);
        const grenade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, this.seg(12, 7)), gold);
        grenade.rotation.x = Math.PI / 2;
        grenade.position.set(0, 0.026, 0.06);
        group.add(grenade);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(11, 7), this.seg(7, 5)), black);
        nose.scale.z = 0.8;
        nose.position.set(0, 0.026, 0.09);
        group.add(nose);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), black);
        grip.position.set(0, -0.06, -0.04);
        grip.rotation.x = 0.22;
        group.add(grip);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.1), black);
        stock.position.set(0, -0.006, -0.1);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.014), black);
        pad.position.set(0, -0.01, -0.156);
        group.add(pad);
        this._gunTrigger(group, bright, 0, -0.03, -0.014, { guardR: 0.022 });
        return group;
      },

      // ---- 489: Sniper Rifle --------------------------------------------------
      createSniperRifleBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x33383E, { roughness: 0.45, metalness: 0.82 });
        const chassis = this._mat(0x4A5240, { roughness: 0.7, metalness: 0.3 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Chassis rifle: heavy fluted barrel, adjustable stock, bipod, and a
        // scope bigger than most rifles.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.2), body);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.42, this.seg(12, 7)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.33);
        group.add(barrel);
        // Flutes cut down the barrel to lose weight without losing stiffness.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const flute = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.3), chassis);
            flute.position.set(Math.cos(a) * 0.015, 0.03 + Math.sin(a) * 0.015, 0.32);
            group.add(flute);
          }
        }
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.018, 0.06, this.seg(12, 7)), bright);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.03, 0.56);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        for (let i = 0; i < 3; i++) {
          const port = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.005, 0.008), body);
          port.position.set(0, 0.048, 0.545 + i * 0.016);
          group.add(port);
        }
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, this.seg(10, 6)), bright);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.008, 0.03, 0.0);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const bHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.034, this.seg(7, 5)), bright);
        bHandle.rotation.set(0, 0, Math.PI / 2 - 0.4);
        bHandle.position.set(0.018, -0.006, -0.035);
        bolt.add(bHandle);
        const bKnob = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(8, 5), this.seg(6, 4)), bright);
        bKnob.position.set(0.034, -0.018, -0.035);
        bolt.add(bKnob);
        this._gunRail(group, body, bright, 0, 0.046, 0.05, 0.24);
        this._gunOptic(group, body, bright, glass, 2, 0, 0.082, 0.04);
        const chassisBody = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.24), chassis);
        chassisBody.position.set(0, -0.02, 0.14);
        group.add(chassisBody);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.036), body);
        mag.position.set(0, -0.062, 0.0);
        mag.userData.gun = 'magazine';
        group.add(mag);
        // Bipod, deployed.
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.11, this.seg(7, 5)), bright);
          leg.position.set(s * 0.03, -0.08, 0.24);
          leg.rotation.z = s * 0.5;
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), chassis);
          foot.position.set(s * 0.056, -0.13, 0.24);
          group.add(foot);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.14), chassis);
        stock.position.set(0, 0.004, -0.15);
        group.add(stock);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.09), chassis);
        cheek.position.set(0, 0.04, -0.13);
        group.add(cheek);
        const cheekPost = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(7, 5)), bright);
        cheekPost.position.set(0, 0.022, -0.11);
        group.add(cheekPost);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.062, 0.014), body);
        pad.position.set(0, 0.0, -0.226);
        group.add(pad);
        const monopod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, this.seg(8, 5)), bright);
        monopod.position.set(0, -0.036, -0.2);
        group.add(monopod);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.036), chassis);
        grip.position.set(0, -0.062, -0.07);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.028, -0.04, { guardR: 0.02 });
        this._gunShell(group, brass, 0.028, 0.03, 0.02, 0.007);
        return group;
      },

      // ---- 490: Bullpup Rifle -------------------------------------------------
      createBullpupRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const polymer = this._mat(0x2A2E24, { roughness: 0.8, metalness: 0.06 });
        const body = this._mat(0x33383E, { roughness: 0.5, metalness: 0.8 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // The action sits BEHIND the trigger, which is what makes it a bullpup:
        // the magazine is back by the shoulder and the whole gun is short.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.07, 0.3), polymer);
        shell.position.set(0, 0.01, -0.02);
        group.add(shell);
        const cheekLine = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.16), polymer);
        cheekLine.position.set(0, 0.05, -0.06);
        group.add(cheekLine);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.08, 0.032), polymer);
        mag.position.set(0, -0.05, -0.11);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.05), body);
        port.position.set(0.022, 0.024, -0.09);
        group.add(port);
        const charging = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.04), bright);
        charging.position.set(0.024, 0.052, 0.02);
        charging.userData.gun = 'charging';
        group.add(charging);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.2, this.seg(10, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.026, 0.22);
        group.add(barrel);
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, this.seg(11, 7)), polymer);
        shroud.rotation.x = Math.PI / 2;
        shroud.position.set(0, 0.026, 0.18);
        group.add(shroud);
        const hider = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.04, this.seg(11, 7), 1, true), bright);
        hider.rotation.x = Math.PI / 2;
        hider.position.set(0, 0.026, 0.33);
        hider.userData.gun = 'muzzle';
        group.add(hider);
        this._gunRail(group, body, bright, 0, 0.052, 0.05, 0.24);
        this._gunOptic(group, body, bright, glass, 1, 0, 0.076, 0.06);
        const vgrip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.055, 0.026), polymer);
        vgrip.position.set(0, -0.048, 0.14);
        group.add(vgrip);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), polymer);
        grip.position.set(0, -0.052, 0.05);
        group.add(grip);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.012), body);
        pad.position.set(0, 0.008, -0.176);
        group.add(pad);
        const sling = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(9, 6)), bright);
        sling.position.set(0.022, -0.026, 0.06);
        sling.rotation.y = Math.PI / 2;
        group.add(sling);
        this._gunTrigger(group, bright, 0, -0.02, 0.086, { curl: 0.2 });
        this._gunShell(group, brass, 0.03, 0.024, -0.09, 0.005);
        return group;
      },

      // ---- 491: Flamethrower --------------------------------------------------
      createFlamethrowerBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x3E4A32, { roughness: 0.75, metalness: 0.35 });
        const steel = this._mat(0x8A9096, { roughness: 0.45, metalness: 0.85 });
        const hose = this._mat(0x1A1A1E, { roughness: 0.92, metalness: 0.04 });
        const flame = this._glow(0xFF6A1A, 1.2);
        const red = this._mat(0xB03A2E, { roughness: 0.7, metalness: 0.2 });

        // Two fuel tanks and a pressure bottle, a hose, and a wand with a lit
        // pilot that never goes out.
        for (const s of [-1, 1]) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, this.seg(12, 7)), olive);
          tank.rotation.x = Math.PI / 2;
          tank.position.set(s * 0.034, -0.02, -0.09);
          group.add(tank);
          for (const dz of [-0.17, -0.01]) {
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), olive);
            dome.rotation.x = dz < -0.09 ? Math.PI / 2 : -Math.PI / 2;
            dome.position.set(s * 0.034, -0.02, dz);
            group.add(dome);
          }
        }
        const pressure = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, this.seg(11, 7)), red);
        pressure.rotation.x = Math.PI / 2;
        pressure.position.set(0, -0.05, -0.09);
        group.add(pressure);
        const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.024, 0.026), steel);
        manifold.position.set(0, -0.02, 0.0);
        group.add(manifold);
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, this.seg(10, 6)), steel);
        valve.position.set(0, 0.0, 0.0);
        group.add(valve);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(12, 7)), red);
        wheel.position.set(0, 0.012, 0.0);
        wheel.rotation.x = Math.PI / 2;
        wheel.userData.spin = { axis: 'y', speed: 0.3 };
        group.add(wheel);
        for (let i = 0; i < 5; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, this.seg(4, 3), this.seg(11, 7), Math.PI * 1.2), hose);
          coil.position.set(-0.02, -0.01 + i * 0.012, 0.04);
          coil.rotation.set(0.5, 0.4, 0.7);
          group.add(coil);
        }
        const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.24, this.seg(11, 7)), steel);
        wand.rotation.x = Math.PI / 2;
        wand.position.set(0, 0.026, 0.17);
        group.add(wand);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.04, this.seg(12, 7)), steel);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.026, 0.31);
        nozzle.userData.gun = 'muzzle';
        group.add(nozzle);
        // The pilot ring: three little flames that never stop.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const pilot = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.026, this.seg(6, 4)), flame);
          pilot.position.set(Math.cos(a) * 0.021, 0.026 + Math.sin(a) * 0.021, 0.322);
          pilot.userData.pulse = { min: 0.4, max: 1.4, freq: 3.6, phase: i * 1.4 };
          pilot.userData.sway = { axis: 'z', amp: 0.2, freq: 3.0, phase: i };
          group.add(pilot);
        }
        // The wand runs at y 0.026: everything hanging off it hangs from THERE,
        // not from the manifold line the tanks sit on, or the whole grip
        // assembly floats an inch under the barrel it is supposed to hold.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.034), hose);
        grip.position.set(0, -0.026, 0.09);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.05, this.seg(9, 6)), hose);
        foregrip.position.set(0, 0.002, 0.2);
        group.add(foregrip);
        this._gunTrigger(group, steel, 0, 0.004, 0.114, {});
        return group;
      },

      // ---- 492: Marksman Rifle ------------------------------------------------
      createMarksmanRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x2E3238, { roughness: 0.48, metalness: 0.82 });
        const polymer = this._mat(0x1C1E22, { roughness: 0.84, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Semi-auto precision: an AR grown long, with a free-float tube and
        // real glass on top.
        this._gunAR(group, body, polymer, bright, { magLen: 0.11 });
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, this.seg(12, 7)), body);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.024, 0.23);
        group.add(tube);
        if (this.wantsTrim()) {
          for (let i = 0; i < 7; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.046, this.seg(6, 4)), polymer);
            hole.rotation.z = Math.PI / 2;
            hole.position.set(0, 0.024, 0.13 + i * 0.03);
            group.add(hole);
          }
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.14, this.seg(10, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.4);
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.05, this.seg(11, 7)), bright);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.024, 0.49);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        this._gunRail(group, body, bright, 0, 0.05, 0.14, 0.36);
        this._gunOptic(group, body, bright, glass, 2, 0, 0.082, 0.03);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.08), polymer);
        cheek.position.set(0, 0.038, -0.14);
        group.add(cheek);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.1, this.seg(7, 5)), bright);
          leg.position.set(s * 0.026, -0.06, 0.3);
          leg.rotation.z = s * 0.45;
          group.add(leg);
        }
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.006);
        return group;
      },

      // ---- 493: Tactical Carbine ----------------------------------------------
      createTacticalCarbineModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.8 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Short, light, and set up for indoors: a stubby barrel, a light on
        // the rail and a collapsed stock.
        this._gunAR(group, body, polymer, bright, { magLen: 0.1, stock: false });
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.09, this.seg(10, 6)), body);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.016, -0.11);
        group.add(tube);
        const collapsed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), polymer);
        collapsed.position.set(0, 0.008, -0.11);
        group.add(collapsed);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.056, 0.012), this._mat(0x141416, { roughness: 0.95 }));
        pad.position.set(0, 0.004, -0.145);
        group.add(pad);
        const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.022, 0.12, this.seg(11, 7)), body);
        handguard.rotation.x = Math.PI / 2;
        handguard.position.set(0, 0.024, 0.17);
        group.add(handguard);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.07, this.seg(9, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.25);
        group.add(barrel);
        const hider = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.036, this.seg(10, 6), 1, true), bright);
        hider.rotation.x = Math.PI / 2;
        hider.position.set(0, 0.024, 0.3);
        hider.userData.gun = 'muzzle';
        group.add(hider);
        this._gunRail(group, body, bright, 0, 0.05, 0.1, 0.24);
        this._gunOptic(group, body, bright, glass, 1, 0, 0.076, 0.02);
        const light = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, this.seg(10, 6)), body);
        light.rotation.x = Math.PI / 2;
        light.position.set(-0.026, 0.02, 0.19);
        group.add(light);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, this.seg(10, 6)), this._glow(0xFFF4C4, 0.9));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(-0.026, 0.02, 0.216);
        group.add(lens);
        const vgrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.024), polymer);
        vgrip.position.set(0, -0.02, 0.15);
        vgrip.rotation.x = -0.2;
        group.add(vgrip);
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.005);
        return group;
      },

      // ---- 494: Tactical Shotgun ----------------------------------------------
      createTacticalShotgunModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x1E2024, { roughness: 0.6, metalness: 0.7 });
        const polymer = this._mat(0x141518, { roughness: 0.88, metalness: 0.04 });
        const bright = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const red = this._mat(0xC0392B, { roughness: 0.7, metalness: 0.1 });

        // Short pump with a folding stock, a side saddle and a breaching
        // standoff on the muzzle.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.054, 0.15), black);
        receiver.position.set(0, 0.012, 0.01);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.22, this.seg(11, 7)), black);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.19);
        group.add(barrel);
        const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, this.seg(10, 6)), black);
        magTube.rotation.x = Math.PI / 2;
        magTube.position.set(0, -0.002, 0.18);
        group.add(magTube);
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.09), polymer);
        pump.position.set(0, 0.012, 0.16);
        pump.userData.gun = 'slide';
        group.add(pump);
        for (let i = 0; i < 4; i++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.006), black);
          rib.position.set(0, 0.012 + 0.012, -0.03 + i * 0.02);
          pump.add(rib);
        }
        // Standoff teeth for taking a door off its hinges.
        const standoff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.04, this.seg(11, 7), 1, true), bright);
        standoff.rotation.x = Math.PI / 2;
        standoff.position.set(0, 0.032, 0.312);
        standoff.userData.gun = 'muzzle';
        group.add(standoff);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.016, 3), bright);
          tooth.position.set(Math.cos(a) * 0.021, 0.032 + Math.sin(a) * 0.021, 0.336);
          tooth.rotation.x = -Math.PI / 2;
          group.add(tooth);
        }
        // Side saddle of spare shells.
        const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.044, 0.09), polymer);
        saddle.position.set(-0.024, 0.012, 0.0);
        group.add(saddle);
        for (let i = 0; i < 4; i++) {
          const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.052, this.seg(8, 5)), red);
          sh.rotation.x = Math.PI / 2;
          sh.position.set(-0.03, 0.03 - i * 0.019, 0.0);
          group.add(sh);
        }
        this._gunRail(group, black, bright, 0, 0.05, 0.02, 0.12);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), polymer);
        grip.position.set(0, -0.056, -0.05);
        grip.rotation.x = 0.22;
        group.add(grip);
        // Folding stock, over the top.
        for (const s of [-1, 1]) {
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, this.seg(7, 5)), bright);
          strut.rotation.x = Math.PI / 2;
          strut.position.set(s * 0.018, 0.056, -0.06);
          group.add(strut);
        }
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.024), polymer);
        shoulder.position.set(0, 0.056, -0.128);
        group.add(shoulder);
        this._gunTrigger(group, bright, 0, -0.026, -0.026, { guardR: 0.021 });
        this._gunShell(group, red, 0.03, 0.03, 0.02, 0.009);
        return group;
      },

      // ---- 495: Heat Ray ------------------------------------------------------
      createHeatRayModel(weapon, rand) {
        const group = new THREE.Group();
        const brassy = this._mat(0xB8860B, { roughness: 0.32, metalness: 0.9 });
        const dark = this._mat(0x2A241C, { roughness: 0.6, metalness: 0.5 });
        const heat = this._glow(0xFF6A1A, 1.3);
        const glassMat = this._mat(0xE8C08A, { roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.5 });

        // A brass parabolic dish and a filament at its focus: less a gun than
        // a lamp that means it.
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.056, this.seg(14, 8), this.seg(10, 6), 0, Math.PI * 2, 0, Math.PI / 2), brassy);
        dish.rotation.x = -Math.PI / 2;
        dish.position.set(0, 0.026, 0.24);
        group.add(dish);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.006, this.seg(4, 3), this.seg(18, 10)), brassy);
        rim.position.set(0, 0.026, 0.29);
        group.add(rim);
        const filament = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(8, 5)), heat);
        filament.position.set(0, 0.026, 0.25);
        filament.userData.pulse = { min: 0.5, max: 1.6, freq: 1.6 };
        group.add(filament);
        const coilCount = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < coilCount; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.014 + i * 0.001, 0.002, this.seg(4, 3), this.seg(10, 6)), heat);
          coil.position.set(0, 0.026, 0.235 + i * 0.007);
          coil.userData.pulse = { min: 0.3, max: 1.4, freq: 2.2, phase: i * 0.8 };
          group.add(coil);
        }
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.12, this.seg(12, 7)), brassy);
        neck.rotation.x = Math.PI / 2;
        neck.position.set(0, 0.026, 0.14);
        group.add(neck);
        const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.14, this.seg(12, 7)), dark);
        boiler.rotation.x = Math.PI / 2;
        boiler.position.set(0, 0.01, 0.0);
        group.add(boiler);
        for (let i = 0; i < 3; i++) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, this.seg(4, 3), this.seg(12, 7)), brassy);
          hoop.position.set(0, 0.01, -0.04 + i * 0.04);
          group.add(hoop);
        }
        const sight = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, this.seg(10, 6)), glassMat);
        sight.rotation.x = Math.PI / 2;
        sight.position.set(0.03, 0.04, 0.02);
        group.add(sight);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(11, 7)), brassy);
        gauge.rotation.x = Math.PI / 2;
        gauge.position.set(-0.03, 0.036, 0.02);
        group.add(gauge);
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.002), heat);
        needle.position.set(-0.03, 0.042, 0.024);
        needle.userData.spin = { axis: 'z', speed: 0.5 };
        group.add(needle);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.08, this.seg(10, 6)), dark);
        grip.position.set(0, -0.056, -0.04);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, brassy, 0, -0.022, -0.016, { guardR: 0.018 });
        return group;
      },

      // ---- 496: DMR -----------------------------------------------------------
      createDMRModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x36393E, { roughness: 0.5, metalness: 0.8 });
        const tan = this._mat(0x8A7A5A, { roughness: 0.82, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Issue rifle, rebuilt for reach: tan furniture, a heavy barrel and a
        // variable optic.
        this._gunAR(group, body, tan, bright, { magLen: 0.11 });
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.038, 0.22), tan);
        handguard.position.set(0, 0.024, 0.21);
        group.add(handguard);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.014, 0.16, this.seg(10, 6)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.38);
        group.add(barrel);
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, this.seg(12, 7)), body);
        can.rotation.x = Math.PI / 2;
        can.position.set(0, 0.024, 0.5);
        can.userData.gun = 'muzzle';
        group.add(can);
        for (let i = 0; i < 4; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.002, this.seg(4, 3), this.seg(12, 7)), bright);
          ring.position.set(0, 0.024, 0.46 + i * 0.026);
          group.add(ring);
        }
        this._gunRail(group, body, bright, 0, 0.05, 0.13, 0.34);
        this._gunOptic(group, body, bright, glass, 2, 0, 0.082, 0.02);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.08), tan);
        cheek.position.set(0, 0.04, -0.14);
        group.add(cheek);
        const bipodMount = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.03), bright);
        bipodMount.position.set(0, -0.002, 0.29);
        group.add(bipodMount);
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.006);
        return group;
      },

      // ---- 497: Heavy Machine Gun ---------------------------------------------
      createHeavyMachineGunModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.75 });
        const bright = this._mat(0x8A9096, { roughness: 0.4, metalness: 0.88 });
        const brass = this._cast(0xC9A227);
        const green = this._mat(0x3E4A32, { roughness: 0.8, metalness: 0.2 });

        // Belt-fed and tripod-mounted in life; here it is being carried, which
        // is what the spade grips and the carry handle are for.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.28), dark);
        receiver.position.set(0, 0.01, 0.0);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.36, this.seg(12, 7)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.32);
        group.add(barrel);
        const shroudRings = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < shroudRings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.005, this.seg(4, 3), this.seg(12, 7)), dark);
          ring.position.set(0, 0.03, 0.19 + i * 0.036);
          group.add(ring);
        }
        const carry = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(12, 7), Math.PI), bright);
        carry.position.set(0, 0.05, 0.18);
        carry.rotation.set(0, Math.PI / 2, 0);
        group.add(carry);
        const feedCover = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.02, 0.16), dark);
        feedCover.position.set(0, 0.052, 0.01);
        feedCover.userData.gun = 'bolt';
        group.add(feedCover);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.02), bright);
        latch.position.set(0, 0.058, -0.07);
        group.add(latch);
        // The belt, coming up out of an ammo can.
        const can = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), green);
        can.position.set(0.05, -0.06, 0.0);
        can.userData.gun = 'magazine';
        group.add(can);
        const links = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < links; i++) {
          const t = i / links;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, this.seg(7, 5)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0.036 - t * 0.012, -0.014 + t * 0.05, 0.02 + Math.sin(t * 3.4) * 0.012);
          r.rotation.x = t * 0.6;
          group.add(r);
        }
        const spadePlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), dark);
        spadePlate.position.set(0, -0.02, -0.15);
        group.add(spadePlate);
        for (const s of [-1, 1]) {
          const spade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, this.seg(9, 6)), dark);
          spade.position.set(s * 0.04, -0.06, -0.15);
          group.add(spade);
        }
        const butterfly = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.008), bright);
        butterfly.position.set(0, -0.03, -0.17);
        butterfly.userData.gun = 'trigger';
        group.add(butterfly);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.13, this.seg(7, 5)), bright);
          leg.position.set(s * 0.04, -0.08, 0.2);
          leg.rotation.z = s * 0.5;
          group.add(leg);
        }
        this._gunShell(group, brass, -0.036, 0.0, 0.02, 0.008);
        return group;
      },

      // ---- 498: Laser Rifle ---------------------------------------------------
      createLaserRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xD8DCE0, { roughness: 0.32, metalness: 0.55 });
        const dark = this._mat(0x24262A, { roughness: 0.6, metalness: 0.7 });
        const beamColor = this.getRandomColor(rand, [0xFF3A3A, 0x3AFF6A, 0x3A9CFF]);
        const beam = this._glow(beamColor, 1.3);
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });

        // Optics rather than ballistics: a lasing tube, a focusing array and
        // finned radiators, because the waste heat has to go somewhere.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.28, this.seg(12, 7)), shell);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.03, 0.14);
        group.add(tube);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, this.seg(10, 6)), beam);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(0, 0.03, 0.14);
        rod.userData.pulse = { min: 0.3, max: 1.3, freq: 1.8 };
        group.add(rod);
        const lenses = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < lenses; i++) {
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.02 - i * 0.003, 0.02 - i * 0.003, 0.006, this.seg(12, 7)), beam);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(0, 0.03, 0.24 + i * 0.02);
          lens.userData.pulse = { min: 0.2, max: 1.2, freq: 2.4, phase: -i * 0.6 };
          group.add(lens);
        }
        const aperture = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.03, this.seg(12, 7)), dark);
        aperture.rotation.x = Math.PI / 2;
        aperture.position.set(0, 0.03, 0.33);
        aperture.userData.gun = 'muzzle';
        group.add(aperture);
        // Radiator fins along the top.
        const fins = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < fins; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.005), shell);
          fin.position.set(0, 0.058, 0.04 + i * 0.024);
          group.add(fin);
        }
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.14), shell);
        receiver.position.set(0, 0.006, -0.02);
        group.add(receiver);
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.05), dark);
        cell.position.set(0, -0.05, -0.02);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const charge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.006), beam);
        charge.position.set(0.017, -0.05, 0.0);
        charge.userData.pulse = { min: 0.2, max: 1.1, freq: 0.9 };
        group.add(charge);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.052, 0.1), shell);
        stock.position.set(0, 0.0, -0.13);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.058, 0.012), dark);
        pad.position.set(0, -0.004, -0.186);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.056, -0.06);
        grip.rotation.x = 0.22;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.026, -0.036, {});
        return group;
      },

      // ---- 499: Plasma Rifle --------------------------------------------------
      createPlasmaRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2E3A44, { roughness: 0.45, metalness: 0.75 });
        const ceramic = this._mat(0xD8DCE0, { roughness: 0.6, metalness: 0.15 });
        const plasmaColor = this.getRandomColor(rand, [0x4FE3FF, 0x9CFF4F, 0xFF4FC8]);
        const plasma = this._glow(plasmaColor, 1.5);
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });

        // Magnetic containment: coils down the barrel and a torus of held
        // plasma where a chamber would be.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.06, 0.18), shell);
        body.position.set(0, 0.014, 0.0);
        group.add(body);
        const torus = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.011, this.seg(6, 4), this.seg(16, 9)), plasma);
        torus.position.set(0, 0.03, 0.03);
        torus.rotation.x = Math.PI / 2;
        torus.userData.spin = { axis: 'y', speed: 2.4 };
        torus.userData.pulse = { min: 0.6, max: 1.7, freq: 2.0 };
        group.add(torus);
        const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, this.seg(12, 7), 1, true), ceramic);
        cage.rotation.x = Math.PI / 2;
        cage.position.set(0, 0.03, 0.03);
        group.add(cage);
        const coils = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < coils; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.022 - i * 0.001, 0.005, this.seg(4, 3), this.seg(12, 7)), ceramic);
          coil.position.set(0, 0.03, 0.09 + i * 0.028);
          group.add(coil);
          const glow = new THREE.Mesh(new THREE.TorusGeometry(0.016 - i * 0.001, 0.002, this.seg(4, 3), this.seg(12, 7)), plasma);
          glow.position.set(0, 0.03, 0.09 + i * 0.028);
          glow.userData.pulse = { min: 0.1, max: 1.4, freq: 2.6, phase: -i * 0.5 };
          group.add(glow);
        }
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, this.seg(9, 6)), shell);
        spine.rotation.x = Math.PI / 2;
        spine.position.set(0, 0.052, 0.18);
        group.add(spine);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.03, this.seg(12, 7)), ceramic);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.03, 0.29);
        muzzle.userData.gun = 'muzzle';
        group.add(muzzle);
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, this.seg(11, 7)), shell);
        cell.position.set(0, -0.05, 0.0);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, this.seg(11, 7)), plasma);
        window_.position.set(0, -0.05, 0.0);
        window_.userData.pulse = { min: 0.4, max: 1.2, freq: 1.1 };
        group.add(window_);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.1), shell);
        stock.position.set(0, 0.006, -0.13);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), shell);
        grip.position.set(0, -0.05, -0.06);
        grip.rotation.x = 0.22;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.02, -0.036, {});
        return group;
      },

      // ---- 500: Cyberarm Cannon -----------------------------------------------
      createCyberarmCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const chrome = this._mat(0xB8BEC4, { roughness: 0.22, metalness: 0.95 });
        const dark = this._mat(0x1E2126, { roughness: 0.55, metalness: 0.8 });
        const flesh = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.03 });
        const coreColor = this.getRandomColor(rand, [0x4FE3FF, 0xFF4F5A]);
        const core = this._glow(coreColor, 1.3);

        // Not held: worn. The forearm opens and the barrel comes out of it.
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.05, 0.06, this.seg(12, 7)), flesh);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.set(0, 0.0, -0.14);
        group.add(cuff);
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, this.seg(4, 3), this.seg(14, 8)), dark);
        seam.position.set(0, 0.0, -0.11);
        group.add(seam);
        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.18, this.seg(12, 7)), chrome);
        forearm.rotation.x = Math.PI / 2;
        forearm.position.set(0, 0.0, -0.02);
        group.add(forearm);
        // The plates that split open when it deploys.
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.14), chrome);
          plate.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.02);
          plate.rotation.z = a;
          plate.userData.bob = { axis: 'y', amp: 0.004, freq: 0.8, phase: i };
          group.add(plate);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.2, this.seg(12, 7)), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.0, 0.16);
        barrel.userData.gun = 'slide';
        group.add(barrel);
        const rings = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, this.seg(4, 3), this.seg(12, 7)), core);
          ring.position.set(0, 0.0, 0.09 + i * 0.032);
          ring.userData.pulse = { min: 0.15, max: 1.3, freq: 2.4, phase: -i * 0.6 };
          group.add(ring);
        }
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.03, this.seg(12, 7)), chrome);
        mouth.rotation.x = Math.PI / 2;
        mouth.position.set(0, 0.0, 0.27);
        mouth.userData.gun = 'muzzle';
        group.add(mouth);
        const reactor = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(11, 7), this.seg(8, 5)), core);
        reactor.position.set(0, 0.03, -0.06);
        reactor.userData.pulse = { min: 0.5, max: 1.5, freq: 1.2 };
        group.add(reactor);
        const cables = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < cables; i++) {
          const cable = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), dark);
          cable.position.set(0, 0.02, -0.09 + i * 0.02);
          cable.rotation.set(0.4, 0, 0.5 + i);
          group.add(cable);
        }
        // The hand, still there, curled out of the way.
        for (let i = 0; i < 3; i++) {
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.04, this.seg(8, 5)), chrome);
          finger.position.set(-0.02 + i * 0.02, -0.05, 0.06);
          finger.rotation.x = 1.1;
          group.add(finger);
        }
        return group;
      },

      // ---- 501: Precision Rifle -----------------------------------------------
      createPrecisionRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x24262A, { roughness: 0.4, metalness: 0.85 });
        const stockMat = this._mat(0x4A5240, { roughness: 0.72, metalness: 0.2 });
        const bright = this._mat(0xA8AEB4, { roughness: 0.26, metalness: 0.93 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // A competition rifle rather than a service one: laminated thumbhole
        // stock, a hand stop on a rail, and glass with an enormous objective.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.048, 0.2), body);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.44, this.seg(12, 7)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.34);
        group.add(barrel);
        const tuner = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, this.seg(12, 7)), bright);
        tuner.rotation.x = Math.PI / 2;
        tuner.position.set(0, 0.03, 0.56);
        tuner.userData.gun = 'muzzle';
        group.add(tuner);
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, this.seg(10, 6)), bright);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.008, 0.03, 0.0);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const bKnob = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(6, 4)), bright);
        bKnob.position.set(0.03, -0.012, -0.04);
        bolt.add(bKnob);
        this._gunOptic(group, body, bright, glass, 2, 0, 0.084, 0.05);
        // Thumbhole stock: the hole is what makes it read as a target rifle.
        const forend = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.24), stockMat);
        forend.position.set(0, -0.016, 0.16);
        group.add(forend);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.2), bright);
        rail.position.set(0, -0.038, 0.16);
        group.add(rail);
        const handStop = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.02), body);
        handStop.position.set(0, -0.046, 0.14);
        group.add(handStop);
        const wristTop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.11), stockMat);
        wristTop.position.set(0, 0.006, -0.12);
        group.add(wristTop);
        const wristBottom = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.05), stockMat);
        wristBottom.position.set(0, -0.062, -0.08);
        group.add(wristBottom);
        const holeRear = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), stockMat);
        holeRear.position.set(0, -0.03, -0.15);
        group.add(holeRear);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.08), stockMat);
        cheek.position.set(0, 0.028, -0.15);
        group.add(cheek);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.076, 0.014), body);
        pad.position.set(0, -0.01, -0.196);
        group.add(pad);
        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), bright);
        hook.position.set(0, -0.05, -0.19);
        group.add(hook);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.03), body);
        mag.position.set(0, -0.04, 0.0);
        mag.userData.gun = 'magazine';
        group.add(mag);
        this._gunTrigger(group, bright, 0, -0.03, -0.04, { guardR: 0.019 });
        this._gunShell(group, brass, 0.028, 0.03, 0.02, 0.007);
        return group;
      },

      // ---- 502: Optical Beam System -------------------------------------------
      createOpticalBeamSystemModel(weapon, rand) {
        const group = new THREE.Group();
        const white = this._mat(0xE8ECF0, { roughness: 0.3, metalness: 0.4 });
        const grey = this._mat(0x6E7378, { roughness: 0.45, metalness: 0.8 });
        const beamColor = this.getRandomColor(rand, [0x4FE3FF, 0xB84FFF]);
        const beam = this._glow(beamColor, 1.2);
        const glass = this._mat(0xBFD8E0, { roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.45 });

        // Laboratory hardware carried into the field: an optical bench with a
        // gimballed mirror head, all of it on rails.
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.026, 0.3), white);
        bench.position.set(0, 0.0, 0.06);
        group.add(bench);
        for (const s of [-1, 1]) {
          const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, this.seg(9, 6)), grey);
          railBar.rotation.x = Math.PI / 2;
          railBar.position.set(s * 0.02, 0.02, 0.06);
          group.add(railBar);
        }
        // Mirrors and lenses along the bench, each in its own mount.
        const stations = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < stations; i++) {
          const z = -0.05 + i * 0.06;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, this.seg(9, 6)), grey);
          post.position.set(0, 0.04, z);
          group.add(post);
          const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, this.seg(12, 7)), i % 2 ? glass : white);
          mount.rotation.x = Math.PI / 2;
          mount.position.set(0, 0.062, z);
          mount.rotation.z = (i % 2 ? 0.4 : -0.4);
          group.add(mount);
        }
        const path = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.28, this.seg(7, 5)), beam);
        path.rotation.x = Math.PI / 2;
        path.position.set(0, 0.062, 0.06);
        path.userData.pulse = { min: 0.3, max: 1.3, freq: 2.6 };
        group.add(path);
        // Gimballed head at the front.
        const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(5, 4), this.seg(14, 8)), grey);
        yoke.position.set(0, 0.062, 0.2);
        yoke.rotation.y = Math.PI / 2;
        yoke.userData.spin = { axis: 'x', speed: 0.5 };
        group.add(yoke);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.05, this.seg(12, 7)), white);
        head.rotation.x = Math.PI / 2;
        head.position.set(0, 0.062, 0.21);
        head.userData.gun = 'muzzle';
        group.add(head);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, this.seg(12, 7)), beam);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.062, 0.236);
        lens.userData.pulse = { min: 0.4, max: 1.5, freq: 1.8 };
        group.add(lens);
        const psu = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.05, 0.08), white);
        psu.position.set(0, -0.026, -0.08);
        group.add(psu);
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.002), beam);
        readout.position.set(0, -0.02, -0.04);
        readout.userData.pulse = { min: 0.3, max: 1.0, freq: 3.2 };
        group.add(readout);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.032), grey);
        grip.position.set(0, -0.07, -0.02);
        group.add(grip);
        this._gunTrigger(group, grey, 0, -0.034, 0.008, {});
        return group;
      }
,

      // ---- 503: LMG -----------------------------------------------------------
      createLMGModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x3E4A32, { roughness: 0.72, metalness: 0.4 });
        const dark = this._mat(0x24262A, { roughness: 0.55, metalness: 0.78 });
        const bright = this._mat(0x8A9096, { roughness: 0.38, metalness: 0.88 });
        const brass = this._cast(0xC9A227);

        // Squad weapon: belt-fed out of a hanging box, bipod down, and a
        // barrel meant to be swapped when it glows.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.06, 0.24), dark);
        receiver.position.set(0, 0.012, 0.02);
        group.add(receiver);
        const feedCover = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.018, 0.15), dark);
        feedCover.position.set(0, 0.048, 0.03);
        feedCover.userData.gun = 'bolt';
        group.add(feedCover);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.3, this.seg(11, 7)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.29);
        group.add(barrel);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.05), olive);
        handle.position.set(-0.02, 0.05, 0.19);
        handle.rotation.z = 0.5;
        group.add(handle);
        const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, this.seg(9, 6)), dark);
        gasTube.rotation.x = Math.PI / 2;
        gasTube.position.set(0, 0.008, 0.27);
        group.add(gasTube);
        const hider = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.015, 0.05, this.seg(11, 7), 1, true), bright);
        hider.rotation.x = Math.PI / 2;
        hider.position.set(0, 0.03, 0.45);
        hider.userData.gun = 'muzzle';
        group.add(hider);
        // Belt box slung under, with the belt feeding up into the cover.
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.09), olive);
        box.position.set(0, -0.06, 0.02);
        box.userData.gun = 'magazine';
        group.add(box);
        const links = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < links; i++) {
          const t = i / links;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, this.seg(7, 5)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0.012, -0.02 + t * 0.05, 0.02 + Math.sin(t * 3) * 0.008);
          group.add(r);
        }
        this._gunRail(group, dark, bright, 0, 0.06, -0.02, 0.12);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.056, 0.11), olive);
        stock.position.set(0, 0.0, -0.15);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.062, 0.014), dark);
        pad.position.set(0, -0.004, -0.21);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), olive);
        grip.position.set(0, -0.056, -0.08);
        grip.rotation.x = 0.22;
        group.add(grip);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.12, this.seg(7, 5)), bright);
          leg.position.set(s * 0.03, -0.08, 0.3);
          leg.rotation.z = s * 0.48;
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.006, 0.02), dark);
          foot.position.set(s * 0.058, -0.138, 0.3);
          group.add(foot);
        }
        this._gunTrigger(group, bright, 0, -0.026, -0.05, { guardR: 0.021 });
        this._gunShell(group, brass, -0.03, 0.0, 0.03, 0.007);
        return group;
      },

      // ---- 504: Anti-Material Rifle -------------------------------------------
      createAntiMaterialRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.82 });
        const tan = this._mat(0x8A7A5A, { roughness: 0.8, metalness: 0.06 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Not for people: a bolt gun scaled up until it needs its own bipod,
        // an arm-thick barrel and a brake the size of a fist.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.06, 0.26), dark);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.5, this.seg(12, 7)), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.4);
        group.add(barrel);
        const flutes = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < flutes; i++) {
          const a = (i / flutes) * Math.PI * 2;
          const flute = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.36), tan);
          flute.position.set(Math.cos(a) * 0.023, 0.032 + Math.sin(a) * 0.023, 0.38);
          group.add(flute);
        }
        const brake = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.09), bright);
        brake.position.set(0, 0.032, 0.68);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        for (let i = 0; i < 3; i++) {
          for (const s of [-1, 1]) {
            const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.014), dark);
            port.position.set(s * 0.03, 0.032, 0.655 + i * 0.024);
            group.add(port);
          }
        }
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, this.seg(11, 7)), bright);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0.01, 0.032, 0.0);
        bolt.userData.gun = 'bolt';
        group.add(bolt);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(9, 6), this.seg(6, 4)), bright);
        knob.position.set(0.036, -0.016, -0.05);
        bolt.add(knob);
        this._gunRail(group, dark, bright, 0, 0.05, 0.06, 0.28);
        this._gunOptic(group, dark, bright, glass, 2, 0, 0.086, 0.06);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.05), dark);
        mag.position.set(0, -0.076, 0.0);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.036, 0.24), tan);
        chassis.position.set(0, -0.022, 0.2);
        group.add(chassis);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.15, this.seg(8, 5)), bright);
          leg.position.set(s * 0.04, -0.1, 0.3);
          leg.rotation.z = s * 0.52;
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.03), dark);
          foot.position.set(s * 0.078, -0.176, 0.3);
          group.add(foot);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.16), tan);
        stock.position.set(0, 0.006, -0.18);
        group.add(stock);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.1), tan);
        cheek.position.set(0, 0.046, -0.16);
        group.add(cheek);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), dark);
        pad.position.set(0, 0.0, -0.27);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), tan);
        grip.position.set(0, -0.064, -0.09);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.03, -0.06, { guardR: 0.022 });
        this._gunShell(group, brass, 0.032, 0.032, 0.02, 0.009);
        return group;
      },

      // ---- 505: RPG -----------------------------------------------------------
      createRPGModel(weapon, rand) {
        const group = new THREE.Group();
        const tube = this._mat(0x3E4A32, { roughness: 0.75, metalness: 0.35 });
        const wood = this._wood(0x8B5A2B);
        const dark = this._mat(0x24262A, { roughness: 0.6, metalness: 0.7 });
        const warhead = this._mat(0x5A5E64, { roughness: 0.55, metalness: 0.7 });

        // Open tube, wooden heat guards, and a grenade sticking a long way out
        // of the front of it.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.44, this.seg(12, 7)), tube);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.06);
        group.add(barrel);
        const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.028, 0.09, this.seg(12, 7)), tube);
        flare.rotation.x = Math.PI / 2;
        flare.position.set(0, 0.02, -0.2);
        group.add(flare);
        const venturi = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.05, this.seg(12, 7)), dark);
        venturi.rotation.x = Math.PI / 2;
        venturi.position.set(0, 0.02, -0.26);
        group.add(venturi);
        for (const z of [-0.05, 0.13]) {
          const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.1, this.seg(12, 7)), wood);
          guard.rotation.x = Math.PI / 2;
          guard.position.set(0, 0.02, z);
          group.add(guard);
          for (let i = 0; i < 2; i++) {
            const strap = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, this.seg(4, 3), this.seg(12, 7)), dark);
            strap.position.set(0, 0.02, z - 0.04 + i * 0.08);
            group.add(strap);
          }
        }
        // The round: a bulbous warhead on a thin stalk, fins folded at the back.
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, this.seg(10, 6)), warhead);
        stalk.rotation.x = Math.PI / 2;
        stalk.position.set(0, 0.02, 0.31);
        group.add(stalk);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, this.seg(12, 7), this.seg(9, 6)), warhead);
        head.scale.z = 1.3;
        head.position.set(0, 0.02, 0.4);
        group.add(head);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, this.seg(10, 6)), dark);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0.02, 0.47);
        group.add(nose);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, this.seg(4, 3), this.seg(12, 7)), dark);
        collar.position.set(0, 0.02, 0.26);
        group.add(collar);
        // Iron sight ladder folded up on the left.
        const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.07, 0.014), dark);
        ladder.position.set(-0.03, 0.06, 0.06);
        group.add(ladder);
        for (let i = 0; i < 3; i++) {
          const notch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.012), tube);
          notch.position.set(-0.03, 0.045 + i * 0.018, 0.06);
          group.add(notch);
        }
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), wood);
        grip.position.set(0, -0.052, -0.05);
        grip.rotation.x = 0.16;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.06, this.seg(9, 6)), wood);
        foregrip.position.set(0, -0.03, 0.09);
        group.add(foregrip);
        this._gunTrigger(group, dark, 0, -0.018, -0.026, { guardR: 0.02 });
        return group;
      },

      // ---- 506: Smart Grenade Launcher ----------------------------------------
      createSmartGrenadeLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2E3238, { roughness: 0.5, metalness: 0.78 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const hud = this._glow(0x4FE3FF, 1.1);
        const gold = this._cast(0xB9902A);

        // Airburst rounds programmed on the way out: a rangefinder head, a
        // computer, and a revolving magazine of fat grenades.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.062, 0.2), shell);
        receiver.position.set(0, 0.012, 0.02);
        group.add(receiver);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.2, this.seg(12, 7)), shell);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.22);
        barrel.userData.gun = 'muzzle';
        group.add(barrel);
        const programmer = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(14, 8)), gold);
        programmer.position.set(0, 0.03, 0.29);
        programmer.userData.pulse = { min: 0.2, max: 1.0, freq: 2.0 };
        group.add(programmer);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, this.seg(14, 8)), polymer);
        drum.rotation.x = Math.PI / 2;
        drum.position.set(0, -0.026, 0.02);
        drum.userData.gun = 'cylinder';
        group.add(drum);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const g = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.062, this.seg(9, 6)), gold);
          g.position.set(Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0);
          drum.add(g);
        }
        // Rangefinder head and its readout.
        const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.036, 0.06), polymer);
        sensor.position.set(0, 0.076, 0.06);
        group.add(sensor);
        const laserWindow = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, this.seg(11, 7)), hud);
        laserWindow.rotation.x = Math.PI / 2;
        laserWindow.position.set(-0.014, 0.076, 0.092);
        laserWindow.userData.pulse = { min: 0.3, max: 1.4, freq: 3.0 };
        group.add(laserWindow);
        const opticWindow = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.003), hud);
        opticWindow.position.set(0.012, 0.076, 0.092);
        group.add(opticWindow);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.002), hud);
        screen.position.set(0, 0.076, 0.03);
        screen.userData.pulse = { min: 0.4, max: 1.2, freq: 1.6 };
        group.add(screen);
        for (let i = 0; i < 3; i++) {
          const key = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.008), bright);
          key.position.set(-0.012 + i * 0.012, 0.06, 0.03);
          group.add(key);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.058, 0.11), polymer);
        stock.position.set(0, 0.006, -0.14);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.066, 0.014), polymer);
        pad.position.set(0, 0.0, -0.202);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), polymer);
        grip.position.set(0, -0.058, -0.07);
        grip.rotation.x = 0.22;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.026), polymer);
        foregrip.position.set(0, -0.036, 0.15);
        group.add(foregrip);
        this._gunTrigger(group, bright, 0, -0.026, -0.04, { guardR: 0.022 });
        return group;
      },

      // ---- 507: Micro-Missile Array -------------------------------------------
      createMicroMissileArrayModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x36393E, { roughness: 0.5, metalness: 0.8 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.06 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const seeker = this._glow(0xFF4F4F, 1.1);

        // A honeycomb of small tubes, each with its own round: it does not
        // fire so much as empty.
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.16), shell);
        block.position.set(0, 0.03, 0.1);
        group.add(block);
        const cells = [];
        for (let r = -1; r <= 1; r++) {
          for (let c = -1; c <= 1; c++) {
            if (this.isLowDetail() && (Math.abs(r) + Math.abs(c)) > 1) continue;
            cells.push([c * 0.034 + (Math.abs(r) === 1 ? 0.017 : 0), r * 0.03]);
          }
        }
        for (const [x, y] of cells) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, this.seg(9, 6)), polymer);
          tube.rotation.x = Math.PI / 2;
          tube.position.set(x, 0.03 + y, 0.1);
          group.add(tube);
          const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.026, this.seg(8, 5)), bright);
          nose.rotation.x = Math.PI / 2;
          nose.position.set(x, 0.03 + y, 0.185);
          group.add(nose);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), seeker);
          eye.position.set(x, 0.03 + y, 0.2);
          eye.userData.pulse = { min: 0.2, max: 1.3, freq: 2.4, phase: x * 30 + y * 20 };
          group.add(eye);
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.095, 0.014), shell);
        frame.position.set(0, 0.03, 0.185);
        group.add(frame);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.14), shell);
        spine.position.set(0, 0.006, -0.02);
        group.add(spine);
        const computer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), polymer);
        computer.position.set(0, 0.056, -0.02);
        group.add(computer);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.018, 0.002), seeker);
        screen.position.set(0, 0.056, 0.006);
        screen.userData.pulse = { min: 0.3, max: 1.1, freq: 1.4 };
        group.add(screen);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.03), polymer);
        brace.position.set(0, 0.0, -0.1);
        group.add(brace);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), polymer);
        grip.position.set(0, -0.055, -0.05);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.024, -0.022, { guardR: 0.021 });
        return group;
      },

      // ---- 508: Disposable Rocket ---------------------------------------------
      createDisposableRocketModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x4A5240, { roughness: 0.82, metalness: 0.2 });
        const yellow = this._mat(0xE0B400, { roughness: 0.75, metalness: 0.1 });
        const black = this._mat(0x1A1C20, { roughness: 0.88, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.85 });

        // A cardboard tube with instructions printed on it. Used once, then
        // dropped, which is the whole design.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, this.seg(12, 7)), olive);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0.06);
        group.add(tube);
        for (const z of [-0.19, 0.31]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.01, this.seg(12, 7)), black);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(0, 0.02, z);
          group.add(cap);
        }
        // Warning bands and the printed instruction panel.
        for (let i = 0; i < 2; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.0355, 0.006, this.seg(4, 3), this.seg(14, 8)), yellow);
          band.position.set(0, 0.02, -0.14 + i * 0.42);
          group.add(band);
        }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.14), yellow);
        panel.position.set(0, 0.056, 0.06);
        panel.rotation.z = 0;
        group.add(panel);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.002, 0.006), black);
            line.position.set(0, 0.058, 0.02 + i * 0.024);
            group.add(line);
          }
        }
        // Flip-up sight and the pop-up trigger bar, both stowed.
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.004), black);
        sight.position.set(0, 0.066, -0.06);
        group.add(sight);
        const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.002, this.seg(4, 3), this.seg(9, 6)), black);
        aperture.position.set(0, 0.072, -0.06);
        group.add(aperture);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.05), black);
        bar.position.set(0, 0.05, -0.02);
        bar.userData.gun = 'trigger';
        group.add(bar);
        const safety = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.012), bright);
        safety.position.set(0.026, 0.036, -0.02);
        group.add(safety);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.09), black);
        strap.position.set(0, -0.02, 0.0);
        group.add(strap);
        const sling = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(12, 7), Math.PI), black);
        sling.position.set(0, -0.03, 0.14);
        sling.rotation.set(0, Math.PI / 2, Math.PI);
        group.add(sling);
        return group;
      },

      // ---- 509: Heavy Sniper --------------------------------------------------
      createHeavySniperModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x1E2126, { roughness: 0.5, metalness: 0.82 });
        const bright = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // Bullpup anti-material: the magazine is behind the trigger, the
        // barrel recoils inside the chassis, and it weighs more than the man.
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.42), dark);
        chassis.position.set(0, 0.01, -0.02);
        group.add(chassis);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.34, this.seg(12, 7)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.034, 0.32);
        barrel.userData.gun = 'slide';   // it recoils inside the chassis
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.08, this.seg(12, 7)), dark);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.034, 0.52);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        for (let i = 0; i < 3; i++) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.006, 0.012), bright);
          slot.position.set(0, 0.034, 0.5 + i * 0.022);
          group.add(slot);
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.09, 0.05), dark);
        mag.position.set(0, -0.06, -0.12);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, this.seg(9, 6)), bright);
        boltHandle.rotation.z = Math.PI / 2;
        boltHandle.position.set(0.036, 0.03, -0.06);
        boltHandle.userData.gun = 'bolt';
        group.add(boltHandle);
        this._gunRail(group, dark, bright, 0, 0.062, 0.02, 0.3);
        this._gunOptic(group, dark, bright, glass, 2, 0, 0.094, 0.04);
        const carry = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(12, 7), Math.PI), bright);
        carry.position.set(0, 0.06, -0.14);
        carry.rotation.set(0, Math.PI / 2, 0);
        group.add(carry);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.16, this.seg(8, 5)), bright);
          leg.position.set(s * 0.042, -0.1, 0.22);
          leg.rotation.z = s * 0.5;
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.032), dark);
          foot.position.set(s * 0.082, -0.182, 0.22);
          group.add(foot);
        }
        const monopod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, this.seg(8, 5)), bright);
        monopod.position.set(0, -0.07, -0.2);
        group.add(monopod);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.09, 0.02), dark);
        pad.position.set(0, 0.006, -0.235);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), dark);
        grip.position.set(0, -0.056, 0.02);
        grip.rotation.x = 0.16;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.028), dark);
        foregrip.position.set(0, -0.05, 0.18);
        group.add(foregrip);
        this._gunTrigger(group, bright, 0, -0.022, 0.056, { guardR: 0.022 });
        this._gunShell(group, brass, 0.036, 0.02, -0.06, 0.01);
        return group;
      },

      // ---- 510: HMG -----------------------------------------------------------
      createHMGModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.76 });
        const bright = this._mat(0x8A9096, { roughness: 0.4, metalness: 0.88 });
        const green = this._mat(0x3E4A32, { roughness: 0.8, metalness: 0.2 });
        const brass = this._cast(0xC9A227);

        // The lighter cousin of 497, cut down to be carried: a shorter jacket,
        // a bipod instead of a tripod, and a stock rather than spade grips.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.062, 0.24), dark);
        receiver.position.set(0, 0.01, 0.0);
        group.add(receiver);
        const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, this.seg(12, 7)), bright);
        jacket.rotation.x = Math.PI / 2;
        jacket.position.set(0, 0.03, 0.24);
        group.add(jacket);
        const holes = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < holes; i++) {
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.046, this.seg(7, 5)), dark);
          hole.rotation.z = Math.PI / 2;
          hole.position.set(0, 0.03, 0.15 + i * 0.024);
          group.add(hole);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.08, this.seg(10, 6)), bright);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.39);
        barrel.userData.gun = 'muzzle';
        group.add(barrel);
        const feedCover = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.018, 0.14), dark);
        feedCover.position.set(0, 0.048, 0.02);
        feedCover.userData.gun = 'bolt';
        group.add(feedCover);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.08), green);
        box.position.set(0, -0.056, 0.02);
        box.userData.gun = 'magazine';
        group.add(box);
        const links = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < links; i++) {
          const t = i / links;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.028, this.seg(7, 5)), brass);
          r.rotation.z = Math.PI / 2;
          r.position.set(0.014, -0.02 + t * 0.05, 0.02);
          group.add(r);
        }
        const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), dark);
        rearSight.position.set(0, 0.066, -0.06);
        group.add(rearSight);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.06, 0.12), green);
        stock.position.set(0, 0.0, -0.16);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.066, 0.014), dark);
        pad.position.set(0, -0.004, -0.226);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), green);
        grip.position.set(0, -0.056, -0.08);
        grip.rotation.x = 0.2;
        group.add(grip);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.12, this.seg(7, 5)), bright);
          leg.position.set(s * 0.028, -0.08, 0.24);
          leg.rotation.z = s * 0.46;
          group.add(leg);
        }
        this._gunTrigger(group, bright, 0, -0.026, -0.05, { guardR: 0.021 });
        this._gunShell(group, brass, -0.032, 0.0, 0.02, 0.007);
        return group;
      },

      // ---- 511: Brainwave Amplifier -------------------------------------------
      createBrainwaveAmplifierModel(weapon, rand) {
        const group = new THREE.Group();
        const chrome = this._mat(0xC0C6CC, { roughness: 0.2, metalness: 0.94 });
        const bake = this._mat(0x2A2018, { roughness: 0.7, metalness: 0.12 });
        const waveColor = this.getRandomColor(rand, [0xC77DFF, 0x7DD3FF]);
        const wave = this._glow(waveColor, 1.2);
        const copper = this._mat(0xB87333, { roughness: 0.3, metalness: 0.9 });

        // It does not fire anything: it makes what is already in your head
        // louder, through a stack of resonators and a dish of antennae.
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, this.seg(12, 7)), bake);
        core.rotation.x = Math.PI / 2;
        core.position.set(0, 0.02, 0.02);
        group.add(core);
        // The resonators are a packed coil: spaced by more than their own
        // thickness they were a row of loose hoops floating off the barrel.
        const rings = this.isLowDetail() ? 3 : 6;
        const ringStep = 0.009;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034 - i * 0.002, 0.005, this.seg(4, 3), this.seg(14, 8)), copper);
          ring.position.set(0, 0.02, 0.09 + i * ringStep);
          group.add(ring);
          const glow = new THREE.Mesh(new THREE.TorusGeometry(0.028 - i * 0.002, 0.002, this.seg(4, 3), this.seg(14, 8)), wave);
          glow.position.set(0, 0.02, 0.09 + i * ringStep);
          glow.userData.pulse = { min: 0.05, max: 1.4, freq: 1.4, phase: -i * 0.9 };
          group.add(glow);
        }
        // The antenna crown at the front. It sits just past the last
        // resonator ring, however many of them the detail budget built: at a
        // fixed depth the whole crown floated clear of the instrument.
        const crownZ = 0.09 + (rings - 1) * ringStep + 0.028;
        const spokes = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.07, this.seg(6, 4)), copper);
          rod.position.set(Math.cos(a) * 0.035, 0.02 + Math.sin(a) * 0.035, crownZ);
          rod.rotation.x = Math.PI / 2;
          rod.rotation.z = a;
          group.add(rod);
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), wave);
          bead.position.set(Math.cos(a) * 0.045, 0.02 + Math.sin(a) * 0.045, crownZ + 0.03);
          bead.userData.pulse = { min: 0.2, max: 1.4, freq: 2.0, phase: i * 0.9 };
          group.add(bead);
        }
        const focus = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(8, 5)), wave);
        focus.position.set(0, 0.02, crownZ + 0.03);
        focus.userData.pulse = { min: 0.5, max: 1.6, freq: 1.1 };
        group.add(focus);
        // Valve bank: this is old technology, whatever it does.
        for (let i = 0; i < 3; i++) {
          const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, this.seg(10, 6)), this._mat(0xE8DCC0, { roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.5 }));
          valve.position.set(-0.02 + i * 0.02, 0.062, -0.02);
          group.add(valve);
          const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.024, this.seg(6, 4)), wave);
          filament.position.set(-0.02 + i * 0.02, 0.062, -0.02);
          filament.userData.pulse = { min: 0.4, max: 1.3, freq: 2.2, phase: i };
          group.add(filament);
        }
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), bake);
        chassis.position.set(0, 0.008, -0.08);
        group.add(chassis);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, this.seg(12, 7)), chrome);
        dial.rotation.y = Math.PI / 2;
        dial.position.set(0.028, 0.02, -0.08);
        dial.userData.spin = { axis: 'x', speed: 0.4 };
        group.add(dial);
        const headband = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(14, 8), Math.PI), chrome);
        headband.position.set(0, 0.05, -0.1);
        headband.rotation.set(0, Math.PI / 2, 0);
        group.add(headband);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.08, this.seg(10, 6)), bake);
        grip.position.set(0, -0.05, -0.05);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, chrome, 0, -0.016, -0.026, { guardR: 0.018 });
        return group;
      },

      // ---- 512: Polymorphic Arsenal -------------------------------------------
      createPolymorphicArsenalModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xA8AEB4, { roughness: 0.24, metalness: 0.94 });
        const dark = this._mat(0x24262A, { roughness: 0.5, metalness: 0.8 });
        const seamColor = this.getRandomColor(rand, [0x4FE3FF, 0xFF8A4F]);
        const seam = this._glow(seamColor, 1.0);

        // It has not decided what it is yet. Blocks slide and turn over each
        // other and every so often something recognisable surfaces.
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.036, 0.28), dark);
        spine.position.set(0, 0.014, 0.04);
        group.add(spine);
        const blocks = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < blocks; i++) {
          const t = i / (blocks - 1);
          const w = 0.05 - Math.abs(t - 0.5) * 0.03;
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.03), i % 2 ? alloy : dark);
          b.position.set(0, 0.02 + Math.sin(t * 4) * 0.008, -0.06 + i * 0.036);
          b.userData.spin = { axis: 'z', speed: (i % 2 ? 0.35 : -0.5) * (0.5 + t) };
          b.userData.bob = { axis: 'y', amp: 0.006, freq: 0.9, phase: i * 0.7 };
          group.add(b);
          const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.003, 0.032), seam);
          line.position.set(0, 0.02 + Math.sin(t * 4) * 0.008, -0.06 + i * 0.036);
          line.userData.pulse = { min: 0.1, max: 1.2, freq: 1.3, phase: i * 0.6 };
          group.add(line);
        }
        // A barrel that is currently a barrel.
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.1, this.seg(11, 7)), alloy);
        bore.rotation.x = Math.PI / 2;
        bore.position.set(0, 0.026, 0.3);
        bore.userData.gun = 'muzzle';
        group.add(bore);
        const irisBlades = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < irisBlades; i++) {
          const a = (i / irisBlades) * Math.PI * 2;
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.012), alloy);
          blade.position.set(Math.cos(a) * 0.012, 0.026 + Math.sin(a) * 0.012, 0.348);
          blade.rotation.z = a;
          group.add(blade);
        }
        const iris = new THREE.Group();
        iris.position.set(0, 0.026, 0.348);
        iris.userData.spin = { axis: 'z', speed: 0.9 };
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, this.seg(4, 3), this.seg(12, 7)), seam);
        iris.add(ring);
        group.add(iris);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.05, -0.05);
        grip.rotation.x = 0.2;
        group.add(grip);
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.02), alloy);
        shoulder.position.set(0, 0.012, -0.12);
        shoulder.userData.bob = { axis: 'z', amp: 0.012, freq: 0.5 };
        group.add(shoulder);
        this._gunTrigger(group, alloy, 0, -0.02, -0.024, {});
        return group;
      },

      // ---- 513: MANPADS -------------------------------------------------------
      createMANPADSModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x4A5240, { roughness: 0.8, metalness: 0.25 });
        const dark = this._mat(0x1E2126, { roughness: 0.7, metalness: 0.5 });
        const bright = this._mat(0x8A9096, { roughness: 0.4, metalness: 0.85 });
        const lock = this._glow(0x4FFF6A, 1.1);

        // Shoulder-launched anti-air: a launch tube, a gripstock that clips
        // under it, and a seeker head that has to growl before it will fire.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.56, this.seg(12, 7)), olive);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.04, 0.06);
        group.add(tube);
        for (const z of [-0.22, 0.34]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.012, this.seg(12, 7)), dark);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(0, 0.04, z);
          group.add(cap);
        }
        const seeker = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 6)), dark);
        seeker.position.set(0, 0.04, 0.34);
        group.add(seeker);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(11, 7), this.seg(8, 5)), lock);
        dome.position.set(0, 0.04, 0.36);
        dome.userData.pulse = { min: 0.3, max: 1.4, freq: 2.6 };
        group.add(dome);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.006, this.seg(4, 3), this.seg(14, 8)), dark);
        collar.position.set(0, 0.04, 0.12);
        group.add(collar);
        // Gripstock hanging under, with a battery bottle in front of the grip.
        const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.14), dark);
        stockBody.position.set(0, -0.01, -0.02);
        group.add(stockBody);
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, this.seg(11, 7)), bright);
        bottle.position.set(0, -0.04, 0.04);
        bottle.rotation.x = 0.3;
        bottle.userData.gun = 'magazine';
        group.add(bottle);
        const buzzer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.02), olive);
        buzzer.position.set(0.024, 0.0, -0.04);
        group.add(buzzer);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(4, 3)), lock);
        light.position.set(0.03, 0.012, -0.04);
        light.userData.pulse = { min: 0.0, max: 1.5, freq: 4.0 };
        group.add(light);
        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), dark);
        shoulder.position.set(0, 0.006, -0.18);
        group.add(shoulder);
        const sightFrame = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, this.seg(4, 3), this.seg(14, 8)), bright);
        sightFrame.position.set(-0.03, 0.08, 0.06);
        sightFrame.rotation.y = Math.PI / 2;
        group.add(sightFrame);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, this.seg(6, 4)), bright);
        post.position.set(-0.03, 0.062, 0.06);
        group.add(post);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), dark);
        grip.position.set(0, -0.06, -0.05);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.03, -0.024, { guardR: 0.021 });
        return group;
      },

      // ---- 514: Mind Piercer --------------------------------------------------
      createMindPiercerModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xD8CFBA, { roughness: 0.7, metalness: 0.06 });
        const dark = this._mat(0x241C24, { roughness: 0.55, metalness: 0.4 });
        const psiColor = this.getRandomColor(rand, [0xB86BFF, 0xFF6BB8]);
        const psi = this._glow(psiColor, 1.3);

        // A needle rather than a barrel, and a lens that finds the place to
        // put it. The trigger is the only ordinary thing on it.
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.3, this.seg(9, 6)), bone);
        spike.rotation.x = Math.PI / 2;
        spike.position.set(0, 0.03, 0.24);
        spike.userData.gun = 'muzzle';
        group.add(spike);
        const barbs = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < barbs; i++) {
          const t = i / barbs;
          const barb = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, 3), bone);
          barb.position.set(0, 0.03, 0.14 + t * 0.16);
          barb.rotation.set(-Math.PI / 2, 0, t * 4);
          group.add(barb);
        }
        const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3, this.seg(7, 5)), psi);
        thread.rotation.x = Math.PI / 2;
        thread.position.set(0, 0.03, 0.24);
        thread.userData.pulse = { min: 0.3, max: 1.4, freq: 2.0 };
        group.add(thread);
        const skullPlate = new THREE.Mesh(new THREE.SphereGeometry(0.036, this.seg(12, 7), this.seg(9, 6)), bone);
        skullPlate.scale.set(1, 0.9, 1.2);
        skullPlate.position.set(0, 0.026, 0.05);
        group.add(skullPlate);
        // The lens, turning to look for a way in.
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.017, this.seg(11, 7), this.seg(8, 5)), psi);
        lens.position.set(0, 0.05, 0.07);
        lens.userData.spin = { axis: 'y', speed: 1.2 };
        lens.userData.pulse = { min: 0.4, max: 1.5, freq: 1.4 };
        group.add(lens);
        const iris = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(4, 3), this.seg(12, 7)), dark);
        iris.position.set(0, 0.05, 0.07);
        iris.rotation.x = 0.4;
        iris.userData.spin = { axis: 'z', speed: -0.8 };
        group.add(iris);
        const motes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < motes; i++) {
          const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), psi);
          mote.position.set(0, 0.05, 0.07);
          mote.userData.orbit = { radius: 0.04 + i * 0.006, speed: 0.9 + i * 0.3, phase: i * 1.7, plane: 'xz' };
          mote.userData.pulse = { min: 0.2, max: 1.2, freq: 1.8, phase: i };
          group.add(mote);
        }
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.12, this.seg(11, 7)), dark);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.018, -0.05);
        group.add(body);
        const vertebrae = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < vertebrae; i++) {
          const v = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, this.seg(4, 3), this.seg(10, 6)), bone);
          v.position.set(0, 0.018, -0.09 + i * 0.026);
          group.add(v);
        }
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, this.seg(10, 6)), bone);
        grip.position.set(0, -0.05, -0.07);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, dark, 0, -0.016, -0.046, { guardR: 0.017 });
        return group;
      },

      // ---- 515: Neural Disruptor ----------------------------------------------
      createNeuralDisruptorModel(weapon, rand) {
        const group = new THREE.Group();
        const white = this._mat(0xEAEEF2, { roughness: 0.32, metalness: 0.35 });
        const grey = this._mat(0x5E6368, { roughness: 0.45, metalness: 0.8 });
        const pulseColor = this.getRandomColor(rand, [0x7DFFD3, 0xFF7D9C]);
        const field = this._glow(pulseColor, 1.2);
        const dark = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.08 });

        // Clinical: two emitter horns and a field standing between them, with
        // the settings on a panel because somebody has to sign for the dose.
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.17, this.seg(12, 7)), white);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.02, 0.02);
        group.add(body);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.11, this.seg(11, 7), 1, true), white);
          horn.rotation.x = -Math.PI / 2;
          horn.position.set(s * 0.026, 0.02, 0.17);
          group.add(horn);
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(4, 3), this.seg(12, 7)), grey);
          coil.position.set(s * 0.026, 0.02, 0.2);
          group.add(coil);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(9, 6), this.seg(6, 4)), field);
          tip.position.set(s * 0.026, 0.02, 0.23);
          tip.userData.pulse = { min: 0.4, max: 1.5, freq: 2.2, phase: s };
          group.add(tip);
        }
        // The field arcing across between the horns.
        const rungs = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < rungs; i++) {
          const arc = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.003), field);
          arc.position.set(0, 0.02, 0.17 + i * 0.016);
          arc.rotation.z = (i % 2 ? 1 : -1) * 0.35;
          arc.userData.pulse = { min: 0.0, max: 1.7, freq: 6 + i, phase: i * 1.7 };
          group.add(arc);
        }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.024, 0.002), field);
        panel.position.set(0, 0.05, 0.0);
        panel.userData.pulse = { min: 0.3, max: 1.1, freq: 1.5 };
        group.add(panel);
        for (let i = 0; i < 4; i++) {
          const key = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.005, 0.006), grey);
          key.position.set(-0.014 + i * 0.01, 0.05, -0.02);
          group.add(key);
        }
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, this.seg(11, 7)), dark);
        cell.position.set(0, -0.036, 0.0);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, this.seg(4, 3), this.seg(12, 7)), field);
        band.position.set(0, -0.036, 0.0);
        band.rotation.x = Math.PI / 2;
        band.userData.pulse = { min: 0.2, max: 1.0, freq: 0.9 };
        group.add(band);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 0.05), white);
        brace.position.set(0, 0.012, -0.09);
        group.add(brace);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.052, -0.06);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, grey, 0, -0.02, -0.036, {});
        return group;
      },

      // ---- 516: Coilgun -------------------------------------------------------
      createCoilgunModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x9BA1A7, { roughness: 0.35, metalness: 0.9 });
        const copper = this._mat(0xB87333, { roughness: 0.28, metalness: 0.92 });
        const dark = this._mat(0x1E2126, { roughness: 0.6, metalness: 0.7 });
        const charge = this._glow(0x4FC3FF, 1.3);

        // Stages of copper winding down a rail, each firing as the slug passes.
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.36), alloy);
        rail.position.set(0, 0.03, 0.16);
        group.add(rail);
        const stages = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < stages; i++) {
          const z = 0.03 + i * 0.046;
          const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.032, this.seg(12, 7)), copper);
          spool.rotation.x = Math.PI / 2;
          spool.position.set(0, 0.03, z);
          group.add(spool);
          for (let j = 0; j < 3; j++) {
            const winding = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.003, this.seg(4, 3), this.seg(12, 7)), copper);
            winding.position.set(0, 0.03, z - 0.01 + j * 0.01);
            group.add(winding);
          }
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.003, this.seg(4, 3), this.seg(12, 7)), charge);
          ring.position.set(0, 0.03, z);
          ring.userData.pulse = { min: 0.0, max: 1.6, freq: 2.4, phase: -i * 0.85 };
          group.add(ring);
        }
        // Capacitor bank under the rail: this is where the mass is.
        for (let i = 0; i < 3; i++) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, this.seg(11, 7)), dark);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(-0.02 + i * 0.02, -0.02, 0.06);
          group.add(cap);
        }
        const busbar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.02), copper);
        busbar.position.set(0, 0.004, 0.11);
        group.add(busbar);
        const breech = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.09), dark);
        breech.position.set(0, 0.02, -0.05);
        group.add(breech);
        const slugMag = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.07, 0.03), alloy);
        slugMag.position.set(0, -0.03, -0.05);
        slugMag.userData.gun = 'magazine';
        group.add(slugMag);
        const meter = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.004), charge);
        meter.position.set(0.014, -0.03, -0.034);
        meter.userData.pulse = { min: 0.2, max: 1.2, freq: 0.9 };
        group.add(meter);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), dark);
        stock.position.set(0, 0.014, -0.14);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.05, -0.09);
        grip.rotation.x = 0.2;
        group.add(grip);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, this.seg(12, 7)), alloy);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.03, 0.35);
        muzzle.userData.gun = 'muzzle';
        group.add(muzzle);
        this._gunTrigger(group, alloy, 0, -0.02, -0.062, {});
        return group;
      },

      // ---- 517: Anti-Material Rifle (bullpup variant) -------------------------
      createAntiMaterialBullpupModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2A2E34, { roughness: 0.52, metalness: 0.8 });
        const grey = this._mat(0x5E6368, { roughness: 0.6, metalness: 0.7 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        const brass = this._cast(0xC9A227);

        // The other approach to the same job: the whole action behind the
        // grip, so the barrel can be long without the rifle being.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.086, 0.34), dark);
        shell.position.set(0, 0.012, -0.04);
        group.add(shell);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.42, this.seg(12, 7)), grey);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.032, 0.32);
        group.add(barrel);
        const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), dark);
        shroud.position.set(0, 0.03, 0.19);
        group.add(shroud);
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            for (const s of [-1, 1]) {
              const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.016), grey);
              slot.position.set(s * 0.024, 0.03, 0.13 + i * 0.028);
              group.add(slot);
            }
          }
        }
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.07, this.seg(12, 7)), bright);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.032, 0.55);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        for (let i = 0; i < 2; i++) {
          const baffle = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, this.seg(4, 3), this.seg(14, 8)), dark);
          baffle.position.set(0, 0.032, 0.535 + i * 0.03);
          group.add(baffle);
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.05), dark);
        mag.position.set(0, -0.058, -0.13);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, this.seg(9, 6)), bright);
        boltHandle.rotation.z = Math.PI / 2;
        boltHandle.position.set(0.036, 0.03, -0.09);
        boltHandle.userData.gun = 'bolt';
        group.add(boltHandle);
        this._gunRail(group, dark, bright, 0, 0.06, 0.0, 0.28);
        this._gunOptic(group, dark, bright, glass, 2, 0, 0.092, 0.02);
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.14, this.seg(8, 5)), bright);
          leg.position.set(s * 0.036, -0.09, 0.2);
          leg.rotation.z = s * 0.5;
          group.add(leg);
        }
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.086, 0.02), dark);
        pad.position.set(0, 0.008, -0.216);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), dark);
        grip.position.set(0, -0.054, 0.03);
        grip.rotation.x = 0.16;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.028), dark);
        foregrip.position.set(0, -0.046, 0.15);
        group.add(foregrip);
        this._gunTrigger(group, bright, 0, -0.02, 0.066, { guardR: 0.022 });
        this._gunShell(group, brass, 0.036, 0.02, -0.09, 0.01);
        return group;
      },

      // ---- 518: Railgun Prototype ---------------------------------------------
      createRailgunPrototypeModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB0B6BC, { roughness: 0.3, metalness: 0.92 });
        const copper = this._mat(0xB87333, { roughness: 0.28, metalness: 0.92 });
        const dark = this._mat(0x1A1C20, { roughness: 0.62, metalness: 0.7 });
        const arc = this._glow(0x9CE4FF, 1.5);
        const tape = this._mat(0xE0B400, { roughness: 0.75, metalness: 0.1 });

        // A prototype, and it looks like one: two bare rails, a bank of
        // capacitors zip-tied on, and hazard tape where the guards should be.
        for (const s of [-1, 1]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 0.4), copper);
          bar.position.set(s * 0.018, 0.03, 0.2);
          group.add(bar);
        }
        const insulator = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.4), dark);
        insulator.position.set(0, 0.03, 0.2);
        group.add(insulator);
        // The armature, sitting between the rails at the breech.
        const armature = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.024), alloy);
        armature.position.set(0, 0.03, 0.03);
        armature.userData.gun = 'bolt';
        group.add(armature);
        const arcs = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < arcs; i++) {
          const flash = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), arc);
          flash.position.set(0, 0.03, 0.06 + i * 0.056);
          flash.rotation.z = (i % 2 ? 1 : -1) * 0.4;
          flash.userData.pulse = { min: 0.0, max: 1.8, freq: 7 + i, phase: i * 1.6 };
          group.add(flash);
        }
        const spacers = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < spacers; i++) {
          const spacer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.012), dark);
          spacer.position.set(0, 0.048, 0.06 + i * 0.076);
          group.add(spacer);
        }
        // Capacitor bank, strapped underneath.
        for (let i = 0; i < 4; i++) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.11, this.seg(11, 7)), dark);
          cap.rotation.x = Math.PI / 2;
          cap.position.set(-0.026 + (i % 2) * 0.052, -0.014 - Math.floor(i / 2) * 0.034, 0.1);
          group.add(cap);
          const term = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, this.seg(7, 5)), copper);
          term.rotation.x = Math.PI / 2;
          term.position.set(-0.026 + (i % 2) * 0.052, -0.014 - Math.floor(i / 2) * 0.034, 0.158);
          group.add(term);
        }
        for (let i = 0; i < 2; i++) {
          const tie = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.003, this.seg(4, 3), this.seg(14, 8)), tape);
          tie.position.set(0, -0.006, 0.06 + i * 0.09);
          tie.scale.set(1.3, 1, 1);
          group.add(tie);
        }
        const breech = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.06, 0.09), alloy);
        breech.position.set(0, 0.024, -0.05);
        group.add(breech);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(12, 7)), arc);
        gauge.rotation.y = Math.PI / 2;
        gauge.position.set(0.03, 0.04, -0.05);
        gauge.userData.pulse = { min: 0.2, max: 1.3, freq: 1.2 };
        group.add(gauge);
        const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.03), alloy);
        hopper.position.set(0, -0.02, -0.05);
        hopper.userData.gun = 'magazine';
        group.add(hopper);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), dark);
        stock.position.set(0, 0.02, -0.14);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.048, -0.09);
        grip.rotation.x = 0.2;
        group.add(grip);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.036, 0.014), alloy);
        mouth.position.set(0, 0.03, 0.405);
        mouth.userData.gun = 'muzzle';
        group.add(mouth);
        this._gunTrigger(group, alloy, 0, -0.018, -0.062, { guard: false });
        return group;
      },

      // ---- 519: EHI Headache Inducer ------------------------------------------
      createHeadacheInducerModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.4, metalness: 0.25 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const grey = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.75 });
        const throb = this._glow(0xFF5A5A, 1.1);

        // EHI product design: rounded, branded, and with a compliance label
        // where the warning should be.
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.18, this.seg(14, 8)), corporate);
        body.rotation.x = Math.PI / 2;
        body.position.set(0, 0.02, 0.03);
        group.add(body);
        for (const z of [-0.06, 0.12]) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.036, this.seg(14, 8), this.seg(9, 6), 0, Math.PI * 2, 0, Math.PI / 2), corporate);
          cap.rotation.x = z < 0 ? Math.PI / 2 : -Math.PI / 2;
          cap.position.set(0, 0.02, z);
          group.add(cap);
        }
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.0365, 0.007, this.seg(4, 3), this.seg(16, 9)), accent);
        stripe.position.set(0, 0.02, 0.06);
        group.add(stripe);
        // The emitter: concentric rings that beat, slightly out of time.
        const rings = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 - i * 0.006, 0.004, this.seg(4, 3), this.seg(14, 8)), throb);
          ring.position.set(0, 0.02, 0.16 + i * 0.004);
          ring.userData.pulse = { min: 0.1, max: 1.3, freq: 1.1 + i * 0.13, phase: i * 0.8 };
          group.add(ring);
        }
        const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.03, this.seg(14, 8)), grey);
        dish.rotation.x = Math.PI / 2;
        dish.position.set(0, 0.02, 0.15);
        dish.userData.gun = 'muzzle';
        group.add(dish);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.05), accent);
        label.position.set(0, 0.056, 0.02);
        group.add(label);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.002, 0.004), corporate);
            line.position.set(0, 0.058, 0.008 + i * 0.012);
            group.add(line);
          }
        }
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.002), throb);
        readout.position.set(0.03, 0.03, -0.01);
        readout.rotation.y = Math.PI / 2;
        readout.userData.pulse = { min: 0.3, max: 1.0, freq: 1.1 };
        group.add(readout);
        const cell = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.036), accent);
        cell.position.set(0, -0.03, -0.02);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), grey);
        grip.position.set(0, -0.058, -0.06);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, grey, 0, -0.022, -0.03, {});
        return group;
      },

      // ---- 520: EHI Crude Projector -------------------------------------------
      createCrudeProjectorModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.42, metalness: 0.25 });
        const black = this._mat(0x14161A, { roughness: 0.1, metalness: 0.7 });
        const pipe = this._mat(0x5A5F66, { roughness: 0.55, metalness: 0.8 });
        const hazard = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.3 });
        const sheen = this._glow(0x2A6B4A, 0.35);

        // The same brand language as the Headache Inducer, wrapped round a
        // pump that fires unrefined product.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), corporate);
        shell.position.set(0, 0.014, 0.02);
        group.add(shell);
        const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.1), black);
        window_.position.set(0.026, 0.014, 0.02);
        group.add(window_);
        const slick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.09), sheen);
        slick.position.set(0.028, 0.006, 0.02);
        slick.userData.pulse = { min: 0.2, max: 0.5, freq: 0.6 };
        group.add(slick);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 0.12, this.seg(12, 7)), pipe);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.03, 0.18);
        group.add(nozzle);
        const spray = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.04, this.seg(12, 7), 1, true), black);
        spray.rotation.x = -Math.PI / 2;
        spray.position.set(0, 0.03, 0.26);
        spray.userData.gun = 'muzzle';
        group.add(spray);
        for (let i = 0; i < 3; i++) {
          const collar = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.004, this.seg(4, 3), this.seg(12, 7)), hazard);
          collar.position.set(0, 0.03, 0.14 + i * 0.03);
          group.add(collar);
        }
        // The pump: a lever that has to be worked between shots.
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.09), pipe);
        lever.position.set(0, -0.026, 0.08);
        lever.rotation.x = 0.2;
        lever.userData.gun = 'slide';
        group.add(lever);
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.026, this.seg(9, 6)), pipe);
        pivot.rotation.z = Math.PI / 2;
        pivot.position.set(0, -0.02, 0.04);
        group.add(pivot);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, this.seg(12, 7)), black);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, -0.05, -0.03);
        drum.userData.gun = 'magazine';
        group.add(drum);
        for (let i = 0; i < 2; i++) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, this.seg(4, 3), this.seg(12, 7)), hazard);
          hoop.rotation.y = Math.PI / 2;
          hoop.position.set(-0.018 + i * 0.036, -0.05, -0.03);
          group.add(hoop);
        }
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.04), hazard);
        label.position.set(0, 0.046, -0.02);
        group.add(label);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.036), corporate);
        grip.position.set(0, -0.05, -0.08);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, pipe, 0, -0.02, -0.05, {});
        return group;
      },

      // ---- 521: Minigun -------------------------------------------------------
      createMinigunBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x24262A, { roughness: 0.55, metalness: 0.78 });
        const bright = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const green = this._mat(0x3E4A32, { roughness: 0.8, metalness: 0.2 });
        const heat = this._glow(0xFF6A1A, 0.9);
        const brass = this._cast(0xC9A227);

        // The full man-portable rig: six barrels, a clamshell housing, a drive
        // motor, a flexible feed chute and a battery pack on the back.
        const cluster = new THREE.Group();
        cluster.position.set(0, 0.02, 0.24);
        cluster.userData.gun = 'cylinder';
        cluster.userData.spin = { axis: 'z', speed: 9.0 };
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.011, 0.38, this.seg(9, 6)), bright);
          b.rotation.x = Math.PI / 2;
          b.position.set(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0);
          cluster.add(b);
        }
        for (const dz of [-0.15, 0.16]) {
          const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, this.seg(14, 8)), dark);
          clamp.rotation.x = Math.PI / 2;
          clamp.position.z = dz;
          cluster.add(clamp);
        }
        group.add(cluster);
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, this.seg(14, 8)), dark);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(0, 0.02, 0.0);
        group.add(housing);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.006, 0.16), bright);
        seam.position.set(0, 0.02, 0.0);
        group.add(seam);
        const glow = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.004, this.seg(4, 3), this.seg(14, 8)), heat);
        glow.position.set(0, 0.02, 0.07);
        glow.userData.pulse = { min: 0.1, max: 1.2, freq: 2.2 };
        group.add(glow);
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, this.seg(12, 7)), dark);
        motor.rotation.z = Math.PI / 2;
        motor.position.set(-0.065, 0.02, 0.0);
        group.add(motor);
        for (let i = 0; i < 4; i++) {
          const fin = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.003, this.seg(4, 3), this.seg(12, 7)), bright);
          fin.rotation.y = Math.PI / 2;
          fin.position.set(-0.09 + i * 0.018, 0.02, 0.0);
          group.add(fin);
        }
        // Flexible chute curling round from a backpack drum.
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, this.seg(14, 8)), green);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0.02, -0.06, -0.16);
        drum.userData.gun = 'magazine';
        group.add(drum);
        const segs = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < segs; i++) {
          const t = i / (segs - 1);
          const link = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.03), dark);
          link.position.set(0.02, -0.05 + t * 0.06, -0.12 + t * 0.1);
          link.rotation.x = -t * 0.6;
          group.add(link);
          const round_ = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.024, this.seg(7, 5)), brass);
          round_.rotation.z = Math.PI / 2;
          round_.position.set(0.02, -0.05 + t * 0.06, -0.12 + t * 0.1);
          group.add(round_);
        }
        const spadePlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.024), dark);
        spadePlate.position.set(0, -0.02, -0.11);
        group.add(spadePlate);
        for (const s of [-1, 1]) {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, this.seg(9, 6)), dark);
          handle.position.set(s * 0.05, -0.06, -0.11);
          group.add(handle);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), bright);
        bar.position.set(0, -0.036, -0.13);
        bar.userData.gun = 'trigger';
        group.add(bar);
        this._gunShell(group, brass, -0.04, 0.0, 0.02, 0.006);
        return group;
      },

      // ---- 522: Adaptive Combat AI --------------------------------------------
      createAdaptiveCombatAIModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xD8DCE0, { roughness: 0.3, metalness: 0.5 });
        const dark = this._mat(0x1E2126, { roughness: 0.55, metalness: 0.78 });
        const eyeColor = this.getRandomColor(rand, [0x4FE3FF, 0x6AFF8A]);
        const eye = this._glow(eyeColor, 1.3);
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });

        // The gun is doing the aiming. The sensor head tracks on its own and
        // the barrel follows it a moment later.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.056, 0.22), shell);
        body.position.set(0, 0.014, 0.02);
        group.add(body);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.2), dark);
        spine.position.set(0, 0.048, 0.02);
        group.add(spine);
        // Sensor head on a gimbal, sweeping.
        const head = new THREE.Group();
        head.position.set(0, 0.076, 0.08);
        head.userData.sway = { axis: 'y', amp: 0.45, freq: 0.6 };
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(9, 6)), shell);
        skull.scale.z = 1.2;
        head.add(skull);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.004), eye);
        visor.position.z = 0.026;
        visor.userData.pulse = { min: 0.4, max: 1.5, freq: 1.8 };
        head.add(visor);
        for (const s of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.016), dark);
          ear.position.set(s * 0.026, 0, -0.004);
          head.add(ear);
        }
        group.add(head);
        const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(14, 8)), bright);
        yoke.position.set(0, 0.076, 0.08);
        yoke.rotation.y = Math.PI / 2;
        group.add(yoke);
        // Barrel on its own mount, lagging behind the head.
        const mount = new THREE.Group();
        mount.position.set(0, 0.024, 0.14);
        mount.userData.sway = { axis: 'y', amp: 0.38, freq: 0.6, phase: 0.6 };
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, this.seg(11, 7)), dark);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.08;
        mount.add(barrel);
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.03, this.seg(11, 7)), bright);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.z = 0.17;
        muzzle.userData.gun = 'muzzle';
        mount.add(muzzle);
        group.add(mount);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.06), dark);
        rack.position.set(0, -0.024, -0.05);
        group.add(rack);
        const leds = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < leds; i++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), eye);
          led.position.set(0.02, -0.014 - i * 0.008, -0.05);
          led.userData.pulse = { min: 0.0, max: 1.4, freq: 3.0, phase: i * 0.9 };
          group.add(led);
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.034), dark);
        mag.position.set(0, -0.06, 0.03);
        mag.userData.gun = 'magazine';
        group.add(mag);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), shell);
        grip.position.set(0, -0.052, -0.08);
        grip.rotation.x = 0.2;
        group.add(grip);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.04, 0.03), shell);
        brace.position.set(0, 0.006, -0.12);
        group.add(brace);
        this._gunTrigger(group, bright, 0, -0.022, -0.052, {});
        return group;
      },

      // ---- 523: Thought Projector ---------------------------------------------
      createThoughtProjectorModel(weapon, rand) {
        const group = new THREE.Group();
        const brassy = this._mat(0xC9A227, { roughness: 0.3, metalness: 0.9 });
        const velvet = this._mat(0x3A1F3A, { roughness: 0.95, metalness: 0.02 });
        const thoughtColor = this.getRandomColor(rand, [0xC77DFF, 0x7DFFD3]);
        const thought = this._glow(thoughtColor, 1.2);
        const glassMat = this._mat(0xD8E8F0, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.4 });

        // A magic lantern for the inside of somebody's head: a lamp, a slide
        // carrier and a lens, all in brass.
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.034, this.seg(12, 7), this.seg(9, 6)), brassy);
        lamp.position.set(0, 0.02, -0.06);
        group.add(lamp);
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, this.seg(11, 7)), brassy);
        chimney.position.set(0, 0.058, -0.06);
        group.add(chimney);
        const flameMesh = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(9, 6), this.seg(7, 5)), thought);
        flameMesh.position.set(0, 0.02, -0.06);
        flameMesh.userData.pulse = { min: 0.5, max: 1.5, freq: 1.3 };
        group.add(flameMesh);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.12), brassy);
        body.position.set(0, 0.02, 0.03);
        group.add(body);
        // Slide carrier: plates that shuffle through, each a different thought.
        const slides = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < slides; i++) {
          const slide = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.003), glassMat);
          slide.position.set(0, 0.02, 0.0 + i * 0.008);
          slide.userData.bob = { axis: 'x', amp: 0.01, freq: 0.5, phase: i * 1.5 };
          group.add(slide);
          const image = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.001), thought);
          image.position.set(0, 0.02, 0.001 + i * 0.008);
          image.userData.pulse = { min: 0.1, max: 1.1, freq: 0.8, phase: i * 1.5 };
          group.add(image);
        }
        const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.05), brassy);
        carrier.position.set(0, 0.046, 0.01);
        group.add(carrier);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.12, this.seg(12, 7)), brassy);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0.15);
        group.add(tube);
        for (let i = 0; i < 3; i++) {
          const knurl = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, this.seg(4, 3), this.seg(14, 8)), brassy);
          knurl.position.set(0, 0.02, 0.12 + i * 0.03);
          group.add(knurl);
        }
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, this.seg(14, 8)), glassMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.02, 0.214);
        lens.userData.gun = 'muzzle';
        group.add(lens);
        const beamCone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, this.seg(11, 7), 1, true), thought);
        beamCone.rotation.x = -Math.PI / 2;
        beamCone.position.set(0, 0.02, 0.25);
        beamCone.userData.pulse = { min: 0.1, max: 0.7, freq: 1.0 };
        group.add(beamCone);
        const focusKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.014, this.seg(10, 6)), brassy);
        focusKnob.rotation.z = Math.PI / 2;
        focusKnob.position.set(0.03, 0.02, 0.12);
        focusKnob.userData.spin = { axis: 'x', speed: 0.35 };
        group.add(focusKnob);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.08, this.seg(10, 6)), velvet);
        grip.position.set(0, -0.05, -0.02);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, brassy, 0, -0.016, 0.008, { guardR: 0.018 });
        return group;
      },

      // ---- 524: EHI Memetic Rifle ---------------------------------------------
      createMemeticRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.42, metalness: 0.28 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const dark = this._mat(0x1A1C20, { roughness: 0.6, metalness: 0.6 });
        const idea = this._glow(0x4FE3FF, 1.2);

        // It fires an idea. The projector is a stack of glyph plates and the
        // magazine is a cartridge of them, sold separately.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.06, 0.26), corporate);
        shell.position.set(0, 0.014, 0.04);
        group.add(shell);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.008, 0.24), accent);
        stripe.position.set(0, 0.036, 0.04);
        group.add(stripe);
        // Glyph plates spinning in the projector head.
        const plates = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < plates; i++) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.024 - i * 0.002, 0.024 - i * 0.002, 0.005, this.seg(12, 7)), corporate);
          plate.rotation.x = Math.PI / 2;
          plate.position.set(0, 0.026, 0.19 + i * 0.02);
          plate.userData.spin = { axis: 'z', speed: (i % 2 ? 1 : -1) * (0.5 + i * 0.3) };
          group.add(plate);
          const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.006), idea);
          glyph.position.set(0, 0.026, 0.19 + i * 0.02);
          glyph.userData.spin = { axis: 'z', speed: (i % 2 ? 1 : -1) * (0.5 + i * 0.3) };
          glyph.userData.pulse = { min: 0.2, max: 1.3, freq: 1.8, phase: i };
          group.add(glyph);
        }
        const aperture = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.03, this.seg(12, 7)), dark);
        aperture.rotation.x = Math.PI / 2;
        aperture.position.set(0, 0.026, 0.29);
        aperture.userData.gun = 'muzzle';
        group.add(aperture);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.002), idea);
        screen.position.set(0, 0.05, 0.06);
        screen.userData.pulse = { min: 0.3, max: 1.1, freq: 1.2 };
        group.add(screen);
        const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.05), accent);
        cartridge.position.set(0, -0.05, 0.02);
        cartridge.userData.gun = 'magazine';
        group.add(cartridge);
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.006, 0.052), corporate);
        seal.position.set(0, -0.02, 0.02);
        group.add(seal);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.004), idea);
        counter.position.set(0.016, -0.05, 0.046);
        counter.userData.pulse = { min: 0.2, max: 1.0, freq: 0.9 };
        group.add(counter);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.056, 0.11), corporate);
        stock.position.set(0, 0.008, -0.13);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.062, 0.012), dark);
        pad.position.set(0, 0.004, -0.19);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.05, -0.07);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, accent, 0, -0.02, -0.044, {});
        return group;
      },

      // ---- 525: Vector gun ----------------------------------------------------
      // A Desert Eagle: the slab-sided triangular slide with its ribbed top,
      // the hexagonal barrel with the gas cylinder slung under it, the wide
      // squared trigger guard and the fat single-stack grip. Dressed in the
      // gun's black and gold, with the arrowhead crown at the muzzle.
      createVectorGunModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x121417, { roughness: 0.42, metalness: 0.86 });
        const polymer = this._mat(0x0C0D10, { roughness: 0.84, metalness: 0.06 });
        // Every gold fitting on the gun is the element's own colour: the piece
        // is rebuilt around what it strikes with, so a frozen gun is fitted in
        // ice and a physical one keeps the gold it was made in (elementColor
        // answers null for Physical).
        const accentHex = (window.VectorGun && window.VectorGun.elementColor()) || 0xC9A227;
        const gold = this._mat(accentHex, { roughness: 0.24, metalness: 0.98 });
        const brass = this._cast(accentHex);

        // Frame: deep and long, the Eagle carries its weight low and forward.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.044, 0.16), polymer);
        frame.position.set(0, -0.012, 0.02);
        group.add(frame);
        const dust = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.09), black);
        dust.position.set(0, 0.006, 0.062);
        group.add(dust);

        // Slide: tall, flat sided, with the sloped nose that makes the
        // Eagle read as a wedge from any angle.
        const slide = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.2), black);
        slide.position.set(0, 0.038, 0.03);
        slide.userData.gun = 'slide';
        group.add(slide);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.05, 0.05), black);
        nose.position.set(0, -0.008, 0.122);
        nose.rotation.x = -0.16;
        slide.add(nose);
        // The ribbed top strap, cut across its whole length.
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.19), black);
        rib.position.set(0, 0.028, -0.004);
        slide.add(rib);
        for (let i = 0; i < 16; i++) {
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.003, 0.004), polymer);
          cut.position.set(0, 0.031, -0.086 + i * 0.011);
          slide.add(cut);
        }
        // Rear cocking serrations, the only ones the Eagle wears.
        for (let i = 0; i < 8; i++) {
          const serr = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.036, 0.003), gold);
          serr.position.set(0, -0.002, -0.088 + i * 0.008);
          slide.add(serr);
        }
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.022, 0.05), gold);
        port.position.set(0.018, 0.008, 0.03);
        slide.add(port);
        const rear = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.01, 0.008), gold);
        rear.position.set(0, 0.034, -0.09);
        slide.add(rear);
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.011, 0.006), gold);
        front.position.set(0, 0.008, 0.14);
        slide.add(front);
        const safety = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.022), gold);
        safety.position.set(-0.02, 0.006, -0.076);
        slide.add(safety);

        // Hexagonal barrel standing proud of the slide, and the gas cylinder
        // running back under it to the frame.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.052, 6), gold);
        barrel.rotation.x = Math.PI / 2;
        barrel.rotation.y = Math.PI / 12;
        barrel.position.set(0, 0.03, 0.152);
        group.add(barrel);
        const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, this.seg(8, 6)), black);
        gas.rotation.x = Math.PI / 2;
        gas.position.set(0, 0.006, 0.1);
        group.add(gas);
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.02), gold);
        block.position.set(0, 0.008, 0.152);
        group.add(block);

        // The muzzle takes the colour the gun is set to strike with, so the
        // element the player picked is visible in the hand as well as in the hit.
        const nozzleMat = this._glow(accentHex, 1.1);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 6), nozzleMat);
        crown.rotation.x = Math.PI / 2;
        crown.rotation.y = Math.PI / 12;
        crown.position.set(0, 0.03, 0.182);
        crown.userData.gun = 'muzzle';
        group.add(crown);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 4), nozzleMat);
        arrow.rotation.x = Math.PI / 2;
        arrow.rotation.z = Math.PI / 4;
        arrow.position.set(0, 0.03, 0.202);
        group.add(arrow);

        // Grip: near vertical, thick, with the panels the Eagle carries.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.115, 0.048), polymer);
        grip.position.set(0, -0.086, -0.036);
        grip.rotation.x = Math.PI / 14;
        group.add(grip);
        for (const s of [-1, 1]) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.09, 0.038), black);
          panel.position.set(s * 0.018, -0.084, -0.036);
          panel.rotation.x = Math.PI / 14;
          group.add(panel);
          const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.003, this.seg(10, 6)), gold);
          medallion.rotation.z = Math.PI / 2;
          medallion.position.set(s * 0.021, -0.072, -0.03);
          group.add(medallion);
        }
        const backstrap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.01), black);
        backstrap.position.set(0, -0.086, -0.062);
        backstrap.rotation.x = Math.PI / 14;
        group.add(backstrap);
        const beaver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.03), polymer);
        beaver.position.set(0, -0.024, -0.07);
        group.add(beaver);
        const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.01), gold);
        hammer.position.set(0, -0.002, -0.086);
        hammer.rotation.x = -0.3;
        hammer.userData.gun = 'hammer';
        group.add(hammer);

        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.038), black);
        mag.position.set(0, -0.086, -0.034);
        mag.rotation.x = Math.PI / 14;
        mag.userData.gun = 'magazine';
        group.add(mag);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.009, 0.05), gold);
        base.position.set(0, -0.146, -0.05);
        group.add(base);
        const release = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, this.seg(7, 5)), gold);
        release.rotation.z = Math.PI / 2;
        release.position.set(0.02, -0.036, -0.014);
        group.add(release);
        const slideStop = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.01, 0.03), gold);
        slideStop.position.set(-0.02, -0.008, 0.004);
        group.add(slideStop);
        this._gunTrigger(group, gold, 0, -0.036, -0.008, { curl: 0.15, long: true, guardR: 0.023 });
        this._gunShell(group, brass, 0.03, 0.046, 0.05, 0.006);
        this._vectorGunFittings(group, { black, polymer, accent: gold, glow: nozzleMat },
          this.VECTOR_FIT_LAYOUTS.gun);
        return group;
      },

      // ---- 525b: the Blade of Thelema ------------------------------------------
      // The vector gun reconstructed at full length: a two handed greatsword,
      // the black frame drawn out into a broad blade and every rune cut into it
      // lit a colour of its own. The fittings still follow the element the gun
      // is set to strike with (Weapon/VectorGunSystem.js), so a fire blade
      // burns; the sigils down the fuller keep their own arcane colours whatever
      // that element is, which is what makes it read as a ritual sword rather
      // than as a long knife.
      createVectorBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x121417, { roughness: 0.42, metalness: 0.86 });
        const polymer = this._mat(0x0C0D10, { roughness: 0.84, metalness: 0.06 });
        const steel = this._mat(0x9AA3AD, { roughness: 0.28, metalness: 0.95 });
        const elementColor = (window.VectorGun && window.VectorGun.elementColor()) || 0xC9A227;
        const gold = this._mat(elementColor, { roughness: 0.24, metalness: 0.98 });
        const sigil = this._glow(elementColor, 1.2);
        // The colours the marks are cut in: seven, walked in order down the
        // blade, so no two neighbouring glyphs burn the same.
        const RUNE_COLORS = [0xE23BFF, 0x2ED8FF, 0x7CFF3B, 0xFFC93B, 0xFF3B6E, 0x9B6BFF, 0x3BFFC1];
        const runeMats = RUNE_COLORS.map((c) => this._glow(c, 1.35));

        // The hilt stands in line with the blade and the guard crosses it: hilt,
        // guard and blade together are the cross the weapon is named for, and
        // the hand grips the upright of it.
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.017, 0.02, 0.17, this.seg(10, 6)), polymer);
        grip.rotation.x = Math.PI / 2;
        grip.position.set(0, 0, -0.12);
        group.add(grip);
        const wraps = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < wraps; i++) {
          const wrap = new THREE.Mesh(
            new THREE.TorusGeometry(0.019, 0.0028, this.seg(5, 3), this.seg(12, 7)), black);
          wrap.rotation.y = Math.PI / 2;
          wrap.position.set(0, 0, -0.195 + i * (0.14 / wraps));
          group.add(wrap);
        }
        const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), gold);
        pommel.position.set(0, 0, -0.216);
        group.add(pommel);
        const pommelEye = new THREE.Mesh(
          new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)), runeMats[0]);
        pommelEye.position.set(0, 0, -0.216);
        pommelEye.userData.pulse = { min: 0.35, max: 1.4, freq: 0.7 };
        group.add(pommelEye);

        // The crossguard: wide, straight, square across the hilt, with a ring at
        // the middle and a horn turned forward at either end.
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.026, 0.022), gold);
        guard.position.set(0, 0, -0.024);
        group.add(guard);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.028, 0.005, this.seg(6, 4), this.seg(16, 9)), gold);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, 0, -0.024);
        group.add(ring);
        const ringGlow = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0035, this.seg(5, 3), this.seg(14, 8)), sigil);
        ringGlow.rotation.x = Math.PI / 2;
        ringGlow.position.set(0, 0, -0.024);
        ringGlow.userData.pulse = { min: 0.2, max: 1.3, freq: 1.1 };
        group.add(ringGlow);
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 4), gold);
          horn.rotation.x = Math.PI / 2;
          horn.position.set(side * 0.105, 0, -0.004);
          horn.rotation.z = side * 0.35;
          group.add(horn);
        }

        // The blade itself: long, broad, tapering, with a bevelled edge either
        // side and a fuller cut down the middle for the marks to sit in.
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.016, 0.52), steel);
        blade.position.set(0, 0, 0.29);
        group.add(blade);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.021, 0.5), black);
        spine.position.set(0, 0, 0.29);
        group.add(spine);
        for (const side of [-1, 1]) {
          const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.005, 0.52), gold);
          bevel.position.set(side * 0.048, 0, 0.29);
          group.add(bevel);
        }
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.46), sigil);
        fuller.position.set(0, 0.009, 0.28);
        fuller.userData.pulse = { min: 0.25, max: 1.2, freq: 0.9 };
        group.add(fuller);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.13, 4), steel);
        tip.rotation.x = Math.PI / 2;
        tip.rotation.z = Math.PI / 4;
        tip.position.set(0, 0, 0.6);
        tip.userData.gun = 'muzzle';
        group.add(tip);
        const tipEdge = new THREE.Mesh(new THREE.ConeGeometry(0.044, 0.11, 4), gold);
        tipEdge.rotation.x = Math.PI / 2;
        tipEdge.rotation.z = Math.PI / 4;
        tipEdge.position.set(0, 0, 0.606);
        group.add(tipEdge);

        // The arcane symbols: a column of glyphs cut into the fuller and burning
        // through it, each one a bar, a crossbar and a ring in its own colour.
        const glyphs = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < glyphs; i++) {
          const mat = runeMats[i % runeMats.length];
          const z = 0.09 + i * (0.44 / glyphs);
          const phase = i * 0.7;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.026), mat);
          bar.position.set(0, 0.002, z);
          bar.userData.pulse = { min: 0.2, max: 1.4, freq: 1.2, phase: phase };
          group.add(bar);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.019, 0.004), mat);
          cross.position.set(0, 0.002, z + (i % 2 ? 0.008 : -0.008));
          cross.rotation.y = (i % 3) * 0.4;
          cross.userData.pulse = { min: 0.2, max: 1.4, freq: 1.2, phase: phase };
          group.add(cross);
          if (!this.isLowDetail()) {
            const halo = new THREE.Mesh(
              new THREE.TorusGeometry(0.013, 0.0022, this.seg(5, 3), this.seg(12, 7)), mat);
            halo.rotation.x = Math.PI / 2;
            halo.position.set(0, 0.003, z);
            halo.userData.pulse = { min: 0.1, max: 1.5, freq: 0.9, phase: phase + 0.4 };
            group.add(halo);
          }
        }

        // A band of the same marks around the ricasso, where the frame closed.
        for (const side of [-1, 1]) {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.024, 0.07), gold);
          plate.position.set(side * 0.03, 0, 0.06);
          group.add(plate);
        }
        this._vectorGunFittings(group, { black, polymer, accent: gold, glow: sigil },
          this.VECTOR_FIT_LAYOUTS.blade);
        return group;
      },

      // ---- 525f: the other ten shapes -----------------------------------------
      // Every shape the frame folds into is built by hand, so no two read alike:
      // the athame is not the lance with a shorter blade. All of them are cut
      // from the one palette (_vectorGunPalette) and lit with the arcane colours
      // below, and every one ends by bolting on the fittings of the modes that
      // are running, so whatever the gun has become is still the same weapon.
      //
      // The element the gun strikes with is worn on the TRIM only: the gold
      // fittings, the edges and the glow. The body of every shape stays black
      // frame and bare steel, so a frozen weapon is a black weapon with a cold
      // edge and never a blue toy.

      // The colours a mark can burn: walked in order, never twice in a row.
      VECTOR_RUNE_COLORS: [0xE23BFF, 0x2ED8FF, 0x7CFF3B, 0xFFC93B, 0xFF3B6E, 0x9B6BFF, 0x3BFFC1],

      _vectorRuneMats() {
        return this.VECTOR_RUNE_COLORS.map((c) => this._glow(c, 1.35));
      },

      /**
       * The hilt every held shape grows out of: the pistol's grip, wrapped, with
       * the frame's pommel under it. One place, so the hand is the same hand on
       * all of them.
       */
      _vectorHilt(group, mats, opts) {
        const o = opts || {};
        const len = o.len || 0.12;
        // The hilt runs BEHIND the head, in line with it: a weapon whose handle
        // stands off to one side reads as broken, not as folded.
        const z = o.z === undefined ? -0.09 : o.z;
        const grip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.018, len, this.seg(10, 6)), mats.polymer);
        grip.rotation.x = Math.PI / 2;
        grip.position.set(0, 0, z);
        group.add(grip);
        const wraps = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < wraps; i++) {
          const wrap = new THREE.Mesh(
            new THREE.TorusGeometry(0.0175, 0.0026, this.seg(5, 3), this.seg(12, 7)), mats.black);
          wrap.rotation.y = Math.PI / 2;
          wrap.position.set(0, 0, z - len / 2 + (i + 0.6) * (len / (wraps + 1)));
          group.add(wrap);
        }
        const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), mats.accent);
        pommel.position.set(0, 0, z - len / 2 - 0.012);
        group.add(pommel);
        return group;
      },

      // Athame of Abrasax: the ritual knife. A short black obsidian blade over a
      // hexagram guard, with the god's name burning ring by ring above the hand.
      createVectorAthameModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();
        this._vectorHilt(group, mats, { len: 0.1, z: -0.075 });

        const guard = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.005, this.seg(6, 4), 6), mats.accent);
        guard.position.set(0, -0.02, 0.004);
        group.add(guard);
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.03), mats.black);
        collar.position.set(0, -0.012, 0.01);
        group.add(collar);

        // The blade: a leaf of black glass, keen on both sides, with the edge
        // itself lit by the element.
        const blade = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), mats.black);
        blade.scale.set(0.5, 0.28, 2.5);
        blade.position.set(0, 0.004, 0.14);
        blade.userData.gun = 'muzzle';
        group.add(blade);
        const edge = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), mats.glow);
        edge.scale.set(0.16, 0.1, 2.55);
        edge.position.set(0, 0.004, 0.14);
        edge.userData.pulse = { min: 0.2, max: 1.1, freq: 0.8 };
        group.add(edge);

        // Three rings of the name, turning above the hand: a knife that is only
        // ever used for one thing looks like it.
        const rings = this.isLowDetail() ? 1 : 3;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.022 - i * 0.004, 0.0022, this.seg(5, 3), this.seg(14, 8)),
            runes[i % runes.length]);
          ring.rotation.x = Math.PI / 2 + i * 0.5;
          ring.position.set(0, 0.004, 0.06 + i * 0.03);
          ring.userData.pulse = { min: 0.2, max: 1.4, freq: 1.1, phase: i };
          group.add(ring);
        }
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.athame);
        return group;
      },

      // Maul of Choronzon: the demon of dispersion, so the head is not one block
      // but a cage of them held together by nothing that can be seen.
      createVectorMaulModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();
        this._vectorHilt(group, mats, { len: 0.18, z: -0.12 });

        const haft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.013, 0.34, this.seg(8, 5)), mats.black);
        haft.rotation.x = Math.PI / 2;
        haft.position.set(0, 0, 0.15);
        group.add(haft);

        // The head: a core the haft ends in and four slabs hung off it, each one
        // floating a little clear of the rest.
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), mats.black);
        core.position.set(0, 0, 0.32);
        core.userData.gun = 'muzzle';
        group.add(core);
        const slabs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < slabs; i++) {
          const a = (i / slabs) * Math.PI * 2;
          const slab = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), mats.steel);
          slab.position.set(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.32);
          slab.rotation.z = a;
          group.add(slab);
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.094),
            runes[i % runes.length]);
          seam.position.set(Math.cos(a) * 0.052, Math.sin(a) * 0.052, 0.32);
          seam.userData.pulse = { min: 0.15, max: 1.5, freq: 1.3, phase: i };
          group.add(seam);
        }
        const cage = new THREE.Mesh(
          new THREE.TorusGeometry(0.055, 0.004, this.seg(6, 4), this.seg(16, 9)), mats.accent);
        cage.rotation.y = Math.PI / 2;
        cage.rotation.z = Math.PI / 2;
        cage.position.set(0, 0, 0.32);
        group.add(cage);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.maul);
        return group;
      },

      // Axe of Babalon: a great crescent on a short haft, the cup of the scarlet
      // woman set where the two bits meet.
      createVectorAxeModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const scarlet = this._glow(0xFF2A4A, 1.3);
        this._vectorHilt(group, mats, { len: 0.14, z: -0.1 });

        const haft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.013, 0.26, this.seg(8, 5)), mats.black);
        haft.rotation.x = Math.PI / 2;
        haft.position.set(0, 0, 0.11);
        group.add(haft);

        // Two crescents back to back, both cut from the same disc.
        for (const side of [-1, 1]) {
          const bit = new THREE.Mesh(
            new THREE.TorusGeometry(0.06, 0.016, this.seg(6, 4), this.seg(18, 10), Math.PI * 0.62),
            mats.steel);
          bit.rotation.y = Math.PI / 2;
          bit.rotation.z = side > 0 ? -Math.PI * 0.31 : Math.PI - Math.PI * 0.31;
          bit.scale.set(1, 1, 0.34);
          bit.position.set(side * 0.03, 0, 0.22);
          group.add(bit);
          const keen = new THREE.Mesh(
            new THREE.TorusGeometry(0.066, 0.004, this.seg(5, 3), this.seg(18, 10), Math.PI * 0.62),
            scarlet);
          keen.rotation.copy(bit.rotation);
          keen.scale.set(1, 1, 0.3);
          keen.position.copy(bit.position);
          keen.userData.pulse = { min: 0.3, max: 1.3, freq: 0.9, phase: side };
          group.add(keen);
        }
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.017, 0.009, 0.026, this.seg(10, 6)), mats.accent);
        cup.position.set(0, 0.03, 0.22);
        group.add(cup);
        const wine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(10, 6)), scarlet);
        wine.position.set(0, 0.04, 0.22);
        wine.userData.pulse = { min: 0.4, max: 1.4, freq: 0.6 };
        group.add(wine);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 6), mats.steel);
        spike.rotation.x = Math.PI / 2;
        spike.position.set(0, 0, 0.29);
        spike.userData.gun = 'muzzle';
        group.add(spike);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.axe);
        return group;
      },

      // Scourge of Nuit: not a whip but a night sky on a handle. Three lashes of
      // linked stars, each one a different colour, hanging off a crowned haft.
      createVectorScourgeModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();
        this._vectorHilt(group, mats, { len: 0.13, z: -0.095 });

        const crown = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.018, 0.05, this.seg(10, 6)), mats.black);
        crown.rotation.x = Math.PI / 2;
        crown.position.set(0, 0, 0.03);
        group.add(crown);
        const vault = new THREE.Mesh(
          new THREE.TorusGeometry(0.026, 0.004, this.seg(5, 3), this.seg(16, 9)), mats.glow);
        vault.rotation.y = Math.PI / 2;
        vault.position.set(0, 0, 0.03);
        vault.userData.pulse = { min: 0.25, max: 1.2, freq: 1.0 };
        group.add(vault);

        // The lashes: beads down a line, thinning as they go, so the thing hangs
        // like a chain even standing still.
        const lashes = this.isLowDetail() ? 2 : 3;
        const beads = this.isLowDetail() ? 5 : 8;
        for (let l = 0; l < lashes; l++) {
          const spread = (l - (lashes - 1) / 2) * 0.026;
          const mat = runes[l % runes.length];
          for (let i = 0; i < beads; i++) {
            const t = i / beads;
            const bead = new THREE.Mesh(
              new THREE.OctahedronGeometry(0.011 - t * 0.005, 0), i % 2 ? mat : mats.steel);
            bead.position.set(spread * (1 + t), -t * t * 0.05, 0.06 + t * 0.24);
            bead.rotation.set(i * 0.7, i * 0.5, i * 0.9);
            if (i % 2) bead.userData.pulse = { min: 0.2, max: 1.5, freq: 1.4, phase: i };
            group.add(bead);
          }
          const barb = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), mat);
          barb.rotation.x = Math.PI / 2;
          barb.position.set(spread * 2, -0.05, 0.31);
          if (l === 0) barb.userData.gun = 'muzzle';
          group.add(barb);
        }
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.scourge);
        return group;
      },

      // Staff of Hadit: the winged globe. A shaft of black frame ending in a
      // sphere that hangs free between two spread wings.
      createVectorStaffModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();
        this._vectorHilt(group, mats, { len: 0.16, z: -0.12 });

        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.012, 0.42, this.seg(8, 5)), mats.black);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0, 0.16);
        group.add(shaft);
        const collars = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < collars; i++) {
          const collar = new THREE.Mesh(
            new THREE.TorusGeometry(0.013, 0.0035, this.seg(5, 3), this.seg(12, 7)), mats.accent);
          collar.rotation.y = Math.PI / 2;
          collar.position.set(0, 0, 0.02 + i * 0.07);
          group.add(collar);
        }

        // The globe, held by nothing, turning between the wings.
        const globe = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, this.seg(14, 8), this.seg(12, 6)), mats.glow);
        globe.position.set(0, 0.02, 0.4);
        globe.userData.pulse = { min: 0.4, max: 1.4, freq: 0.7 };
        globe.userData.gun = 'muzzle';
        group.add(globe);
        const orbit = new THREE.Mesh(
          new THREE.TorusGeometry(0.044, 0.003, this.seg(5, 3), this.seg(18, 10)), runes[1]);
        orbit.position.set(0, 0.02, 0.4);
        orbit.rotation.x = 0.5;
        group.add(orbit);
        for (const side of [-1, 1]) {
          const feathers = this.isLowDetail() ? 2 : 4;
          for (let i = 0; i < feathers; i++) {
            const feather = new THREE.Mesh(
              new THREE.BoxGeometry(0.05 - i * 0.008, 0.005, 0.012), mats.steel);
            feather.position.set(side * (0.05 + i * 0.016), 0.024 + i * 0.012, 0.39 - i * 0.004);
            feather.rotation.z = side * (0.35 + i * 0.18);
            group.add(feather);
          }
          const tipMark = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.026, 4), runes[3]);
          tipMark.rotation.z = side * Math.PI / 2.2;
          tipMark.position.set(side * 0.115, 0.07, 0.386);
          tipMark.userData.pulse = { min: 0.2, max: 1.3, freq: 1.2, phase: side };
          group.add(tipMark);
        }
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.staff);
        return group;
      },

      // Bow of Aiwass: no stave and no string in the usual sense. Two blades of
      // the frame swept apart, and between them a drawn line of the element.
      createVectorBowModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();

        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.036), mats.black);
        group.add(riser);
        const gripWrap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 0.07, this.seg(10, 6)), mats.polymer);
        gripWrap.position.set(0, -0.01, -0.014);
        group.add(gripWrap);
        const sightWindow = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.004, this.seg(5, 3), this.seg(14, 8)), mats.accent);
        sightWindow.rotation.y = Math.PI / 2;
        sightWindow.position.set(0, 0.05, 0.006);
        group.add(sightWindow);

        // The limbs: three panels each, swept forward, the outermost the
        // thinnest, so the bow reads as a machine that opened rather than as
        // wood that was bent.
        for (const side of [-1, 1]) {
          const panels = this.isLowDetail() ? 2 : 3;
          for (let i = 0; i < panels; i++) {
            const limb = new THREE.Mesh(
              new THREE.BoxGeometry(0.016 - i * 0.003, 0.11 - i * 0.02, 0.014), mats.steel);
            limb.position.set(0, side * (0.09 + i * 0.09), 0.012 + i * 0.03);
            limb.rotation.x = side * (0.22 + i * 0.16);
            group.add(limb);
            const vein = new THREE.Mesh(
              new THREE.BoxGeometry(0.005, 0.1 - i * 0.02, 0.004),
              runes[(i + (side > 0 ? 0 : 3)) % runes.length]);
            vein.position.copy(limb.position);
            vein.rotation.copy(limb.rotation);
            vein.position.z += 0.009;
            vein.userData.pulse = { min: 0.2, max: 1.4, freq: 1.1, phase: i + side };
            group.add(vein);
          }
          const nock = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 4), mats.black);
          nock.position.set(0, side * 0.29, 0.085);
          nock.rotation.x = side * Math.PI / 2;
          group.add(nock);
        }

        // The string is a line of the element, drawn between the nocks.
        const string = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, 0.58, this.seg(6, 4)), mats.glow);
        string.position.set(0, 0, 0.085);
        string.userData.pulse = { min: 0.35, max: 1.2, freq: 1.6 };
        group.add(string);
        const nockPoint = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0), runes[0]);
        nockPoint.position.set(0, 0, 0.085);
        nockPoint.userData.pulse = { min: 0.3, max: 1.5, freq: 1.3 };
        nockPoint.userData.gun = 'muzzle';
        group.add(nockPoint);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.bow);
        return group;
      },

      // Darts of Zos: a hand of sigil darts held in a folding rack, the one at
      // the front already turned forward to throw.
      createVectorDartsModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();

        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.05), mats.black);
        rack.position.set(0, -0.02, 0.01);
        group.add(rack);
        const brace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.08, this.seg(10, 6)), mats.polymer);
        brace.rotation.z = Math.PI / 2;
        brace.position.set(0, -0.045, 0.004);
        group.add(brace);

        // Five darts fanned across the rack, longest in the middle.
        const darts = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < darts; i++) {
          const t = i - (darts - 1) / 2;
          const len = 0.13 - Math.abs(t) * 0.018;
          const mat = runes[i % runes.length];
          const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0035, 0.005, len, this.seg(7, 4)), mats.steel);
          shaft.rotation.x = Math.PI / 2;
          shaft.rotation.z = t * 0.12;
          shaft.position.set(t * 0.022, 0.004, 0.05 + len / 2 - 0.02);
          group.add(shaft);
          const head = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, 4), mats.black);
          head.rotation.x = Math.PI / 2;
          head.position.set(t * 0.03, 0.004, 0.05 + len);
          if (i === Math.floor(darts / 2)) head.userData.gun = 'muzzle';
          group.add(head);
          const mark = new THREE.Mesh(
            new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(10, 6)), mat);
          mark.rotation.y = Math.PI / 2;
          mark.position.set(t * 0.024, 0.004, 0.06);
          mark.userData.pulse = { min: 0.2, max: 1.5, freq: 1.4, phase: i };
          group.add(mark);
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.018, 0.018), mat);
          fin.position.set(t * 0.021, 0.012, 0.03);
          fin.userData.pulse = { min: 0.2, max: 1.2, freq: 1.0, phase: i * 0.5 };
          group.add(fin);
        }
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.darts);
        return group;
      },

      // Talons of Baphomet: three long claws off a knuckle bar, and the goat's
      // horns curling back over the hand.
      createVectorTalonsModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();

        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), mats.black);
        group.add(bar);
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.007, this.seg(6, 4), this.seg(14, 8)), mats.polymer);
        strap.rotation.y = Math.PI / 2;
        strap.position.set(0, -0.006, -0.03);
        group.add(strap);

        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 0.034;
          const len = 0.16 - Math.abs(i - 1) * 0.03;
          const claw = new THREE.Mesh(
            new THREE.ConeGeometry(0.012, len, this.seg(8, 4)), mats.steel);
          claw.rotation.x = Math.PI / 2 - 0.18;
          claw.position.set(x, 0.02 + Math.abs(i - 1) * 0.004, 0.03 + len / 2);
          if (i === 1) claw.userData.gun = 'muzzle';
          group.add(claw);
          const inner = new THREE.Mesh(
            new THREE.ConeGeometry(0.005, len * 0.8, this.seg(6, 4)), runes[i % runes.length]);
          inner.rotation.copy(claw.rotation);
          inner.position.copy(claw.position);
          inner.userData.pulse = { min: 0.2, max: 1.5, freq: 1.2, phase: i };
          group.add(inner);
        }
        // The horns, curling back over the wrist.
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(
            new THREE.TorusGeometry(0.03, 0.006, this.seg(6, 4), this.seg(14, 8), Math.PI * 0.9),
            mats.accent);
          horn.rotation.set(Math.PI / 2, side * 0.5, side * 1.2);
          horn.position.set(side * 0.05, 0.02, -0.03);
          group.add(horn);
        }
        const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), mats.glow);
        eye.position.set(0, 0.02, -0.012);
        eye.userData.pulse = { min: 0.3, max: 1.4, freq: 0.8 };
        group.add(eye);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.talons);
        return group;
      },

      // Gauntlet of Kia: the empty fist made into a machine. A plated glove with
      // a piston over the knuckles that drives the blow.
      createVectorGauntletModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();

        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.036, 0.03, 0.09, this.seg(12, 7)), mats.black);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.set(0, 0, -0.05);
        group.add(cuff);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.07), mats.steel);
        hand.position.set(0, 0, 0.02);
        group.add(hand);
        for (let i = 0; i < 4; i++) {
          const knuckle = new THREE.Mesh(
            new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)), mats.accent);
          knuckle.position.set(-0.026 + i * 0.017, 0.024, 0.05);
          group.add(knuckle);
        }
        // The piston: a ram over the back of the hand, its head standing proud
        // of the knuckles, which is where the blow is delivered from.
        const cylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 0.09, this.seg(10, 6)), mats.black);
        cylinder.rotation.x = Math.PI / 2;
        cylinder.position.set(0, 0.045, -0.01);
        group.add(cylinder);
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.07, this.seg(8, 5)), mats.steel);
        rod.rotation.x = Math.PI / 2;
        rod.position.set(0, 0.045, 0.06);
        group.add(rod);
        const ram = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.018, 0.02, this.seg(10, 6)), mats.steel);
        ram.rotation.x = Math.PI / 2;
        ram.position.set(0, 0.045, 0.1);
        ram.userData.gun = 'muzzle';
        group.add(ram);
        const charge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 0.012, this.seg(10, 6)), mats.glow);
        charge.rotation.x = Math.PI / 2;
        charge.position.set(0, 0.045, 0.108);
        charge.userData.pulse = { min: 0.2, max: 1.4, freq: 1.5 };
        group.add(charge);
        // The empty sigil on the back of the hand: Kia is the thing with no
        // name, so the mark is a ring around nothing.
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.003, this.seg(5, 3), this.seg(16, 9)), runes[5]);
        ring.position.set(0, 0.031, 0.02);
        ring.rotation.x = Math.PI / 2;
        ring.userData.pulse = { min: 0.25, max: 1.3, freq: 0.9 };
        group.add(ring);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.gauntlet);
        return group;
      },

      // Lance of Longinus: the spear that opened the side. A long shaft, a
      // cruciform head with a bleeding channel, and a ring turning behind it.
      createVectorLanceModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const blood = this._glow(0xFF2A3C, 1.25);
        this._vectorHilt(group, mats, { len: 0.16, z: -0.12 });

        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0095, 0.012, 0.56, this.seg(8, 5)), mats.black);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0, 0.24);
        group.add(shaft);
        const grips = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < grips; i++) {
          const collar = new THREE.Mesh(
            new THREE.TorusGeometry(0.014, 0.004, this.seg(5, 3), this.seg(12, 7)), mats.accent);
          collar.rotation.y = Math.PI / 2;
          collar.position.set(0, 0, 0.02 + i * 0.1);
          group.add(collar);
        }

        // The head: four flanges around a long spike, with the channel that
        // carries the wound down between them.
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const flange = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.038, 0.12), mats.steel);
          flange.position.set(Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0.56);
          flange.rotation.z = a;
          group.add(flange);
        }
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.024, 0.17, this.seg(8, 4)), mats.steel);
        spike.rotation.x = Math.PI / 2;
        spike.position.set(0, 0, 0.62);
        spike.userData.gun = 'muzzle';
        group.add(spike);
        const channel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0045, 0.0045, 0.22, this.seg(7, 4)), blood);
        channel.rotation.x = Math.PI / 2;
        channel.position.set(0, 0, 0.58);
        channel.userData.pulse = { min: 0.25, max: 1.4, freq: 0.8 };
        group.add(channel);
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.05, 0.004, this.seg(6, 4), this.seg(18, 10)), blood);
        halo.rotation.y = Math.PI / 2;
        halo.rotation.z = Math.PI / 2;
        halo.position.set(0, 0, 0.46);
        halo.userData.pulse = { min: 0.2, max: 1.2, freq: 0.6 };
        group.add(halo);
        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.lance);
        return group;
      },

      // ---- 525s: the coilgun --------------------------------------------------
      // With no other shape fitted, SWITCH racks the pistol out into this: the
      // frame telescopes, the barrel becomes a stack of induction coils on a
      // rail, and a folding stock and a long scope come up out of the housing.
      // It holds three shots and reaches four times as far
      // (Weapon/VectorGunSystem.js), and the third one spent folds it back.
      createVectorSniperModel(weapon, rand) {
        const group = new THREE.Group();
        const { black, polymer, accent, glow, color } = this._vectorGunPalette();

        // The pistol's own grip, kept: the weapon grows forward from the hand
        // rather than being a different object in it.
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.038), polymer);
        grip.position.set(0, -0.07, -0.03);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, accent, 0, -0.036, -0.006, { curl: 0.15, long: true, guardR: 0.024 });

        // The housing, and the rail the coils are strung along.
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.056, 0.16), black);
        housing.position.set(0, 0.006, 0.05);
        group.add(housing);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.42), black);
        rail.position.set(0, 0.022, 0.24);
        group.add(rail);

        // The coils: the barrel is a stack of them, and they light in sequence
        // down the rail, which is what a coilgun does to a round.
        const coils = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < coils; i++) {
          const z = 0.1 + i * (0.38 / coils);
          const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.022, 0.006, this.seg(6, 4), this.seg(14, 8)), accent);
          coil.rotation.y = Math.PI / 2;
          coil.position.set(0, 0.012, z);
          group.add(coil);
          const charge = new THREE.Mesh(
            new THREE.TorusGeometry(0.015, 0.0025, this.seg(4, 3), this.seg(12, 6)), glow);
          charge.rotation.y = Math.PI / 2;
          charge.position.set(0, 0.012, z);
          charge.userData.pulse = { min: 0.1, max: 1.4, freq: 1.6, phase: i * 0.6 };
          group.add(charge);
        }

        // The capacitor bank under the rail: three cells, one per shot.
        for (let i = 0; i < 3; i++) {
          const cell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.009, 0.009, 0.05, this.seg(10, 6)), glow);
          cell.rotation.z = Math.PI / 2;
          cell.position.set(0, -0.022, 0.06 + i * 0.06);
          cell.userData.pulse = { min: 0.3, max: 1.2, freq: 0.8, phase: i };
          group.add(cell);
          const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.008, 0.014), accent);
          clamp.position.set(0, -0.008, 0.06 + i * 0.06);
          group.add(clamp);
        }

        // The scope: the long one, which is the whole point of the shape.
        const scopeBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.22, this.seg(12, 7)), black);
        scopeBody.rotation.x = Math.PI / 2;
        scopeBody.position.set(0, 0.052, 0.14);
        group.add(scopeBody);
        for (const z of [0.06, 0.23]) {
          const ring = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.012), accent);
          ring.position.set(0, 0.04, z);
          group.add(ring);
        }
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.004, this.seg(12, 7)), glow);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.052, 0.252);
        lens.userData.pulse = { min: 0.4, max: 1.1, freq: 0.6 };
        group.add(lens);

        // The stock, folded down and back out of the housing.
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.12), black);
        arm.position.set(0, 0.006, -0.09);
        group.add(arm);
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.016), polymer);
        butt.position.set(0, -0.012, -0.15);
        butt.rotation.x = -0.12;
        group.add(butt);
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.014, 0.07), polymer);
        cheek.position.set(0, 0.03, -0.09);
        group.add(cheek);

        // The muzzle the shot leaves by, and the case it throws.
        const brake = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.014, 0.05, this.seg(12, 7)), accent);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.012, 0.47);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        const bore = new THREE.Mesh(
          new THREE.CylinderGeometry(0.007, 0.007, 0.012, this.seg(10, 6)), glow);
        bore.rotation.x = Math.PI / 2;
        bore.position.set(0, 0.012, 0.492);
        group.add(bore);
        this._gunShell(group, this._mat(color, { roughness: 0.3, metalness: 0.9 }),
          0.03, 0.02, 0.06, 0.007);

        this._vectorGunFittings(group, { black, polymer, accent, glow },
          this.VECTOR_FIT_LAYOUTS.sniper);
        return group;
      },

      // ---- 525c: the fittings the modes bolt on ------------------------------
      // The gun's screen is a workbench, not a settings page: the three modes
      // running on it (Weapon/VectorGunSystem.js) are hardware, and each one
      // hangs its own piece off the frame. The blade wears the same fittings
      // rebuilt along the spine, so folding the weapon never loses them. Which
      // modes are running is asked of window.VectorGun; nothing here re-derives
      // the list.
      _vectorGunFittings(group, mats, layout) {
        const VG = window.VectorGun;
        if (!VG || !VG.hasMode) return group;
        const { black, polymer, accent, glow } = mats;
        const on = (key) => VG.hasMode(key);
        // Where a fitting sits depends only on the shape it is bolted to:
        // forward of the hand on the pistol, out along the spine on the
        // machete, and off the bounding box on every shape the type builders
        // make (WeaponSystemProcedural.applyVectorFrame). The pieces themselves
        // are the same pieces wherever they land, which is what makes every
        // form read as one weapon.
        const place = layout || this.VECTOR_FIT_LAYOUTS.gun;
        const fwd = place.fwd;
        const up = place.up;

        // Mana bullets: a charged cell clamped over the frame, lit by the
        // element, with the feed running forward into the action.
        if (on('mana')) {
          const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, this.seg(10, 6)), glow);
          cell.rotation.z = Math.PI / 2;
          cell.position.set(0, up + 0.026, fwd - 0.05);
          cell.userData.pulse = { min: 0.3, max: 1.2, freq: 1.4 };
          group.add(cell);
          const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.016), accent);
          clamp.position.set(0, up + 0.012, fwd - 0.05);
          group.add(clamp);
          const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, this.seg(6, 4)), accent);
          feed.rotation.x = Math.PI / 2;
          feed.position.set(0.014, up + 0.02, fwd - 0.018);
          group.add(feed);
        }

        // Vector recoil: a squat thruster hung under the front, vented back so
        // the throw the mode gives has somewhere to come from.
        if (on('recoil')) {
          const thruster = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, this.seg(10, 6)), black);
          thruster.rotation.x = Math.PI / 2;
          thruster.position.set(0, up - 0.036, fwd + 0.02);
          group.add(thruster);
          const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.009, 0.022, this.seg(10, 6), 1, true), glow);
          cone.rotation.x = -Math.PI / 2;
          cone.position.set(0, up - 0.036, fwd - 0.014);
          cone.userData.pulse = { min: 0.2, max: 1.1, freq: 2.1 };
          group.add(cone);
        }

        // Spellblaster: a cast ring standing over the barrel, the spell held in
        // it turning as the piece turns.
        if (on('spellblaster')) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(6, 3), this.seg(16, 8)), glow);
          ring.position.set(0, up + 0.034, fwd + 0.055);
          ring.userData.pulse = { min: 0.25, max: 1.3, freq: 1.0 };
          group.add(ring);
          for (const s of [-1, 1]) {
            const strut = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.026, 0.006), accent);
            strut.position.set(s * 0.018, up + 0.018, fwd + 0.055);
            group.add(strut);
          }
        }

        // Card: the ward plate, a flat sigil disc folded out from the left side.
        if (on('card')) {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.036), polymer);
          plate.position.set(-0.026, up - 0.006, fwd - 0.03);
          plate.rotation.z = 0.22;
          group.add(plate);
          const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0025, this.seg(4, 3), this.seg(12, 6)), glow);
          sigil.rotation.y = Math.PI / 2;
          sigil.position.set(-0.03, up - 0.006, fwd - 0.03);
          sigil.userData.pulse = { min: 0.3, max: 1.0, freq: 0.7 };
          group.add(sigil);
        }

        // Wide shots: the splitter, a pair of prongs fanned off the muzzle end
        // exactly as the shot is fanned off the barrel.
        if (on('wide')) {
          for (const s of [-1, 1]) {
            const prong = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.006, 0.05), accent);
            prong.position.set(s * 0.016, up, fwd + 0.1);
            prong.rotation.y = -s * 0.3;
            group.add(prong);
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.016, 4), glow);
            tip.rotation.x = Math.PI / 2;
            tip.position.set(s * 0.024, up, fwd + 0.128);
            tip.userData.pulse = { min: 0.2, max: 1.2, freq: 1.6, phase: s };
            group.add(tip);
          }
        }
        return group;
      },

      // Where the fittings sit on the two shapes with a model written by hand.
      // Everything else is measured (applyVectorFrame).
      // Grimoire: the shape the frame is not supposed to have. Em's limit break
      // (window.LimitBreak, the Hyper) opens the gun into a book whatever it was
      // standing as a moment earlier: black boards, gold leaf and gold furniture,
      // and pages that turn on their own the whole time it is open. Nothing
      // fits this form and nothing switches into it; it closes with the fight.
      createVectorGrimoireModel(weapon, rand) {
        const group = new THREE.Group();
        const mats = this._vectorGunPalette();
        const runes = this._vectorRuneMats();
        // The gold this book is bound in is its own, not the element's: the
        // grimoire reads the same whatever the gun was set to strike with.
        const gold = this._mat(0xC9A227, { roughness: 0.22, metalness: 0.98 });
        const leaf = this._glow(0xFFD87A, 1.15);
        const paper = this._mat(0xE8DCBE, { roughness: 0.92, metalness: 0.02 });

        this._vectorHilt(group, mats, { len: 0.1, z: -0.1 });

        // The book itself is built lying flat and then stood up, so it is read
        // the way a book is read: covers and pages turned toward whoever is
        // holding it rather than edge on to them. Only the boards, the pages and
        // what burns above them are tilted; the hilt and the fittings stay in
        // the hand's own frame.
        const book = new THREE.Group();
        book.rotation.x = -Math.PI * 0.42;
        book.position.set(0, 0.0, 0.04);
        group.add(book);

        // The boards: two slabs of black, hinged on a gold spine.
        for (const side of [-1, 1]) {
          const board = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.21), mats.black);
          board.position.set(side * 0.085, 0, 0.06);
          board.rotation.z = side * 0.12;
          book.add(board);
          const trim = new THREE.Mesh(new THREE.BoxGeometry(0.166, 0.004, 0.216), gold);
          trim.position.set(side * 0.085, -0.008, 0.06);
          trim.rotation.z = side * 0.12;
          book.add(trim);
        }
        const spine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.21, this.seg(10, 6)), gold);
        spine.rotation.x = Math.PI / 2;
        spine.position.set(0, 0, 0.06);
        book.add(spine);

        // The pages: leaves standing along the spine, each one turning on its
        // own clock, so the book is never still while it is open.
        const leaves = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < leaves; i++) {
          const t = i / Math.max(1, leaves - 1);
          const side = i % 2 ? 1 : -1;
          const page = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.002, 0.2), paper);
          page.position.set(side * (0.02 + t * 0.06), 0.012 + t * 0.006, 0.06);
          page.rotation.z = side * (0.2 + t * 0.5);
          page.userData.sway = { axis: 'z', amp: 0.35, freq: 0.7 + t * 0.6, phase: i * 0.8 };
          book.add(page);
        }

        // What is written on them, burning a line at a time above the open book.
        const marks = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < marks; i++) {
          const mark = new THREE.Mesh(
            new THREE.TorusGeometry(0.02 + i * 0.008, 0.0025, this.seg(5, 3), this.seg(14, 8)),
            runes[i % runes.length]);
          mark.position.set(0, 0.06 + i * 0.014, 0.06);
          mark.rotation.x = Math.PI / 2;
          mark.userData.spin = { axis: 'z', speed: (i % 2 ? -1 : 1) * (0.5 + i * 0.25) };
          mark.userData.pulse = { min: 0.25, max: 1.4, freq: 0.8, phase: i };
          book.add(mark);
        }

        // The clasp the book is read over the top of, and the point every spell
        // leaves from.
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), gold);
        clasp.position.set(0, 0.01, 0.17);
        book.add(clasp);
        const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), leaf);
        ember.position.set(0, 0.045, 0.17);
        ember.userData.gun = 'muzzle';
        ember.userData.bob = { axis: 'y', amp: 0.012, freq: 1.1 };
        ember.userData.pulse = { min: 0.4, max: 1.6, freq: 1.2 };
        book.add(ember);

        this._vectorGunFittings(group, mats, this.VECTOR_FIT_LAYOUTS.grimoire);
        return group;
      },

      VECTOR_FIT_LAYOUTS: {
        gun: { fwd: 0.09, up: 0.055 },
        blade: { fwd: 0.12, up: 0.03 },
        sniper: { fwd: 0.2, up: 0.05 },
        athame: { fwd: 0.05, up: 0.03 },
        maul: { fwd: 0.12, up: 0.04 },
        axe: { fwd: 0.09, up: 0.04 },
        scourge: { fwd: 0.06, up: 0.035 },
        staff: { fwd: 0.14, up: 0.04 },
        bow: { fwd: 0.02, up: 0.045 },
        darts: { fwd: 0.02, up: 0.03 },
        talons: { fwd: 0.0, up: 0.03 },
        gauntlet: { fwd: 0.0, up: 0.035 },
        lance: { fwd: 0.16, up: 0.04 },
        grimoire: { fwd: 0.1, up: 0.06 },
      },

      /**
       * The gun's own colours, whatever it has been folded into: a black frame,
       * a matte polymer, and both the accent and the glow taken from the
       * element it is set to strike with (Weapon/VectorGunSystem.js). Every
       * shape is painted out of this one palette, so a lance and a pistol are
       * visibly the same weapon.
       */
      _vectorGunPalette() {
        const color = (window.VectorGun && window.VectorGun.elementColor()) || 0xC9A227;
        return {
          color: color,
          black: this._mat(0x121417, { roughness: 0.42, metalness: 0.86 }),
          polymer: this._mat(0x0C0D10, { roughness: 0.84, metalness: 0.06 }),
          // Bare metal, which the element never touches: heads, blades and
          // plates are steel whatever the gun is set to strike with.
          steel: this._mat(0x9AA3AD, { roughness: 0.3, metalness: 0.95 }),
          accent: this._mat(color, { roughness: 0.24, metalness: 0.98 }),
          glow: this._glow(color, 1.2),
        };
      },

      // ---- 526: Varlenia Beam Rifle -------------------------------------------
      // (The gold house finish is applied after the build; see VARLENIA_IDS.)
      createVarleniaBeamRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0xC8CED4, { roughness: 0.22, metalness: 0.94 });
        const inlay = this._mat(0x8A8F95, { roughness: 0.4, metalness: 0.85 });
        const beam = this._glow(0xFFE9A8, 1.3);
        const dark = this._mat(0x3A3F45, { roughness: 0.5, metalness: 0.8 });

        // State pattern: everything symmetrical, everything scrolled, and a
        // lens where a muzzle should be.
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.056, 0.24), body);
        receiver.position.set(0, 0.014, 0.02);
        group.add(receiver);
        for (const s of [-1, 1]) {
          const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(12, 7), Math.PI * 1.5), inlay);
          scroll.position.set(s * 0.021, 0.02, -0.05);
          scroll.rotation.set(Math.PI / 2, 0, s * 0.6);
          group.add(scroll);
        }
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.26, this.seg(12, 7)), body);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.03, 0.24);
        group.add(barrel);
        const rings = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022 - i * 0.001, 0.004, this.seg(4, 3), this.seg(14, 8)), inlay);
          ring.position.set(0, 0.03, 0.14 + i * 0.04);
          group.add(ring);
          const glow = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.002, this.seg(4, 3), this.seg(14, 8)), beam);
          glow.position.set(0, 0.03, 0.14 + i * 0.04);
          glow.userData.pulse = { min: 0.1, max: 1.3, freq: 1.8, phase: -i * 0.7 };
          group.add(glow);
        }
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.014, this.seg(14, 8)), beam);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.03, 0.378);
        lens.userData.gun = 'muzzle';
        lens.userData.pulse = { min: 0.5, max: 1.5, freq: 1.4 };
        group.add(lens);
        const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), beam);
        crest.position.set(0, 0.058, 0.02);
        crest.userData.spin = { axis: 'y', speed: 0.7 };
        group.add(crest);
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, this.seg(12, 7)), dark);
        cell.position.set(0, -0.05, 0.02);
        cell.userData.gun = 'magazine';
        group.add(cell);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, this.seg(12, 7)), beam);
        window_.position.set(0, -0.05, 0.02);
        window_.userData.pulse = { min: 0.4, max: 1.1, freq: 0.9 };
        group.add(window_);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.06, 0.12), body);
        stock.position.set(0, 0.01, -0.15);
        group.add(stock);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.066, 0.012), dark);
        pad.position.set(0, 0.006, -0.216);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), body);
        grip.position.set(0, -0.052, -0.08);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, inlay, 0, -0.022, -0.052, {});
        return group;
      },

      // ---- 527: Reality Distortion Cannon -------------------------------------
      createRealityDistortionCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x8A9096, { roughness: 0.3, metalness: 0.92 });
        const voidMat = this._mat(0x08070C, { roughness: 1.0, metalness: 0.0 });
        const rimColor = this.getRandomColor(rand, [0xB86BFF, 0x6BFFD3, 0xFF6B8A]);
        const rim = this._glow(rimColor, 1.5);
        const dark = this._mat(0x1E2126, { roughness: 0.6, metalness: 0.7 });

        // The business end is a hole. The rings around it are what keep the
        // hole from getting out.
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, this.seg(16, 9)), voidMat);
        throat.rotation.x = Math.PI / 2;
        throat.position.set(0, 0.03, 0.3);
        throat.userData.gun = 'muzzle';
        group.add(throat);
        const cages = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < cages; i++) {
          const t = i / (cages - 1);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032 + t * 0.014, 0.006, this.seg(5, 4), this.seg(16, 9)), alloy);
          ring.position.set(0, 0.03, 0.18 + i * 0.03);
          ring.rotation.set(t * 0.4, 0, 0);
          ring.userData.spin = { axis: 'z', speed: (i % 2 ? 1 : -1) * (0.6 + t) };
          group.add(ring);
          const inner = new THREE.Mesh(new THREE.TorusGeometry(0.026 + t * 0.01, 0.002, this.seg(4, 3), this.seg(16, 9)), rim);
          inner.position.set(0, 0.03, 0.18 + i * 0.03);
          inner.userData.pulse = { min: 0.2, max: 1.5, freq: 1.6, phase: -i * 0.8 };
          group.add(inner);
        }
        // Things that should not be orbiting a gun.
        const shards = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < shards; i++) {
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), rim);
          shard.position.set(0, 0.03, 0.26);
          shard.userData.orbit = { radius: 0.055 + i * 0.006, speed: 0.9 + i * 0.4, phase: i * 1.6, plane: 'xy' };
          shard.userData.spin = { axis: 'y', speed: 1.4 };
          shard.userData.pulse = { min: 0.3, max: 1.4, freq: 2.0, phase: i };
          group.add(shard);
        }
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.22, this.seg(12, 7)), alloy);
        spine.rotation.x = Math.PI / 2;
        spine.position.set(0, 0.03, 0.07);
        group.add(spine);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 6)), voidMat);
        core.position.set(0, 0.02, -0.06);
        group.add(core);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.003, this.seg(4, 3), this.seg(16, 9)), rim);
        halo.position.set(0, 0.02, -0.06);
        halo.rotation.set(1.0, 0.4, 0);
        halo.userData.spin = { axis: 'y', speed: -1.1 };
        group.add(halo);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.05, 0.12), dark);
        frame.position.set(0, -0.01, -0.09);
        group.add(frame);
        const meter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.002), rim);
        meter.position.set(0, 0.02, -0.15);
        meter.userData.pulse = { min: 0.2, max: 1.2, freq: 2.6 };
        group.add(meter);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.038), dark);
        grip.position.set(0, -0.062, -0.1);
        grip.rotation.x = 0.2;
        group.add(grip);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.05, 0.028), dark);
        foregrip.position.set(0, -0.03, 0.06);
        group.add(foregrip);
        this._gunTrigger(group, alloy, 0, -0.03, -0.072, { guardR: 0.021 });
        return group;
      },

      // ---- 528: Smart Tracking Rifle ------------------------------------------
      createSmartTrackingRifleModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A2E34, { roughness: 0.45, metalness: 0.82 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const hud = this._glow(0x4FE3FF, 1.2);
        const brass = this._cast(0xC9A227);

        // It picks the moment, not the shooter: the trigger is a request and
        // the rifle decides. Hence the tag lock, the ranging head and the
        // enormous computer where a scope would be.
        this._gunAR(group, shell, polymer, bright, { magLen: 0.11 });
        const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.038, 0.2), shell);
        handguard.position.set(0, 0.024, 0.2);
        group.add(handguard);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.14, this.seg(10, 6)), shell);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.024, 0.36);
        group.add(barrel);
        const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.014, 0.04, this.seg(11, 7)), bright);
        brake.rotation.x = Math.PI / 2;
        brake.position.set(0, 0.024, 0.45);
        brake.userData.gun = 'muzzle';
        group.add(brake);
        // The computer: a slab with a live display and a cooling stack.
        const computer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.14), polymer);
        computer.position.set(0, 0.078, 0.05);
        group.add(computer);
        const display = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.03, 0.002), hud);
        display.position.set(0, 0.078, -0.022);
        display.userData.pulse = { min: 0.4, max: 1.2, freq: 1.4 };
        group.add(display);
        const objective = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, this.seg(12, 7)), hud);
        objective.rotation.x = Math.PI / 2;
        objective.position.set(0, 0.078, 0.122);
        group.add(objective);
        const fins = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < fins; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.004), bright);
          fin.position.set(0, 0.108, 0.0 + i * 0.018);
          group.add(fin);
        }
        // Ranging head, sweeping on its own.
        const head = new THREE.Group();
        head.position.set(0, 0.05, 0.24);
        head.userData.sway = { axis: 'y', amp: 0.3, freq: 0.7 };
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.036), polymer);
        head.add(pod);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, this.seg(11, 7)), hud);
        eye.rotation.x = Math.PI / 2;
        eye.position.z = 0.02;
        eye.userData.pulse = { min: 0.3, max: 1.5, freq: 2.4 };
        head.add(eye);
        group.add(head);
        this._gunRail(group, shell, bright, 0, 0.05, 0.16, 0.24);
        const tagBox = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.02, 0.03), polymer);
        tagBox.position.set(-0.026, 0.024, 0.16);
        group.add(tagBox);
        const tagLight = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), hud);
        tagLight.position.set(-0.026, 0.024, 0.178);
        tagLight.userData.pulse = { min: 0.0, max: 1.5, freq: 3.4 };
        group.add(tagLight);
        this._gunShell(group, brass, 0.028, 0.03, 0.04, 0.006);
        return group;
      }

    }
  });
})();
