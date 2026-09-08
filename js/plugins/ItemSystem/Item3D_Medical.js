//=============================================================================
// Item 3D Models - Medical
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the medicine shelf of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Medical
 * ============================================================================
 *
 * One model per entry, keyed by database id. The pharmacy is a shelf of
 * packaging rather than a rack of objects, so what separates one entry from
 * the next here is the FORM the medicine is sold in: a pump bottle, a blister
 * strip, a nasal spray, a screw-cap syrup, an ointment tube, an ampoule, a
 * pressurised can. Anything on the shelf with no entry here falls back to the
 * pill bottle in Item3D_Generic.js.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone (an item looks the same in every world), are
 * built in metres and stand on the X/Z plane. The shared construction library
 * of WeaponSystemProcedural and the helpers of Item3D_Generic (_vessel,
 * _label, _slab, _itemColor) are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Medical] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Medical',

    unique: {
      i1: 'createHandSanitizerModel',
      i2: 'createFraudulentHealingPotionModel',
      i3: 'createAcetaminophenModel',
      i4: 'createMentholDropsModel',
      i5: 'createCalciumAntacidModel',
      i6: 'createBisacodylModel',
      i7: 'createSalineSprayModel',
      i8: 'createSimethiconeDropsModel',
      i9: 'createLoperamideModel',
      i10: 'createDextromethorphanModel',
      i11: 'createBacitracinModel',
      i12: 'createCetirizineModel',
      i13: 'createHydrocortisoneModel',
      i14: 'createClotrimazoleModel',
      i15: 'createMethylSalicylateModel',
      i16: 'createPseudoephedrineModel',
      i17: 'createElectrolytePowderModel',
      i18: 'createMuscleRelaxantModel',
      i19: 'createMedicalSprayModel',
      i20: 'createVigorTonicModel',
      i21: 'createManaTonicModel',
      i22: 'createRedCocaineModel',
      i23: 'createEnergyDrinkModel',
      i24: 'createTranquilizerModel',
      i25: 'createIbuprofenModel',
      i26: 'createTournamentStimulantModel',
      i27: 'createBeastTongueElixirModel',
      i28: 'createSpeedSprayModel',
      i29: 'createAngelDustModel',
      i30: 'createSpeedModel',
      i31: 'createCrankModel',
      i32: 'createGenderShakeModel',
      i33: 'createEnduranceInjectionModel',
      i34: 'createWisdomElixirModel',
      i35: 'createUndergroundEnergyDrinkModel',
      i36: 'createPentaProteinModel',
      i37: 'createBlackMarketCocktailModel',
      i38: 'createSmellingSaltsModel',
      i39: 'createTryptocaineModel',
      i40: 'createPowerEnhancerModel',
      i41: 'createReflexEnhancerModel',
      i42: 'createRegenerationHerbModel',
      i43: 'createMorphineModel',
      i44: 'createOmegaStimulantModel',
      i45: 'createHolySeeRemedyModel',
      i46: 'createOratorsElixirModel',
      i47: 'createEnergyGelModel',
      i48: 'createUltimateBoosterModel',
      i49: 'createPhilosophersElixirModel',
      i50: 'createFightersBoosterModel',
      i51: 'createVarleniaElixirModel',
      i52: 'createSteroidsModel',
      i53: 'createIronskinSteroidModel',
      i54: 'createChiTrainingModel',
      i55: 'createSpeedTrainingModel',
      i56: 'createImperialJingModel',
      i57: 'createChampionsEssenceModel',
      i58: 'createDragonsBloodElixirModel',
      i59: 'createRegenerationNanitesModel',
      i60: 'createChronosElixirModel',
      i61: 'createMiracleElixirModel',
      i62: 'createOpiumTinctureModel',
      i63: 'createAmphetamineTabletsModel',
      i64: 'createWithdrawalSuppressantModel'
    },

    models: {
      // ======================================================================
      // Shared packaging
      // ======================================================================

      /**
       * A blister strip: a foil card with a row of domed pockets. Half the
       * shelf is sold this way, so the differences between those entries are
       * the card, the dome shape and the count rather than the whole model.
       */
      _blister(group, o) {
        const card = this._mat(o.card, { roughness: 0.55, metalness: 0.35 });
        const dome = this._mat(o.pill, { roughness: 0.35, metalness: 0.05 });
        const cols = o.cols || 2;
        const rows = o.rows || 4;
        const pitch = o.pitch || 0.016;
        const w = cols * pitch + 0.008;
        const d = rows * pitch + 0.008;
        this._slab(group, w, 0.002, d, card, 0.001);
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const pocket = new THREE.Mesh(
              o.capsule
                ? new THREE.CylinderGeometry(pitch * 0.22, pitch * 0.22, pitch * 0.62, this.seg(8, 5))
                : new THREE.SphereGeometry(pitch * 0.34, this.seg(8, 5), this.seg(6, 4), 0, Math.PI * 2, 0, Math.PI / 2),
              dome);
            pocket.position.set(
              (c - (cols - 1) / 2) * pitch,
              0.002 + (o.capsule ? pitch * 0.22 : 0),
              (r - (rows - 1) / 2) * pitch);
            if (o.capsule) pocket.rotation.x = Math.PI / 2;
            group.add(pocket);
          }
        }
        return group;
      },

      /**
       * A soft tube: crimped at the tail, threaded at the nose, lying on its
       * back. Ointments and creams are all one of these.
       */
      _tube(group, o) {
        const skin = this._mat(o.color, { roughness: 0.4, metalness: o.metal === undefined ? 0.25 : o.metal });
        const len = o.len || 0.08;
        const r = o.r || 0.012;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.96, len, this.seg(14, 8)), skin);
        body.rotation.z = Math.PI / 2;
        body.position.y = r;
        body.scale.z = 0.62;
        group.add(body);
        const crimp = new THREE.Mesh(new THREE.BoxGeometry(0.006, r * 2, r * 0.28), skin);
        crimp.position.set(-len / 2 - 0.003, r, 0);
        group.add(crimp);
        const neck = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.34, r * 0.5, 0.008, this.seg(10, 6)), skin);
        neck.rotation.z = Math.PI / 2;
        neck.position.set(len / 2 + 0.004, r, 0);
        group.add(neck);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.012, this.seg(10, 6)),
          this._mat(o.cap === undefined ? 0xFFFFFF : o.cap, { roughness: 0.6, metalness: 0.05 }));
        cap.rotation.z = Math.PI / 2;
        cap.position.set(len / 2 + 0.014, r, 0);
        group.add(cap);
        return group;
      },

      /** A pump or spray head on a bottle neck. */
      _pump(group, o) {
        const plastic = this._mat(o.color, { roughness: 0.5, metalness: 0.05 });
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(o.r * 0.55, o.r * 0.6, 0.01, this.seg(10, 6)), plastic);
        collar.position.y = o.y;
        group.add(collar);
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.004, 0.014, this.seg(8, 5)), plastic);
        stem.position.y = o.y + 0.012;
        group.add(stem);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.01), plastic);
        head.position.set(0.004, o.y + 0.022, 0);
        group.add(head);
        const nozzle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, 0.008, this.seg(8, 5)), plastic);
        nozzle.rotation.z = Math.PI / 2;
        nozzle.position.set(0.016, o.y + 0.022, 0);
        group.add(nozzle);
        return group;
      },

      // ======================================================================
      // The shelf
      // ======================================================================

      // 1. Hand Sanitizer: a clear pump bottle of gel, the pump the whole
      // reason anyone recognises one across a room.
      createHandSanitizerModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.024, h: 0.085, neck: 0.008, color: 0xE8F2F4, roughness: 0.1, opacity: 0.55,
          fill: 0xCFE8EE, fillLevel: 0.72
        });
        this._pump(group, { r: 0.024, y: 0.096, color: 0x2A7A6A });
        this._label(group, rand, 0.024, 0.04, 0.05, 0xF2F8F4);
        return group;
      },

      // 2. Fraudulent Healing Potion: the shape a healing potion is supposed
      // to be, in cheap moulded glass with a cork jammed in and a hand-written
      // tag on a string. The liquid is fruit cordial and reads as it.
      createFraudulentHealingPotionModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xC8DCE0, { roughness: 0.14, metalness: 0.0, transparent: true, opacity: 0.5 });
        const belly = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(14, 8), this.seg(11, 6)), glass);
        belly.scale.y = 0.85;
        belly.position.y = 0.026;
        group.add(belly);
        const juice = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0xC8324A, { roughness: 0.3, metalness: 0.0 }));
        juice.scale.y = 0.6;
        juice.position.y = 0.02;
        group.add(juice);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.03, this.seg(12, 7)), glass);
        neck.position.y = 0.06;
        group.add(neck);
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.0085, 0.014, this.seg(10, 6)),
          this._mat(0xB08A5A, { roughness: 0.95, metalness: 0.0 }));
        cork.position.y = 0.079;
        group.add(cork);
        const tag = this._plate([[0, 0], [0.016, 0], [0.016, 0.011], [0, 0.011]], 0.0008,
          this._mat(0xE8E0C8, { roughness: 0.95, metalness: 0.0 }));
        tag.position.set(0.009, 0.052, 0.0);
        tag.rotation.z = -0.35;
        group.add(tag);
        return group;
      },

      // 3. Acetaminophen Tablets: the plain white blister strip, two by four.
      createAcetaminophenModel(entry, rand) {
        return this._blister(new THREE.Group(), { card: 0xC8CCD0, pill: 0xF4F4F0, cols: 2, rows: 4 });
      },

      // 4. Menthol Drops: a hinged tin of lozenges, the lid tipped open so the
      // sweets inside show.
      createMentholDropsModel(entry, rand) {
        const group = new THREE.Group();
        const tin = this._steel(0x2A6A5A, 0.35);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.034), tin);
        base.position.y = 0.007;
        group.add(base);
        const drop = this._mat(0xE0F0C8, { roughness: 0.25, metalness: 0.0 });
        for (let i = 0; i < 4; i++) {
          const sweet = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), drop);
          sweet.scale.y = 0.55;
          sweet.position.set(-0.015 + (i % 2) * 0.014, 0.015, -0.007 + Math.floor(i / 2) * 0.014);
          group.add(sweet);
        }
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.034), tin);
        lid.position.set(0, 0.032, -0.021);
        lid.rotation.x = -1.05;
        group.add(lid);
        return group;
      },

      // 5. Calcium Antacid: the chalky roll, foil peeled back off the top
      // tablet.
      createCalciumAntacidModel(entry, rand) {
        const group = new THREE.Group();
        const foil = this._mat(0x3A6AB0, { roughness: 0.45, metalness: 0.5 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.07, this.seg(14, 8)), foil);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.011;
        group.add(roll);
        const chalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.005, this.seg(12, 7)),
          this._mat(0xF0EAE0, { roughness: 0.95, metalness: 0.0 }));
        chalk.rotation.z = Math.PI / 2;
        chalk.position.set(0.038, 0.011, 0);
        group.add(chalk);
        return group;
      },

      // 6. Bisacodyl Tablets: a printed carton with the strip half out of it.
      createBisacodylModel(entry, rand) {
        const group = new THREE.Group();
        const carton = this._mat(0xE0C84A, { roughness: 0.85, metalness: 0.0 });
        this._slab(group, 0.045, 0.07, 0.02, carton, 0.035);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.028, 0.003),
          this._mat(0xB8BCC0, { roughness: 0.5, metalness: 0.45 }));
        strip.position.set(0.004, 0.082, 0.004);
        strip.rotation.z = 0.14;
        group.add(strip);
        return group;
      },

      // 7. Saline Nasal Spray: the tall narrow bottle with the upright nozzle
      // that goes in a nostril, which is nothing like the pump on a soap
      // bottle.
      createSalineSprayModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.014, h: 0.06, neck: 0.006, color: 0xDCE8F0, roughness: 0.15, opacity: 0.6,
          fill: 0xE4F2F8, fillLevel: 0.7
        });
        const white = this._mat(0xF4F6F8, { roughness: 0.5, metalness: 0.05 });
        const shoulder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.009, 0.012, 0.012, this.seg(10, 6)), white);
        shoulder.position.y = 0.072;
        group.add(shoulder);
        const tip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0025, 0.005, 0.02, this.seg(10, 6)), white);
        tip.position.y = 0.088;
        group.add(tip);
        return group;
      },

      // 8. Simethicone Drops: the infant dropper bottle, squat with a long
      // calibrated pipette standing in it.
      createSimethiconeDropsModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.017, h: 0.04, neck: 0.006, color: 0xEFE8D8, roughness: 0.3, opacity: 0.8,
          fill: 0xF4F0E0, fillLevel: 0.55
        });
        const pipette = new THREE.Mesh(
          new THREE.CylinderGeometry(0.003, 0.003, 0.05, this.seg(8, 5)),
          this._mat(0xE8F0F4, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6 }));
        pipette.position.y = 0.062;
        group.add(pipette);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xC85A4A, { roughness: 0.85, metalness: 0.0 }));
        bulb.scale.y = 1.3;
        bulb.position.y = 0.092;
        group.add(bulb);
        return group;
      },

      // 9. Loperamide Capsules: a capsule blister, the pockets long instead of
      // domed.
      createLoperamideModel(entry, rand) {
        return this._blister(new THREE.Group(),
          { card: 0x9AA4AC, pill: 0x3A8A6A, cols: 2, rows: 3, capsule: true, pitch: 0.018 });
      },

      // 10. Dextromethorphan: a syrup bottle with a dosing cup upended on the
      // cap, the syrup dark red.
      createDextromethorphanModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.023, h: 0.075, neck: 0.008, color: 0x6A3A2A, roughness: 0.2, opacity: 0.75,
          fill: 0x8A1E22, fillLevel: 0.6
        });
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.012, 0.018, this.seg(12, 7)),
          this._mat(0xE8E8E0, { roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.7 }));
        cup.position.y = 0.092;
        group.add(cup);
        this._label(group, rand, 0.023, 0.036, 0.045, 0xD8C8B0);
        return group;
      },

      // 11. Bacitracin Ointment: a small metal tube with a red cap.
      createBacitracinModel(entry, rand) {
        return this._tube(new THREE.Group(), { color: 0xE8E4D8, cap: 0xB03A2A, len: 0.062, r: 0.01, metal: 0.5 });
      },

      // 12. Cetirizine Relief: a wallet pack, the strip folded into a printed
      // card that snaps shut.
      createCetirizineModel(entry, rand) {
        const group = new THREE.Group();
        const card = this._mat(0x2A6AB8, { roughness: 0.8, metalness: 0.0 });
        this._slab(group, 0.05, 0.004, 0.032, card, 0.002);
        this._blister(group, { card: 0xC0C8CE, pill: 0xF0F0F4, cols: 2, rows: 2, pitch: 0.014 });
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.032), card);
        flap.position.set(0, 0.024, -0.03);
        flap.rotation.x = -1.2;
        group.add(flap);
        return group;
      },

      // 13. Hydrocortisone Cream: a fat plastic tube, the cap wider than the
      // ointment one.
      createHydrocortisoneModel(entry, rand) {
        return this._tube(new THREE.Group(), { color: 0xF0EFEA, cap: 0x2A6A9A, len: 0.07, r: 0.014, metal: 0.05 });
      },

      // 14. Clotrimazole: the antifungal, sold as a tube inside its carton
      // rather than loose.
      createClotrimazoleModel(entry, rand) {
        const group = new THREE.Group();
        const carton = this._mat(0xE8E0D0, { roughness: 0.9, metalness: 0.0 });
        this._slab(group, 0.09, 0.024, 0.024, carton, 0.012);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.008, 0.0245),
          this._mat(0x6A2A8A, { roughness: 0.85, metalness: 0.0 }));
        band.position.y = 0.02;
        group.add(band);
        const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.014, this.seg(10, 6)),
          this._mat(0xF4F4F0, { roughness: 0.5, metalness: 0.05 }));
        nose.rotation.z = Math.PI / 2;
        nose.position.set(0.051, 0.012, 0);
        group.add(nose);
        return group;
      },

      // 15. Methyl Salicylate: the liniment bottle, brown glass with a
      // shoulder and a screw cap, and an oily wintergreen fill.
      createMethylSalicylateModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.019, h: 0.065, neck: 0.01, color: 0x5A3A18, roughness: 0.25, opacity: 0.85,
          fill: 0xC8A84A, fillLevel: 0.55, capColor: 0x2A2A2A
        });
        this._label(group, rand, 0.019, 0.03, 0.038, 0xE0D8B8);
        return group;
      },

      // 16. Pseudoephedrine Tabs: the pharmacy-counter strip, over-printed and
      // signed for, in a long narrow foil.
      createPseudoephedrineModel(entry, rand) {
        return this._blister(new THREE.Group(), { card: 0xD03A3A, pill: 0xF4E8E8, cols: 1, rows: 6, pitch: 0.014 });
      },

      // 17. Electrolyte Powder: a sealed sachet, one corner torn off.
      createElectrolytePowderModel(entry, rand) {
        const group = new THREE.Group();
        const foil = this._mat(0xE8A83A, { roughness: 0.55, metalness: 0.4 });
        const body = this._plate([
          [-0.026, 0], [0.026, 0], [0.026, 0.055], [0.012, 0.062], [-0.026, 0.062]
        ], 0.007, foil);
        body.position.y = 0.0;
        body.position.z = 0.0035;
        group.add(body);
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.006, 0.002), foil);
        seal.position.set(0, 0.003, 0.0035);
        group.add(seal);
        return group;
      },

      // 18. Muscle Relaxant: an ampoule in a foam cradle, scored at the neck
      // where it snaps.
      createMuscleRelaxantModel(entry, rand) {
        const group = new THREE.Group();
        const foam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.026),
          this._mat(0xD8D8DC, { roughness: 0.98, metalness: 0.0 }));
        foam.position.y = 0.006;
        group.add(foam);
        const glass = this._mat(0xCFE0DC, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.55 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.036, this.seg(12, 7)), glass);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.019;
        group.add(body);
        for (const s of [-1, 1]) {
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.006, 0.012, this.seg(10, 6)), glass);
          neck.rotation.z = s * Math.PI / 2;
          neck.position.set(s * 0.024, 0.019, 0);
          group.add(neck);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0062, 0.0012, this.seg(6, 4), this.seg(12, 7)),
          this._mat(0x3A8AC8, { roughness: 0.8, metalness: 0.0 }));
        ring.rotation.y = Math.PI / 2;
        ring.position.set(0.016, 0.019, 0);
        group.add(ring);
        return group;
      },

      // 19. Medical Spray: a pressurised aerosol can with a shrouded actuator,
      // which is the only thing on the shelf built to be held upside down.
      createMedicalSprayModel(entry, rand) {
        const group = new THREE.Group();
        const can = this._steel(0xB8C0C8, 0.3);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, this.seg(14, 8)), can);
        body.position.y = 0.04;
        group.add(body);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), can);
        dome.scale.y = 0.5;
        dome.position.y = 0.08;
        group.add(dome);
        const shroud = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.018, this.seg(12, 7)),
          this._mat(0x2A8A6A, { roughness: 0.6, metalness: 0.05 }));
        shroud.position.y = 0.098;
        group.add(shroud);
        const button = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.012),
          this._mat(0xF0F0F0, { roughness: 0.5, metalness: 0.05 }));
        button.position.y = 0.109;
        group.add(button);
        this._label(group, rand, 0.018, 0.042, 0.05, 0xE8F0EC);
        return group;
      },

      // 20. Vigor tonic: a small corked tonic bottle with a wired-down stopper
      // and a warm fill.
      createVigorTonicModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.015, h: 0.055, neck: 0.012, color: 0xD8E4D0, roughness: 0.12, opacity: 0.5,
          fill: 0xC87A2A, fillLevel: 0.62
        });
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.0065, 0.012, this.seg(10, 6)),
          this._mat(0xB08A5A, { roughness: 0.95, metalness: 0.0 }));
        cork.position.y = 0.072;
        group.add(cork);
        const wire = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0008, this.seg(5, 3), this.seg(12, 7)),
          this._steel(0x9AA0A8, 0.4));
        wire.rotation.x = Math.PI / 2;
        wire.position.y = 0.068;
        group.add(wire);
        return group;
      },

      // 21. Mana Tonic: the same tonic bottle, but the fill is lit and the
      // stopper is a cut stone, so the two never read as the same object.
      createManaTonicModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.016, h: 0.058, neck: 0.012, color: 0xCFDCE8, roughness: 0.1, opacity: 0.45
        });
        const mana = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0142, 0.0142, 0.036, this.seg(12, 7)), this._glow(0x3A6AE0, 0.8));
        mana.position.y = 0.018;
        mana.userData.pulse = { freq: 1.4, min: 0.5, max: 1.0 };
        group.add(mana);
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), this._glow(0x6A9AF0, 0.6));
        stone.position.y = 0.082;
        stone.userData.spin = { axis: 'y', speed: 0.5 };
        group.add(stone);
        return group;
      },

      // 22. Red Cocaine: a folded paper wrap opened onto a mirror tile, the
      // powder scraped into a line. Contraband, not pharmacy stock, and shaped
      // to say so.
      createRedCocaineModel(entry, rand) {
        const group = new THREE.Group();
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.05),
          this._mat(0xCFD8E0, { roughness: 0.05, metalness: 0.9 }));
        mirror.position.y = 0.0015;
        group.add(mirror);
        const powder = this._mat(0xC0324A, { roughness: 1.0, metalness: 0.0 });
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, this.seg(8, 5)), powder);
        line.rotation.z = Math.PI / 2;
        line.position.set(0.004, 0.0045, 0.01);
        group.add(line);
        const wrap = this._plate([[-0.016, 0], [0.016, 0], [0.012, 0.02], [-0.012, 0.02]], 0.001,
          this._mat(0xE8E2D4, { roughness: 0.95, metalness: 0.0 }));
        wrap.rotation.x = -Math.PI / 2 + 0.25;
        wrap.position.set(-0.012, 0.004, -0.012);
        group.add(wrap);
        return group;
      },

      // 23. Energy Drink: the slim can, ring pull up, with a printed band.
      createEnergyDrinkModel(entry, rand) {
        const group = new THREE.Group();
        const alu = this._steel(0xC8CCD2, 0.25);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.1, this.seg(16, 9)), alu);
        body.position.y = 0.05;
        group.add(body);
        const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.01, this.seg(16, 9)), alu);
        taper.position.y = 0.104;
        group.add(taper);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.002, this.seg(16, 9)), alu);
        lid.position.y = 0.11;
        group.add(lid);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0192, 0.0192, 0.06, this.seg(16, 9), 1, true),
          this._mat(0x1E1E24, { roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }));
        band.position.y = 0.05;
        group.add(band);
        if (this.wantsTrim()) {
          const pull = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0008, this.seg(5, 3), this.seg(10, 6)), alu);
          pull.rotation.x = Math.PI / 2;
          pull.position.set(0.004, 0.112, 0);
          group.add(pull);
        }
        return group;
      },

      // 24. Tranquilizer: a loaded syringe with the plunger drawn back, the
      // needle sheathed.
      createTranquilizerModel(entry, rand) {
        const group = new THREE.Group();
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.055, this.seg(12, 7)),
          this._mat(0xE0EAF0, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5 }));
        barrel.rotation.z = Math.PI / 2;
        barrel.position.y = 0.008;
        group.add(barrel);
        const dose = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0068, 0.03, this.seg(10, 6)),
          this._mat(0x8AA8C8, { roughness: 0.3, metalness: 0.0 }));
        dose.rotation.z = Math.PI / 2;
        dose.position.set(0.01, 0.008, 0);
        group.add(dose);
        const white = this._mat(0xF0F0F4, { roughness: 0.5, metalness: 0.05 });
        const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.024, this.seg(8, 5)), white);
        plunger.rotation.z = Math.PI / 2;
        plunger.position.set(-0.038, 0.008, 0);
        group.add(plunger);
        const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, this.seg(12, 7)), white);
        thumb.rotation.z = Math.PI / 2;
        thumb.position.set(-0.051, 0.008, 0);
        group.add(thumb);
        const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.026, this.seg(10, 6)),
          this._mat(0xE8A020, { roughness: 0.6, metalness: 0.05 }));
        sheath.rotation.z = -Math.PI / 2;
        sheath.position.set(0.041, 0.008, 0);
        group.add(sheath);
        return group;
      },

      // 25. Ibuprofen Capsules: the tub of liquid gels, cap off and a couple
      // of capsules spilled beside it.
      createIbuprofenModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.022, h: 0.06, neck: 0, color: 0xE8EAE4, roughness: 0.4, capColor: 0x8A2A6A
        });
        const gel = this._mat(0xC85A2A, { roughness: 0.2, metalness: 0.05 });
        for (let i = 0; i < 2; i++) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.013, this.seg(8, 5)), gel);
          cap.rotation.set(Math.PI / 2, 0, 0.4 - i * 0.9);
          cap.position.set(0.03 + i * 0.008, 0.004, -0.012 + i * 0.016);
          group.add(cap);
        }
        this._label(group, rand, 0.022, 0.028, 0.036, 0xF0EEE6);
        return group;
      },

      // 26. Tournament Stimulant: a squat sports shot in a moulded plastic
      // bottle, foil sealed, branded loud.
      createTournamentStimulantModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.02, h: 0.045, neck: 0.006, color: 0xE8E8EC, roughness: 0.25, opacity: 0.8,
          fill: 0xE0402A, fillLevel: 0.7
        });
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.0015, this.seg(12, 7)),
          this._steel(0xC8C8B0, 0.35));
        seal.position.y = 0.052;
        group.add(seal);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.024, this.seg(14, 8), 1, true),
          this._mat(0x101014, { roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }));
        band.position.y = 0.02;
        group.add(band);
        return group;
      },

      // ======================================================================
      // The back of the shelf: enhancers, elixirs and things sold in alleys
      // ======================================================================

      /** A crimped-cap injection vial, the form every clinical dose comes in. */
      _doseVial(group, o) {
        const glass = this._mat(o.glass, {
          roughness: 0.12, metalness: 0.0, transparent: true, opacity: o.opacity === undefined ? 0.6 : o.opacity
        });
        const h = o.h || 0.042;
        const r = o.r || 0.011;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, this.seg(12, 7)), glass);
        body.position.y = h / 2;
        group.add(body);
        const fill = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.88, r * 0.88, h * 0.55, this.seg(12, 7)),
          this._mat(o.fill, { roughness: 0.3, metalness: 0.0 }));
        fill.position.y = h * 0.275;
        group.add(fill);
        const shoulder = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.55, r, h * 0.16, this.seg(12, 7)), glass);
        shoulder.position.y = h + h * 0.08;
        group.add(shoulder);
        const crimp = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.006, this.seg(12, 7)),
          this._steel(o.crimp === undefined ? 0xC0C4CA : o.crimp, 0.35));
        crimp.position.y = h + h * 0.16 + 0.003;
        group.add(crimp);
        const septum = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.003, this.seg(10, 6)),
          this._mat(o.septum === undefined ? 0x3A3A44 : o.septum, { roughness: 0.9, metalness: 0.0 }));
        septum.position.y = h + h * 0.16 + 0.0075;
        group.add(septum);
        return group;
      },

      // 27. Beast Tongue Elixir: a hide-wrapped flask with a fang strung off
      // the neck. Nothing about it came out of a factory.
      createBeastTongueElixirModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.021, h: 0.055, neck: 0.014, color: 0x6A5A3A, roughness: 0.8, opacity: 0.95,
          fill: 0x7A5A2A, fillLevel: 0.5
        });
        const hide = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0215, 0.0215, 0.03, this.seg(12, 7), 1, true),
          this._mat(0x8A6A4A, { roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide }));
        hide.position.y = 0.022;
        group.add(hide);
        const stopper = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, this.seg(8, 5)),
          this._mat(0x4A3A28, { roughness: 0.9, metalness: 0.0 }));
        stopper.position.y = 0.077;
        group.add(stopper);
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.016, this.seg(6, 4)),
          this._mat(0xE8E4D4, { roughness: 0.5, metalness: 0.05 }));
        fang.position.set(0.019, 0.058, 0);
        fang.rotation.set(0, 0, 2.9);
        group.add(fang);
        return group;
      },

      // 28. Speed Spray: a finned pressure canister, all nozzle and no label.
      createSpeedSprayModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._steel(0xE0B028, 0.3);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.065, this.seg(14, 8)), shell);
        body.position.y = 0.033;
        group.add(body);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.02, this.seg(12, 7)), shell);
        head.position.y = 0.075;
        group.add(head);
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.01, this.seg(8, 5)),
          this._mat(0x1E1E24, { roughness: 0.6, metalness: 0.1 }));
        nozzle.position.y = 0.09;
        group.add(nozzle);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.012), shell);
            const a = i * Math.PI * 2 / 3;
            fin.position.set(Math.cos(a) * 0.017, 0.02, Math.sin(a) * 0.017);
            fin.rotation.y = -a;
            group.add(fin);
          }
        }
        return group;
      },

      // 29. Angel Dust: a stoppered vial of lit white powder lying on a
      // feather, which is the only reason the name sticks.
      createAngelDustModel(entry, rand) {
        const group = new THREE.Group();
        const feather = this._plate([
          [-0.03, 0], [0.03, 0.004], [0.032, 0.012], [-0.028, 0.01]
        ], 0.0012, this._mat(0xF0F0F4, { roughness: 0.9, metalness: 0.0 }));
        feather.rotation.x = -Math.PI / 2;
        feather.position.y = 0.001;
        group.add(feather);
        const glass = this._mat(0xE0EAF0, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 });
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, this.seg(12, 7)), glass);
        vial.rotation.z = Math.PI / 2 - 0.12;
        vial.position.set(0, 0.01, 0.004);
        group.add(vial);
        const dust = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, this.seg(10, 6)),
          this._glow(0xF4F0E0, 0.5));
        dust.rotation.z = Math.PI / 2 - 0.12;
        dust.position.set(-0.002, 0.009, 0.004);
        group.add(dust);
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.0055, 0.008, this.seg(8, 5)),
          this._mat(0xC8A878, { roughness: 0.95, metalness: 0.0 }));
        cork.rotation.z = Math.PI / 2 - 0.12;
        cork.position.set(0.026, 0.013, 0.004);
        group.add(cork);
        return group;
      },

      // 30. Speed: a paper wrap opened on a knot of crystal shards.
      createSpeedModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._plate([
          [-0.026, -0.02], [0.026, -0.02], [0.02, 0.022], [-0.02, 0.022]
        ], 0.0008, this._mat(0xE4DFD2, { roughness: 0.98, metalness: 0.0 }));
        paper.rotation.x = -Math.PI / 2;
        paper.position.y = 0.0004;
        group.add(paper);
        const shard = this._mat(0xDCE8EE, { roughness: 0.2, metalness: 0.1 });
        for (let i = 0; i < 5; i++) {
          const bit = new THREE.Mesh(new THREE.TetrahedronGeometry(0.005, 0), shard);
          const a = rand() * Math.PI * 2;
          const r = rand() * 0.009;
          bit.position.set(Math.cos(a) * r, 0.004, Math.sin(a) * r);
          bit.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          group.add(bit);
        }
        return group;
      },

      // 31. Crank: a syringe rigged out of tubing and a jar lid, cooked rather
      // than manufactured.
      createCrankModel(entry, rand) {
        const group = new THREE.Group();
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, this.seg(12, 7)),
          this._steel(0x9A8A6A, 0.6));
        lid.position.y = 0.004;
        group.add(lid);
        const sludge = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.004, this.seg(10, 6)),
          this._mat(0xB8A040, { roughness: 0.6, metalness: 0.0 }));
        sludge.position.y = 0.009;
        group.add(sludge);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, this.seg(10, 6)),
          this._mat(0xDCE4E8, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.55 }));
        barrel.rotation.set(0, 0, 1.15);
        barrel.position.set(0.014, 0.028, 0);
        group.add(barrel);
        const tube = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, this.seg(5, 3), this.seg(12, 7), 4.2),
          this._mat(0x8A3A3A, { roughness: 0.9, metalness: 0.0 }));
        tube.position.set(-0.012, 0.014, 0);
        tube.rotation.set(0.6, 0.3, 0);
        group.add(tube);
        return group;
      },

      // 32. Gender Shake: a gym shaker, lid screwed on, the mixing ball loose
      // inside a two-tone shake.
      createGenderShakeModel(entry, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(0xE8ECEF, { roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.55 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.023, 0.095, this.seg(16, 9)), plastic);
        body.position.y = 0.048;
        group.add(body);
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.021, 0.03, this.seg(14, 8)),
          this._mat(0xC85A9A, { roughness: 0.4, metalness: 0.0 }));
        lower.position.y = 0.016;
        group.add(lower);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.023, 0.028, this.seg(14, 8)),
          this._mat(0x4A8AC8, { roughness: 0.4, metalness: 0.0 }));
        upper.position.y = 0.044;
        group.add(upper);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, this.seg(16, 9)),
          this._mat(0x2A2A32, { roughness: 0.6, metalness: 0.05 }));
        lid.position.y = 0.102;
        group.add(lid);
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.008, this.seg(10, 6)),
          this._mat(0x2A2A32, { roughness: 0.6, metalness: 0.05 }));
        spout.position.set(0.012, 0.111, 0);
        group.add(spout);
        return group;
      },

      // 33. Endurance Injection: an autoinjector pen, the needle end capped.
      createEnduranceInjectionModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A6A5A, { roughness: 0.45, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.08, this.seg(12, 7)), shell);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.009;
        group.add(body);
        const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004),
          this._mat(0xE0EAF0, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.6 }));
        window_.position.set(0, 0.017, 0);
        group.add(window_);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.018, this.seg(12, 7)),
          this._mat(0xE8E8EC, { roughness: 0.5, metalness: 0.05 }));
        cap.rotation.z = Math.PI / 2;
        cap.position.set(0.048, 0.009, 0);
        group.add(cap);
        const trigger = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, this.seg(12, 7)),
          this._mat(0xC83A3A, { roughness: 0.5, metalness: 0.05 }));
        trigger.rotation.z = Math.PI / 2;
        trigger.position.set(-0.043, 0.009, 0);
        group.add(trigger);
        return group;
      },

      // 34. Wisdom Elixir: a tall cut-glass decanter with a faceted stopper,
      // sold as something you sip and think about.
      createWisdomElixirModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xD0DCE8, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.45 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.075, 8), glass);
        body.position.y = 0.038;
        group.add(body);
        const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.04, 8),
          this._mat(0x3A5A8A, { roughness: 0.3, metalness: 0.0 }));
        brew.position.y = 0.021;
        group.add(brew);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.018, this.seg(10, 6)), glass);
        neck.position.y = 0.084;
        group.add(neck);
        const stopper = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), glass);
        stopper.position.y = 0.101;
        group.add(stopper);
        return group;
      },

      // 35. Underground Energy Drink: a dented can with the branding taped
      // over and a name written on in marker.
      createUndergroundEnergyDrinkModel(entry, rand) {
        const group = new THREE.Group();
        const alu = this._steel(0x8A8E88, 0.55);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.095, this.seg(14, 8)), alu);
        body.position.y = 0.048;
        body.rotation.z = 0.03;
        group.add(body);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.008, this.seg(14, 8)), alu);
        lid.position.y = 0.099;
        lid.rotation.z = 0.03;
        group.add(lid);
        const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0212, 0.03, this.seg(14, 8), 1, true),
          this._mat(0xC8B87A, { roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }));
        tape.position.y = 0.05;
        tape.rotation.z = 0.03;
        group.add(tape);
        const scrawl = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.001),
          this._mat(0x1A1A1A, { roughness: 0.95, metalness: 0.0 }));
        scrawl.position.set(0, 0.05, 0.0215);
        group.add(scrawl);
        return group;
      },

      // 36. Penta Protein Program: the gym tub, scoop standing in the powder.
      createPentaProteinModel(entry, rand) {
        const group = new THREE.Group();
        const tub = this._mat(0x1E2A4A, { roughness: 0.5, metalness: 0.05 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.042, 0.09, this.seg(16, 9)), tub);
        body.position.y = 0.045;
        group.add(body);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0455, 0.0455, 0.034, this.seg(16, 9), 1, true),
          this._mat(0xE0A02A, { roughness: 0.8, metalness: 0.0, side: THREE.DoubleSide }));
        band.position.y = 0.048;
        group.add(band);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, this.seg(16, 9)),
          this._mat(0x101018, { roughness: 0.6, metalness: 0.05 }));
        // Off and lying flat beside the tub, not propped: a lid stood on its
        // rim is the one part of this model that could sink below the plane.
        lid.position.set(0.062, 0.006, 0.02);
        group.add(lid);
        const powder = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.006, this.seg(14, 8)),
          this._mat(0xE0D8C0, { roughness: 1.0, metalness: 0.0 }));
        powder.position.y = 0.088;
        group.add(powder);
        const scoop = new THREE.Mesh(
          new THREE.SphereGeometry(0.012, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          this._mat(0xF0F0F4, { roughness: 0.5, metalness: 0.0 }));
        scoop.rotation.x = Math.PI;
        scoop.position.set(0.012, 0.098, 0.008);
        group.add(scoop);
        return group;
      },

      // 37. Black Market Cocktail: three doses taped into one, tubing between
      // them, fuming out of a mismatched cap.
      createBlackMarketCocktailModel(entry, rand) {
        const group = new THREE.Group();
        const colours = [0x8A2A4A, 0x2A6A3A, 0xB07A1A];
        for (let i = 0; i < 3; i++) {
          const sub = new THREE.Group();
          this._doseVial(sub, { glass: 0xC8D8DC, fill: colours[i], h: 0.036, r: 0.009, crimp: 0x8A8A92 });
          sub.position.set((i - 1) * 0.019, 0, (i % 2) * 0.004);
          sub.rotation.z = (i - 1) * 0.12;
          group.add(sub);
        }
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.01, 0.022),
          this._mat(0x3A3A42, { roughness: 0.95, metalness: 0.0 }));
        tape.position.y = 0.02;
        group.add(tape);
        const fume = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)),
          this._mat(0x8AC8A0, { roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.35 }));
        fume.position.set(0.019, 0.058, 0);
        fume.userData.bob = { amp: 0.004, freq: 1.1 };
        group.add(fume);
        return group;
      },

      // 38. Smelling Salts: a gauze-wrapped crushable capsule, snapped in the
      // middle so the ammonia is out.
      createSmellingSaltsModel(entry, rand) {
        const group = new THREE.Group();
        const gauze = this._mat(0xE8E4DC, { roughness: 1.0, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.028, this.seg(10, 6)), gauze);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.007;
        group.add(body);
        for (const s of [-1, 1]) {
          const twist = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.01, this.seg(8, 5)), gauze);
          twist.rotation.z = -s * Math.PI / 2;
          twist.position.set(s * 0.019, 0.007, 0);
          group.add(twist);
        }
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.006, this.seg(10, 6)),
          this._mat(0x3A6AC8, { roughness: 0.9, metalness: 0.0 }));
        band.rotation.z = Math.PI / 2;
        band.position.y = 0.007;
        group.add(band);
        return group;
      },

      // 39. Tryptocaine: a pressurised cartridge with a dial gauge on the
      // shoulder, more diving kit than medicine.
      createTryptocaineModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._steel(0x3A4A5A, 0.35);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, this.seg(14, 8)), shell);
        body.position.y = 0.035;
        group.add(body);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), shell);
        dome.scale.y = 0.6;
        dome.position.y = 0.07;
        group.add(dome);
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.014, this.seg(10, 6)),
          this._steel(0xB08A3A, 0.3));
        valve.position.y = 0.086;
        group.add(valve);
        const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.005, this.seg(12, 7)),
          this._mat(0xE8EAE4, { roughness: 0.3, metalness: 0.2 }));
        gauge.rotation.x = Math.PI / 2;
        gauge.position.set(0, 0.076, 0.016);
        group.add(gauge);
        return group;
      },

      // 40. Power Enhancer: a bottle moulded as a dumbbell, which is exactly
      // how it is sold.
      createPowerEnhancerModel(entry, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(0x8A1E2A, { roughness: 0.4, metalness: 0.1 });
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, this.seg(10, 6)), plastic);
        bar.rotation.z = Math.PI / 2;
        bar.position.y = 0.018;
        group.add(bar);
        for (const s of [-1, 1]) {
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.016, this.seg(14, 8)), plastic);
          head.rotation.z = Math.PI / 2;
          head.position.set(s * 0.028, 0.018, 0);
          group.add(head);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.01, this.seg(10, 6)),
          this._mat(0xE0C040, { roughness: 0.5, metalness: 0.2 }));
        cap.position.y = 0.041;
        group.add(cap);
        return group;
      },

      // 41. Reflex Enhancer: a slim injector with a coil spring visible down
      // its spine.
      createReflexEnhancerModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE8E8EC, { roughness: 0.35, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.075, this.seg(12, 7)), shell);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.008;
        group.add(body);
        const coil = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0012, this.seg(5, 3), this.seg(14, 8)),
          this._steel(0x9AA0A8, 0.3));
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const ring = coil.clone();
          ring.rotation.y = Math.PI / 2;
          ring.position.set(-0.014 + i * 0.009, 0.008, 0);
          group.add(ring);
        }
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.014, this.seg(10, 6)),
          this._mat(0x2AA0C8, { roughness: 0.4, metalness: 0.1 }));
        tip.rotation.z = -Math.PI / 2;
        tip.position.set(0.044, 0.008, 0);
        group.add(tip);
        return group;
      },

      // 42. Regeneration Herb: a bundle of fresh cuttings tied with twine.
      // Nothing on this shelf is less processed.
      createRegenerationHerbModel(entry, rand) {
        const group = new THREE.Group();
        const green = this._mat(0x3A7A32, { roughness: 0.92, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.075, this.seg(6, 4)), green);
          const lean = (i - 2) * 0.11;
          stem.rotation.z = lean;
          stem.position.set(-lean * 0.035, 0.037, (i - 2) * 0.004);
          group.add(stem);
          const leaf = this._plate([[0, 0], [0.009, 0.011], [0, 0.026], [-0.009, 0.011]], 0.0008, green);
          leaf.position.set(-lean * 0.06 + 0.008, 0.05 + i * 0.004, (i - 2) * 0.004);
          leaf.rotation.z = lean + 0.7;
          group.add(leaf);
        }
        const twine = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0018, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0xB0A070, { roughness: 1.0, metalness: 0.0 }));
        twine.rotation.x = Math.PI / 2;
        twine.position.y = 0.022;
        group.add(twine);
        return group;
      },

      // 43. Morphine: a controlled dose in its amber vial, standing in the
      // opened lockbox it is issued from.
      createMorphineModel(entry, rand) {
        const group = new THREE.Group();
        const box = this._mat(0x2A3038, { roughness: 0.6, metalness: 0.3 });
        this._slab(group, 0.05, 0.014, 0.036, box, 0.007);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.036), box);
        lid.position.set(0, 0.03, -0.022);
        lid.rotation.x = -1.15;
        group.add(lid);
        const vial = new THREE.Group();
        this._doseVial(vial, { glass: 0x8A6A2A, fill: 0xD8CFAE, h: 0.032, r: 0.008, crimp: 0xC83A3A, opacity: 0.85 });
        vial.position.set(0, 0.014, 0.004);
        group.add(vial);
        return group;
      },

      // 44. Omega Stimulant: five barrels in one injector block, fired
      // together. The shape is the warning.
      createOmegaStimulantModel(entry, rand) {
        const group = new THREE.Group();
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.026),
          this._mat(0x1E1E26, { roughness: 0.5, metalness: 0.4 }));
        block.position.y = 0.03;
        group.add(block);
        const glass = this._mat(0xDCE6EA, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.5 });
        const juice = [0xC83A3A, 0xC8A03A, 0x3AC86A, 0x3A8AC8, 0x9A3AC8];
        for (let i = 0; i < 5; i++) {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(8, 5)), glass);
          barrel.position.set(-0.02 + i * 0.01, 0.015, 0);
          group.add(barrel);
          const dose = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.02, this.seg(8, 5)),
            this._mat(juice[i], { roughness: 0.3, metalness: 0.0 }));
          dose.position.set(-0.02 + i * 0.01, 0.013, 0);
          group.add(dose);
          const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.01, this.seg(6, 4)),
            this._steel(0xC0C4CA, 0.2));
          needle.position.set(-0.02 + i * 0.01, -0.0002, 0);
          group.add(needle);
        }
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.026),
          this._steel(0x8A8E96, 0.4));
        plate.position.y = 0.0015;
        group.add(plate);
        return group;
      },

      // 45. Holy See's Remedy: a sealed ampoule in a stamped reliquary case,
      // dispensed rather than sold.
      createHolySeeRemedyModel(entry, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xC8A54A, { roughness: 0.32, metalness: 0.85 });
        const case_ = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.05, 8), gold);
        case_.position.y = 0.025;
        group.add(case_);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, this.seg(10, 6)),
          this._mat(0xE8F0F4, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5 }));
        glass.position.y = 0.06;
        group.add(glass);
        const oil = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.012, this.seg(10, 6)),
          this._glow(0xF0E0A0, 0.45));
        oil.position.y = 0.057;
        group.add(oil);
        const finial = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.003), gold);
        finial.position.y = 0.078;
        group.add(finial);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.003, 0.003), gold);
        arm.position.y = 0.079;
        group.add(arm);
        return group;
      },

      // 46. Orator's Elixir: a bell-mouthed bottle, the neck flared like a
      // horn so the thing looks like what it fixes.
      createOratorsElixirModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xD8CFE0, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(14, 8), this.seg(10, 6)), glass);
        body.scale.y = 0.8;
        body.position.y = 0.02;
        group.add(body);
        const fill = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(8, 5)),
          this._mat(0x8A5AC8, { roughness: 0.3, metalness: 0.0 }));
        fill.scale.y = 0.55;
        fill.position.y = 0.014;
        group.add(fill);
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.006, 0.035, this.seg(14, 8), 1, true), glass);
        horn.material.side = THREE.DoubleSide;
        horn.position.y = 0.052;
        group.add(horn);
        return group;
      },

      // 47. Energy Gel: a foil squeeze sachet with the tear notch bitten off
      // and the gel showing.
      createEnergyGelModel(entry, rand) {
        const group = new THREE.Group();
        const foil = this._mat(0x2AA07A, { roughness: 0.5, metalness: 0.45 });
        const body = this._plate([
          [-0.018, 0], [0.018, 0], [0.018, 0.05], [0.008, 0.058], [-0.018, 0.058]
        ], 0.009, foil);
        body.position.z = 0.0045;
        group.add(body);
        const gel = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)),
          this._mat(0xC8E040, { roughness: 0.25, metalness: 0.0 }));
        gel.position.set(0.012, 0.058, 0.0045);
        group.add(gel);
        const notch = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.005, 0.0095), foil);
        notch.position.set(0, 0.003, 0.0045);
        group.add(notch);
        return group;
      },

      // 48. Ultimate Booster: one vial with the doses layered in it, each band
      // a different colour, unmixed.
      createUltimateBoosterModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xDDE6EC, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.075, this.seg(14, 8)), glass);
        body.position.y = 0.038;
        group.add(body);
        const bands = [0xC83A3A, 0xC8A03A, 0x3AC86A, 0x3A8AC8, 0x9A3AC8];
        for (let i = 0; i < bands.length; i++) {
          const layer = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.011, this.seg(12, 7)),
            this._mat(bands[i], { roughness: 0.3, metalness: 0.0 }));
          layer.position.y = 0.008 + i * 0.011;
          group.add(layer);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.012, this.seg(12, 7)),
          this._steel(0xC0C4CA, 0.3));
        cap.position.y = 0.081;
        group.add(cap);
        return group;
      },

      // 49. Philosopher's Elixir: a round-bottomed flask standing in a brass
      // ring, the fill lit gold.
      createPhilosophersElixirModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(6, 4), this.seg(16, 9)), brass);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.014;
        group.add(ring);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.015, this.seg(6, 4)), brass);
          const a = i * Math.PI * 2 / 3;
          leg.position.set(Math.cos(a) * 0.019, 0.0075, Math.sin(a) * 0.019);
          group.add(leg);
        }
        const glass = this._mat(0xE0EAEE, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4 });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(14, 8), this.seg(11, 6)), glass);
        bulb.position.y = 0.03;
        group.add(bulb);
        const gold = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(12, 7), this.seg(8, 5)),
          this._glow(0xE0B040, 0.55));
        gold.scale.y = 0.6;
        gold.position.y = 0.024;
        group.add(gold);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.03, this.seg(10, 6)), glass);
        neck.position.y = 0.066;
        group.add(neck);
        return group;
      },

      // 50. Fighter's Booster: the corner-man's squeeze bottle with a long
      // spout, taped round the middle.
      createFightersBoosterModel(entry, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(0xC82A2A, { roughness: 0.45, metalness: 0.05 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.07, this.seg(14, 8)), plastic);
        body.position.y = 0.035;
        group.add(body);
        const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0242, 0.0242, 0.016, this.seg(14, 8), 1, true),
          this._mat(0x1A1A1A, { roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }));
        tape.position.y = 0.03;
        group.add(tape);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.022, 0.012, this.seg(12, 7)), plastic);
        shoulder.position.y = 0.076;
        group.add(shoulder);
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.006, 0.03, this.seg(10, 6)),
          this._mat(0xE8E8EC, { roughness: 0.5, metalness: 0.05 }));
        spout.position.y = 0.097;
        group.add(spout);
        return group;
      },

      // 51. Elixir of Varlenia: the state remedy, in the gold the rest of
      // Varlenia's regalia is finished in.
      createVarleniaElixirModel(entry, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.008, this.seg(14, 8)), gold);
        foot.position.y = 0.004;
        group.add(foot);
        const glass = this._mat(0xE4EAE0, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.42 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(14, 8), this.seg(10, 6)), glass);
        body.scale.y = 1.15;
        body.position.y = 0.031;
        group.add(body);
        const brew = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(8, 5)),
          this._glow(0xE0C060, 0.4));
        brew.scale.y = 0.85;
        brew.position.y = 0.026;
        group.add(brew);
        const filigree = new THREE.Mesh(
          new THREE.TorusGeometry(0.019, 0.0022, this.seg(6, 4), this.seg(16, 9)), gold);
        filigree.rotation.x = Math.PI / 2;
        filigree.position.y = 0.031;
        group.add(filigree);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.016, this.seg(10, 6)), glass);
        neck.position.y = 0.058;
        group.add(neck);
        const stopper = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)), gold);
        stopper.position.y = 0.07;
        group.add(stopper);
        return group;
      },

      // 52. Steroids: a small crimped vial of oil, the strength stamped on a
      // plain white label.
      createSteroidsModel(entry, rand) {
        const group = new THREE.Group();
        this._doseVial(group, { glass: 0xD4DEE2, fill: 0xE0D08A, h: 0.038, r: 0.01 });
        this._label(group, rand, 0.01, 0.016, 0.016, 0xF4F4F0);
        return group;
      },

      // 53. Ironskin Steroid: the same dose, in iron grey with a heavier
      // crimp, so the two vials never read as one another.
      createIronskinSteroidModel(entry, rand) {
        const group = new THREE.Group();
        this._doseVial(group, {
          glass: 0x8A9098, fill: 0x6A7A82, h: 0.038, r: 0.011, crimp: 0x4A4E54, septum: 0x1E1E22, opacity: 0.8
        });
        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(0.0115, 0.0018, this.seg(5, 3), this.seg(12, 7)),
          this._steel(0x5A6068, 0.5));
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.02;
        group.add(collar);
        return group;
      },

      // ======================================================================
      // Cultivated medicine, and the things sold behind the counter
      // ======================================================================

      // 54. Chi Training: a breath-work course sold as a boxed set of paper
      // cards standing on edge in a lacquer tray.
      createChiTrainingModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.05),
          this._mat(0x2A1E1E, { roughness: 0.35, metalness: 0.15 }));
        tray.position.y = 0.006;
        group.add(tray);
        const paper = this._mat(0xE8E0CC, { roughness: 0.95, metalness: 0.0 });
        const count = this.wantsTrim() ? 6 : 3;
        for (let i = 0; i < count; i++) {
          const card = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.001), paper);
          card.position.set(0, 0.027, -0.014 + i * 0.0055);
          card.rotation.x = 0.06 * (i - count / 2);
          group.add(card);
        }
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.001, this.seg(10, 6)),
          this._mat(0xB02A2A, { roughness: 0.9, metalness: 0.0 }));
        seal.rotation.x = Math.PI / 2;
        seal.position.set(0.018, 0.03, -0.0155);
        group.add(seal);
        return group;
      },

      // 55. Speed Training: the same course for the feet, sold as a weighted
      // ankle band coiled up with its instruction card.
      createSpeedTrainingModel(entry, rand) {
        const group = new THREE.Group();
        const strap = this._mat(0x2A4A6A, { roughness: 0.9, metalness: 0.0 });
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, this.seg(8, 5), this.seg(18, 10)), strap);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.008;
        group.add(coil);
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.02),
          this._mat(0x1E2A3A, { roughness: 0.85, metalness: 0.05 }));
        pouch.position.set(0.026, 0.012, 0);
        group.add(pouch);
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.02),
          this._mat(0xE8E0CC, { roughness: 0.95, metalness: 0.0 }));
        card.position.set(-0.03, 0.0005, 0.014);
        card.rotation.y = 0.3;
        group.add(card);
        return group;
      },

      // 56. Imperial Jing: a sealed ceramic jar with a wax-sealed cloth lid
      // and a cord, the way a tonic that took a decade is stored.
      createImperialJingModel(entry, rand) {
        const group = new THREE.Group();
        const clay = this._mat(0x3A4A52, { roughness: 0.4, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.028, this.seg(14, 8), this.seg(11, 6)), clay);
        body.scale.y = 0.9;
        body.position.y = 0.026;
        group.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.012, this.seg(12, 7)), clay);
        neck.position.y = 0.05;
        group.add(neck);
        const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.008, this.seg(12, 7)),
          this._mat(0xB03A2A, { roughness: 0.95, metalness: 0.0 }));
        cloth.position.y = 0.059;
        group.add(cloth);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.0135, 0.0015, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0xC8A54A, { roughness: 0.6, metalness: 0.4 }));
        cord.rotation.x = Math.PI / 2;
        cord.position.y = 0.055;
        group.add(cord);
        return group;
      },

      // 57. Champion's Essence: a trophy-shaped flask on a plinth, which is
      // exactly the register it is sold in.
      createChampionsEssenceModel(entry, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xC8A54A, { roughness: 0.32, metalness: 0.85 });
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.01, 0.034),
          this._mat(0x2A2028, { roughness: 0.6, metalness: 0.2 }));
        plinth.position.y = 0.005;
        group.add(plinth);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.014, this.seg(10, 6)), gold);
        stem.position.y = 0.017;
        group.add(stem);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.011, 0.03, this.seg(14, 8)),
          this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 }));
        cup.position.y = 0.039;
        group.add(cup);
        const essence = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.01, 0.02, this.seg(12, 7)),
          this._glow(0xE8C860, 0.5));
        essence.position.y = 0.034;
        group.add(essence);
        for (const s of [-1, 1]) {
          const handle = new THREE.Mesh(
            new THREE.TorusGeometry(0.008, 0.0018, this.seg(5, 3), this.seg(12, 7), Math.PI), gold);
          handle.rotation.y = Math.PI / 2;
          handle.rotation.z = s > 0 ? 0 : Math.PI;
          handle.position.set(s * 0.018, 0.044, 0);
          group.add(handle);
        }
        return group;
      },

      // 58. Dragon's Blood Elixir: a horn-shaped vessel banded in iron, the
      // fill dark red and lit from inside.
      createDragonsBloodElixirModel(entry, rand) {
        const group = new THREE.Group();
        const horn = this._mat(0x3A2A22, { roughness: 0.55, metalness: 0.15 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.022, 0.08, this.seg(14, 8)), horn);
        body.position.y = 0.04;
        body.rotation.z = 0.08;
        group.add(body);
        const blood = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.019, 0.05, this.seg(12, 7)),
          this._glow(0x8A1420, 0.45));
        blood.position.y = 0.026;
        blood.rotation.z = 0.08;
        group.add(blood);
        const iron = this._steel(0x5A5E64, 0.55);
        for (const y of [0.018, 0.05]) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.021 - (y - 0.018) * 0.28, 0.0022, this.seg(6, 4), this.seg(14, 8)), iron);
          band.rotation.x = Math.PI / 2;
          band.rotation.z = 0.08;
          band.position.y = y;
          group.add(band);
        }
        const scale = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.012, this.seg(6, 4)), iron);
        scale.position.set(0.012, 0.08, 0);
        scale.rotation.z = -0.5;
        group.add(scale);
        return group;
      },

      // 59. Regeneration Nanites: a machined canister with a lit window and a
      // swarm of specks drifting inside it.
      createRegenerationNanitesModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._steel(0xB0B6BC, 0.25);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.055, this.seg(14, 8)), shell);
        body.position.y = 0.028;
        group.add(body);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.0152, 0.024, this.seg(14, 8), 1, true),
          this._mat(0x50C8E0, {
            roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4,
            emissive: 0x2A8AA0, emissiveIntensity: 0.6, side: THREE.DoubleSide
          }));
        window_.position.y = 0.028;
        group.add(window_);
        for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
          const mote = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 4, 3), this._glow(0xC8F0FF, 1.0));
          const a = rand() * Math.PI * 2;
          mote.position.set(Math.cos(a) * 0.008, 0.02 + rand() * 0.016, Math.sin(a) * 0.008);
          mote.userData.orbit = { radius: 0.008, speed: 0.8 + rand() * 0.6, phase: a };
          group.add(mote);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.01, this.seg(12, 7)), shell);
        cap.position.y = 0.06;
        group.add(cap);
        return group;
      },

      // 60. Chronos Elixir: an hourglass laid on its side and stoppered, the
      // sand inside standing still.
      createChronosElixirModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xDCE6EE, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4 });
        for (const s of [-1, 1]) {
          const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.03, this.seg(14, 8)), glass);
          bulb.position.y = 0.032 + s * 0.015;
          bulb.rotation.x = s > 0 ? Math.PI : 0;
          group.add(bulb);
        }
        const sand = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.018, this.seg(12, 7)),
          this._glow(0xC8A040, 0.35));
        sand.position.y = 0.026;
        group.add(sand);
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 });
        for (const y of [0.017, 0.047]) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, this.seg(14, 8)), brass);
          ring.position.y = y;
          group.add(ring);
        }
        const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.012, this.seg(10, 6)), brass);
        stopper.position.y = 0.055;
        group.add(stopper);
        for (let i = 0; i < 3; i++) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, this.seg(6, 4)), brass);
          const a = i * Math.PI * 2 / 3;
          post.position.set(Math.cos(a) * 0.018, 0.032, Math.sin(a) * 0.018);
          group.add(post);
        }
        return group;
      },

      // 61. Miracle Elixir: a votive phial in a silver cradle, the fill white
      // and lit, with a ring of motes turning round it.
      createMiracleElixirModel(entry, rand) {
        const group = new THREE.Group();
        const silver = this._steel(0xD0D6DC, 0.2);
        const cradle = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0025, this.seg(6, 4), this.seg(16, 9)), silver);
        cradle.rotation.x = Math.PI / 2;
        cradle.position.y = 0.006;
        group.add(cradle);
        const glass = this._mat(0xEAF0F4, { roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.38 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.017, this.seg(14, 8), this.seg(10, 6)), glass);
        body.position.y = 0.022;
        group.add(body);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(12, 7), this.seg(8, 5)),
          this._glow(0xF4F0DC, 0.9));
        light.position.y = 0.022;
        light.userData.pulse = { freq: 1.0, min: 0.6, max: 1.0 };
        group.add(light);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.018, this.seg(10, 6)), glass);
        neck.position.y = 0.046;
        group.add(neck);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, this.seg(10, 6)), silver);
        cap.position.y = 0.058;
        group.add(cap);
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.024, 0.0012, this.seg(5, 3), this.seg(18, 10)), this._glow(0xF0E8C0, 0.6));
        halo.rotation.x = Math.PI / 2.4;
        halo.position.y = 0.03;
        halo.userData.spin = { axis: 'y', speed: 0.5 };
        group.add(halo);
        return group;
      },

      // 62. Opium Tincture: the brown dropper bottle its own description
      // names, with a bone spoon lying beside it.
      createOpiumTinctureModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.016, h: 0.05, neck: 0.006, color: 0x4A2E12, roughness: 0.3, opacity: 0.9,
          fill: 0x2A1808, fillLevel: 0.5, capColor: 0x1A1A1A
        });
        const pipette = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, this.seg(8, 5)),
          this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.55 }));
        pipette.position.y = 0.07;
        group.add(pipette);
        const spoon = new THREE.Mesh(
          new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          this._mat(0xE0D8C4, { roughness: 0.7, metalness: 0.0 }));
        spoon.rotation.x = Math.PI;
        spoon.scale.y = 0.5;
        spoon.position.set(0.03, 0.0035, 0.006);
        group.add(spoon);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0015, 0.004),
          this._mat(0xE0D8C4, { roughness: 0.7, metalness: 0.0 }));
        handle.position.set(0.047, 0.0008, 0.006);
        group.add(handle);
        return group;
      },

      // 63. Amphetamine Tablets: two loose white tablets on a torn foil
      // corner, which is all its description claims.
      createAmphetamineTabletsModel(entry, rand) {
        const group = new THREE.Group();
        const foil = this._plate([[-0.016, -0.012], [0.016, -0.012], [0.013, 0.012], [-0.016, 0.012]], 0.0008,
          this._mat(0xB8BCC2, { roughness: 0.45, metalness: 0.55 }));
        foil.rotation.x = -Math.PI / 2;
        foil.position.y = 0.0004;
        group.add(foil);
        const chalk = this._mat(0xF4F4F0, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0035, this.seg(12, 7)), chalk);
          tab.position.set(-0.006 + i * 0.013, 0.0025, i * 0.004);
          group.add(tab);
          const score = new THREE.Mesh(new THREE.BoxGeometry(0.0115, 0.0006, 0.0008), this._mat(0xD8D8D4, { roughness: 1.0 }));
          score.position.set(-0.006 + i * 0.013, 0.0043, i * 0.004);
          group.add(score);
        }
        return group;
      },

      // 64. Withdrawal Suppressant: a transdermal patch peeled half off its
      // backing, which is the one delivery form on this shelf worn rather than
      // swallowed.
      createWithdrawalSuppressantModel(entry, rand) {
        const group = new THREE.Group();
        const backing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.001, 0.04),
          this._mat(0xE8E8E4, { roughness: 0.6, metalness: 0.2 }));
        backing.position.y = 0.0005;
        group.add(backing);
        const patch = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0015, 0.03),
          this._mat(0xD8C8A8, { roughness: 0.85, metalness: 0.0 }));
        patch.position.set(-0.004, 0.0018, 0);
        group.add(patch);
        const lifted = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0012, 0.03),
          this._mat(0xD8C8A8, { roughness: 0.85, metalness: 0.0 }));
        lifted.position.set(0.019, 0.006, 0);
        lifted.rotation.z = -0.6;
        group.add(lifted);
        return group;
      },

      // ======================================================================
      // The clinical shelf
      // ======================================================================
      //
      // Ids 1443 and up are real medicine rather than the corner-shop rack
      // above: courses, vials, drips, kits and the few things a physician
      // would not admit to prescribing. They come in a handful of genuine
      // dispensing forms, so the forms are shared and the CLINICAL table below
      // is one line per entry saying which form, what colour and what the
      // fitting is.

      /**
       * One dispensed medicine. `o` is a line of the CLINICAL table:
       *   form   kit | blister | vial | drip | bottle | powder | inhaler
       *          | draught | pot | phial | swarm
       *   main   the colour of the medicine itself
       *   accent the cap, the crimp, the case or the binding
       */
      _clinical(entry, rand, o) {
        const group = new THREE.Group();
        const accent = this._mat(o.accent === undefined ? 0x2A4A6A : o.accent,
          { roughness: 0.6, metalness: 0.2 });

        switch (o.form) {
          case 'kit': {
            // A case, open, with its contents showing. What is in it differs,
            // but the case is what makes it a kit rather than a dose.
            const shell = this._mat(o.accent === undefined ? 0xB03A2A : o.accent,
              { roughness: 0.7, metalness: 0.05 });
            const base = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.05), shell);
            base.position.y = 0.009;
            group.add(base);
            const lid = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.05), shell);
            lid.position.set(0, 0.042, -0.032);
            lid.rotation.x = -1.15;
            group.add(lid);
            const cross = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.001, 0.006),
              this._mat(0xF0EFEA, { roughness: 0.9, metalness: 0.0 }));
            cross.position.set(0, 0.044, -0.036);
            cross.rotation.x = -1.15;
            group.add(cross);
            const upright = cross.clone();
            upright.scale.set(0.33, 1, 3);
            group.add(upright);
            const gauze = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.014, this.seg(14, 8)),
              this._mat(0xF0ECE0, { roughness: 0.99, metalness: 0.0 }));
            gauze.rotation.z = Math.PI / 2;
            gauze.position.set(-0.02, 0.026, 0);
            group.add(gauze);
            const tool = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.004),
              this._steel(0xC0C6CC, 0.25));
            tool.position.set(0.016, 0.02, 0.008);
            tool.rotation.y = 0.3;
            group.add(tool);
            const phial = new THREE.Mesh(
              new THREE.CylinderGeometry(0.005, 0.005, 0.018, this.seg(12, 7)),
              this._mat(o.main, { roughness: 0.2, metalness: 0.0 }));
            phial.position.set(0.024, 0.027, -0.012);
            group.add(phial);
            break;
          }

          case 'blister':
            this._blister(group, {
              card: o.accent === undefined ? 0xB8BCC2 : o.accent,
              pill: o.main, cols: o.cols || 3, rows: o.rows || 3, capsule: !!o.capsule
            });
            break;

          case 'vial':
            this._doseVial(group, {
              glass: o.glass === undefined ? 0xD4DEE2 : o.glass,
              fill: o.main, h: 0.04, r: 0.011,
              crimp: o.accent === undefined ? 0xC0C4CA : o.accent
            });
            this._label(group, rand, 0.011, 0.016, 0.016, 0xF4F4F0);
            break;

          case 'drip': {
            // A bag on a stand with the line running down out of it: the one
            // form on this shelf that is given rather than taken.
            const pole = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0022, 0.0022, 0.11, this.seg(8, 5)),
              this._steel(0xB0B6BC, 0.3));
            pole.position.set(-0.022, 0.055, 0);
            group.add(pole);
            const foot = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.018, 0.004, this.seg(14, 8)),
              this._steel(0x9AA0A8, 0.4));
            foot.position.set(-0.022, 0.002, 0);
            group.add(foot);
            const bag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.008),
              this._mat(0xDCE8EE, {
                roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.45
              }));
            bag.position.set(0, 0.075, 0);
            group.add(bag);
            const fluid = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.007),
              this._mat(o.main, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.8 }));
            fluid.position.set(0, 0.068, 0);
            group.add(fluid);
            const line = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0008, 0.0008, 0.05, this.seg(6, 4)),
              this._mat(0xE8EFF2, { roughness: 0.4, metalness: 0.0 }));
            line.position.set(0.008, 0.027, 0);
            line.rotation.z = -0.12;
            group.add(line);
            const chamber = new THREE.Mesh(
              new THREE.CylinderGeometry(0.004, 0.004, 0.012, this.seg(10, 6)),
              this._mat(0xE0EAEE, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.6 }));
            chamber.position.set(0.004, 0.049, 0);
            group.add(chamber);
            break;
          }

          case 'bottle':
            this._vessel(group, rand, {
              r: 0.016, h: 0.055, neck: 0.007,
              color: o.glass === undefined ? 0x4A2E12 : o.glass,
              roughness: 0.3, opacity: 0.9,
              fill: o.main, fillLevel: 0.6,
              capColor: o.accent === undefined ? 0x1A1A1E : o.accent
            });
            this._label(group, rand, 0.016, 0.026, 0.026, 0xF0EDE0);
            break;

          case 'powder': {
            const can = this._mat(o.accent === undefined ? 0xE8E4D8 : o.accent,
              { roughness: 0.75, metalness: 0.05 });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.017, 0.017, 0.055, this.seg(16, 9)), can);
            body.position.y = 0.028;
            group.add(body);
            const cap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.017, 0.017, 0.006, this.seg(16, 9)),
              this._mat(o.main, { roughness: 0.6, metalness: 0.05 }));
            cap.position.y = 0.058;
            group.add(cap);
            if (this.wantsTrim()) {
              for (let i = 0; i < 5; i++) {
                const hole = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.001, 0.001, 0.007, this.seg(6, 4)),
                  this._mat(0x3A3A40, { roughness: 0.9, metalness: 0.05 }));
                const a = i * Math.PI * 2 / 5;
                hole.position.set(Math.cos(a) * 0.006, 0.058, Math.sin(a) * 0.006);
                group.add(hole);
              }
            }
            const dust = new THREE.Mesh(
              new THREE.CylinderGeometry(0.01, 0.01, 0.0012, this.seg(12, 7)),
              this._mat(0xF0EFE8, { roughness: 1.0, metalness: 0.0 }));
            dust.position.set(0.026, 0.0006, 0.008);
            group.add(dust);
            break;
          }

          case 'inhaler': {
            const shell = this._mat(o.main, { roughness: 0.5, metalness: 0.1 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.016), shell);
            body.position.y = 0.023;
            group.add(body);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.012),
              this._mat(o.accent === undefined ? 0xF0F0F4 : o.accent, { roughness: 0.55, metalness: 0.05 }));
            mouth.position.set(0, 0.014, 0.016);
            mouth.rotation.x = 0.35;
            group.add(mouth);
            const canister = new THREE.Mesh(
              new THREE.CylinderGeometry(0.007, 0.007, 0.016, this.seg(12, 7)),
              this._steel(0xC0C6CC, 0.3));
            canister.position.y = 0.052;
            group.add(canister);
            break;
          }

          case 'draught': {
            // Mixed by somebody rather than manufactured: a corked bottle with
            // a wired stopper and no printed label at all.
            const glass = this._mat(o.glass === undefined ? 0x3A4A38 : o.glass, {
              roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.7
            });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.017, 0.019, 0.05, this.seg(14, 8)), glass);
            body.position.y = 0.025;
            group.add(body);
            const brew = new THREE.Mesh(
              new THREE.CylinderGeometry(0.015, 0.017, 0.032, this.seg(12, 7)),
              this._mat(o.main, { roughness: 0.35, metalness: 0.0 }));
            brew.position.y = 0.018;
            group.add(brew);
            const neck = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.015, 0.016, this.seg(12, 7)), glass);
            neck.position.y = 0.058;
            group.add(neck);
            const cork = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0078, 0.0072, 0.012, this.seg(10, 6)),
              this._mat(0xB08A5A, { roughness: 0.95, metalness: 0.0 }));
            cork.position.y = 0.071;
            group.add(cork);
            const tag = this._plate([[0, 0], [0.014, 0], [0.014, 0.009], [0, 0.009]], 0.0008,
              this._mat(0xE0D8C0, { roughness: 0.98, metalness: 0.0 }));
            tag.position.set(0.012, 0.05, 0);
            tag.rotation.z = -0.3;
            group.add(tag);
            break;
          }

          case 'pot': {
            // A salve or an ointment in a screw-top pot, lid off beside it.
            const ware = this._mat(o.accent === undefined ? 0xE8E4DC : o.accent,
              { roughness: 0.4, metalness: 0.1 });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.019, 0.017, 0.022, this.seg(16, 9)), ware);
            body.position.y = 0.011;
            group.add(body);
            const salve = new THREE.Mesh(
              new THREE.CylinderGeometry(0.017, 0.017, 0.004, this.seg(14, 8)),
              this._mat(o.main, { roughness: 0.45, metalness: 0.0 }));
            salve.position.y = 0.021;
            group.add(salve);
            const lid = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.02, 0.006, this.seg(16, 9)), ware);
            lid.position.set(0.042, 0.003, 0.008);
            group.add(lid);
            break;
          }

          case 'phial': {
            // Something carried rather than dispensed: a small glass phial on
            // a cord, stoppered with wax.
            const glass = this._mat(0xE0EAEE, {
              roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4
            });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.034, this.seg(14, 8)), glass);
            body.position.y = 0.017;
            group.add(body);
            const fill = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0068, 0.0068, 0.022, this.seg(12, 7)),
              o.glow ? this._glow(o.main, 0.55) : this._mat(o.main, { roughness: 0.25, metalness: 0.0 }));
            fill.position.y = 0.013;
            group.add(fill);
            const wax = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0075, 0.007, 0.008, this.seg(10, 6)), accent);
            wax.position.y = 0.038;
            group.add(wax);
            const cord = new THREE.Mesh(
              new THREE.TorusGeometry(0.009, 0.0012, this.seg(5, 3), this.seg(12, 7)),
              this._mat(0x5A4A32, { roughness: 1.0, metalness: 0.0 }));
            cord.position.set(0, 0.044, 0);
            group.add(cord);
            break;
          }

          case 'swarm':
          default: {
            // Something that is not a drug: a charged canister with a window
            // and whatever is in it moving.
            const shell = this._steel(0xB0B6BC, 0.25);
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.013, 0.013, 0.05, this.seg(14, 8)), shell);
            body.position.y = 0.025;
            group.add(body);
            const window_ = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0132, 0.0132, 0.022, this.seg(14, 8), 1, true),
              this._mat(o.main, {
                roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.4,
                emissive: o.main, emissiveIntensity: 0.5, side: THREE.DoubleSide
              }));
            window_.position.y = 0.025;
            group.add(window_);
            for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
              const mote = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 4, 3),
                this._glow(o.main, 1.0));
              const a = i * 1.6;
              mote.position.set(Math.cos(a) * 0.007, 0.018 + i * 0.004, Math.sin(a) * 0.007);
              mote.userData.orbit = { radius: 0.007, speed: 0.9 + i * 0.2, phase: a };
              group.add(mote);
            }
            const cap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.01, 0.013, 0.008, this.seg(12, 7)), accent);
            cap.position.y = 0.054;
            group.add(cap);
            break;
          }
        }
        return group;
      },

      /** The dispatcher for the clinical shelf. */
      createClinicalModel(entry, rand) {
        const spec = family.CLINICAL[entry && entry.id];
        return this._clinical(entry, rand, spec || { form: 'vial', main: 0xD8D2C0 });
      }
    }
  };

  // The clinical shelf: one line per medicine, saying how it is dispensed.
  family.CLINICAL = {
    1443: { form: 'kit', main: 0xC8302A, accent: 0xC8302A },
    1444: { form: 'draught', main: 0x5A7A32, glass: 0x3A4A38 },
    1445: { form: 'kit', main: 0xC8302A, accent: 0x4A5A3A },
    1446: { form: 'blister', main: 0xE8E4D0, accent: 0xC8C8B8, capsule: true, cols: 2, rows: 4 },
    1447: { form: 'blister', main: 0xE0C860, accent: 0xB8BCC2, capsule: true, cols: 2, rows: 4 },
    1448: { form: 'blister', main: 0xF0EFE8, accent: 0x9AA0A8, cols: 3, rows: 4 },
    1449: { form: 'vial', main: 0xE8E4D0, accent: 0x8A2A6A },
    1450: { form: 'blister', main: 0x3A8AC8, accent: 0xB8BCC2, capsule: true, cols: 2, rows: 3 },
    1451: { form: 'vial', main: 0xE0D8B0, accent: 0x3A8A6A },
    1452: { form: 'blister', main: 0xC85A9A, accent: 0x2A2A32, cols: 3, rows: 3 },
    1453: { form: 'powder', main: 0x3A8A5A, accent: 0xE8E4D8 },
    1454: { form: 'drip', main: 0xE8D060, accent: 0xB0B6BC },
    1455: { form: 'bottle', main: 0xE8E8E0, glass: 0xE8E4DC, accent: 0x2A6A8A },
    1456: { form: 'kit', main: 0x8AC060, accent: 0x2A6A4A },
    1457: { form: 'blister', main: 0xE8E4D0, accent: 0xC0C4C8, cols: 2, rows: 1 },
    1458: { form: 'draught', main: 0x7A8A32, glass: 0x4A5A38 },
    1459: { form: 'blister', main: 0xF0EFE8, accent: 0x9AA0A8, cols: 3, rows: 2 },
    1460: { form: 'blister', main: 0xE8E8DC, accent: 0xC8A860, cols: 3, rows: 3 },
    1461: { form: 'blister', main: 0xF0F0E8, accent: 0x3A6AB0, cols: 3, rows: 3 },
    1462: { form: 'vial', main: 0xE0D0A0, accent: 0xC83A3A },
    1463: { form: 'vial', main: 0xE8E0C8, accent: 0xC8A02A },
    1464: { form: 'powder', main: 0xE0C860, accent: 0xF0EDE0 },
    1465: { form: 'blister', main: 0xE0A82A, accent: 0xC8C8B8, cols: 3, rows: 4 },
    1466: { form: 'blister', main: 0xF0E060, accent: 0xE8E4D0, cols: 3, rows: 3 },
    1467: { form: 'vial', main: 0xE8508A, accent: 0xC0C4CA },
    1468: { form: 'bottle', main: 0xE0C040, glass: 0x5A3A18, accent: 0x2A2A2A },
    1469: { form: 'blister', main: 0x8A6A4A, accent: 0x6A6E74, cols: 3, rows: 3 },
    1470: { form: 'vial', main: 0xE8DCC0, accent: 0x8A2A2A },
    1471: { form: 'drip', main: 0x8A1E22, accent: 0xC0C6CC },
    1472: { form: 'vial', main: 0xEFF4F6, accent: 0x2A6AB0 },
    1473: { form: 'blister', main: 0xF0EFE8, accent: 0xC85A2A, cols: 3, rows: 2 },
    1474: { form: 'blister', main: 0xE0E0E8, accent: 0x6A3A8A, capsule: true, cols: 2, rows: 3 },
    1475: { form: 'inhaler', main: 0x2A6AC8, accent: 0xF0F0F4 },
    1476: { form: 'blister', main: 0xE8E4EC, accent: 0x2A4A6A, cols: 3, rows: 3 },
    1477: { form: 'bottle', main: 0x8A6AC0, glass: 0x3A2A16, accent: 0x1A1A1E },
    1478: { form: 'blister', main: 0xF0EFE8, accent: 0x3A6A5A, cols: 3, rows: 4 },
    1479: { form: 'blister', main: 0xE0C8E8, accent: 0x6A4A8A, capsule: true, cols: 2, rows: 4 },
    1480: { form: 'blister', main: 0xE8E8EC, accent: 0x2A2A44, cols: 3, rows: 3 },
    1481: { form: 'blister', main: 0xF4F4F0, accent: 0xB0B6BC, cols: 3, rows: 2 },
    1482: { form: 'draught', main: 0x4A3A6A, glass: 0x3A3A4A },
    1483: { form: 'bottle', main: 0x7A4A18, glass: 0x5A3A18, accent: 0x2A2A2A },
    1484: { form: 'kit', main: 0xC8CED4, accent: 0x3A5A5A },
    1485: { form: 'blister', main: 0xE8C8A0, accent: 0x2A6A8A, capsule: true, cols: 2, rows: 3 },
    1486: { form: 'phial', main: 0xE8F0F4, accent: 0xC8A54A, glow: true },
    1487: { form: 'kit', main: 0xC8A54A, accent: 0x3A2A44 },
    1488: { form: 'draught', main: 0x3A8AC8, glass: 0x2A3A4A },
    1489: { form: 'powder', main: 0xC8A860, accent: 0xE0DCC8 },
    1490: { form: 'phial', main: 0x6A8A3A, accent: 0x3A2A1E },
    1491: { form: 'swarm', main: 0x50C8E0, accent: 0x9AA0A8 },
    1492: { form: 'vial', main: 0x50A0E0, accent: 0x2A3A5A },
    1493: { form: 'pot', main: 0xD8D8DC, accent: 0xE8E4DC },
    1494: { form: 'draught', main: 0xC8A040, glass: 0x4A3A2A },
    1495: { form: 'phial', main: 0xF0E8C0, accent: 0xC8A54A, glow: true }
  };
  for (let id = 1443; id <= 1495; id++) family.unique['i' + id] = 'createClinicalModel';

  window.ItemModelSystem.registerFamily(family);
})();
