//=============================================================================
// Item 3D Models - Magic
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the magic shelf of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Magic
 * ============================================================================
 *
 * Sixty-two enchanted things (ids 646-707). They are not one object with
 * different labels: a scroll, a bell and a pair of gauntlets have nothing in
 * common but the shelf. So this family is a set of real forms, and the ARCANE
 * table below is one line per entry saying which form it takes, what colour it
 * is and whether it is lit.
 *
 * The lighting is the through-line: an enchanted thing on this shelf glows,
 * and a fake one on the Counterfeits shelf does not. That is the only reliable
 * way to tell the Mundane Glowing Stone from the Sunburst Crystal at a glance,
 * so it is deliberate rather than decorative.
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
    console.error('[Item3D_Magic] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Magic',
    unique: {},
    categories: { Magic: 'createArcaneModel' },
    models: {
      /**
       * One enchanted thing. `o` is a line of the ARCANE table:
       *   form   which of the shapes below it takes
       *   main   its own colour
       *   accent the binding, the fitting or the fill
       *   glow   whether the enchantment shows as light
       */
      _arcane(o) {
        const group = new THREE.Group();
        const lit = (colour, strength) => this._glow(colour, strength === undefined ? 0.6 : strength);
        const main = o.glow ? lit(o.main, o.glowStrength)
          : this._mat(o.main, { roughness: o.rough === undefined ? 0.5 : o.rough, metalness: o.metal === undefined ? 0.1 : o.metal });
        const accent = this._mat(o.accent === undefined ? 0x8A6A3A : o.accent,
          { roughness: 0.55, metalness: 0.35 });

        switch (o.form) {
          case 'potion': {
            // A drinkable: a stoppered flask with the draught inside it, lit
            // when the draught is what does the work.
            const glass = this._mat(0xDCE8EE, {
              roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.35
            });
            const belly = new THREE.Mesh(
              new THREE.SphereGeometry(0.02, this.seg(14, 8), this.seg(11, 6)), glass);
            belly.scale.y = o.tall ? 1.15 : 0.9;
            belly.position.y = 0.022;
            group.add(belly);
            const draught = new THREE.Mesh(
              new THREE.SphereGeometry(0.016, this.seg(12, 7), this.seg(9, 5)), main);
            draught.scale.y = o.tall ? 1.0 : 0.65;
            draught.position.y = 0.019;
            if (o.glow) draught.userData.pulse = { freq: 1.1, min: 0.5, max: 1.0 };
            group.add(draught);
            const neck = new THREE.Mesh(
              new THREE.CylinderGeometry(0.006, 0.01, 0.018, this.seg(12, 7)), glass);
            neck.position.y = 0.048;
            group.add(neck);
            const stopper = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0062, 0.0058, 0.012, this.seg(10, 6)), accent);
            stopper.position.y = 0.061;
            group.add(stopper);
            break;
          }

          case 'thrown': {
            // Made to be broken: a heavy flask with a waxed seal and a cord
            // round its throat, so it reads as a weapon rather than a drink.
            const glass = this._mat(0xC8D4CC, {
              roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.45
            });
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.021, this.seg(14, 8), this.seg(10, 6)), glass);
            body.scale.y = 0.85;
            body.position.y = 0.019;
            group.add(body);
            const charge = new THREE.Mesh(
              new THREE.SphereGeometry(0.017, this.seg(12, 7), this.seg(9, 5)), main);
            charge.scale.y = 0.72;
            charge.position.y = 0.017;
            if (o.glow) charge.userData.pulse = { freq: 1.8, min: 0.45, max: 1.0 };
            group.add(charge);
            const throat = new THREE.Mesh(
              new THREE.CylinderGeometry(0.008, 0.011, 0.014, this.seg(12, 7)), glass);
            throat.position.y = 0.042;
            group.add(throat);
            const wax = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, this.seg(12, 7)), accent);
            wax.position.y = 0.052;
            group.add(wax);
            const cord = new THREE.Mesh(
              new THREE.TorusGeometry(0.0088, 0.0012, this.seg(5, 3), this.seg(12, 7)),
              this._mat(0x6A5A3A, { roughness: 1.0, metalness: 0.0 }));
            cord.rotation.x = Math.PI / 2;
            cord.position.y = 0.043;
            group.add(cord);
            break;
          }

          case 'scroll': {
            // Rolled, tied and sealed. The ribbon is the only thing that tells
            // one spell from the next until it is opened.
            const paper = this._mat(0xE0D2A8, { roughness: 0.98, metalness: 0.0 });
            const roll = new THREE.Mesh(
              new THREE.CylinderGeometry(0.013, 0.013, 0.09, this.seg(16, 9)), paper);
            roll.rotation.z = Math.PI / 2;
            roll.position.y = 0.013;
            group.add(roll);
            for (const s of [-1, 1]) {
              const cap = new THREE.Mesh(
                new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, this.seg(14, 8)), accent);
              cap.rotation.z = Math.PI / 2;
              cap.position.set(s * 0.047, 0.013, 0);
              group.add(cap);
            }
            const ribbon = new THREE.Mesh(
              new THREE.TorusGeometry(0.0138, 0.002, this.seg(5, 3), this.seg(14, 8)), main);
            ribbon.rotation.y = Math.PI / 2;
            ribbon.position.y = 0.013;
            group.add(ribbon);
            const wax = new THREE.Mesh(
              new THREE.CylinderGeometry(0.005, 0.005, 0.0025, this.seg(12, 7)),
              o.glow ? lit(o.main, 0.5) : this._mat(0x8A1E22, { roughness: 0.6, metalness: 0.05 }));
            wax.position.set(0, 0.027, 0);
            group.add(wax);
            break;
          }

          case 'crystal': {
            // A cut stone standing on its own base: crystal, shard, amber,
            // anchor stone. Bigger and brighter the more it holds.
            const base = new THREE.Mesh(
              new THREE.CylinderGeometry(0.016, 0.02, 0.006, this.seg(14, 8)), accent);
            base.position.y = 0.003;
            group.add(base);
            const size = o.big ? 0.02 : 0.015;
            const stone = new THREE.Mesh(
              o.rough === 1 ? new THREE.DodecahedronGeometry(size, 0) : new THREE.OctahedronGeometry(size, 0),
              main);
            stone.scale.y = o.tall ? 1.6 : 1.15;
            stone.position.y = 0.006 + size * (o.tall ? 1.5 : 1.1);
            if (o.glow) {
              stone.userData.pulse = { freq: 0.9, min: 0.45, max: 1.0 };
              stone.userData.spin = { axis: 'y', speed: 0.3 };
            }
            group.add(stone);
            if (o.glow && this.wantsTrim()) {
              const mote = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 5, 4), lit(o.main, 0.9));
              mote.position.set(0.02, 0.03, 0);
              mote.userData.orbit = { radius: 0.02, speed: 0.7, phase: 0.3 };
              group.add(mote);
            }
            break;
          }

          case 'trinket': {
            // Worn: an amulet on its cord, or a band lying open. The pendant
            // is what carries the enchantment, so it is what lights.
            if (o.band) {
              const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.012, 0.0028, this.seg(8, 5), this.seg(20, 11)), accent);
              ring.rotation.x = Math.PI / 2;
              ring.position.y = 0.0028;
              group.add(ring);
              const set = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), main);
              set.position.set(0, 0.007, -0.012);
              if (o.glow) set.userData.pulse = { freq: 1.0, min: 0.4, max: 1.0 };
              group.add(set);
            } else {
              const cord = new THREE.Mesh(
                new THREE.TorusGeometry(0.024, 0.0014, this.seg(5, 3), this.seg(20, 11)),
                this._mat(0x3A2A1E, { roughness: 1.0, metalness: 0.0 }));
              cord.rotation.x = Math.PI / 2;
              cord.position.y = 0.0014;
              group.add(cord);
              const bezel = new THREE.Mesh(
                new THREE.TorusGeometry(0.009, 0.0022, this.seg(6, 4), this.seg(16, 9)), accent);
              bezel.rotation.x = Math.PI / 2;
              bezel.position.set(0, 0.0025, 0.02);
              group.add(bezel);
              const stone = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, 0.003, this.seg(14, 8)), main);
              stone.position.set(0, 0.0025, 0.02);
              if (o.glow) stone.userData.pulse = { freq: 0.8, min: 0.35, max: 1.0 };
              group.add(stone);
            }
            break;
          }

          case 'circlet': {
            // A band for the head, lying flat: a circlet, or a crown of
            // flowers with the blooms still on it.
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.03, 0.0025, this.seg(6, 4), this.seg(22, 12)), accent);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.0025;
            group.add(band);
            const count = o.blooms ? 5 : 1;
            for (let i = 0; i < count; i++) {
              const a = i * Math.PI * 2 / count;
              const bloom = new THREE.Mesh(
                o.blooms
                  ? new THREE.SphereGeometry(0.006, this.seg(10, 6), this.seg(8, 5))
                  : new THREE.OctahedronGeometry(0.007, 0), main);
              if (o.blooms) bloom.scale.y = 0.65;
              bloom.position.set(Math.cos(a) * 0.03, 0.007, Math.sin(a) * 0.03);
              if (o.glow) bloom.userData.pulse = { freq: 0.7 + i * 0.1, min: 0.4, max: 1.0 };
              group.add(bloom);
            }
            break;
          }

          case 'cloth': {
            // Folded cloth: a cloak, a wrap. The fold is what makes it read as
            // cloth rather than a board.
            const fabric = this._mat(o.main, {
              roughness: 0.92, metalness: 0.02,
              transparent: !!o.sheer, opacity: o.sheer ? 0.65 : 1
            });
            fabric.side = THREE.DoubleSide;
            const under = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.05), fabric);
            under.position.y = 0.007;
            group.add(under);
            const over = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.012, 0.046), fabric);
            over.position.set(0.004, 0.02, -0.004);
            over.rotation.z = 0.05;
            group.add(over);
            const clasp = new THREE.Mesh(
              new THREE.CylinderGeometry(0.006, 0.006, 0.002, this.seg(12, 7)), accent);
            clasp.rotation.x = Math.PI / 2;
            clasp.position.set(-0.022, 0.027, 0.008);
            group.add(clasp);
            break;
          }

          case 'pouch': {
            // A drawn bag: dust, soil, seed, or a bag with a hole in the world
            // at the bottom of it.
            const cloth = this._mat(o.main, { roughness: 0.98, metalness: 0.0 });
            const body = new THREE.Mesh(
              new THREE.SphereGeometry(0.02, this.seg(12, 7), this.seg(9, 5)), cloth);
            body.scale.set(1, 0.9, 0.85);
            body.position.y = 0.018;
            group.add(body);
            const throat = new THREE.Mesh(
              new THREE.CylinderGeometry(0.009, 0.016, 0.016, this.seg(12, 7)), cloth);
            throat.position.y = 0.038;
            group.add(throat);
            const cord = new THREE.Mesh(
              new THREE.TorusGeometry(0.0095, 0.0014, this.seg(5, 3), this.seg(12, 7)), accent);
            cord.rotation.x = Math.PI / 2;
            cord.position.y = 0.04;
            group.add(cord);
            if (o.glow) {
              const spill = new THREE.Mesh(
                new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)), lit(o.spill || o.main, 0.8));
              spill.position.set(0.016, 0.046, 0);
              spill.userData.bob = { amp: 0.004, freq: 0.9 };
              group.add(spill);
            }
            break;
          }

          case 'feather': {
            // One shed feather, lying with the quill down.
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0012, 0.002, 0.08, this.seg(8, 5)),
              this._mat(0xF0EFE8, { roughness: 0.7, metalness: 0.0 }));
            shaft.rotation.z = Math.PI / 2 - 0.12;
            shaft.position.set(0, 0.006, 0);
            group.add(shaft);
            const vane = this._plate(
              [[0, 0], [0.012, 0.014], [0.013, 0.045], [0, 0.06], [-0.013, 0.045], [-0.012, 0.014]],
              0.001, main);
            vane.rotation.set(-Math.PI / 2, 0, 0.12);
            vane.position.set(0.01, 0.007, 0);
            group.add(vane);
            if (o.glow) {
              const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 5, 4), lit(o.main, 0.9));
              spark.position.set(0.03, 0.012, 0.008);
              spark.userData.pulse = { freq: 1.3, min: 0.25, max: 1.0 };
              group.add(spark);
            }
            break;
          }

          case 'vessel': {
            // A jar or a chalice: something kept, rather than something drunk
            // in one go.
            if (o.stemmed) {
              const foot = new THREE.Mesh(
                new THREE.CylinderGeometry(0.016, 0.019, 0.005, this.seg(16, 9)), accent);
              foot.position.y = 0.0025;
              group.add(foot);
              const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.005, 0.005, 0.018, this.seg(10, 6)), accent);
              stem.position.y = 0.014;
              group.add(stem);
              const bowl = new THREE.Mesh(
                new THREE.CylinderGeometry(0.021, 0.01, 0.026, this.seg(16, 9), 1, true), accent);
              bowl.material.side = THREE.DoubleSide;
              bowl.position.y = 0.036;
              group.add(bowl);
              const fill = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.012, 0.016, this.seg(14, 8)), main);
              fill.position.y = 0.033;
              if (o.glow) fill.userData.pulse = { freq: 0.9, min: 0.45, max: 1.0 };
              group.add(fill);
            } else {
              const glass = this._mat(0xD8E4E0, {
                roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.4
              });
              const jar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.021, 0.021, 0.045, this.seg(16, 9)), glass);
              jar.position.y = 0.0225;
              group.add(jar);
              const contents = new THREE.Mesh(
                new THREE.CylinderGeometry(0.019, 0.019, 0.026, this.seg(14, 8)), main);
              contents.position.y = 0.015;
              if (o.glow) contents.userData.pulse = { freq: 0.7, min: 0.4, max: 0.95 };
              group.add(contents);
              const lid = new THREE.Mesh(
                new THREE.CylinderGeometry(0.022, 0.022, 0.006, this.seg(16, 9)), accent);
              lid.position.y = 0.048;
              group.add(lid);
            }
            break;
          }

          case 'relic':
          default: {
            // Everything with a fitting and a body: the bell, the whistle, the
            // key, the thimble. A turned body under a worked head.
            const body = new THREE.Mesh(
              new THREE.CylinderGeometry(o.wide ? 0.018 : 0.008, o.wide ? 0.02 : 0.01, 0.03, this.seg(14, 8)),
              main);
            body.position.y = 0.015;
            group.add(body);
            const head = new THREE.Mesh(
              new THREE.SphereGeometry(0.008, this.seg(12, 7), this.seg(9, 5)), accent);
            head.scale.y = 0.7;
            head.position.y = 0.034;
            group.add(head);
            const loop = new THREE.Mesh(
              new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(12, 7)), accent);
            loop.position.y = 0.042;
            group.add(loop);
            if (o.glow) {
              const halo = new THREE.Mesh(
                new THREE.TorusGeometry(0.016, 0.0012, this.seg(5, 3), this.seg(16, 9)), lit(o.main, 0.7));
              halo.rotation.x = Math.PI / 2;
              halo.position.y = 0.018;
              halo.userData.spin = { axis: 'y', speed: 0.5 };
              group.add(halo);
            }
            break;
          }
        }
        return group;
      },

      /** The dispatcher: an entry with no table line falls back to a relic. */
      createArcaneModel(entry, rand) {
        const spec = family.ARCANE[entry && entry.id];
        return this._arcane(spec || { form: 'relic', main: 0x8A7AC0, accent: 0xB08A3A, glow: true });
      },

      // ======================================================================
      // The ones that are not one of the forms
      // ======================================================================

      // 686. Bag of Things: bigger inside than out, so the mouth of it holds a
      // dark that the bag itself cannot contain.
      createBagOfThingsModel(entry, rand) {
        const group = new THREE.Group();
        const cloth = this._mat(0x3A2A4A, { roughness: 0.95, metalness: 0.03 });
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(0.024, this.seg(14, 8), this.seg(10, 6)), cloth);
        body.scale.set(1, 0.9, 0.9);
        body.position.y = 0.022;
        group.add(body);
        const throat = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.019, 0.018, this.seg(14, 8)), cloth);
        throat.position.y = 0.046;
        group.add(throat);
        // The inside: a black disc across the mouth that is not the cloth.
        const dark = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, 0.001, this.seg(16, 9)),
          this._mat(0x08080C, { roughness: 1.0, metalness: 0.0 }));
        dark.position.y = 0.0545;
        group.add(dark);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.0125, 0.0014, this.seg(5, 3), this.seg(16, 9)),
          this._glow(0x6A50C0, 0.5));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.0548;
        rim.userData.spin = { axis: 'y', speed: 0.35 };
        group.add(rim);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.0135, 0.0014, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0xC8A54A, { roughness: 0.5, metalness: 0.5 }));
        cord.rotation.x = Math.PI / 2;
        cord.position.y = 0.042;
        group.add(cord);
        return group;
      },

      // 688. Gauntlets of Might: one gauntlet, fingers forward, with the
      // strength in it showing as a seam of light along the knuckles.
      createGauntletsOfMightModel(entry, rand) {
        const group = new THREE.Group();
        const plate = this._steel(0x8A8E96, 0.35);
        const cuff = new THREE.Mesh(
          new THREE.CylinderGeometry(0.021, 0.025, 0.04, this.seg(14, 8)), plate);
        cuff.position.y = 0.02;
        group.add(cuff);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.016), plate);
        back.position.y = 0.052;
        group.add(back);
        for (let i = 0; i < 4; i++) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.016, 0.01), plate);
          finger.position.set(-0.012 + i * 0.008, 0.072, 0);
          group.add(finger);
        }
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0018, 0.002),
          this._glow(0xE07A2A, 0.8));
        seam.position.set(0, 0.064, 0.008);
        seam.userData.pulse = { freq: 0.9, min: 0.4, max: 1.0 };
        group.add(seam);
        return group;
      },

      // 695. Chronos Hourglass: the sand stopped halfway, hanging where it
      // should be falling.
      createChronosHourglassModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.82 });
        for (const y of [0.004, 0.062]) {
          const plate = new THREE.Mesh(
            new THREE.CylinderGeometry(0.021, 0.021, 0.005, this.seg(16, 9)), brass);
          plate.position.y = y;
          group.add(plate);
        }
        for (let i = 0; i < 3; i++) {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0016, 0.0016, 0.055, this.seg(6, 4)), brass);
          const a = i * Math.PI * 2 / 3;
          post.position.set(Math.cos(a) * 0.018, 0.033, Math.sin(a) * 0.018);
          group.add(post);
        }
        const glass = this._mat(0xDCE6EE, {
          roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.35
        });
        for (const s of [-1, 1]) {
          const bulb = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.026, this.seg(14, 8)), glass);
          bulb.position.y = 0.033 + s * 0.013;
          bulb.rotation.x = s > 0 ? Math.PI : 0;
          group.add(bulb);
        }
        // The stopped grain: a column of sand standing between the bulbs,
        // which is the whole of what this thing does.
        const column = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, this.seg(8, 5)),
          this._glow(0xE0C060, 0.6));
        column.position.y = 0.033;
        group.add(column);
        const heap = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.012, this.seg(12, 7)),
          this._mat(0xC8A040, { roughness: 0.95, metalness: 0.0 }));
        heap.position.y = 0.014;
        heap.rotation.x = Math.PI;
        group.add(heap);
        return group;
      },

      // 696. Pathfinder's Compass: the needle points where you wish to go, so
      // it is off north and does not sit still.
      createPathfindersCompassModel(entry, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.85 });
        const caseM = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.024, 0.012, this.seg(20, 11)), brass);
        caseM.position.y = 0.006;
        group.add(caseM);
        const card = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.001, this.seg(18, 10)),
          this._mat(0xE8E0C8, { roughness: 0.9, metalness: 0.0 }));
        card.position.y = 0.0125;
        group.add(card);
        const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0008, 0.003),
          this._glow(0x50C8E0, 0.7));
        needle.position.y = 0.0135;
        needle.rotation.y = 0.9;
        needle.userData.spin = { axis: 'y', speed: 0.18 };
        group.add(needle);
        const pivot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0018, 0.0018, 0.003, this.seg(8, 5)), brass);
        pivot.position.y = 0.014;
        group.add(pivot);
        const lid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.024, 0.024, 0.004, this.seg(20, 11)), brass);
        lid.position.set(0, 0.032, -0.022);
        lid.rotation.x = -1.2;
        group.add(lid);
        return group;
      },

      // 698. Demon's Ledger Page: one page torn out of an account book, the
      // ruled columns still on it and the entries burned rather than inked.
      createLedgerPageModel(entry, rand) {
        const group = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0012, 0.095),
          this._mat(0xE0D2A8, { roughness: 0.98, metalness: 0.0 }));
        paper.position.y = 0.0006;
        paper.rotation.y = 0.08;
        group.add(paper);
        const rule = this._mat(0x6A4A32, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.0004, 0.0008), rule);
          line.position.set(0, 0.0016, -0.03 + i * 0.02);
          line.rotation.y = 0.08;
          group.add(line);
        }
        const burnt = this._glow(0xE0602A, 0.65);
        for (let i = 0; i < 3; i++) {
          const entryLine = new THREE.Mesh(new THREE.BoxGeometry(0.026 - i * 0.005, 0.0005, 0.0016), burnt);
          entryLine.position.set(-0.012, 0.0018, -0.024 + i * 0.02);
          entryLine.rotation.y = 0.08;
          entryLine.userData.pulse = { freq: 0.6 + i * 0.2, min: 0.35, max: 0.95 };
          group.add(entryLine);
        }
        const tear = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0014, 0.095),
          this._mat(0xC8B890, { roughness: 1.0, metalness: 0.0 }));
        tear.position.set(-0.035, 0.0007, 0);
        tear.rotation.y = 0.08;
        group.add(tear);
        return group;
      },

      // 707. Inverted Elder Sign: the sign that keeps them out, cut the wrong
      // way round. A stone plaque with the star turned over on it.
      createInvertedElderSignModel(entry, rand) {
        const group = new THREE.Group();
        const stone = this._mat(0x6A6A66, { roughness: 0.9, metalness: 0.04 });
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, this.seg(18, 10)), stone);
        slab.position.y = 0.004;
        group.add(slab);
        const star = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.002, 5),
          this._glow(0x8A2A3A, 0.55));
        star.rotation.y = Math.PI / 5;                    // point down, not up
        star.position.y = 0.009;
        star.userData.pulse = { freq: 0.5, min: 0.3, max: 0.9 };
        group.add(star);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x14141A, { roughness: 0.3, metalness: 0.1 }));
        eye.scale.y = 0.5;
        eye.position.y = 0.0105;
        group.add(eye);
        const chip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.004), stone);
        chip.position.set(0.026, 0.004, 0.008);
        chip.rotation.set(0.3, 0.5, 0.2);
        group.add(chip);
        return group;
      }
    }
  };

  // One line per enchanted thing: the form it takes, its colour, its fitting,
  // and whether the enchantment shows as light. The six written out above are
  // not in here; they are keyed straight to their own builders below.
  family.ARCANE = {
    646: { form: 'pouch', main: 0xD8C8A0, accent: 0x6A8A3A },
    647: { form: 'feather', main: 0xE8E4F0, accent: 0x3A3A44, glow: true, glowStrength: 0.4 },
    648: { form: 'potion', main: 0xC8203A, accent: 0x8A6A3A, glow: true },
    649: { form: 'crystal', main: 0x6A9AE0, accent: 0x3A4450, glow: true, glowStrength: 0.75, tall: true },
    650: { form: 'pouch', main: 0x6A5A8A, accent: 0xC8A54A, glow: true, spill: 0xB0A0E0 },
    651: { form: 'potion', main: 0x2A5AE0, accent: 0x8A6A3A, glow: true },
    652: { form: 'thrown', main: 0x5A7A2A, accent: 0x2A2A22, glow: true, glowStrength: 0.4 },
    653: { form: 'potion', main: 0xC87A2A, accent: 0x6A4A28, glow: true, glowStrength: 0.5, tall: true },
    654: { form: 'potion', main: 0x8AD8C0, accent: 0x6A4A28, glow: true, glowStrength: 0.5, tall: true },
    655: { form: 'thrown', main: 0x9AD8E8, accent: 0xD8E8F0, glow: true, glowStrength: 0.6 },
    656: { form: 'crystal', main: 0x3A6A4A, accent: 0x5A4A2A, rough: 1, big: true },
    657: { form: 'potion', main: 0x9A50E0, accent: 0xC8A54A, glow: true, tall: true },
    658: { form: 'scroll', main: 0xC83A1A, accent: 0x8A6A3A },
    659: { form: 'crystal', main: 0xF0E0A0, accent: 0xC8A54A, glow: true, glowStrength: 0.85 },
    660: { form: 'pouch', main: 0x8A9A5A, accent: 0x5A6A32 },
    661: { form: 'scroll', main: 0xE0C82A, accent: 0x8A6A3A },
    662: { form: 'scroll', main: 0x3A6AC8, accent: 0x8A6A3A },
    663: { form: 'scroll', main: 0xC8C8D0, accent: 0x8A8A92 },
    664: { form: 'potion', main: 0xE0A0E0, accent: 0xC8A54A, glow: true, glowStrength: 0.7 },
    665: { form: 'pouch', main: 0xB08A6A, accent: 0x8A6A4A },
    666: { form: 'scroll', main: 0x1A1A22, accent: 0x8A2A2A },
    667: { form: 'feather', main: 0xE0E8F0, accent: 0xC8C8D0, glow: true, glowStrength: 0.5 },
    668: { form: 'relic', main: 0x8A9098, accent: 0xC83A2A, wide: true },
    669: { form: 'potion', main: 0x5A4A8A, accent: 0xC8A54A, glow: true, glowStrength: 0.5 },
    670: { form: 'pouch', main: 0x4A5A3A, accent: 0x8AC060, glow: true, spill: 0x8AE0A0 },
    671: { form: 'circlet', main: 0xC83A5A, accent: 0x3A6A2A, blooms: true, glow: true, glowStrength: 0.4 },
    672: { form: 'vessel', main: 0x9A50C8, accent: 0x2A2A32, glow: true },
    673: { form: 'trinket', main: 0xE0A02A, accent: 0xB08A3A, glow: true },
    674: { form: 'trinket', main: 0x6A8A3A, accent: 0x8A6A42, band: true, glow: true, glowStrength: 0.45 },
    675: { form: 'crystal', main: 0xE0A040, accent: 0x8A6A3A, glow: true, glowStrength: 0.55, rough: 1 },
    676: { form: 'relic', main: 0xC0C6CC, accent: 0x8A9098 },
    677: { form: 'trinket', main: 0x3A6A4A, accent: 0xB08A3A, glow: true, glowStrength: 0.4 },
    678: { form: 'trinket', main: 0x8AD0E8, accent: 0xC0C6CC, band: true, glow: true },
    679: { form: 'relic', main: 0xDCE8EE, accent: 0xB08A3A, glow: true, glowStrength: 0.4, wide: true },
    680: { form: 'relic', main: 0xC8A03A, accent: 0xE0C860, glow: true, glowStrength: 0.5, wide: true },
    681: { form: 'circlet', main: 0xE8E8F0, accent: 0x6A8A5A, blooms: true, glow: true, glowStrength: 0.5 },
    682: { form: 'cloth', main: 0x14141C, accent: 0x3A3A48, sheer: true },
    683: { form: 'relic', main: 0xE0EAEE, accent: 0xC8A54A, glow: true, glowStrength: 0.35, wide: true },
    684: { form: 'trinket', main: 0xB0B6BC, accent: 0x8A9098, glow: true, glowStrength: 0.45 },
    685: { form: 'crystal', main: 0x5A6AE0, accent: 0x3A3A50, glow: true, glowStrength: 0.8, big: true, tall: true },
    687: { form: 'circlet', main: 0x8AC0E0, accent: 0xC0C6CC, glow: true },
    689: { form: 'vessel', main: 0x8A9A5A, accent: 0x6A5A3A, stemmed: true, glow: true, glowStrength: 0.45 },
    690: { form: 'pouch', main: 0x6A5A3A, accent: 0x3A6A2A, glow: true, spill: 0xC8E060 },
    691: { form: 'crystal', main: 0x9A50E0, accent: 0x3A2A44, glow: true, glowStrength: 0.9, big: true },
    692: { form: 'vessel', main: 0xF0E0A0, accent: 0xC8A54A, stemmed: true, glow: true, glowStrength: 0.8 },
    693: { form: 'scroll', main: 0x3A2A5A, accent: 0x2A2A32 },
    694: { form: 'scroll', main: 0x5A2A3A, accent: 0x1A1A20 },
    697: { form: 'crystal', main: 0xF0F0E0, accent: 0xC8A54A, glow: true, glowStrength: 1.0, big: true },
    699: { form: 'vessel', main: 0x3A2A22, accent: 0x5A5A52 },
    700: { form: 'crystal', main: 0xC87A2A, accent: 0x5A5A52, rough: 1, glow: true, glowStrength: 0.5 },
    701: { form: 'feather', main: 0xF0E8C0, accent: 0xE0C060, glow: true, glowStrength: 0.9 },
    702: { form: 'relic', main: 0xB08A3A, accent: 0x8A6A2A },
    703: { form: 'relic', main: 0xE0D8C0, accent: 0x8A6A42 },
    704: { form: 'vessel', main: 0x8A2A2A, accent: 0xC8A54A },
    705: { form: 'crystal', main: 0x1A1A24, accent: 0x2A2A3A, glow: true, glowStrength: 0.35, tall: true },
    706: { form: 'vessel', main: 0x6A8AC0, accent: 0x3A3A44, glow: true, glowStrength: 0.6 }
  };

  // Every entry on the shelf, checked against the table rather than assumed:
  // the ones with a line take the shared forms, the six written out take their
  // own builders.
  const BESPOKE = {
    686: 'createBagOfThingsModel',
    688: 'createGauntletsOfMightModel',
    695: 'createChronosHourglassModel',
    696: 'createPathfindersCompassModel',
    698: 'createLedgerPageModel',
    707: 'createInvertedElderSignModel'
  };
  for (let id = 646; id <= 707; id++) {
    family.unique['i' + id] = BESPOKE[id] || 'createArcaneModel';
  }

  window.ItemModelSystem.registerFamily(family);
})();
