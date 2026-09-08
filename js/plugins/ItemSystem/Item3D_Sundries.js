//=============================================================================
// Item 3D Models - Sundries
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the last four item shelves: Misc, Survival,
 * Trash and Homeopathy. Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Sundries
 * ============================================================================
 *
 * What is left over once every other shelf has been modelled:
 *
 *   Misc         the drawer nothing else claimed: a pet rock, a newspaper, a
 *                flashbang, four sperm samples and a skeleton key
 *   Survival     the kit that goes in a pack
 *   Trash        food gone over and gear worn out
 *   Homeopathy   eight remedies that are the same bottle of water, which is
 *                the joke, so they share one builder and differ by the label
 *
 * The homeopathy shelf is the only place here where one model serves many:
 * every one of those remedies is water in a dropper bottle, and pretending
 * otherwise would be a lie about what they are. Everything else on these
 * shelves is genuinely its own object and is built as one.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone, are built in metres and stand on the X/Z plane.
 * The shared construction library of WeaponSystemProcedural and the helpers of
 * Item3D_Generic and Item3D_Diseases (_printedLabel) are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Sundries] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Sundries',
    unique: {},
    categories: {
      Misc: 'createMiscModel',
      Survival: 'createSurvivalKitModel',
      Trash: 'createTrashPieceModel',
      Homeopathy: 'createRemedyModel'
    },
    models: {
      // ======================================================================
      // Homeopathy: one bottle of water, eight labels
      // ======================================================================

      /**
       * Every remedy on this shelf is the same 30C dilution in the same amber
       * dropper bottle. What is bought is the label, so the label is what the
       * model differs by.
       */
      createRemedyModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0x6A4A18, {
          roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.8
        });
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, 0.05, this.seg(16, 9)), glass);
        body.position.y = 0.025;
        group.add(body);
        // Water. There is nothing else in it.
        const water = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, this.seg(14, 8)),
          this._mat(0xE0EEF4, { roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.5 }));
        water.position.y = 0.018;
        group.add(water);
        const shoulder = new THREE.Mesh(
          new THREE.CylinderGeometry(0.007, 0.012, 0.01, this.seg(14, 8)), glass);
        body.position.y = 0.025;
        shoulder.position.y = 0.055;
        group.add(shoulder);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, this.seg(12, 7)),
          this._mat(0x1A1A1E, { roughness: 0.7, metalness: 0.05 }));
        cap.position.y = 0.066;
        group.add(cap);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.007, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x2A2A30, { roughness: 0.9, metalness: 0.0 }));
        bulb.scale.y = 1.3;
        bulb.position.y = 0.081;
        group.add(bulb);

        const texture = this._printedLabel
          ? this._printedLabel(String((entry && entry.name) || ''),
            { paper: '#F4F1E6', ink: '#2A3A5A' })
          : null;
        const labelMat = this._mat(0xF4F1E6, {
          roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
        });
        if (texture) labelMat.map = texture;
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0133, 0.0133, 0.026, this.seg(18, 10), 1, true,
            -Math.PI * 0.8, Math.PI * 1.6),
          labelMat);
        label.position.y = 0.024;
        group.add(label);
        return group;
      },

      // ======================================================================
      // Shared plumbing for the rest
      // ======================================================================

      /** A coil of rope, laid down. */
      _coil(group, colour, thickness, glow) {
        const cord = glow ? this._glow(colour, 0.4)
          : this._mat(colour, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const loop = new THREE.Mesh(
            new THREE.TorusGeometry(0.026 - i * 0.005, thickness, this.seg(7, 4), this.seg(20, 11)), cord);
          loop.rotation.x = Math.PI / 2;
          loop.position.y = thickness + i * thickness * 1.7;
          group.add(loop);
        }
        const end = new THREE.Mesh(
          new THREE.CylinderGeometry(thickness, thickness, 0.03, this.seg(8, 5)), cord);
        end.rotation.z = Math.PI / 2;
        end.position.set(0.034, thickness, 0.012);
        group.add(end);
        return group;
      },

      /** A rounded stone: a whetstone, a pet rock, a gastrolith. */
      _stone(group, colour, o) {
        const stone = new THREE.Mesh(
          new THREE.DodecahedronGeometry(o && o.size ? o.size : 0.02, 0),
          this._mat(colour, { roughness: (o && o.rough) || 0.9, metalness: 0.04 }));
        stone.scale.set(1.25, 0.65, 0.9);
        stone.position.y = (o && o.size ? o.size : 0.02) * 0.62;
        group.add(stone);
        return stone;
      },

      // ======================================================================
      // Survival
      // ======================================================================

      createSurvivalKitModel(entry, rand) {
        const id = entry && entry.id;
        const group = new THREE.Group();
        switch (id) {
          case 804: {   // Plastic Bowl Set: stacked single-use bowls
            for (let i = 0; i < 3; i++) {
              const bowl = new THREE.Mesh(
                new THREE.CylinderGeometry(0.032 - i * 0.001, 0.022, 0.014, this.seg(18, 10), 1, true),
                this._mat([0xE8E4DC, 0xE0C860, 0x8AC0E0][i], { roughness: 0.4, metalness: 0.0 }));
              bowl.material.side = THREE.DoubleSide;
              bowl.position.y = 0.008 + i * 0.005;
              group.add(bowl);
            }
            return group;
          }
          case 805: {   // Empty Flask: leather over metal, cap on a chain
            const leather = this._mat(0x5A3A22, { roughness: 0.95, metalness: 0.0 });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.026, 0.024, 0.055, this.seg(16, 9)), leather);
            body.scale.z = 0.5;
            body.position.y = 0.028;
            group.add(body);
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.026, 0.0025, this.seg(6, 4), this.seg(18, 10)),
              this._steel(0x9AA0A8, 0.45));
            band.rotation.x = Math.PI / 2;
            band.scale.z = 0.5;
            band.position.y = 0.03;
            group.add(band);
            const neck = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.011, 0.012, this.seg(12, 7)), leather);
            neck.position.y = 0.061;
            group.add(neck);
            const cap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0085, 0.0085, 0.008, this.seg(12, 7)),
              this._steel(0x8A8E94, 0.4));
            cap.position.y = 0.071;
            group.add(cap);
            return group;
          }
          case 806: {   // Walking Stick: a knotted stave worn smooth at the grip
            const wood = this._wood(0x7A5632);
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.011, 0.135, this.seg(12, 7)), wood);
            shaft.position.y = 0.068;
            shaft.rotation.z = 0.04;
            group.add(shaft);
            const grip = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0095, 0.0095, 0.03, this.seg(12, 7)),
              this._mat(0x3A2A1E, { roughness: 0.95, metalness: 0.0 }));
            grip.position.y = 0.122;
            group.add(grip);
            for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
              const knot = new THREE.Mesh(
                new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), wood);
              knot.scale.set(1, 0.6, 1);
              knot.position.set(0.008, 0.04 + i * 0.028, 0);
              group.add(knot);
            }
            const ferrule = new THREE.Mesh(
              new THREE.CylinderGeometry(0.011, 0.009, 0.008, this.seg(12, 7)),
              this._steel(0x8A8E94, 0.5));
            ferrule.position.y = 0.004;
            group.add(ferrule);
            return group;
          }
          case 807: {   // Cooking Pot: a blackened pot on its bail
            const iron = this._mat(0x2A2A2E, { roughness: 0.85, metalness: 0.35 });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.03, 0.026, 0.032, this.seg(18, 10), 1, true), iron);
            body.material.side = THREE.DoubleSide;
            body.position.y = 0.016;
            group.add(body);
            const base = new THREE.Mesh(
              new THREE.CylinderGeometry(0.026, 0.026, 0.004, this.seg(16, 9)), iron);
            base.position.y = 0.002;
            group.add(base);
            const rim = new THREE.Mesh(
              new THREE.TorusGeometry(0.03, 0.0025, this.seg(6, 4), this.seg(18, 10)), iron);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.032;
            group.add(rim);
            const bail = new THREE.Mesh(
              new THREE.TorusGeometry(0.03, 0.0018, this.seg(5, 3), this.seg(18, 10), Math.PI),
              this._steel(0x6A6E74, 0.55));
            bail.position.y = 0.032;
            group.add(bail);
            return group;
          }
          case 808: {   // Escape kit: a taped bundle with a token and a card
            const tape = this._mat(0x8A7A3A, { roughness: 0.95, metalness: 0.05 });
            const bundle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.035), tape);
            bundle.position.y = 0.01;
            group.add(bundle);
            const token = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.002, this.seg(16, 9)),
              this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.85 }));
            token.rotation.x = Math.PI / 2;
            token.position.set(-0.014, 0.021, 0.008);
            group.add(token);
            const card = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.001, 0.018),
              this._mat(0xE8E4D4, { roughness: 0.95, metalness: 0.0 }));
            card.position.set(0.012, 0.0205, -0.004);
            card.rotation.y = 0.3;
            group.add(card);
            return group;
          }
          case 809: {   // Utensil Set: spork, knife and a tin cup
            const steel = this._steel(0xC0C6CC, 0.28);
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.007), steel);
            handle.position.set(-0.004, 0.001, -0.012);
            group.add(handle);
            const bowl = new THREE.Mesh(
              new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2),
              steel);
            bowl.rotation.x = Math.PI;
            bowl.scale.y = 0.45;
            bowl.position.set(-0.032, 0.0025, -0.012);
            group.add(bowl);
            const knife = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.006), steel);
            knife.position.set(0.002, 0.001, 0.002);
            knife.rotation.y = 0.12;
            group.add(knife);
            const cup = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.013, 0.024, this.seg(16, 9), 1, true), steel);
            cup.material.side = THREE.DoubleSide;
            cup.position.set(0.03, 0.012, 0.018);
            group.add(cup);
            return group;
          }
          case 810:     // Elven Rope: lighter, and it holds a little light
            return this._coil(group, 0xD8E0C8, 0.0035, true);
          case 813:     // Climbing Rope: hemp, thicker, no light at all
            return this._coil(group, 0xB09A6A, 0.0045, false);
          case 811: {   // Whetstone: a worn block with a dished face
            this._stone(group, 0x7A7A72, { size: 0.019, rough: 0.98 });
            const dish = new THREE.Mesh(
              new THREE.SphereGeometry(0.013, this.seg(12, 7), this.seg(8, 5)),
              this._mat(0x5A5A54, { roughness: 1.0, metalness: 0.02 }));
            dish.scale.set(1.4, 0.2, 0.7);
            dish.position.y = 0.014;
            group.add(dish);
            return group;
          }
          case 816: {   // Bladesmith's Eternal Whetstone: the same block, cut
            //             true, banded in steel and never wearing down.
            this._stone(group, 0x4A4A52, { size: 0.02, rough: 0.55 });
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.021, 0.0022, this.seg(6, 4), this.seg(18, 10)),
              this._steel(0xC0C6CC, 0.25));
            band.rotation.x = Math.PI / 2;
            band.scale.set(1.25, 1, 0.9);
            band.position.y = 0.013;
            group.add(band);
            const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0012, 0.0025),
              this._glow(0x9AD8E8, 0.45));
            edge.position.y = 0.026;
            group.add(edge);
            return group;
          }
          case 812: {   // Fairy Lantern: a glass lantern with a fairy in it
            const frame = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.8 });
            const base = new THREE.Mesh(
              new THREE.CylinderGeometry(0.018, 0.02, 0.006, this.seg(14, 8)), frame);
            base.position.y = 0.003;
            group.add(base);
            const glass = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.016, 0.038, this.seg(16, 9), 1, true),
              this._mat(0xE0EEF0, {
                roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.28,
                side: THREE.DoubleSide
              }));
            glass.position.y = 0.026;
            group.add(glass);
            const fairy = new THREE.Mesh(
              new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
              this._glow(0xE0F0A0, 0.95));
            fairy.position.y = 0.026;
            fairy.userData.bob = { amp: 0.006, freq: 1.3 };
            fairy.userData.pulse = { freq: 2.1, min: 0.5, max: 1.0 };
            group.add(fairy);
            for (let i = 0; i < (this.wantsTrim() ? 2 : 1); i++) {
              const wing = this._plate([[0, 0], [0.006, 0.005], [0.004, 0.012], [-0.002, 0.008]],
                0.0006, this._glow(0xF0F8D0, 0.5));
              wing.position.set((i ? 0.004 : -0.004), 0.03, 0);
              wing.rotation.set(0.3, i ? 0.6 : -0.6, i ? 0.4 : -0.4);
              group.add(wing);
            }
            const cap = new THREE.Mesh(
              new THREE.ConeGeometry(0.019, 0.01, this.seg(12, 7)), frame);
            cap.position.y = 0.05;
            group.add(cap);
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(12, 7)), frame);
            ring.position.y = 0.059;
            group.add(ring);
            return group;
          }
          case 814:     // Multi-tool: the same folding tool the tool rack has
            return this.createMultiToolModel(entry, rand);
          case 815: {   // Comfort Sleeping Bag: rolled thick, strapped twice
            const quilt = this._mat(0x2A4A6A, { roughness: 0.98, metalness: 0.0 });
            const roll = new THREE.Mesh(
              new THREE.CylinderGeometry(0.032, 0.032, 0.09, this.seg(18, 10)), quilt);
            roll.rotation.z = Math.PI / 2;
            roll.position.y = 0.032;
            group.add(roll);
            const lining = new THREE.Mesh(
              new THREE.CylinderGeometry(0.026, 0.026, 0.092, this.seg(16, 9)),
              this._mat(0xC8B89A, { roughness: 0.99, metalness: 0.0 }));
            lining.rotation.z = Math.PI / 2;
            lining.position.y = 0.032;
            group.add(lining);
            const strap = this._mat(0x1A1A20, { roughness: 0.95, metalness: 0.0 });
            for (const x of [-0.026, 0.026]) {
              const band = new THREE.Mesh(
                new THREE.TorusGeometry(0.0325, 0.0028, this.seg(6, 4), this.seg(16, 9)), strap);
              band.rotation.y = Math.PI / 2;
              band.position.set(x, 0.032, 0);
              group.add(band);
            }
            return group;
          }
          default:
            return this.createSurvivalItemModel(entry, rand);
        }
      },

      // ======================================================================
      // Trash
      // ======================================================================

      createTrashPieceModel(entry, rand) {
        const id = entry && entry.id;
        const group = new THREE.Group();
        const mould = this._mat(0x5A7A4A, { roughness: 1.0, metalness: 0.0 });
        const spotted = (host, count, r) => {
          if (!this.wantsTrim()) return;
          for (let i = 0; i < count; i++) {
            const spot = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 6, 4), mould);
            const a = i * 1.6;
            spot.position.set(Math.cos(a) * r, host, Math.sin(a) * r * 0.7);
            spot.scale.y = 0.5;
            group.add(spot);
          }
        };
        switch (id) {
          case 828: {   // Expired Cheese: a wedge gone blue at the cut
            const wedge = this._plate([[0, 0], [0.05, 0.018], [0.05, -0.018]], 0.022,
              this._mat(0xE0C860, { roughness: 0.85, metalness: 0.0 }));
            wedge.rotation.x = -Math.PI / 2;
            wedge.position.set(-0.018, 0.011, 0);
            group.add(wedge);
            spotted(0.024, 4, 0.014);
            return group;
          }
          case 829: {   // Sprouting Potato: eyes gone to shoots
            const spud = new THREE.Mesh(
              new THREE.SphereGeometry(0.022, this.seg(12, 7), this.seg(9, 5)),
              this._mat(0xB09A6A, { roughness: 0.98, metalness: 0.0 }));
            spud.scale.set(1.3, 0.85, 0.95);
            spud.position.y = 0.019;
            group.add(spud);
            for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
              const shoot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0012, 0.002, 0.018, this.seg(6, 4)),
                this._mat(0xC8C8A0, { roughness: 0.95, metalness: 0.0 }));
              const a = i * 2.1;
              shoot.position.set(Math.cos(a) * 0.014, 0.03, Math.sin(a) * 0.01);
              shoot.rotation.set(0.4, a, Math.cos(a) * 0.5);
              group.add(shoot);
            }
            return group;
          }
          case 830:     // Leftover Gruel: the generic slop, and rightly so
          case 831: {   // Moldy Risotto: the same bowl, greener and furred
            this._bowl(group, {
              ware: 0xD8D2C4,
              fill: id === 831 ? 0x8A9A5A : 0xB0A88A,
              level: 0.6, gloss: 0.35, bits: 'blob',
              bitColor: id === 831 ? 0x6A8A4A : 0xA09878
            });
            spotted(0.024, id === 831 ? 5 : 2, 0.016);
            return group;
          }
          case 832: {   // Used Hand Wraps: unrolled, grey, sweat-stiffened
            const cloth = this._mat(0xB0AA9A, { roughness: 1.0, metalness: 0.0 });
            const roll = new THREE.Mesh(
              new THREE.CylinderGeometry(0.018, 0.018, 0.022, this.seg(16, 9)), cloth);
            roll.rotation.z = Math.PI / 2;
            roll.position.y = 0.018;
            group.add(roll);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.02), cloth);
            tail.position.set(0.034, 0.001, 0.006);
            tail.rotation.y = 0.25;
            group.add(tail);
            const stain = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.0008, this.seg(10, 6)),
              this._mat(0x8A7A5A, { roughness: 1.0, metalness: 0.0 }));
            stain.position.set(0.03, 0.0022, 0.004);
            group.add(stain);
            return group;
          }
          case 833: {   // Cracked Mouthguard: moulded, split across
            const gum = this._mat(0xC85A6A, {
              roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.85
            });
            const arch = new THREE.Mesh(
              new THREE.TorusGeometry(0.017, 0.005, this.seg(8, 5), this.seg(16, 9), Math.PI * 1.15), gum);
            arch.rotation.x = Math.PI / 2;
            arch.position.y = 0.006;
            group.add(arch);
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.008, 0.01),
              this._mat(0x8A2A3A, { roughness: 0.8, metalness: 0.0 }));
            crack.position.set(-0.016, 0.006, 0.006);
            crack.rotation.y = 0.5;
            group.add(crack);
            return group;
          }
          case 834: {   // Torn Gloves: a split pair, one on the other
            this._glove(group, { color: 0x6A3A32, rough: 0.95, lace: 0xB0A488 });
            const tear = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0018, 0.004),
              this._mat(0xE0C8B0, { roughness: 1.0, metalness: 0.0 }));
            tear.position.set(0.006, 0.036, 0.02);
            tear.rotation.z = 0.5;
            group.add(tear);
            const stuffing = new THREE.Mesh(
              new THREE.SphereGeometry(0.004, this.seg(8, 5), this.seg(6, 4)),
              this._mat(0xE8E4D8, { roughness: 1.0, metalness: 0.0 }));
            stuffing.position.set(0.008, 0.04, 0.021);
            group.add(stuffing);
            return group;
          }
          case 835: {   // Old Gym Nameplate: dented brass, screw holes empty
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.002, 0.022),
              this._mat(0xA88A4A, { roughness: 0.7, metalness: 0.6 }));
            plate.position.y = 0.001;
            plate.rotation.y = 0.08;
            group.add(plate);
            const engraved = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.0006, 0.004),
              this._mat(0x6A5A2A, { roughness: 0.9, metalness: 0.4 }));
            engraved.position.y = 0.0022;
            engraved.rotation.y = 0.08;
            group.add(engraved);
            for (const x of [-0.024, 0.024]) {
              const hole = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, this.seg(8, 5)),
                this._mat(0x3A3028, { roughness: 0.9, metalness: 0.3 }));
              hole.position.set(x, 0.001, 0);
              group.add(hole);
            }
            const dent = new THREE.Mesh(
              new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)),
              this._mat(0x8A7038, { roughness: 0.75, metalness: 0.55 }));
            dent.scale.y = 0.25;
            dent.position.set(0.012, 0.0018, 0.004);
            group.add(dent);
            return group;
          }
          case 836:
          default:      // Rubbish: exactly that
            return this.createTrashItemModel(entry, rand);
        }
      },

      // ======================================================================
      // Misc: the drawer nothing else claimed
      // ======================================================================

      /** The sample tube four of these entries share, colour-coded per donor. */
      _sampleTube(group, colour) {
        const glass = this._mat(0xDCE8EA, {
          roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4
        });
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.009, 0.009, 0.042, this.seg(14, 8)), glass);
        tube.position.y = 0.021;
        group.add(tube);
        const nose = new THREE.Mesh(
          new THREE.ConeGeometry(0.009, 0.012, this.seg(12, 7)), glass);
        nose.rotation.x = Math.PI;
        nose.position.y = 0.006;
        group.add(nose);
        const contents = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0078, 0.0078, 0.016, this.seg(12, 7)),
          this._mat(colour, { roughness: 0.3, metalness: 0.0 }));
        contents.position.y = 0.014;
        group.add(contents);
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, this.seg(12, 7)),
          this._mat(colour, { roughness: 0.7, metalness: 0.05 }));
        cap.position.y = 0.046;
        group.add(cap);
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.018),
          this._mat(0x2A3A44, { roughness: 0.7, metalness: 0.1 }));
        rack.position.y = 0.003;
        group.add(rack);
        return group;
      },

      /** The training programme three of these entries share: a boxed course. */
      _course(group, colour, band) {
        const box = this._mat(colour, { roughness: 0.8, metalness: 0.05 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.05, 0.03), box);
        body.position.y = 0.025;
        group.add(body);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.012, 0.0305),
          this._mat(band, { roughness: 0.85, metalness: 0.02 }));
        stripe.position.y = 0.018;
        group.add(stripe);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.02),
          this._mat(0x2A2A32, { roughness: 0.5, metalness: 0.15 }));
        tape.position.set(0.036, 0.004, 0.006);
        tape.rotation.y = 0.4;
        group.add(tape);
        return group;
      },

      /** The injector three of the enhancement entries share. */
      _serum(group, colour, glow) {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.009, 0.009, 0.05, this.seg(14, 8)),
          this._mat(0xE0EAF0, { roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.5 }));
        barrel.rotation.z = Math.PI / 2;
        barrel.position.y = 0.009;
        group.add(barrel);
        const dose = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0076, 0.0076, 0.03, this.seg(12, 7)),
          glow ? this._glow(colour, 0.7) : this._mat(colour, { roughness: 0.3, metalness: 0.0 }));
        dose.rotation.z = Math.PI / 2;
        dose.position.set(0.006, 0.009, 0);
        group.add(dose);
        const shell = this._mat(0x2A3038, { roughness: 0.5, metalness: 0.25 });
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.011, 0.01, this.seg(12, 7)), shell);
        collar.rotation.z = Math.PI / 2;
        collar.position.set(-0.03, 0.009, 0);
        group.add(collar);
        const nose = new THREE.Mesh(
          new THREE.ConeGeometry(0.007, 0.014, this.seg(10, 6)), shell);
        nose.rotation.z = -Math.PI / 2;
        nose.position.set(0.033, 0.009, 0);
        group.add(nose);
        return group;
      },

      createMiscModel(entry, rand) {
        const id = entry && entry.id;
        const group = new THREE.Group();
        switch (id) {
          case 709: {   // Unidentified Item: a shape under a dust sheet
            const sheet = this._mat(0xC8C4B8, { roughness: 0.99, metalness: 0.0 });
            const shape = new THREE.Mesh(
              new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(9, 5)), sheet);
            shape.scale.set(1, 0.85, 0.9);
            shape.position.y = 0.02;
            group.add(shape);
            const skirt = new THREE.Mesh(
              new THREE.CylinderGeometry(0.03, 0.034, 0.014, this.seg(14, 8), 1, true), sheet);
            skirt.material.side = THREE.DoubleSide;
            skirt.position.y = 0.007;
            group.add(skirt);
            const tag = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0008, 0.008),
              this._mat(0xE8E0C8, { roughness: 0.98, metalness: 0.0 }));
            tag.position.set(0.03, 0.006, 0.012);
            tag.rotation.y = 0.4;
            group.add(tag);
            return group;
          }
          case 710: {   // Pet Rock: a rock with googly eyes, as promised
            this._stone(group, 0x8A8A82, { size: 0.022 });
            for (const s of [-1, 1]) {
              const eye = new THREE.Mesh(
                new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
                this._mat(0xF4F4F0, { roughness: 0.2, metalness: 0.0 }));
              eye.position.set(s * 0.007, 0.02, 0.014);
              group.add(eye);
              const pupil = new THREE.Mesh(
                new THREE.SphereGeometry(0.0022, this.seg(8, 5), this.seg(6, 4)),
                this._mat(0x14141A, { roughness: 0.3, metalness: 0.0 }));
              pupil.position.set(s * 0.007, 0.019, 0.018);
              pupil.userData.bob = { amp: 0.0012, freq: 2.2 };
              group.add(pupil);
            }
            return group;
          }
          case 711: {   // Newspaper: folded once, headline showing
            const paper = this._mat(0xE0DCD0, { roughness: 0.99, metalness: 0.0 });
            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.05), paper);
            lower.position.y = 0.0015;
            group.add(lower);
            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.048), paper);
            upper.position.set(0.002, 0.0045, -0.002);
            upper.rotation.z = 0.02;
            group.add(upper);
            const ink = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.0 });
            const headline = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0006, 0.006), ink);
            headline.position.set(0, 0.0062, -0.014);
            group.add(headline);
            if (this.wantsTrim()) {
              for (let i = 0; i < 3; i++) {
                const col = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0004, 0.018), ink);
                col.position.set(-0.02 + i * 0.02, 0.0061, 0.006);
                group.add(col);
              }
            }
            return group;
          }
          case 712: {   // Throwing Knife: one blade, balanced at the guard
            const steel = this._steel(0xC0C6CC, 0.22);
            const blade = this._plate(
              [[0, -0.005], [0.05, -0.002], [0.058, 0], [0.05, 0.002], [0, 0.005]], 0.0016, steel);
            blade.rotation.x = -Math.PI / 2;
            blade.position.set(0.006, 0.0008, 0);
            group.add(blade);
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.004, 0.008),
              this._mat(0x2A2A30, { roughness: 0.9, metalness: 0.05 }));
            grip.position.set(-0.014, 0.002, 0);
            group.add(grip);
            const wrap = this._mat(0x1A1A20, { roughness: 0.98, metalness: 0.0 });
            for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
              const turn = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0045, 0.0085), wrap);
              turn.position.set(-0.022 + i * 0.007, 0.002, 0);
              group.add(turn);
            }
            return group;
          }
          case 713: {   // Invitation letter: sealed, on good paper
            const paper = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.0015, 0.045),
              this._mat(0xF0EAD8, { roughness: 0.95, metalness: 0.02 }));
            paper.position.y = 0.00075;
            paper.rotation.y = 0.1;
            group.add(paper);
            const flap = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.001, 0.022),
              this._mat(0xE8E0C8, { roughness: 0.95, metalness: 0.02 }));
            flap.position.set(0, 0.0018, -0.011);
            flap.rotation.y = 0.1;
            group.add(flap);
            const seal = new THREE.Mesh(
              new THREE.CylinderGeometry(0.007, 0.007, 0.0025, this.seg(14, 8)),
              this._mat(0x8A1E22, { roughness: 0.55, metalness: 0.05 }));
            seal.position.set(0, 0.0032, -0.002);
            group.add(seal);
            return group;
          }
          case 714: {   // Pocket Sand: a torn pouch and the sand out of it
            const pouch = new THREE.Mesh(
              new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(9, 5)),
              this._mat(0x8A7A5A, { roughness: 0.99, metalness: 0.0 }));
            pouch.scale.set(1, 0.8, 0.85);
            pouch.position.set(-0.012, 0.013, 0);
            group.add(pouch);
            const sand = this._mat(0xE0C88A, { roughness: 1.0, metalness: 0.0 });
            const spill = new THREE.Mesh(
              new THREE.CylinderGeometry(0.014, 0.014, 0.0015, this.seg(14, 8)), sand);
            spill.position.set(0.02, 0.0008, 0.006);
            group.add(spill);
            for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
              const grain = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 5, 4), sand);
              grain.position.set(0.008 + i * 0.006, 0.004 + (i % 2) * 0.004, -0.006 + i * 0.004);
              grain.userData.bob = { amp: 0.002, freq: 1.5 + i * 0.2 };
              group.add(grain);
            }
            return group;
          }
          case 715: {   // Pro Statusguard: a sports pill tub, loud livery
            this._vessel(group, rand, {
              r: 0.022, h: 0.055, neck: 0, color: 0x1E2A4A, roughness: 0.4, capColor: 0xE0C82A
            });
            const band = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0222, 0.0222, 0.02, this.seg(16, 9), 1, true),
              this._mat(0xE0C82A, { roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }));
            band.position.y = 0.026;
            group.add(band);
            return group;
          }
          case 716: return this._sampleTube(group, 0x7A9A4A);   // Goblin
          case 717: return this._sampleTube(group, 0x9A8AB0);   // Unknown
          case 729: return this._sampleTube(group, 0xE8E4D8);   // Human
          case 730: return this._sampleTube(group, 0xC8A878);   // Dwarven
          case 738: return this._sampleTube(group, 0xD8E8D0);   // Elven
          case 718: {   // Flashbang: a banded canister with a pin and lever
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.016, 0.05, this.seg(16, 9)),
              this._mat(0x2A2E34, { roughness: 0.6, metalness: 0.3 }));
            body.position.y = 0.025;
            group.add(body);
            for (let i = 0; i < 3; i++) {
              const port = new THREE.Mesh(
                new THREE.TorusGeometry(0.0162, 0.0016, this.seg(5, 3), this.seg(14, 8)),
                this._steel(0x8A8E94, 0.45));
              port.rotation.x = Math.PI / 2;
              port.position.y = 0.014 + i * 0.011;
              group.add(port);
            }
            const head = new THREE.Mesh(
              new THREE.CylinderGeometry(0.011, 0.016, 0.01, this.seg(14, 8)),
              this._steel(0x9AA0A8, 0.4));
            head.position.y = 0.055;
            group.add(head);
            const lever = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.03, 0.008),
              this._steel(0xB0B6BC, 0.35));
            lever.position.set(0.016, 0.046, 0);
            group.add(lever);
            const pin = new THREE.Mesh(
              new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(12, 7)),
              this._steel(0xC0C6CC, 0.3));
            pin.rotation.y = Math.PI / 2;
            pin.position.set(-0.014, 0.058, 0);
            group.add(pin);
            return group;
          }
          case 719: {   // Struffoli: a honeyed heap with hundreds and thousands
            const dough = this._mat(0xC8A050, { roughness: 0.8, metalness: 0.02 });
            for (let i = 0; i < (this.wantsTrim() ? 8 : 4); i++) {
              const ball = new THREE.Mesh(
                new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), dough);
              const a = i * 1.3;
              const r = i < 3 ? 0.005 : 0.013;
              ball.position.set(Math.cos(a) * r, 0.006 + (i < 3 ? 0.008 : 0), Math.sin(a) * r);
              group.add(ball);
            }
            const honey = new THREE.Mesh(
              new THREE.CylinderGeometry(0.021, 0.021, 0.001, this.seg(16, 9)),
              this._mat(0xE0A82A, { roughness: 0.25, metalness: 0.0 }));
            honey.position.y = 0.0005;
            group.add(honey);
            if (this.wantsTrim()) {
              const hues = [0xE04040, 0x40A0E0, 0x50C060, 0xE0C040];
              for (let i = 0; i < 5; i++) {
                const s = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.001, 0.001),
                  this._mat(hues[i % 4], { roughness: 0.7, metalness: 0.0 }));
                s.position.set(-0.008 + i * 0.005, 0.015, -0.004 + (i % 2) * 0.008);
                group.add(s);
              }
            }
            return group;
          }
          case 720: {   // Arancini: two fried balls, one bitten open
            const crumb = this._mat(0xC88A3A, { roughness: 0.95, metalness: 0.0 });
            const whole = new THREE.Mesh(
              new THREE.SphereGeometry(0.017, this.seg(12, 7), this.seg(9, 5)), crumb);
            whole.position.set(-0.012, 0.017, 0);
            group.add(whole);
            const bitten = new THREE.Mesh(
              new THREE.SphereGeometry(0.017, this.seg(12, 7), this.seg(9, 5), 0, Math.PI * 1.4), crumb);
            bitten.position.set(0.016, 0.017, 0.004);
            bitten.rotation.y = 0.8;
            group.add(bitten);
            const cheese = new THREE.Mesh(
              new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)),
              this._mat(0xE8D060, { roughness: 0.5, metalness: 0.0 }));
            cheese.position.set(0.016, 0.017, 0.004);
            group.add(cheese);
            return group;
          }
          case 721: {   // Massive Storage Drive: an external disk and its lead
            const shell = this._mat(0x2A2E34, { roughness: 0.45, metalness: 0.35 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.05), shell);
            body.position.y = 0.008;
            group.add(body);
            const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.018),
              this._mat(0xE8E4D8, { roughness: 0.9, metalness: 0.0 }));
            label.position.set(0, 0.0165, 0);
            group.add(label);
            const led = new THREE.Mesh(new THREE.SphereGeometry(0.0018, this.seg(8, 5), this.seg(6, 4)),
              this._glow(0x50A0E0, 0.8));
            led.position.set(0.028, 0.0125, 0.024);
            led.userData.pulse = { freq: 2.4, min: 0.2, max: 1.0 };
            group.add(led);
            const lead = new THREE.Mesh(
              new THREE.TorusGeometry(0.016, 0.0016, this.seg(5, 3), this.seg(16, 9)),
              this._mat(0x1A1A20, { roughness: 0.9, metalness: 0.0 }));
            lead.rotation.x = Math.PI / 2;
            lead.position.set(-0.05, 0.0016, 0.008);
            group.add(lead);
            return group;
          }
          case 722: return this._course(group, 0x2A4A6A, 0xC8A54A);   // Mental Focus
          case 727: return this._course(group, 0x4A2A6A, 0xE060C8);   // Psionic
          case 728: return this._course(group, 0x3A5A3A, 0xE0C860);   // Practical
          case 723: {   // Fighter's Focus: a stimulant tab and its foil
            const foil = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.022),
              this._steel(0xB8BCC2, 0.45));
            foil.position.y = 0.0005;
            group.add(foil);
            const tab = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.004, this.seg(14, 8)),
              this._mat(0xC83A2A, { roughness: 0.5, metalness: 0.05 }));
            tab.position.set(0.004, 0.003, 0.002);
            group.add(tab);
            const score = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0006, 0.0008),
              this._mat(0x8A2A1E, { roughness: 0.8, metalness: 0.0 }));
            score.position.set(0.004, 0.0052, 0.002);
            group.add(score);
            return group;
          }
          case 724: {   // Floating skull: it floats, and it is lit from within
            const bone = this._mat(0xE0D8C0, { roughness: 0.7, metalness: 0.03 });
            const cranium = new THREE.Mesh(
              new THREE.SphereGeometry(0.022, this.seg(14, 8), this.seg(11, 6)), bone);
            cranium.scale.set(1, 0.95, 1.1);
            cranium.position.y = 0.044;
            cranium.userData.bob = { amp: 0.005, freq: 0.7 };
            group.add(cranium);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.018), bone);
            jaw.position.y = 0.028;
            jaw.userData.bob = { amp: 0.005, freq: 0.7 };
            group.add(jaw);
            for (const s of [-1, 1]) {
              const socket = new THREE.Mesh(
                new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5)),
                this._glow(0x6AE0C8, 0.8));
              socket.position.set(s * 0.008, 0.046, 0.019);
              socket.userData.pulse = { freq: 1.1, min: 0.35, max: 1.0 };
              socket.userData.bob = { amp: 0.005, freq: 0.7 };
              group.add(socket);
            }
            return group;
          }
          case 725: {   // Spirit Parasite: a jar with something coiled in it
            const glass = this._mat(0xDCE8E4, {
              roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.38
            });
            const jar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.02, 0.02, 0.048, this.seg(16, 9)), glass);
            jar.position.y = 0.024;
            group.add(jar);
            const worm = new THREE.Mesh(
              new THREE.TorusKnotGeometry
                ? new THREE.TorusKnotGeometry(0.01, 0.0032, this.seg(32, 16), this.seg(6, 4))
                : new THREE.TorusGeometry(0.01, 0.0032, this.seg(6, 4), this.seg(14, 8)),
              this._glow(0x9A50C8, 0.6));
            worm.position.y = 0.024;
            worm.userData.spin = { axis: 'y', speed: 0.4 };
            group.add(worm);
            const lid = new THREE.Mesh(
              new THREE.CylinderGeometry(0.021, 0.021, 0.006, this.seg(16, 9)),
              this._steel(0x8A8E94, 0.45));
            lid.position.y = 0.051;
            group.add(lid);
            return group;
          }
          case 726: {   // Handheld Gaming Console: grey brick, green screen
            const shell = this._mat(0xC8C4B8, { roughness: 0.6, metalness: 0.05 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.085, 0.016), shell);
            body.position.y = 0.043;
            group.add(body);
            const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.001),
              this._mat(0x8AA83A, {
                roughness: 0.25, metalness: 0.05, emissive: 0x4A6A1A, emissiveIntensity: 0.5
              }));
            screen.position.set(0, 0.062, 0.0085);
            group.add(screen);
            const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.002),
              this._mat(0x3A3A40, { roughness: 0.8, metalness: 0.05 }));
            pad.position.set(-0.013, 0.03, 0.0085);
            group.add(pad);
            const padUp = pad.clone();
            padUp.scale.set(0.33, 3, 1);
            group.add(padUp);
            for (let i = 0; i < 2; i++) {
              const button = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, this.seg(10, 6)),
                this._mat(0x8A2A5A, { roughness: 0.6, metalness: 0.05 }));
              button.rotation.x = Math.PI / 2;
              button.position.set(0.012 + i * 0.009, 0.03 - i * 0.005, 0.0085);
              group.add(button);
            }
            return group;
          }
          case 731: return this._serum(group, 0xC850E0, true);   // Neuro-Quantum
          case 735: return this._serum(group, 0x50E0C8, true);   // Resurrection
          case 736: return this._serum(group, 0xE0C860, true);   // Omega Singularity
          case 737: return this._serum(group, 0x8AE0A0, true);   // Gestation
          case 732: {   // Overdrive Implant: a device with its leads, not a drug
            const shell = this._mat(0x2A2E34, { roughness: 0.4, metalness: 0.4 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.022), shell);
            body.position.y = 0.005;
            group.add(body);
            const core = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.012),
              this._glow(0xE05A2A, 0.75));
            core.position.y = 0.0105;
            core.userData.pulse = { freq: 1.6, min: 0.4, max: 1.0 };
            group.add(core);
            const lead = this._mat(0x8A8E94, { roughness: 0.5, metalness: 0.6 });
            for (const s of [-1, 1]) {
              const wire = new THREE.Mesh(
                new THREE.TorusGeometry(0.012, 0.0009, this.seg(5, 3), this.seg(12, 7), Math.PI * 1.2), lead);
              wire.rotation.set(Math.PI / 2, 0, s * 0.6);
              wire.position.set(s * 0.024, 0.002, 0);
              group.add(wire);
            }
            return group;
          }
          case 733: {   // Genome Optimator: a cartridge with a helix in it
            const shell = this._mat(0xE8E8EC, { roughness: 0.35, metalness: 0.2 });
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.055, 0.016), shell);
            body.position.y = 0.028;
            group.add(body);
            const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.036, 0.017),
              this._mat(0xDCE8EE, {
                roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4
              }));
            window_.position.y = 0.03;
            group.add(window_);
            for (let i = 0; i < (this.wantsTrim() ? 6 : 3); i++) {
              const rung = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.0012, 0.0012),
                this._glow(0x50C8E0, 0.7));
              rung.position.set(0, 0.016 + i * 0.0055, 0);
              rung.rotation.y = i * 0.6;
              group.add(rung);
            }
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.006, 0.018),
              this._mat(0x2A3038, { roughness: 0.55, metalness: 0.25 }));
            cap.position.y = 0.058;
            group.add(cap);
            return group;
          }
          case 734: {   // Potential Catalyst: a stone that has not gone off yet
            const shell = new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.019, 0),
              this._mat(0x3A3A48, { roughness: 0.5, metalness: 0.3 }));
            shell.position.y = 0.019;
            group.add(shell);
            const core = new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.012, 0), this._glow(0xE0C860, 0.85));
            core.position.y = 0.019;
            core.userData.pulse = { freq: 0.6, min: 0.25, max: 1.0 };
            group.add(core);
            for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
              const crack = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.016, 0.0012),
                this._glow(0xF0E0A0, 0.9));
              const a = i * 2.1;
              crack.position.set(Math.cos(a) * 0.014, 0.019, Math.sin(a) * 0.014);
              crack.rotation.set(0.4, a, 0.3);
              group.add(crack);
            }
            return group;
          }
          case 739: {   // Skeleton Key: a key with no cuts, because it is all cuts
            const iron = this._steel(0x8A8A92, 0.4);
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.003, 0.003, 0.06, this.seg(10, 6)), iron);
            shaft.rotation.z = Math.PI / 2;
            shaft.position.y = 0.003;
            group.add(shaft);
            const bow = new THREE.Mesh(
              new THREE.TorusGeometry(0.011, 0.003, this.seg(6, 4), this.seg(16, 9)), iron);
            bow.position.set(-0.04, 0.003, 0);
            group.add(bow);
            const bit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.0025), iron);
            bit.position.set(0.024, 0.008, 0);
            group.add(bit);
            // The ward that fits every lock: a lit seam through the bit.
            const ward = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.003),
              this._glow(0x8AC8E0, 0.6));
            ward.position.set(0.024, 0.009, 0);
            ward.userData.pulse = { freq: 0.9, min: 0.35, max: 0.95 };
            group.add(ward);
            return group;
          }
          default:
            return this.createGenericItemModel(entry, rand);
        }
      }
    }
  };

  // The four shelves, by id. Filled from the database at load time in the
  // game; the lists here are what the shelves hold today and are checked by
  // test/test_item_models.js against Items.json.
  const SHELVES = {
    Homeopathy: [604, 605, 606, 607, 608, 609, 610, 611],
    Survival: [804, 805, 806, 807, 808, 809, 810, 811, 812, 813, 814, 815, 816],
    Trash: [828, 829, 830, 831, 832, 833, 834, 835, 836],
    Misc: [709, 710, 711, 712, 713, 714, 715, 716, 717, 718, 719, 720, 721, 722, 723,
      724, 725, 726, 727, 728, 729, 730, 731, 732, 733, 734, 735, 736, 737, 738, 739]
  };
  const BUILDER = {
    Homeopathy: 'createRemedyModel',
    Survival: 'createSurvivalKitModel',
    Trash: 'createTrashPieceModel',
    Misc: 'createMiscModel'
  };
  for (const shelf of Object.keys(SHELVES)) {
    for (const id of SHELVES[shelf]) family.unique['i' + id] = BUILDER[shelf];
  }

  window.ItemModelSystem.registerFamily(family);
})();
