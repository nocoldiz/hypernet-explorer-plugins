//=============================================================================
// Item 3D Models - Arctic
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the arctic goods of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Arctic
 * ============================================================================
 *
 * One model per entry, keyed by database id. Ten things carried out of the
 * cold, and the shelf holds together because of what they are made of rather
 * than what they do: hide, bone, packed snow and ice. Nothing here is
 * packaged; the only manufactured thing on it is a drum.
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
    console.error('[Item3D_Arctic] ItemModelSystem not loaded');
    return;
  }

  window.ItemModelSystem.registerFamily({
    name: 'Item3D_Arctic',

    unique: {
      i208: 'createNorthernPemmicanModel',
      i209: 'createIglooBlocksModel',
      i210: 'createPolarBlubberOilModel',
      i211: 'createPerfectSnowflakeModel',
      i212: 'createSnowhareWeaveModel',
      i213: 'createWayfindersDrumModel',
      i214: 'createGlacialHeartCrystalModel',
      i215: 'createFrostBearTalismanModel',
      i216: 'createAuroraEssenceModel',
      i217: 'createFrostseekersLensModel'
    },

    models: {
      // 208. Northern Pemmican: a pressed brick of fat and berries in a gut
      // casing, one end cut open.
      createNorthernPemmicanModel(entry, rand) {
        const group = new THREE.Group();
        const casing = this._mat(0xC8B89A, { roughness: 0.9, metalness: 0.02 });
        const brick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.024, 0.036), casing);
        brick.position.y = 0.012;
        group.add(brick);
        const cut = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.02, 0.032),
          this._mat(0x7A3A32, { roughness: 0.85, metalness: 0.0 }));
        cut.position.set(0.036, 0.012, 0);
        group.add(cut);
        const berry = this._mat(0x8A1E2A, { roughness: 0.75, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, this.seg(6, 4), this.seg(5, 3)), berry);
          dot.position.set(0.0365, 0.006 + i * 0.005, -0.008 + i * 0.006);
          group.add(dot);
        }
        const cord = new THREE.Mesh(
          new THREE.TorusGeometry(0.019, 0.0018, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x5A4A32, { roughness: 1.0, metalness: 0.0 }));
        cord.rotation.y = Math.PI / 2;
        cord.position.set(-0.02, 0.012, 0);
        cord.scale.set(1, 0.72, 1);
        group.add(cord);
        return group;
      },

      // 209. Igloo Building Blocks: three sawn blocks of packed snow, stacked
      // the way they come off the drift.
      createIglooBlocksModel(entry, rand) {
        const group = new THREE.Group();
        const snow = this._mat(0xEAF2F6, { roughness: 0.95, metalness: 0.0 });
        const shade = this._mat(0xD4E2EC, { roughness: 0.95, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.02, 0.028), snow);
          block.position.set((i ? 1 : -1) * 0.022, 0.01, (i ? 1 : -1) * 0.003);
          block.rotation.y = (i ? -1 : 1) * 0.08;
          group.add(block);
        }
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.02, 0.03), shade);
        top.position.set(0, 0.03, 0);
        top.rotation.y = 0.14;
        group.add(top);
        if (this.wantsTrim()) {
          const cut = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.001, 0.03),
            this._mat(0xC0D4E0, { roughness: 0.9, metalness: 0.0 }));
          cut.position.set(0, 0.0405, 0);
          cut.rotation.y = 0.14;
          group.add(cut);
        }
        return group;
      },

      // 210. Polar Blubber Oil: a horn vial of rendered oil, stoppered with
      // hide and hung on a thong.
      createPolarBlubberOilModel(entry, rand) {
        const group = new THREE.Group();
        const horn = this._mat(0xC8B48A, {
          roughness: 0.55, metalness: 0.02, transparent: true, opacity: 0.85
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.016, 0.06, this.seg(14, 8)), horn);
        body.position.y = 0.03;
        body.rotation.z = 0.06;
        group.add(body);
        const oil = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.013, 0.032, this.seg(12, 7)),
          this._mat(0xE0C860, { roughness: 0.25, metalness: 0.0 }));
        oil.position.y = 0.018;
        group.add(oil);
        const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.01, this.seg(10, 6)),
          this._mat(0x6A4A32, { roughness: 0.98, metalness: 0.0 }));
        plug.position.y = 0.064;
        group.add(plug);
        const thong = new THREE.Mesh(
          new THREE.TorusGeometry(0.008, 0.0012, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0x4A3A28, { roughness: 1.0, metalness: 0.0 }));
        thong.position.set(0.008, 0.056, 0);
        group.add(thong);
        return group;
      },

      // 211. Perfect Snowflake: a single six-armed crystal held between two
      // glass slides, which is the only way it survives being carried.
      createPerfectSnowflakeModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE4EEF4, {
          roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.3
        });
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0015, 0.05), glass);
        lower.position.y = 0.00075;
        group.add(lower);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0015, 0.05), glass);
        upper.position.y = 0.005;
        group.add(upper);
        const ice = this._glow(0xEAF6FF, 0.4);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0008, 0.0022), ice);
          arm.position.set(Math.cos(a) * 0.009, 0.003, Math.sin(a) * 0.009);
          arm.rotation.y = -a;
          group.add(arm);
          if (this.wantsTrim()) {
            for (const s of [-1, 1]) {
              const barb = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.0007, 0.0018), ice);
              barb.position.set(Math.cos(a) * 0.012, 0.003, Math.sin(a) * 0.012);
              barb.rotation.y = -a + s * 0.7;
              group.add(barb);
            }
          }
        }
        const frame = this._steel(0x9AA8B0, 0.4);
        for (const s of [-1, 1]) {
          const clip = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.007, 0.012), frame);
          clip.position.set(s * 0.024, 0.003, 0);
          group.add(clip);
        }
        return group;
      },

      // 212. Snowhare Weave: a bolt of white fur-nap cloth, rolled and tied.
      createSnowhareWeaveModel(entry, rand) {
        const group = new THREE.Group();
        const fur = this._mat(0xF0F4F6, { roughness: 1.0, metalness: 0.0 });
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.085, this.seg(16, 9)), fur);
        roll.rotation.z = Math.PI / 2;
        roll.position.y = 0.024;
        group.add(roll);
        // The loose end falling off the roll, so it reads as cloth not a log.
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.0025, 0.03), fur);
        tail.position.set(0, 0.0013, 0.03);
        tail.rotation.x = 0.06;
        group.add(tail);
        const nap = new THREE.Mesh(new THREE.CylinderGeometry(0.0245, 0.0245, 0.03, this.seg(16, 9), 1, true),
          this._mat(0xDCE6EC, { roughness: 1.0, metalness: 0.0, side: THREE.DoubleSide }));
        nap.rotation.z = Math.PI / 2;
        nap.position.y = 0.024;
        group.add(nap);
        const tie = new THREE.Mesh(
          new THREE.TorusGeometry(0.0248, 0.0018, this.seg(5, 3), this.seg(14, 8)),
          this._mat(0x8A6A3A, { roughness: 1.0, metalness: 0.0 }));
        tie.rotation.y = Math.PI / 2;
        tie.position.set(-0.022, 0.024, 0);
        group.add(tie);
        return group;
      },

      // 213. Wayfinder's Drum: a hoop drum, the head stretched and painted
      // with a route, the beater lying across it. Its description says whose
      // skin it is, and the model does not argue.
      createWayfindersDrumModel(entry, rand) {
        const group = new THREE.Group();
        const wood = this._wood(0x6A4A2A);
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.016, this.seg(20, 11), 1, true),
          wood);
        hoop.material.side = THREE.DoubleSide;
        hoop.position.y = 0.008;
        group.add(hoop);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.0015, this.seg(20, 11)),
          this._mat(0xD8C4A8, { roughness: 0.92, metalness: 0.0 }));
        head.position.y = 0.016;
        group.add(head);
        if (this.wantsTrim()) {
          const ink = this._mat(0x5A2A22, { roughness: 0.95, metalness: 0.0 });
          for (let i = 0; i < 3; i++) {
            const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.03 - i * 0.006, 0.0004, 0.0018), ink);
            stroke.position.set(0, 0.0172, -0.012 + i * 0.012);
            stroke.rotation.y = (i - 1) * 0.4;
            group.add(stroke);
          }
        }
        const sinew = this._mat(0xC8B89A, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 4 : 2); i++) {
          const a = i * Math.PI / 2;
          const lash = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.002), sinew);
          lash.position.set(Math.cos(a) * 0.045, 0.008, Math.sin(a) * 0.045);
          lash.rotation.y = -a;
          group.add(lash);
        }
        const beater = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.004, 0.055, this.seg(8, 5)), wood);
        beater.rotation.set(0, 0.5, Math.PI / 2);
        beater.position.set(0, 0.02, 0.03);
        group.add(beater);
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(10, 6), this.seg(8, 5)),
          this._mat(0xE8E4DC, { roughness: 1.0, metalness: 0.0 }));
        pad.position.set(0.026, 0.021, 0.017);
        group.add(pad);
        return group;
      },

      // 214. Glacial Heart Crystal: a blue-white shard that never melts, lit
      // from inside and standing point-up out of its own frost.
      createGlacialHeartCrystalModel(entry, rand) {
        const group = new THREE.Group();
        const frost = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.008, this.seg(14, 8)),
          this._mat(0xDCEAF2, { roughness: 0.95, metalness: 0.0 }));
        frost.position.y = 0.004;
        group.add(frost);
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 6),
          this._mat(0x9AD0E8, {
            roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.7,
            emissive: 0x3A8AB0, emissiveIntensity: 0.5
          }));
        shard.position.y = 0.034;
        group.add(shard);
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const spur = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.022, 5),
            this._mat(0xBCE0EE, { roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.65 }));
          const a = i * Math.PI * 2 / 3 + 0.4;
          spur.position.set(Math.cos(a) * 0.014, 0.017, Math.sin(a) * 0.014);
          spur.rotation.set(0.35, 0, -Math.cos(a) * 0.35);
          group.add(spur);
        }
        return group;
      },

      // 215. Frost Bear Talisman: a tooth bound in sinew with two beads, hung
      // open in a loose loop.
      createFrostBearTalismanModel(entry, rand) {
        const group = new THREE.Group();
        const thong = new THREE.Mesh(
          new THREE.TorusGeometry(0.024, 0.0015, this.seg(5, 3), this.seg(20, 11)),
          this._mat(0x4A3A28, { roughness: 1.0, metalness: 0.0 }));
        thong.rotation.x = Math.PI / 2;
        thong.position.y = 0.0015;
        group.add(thong);
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.034, this.seg(10, 6)),
          this._mat(0xEFE8D6, { roughness: 0.55, metalness: 0.03 }));
        tooth.rotation.set(0, 0, Math.PI / 2 - 0.3);
        tooth.position.set(0.004, 0.008, 0.014);
        group.add(tooth);
        const wrap = new THREE.Mesh(
          new THREE.TorusGeometry(0.0068, 0.0012, this.seg(5, 3), this.seg(12, 7)),
          this._mat(0xC8B89A, { roughness: 1.0, metalness: 0.0 }));
        wrap.rotation.set(0, 0.3, Math.PI / 2 - 0.3);
        wrap.position.set(-0.008, 0.008, 0.014);
        group.add(wrap);
        for (const s of [-1, 1]) {
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(8, 5), this.seg(6, 4)),
            this._mat(0x3A5A6A, { roughness: 0.5, metalness: 0.1 }));
          bead.position.set(s * 0.016, 0.004, -0.017);
          group.add(bead);
        }
        return group;
      },

      // 216. Aurora Essence: a sealed vial whose contents hang in bands of
      // green and violet, drifting rather than settling.
      createAuroraEssenceModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xDCE8EE, {
          roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.35
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.062, this.seg(16, 9)), glass);
        body.position.y = 0.031;
        group.add(body);
        const bands = [0x3AE08A, 0x50C8E0, 0x9A5AE0];
        for (let i = 0; i < bands.length; i++) {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.013, this.seg(14, 8)),
            this._glow(bands[i], 0.65));
          band.position.y = 0.012 + i * 0.015;
          band.userData.bob = { amp: 0.003, freq: 0.5 + i * 0.2 };
          band.userData.pulse = { freq: 0.9 + i * 0.3, min: 0.4, max: 0.95 };
          group.add(band);
        }
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.01, this.seg(14, 8)),
          this._steel(0xB0BCC4, 0.35));
        cap.position.y = 0.067;
        group.add(cap);
        return group;
      },

      // 217. Frostseeker's Lens: a disc of clear ice ground into a lens and
      // set in a bone rim, standing in a cradle.
      createFrostseekersLensModel(entry, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xE0D8C4, { roughness: 0.7, metalness: 0.02 });
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.016), bone);
        foot.position.y = 0.003;
        group.add(foot);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0025, 0.018, this.seg(8, 5)), bone);
          arm.position.set(s * 0.012, 0.015, 0);
          arm.rotation.z = -s * 0.2;
          group.add(arm);
        }
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(0.019, 0.0028, this.seg(6, 4), this.seg(18, 10)), bone);
        rim.position.y = 0.04;
        group.add(rim);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(16, 9), this.seg(12, 7)),
          this._mat(0xE4F2F8, {
            roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.35
          }));
        lens.scale.z = 0.22;
        lens.position.y = 0.04;
        group.add(lens);
        return group;
      }
    }
  });
})();
