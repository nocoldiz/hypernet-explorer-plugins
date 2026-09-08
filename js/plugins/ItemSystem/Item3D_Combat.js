//=============================================================================
// Item 3D Models - Combat
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the combat rack of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Combat
 * ============================================================================
 *
 * One model per entry, keyed by database id. Two kinds of thing share this
 * rack and they are built to read as different objects on sight:
 *
 *  * the things you throw, scatter or break over someone, each modelled as
 *    what it is (a rag-stoppered bottle, a caltrop cluster, a weighted net)
 *  * the technique items, which are records: their names all end in "EP:", so
 *    they are built as a sleeve with the disc half drawn out of it, one label
 *    colour and one cut motif each. Nobody mistakes a record for a bomb.
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
    console.error('[Item3D_Combat] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Combat',

    unique: {
      i73: 'createMolotovCocktailModel',
      i74: 'createBodySlamEPModel',
      i75: 'createDefensiveStancePillModel',
      i76: 'createCaltropsModel',
      i77: 'createShurikenModel',
      i78: 'createHuntingNetModel',
      i79: 'createThrowingAxeModel',
      i80: 'createFirePotModel',
      i81: 'createKarateComboEPModel',
      i82: 'createJudoThrowEPModel',
      i83: 'createVitalStrikeEPModel',
      i84: 'createTaekwondoKicksEPModel',
      i85: 'createFreezingMoonEPModel',
      i86: 'createBlazingKickEPModel',
      i87: 'createBerserkerAmuletModel',
      i88: 'createGuardBreakerModel',
      i89: 'createBrokenCryocellModel',
      i90: 'createPerfectBlockEPModel',
      i91: 'createCrystalRunningShoesModel',
      i92: 'createEightPillarsEPModel',
      i93: 'createDragonEyeElixirModel',
      i94: 'createKiStrikeEPModel',
      i95: 'createFlowingWaterEPModel',
      i96: 'createIronStrikeEPModel',
      i97: 'createAncientScrollModel',
      i98: 'createForbiddenScrollModel',
      i99: 'createForbiddenWarEPModel'
    },

    models: {
      // ======================================================================
      // The technique records
      // ======================================================================

      /**
       * A record in its sleeve, the disc drawn halfway out and standing on its
       * edge with the sleeve behind it. Every EP on this rack is one of these:
       * what separates them is the sleeve colour, the label colour and the
       * motif cut into the sleeve, passed in rather than rolled, so the six of
       * them are six recognisable covers.
       */
      _techniqueRecord(group, o) {
        const size = 0.085;
        const sleeve = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.004),
          this._mat(o.sleeve, { roughness: 0.85, metalness: 0.02 }));
        sleeve.position.set(-0.012, size / 2, 0);
        sleeve.rotation.y = 0.18;
        group.add(sleeve);

        // The motif is a flat shape sitting on the front of the sleeve, so a
        // cover reads at a glance rather than only in the item name.
        if (this.wantsTrim() && o.motif) {
          const ink = this._mat(o.ink === undefined ? 0xF0ECE0 : o.ink, { roughness: 0.9, metalness: 0.0 });
          const mark = o.motif === 'bar'
            ? new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.001), ink)
            : o.motif === 'ring'
              ? new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0025, this.seg(6, 4), this.seg(16, 9)), ink)
              : o.motif === 'bolt'
                ? this._plate([[0, 0], [0.008, 0.018], [0.002, 0.018], [0.009, 0.036],
                  [-0.008, 0.014], [-0.001, 0.014]], 0.001, ink)
                : new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.001, 3), ink);
          if (o.motif === 'wedge') mark.rotation.x = Math.PI / 2;
          mark.position.set(-0.012 + Math.sin(0.18) * 0.0025,
            size / 2 - (o.motif === 'bolt' ? 0.018 : 0), Math.cos(0.18) * 0.0025);
          mark.rotation.y = 0.18;
          group.add(mark);
        }

        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(size * 0.46, size * 0.46, 0.0015, this.seg(24, 12)),
          this._mat(0x14141A, { roughness: 0.35, metalness: 0.1 }));
        disc.rotation.set(Math.PI / 2, 0, 0);
        disc.rotation.y = -0.12;
        disc.position.set(0.026, size * 0.46, 0.006);
        group.add(disc);
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(size * 0.16, size * 0.16, 0.0018, this.seg(16, 9)),
          this._mat(o.label, { roughness: 0.9, metalness: 0.0 }));
        label.rotation.set(Math.PI / 2, 0, 0);
        label.rotation.y = -0.12;
        label.position.set(0.026, size * 0.46, 0.006);
        group.add(label);
        return group;
      },

      // 74. Body Slam EP: the heaviest cut on the rack, a black sleeve with
      // one bar across it.
      createBodySlamEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0x1A1A20, label: 0xC83A2A, motif: 'bar', ink: 0xE8E4D8 });
      },

      // 81. Karate Combo EP: white sleeve, one red disc, nothing else.
      createKarateComboEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0xE8E6DE, label: 0xC02A2A, motif: 'ring', ink: 0xC02A2A });
      },

      // 82. Judo Throw EP: indigo, the mark a wedge, like a body going over.
      createJudoThrowEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0x22305A, label: 0xE0E0E4, motif: 'wedge', ink: 0xE8E4D8 });
      },

      // 83. Vital Strike EP: oxblood, a single point.
      createVitalStrikeEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0x4A1A1E, label: 0x1A1A20, motif: 'bolt', ink: 0xE0C060 });
      },

      // 84. Taekwondo Kicks EP: sky blue, a ring, the kick going round.
      createTaekwondoKicksEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0x2A6A9A, label: 0xE8E4D8, motif: 'ring', ink: 0xE8E4D8 });
      },

      // 85. Freezing Moon EP: pale ice sleeve, a white disc for the moon.
      createFreezingMoonEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0xBCD4DC, label: 0x2A4A5A, motif: 'ring', ink: 0xF4F8FA });
      },

      // 86. Blazing Kick EP: orange sleeve with a bolt cut into it.
      createBlazingKickEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0xC85A1A, label: 0x1A1A20, motif: 'bolt', ink: 0xF0D060 });
      },

      // 90. Perfect Block EP: grey sleeve, one bar held across it.
      createPerfectBlockEPModel(entry, rand) {
        return this._techniqueRecord(new THREE.Group(),
          { sleeve: 0x50565E, label: 0xB0B6BC, motif: 'bar', ink: 0xD8DCE0 });
      },

      // ======================================================================
      // The things you throw
      // ======================================================================

      // 73. Molotov Cocktail: a wine bottle of petrol with a soaked rag
      // stuffed in the neck, the fuel line showing through green glass.
      createMolotovCocktailModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0x2A5A2A, { roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.6 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.075, this.seg(14, 8)), glass);
        body.position.y = 0.038;
        group.add(body);
        const fuel = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.05, this.seg(12, 7)),
          this._mat(0xC8A040, { roughness: 0.25, metalness: 0.0 }));
        fuel.position.y = 0.025;
        group.add(fuel);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.021, 0.022, this.seg(14, 8)), glass);
        shoulder.position.y = 0.086;
        group.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.022, this.seg(12, 7)), glass);
        neck.position.y = 0.108;
        group.add(neck);
        const rag = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, this.seg(8, 5)),
          this._mat(0xC8BCA0, { roughness: 1.0, metalness: 0.0 }));
        rag.position.set(0.003, 0.128, 0);
        rag.rotation.z = -0.25;
        group.add(rag);
        return group;
      },

      // 75. Defensive Stance Pill: one heavy tablet, half again the size of a
      // pharmacy one, standing on edge in its own foil.
      createDefensiveStancePillModel(entry, rand) {
        const group = new THREE.Group();
        const foil = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.001, 0.024),
          this._mat(0x9AA0A6, { roughness: 0.45, metalness: 0.55 }));
        foil.position.y = 0.0005;
        group.add(foil);
        const pill = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.006, this.seg(16, 9)),
          this._mat(0x3A6A8A, { roughness: 0.5, metalness: 0.05 }));
        pill.rotation.x = Math.PI / 2;
        pill.rotation.z = 0.1;
        pill.position.y = 0.011;
        group.add(pill);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, 0.0015, this.seg(16, 9)),
          this._mat(0xE8E8EC, { roughness: 0.8, metalness: 0.0 }));
        band.rotation.x = Math.PI / 2;
        band.rotation.z = 0.1;
        band.position.y = 0.011;
        group.add(band);
        return group;
      },

      // 76. Caltrops: a handful scattered, every one landing point-up because
      // that is the whole trick of the shape.
      createCaltropsModel(entry, rand) {
        const group = new THREE.Group();
        const iron = this._steel(0x6E747C, 0.5);
        const count = this.wantsTrim() ? 5 : 3;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + rand() * 0.6;
          const r = 0.008 + rand() * 0.02;
          const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
          // Three legs down, one up: a tetrahedron of spikes off one hub.
          const hub = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(8, 5), this.seg(6, 4)), iron);
          hub.position.set(cx, 0.005, cz);
          group.add(hub);
          for (let k = 0; k < 3; k++) {
            const b = k * Math.PI * 2 / 3 + a;
            const leg = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.009, this.seg(6, 4)), iron);
            leg.position.set(cx + Math.cos(b) * 0.004, 0.0025, cz + Math.sin(b) * 0.004);
            leg.rotation.set(Math.PI - 0.9, 0, 0);
            leg.rotation.y = -b;
            group.add(leg);
          }
          const up = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.01, this.seg(6, 4)), iron);
          up.position.set(cx, 0.01, cz);
          group.add(up);
        }
        return group;
      },

      // 77. Shuriken: a stack of four-pointed stars, the top one turned off
      // the pile.
      createShurikenModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x8A9098, 0.3);
        const star = () => {
          const points = [];
          for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            const r = i % 2 === 0 ? 0.021 : 0.006;
            points.push([Math.cos(a) * r, Math.sin(a) * r]);
          }
          const mesh = this._plate(points, 0.0018, steel);
          mesh.rotation.x = -Math.PI / 2;
          return mesh;
        };
        for (let i = 0; i < (this.wantsTrim() ? 3 : 2); i++) {
          const s = star();
          s.position.set(i * 0.004, 0.001 + i * 0.002, i * 0.003);
          s.rotation.z = i * 0.4;
          group.add(s);
        }
        return group;
      },

      // 78. Hunting Net: a bundled net with the lead weights hanging off its
      // skirt, tied for throwing.
      createHuntingNetModel(entry, rand) {
        const group = new THREE.Group();
        const cord = this._mat(0x8A7A5A, { roughness: 1.0, metalness: 0.0 });
        const bundle = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 5)), cord);
        bundle.scale.set(1, 0.7, 0.85);
        bundle.position.y = 0.022;
        group.add(bundle);
        // The mesh, as a few cords crossing the bundle rather than a woven
        // sheet: at item scale that is all that reads.
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const strand = new THREE.Mesh(
            new THREE.TorusGeometry(0.031, 0.0012, this.seg(5, 3), this.seg(16, 9)), cord);
          strand.rotation.set(Math.PI / 2, 0, i * 0.7);
          strand.rotation.x = Math.PI / 2 + i * 0.35;
          strand.position.y = 0.022;
          group.add(strand);
        }
        const lead = this._steel(0x50565C, 0.7);
        for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
          const weight = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(8, 5), this.seg(6, 4)), lead);
          const a = i * Math.PI * 2 / 5;
          weight.position.set(Math.cos(a) * 0.03, 0.005, Math.sin(a) * 0.026);
          group.add(weight);
        }
        return group;
      },

      // 79. Throwing Axe: a short haft and a broad head, balanced for the
      // throw rather than the swing. Built here rather than by the weapon
      // pipeline, because it is inventory stock and never held.
      createThrowingAxeModel(entry, rand) {
        const group = new THREE.Group();
        const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.11, this.seg(10, 6)),
          this._wood(0x7A5632));
        haft.rotation.z = Math.PI / 2;
        haft.position.y = 0.009;
        group.add(haft);
        const head = this._plate([
          [0, -0.022], [0.016, -0.03], [0.03, -0.016], [0.03, 0.016], [0.016, 0.03], [0, 0.022]
        ], 0.007, this._steel(0x9AA0A8, 0.32));
        head.rotation.x = Math.PI / 2;
        head.position.set(0.042, 0.009, 0);
        group.add(head);
        const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, this.seg(10, 6)),
          this._steel(0x7A8088, 0.45));
        eye.rotation.z = Math.PI / 2;
        eye.position.set(0.04, 0.009, 0);
        group.add(eye);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.03, this.seg(10, 6)),
          this._mat(0x3A2A1E, { roughness: 0.95, metalness: 0.0 }));
        grip.rotation.z = Math.PI / 2;
        grip.position.set(-0.04, 0.009, 0);
        group.add(grip);
        return group;
      },

      // 80. Fire Pot: a fat clay sphere with a pitched mouth and a short fuse,
      // meant to break rather than open.
      createFirePotModel(entry, rand) {
        const group = new THREE.Group();
        const clay = this._mat(0x8A5A3A, { roughness: 0.9, metalness: 0.0 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.034, this.seg(14, 8), this.seg(11, 6)), clay);
        body.scale.y = 0.85;
        body.position.y = 0.029;
        group.add(body);
        const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.014, this.seg(12, 7)), clay);
        mouth.position.y = 0.058;
        group.add(mouth);
        const pitch = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.005, this.seg(12, 7)),
          this._mat(0x1E1A18, { roughness: 0.95, metalness: 0.0 }));
        pitch.position.y = 0.066;
        group.add(pitch);
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.002, 0.022, this.seg(6, 4)),
          this._mat(0xC8B890, { roughness: 1.0, metalness: 0.0 }));
        fuse.position.set(0.003, 0.078, 0);
        fuse.rotation.z = -0.3;
        group.add(fuse);
        if (this.wantsTrim()) {
          const cord = new THREE.Mesh(
            new THREE.TorusGeometry(0.03, 0.0018, this.seg(5, 3), this.seg(14, 8)),
            this._mat(0x6A5A3A, { roughness: 1.0, metalness: 0.0 }));
          cord.rotation.x = Math.PI / 2;
          cord.position.y = 0.03;
          group.add(cord);
        }
        return group;
      },

      // ======================================================================
      // The rest of the rack
      // ======================================================================

      // 87. Berserker Amulet: a boar tusk bound in wire on a leather thong,
      // lying open in a loose coil.
      createBerserkerAmuletModel(entry, rand) {
        const group = new THREE.Group();
        const thong = new THREE.Mesh(
          new THREE.TorusGeometry(0.026, 0.0016, this.seg(5, 3), this.seg(20, 11)),
          this._mat(0x3A2A1E, { roughness: 1.0, metalness: 0.0 }));
        thong.rotation.x = Math.PI / 2;
        thong.position.y = 0.0016;
        group.add(thong);
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.038, this.seg(10, 6)),
          this._mat(0xE0D8C0, { roughness: 0.6, metalness: 0.05 }));
        tusk.rotation.set(0, 0, Math.PI / 2 - 0.35);
        tusk.position.set(0.006, 0.008, 0.012);
        group.add(tusk);
        const wire = new THREE.Mesh(
          new THREE.TorusGeometry(0.0055, 0.0009, this.seg(5, 3), this.seg(12, 7)),
          this._steel(0xB08A3A, 0.4));
        wire.rotation.set(0, 0.35, Math.PI / 2 - 0.35);
        wire.position.set(-0.008, 0.008, 0.012);
        group.add(wire);
        return group;
      },

      // 88. Guard Breaker: a shaped charge on a magnet base, the cone facing
      // down at whatever it is stuck to.
      createGuardBreakerModel(entry, rand) {
        const group = new THREE.Group();
        const casing = this._mat(0x2A3038, { roughness: 0.5, metalness: 0.4 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, this.seg(14, 8)),
          this._steel(0x50565C, 0.55));
        base.position.y = 0.004;
        group.add(base);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.023, 0.032, this.seg(14, 8)), casing);
        body.position.y = 0.024;
        group.add(body);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.01, this.seg(14, 8)), casing);
        collar.position.y = 0.045;
        group.add(collar);
        const timer = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.006),
          this._mat(0xC8A02A, { roughness: 0.4, metalness: 0.3 }));
        timer.position.set(0, 0.055, 0);
        group.add(timer);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.0022, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0xE03A2A, 1.0));
        led.position.set(0.006, 0.061, 0.004);
        led.userData.pulse = { freq: 3.0, min: 0.15, max: 1.0 };
        group.add(led);
        return group;
      },

      // 89. Broken Cryocell: a cracked coolant cell, frost creeping out of the
      // split and the fluid inside gone still.
      createBrokenCryocellModel(entry, rand) {
        const group = new THREE.Group();
        const shell = this._steel(0x8A96A0, 0.4);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.05, 0.022), shell);
        body.position.y = 0.025;
        group.add(body);
        const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.024),
          this._mat(0x8AD8E8, {
            roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.45,
            emissive: 0x3A8AA0, emissiveIntensity: 0.5
          }));
        window_.position.y = 0.026;
        group.add(window_);
        const crack = this._plate([[0, 0], [0.004, 0.012], [0.001, 0.013], [-0.003, 0.004]], 0.001,
          this._mat(0xF0FAFF, { roughness: 0.3, metalness: 0.0 }));
        crack.position.set(0.006, 0.03, 0.012);
        group.add(crack);
        const frost = this._mat(0xE8F6FA, { roughness: 0.85, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.0025, 0.01, this.seg(6, 4)), frost);
          spike.position.set(0.01 + i * 0.002, 0.02 + i * 0.008, 0.013);
          spike.rotation.set(1.2, 0, 0.4 - i * 0.3);
          group.add(spike);
        }
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.024), shell);
        cap.position.y = 0.053;
        group.add(cap);
        return group;
      },

      // ======================================================================
      // The rest of the technique library, and what is not a record
      // ======================================================================

      // 92. Eight Pillars EP: eight bars standing across a deep green sleeve.
      createEightPillarsEPModel(entry, rand) {
        const group = new THREE.Group();
        this._techniqueRecord(group, { sleeve: 0x1E4A38, label: 0xC8A54A });
        if (this.wantsTrim()) {
          const ink = this._mat(0xE0D8B0, { roughness: 0.9, metalness: 0.0 });
          for (let i = 0; i < 8; i++) {
            const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.001), ink);
            pillar.position.set(-0.012 + (i - 3.5) * 0.008 + Math.sin(0.18) * 0.0025,
              0.043, Math.cos(0.18) * 0.0025 + (i - 3.5) * 0.008 * Math.tan(0.18));
            pillar.rotation.y = 0.18;
            group.add(pillar);
          }
        }
        return group;
      },

      // 94. Ki Strike EP: one point of light on a black sleeve.
      createKiStrikeEPModel(entry, rand) {
        const group = new THREE.Group();
        this._techniqueRecord(group, { sleeve: 0x12121A, label: 0x50C8E0, motif: 'ring', ink: 0x50C8E0 });
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(10, 6), this.seg(8, 5)),
          this._glow(0x9AE8FF, 0.9));
        spark.position.set(-0.012 + Math.sin(0.18) * 0.004, 0.043, Math.cos(0.18) * 0.004);
        spark.userData.pulse = { freq: 1.8, min: 0.4, max: 1.0 };
        group.add(spark);
        return group;
      },

      // 95. Flowing Water EP: a pale blue sleeve, the mark a wave rather than
      // a strike, because the technique is a counter.
      createFlowingWaterEPModel(entry, rand) {
        const group = new THREE.Group();
        this._techniqueRecord(group, { sleeve: 0x3A6A8A, label: 0xDCE8EE });
        if (this.wantsTrim()) {
          const ink = this._mat(0xDCE8EE, { roughness: 0.9, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const wave = new THREE.Mesh(
              new THREE.TorusGeometry(0.016, 0.0018, this.seg(5, 3), this.seg(14, 8), Math.PI), ink);
            wave.rotation.y = 0.18;
            wave.rotation.z = i % 2 ? Math.PI : 0;
            wave.position.set(-0.012 + Math.sin(0.18) * 0.0028, 0.028 + i * 0.014, Math.cos(0.18) * 0.0028);
            group.add(wave);
          }
        }
        return group;
      },

      // 96. Iron Strike EP: grey card, one spike driven through it.
      createIronStrikeEPModel(entry, rand) {
        const group = new THREE.Group();
        this._techniqueRecord(group, { sleeve: 0x3A3E44, label: 0x8A9098 });
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.05, this.seg(8, 5)),
          this._steel(0xB0B6BC, 0.3));
        spike.rotation.set(0, 0.18, 0.45);
        spike.position.set(-0.012 + Math.sin(0.18) * 0.004, 0.045, Math.cos(0.18) * 0.004);
        group.add(spike);
        return group;
      },

      // 99. Forbidden War EP: the sleeve blacked out, the title bar redacted
      // and the label stamped over. A censored record looks censored.
      createForbiddenWarEPModel(entry, rand) {
        const group = new THREE.Group();
        this._techniqueRecord(group, { sleeve: 0x0E0E12, label: 0x8A1420 });
        if (this.wantsTrim()) {
          const redaction = this._mat(0x1A1A1E, { roughness: 1.0, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045 - i * 0.008, 0.009, 0.001), redaction);
            bar.rotation.y = 0.18;
            bar.position.set(-0.012 + Math.sin(0.18) * 0.0028, 0.058 - i * 0.014, Math.cos(0.18) * 0.0028);
            group.add(bar);
          }
          const stamp = new THREE.Mesh(
            new THREE.TorusGeometry(0.012, 0.002, this.seg(5, 3), this.seg(14, 8)),
            this._mat(0xB02A2A, { roughness: 0.95, metalness: 0.0 }));
          stamp.rotation.set(0.2, 0.18, 0.4);
          stamp.position.set(-0.006 + Math.sin(0.18) * 0.003, 0.03, Math.cos(0.18) * 0.003);
          group.add(stamp);
        }
        return group;
      },

      // 91. Crystal Running Shoes: one shoe, sole down, the upper grown out of
      // faceted crystal instead of cut from cloth. It breaks after ten turns,
      // so the heel is already crazed.
      createCrystalRunningShoesModel(entry, rand) {
        const group = new THREE.Group();
        const crystal = this._mat(0xBCE0EE, {
          roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.7,
          emissive: 0x2A6A8A, emissiveIntensity: 0.25
        });
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.008, 0.09),
          this._mat(0xE8F2F6, { roughness: 0.5, metalness: 0.0 }));
        sole.position.set(0, 0.004, 0.006);
        group.add(sole);
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(10, 6), this.seg(8, 5)), crystal);
        toe.scale.set(0.9, 0.75, 1.5);
        toe.position.set(0, 0.014, 0.026);
        group.add(toe);
        const heel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, 0.03), crystal);
        heel.position.set(0, 0.021, -0.026);
        group.add(heel);
        const crack = this._plate([[0, 0], [0.003, 0.008], [0, 0.016], [-0.002, 0.008]], 0.001,
          this._mat(0xF4FAFF, { roughness: 0.3, metalness: 0.0 }));
        crack.position.set(0.006, 0.016, -0.041);
        group.add(crack);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const lace = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0018, 0.0018),
              this._mat(0xE8F2F6, { roughness: 0.9, metalness: 0.0 }));
            lace.position.set(0, 0.03 - i * 0.001, 0.004 - i * 0.009);
            group.add(lace);
          }
        }
        return group;
      },

      // 93. Dragon Eye Elixir: a vertical-pupilled eye suspended in a squat
      // jar, looking out of it.
      createDragonEyeElixirModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xDCE8E4, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.4 });
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, this.seg(16, 9)), glass);
        jar.position.y = 0.025;
        group.add(jar);
        const brine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, this.seg(14, 8)),
          this._mat(0xC8B860, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.35 }));
        brine.position.y = 0.022;
        group.add(brine);
        const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.013, this.seg(14, 8), this.seg(11, 6)),
          this._mat(0xE0C840, { roughness: 0.25, metalness: 0.0 }));
        sclera.position.y = 0.024;
        group.add(sclera);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0x101014, { roughness: 0.2, metalness: 0.0 }));
        pupil.scale.set(0.22, 1.0, 0.35);
        pupil.position.set(0, 0.024, 0.006);
        group.add(pupil);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.008, this.seg(16, 9)),
          this._mat(0x8A6A2A, { roughness: 0.5, metalness: 0.45 }));
        lid.position.y = 0.053;
        group.add(lid);
        return group;
      },

      // 97. Ancient Scroll: a long roll open across two wooden rods, the
      // written column showing.
      createAncientScrollModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._mat(0xD8C89A, { roughness: 0.98, metalness: 0.0 });
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.0015, 0.05), paper);
        sheet.position.y = 0.008;
        group.add(sheet);
        const wood = this._wood(0x6A4A2A);
        for (const s of [-1, 1]) {
          const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.056, this.seg(12, 7)), paper);
          roll.rotation.x = Math.PI / 2;
          roll.position.set(s * 0.05, 0.008, 0);
          group.add(roll);
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, this.seg(8, 5)), wood);
          rod.rotation.x = Math.PI / 2;
          rod.position.set(s * 0.05, 0.008, 0);
          group.add(rod);
        }
        if (this.wantsTrim()) {
          const ink = this._mat(0x2A2018, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 4; i++) {
            const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.03), ink);
            glyph.position.set(-0.024 + i * 0.016, 0.0095, 0);
            group.add(glyph);
          }
        }
        return group;
      },

      // 98. Forbidden Scroll: the same paper, still rolled, bound with cord
      // and sealed with black wax. Nobody has read this one.
      createForbiddenScrollModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._mat(0xC0AE86, { roughness: 0.98, metalness: 0.0 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, this.seg(14, 8)), paper);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.014;
        group.add(roll);
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.0148, 0.0018, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x3A1E1E, { roughness: 1.0, metalness: 0.0 }));
        cord.rotation.y = Math.PI / 2;
        cord.position.y = 0.014;
        group.add(cord);
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, this.seg(12, 7)),
          this._mat(0x14141A, { roughness: 0.55, metalness: 0.05 }));
        wax.position.set(0, 0.029, 0);
        group.add(wax);
        return group;
      }
    }
  });
})();
