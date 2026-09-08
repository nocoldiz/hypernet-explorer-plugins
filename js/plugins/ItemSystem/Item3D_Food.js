//=============================================================================
// Item 3D Models - Food
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the food shelf of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Food
 * ============================================================================
 *
 * One model per entry, keyed by database id. The food shelf runs from bottled
 * water to things that should not be eaten, and it is the biggest in the
 * database, so it is built around a few honest shared forms: a bowl of
 * something, a wrapped bar, a canned good, a bottle, a piece of fruit. What
 * separates one entry from the next is the vessel it comes in, the colour of
 * what is in it, and how far gone it is.
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
    console.error('[Item3D_Food] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Food',

    unique: {
      i418: 'createBottledWaterModel',
      i419: 'createCharredToastModel',
      i420: 'createFoodAbominationModel',
      i421: 'createGranolaBarModel',
      i422: 'createBurntBeansModel',
      i423: 'createBruisedAppleModel',
      i424: 'createPetrifiedBreadModel',
      i425: 'createDayOldFishModel',
      i426: 'createWaterySoupModel',
      i427: 'createSuspiciousSoupModel',
      i428: 'createLumpyPorridgeModel',
      i429: 'createSpringWaterModel',
      i430: 'createMysteryMeatModel',
      i431: 'createCheapProteinBarModel',
      i432: 'createGelatinDessertModel',
      i433: 'createInstantNoodlePackModel',
      i434: 'createCalmingTeaModel',
      i435: 'createCannedVegetablesModel',
      i436: 'createChocolateBarModel',
      i437: 'createCrispAppleModel',
      i438: 'createFreshMilkModel',
      i439: 'createGlazedDonutModel',
      i440: 'createCheeseCrispsModel',
      i441: 'createPotatoCrispsModel',
      i442: 'createFizzySodaModel',
      i443: 'createCreamSnackCakeModel',
      i444: 'createFreshLemonadeModel',
      i445: 'createJumboColaModel',
      i446: 'createSugarCerealModel',
      i447: 'createCookedMeatModel',
      i448: 'createWildBerriesModel',
      i449: 'createBerryPunchModel',
      i450: 'createFrenchFriesModel',
      i451: 'createOnionRingsModel',
      i452: 'createCannedProcessedMeatModel',
      i453: 'createMeatSubstitutePattyModel',
      i454: 'createFreshBreadModel',
      i455: 'createMintTeaModel',
      i456: 'createCheesePretzelModel',
      i457: 'createBeefTacoModel',
      i458: 'createHotFudgeSundaeModel',
      i459: 'createStrongCoffeeModel',
      i460: 'createPizzaSliceModel',
      i461: 'createChocolateShakeModel',
      i462: 'createMozzarellaSticksModel'
    },

    models: {
      // ======================================================================
      // Shared forms
      // ======================================================================

      /**
       * A bowl with something in it. Soups, porridges and stews are all one of
       * these; the colour of the fill, how full it is and whether anything is
       * floating in it are what tell them apart.
       */
      _bowl(group, o) {
        const ware = this._mat(o.ware === undefined ? 0xE8E4DC : o.ware,
          { roughness: 0.35, metalness: 0.05 });
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.024, 0.026, this.seg(18, 10), 1, true), ware);
        bowl.material.side = THREE.DoubleSide;
        bowl.position.y = 0.015;
        group.add(bowl);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.004, this.seg(14, 8)), ware);
        foot.position.y = 0.002;
        group.add(foot);
        const level = o.level === undefined ? 0.7 : o.level;
        const soup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024 + 0.014 * level, 0.024 + 0.014 * level, 0.002, this.seg(16, 9)),
          this._mat(o.fill, { roughness: o.gloss === undefined ? 0.5 : o.gloss, metalness: 0.0 }));
        soup.position.y = 0.004 + 0.024 * level;
        group.add(soup);
        if (this.wantsTrim() && o.bits) {
          for (let i = 0; i < 4; i++) {
            const bit = new THREE.Mesh(
              o.bits === 'cube' ? new THREE.BoxGeometry(0.006, 0.004, 0.006)
                : new THREE.SphereGeometry(0.0035, this.seg(8, 5), this.seg(6, 4)),
              this._mat(o.bitColor === undefined ? 0x8A9A4A : o.bitColor, { roughness: 0.9, metalness: 0.0 }));
            const a = i * Math.PI / 2 + 0.4;
            bit.position.set(Math.cos(a) * 0.014, 0.005 + 0.024 * level, Math.sin(a) * 0.014);
            bit.rotation.y = a;
            group.add(bit);
          }
        }
        return group;
      },

      /**
       * A wrapped bar. Every snack bar on the shelf is this: a foil or plastic
       * sleeve, crimped at both ends, with one end torn open and the bar
       * pushed half out of it.
       */
      _wrappedBar(group, o) {
        const wrap = this._mat(o.wrap, { roughness: o.matt ? 0.9 : 0.45, metalness: o.matt ? 0.05 : 0.5 });
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.026), wrap);
        sleeve.position.set(-0.014, 0.007, 0);
        group.add(sleeve);
        for (const x of [-0.042]) {
          const crimp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.028), wrap);
          crimp.position.set(x, 0.007, 0);
          crimp.scale.y = 0.5;
          group.add(crimp);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.022),
          this._mat(o.bar, { roughness: 0.9, metalness: 0.0 }));
        bar.position.set(0.026, 0.006, 0);
        group.add(bar);
        if (this.wantsTrim() && o.grain) {
          for (let i = 0; i < 4; i++) {
            const oat = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.003),
              this._mat(o.grain, { roughness: 0.95, metalness: 0.0 }));
            oat.position.set(0.014 + i * 0.007, 0.012, -0.006 + (i % 2) * 0.008);
            oat.rotation.y = i * 0.6;
            group.add(oat);
          }
        }
        return group;
      },

      /** A tin can, lid peeled halfway back on its own curl. */
      _can(group, o) {
        const steel = this._steel(0xB8BCC2, 0.3);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.04, this.seg(16, 9)), steel);
        body.position.y = 0.02;
        group.add(body);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0242, 0.0242, 0.03, this.seg(16, 9), 1, true),
          this._mat(o.label, { roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
        label.position.y = 0.019;
        group.add(label);
        const contents = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, this.seg(14, 8)),
          this._mat(o.fill, { roughness: 0.7, metalness: 0.0 }));
        contents.position.y = 0.039;
        group.add(contents);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.001, this.seg(16, 9), 1, false,
          0, Math.PI), steel);
        lid.position.set(0, 0.044, 0);
        lid.rotation.x = -0.5;
        group.add(lid);
        return group;
      },

      // ======================================================================
      // Water and drink
      // ======================================================================

      // 418. Bottled Water: a thin PET bottle with the ribbing pressed into
      // it, half crushed the way an empty-ish one always is.
      createBottledWaterModel(entry, rand) {
        const group = new THREE.Group();
        const pet = this._mat(0xDCE8EE, {
          roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.35
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.075, this.seg(16, 9)), pet);
        body.position.y = 0.038;
        group.add(body);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.05, this.seg(14, 8)),
          this._mat(0xC8E4F0, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.55 }));
        water.position.y = 0.026;
        group.add(water);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const rib = new THREE.Mesh(
              new THREE.TorusGeometry(0.0182, 0.0016, this.seg(5, 3), this.seg(14, 8)), pet);
            rib.rotation.x = Math.PI / 2;
            rib.position.y = 0.022 + i * 0.012;
            group.add(rib);
          }
        }
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 0.014, this.seg(14, 8)), pet);
        shoulder.position.y = 0.082;
        group.add(shoulder);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, this.seg(14, 8)),
          this._mat(0x2A6AC8, { roughness: 0.55, metalness: 0.05 }));
        cap.position.y = 0.094;
        group.add(cap);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0192, 0.0192, 0.024, this.seg(16, 9), 1, true),
          this._mat(0xE8F2F6, { roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
        label.position.y = 0.034;
        group.add(label);
        return group;
      },

      // 429. Spring Water: the same water from a glass bottle instead, cork
      // stoppered, so the clean one and the plastic one never read alike.
      createSpringWaterModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.019, h: 0.07, neck: 0.016, color: 0xCFE4E8, roughness: 0.08, opacity: 0.4,
          fill: 0xD8F0F8, fillLevel: 0.78
        });
        const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.008, 0.014, this.seg(10, 6)),
          this._mat(0xC8A878, { roughness: 0.95, metalness: 0.0 }));
        cork.position.y = 0.092;
        group.add(cork);
        this._label(group, rand, 0.019, 0.03, 0.028, 0xE8F0E4);
        return group;
      },

      // ======================================================================
      // Bad food
      // ======================================================================

      // 419. Charred Toast: two slices, one black on top, propped against each
      // other the way toast is put down.
      createCharredToastModel(entry, rand) {
        const group = new THREE.Group();
        const crumb = this._mat(0xC8A468, { roughness: 0.99, metalness: 0.0 });
        const burnt = this._mat(0x2A2018, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const slice = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.05), crumb);
          slice.position.set(i * 0.008, 0.005 + i * 0.011, -i * 0.004);
          slice.rotation.y = (i ? 1 : -1) * 0.12;
          group.add(slice);
          const top = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.05), burnt);
          top.position.set(i * 0.008, 0.011 + i * 0.011, -i * 0.004);
          top.rotation.y = (i ? 1 : -1) * 0.12;
          group.add(top);
        }
        const crust = new THREE.Mesh(new THREE.BoxGeometry(0.051, 0.011, 0.051),
          this._mat(0x8A6A3A, { roughness: 0.99, metalness: 0.0 }));
        crust.position.set(0.008, 0.016, -0.004);
        crust.rotation.y = 0.12;
        crust.scale.set(1.0, 0.9, 1.0);
        group.add(crust);
        return group;
      },

      // 420. Unholy Food Abomination: a bowl of something that moved. Grey,
      // lumpy, with a bubble breaking the surface.
      createFoodAbominationModel(entry, rand) {
        const group = new THREE.Group();
        this._bowl(group, { ware: 0xB0AEA4, fill: 0x6A7A5A, level: 0.85, gloss: 0.25, bits: 'blob', bitColor: 0x8A5A6A });
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x7A8A66, { roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.75 }));
        bubble.position.set(0.006, 0.028, -0.004);
        bubble.userData.bob = { amp: 0.003, freq: 0.8 };
        group.add(bubble);
        const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02, this.seg(8, 5)),
          this._mat(0x5A6A4A, { roughness: 0.6, metalness: 0.0 }));
        tendril.position.set(-0.008, 0.034, 0.006);
        tendril.rotation.z = 0.4;
        group.add(tendril);
        return group;
      },

      // 422. Burnt Beans: a pan of beans caught on the bottom, the sauce gone
      // dark and the edge crusted.
      createBurntBeansModel(entry, rand) {
        const group = new THREE.Group();
        const pan = this._steel(0x4A4E52, 0.6);
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.034, 0.03, 0.018, this.seg(18, 10), 1, true), pan);
        body.material.side = THREE.DoubleSide;
        body.position.y = 0.011;
        group.add(body);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, this.seg(16, 9)), pan);
        base.position.y = 0.002;
        group.add(base);
        const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, this.seg(16, 9)),
          this._mat(0x6A2A18, { roughness: 0.7, metalness: 0.0 }));
        sauce.position.y = 0.009;
        group.add(sauce);
        const bean = this._mat(0xA8622A, { roughness: 0.85, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(8, 5), this.seg(6, 4)), bean);
          b.scale.set(1.4, 0.8, 1);
          const a = i * 1.05;
          b.position.set(Math.cos(a) * 0.014, 0.014, Math.sin(a) * 0.014);
          b.rotation.y = a;
          group.add(b);
        }
        const crust = new THREE.Mesh(
          new THREE.TorusGeometry(0.029, 0.0025, this.seg(5, 3), this.seg(16, 9)),
          this._mat(0x2A1810, { roughness: 1.0, metalness: 0.0 }));
        crust.rotation.x = Math.PI / 2;
        crust.position.y = 0.013;
        group.add(crust);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(8, 5)), pan);
        handle.rotation.z = Math.PI / 2 - 0.2;
        handle.position.set(0.048, 0.014, 0);
        group.add(handle);
        return group;
      },

      // 423. Bruised Apple: still an apple, with two soft brown patches and a
      // stem bent over.
      createBruisedAppleModel(entry, rand) {
        const group = new THREE.Group();
        const skin = this._mat(0xA8322A, { roughness: 0.45, metalness: 0.05 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(16, 9), this.seg(12, 7)), skin);
        body.scale.y = 0.9;
        body.position.y = 0.024;
        group.add(body);
        const bruise = this._mat(0x6A4A2A, { roughness: 0.85, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const patch = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)), bruise);
          patch.scale.set(1, 0.7, 0.35);
          patch.position.set(i ? -0.014 : 0.012, 0.02 + i * 0.008, i ? -0.016 : 0.02);
          patch.rotation.y = i ? -0.9 : 0.4;
          group.add(patch);
        }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 0.012, this.seg(6, 4)),
          this._mat(0x5A4028, { roughness: 0.95, metalness: 0.0 }));
        stem.position.set(0.002, 0.05, 0);
        stem.rotation.z = 0.5;
        group.add(stem);
        return group;
      },

      // 424. Petrified Bread: a heel of bread gone hard, the crust cracked
      // right through and the crumb grey.
      createPetrifiedBreadModel(entry, rand) {
        const group = new THREE.Group();
        const crust = this._mat(0x8A6A42, { roughness: 1.0, metalness: 0.0 });
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(14, 8), this.seg(10, 6)), crust);
        loaf.scale.set(1.35, 0.75, 0.9);
        loaf.position.y = 0.022;
        group.add(loaf);
        const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.002, this.seg(16, 9)),
          this._mat(0xB0A88A, { roughness: 1.0, metalness: 0.0 }));
        cut.rotation.z = Math.PI / 2;
        cut.scale.z = 0.75;
        cut.position.set(-0.04, 0.022, 0);
        group.add(cut);
        const crack = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.02, 0.03),
          this._mat(0x5A4428, { roughness: 1.0, metalness: 0.0 }));
        crack.position.set(0.008, 0.036, 0);
        crack.rotation.x = 0.2;
        group.add(crack);
        return group;
      },

      // 425. Day-Old Fish: one fish on a board, the eye gone flat and the
      // colour off it.
      createDayOldFishModel(entry, rand) {
        const group = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.005, 0.05),
          this._wood(0xB09A72));
        board.position.y = 0.0025;
        group.add(board);
        const flesh = this._mat(0x9AA0A0, { roughness: 0.55, metalness: 0.08 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(14, 8), this.seg(10, 6)), flesh);
        body.scale.set(2.0, 0.85, 0.6);
        body.position.y = 0.022;
        group.add(body);
        const tail = this._plate([[0, 0], [0.016, 0.012], [0.014, 0], [0.016, -0.012]], 0.002, flesh);
        tail.rotation.y = Math.PI / 2;
        tail.position.set(-0.038, 0.022, 0);
        group.add(tail);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xC8C4B4, { roughness: 0.85, metalness: 0.0 }));
        eye.scale.z = 0.4;
        eye.position.set(0.03, 0.026, 0.01);
        group.add(eye);
        const fin = this._plate([[0, 0], [0.01, 0.008], [0.018, 0]], 0.0015, flesh);
        fin.rotation.x = -Math.PI / 2;
        fin.position.set(0.004, 0.03, 0.004);
        group.add(fin);
        return group;
      },

      // 427. Suspicious Soup: a broth with something in it you cannot
      // identify, and a film across the top.
      createSuspiciousSoupModel(entry, rand) {
        const group = new THREE.Group();
        this._bowl(group, { ware: 0xD8D2C4, fill: 0x8A7A4A, level: 0.75, gloss: 0.2, bits: 'blob', bitColor: 0x6A5A3A });
        const film = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.0006, this.seg(16, 9)),
          this._mat(0xC8B878, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 }));
        film.position.y = 0.023;
        group.add(film);
        const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.006, 0),
          this._mat(0x7A5A5A, { roughness: 0.8, metalness: 0.0 }));
        lump.position.set(-0.01, 0.024, 0.008);
        group.add(lump);
        return group;
      },

      // 426. Watery Vegetable Soup: thin, pale, with a few pieces of veg that
      // have given up all their colour.
      createWaterySoupModel(entry, rand) {
        return this._bowl(new THREE.Group(),
          { fill: 0xC8C09A, level: 0.55, gloss: 0.25, bits: 'cube', bitColor: 0x9AA870 });
      },

      // 428. Lumpy Porridge: thick enough to stand a spoon in, and the spoon
      // is standing in it.
      createLumpyPorridgeModel(entry, rand) {
        const group = new THREE.Group();
        this._bowl(group, { fill: 0xD8CFB0, level: 0.8, gloss: 0.85, bits: 'blob', bitColor: 0xC8BF9A });
        const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0028, 0.05, this.seg(8, 5)),
          this._mat(0xC0C6CC, { roughness: 0.3, metalness: 0.75 }));
        spoon.position.set(0.008, 0.045, -0.004);
        spoon.rotation.z = 0.25;
        group.add(spoon);
        const lump = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xE0D8BC, { roughness: 0.95, metalness: 0.0 }));
        lump.scale.y = 0.6;
        lump.position.set(-0.008, 0.026, 0.006);
        group.add(lump);
        return group;
      },

      // 430. Mystery Meat: a slab on greaseproof paper, no cut anyone can
      // name, tied with a butcher's string.
      createMysteryMeatModel(entry, rand) {
        const group = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.05),
          this._mat(0xE8E4D4, { roughness: 0.98, metalness: 0.0 }));
        paper.position.y = 0.0005;
        group.add(paper);
        const meat = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0x9A4A4A, { roughness: 0.65, metalness: 0.0 }));
        meat.scale.set(1.3, 0.6, 1);
        meat.position.y = 0.014;
        group.add(meat);
        const fat = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xE0D4C0, { roughness: 0.85, metalness: 0.0 }));
        fat.scale.set(1.25, 0.14, 0.9);
        fat.position.y = 0.024;
        group.add(fat);
        const string = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0012, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0xD8CFA8, { roughness: 1.0, metalness: 0.0 }));
        string.rotation.y = Math.PI / 2;
        string.position.set(0, 0.014, 0);
        string.scale.set(1, 0.85, 1.6);
        group.add(string);
        return group;
      },

      // 431. Cheap Protein Bar: a matt sleeve and a bar the colour of nothing
      // in particular.
      createCheapProteinBarModel(entry, rand) {
        return this._wrappedBar(new THREE.Group(),
          { wrap: 0x3A5A8A, bar: 0x8A7A62, matt: true });
      },

      // 421. Granola Bar: a foil sleeve with the oats and seeds showing on
      // the pressed face.
      createGranolaBarModel(entry, rand) {
        return this._wrappedBar(new THREE.Group(),
          { wrap: 0xC8A02A, bar: 0xB08A4A, grain: 0xE0D0A0 });
      },

      // 432. Colorful Gelatin Dessert: a turned-out jelly on a saucer, still
      // wobbling.
      createGelatinDessertModel(entry, rand) {
        const group = new THREE.Group();
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.005, this.seg(18, 10)),
          this._mat(0xEFEAE0, { roughness: 0.3, metalness: 0.05 }));
        saucer.position.y = 0.0025;
        group.add(saucer);
        const jelly = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.028, 0.03, this.seg(16, 9)),
          this._mat(0xE0405A, {
            roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.75
          }));
        jelly.position.y = 0.02;
        jelly.userData.bob = { amp: 0.0015, freq: 3.2 };
        group.add(jelly);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, this.seg(14, 8), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          this._mat(0xE0405A, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.75 }));
        dome.scale.y = 0.45;
        dome.position.y = 0.035;
        group.add(dome);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(8, 5), this.seg(6, 4)),
              this._mat([0xE0C82A, 0x50B050, 0xE07A2A][i], { roughness: 0.5, metalness: 0.0 }));
            const a = i * 2.1;
            fruit.position.set(Math.cos(a) * 0.01, 0.018 + i * 0.006, Math.sin(a) * 0.01);
            group.add(fruit);
          }
        }
        return group;
      },

      // 433. Instant Noodle Pack: the brick of dried noodles in its printed
      // wrapper, with the flavour sachet tucked under the fold.
      createInstantNoodlePackModel(entry, rand) {
        const group = new THREE.Group();
        const wrap = this._mat(0xC83A2A, { roughness: 0.4, metalness: 0.25 });
        const brick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.055), wrap);
        brick.position.y = 0.01;
        group.add(brick);
        const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.026),
          this._mat(0xE0C878, { roughness: 0.8, metalness: 0.0 }));
        window_.position.set(0, 0.0205, 0);
        group.add(window_);
        if (this.wantsTrim()) {
          const noodle = this._mat(0xD8B860, { roughness: 0.9, metalness: 0.0 });
          for (let i = 0; i < 4; i++) {
            const strand = new THREE.Mesh(
              new THREE.TorusGeometry(0.005, 0.0009, this.seg(5, 3), this.seg(10, 6)), noodle);
            strand.rotation.x = Math.PI / 2;
            strand.position.set(-0.009 + i * 0.006, 0.0212, (i % 2) * 0.008 - 0.004);
            group.add(strand);
          }
        }
        const sachet = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.003, 0.018),
          this._mat(0xE8A02A, { roughness: 0.5, metalness: 0.4 }));
        sachet.position.set(0.03, 0.0015, 0.038);
        sachet.rotation.y = 0.4;
        group.add(sachet);
        return group;
      },

      // ======================================================================
      // More shared forms
      // ======================================================================

      /**
       * A drinking vessel: a paper or plastic cup with a lid and a straw, or
       * an open mug. Half the drinks on the shelf are served in one.
       */
      _cup(group, o) {
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.017, 0.075, this.seg(18, 10)),
          this._mat(o.cup, { roughness: o.gloss === undefined ? 0.85 : o.gloss, metalness: 0.02 }));
        body.position.y = 0.038;
        group.add(body);
        const drink = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.017, 0.05, this.seg(16, 9)),
          this._mat(o.fill, { roughness: 0.35, metalness: 0.0 }));
        drink.position.y = 0.027;
        group.add(drink);
        if (o.lid) {
          const lid = new THREE.Mesh(
            new THREE.CylinderGeometry(0.026, 0.026, 0.006, this.seg(18, 10)),
            this._mat(o.lidColor === undefined ? 0xE8E8EC : o.lidColor,
              { roughness: 0.6, metalness: 0.05 }));
          lid.position.y = 0.078;
          group.add(lid);
          const straw = new THREE.Mesh(
            new THREE.CylinderGeometry(0.003, 0.003, 0.05, this.seg(10, 6)),
            this._mat(o.straw === undefined ? 0xC83A3A : o.straw, { roughness: 0.5, metalness: 0.05 }));
          straw.position.set(0.006, 0.1, 0);
          straw.rotation.z = 0.16;
          group.add(straw);
        } else {
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.024, 0.0018, this.seg(6, 4), this.seg(18, 10)),
            this._mat(o.cup, { roughness: 0.5, metalness: 0.02 }));
          rim.rotation.x = Math.PI / 2;
          rim.position.y = 0.075;
          group.add(rim);
        }
        return group;
      },

      /** A crisp packet: a foil bag, puffed with air and crimped both ends. */
      _crispBag(group, o) {
        const foil = this._mat(o.color, { roughness: 0.4, metalness: 0.55 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(14, 8), this.seg(10, 6)), foil);
        body.scale.set(0.85, 1.35, 0.55);
        body.position.y = 0.04;
        group.add(body);
        for (const y of [0.004, 0.076]) {
          const crimp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.004), foil);
          crimp.position.y = y;
          group.add(crimp);
        }
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.001),
          this._mat(o.panel, { roughness: 0.85, metalness: 0.05 }));
        panel.position.set(0, 0.044, 0.0168);
        group.add(panel);
        return group;
      },

      /** A plate with something on it, for the served dishes. */
      _plateOf(group, o) {
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.038, 0.005, this.seg(20, 11)),
          this._mat(o.ware === undefined ? 0xEFEAE0 : o.ware, { roughness: 0.3, metalness: 0.05 }));
        plate.position.y = 0.0025;
        group.add(plate);
        return group;
      },

      // ======================================================================
      // Drinks
      // ======================================================================

      // 434. Calming Tea: an open mug of pale tea with the bag's tag hanging
      // over the rim.
      createCalmingTeaModel(entry, rand) {
        const group = new THREE.Group();
        this._cup(group, { cup: 0xE8E4DC, fill: 0xC8A860, gloss: 0.3 });
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.013, 0.003, this.seg(6, 4), this.seg(14, 8), Math.PI * 1.2),
          this._mat(0xE8E4DC, { roughness: 0.3, metalness: 0.05 }));
        handle.rotation.y = Math.PI / 2;
        handle.position.set(0.026, 0.042, 0);
        group.add(handle);
        const string = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.022, 0.0008),
          this._mat(0xE0DCD0, { roughness: 1.0, metalness: 0.0 }));
        string.position.set(-0.02, 0.066, 0.006);
        group.add(string);
        const tag = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.0006),
          this._mat(0xE8E0C0, { roughness: 0.98, metalness: 0.0 }));
        tag.position.set(-0.021, 0.052, 0.006);
        group.add(tag);
        return group;
      },

      // 455. Mint Tea: the same mug, greener, with a sprig of mint in it
      // instead of a bag.
      createMintTeaModel(entry, rand) {
        const group = new THREE.Group();
        this._cup(group, { cup: 0xDCE8E0, fill: 0xB0C86A, gloss: 0.3 });
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.013, 0.003, this.seg(6, 4), this.seg(14, 8), Math.PI * 1.2),
          this._mat(0xDCE8E0, { roughness: 0.3, metalness: 0.05 }));
        handle.rotation.y = Math.PI / 2;
        handle.position.set(0.026, 0.042, 0);
        group.add(handle);
        const green = this._mat(0x3A7A32, { roughness: 0.9, metalness: 0.0 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, this.seg(6, 4)), green);
        stem.position.set(0.004, 0.062, 0.004);
        stem.rotation.z = 0.3;
        group.add(stem);
        for (const s of [-1, 1]) {
          const leaf = this._plate([[0, 0], [0.005, 0.006], [0, 0.014], [-0.005, 0.006]], 0.0008, green);
          leaf.position.set(0.008 + s * 0.002, 0.072, 0.004);
          leaf.rotation.set(0.4, s * 0.6, s * 0.5);
          group.add(leaf);
        }
        return group;
      },

      // 459. Strong Coffee: a small dark cup, crema on top, on a saucer.
      createStrongCoffeeModel(entry, rand) {
        const group = new THREE.Group();
        const china = this._mat(0xF0EEE8, { roughness: 0.25, metalness: 0.05 });
        const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.004, this.seg(18, 10)), china);
        saucer.position.y = 0.002;
        group.add(saucer);
        const cup = new THREE.Mesh(
          new THREE.CylinderGeometry(0.019, 0.014, 0.026, this.seg(16, 9), 1, true), china);
        cup.material.side = THREE.DoubleSide;
        cup.position.y = 0.017;
        group.add(cup);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, this.seg(14, 8)), china);
        base.position.y = 0.0055;
        group.add(base);
        const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.002, this.seg(16, 9)),
          this._mat(0x2A1810, { roughness: 0.2, metalness: 0.0 }));
        coffee.position.y = 0.026;
        group.add(coffee);
        const crema = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.0008, this.seg(14, 8)),
          this._mat(0xB08A5A, { roughness: 0.6, metalness: 0.0 }));
        crema.position.y = 0.0272;
        group.add(crema);
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0022, this.seg(6, 4), this.seg(12, 7), Math.PI * 1.3), china);
        handle.rotation.y = Math.PI / 2;
        handle.position.set(0.021, 0.02, 0);
        group.add(handle);
        return group;
      },

      // 438. Fresh Milk: a glass bottle with a foil cap, full to the neck.
      createFreshMilkModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.021, h: 0.075, neck: 0.014, color: 0xE4EEF0, roughness: 0.08, opacity: 0.4,
          fill: 0xF4F2EC, fillLevel: 0.86
        });
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.004, this.seg(14, 8)),
          this._steel(0xC8CCD2, 0.4));
        cap.position.y = 0.091;
        group.add(cap);
        this._label(group, rand, 0.021, 0.03, 0.026, 0xE8F0F4);
        return group;
      },

      // 442. Fizzy Soda: a ribbed bottle of something bright, the cap on and
      // bubbles up the side.
      createFizzySodaModel(entry, rand) {
        const group = new THREE.Group();
        const pet = this._mat(0xDCE8EE, {
          roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.3
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.07, this.seg(16, 9)), pet);
        body.position.y = 0.035;
        group.add(body);
        const pop = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.055, this.seg(14, 8)),
          this._mat(0xE0602A, { roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.8 }));
        pop.position.y = 0.028;
        group.add(pop);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.019, 0.016, this.seg(14, 8)), pet);
        shoulder.position.y = 0.078;
        group.add(shoulder);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.01, this.seg(14, 8)),
          this._mat(0xE0C82A, { roughness: 0.5, metalness: 0.05 }));
        cap.position.y = 0.091;
        group.add(cap);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.0015, 5, 4),
              this._mat(0xF0C890, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6 }));
            bubble.position.set(-0.008 + i * 0.005, 0.02 + i * 0.011, 0.012);
            bubble.userData.bob = { amp: 0.005, freq: 1.1 + i * 0.25 };
            group.add(bubble);
          }
        }
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0212, 0.024, this.seg(16, 9), 1, true),
          this._mat(0xC82A3A, { roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
        label.position.y = 0.03;
        group.add(label);
        return group;
      },

      // 445. Jumbo Cola: the big lidded cup, dark fill, straw in.
      createJumboColaModel(entry, rand) {
        const group = new THREE.Group();
        this._cup(group, { cup: 0xC82A2A, fill: 0x2A1810, lid: true, lidColor: 0xE8E8EC, straw: 0xE8E8EC });
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0225, 0.0195, 0.02, this.seg(18, 10), 1, true),
          this._mat(0xF0ECE0, { roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
        band.position.y = 0.04;
        group.add(band);
        return group;
      },

      // 444. Fresh Lemonade: a tumbler of cloudy lemonade with a wedge on the
      // rim and ice in it.
      createFreshLemonadeModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE4EEF2, {
          roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3
        });
        const tumbler = new THREE.Mesh(
          new THREE.CylinderGeometry(0.023, 0.019, 0.075, this.seg(18, 10), 1, true), glass);
        tumbler.material.side = THREE.DoubleSide;
        tumbler.position.y = 0.038;
        group.add(tumbler);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.005, this.seg(16, 9)), glass);
        base.position.y = 0.0025;
        group.add(base);
        const juice = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.019, 0.055, this.seg(16, 9)),
          this._mat(0xE8DC8A, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.85 }));
        juice.position.y = 0.03;
        group.add(juice);
        const ice = this._mat(0xEAF4F8, {
          roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5
        });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const cube = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.008), ice);
          const a = i * 2.1;
          cube.position.set(Math.cos(a) * 0.008, 0.045 + i * 0.006, Math.sin(a) * 0.008);
          cube.rotation.set(a, a * 0.6, 0.3);
          group.add(cube);
        }
        const wedge = this._plate([[0, 0], [0.012, 0.006], [0.012, -0.006]], 0.004,
          this._mat(0xE8D040, { roughness: 0.55, metalness: 0.0 }));
        wedge.position.set(0.022, 0.074, 0);
        group.add(wedge);
        return group;
      },

      // 449. Berry Punch: a jug of dark punch with fruit floating in it.
      createBerryPunchModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE4EEF2, {
          roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.28
        });
        const jug = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.024, 0.08, this.seg(18, 10), 1, true), glass);
        jug.material.side = THREE.DoubleSide;
        jug.position.y = 0.04;
        group.add(jug);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, this.seg(16, 9)), glass);
        base.position.y = 0.0025;
        group.add(base);
        const punch = new THREE.Mesh(new THREE.CylinderGeometry(0.0262, 0.024, 0.058, this.seg(16, 9)),
          this._mat(0x8A1E4A, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.85 }));
        punch.position.y = 0.031;
        group.add(punch);
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const berry = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(8, 5), this.seg(6, 4)),
            this._mat(i % 2 ? 0x3A2A5A : 0xC83A5A, { roughness: 0.5, metalness: 0.0 }));
          const a = i * 1.7;
          berry.position.set(Math.cos(a) * 0.012, 0.05 + i * 0.004, Math.sin(a) * 0.012);
          berry.userData.bob = { amp: 0.002, freq: 0.6 + i * 0.2 };
          group.add(berry);
        }
        const handle = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0032, this.seg(6, 4), this.seg(14, 8), Math.PI * 1.2), glass);
        handle.rotation.y = Math.PI / 2;
        handle.position.set(0.03, 0.046, 0);
        group.add(handle);
        return group;
      },

      // 461. Chocolate Shake: a tall cup, thick shake, whipped top and a fat
      // straw standing in it.
      createChocolateShakeModel(entry, rand) {
        const group = new THREE.Group();
        this._cup(group, { cup: 0xE8E4DC, fill: 0x6A4028, lid: false });
        const shake = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, this.seg(14, 8), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          this._mat(0x8A5A3A, { roughness: 0.6, metalness: 0.0 }));
        shake.scale.y = 0.5;
        shake.position.y = 0.076;
        group.add(shake);
        const cream = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.026, this.seg(12, 7)),
          this._mat(0xF4F0E8, { roughness: 0.75, metalness: 0.0 }));
        cream.position.y = 0.092;
        group.add(cream);
        const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xB01E2A, { roughness: 0.3, metalness: 0.05 }));
        cherry.position.y = 0.108;
        group.add(cherry);
        const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, this.seg(10, 6)),
          this._mat(0xC83A6A, { roughness: 0.5, metalness: 0.05 }));
        straw.position.set(-0.01, 0.1, 0.004);
        straw.rotation.z = -0.2;
        group.add(straw);
        return group;
      },

      // ======================================================================
      // Packets, bars and cans
      // ======================================================================

      // 435. Canned Vegetables: an opened can of something green.
      createCannedVegetablesModel(entry, rand) {
        return this._can(new THREE.Group(), { label: 0x2A7A4A, fill: 0x7A9A4A });
      },

      // 452. Canned Processed Meat: the flat key-opened tin, pink and glossy.
      createCannedProcessedMeatModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC0C6CC, 0.28);
        const tin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.022, 0.035), steel);
        tin.position.y = 0.011;
        group.add(tin);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.012, 0.036),
          this._mat(0x2A4A8A, { roughness: 0.9, metalness: 0.05 }));
        label.position.y = 0.012;
        group.add(label);
        const meat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.03),
          this._mat(0xD8907A, { roughness: 0.45, metalness: 0.0 }));
        meat.position.y = 0.025;
        group.add(meat);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.001, 0.035), steel);
        lid.position.set(0, 0.032, -0.02);
        lid.rotation.x = -0.9;
        group.add(lid);
        const key = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(10, 6)),
          steel);
        key.rotation.y = Math.PI / 2;
        key.position.set(0.034, 0.004, 0.012);
        group.add(key);
        return group;
      },

      // 436. Chocolate-Flavored Bar: brown wrapper, and the bar out of it is
      // scored into squares.
      createChocolateBarModel(entry, rand) {
        const group = new THREE.Group();
        this._wrappedBar(group, { wrap: 0x4A2A18, bar: 0x6A3A22 });
        if (this.wantsTrim()) {
          const score = this._mat(0x3A2014, { roughness: 0.9, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.0008, 0.001, 0.022), score);
            line.position.set(0.014 + i * 0.009, 0.0125, 0);
            group.add(line);
          }
        }
        return group;
      },

      // 440. Cheese-Flavored Crisps: an orange bag, puffed.
      createCheeseCrispsModel(entry, rand) {
        return this._crispBag(new THREE.Group(), { color: 0xE08A2A, panel: 0xF0D060 });
      },

      // 441. Potato Crisps: the reconstituted kind, so a tube rather than a
      // bag, with the stack showing under the lid.
      createPotatoCrispsModel(entry, rand) {
        const group = new THREE.Group();
        const card = this._mat(0xC8302A, { roughness: 0.85, metalness: 0.05 });
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.09, this.seg(18, 10)), card);
        tube.position.y = 0.045;
        group.add(tube);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.0248, 0.0248, 0.006, this.seg(18, 10)),
          this._mat(0xF0F0F4, { roughness: 0.6, metalness: 0.05 }));
        lid.position.set(0.03, 0.003, 0.03);
        lid.rotation.set(0, 0, 0);
        group.add(lid);
        const crisp = this._mat(0xE0C080, { roughness: 0.9, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.0015, this.seg(14, 8)), crisp);
          chip.position.set(0, 0.091 + i * 0.003, 0);
          chip.rotation.x = 0.12 + i * 0.05;
          chip.rotation.z = i * 0.4;
          group.add(chip);
        }
        return group;
      },

      // 443. Cream Snack Cake: two sponge fingers on their tray, one bitten
      // so the cream shows.
      createCreamSnackCakeModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.04),
          this._mat(0xF0EFEA, { roughness: 0.5, metalness: 0.05 }));
        tray.position.y = 0.002;
        group.add(tray);
        const sponge = this._mat(0xE0B860, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, this.seg(14, 8)), sponge);
          cake.rotation.z = Math.PI / 2;
          cake.position.set(0, 0.013, -0.01 + i * 0.02);
          group.add(cake);
        }
        const cream = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.002, this.seg(12, 7)),
          this._mat(0xF6F4EC, { roughness: 0.7, metalness: 0.0 }));
        cream.rotation.z = Math.PI / 2;
        cream.position.set(0.026, 0.013, -0.01);
        group.add(cream);
        return group;
      },

      // 446. Colorful Sugar Cereal: an open box with the coloured rings
      // spilling out of it.
      createSugarCerealModel(entry, rand) {
        const group = new THREE.Group();
        const box = this._mat(0xC82A8A, { roughness: 0.85, metalness: 0.03 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.028), box);
        body.position.y = 0.043;
        group.add(body);
        for (const s of [-1, 1]) {
          const flap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.002), box);
          flap.position.set(0, 0.091, s * 0.014);
          flap.rotation.x = s * 0.7;
          group.add(flap);
        }
        const hues = [0xE04040, 0xE0C040, 0x40A0E0, 0x50C060];
        for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.005, 0.002, this.seg(5, 3), this.seg(10, 6)),
            this._mat(hues[i % 4], { roughness: 0.8, metalness: 0.0 }));
          ring.position.set(0.04 + i * 0.004, 0.002 + (i % 2) * 0.004, -0.012 + i * 0.008);
          ring.rotation.set(i * 0.5, i * 0.7, 0.4);
          group.add(ring);
        }
        return group;
      },

      // ======================================================================
      // Cooked and served
      // ======================================================================

      // 447. Cooked meat: a joint on a board, seared outside, with the bone
      // sticking out of one end.
      createCookedMeatModel(entry, rand) {
        const group = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.005, 0.05), this._wood(0xB09A72));
        board.position.y = 0.0025;
        group.add(board);
        const meat = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(14, 8), this.seg(10, 6)),
          this._mat(0x8A4A2A, { roughness: 0.55, metalness: 0.0 }));
        meat.scale.set(1.35, 0.85, 1);
        meat.position.y = 0.024;
        group.add(meat);
        const sear = new THREE.Mesh(new THREE.SphereGeometry(0.0245, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0x4A2818, { roughness: 0.8, metalness: 0.0 }));
        sear.scale.set(1.3, 0.28, 0.95);
        sear.position.y = 0.038;
        group.add(sear);
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.026, this.seg(10, 6)),
          this._mat(0xE8E0CC, { roughness: 0.7, metalness: 0.0 }));
        bone.rotation.z = Math.PI / 2 - 0.2;
        bone.position.set(0.042, 0.026, 0);
        group.add(bone);
        return group;
      },

      // 448. Wild Berries: a small heap of berries in a leaf, gathered rather
      // than bought.
      createWildBerriesModel(entry, rand) {
        const group = new THREE.Group();
        const leaf = this._plate([
          [-0.026, -0.018], [0.006, -0.024], [0.03, 0], [0.006, 0.024], [-0.026, 0.018]
        ], 0.001, this._mat(0x3A6A2A, { roughness: 0.9, metalness: 0.0 }));
        leaf.rotation.x = -Math.PI / 2;
        leaf.position.y = 0.0005;
        group.add(leaf);
        const hues = [0x4A2A5A, 0x8A2A4A, 0x2A3A6A];
        for (let i = 0; i < (this.wantsTrim() ? 7 : 4); i++) {
          const berry = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
            this._mat(hues[i % 3], { roughness: 0.45, metalness: 0.02 }));
          const a = i * 1.4;
          const r = i < 3 ? 0.0 : 0.009;
          berry.position.set(Math.cos(a) * r, 0.0055 + (i < 3 ? 0.005 : 0), Math.sin(a) * r);
          group.add(berry);
        }
        return group;
      },

      // 450. Crispy French Fries: an open carton of fries standing up out of
      // it.
      createFrenchFriesModel(entry, rand) {
        const group = new THREE.Group();
        const carton = this._mat(0xC8302A, { roughness: 0.85, metalness: 0.03 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.014, 0.045, 4), carton);
        body.rotation.y = Math.PI / 4;
        body.position.y = 0.023;
        group.add(body);
        const potato = this._mat(0xE0C060, { roughness: 0.85, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
          const fry = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.004), potato);
          const a = i * 1.1;
          fry.position.set(Math.cos(a) * 0.008, 0.056 + (i % 2) * 0.006, Math.sin(a) * 0.008);
          fry.rotation.set((i % 2 ? 1 : -1) * 0.2, a, Math.cos(a) * 0.22);
          group.add(fry);
        }
        return group;
      },

      // 451. Onion Rings: a stack of four battered rings on greaseproof.
      createOnionRingsModel(entry, rand) {
        const group = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.001, 0.05),
          this._mat(0xE8E4D4, { roughness: 0.98, metalness: 0.0 }));
        paper.position.y = 0.0005;
        group.add(paper);
        const batter = this._mat(0xD8A852, { roughness: 0.9, metalness: 0.0 });
        for (let i = 0; i < 4; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.016 - i * 0.001, 0.006, this.seg(8, 5), this.seg(16, 9)), batter);
          ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.12 : -0.1);
          ring.position.set(i * 0.002, 0.007 + i * 0.011, (i % 2) * 0.003);
          group.add(ring);
        }
        return group;
      },

      // 453. Meat Substitute Patty: a pressed soy patty on its paper disc,
      // the texture too even to be meat.
      createMeatSubstitutePattyModel(entry, rand) {
        const group = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.001, this.seg(18, 10)),
          this._mat(0xE8E4D4, { roughness: 0.98, metalness: 0.0 }));
        disc.position.y = 0.0005;
        group.add(disc);
        const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, this.seg(20, 11)),
          this._mat(0x8A5A48, { roughness: 0.8, metalness: 0.0 }));
        patty.position.y = 0.007;
        group.add(patty);
        if (this.wantsTrim()) {
          const grain = this._mat(0x7A4A3A, { roughness: 0.9, metalness: 0.0 });
          for (let i = 0; i < 4; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0006, 0.0018), grain);
            line.position.set(0, 0.0132, -0.009 + i * 0.006);
            group.add(line);
          }
        }
        return group;
      },

      // 454. Fresh Bread: a slashed loaf, still whole, with flour on the top.
      createFreshBreadModel(entry, rand) {
        const group = new THREE.Group();
        const crust = this._mat(0xB88A4A, { roughness: 0.95, metalness: 0.0 });
        const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(16, 9), this.seg(11, 6)), crust);
        loaf.scale.set(1.5, 0.8, 0.85);
        loaf.position.y = 0.024;
        group.add(loaf);
        const flour = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(8, 5)),
          this._mat(0xE8E0C8, { roughness: 1.0, metalness: 0.0 }));
        flour.scale.set(1.42, 0.28, 0.8);
        flour.position.y = 0.04;
        group.add(flour);
        const slash = this._mat(0xD8B070, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 3; i++) {
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.003, 0.03), slash);
          cut.position.set(-0.018 + i * 0.018, 0.044, 0);
          cut.rotation.y = 0.5;
          group.add(cut);
        }
        return group;
      },

      // 456. Cheese Pretzel: a knotted pretzel with salt on it and cheese in
      // a small pot beside it.
      createCheesePretzelModel(entry, rand) {
        const group = new THREE.Group();
        const dough = this._mat(0x9A6A32, { roughness: 0.9, metalness: 0.0 });
        const outer = new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.007, this.seg(8, 5), this.seg(18, 10)), dough);
        outer.rotation.x = Math.PI / 2;
        outer.position.y = 0.007;
        group.add(outer);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(
            new THREE.TorusGeometry(0.011, 0.006, this.seg(6, 4), this.seg(12, 7), Math.PI * 1.2), dough);
          arm.rotation.x = Math.PI / 2;
          arm.rotation.z = s * 0.8;
          arm.position.set(s * 0.006, 0.007, -0.008);
          group.add(arm);
        }
        if (this.wantsTrim()) {
          const salt = this._mat(0xF4F4F0, { roughness: 1.0, metalness: 0.0 });
          for (let i = 0; i < 5; i++) {
            const grain = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.002, 0.002), salt);
            const a = i * 1.25;
            grain.position.set(Math.cos(a) * 0.02, 0.014, Math.sin(a) * 0.02);
            group.add(grain);
          }
        }
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.012, this.seg(14, 8)),
          this._mat(0xE8E8EC, { roughness: 0.5, metalness: 0.05 }));
        pot.position.set(0.038, 0.006, 0.014);
        group.add(pot);
        const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.002, this.seg(12, 7)),
          this._mat(0xE0A82A, { roughness: 0.4, metalness: 0.0 }));
        cheese.position.set(0.038, 0.012, 0.014);
        group.add(cheese);
        return group;
      },

      // 457. Beef Taco: a folded soft shell with the filling showing along
      // the opening.
      createBeefTacoModel(entry, rand) {
        const group = new THREE.Group();
        const tortilla = this._mat(0xE0C88A, { roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide });
        const shell = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, 0.05, this.seg(16, 9), 1, true, 0, Math.PI), tortilla);
        shell.rotation.set(0, 0, Math.PI / 2);
        shell.position.y = 0.02;
        group.add(shell);
        const meat = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.012, 0.018),
          this._mat(0x7A3A22, { roughness: 0.8, metalness: 0.0 }));
        meat.position.y = 0.024;
        group.add(meat);
        const lettuce = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.005, 0.02),
          this._mat(0x6AA83A, { roughness: 0.9, metalness: 0.0 }));
        lettuce.position.y = 0.032;
        group.add(lettuce);
        if (this.wantsTrim()) {
          const cheese = this._mat(0xE8C040, { roughness: 0.7, metalness: 0.0 });
          for (let i = 0; i < 4; i++) {
            const shred = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0015, 0.0015), cheese);
            shred.position.set(-0.014 + i * 0.01, 0.036, -0.004 + (i % 2) * 0.008);
            shred.rotation.y = i * 0.5;
            group.add(shred);
          }
        }
        return group;
      },

      // 458. Hot Fudge Sundae: scoops in a tall glass with sauce down them
      // and a wafer standing in the top.
      createHotFudgeSundaeModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE4EEF2, {
          roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3
        });
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.004, this.seg(16, 9)), glass);
        foot.position.y = 0.002;
        group.add(foot);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.014, this.seg(12, 7)), glass);
        stem.position.y = 0.011;
        group.add(stem);
        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.012, 0.03, this.seg(18, 10), 1, true), glass);
        bowl.material.side = THREE.DoubleSide;
        bowl.position.y = 0.033;
        group.add(bowl);
        const cream = this._mat(0xF0EAD8, { roughness: 0.7, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const scoop = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(12, 7), this.seg(9, 5)), cream);
          scoop.position.set((i ? 1 : -1) * 0.008, 0.05 + i * 0.006, 0);
          group.add(scoop);
        }
        const fudge = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(8, 5)),
          this._mat(0x3A1E12, { roughness: 0.35, metalness: 0.0 }));
        fudge.scale.y = 0.35;
        fudge.position.y = 0.062;
        group.add(fudge);
        const wafer = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.028, 0.002),
          this._mat(0xD8B878, { roughness: 0.95, metalness: 0.0 }));
        wafer.position.set(0.012, 0.076, 0);
        wafer.rotation.z = 0.2;
        group.add(wafer);
        return group;
      },

      // 460. Pepperoni Pizza Slice: one wedge, cheese pulled at the point.
      createPizzaSliceModel(entry, rand) {
        const group = new THREE.Group();
        const base = this._plate([[0, 0], [0.075, 0.026], [0.075, -0.026]], 0.006,
          this._mat(0xD8B070, { roughness: 0.95, metalness: 0.0 }));
        base.rotation.x = -Math.PI / 2;
        base.position.y = 0.003;
        group.add(base);
        const cheese = this._plate([[0.006, 0], [0.07, 0.022], [0.07, -0.022]], 0.004,
          this._mat(0xE8C860, { roughness: 0.55, metalness: 0.0 }));
        cheese.rotation.x = -Math.PI / 2;
        cheese.position.y = 0.008;
        group.add(cheese);
        const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(12, 7)),
          this._mat(0xC89A58, { roughness: 0.95, metalness: 0.0 }));
        crust.rotation.x = Math.PI / 2;
        crust.position.set(0.073, 0.008, 0);
        group.add(crust);
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const pepperoni = new THREE.Mesh(
            new THREE.CylinderGeometry(0.007, 0.007, 0.002, this.seg(12, 7)),
            this._mat(0xA82A2A, { roughness: 0.6, metalness: 0.0 }));
          pepperoni.position.set(0.024 + (i % 2) * 0.024, 0.011, -0.01 + Math.floor(i / 2) * 0.02);
          group.add(pepperoni);
        }
        return group;
      },

      // 462. Mozzarella Sticks: four breaded sticks stacked, one broken with
      // the cheese pulling between the halves.
      createMozzarellaSticksModel(entry, rand) {
        const group = new THREE.Group();
        const crumb = this._mat(0xD8A860, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 3; i++) {
          const stick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), crumb);
          stick.position.set(0, 0.006 + i * 0.013, -0.012 + i * 0.012);
          stick.rotation.y = (i - 1) * 0.2;
          group.add(stick);
        }
        const half = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.012), crumb);
        half.position.set(-0.036, 0.006, 0.024);
        half.rotation.y = 0.5;
        group.add(half);
        const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.016, this.seg(8, 5)),
          this._mat(0xF0E8C8, { roughness: 0.6, metalness: 0.0 }));
        pull.rotation.set(0, 0.5, Math.PI / 2);
        pull.position.set(-0.02, 0.006, 0.018);
        group.add(pull);
        return group;
      },

      // 437. Crisp Apple: the good apple, unlike the bruised one, with a leaf
      // still on the stem.
      createCrispAppleModel(entry, rand) {
        const group = new THREE.Group();
        const skin = this._mat(0xC02A2A, { roughness: 0.25, metalness: 0.08 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.027, this.seg(16, 9), this.seg(12, 7)), skin);
        body.scale.y = 0.92;
        body.position.y = 0.025;
        group.add(body);
        const dimple = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x8A1E1E, { roughness: 0.4, metalness: 0.05 }));
        dimple.scale.y = 0.4;
        dimple.position.y = 0.048;
        group.add(dimple);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 0.014, this.seg(6, 4)),
          this._mat(0x5A4028, { roughness: 0.95, metalness: 0.0 }));
        stem.position.y = 0.054;
        group.add(stem);
        const leaf = this._plate([[0, 0], [0.007, 0.006], [0, 0.016], [-0.007, 0.006]], 0.0008,
          this._mat(0x3A7A32, { roughness: 0.9, metalness: 0.0 }));
        leaf.position.set(0.006, 0.056, 0);
        leaf.rotation.set(0.3, 0, 1.1);
        group.add(leaf);
        return group;
      },

      // 439. Glazed Donut: a ring with glaze poured over it and sprinkles on
      // top, on a napkin.
      createGlazedDonutModel(entry, rand) {
        const group = new THREE.Group();
        const napkin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.001, 0.06),
          this._mat(0xF0EFEA, { roughness: 0.99, metalness: 0.0 }));
        napkin.position.y = 0.0005;
        napkin.rotation.y = 0.3;
        group.add(napkin);
        const dough = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0095, this.seg(10, 6), this.seg(20, 11)),
          this._mat(0xC89A5A, { roughness: 0.9, metalness: 0.0 }));
        dough.rotation.x = Math.PI / 2;
        dough.position.y = 0.011;
        group.add(dough);
        const glaze = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0092, this.seg(8, 5), this.seg(18, 10), Math.PI * 2),
          this._mat(0xF0D8E4, { roughness: 0.35, metalness: 0.0 }));
        glaze.rotation.x = Math.PI / 2;
        glaze.position.y = 0.0135;
        glaze.scale.y = 0.6;
        group.add(glaze);
        if (this.wantsTrim()) {
          const hues = [0xE04040, 0xE0C040, 0x40A0E0, 0x50C060, 0xE080C0];
          for (let i = 0; i < 6; i++) {
            const sprinkle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0012, 0.0012),
              this._mat(hues[i % 5], { roughness: 0.7, metalness: 0.0 }));
            const a = i * 1.05;
            sprinkle.position.set(Math.cos(a) * 0.02, 0.019, Math.sin(a) * 0.02);
            sprinkle.rotation.y = a + 0.5;
            group.add(sprinkle);
          }
        }
        return group;
      },

      // ======================================================================
      // Served dishes
      // ======================================================================
      //
      // Past the packets and the drinks, the shelf is food that arrives on
      // something: a plate, a bowl, a board, in a bun or on a skewer. Writing
      // two hundred unrelated builders would be dishonest about that, so the
      // serving forms are shared and every dish is one line in the DISHES
      // table at the bottom of this file: the form it is served in, what
      // colour the food is, what is on top of it, and how much of it there is.
      //
      // The table is the model. A dish that wants a shape no form covers gets
      // its own builder written out, the way the drinks above did.

      /**
       * A dish, built in whatever form it is served in. `o` is one line of the
       * DISHES table:
       *   form    plate | bowl | bun | roll | skewer | wedge | log | pastry
       *   main    the colour of the food itself
       *   accent  the garnish, sauce or filling colour
       *   ware    the plate or bowl colour, where the form has one
       *   count   how many pieces, for the forms that come in pieces
       */
      _served(o) {
        const group = new THREE.Group();
        const main = this._mat(o.main, { roughness: o.gloss === undefined ? 0.8 : o.gloss, metalness: 0.0 });
        const accent = this._mat(o.accent === undefined ? o.main : o.accent,
          { roughness: 0.7, metalness: 0.0 });
        const count = o.count || 3;

        switch (o.form) {
          case 'bowl': {
            this._bowl(group, {
              ware: o.ware, fill: o.main, level: o.level === undefined ? 0.72 : o.level,
              gloss: o.gloss, bits: o.bits || 'blob', bitColor: o.accent
            });
            break;
          }

          case 'bun': {
            // A steamed or filled bun: a dome with a pleat on top and the
            // filling showing where it is open.
            this._plateOf(group, { ware: o.ware });
            for (let i = 0; i < Math.min(count, 3); i++) {
              const a = i * Math.PI * 2 / Math.min(count, 3);
              const x = Math.min(count, 3) === 1 ? 0 : Math.cos(a) * 0.017;
              const z = Math.min(count, 3) === 1 ? 0 : Math.sin(a) * 0.017;
              const bun = new THREE.Mesh(
                new THREE.SphereGeometry(0.016, this.seg(14, 8), this.seg(10, 6)), main);
              bun.scale.y = 0.85;
              bun.position.set(x, 0.017, z);
              group.add(bun);
              const pleat = new THREE.Mesh(
                new THREE.CylinderGeometry(0.004, 0.006, 0.004, this.seg(10, 6)), main);
              pleat.position.set(x, 0.03, z);
              group.add(pleat);
              if (this.wantsTrim() && o.accent !== undefined) {
                const filling = new THREE.Mesh(
                  new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)), accent);
                filling.scale.set(1, 0.5, 1);
                filling.position.set(x, 0.031, z);
                group.add(filling);
              }
            }
            break;
          }

          case 'roll': {
            // Rolls, spring rolls, sausages, anything cylindrical laid out in
            // a row on a board.
            const board = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.004, 0.05),
              this._mat(o.ware === undefined ? 0xB09A72 : o.ware, { roughness: 0.9, metalness: 0.0 }));
            board.position.y = 0.002;
            group.add(board);
            for (let i = 0; i < count; i++) {
              const roll = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.05, this.seg(12, 7)), main);
              roll.rotation.z = Math.PI / 2;
              roll.position.set(0, 0.012, -0.014 + i * (0.028 / Math.max(1, count - 1)));
              roll.rotation.y = (i - (count - 1) / 2) * 0.12;
              group.add(roll);
              if (this.wantsTrim() && o.accent !== undefined) {
                const cut = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.0075, 0.0075, 0.002, this.seg(10, 6)), accent);
                cut.rotation.z = Math.PI / 2;
                cut.position.set(0.026, 0.012, -0.014 + i * (0.028 / Math.max(1, count - 1)));
                group.add(cut);
              }
            }
            break;
          }

          case 'skewer': {
            const board = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.004, 0.045),
              this._mat(o.ware === undefined ? 0xB09A72 : o.ware, { roughness: 0.9, metalness: 0.0 }));
            board.position.y = 0.002;
            group.add(board);
            const stick = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0015, 0.0015, 0.075, this.seg(8, 5)),
              this._mat(0xC8A870, { roughness: 0.95, metalness: 0.0 }));
            stick.rotation.z = Math.PI / 2;
            stick.position.y = 0.01;
            group.add(stick);
            for (let i = 0; i < count; i++) {
              const piece = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012),
                i % 2 ? accent : main);
              piece.position.set(-0.024 + i * (0.048 / Math.max(1, count - 1)), 0.012, 0);
              piece.rotation.y = i * 0.4;
              group.add(piece);
            }
            break;
          }

          case 'wedge': {
            // A slice or wedge, lying flat: cake, pie, pastry, tart.
            this._plateOf(group, { ware: o.ware });
            const wedge = this._plate([[0, 0], [0.05, 0.02], [0.05, -0.02]], 0.016, main);
            wedge.rotation.x = -Math.PI / 2;
            wedge.position.set(-0.018, 0.013, 0);
            group.add(wedge);
            const top = this._plate([[0, 0], [0.048, 0.019], [0.048, -0.019]], 0.003, accent);
            top.rotation.x = -Math.PI / 2;
            top.position.set(-0.017, 0.022, 0);
            group.add(top);
            break;
          }

          case 'log': {
            // A whole thing on a board: a joint, a loaf, a sausage, a fish.
            const board = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.005, 0.05),
              this._mat(o.ware === undefined ? 0xB09A72 : o.ware, { roughness: 0.9, metalness: 0.0 }));
            board.position.y = 0.0025;
            group.add(board);
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.022, this.seg(14, 8), this.seg(10, 6)), main);
            body.scale.set(1.5, 0.8, 0.95);
            body.position.y = 0.022;
            group.add(body);
            const glaze = new THREE.Mesh(
              new THREE.SphereGeometry(0.0225, this.seg(12, 7), this.seg(8, 5)), accent);
            glaze.scale.set(1.42, 0.24, 0.88);
            glaze.position.y = 0.033;
            group.add(glaze);
            break;
          }

          case 'pastry': {
            // Folded or layered: a paratha, a baklava, a pastry, a pancake.
            this._plateOf(group, { ware: o.ware });
            for (let i = 0; i < Math.min(count, 3); i++) {
              const layer = new THREE.Mesh(
                new THREE.CylinderGeometry(0.028 - i * 0.002, 0.028 - i * 0.002, 0.006, this.seg(16, 9)),
                i === Math.min(count, 3) - 1 ? accent : main);
              layer.position.set(i * 0.002, 0.008 + i * 0.006, -i * 0.002);
              layer.rotation.y = i * 0.3;
              group.add(layer);
            }
            break;
          }

          case 'glass': {
            // Anything poured and drunk at a table: ale, mead, wine, tea.
            const glass = this._mat(0xE4EEF2, {
              roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.28
            });
            const stem = o.stem !== false;
            if (stem) {
              const foot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.02, 0.004, this.seg(16, 9)), glass);
              foot.position.y = 0.002;
              group.add(foot);
              const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.004, 0.004, 0.02, this.seg(10, 6)), glass);
              post.position.y = 0.014;
              group.add(post);
            }
            const y0 = stem ? 0.024 : 0.0;
            const bowl = new THREE.Mesh(
              new THREE.CylinderGeometry(0.022, stem ? 0.012 : 0.019, 0.05, this.seg(18, 10), 1, true), glass);
            bowl.material.side = THREE.DoubleSide;
            bowl.position.y = y0 + 0.025;
            group.add(bowl);
            if (!stem) {
              const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.019, 0.019, 0.004, this.seg(16, 9)), glass);
              base.position.y = 0.002;
              group.add(base);
            }
            const drink = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0205, stem ? 0.012 : 0.0185, 0.034, this.seg(16, 9)),
              this._mat(o.main, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.85 }));
            drink.position.y = y0 + 0.019;
            group.add(drink);
            if (o.accent !== undefined) {
              // A head on a beer, a float on a punch, a slick on a tea.
              const head = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0205, 0.0205, 0.006, this.seg(16, 9)), accent);
              head.position.y = y0 + 0.039;
              group.add(head);
            }
            break;
          }

          case 'bottle': {
            // Sold by the bottle rather than the glass.
            const glass = this._mat(o.ware === undefined ? 0x2A4A2A : o.ware, {
              roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.7
            });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.02, 0.062, this.seg(16, 9)), glass);
            body.position.y = 0.031;
            group.add(body);
            const fill = new THREE.Mesh(
              new THREE.CylinderGeometry(0.018, 0.018, 0.05, this.seg(14, 8)),
              this._mat(o.main, { roughness: 0.25, metalness: 0.0 }));
            fill.position.y = 0.026;
            group.add(fill);
            const shoulder = new THREE.Mesh(
              new THREE.CylinderGeometry(0.009, 0.02, 0.022, this.seg(14, 8)), glass);
            shoulder.position.y = 0.073;
            group.add(shoulder);
            const neck = new THREE.Mesh(
              new THREE.CylinderGeometry(0.009, 0.009, 0.024, this.seg(12, 7)), glass);
            neck.position.y = 0.096;
            group.add(neck);
            const cork = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0085, 0.008, 0.012, this.seg(10, 6)), accent);
            cork.position.y = 0.113;
            group.add(cork);
            break;
          }

          case 'wheel': {
            // A whole round of something, with one wedge cut out of it.
            const rind = new THREE.Mesh(
              new THREE.CylinderGeometry(0.038, 0.038, 0.03, this.seg(24, 12), 1, false,
                0, Math.PI * 1.75), main);
            rind.position.y = 0.015;
            group.add(rind);
            const face = this._plate([[0, 0], [0.038, 0], [0.027, 0.027]], 0.03, accent);
            face.rotation.x = -Math.PI / 2;
            face.position.set(0, 0.03, 0);
            group.add(face);
            const wedge = this._plate([[0, 0], [0.036, 0], [0.026, 0.026]], 0.028, accent);
            wedge.rotation.x = -Math.PI / 2;
            wedge.position.set(0.05, 0.028, -0.024);
            wedge.rotation.z = 0.6;
            group.add(wedge);
            break;
          }

          case 'bucket': {
            // Sold by the bucket: the tub, and what is piled out of the top.
            const tub = new THREE.Mesh(
              new THREE.CylinderGeometry(0.032, 0.026, 0.055, this.seg(18, 10)),
              this._mat(o.ware === undefined ? 0xC82A2A : o.ware, { roughness: 0.85, metalness: 0.03 }));
            tub.position.y = 0.0275;
            group.add(tub);
            const band = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0322, 0.0322, 0.018, this.seg(18, 10), 1, true),
              this._mat(0xF0ECE0, { roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }));
            band.position.y = 0.03;
            group.add(band);
            for (let i = 0; i < count; i++) {
              const piece = new THREE.Mesh(
                new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)), main);
              piece.scale.set(1.3, 0.85, 1);
              const a = i * Math.PI * 2 / count;
              piece.position.set(Math.cos(a) * 0.014, 0.058 + (i % 2) * 0.008, Math.sin(a) * 0.014);
              piece.rotation.set(0.2, a, 0.3);
              group.add(piece);
            }
            break;
          }

          case 'fruit': {
            // A single piece of fruit. The rare ones on this shelf are lit
            // from inside, which is the only thing separating a moonberry
            // from a plum.
            const flesh = o.glow
              ? this._glow(o.main, o.glowStrength === undefined ? 0.5 : o.glowStrength)
              : this._mat(o.main, { roughness: 0.35, metalness: 0.05 });
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.024, this.seg(16, 9), this.seg(12, 7)), flesh);
            body.scale.set(o.wide === undefined ? 1 : o.wide, o.tallFruit === undefined ? 0.95 : o.tallFruit, 1);
            body.position.y = 0.023;
            group.add(body);
            if (o.facets) {
              for (let i = 0; i < 5; i++) {
                const facet = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), flesh);
                const a = i * Math.PI * 2 / 5;
                facet.position.set(Math.cos(a) * 0.018, 0.026, Math.sin(a) * 0.018);
                facet.rotation.set(a, a * 0.7, 0.4);
                group.add(facet);
              }
            }
            const stem = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0015, 0.002, 0.012, this.seg(6, 4)),
              this._mat(0x5A4028, { roughness: 0.95, metalness: 0.0 }));
            stem.position.y = 0.05;
            group.add(stem);
            if (o.accent !== undefined) {
              const leaf = this._plate([[0, 0], [0.007, 0.006], [0, 0.016], [-0.007, 0.006]], 0.0008, accent);
              leaf.position.set(0.006, 0.052, 0);
              leaf.rotation.set(0.3, 0, 1.1);
              group.add(leaf);
            }
            if (o.glow) {
              const halo = new THREE.Mesh(
                new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)),
                this._glow(o.main, 0.9));
              halo.position.set(0.02, 0.04, 0.012);
              halo.userData.orbit = { radius: 0.026, speed: 0.6, phase: 0.4 };
              group.add(halo);
            }
            break;
          }

          case 'root': {
            // A pulled root: the taper down, the cut greens still on top,
            // and the dirt it came up with.
            const root = new THREE.Mesh(
              new THREE.ConeGeometry(0.014, 0.075, this.seg(14, 8)), main);
            root.rotation.z = Math.PI - 0.12;
            root.position.set(0, 0.04, 0);
            group.add(root);
            const shoulder = new THREE.Mesh(
              new THREE.SphereGeometry(0.014, this.seg(12, 7), this.seg(9, 5)), main);
            shoulder.scale.y = 0.55;
            shoulder.position.y = 0.072;
            group.add(shoulder);
            if (o.accent !== undefined) {
              for (let i = 0; i < count; i++) {
                const leaf = this._plate([[0, 0], [0.006, 0.014], [0, 0.04], [-0.006, 0.014]], 0.0008, accent);
                const a = i * Math.PI * 2 / count;
                leaf.position.set(Math.cos(a) * 0.004, 0.082, Math.sin(a) * 0.004);
                leaf.rotation.set(0.35, -a, Math.cos(a) * 0.4);
                group.add(leaf);
              }
            }
            if (o.dirt) {
              const soil = this._mat(0x4A3A28, { roughness: 1.0, metalness: 0.0 });
              for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
                const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.003, 0), soil);
                clod.position.set(-0.008 + i * 0.008, 0.003, 0.008 - i * 0.006);
                group.add(clod);
              }
            }
            break;
          }

          case 'leaf': {
            // A picked bunch of leaves, laid down with the stems together.
            for (let i = 0; i < count; i++) {
              const spread = (i / Math.max(1, count - 1) - 0.5);
              const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0012, 0.0016, 0.045, this.seg(6, 4)), accent);
              stem.rotation.set(0, spread * 0.8, Math.PI / 2 - 0.12);
              stem.position.set(-0.014, 0.006 + i * 0.002, spread * 0.012);
              group.add(stem);
              const blade = this._plate(
                [[0, 0], [0.012, 0.016], [0.004, 0.042], [-0.004, 0.042], [-0.012, 0.016]], 0.0008, main);
              blade.rotation.set(-Math.PI / 2 + 0.25, 0, -Math.PI / 2 + spread * 0.8);
              blade.position.set(0.024, 0.006 + i * 0.002, spread * 0.02);
              group.add(blade);
            }
            const tie = new THREE.Mesh(
              new THREE.TorusGeometry(0.007, 0.0012, this.seg(5, 3), this.seg(10, 6)),
              this._mat(0xC8B078, { roughness: 1.0, metalness: 0.0 }));
            tie.rotation.y = Math.PI / 2;
            tie.position.set(-0.02, 0.007, 0);
            group.add(tie);
            break;
          }

          case 'mushroom': {
            // Cap, stem and gills. The glowing ones on this shelf light their
            // own cap, which is the whole of what makes them worth picking.
            const capMat = o.glow ? this._glow(o.main, 0.55) : main;
            for (let i = 0; i < Math.min(count, 3); i++) {
              const x = Math.min(count, 3) === 1 ? 0 : (i - 1) * 0.018;
              const scale = 1 - i * 0.18;
              const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.005 * scale, 0.007 * scale, 0.028 * scale, this.seg(12, 7)),
                accent);
              stem.position.set(x, 0.014 * scale, i * 0.004);
              group.add(stem);
              const cap = new THREE.Mesh(
                o.honeycomb
                  ? new THREE.SphereGeometry(0.014 * scale, 6, 5)
                  : new THREE.SphereGeometry(0.016 * scale, this.seg(14, 8), this.seg(9, 5),
                    0, Math.PI * 2, 0, Math.PI / 2),
                capMat);
              cap.scale.y = o.honeycomb ? 1.5 : 0.72;
              cap.position.set(x, 0.028 * scale, i * 0.004);
              group.add(cap);
            }
            break;
          }

          case 'berries': {
            // A handful, heaped: berries, seeds, small fruit.
            const heap = [];
            for (let i = 0; i < (this.wantsTrim() ? 9 : 5); i++) {
              const berry = new THREE.Mesh(
                new THREE.SphereGeometry(o.small ? 0.004 : 0.0055, this.seg(10, 6), this.seg(8, 5)),
                i % 3 === 2 && o.accent !== undefined ? accent : main);
              const a = i * 1.3;
              const rr = i < 3 ? 0.004 : 0.011;
              berry.position.set(Math.cos(a) * rr, (o.small ? 0.004 : 0.0055) + (i < 3 ? 0.006 : 0),
                Math.sin(a) * rr);
              group.add(berry);
              heap.push(berry);
            }
            if (o.stalk) {
              const stalk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, this.seg(6, 4)),
                this._mat(0x5A4A28, { roughness: 0.95, metalness: 0.0 }));
              stalk.rotation.z = Math.PI / 2 - 0.3;
              stalk.position.set(0.02, 0.012, 0);
              group.add(stalk);
            }
            break;
          }

          case 'nuts': {
            // Nuts in and out of their husks, as they come off the ground.
            for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
              const nut = new THREE.Mesh(
                new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)), main);
              nut.scale.set(1, o.tallNut === undefined ? 1.1 : o.tallNut, 0.9);
              const a = i * 1.27;
              const rr = i < 2 ? 0.005 : 0.014;
              nut.position.set(Math.cos(a) * rr, 0.007, Math.sin(a) * rr);
              nut.rotation.set(0.3, a, 0);
              group.add(nut);
              if (o.husk && i < 2) {
                const husk = new THREE.Mesh(
                  new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(7, 4),
                    0, Math.PI * 2, 0, Math.PI / 2), accent);
                husk.rotation.x = Math.PI;
                husk.position.set(Math.cos(a) * rr, 0.011, Math.sin(a) * rr);
                group.add(husk);
              }
            }
            break;
          }

          case 'sheaf': {
            // A bound sheaf: stalks up, heads at the top, tied round the
            // middle.
            for (let i = 0; i < (this.wantsTrim() ? 9 : 5); i++) {
              const a = i * Math.PI * 2 / (this.wantsTrim() ? 9 : 5);
              const lean = 0.12;
              const stalk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0012, 0.0016, 0.1, this.seg(6, 4)), main);
              stalk.position.set(Math.cos(a) * 0.008, 0.05, Math.sin(a) * 0.008);
              stalk.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
              group.add(stalk);
              const head = new THREE.Mesh(
                new THREE.CylinderGeometry(0.003, 0.005, 0.024, this.seg(8, 5)), accent);
              head.position.set(Math.cos(a) * 0.015, 0.108, Math.sin(a) * 0.015);
              head.rotation.set(Math.sin(a) * lean * 2, 0, -Math.cos(a) * lean * 2);
              group.add(head);
            }
            const tie = new THREE.Mesh(
              new THREE.TorusGeometry(0.011, 0.0018, this.seg(5, 3), this.seg(14, 8)),
              this._mat(0xB0A070, { roughness: 1.0, metalness: 0.0 }));
            tie.rotation.x = Math.PI / 2;
            tie.position.y = 0.05;
            group.add(tie);
            break;
          }

          case 'egg': {
            // Eggs in a nest of straw, one propped against the others.
            const straw = this._mat(0xC8B078, { roughness: 1.0, metalness: 0.0 });
            const nest = new THREE.Mesh(
              new THREE.TorusGeometry(0.022, 0.005, this.seg(6, 4), this.seg(16, 9)), straw);
            nest.rotation.x = Math.PI / 2;
            nest.position.y = 0.005;
            group.add(nest);
            for (let i = 0; i < Math.min(count, 3); i++) {
              const egg = new THREE.Mesh(
                new THREE.SphereGeometry(o.big ? 0.014 : 0.012, this.seg(14, 8), this.seg(10, 6)), main);
              egg.scale.y = 1.32;
              const a = i * 2.1;
              egg.position.set(Math.cos(a) * (Math.min(count, 3) === 1 ? 0 : 0.01),
                (o.big ? 0.016 : 0.014), Math.sin(a) * (Math.min(count, 3) === 1 ? 0 : 0.01));
              egg.rotation.z = (i % 2 ? 1 : -1) * 0.25;
              group.add(egg);
            }
            break;
          }

          case 'pail': {
            // A pail of something drawn: milk, water, sap.
            const wood = this._mat(o.ware === undefined ? 0x8A6A42 : o.ware,
              { roughness: 0.95, metalness: 0.02 });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.028, 0.022, 0.05, this.seg(18, 10), 1, true), wood);
            body.material.side = THREE.DoubleSide;
            body.position.y = 0.025;
            group.add(body);
            const base = new THREE.Mesh(
              new THREE.CylinderGeometry(0.022, 0.022, 0.004, this.seg(16, 9)), wood);
            base.position.y = 0.002;
            group.add(base);
            const milk = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0255, 0.0255, 0.002, this.seg(16, 9)),
              this._mat(o.main, { roughness: 0.35, metalness: 0.0 }));
            milk.position.y = 0.04;
            group.add(milk);
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.0265, 0.0016, this.seg(5, 3), this.seg(18, 10)),
              this._steel(0x8A8E94, 0.5));
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.036;
            group.add(band);
            const handle = new THREE.Mesh(
              new THREE.TorusGeometry(0.026, 0.0015, this.seg(5, 3), this.seg(16, 9), Math.PI),
              this._steel(0x8A8E94, 0.5));
            handle.position.y = 0.05;
            group.add(handle);
            break;
          }

          case 'gourd': {
            // A big field vegetable: pumpkin, melon, gourd, coconut. Ribbed
            // where it should be, cut open where the description says it is.
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.032, this.seg(16, 9), this.seg(12, 7)), main);
            body.scale.y = o.squat === false ? 1.0 : 0.78;
            body.position.y = 0.026;
            group.add(body);
            if (o.ribs) {
              for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
                const rib = new THREE.Mesh(
                  new THREE.TorusGeometry(0.031, 0.0022, this.seg(5, 3), this.seg(14, 8), Math.PI),
                  accent);
                rib.rotation.set(Math.PI / 2, 0, 0);
                rib.rotation.y = i * Math.PI / (this.wantsTrim() ? 6 : 3);
                rib.scale.y = 0.78;
                rib.position.y = 0.026;
                group.add(rib);
              }
            }
            if (o.cut) {
              const flesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.031, 0.031, 0.002, this.seg(18, 10)), accent);
              flesh.position.y = 0.05;
              group.add(flesh);
            } else {
              const stalk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.004, 0.005, 0.012, this.seg(8, 5)),
                this._mat(0x5A4A28, { roughness: 0.95, metalness: 0.0 }));
              stalk.position.y = 0.052;
              group.add(stalk);
            }
            break;
          }

          case 'plate':
          default: {
            this._plateOf(group, { ware: o.ware });
            const mound = new THREE.Mesh(
              new THREE.SphereGeometry(0.028, this.seg(14, 8), this.seg(10, 6),
                0, Math.PI * 2, 0, Math.PI / 2), main);
            mound.scale.y = o.tall ? 0.9 : 0.55;
            mound.position.y = 0.005;
            group.add(mound);
            if (this.wantsTrim() && o.accent !== undefined) {
              for (let i = 0; i < count; i++) {
                const bit = new THREE.Mesh(
                  o.bits === 'strand'
                    ? new THREE.CylinderGeometry(0.0018, 0.0018, 0.018, this.seg(6, 4))
                    : new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)),
                  accent);
                const a = i * Math.PI * 2 / count + 0.4;
                bit.position.set(Math.cos(a) * 0.012, 0.016 + (o.tall ? 0.008 : 0), Math.sin(a) * 0.012);
                bit.rotation.set(o.bits === 'strand' ? 1.3 : 0, a, 0.3);
                group.add(bit);
              }
            }
            break;
          }
        }
        return group;
      }
    }
  };

  // One line per served dish: the form it arrives in, the colour of the food,
  // its garnish or filling, the ware it is served on, and how many pieces.
  // Anything wanting a shape no form covers is written out above instead.
  const DISHES = {
    463: { form: 'plate', main: 0xB8A06A, accent: 0xE0C860, ware: 0xE8E8EC, count: 3 },
    464: { form: 'plate', main: 0x9A7A4A, accent: 0x6A8A3A, ware: 0x2A2A32, count: 4, bits: 'blob' },
    465: { form: 'roll', main: 0x6A2A1E, accent: 0x8A3A2A, count: 4 },
    466: { form: 'bowl', main: 0xB08A52, accent: 0xE0C060, level: 0.6, bits: 'blob' },
    467: { form: 'plate', main: 0x5A3A26, accent: 0xF0EAD8, ware: 0xE8E4DC, count: 1, tall: true },
    468: { form: 'bun', main: 0xD8B070, accent: 0xE8C040, ware: 0xE8E4D4, count: 1 },
    469: { form: 'plate', main: 0xF0EAD8, accent: 0xC8A860, ware: 0xE0E4E8, count: 2, tall: true },
    470: { form: 'bun', main: 0xF2F0E8, accent: 0x6A2A3A, count: 3 },
    471: { form: 'wedge', main: 0xD8B878, accent: 0xB02A4A, ware: 0xEFEAE0 },
    472: { form: 'plate', main: 0xF0EDE0, accent: 0xE0C860, ware: 0xDCE8EE, count: 2, tall: true },
    473: { form: 'plate', main: 0xD8B878, accent: 0xB03A2A, ware: 0xEFEAE0, count: 4 },
    474: { form: 'bun', main: 0xC89A5A, accent: 0xC83A2A, ware: 0xE8E4D4, count: 1 },
    475: { form: 'bowl', main: 0xB0301E, accent: 0xC85A2A, ware: 0xE8E4DC, level: 0.6, bits: 'blob' },
    476: { form: 'bowl', main: 0xE0C860, accent: 0x6AC060, ware: 0xEFEAE0, level: 0.65, bits: 'blob' },
    477: { form: 'plate', main: 0xF0ECE0, accent: 0xE0A02A, ware: 0x3A3A44, count: 3 },
    478: { form: 'bun', main: 0xEFE8D8, accent: 0x8A4A2A, ware: 0xC8B89A, count: 2 },
    479: { form: 'roll', main: 0x3A1E1E, accent: 0x5A2A2A, count: 3 },
    480: { form: 'plate', main: 0xC88A2A, accent: 0xF0E4C8, ware: 0xC8CCD2, count: 1, tall: true },
    481: { form: 'bun', main: 0xC89A5A, accent: 0xE0A82A, ware: 0xE8E4D4, count: 1 },
    482: { form: 'bun', main: 0xEFEAD8, accent: 0xC88A5A, ware: 0xC8A870, count: 3 },
    483: { form: 'pastry', main: 0xD8B070, accent: 0xC8A040, ware: 0xEFEAE0, count: 3 },
    484: { form: 'roll', main: 0xE8EFE0, accent: 0x8AC060, count: 4 },
    485: { form: 'bowl', main: 0x8A3A4A, accent: 0xF0ECE0, ware: 0xE8E4DC, level: 0.7, bits: 'blob' },
    486: { form: 'log', main: 0x9A5A32, accent: 0x6A3A22 },
    487: { form: 'plate', main: 0xE0C060, accent: 0x8A3A2A, ware: 0xC8A870, count: 4, tall: true },
    488: { form: 'wedge', main: 0xD8B878, accent: 0xC8A02A, ware: 0xEFEAE0 },
    489: { form: 'bun', main: 0xF2F0E8, accent: 0xC87A5A, ware: 0xC8A870, count: 3 },
    490: { form: 'plate', main: 0xD8A850, accent: 0x6AA83A, ware: 0xEFEAE0, count: 4, bits: 'strand' },
    491: { form: 'plate', main: 0xC89A5A, accent: 0x8A3A2A, ware: 0x3A3A44, count: 3 },
    492: { form: 'plate', main: 0xC8901A, accent: 0xE0B040, ware: 0xE8E4DC, count: 1, tall: true },
    493: { form: 'skewer', main: 0x8A4A2A, accent: 0x6AA83A, count: 5 },
    494: { form: 'bowl', main: 0x8A6A3A, accent: 0xE8E4D4, ware: 0xE8E4DC, level: 0.78, bits: 'blob' },
    495: { form: 'bowl', main: 0xC03A2A, accent: 0xF0EFE8, ware: 0x3A2A28, level: 0.75, bits: 'blob' },
    496: { form: 'log', main: 0x8A5A32, accent: 0x9A4A3A, ware: 0xEFEAE0 },
    497: { form: 'log', main: 0x7A3A2A, accent: 0xE8D8C0 },
    498: { form: 'glass', main: 0x8A4A18, accent: 0xF0EAD8, stem: false },
    499: { form: 'plate', main: 0xC87A2A, accent: 0x6A9A3A, ware: 0xEFEAE0, count: 5 },
    500: { form: 'bucket', main: 0xC89A4A, count: 5 },
    501: { form: 'plate', main: 0xF0EFE8, accent: 0xE06A4A, ware: 0x2A2A32, count: 4 },
    502: { form: 'bowl', main: 0xE8E0C8, accent: 0xC85A3A, ware: 0xE8E4DC, level: 0.75, bits: 'blob' },
    503: { form: 'bowl', main: 0xF0ECE0, accent: 0xC83A2A, ware: 0x3A2A26, level: 0.8, bits: 'blob' },
    504: { form: 'bowl', main: 0xC8502A, accent: 0xE0906A, ware: 0xE8E4DC, level: 0.75, bits: 'blob' },
    505: { form: 'wedge', main: 0xD8B070, accent: 0xC8A458, ware: 0xEFEAE0 },
    506: { form: 'bowl', main: 0xC88A3A, accent: 0xE0C060, ware: 0x9A5A2A, level: 0.8, bits: 'cube' },
    507: { form: 'log', main: 0x6A9A3A, accent: 0xC8B87A, ware: 0xB09A72 },
    508: { form: 'plate', main: 0xF0EFE8, accent: 0xE0704A, ware: 0x2A2A32, count: 3 },
    509: { form: 'bowl', main: 0x7A4A2A, accent: 0xC8A040, ware: 0xC8B89A, level: 0.8, bits: 'cube' },
    510: { form: 'wheel', main: 0xC8A040, accent: 0xF0E8B0 },
    511: { form: 'plate', main: 0xF0E8D0, accent: 0xB07A2A, ware: 0xEFEAE0, count: 1, tall: true },
    512: { form: 'plate', main: 0x6A7A4A, accent: 0x8A8A62, ware: 0x4A4A42, count: 4 },
    513: { form: 'bowl', main: 0x8A4A2A, accent: 0xC8603A, ware: 0xE8E4DC, level: 0.78, bits: 'blob' },
    514: { form: 'log', main: 0x9A5A32, accent: 0x5A2A1A },
    515: { form: 'bowl', main: 0x6A4A2A, accent: 0xC89A4A, ware: 0xC8B89A, level: 0.8, bits: 'cube' },
    516: { form: 'glass', main: 0xB0A040, accent: undefined, stem: false },
    517: { form: 'glass', main: 0xE0B040, accent: 0xF0E8D0, stem: false },
    518: { form: 'plate', main: 0xE8D8A0, accent: 0x9A3A22, ware: 0xEFEAE0, count: 4, bits: 'strand' },
    519: { form: 'plate', main: 0xC89A5A, accent: 0xE0C060, ware: 0xC82A2A, count: 5, tall: true },
    520: { form: 'bowl', main: 0xC8B89A, accent: 0x9A4A3A, ware: 0x3A3A44, level: 0.78, bits: 'blob' },
    521: { form: 'bowl', main: 0x6A3A22, accent: 0xC88A3A, ware: 0xE8E4DC, level: 0.7, bits: 'cube' },
    522: { form: 'bowl', main: 0x7A4A32, accent: 0xC8A860, ware: 0xC8B89A, level: 0.75, bits: 'cube' },
    523: { form: 'log', main: 0xC8C0B0, accent: 0x8A8A72, ware: 0xB09A72 },
    524: { form: 'plate', main: 0xE0906A, accent: 0x8ACC70, ware: 0xEFEAE0, count: 4 },
    525: { form: 'log', main: 0xB06A2A, accent: 0x8A3A1A, ware: 0x3A2A26 },
    526: { form: 'plate', main: 0xC89A5A, accent: 0x7A2A4A, ware: 0xEFEAE0, count: 3, tall: true },
    527: { form: 'plate', main: 0x7A2A2A, accent: 0xC85A3A, ware: 0xEFEAE0, count: 2, tall: true },
    528: { form: 'glass', main: 0x2A1810, accent: 0xB08A5A, stem: false },
    529: { form: 'log', main: 0x6A3A32, accent: 0xE8E4D8 },
    530: { form: 'bowl', main: 0xC86A1A, accent: 0xF0ECE0, ware: 0xE8E4DC, level: 0.78, bits: 'blob' },
    531: { form: 'plate', main: 0xE8D8A0, accent: 0x8A8A5A, ware: 0xEFEAE0, count: 4, bits: 'strand' },
    532: { form: 'plate', main: 0xD8A850, accent: 0xC8C0A0, ware: 0xEFEAE0, count: 5 },
    533: { form: 'log', main: 0xC89A58, accent: 0xE8E0C8 },
    534: { form: 'bowl', main: 0x7A4A2A, accent: 0xC87A2A, ware: 0xC8B89A, level: 0.82, bits: 'cube' },
    535: { form: 'bottle', main: 0x6A1A2A, accent: 0x8A6A4A, ware: 0x2A3A2A },
    536: { form: 'wedge', main: 0xD8B070, accent: 0xC83A2A, ware: 0xEFEAE0 },
    537: { form: 'fruit', main: 0x4A8AE0, accent: 0x3A7A6A, glow: true, facets: true },
    538: { form: 'log', main: 0x8A4A2A, accent: 0x5A2A18 },
    539: { form: 'wedge', main: 0xD8B070, accent: 0x8A4A2A, ware: 0xEFEAE0 },
    540: { form: 'wedge', main: 0xE8DCC0, accent: 0x5A3A22, ware: 0xEFEAE0 },
    541: { form: 'plate', main: 0xE8D8A0, accent: 0xE0C040, ware: 0xEFEAE0, count: 4, bits: 'strand' },
    542: { form: 'wheel', main: 0xB08A3A, accent: 0xE8DCA0 },
    543: { form: 'plate', main: 0x4A2A1A, accent: 0xC8A54A, ware: 0x2A2A32, count: 3 },
    544: { form: 'glass', main: 0xB07A2A, stem: false },
    545: { form: 'bowl', main: 0xE8E0C8, accent: 0x8A6A4A, ware: 0xE8E4DC, level: 0.78, bits: 'blob' },
    546: { form: 'fruit', main: 0x8A9AE0, accent: 0x3A6A4A, glow: true },
    547: { form: 'glass', main: 0x2A1810, accent: 0xC8A54A, stem: false },
    548: { form: 'log', main: 0xE8DCC0, accent: 0xC8A040, ware: 0xC8A54A },
    549: { form: 'wedge', main: 0xE8C878, accent: 0x9A3A22, ware: 0xEFEAE0 },
    550: { form: 'plate', main: 0xC85A4A, accent: 0xF0EFE8, ware: 0xEFEAE0, count: 4 },
    551: { form: 'fruit', main: 0xE0501A, accent: 0x6A3A1A, glow: true, glowStrength: 0.7 },
    552: { form: 'glass', main: 0xE0602A, accent: 0xE0C060 },
    553: { form: 'plate', main: 0x8A5A32, accent: 0xC8A040, ware: 0xEFEAE0, count: 3, tall: true },
    554: { form: 'fruit', main: 0x7A3AC0, accent: 0x3A6A4A, glow: true, tallFruit: 1.2 },
    555: { form: 'fruit', main: 0xC03020, accent: 0x5A7A3A, glow: true, glowStrength: 0.6, wide: 0.8 },
    556: { form: 'fruit', main: 0x2ACFC0, accent: 0x1A4A5A, glow: true, glowStrength: 0.8 },
    557: { form: 'glass', main: 0x7A2A2A, accent: 0xC8A060, stem: false },
    558: { form: 'bowl', main: 0x6AA83A, accent: 0xE060A0, ware: 0xEFEAE0, level: 0.65, bits: 'blob' },
    559: { form: 'fruit', main: 0xE070C0, accent: 0x4A8A5A, glow: true, wide: 0.85 },
    560: { form: 'plate', main: 0xE8A0C0, accent: 0xC86A9A, ware: 0xEFEAE0, count: 4 },
    561: { form: 'fruit', main: 0xE0B02A, accent: 0x8A5A1A, glow: true, glowStrength: 0.8, tallFruit: 1.3 },
    562: { form: 'plate', main: 0x4A2A1A, accent: 0xC8A54A, ware: 0xEFEAE0, count: 1, tall: true },
    563: { form: 'fruit', main: 0x1A2A4A, accent: 0x3A5A3A, glow: true, glowStrength: 0.35, wide: 1.2 },
    564: { form: 'glass', main: 0x2A1810, accent: 0xA88A5A, stem: false },
    565: { form: 'plate', main: 0xC8A878, accent: 0x8A6A4A, ware: 0x3A3A44, count: 4 },
    566: { form: 'fruit', main: 0x1A1A24, accent: 0x2A2A3A, glow: true, glowStrength: 0.3, facets: true },
    567: { form: 'bowl', main: 0xE8E0C8, accent: 0x2A2018, ware: 0x2A2A32, level: 0.78, bits: 'blob' },
    568: { form: 'glass', main: 0x2A1810, accent: 0xC8A54A, stem: false },
    569: { form: 'bowl', main: 0xC87A2A, accent: 0xE0A03A, ware: 0xE8E4DC, level: 0.8, bits: 'blob' },
    570: { form: 'plate', main: 0xC8A08A, accent: 0x8A5A2A, ware: 0x2A2A32, count: 2 },
    571: { form: 'log', main: 0xA85A2A, accent: 0x8A1E2A, ware: 0xEFEAE0 },
    572: { form: 'bottle', main: 0xB07A2A, accent: 0x3A2A1E, ware: 0x3A2A1A },
    573: { form: 'plate', main: 0x8A3A32, accent: 0xE8DCC0, ware: 0x2A2A32, count: 2, tall: true },
    574: { form: 'glass', main: 0xD8E8E0, stem: false },
    575: { form: 'bottle', main: 0xC8901A, accent: 0x8A6A3A, ware: 0xC8B87A },
    576: { form: 'plate', main: 0xC85A3A, accent: 0xE0C860, ware: 0xEFEAE0, count: 3, tall: true },
    577: { form: 'log', main: 0x8A3A2A, accent: 0x5A2A18, ware: 0x2A2A32 },
    578: { form: 'fruit', main: 0x3A2A5A, accent: 0x5A3A2A, glow: true, glowStrength: 0.45 },
    579: { form: 'bowl', main: 0x8A6A3A, accent: 0xC8B89A, ware: 0xC8C0B0, level: 0.82, bits: 'cube' },
    580: { form: 'plate', main: 0xC8C4D0, accent: 0x9AA0B0, ware: 0x2A2A32, count: 2, tall: true },
    581: { form: 'bowl', main: 0x1A1A22, accent: 0x3A3A4A, ware: 0xC8CCD2, level: 0.5, bits: 'blob' },
    582: { form: 'plate', main: 0xE0A02A, accent: 0x6AC060, ware: 0xEFEAE0, count: 5, tall: true },
    583: { form: 'fruit', main: 0xC8A02A, accent: 0x6A8A3A, glow: true, glowStrength: 0.55 },
    584: { form: 'fruit', main: 0x3A6AE0, accent: 0x4A7A4A, glow: true, wide: 0.9 },
    585: { form: 'glass', main: 0x2A1810, accent: 0xB08A5A, stem: false },
    586: { form: 'fruit', main: 0xC050C0, accent: 0x4A8A5A, glow: true, facets: true },
    587: { form: 'bottle', main: 0x6A1A2A, accent: 0xC8A54A, ware: 0x2A3A2A },
    588: { form: 'fruit', main: 0x2AB05A, accent: 0x3A6A2A, glow: true, glowStrength: 0.4, wide: 1.1 },
    589: { form: 'fruit', main: 0xE8E4F0, accent: 0x8AB0C8, glow: true, glowStrength: 0.35, tallFruit: 1.1 },
    590: { form: 'fruit', main: 0x9AE0D0, accent: 0x4A8A7A, glow: true, glowStrength: 0.6, facets: true },
    591: { form: 'fruit', main: 0xE0B02A, accent: 0x6A8A3A },
    592: { form: 'fruit', main: 0xE8DCA0, accent: 0x3A6A3A, glow: true, glowStrength: 0.85, facets: true },
    593: { form: 'log', main: 0xE8D8BC, accent: 0xD8C4A0, ware: 0xB09A72 },
    1726: { form: 'fruit', main: 0xC8302A, accent: 0x3A6A2A, wide: 1.1, tallFruit: 0.85 },
    1727: { form: 'gourd', main: 0x2A6A2A, accent: 0xD8404A, ribs: true, cut: true },
    1728: { form: 'sheaf', main: 0xC8B070, accent: 0xE0C880 },
    1729: { form: 'gourd', main: 0xD8781A, accent: 0xB05A12, ribs: true },
    1730: { form: 'root', main: 0xD8721A, accent: 0x4A8A32, count: 4, dirt: true },
    1731: { form: 'nuts', main: 0xB08A5A, tallNut: 0.85 },
    1732: { form: 'mushroom', main: 0x8A6A42, accent: 0xE0DCC8, count: 2 },
    1733: { form: 'berries', main: 0x4A3A28, accent: 0xC8B89A, small: true },
    1734: { form: 'berries', main: 0xA81E32, accent: 0x3A7A32, stalk: true },
    1735: { form: 'log', main: 0xE0C840, accent: 0x8ABA4A, ware: 0xB09A72 },
    1736: { form: 'leaf', main: 0x8A7AC0, accent: 0x6A7A5A, count: 4 },
    1737: { form: 'fruit', main: 0xD8C8A8, accent: 0x8A9A5A, wide: 1.05, tallFruit: 0.9 },
    1738: { form: 'gourd', main: 0x6A9A4A, accent: 0xC8D8B0, ribs: true },
    1739: { form: 'fruit', main: 0x4A2A5A, accent: 0x3A6A2A, tallFruit: 1.6, wide: 0.8 },
    1740: { form: 'fruit', main: 0xC8A020, accent: 0x3A6A2A, tallFruit: 1.15 },
    1741: { form: 'gourd', main: 0xC8A040, accent: 0x4A7A32, ribs: true, squat: false },
    1742: { form: 'berries', main: 0x4A2A5A, accent: 0x6A4A2A, stalk: true, small: true },
    1743: { form: 'fruit', main: 0xC8503A, accent: 0x6A8A3A, tallFruit: 1.25, wide: 0.85 },
    1744: { form: 'leaf', main: 0x4A8A32, accent: 0x3A6A28, count: 5 },
    1745: { form: 'nuts', main: 0x8A6A32, accent: 0x6A4A28, husk: true },
    1746: { form: 'nuts', main: 0x6A3A1A, accent: 0x8A9A3A, husk: true },
    1747: { form: 'nuts', main: 0xA87A42, accent: 0x8A6A3A, husk: true, tallNut: 0.95 },
    1748: { form: 'leaf', main: 0x3A7A2A, accent: 0xE8E4D0, count: 4 },
    1749: { form: 'leaf', main: 0x6A9A3A, accent: 0x5A7A28, count: 3 },
    1750: { form: 'mushroom', main: 0x8A6A3A, accent: 0xE0DCC0, count: 3, honeycomb: true },
    1751: { form: 'mushroom', main: 0xE0A82A, accent: 0xE8D8A0, count: 3 },
    1752: { form: 'berries', main: 0x1A1A2A, accent: 0x5A2A3A, small: true, stalk: true },
    1753: { form: 'berries', main: 0xC8301A, accent: 0x6A4A28, stalk: true },
    1754: { form: 'berries', main: 0xE8DCC0, accent: 0x8A6A42, small: true },
    1755: { form: 'leaf', main: 0x6AB04A, accent: 0x4A8A32, count: 5 },
    1756: { form: 'leaf', main: 0x5A8A2A, accent: 0x8A9A3A, count: 4 },
    1757: { form: 'berries', main: 0x2A1A2A, accent: 0x8A2A4A },
    1758: { form: 'root', main: 0xE0D8C0, accent: 0x5A8A32, count: 3, dirt: true },
    1759: { form: 'root', main: 0xE0D0B0, accent: 0x8A9A4A, count: 3, dirt: true },
    1760: { form: 'leaf', main: 0x3A6A2A, accent: 0x2A5A22, count: 5 },
    1761: { form: 'berries', main: 0x2A2A5A, accent: 0x4A5A7A, small: true },
    1762: { form: 'berries', main: 0x3A4A6A, accent: 0x6A7A4A, small: true, stalk: true },
    1763: { form: 'leaf', main: 0x7A8A5A, accent: 0x8A7AB0, count: 4 },
    1764: { form: 'gourd', main: 0x6A4A2A, accent: 0xF0EDE0, cut: true },
    1765: { form: 'fruit', main: 0xE08A2A, accent: 0x4A7A32, tallFruit: 1.35, wide: 0.85 },
    1766: { form: 'fruit', main: 0xE0C840, accent: 0x5A7A32, tallFruit: 0.7, wide: 1.5 },
    1767: { form: 'gourd', main: 0xC85A2A, accent: 0x8A3A1A, ribs: true, squat: false },
    1768: { form: 'root', main: 0xF0ECD8, accent: 0x6A8A3A, count: 3 },
    1769: { form: 'berries', main: 0x6A3A1A, accent: 0x8A5A28, stalk: true },
    1770: { form: 'berries', main: 0xC8A860, accent: 0x8A6A3A, small: true, stalk: true },
    1771: { form: 'gourd', main: 0xC8C070, accent: 0xE0DCA0, ribs: true },
    1772: { form: 'root', main: 0xC8A040, accent: 0x8A9A5A, count: 4 },
    1773: { form: 'berries', main: 0xE0A82A, accent: 0xC88A2A, small: true },
    1774: { form: 'berries', main: 0x1A1A22, accent: 0x3A3A4A, small: true },
    1775: { form: 'leaf', main: 0xE0E8E4, accent: 0xC8D0CC, count: 5 },
    1776: { form: 'leaf', main: 0xB0B8B0, accent: 0x9AA298, count: 5 },
    1777: { form: 'root', main: 0xE0D8B8, accent: 0x8A9A5A, count: 3, dirt: true },
    1778: { form: 'leaf', main: 0x3A8A3A, accent: 0x2A6A28, count: 5 },
    1779: { form: 'leaf', main: 0x6ABA7A, accent: 0x4A9A5A, count: 5 },
    1780: { form: 'berries', main: 0x3A6A4A, accent: 0x5A8A5A, small: true, stalk: true },
    1781: { form: 'sheaf', main: 0x5A4A32, accent: 0x3A2A1E },
    1782: { form: 'nuts', main: 0x6A4A2A, accent: 0xE8E0C8, tallNut: 0.8 },
    1783: { form: 'leaf', main: 0x3A5A3A, accent: 0x2A4A2A, count: 3 },
    1784: { form: 'mushroom', main: 0xF0ECE4, accent: 0xE0DCD0, count: 2 },
    1785: { form: 'mushroom', main: 0x8AE0C0, accent: 0xE0E8DC, count: 3, glow: true },
    1786: { form: 'nuts', main: 0x1A1A1E, accent: 0x3A3A38, tallNut: 0.9 },
    1787: { form: 'root', main: 0xE8E4D8, accent: 0xC8C8B8, count: 3 },
    1788: { form: 'mushroom', main: 0x5A4A3A, accent: 0xC8C0B0, count: 3, honeycomb: true },
    1789: { form: 'mushroom', main: 0xE0C82A, accent: 0xC8B020, count: 2 },
    1790: { form: 'leaf', main: 0x6A8A3A, accent: 0x8A8A5A, count: 5 },
    1791: { form: 'egg', main: 0xC8A878, count: 3 },
    1792: { form: 'egg', main: 0xE8EFE4, count: 2, big: true },
    1793: { form: 'pail', main: 0xF4F2EC }
  };

  for (const id of Object.keys(DISHES)) {
    const spec = DISHES[id];
    const name = 'createDish' + id + 'Model';
    family.models[name] = function () { return this._served(spec); };
    family.unique['i' + id] = name;
  }

  window.ItemModelSystem.registerFamily(family);
})();
