//=============================================================================
// Item 3D Models - Vehicles
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the vehicle entries of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Vehicles
 * ============================================================================
 *
 * The smallest shelf in the database, and the one whose entries are least
 * like each other: a pair of restraints, a folded bike, a keyring that calls
 * a car, a pin that whistles a starship down, a packed dinghy and a broom.
 *
 * Most of these are not the vehicle. They are the thing you carry that brings
 * the vehicle, so they are modelled as what goes in a pocket: the keys, the
 * pin, the stuff sack. The two that really are the vehicle, the bike and the
 * broom, are built folded and shouldered respectively, at the size a person
 * carries them.
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
    console.error('[Item3D_Vehicles] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Vehicles',

    unique: {
      i111: 'createLiminalCuffsModel',
      i131: 'createBikeModel',
      i164: 'createUtilitarianCarKeysModel',
      i166: 'createLowOrbitPinModel',
      i167: 'createInflatableDinghyModel',
      i168: 'createFlyingBroomModel'
    },

    models: {
      // 111. Liminal cuffs: two rings joined by a short chain, the metal not
      // quite closing on itself where the link passes through the world.
      createLiminalCuffsModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0x8A9098, 0.35);
        for (const s of [-1, 1]) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.018, 0.004, this.seg(8, 5), this.seg(18, 10)), steel);
          ring.rotation.x = Math.PI / 2 - 0.25;
          ring.position.set(s * 0.026, 0.006, 0);
          group.add(ring);
          const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, this.seg(10, 6)), steel);
          hinge.rotation.z = Math.PI / 2;
          hinge.position.set(s * 0.009, 0.006, 0);
          group.add(hinge);
        }
        // The chain between them reads as liminal rather than iron: the two
        // end links are steel, the one in the middle is lit and half there.
        const link = new THREE.Mesh(
          new THREE.TorusGeometry(0.005, 0.0015, this.seg(5, 3), this.seg(12, 7)),
          this._glow(0x7A9AE0, 0.55));
        link.rotation.y = Math.PI / 2;
        link.position.set(0, 0.006, 0);
        link.userData.pulse = { freq: 1.1, min: 0.3, max: 0.85 };
        group.add(link);
        return group;
      },

      // 131. Bike: folded at the hinge, as its description says, the two
      // wheels brought alongside each other and the bars turned in.
      createBikeModel(entry, rand) {
        const group = new THREE.Group();
        const frame = this._mat(0x2A5A8A, { roughness: 0.35, metalness: 0.55 });
        const rubber = this._mat(0x14141A, { roughness: 0.95, metalness: 0.0 });
        const rim = this._steel(0xB0B6BC, 0.3);
        for (let i = 0; i < 2; i++) {
          const tyre = new THREE.Mesh(
            new THREE.TorusGeometry(0.032, 0.005, this.seg(8, 5), this.seg(20, 11)), rubber);
          tyre.position.set(i ? 0.012 : -0.012, 0.037, i ? 0.012 : -0.012);
          group.add(tyre);
          const hoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.027, 0.002, this.seg(6, 4), this.seg(18, 10)), rim);
          hoop.position.copy(tyre.position);
          group.add(hoop);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, this.seg(10, 6)), rim);
          hub.rotation.x = Math.PI / 2;
          hub.position.copy(tyre.position);
          group.add(hub);
        }
        const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, this.seg(10, 6)), frame);
        spar.rotation.set(0, Math.PI / 4, Math.PI / 2);
        spar.position.y = 0.05;
        group.add(spar);
        const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.012), frame);
        hinge.position.y = 0.05;
        group.add(hinge);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(10, 6)), frame);
        post.position.set(-0.012, 0.066, -0.012);
        group.add(post);
        const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0x1E1E24, { roughness: 0.85, metalness: 0.05 }));
        saddle.scale.set(1.4, 0.4, 0.7);
        saddle.position.set(-0.012, 0.082, -0.012);
        group.add(saddle);
        const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, this.seg(10, 6)), frame);
        bars.rotation.set(Math.PI / 2, 0, 0);
        bars.position.set(0.012, 0.07, 0.012);
        group.add(bars);
        return group;
      },

      // 164. Utilitarian car: the enchanted keys its description names, on a
      // fob, not the car. The fob carries the sigil that does the summoning.
      createUtilitarianCarKeysModel(entry, rand) {
        const group = new THREE.Group();
        const steel = this._steel(0xB0B6BC, 0.3);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.014, 0.0015, this.seg(6, 4), this.seg(18, 10)), steel);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.0015;
        group.add(ring);
        for (let i = 0; i < 2; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0015, 0.006), steel);
          blade.position.set(0.03 + i * 0.002, 0.001, -0.006 + i * 0.012);
          blade.rotation.y = (i ? 1 : -1) * 0.22;
          group.add(blade);
          const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0015, this.seg(12, 7)),
            this._mat(0x2A2A32, { roughness: 0.6, metalness: 0.2 }));
          bow.rotation.x = Math.PI / 2;
          bow.position.set(0.016 + i * 0.001, 0.001, -0.006 + i * 0.012);
          group.add(bow);
        }
        const fob = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.005, 0.026),
          this._mat(0x1E1E24, { roughness: 0.5, metalness: 0.2 }));
        fob.position.set(-0.026, 0.0025, 0);
        group.add(fob);
        const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), 6),
          this._glow(0x50C8E0, 0.7));
        sigil.rotation.x = Math.PI / 2;
        sigil.position.set(-0.026, 0.0055, 0);
        sigil.userData.pulse = { freq: 0.9, min: 0.35, max: 0.9 };
        group.add(sigil);
        return group;
      },

      // 166. Low orbit pin: a whistle worn as a lapel pin. It whistles the
      // ship down, so it is built as something you blow, not a badge.
      createLowOrbitPinModel(entry, rand) {
        const group = new THREE.Group();
        const alloy = this._steel(0xC8CCD2, 0.22);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.03, this.seg(14, 8)), alloy);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.006;
        group.add(body);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.003, 0.008),
          this._mat(0x2A3038, { roughness: 0.6, metalness: 0.3 }));
        mouth.position.set(0.004, 0.01, 0);
        group.add(mouth);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.012, this.seg(12, 7)), alloy);
        cone.rotation.z = -Math.PI / 2;
        cone.position.set(0.021, 0.006, 0);
        group.add(cone);
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.0025, this.seg(8, 5), this.seg(6, 4)),
          this._glow(0xE8F0FF, 1.0));
        spark.position.set(0.03, 0.006, 0);
        spark.userData.pulse = { freq: 2.2, min: 0.25, max: 1.0 };
        group.add(spark);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.016, this.seg(6, 4)), alloy);
        pin.rotation.z = Math.PI / 2;
        pin.position.set(-0.02, 0.006, 0.004);
        group.add(pin);
        const clasp = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.003, this.seg(10, 6)), alloy);
        clasp.rotation.z = Math.PI / 2;
        clasp.position.set(-0.028, 0.006, 0.004);
        group.add(clasp);
        return group;
      },

      // 167. Inflatable dinghy: packed, as its description says. A rolled
      // bundle of coated fabric strapped down, with the pump beside it.
      createInflatableDinghyModel(entry, rand) {
        const group = new THREE.Group();
        const coated = this._mat(0x9A5A1A, { roughness: 0.6, metalness: 0.05 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, this.seg(16, 9)), coated);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.03;
        group.add(roll);
        const strap = this._mat(0x1E2A32, { roughness: 0.95, metalness: 0.0 });
        for (const x of [-0.022, 0.022]) {
          const band = new THREE.Mesh(
            new THREE.TorusGeometry(0.0308, 0.003, this.seg(6, 4), this.seg(16, 9)), strap);
          band.rotation.y = Math.PI / 2;
          band.position.set(x, 0.03, 0);
          group.add(band);
        }
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.008, this.seg(10, 6)),
          this._mat(0x2A2A32, { roughness: 0.5, metalness: 0.2 }));
        valve.position.set(0.006, 0.062, 0);
        group.add(valve);
        const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.035, this.seg(12, 7)),
          this._mat(0x2A3A44, { roughness: 0.55, metalness: 0.15 }));
        pump.rotation.z = Math.PI / 2;
        pump.position.set(0, 0.008, 0.042);
        group.add(pump);
        const hose = new THREE.Mesh(
          new THREE.TorusGeometry(0.01, 0.0018, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x1A1A20, { roughness: 0.9, metalness: 0.0 }));
        hose.rotation.x = Math.PI / 2;
        hose.position.set(0.024, 0.0018, 0.042);
        group.add(hose);
        return group;
      },

      // 168. Flying broom: a besom, as the name says. A bound head of twigs
      // on a knotted stave, with the binding wire at the throat.
      createFlyingBroomModel(entry, rand) {
        const group = new THREE.Group();
        const stave = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.0065, 0.11, this.seg(10, 6)),
          this._wood(0x5A3E22));
        stave.rotation.z = Math.PI / 2 - 0.1;
        stave.position.set(-0.02, 0.02, 0);
        group.add(stave);
        const twig = this._mat(0x8A6A38, { roughness: 0.98, metalness: 0.0 });
        const count = this.wantsTrim() ? 9 : 5;
        for (let i = 0; i < count; i++) {
          const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.002, 0.055, this.seg(5, 3)), twig);
          const spread = (i / (count - 1) - 0.5);
          straw.rotation.set(spread * 0.5, 0, Math.PI / 2 - 0.1 + spread * 0.45);
          straw.position.set(0.062, 0.024 + spread * 0.006, spread * 0.012);
          group.add(straw);
        }
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, this.seg(12, 7)),
          this._mat(0x4A3A22, { roughness: 0.9, metalness: 0.05 }));
        throat.rotation.z = Math.PI / 2 - 0.1;
        throat.position.set(0.035, 0.021, 0);
        group.add(throat);
        const wire = new THREE.Mesh(
          new THREE.TorusGeometry(0.0095, 0.0012, this.seg(5, 3), this.seg(12, 7)),
          this._steel(0x8A8E94, 0.45));
        wire.rotation.y = Math.PI / 2;
        wire.rotation.z = -0.1;
        wire.position.set(0.041, 0.02, 0);
        group.add(wire);
        const grip = new THREE.Mesh(
          new THREE.TorusGeometry(0.0065, 0.002, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x3A2A1E, { roughness: 0.95, metalness: 0.0 }));
        grip.rotation.y = Math.PI / 2;
        grip.rotation.z = -0.1;
        grip.position.set(-0.05, 0.017, 0);
        group.add(grip);
        return group;
      }
    }
  });
})();
