//=============================================================================
// Item 3D Models - Artisan
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the artisan goods of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Artisan
 * ============================================================================
 *
 * One model per entry, keyed by database id. Every entry on this shelf is a
 * master's own work in one named trade, so each is built as the object that
 * trade would be proud of: the quill is cut, the compass is boxed in brass and
 * silver, the boots are welted. Nothing here is generic stock, which is why
 * none of it falls back to the fitted case in Item3D_Generic.js.
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
    console.error('[Item3D_Artisan] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Artisan',

    unique: {
      i229: 'createHerbalistsSalveModel',
      i230: 'createScribesQuillModel',
      i231: 'createGloversHandwearModel',
      i232: 'createChefsSpiceBlendModel',
      i233: 'createOpticiansLensModel',
      i234: 'createNavigatorsCompassModel',
      i235: 'createWeaversCloakModel',
      i236: 'createMagiciansFluteModel',
      i237: 'createBlacksmithsFluxModel',
      i238: 'createAlchemistsCatalystModel',
      i239: 'createCobblersBootsModel',
      i240: 'createBotanistsSeedsModel',
      i241: 'createClockmakersTimepieceModel',
      i242: 'createJewelersLoupeModel',
      i243: 'createThrowingKnifeSetModel',
      i245: 'createPaintersPaletteModel',
      i246: 'createLeatherworkersPackModel',
      i247: 'createWoodcarversStaffModel',
      i248: 'createBowyersBowModel',
      i249: 'createAstrolabeModel',
      i250: 'createBladesmithsDaggerModel'
    },

    models: {
      // 229. Herbalist's Salve: a squat clay pot with a waxed cloth lid, a
      // sprig of the herb laid on top.
      createHerbalistsSalveModel(entry, rand) {
        const group = new THREE.Group();
        const clay = this._mat(0x8A6A52, { roughness: 0.85, metalness: 0.02 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.021, 0.03, this.seg(16, 9)), clay);
        body.position.y = 0.015;
        group.add(body);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.006, this.seg(16, 9)),
          this._mat(0xD8CBA8, { roughness: 0.95, metalness: 0.0 }));
        lid.position.y = 0.032;
        group.add(lid);
        const twine = new THREE.Mesh(
          new THREE.TorusGeometry(0.0248, 0.0015, this.seg(5, 3), this.seg(16, 9)),
          this._mat(0x8A7A4A, { roughness: 1.0, metalness: 0.0 }));
        twine.rotation.x = Math.PI / 2;
        twine.position.y = 0.03;
        group.add(twine);
        const green = this._mat(0x3A6A2A, { roughness: 0.92, metalness: 0.0 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0015, 0.026, this.seg(6, 4)), green);
        stem.rotation.z = Math.PI / 2 - 0.3;
        stem.position.set(0.004, 0.037, 0.006);
        group.add(stem);
        for (const s of [-1, 1]) {
          const leaf = this._plate([[0, 0], [0.005, 0.006], [0, 0.015], [-0.005, 0.006]], 0.0008, green);
          leaf.position.set(0.012, 0.038, 0.006 + s * 0.003);
          leaf.rotation.set(-Math.PI / 2, s * 0.6, 0.8);
          group.add(leaf);
        }
        return group;
      },

      // 230. Scribe's Quill: a flight feather cut to a nib, standing in an
      // inkwell with the nib wet.
      createScribesQuillModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0x2A2A34, { roughness: 0.2, metalness: 0.15 });
        const well = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.022, this.seg(16, 9)), glass);
        well.position.y = 0.011;
        group.add(well);
        const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, this.seg(14, 8)),
          this._mat(0x14141A, { roughness: 0.25, metalness: 0.05 }));
        ink.position.y = 0.021;
        group.add(ink);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0022, 0.08, this.seg(8, 5)),
          this._mat(0xF0EFE8, { roughness: 0.7, metalness: 0.0 }));
        shaft.position.set(-0.008, 0.055, 0.004);
        shaft.rotation.z = 0.22;
        group.add(shaft);
        const vane = this._plate([
          [0, 0], [0.008, 0.012], [0.009, 0.04], [0, 0.055], [-0.009, 0.04], [-0.008, 0.012]
        ], 0.001, this._mat(0xE8E8E0, { roughness: 0.9, metalness: 0.0 }));
        vane.position.set(-0.019, 0.07, 0.004);
        vane.rotation.set(0, 0.3, 0.22);
        group.add(vane);
        const nib = new THREE.Mesh(new THREE.ConeGeometry(0.0016, 0.008, this.seg(6, 4)),
          this._mat(0x3A3028, { roughness: 0.6, metalness: 0.1 }));
        nib.rotation.set(0, 0, Math.PI + 0.22);
        nib.position.set(0.002, 0.018, 0.004);
        group.add(nib);
        return group;
      },

      // 231. Glover's Handwear: a pair of fitted gloves, one laid flat and one
      // folded over it at the cuff.
      createGloversHandwearModel(entry, rand) {
        const group = new THREE.Group();
        const kid = this._mat(0x6A4A32, { roughness: 0.75, metalness: 0.02 });
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.05), kid);
        palm.position.set(-0.008, 0.004, 0);
        group.add(palm);
        for (let i = 0; i < 4; i++) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.02), kid);
          finger.position.set(-0.02 + i * 0.008, 0.004, 0.033);
          finger.rotation.y = (i - 1.5) * 0.06;
          group.add(finger);
        }
        const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.006, 0.016), kid);
        thumb.position.set(0.01, 0.004, 0.012);
        thumb.rotation.y = -0.7;
        group.add(thumb);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.014, this.seg(14, 8), 1, true),
          this._mat(0x8A6A48, { roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide }));
        cuff.rotation.x = Math.PI / 2;
        cuff.position.set(-0.008, 0.006, -0.03);
        group.add(cuff);
        const second = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.04), kid);
        second.position.set(0.006, 0.012, -0.004);
        second.rotation.set(0, 0.5, 0.06);
        group.add(second);
        return group;
      },

      // 232. Chef's Spice Blend: a stone mortar of ground blend with the
      // pestle standing in it and whole spices beside it.
      createChefsSpiceBlendModel(entry, rand) {
        const group = new THREE.Group();
        const stone = this._mat(0x5A5A60, { roughness: 0.85, metalness: 0.05 });
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.024, this.seg(18, 10)), stone);
        bowl.position.y = 0.012;
        group.add(bowl);
        const blend = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, this.seg(16, 9)),
          this._mat(0xB0662A, { roughness: 1.0, metalness: 0.0 }));
        blend.position.y = 0.022;
        group.add(blend);
        const pestle = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.045, this.seg(12, 7)), stone);
        pestle.rotation.z = 0.4;
        pestle.position.set(0.008, 0.042, 0);
        group.add(pestle);
        const seed = this._mat(0x7A4A22, { roughness: 0.9, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const pod = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(6, 4), this.seg(5, 3)), seed);
          pod.scale.z = 1.8;
          pod.position.set(-0.036 - i * 0.005, 0.003, -0.006 + i * 0.007);
          pod.rotation.y = i * 0.7;
          group.add(pod);
        }
        return group;
      },

      // 233. Optician's Lens: a ground lens in a brass ring, standing edge-on
      // in a felt-lined holder.
      createOpticiansLensModel(entry, rand) {
        const group = new THREE.Group();
        const felt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.02),
          this._mat(0x2A2A3A, { roughness: 0.99, metalness: 0.0 }));
        felt.position.y = 0.004;
        group.add(felt);
        const brass = this._mat(0xC8A03A, { roughness: 0.32, metalness: 0.88 });
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.021, 0.0028, this.seg(6, 4), this.seg(20, 11)), brass);
        ring.position.y = 0.028;
        group.add(ring);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.021, this.seg(16, 9), this.seg(12, 7)),
          this._mat(0xE0EEF4, {
            roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.32
          }));
        lens.scale.z = 0.2;
        lens.position.y = 0.028;
        group.add(lens);
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.004), brass);
        tab.position.y = 0.009;
        group.add(tab);
        return group;
      },

      // 234. Navigator's Compass: a boxed compass, lid open on its hinge, the
      // card under glass and a silver needle across it.
      createNavigatorsCompassModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.85 });
        const box = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.014, this.seg(20, 11)), brass);
        box.position.y = 0.007;
        group.add(box);
        const card = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.001, this.seg(18, 10)),
          this._mat(0xE8E0C8, { roughness: 0.9, metalness: 0.0 }));
        card.position.y = 0.0145;
        group.add(card);
        const silver = this._steel(0xD0D6DC, 0.2);
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0008, 0.003), silver);
        needle.position.y = 0.0155;
        needle.rotation.y = 0.4;
        group.add(needle);
        const north = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.008, this.seg(6, 4)),
          this._mat(0xB02A2A, { roughness: 0.7, metalness: 0.15 }));
        north.rotation.set(0, 0, -Math.PI / 2);
        north.rotation.y = 0.4;
        north.position.set(0.017, 0.0155, -0.007);
        group.add(north);
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.003, this.seg(8, 5)), silver);
        pivot.position.y = 0.016;
        group.add(pivot);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.004, this.seg(20, 11)), brass);
        lid.position.set(0, 0.036, -0.024);
        lid.rotation.x = -1.15;
        group.add(lid);
        return group;
      },

      // 235. Weaver's Cloak: folded over its own shoulders on a hanger's worth
      // of fabric, the clasp showing at the throat.
      createWeaversCloakModel(entry, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0x3A2A5A, { roughness: 0.92, metalness: 0.03 });
        cloth.side = THREE.DoubleSide;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.085, this.seg(16, 9), 1, true), cloth);
        body.position.y = 0.043;
        group.add(body);
        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(0.019, 0.005, this.seg(6, 4), this.seg(16, 9)),
          this._mat(0x503A72, { roughness: 0.9, metalness: 0.03 }));
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.085;
        group.add(collar);
        const hem = new THREE.Mesh(
          new THREE.TorusGeometry(0.045, 0.0035, this.seg(6, 4), this.seg(18, 10)),
          this._mat(0xC8A54A, { roughness: 0.5, metalness: 0.5 }));
        hem.rotation.x = Math.PI / 2;
        hem.position.y = 0.002;
        group.add(hem);
        const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, this.seg(12, 7)),
          this._mat(0xC8A54A, { roughness: 0.35, metalness: 0.85 }));
        clasp.rotation.x = Math.PI / 2;
        clasp.position.set(0, 0.082, 0.019);
        group.add(clasp);
        return group;
      },

      // 236. Magician's Flute: a turned wooden flute with silver ferrules and
      // its tone holes drilled.
      createMagiciansFluteModel(entry, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x3A2418);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, 0.11, this.seg(14, 8)), wood);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.0085;
        group.add(body);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.0085, 0.02, this.seg(14, 8)), wood);
        head.rotation.z = Math.PI / 2;
        head.position.set(-0.062, 0.0085, 0);
        group.add(head);
        const silver = this._steel(0xD0D6DC, 0.22);
        for (const x of [-0.05, 0.05]) {
          const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0088, 0.0088, 0.006, this.seg(14, 8)), silver);
          ferrule.rotation.z = Math.PI / 2;
          ferrule.position.set(x, 0.0085, 0);
          group.add(ferrule);
        }
        const embouchure = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, this.seg(10, 6)),
          this._mat(0x1A1410, { roughness: 0.95, metalness: 0.0 }));
        embouchure.position.set(-0.056, 0.015, 0);
        group.add(embouchure);
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.004, this.seg(8, 5)),
              this._mat(0x1A1410, { roughness: 0.95, metalness: 0.0 }));
            hole.position.set(-0.02 + i * 0.014, 0.015, 0);
            group.add(hole);
          }
        }
        return group;
      },

      // 237. Blacksmith's Flux: a horn scoop of powdered flux tipped out onto
      // the bench, the powder pale and glassy.
      createBlacksmithsFluxModel(entry, rand) {
        const group = new THREE.Group();
        const horn = this._mat(0x6A4A2A, { roughness: 0.8, metalness: 0.05 });
        const scoop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.008, 0.045, this.seg(14, 8), 1, true), horn);
        scoop.material.side = THREE.DoubleSide;
        scoop.rotation.set(0, 0, Math.PI / 2 - 0.35);
        scoop.position.set(-0.012, 0.014, 0);
        group.add(scoop);
        const powder = this._mat(0xD8D2BC, { roughness: 1.0, metalness: 0.0 });
        const heap = new THREE.Mesh(
          new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          powder);
        heap.scale.y = 0.35;
        heap.position.set(0.02, 0, 0);
        group.add(heap);
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.004, 0), powder);
          lump.position.set(0.034 + i * 0.005, 0.003, -0.008 + i * 0.008);
          lump.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          group.add(lump);
        }
        return group;
      },

      // 238. Alchemist's Catalyst: a stoppered flask of suspended grains that
      // will not settle, with a stirring rod through the stopper.
      createAlchemistsCatalystModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xDCE8E4, {
          roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.35
        });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(14, 8), this.seg(11, 6)), glass);
        body.scale.y = 0.85;
        body.position.y = 0.022;
        group.add(body);
        const brew = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0x3A7A6A, { roughness: 0.3, metalness: 0.0, transparent: true, opacity: 0.55 }));
        brew.scale.y = 0.6;
        brew.position.y = 0.017;
        group.add(brew);
        for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
          const grain = new THREE.Mesh(new THREE.TetrahedronGeometry(0.0022, 0), this._glow(0xE0C860, 0.7));
          const a = rand() * Math.PI * 2;
          grain.position.set(Math.cos(a) * 0.01, 0.014 + rand() * 0.012, Math.sin(a) * 0.01);
          grain.userData.orbit = { radius: 0.01, speed: 0.5 + rand() * 0.5, phase: a };
          group.add(grain);
        }
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.016, this.seg(12, 7)), glass);
        neck.position.y = 0.047;
        group.add(neck);
        const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.0075, 0.01, this.seg(10, 6)),
          this._mat(0x3A2A22, { roughness: 0.9, metalness: 0.02 }));
        stopper.position.y = 0.058;
        group.add(stopper);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.03, this.seg(8, 5)),
          this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6 }));
        rod.position.y = 0.076;
        group.add(rod);
        return group;
      },

      // 239. Cobbler's Boots: one welted boot with the pair's shaft folded
      // behind it, the sole nailed.
      createCobblersBootsModel(entry, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0x5A3A22, { roughness: 0.82, metalness: 0.02 });
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.007, 0.09),
          this._mat(0x2A2018, { roughness: 0.95, metalness: 0.0 }));
        sole.position.set(0, 0.0035, 0.01);
        group.add(sole);
        const welt = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.003, 0.092),
          this._mat(0x3A2A1E, { roughness: 0.9, metalness: 0.0 }));
        welt.position.set(0, 0.0085, 0.01);
        group.add(welt);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.082), leather);
        foot.position.set(0, 0.023, 0.01);
        group.add(foot);
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.017, this.seg(12, 7), this.seg(9, 5)), leather);
        toe.scale.set(1, 0.75, 1.05);
        toe.position.set(0, 0.023, 0.045);
        group.add(toe);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.05, this.seg(14, 8)), leather);
        shaft.position.set(0, 0.055, -0.02);
        group.add(shaft);
        if (this.wantsTrim()) {
          const brass = this._mat(0xB08A3A, { roughness: 0.45, metalness: 0.75 });
          for (let i = 0; i < 3; i++) {
            const eyelet = new THREE.Mesh(
              new THREE.TorusGeometry(0.002, 0.0006, this.seg(5, 3), this.seg(8, 5)), brass);
            eyelet.rotation.x = Math.PI / 2;
            eyelet.position.set(0.012, 0.05 + i * 0.011, -0.004);
            group.add(eyelet);
          }
        }
        return group;
      },

      // 240. Botanist's Seed Collection: a pouch of labelled paper twists,
      // spilled open so the twists show.
      createBotanistsSeedsModel(entry, rand) {
        const group = new THREE.Group();
        const canvas = this._mat(0x8A7A56, { roughness: 0.98, metalness: 0.0 });
        const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(12, 7), this.seg(9, 5)), canvas);
        pouch.scale.set(1, 0.85, 0.8);
        pouch.position.set(-0.01, 0.02, 0);
        group.add(pouch);
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.018, 0.016, this.seg(12, 7)), canvas);
        throat.rotation.set(0, 0, -0.9);
        throat.position.set(0.012, 0.03, 0);
        group.add(throat);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.011, 0.0015, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x5A4A2A, { roughness: 1.0, metalness: 0.0 }));
        cord.rotation.set(0, 0, -0.9 + Math.PI / 2);
        cord.position.set(0.01, 0.028, 0);
        group.add(cord);
        const paper = this._mat(0xE8E0C8, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const twist = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, this.seg(8, 5)), paper);
          twist.rotation.set(0, i * 0.8, Math.PI / 2 - 0.2 - i * 0.3);
          twist.position.set(0.034 + i * 0.004, 0.006 + i * 0.006, -0.008 + i * 0.01);
          group.add(twist);
        }
        return group;
      },

      // 241. Clockmaker's Timepiece: a hunter pocket watch, case open on its
      // hinge, the movement showing through the back.
      createClockmakersTimepieceModel(entry, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
        const caseM = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, this.seg(20, 11)), gold);
        caseM.position.y = 0.004;
        group.add(caseM);
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.001, this.seg(18, 10)),
          this._mat(0xF0ECE0, { roughness: 0.35, metalness: 0.05 }));
        dial.position.y = 0.0085;
        group.add(dial);
        const hand = this._mat(0x1A1A20, { roughness: 0.5, metalness: 0.3 });
        const hour = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0006, 0.0014), hand);
        hour.position.set(0.005, 0.0092, 0);
        group.add(hour);
        const minute = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.0006, 0.015), hand);
        minute.position.set(0, 0.0092, -0.0075);
        group.add(minute);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.003, this.seg(20, 11)), gold);
        lid.position.set(0, 0.03, -0.02);
        lid.rotation.x = -1.2;
        group.add(lid);
        const bow = new THREE.Mesh(
          new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(12, 7)), gold);
        bow.position.set(0.026, 0.004, 0);
        group.add(bow);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, this.seg(10, 6)), gold);
        crown.rotation.z = Math.PI / 2;
        crown.position.set(0.0235, 0.004, 0);
        group.add(crown);
        return group;
      },

      // 242. Jeweler's Loupe: a folding loupe, the lens barrel swung out of
      // its shell.
      createJewelersLoupeModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x8A9098, 0.35);
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.01, 0.03), steel);
        shell.position.y = 0.005;
        group.add(shell);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.018, this.seg(16, 9)),
          this._mat(0x1E1E24, { roughness: 0.5, metalness: 0.2 }));
        barrel.rotation.set(0, 0, Math.PI / 2 - 0.5);
        barrel.position.set(0.022, 0.014, 0);
        group.add(barrel);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(16, 9)),
          this._mat(0xDCE8EE, {
            roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.4
          }));
        lens.rotation.set(0, 0, Math.PI / 2 - 0.5);
        lens.position.set(0.03, 0.019, 0);
        group.add(lens);
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.03, this.seg(8, 5)), steel);
        hinge.rotation.x = Math.PI / 2;
        hinge.position.set(0.012, 0.005, 0);
        group.add(hinge);
        return group;
      },

      // 243. Artisan's Throwing Knife Set: three knives fanned out of a rolled
      // leather sheath.
      createThrowingKnifeSetModel(entry, rand) {
        const group = new THREE.Group();
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, this.seg(14, 8)),
          this._mat(0x4A2E1B, { roughness: 0.92, metalness: 0.02 }));
        roll.rotation.z = Math.PI / 2;
        roll.position.set(-0.03, 0.014, 0);
        group.add(roll);
        const steel = this._steel(0xC0C6CC, 0.22);
        for (let i = 0; i < 3; i++) {
          const blade = this._plate([
            [0, -0.005], [0.05, -0.002], [0.058, 0], [0.05, 0.002], [0, 0.005]
          ], 0.0016, steel);
          blade.rotation.x = -Math.PI / 2;
          blade.rotation.z = (i - 1) * 0.28;
          blade.position.set(-0.014, 0.002 + i * 0.0022, (i - 1) * 0.012);
          group.add(blade);
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.007),
            this._mat(0x2A2A30, { roughness: 0.85, metalness: 0.05 }));
          grip.position.set(-0.022, 0.002 + i * 0.0022, (i - 1) * 0.014);
          grip.rotation.y = (i - 1) * 0.28;
          group.add(grip);
        }
        return group;
      },

      // 245. Painter's Arcane Palette: a thumb-hole palette with pigments
      // that light their own puddles, and two brushes across it.
      createPaintersPaletteModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._plate([
          [-0.04, -0.026], [0.02, -0.03], [0.042, -0.006], [0.03, 0.026], [-0.02, 0.03], [-0.044, 0.008]
        ], 0.003, this._wood(0x8A6A42));
        board.rotation.x = -Math.PI / 2;
        board.position.y = 0.0015;
        group.add(board);
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.005, this.seg(12, 7)),
          this._mat(0x2A2018, { roughness: 0.95, metalness: 0.0 }));
        hole.position.set(-0.028, 0.0015, 0.008);
        group.add(hole);
        const hues = [0xE03A6A, 0x3AE0A0, 0x6A50E0, 0xE0C040];
        for (let i = 0; i < hues.length; i++) {
          const blob = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)),
            this._glow(hues[i], 0.45));
          blob.scale.y = 0.35;
          const a = i * Math.PI * 2 / hues.length + 0.4;
          blob.position.set(0.006 + Math.cos(a) * 0.018, 0.004, Math.sin(a) * 0.016);
          group.add(blob);
        }
        for (let i = 0; i < 2; i++) {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, 0.055, this.seg(8, 5)),
            this._wood(0x5A3A22));
          handle.rotation.set(0, 0.4 + i * 0.5, Math.PI / 2);
          handle.position.set(-0.006 + i * 0.004, 0.008, -0.014 + i * 0.008);
          group.add(handle);
          const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.01, this.seg(8, 5)),
            this._mat(0x3A2A22, { roughness: 0.95, metalness: 0.0 }));
          bristle.rotation.set(0, 0.4 + i * 0.5, -Math.PI / 2);
          bristle.position.set(0.026 + i * 0.002, 0.008, -0.026 + i * 0.006);
          group.add(bristle);
        }
        return group;
      },

      // 246. Leatherworker's Travel Pack: a slim satchel with one flap lifted
      // to show the hidden pocket behind it.
      createLeatherworkersPackModel(entry, rand) {
        const group = new THREE.Group();
        this._pack(group, { color: 0x6A4630, w: 0.07, h: 0.058, d: 0.026, strap: 0x3A2418 });
        const secret = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, 0.004),
          this._mat(0x2A1A12, { roughness: 0.95, metalness: 0.0 }));
        secret.position.set(-0.016, 0.03, -0.015);
        group.add(secret);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.001, 0.026),
          this._mat(0x6A4630, { roughness: 0.92, metalness: 0.02 }));
        flap.position.set(-0.016, 0.046, -0.024);
        flap.rotation.x = -0.9;
        group.add(flap);
        const stitch = this._mat(0xC8B078, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.0008), stitch);
          st.position.set(-0.028 + i * 0.014, 0.012, 0.0132);
          group.add(st);
        }
        return group;
      },

      // 247. Woodcarver's Staff: a carved stave with a knotwork head, stood
      // upright the way a staff is leaned.
      createWoodcarversStaffModel(entry, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x6A4A2A);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.13, this.seg(12, 7)), wood);
        shaft.position.y = 0.065;
        group.add(shaft);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(12, 7), this.seg(9, 5)),
          this._wood(0x8A6A3A));
        head.position.y = 0.136;
        group.add(head);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const knot = new THREE.Mesh(
              new THREE.TorusGeometry(0.011, 0.0022, this.seg(5, 3), this.seg(12, 7)), wood);
            knot.rotation.set(0.5 + i * 0.6, i * 0.8, 0);
            knot.position.y = 0.136;
            group.add(knot);
          }
          for (let i = 0; i < 4; i++) {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.0095, 0.0012, this.seg(5, 3), this.seg(12, 7)), wood);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.03 + i * 0.024;
            group.add(band);
          }
        }
        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.008, this.seg(12, 7)),
          this._steel(0x8A8E94, 0.5));
        ferrule.position.y = 0.004;
        group.add(ferrule);
        return group;
      },

      // 248. Bowyer's Bow: a self bow of one stave, strung and standing on
      // its lower limb.
      createBowyersBowModel(entry, rand) {
        const group = new THREE.Group();
        const yew = this._wood(0xC8A870);
        const seg = this.seg(9, 5);
        // The stave as a shallow arc of short sections, so it reads as a bent
        // limb rather than a stick.
        for (let i = 0; i < seg; i++) {
          const t = i / (seg - 1);
          const y = 0.008 + t * 0.125;
          const bend = Math.sin(t * Math.PI) * 0.024;
          const piece = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.019, 0.011), yew);
          piece.position.set(bend, y, 0);
          piece.rotation.z = -Math.cos(t * Math.PI) * 0.34;
          group.add(piece);
        }
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.026, this.seg(10, 6)),
          this._mat(0x3A2A1E, { roughness: 0.95, metalness: 0.0 }));
        grip.position.set(0.024, 0.07, 0);
        group.add(grip);
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.128, this.seg(6, 4)),
          this._mat(0xE0D8C0, { roughness: 0.85, metalness: 0.0 }));
        string.position.set(0.0035, 0.072, 0);
        group.add(string);
        return group;
      },

      // 249. Astronomer's Astrolabe: nested brass rings on a stand, the rete
      // and the alidade across the face.
      createAstrolabeModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.33, metalness: 0.88 });
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.006, this.seg(16, 9)), brass);
        foot.position.y = 0.003;
        group.add(foot);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.022, this.seg(8, 5)), brass);
        post.position.y = 0.016;
        group.add(post);
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.002, this.seg(24, 12)), brass);
        plate.position.y = 0.055;
        group.add(plate);
        const limb = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.0032, this.seg(6, 4), this.seg(24, 12)), brass);
        limb.position.y = 0.055;
        group.add(limb);
        const rete = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0018, this.seg(5, 3), this.seg(18, 10)), brass);
        rete.position.y = 0.058;
        rete.userData.spin = { axis: 'z', speed: 0.25 };
        group.add(rete);
        const alidade = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.0015, 0.004), brass);
        alidade.position.y = 0.06;
        alidade.rotation.z = 0.4;
        group.add(alidade);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.006, 0.0015, this.seg(5, 3), this.seg(12, 7)), brass);
        ring.position.y = 0.09;
        group.add(ring);
        return group;
      },

      // 250. Bladesmith's Dagger: a short blade with a fullered spine and an
      // ornate grip, laid flat with its sheath beside it.
      createBladesmithsDaggerModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xC0C6CC, 0.2);
        const blade = this._plate([
          [0, -0.008], [0.05, -0.005], [0.062, 0], [0.05, 0.005], [0, 0.008]
        ], 0.003, steel);
        blade.rotation.x = -Math.PI / 2;
        blade.position.set(0.014, 0.0015, 0);
        group.add(blade);
        const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0008, 0.002),
          this._steel(0x9AA0A8, 0.35));
        fuller.position.set(0.03, 0.0032, 0);
        group.add(fuller);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.024),
          this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 }));
        guard.position.set(0.012, 0.0025, 0);
        group.add(guard);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, this.seg(10, 6)),
          this._mat(0x3A2418, { roughness: 0.9, metalness: 0.02 }));
        grip.rotation.z = Math.PI / 2;
        grip.position.set(-0.006, 0.0025, 0);
        group.add(grip);
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 }));
        pommel.position.set(-0.024, 0.0025, 0);
        group.add(pommel);
        const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.018),
          this._mat(0x4A2E1B, { roughness: 0.92, metalness: 0.02 }));
        sheath.position.set(0.016, 0.003, 0.024);
        group.add(sheath);
        return group;
      }
    }
  });
})();
