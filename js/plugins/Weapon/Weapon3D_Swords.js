//=============================================================================
// Weapon 3D Models - Swords
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for swords. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Swords
 * ============================================================================
 *
 * One family per weapon type. This one owns every Sword weapon (wtypeId 2):
 * the generic silhouette the type falls back to, the note-tagged one-offs of
 * that type, and every bespoke per-weapon model in it (69 so far).
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
    console.error('[Weapon3D_Swords] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Swords',
    unique: {
      43: 'createWoodenPlaySwordModel',            // Wooden Play Sword
      44: 'createTrainingSwordModel',              // Training Sword
      45: 'createDecorativeSwordModel',            // Decorative Sword
      46: 'createCheapSwordModel',                 // Cheap Sword
      47: 'createScrapMetalShivModel',             // Scrap Metal Shiv
      48: 'createSawBladeSwordModel',              // Saw Blade Sword
      49: 'createStopSignCleaverModel',            // Stop Sign Cleaver
      50: 'createLeafSpringMacheteModel',          // Leaf Spring Machete
      51: 'createBronzeAgeSwordModel',             // Bronze Age Sword
      52: 'createObsidianBladeModel',              // Obsidian Blade
      53: 'createShortSwordModel',                 // Short Sword
      54: 'createSeedSwordModel',                  // Seed Sword
      55: 'createSeedMaceModel',                   // Seed Mace
      56: 'createMesopotamianSwordModel',          // Mesopotamian Sword
      57: 'createLongSwordModel',                  // Long Sword
      58: 'createGladiusModel',                    // Gladius
      59: 'createKhopeshModel',                    // Khopesh
      60: 'createScimitarModel',                   // Scimitar
      61: 'createRapierModel',                     // Rapier
      62: 'createShamshirModel',                   // Shamshir
      63: 'createPatagModel',                      // Patag
      64: 'createNavalCutlassModel',               // Naval Cutlass
      65: 'createFalchionModel',                   // Falchion
      66: 'createWarLongswordModel',               // Longsword
      67: 'createShinaiModel',                     // Shinai
      68: 'createEstocModel',                      // Estoc
      69: 'createUrumiModel',                      // Urumi Whip Sword
      70: 'createBokkenModel',                     // Kendo Bokken
      71: 'createClaymoreModel',                   // Claymore
      72: 'createKatanaModel',                     // Katana
      73: 'createSwordBreakerModel',               // Sword Breaker
      74: 'createZweihanderModel',                 // Zweihander
      75: 'createBlessedSilverSwordModel',         // Blessed Silver Sword
      76: 'createAerodynamicBladeModel',           // Aerodynamic Blade
      77: 'createRunicBladeModel',                 // Runic Blade
      78: 'createFlamesongBladeModel',             // Flamesong Blade
      79: 'createObsidianSwordModel',              // Obsidian Sword
      80: 'createMithrilSwordModel',               // Mithril Sword
      81: 'createVibroBladeModel',                 // Vibro Blade
      82: 'createAstralSaberModel',                // Astral Saber
      83: 'createShadowsteelSwordModel',           // Shadowsteel Sword
      84: 'createEternalFlameSwordModel',          // Eternal Flame Sword
      85: 'createDragonScaleBladeModel',           // Dragon Scale Blade
      86: 'createMorphbladeModel',                 // Morphblade
      87: 'createStarmetalBladeModel',             // Starmetal Blade
      88: 'createVoidEdgeModel',                   // Void Edge
      89: 'createVoltEdgeModel',                   // Volt Edge
      90: 'createHerosLegacyModel',                // Hero's Legacy
      91: 'createPhaseBladeModel',                 // Phase Blade
      92: 'createShadowsteelBladeModel',           // Shadowsteel Blade
      93: 'createSpellbreakerBladeModel',          // Spellbreaker Blade
      94: 'createPsionicEdgeModel',                // Psionic Edge
      95: 'createBloodthirsterModel',              // Bloodthirster
      96: 'createWardbreakerBladeModel',           // Wardbreaker Blade
      97: 'createSpelldrainerEdgeModel',           // Spelldrainer Edge
      98: 'createSymbioticBladeModel',             // Symbiotic Blade
      99: 'createTwilightEdgeModel',               // Twilight Edge
      100: 'createEnergyBladeModel',                // Energy Blade
      101: 'createDivineSmiterModel',               // Divine Smiter
      102: 'createArcaneBladeModel',                // Arcane Blade
      103: 'createDimensionBladeModel',             // Dimension Blade
      104: 'createTPillarBladeModel',               // T-Pillar Blade
      105: 'createStarCutterModel',                 // Star Cutter
      106: 'createPetroleumEdgeModel',              // EHI Petroleum Edge
      107: 'createSkystoneGreatswordModel',         // Skystone Greatsword
      108: 'createOmniscienceEdgeModel',            // EHI Omniscience Edge
      109: 'createGoldenVarleniaBladeModel',        // Golden Varlenia Blade
      110: 'createQuantumSuperpositionBladeModel',  // Quantum Superposition Blade
      111: 'createExcaliburModel',                 // Excalibur
      112: 'createDimensionalCutterModel',          // Dimensional Cutter
      113: 'createDragonBladeModel',               // Dragon Blade
    },
    models: {
      // Type 2: Sword
      createSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const handleColor = this.getRandomColor(rand, this.handleColors);
        const bladeColor = this.getRandomColor(rand, this.bladeColors);
        const guardColor = this.getRandomColor(rand, this.guardColors);
        const wrapColor = this.getRandomColor(rand, this.handleColors.filter(c => c !== handleColor));
        const gemColor = this.getRandomColor(rand, this.crystalColors);
        const emissionColor = this.getRandomColor(rand, this.emissionColors);

        const woodMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.85 });
        const wrapMat = new THREE.MeshStandardMaterial({ color: wrapColor, roughness: 0.9 });
        const metalMat = new THREE.MeshStandardMaterial({ color: bladeColor, roughness: 0.25, metalness: 0.85 });
        const guardMat = new THREE.MeshStandardMaterial({ color: guardColor, roughness: 0.35, metalness: 0.8 });
        const gemMat = new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.1, metalness: 0.1, emissive: gemColor, emissiveIntensity: 0.6 });
        const runicMat = new THREE.MeshStandardMaterial({ color: emissionColor, emissive: emissionColor, emissiveIntensity: 0.8 });

        const hHeight = 0.16 + rand() * 0.08;
        const hRadiusTop = 0.02 + rand() * 0.005;
        const hRadiusBottom = 0.016 + rand() * 0.005;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(hRadiusTop, hRadiusBottom, hHeight, 6), woodMat);
        h.position.y = -hHeight / 2;
        group.add(h);

        // Grip wraps
        this.addGripWrap(h, rand, hHeight, hRadiusTop, hRadiusBottom, wrapMat);

        // Pommel
        const pommel = this.createProceduralPommel(rand, hHeight, guardMat, gemMat);
        group.add(pommel);

        // Guard
        const guard = this.createProceduralGuard(rand, guardMat, gemMat, 1.0);
        guard.position.y = 0;
        group.add(guard);

        // Blade
        const bHeight = 0.45 + rand() * 0.25;
        const bWidth = 0.035 + rand() * 0.015;
        const bThickness = 0.008 + rand() * 0.005;
        const mainBlade = new THREE.Mesh(new THREE.BoxGeometry(bWidth, bHeight, bThickness), metalMat);
        mainBlade.position.y = bHeight / 2;
        group.add(mainBlade);

        // Recessed glowing fuller (runic groove)
        if (rand() > 0.3) {
          const fullerHeight = bHeight * 0.75;
          const fuller = new THREE.Mesh(new THREE.BoxGeometry(bWidth * 0.2, fullerHeight, bThickness * 1.2), runicMat);
          fuller.position.y = bHeight / 2;
          group.add(fuller);
        }

        // Blade tip (cone)
        const tipHeight = bWidth * 1.5;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(bWidth * 0.7, tipHeight, 4), metalMat);
        tip.scale.z = bThickness / bWidth;
        tip.rotation.y = Math.PI / 4; // Align flat face with box
        tip.position.y = bHeight + tipHeight / 2;
        group.add(tip);

        return group;
      },

      // <Excalibur>, Holy sword with cruciform guard and divine glow
      createExcaliburModel(weapon, rand) {
        const group = new THREE.Group();
        const goldMat  = new THREE.MeshStandardMaterial({ color: 0xDDAA00, roughness: 0.15, metalness: 0.95 });
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xEEEEFF, roughness: 0.08, metalness: 0.98, emissive: 0xFFFFAA, emissiveIntensity: 0.25 });
        const holyMat  = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFFFFFF, emissiveIntensity: 1.0, transparent: true, opacity: 0.75 });
        const gemMat   = new THREE.MeshStandardMaterial({ color: 0x00AAFF, emissive: 0x00AAFF, emissiveIntensity: 1.0 });
        const wrapMat  = new THREE.MeshStandardMaterial({ color: 0x1A1A1A, roughness: 0.9 });

        const hH = 0.22;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.015, hH, 8), goldMat);
        h.position.y = -hH / 2;
        group.add(h);
        this.addGripWrap(h, rand, hH, 0.018, 0.015, wrapMat);

        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), goldMat);
        pommel.position.y = -hH;
        group.add(pommel);

        // Cross guard (wide horizontal + short vertical)
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.022), goldMat);
        group.add(crossH);
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.055, 0.022), goldMat);
        group.add(crossV);
        const crossGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), gemMat);
        crossGem.position.set(0, 0, 0.012);
        group.add(crossGem);

        const bH = 0.72, bW = 0.032, bT = 0.007;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bT), bladeMat);
        blade.position.y = bH / 2;
        group.add(blade);

        // Glowing fuller
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.15, bH * 0.78, bT * 1.4), holyMat);
        fuller.position.y = bH / 2;
        group.add(fuller);

        const tipH = bW * 1.2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(bW * 0.65, tipH, 4), bladeMat);
        tip.scale.z = bT / bW;
        tip.rotation.y = Math.PI / 4;
        tip.position.y = bH + tipH / 2;
        group.add(tip);

        // Floating divine sigils (cross shapes along blade)
        for (let i = 0; i < 3; i++) {
          const sx = bW * 0.9, sy = bH * (0.28 + i * 0.24);
          const sigH = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.005, 0.002), holyMat);
          sigH.position.set(sx, sy, 0);
          group.add(sigH);
          const sigV = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.025, 0.002), holyMat);
          sigV.position.set(sx, sy, 0);
          group.add(sigV);
        }
        return group;
      },

      // <DragonBlade>, Draconic serrated sword with fire glow
      createDragonBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const darkRedMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.3,  metalness: 0.8  });
        const fireMat    = new THREE.MeshStandardMaterial({ color: 0xFF4400, emissive: 0xFF2200, emissiveIntensity: 0.95 });
        const blackMat   = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7   });
        const wrapMat    = new THREE.MeshStandardMaterial({ color: 0x3A0000, roughness: 0.9   });

        const hH = 0.18;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, hH, 6), blackMat);
        h.position.y = -hH / 2;
        group.add(h);
        this.addGripWrap(h, rand, hH, 0.02, 0.015, wrapMat);

        // Dragon claw guard
        for (let i = -1; i <= 1; i++) {
          const clawCurve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(i * 0.05, 0.04, 0),
            new THREE.Vector3(i * 0.09, -0.01, 0)
          );
          const claw = new THREE.Mesh(new THREE.TubeGeometry(clawCurve, 5, 0.008, 4, false), darkRedMat);
          group.add(claw);
        }

        // Dragon head pommel
        const pGroup = new THREE.Group();
        pGroup.position.y = -hH;
        pGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), darkRedMat));
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 4), darkRedMat);
        horn.position.y = 0.022;
        pGroup.add(horn);
        group.add(pGroup);

        const bH = 0.56, bW = 0.038, bT = 0.009;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bT), darkRedMat);
        blade.position.y = bH / 2;
        group.add(blade);

        // Fire fuller
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.18, bH * 0.7, bT * 1.3), fireMat);
        fuller.position.y = bH / 2;
        group.add(fuller);

        // Serrated fang edge
        for (let i = 0; i < 5; i++) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.025, 3), darkRedMat);
          fang.rotation.z = Math.PI / 2;
          fang.position.set(bW / 2 + 0.01, 0.07 + i * 0.09, 0);
          group.add(fang);
        }

        const tipH = 0.06;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(bW * 0.6, tipH, 4), darkRedMat);
        tip.scale.z = bT / bW;
        tip.rotation.y = Math.PI / 4;
        tip.position.y = bH + tipH / 2;
        group.add(tip);

        // Floating embers
        for (let i = 0; i < 5; i++) {
          const ember = new THREE.Mesh(new THREE.SphereGeometry(0.005 + rand() * 0.004, 4, 4), fireMat);
          ember.position.set((rand() - 0.5) * 0.06, 0.1 + rand() * bH, (rand() - 0.5) * 0.04);
          group.add(ember);
        }
        return group;
      },

      // ---- 43: Wooden Play Sword ---------------------------------------------
      createWoodenPlaySwordModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0xC8A464, 0xA9803F, 0xD8B87A]));
        const paint = this._mat(this.getRandomColor(rand, [0xC0392B, 0x2874A6, 0x27AE60]), { roughness: 0.65, metalness: 0.05 });
        const nail = this._cast(0x8B8B8B);

        // A plank with the corners knocked off, nothing more.
        const blade = this._plate([
          [-0.03, 0.0], [-0.03, 0.5], [-0.014, 0.55], [0.014, 0.55], [0.03, 0.5], [0.03, 0.0]
        ], 0.014, wood);
        group.add(blade);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.42, 0.016), paint);
        stripe.position.y = 0.24;
        group.add(stripe);

        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.026, 0.018), wood);
        group.add(guard);
        const nailHead = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, this.seg(6, 4)), nail);
        nailHead.rotation.x = Math.PI / 2;
        group.add(nailHead);

        this._hilt(group, rand, { height: 0.17, rTop: 0.019, rBot: 0.019, mat: wood, sides: 4, offset: -0.014 });
        return group;
      },

      // ---- 44: Training Sword ------------------------------------------------
      createTrainingSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8E9398, { roughness: 0.7, metalness: 0.6 });
        const pad = this._mat(this.getRandomColor(rand, [0x4A4A52, 0x1F3A5F, 0x5F1F1F]), { roughness: 0.95, metalness: 0 });
        const tape = this._wood(0xD8D8C8);

        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.56, 0.014), steel);
        blade.position.y = 0.28;
        group.add(blade);
        // Rolled edge: blunted on purpose, all the way round.
        for (const s of [-1, 1]) {
          const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.56, this.seg(6, 4)), steel);
          roll.position.set(s * 0.025, 0.28, 0);
          group.add(roll);
        }
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(8, 5), this.seg(6, 4)), pad);
        cap.scale.set(1, 0.6, 0.5);
        cap.position.y = 0.565;
        group.add(cap);

        // Padded sleeve over the strong of the blade.
        const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.16, this.seg(9, 6)), pad);
        sleeve.scale.z = 0.5;
        sleeve.position.y = 0.09;
        group.add(sleeve);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.004, this.seg(4, 3), this.seg(10, 6)), tape);
            band.rotation.x = Math.PI / 2;
            band.scale.y = 0.5;
            band.position.y = 0.03 + i * 0.06;
            group.add(band);
          }
        }

        this._crossguard(group, steel, 0.11, 0.016, 0.02, 0);
        this._hilt(group, rand, { height: 0.19, rTop: 0.019, rBot: 0.018, mat: pad, wrapMat: tape, pommelMat: steel, pommel: 'disc', offset: -0.01 });
        return group;
      },

      // ---- 45: Decorative Sword ----------------------------------------------
      createDecorativeSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const gilt = this._mat(0xE8C766, { roughness: 0.12, metalness: 0.98 });
        const chrome = this._steel(0xEDF1F5, 0.08);
        const gemColor = this.getRandomColor(rand, [0xD81E4A, 0x1E5AD8, 0x1ED87A, 0x8B1ED8]);
        const gem = this._glow(gemColor, 0.5);
        const velvet = this._mat(this.getRandomColor(rand, [0x6B1030, 0x102A6B]), { roughness: 0.95, metalness: 0 });

        const blade = this._plate(this._bladeOutline(0.6, 0.052, 0, 6, 1, { taperPow: 3.2 }), 0.008, chrome);
        group.add(blade);
        // Etched panel down the fuller, the whole point of a wall-hanger.
        const etch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.42, 0.011), gilt);
        etch.position.y = 0.22;
        group.add(etch);

        // Ornate guard: scrolled quillons plus a knuckle bow.
        for (const s of [-1, 1]) {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.06, 0.02, 0),
            new THREE.Vector3(s * 0.075, 0.06, 0)
          );
          const quillon = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(7, 4), 0.008, this.seg(6, 4), false), gilt);
          group.add(quillon);
          const curl = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.005, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.4), gilt);
          curl.position.set(s * 0.075, 0.066, 0);
          group.add(curl);
        }
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, this.seg(5, 4), this.seg(12, 7), Math.PI), gilt);
        bow.position.y = -0.06;
        bow.rotation.z = Math.PI;
        group.add(bow);

        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.017, 0), gem);
        group.add(stone);

        this._hilt(group, rand, { height: 0.16, rTop: 0.018, rBot: 0.016, mat: velvet, wrapMat: gilt, pommelMat: gilt, pommel: 'wheel', offset: -0.01 });

        // Tassel hanging off the pommel.
        const tassel = new THREE.Group();
        tassel.position.y = -0.18;
        tassel.userData.sway = { axis: 'z', amp: 0.22, freq: 1.1 };
        for (let i = 0; i < 3; i++) {
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0018, 0.05, this.seg(5, 3)), velvet);
          cord.position.set((i - 1) * 0.006, -0.025, 0);
          tassel.add(cord);
        }
        group.add(tassel);
        return group;
      },

      // ---- 46: Cheap Sword ---------------------------------------------------
      createCheapSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0xA3A7AB, { roughness: 0.62, metalness: 0.55 });
        const rust = this._mat(0x7E4520, { roughness: 0.95, metalness: 0.2 });
        const grip = this._wood(0x4A3524);

        // Too thin, and it has taken a set: the whole blade leans.
        const blade = this._plate(this._bladeOutline(0.54, 0.038, 0.055, 6, 1, { taperPow: 2.6 }), 0.004, steel);
        group.add(blade);

        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const patch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.006), rust);
            patch.position.set((rand() - 0.5) * 0.03, 0.06 + rand() * 0.4, 0);
            patch.rotation.z = rand() * 0.8;
            group.add(patch);
          }
        }

        const guard = this._crossguard(group, steel, 0.1, 0.012, 0.016, 0);
        guard.rotation.z = 0.06;    // hammered on crooked
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.016, mat: grip, wrapMat: grip, offset: -0.008 });

        // A pommel nut that has worked itself loose.
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.018, 6), rust);
        nut.position.y = -0.176;
        nut.rotation.z = 0.22;
        nut.userData.sway = { axis: 'z', amp: 0.06, freq: 3.1 };
        group.add(nut);
        return group;
      },

      // ---- 47: Scrap Metal Shiv ----------------------------------------------
      createScrapMetalShivModel(weapon, rand) {
        const group = new THREE.Group();
        const plateColors = [0x8E9398, 0x6E7378, 0xA07040, 0x5E6368];
        const weld = this._cast(0x9A6A3A);
        const rag = this._wood(0x3A3A34);

        // Whatever was to hand, welded end to end.
        let y = 0.0;
        const pieces = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < pieces; i++) {
          const h = 0.09 + rand() * 0.07;
          const w = 0.056 - i * 0.008 + (rand() - 0.5) * 0.014;
          const mat = this._mat(plateColors[Math.floor(rand() * plateColors.length)], { roughness: 0.55 + rand() * 0.35, metalness: 0.7 });
          const plate = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.016, w), h, 0.006 + rand() * 0.004), mat);
          plate.position.set((rand() - 0.5) * 0.014, y + h / 2, (rand() - 0.5) * 0.004);
          plate.rotation.z = (rand() - 0.5) * 0.13;
          group.add(plate);
          // Weld bead at the joint.
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(6, 4), this.seg(4, 3)), weld);
          bead.scale.set(2.0, 0.5, 0.9);
          bead.position.y = y;
          group.add(bead);
          y += h;
        }
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 3), this._mat(0x8E9398, { roughness: 0.6, metalness: 0.7 }));
        point.position.y = y + 0.03;
        group.add(point);

        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.028, 0.028), rag);
          wrap.position.y = -0.02 - i * 0.032;
          wrap.rotation.set(0, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.2);
          group.add(wrap);
        }
        return group;
      },

      // ---- 48: Saw Blade Sword -----------------------------------------------
      createSawBladeSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xB0B5BA, 0.3);
        const dark = this._mat(0x2C2F33, { roughness: 0.6, metalness: 0.7 });
        const grip = this._mat(0x1B1B1F, { roughness: 0.75, metalness: 0.1 });

        // Zig-zag one side of the outline and the whole edge becomes a saw.
        const teeth = this.isLowDetail() ? 8 : 13;
        const pts = [[-0.028, 0.0], [-0.028, 0.5], [0.0, 0.55]];
        for (let i = teeth; i >= 0; i--) {
          const t = i / teeth;
          pts.push([0.024, 0.02 + t * 0.48]);
          if (i > 0) pts.push([0.040, 0.02 + (t - 0.5 / teeth) * 0.48]);
        }
        const blade = this._plate(pts, 0.007, steel);
        group.add(blade);

        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.5, 0.012), dark);
        spine.position.set(-0.024, 0.26, 0);
        group.add(spine);

        // Circular saw disc mounted at the base, idling.
        const disc = new THREE.Group();
        disc.position.set(0.0, 0.02, -0.014);
        disc.userData.spin = { axis: 'z', speed: 2.6 };
        const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.005, this.seg(14, 8)), dark);
        plateMesh.rotation.x = Math.PI / 2;
        disc.add(plateMesh);
        const discTeeth = this.isLowDetail() ? 8 : 12;
        for (let i = 0; i < discTeeth; i++) {
          const a = (i / discTeeth) * Math.PI * 2;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.012, 3), steel);
          tooth.position.set(Math.cos(a) * 0.046, Math.sin(a) * 0.046, 0);
          tooth.rotation.z = a - Math.PI / 2;
          disc.add(tooth);
        }
        group.add(disc);

        this._crossguard(group, dark, 0.09, 0.014, 0.022, 0);
        this._hilt(group, rand, { height: 0.17, rTop: 0.019, rBot: 0.018, mat: grip, wrapMat: grip, pommelMat: dark, pommel: 'nut', offset: -0.01 });
        return group;
      },

      // ---- 49: Stop Sign Cleaver ---------------------------------------------
      createStopSignCleaverModel(weapon, rand) {
        const group = new THREE.Group();
        const signRed = this._mat(0xB8231F, { roughness: 0.45, metalness: 0.25 });
        const white = this._mat(0xEDEDED, { roughness: 0.4, metalness: 0.2 });
        const galv = this._mat(0x9EA3A8, { roughness: 0.55, metalness: 0.75 });
        const tape = this._wood(0x2A2A2A);

        // The octagon, sharpened all the way round.
        const oct = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          oct.push([Math.cos(a) * 0.13, Math.sin(a) * 0.13 + 0.32]);
        }
        const face = this._plate(oct, 0.006, signRed);
        group.add(face);

        const border = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.006, this.seg(4, 3), 8), white);
        border.position.y = 0.32;
        border.rotation.z = Math.PI / 8;
        group.add(border);

        // Mounting bolts, still in the sign.
        if (this.wantsTrim()) {
          for (const y of [0.41, 0.23]) {
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), galv);
            bolt.rotation.x = Math.PI / 2;
            bolt.position.y = y;
            group.add(bolt);
          }
        }

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.42, this.seg(9, 6)), galv);
        pole.position.y = 0.11;
        group.add(pole);
        // U-channel perforations down the pole.
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, this.seg(6, 4)), tape);
            hole.rotation.x = Math.PI / 2;
            hole.position.y = -0.04 + i * 0.05;
            group.add(hole);
          }
        }
        for (let i = 0; i < 4; i++) {
          const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, this.seg(4, 3), this.seg(9, 6)), tape);
          wrap.rotation.x = Math.PI / 2;
          wrap.position.y = -0.05 - i * 0.032;
          group.add(wrap);
        }
        return group;
      },

      // ---- 50: Leaf Spring Machete -------------------------------------------
      createLeafSpringMacheteModel(weapon, rand) {
        const group = new THREE.Group();
        const spring = this._mat(0x6E7378, { roughness: 0.7, metalness: 0.7 });
        const ground = this._steel(0xC4C9CE, 0.3);
        const rag = this._wood(0x2F2A22);
        const bolt = this._cast(0x8A6A3A);

        // A leaf off a truck's suspension, ground to an edge on one side only.
        const blade = this._plate([
          [-0.026, 0.0], [-0.03, 0.3], [-0.02, 0.46], [0.014, 0.5], [0.03, 0.42], [0.026, 0.16], [0.02, 0.0]
        ], 0.009, spring);
        group.add(blade);
        const edge = this._plate([[0.014, 0.0], [0.03, 0.3], [0.03, 0.42], [0.014, 0.5], [0.006, 0.44], [0.006, 0.0]], 0.011, ground);
        group.add(edge);

        // The mounting holes the spring was born with.
        if (this.wantsTrim()) {
          for (const y of [0.1, 0.24]) {
            const hole = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.003, this.seg(4, 3), this.seg(9, 6)), bolt);
            hole.position.set(-0.006, y, 0);
            group.add(hole);
          }
        }

        // Bare tang, wrapped in whatever was in the toolbox.
        const tang = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.17, 0.009), spring);
        tang.position.y = -0.085;
        group.add(tang);
        for (let i = 0; i < 5; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.028), rag);
          wrap.position.y = -0.02 - i * 0.031;
          wrap.rotation.set(0, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.16);
          group.add(wrap);
        }
        return group;
      },

      // ---- 51: Bronze Age Sword ----------------------------------------------
      createBronzeAgeSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(this.getRandomColor(rand, [0xB8860B, 0xC98B3A, 0x9C6B2A]), { roughness: 0.45, metalness: 0.85 });
        const patina = this._mat(0x3E8B74, { roughness: 0.85, metalness: 0.35 });
        const bone = this._mat(0xD9CDAF, { roughness: 0.75, metalness: 0.05 });

        // Cast leaf blade: it widens past the middle before it closes to a point.
        const blade = this._plate(this._bladeOutline(0.46, 0.058, 0, 7, 1, { belly: 0.45, taperPow: 3.4 }), 0.009, bronze);
        group.add(blade);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.4, 0.014), bronze);
        rib.position.y = 0.21;
        group.add(rib);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const spot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.011), patina);
            spot.position.set((rand() - 0.5) * 0.04, 0.08 + rand() * 0.3, 0);
            spot.rotation.z = rand();
            group.add(spot);
          }
        }

        // Hilt plate riveted straight onto the tang, no guard to speak of.
        const shoulder = this._plate([[-0.042, 0.0], [0.042, 0.0], [0.03, -0.03], [-0.03, -0.03]], 0.022, bronze);
        group.add(shoulder);
        this._hilt(group, rand, { height: 0.15, rTop: 0.019, rBot: 0.018, mat: bone, offset: -0.028, sides: 6 });
        this._rivets(group, bronze, 3, -0.05, -0.04, 0.005, 0.014);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.028, this.seg(8, 5), this.seg(6, 4)), bronze);
        cap.scale.set(1.5, 0.6, 1.0);
        cap.position.y = -0.182;
        group.add(cap);
        return group;
      },

      // ---- 52: Obsidian Blade ------------------------------------------------
      createObsidianBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x6B4A2A);
        const glass = this._mat(0x14121A, { roughness: 0.06, metalness: 0.3 });
        const cord = this._wood(0xB89A5A);
        const sheen = this._glow(this.getRandomColor(rand, [0x4A3A6B, 0x6B2A3A]), 0.25);

        // The paddle the shards are set into.
        const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.46, 0.016), wood);
        paddle.position.y = 0.23;
        group.add(paddle);
        const crown = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.03, 0.016), wood);
        crown.position.y = 0.47;
        group.add(crown);

        const rows = this.isLowDetail() ? 5 : 7;
        for (let i = 0; i < rows; i++) {
          const y = 0.06 + (i / (rows - 1)) * 0.4;
          for (const s of [-1, 1]) {
            const shard = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.034, 3), glass);
            shard.position.set(s * 0.038, y, 0);
            shard.rotation.z = -s * Math.PI / 2;
            shard.rotation.y = rand() * 1.2;
            group.add(shard);
          }
        }
        const tipShard = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 3), glass);
        tipShard.position.y = 0.505;
        group.add(tipShard);

        // The lacquer that holds them, catching the light.
        const gum = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.006), sheen);
        gum.position.y = 0.25;
        group.add(gum);

        this._hilt(group, rand, { height: 0.16, rTop: 0.02, rBot: 0.022, mat: wood, wrapMat: cord, sides: 5 });
        return group;
      },

      // ---- 53: Short Sword ---------------------------------------------------
      createShortSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC5CACF, 0.22);
        const grip = this._wood(this.getRandomColor(rand, [0x4A3524, 0x2B2B2E, 0x63432A]));
        const brass = this._cast(0xB9902A);

        const blade = this._plate(this._bladeOutline(0.42, 0.05, 0, 6, 1, { taperPow: 3.0 }), 0.008, steel);
        group.add(blade);
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.32, 0.010), steel);
        fuller.position.y = 0.17;
        group.add(fuller);

        this._crossguard(group, brass, 0.1, 0.014, 0.02, 0.25);
        this._hilt(group, rand, {
          height: 0.14, rTop: 0.018, rBot: 0.016, mat: grip, wrapMat: grip,
          pommelMat: brass, pommel: 'disc', offset: -0.009
        });
        return group;
      },

      // ---- 54: Seed Sword ----------------------------------------------------
      createSeedSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const leafColor = this.getRandomColor(rand, [0x4E9A3A, 0x71B93F, 0x357A2E]);
        const leaf = this._mat(leafColor, { roughness: 0.55, metalness: 0.05 });
        const bark = this._wood(0x5B4227);
        const sap = this._glow(0xC8FF66, 0.6);
        const husk = this._mat(0xC8A02A, { roughness: 0.55, metalness: 0.1 });

        const blade = this._plate(this._bladeOutline(0.5, 0.07, 0, 7, 1, { belly: 0.35, taperPow: 3.4 }), 0.009, leaf);
        group.add(blade);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.44, 0.013), sap);
        rib.position.y = 0.23;
        rib.userData.pulse = { min: 0.2, max: 0.85, freq: 0.9 };
        group.add(rib);
        // Lateral veins branching off the midrib.
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            for (const s of [-1, 1]) {
              const vein = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.011), sap);
              vein.position.set(s * 0.019, 0.1 + i * 0.09, 0);
              vein.rotation.z = -s * 0.6;
              group.add(vein);
            }
          }
        }

        // Two young leaves where a guard would be.
        for (const s of [-1, 1]) {
          const frond = this._plate([[0, 0], [s * 0.05, 0.03], [s * 0.07, 0.075], [s * 0.02, 0.05]], 0.006, leaf);
          frond.userData.sway = { axis: 'z', amp: 0.09, freq: 1.2, phase: s };
          group.add(frond);
        }

        this._hilt(group, rand, { height: 0.17, rTop: 0.02, rBot: 0.018, mat: bark, sides: 6, offset: -0.006 });
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, this.seg(4, 3), this.seg(9, 6)), leaf);
          coil.position.y = -0.03 - i * 0.036;
          coil.rotation.set(Math.PI / 2 + 0.2, 0, i * 0.6);
          group.add(coil);
        }
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(9, 6), this.seg(7, 5)), husk);
        pod.scale.y = 1.25;
        pod.position.y = -0.2;
        group.add(pod);
        return group;
      },

      // ---- 55: Seed Mace -----------------------------------------------------
      createSeedMaceModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x6B4A2A);
        const husk = this._mat(this.getRandomColor(rand, [0xB8860B, 0x8B6B2A, 0xA0522D]), { roughness: 0.6, metalness: 0.1 });
        const thorn = this._mat(0x3A2A18, { roughness: 0.7, metalness: 0.1 });
        const shoot = this._mat(0x5CB03A, { roughness: 0.6, metalness: 0.05 });

        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.42, this.seg(8, 5)), bark);
        haft.position.y = -0.06;
        group.add(haft);
        // Vine spiralling the haft.
        for (let i = 0; i < 5; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.004, this.seg(4, 3), this.seg(9, 6)), shoot);
          coil.position.y = -0.22 + i * 0.06;
          coil.rotation.set(Math.PI / 2 + 0.22, 0, i * 0.7);
          group.add(coil);
        }

        // The pod itself, split and bristling.
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.072, this.seg(10, 6), this.seg(8, 5)), husk);
        pod.scale.y = 1.2;
        pod.position.y = 0.22;
        group.add(pod);
        const seam = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.006, this.seg(4, 3), this.seg(12, 7)), thorn);
        seam.position.y = 0.22;
        seam.rotation.y = 0.4;
        group.add(seam);

        const spikes = this.isLowDetail() ? 7 : 11;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const tilt = (i % 3 - 1) * 0.6;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.05, this.seg(5, 3)), thorn);
          const r = 0.072;
          spike.position.set(Math.cos(a) * r * Math.cos(tilt), 0.22 + Math.sin(tilt) * 0.08, Math.sin(a) * r * Math.cos(tilt));
          spike.lookAt(new THREE.Vector3(spike.position.x * 2, 0.22 + (spike.position.y - 0.22) * 2, spike.position.z * 2));
          spike.rotateX(Math.PI / 2);
          group.add(spike);
        }

        const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, this.seg(5, 4)), shoot);
        sprout.position.y = 0.315;
        sprout.userData.sway = { axis: 'z', amp: 0.14, freq: 1.3 };
        group.add(sprout);
        return group;
      },

      // ---- 56: Mesopotamian Sword --------------------------------------------
      createMesopotamianSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(0xB8860B, { roughness: 0.42, metalness: 0.85 });
        const dark = this._mat(0x6B4A2A, { roughness: 0.85, metalness: 0.1 });
        const lapis = this._mat(0x1B3A8B, { roughness: 0.3, metalness: 0.25 });

        // Straight for the first third, then the sickle takes over.
        const blade = this._plate([
          [-0.024, 0.0], [-0.024, 0.2], [-0.05, 0.34], [-0.1, 0.42], [-0.13, 0.39],
          [-0.095, 0.36], [-0.05, 0.3], [-0.006, 0.19], [0.02, 0.0]
        ], 0.009, bronze);
        group.add(blade);

        // Cast studs along the back of the crescent.
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const stud = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(6, 4), this.seg(4, 3)), lapis);
            stud.position.set(-0.03 - i * 0.026, 0.24 + i * 0.04, 0.006);
            group.add(stud);
          }
        }

        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.024, this.seg(8, 5)), bronze);
        group.add(collar);
        this._hilt(group, rand, { height: 0.16, rTop: 0.02, rBot: 0.019, mat: dark, wrapMat: bronze, offset: -0.012, sides: 6 });
        const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.02, this.seg(8, 5)), bronze);
        butt.position.y = -0.182;
        group.add(butt);
        return group;
      },

      // ---- 57: Long Sword ----------------------------------------------------
      createLongSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xD2D7DC, 0.16);
        const guardMat = this._cast(this.getRandomColor(rand, [0x8A8F94, 0xB9902A, 0x5E4A32]));
        const grip = this._wood(this.getRandomColor(rand, [0x2B2B2E, 0x4A3524, 0x5C1F1F]));

        const blade = this._plate(this._bladeOutline(0.66, 0.05, 0, 7, 1, { taperPow: 2.2 }), 0.009, steel);
        group.add(blade);
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.46, 0.011), steel);
        fuller.position.y = 0.25;
        group.add(fuller);
        const ricasso = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.014), steel);
        ricasso.position.y = 0.03;
        group.add(ricasso);

        // Straight crossguard with recurved tips.
        this._crossguard(group, guardMat, 0.17, 0.016, 0.022, 0.5);
        const langet = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.02), guardMat);
        langet.position.y = 0.02;
        group.add(langet);

        // Two-hand grip, waisted in the middle.
        this._hilt(group, rand, { height: 0.21, rTop: 0.019, rBot: 0.017, mat: grip, wrapMat: grip, offset: -0.012 });
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.016, this.seg(12, 7)), guardMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.y = -0.23;
        group.add(wheel);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(7, 5), this.seg(5, 4)), guardMat);
        boss.position.set(0, -0.23, 0.011);
        group.add(boss);
        return group;
      },

      // ---- 58: Gladius -------------------------------------------------------
      createGladiusModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xCBD0D5, 0.2);
        const bone = this._mat(0xD9CDAF, { roughness: 0.7, metalness: 0.05 });
        const brass = this._cast(0xB9902A);

        // Wasp waist: wide at the shoulders, pinched, wide again, then a long point.
        const blade = this._plate([
          [-0.036, 0.0], [-0.024, 0.13], [-0.036, 0.24], [-0.026, 0.32], [0.0, 0.44],
          [0.026, 0.32], [0.036, 0.24], [0.024, 0.13], [0.036, 0.0]
        ], 0.010, steel);
        group.add(blade);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.36, 0.013), steel);
        rib.position.y = 0.19;
        group.add(rib);

        const guardBlock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.03), bone);
        guardBlock.position.y = -0.014;
        group.add(guardBlock);

        // Barrel grip with the finger swellings the originals had.
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.11, this.seg(9, 6)), bone);
        grip.position.y = -0.085;
        group.add(grip);
        for (let i = 0; i < 4; i++) {
          const swell = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, this.seg(4, 3), this.seg(9, 6)), bone);
          swell.rotation.x = Math.PI / 2;
          swell.position.y = -0.045 - i * 0.026;
          group.add(swell);
        }
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.032, this.seg(9, 6), this.seg(7, 5)), brass);
        pommel.position.y = -0.16;
        group.add(pommel);
        return group;
      },

      // ---- 59: Khopesh -------------------------------------------------------
      createKhopeshModel(weapon, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(0xC9902A, { roughness: 0.4, metalness: 0.88 });
        const ebony = this._wood(0x211A14);
        const gold = this._cast(0xE8C766);

        // Straight shaft, then the hook: the cutting edge is on the OUTSIDE.
        const blade = this._plate([
          [-0.022, 0.0], [-0.022, 0.19], [-0.062, 0.33], [-0.135, 0.37], [-0.16, 0.315],
          [-0.125, 0.325], [-0.062, 0.29], [-0.006, 0.18], [0.018, 0.0]
        ], 0.010, bronze);
        group.add(blade);
        // Hollow-ground channel following the curve.
        const channel = this._plate([
          [-0.014, 0.05], [-0.05, 0.3], [-0.115, 0.335], [-0.115, 0.318], [-0.05, 0.283], [-0.004, 0.05]
        ], 0.013, gold);
        group.add(channel);

        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.025, 0.02, this.seg(9, 6)), gold);
        group.add(ferrule);
        this._hilt(group, rand, { height: 0.16, rTop: 0.019, rBot: 0.018, mat: ebony, wrapMat: gold, offset: -0.01, sides: this.seg(9, 6) });
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.018, this.seg(9, 6)), gold);
        cap.position.y = -0.178;
        group.add(cap);
        return group;
      },

      // ---- 60: Scimitar ------------------------------------------------------
      createScimitarModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xD5DADF, 0.14);
        const grip = this._wood(this.getRandomColor(rand, [0x2A1F14, 0x5C1F1F, 0x1F1F2E]));
        const gold = this._cast(0xD9A62A);

        // Broad curve that keeps widening: the weight sits out past the middle.
        const blade = this._plate(this._bladeOutline(0.56, 0.05, 0.22, 8, 0.85, { belly: 0.42, taperPow: 4.0 }), 0.008, steel);
        group.add(blade);
        // Yelman: the sharpened false edge on the back of the last third.
        const yelman = this._plate([
          [0.055, 0.36], [0.10, 0.44], [0.135, 0.55], [0.115, 0.55], [0.075, 0.45], [0.04, 0.38]
        ], 0.010, steel);
        group.add(yelman);

        // Cross quillons that curve with the blade.
        for (const s of [-1, 1]) {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.05, 0.008, 0),
            new THREE.Vector3(s * 0.062, -0.03, 0)
          );
          const quillon = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(6, 4), 0.007, this.seg(5, 4), false), gold);
          group.add(quillon);
        }
        const langets = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.018), gold);
        langets.position.y = 0.02;
        group.add(langets);

        this._hilt(group, rand, { height: 0.15, rTop: 0.018, rBot: 0.017, mat: grip, wrapMat: gold, offset: -0.012 });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(8, 5), this.seg(6, 4)), gold);
        cap.scale.set(1, 1, 0.7);
        cap.position.set(-0.012, -0.168, 0);
        group.add(cap);
        return group;
      },

      // ---- 61: Rapier --------------------------------------------------------
      createRapierModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xDDE2E7, 0.12);
        const blued = this._mat(0x2E3A4E, { roughness: 0.3, metalness: 0.9 });
        const wire = this._cast(0xB9902A);
        const grip = this._wood(0x1A1A1E);

        // A blade that is almost all point.
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.011, 0.68, 4), steel);
        blade.position.y = 0.34;
        blade.rotation.y = Math.PI / 4;
        group.add(blade);
        const forte = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.12, 0.008), steel);
        forte.position.y = 0.06;
        group.add(forte);

        // Swept hilt: bars looping from the quillon block to the knuckle guard.
        const bars = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < bars; i++) {
          const a = -0.5 + (i / (bars - 1)) * 1.9;
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0.005, 0),
            new THREE.Vector3(Math.sin(a) * 0.06, -0.03, Math.cos(a) * 0.055),
            new THREE.Vector3(Math.sin(a) * 0.03, -0.085, Math.cos(a) * 0.028)
          );
          const bar = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(7, 4), 0.0035, this.seg(4, 3), false), blued);
          group.add(bar);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.004, this.seg(4, 3), this.seg(14, 8)), blued);
        ring.position.y = -0.04;
        ring.rotation.x = 0.5;
        group.add(ring);
        const quillon = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.15, this.seg(6, 4)), blued);
        quillon.rotation.z = Math.PI / 2;
        group.add(quillon);

        this._hilt(group, rand, { height: 0.115, rTop: 0.014, rBot: 0.013, mat: grip, wrapMat: wire, offset: -0.012 });
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(9, 6), this.seg(7, 5)), blued);
        pommel.scale.y = 1.35;
        pommel.position.y = -0.14;
        group.add(pommel);
        return group;
      },

      // ---- 62: Shamshir ------------------------------------------------------
      createShamshirModel(weapon, rand) {
        const group = new THREE.Group();
        const watered = this._steel(this.getRandomColor(rand, [0xC7CCD1, 0xB6BCC2, 0xCFC7B8]), 0.18);
        const damask = this._mat(0x8E9398, { roughness: 0.35, metalness: 0.8 });
        const horn = this._mat(0x1E1A16, { roughness: 0.35, metalness: 0.1 });
        const silver = this._cast(0xC0C6CC);

        // Narrow and deeply, evenly curved from the guard to the point.
        const blade = this._plate(this._bladeOutline(0.58, 0.038, 0.34, 9, 0.9, { taperPow: 2.8 }), 0.007, watered);
        group.add(blade);
        // Watered-steel banding.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            // Spaced along the blade itself: at 0.13 apart the last two bands
            // were past the point, hanging in the air beyond the tip.
            const t = 0.12 + i * 0.075;
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.009), damask);
            band.position.set(0.34 * 0.58 * (t / 0.58) * (t / 0.58) * 0.9, t, 0);
            band.rotation.z = -0.5 - i * 0.06;
            group.add(band);
          }
        }

        // Disc guard with a short crossbar.
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, this.seg(12, 7)), silver);
        disc.rotation.x = Math.PI / 2;
        group.add(disc);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.012, 0.018), silver);
        group.add(bar);
        for (const s of [-1, 1]) {
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(6, 4), this.seg(5, 4)), silver);
          knob.position.x = s * 0.048;
          group.add(knob);
        }

        this._hilt(group, rand, { height: 0.15, rTop: 0.017, rBot: 0.018, mat: horn, offset: -0.008, sides: this.seg(9, 6) });
        // Hooked pommel that leans away from the curve of the blade.
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.045, this.seg(9, 6)), horn);
        hook.position.set(-0.022, -0.172, 0);
        hook.rotation.z = 0.75;
        group.add(hook);
        const ferrule = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(10, 6)), silver);
        ferrule.position.set(-0.012, -0.155, 0);
        ferrule.rotation.set(Math.PI / 2, 0, 0.75);
        group.add(ferrule);
        return group;
      },

      // ---- 63: Patag --------------------------------------------------------
      // Bornean headhunter's sword: straight thick back, the edge swelling out
      // toward a flared, square-cut tip, and a carved antler hilt.
      createPatagModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xBFC4C9, 0.34);
        const antler = this._mat(0xD9CDAF, { roughness: 0.75, metalness: 0.05 });
        const bind = this._wood(0x6B4A2A);
        const tuft = this._mat(this.getRandomColor(rand, [0xB03A2E, 0x1F4FA0, 0x1E6B3A]), { roughness: 0.95, metalness: 0 });

        const blade = this._plate([
          [-0.020, 0.0], [-0.020, 0.44], [0.006, 0.46], [0.048, 0.44],
          [0.044, 0.30], [0.030, 0.14], [0.022, 0.0]
        ], 0.008, steel);
        group.add(blade);
        // The back is left thick and blunt: only the belly is ground.
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.44, 0.014), steel);
        spine.position.set(-0.016, 0.22, 0);
        group.add(spine);

        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.018, this.seg(9, 6)), bind);
        group.add(ferrule);
        this._hilt(group, rand, { height: 0.15, rTop: 0.019, rBot: 0.021, mat: antler, sides: this.seg(7, 5), offset: -0.012 });

        // Carved hook pommel and the hair tuft lashed under it.
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, this.seg(5, 4), this.seg(10, 6), Math.PI * 1.2), antler);
        hook.position.set(-0.012, -0.166, 0);
        hook.rotation.set(0, Math.PI / 2, 0.6);
        group.add(hook);
        for (let i = 0; i < 3; i++) {
          const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.001, 0.05, this.seg(5, 3)), tuft);
          hair.position.set(-0.02 + i * 0.008, -0.2, 0);
          hair.rotation.z = (i - 1) * 0.2;
          hair.userData.sway = { axis: 'z', amp: 0.12, freq: 1.1, phase: i };
          group.add(hair);
        }
        return group;
      },

      // ---- 64: Naval Cutlass ------------------------------------------------
      createNavalCutlassModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC4C9CE, 0.3);
        const brass = this._cast(0xB9902A);
        const grip = this._wood(0x2A1F14);

        // Short, broad and curved: a boarding weapon, not a duelling one.
        const blade = this._plate(this._bladeOutline(0.42, 0.056, 0.16, 7, 0.8, { belly: 0.3, taperPow: 3.2 }), 0.008, steel);
        group.add(blade);

        // Sheet-brass cup guard, the cutlass's signature.
        const cup = new THREE.Mesh(new THREE.SphereGeometry(0.058, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), brass);
        cup.rotation.x = Math.PI;
        cup.position.y = -0.01;
        cup.scale.set(1, 0.55, 1);
        group.add(cup);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.005, this.seg(4, 3), this.seg(14, 8)), brass);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = -0.042;
        group.add(rim);
        // Knuckle bow sweeping from the cup to the pommel.
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, this.seg(4, 3), this.seg(12, 7), Math.PI * 0.9), brass);
        bow.position.set(0.03, -0.1, 0);
        bow.rotation.z = -0.4;
        group.add(bow);

        this._hilt(group, rand, { height: 0.13, rTop: 0.018, rBot: 0.02, mat: grip, wrapMat: brass, offset: -0.03 });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(8, 5), this.seg(6, 4)), brass);
        cap.scale.y = 0.7;
        cap.position.y = -0.165;
        group.add(cap);
        return group;
      },

      // ---- 65: Falchion -----------------------------------------------------
      createFalchionModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xB6BBC0, 0.32);
        const iron = this._cast(0x6E7378);
        const grip = this._wood(0x4A3524);

        // Cleaver profile: narrow at the hilt, all the weight in a broad
        // clipped tip.
        const blade = this._plate([
          [-0.024, 0.0], [-0.026, 0.30], [-0.02, 0.42], [0.02, 0.46],
          [0.062, 0.40], [0.05, 0.24], [0.028, 0.10], [0.024, 0.0]
        ], 0.010, steel);
        group.add(blade);
        const clip = this._plate([[0.02, 0.46], [0.062, 0.40], [0.052, 0.395], [0.018, 0.44]], 0.012, iron);
        group.add(clip);

        this._crossguard(group, iron, 0.11, 0.014, 0.02, 0.35);
        this._hilt(group, rand, {
          height: 0.14, rTop: 0.018, rBot: 0.016, mat: grip, wrapMat: grip,
          pommelMat: iron, pommel: 'wheel', offset: -0.009
        });
        return group;
      },

      // ---- 66: Longsword ----------------------------------------------------
      // The plain war sword, next to id 57's dressed one: blackened furniture,
      // a leather half-grip on the ricasso and nothing decorative anywhere.
      createWarLongswordModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC8CDD2, 0.2);
        const black = this._mat(0x26282C, { roughness: 0.55, metalness: 0.7 });
        const leather = this._wood(0x3A2A1C);

        const blade = this._plate(this._bladeOutline(0.7, 0.046, 0, 7, 1, { taperPow: 1.8 }), 0.009, steel);
        group.add(blade);
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.34, 0.011), steel);
        fuller.position.y = 0.2;
        group.add(fuller);
        // Leather half-grip over the unsharpened base, for half-swording.
        const ricasso = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.016), leather);
        ricasso.position.y = 0.05;
        group.add(ricasso);

        this._crossguard(group, black, 0.19, 0.015, 0.019, 0.2);
        this._hilt(group, rand, { height: 0.22, rTop: 0.018, rBot: 0.016, mat: leather, wrapMat: leather, offset: -0.011 });
        const scent = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.05, this.seg(8, 5)), black);
        scent.position.y = -0.252;
        scent.rotation.x = Math.PI;
        group.add(scent);
        return group;
      },

      // ---- 67: Shinai -------------------------------------------------------
      createShinaiModel(weapon, rand) {
        const group = new THREE.Group();
        const bamboo = this._mat(0xD8C48A, { roughness: 0.8, metalness: 0.02 });
        const leather = this._wood(0x8B5A2B);
        const cord = this._mat(0xE8E4D8, { roughness: 0.9, metalness: 0 });

        // Four slats standing in a square, the whole point of a shinai.
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.62, 0.012), bamboo);
          slat.position.set(Math.cos(a) * 0.009, 0.31, Math.sin(a) * 0.009);
          group.add(slat);
        }
        // Leather cap over the tip, collar a third of the way down, tsuka-gawa.
        const saki = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, this.seg(9, 6)), leather);
        saki.position.y = 0.635;
        group.add(saki);
        const nakayui = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, this.seg(9, 6)), leather);
        nakayui.position.y = 0.42;
        group.add(nakayui);
        // The tsuru running down the spine between cap and collar.
        const tsuru = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.24, this.seg(5, 3)), cord);
        tsuru.position.set(0, 0.52, -0.014);
        group.add(tsuru);

        const tsuba = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, this.seg(4, 3), this.seg(12, 7)), leather);
        tsuba.rotation.x = Math.PI / 2;
        group.add(tsuba);
        this._hilt(group, rand, { height: 0.21, rTop: 0.017, rBot: 0.016, mat: leather, offset: -0.006, sides: 4 });
        return group;
      },

      // ---- 68: Estoc -------------------------------------------------------
      createEstocModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xD2D7DC, 0.18);
        const iron = this._cast(0x74797E);
        const grip = this._wood(0x2B2B2E);

        // No cutting edge at all: a rigid square section meant only to go
        // through the gaps in plate.
        const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.021, 0.72, 4), steel);
        blade.position.y = 0.36;
        blade.rotation.y = Math.PI / 4;
        group.add(blade);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.06, 4), steel);
        tip.position.y = 0.74;
        tip.rotation.y = Math.PI / 4;
        group.add(tip);

        // Ring guard for the finger that hooks over the ricasso.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(12, 7)), iron);
        ring.position.set(0.026, 0.03, 0);
        ring.rotation.y = Math.PI / 2;
        group.add(ring);
        this._crossguard(group, iron, 0.14, 0.013, 0.016, 0);

        this._hilt(group, rand, { height: 0.24, rTop: 0.017, rBot: 0.015, mat: grip, wrapMat: grip, offset: -0.01 });
        const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.036, this.seg(8, 5)), iron);
        pommel.position.y = -0.268;
        group.add(pommel);
        return group;
      },

      // ---- 69: Urumi Whip Sword ---------------------------------------------
      // A sword only at the hilt: the blade is a ribbon of spring steel that
      // hangs and lashes, so it runs on the same Verlet rope the whips use.
      createUrumiModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xD6DBE0, 0.22);
        const brass = this._cast(0xB9902A);
        const grip = this._wood(0x3A2118);

        this._hilt(group, rand, { height: 0.15, rTop: 0.018, rBot: 0.016, mat: grip, wrapMat: brass });
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.02, this.seg(9, 6)), brass);
        group.add(collar);
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, this.seg(4, 3), this.seg(12, 7), Math.PI), brass);
        guard.position.set(0.018, -0.07, 0);
        guard.rotation.z = -0.5;
        group.add(guard);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.016, this.seg(9, 6)), brass);
        cap.position.y = -0.158;
        group.add(cap);

        const links = this.isLowDetail() ? 12 : 18;
        const total = 0.62;
        const segLen = total / links;
        const rope = this.createVerletRope(links + 1, segLen, new THREE.Vector3(0, 0.01, 0), {
          gravity: -0.0005, damping: 0.95, iterations: 8, stiffness: 0.9, endMass: 0.5
        });
        for (let i = 0; i < links; i++) {
          const t = i / links;
          // A ribbon, not a rope: wide across, almost nothing thick.
          const seg = new THREE.Mesh(new THREE.BoxGeometry(0.026 - t * 0.008, segLen * 1.05, 0.0018), steel);
          seg.position.set(0, 0.01 + i * segLen + segLen / 2, 0);
          group.add(seg);
          rope.segmentMeshes.push(seg);
        }
        group.userData._verletRope = rope;
        return group;
      },

      // ---- 70: Kendo Bokken -------------------------------------------------
      createBokkenModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0x8B5A2B, 0x5C3317, 0xC8A464]));
        const dark = this._wood(0x3A2A1C);

        // A katana carved out of one piece: the shape is there, the fittings
        // are not.
        const blade = this._plate(this._bladeOutline(0.62, 0.032, 0.14, 8, 0.55, { taperPow: 4.0 }), 0.014, wood);
        group.add(blade);
        // The line where the carver rounded the back off.
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.56, 0.017), wood);
        ridge.position.set(0.006, 0.3, 0);
        ridge.rotation.z = -0.16;
        group.add(ridge);

        // A tsuba-shaped step, not a fitting: still the same wood.
        const step = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.024), wood);
        group.add(step);
        this._hilt(group, rand, { height: 0.19, rTop: 0.019, rBot: 0.018, mat: wood, sides: 4, flat: 0.72, offset: -0.008 });
        const butt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.022), dark);
        butt.position.y = -0.2;
        group.add(butt);
        return group;
      },

      // ---- 71: Claymore -----------------------------------------------------
      createClaymoreModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC5CACF, 0.24);
        const iron = this._cast(0x6E7378);
        const grip = this._wood(0x3A2A1C);

        const blade = this._plate(this._bladeOutline(0.76, 0.05, 0, 7, 1, { taperPow: 2.0 }), 0.010, steel);
        group.add(blade);

        // Quillons angled forward toward the point, ending in quatrefoils: the
        // one detail that makes a claymore a claymore.
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.006, 0.11, this.seg(6, 4)), iron);
          arm.position.set(s * 0.045, 0.028, 0);
          arm.rotation.z = -s * (Math.PI / 2 - 0.5);
          group.add(arm);
          const quatre = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.005, this.seg(4, 3), 4), iron);
          quatre.position.set(s * 0.088, 0.075, 0);
          quatre.rotation.x = Math.PI / 2;
          group.add(quatre);
        }
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.024), iron);
        group.add(block);

        this._hilt(group, rand, { height: 0.26, rTop: 0.019, rBot: 0.017, mat: grip, wrapMat: grip, offset: -0.014 });
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(9, 6), this.seg(7, 5)), iron);
        pommel.scale.y = 0.75;
        pommel.position.y = -0.28;
        group.add(pommel);
        return group;
      },

      // ---- 72: Katana -------------------------------------------------------
      createKatanaModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xDCE1E6, 0.12);
        const hamon = this._mat(0xF2F6FA, { roughness: 0.45, metalness: 0.6 });
        const black = this._mat(0x1A1A1E, { roughness: 0.4, metalness: 0.3 });
        const ito = this._wood(this.getRandomColor(rand, [0x1E1E22, 0x6B1030, 0x102A4A]));
        const brass = this._cast(0xB9902A);

        // Sori: a shallow, even curve, single edged, almost no taper until the
        // kissaki.
        const blade = this._plate(this._bladeOutline(0.68, 0.03, 0.13, 9, 0.45, { taperPow: 5.0 }), 0.008, steel);
        group.add(blade);
        // The temper line following the edge.
        const line = this._plate(this._bladeOutline(0.66, 0.018, 0.132, 9, 0.15, { taperPow: 5.0 }), 0.010, hamon);
        group.add(line);

        const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.014), brass);
        habaki.position.y = 0.018;
        group.add(habaki);
        const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.006, this.seg(12, 7)), black);
        tsuba.rotation.x = Math.PI / 2;
        group.add(tsuba);
        const seppa = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.014, this.seg(9, 6)), brass);
        group.add(seppa);

        // Tsuka: rayskin under a diamond cord wrap.
        const tsuka = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.2, this.seg(8, 5)), black);
        tsuka.position.y = -0.105;
        tsuka.scale.z = 0.7;
        group.add(tsuka);
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const knot = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.012, 0.02), ito);
            knot.position.y = -0.03 - i * 0.031;
            knot.rotation.z = (i % 2 ? 1 : -1) * 0.5;
            group.add(knot);
          }
        }
        const kashira = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.022), black);
        kashira.position.y = -0.208;
        group.add(kashira);
        return group;
      },

      // ---- 73: Sword Breaker ------------------------------------------------
      createSwordBreakerModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xB0B5BA, 0.3);
        const iron = this._cast(0x5E6368);
        const grip = this._wood(0x2A2118);

        // A thick spine with a comb of deep slots cut into one side: a blade
        // goes in and does not come out.
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.4, 0.014), steel);
        spine.position.y = 0.2;
        group.add(spine);
        const teeth = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < teeth; i++) {
          const y = 0.06 + (i / (teeth - 1)) * 0.3;
          const tooth = this._plate([[0.013, y], [0.05, y + 0.008], [0.05, y + 0.022], [0.013, y + 0.026]], 0.012, steel);
          group.add(tooth);
        }
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 4), steel);
        point.position.y = 0.43;
        group.add(point);

        this._crossguard(group, iron, 0.09, 0.012, 0.018, 0.3);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, this.seg(4, 3), this.seg(12, 7)), iron);
        ring.position.set(-0.024, -0.03, 0);
        ring.rotation.y = Math.PI / 2;
        group.add(ring);
        this._hilt(group, rand, {
          height: 0.14, rTop: 0.017, rBot: 0.016, mat: grip, wrapMat: iron,
          pommelMat: iron, pommel: 'nut', offset: -0.008
        });
        return group;
      },

      // ---- 74: Zweihander ---------------------------------------------------
      createZweihanderModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xBEC3C8, 0.28);
        const iron = this._cast(0x63686D);
        const leather = this._wood(0x4A3524);

        const blade = this._plate(this._bladeOutline(0.86, 0.058, 0, 7, 1, { taperPow: 1.7 }), 0.011, steel);
        group.add(blade);

        // Parierhaken: the lugs partway up that stop a bind sliding onto the
        // hand, with the leather-bound ricasso below them.
        for (const s of [-1, 1]) {
          const lug = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, this.seg(6, 4)), iron);
          lug.position.set(s * 0.03, 0.2, 0);
          lug.rotation.z = -s * (Math.PI / 2 - 0.55);
          group.add(lug);
        }
        const ricasso = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.16, 0.018), leather);
        ricasso.position.y = 0.11;
        group.add(ricasso);

        // Wide S-curved guard.
        for (const s of [-1, 1]) {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(s * 0.08, 0.02, 0),
            new THREE.Vector3(s * 0.13, -0.03, 0)
          );
          const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(7, 4), 0.008, this.seg(5, 4), false), iron);
          group.add(arm);
        }
        const sidering = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(4, 3), this.seg(12, 7)), iron);
        sidering.position.set(0, 0.01, 0.022);
        group.add(sidering);

        this._hilt(group, rand, { height: 0.3, rTop: 0.02, rBot: 0.018, mat: leather, wrapMat: leather, offset: -0.014 });
        const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.05, this.seg(9, 6)), iron);
        pommel.position.y = -0.336;
        group.add(pommel);
        return group;
      },

      // ---- 75: Blessed Silver Sword -----------------------------------------
      createBlessedSilverSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const silver = this._mat(0xF0F3F6, { roughness: 0.1, metalness: 0.95 });
        const gold = this._cast(0xE8C766);
        const halo = this._glow(0xFFF0C0, 0.8);
        const cloth = this._mat(0xF4F1E6, { roughness: 0.95, metalness: 0 });

        const blade = this._plate(this._bladeOutline(0.6, 0.05, 0, 7, 1, { taperPow: 2.4 }), 0.008, silver);
        group.add(blade);
        // A line of scripture down the fuller.
        if (this.wantsTrim()) {
          for (let i = 0; i < 7; i++) {
            const word = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.011), gold);
            word.position.y = 0.07 + i * 0.068;
            group.add(word);
          }
        }

        // Cross hilt, unapologetically a cross.
        this._crossguard(group, gold, 0.15, 0.018, 0.022, 0);
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.022), gold);
        upright.position.y = -0.014;
        group.add(upright);
        const nimbus = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, this.seg(4, 3), this.seg(16, 9)), halo);
        nimbus.rotation.x = Math.PI / 2.2;
        nimbus.userData.spin = { axis: 'y', speed: 0.5 };
        nimbus.userData.pulse = { min: 0.4, max: 1.1, freq: 0.8 };
        group.add(nimbus);

        this._hilt(group, rand, { height: 0.16, rTop: 0.018, rBot: 0.016, mat: cloth, wrapMat: gold, offset: -0.012 });
        const relic = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, this.seg(8, 5)), gold);
        relic.position.y = -0.19;
        group.add(relic);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(7, 5), this.seg(5, 4)), halo);
        light.position.y = -0.19;
        light.userData.pulse = { min: 0.3, max: 1.2, freq: 1.3 };
        group.add(light);
        return group;
      },

      // ---- 76: Aerodynamic Blade --------------------------------------------
      createAerodynamicBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xD8DDE2, { roughness: 0.22, metalness: 0.9 });
        const carbon = this._mat(0x24262A, { roughness: 0.35, metalness: 0.5 });
        const trim = this._glow(this.getRandomColor(rand, [0x4FC3F7, 0xB3FF4F]), 0.5);

        // Wing section rather than a blade: a leading edge, a thin tail and
        // slots through the middle to let air past.
        const blade = this._plate([
          [-0.014, 0.0], [-0.026, 0.28], [-0.014, 0.52], [0.006, 0.58],
          [0.026, 0.5], [0.03, 0.26], [0.018, 0.0]
        ], 0.007, alloy);
        group.add(blade);
        const slots = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < slots; i++) {
          const y = 0.1 + (i / (slots - 1)) * 0.34;
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.05, 0.012), carbon);
          slot.position.set(-0.002 + i * 0.001, y, 0);
          slot.rotation.z = -0.25;
          group.add(slot);
        }
        const edge = this._plate([[0.018, 0.0], [0.03, 0.26], [0.026, 0.5], [0.006, 0.58], [0.004, 0.5], [0.01, 0.02]], 0.009, trim);
        group.add(edge);

        // Stabiliser fins swept back from the guard.
        for (const s of [-1, 1]) {
          const fin = this._plate([[0, 0], [s * 0.055, -0.03], [s * 0.05, -0.05], [0, -0.012]], 0.006, carbon);
          group.add(fin);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.016, rBot: 0.017, mat: carbon, sides: this.seg(9, 6), offset: -0.02 });
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, this.seg(8, 5)), alloy);
        tail.position.y = -0.2;
        tail.rotation.x = Math.PI;
        group.add(tail);
        return group;
      },

      // ---- 77: Runic Blade ---------------------------------------------------
      createRunicBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x9DA4AB, 0.3);
        const runeColor = this.getRandomColor(rand, [0x66C8FF, 0xFFB347, 0xB388FF, 0x66FFB3]);
        const rune = this._glow(runeColor, 1.0);
        const stone = this._mat(0x5A5E66, { roughness: 0.85, metalness: 0.1 });
        const grip = this._wood(0x3A2A1C);

        const blade = this._plate(this._bladeOutline(0.58, 0.056, 0, 6, 1, { taperPow: 2.6 }), 0.010, steel);
        group.add(blade);

        // Runes lighting one after another up the blade: the phase offsets are
        // what make it read as a sentence being spoken rather than a strip
        // light.
        const runes = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < runes; i++) {
          const y = 0.05 + (i / (runes - 1)) * 0.44;
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.013), rune);
          bar.position.y = y;
          bar.userData.pulse = { min: 0.05, max: 1.4, freq: 1.6, phase: -i * 0.55 };
          group.add(bar);
          const tick = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.013), rune);
          tick.position.set((i % 2 ? 1 : -1) * 0.007, y + 0.008, 0);
          tick.userData.pulse = { min: 0.05, max: 1.4, freq: 1.6, phase: -i * 0.55 };
          group.add(tick);
        }

        this._crossguard(group, stone, 0.12, 0.018, 0.024, 0);
        const ward = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, this.seg(4, 3), 6), rune);
        ward.rotation.x = Math.PI / 2;
        ward.userData.spin = { axis: 'y', speed: 0.7 };
        group.add(ward);
        this._hilt(group, rand, {
          height: 0.17, rTop: 0.018, rBot: 0.016, mat: grip, wrapMat: grip,
          pommelMat: stone, pommel: 'wheel', offset: -0.012
        });
        return group;
      },

      // ---- 78: Flamesong Blade ----------------------------------------------
      createFlamesongBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const dark = this._mat(0x2E1A14, { roughness: 0.5, metalness: 0.6 });
        const ember = this._glow(0xFF6A1A, 1.1);
        const hot = this._glow(0xFFD24A, 1.3);
        const iron = this._cast(0x4A3028);

        // Overlapping plates with the fire showing between them, like a banked
        // fire seen through its own logs.
        const plates = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < plates; i++) {
          const t = i / (plates - 1);
          const w = 0.055 * (1 - 0.65 * t);
          const plate = this._plate([[-w, 0], [w, 0], [w * 0.7, 0.075], [-w * 0.7, 0.075]], 0.009, dark);
          plate.position.y = 0.02 + i * 0.062;
          group.add(plate);
          const gap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.008, 0.012), ember);
          gap.position.y = 0.02 + i * 0.062 + 0.075;
          gap.userData.pulse = { min: 0.4, max: 1.5, freq: 2.2, phase: -i * 0.7 };
          group.add(gap);
        }
        const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, this.seg(6, 4)), hot);
        tongue.position.y = 0.58;
        tongue.userData.sway = { axis: 'z', amp: 0.1, freq: 3.4 };
        tongue.userData.pulse = { min: 0.7, max: 1.6, freq: 3.0 };
        group.add(tongue);

        this._crossguard(group, iron, 0.11, 0.016, 0.024, 0.4);
        const coal = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(8, 5), this.seg(6, 4)), ember);
        coal.userData.pulse = { min: 0.5, max: 1.4, freq: 1.1 };
        group.add(coal);
        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.016, mat: iron, wrapMat: dark, offset: -0.012 });
        return group;
      },

      // ---- 79: Obsidian Sword ------------------------------------------------
      createObsidianSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0x14121A, { roughness: 0.05, metalness: 0.35 });
        const sheen = this._glow(this.getRandomColor(rand, [0x4A3A6B, 0x6B2A3A, 0x2A4A6B]), 0.3);
        const cord = this._wood(0x8B6A3A);

        // Knapped, not forged: the whole thing is one flake, and the faces are
        // the conchoidal fractures left behind.
        const blade = this._plate([
          [-0.05, 0.0], [-0.038, 0.24], [-0.02, 0.44], [0.0, 0.56],
          [0.026, 0.42], [0.046, 0.22], [0.042, 0.0]
        ], 0.014, glass);
        group.add(blade);
        const flakes = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < flakes; i++) {
          const t = i / flakes;
          const facet = new THREE.Mesh(new THREE.ConeGeometry(0.022 * (1 - t * 0.5), 0.07, 3), glass);
          facet.position.set(((i % 2) ? 1 : -1) * 0.02 * (1 - t), 0.05 + t * 0.44, 0.008);
          facet.rotation.set(-Math.PI / 2, 0, rand() * 2);
          facet.scale.z = 0.3;
          group.add(facet);
        }
        const gleam = this._plate([[-0.02, 0.05], [0.01, 0.05], [0.0, 0.5]], 0.017, sheen);
        group.add(gleam);

        // No metal anywhere: the tang is bound in cord and pitch.
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.03, this.seg(8, 5)), cord);
        group.add(collar);
        this._hilt(group, rand, { height: 0.17, rTop: 0.02, rBot: 0.022, mat: cord, wrapMat: cord, sides: 5, offset: -0.016 });
        const butt = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 3), glass);
        butt.position.y = -0.208;
        butt.rotation.x = Math.PI;
        group.add(butt);
        return group;
      },

      // ---- 80: Mithril Sword -------------------------------------------------
      createMithrilSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const mithril = this._mat(0xEAF1F6, { roughness: 0.07, metalness: 0.96 });
        const veinColor = this.getRandomColor(rand, [0xAEE8FF, 0xD6C4FF, 0xC2FFE4]);
        const vein = this._glow(veinColor, 0.85);
        const pale = this._mat(0xDCE4EA, { roughness: 0.3, metalness: 0.6 });

        const blade = this._plate(this._bladeOutline(0.64, 0.048, 0, 8, 1, { belly: 0.1, taperPow: 2.0 }), 0.006, mithril);
        group.add(blade);
        // Filigree that follows the blade rather than lying on it.
        for (const s of [-1, 1]) {
          const curve = new THREE.CubicBezierCurve3(
            new THREE.Vector3(s * 0.012, 0.02, 0.004),
            new THREE.Vector3(s * 0.024, 0.18, 0.004),
            new THREE.Vector3(s * 0.006, 0.42, 0.004),
            new THREE.Vector3(0, 0.6, 0.004)
          );
          const line = new THREE.Mesh(new THREE.TubeGeometry(curve, this.seg(8, 4), 0.0022, this.seg(4, 3), false), vein);
          line.userData.pulse = { min: 0.3, max: 1.0, freq: 0.7, phase: s };
          group.add(line);
        }

        // Guard of two leaves lifting away from the blade.
        for (const s of [-1, 1]) {
          const leaf = this._plate([[0, 0], [s * 0.05, 0.02], [s * 0.08, 0.062], [s * 0.03, 0.036]], 0.006, mithril);
          group.add(leaf);
        }
        this._hilt(group, rand, { height: 0.19, rTop: 0.016, rBot: 0.014, mat: pale, sides: this.seg(10, 6), offset: -0.006 });
        const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), vein);
        drop.scale.y = 1.5;
        drop.position.y = -0.212;
        drop.userData.spin = { axis: 'y', speed: 0.6 };
        drop.userData.pulse = { min: 0.4, max: 1.2, freq: 1.0 };
        group.add(drop);
        return group;
      },

      // ---- 81: Vibro Blade ---------------------------------------------------
      createVibroBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xC0C5CA, { roughness: 0.28, metalness: 0.88 });
        const housing = this._mat(0x36393E, { roughness: 0.5, metalness: 0.7 });
        const warn = this._glow(0xFFB300, 0.7);
        const grip = this._mat(0x1B1B1F, { roughness: 0.8, metalness: 0.1 });

        const blade = this._plate([
          [-0.022, 0.0], [-0.022, 0.46], [0.0, 0.52], [0.022, 0.46], [0.022, 0.0]
        ], 0.008, alloy);
        group.add(blade);
        // The oscillating insert: it really does move, faster than the eye can
        // follow, which is the whole product.
        const insert = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.44, 0.012), housing);
        insert.position.set(0.016, 0.24, 0);
        insert.userData.bob = { axis: 'y', amp: 0.004, freq: 38 };
        group.add(insert);

        // Motor block and its heat sink.
        const motor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.034), housing);
        motor.position.y = -0.01;
        group.add(motor);
        const fins = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < fins; i++) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.004, 0.042), alloy);
          fin.position.y = -0.03 + i * 0.008;
          group.add(fin);
        }
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.036), warn);
        lamp.position.set(-0.02, 0.006, 0);
        lamp.userData.pulse = { min: 0.15, max: 1.0, freq: 4.0 };
        group.add(lamp);

        this._hilt(group, rand, { height: 0.15, rTop: 0.018, rBot: 0.019, mat: grip, wrapMat: grip, offset: -0.03 });
        const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.012), housing);
        trigger.position.set(0.02, -0.07, 0);
        group.add(trigger);
        return group;
      },

      // ---- 82: Astral Saber --------------------------------------------------
      createAstralSaberModel(weapon, rand) {
        const group = new THREE.Group();
        const nightColor = this.getRandomColor(rand, [0x141B3A, 0x1B1430, 0x0F2230]);
        const night = this._mat(nightColor, { roughness: 0.2, metalness: 0.5 });
        const star = this._glow(0xFFFFFF, 1.3);
        const nebula = this._glow(this.getRandomColor(rand, [0x6C4AB6, 0x2A6FB6, 0xB64A8C]), 0.5);
        const silver = this._cast(0xC0C6CC);

        // A curved blade cut out of the night sky, with its own constellation
        // in it.
        const blade = this._plate(this._bladeOutline(0.62, 0.046, 0.18, 8, 0.75, { taperPow: 3.2 }), 0.006, night);
        group.add(blade);
        const wash = this._plate(this._bladeOutline(0.58, 0.03, 0.185, 8, 0.6, { taperPow: 3.2 }), 0.008, nebula);
        wash.userData.pulse = { min: 0.25, max: 0.7, freq: 0.5 };
        group.add(wash);
        const stars = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < stars; i++) {
          const t = (i + 0.5) / stars;
          const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.0045 + rand() * 0.004, 0), star);
          s.position.set(0.18 * 0.62 * t * t + (rand() - 0.5) * 0.03, t * 0.6, 0.005);
          s.userData.pulse = { min: 0.2, max: 1.6, freq: 1.2 + rand(), phase: i * 1.7 };
          group.add(s);
        }

        this._crossguard(group, silver, 0.1, 0.012, 0.018, 0.5);
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.015, mat: night, wrapMat: silver, offset: -0.01 });
        const orbiter = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(7, 5), this.seg(5, 4)), star);
        orbiter.position.y = -0.19;
        orbiter.userData.orbit = { radius: 0.032, speed: 1.1, plane: 'xz' };
        orbiter.userData.pulse = { min: 0.5, max: 1.4, freq: 1.6 };
        group.add(orbiter);
        return group;
      },

      // ---- 83: Shadowsteel Sword ---------------------------------------------
      createShadowsteelSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x0E0F12, { roughness: 0.95, metalness: 0.35 });
        const edge = this._mat(0x3A3F47, { roughness: 0.4, metalness: 0.8 });
        const smokeColor = 0x2A2E3A;
        const smoke = this._mat(smokeColor, { roughness: 1.0, metalness: 0, transparent: true, opacity: 0.5 });

        // Matte enough that it reads as a hole rather than a blade; only the
        // ground edge catches anything.
        const blade = this._plate(this._bladeOutline(0.62, 0.05, 0, 6, 1, { taperPow: 2.2 }), 0.009, black);
        group.add(blade);
        for (const s of [-1, 1]) {
          const bevel = this._plate([[s * 0.025, 0.0], [s * 0.017, 0.0], [0, 0.62], [s * 0.004, 0.62]], 0.011, edge);
          group.add(bevel);
        }
        // Smoke that keeps coming off it.
        const wisps = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < wisps; i++) {
          const t = i / wisps;
          const wisp = new THREE.Mesh(new THREE.ConeGeometry(0.02 - t * 0.008, 0.09, this.seg(5, 4)), smoke);
          wisp.position.set((rand() - 0.5) * 0.03, 0.1 + t * 0.42, -0.012);
          wisp.userData.sway = { axis: 'z', amp: 0.3, freq: 0.6 + rand() * 0.5, phase: i };
          wisp.userData.bob = { axis: 'y', amp: 0.02, freq: 0.5, phase: i * 1.3 };
          group.add(wisp);
        }

        this._crossguard(group, black, 0.11, 0.014, 0.02, 0.6);
        this._hilt(group, rand, {
          height: 0.18, rTop: 0.018, rBot: 0.016, mat: black, wrapMat: black,
          pommelMat: edge, pommel: 'disc', offset: -0.01
        });
        return group;
      },

      // ---- 84: Eternal Flame Sword -------------------------------------------
      createEternalFlameSwordModel(weapon, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(0xA8762A, { roughness: 0.4, metalness: 0.85 });
        const soot = this._mat(0x241C18, { roughness: 0.9, metalness: 0.2 });
        const fire = this._glow(0xFF8A1A, 1.2);
        const core = this._glow(0xFFF0A0, 1.5);

        // A brazier that happens to have a sword above it: the flame is the
        // point and the steel only carries it.
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.032, 0.04, this.seg(10, 6)), bronze);
        bowl.position.y = 0.01;
        group.add(bowl);
        const coals = new THREE.Mesh(new THREE.SphereGeometry(0.036, this.seg(9, 6), this.seg(6, 4)), core);
        coals.scale.y = 0.4;
        coals.position.y = 0.026;
        coals.userData.pulse = { min: 0.6, max: 1.6, freq: 1.4 };
        group.add(coals);

        const blade = this._plate(this._bladeOutline(0.56, 0.042, 0, 6, 1, { taperPow: 2.4 }), 0.008, soot);
        blade.position.y = 0.04;
        group.add(blade);
        // Tongues climbing the blade, each on its own beat.
        const tongues = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < tongues; i++) {
          const t = i / (tongues - 1);
          const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.016 * (1 - t * 0.6), 0.07 + rand() * 0.03, this.seg(5, 4)), fire);
          tongue.position.set(((i % 2) ? 1 : -1) * 0.014 * (1 - t), 0.09 + t * 0.48, 0);
          tongue.userData.sway = { axis: 'z', amp: 0.16, freq: 2.6 + i * 0.3, phase: i };
          tongue.userData.pulse = { min: 0.6, max: 1.5, freq: 2.4, phase: i * 0.8 };
          group.add(tongue);
        }

        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.02, mat: soot, wrapMat: bronze, offset: -0.014 });
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.018, this.seg(9, 6)), bronze);
        foot.position.y = -0.192;
        group.add(foot);
        return group;
      },

      // ---- 85: Dragon Scale Blade --------------------------------------------
      createDragonScaleBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x2E7D4F, 0x7D2E2E, 0x2E4A7D, 0x6B4A1F]);
        const hide = this._mat(hideColor, { roughness: 0.35, metalness: 0.55 });
        const horn = this._mat(0x2A241C, { roughness: 0.6, metalness: 0.15 });
        const gold = this._cast(0xD9A62A);

        const blade = this._plate(this._bladeOutline(0.6, 0.052, 0.05, 7, 0.85, { belly: 0.2, taperPow: 2.8 }), 0.009, hide);
        group.add(blade);
        // Scales all the way up, in staggered rows, so the blade reads as skin.
        const rows = this.isLowDetail() ? 4 : 7;
        for (let r = 0; r < rows; r++) {
          const t = r / rows;
          const per = t > 0.6 ? 2 : 3;
          for (let c = 0; c < per; c++) {
            const scale = new THREE.Mesh(new THREE.ConeGeometry(0.012 * (1 - t * 0.4), 0.02, 3), hide);
            scale.position.set((c - (per - 1) / 2) * 0.019 * (1 - t * 0.4), 0.06 + t * 0.44, 0.007);
            scale.rotation.set(-Math.PI / 2, 0, (r + c) % 2 ? 0.3 : -0.3);
            scale.scale.z = 0.4;
            group.add(scale);
          }
        }

        // Claw guard: four talons closing round the ricasso.
        for (const s of [-1, 1]) {
          for (let i = 0; i < 2; i++) {
            const talon = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, this.seg(5, 4)), horn);
            talon.position.set(s * (0.03 + i * 0.02), 0.012 - i * 0.01, s * i * 0.012);
            talon.rotation.z = -s * (0.9 + i * 0.3);
            group.add(talon);
          }
        }
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(9, 6), this.seg(6, 4)), horn);
        knuckle.scale.y = 0.6;
        group.add(knuckle);
        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.016, mat: horn, wrapMat: gold, offset: -0.014 });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(7, 5), this.seg(5, 4)), gold);
        eye.position.y = -0.192;
        group.add(eye);
        return group;
      },

      // ---- 86: Morphblade -----------------------------------------------------
      createMorphbladeModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xA8AEB4, { roughness: 0.25, metalness: 0.9 });
        const dark = this._mat(0x2C3037, { roughness: 0.45, metalness: 0.75 });
        const seam = this._glow(this.getRandomColor(rand, [0x4FE0FF, 0xFF8A4F]), 0.8);

        // Never quite one shape: the segments keep turning past each other, so
        // the silhouette is different every time you look.
        const segs = this.isLowDetail() ? 6 : 9;
        for (let i = 0; i < segs; i++) {
          const t = i / (segs - 1);
          const w = 0.05 * (1 - 0.6 * t);
          const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, 0.012), i % 2 ? alloy : dark);
          seg.position.y = 0.04 + i * 0.062;
          seg.userData.spin = { axis: 'y', speed: (i % 2 ? 0.5 : -0.7) * (0.4 + t) };
          group.add(seg);
          if (i < segs - 1) {
            const joint = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.35, 0.01, this.seg(8, 5)), seam);
            joint.position.y = 0.04 + i * 0.062 + 0.031;
            joint.userData.pulse = { min: 0.2, max: 1.0, freq: 1.3, phase: i * 0.6 };
            group.add(joint);
          }
        }
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4), alloy);
        tip.position.y = 0.04 + segs * 0.062;
        tip.userData.spin = { axis: 'y', speed: 1.2 };
        group.add(tip);

        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, this.seg(10, 6)), dark);
        group.add(collar);
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.018, mat: dark, wrapMat: dark, offset: -0.016 });
        return group;
      },

      // ---- 87: Starmetal Blade ------------------------------------------------
      createStarmetalBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const meteoric = this._mat(0x8A8F96, { roughness: 0.55, metalness: 0.85 });
        const band = this._mat(0xC9CED4, { roughness: 0.2, metalness: 0.95 });
        const crust = this._mat(0x2A2622, { roughness: 0.95, metalness: 0.2 });
        const grip = this._wood(0x3A2A1C);

        // Forged from a rock that fell, and it looks it: pitted, uneven, with
        // the crystal banding showing where it was ground back.
        const blade = this._plate([
          [-0.03, 0.0], [-0.036, 0.24], [-0.024, 0.46], [0.004, 0.56],
          [0.03, 0.44], [0.036, 0.2], [0.028, 0.0]
        ], 0.012, meteoric);
        group.add(blade);
        // Widmanstatten bands, at the angle they actually cut at.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.014), band);
            b.position.set(0, 0.06 + i * 0.075, 0);
            b.rotation.z = i % 2 ? 0.9 : -0.9;
            group.add(b);
          }
        }
        // Regmaglypts: the thumbprints atmospheric entry leaves.
        const pits = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < pits; i++) {
          const pit = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(6, 4), this.seg(5, 4)), crust);
          pit.position.set((rand() - 0.5) * 0.04, 0.05 + rand() * 0.45, 0.006);
          pit.scale.set(1, 1.3, 0.3);
          group.add(pit);
        }

        this._crossguard(group, crust, 0.1, 0.02, 0.026, 0);
        this._hilt(group, rand, {
          height: 0.18, rTop: 0.019, rBot: 0.017, mat: grip, wrapMat: grip,
          pommelMat: meteoric, pommel: 'nut', offset: -0.014
        });
        return group;
      },

      // ---- 88: Void Edge ------------------------------------------------------
      createVoidEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const nothing = this._mat(0x05050A, { roughness: 1.0, metalness: 0.0 });
        const rimColor = this.getRandomColor(rand, [0x8A4FFF, 0x4FFFD4, 0xFF4F8A]);
        const rim = this._glow(rimColor, 1.4);
        const iron = this._mat(0x1A1C22, { roughness: 0.5, metalness: 0.7 });

        // The blade is where the world stops. Only the outline proves it is
        // there at all.
        const shape = this._bladeOutline(0.6, 0.05, 0, 7, 1, { taperPow: 2.2 });
        const body = this._plate(shape, 0.004, nothing);
        group.add(body);
        for (const s of [-1, 1]) {
          const outline = this._plate([
            [s * 0.025, 0.0], [s * 0.021, 0.0], [s * 0.003, 0.6], [s * 0.006, 0.6]
          ], 0.007, rim);
          outline.userData.pulse = { min: 0.7, max: 1.6, freq: 0.9, phase: s };
          group.add(outline);
        }
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.008), rim);
        base.position.y = 0.002;
        base.userData.pulse = { min: 0.5, max: 1.3, freq: 0.9 };
        group.add(base);

        // The horizon ring the blade comes out of.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, this.seg(5, 4), this.seg(14, 8)), iron);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, this.seg(4, 3), this.seg(12, 7)), rim);
        inner.rotation.x = Math.PI / 2;
        inner.userData.spin = { axis: 'y', speed: -0.9 };
        group.add(inner);
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.015, mat: iron, wrapMat: iron, offset: -0.012 });
        return group;
      },

      // ---- 89: Volt Edge ------------------------------------------------------
      createVoltEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const copper = this._mat(0xB87333, { roughness: 0.3, metalness: 0.9 });
        const insul = this._mat(0x1C1F24, { roughness: 0.75, metalness: 0.1 });
        const arc = this._glow(0x9CE4FF, 1.5);

        // Two electrodes with the discharge between them doing the cutting.
        for (const s of [-1, 1]) {
          const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.5, this.seg(7, 5)), copper);
          prong.position.set(s * 0.026, 0.27, 0);
          prong.rotation.z = -s * 0.045;
          group.add(prong);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(7, 5), this.seg(5, 4)), copper);
          cap.position.set(s * 0.014, 0.52, 0);
          group.add(cap);
        }
        // The arc itself, stepping up the gap.
        const rungs = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < rungs; i++) {
          const t = (i + 0.5) / rungs;
          const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.05 * (1 - t * 0.4), 0.004, 0.004), arc);
          bolt.position.y = 0.06 + t * 0.44;
          bolt.rotation.z = (i % 2 ? 1 : -1) * 0.35;
          bolt.userData.pulse = { min: 0.0, max: 1.8, freq: 7 + i, phase: i * 2.1 };
          group.add(bolt);
        }

        const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, this.seg(10, 6)), insul);
        coil.position.y = -0.008;
        group.add(coil);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const winding = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.004, this.seg(4, 3), this.seg(12, 7)), copper);
            winding.rotation.x = Math.PI / 2;
            winding.position.y = -0.026 + i * 0.014;
            group.add(winding);
          }
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.018, mat: insul, wrapMat: insul, offset: -0.03 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(7, 5), this.seg(5, 4)), arc);
        lamp.position.y = -0.2;
        lamp.userData.pulse = { min: 0.2, max: 1.2, freq: 3.0 };
        group.add(lamp);
        return group;
      },

      // ---- 90: Hero's Legacy --------------------------------------------------
      createHerosLegacyModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xE2E7EC, 0.1);
        const gold = this._cast(0xE8C766);
        const gemColor = this.getRandomColor(rand, [0x2E86DE, 0xD63031, 0x00B894]);
        const gem = this._glow(gemColor, 0.8);
        const banner = this._mat(this.getRandomColor(rand, [0x8B1A2B, 0x1A3A8B]), { roughness: 0.95, metalness: 0 });
        const grip = this._wood(0x2B1B14);

        const blade = this._plate(this._bladeOutline(0.68, 0.052, 0, 7, 1, { taperPow: 2.3 }), 0.009, steel);
        group.add(blade);
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.011), gold);
        fuller.position.y = 0.27;
        group.add(fuller);

        // Winged guard: the shape every hero's sword in every menu has.
        for (const s of [-1, 1]) {
          const wing = this._plate([
            [0, -0.005], [s * 0.05, 0.012], [s * 0.085, 0.05], [s * 0.062, 0.042], [s * 0.03, 0.014]
          ], 0.012, gold);
          group.add(wing);
          const feather = this._plate([[s * 0.03, 0.014], [s * 0.07, 0.03], [s * 0.055, 0.008]], 0.014, steel);
          group.add(feather);
        }
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.019, 0), gem);
        stone.position.y = 0.008;
        stone.userData.spin = { axis: 'y', speed: 0.7 };
        stone.userData.pulse = { min: 0.45, max: 1.15, freq: 1.0 };
        group.add(stone);

        this._hilt(group, rand, {
          height: 0.19, rTop: 0.018, rBot: 0.016, mat: grip, wrapMat: gold,
          pommelMat: gold, pommel: 'wheel', offset: -0.012
        });
        // The ribbon tied to the pommel that follows every swing.
        for (let i = 0; i < 2; i++) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.002), banner);
          strip.position.set((i - 0.5) * 0.014, -0.25, 0);
          strip.userData.sway = { axis: 'z', amp: 0.25, freq: 1.0, phase: i * 1.4 };
          group.add(strip);
        }
        return group;
      },

      // ---- 91: Phase Blade ----------------------------------------------------
      createPhaseBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const solid = this._mat(0xB4BAC2, { roughness: 0.2, metalness: 0.9 });
        const ghostColor = this.getRandomColor(rand, [0x6FD3FF, 0xC49BFF, 0x9BFFC4]);
        const ghost = this._mat(ghostColor, {
          roughness: 0.1, metalness: 0.1, emissive: ghostColor, emissiveIntensity: 0.8,
          transparent: true, opacity: 0.35
        });
        const frame = this._mat(0x2A2E36, { roughness: 0.4, metalness: 0.8 });

        const shape = this._bladeOutline(0.6, 0.044, 0, 6, 1, { taperPow: 2.4 });
        const blade = this._plate(shape, 0.007, solid);
        group.add(blade);
        // Two copies that are only sometimes here, and never in the same place.
        for (let i = 0; i < 2; i++) {
          const echo = this._plate(shape, 0.006, ghost);
          echo.position.set(0, 0, (i ? 1 : -1) * 0.02);
          echo.userData.orbit = { radius: 0.018, speed: (i ? 1 : -1) * 0.9, phase: i * 3.1, plane: 'xz' };
          echo.userData.pulse = { min: 0.0, max: 1.4, freq: 0.8, phase: i * 2.6 };
          group.add(echo);
        }

        const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.026, this.seg(10, 6)), frame);
        group.add(emitter);
        for (const s of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.008), frame);
          post.position.set(s * 0.03, 0.022, 0);
          group.add(post);
        }
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.016, mat: frame, wrapMat: frame, offset: -0.016 });
        return group;
      },

      // ---- 92: Shadowsteel Blade ----------------------------------------------
      // The short one of the pair (see id 83): same alloy, worn as an offhand,
      // trailing a ribbon of its own shadow.
      createShadowsteelBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const black = this._mat(0x101216, { roughness: 0.9, metalness: 0.4 });
        const sheen = this._mat(0x454B55, { roughness: 0.25, metalness: 0.9 });
        const umbra = this._mat(0x1B1E26, { roughness: 1.0, metalness: 0, transparent: true, opacity: 0.45 });

        const blade = this._plate([
          [-0.02, 0.0], [-0.028, 0.2], [-0.016, 0.4], [0.006, 0.46],
          [0.028, 0.36], [0.024, 0.16], [0.018, 0.0]
        ], 0.007, black);
        group.add(blade);
        const bevel = this._plate([[0.018, 0.0], [0.024, 0.16], [0.028, 0.36], [0.006, 0.46], [0.004, 0.34], [0.008, 0.02]], 0.009, sheen);
        group.add(bevel);

        // A second blade that is not really there, lagging behind the first.
        const trail = this._plate([[-0.02, 0.0], [-0.03, 0.22], [0.0, 0.44], [0.01, 0.2]], 0.003, umbra);
        trail.position.z = -0.014;
        trail.userData.sway = { axis: 'z', amp: 0.12, freq: 0.8 };
        trail.userData.pulse = { min: 0.1, max: 0.6, freq: 0.7 };
        group.add(trail);

        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.4), black);
        guard.rotation.x = Math.PI / 2;
        group.add(guard);
        this._hilt(group, rand, {
          height: 0.14, rTop: 0.016, rBot: 0.015, mat: black, wrapMat: black,
          pommelMat: sheen, pommel: 'nut', offset: -0.008
        });
        return group;
      },

      // ---- 93: Spellbreaker Blade ---------------------------------------------
      createSpellbreakerBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x6A6F76, { roughness: 0.7, metalness: 0.7 });
        const chalk = this._mat(0xD8D2C4, { roughness: 0.9, metalness: 0.05 });
        const spent = this._glow(this.getRandomColor(rand, [0x7F5AF0, 0x2CB67D, 0xE45858]), 0.5);

        // Notched, chipped, unlovely: it is for hitting other people's magic
        // and it has been used.
        const blade = this._plate([
          [-0.028, 0.0], [-0.03, 0.2], [-0.014, 0.24], [-0.026, 0.28], [-0.018, 0.46],
          [0.002, 0.54], [0.024, 0.44], [0.014, 0.3], [0.028, 0.26], [0.02, 0.18], [0.026, 0.0]
        ], 0.011, iron);
        group.add(blade);

        // Broken sigil rings orbiting the guard: the last few wards it ate.
        const shards = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < shards; i++) {
          const frag = new THREE.Mesh(
            new THREE.TorusGeometry(0.03 + i * 0.006, 0.0035, this.seg(4, 3), this.seg(9, 6), Math.PI * (0.4 + rand() * 0.5)),
            spent);
          frag.position.y = 0.01 + i * 0.006;
          frag.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.5, 0, rand() * 6);
          frag.userData.spin = { axis: 'y', speed: (i % 2 ? 1 : -1) * (0.4 + i * 0.25) };
          frag.userData.pulse = { min: 0.1, max: 0.8, freq: 1.1, phase: i * 1.3 };
          group.add(frag);
        }
        const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.024, 0.03), iron);
        group.add(anvil);
        this._hilt(group, rand, { height: 0.17, rTop: 0.019, rBot: 0.017, mat: chalk, wrapMat: iron, offset: -0.014 });
        const hammerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, this.seg(8, 5)), iron);
        hammerCap.position.y = -0.198;
        group.add(hammerCap);
        return group;
      },

      // ---- 94: Psionic Edge ---------------------------------------------------
      createPsionicEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const chassis = this._mat(0xE4E7EA, { roughness: 0.35, metalness: 0.6 });
        const beamColor = this.getRandomColor(rand, [0xC77DFF, 0x7DD3FF, 0xFF7DC7]);
        const beam = this._mat(beamColor, {
          roughness: 0.05, metalness: 0.0, emissive: beamColor, emissiveIntensity: 1.4,
          transparent: true, opacity: 0.55
        });
        const lens = this._glow(0xFFFFFF, 1.2);

        // There is no blade. There is a lens, and a thought coming out of it.
        const shaft = this._plate(this._bladeOutline(0.58, 0.038, 0, 5, 1, { taperPow: 1.4 }), 0.02, beam);
        group.add(shaft);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.56, 0.005), lens);
        spine.position.y = 0.29;
        spine.userData.pulse = { min: 0.6, max: 1.6, freq: 1.7 };
        group.add(spine);

        const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.026, this.seg(10, 6)), chassis);
        group.add(cradle);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(7, 5)), lens);
        eye.scale.y = 0.6;
        eye.position.y = 0.012;
        eye.userData.pulse = { min: 0.5, max: 1.5, freq: 1.1 };
        group.add(eye);
        // Focusing rings that keep adjusting themselves.
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028 + i * 0.008, 0.003, this.seg(4, 3), this.seg(12, 7)), chassis);
          ring.position.y = 0.03 + i * 0.02;
          ring.rotation.x = Math.PI / 2;
          ring.userData.spin = { axis: 'y', speed: i ? -1.3 : 0.9 };
          ring.userData.bob = { axis: 'y', amp: 0.006, freq: 0.9, phase: i * 1.6 };
          group.add(ring);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.016, mat: chassis, offset: -0.016, sides: this.seg(10, 6) });
        return group;
      },

      // ---- 95: Bloodthirster --------------------------------------------------
      createBloodthirsterModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x9AA0A6, { roughness: 0.4, metalness: 0.85 });
        const bloodColor = 0x8B0F1A;
        const blood = this._mat(bloodColor, { roughness: 0.25, metalness: 0.2, emissive: bloodColor, emissiveIntensity: 0.35 });
        const bone = this._mat(0xD9CDAF, { roughness: 0.75, metalness: 0.05 });
        const iron = this._cast(0x4A3A34);

        const blade = this._plate(this._bladeOutline(0.62, 0.05, 0, 6, 1, { taperPow: 2.4 }), 0.010, steel);
        group.add(blade);
        // Blood grooves that are not decorative: they run down into the bulb.
        for (const s of [-1, 1]) {
          const groove = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.52, 0.012), blood);
          groove.position.set(s * 0.011, 0.3, 0);
          groove.userData.pulse = { min: 0.15, max: 0.7, freq: 1.15, phase: s * 0.4 };
          group.add(groove);
        }
        const sump = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.014), blood);
        sump.position.y = 0.03;
        group.add(sump);

        // Ribcage guard, and the reservoir it feeds.
        for (const s of [-1, 1]) {
          for (let i = 0; i < 2; i++) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(0.026 - i * 0.006, 0.005, this.seg(4, 3), this.seg(9, 6), Math.PI), bone);
            rib.position.set(s * (0.02 + i * 0.012), -0.004 - i * 0.008, 0);
            rib.rotation.z = s * Math.PI / 2;
            group.add(rib);
          }
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.018, rBot: 0.016, mat: iron, wrapMat: iron, offset: -0.012 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, this.seg(9, 6), this.seg(7, 5)), blood);
        bulb.position.y = -0.19;
        bulb.userData.pulse = { min: 0.2, max: 0.9, freq: 1.15 };
        bulb.userData.bob = { axis: 'y', amp: 0.004, freq: 1.15 };
        group.add(bulb);
        return group;
      },

      // ---- 96: Wardbreaker Blade ----------------------------------------------
      createWardbreakerBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x74797F, { roughness: 0.65, metalness: 0.8 });
        const dark = this._mat(0x2E3238, { roughness: 0.5, metalness: 0.7 });
        const brass = this._cast(0xB08A2A);

        // Front-heavy and wedge-tipped: made to go through a barrier rather
        // than a person.
        const blade = this._plate([
          [-0.026, 0.0], [-0.03, 0.34], [-0.05, 0.42], [0.0, 0.52],
          [0.05, 0.42], [0.03, 0.34], [0.026, 0.0]
        ], 0.013, iron);
        group.add(blade);
        const wedge = this._plate([[-0.05, 0.42], [0.0, 0.52], [0.05, 0.42], [0.0, 0.46]], 0.016, dark);
        group.add(wedge);
        // Binding chain wrapped round the strong of the blade.
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const link = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(9, 6)), brass);
            link.position.y = 0.07 + i * 0.055;
            link.rotation.set(Math.PI / 2, i % 2 ? Math.PI / 2 : 0, 0.2);
            link.scale.z = 0.4;
            group.add(link);
          }
        }

        this._crossguard(group, dark, 0.1, 0.02, 0.028, 0);
        this._hilt(group, rand, { height: 0.19, rTop: 0.02, rBot: 0.018, mat: dark, wrapMat: dark, offset: -0.014 });
        // Ram's-head pommel: the thing that actually does the breaking.
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(9, 6), this.seg(6, 4)), brass);
        skull.scale.set(1, 0.9, 1.2);
        skull.position.y = -0.216;
        group.add(skull);
        for (const s of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, this.seg(4, 3), this.seg(9, 6), Math.PI * 1.3), brass);
          horn.position.set(s * 0.024, -0.216, 0);
          horn.rotation.set(0, Math.PI / 2, s * 0.4);
          group.add(horn);
        }
        return group;
      },

      // ---- 97: Spelldrainer Edge ----------------------------------------------
      createSpelldrainerEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xAAB0B6, 0.3);
        const glass = this._mat(0xBFD8E0, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
        const manaColor = this.getRandomColor(rand, [0x4FC3F7, 0xB388FF, 0x4FFFB3]);
        const mana = this._glow(manaColor, 1.0);
        const brass = this._cast(0xB9902A);

        const blade = this._plate(this._bladeOutline(0.6, 0.046, 0, 6, 1, { taperPow: 2.4 }), 0.009, steel);
        group.add(blade);
        // Siphon channel running the length, with the charge travelling DOWN
        // it: the phases climb the other way from the runic blade's on purpose.
        const cells = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < cells; i++) {
          const t = i / (cells - 1);
          const cell = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.03, 0.012), mana);
          cell.position.y = 0.06 + t * 0.44;
          cell.userData.pulse = { min: 0.05, max: 1.3, freq: 1.5, phase: i * 0.6 };
          group.add(cell);
        }
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, this.seg(7, 5)), glass);
        tube.position.set(0, 0.28, 0.008);
        group.add(tube);

        const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.024, 0.03), brass);
        group.add(manifold);
        for (const s of [-1, 1]) {
          const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, this.seg(8, 5)), brass);
          valve.position.set(s * 0.03, 0.008, 0);
          valve.rotation.x = Math.PI / 2;
          group.add(valve);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.016, mat: brass, wrapMat: brass, offset: -0.014 });
        // The vial at the bottom, filling.
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.05, this.seg(9, 6)), glass);
        vial.position.y = -0.2;
        group.add(vial);
        const level = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.024, this.seg(9, 6)), mana);
        level.position.y = -0.212;
        level.userData.pulse = { min: 0.4, max: 1.1, freq: 0.8 };
        group.add(level);
        return group;
      },

      // ---- 98: Symbiotic Blade ------------------------------------------------
      createSymbioticBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const chitinColor = this.getRandomColor(rand, [0x6B2E4A, 0x2E4A6B, 0x4A6B2E]);
        const chitin = this._mat(chitinColor, { roughness: 0.4, metalness: 0.4 });
        const flesh = this._mat(0xC98A8A, { roughness: 0.85, metalness: 0.05 });
        const sclera = this._glow(0xFFE9A8, 0.6);
        const pupil = this._mat(0x140C0C, { roughness: 0.3, metalness: 0.1 });

        // Grown, not made. The taper is a limb's taper.
        const blade = this._plate(this._bladeOutline(0.58, 0.056, 0.06, 8, 0.7, { belly: 0.3, taperPow: 3.0 }), 0.011, chitin);
        group.add(blade);
        // Segment seams across it, and the sinew running underneath.
        const seams = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < seams; i++) {
          const t = (i + 1) / (seams + 1);
          const seam = new THREE.Mesh(new THREE.BoxGeometry(0.056 * (1 - t * 0.5), 0.006, 0.014), flesh);
          seam.position.set(0.06 * 0.58 * t * t, t * 0.56, 0);
          seam.rotation.z = -0.15;
          group.add(seam);
        }
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.5, this.seg(7, 5)), flesh);
        cord.position.set(-0.006, 0.26, -0.008);
        cord.userData.bob = { axis: 'x', amp: 0.003, freq: 1.3 };
        group.add(cord);

        // It watches. The pupil drifts; the eye closes now and then.
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(10, 6), this.seg(7, 5)), flesh);
        socket.scale.set(1.2, 0.8, 1);
        group.add(socket);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(9, 6), this.seg(6, 4)), sclera);
        eye.position.z = 0.014;
        eye.userData.pulse = { min: 0.2, max: 0.9, freq: 0.45 };
        group.add(eye);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), pupil);
        iris.position.set(0, 0, 0.03);
        iris.userData.orbit = { radius: 0.006, speed: 0.5, plane: 'xy' };
        group.add(iris);

        this._hilt(group, rand, { height: 0.16, rTop: 0.019, rBot: 0.017, mat: flesh, sides: this.seg(9, 6), offset: -0.02 });
        for (let i = 0; i < 3; i++) {
          const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, this.seg(5, 4)), chitin);
          tendril.position.set((i - 1) * 0.012, -0.2, 0);
          tendril.rotation.x = Math.PI;
          tendril.userData.sway = { axis: 'z', amp: 0.2, freq: 1.4, phase: i * 1.1 };
          group.add(tendril);
        }
        return group;
      },

      // ---- 99: Twilight Edge --------------------------------------------------
      createTwilightEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const day = this._mat(0xF0E6C8, { roughness: 0.25, metalness: 0.7, emissive: 0xFFE9A8, emissiveIntensity: 0.35 });
        const night = this._mat(0x1A1D33, { roughness: 0.35, metalness: 0.7 });
        const dusk = this._glow(this.getRandomColor(rand, [0xFF8A5B, 0xB05BFF]), 0.7);
        const iron = this._cast(0x6A6F76);

        // Split down the middle, and the seam between the halves is the part
        // that glows.
        const shape = this._bladeOutline(0.62, 0.05, 0, 7, 1, { taperPow: 2.3 });
        const half = (side, mat) => this._plate(
          shape.map(([x, y]) => [side > 0 ? Math.max(0, x) : Math.min(0, x), y]), 0.009, mat);
        group.add(half(1, day));
        group.add(half(-1, night));
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.6, 0.012), dusk);
        seam.position.y = 0.31;
        seam.userData.pulse = { min: 0.35, max: 1.1, freq: 0.6 };
        group.add(seam);

        // The guard splits too: a sun quillon and a moon one.
        const sun = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, this.seg(10, 6)), day);
        sun.position.set(0.042, 0.004, 0);
        sun.rotation.x = Math.PI / 2;
        group.add(sun);
        const moon = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.3), night);
        moon.position.set(-0.042, 0.004, 0);
        moon.rotation.set(Math.PI / 2, 0, 0.6);
        group.add(moon);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.02), iron);
        group.add(bar);

        this._hilt(group, rand, { height: 0.18, rTop: 0.017, rBot: 0.016, mat: iron, wrapMat: iron, offset: -0.01 });
        const eclipse = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.01, this.seg(12, 7)), dusk);
        eclipse.position.y = -0.2;
        eclipse.rotation.x = Math.PI / 2;
        eclipse.userData.spin = { axis: 'y', speed: 0.4 };
        group.add(eclipse);
        return group;
      },

      // ---- 100: Energy Blade ---------------------------------------------------
      createEnergyBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const emitterMat = this._mat(0x30343B, { roughness: 0.4, metalness: 0.85 });
        const trimMat = this._cast(0xB8BEC4);
        const color = this.getRandomColor(rand, [0x4FE3FF, 0xFF4F5A, 0x6BFF4F, 0xC94FFF]);
        const plasma = this._mat(color, {
          roughness: 0.0, metalness: 0.0, emissive: color, emissiveIntensity: 1.6,
          transparent: true, opacity: 0.6
        });
        const core = this._glow(0xFFFFFF, 1.8);

        // Contained, not forged: a bright core inside a soft envelope, held
        // between two containment rings.
        const envelope = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.6, this.seg(9, 6)), plasma);
        envelope.position.y = 0.32;
        group.add(envelope);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.07, this.seg(9, 6)), plasma);
        spike.position.y = 0.655;
        group.add(spike);
        const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.63, this.seg(7, 5)), core);
        thread.position.y = 0.33;
        thread.userData.pulse = { min: 1.0, max: 1.9, freq: 5.0 };
        group.add(thread);

        const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.04, this.seg(10, 6)), emitterMat);
        emitter.position.y = 0.008;
        group.add(emitter);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036 - i * 0.004, 0.004, this.seg(4, 3), this.seg(12, 7)), trimMat);
          ring.position.y = 0.05 + i * 0.05;
          ring.rotation.x = Math.PI / 2;
          ring.userData.bob = { axis: 'y', amp: 0.008, freq: 1.2, phase: i * 2 };
          group.add(ring);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.018, rBot: 0.017, mat: emitterMat, wrapMat: trimMat, offset: -0.012 });
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, this.seg(8, 5)), plasma);
        cell.position.y = -0.19;
        cell.userData.pulse = { min: 0.5, max: 1.4, freq: 1.0 };
        group.add(cell);
        return group;
      },

      // ---- 101: Divine Smiter ---------------------------------------------------
      createDivineSmiterModel(weapon, rand) {
        const group = new THREE.Group();
        const marble = this._mat(0xF2EFE6, { roughness: 0.6, metalness: 0.1 });
        const gold = this._cast(0xE8C766);
        const holy = this._glow(0xFFF4C4, 1.1);

        // A pillar with an edge on it: this is architecture, swung.
        const blade = this._plate([
          [-0.05, 0.0], [-0.05, 0.4], [-0.03, 0.52], [0.03, 0.52], [0.05, 0.4], [0.05, 0.0]
        ], 0.016, marble);
        group.add(blade);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const flute = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.4, 0.019), gold);
            flute.position.set(-0.03 + i * 0.02, 0.22, 0);
            group.add(flute);
          }
        }
        const capital = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.05), gold);
        capital.position.y = 0.535;
        group.add(capital);

        // The halo, turning slowly, level regardless of what the sword does.
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, this.seg(5, 4), this.seg(18, 10)), holy);
        halo.position.y = 0.06;
        halo.rotation.x = Math.PI / 2;
        halo.userData.spin = { axis: 'y', speed: 0.45 };
        halo.userData.pulse = { min: 0.5, max: 1.2, freq: 0.7 };
        group.add(halo);
        const rays = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2;
          const ray = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.024, 0.004), holy);
          ray.position.set(Math.cos(a) * 0.07, 0.06, Math.sin(a) * 0.07);
          ray.userData.pulse = { min: 0.2, max: 1.3, freq: 1.4, phase: i };
          group.add(ray);
        }

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.026, 0.05), gold);
        base.position.y = -0.006;
        group.add(base);
        this._hilt(group, rand, { height: 0.2, rTop: 0.021, rBot: 0.019, mat: marble, wrapMat: gold, offset: -0.02 });
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.03, this.seg(8, 5)), marble);
        plinth.position.y = -0.234;
        group.add(plinth);
        return group;
      },

      // ---- 102: Arcane Blade ----------------------------------------------------
      createArcaneBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const slate = this._mat(0x3A3F4A, { roughness: 0.7, metalness: 0.3 });
        const sigilColor = this.getRandomColor(rand, [0x9B5DE5, 0x00BBF9, 0xF15BB5]);
        const sigil = this._glow(sigilColor, 1.0);
        const brass = this._cast(0xB9902A);

        // Nothing holds the blade together but the spell: the plates hang in
        // formation and turn independently.
        const plates = this.isLowDetail() ? 5 : 8;
        for (let i = 0; i < plates; i++) {
          const t = i / (plates - 1);
          const w = 0.05 * (1 - 0.55 * t);
          const plate = this._plate([[-w, 0], [w, 0], [w * 0.8, 0.045], [-w * 0.8, 0.045]], 0.008, slate);
          plate.position.y = 0.05 + i * 0.062;
          plate.userData.spin = { axis: 'y', speed: (i % 2 ? 0.4 : -0.55) };
          plate.userData.bob = { axis: 'y', amp: 0.006, freq: 0.9, phase: i * 0.7 };
          group.add(plate);
          const glyph = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.004, 0.011), sigil);
          glyph.position.y = 0.05 + i * 0.062 + 0.022;
          glyph.userData.pulse = { min: 0.2, max: 1.2, freq: 1.0, phase: i * 0.7 };
          group.add(glyph);
        }
        const apex = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), sigil);
        apex.position.y = 0.05 + plates * 0.062;
        apex.userData.spin = { axis: 'y', speed: 1.1 };
        group.add(apex);

        // The circle that casts it.
        const circle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, this.seg(4, 3), this.seg(16, 9)), brass);
        circle.rotation.x = Math.PI / 2;
        circle.userData.spin = { axis: 'y', speed: -0.35 };
        group.add(circle);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.003, this.seg(4, 3), 6), sigil);
        inner.rotation.x = Math.PI / 2;
        inner.userData.spin = { axis: 'y', speed: 0.8 };
        group.add(inner);
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.016, mat: slate, wrapMat: brass, offset: -0.01 });
        return group;
      },

      // ---- 103: Dimension Blade -------------------------------------------------
      createDimensionBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xB0B6BC, { roughness: 0.2, metalness: 0.92 });
        const portalColor = this.getRandomColor(rand, [0xFF7A18, 0x18C7FF, 0xB318FF]);
        const portal = this._glow(portalColor, 1.3);
        const frame = this._mat(0x2A2E36, { roughness: 0.45, metalness: 0.8 });

        // The blade goes into the ring and comes out somewhere else: the two
        // stubs never line up, which is the joke and the mechanism.
        const stub = this._plate([[-0.022, 0.0], [0.022, 0.0], [0.02, 0.1], [-0.02, 0.1]], 0.008, alloy);
        group.add(stub);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, this.seg(5, 4), this.seg(16, 9)), frame);
        ring.position.y = 0.13;
        group.add(ring);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.004, this.seg(16, 9)), portal);
        mouth.position.y = 0.13;
        mouth.rotation.x = Math.PI / 2;
        mouth.userData.pulse = { min: 0.5, max: 1.3, freq: 1.1 };
        group.add(mouth);

        // Upper half: offset, and slowly drifting out of true.
        const upper = new THREE.Group();
        upper.position.set(0.05, 0.19, 0);
        upper.userData.orbit = { radius: 0.012, speed: 0.5, plane: 'xz' };
        const far = this._plate(this._bladeOutline(0.4, 0.044, 0, 5, 1, { taperPow: 2.0 }), 0.008, alloy);
        upper.add(far);
        const exitRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.006, this.seg(5, 4), this.seg(14, 8)), frame);
        exitRing.rotation.x = 0.3;
        upper.add(exitRing);
        const exitMouth = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.004, this.seg(14, 8)), portal);
        exitMouth.rotation.x = Math.PI / 2 + 0.3;
        exitMouth.userData.pulse = { min: 0.5, max: 1.3, freq: 1.1, phase: 1.6 };
        upper.add(exitMouth);
        group.add(upper);

        this._crossguard(group, frame, 0.09, 0.014, 0.02, 0);
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.016, mat: frame, wrapMat: frame, offset: -0.01 });
        return group;
      },

      // ---- 104: T-Pillar Blade --------------------------------------------------
      createTPillarBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const galv = this._mat(0x9BA1A7, { roughness: 0.6, metalness: 0.8 });
        const primer = this._mat(0xB1552A, { roughness: 0.9, metalness: 0.25 });
        const rag = this._wood(0x2F2A22);

        // A structural tee, taken off a building and given a point. The web
        // and the flange are both still there.
        const flange = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 0.014), galv);
        flange.position.y = 0.3;
        group.add(flange);
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.56, 0.07), galv);
        web.position.y = 0.3;
        group.add(web);
        const point = this._plate([[-0.045, 0.58], [0.045, 0.58], [0.0, 0.68]], 0.014, galv);
        group.add(point);

        // Bolt holes, and the primer showing where it was cut.
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, this.seg(8, 5)), primer);
            hole.rotation.x = Math.PI / 2;
            hole.position.set(0, 0.12 + i * 0.12, 0);
            group.add(hole);
          }
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.02, 0.016), primer);
          cut.position.y = 0.575;
          group.add(cut);
        }

        const wrapCount = 6;
        for (let i = 0; i < wrapCount; i++) {
          const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.032, 0.05), rag);
          wrap.position.y = -0.015 - i * 0.034;
          wrap.rotation.set(0, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.14);
          group.add(wrap);
        }
        return group;
      },

      // ---- 105: Star Cutter -----------------------------------------------------
      createStarCutterModel(weapon, rand) {
        const group = new THREE.Group();
        const alloy = this._mat(0xCBD1D7, { roughness: 0.2, metalness: 0.92 });
        const dark = this._mat(0x2B2F36, { roughness: 0.45, metalness: 0.8 });
        const hotColor = this.getRandomColor(rand, [0xFFD24A, 0x4AD2FF]);
        const hot = this._glow(hotColor, 1.1);

        // A lance with a cutting star spinning on the end of it.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.44, this.seg(9, 6)), alloy);
        shaft.position.y = 0.24;
        group.add(shaft);
        const collarTop = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.03, this.seg(9, 6)), dark);
        collarTop.position.y = 0.47;
        group.add(collarTop);

        const star = new THREE.Group();
        star.position.y = 0.53;
        star.userData.spin = { axis: 'y', speed: 6.5 };
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.014, this.seg(10, 6)), dark);
        star.add(hub);
        const points = this.isLowDetail() ? 5 : 7;
        for (let i = 0; i < points; i++) {
          const a = (i / points) * Math.PI * 2;
          const tooth = this._plate([[-0.012, 0], [0.012, 0], [0, 0.05]], 0.008, alloy);
          tooth.position.set(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02);
          tooth.rotation.set(Math.PI / 2, 0, -a);
          star.add(tooth);
        }
        group.add(star);
        const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.003, this.seg(4, 3), this.seg(14, 8)), hot);
        glowRing.position.y = 0.53;
        glowRing.rotation.x = Math.PI / 2;
        glowRing.userData.pulse = { min: 0.4, max: 1.3, freq: 3.2 };
        group.add(glowRing);

        const motor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.036), dark);
        motor.position.y = 0.01;
        group.add(motor);
        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.019, mat: dark, wrapMat: dark, offset: -0.026 });
        return group;
      },

      // ---- 106: EHI Petroleum Edge ----------------------------------------------
      createPetroleumEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const slick = this._mat(0x14161A, { roughness: 0.08, metalness: 0.75 });
        const sheenColor = this.getRandomColor(rand, [0x2A6B4A, 0x6B2A5A, 0x2A4A6B]);
        const sheen = this._glow(sheenColor, 0.35);
        const pipe = this._mat(0x5A5F66, { roughness: 0.55, metalness: 0.8 });
        const hazard = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.3 });

        // Corporate crude: a blade that is mostly a fitting, with the product
        // visibly inside it.
        const blade = this._plate(this._bladeOutline(0.58, 0.05, 0, 6, 1, { taperPow: 2.2 }), 0.010, slick);
        group.add(blade);
        const film = this._plate(this._bladeOutline(0.54, 0.03, 0, 6, 1, { taperPow: 2.2 }), 0.012, sheen);
        film.userData.pulse = { min: 0.2, max: 0.5, freq: 0.5 };
        group.add(film);

        // Flanged manifold instead of a guard, with a drip valve under it.
        const manifold = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, this.seg(10, 6)), pipe);
        manifold.rotation.x = Math.PI / 2;
        group.add(manifold);
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 6), hazard);
            bolt.rotation.x = Math.PI / 2;
            bolt.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0);
            group.add(bolt);
          }
        }
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, this.seg(8, 5)), pipe);
        valve.position.set(0.036, -0.03, 0);
        valve.rotation.z = Math.PI / 2;
        group.add(valve);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(10, 6)), hazard);
        wheel.position.set(0.055, -0.03, 0);
        wheel.rotation.y = Math.PI / 2;
        wheel.userData.spin = { axis: 'x', speed: 0.35 };
        group.add(wheel);
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(6, 4), this.seg(5, 4)), slick);
        drip.scale.y = 1.6;
        drip.position.set(0.055, -0.055, 0);
        drip.userData.bob = { axis: 'y', amp: 0.012, freq: 0.7 };
        group.add(drip);

        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.017, mat: pipe, wrapMat: slick, offset: -0.02 });
        return group;
      },

      // ---- 107: Skystone Greatsword ----------------------------------------------
      createSkystoneGreatswordModel(weapon, rand) {
        const group = new THREE.Group();
        const stone = this._mat(this.getRandomColor(rand, [0x7A8290, 0x8A7A6A, 0x6A7A8A]), { roughness: 0.9, metalness: 0.08 });
        const lift = this._glow(this.getRandomColor(rand, [0x6FD3FF, 0xC0FFD3]), 0.9);
        const iron = this._cast(0x4A4F55);

        // No tang: the slab is not attached to anything. It hangs there, and
        // the field between it and the hilt is what carries the blow.
        const slab = new THREE.Group();
        slab.position.y = 0.42;
        slab.userData.bob = { axis: 'y', amp: 0.022, freq: 0.55 };
        slab.userData.sway = { axis: 'z', amp: 0.05, freq: 0.4 };
        const main = this._plate([
          [-0.075, -0.28], [-0.09, 0.02], [-0.05, 0.28], [0.03, 0.3],
          [0.085, 0.06], [0.07, -0.24]
        ], 0.03, stone);
        slab.add(main);
        // Broken-off chunks still keeping station with it.
        const chips = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < chips; i++) {
          const chip = new THREE.Mesh(new THREE.OctahedronGeometry(0.018 + rand() * 0.012, 0), stone);
          chip.position.set((rand() - 0.5) * 0.22, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.06);
          chip.userData.orbit = { radius: 0.02 + rand() * 0.02, speed: 0.3 + rand() * 0.4, phase: i * 1.9, plane: 'xy' };
          chip.userData.spin = { axis: 'z', speed: 0.4 + rand() * 0.5 };
          slab.add(chip);
        }
        group.add(slab);

        // The field itself, between hilt and stone.
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.14, this.seg(9, 6)), lift);
        column.position.y = 0.07;
        column.userData.pulse = { min: 0.4, max: 1.2, freq: 1.4 };
        group.add(column);
        const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.026, this.seg(10, 6)), iron);
        group.add(emitter);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.008, 0.004, this.seg(4, 3), this.seg(12, 7)), lift);
          ring.position.y = 0.03 + i * 0.05;
          ring.rotation.x = Math.PI / 2;
          ring.userData.bob = { axis: 'y', amp: 0.014, freq: 0.8, phase: i * 2.4 };
          ring.userData.pulse = { min: 0.3, max: 1.0, freq: 1.0, phase: i };
          group.add(ring);
        }
        this._hilt(group, rand, { height: 0.22, rTop: 0.02, rBot: 0.018, mat: iron, wrapMat: iron, offset: -0.014 });
        return group;
      },

      // ---- 108: EHI Omniscience Edge ---------------------------------------------
      createOmniscienceEdgeModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE8EAEC, { roughness: 0.3, metalness: 0.55 });
        const dark = this._mat(0x1E2126, { roughness: 0.4, metalness: 0.6 });
        const scanColor = this.getRandomColor(rand, [0x00E5FF, 0xFF3B3B]);
        const scan = this._glow(scanColor, 1.2);

        // A sensor array on a stick. It is a weapon because the company says
        // it is a weapon.
        const spar = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.56, 0.02), shell);
        spar.position.y = 0.3;
        group.add(spar);
        const tip = this._plate([[-0.022, 0.58], [0.022, 0.58], [0.0, 0.64]], 0.02, shell);
        group.add(tip);

        // Lens stack down one face, each with its own aperture.
        const lenses = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < lenses; i++) {
          const y = 0.1 + (i / (lenses - 1)) * 0.42;
          const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.026, this.seg(10, 6)), dark);
          housing.rotation.x = Math.PI / 2;
          housing.position.set(0, y, 0.014);
          group.add(housing);
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, this.seg(10, 6)), scan);
          lens.rotation.x = Math.PI / 2;
          lens.position.set(0, y, 0.016);
          lens.userData.pulse = { min: 0.15, max: 1.3, freq: 1.0, phase: i * 1.25 };
          group.add(lens);
        }
        // The scanning bar that never stops running the length of it.
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.006, 0.024), scan);
        bar.position.y = 0.3;
        bar.userData.bob = { axis: 'y', amp: 0.26, freq: 0.9 };
        bar.userData.pulse = { min: 0.6, max: 1.4, freq: 0.9 };
        group.add(bar);

        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.034), dark);
        group.add(yoke);
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(10, 6), this.seg(6, 4), 0, Math.PI * 2, 0, Math.PI / 2), shell);
        dish.position.set(-0.04, 0.008, 0);
        dish.rotation.z = 1.1;
        dish.userData.spin = { axis: 'y', speed: 0.8 };
        group.add(dish);
        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.017, mat: dark, wrapMat: dark, offset: -0.014 });
        return group;
      },

      // ---- 109: Golden Varlenia Blade --------------------------------------------
      // The state version of the Varlenia twinblades (id 30): same splayed pair,
      // rendered in gold for people who will never swing it.
      createGoldenVarleniaBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xE8C766, { roughness: 0.12, metalness: 0.98 });
        const deep = this._cast(0xA8842A);
        const gemColor = this.getRandomColor(rand, [0xD81E4A, 0x1E5AD8, 0x1ED87A]);
        const gem = this._glow(gemColor, 0.7);
        const velvet = this._mat(0x5A1030, { roughness: 0.95, metalness: 0 });

        for (const s of [-1, 1]) {
          const blade = this._plate(this._bladeOutline(0.5, 0.04, 0, 6, 0.55), 0.007, gold);
          blade.position.set(s * 0.018, 0.03, s * 0.007);
          blade.rotation.z = -s * 0.15;
          group.add(blade);
          // Pierced tracery down each blade. The eyelets hang off the blade
          // itself so they follow its tilt, and stay below where it starts
          // tapering: on a straight line in group space the upper ones sat
          // beside the metal rather than through it.
          if (this.wantsTrim()) {
            for (let i = 0; i < 4; i++) {
              const eyelet = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.002, this.seg(4, 3), this.seg(8, 5)), deep);
              eyelet.position.set(0.004, 0.06 + i * 0.047, 0);
              blade.add(eyelet);
            }
          }
        }
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.03), gold);
        group.add(yoke);
        const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), gem);
        crest.position.y = 0.014;
        crest.userData.spin = { axis: 'y', speed: 0.5 };
        crest.userData.pulse = { min: 0.4, max: 1.1, freq: 0.9 };
        group.add(crest);
        for (const s of [-1, 1]) {
          const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, this.seg(4, 3), this.seg(10, 6), Math.PI * 1.5), gold);
          scroll.position.set(s * 0.048, -0.004, 0);
          scroll.rotation.set(Math.PI / 2, 0, s * 0.5);
          group.add(scroll);
        }

        this._hilt(group, rand, {
          height: 0.17, rTop: 0.018, rBot: 0.016, mat: velvet, wrapMat: gold,
          pommelMat: gold, pommel: 'wheel', offset: -0.012
        });
        return group;
      },

      // ---- 110: Quantum Superposition Blade ---------------------------------------
      createQuantumSuperpositionBladeModel(weapon, rand) {
        const group = new THREE.Group();
        const stateColor = this.getRandomColor(rand, [0x64E9FF, 0xFF64C8, 0xC8FF64]);
        const stateMat = () => this._mat(stateColor, {
          roughness: 0.05, metalness: 0.0, emissive: stateColor, emissiveIntensity: 1.0,
          transparent: true, opacity: 0.4
        });
        const rig = this._mat(0x22262C, { roughness: 0.4, metalness: 0.85 });
        const chrome = this._cast(0xC8CED4);

        // Every position it could be in, all present, none of them settled.
        const shape = this._bladeOutline(0.56, 0.04, 0, 5, 1, { taperPow: 2.2 });
        const states = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < states; i++) {
          const a = (i / states) * Math.PI - Math.PI / 2;
          const ghost = this._plate(shape, 0.006, stateMat());
          ghost.position.set(Math.sin(a) * 0.05, 0.01, Math.cos(a) * 0.02 - 0.02);
          ghost.rotation.z = -a * 0.35;
          // Each state takes its turn at being the real one.
          ghost.userData.pulse = { min: 0.05, max: 1.5, freq: 1.3, phase: (i / states) * 6.28 };
          ghost.userData.sway = { axis: 'z', amp: 0.05, freq: 0.7, phase: i };
          group.add(ghost);
        }

        // The apparatus holding the question open.
        const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.03, this.seg(12, 7)), rig);
        group.add(cage);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, this.seg(4, 3), this.seg(14, 8)), chrome);
          ring.position.y = 0.01;
          ring.rotation.set(i ? 0.9 : Math.PI / 2, 0, 0);
          ring.userData.spin = { axis: i ? 'x' : 'y', speed: i ? 1.4 : -1.0 };
          group.add(ring);
        }
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.016, mat: rig, wrapMat: rig, offset: -0.018 });
        const readout = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.008), stateMat());
        readout.position.set(0.02, -0.06, 0.014);
        readout.userData.pulse = { min: 0.2, max: 1.4, freq: 5.0 };
        group.add(readout);
        return group;
      },

      // ---- 112: Dimensional Cutter -----------------------------------------------
      createDimensionalCutterModel(weapon, rand) {
        const group = new THREE.Group();
        const slitColor = this.getRandomColor(rand, [0xFFFFFF, 0xFFE9A8, 0xA8E9FF]);
        const slit = this._glow(slitColor, 1.8);
        const fold = this._mat(0x14121C, { roughness: 0.9, metalness: 0.1 });
        const bracket = this._mat(0x3A3F48, { roughness: 0.35, metalness: 0.9 });

        // The blade is a cut, not an object: a bright line with the space it
        // has parted folded back on either side.
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.66, 0.006), slit);
        line.position.y = 0.35;
        line.userData.pulse = { min: 1.0, max: 1.9, freq: 2.6 };
        group.add(line);
        for (const s of [-1, 1]) {
          const lip = this._plate([[0, 0], [s * 0.03, 0.05], [s * 0.024, 0.6], [0, 0.66]], 0.004, fold);
          lip.position.y = 0.02;
          lip.userData.sway = { axis: 'y', amp: 0.14, freq: 0.5, phase: s };
          group.add(lip);
        }
        // Sparks running up the cut.
        const sparks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < sparks; i++) {
          const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), slit);
          spark.position.set(0, 0.1 + (i / sparks) * 0.5, 0);
          spark.userData.bob = { axis: 'y', amp: 0.09, freq: 1.4, phase: i * 1.1 };
          spark.userData.pulse = { min: 0.0, max: 1.8, freq: 2.2, phase: i * 1.1 };
          group.add(spark);
        }

        // The brackets holding the two sides of the cut apart.
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.06, 0.014), bracket);
          arm.position.set(s * 0.032, 0.012, 0);
          arm.rotation.z = -s * 0.35;
          group.add(arm);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, this.seg(6, 4)), bracket);
          claw.position.set(s * 0.02, 0.052, 0);
          claw.rotation.z = -s * 0.8;
          group.add(claw);
        }
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.026, this.seg(10, 6)), bracket);
        group.add(base);
        this._hilt(group, rand, { height: 0.16, rTop: 0.016, rBot: 0.015, mat: fold, wrapMat: bracket, offset: -0.016 });
        return group;
      }
    }
  });
})();
