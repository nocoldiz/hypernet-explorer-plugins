//=============================================================================
// Weapon 3D Models - Heavy (hammers, maces, clubs)
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for heavy (hammers, maces, clubs). Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Heavy (hammers, maces, clubs)
 * ============================================================================
 *
 * One family per weapon type. This one owns every Heavy weapon (wtypeId 3):
 * the generic silhouette the type falls back to, the note-tagged one-offs of
 * that type, and every bespoke per-weapon model in it (1 so far).
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
    console.error('[Weapon3D_Heavy] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Heavy',
    unique: {
      125: 'createStaleBaguetteModel',              // Stale Baguette
      126: 'createDentedPanModel',                  // Dented Pan
      127: 'createSplinteredClubModel',             // Splintered Club
      128: 'createWoodenFlailModel',                // Wooden Flail
      129: 'createPotMetalMaceModel',               // Pot Metal Mace
      130: 'createWoodenClubModel',                 // Wooden Club
      131: 'createUnwieldyHammerModel',             // Unwieldy Hammer
      132: 'createTrustyFryingPanModel',            // Trusty Frying Pan
      133: 'createNailBoardModel',                  // Nail Board
      134: 'createChainRollingPinModel',            // Chain Rolling Pin
      135: 'createRebarClubModel',                  // Rebar Club
      136: 'createPipeWrenchMaceModel',             // Pipe Wrench Mace
      137: 'createBikeChainFlailModel',             // Bike Chain Flail
      138: 'createModifiedWrenchModel',             // Modified Wrench
      139: 'createNailBatModel',                    // Nail Bat
      140: 'createToolboxFlailModel',               // Toolbox Flail
      141: 'createConcreteSledgeModel',             // Concrete Sledge
      142: 'createStoneStuddedClubModel',           // Stone-Studded Club
      143: 'createBlackjackModel',                  // Blackjack
      144: 'createStoneFlailModel',                 // Stone Flail
      145: 'createWarClubModel',                    // War Club
      146: 'createSharkToothClubModel',             // Shark Tooth Club
      147: 'createSarcasticPillowModel',            // Sarcastic Pillow
      148: 'createBronzeFlailModel',                // Bronze Flail
      149: 'createMasterFlipperModel',              // Master Flipper
      150: 'createMereClubModel',                   // Mere Club
      151: 'createTessenModel',                     // Tessen
      152: 'createHonkingMalletDuoModel',           // Honking Mallet Duo
      153: 'createMacuahuitlModel',                 // Macuahuitl
      154: 'createNumberOneFanModel',               // Number One Fan
      155: 'createMeteorHammerModel',               // Meteor Hammer
      156: 'createMedievalFlailModel',              // Medieval Flail
      157: 'createPlainFlailModel',                 // Flail
      158: 'createFlangedMaceModel',                // Flanged Mace
      159: 'createLucerneHammerModel',              // Lucerne Hammer
      160: 'createWarHammerModel',                  // War Hammer
      161: 'createFlangedWarMaceModel',             // Flanged War Mace
      162: 'createMorningStarModel',                // Morning Star
      163: 'createWarPickModel',                    // War Pick
      164: 'createTrainingNunchakuModel',           // Training Nunchaku
      165: 'createHeavyChainModel',                 // Heavy Chain
      166: 'createSpikedBattleShieldModel',         // Spiked Battle Shield
      167: 'createVariableChainHammerModel',        // Variable Chain Hammer
      168: 'createMithrilFlailModel',               // Mithril Flail
      169: 'createSteelNunchakuModel',              // Steel Nunchaku
      170: 'createSiegeBreakerModel',               // Siege Breaker
      171: 'createSeismicHammerModel',              // Seismic Hammer
      172: 'createEarthshakerMaulModel',            // Earthshaker Maul
      173: 'createDragonFlailModel',                // Dragon Flail
      174: 'createSoulDrainFlailModel',             // Soul Drain Flail
      175: 'createEarthshakerMaceModel',            // Earthshaker Mace
      176: 'createSpellcrusherMaulModel',           // Spellcrusher Maul
      177: 'createThoughtCrusherModel',             // Thought Crusher
      178: 'createCelestialHammerModel',            // Celestial Hammer
      179: 'createCosmicPendulumModel',             // Cosmic Pendulum
      180: 'createChronosHammerModel',              // Chronos Hammer
      181: 'createSuicideBomberModel',              // EHI Suicide Bomber
      182: 'createBoarTotemHammerModel',            // Boar Totem Hammer
      183: 'createVarleniaWarFanModel',             // Varlenia War Fan
      184: 'createCompressionMaulModel',            // EHI Compression Maul
      185: 'createMjolnirModel',                    // Mjolnir
      186: 'createBuskerAcousticModel',             // Busker's Acoustic
      187: 'createPresidentialSaxophoneModel',      // Presidential Saxophone
      188: 'createPawnshopStratocasterModel',       // Pawnshop Stratocaster
      189: 'createChitarraInfernaleModel',          // La chitarra infernale
      190: 'createFlyingVModel',                    // Flying V
      191: 'createBassGuitarModel',                 // Bass Guitar
      192: 'createDoubleNeckWarhorseModel',         // Double-Neck Warhorse
      193: 'createFeedbackCannonModel',             // Feedback Cannon
      194: 'createHellfireSuperstratModel',         // Hellfire Superstrat
      211: 'createSteelChairModel',                 // Steel Chair
    },
    models: {
      // ---- 176: Spellcrusher Maul ---------------------------------------------
      createSpellcrusherMaulModel(weapon, rand) {
        const group = new THREE.Group();
        const lead = this._mat(0x55565C, { roughness: 0.85, metalness: 0.45 });
        const iron = this._mat(0x3E4248, { roughness: 0.65, metalness: 0.7 });
        const wood = this._wood(0x5A4128);
        const dead = this._mat(0x2A2630, { roughness: 0.95, metalness: 0.05 });
        const takenColor = this.getRandomColor(rand, [0x7FA8FF, 0xB58AFF, 0x7FE0C8]);
        const taken = this._glow(takenColor, 0.8);

        // A block of dull alloy that nothing will stick to. Every sigil cut
        // into it has been cut through the middle, so the head is a broken
        // circuit: that is the whole trick, and it is why none of it lights up.
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.062, 0.16, 6), lead);
        head.position.y = 0.36;
        group.add(head);
        const faces = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < faces; i++) {
          const holder = new THREE.Group();
          holder.rotation.y = -(i / faces) * Math.PI * 2;
          for (const s of [-1, 1]) {
            const arc = new THREE.Mesh(
              new THREE.TorusGeometry(0.024, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI * 0.75), dead);
            arc.position.set(0, 0.36 + s * 0.026, 0.058);
            arc.rotation.z = s > 0 ? 0.4 : Math.PI - 0.4;
            holder.add(arc);
          }
          const split = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.09, 0.008), iron);
          split.position.set(0, 0.36, 0.06);
          holder.add(split);
          group.add(holder);
        }
        for (const y of [0.29, 0.43]) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.007, this.seg(4, 3), 6), iron);
          band.rotation.x = Math.PI / 2;
          band.position.y = y;
          group.add(band);
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.05, this.seg(9, 6)), iron);
        collar.position.y = 0.26;
        group.add(collar);
        // What it has already put out, still circling the head and going dim.
        const caught = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < caught; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), taken);
          m.position.y = 0.36 + (i - 1.5) * 0.02;
          m.userData.orbit = { radius: 0.095 - i * 0.012, speed: 1.1 + i * 0.35, phase: i * 1.6, plane: 'xz' };
          m.userData.pulse = { min: 0.05, max: 0.7, freq: 0.7, phase: i };
          group.add(m);
        }
        this._hilt(group, rand, { height: 0.42, rTop: 0.021, rBot: 0.018, mat: wood, wrapMat: iron, offset: 0.25 });
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.03, this.seg(9, 6)), iron);
        butt.position.y = -0.185;
        group.add(butt);
        return group;
      },

      // ---- 177: Thought Crusher -----------------------------------------------
      createThoughtCrusherModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8A9096, { roughness: 0.4, metalness: 0.85 });
        const brass = this._cast(0xB08A32);
        const soft = this._mat(0xC8A0A8, { roughness: 0.9, metalness: 0.04 });
        const nerveColor = this.getRandomColor(rand, [0xFF6AC8, 0x8AD0FF, 0xC8FF6A]);
        const nerve = this._glow(nerveColor, 1.0);
        const wood = this._wood(0x3A2C1E);

        // Not a hammer at all: a bench vice on a haft, with something soft
        // between the jaws that has not stopped working. The screw is what
        // does the damage, and it is only ever turned the one way.
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.022), steel);
        spine.position.set(0, 0.38, -0.05);
        group.add(spine);
        for (const s of [-1, 1]) {
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.09), steel);
          jaw.position.set(0, 0.38 + s * 0.052, 0);
          group.add(jaw);
          const teeth = this.isLowDetail() ? 3 : 5;
          for (let i = 0; i < teeth; i++) {
            const t = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.086), brass);
            t.position.set(-0.036 + i * 0.018, 0.38 + s * 0.03, 0);
            group.add(t);
          }
        }
        // Two lobes pressed thin, with the fissure between them still lit.
        const mass = new THREE.Mesh(new THREE.SphereGeometry(0.044, this.seg(12, 7), this.seg(9, 6)), soft);
        mass.scale.set(1.05, 0.5, 1.0);
        mass.position.y = 0.38;
        mass.userData.bob = { amp: 0.003, freq: 1.8 };
        group.add(mass);
        const fissure = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.04, 0.08), nerve);
        fissure.position.y = 0.38;
        fissure.userData.pulse = { min: 0.3, max: 1.3, freq: 1.8 };
        group.add(fissure);
        // The screw, and the wing that turns it.
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.13, this.seg(9, 6)), brass);
        screw.position.y = 0.5;
        screw.userData.spin = { axis: 'y', speed: 0.5 };
        const threads = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < threads; i++) {
          const th = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0025, this.seg(4, 3), this.seg(9, 6)), brass);
          th.rotation.x = Math.PI / 2;
          th.position.y = -0.05 + i * 0.02;
          screw.add(th);
        }
        group.add(screw);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.014), brass);
        wing.position.y = 0.565;
        wing.userData.spin = { axis: 'y', speed: 0.5 };
        group.add(wing);
        // The filaments it reads through, running down into the grip.
        const strands = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < strands; i++) {
          const f = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.24, this.seg(6, 4)), nerve);
          f.position.set(-0.02 + i * 0.013, 0.18, 0.026 - i * 0.004);
          f.rotation.z = (i - 1.5) * 0.06;
          f.userData.pulse = { min: 0.15, max: 0.9, freq: 1.2, phase: i * 0.8 };
          group.add(f);
        }
        this._hilt(group, rand, {
          height: 0.34, rTop: 0.02, rBot: 0.017, mat: wood, wrapMat: steel,
          offset: 0.06, pommelMat: brass, pommel: 'nut'
        });
        return group;
      },

      // ---- 179: Cosmic Pendulum -----------------------------------------------
      createCosmicPendulumModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._cast(0xB08A32);
        const night = this._mat(0x14161F, { roughness: 0.5, metalness: 0.35 });
        const starColor = this.getRandomColor(rand, [0xFFF0C0, 0x9CD4FF, 0xFFB0E0]);
        const star = this._glow(starColor, 1.2);
        const wood = this._wood(0x2A2018);

        // A flail whose bob is a small night. The chain is an orrery arm and
        // what hangs off it is a sky with its own rings still turning, which
        // is why it keeps swinging after the arm has stopped.
        this._hilt(group, rand, {
          height: 0.32, rTop: 0.02, rBot: 0.017, mat: wood, wrapMat: brass,
          offset: -0.02, pommelMat: brass, pommel: 'wheel'
        });
        const gimbal = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, this.seg(4, 3), this.seg(10, 6)), brass);
        gimbal.rotation.x = Math.PI / 2;
        gimbal.position.y = 0.01;
        group.add(gimbal);
        const head = this.chainRig(group, {
          links: 5, length: 0.2, linkMat: brass, linkRadius: 0.012, endMass: 5.0
        });
        const bob = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(14, 8), this.seg(10, 6)), night);
        head.add(bob);
        // Stars set into the surface, spread rather than banded.
        const stars = this.isLowDetail() ? 5 : 11;
        for (let i = 0; i < stars; i++) {
          const phi = Math.acos(1 - 2 * (i + 0.5) / stars);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(4, 3)), star);
          s.position.set(
            Math.sin(phi) * Math.cos(theta) * 0.049,
            Math.cos(phi) * 0.049,
            Math.sin(phi) * Math.sin(theta) * 0.049);
          s.userData.pulse = { min: 0.4, max: 1.4, freq: 0.8 + (i % 3) * 0.3, phase: i };
          head.add(s);
        }
        const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.004, this.seg(4, 3), this.seg(18, 10)), brass);
        ringA.rotation.x = Math.PI / 2;
        ringA.userData.spin = { axis: 'y', speed: 0.9 };
        head.add(ringA);
        const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.003, this.seg(4, 3), this.seg(16, 9)), brass);
        ringB.rotation.set(Math.PI / 2.6, 0, 0.5);
        ringB.userData.spin = { axis: 'z', speed: -0.7 };
        head.add(ringB);
        // Whatever it has picked up on its way round, still in orbit.
        const worlds = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < worlds; i++) {
          const w = new THREE.Mesh(
            new THREE.SphereGeometry(0.009 + i * 0.002, this.seg(8, 5), this.seg(6, 4)), i === 1 ? star : brass);
          w.userData.orbit = {
            radius: 0.078 + i * 0.014, speed: 0.9 - i * 0.25, phase: i * 2.1, plane: i === 1 ? 'xy' : 'xz'
          };
          head.add(w);
        }
        return group;
      },

      // ---- 181: EHI Suicide Bomber --------------------------------------------
      createSuicideBomberModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.4, metalness: 0.25 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const hazard = this._mat(0xE8B02A, { roughness: 0.65, metalness: 0.15 });
        const grey = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.75 });
        const readout = this._glow(0xFF2A2A, 1.2);
        const tape = this._wood(0x33332E);

        // EHI sells it as a single-use disposal tool, which is true of the
        // user as well. Moulded shell, service panel, compliance label, and a
        // countdown that started at the factory and was never reset.
        this._hilt(group, rand, { height: 0.3, rTop: 0.02, rBot: 0.017, mat: grey, wrapMat: tape, offset: -0.02 });
        const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.03, this.seg(9, 6)), grey);
        group.add(swivel);
        const head = this.chainRig(group, {
          links: 5, length: 0.18, linkMat: grey, linkRadius: 0.012, endMass: 5.5
        });
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, this.seg(13, 8)), corporate);
        head.add(shell);
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, this.seg(13, 8), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), corporate);
        cap.position.y = 0.065;
        head.add(cap);
        for (const y of [-0.03, 0.03]) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.016, this.seg(13, 8)), hazard);
          band.position.y = y;
          head.add(band);
        }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.006), accent);
        panel.position.z = 0.05;
        head.add(panel);
        const display = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.004), readout);
        display.position.set(0, 0.012, 0.055);
        display.userData.pulse = { min: 0.2, max: 1.5, freq: 3.4 };
        head.add(display);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.018, 0.003), corporate);
        label.position.set(0, -0.014, 0.055);
        head.add(label);
        // The charges are not EHI parts. They were taped on by whoever last
        // serviced it, and the tape is the newest thing on the weapon.
        const sticks = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < sticks; i++) {
          const a = (i / sticks) * Math.PI * 2;
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, this.seg(8, 5)), hazard);
          stick.position.set(Math.cos(a) * 0.055, -0.01, Math.sin(a) * 0.055);
          head.add(stick);
        }
        for (const y of [-0.04, 0.02]) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.005, this.seg(4, 3), this.seg(12, 7)), tape);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = y;
          head.add(wrap);
        }
        // The lanyard, and the ring on the end of it that the manual is about.
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.09, this.seg(5, 3)), tape);
        cord.position.set(0.03, -0.11, 0);
        cord.rotation.z = 0.3;
        cord.userData.sway = { axis: 'z', amp: 0.25, freq: 1.6 };
        head.add(cord);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, this.seg(4, 3), this.seg(10, 6)), grey);
        ring.position.set(0.055, -0.15, 0);
        ring.userData.sway = { axis: 'z', amp: 0.3, freq: 1.6 };
        head.add(ring);
        return group;
      },

      // ---- 182: Boar Totem Hammer ---------------------------------------------
      createBoarTotemHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const ash = this._wood(0x8B6A3B);
        const bone = this._mat(0xD9CDAF, { roughness: 0.8, metalness: 0.04 });
        const tusk = this._mat(0xEFE6CE, { roughness: 0.45, metalness: 0.06 });
        const ochreColor = this.getRandomColor(rand, [0xC0522A, 0xD8A02A, 0xA83A2A]);
        const ochre = this._mat(ochreColor, { roughness: 0.9, metalness: 0.03 });
        const hide = this._wood(0x4A3524);
        const cord = this._mat(0xC8B48A, { roughness: 0.95, metalness: 0.02 });

        // The head is a boar's skull lashed to an ash haft, tusks forward. It
        // is a shrine before it is a hammer, and everything hanging off it was
        // owed to something.
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, this.seg(12, 7), this.seg(9, 6)), bone);
        skull.scale.set(1, 0.95, 1.25);
        skull.position.y = 0.4;
        group.add(skull);
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.09), bone);
        snout.position.set(0, 0.385, 0.095);
        group.add(snout);
        const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.02, this.seg(9, 6)), hide);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0.385, 0.142);
        group.add(nose);
        for (const s of [-1, 1]) {
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(7, 5), this.seg(5, 4)), hide);
          socket.position.set(s * 0.036, 0.425, 0.05);
          group.add(socket);
          // The tusks, which are what it actually hits with.
          const t = new THREE.Mesh(
            new THREE.TorusGeometry(0.05, 0.008, this.seg(5, 4), this.seg(10, 6), Math.PI * 0.7), tusk);
          t.position.set(s * 0.03, 0.37, 0.11);
          t.rotation.set(Math.PI / 2, 0, s > 0 ? -0.4 : Math.PI + 0.4);
          group.add(t);
        }
        const marks = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < marks; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.11), ochre);
          b.position.set(-0.03 + i * 0.02, 0.44, 0.02);
          group.add(b);
        }
        // Lashings: the skull is tied on, not fitted.
        for (let i = 0; i < 4; i++) {
          const lash = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(4, 3), this.seg(10, 6)), cord);
          lash.rotation.x = Math.PI / 2;
          lash.rotation.z = (rand() - 0.5) * 0.3;
          lash.position.y = 0.31 + i * 0.022;
          group.add(lash);
        }
        this._polearmShaft(group, ash, { len: 0.72, r: 0.019, top: 0.36, wrapMat: hide, buttMat: hide, butt: 'cap' });
        // Fetishes: teeth, a strip of hide, all of it still moving.
        const charms = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < charms; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.024, this.seg(5, 4)), i % 2 ? tusk : ochre);
          c.position.set(0.022, 0.26 - i * 0.035, 0.012);
          c.rotation.x = Math.PI;
          c.userData.sway = { axis: 'z', amp: 0.24, freq: 1.0 + i * 0.2, phase: i };
          group.add(c);
        }
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.11, 0.003), hide);
        strip.position.set(-0.026, 0.2, 0);
        strip.userData.sway = { axis: 'z', amp: 0.16, freq: 0.9 };
        group.add(strip);
        return group;
      },

      // ---- 183: Varlenia War Fan ----------------------------------------------
      createVarleniaWarFanModel(weapon, rand) {
        const group = new THREE.Group();
        // Pale metal throughout: this one leaves the workshop in the house
        // finish, so the gold goes on after the fact and every surface here is
        // picked for how it takes it.
        const shell = this._mat(0xCFD4DA, { roughness: 0.3, metalness: 0.85 });
        const plate = this._mat(0xE6E9ED, { roughness: 0.2, metalness: 0.95 });
        const leaf = this._mat(0xDDD8CC, { roughness: 0.75, metalness: 0.2 });
        const core = this._glow(0xFFF4D0, 0.8);
        const cordMat = this._mat(0x8E8778, { roughness: 0.9, metalness: 0.05 });

        // A fan of edged ribs opened wide: a guard first and a cutting weapon
        // second, which is the order Varlenia builds everything in.
        const ribs = this.isLowDetail() ? 7 : 11;
        const spread = Math.PI * 0.62;
        const len = 0.34;
        for (let i = 0; i < ribs; i++) {
          const a = -spread / 2 + (i / (ribs - 1)) * spread;
          const outer = (i === 0 || i === ribs - 1);
          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(outer ? 0.012 : 0.007, len, outer ? 0.014 : 0.006), outer ? plate : shell);
          rib.position.set(Math.sin(a) * len / 2, Math.cos(a) * len / 2, 0);
          rib.rotation.z = -a;
          group.add(rib);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, this.seg(6, 4)), plate);
          tip.position.set(Math.sin(a) * (len + 0.02), Math.cos(a) * (len + 0.02), 0);
          tip.rotation.z = -a;
          group.add(tip);
          // The leaf between this rib and the next one.
          if (i < ribs - 1) {
            const mid = a + spread / (ribs - 1) / 2;
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.032, len * 0.86, 0.002), leaf);
            panel.position.set(Math.sin(mid) * len * 0.55, Math.cos(mid) * len * 0.55, 0);
            panel.rotation.z = -mid;
            group.add(panel);
          }
        }
        // The arc that ties the ribs together at the edge, and the line of
        // light running behind it.
        const rim = new THREE.Mesh(new THREE.TorusGeometry(len, 0.005, this.seg(4, 3), this.seg(18, 10), spread), plate);
        rim.rotation.z = Math.PI / 2 - spread / 2;
        group.add(rim);
        const inner = new THREE.Mesh(
          new THREE.TorusGeometry(len * 0.62, 0.003, this.seg(4, 3), this.seg(16, 9), spread), core);
        inner.rotation.z = Math.PI / 2 - spread / 2;
        inner.userData.pulse = { min: 0.3, max: 1.0, freq: 1.0 };
        group.add(inner);
        // The pivot, which is the only part of it that ever wears out.
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, this.seg(12, 7)), plate);
        pivot.rotation.x = Math.PI / 2;
        group.add(pivot);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(10, 6), this.seg(8, 5)), core);
        boss.position.z = 0.022;
        boss.userData.pulse = { min: 0.4, max: 1.1, freq: 1.3 };
        group.add(boss);
        const crest = this._plate([[-0.014, 0], [0.014, 0], [0, 0.03]], 0.004, plate);
        crest.position.set(0, 0.04, 0.016);
        group.add(crest);
        // It is held at the hinge, so the grip is short and the cord is what
        // keeps it on the hand when the wrist turns over.
        this._hilt(group, rand, {
          height: 0.13, rTop: 0.017, rBot: 0.015, mat: shell, wrapMat: cordMat,
          offset: -0.01, pommelMat: plate, pommel: 'disc'
        });
        const strands = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < strands; i++) {
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.001, 0.07, this.seg(5, 3)), cordMat);
          strand.position.set(-0.012 + i * 0.008, -0.19, 0.004);
          strand.userData.sway = { axis: 'z', amp: 0.18, freq: 1.2 + i * 0.2, phase: i };
          group.add(strand);
        }
        return group;
      },

      // ---- 184: EHI Compression Maul ------------------------------------------
      createCompressionMaulModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.4, metalness: 0.25 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const steel = this._mat(0x8A9096, { roughness: 0.35, metalness: 0.9 });
        const hose = this._mat(0x22242A, { roughness: 0.9, metalness: 0.1 });
        const dial = this._mat(0xF2F0E8, { roughness: 0.6, metalness: 0.1 });
        const warn = this._glow(0xFFAA1A, 1.0);

        // A shop press with the bench taken away. The head is a ram in a
        // cylinder, the haft carries the hydraulics, and the gauge on the side
        // is the only part of it that ever tells the truth.
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.16, this.seg(14, 8)), corporate);
        body.position.y = 0.4;
        group.add(body);
        const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.06, this.seg(12, 7)), steel);
        ram.position.y = 0.51;
        ram.userData.bob = { amp: 0.012, freq: 0.7 };
        group.add(ram);
        const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.024, this.seg(12, 7)), steel);
        anvil.position.y = 0.552;
        anvil.userData.bob = { amp: 0.012, freq: 0.7 };
        group.add(anvil);
        for (const y of [0.33, 0.47]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.059, 0.006, this.seg(4, 3), this.seg(14, 8)), accent);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = y;
          group.add(ring);
        }
        // Exhaust ports, which vent whether or not anyone is holding it.
        const ports = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < ports; i++) {
          const holder = new THREE.Group();
          holder.rotation.y = (i / ports) * Math.PI * 2;
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.024, this.seg(8, 5)), steel);
          p.rotation.x = Math.PI / 2;
          p.position.set(0, 0.44, 0.062);
          holder.add(p);
          group.add(holder);
        }
        // The gauge, needle sitting a little past the red, which is normal.
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, this.seg(12, 7)), corporate);
        gauge.rotation.x = Math.PI / 2;
        gauge.position.set(0.052, 0.34, 0.03);
        group.add(gauge);
        const dialFace = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, this.seg(12, 7)), dial);
        dialFace.rotation.x = Math.PI / 2;
        dialFace.position.set(0.052, 0.34, 0.038);
        group.add(dialFace);
        const needle = new THREE.Group();
        needle.position.set(0.052, 0.34, 0.042);
        needle.rotation.z = -0.9;
        needle.userData.sway = { axis: 'z', amp: 0.45, freq: 2.4 };
        const pin = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.03, 0.002), accent);
        pin.position.y = 0.012;
        needle.add(pin);
        group.add(needle);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, this.seg(10, 6)), accent);
        collar.position.y = 0.3;
        group.add(collar);
        for (const s of [-1, 1]) {
          const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, this.seg(8, 5)), hose);
          line.position.set(s * 0.03, 0.14, 0.014);
          line.rotation.z = s * 0.06;
          group.add(line);
          const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, this.seg(4, 3), this.seg(9, 6)), steel);
          clamp.rotation.x = Math.PI / 2;
          clamp.position.set(s * 0.03, 0.06, 0.014);
          group.add(clamp);
        }
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.003), warn);
        label.position.set(0, 0.36, 0.06);
        label.userData.pulse = { min: 0.3, max: 1.1, freq: 0.9 };
        group.add(label);
        this._hilt(group, rand, { height: 0.36, rTop: 0.022, rBot: 0.019, mat: corporate, wrapMat: hose, offset: 0.28 });
        const buttCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.026, this.seg(10, 6)), accent);
        buttCap.position.y = -0.09;
        group.add(buttCap);
        return group;
      },

      // ---- 211: Steel Chair ---------------------------------------------------
      createSteelChairModel(weapon, rand) {
        const group = new THREE.Group();
        const paintColor = this.getRandomColor(rand, [0x9A2B22, 0x22508B, 0x2E6B3A, 0x8A8F95]);
        const paint = this._mat(paintColor, { roughness: 0.55, metalness: 0.45 });
        const steel = this._mat(0x9AA0A6, { roughness: 0.4, metalness: 0.85 });
        const bare = this._mat(0xB8BEC4, { roughness: 0.3, metalness: 0.9 });
        const rubber = this._mat(0x1E2024, { roughness: 0.95, metalness: 0.05 });

        // A folding chair off the ringside row, taken by one leg. It has been
        // used for this before: the pan is dished where somebody's head went
        // into it and the paint has gone from every edge that has landed.
        const legs = [[0, 0], [0.26, 0], [0, 0.24], [0.26, 0.24]];
        for (let i = 0; i < legs.length; i++) {
          const x = legs[i][0], z = legs[i][1];
          const held = (i === 0);
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.024, held ? 0.52 : 0.42, 0.024), paint);
          leg.position.set(x, held ? 0.07 : 0.12, z);
          group.add(leg);
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.028, this.seg(8, 5)), rubber);
          foot.position.set(x, held ? -0.2 : -0.1, z);
          group.add(foot);
          // Bare metal where the paint has been knocked off the leg.
          if (this.wantsTrim()) {
            const chip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.026), bare);
            chip.position.set(x, 0.02 + rand() * 0.16, z);
            group.add(chip);
          }
        }
        // The folding braces, which are the reason it never sat straight.
        for (const z of [0, 0.24]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.014, 0.014), steel);
          brace.position.set(0.13, 0.02, z);
          brace.rotation.z = 0.06;
          group.add(brace);
        }
        const pan = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.28), paint);
        pan.position.set(0.13, 0.32, 0.12);
        group.add(pan);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, this.seg(12, 7), this.seg(8, 5)), paint);
        dish.scale.set(1.2, 0.16, 1.1);
        dish.position.set(0.14, 0.326, 0.12);
        group.add(dish);
        const ribs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < ribs; i++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.006, 0.012), bare);
          rib.position.set(0.13, 0.332, 0.03 + i * 0.06);
          group.add(rib);
        }
        // The back, tipped away the way a folding chair always sits.
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.3, 0.26), paint);
        back.position.set(0.29, 0.47, 0.12);
        back.rotation.z = -0.18;
        group.add(back);
        for (const z of [0.01, 0.23]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.02), paint);
          post.position.set(0.29, 0.47, z);
          post.rotation.z = -0.18;
          group.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.25), steel);
        rail.position.set(0.34, 0.61, 0.12);
        group.add(rail);
        // The dent that everybody in the room heard.
        const dent = new THREE.Mesh(new THREE.SphereGeometry(0.04, this.seg(9, 6), this.seg(7, 5)), bare);
        dent.scale.set(1, 0.25, 0.9);
        dent.position.set(0.19, 0.318, 0.16);
        group.add(dent);
        return group;
      },

      // Type 3: Heavy (Hammer)
      createHeavyModel(weapon, rand) {
        const group = new THREE.Group();
        const handleColor = this.getRandomColor(rand, this.handleColors);
        const metalColor = this.getRandomColor(rand, this.guardColors);
        const wrapColor = this.getRandomColor(rand, this.handleColors.filter(c => c !== handleColor));
        const gemColor = this.getRandomColor(rand, this.crystalColors);

        const woodMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.9 });
        const wrapMat = new THREE.MeshStandardMaterial({ color: wrapColor, roughness: 0.95 });
        const metalMat = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.35, metalness: 0.75 });
        const gemMat = new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.1, metalness: 0.1, emissive: gemColor, emissiveIntensity: 0.6 });

        const hHeight = 0.6 + rand() * 0.3;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, hHeight, 8), woodMat);
        h.position.y = -hHeight / 2 + 0.1; 
        group.add(h);

        // Handle wrapping near the grip area
        const wrapGroup = new THREE.Group();
        this.addGripWrap(wrapGroup, rand, hHeight * 0.4, 0.02, 0.018, wrapMat);
        wrapGroup.position.y = -hHeight * 0.1;
        group.add(wrapGroup);

        // Decorative metal ring bands along shaft
        const numBands = 3 + Math.floor(rand() * 3);
        for (let i = 0; i < numBands; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 4, 8), metalMat);
          band.position.y = -hHeight / 2 + 0.1 + (hHeight * 0.8 * (i / (numBands - 1)));
          band.rotation.x = Math.PI / 2;
          group.add(band);
        }

        // Heavy Spiked Pommel counter-weight
        const bottomSpike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), metalMat);
        bottomSpike.rotation.x = Math.PI;
        bottomSpike.position.y = -hHeight / 2 + 0.1 - hHeight / 2;
        group.add(bottomSpike);

        // Random Head type: Warhammer, Spiked Mace, or Flanged Mace
        const headType = Math.floor(rand() * 3);
        const headPos = hHeight / 2 + 0.1;

        if (headType === 0) {
          // Warhammer: Central hub with hammer block and rear curved pick
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), metalMat);
          hub.rotation.x = Math.PI / 2;
          hub.position.y = headPos;
          group.add(hub);

          // Hammer block
          const ham = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), metalMat);
          ham.position.set(0.04, headPos, 0);
          group.add(ham);

          // Gem embedded in side of hammer
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.015, 0), gemMat);
          gem.position.set(0.081, headPos, 0);
          group.add(gem);

          // Rear pick spike
          const pickGeo = new THREE.ConeGeometry(0.02, 0.08, 4);
          const pick = new THREE.Mesh(pickGeo, metalMat);
          pick.rotation.z = Math.PI / 2;
          pick.position.set(-0.06, headPos, 0);
          group.add(pick);
        } else if (headType === 1) {
          // Flanged Mace
          const flangedCore = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), metalMat);
          flangedCore.position.y = headPos;
          group.add(flangedCore);

          const numFlanges = 6;
          for (let i = 0; i < numFlanges; i++) {
            const angle = (i / numFlanges) * Math.PI * 2;
            const flange = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.008), metalMat);
            flange.position.set(Math.cos(angle) * 0.025, headPos, Math.sin(angle) * 0.025);
            flange.rotation.y = -angle;
            group.add(flange);
          }

          // Top spike gem
          const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), metalMat);
          topSpike.position.y = headPos + 0.09;
          group.add(topSpike);
        } else {
          // Spiked Morningstar
          const ballRadius = 0.06 + rand() * 0.02;
          const ball = new THREE.Mesh(new THREE.SphereGeometry(ballRadius, 16, 16), metalMat);
          ball.position.y = headPos;
          group.add(ball);

          // Spikes
          const spikeRadius = 0.01 + rand() * 0.005;
          const spikeHeight = 0.03 + rand() * 0.02;
          const spikeGeo = new THREE.ConeGeometry(spikeRadius, spikeHeight, 4);
          const numSpikes = 12 + Math.floor(rand() * 10);
          
          for (let i = 0; i < numSpikes; i++) {
            const spike = new THREE.Mesh(spikeGeo, metalMat);
            const phi = Math.acos(-1 + (2 * i) / numSpikes);
            const theta = Math.sqrt(numSpikes * Math.PI) * phi;
            
            spike.position.set(
              ballRadius * Math.sin(phi) * Math.cos(theta),
              ballRadius * Math.sin(phi) * Math.sin(theta),
              ballRadius * Math.cos(phi)
            );
            
            const normal = spike.position.clone().normalize();
            spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            ball.add(spike);
          }

          // Floating crystal on top
          const floatingGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), gemMat);
          floatingGem.position.y = headPos + ballRadius + 0.035;
          group.add(floatingGem);
        }

        return group;
      },

      // <Mjolnir>, Thor's iconic short-handled square-head hammer
      createMjolnirModel(weapon, rand) {
        const group = new THREE.Group();
        const metalMat  = new THREE.MeshStandardMaterial({ color: 0xBBBBCC, roughness: 0.3,  metalness: 0.9  });
        const goldMat   = new THREE.MeshStandardMaterial({ color: 0xDDAA00, roughness: 0.2,  metalness: 0.95 });
        const wrapMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9  });
        const lightMat  = new THREE.MeshStandardMaterial({ color: 0x4488FF, emissive: 0x4488FF, emissiveIntensity: 0.85 });

        const hH = 0.20;
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, hH, 8), goldMat);
        handle.position.y = -hH / 2;
        group.add(handle);
        this.addGripWrap(handle, rand, hH, 0.022, 0.02, wrapMat);

        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 4, 8), goldMat);
        strap.position.y = -hH;
        strap.rotation.x = Math.PI / 2;
        group.add(strap);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.04, 8), metalMat);
        neck.position.y = 0.02;
        group.add(neck);

        const headW = 0.14, headH = 0.10, headD = 0.09;
        const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headH, headD), metalMat);
        head.position.y = 0.09;
        group.add(head);

        // Gold band at neck
        const band = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.01, 0.015, headD + 0.01), goldMat);
        band.position.y = 0.044;
        group.add(band);

        // Top cap
        const cap = new THREE.Mesh(new THREE.BoxGeometry(headW - 0.01, 0.01, headD - 0.01), goldMat);
        cap.position.y = 0.09 + headH / 2;
        group.add(cap);

        // Engraved rune lines on front face
        for (let i = 0; i < 3; i++) {
          const rune = new THREE.Mesh(new THREE.BoxGeometry(headW * 0.55, 0.005, 0.002), lightMat);
          rune.position.set(0, 0.045 + i * 0.028, headD / 2 + 0.001);
          group.add(rune);
        }

        // Floating lightning bolt fragments around head
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.025), lightMat);
          bolt.position.set(Math.cos(angle) * 0.11, 0.09, Math.sin(angle) * 0.06);
          bolt.rotation.y = angle;
          group.add(bolt);
        }

        return group;
      },

      // <WarFan>, Folding metal war fan (open position)
      createWarFanModel(weapon, rand) {
        const group = new THREE.Group();
        const bladeColor  = this.getRandomColor(rand, this.bladeColors);
        const handleColor = this.getRandomColor(rand, this.guardColors);
        const gemColor    = this.getRandomColor(rand, this.crystalColors);
        const bladeMat  = new THREE.MeshStandardMaterial({ color: bladeColor,  roughness: 0.2, metalness: 0.9 });
        const handleMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.3, metalness: 0.85 });
        const panelMat  = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.75 });
        const gemMat    = new THREE.MeshStandardMaterial({ color: gemColor, emissive: gemColor, emissiveIntensity: 0.6 });

        // Pivot pin + gem
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 8), handleMat);
        pivot.rotation.x = Math.PI / 2;
        group.add(pivot);
        const pivotGem = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), gemMat);
        group.add(pivotGem);

        // Fan ribs radiating outward
        const numRibs  = 7;
        const fanSpread = Math.PI * 0.65;
        const ribLen   = 0.18;

        for (let i = 0; i < numRibs; i++) {
          const angle = -fanSpread / 2 + (i / (numRibs - 1)) * fanSpread;
          const dir   = new THREE.Vector3(Math.sin(angle) * ribLen, Math.cos(angle) * ribLen, 0);
          const rib   = new THREE.Mesh(
            new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), dir), 4, 0.006, 4, false),
            bladeMat
          );
          group.add(rib);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 4), bladeMat);
          tip.position.copy(dir);
          group.add(tip);

          if (i < numRibs - 1) {
            const midAngle = angle + fanSpread / (numRibs - 1) / 2;
            const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, ribLen * 0.85, 0.002), panelMat);
            panel.position.set(Math.sin(midAngle) * ribLen * 0.5, Math.cos(midAngle) * ribLen * 0.5, 0);
            panel.rotation.z = -midAngle;
            group.add(panel);
          }
        }
        return group;
      },

      // <FoamFinger>, Giant foam "#1" fan finger
      createFoamFingerModel(weapon, rand) {
        const group = new THREE.Group();
        const teamColors = [0xFF6600, 0xFF0000, 0x0000DD, 0xFFCC00, 0x00BB00];
        const teamColor = teamColors[Math.floor(rand() * teamColors.length)];
        const foamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.9 });
        const textMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 });

        // Base glove body
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.06), foamMat);
        base.position.y = -0.05;
        group.add(base);
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 10), foamMat);
        wrist.position.y = -0.09;
        group.add(wrist);

        // Index finger pointing up
        const fBot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.12, 8), foamMat);
        fBot.position.set(0.015, 0.08, 0);
        fBot.rotation.z = -0.05;
        group.add(fBot);
        const fMid = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.10, 8), foamMat);
        fMid.position.set(0.012, 0.19, 0);
        fMid.rotation.z = -0.03;
        group.add(fMid);
        const fTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), foamMat);
        fTip.position.set(0.009, 0.26, 0);
        group.add(fTip);

        // Curled other fingers
        for (let i = 0; i < 3; i++) {
          const stub = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), foamMat);
          stub.scale.y = 0.6;
          stub.position.set(-0.02 + i * 0.028, 0.01, 0.028);
          group.add(stub);
        }

        // "#1" band
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.005), textMat);
        band.position.set(0, -0.035, 0.032);
        group.add(band);
        return group;
      },

      // <Spatula>, Cooking spatula (flipping weapon)
      createSpatulaModel(weapon, rand) {
        const group = new THREE.Group();
        const handleColors = [0xAA3311, 0x333333, 0x111111, 0x2255AA, 0x228833];
        const handleColor = handleColors[Math.floor(rand() * handleColors.length)];
        const metalMat  = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, roughness: 0.22, metalness: 0.9 });
        const handleMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.7 });
        const bandMat   = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.5 });
        const holeMat   = new THREE.MeshStandardMaterial({ color: 0x000000 });

        const hH = 0.28;
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, hH, 6), handleMat);
        handle.position.y = -hH / 2;
        group.add(handle);
        this.addGripWrap(handle, rand, hH, 0.012, 0.01, bandMat);

        // Neck (slight tilt)
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.04, 6), metalMat);
        neck.position.y = 0.02;
        neck.rotation.z = 0.15;
        group.add(neck);

        // Wide flat blade
        const bladeW = 0.09, bladeH = 0.07;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeW, bladeH, 0.003), metalMat);
        blade.position.set(0.01, 0.08, 0);
        blade.rotation.z = 0.1;
        group.add(blade);

        // Drainage holes
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 3; c++) {
            const hole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.006), holeMat);
            hole.position.set(0.01 + (c - 1) * 0.025, 0.07 + (r - 0.5) * 0.025, 0);
            hole.rotation.z = 0.1;
            group.add(hole);
          }
        }

        // Edge rim
        const rim = new THREE.Mesh(new THREE.BoxGeometry(bladeW + 0.004, 0.005, 0.005), metalMat);
        rim.position.set(0.01, 0.116, 0);
        rim.rotation.z = 0.1;
        group.add(rim);
        return group;
      },

      // <CelestialHammer>, Meteoric hammer with star fragments orbiting
      createCelestialHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const rockMat   = new THREE.MeshStandardMaterial({ color: 0x3A3A5A, roughness: 0.85, metalness: 0.1  });
        const glowMat   = new THREE.MeshStandardMaterial({ color: 0x8888FF, emissive: 0x8888FF, emissiveIntensity: 0.8 });
        const starMat   = new THREE.MeshStandardMaterial({ color: 0xFFFFDD, emissive: 0xFFFFDD, emissiveIntensity: 1.0 });
        const handleMat = new THREE.MeshStandardMaterial({ color: 0x1A1A2A, roughness: 0.7 });

        const hH = 0.55;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, hH, 8), handleMat);
        h.position.y = -hH / 2 + 0.08;
        group.add(h);

        // Constellation dots on handle
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 4, 4), starMat);
          dot.position.set(Math.cos(angle) * 0.016, -hH * 0.28 + (i / 6) * hH * 0.5, Math.sin(angle) * 0.016);
          group.add(dot);
        }

        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), rockMat);
        spike.rotation.x = Math.PI;
        spike.position.y = -hH / 2 + 0.08 - hH / 2;
        group.add(spike);

        // Irregular meteoric head
        const headPos = 0.08;
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), rockMat);
        head.position.y = headPos;
        group.add(head);

        // Glowing cracks
        const c1 = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.04, headPos, 0.04),
          new THREE.Vector3(0, headPos + 0.02, 0),
          new THREE.Vector3(0.04, headPos, -0.04)
        );
        group.add(new THREE.Mesh(new THREE.TubeGeometry(c1, 6, 0.003, 4, false), glowMat));
        const c2 = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, headPos + 0.065, 0),
          new THREE.Vector3(0.03, headPos + 0.03, 0),
          new THREE.Vector3(0.04, headPos - 0.04, 0.03)
        );
        group.add(new THREE.Mesh(new THREE.TubeGeometry(c2, 6, 0.003, 4, false), glowMat));

        // Orbiting star shards
        for (let i = 0; i < 5; i++) {
          const angle = (i / 5) * Math.PI * 2;
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.01, 0), starMat);
          shard.position.set(Math.cos(angle) * 0.1, headPos + (rand() * 0.04 - 0.02), Math.sin(angle) * 0.1);
          group.add(shard);
        }
        return group;
      },

      // <ChronosHammer>, Hourglass-shaped hammer with clock markings
      createChronosHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const bronzeMat    = new THREE.MeshStandardMaterial({ color: 0xCD7F32, roughness: 0.4,  metalness: 0.8  });
        const goldMat      = new THREE.MeshStandardMaterial({ color: 0xDDAA00, roughness: 0.25, metalness: 0.95 });
        const glassMat     = new THREE.MeshStandardMaterial({ color: 0xAA8833, roughness: 0.1,  metalness: 0.0, transparent: true, opacity: 0.82 });
        const glowMat      = new THREE.MeshStandardMaterial({ color: 0xFFCC00, emissive: 0xCC9900, emissiveIntensity: 0.7 });
        const sandMat      = new THREE.MeshStandardMaterial({ color: 0xEECC88, emissive: 0xAAAA44, emissiveIntensity: 0.2 });

        const hH = 0.50;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, hH, 8), bronzeMat);
        h.position.y = -hH / 2 + 0.08;
        group.add(h);

        // Gear rings along handle
        for (let i = 0; i < 4; i++) {
          const y = -hH * 0.38 + (i / 3) * hH * 0.65;
          const gear = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 4, 8), goldMat);
          gear.position.y = y;
          gear.rotation.x = Math.PI / 2;
          group.add(gear);
        }

        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), goldMat);
        pommel.position.y = -hH / 2 + 0.08 - hH / 2;
        group.add(pommel);

        // Hourglass head (two cones meeting at waist)
        const headPos = 0.08, coneH = 0.07, coneR = 0.065;
        const upperCone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 8), bronzeMat);
        upperCone.position.y = headPos + coneH / 2;
        group.add(upperCone);
        const lowerCone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 8), bronzeMat);
        lowerCone.rotation.x = Math.PI;
        lowerCone.position.y = headPos - coneH / 2;
        group.add(lowerCone);

        // Glass waist + sand
        const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 8), glassMat);
        waist.position.y = headPos;
        group.add(waist);
        const sand = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), sandMat);
        sand.position.y = headPos - 0.015;
        sand.scale.y = 0.4;
        group.add(sand);

        // Clock tick marks on one face
        for (let i = 0; i < 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.003), glowMat);
          mark.position.set(Math.sin(angle) * 0.055, headPos, Math.cos(angle) * 0.055 + 0.062);
          mark.rotation.y = angle;
          group.add(mark);
        }

        // Orbiting distortion rings
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.004, 4, 16), glowMat);
        ring1.position.y = headPos;
        ring1.rotation.x = Math.PI / 4;
        group.add(ring1);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.003, 4, 16), glowMat);
        ring2.position.y = headPos;
        ring2.rotation.set(-Math.PI / 4, 0, Math.PI / 4);
        group.add(ring2);
        return group;
      },

      // ---- 125: Stale Baguette ----------------------------------------------------
      // The first Heavy, and a real weapon by now: three days past edible and
      // hard enough to break a jaw.
      createStaleBaguetteModel(weapon, rand) {
        const group = new THREE.Group();
        const crustColor = this.getRandomColor(rand, [0xB07A3A, 0xC08A46, 0x9A662E]);
        const crust = this._mat(crustColor, { roughness: 0.95, metalness: 0.0 });
        const scorched = this._mat(0x6B4522, { roughness: 1.0, metalness: 0.0 });
        const crumb = this._mat(0xE8D9B0, { roughness: 0.95, metalness: 0.0 });
        const flour = this._mat(0xF2EADA, { roughness: 1.0, metalness: 0.0 });
        const paper = this._mat(0xE4E0D4, { roughness: 0.9, metalness: 0.0 });

        // One long loaf, fatter in the middle, tapering to both ends.
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.07, this.seg(12, 7), this.seg(9, 6)), crust);
        loaf.scale.set(1, 4.6, 0.92);
        loaf.position.y = 0.28;
        group.add(loaf);
        // Grignes: the diagonal slashes the baker cut before it went in.
        const slashes = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < slashes; i++) {
          const t = (i + 0.5) / slashes;
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.03), scorched);
          cut.position.set(0.0, 0.06 + t * 0.44, 0.058);
          cut.rotation.z = -0.65;
          group.add(cut);
          const lip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.026), crumb);
          lip.position.set(-0.008, 0.06 + t * 0.44, 0.062);
          lip.rotation.z = -0.65;
          group.add(lip);
        }
        // The torn end where somebody gave up trying to eat it.
        const tear = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(9, 6), this.seg(6, 4)), crumb);
        tear.scale.set(1, 0.5, 0.85);
        tear.position.y = 0.58;
        group.add(tear);
        for (let i = 0; i < 3; i++) {
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), crust);
          shard.position.set((rand() - 0.5) * 0.07, 0.6 + rand() * 0.02, (rand() - 0.5) * 0.06);
          shard.rotation.set(rand(), rand(), rand());
          group.add(shard);
        }

        // The paper sleeve, still on it, still doing nothing.
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.11, this.seg(10, 6)), paper);
        sleeve.position.y = 0.06;
        sleeve.scale.z = 0.94;
        group.add(sleeve);
        // Flour still on the crust.
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const dust = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(6, 4), this.seg(4, 3)), flour);
            dust.scale.set(1.4, 0.5, 1);
            dust.position.set((rand() - 0.5) * 0.08, 0.14 + rand() * 0.4, 0.05);
            group.add(dust);
          }
        }
        return group;
      },

      // ---- 126: Dented Pan ---------------------------------------------------
      createDentedPanModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x9A9EA3, { roughness: 0.62, metalness: 0.72 });
        const burnt = this._mat(0x2A241E, { roughness: 0.95, metalness: 0.2 });
        const bake = this._mat(0x1A1A1C, { roughness: 0.9, metalness: 0.1 });

        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.082, 0.045, this.seg(14, 8)), steel);
        bowl.position.y = 0.24;
        group.add(bowl);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.008, this.seg(14, 8)), burnt);
        base.position.y = 0.218;
        group.add(base);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.005, this.seg(4, 3), this.seg(16, 9)), steel);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.262;
        group.add(rim);
        // The dents that gave it the name, punched in from outside.
        const dents = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < dents; i++) {
          const a = (i / dents) * Math.PI * 2 + rand();
          const dent = new THREE.Mesh(new THREE.SphereGeometry(0.018 + rand() * 0.008, this.seg(7, 5), this.seg(5, 4)), steel);
          dent.position.set(Math.cos(a) * 0.09, 0.225 + rand() * 0.03, Math.sin(a) * 0.09);
          dent.scale.set(1, 0.5, 0.6);
          group.add(dent);
        }
        const tang = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.14, 0.008), steel);
        tang.position.y = 0.13;
        group.add(tang);
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.019, mat: bake, sides: 6, offset: 0.06 });
        const hang = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, this.seg(4, 3), this.seg(9, 6)), steel);
        hang.position.y = -0.12;
        group.add(hang);
        return group;
      },

      // ---- 127: Splintered Club ----------------------------------------------
      createSplinteredClubModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0x9A6A38, 0x7A5230, 0xB08048]));
        const raw = this._wood(0xD8BE90);

        // A table leg that lost an argument: turned at one end, snapped at the
        // other, with the break left as it came.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.024, 0.44, this.seg(9, 6)), wood);
        shaft.position.y = 0.14;
        group.add(shaft);
        for (let i = 0; i < 3; i++) {
          const bead = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.008, this.seg(4, 3), this.seg(10, 6)), wood);
          bead.rotation.x = Math.PI / 2;
          bead.position.y = 0.05 + i * 0.09;
          group.add(bead);
        }
        // The break: splinters standing off the end at every angle.
        const shards = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < shards; i++) {
          const a = (i / shards) * Math.PI * 2;
          const len = 0.04 + rand() * 0.07;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.007, len, 3), raw);
          sp.position.set(Math.cos(a) * 0.016, 0.36 + len / 2, Math.sin(a) * 0.016);
          sp.rotation.set((rand() - 0.5) * 0.5, a, (rand() - 0.5) * 0.5);
          group.add(sp);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.022, rBot: 0.026, mat: wood, sides: this.seg(9, 6), offset: -0.07 });
        return group;
      },

      // ---- 128: Wooden Flail --------------------------------------------------
      createWoodenFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x8B5A2B);
        const leather = this._wood(0x5B3A1E);

        this._hilt(group, rand, { height: 0.34, rTop: 0.021, rBot: 0.017, mat: wood, wrapMat: leather, offset: -0.02 });
        // A threshing flail, not a war one: a swingle on a leather coupling.
        const head = this.chainRig(group, {
          links: 4, length: 0.1, linkMat: leather, rope: true, linkTube: 0.005, endMass: 3.0
        });
        const swingle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.2, this.seg(9, 6)), wood);
        swingle.position.y = 0.1;
        head.add(swingle);
        for (let i = 0; i < 2; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, this.seg(4, 3), this.seg(9, 6)), leather);
          band.rotation.x = Math.PI / 2;
          band.position.y = 0.04 + i * 0.12;
          head.add(band);
        }
        return group;
      },

      // ---- 129: Pot Metal Mace ------------------------------------------------
      createPotMetalMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const pot = this._mat(0x8E8F92, { roughness: 0.75, metalness: 0.55 });
        const flash = this._mat(0xA8A9AC, { roughness: 0.85, metalness: 0.4 });
        const wood = this._wood(0x5C4033);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.062, this.seg(10, 6), this.seg(8, 5)), pot);
        head.scale.y = 1.15;
        head.position.y = 0.3;
        group.add(head);
        // Cast in a two-part mould by somebody in a hurry: the parting line and
        // the flash never got filed off, and there are bubbles in it.
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.004), flash);
        seam.position.y = 0.3;
        group.add(seam);
        const sprue = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.02, this.seg(7, 5)), flash);
        sprue.position.y = 0.375;
        group.add(sprue);
        const holes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < holes; i++) {
          const a = (i / holes) * Math.PI * 2;
          const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rand() * 0.005, this.seg(6, 4), this.seg(5, 4)), flash);
          bubble.position.set(Math.cos(a) * 0.05, 0.28 + rand() * 0.05, Math.sin(a) * 0.05);
          group.add(bubble);
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.026, this.seg(8, 5)), pot);
        collar.position.y = 0.235;
        group.add(collar);
        this._hilt(group, rand, { height: 0.34, rTop: 0.019, rBot: 0.017, mat: wood, wrapMat: wood, offset: 0.22 });
        return group;
      },

      // ---- 130: Wooden Club ---------------------------------------------------
      createWoodenClubModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0x8B5A2B, 0x6E4A2A, 0xA0703C]));
        const knot = this._wood(0x4A3520);

        // One piece of a tree, thicker at the business end, and that is all.
        const club = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.026, 0.5, this.seg(10, 6)), wood);
        club.position.y = 0.2;
        group.add(club);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.056, this.seg(10, 6), this.seg(6, 4)), wood);
        cap.scale.y = 0.5;
        cap.position.y = 0.45;
        group.add(cap);
        const knots = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < knots; i++) {
          const a = rand() * Math.PI * 2;
          const y = 0.1 + rand() * 0.32;
          const r = 0.026 + (y / 0.5) * 0.03;
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(6, 4), this.seg(5, 4)), knot);
          k.scale.set(1, 1.3, 0.4);
          k.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
          group.add(k);
        }
        this._hilt(group, rand, { height: 0.14, rTop: 0.024, rBot: 0.028, mat: wood, sides: this.seg(9, 6), offset: -0.05 });
        return group;
      },

      // ---- 131: Unwieldy Hammer -----------------------------------------------
      createUnwieldyHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x6E7378, { roughness: 0.7, metalness: 0.75 });
        const wood = this._wood(0x8B5A2B);
        const tape = this._wood(0x33332E);

        // Far too much head for the haft it is on, and hanging off true.
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.11), iron);
        head.position.set(0.02, 0.34, 0);
        head.rotation.z = 0.13;
        group.add(head);
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.104, 0.114), iron);
        face.position.set(0.1, 0.343, 0);
        face.rotation.z = 0.13;
        group.add(face);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.104, this.seg(9, 6)), tape);
        eye.position.set(0.02, 0.34, 0);
        group.add(eye);
        // Wedges hammered in to stop it flying off, not entirely successfully.
        for (let i = 0; i < 2; i++) {
          const wedge = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), iron);
          wedge.position.set(0.005 + i * 0.03, 0.385, 0);
          group.add(wedge);
        }
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.42, this.seg(8, 5)), wood);
        haft.position.y = 0.16;
        group.add(haft);
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.005, this.seg(4, 3), this.seg(9, 6)), tape);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.03 + i * 0.03;
          group.add(wrap);
        }
        return group;
      },

      // ---- 132: Trusty Frying Pan ---------------------------------------------
      createTrustyFryingPanModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x2A2A2C, { roughness: 0.72, metalness: 0.5 });
        const season = this._mat(0x1A1512, { roughness: 0.55, metalness: 0.35 });
        const brass = this._cast(0xB9902A);

        // Cast iron, decades of seasoning, and not a mark on it that matters.
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.09, 0.05, this.seg(16, 9)), iron);
        bowl.position.y = 0.25;
        group.add(bowl);
        const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.086, 0.04, this.seg(16, 9)), season);
        inside.position.y = 0.257;
        group.add(inside);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.006, this.seg(4, 3), this.seg(18, 10)), iron);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.274;
        group.add(rim);
        // Pouring spouts either side, cast in.
        for (const s of [-1, 1]) {
          const spout = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.03, this.seg(6, 4)), iron);
          spout.position.set(s * 0.1, 0.272, 0);
          spout.rotation.z = -s * 1.3;
          group.add(spout);
        }
        const helper = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, this.seg(4, 3), this.seg(10, 6), Math.PI), iron);
        helper.position.set(0, 0.26, -0.1);
        helper.rotation.set(Math.PI / 2, 0, 0);
        group.add(helper);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.2, 0.014), iron);
        handle.position.y = 0.12;
        group.add(handle);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.19, 0.024), iron);
        spine.position.y = 0.12;
        group.add(spine);
        this._hilt(group, rand, { height: 0.15, rTop: 0.018, rBot: 0.02, mat: iron, sides: 6, offset: 0.03 });
        const hang = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(4, 3), this.seg(9, 6)), brass);
        hang.position.y = -0.13;
        group.add(hang);
        return group;
      },

      // ---- 133: Nail Board ----------------------------------------------------
      createNailBoardModel(weapon, rand) {
        const group = new THREE.Group();
        const plank = this._wood(0xB08048);
        const grain = this._wood(0x8A6236);
        const nail = this._mat(0x9A9EA3, { roughness: 0.55, metalness: 0.85 });

        const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.026), plank);
        board.position.y = 0.24;
        group.add(board);
        for (let i = 0; i < 3; i++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.42, 0.028), grain);
          line.position.set(-0.03 + i * 0.03, 0.24, 0);
          group.add(line);
        }
        // Nails driven through from the back, points out, in no pattern at all.
        const nails = this.isLowDetail() ? 6 : 11;
        for (let i = 0; i < nails; i++) {
          const x = (rand() - 0.5) * 0.075;
          const y = 0.09 + rand() * 0.36;
          const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.06, this.seg(6, 4)), nail);
          shank.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.3;
          shank.position.set(x, y, 0.02);
          group.add(shank);
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, this.seg(6, 4)), nail);
          head.rotation.x = Math.PI / 2;
          head.position.set(x, y, -0.016);
          group.add(head);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.022, rBot: 0.024, mat: plank, sides: 4, offset: 0.03 });
        return group;
      },

      // ---- 134: Chain Rolling Pin ---------------------------------------------
      createChainRollingPinModel(weapon, rand) {
        const group = new THREE.Group();
        const beech = this._wood(0xD8BE90);
        const chain = this._mat(0x8A8F95, { roughness: 0.4, metalness: 0.9 });

        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.26, this.seg(12, 7)), beech);
        pin.position.y = 0.24;
        group.add(pin);
        for (const y of [0.11, 0.37]) {
          const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.042, this.seg(10, 6), this.seg(6, 4)), beech);
          shoulder.scale.y = 0.5;
          shoulder.position.y = y;
          group.add(shoulder);
          const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, this.seg(8, 5)), beech);
          stub.position.y = y + (y > 0.2 ? 0.03 : -0.03);
          group.add(stub);
        }
        // Chain wound round the barrel and pinned, so it bites as well as
        // crushes. Individually placed links, alternating like real chain.
        const links = this.isLowDetail() ? 6 : 10;
        for (let i = 0; i < links; i++) {
          const t = i / (links - 1);
          const a = t * Math.PI * 3.2;
          const link = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.005, this.seg(4, 3), this.seg(9, 6)), chain);
          link.position.y = 0.13 + t * 0.22;
          link.rotation.set(Math.PI / 2, i % 2 ? Math.PI / 2 : 0, a * 0.1);
          link.scale.z = 0.35;
          group.add(link);
        }
        this._hilt(group, rand, { height: 0.13, rTop: 0.015, rBot: 0.016, mat: beech, sides: this.seg(9, 6), offset: 0.06 });
        return group;
      },

      // ---- 135: Rebar Club ----------------------------------------------------
      createRebarClubModel(weapon, rand) {
        const group = new THREE.Group();
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.35 });
        const crete = this._mat(0xA8A49C, { roughness: 1.0, metalness: 0.0 });
        const rag = this._wood(0x3A3A34);

        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.52, this.seg(8, 5)), rust);
        bar.position.y = 0.2;
        group.add(bar);
        // The ribs that make rebar grip concrete, wound up the whole length.
        const ribs = this.isLowDetail() ? 8 : 16;
        for (let i = 0; i < ribs; i++) {
          const y = -0.03 + i * (0.5 / ribs);
          const rib = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0025, this.seg(4, 3), this.seg(8, 5)), rust);
          rib.rotation.set(Math.PI / 2, 0, 0.5);
          rib.position.y = y;
          group.add(rib);
        }
        // Still has a lump of the slab it was torn out of on the end.
        const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045, 0), crete);
        lump.position.y = 0.46;
        lump.rotation.set(rand(), rand(), rand());
        group.add(lump);
        const chip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02, 0), crete);
        chip.position.set(0.03, 0.42, 0.02);
        group.add(chip);
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.03), rag);
          wrap.position.y = -0.02 - i * 0.03;
          wrap.rotation.y = rand();
          group.add(wrap);
        }
        return group;
      },

      // ---- 136: Pipe Wrench Mace ----------------------------------------------
      createPipeWrenchMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const cast = this._mat(0x8A3A2A, { roughness: 0.8, metalness: 0.5 });
        const steel = this._mat(0x9A9EA3, { roughness: 0.45, metalness: 0.88 });

        // A Stillson wrench, jaws open, exactly as it came off the shelf.
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.36, 0.022), cast);
        handle.position.y = 0.06;
        group.add(handle);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.03), cast);
        head.position.y = 0.28;
        group.add(head);
        const fixedJaw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.028, 0.03), cast);
        fixedJaw.position.set(0.02, 0.322, 0);
        group.add(fixedJaw);
        const moveJaw = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.024, 0.028), steel);
        moveJaw.position.set(0.016, 0.4, 0);
        group.add(moveJaw);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.026), steel);
        post.position.set(-0.012, 0.37, 0);
        group.add(post);
        // Serrated teeth on both jaws.
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            for (const [y, mat] of [[0.338, cast], [0.386, steel]]) {
              const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.01, 3), mat);
              tooth.position.set(0.0 + i * 0.014, y, 0);
              tooth.rotation.x = y > 0.36 ? Math.PI : 0;
              group.add(tooth);
            }
          }
        }
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.03, this.seg(12, 7)), steel);
        nut.position.set(-0.012, 0.318, 0);
        group.add(nut);
        if (this.wantsTrim()) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const knurl = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.004), steel);
            knurl.position.set(-0.012 + Math.cos(a) * 0.018, 0.318, Math.sin(a) * 0.018);
            group.add(knurl);
          }
        }
        this._hilt(group, rand, { height: 0.14, rTop: 0.018, rBot: 0.02, mat: cast, sides: 4, offset: -0.1 });
        return group;
      },

      // ---- 137: Bike Chain Flail ----------------------------------------------
      createBikeChainFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const chain = this._mat(0x5A5E64, { roughness: 0.5, metalness: 0.85 });
        const oiled = this._mat(0x24262A, { roughness: 0.35, metalness: 0.7 });
        const grip = this._mat(0x1B1B1F, { roughness: 0.85, metalness: 0.05 });

        this._hilt(group, rand, { height: 0.2, rTop: 0.017, rBot: 0.019, mat: grip, wrapMat: grip, offset: -0.02 });
        const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.024, this.seg(9, 6)), oiled);
        group.add(clamp);
        const head = this.chainRig(group, {
          links: 8, length: 0.24, linkMat: chain, linkRadius: 0.011, linkTube: 0.0035, endMass: 3.6
        });
        // A chainring off the same bike, still with its teeth.
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.006, this.seg(16, 9)), oiled);
        ring.rotation.x = Math.PI / 2;
        head.add(ring);
        const teeth = this.isLowDetail() ? 9 : 16;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.012, 0.006), oiled);
          tooth.position.set(Math.cos(a) * 0.056, Math.sin(a) * 0.056, 0);
          tooth.rotation.z = a;
          head.add(tooth);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, this.seg(9, 6)), chain);
        hub.rotation.x = Math.PI / 2;
        head.add(hub);
        return group;
      },

      // ---- 138: Modified Wrench -----------------------------------------------
      createModifiedWrenchModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x9A9EA3, { roughness: 0.5, metalness: 0.88 });
        const weld = this._cast(0x9A6A3A);
        const edge = this._steel(0xC8CDD2, 0.3);
        const tape = this._wood(0x2A2A2A);

        // A combination spanner somebody has been improving in a shed.
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.4, 0.012), steel);
        shaft.position.y = 0.15;
        group.add(shaft);
        const ringEnd = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.012, this.seg(5, 4), this.seg(12, 7)), steel);
        ringEnd.position.y = 0.38;
        group.add(ringEnd);
        const openEnd = this._plate([[-0.03, -0.05], [0.03, -0.05], [0.03, 0.0], [0.012, 0.0], [0.012, -0.03], [-0.012, -0.03], [-0.012, 0.0], [-0.03, 0.0]], 0.014, steel);
        openEnd.position.y = -0.02;
        group.add(openEnd);
        // Welded-on blades, badly.
        for (const s of [-1, 1]) {
          const blade = this._plate([[0, 0], [s * 0.05, 0.03], [s * 0.045, 0.05], [0, 0.03]], 0.006, edge);
          blade.position.y = 0.22;
          blade.rotation.z = s * 0.1;
          group.add(blade);
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(6, 4), this.seg(4, 3)), weld);
          bead.scale.set(1.8, 0.6, 1);
          bead.position.set(s * 0.012, 0.225, 0);
          group.add(bead);
        }
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), steel);
        bolt.rotation.z = Math.PI / 2;
        bolt.position.y = 0.31;
        group.add(bolt);
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 0.022), tape);
          wrap.position.y = -0.06 - i * 0.03;
          wrap.rotation.y = (rand() - 0.5) * 0.4;
          group.add(wrap);
        }
        return group;
      },

      // ---- 139: Nail Bat ------------------------------------------------------
      createNailBatModel(weapon, rand) {
        const group = new THREE.Group();
        const ash = this._wood(this.getRandomColor(rand, [0xD8BE90, 0xB08048, 0x8A6236]));
        const nail = this._mat(0x9A9EA3, { roughness: 0.5, metalness: 0.85 });
        const tape = this._wood(0x1A1A1C);
        const paint = this._mat(0xB03A2E, { roughness: 0.8, metalness: 0.05 });

        const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.02, 0.52, this.seg(12, 7)), ash);
        bat.position.y = 0.22;
        group.add(bat);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.048, this.seg(10, 6), this.seg(6, 4)), ash);
        cap.scale.y = 0.45;
        cap.position.y = 0.48;
        group.add(cap);
        const brand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.05), paint);
        brand.position.y = 0.3;
        group.add(brand);
        // Nails hammered through the barrel in a rough spiral.
        const nails = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < nails; i++) {
          const t = i / nails;
          const a = t * Math.PI * 3.4;
          const y = 0.22 + t * 0.24;
          const r = 0.048 - t * 0.006;
          const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, this.seg(6, 4)), nail);
          shank.position.set(dir.x * (r + 0.012), y, dir.z * (r + 0.012));
          shank.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          group.add(shank);
        }
        // The grip is only the last few centimetres of the bat: wound down
        // the arm it ran off the end of the wood, and the knob with it.
        for (let i = 0; i < 5; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, this.seg(4, 3), this.seg(10, 6)), tape);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.008 - i * 0.008;
          group.add(wrap);
        }
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.016, this.seg(10, 6)), ash);
        knob.position.y = -0.046;
        group.add(knob);
        return group;
      },

      // ---- 140: Toolbox Flail -------------------------------------------------
      createToolboxFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const box = this._mat(0xB03A2E, { roughness: 0.7, metalness: 0.4 });
        const steel = this._mat(0x8A8F95, { roughness: 0.45, metalness: 0.88 });
        const grip = this._wood(0x2A2A2A);

        this._hilt(group, rand, { height: 0.2, rTop: 0.018, rBot: 0.02, mat: grip, wrapMat: grip, offset: -0.02 });
        const head = this.chainRig(group, {
          links: 6, length: 0.2, linkMat: steel, linkRadius: 0.013, endMass: 5.5
        });
        // The whole toolbox, and everything still in it.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.075), box);
        head.add(body);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.012, 0.078), box);
        lid.position.set(0.01, 0.05, 0);
        lid.rotation.z = -0.35;
        head.add(lid);
        const latch = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.008), steel);
        latch.position.set(0.066, 0.02, 0.04);
        head.add(latch);
        const handleBar = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), steel);
        handleBar.position.y = 0.036;
        head.add(handleBar);
        // A spanner and a screwdriver, half out of the open lid.
        const spanner = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.006), steel);
        spanner.position.set(-0.03, 0.06, 0.01);
        spanner.rotation.z = 0.5;
        head.add(spanner);
        const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, this.seg(7, 5)), steel);
        driver.position.set(0.02, 0.065, -0.015);
        driver.rotation.z = -0.7;
        head.add(driver);
        return group;
      },

      // ---- 141: Concrete Sledge -----------------------------------------------
      createConcreteSledgeModel(weapon, rand) {
        const group = new THREE.Group();
        const crete = this._mat(0xA8A49C, { roughness: 1.0, metalness: 0.0 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.35 });
        const rag = this._wood(0x3A3A34);

        // Not a hammer with a concrete head: a lump of set concrete that
        // happened to have a bar through it.
        const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), crete);
        lump.position.y = 0.36;
        lump.rotation.set(rand(), rand(), rand());
        lump.scale.set(1.1, 0.85, 1);
        group.add(lump);
        const chunks = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < chunks; i++) {
          const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.022 + rand() * 0.014, 0), crete);
          c.position.set((rand() - 0.5) * 0.13, 0.33 + rand() * 0.08, (rand() - 0.5) * 0.1);
          c.rotation.set(rand(), rand(), rand());
          group.add(c);
        }
        // Rebar stubs poking out where it was broken off the slab.
        for (let i = 0; i < 3; i++) {
          const a = rand() * Math.PI * 2;
          const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(7, 5)), rust);
          stub.position.set(Math.cos(a) * 0.07, 0.36 + (rand() - 0.5) * 0.06, Math.sin(a) * 0.07);
          stub.rotation.z = Math.PI / 2;
          stub.rotation.y = -a;
          group.add(stub);
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.46, this.seg(8, 5)), rust);
        bar.position.y = 0.16;
        group.add(bar);
        for (let i = 0; i < 5; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.034), rag);
          wrap.position.y = -0.02 - i * 0.032;
          wrap.rotation.y = rand();
          group.add(wrap);
        }
        return group;
      },

      // ---- 142: Stone-Studded Club --------------------------------------------
      createStoneStuddedClubModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x7A5230);
        const stone = this._mat(0x76797E, { roughness: 0.95, metalness: 0.05 });
        const sinew = this._wood(0xB89A5A);

        const club = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.024, 0.48, this.seg(10, 6)), wood);
        club.position.y = 0.2;
        group.add(club);
        // River stones set into sockets and lashed in, one row per binding.
        const rows = this.isLowDetail() ? 2 : 4;
        for (let r = 0; r < rows; r++) {
          const y = 0.22 + r * 0.06;
          const per = 3;
          for (let i = 0; i < per; i++) {
            const a = (i / per) * Math.PI * 2 + r * 0.7;
            const rad = 0.03 + (y / 0.5) * 0.02;
            const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.019, 0), stone);
            s.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
            s.rotation.set(rand(), rand(), rand());
            s.scale.set(1, 0.9, 0.7);
            group.add(s);
          }
          const lash = new THREE.Mesh(new THREE.TorusGeometry(0.034 + (y / 0.5) * 0.016, 0.004, this.seg(4, 3), this.seg(10, 6)), sinew);
          lash.rotation.x = Math.PI / 2;
          lash.position.y = y - 0.03;
          group.add(lash);
        }
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.044, this.seg(9, 6), this.seg(6, 4)), wood);
        cap.scale.y = 0.5;
        cap.position.y = 0.44;
        group.add(cap);
        this._hilt(group, rand, { height: 0.14, rTop: 0.022, rBot: 0.026, mat: wood, wrapMat: sinew, offset: -0.04 });
        return group;
      },

      // ---- 143: Blackjack -----------------------------------------------------
      createBlackjackModel(weapon, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0x18140F, { roughness: 0.85, metalness: 0.05 });
        const stitch = this._wood(0x6B5A3A);
        const lead = this._mat(0x5B5B66, { roughness: 0.6, metalness: 0.7 });

        // Small, quiet, and legally somebody else's problem: a lead slug in a
        // leather pocket on a springy shaft.
        this._hilt(group, rand, { height: 0.12, rTop: 0.014, rBot: 0.016, mat: leather, wrapMat: stitch });
        const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.09, this.seg(8, 5)), leather);
        spring.position.y = 0.045;
        group.add(spring);
        const head = this.chainRig(group, {
          links: 3, length: 0.05, linkMat: leather, rope: true, linkTube: 0.006,
          y: 0.09, endMass: 6.0, damping: 0.86
        });
        const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.028, this.seg(10, 6), this.seg(7, 5)), leather);
        pouch.scale.set(0.65, 1.25, 0.65);
        head.add(pouch);
        const slug = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, this.seg(9, 6)), lead);
        head.add(slug);
        // The seam up the side, which is the only decoration it has.
        for (let i = 0; i < 4; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.005, 0.002), stitch);
          st.position.set(0.018, -0.02 + i * 0.014, 0);
          head.add(st);
        }
        const wristLoop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(9, 6)), leather);
        wristLoop.position.y = -0.135;
        group.add(wristLoop);
        return group;
      },

      // ---- 144: Stone Flail ---------------------------------------------------
      createStoneFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x6E4A2A);
        const stone = this._mat(0x6E7278, { roughness: 0.98, metalness: 0.03 });
        const sinew = this._wood(0xB89A5A);

        this._hilt(group, rand, { height: 0.3, rTop: 0.02, rBot: 0.018, mat: wood, wrapMat: sinew, offset: -0.02 });
        const head = this.chainRig(group, {
          links: 4, length: 0.14, linkMat: sinew, rope: true, linkTube: 0.005, endMass: 5.0
        });
        // A rock, chosen for being about the right shape, and bound on.
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.055, 0), stone);
        rock.rotation.set(rand(), rand(), rand());
        rock.scale.set(1, 1.15, 0.9);
        head.add(rock);
        // The lashing that holds it, crossed over the top.
        for (let i = 0; i < 3; i++) {
          const bind = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, this.seg(4, 3), this.seg(10, 6)), sinew);
          bind.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
          head.add(bind);
        }
        return group;
      },

      // ---- 145: War Club ------------------------------------------------------
      createWarClubModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._wood(this.getRandomColor(rand, [0x3A2A1C, 0x4A3524, 0x2A1F14]));
        const inlay = this._cast(0xB9902A);
        const cord = this._wood(0xB03A2E);

        // Carved from ironwood in one piece, with a ridged striking edge.
        const blade = this._plate([
          [-0.026, 0.0], [-0.05, 0.22], [-0.042, 0.44], [0.0, 0.5],
          [0.042, 0.44], [0.05, 0.22], [0.026, 0.0]
        ], 0.03, iron);
        group.add(blade);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.46, 0.036), iron);
        ridge.position.y = 0.25;
        group.add(ridge);
        // Notches cut along both edges, one per something.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            for (const s of [-1, 1]) {
              const notch = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.032), inlay);
              notch.position.set(s * 0.045, 0.14 + i * 0.055, 0);
              group.add(notch);
            }
          }
        }
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.02, this.seg(9, 6)), inlay);
        group.add(collar);
        this._hilt(group, rand, { height: 0.2, rTop: 0.022, rBot: 0.026, mat: iron, wrapMat: cord, offset: -0.012 });
        const butt = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(9, 6), this.seg(6, 4)), iron);
        butt.scale.y = 0.7;
        butt.position.y = -0.218;
        group.add(butt);
        return group;
      },

      // ---- 146: Shark Tooth Club ----------------------------------------------
      createSharkToothClubModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0xB08048);
        const tooth = this._mat(0xE8E0CC, { roughness: 0.55, metalness: 0.05 });
        const cord = this._wood(0x8A6236);

        // A tebutje: a flat wooden blade with shark teeth bound down both
        // edges, each one drilled and lashed through.
        const paddle = this._plate([
          [-0.035, 0.0], [-0.045, 0.24], [-0.038, 0.46], [0.0, 0.5],
          [0.038, 0.46], [0.045, 0.24], [0.035, 0.0]
        ], 0.018, wood);
        group.add(paddle);
        const rows = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < rows; i++) {
          const t = i / (rows - 1);
          const y = 0.06 + t * 0.4;
          for (const s of [-1, 1]) {
            const x = s * (0.035 + Math.sin(t * Math.PI) * 0.008);
            const th = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.028, 3), tooth);
            th.position.set(x, y, 0);
            th.rotation.z = -s * (Math.PI / 2 - 0.35);
            th.scale.z = 0.45;
            group.add(th);
            const bind = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, this.seg(4, 3), this.seg(8, 5)), cord);
            bind.position.set(x * 0.82, y, 0);
            bind.rotation.y = Math.PI / 2;
            group.add(bind);
          }
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.02, rBot: 0.022, mat: wood, wrapMat: cord, sides: 5, offset: -0.006 });
        return group;
      },

      // ---- 147: Sarcastic Pillow ----------------------------------------------
      createSarcasticPillowModel(weapon, rand) {
        const group = new THREE.Group();
        const linenColor = this.getRandomColor(rand, [0xE8E2D2, 0xD8C8E0, 0xC8D8E0]);
        const linen = this._mat(linenColor, { roughness: 1.0, metalness: 0.0 });
        const stripe = this._mat(0x8AA0C0, { roughness: 1.0, metalness: 0.0 });
        const brick = this._mat(0xA0442E, { roughness: 0.95, metalness: 0.05 });

        // Entirely soft, apart from the part that is not.
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, this.seg(12, 7), this.seg(9, 6)), linen);
        body.scale.set(1, 1.25, 0.5);
        body.position.y = 0.24;
        group.add(body);
        // Corner tufts, which is what makes a shape read as a pillow.
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const corner = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(8, 5), this.seg(6, 4)), linen);
          corner.scale.set(1, 1, 0.5);
          corner.position.set(sx * 0.085, 0.24 + sy * 0.11, 0);
          group.add(corner);
        }
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.24, 0.112), stripe);
          band.position.set(-0.05 + i * 0.05, 0.24, 0);
          group.add(band);
        }
        // The brick, showing through a seam that has given up.
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.036, 0.036), brick);
        b.position.set(0.02, 0.16, 0.02);
        b.rotation.z = 0.2;
        group.add(b);
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.04), linen);
        split.position.set(0.02, 0.185, 0.03);
        split.rotation.z = 0.2;
        group.add(split);

        const corner2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.14, this.seg(9, 6)), linen);
        corner2.position.y = 0.07;
        group.add(corner2);
        this._hilt(group, rand, { height: 0.12, rTop: 0.019, rBot: 0.016, mat: linen, sides: this.seg(9, 6), offset: 0.0 });
        return group;
      },

      // ---- 148: Bronze Flail --------------------------------------------------
      createBronzeFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(0xB8860B, { roughness: 0.42, metalness: 0.88 });
        const patina = this._mat(0x3E8B74, { roughness: 0.85, metalness: 0.35 });
        const leather = this._wood(0x4A3524);

        this._hilt(group, rand, { height: 0.3, rTop: 0.02, rBot: 0.018, mat: leather, wrapMat: bronze, offset: -0.02 });
        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.026, this.seg(9, 6)), bronze);
        group.add(ferrule);
        const head = this.chainRig(group, {
          links: 5, length: 0.16, linkMat: bronze, linkRadius: 0.013, endMass: 4.5
        });
        // Cast head with raised bands and the verdigris that always finds the
        // places a cloth cannot.
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(11, 7), this.seg(8, 5)), bronze);
        head.add(ball);
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, this.seg(4, 3), this.seg(12, 7)), bronze);
          band.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
          head.add(band);
        }
        const studs = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < studs; i++) {
          const phi = Math.acos(1 - 2 * (i + 0.5) / studs);
          const theta = Math.PI * (1 + Math.sqrt(5)) * i;
          const stud = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.02, this.seg(5, 4)), patina);
          const n = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
          stud.position.copy(n).multiplyScalar(0.055);
          stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
          head.add(stud);
        }
        return group;
      },

      // ---- 149: Master Flipper ------------------------------------------------
      createMasterFlipperModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xD2D7DC, 0.25);
        const handle = this._mat(0x1B1B1F, { roughness: 0.7, metalness: 0.1 });
        const rivet = this._cast(0xB9902A);

        // A professional turner: offset blade, slotted, and beaten flat by
        // years of service.
        const blade = this._plate([
          [-0.06, 0.0], [-0.062, 0.13], [-0.05, 0.16], [0.05, 0.16], [0.062, 0.13], [0.06, 0.0]
        ], 0.004, steel);
        blade.position.y = 0.26;
        group.add(blade);
        const slots = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < slots; i++) {
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.006), handle);
          slot.position.set(-0.04 + i * 0.02, 0.31, 0);
          group.add(slot);
        }
        const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.006), steel);
        bevel.position.y = 0.262;
        group.add(bevel);
        // The crank that offsets the blade above the pan.
        const neck = this._plate([[-0.012, 0.0], [0.012, 0.0], [0.012, 0.06], [-0.012, 0.06]], 0.008, steel);
        neck.position.y = 0.2;
        neck.rotation.x = -0.5;
        group.add(neck);
        const tang = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.006), steel);
        tang.position.y = 0.13;
        group.add(tang);
        for (const s of [-1, 1]) {
          const scale = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.13, 0.009), handle);
          scale.position.set(0, 0.03, s * 0.008);
          group.add(scale);
        }
        this._rivets(group, rivet, 3, 0.075, -0.04, 0.005, 0.014);
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(4, 3), this.seg(9, 6)), steel);
        loop.position.y = -0.05;
        group.add(loop);
        return group;
      },

      // ---- 150: Mere Club -----------------------------------------------------
      createMereClubModel(weapon, rand) {
        const group = new THREE.Group();
        const greenstoneColor = this.getRandomColor(rand, [0x3E6B4A, 0x2E5B44, 0x4A7A52]);
        const greenstone = this._mat(greenstoneColor, { roughness: 0.22, metalness: 0.15 });
        const sheen = this._glow(0x8AD8A8, 0.18);
        const flax = this._wood(0xC8A870);

        // Pounamu, ground and polished for months: a flat teardrop with a
        // sharpened rim, held low and used to thrust, not swing.
        const blade = this._plate([
          [-0.052, 0.0], [-0.062, 0.14], [-0.05, 0.3], [0.0, 0.36],
          [0.05, 0.3], [0.062, 0.14], [0.052, 0.0]
        ], 0.026, greenstone);
        group.add(blade);
        const lens = this._plate([
          [-0.04, 0.03], [-0.048, 0.15], [0.0, 0.32], [0.048, 0.15], [0.04, 0.03]
        ], 0.03, sheen);
        group.add(lens);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, this.seg(4, 3), this.seg(14, 8)), greenstone);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.18;
        rim.scale.set(1, 2.0, 1);
        group.add(rim);

        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.14, this.seg(10, 6)), greenstone);
        grip.position.y = -0.06;
        grip.scale.z = 0.6;
        group.add(grip);
        // The drilled hole and its flax wrist cord: no mere is without one.
        const hole = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, this.seg(4, 3), this.seg(9, 6)), greenstone);
        hole.position.y = -0.11;
        group.add(hole);
        for (let i = 0; i < 3; i++) {
          const cord = new THREE.Mesh(new THREE.TorusGeometry(0.016 + i * 0.005, 0.0035, this.seg(4, 3), this.seg(10, 6)), flax);
          cord.position.y = -0.125 - i * 0.012;
          cord.rotation.x = Math.PI / 2 + 0.3;
          group.add(cord);
        }
        return group;
      },

      // ---- 151: Tessen --------------------------------------------------------
      createTessenModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x2A2C30, { roughness: 0.4, metalness: 0.85 });
        const gold = this._cast(0xD9A62A);
        const paperColor = this.getRandomColor(rand, [0xE8DFC8, 0xC03A32, 0x1E2A4A]);
        const paper = this._mat(paperColor, { roughness: 0.9, metalness: 0.02 });
        const cord = this._wood(0x6B1030);

        // A war fan: the outer ribs are solid iron plates and the leaf between
        // them is only there for the look of the thing.
        const ribs = this.isLowDetail() ? 5 : 8;
        const spread = 1.5;
        for (let i = 0; i < ribs; i++) {
          const a = -spread / 2 + (i / (ribs - 1)) * spread;
          const outer = i === 0 || i === ribs - 1;
          const rib = new THREE.Mesh(new THREE.BoxGeometry(outer ? 0.014 : 0.007, 0.34, outer ? 0.008 : 0.004), outer ? iron : gold);
          rib.position.set(Math.sin(a) * 0.15, 0.17 + Math.cos(a) * 0.02, 0);
          rib.rotation.z = -a;
          group.add(rib);
        }
        // The leaf, in wedges between the ribs.
        for (let i = 0; i < ribs - 1; i++) {
          const a = -spread / 2 + ((i + 0.5) / (ribs - 1)) * spread;
          const leaf = this._plate([[-0.03, 0.1], [0.03, 0.1], [0.05, 0.33], [-0.05, 0.33]], 0.002, paper);
          leaf.position.set(Math.sin(a) * 0.14, Math.cos(a) * 0.01, 0);
          leaf.rotation.z = -a;
          group.add(leaf);
        }
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.01), iron);
        spine.position.y = 0.33;
        group.add(spine);
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.024, this.seg(10, 6)), gold);
        pivot.rotation.x = Math.PI / 2;
        group.add(pivot);
        this._hilt(group, rand, { height: 0.1, rTop: 0.014, rBot: 0.016, mat: iron, wrapMat: cord, offset: -0.012 });
        const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.05, this.seg(5, 3)), cord);
        tassel.position.y = -0.14;
        tassel.userData.sway = { axis: 'z', amp: 0.22, freq: 1.2 };
        group.add(tassel);
        return group;
      },

      // ---- 152: Honking Mallet Duo --------------------------------------------
      createHonkingMalletDuoModel(weapon, rand) {
        const group = new THREE.Group();
        const red = this._mat(0xD62828, { roughness: 0.55, metalness: 0.05 });
        const blue = this._mat(0x1D6FD6, { roughness: 0.55, metalness: 0.05 });
        const yellow = this._mat(0xF5C518, { roughness: 0.6, metalness: 0.05 });
        const rubber = this._mat(0x1A1A1C, { roughness: 0.9, metalness: 0.02 });

        // Two of them, because one squeaky mallet is not a weapon.
        const build = (x, tilt, mat, phase) => {
          const m = new THREE.Group();
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, this.seg(12, 7)), mat);
          barrel.rotation.z = Math.PI / 2;
          barrel.position.y = 0.3;
          m.add(barrel);
          for (const s of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.02, this.seg(12, 7)), yellow);
            cap.rotation.z = Math.PI / 2;
            cap.position.set(s * 0.075, 0.3, 0);
            m.add(cap);
          }
          const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.007, this.seg(4, 3), this.seg(12, 7)), yellow);
          stripe.position.y = 0.3;
          m.add(stripe);
          // The bulb horn, which is the actual mechanism.
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(9, 6), this.seg(7, 5)), rubber);
          bulb.position.y = 0.22;
          bulb.userData.pulse = { min: 0.9, max: 1.0, freq: 3 };
          bulb.userData.bob = { axis: 'y', amp: 0.006, freq: 2.4, phase: phase };
          m.add(bulb);
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.26, this.seg(9, 6)), mat);
          shaft.position.y = 0.09;
          m.add(shaft);
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.09, this.seg(9, 6)), rubber);
          grip.position.y = -0.06;
          m.add(grip);
          m.position.x = x;
          m.rotation.z = tilt;
          return m;
        };
        group.add(build(-0.04, 0.16, red, 0));
        const second = build(0.05, -0.2, blue, 1.6);
        second.position.z = -0.04;
        second.scale.setScalar(0.92);
        group.add(second);
        return group;
      },

      // ---- 153: Macuahuitl ----------------------------------------------------
      createMacuahuitlModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x8A6236);
        const glass = this._mat(0x14121A, { roughness: 0.05, metalness: 0.3 });
        const resin = this._mat(0x2A1F14, { roughness: 0.8, metalness: 0.1 });
        const feather = this._mat(this.getRandomColor(rand, [0x1E9B6B, 0xC03A32, 0x1E4A9B]), { roughness: 0.9, metalness: 0.05 });

        // A flat hardwood paddle with obsidian blades set into grooves along
        // both edges, one after another with barely a gap.
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.5, 0.024), wood);
        paddle.position.y = 0.28;
        group.add(paddle);
        const blades = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < blades; i++) {
          const t = i / (blades - 1);
          const y = 0.08 + t * 0.42;
          for (const s of [-1, 1]) {
            const shard = this._plate([[0, -0.028], [s * 0.03, -0.02], [s * 0.034, 0.02], [0, 0.028]], 0.012, glass);
            shard.position.set(s * 0.042, y, 0);
            group.add(shard);
            const set = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.026), resin);
            set.position.set(s * 0.036, y, 0);
            group.add(set);
          }
        }
        const tipShard = this._plate([[-0.03, 0.53], [0.03, 0.53], [0.0, 0.575]], 0.014, glass);
        group.add(tipShard);
        // Feather trim at the throat, which every real one had.
        for (let i = 0; i < 4; i++) {
          const f = this._plate([[0, 0], [0.012, 0.02], [0.006, 0.05], [-0.006, 0.05], [-0.012, 0.02]], 0.002, feather);
          f.position.set(-0.03 + i * 0.02, 0.02, 0.014);
          f.rotation.z = (i - 1.5) * 0.25;
          f.userData.sway = { axis: 'z', amp: 0.1, freq: 1.3, phase: i };
          group.add(f);
        }
        this._hilt(group, rand, { height: 0.18, rTop: 0.022, rBot: 0.024, mat: wood, sides: 4, flat: 0.7, offset: -0.005 });
        return group;
      },

      // ---- 154: Number One Fan ------------------------------------------------
      createNumberOneFanModel(weapon, rand) {
        const group = new THREE.Group();
        const foamColor = this.getRandomColor(rand, [0xE8342B, 0x1D6FD6, 0xF5C518, 0x1E9B4B]);
        const foam = this._mat(foamColor, { roughness: 1.0, metalness: 0.0 });
        const print = this._mat(0xF4F4F0, { roughness: 1.0, metalness: 0.0 });

        // A giant foam hand with one finger up, and the seam down the side
        // where the two halves were glued.
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.05), foam);
        palm.position.y = 0.24;
        group.add(palm);
        const index = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.19, this.seg(10, 6)), foam);
        index.position.set(-0.035, 0.41, 0);
        group.add(index);
        const fingertip = new THREE.Mesh(new THREE.SphereGeometry(0.032, this.seg(10, 6), this.seg(7, 5)), foam);
        fingertip.position.set(-0.035, 0.5, 0);
        fingertip.scale.z = 0.78;
        group.add(fingertip);
        // The folded fingers, as three ridges across the palm.
        for (let i = 0; i < 3; i++) {
          const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, this.seg(9, 6)), foam);
          knuckle.rotation.z = Math.PI / 2;
          knuckle.position.set(0.02, 0.29 - i * 0.045, 0);
          knuckle.scale.z = 0.8;
          group.add(knuckle);
        }
        const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.08, this.seg(9, 6)), foam);
        thumb.position.set(0.075, 0.26, 0.012);
        thumb.rotation.z = -0.9;
        group.add(thumb);
        // The one on the palm, printed on both sides.
        for (const z of [0.026, -0.026]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.003), print);
          bar.position.set(-0.01, 0.25, z);
          group.add(bar);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.003), print);
          foot.position.set(-0.01, 0.208, z);
          group.add(foot);
          const flag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.003), print);
          flag.position.set(-0.026, 0.288, z);
          flag.rotation.z = 0.5;
          group.add(flag);
        }
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.07, this.seg(10, 6)), foam);
        cuff.position.y = 0.13;
        cuff.scale.z = 0.6;
        group.add(cuff);
        return group;
      },

      // ---- 155: Meteor Hammer -------------------------------------------------
      createMeteorHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x3A3E44, { roughness: 0.5, metalness: 0.8 });
        const rope = this._wood(0x8A6236);
        const brass = this._cast(0xB9902A);

        // No handle worth the name: a long rope with a weight at each end, and
        // the hand somewhere in the middle.
        const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.11, this.seg(9, 6)), rope);
        wrap.position.y = -0.05;
        group.add(wrap);
        for (let i = 0; i < 5; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, this.seg(4, 3), this.seg(9, 6)), rope);
          coil.rotation.x = Math.PI / 2;
          coil.position.y = -0.005 - i * 0.024;
          group.add(coil);
        }
        const makeWeight = (head, r) => {
          const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), iron);
          head.add(ball);
          const collar = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.005, this.seg(4, 3), this.seg(10, 6)), brass);
          collar.rotation.x = Math.PI / 2;
          collar.position.y = -r * 0.8;
          head.add(collar);
          const ridges = this.isLowDetail() ? 2 : 4;
          for (let i = 0; i < ridges; i++) {
            const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.004, this.seg(4, 3), this.seg(10, 6)), brass);
            band.rotation.set(Math.PI / 2, 0, (i / ridges) * Math.PI);
            head.add(band);
          }
        };
        makeWeight(this.chainRig(group, {
          links: 9, length: 0.34, linkMat: rope, rope: true, linkTube: 0.0045, endMass: 5.0
        }), 0.05);
        makeWeight(this.chainRig(group, {
          links: 5, length: 0.16, linkMat: rope, rope: true, linkTube: 0.0045,
          y: -0.11, endMass: 3.0, gravity: -0.0011
        }), 0.032);
        return group;
      },

      // ---- 156: Medieval Flail ------------------------------------------------
      createMedievalFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.82 });
        const bright = this._steel(0xB6BBC0, 0.3);
        const wood = this._wood(0x4A3524);

        this._hilt(group, rand, { height: 0.3, rTop: 0.021, rBot: 0.018, mat: wood, wrapMat: steel, offset: -0.02 });
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.024, this.seg(9, 6)), steel);
        group.add(cap);
        const swivel = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, this.seg(4, 3), this.seg(10, 6)), bright);
        swivel.rotation.x = Math.PI / 2;
        swivel.position.y = 0.014;
        group.add(swivel);
        const head = this.chainRig(group, {
          links: 5, length: 0.17, linkMat: bright, linkRadius: 0.014, endMass: 4.5
        });
        head.add(this.spikeBall(0.048, steel, { spikes: 12, spikeLength: 0.03, spikeMat: bright }));
        return group;
      },

      // ---- 157: Flail ---------------------------------------------------------
      createPlainFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x63686D, { roughness: 0.65, metalness: 0.75 });
        const wood = this._wood(0x6E4A2A);

        // The plain one: a haft, two links and a lump.
        this._hilt(group, rand, { height: 0.32, rTop: 0.02, rBot: 0.017, mat: wood, wrapMat: wood, offset: -0.02 });
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.005, this.seg(4, 3), this.seg(10, 6)), iron);
        eye.rotation.x = Math.PI / 2;
        group.add(eye);
        const head = this.chainRig(group, {
          links: 3, length: 0.1, linkMat: iron, linkRadius: 0.016, linkTube: 0.005, endMass: 4.0
        });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.046, this.seg(10, 6), this.seg(7, 5)), iron);
        head.add(ball);
        const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.004, this.seg(4, 3), this.seg(9, 6)), iron);
        eyelet.position.y = -0.05;
        head.add(eyelet);
        return group;
      },

      // ---- 158: Flanged Mace --------------------------------------------------
      createFlangedMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x74797F, { roughness: 0.5, metalness: 0.82 });
        const bright = this._steel(0xC0C5CA, 0.28);
        const leather = this._wood(0x3A2A1C);

        // Six flanges round a shaft: made to get through armour that a ball
        // would only dent.
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, this.seg(10, 6)), steel);
        core.position.y = 0.34;
        group.add(core);
        const flanges = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < flanges; i++) {
          const a = (i / flanges) * Math.PI * 2;
          const fin = this._plate([[-0.012, -0.05], [0.012, -0.05], [0.04, -0.02], [0.04, 0.02], [0.012, 0.05], [-0.012, 0.05]], 0.012, bright);
          fin.position.set(Math.cos(a) * 0.03, 0.34, Math.sin(a) * 0.03);
          fin.rotation.set(0, -a + Math.PI / 2, 0);
          group.add(fin);
        }
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.04, this.seg(10, 6)), bright);
        crown.position.y = 0.41;
        group.add(crown);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.022, this.seg(10, 6)), bright);
        collar.position.y = 0.283;
        group.add(collar);
        this._hilt(group, rand, { height: 0.38, rTop: 0.019, rBot: 0.017, mat: leather, wrapMat: leather, offset: 0.27 });
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(9, 6), this.seg(6, 4)), bright);
        pommel.scale.y = 0.7;
        pommel.position.y = -0.115;
        group.add(pommel);
        return group;
      },

      // ---- 159: Lucerne Hammer ------------------------------------------------
      createLucerneHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.55, metalness: 0.8 });
        const bright = this._steel(0xBFC4C9, 0.3);
        const ash = this._wood(0xB08048);

        // Polearm: a long spike to thrust with, a three-pronged hammer to break
        // plate, and a fluke on the back to pull a rider down.
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.2, 4), bright);
        spike.position.y = 0.62;
        group.add(spike);
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.09, this.seg(10, 6)), steel);
        socket.position.y = 0.48;
        group.add(socket);
        // The three prongs of the hammer face.
        for (let i = 0; i < 3; i++) {
          const prong = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.05), bright);
          prong.position.set(0.045, 0.51 - i * 0.022, 0);
          group.add(prong);
          const point = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.02, 4), bright);
          point.position.set(0.068, 0.51 - i * 0.022, 0);
          point.rotation.z = -Math.PI / 2;
          group.add(point);
        }
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), steel);
        cheek.position.set(0.03, 0.49, 0);
        group.add(cheek);
        // The fluke, curving back and down.
        const fluke = this._plate([[0, 0], [-0.07, 0.02], [-0.1, -0.02], [-0.06, -0.02], [-0.02, -0.03]], 0.014, bright);
        fluke.position.set(-0.02, 0.5, 0);
        group.add(fluke);
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.62, this.seg(9, 6)), ash);
        haft.position.y = 0.16;
        group.add(haft);
        // Langets down the haft, so it cannot be cut through.
        for (const s of [-1, 1]) {
          const langet = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.16, 0.026), steel);
          langet.position.set(s * 0.016, 0.38, 0);
          group.add(langet);
        }
        return group;
      },

      // ---- 160: War Hammer ----------------------------------------------------
      createWarHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x63686D, { roughness: 0.55, metalness: 0.8 });
        const bright = this._steel(0xC0C5CA, 0.28);
        const leather = this._wood(0x3A2A1C);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.06), steel);
        head.position.set(0.02, 0.42, 0);
        group.add(head);
        // A waffled face, which is what stops it skating off a helmet.
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.062, 0.062), bright);
        face.position.set(0.078, 0.42, 0);
        group.add(face);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const groove = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.064), steel);
            groove.position.set(0.084, 0.4 + i * 0.014, 0);
            group.add(groove);
          }
        }
        // Back spike, and a spike on top too.
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 4), bright);
        beak.position.set(-0.07, 0.42, 0);
        beak.rotation.z = Math.PI / 2;
        group.add(beak);
        const topSpike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.07, 4), bright);
        topSpike.position.set(0.02, 0.48, 0);
        group.add(topSpike);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.066, this.seg(9, 6)), steel);
        eye.position.set(0.02, 0.42, 0);
        group.add(eye);
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.48, this.seg(9, 6)), leather);
        haft.position.y = 0.18;
        group.add(haft);
        for (const s of [-1, 1]) {
          const langet = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.12, 0.024), steel);
          langet.position.set(0.02 + s * 0.017, 0.34, 0);
          group.add(langet);
        }
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.03, this.seg(9, 6)), bright);
        butt.position.y = -0.07;
        group.add(butt);
        return group;
      },

      // ---- 161: Flanged War Mace ----------------------------------------------
      createFlangedWarMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x5E6368, { roughness: 0.52, metalness: 0.84 });
        const bright = this._steel(0xCBD0D5, 0.24);
        const gold = this._cast(0xB9902A);
        const leather = this._wood(0x2A1F14);

        // The heavier cousin of the flanged mace: taller head, more of them,
        // and a crown of points over the top.
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, this.seg(10, 6)), steel);
        core.position.y = 0.36;
        group.add(core);
        const flanges = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < flanges; i++) {
          const a = (i / flanges) * Math.PI * 2;
          const fin = this._plate([[-0.014, -0.07], [0.014, -0.07], [0.048, -0.03], [0.05, 0.03], [0.014, 0.07], [-0.014, 0.07]], 0.013, bright);
          fin.position.set(Math.cos(a) * 0.032, 0.36, Math.sin(a) * 0.032);
          fin.rotation.set(0, -a + Math.PI / 2, 0);
          group.add(fin);
          const point = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.028, 4), gold);
          point.position.set(Math.cos(a) * 0.022, 0.445, Math.sin(a) * 0.022);
          group.add(point);
        }
        const finial = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, this.seg(9, 6)), gold);
        finial.position.y = 0.46;
        group.add(finial);
        for (const y of [0.284, 0.436]) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(12, 7)), gold);
          band.rotation.x = Math.PI / 2;
          band.position.y = y;
          group.add(band);
        }
        this._hilt(group, rand, { height: 0.4, rTop: 0.021, rBot: 0.018, mat: leather, wrapMat: gold, offset: 0.28 });
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, this.seg(9, 6), this.seg(6, 4)), gold);
        pommel.scale.y = 0.75;
        pommel.position.y = -0.126;
        group.add(pommel);
        return group;
      },

      // ---- 162: Morning Star --------------------------------------------------
      createMorningStarModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x6E7378, { roughness: 0.55, metalness: 0.8 });
        const bright = this._steel(0xC4C9CE, 0.26);
        const wood = this._wood(0x4A3524);

        this._hilt(group, rand, { height: 0.32, rTop: 0.021, rBot: 0.018, mat: wood, wrapMat: steel, offset: -0.02 });
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.022, 0.026, this.seg(10, 6)), steel);
        group.add(cap);
        const head = this.chainRig(group, {
          links: 4, length: 0.15, linkMat: bright, linkRadius: 0.015, linkTube: 0.0045, endMass: 5.0
        });
        // The long spikes are what separate a morning star from a flail head.
        head.add(this.spikeBall(0.05, steel, { spikes: 14, spikeLength: 0.05, spikeSides: 4, spikeMat: bright }));
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 4), bright);
        crown.position.y = 0.075;
        head.add(crown);
        return group;
      },

      // ---- 163: War Pick ------------------------------------------------------
      createWarPickModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x5E6368, { roughness: 0.55, metalness: 0.82 });
        const bright = this._steel(0xC0C5CA, 0.26);
        const leather = this._wood(0x2E2118);

        // All the weight behind one point, on a long curve so it does not stop
        // when it goes in.
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0.42, 0),
          new THREE.Vector3(0.1, 0.44, 0),
          new THREE.Vector3(0.18, 0.36, 0)
        );
        const beak = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(8, 5), 0.014, this.seg(6, 4), false), steel);
        group.add(beak);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), bright);
        tip.position.set(0.195, 0.335, 0);
        tip.rotation.z = -1.1;
        group.add(tip);
        // Hammer poll on the other side to balance it.
        const poll = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), steel);
        poll.position.set(-0.045, 0.42, 0);
        group.add(poll);
        const pollFace = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.052, 0.052), bright);
        pollFace.position.set(-0.074, 0.42, 0);
        group.add(pollFace);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.056, this.seg(9, 6)), steel);
        eye.position.y = 0.42;
        group.add(eye);
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.48, this.seg(9, 6)), leather);
        haft.position.y = 0.18;
        group.add(haft);
        for (const s of [-1, 1]) {
          const langet = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.13, 0.024), steel);
          langet.position.set(s * 0.017, 0.34, 0);
          group.add(langet);
        }
        const spikeButt = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, this.seg(8, 5)), bright);
        spikeButt.position.y = -0.085;
        spikeButt.rotation.x = Math.PI;
        group.add(spikeButt);
        return group;
      },

      // ---- 164: Training Nunchaku ---------------------------------------------
      createTrainingNunchakuModel(weapon, rand) {
        const group = this.createNunchakuModel(weapon, rand);
        const foamColor = this.getRandomColor(rand, [0x1D6FD6, 0xE8342B, 0x1E9B4B]);
        const foam = this._mat(foamColor, { roughness: 1.0, metalness: 0.0 });
        const cord = this._wood(0xE8E2D2);
        const tape = this._mat(0xF5C518, { roughness: 0.9, metalness: 0.02 });

        // Padded, brightly coloured and completely harmless, which is the point
        // of a training pair.
        const chain = group.userData._verletRope;
        if (chain) for (const link of chain.segmentMeshes) link.material = cord;
        for (const x of [-0.024, 0.024]) {
          const yBase = x > 0 ? -0.16 : -0.09;
          const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.021, 0.17, this.seg(10, 6)), foam);
          sleeve.position.set(x, yBase, 0);
          group.add(sleeve);
          for (let i = 0; i < 2; i++) {
            const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.005, this.seg(4, 3), this.seg(10, 6)), tape);
            stripe.rotation.x = Math.PI / 2;
            stripe.position.set(x, yBase - 0.05 + i * 0.1, 0);
            group.add(stripe);
          }
          const bumper = new THREE.Mesh(new THREE.SphereGeometry(0.023, this.seg(9, 6), this.seg(6, 4)), foam);
          bumper.scale.y = 0.7;
          bumper.position.set(x, yBase - 0.085, 0);
          group.add(bumper);
        }
        return group;
      },

      // ---- 165: Heavy Chain ---------------------------------------------------
      createHeavyChainModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x5A5E64, { roughness: 0.6, metalness: 0.8 });
        const rust = this._mat(0x8A4B22, { roughness: 0.95, metalness: 0.35 });
        const rag = this._wood(0x33332E);

        // Not a weapon anybody made: a length of dock chain with the end
        // wrapped so it can be held.
        for (let i = 0; i < 5; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.032, 0.042), rag);
          wrap.position.y = -0.03 - i * 0.034;
          wrap.rotation.y = rand();
          group.add(wrap);
        }
        const head = this.chainRig(group, {
          links: 11, length: 0.46, linkMat: iron, linkRadius: 0.022, linkTube: 0.007, endMass: 6.0
        });
        // A shackle and a hook on the far end, still attached to nothing.
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.5), rust);
        shackle.rotation.x = Math.PI / 2;
        head.add(shackle);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(8, 5)), rust);
        pin.rotation.z = Math.PI / 2;
        pin.position.y = -0.02;
        head.add(pin);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.2), rust);
        hook.position.y = 0.05;
        hook.rotation.set(Math.PI / 2, 0, 0.6);
        head.add(hook);
        return group;
      },

      // ---- 166: Spiked Battle Shield ------------------------------------------
      createSpikedBattleShieldModel(weapon, rand) {
        const group = new THREE.Group();
        const plank = this._wood(0x6E4A2A);
        const iron = this._mat(0x63686D, { roughness: 0.6, metalness: 0.78 });
        const bright = this._steel(0xB6BBC0, 0.32);
        const paintColor = this.getRandomColor(rand, [0xB03A2E, 0x1F4FA0, 0x1E6B3A]);
        const paint = this._mat(paintColor, { roughness: 0.85, metalness: 0.05 });

        // A shield swung as a weapon: the boss is the striking face and the
        // rim spikes do the rest.
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.022, this.seg(16, 9)), plank);
        face.rotation.x = Math.PI / 2;
        face.position.y = 0.22;
        group.add(face);
        const front = new THREE.Mesh(new THREE.CylinderGeometry(0.122, 0.122, 0.004, this.seg(16, 9)), paint);
        front.rotation.x = Math.PI / 2;
        front.position.set(0, 0.22, 0.014);
        group.add(front);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, this.seg(4, 3), this.seg(20, 11)), iron);
        rim.position.y = 0.22;
        group.add(rim);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.038, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), iron);
        boss.rotation.x = Math.PI / 2;
        boss.position.set(0, 0.22, 0.016);
        group.add(boss);
        const bossSpike = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.07, this.seg(8, 5)), bright);
        bossSpike.rotation.x = Math.PI / 2;
        bossSpike.position.set(0, 0.22, 0.07);
        group.add(bossSpike);
        const spikes = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), bright);
          sp.position.set(Math.cos(a) * 0.155, 0.22 + Math.sin(a) * 0.155, 0);
          sp.rotation.z = a - Math.PI / 2;
          group.add(sp);
        }
        if (this.wantsTrim()) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.4;
            const stud = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(6, 4), this.seg(5, 4)), iron);
            stud.position.set(Math.cos(a) * 0.09, 0.22 + Math.sin(a) * 0.09, 0.016);
            group.add(stud);
          }
        }
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.008), plank);
        strap.position.set(0, 0.22, -0.016);
        group.add(strap);
        this._hilt(group, rand, { height: 0.16, rTop: 0.019, rBot: 0.021, mat: iron, wrapMat: plank, offset: 0.07 });
        return group;
      },

      // ---- 167: Variable Chain Hammer -----------------------------------------
      createVariableChainHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x8A8F95, { roughness: 0.4, metalness: 0.9 });
        const dark = this._mat(0x2C3037, { roughness: 0.5, metalness: 0.75 });
        const warn = this._glow(0xFFB300, 0.7);

        // A hammer that stops being a hammer: the head runs out on a chain and
        // the telescoping shaft pays it out.
        const stack = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < stack; i++) {
          const t = i / stack;
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.024 - t * 0.005, 0.026 - t * 0.005, 0.09, this.seg(10, 6)), i % 2 ? dark : alloy);
          seg.position.y = -0.12 + i * 0.088;
          group.add(seg);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026 - t * 0.005, 0.004, this.seg(4, 3), this.seg(10, 6)), warn);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.076 + i * 0.088;
          ring.userData.pulse = { min: 0.2, max: 0.9, freq: 1.4, phase: i * 0.7 };
          group.add(ring);
        }
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.034, this.seg(12, 7)), dark);
        spool.position.y = 0.33;
        group.add(spool);
        const head = this.chainRig(group, {
          links: 6, length: 0.2, linkMat: alloy, linkRadius: 0.011, linkTube: 0.0035,
          y: 0.35, endMass: 5.0
        });
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), dark);
        head.add(block);
        const faceA = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.062, 0.062), alloy);
        faceA.position.x = 0.055;
        head.add(faceA);
        const faceB = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.062, 0.062), alloy);
        faceB.position.x = -0.055;
        head.add(faceB);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.064), warn);
        strip.position.y = 0.024;
        strip.userData.pulse = { min: 0.3, max: 1.2, freq: 2.2 };
        head.add(strip);
        return group;
      },

      // ---- 168: Mithril Flail -------------------------------------------------
      createMithrilFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const mithril = this._mat(0xEAF1F6, { roughness: 0.08, metalness: 0.96 });
        const veinColor = this.getRandomColor(rand, [0xAEE8FF, 0xD6C4FF, 0xC2FFE4]);
        const vein = this._glow(veinColor, 0.9);
        const pale = this._mat(0xDCE4EA, { roughness: 0.3, metalness: 0.6 });

        // Half a kilo of flail, which should not be possible.
        this._hilt(group, rand, { height: 0.28, rTop: 0.017, rBot: 0.015, mat: pale, sides: this.seg(10, 6), offset: -0.02 });
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, this.seg(4, 3), this.seg(12, 7)), mithril);
        collar.rotation.x = Math.PI / 2;
        group.add(collar);
        const head = this.chainRig(group, {
          links: 6, length: 0.19, linkMat: mithril, linkRadius: 0.011, linkTube: 0.003,
          endMass: 1.6, gravity: -0.0004, damping: 0.96
        });
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.042, 1), mithril);
        head.add(ball);
        // Light living in the facets, not on them.
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.0035, this.seg(4, 3), this.seg(12, 7)), vein);
          band.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI);
          band.userData.pulse = { min: 0.3, max: 1.1, freq: 0.8, phase: i * 1.2 };
          head.add(band);
        }
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), vein);
        core.userData.spin = { axis: 'y', speed: 0.9 };
        core.userData.pulse = { min: 0.5, max: 1.4, freq: 1.3 };
        head.add(core);
        return group;
      },

      // ---- 169: Steel Nunchaku ------------------------------------------------
      createSteelNunchakuModel(weapon, rand) {
        const group = this.createNunchakuModel(weapon, rand);
        const steel = this._mat(0x8A8F95, { roughness: 0.3, metalness: 0.92 });
        const knurl = this._mat(0x4A4F55, { roughness: 0.7, metalness: 0.6 });
        const chain = this._steel(0xC0C5CA, 0.25);

        // Machined out of bar stock: heavier, colder and not for practice.
        const rope = group.userData._verletRope;
        if (rope) for (const link of rope.segmentMeshes) link.material = chain;
        for (const x of [-0.024, 0.024]) {
          const yBase = x > 0 ? -0.16 : -0.09;
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0125, 0.175, this.seg(12, 7)), steel);
          barrel.position.set(x, yBase, 0);
          group.add(barrel);
          // Knurled bands where the hand goes.
          for (let i = 0; i < 2; i++) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.026, this.seg(12, 7)), knurl);
            band.position.set(x, yBase - 0.04 + i * 0.08, 0);
            group.add(band);
          }
          const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.012, 0.012, this.seg(10, 6)), steel);
          endCap.position.set(x, yBase - 0.093, 0);
          group.add(endCap);
          const swivel = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, this.seg(4, 3), this.seg(10, 6)), chain);
          swivel.rotation.x = Math.PI / 2;
          swivel.position.set(x, yBase + 0.09, 0);
          group.add(swivel);
        }
        return group;
      },

      // ---- 170: Siege Breaker -------------------------------------------------
      createSiegeBreakerModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x4A4F55, { roughness: 0.7, metalness: 0.72 });
        const bright = this._mat(0x8A8F95, { roughness: 0.45, metalness: 0.88 });
        const oak = this._wood(0x5C4033);
        const brass = this._cast(0xB9902A);

        // Eight kilos, and shaped like the ram it is named after: a banded
        // hardwood beam with an iron head on the end of it.
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.34, this.seg(12, 7)), oak);
        beam.position.y = 0.32;
        group.add(beam);
        const bands = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < bands; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.053 + i * 0.001, 0.007, this.seg(4, 3), this.seg(14, 8)), iron);
          band.rotation.x = Math.PI / 2;
          band.position.y = 0.19 + i * 0.07;
          group.add(band);
          for (let j = 0; j < 4; j++) {
            const a = (j / 4) * Math.PI * 2 + i * 0.4;
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(6, 4), this.seg(4, 3)), brass);
            rivet.position.set(Math.cos(a) * 0.055, 0.19 + i * 0.07, Math.sin(a) * 0.055);
            group.add(rivet);
          }
        }
        // The ram's head cap.
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.07, this.seg(12, 7)), iron);
        cap.position.y = 0.5;
        group.add(cap);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.07), iron);
        brow.position.y = 0.535;
        group.add(brow);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.011, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.4), bright);
          horn.position.set(s * 0.05, 0.525, 0);
          horn.rotation.set(0, Math.PI / 2, s * 0.5);
          group.add(horn);
        }
        const snout = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), bright);
        snout.position.y = 0.572;
        group.add(snout);
        this._hilt(group, rand, { height: 0.24, rTop: 0.026, rBot: 0.03, mat: oak, wrapMat: iron, offset: 0.14 });
        return group;
      },

      // ---- 171: Seismic Hammer ------------------------------------------------
      createSeismicHammerModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0x7A7F85, { roughness: 0.45, metalness: 0.88 });
        const dark = this._mat(0x2A2E34, { roughness: 0.55, metalness: 0.7 });
        const charge = this._glow(this.getRandomColor(rand, [0xFFB300, 0x4FC3F7]), 1.0);

        // Industrial: the head is a piston housing, and it fires into the
        // target a fraction of a second after the swing lands.
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.08), dark);
        housing.position.y = 0.4;
        group.add(housing);
        const anvilFace = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.03, this.seg(12, 7)), alloy);
        anvilFace.rotation.z = Math.PI / 2;
        anvilFace.position.set(0.075, 0.4, 0);
        anvilFace.userData.bob = { axis: 'x', amp: 0.012, freq: 2.6 };
        group.add(anvilFace);
        // The rams either side, cycling out of phase with the face.
        for (const s of [-1, 1]) {
          const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, this.seg(9, 6)), alloy);
          ram.rotation.z = Math.PI / 2;
          ram.position.set(0.03, 0.4 + s * 0.03, s * 0.03);
          ram.userData.bob = { axis: 'x', amp: 0.008, freq: 2.6, phase: s * 1.6 };
          group.add(ram);
        }
        const accumulator = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, this.seg(10, 6)), dark);
        accumulator.rotation.z = Math.PI / 2;
        accumulator.position.set(-0.06, 0.4, 0);
        group.add(accumulator);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, this.seg(12, 7)), charge);
        gauge.rotation.x = Math.PI / 2;
        gauge.position.set(0, 0.44, 0.042);
        gauge.userData.pulse = { min: 0.3, max: 1.3, freq: 1.8 };
        group.add(gauge);
        for (let i = 0; i < 3; i++) {
          const hose = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(10, 6), Math.PI), dark);
          hose.position.set(-0.04, 0.36 - i * 0.02, 0.03);
          hose.rotation.set(0.4, 0, 1.2);
          group.add(hose);
        }
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.42, this.seg(10, 6)), dark);
        haft.position.y = 0.16;
        group.add(haft);
        for (let i = 0; i < 4; i++) {
          const grip = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, this.seg(4, 3), this.seg(10, 6)), alloy);
          grip.rotation.x = Math.PI / 2;
          grip.position.y = -0.02 - i * 0.03;
          group.add(grip);
        }
        return group;
      },

      // ---- 172: Earthshaker Maul ----------------------------------------------
      createEarthshakerMaulModel(weapon, rand) {
        const group = new THREE.Group();
        const stone = this._mat(this.getRandomColor(rand, [0x6A6259, 0x5A5E64, 0x6E5A4A]), { roughness: 0.98, metalness: 0.04 });
        const fissure = this._glow(this.getRandomColor(rand, [0xFF6A1A, 0xFFC93D]), 1.0);
        const iron = this._mat(0x4A4F55, { roughness: 0.75, metalness: 0.7 });
        const hide = this._wood(0x3A2A1C);

        // A block of the ground itself, cracked all through and lit from
        // inside, hooped onto a haft.
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.13), stone);
        head.position.y = 0.44;
        group.add(head);
        const chips = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < chips; i++) {
          const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.026 + rand() * 0.014, 0), stone);
          c.position.set((rand() - 0.5) * 0.17, 0.44 + (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.13);
          c.rotation.set(rand(), rand(), rand());
          group.add(c);
        }
        // The cracks, each breathing at its own rate.
        const cracks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < cracks; i++) {
          const crack = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05 + rand() * 0.06, 0.14), fissure);
          crack.position.set((rand() - 0.5) * 0.14, 0.44 + (rand() - 0.5) * 0.09, 0);
          crack.rotation.z = (rand() - 0.5) * 1.6;
          crack.userData.pulse = { min: 0.15, max: 1.2, freq: 0.6 + rand() * 0.5, phase: i * 1.3 };
          group.add(crack);
        }
        for (const s of [-1, 1]) {
          const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.009, this.seg(4, 3), this.seg(12, 7)), iron);
          hoop.rotation.y = Math.PI / 2;
          hoop.position.set(s * 0.06, 0.44, 0);
          hoop.scale.set(1, 1.5, 1);
          group.add(hoop);
        }
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.46, this.seg(10, 6)), hide);
        haft.position.y = 0.18;
        group.add(haft);
        for (let i = 0; i < 5; i++) {
          const bind = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(10, 6)), hide);
          bind.rotation.x = Math.PI / 2;
          bind.position.y = 0.0 - i * 0.032;
          group.add(bind);
        }
        return group;
      },

      // ---- 173: Dragon Flail --------------------------------------------------
      createDragonFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x8B1A1A, 0x2E7D4F, 0x2B3D8B]);
        const hide = this._mat(hideColor, { roughness: 0.4, metalness: 0.5 });
        const horn = this._mat(0x2A241C, { roughness: 0.6, metalness: 0.15 });
        const ember = this._glow(0xFF6A1A, 1.0);
        const gold = this._cast(0xD9A62A);

        this._hilt(group, rand, { height: 0.3, rTop: 0.021, rBot: 0.018, mat: horn, wrapMat: gold, offset: -0.02 });
        const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.03, this.seg(9, 6)), gold);
        group.add(jaw);
        const head = this.chainRig(group, {
          links: 5, length: 0.18, linkMat: gold, linkRadius: 0.013, endMass: 4.5
        });
        // The head is a dragon's, and it has an opinion about being swung.
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.046, this.seg(11, 7), this.seg(8, 5)), hide);
        skull.scale.set(1, 0.9, 1.2);
        head.add(skull);
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, this.seg(7, 5)), hide);
        snout.position.z = 0.05;
        snout.rotation.x = Math.PI / 2;
        head.add(snout);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(6, 4), this.seg(5, 4)), ember);
          eye.position.set(s * 0.024, 0.016, 0.028);
          eye.userData.pulse = { min: 0.4, max: 1.4, freq: 2.2, phase: s };
          head.add(eye);
          const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, this.seg(6, 4)), horn);
          hornMesh.position.set(s * 0.026, 0.04, -0.014);
          hornMesh.rotation.set(-0.6, 0, s * 0.4);
          head.add(hornMesh);
        }
        const spikes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const frill = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 3), horn);
          frill.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.03);
          frill.rotation.set(-Math.PI / 2, 0, 0);
          head.add(frill);
        }
        return group;
      },

      // ---- 174: Soul Drain Flail ----------------------------------------------
      createSoulDrainFlailModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xD9CDAF, { roughness: 0.75, metalness: 0.05 });
        const iron = this._mat(0x3A3E44, { roughness: 0.6, metalness: 0.7 });
        const soulColor = this.getRandomColor(rand, [0x7FE0C8, 0xB58AFF, 0x8AD0FF]);
        const soul = this._glow(soulColor, 1.1);
        const wisp = this._mat(soulColor, {
          roughness: 1.0, metalness: 0.0, emissive: soulColor, emissiveIntensity: 0.7,
          transparent: true, opacity: 0.4
        });

        this._hilt(group, rand, { height: 0.3, rTop: 0.02, rBot: 0.017, mat: bone, wrapMat: iron, offset: -0.02 });
        const head = this.chainRig(group, {
          links: 6, length: 0.2, linkMat: iron, linkRadius: 0.012, endMass: 4.0
        });
        // A skull with something still in it, leaking.
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.044, this.seg(11, 7), this.seg(8, 5)), bone);
        skull.scale.set(1, 1.1, 1.15);
        head.add(skull);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), bone);
        jaw.position.y = -0.04;
        jaw.rotation.x = 0.25;
        head.add(jaw);
        for (const s of [-1, 1]) {
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(7, 5), this.seg(5, 4)), soul);
          socket.position.set(s * 0.019, 0.012, 0.036);
          socket.userData.pulse = { min: 0.3, max: 1.5, freq: 1.1, phase: s * 1.2 };
          head.add(socket);
        }
        const teeth = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < teeth; i++) {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, 3), bone);
          t.position.set(-0.018 + i * 0.0072, -0.028, 0.034);
          t.rotation.x = Math.PI;
          head.add(t);
        }
        // What it has taken, still circling and not getting away.
        const wisps = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < wisps; i++) {
          const w = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, this.seg(5, 4)), wisp);
          w.position.y = 0.02 + i * 0.012;
          w.userData.orbit = { radius: 0.06 + i * 0.008, speed: 0.8 + i * 0.3, phase: i * 1.7, plane: 'xz' };
          w.userData.pulse = { min: 0.2, max: 1.0, freq: 1.4, phase: i };
          w.userData.sway = { axis: 'x', amp: 0.3, freq: 1.1, phase: i };
          head.add(w);
        }
        return group;
      },

      // ---- 175: Earthshaker Mace ----------------------------------------------
      createEarthshakerMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const stone = this._mat(0x6E6259, { roughness: 0.96, metalness: 0.05 });
        const fissure = this._glow(this.getRandomColor(rand, [0xFF8A1A, 0xFFD24A]), 0.95);
        const bronze = this._mat(0xA8762A, { roughness: 0.45, metalness: 0.85 });
        const hide = this._wood(0x4A3524);

        // The maul's smaller sibling: the same lit stone, cut into a head you
        // can swing one-handed.
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.11, 6), stone);
        head.position.y = 0.36;
        group.add(head);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.05, 6), stone);
        crown.position.y = 0.44;
        group.add(crown);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.1, 0.01), fissure);
          seam.position.set(Math.cos(a) * 0.05, 0.36, Math.sin(a) * 0.05);
          seam.rotation.y = -a;
          seam.userData.pulse = { min: 0.2, max: 1.1, freq: 0.9, phase: i * 0.8 };
          group.add(seam);
        }
        const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, this.seg(4, 3), 6), bronze);
        ringTop.rotation.x = Math.PI / 2;
        ringTop.position.y = 0.412;
        group.add(ringTop);
        const ringBot = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, this.seg(4, 3), 6), bronze);
        ringBot.rotation.x = Math.PI / 2;
        ringBot.position.y = 0.308;
        group.add(ringBot);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.024, this.seg(9, 6)), bronze);
        collar.position.y = 0.29;
        group.add(collar);
        this._hilt(group, rand, { height: 0.34, rTop: 0.02, rBot: 0.018, mat: hide, wrapMat: hide, offset: 0.28 });
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.02, this.seg(9, 6)), bronze);
        butt.position.y = -0.056;
        group.add(butt);
        return group;
      },

      // ========================================================================
      // Guitars
      // ========================================================================
      // A guitar is a club with a very specific silhouette, so the shape is the
      // whole model: everything below builds the same instrument out of a body
      // outline, a neck and a handful of fittings, and each weapon differs in
      // which outline it asks for and what it is made of.
      //
      // It is held by the NECK, which is what puts the body up at +Y where a
      // hammer head would be and the headstock down past the hand. The body
      // outline is written in its own X/Y plane with local -y at the neck
      // pocket, and _plate extrudes it along Z, so the instrument reads
      // face-on the way it is swung.

      /** Outline of a body shape, at `scale`, ready for _plate. */
      _guitarOutline(shape, scale) {
        const s = scale === undefined ? 1 : scale;
        let pts;
        if (shape === 'v') {
          // Two wings and a notch. Nothing else needed: everyone knows it.
          pts = [
            [0.042, -0.150], [0.150, 0.155], [0.086, 0.190], [0.000, 0.010],
            [-0.086, 0.190], [-0.150, 0.155], [-0.042, -0.150]
          ];
        } else if (shape === 'dread') {
          // A figure of eight: two bouts with a waist between them, the lower
          // bout the wider of the two. Sampled rather than listed, since the
          // whole shape is one curve.
          pts = [];
          const back = [];
          const n = this.seg(13, 8);
          for (let i = 0; i <= n; i++) {
            const t = 0.05 + (i / n) * 0.90;
            const half = 0.118 * Math.pow(Math.sin(Math.PI * t), 0.42)
              * (1 - 0.40 * Math.exp(-Math.pow((t - 0.52) / 0.14, 2)))
              * (0.88 + 0.26 * t);
            const y = -0.185 + t * 0.37;
            pts.push([half, y]);
            back.push([-half, y]);
          }
          back.reverse();
          pts = pts.concat(back);
        } else {
          // Superstrat: offset waist, a short treble horn and a long bass one.
          pts = [
            [0.048, -0.140], [0.112, -0.162], [0.145, -0.108], [0.136, -0.038],
            [0.146, 0.040], [0.116, 0.118], [0.052, 0.166], [-0.026, 0.172],
            [-0.098, 0.140], [-0.140, 0.066], [-0.136, -0.016], [-0.156, -0.096],
            [-0.132, -0.178], [-0.074, -0.160], [-0.048, -0.140]
          ];
        }
        return s === 1 ? pts : pts.map(p => [p[0] * s, p[1] * s]);
      },

      /** Where the neck meets the body, in body-local y. */
      _guitarPocket(shape) {
        return shape === 'dread' ? -0.185 : (shape === 'v' ? -0.150 : -0.140);
      },

      /**
       * The whole instrument. Everything is optional except a shape and a
       * body material, so an acoustic and a superstrat are the same call.
       */
      _guitar(group, rand, o) {
        const shape = o.shape || 'strat';
        const s = o.bodyScale === undefined ? 1 : o.bodyScale;
        const bodyY = o.bodyY === undefined ? 0.16 : o.bodyY;
        const thick = (o.thickness === undefined ? 0.05 : o.thickness) * (shape === 'dread' ? 1.7 : 1);
        const metal = o.metal || this._steel(0x8E939A, 0.3);
        const neckMat = o.neckMat || this._wood(0x8B5A2B);
        const boardMat = o.boardMat || this._wood(0x3A2318);
        const wire = o.stringMat || this._mat(0xC9CDD2, { roughness: 0.3, metalness: 0.9 });

        // ---- Body --------------------------------------------------------
        // A burst finish is two plates rather than a gradient: the rim colour
        // at full size with the centre colour laid a little smaller on top of
        // it, which reads as a burst from the front for the price of one more
        // outline.
        if (o.rimMat) {
          const rim = this._plate(this._guitarOutline(shape, s), thick, o.rimMat);
          rim.position.y = bodyY;
          group.add(rim);
        }
        const body = this._plate(this._guitarOutline(shape, s * (o.rimMat ? 0.80 : 1)), thick * 1.04, o.bodyMat);
        body.position.y = bodyY;
        group.add(body);

        // ---- Neck, fretboard, headstock ----------------------------------
        const pocket = bodyY + this._guitarPocket(shape) * s;
        const neckLen = o.neckLen === undefined ? 0.28 : o.neckLen;
        const neckTop = pocket + 0.03;
        const neckBot = neckTop - neckLen;
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, neckLen, 0.024), neckMat);
        neck.position.set(0, neckTop - neckLen / 2, -0.008);
        group.add(neck);
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.048, neckLen * 0.94, 0.008), boardMat);
        board.position.set(0, neck.position.y + neckLen * 0.02, thick * 0.5 + 0.002);
        group.add(board);
        const nut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.012), metal);
        nut.position.set(0, neckBot + 0.012, thick * 0.5);
        group.add(nut);

        if (this.wantsTrim()) {
          const frets = this.isLowDetail() ? 6 : 12;
          for (let i = 1; i <= frets; i++) {
            // Frets crowd toward the body, as they do on a real board.
            const t = 1 - Math.pow(1 - i / (frets + 1), 1.6);
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.047, 0.003, 0.004), metal);
            f.position.set(0, neckBot + 0.02 + t * (neckLen * 0.88), thick * 0.5 + 0.006);
            group.add(f);
            if (o.inlay && i % 2 === 0 && i <= frets - 2) {
              const dot = o.inlay === 'sharkfin'
                // The Jackson shark fin: a wedge biting in from the bass side.
                ? this._plate([[-0.020, 0], [0.004, 0.010], [0.004, -0.004]], 0.002, o.inlayMat || metal)
                : new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, this.seg(8, 5)), o.inlayMat || metal);
              if (o.inlay !== 'sharkfin') dot.rotation.x = Math.PI / 2;
              dot.position.set(0, f.position.y - neckLen * 0.035, thick * 0.5 + 0.007);
              group.add(dot);
            }
          }
        }

        // The headstock, which is where a make is recognised from.
        const headLen = o.headLen === undefined ? 0.10 : o.headLen;
        const headY = neckBot - headLen / 2;
        let head;
        if (o.head === 'pointed') {
          // Swept to a single point, in the finish of the body.
          head = this._plate([
            [0.026, 0.05], [0.030, -0.012], [0.004, -0.05], [-0.030, -0.03], [-0.026, 0.05]
          ], 0.016, o.headMat || o.bodyMat);
        } else if (o.head === 'split') {
          head = this._plate([
            [0.030, 0.05], [0.034, -0.02], [0.010, -0.05], [0.000, -0.016],
            [-0.010, -0.05], [-0.034, -0.02], [-0.030, 0.05]
          ], 0.016, o.headMat || neckMat);
        } else {
          head = this._plate([
            [0.028, 0.05], [0.034, -0.028], [0.014, -0.05], [-0.026, -0.05], [-0.030, 0.05]
          ], 0.016, o.headMat || neckMat);
        }
        head.position.set(0, headY, -0.006);
        head.rotation.x = o.headTilt === undefined ? -0.18 : o.headTilt;
        group.add(head);
        if (this.wantsTrim()) {
          const pegs = o.strings === undefined ? 6 : o.strings;
          for (let i = 0; i < pegs; i++) {
            // Three a side, or all down one side on a rock headstock.
            const side = o.head === 'pointed' ? -1 : (i < pegs / 2 ? 1 : -1);
            const k = o.head === 'pointed' ? i / pegs : (i % Math.ceil(pegs / 2)) / Math.ceil(pegs / 2);
            const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.016, this.seg(6, 4)), metal);
            peg.rotation.z = Math.PI / 2;
            peg.position.set(side * 0.030, headY + 0.032 - k * 0.072, -0.006);
            group.add(peg);
          }
        }

        // ---- Fittings ----------------------------------------------------
        const bridgeY = o.bridgeY === undefined ? bodyY + 0.075 * s : o.bridgeY;
        if (o.bridge === 'floyd') {
          // A locking tremolo: a solid block with a bar swung out of it.
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.020, 0.020), metal);
          block.position.set(0, bridgeY, thick * 0.5 + 0.004);
          group.add(block);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.075, this.seg(6, 4)), metal);
          bar.position.set(-0.040, bridgeY - 0.028, thick * 0.5 + 0.014);
          bar.rotation.z = 1.05;
          group.add(bar);
        } else if (o.bridge === 'acoustic') {
          const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.014, 0.010), boardMat);
          saddle.position.set(0, bridgeY, thick * 0.5 + 0.004);
          group.add(saddle);
        } else {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.016, 0.014), metal);
          plate.position.set(0, bridgeY, thick * 0.5 + 0.003);
          group.add(plate);
        }

        if (o.soundhole) {
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.004, this.seg(14, 8)), this._mat(0x0E0C0A, { roughness: 1 }));
          hole.rotation.x = Math.PI / 2;
          hole.position.set(0, bodyY - 0.04 * s, thick * 0.5);
          group.add(hole);
          if (this.wantsTrim()) {
            const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.004, this.seg(4, 3), this.seg(16, 9)), o.rosetteMat || boardMat);
            rosette.position.copy(hole.position);
            group.add(rosette);
          }
        }

        for (const p of (o.pickups || [])) {
          const wide = p.wide !== false;
          const pu = new THREE.Mesh(
            new THREE.BoxGeometry(wide ? 0.070 : 0.020, wide ? 0.026 : 0.070, 0.012),
            p.mat || o.pickupMat || this._mat(0x141416, { roughness: 0.6, metalness: 0.3 }));
          pu.position.set(0, bodyY + p.y * s, thick * 0.5 + 0.004);
          if (p.pulse) pu.userData.pulse = p.pulse;
          group.add(pu);
          if (this.wantsTrim() && wide) {
            for (const side of [-1, 1]) {
              const pole = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.004, 0.004), metal);
              pole.position.set(0, pu.position.y + side * 0.007, thick * 0.5 + 0.010);
              group.add(pole);
            }
          }
        }

        if (this.wantsTrim()) {
          const knobs = o.knobs === undefined ? 2 : o.knobs;
          for (let i = 0; i < knobs; i++) {
            const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.010, this.seg(9, 6)), o.knobMat || metal);
            knob.rotation.x = Math.PI / 2;
            knob.position.set(0.052 * s - i * 0.024, bodyY + 0.100 * s, thick * 0.5 + 0.005);
            group.add(knob);
          }
          const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, this.seg(8, 5)), metal);
          jack.rotation.z = Math.PI / 2;
          jack.position.set(0.130 * s, bodyY + 0.030 * s, 0);
          group.add(jack);
        }

        // ---- Strings -----------------------------------------------------
        // Nut to bridge in one run, which is also what ties the neck and the
        // body together visually however far apart the shape puts them.
        const count = Math.max(2, this.isLowDetail() ? 3 : (o.strings === undefined ? 6 : o.strings));
        const len = Math.max(0.02, bridgeY - (neckBot + 0.012));
        for (let i = 0; i < count; i++) {
          const x = (i / (count - 1) - 0.5) * 0.042;
          const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, len, this.seg(4, 3)), wire);
          str.position.set(x, neckBot + 0.012 + len / 2, thick * 0.5 + 0.010);
          group.add(str);
        }
      },

      // ---- 186: Busker's Acoustic ---------------------------------------------
      createBuskerAcousticModel(weapon, rand) {
        const group = new THREE.Group();
        const top = this._wood(this.getRandomColor(rand, [0xC9A063, 0xB08A50, 0xD8B478]));
        const dark = this._wood(0x4A3220);
        // Cheap spruce, a soundhole worn through at the pick guard, and only
        // half the strings it was sold with.
        this._guitar(group, rand, {
          shape: 'dread', bodyMat: top, neckMat: dark, boardMat: this._wood(0x2E1E14),
          bodyY: 0.15, thickness: 0.05, soundhole: true, rosetteMat: dark,
          bridge: 'acoustic', head: 'split', headMat: dark, knobs: 0, strings: 3,
          neckLen: 0.30
        });
        const guard = this._plate([
          [0.030, -0.010], [0.086, -0.030], [0.098, 0.020], [0.048, 0.040]
        ], 0.002, dark);
        guard.position.set(0, 0.13, 0.044);
        group.add(guard);
        // The strap it has been carried by, knotted at the headstock.
        const knot = new THREE.Mesh(new THREE.TorusGeometry(0.010, 0.004, this.seg(4, 3), this.seg(10, 6)), dark);
        knot.position.set(0, -0.24, -0.01);
        group.add(knot);
        return group;
      },

      // ---- 187: Presidential Saxophone ----------------------------------------
      createPresidentialSaxophoneModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._mat(this.getRandomColor(rand, [0xC9962E, 0xD8A63C, 0xB8862A]), { roughness: 0.22, metalness: 0.95 });
        const lacquer = this._mat(0x8A6620, { roughness: 0.35, metalness: 0.8 });
        const pad = this._mat(0xD8D2C4, { roughness: 0.85, metalness: 0.05 });
        const cork = this._wood(0x2A2420);

        // The body: a cone standing on its narrow end, held about the middle.
        const bodyLen = 0.34;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, bodyLen, this.seg(14, 8)), brass);
        body.position.y = 0.10;
        group.add(body);
        // The bell, turned to face the player the way a tenor's does.
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.036, 0.12, this.seg(16, 9), 1, true), brass);
        bell.position.set(0.014, 0.32, 0.014);
        bell.rotation.z = -0.22;
        bell.rotation.x = 0.20;
        group.add(bell);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, this.seg(5, 3), this.seg(18, 10)), lacquer);
        rim.position.set(0.028, 0.375, 0.026);
        rim.rotation.set(Math.PI / 2 + 0.20, 0, -0.22);
        group.add(rim);
        // The U-bow at the bottom, and the crook and mouthpiece at the top.
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.014, this.seg(6, 4), this.seg(14, 8), Math.PI), brass);
        bow.position.set(0.030, -0.07, 0);
        bow.rotation.set(0, 0, Math.PI);
        group.add(bow);
        const crook = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.010, this.seg(6, 4), this.seg(12, 7), Math.PI * 0.75), brass);
        crook.position.set(-0.026, 0.29, 0);
        crook.rotation.set(0, 0, -0.6);
        group.add(crook);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.05, this.seg(10, 6)), this._mat(0x18181A, { roughness: 0.6, metalness: 0.1 }));
        mouth.position.set(-0.062, 0.31, 0);
        mouth.rotation.z = 1.15;
        group.add(mouth);
        const lig = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.003, this.seg(4, 3), this.seg(10, 6)), lacquer);
        lig.position.set(-0.052, 0.316, 0);
        lig.rotation.set(0, Math.PI / 2, 1.15);
        group.add(lig);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.021, 0.05, this.seg(10, 6)), cork);
        grip.position.y = -0.03;
        group.add(grip);

        // Keywork: pads down the front, and the rods they hang off.
        if (this.wantsTrim()) {
          const keys = this.isLowDetail() ? 5 : 11;
          for (let i = 0; i < keys; i++) {
            const y = -0.02 + i * 0.030;
            const r = 0.030 - i * 0.0006;
            const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.004, this.seg(9, 6)), lacquer);
            cup.rotation.x = Math.PI / 2;
            cup.position.set((i % 2 ? 0.010 : -0.010), y, r);
            group.add(cup);
            const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(9, 6)), pad);
            skin.rotation.x = Math.PI / 2;
            skin.position.set(cup.position.x, y, r + 0.003);
            group.add(skin);
          }
          for (const side of [-1, 1]) {
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.30, this.seg(6, 4)), lacquer);
            rod.position.set(side * 0.022, 0.10, 0.026);
            group.add(rod);
          }
        }
        return group;
      },

      // ---- 188: Pawnshop Stratocaster -----------------------------------------
      createPawnshopStratocasterModel(weapon, rand) {
        const group = new THREE.Group();
        const finish = this._mat(this.getRandomColor(rand, [0x2E5FA8, 0xC0342C, 0xE4DCC4]), { roughness: 0.45, metalness: 0.1 });
        const maple = this._wood(0xC9A063);
        const scratched = this._mat(0xE8E4D8, { roughness: 0.6, metalness: 0.05 });
        this._guitar(group, rand, {
          shape: 'strat', bodyMat: finish, neckMat: maple, boardMat: maple,
          bodyY: 0.16, bridge: 'hardtail', head: 'inline', headMat: finish,
          knobs: 3, inlay: 'dot', inlayMat: this._mat(0x1A1A1C, { roughness: 0.8 }),
          pickups: [{ y: 0.030, wide: false }, { y: 0.000, wide: false }, { y: -0.032, wide: false }]
        });
        // The scratchplate, which on this one is the newest part of it.
        const plate = this._plate([
          [0.088, -0.100], [0.108, 0.020], [0.060, 0.086], [-0.048, 0.096],
          [-0.096, 0.030], [-0.070, -0.096]
        ], 0.003, scratched);
        plate.position.set(0, 0.16, 0.026);
        group.add(plate);
        return group;
      },

      // ---- 189: La chitarra infernale -----------------------------------------
      createChitarraInfernaleModel(weapon, rand) {
        const group = new THREE.Group();
        // Cherry burst on quilted maple: amber through the middle, red at the
        // rim. Black hardware throughout, because it always is.
        const amber = this._mat(0xF0821E, { roughness: 0.22, metalness: 0.28 });
        const cherry = this._mat(0xB01818, { roughness: 0.24, metalness: 0.30 });
        const ebony = this._wood(0x1C1410);
        const maple = this._wood(0xD8B478);
        const black = this._mat(0x141416, { roughness: 0.35, metalness: 0.6 });
        const pearl = this._mat(0xEDE6D6, { roughness: 0.2, metalness: 0.35 });
        const ember = this._glow(0xFF6A18, 0.85);

        this._guitar(group, rand, {
          shape: 'strat', bodyMat: amber, rimMat: cherry, neckMat: maple,
          boardMat: ebony, metal: black, bodyY: 0.16, bodyScale: 1.04,
          bridge: 'floyd', head: 'pointed', headMat: cherry, headTilt: -0.24,
          knobs: 2, knobMat: black, inlay: 'sharkfin', inlayMat: pearl,
          neckLen: 0.30,
          pickups: [
            { y: 0.046, wide: true, mat: black },
            { y: 0.008, wide: false, mat: black },
            { y: -0.034, wide: true, mat: black }
          ]
        });

        // What makes it infernale: the quilt is a real seam pattern cut into
        // the top, and it is lit from underneath.
        const seams = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < seams; i++) {
          const t = i / (seams - 1);
          const seam = new THREE.Mesh(new THREE.TorusGeometry(0.030 + t * 0.070, 0.0022, this.seg(4, 3), this.seg(16, 9), Math.PI * 1.2), ember);
          seam.position.set(0, 0.16 - 0.02 + t * 0.01, 0.027);
          seam.rotation.z = -0.6 + t * 1.4;
          seam.userData.pulse = { min: 0.12, max: 0.7, freq: 0.5 + t * 0.35, phase: i * 0.9 };
          group.add(seam);
        }
        // The tremolo bar, swung out where a hand would find it.
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0028, 0.085, this.seg(7, 4)), black);
        bar.position.set(-0.046, 0.208, 0.036);
        bar.rotation.z = 0.95;
        group.add(bar);
        // Truss rod cover on the headstock, in the same black.
        const cover = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.004), black);
        cover.position.set(0, -0.302, 0.010);
        group.add(cover);
        return group;
      },

      // ---- 190: Flying V ------------------------------------------------------
      createFlyingVModel(weapon, rand) {
        const group = new THREE.Group();
        const finish = this._mat(this.getRandomColor(rand, [0x14100E, 0xC01A16, 0xE8E2D2]), { roughness: 0.3, metalness: 0.25 });
        const rosewood = this._wood(0x3A2318);
        const gold = this._cast(0xC9A03A);
        this._guitar(group, rand, {
          shape: 'v', bodyMat: finish, neckMat: this._wood(0x6E4A2A), boardMat: rosewood,
          metal: gold, bodyY: 0.17, bridge: 'hardtail', head: 'split', headMat: finish,
          knobs: 3, knobMat: gold, inlay: 'dot', inlayMat: this._mat(0xEDE6D6, { roughness: 0.25 }),
          bridgeY: 0.245,
          pickups: [{ y: 0.100, wide: true }, { y: 0.030, wide: true }]
        });
        // Binding down both wings: the one line the shape needs.
        for (const side of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.34, 0.052), this._mat(0xE8E2D2, { roughness: 0.5 }));
          edge.position.set(side * 0.098, 0.175, 0);
          edge.rotation.z = side * 0.34;
          group.add(edge);
        }
        return group;
      },

      // ---- 191: Bass Guitar ---------------------------------------------------
      createBassGuitarModel(weapon, rand) {
        const group = new THREE.Group();
        const finish = this._mat(this.getRandomColor(rand, [0x1E2A3E, 0x3A2A20, 0x8A1E22]), { roughness: 0.4, metalness: 0.2 });
        const maple = this._wood(0xC9A063);
        const chrome = this._steel(0xB8BEC4, 0.24);
        // Longer scale, fewer and thicker strings, and a great deal more wood.
        this._guitar(group, rand, {
          shape: 'strat', bodyMat: finish, neckMat: maple, boardMat: this._wood(0x2E1E14),
          metal: chrome, bodyY: 0.18, bodyScale: 1.10, thickness: 0.058,
          neckLen: 0.36, headLen: 0.12, bridge: 'hardtail', head: 'split',
          knobs: 3, strings: 4, inlay: 'dot',
          pickups: [{ y: 0.020, wide: true }, { y: -0.030, wide: true }]
        });
        // A thumb rest, and the strap button that takes all the weight.
        const rest = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.007, 0.006), this._wood(0x2E1E14));
        rest.position.set(0.010, 0.135, 0.033);
        group.add(rest);
        const button = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.008, this.seg(8, 5)), chrome);
        button.rotation.x = Math.PI / 2;
        button.position.set(-0.152, 0.020, 0);
        group.add(button);
        return group;
      },

      // ---- 192: Double-Neck Warhorse ------------------------------------------
      createDoubleNeckWarhorseModel(weapon, rand) {
        const group = new THREE.Group();
        const finish = this._mat(this.getRandomColor(rand, [0x8A1E22, 0x2A1C14, 0x1A1A1E]), { roughness: 0.32, metalness: 0.28 });
        const rosewood = this._wood(0x3A2318);
        const gold = this._cast(0xC9A03A);
        const maple = this._wood(0xB08A50);
        // The lower neck is the one it is held by; the twelve-string above it
        // is the reason the thing weighs what it does.
        this._guitar(group, rand, {
          shape: 'strat', bodyMat: finish, neckMat: maple, boardMat: rosewood,
          metal: gold, bodyY: 0.19, bodyScale: 1.16, thickness: 0.056,
          neckLen: 0.32, bridge: 'hardtail', head: 'split', headMat: finish,
          knobs: 4, knobMat: gold, inlay: 'dot', inlayMat: this._mat(0xEDE6D6, { roughness: 0.25 }),
          bridgeY: 0.255,
          pickups: [{ y: 0.020, wide: true }, { y: -0.040, wide: true }]
        });
        // The upper neck, running out of the top of the body.
        const upperLen = 0.26;
        const upperY = 0.19 + 0.172 * 1.16 + upperLen / 2 - 0.02;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.054, upperLen, 0.024), maple);
        upper.position.set(0, upperY, -0.008);
        group.add(upper);
        const upperBoard = new THREE.Mesh(new THREE.BoxGeometry(0.052, upperLen * 0.94, 0.008), rosewood);
        upperBoard.position.set(0, upperY, 0.032);
        group.add(upperBoard);
        const upperHead = this._plate([
          [0.032, 0.05], [0.036, -0.02], [0.012, -0.05], [0.000, -0.016],
          [-0.012, -0.05], [-0.036, -0.02], [-0.032, 0.05]
        ], 0.016, finish);
        upperHead.position.set(0, upperY + upperLen / 2 + 0.05, -0.006);
        upperHead.rotation.x = 0.18;
        group.add(upperHead);
        const twelve = this.isLowDetail() ? 4 : 12;
        for (let i = 0; i < twelve; i++) {
          const x = (i / (twelve - 1) - 0.5) * 0.044;
          const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, upperLen, this.seg(4, 3)),
            this._mat(0xC9CDD2, { roughness: 0.3, metalness: 0.9 }));
          str.position.set(x, upperY, 0.038);
          group.add(str);
        }
        const upperPickup = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.026, 0.012), gold);
        upperPickup.position.set(0, upperY - upperLen / 2 - 0.012, 0.034);
        group.add(upperPickup);
        return group;
      },

      // ---- 193: Feedback Cannon -----------------------------------------------
      createFeedbackCannonModel(weapon, rand) {
        const group = new THREE.Group();
        const finish = this._mat(0x14161C, { roughness: 0.3, metalness: 0.45 });
        const ebony = this._wood(0x1C1410);
        const chrome = this._steel(0xC2C8CE, 0.18);
        const arcColor = this.getRandomColor(rand, [0x7FD8FF, 0xB58AFF, 0x9CFFEA]);
        const arc = this._glow(arcColor, 1.0);

        this._guitar(group, rand, {
          shape: 'strat', bodyMat: finish, neckMat: this._wood(0x2A2420), boardMat: ebony,
          metal: chrome, bodyY: 0.17, bridge: 'hardtail', head: 'pointed', headMat: finish,
          knobs: 2, inlay: 'dot', inlayMat: arc, neckLen: 0.30,
          pickups: [
            { y: 0.040, wide: true, pulse: { min: 0.2, max: 1.0, freq: 2.2 } },
            { y: -0.030, wide: true, pulse: { min: 0.2, max: 1.0, freq: 2.6, phase: 1.4 } }
          ],
          pickupMat: arc
        });
        // The lead, cut off somewhere behind it, still carrying something.
        const coils = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < coils; i++) {
          const loop = new THREE.Mesh(new THREE.TorusGeometry(0.028 + i * 0.004, 0.004, this.seg(4, 3), this.seg(12, 7)), this._mat(0x1A1A1E, { roughness: 0.9 }));
          loop.position.set(0.150, 0.10 - i * 0.012, 0.004 * i);
          loop.rotation.set(0.5, 0.4, 0.2 * i);
          group.add(loop);
        }
        // The howl standing off the pickups.
        const rings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05 + i * 0.026, 0.0026, this.seg(4, 3), this.seg(16, 9)), arc);
          ring.position.set(0, 0.17, 0.048 + i * 0.014);
          ring.userData.pulse = { min: 0.05, max: 1.2, freq: 1.8 + i * 0.5, phase: i * 1.1 };
          ring.userData.spin = { axis: 'z', speed: (i % 2 ? -1 : 1) * (0.8 + i * 0.4) };
          group.add(ring);
        }
        return group;
      },

      // ---- 194: Hellfire Superstrat -------------------------------------------
      createHellfireSuperstratModel(weapon, rand) {
        const group = new THREE.Group();
        const char = this._mat(0x1A0E0A, { roughness: 0.85, metalness: 0.15 });
        const heat = this._glow(0xFF4A0A, 1.1);
        const ash = this._wood(0x2E1A12);
        const iron = this._mat(0x2A2A2E, { roughness: 0.4, metalness: 0.75 });

        this._guitar(group, rand, {
          shape: 'strat', bodyMat: char, rimMat: heat, neckMat: ash, boardMat: char,
          metal: iron, bodyY: 0.17, bodyScale: 1.06, bridge: 'floyd',
          head: 'pointed', headMat: char, headTilt: -0.26, knobs: 2, knobMat: iron,
          inlay: 'sharkfin', inlayMat: heat, neckLen: 0.31,
          pickups: [{ y: 0.044, wide: true, mat: iron }, { y: -0.036, wide: true, mat: iron }]
        });
        // The body is not painted, it is burning: the grain has opened and
        // what is underneath shows through it.
        const cracks = this.isLowDetail() ? 5 : 12;
        for (let i = 0; i < cracks; i++) {
          const a = (i / cracks) * Math.PI * 2 + rand() * 0.4;
          const len = 0.06 + rand() * 0.09;
          const crack = new THREE.Mesh(new THREE.BoxGeometry(0.0035, len, 0.004), heat);
          crack.position.set(Math.cos(a) * (0.03 + rand() * 0.06), 0.17 + Math.sin(a) * (0.03 + rand() * 0.07), 0.028);
          crack.rotation.z = a + 0.6;
          crack.userData.pulse = { min: 0.25, max: 1.4, freq: 0.7 + rand() * 0.9, phase: i };
          group.add(crack);
        }
        // Embers coming off the bridge, which is where the hand would be.
        const embers = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < embers; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.005 - i * 0.0004, this.seg(6, 4), this.seg(5, 3)), heat);
          e.position.set(0.02 - i * 0.012, 0.24 + i * 0.02, 0.03);
          e.userData.orbit = { radius: 0.02 + i * 0.008, speed: 0.9 + i * 0.4, phase: i * 1.6, plane: 'xy' };
          e.userData.pulse = { min: 0.3, max: 1.5, freq: 1.6, phase: i * 0.8 };
          group.add(e);
        }
        return group;
      },
    }
  });
})();
