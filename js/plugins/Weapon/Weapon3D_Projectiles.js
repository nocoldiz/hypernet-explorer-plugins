//=============================================================================
// Weapon 3D Models - Thrown weapons
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for thrown weapons. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Thrown weapons
 * ============================================================================
 *
 * One family per weapon type. This one owns every Projectile weapon (wtypeId 8):
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
    console.error('[Weapon3D_Projectiles] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Projectiles',
    unique: {
      380: 'createUnevenSlingshotModel',              // Uneven Slingshot
      381: 'createStretchySlingModel',                // Stretchy Sling
      382: 'createLeakyBlowgunModel',                 // Leaky Blowgun
      383: 'createHangerSlingshotModel',              // Hanger Slingshot
      384: 'createJunkSlingshotModel',                // Junk Slingshot
      385: 'createPipeSlingshotModel',                // Pipe Slingshot
      386: 'createSkewerDartGunModel',                // Skewer Dart Gun
      387: 'createHairsprayTorchModel',               // Hairspray Torch
      388: 'createStapleShooterModel',                // Staple Shooter
      389: 'createStoneDartsModel',                   // Stone Darts
      390: 'createFiberSlingModel',                   // Fiber Sling
      391: 'createAtlatlDartModel',                   // Atlatl Dart
      392: 'createSeedGrimorieModel',                 // Seed Grimorie
      393: 'createBolaModel',                         // Bola
      394: 'createSlingModel',                        // Sling
      395: 'createBoomerangBespokeModel',             // Boomerang
      396: 'createRopeDartModel',                     // Rope Dart
      397: 'createChakramBespokeModel',               // Chakram
      398: 'createPepperSprayCannonModel',              // Pepper Spray Cannon
      399: 'createShongoModel',                         // Shongo
      400: 'createReturningDiscusModel',                // Returning Discus
      401: 'createPoisonBlowpipeModel',                 // Poison Blowpipe
      402: 'createIronGrenadeModel',                    // Iron Grenade
      403: 'createCrossbowBespokeModel',                // Crossbow
      404: 'createMithrilBowModel',                     // Mithril Bow
      405: 'createDiscLauncherModel',                   // Disc Launcher
      406: 'createExplosiveCrossbowModel',              // Explosive Crossbow
      407: 'createEMPDisruptorModel',                   // EMP Disruptor
      408: 'createTacticalCrossbowModel',               // Tactical Crossbow
      409: 'createNeuralScramblerModel',                // Neural Scrambler
      410: 'createTimedExplosiveLauncherModel',         // Timed Explosive Launcher
      411: 'createCyberWarfareDeviceModel',             // Cyber Warfare Device
      412: 'createStellarSlingModel',                   // Stellar Sling
      413: 'createDroneSwarmLauncherModel',             // Drone Swarm Launcher
      414: 'createKnowledgeInjectorModel',              // EHI Knowledge Injector
      415: 'createPortalDiscModel',                     // Portal Disc
    },
    models: {
      // Type 8: Projectile (Kunai/Dart)
      createProjectileModel(weapon, rand) {
        const group = new THREE.Group();
        const bladeColor = this.getRandomColor(rand, this.bladeColors);
        const wrapColor = this.getRandomColor(rand, this.handleColors);
        const gemColor = this.getRandomColor(rand, this.crystalColors);

        const metalMat = new THREE.MeshStandardMaterial({ color: bladeColor, roughness: 0.25, metalness: 0.85 });
        const wrapMat = new THREE.MeshStandardMaterial({ color: wrapColor, roughness: 0.9 });
        const gemMat = new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.1, emissive: gemColor, emissiveIntensity: 0.6 });

        // Projectile sub-types: Kunai, Spiked Shuriken (Star), or Throwing Dart
        const projType = Math.floor(rand() * 3);

        if (projType === 0) {
          // 1. Kunai: Leaf flat blade, wrapped hilt, ring pommel
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4), metalMat);
          blade.scale.z = 0.2;
          blade.rotation.x = Math.PI / 2; // Point forward
          blade.position.z = 0.07;
          group.add(blade);

          const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, 6), wrapMat);
          hilt.rotation.x = Math.PI / 2;
          hilt.position.z = -0.04;
          group.add(hilt);

          // Grip wrap
          this.addGripWrap(hilt, rand, 0.08, 0.009, 0.009, wrapMat);

          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 4, 8), metalMat);
          ring.position.z = -0.09;
          group.add(ring);

        } else if (projType === 1) {
          // 2. Shuriken: Spiked throwing star (radial symmetry)
          const centerRing = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 12), metalMat);
          group.add(centerRing);

          const numPoints = 4 + Math.floor(rand() * 2); // 4 or 5 point star
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const blade = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 4), metalMat);
            blade.scale.z = 0.2;
            blade.position.set(Math.cos(angle) * 0.04, Math.sin(angle) * 0.04, 0);
            blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
            group.add(blade);
          }

          // Small center glowing gem
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.01, 0), gemMat);
          group.add(gem);

        } else {
          // 3. Throwing Dart: Ribbed grip, heavy iron tip, and feather fletching fins
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.12, 6), metalMat);
          body.rotation.x = Math.PI / 2;
          group.add(body);

          // Grip wraps
          this.addGripWrap(body, rand, 0.12, 0.012, 0.006, wrapMat);

          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.06, 4), metalMat);
          tip.rotation.x = Math.PI / 2;
          tip.position.z = 0.09;
          group.add(tip);

          // 3 flat feather fins at the back
          for (let i = 0; i < 3; i++) {
            const angle = (i / 3) * Math.PI * 2;
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.03), gemMat);
            fin.position.set(Math.cos(angle) * 0.012, Math.sin(angle) * 0.012, -0.06);
            fin.rotation.z = angle;
            fin.rotation.y = Math.PI / 12; // angled fin for spin
            group.add(fin);
          }
        }

        return group;
      },

      // <Boomerang>, Curved aerodynamic returning weapon
      createBoomerangModel(weapon, rand) {
        const group = new THREE.Group();
        const woodColors = [0x8B6914, 0x6B4B0A, 0xA07030, 0x4A3010];
        const woodColor  = woodColors[Math.floor(rand() * woodColors.length)];
        const woodMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.75 });
        const bandMat = new THREE.MeshStandardMaterial({ color: 0xCC2211,  roughness: 0.6  });

        // Arm A
        const armA = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.18), woodMat);
        armA.position.set(0.06, 0, -0.04);
        armA.rotation.y = -0.45;
        group.add(armA);

        // Arm B
        const armB = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, 0.18), woodMat);
        armB.position.set(-0.06, 0, -0.04);
        armB.rotation.y = 0.45;
        group.add(armB);

        // Center join
        const center = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.012, 0.055), woodMat);
        group.add(center);

        // Decorative painted bands
        for (const side of [-1, 1]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.010, 0.014), bandMat);
          band.position.set(side * 0.09, 0, -0.06);
          band.rotation.y = -side * 0.45;
          group.add(band);
        }

        group.rotation.x = -Math.PI / 2.5;
        return group;
      },

      // <Chakram>, Circular throwing ring with spokes and gem center
      createChakramModel(weapon, rand) {
        const group = new THREE.Group();
        const metalColors = [0xCCCCCC, 0xE8C850, 0x88AACC, 0xCC8844];
        const metalColor  = metalColors[Math.floor(rand() * metalColors.length)];
        const metalMat = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.15, metalness: 0.95 });
        const edgeMat  = new THREE.MeshStandardMaterial({ color: 0xEEEEEE,  roughness: 0.05, metalness: 1.0  });
        const gemMat   = new THREE.MeshStandardMaterial({ color: 0xFF2244,  roughness: 0.0,  metalness: 0.1, emissive: 0x880011, emissiveIntensity: 0.3 });

        // Main ring body
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 8, 40), metalMat);
        group.add(ring);

        // Sharp outer edge
        const edge = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.004, 5, 40), edgeMat);
        group.add(edge);

        // Inner hub
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 12), metalMat);
        hub.rotation.x = Math.PI / 2;
        group.add(hub);

        // 4 spokes
        for (let i = 0; i < 4; i++) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.13), metalMat);
          spoke.rotation.z = (i / 4) * Math.PI;
          group.add(spoke);
        }

        // Center gem
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), gemMat);
        gem.position.z = 0.006;
        group.add(gem);

        group.rotation.x = Math.PI / 2;
        return group;
      },

      // <DroneLauncher>, Multi-tube launcher with hexagonal drone bays
      createDroneLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const bodyMat   = new THREE.MeshStandardMaterial({ color: 0x2A2A3A, roughness: 0.5,  metalness: 0.8  });
        const tubeMat   = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.4,  metalness: 0.9  });
        const accentMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.35, metalness: 0.85 });
        const sensorMat = new THREE.MeshStandardMaterial({ color: 0x00EEBB, roughness: 0.1,  metalness: 0.4, emissive: 0x009966, emissiveIntensity: 0.5 });
        const gripMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        // Main body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.22), bodyMat);
        body.position.set(0, 0.01, -0.01);
        group.add(body);

        // Hex tube cluster at front (7 tubes: center + 6 around)
        const hexOffsets = [
          [0, 0], [0.028, 0], [-0.028, 0],
          [0.014, 0.024], [-0.014, 0.024],
          [0.014, -0.024], [-0.014, -0.024]
        ];
        for (const [tx, ty] of hexOffsets) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.08, 6), tubeMat);
          tube.rotation.x = Math.PI / 2;
          tube.position.set(tx, ty + 0.01, 0.14);
          group.add(tube);
        }

        // Front face plate
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.078, 0.008), accentMat);
        face.position.set(0, 0.01, 0.102);
        group.add(face);

        // Targeting sensor on top
        const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.06), sensorMat);
        sensor.position.set(0, 0.055, 0.03);
        group.add(sensor);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), sensorMat);
        lens.position.set(0, 0.055, 0.06);
        group.add(lens);

        // Pistol grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.075, 0.032), gripMat);
        grip.position.set(0, -0.052, -0.04);
        grip.rotation.x = Math.PI / 10;
        group.add(grip);

        // Trigger guard
        const trig = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 8, Math.PI), accentMat);
        trig.position.set(0, -0.01, -0.01);
        trig.rotation.y = Math.PI / 2;
        group.add(trig);

        // Side handles
        for (const side of [-1, 1]) {
          const sideH = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.035, 0.055), accentMat);
          sideH.position.set(side * 0.05, -0.02, 0.02);
          group.add(sideH);
        }

        // Status LEDs
        for (let i = 0; i < 3; i++) {
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.006), sensorMat);
          led.position.set(0, 0.046, -0.05 + i * 0.04);
          group.add(led);
        }

        return group;
      },

      /**
       * A slingshot frame: forked yoke, a band down each arm and a pouch
       * hanging between them. `opts.stretch` pulls the pouch back.
       */
      // A sling band drawn between two points: the fork tip it is tied to and
      // the pouch it is pulling. Bands built at a fixed length and angle stop
      // short of the pouch as soon as the draw changes.
      _slingBand(group, mat, from, to, width) {
        const dir = to.clone().sub(from);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(width || 0.008, dir.length(), 0.003), mat);
        strap.position.copy(from).add(to).multiplyScalar(0.5);
        strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        group.add(strap);
        return strap;
      },

      _slingFork(group, frame, band, pouch, opts) {
        const o = opts || {};
        const spread = o.spread || 0.045;
        const armLen = o.armLen || 0.12;
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, armLen, this.seg(8, 5)), frame);
          arm.position.set(s * spread * 0.6, 0.16, 0);
          arm.rotation.z = -s * 0.35;
          group.add(arm);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), frame);
          tip.position.set(s * spread, 0.21, 0);
          group.add(tip);
          this._slingBand(group, band,
            new THREE.Vector3(s * spread, 0.205, 0),
            new THREE.Vector3(s * 0.009, 0.15, -(o.stretch || 0.03) * 1.9));
        }
        const cup = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.004), pouch);
        cup.position.set(0, 0.15, -(o.stretch || 0.03) * 1.9);
        cup.rotation.x = 0.3;
        group.add(cup);
        if (o.ammoMat) {
          const shot = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(9, 6), this.seg(7, 5)), o.ammoMat);
          shot.position.set(0, 0.15, -(o.stretch || 0.03) * 1.9 - 0.006);
          group.add(shot);
        }
        return group;
      },

      // ---- 380: Uneven Slingshot ----------------------------------------------
      createUnevenSlingshotModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x8B5A2B);
        const rubber = this._mat(0x3A2A28, { roughness: 0.95, metalness: 0.02 });
        const leather = this._wood(0x5B3A1E);
        const stone = this._mat(0x76797E, { roughness: 0.95, metalness: 0.05 });
        // Cut from a fork that was never symmetrical, and it shows.
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.16, this.seg(8, 5)), wood);
        handle.position.y = 0.03;
        group.add(handle);
        for (const s of [-1, 1]) {
          const len = s > 0 ? 0.14 : 0.1;
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, len, this.seg(8, 5)), wood);
          arm.position.set(s * 0.03, 0.14 + (s > 0 ? 0.02 : 0), 0);
          arm.rotation.z = -s * (s > 0 ? 0.3 : 0.45);
          group.add(arm);
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.09, 0.003), rubber);
          strap.position.set(s * (s > 0 ? 0.056 : 0.046), 0.16, -0.03);
          strap.rotation.set(0.5, 0, s * 0.2);
          group.add(strap);
        }
        const cup = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.024, 0.004), leather);
        cup.position.set(0.005, 0.13, -0.06);
        cup.rotation.x = 0.3;
        group.add(cup);
        const shot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.009, 0), stone);
        shot.position.set(0.005, 0.13, -0.066);
        group.add(shot);
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(10, 6)), leather);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.01 - i * 0.026;
          group.add(wrap);
        }
        return group;
      },

      // ---- 381: Stretchy Sling ------------------------------------------------
      createStretchySlingModel(weapon, rand) {
        const group = new THREE.Group();
        const tube = this._mat(0xC8B84A, { roughness: 0.85, metalness: 0.03 });
        const alloy = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.85 });
        const leather = this._wood(0x5B3A1E);
        const lead = this._mat(0x5B5B66, { roughness: 0.6, metalness: 0.7 });
        // Surgical tubing rather than flat band: it stretches much further,
        // which is the entire selling point.
        this._slingFork(group, alloy, tube, leather, { stretch: 0.075, bandLen: 0.16, spread: 0.042, ammoMat: lead });
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.14, this.seg(10, 6)), alloy);
        handle.position.y = 0.04;
        group.add(handle);
        const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, this.seg(9, 6)), alloy);
        brace.position.set(0, 0.0, -0.05);
        brace.rotation.x = 0.5;
        group.add(brace);
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.4), leather);
        cuff.position.set(0, -0.03, -0.09);
        cuff.rotation.set(0.6, 0, 0);
        group.add(cuff);
        for (let i = 0; i < 3; i++) {
          const grip = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, this.seg(4, 3), this.seg(10, 6)), leather);
          grip.rotation.x = Math.PI / 2;
          grip.position.y = 0.01 - i * 0.026;
          group.add(grip);
        }
        return group;
      },

      // ---- 382: Leaky Blowgun -------------------------------------------------
      createLeakyBlowgunModel(weapon, rand) {
        const group = new THREE.Group();
        const pipe = this._mat(0x9BA1A7, { roughness: 0.7, metalness: 0.6 });
        const tape = this._wood(0x33332E);
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.3 });
        const dartMat = this._wood(0x3A2A1C);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.46, this.seg(10, 6)), pipe);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0.14);
        group.add(tube);
        // The leaks: pinholes patched with tape, and some not patched at all.
        const holes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < holes; i++) {
          const t = i / holes;
          const a = i * 2.1;
          if (i % 2 === 0) {
            const patch = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.026), tape);
            patch.position.set(0, 0.02, -0.05 + t * 0.42);
            patch.rotation.z = a;
            group.add(patch);
          } else {
            const hole = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), rust);
            hole.position.set(Math.cos(a) * 0.012, 0.02 + Math.sin(a) * 0.012, -0.05 + t * 0.42);
            group.add(hole);
          }
        }
        const mouthpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.014, 0.03, this.seg(10, 6)), tape);
        mouthpiece.rotation.x = Math.PI / 2;
        mouthpiece.position.set(0, 0.02, -0.1);
        group.add(mouthpiece);
        const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06, this.seg(6, 4)), dartMat);
        dart.rotation.x = Math.PI / 2;
        dart.position.set(0, 0.02, 0.33);
        group.add(dart);
        const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.016, this.seg(6, 4)), tape);
        fletch.rotation.x = -Math.PI / 2;
        fletch.position.set(0, 0.02, 0.3);
        group.add(fletch);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, this.seg(9, 6)), tape);
        grip.rotation.x = Math.PI / 2;
        grip.position.set(0, 0.02, 0.02);
        group.add(grip);
        return group;
      },

      // ---- 383: Hanger Slingshot ----------------------------------------------
      createHangerSlingshotModel(weapon, rand) {
        const group = new THREE.Group();
        const wire = this._mat(0xB0B6BC, { roughness: 0.5, metalness: 0.85 });
        const rubber = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const tape = this._wood(0x33332E);
        const nut = this._mat(0x6E7378, { roughness: 0.6, metalness: 0.8 });
        // A wire coat hanger, straightened and bent back into a fork. The
        // twisted neck is still there, because nobody could undo it.
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.15, this.seg(6, 4)), wire);
          arm.position.set(s * 0.036, 0.16, 0);
          arm.rotation.z = -s * 0.4;
          group.add(arm);
          const curl = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.4), wire);
          curl.position.set(s * 0.062, 0.225, 0);
          curl.rotation.set(0, Math.PI / 2, s * 0.6);
          group.add(curl);
          this._slingBand(group, rubber,
            new THREE.Vector3(s * 0.062, 0.225, 0),
            new THREE.Vector3(s * 0.008, 0.155, -0.068), 0.006);
        }
        const twist = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < twist; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.003, this.seg(4, 3), this.seg(8, 5)), wire);
          t.rotation.x = Math.PI / 2 + 0.4;
          t.position.y = 0.07 - i * 0.012;
          group.add(t);
        }
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.024, 0.004), rubber);
        pouch.position.set(0, 0.155, -0.07);
        pouch.rotation.x = 0.3;
        group.add(pouch);
        const shot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6), nut);
        shot.position.set(0, 0.155, -0.076);
        shot.rotation.x = Math.PI / 2;
        group.add(shot);
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.026, 0.024), tape);
          wrap.position.y = -0.01 - i * 0.028;
          wrap.rotation.y = rand();
          group.add(wrap);
        }
        return group;
      },

      // ---- 384: Junk Slingshot ------------------------------------------------
      createJunkSlingshotModel(weapon, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(this.getRandomColor(rand, [0xC0392B, 0x1D6FD6, 0x1E9B4B]), { roughness: 0.75, metalness: 0.05 });
        const rubber = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const tape = this._wood(0x9A8A50);
        const junk = this._mat(0x8A8F95, { roughness: 0.7, metalness: 0.6 });
        // Made of three unrelated things taped together, and it is obvious
        // which three.
        const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.09, this.seg(10, 6)), plastic);
        bottleNeck.position.y = 0.02;
        group.add(bottleNeck);
        const threads = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, this.seg(4, 3), this.seg(12, 7)), plastic);
        threads.rotation.x = Math.PI / 2;
        threads.position.y = 0.06;
        group.add(threads);
        for (const s of [-1, 1]) {
          const fork = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.008), junk);
          fork.position.set(s * 0.03, 0.15, 0);
          fork.rotation.z = -s * 0.32;
          group.add(fork);
          this._slingBand(group, rubber,
            new THREE.Vector3(s * 0.049, 0.205, 0),
            new THREE.Vector3(s * 0.008, 0.15, -0.058));
        }
        const knot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), tape);
        knot.position.y = 0.095;
        group.add(knot);
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.024, 0.004), rubber);
        pouch.position.set(0, 0.15, -0.06);
        pouch.rotation.x = 0.3;
        group.add(pouch);
        const spare = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), junk);
        spare.position.set(0.02, -0.02, 0.012);
        group.add(spare);
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.028), tape);
          wrap.position.y = -0.02 - i * 0.026;
          group.add(wrap);
        }
        return group;
      },

      // ---- 385: Pipe Slingshot ------------------------------------------------
      createPipeSlingshotModel(weapon, rand) {
        const group = new THREE.Group();
        const galv = this._mat(0x9BA1A7, { roughness: 0.6, metalness: 0.78 });
        const rubber = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const leather = this._wood(0x5B3A1E);
        const ball = this._mat(0x5B5B66, { roughness: 0.55, metalness: 0.75 });
        // Plumbing: two elbows and a tee, screwed together into a fork.
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, this.seg(11, 7)), galv);
        stem.position.y = 0.04;
        group.add(stem);
        const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.075, this.seg(11, 7)), galv);
        tee.rotation.z = Math.PI / 2;
        tee.position.y = 0.13;
        group.add(tee);
        for (const s of [-1, 1]) {
          const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, this.seg(10, 6)), galv);
          elbow.position.set(s * 0.042, 0.165, 0);
          group.add(elbow);
          const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.018, this.seg(11, 7)), galv);
          collar.position.set(s * 0.042, 0.196, 0);
          group.add(collar);
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.1, 0.004), rubber);
          band.position.set(s * 0.042, 0.185, -0.035);
          band.rotation.set(0.5, 0, s * 0.14);
          group.add(band);
        }
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6), galv);
        nut.position.y = 0.1;
        group.add(nut);
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.028, 0.004), leather);
        pouch.position.set(0, 0.15, -0.07);
        pouch.rotation.x = 0.3;
        group.add(pouch);
        const shot = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), ball);
        shot.position.set(0, 0.15, -0.078);
        group.add(shot);
        for (let i = 0; i < 3; i++) {
          const grip = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, this.seg(4, 3), this.seg(10, 6)), leather);
          grip.rotation.x = Math.PI / 2;
          grip.position.y = 0.0 - i * 0.028;
          group.add(grip);
        }
        return group;
      },

      // ---- 386: Skewer Dart Gun -----------------------------------------------
      createSkewerDartGunModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB0B6BC, { roughness: 0.45, metalness: 0.85 });
        const wood = this._wood(0xC8A870);
        const rubber = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const tape = this._wood(0x33332E);
        // A tube, a rubber band and a kitchen skewer: it works, which is the
        // worrying part.
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.26, this.seg(9, 6)), alloy);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, 0.1);
        group.add(barrel);
        const skewer = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.3, this.seg(6, 4)), alloy);
        skewer.rotation.x = Math.PI / 2;
        skewer.position.set(0, 0.02, 0.12);
        group.add(skewer);
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.014, this.seg(6, 4)), alloy);
        point.rotation.x = Math.PI / 2;
        point.position.set(0, 0.02, 0.28);
        group.add(point);
        const ringHandle = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0022, this.seg(4, 3), this.seg(10, 6)), alloy);
        ringHandle.position.set(0, 0.02, -0.03);
        group.add(ringHandle);
        // The band, hooked over two pegs and stretched back.
        for (const s of [-1, 1]) {
          const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.016, this.seg(7, 5)), wood);
          peg.rotation.z = Math.PI / 2;
          peg.position.set(s * 0.012, 0.02, 0.2);
          group.add(peg);
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.2), rubber);
          band.position.set(s * 0.01, 0.02, 0.11);
          band.rotation.y = -s * 0.05;
          group.add(band);
        }
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.09), wood);
        stock.position.set(0, 0.006, -0.03);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.026), tape);
        grip.position.set(0, -0.04, -0.05);
        grip.rotation.x = 0.2;
        group.add(grip);
        for (let i = 0; i < 2; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.02), tape);
          wrap.position.set(0, 0.012, 0.0 + i * 0.06);
          group.add(wrap);
        }
        return group;
      },

      // ---- 387: Hairspray Torch -----------------------------------------------
      createHairsprayTorchModel(weapon, rand) {
        const group = new THREE.Group();
        const can = this._mat(this.getRandomColor(rand, [0xE8459B, 0x35C6E8, 0xF5C518]), { roughness: 0.35, metalness: 0.55 });
        const chrome = this._mat(0xC8CED4, { roughness: 0.2, metalness: 0.95 });
        const tape = this._wood(0x33332E);
        const plastic = this._mat(0x2A2A2E, { roughness: 0.8, metalness: 0.1 });
        const flame = this._glow(0xFF6A1A, 1.2);
        // An aerosol and a lighter, taped together. Nobody should do this.
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.15, this.seg(13, 8)), can);
        body.position.y = 0.02;
        group.add(body);
        for (const y of [-0.058, 0.098]) {
          const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(14, 8)), chrome);
          rimMesh.position.y = y;
          group.add(rimMesh);
        }
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.05, this.seg(13, 8)), chrome);
        label.position.y = 0.02;
        group.add(label);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.03, this.seg(11, 7)), plastic);
        cap.position.y = 0.115;
        group.add(cap);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, this.seg(8, 5)), plastic);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.122, 0.018);
        group.add(nozzle);
        // The lighter, taped on facing the nozzle, lit.
        const lighter = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.012), plastic);
        lighter.position.set(0, 0.1, 0.042);
        lighter.rotation.x = -0.4;
        group.add(lighter);
        const wheelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, this.seg(9, 6)), chrome);
        wheelMesh.rotation.z = Math.PI / 2;
        wheelMesh.position.set(0, 0.124, 0.046);
        group.add(wheelMesh);
        const pilot = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, this.seg(6, 4)), flame);
        pilot.position.set(0, 0.16, 0.035);
        pilot.userData.pulse = { min: 0.5, max: 1.5, freq: 3.6 };
        pilot.userData.sway = { axis: 'z', amp: 0.2, freq: 3.0 };
        group.add(pilot);
        for (let i = 0; i < 2; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), tape);
          wrap.position.set(0, 0.086 - i * 0.03, 0.02);
          group.add(wrap);
        }
        return group;
      },

      // ---- 388: Staple Shooter ------------------------------------------------
      createStapleShooterModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0x1D6FD6, 0x2A2A2E, 0xC0392B]), { roughness: 0.5, metalness: 0.4 });
        const chrome = this._mat(0xC8CED4, { roughness: 0.22, metalness: 0.94 });
        const rubber = this._mat(0x1A1A1C, { roughness: 0.9, metalness: 0.05 });
        // A heavy-duty staple gun, held sideways, which is the only way it
        // works as a weapon.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.13), shell);
        body.position.set(0, 0.02, 0.01);
        group.add(body);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.03), chrome);
        nose.position.set(0, 0.012, 0.086);
        group.add(nose);
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.006), rubber);
        slot.position.set(0, 0.002, 0.1);
        group.add(slot);
        // The magazine rail underneath, with staples visible in it.
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.11), chrome);
        rail.position.set(0, -0.012, 0.02);
        rail.userData.gun = 'magazine';
        group.add(rail);
        const staples = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < staples; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.002), chrome);
          st.position.set(0, -0.008, -0.03 + i * 0.014);
          group.add(st);
        }
        const lever = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.1), shell);
        lever.position.set(0, 0.052, 0.0);
        lever.rotation.x = -0.08;
        lever.userData.gun = 'slide';
        group.add(lever);
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, this.seg(8, 5)), chrome);
        spring.position.set(0, 0.042, -0.05);
        group.add(spring);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.05), rubber);
        pad.position.set(0, 0.06, 0.02);
        group.add(pad);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.06, 0.03), rubber);
        grip.position.set(0, -0.03, -0.04);
        grip.rotation.x = 0.2;
        group.add(grip);
        return group;
      },

      // ---- 389: Stone Darts ---------------------------------------------------
      createStoneDartsModel(weapon, rand) {
        const group = new THREE.Group();
        const stone = this._mat(0x6E7278, { roughness: 0.95, metalness: 0.05 });
        const shaftMat = this._wood(0x8B5A2B);
        const sinew = this._wood(0xB89A5A);
        const featherMat = this._mat(0xD8C8A8, { roughness: 0.95, metalness: 0.02 });
        // Three of them, held in a fan between the fingers.
        const build = (x, z, tilt, scale) => {
          const d = new THREE.Group();
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.24, this.seg(7, 5)), shaftMat);
          d.add(shaft);
          const head = this._plate([[-0.013, 0], [0.013, 0], [0, 0.055]], 0.006, stone);
          head.position.y = 0.12;
          d.add(head);
          // The notches knapped into the base of the head.
          for (const s of [-1, 1]) {
            const notch = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.01, 3), stone);
            notch.position.set(s * 0.01, 0.126, 0);
            notch.rotation.z = -s * Math.PI / 2;
            d.add(notch);
          }
          for (let i = 0; i < 2; i++) {
            const bind = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0022, this.seg(4, 3), this.seg(8, 5)), sinew);
            bind.rotation.x = Math.PI / 2;
            bind.position.y = 0.112 + i * 0.01;
            d.add(bind);
          }
          for (let i = 0; i < 2; i++) {
            const f = this._plate([[0, 0], [0.012, 0.01], [0.014, 0.036], [0, 0.03]], 0.0015, featherMat);
            f.position.set(0, -0.1, 0);
            f.rotation.y = i * Math.PI / 2;
            d.add(f);
          }
          d.position.set(x, 0.04, z);
          d.rotation.z = tilt;
          d.scale.setScalar(scale);
          return d;
        };
        group.add(build(-0.035, 0.01, 0.28, 1.0));
        group.add(build(0.0, 0.0, 0.02, 1.05));
        group.add(build(0.035, -0.02, -0.24, 0.95));
        return group;
      },

      // ---- 390: Fiber Sling ---------------------------------------------------
      createFiberSlingModel(weapon, rand) {
        const group = new THREE.Group();
        const cord = this._wood(0xC8B48A);
        const pouch = this._wood(0x8A6236);
        const stone = this._mat(0x76797E, { roughness: 0.95, metalness: 0.05 });
        // A shepherd's sling: two braided cords and a cradle, held at the loop
        // and about to be swung.
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(12, 7)), cord);
        loop.position.y = 0.24;
        loop.rotation.x = 0.4;
        group.add(loop);
        // The braid runs from inside the loop down to the knot, and each bead
        // is stretched past the step between beads, so the cord reads as one
        // continuous line rather than a row of dots.
        const braid = this.isLowDetail() ? 16 : 30;
        const braidSpan = 0.35;
        const braidStep = braidSpan / braid;
        for (const s of [-1, 1]) {
          for (let i = 0; i <= braid; i++) {
            const t = i / braid;
            const bead = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(5, 4)), cord);
            const spread = Math.sin(t * Math.PI) * 0.04;
            bead.position.set(s * spread, 0.24 - t * braidSpan, Math.sin(t * 6 + s) * 0.008);
            bead.scale.y = Math.max(1.6, (braidStep * 1.3) / 0.01);
            group.add(bead);
          }
          const knot = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), cord);
          knot.position.set(s * 0.012, -0.11, 0);
          group.add(knot);
        }
        const cradle = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(11, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), pouch);
        cradle.rotation.x = Math.PI;
        cradle.position.y = -0.13;
        cradle.scale.set(1, 0.6, 0.7);
        group.add(cradle);
        const shot = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(10, 6), this.seg(8, 5)), stone);
        shot.position.y = -0.14;
        group.add(shot);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.06, this.seg(5, 3)), cord);
        tail.position.set(0.02, 0.27, 0);
        tail.rotation.z = -0.4;
        tail.userData.sway = { axis: 'z', amp: 0.3, freq: 1.2 };
        group.add(tail);
        return group;
      },

      // ---- 391: Atlatl Dart ---------------------------------------------------
      createAtlatlDartModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x8B5A2B);
        const dark = this._wood(0x4A3524);
        const flint = this._mat(0x3A3A3E, { roughness: 0.4, metalness: 0.15 });
        const sinew = this._wood(0xB89A5A);
        const featherMat = this._mat(0xD8C8A8, { roughness: 0.95, metalness: 0.02 });
        // The thrower and the dart together: the board is the weapon, the dart
        // is the ammunition, and the spur at the back is the whole mechanism.
        const board = this._plate([
          [-0.018, -0.16], [0.018, -0.16], [0.022, 0.06], [0.014, 0.18], [-0.014, 0.18], [-0.022, 0.06]
        ], 0.014, wood);
        group.add(board);
        const channel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.3, 0.008), dark);
        channel.position.set(0, 0.01, 0.008);
        group.add(channel);
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.026, this.seg(6, 4)), dark);
        spur.position.set(0, 0.185, 0.012);
        spur.rotation.x = -0.5;
        group.add(spur);
        // The banner stone weight, which is what makes it throw.
        const weight = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(10, 6), this.seg(7, 5)), flint);
        weight.scale.set(1.4, 0.7, 0.6);
        weight.position.set(0, 0.02, -0.012);
        group.add(weight);
        for (let i = 0; i < 2; i++) {
          const bind = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(4, 3), this.seg(10, 6)), sinew);
          bind.rotation.y = Math.PI / 2;
          bind.position.set(0, 0.0 + i * 0.04, 0);
          group.add(bind);
        }
        // The dart, lying in the channel and running well past both ends.
        const dart = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.62, this.seg(7, 5)), wood);
        dart.position.set(0, 0.16, 0.018);
        group.add(dart);
        const head = this._plate([[-0.011, 0], [0.011, 0], [0, 0.05]], 0.005, flint);
        head.position.set(0, 0.46, 0.018);
        group.add(head);
        for (let i = 0; i < 2; i++) {
          const f = this._plate([[0, 0], [0.014, 0.012], [0.016, 0.05], [0, 0.042]], 0.0015, featherMat);
          f.position.set(0, -0.13, 0.018);
          f.rotation.y = i * Math.PI / 2;
          group.add(f);
        }
        const finger = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, this.seg(4, 3), this.seg(10, 6)), sinew);
        finger.position.set(0.02, -0.1, 0);
        finger.rotation.y = Math.PI / 2;
        group.add(finger);
        return group;
      },

      // ---- 392: Seed Grimorie -------------------------------------------------
      createSeedGrimorieModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x5B4227);
        const page = this._mat(0xD8CFA8, { roughness: 0.95, metalness: 0.02 });
        const leafColor = this.getRandomColor(rand, [0x4E9A3A, 0x6BBF48]);
        const leaf = this._mat(leafColor, { roughness: 0.6, metalness: 0.05 });
        const sap = this._glow(0xB8FF5A, 0.8);
        const husk = this._mat(0xC8A02A, { roughness: 0.55, metalness: 0.1 });
        // A book bound in bark whose pages are leaves, and it throws seeds.
        for (const s of [-1, 1]) {
          const cover = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.012), bark);
          cover.position.set(s * 0.048, 0.06, 0);
          cover.rotation.y = -s * 0.3;
          group.add(cover);
        }
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, this.seg(10, 6), 1, false, 0, Math.PI), bark);
        spine.position.y = 0.06;
        spine.rotation.y = Math.PI / 2;
        group.add(spine);
        const leaves = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < leaves; i++) {
          const t = i / (leaves - 1) - 0.5;
          const pg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.001), i % 2 ? page : leaf);
          pg.position.set(t * 0.07, 0.06, 0);
          pg.rotation.y = -t * 0.6;
          pg.userData.sway = { axis: 'y', amp: 0.15, freq: 0.6 + Math.abs(t), phase: i };
          group.add(pg);
        }
        // Seed pods hanging off the fore-edge, ready to be picked.
        const pods = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < pods; i++) {
          const pod = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), husk);
          pod.scale.y = 1.5;
          pod.position.set(-0.03 + i * 0.015, -0.02, 0.008);
          pod.userData.sway = { axis: 'z', amp: 0.2, freq: 1.0 + i * 0.2, phase: i };
          group.add(pod);
        }
        const glowSeam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.02), sap);
        glowSeam.position.set(0, 0.115, 0);
        glowSeam.userData.pulse = { min: 0.2, max: 1.1, freq: 0.9 };
        group.add(glowSeam);
        const vine = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, this.seg(4, 3), this.seg(14, 8), Math.PI * 1.4), leaf);
        vine.position.set(0, 0.06, 0);
        vine.rotation.set(0.3, 0.4, 0);
        group.add(vine);
        return group;
      },

      // ---- 393: Bola ----------------------------------------------------------
      createBolaModel(weapon, rand) {
        const group = new THREE.Group();
        const cord = this._wood(0xB89A5A);
        const hide = this._wood(0x6B4423);
        const stone = this._mat(0x6E7278, { roughness: 0.95, metalness: 0.05 });
        // Three weighted cords off one knot, each on its own rope physics, so
        // they hang and swing independently.
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(7, 5)), cord);
        group.add(knot);
        const arms = 3;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          const head = this.chainRig(group, {
            links: 5, length: 0.24 + i * 0.03, linkMat: cord, rope: true, linkTube: 0.0035,
            x: Math.cos(a) * 0.012, z: Math.sin(a) * 0.012,
            endMass: 4.0, gravity: -0.0009, damping: 0.94
          });
          const wrapBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(10, 6), this.seg(8, 5)), hide);
          head.add(wrapBall);
          const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02, 0), stone);
          head.add(core);
          for (let j = 0; j < 2; j++) {
            const bind = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.003, this.seg(4, 3), this.seg(10, 6)), cord);
            bind.rotation.set(Math.PI / 2, 0, (j / 2) * Math.PI);
            head.add(bind);
          }
        }
        return group;
      },

      // ---- 394: Sling ---------------------------------------------------------
      createSlingModel(weapon, rand) {
        const group = new THREE.Group();
        const leather = this._wood(0x6B4423);
        const cord = this._wood(0x8A6236);
        const lead = this._mat(0x5B5B66, { roughness: 0.6, metalness: 0.7 });
        // The military version of the fibre sling: cut leather rather than
        // braid, and lead shot rather than a river stone.
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, this.seg(4, 3), this.seg(12, 7)), leather);
        loop.position.y = 0.26;
        loop.rotation.x = 0.35;
        group.add(loop);
        for (const s of [-1, 1]) {
          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.36, 0.002), leather);
          strap.position.set(s * 0.024, 0.08, 0);
          strap.rotation.z = -s * 0.11;
          group.add(strap);
          const stitchRows = this.isLowDetail() ? 3 : 6;
          for (let i = 0; i < stitchRows; i++) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.003), cord);
            st.position.set(s * (0.024 + i * 0.001), 0.2 - i * 0.06, 0.002);
            group.add(st);
          }
        }
        const cradle = this._plate([[-0.03, -0.03], [0.03, -0.03], [0.036, 0.02], [0, 0.036], [-0.036, 0.02]], 0.003, leather);
        cradle.position.y = -0.12;
        group.add(cradle);
        const shot = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(8, 5)), lead);
        shot.scale.z = 1.4;
        shot.position.set(0, -0.12, 0.014);
        group.add(shot);
        const releaseCord = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.07, this.seg(5, 3)), cord);
        releaseCord.position.set(0.024, 0.29, 0);
        releaseCord.rotation.z = -0.5;
        releaseCord.userData.sway = { axis: 'z', amp: 0.28, freq: 1.1 };
        group.add(releaseCord);
        return group;
      },

      // ---- 395: Boomerang -----------------------------------------------------
      createBoomerangBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0xA0703C, 0x8B5A2B, 0x6E4A2A]));
        const paint = this._mat(this.getRandomColor(rand, [0xC0392B, 0xE8E4DC, 0x1E4A8B]), { roughness: 0.85, metalness: 0.03 });
        const burn = this._wood(0x3A2A1C);
        // A real aerofoil: one face rounded, the other flat, and the two arms
        // set at an angle rather than in a line.
        const arm = (angle) => {
          const a = this._plate([
            [-0.014, 0], [0.014, 0], [0.016, 0.14], [0.006, 0.2], [-0.012, 0.19], [-0.016, 0.12]
          ], 0.012, wood);
          a.rotation.z = angle;
          return a;
        };
        group.add(arm(0.5));
        group.add(arm(-0.5 + Math.PI * 0.35));
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(7, 5)), wood);
        elbow.scale.z = 0.6;
        group.add(elbow);
        // The rounded upper surface: a raised spine down each arm.
        for (const angle of [0.5, -0.5 + Math.PI * 0.35]) {
          const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.18, this.seg(8, 5)), wood);
          spine.position.set(Math.sin(-angle) * 0.09, Math.cos(angle) * 0.09, 0.008);
          spine.rotation.z = angle;
          group.add(spine);
        }
        // Painted bands, the way they always are.
        const bands = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < bands; i++) {
          const angle = i < bands / 2 ? 0.5 : -0.5 + Math.PI * 0.35;
          const t = (i % (bands / 2)) / (bands / 2);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.014), i % 2 ? paint : burn);
          b.position.set(Math.sin(-angle) * (0.06 + t * 0.1), Math.cos(angle) * (0.06 + t * 0.1), 0.004);
          b.rotation.z = angle;
          group.add(b);
        }
        return group;
      },

      // ---- 396: Rope Dart -----------------------------------------------------
      createRopeDartModel(weapon, rand) {
        const group = new THREE.Group();
        const cord = this._wood(0x8A2A2A);
        const steel = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.92 });
        const brass = this._cast(0xB9902A);
        const silk = this._mat(0xC0392B, { roughness: 0.9, metalness: 0.05 });
        // Almost all rope: the dart is small and a very long way from the hand.
        const coils = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < coils; i++) {
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(4, 3), this.seg(12, 7)), cord);
          c.position.y = -0.06 - i * 0.014;
          c.rotation.set(Math.PI / 2 + 0.2, 0, i * 0.5);
          group.add(c);
        }
        const head = this.chainRig(group, {
          links: 9, length: 0.44, linkMat: cord, rope: true, linkTube: 0.004,
          endMass: 3.0, gravity: -0.0007, damping: 0.95
        });
        const dart = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.09, this.seg(9, 6)), steel);
        dart.position.y = 0.045;
        head.add(dart);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, this.seg(10, 6)), brass);
        head.add(collar);
        const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, this.seg(4, 3), this.seg(10, 6)), brass);
        eyeRing.position.y = -0.014;
        head.add(eyeRing);
        // The silk tassel behind the head, which is what makes it visible in
        // flight and is also how it is aimed.
        for (let i = 0; i < 4; i++) {
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0015, 0.06, this.seg(5, 3)), silk);
          strand.position.set((i - 1.5) * 0.005, -0.04, 0);
          strand.userData.sway = { axis: 'z', amp: 0.3, freq: 1.3, phase: i };
          head.add(strand);
        }
        return group;
      },

      // ---- 397: Chakram -------------------------------------------------------
      createChakramBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0xC8CED4, { roughness: 0.16, metalness: 0.96 });
        const dark = this._mat(0x3A3F45, { roughness: 0.45, metalness: 0.85 });
        const gold = this._cast(0xD9A62A);
        // A flat ring sharpened all the way round, with a plain inner grip.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, this.seg(6, 4), this.seg(26, 14)), steel);
        group.add(ring);
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.003, this.seg(26, 14)), steel);
        edge.rotation.x = Math.PI / 2;
        group.add(edge);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.006, this.seg(5, 4), this.seg(22, 12)), dark);
        group.add(inner);
        // Etched panels round the flat, which is where the decoration goes.
        const panels = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < panels; i++) {
          const a = (i / panels) * Math.PI * 2;
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.004), gold);
          panel.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0.004);
          panel.rotation.z = a;
          group.add(panel);
        }
        const grip = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.009, this.seg(5, 4), this.seg(20, 11), Math.PI * 0.6), dark);
        grip.rotation.z = Math.PI * 1.2;
        group.add(grip);
        for (let i = 0; i < 3; i++) {
          const bind = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, this.seg(4, 3), this.seg(9, 6)), gold);
          const a = Math.PI * 1.2 + i * 0.25;
          bind.position.set(Math.cos(a) * 0.078, Math.sin(a) * 0.078, 0);
          bind.rotation.set(Math.PI / 2, 0, a);
          group.add(bind);
        }
        return group;
      }
,

      /**
       * A crossbow prod, string and stock. The four crossbows here differ in
       * everything bolted to it, not in the shape of it.
       */
      _crossbowFrame(group, limb, string, stock, opts) {
        const o = opts || {};
        const span = o.span || 0.13;
        const stockLen = o.stockLen || 0.3;
        // Read by isCrossbow: this is what makes the weapon let off with a
        // finger rather than being drawn like a bow.
        group.userData.crossbow = true;
        const tiller = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, stockLen), stock);
        tiller.position.set(0, 0.01, stockLen * 0.5 - 0.16);
        group.add(tiller);
        // Where the string sits spanned (on the nut) and where it snaps to.
        const cocked = new THREE.Vector3(0, 0.02, 0.004);
        const released = new THREE.Vector3(0, 0.02, 0.06);
        const tips = {};
        for (const s of [-1, 1]) {
          // The prod arms are grouped so they can spring straight on the shot,
          // the way a bow's limbs do. See tickBow.
          const arm = new THREE.Group();
          arm.userData.bow = s > 0 ? 'limbLeft' : 'limbRight';
          group.add(arm);
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0.02, 0.12),
            new THREE.Vector3(s * span * 0.6, 0.02, 0.1),
            new THREE.Vector3(s * span, 0.02, 0.06)
          );
          const bow = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(7, 4), 0.008, this.seg(6, 4), false), limb);
          arm.add(bow);
          const nock = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), stock);
          nock.position.set(s * span, 0.02, 0.06);
          arm.add(nock);
          tips[s] = new THREE.Vector3(s * span, 0.02, 0.06);
        }
        this._bowString(group, string, tips[1], tips[-1], { r: 0.0022, nock: cocked, release: released });
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.024, this.seg(10, 6)), limb);
        nut.rotation.z = Math.PI / 2;
        nut.position.set(0, 0.024, 0.0);
        nut.userData.gun = 'cylinder';
        group.add(nut);
        const groove = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.16), limb);
        groove.position.set(0, 0.028, 0.06);
        group.add(groove);
        if (o.boltMat) {
          // Shaft and head together: the head cannot stay in the groove when
          // the bolt goes.
          const shot = new THREE.Group();
          shot.userData.bow = 'arrow';
          group.add(shot);
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.15, this.seg(7, 5)), o.boltMat);
          bolt.rotation.x = Math.PI / 2;
          bolt.position.set(0, 0.033, 0.07);
          shot.add(bolt);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.024, this.seg(7, 5)), o.tipMat || o.boltMat);
          tip.rotation.x = Math.PI / 2;
          tip.position.set(0, 0.033, 0.157);
          shot.add(tip);
        }
        this._gunTrigger(group, limb, 0, -0.02, -0.06, { guardR: 0.018 });
        return group;
      },

      // ---- 398: Pepper Spray Cannon -------------------------------------------
      createPepperSprayCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const red = this._mat(0xC0392B, { roughness: 0.5, metalness: 0.35 });
        const black = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.06 });
        const chrome = this._mat(0xC8CED4, { roughness: 0.22, metalness: 0.94 });
        const spray = this._glow(0xFF8A2A, 0.8);
        // A fire-extinguisher-sized canister of the stuff, with a horn.
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.2, this.seg(14, 8)), red);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, 0.0, -0.02);
        group.add(tank);
        for (const z of [-0.125, 0.085]) {
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.042, this.seg(14, 8), this.seg(9, 6), 0, Math.PI * 2, 0, Math.PI / 2), red);
          dome.rotation.x = z < 0 ? Math.PI / 2 : -Math.PI / 2;
          dome.position.set(0, 0.0, z);
          group.add(dome);
        }
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.06, this.seg(14, 8)), black);
        label.rotation.x = Math.PI / 2;
        label.position.set(0, 0.0, -0.02);
        group.add(label);
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, this.seg(11, 7)), chrome);
        valve.position.set(0, 0.05, 0.06);
        group.add(valve);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, this.seg(12, 7)), chrome);
        gauge.rotation.y = Math.PI / 2;
        gauge.position.set(0.03, 0.04, 0.02);
        group.add(gauge);
        const hose = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(12, 7), Math.PI), black);
        hose.position.set(0, 0.05, 0.11);
        hose.rotation.set(0, Math.PI / 2, 0.6);
        group.add(hose);
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.014, 0.09, this.seg(14, 8), 1, true), black);
        horn.rotation.x = -Math.PI / 2;
        horn.position.set(0, 0.06, 0.2);
        group.add(horn);
        const mist = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, this.seg(11, 7), 1, true), spray);
        mist.rotation.x = -Math.PI / 2;
        mist.position.set(0, 0.06, 0.27);
        mist.userData.pulse = { min: 0.1, max: 0.7, freq: 2.2 };
        group.add(mist);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.03), black);
        grip.position.set(0, -0.056, -0.02);
        grip.rotation.x = Math.PI / 9;
        group.add(grip);
        this._gunTrigger(group, chrome, 0, -0.02, 0.006, {});
        return group;
      },

      // ---- 399: Shongo --------------------------------------------------------
      createShongoModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x6E7378, { roughness: 0.55, metalness: 0.8 });
        const dark = this._mat(0x3A3F45, { roughness: 0.45, metalness: 0.85 });
        const hide = this._wood(0x6B4423);
        // A Central African throwing iron: a flat blade that branches into
        // three arms, each one an edge in its own right.
        const main = this._plate([
          [-0.012, -0.05], [0.012, -0.05], [0.014, 0.1], [-0.014, 0.1]
        ], 0.006, iron);
        group.add(main);
        // Upper hook, curling forward.
        const hook = this._plate([
          [-0.014, 0.1], [0.014, 0.1], [0.07, 0.18], [0.1, 0.24], [0.076, 0.235], [0.03, 0.17], [-0.014, 0.13]
        ], 0.006, iron);
        group.add(hook);
        // Side arm, kicking out the other way.
        const side = this._plate([
          [-0.014, 0.05], [0.0, 0.05], [-0.06, 0.13], [-0.095, 0.15], [-0.085, 0.115], [-0.04, 0.08]
        ], 0.006, iron);
        group.add(side);
        // Lower spur.
        const spur = this._plate([
          [-0.012, -0.02], [0.012, -0.02], [0.05, -0.07], [0.032, -0.085], [-0.012, -0.05]
        ], 0.006, iron);
        group.add(spur);
        // Ground bevels along each edge.
        const bevels = [[0.09, 0.22, 0.5], [-0.08, 0.14, -0.8], [0.04, -0.07, 1.2]];
        for (const [x, y, rz] of bevels) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.008), dark);
          b.position.set(x * 0.8, y * 0.85, 0);
          b.rotation.z = rz;
          group.add(b);
        }
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.014), hide);
          wrap.position.y = -0.06 - i * 0.02;
          wrap.rotation.z = (rand() - 0.5) * 0.1;
          group.add(wrap);
        }
        return group;
      },

      // ---- 400: Returning Discus ----------------------------------------------
      createReturningDiscusModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB8BEC4, { roughness: 0.2, metalness: 0.94 });
        const dark = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.8 });
        const guideColor = this.getRandomColor(rand, [0x4FE3FF, 0x8AFF6A]);
        const guide = this._glow(guideColor, 1.1);
        // It comes back, so it has stabilisers and a gyroscope in the hub.
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.01, this.seg(6, 4), this.seg(24, 13)), alloy);
        group.add(rim);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, this.seg(24, 13)), dark);
        face.rotation.x = Math.PI / 2;
        group.add(face);
        // Vanes cut through the plate, set at an angle so it spins itself.
        const vanes = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < vanes; i++) {
          const a = (i / vanes) * Math.PI * 2;
          const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.01), alloy);
          vane.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.004);
          vane.rotation.set(0.5, 0, a);
          group.add(vane);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.018, this.seg(14, 8)), alloy);
        hub.rotation.x = Math.PI / 2;
        group.add(hub);
        // The gyro inside it, turning.
        const gyro = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, this.seg(4, 3), this.seg(14, 8)), guide);
        gyro.rotation.x = Math.PI / 2;
        gyro.userData.spin = { axis: 'y', speed: 3.0 };
        gyro.userData.pulse = { min: 0.3, max: 1.2, freq: 2.0 };
        group.add(gyro);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(4, 3), this.seg(12, 7)), guide);
        inner.rotation.set(Math.PI / 2, 0.6, 0);
        inner.userData.spin = { axis: 'x', speed: -2.2 };
        group.add(inner);
        // Tracking lights round the rim, running.
        const lights = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < lights; i++) {
          const a = (i / lights) * Math.PI * 2;
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), guide);
          l.position.set(Math.cos(a) * 0.095, Math.sin(a) * 0.095, 0);
          l.userData.pulse = { min: 0.0, max: 1.4, freq: 2.4, phase: -i * 0.8 };
          group.add(l);
        }
        return group;
      },

      // ---- 401: Poison Blowpipe -----------------------------------------------
      createPoisonBlowpipeModel(weapon, rand) {
        const group = new THREE.Group();
        const bamboo = this._mat(0x7A6A3A, { roughness: 0.72, metalness: 0.04 });
        const lacquer = this._mat(0x1A1410, { roughness: 0.25, metalness: 0.15 });
        const cord = this._wood(0x8A6236);
        const venom = this._glow(0x7CFF3D, 0.9);
        const dartMat = this._wood(0x3A2A1C);
        // A proper hunting pipe: long, lacquered, with a quiver of dipped
        // darts and a gourd of the poison itself.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.58, this.seg(11, 7)), lacquer);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.02, 0.18);
        group.add(tube);
        const bindings = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < bindings; i++) {
          const b = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(10, 6)), cord);
          b.position.set(0, 0.02, -0.05 + i * 0.1);
          group.add(b);
        }
        const mouthpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.032, this.seg(11, 7)), bamboo);
        mouthpiece.rotation.x = Math.PI / 2;
        mouthpiece.position.set(0, 0.02, -0.12);
        group.add(mouthpiece);
        const foresight = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.014, this.seg(6, 4)), bamboo);
        foresight.position.set(0, 0.038, 0.4);
        group.add(foresight);
        // The quiver, lashed alongside, with the dipped tips showing.
        const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.11, this.seg(10, 6)), bamboo);
        quiver.position.set(-0.03, 0.0, 0.06);
        quiver.rotation.x = 0.15;
        group.add(quiver);
        const darts = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < darts; i++) {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.07, this.seg(6, 4)), dartMat);
          d.position.set(-0.03 + (i - 2) * 0.005, 0.055, 0.062);
          group.add(d);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.012, this.seg(5, 4)), venom);
          tip.position.set(-0.03 + (i - 2) * 0.005, 0.096, 0.062);
          tip.userData.pulse = { min: 0.2, max: 1.0, freq: 1.0, phase: i * 0.7 };
          group.add(tip);
        }
        // The gourd the poison lives in.
        const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(11, 7), this.seg(8, 5)), bamboo);
        gourd.scale.y = 1.3;
        gourd.position.set(0.03, -0.01, 0.02);
        group.add(gourd);
        const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.016, this.seg(9, 6)), cord);
        stopper.position.set(0.03, 0.026, 0.02);
        group.add(stopper);
        return group;
      },

      // ---- 402: Iron Grenade --------------------------------------------------
      createIronGrenadeModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x4A4F55, { roughness: 0.75, metalness: 0.65 });
        const dark = this._mat(0x2A2E34, { roughness: 0.85, metalness: 0.4 });
        const brass = this._cast(0xB9902A);
        const fuse = this._wood(0x8A6236);
        const ember = this._glow(0xFF5A1A, 1.2);
        // A cast iron sphere with a fuse, already lit, which is the whole
        // reason to be holding it at arm's length.
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(14, 8), this.seg(10, 6)), iron);
        group.add(ball);
        // The mould seam and the casting sprue, both left on.
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, this.seg(4, 3), this.seg(18, 10)), dark);
        seam.rotation.x = Math.PI / 2;
        group.add(seam);
        const pits = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < pits; i++) {
          const phi = Math.acos(1 - 2 * (i + 0.5) / pits);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          const pit = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(6, 4), this.seg(5, 4)), dark);
          pit.position.set(Math.sin(phi) * Math.cos(theta) * 0.05, Math.cos(phi) * 0.05, Math.sin(phi) * Math.sin(theta) * 0.05);
          group.add(pit);
        }
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.024, this.seg(11, 7)), brass);
        neck.position.y = 0.056;
        group.add(neck);
        const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.014, this.seg(10, 6)), fuse);
        plug.position.y = 0.072;
        group.add(plug);
        // The fuse, burning down, with the spark at the end of it.
        const segs = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.024, this.seg(6, 4)), fuse);
          s.position.set(Math.sin(t * 3) * 0.012, 0.09 + t * 0.07, 0);
          s.rotation.z = Math.cos(t * 3) * 0.5;
          group.add(s);
        }
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), ember);
        spark.position.set(Math.sin(3) * 0.012, 0.165, 0);
        spark.userData.pulse = { min: 0.5, max: 1.6, freq: 4.0 };
        group.add(spark);
        const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(8, 5), this.seg(6, 4)),
          this._mat(0x6E7378, { roughness: 1.0, metalness: 0, transparent: true, opacity: 0.3 }));
        smoke.position.set(0.008, 0.19, 0);
        smoke.userData.bob = { axis: 'y', amp: 0.02, freq: 0.8 };
        group.add(smoke);
        return group;
      },

      // ---- 403: Crossbow ------------------------------------------------------
      createCrossbowBespokeModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x6B4423);
        const horn = this._mat(0x3A2A1C, { roughness: 0.5, metalness: 0.1 });
        const cord = this._mat(0xD8CFA8, { roughness: 0.8, metalness: 0.05 });
        const iron = this._mat(0x5A5F66, { roughness: 0.55, metalness: 0.78 });
        this._crossbowFrame(group, iron, cord, wood, { span: 0.13, boltMat: wood, tipMat: iron });
        // A composite prod of horn and sinew, bound at the centre.
        const prod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.024), horn);
        prod.position.set(0, 0.02, 0.115);
        group.add(prod);
        for (let i = 0; i < 3; i++) {
          const bind = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(10, 6)), cord);
          bind.rotation.y = Math.PI / 2;
          bind.position.set(-0.016 + i * 0.016, 0.02, 0.115);
          group.add(bind);
        }
        // The stirrup at the front, to hold it down with a foot while spanning.
        const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, this.seg(4, 3), this.seg(12, 7), Math.PI * 1.3), iron);
        stirrup.position.set(0, -0.01, 0.15);
        stirrup.rotation.set(Math.PI / 2, 0, 0);
        group.add(stirrup);
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.05), wood);
        butt.position.set(0, 0.0, -0.15);
        group.add(butt);
        return group;
      },

      // ---- 404: Mithril Bow ---------------------------------------------------
      createMithrilBowModel(weapon, rand) {
        const group = new THREE.Group();
        const mithril = this._mat(0xEAF1F6, { roughness: 0.08, metalness: 0.96 });
        const veinColor = this.getRandomColor(rand, [0xAEE8FF, 0xD6C4FF, 0xC2FFE4]);
        const vein = this._glow(veinColor, 1.0);
        const cord = this._glow(0xE8F4FF, 0.7);
        // Modelled flat in the Y-Z plane like every other bow here, so the
        // battle pose turns its belly to the camera.
        const up = new THREE.Vector3(0, 1, 0);
        const limb = (dir) => {
          const pts = [];
          const n = this.isLowDetail() ? 5 : 8;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            pts.push(new THREE.Vector3(0, dir * t * 0.3, -Math.sin(t * 2.0) * 0.055));
          }
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const d = b.clone().sub(a);
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.009 - i * 0.0008, 0.01 - i * 0.0008, d.length() * 1.08, this.seg(8, 5)), mithril);
            seg.position.copy(a).add(b).multiplyScalar(0.5);
            seg.quaternion.setFromUnitVectors(up, d.clone().normalize());
            group.add(seg);
            if (i % 2 === 0) {
              const glowSeg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, d.length(), this.seg(5, 3)), vein);
              glowSeg.position.copy(seg.position);
              glowSeg.quaternion.copy(seg.quaternion);
              glowSeg.userData.pulse = { min: 0.2, max: 1.2, freq: 1.2, phase: i * 0.6 + (dir > 0 ? 0 : 1.5) };
              group.add(glowSeg);
            }
          }
          const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0), vein);
          tip.position.copy(pts[pts.length - 1]);
          tip.userData.pulse = { min: 0.4, max: 1.4, freq: 1.0, phase: dir };
          group.add(tip);
        };
        limb(1); limb(-1);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.09, this.seg(11, 7)), mithril);
        group.add(grip);
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.02), mithril);
        shelf.position.set(0, 0.012, 0.014);
        group.add(shelf);
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.6, this.seg(5, 3)), cord);
        string.position.set(0, 0, -0.045);
        group.add(string);
        string.userData.pulse = { min: 0.3, max: 0.9, freq: 0.8 };
        return group;
      },

      // ---- 405: Disc Launcher -------------------------------------------------
      createDiscLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2E3238, { roughness: 0.5, metalness: 0.8 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const edgeColor = this.getRandomColor(rand, [0x4FE3FF, 0xFF6A1A]);
        const edge = this._glow(edgeColor, 1.1);
        // A magazine of chakrams, spun up and thrown by a pair of wheels.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.16), shell);
        body.position.set(0, 0.02, 0.02);
        group.add(body);
        // The stack of discs waiting, edge on.
        const discs = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < discs; i++) {
          const d = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.004, this.seg(4, 3), this.seg(16, 9)), bright);
          d.position.set(0, 0.02, -0.03 - i * 0.012);
          group.add(d);
        }
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.09, 0.07), polymer);
        mag.position.set(0, 0.02, -0.05);
        mag.userData.gun = 'magazine';
        group.add(mag);
        // The throwing wheels, spinning in opposite directions.
        for (const s of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, this.seg(14, 8)), polymer);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(s * 0.03, 0.02, 0.1);
          wheel.userData.spin = { axis: 'x', speed: s * 6.0 };
          group.add(wheel);
          const tread = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, this.seg(4, 3), this.seg(14, 8)), edge);
          tread.rotation.y = Math.PI / 2;
          tread.position.set(s * 0.03, 0.02, 0.1);
          tread.userData.spin = { axis: 'x', speed: s * 6.0 };
          tread.userData.pulse = { min: 0.2, max: 1.0, freq: 3.0 };
          group.add(tread);
        }
        // The disc in the throat, on its way out.
        const loaded = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, this.seg(5, 4), this.seg(18, 10)), edge);
        loaded.position.set(0, 0.02, 0.14);
        loaded.userData.spin = { axis: 'z', speed: 5.0 };
        group.add(loaded);
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, this.seg(4, 3), this.seg(16, 9), Math.PI), shell);
        guard.position.set(0, 0.02, 0.13);
        guard.rotation.z = Math.PI;
        group.add(guard);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), polymer);
        grip.position.set(0, -0.05, -0.03);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.018, 0.0, {});
        return group;
      },

      // ---- 406: Explosive Crossbow --------------------------------------------
      createExplosiveCrossbowModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x4A4F55, { roughness: 0.55, metalness: 0.8 });
        const wood = this._wood(0x4A3524);
        const cord = this._mat(0x2A2A2E, { roughness: 0.8, metalness: 0.1 });
        const warn = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.2 });
        const fuse = this._glow(0xFF5A1A, 1.2);
        this._crossbowFrame(group, steel, cord, wood, { span: 0.12, stockLen: 0.28 });
        // The bolt is the interesting part: a charge on the front of it, with
        // the fuse already going.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, this.seg(7, 5)), wood);
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0.033, 0.06);
        group.add(shaft);
        const charge = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.045, this.seg(11, 7)), warn);
        charge.rotation.x = Math.PI / 2;
        charge.position.set(0, 0.033, 0.15);
        group.add(charge);
        for (let i = 0; i < 2; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.0175, 0.003, this.seg(4, 3), this.seg(12, 7)), steel);
          band.position.set(0, 0.033, 0.138 + i * 0.024);
          group.add(band);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.026, this.seg(10, 6)), steel);
        cap.rotation.x = Math.PI / 2;
        cap.position.set(0, 0.033, 0.185);
        group.add(cap);
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, this.seg(6, 4)), cord);
        wick.position.set(0, 0.052, 0.15);
        wick.rotation.z = 0.3;
        group.add(wick);
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), fuse);
        spark.position.set(0.006, 0.068, 0.15);
        spark.userData.pulse = { min: 0.5, max: 1.6, freq: 4.4 };
        group.add(spark);
        // Spare charges racked along the stock.
        for (let i = 0; i < 2; i++) {
          const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.034, this.seg(10, 6)), warn);
          spare.rotation.z = Math.PI / 2;
          spare.position.set(-0.026, -0.006, -0.04 + i * 0.05);
          group.add(spare);
        }
        const windlass = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, this.seg(11, 7)), steel);
        windlass.rotation.z = Math.PI / 2;
        windlass.position.set(0.024, 0.014, -0.09);
        windlass.userData.spin = { axis: 'x', speed: 0.6 };
        group.add(windlass);
        return group;
      },

      // ---- 407: EMP Disruptor -------------------------------------------------
      createEMPDisruptorModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x3A4048, { roughness: 0.45, metalness: 0.8 });
        const copper = this._mat(0xB87333, { roughness: 0.3, metalness: 0.9 });
        const dark = this._mat(0x1A1C20, { roughness: 0.8, metalness: 0.1 });
        const pulse = this._glow(0x4FC3FF, 1.4);
        // A thrown charge: a coil in a cage, primed and counting down.
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.04, this.seg(14, 8), this.seg(10, 6)), shell);
        group.add(core);
        // The coil, wound round its equator.
        const coils = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < coils; i++) {
          const t = i / (coils - 1) - 0.5;
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.042 * Math.cos(t * 1.6), 0.004, this.seg(4, 3), this.seg(14, 8)), copper);
          c.rotation.x = Math.PI / 2;
          c.position.y = t * 0.06;
          group.add(c);
        }
        // The cage of struts that keeps it off whatever it lands on.
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          const strut = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, this.seg(4, 3), this.seg(14, 8), Math.PI), shell);
          strut.rotation.set(Math.PI / 2, a, 0);
          group.add(strut);
          const foot = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), dark);
          foot.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
          group.add(foot);
        }
        const emitters = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < emitters; i++) {
          const a = (i / emitters) * Math.PI * 2 + 0.4;
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(8, 5), this.seg(6, 4)), pulse);
          e.position.set(Math.cos(a) * 0.042, 0.02, Math.sin(a) * 0.042);
          e.userData.pulse = { min: 0.0, max: 1.6, freq: 2.6, phase: -i * 1.2 };
          group.add(e);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.02, this.seg(12, 7)), dark);
        cap.position.y = 0.048;
        group.add(cap);
        const timer = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.002), pulse);
        timer.position.set(0, 0.052, 0.02);
        timer.userData.pulse = { min: 0.2, max: 1.2, freq: 1.0 };
        group.add(timer);
        const pin = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, this.seg(4, 3), this.seg(10, 6)), copper);
        pin.position.set(0.022, 0.05, 0);
        pin.rotation.y = Math.PI / 2;
        pin.userData.sway = { axis: 'z', amp: 0.2, freq: 1.4 };
        group.add(pin);
        return group;
      },

      // ---- 408: Tactical Crossbow ---------------------------------------------
      createTacticalCrossbowModel(weapon, rand) {
        const group = new THREE.Group();
        const polymer = this._mat(0x1C1E22, { roughness: 0.85, metalness: 0.05 });
        const limbMat = this._mat(0x2E3238, { roughness: 0.4, metalness: 0.6 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const cable = this._mat(0x3A3F45, { roughness: 0.6, metalness: 0.4 });
        const glass = this._mat(0x7FC8E8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55 });
        this._crossbowFrame(group, bright, cable, polymer, { span: 0.1, stockLen: 0.32, boltMat: bright });
        // Compound limbs: short, stiff, and working through cams.
        for (const s of [-1, 1]) {
          const limb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.03), limbMat);
          limb.position.set(s * 0.06, 0.02, 0.1);
          limb.rotation.z = -s * 0.2;
          group.add(limb);
          const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, this.seg(12, 7)), bright);
          cam.rotation.y = Math.PI / 2;
          cam.position.set(s * 0.088, 0.02, 0.085);
          cam.userData.spin = { axis: 'x', speed: s * 0.4 };
          group.add(cam);
          const cableRun = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.09, this.seg(5, 3)), cable);
          cableRun.position.set(s * 0.06, 0.02, 0.055);
          cableRun.rotation.set(Math.PI / 2 - 0.4, 0, s * 0.3);
          group.add(cableRun);
        }
        this._gunRail(group, polymer, bright, 0, 0.05, -0.02, 0.16);
        this._gunOptic(group, polymer, bright, glass, 1, 0, 0.072, -0.03);
        const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.024), polymer);
        foregrip.position.set(0, -0.03, 0.05);
        group.add(foregrip);
        const quiver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.1), polymer);
        quiver.position.set(0, -0.024, -0.1);
        group.add(quiver);
        for (let i = 0; i < 3; i++) {
          const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.11, this.seg(6, 4)), bright);
          spare.rotation.x = Math.PI / 2;
          spare.position.set(-0.008 + i * 0.008, -0.03, -0.1);
          group.add(spare);
        }
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.056, 0.012), polymer);
        pad.position.set(0, 0.006, -0.19);
        group.add(pad);
        return group;
      },

      // ---- 409: Neural Scrambler ----------------------------------------------
      createNeuralScramblerModel(weapon, rand) {
        const group = new THREE.Group();
        const white = this._mat(0xE4E8EC, { roughness: 0.3, metalness: 0.4 });
        const dark = this._mat(0x1A1C20, { roughness: 0.8, metalness: 0.1 });
        const waveColor = this.getRandomColor(rand, [0xC77DFF, 0x7DFFD3]);
        const wave = this._glow(waveColor, 1.3);
        // A thrown puck that stands up and starts scrambling: three arms open
        // out and the emitter rises between them.
        const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.026, this.seg(16, 9)), white);
        group.add(puck);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, this.seg(4, 3), this.seg(18, 10)), dark);
        group.add(rim);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.05), white);
          arm.position.set(Math.cos(a) * 0.06, -0.012, Math.sin(a) * 0.06);
          arm.rotation.set(0.3, -a, 0);
          arm.userData.sway = { axis: 'x', amp: 0.12, freq: 0.7, phase: i };
          group.add(arm);
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), dark);
          pad.position.set(Math.cos(a) * 0.08, -0.024, Math.sin(a) * 0.08);
          group.add(pad);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, this.seg(11, 7)), white);
        post.position.y = 0.04;
        post.userData.bob = { axis: 'y', amp: 0.008, freq: 0.6 };
        group.add(post);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(12, 7), this.seg(9, 6)), wave);
        emitter.position.y = 0.075;
        emitter.userData.pulse = { min: 0.4, max: 1.5, freq: 1.6 };
        emitter.userData.bob = { axis: 'y', amp: 0.008, freq: 0.6 };
        group.add(emitter);
        // The scrambling itself: rings going out, out of step with each other.
        const rings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04 + i * 0.018, 0.002, this.seg(4, 3), this.seg(18, 10)), wave);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.075;
          ring.userData.pulse = { min: 0.0, max: 1.1, freq: 1.3, phase: -i * 0.9 };
          ring.userData.spin = { axis: 'y', speed: (i % 2 ? 1 : -1) * 0.8 };
          group.add(ring);
        }
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.002), wave);
        readout.position.set(0, 0.014, 0.047);
        readout.userData.pulse = { min: 0.2, max: 1.0, freq: 3.0 };
        group.add(readout);
        return group;
      },

      // ---- 410: Timed Explosive Launcher --------------------------------------
      createTimedExplosiveLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const olive = this._mat(0x3E4A32, { roughness: 0.75, metalness: 0.35 });
        const dark = this._mat(0x1E2024, { roughness: 0.8, metalness: 0.15 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.35, metalness: 0.88 });
        const warn = this._glow(0xFF3A3A, 1.2);
        const gold = this._cast(0xB9902A);
        // A spigot launcher for timed charges, with the timer where the sight
        // would be, so it can be dialled before it goes.
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.2, this.seg(13, 8)), olive);
        tube.rotation.x = Math.PI / 2;
        tube.position.set(0, 0.026, 0.12);
        group.add(tube);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, this.seg(4, 3), this.seg(14, 8)), dark);
        collar.position.set(0, 0.026, 0.21);
        group.add(collar);
        // The charge, sitting proud of the muzzle on its spigot.
        const charge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.07, this.seg(12, 7)), gold);
        charge.rotation.x = Math.PI / 2;
        charge.position.set(0, 0.026, 0.26);
        group.add(charge);
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(8, 5)), dark);
        nose.scale.z = 0.7;
        nose.position.set(0, 0.026, 0.3);
        group.add(nose);
        for (let i = 0; i < 2; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.0265, 0.004, this.seg(4, 3), this.seg(12, 7)), warn);
          band.position.set(0, 0.026, 0.245 + i * 0.03);
          band.userData.pulse = { min: 0.1, max: 1.2, freq: 1.4, phase: i * 0.8 };
          group.add(band);
        }
        // The timer: a dial with a hand going round.
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, this.seg(14, 8)), dark);
        dial.position.set(0, 0.066, 0.06);
        group.add(dial);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.003), warn);
        hand.position.set(0, 0.072, 0.062);
        hand.userData.spin = { axis: 'z', speed: 1.2 };
        group.add(hand);
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, this.seg(10, 6)), bright);
        knob.rotation.z = Math.PI / 2;
        knob.position.set(0.024, 0.066, 0.06);
        group.add(knob);
        const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.1), dark);
        receiver.position.set(0, 0.0, 0.0);
        group.add(receiver);
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.1), olive);
        stock.position.set(0, 0.004, -0.1);
        group.add(stock);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), dark);
        grip.position.set(0, -0.056, -0.05);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.026, -0.022, { guardR: 0.021 });
        return group;
      },

      // ---- 411: Cyber Warfare Device ------------------------------------------
      createCyberWarfareDeviceModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x24262C, { roughness: 0.4, metalness: 0.7 });
        const board = this._mat(0x1E6B3A, { roughness: 0.7, metalness: 0.2 });
        const gold = this._cast(0xC9A227);
        const dataColor = this.getRandomColor(rand, [0x4FE3FF, 0x8AFF6A]);
        const data = this._glow(dataColor, 1.2);
        // A thrown intrusion package: an open case with a board in it, aerials
        // out, and traffic running across the traces.
        const case_ = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.13), shell);
        group.add(case_);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.13), shell);
        lid.position.set(0, 0.05, -0.05);
        lid.rotation.x = -1.1;
        group.add(lid);
        const pcb = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.003, 0.11), board);
        pcb.position.y = 0.012;
        group.add(pcb);
        // Traces and components on it.
        const traces = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < traces; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.002), gold);
          t.position.set((i % 2 ? 0.008 : -0.008), 0.014, -0.045 + i * 0.013);
          group.add(t);
          const pulseTrace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.003), data);
          pulseTrace.position.set(0, 0.015, -0.045 + i * 0.013);
          pulseTrace.userData.bob = { axis: 'x', amp: 0.03, freq: 1.2 + i * 0.2, phase: i };
          pulseTrace.userData.pulse = { min: 0.2, max: 1.4, freq: 2.0, phase: i * 0.6 };
          group.add(pulseTrace);
        }
        const chip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.028), shell);
        chip.position.y = 0.018;
        group.add(chip);
        const die = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.014), data);
        die.position.y = 0.023;
        die.userData.pulse = { min: 0.3, max: 1.5, freq: 1.4 };
        group.add(die);
        // Aerials, deployed at different angles.
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.09, this.seg(6, 4)), gold);
          aerial.position.set(Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.05);
          aerial.rotation.set(0.35 * Math.cos(a), 0, -0.35 * Math.sin(a));
          group.add(aerial);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), data);
          tip.position.set(Math.cos(a) * 0.055, 0.093, Math.sin(a) * 0.068);
          tip.userData.pulse = { min: 0.0, max: 1.5, freq: 2.8, phase: i * 1.3 };
          group.add(tip);
        }
        const battery = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, this.seg(11, 7)), shell);
        battery.rotation.z = Math.PI / 2;
        battery.position.set(0, 0.02, 0.05);
        group.add(battery);
        return group;
      },

      // ---- 412: Stellar Sling -------------------------------------------------
      createStellarSlingModel(weapon, rand) {
        const group = new THREE.Group();
        const nightColor = this.getRandomColor(rand, [0x141B3A, 0x1B1430]);
        const night = this._mat(nightColor, { roughness: 0.3, metalness: 0.5 });
        const star = this._glow(0xFFFFFF, 1.4);
        const silver = this._cast(0xC0C6CC);
        // A sling whose cords are drawn out of the sky, with a small star
        // sitting in the cradle.
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, this.seg(4, 3), this.seg(12, 7)), silver);
        loop.position.y = 0.26;
        loop.rotation.x = 0.35;
        group.add(loop);
        // The cord spans loop to cradle and its beads overlap, so the sling
        // hangs as a drawn line of sky rather than as scattered dots.
        const beadSpan = 0.39;
        for (const s of [-1, 1]) {
          const beads = this.isLowDetail() ? 20 : 36;
          const beadStep = beadSpan / beads;
          for (let i = 0; i <= beads; i++) {
            const t = i / beads;
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(5, 4)), i % 3 === 0 ? star : night);
            const spread = Math.sin(t * Math.PI) * 0.038;
            b.scale.y = Math.max(1, (beadStep * 1.3) / 0.008);
            b.position.set(s * spread, 0.26 - t * beadSpan, Math.sin(t * 5 + s) * 0.006);
            if (i % 3 === 0) b.userData.pulse = { min: 0.2, max: 1.5, freq: 1.2 + t, phase: i };
            group.add(b);
          }
        }
        const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.004, this.seg(4, 3), this.seg(14, 8)), silver);
        cradle.position.y = -0.13;
        cradle.rotation.x = Math.PI / 2 - 0.3;
        group.add(cradle);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(9, 6)), star);
        core.position.y = -0.13;
        core.userData.pulse = { min: 0.6, max: 1.7, freq: 1.1 };
        group.add(core);
        const flare = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.002, this.seg(4, 3), this.seg(16, 9)), star);
        flare.position.y = -0.13;
        flare.rotation.x = Math.PI / 2;
        flare.userData.spin = { axis: 'y', speed: 1.4 };
        flare.userData.pulse = { min: 0.2, max: 1.0, freq: 1.6 };
        group.add(flare);
        const motes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), star);
          m.position.y = -0.13;
          m.userData.orbit = { radius: 0.04 + i * 0.006, speed: 1.0 + i * 0.4, phase: i * 1.6, plane: i % 2 ? 'xz' : 'xy' };
          m.userData.pulse = { min: 0.1, max: 1.3, freq: 2.0, phase: i };
          group.add(m);
        }
        return group;
      },

      // ---- 413: Drone Swarm Launcher ------------------------------------------
      createDroneSwarmLauncherModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2E3238, { roughness: 0.5, metalness: 0.78 });
        const polymer = this._mat(0x1A1C20, { roughness: 0.85, metalness: 0.05 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const eyeColor = this.getRandomColor(rand, [0x4FE3FF, 0xFF4F4F]);
        const eye = this._glow(eyeColor, 1.2);
        // A honeycomb rack of cells, and the first few already out and
        // circling.
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), shell);
        rack.position.set(0, 0.02, 0.06);
        group.add(rack);
        const cells = [];
        for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) {
          if (this.isLowDetail() && Math.abs(r) + Math.abs(c) > 1) continue;
          cells.push([c * 0.03 + (Math.abs(r) === 1 ? 0.015 : 0), r * 0.026]);
        }
        for (const [x, y] of cells) {
          const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.125, this.seg(8, 5)), polymer);
          cell.rotation.x = Math.PI / 2;
          cell.position.set(x, 0.02 + y, 0.06);
          group.add(cell);
        }
        const facePlate = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.085, 0.008), bright);
        facePlate.position.set(0, 0.02, 0.122);
        group.add(facePlate);
        // Launched drones, orbiting the muzzle.
        const drones = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < drones; i++) {
          const d = new THREE.Group();
          d.position.set(0, 0.02, 0.2);
          d.userData.orbit = { radius: 0.07 + i * 0.012, speed: 1.1 + i * 0.35, phase: i * 1.6, plane: i % 2 ? 'xy' : 'xz' };
          const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), shell);
          d.add(bodyMesh);
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2;
            const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.001, this.seg(9, 6)), bright);
            rotor.position.set(Math.cos(a) * 0.014, 0.008, Math.sin(a) * 0.014);
            rotor.userData.spin = { axis: 'y', speed: 12 };
            d.add(rotor);
          }
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), eye);
          led.position.z = 0.012;
          led.userData.pulse = { min: 0.2, max: 1.4, freq: 3.0, phase: i };
          d.add(led);
          group.add(d);
        }
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.002), eye);
        screen.position.set(0, 0.062, 0.0);
        screen.userData.pulse = { min: 0.3, max: 1.1, freq: 1.5 };
        group.add(screen);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.085, 0.036), polymer);
        grip.position.set(0, -0.05, -0.02);
        grip.rotation.x = 0.2;
        group.add(grip);
        this._gunTrigger(group, bright, 0, -0.018, 0.01, {});
        return group;
      },

      // ---- 414: EHI Knowledge Injector ----------------------------------------
      createKnowledgeInjectorModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.42, metalness: 0.28 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const bright = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        const glass = this._mat(0xBFD8E0, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
        const idea = this._glow(0x4FE3FF, 1.2);
        // Branded like a medical device, shaped like a crossbow, and what it
        // fires is a syringe of somebody else's memories.
        this._crossbowFrame(group, bright, accent, corporate, { span: 0.1, stockLen: 0.26 });
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), corporate);
        rail.position.set(0, 0.036, 0.05);
        group.add(rail);
        // The dart: a glass ampoule with the payload glowing in it, and it
        // leaves the rail in one piece.
        const shot = new THREE.Group();
        shot.userData.bow = 'arrow';
        group.add(shot);
        const ampoule = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, this.seg(11, 7)), glass);
        ampoule.rotation.x = Math.PI / 2;
        ampoule.position.set(0, 0.052, 0.08);
        shot.add(ampoule);
        const payload = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(11, 7)), idea);
        payload.rotation.x = Math.PI / 2;
        payload.position.set(0, 0.052, 0.078);
        payload.userData.pulse = { min: 0.4, max: 1.3, freq: 1.2 };
        shot.add(payload);
        const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.05, this.seg(6, 4)), bright);
        needle.rotation.x = Math.PI / 2;
        needle.position.set(0, 0.052, 0.14);
        shot.add(needle);
        const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, this.seg(11, 7)), accent);
        plunger.rotation.x = Math.PI / 2;
        plunger.position.set(0, 0.052, 0.042);
        shot.add(plunger);
        // Spare ampoules in a branded rack.
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.07), accent);
        rack.position.set(0, -0.026, -0.06);
        group.add(rack);
        for (let i = 0; i < 3; i++) {
          const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, this.seg(9, 6)), glass);
          sp.rotation.x = Math.PI / 2;
          sp.position.set(-0.009 + i * 0.009, -0.026, -0.06);
          group.add(sp);
          const dose = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(9, 6)), idea);
          dose.rotation.x = Math.PI / 2;
          dose.position.set(-0.009 + i * 0.009, -0.026, -0.06);
          dose.userData.pulse = { min: 0.2, max: 0.9, freq: 0.8, phase: i };
          group.add(dose);
        }
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.002, 0.04), accent);
        label.position.set(0, 0.026, -0.02);
        group.add(label);
        return group;
      },

      // ---- 415: Portal Disc ---------------------------------------------------
      createPortalDiscModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB0B6BC, { roughness: 0.22, metalness: 0.94 });
        const voidMat = this._mat(0x08070C, { roughness: 1.0, metalness: 0.0 });
        const rimColor = this.getRandomColor(rand, [0xB86BFF, 0x6BFFD3, 0xFFB86B]);
        const rim = this._glow(rimColor, 1.5);
        // Thrown, and where it goes it opens: the disc is a frame round a hole
        // that is not there yet.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.011, this.seg(6, 4), this.seg(24, 13)), alloy);
        group.add(ring);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.002, this.seg(24, 13)), voidMat);
        inner.rotation.x = Math.PI / 2;
        group.add(inner);
        // Segments of the aperture, each turning at its own rate.
        const segs = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < segs; i++) {
          const seg = new THREE.Mesh(new THREE.TorusGeometry(0.062 - i * 0.008, 0.0035, this.seg(4, 3), this.seg(18, 10), Math.PI * 1.2), rim);
          seg.rotation.set(Math.PI / 2, 0, (i / segs) * Math.PI * 2);
          seg.position.z = 0.002;
          seg.userData.spin = { axis: 'z', speed: (i % 2 ? 1 : -1) * (0.5 + i * 0.3) };
          seg.userData.pulse = { min: 0.2, max: 1.4, freq: 1.4, phase: -i * 0.8 };
          group.add(seg);
        }
        const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(9, 6)), rim);
        eyeMesh.userData.pulse = { min: 0.5, max: 1.7, freq: 1.0 };
        group.add(eyeMesh);
        // Emitter blocks round the frame, and shards it has already pulled
        // through from somewhere else.
        const blocks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < blocks; i++) {
          const a = (i / blocks) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.016), alloy);
          b.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0);
          b.rotation.z = a;
          group.add(b);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), rim);
          lamp.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.01);
          lamp.userData.pulse = { min: 0.0, max: 1.4, freq: 2.2, phase: -i * 0.9 };
          group.add(lamp);
        }
        const shards = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < shards; i++) {
          const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), rim);
          sh.userData.orbit = { radius: 0.05 + i * 0.008, speed: 1.2 + i * 0.4, phase: i * 1.5, plane: 'xy' };
          sh.userData.spin = { axis: 'z', speed: 1.6 };
          sh.userData.pulse = { min: 0.2, max: 1.3, freq: 1.8, phase: i };
          group.add(sh);
        }
        return group;
      }

    }
  });
})();
