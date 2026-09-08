//=============================================================================
// Item 3D Models - Counterfeits
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the counterfeit goods of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Counterfeits
 * ============================================================================
 *
 * One model per entry, keyed by database id. Every item on this shelf is a
 * fake of something real, and each is built so the fake shows: the moulding
 * seam is left on, the gilt is paint, the crystal ball has a bubble in it, the
 * phoenix feather is a dyed goose quill. The joke only lands if the model
 * says it before the description does, so nothing here is built well.
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
    console.error('[Item3D_Counterfeits] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Counterfeits',

    unique: {
      i346: 'createUselessCharmModel',
      i347: 'createNotSoMagicBeanModel',
      i348: 'createToyMagicWandModel',
      i349: 'createMundaneGlowingStoneModel',
      i350: 'createFakeTransmutationPowderModel',
      i351: 'createFoolsAlchemyDustModel',
      i352: 'createFakeCrystalBallModel',
      i353: 'createDragonsBelchPotionModel',
      i354: 'createFakeTreasureMapModel',
      i355: 'createCounterfeitPhoenixFeatherModel',
      i356: 'createMildTranslucenceModel',
      i357: 'createNonFlyingCapeModel',
      i358: 'createMildTintingModel',
      i359: 'createEmptyDemonContainerModel',
      i360: 'createFakeDragonEggModel',
      i361: 'createRingOfMinorAcousticsModel',
      i362: 'createFalseImmortalityModel'
    },

    models: {
      // ======================================================================
      // Shared tells
      // ======================================================================

      /**
       * The mark of a fake: a moulding seam running up the piece, and a price
       * sticker somebody forgot to peel off. Half the shelf carries both.
       */
      _tells(group, o) {
        if (!this.wantsTrim()) return group;
        const seam = new THREE.Mesh(
          new THREE.BoxGeometry(0.0012, o.h || 0.03, 0.0012),
          this._mat(o.seam === undefined ? 0xB0B0B8 : o.seam, { roughness: 0.9, metalness: 0.05 }));
        seam.position.set(o.x || 0, o.y || 0.02, (o.r || 0.012));
        group.add(seam);
        const sticker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.005, 0.0006, this.seg(12, 7)),
          this._mat(0xE0C82A, { roughness: 0.92, metalness: 0.0 }));
        sticker.rotation.x = Math.PI / 2;
        sticker.position.set((o.x || 0) + 0.008, (o.y || 0.02) - 0.008, (o.r || 0.012) + 0.0008);
        group.add(sticker);
        return group;
      },

      /** A cheap potion bottle: thick moulded glass, a coloured cordial and a
       *  plastic screw cap. Four of the fakes are sold in one of these. */
      _cheapPotion(group, rand, o) {
        this._vessel(group, rand, {
          r: 0.016, h: 0.055, neck: 0.01, color: 0xC8D4D0, roughness: 0.35, opacity: 0.7,
          fill: o.fill, fillLevel: 0.6, capColor: o.cap === undefined ? 0xC83A6A : o.cap
        });
        this._label(group, rand, 0.016, 0.026, 0.026, o.label === undefined ? 0xF0E8D0 : o.label);
        return this._tells(group, { h: 0.05, y: 0.028, r: 0.0162 });
      },

      // ======================================================================
      // The shelf
      // ======================================================================

      // 346. Useless Charm: a stamped tin disc on a string, the "silver"
      // rubbing off at the edge.
      createUselessCharmModel(entry, rand) {
        const group = new THREE.Group();
        const string = new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.0012, this.seg(5, 3), this.seg(18, 10)),
          this._mat(0x8A7A5A, { roughness: 1.0, metalness: 0.0 }));
        string.rotation.x = Math.PI / 2;
        string.position.y = 0.0012;
        group.add(string);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.0018, this.seg(16, 9)),
          this._mat(0xB0B4B8, { roughness: 0.6, metalness: 0.45 }));
        disc.position.set(0.004, 0.0009, 0.012);
        group.add(disc);
        const worn = new THREE.Mesh(
          new THREE.TorusGeometry(0.013, 0.0009, this.seg(5, 3), this.seg(16, 9)),
          this._mat(0x8A7A62, { roughness: 0.95, metalness: 0.2 }));
        worn.rotation.x = Math.PI / 2;
        worn.position.set(0.004, 0.0009, 0.012);
        group.add(worn);
        const stamp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0006, 5),
          this._mat(0x9AA0A6, { roughness: 0.7, metalness: 0.35 }));
        stamp.position.set(0.004, 0.0021, 0.012);
        group.add(stamp);
        return group;
      },

      // 347. Not-So-Magic Bean: one ordinary bean in a velvet pouch that cost
      // more than the bean.
      createNotSoMagicBeanModel(entry, rand) {
        const group = new THREE.Group();
        const velvet = this._mat(0x3A2A5A, { roughness: 0.99, metalness: 0.0 });
        const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(12, 7), this.seg(9, 5)), velvet);
        pouch.scale.set(1, 0.85, 0.85);
        pouch.position.set(-0.012, 0.015, 0);
        group.add(pouch);
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.014, this.seg(12, 7)), velvet);
        throat.position.set(-0.012, 0.032, 0);
        group.add(throat);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.009, 0.0014, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0xC8A54A, { roughness: 0.7, metalness: 0.3 }));
        cord.rotation.x = Math.PI / 2;
        cord.position.set(-0.012, 0.032, 0);
        group.add(cord);
        const bean = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xB08A5A, { roughness: 0.85, metalness: 0.0 }));
        bean.scale.set(1.5, 0.85, 1);
        bean.position.set(0.022, 0.0042, 0.004);
        group.add(bean);
        return group;
      },

      // 348. Toy Magic Wand: a plastic star on a stick, with the battery
      // window that makes the sparkles and the music.
      createToyMagicWandModel(entry, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(0xE050A0, { roughness: 0.35, metalness: 0.1 });
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.08, this.seg(12, 7)), plastic);
        stick.rotation.z = Math.PI / 2;
        stick.position.y = 0.006;
        group.add(stick);
        const star = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 5),
          this._mat(0xE0C82A, { roughness: 0.3, metalness: 0.25 }));
        star.rotation.set(Math.PI / 2, 0, 0.3);
        star.position.set(0.056, 0.012, 0);
        group.add(star);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._glow(0xFFF0A0, 0.8));
        bulb.position.set(0.056, 0.012, 0.004);
        bulb.userData.pulse = { freq: 2.4, min: 0.15, max: 1.0 };
        group.add(bulb);
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.008),
          this._mat(0xC03A88, { roughness: 0.6, metalness: 0.05 }));
        hatch.position.set(-0.03, 0.01, 0);
        group.add(hatch);
        return this._tells(group, { h: 0.02, x: 0.056, y: 0.012, r: 0.018, seam: 0xF080C0 });
      },

      // 349. Mundane Glowing Stone: a rock with a glow patch stuck to it,
      // peeling at one corner.
      createMundaneGlowingStoneModel(entry, rand) {
        const group = new THREE.Group();
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.021, 0),
          this._mat(0x6A6A72, { roughness: 0.95, metalness: 0.03 }));
        rock.scale.set(1, 0.8, 0.9);
        rock.position.y = 0.017;
        group.add(rock);
        const patch = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.001, this.seg(14, 8)),
          this._mat(0x9AE0A0, {
            roughness: 0.7, metalness: 0.0, emissive: 0x3A8A4A, emissiveIntensity: 0.35
          }));
        patch.rotation.set(1.2, 0, 0.3);
        patch.position.set(0.006, 0.03, 0.012);
        group.add(patch);
        const peel = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0008, 0.006),
          this._mat(0x8AC090, { roughness: 0.8, metalness: 0.0 }));
        peel.position.set(0.014, 0.032, 0.016);
        peel.rotation.set(0.8, 0.4, 0.5);
        group.add(peel);
        return group;
      },

      // 350. Fake Transmutation Powder: a paper sachet of flour, the corner
      // torn and the "powder" white and dull.
      createFakeTransmutationPowderModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._mat(0xE8DFC8, { roughness: 0.98, metalness: 0.0 });
        const sachet = this._plate([
          [-0.02, 0], [0.02, 0], [0.02, 0.042], [0.006, 0.05], [-0.02, 0.05]
        ], 0.008, paper);
        sachet.position.z = 0.004;
        group.add(sachet);
        const print = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.001),
          this._mat(0x8A2A6A, { roughness: 0.95, metalness: 0.0 }));
        print.position.set(0, 0.03, 0.0082);
        group.add(print);
        const flour = this._mat(0xF2F0E8, { roughness: 1.0, metalness: 0.0 });
        const spill = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.0012, this.seg(12, 7)), flour);
        spill.position.set(0.024, 0.0006, 0.004);
        group.add(spill);
        return group;
      },

      // 351. Fool's Alchemy Dust: glitter, in a jar, with the plastic flakes
      // large enough to see.
      createFoolsAlchemyDustModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.017, h: 0.045, neck: 0.005, color: 0xDCE8EE, roughness: 0.15, opacity: 0.5,
          fill: 0xC8A02A, fillLevel: 0.45, capColor: 0x2A2A32
        });
        const flake = this._mat(0xE0C860, { roughness: 0.2, metalness: 0.8 });
        for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
          const bit = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0004, 0.0022), flake);
          const a = i * 1.3;
          bit.position.set(Math.cos(a) * 0.009, 0.012 + i * 0.004, Math.sin(a) * 0.009);
          bit.rotation.set(a, a * 0.7, 0);
          group.add(bit);
        }
        return this._tells(group, { h: 0.04, y: 0.024, r: 0.0172 });
      },

      // 352. Fake Crystal Ball: resin, not crystal, with a casting bubble
      // trapped off centre and a plastic claw stand.
      createFakeCrystalBallModel(entry, rand) {
        const group = new THREE.Group();
        const stand = this._mat(0x3A2A1E, { roughness: 0.55, metalness: 0.15 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.008, this.seg(14, 8)), stand);
        base.position.y = 0.004;
        group.add(base);
        for (let i = 0; i < 3; i++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, this.seg(6, 4)), stand);
          const a = i * Math.PI * 2 / 3;
          claw.position.set(Math.cos(a) * 0.014, 0.014, Math.sin(a) * 0.014);
          claw.rotation.set(-0.35, 0, -Math.cos(a) * 0.35);
          group.add(claw);
        }
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(16, 9), this.seg(12, 7)),
          this._mat(0xDCE4E8, {
            roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.6
          }));
        ball.position.y = 0.034;
        group.add(ball);
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xF0F4F6, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5 }));
        bubble.position.set(0.008, 0.04, 0.004);
        group.add(bubble);
        return group;
      },

      // 353. Dragon's Belch Potion: a fizzy drink in a swing-top bottle, the
      // bubbles rising and nothing else happening.
      createDragonsBelchPotionModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0x6A5A2A, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.65 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.058, this.seg(16, 9)), glass);
        body.position.y = 0.029;
        group.add(body);
        const pop = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.04, this.seg(14, 8)),
          this._mat(0xC8802A, { roughness: 0.3, metalness: 0.0 }));
        pop.position.y = 0.022;
        group.add(pop);
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 5, 4),
            this._mat(0xF0E0B0, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6 }));
          bubble.position.set((i - 1.5) * 0.005, 0.016 + i * 0.008, 0.004);
          bubble.userData.bob = { amp: 0.006, freq: 1.2 + i * 0.3 };
          group.add(bubble);
        }
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.016, 0.018, this.seg(14, 8)), glass);
        neck.position.y = 0.067;
        group.add(neck);
        const swing = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, this.seg(12, 7)),
          this._mat(0xE8E4DC, { roughness: 0.6, metalness: 0.05 }));
        swing.position.y = 0.08;
        group.add(swing);
        const wire = new THREE.Mesh(
          new THREE.TorusGeometry(0.011, 0.0008, this.seg(5, 3), this.seg(12, 7)),
          this._steel(0x9AA0A8, 0.4));
        wire.rotation.y = Math.PI / 2;
        wire.position.y = 0.072;
        group.add(wire);
        return group;
      },

      // 354. Fake Treasure Map: new paper aged with tea, the burn marks even
      // and the X drawn in biro.
      createFakeTreasureMapModel(entry, rand) {
        const group = new THREE.Group();
        this._foldedMap(group, { paper: 0xD8C49A, ink: 0x3A2A1E, mark: 0x2A2AC8, w: 0.082, d: 0.058 });
        const scorch = this._mat(0x6A4A2A, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0008, 0.004), scorch);
          edge.position.set(-0.03 + i * 0.02, 0.003, 0.029);
          group.add(edge);
        }
        const biro = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0005, 0.0016),
          this._mat(0x2A2AC8, { roughness: 0.95, metalness: 0.0 }));
        biro.position.set(0.018, 0.006, -0.012);
        biro.rotation.y = 0.8;
        group.add(biro);
        const cross = biro.clone();
        cross.rotation.y = -0.8;
        group.add(cross);
        return group;
      },

      // 355. Counterfeit Phoenix Feather: a goose quill dyed orange, the dye
      // uneven and the quill end still white.
      createCounterfeitPhoenixFeatherModel(entry, rand) {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0022, 0.09, this.seg(8, 5)),
          this._mat(0xF0EFE8, { roughness: 0.7, metalness: 0.0 }));
        shaft.rotation.z = Math.PI / 2 - 0.15;
        shaft.position.set(0, 0.007, 0);
        group.add(shaft);
        const dyed = this._mat(0xE07A2A, { roughness: 0.9, metalness: 0.0 });
        const vane = this._plate([
          [0, 0], [0.012, 0.014], [0.014, 0.05], [0, 0.066], [-0.014, 0.05], [-0.012, 0.014]
        ], 0.001, dyed);
        vane.rotation.set(-Math.PI / 2, 0, 0.15);
        vane.position.set(0.012, 0.008, 0);
        group.add(vane);
        const patchy = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0006, 0.01),
          this._mat(0xE8C89A, { roughness: 0.95, metalness: 0.0 }));
        patchy.position.set(0.03, 0.0092, 0.006);
        patchy.rotation.y = 0.3;
        group.add(patchy);
        return group;
      },

      // 356. Potion of Mild Translucence: a cheap potion of watery grey. Its
      // twin, the tinting one, is the same bottle in a different colour, which
      // is the joke.
      createMildTranslucenceModel(entry, rand) {
        return this._cheapPotion(new THREE.Group(), rand, { fill: 0xC8CCD0, cap: 0x9AA0A8, label: 0xEFEFEA });
      },

      // 358. Potion of Mild Tinting.
      createMildTintingModel(entry, rand) {
        return this._cheapPotion(new THREE.Group(), rand, { fill: 0xC85A9A, cap: 0x8A2A6A, label: 0xF0E0EC });
      },

      // 362. False Immortality: the same bottle again, gold-capped and priced
      // like the real thing.
      createFalseImmortalityModel(entry, rand) {
        const group = new THREE.Group();
        this._cheapPotion(group, rand, { fill: 0xE0C860, cap: 0xC8A54A, label: 0xF4EEDC });
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0008, this.seg(12, 7)),
          this._mat(0xB02A2A, { roughness: 0.9, metalness: 0.0 }));
        seal.rotation.x = Math.PI / 2;
        seal.position.set(0, 0.04, 0.0168);
        group.add(seal);
        return group;
      },

      // 357. Non-Flying Cape: folded on itself, the "silk" a shiny synthetic
      // with a crooked hem.
      createNonFlyingCapeModel(entry, rand) {
        const group = new THREE.Group();
        const synth = this._mat(0x8A1E3A, { roughness: 0.35, metalness: 0.15 });
        synth.side = THREE.DoubleSide;
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.05), synth);
        fold.position.y = 0.008;
        group.add(fold);
        const over = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.012, 0.046), synth);
        over.position.set(0.004, 0.022, -0.003);
        over.rotation.z = 0.06;
        group.add(over);
        const hem = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.002, 0.006),
          this._mat(0xC8A54A, { roughness: 0.5, metalness: 0.4 }));
        hem.position.set(0, 0.028, 0.02);
        hem.rotation.z = 0.04;
        group.add(hem);
        const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, this.seg(12, 7)),
          this._mat(0xB0B4B8, { roughness: 0.55, metalness: 0.5 }));
        clasp.rotation.x = Math.PI / 2;
        clasp.position.set(-0.024, 0.03, 0.006);
        group.add(clasp);
        return group;
      },

      // 359. Empty Demon Container: a lacquered box with the lid off and
      // nothing inside but foam packing.
      createEmptyDemonContainerModel(entry, rand) {
        const group = new THREE.Group();
        const lacquer = this._mat(0x1A1420, { roughness: 0.3, metalness: 0.2 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), lacquer);
        box.position.y = 0.015;
        group.add(box);
        const foam = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.006, 0.034),
          this._mat(0xD8D8DC, { roughness: 0.99, metalness: 0.0 }));
        foam.position.y = 0.027;
        group.add(foam);
        const hollow = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xC0C0C6, { roughness: 0.99, metalness: 0.0 }));
        hollow.scale.y = 0.4;
        hollow.position.y = 0.03;
        group.add(hollow);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.006, 0.042), lacquer);
        lid.position.set(0.038, 0.02, 0.01);
        lid.rotation.set(0.2, 0.5, 1.2);
        group.add(lid);
        const sigil = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.0006, 6),
          this._mat(0xB02A2A, { roughness: 0.85, metalness: 0.05 }));
        sigil.rotation.set(0.2, 0.5, 1.2);
        sigil.position.set(0.041, 0.02, 0.012);
        group.add(sigil);
        return group;
      },

      // 360. Fake Dragon Egg: painted plaster with the mould seam left on and
      // a chip out of it showing white underneath.
      createFakeDragonEggModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0x3A6A4A, { roughness: 0.6, metalness: 0.15 });
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(16, 9), this.seg(12, 7)), shell);
        egg.scale.y = 1.35;
        egg.position.y = 0.035;
        group.add(egg);
        const nest = new THREE.Mesh(
          new THREE.TorusGeometry(0.024, 0.006, this.seg(6, 4), this.seg(16, 9)),
          this._mat(0x8A6A3A, { roughness: 1.0, metalness: 0.0 }));
        nest.rotation.x = Math.PI / 2;
        nest.position.y = 0.006;
        group.add(nest);
        const chip = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)),
          this._mat(0xE8E4DC, { roughness: 0.95, metalness: 0.0 }));
        chip.scale.z = 0.4;
        chip.position.set(0.012, 0.048, 0.02);
        group.add(chip);
        return this._tells(group, { h: 0.06, y: 0.035, r: 0.0262, seam: 0x5A8A6A });
      },

      // 361. Ring of Minor Acoustics: a plated band with a tiny buzzer under
      // the stone, and the plating already going green.
      createRingOfMinorAcousticsModel(entry, rand) {
        const group = new THREE.Group();
        const plate = this._mat(0xC8A54A, { roughness: 0.5, metalness: 0.6 });
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.0028, this.seg(8, 5), this.seg(20, 11)), plate);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.0028;
        group.add(band);
        const verdigris = new THREE.Mesh(
          new THREE.TorusGeometry(0.012, 0.0022, this.seg(5, 3), this.seg(10, 6), Math.PI * 0.7),
          this._mat(0x4A8A6A, { roughness: 0.95, metalness: 0.2 }));
        verdigris.rotation.x = Math.PI / 2;
        verdigris.position.y = 0.0028;
        group.add(verdigris);
        const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.005, 0.004, this.seg(12, 7)), plate);
        bezel.position.set(0, 0.006, -0.012);
        group.add(bezel);
        const stone = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x8A3A9A, { roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.8 }));
        stone.scale.y = 0.55;
        stone.position.set(0, 0.0085, -0.012);
        group.add(stone);
        const buzzer = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, this.seg(10, 6)),
          this._mat(0x2A2A32, { roughness: 0.8, metalness: 0.2 }));
        buzzer.position.set(0, 0.0045, -0.012);
        group.add(buzzer);
        return group;
      }
    }
  });
})();
