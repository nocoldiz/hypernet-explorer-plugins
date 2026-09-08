//=============================================================================
// Item 3D Models - Generic silhouettes
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc The generic 3D model of every item category and every armour
 * slot. Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Generic silhouettes
 * ============================================================================
 *
 * The floor of the item model pipeline: whatever else is loaded, every entry
 * in Items.json and Armors.json resolves to something here. One builder per
 * <category:> tag and one per armour slot, so a thing with no bespoke model of
 * its own still reads as what it is: a Medical entry is a blister pack, an
 * Alchemistry entry a reagent jar, a Books entry a bound volume. A bespoke
 * model registered by a later family overrides the category shape for that one
 * database id and nothing else.
 *
 * NOT listed in plugins.js. ItemSystemUtils.js injects this file at runtime
 * from its ITEM3D_FAMILIES list, the same way WeaponSystemProcedural.js loads
 * its Weapon3D_* families.
 *
 * Every builder takes (entry, rand) where rand is seeded from the database id
 * and name alone, never from the world: an item's appearance is FIXED and the
 * same in every world. Builders return a THREE.Group standing on the X/Z plane
 * with its base at the origin and its height running up +Y, sized in metres
 * against the real object (a pill bottle is about 0.09 tall). The shared
 * construction library of WeaponSystemProcedural (_mat, _steel, _wood, _glow,
 * _plate, seg, wantsTrim, the palettes) is available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Generic] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Generic',

    categories: {
      Medical: 'createMedicalItemModel',
      Homeopathy: 'createHomeopathyItemModel',
      Diseases: 'createDiseaseItemModel',
      Alchemistry: 'createAlchemistryItemModel',
      Food: 'createFoodItemModel',
      Trash: 'createTrashItemModel',
      Books: 'createBookItemModel',
      Magic: 'createMagicItemModel',
      Counterfeits: 'createCounterfeitItemModel',
      Tools: 'createToolItemModel',
      Artisan: 'createArtisanItemModel',
      Crafting: 'createCraftingItemModel',
      Component: 'createComponentItemModel',
      Combat: 'createCombatItemModel',
      Espionage: 'createEspionageItemModel',
      Survival: 'createSurvivalItemModel',
      Arctic: 'createArcticItemModel',
      Jungle: 'createJungleItemModel',
      Farming: 'createFarmingItemModel',
      Plants: 'createPlantItemModel',
      Lifestyle: 'createLifestyleItemModel',
      Collectibles: 'createCollectibleItemModel',
      Monsters: 'createMonsterPartItemModel',
      BodyPart: 'createBodyPartItemModel',
      Vehicles: 'createVehicleItemModel',
      Misc: 'createGenericItemModel'
    },

    // Armour slots, "etypeId:atypeId". etype 2 is the off-hand, 3 the head,
    // 4 the body and 5 the accessory; the armour type inside a slot says what
    // kind of thing fills it.
    armors: {
      '2:*': 'createOffhandArmorModel',
      '2:2': 'createWardArmorModel',
      '2:6': 'createShieldArmorModel',
      '2:5': 'createShieldArmorModel',
      '3:*': 'createHeadArmorModel',
      '3:1': 'createHatArmorModel',
      '3:2': 'createHatArmorModel',
      '4:*': 'createBodyArmorModel',
      '4:1': 'createClothesArmorModel',
      '4:2': 'createRobeArmorModel',
      '5:*': 'createAccessoryArmorModel',
      '5:3': 'createGauntletArmorModel',
      '5:4': 'createBootArmorModel',
      '5:5': 'createPackArmorModel',
      '5:6': 'createShieldArmorModel'
    },

    models: {
      // ======================================================================
      // Shared plumbing
      // ======================================================================

      /** Colour dealt from a palette, so a category reads as one family. */
      _itemColor(rand, palette) {
        return palette[Math.floor(rand() * palette.length)];
      },

      /**
       * A container: body, a neck and a cap. Almost every consumable in the
       * database is one of these, so it is worth one call.
       */
      _vessel(group, rand, o) {
        const glass = this._mat(o.color, {
          roughness: o.roughness === undefined ? 0.12 : o.roughness,
          metalness: 0.0,
          transparent: o.opacity !== undefined && o.opacity < 1,
          opacity: o.opacity === undefined ? 1 : o.opacity
        });
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(o.rTop === undefined ? o.r : o.rTop, o.r, o.h, this.seg(o.sides || 12, 7)),
          glass);
        body.position.y = o.h / 2;
        group.add(body);

        if (o.fill) {
          const level = o.fillLevel === undefined ? 0.6 : o.fillLevel;
          const liquid = new THREE.Mesh(
            new THREE.CylinderGeometry(o.r * 0.88, o.r * 0.88, o.h * level, this.seg(o.sides || 12, 7)),
            this._mat(o.fill, { roughness: 0.25, metalness: 0.0 }));
          liquid.position.y = o.h * level / 2;
          group.add(liquid);
        }

        const neckH = o.neck === undefined ? o.h * 0.16 : o.neck;
        if (neckH > 0) {
          const neck = new THREE.Mesh(
            new THREE.CylinderGeometry(o.r * 0.45, o.r * 0.62, neckH, this.seg(10, 6)), glass);
          neck.position.y = o.h + neckH / 2;
          group.add(neck);
        }
        if (o.capColor !== undefined) {
          const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(o.r * 0.5, o.r * 0.5, o.h * 0.1, this.seg(10, 6)),
            this._mat(o.capColor, { roughness: 0.7, metalness: 0.05 }));
          cap.position.y = o.h + neckH + o.h * 0.05;
          group.add(cap);
        }
        return body;
      },

      /** A paper label banded around a body of radius r. */
      _label(group, rand, r, y, h, color) {
        if (!this.wantsTrim()) return null;
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.02, r * 1.02, h, this.seg(12, 7), 1, true),
          this._mat(color, { roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }));
        label.position.y = y;
        group.add(label);
        return label;
      },

      /**
       * Scales a model built to some other convention down to item scale and
       * stands it on the X/Z plane, which is where the viewers frame from.
       * Only borrowed models need this: everything built here is already
       * authored against the real object.
       */
      _standOn(model, span) {
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) return model;
        const size = box.getSize(new THREE.Vector3());
        const widest = Math.max(size.x, size.y, size.z);
        const k = widest > 0 ? (span || 0.16) / widest : 1;
        model.scale.multiplyScalar(k);
        model.updateMatrixWorld(true);
        const scaled = new THREE.Box3().setFromObject(model);
        const centre = scaled.getCenter(new THREE.Vector3());
        model.position.x -= centre.x;
        model.position.z -= centre.z;
        model.position.y -= scaled.min.y;
        return model;
      },

      /** A rectangular slab: box, crate, packet, book board, circuit card. */
      _slab(group, w, h, d, mat, y) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        slab.position.y = y === undefined ? h / 2 : y;
        group.add(slab);
        return slab;
      },

      // ======================================================================
      // Consumables
      // ======================================================================

      // Medical: a pill bottle with a childproof cap and a printed label. The
      // whole rack of over-the-counter entries reads as one shelf.
      createMedicalItemModel(entry, rand) {
        const group = new THREE.Group();
        const body = this._itemColor(rand, [0xE8E4DA, 0xD8E6EF, 0xE9D8D8, 0xDCE9DC]);
        this._vessel(group, rand, {
          r: 0.021, h: 0.075, neck: 0.006, color: body, roughness: 0.45,
          capColor: this._itemColor(rand, [0xFFFFFF, 0x2A6FB0, 0xB03A3A])
        });
        this._label(group, rand, 0.021, 0.036, 0.042,
          this._itemColor(rand, [0xF6F2E6, 0xE6EFF6]));
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.001),
          this._mat(0xB03A3A, { roughness: 0.9, metalness: 0.0 }));
        cross.position.set(0, 0.036, 0.0225);
        group.add(cross);
        const up = cross.clone();
        up.scale.set(0.28, 3.5, 1);
        group.add(up);
        return group;
      },

      // Homeopathy: the same medicine sold as a dropper vial, which is what
      // separates it from the pharmacy shelf above.
      createHomeopathyItemModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.013, h: 0.055, neck: 0.005, color: 0x3B2A16, roughness: 0.2,
          fill: this._itemColor(rand, [0xD8E8F0, 0xEFE6C8, 0xE0D8EF]), fillLevel: 0.45,
          capColor: 0x1A1A1A
        });
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x2A2A2A, { roughness: 0.85, metalness: 0.0 }));
        bulb.position.y = 0.072;
        bulb.scale.y = 1.35;
        group.add(bulb);
        return group;
      },

      // Diseases: a sealed culture vial in a rubber-stoppered tube, the
      // contents cloudy rather than bright.
      createDiseaseItemModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.012, h: 0.062, neck: 0, color: 0xC8D6D2, roughness: 0.1, opacity: 0.55,
          fill: this._itemColor(rand, [0xA8B86A, 0xB8A05A, 0x9AA8B0, 0xB07A8A]), fillLevel: 0.55
        });
        const stopper = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0125, 0.011, 0.012, this.seg(10, 6)),
          this._mat(0x4A4A52, { roughness: 0.9, metalness: 0.0 }));
        stopper.position.y = 0.066;
        group.add(stopper);
        this._label(group, rand, 0.012, 0.022, 0.016, 0xF2EFE4);
        return group;
      },

      // Alchemistry: a wide reagent jar with a ground glass lid, the powder or
      // the solution inside sitting flat.
      createAlchemistryItemModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.026, h: 0.058, neck: 0.005, color: 0xD6E2E0, roughness: 0.08, opacity: 0.62,
          fill: this._itemColor(rand, [0xE8E2D0, 0x8FB8C8, 0xC8A860, 0x7A8A62, 0xC0C4C8]),
          fillLevel: 0.5
        });
        const lid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.017, 0.013, 0.013, this.seg(10, 6)),
          this._mat(0xE0EAE8, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.75 }));
        lid.position.y = 0.066;
        group.add(lid);
        this._label(group, rand, 0.026, 0.024, 0.022, 0xF4EFE0);
        return group;
      },

      // Food: a portion on a plate. Enough of a shape to read as a meal
      // without pretending to be any particular dish.
      createFoodItemModel(entry, rand) {
        const group = new THREE.Group();
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.048, 0.008, this.seg(16, 8)),
          this._mat(0xEFEAE0, { roughness: 0.35, metalness: 0.0 }));
        plate.position.y = 0.004;
        group.add(plate);
        const foodMat = this._mat(
          this._itemColor(rand, [0xB07A3A, 0xC8A250, 0x8A5A32, 0xA8B06A, 0xC05A4A]),
          { roughness: 0.85, metalness: 0.0 });
        const portion = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2),
          foodMat);
        portion.position.y = 0.008;
        portion.scale.y = 0.7;
        group.add(portion);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const bit = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.009), foodMat);
            const a = rand() * Math.PI * 2;
            bit.position.set(Math.cos(a) * 0.022, 0.016, Math.sin(a) * 0.022);
            bit.rotation.y = rand() * Math.PI;
            group.add(bit);
          }
        }
        return group;
      },

      // Trash: food gone over. The same portion, slumped, grey and growing
      // something.
      createTrashItemModel(entry, rand) {
        const group = new THREE.Group();
        const rot = this._mat(this._itemColor(rand, [0x7A7A5A, 0x6A6250, 0x8A8A72]),
          { roughness: 0.95, metalness: 0.0 });
        const heap = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), rot);
        heap.scale.set(1, 0.45, 0.85);
        group.add(heap);
        if (this.wantsTrim()) {
          const mould = this._mat(0x5A7A4A, { roughness: 1.0, metalness: 0.0 });
          for (let i = 0; i < 5; i++) {
            const spot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), mould);
            const a = rand() * Math.PI * 2;
            const r = 0.008 + rand() * 0.018;
            spot.position.set(Math.cos(a) * r, 0.012 + rand() * 0.004, Math.sin(a) * r);
            group.add(spot);
          }
        }
        return group;
      },

      // ======================================================================
      // Written and magical things
      // ======================================================================

      // Books: two boards, a text block and a spine, lying closed.
      createBookItemModel(entry, rand) {
        const group = new THREE.Group();
        const cover = this._mat(
          this._itemColor(rand, [0x5A2A22, 0x27402A, 0x22304A, 0x3A2A44, 0x4A3A22]),
          { roughness: 0.85, metalness: 0.02 });
        const paper = this._mat(0xE4DCC2, { roughness: 0.95, metalness: 0.0 });
        const w = 0.09, d = 0.13;
        this._slab(group, w, 0.005, d, cover, 0.0025);
        this._slab(group, w * 0.96, 0.018, d * 0.96, paper, 0.014);
        this._slab(group, w, 0.005, d, cover, 0.0255);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.028, d), cover);
        spine.position.set(-w / 2, 0.014, 0);
        group.add(spine);
        if (this.wantsTrim()) {
          const gilt = this._mat(0xC8A54A, { roughness: 0.35, metalness: 0.8 });
          const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.001, 0.004), gilt);
          band.position.set(0, 0.0285, 0.02);
          group.add(band);
        }
        return group;
      },

      // Magic: a charged focus. A faceted stone floating in a ring of its own
      // light, on a small stand so it stands up in a menu.
      createMagicItemModel(entry, rand) {
        const group = new THREE.Group();
        const hue = this._itemColor(rand, [0x6A5AE0, 0x50C8B0, 0xE05A9A, 0xE0B040, 0x50A0E0]);
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.028, 0.012, this.seg(12, 7)),
          this._mat(0x3A3038, { roughness: 0.6, metalness: 0.4 }));
        base.position.y = 0.006;
        group.add(base);
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), this._glow(hue, 0.9));
        stone.position.y = 0.046;
        stone.scale.y = 1.4;
        stone.userData.spin = { axis: 'y', speed: 0.6 };
        stone.userData.pulse = { freq: 1.6, min: 0.5, max: 1.0 };
        group.add(stone);
        if (this.wantsTrim()) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.03, 0.002, this.seg(6, 4), this.seg(16, 8)), this._glow(hue, 0.6));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.04;
          ring.userData.spin = { axis: 'y', speed: -0.4 };
          group.add(ring);
        }
        return group;
      },

      // Counterfeits: the magic item as sold on a market stall. The same
      // silhouette in painted plastic, with a dull stone and no light at all.
      createCounterfeitItemModel(entry, rand) {
        const group = new THREE.Group();
        const plastic = this._mat(this._itemColor(rand, [0x8A7AB0, 0x7AB0A0, 0xB08A9A, 0xB0A070]),
          { roughness: 0.7, metalness: 0.05 });
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.028, 0.012, this.seg(10, 6)),
          this._mat(0x50484E, { roughness: 0.85, metalness: 0.05 }));
        base.position.y = 0.006;
        group.add(base);
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.021, 0), plastic);
        stone.position.y = 0.042;
        stone.scale.y = 1.3;
        stone.rotation.z = 0.12;
        group.add(stone);
        if (this.wantsTrim()) {
          const sticker = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.001, this.seg(10, 6)),
            this._mat(0xE0C040, { roughness: 0.9, metalness: 0.0 }));
          sticker.rotation.x = Math.PI / 2;
          sticker.position.set(0.014, 0.01, 0.026);
          group.add(sticker);
        }
        return group;
      },

      // ======================================================================
      // Made things
      // ======================================================================

      // Tools: a handled implement. A shaft with a working head on it, which
      // is what the whole rack of keys, pens, brushes and hooks has in common.
      createToolItemModel(entry, rand) {
        const group = new THREE.Group();
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.009, 0.07, this.seg(10, 6)),
          this._wood(this._itemColor(rand, [0x6A4A2A, 0x3A3A40, 0x8A6A3A])));
        handle.position.y = 0.035;
        group.add(handle);
        const steel = this._steel(0x9AA0A8, 0.35);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.004), steel);
        head.position.y = 0.095;
        group.add(head);
        if (this.wantsTrim()) {
          const collar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.011, 0.011, 0.008, this.seg(10, 6)), steel);
          collar.position.y = 0.072;
          group.add(collar);
        }
        return group;
      },

      // Artisan: the tool of a trade, kept in a fitted case. The case is the
      // point: these are bought as a set rather than used loose.
      createArtisanItemModel(entry, rand) {
        const group = new THREE.Group();
        const leather = this._mat(this._itemColor(rand, [0x5A3A22, 0x3A2A2A, 0x4A4230]),
          { roughness: 0.9, metalness: 0.0 });
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.7 });
        this._slab(group, 0.1, 0.03, 0.06, leather, 0.015);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, this.seg(14, 8), 1, false, 0, Math.PI), leather);
        lid.rotation.z = Math.PI / 2;
        lid.scale.z = 0.55;
        lid.position.y = 0.03;
        group.add(lid);
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.004), brass);
        clasp.position.set(0, 0.028, 0.031);
        group.add(clasp);
        return group;
      },

      // Crafting: raw stock. An ingot with the corners knocked off, which
      // covers essence, shard, core and plate alike.
      createCraftingItemModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._cast(this._itemColor(rand, [0x9AA0A8, 0xB08A4A, 0x8A6ACC, 0x60A090, 0xC0C4C8]));
        const ingot = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.026, 4), mat);
        ingot.position.y = 0.013;
        ingot.rotation.y = Math.PI / 4;
        group.add(ingot);
        if (this.wantsTrim()) {
          const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.001, 0.006),
            this._mat(0x2A2A2A, { roughness: 0.9, metalness: 0.1 }));
          stamp.position.y = 0.0265;
          group.add(stamp);
        }
        return group;
      },

      // Component: hyperdeck hardware. A green card with a socketed package
      // and a row of pins, whatever the part actually does.
      createComponentItemModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._mat(this._itemColor(rand, [0x1E4A28, 0x1E3A4A, 0x2A2A2A]),
          { roughness: 0.7, metalness: 0.1 });
        this._slab(group, 0.09, 0.003, 0.055, board, 0.0015);
        const chip = this._slab(group, 0.03, 0.008, 0.03,
          this._mat(0x2A2A30, { roughness: 0.55, metalness: 0.2 }), 0.007);
        chip.position.x = -0.012;
        const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const pin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.008), gold);
            pin.position.set(-0.04 + i * 0.014, 0.0005, 0.026);
            group.add(pin);
          }
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.011, this.seg(10, 6)),
            this._mat(0x3A3A50, { roughness: 0.5, metalness: 0.4 }));
          cap.position.set(0.028, 0.0085, -0.012);
          group.add(cap);
        }
        return group;
      },

      // Combat: something thrown. A weighted charge with a band round its
      // middle and a fuse or a pin at the top.
      createCombatItemModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this._itemColor(rand, [0x4A5A3A, 0x3A3A42, 0x6A4A2A]),
          { roughness: 0.7, metalness: 0.25 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(10, 6)), shell);
        body.scale.y = 1.25;
        body.position.y = 0.032;
        group.add(body);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.012, this.seg(10, 6)),
          this._steel(0x8A8E94, 0.4));
        neck.position.y = 0.066;
        group.add(neck);
        if (this.wantsTrim()) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.026, 0.003, this.seg(6, 4), this.seg(14, 8)),
            this._mat(0xB03A2A, { roughness: 0.8, metalness: 0.1 }));
          band.rotation.x = Math.PI / 2;
          band.position.y = 0.032;
          group.add(band);
        }
        return group;
      },

      // Espionage: a flat kit that fits in a pocket, its tools folded in.
      createEspionageItemModel(entry, rand) {
        const group = new THREE.Group();
        const case_ = this._mat(0x1E1E24, { roughness: 0.6, metalness: 0.2 });
        this._slab(group, 0.075, 0.008, 0.04, case_, 0.004);
        const steel = this._steel(0xA8ADB4, 0.3);
        const count = this.wantsTrim() ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const pick = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.001, 0.003), steel);
          pick.position.set(0.004, 0.0085, -0.012 + i * 0.012);
          pick.rotation.y = (i - 1) * 0.16;
          group.add(pick);
        }
        return group;
      },

      // Survival: field kit. A rolled bundle strapped to a tin cup, the sort
      // of thing that hangs off a pack.
      createSurvivalItemModel(entry, rand) {
        const group = new THREE.Group();
        const canvas = this._mat(this._itemColor(rand, [0x6A6A4A, 0x4A5A5A, 0x7A5A3A]),
          { roughness: 0.95, metalness: 0.0 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.085, this.seg(14, 8)), canvas);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.022;
        group.add(roll);
        const strap = this._mat(0x3A2A1E, { roughness: 0.9, metalness: 0.0 });
        for (const x of [-0.024, 0.024]) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.023, 0.0025, this.seg(6, 4), this.seg(12, 7)), strap);
          band.rotation.y = Math.PI / 2;
          band.position.set(x, 0.022, 0);
          group.add(band);
        }
        return group;
      },

      // Arctic: cold-country goods, wrapped in hide against the weather and
      // tied off at both ends.
      createArcticItemModel(entry, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this._itemColor(rand, [0xC8C0B0, 0x8A8A92, 0xA89880]),
          { roughness: 0.95, metalness: 0.0 });
        const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 5)), hide);
        bundle.scale.set(1.25, 0.8, 0.9);
        bundle.position.y = 0.024;
        group.add(bundle);
        const cord = this._mat(0x5A4A3A, { roughness: 1.0, metalness: 0.0 });
        for (const x of [-0.03, 0.03]) {
          const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.012, this.seg(8, 5)), cord);
          tie.rotation.z = Math.PI / 2;
          tie.position.set(x * 1.15, 0.024, 0);
          group.add(tie);
        }
        return group;
      },

      // Jungle: gathered from something living. A gourd corked with a leaf,
      // the contents bright.
      createJungleItemModel(entry, rand) {
        const group = new THREE.Group();
        this._vessel(group, rand, {
          r: 0.024, rTop: 0.014, h: 0.05, neck: 0.008, color: 0x8A6A3A, roughness: 0.85,
          capColor: 0x3A5A2A
        });
        if (this.wantsTrim()) {
          const leaf = this._plate([[0, 0], [0.012, 0.018], [0, 0.04], [-0.012, 0.018]], 0.001,
            this._mat(0x3A6A2A, { roughness: 0.9, metalness: 0.0 }));
          leaf.position.y = 0.05;
          leaf.rotation.x = -0.5;
          group.add(leaf);
        }
        return group;
      },

      // Farming: a sack of bulk goods, slumped and tied at the throat.
      createFarmingItemModel(entry, rand) {
        const group = new THREE.Group();
        const sack = this._mat(0xB8A878, { roughness: 0.98, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.06, this.seg(12, 7)), sack);
        body.position.y = 0.03;
        group.add(body);
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 0.018, this.seg(12, 7)), sack);
        throat.position.y = 0.068;
        group.add(throat);
        const tie = new THREE.Mesh(
          new THREE.TorusGeometry(0.013, 0.002, this.seg(6, 4), this.seg(10, 6)),
          this._mat(0x6A5A3A, { roughness: 1.0, metalness: 0.0 }));
        tie.rotation.x = Math.PI / 2;
        tie.position.y = 0.072;
        group.add(tie);
        return group;
      },

      // Plants: the plant itself, pulled up whole. A stem, leaves and a head.
      createPlantItemModel(entry, rand) {
        const group = new THREE.Group();
        const green = this._mat(0x4A7A32, { roughness: 0.9, metalness: 0.0 });
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.07, this.seg(8, 5)), green);
        stem.position.y = 0.035;
        group.add(stem);
        for (const s of [-1, 1]) {
          const leaf = this._plate([[0, 0], [0.01, 0.012], [0, 0.028], [-0.01, 0.012]], 0.0008, green);
          leaf.position.set(s * 0.006, 0.03, 0);
          leaf.rotation.z = s * 0.7;
          group.add(leaf);
        }
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(10, 6), this.seg(8, 5)),
          this._mat(this._itemColor(rand, [0xE0C040, 0xE8E8E0, 0xC85A7A]), { roughness: 0.85, metalness: 0.0 }));
        head.position.y = 0.074;
        head.scale.y = 0.7;
        group.add(head);
        return group;
      },

      // Lifestyle: a boxed consumer product, printed and shrink-wrapped.
      createLifestyleItemModel(entry, rand) {
        const group = new THREE.Group();
        const card = this._mat(this._itemColor(rand, [0xC85A4A, 0x4A6AC8, 0xC8A040, 0x4AA870]),
          { roughness: 0.75, metalness: 0.05 });
        this._slab(group, 0.055, 0.075, 0.025, card, 0.0375);
        if (this.wantsTrim()) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.001),
            this._mat(0xF0EDE4, { roughness: 0.9, metalness: 0.0 }));
          panel.position.set(0, 0.05, 0.0128);
          group.add(panel);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.001),
            this._mat(0x1A1A1A, { roughness: 0.9, metalness: 0.0 }));
          bar.position.set(0, 0.018, 0.0128);
          group.add(bar);
        }
        return group;
      },

      // Collectibles: a keepsake in a display case, which is the whole reason
      // anyone keeps one.
      createCollectibleItemModel(entry, rand) {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.05),
          this._wood(0x4A2E1B));
        base.position.y = 0.004;
        group.add(base);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.045),
          this._mat(0xDCE8EF, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.25 }));
        glass.position.y = 0.033;
        group.add(glass);
        const trinket = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0),
          this._mat(this._itemColor(rand, [0xC8A54A, 0xB0B4BC, 0xC85A6A]),
            { roughness: 0.35, metalness: 0.7 }));
        trinket.position.y = 0.024;
        trinket.userData.spin = { axis: 'y', speed: 0.35 };
        group.add(trinket);
        return group;
      },

      // ======================================================================
      // Parts of things that were alive
      // ======================================================================

      // Monsters: a trophy part, jagged and stringy, kept on a hook.
      createMonsterPartItemModel(entry, rand) {
        const group = new THREE.Group();
        const flesh = this._mat(this._itemColor(rand, [0x6A4A5A, 0x4A6A5A, 0x7A6A4A, 0x5A5A6A]),
          { roughness: 0.85, metalness: 0.05 });
        const mass = new THREE.Mesh(new THREE.DodecahedronGeometry(0.026, 0), flesh);
        mass.position.y = 0.026;
        mass.scale.set(1, 0.85, 0.8);
        group.add(mass);
        if (this.wantsTrim()) {
          const spike = this._mat(0xD8D0C0, { roughness: 0.6, metalness: 0.1 });
          for (let i = 0; i < 3; i++) {
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, this.seg(6, 4)), spike);
            const a = rand() * Math.PI * 2;
            barb.position.set(Math.cos(a) * 0.018, 0.036, Math.sin(a) * 0.018);
            barb.rotation.set(rand() * 0.6, a, rand() * 0.6);
            group.add(barb);
          }
        }
        return group;
      },

      // BodyPart: a harvested part on a surgical tray, which is how the
      // health system hands them over.
      createBodyPartItemModel(entry, rand) {
        const group = new THREE.Group();
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.05),
          this._steel(0xB0B6BC, 0.3));
        tray.position.y = 0.003;
        group.add(tray);
        const tissue = this._mat(this._itemColor(rand, [0xB07A72, 0xA86A64, 0xC08A80]),
          { roughness: 0.8, metalness: 0.0 });
        const part = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.042, this.seg(10, 6)), tissue);
        part.rotation.z = Math.PI / 2;
        part.position.y = 0.018;
        group.add(part);
        for (const x of [-0.021, 0.021]) {
          const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, this.seg(10, 6), this.seg(8, 5)), tissue);
          cap.position.set(x, 0.018, 0);
          group.add(cap);
        }
        return group;
      },

      // ======================================================================
      // Big things
      // ======================================================================

      // Vehicles: a thing with wheels, reduced to the two axles and a hull
      // that every one of them shares.
      createVehicleItemModel(entry, rand) {
        const group = new THREE.Group();
        const hull = this._mat(this._itemColor(rand, [0x8A2A2A, 0x2A4A8A, 0x2A2A2A, 0xC8C0B0]),
          { roughness: 0.4, metalness: 0.5 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.05), hull);
        body.position.y = 0.032;
        group.add(body);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.045),
          this._mat(0x22303A, { roughness: 0.2, metalness: 0.3 }));
        cabin.position.set(-0.008, 0.056, 0);
        group.add(cabin);
        const rubber = this._mat(0x1A1A1A, { roughness: 0.95, metalness: 0.0 });
        for (const x of [-0.035, 0.035]) {
          for (const z of [-0.026, 0.026]) {
            const wheel = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.016, 0.01, this.seg(12, 7)), rubber);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(x, 0.016, z);
            group.add(wheel);
          }
        }
        return group;
      },

      // The floor of the whole pipeline: an unmarked crate. Nothing reaches it
      // unless its category has no builder at all.
      createGenericItemModel(entry, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this._itemColor(rand, [0x8A6A42, 0x6A5232, 0x9A7A52]));
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.06), wood);
        box.position.y = 0.025;
        group.add(box);
        if (this.wantsTrim()) {
          const band = this._steel(0x8A8E94, 0.5);
          for (const y of [0.012, 0.038]) {
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.005, 0.062), band);
            strap.position.y = y;
            group.add(strap);
          }
        }
        return group;
      },

      // ======================================================================
      // Armour
      // ======================================================================
      // An armour is drawn as the piece itself, standing as it would be worn:
      // a helm crown-up, a cuirass chest-forward, a boot sole-down. The slot
      // decides the silhouette, the armour type inside it the material.

      /** The colour and finish an armour is built out of, by armour type. */
      _armorFinish(entry, rand) {
        const at = entry.atypeId || 1;
        if (at >= 4) return this._steel(this._itemColor(rand, [0x8A8E96, 0x6E747C, 0xA8ADB4]), 0.3);
        if (at === 3) return this._mat(this._itemColor(rand, [0x5A3A22, 0x3A2A2A, 0x4A4230]),
          { roughness: 0.9, metalness: 0.05 });
        if (at === 2) return this._mat(this._itemColor(rand, [0x3A2A5A, 0x22404A, 0x4A2A3A]),
          { roughness: 0.85, metalness: 0.05 });
        return this._mat(this._itemColor(rand, [0x6A6A72, 0x7A5A4A, 0x4A5A6A, 0x8A7A62]),
          { roughness: 0.92, metalness: 0.0 });
      },

      // Head, generic: a skull-fitting dome with a rim.
      createHeadArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.038, this.seg(14, 8), this.seg(10, 6), 0, Math.PI * 2, 0, Math.PI / 2), mat);
        dome.position.y = 0.012;
        group.add(dome);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.038, 0.004, this.seg(6, 4), this.seg(16, 9)), mat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.012;
        group.add(rim);
        if (this.wantsTrim() && (entry.atypeId || 1) >= 4) {
          const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.004), mat);
          nasal.position.set(0, 0.004, 0.036);
          group.add(nasal);
        }
        return group;
      },

      // Head, soft: a hat, with a crown and a brim rather than a shell.
      createHatArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const brim = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.058, 0.004, this.seg(16, 9)), mat);
        brim.position.y = 0.002;
        group.add(brim);
        const crown = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.034, 0.04, this.seg(14, 8)), mat);
        crown.position.y = 0.024;
        group.add(crown);
        if (this.wantsTrim()) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.034, 0.003, this.seg(6, 4), this.seg(14, 8)),
            this._mat(0x2A2A2A, { roughness: 0.9, metalness: 0.0 }));
          band.rotation.x = Math.PI / 2;
          band.position.y = 0.008;
          group.add(band);
        }
        return group;
      },

      // Body, generic: a cuirass, the chest curved forward and the shoulders
      // squared off.
      createBodyArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const chest = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.036, 0.09, this.seg(14, 8), 1, true), mat);
        chest.scale.z = 0.62;
        chest.position.y = 0.055;
        chest.material.side = THREE.DoubleSide;
        group.add(chest);
        for (const s of [-1, 1]) {
          const pauldron = new THREE.Mesh(
            new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2), mat);
          pauldron.position.set(s * 0.042, 0.094, 0);
          pauldron.rotation.z = s * 0.5;
          group.add(pauldron);
        }
        if (this.wantsTrim() && (entry.atypeId || 1) >= 3) {
          const belt = new THREE.Mesh(
            new THREE.TorusGeometry(0.038, 0.004, this.seg(6, 4), this.seg(16, 9)),
            this._mat(0x3A2A1E, { roughness: 0.9, metalness: 0.0 }));
          belt.rotation.x = Math.PI / 2;
          belt.scale.z = 0.62;
          belt.position.y = 0.018;
          group.add(belt);
        }
        return group;
      },

      // Body, cloth: a shirt on the shoulders, sleeves out to the sides.
      createClothesArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        mat.side = THREE.DoubleSide;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.08, 0.03), mat);
        torso.position.y = 0.05;
        group.add(torso);
        for (const s of [-1, 1]) {
          const sleeve = new THREE.Mesh(
            new THREE.CylinderGeometry(0.014, 0.012, 0.045, this.seg(10, 6)), mat);
          sleeve.rotation.z = Math.PI / 2 - s * 0.25;
          sleeve.position.set(s * 0.05, 0.076, 0);
          group.add(sleeve);
        }
        const collar = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.004, this.seg(6, 4), this.seg(12, 7)), mat);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.09;
        group.add(collar);
        return group;
      },

      // Body, robe: one fall of cloth from the shoulders to the floor.
      createRobeArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        mat.side = THREE.DoubleSide;
        const robe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.055, 0.12, this.seg(14, 8), 1, true), mat);
        robe.position.y = 0.06;
        group.add(robe);
        const hood = new THREE.Mesh(
          new THREE.SphereGeometry(0.026, this.seg(12, 7), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2), mat);
        hood.position.y = 0.118;
        group.add(hood);
        if (this.wantsTrim()) {
          const cord = new THREE.Mesh(
            new THREE.TorusGeometry(0.042, 0.003, this.seg(6, 4), this.seg(14, 8)),
            this._mat(0xC8A54A, { roughness: 0.6, metalness: 0.3 }));
          cord.rotation.x = Math.PI / 2;
          cord.position.y = 0.044;
          group.add(cord);
        }
        return group;
      },

      // Off-hand, generic: a bracer, which is what fills the slot when it is
      // neither a shield nor a ward.
      createOffhandArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        mat.side = THREE.DoubleSide;
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.03, 0.07, this.seg(14, 8), 1, true), mat);
        cuff.position.y = 0.035;
        group.add(cuff);
        this._rivets(group, this._steel(0x8A8E94, 0.4), 3, 0.016, 0.02, 0.003, 0.028, 0);
        return group;
      },

      // Off-hand, magical: a ward. A sigil plate hanging in the air above its
      // stand, turning.
      createWardArmorModel(entry, rand) {
        const group = new THREE.Group();
        const hue = this._itemColor(rand, [0x6A5AE0, 0x50C8B0, 0xE05A9A, 0x50A0E0]);
        const stand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.026, 0.01, this.seg(12, 7)),
          this._mat(0x3A3038, { roughness: 0.6, metalness: 0.4 }));
        stand.position.y = 0.005;
        group.add(stand);
        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.004, 6), this._glow(hue, 0.65));
        plate.rotation.x = Math.PI / 2;
        plate.position.y = 0.05;
        plate.userData.spin = { axis: 'y', speed: 0.5 };
        plate.userData.pulse = { freq: 1.2, min: 0.4, max: 0.9 };
        group.add(plate);
        return group;
      },

      // Off-hand, shield: the shield models already exist on the weapon side,
      // built face-on with the grip behind the plate. An armour is wrapped
      // into the shape that pipeline expects rather than drawn twice, then
      // stood on its rim so it sits like the other item models.
      createShieldArmorModel(entry, rand) {
        const wrapped = {
          id: entry.id, name: entry.name, note: entry.note || '',
          wtypeId: 0, shieldArmorId: entry.id
        };
        const model = this.createShieldModel
          ? this.createShieldModel(wrapped, rand)
          : null;
        if (!model) return this.createOffhandArmorModel(entry, rand);
        // The weapon pipeline builds a shield at arm scale, face-on and
        // centred on its grip. Here it is one item among the others, so it is
        // brought down to their scale and stood on its rim.
        const group = new THREE.Group();
        group.add(this._standOn(model, 0.19));
        return group;
      },

      // Accessory, generic: a pendant on a chain.
      createAccessoryArmorModel(entry, rand) {
        const group = new THREE.Group();
        const metal = this._mat(this._itemColor(rand, [0xC8A54A, 0xB0B4BC, 0xB08A6A]),
          { roughness: 0.35, metalness: 0.85 });
        const chain = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.002, this.seg(6, 4), this.seg(18, 10)), metal);
        chain.position.y = 0.062;
        group.add(chain);
        const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0),
          this._mat(this._itemColor(rand, [0x50A0E0, 0xC85A6A, 0x50C890, 0xE0C040]),
            { roughness: 0.2, metalness: 0.3 }));
        stone.position.y = 0.026;
        group.add(stone);
        const bail = new THREE.Mesh(
          new THREE.TorusGeometry(0.005, 0.0015, this.seg(6, 4), this.seg(10, 6)), metal);
        bail.position.y = 0.04;
        group.add(bail);
        return group;
      },

      // Accessory, hands: a gauntlet, fingers forward.
      createGauntletArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.026, 0.045, this.seg(12, 7)), mat);
        cuff.position.y = 0.022;
        group.add(cuff);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.016), mat);
        back.position.y = 0.058;
        group.add(back);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.018, 0.01), mat);
            finger.position.set(-0.013 + i * 0.009, 0.08, 0);
            group.add(finger);
          }
        }
        return group;
      },

      // Accessory, feet: a boot, sole down and toe forward.
      createBootArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.085),
          this._mat(0x2A2A2A, { roughness: 0.95, metalness: 0.0 }));
        sole.position.set(0, 0.004, 0.012);
        group.add(sole);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.078), mat);
        foot.position.set(0, 0.021, 0.012);
        group.add(foot);
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.019, 0.022, 0.055, this.seg(12, 7)), mat);
        shaft.position.set(0, 0.06, -0.012);
        group.add(shaft);
        return group;
      },

      // Accessory, carried: a pack, with a flap and a strap over it.
      createPackArmorModel(entry, rand) {
        const group = new THREE.Group();
        const mat = this._armorFinish(entry, rand);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.038), mat);
        body.position.y = 0.038;
        group.add(body);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.026, 0.04), mat);
        flap.position.y = 0.084;
        group.add(flap);
        const strap = this._mat(0x3A2A1E, { roughness: 0.9, metalness: 0.0 });
        for (const x of [-0.018, 0.018]) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.004), strap);
          s.position.set(x, 0.045, -0.021);
          group.add(s);
        }
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.003),
          this._steel(0x9AA0A8, 0.4));
        buckle.position.set(0, 0.07, 0.02);
        group.add(buckle);
        return group;
      }
    }
  });
})();
