//=============================================================================
// Weapon 3D Models - Whips
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Procedural 3D models for whips. Loaded
 * automatically by WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - Whips
 * ============================================================================
 *
 * One family per weapon type. This one owns every Whip weapon (wtypeId 5):
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
    console.error('[Weapon3D_Whips] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Whips',
    unique: {
      238: 'createFlySwatterModel',                  // Fly Swatter
      239: 'createCrackedWhipModel',                 // Cracked Whip
      240: 'createHeavyBuckleBeltModel',             // Heavy Buckle Belt
      241: 'createCombatFishingRodModel',            // Combat Fishing Rod
      242: 'createCordWhipModel',                    // Cord Whip
      243: 'createSeedWhipModel',                    // Seed Whip
      244: 'createRetiariusNetModel',                // Retiarius Net
      245: 'createBullwhipModel',                    // Bullwhip
      246: 'createGladiatorNetModel',                // Gladiator Net
      247: 'createFlyingRingChainModel',             // Flying Ring Chain
      248: 'createRopeAndHookModel',                 // Rope and Hook
      249: 'createSteelCableWhipModel',              // Steel Cable Whip
      250: 'createUrumiWhipModel',                   // Urumi
      251: 'createFrostWhipModel',                   // Frost Whip
      252: 'createThornwhipModel',                   // Thornwhip
      253: 'createEnergyLashModel',                  // Energy Lash
      254: 'createBansheesWailModel',                // Banshee's Wail
      255: 'createChampionsBeltModel',               // Champion's Belt
      256: 'createMindlashWhipModel',                // Mindlash Whip
      257: 'createPhoenixIntestinesModel',           // Phoenix Intestines
      258: 'createTemporalEchoWhipModel',            // Temporal Echo Whip
      259: 'createLiquidStoneWhipModel',             // Liquid Stone Whip
      260: 'createVarleniaChainWhipModel',           // Varlenia Chain Whip
      261: 'createOmniscientBinderModel'             // EHI Omniscient Binder
    },
    models: {
      /**
       * The lash itself: a Verlet rope hung off the top of a grip and drawn as
       * tapering segments, thick where it leaves the hand and thin at the
       * cracker. Every whip here that actually hangs is this call plus whatever
       * is tied to the end of it, so the rope wiring lives in one place rather
       * than in each builder.
       *
       * Three things make it a lash rather than a string of cylinders:
       *
       *  - the taper follows the profile of a real plaited whip, full through
       *    the first third of its length and falling away to almost nothing at
       *    the end, instead of thinning evenly from hand to tip;
       *  - the segments overrun each other and a bead of the lash's own
       *    thickness sits on every join, so a bend cannot open a wedge of
       *    daylight between one segment and the next, which is the one thing
       *    that gives a jointed rope away;
       *  - each segment is rolled a little further round than the one below it,
       *    so the flats of the low-poly cross-section wind up the length as the
       *    turns of a plait.
       *
       * @param opts { segments, length, x, y, z, baseR, tipR, mat, sides, flat,
       *   joints, jointMat, gravity, damping, stiffness, endMass, bend, drag,
       *   tipMass, taper }
       * @returns the rope: `headMeshGroup` is the tip mount, already out at the
       *   end of the lash and turned to follow it, and `segmentMeshes` are the
       *   segments to decorate.
       */
      _lashRig(group, opts) {
        const o = opts || {};
        const n = this.seg(o.segments || 14, 8);
        const length = o.length === undefined ? 0.5 : o.length;
        const segLen = length / n;
        const anchor = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0);
        const rope = this.createVerletRope(n + 1, segLen, anchor, {
          gravity: o.gravity === undefined ? -0.0006 : o.gravity,
          damping: o.damping === undefined ? 0.965 : o.damping,
          iterations: this.isLowDetail() ? 6 : 10,
          stiffness: o.stiffness === undefined ? 1.0 : o.stiffness,
          endMass: o.endMass === undefined ? 0.6 : o.endMass,
          // The tail carries a fraction of what the thong does, so a pull at
          // the hand arrives at the cracker as a much larger movement.
          tipMass: o.tipMass === undefined ? 0.06 : o.tipMass,
          // Body near the hand, nothing at all by the fall.
          bend: o.bend === undefined ? 0.12 : o.bend,
          // Leather through air: this is what has it stream out rather than
          // swing, and what settles it when the hand stops.
          drag: o.drag === undefined ? 0.35 : o.drag,
          tipDamping: o.tipDamping === undefined ? 0.998 : o.tipDamping,
          alternate: true
        });
        rope.aimHead = true;
        const baseR = o.baseR === undefined ? 0.011 : o.baseR;
        const tipR = o.tipR === undefined ? 0.004 : o.tipR;
        const taper = o.taper === undefined ? 1.3 : o.taper;
        rope.taper = taper;
        const radius = (t) => this._lashProfile(baseR, tipR, t, taper);
        const sides = this.seg(o.sides || 6, 4);
        // Not on a strap or a ribbon: there the overrun alone closes the bend,
        // and a bead reads as a stud hammered into the flat of a blade.
        const beads = o.joints !== false && !o.flat && !this.isLowDetail();
        for (let i = 0; i < n; i++) {
          const r = radius(i / n);
          const rNext = radius((i + 1) / n);
          const seg = new THREE.Mesh(
            // A quarter longer than the span it covers: consecutive segments
            // overrun each other, so however sharply the rope turns the two
            // still meet.
            new THREE.CylinderGeometry(rNext, r, segLen * 1.28, sides), o.mat);
          seg.position.set(anchor.x, anchor.y + i * segLen + segLen / 2, anchor.z);
          // A strap is the same rope squashed flat: the solver rewrites the
          // position and the rotation of a segment every frame, but never its
          // scale, so the cross section survives.
          if (o.flat) seg.scale.z = o.flat;
          // The turn of the plait, re-applied after the solver has aimed the
          // segment, in updateRopeMeshes. A flat lash is a ribbon of steel or a
          // strap of leather and does not plait: rolled, it reads as a blade
          // shattered into pieces rather than one bending.
          seg.userData._roll = o.flat ? 0 : i * 0.55;
          // The span this segment was cut for, so the solver can stretch it to
          // the span it ends up covering.
          seg.userData._stretch = segLen;
          group.add(seg);
          rope.segmentMeshes.push(seg);
          if (beads && i > 0) {
            const bead = new THREE.Mesh(
              // Just proud of the flats of the cylinder, never a bulge: the bead is
              // there to fill the wedge a bend opens at the axis, not to be seen.
              new THREE.SphereGeometry(r * 0.9, this.seg(6, 4), this.seg(4, 3)),
              o.jointMat || o.mat);
            if (o.flat) bead.scale.z = o.flat;
            bead.position.set(anchor.x, anchor.y + i * segLen, anchor.z);
            group.add(bead);
            rope.jointMeshes[i] = bead;
          }
        }
        const tip = new THREE.Group();
        tip.position.set(anchor.x, anchor.y + length, anchor.z);
        group.add(tip);
        rope.headMeshGroup = tip;
        if (!group.userData._verletRopes) group.userData._verletRopes = [];
        group.userData._verletRopes.push(rope);
        return rope;
      },

      /**
       * The profile of a plaited whip: the thong keeps nearly its full
       * thickness for the first third of the length and then falls away to the
       * fall and the cracker. A straight taper from hand to tip reads as a
       * cone, which is the one thing a whip does not look like.
       */
      _lashProfile(baseR, tipR, t, taper) {
        const k = Math.pow(Math.max(0, 1 - t * t), taper === undefined ? 1.3 : taper);
        return tipR + (baseR - tipR) * k;
      },

      /** Radius of a lash built with these ends at segment `i` of `n`. */
      _lashRadius(baseR, tipR, i, n) {
        return this._lashProfile(baseR, tipR, n ? i / n : 0);
      },

      // ---- 238: Fly Swatter ---------------------------------------------------
      createFlySwatterModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0xE8342B, 0x2E6BD6, 0x36B84A, 0xF2A31B]),
          { roughness: 0.65, metalness: 0.05 });
        const dark = this._mat(0x24242A, { roughness: 0.8, metalness: 0.12 });
        const grime = this._wood(0x4A3A22);
        // Moulded in one piece out of about eight grams of polypropylene: a
        // springy stem, a perforated paddle and a hanging hole nobody uses.
        this._hilt(group, rand, { height: 0.3, rTop: 0.008, rBot: 0.0075, mat: shell, sides: this.seg(8, 5) });
        const hang = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, this.seg(4, 3), this.seg(10, 6)), shell);
        hang.position.y = -0.312;
        group.add(hang);
        // The stem took a bend in its first week and kept it, so the paddle
        // arrives a moment after the hand does.
        const paddle = new THREE.Group();
        paddle.position.y = 0.01;
        paddle.rotation.z = -0.07;
        paddle.userData.sway = { axis: 'z', amp: 0.09, freq: 2.8 };
        group.add(paddle);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.06, this.seg(7, 5)), shell);
        stem.position.y = -0.005;
        paddle.add(stem);
        const pw = 0.13, ph = 0.115, cy = 0.095;
        for (const s of [-1, 1]) {
          const side = new THREE.Mesh(new THREE.BoxGeometry(0.008, ph, 0.006), shell);
          side.position.set(s * pw / 2, cy, 0);
          paddle.add(side);
          const end = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.008, 0.006), shell);
          end.position.set(0, cy + s * ph / 2, 0);
          paddle.add(end);
        }
        const bars = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < bars; i++) {
          const t = (i + 0.5) / bars - 0.5;
          const across = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.01, 0.004, 0.004), shell);
          across.position.set(0, cy + t * ph, 0);
          paddle.add(across);
          const down = new THREE.Mesh(new THREE.BoxGeometry(0.004, ph - 0.01, 0.004), shell);
          down.position.set(t * pw, cy, 0);
          paddle.add(down);
        }
        // What it was last used on, which is still on it.
        if (this.wantsTrim()) {
          const fly = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), grime);
          fly.scale.set(1.6, 1.0, 0.5);
          fly.position.set(0.02, cy + 0.02, 0.006);
          paddle.add(fly);
          for (const s of [-1, 1]) {
            const wing = this._plate([[0, 0], [0.014, 0.004], [0.012, 0.012], [0, 0.006]], 0.001, dark);
            wing.position.set(0.02, cy + 0.022, 0.008);
            wing.rotation.z = s * 0.7;
            paddle.add(wing);
          }
        }
        return group;
      },

      // ---- 239: Cracked Whip --------------------------------------------------
      createCrackedWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._wood(this.getRandomColor(rand, [0x5C4033, 0x4A3226, 0x6B4A30]));
        const dry = this._wood(0x8A7355);
        const brass = this._mat(0xB8912E, { roughness: 0.5, metalness: 0.75 });
        // Left hanging in a barn for a decade: the leather has gone grey where
        // it used to be oiled and the plait has opened along most of its length.
        this._hilt(group, rand, { height: 0.15, rTop: 0.016, rBot: 0.019, mat: hide, wrapMat: dry, pommelMat: brass, pommel: 'nut' });
        const lash = this._lashRig(group, { segments: 14, length: 0.46, mat: hide, baseR: 0.011, tipR: 0.0035 });
        const segs = lash.segmentMeshes;
        // Every third plait has split and stands out from the thong.
        for (let i = 2; i < segs.length; i += 3) {
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0026, 0.034, this.seg(5, 3)), dry);
          strand.position.set(0.007, -0.004, 0);
          strand.rotation.z = -1.0 - rand() * 0.5;
          strand.userData.sway = { axis: 'z', amp: 0.22, freq: 1.5 + i * 0.08, phase: i };
          segs[i].add(strand);
        }
        const heel = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.005, this.seg(4, 3), this.seg(9, 6)), dry);
        heel.rotation.x = Math.PI / 2;
        heel.position.y = 0.008;
        group.add(heel);
        // The fall, and a popper that has been retied more often than it has
        // been replaced.
        const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0034, 0.06, this.seg(5, 4)), dry);
        fall.position.y = 0.03;
        lash.headMeshGroup.add(fall);
        const popper = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.03, this.seg(5, 4)), hide);
        popper.position.y = 0.075;
        lash.headMeshGroup.add(popper);
        return group;
      },

      // ---- 240: Heavy Buckle Belt ---------------------------------------------
      createHeavyBuckleBeltModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._wood(this.getRandomColor(rand, [0x3A2118, 0x1E1A18, 0x5A3A22]));
        const steel = this._mat(0x9AA0A6, { roughness: 0.45, metalness: 0.8 });
        const brass = this._mat(0xC8A23A, { roughness: 0.4, metalness: 0.85 });
        // Held by the tail and swung by the buckle, which is a pound of cast
        // brass and the only part of it anyone was ever meant to look at.
        const fist = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.13, this.seg(10, 6)), hide);
        fist.position.y = -0.075;
        fist.scale.z = 0.55;
        group.add(fist);
        for (let i = 0; i < 3; i++) {
          const turn = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, this.seg(4, 3), this.seg(12, 7)), hide);
          turn.rotation.x = Math.PI / 2;
          turn.position.y = -0.125 + i * 0.042;
          group.add(turn);
        }
        const strap = this._lashRig(group, {
          segments: 12, length: 0.42, mat: hide, baseR: 0.018, tipR: 0.017,
          flat: 0.3, gravity: -0.0011, damping: 0.92, endMass: 3.2
        });
        const segs = strap.segmentMeshes;
        // The punched holes, and the keeper the tongue used to sit in.
        for (let i = 2; i < segs.length - 2; i += 2) {
          const punch = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, this.seg(7, 5)), steel);
          punch.rotation.x = Math.PI / 2;
          segs[i].add(punch);
        }
        const keeper = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.005, this.seg(4, 3), this.seg(10, 6)), hide);
        keeper.rotation.x = Math.PI / 2;
        segs[Math.min(5, segs.length - 1)].add(keeper);
        // The buckle: a cast frame, a roller, a prong and a tongue long enough
        // to have been sharpened at some point.
        const tip = strap.headMeshGroup;
        const fw = 0.075, fh = 0.062;
        for (const s of [-1, 1]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.011, fh, 0.013), brass);
          bar.position.set(s * fw / 2, 0.031, 0);
          tip.add(bar);
          const cross = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.011, 0.013), brass);
          cross.position.set(0, 0.031 + s * fh / 2, 0);
          tip.add(cross);
        }
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, fw * 0.88, this.seg(7, 5)), brass);
        prong.rotation.z = Math.PI / 2;
        prong.position.y = 0.031;
        tip.add(prong);
        const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.05, this.seg(6, 4)), brass);
        tongue.position.set(0, 0.058, 0.009);
        tongue.rotation.x = -0.25;
        tip.add(tongue);
        const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.01, this.seg(11, 7)), steel);
        boss.rotation.x = Math.PI / 2;
        boss.position.set(0, 0.031, 0.011);
        tip.add(boss);
        return group;
      },

      // ---- 241: Combat Fishing Rod --------------------------------------------
      createCombatFishingRodModel(weapon, rand) {
        const group = new THREE.Group();
        const blank = this._mat(0x1E2228, { roughness: 0.35, metalness: 0.35 });
        const cork = this._wood(0xC8A878);
        const red = this._mat(0xC02A22, { roughness: 0.4, metalness: 0.3 });
        const chrome = this._mat(0xC0C6CC, { roughness: 0.25, metalness: 0.9 });
        const line = this._mat(0xE8F0F4, { roughness: 0.3, metalness: 0.1, opacity: 0.65, transparent: true });
        // A carbon travel rod that was never meant to hit anything back: three
        // sections, a reel that still turns, and a treble on the end of it.
        this._hilt(group, rand, { height: 0.2, rTop: 0.019, rBot: 0.022, mat: cork, sides: this.seg(11, 7) });
        const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.05, this.seg(11, 7)), chrome);
        seat.position.y = -0.05;
        group.add(seat);
        const reel = new THREE.Group();
        reel.position.set(0, -0.055, -0.045);
        group.add(reel);
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, this.seg(13, 8)), red);
        spool.rotation.z = Math.PI / 2;
        reel.add(spool);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.02), chrome);
        foot.position.set(0, 0.028, 0.022);
        reel.add(foot);
        const crank = new THREE.Group();
        crank.position.set(0.024, 0, 0);
        crank.userData.spin = { axis: 'x', speed: 0.9 };
        reel.add(crank);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.042, 0.005), chrome);
        arm.position.y = 0.014;
        crank.add(arm);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(9, 6), this.seg(7, 5)), cork);
        knob.position.y = 0.034;
        crank.add(knob);
        // The sections, each with its ferrule and its ring, thinning all the
        // way to a tip you could not thread a bootlace through.
        let y = 0;
        const sections = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < sections; i++) {
          const len = 0.19 - i * 0.02;
          const rBot = 0.009 - i * 0.002, rTop = 0.0075 - i * 0.002;
          const sec = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, this.seg(8, 5)), blank);
          sec.position.y = y + len / 2;
          group.add(sec);
          const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(rBot + 0.002, rBot + 0.002, 0.012, this.seg(8, 5)), red);
          ferrule.position.y = y;
          group.add(ferrule);
          const guide = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, this.seg(4, 3), this.seg(9, 6)), chrome);
          guide.rotation.x = Math.PI / 2;
          guide.position.set(0, y + len * 0.7, -0.012);
          group.add(guide);
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.014, this.seg(5, 3)), chrome);
          leg.rotation.x = Math.PI / 2;
          leg.position.set(0, y + len * 0.7, -0.005);
          group.add(leg);
          y += len;
        }
        const monofil = this._lashRig(group, {
          y: y, segments: 8, length: 0.16, mat: line, baseR: 0.0016, tipR: 0.0012,
          sides: 4, gravity: -0.0004, damping: 0.96, endMass: 2.0
        });
        const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, this.seg(6, 4)), chrome);
        monofil.headMeshGroup.add(swivel);
        const lure = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), red);
        lure.scale.y = 1.9;
        lure.position.y = 0.024;
        monofil.headMeshGroup.add(lure);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const barb = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.022, this.seg(4, 3)), chrome);
          barb.position.set(Math.cos(a) * 0.009, 0.05, Math.sin(a) * 0.009);
          barb.rotation.z = -Math.cos(a) * 0.6;
          barb.rotation.x = Math.sin(a) * 0.6;
          monofil.headMeshGroup.add(barb);
        }
        return group;
      },

      // ---- 242: Cord Whip -----------------------------------------------------
      createCordWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const hemp = this._mat(this.getRandomColor(rand, [0xC8B48A, 0xB09A6A, 0xD8C8A0]),
          { roughness: 0.95, metalness: 0.02 });
        const dark = this._wood(0x7A6440);
        const wood = this._wood(0x6B4A2A);
        // Three strands laid up by hand and whipped at both ends: rope work
        // rather than leather work, and every knot on it says so.
        this._hilt(group, rand, { height: 0.14, rTop: 0.016, rBot: 0.018, mat: wood, wrapMat: hemp });
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, this.seg(4, 3), this.seg(11, 7)), hemp);
        loop.position.y = -0.155;
        group.add(loop);
        const lash = this._lashRig(group, { segments: 15, length: 0.5, mat: hemp, baseR: 0.009, tipR: 0.005, damping: 0.95 });
        const segs = lash.segmentMeshes;
        // The lay of the rope, one turn showing every other segment.
        if (this.wantsTrim()) {
          for (let i = 0; i < segs.length; i += 2) {
            const r = this._lashRadius(0.009, 0.005, i, segs.length);
            const twist = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, r * 0.3, this.seg(4, 3), this.seg(7, 5)), dark);
            twist.rotation.x = Math.PI / 2;
            twist.rotation.y = i * 0.9;
            segs[i].add(twist);
          }
        }
        for (let i = 4; i < segs.length; i += 5) {
          const service = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, this.seg(8, 5)), dark);
          segs[i].add(service);
        }
        // A monkey fist on the end, which is where the weight went.
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(10, 6), this.seg(8, 5)), hemp);
        lash.headMeshGroup.add(fist);
        for (let i = 0; i < 3; i++) {
          const turn = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, this.seg(4, 3), this.seg(11, 7)), dark);
          turn.rotation.set(i * 1.05, i * 0.7, 0);
          lash.headMeshGroup.add(turn);
        }
        return group;
      },

      // ---- 243: Seed Whip -----------------------------------------------------
      createSeedWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(0x5B4227);
        const vine = this._mat(this.getRandomColor(rand, [0x3A7A2A, 0x4E9A3A]), { roughness: 0.8, metalness: 0.03 });
        const leaf = this._mat(0x6BBF48, { roughness: 0.6, metalness: 0.05 });
        const husk = this._mat(0xC8A02A, { roughness: 0.55, metalness: 0.1 });
        const sap = this._glow(0xB8FF5A, 0.8);
        // Grown rather than made: the haft is a woody root, the lash is a
        // runner still putting out leaves, and next year's seed is on the end.
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.021, mat: bark, wrapMat: vine });
        const lash = this._lashRig(group, { segments: 13, length: 0.46, mat: vine, baseR: 0.01, tipR: 0.004 });
        const segs = lash.segmentMeshes;
        for (let i = 1; i < segs.length; i += 2) {
          const blade = this._plate([[0, 0], [0.018, 0.012], [0.028, 0.036], [0.004, 0.026]], 0.002, leaf);
          blade.position.set(0.006, 0, 0);
          blade.rotation.set(0, i * 1.2, 0.5);
          blade.userData.sway = { axis: 'z', amp: 0.14, freq: 1.1 + i * 0.1, phase: i };
          segs[i].add(blade);
        }
        const pod = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(7, 5)), husk);
        pod.scale.y = 1.6;
        pod.position.y = 0.024;
        lash.headMeshGroup.add(pod);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(8, 5), this.seg(6, 4)), sap);
        core.position.y = 0.024;
        core.userData.pulse = { min: 0.3, max: 1.1, freq: 0.9 };
        lash.headMeshGroup.add(core);
        const shoot = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.05, this.seg(6, 4)), leaf);
        shoot.position.set(0.014, 0.01, 0);
        shoot.rotation.z = -0.9;
        shoot.userData.sway = { axis: 'z', amp: 0.15, freq: 1.3 };
        group.add(shoot);
        return group;
      },

      // ---- 244: Retiarius Net -------------------------------------------------
      createRetiariusNetModel(weapon, rand) {
        const group = new THREE.Group();
        const cord = this._mat(0xC0AE84, { roughness: 0.95, metalness: 0.02 });
        const lead = this._mat(0x6A6A70, { roughness: 0.6, metalness: 0.55 });
        const wood = this._wood(0x6B4A2A);
        // A fisherman's cast net with the trade beaten out of it: gathered at
        // the hand, the mouth hanging open, sinkers all the way round the hem.
        this._hilt(group, rand, { height: 0.13, rTop: 0.018, rBot: 0.022, mat: wood, wrapMat: cord });
        const net = new THREE.Group();
        net.userData.sway = { axis: 'z', amp: 0.06, freq: 1.2 };
        group.add(net);
        const ribs = this.isLowDetail() ? 5 : 8;
        const height = 0.46, mouth = 0.17;
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < ribs; i++) {
          const a = (i / ribs) * Math.PI * 2;
          const steps = this.isLowDetail() ? 2 : 3;
          for (let s = 0; s < steps; s++) {
            const t = s / steps, t2 = (s + 1) / steps;
            const p1 = new THREE.Vector3(Math.cos(a) * mouth * t * t, height * t, Math.sin(a) * mouth * t * t);
            const p2 = new THREE.Vector3(Math.cos(a) * mouth * t2 * t2, height * t2, Math.sin(a) * mouth * t2 * t2);
            const d = p2.clone().sub(p1);
            const strand = new THREE.Mesh(
              new THREE.CylinderGeometry(0.0022, 0.0022, d.length() * 1.06, this.seg(5, 3)), cord);
            strand.position.copy(p1).add(p2).multiplyScalar(0.5);
            strand.quaternion.setFromUnitVectors(up, d.clone().normalize());
            net.add(strand);
          }
          const sinker = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(7, 5), this.seg(5, 4)), lead);
          sinker.scale.y = 1.4;
          sinker.position.set(Math.cos(a) * mouth, height, Math.sin(a) * mouth);
          sinker.userData.bob = { amp: 0.012, freq: 1.3 + i * 0.2, phase: i };
          net.add(sinker);
        }
        // The courses of the mesh, tied wider the further they are from the hand.
        const rings = this.isLowDetail() ? 2 : 3;
        for (let i = 1; i <= rings; i++) {
          const t = i / (rings + 0.35);
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(Math.max(0.008, mouth * t * t), 0.002, this.seg(4, 3), this.seg(14, 8)), cord);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = height * t;
          net.add(ring);
        }
        // The hand line, coiled where it is gripped so it pays out first.
        for (let i = 0; i < 3; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(11, 7)), cord);
          coil.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.25;
          coil.position.y = -0.15 - i * 0.022;
          group.add(coil);
        }
        return group;
      },

      // ---- 245: Bullwhip ------------------------------------------------------
      createBullwhipModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._wood(this.getRandomColor(rand, [0x4A2F1E, 0x6B4526, 0x2E1D12]));
        const oiled = this._wood(0x33200F);
        const steel = this._mat(0x8A9096, { roughness: 0.5, metalness: 0.78 });
        // Twelve plait over a shot loaded belly. The whole taper is in the
        // thong, which is what makes it crack instead of merely hurting.
        this._hilt(group, rand, { height: 0.22, rTop: 0.016, rBot: 0.02, mat: hide, wrapMat: oiled, pommelMat: steel, pommel: 'disc' });
        const heel = new THREE.Mesh(new THREE.SphereGeometry(0.023, this.seg(10, 6), this.seg(8, 5)), oiled);
        heel.position.y = -0.222;
        group.add(heel);
        const transition = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.006, this.seg(4, 3), this.seg(11, 7)), oiled);
        transition.rotation.x = Math.PI / 2;
        transition.position.y = 0.006;
        group.add(transition);
        const lash = this._lashRig(group, {
          segments: 16, length: 0.62, mat: hide, baseR: 0.014, tipR: 0.0025,
          damping: 0.945, endMass: 0.5
        });
        const segs = lash.segmentMeshes;
        // The plait, tight at the hand and opening out toward the fall.
        if (this.wantsTrim()) {
          for (let i = 0; i < segs.length; i += 2) {
            const r = this._lashRadius(0.014, 0.0025, i, segs.length);
            const plait = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.24, this.seg(4, 3), this.seg(8, 5)), oiled);
            plait.rotation.x = Math.PI / 2;
            plait.rotation.z = 0.35 + i * 0.2;
            segs[i].add(plait);
          }
        }
        const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.003, 0.07, this.seg(5, 4)), oiled);
        fall.position.y = 0.035;
        lash.headMeshGroup.add(fall);
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(5, 4)), hide);
        knot.position.y = 0.07;
        lash.headMeshGroup.add(knot);
        const cracker = new THREE.Mesh(new THREE.ConeGeometry(0.0028, 0.05, this.seg(5, 3)), hide);
        cracker.position.y = 0.098;
        lash.headMeshGroup.add(cracker);
        return group;
      },

      // ---- 246: Gladiator Net -------------------------------------------------
      createGladiatorNetModel(weapon, rand) {
        const group = new THREE.Group();
        const cord = this._mat(0xB8A478, { roughness: 0.95, metalness: 0.02 });
        const iron = this._mat(0x6E7378, { roughness: 0.7, metalness: 0.6 });
        const lead = this._mat(0x5A5A62, { roughness: 0.6, metalness: 0.5 });
        const hide = this._wood(0x4A3226);
        // Arena issue, and thrown rather than swung: an iron mouth ring, a
        // hand line short enough to pull it back, and three weighted corners
        // that arrive a moment after the rest of it does.
        this._hilt(group, rand, { height: 0.12, rTop: 0.017, rBot: 0.02, mat: hide, wrapMat: cord });
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, this.seg(5, 4), this.seg(16, 9)), iron);
        mouth.rotation.x = Math.PI / 2;
        mouth.position.y = 0.1;
        group.add(mouth);
        const spokes = this.isLowDetail() ? 4 : 7;
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          const p1 = new THREE.Vector3(0, 0.005, 0);
          const p2 = new THREE.Vector3(Math.cos(a) * 0.075, 0.1, Math.sin(a) * 0.075);
          const d = p2.clone().sub(p1);
          const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, d.length(), this.seg(5, 3)), cord);
          throat.position.copy(p1).add(p2).multiplyScalar(0.5);
          throat.quaternion.setFromUnitVectors(up, d.clone().normalize());
          group.add(throat);
        }
        const corners = this.isLowDetail() ? 2 : 3;
        for (let c = 0; c < corners; c++) {
          const a = (c / corners) * Math.PI * 2;
          const line = this._lashRig(group, {
            x: Math.cos(a) * 0.072, y: 0.1, z: Math.sin(a) * 0.072,
            segments: 7, length: 0.3, mat: cord, baseR: 0.0028, tipR: 0.0024,
            sides: 4, gravity: -0.0009, endMass: 3.0
          });
          const weight = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(8, 5), this.seg(6, 4)), lead);
          weight.scale.y = 1.35;
          line.headMeshGroup.add(weight);
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, this.seg(4, 3), this.seg(9, 6)), iron);
          band.rotation.x = Math.PI / 2;
          line.headMeshGroup.add(band);
          // The mesh between the lines, which only exists where it is knotted.
          const segs = line.segmentMeshes;
          for (let i = 1; i < segs.length; i += 2) {
            const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.05, this.seg(4, 3)), cord);
            tie.position.set(0.024, 0, 0);
            tie.rotation.z = Math.PI / 2 - 0.5;
            tie.userData.sway = { axis: 'z', amp: 0.18, freq: 1.4 + i * 0.1, phase: i + c };
            segs[i].add(tie);
          }
        }
        return group;
      },

      // ---- 247: Flying Ring Chain ---------------------------------------------
      createFlyingRingChainModel(weapon, rand) {
        const group = new THREE.Group();
        const gold = this._mat(0xC9A227, { roughness: 0.35, metalness: 0.9 });
        const pale = this._mat(0xE8D98A, { roughness: 0.25, metalness: 0.95 });
        const silk = this._mat(0x8B1A1A, { roughness: 0.9, metalness: 0.05 });
        // A jeweller made this, not a smith: a fine link chain off a finger
        // ring, with a sharpened hoop swinging on the end of it.
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, this.seg(5, 4), this.seg(14, 8)), gold);
        loop.rotation.x = Math.PI / 2;
        loop.position.y = -0.115;
        group.add(loop);
        const baton = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.1, this.seg(11, 7)), gold);
        baton.position.y = -0.055;
        group.add(baton);
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0035, this.seg(4, 3), this.seg(11, 7)), pale);
          band.rotation.x = Math.PI / 2;
          band.position.y = -0.09 + i * 0.032;
          group.add(band);
        }
        const head = this.chainRig(group, {
          links: 9, length: 0.34, linkMat: gold, linkRadius: 0.011, linkTube: 0.0032, endMass: 3.0
        });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.007, this.seg(5, 4), this.seg(18, 10)), pale);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        head.add(ring);
        // The hoop is filed to an edge on the outside, in points rather than
        // all the way round, so it catches instead of cutting cleanly.
        const teeth = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.022, this.seg(4, 3)), pale);
          tooth.position.set(Math.cos(a) * 0.068, 0.06, Math.sin(a) * 0.068);
          tooth.rotation.z = -Math.cos(a) * Math.PI / 2;
          tooth.rotation.x = Math.sin(a) * Math.PI / 2;
          head.add(tooth);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.008, this.seg(11, 7)), gold);
        hub.position.y = 0.012;
        head.add(hub);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.05, this.seg(5, 3)), silk);
            tassel.position.set(-0.006 + i * 0.006, -0.02, 0);
            tassel.rotation.z = (i - 1) * 0.2;
            tassel.userData.sway = { axis: 'z', amp: 0.2, freq: 1.6 + i * 0.2, phase: i };
            head.add(tassel);
          }
        }
        return group;
      },

      // ---- 248: Rope and Hook -------------------------------------------------
      createRopeAndHookModel(weapon, rand) {
        const group = new THREE.Group();
        const hemp = this._mat(0xBCA476, { roughness: 0.95, metalness: 0.02 });
        const dark = this._wood(0x6E5A38);
        const iron = this._mat(0x6A6F75, { roughness: 0.65, metalness: 0.65 });
        // Ship's stores: a hank of three strand hemp with an eye splice, and a
        // four fluke grapnel that somebody has since put an edge on.
        for (let i = 0; i < 4; i++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, this.seg(4, 3), this.seg(12, 7)), hemp);
          coil.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.2;
          coil.position.y = -0.13 + i * 0.03;
          group.add(coil);
        }
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, this.seg(4, 3), this.seg(10, 6)), hemp);
        eye.position.y = -0.012;
        group.add(eye);
        const whipping = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, this.seg(9, 6)), dark);
        whipping.position.y = 0.016;
        group.add(whipping);
        const rope = this._lashRig(group, {
          segments: 12, length: 0.44, mat: hemp, baseR: 0.008, tipR: 0.008,
          gravity: -0.0009, damping: 0.93, endMass: 3.4
        });
        const segs = rope.segmentMeshes;
        for (let i = 3; i < segs.length; i += 4) {
          const service = new THREE.Mesh(new THREE.CylinderGeometry(0.0092, 0.0092, 0.014, this.seg(8, 5)), dark);
          segs[i].add(service);
        }
        const head = rope.headMeshGroup;
        const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.09, this.seg(9, 6)), iron);
        shank.position.y = 0.045;
        head.add(shank);
        const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, this.seg(4, 3), this.seg(10, 6)), iron);
        head.add(shackle);
        const arms = this.isLowDetail() ? 3 : 4;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.055, this.seg(7, 5)), iron);
          arm.position.set(Math.cos(a) * 0.02, 0.1, Math.sin(a) * 0.02);
          arm.rotation.z = -Math.cos(a) * 0.8;
          arm.rotation.x = Math.sin(a) * 0.8;
          head.add(arm);
          const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.032, this.seg(5, 4)), iron);
          fluke.position.set(Math.cos(a) * 0.042, 0.125, Math.sin(a) * 0.042);
          fluke.rotation.z = -Math.cos(a) * 1.3;
          fluke.rotation.x = Math.sin(a) * 1.3;
          head.add(fluke);
        }
        return group;
      },

      // ---- 249: Steel Cable Whip ----------------------------------------------
      createSteelCableWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const cable = this._mat(0x8A9096, { roughness: 0.45, metalness: 0.85 });
        const grease = this._mat(0x3A3E44, { roughness: 0.7, metalness: 0.5 });
        const rubber = this._mat(0x1E1E22, { roughness: 0.9, metalness: 0.05 });
        const bright = this._mat(0xB0B6BC, { roughness: 0.3, metalness: 0.92 });
        // Two kilos of wire rope off a winch drum, with the thimble still
        // swaged into one end. It does not crack. It goes through things.
        this._hilt(group, rand, { height: 0.16, rTop: 0.02, rBot: 0.023, mat: rubber, wrapMat: grease });
        const thimble = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.006, this.seg(5, 4), this.seg(12, 7)), bright);
        thimble.rotation.x = Math.PI / 2;
        thimble.position.y = 0.004;
        group.add(thimble);
        const swage = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.03, this.seg(9, 6)), bright);
        swage.position.y = 0.022;
        group.add(swage);
        const lash = this._lashRig(group, {
          segments: 13, length: 0.48, mat: cable, baseR: 0.012, tipR: 0.007, sides: 8,
          gravity: -0.0012, damping: 0.92, stiffness: 0.95, endMass: 2.4
        });
        const segs = lash.segmentMeshes;
        // The lay of the strands, and the broken wires standing out of it
        // wherever it has been overloaded.
        if (this.wantsTrim()) {
          for (let i = 0; i < segs.length; i++) {
            const r = this._lashRadius(0.012, 0.007, i, segs.length);
            const strand = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.28, this.seg(4, 3), this.seg(8, 5)), grease);
            strand.rotation.x = Math.PI / 2;
            strand.rotation.z = i * 0.5;
            segs[i].add(strand);
          }
        }
        for (let i = 3; i < segs.length; i += 4) {
          const broken = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0013, 0.026, this.seg(4, 3)), bright);
          broken.position.set(0.009, 0, 0);
          broken.rotation.z = -1.1;
          broken.userData.sway = { axis: 'z', amp: 0.12, freq: 2.2, phase: i };
          segs[i].add(broken);
        }
        const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.026, this.seg(9, 6)), bright);
        lash.headMeshGroup.add(ferrule);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(8, 5)), bright);
        ball.position.y = 0.026;
        lash.headMeshGroup.add(ball);
        const frays = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < frays; i++) {
          const a = (i / frays) * Math.PI * 2;
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.0016, 0.04, this.seg(4, 3)), cable);
          wire.position.set(Math.cos(a) * 0.008, 0.05, Math.sin(a) * 0.008);
          wire.rotation.z = -Math.cos(a) * 0.5;
          wire.rotation.x = Math.sin(a) * 0.5;
          wire.userData.sway = { axis: 'x', amp: 0.15, freq: 2.6, phase: i };
          lash.headMeshGroup.add(wire);
        }
        return group;
      },

      // ---- 250: Urumi ---------------------------------------------------------
      createUrumiWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const spring = this._mat(0xC8CED4, { roughness: 0.22, metalness: 0.95 });
        const brass = this._mat(0xC8A23A, { roughness: 0.4, metalness: 0.85 });
        const hide = this._wood(0x4A2F1E);
        // A talwar hilt with no sword in it: three ribbons of spring steel a
        // millimetre thick, which is why it is worn wrapped round the waist.
        this._hilt(group, rand, {
          height: 0.16, rTop: 0.016, rBot: 0.017, mat: hide, wrapMat: brass,
          pommelMat: brass, pommel: 'disc'
        });
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, this.seg(12, 7)), brass);
        group.add(guard);
        const knuckle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.005, this.seg(4, 3), this.seg(12, 7), Math.PI), brass);
        knuckle.position.set(0.024, -0.082, 0);
        knuckle.rotation.z = Math.PI / 2;
        group.add(knuckle);
        const blades = this.isLowDetail() ? 2 : 3;
        const lengths = [0.54, 0.5, 0.46];
        for (let b = 0; b < blades; b++) {
          const ribbon = this._lashRig(group, {
            x: (b - 1) * 0.007, segments: 12, length: lengths[b], mat: spring,
            baseR: 0.013, tipR: 0.009, flat: 0.12, sides: 6,
            gravity: -0.0005, damping: 0.955, stiffness: 0.95, endMass: 0.5
          });
          const point = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, this.seg(5, 4)), spring);
          point.position.y = 0.025;
          point.scale.z = 0.14;
          ribbon.headMeshGroup.add(point);
          // The rivet block where all three are pinned into the hilt.
          const root = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.026), brass);
          root.position.set((b - 1) * 0.007, 0.012, 0);
          group.add(root);
        }
        return group;
      },

      // ---- 251: Frost Whip ----------------------------------------------------
      createFrostWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(0x2A3038, { roughness: 0.55, metalness: 0.7 });
        const rime = this._mat(0xC8E4F4, { roughness: 0.35, metalness: 0.15 });
        const ice = this._mat(0x7ACBE8, { roughness: 0.1, metalness: 0.1, opacity: 0.75, transparent: true });
        const cold = this._glow(0x9FE4FF, 0.9);
        // It is not a whip that freezes, it is a whip made of the freezing:
        // the iron core only reaches the first hand's width and the rest of it
        // grows back after every strike.
        this._hilt(group, rand, { height: 0.16, rTop: 0.017, rBot: 0.02, mat: iron, wrapMat: rime, pommelMat: rime });
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.03, this.seg(10, 6)), iron);
        collar.position.y = 0.014;
        group.add(collar);
        const lash = this._lashRig(group, {
          segments: 14, length: 0.5, mat: ice, baseR: 0.011, tipR: 0.004,
          sides: 5, damping: 0.95, stiffness: 0.92
        });
        const segs = lash.segmentMeshes;
        // Icicles growing off the underside of every second link, and a glow
        // in the joints between them.
        for (let i = 1; i < segs.length; i += 2) {
          const r = this._lashRadius(0.011, 0.004, i, segs.length);
          const spur = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, r * 4.5, this.seg(5, 3)), ice);
          spur.position.set(r * 1.1, -0.006, 0);
          spur.rotation.z = 2.2;
          segs[i].add(spur);
          const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, this.seg(6, 4), this.seg(5, 4)), cold);
          joint.position.y = -0.008;
          joint.userData.pulse = { min: 0.25, max: 0.95, freq: 1.1, phase: i * 0.4 };
          segs[i].add(joint);
        }
        const shardCount = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < shardCount; i++) {
          const a = (i / shardCount) * Math.PI * 2;
          const shard = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, this.seg(4, 3)), ice);
          shard.position.set(Math.cos(a) * 0.008, 0.022, Math.sin(a) * 0.008);
          shard.rotation.z = -Math.cos(a) * 0.4;
          shard.rotation.x = Math.sin(a) * 0.4;
          lash.headMeshGroup.add(shard);
        }
        const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), cold);
        heart.userData.pulse = { min: 0.4, max: 1.3, freq: 0.8 };
        lash.headMeshGroup.add(heart);
        // The cold coming off the grip, which never quite settles.
        const motes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < motes; i++) {
          const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.004, 0), cold);
          mote.position.set(0.03, -0.05 - i * 0.03, 0);
          mote.userData.orbit = { radius: 0.03, speed: 0.6 + i * 0.2, phase: i * 1.6, plane: 'xz' };
          mote.userData.pulse = { min: 0.2, max: 0.9, freq: 1.4, phase: i };
          group.add(mote);
        }
        return group;
      },

      // ---- 252: Thornwhip -----------------------------------------------------
      createThornwhipModel(weapon, rand) {
        const group = new THREE.Group();
        const bramble = this._mat(this.getRandomColor(rand, [0x4A6B2A, 0x3A5A22, 0x5C6B3A]),
          { roughness: 0.85, metalness: 0.03 });
        const woody = this._wood(0x53401F);
        const leaf = this._mat(0x6BAF3A, { roughness: 0.65, metalness: 0.04 });
        const sap = this._glow(0xC8FF7A, 0.5);
        // A bramble runner cut long and kept alive. The only part of it that
        // has been worked is the handle, where the thorns were taken off.
        this._hilt(group, rand, { height: 0.16, rTop: 0.018, rBot: 0.021, mat: woody, wrapMat: bramble });
        const stubs = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < stubs; i++) {
          const cut = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.006, this.seg(5, 4)), woody);
          const a = i * 1.9;
          cut.position.set(Math.cos(a) * 0.019, -0.03 - i * 0.02, Math.sin(a) * 0.019);
          cut.rotation.z = -Math.cos(a) * 1.4;
          cut.rotation.x = Math.sin(a) * 1.4;
          group.add(cut);
        }
        const lash = this._lashRig(group, {
          segments: 14, length: 0.5, mat: bramble, baseR: 0.01, tipR: 0.0045,
          sides: 5, damping: 0.945
        });
        const segs = lash.segmentMeshes;
        for (let i = 0; i < segs.length; i++) {
          const r = this._lashRadius(0.01, 0.0045, i, segs.length);
          const thorns = this.isLowDetail() ? 1 : 2;
          for (let t = 0; t < thorns; t++) {
            const a = i * 2.4 + t * Math.PI;
            const thorn = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 3.0, this.seg(4, 3)), woody);
            thorn.position.set(Math.cos(a) * r, -0.004, Math.sin(a) * r);
            thorn.rotation.z = -Math.cos(a) * 1.1;
            thorn.rotation.x = Math.sin(a) * 1.1;
            segs[i].add(thorn);
          }
          if (this.wantsTrim() && i % 4 === 1) {
            const blade = this._plate([[0, 0], [0.016, 0.01], [0.024, 0.032], [0.003, 0.024]], 0.0018, leaf);
            blade.position.set(0.005, 0.004, 0);
            blade.rotation.set(0, i * 1.1, 0.6);
            blade.userData.sway = { axis: 'z', amp: 0.16, freq: 1.2 + i * 0.1, phase: i };
            segs[i].add(blade);
          }
        }
        // The growing end, which is still a bud and still going somewhere.
        const bud = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, this.seg(6, 4)), leaf);
        bud.position.y = 0.02;
        lash.headMeshGroup.add(bud);
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), sap);
        bead.position.y = 0.042;
        bead.userData.pulse = { min: 0.2, max: 0.8, freq: 0.7 };
        lash.headMeshGroup.add(bead);
        return group;
      },

      // ---- 253: Energy Lash ---------------------------------------------------
      createEnergyLashModel(weapon, rand) {
        const group = new THREE.Group();
        const housing = this._mat(0x30343C, { roughness: 0.45, metalness: 0.65 });
        const trim = this._mat(0x8A9096, { roughness: 0.3, metalness: 0.88 });
        const arcColor = this.getRandomColor(rand, [0xFFD94F, 0x5AE8FF, 0xFF6AD8]);
        const arc = this._glow(arcColor, 1.1);
        const cell = this._glow(arcColor, 0.6);
        // The hardware is only the emitter and the cell that feeds it. The lash
        // is contained plasma, held in a line by the ring at the muzzle, and it
        // is brightest where it has just been moved.
        this._hilt(group, rand, { height: 0.17, rTop: 0.018, rBot: 0.021, mat: housing, sides: this.seg(8, 5) });
        for (let i = 0; i < 3; i++) {
          const vent = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.006, 0.03), trim);
          vent.position.y = -0.05 - i * 0.022;
          group.add(vent);
        }
        const magazine = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, this.seg(9, 6)), cell);
        magazine.position.set(0.022, -0.08, 0);
        magazine.rotation.z = 0.25;
        magazine.userData.pulse = { min: 0.25, max: 0.8, freq: 0.9 };
        group.add(magazine);
        const emitter = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.035, this.seg(12, 7)), trim);
        emitter.position.y = 0.017;
        group.add(emitter);
        const aperture = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, this.seg(4, 3), this.seg(13, 8)), arc);
        aperture.rotation.x = Math.PI / 2;
        aperture.position.y = 0.034;
        aperture.userData.pulse = { min: 0.5, max: 1.3, freq: 1.6 };
        group.add(aperture);
        const lash = this._lashRig(group, {
          y: 0.034, segments: 14, length: 0.52, mat: arc, baseR: 0.008, tipR: 0.004,
          sides: 5, gravity: -0.0004, damping: 0.96, stiffness: 0.9
        });
        const segs = lash.segmentMeshes;
        for (let i = 0; i < segs.length; i++) {
          const r = this._lashRadius(0.008, 0.004, i, segs.length);
          const node = new THREE.Mesh(new THREE.SphereGeometry(r * 1.7, this.seg(6, 4), this.seg(5, 4)), arc);
          node.position.y = -0.008;
          node.userData.pulse = { min: 0.4, max: 1.4, freq: 2.2, phase: i * 0.5 };
          segs[i].add(node);
        }
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.018, 0), arc);
        ball.userData.pulse = { min: 0.6, max: 1.6, freq: 1.8 };
        ball.userData.spin = { axis: 'y', speed: 1.4 };
        lash.headMeshGroup.add(ball);
        const sparks = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < sparks; i++) {
          const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), arc);
          spark.position.set(0.026, 0.04, 0);
          spark.userData.orbit = { radius: 0.026, speed: 1.6 + i * 0.5, phase: i * 2.1, plane: 'xz' };
          spark.userData.pulse = { min: 0.3, max: 1.2, freq: 2.4, phase: i };
          group.add(spark);
        }
        return group;
      },

      // ---- 254: Banshee's Wail ------------------------------------------------
      createBansheesWailModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xE0DCCC, { roughness: 0.75, metalness: 0.05 });
        const old = this._wood(0x9A9382);
        const shroud = this._mat(0xBFD8E8, { roughness: 0.4, metalness: 0.05, opacity: 0.55, transparent: true });
        const wail = this._glow(0xDCF0FF, 1.0);
        // The handle is a jaw, propped open. What comes out of it is the note
        // rather than the thing that made it, which is why the rings are the
        // only part of it that is really there.
        this._hilt(group, rand, { height: 0.15, rTop: 0.017, rBot: 0.02, mat: bone, wrapMat: old });
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(10, 6), this.seg(8, 5)), bone);
        skull.scale.set(1.0, 1.15, 0.85);
        skull.position.y = 0.012;
        group.add(skull);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.019, this.seg(9, 6), this.seg(6, 4), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bone);
        jaw.position.y = 0.006;
        jaw.rotation.x = 0.35;
        jaw.userData.sway = { axis: 'x', amp: 0.16, freq: 0.8 };
        group.add(jaw);
        for (const s of [-1, 1]) {
          const socket = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(7, 5), this.seg(5, 4)), wail);
          socket.position.set(s * 0.012, 0.02, 0.019);
          socket.userData.pulse = { min: 0.3, max: 1.2, freq: 1.3, phase: s > 0 ? 0 : 1.2 };
          group.add(socket);
        }
        const lash = this._lashRig(group, {
          y: 0.03, segments: 15, length: 0.52, mat: shroud, baseR: 0.012, tipR: 0.005,
          sides: 5, gravity: -0.0003, damping: 0.965, stiffness: 0.8, endMass: 0.4
        });
        const segs = lash.segmentMeshes;
        // The note itself, standing in rings along the length of it.
        for (let i = 1; i < segs.length; i += 2) {
          const r = this._lashRadius(0.012, 0.005, i, segs.length);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 2.2, r * 0.28, this.seg(4, 3), this.seg(12, 7)), wail);
          ring.rotation.x = Math.PI / 2;
          ring.userData.pulse = { min: 0.15, max: 1.0, freq: 1.7, phase: i * 0.6 };
          ring.userData.spin = { axis: 'y', speed: 0.6 + i * 0.05 };
          segs[i].add(ring);
        }
        const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(9, 6), this.seg(7, 5)), wail);
        mouth.scale.set(0.8, 1.3, 0.8);
        mouth.userData.pulse = { min: 0.5, max: 1.5, freq: 2.0 };
        lash.headMeshGroup.add(mouth);
        const teeth = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.0026, 0.014, this.seg(4, 3)), bone);
          tooth.position.set(Math.cos(a) * 0.012, 0.012, Math.sin(a) * 0.012);
          tooth.rotation.z = -Math.cos(a) * 0.5;
          tooth.rotation.x = Math.sin(a) * 0.5;
          lash.headMeshGroup.add(tooth);
        }
        return group;
      },

      // ---- 255: Champion's Belt -----------------------------------------------
      createChampionsBeltModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._wood(0x2A1A14);
        const gold = this._mat(0xD8B23A, { roughness: 0.3, metalness: 0.92 });
        const bright = this._mat(0xF0DFA0, { roughness: 0.2, metalness: 0.95 });
        const stone = this._glow(this.getRandomColor(rand, [0xE83A3A, 0x3A6BE8, 0x3AE86B]), 0.5);
        // Won rather than made, and swung by the tail because the plate is the
        // heaviest thing anyone in the building owns.
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.13, this.seg(10, 6)), hide);
        tail.position.y = -0.075;
        tail.scale.z = 0.5;
        group.add(tail);
        for (let i = 0; i < 3; i++) {
          const turn = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0055, this.seg(4, 3), this.seg(12, 7)), hide);
          turn.rotation.x = Math.PI / 2;
          turn.position.y = -0.125 + i * 0.042;
          group.add(turn);
        }
        const strap = this._lashRig(group, {
          segments: 11, length: 0.4, mat: hide, baseR: 0.03, tipR: 0.028,
          flat: 0.22, sides: 6, gravity: -0.0012, damping: 0.92, endMass: 3.6
        });
        const segs = strap.segmentMeshes;
        // The side plates, bolted through the strap where they always are.
        for (const i of [3, 6]) {
          if (i >= segs.length) continue;
          const side = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, this.seg(12, 7)), gold);
          side.rotation.x = Math.PI / 2;
          side.position.z = 0.02;
          side.scale.set(1.0, 1.3, 1.0);
          segs[i].add(side);
          const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, this.seg(11, 7)), bright);
          inner.rotation.x = Math.PI / 2;
          inner.position.z = 0.03;
          segs[i].add(inner);
        }
        if (this.wantsTrim()) {
          for (let i = 1; i < segs.length; i += 2) {
            const stud = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(5, 4)), bright);
            stud.position.set(0.02, 0, 0.03);
            segs[i].add(stud);
            const twin = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(5, 4)), bright);
            twin.position.set(-0.02, 0, 0.03);
            segs[i].add(twin);
          }
        }
        // The main plate: three layers of it, and a stone in the middle nobody
        // has ever had valued.
        const tip = strap.headMeshGroup;
        const back = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, this.seg(20, 11)), gold);
        back.rotation.x = Math.PI / 2;
        back.position.set(0, 0.03, 0.014);
        back.scale.y = 0.8;
        tip.add(back);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.008, this.seg(18, 10)), bright);
        face.rotation.x = Math.PI / 2;
        face.position.set(0, 0.03, 0.022);
        face.scale.y = 0.8;
        tip.add(face);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(9, 6)), stone);
        boss.position.set(0, 0.03, 0.03);
        boss.scale.z = 0.6;
        boss.userData.pulse = { min: 0.2, max: 0.7, freq: 0.6 };
        tip.add(boss);
        const points = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < points; i++) {
          const a = (i / points) * Math.PI * 2;
          const ray = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, this.seg(4, 3)), gold);
          ray.position.set(Math.cos(a) * 0.08, 0.03 + Math.sin(a) * 0.064, 0.014);
          ray.rotation.z = a - Math.PI / 2;
          tip.add(ray);
        }
        return group;
      },

      // ---- 256: Mindlash Whip -------------------------------------------------
      createMindlashWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(0xE4E0D8, { roughness: 0.45, metalness: 0.15 });
        const dark = this._mat(0x2A2438, { roughness: 0.5, metalness: 0.4 });
        const thought = this._glow(this.getRandomColor(rand, [0xB07AFF, 0x7AB0FF, 0xFF7AC8]), 1.0);
        // There is nothing to hold onto past the grip. The lash is a line of
        // borrowed attention, and it hangs in the air in the order it was
        // thought of rather than in any order gravity would choose.
        this._hilt(group, rand, { height: 0.17, rTop: 0.016, rBot: 0.019, mat: shell, wrapMat: dark, sides: this.seg(10, 6) });
        const crown = new THREE.Mesh(new THREE.SphereGeometry(0.021, this.seg(11, 7), this.seg(9, 6)), shell);
        crown.scale.z = 0.7;
        crown.position.y = 0.008;
        group.add(crown);
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(9, 6), this.seg(7, 5)), thought);
        iris.position.set(0, 0.01, 0.014);
        iris.userData.pulse = { min: 0.4, max: 1.2, freq: 0.9 };
        group.add(iris);
        const beads = this.isLowDetail() ? 7 : 11;
        for (let i = 0; i < beads; i++) {
          const t = i / (beads - 1);
          // Spaced further apart the further out they are: the near end of the
          // thought is crowded and the far end has come loose from it.
          const y = 0.05 + Math.pow(t, 1.35) * 0.46;
          const glyph = i % 3 === 0
            ? new THREE.Mesh(new THREE.TorusGeometry(0.014 - t * 0.006, 0.0028, this.seg(4, 3), this.seg(10, 6)), thought)
            : new THREE.Mesh(new THREE.TetrahedronGeometry(0.011 - t * 0.004, 0), thought);
          glyph.position.set(0, y, 0);
          glyph.rotation.set(i * 0.7, i * 1.1, i * 0.4);
          glyph.userData.orbit = { radius: 0.012 + t * 0.03, speed: 0.5 + i * 0.12, phase: i * 1.3, plane: 'xz' };
          glyph.userData.spin = { axis: 'y', speed: 0.6 + i * 0.1 };
          glyph.userData.pulse = { min: 0.25, max: 1.1, freq: 1.1 + i * 0.15, phase: i * 0.5 };
          group.add(glyph);
          if (this.wantsTrim() && i > 0) {
            const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, this.seg(4, 3)), thought);
            link.position.set(0, y - 0.026, 0);
            link.userData.pulse = { min: 0.1, max: 0.6, freq: 1.6, phase: i * 0.4 };
            group.add(link);
          }
        }
        return group;
      },

      // ---- 257: Phoenix Intestines --------------------------------------------
      createPhoenixIntestinesModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xC8B48A, { roughness: 0.8, metalness: 0.05 });
        const clamp = this._mat(0x8A9096, { roughness: 0.45, metalness: 0.8 });
        const gut = this._mat(0x7ACB4A, { roughness: 0.35, metalness: 0.1, opacity: 0.85, transparent: true });
        const vein = this._glow(0xB8FF3A, 0.7);
        const ember = this._glow(0xFF7A2A, 1.0);
        // Taken out of something that has since grown them back. They are still
        // warm, still working, and still burning somewhere near the far end.
        this._hilt(group, rand, { height: 0.15, rTop: 0.017, rBot: 0.02, mat: bone, wrapMat: clamp });
        const jaws = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.02), clamp);
        jaws.position.y = 0.008;
        group.add(jaws);
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, this.seg(7, 5)), clamp);
        pin.rotation.z = Math.PI / 2;
        pin.position.y = 0.008;
        group.add(pin);
        const lash = this._lashRig(group, {
          y: 0.016, segments: 13, length: 0.48, mat: gut, baseR: 0.013, tipR: 0.007,
          sides: 6, gravity: -0.0007, damping: 0.94, endMass: 1.2
        });
        const segs = lash.segmentMeshes;
        // It is not a smooth tube anywhere: every length of it is swollen with
        // whatever the bird was carrying, and the mesentery is still attached.
        for (let i = 0; i < segs.length; i++) {
          const r = this._lashRadius(0.013, 0.007, i, segs.length);
          const swell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.5, this.seg(7, 5), this.seg(6, 4)), gut);
          swell.scale.y = 1.4;
          swell.position.y = -0.006;
          segs[i].add(swell);
          if (this.wantsTrim() && i % 2 === 0) {
            const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.0016, 0.03, this.seg(4, 3)), vein);
            strand.position.set(r * 1.4, 0, 0);
            strand.rotation.z = -1.2;
            strand.userData.sway = { axis: 'z', amp: 0.2, freq: 1.3 + i * 0.1, phase: i };
            strand.userData.pulse = { min: 0.2, max: 0.8, freq: 1.5, phase: i * 0.5 };
            segs[i].add(strand);
          }
        }
        const cut = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(9, 6), this.seg(7, 5)), ember);
        cut.userData.pulse = { min: 0.5, max: 1.5, freq: 1.4 };
        lash.headMeshGroup.add(cut);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, this.seg(6, 4)), ember);
        flame.position.y = 0.032;
        flame.userData.sway = { axis: 'z', amp: 0.12, freq: 2.6 };
        flame.userData.pulse = { min: 0.6, max: 1.6, freq: 3.0 };
        lash.headMeshGroup.add(flame);
        const sparks = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < sparks; i++) {
          const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.004, 0), ember);
          spark.position.set(0.02, 0.04, 0);
          spark.userData.orbit = { radius: 0.022, speed: 1.1 + i * 0.4, phase: i * 1.7, plane: 'xz' };
          spark.userData.pulse = { min: 0.2, max: 1.0, freq: 2.2, phase: i };
          lash.headMeshGroup.add(spark);
        }
        return group;
      },

      // ---- 258: Temporal Echo Whip --------------------------------------------
      createTemporalEchoWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xB08A2A, { roughness: 0.4, metalness: 0.85 });
        const hide = this._wood(0x3A2A1E);
        const steel = this._mat(0x9AA0A6, { roughness: 0.4, metalness: 0.88 });
        const echo = this._mat(0x9AD8E8, { roughness: 0.3, metalness: 0.1, opacity: 0.35, transparent: true });
        const spark = this._glow(0x9AE8FF, 0.9);
        // One whip and two of its own past positions, which arrive at slightly
        // different times and are answerable for slightly different injuries.
        this._hilt(group, rand, { height: 0.17, rTop: 0.017, rBot: 0.02, mat: hide, wrapMat: brass, pommelMat: brass, pommel: 'wheel' });
        const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.008, this.seg(16, 9)), brass);
        dial.rotation.x = Math.PI / 2;
        dial.position.set(0, -0.19, 0);
        group.add(dial);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.02, 0.002), steel);
        hand.position.set(0, -0.185, 0.006);
        hand.userData.spin = { axis: 'z', speed: -0.9 };
        group.add(hand);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, 0.026, this.seg(10, 6)), brass);
        collar.position.y = 0.012;
        group.add(collar);
        // The thong that is actually there.
        const lash = this._lashRig(group, {
          y: 0.024, segments: 14, length: 0.5, mat: hide, baseR: 0.011, tipR: 0.004,
          damping: 0.945
        });
        const bead = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0), spark);
        bead.userData.pulse = { min: 0.4, max: 1.2, freq: 1.5 };
        lash.headMeshGroup.add(bead);
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.04, this.seg(5, 4)), steel);
        point.position.y = 0.026;
        lash.headMeshGroup.add(point);
        // The echoes: the same rope hung under different rules, so they trail
        // the real one instead of tracking it.
        const echoes = this.isLowDetail() ? 1 : 2;
        for (let e = 0; e < echoes; e++) {
          const ghost = this._lashRig(group, {
            x: (e === 0 ? 0.012 : -0.012), y: 0.024, segments: 9, length: 0.48 - e * 0.03,
            mat: echo, baseR: 0.009, tipR: 0.0035, sides: 5,
            gravity: -0.00045 - e * 0.0002, damping: 0.975 - e * 0.02, stiffness: 0.7, endMass: 0.5
          });
          const ghostTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.01, 0), echo);
          ghost.headMeshGroup.add(ghostTip);
        }
        return group;
      },

      // ---- 259: Liquid Stone Whip ---------------------------------------------
      createLiquidStoneWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const basalt = this._mat(0x3A3A40, { roughness: 0.95, metalness: 0.05 });
        const grey = this._mat(0x55555C, { roughness: 0.9, metalness: 0.08 });
        const hide = this._wood(0x4A3226);
        const melt = this._glow(0xFF6A1A, 1.1);
        // Stone that has been talked out of being solid: plates of cooled crust
        // riding on a core that never sets, and it shows in every joint.
        this._hilt(group, rand, { height: 0.16, rTop: 0.019, rBot: 0.023, mat: basalt, wrapMat: hide });
        const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, this.seg(9, 6)), grey);
        socket.position.y = 0.012;
        group.add(socket);
        const lash = this._lashRig(group, {
          segments: 12, length: 0.46, mat: basalt, baseR: 0.014, tipR: 0.008, sides: 6,
          gravity: -0.0013, damping: 0.9, stiffness: 0.95, endMass: 2.6
        });
        const segs = lash.segmentMeshes;
        for (let i = 0; i < segs.length; i++) {
          const r = this._lashRadius(0.014, 0.008, i, segs.length);
          // A plate of crust, sat crooked because nothing under it is holding
          // still, and the seam of melt it floats on.
          const plate = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 1.4, 0), grey);
          plate.rotation.set(i * 0.9, i * 0.6, i * 1.3);
          plate.scale.set(1.0, 0.75, 1.0);
          segs[i].add(plate);
          const seam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.75, r * 1.1, this.seg(7, 5)), melt);
          seam.position.y = -0.012;
          seam.userData.pulse = { min: 0.35, max: 1.2, freq: 0.9, phase: i * 0.4 };
          segs[i].add(seam);
        }
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(10, 6), this.seg(8, 5)), melt);
        blob.scale.y = 1.25;
        blob.userData.pulse = { min: 0.5, max: 1.4, freq: 0.7 };
        lash.headMeshGroup.add(blob);
        const skin = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02, 0), grey);
        skin.position.y = 0.014;
        skin.scale.y = 0.7;
        lash.headMeshGroup.add(skin);
        const drips = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < drips; i++) {
          const drip = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(6, 4), this.seg(5, 4)), melt);
          drip.scale.y = 1.8;
          drip.position.set((i - 1) * 0.012, -0.026, 0.006);
          drip.userData.bob = { amp: 0.008, freq: 0.9 + i * 0.3, phase: i };
          drip.userData.pulse = { min: 0.4, max: 1.3, freq: 1.3, phase: i };
          lash.headMeshGroup.add(drip);
        }
        return group;
      },

      // ---- 260: Varlenia Chain Whip -------------------------------------------
      createVarleniaChainWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const body = this._mat(0x9A9EA4, { roughness: 0.3, metalness: 0.9 });
        const collarMat = this._mat(0xC0C6CC, { roughness: 0.22, metalness: 0.95 });
        const silk = this._mat(0xB03A3A, { roughness: 0.85, metalness: 0.05 });
        // Nine sections on rings, the way the workshop has always built them,
        // with the flag at the handle end so the wielder can see where it is.
        // The gilding is house issue and goes on after this is built.
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, this.seg(11, 7)), body);
        handle.position.y = -0.06;
        group.add(handle);
        for (let i = 0; i < 4; i++) {
          const knurl = new THREE.Mesh(new THREE.TorusGeometry(0.0155, 0.0022, this.seg(4, 3), this.seg(11, 7)), collarMat);
          knurl.rotation.x = Math.PI / 2;
          knurl.position.y = -0.1 + i * 0.024;
          group.add(knurl);
        }
        const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, this.seg(4, 3), this.seg(12, 7)), collarMat);
        wristRing.rotation.x = Math.PI / 2;
        wristRing.position.y = -0.12;
        group.add(wristRing);
        const chain = this._lashRig(group, {
          segments: 9, length: 0.45, mat: body, baseR: 0.009, tipR: 0.008, sides: 8,
          gravity: -0.001, damping: 0.93, stiffness: 0.98, endMass: 2.2
        });
        const segs = chain.segmentMeshes;
        // The rings between the sections, which are what makes it fold.
        for (let i = 0; i < segs.length; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0032, this.seg(4, 3), this.seg(10, 6)), collarMat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = -0.024;
          segs[i].add(ring);
        }
        if (this.wantsTrim()) {
          for (let i = 0; i < 2; i++) {
            const flag = this._plate([[0, 0], [0.03, 0.008], [0.03, -0.024], [0, -0.016]], 0.0015, silk);
            flag.position.set(0.012, -0.01, 0);
            flag.rotation.y = i * 0.6;
            flag.userData.sway = { axis: 'z', amp: 0.22, freq: 1.5, phase: i };
            segs[0].add(flag);
          }
        }
        const dart = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.07, this.seg(7, 5)), body);
        dart.position.y = 0.035;
        chain.headMeshGroup.add(dart);
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.02, this.seg(9, 6)), collarMat);
        chain.headMeshGroup.add(shoulder);
        return group;
      },

      // ---- 261: EHI Omniscient Binder -----------------------------------------
      createOmniscientBinderModel(weapon, rand) {
        const group = new THREE.Group();
        const corporate = this._mat(0xE8E4DC, { roughness: 0.4, metalness: 0.25 });
        const accent = this._mat(0x1E4A8B, { roughness: 0.5, metalness: 0.4 });
        const grey = this._mat(0x6E7378, { roughness: 0.5, metalness: 0.75 });
        const hazard = this._mat(0xD8B02A, { roughness: 0.55, metalness: 0.3 });
        const filament = this._glow(0xC8E8FF, 1.1);
        // The same product line as the rest of the EHI catalogue and the same
        // brochure: it does not restrain, it establishes compliance. Moulded
        // shell, a spool nobody is allowed to open, and a filament that pays
        // out until the subject stops disagreeing.
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.19, 0.05), corporate);
        shell.position.y = -0.095;
        group.add(shell);
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.09, 0.038), grey);
        grip.position.set(0, -0.13, 0.006);
        group.add(grip);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.004), accent);
        panel.position.set(0, -0.06, 0.026);
        group.add(panel);
        const plate = this._plate([[-0.012, 0], [0.012, 0], [0, 0.022]], 0.003, hazard);
        plate.position.set(0, -0.16, 0.026);
        group.add(plate);
        const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.024, this.seg(14, 8)), grey);
        spool.rotation.z = Math.PI / 2;
        spool.position.set(0, -0.035, -0.03);
        spool.userData.spin = { axis: 'x', speed: 1.2 };
        group.add(spool);
        const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.004, this.seg(14, 8)), corporate);
        cheek.rotation.z = Math.PI / 2;
        cheek.position.set(0.014, -0.035, -0.03);
        group.add(cheek);
        const lamps = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < lamps; i++) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(7, 5), this.seg(5, 4)), filament);
          lamp.position.set(-0.012 + i * 0.008, -0.045, 0.026);
          lamp.userData.pulse = { min: 0.15, max: 1.0, freq: 1.2, phase: i * 0.8 };
          group.add(lamp);
        }
        // The aperture the filament leaves by, ringed so that it is always
        // clear which end of the product the operator is holding.
        const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.04, this.seg(13, 8)), grey);
        muzzle.position.y = 0.02;
        group.add(muzzle);
        const iris = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, this.seg(4, 3), this.seg(13, 8)), filament);
        iris.rotation.x = Math.PI / 2;
        iris.position.y = 0.04;
        iris.userData.pulse = { min: 0.4, max: 1.2, freq: 1.5 };
        group.add(iris);
        const lash = this._lashRig(group, {
          y: 0.04, segments: 12, length: 0.46, mat: filament, baseR: 0.005, tipR: 0.0035,
          sides: 5, gravity: -0.00045, damping: 0.96, stiffness: 0.9, endMass: 1.4
        });
        const segs = lash.segmentMeshes;
        // The measuring marks down the filament: the product records how much
        // of itself the incident required.
        for (let i = 1; i < segs.length; i += 2) {
          const mark = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, this.seg(4, 3), this.seg(9, 6)), accent);
          mark.rotation.x = Math.PI / 2;
          mark.userData.pulse = { min: 0.1, max: 0.5, freq: 1.8, phase: i * 0.5 };
          segs[i].add(mark);
        }
        // The cuff, which closes on arrival and is billed separately.
        const tip = lash.headMeshGroup;
        for (let i = 0; i < 2; i++) {
          const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, this.seg(4, 3), this.seg(14, 8), Math.PI * 1.4), corporate);
          cuff.rotation.x = Math.PI / 2;
          cuff.rotation.z = i * Math.PI;
          cuff.position.y = 0.012 + i * 0.026;
          cuff.userData.sway = { axis: 'z', amp: 0.25, freq: 1.1, phase: i * 1.5 };
          tip.add(cuff);
        }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.014), grey);
        lock.position.y = 0.024;
        tip.add(lock);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), filament);
        eye.position.set(0, 0.024, 0.012);
        eye.userData.pulse = { min: 0.3, max: 1.3, freq: 2.0 };
        tip.add(eye);
        return group;
      },
      // Type 5: Whip (linked segments with physics)
      createWhipModel(weapon, rand) {
        const group = new THREE.Group();
        const handleColor = this.getRandomColor(rand, this.handleColors);
        const whipColor = this.getRandomColor(rand, this.whipColors);
        const guardColor = this.getRandomColor(rand, this.guardColors);
        const gemColor = this.getRandomColor(rand, this.crystalColors);

        const woodMat = new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.95 });
        const metalMat = new THREE.MeshStandardMaterial({ color: guardColor, roughness: 0.3, metalness: 0.85 });
        const darkMat = new THREE.MeshStandardMaterial({ color: whipColor, roughness: 0.75, metalness: 0.1 });
        const gemMat = new THREE.MeshStandardMaterial({ color: gemColor, roughness: 0.1, emissive: gemColor, emissiveIntensity: 0.8 });

        const hHeight = 0.14 + rand() * 0.06;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, hHeight, 6), woodMat);
        h.position.y = -hHeight / 2;
        group.add(h);

        // Decorative handle wrapping
        this.addGripWrap(h, rand, hHeight, 0.018, 0.016, metalMat);

        // Lanyard ring pommel
        const ringPommel = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 4, 8), metalMat);
        ringPommel.position.y = -hHeight;
        ringPommel.rotation.x = Math.PI / 2;
        group.add(ringPommel);

        // Knuckle guard on handle
        const guard = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 4, 12, Math.PI), metalMat);
        guard.position.set(0.02, -hHeight / 2, 0);
        guard.rotation.z = Math.PI / 2;
        group.add(guard);

        // ---- The lash ----
        // One rig for every whip in the game, so the generic one bends, plaits
        // and cracks exactly like the twenty-three bespoke ones do.
        const whipType = Math.floor(rand() * 3);
        const numSegments = 14 + Math.floor(rand() * 6); // 14-19 linked segments
        const totalLength = 0.35 + rand() * 0.25;

        // Whip tapers from thick base to thin tip
        const baseRadius = whipType === 1 ? 0.012 : (whipType === 2 ? 0.008 : 0.010);
        const tipRadius = whipType === 1 ? 0.005 : (whipType === 2 ? 0.003 : 0.004);

        // Choose segment material based on whip type
        const segMat = whipType === 0 ? darkMat : (whipType === 1 ? gemMat : metalMat);

        const rope = this._lashRig(group, {
          segments: numSegments, length: totalLength, mat: segMat,
          baseR: baseRadius, tipR: tipRadius,
          // A length of cable has more body than plaited leather, and a strung
          // line of light has almost none.
          bend: whipType === 2 ? 0.2 : (whipType === 1 ? 0.06 : 0.12),
          drag: whipType === 1 ? 0.6 : 0.35
        });
        const segLen = totalLength / rope.segmentMeshes.length;
        const segs = rope.segmentMeshes;

        for (let i = 0; i < segs.length; i++) {
          const radius = this._lashRadius(baseRadius, tipRadius, i, segs.length);

          // Type 2 (blade whip): add barb spikes to every 2nd-3rd segment
          if (whipType === 2 && i > 2 && i % 2 === 0) {
            const barbSize = 0.008 + rand() * 0.006;
            const barb = new THREE.Mesh(new THREE.ConeGeometry(barbSize, barbSize * 2.5, 4), metalMat);
            barb.position.set(radius * 0.7, 0, 0);
            barb.rotation.z = -Math.PI / 2;
            segs[i].add(barb);

            // Opposing barb
            if (rand() > 0.4) {
              const barb2 = new THREE.Mesh(new THREE.ConeGeometry(barbSize * 0.8, barbSize * 2, 4), metalMat);
              barb2.position.set(-radius * 0.7, 0, 0);
              barb2.rotation.z = Math.PI / 2;
              segs[i].add(barb2);
            }
          }

          // Type 1 (energy whip): add tiny glow nodes at joints
          if (whipType === 1 && i > 0 && i % 3 === 0) {
            const node = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.8, 4, 4), gemMat);
            node.position.set(0, -segLen / 2, 0);
            segs[i].add(node);
          }

          // Type 0 (leather): add occasional braided knots
          if (whipType === 0 && i > 3 && i % 4 === 0) {
            const knot = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.2, radius * 0.5, 4, 6), darkMat);
            knot.rotation.x = Math.PI / 2;
            knot.position.set(0, -segLen / 2, 0);
            segs[i].add(knot);
          }
        }

        // Whip tip (cracker / spike / energy orb). The rig turns the mount to
        // follow the last stretch of the lash, so all of these run on from it.
        const tipGroup = rope.headMeshGroup;
        if (whipType === 0) {
          // Leather cracker, thin tapered cone
          const cracker = new THREE.Mesh(new THREE.ConeGeometry(tipRadius * 0.8, segLen * 1.5, 4), darkMat);
          cracker.position.y = segLen * 0.6;
          tipGroup.add(cracker);
        } else if (whipType === 1) {
          // Energy orb at the tip
          const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.015, 0), gemMat);
          tipGroup.add(orb);
        } else {
          // Blade spike tip
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 4), metalMat);
          spike.position.y = 0.014;
          tipGroup.add(spike);
          // Small gem embedded
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.006, 0), gemMat);
          gem.position.y = -0.003;
          tipGroup.add(gem);
        }

        return group;
      }
    }
  });
})();
