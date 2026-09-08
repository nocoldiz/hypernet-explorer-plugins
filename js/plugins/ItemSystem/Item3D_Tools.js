//=============================================================================
// Item 3D Models - Tools
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the tool rack of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Tools
 * ============================================================================
 *
 * One model per entry, keyed by database id. The tool rack is the widest
 * shelf in the database and the least uniform: a key, a rose, a candle, an
 * umbrella and a fishing rod share nothing but the tag. So there is no shared
 * silhouette here of the kind the pharmacy has, and every builder is written
 * against the real object.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone, are built in metres and stand on the X/Z plane.
 * The shared construction library of WeaponSystemProcedural and the helpers of
 * Item3D_Generic are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Tools] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Tools',

    unique: {
      i112: 'createDungeonKeyModel',
      i113: 'createBallpointPenModel',
      i114: 'createRoseModel',
      i115: 'createCandleModel',
      i116: 'createPocketParasolModel',
      i117: 'createUmbrellaModel',
      i118: 'createUtensilSetModel',
      i119: 'createClayPotModel',
      i120: 'createInsulatedBottleModel',
      i121: 'createLanternModel',
      i122: 'createPortableChargerModel',
      i123: 'createFishingRodModel',
      i124: 'createArcadeTokenModel',
      i125: 'createBedrollModel',
      i126: 'createBackpackModel',
      i127: 'createPocketNotebookModel',
      i128: 'createTravelJournalModel',
      i129: 'createTravelBackpackModel',
      i130: 'createWristwatchModel',
      i132: 'createSewingKitModel',
      i133: 'createMp3PlayerModel',
      i134: 'createWirelessHeadphonesModel',
      i135: 'createPocketTranslatorModel',
      i136: 'createLEDFlashlightModel',
      i137: 'createGPSNavigatorModel',
      i138: 'createShovelModel',
      i139: 'createResonanceScannerModel',
      i140: 'createRamanProbeModel',
      i141: 'createDivingSuitModel',
      i142: 'createUVSunglassesModel',
      i143: 'createPocketVideoRecorderModel',
      i144: 'createDigitalCameraModel',
      i145: 'createBestiaryModel',
      i146: 'createFuelTankModel',
      i147: 'createDigitalBestiaryModel',
      i148: 'createInvisibleInkPenModel',
      i149: 'createCellphoneModel',
      i150: 'createTelescopeModel',
      i151: 'createCraftsmansBackpackModel',
      i152: 'createCompactUmbrellaModel',
      i153: 'createColorFlipPhoneModel',
      i154: 'createWirelessEarbudsModel',
      i155: 'createFrostNomadsMapModel',
      i156: 'createMultiToolModel',
      i157: 'createEncryptedBurnerPhoneModel',
      i158: 'createInvestigatorsCameraModel',
      i159: 'createRoutesMapModel',
      i160: 'createHexphoneModel',
      i161: 'createLocalMapModel',
      i162: 'createEHIPilotPDAModel',
      i163: 'createStarMapModel',
      i165: 'createBladeSeedModel',
      i175: 'createSaxophoneModel',
      i244: 'createSurgicalToolsModel',
      i390: 'createAlchemistryKitModel',
      i406: 'createFertilizerBagModel'
    },

    models: {
      // 112. Dungeon key: a long iron key with a bit cut into it and a bow
      // wide enough to hang off a belt.
      createDungeonKeyModel(entry, rand) {
        const group = new THREE.Group();
        const iron = this._steel(0x5A6068, 0.55);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.075, this.seg(10, 6)), iron);
        shaft.rotation.z = Math.PI / 2;
        shaft.position.y = 0.0035;
        group.add(shaft);
        const bow = new THREE.Mesh(
          new THREE.TorusGeometry(0.013, 0.0035, this.seg(6, 4), this.seg(16, 9)), iron);
        bow.position.set(-0.05, 0.0035, 0);
        group.add(bow);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, this.seg(10, 6)), iron);
        collar.rotation.z = Math.PI / 2;
        collar.position.set(0.02, 0.0035, 0);
        group.add(collar);
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.003), iron);
        bit.position.set(0.03, 0.01, 0);
        group.add(bit);
        const cut = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.006, 0.004),
          this._mat(0x2A2E34, { roughness: 0.9, metalness: 0.3 }));
        cut.position.set(0.031, 0.012, 0);
        group.add(cut);
        return group;
      },

      // 113. Ballpoint Pen: barrel, taper, clip and the tip out.
      createBallpointPenModel(entry, rand) {
        const group = new THREE.Group();
        const barrel = this._mat(0x1E2A4A, { roughness: 0.35, metalness: 0.2 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, this.seg(12, 7)), barrel);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.005;
        group.add(body);
        const taper = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.005, 0.016, this.seg(10, 6)), barrel);
        taper.rotation.z = -Math.PI / 2;
        taper.position.set(0.058, 0.005, 0);
        group.add(taper);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0012, 0.005, this.seg(8, 5)),
          this._steel(0xC0C4CA, 0.25));
        tip.rotation.z = -Math.PI / 2;
        tip.position.set(0.068, 0.005, 0);
        group.add(tip);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.001, 0.003),
          this._steel(0xC8A54A, 0.3));
        clip.position.set(-0.036, 0.0105, 0);
        group.add(clip);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, this.seg(10, 6)),
          this._steel(0xC8A54A, 0.3));
        cap.rotation.z = Math.PI / 2;
        cap.position.set(-0.047, 0.005, 0);
        group.add(cap);
        return group;
      },

      // 114. Rose: a purple rose, as the description says, cut long with two
      // leaves and thorns down the stem.
      createRoseModel(entry, rand) {
        const group = new THREE.Group();
        const green = this._mat(0x2A5A28, { roughness: 0.9, metalness: 0.0 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.1, this.seg(8, 5)), green);
        stem.position.y = 0.05;
        stem.rotation.z = 0.05;
        group.add(stem);
        const petalMat = this._mat(0x7A2A8A, { roughness: 0.75, metalness: 0.0 });
        // The head, as three nested rings of petals leaning in.
        for (let ring = 0; ring < (this.wantsTrim() ? 3 : 2); ring++) {
          const count = 5 - ring;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + ring * 0.5;
            const r = 0.009 - ring * 0.0026;
            const petal = this._plate([[0, 0], [0.006, 0.007], [0, 0.016], [-0.006, 0.007]], 0.0008, petalMat);
            petal.position.set(Math.cos(a) * r, 0.102 + ring * 0.004, Math.sin(a) * r);
            petal.rotation.set(0.5 - ring * 0.18, -a, 0);
            group.add(petal);
          }
        }
        const hip = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)), green);
        hip.position.y = 0.099;
        group.add(hip);
        for (const s of [-1, 1]) {
          const leaf = this._plate([[0, 0], [0.007, 0.009], [0, 0.022], [-0.007, 0.009]], 0.0008, green);
          leaf.position.set(s * 0.004, 0.05, 0);
          leaf.rotation.z = s * 0.9;
          group.add(leaf);
        }
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.0012, 0.004, this.seg(5, 3)), green);
            thorn.position.set(0.002, 0.025 + i * 0.02, 0);
            thorn.rotation.z = -1.1;
            group.add(thorn);
          }
        }
        return group;
      },

      // 115. Candle: a stub of wax on a saucer, the wick lit and the top
      // hollowed where it has burned down.
      createCandleModel(entry, rand) {
        const group = new THREE.Group();
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.005, this.seg(16, 9)),
          this._steel(0xB0B6BC, 0.35));
        saucer.position.y = 0.0025;
        group.add(saucer);
        const wax = this._mat(0xE8E0CC, { roughness: 0.75, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.05, this.seg(14, 8)), wax);
        body.position.y = 0.03;
        group.add(body);
        const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.004, this.seg(12, 7)),
          this._mat(0xF0E8D4, { roughness: 0.35, metalness: 0.0 }));
        pool.position.y = 0.053;
        group.add(pool);
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0008, 0.008, this.seg(6, 4)),
          this._mat(0x2A2018, { roughness: 1.0, metalness: 0.0 }));
        wick.position.y = 0.058;
        group.add(wick);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.014, this.seg(8, 5)),
          this._glow(0xF0B040, 1.0));
        flame.position.y = 0.068;
        flame.userData.pulse = { freq: 4.2, min: 0.65, max: 1.0 };
        group.add(flame);
        return group;
      },

      // 116. Pocket Parasol: folded shut and short, the canopy furled round
      // the shaft with its band on.
      createPocketParasolModel(entry, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0x8A2A5A, { roughness: 0.92, metalness: 0.0 });
        const furl = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 0.075, this.seg(12, 7)), cloth);
        furl.rotation.z = Math.PI / 2;
        furl.position.y = 0.012;
        group.add(furl);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.014, this.seg(8, 5)),
          this._steel(0xB0B6BC, 0.35));
        tip.rotation.z = -Math.PI / 2;
        tip.position.set(0.044, 0.012, 0);
        group.add(tip);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.024, this.seg(10, 6)),
          this._mat(0x2A2A30, { roughness: 0.6, metalness: 0.1 }));
        handle.rotation.z = Math.PI / 2;
        handle.position.set(-0.05, 0.012, 0);
        group.add(handle);
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.011, 0.0018, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0xE0C040, { roughness: 0.8, metalness: 0.1 }));
        band.rotation.y = Math.PI / 2;
        band.position.set(0.01, 0.012, 0);
        group.add(band);
        return group;
      },

      // 117. Umbrella: the full-length one, open, standing on its ferrule
      // with the ribs showing under the canopy.
      createUmbrellaModel(entry, rand) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.12, this.seg(10, 6)),
          this._steel(0x8A9098, 0.4));
        shaft.position.y = 0.06;
        group.add(shaft);
        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(0.055, 0.035, this.seg(16, 9), 1, true),
          this._mat(0x22303A, { roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide }));
        canopy.position.y = 0.106;
        group.add(canopy);
        const rib = this._steel(0x6E747C, 0.5);
        for (let i = 0; i < (this.wantsTrim() ? 8 : 4); i++) {
          const a = i * Math.PI * 2 / (this.wantsTrim() ? 8 : 4);
          const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.056, this.seg(5, 3)), rib);
          spoke.position.set(Math.cos(a) * 0.027, 0.0955, Math.sin(a) * 0.027);
          spoke.rotation.set(Math.PI / 2 - 0.3, 0, 0);
          spoke.rotation.y = -a;
          group.add(spoke);
        }
        const crook = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.0035, this.seg(6, 4), this.seg(12, 7), Math.PI),
          this._wood(0x5A3A22));
        crook.rotation.y = Math.PI / 2;
        crook.position.set(0, 0.012, 0.012);
        group.add(crook);
        const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, this.seg(8, 5)),
          this._steel(0xB0B6BC, 0.35));
        ferrule.position.y = 0.126;
        group.add(ferrule);
        return group;
      },

      // 118. Utensil Set: fork, knife and spork lying side by side, as the
      // description lists them.
      createUtensilSetModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC0C6CC, 0.28);
        const handleOf = (x) => {
          const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.007), steel);
          h.position.set(x, 0.001, -0.018);
          group.add(h);
        };
        // Fork
        handleOf(-0.014);
        for (let i = 0; i < 3; i++) {
          const tine = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0015, 0.0018), steel);
          tine.position.set(-0.014 - 0.032, 0.001, -0.021 + i * 0.003);
          group.add(tine);
        }
        // Knife
        handleOf(0);
        const blade = this._plate([[0, -0.004], [0.03, -0.0045], [0.032, 0.002], [0, 0.004]], 0.0015, steel);
        blade.rotation.x = Math.PI / 2;
        blade.position.set(-0.055, 0.001, -0.018);
        group.add(blade);
        // Spork
        handleOf(0.014);
        const bowl = new THREE.Mesh(
          new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), steel);
        bowl.rotation.x = Math.PI;
        bowl.scale.y = 0.45;
        bowl.position.set(-0.024, 0.0025, -0.015);
        group.add(bowl);
        return group;
      },

      // 119. Clay Pot: a thrown pot with a rolled lip and a stopper of cloth,
      // for liquids, as the description says.
      createClayPotModel(entry, rand) {
        const group = new THREE.Group();
        const clay = this._mat(0xA06848, { roughness: 0.92, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.032, this.seg(14, 8), this.seg(11, 6)), clay);
        body.scale.y = 0.95;
        body.position.y = 0.03;
        group.add(body);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.006, this.seg(14, 8)), clay);
        foot.position.y = 0.003;
        group.add(foot);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.014, this.seg(14, 8)), clay);
        neck.position.y = 0.06;
        group.add(neck);
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(0.015, 0.003, this.seg(6, 4), this.seg(16, 9)), clay);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = 0.067;
        group.add(lip);
        const cloth = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xC8BCA0, { roughness: 1.0, metalness: 0.0 }));
        cloth.scale.y = 0.7;
        cloth.position.y = 0.071;
        group.add(cloth);
        return group;
      },

      // 120. Insulated Water Bottle: a steel vacuum flask, the lid a screw cup
      // with a loop on it.
      createInsulatedBottleModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x7A8A94, 0.28);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.1, this.seg(16, 9)), steel);
        body.position.y = 0.05;
        group.add(body);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.014, this.seg(16, 9)), steel);
        shoulder.position.y = 0.107;
        group.add(shoulder);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, this.seg(14, 8)),
          this._mat(0x1E2A32, { roughness: 0.6, metalness: 0.1 }));
        lid.position.y = 0.122;
        group.add(lid);
        const loop = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0015, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x1E2A32, { roughness: 0.7, metalness: 0.1 }));
        loop.rotation.x = Math.PI / 2;
        loop.position.y = 0.131;
        group.add(loop);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.0245, 0.03, this.seg(16, 9), 1, true),
          this._mat(0x2A3A44, { roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }));
        grip.position.y = 0.045;
        group.add(grip);
        return group;
      },

      // 121. Lantern: a glazed box lantern with a wire bail and a lit flame
      // sitting behind the panes.
      createLanternModel(entry, rand) {
        const group = new THREE.Group();
        const iron = this._steel(0x4A4E54, 0.6);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.01, this.seg(12, 7)), iron);
        base.position.y = 0.005;
        group.add(base);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.045, this.seg(14, 8), 1, true),
          this._mat(0xE8E4C8, {
            roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide
          }));
        glass.position.y = 0.033;
        group.add(glass);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.018, this.seg(8, 5)),
          this._glow(0xF0B450, 1.0));
        flame.position.y = 0.026;
        flame.userData.pulse = { freq: 3.4, min: 0.6, max: 1.0 };
        group.add(flame);
        for (let i = 0; i < 4; i++) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.046, this.seg(5, 3)), iron);
          const a = i * Math.PI / 2 + Math.PI / 4;
          post.position.set(Math.cos(a) * 0.019, 0.033, Math.sin(a) * 0.019);
          group.add(post);
        }
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.014, this.seg(12, 7)), iron);
        cap.position.y = 0.062;
        group.add(cap);
        const bail = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0012, this.seg(5, 3), this.seg(14, 8), Math.PI), iron);
        bail.position.y = 0.069;
        group.add(bail);
        return group;
      },

      // 122. Portable Charger: a brick with a status row and a cable coiled
      // beside it.
      createPortableChargerModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A2A32, { roughness: 0.45, metalness: 0.3 });
        this._slab(group, 0.062, 0.014, 0.04, shell, 0.007);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.001, 0.002),
              i < 3 ? this._glow(0x50E080, 0.8) : this._mat(0x1A2A1E, { roughness: 0.9 }));
            led.position.set(-0.012 + i * 0.008, 0.0145, 0.012);
            group.add(led);
          }
        }
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.002),
          this._steel(0xB0B6BC, 0.4));
        port.position.set(0.014, 0.007, 0.02);
        group.add(port);
        const cable = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0018, this.seg(5, 3), this.seg(18, 10)),
          this._mat(0xE8E8EC, { roughness: 0.8, metalness: 0.0 }));
        cable.rotation.x = Math.PI / 2;
        cable.position.set(-0.05, 0.0018, 0.004);
        group.add(cable);
        return group;
      },

      // 123. Fishing Rod: a short rod with its reel, guides down the blank and
      // a hook hanging off the tip.
      createFishingRodModel(entry, rand) {
        const group = new THREE.Group();
        const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.004, 0.14, this.seg(10, 6)),
          this._mat(0x2A2A30, { roughness: 0.4, metalness: 0.2 }));
        blank.rotation.z = Math.PI / 2 + 0.16;
        blank.position.set(0.008, 0.024, 0);
        group.add(blank);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.032, this.seg(10, 6)),
          this._mat(0x8A6A42, { roughness: 0.95, metalness: 0.0 }));
        grip.rotation.z = Math.PI / 2 + 0.16;
        grip.position.set(-0.072, 0.011, 0);
        group.add(grip);
        const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, this.seg(14, 8)),
          this._steel(0xB0B6BC, 0.3));
        reel.rotation.x = Math.PI / 2;
        reel.position.set(-0.05, 0.006, 0);
        group.add(reel);
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.045, this.seg(5, 3)),
          this._mat(0xE0E8EC, { roughness: 0.6, metalness: 0.0 }));
        line.position.set(0.062, 0.028, 0);
        group.add(line);
        const hook = new THREE.Mesh(
          new THREE.TorusGeometry(0.004, 0.0008, this.seg(5, 3), this.seg(10, 6), Math.PI * 1.4),
          this._steel(0xC0C4CA, 0.3));
        hook.position.set(0.062, 0.006, 0);
        group.add(hook);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const guide = new THREE.Mesh(
              new THREE.TorusGeometry(0.0025, 0.0005, this.seg(5, 3), this.seg(8, 5)),
              this._steel(0x9AA0A8, 0.35));
            guide.position.set(-0.02 + i * 0.03, 0.02 + i * 0.005, 0);
            group.add(guide);
          }
        }
        return group;
      },

      // 124. Arcade Token: a brass token, milled edge, standing on its rim
      // against a second one lying flat.
      createArcadeTokenModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.85 });
        const flat = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.002, this.seg(20, 11)), brass);
        flat.position.set(-0.008, 0.001, 0.004);
        group.add(flat);
        const standing = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.002, this.seg(20, 11)), brass);
        standing.rotation.set(Math.PI / 2, 0, 0.12);
        standing.position.set(0.008, 0.013, -0.002);
        group.add(standing);
        const star = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0025, 5),
          this._mat(0xE0C060, { roughness: 0.3, metalness: 0.8 }));
        star.rotation.set(Math.PI / 2, 0, 0.12);
        star.position.set(0.008, 0.013, -0.002);
        group.add(star);
        return group;
      },

      // 125. Bedroll: rolled tight, strapped at both ends, with a foam mat
      // rolled inside the blanket.
      createBedrollModel(entry, rand) {
        const group = new THREE.Group();
        const wool = this._mat(0x5A6A4A, { roughness: 0.98, metalness: 0.0 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, this.seg(16, 9)), wool);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.028;
        group.add(roll);
        const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.102, this.seg(14, 8)),
          this._mat(0xC8B860, { roughness: 0.95, metalness: 0.0 }));
        mat.rotation.z = Math.PI / 2;
        mat.position.y = 0.028;
        group.add(mat);
        const strap = this._mat(0x3A2A1E, { roughness: 0.95, metalness: 0.0 });
        for (const x of [-0.03, 0.03]) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.029, 0.0025, this.seg(6, 4), this.seg(14, 8)), strap);
          band.rotation.y = Math.PI / 2;
          band.position.set(x, 0.028, 0);
          group.add(band);
          const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.006),
            this._steel(0x9AA0A8, 0.45));
          buckle.position.set(x, 0.057, 0);
          group.add(buckle);
        }
        return group;
      },

      // ======================================================================
      // Shared plumbing for the carried kit
      // ======================================================================

      /**
       * A pack: body, flap, buckle and shoulder straps. Four entries on this
       * rack are bags, and what tells them apart is the size, the pocket count
       * and the cloth, not the shape.
       */
      _pack(group, o) {
        const cloth = this._mat(o.color, { roughness: 0.95, metalness: 0.0 });
        const w = o.w || 0.06, h = o.h || 0.08, d = o.d || 0.036;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cloth);
        body.position.y = h / 2;
        group.add(body);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.3, d * 1.05), cloth);
        flap.position.set(0, h * 0.92, -d * 0.06);
        group.add(flap);
        const strap = this._mat(o.strap === undefined ? 0x3A2A1E : o.strap, { roughness: 0.95, metalness: 0.0 });
        for (const x of [-w * 0.28, w * 0.28]) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(w * 0.13, h * 1.05, 0.004), strap);
          s.position.set(x, h * 0.5, -d / 2 - 0.002);
          group.add(s);
        }
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.09, 0.003),
          this._steel(0x9AA0A8, 0.4));
        buckle.position.set(0, h * 0.76, d / 2 + 0.002);
        group.add(buckle);
        for (let i = 0; i < (o.pockets || 0); i++) {
          const pocket = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, h * 0.24, 0.008), cloth);
          pocket.position.set((i % 2 ? 1 : -1) * w * 0.28, h * (0.3 + Math.floor(i / 2) * 0.24), d / 2 + 0.003);
          group.add(pocket);
        }
        return group;
      },

      /**
       * A handheld device: a slab with a screen and a couple of buttons. The
       * electronics on this rack differ by proportion, screen colour and how
       * many controls they carry, so they share this one call.
       */
      _handheld(group, o) {
        const shell = this._mat(o.color, { roughness: 0.45, metalness: 0.25 });
        const w = o.w || 0.04, h = o.h || 0.07, d = o.d || 0.012;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell);
        body.position.y = h / 2;
        group.add(body);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, h * (o.screen || 0.42), 0.001),
          this._mat(o.lit === undefined ? 0x2A3A4A : o.lit, {
            roughness: 0.1, metalness: 0.1,
            emissive: o.lit === undefined ? 0x1A2A3A : o.lit, emissiveIntensity: 0.5
          }));
        screen.position.set(0, h * (o.screenY || 0.66), d / 2 + 0.0006);
        group.add(screen);
        if (this.wantsTrim()) {
          for (let i = 0; i < (o.buttons === undefined ? 3 : o.buttons); i++) {
            const button = new THREE.Mesh(
              new THREE.CylinderGeometry(w * 0.07, w * 0.07, 0.002, this.seg(8, 5)),
              this._mat(0x1A1A20, { roughness: 0.7, metalness: 0.05 }));
            button.rotation.x = Math.PI / 2;
            button.position.set((i - 1) * w * 0.24, h * 0.22, d / 2 + 0.001);
            group.add(button);
          }
        }
        return group;
      },

      // ======================================================================
      // Carried kit
      // ======================================================================

      // 126. Backpack: the plain one, a single compartment and a flap.
      createBackpackModel(entry, rand) {
        return this._pack(new THREE.Group(), { color: 0x3A4A5A, w: 0.062, h: 0.082, d: 0.036 });
      },

      // 129. Travel Backpack: taller, with the pockets its description
      // promises down both sides.
      createTravelBackpackModel(entry, rand) {
        return this._pack(new THREE.Group(),
          { color: 0x4A5A3A, w: 0.066, h: 0.1, d: 0.04, pockets: 4 });
      },

      // 151. Craftsman's Backpack: canvas and leather, with tool loops on the
      // front instead of pockets.
      createCraftsmansBackpackModel(entry, rand) {
        const group = new THREE.Group();
        this._pack(group, { color: 0x8A7A5A, w: 0.064, h: 0.086, d: 0.038, strap: 0x4A2E1B });
        const leather = this._mat(0x4A2E1B, { roughness: 0.92, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const loop = new THREE.Mesh(
            new THREE.TorusGeometry(0.005, 0.0015, this.seg(5, 3), this.seg(10, 6)), leather);
          loop.rotation.x = Math.PI / 2;
          loop.position.set(-0.018 + i * 0.018, 0.03, 0.021);
          group.add(loop);
        }
        return group;
      },

      // 127. Pocket Notebook: a small stapled pad, cover curled from being
      // sat on.
      createPocketNotebookModel(entry, rand) {
        const group = new THREE.Group();
        const cover = this._mat(0x2A3A4A, { roughness: 0.85, metalness: 0.02 });
        const paper = this._mat(0xE8E4D8, { roughness: 0.98, metalness: 0.0 });
        this._slab(group, 0.05, 0.002, 0.075, cover, 0.001);
        this._slab(group, 0.048, 0.008, 0.073, paper, 0.006);
        const curl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.02), cover);
        curl.position.set(0, 0.012, 0.03);
        curl.rotation.x = -0.35;
        group.add(curl);
        const wire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0012, 0.0012, 0.048, this.seg(6, 4)),
          this._steel(0x9AA0A8, 0.35));
        wire.rotation.z = Math.PI / 2;
        wire.position.set(0, 0.006, -0.036);
        group.add(wire);
        return group;
      },

      // 128. Travel Journal: the leather one its description names, closed
      // round a wrap cord with a ribbon marker out of it.
      createTravelJournalModel(entry, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0x5A3A22, { roughness: 0.88, metalness: 0.02 });
        const paper = this._mat(0xE0D8BC, { roughness: 0.98, metalness: 0.0 });
        this._slab(group, 0.08, 0.004, 0.11, leather, 0.002);
        this._slab(group, 0.076, 0.016, 0.105, paper, 0.012);
        this._slab(group, 0.08, 0.004, 0.11, leather, 0.022);
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, this.seg(10, 6), 1, false, 0, Math.PI), leather);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-0.04, 0.012, 0);
        group.add(spine);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0018, this.seg(5, 3), this.seg(14, 8)), leather);
        cord.rotation.y = Math.PI / 2;
        cord.position.set(0.03, 0.012, 0);
        cord.scale.set(1, 1.9, 1);
        group.add(cord);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0008, 0.03),
          this._mat(0xB02A3A, { roughness: 0.9, metalness: 0.0 }));
        ribbon.position.set(0.01, 0.0045, 0.066);
        group.add(ribbon);
        return group;
      },

      // 130. Wristwatch: a steel case on a folded strap, the dial reading.
      createWristwatchModel(entry, rand) {
        const group = new THREE.Group();
        const strap = this._mat(0x2A1E18, { roughness: 0.95, metalness: 0.0 });
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.0035, this.seg(6, 4), this.seg(18, 10)), strap);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.0035;
        band.scale.set(1, 0.75, 1);
        group.add(band);
        const steel = this._steel(0xC0C6CC, 0.22);
        const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.015, 0.008, this.seg(18, 10)), steel);
        caseM.position.y = 0.011;
        group.add(caseM);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.001, this.seg(16, 9)),
          this._mat(0xE8E8E0, { roughness: 0.25, metalness: 0.1 }));
        dial.position.y = 0.0156;
        group.add(dial);
        const hand = this._mat(0x1A1A20, { roughness: 0.6, metalness: 0.2 });
        const hour = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.0006, 0.0012), hand);
        hour.position.set(0.0035, 0.0163, 0);
        group.add(hour);
        const minute = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0006, 0.011), hand);
        minute.position.set(0, 0.0163, -0.0055);
        group.add(minute);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.004, this.seg(8, 5)), steel);
        crown.rotation.z = Math.PI / 2;
        crown.position.set(0.018, 0.011, 0);
        group.add(crown);
        return group;
      },

      // 132. Sewing Kit: a tin lying open, thread spools and a pincushion in
      // it, one needle standing.
      createSewingKitModel(entry, rand) {
        const group = new THREE.Group();
        const tin = this._steel(0x8A6A4A, 0.45);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.04), tin);
        base.position.y = 0.006;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.04), tin);
        lid.position.set(0, 0.032, -0.026);
        lid.rotation.x = -1.1;
        group.add(lid);
        const colours = [0xC83A3A, 0x3A6AC8, 0xE0D040];
        for (let i = 0; i < 3; i++) {
          const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, this.seg(10, 6)),
            this._mat(colours[i], { roughness: 0.9, metalness: 0.0 }));
          spool.position.set(-0.018 + i * 0.012, 0.018, -0.006);
          group.add(spool);
        }
        const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x8A2A4A, { roughness: 0.95, metalness: 0.0 }));
        cushion.scale.y = 0.7;
        cushion.position.set(0.018, 0.016, 0.008);
        group.add(cushion);
        const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.014, this.seg(5, 3)),
          this._steel(0xD0D6DC, 0.2));
        needle.position.set(0.018, 0.024, 0.008);
        needle.rotation.z = 0.3;
        group.add(needle);
        return group;
      },

      // ======================================================================
      // Electronics
      // ======================================================================

      // 133. Mp3 Player: a small player with a wheel instead of buttons.
      createMp3PlayerModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, { color: 0xE8E8EC, w: 0.038, h: 0.062, d: 0.008, buttons: 0, lit: 0x3A6A8A, screen: 0.34 });
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.011, 0.0035, this.seg(6, 4), this.seg(16, 9)),
          this._mat(0xD0D0D6, { roughness: 0.5, metalness: 0.15 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, 0.02, 0.0045);
        group.add(wheel);
        const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, this.seg(12, 7)),
          this._mat(0xB8B8BE, { roughness: 0.6, metalness: 0.1 }));
        centre.rotation.x = Math.PI / 2;
        centre.position.set(0, 0.02, 0.0045);
        group.add(centre);
        return group;
      },

      // 134. Wireless Headphones: a band with two cups, standing on the cups.
      createWirelessHeadphonesModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x1E1E24, { roughness: 0.5, metalness: 0.15 });
        const pad = this._mat(0x2A2A30, { roughness: 0.98, metalness: 0.0 });
        for (const s of [-1, 1]) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.016, this.seg(16, 9)), shell);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(s * 0.034, 0.019, 0);
          group.add(cup);
          const cushion = new THREE.Mesh(
            new THREE.TorusGeometry(0.015, 0.005, this.seg(6, 4), this.seg(14, 8)), pad);
          cushion.rotation.y = Math.PI / 2;
          cushion.position.set(s * 0.043, 0.019, 0);
          group.add(cushion);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.016, 0.006), shell);
          arm.position.set(s * 0.034, 0.036, 0);
          group.add(arm);
        }
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.034, 0.0035, this.seg(6, 4), this.seg(20, 11), Math.PI), shell);
        band.position.y = 0.042;
        group.add(band);
        return group;
      },

      // 135. Pocket Translator: a clamshell with a keypad in the base and a
      // strip of text in the lid.
      createPocketTranslatorModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A3A44, { roughness: 0.5, metalness: 0.2 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.038), shell);
        base.position.y = 0.004;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.006, 0.038), shell);
        lid.position.set(0, 0.026, -0.02);
        lid.rotation.x = -1.15;
        group.add(lid);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.001, 0.026),
          this._mat(0x6AC8A0, { roughness: 0.15, metalness: 0.05, emissive: 0x2A8A60, emissiveIntensity: 0.55 }));
        screen.position.set(0, 0.029, -0.019);
        screen.rotation.x = -1.15;
        group.add(screen);
        if (this.wantsTrim()) {
          const keyMat = this._mat(0x181820, { roughness: 0.8, metalness: 0.05 });
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 5; c++) {
              const key = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0015, 0.005), keyMat);
              key.position.set(-0.018 + c * 0.009, 0.0088, -0.008 + r * 0.008);
              group.add(key);
            }
          }
        }
        return group;
      },

      // 136. LED Flashlight: a knurled aluminium torch, lens end lit.
      createLEDFlashlightModel(entry, rand) {
        const group = new THREE.Group();
        const alu = this._steel(0x2A2A30, 0.4);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.085, this.seg(14, 8)), alu);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.012;
        group.add(body);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.02, this.seg(14, 8)), alu);
        head.rotation.z = -Math.PI / 2;
        head.position.set(0.052, 0.012, 0);
        group.add(head);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.002, this.seg(14, 8)),
          this._glow(0xF0F4E0, 0.8));
        lens.rotation.z = Math.PI / 2;
        lens.position.set(0.062, 0.012, 0);
        group.add(lens);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, this.seg(12, 7)),
          this._mat(0x1A1A20, { roughness: 0.7, metalness: 0.1 }));
        tail.rotation.z = Math.PI / 2;
        tail.position.set(-0.046, 0.012, 0);
        group.add(tail);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const knurl = new THREE.Mesh(
              new THREE.TorusGeometry(0.0118, 0.0008, this.seg(5, 3), this.seg(12, 7)), alu);
            knurl.rotation.y = Math.PI / 2;
            knurl.position.set(-0.02 + i * 0.008, 0.012, 0);
            group.add(knurl);
          }
        }
        return group;
      },

      // 137. Portable GPS Navigator: a rugged handheld with a stub antenna and
      // a map on the screen.
      createGPSNavigatorModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, { color: 0x2A4A2A, w: 0.046, h: 0.086, d: 0.016, lit: 0x8AC8A0, buttons: 3 });
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.02, this.seg(10, 6)),
          this._mat(0x1A1A20, { roughness: 0.7, metalness: 0.1 }));
        antenna.position.set(0.016, 0.094, -0.002);
        antenna.rotation.z = -0.2;
        group.add(antenna);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.018),
          this._mat(0x1A2A1A, { roughness: 0.95, metalness: 0.0 }));
        grip.position.y = 0.02;
        group.add(grip);
        return group;
      },

      // 138. Shovel: a stepped blade on a shaft with a D grip.
      createShovelModel(entry, rand) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.11, this.seg(10, 6)),
          this._wood(0x8A6A42));
        shaft.rotation.z = Math.PI / 2;
        shaft.position.y = 0.008;
        group.add(shaft);
        const steel = this._steel(0x8A9098, 0.45);
        const blade = this._plate([
          [-0.026, 0], [0.026, 0], [0.022, 0.05], [0, 0.058], [-0.022, 0.05]
        ], 0.003, steel);
        blade.rotation.x = -Math.PI / 2;
        blade.position.set(0.086, 0.006, 0);
        blade.rotation.z = Math.PI / 2;
        group.add(blade);
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.022, this.seg(10, 6)), steel);
        socket.rotation.z = -Math.PI / 2;
        socket.position.set(0.062, 0.008, 0);
        group.add(socket);
        const grip = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.0035, this.seg(6, 4), this.seg(14, 8), Math.PI),
          this._mat(0x2A2A30, { roughness: 0.7, metalness: 0.05 }));
        grip.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
        grip.position.set(-0.056, 0.008, 0);
        group.add(grip);
        return group;
      },

      // 139. Resonance Scanner: a wand with a coil head and a meter on the
      // grip, the coil lit while it listens.
      createResonanceScannerModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x3A3A44, { roughness: 0.45, metalness: 0.3 });
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.02), shell);
        grip.position.y = 0.025;
        group.add(grip);
        const meter = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(14, 8)),
          this._mat(0xC8E0A0, { roughness: 0.2, metalness: 0.1, emissive: 0x4A8A2A, emissiveIntensity: 0.5 }));
        meter.rotation.x = Math.PI / 2;
        meter.position.set(0, 0.036, 0.011);
        group.add(meter);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, this.seg(10, 6)), shell);
        neck.position.y = 0.064;
        group.add(neck);
        const coil = new THREE.Mesh(
          new THREE.TorusGeometry(0.018, 0.003, this.seg(6, 4), this.seg(18, 10)),
          this._glow(0x50C8E0, 0.6));
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.082;
        coil.userData.pulse = { freq: 1.6, min: 0.35, max: 0.9 };
        group.add(coil);
        return group;
      },

      // 140. Raman probe: a fibre-optic pen on a coiled lead, the emitter a
      // hard green point.
      createRamanProbeModel(entry, rand) {
        const group = new THREE.Group();
        const barrel = this._steel(0xB0B6BC, 0.25);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, this.seg(12, 7)), barrel);
        body.rotation.z = Math.PI / 2 - 0.35;
        body.position.set(0.006, 0.026, 0);
        group.add(body);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, this.seg(10, 6)), barrel);
        nose.rotation.z = -Math.PI / 2 - 0.35 + Math.PI;
        nose.position.set(0.036, 0.014, 0);
        group.add(nose);
        const emitter = new THREE.Mesh(new THREE.SphereGeometry(0.0022, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0x60F080, 1.0));
        emitter.position.set(0.042, 0.008, 0);
        group.add(emitter);
        const lead = this._mat(0x1A1A20, { roughness: 0.85, metalness: 0.05 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const coil = new THREE.Mesh(
            new THREE.TorusGeometry(0.013, 0.0018, this.seg(5, 3), this.seg(14, 8)), lead);
          coil.rotation.x = Math.PI / 2;
          coil.position.set(-0.03, 0.0018 + i * 0.0035, 0.004);
          group.add(coil);
        }
        return group;
      },

      // 141. Diving suit: a hood and yoke of neoprene over a weight belt, hung
      // rather than worn.
      createDivingSuitModel(entry, rand) {
        const group = new THREE.Group();
        const rubber = this._mat(0x14141A, { roughness: 0.85, metalness: 0.02 });
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.06, this.seg(14, 8)), rubber);
        torso.position.y = 0.035;
        group.add(torso);
        const hood = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, this.seg(12, 7), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2), rubber);
        hood.position.y = 0.066;
        group.add(hood);
        const window_ = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, this.seg(14, 8)),
          this._mat(0x8AC8E0, { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55 }));
        window_.rotation.x = Math.PI / 2;
        window_.position.set(0, 0.075, 0.02);
        group.add(window_);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.04, this.seg(10, 6)), rubber);
          arm.rotation.z = s * 1.1;
          arm.position.set(s * 0.035, 0.05, 0);
          group.add(arm);
        }
        const belt = new THREE.Mesh(
          new THREE.TorusGeometry(0.027, 0.004, this.seg(6, 4), this.seg(16, 9)),
          this._mat(0x8A6A2A, { roughness: 0.85, metalness: 0.1 }));
        belt.rotation.x = Math.PI / 2;
        belt.position.y = 0.012;
        group.add(belt);
        return group;
      },

      // 142. UV Sunglasses: folded, arms crossed, lying on their lenses.
      createUVSunglassesModel(entry, rand) {
        const group = new THREE.Group();
        const frame = this._mat(0x1A1A20, { roughness: 0.4, metalness: 0.2 });
        const lensMat = this._mat(0x2A4A5A, {
          roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75
        });
        for (const s of [-1, 1]) {
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.002, this.seg(16, 9)), lensMat);
          lens.rotation.x = Math.PI / 2;
          lens.scale.z = 0.72;
          lens.position.set(s * 0.017, 0.005, 0);
          group.add(lens);
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.015, 0.0018, this.seg(5, 3), this.seg(16, 9)), frame);
          rim.rotation.x = Math.PI / 2;
          rim.scale.z = 0.72;
          rim.position.set(s * 0.017, 0.005, 0);
          group.add(rim);
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.003), frame);
          arm.position.set(s * 0.02, 0.008, -0.008 * s);
          arm.rotation.y = s * 0.25;
          group.add(arm);
        }
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.002, 0.003), frame);
        bridge.position.y = 0.006;
        group.add(bridge);
        return group;
      },

      // 143. Pocket Video Recorder: a tape camcorder small enough to palm,
      // lens out and a flip-out screen open.
      createPocketVideoRecorderModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A2A32, { roughness: 0.45, metalness: 0.25 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), shell);
        body.position.y = 0.018;
        group.add(body);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.014, this.seg(14, 8)), shell);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0.008, 0.021, 0.021);
        group.add(barrel);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(14, 8)),
          this._mat(0x1A2A3A, { roughness: 0.05, metalness: 0.4 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0.008, 0.021, 0.029);
        group.add(lens);
        const flip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.002), shell);
        flip.position.set(-0.038, 0.022, 0);
        flip.rotation.y = 0.5;
        group.add(flip);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.001),
          this._mat(0x5A8AB0, { roughness: 0.1, metalness: 0.1, emissive: 0x2A5A80, emissiveIntensity: 0.5 }));
        screen.position.set(-0.037, 0.022, 0.002);
        screen.rotation.y = 0.5;
        group.add(screen);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0018, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0xE03A2A, 0.9));
        led.position.set(0.02, 0.031, 0.016);
        led.userData.pulse = { freq: 1.2, min: 0.2, max: 1.0 };
        group.add(led);
        return group;
      },

      // 144. Digital Camera: a compact with a collapsed zoom and a flash,
      // strap loop on the corner.
      createDigitalCameraModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._steel(0xB8BCC2, 0.3);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.018), shell);
        body.position.y = 0.02;
        group.add(body);
        const zoom = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.01, this.seg(16, 9)),
          this._mat(0x2A2A30, { roughness: 0.4, metalness: 0.3 }));
        zoom.rotation.x = Math.PI / 2;
        zoom.position.set(-0.012, 0.021, 0.013);
        group.add(zoom);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(14, 8)),
          this._mat(0x1A2A3A, { roughness: 0.05, metalness: 0.45 }));
        glass.rotation.x = Math.PI / 2;
        glass.position.set(-0.012, 0.021, 0.019);
        group.add(glass);
        const flash = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.001),
          this._mat(0xF0F0E0, { roughness: 0.2, metalness: 0.1 }));
        flash.position.set(0.016, 0.033, 0.0095);
        group.add(flash);
        const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, this.seg(10, 6)),
          this._mat(0x8A9098, { roughness: 0.5, metalness: 0.5 }));
        shutter.position.set(0.02, 0.041, 0);
        group.add(shutter);
        const loop = new THREE.Mesh(
          new THREE.TorusGeometry(0.004, 0.001, this.seg(5, 3), this.seg(10, 6)), shell);
        loop.position.set(0.032, 0.036, 0);
        group.add(loop);
        return group;
      },

      // 145. Bestiary: a thick clasped book with a beast's horn worked into
      // the cover boss.
      createBestiaryModel(entry, rand) {
        const group = new THREE.Group();
        const hide = this._mat(0x3A2A22, { roughness: 0.9, metalness: 0.02 });
        const paper = this._mat(0xD8CCAC, { roughness: 0.98, metalness: 0.0 });
        this._slab(group, 0.085, 0.005, 0.115, hide, 0.0025);
        this._slab(group, 0.08, 0.03, 0.11, paper, 0.02);
        this._slab(group, 0.085, 0.005, 0.115, hide, 0.0375);
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.115, this.seg(10, 6), 1, false, 0, Math.PI), hide);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-0.0425, 0.02, 0);
        group.add(spine);
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 });
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.036, 0.014), brass);
        clasp.position.set(0.042, 0.02, 0);
        group.add(clasp);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.018, this.seg(8, 5)),
          this._mat(0xE0D8C0, { roughness: 0.6, metalness: 0.05 }));
        horn.position.set(0, 0.046, 0);
        horn.rotation.z = 0.3;
        group.add(horn);
        return group;
      },

      // 146. Fuel tank: a jerrycan, the pressed X in its face and the spout
      // capped.
      createFuelTankModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x4A5A3A, 0.55);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.028), steel);
        body.position.y = 0.043;
        group.add(body);
        const ridge = this._steel(0x3A4A2E, 0.6);
        for (const s of [-1, 1]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.002), ridge);
          bar.position.set(0, 0.043, 0.015);
          bar.rotation.z = s * 0.98;
          group.add(bar);
        }
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, this.seg(12, 7)), steel);
        spout.position.set(-0.016, 0.09, 0);
        group.add(spout);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, this.seg(12, 7)),
          this._mat(0x1A1A20, { roughness: 0.7, metalness: 0.15 }));
        cap.position.set(-0.016, 0.098, 0);
        group.add(cap);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.004, 0.006), steel);
        handle.position.set(0.008, 0.092, 0);
        group.add(handle);
        return group;
      },

      // 147. Digital bestiary: the same book as a slate, a beast's outline
      // glowing on the screen instead of inked on vellum.
      createDigitalBestiaryModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, {
          color: 0x1E2A32, w: 0.07, h: 0.095, d: 0.01, lit: 0x50C8A0, screen: 0.6, screenY: 0.55, buttons: 1
        });
        const glyph = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, this.seg(6, 4)),
          this._glow(0xA0F0D0, 0.7));
        glyph.position.set(0, 0.052, 0.0062);
        glyph.rotation.x = Math.PI / 2;
        group.add(glyph);
        return group;
      },

      // 148. Invisible Ink Pen: a slim pen with a UV lamp in the cap end, the
      // lamp lit violet.
      createInvisibleInkPenModel(entry, rand) {
        const group = new THREE.Group();
        const barrel = this._mat(0x2A2A34, { roughness: 0.4, metalness: 0.25 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.085, this.seg(12, 7)), barrel);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.0045;
        group.add(body);
        const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.012, this.seg(10, 6)), barrel);
        nib.rotation.z = -Math.PI / 2;
        nib.position.set(0.048, 0.0045, 0);
        group.add(nib);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0045, 0.008, this.seg(10, 6)),
          this._glow(0x8A50E0, 0.85));
        lamp.rotation.z = Math.PI / 2;
        lamp.position.set(-0.046, 0.0045, 0);
        group.add(lamp);
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.001, 0.003),
          this._steel(0x9AA0A8, 0.35));
        clip.position.set(-0.03, 0.0095, 0);
        group.add(clip);
        return group;
      },

      // 149. Cellphone: the 2001 candybar, stub aerial and a keypad under a
      // small green screen.
      createCellphoneModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, {
          color: 0x22262E, w: 0.042, h: 0.1, d: 0.017, lit: 0x8AC860, screen: 0.24, screenY: 0.76, buttons: 0
        });
        const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.0025, 0.018, this.seg(8, 5)),
          this._mat(0x1A1A20, { roughness: 0.7, metalness: 0.1 }));
        aerial.position.set(0.014, 0.107, -0.002);
        group.add(aerial);
        if (this.wantsTrim()) {
          const keyMat = this._mat(0x3A3E46, { roughness: 0.75, metalness: 0.1 });
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 3; c++) {
              const key = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.0015), keyMat);
              key.position.set(-0.009 + c * 0.009, 0.05 - r * 0.008, 0.0092);
              group.add(key);
            }
          }
        }
        return group;
      },

      // 150. Telescope: a brass draw-tube refractor on a folding tripod.
      createTelescopeModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB08A3A, { roughness: 0.35, metalness: 0.85 });
        const leg = this._wood(0x5A3A22);
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3;
          const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.055, this.seg(6, 4)), leg);
          strut.position.set(Math.cos(a) * 0.011, 0.026, Math.sin(a) * 0.011);
          strut.rotation.set(0.4, 0, 0);
          strut.rotation.y = -a;
          strut.rotation.z = 0.4;
          group.add(strut);
        }
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.008, this.seg(10, 6)), brass);
        head.position.y = 0.052;
        group.add(head);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.075, this.seg(14, 8)), brass);
        tube.rotation.z = Math.PI / 2 - 0.5;
        tube.position.set(0, 0.07, 0);
        group.add(tube);
        const draw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.028, this.seg(12, 7)), brass);
        draw.rotation.z = Math.PI / 2 - 0.5;
        draw.position.set(-0.042, 0.047, 0);
        group.add(draw);
        const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.01, this.seg(10, 6)),
          this._mat(0x1A1A20, { roughness: 0.6, metalness: 0.2 }));
        eyepiece.rotation.z = Math.PI / 2 - 0.5;
        eyepiece.position.set(-0.058, 0.038, 0);
        group.add(eyepiece);
        return group;
      },

      // ======================================================================
      // Paper maps
      // ======================================================================

      /**
       * A folded map, one corner turned back so the printed face shows. Four
       * entries are maps and the differences between them are the material,
       * the ink and how worn the sheet is, not the shape.
       */
      _foldedMap(group, o) {
        const sheet = this._mat(o.paper, { roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide });
        const w = o.w || 0.085, d = o.d || 0.06;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0025, d), sheet);
        body.position.y = 0.0013;
        group.add(body);
        // The creases: a folded map never lies flat, so the panels stand a
        // little proud of one another.
        for (let i = 0; i < 2; i++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(w / 3, 0.002, d), sheet);
          panel.position.set(-w / 3 + i * (w / 1.5), 0.0035 + i * 0.0006, 0);
          panel.rotation.x = (i ? 1 : -1) * 0.03;
          group.add(panel);
        }
        const corner = new THREE.Mesh(new THREE.BoxGeometry(w * 0.28, 0.0015, d * 0.4), sheet);
        corner.position.set(w * 0.3, 0.008, -d * 0.26);
        corner.rotation.set(0.5, 0.3, 0.2);
        group.add(corner);
        if (this.wantsTrim()) {
          const ink = this._mat(o.ink, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.0004, 0.0012), ink);
            line.position.set(-w * 0.1, 0.0055 + i * 0.0002, -0.014 + i * 0.014);
            line.rotation.y = (i - 1) * 0.25;
            group.add(line);
          }
          const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.0006, this.seg(10, 6)),
            this._mat(o.mark === undefined ? 0xB02A2A : o.mark, { roughness: 0.95, metalness: 0.0 }));
          mark.position.set(-w * 0.24, 0.0058, 0.012);
          group.add(mark);
        }
        return group;
      },

      // 155. Frost Nomad's Map: sealskin rather than paper, the coast scored
      // into it and the route picked out in ochre.
      createFrostNomadsMapModel(entry, rand) {
        return this._foldedMap(new THREE.Group(),
          { paper: 0xC8BCA8, ink: 0x4A3A28, mark: 0xC87A2A, w: 0.08, d: 0.058 });
      },

      // 159. Routes Map: the tower's own diagram, printed cold on white with
      // the lines in transit colours.
      createRoutesMapModel(entry, rand) {
        return this._foldedMap(new THREE.Group(),
          { paper: 0xE8E8EC, ink: 0x2A5AB0, mark: 0xC83A3A, w: 0.09, d: 0.062 });
      },

      // 161. Local Map: faded, as its description says, the ink gone brown
      // and the paper yellow.
      createLocalMapModel(entry, rand) {
        return this._foldedMap(new THREE.Group(),
          { paper: 0xD8CFAE, ink: 0x6A5A42, mark: 0x8A6A3A, w: 0.078, d: 0.055 });
      },

      // 163. Star map: a dark chart rolled round its own rim rather than
      // folded, with the constellations picked out on it.
      createStarMapModel(entry, rand) {
        const group = new THREE.Group();
        const chart = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.002, this.seg(20, 11)),
          this._mat(0x141828, { roughness: 0.8, metalness: 0.05 }));
        chart.position.y = 0.001;
        group.add(chart);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.038, 0.002, this.seg(6, 4), this.seg(20, 11)),
          this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.001;
        group.add(rim);
        const star = this._glow(0xE8F0FF, 0.8);
        for (let i = 0; i < (this.wantsTrim() ? 12 : 6); i++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 5, 4), star);
          const a = rand() * Math.PI * 2;
          const r = rand() * 0.032;
          dot.position.set(Math.cos(a) * r, 0.0026, Math.sin(a) * r);
          group.add(dot);
        }
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.0008, this.seg(16, 9)),
          this._mat(0xDCE4EC, { roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.3 }));
        dial.position.y = 0.0035;
        group.add(dial);
        return group;
      },

      // ======================================================================
      // The rest of the rack
      // ======================================================================

      // 152. Compact Umbrella: the short folding one, collapsed to two
      // sections in its sleeve.
      createCompactUmbrellaModel(entry, rand) {
        const group = new THREE.Group();
        const sleeve = this._mat(0x2A3A4A, { roughness: 0.95, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.058, this.seg(14, 8)), sleeve);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.014;
        group.add(body);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(12, 7), this.seg(8, 5),
          0, Math.PI * 2, 0, Math.PI / 2), sleeve);
        cap.rotation.z = -Math.PI / 2;
        cap.position.set(0.029, 0.014, 0);
        group.add(cap);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, this.seg(10, 6)),
          this._mat(0x1A1A20, { roughness: 0.6, metalness: 0.1 }));
        handle.rotation.z = Math.PI / 2;
        handle.position.set(-0.038, 0.014, 0);
        group.add(handle);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0012, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x1A1A20, { roughness: 0.9, metalness: 0.0 }));
        cord.position.set(-0.05, 0.014, 0);
        group.add(cord);
        return group;
      },

      // 153. Color Flip Mobile Phone: open on its hinge, the top half showing
      // a colour screen, the bottom a keypad.
      createColorFlipPhoneModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x8A2A5A, { roughness: 0.35, metalness: 0.35 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.05), shell);
        base.position.y = 0.004;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.05), shell);
        lid.position.set(0, 0.03, -0.026);
        lid.rotation.x = -1.25;
        group.add(lid);
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.001, 0.034),
          this._mat(0x5AA0D0, { roughness: 0.1, metalness: 0.05, emissive: 0x2A6AA0, emissiveIntensity: 0.6 }));
        screen.position.set(0, 0.0335, -0.0245);
        screen.rotation.x = -1.25;
        group.add(screen);
        if (this.wantsTrim()) {
          const keyMat = this._mat(0xD8D0D4, { roughness: 0.7, metalness: 0.1 });
          for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 3; c++) {
              const key = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0015, 0.006), keyMat);
              key.position.set(-0.009 + c * 0.009, 0.0088, -0.012 + r * 0.009);
              group.add(key);
            }
          }
        }
        return group;
      },

      // 154. Wireless Earbuds: two buds sitting in their open charging case.
      createWirelessEarbudsModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xF0F0F2, { roughness: 0.35, metalness: 0.1 });
        const caseBody = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.03), shell);
        caseBody.position.y = 0.007;
        group.add(caseBody);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.005, 0.03), shell);
        lid.position.set(0, 0.026, -0.015);
        lid.rotation.x = -1.1;
        group.add(lid);
        for (const s of [-1, 1]) {
          const bud = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)), shell);
          bud.position.set(s * 0.011, 0.016, 0);
          group.add(bud);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.012, this.seg(8, 5)), shell);
          stem.position.set(s * 0.011, 0.02, 0.002);
          stem.rotation.x = 0.3;
          group.add(stem);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(8, 5), this.seg(6, 4)),
            this._mat(0xD0D0D6, { roughness: 0.9, metalness: 0.0 }));
          tip.position.set(s * 0.011, 0.013, -0.003);
          group.add(tip);
        }
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0012, this.seg(6, 4), this.seg(5, 3)),
          this._glow(0x50E080, 0.9));
        led.position.set(0, 0.009, 0.0152);
        group.add(led);
        return group;
      },

      // 156. Toolmaker's Multi-tool: the pliers head closed, three blades
      // fanned out of one handle.
      createMultiToolModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x9AA0A8, 0.32);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.055), steel);
        handle.position.y = 0.005;
        group.add(handle);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.008, 0.026),
          this._steel(0x8A9098, 0.4));
        jaw.position.set(0, 0.005, 0.038);
        group.add(jaw);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.014, this.seg(8, 5)), steel);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0.005, 0.056);
        group.add(nose);
        const bladeMat = this._steel(0xC0C6CC, 0.22);
        const angles = [0.5, 0.9, 1.35];
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const blade = this._plate([[0, 0], [0.004, 0.004], [0.003, 0.03], [-0.003, 0.03], [-0.004, 0.004]],
            0.0012, bladeMat);
          blade.rotation.set(-Math.PI / 2 + angles[i], 0, 0);
          blade.position.set(-0.004 + i * 0.004, 0.007, -0.026);
          group.add(blade);
        }
        return group;
      },

      // 157. Encrypted Burner Phone: a plain black slab with the camera taped
      // over and a key fob dongle on its lanyard.
      createEncryptedBurnerPhoneModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, {
          color: 0x101014, w: 0.044, h: 0.09, d: 0.01, lit: 0x2A6A50, screen: 0.62, screenY: 0.54, buttons: 1
        });
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.001),
          this._mat(0x1E1E1E, { roughness: 1.0, metalness: 0.0 }));
        tape.position.set(0.012, 0.082, 0.0055);
        group.add(tape);
        const dongle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.005),
          this._mat(0x2A3A4A, { roughness: 0.5, metalness: 0.3 }));
        dongle.position.set(0.036, 0.007, 0.004);
        group.add(dongle);
        const lanyard = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.001, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x2A2A30, { roughness: 0.95, metalness: 0.0 }));
        lanyard.rotation.x = Math.PI / 2;
        lanyard.position.set(0.03, 0.001, 0.004);
        group.add(lanyard);
        return group;
      },

      // 158. Investigator's Camera: an SLR body with a long lens on it, the
      // one on this rack built to reach.
      createInvestigatorsCameraModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x1A1A1E, { roughness: 0.5, metalness: 0.2 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.026), shell);
        body.position.y = 0.02;
        group.add(body);
        const prism = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), shell);
        prism.position.set(-0.004, 0.045, 0);
        group.add(prism);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.05, this.seg(16, 9)),
          this._mat(0x22222A, { roughness: 0.45, metalness: 0.25 }));
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(-0.004, 0.02, 0.038);
        group.add(barrel);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.015, 0.0025, this.seg(6, 4), this.seg(16, 9)),
          this._mat(0x3A3A44, { roughness: 0.85, metalness: 0.1 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(-0.004, 0.02, 0.042);
        group.add(ring);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.002, this.seg(16, 9)),
          this._mat(0x1A2A3A, { roughness: 0.05, metalness: 0.5 }));
        glass.rotation.x = Math.PI / 2;
        glass.position.set(-0.004, 0.02, 0.064);
        group.add(glass);
        const shutter = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, this.seg(10, 6)),
          this._steel(0x9AA0A8, 0.4));
        shutter.position.set(0.018, 0.041, 0.006);
        group.add(shutter);
        return group;
      },

      // 160. Hexphone Communicator: the six-sided handset the phone system is
      // named for, its screen a lit hexagon.
      createHexphoneModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x2A2A3A, { roughness: 0.4, metalness: 0.35 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 6), shell);
        body.rotation.x = Math.PI / 2;
        body.position.y = 0.028;
        group.add(body);
        const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.001, 6),
          this._mat(0x50C8B0, { roughness: 0.1, metalness: 0.05, emissive: 0x2A8A78, emissiveIntensity: 0.65 }));
        screen.rotation.x = Math.PI / 2;
        screen.position.set(0, 0.028, 0.0065);
        group.add(screen);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.013, 6),
          this._steel(0xB0B6BC, 0.3));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.028;
        rim.scale.set(1.02, 1.02, 0.9);
        group.add(rim);
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.014), shell);
        stand.position.y = 0.003;
        group.add(stand);
        return group;
      },

      // 162. EHI Pilot PDA: a stylus slate in a rubber bumper, the corporate
      // badge printed on the back of the shell.
      createEHIPilotPDAModel(entry, rand) {
        const group = new THREE.Group();
        this._handheld(group, {
          color: 0x3A4A54, w: 0.055, h: 0.082, d: 0.012, lit: 0x8AB0E0, screen: 0.58, screenY: 0.56, buttons: 2
        });
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.087, 0.011),
          this._mat(0x1E2A30, { roughness: 0.95, metalness: 0.0 }));
        bumper.position.y = 0.0435;
        group.add(bumper);
        const stylus = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.06, this.seg(8, 5)),
          this._mat(0xB0B6BC, { roughness: 0.4, metalness: 0.6 }));
        stylus.position.set(0.034, 0.0022, 0.004);
        stylus.rotation.z = Math.PI / 2;
        stylus.rotation.y = 0.3;
        group.add(stylus);
        return group;
      },

      // 165. Blade seed: a seed pod with a blade already forming inside it,
      // the edge showing through the split husk.
      createBladeSeedModel(entry, rand) {
        const group = new THREE.Group();
        const husk = this._mat(0x5A4A2A, { roughness: 0.95, metalness: 0.02 });
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(12, 7), this.seg(10, 6)), husk);
        pod.scale.set(0.75, 1.4, 0.75);
        pod.position.y = 0.027;
        group.add(pod);
        const split = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.001),
          this._mat(0x2A2118, { roughness: 1.0, metalness: 0.0 }));
        split.position.set(0, 0.03, 0.014);
        group.add(split);
        const blade = this._plate([[0, 0], [0.004, 0.006], [0.002, 0.03], [-0.002, 0.03], [-0.004, 0.006]],
          0.0012, this._glow(0xBCD8E8, 0.35));
        blade.position.set(0, 0.044, 0.002);
        group.add(blade);
        const root = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.012, this.seg(8, 5)), husk);
        root.rotation.x = Math.PI;
        root.position.y = 0.006;
        group.add(root);
        return group;
      },

      // 175. Saxophone: an alto lying on its bell, the bow and the keywork
      // reading even at item scale.
      createSaxophoneModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.3, metalness: 0.88 });
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.014, 0.032, this.seg(16, 9), 1, true), brass);
        bell.material.side = THREE.DoubleSide;
        bell.position.set(0, 0.016, 0);
        bell.rotation.z = 0.25;
        group.add(bell);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.06, this.seg(14, 8)), brass);
        body.position.set(-0.012, 0.052, 0);
        body.rotation.z = 0.18;
        group.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.026, this.seg(12, 7)), brass);
        neck.position.set(-0.026, 0.09, 0);
        neck.rotation.z = 0.8;
        group.add(neck);
        const mouthpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.014, this.seg(10, 6)),
          this._mat(0x1A1A1E, { roughness: 0.5, metalness: 0.1 }));
        mouthpiece.position.set(-0.04, 0.101, 0);
        mouthpiece.rotation.z = 1.1;
        group.add(mouthpiece);
        if (this.wantsTrim()) {
          const key = this._mat(0xE0D0A0, { roughness: 0.35, metalness: 0.7 });
          for (let i = 0; i < 5; i++) {
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.0015, this.seg(10, 6)), key);
            pad.rotation.x = Math.PI / 2;
            pad.position.set(-0.005 + i * 0.002, 0.032 + i * 0.011, 0.013);
            group.add(pad);
          }
        }
        return group;
      },

      // 244. Surgical Tools: a rolled instrument wrap opened out, scalpel,
      // forceps and clamp seated in their own loops.
      createSurgicalToolsModel(entry, rand) {
        const group = new THREE.Group();
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.002, 0.05),
          this._mat(0x2A4A46, { roughness: 0.97, metalness: 0.0 }));
        wrap.position.y = 0.001;
        group.add(wrap);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, this.seg(14, 8)),
          this._mat(0x2A4A46, { roughness: 0.97, metalness: 0.0 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(-0.056, 0.012, 0);
        group.add(roll);
        const steel = this._steel(0xC8CED4, 0.18);
        // Scalpel
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.0025, 0.005), steel);
        handle.position.set(-0.006, 0.0035, -0.016);
        group.add(handle);
        const blade = this._plate([[0, 0], [0.014, 0.002], [0.016, 0.005], [0, 0.005]], 0.0012, steel);
        blade.rotation.x = -Math.PI / 2;
        blade.position.set(0.015, 0.0035, -0.018);
        group.add(blade);
        // Forceps and clamp: two hinged pairs, the jaws closed.
        for (let i = 0; i < 2; i++) {
          const z = 0.002 + i * 0.016;
          for (const s of [-1, 1]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0018, 0.0025), steel);
            arm.position.set(-0.004, 0.0035, z + s * 0.0022);
            arm.rotation.y = s * 0.05;
            group.add(arm);
          }
          const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, this.seg(8, 5)), steel);
          hinge.rotation.x = Math.PI / 2;
          hinge.position.set(0.004, 0.0035, z);
          group.add(hinge);
          for (const s of [-1, 1]) {
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(10, 6)), steel);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(-0.032, 0.0035, z + s * 0.006);
            group.add(ring);
          }
        }
        return group;
      },

      // 390. Alchemistry Kit: a fold-out field set, burner, stand and three
      // stoppered reagents, packed to be carried and used on a table.
      createAlchemistryKitModel(entry, rand) {
        const group = new THREE.Group();
        const caseM = this._mat(0x3A2A22, { roughness: 0.85, metalness: 0.05 });
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.014, 0.05), caseM);
        base.position.y = 0.007;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.004, 0.05), caseM);
        lid.position.set(0, 0.038, -0.032);
        lid.rotation.x = -1.15;
        group.add(lid);
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 });
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.012, this.seg(12, 7)), brass);
        burner.position.set(-0.026, 0.02, 0);
        group.add(burner);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, this.seg(8, 5)),
          this._glow(0x6AA0E0, 0.8));
        flame.position.set(-0.026, 0.032, 0);
        flame.userData.pulse = { freq: 3.0, min: 0.55, max: 1.0 };
        group.add(flame);
        const stand = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0012, this.seg(5, 3), this.seg(12, 7)), brass);
        stand.rotation.x = Math.PI / 2;
        stand.position.set(-0.026, 0.04, 0);
        group.add(stand);
        const flask = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0xDCE8EE, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4 }));
        flask.position.set(-0.026, 0.048, 0);
        group.add(flask);
        const fills = [0x3A8A6A, 0xC8A02A, 0x8A3A6A];
        for (let i = 0; i < 3; i++) {
          const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.026, this.seg(10, 6)),
            this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45 }));
          vial.position.set(0.012 + i * 0.014, 0.027, 0);
          group.add(vial);
          const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.014, this.seg(10, 6)),
            this._mat(fills[i], { roughness: 0.3, metalness: 0.0 }));
          fill.position.set(0.012 + i * 0.014, 0.021, 0);
          group.add(fill);
          const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.005, this.seg(10, 6)),
            this._mat(0x4A3A28, { roughness: 0.9, metalness: 0.0 }));
          stopper.position.set(0.012 + i * 0.014, 0.042, 0);
          group.add(stopper);
        }
        return group;
      },

      // 406. Fertilizer bag: an industrial sack, printed with an N-P-K panel,
      // slumped the way a half-full one sits, with a spill at the mouth.
      createFertilizerBagModel(entry, rand) {
        const group = new THREE.Group();
        const woven = this._mat(0xC8C0A8, { roughness: 0.99, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.075, this.seg(14, 8)), woven);
        body.position.y = 0.038;
        body.scale.z = 0.7;
        group.add(body);
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.028, 0.02, this.seg(14, 8)), woven);
        throat.position.y = 0.084;
        throat.scale.z = 0.7;
        group.add(throat);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.001),
          this._mat(0x2A6A3A, { roughness: 0.9, metalness: 0.0 }));
        panel.position.set(0, 0.042, 0.0215);
        group.add(panel);
        if (this.wantsTrim()) {
          const ink = this._mat(0xF0ECE0, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.001), ink);
            bar.position.set(-0.011 + i * 0.011, 0.038, 0.0222);
            group.add(bar);
          }
        }
        const prill = this._mat(0xE0DCC8, { roughness: 1.0, metalness: 0.0 });
        const spill = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.0015, this.seg(12, 7)), prill);
        spill.position.set(0.04, 0.0008, 0.008);
        group.add(spill);
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const grain = new THREE.Mesh(new THREE.SphereGeometry(0.0022, this.seg(6, 4), this.seg(5, 3)), prill);
          grain.position.set(0.032 + i * 0.006, 0.0022, 0.002 + (i % 2) * 0.01);
          group.add(grain);
        }
        return group;
      }
    }
  });
})();
