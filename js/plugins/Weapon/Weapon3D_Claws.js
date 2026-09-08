//=============================================================================
// Weapon 3D Models - Claws
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for claws. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Claws
 * ============================================================================
 *
 * One family per weapon type. This one owns every Claw weapon (wtypeId 10):
 * the generic silhouette the type falls back to, the note-tagged one-offs of
 * that type, and every bespoke per-weapon model in it.
 *
 * NOT listed in plugins.js. WeaponSystemProcedural.js injects this file at
 * runtime from its WEAPON3D_FAMILIES list, the same way 3DBattlerSystem.js
 * loads its 3DBattler_* families. Adding a model means adding a builder here
 * and, for a bespoke one, its database id to the unique map below.
 *
 * Every builder takes (weapon, rand) where rand is a seeded RNG derived from
 * the world's history seed, and returns a THREE.Group whose grip sits below
 * the origin with the weapon running along +Y. Shared construction helpers
 * (_plate, _bladeOutline, _hilt, _crossguard, _rivets, seg, wantsTrim, the
 * colour palettes and the material shorthands) live on WeaponSystemProcedural
 * itself, so they are available as `this` inside a builder.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.WeaponSystemProcedural) {
    console.error('[Weapon3D_Claws] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Claws',
    unique: {
      540: 'createTinClawsModel',            // Tin Claws
      541: 'createDullClawsModel',           // Dull Claws
      542: 'createGardenShearClawsModel',    // Garden Shear Claws
      543: 'createCarPanelClawsModel',       // Car Panel Claws
      544: 'createRazorDiscClawsModel',      // Razor Disc Claws
      545: 'createSeedClawModel',            // Seed Claw
      546: 'createBaghNakhModel',            // Bagh Nakh
      547: 'createBaghNakaModel',            // Bagh Naka
      548: 'createKatarClawModel',           // Katar
      549: 'createIronClawModel',            // Iron Claw
      550: 'createDeerHornKnivesModel',      // Deer Horn Knives
      551: 'createTekkoKagiModel',           // Tekko-kagi
      552: 'createVenomClawsModel',          // Venom Claws
      553: 'createMithrilClawModel',         // Mithril Claw
      554: 'createLifeDrainClawsModel',      // Life Drain Claws
      555: 'createNeuralClawsModel',         // Neural Claws
      556: 'createFrostDragonClawsModel',    // Frost Dragon Claws
      557: 'createDragonClawModel',          // Dragon Claw
      558: 'createMindRipperClawsModel',     // Mind Ripper Claws
      559: 'createCraneTalonsModel',         // Crane Talons
      560: 'createPsychoactiveTalonsModel',  // EHI Psychoactive Talons
      561: 'createDivineTalonsModel'         // Divine Talons
    },
    models: {
      /**
       * The hand a claw is worn on: a back plate, the knuckle ridge the blades
       * are bolted through, the straps that hold it and a wrist cuff below the
       * origin. A claw is not gripped like a sword, it is strapped on, so most
       * models in this family start from one of these and hang their blades off
       * the ridge at +Z, where the knuckles are.
       * @param opts { width, plate, ridgeMat, strapMat, straps, cuff, cuffMat,
       *   palmBar }
       */
      _clawHand(group, mat, opts) {
        const o = opts || {};
        const w = o.width || 0.078;
        const depth = o.plate || 0.026;
        const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.062, depth), mat);
        back.position.set(0, 0.014, 0.004);
        group.add(back);
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.018, depth * 0.85), o.ridgeMat || mat);
        ridge.position.set(0, 0.05, 0.012);
        group.add(ridge);
        // Straps over the back of the hand, flattened so they sit on it
        // rather than hoop round it.
        const straps = o.straps === undefined ? 3 : o.straps;
        for (let i = 0; i < straps; i++) {
          const s = new THREE.Mesh(new THREE.TorusGeometry(
            0.036 - i * 0.001, 0.005, this.seg(4, 3), this.seg(12, 7)), o.strapMat || mat);
          s.rotation.x = Math.PI / 2;
          s.position.set(0, 0.032 - i * 0.03, 0.002);
          s.scale.z = 0.6;
          group.add(s);
        }
        if (o.cuff !== 0) {
          const cuff = new THREE.Mesh(new THREE.CylinderGeometry(
            0.03, 0.033, o.cuff || 0.05, this.seg(11, 7)), o.cuffMat || mat);
          cuff.position.y = -0.058;
          cuff.scale.z = 0.7;
          group.add(cuff);
        }
        // The bar that closes in the palm, on the far side of the hand from
        // the blades, for the claws that are held rather than worn.
        if (o.palmBar) {
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(
            0.008, 0.008, w * 0.95, this.seg(8, 5)), o.palmBar);
          bar.rotation.z = Math.PI / 2;
          bar.position.set(0, 0.018, -0.024);
          group.add(bar);
        }
        return group;
      },

      /**
       * One claw: a chain of tapering segments following a quadratic bend,
       * flattened across its width so it reads as an edge rather than a spike.
       * Nearly every talon in this family is this call with a different bend,
       * which is the whole difference between a tiger's claw and a cheap hook.
       * Returns the talon's own group, so a caller can hang animation data on
       * a blade without touching the hand it grows out of.
       * @param opts { length, sweep, curl, r0, r1, flat, sides, segments,
       *   blunt, tipMat, position, rotation }
       */
      _talon(group, mat, opts) {
        const o = opts || {};
        const len = o.length || 0.09;
        const sweep = o.sweep === undefined ? 0.06 : o.sweep;
        const curl = o.curl === undefined ? 0.3 : o.curl;
        const r0 = o.r0 || 0.008;
        const r1 = o.r1 === undefined ? 0.002 : o.r1;
        const sides = this.seg(o.sides || 5, 4);
        const n = this.seg(o.segments || 5, 3);
        const talon = new THREE.Group();
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, len * 0.62, sweep * curl),
          new THREE.Vector3(0, len, sweep)
        );
        const pts = curve.getPoints(n);
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const d = b.clone().sub(a);
          const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
          const part = new THREE.Mesh(new THREE.CylinderGeometry(
            r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, d.length() * 1.1, sides), mat);
          part.position.copy(a).add(b).multiplyScalar(0.5);
          part.quaternion.setFromUnitVectors(up, d.clone().normalize());
          talon.add(part);
        }
        const last = pts[pts.length - 1];
        const dir = last.clone().sub(pts[pts.length - 2]).normalize();
        // A claw that has been used badly ends in a knob instead of a point.
        let tip;
        if (o.blunt) {
          tip = new THREE.Mesh(new THREE.SphereGeometry(r1 * 1.4, this.seg(7, 5), this.seg(5, 4)), o.tipMat || mat);
        } else {
          tip = new THREE.Mesh(new THREE.ConeGeometry(r1 * 1.5 + 0.0008, len * 0.18, sides), o.tipMat || mat);
          tip.quaternion.setFromUnitVectors(up, dir);
        }
        tip.position.copy(last).add(dir.clone().multiplyScalar(len * 0.08));
        talon.add(tip);
        talon.scale.x = o.flat === undefined ? 0.45 : o.flat;
        if (o.position) talon.position.set(o.position[0], o.position[1], o.position[2]);
        if (o.rotation) talon.rotation.set(o.rotation[0], o.rotation[1], o.rotation[2]);
        group.add(talon);
        return talon;
      },

      // ---- 540: Tin Claws -----------------------------------------------------
      createTinClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const tin = this._mat(0xC6CBD0, { roughness: 0.6, metalness: 0.55 });
        const hide = this._mat(0x6B4A2E, { roughness: 0.92, metalness: 0.03 });
        const solder = this._mat(0x9EA4A8, { roughness: 0.8, metalness: 0.5 });
        // Tin holds neither an edge nor a shape. Each blade has taken its own
        // set from the last thing it met, and the solder tacking them to the
        // ridge ran before it set.
        this._clawHand(group, hide, { width: 0.076, ridgeMat: solder, strapMat: hide });
        for (let i = 0; i < 3; i++) {
          const x = -0.024 + i * 0.024;
          const t = this._talon(group, tin, {
            length: 0.082, sweep: 0.05, curl: 0.32, r0: 0.007, r1: 0.0022,
            position: [x, 0.056, 0.016]
          });
          t.rotation.set(-0.12 + rand() * 0.24, 0, (i - 1) * 0.2 + (rand() - 0.5) * 0.28);
          const blob = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), solder);
          blob.position.set(x, 0.052, 0.022);
          blob.scale.y = 0.65;
          group.add(blob);
        }
        // Where the metal has already folded over on itself instead of cutting.
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const fold = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.01), tin);
            fold.position.set(-0.024 + i * 0.024, 0.09 + rand() * 0.02, 0.04);
            fold.rotation.z = (rand() - 0.5) * 1.4;
            group.add(fold);
          }
        }
        return group;
      },

      // ---- 541: Dull Claws ----------------------------------------------------
      createDullClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const grey = this._mat(0x7E8489, { roughness: 0.88, metalness: 0.45 });
        const rust = this._mat(0x7A452A, { roughness: 0.95, metalness: 0.18 });
        const hide = this._mat(0x4A3527, { roughness: 0.95, metalness: 0.02 });
        // Scrap steel, never hardened: the points have already rounded off
        // into knobs and the rust arrived before the first fight did.
        this._clawHand(group, hide, { width: 0.078, ridgeMat: grey, strapMat: hide });
        for (let i = 0; i < 4; i++) {
          const t = this._talon(group, grey, {
            length: 0.068, sweep: 0.038, curl: 0.35, r0: 0.007, r1: 0.005,
            blunt: true, position: [-0.03 + i * 0.02, 0.056, 0.014]
          });
          t.rotation.z = (i - 1.5) * 0.12;
        }
        // Rust freckles, thickest where the blades meet the ridge and the
        // damp never dries out.
        const spots = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < spots; i++) {
          const spot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.005, 0.004), rust);
          spot.position.set(-0.032 + rand() * 0.064, 0.046 + rand() * 0.03, 0.02);
          spot.rotation.z = rand();
          group.add(spot);
        }
        const bandage = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.005, this.seg(4, 3), this.seg(12, 7)), hide);
        bandage.rotation.x = Math.PI / 2;
        bandage.position.set(0, -0.03, 0.002);
        bandage.scale.z = 0.62;
        group.add(bandage);
        return group;
      },

      // ---- 542: Garden Shear Claws --------------------------------------------
      createGardenShearClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x9AA0A6, { roughness: 0.42, metalness: 0.85 });
        const dip = this._mat(this.getRandomColor(rand, [0xE05A1E, 0x2E8B3A, 0xC8102E]), { roughness: 0.85, metalness: 0.04 });
        const glove = this._mat(0x2E6B3A, { roughness: 0.95, metalness: 0.02 });
        // Secateurs taken off their spring and bolted to a gardening glove.
        // Both jaws still turn on the pivot, which is the only reason this
        // works at all.
        this._clawHand(group, glove, { width: 0.082, ridgeMat: steel, strapMat: glove });
        const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.032, this.seg(10, 6)), steel);
        pivot.rotation.x = Math.PI / 2;
        pivot.position.set(0, 0.058, 0.026);
        group.add(pivot);
        for (const s of [1, -1]) {
          // The hooked jaw and the counter blade, opening and closing against
          // each other exactly as they did on the rose bushes.
          const jaw = this._plate([
            [0, 0], [0.014, 0.012], [0.019, 0.05], [0.007, 0.098], [-0.004, 0.092], [-0.009, 0.04]
          ], 0.005, steel);
          jaw.position.set(s * 0.005, 0.058, 0.026 + s * 0.007);
          jaw.rotation.z = s * 0.24;
          jaw.userData.sway = { axis: 'z', amp: s * 0.12, freq: 0.85 };
          group.add(jaw);
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.062, this.seg(8, 5)), dip);
          handle.position.set(s * 0.02, 0.026, 0.026);
          handle.rotation.z = s * 0.55;
          group.add(handle);
        }
        // The bolt that replaced the spring, and the strap round the palm.
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.044, this.seg(7, 5)), steel);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(0, 0.04, 0.012);
        group.add(bolt);
        const cuffStrap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.016, 0.05), glove);
        cuffStrap.position.set(0, -0.03, 0.004);
        group.add(cuffStrap);
        return group;
      },

      // ---- 543: Car Panel Claws -----------------------------------------------
      createCarPanelClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const paintColor = this.getRandomColor(rand, [0xC0392B, 0x1D6FD6, 0xE8E4DC, 0x2A2A2E]);
        const paint = this._mat(paintColor, { roughness: 0.35, metalness: 0.45 });
        const primer = this._mat(0x9A8F86, { roughness: 0.9, metalness: 0.3 });
        const glove = this._mat(0x3E6B2E, { roughness: 0.95, metalness: 0.02 });
        // Strips torn off a wing panel: painted on one face, primer on the
        // other, ground to an edge on whichever side tore straight.
        this._clawHand(group, glove, { width: 0.08, ridgeMat: primer, strapMat: glove });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          // Sheet steel does not taper, it just gets narrower where it tore.
          const strip = this._plate([
            [-0.011, 0], [0.011, 0], [0.009, 0.05], [0.006, 0.086], [-0.004, 0.08], [-0.009, 0.045]
          ], 0.002, paint);
          strip.position.set(x, 0.052, 0.024);
          strip.rotation.set(-0.35, 0, (i - 1) * 0.16);
          group.add(strip);
          const behind = this._plate([
            [-0.011, 0], [0.011, 0], [0.009, 0.05], [0.006, 0.086], [-0.004, 0.08], [-0.009, 0.045]
          ], 0.0018, primer);
          behind.position.set(x, 0.052, 0.0225);
          behind.rotation.set(-0.35, 0, (i - 1) * 0.16);
          group.add(behind);
          const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, this.seg(6, 4)), primer);
          bolt.rotation.x = Math.PI / 2;
          bolt.position.set(x, 0.05, 0.026);
          group.add(bolt);
        }
        // The tear line along the top of the ridge, where the panel gave.
        if (this.wantsTrim()) {
          for (let i = 0; i < 5; i++) {
            const jag = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.01, this.seg(4, 3)), primer);
            jag.position.set(-0.032 + i * 0.016, 0.062, 0.016);
            jag.rotation.z = (rand() - 0.5) * 0.9;
            group.add(jag);
          }
        }
        return group;
      },

      // ---- 544: Razor Disc Claws ----------------------------------------------
      createRazorDiscClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const razor = this._mat(0xE0E6EA, { roughness: 0.12, metalness: 0.95 });
        const disc = this._mat(0xC9D6E8, { roughness: 0.05, metalness: 0.85, emissive: 0x2A3A6B, emissiveIntensity: 0.25 });
        const tape = this._mat(0x2A2A2E, { roughness: 0.95, metalness: 0.02 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        // Fingerless gloves with safety razors taped across the knuckles and
        // quarters of a snapped disc wedged in beside them. Twenty-five grams
        // of weapon and every gram of it an edge.
        this._clawHand(group, skin, { width: 0.078, ridgeMat: tape, strapMat: tape, straps: 2 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const blade = this._plate([
            [-0.012, 0], [0.012, 0], [0.012, 0.02], [0, 0.026], [-0.012, 0.02]
          ], 0.0012, razor);
          blade.position.set(x, 0.058, 0.026);
          blade.rotation.x = -0.3;
          group.add(blade);
          // The slot every safety razor has stamped through it.
          const slot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.003), tape);
          slot.position.set(x, 0.066, 0.028);
          group.add(slot);
        }
        // Disc shards, snapped along the radius and still rainbowed.
        const shards = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < shards; i++) {
          const sh = this._plate([
            [0, 0], [0.03, 0.008], [0.026, 0.03], [0.004, 0.022]
          ], 0.0012, disc);
          sh.position.set(-0.03 + i * 0.02, 0.05, 0.03);
          sh.rotation.set(-0.2, 0, 0.5 + (i % 2) * 0.7);
          group.add(sh);
        }
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, this.seg(4, 3), this.seg(12, 7)), tape);
        wrap.rotation.x = Math.PI / 2;
        wrap.position.set(0, -0.05, 0.002);
        wrap.scale.z = 0.65;
        group.add(wrap);
        return group;
      },

      // ---- 545: Seed Claw -----------------------------------------------------
      createSeedClawModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x5B4227);
        const leaf = this._mat(this.getRandomColor(rand, [0x4E9A3A, 0x6BBF48]), { roughness: 0.6, metalness: 0.05 });
        const husk = this._mat(0xC8A02A, { roughness: 0.55, metalness: 0.1 });
        const sap = this._glow(0xB8FF5A, 0.8);
        // A blade seed that took root in the hand instead of a scabbard: bark
        // over the knuckles, thorns hardened into claws, and the pod that
        // grew them still hanging on the wrist.
        this._clawHand(group, bark, { width: 0.078, ridgeMat: bark, strapMat: leaf, cuff: 0.04 });
        for (let i = 0; i < 3; i++) {
          const x = -0.024 + i * 0.024;
          const thorn = this._talon(group, bark, {
            length: 0.088, sweep: 0.058, curl: 0.28, r0: 0.008, r1: 0.002,
            position: [x, 0.056, 0.014]
          });
          thorn.rotation.z = (i - 1) * 0.16;
          thorn.userData.sway = { axis: 'x', amp: 0.05, freq: 0.6, phase: i * 0.9 };
          const seed = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), sap);
          seed.position.set(x, 0.052, 0.024);
          seed.userData.pulse = { min: 0.2, max: 1.1, freq: 0.9, phase: i * 0.7 };
          group.add(seed);
        }
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(8, 5)), husk);
        pod.scale.set(0.8, 1.4, 0.8);
        pod.position.set(-0.03, -0.04, 0.02);
        pod.userData.sway = { axis: 'z', amp: 0.14, freq: 0.7 };
        group.add(pod);
        // Leaves off the wrist, which is where the thing is still growing.
        for (let i = 0; i < 2; i++) {
          const l = this._plate([[0, 0], [0.018, 0.012], [0.026, 0.036], [0.004, 0.028]], 0.003, leaf);
          l.position.set(0.026 + i * 0.006, -0.02 + i * 0.03, -0.026);
          l.rotation.set(0, i * 1.1, -0.5);
          l.userData.sway = { axis: 'z', amp: 0.16, freq: 1.1, phase: i };
          group.add(l);
        }
        return group;
      },

      // ---- 546: Bagh Nakh ------------------------------------------------------
      createBaghNakhModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0x8E959B, { roughness: 0.3, metalness: 0.9 });
        const skin = this._mat(0xC9A08A, { roughness: 0.85, metalness: 0.02 });
        const cord = this._mat(0x8B2E1F, { roughness: 0.95, metalness: 0.02 });
        // The tiger's claw: a bar that closes inside the fist with a ring at
        // each end for the first finger and the thumb, so the four blades come
        // out between the fingers and the weapon itself is invisible from the
        // back of the hand.
        this._clawHand(group, skin, { width: 0.08, ridgeMat: skin, strapMat: cord, straps: 1, cuff: 0, palmBar: steel });
        for (let i = 0; i < 4; i++) {
          const x = -0.028 + i * 0.019;
          const t = this._talon(group, steel, {
            length: 0.042, sweep: 0.034, curl: 0.2, r0: 0.006, r1: 0.0015,
            position: [x, 0.05, 0.02]
          });
          t.rotation.set(0.25, 0, (i - 1.5) * 0.1);
        }
        // The spine the blades stand on, and the two rings that hold it.
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.012), steel);
        spine.position.set(0, 0.048, 0.018);
        group.add(spine);
        for (const s of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0025, this.seg(4, 3), this.seg(12, 7)), steel);
          ring.rotation.y = Math.PI / 2;
          ring.position.set(s * 0.04, 0.03, -0.008);
          group.add(ring);
        }
        // Cord round the bar, so it does not turn in a wet hand.
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const lash = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, this.seg(4, 3), this.seg(9, 6)), cord);
            lash.rotation.y = Math.PI / 2;
            lash.position.set(-0.024 + i * 0.016, 0.018, -0.024);
            group.add(lash);
          }
        }
        return group;
      },

      // ---- 547: Bagh Naka ------------------------------------------------------
      createBaghNakaModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x6E747A, { roughness: 0.45, metalness: 0.82 });
        const brass = this._cast(0xB9902A);
        const leather = this._mat(0x3A2A1C, { roughness: 0.95, metalness: 0.02 });
        // The worn cousin of the bagh nakh: the same four short claws, but on
        // a hinged plate over the back of the fingers with a knuckle spike
        // added, so it strikes on the punch as well as the drag.
        this._clawHand(group, leather, { width: 0.082, ridgeMat: iron, strapMat: leather });
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.074, this.seg(8, 5)), brass);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(0, 0.044, 0.02);
        group.add(hinge);
        for (let i = 0; i < 4; i++) {
          const x = -0.028 + i * 0.019;
          const t = this._talon(group, iron, {
            length: 0.046, sweep: 0.03, curl: 0.25, r0: 0.0065, r1: 0.0016,
            position: [x, 0.056, 0.022]
          });
          t.rotation.set(0.18, 0, (i - 1.5) * 0.12);
          const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), iron);
          knuckle.position.set(x, 0.056, 0.02);
          knuckle.scale.z = 0.8;
          group.add(knuckle);
        }
        // The spike that does the work when the hand is closed.
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.03, this.seg(6, 4)), brass);
        spike.position.set(0, 0.03, 0.034);
        spike.rotation.x = Math.PI / 2;
        group.add(spike);
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(4, 3), this.seg(10, 6)), brass);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(0, 0.03, 0.024);
        group.add(collar);
        return group;
      },

      // ---- 548: Katar ---------------------------------------------------------
      // The Light family already owns a createKatarModel for the dagger at id
      // 16; this is the claw-type push blade and keeps its own name.
      createKatarClawModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0xB4BABF, { roughness: 0.22, metalness: 0.92 });
        const dark = this._mat(0x3A3F45, { roughness: 0.5, metalness: 0.8 });
        const wrap = this._mat(0x6B2E1F, { roughness: 0.9, metalness: 0.03 });
        // A push dagger, not a held one: two rails run back along the forearm,
        // two cross grips sit in the closed fist between them, and the blade
        // goes wherever the arm goes. The thickened tip is for mail.
        for (const s of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.014), steel);
          rail.position.set(s * 0.03, -0.03, 0.008);
          group.add(rail);
          const flare = this._plate([[0, 0], [0.012, 0.006], [0.01, 0.03], [-0.002, 0.026]], 0.006, dark);
          flare.position.set(s * 0.036, -0.086, 0.008);
          flare.rotation.z = s > 0 ? 0 : Math.PI;
          group.add(flare);
        }
        for (let i = 0; i < 2; i++) {
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.056, this.seg(9, 6)), wrap);
          grip.rotation.z = Math.PI / 2;
          grip.position.set(0, -0.014 - i * 0.026, 0.008);
          group.add(grip);
        }
        // Blade: a long triangle with a raised rib down the middle.
        const blade = this._plate([
          [-0.024, 0], [0.024, 0], [0.014, 0.09], [0.006, 0.15], [-0.006, 0.15], [-0.014, 0.09]
        ], 0.006, steel);
        blade.position.set(0, 0.04, 0.008);
        group.add(blade);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.13, 0.012), steel);
        rib.position.set(0, 0.09, 0.008);
        group.add(rib);
        const reinforce = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(6, 4)), dark);
        reinforce.position.set(0, 0.185, 0.008);
        group.add(reinforce);
        const throat = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.014, 0.018), dark);
        throat.position.set(0, 0.036, 0.008);
        group.add(throat);
        this._rivets(group, dark, 2, 0.01, 0.02, 0.004, 0.005, 0.008);
        return group;
      },

      // ---- 549: Iron Claw -----------------------------------------------------
      createIronClawModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x5E646A, { roughness: 0.62, metalness: 0.78 });
        const bright = this._mat(0x9AA0A6, { roughness: 0.35, metalness: 0.9 });
        const leather = this._mat(0x3A2A1C, { roughness: 0.95, metalness: 0.02 });
        // Wrought rather than cast: three heavy talons drawn out under a
        // hammer, still showing the facets, on a bracer thick enough to take
        // the shock of them.
        this._clawHand(group, iron, { width: 0.084, ridgeMat: iron, strapMat: leather, cuff: 0.062 });
        for (let i = 0; i < 3; i++) {
          const t = this._talon(group, iron, {
            length: 0.1, sweep: 0.062, curl: 0.3, r0: 0.0095, r1: 0.0022,
            sides: 4, position: [-0.026 + i * 0.026, 0.056, 0.014],
            tipMat: bright
          });
          t.rotation.z = (i - 1) * 0.18;
        }
        // Hammer marks along the ridge, which is the only decoration a smith
        // put on it.
        if (this.wantsTrim()) {
          for (let i = 0; i < 6; i++) {
            const mark = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.004), bright);
            mark.position.set(-0.03 + i * 0.012, 0.046 + (i % 2) * 0.006, 0.024);
            mark.rotation.z = 0.3 - (i % 3) * 0.2;
            group.add(mark);
          }
        }
        const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.003, this.seg(4, 3), this.seg(10, 6)), bright);
        buckle.rotation.y = Math.PI / 2;
        buckle.position.set(0.032, -0.056, 0.012);
        group.add(buckle);
        return group;
      },

      // ---- 550: Deer Horn Knives ----------------------------------------------
      createDeerHornKnivesModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(0xC2C8CE, { roughness: 0.18, metalness: 0.94 });
        const brass = this._cast(0xB9902A);
        const cord = this._mat(this.getRandomColor(rand, [0x8B1A1A, 0x1D3557, 0x2A2A2E]), { roughness: 0.95, metalness: 0.02 });
        // The one weapon in the family that is held rather than worn: two
        // crossed crescents gripped where they overlap, so four points face
        // out at once and the hand sits inside the curve of both.
        this._hilt(group, rand, { height: 0.07, rTop: 0.012, mat: brass, wrapMat: cord, pommelMat: brass, pommel: 'nut' });
        for (const s of [1, -1]) {
          // A crescent is an arc of horn ground to an edge on the outside.
          const arc = new THREE.Mesh(new THREE.TorusGeometry(
            0.058, 0.006, this.seg(5, 4), this.seg(16, 9), Math.PI * 1.05), steel);
          arc.rotation.set(0, Math.PI / 2, s > 0 ? -0.5 : Math.PI - 0.5);
          arc.position.set(0, 0.01, 0);
          arc.scale.z = 0.45;
          group.add(arc);
          for (const e of [1, -1]) {
            const point = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.036, this.seg(6, 4)), steel);
            point.position.set(0, 0.01 + s * 0.052, e * 0.03);
            point.rotation.set(e * 0.6, 0, 0);
            point.scale.x = 0.5;
            group.add(point);
          }
        }
        // The lashing that holds the two crescents to each other.
        const lash = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(12, 7)), cord);
        lash.rotation.x = Math.PI / 2;
        lash.position.set(0, 0.014, 0);
        group.add(lash);
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.008, this.seg(10, 6)), brass);
        guard.position.set(0, 0.004, 0);
        group.add(guard);
        return group;
      },

      // ---- 551: Tekko-kagi ----------------------------------------------------
      createTekkoKagiModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x4A5056, { roughness: 0.55, metalness: 0.8 });
        const bright = this._mat(0x8E959B, { roughness: 0.3, metalness: 0.92 });
        const wrap = this._mat(0x1A1A1E, { roughness: 0.95, metalness: 0.02 });
        // Four hooks welded to a band that turns on the palm, so they lie
        // along the forearm to be hidden and swing out over the knuckles to
        // catch a blade. This is a parrying tool that happens to tear.
        this._clawHand(group, wrap, { width: 0.074, ridgeMat: iron, strapMat: wrap, straps: 2, cuff: 0.046, cuffMat: iron });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, this.seg(5, 4), this.seg(14, 8)), iron);
        band.rotation.x = Math.PI / 2;
        band.position.set(0, 0.008, 0.002);
        band.scale.z = 0.62;
        group.add(band);
        for (let i = 0; i < 4; i++) {
          const x = -0.027 + i * 0.018;
          // A long straight shank that only turns at the very end.
          const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.09, this.seg(6, 4)), iron);
          shank.position.set(x, 0.056, 0.024);
          shank.rotation.x = -0.12;
          group.add(shank);
          const hook = this._talon(group, bright, {
            length: 0.03, sweep: 0.026, curl: 0.1, r0: 0.0042, r1: 0.0014,
            // Seated on the end of its own shank: the shank leans back, so a
            // hook set forward of it hung off the tip.
            position: [x, 0.1, 0.019]
          });
          hook.rotation.x = 0.7;
        }
        // The plate the shanks are welded through, on the back of the hand.
        const weldPlate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.01), iron);
        weldPlate.position.set(0, 0.026, 0.026);
        group.add(weldPlate);
        if (this.wantsTrim()) {
          for (let i = 0; i < 4; i++) {
            const weld = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), iron);
            weld.position.set(-0.027 + i * 0.018, 0.026, 0.032);
            weld.scale.y = 0.6;
            group.add(weld);
          }
        }
        return group;
      },

      // ---- 552: Venom Claws ---------------------------------------------------
      createVenomClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const venomColor = this.getRandomColor(rand, [0x7CFF3A, 0x3AFFB0, 0xC77DFF]);
        const venom = this._glow(venomColor, 1.1);
        const glass = this._mat(venomColor, { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.65 });
        const steel = this._mat(0xA8AEB4, { roughness: 0.25, metalness: 0.92 });
        const rubber = this._mat(0x1E2126, { roughness: 0.95, metalness: 0.04 });
        // Hollow claws, not solid ones: each is a needle fed from the bladder
        // on the wrist through a line of tube, and the whole thing weighs
        // fifty grams because almost none of it is metal.
        this._clawHand(group, rubber, { width: 0.076, ridgeMat: steel, strapMat: rubber, cuff: 0.04 });
        for (let i = 0; i < 3; i++) {
          const x = -0.024 + i * 0.024;
          const t = this._talon(group, steel, {
            length: 0.078, sweep: 0.05, curl: 0.3, r0: 0.0065, r1: 0.0016,
            position: [x, 0.056, 0.016]
          });
          t.rotation.z = (i - 1) * 0.16;
          // The channel down the back of the blade, lit by what is in it.
          const channel = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.06, 0.006), venom);
          channel.position.set(x, 0.086, 0.032);
          channel.rotation.x = -0.5;
          channel.userData.pulse = { min: 0.3, max: 1.3, freq: 1.4, phase: i * 0.9 };
          group.add(channel);
          const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, this.seg(6, 4)), glass);
          line.position.set(x, 0.026, 0.026);
          line.rotation.z = (i - 1) * 0.3;
          group.add(line);
        }
        // The bladder, which is never quite full and moves when the arm does.
        const bladder = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(8, 5)), glass);
        bladder.scale.set(1, 0.8, 0.7);
        bladder.position.set(0, -0.036, 0.026);
        group.add(bladder);
        const dose = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), venom);
        dose.scale.set(1, 0.55, 0.7);
        dose.position.set(0, -0.042, 0.026);
        dose.userData.bob = { axis: 'y', amp: 0.003, freq: 0.8 };
        dose.userData.pulse = { min: 0.4, max: 1.2, freq: 0.9 };
        group.add(dose);
        return group;
      },

      // ---- 553: Mithril Claw --------------------------------------------------
      createMithrilClawModel(weapon, rand) {
        const group = new THREE.Group();
        const mithril = this._mat(0xE4EEF4, { roughness: 0.1, metalness: 0.96, emissive: 0x2A4A66, emissiveIntensity: 0.2 });
        const filigree = this._mat(0xBFD6E4, { roughness: 0.18, metalness: 0.9 });
        const silk = this._mat(0x2E4A6B, { roughness: 0.85, metalness: 0.05 });
        // Mithril is drawn out further than steel would allow, so the talons
        // are longer and thinner than they have any right to be, and the
        // bracer under them is mostly openwork.
        this._clawHand(group, filigree, { width: 0.076, ridgeMat: mithril, strapMat: silk, cuff: 0.056 });
        for (let i = 0; i < 3; i++) {
          const t = this._talon(group, mithril, {
            length: 0.115, sweep: 0.06, curl: 0.34, r0: 0.006, r1: 0.0012,
            segments: 6, position: [-0.024 + i * 0.024, 0.056, 0.014]
          });
          t.rotation.z = (i - 1) * 0.15;
        }
        // Openwork arcs across the bracer, which is what a mithril smith does
        // instead of adding weight.
        const arcs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < arcs; i++) {
          const arc = new THREE.Mesh(new THREE.TorusGeometry(
            0.016 + i * 0.002, 0.0022, this.seg(4, 3), this.seg(12, 7), Math.PI), filigree);
          arc.position.set(0, 0.02 - i * 0.022, 0.02);
          arc.rotation.set(0, 0, i % 2 ? Math.PI : 0);
          group.add(arc);
        }
        const leafDetail = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), mithril);
        leafDetail.position.set(0, 0.05, 0.026);
        leafDetail.scale.set(1, 1.6, 0.5);
        group.add(leafDetail);
        return group;
      },

      // ---- 554: Life Drain Claws ----------------------------------------------
      createLifeDrainClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0x6B5A52, { roughness: 0.7, metalness: 0.25 });
        const vital = this._glow(0xE01A3A, 1.2);
        const dark = this._mat(0x241A1E, { roughness: 0.75, metalness: 0.45 });
        // The blades are grooved rather than fluted, and the grooves all run
        // the same way: down, into the reservoir at the wrist. What it takes
        // does not stay in the target and does not stay in the claw either.
        this._clawHand(group, dark, { width: 0.08, ridgeMat: bone, strapMat: dark, cuff: 0.054 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const t = this._talon(group, bone, {
            length: 0.092, sweep: 0.055, curl: 0.32, r0: 0.008, r1: 0.0018,
            position: [x, 0.056, 0.014]
          });
          t.rotation.z = (i - 1) * 0.17;
          const vein = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.07, 0.005), vital);
          vein.position.set(x, 0.09, 0.03);
          vein.rotation.x = -0.5;
          vein.userData.pulse = { min: 0.2, max: 1.4, freq: 1.1, phase: -i * 0.8 };
          group.add(vein);
          // Barbs, so that what went in has to tear its way back out.
          if (this.wantsTrim()) {
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, this.seg(5, 4)), bone);
            barb.position.set(x, 0.1, 0.048);
            barb.rotation.x = -2.2;
            group.add(barb);
          }
        }
        // The reservoir, and the motes going into it.
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.015, this.seg(11, 7), this.seg(8, 5)), vital);
        heart.position.set(0, -0.03, 0.028);
        heart.userData.pulse = { min: 0.5, max: 1.6, freq: 1.3 };
        group.add(heart);
        const cage = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, this.seg(4, 3), this.seg(12, 7)), dark);
        cage.rotation.x = Math.PI / 2;
        cage.position.set(0, -0.03, 0.026);
        group.add(cage);
        const motes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < motes; i++) {
          const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), vital);
          mote.position.set(0, 0.01, 0.03);
          mote.userData.orbit = { radius: 0.03, speed: 1.2 + i * 0.25, phase: i * 1.7, plane: 'xy' };
          mote.userData.pulse = { min: 0.3, max: 1.5, freq: 2.0, phase: i };
          group.add(mote);
        }
        return group;
      },

      // ---- 555: Neural Claws --------------------------------------------------
      createNeuralClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xC8CDD2, { roughness: 0.28, metalness: 0.6 });
        const titanium = this._mat(0xA0A8B0, { roughness: 0.18, metalness: 0.95 });
        const dark = this._mat(0x1A1C22, { roughness: 0.5, metalness: 0.75 });
        const led = this._glow(0x4FE3FF, 1.2);
        // Not worn at all: the blades live inside the hand and come out
        // through ports between the knuckles when the nerve says so. Straight,
        // because a retracting blade cannot be curved.
        this._clawHand(group, shell, { width: 0.086, ridgeMat: dark, strapMat: dark, straps: 2, cuff: 0.048, cuffMat: dark });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const blade = this._plate([
            [-0.006, 0], [0.006, 0], [0.004, 0.09], [0, 0.106], [-0.004, 0.09]
          ], 0.004, titanium);
          blade.position.set(x, 0.05, 0.02);
          blade.rotation.x = -0.18;
          group.add(blade);
          // The port it came out of, and the actuator behind it.
          const port = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.018), dark);
          port.position.set(x, 0.05, 0.02);
          group.add(port);
          const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.04, this.seg(8, 5)), titanium);
          ram.position.set(x, 0.016, 0.018);
          group.add(ram);
        }
        // Loom down the back of the hand and the status light on the cuff.
        const loom = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, this.seg(7, 5)), dark);
        loom.position.set(0.03, 0.006, 0.022);
        loom.rotation.z = 0.25;
        group.add(loom);
        const status = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), led);
        status.position.set(0, -0.04, 0.026);
        status.userData.pulse = { min: 0.15, max: 1.4, freq: 2.2 };
        group.add(status);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.014), led);
        spine.position.set(0, 0.03, 0.024);
        spine.userData.pulse = { min: 0.1, max: 0.8, freq: 1.1 };
        group.add(spine);
        return group;
      },

      // ---- 556: Frost Dragon Claws --------------------------------------------
      createFrostDragonClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const tooth = this._mat(0xDCE8EE, { roughness: 0.45, metalness: 0.15 });
        const rime = this._glow(0x8FD8FF, 0.9);
        const hide = this._mat(0x2E4A5E, { roughness: 0.85, metalness: 0.1 });
        const ice = this._mat(0xBFE6F5, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 });
        // These are teeth, not claws, which is why they are pale and ribbed
        // and far too straight. The cold coming off them is the dragon's, and
        // it has outlasted the dragon.
        this._clawHand(group, hide, { width: 0.08, ridgeMat: tooth, strapMat: hide, cuff: 0.05 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const t = this._talon(group, tooth, {
            length: 0.098, sweep: 0.04, curl: 0.5, r0: 0.0095, r1: 0.0018,
            flat: 0.7, position: [x, 0.056, 0.014]
          });
          t.rotation.z = (i - 1) * 0.2;
          // Growth rings, as every tooth has.
          if (this.wantsTrim()) {
            for (let j = 0; j < 3; j++) {
              const ring = new THREE.Mesh(new THREE.TorusGeometry(0.007 - j * 0.0015, 0.0015, this.seg(4, 3), this.seg(9, 6)), tooth);
              ring.position.set(x, 0.07 + j * 0.018, 0.018 + j * 0.008);
              ring.rotation.x = Math.PI / 2 - 0.3;
              group.add(ring);
            }
          }
        }
        // Rime that keeps re-forming on the bracer, and the shards it sheds.
        const frost = new THREE.Mesh(new THREE.OctahedronGeometry(0.016, 0), ice);
        frost.position.set(0, 0.016, 0.028);
        frost.scale.set(1.4, 1, 0.5);
        group.add(frost);
        const breath = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < breath; i++) {
          const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), rime);
          shard.position.set(0, 0.04, 0.02);
          shard.userData.orbit = { radius: 0.045 + i * 0.008, speed: 0.6 + i * 0.2, phase: i * 1.6, plane: 'xy' };
          shard.userData.pulse = { min: 0.2, max: 1.1, freq: 1.0, phase: i * 0.8 };
          group.add(shard);
        }
        const chill = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(14, 8)), rime);
        chill.rotation.x = Math.PI / 2;
        chill.position.y = -0.052;
        chill.scale.z = 0.7;
        chill.userData.pulse = { min: 0.2, max: 0.9, freq: 0.7 };
        group.add(chill);
        return group;
      },

      // ---- 557: Dragon Claw ---------------------------------------------------
      createDragonClawModel(weapon, rand) {
        const group = new THREE.Group();
        const scaleColor = this.getRandomColor(rand, [0x8B1A1A, 0x1E5B3A, 0x3A2A5E, 0x6B4A1A]);
        const scale = this._mat(scaleColor, { roughness: 0.55, metalness: 0.35 });
        const keratin = this._mat(0x2A2118, { roughness: 0.4, metalness: 0.25 });
        const gold = this._cast(0xB9902A);
        // A dragon's own foot, cut off at the ankle and worn: the hide is
        // still on it, the talons are keratin rather than metal, and there is
        // a dewclaw on the inside that nobody thought to remove.
        this._clawHand(group, scale, { width: 0.086, ridgeMat: scale, strapMat: gold, cuff: 0.058 });
        for (let i = 0; i < 3; i++) {
          const x = -0.028 + i * 0.028;
          const t = this._talon(group, keratin, {
            length: 0.104, sweep: 0.075, curl: 0.22, r0: 0.012, r1: 0.0022,
            flat: 0.65, position: [x, 0.054, 0.012]
          });
          t.rotation.z = (i - 1) * 0.22;
          // The scaled toe the talon grows out of.
          const toe = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), scale);
          toe.scale.set(1, 0.9, 1.3);
          toe.position.set(x, 0.05, 0.02);
          group.add(toe);
        }
        const dewclaw = this._talon(group, keratin, {
          length: 0.05, sweep: 0.03, curl: 0.25, r0: 0.008, r1: 0.0018,
          position: [0.042, 0.01, 0.01]
        });
        dewclaw.rotation.set(0, 0, 1.1);
        // Overlapping scales up the back of the hand.
        const rows = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < rows; i++) {
          for (let j = 0; j < 3; j++) {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(6, 4), this.seg(4, 3)), scale);
            s.scale.set(1.2, 1, 0.4);
            s.position.set(-0.022 + j * 0.022 + (i % 2) * 0.011, 0.032 - i * 0.018, 0.02);
            group.add(s);
          }
        }
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, this.seg(4, 3), this.seg(14, 8)), gold);
        band.rotation.x = Math.PI / 2;
        band.position.y = -0.05;
        band.scale.z = 0.7;
        group.add(band);
        return group;
      },

      // ---- 558: Mind Ripper Claws ---------------------------------------------
      createMindRipperClawsModel(weapon, rand) {
        const group = new THREE.Group();
        const psiColor = this.getRandomColor(rand, [0xB86BFF, 0xFF6BD9, 0x6BD9FF]);
        const crystal = this._mat(psiColor, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.75, emissive: psiColor, emissiveIntensity: 0.5 });
        const psi = this._glow(psiColor, 1.3);
        const setting = this._mat(0x2A2438, { roughness: 0.4, metalness: 0.7 });
        // Grown, not forged: each claw is one crystal that cleaved into a
        // point, and the facets carry on past the edge into whatever is
        // between a mind and the armour over it.
        this._clawHand(group, setting, { width: 0.078, ridgeMat: setting, strapMat: setting, cuff: 0.046 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          // A stack of octahedra reads as cleavage planes where a smooth
          // blade would read as steel.
          // Each facet is stepped by its own height plus the next one's, so
          // the stack stays a single blade as the crystals get smaller: a
          // fixed step left the last facets floating past the point.
          let fy = 0.058;
          let fz = 0.018;
          for (let j = 0; j < 4; j++) {
            const r = 0.011 - j * 0.002;
            const f = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), crystal);
            f.position.set(x, fy, fz);
            f.rotation.set(0.4 + j * 0.1, 0, (i - 1) * 0.15);
            f.scale.set(0.55, 1.5, 0.9);
            group.add(f);
            const step = (r + (0.011 - (j + 1) * 0.002)) * 1.5 * 0.85;
            fy += step * 0.843;
            fz += step * 0.536;
          }
          const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.012, this.seg(8, 5)), setting);
          seat.position.set(x, 0.05, 0.016);
          group.add(seat);
        }
        // Fragments that broke off and did not fall.
        const shards = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < shards; i++) {
          const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), psi);
          sh.position.set(0, 0.06, 0.02);
          sh.userData.orbit = { radius: 0.05 + (i % 2) * 0.014, speed: 0.8 + i * 0.3, phase: i * 1.3, plane: i % 2 ? 'xy' : 'xz' };
          sh.userData.pulse = { min: 0.3, max: 1.5, freq: 1.7, phase: i * 0.9 };
          group.add(sh);
        }
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0025, this.seg(4, 3), this.seg(16, 9)), psi);
        halo.position.set(0, 0.02, 0.024);
        halo.rotation.x = 0.5;
        halo.userData.spin = { axis: 'y', speed: 0.7 };
        halo.userData.pulse = { min: 0.2, max: 1.2, freq: 1.2 };
        group.add(halo);
        return group;
      },

      // ---- 559: Crane Talons --------------------------------------------------
      createCraneTalonsModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xD8CFB4, { roughness: 0.75, metalness: 0.05 });
        const stone = this._mat(0xB0A48C, { roughness: 0.95, metalness: 0.02 });
        const ochre = this._mat(0xA8542A, { roughness: 0.9, metalness: 0.03 });
        const cord = this._mat(0x6B5A3A, { roughness: 0.98, metalness: 0.0 });
        // Older than metal: crane legbone lashed to a limestone cuff cut with
        // the same pillar figures as the enclosure it came out of, and the
        // ochre still in the grooves. The feathers were replaced many times.
        this._clawHand(group, stone, { width: 0.08, ridgeMat: stone, strapMat: cord, cuff: 0.06 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const t = this._talon(group, bone, {
            length: 0.096, sweep: 0.07, curl: 0.24, r0: 0.008, r1: 0.0018,
            position: [x, 0.056, 0.014]
          });
          t.rotation.z = (i - 1) * 0.2;
          const lash = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, this.seg(4, 3), this.seg(10, 6)), cord);
          lash.position.set(x, 0.058, 0.018);
          lash.rotation.x = Math.PI / 2 - 0.3;
          group.add(lash);
        }
        // The carved band: pillar figures, cut shallow and filled with ochre.
        const carvings = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < carvings; i++) {
          const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.003), ochre);
          glyph.position.set(-0.028 + i * 0.014, 0.014, 0.02);
          group.add(glyph);
        }
        const groove = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.004), ochre);
        groove.position.set(0, -0.006, 0.02);
        group.add(groove);
        // Feathers off the cuff, which is the part of the rite that moves.
        const plumes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < plumes; i++) {
          const quill = this._plate([[0, 0], [0.006, 0.01], [0.004, 0.06], [-0.004, 0.058], [-0.006, 0.012]], 0.002, bone);
          quill.position.set(-0.02 + i * 0.013, -0.07, -0.018);
          quill.rotation.set(0.5, i * 0.4, (i - 1.5) * 0.24);
          quill.userData.sway = { axis: 'z', amp: 0.16, freq: 0.8 + i * 0.12, phase: i * 1.1 };
          group.add(quill);
        }
        return group;
      },

      // ---- 560: EHI Psychoactive Talons ---------------------------------------
      createPsychoactiveTalonsModel(weapon, rand) {
        const group = new THREE.Group();
        const casing = this._mat(0xE8E4DC, { roughness: 0.4, metalness: 0.3 });
        const alloy = this._mat(0xA8AEB4, { roughness: 0.2, metalness: 0.94 });
        const oilColor = this.getRandomColor(rand, [0xC77DFF, 0x7DFFD3, 0xFFB86B]);
        const oil = this._glow(oilColor, 1.2);
        const ghost = this._mat(oilColor, { roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.28, emissive: oilColor, emissiveIntensity: 0.5 });
        const hazard = this._mat(0xE0A800, { roughness: 0.6, metalness: 0.25 });
        // Sold with a label and a dosage: the reservoirs down the back of the
        // hand feed the blades, and the blades are always a little ahead of
        // where the hand actually is. That is the side effect, and it is
        // printed on the label.
        this._clawHand(group, casing, { width: 0.082, ridgeMat: alloy, strapMat: casing, cuff: 0.05 });
        for (let i = 0; i < 3; i++) {
          const x = -0.026 + i * 0.026;
          const t = this._talon(group, alloy, {
            length: 0.09, sweep: 0.056, curl: 0.3, r0: 0.007, r1: 0.0016,
            position: [x, 0.056, 0.014]
          });
          t.rotation.z = (i - 1) * 0.16;
          // The after-image of the same blade, one beat behind it.
          const after = this._talon(group, ghost, {
            length: 0.09, sweep: 0.056, curl: 0.3, r0: 0.007, r1: 0.0016,
            segments: 4, sides: 4, position: [x, 0.056, 0.014]
          });
          after.rotation.z = (i - 1) * 0.16;
          after.userData.sway = { axis: 'z', amp: 0.16, freq: 1.1, phase: i * 0.7 };
          const phial = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, this.seg(8, 5)), oil);
          phial.position.set(x, 0.016, 0.024);
          phial.userData.pulse = { min: 0.25, max: 1.4, freq: 1.3 + i * 0.2, phase: i };
          group.add(phial);
        }
        const manifold = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.01, 0.014), alloy);
        manifold.position.set(0, 0.036, 0.024);
        group.add(manifold);
        const label = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.018), hazard);
        label.position.set(0, -0.038, 0.024);
        group.add(label);
        const dosage = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.002), hazard);
        dosage.position.set(0.03, -0.02, 0.014);
        dosage.rotation.y = 0.7;
        group.add(dosage);
        return group;
      },

      // ---- 561: Divine Talons -------------------------------------------------
      createDivineTalonsModel(weapon, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xE8C34A, { roughness: 0.18, metalness: 0.96 });
        const deepGold = this._cast(0xA87A18);
        const light = this._glow(0xFFF0B8, 1.4);
        const ivory = this._mat(0xF4EEDC, { roughness: 0.5, metalness: 0.1 });
        // A war god's own pair, and made to be looked at as much as used:
        // fluted talons, a winged bracer and a halo standing off the back of
        // the hand that no smith put there.
        this._clawHand(group, gold, { width: 0.086, ridgeMat: deepGold, strapMat: ivory, cuff: 0.06, cuffMat: deepGold });
        for (let i = 0; i < 3; i++) {
          const x = -0.028 + i * 0.028;
          const t = this._talon(group, gold, {
            length: 0.112, sweep: 0.062, curl: 0.32, r0: 0.009, r1: 0.0016,
            segments: 6, position: [x, 0.056, 0.014], tipMat: light
          });
          t.rotation.z = (i - 1) * 0.18;
          const fluting = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.06, 0.006), deepGold);
          fluting.position.set(x, 0.09, 0.03);
          fluting.rotation.x = -0.45;
          group.add(fluting);
        }
        // Wings off the bracer, which is where a war god signs their work.
        for (const s of [-1, 1]) {
          const wing = this._plate([
            [0, 0], [0.03, 0.014], [0.046, 0.006], [0.038, 0.03], [0.014, 0.034]
          ], 0.003, ivory);
          wing.position.set(s * 0.036, 0.006, -0.014);
          wing.rotation.set(0, s > 0 ? 0 : Math.PI, s * 0.3);
          wing.userData.sway = { axis: 'x', amp: 0.1, freq: 0.6, phase: s > 0 ? 0 : 1.6 };
          group.add(wing);
        }
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.003, this.seg(5, 4), this.seg(18, 10)), light);
        halo.position.set(0, 0.03, -0.026);
        halo.userData.spin = { axis: 'z', speed: 0.4 };
        halo.userData.pulse = { min: 0.5, max: 1.6, freq: 0.9 };
        group.add(halo);
        const sun = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0), light);
        sun.position.set(0, 0.02, 0.03);
        sun.userData.spin = { axis: 'y', speed: 0.8 };
        sun.userData.pulse = { min: 0.6, max: 1.7, freq: 1.2 };
        group.add(sun);
        const rays = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < rays; i++) {
          const ray = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.016, this.seg(4, 3)), gold);
          const a = (i / rays) * Math.PI * 2;
          ray.position.set(Math.cos(a) * 0.03, 0.03 + Math.sin(a) * 0.03, -0.026);
          ray.rotation.z = a - Math.PI / 2;
          group.add(ray);
        }
        return group;
      },

      // Type 10: Claw
      createClawModel(weapon, rand) {
        const group = new THREE.Group();
        const bladeColor = this.getRandomColor(rand, this.bladeColors);
        const plateColor = this.getRandomColor(rand, this.guardColors);
        const gemColor = this.getRandomColor(rand, this.crystalColors);

        const metalMat = new THREE.MeshStandardMaterial({ color: bladeColor, roughness: 0.25, metalness: 0.85 });
        const plateMat = new THREE.MeshStandardMaterial({ color: plateColor, roughness: 0.35, metalness: 0.8 });
        const gemMat = new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.1, emissive: gemColor, emissiveIntensity: 0.6 });

        // Armored gauntlet wrist plate base
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), plateMat);
        base.position.y = -0.02;
        group.add(base);

        // Ornate gold trim / knuckles
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.01, 0.02), plateMat);
        trim.position.set(0, 0, 0.03);
        group.add(trim);

        // Three long, curved crescent-shaped wolverine claws
        for (let i = -1; i <= 1; i++) {
          const xOffset = i * 0.04;
          
          const clawCurve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(xOffset, 0, 0.03),
            new THREE.Vector3(xOffset, 0.06, 0.10),
            new THREE.Vector3(xOffset, 0.15, 0.22)
          );
          
          const claw = new THREE.Mesh(new THREE.TubeGeometry(clawCurve, 8, 0.009, 4, false), metalMat);
          claw.scale.x = 0.4; // flatten sideways
          group.add(claw);

          // Embedded glowing gems on the knuckles
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), gemMat);
          gem.position.set(xOffset, 0.01, 0.03);
          group.add(gem);
        }

        return group;
      }
    }
  });
})();
