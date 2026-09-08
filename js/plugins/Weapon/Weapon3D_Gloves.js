//=============================================================================
// Weapon 3D Models - Gloves and fists
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for gloves and fists. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Gloves and fists
 * ============================================================================
 *
 * One family per weapon type. This one owns every Glove weapon (wtypeId 11):
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
    console.error('[Weapon3D_Gloves] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Gloves',
    unique: {
      573: 'createHandWrapsModel',                      // Beginner's Hand Wraps
      574: 'createMakeshiftBoxingGlovesModel',          // Makeshift Boxing Gloves
      575: 'createShoddyKnucklesModel',                 // Shoddy Knuckles
      576: 'createKeyKnucklesModel',                    // Key Knuckles
      577: 'createGolfTeeGloveModel',                   // Golf Tee Glove
      578: 'createMirrorShardFistModel',                // Mirror Shard Fist
      579: 'createGlassKnucklesModel',                  // Glass Knuckles
      580: 'createSeedGloveModel',                      // Seed Glove
      581: 'createCestusModel',                         // Cestus
      582: 'createKnuckleDustersModel',                 // Knuckle Dusters
      583: 'createBrassKnucklesModel',                  // Brass Knuckles
      584: 'createPhantomTickleGlovesModel',            // Phantom Tickle Gloves
      585: 'createArmBracersModel',                     // Arm Bracers
      586: 'createIronKnucklesModel',                   // Iron Knuckles
      587: 'createMetalManModel',                       // Metal Man
      588: 'createFlyingKicksModel',                    // Flying Kicks
      589: 'createAdamantineFistsModel',                // Adamantine Fists
      590: 'createShockGauntletsModel',                 // Shock Gauntlets
      591: 'createMithrilStrikeGlovesModel',            // Mithril Strike Gloves
      592: 'createSonicGauntletModel',                  // Sonic Gauntlet
      593: 'createThunderLizardGauntletsModel',           // Thunder Lizard Gauntlets
      594: 'createLightningElementalFistsModel',          // Lightning Elemental Fists
      595: 'createForceCrushGlovesModel',                 // Force Crush Gloves
      596: 'createNightmareGauntletsModel',               // Nightmare Gauntlets
      597: 'createArcaneShieldGauntletsModel',            // Arcane Shield Gauntlets
      598: 'createMetamorphicGauntletsModel',             // Metamorphic Gauntlets
      599: 'createMastersGauntletsModel',                 // Master's Gauntlets
      600: 'createTelekineticGauntletsModel',             // Telekinetic Gauntlets
      601: 'createFoxSpiritFistsModel',                   // Fox Spirit Fists
      602: 'createMindManipulatorGlovesModel',            // Mind Manipulator Gloves
      603: 'createPetrochemInjectorsModel',               // EHI Petrochem Injectors
      604: 'createPhasingTouchModel',                     // Phasing Touch
      605: 'createVarleniaFistModel',                     // Varlenia Fist
      606: 'createMolecularManipulatorGlovesModel',       // Molecular Manipulator Gloves
      607: 'createApocalypseFistsModel',                  // EHI Apocalypse Fists
      608: 'createOmniadaptiveCombatSystemModel',         // Omniadaptive Combat System
    },
    models: {
      // Type 11: Glove
      createGloveModel(weapon, rand) {
        const group = new THREE.Group();
        const gloveColor = this.getRandomColor(rand, this.handleColors);
        const plateColor = this.getRandomColor(rand, this.guardColors);
        const gemColors = this.crystalColors; // use all gem colors for ultimate gauntlet!

        const mat = new THREE.MeshStandardMaterial({ color: gloveColor, roughness: 0.85 });
        const plateMat = new THREE.MeshStandardMaterial({ color: plateColor, roughness: 0.35, metalness: 0.8 });

        // Detailed Armored Gauntlet
        const glove = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), mat);
        group.add(glove);

        // Wrist cuff
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.07, 12), plateMat);
        cuff.position.y = -0.06;
        group.add(cuff);

        // Armored plate on back of the hand
        const handPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), plateMat);
        handPlate.position.set(0, 0.02, 0.01);
        group.add(handPlate);

        // Knuckle studs / Infinity stone sockets on the knuckles!
        // Places 5 distinct glowing colored gems
        const xOffsets = [-0.03, -0.015, 0, 0.015, 0.03];
        for (let i = 0; i < 5; i++) {
          const gColor = gemColors[i % gemColors.length];
          const gemMat = new THREE.MeshStandardMaterial({ color: gColor, roughness: 0.1, emissive: gColor, emissiveIntensity: 0.8 });
          const gem = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), gemMat);
          gem.position.set(xOffsets[i], 0.03, 0.045);
          group.add(gem);

          // Socket bezel
          const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 4, 8), plateMat);
          bezel.position.set(xOffsets[i], 0.03, 0.045);
          bezel.rotation.x = Math.PI / 2;
          group.add(bezel);
        }

        return group;
      },

      /**
       * The hand every glove in this family is built around: a back plate,
       * four knuckles, folded fingers and a thumb, in whatever material the
       * glove is made of. The weapon is then whatever is added to it.
       */
      _fist(group, mat, opts) {
        const o = opts || {};
        const w = o.width || 0.085;
        const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.085, 0.05), mat);
        back.position.y = 0.02;
        group.add(back);
        const knuckleR = o.knuckleR || 0.014;
        for (let i = 0; i < 4; i++) {
          const x = -w / 2 + knuckleR + i * ((w - knuckleR * 2) / 3);
          const k = new THREE.Mesh(new THREE.SphereGeometry(knuckleR, this.seg(9, 6), this.seg(7, 5)), mat);
          k.position.set(x, 0.06, 0.012);
          k.scale.z = 0.85;
          group.add(k);
          if (o.fingers !== false) {
            const finger = new THREE.Mesh(new THREE.CylinderGeometry(knuckleR * 0.8, knuckleR * 0.75, 0.032, this.seg(8, 5)), mat);
            finger.position.set(x, 0.048, 0.036);
            finger.rotation.x = Math.PI / 2 - 0.3;
            group.add(finger);
          }
        }
        const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.05, this.seg(9, 6)), mat);
        thumb.position.set(w / 2 + 0.004, 0.028, 0.018);
        thumb.rotation.set(0.5, 0, -0.9);
        group.add(thumb);
        const cuffH = o.cuff || 0.05;
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, cuffH, this.seg(11, 7)), o.cuffMat || mat);
        // Hang the cuff off the bottom of the palm rather than at a fixed
        // height: a short cuff used to float clear of the hand entirely.
        wrist.position.y = (0.02 - 0.085 / 2) + 0.004 - cuffH / 2;
        wrist.scale.z = 0.72;
        group.add(wrist);
        return group;
      },

      // ---- 573: Beginner's Hand Wraps -----------------------------------------
      createHandWrapsModel(weapon, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(this.getRandomColor(rand, [0xE8E2D2, 0x1D6FD6, 0xC0392B]), { roughness: 1.0, metalness: 0.0 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        // Nothing but cotton, badly wound: the wraps overlap where they
        // should not and leave the knuckles half bare.
        this._fist(group, skin, { width: 0.078, knuckleR: 0.013 });
        const laps = this.isLowDetail() ? 6 : 11;
        for (let i = 0; i < laps; i++) {
          const t = i / laps;
          const lap = new THREE.Mesh(new THREE.TorusGeometry(0.042 - t * 0.004, 0.007, this.seg(4, 3), this.seg(12, 7)), cloth);
          lap.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
          lap.position.y = -0.05 + t * 0.1;
          lap.scale.z = 0.7;
          group.add(lap);
        }
        // The loose end, tucked in and coming out again.
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.004), cloth);
        tail.position.set(-0.03, -0.06, 0.024);
        tail.rotation.z = 0.4;
        tail.userData.sway = { axis: 'z', amp: 0.2, freq: 1.1 };
        group.add(tail);
        return group;
      },

      // ---- 574: Makeshift Boxing Gloves ---------------------------------------
      createMakeshiftBoxingGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const vinyl = this._mat(this.getRandomColor(rand, [0xC0392B, 0x1D6FD6, 0x2A2A2E]), { roughness: 0.55, metalness: 0.06 });
        const tape = this._wood(0x9A8A50);
        const stuffing = this._mat(0xE8E2D2, { roughness: 1.0, metalness: 0.0 });
        // A proper glove shape, but split at the seam with the padding coming
        // out and tape holding the rest together.
        const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.062, this.seg(14, 8), this.seg(10, 6)), vinyl);
        mitt.scale.set(1, 1.1, 0.85);
        mitt.position.y = 0.03;
        group.add(mitt);
        const thumbMitt = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(11, 7), this.seg(8, 5)), vinyl);
        thumbMitt.scale.set(1, 1.3, 0.8);
        thumbMitt.position.set(0.056, 0.01, 0.014);
        thumbMitt.rotation.z = -0.6;
        group.add(thumbMitt);
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, this.seg(4, 3), this.seg(18, 10)), tape);
        seam.rotation.y = Math.PI / 2;
        seam.position.y = 0.03;
        seam.scale.set(1, 1.1, 1);
        group.add(seam);
        // The split, and what is coming out of it.
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.02), stuffing);
        split.position.set(-0.02, 0.078, 0.03);
        split.rotation.z = 0.3;
        group.add(split);
        for (let i = 0; i < 3; i++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(8, 5), this.seg(6, 4)), stuffing);
          puff.position.set(-0.03 + i * 0.02, 0.086 + (i % 2) * 0.008, 0.034);
          group.add(puff);
        }
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.007, this.seg(4, 3), this.seg(12, 7)), tape);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.04 - i * 0.02;
          wrap.scale.z = 0.75;
          group.add(wrap);
        }
        const laceLoop = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, this.seg(4, 3), this.seg(9, 6)), tape);
        laceLoop.position.set(0, -0.086, 0.01);
        group.add(laceLoop);
        return group;
      },

      // ---- 575: Shoddy Knuckles -----------------------------------------------
      createShoddyKnucklesModel(weapon, rand) {
        const group = new THREE.Group();
        const pot = this._mat(0x8E8F92, { roughness: 0.8, metalness: 0.45 });
        const flash = this._mat(0xA8A9AC, { roughness: 0.9, metalness: 0.35 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013 });
        // Cast badly in one piece: the four holes are not the same size and
        // the flash was never filed off.
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.024, 0.016), pot);
        bar.position.set(0, 0.062, 0.026);
        group.add(bar);
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const r = 0.011 + (i % 2) * 0.002;
          const hole = new THREE.Mesh(new THREE.TorusGeometry(r, 0.005, this.seg(4, 3), this.seg(11, 7)), pot);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x, 0.062, 0.026);
          group.add(hole);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.009 + (i % 3) * 0.001, this.seg(8, 5), this.seg(6, 4)), pot);
          dome.position.set(x, 0.074, 0.026);
          group.add(dome);
        }
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.003, 0.018), flash);
        seam.position.set(0, 0.062, 0.026);
        group.add(seam);
        const sprue = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.012, this.seg(8, 5)), flash);
        sprue.rotation.z = Math.PI / 2;
        sprue.position.set(0.044, 0.062, 0.026);
        group.add(sprue);
        const palmBar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, this.seg(9, 6)), pot);
        palmBar.rotation.z = Math.PI / 2;
        palmBar.position.set(0, 0.04, 0.042);
        group.add(palmBar);
        return group;
      },

      // ---- 576: Key Knuckles --------------------------------------------------
      createKeyKnucklesModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._cast(0xB9902A);
        const steel = this._mat(0x9BA1A7, { roughness: 0.5, metalness: 0.85 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013 });
        // Not a weapon at all: a key between each finger, points out, which is
        // what everybody is told to do and nobody should.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(4, 3), this.seg(14, 8)), steel);
        ring.position.set(0, 0.03, 0.05);
        ring.rotation.x = 0.4;
        group.add(ring);
        const keys = this.isLowDetail() ? 3 : 4;
        for (let i = 0; i < keys; i++) {
          const x = -0.028 + i * 0.019;
          const shank = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.002), i % 2 ? brass : steel);
          shank.position.set(x, 0.082, 0.03);
          shank.rotation.z = (i - 1.5) * 0.08;
          group.add(shank);
          const bow = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.003, this.seg(4, 3), this.seg(10, 6)), i % 2 ? brass : steel);
          bow.position.set(x, 0.05, 0.03);
          group.add(bow);
          // The wards cut into the blade.
          for (let j = 0; j < 3; j++) {
            const ward = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.003), i % 2 ? brass : steel);
            ward.position.set(x + 0.003, 0.086 + j * 0.008, 0.03);
            group.add(ward);
          }
        }
        const fob = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.004), this._mat(0xC0392B, { roughness: 0.7, metalness: 0.05 }));
        fob.position.set(0.03, 0.014, 0.055);
        fob.userData.sway = { axis: 'z', amp: 0.25, freq: 1.3 };
        group.add(fob);
        return group;
      },

      // ---- 577: Golf Tee Glove ------------------------------------------------
      createGolfTeeGloveModel(weapon, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0xF0EDE4, { roughness: 0.75, metalness: 0.03 });
        const teeColor = this.getRandomColor(rand, [0xE8342B, 0xF5C518, 0x1E9B4B]);
        const tee = this._mat(teeColor, { roughness: 0.6, metalness: 0.05 });
        const velcro = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        // A golf glove with tees pushed through the knuckles from inside, which
        // is exactly as improvised as it sounds.
        this._fist(group, leather, { width: 0.082, knuckleR: 0.014 });
        const tees = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < tees; i++) {
          const x = -0.03 + i * 0.015;
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.004, 0.05, this.seg(7, 5)), tee);
          shaft.position.set(x, 0.078, 0.024);
          shaft.rotation.x = -0.35;
          group.add(shaft);
          // The cup caps the shaft it belongs to rather than sitting at a
          // guessed height: placed in group space it floated off the tilted
          // tee entirely.
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.003, 0.008, this.seg(9, 6)), tee);
          cup.position.set(0, 0.028, 0);
          shaft.add(cup);
        }
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.06), velcro);
        strap.position.set(0, -0.03, 0.008);
        group.add(strap);
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.004), velcro);
        tab.position.set(0.036, -0.03, 0.026);
        tab.rotation.y = 0.5;
        group.add(tab);
        // Ventilation holes across the back, as every golf glove has.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.052, this.seg(6, 4)), velcro);
            hole.rotation.x = Math.PI / 2;
            hole.position.set(-0.024 + (i % 3) * 0.024, 0.01 + Math.floor(i / 3) * 0.02, 0);
            group.add(hole);
          }
        }
        return group;
      },

      // ---- 578: Mirror Shard Fist ---------------------------------------------
      createMirrorShardFistModel(weapon, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0x2A2A2E, { roughness: 1.0, metalness: 0.0 });
        const mirror = this._mat(0xE8F0F6, { roughness: 0.02, metalness: 0.98 });
        const blood = this._mat(0x8B1A1A, { roughness: 0.6, metalness: 0.1 });
        // Broken mirror set into a wrapped hand, edges out. It cuts both ways
        // and the wraps show it.
        this._fist(group, cloth, { width: 0.08, knuckleR: 0.013, fingers: false });
        const shards = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < shards; i++) {
          const x = -0.034 + (i % 5) * 0.017;
          const y = 0.05 + Math.floor(i / 5) * 0.022;
          const sh = this._plate([
            [-0.008 - rand() * 0.004, 0], [0.008 + rand() * 0.004, 0.002],
            [0.004, 0.026 + rand() * 0.016], [-0.006, 0.02]
          ], 0.002, mirror);
          sh.position.set(x, y, 0.026);
          sh.rotation.set(-0.2, 0, (rand() - 0.5) * 0.8);
          group.add(sh);
        }
        // The bedding compound, and where it has gone through.
        const bed = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.016, 0.014), cloth);
        bed.position.set(0, 0.05, 0.026);
        group.add(bed);
        for (let i = 0; i < 3; i++) {
          const stain = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.004), blood);
          stain.position.set(-0.02 + i * 0.02, 0.03, 0.03);
          stain.rotation.z = rand();
          group.add(stain);
        }
        for (let i = 0; i < 5; i++) {
          const lap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, this.seg(4, 3), this.seg(12, 7)), cloth);
          lap.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.2, 0, 0);
          lap.position.y = -0.05 + i * 0.018;
          lap.scale.z = 0.7;
          group.add(lap);
        }
        return group;
      },

      // ---- 579: Glass Knuckles ------------------------------------------------
      createGlassKnucklesModel(weapon, rand) {
        const group = new THREE.Group();
        const glassColor = this.getRandomColor(rand, [0x2E6B3A, 0x2A4C6B, 0x6B4A22]);
        const glass = this._mat(glassColor, { roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.7 });
        const frost = this._mat(0xE8F0F6, { roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.6 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013 });
        // Cast in glass, which is beautiful and a very bad idea: it is already
        // starting to craze.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.026, 0.018), glass);
        body.position.set(0, 0.062, 0.026);
        group.add(body);
        for (let i = 0; i < 4; i++) {
          const x = -0.028 + i * 0.019;
          const hole = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.005, this.seg(4, 3), this.seg(11, 7)), glass);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x, 0.062, 0.026);
          group.add(hole);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(9, 6), this.seg(7, 5)), glass);
          dome.position.set(x, 0.076, 0.026);
          group.add(dome);
        }
        // The crazing, which will finish the job for whoever swings it.
        const cracks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < cracks; i++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.018 + rand() * 0.012, 0.02), frost);
          c.position.set(-0.03 + rand() * 0.06, 0.062, 0.026);
          c.rotation.z = (rand() - 0.5) * 1.4;
          group.add(c);
        }
        const gleam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.02), frost);
        gleam.position.set(0, 0.07, 0.028);
        group.add(gleam);
        return group;
      },

      // ---- 580: Seed Glove ----------------------------------------------------
      createSeedGloveModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x5B4227);
        const leafColor = this.getRandomColor(rand, [0x4E9A3A, 0x6BBF48]);
        const leaf = this._mat(leafColor, { roughness: 0.6, metalness: 0.05 });
        const husk = this._mat(0xC8A02A, { roughness: 0.55, metalness: 0.1 });
        const sap = this._glow(0xB8FF5A, 0.8);
        // Bark grown over the hand, with a seed at each knuckle and one about
        // to sprout.
        this._fist(group, bark, { width: 0.082, knuckleR: 0.015 });
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const pod = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(10, 6), this.seg(7, 5)), husk);
          pod.scale.y = 1.3;
          pod.position.set(x, 0.072, 0.018);
          group.add(pod);
          const glowSeed = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), sap);
          glowSeed.position.set(x, 0.072, 0.024);
          glowSeed.userData.pulse = { min: 0.2, max: 1.1, freq: 0.9, phase: i * 0.7 };
          group.add(glowSeed);
        }
        // Vines round the wrist, and a shoot coming out of the back.
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.033 - i * 0.001, 0.004, this.seg(4, 3), this.seg(12, 7)), leaf);
          coil.rotation.set(Math.PI / 2 + 0.2, 0, i * 0.6);
          coil.position.y = -0.03 - i * 0.016;
          coil.scale.z = 0.72;
          group.add(coil);
        }
        const shoot = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.06, this.seg(7, 5)), leaf);
        shoot.position.set(-0.02, 0.05, -0.03);
        shoot.rotation.set(-0.5, 0, 0.3);
        shoot.userData.sway = { axis: 'z', amp: 0.16, freq: 1.2 };
        group.add(shoot);
        for (let i = 0; i < 2; i++) {
          const l = this._plate([[0, 0], [0.018, 0.012], [0.026, 0.036], [0.004, 0.028]], 0.003, leaf);
          l.position.set(-0.022 - i * 0.008, 0.086 + i * 0.012, -0.04);
          l.rotation.set(0, i * 1.2, 0.4);
          l.userData.sway = { axis: 'z', amp: 0.16, freq: 1.1, phase: i };
          group.add(l);
        }
        return group;
      },

      // ---- 581: Cestus --------------------------------------------------------
      createCestusModel(weapon, rand) {
        const group = new THREE.Group();
        const leather = this._wood(0x8A6236);
        const iron = this._mat(0x5A5F66, { roughness: 0.6, metalness: 0.78 });
        const linen = this._mat(0xD8CFA8, { roughness: 1.0, metalness: 0.0 });
        // The Roman version: leather thongs up the forearm and iron studs set
        // into the striking surface.
        this._fist(group, leather, { width: 0.082, knuckleR: 0.014, cuff: 0.02 });
        const studs = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < studs; i++) {
          const x = -0.03 + (i % 4) * 0.02;
          const y = 0.058 + Math.floor(i / 4) * 0.018;
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), iron);
          stud.position.set(x, y, 0.026);
          group.add(stud);
        }
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.03, 0.01), iron);
        plate.position.set(0, 0.06, 0.024);
        group.add(plate);
        // The thongs, crossing all the way up the forearm.
        const thongs = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < thongs; i++) {
          const t = i / thongs;
          for (const s of [-1, 1]) {
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.004), leather);
            strap.position.set(0, -0.045 - t * 0.12, 0.02);
            strap.rotation.z = s * 0.5;
            strap.rotation.x = 0.1;
            group.add(strap);
          }
        }
        for (let i = 0; i < 3; i++) {
          const pad = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, this.seg(4, 3), this.seg(12, 7)), linen);
          pad.rotation.x = Math.PI / 2;
          pad.position.y = -0.05 - i * 0.05;
          pad.scale.z = 0.7;
          group.add(pad);
        }
        return group;
      },

      // ---- 582: Knuckle Dusters -----------------------------------------------
      createKnuckleDustersModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        const grip = this._mat(0x1A1A1C, { roughness: 0.9, metalness: 0.05 });
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013 });
        // Machined rather than cast: four even holes, a proper palm bar and
        // sharp domes.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.022, 0.016), steel);
        frame.position.set(0, 0.062, 0.026);
        group.add(frame);
        for (let i = 0; i < 4; i++) {
          const x = -0.029 + i * 0.0193;
          const hole = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0048, this.seg(4, 3), this.seg(12, 7)), steel);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x, 0.062, 0.026);
          group.add(hole);
          const dome = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.014, this.seg(8, 5)), steel);
          dome.position.set(x, 0.079, 0.026);
          group.add(dome);
        }
        const palmBar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.066, this.seg(11, 7)), steel);
        palmBar.rotation.z = Math.PI / 2;
        palmBar.position.set(0, 0.042, 0.042);
        group.add(palmBar);
        for (let i = 0; i < 3; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, this.seg(4, 3), this.seg(10, 6)), grip);
          wrap.rotation.y = Math.PI / 2;
          wrap.position.set(-0.016 + i * 0.016, 0.042, 0.042);
          group.add(wrap);
        }
        return group;
      },

      // ---- 583: Brass Knuckles ------------------------------------------------
      createBrassKnucklesModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC9A227, { roughness: 0.22, metalness: 0.94 });
        const worn = this._cast(0x9A7A1A);
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013 });
        // The classic: rounded domes, a shaped palm swell and the polish worn
        // off wherever it has been used.
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.024, 0.016), brass);
        frame.position.set(0, 0.062, 0.026);
        group.add(frame);
        for (let i = 0; i < 4; i++) {
          const x = -0.029 + i * 0.0193;
          const hole = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.005, this.seg(4, 3), this.seg(12, 7)), brass);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x, 0.062, 0.026);
          group.add(hole);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(7, 5)), i === 1 || i === 2 ? worn : brass);
          dome.scale.y = 0.85;
          dome.position.set(x, 0.078, 0.026);
          group.add(dome);
        }
        const swell = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(11, 7), this.seg(8, 5)), brass);
        swell.scale.set(1.7, 0.7, 0.6);
        swell.position.set(0, 0.042, 0.044);
        group.add(swell);
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.018, this.seg(8, 5)), brass);
        spur.position.set(-0.042, 0.056, 0.026);
        spur.rotation.z = 1.2;
        group.add(spur);
        return group;
      },

      // ---- 584: Phantom Tickle Gloves -----------------------------------------
      createPhantomTickleGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const silk = this._mat(0xE8E4F0, { roughness: 0.4, metalness: 0.1, transparent: true, opacity: 0.65 });
        const ghostColor = this.getRandomColor(rand, [0xC77DFF, 0x7DD3FF]);
        const ghost = this._glow(ghostColor, 0.9);
        // A silk glove with more fingers than a hand has, and the extra ones
        // are not quite there.
        this._fist(group, silk, { width: 0.08, knuckleR: 0.013 });
        const phantoms = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < phantoms; i++) {
          const x = -0.04 + i * 0.016;
          const f = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.07, this.seg(7, 5)),
            this._mat(ghostColor, { roughness: 0.3, metalness: 0.05, emissive: ghostColor, emissiveIntensity: 0.8, transparent: true, opacity: 0.4 }));
          f.position.set(x, 0.09, 0.03);
          f.rotation.set(-0.3, 0, (i - 2.5) * 0.14);
          f.userData.sway = { axis: 'z', amp: 0.2, freq: 1.4 + i * 0.2, phase: i * 0.9 };
          f.userData.pulse = { min: 0.1, max: 1.0, freq: 1.2, phase: i * 0.8 };
          group.add(f);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), ghost);
          tip.position.set(x, 0.125, 0.038);
          tip.userData.orbit = { radius: 0.008, speed: 1.2 + i * 0.3, phase: i * 1.1, plane: 'xz' };
          tip.userData.pulse = { min: 0.2, max: 1.3, freq: 2.0, phase: i };
          group.add(tip);
        }
        const cuffGlow = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.003, this.seg(4, 3), this.seg(14, 8)), ghost);
        cuffGlow.rotation.x = Math.PI / 2;
        cuffGlow.position.y = -0.06;
        cuffGlow.scale.z = 0.72;
        cuffGlow.userData.pulse = { min: 0.2, max: 1.0, freq: 0.8 };
        group.add(cuffGlow);
        return group;
      },

      // ---- 585: Arm Bracers ---------------------------------------------------
      createArmBracersModel(weapon, rand) {
        const group = new THREE.Group();
        const leather = this._wood(0x5C3317);
        const iron = this._mat(0x5A5F66, { roughness: 0.6, metalness: 0.78 });
        const brass = this._cast(0xB9902A);
        // Not a glove: a forearm guard, meant to be blocked with. The hand is
        // bare and the plates run past the elbow.
        this._fist(group, leather, { width: 0.078, knuckleR: 0.013, cuff: 0.02 });
        const plates = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < plates; i++) {
          const t = i / plates;
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.034 + t * 0.004, 0.033 + t * 0.004, 0.03, this.seg(12, 7), 1, true, -1.1, 2.2), iron);
          plate.position.y = -0.06 - t * 0.032;
          plate.scale.z = 0.8;
          group.add(plate);
          const edge = new THREE.Mesh(new THREE.TorusGeometry(0.034 + t * 0.004, 0.003, this.seg(4, 3), this.seg(12, 7), 2.2), brass);
          edge.rotation.set(Math.PI / 2, 0, -1.1);
          edge.position.y = -0.046 - t * 0.032;
          edge.scale.z = 0.8;
          group.add(edge);
        }
        // The straps that hold them, buckled on the inside. They are spaced
        // along the plate stack itself, which is much shorter than the arm:
        // spacing them by a fixed step left two of them hanging in the air
        // below the guard.
        const plateRun = 0.032 * (plates - 1) / plates;
        for (let i = 0; i < 3; i++) {
          const y = -0.06 - (i / 2) * plateRun;
          const strap = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.005, this.seg(4, 3), this.seg(12, 7)), leather);
          strap.rotation.x = Math.PI / 2;
          strap.position.y = y;
          strap.scale.z = 0.8;
          group.add(strap);
          const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.004), brass);
          buckle.position.set(0, y, -0.028);
          group.add(buckle);
        }
        return group;
      },

      // ---- 586: Iron Knuckles -------------------------------------------------
      createIronKnucklesModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x4A4F55, { roughness: 0.7, metalness: 0.68 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.3 });
        const leather = this._wood(0x3A2A1C);
        // Forged rather than cast: hammer marks all over it, and a wrapped bar
        // instead of a shaped palm swell.
        this._fist(group, leather, { width: 0.082, knuckleR: 0.014 });
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.026, 0.018), iron);
        frame.position.set(0, 0.062, 0.026);
        group.add(frame);
        for (let i = 0; i < 4; i++) {
          const x = -0.029 + i * 0.0193;
          const hole = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.006, this.seg(4, 3), this.seg(11, 7)), iron);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x, 0.062, 0.026);
          group.add(hole);
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.02, 4), iron);
          spike.position.set(x, 0.082, 0.026);
          group.add(spike);
        }
        // Hammer facets and rust in the pits.
        const facets = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < facets; i++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.02), iron);
          f.position.set(-0.03 + rand() * 0.06, 0.062 + (rand() - 0.5) * 0.014, 0.027);
          f.rotation.z = (rand() - 0.5) * 0.6;
          group.add(f);
        }
        for (let i = 0; i < 3; i++) {
          const patch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.019), rust);
          patch.position.set(-0.026 + i * 0.026, 0.052, 0.026);
          group.add(patch);
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.068, this.seg(10, 6)), iron);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.04, 0.044);
        group.add(bar);
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.003, this.seg(4, 3), this.seg(10, 6)), leather);
          wrap.rotation.y = Math.PI / 2;
          wrap.position.set(-0.024 + i * 0.016, 0.04, 0.044);
          group.add(wrap);
        }
        return group;
      },

      // ---- 587: Metal Man -----------------------------------------------------
      createMetalManModel(weapon, rand) {
        const group = new THREE.Group();
        const plate = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const dark = this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.7 });
        const rivet = this._cast(0xB9902A);
        // A full articulated gauntlet: lames over the fingers, a cuff over the
        // wrist, and rivets everywhere.
        this._fist(group, plate, { width: 0.09, knuckleR: 0.016, fingers: false, cuff: 0.03, cuffMat: dark });
        // Finger lames: three segments per finger, stepping down.
        for (let f = 0; f < 4; f++) {
          const x = -0.032 + f * 0.021;
          for (let s = 0; s < 3; s++) {
            const lame = new THREE.Mesh(new THREE.BoxGeometry(0.019 - s * 0.002, 0.012, 0.016), plate);
            lame.position.set(x, 0.058 - s * 0.006, 0.03 + s * 0.014);
            lame.rotation.x = 0.4 + s * 0.25;
            group.add(lame);
          }
        }
        const knuckleGuard = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.018, 0.024), plate);
        knuckleGuard.position.set(0, 0.07, 0.014);
        group.add(knuckleGuard);
        for (let i = 0; i < 4; i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, this.seg(6, 4)), plate);
          spike.position.set(-0.032 + i * 0.021, 0.084, 0.014);
          group.add(spike);
        }
        // The cuff, flared, with a rolled edge.
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.06, this.seg(13, 8)), plate);
        cuff.position.y = -0.08;
        cuff.scale.z = 0.78;
        group.add(cuff);
        const rolled = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, this.seg(4, 3), this.seg(14, 8)), plate);
        rolled.rotation.x = Math.PI / 2;
        rolled.position.y = -0.108;
        rolled.scale.z = 0.78;
        group.add(rolled);
        const rivets = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < rivets; i++) {
          const a = (i / rivets) * Math.PI * 2;
          const r = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), rivet);
          r.position.set(Math.cos(a) * 0.038, -0.06, Math.sin(a) * 0.03);
          group.add(r);
        }
        return group;
      },

      // ---- 588: Flying Kicks --------------------------------------------------
      createFlyingKicksModel(weapon, rand) {
        const group = new THREE.Group();
        const leatherColor = this.getRandomColor(rand, [0xF0EDE4, 0xC0392B, 0x1D6FD6]);
        const leather = this._mat(leatherColor, { roughness: 0.65, metalness: 0.05 });
        const sole = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const lace = this._mat(0xE8E2D2, { roughness: 1.0, metalness: 0.0 });
        const steel = this._mat(0x9BA1A7, { roughness: 0.4, metalness: 0.88 });
        // Not a glove at all: a boot, because the weapon type had to put it
        // somewhere. Steel toe, and it has been landed on.
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.15), leather);
        upper.position.set(0, 0.02, 0.02);
        group.add(upper);
        const toeBox = new THREE.Mesh(new THREE.SphereGeometry(0.038, this.seg(12, 7), this.seg(9, 6)), leather);
        toeBox.scale.set(0.92, 0.75, 1.1);
        toeBox.position.set(0, 0.008, 0.1);
        group.add(toeBox);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.036, this.seg(12, 7), this.seg(9, 6), 0, Math.PI * 2, 0, Math.PI / 2), steel);
        cap.scale.set(0.92, 0.8, 1.1);
        cap.rotation.x = -0.3;
        cap.position.set(0, 0.008, 0.11);
        group.add(cap);
        const soleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.018, 0.24), sole);
        soleMesh.position.set(0, -0.02, 0.04);
        group.add(soleMesh);
        // Tread blocks, worn unevenly.
        const treads = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < treads; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.018), sole);
          t.position.set(0, -0.031, -0.06 + i * 0.028);
          group.add(t);
        }
        const heel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.024, 0.05), sole);
        heel.position.set(0, -0.03, -0.05);
        group.add(heel);
        // Laces and eyelets up the tongue.
        // The lacing is spread over the length of the upper rather than
        // stepped by a fixed amount: the last eyelet used to sit past the
        // front of the boot, in the air over the toe.
        const eyelets = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < eyelets; i++) {
          const lz = 0.005 + (i / (eyelets - 1)) * 0.076;
          for (const s of [-1, 1]) {
            const e = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0015, this.seg(4, 3), this.seg(8, 5)), steel);
            e.position.set(s * 0.026, 0.05, lz);
            e.rotation.x = Math.PI / 2;
            group.add(e);
          }
          const cross = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.003, 0.003), lace);
          cross.position.set(0, 0.052, lz + 0.009);
          cross.rotation.y = (i % 2 ? 1 : -1) * 0.3;
          group.add(cross);
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.032, 0.05, this.seg(12, 7)), leather);
        collar.position.set(0, 0.07, -0.03);
        collar.scale.z = 0.85;
        group.add(collar);
        return group;
      },

      // ---- 589: Adamantine Fists ----------------------------------------------
      createAdamantineFistsModel(weapon, rand) {
        const group = new THREE.Group();
        const adamant = this._mat(0x3A4048, { roughness: 0.12, metalness: 0.98 });
        const edge = this._mat(0xC8CED4, { roughness: 0.08, metalness: 0.99 });
        const dark = this._mat(0x14161A, { roughness: 0.5, metalness: 0.7 });
        // Solid, faceted, and heavier than the arm wearing it: the plates are
        // cut rather than formed, so every surface is flat.
        this._fist(group, adamant, { width: 0.088, knuckleR: 0.016, fingers: false, cuff: 0.03 });
        for (let f = 0; f < 4; f++) {
          const x = -0.031 + f * 0.0207;
          const block = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 0), adamant);
          block.scale.set(1, 0.8, 1.1);
          block.position.set(x, 0.066, 0.02);
          group.add(block);
          const face = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, 0.006), edge);
          face.position.set(x, 0.072, 0.032);
          face.rotation.x = -0.3;
          group.add(face);
        }
        const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.08, 6), adamant);
        bracer.position.y = -0.086;
        bracer.scale.z = 0.8;
        group.add(bracer);
        const facets = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < facets; i++) {
          const a = (i / facets) * Math.PI * 2;
          const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.08, 0.008), edge);
          ridge.position.set(Math.cos(a) * 0.038, -0.086, Math.sin(a) * 0.03);
          ridge.rotation.y = -a;
          group.add(ridge);
        }
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.008), dark);
        core.position.set(0, 0.02, 0.03);
        group.add(core);
        return group;
      },

      // ---- 590: Shock Gauntlets -----------------------------------------------
      createShockGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2E3238, { roughness: 0.45, metalness: 0.8 });
        const copper = this._mat(0xB87333, { roughness: 0.3, metalness: 0.9 });
        const insul = this._mat(0x1A1A1C, { roughness: 0.9, metalness: 0.05 });
        const arc = this._glow(0x9CE4FF, 1.4);
        this._fist(group, shell, { width: 0.088, knuckleR: 0.015, fingers: false, cuff: 0.028, cuffMat: insul });
        // Electrodes at the knuckles with the discharge jumping between them.
        for (let i = 0; i < 4; i++) {
          const x = -0.031 + i * 0.0207;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.024, this.seg(9, 6)), copper);
          post.position.set(x, 0.074, 0.02);
          group.add(post);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), copper);
          tip.position.set(x, 0.09, 0.02);
          group.add(tip);
        }
        const arcs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < arcs; i++) {
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.003), arc);
          bolt.position.set(-0.02 + i * 0.0207, 0.092, 0.02);
          bolt.rotation.z = (i % 2 ? 1 : -1) * 0.5;
          bolt.userData.pulse = { min: 0.0, max: 1.8, freq: 8 + i * 2, phase: i * 1.7 };
          group.add(bolt);
        }
        // Coil and capacitor on the forearm.
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.07, this.seg(12, 7)), insul);
        can.position.y = -0.085;
        can.scale.z = 0.8;
        group.add(can);
        const windings = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < windings; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(14, 8)), copper);
          coil.rotation.x = Math.PI / 2;
          coil.position.y = -0.06 - i * 0.014;
          coil.scale.z = 0.8;
          group.add(coil);
        }
        const meter = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.004), arc);
        meter.position.set(0, -0.05, 0.026);
        meter.userData.pulse = { min: 0.2, max: 1.2, freq: 1.6 };
        group.add(meter);
        return group;
      },

      // ---- 591: Mithril Strike Gloves -----------------------------------------
      createMithrilStrikeGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const mithril = this._mat(0xEAF1F6, { roughness: 0.08, metalness: 0.96 });
        const veinColor = this.getRandomColor(rand, [0xAEE8FF, 0xD6C4FF, 0xC2FFE4]);
        const vein = this._glow(veinColor, 0.9);
        const mesh = this._mat(0xDCE4EA, { roughness: 0.35, metalness: 0.7 });
        // Mail rather than plate: rings so fine they read as cloth, with light
        // running through the seams.
        this._fist(group, mesh, { width: 0.084, knuckleR: 0.014, cuff: 0.026 });
        const rings = this.isLowDetail() ? 8 : 16;
        for (let i = 0; i < rings; i++) {
          const a = (i / rings) * Math.PI * 2;
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, this.seg(4, 3), this.seg(8, 5)), mithril);
          r.position.set(Math.cos(a) * 0.036, 0.02 + Math.sin(a) * 0.03, 0.024);
          r.rotation.set(Math.PI / 2, i % 2 ? Math.PI / 2 : 0, 0);
          group.add(r);
        }
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.008), mithril);
          plate.position.set(x, 0.07, 0.022);
          group.add(plate);
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.01), vein);
          seam.position.set(x, 0.077, 0.022);
          seam.userData.pulse = { min: 0.15, max: 1.2, freq: 1.4, phase: -i * 0.6 };
          group.add(seam);
        }
        const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.004, this.seg(4, 3), this.seg(16, 9)), mithril);
        cuffRing.rotation.x = Math.PI / 2;
        cuffRing.position.y = -0.07;
        cuffRing.scale.z = 0.76;
        group.add(cuffRing);
        const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.002, this.seg(4, 3), this.seg(16, 9)), vein);
        glowRing.rotation.x = Math.PI / 2;
        glowRing.position.y = -0.062;
        glowRing.scale.z = 0.76;
        glowRing.userData.pulse = { min: 0.2, max: 1.0, freq: 0.9 };
        group.add(glowRing);
        return group;
      },

      // ---- 592: Sonic Gauntlet ------------------------------------------------
      createSonicGauntletModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xB0B6BC, { roughness: 0.25, metalness: 0.92 });
        const dark = this._mat(0x24262A, { roughness: 0.6, metalness: 0.7 });
        const tone = this._glow(0x9CE4FF, 1.0);
        this._fist(group, shell, { width: 0.088, knuckleR: 0.015, fingers: false, cuff: 0.03, cuffMat: dark });
        // A driver in the palm and a horn round it: the punch is the pressure
        // wave, not the fist.
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.05, this.seg(14, 8), 1, true), shell);
        horn.rotation.x = -Math.PI / 2;
        horn.position.set(0, 0.03, 0.05);
        group.add(horn);
        const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, this.seg(14, 8)), dark);
        driver.rotation.x = Math.PI / 2;
        driver.position.set(0, 0.03, 0.03);
        group.add(driver);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.008, 0.016, this.seg(14, 8)), tone);
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(0, 0.03, 0.04);
        cone.userData.pulse = { min: 0.3, max: 1.3, freq: 2.4 };
        group.add(cone);
        const waves = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < waves; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05 + i * 0.014, 0.002, this.seg(4, 3), this.seg(16, 9)), tone);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(0, 0.03, 0.08 + i * 0.02);
          ring.userData.pulse = { min: 0.0, max: 1.2, freq: 1.8, phase: -i * 0.8 };
          group.add(ring);
        }
        // Resonator tubes down the forearm, each a different length.
        for (let i = 0; i < 3; i++) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06 - i * 0.014, this.seg(9, 6)), shell);
          tube.position.set(-0.02 + i * 0.02, -0.08 + i * 0.008, -0.02);
          group.add(tube);
          const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, this.seg(10, 6)), tone);
          mouth.position.set(-0.02 + i * 0.02, -0.05 + i * 0.015, -0.02);
          mouth.userData.pulse = { min: 0.1, max: 1.1, freq: 3.0 + i, phase: i };
          group.add(mouth);
        }
        return group;
      }
,

      // ---- 593: Thunder Lizard Gauntlets --------------------------------------
      createThunderLizardGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x3A6B4A, 0x6B4A3A, 0x3A4A6B]);
        const hide = this._mat(hideColor, { roughness: 0.55, metalness: 0.25 });
        const horn = this._mat(0x2A241C, { roughness: 0.65, metalness: 0.15 });
        const arc = this._glow(0x9CE4FF, 1.2);
        // Scaled hide over the hand, claws instead of knuckles, and the charge
        // the beast carried still running through it.
        this._fist(group, hide, { width: 0.088, knuckleR: 0.015, fingers: false, cuff: 0.03, cuffMat: horn });
        for (let f = 0; f < 4; f++) {
          const x = -0.031 + f * 0.0207;
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, this.seg(7, 5)), horn);
          claw.position.set(x, 0.076, 0.034);
          claw.rotation.x = 0.7;
          group.add(claw);
        }
        // Scale rows over the back of the hand and up the cuff.
        const rows = this.isLowDetail() ? 3 : 5;
        for (let r = 0; r < rows; r++) {
          const per = 4 - (r % 2);
          for (let i = 0; i < per; i++) {
            const sc = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.016, 3), hide);
            sc.position.set(-0.03 + i * 0.02 + (r % 2) * 0.01, 0.05 - r * 0.024, 0.026);
            sc.rotation.x = -Math.PI / 2;
            sc.scale.z = 0.4;
            group.add(sc);
          }
        }
        // The spines sit along the cuff. Stepped down the forearm they ran
        // off the end of the model and hung in the air below the hand.
        const spines = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < spines; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(6, 4)), horn);
          sp.position.set(0.036, -0.022 - (i / Math.max(1, spines - 1)) * 0.024, 0);
          sp.rotation.z = -1.2;
          group.add(sp);
        }
        const bolts = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < bolts; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), arc);
          b.position.set(-0.02 + i * 0.018, 0.05 - i * 0.02, 0.034);
          b.rotation.z = (i % 2 ? 1 : -1) * 0.6;
          b.userData.pulse = { min: 0.0, max: 1.7, freq: 6 + i * 2, phase: i * 1.5 };
          group.add(b);
        }
        return group;
      },

      // ---- 594: Lightning Elemental Fists -------------------------------------
      createLightningElementalFistsModel(weapon, rand) {
        const group = new THREE.Group();
        const boltColor = this.getRandomColor(rand, [0x9CE4FF, 0xFFE89C]);
        const bolt = this._glow(boltColor, 1.5);
        const husk = this._mat(0x2A2E38, { roughness: 0.5, metalness: 0.6, transparent: true, opacity: 0.5 });
        // Barely a glove: a shell of charged air in the shape of a fist, with
        // the discharge doing the holding.
        this._fist(group, husk, { width: 0.082, knuckleR: 0.014, fingers: false, cuff: 0.024 });
        const nodes = this.isLowDetail() ? 5 : 9;
        const pts = [];
        for (let i = 0; i < nodes; i++) {
          const a = (i / nodes) * Math.PI * 2;
          const r = 0.04 + (i % 2) * 0.01;
          pts.push(new THREE.Vector3(Math.cos(a) * r, 0.03 + Math.sin(a) * r * 0.8, 0.02));
        }
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const d = b.clone().sub(a);
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, d.length(), this.seg(5, 3)), bolt);
          seg.position.copy(a).add(b).multiplyScalar(0.5);
          seg.quaternion.setFromUnitVectors(up, d.clone().normalize());
          seg.userData.pulse = { min: 0.0, max: 1.7, freq: 5 + i, phase: i * 1.3 };
          group.add(seg);
          const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), bolt);
          node.position.copy(a);
          node.userData.pulse = { min: 0.2, max: 1.5, freq: 3.0, phase: i * 0.8 };
          group.add(node);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(9, 6)), bolt);
        core.position.set(0, 0.03, 0.02);
        core.userData.pulse = { min: 0.5, max: 1.6, freq: 2.0 };
        group.add(core);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.002, this.seg(4, 3), this.seg(16, 9)), bolt);
        halo.position.set(0, 0.03, 0.02);
        halo.rotation.x = 0.5;
        halo.userData.spin = { axis: 'y', speed: 2.0 };
        group.add(halo);
        return group;
      },

      // ---- 595: Force Crush Gloves --------------------------------------------
      createForceCrushGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE4E8EC, { roughness: 0.3, metalness: 0.45 });
        const dark = this._mat(0x1E2126, { roughness: 0.6, metalness: 0.65 });
        const fieldColor = this.getRandomColor(rand, [0x7DD3FF, 0xC77DFF]);
        const field = this._glow(fieldColor, 1.2);
        // Emitters in the palm and at each fingertip: what closes is not the
        // hand, and what it closes on is somewhere else.
        this._fist(group, shell, { width: 0.082, knuckleR: 0.013, cuff: 0.026, cuffMat: dark });
        const palmRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, this.seg(4, 3), this.seg(14, 8)), dark);
        palmRing.rotation.x = Math.PI / 2;
        palmRing.position.set(0, 0.03, 0.036);
        group.add(palmRing);
        const palmCore = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(11, 7), this.seg(8, 5)), field);
        palmCore.position.set(0, 0.03, 0.036);
        palmCore.userData.pulse = { min: 0.4, max: 1.4, freq: 1.4 };
        group.add(palmCore);
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), field);
          emitter.position.set(x, 0.046, 0.05);
          emitter.userData.pulse = { min: 0.1, max: 1.3, freq: 1.8, phase: i * 0.7 };
          group.add(emitter);
        }
        // The field itself: rings closing inward on the crush point.
        const rings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05 - i * 0.01, 0.002, this.seg(4, 3), this.seg(16, 9)), field);
          ring.position.set(0, 0.03, 0.075 + i * 0.012);
          ring.rotation.x = Math.PI / 2;
          ring.userData.pulse = { min: 0.0, max: 1.2, freq: 1.6, phase: i * 0.9 };
          ring.userData.spin = { axis: 'y', speed: (i % 2 ? 1 : -1) * 0.9 };
          group.add(ring);
        }
        const controller = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.02), dark);
        controller.position.set(0, -0.05, 0.02);
        group.add(controller);
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.002), field);
        readout.position.set(0, -0.05, 0.032);
        readout.userData.pulse = { min: 0.2, max: 1.0, freq: 2.4 };
        group.add(readout);
        return group;
      },

      // ---- 596: Nightmare Gauntlets -------------------------------------------
      createNightmareGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const chitin = this._mat(0x1A1420, { roughness: 0.35, metalness: 0.5 });
        const bone = this._mat(0xD8CFBA, { roughness: 0.72, metalness: 0.04 });
        const eyeColor = this.getRandomColor(rand, [0xFF3A5A, 0xB86BFF]);
        const eyeMat = this._glow(eyeColor, 1.2);
        const smoke = this._mat(0x2A2434, { roughness: 1.0, metalness: 0, transparent: true, opacity: 0.45 });
        // Chitin, too many claws, and eyes on the back of the hand that open
        // and close at their own rate.
        this._fist(group, chitin, { width: 0.088, knuckleR: 0.015, fingers: false, cuff: 0.03 });
        for (let f = 0; f < 4; f++) {
          const x = -0.031 + f * 0.0207;
          for (let j = 0; j < 2; j++) {
            const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008 - j * 0.002, 0.045 - j * 0.012, this.seg(6, 4)), bone);
            claw.position.set(x + (j ? 0.006 : 0), 0.074 + j * 0.006, 0.03 + j * 0.008);
            claw.rotation.set(0.6 + j * 0.3, 0, (j ? 0.3 : -0.1));
            group.add(claw);
          }
        }
        const eyes = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < eyes; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(9, 6), this.seg(7, 5)), eyeMat);
          e.position.set(-0.026 + (i % 3) * 0.026, 0.03 - Math.floor(i / 3) * 0.024, 0.028);
          e.userData.pulse = { min: 0.0, max: 1.4, freq: 0.5 + i * 0.2, phase: i * 1.6 };
          group.add(e);
          const lid = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, this.seg(4, 3), this.seg(10, 6)), chitin);
          lid.position.copy(e.position);
          group.add(lid);
        }
        // Smoke coming off the cuff, which never stops.
        const wisps = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < wisps; i++) {
          const w = new THREE.Mesh(new THREE.ConeGeometry(0.016 - i * 0.002, 0.05, this.seg(6, 4)), smoke);
          w.position.set((rand() - 0.5) * 0.05, -0.09 - i * 0.02, -0.01);
          w.userData.sway = { axis: 'z', amp: 0.3, freq: 0.6 + rand() * 0.4, phase: i };
          w.userData.bob = { axis: 'y', amp: 0.02, freq: 0.5, phase: i * 1.3 };
          group.add(w);
        }
        return group;
      },

      // ---- 597: Arcane Shield Gauntlets ---------------------------------------
      createArcaneShieldGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.88 });
        const dark = this._mat(0x24262A, { roughness: 0.6, metalness: 0.6 });
        const wardColor = this.getRandomColor(rand, [0x7DD3FF, 0xFFD37D]);
        const ward = this._glow(wardColor, 1.0);
        // Made to block: plates on the forearm and a disc of standing sigils
        // that turns in front of the fist.
        this._fist(group, steel, { width: 0.086, knuckleR: 0.015, fingers: false, cuff: 0.03, cuffMat: dark });
        const bossPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.014, this.seg(14, 8)), steel);
        bossPlate.rotation.x = Math.PI / 2;
        bossPlate.position.set(0, 0.03, 0.05);
        group.add(bossPlate);
        const segs = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          const plate = this._plate([[-0.016, -0.024], [0.016, -0.024], [0.02, 0.006], [0, 0.03], [-0.02, 0.006]], 0.004, steel);
          plate.position.set(Math.cos(a) * 0.055, 0.03 + Math.sin(a) * 0.055, 0.056);
          plate.rotation.z = a - Math.PI / 2;
          plate.userData.orbit = { radius: 0.055, speed: 0.5, phase: a, plane: 'xy' };
          group.add(plate);
          const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.005), ward);
          glyph.position.set(Math.cos(a) * 0.055, 0.03 + Math.sin(a) * 0.055, 0.06);
          glyph.rotation.z = a;
          glyph.userData.orbit = { radius: 0.055, speed: 0.5, phase: a, plane: 'xy' };
          glyph.userData.pulse = { min: 0.1, max: 1.2, freq: 1.4, phase: i * 0.7 };
          group.add(glyph);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(8, 5)), ward);
        core.position.set(0, 0.03, 0.058);
        core.userData.pulse = { min: 0.4, max: 1.2, freq: 0.9 };
        group.add(core);
        for (let i = 0; i < 3; i++) {
          const lame = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.026, this.seg(12, 7), 1, true, -1.2, 2.4), steel);
          lame.position.y = -0.07 - i * 0.03;
          lame.scale.z = 0.8;
          group.add(lame);
        }
        return group;
      },

      // ---- 598: Metamorphic Gauntlets -----------------------------------------
      createMetamorphicGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xA8AEB4, { roughness: 0.24, metalness: 0.94 });
        const dark = this._mat(0x24262A, { roughness: 0.5, metalness: 0.8 });
        const seamColor = this.getRandomColor(rand, [0x4FE3FF, 0xFF8A4F]);
        const seam = this._glow(seamColor, 1.0);
        // It has not settled on a shape: the plates keep sliding over each
        // other and something different surfaces every few seconds.
        this._fist(group, dark, { width: 0.086, knuckleR: 0.015, fingers: false, cuff: 0.03 });
        const plates = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < plates; i++) {
          const t = i / (plates - 1);
          const w = 0.05 - Math.abs(t - 0.5) * 0.03;
          const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, 0.02), i % 2 ? alloy : dark);
          p.position.set(0, 0.075 - i * 0.02, 0.024);
          p.userData.spin = { axis: 'z', speed: (i % 2 ? 0.3 : -0.45) * (0.5 + t) };
          p.userData.bob = { axis: 'x', amp: 0.006, freq: 0.8, phase: i * 0.7 };
          group.add(p);
          const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.002, 0.022), seam);
          line.position.set(0, 0.075 - i * 0.02, 0.024);
          line.userData.pulse = { min: 0.1, max: 1.2, freq: 1.3, phase: i * 0.6 };
          group.add(line);
        }
        // Whatever it currently thinks a weapon is: a blade, half formed.
        const blade = this._plate([[-0.012, 0], [0.012, 0], [0.006, 0.07], [-0.006, 0.07]], 0.008, alloy);
        blade.position.set(0, 0.09, 0.03);
        blade.userData.spin = { axis: 'y', speed: 0.6 };
        blade.userData.pulse = { min: 0.4, max: 1.0, freq: 0.5 };
        group.add(blade);
        const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, this.seg(4, 3), this.seg(16, 9)), alloy);
        cuffRing.rotation.x = Math.PI / 2;
        cuffRing.position.y = -0.078;
        cuffRing.scale.z = 0.78;
        cuffRing.userData.spin = { axis: 'y', speed: 0.4 };
        group.add(cuffRing);
        return group;
      },

      // ---- 599: Master's Gauntlets --------------------------------------------
      createMastersGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const silk = this._mat(this.getRandomColor(rand, [0x1E1E22, 0x6B1030, 0x102A4A]), { roughness: 0.6, metalness: 0.08 });
        const gold = this._cast(0xD9A62A);
        const cord = this._mat(0xD8CFA8, { roughness: 0.95, metalness: 0.02 });
        // Nothing added and nothing sharp: the plainest glove here, and the
        // one whose wearer needs the least.
        this._fist(group, silk, { width: 0.08, knuckleR: 0.013, cuff: 0.03 });
        // Embroidery over the back of the hand.
        const stitches = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < stitches; i++) {
          const a = (i / stitches) * Math.PI * 2;
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.004), gold);
          st.position.set(Math.cos(a) * 0.02, 0.02 + Math.sin(a) * 0.02, 0.026);
          st.rotation.z = a;
          group.add(st);
        }
        const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, this.seg(12, 7)), gold);
        medallion.rotation.x = Math.PI / 2;
        medallion.position.set(0, 0.02, 0.028);
        group.add(medallion);
        // Knuckle pads, quilted rather than plated.
        for (let i = 0; i < 4; i++) {
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), silk);
          pad.scale.set(1, 0.7, 0.8);
          pad.position.set(-0.03 + i * 0.02, 0.066, 0.02);
          group.add(pad);
        }
        // The cord binding at the wrist, tied off with two hanging ends.
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.004, this.seg(4, 3), this.seg(14, 8)), cord);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.05 - i * 0.016;
          wrap.scale.z = 0.74;
          group.add(wrap);
        }
        for (let i = 0; i < 2; i++) {
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.055, this.seg(5, 3)), cord);
          tail.position.set(-0.008 + i * 0.016, -0.13, 0.014);
          tail.userData.sway = { axis: 'z', amp: 0.2, freq: 1.0, phase: i };
          group.add(tail);
        }
        return group;
      },

      // ---- 600: Telekinetic Gauntlets -----------------------------------------
      createTelekineticGauntletsModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xD8DCE0, { roughness: 0.3, metalness: 0.45 });
        const dark = this._mat(0x1E2126, { roughness: 0.6, metalness: 0.65 });
        const tkColor = this.getRandomColor(rand, [0xC77DFF, 0x7DFFD3]);
        const tk = this._glow(tkColor, 1.2);
        const alloy = this._mat(0x9BA1A7, { roughness: 0.3, metalness: 0.9 });
        // The hand is open, and what it is holding is nowhere near it.
        this._fist(group, shell, { width: 0.084, knuckleR: 0.014, fingers: false, cuff: 0.028, cuffMat: dark });
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.05, this.seg(8, 5)), shell);
          finger.position.set(x, 0.086, 0.014);
          finger.rotation.x = -0.25 + i * 0.06;
          group.add(finger);
          const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), tk);
          emitter.position.set(x, 0.112, 0.006);
          emitter.userData.pulse = { min: 0.1, max: 1.3, freq: 1.6, phase: i * 0.8 };
          group.add(emitter);
        }
        // The object being held, turning in mid-air with nothing under it.
        const held = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), alloy);
        held.position.set(0, 0.16, 0.05);
        held.userData.spin = { axis: 'y', speed: 0.9 };
        held.userData.bob = { axis: 'y', amp: 0.012, freq: 0.6 };
        group.add(held);
        const cage = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < cage; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032 + i * 0.006, 0.002, this.seg(4, 3), this.seg(16, 9)), tk);
          ring.position.set(0, 0.16, 0.05);
          ring.rotation.set((i / cage) * Math.PI, (i / cage) * Math.PI * 0.6, 0);
          ring.userData.spin = { axis: ['y', 'x', 'z'][i], speed: (i % 2 ? -1 : 1) * (0.7 + i * 0.4) };
          ring.userData.pulse = { min: 0.2, max: 1.1, freq: 1.2, phase: i };
          group.add(ring);
        }
        const focus = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(11, 7), this.seg(8, 5)), tk);
        focus.position.set(0, 0.03, 0.04);
        focus.userData.pulse = { min: 0.4, max: 1.4, freq: 1.1 };
        group.add(focus);
        return group;
      },

      // ---- 601: Fox Spirit Fists ----------------------------------------------
      createFoxSpiritFistsModel(weapon, rand) {
        const group = new THREE.Group();
        const furColor = this.getRandomColor(rand, [0xC8642A, 0xE8E4DC, 0x3A2A1C]);
        const fur = this._mat(furColor, { roughness: 0.95, metalness: 0.02 });
        const tip = this._mat(0xF0EDE4, { roughness: 0.95, metalness: 0.02 });
        const claw = this._mat(0x2A241C, { roughness: 0.5, metalness: 0.2 });
        const spirit = this._glow(0xFFB86B, 1.0);
        // A paw rather than a fist, with the fox's own fire at the wrist and
        // more tails than any animal has.
        this._fist(group, fur, { width: 0.084, knuckleR: 0.016, fingers: false, cuff: 0.028 });
        for (let f = 0; f < 4; f++) {
          const x = -0.03 + f * 0.02;
          const pad = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(9, 6), this.seg(7, 5)), fur);
          pad.scale.set(1, 0.8, 1.1);
          pad.position.set(x, 0.062, 0.026);
          group.add(pad);
          const nail = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.024, this.seg(6, 4)), claw);
          nail.position.set(x, 0.076, 0.04);
          nail.rotation.x = 0.9;
          group.add(nail);
        }
        // Tails, fanned behind the wrist, each with a white tip.
        const tails = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < tails; i++) {
          const a = (i - (tails - 1) / 2) * 0.4;
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.11, this.seg(8, 5)), fur);
          tail.position.set(Math.sin(a) * 0.05, -0.1, -0.03 + Math.cos(a) * 0.01);
          tail.rotation.set(0.3, 0, -a);
          tail.userData.sway = { axis: 'z', amp: 0.16, freq: 0.9 + i * 0.15, phase: i * 1.2 };
          group.add(tail);
          const white = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), tip);
          white.position.set(Math.sin(a) * 0.08, -0.15, -0.03 + Math.cos(a) * 0.02);
          white.userData.sway = { axis: 'z', amp: 0.16, freq: 0.9 + i * 0.15, phase: i * 1.2 };
          group.add(white);
        }
        const flame = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < flame; i++) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), spirit);
          f.position.set(0, -0.05, 0.02);
          f.userData.orbit = { radius: 0.04, speed: 0.9 + i * 0.3, phase: i * 2.1, plane: 'xz' };
          f.userData.pulse = { min: 0.3, max: 1.4, freq: 1.8, phase: i };
          group.add(f);
        }
        return group;
      },

      // ---- 602: Mind Manipulator Gloves ---------------------------------------
      createMindManipulatorGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const silk = this._mat(0xE8E4F0, { roughness: 0.45, metalness: 0.12 });
        const thread = this._cast(0xC9A227);
        const psiColor = this.getRandomColor(rand, [0xB86BFF, 0x6BD9FF]);
        const psi = this._glow(psiColor, 1.1);
        // Circuitry embroidered into a dress glove, and puppet strings coming
        // off the fingertips to nothing.
        this._fist(group, silk, { width: 0.08, knuckleR: 0.013, cuff: 0.032 });
        const traces = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < traces; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0015, 0.003), thread);
          t.position.set(0, 0.05 - i * 0.016, 0.026);
          t.rotation.z = (i % 2 ? 1 : -1) * 0.25;
          group.add(t);
          const node = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(6, 4), this.seg(4, 3)), psi);
          node.position.set((i % 2 ? 1 : -1) * 0.022, 0.05 - i * 0.016, 0.028);
          node.userData.pulse = { min: 0.1, max: 1.3, freq: 1.5, phase: i * 0.7 };
          group.add(node);
        }
        // Strings, going up out of the frame.
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.16, this.seg(5, 3)), psi);
          string.position.set(x, 0.14, 0.036);
          string.rotation.z = (i - 1.5) * 0.06;
          string.userData.pulse = { min: 0.05, max: 0.9, freq: 1.1, phase: i * 0.8 };
          string.userData.sway = { axis: 'z', amp: 0.05, freq: 0.7, phase: i };
          group.add(string);
        }
        const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.002, this.seg(4, 3), 6), psi);
        sigil.position.set(0, 0.02, 0.03);
        sigil.userData.spin = { axis: 'z', speed: 0.5 };
        sigil.userData.pulse = { min: 0.3, max: 1.2, freq: 1.0 };
        group.add(sigil);
        return group;
      },

      // ---- 603: EHI Petrochem Injectors ---------------------------------------
      createPetrochemInjectorsModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.42, metalness: 0.28 });
        const slick = this._mat(0x14161A, { roughness: 0.08, metalness: 0.75 });
        const glass = this._mat(0xBFD8E0, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
        const product = this._glow(0x7CFF3D, 0.9);
        const hazard = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.25 });
        // Branded medical hardware that delivers something no doctor ordered:
        // reservoirs on the back of the hand and needles at the knuckles.
        this._fist(group, corporate, { width: 0.086, knuckleR: 0.014, fingers: false, cuff: 0.03, cuffMat: slick });
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.04, this.seg(7, 5)), corporate);
          needle.position.set(x, 0.082, 0.024);
          group.add(needle);
          const bevel = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.008, this.seg(6, 4)), hazard);
          bevel.position.set(x, 0.104, 0.024);
          group.add(bevel);
          const drip = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(6, 4), this.seg(4, 3)), product);
          drip.position.set(x, 0.112, 0.024);
          drip.userData.bob = { axis: 'y', amp: 0.012, freq: 0.8, phase: i * 0.6 };
          drip.userData.pulse = { min: 0.2, max: 1.2, freq: 1.4, phase: i };
          group.add(drip);
        }
        // Two reservoirs, one nearly empty.
        for (let i = 0; i < 2; i++) {
          const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.05, this.seg(11, 7)), glass);
          vial.position.set(-0.018 + i * 0.036, 0.02, 0.03);
          group.add(vial);
          const level = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.034 - i * 0.02, this.seg(11, 7)), product);
          level.position.set(-0.018 + i * 0.036, 0.012 - i * 0.008, 0.03);
          level.userData.pulse = { min: 0.3, max: 1.0, freq: 0.8, phase: i };
          group.add(level);
        }
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.024, 0.022), slick);
        pump.position.set(0, -0.04, 0.024);
        group.add(pump);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.016), hazard);
        label.position.set(0, -0.028, 0.024);
        group.add(label);
        for (let i = 0; i < 2; i++) {
          const line = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, this.seg(4, 3), this.seg(10, 6), Math.PI), slick);
          line.position.set(-0.018 + i * 0.036, -0.012, 0.03);
          line.rotation.set(0, 0, i ? -0.6 : 0.6);
          group.add(line);
        }
        return group;
      },

      // ---- 604: Phasing Touch -------------------------------------------------
      createPhasingTouchModel(weapon, rand) {
        const group = new THREE.Group();
        const ghostColor = this.getRandomColor(rand, [0x6FD3FF, 0xC49BFF, 0x9BFFC4]);
        const solid = this._mat(0xB4BAC2, { roughness: 0.3, metalness: 0.7, transparent: true, opacity: 0.55 });
        const ghost = this._mat(ghostColor, {
          roughness: 0.1, metalness: 0.05, emissive: ghostColor, emissiveIntensity: 0.9,
          transparent: true, opacity: 0.3
        });
        const ring = this._mat(0x2A2E36, { roughness: 0.4, metalness: 0.85 });
        // Half here: the hand is drawn twice, offset, and neither copy is
        // reliably the real one.
        this._fist(group, solid, { width: 0.082, knuckleR: 0.014, cuff: 0.026, cuffMat: ring });
        for (let i = 0; i < 2; i++) {
          const echo = new THREE.Group();
          echo.position.set((i ? 1 : -1) * 0.016, 0, (i ? 1 : -1) * 0.012);
          echo.userData.orbit = { radius: 0.014, speed: (i ? 1 : -1) * 0.7, phase: i * 3.1, plane: 'xz' };
          echo.userData.pulse = { min: 0.0, max: 1.2, freq: 0.8, phase: i * 2.4 };
          this._fist(echo, ghost, { width: 0.078, knuckleR: 0.013, fingers: false, cuff: 0.02 });
          group.add(echo);
        }
        // The emitter ring at the wrist that is doing it.
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, this.seg(5, 4), this.seg(16, 9)), ring);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = -0.062;
        collar.scale.z = 0.78;
        group.add(collar);
        const emitters = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < emitters; i++) {
          const a = (i / emitters) * Math.PI * 2;
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)),
            this._glow(ghostColor, 1.3));
          e.position.set(Math.cos(a) * 0.036, -0.062, Math.sin(a) * 0.028);
          e.userData.pulse = { min: 0.0, max: 1.4, freq: 2.2, phase: -i * 0.9 };
          group.add(e);
        }
        return group;
      },

      // ---- 605: Varlenia Fist -------------------------------------------------
      // (The gold house finish is applied after the build; see VARLENIA_IDS.)
      createVarleniaFistModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0xC8CED4, { roughness: 0.2, metalness: 0.94 });
        const inlay = this._mat(0x8A8F95, { roughness: 0.4, metalness: 0.85 });
        const crest = this._glow(0xFFE9A8, 1.1);
        const velvet = this._mat(0x5A1030, { roughness: 0.95, metalness: 0 });
        // Ceremonial: symmetrical, scrolled, and quite obviously never used.
        this._fist(group, body, { width: 0.086, knuckleR: 0.015, fingers: false, cuff: 0.032, cuffMat: velvet });
        for (let i = 0; i < 4; i++) {
          const x = -0.031 + i * 0.0207;
          const dome = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(10, 6), this.seg(7, 5)), body);
          dome.scale.y = 0.85;
          dome.position.set(x, 0.072, 0.02);
          group.add(dome);
          const stud = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.014, this.seg(7, 5)), inlay);
          stud.position.set(x, 0.086, 0.02);
          group.add(stud);
        }
        // Scrollwork over the back of the hand, in matched pairs.
        for (const s of [-1, 1]) {
          for (let i = 0; i < 2; i++) {
            const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0035, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.4), inlay);
            scroll.position.set(s * 0.024, 0.03 - i * 0.026, 0.028);
            scroll.rotation.set(0, 0, s * 0.7 + i);
            group.add(scroll);
          }
        }
        const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), crest);
        badge.position.set(0, 0.02, 0.032);
        badge.userData.spin = { axis: 'z', speed: 0.5 };
        badge.userData.pulse = { min: 0.4, max: 1.2, freq: 1.0 };
        group.add(badge);
        const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, this.seg(5, 4), this.seg(16, 9)), body);
        cuffRing.rotation.x = Math.PI / 2;
        cuffRing.position.y = -0.08;
        cuffRing.scale.z = 0.78;
        group.add(cuffRing);
        for (let i = 0; i < 3; i++) {
          const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.05, this.seg(5, 3)), velvet);
          tassel.position.set((i - 1) * 0.008, -0.11, 0.02);
          tassel.userData.sway = { axis: 'z', amp: 0.2, freq: 1.1, phase: i };
          group.add(tassel);
        }
        return group;
      },

      // ---- 606: Molecular Manipulator Gloves ----------------------------------
      createMolecularManipulatorGlovesModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE4E8EC, { roughness: 0.3, metalness: 0.45 });
        const dark = this._mat(0x1E2126, { roughness: 0.6, metalness: 0.65 });
        const bondColor = this.getRandomColor(rand, [0x4FE3FF, 0x8AFF6A]);
        const bond = this._glow(bondColor, 1.2);
        const atomMat = this._mat(0xB0B6BC, { roughness: 0.25, metalness: 0.9 });
        // It takes things apart at the joins: a lattice hangs over the palm
        // with the bonds visible and one atom already loose.
        this._fist(group, shell, { width: 0.084, knuckleR: 0.014, fingers: false, cuff: 0.028, cuffMat: dark });
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.006, 0.045, this.seg(8, 5)), shell);
          probe.position.set(x, 0.084, 0.02);
          group.add(probe);
          const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), bond);
          emitter.position.set(x, 0.108, 0.02);
          emitter.userData.pulse = { min: 0.1, max: 1.3, freq: 1.8, phase: i * 0.7 };
          group.add(emitter);
        }
        // The lattice: atoms and the bonds between them, held above the palm.
        const nodes = [];
        const count = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const r = 0.026;
          nodes.push(new THREE.Vector3(Math.cos(a) * r, 0.155 + Math.sin(a) * r * 0.6, 0.05 + Math.sin(a * 2) * 0.01));
        }
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i], b = nodes[(i + 1) % nodes.length];
          const d = b.clone().sub(a);
          const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, d.length(), this.seg(5, 3)), bond);
          link.position.copy(a).add(b).multiplyScalar(0.5);
          link.quaternion.setFromUnitVectors(up, d.clone().normalize());
          link.userData.pulse = { min: 0.2, max: 1.3, freq: 1.4, phase: i * 0.8 };
          group.add(link);
          const atom = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(9, 6), this.seg(7, 5)), atomMat);
          atom.position.copy(a);
          atom.userData.bob = { axis: 'y', amp: 0.006, freq: 0.9, phase: i };
          group.add(atom);
        }
        // The one that has come off.
        const loose = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(9, 6), this.seg(7, 5)), atomMat);
        loose.position.set(0, 0.155, 0.05);
        loose.userData.orbit = { radius: 0.05, speed: 1.2, plane: 'xz' };
        loose.userData.bob = { axis: 'y', amp: 0.02, freq: 0.7 };
        group.add(loose);
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.014, 0.002), bond);
        readout.position.set(0, -0.04, 0.028);
        readout.userData.pulse = { min: 0.2, max: 1.0, freq: 2.6 };
        group.add(readout);
        return group;
      },

      // ---- 607: EHI Apocalypse Fists ------------------------------------------
      createApocalypseFistsModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.42, metalness: 0.28 });
        const scorched = this._mat(0x241C18, { roughness: 0.9, metalness: 0.3 });
        const hazard = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.25 });
        const core = this._glow(0xFF5A1A, 1.4);
        const alloy = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        // Sold as a product, with a compliance label, and the casing is
        // already burnt through where the core sits.
        this._fist(group, corporate, { width: 0.09, knuckleR: 0.016, fingers: false, cuff: 0.032, cuffMat: scorched });
        for (let i = 0; i < 4; i++) {
          const x = -0.032 + i * 0.0213;
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.02, 0.022), alloy);
          block.position.set(x, 0.07, 0.022);
          group.add(block);
          const vent = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.024), core);
          vent.position.set(x, 0.08, 0.022);
          vent.userData.pulse = { min: 0.2, max: 1.5, freq: 1.6, phase: -i * 0.7 };
          group.add(vent);
        }
        // The reactor in the back of the hand, and the burn round it.
        const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.02, this.seg(14, 8)), alloy);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(0, 0.02, 0.03);
        group.add(housing);
        const reactor = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(9, 6)), core);
        reactor.position.set(0, 0.02, 0.034);
        reactor.userData.pulse = { min: 0.5, max: 1.7, freq: 1.3 };
        group.add(reactor);
        const burn = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(14, 8)), scorched);
        burn.rotation.x = Math.PI / 2;
        burn.position.set(0, 0.02, 0.028);
        group.add(burn);
        const containment = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < containment; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.006, 0.002, this.seg(4, 3), this.seg(16, 9)), core);
          ring.position.set(0, 0.02, 0.034);
          ring.rotation.set(Math.PI / 2 + i * 0.4, 0, 0);
          ring.userData.spin = { axis: 'z', speed: (i % 2 ? -1 : 1) * (0.8 + i * 0.4) };
          ring.userData.pulse = { min: 0.1, max: 1.2, freq: 1.8, phase: i };
          group.add(ring);
        }
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.018), hazard);
        label.position.set(0, -0.04, 0.026);
        group.add(label);
        const warning = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.002), hazard);
        warning.position.set(0.032, -0.02, 0.014);
        warning.rotation.y = 0.7;
        group.add(warning);
        return group;
      },

      // ---- 608: Omniadaptive Combat System ------------------------------------
      createOmniadaptiveCombatSystemModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB0B6BC, { roughness: 0.2, metalness: 0.94 });
        const dark = this._mat(0x1A1C22, { roughness: 0.5, metalness: 0.8 });
        const sysColor = this.getRandomColor(rand, [0x4FE3FF, 0x8AFF6A, 0xC77DFF]);
        const sys = this._glow(sysColor, 1.3);
        // Everything the family has, at once: plates, probes, a field, a
        // lattice and a core, and none of them agreeing on what it is.
        this._fist(group, dark, { width: 0.09, knuckleR: 0.016, fingers: false, cuff: 0.034 });
        // Layered plates that keep re-sorting themselves.
        const plates = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < plates; i++) {
          const t = i / (plates - 1);
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.05 - Math.abs(t - 0.5) * 0.02, 0.014, 0.024), i % 2 ? alloy : dark);
          p.position.set(0, 0.08 - i * 0.018, 0.024);
          p.userData.spin = { axis: 'z', speed: (i % 2 ? 0.4 : -0.55) };
          p.userData.bob = { axis: 'x', amp: 0.005, freq: 0.9, phase: i * 0.6 };
          group.add(p);
        }
        for (let i = 0; i < 4; i++) {
          const x = -0.032 + i * 0.0213;
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.036, this.seg(6, 4)), alloy);
          claw.position.set(x, 0.098, 0.03);
          claw.rotation.x = 0.5;
          claw.userData.sway = { axis: 'x', amp: 0.14, freq: 0.7, phase: i * 0.8 };
          group.add(claw);
        }
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), sys);
        core.position.set(0, 0.02, 0.038);
        core.userData.spin = { axis: 'y', speed: 1.1 };
        core.userData.pulse = { min: 0.5, max: 1.6, freq: 1.4 };
        group.add(core);
        const shells = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < shells; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034 + i * 0.008, 0.003, this.seg(4, 3), this.seg(16, 9)), sys);
          ring.position.set(0, 0.02, 0.038);
          ring.rotation.set((i * Math.PI) / shells, (i * Math.PI) / 3, 0);
          ring.userData.spin = { axis: ['y', 'x', 'z', 'y'][i], speed: (i % 2 ? -1 : 1) * (0.7 + i * 0.35) };
          ring.userData.pulse = { min: 0.15, max: 1.2, freq: 1.3 + i * 0.3, phase: i * 1.4 };
          group.add(ring);
          const node = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), sys);
          node.position.set(0, 0.02, 0.038);
          node.userData.orbit = { radius: 0.034 + i * 0.008, speed: 1.0 + i * 0.3, phase: i * 1.6, plane: ['xz', 'xy', 'yz', 'xz'][i] };
          group.add(node);
        }
        const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, this.seg(5, 4), this.seg(18, 10)), alloy);
        cuffRing.rotation.x = Math.PI / 2;
        cuffRing.position.y = -0.084;
        cuffRing.scale.z = 0.8;
        cuffRing.userData.spin = { axis: 'y', speed: 0.35 };
        group.add(cuffRing);
        return group;
      }

    }
  });
})();
