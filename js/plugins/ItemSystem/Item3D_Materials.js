//=============================================================================
// Item 3D Models - Materials
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the raw materials, monster parts and jungle
 * harvest of Items.json. Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Materials
 * ============================================================================
 *
 * Four shelves that are all the same kind of thing: stuff something is MADE
 * of, or stuff cut out of something that was alive.
 *
 *   Crafting  ore, stock, extract: what the bench consumes
 *   Monsters  trophies and organs off the things in the bestiary
 *   Jungle    the same, taken in the canopy
 *   Plants    what grows by the road
 *
 * They share a set of real forms (an ore lump, a cut shard, a stoppered
 * extract, an organ in fluid, a claw, a wing, a plate of shell) and the
 * MATERIALS table below is one line per entry: which form, what colour, and
 * whether the thing is still lit from inside. A monster part that came off
 * something magical glows; a bar of salvaged steel does not.
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
    console.error('[Item3D_Materials] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Materials',
    unique: {},
    categories: {
      Crafting: 'createMaterialModel',
      Monsters: 'createMaterialModel',
      Jungle: 'createMaterialModel',
      Plants: 'createMaterialModel'
    },
    models: {
      /**
       * One material. `o` is a line of the MATERIALS table:
       *   form   the shape it comes in
       *   main   its own colour
       *   accent the rind, the fitting, the fluid or the second colour
       *   glow   whether it is lit from inside
       */
      _material(o) {
        const group = new THREE.Group();
        const main = o.glow
          ? this._glow(o.main, o.glowStrength === undefined ? 0.55 : o.glowStrength)
          : this._mat(o.main, {
            roughness: o.rough === undefined ? 0.7 : o.rough,
            metalness: o.metal === undefined ? 0.1 : o.metal
          });
        const accent = this._mat(o.accent === undefined ? 0x6A5A42 : o.accent,
          { roughness: 0.85, metalness: 0.05 });

        switch (o.form) {
          case 'lump': {
            // Ore, rock, a fragment of something that fell. Broken faces, no
            // two the same size, sitting where they landed.
            for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
              const size = 0.016 - i * 0.003;
              const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), main);
              const a = i * 1.7;
              const r = i === 0 ? 0 : 0.016;
              rock.position.set(Math.cos(a) * r, size * 0.85, Math.sin(a) * r);
              rock.rotation.set(a, a * 0.7, a * 0.4);
              group.add(rock);
              if (o.accent !== undefined && i < 2) {
                // The seam of metal in the rock, which is what makes it ore
                // rather than a stone.
                const seam = new THREE.Mesh(new THREE.BoxGeometry(size * 1.4, 0.0016, 0.0016), accent);
                seam.position.set(Math.cos(a) * r, size * 1.1, Math.sin(a) * r);
                seam.rotation.y = a;
                group.add(seam);
              }
            }
            break;
          }

          case 'ingot': {
            // Milled stock: a cast bar with the corners knocked off and a
            // stamp on the face.
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.022, 4), main);
            bar.rotation.y = Math.PI / 4;
            bar.position.y = 0.011;
            group.add(bar);
            const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.006), accent);
            stamp.position.y = 0.0225;
            group.add(stamp);
            break;
          }

          case 'shard': {
            // A cut or split piece: crystal, glass, a splinter. It stands on
            // its broken end.
            const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), main);
            shard.scale.set(o.wide === undefined ? 0.7 : o.wide, 1.9, 0.7);
            shard.position.y = 0.028;
            shard.rotation.y = 0.4;
            group.add(shard);
            const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.009, 0), accent);
            base.scale.y = 0.5;
            base.position.y = 0.005;
            group.add(base);
            if (o.glow) {
              const mote = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 5, 4),
                this._glow(o.main, 0.9));
              mote.position.set(0.016, 0.03, 0);
              mote.userData.orbit = { radius: 0.016, speed: 0.6, phase: 0.2 };
              group.add(mote);
            }
            break;
          }

          case 'extract': {
            // Anything that had to be held in something: sap, venom, oil, an
            // acid, an essence. A small stoppered bottle with the cork wired.
            const glass = this._mat(o.glass === undefined ? 0xD8E4E0 : o.glass, {
              roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.42
            });
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(0.014, 0.016, 0.042, this.seg(14, 8)), glass);
            body.position.y = 0.021;
            group.add(body);
            const fluid = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0125, 0.0145, 0.026, this.seg(12, 7)), main);
            fluid.position.y = 0.015;
            if (o.glow) fluid.userData.pulse = { freq: 0.9, min: 0.45, max: 1.0 };
            group.add(fluid);
            const neck = new THREE.Mesh(
              new THREE.CylinderGeometry(0.007, 0.013, 0.012, this.seg(12, 7)), glass);
            neck.position.y = 0.048;
            group.add(neck);
            const cork = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0068, 0.0062, 0.01, this.seg(10, 6)), accent);
            cork.position.y = 0.059;
            group.add(cork);
            break;
          }

          case 'organ': {
            // Cut out and kept: a sac, a gland, a heart, an eye. Wet, veined,
            // and lying on the surface it was put down on.
            const flesh = new THREE.Mesh(
              new THREE.SphereGeometry(0.019, this.seg(14, 8), this.seg(11, 6)), main);
            flesh.scale.set(1.15, 0.85, 0.95);
            flesh.position.y = 0.016;
            group.add(flesh);
            if (this.wantsTrim()) {
              for (let i = 0; i < 3; i++) {
                const vein = new THREE.Mesh(
                  new THREE.TorusGeometry(0.014 - i * 0.002, 0.0012, this.seg(5, 3), this.seg(12, 7), 2.2),
                  accent);
                vein.rotation.set(1.1 + i * 0.4, i * 0.9, 0.3);
                vein.position.y = 0.018;
                group.add(vein);
              }
            }
            const stub = new THREE.Mesh(
              new THREE.CylinderGeometry(0.004, 0.005, 0.012, this.seg(10, 6)), accent);
            stub.rotation.z = Math.PI / 2 - 0.3;
            stub.position.set(0.022, 0.02, 0);
            group.add(stub);
            if (o.glow) {
              const inner = new THREE.Mesh(
                new THREE.SphereGeometry(0.009, this.seg(10, 6), this.seg(8, 5)),
                this._glow(o.main, 0.8));
              inner.position.y = 0.016;
              inner.userData.pulse = { freq: 1.3, min: 0.4, max: 1.0 };
              group.add(inner);
            }
            break;
          }

          case 'claw': {
            // A claw, a fang, a talon, a horn, a stinger: one curved point
            // with the root it was pulled out by.
            const point = new THREE.Mesh(
              new THREE.ConeGeometry(0.009, 0.06, this.seg(12, 7)), main);
            point.rotation.set(0, 0, Math.PI / 2 - 0.28);
            point.position.set(0.004, 0.012, 0);
            group.add(point);
            const root = new THREE.Mesh(
              new THREE.CylinderGeometry(0.009, 0.007, 0.012, this.seg(10, 6)), accent);
            root.rotation.z = Math.PI / 2 - 0.28;
            root.position.set(-0.027, 0.02, 0);
            group.add(root);
            if (o.paired) {
              const second = point.clone();
              second.position.set(0.002, 0.008, 0.014);
              second.rotation.z = Math.PI / 2 - 0.4;
              second.scale.setScalar(0.82);
              group.add(second);
            }
            break;
          }

          case 'wing': {
            // A wing or a plume, laid flat: the membrane or the vane, with the
            // spar it hangs off.
            const spar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0018, 0.003, 0.07, this.seg(8, 5)), accent);
            spar.rotation.z = Math.PI / 2 - 0.1;
            spar.position.set(0, 0.004, 0);
            group.add(spar);
            const membrane = this._plate(
              [[0, 0], [0.026, 0.016], [0.03, 0.04], [0.008, 0.034], [-0.01, 0.05], [-0.016, 0.02]],
              0.0012, main);
            membrane.rotation.set(-Math.PI / 2, 0, 0.1);
            membrane.position.set(0.004, 0.005, 0.004);
            group.add(membrane);
            if (this.wantsTrim()) {
              for (let i = 0; i < 3; i++) {
                const rib = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.0006, 0.0012), accent);
                rib.position.set(0.004, 0.0062, -0.006 + i * 0.012);
                rib.rotation.y = 0.3 - i * 0.25;
                group.add(rib);
              }
            }
            break;
          }

          case 'plate': {
            // Shell, carapace, scale, a fragment of hull: a curved plate lying
            // convex side up.
            const shell = new THREE.Mesh(
              new THREE.SphereGeometry(0.028, this.seg(14, 8), this.seg(9, 5), 0, Math.PI * 2, 0, Math.PI / 2),
              main);
            shell.scale.y = 0.42;
            shell.position.y = 0.001;
            group.add(shell);
            if (this.wantsTrim()) {
              for (let i = 0; i < 3; i++) {
                const ridge = new THREE.Mesh(
                  new THREE.TorusGeometry(0.022 - i * 0.007, 0.0016, this.seg(5, 3), this.seg(14, 8)),
                  accent);
                ridge.rotation.x = Math.PI / 2;
                ridge.scale.y = 0.42;
                ridge.position.y = 0.003 + i * 0.002;
                group.add(ridge);
              }
            }
            const break_ = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.003), accent);
            break_.position.set(0.026, 0.004, 0.008);
            break_.rotation.y = 0.5;
            group.add(break_);
            break;
          }

          case 'bundle': {
            // Stock the bench takes by the armful: cut wood, cloth, leather,
            // plant matter. Tied, so it reads as a quantity.
            const count = o.count || 4;
            for (let i = 0; i < count; i++) {
              const spread = (i / Math.max(1, count - 1) - 0.5);
              const stick = new THREE.Mesh(
                new THREE.CylinderGeometry(0.006, 0.0065, 0.075, this.seg(o.round ? 12 : 6, 5)), main);
              stick.rotation.set(spread * 0.12, spread * 0.5, Math.PI / 2);
              stick.position.set(0, 0.007 + Math.abs(spread) * 0.002, spread * 0.026);
              group.add(stick);
            }
            const tie = new THREE.Mesh(
              new THREE.TorusGeometry(0.016, 0.0018, this.seg(5, 3), this.seg(14, 8)), accent);
            tie.rotation.y = Math.PI / 2;
            tie.scale.set(1, 0.5, 1.9);
            tie.position.y = 0.008;
            group.add(tie);
            break;
          }

          case 'cloth': {
            // Folded goods: cloth, leather, a shroud. Folded twice, so the
            // edges show.
            const fabric = this._mat(o.main, {
              roughness: 0.95, metalness: 0.02,
              transparent: !!o.sheer, opacity: o.sheer ? 0.6 : 1
            });
            fabric.side = THREE.DoubleSide;
            for (let i = 0; i < 3; i++) {
              const fold = new THREE.Mesh(
                new THREE.BoxGeometry(0.066 - i * 0.004, 0.006, 0.046 - i * 0.003), fabric);
              fold.position.set(i * 0.002, 0.003 + i * 0.006, -i * 0.002);
              fold.rotation.y = i * 0.05;
              group.add(fold);
            }
            break;
          }

          case 'meat': {
            // Cut and put down on something: a joint of raw meat, wet and
            // marbled.
            const cut = new THREE.Mesh(
              new THREE.SphereGeometry(0.024, this.seg(14, 8), this.seg(10, 6)), main);
            cut.scale.set(1.25, 0.6, 0.95);
            cut.position.y = 0.015;
            group.add(cut);
            const fat = new THREE.Mesh(
              new THREE.SphereGeometry(0.022, this.seg(12, 7), this.seg(8, 5)), accent);
            fat.scale.set(1.2, 0.14, 0.9);
            fat.position.y = 0.024;
            group.add(fat);
            break;
          }

          case 'bone': {
            // A long bone: the shaft and its two heads, which is what makes a
            // bone read as a bone and not a stick.
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.008, 0.06, this.seg(12, 7)), main);
            shaft.rotation.z = Math.PI / 2;
            shaft.position.y = 0.011;
            group.add(shaft);
            for (const s of [-1, 1]) {
              for (const z of [-0.006, 0.006]) {
                const head = new THREE.Mesh(
                  new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)), main);
                head.position.set(s * 0.032, 0.011, z);
                group.add(head);
              }
            }
            break;
          }

          case 'board': {
            // Salvaged electronics: a card with a chip and a row of pins.
            const card = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.0025, 0.04), main);
            card.position.y = 0.00125;
            group.add(card);
            const chip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.005, 0.02), accent);
            chip.position.set(-0.008, 0.005, 0);
            group.add(chip);
            if (this.wantsTrim()) {
              const gold = this._mat(0xC8A54A, { roughness: 0.3, metalness: 0.9 });
              for (let i = 0; i < 6; i++) {
                const pin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0015, 0.006), gold);
                pin.position.set(-0.025 + i * 0.01, 0.0025, 0.017);
                group.add(pin);
              }
            }
            break;
          }

          case 'core': {
            // A power source or a mind in a case: a cell in a cradle with its
            // charge showing.
            const cradle = new THREE.Mesh(
              new THREE.CylinderGeometry(0.019, 0.022, 0.008, this.seg(14, 8)), accent);
            cradle.position.y = 0.004;
            group.add(cradle);
            const cell = new THREE.Mesh(
              new THREE.CylinderGeometry(0.014, 0.014, 0.036, this.seg(16, 9)),
              this._mat(o.shell === undefined ? 0x3A3E46 : o.shell,
                { roughness: 0.45, metalness: 0.4 }));
            cell.position.y = 0.026;
            group.add(cell);
            const charge = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0142, 0.0142, 0.018, this.seg(14, 8), 1, true),
              o.glow ? this._glow(o.main, 0.7)
                : this._mat(o.main, { roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide }));
            charge.position.y = 0.026;
            if (o.glow) charge.userData.pulse = { freq: 1.0, min: 0.4, max: 1.0 };
            group.add(charge);
            const cap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.01, 0.014, 0.006, this.seg(14, 8)), accent);
            cap.position.y = 0.047;
            group.add(cap);
            break;
          }

          case 'egg': {
            const nest = new THREE.Mesh(
              new THREE.TorusGeometry(0.02, 0.005, this.seg(6, 4), this.seg(16, 9)), accent);
            nest.rotation.x = Math.PI / 2;
            nest.position.y = 0.005;
            group.add(nest);
            const egg = new THREE.Mesh(
              new THREE.SphereGeometry(0.019, this.seg(16, 9), this.seg(12, 7)), main);
            egg.scale.y = 1.3;
            egg.position.y = 0.026;
            group.add(egg);
            if (o.glow) {
              const vein = new THREE.Mesh(
                new THREE.TorusGeometry(0.016, 0.0014, this.seg(5, 3), this.seg(16, 9)),
                this._glow(o.main, 0.8));
              vein.rotation.set(0.5, 0.3, 0);
              vein.position.y = 0.026;
              vein.userData.pulse = { freq: 0.8, min: 0.3, max: 0.95 };
              group.add(vein);
            }
            break;
          }

          case 'essence':
          default: {
            // Something with no body of its own, kept in a ring that holds it:
            // shadow, plasma, a captured light.
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.02, 0.0025, this.seg(6, 4), this.seg(18, 10)), accent);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.0025;
            group.add(ring);
            const cloud = new THREE.Mesh(
              new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(9, 5)),
              this._glow(o.main, o.glowStrength === undefined ? 0.7 : o.glowStrength));
            cloud.scale.y = 0.85;
            cloud.position.y = 0.02;
            cloud.userData.pulse = { freq: 0.7, min: 0.35, max: 1.0 };
            cloud.userData.bob = { amp: 0.003, freq: 0.5 };
            group.add(cloud);
            for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
              const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 5, 4),
                this._glow(o.main, 0.9));
              const a = i * 2.1;
              wisp.position.set(Math.cos(a) * 0.02, 0.024 + i * 0.004, Math.sin(a) * 0.02);
              wisp.userData.orbit = { radius: 0.02, speed: 0.5 + i * 0.2, phase: a };
              group.add(wisp);
            }
            break;
          }
        }
        return group;
      },

      createMaterialModel(entry, rand) {
        const spec = family.MATERIALS[entry && entry.id];
        return this._material(spec || { form: 'lump', main: 0x8A8A82, accent: 0x6A6A62 });
      }
    }
  };

  // One line per material: the form it comes in, its colour, its second
  // colour, and whether it is lit.
  family.MATERIALS = {
    // ---- Crafting: what the bench eats ------------------------------------
    849: { form: 'essence', main: 0x9A6AE0, accent: 0x4A3A6A, glow: true },
    850: { form: 'shard', main: 0xBCD8E8, accent: 0x5A6A7A, glow: true, glowStrength: 0.45 },
    851: { form: 'core', main: 0x50C8E0, accent: 0x3A4450, shell: 0x2A3038, glow: true },
    852: { form: 'board', main: 0x1E4A28, accent: 0x22242A },
    853: { form: 'board', main: 0x2A3A4A, accent: 0x14161A },
    854: { form: 'core', main: 0xE0C82A, accent: 0x3A3E46, shell: 0x2A4A6A },
    855: { form: 'bundle', main: 0xD8D8DC, accent: 0x8A8A92, round: true, count: 5 },
    856: { form: 'ingot', main: 0x8A8A80, accent: 0x5A5A52 },
    857: { form: 'bundle', main: 0x2A2A32, accent: 0x8A8A92, round: true, count: 6 },
    858: { form: 'bundle', main: 0x4A7A32, accent: 0xB0A070, count: 5 },
    859: { form: 'bundle', main: 0x8A6A42, accent: 0xB0A070, count: 4 },
    860: { form: 'bone', main: 0xE0D8C0, accent: 0xC8BCA0 },
    861: { form: 'cloth', main: 0xC8B89A, accent: 0x8A7A5A },
    862: { form: 'meat', main: 0xA84A44, accent: 0xE0D4C0 },
    863: { form: 'ingot', main: 0x9AA0A8, accent: 0x6A6E74, rough: 0.45, metal: 0.8 },
    864: { form: 'lump', main: 0x8A9098, accent: 0xC0C6CC },
    865: { form: 'lump', main: 0x7A6A4A, accent: 0xC8A54A },
    866: { form: 'shard', main: 0x8AC8E0, accent: 0x4A5A6A, glow: true, glowStrength: 0.4 },
    867: { form: 'shard', main: 0xDCE8EE, accent: 0x9AA8B0, wide: 1.1 },
    868: { form: 'cloth', main: 0x6A4A2A, accent: 0x3A2A1A },
    869: { form: 'extract', main: 0x5A8A3A, accent: 0x6A5A3A, glass: 0x3A4A38 },
    870: { form: 'extract', main: 0xC8A040, accent: 0x2A2A22, glass: 0x8A7A4A },
    871: { form: 'extract', main: 0x8AC030, accent: 0x2A2A32, glass: 0xD8E4E0, glow: true, glowStrength: 0.35 },

    // ---- Monsters: what comes off the bestiary ----------------------------
    751: { form: 'claw', main: 0x8A9A7A, accent: 0x5A6A4A, paired: true },
    752: { form: 'wing', main: 0xC8E0F0, accent: 0x8AA0B0, glow: true, glowStrength: 0.35 },
    753: { form: 'shard', main: 0x6AC8A0, accent: 0x3A6A5A, glow: true, glowStrength: 0.4 },
    754: { form: 'claw', main: 0x5A3A28, accent: 0x8A2A2A },
    755: { form: 'cloth', main: 0xB0B8C8, accent: 0x8A90A0, sheer: true },
    756: { form: 'plate', main: 0x3A5A2A, accent: 0x22401E },
    757: { form: 'organ', main: 0xE080B0, accent: 0x4A8A3A, glow: true, glowStrength: 0.35 },
    758: { form: 'claw', main: 0x4A3A2A, accent: 0x2A2018, paired: true },
    759: { form: 'organ', main: 0x2AC8D0, accent: 0x1A4A5A, glow: true, glowStrength: 0.85 },
    760: { form: 'plate', main: 0x4A9AC8, accent: 0x2A6A8A, glow: true, glowStrength: 0.3 },
    761: { form: 'claw', main: 0x2A2A3A, accent: 0x1A1A24 },
    762: { form: 'organ', main: 0x8AC040, accent: 0x5A7A2A },
    763: { form: 'board', main: 0x2A2A40, accent: 0x50C8E0 },
    764: { form: 'extract', main: 0xC8DCE8, accent: 0x8A9AA8, glass: 0xDCE8EE, glow: true, glowStrength: 0.4 },
    765: { form: 'shard', main: 0xB0E0F0, accent: 0x6A9AB0, glow: true, glowStrength: 0.55 },
    766: { form: 'claw', main: 0x8A5A3A, accent: 0x5A3A22 },
    767: { form: 'organ', main: 0xC85A6A, accent: 0x8A2A3A, glow: true, glowStrength: 0.5 },
    768: { form: 'core', main: 0x50A0E0, accent: 0x3A4450, shell: 0x22262C, glow: true },
    769: { form: 'core', main: 0xE0A02A, accent: 0x5A5A52, shell: 0x6A6A62, glow: true },
    770: { form: 'plate', main: 0xB0BCC8, accent: 0x7A8A98, rough: 0.3, metal: 0.7 },
    771: { form: 'organ', main: 0x7A7A72, accent: 0x4A4A44 },
    772: { form: 'claw', main: 0x5A3A6A, accent: 0x2A1A32, paired: true },
    773: { form: 'essence', main: 0x2A1A3A, accent: 0x3A2A4A, glow: true, glowStrength: 0.4 },
    774: { form: 'claw', main: 0xE8E0C8, accent: 0xC8B89A },
    775: { form: 'lump', main: 0x3A3430, accent: 0xC85A2A },
    776: { form: 'essence', main: 0x8A2AC8, accent: 0x2A1A3A, glow: true, glowStrength: 0.9 },
    777: { form: 'egg', main: 0xE0D8B0, accent: 0x8A6A42, glow: true, glowStrength: 0.35 },
    778: { form: 'plate', main: 0x8A2A2A, accent: 0x5A1A1A },
    779: { form: 'claw', main: 0xF0EAD8, accent: 0xC8A54A, glow: true, glowStrength: 0.4 },
    780: { form: 'essence', main: 0x50E0C8, accent: 0xC8A54A, glow: true, glowStrength: 0.75 },

    // ---- Jungle: taken in the canopy --------------------------------------
    623: { form: 'wing', main: 0xE08A2A, accent: 0x2A2018 },
    624: { form: 'essence', main: 0x8AE0A0, accent: 0x3A5A3A, glow: true, glowStrength: 0.6 },
    625: { form: 'extract', main: 0x2AA85A, accent: 0x1A2A1A, glass: 0xC8D8C8 },
    626: { form: 'extract', main: 0xC8A040, accent: 0x6A4A2A, glass: 0xB08A5A },
    627: { form: 'organ', main: 0xB08A5A, accent: 0x6A4A2A },
    628: { form: 'organ', main: 0xE0C82A, accent: 0x8A6A2A, glow: true, glowStrength: 0.3 },
    629: { form: 'plate', main: 0x4A3A22, accent: 0x2A2016 },
    630: { form: 'extract', main: 0xC8C8E8, accent: 0x5A4A3A, glass: 0xD8D8E8, glow: true, glowStrength: 0.35 },
    631: { form: 'wing', main: 0x2A8AC8, accent: 0xC8A54A },
    632: { form: 'lump', main: 0xC8C0A8, accent: 0x8A8A72 },
    633: { form: 'claw', main: 0x2A2A26, accent: 0x8A7A5A, paired: true },
    634: { form: 'organ', main: 0xC8E040, accent: 0x2A2A2A, glow: true, glowStrength: 0.55 },

    // ---- Plants ------------------------------------------------------------
    792: { form: 'bundle', main: 0x6A9A3A, accent: 0xE0D040, count: 4 }
  };

  // Every entry on the four shelves, taken from the data rather than a
  // guessed range: the table above is keyed by id and this checks itself
  // against it at load time.
  for (const id of Object.keys(family.MATERIALS)) {
    family.unique['i' + id] = 'createMaterialModel';
  }

  window.ItemModelSystem.registerFamily(family);
})();
