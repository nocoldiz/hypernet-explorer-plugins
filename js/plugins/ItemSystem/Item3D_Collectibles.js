//=============================================================================
// Item 3D Models - Collectibles
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the fight memorabilia of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Collectibles
 * ============================================================================
 *
 * One model per entry, keyed by database id. The whole shelf is one
 * collection: things kept from fights. Some are trophies, some are relics,
 * and a few are just what was in the room when it happened (a pipe, a chair).
 * They are built as the object itself rather than in the display case the
 * generic collectible wears, because a case around every one of them would
 * make twenty-four items look like one.
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
    console.error('[Item3D_Collectibles] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Collectibles',

    unique: {
      i311: 'createFightTicketStubsModel',
      i312: 'createKeysKnucklesModel',
      i313: 'createVintageFightPosterModel',
      i314: 'createChampionsToothModel',
      i315: 'createGripPowderModel',
      i316: 'createSwordKeychainModel',
      i317: 'createSteelPipeModel',
      i318: 'createFighterActionFigureModel',
      i319: 'createCornerCutmanKitModel',
      i320: 'createWoodenChairModel',
      i321: 'createStarlitTapeModel',
      i322: 'createFightersMedallionModel',
      i323: 'createTournamentTrophyModel',
      i324: 'createAncientFightingCoinModel',
      i325: 'createFocusBandanaModel',
      i326: 'createSignedGlovesModel',
      i327: 'createHistoricRingCanvasModel',
      i328: 'createChampionshipBeltModel',
      i329: 'createMastersGlovesModel',
      i330: 'createThunderDragonBootsModel',
      i331: 'createAntiqueWeightModel',
      i332: 'createGoldenHandStatueModel',
      i333: 'createHistoricMatchGlovesModel',
      i334: 'createDiamondFistModel'
    },

    models: {
      // ======================================================================
      // Shared plumbing
      // ======================================================================

      /**
       * A boxing glove: a padded fist with a laced cuff. Three entries on this
       * shelf are gloves and they are told apart by leather, wear and what is
       * on them, not by shape.
       */
      _glove(group, o) {
        const hide = this._mat(o.color, { roughness: o.rough === undefined ? 0.7 : o.rough, metalness: 0.03 });
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(14, 8), this.seg(11, 6)), hide);
        fist.scale.set(1, 0.92, 1.15);
        fist.position.set(0, 0.026, 0.008);
        group.add(fist);
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)), hide);
        thumb.scale.z = 1.5;
        thumb.position.set(-0.02, 0.02, 0.014);
        group.add(thumb);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.03, this.seg(14, 8)), hide);
        cuff.rotation.x = Math.PI / 2 - 0.25;
        cuff.position.set(0, 0.028, -0.026);
        group.add(cuff);
        const lace = this._mat(o.lace === undefined ? 0xE8E4D8 : o.lace, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const cross = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0016, 0.0016), lace);
          cross.position.set(0, 0.03 + i * 0.006, -0.036 + i * 0.004);
          cross.rotation.z = (i % 2 ? 1 : -1) * 0.5;
          group.add(cross);
        }
        return group;
      },

      // ======================================================================
      // Kept from the night
      // ======================================================================

      // 311. Fight Ticket Stubs: three torn halves, fanned, the perforated
      // edge still ragged.
      createFightTicketStubsModel(entry, rand) {
        const group = new THREE.Group();
        const inks = [0xC8A54A, 0xC85A4A, 0x4A6AC8];
        for (let i = 0; i < 3; i++) {
          const stub = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0012, 0.024),
            this._mat(0xE8E0C8, { roughness: 0.97, metalness: 0.0 }));
          stub.position.set(i * 0.004, 0.0007 + i * 0.0014, -0.008 + i * 0.008);
          stub.rotation.y = (i - 1) * 0.28;
          group.add(stub);
          if (this.wantsTrim()) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0004, 0.024),
              this._mat(inks[i], { roughness: 0.95, metalness: 0.0 }));
            band.position.set(-0.017 + i * 0.004, 0.0016 + i * 0.0014, -0.008 + i * 0.008);
            band.rotation.y = (i - 1) * 0.28;
            group.add(band);
          }
        }
        return group;
      },

      // 312. Keys Knuckles: a fistful of keys threaded between the fingers,
      // which is what the description means by street fights: a ring, and the
      // keys standing out of it like blades.
      createKeysKnucklesModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x9AA0A8, 0.35);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0018, this.seg(6, 4), this.seg(18, 10)), steel);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.0018;
        group.add(ring);
        for (let i = 0; i < 4; i++) {
          const a = -0.5 + i * 0.33;
          const key = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0015, 0.005), steel);
          key.position.set(0.02 + Math.cos(a) * 0.004, 0.0025 + i * 0.0016, Math.sin(a) * 0.014);
          key.rotation.y = a;
          group.add(key);
          const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.0015, this.seg(10, 6)),
            this._mat([0x2A2A32, 0x8A2A2A, 0x2A4A6A, 0xC8A54A][i], { roughness: 0.7, metalness: 0.3 }));
          bow.rotation.x = Math.PI / 2;
          bow.position.set(0.008 + Math.cos(a) * 0.002, 0.0025 + i * 0.0016, Math.sin(a) * 0.01);
          group.add(bow);
          const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0016, 0.0025),
            this._steel(0x8A9098, 0.4));
          teeth.position.set(0.033 + Math.cos(a) * 0.004, 0.0032 + i * 0.0016, Math.sin(a) * 0.018);
          teeth.rotation.y = a;
          group.add(teeth);
        }
        return group;
      },

      // 313. Vintage Fight Poster: rolled loosely, the printed face showing
      // where the curl opens.
      createVintageFightPosterModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._mat(0xE0D2A8, { roughness: 0.98, metalness: 0.0, side: THREE.DoubleSide });
        const roll = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.11, this.seg(16, 9), 1, true, 0, Math.PI * 1.75), paper);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.02;
        group.add(roll);
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.108, this.seg(14, 8), 1, true, 0, Math.PI * 1.6), paper);
        inner.rotation.set(0, 0, Math.PI / 2);
        inner.rotation.x = 0.6;
        inner.position.y = 0.02;
        group.add(inner);
        if (this.wantsTrim()) {
          const ink = this._mat(0xB02A2A, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 2; i++) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.06 - i * 0.02, 0.0006, 0.006), ink);
            line.position.set(0, 0.041 - i * 0.004, 0.001 + i * 0.006);
            group.add(line);
          }
        }
        return group;
      },

      // 314. Champion's Tooth: one molar with the root still on it, kept on a
      // scrap of felt.
      createChampionsToothModel(entry, rand) {
        const group = new THREE.Group();
        const felt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.002, this.seg(14, 8)),
          this._mat(0x2A2A3A, { roughness: 0.99, metalness: 0.0 }));
        felt.position.y = 0.001;
        group.add(felt);
        const enamel = this._mat(0xEFE8D4, { roughness: 0.35, metalness: 0.05 });
        const crown = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.009, 0.011), enamel);
        crown.position.y = 0.0065;
        group.add(crown);
        for (const s of [-1, 1]) {
          const root = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.012, this.seg(8, 5)),
            this._mat(0xD8CBA8, { roughness: 0.6, metalness: 0.02 }));
          root.position.set(s * 0.003, 0.016, 0);
          root.rotation.z = s * 0.18;
          group.add(root);
        }
        const blood = new THREE.Mesh(new THREE.SphereGeometry(0.002, this.seg(6, 4), this.seg(5, 3)),
          this._mat(0x6A1A1A, { roughness: 0.6, metalness: 0.0 }));
        blood.position.set(0.004, 0.02, 0.002);
        group.add(blood);
        return group;
      },

      // 315. Grip Powder: a chalk block half used, in its open bag.
      createGripPowderModel(entry, rand) {
        const group = new THREE.Group();
        const canvas = this._mat(0xC8BCA0, { roughness: 0.99, metalness: 0.0 });
        const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.03, this.seg(14, 8)), canvas);
        bag.position.y = 0.015;
        group.add(bag);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0016, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x5A4A32, { roughness: 1.0, metalness: 0.0 }));
        cord.rotation.x = Math.PI / 2;
        cord.position.y = 0.027;
        group.add(cord);
        const chalk = this._mat(0xF2F2EE, { roughness: 1.0, metalness: 0.0 });
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, 0.018), chalk);
        block.position.set(0.03, 0.007, 0.004);
        block.rotation.y = 0.3;
        group.add(block);
        const broken = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.007, 0.009), chalk);
        broken.position.set(0.042, 0.0035, -0.012);
        broken.rotation.y = -0.5;
        group.add(broken);
        const dust = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.0008, this.seg(12, 7)), chalk);
        dust.position.set(0.034, 0.0004, -0.004);
        group.add(dust);
        return group;
      },

      // 316. Sword Keychain: a tiny sword on a split ring, the whole thing
      // pot metal.
      createSwordKeychainModel(entry, rand) {
        const group = new THREE.Group();
        const pot = this._mat(0x9AA0A8, { roughness: 0.45, metalness: 0.65 });
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0012, this.seg(5, 3), this.seg(14, 8)), pot);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(-0.026, 0.0012, 0);
        group.add(ring);
        const blade = this._plate([[0, -0.004], [0.03, -0.0025], [0.036, 0], [0.03, 0.0025], [0, 0.004]],
          0.0015, pot);
        blade.rotation.x = -Math.PI / 2;
        blade.position.set(0.006, 0.0008, 0);
        group.add(blade);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.002, 0.014),
          this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.8 }));
        guard.position.set(0.004, 0.0012, 0);
        group.add(guard);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.012, this.seg(8, 5)),
          this._mat(0x3A2A1E, { roughness: 0.9, metalness: 0.02 }));
        grip.rotation.z = Math.PI / 2;
        grip.position.set(-0.004, 0.0012, 0);
        group.add(grip);
        return group;
      },

      // 317. Steel Pipe: a length of scaffold tube, one end burred over from
      // whatever it last hit.
      createSteelPipeModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x8A9098, 0.55);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, this.seg(16, 9)), steel);
        tube.rotation.z = Math.PI / 2;
        tube.position.y = 0.014;
        group.add(tube);
        const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.132, this.seg(14, 8)),
          this._mat(0x2A2E32, { roughness: 0.95, metalness: 0.3 }));
        bore.rotation.z = Math.PI / 2;
        bore.position.y = 0.014;
        group.add(bore);
        const burr = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.006, this.seg(14, 8)),
          this._steel(0x6E747C, 0.7));
        burr.rotation.z = Math.PI / 2;
        burr.position.set(0.064, 0.014, 0);
        burr.scale.y = 0.85;
        group.add(burr);
        const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.03, this.seg(14, 8)),
          this._mat(0x1A1A1E, { roughness: 0.98, metalness: 0.0 }));
        tape.rotation.z = Math.PI / 2;
        tape.position.set(-0.045, 0.014, 0);
        group.add(tape);
        return group;
      },

      // 318. Fighter Action Figure: still on its blister card, arms out.
      createFighterActionFigureModel(entry, rand) {
        const group = new THREE.Group();
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.085, 0.002),
          this._mat(0xC83A2A, { roughness: 0.9, metalness: 0.0 }));
        card.position.y = 0.0425;
        group.add(card);
        const blister = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.065, 0.016),
          this._mat(0xE0EAEE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.3 }));
        blister.position.set(0, 0.045, 0.009);
        group.add(blister);
        const skin = this._mat(0xC89A72, { roughness: 0.7, metalness: 0.0 });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.008), skin);
        torso.position.set(0, 0.05, 0.008);
        group.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)), skin);
        head.position.set(0, 0.064, 0.008);
        group.add(head);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.005, 0.005), skin);
          arm.position.set(s * 0.013, 0.055, 0.008);
          arm.rotation.z = s * 0.4;
          group.add(arm);
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.018, 0.005),
            this._mat(0x2A3A6A, { roughness: 0.8, metalness: 0.0 }));
          leg.position.set(s * 0.004, 0.031, 0.008);
          group.add(leg);
        }
        return group;
      },

      // 319. Corner Cutman Kit: an open tin with an enswell, a swab and a
      // vial of adrenaline in it.
      createCornerCutmanKitModel(entry, rand) {
        const group = new THREE.Group();
        const tin = this._steel(0x8A9098, 0.4);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.045), tin);
        base.position.y = 0.007;
        group.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.045), tin);
        lid.position.set(0, 0.036, -0.03);
        lid.rotation.x = -1.15;
        group.add(lid);
        const enswell = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.014),
          this._steel(0xC0C6CC, 0.2));
        enswell.position.set(-0.018, 0.017, 0);
        group.add(enswell);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.02, this.seg(8, 5)),
          this._steel(0xC0C6CC, 0.2));
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.001, 0.017, 0);
        group.add(handle);
        const swab = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.03, this.seg(8, 5)),
          this._mat(0xE8E4D8, { roughness: 0.98, metalness: 0.0 }));
        swab.rotation.set(0, 0.4, Math.PI / 2);
        swab.position.set(0.014, 0.016, 0.012);
        group.add(swab);
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.016, this.seg(12, 7)),
          this._mat(0xDCE8EE, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.6 }));
        vial.position.set(0.026, 0.022, -0.008);
        group.add(vial);
        return group;
      },

      // 320. Wooden Chair: a plain four-legged chair, which on this shelf is
      // a weapon with a history rather than furniture.
      createWoodenChairModel(entry, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x8A6A42);
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.005, 0.05), wood);
        seat.position.y = 0.05;
        group.add(seat);
        for (const x of [-0.02, 0.02]) {
          for (const z of [-0.02, 0.02]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.005), wood);
            leg.position.set(x, 0.025, z);
            group.add(leg);
          }
        }
        for (const x of [-0.02, 0.02]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.005), wood);
          post.position.set(x, 0.077, -0.02);
          group.add(post);
        }
        for (let i = 0; i < 2; i++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.004), wood);
          slat.position.set(0, 0.078 + i * 0.016, -0.02);
          group.add(slat);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.004, 0.004), wood);
        rail.position.set(0, 0.02, 0.02);
        group.add(rail);
        return group;
      },

      // 321. Starlit Tape: a hand wrap rolled up, the cloth shot through with
      // something that catches light.
      createStarlitTapeModel(entry, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0xDCE0E8, { roughness: 0.95, metalness: 0.02 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.026, this.seg(18, 10)), cloth);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.022;
        group.add(roll);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0015, 0.024), cloth);
        tail.position.set(0.036, 0.0008, 0);
        group.add(tail);
        const glint = this._glow(0xE8F0FF, 0.8);
        for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
          const star = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 5, 4), glint);
          const a = i * 1.3;
          star.position.set(Math.cos(a) * 0.006 + 0.02, 0.022 + Math.sin(a) * 0.018, Math.cos(a * 1.7) * 0.012);
          star.userData.pulse = { freq: 0.8 + i * 0.3, min: 0.2, max: 1.0 };
          group.add(star);
        }
        return group;
      },

      // 322. Fighter's Medallion: a struck disc on a ribbon, laid out flat.
      createFightersMedallionModel(entry, rand) {
        const group = new THREE.Group();
        const ribbon = this._mat(0x2A3A7A, { roughness: 0.9, metalness: 0.02 });
        for (const s of [-1, 1]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.0015, 0.045), ribbon);
          band.position.set(s * 0.012, 0.0008, -0.026);
          band.rotation.y = s * 0.35;
          group.add(band);
        }
        const bronze = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.85 });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.003, this.seg(20, 11)), bronze);
        disc.position.y = 0.0015;
        group.add(disc);
        const relief = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xC8A54A, { roughness: 0.35, metalness: 0.9 }));
        relief.scale.y = 0.35;
        relief.position.y = 0.0035;
        group.add(relief);
        const loop = new THREE.Mesh(
          new THREE.TorusGeometry(0.004, 0.0012, this.seg(5, 3), this.seg(10, 6)), bronze);
        loop.position.set(0, 0.0015, -0.02);
        group.add(loop);
        return group;
      },

      // 323. Tournament Trophy: a small cup on a plinth, local rather than
      // grand, so the cup is thin and the plinth is plastic.
      createTournamentTrophyModel(entry, rand) {
        const group = new THREE.Group();
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.036),
          this._mat(0x2A1E1A, { roughness: 0.6, metalness: 0.1 }));
        plinth.position.y = 0.006;
        group.add(plinth);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0008, 0.012),
          this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.85 }));
        plate.position.set(0, 0.0064, 0.0185);
        plate.rotation.x = Math.PI / 2;
        group.add(plate);
        const gold = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.88 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.018, this.seg(12, 7)), gold);
        stem.position.y = 0.021;
        group.add(stem);
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.008, 0.026, this.seg(16, 9)), gold);
        cup.position.y = 0.043;
        group.add(cup);
        for (const s of [-1, 1]) {
          const handle = new THREE.Mesh(
            new THREE.TorusGeometry(0.007, 0.0015, this.seg(5, 3), this.seg(12, 7), Math.PI), gold);
          handle.rotation.y = Math.PI / 2;
          handle.rotation.z = s > 0 ? 0 : Math.PI;
          handle.position.set(s * 0.015, 0.048, 0);
          group.add(handle);
        }
        return group;
      },

      // 324. Ancient Fighting Coin: a worn bronze coin, off-round and struck
      // with two figures, propped against a second one.
      createAncientFightingCoinModel(entry, rand) {
        const group = new THREE.Group();
        const bronze = this._mat(0x8A7A3A, { roughness: 0.65, metalness: 0.7 });
        const flat = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.0135, 0.0025, 11), bronze);
        flat.position.y = 0.00125;
        flat.rotation.y = 0.3;
        group.add(flat);
        const relief = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.012),
          this._mat(0x9A8A4A, { roughness: 0.6, metalness: 0.7 }));
        relief.position.set(-0.003, 0.0028, 0);
        group.add(relief);
        const second = relief.clone();
        second.position.set(0.004, 0.0028, 0.002);
        second.rotation.y = 0.4;
        group.add(second);
        const leaning = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.0135, 0.0025, 11), bronze);
        leaning.rotation.set(Math.PI / 2 - 0.35, 0.2, 0);
        leaning.position.set(0.02, 0.011, -0.006);
        group.add(leaning);
        return group;
      },

      // 325. Focus Bandana: rolled and knotted, the way it is worn, with the
      // tails hanging off the knot.
      createFocusBandanaModel(entry, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0xB02A2A, { roughness: 0.95, metalness: 0.0 });
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.026, 0.006, this.seg(8, 5), this.seg(20, 11)), cloth);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.006;
        group.add(band);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)), cloth);
        knot.position.set(-0.028, 0.008, 0);
        group.add(knot);
        for (const s of [-1, 1]) {
          const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0016, 0.008), cloth);
          tail.position.set(-0.046, 0.006 + s * 0.002, s * 0.005);
          tail.rotation.y = s * 0.3;
          group.add(tail);
        }
        return group;
      },

      // 326. Signed Gloves: a worn pair, one glove propped on the other, with
      // a signature inked across the cuff.
      createSignedGlovesModel(entry, rand) {
        const group = new THREE.Group();
        this._glove(group, { color: 0xB02A2A, rough: 0.75 });
        const second = new THREE.Group();
        this._glove(second, { color: 0xB02A2A, rough: 0.75 });
        second.position.set(0.05, 0.006, -0.012);
        second.rotation.set(0.2, 0.9, 0.15);
        group.add(second);
        if (this.wantsTrim()) {
          const ink = this._mat(0x14141A, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.01 - i * 0.002, 0.0006, 0.0016), ink);
            stroke.position.set(-0.004 + i * 0.007, 0.038, -0.016);
            stroke.rotation.z = (i % 2 ? 1 : -1) * 0.4;
            group.add(stroke);
          }
        }
        return group;
      },

      // 327. Historic Ring Canvas: a cut square of mat, stained, with the
      // painted ring line still crossing it.
      createHistoricRingCanvasModel(entry, rand) {
        const group = new THREE.Group();
        const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.004, 0.07),
          this._mat(0xD8D2C0, { roughness: 0.99, metalness: 0.0 }));
        canvas.position.y = 0.002;
        group.add(canvas);
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0006, 0.012),
          this._mat(0x2A4A8A, { roughness: 0.95, metalness: 0.0 }));
        line.position.set(0, 0.0043, -0.014);
        group.add(line);
        const stain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.0006, this.seg(14, 8)),
          this._mat(0x8A4A3A, { roughness: 1.0, metalness: 0.0 }));
        stain.position.set(0.016, 0.0043, 0.014);
        stain.scale.z = 0.7;
        group.add(stain);
        const curl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.014),
          this._mat(0xC8C2B0, { roughness: 0.99, metalness: 0.0 }));
        curl.position.set(0, 0.008, 0.032);
        curl.rotation.x = -0.5;
        group.add(curl);
        return group;
      },

      // 328. Championship Belt: the strap laid in a curve with the main plate
      // and two side plates on it.
      createChampionshipBeltModel(entry, rand) {
        const group = new THREE.Group();
        const leather = this._mat(0x2A1A14, { roughness: 0.85, metalness: 0.03 });
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(0.038, 0.006, this.seg(6, 4), this.seg(22, 12), Math.PI * 1.3), leather);
        strap.rotation.x = Math.PI / 2;
        strap.position.y = 0.006;
        group.add(strap);
        const gold = this._mat(0xC8A03A, { roughness: 0.3, metalness: 0.9 });
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, this.seg(20, 11)), gold);
        plate.position.set(0.038, 0.01, 0);
        plate.rotation.x = Math.PI / 2;
        plate.rotation.z = Math.PI / 2;
        plate.scale.z = 0.75;
        group.add(plate);
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0xE0C860, { roughness: 0.3, metalness: 0.9 }));
        globe.scale.x = 0.4;
        globe.position.set(0.041, 0.01, 0);
        group.add(globe);
        for (const s of [-1, 1]) {
          const side = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, this.seg(14, 8)), gold);
          side.rotation.set(Math.PI / 2, 0, Math.PI / 2 + s * 0.9);
          side.position.set(0.02, 0.01, s * 0.032);
          side.scale.z = 0.7;
          group.add(side);
        }
        return group;
      },

      // 329. Master's Gloves: black leather worn to a shine, and the fuse its
      // description promises showing as a seam of light at the wrist.
      createMastersGlovesModel(entry, rand) {
        const group = new THREE.Group();
        this._glove(group, { color: 0x16161A, rough: 0.35, lace: 0xC8A54A });
        const seam = new THREE.Mesh(
          new THREE.TorusGeometry(0.02, 0.0016, this.seg(5, 3), this.seg(16, 9)), this._glow(0xE0A040, 0.7));
        seam.rotation.x = Math.PI / 2 - 0.25;
        seam.position.set(0, 0.028, -0.04);
        seam.userData.pulse = { freq: 0.9, min: 0.35, max: 0.95 };
        group.add(seam);
        return group;
      },

      // 330. Thunder Dragon Boots: high boots with scaled shins and a charge
      // running down the heel.
      createThunderDragonBootsModel(entry, rand) {
        const group = new THREE.Group();
        const hide = this._mat(0x2A3A5A, { roughness: 0.55, metalness: 0.2 });
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.082),
          this._mat(0x1A1A20, { roughness: 0.95, metalness: 0.0 }));
        sole.position.set(0, 0.004, 0.008);
        group.add(sole);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.076), hide);
        foot.position.set(0, 0.02, 0.008);
        group.add(foot);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.06, this.seg(14, 8)), hide);
        shaft.position.set(0, 0.062, -0.014);
        group.add(shaft);
        const scale = this._mat(0x3A5A8A, { roughness: 0.35, metalness: 0.45 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 6), scale);
          plate.position.set(0, 0.045 + i * 0.016, -0.014);
          group.add(plate);
        }
        const bolt = this._plate([[0, 0], [0.005, 0.012], [0.001, 0.012], [0.006, 0.026],
          [-0.005, 0.01], [-0.001, 0.01]], 0.001, this._glow(0xE0D060, 0.8));
        bolt.position.set(0, 0.05, -0.034);
        bolt.userData.pulse = { freq: 1.8, min: 0.3, max: 1.0 };
        group.add(bolt);
        return group;
      },

      // 331. Antique Weight: a stone haltere with a worn grip, the shape a
      // trainer would have used and nobody makes now.
      createAntiqueWeightModel(entry, rand) {
        const group = new THREE.Group();
        const stone = this._mat(0x7A7268, { roughness: 0.9, metalness: 0.04 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.05, this.seg(16, 9)), stone);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.022;
        group.add(body);
        for (const s of [-1, 1]) {
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(12, 7), this.seg(9, 5)), stone);
          lobe.scale.x = 0.75;
          lobe.position.set(s * 0.03, 0.022, 0);
          group.add(lobe);
        }
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, this.seg(14, 8)),
          this._mat(0x6A6258, { roughness: 0.98, metalness: 0.02 }));
        grip.rotation.z = Math.PI / 2;
        grip.position.y = 0.022;
        group.add(grip);
        return group;
      },

      // 332. Golden Hand Statue: a gilt fist on a plinth, cast rather than
      // struck, so the knuckles are soft.
      createGoldenHandStatueModel(entry, rand) {
        const group = new THREE.Group();
        const marble = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.036),
          this._mat(0x2A2A30, { roughness: 0.35, metalness: 0.15 }));
        marble.position.y = 0.007;
        group.add(marble);
        const gold = this._mat(0xC8A03A, { roughness: 0.3, metalness: 0.92 });
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.022, this.seg(14, 8)), gold);
        wrist.position.y = 0.025;
        group.add(wrist);
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(14, 8), this.seg(11, 6)), gold);
        fist.scale.set(1, 0.9, 1.1);
        fist.position.y = 0.05;
        group.add(fist);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)), gold);
            knuckle.position.set(-0.012 + i * 0.008, 0.06, 0.012);
            group.add(knuckle);
          }
          const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)), gold);
          thumb.scale.z = 1.4;
          thumb.position.set(-0.016, 0.048, 0.008);
          group.add(thumb);
        }
        return group;
      },

      // 333. Historic Match Gloves: the real pair, old leather gone brown and
      // cracked, with a museum tag tied to the lace.
      createHistoricMatchGlovesModel(entry, rand) {
        const group = new THREE.Group();
        this._glove(group, { color: 0x7A4A2A, rough: 0.92, lace: 0xC8B89A });
        const tag = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0008, 0.01),
          this._mat(0xE8E0C8, { roughness: 0.98, metalness: 0.0 }));
        tag.position.set(0.016, 0.03, -0.04);
        tag.rotation.set(0.5, 0.4, 0.2);
        group.add(tag);
        const crack = this._mat(0x4A2A18, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0006, 0.0012), crack);
          line.position.set(-0.006 + i * 0.008, 0.04 - i * 0.006, 0.026);
          line.rotation.y = i * 0.6;
          group.add(line);
        }
        return group;
      },

      // 334. Diamond Fist: one large stone cut as a closed hand, standing on
      // a mirrored base so the facets read.
      createDiamondFistModel(entry, rand) {
        const group = new THREE.Group();
        const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.005, this.seg(20, 11)),
          this._steel(0xD0D6DC, 0.08));
        mirror.position.y = 0.0025;
        group.add(mirror);
        const gem = this._mat(0xDCEAF4, {
          roughness: 0.02, metalness: 0.25, transparent: true, opacity: 0.72
        });
        const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02, 0), gem);
        fist.scale.set(1, 0.92, 1.08);
        fist.position.y = 0.024;
        group.add(fist);
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const knuckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), gem);
          knuckle.position.set(-0.011 + i * 0.0075, 0.035, 0.012);
          knuckle.rotation.set(0.4, i * 0.5, 0.2);
          group.add(knuckle);
        }
        const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 5, 4), this._glow(0xFFFFFF, 1.0));
        glint.position.set(0.012, 0.036, 0.012);
        glint.userData.pulse = { freq: 1.5, min: 0.2, max: 1.0 };
        group.add(glint);
        return group;
      }
    }
  });
})();
