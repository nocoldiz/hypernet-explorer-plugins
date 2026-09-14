//=============================================================================
// Weapon 3D Models - unarmed, one fist per archetype
// Version: 1.1.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc One right-hand model per Archetypes.json archetype, shown
 * when a character is fighting with an empty hand. Loaded automatically by
 * WeaponSystemProcedural.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Weapon 3D Models - unarmed
 * ============================================================================
 *
 * A character with nothing in their hand still has a hand, and what it looks
 * like depends on what they are. This family carries one right-hand model per
 * archetype key in js/db/Health/Archetypes.json, all 78 of them, so
 * nothing in the database falls back to somebody else's fist.
 *
 * Registered through the `unarmed` map rather than `unique`, because there is
 * no database weapon to key on:
 *
 *   WeaponSystemProcedural.registerFamily({
 *     name: 'Weapon3D_Unarmed',
 *     unarmed: { Dragon: 'createUnarmedDragonModel' },
 *     models:  { createUnarmedDragonModel(weapon, rand) { ... } }
 *   });
 *
 * A HYBRID archetype ("Dragon / Elven") uses the FIRST of its archetypes, so a
 * mixed character always reads as one thing rather than something in between
 * (see archetypeOf in the core). An archetype with no model falls back to
 * Humanoid.
 *
 * The core builds a stand-in weapon for the empty hand
 * (WeaponSystemProcedural.unarmedWeaponFor) typed as a Glove, so the whole
 * rest of the pipeline - model cache, mesh merge, first-person pose and the
 * procedural punch - works on it unchanged.
 *
 * NOT listed in plugins.js: WeaponSystemProcedural.js injects this file at
 * runtime from its WEAPON3D_FAMILIES list.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.WeaponSystemProcedural) {
    console.error('[Weapon3D_Unarmed] WeaponSystemProcedural not loaded');
    return;
  }

  window.WeaponSystemProcedural.registerFamily({
    name: 'Weapon3D_Unarmed',
    unarmed: {
      Humanoid: 'createUnarmedHumanoidModel',
      Beast: 'createUnarmedBeastModel',
      Insectoid: 'createUnarmedInsectoidModel',
      Frog: 'createUnarmedFrogModel',
      Dragon: 'createUnarmedDragonModel',
      Skeleton: 'createUnarmedSkeletonModel',
      Fairy: 'createUnarmedFairyModel',
      Slime: 'createUnarmedSlimeModel',
      Undead: 'createUnarmedUndeadModel',
      Scorpion: 'createUnarmedScorpionModel',
      Spider: 'createUnarmedSpiderModel',
      Plant: 'createUnarmedPlantModel',
      Elemental: 'createUnarmedElementalModel',
      AquaticFish: 'createUnarmedFishModel',
      Octopus: 'createUnarmedOctopusModel',
      Robot: 'createUnarmedRobotModel',
      Bird: 'createUnarmedBirdModel',
      Reptilian: 'createUnarmedReptilianModel',
      Mushroom: 'createUnarmedMushroomModel',
      Tree: 'createUnarmedTreeModel',
      Bacterial: 'createUnarmedBacterialModel',
      DoubleHeadedHumanoid: 'createUnarmedDoubleHeadedModel',
      Serpent: 'createUnarmedSerpentModel',
      Golem: 'createUnarmedGolemModel',
      Demon: 'createUnarmedDemonModel',
      Ghost: 'createUnarmedGhostModel',
      Drone: 'createUnarmedDroneModel',
      Voidspawn: 'createUnarmedVoidspawnModel',
      Mutant: 'createUnarmedMutantModel',
      CrystalEntity: 'createUnarmedCrystalEntityModel',
      Amphibian: 'createUnarmedAmphibianModel',
      ConstructedUndead: 'createUnarmedConstructedUndeadModel',
      Minotaur: 'createUnarmedMinotaurModel',
      Goblin: 'createUnarmedGoblinModel',
      Crustacean: 'createUnarmedCrustaceanModel',
      Spherical: 'createUnarmedSphericalModel',
      Turtle: 'createUnarmedTurtleModel',
      Manticore: 'createUnarmedManticoreModel',
      ChestMimic: 'createUnarmedChestMimicModel',
      Phoenix: 'createUnarmedPhoenixModel',
      Ogre: 'createUnarmedOgreModel',
      Scarecrow: 'createUnarmedScarecrowModel',
      SegmentWorm: 'createUnarmedSegmentWormModel',
      Mineral: 'createUnarmedMineralModel',
      Hydra: 'createUnarmedHydraModel',
      Vampire: 'createUnarmedVampireModel',
      Bat: 'createUnarmedBatModel',
      Rabbit: 'createUnarmedRabbitModel',
      ArmoredKnight: 'createUnarmedArmoredKnightModel',
      Centaur: 'createUnarmedCentaurModel',
      InsectSwarm: 'createUnarmedInsectSwarmModel',
      RoboticDefender: 'createUnarmedRoboticDefenderModel',
      Turret: 'createUnarmedTurretModel',
      Gorgon: 'createUnarmedGorgonModel',
      AbyssalLeviathan: 'createUnarmedAbyssalLeviathanModel',
      Snail: 'createUnarmedSnailModel',
      WaterElemental: 'createUnarmedWaterElementalModel',
      ThunderElemental: 'createUnarmedThunderElementalModel',
      StormElemental: 'createUnarmedStormElementalModel',
      FireElemental: 'createUnarmedFireElementalModel',
      MetalElemental: 'createUnarmedMetalElementalModel',
      DarkElemental: 'createUnarmedDarkElementalModel',
      SacredElemental: 'createUnarmedSacredElementalModel',
      Totem: 'createUnarmedTotemModel',
      Ophanim: 'createUnarmedOphanimModel',
      Angel: 'createUnarmedAngelModel',
      Elven: 'createUnarmedElvenModel',
      Gnome: 'createUnarmedGnomeModel',
      Elephant: 'createUnarmedElephantModel',
      TentacledCreature: 'createUnarmedTentacledModel',
      SpiderHumanHybrid: 'createUnarmedSpiderHumanModel',
      SpikyMonster: 'createUnarmedSpikyMonsterModel',
      Horse: 'createUnarmedHorseModel',
      Unicorn: 'createUnarmedUnicornModel',
      Hellhound: 'createUnarmedHellhoundModel',
      WingedDemon: 'createUnarmedWingedDemonModel',
      TrashCreature: 'createUnarmedTrashCreatureModel'
    },
    models: {

      // ============================================================
      // Shared parts
      // ============================================================

      /** Claws or talons at the knuckles, in place of fingers. */
      _uClaws(group, mat, opts) {
        const o = opts || {};
        const n = o.count === undefined ? 4 : o.count;
        const len = o.length || 0.045;
        const spread = o.spread === undefined ? 0.0207 : o.spread;
        for (let i = 0; i < n; i++) {
          const x = -((n - 1) / 2) * spread + i * spread;
          const claw = new THREE.Mesh(
            new THREE.ConeGeometry(o.radius || 0.009, len, this.seg(o.sides || 6, 4)), mat);
          claw.position.set(x, o.y === undefined ? 0.076 : o.y, o.z === undefined ? 0.032 : o.z);
          claw.rotation.x = o.curl === undefined ? 0.7 : o.curl;
          if (o.fan) claw.rotation.z = (i - (n - 1) / 2) * o.fan;
          group.add(claw);
        }
        return group;
      },

      /** Rows of scales, plates or chitin over the back of the hand. */
      _uPlates(group, mat, opts) {
        const o = opts || {};
        const rows = this.isLowDetail() ? 2 : (o.rows || 4);
        for (let r = 0; r < rows; r++) {
          const per = (o.per || 4) - (r % 2);
          for (let i = 0; i < per; i++) {
            const p = new THREE.Mesh(
              o.box
                ? new THREE.BoxGeometry(0.017, 0.012, 0.006)
                : new THREE.ConeGeometry(o.size || 0.011, (o.size || 0.011) * 1.5, 3), mat);
            p.position.set(-0.03 + i * 0.02 + (r % 2) * 0.01, 0.05 - r * 0.024, 0.026);
            if (!o.box) { p.rotation.x = -Math.PI / 2; p.scale.z = 0.4; }
            group.add(p);
          }
        }
        return group;
      },

      /** A halo, aura or containment ring hanging around the hand. */
      _uAura(group, mat, opts) {
        const o = opts || {};
        const n = this.isLowDetail() ? 2 : (o.count || 3);
        for (let i = 0; i < n; i++) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry((o.radius || 0.05) + i * 0.008, 0.002, this.seg(4, 3), this.seg(16, 9)), mat);
          ring.position.set(0, o.y === undefined ? 0.03 : o.y, o.z || 0.02);
          ring.rotation.set((i * Math.PI) / n, (i * Math.PI) / 3, 0);
          ring.userData.spin = { axis: ['y', 'x', 'z'][i % 3], speed: (i % 2 ? -1 : 1) * (0.6 + i * 0.3) };
          ring.userData.pulse = { min: 0.15, max: 1.2, freq: 1.2 + i * 0.3, phase: i * 1.3 };
          group.add(ring);
        }
        return group;
      },

      /**
       * The shell-and-core hand every elemental archetype is a variation of:
       * a fist that is being held in that shape rather than owning it, with
       * whatever is doing the holding visible in the middle. Returns the core
       * so the caller can hang its own element off it.
       */
      _uElemental(group, shellMat, coreMat, opts) {
        const o = opts || {};
        this._fist(group, shellMat, {
          width: o.width || 0.082, knuckleR: o.knuckleR || 0.015,
          fingers: false, cuff: o.cuff || 0.046
        });
        const heart = new THREE.Mesh(new THREE.OctahedronGeometry(o.coreR || 0.02, 0), coreMat);
        heart.position.set(0, 0.03, 0.014);
        heart.userData.spin = { axis: 'y', speed: o.spin === undefined ? 0.9 : o.spin };
        heart.userData.pulse = { min: o.min === undefined ? 0.4 : o.min, max: 1.5, freq: o.freq || 1.3 };
        group.add(heart);
        return heart;
      },

      /** A hoof: the striking surface of anything that walks on four legs. */
      _uHoof(group, mat, opts) {
        const o = opts || {};
        const r = o.radius || 0.046;
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.84, o.height || 0.075, this.seg(14, 8)), mat);
        wall.position.y = 0.02;
        wall.scale.z = 0.86;
        group.add(wall);
        const sole = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.01, this.seg(14, 8)), o.soleMat || mat);
        sole.position.y = 0.058;
        sole.scale.z = 0.86;
        group.add(sole);
        // The cleft up the front of the wall, and the growth rings across it.
        const cleft = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.01), o.soleMat || mat);
        cleft.position.set(0, 0.02, r * 0.78);
        group.add(cleft);
        const rings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < rings; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * (0.99 - i * 0.03), 0.002, this.seg(4, 3), this.seg(14, 8)), mat);
          ring.rotation.x = Math.PI / 2;
          ring.position.y = 0.0 + i * 0.014;
          ring.scale.z = 0.86;
          group.add(ring);
        }
        return group;
      },

      // ============================================================
      // Skin
      // ============================================================

      /**
       * A skin sheet, drawn once per tone and shared by every hand wearing it.
       * A bare hand fills a good part of the screen and none of it is far
       * away, so a flat colour reads as painted plastic at that size. The
       * sheet carries what skin actually has: uneven pigment underneath,
       * pores, and the fine crease net the surface is divided into. It is fed
       * back in as a bump map as well, which is what makes those pores catch
       * the light instead of sitting there as printed dots.
       */
      _uSkinTexture(hex, variant) {
        if (typeof THREE === 'undefined' || typeof document === 'undefined') return null;
        if (!this._uSkinSheets) this._uSkinSheets = {};
        const key = hex + ':' + (variant || 'skin');
        if (this._uSkinSheets[key] !== undefined) return this._uSkinSheets[key];

        let canvas = null;
        try { canvas = document.createElement('canvas'); } catch (e) { canvas = null; }
        const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!ctx) { this._uSkinSheets[key] = null; return null; }

        const size = 256;
        canvas.width = size;
        canvas.height = size;

        // Seeded off the tone, so a given skin always draws the same sheet and
        // the cache can hand the same texture to every hand asking for it.
        let s = 0x9E3779B9;
        for (let i = 0; i < key.length; i++) s = (Math.imul(s, 31) + key.charCodeAt(i)) | 0;
        const rand = () => {
          s = Math.imul(s ^ (s >>> 15), 0x2545F491) | 0;
          return ((s >>> 8) & 0xFFFF) / 0xFFFF;
        };

        const base = new THREE.Color(hex);
        const css = (c) => 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
        const taut = variant === 'taut';
        ctx.fillStyle = css(base);
        ctx.fillRect(0, 0, size, size);

        // Blood and pigment under the surface, never evenly spread.
        const blotches = this.isLowDetail() ? 26 : 84;
        for (let i = 0; i < blotches; i++) {
          const c = base.clone().offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.10, (rand() - 0.45) * (taut ? 0.05 : 0.09));
          ctx.fillStyle = css(c);
          ctx.globalAlpha = 0.10 + rand() * 0.15;
          ctx.beginPath();
          ctx.ellipse(rand() * size, rand() * size, 10 + rand() * 42, 8 + rand() * 30, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        const pores = this.isLowDetail() ? 620 : 2400;
        for (let i = 0; i < pores; i++) {
          const sunken = rand() < 0.62;
          const c = base.clone().offsetHSL(0, sunken ? 0.05 : -0.04, sunken ? -0.10 : 0.08);
          ctx.fillStyle = css(c);
          ctx.globalAlpha = 0.16 + rand() * 0.28;
          ctx.beginPath();
          ctx.arc(rand() * size, rand() * size, 0.6 + rand() * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }

        const creaseLines = this.isLowDetail() ? 54 : (taut ? 110 : 250);
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = css(base.clone().offsetHSL(0, 0.05, -0.17));
        for (let i = 0; i < creaseLines; i++) {
          ctx.globalAlpha = 0.09 + rand() * 0.17;
          const x = rand() * size;
          const y = rand() * size;
          const a = rand() * Math.PI;
          const len = 4 + rand() * 15;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (tex.repeat && tex.repeat.set) tex.repeat.set(3, 3);
        // Shared by every hand of this tone: per-model disposal must not free it.
        tex._weaponSharedCache = true;
        this._uSkinSheets[key] = tex;
        return tex;
      },

      /**
       * A skin material. The tone lives in the sheet rather than in the
       * material colour, so the colour is left white and the map is what is
       * seen; without a canvas to draw on (a headless build), the flat tone is
       * used instead and nothing else changes.
       */
      _uSkinMat(hex, opts) {
        const o = opts || {};
        const tex = this._uSkinTexture(hex, o.variant);
        const mat = this._mat(tex ? 0xFFFFFF : hex, {
          roughness: o.roughness === undefined ? 0.60 : o.roughness,
          metalness: 0.0
        });
        if (tex) {
          mat.map = tex;
          if (!this.isLowDetail()) {
            mat.bumpMap = tex;
            mat.bumpScale = o.bump === undefined ? 0.014 : o.bump;
          }
        }
        return mat;
      },

      // ============================================================
      // Shaped flesh
      // ============================================================

      /**
       * Reshapes a geometry vertex by vertex, then fixes its lighting.
       *
       * The normals have to be recomputed - the ones a sphere or a cylinder
       * was born with describe the shape it no longer is - and they then have
       * to be welded, because every primitive THREE hands out is cut open
       * along a seam and carries two copies of the vertices there. Left alone,
       * each copy averages only the faces on its own side and the seam lights
       * as a hard crease running the length of the part, which on a forearm
       * looks like a join in a prosthetic.
       */
      _uShape(geo, fn) {
        const pos = geo && geo.attributes && geo.attributes.position;
        if (!pos) return geo;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
          fn(v);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();

        const nrm = geo.attributes.normal;
        if (!nrm) return geo;
        const shared = new Map();
        for (let i = 0; i < pos.count; i++) {
          const key = Math.round(pos.getX(i) * 1e5) + ',' + Math.round(pos.getY(i) * 1e5) + ',' + Math.round(pos.getZ(i) * 1e5);
          const acc = shared.get(key);
          if (acc) {
            acc[0] += nrm.getX(i); acc[1] += nrm.getY(i); acc[2] += nrm.getZ(i); acc[3].push(i);
          } else {
            shared.set(key, [nrm.getX(i), nrm.getY(i), nrm.getZ(i), [i]]);
          }
        }
        for (const acc of shared.values()) {
          if (acc[3].length < 2) continue;
          const l = Math.hypot(acc[0], acc[1], acc[2]) || 1;
          for (const i of acc[3]) nrm.setXYZ(i, acc[0] / l, acc[1] / l, acc[2] / l);
        }
        nrm.needsUpdate = true;
        return geo;
      },

      /**
       * A mass of flesh: a unit sphere pulled into an ellipsoid and then
       * swollen wherever a muscle sits under it. Each bulge is asked for as a
       * DIRECTION on the unit sphere ("the palm side of the thumb corner"),
       * which is what lets a hand be one continuous piece of anatomy instead
       * of a capsule with extra balls stuck onto its sides - and a seam
       * between two primitives is exactly what gives a hand away at this
       * range.
       */
      _uMass(mat, o) {
        // Ridges are millimetres wide, so a mass carrying any needs vertices
        // closer together than the ridge itself or the cord it should raise
        // spreads into a plateau instead.
        const d = o.detail || 1;
        const geo = new THREE.SphereGeometry(1, this.seg(Math.round(24 * d), 13), this.seg(Math.round(18 * d), 10));
        const bulges = o.bulges || [];
        const ridges = o.ridges || [];
        const n = new THREE.Vector3();
        this._uShape(geo, (v) => {
          n.copy(v).normalize();
          let swell = 1;
          for (let i = 0; i < bulges.length; i++) {
            const b = bulges[i];
            const dx = n.x - b.x, dy = n.y - b.y, dz = n.z - b.z;
            swell += b.amp * Math.exp(-(dx * dx + dy * dy + dz * dz) / (b.r * b.r));
          }
          const taper = o.taper ? o.taper(n.y) : 1;
          v.set(n.x * o.sx * swell * taper, n.y * o.sy * swell, n.z * o.sz * swell * taper);
          // The side the fingers close onto is flatter than the side the
          // knuckles stand on: a palm is not a barrel. Eased in rather than
          // switched on at the halfway line, which would leave a crease all
          // the way round the mass exactly where the light grazes it.
          if (o.flatten && n.z < 0) {
            const t = Math.min(1, -n.z);
            v.z *= 1 - o.flatten * t * t * (3 - 2 * t);
          }
          if (!ridges.length || n.z <= 0.05) return;
          // Cords lying under the skin, raised out of the surface itself
          // rather than laid on top of it as tubes: a tendon or a vein modelled
          // as its own cylinder always reads as a wire glued to a hand, since
          // it has an edge where skin has none. Each is drawn as a path across
          // the back of the mass, and the vertices near it are pushed out along
          // the surface normal, so what appears is a ridge with no seam.
          const face = Math.pow(n.z, 1.4);
          let push = 0;
          for (let i = 0; i < ridges.length; i++) {
            const r = ridges[i];
            const d = this._uPathDistance(v.x, v.y, r.pts);
            push += r.amp * face * Math.exp(-(d * d) / (r.r * r.r));
          }
          if (!push) return;
          const gx = v.x / (o.sx * o.sx), gy = v.y / (o.sy * o.sy), gz = v.z / (o.sz * o.sz);
          const gl = Math.hypot(gx, gy, gz) || 1;
          v.x += (gx / gl) * push;
          v.y += (gy / gl) * push;
          v.z += (gz / gl) * push;
        });
        return new THREE.Mesh(geo, mat);
      },

      /** Distance from a point to a path, both flattened onto the X/Y plane. */
      _uPathDistance(x, y, pts) {
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = pts[i][0], ay = pts[i][1];
          const bx = pts[i + 1][0], by = pts[i + 1][1];
          const ex = bx - ax, ey = by - ay;
          const len2 = ex * ex + ey * ey;
          let t = len2 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
          t = t < 0 ? 0 : (t > 1 ? 1 : t);
          const dx = x - (ax + ex * t), dy = y - (ay + ey * t);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < best) best = d;
        }
        return best;
      },

      /**
       * The forearm an unarmed strike is attached to. This is what separates
       * the unarmed fist from every held Glove weapon sharing its wtypeId
       * (boxing gloves, knuckle dusters, ...): those end at the wrist because
       * a grip is all there is to show, but a bare fist has no weapon to hide
       * the rest of the arm behind, so the arm has to actually be there. Runs
       * from the wrist down and slightly back, out past the bottom of the
       * frame (WeaponSystemProcedural's unarmedArchetype fit/anchor is sized
       * for exactly this), and ends in a rolled sleeve cuff rather than a bare
       * cut stump.
       *
       * It is not a cone: a forearm is flattened front to back where it meets
       * the wrist and swells into the muscle belly a third of the way down,
       * and that changing oval is most of what says arm rather than pipe.
       */
      _uArm(group, skinMat, sleeveMat, opts) {
        const o = opts || {};
        const len = o.length === undefined ? 0.34 : o.length;
        const arm = new THREE.Group();
        arm.position.set(0, o.topY === undefined ? -0.05 : o.topY, o.z === undefined ? 0.012 : o.z);
        arm.rotation.x = o.tilt === undefined ? 0.15 : o.tilt;
        group.add(arm);

        const topR = o.topR || 0.028;
        const botR = o.botR || 0.038;
        const forearm = new THREE.Mesh(
          new THREE.CylinderGeometry(topR, topR, len, this.seg(20, 10), this.seg(12, 3)), skinMat);
        this._uShape(forearm.geometry, (v) => {
          const t = Math.max(0, 0.5 - v.y / len);    // 0 at the wrist, 1 at the far end
          // Widening fastest just past the wrist and then easing off, with the
          // flexor belly standing out of it around the top third, and an oval
          // section that is flattest where the two bones lie side by side.
          const spread = 1 + (botR / topR - 1) * Math.pow(t, 0.62);
          const belly = 1 + 0.10 * Math.exp(-Math.pow((t - 0.40) / 0.26, 2));
          const flat = 0.80 + 0.16 * Math.min(1, t * 1.6);
          v.x *= spread * belly;
          v.z *= spread * belly * flat;
        });
        forearm.position.y = -len / 2;
        arm.add(forearm);

        // A rolled sleeve cuff pushed up out of the way of the fist, right at
        // the far end (CylinderGeometry caps its own ends, so nothing more is
        // needed to close it off).
        const rolls = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < rolls; i++) {
          const roll = new THREE.Mesh(
            new THREE.TorusGeometry(botR * (1.12 - i * 0.05), botR * 0.32, this.seg(6, 4), this.seg(16, 9)),
            sleeveMat);
          roll.position.y = -len + i * botR * 0.55;
          roll.rotation.x = Math.PI / 2;
          arm.add(roll);
        }
        return arm;
      },

      /**
       * One finger (or thumb) as a chain of tapered segments, each pivoted at
       * the tip of the last rather than positioned by hand with absolute
       * coordinates. That is what makes it read as an actual digit at this
       * close range instead of a stack of spheres: every segment is a real
       * visible LENGTH of bone, and because each one is a child of the last, a
       * bend at every joint compounds into one continuous curl with no risk of
       * the segments drifting apart or folding back through each other.
       *
       * Every part of it is an oval rather than a circle (`wide`/`flat`): a
       * finger is about a fifth wider across than it is deep, and a round one
       * reads as a sausage. `leanX`/`leanZ` aim the whole digit before the
       * chain is laid down (a finger points mostly up with a forward curl; a
       * thumb is aimed out and across instead), and `curls` gives the bend per
       * joint, which is what a folded finger needs: the knuckle and the middle
       * joint of a clenched fist shut almost square while the last one barely
       * bends at all.
       */
      _uFinger(parent, o) {
        const skin = o.skin;
        const knuckleMat = o.knuckleMat || skin;
        const lens = o.lens;
        const radii = o.radii;
        const wide = o.wide === undefined ? 1.12 : o.wide;
        const flat = o.flat === undefined ? 0.90 : o.flat;

        // The metacarpal head: the knuckle itself, squared off on top the way
        // a knuckle is when the joint under it is shut. It is also what closes
        // the root of the digit off - a bare cylinder end left sitting near
        // the surface of the hand shows its flat cut edge-on, and a disc
        // hanging off the side of a fist is unmistakable.
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(radii[0] * 1.14, this.seg(12, 7), this.seg(9, 5)), knuckleMat);
        this._uShape(head.geometry, (v) => {
          if (v.y > 0) v.y *= 0.86;
          if (v.z > 0) v.z *= 1.06;
        });
        head.position.set(o.x, o.baseY || 0, o.baseZ || 0);
        head.scale.set(wide, 0.96, flat);
        parent.add(head);

        let cursor = new THREE.Group();
        cursor.position.set(o.x, o.baseY || 0, o.baseZ || 0);
        cursor.rotation.set(o.leanX === undefined ? 0.16 : o.leanX, o.leanY || 0, o.leanZ || 0);
        if (o.sway) cursor.userData.sway = o.sway;
        // A digit a strike drives has to survive the static merge as its own
        // node: `dynamic` is what keeps WeaponSystemProcedural.mergeStaticParts
        // from baking it into the hand around it, and `punch` is the amount
        // tickPunch tightens it by when the blow lands.
        if (o.punch) {
          cursor.userData.dynamic = true;
          cursor.userData.punch = o.punch;
        }
        parent.add(cursor);

        const curls = o.curls || [];
        const fallback = o.curl === undefined ? 0.3 : o.curl;
        for (let i = 0; i < lens.length; i++) {
          const len = lens[i];
          const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(radii[i + 1], radii[i], len, this.seg(12, 7)), skin);
          seg.position.y = len / 2;
          seg.scale.set(wide, 1, flat);
          cursor.add(seg);

          const next = new THREE.Group();
          next.position.y = len;
          next.rotation.x = curls[i] === undefined ? fallback : curls[i];
          // A finger only ever folds, but a thumb also travels sideways across
          // the fist as it closes, and that is a bend the joint takes about a
          // different axis: without it the thumb can only be aimed by leaning
          // the whole digit, which drives its tip through the fingers instead
          // of laying it over them.
          if (o.curlsZ && o.curlsZ[i] !== undefined) next.rotation.z = o.curlsZ[i];
          cursor.add(next);

          if (i < lens.length - 1) {
            const joint = new THREE.Mesh(
              new THREE.SphereGeometry(radii[i + 1] * 1.08, this.seg(10, 6), this.seg(8, 5)), knuckleMat);
            joint.scale.set(wide, 1.0, flat);
            next.add(joint);
          } else {
            const tip = new THREE.Mesh(
              new THREE.SphereGeometry(radii[i + 1], this.seg(10, 6), this.seg(8, 5)), skin);
            tip.scale.set(wide, 1.05, flat);
            next.add(tip);
            if (o.nailMat) this._uNail(next, o, radii[i + 1], wide, flat);
          }
          cursor = next;
        }
        return cursor;
      },

      /**
       * The one nail a closed fist still shows. It is a low dome sunk into the
       * back of the fingertip and standing barely proud of it, which is all a
       * nail is: an open shell wrapped round the finger instead reads as a
       * paper cuff, because it has edges where a nail has none until its very
       * tip. The half-moon at its root is a second, flatter dome buried a
       * little deeper, so what shows of it is a pale crescent.
       */
      _uNail(parent, o, tipR, wide, flat) {
        const plate = new THREE.Mesh(
          new THREE.SphereGeometry(tipR, this.seg(14, 8), this.seg(10, 6)), o.nailMat);
        plate.scale.set(0.80 * wide, 1.45, 0.44 * flat);
        plate.position.set(0, tipR * 0.16, tipR * flat * 0.62);
        parent.add(plate);

        if (this.wantsTrim() && o.nailPaleMat) {
          const lunula = new THREE.Mesh(
            new THREE.SphereGeometry(tipR * 0.74, this.seg(11, 6), this.seg(8, 5)), o.nailPaleMat);
          lunula.scale.set(0.9 * wide, 0.62, 0.62 * flat);
          lunula.position.set(0, -tipR * 0.42, tipR * flat * 0.52);
          parent.add(lunula);
        }
        return plate;
      },

      // ---- Humanoid ------------------------------------------------------
      // The fist an ordinary character throws, and the baseline every other
      // archetype is a departure from. It is a CLOSED fist rather than an open
      // reaching hand: an empty hand held out flat reads as a prop being shown
      // to the enemy, while what a character without a weapon actually does is
      // make a fist and hit with it.
      //
      // It is built as anatomy rather than as something that reads as a fist
      // from far away, because at first-person range nothing about it is far
      // away. The hand is ONE swollen mass (see _uMass) with the thenar and
      // hypothenar pads and the dorsal arch pulled out of that single surface,
      // rather than a capsule with balls stuck to its sides, since a seam
      // between two primitives is exactly what gives a hand away. Over it sit
      // the things a real fist shows and a modelled one usually forgets: the
      // extensor tendons standing off the back, the dorsal veins running
      // between them, the skin blanched white where it is stretched over each
      // knuckle, the valleys between the knuckles, and the fine crease and
      // pore grain of the skin itself (_uSkinTexture). The thumb lies ACROSS
      // the front of the index and middle fingers, never tucked inside them,
      // which is the single detail that separates a fist from a lump of
      // knuckles - and its nail is the only nail still in view.
      createUnarmedHumanoidModel(weapon, rand) {
        const group = new THREE.Group();
        const skinColor = this.getRandomColor(rand, [0xC9A08A, 0x8A6248, 0xE0B89A, 0x6B4630]);
        const base = new THREE.Color(skinColor);
        // Skin pulled tight over bone goes paler and slightly bloodless, and
        // skin folded on itself goes darker and ruddier. Both are a step away
        // from the tone rather than a different colour: a hand shaded in two
        // clearly separate colours stops being a hand.
        const skin = this._uSkinMat(skinColor, { roughness: 0.60, bump: 0.014 });
        const taut = this._uSkinMat(base.clone().offsetHSL(0.004, -0.04, 0.022).getHex(),
          { variant: 'taut', roughness: 0.50, bump: 0.006 });
        const nail = this._mat(0xE6C3B6, { roughness: 0.22, metalness: 0.06 });
        const nailPale = this._mat(0xF4E4DC, { roughness: 0.28, metalness: 0.04 });
        const hairMat = this._mat(base.clone().offsetHSL(0.01, 0.10, -0.36).getHex(), { roughness: 1.0, metalness: 0.0 });
        const sleeveColor = this.getRandomColor(rand, [0x3A3A3E, 0x5A4A38, 0x2E3A2A, 0x4A2A2A, 0x27333E]);
        const sleeve = this._mat(sleeveColor, { roughness: 0.92, metalness: 0.0 });

        // The hand hangs off the wrist as its own node, tilted so the knuckle
        // row turns up toward the camera and the fingers fold away from it,
        // and turned on the wrist so the thumb side comes round into frame: a
        // fist looked at dead on hides its thumb behind itself, and the thumb
        // lying across the fingers is most of what says fist. The node is also
        // what the punch drives (tickPunch reads `punch`, and `sway` gives the
        // fist its idle breathing), and declaring it as a moving part is what
        // keeps the static merge from baking the whole hand into the arm it
        // would then be unable to turn against.
        const hand = new THREE.Group();
        hand.position.set(0, 0.008, 0.004);
        hand.rotation.set(0.14, 0.60, 0);
        hand.userData.sway = { axis: 'y', amp: 0.022, freq: 0.55 };
        hand.userData.punch = { pitch: 0.26, roll: -0.34 };
        group.add(hand);

        // The four fingers. Each one leaves its knuckle pointing up and away
        // from the camera and then folds twice, so what stays in view is the
        // proximal phalanx lying flat along the top of the fist while the tip
        // ends up pressed into the palm out of sight. The lean is close to a
        // right angle on purpose: the knuckle joint of a clenched hand shuts
        // square. The row is arched - the middle knuckle stands highest and
        // furthest forward - and falls away toward the little finger, which is
        // what stops the front of a fist from reading as a brick. Segment
        // lengths are the real phalanx ratios, roughly 1 : 0.62 : 0.46.
        // `converge` is the sideways lean each one folds with. Fingers do not
        // shut in parallel: they all aim at the same point at the base of the
        // palm, so a closed hand gathers rather than stacking four bars. Left
        // parallel, the index and little fingers swing out past the edge of
        // the fist instead of disappearing behind it.
        const digits = [
          { x: -0.0285, y: 0.0500, z: 0.0145, r: 0.0097, lean: -1.54, converge: -0.17, lens: [0.0400, 0.0250, 0.0190] },
          { x: -0.0090, y: 0.0540, z: 0.0165, r: 0.0101, lean: -1.58, converge: -0.06, lens: [0.0450, 0.0288, 0.0205] },
          { x: 0.0100, y: 0.0505, z: 0.0125, r: 0.0092, lean: -1.62, converge: 0.06, lens: [0.0410, 0.0268, 0.0195] },
          { x: 0.0290, y: 0.0425, z: 0.0055, r: 0.0079, lean: -1.66, converge: 0.18, lens: [0.0320, 0.0205, 0.0165] }
        ];

        // The hand itself: wide across the knuckles, shallow front to back,
        // narrowing into the wrist, hollowed on the palm side and carrying the
        // four lumps that make a fist lopsided - the thumb muscle, the heel a
        // hammer fist lands on, the arch of the knuckles, and the muscle that
        // stands up in the web when the thumb is locked down. Everything that
        // shows through the back of a hand - the four extensor tendons pulled
        // taut by the clench, and the veins winding between them - is raised
        // out of that same surface as a ridge (see _uMass), which is the only
        // way either reads as being UNDER skin rather than laid on top of it.
        const PALM_Y = 0.013;
        const tendons = digits.map((d) => ({
          amp: 0.0026, r: 0.0042,
          pts: [[d.x * 0.36, -0.0330], [d.x * 0.62, -0.0125], [d.x * 0.88, 0.0130], [d.x, d.y - PALM_Y - 0.0080]]
        }));
        const veins = this.wantsTrim() ? [
          { amp: 0.0020, r: 0.0032, pts: [[0.0235, -0.0370], [0.0180, -0.0185], [0.0065, -0.0005], [-0.0080, 0.0140], [-0.0180, 0.0250]] },
          { amp: 0.0016, r: 0.0028, pts: [[0.0075, -0.0020], [0.0135, 0.0115], [0.0195, 0.0210]] },
          { amp: 0.0014, r: 0.0026, pts: [[-0.0065, 0.0125], [-0.0030, 0.0200], [0.0020, 0.0265]] }
        ] : [];
        const palm = this._uMass(skin, {
          sx: 0.0432, sy: 0.0482, sz: 0.0206, detail: this.isLowDetail() ? 1.4 : 2.6,
          taper: (ny) => { const t = (ny + 1) / 2; return 0.66 + 0.29 * t + 0.09 * t * t; },
          flatten: 0.28,
          bulges: [
            { x: -0.72, y: -0.28, z: -0.56, r: 0.80, amp: 0.20 },
            { x: 0.78, y: -0.34, z: -0.42, r: 0.78, amp: 0.13 },
            { x: 0.00, y: 0.42, z: 0.80, r: 0.72, amp: 0.06 },
            { x: -0.62, y: 0.26, z: 0.34, r: 0.58, amp: 0.15 }
          ],
          ridges: tendons.concat(veins)
        });
        palm.position.set(0, PALM_Y, 0.002);
        hand.add(palm);

        for (let i = 0; i < digits.length; i++) {
          const d = digits[i];
          this._uFinger(hand, {
            // The knuckle and the joints beyond it wear the paler skin: on a
            // clenched hand those are where the skin is stretched over bone
            // and goes bloodless, and it is the one thing that says the fist
            // is being SQUEEZED rather than merely shaped like one.
            x: d.x, skin: skin, knuckleMat: taut,
            baseY: d.y, baseZ: d.z,
            leanX: d.lean, leanZ: d.converge, curls: [-1.45, -1.20, -0.95],
            lens: d.lens,
            radii: [d.r, d.r * 0.91, d.r * 0.80, d.r * 0.70],
            // Tightened on the frame the blow lands (tickPunch), a little
            // harder at the little finger than at the index, the way a fist is
            // actually clenched from the outside in.
            punch: { curl: -0.14 - i * 0.015 }
          });

        }

        // The thumb, laid across the front of the index and middle fingers and
        // locked down over them rather than folded in with the others: aimed up
        // and diagonally across the fist, which is where a thumb travels when a
        // hand closes and where it stops.
        this._uFinger(hand, {
          // Its root starts INSIDE the thenar muscle rather than on the edge
          // of the hand: a thumb grows out of that mass, and one rooted at the
          // silhouette leaves a cut cylinder end hanging off the side.
          x: -0.0260, skin: skin, knuckleMat: skin,
          nailMat: nail, nailPaleMat: nailPale,
          baseY: -0.0080, baseZ: -0.0040,
          leanX: -0.673, leanZ: -0.161,
          curls: [-0.065, -0.26], curlsZ: [-0.457, 0],
          lens: [0.0400, 0.0260],
          radii: [0.0128, 0.0102, 0.0088],
          wide: 1.18, flat: 0.86,
          punch: { curl: -0.10 }
        });

        // The hair on the back of a hand: too fine to see one of, and the
        // difference between skin and rubber when there are a dozen.
        if (this.wantsTrim()) {
          for (let i = 0; i < 14; i++) {
            const h = new THREE.Mesh(new THREE.ConeGeometry(0.00045, 0.006 + rand() * 0.004, 3), hairMat);
            h.position.set((rand() - 0.5) * 0.062, -0.012 + rand() * 0.05, 0.0175 + rand() * 0.004);
            h.rotation.set(1.15 + (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 1.1);
            hand.add(h);
          }
        }

        // The wrist: an oval rather than a tube, wider across than deep, with
        // the head of the ulna standing out of the little-finger side of it the
        // way it does on everyone.
        const wrist = this._uMass(skin, {
          sx: 0.0300, sy: 0.0270, sz: 0.0228,
          flatten: 0.10,
          bulges: [{ x: 0.85, y: 0.15, z: 0.35, r: 0.55, amp: 0.14 }]
        });
        wrist.position.set(0, -0.0250, 0.0035);
        group.add(wrist);

        // The forearm behind it: this is what makes an empty hand read as a
        // first-person arm coming up into frame rather than a weapon floating
        // on its own (see WeaponSystemProcedural's unarmedArchetype handling,
        // which fits and anchors the whole assembly around it).
        // Its top is buried inside the wrist rather than butted against it: a
        // cylinder cap meeting an ellipsoid leaves a visible disc, and a seam
        // across the wrist is the first thing that says "model".
        const arm = this._uArm(group, skin, sleeve, {
          length: 0.34, topY: -0.020, topR: 0.0245, botR: 0.038, tilt: 0.15, z: 0.004
        });
        if (this.wantsTrim()) {
          for (let i = 0; i < 16; i++) {
            const t = rand();
            const h = new THREE.Mesh(new THREE.ConeGeometry(0.0005, 0.008 + rand() * 0.006, 3), hairMat);
            const a = (rand() - 0.5) * 1.9;
            const r = 0.028 + t * 0.010;
            h.position.set(Math.sin(a) * r, -0.02 - t * 0.26, Math.cos(a) * r * 0.82);
            h.rotation.set(1.0 + (rand() - 0.5) * 0.6, a, (rand() - 0.5) * 1.2);
            arm.add(h);
          }
        }
        return group;
      },

      // ---- Beast ---------------------------------------------------------
      createUnarmedBeastModel(weapon, rand) {
        const group = new THREE.Group();
        const furColor = this.getRandomColor(rand, [0x6B4A2A, 0x3A2A1C, 0xA08050, 0x2A2A2E]);
        const fur = this._mat(furColor, { roughness: 0.95, metalness: 0.02 });
        const pad = this._mat(0x4A2A28, { roughness: 0.9, metalness: 0.03 });
        const claw = this._mat(0x2A241C, { roughness: 0.5, metalness: 0.2 });
        this._fist(group, fur, { width: 0.086, knuckleR: 0.016, fingers: false, cuff: 0.05 });
        // Paw pads where the fingers would fold, and blunt digging claws.
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), pad);
          p.scale.set(1, 0.75, 1.1);
          p.position.set(-0.03 + i * 0.02, 0.06, 0.03);
          group.add(p);
        }
        const heel = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(11, 7), this.seg(8, 5)), pad);
        heel.scale.set(1.3, 0.6, 1);
        heel.position.set(0, 0.026, 0.036);
        group.add(heel);
        this._uClaws(group, claw, { length: 0.03, radius: 0.007, curl: 0.9, y: 0.072, z: 0.042 });
        return group;
      },

      // ---- Insectoid -----------------------------------------------------
      createUnarmedInsectoidModel(weapon, rand) {
        const group = new THREE.Group();
        const chitinColor = this.getRandomColor(rand, [0x2A3A1C, 0x3A2A1C, 0x1C2A3A]);
        const chitin = this._mat(chitinColor, { roughness: 0.3, metalness: 0.45 });
        const joint = this._mat(0x14120E, { roughness: 0.7, metalness: 0.2 });
        // Not a hand: a segmented forelimb ending in a serrated grasping claw.
        this._fist(group, chitin, { width: 0.07, knuckleR: 0.012, fingers: false, cuff: 0.04, cuffMat: joint });
        for (const s of [-1, 1]) {
          const pincer = this._plate([[0, 0], [s * 0.03, 0.04], [s * 0.024, 0.08], [s * 0.004, 0.05]], 0.014, chitin);
          pincer.position.set(s * 0.012, 0.05, 0.02);
          group.add(pincer);
          const teeth = this.isLowDetail() ? 2 : 4;
          for (let i = 0; i < teeth; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.01, 3), chitin);
            t.position.set(s * (0.006 + i * 0.005), 0.05 + i * 0.014, 0.02);
            t.rotation.z = -s * 1.2;
            group.add(t);
          }
        }
        const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, this.seg(10, 6)), joint);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(0, 0.046, 0.02);
        group.add(hinge);
        return group;
      },

      // ---- Frog ----------------------------------------------------------
      createUnarmedFrogModel(weapon, rand) {
        const group = new THREE.Group();
        const skinColor = this.getRandomColor(rand, [0x4E9A3A, 0x8A9A2A, 0x2A6B4A]);
        const skin = this._mat(skinColor, { roughness: 0.35, metalness: 0.1 });
        const belly = this._mat(0xD8D0A0, { roughness: 0.4, metalness: 0.05 });
        const web = this._mat(skinColor, { roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.6 });
        // Long toes with discs on the ends and webbing between them: it grips
        // rather than punches.
        this._fist(group, skin, { width: 0.07, knuckleR: 0.012, fingers: false, cuff: 0.042 });
        for (let i = 0; i < 4; i++) {
          const x = -0.027 + i * 0.018;
          const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.06, this.seg(8, 5)), skin);
          toe.position.set(x, 0.086, 0.024);
          toe.rotation.set(-0.2, 0, (i - 1.5) * 0.16);
          group.add(toe);
          const disc = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(9, 6), this.seg(7, 5)), belly);
          disc.scale.set(1, 0.5, 1);
          disc.position.set(x + (i - 1.5) * 0.006, 0.116, 0.026);
          group.add(disc);
          if (i < 3) {
            const w = this._plate([[0, 0], [0.018, 0.004], [0.016, 0.04], [0.002, 0.038]], 0.001, web);
            w.position.set(x, 0.062, 0.024);
            group.add(w);
          }
        }
        return group;
      },

      // ---- Dragon --------------------------------------------------------
      createUnarmedDragonModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x2E7D4F, 0x8B1A1A, 0x2B3D8B, 0x6B4A1F]);
        const hide = this._mat(hideColor, { roughness: 0.4, metalness: 0.5 });
        const horn = this._mat(0x2A241C, { roughness: 0.6, metalness: 0.15 });
        const ember = this._glow(0xFF6A1A, 1.0);
        this._fist(group, hide, { width: 0.092, knuckleR: 0.017, fingers: false, cuff: 0.052 });
        this._uPlates(group, hide, { rows: 4, per: 4, size: 0.012 });
        this._uClaws(group, horn, { length: 0.055, radius: 0.011, curl: 0.75, spread: 0.022, y: 0.078 });
        // Fire between the scales, which is the giveaway.
        const vents = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < vents; i++) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.008), ember);
          v.position.set(-0.024 + i * 0.016, 0.04 - i * 0.014, 0.03);
          v.userData.pulse = { min: 0.15, max: 1.4, freq: 1.4, phase: i * 0.8 };
          group.add(v);
        }
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, this.seg(6, 4)), horn);
        spur.position.set(0.042, -0.03, 0);
        spur.rotation.z = -1.3;
        group.add(spur);
        return group;
      },

      // ---- Skeleton ------------------------------------------------------
      createUnarmedSkeletonModel(weapon, rand) {
        const group = new THREE.Group();
        const bone = this._mat(0xE0D6C0, { roughness: 0.78, metalness: 0.03 });
        const shadow = this._mat(0x2A2620, { roughness: 0.95, metalness: 0.0 });
        // No flesh at all: metacarpals, then three phalanges per finger with
        // gaps you can see through.
        for (let f = 0; f < 4; f++) {
          const x = -0.03 + f * 0.02;
          const meta = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.07, this.seg(7, 5)), bone);
          meta.position.set(x, 0.02, 0.012);
          group.add(meta);
          for (let j = 0; j < 3; j++) {
            const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.005 - j * 0.0008, 0.0055 - j * 0.0008, 0.022, this.seg(7, 5)), bone);
            ph.position.set(x, 0.058 + j * 0.004, 0.026 + j * 0.02);
            ph.rotation.x = Math.PI / 2 - 0.35 - j * 0.35;
            group.add(ph);
            const knuckleJoint = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), bone);
            knuckleJoint.position.set(x, 0.058 + j * 0.006, 0.016 + j * 0.02);
            group.add(knuckleJoint);
          }
        }
        const carpals = new THREE.Mesh(new THREE.SphereGeometry(0.024, this.seg(10, 6), this.seg(8, 5)), bone);
        carpals.scale.set(1.4, 0.7, 0.7);
        carpals.position.y = -0.03;
        group.add(carpals);
        for (const s of [-1, 1]) {
          const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.11, this.seg(8, 5)), bone);
          forearm.position.set(s * 0.012, -0.09, 0);
          group.add(forearm);
        }
        const gap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.01), shadow);
        gap.position.set(0, 0.02, -0.01);
        group.add(gap);
        return group;
      },

      // ---- Fairy ---------------------------------------------------------
      createUnarmedFairyModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(0xF0DCC8, { roughness: 0.6, metalness: 0.05 });
        const dustColor = this.getRandomColor(rand, [0xFFD98A, 0x9CD8FF, 0xFF9CD8]);
        const dust = this._glow(dustColor, 1.2);
        const wing = this._mat(dustColor, {
          roughness: 0.1, metalness: 0.05, emissive: dustColor, emissiveIntensity: 0.5,
          transparent: true, opacity: 0.35
        });
        // A very small hand, and most of the damage is the dust coming off it.
        this._fist(group, skin, { width: 0.05, knuckleR: 0.009, cuff: 0.03 });
        for (let i = 0; i < 2; i++) {
          const w = this._plate([[0, 0], [0.04, 0.03], [0.05, 0.08], [0.01, 0.06]], 0.001, wing);
          w.position.set(-0.02, 0.0, -0.02 - i * 0.006);
          w.rotation.set(0, -0.6 - i * 0.3, 0.2);
          w.userData.sway = { axis: 'y', amp: 0.35, freq: 8 + i * 2, phase: i };
          group.add(w);
        }
        const motes = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.004, 0), dust);
          m.position.set(0, 0.03, 0.02);
          m.userData.orbit = { radius: 0.03 + i * 0.006, speed: 0.8 + i * 0.25, phase: i * 1.1, plane: i % 2 ? 'xz' : 'xy' };
          m.userData.pulse = { min: 0.1, max: 1.4, freq: 1.6 + i * 0.2, phase: i };
          group.add(m);
        }
        return group;
      },

      // ---- Slime ---------------------------------------------------------
      createUnarmedSlimeModel(weapon, rand) {
        const group = new THREE.Group();
        const gelColor = this.getRandomColor(rand, [0x4FC3F7, 0x8AE835, 0xE8459B, 0xC8A02A]);
        const gel = this._mat(gelColor, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.62 });
        const core = this._glow(gelColor, 0.8);
        // No bones to make a fist with: it swells into a club and holds the
        // shape only as long as the swing.
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.055, this.seg(14, 8), this.seg(10, 6)), gel);
        blob.scale.set(1, 1.15, 0.9);
        blob.position.y = 0.03;
        blob.userData.bob = { axis: 'y', amp: 0.01, freq: 0.9 };
        group.add(blob);
        const lobes = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < lobes; i++) {
          const a = (i / lobes) * Math.PI * 2;
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.02 + rand() * 0.008, this.seg(10, 6), this.seg(7, 5)), gel);
          l.position.set(Math.cos(a) * 0.042, 0.05 + Math.sin(a) * 0.02, 0.026);
          l.userData.bob = { axis: 'y', amp: 0.008, freq: 1.2, phase: i };
          group.add(l);
        }
        const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(8, 5)), core);
        nucleus.position.set(0, 0.03, 0.01);
        nucleus.userData.orbit = { radius: 0.012, speed: 0.5, plane: 'xz' };
        nucleus.userData.pulse = { min: 0.3, max: 1.0, freq: 0.8 };
        group.add(nucleus);
        // The drip that is always about to fall off it.
        const drip = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(9, 6), this.seg(7, 5)), gel);
        drip.scale.y = 1.8;
        drip.position.set(0.01, -0.04, 0.02);
        drip.userData.bob = { axis: 'y', amp: 0.02, freq: 0.5 };
        group.add(drip);
        const wristGel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, this.seg(12, 7)), gel);
        wristGel.position.y = -0.05;
        group.add(wristGel);
        return group;
      },

      // ---- Undead --------------------------------------------------------
      createUnarmedUndeadModel(weapon, rand) {
        const group = new THREE.Group();
        const flesh = this._mat(this.getRandomColor(rand, [0x6B7A5A, 0x7A6B5A, 0x5A6B7A]), { roughness: 0.92, metalness: 0.02 });
        const bone = this._mat(0xD8CFBA, { roughness: 0.78, metalness: 0.03 });
        const rot = this._mat(0x2A2418, { roughness: 1.0, metalness: 0.0 });
        // Flesh still on it, but not all of it: bone shows through at the
        // knuckles and the nails have grown past use.
        this._fist(group, flesh, { width: 0.084, knuckleR: 0.014, cuff: 0.05 });
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          if (i % 2 === 0) {
            const exposed = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(8, 5), this.seg(6, 4)), bone);
            exposed.position.set(x, 0.062, 0.016);
            group.add(exposed);
          }
          const nail = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.026, this.seg(6, 4)), bone);
          nail.position.set(x, 0.07, 0.05);
          nail.rotation.x = 1.0;
          group.add(nail);
        }
        const wounds = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < wounds; i++) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.006), rot);
          w.position.set((rand() - 0.5) * 0.06, 0.02 + rand() * 0.03, 0.026);
          w.rotation.z = rand();
          group.add(w);
        }
        const ulna = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.05, this.seg(8, 5)), bone);
        ulna.position.set(0.014, -0.09, 0);
        group.add(ulna);
        return group;
      },

      // ---- Scorpion ------------------------------------------------------
      createUnarmedScorpionModel(weapon, rand) {
        const group = new THREE.Group();
        const chitinColor = this.getRandomColor(rand, [0x2A1C1C, 0x6B4A1C, 0x1C2A1C]);
        const chitin = this._mat(chitinColor, { roughness: 0.28, metalness: 0.5 });
        const venom = this._glow(0x9CFF3D, 1.0);
        // A pedipalp: a heavy pincer with a serrated inner edge, and the tail
        // arching over it.
        this._fist(group, chitin, { width: 0.06, knuckleR: 0.011, fingers: false, cuff: 0.04 });
        const jaw = (s, len) => {
          const j = this._plate([[0, 0], [s * 0.022, 0.03], [s * 0.02, len], [s * 0.002, len * 0.7]], 0.018, chitin);
          j.position.set(s * 0.01, 0.05, 0.02);
          group.add(j);
          const teeth = this.isLowDetail() ? 2 : 4;
          for (let i = 0; i < teeth; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.009, 3), chitin);
            t.position.set(s * 0.005, 0.06 + i * (len / teeth), 0.02);
            t.rotation.z = -s * 1.3;
            group.add(t);
          }
        };
        jaw(-1, 0.085); jaw(1, 0.07);
        // The sting, curled forward over the wrist.
        const segs = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const seg = new THREE.Mesh(new THREE.SphereGeometry(0.012 - t * 0.004, this.seg(9, 6), this.seg(7, 5)), chitin);
          seg.position.set(0, -0.05 + Math.sin(t * 2.2) * 0.09, -0.03 - Math.cos(t * 2.2) * 0.03);
          group.add(seg);
        }
        const sting = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(7, 5)), venom);
        sting.position.set(0, 0.04, -0.05);
        sting.rotation.x = 1.6;
        sting.userData.pulse = { min: 0.3, max: 1.2, freq: 1.4 };
        group.add(sting);
        return group;
      },

      // ---- Spider --------------------------------------------------------
      createUnarmedSpiderModel(weapon, rand) {
        const group = new THREE.Group();
        const chitin = this._mat(0x1A1418, { roughness: 0.3, metalness: 0.4 });
        const hair = this._mat(0x2A2024, { roughness: 1.0, metalness: 0.0 });
        const eyeMat = this._glow(this.getRandomColor(rand, [0xFF3A5A, 0x9CFF3D]), 1.0);
        const silk = this._mat(0xE8E8E0, { roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.5 });
        // Eight legs where the fingers should be, and eyes on the back of it.
        this._fist(group, chitin, { width: 0.062, knuckleR: 0.011, fingers: false, cuff: 0.036 });
        const legs = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < legs; i++) {
          const a = -0.9 + (i / (legs - 1)) * 1.8;
          const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.005, 0.05, this.seg(6, 4)), chitin);
          upper.position.set(Math.sin(a) * 0.035, 0.07, 0.02);
          upper.rotation.z = -a * 1.2;
          group.add(upper);
          const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.0035, 0.05, this.seg(6, 4)), chitin);
          lower.position.set(Math.sin(a) * 0.07, 0.085, 0.03);
          lower.rotation.z = -a * 1.9;
          lower.userData.sway = { axis: 'z', amp: 0.1, freq: 2.0 + i * 0.2, phase: i };
          group.add(lower);
          if (this.wantsTrim()) {
            const bristle = new THREE.Mesh(new THREE.ConeGeometry(0.002, 0.01, 3), hair);
            bristle.position.set(Math.sin(a) * 0.05, 0.082, 0.026);
            bristle.rotation.z = -a;
            group.add(bristle);
          }
        }
        const eyes = this.isLowDetail() ? 4 : 6;
        for (let i = 0; i < eyes; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), eyeMat);
          e.position.set(-0.02 + (i % 3) * 0.02, 0.03 - Math.floor(i / 3) * 0.016, 0.028);
          e.userData.pulse = { min: 0.3, max: 1.2, freq: 0.6 + i * 0.15, phase: i };
          group.add(e);
        }
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.09, this.seg(5, 3)), silk);
        strand.position.set(0.02, -0.09, 0.02);
        strand.userData.sway = { axis: 'z', amp: 0.15, freq: 0.8 };
        group.add(strand);
        return group;
      },

      // ---- Plant ---------------------------------------------------------
      createUnarmedPlantModel(weapon, rand) {
        const group = new THREE.Group();
        const stem = this._mat(0x4E7A3A, { roughness: 0.75, metalness: 0.03 });
        const leafColor = this.getRandomColor(rand, [0x5CB03A, 0x8AB03A, 0x3A8A5A]);
        const leaf = this._mat(leafColor, { roughness: 0.6, metalness: 0.04 });
        const thorn = this._mat(0x2A3A1C, { roughness: 0.5, metalness: 0.1 });
        // A bundle of stems bound into a club, with thorns instead of nails
        // and a flower that has no business being there.
        this._fist(group, stem, { width: 0.076, knuckleR: 0.014, fingers: false, cuff: 0.046 });
        for (let i = 0; i < 4; i++) {
          const x = -0.028 + i * 0.019;
          const shoot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.05, this.seg(7, 5)), stem);
          shoot.position.set(x, 0.08, 0.024);
          shoot.rotation.set(-0.2, 0, (i - 1.5) * 0.15);
          group.add(shoot);
          const th = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.018, this.seg(5, 4)), thorn);
          th.position.set(x + (i - 1.5) * 0.005, 0.108, 0.026);
          group.add(th);
        }
        const fronds = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < fronds; i++) {
          const a = (i / fronds) * Math.PI * 2;
          const f = this._plate([[0, 0], [0.02, 0.014], [0.03, 0.042], [0.005, 0.032]], 0.003, leaf);
          f.position.set(Math.cos(a) * 0.03, 0.01, 0.024);
          f.rotation.set(0, -a, 0.3);
          f.userData.sway = { axis: 'z', amp: 0.14, freq: 1.0 + i * 0.2, phase: i };
          group.add(f);
        }
        for (let i = 0; i < 4; i++) {
          const vine = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.004, this.seg(4, 3), this.seg(12, 7)), leaf);
          vine.rotation.set(Math.PI / 2 + 0.2, 0, i * 0.6);
          vine.position.y = -0.04 - i * 0.018;
          vine.scale.z = 0.74;
          group.add(vine);
        }
        return group;
      },

      // ---- Elemental -----------------------------------------------------
      createUnarmedElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const coreColor = this.getRandomColor(rand, [0xFF6A1A, 0x4FC3F7, 0x8AFF6A, 0xC77DFF]);
        const core = this._glow(coreColor, 1.4);
        const shell = this._mat(coreColor, {
          roughness: 0.2, metalness: 0.2, emissive: coreColor, emissiveIntensity: 0.6,
          transparent: true, opacity: 0.35
        });
        // There is no hand: there is a shape that keeps being a hand, and a
        // core doing the keeping.
        this._fist(group, shell, { width: 0.082, knuckleR: 0.015, fingers: false, cuff: 0.046 });
        const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.024, 0), core);
        heart.position.set(0, 0.03, 0.014);
        heart.userData.spin = { axis: 'y', speed: 1.0 };
        heart.userData.pulse = { min: 0.5, max: 1.6, freq: 1.4 };
        group.add(heart);
        this._uAura(group, core, { count: 3, radius: 0.05, y: 0.03, z: 0.014 });
        const shards = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < shards; i++) {
          const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.008, 0), core);
          sh.position.set(0, 0.03, 0.014);
          sh.userData.orbit = { radius: 0.06 + i * 0.005, speed: 0.9 + i * 0.25, phase: i * 1.3, plane: i % 2 ? 'xz' : 'xy' };
          sh.userData.pulse = { min: 0.2, max: 1.3, freq: 1.8, phase: i };
          group.add(sh);
        }
        return group;
      },

      // ---- AquaticFish ---------------------------------------------------
      createUnarmedFishModel(weapon, rand) {
        const group = new THREE.Group();
        const scaleColor = this.getRandomColor(rand, [0x3A7A9A, 0x2A5A7A, 0x7A9A3A]);
        const scale = this._mat(scaleColor, { roughness: 0.25, metalness: 0.6 });
        const belly = this._mat(0xD8DCE0, { roughness: 0.3, metalness: 0.4 });
        const finMat = this._mat(scaleColor, { roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.65 });
        // A fin, not a fist: rayed, webbed, and with a row of spines along the
        // leading edge.
        this._fist(group, scale, { width: 0.07, knuckleR: 0.012, fingers: false, cuff: 0.042 });
        this._uPlates(group, belly, { rows: 3, per: 4, size: 0.009 });
        const rays = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < rays; i++) {
          const a = -0.7 + (i / (rays - 1)) * 1.4;
          const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.004, 0.07, this.seg(6, 4)), scale);
          ray.position.set(Math.sin(a) * 0.035, 0.09, 0.02);
          ray.rotation.z = -a;
          group.add(ray);
          if (i < rays - 1) {
            const webbing = this._plate([[0, 0], [0.018, 0.006], [0.02, 0.06], [0.002, 0.066]], 0.001, finMat);
            webbing.position.set(Math.sin(a) * 0.035, 0.056, 0.02);
            webbing.rotation.z = -a;
            group.add(webbing);
          }
        }
        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, this.seg(6, 4)), scale);
        spine.position.set(-0.04, 0.05, 0.02);
        spine.rotation.z = 0.9;
        group.add(spine);
        return group;
      },

      // ---- Octopus -------------------------------------------------------
      createUnarmedOctopusModel(weapon, rand) {
        const group = new THREE.Group();
        const skinColor = this.getRandomColor(rand, [0x8B4A6B, 0x6B4A8B, 0xC86B4A]);
        const skin = this._mat(skinColor, { roughness: 0.4, metalness: 0.1 });
        const sucker = this._mat(0xE8C8C0, { roughness: 0.5, metalness: 0.05 });
        // No hand: a knot of arms, each of which grips on its own.
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.042, this.seg(13, 8), this.seg(9, 6)), skin);
        bulb.position.y = 0.01;
        bulb.userData.bob = { axis: 'y', amp: 0.008, freq: 0.8 };
        group.add(bulb);
        const arms = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          const segs = this.isLowDetail() ? 3 : 5;
          for (let j = 0; j < segs; j++) {
            const t = j / segs;
            const seg = new THREE.Mesh(new THREE.SphereGeometry(0.012 - t * 0.007, this.seg(8, 5), this.seg(6, 4)), skin);
            seg.position.set(
              Math.cos(a) * (0.035 + t * 0.045),
              0.03 + Math.sin(t * 2.4) * 0.05,
              0.02 + Math.sin(a) * (0.02 + t * 0.02));
            seg.userData.sway = { axis: 'z', amp: 0.1 * t, freq: 1.0 + i * 0.15, phase: i + j * 0.4 };
            group.add(seg);
            if (j % 2 === 0 && this.wantsTrim()) {
              const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.002, this.seg(8, 5)), sucker);
              s.position.copy(seg.position);
              s.position.z += 0.01;
              s.rotation.x = Math.PI / 2;
              group.add(s);
            }
          }
        }
        return group;
      },

      // ---- Robot ---------------------------------------------------------
      createUnarmedRobotModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0xB0B6BC, 0xC0392B, 0x2E3238]), { roughness: 0.3, metalness: 0.9 });
        const joint = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.8 });
        const led = this._glow(0x4FE3FF, 1.1);
        // Machined: servo knuckles, exposed cabling, and a status light that
        // says it is ready.
        this._fist(group, shell, { width: 0.086, knuckleR: 0.015, fingers: false, cuff: 0.05, cuffMat: joint });
        for (let f = 0; f < 4; f++) {
          const x = -0.031 + f * 0.0207;
          for (let j = 0; j < 2; j++) {
            const seg = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.016, 0.018), shell);
            seg.position.set(x, 0.062 - j * 0.004, 0.03 + j * 0.018);
            seg.rotation.x = 0.5 + j * 0.4;
            group.add(seg);
          }
          const servo = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.02, this.seg(9, 6)), joint);
          servo.rotation.z = Math.PI / 2;
          servo.position.set(x, 0.062, 0.016);
          group.add(servo);
        }
        const cables = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < cables; i++) {
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, this.seg(4, 3), this.seg(10, 6), Math.PI), joint);
          c.position.set(-0.02 + i * 0.014, -0.03, 0.02);
          c.rotation.set(0.4, 0, 0.6 + i);
          group.add(c);
        }
        const status = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.004), led);
        status.position.set(0, 0.026, 0.028);
        status.userData.pulse = { min: 0.2, max: 1.2, freq: 1.6 };
        group.add(status);
        return group;
      },

      // ---- Bird ----------------------------------------------------------
      createUnarmedBirdModel(weapon, rand) {
        const group = new THREE.Group();
        const scaleMat = this._mat(0xC8A030, { roughness: 0.55, metalness: 0.25 });
        const talon = this._mat(0x2A241C, { roughness: 0.45, metalness: 0.25 });
        const featherColor = this.getRandomColor(rand, [0x6B4A2A, 0x2A2A2E, 0xC8C0B0]);
        const feather = this._mat(featherColor, { roughness: 0.95, metalness: 0.03 });
        // A raptor's foot: three toes forward, one back, and feathering up the
        // leg above the scales.
        this._fist(group, scaleMat, { width: 0.062, knuckleR: 0.011, fingers: false, cuff: 0.04, cuffMat: feather });
        for (let i = 0; i < 3; i++) {
          const a = -0.55 + i * 0.55;
          const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.055, this.seg(7, 5)), scaleMat);
          toe.position.set(Math.sin(a) * 0.03, 0.07, 0.03);
          toe.rotation.set(-0.4, 0, -a);
          group.add(toe);
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, this.seg(6, 4)), talon);
          claw.position.set(Math.sin(a) * 0.05, 0.09, 0.05);
          claw.rotation.set(1.3, 0, -a);
          group.add(claw);
        }
        const hallux = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.04, this.seg(7, 5)), scaleMat);
        hallux.position.set(0, 0.05, -0.02);
        hallux.rotation.x = 0.6;
        group.add(hallux);
        const backClaw = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.032, this.seg(6, 4)), talon);
        backClaw.position.set(0, 0.058, -0.045);
        backClaw.rotation.x = -1.5;
        group.add(backClaw);
        const feathers = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < feathers; i++) {
          const a = (i / feathers) * Math.PI * 2;
          const f = this._plate([[0, 0], [0.008, -0.02], [0, -0.055], [-0.008, -0.02]], 0.002, feather);
          f.position.set(Math.cos(a) * 0.026, -0.05, Math.sin(a) * 0.02);
          f.rotation.set(0, -a, 0);
          f.userData.sway = { axis: 'z', amp: 0.12, freq: 1.2, phase: i };
          group.add(f);
        }
        return group;
      },

      // ---- Reptilian -----------------------------------------------------
      createUnarmedReptilianModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x4A7A3A, 0x7A6A3A, 0x3A5A6A]);
        const hide = this._mat(hideColor, { roughness: 0.5, metalness: 0.25 });
        const belly = this._mat(0xD8D0A0, { roughness: 0.55, metalness: 0.15 });
        const claw = this._mat(0x2A241C, { roughness: 0.5, metalness: 0.2 });
        this._fist(group, hide, { width: 0.084, knuckleR: 0.015, fingers: false, cuff: 0.048 });
        this._uPlates(group, hide, { rows: 4, per: 4, size: 0.01 });
        this._uClaws(group, claw, { length: 0.032, radius: 0.007, curl: 0.85, y: 0.074, z: 0.038 });
        // The paler belly scales, in bands round the wrist.
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, this.seg(4, 3), this.seg(12, 7)), belly);
          band.rotation.x = Math.PI / 2;
          band.position.y = -0.045 - i * 0.018;
          band.scale.z = 0.74;
          group.add(band);
        }
        const dewlap = this._plate([[0, 0], [0.02, -0.03], [0.004, -0.06], [-0.014, -0.02]], 0.003, belly);
        dewlap.position.set(0.03, -0.02, 0.02);
        dewlap.userData.sway = { axis: 'z', amp: 0.1, freq: 1.1 };
        group.add(dewlap);
        return group;
      },

      // ---- Mushroom ------------------------------------------------------
      createUnarmedMushroomModel(weapon, rand) {
        const group = new THREE.Group();
        const capColor = this.getRandomColor(rand, [0xC0392B, 0x8B5A2B, 0x6B4A8B]);
        const cap = this._mat(capColor, { roughness: 0.7, metalness: 0.04 });
        const flesh = this._mat(0xE8E0D0, { roughness: 0.85, metalness: 0.02 });
        const spore = this._glow(0x9CFF6A, 0.7);
        // The hand is a stipe with a cap on it, and the gills underneath are
        // where the spores come from.
        const stipe = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.09, this.seg(11, 7)), flesh);
        stipe.position.y = 0.0;
        group.add(stipe);
        const capMesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, this.seg(14, 8), this.seg(9, 6), 0, Math.PI * 2, 0, Math.PI / 2), cap);
        capMesh.position.y = 0.05;
        capMesh.scale.y = 0.75;
        group.add(capMesh);
        const gills = this.isLowDetail() ? 5 : 10;
        for (let i = 0; i < gills; i++) {
          const a = (i / gills) * Math.PI * 2;
          const g = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.002), flesh);
          g.position.set(Math.cos(a) * 0.034, 0.046, Math.sin(a) * 0.034);
          g.rotation.y = -a;
          group.add(g);
        }
        const warts = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < warts; i++) {
          const w = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(7, 5), this.seg(5, 4)), flesh);
          const a = rand() * Math.PI * 2, r = rand() * 0.04;
          w.position.set(Math.cos(a) * r, 0.075 - r * 0.3, Math.sin(a) * r);
          group.add(w);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(12, 7)), flesh);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.02;
        group.add(ring);
        const puffs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < puffs; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), spore);
          p.position.set(0, 0.04, 0);
          p.userData.orbit = { radius: 0.05 + i * 0.006, speed: 0.4 + i * 0.2, phase: i * 1.5, plane: 'xz' };
          p.userData.bob = { axis: 'y', amp: 0.02, freq: 0.5, phase: i };
          p.userData.pulse = { min: 0.1, max: 0.9, freq: 1.0, phase: i };
          group.add(p);
        }
        return group;
      },

      // ---- Tree ----------------------------------------------------------
      createUnarmedTreeModel(weapon, rand) {
        const group = new THREE.Group();
        const bark = this._wood(this.getRandomColor(rand, [0x5B4227, 0x6E4A2A, 0x3A2A1C]));
        const heart = this._wood(0xC8A870);
        const leaf = this._mat(0x4E9A3A, { roughness: 0.6, metalness: 0.04 });
        // A branch that has grown into the shape of a hand, complete with
        // bark, a knot and this year's leaves.
        this._fist(group, bark, { width: 0.09, knuckleR: 0.017, fingers: false, cuff: 0.055 });
        for (let f = 0; f < 4; f++) {
          const x = -0.032 + f * 0.021;
          const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.06, this.seg(7, 5)), bark);
          twig.position.set(x, 0.082, 0.024);
          twig.rotation.set(-0.25, 0, (f - 1.5) * 0.18);
          group.add(twig);
          const split = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.026, this.seg(6, 4)), heart);
          split.position.set(x + (f - 1.5) * 0.006, 0.116, 0.028);
          group.add(split);
        }
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(10, 6), this.seg(7, 5)), heart);
        knot.scale.set(1, 1, 0.4);
        knot.position.set(-0.01, 0.02, 0.028);
        group.add(knot);
        const ridges = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < ridges; i++) {
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.09, 0.008), bark);
          r.position.set(-0.03 + i * 0.012, -0.01, 0.026);
          r.rotation.z = (rand() - 0.5) * 0.2;
          group.add(r);
        }
        for (let i = 0; i < 3; i++) {
          const l = this._plate([[0, 0], [0.02, 0.014], [0.03, 0.04], [0.005, 0.03]], 0.003, leaf);
          l.position.set(-0.03 + i * 0.03, 0.06, -0.03);
          l.rotation.set(0, i * 1.1, 0.3);
          l.userData.sway = { axis: 'z', amp: 0.14, freq: 1.0 + i * 0.2, phase: i };
          group.add(l);
        }
        return group;
      },

      // ---- Bacterial -----------------------------------------------------
      createUnarmedBacterialModel(weapon, rand) {
        const group = new THREE.Group();
        const cultureColor = this.getRandomColor(rand, [0x8AC83A, 0xC8A03A, 0xC83A8A]);
        const culture = this._mat(cultureColor, { roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.7 });
        const nucleus = this._glow(cultureColor, 1.0);
        const membrane = this._mat(cultureColor, { roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.25 });
        // A colony rather than a limb: cells that hold the shape between them
        // and keep dividing while they do it.
        const cells = this.isLowDetail() ? 7 : 14;
        for (let i = 0; i < cells; i++) {
          const a = (i / cells) * Math.PI * 2;
          const r = 0.026 + (i % 3) * 0.008;
          const cell = new THREE.Mesh(new THREE.SphereGeometry(0.014 - (i % 3) * 0.002, this.seg(9, 6), this.seg(7, 5)), culture);
          cell.scale.z = 0.8;
          cell.position.set(Math.cos(a) * r, 0.03 + Math.sin(a) * r * 0.9, 0.018 + (i % 2) * 0.01);
          cell.userData.bob = { axis: 'y', amp: 0.006, freq: 0.8 + (i % 4) * 0.2, phase: i * 0.7 };
          cell.userData.pulse = { min: 0.6, max: 1.0, freq: 0.5, phase: i };
          group.add(cell);
          if (i % 4 === 0) {
            const n = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), nucleus);
            n.position.copy(cell.position);
            n.userData.pulse = { min: 0.2, max: 1.2, freq: 1.4, phase: i };
            group.add(n);
          }
        }
        const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.052, this.seg(14, 8), this.seg(10, 6)), membrane);
        envelope.scale.set(1, 1.1, 0.8);
        envelope.position.y = 0.03;
        envelope.userData.bob = { axis: 'y', amp: 0.008, freq: 0.6 };
        group.add(envelope);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.05, this.seg(12, 7)), culture);
        stalk.position.y = -0.05;
        group.add(stalk);
        return group;
      },

      // ---- DoubleHeadedHumanoid ------------------------------------------
      createUnarmedDoubleHeadedModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0x9A7A6A, 0xC9A08A, 0x7A6A5A]), { roughness: 0.85, metalness: 0.02 });
        const nail = this._mat(0xE0D6C0, { roughness: 0.6, metalness: 0.05 });
        // Two hands grown into one wrist: eight knuckles, and neither half
        // quite agrees with the other.
        for (const s of [-1, 1]) {
          const half = new THREE.Group();
          half.position.set(s * 0.032, 0.02, 0);
          half.rotation.z = s * 0.22;
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.046), skin);
          half.add(back);
          for (let i = 0; i < 4; i++) {
            const k = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(8, 5), this.seg(6, 4)), skin);
            k.position.set(-0.018 + i * 0.012, 0.04, 0.01);
            half.add(k);
            const n = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, this.seg(6, 4)), nail);
            n.position.set(-0.018 + i * 0.012, 0.052, 0.028);
            n.rotation.x = 0.9;
            half.add(n);
          }
          half.userData.sway = { axis: 'z', amp: 0.05, freq: 0.7 + (s > 0 ? 0.3 : 0), phase: s };
          group.add(half);
        }
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), skin);
        web.position.set(0, 0.01, 0);
        group.add(web);
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.05, this.seg(12, 7)), skin);
        wrist.position.y = -0.05;
        wrist.scale.z = 0.75;
        group.add(wrist);
        return group;
      },

      // ---- Serpent -------------------------------------------------------
      createUnarmedSerpentModel(weapon, rand) {
        const group = new THREE.Group();
        const scaleColor = this.getRandomColor(rand, [0x3A6B2A, 0x6B3A2A, 0x2A3A6B]);
        const scale = this._mat(scaleColor, { roughness: 0.35, metalness: 0.4 });
        const belly = this._mat(0xD8D0A0, { roughness: 0.5, metalness: 0.15 });
        const fang = this._mat(0xF0EDE4, { roughness: 0.4, metalness: 0.1 });
        const venom = this._glow(0x9CFF3D, 0.9);
        // No hand at all: the arm ends in a head, and the strike is a bite.
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.08, this.seg(11, 7)), scale);
        neck.position.y = -0.02;
        group.add(neck);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(12, 7), this.seg(9, 6)), scale);
        head.scale.set(1, 0.8, 1.5);
        head.position.set(0, 0.05, 0.02);
        group.add(head);
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.04, this.seg(9, 6)), scale);
        snout.position.set(0, 0.046, 0.062);
        snout.rotation.x = Math.PI / 2;
        group.add(snout);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.05), scale);
        jaw.position.set(0, 0.03, 0.05);
        jaw.rotation.x = 0.35;
        jaw.userData.sway = { axis: 'x', amp: 0.14, freq: 0.8 };
        group.add(jaw);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), venom);
          eye.position.set(s * 0.02, 0.06, 0.03);
          eye.userData.pulse = { min: 0.4, max: 1.2, freq: 1.6, phase: s };
          group.add(eye);
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.026, this.seg(6, 4)), fang);
          f.position.set(s * 0.012, 0.026, 0.062);
          f.rotation.x = Math.PI - 0.3;
          group.add(f);
        }
        const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.04, this.seg(5, 3)), venom);
        tongue.position.set(0, 0.032, 0.09);
        tongue.rotation.x = Math.PI / 2;
        tongue.userData.sway = { axis: 'y', amp: 0.4, freq: 3.0 };
        group.add(tongue);
        for (let i = 0; i < 3; i++) {
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, this.seg(4, 3), this.seg(12, 7)), belly);
          band.rotation.x = Math.PI / 2;
          band.position.y = -0.04 - i * 0.02;
          group.add(band);
        }
        return group;
      },

      // ---- Golem ---------------------------------------------------------
      createUnarmedGolemModel(weapon, rand) {
        const group = new THREE.Group();
        const stone = this._mat(this.getRandomColor(rand, [0x76797E, 0x8A7A6A, 0x6A6259]), { roughness: 0.96, metalness: 0.05 });
        const seam = this._glow(this.getRandomColor(rand, [0xFF8A1A, 0x4FC3F7]), 0.9);
        const grit = this._mat(0x3A3530, { roughness: 1.0, metalness: 0.0 });
        // Hewn rather than grown: blocks with mortar lines between them, and
        // whatever animates it showing through the gaps.
        for (let f = 0; f < 4; f++) {
          const x = -0.033 + f * 0.022;
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.026, 0.03), stone);
          block.position.set(x, 0.062, 0.024);
          block.rotation.z = (rand() - 0.5) * 0.14;
          group.add(block);
        }
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.085, 0.055), stone);
        back.position.y = 0.02;
        group.add(back);
        const chunks = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < chunks; i++) {
          const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.016 + rand() * 0.01, 0), stone);
          c.position.set((rand() - 0.5) * 0.09, (rand() - 0.5) * 0.08, 0.03);
          c.rotation.set(rand(), rand(), rand());
          group.add(c);
        }
        const seams = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < seams; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05 + rand() * 0.04, 0.06), seam);
          s.position.set(-0.03 + rand() * 0.06, 0.02, 0.01);
          s.rotation.z = (rand() - 0.5) * 1.2;
          s.userData.pulse = { min: 0.1, max: 1.1, freq: 0.6 + rand() * 0.4, phase: i * 1.3 };
          group.add(s);
        }
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.06, 6), stone);
        wrist.position.y = -0.06;
        group.add(wrist);
        const dust = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(7, 5), this.seg(5, 4)), grit);
        dust.position.set(0.02, -0.09, 0.02);
        dust.userData.bob = { axis: 'y', amp: 0.02, freq: 0.6 };
        group.add(dust);
        return group;
      },

      // ---- Demon ---------------------------------------------------------
      createUnarmedDemonModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x8B1A1A, 0x4A1A2A, 0x2A1A3A]);
        const hide = this._mat(hideColor, { roughness: 0.55, metalness: 0.2 });
        const horn = this._mat(0x1A1418, { roughness: 0.4, metalness: 0.3 });
        const hell = this._glow(0xFF3A1A, 1.3);
        // Wrong in the proportions: too many joints in the fingers, claws that
        // came through the skin, and something burning under it.
        this._fist(group, hide, { width: 0.09, knuckleR: 0.016, fingers: false, cuff: 0.052 });
        for (let f = 0; f < 4; f++) {
          const x = -0.032 + f * 0.021;
          for (let j = 0; j < 2; j++) {
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.009 - j * 0.002, 0.011 - j * 0.002, 0.03, this.seg(7, 5)), hide);
            seg.position.set(x, 0.07 + j * 0.006, 0.026 + j * 0.024);
            seg.rotation.x = Math.PI / 2 - 0.5 - j * 0.4;
            group.add(seg);
          }
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, this.seg(6, 4)), horn);
          claw.position.set(x, 0.078, 0.078);
          claw.rotation.x = 1.3;
          group.add(claw);
        }
        const brands = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < brands; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.008), hell);
          b.position.set((rand() - 0.5) * 0.06, 0.04 - i * 0.018, 0.03);
          b.rotation.z = (rand() - 0.5) * 1.0;
          b.userData.pulse = { min: 0.15, max: 1.4, freq: 1.2 + i * 0.2, phase: i * 1.1 };
          group.add(b);
        }
        const spur = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.05, this.seg(6, 4)), horn);
        spur.position.set(-0.044, -0.02, 0);
        spur.rotation.z = 1.4;
        group.add(spur);
        return group;
      },

      // ---- Ghost ---------------------------------------------------------
      createUnarmedGhostModel(weapon, rand) {
        const group = new THREE.Group();
        const paleColor = this.getRandomColor(rand, [0xBFE8FF, 0xCFCFE8, 0xB8FFD8]);
        const pale = this._mat(paleColor, {
          roughness: 0.1, metalness: 0.0, emissive: paleColor, emissiveIntensity: 0.45,
          transparent: true, opacity: 0.34
        });
        const cold = this._glow(paleColor, 1.1);
        // Nothing solid to hit with. The hand keeps its shape as far as the
        // knuckles and gives up on the way to the wrist, where a wisp trails
        // off instead of an arm.
        this._fist(group, pale, { width: 0.08, knuckleR: 0.013, cuff: 0.03 });
        const tatters = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < tatters; i++) {
          const rag = this._plate([[0, 0], [0.014, -0.02], [0.004, -0.07], [-0.012, -0.03]], 0.001, pale);
          rag.position.set(-0.024 + i * 0.01, -0.06, 0.01 - (i % 3) * 0.012);
          rag.rotation.set(0, i * 0.9, (rand() - 0.5) * 0.5);
          rag.userData.sway = { axis: 'z', amp: 0.22, freq: 0.6 + i * 0.15, phase: i };
          group.add(rag);
        }
        const motes = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), cold);
          m.position.set(0, 0.02, 0.01);
          m.userData.orbit = { radius: 0.05 + i * 0.008, speed: 0.35 + i * 0.15, phase: i * 1.2, plane: i % 2 ? 'yz' : 'xy' };
          m.userData.pulse = { min: 0.05, max: 0.9, freq: 0.9 + i * 0.2, phase: i };
          group.add(m);
        }
        // The face it used to have, sunk into the back of the hand.
        const face = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(10, 6), this.seg(8, 5)), cold);
        face.scale.set(1, 1.2, 0.4);
        face.position.set(0, 0.024, 0.028);
        face.userData.pulse = { min: 0.1, max: 0.7, freq: 0.5 };
        group.add(face);
        return group;
      },

      // ---- Drone ---------------------------------------------------------
      createUnarmedDroneModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0xD8DCE0, 0x2E3238, 0x3A5A8A]), { roughness: 0.35, metalness: 0.85 });
        const rubber = this._mat(0x1A1C20, { roughness: 0.9, metalness: 0.05 });
        const lens = this._glow(0x4FE3FF, 1.2);
        // There is no arm above this, only a rotor. What a drone hits with is
        // the two-finger gripper it carries its cargo in.
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.05, this.seg(12, 7)), shell);
        hub.position.y = -0.03;
        group.add(hub);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), shell);
        body.position.y = 0.02;
        group.add(body);
        for (const s of [-1, 1]) {
          const jaw = this._plate([[0, 0], [s * 0.026, 0.03], [s * 0.02, 0.07], [s * 0.004, 0.04]], 0.02, shell);
          jaw.position.set(s * 0.014, 0.04, 0.014);
          jaw.userData.sway = { axis: 'z', amp: 0.08, freq: 0.9, phase: s > 0 ? 0 : Math.PI };
          group.add(jaw);
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.022), rubber);
          grip.position.set(s * 0.014, 0.086, 0.014);
          group.add(grip);
        }
        // The prop, still turning, because nothing has told it to stop.
        const blades = this.isLowDetail() ? 2 : 3;
        const rotor = new THREE.Group();
        for (let i = 0; i < blades; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.002, 0.014), shell);
          b.rotation.y = (i / blades) * Math.PI;
          rotor.add(b);
        }
        rotor.position.set(0, -0.058, 0);
        rotor.userData.spin = { axis: 'y', speed: 9.0 };
        group.add(rotor);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(9, 6), this.seg(7, 5)), lens);
        eye.position.set(0, 0.02, 0.03);
        eye.userData.pulse = { min: 0.3, max: 1.3, freq: 1.1 };
        group.add(eye);
        return group;
      },

      // ---- Voidspawn -----------------------------------------------------
      createUnarmedVoidspawnModel(weapon, rand) {
        const group = new THREE.Group();
        const nothing = this._mat(0x07060B, { roughness: 1.0, metalness: 0.0 });
        const rim = this._glow(this.getRandomColor(rand, [0x9C4DFF, 0x2AD8C0, 0xFF3A8A]), 1.2);
        const hide = this._mat(0x1A1424, { roughness: 0.6, metalness: 0.2 });
        // The hand is the hole. A fist-sized absence with an eye in it, and
        // the tendrils that come out of the absence do the actual reaching.
        const maw = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(13, 8), this.seg(10, 6)), nothing);
        maw.scale.set(1, 1.1, 0.8);
        maw.position.y = 0.03;
        group.add(maw);
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, this.seg(5, 3), this.seg(18, 10)), rim);
        halo.position.set(0, 0.03, 0.01);
        halo.userData.spin = { axis: 'z', speed: 0.5 };
        halo.userData.pulse = { min: 0.2, max: 1.4, freq: 0.8 };
        group.add(halo);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(11, 7), this.seg(8, 5)), rim);
        eye.position.set(0, 0.032, 0.03);
        eye.userData.pulse = { min: 0.4, max: 1.6, freq: 0.6 };
        group.add(eye);
        const tendrils = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < tendrils; i++) {
          const a = (i / tendrils) * Math.PI * 2;
          const links = this.isLowDetail() ? 3 : 4;
          for (let j = 0; j < links; j++) {
            const t = j / links;
            const link = new THREE.Mesh(new THREE.SphereGeometry(0.009 - t * 0.005, this.seg(8, 5), this.seg(6, 4)), hide);
            link.position.set(
              Math.cos(a) * (0.05 + t * 0.04),
              0.03 + Math.sin(a) * (0.04 + t * 0.03),
              0.02 + t * 0.02);
            link.userData.sway = { axis: 'z', amp: 0.12 * (t + 0.2), freq: 0.7 + i * 0.2, phase: i + j * 0.5 };
            group.add(link);
          }
        }
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.05, this.seg(11, 7)), hide);
        stump.position.y = -0.05;
        group.add(stump);
        return group;
      },

      // ---- Mutant --------------------------------------------------------
      createUnarmedMutantModel(weapon, rand) {
        const group = new THREE.Group();
        const flesh = this._mat(this.getRandomColor(rand, [0xB08A7A, 0x8A9A6A, 0xA07A8A]), { roughness: 0.9, metalness: 0.02 });
        const nail = this._mat(0xC8B89A, { roughness: 0.6, metalness: 0.05 });
        const eyeMat = this._glow(0xE8E840, 0.9);
        // A hand that kept going: six fingers where four would have done, a
        // second small one growing off the wrist, and eyes wherever there was
        // room for them.
        this._fist(group, flesh, { width: 0.09, knuckleR: 0.015, fingers: false, cuff: 0.05 });
        for (let i = 0; i < 6; i++) {
          const x = -0.04 + i * 0.016;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.04 + rand() * 0.02, this.seg(7, 5)), flesh);
          finger.position.set(x, 0.072, 0.03);
          finger.rotation.set(-0.3 - rand() * 0.4, 0, (i - 2.5) * 0.12);
          group.add(finger);
          const n = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.016, this.seg(6, 4)), nail);
          n.position.set(x + (i - 2.5) * 0.004, 0.104, 0.036);
          group.add(n);
        }
        // The extra limb, which has its own opinion about where to go.
        const extra = new THREE.Group();
        const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), flesh);
        extra.add(palm);
        for (let i = 0; i < 3; i++) {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.024, this.seg(6, 4)), flesh);
          d.position.set(-0.008 + i * 0.008, 0.022, 0.006);
          d.rotation.x = -0.4;
          extra.add(d);
        }
        extra.position.set(-0.05, -0.02, 0.02);
        extra.rotation.z = 0.8;
        extra.userData.sway = { axis: 'z', amp: 0.18, freq: 1.3 };
        group.add(extra);
        const eyes = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < eyes; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), eyeMat);
          e.position.set((rand() - 0.5) * 0.07, 0.01 + rand() * 0.05, 0.028);
          e.userData.pulse = { min: 0.2, max: 1.1, freq: 0.7 + i * 0.2, phase: i };
          group.add(e);
        }
        // The tail spike, come round the wrist from somewhere behind.
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.045, this.seg(7, 5)), nail);
        barb.position.set(0.04, -0.03, -0.02);
        barb.rotation.set(-0.6, 0, -1.1);
        group.add(barb);
        return group;
      },

      // ---- CrystalEntity -------------------------------------------------
      createUnarmedCrystalEntityModel(weapon, rand) {
        const group = new THREE.Group();
        const gemColor = this.getRandomColor(rand, [0x8ADFFF, 0xFF8AD8, 0xB0FF8A, 0xC8A8FF]);
        const gem = this._mat(gemColor, {
          roughness: 0.05, metalness: 0.25, emissive: gemColor, emissiveIntensity: 0.35,
          transparent: true, opacity: 0.72
        });
        const core = this._glow(gemColor, 1.4);
        const matrix = this._mat(0x4A4458, { roughness: 0.8, metalness: 0.1 });
        // Grown rather than shaped: spires out of a common matrix, with the
        // focus gem in the middle of them doing the aiming.
        const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04, 0), matrix);
        base.position.y = 0.01;
        group.add(base);
        const spires = this.isLowDetail() ? 5 : 9;
        for (let i = 0; i < spires; i++) {
          const a = (i / spires) * Math.PI * 2;
          const len = 0.05 + rand() * 0.05;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.011 + rand() * 0.006, len, this.seg(6, 4)), gem);
          sp.position.set(Math.cos(a) * 0.026, 0.04 + len * 0.35, 0.02 + Math.sin(a) * 0.018);
          sp.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
          group.add(sp);
        }
        const focus = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), core);
        focus.position.set(0, 0.03, 0.018);
        focus.userData.spin = { axis: 'y', speed: 0.7 };
        focus.userData.pulse = { min: 0.4, max: 1.6, freq: 1.0 };
        group.add(focus);
        if (this.wantsTrim()) this._uAura(group, core, { count: 2, radius: 0.052, y: 0.03, z: 0.016 });
        const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.012, 0), gem);
        shard.position.set(0, 0.03, 0.018);
        shard.userData.orbit = { radius: 0.06, speed: -0.6, plane: 'xz' };
        group.add(shard);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.05, 6), matrix);
        stalk.position.y = -0.05;
        group.add(stalk);
        return group;
      },

      // ---- Amphibian -----------------------------------------------------
      createUnarmedAmphibianModel(weapon, rand) {
        const group = new THREE.Group();
        const skinColor = this.getRandomColor(rand, [0x3A5A2A, 0x6A4A2A, 0x2A4A5A]);
        const skin = this._mat(skinColor, { roughness: 0.25, metalness: 0.12 });
        const belly = this._mat(0xE8A03A, { roughness: 0.3, metalness: 0.08 });
        const gillMat = this._mat(0xC85A6A, { roughness: 0.4, metalness: 0.05 });
        // A newt's hand rather than a frog's: four soft toes with no claws and
        // no grip discs, always wet, and one of them short because it is
        // still growing back.
        this._fist(group, skin, { width: 0.068, knuckleR: 0.011, fingers: false, cuff: 0.04 });
        for (let i = 0; i < 4; i++) {
          const x = -0.026 + i * 0.017;
          const len = i === 2 ? 0.026 : 0.05;
          const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, len, this.seg(8, 5)), skin);
          toe.position.set(x, 0.066 + len * 0.4, 0.026);
          toe.rotation.set(-0.25, 0, (i - 1.5) * 0.18);
          group.add(toe);
        }
        const spots = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < spots; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), belly);
          s.scale.z = 0.3;
          s.position.set((rand() - 0.5) * 0.06, 0.01 + rand() * 0.05, 0.027);
          group.add(s);
        }
        // External gills at the wrist, because it never finished changing.
        const gills = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < gills; i++) {
          const g = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, this.seg(6, 4)), gillMat);
          g.position.set(-0.03 + i * 0.02, -0.055, -0.02);
          g.rotation.set(0.6, 0, (i - 1.5) * 0.3);
          g.userData.sway = { axis: 'z', amp: 0.16, freq: 1.4, phase: i };
          group.add(g);
        }
        return group;
      },

      // ---- ConstructedUndead ---------------------------------------------
      createUnarmedConstructedUndeadModel(weapon, rand) {
        const group = new THREE.Group();
        const fleshA = this._mat(0x7A8A6A, { roughness: 0.92, metalness: 0.02 });
        const fleshB = this._mat(0x9A7A6A, { roughness: 0.92, metalness: 0.02 });
        const thread = this._mat(0x2A2418, { roughness: 1.0, metalness: 0.0 });
        const bolt = this._mat(0x8A8A94, { roughness: 0.35, metalness: 0.9 });
        const arc = this._glow(0x8ADFFF, 1.3);
        // Not one hand: parts of several, in two different colours of dead,
        // sewn at the seams and held to the wrist by a bolt that is still
        // carrying current.
        this._fist(group, fleshA, { width: 0.088, knuckleR: 0.015, fingers: false, cuff: 0.05, cuffMat: fleshB });
        for (let i = 0; i < 4; i++) {
          const x = -0.031 + i * 0.021;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.034, this.seg(7, 5)), i % 2 ? fleshB : fleshA);
          finger.position.set(x, 0.05, 0.038);
          finger.rotation.x = Math.PI / 2 - 0.3;
          group.add(finger);
        }
        const stitches = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < stitches; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.012, 0.004), thread);
          s.position.set(-0.036 + i * 0.009, 0.03 + Math.sin(i) * 0.012, 0.027);
          s.rotation.z = 0.5;
          group.add(s);
        }
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.003, 0.05), thread);
        seam.position.set(0, 0.03, 0.008);
        group.add(seam);
        for (const s of [-1, 1]) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.03, this.seg(9, 6)), bolt);
          b.rotation.z = Math.PI / 2;
          b.position.set(s * 0.034, -0.05, 0);
          group.add(b);
        }
        const spark = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), arc);
        spark.position.set(0, -0.05, 0.02);
        spark.userData.pulse = { min: 0.05, max: 1.6, freq: 3.2 };
        group.add(spark);
        return group;
      },

      // ---- Minotaur ------------------------------------------------------
      createUnarmedMinotaurModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x4A3020, 0x2A2018, 0x8A6A4A]), { roughness: 0.9, metalness: 0.03 });
        const horn = this._mat(0xD8CFB0, { roughness: 0.5, metalness: 0.1 });
        const brass = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.8 });
        // Twice the hand it needs to be. The knuckles are the size of another
        // creature's nails, and the nails are the beginnings of hooves.
        this._fist(group, hide, { width: 0.104, knuckleR: 0.02, fingers: false, cuff: 0.056 });
        for (let i = 0; i < 4; i++) {
          const x = -0.036 + i * 0.024;
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.017, this.seg(9, 6), this.seg(7, 5)), hide);
          k.position.set(x, 0.066, 0.03);
          group.add(k);
          const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.014, this.seg(8, 5)), horn);
          nail.position.set(x, 0.07, 0.05);
          nail.rotation.x = Math.PI / 2 - 0.4;
          group.add(nail);
        }
        // Shaggy fur past the wrist, matted into cords.
        const tufts = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < tufts; i++) {
          const a = (i / tufts) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, this.seg(5, 4)), hide);
          t.position.set(Math.cos(a) * 0.03, -0.08, Math.sin(a) * 0.022);
          t.rotation.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
          group.add(t);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(5, 3), this.seg(14, 8)), brass);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.052;
        group.add(ring);
        return group;
      },

      // ---- Goblin --------------------------------------------------------
      createUnarmedGoblinModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0x6A8A3A, 0x8A9A4A, 0x5A7A2A]), { roughness: 0.9, metalness: 0.03 });
        const nail = this._mat(0x6A5A3A, { roughness: 0.9, metalness: 0.05 });
        const loot = this._mat(0xC8A03A, { roughness: 0.3, metalness: 0.85 });
        const ragMat = this._mat(0x6A4A3A, { roughness: 1.0, metalness: 0.0 });
        // Small, and every knuckle on it has been broken at least once. The
        // rings are not his and neither is the string holding them on.
        this._fist(group, skin, { width: 0.066, knuckleR: 0.012, cuff: 0.038 });
        for (let i = 0; i < 4; i++) {
          const x = -0.024 + i * 0.016;
          const n = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.024, this.seg(6, 4)), nail);
          n.position.set(x, 0.058, 0.046);
          n.rotation.x = 1.1;
          group.add(n);
        }
        const rings = this.isLowDetail() ? 1 : 3;
        for (let i = 0; i < rings; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.003, this.seg(5, 3), this.seg(10, 6)), loot);
          r.position.set(-0.02 + i * 0.018, 0.05, 0.03);
          r.rotation.x = Math.PI / 2 - 0.3;
          group.add(r);
        }
        const wraps = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < wraps; i++) {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, this.seg(4, 3), this.seg(10, 6)), ragMat);
          w.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.4, 0, 0);
          w.position.y = -0.04 - i * 0.016;
          w.scale.z = 0.72;
          group.add(w);
        }
        const wart = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), skin);
        wart.position.set(0.018, 0.02, 0.028);
        group.add(wart);
        return group;
      },

      // ---- Crustacean ----------------------------------------------------
      createUnarmedCrustaceanModel(weapon, rand) {
        const group = new THREE.Group();
        const shellColor = this.getRandomColor(rand, [0xC0392B, 0xE07A3A, 0x3A6A8A]);
        const shell = this._mat(shellColor, { roughness: 0.25, metalness: 0.5 });
        const pale = this._mat(0xE8D8C0, { roughness: 0.4, metalness: 0.2 });
        // A claw, and the animal is built around it: one heavy crusher jaw,
        // one thin cutter, and a hinge that does not let go afterwards.
        const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.03, this.seg(11, 7), this.seg(8, 5)), shell);
        hinge.scale.set(1.2, 1, 0.8);
        hinge.position.y = -0.01;
        group.add(hinge);
        const crusher = this._plate([[0, 0], [0.04, 0.03], [0.032, 0.09], [0.004, 0.06]], 0.036, shell);
        crusher.position.set(0.012, 0.02, 0.014);
        group.add(crusher);
        const cutter = this._plate([[0, 0], [-0.026, 0.03], [-0.018, 0.1], [-0.002, 0.05]], 0.024, shell);
        cutter.position.set(-0.01, 0.02, 0.014);
        cutter.userData.sway = { axis: 'z', amp: 0.09, freq: 0.8 };
        group.add(cutter);
        const teeth = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < teeth; i++) {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.014, 3), pale);
          t.position.set(0.006, 0.04 + i * 0.012, 0.014);
          t.rotation.z = -1.4;
          group.add(t);
        }
        // The antennae, which is how it knows where the punch landed.
        for (const s of [-1, 1]) {
          const a = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.003, 0.07, this.seg(5, 3)), shell);
          a.position.set(s * 0.02, 0.03, -0.03);
          a.rotation.set(-0.5, 0, s * 0.5);
          a.userData.sway = { axis: 'x', amp: 0.14, freq: 1.6, phase: s };
          group.add(a);
        }
        const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.05, this.seg(10, 6)), shell);
        wrist.position.y = -0.055;
        group.add(wrist);
        return group;
      },

      // ---- Spherical -----------------------------------------------------
      createUnarmedSphericalModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0xB0B6BC, 0x8A5A2A, 0x3A3A44]), { roughness: 0.3, metalness: 0.8 });
        const dark = this._mat(0x1A1C22, { roughness: 0.7, metalness: 0.5 });
        const lens = this._glow(0xFF6A3A, 1.1);
        // Nothing about it is a hand. It is a ball on a bearing, and it hits
        // by being spun up and let go of.
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, this.isLowDetail() ? 0 : 1), shell);
        ball.position.y = 0.03;
        ball.userData.spin = { axis: 'y', speed: 3.4 };
        group.add(ball);
        const crown = new THREE.Group();
        const spines = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < spines; i++) {
          const a = (i / spines) * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(6, 4)), dark);
          sp.position.set(Math.cos(a) * 0.052, 0, Math.sin(a) * 0.052);
          sp.rotation.set(0, -a, -Math.PI / 2);
          crown.add(sp);
        }
        crown.position.y = 0.03;
        crown.userData.spin = { axis: 'y', speed: 3.4 };
        group.add(crown);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.006, this.seg(5, 3), this.seg(16, 9)), dark);
        band.position.y = 0.03;
        band.rotation.x = Math.PI / 2;
        group.add(band);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), lens);
        eye.position.set(0, 0.03, 0.05);
        eye.userData.pulse = { min: 0.2, max: 1.3, freq: 1.5 };
        group.add(eye);
        const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.05, this.seg(10, 6)), dark);
        gimbal.position.y = -0.05;
        group.add(gimbal);
        return group;
      },

      // ---- Turtle --------------------------------------------------------
      createUnarmedTurtleModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x5A6A3A, 0x6A5A3A, 0x3A5A5A]), { roughness: 0.9, metalness: 0.03 });
        const scute = this._mat(0x4A3A22, { roughness: 0.55, metalness: 0.15 });
        const claw = this._mat(0x2A241C, { roughness: 0.5, metalness: 0.2 });
        // A foreleg rather than an arm: short, heavy, and armoured on the back
        // with the same scutes as the shell.
        this._fist(group, hide, { width: 0.078, knuckleR: 0.014, fingers: false, cuff: 0.052 });
        const plates = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < plates; i++) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.008, 6), scute);
          p.rotation.x = Math.PI / 2;
          p.position.set(-0.022 + (i % 3) * 0.022, 0.05 - Math.floor(i / 3) * 0.03, 0.028);
          group.add(p);
        }
        this._uClaws(group, claw, { count: 3, length: 0.028, radius: 0.008, spread: 0.024, curl: 0.8, y: 0.07, z: 0.036 });
        // The loose skin that folds up when the leg goes back inside.
        for (let i = 0; i < 3; i++) {
          const fold = new THREE.Mesh(new THREE.TorusGeometry(0.032 + i * 0.002, 0.006, this.seg(4, 3), this.seg(12, 7)), hide);
          fold.rotation.x = Math.PI / 2;
          fold.position.y = -0.05 - i * 0.016;
          fold.scale.z = 0.78;
          group.add(fold);
        }
        return group;
      },

      // ---- Manticore -----------------------------------------------------
      createUnarmedManticoreModel(weapon, rand) {
        const group = new THREE.Group();
        const fur = this._mat(this.getRandomColor(rand, [0xB08040, 0x8A5A2A, 0x6A4A2A]), { roughness: 0.95, metalness: 0.02 });
        const pad = this._mat(0x4A2A28, { roughness: 0.9, metalness: 0.03 });
        const quill = this._mat(0x2A241C, { roughness: 0.4, metalness: 0.25 });
        // A lion's forepaw with the tail brought round over the top of it, so
        // the quills arrive at the same moment the paw does.
        this._fist(group, fur, { width: 0.094, knuckleR: 0.018, fingers: false, cuff: 0.054 });
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(9, 6), this.seg(7, 5)), pad);
          p.scale.set(1, 0.7, 1.1);
          p.position.set(-0.033 + i * 0.022, 0.062, 0.032);
          group.add(p);
        }
        const heel = new THREE.Mesh(new THREE.SphereGeometry(0.026, this.seg(11, 7), this.seg(8, 5)), pad);
        heel.scale.set(1.3, 0.6, 1);
        heel.position.set(0, 0.026, 0.038);
        group.add(heel);
        this._uClaws(group, quill, { length: 0.04, radius: 0.008, curl: 0.95, spread: 0.022, y: 0.074, z: 0.044 });
        const spikes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < spikes; i++) {
          const a = -0.7 + (i / (spikes - 1)) * 1.4;
          const q = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.05, this.seg(6, 4)), quill);
          q.position.set(Math.sin(a) * 0.05, -0.02 + Math.cos(a) * 0.02, -0.05);
          q.rotation.set(-1.3, 0, -a);
          q.userData.sway = { axis: 'x', amp: 0.08, freq: 1.1, phase: i };
          group.add(q);
        }
        // As much of the wing as reaches past the shoulder.
        if (this.wantsTrim()) {
          const membrane = this._plate([[0, 0], [0.05, -0.02], [0.07, -0.07], [0.01, -0.05]], 0.002, fur);
          membrane.position.set(-0.05, -0.05, -0.03);
          membrane.rotation.set(0, 0.7, 0.3);
          membrane.userData.sway = { axis: 'z', amp: 0.1, freq: 1.0 };
          group.add(membrane);
        }
        return group;
      },

      // ---- ChestMimic ----------------------------------------------------
      createUnarmedChestMimicModel(weapon, rand) {
        const group = new THREE.Group();
        const boxWood = this._wood(this.getRandomColor(rand, [0x6E4A2A, 0x4A3220, 0x8A6236]));
        const iron = this._mat(0x6A6A72, { roughness: 0.45, metalness: 0.8 });
        const tooth = this._mat(0xF0EDE4, { roughness: 0.4, metalness: 0.1 });
        const gum = this._mat(0x8A2A3A, { roughness: 0.75, metalness: 0.05 });
        // The hand is a small chest and it is not empty. The lid is the jaw,
        // the lock is the chin, and the tongue does the reaching.
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.07), boxWood);
        group.add(body);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.07), boxWood);
        lid.position.set(0, 0.06, -0.012);
        lid.rotation.x = -0.6;
        lid.userData.sway = { axis: 'x', amp: 0.16, freq: 1.1 };
        group.add(lid);
        const rows = [[0.032, 1], [0.05, -1]];
        for (let r = 0; r < rows.length; r++) {
          const n = this.isLowDetail() ? 4 : 7;
          for (let i = 0; i < n; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.02, this.seg(5, 4)), tooth);
            t.position.set(-0.036 + i * 0.012, rows[r][0], 0.026);
            t.rotation.x = rows[r][1] > 0 ? 0 : Math.PI;
            group.add(t);
          }
        }
        const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.07), gum);
        tongue.position.set(0, 0.03, 0.05);
        tongue.rotation.x = 0.3;
        tongue.userData.sway = { axis: 'x', amp: 0.2, freq: 1.6 };
        group.add(tongue);
        for (const s of [-1, 1]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.072), iron);
          band.position.set(s * 0.03, 0, 0);
          group.add(band);
        }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.008), iron);
        lock.position.set(0, 0.02, 0.037);
        group.add(lock);
        // The feet it walks on when nobody is looking, folded at the wrist.
        for (const s of [-1, 1]) {
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.02), gum);
          foot.position.set(s * 0.026, -0.045, 0.01);
          foot.userData.sway = { axis: 'z', amp: 0.14, freq: 1.4, phase: s };
          group.add(foot);
        }
        return group;
      },

      // ---- Phoenix -------------------------------------------------------
      createUnarmedPhoenixModel(weapon, rand) {
        const group = new THREE.Group();
        const emberColor = this.getRandomColor(rand, [0xFF6A1A, 0xFFB03A, 0xFF3A1A]);
        const feather = this._mat(emberColor, {
          roughness: 0.5, metalness: 0.1, emissive: emberColor, emissiveIntensity: 0.5
        });
        const talonMat = this._mat(0xC8A030, { roughness: 0.4, metalness: 0.6 });
        const fire = this._glow(0xFFD24A, 1.5);
        // A raptor's foot that is also on fire, which is the part of the bird
        // that comes through its own ending unchanged.
        this._fist(group, talonMat, { width: 0.06, knuckleR: 0.011, fingers: false, cuff: 0.04, cuffMat: feather });
        for (let i = 0; i < 3; i++) {
          const a = -0.6 + i * 0.6;
          const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.05, this.seg(7, 5)), talonMat);
          toe.position.set(Math.sin(a) * 0.03, 0.07, 0.03);
          toe.rotation.set(-0.4, 0, -a);
          group.add(toe);
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.032, this.seg(6, 4)), talonMat);
          c.position.set(Math.sin(a) * 0.05, 0.09, 0.05);
          c.rotation.set(1.3, 0, -a);
          group.add(c);
        }
        const plumes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < plumes; i++) {
          const a = (i / plumes) * Math.PI * 2;
          const f = this._plate([[0, 0], [0.01, -0.03], [0, -0.08], [-0.01, -0.03]], 0.002, feather);
          f.position.set(Math.cos(a) * 0.028, -0.04, Math.sin(a) * 0.022);
          f.rotation.set(0, -a, 0);
          f.userData.sway = { axis: 'z', amp: 0.18, freq: 1.4, phase: i };
          group.add(f);
        }
        const sparks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < sparks; i++) {
          const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), fire);
          s.position.set(0, 0.04, 0.02);
          s.userData.orbit = { radius: 0.05 + i * 0.007, speed: 1.2 + i * 0.2, phase: i * 1.1, plane: i % 2 ? 'xy' : 'yz' };
          s.userData.pulse = { min: 0.2, max: 1.7, freq: 2.2, phase: i };
          group.add(s);
        }
        return group;
      },

      // ---- Ogre ----------------------------------------------------------
      createUnarmedOgreModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0x8A9A6A, 0xA08A6A, 0x7A8A8A]), { roughness: 0.95, metalness: 0.02 });
        const nail = this._mat(0x8A7A5A, { roughness: 0.85, metalness: 0.05 });
        const rope = this._mat(0x8A6A3A, { roughness: 1.0, metalness: 0.0 });
        // Enormous and blunt, and it does not need to be sharp: there is more
        // of it than there is of whatever it lands on.
        this._fist(group, skin, { width: 0.115, knuckleR: 0.023, fingers: false, cuff: 0.06 });
        for (let i = 0; i < 4; i++) {
          const x = -0.04 + i * 0.026;
          const k = new THREE.Mesh(new THREE.SphereGeometry(0.021, this.seg(9, 6), this.seg(7, 5)), skin);
          k.position.set(x, 0.07, 0.028);
          group.add(k);
          const n = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.011, 0.008, this.seg(7, 5)), nail);
          n.position.set(x, 0.062, 0.056);
          n.rotation.x = Math.PI / 2;
          group.add(n);
        }
        const warts = this.isLowDetail() ? 3 : 8;
        for (let i = 0; i < warts; i++) {
          const w = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rand() * 0.005, this.seg(7, 5), this.seg(5, 4)), skin);
          w.position.set((rand() - 0.5) * 0.09, (rand() - 0.4) * 0.07, 0.03);
          group.add(w);
        }
        const knot = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, this.seg(5, 3), this.seg(12, 7)), rope);
        knot.rotation.x = Math.PI / 2;
        knot.position.y = -0.06;
        knot.scale.z = 0.8;
        group.add(knot);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.06, this.seg(6, 4)), rope);
        tail.position.set(0.04, -0.08, 0.02);
        tail.rotation.z = 0.5;
        tail.userData.sway = { axis: 'z', amp: 0.12, freq: 0.9 };
        group.add(tail);
        return group;
      },

      // ---- Scarecrow -----------------------------------------------------
      createUnarmedScarecrowModel(weapon, rand) {
        const group = new THREE.Group();
        const sack = this._mat(this.getRandomColor(rand, [0xC8A868, 0xA08858, 0xD8C088]), { roughness: 1.0, metalness: 0.0 });
        const straw = this._mat(0xE0C060, { roughness: 1.0, metalness: 0.0 });
        const pole = this._wood(0x6B4A2A);
        const thread = this._mat(0x3A2A1C, { roughness: 1.0, metalness: 0.0 });
        // A glove stuffed with straw on the end of a stick: the shape of a
        // hand held up by the stuffing, and shedding some of it every swing.
        this._fist(group, sack, { width: 0.082, knuckleR: 0.014, cuff: 0.03 });
        const stalks = this.isLowDetail() ? 5 : 11;
        for (let i = 0; i < stalks; i++) {
          const a = (i / stalks) * Math.PI * 2;
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.05 + rand() * 0.04, this.seg(4, 3)), straw);
          s.position.set(Math.cos(a) * 0.026, 0.07 + rand() * 0.02, 0.02 + Math.sin(a) * 0.016);
          s.rotation.set(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7);
          s.userData.sway = { axis: 'z', amp: 0.1, freq: 1.2 + i * 0.1, phase: i };
          group.add(s);
        }
        const seams = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < seams; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.01, 0.004), thread);
          st.position.set(-0.03 + i * 0.009, 0.03 + Math.sin(i * 1.4) * 0.014, 0.027);
          st.rotation.z = 0.6;
          group.add(st);
        }
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.1, this.seg(7, 5)), pole);
        stick.position.y = -0.09;
        group.add(stick);
        const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, this.seg(6, 4)), pole);
        cross.rotation.z = Math.PI / 2;
        cross.position.y = -0.06;
        group.add(cross);
        return group;
      },

      // ---- SegmentWorm ---------------------------------------------------
      createUnarmedSegmentWormModel(weapon, rand) {
        const group = new THREE.Group();
        const fleshColor = this.getRandomColor(rand, [0xC88A9A, 0x9A7A6A, 0xC0A08A]);
        const flesh = this._mat(fleshColor, { roughness: 0.6, metalness: 0.08 });
        const bandMat = this._mat(0x7A5A5A, { roughness: 0.8, metalness: 0.05 });
        const rasp = this._mat(0x2A241C, { roughness: 0.5, metalness: 0.3 });
        // No hand, and no wrist either: the limb is more worm, and it ends in
        // a ring of rasping mouthparts that opens on the way in.
        const segs = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03 - t * 0.006, 0.032 - t * 0.006, 0.024, this.seg(12, 7)), flesh);
          s.position.y = -0.07 + i * 0.026;
          s.userData.sway = { axis: 'z', amp: 0.04, freq: 1.1, phase: i * 0.6 };
          group.add(s);
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.03 - t * 0.006, 0.004, this.seg(4, 3), this.seg(12, 7)), bandMat);
          band.rotation.x = Math.PI / 2;
          band.position.y = -0.058 + i * 0.026;
          group.add(band);
        }
        const teeth = this.isLowDetail() ? 6 : 11;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.018, 3), rasp);
          t.position.set(Math.cos(a) * 0.02, 0.1, Math.sin(a) * 0.02);
          t.rotation.set(Math.sin(a) * 0.8, -a, -Math.cos(a) * 0.8);
          group.add(t);
        }
        const gullet = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.03, this.seg(12, 7), 1, true), rasp);
        gullet.position.y = 0.09;
        group.add(gullet);
        return group;
      },

      // ---- Mineral -------------------------------------------------------
      createUnarmedMineralModel(weapon, rand) {
        const group = new THREE.Group();
        const rock = this._mat(this.getRandomColor(rand, [0x6A6259, 0x4A4A52, 0x7A6A5A]), { roughness: 0.98, metalness: 0.06 });
        const oreColor = this.getRandomColor(rand, [0xC8A03A, 0x8ADFFF, 0xC85A5A]);
        const ore = this._mat(oreColor, { roughness: 0.2, metalness: 0.9, emissive: oreColor, emissiveIntensity: 0.2 });
        const crystal = this._mat(oreColor, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.7 });
        // Not carved into a hand the way a golem's is: a nodule broken off a
        // seam, and whichever face is forward is the one it hits with.
        const lumps = this.isLowDetail() ? 4 : 7;
        for (let i = 0; i < lumps; i++) {
          const l = new THREE.Mesh(new THREE.DodecahedronGeometry(0.022 + rand() * 0.016, 0), rock);
          l.position.set((rand() - 0.5) * 0.06, 0.01 + (rand() - 0.3) * 0.06, (rand() - 0.3) * 0.04);
          l.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          group.add(l);
        }
        const veins = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < veins; i++) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04 + rand() * 0.03, 0.004), ore);
          v.position.set((rand() - 0.5) * 0.07, 0.02 + (rand() - 0.5) * 0.05, 0.03);
          v.rotation.z = (rand() - 0.5) * 1.4;
          group.add(v);
        }
        const points = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < points; i++) {
          const a = (i / points) * Math.PI * 2;
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.035 + rand() * 0.02, 6), crystal);
          c.position.set(Math.cos(a) * 0.03, 0.05, 0.02 + Math.sin(a) * 0.02);
          c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
          group.add(c);
        }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.06, 7), rock);
        stem.position.y = -0.06;
        group.add(stem);
        return group;
      },

      // ---- Hydra ---------------------------------------------------------
      createUnarmedHydraModel(weapon, rand) {
        const group = new THREE.Group();
        const scaleColor = this.getRandomColor(rand, [0x2A6B4A, 0x4A2A6B, 0x6B4A2A]);
        const scale = this._mat(scaleColor, { roughness: 0.35, metalness: 0.4 });
        const maw = this._mat(0x8A2A3A, { roughness: 0.7, metalness: 0.05 });
        const fang = this._mat(0xF0EDE4, { roughness: 0.4, metalness: 0.1 });
        const eyeMat = this._glow(0xE8C83A, 1.0);
        // Three necks out of one wrist, and no agreement between them about
        // which of the three is going to do the biting.
        for (let i = 0; i < 3; i++) {
          const s = i - 1;
          const head = new THREE.Group();
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, this.seg(9, 6)), scale);
          head.add(neck);
          const skull = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(8, 5)), scale);
          skull.scale.set(1, 0.8, 1.4);
          skull.position.set(0, 0.042, 0.012);
          head.add(skull);
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, 0.032), maw);
          jaw.position.set(0, 0.03, 0.03);
          jaw.rotation.x = 0.4;
          jaw.userData.sway = { axis: 'x', amp: 0.18, freq: 1.2 + i * 0.4, phase: i };
          head.add(jaw);
          for (const t of [-1, 1]) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.018, this.seg(5, 4)), fang);
            f.position.set(t * 0.008, 0.03, 0.042);
            f.rotation.x = Math.PI - 0.3;
            head.add(f);
            const e = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(7, 5), this.seg(5, 4)), eyeMat);
            e.position.set(t * 0.013, 0.05, 0.02);
            e.userData.pulse = { min: 0.3, max: 1.2, freq: 1.4, phase: i + t };
            head.add(e);
          }
          head.position.set(s * 0.04, 0.03, s === 0 ? 0.02 : 0);
          head.rotation.z = -s * 0.45;
          head.userData.sway = { axis: 'z', amp: 0.12, freq: 0.8 + i * 0.3, phase: i * 1.4 };
          group.add(head);
        }
        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.038, 0.06, this.seg(12, 7)), scale);
        stump.position.y = -0.05;
        group.add(stump);
        // The stub of the fourth, which is on its way back.
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.014, this.seg(9, 6), this.seg(7, 5)), maw);
        bud.position.set(0, -0.01, -0.03);
        bud.userData.bob = { axis: 'y', amp: 0.006, freq: 1.0 };
        group.add(bud);
        return group;
      },

      // ---- Vampire -------------------------------------------------------
      createUnarmedVampireModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(0xE8E0DC, { roughness: 0.55, metalness: 0.05 });
        const nail = this._mat(0x2A1A20, { roughness: 0.25, metalness: 0.35 });
        const vein = this._mat(0x6A5A8A, { roughness: 0.7, metalness: 0.05 });
        const jewel = this._glow(this.getRandomColor(rand, [0x8B1A1A, 0x1A2A8B]), 0.8);
        const lace = this._mat(0x1A1418, { roughness: 0.9, metalness: 0.05 });
        // Kept: long, cold and manicured, the veins showing through because
        // there is nothing in them, and the cuff worth more than the hand.
        this._fist(group, skin, { width: 0.078, knuckleR: 0.012, fingers: false, cuff: 0.03, cuffMat: lace });
        for (let i = 0; i < 4; i++) {
          const x = -0.028 + i * 0.019;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.042, this.seg(8, 5)), skin);
          finger.position.set(x, 0.062, 0.034);
          finger.rotation.set(Math.PI / 2 - 0.5, 0, (i - 1.5) * 0.08);
          group.add(finger);
          const n = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.03, this.seg(6, 4)), nail);
          n.position.set(x, 0.07, 0.07);
          n.rotation.x = 1.4;
          group.add(n);
        }
        const veins = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < veins; i++) {
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.05, 0.003), vein);
          v.position.set(-0.026 + i * 0.013, 0.02, 0.027);
          v.rotation.z = (rand() - 0.5) * 0.4;
          group.add(v);
        }
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.004, this.seg(5, 3), this.seg(12, 7)), jewel);
        ring.position.set(-0.028, 0.05, 0.026);
        ring.rotation.x = Math.PI / 2 - 0.4;
        ring.userData.pulse = { min: 0.2, max: 1.0, freq: 0.7 };
        group.add(ring);
        if (this.wantsTrim()) {
          for (let i = 0; i < 3; i++) {
            const frill = this._plate([[0, 0], [0.03, -0.01], [0.026, -0.03], [0.002, -0.02]], 0.001, lace);
            frill.position.set(-0.03, -0.05 - i * 0.008, 0.01);
            frill.rotation.set(0, i * 1.1, 0.2);
            group.add(frill);
          }
        }
        return group;
      },

      // ---- Bat -----------------------------------------------------------
      createUnarmedBatModel(weapon, rand) {
        const group = new THREE.Group();
        const fur = this._mat(this.getRandomColor(rand, [0x3A2A2A, 0x2A2A3A, 0x5A4A3A]), { roughness: 0.98, metalness: 0.0 });
        const membrane = this._mat(0x6A4A4A, { roughness: 0.6, metalness: 0.05, transparent: true, opacity: 0.75 });
        const claw = this._mat(0x1A1418, { roughness: 0.45, metalness: 0.25 });
        // The hand IS the wing: four fingers drawn out into spars with skin
        // stretched between them, and only the thumb left over to hook with.
        const carpus = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(10, 6), this.seg(8, 5)), fur);
        carpus.position.y = -0.02;
        group.add(carpus);
        const spars = 4;
        for (let i = 0; i < spars; i++) {
          const a = -0.5 + (i / (spars - 1)) * 1.2;
          const len = 0.11 - i * 0.012;
          const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.004, len, this.seg(6, 4)), fur);
          spar.position.set(Math.sin(a) * len * 0.4, 0.02 + Math.cos(a) * len * 0.4, 0.012);
          spar.rotation.z = -a;
          group.add(spar);
          if (i < spars - 1) {
            const skin = this._plate([[0, 0], [0.03, 0.01], [0.026, 0.1], [0.002, 0.1]], 0.001, membrane);
            skin.position.set(Math.sin(a) * 0.02, 0, 0.012);
            skin.rotation.z = -a;
            skin.userData.sway = { axis: 'z', amp: 0.06, freq: 1.6, phase: i };
            group.add(skin);
          }
        }
        const thumb = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.03, this.seg(6, 4)), claw);
        thumb.position.set(0.03, 0.03, 0.024);
        thumb.rotation.set(0.9, 0, -0.7);
        group.add(thumb);
        const tufts = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < tufts; i++) {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02, this.seg(4, 3)), fur);
          t.position.set((rand() - 0.5) * 0.04, -0.04 - rand() * 0.03, 0.01);
          t.rotation.z = (rand() - 0.5) * 1.4;
          group.add(t);
        }
        const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.06, this.seg(9, 6)), fur);
        forearm.position.y = -0.06;
        group.add(forearm);
        return group;
      },

      // ---- Rabbit --------------------------------------------------------
      createUnarmedRabbitModel(weapon, rand) {
        const group = new THREE.Group();
        const fur = this._mat(this.getRandomColor(rand, [0xD8CFC0, 0x8A7A6A, 0x3A3430]), { roughness: 1.0, metalness: 0.0 });
        const pad = this._mat(0xC08A8A, { roughness: 0.85, metalness: 0.03 });
        const claw = this._mat(0x8A7A5A, { roughness: 0.6, metalness: 0.08 });
        // A forepaw, and it does not punch: it thumps, flat and fast, with
        // digging claws that were never meant for this.
        this._fist(group, fur, { width: 0.056, knuckleR: 0.01, fingers: false, cuff: 0.04 });
        for (let i = 0; i < 4; i++) {
          const toe = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), fur);
          toe.scale.set(1, 1.2, 1.1);
          toe.position.set(-0.02 + i * 0.013, 0.058, 0.03);
          group.add(toe);
        }
        const sole = new THREE.Mesh(new THREE.SphereGeometry(0.02, this.seg(10, 6), this.seg(7, 5)), pad);
        sole.scale.set(1.2, 0.5, 1);
        sole.position.set(0, 0.022, 0.032);
        group.add(sole);
        this._uClaws(group, claw, { count: 4, length: 0.02, radius: 0.004, spread: 0.013, curl: 1.0, y: 0.07, z: 0.036 });
        const fluff = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < fluff; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.016, this.seg(4, 3)), fur);
          f.position.set((rand() - 0.5) * 0.05, -0.04 - rand() * 0.04, (rand() - 0.5) * 0.03);
          f.rotation.set(rand(), 0, (rand() - 0.5) * 1.2);
          group.add(f);
        }
        return group;
      },

      // ---- ArmoredKnight -------------------------------------------------
      createUnarmedArmoredKnightModel(weapon, rand) {
        const group = new THREE.Group();
        const steel = this._mat(this.getRandomColor(rand, [0xB8BCC4, 0x8A8A94, 0x6A6A78]), { roughness: 0.28, metalness: 0.95 });
        const dark = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.8 });
        const rivet = this._mat(0xD8C88A, { roughness: 0.3, metalness: 0.9 });
        // A gauntlet with nobody in it: articulated lames over the knuckles,
        // a rolled cuff, and no hand under any of it.
        this._fist(group, steel, { width: 0.09, knuckleR: 0.016, fingers: false, cuff: 0.052, cuffMat: dark });
        for (let f = 0; f < 4; f++) {
          const x = -0.032 + f * 0.021;
          const lames = this.isLowDetail() ? 2 : 3;
          for (let j = 0; j < lames; j++) {
            const lame = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.012, 0.02), steel);
            lame.position.set(x, 0.066 - j * 0.006, 0.026 + j * 0.016);
            lame.rotation.x = 0.5 + j * 0.4;
            group.add(lame);
          }
          const stud = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.016, this.seg(6, 4)), steel);
          stud.position.set(x, 0.068, 0.012);
          stud.rotation.x = -0.4;
          group.add(stud);
        }
        this._rivets(group, rivet, 3, -0.03, 0.018, 0.004, 0.03);
        const roll = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, this.seg(5, 3), this.seg(14, 8)), steel);
        roll.rotation.x = Math.PI / 2;
        roll.position.y = -0.078;
        roll.scale.z = 0.8;
        group.add(roll);
        // The dark of the empty inside, seen down the wrist.
        const hollow = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, this.seg(11, 7)), dark);
        hollow.position.y = -0.08;
        group.add(hollow);
        return group;
      },

      // ---- Centaur -------------------------------------------------------
      createUnarmedCentaurModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0xC9A08A, 0x8A6248, 0xA07A5A]), { roughness: 0.88, metalness: 0.02 });
        const coat = this._mat(0x6B4A2A, { roughness: 1.0, metalness: 0.0 });
        const leather = this._mat(0x5A3A22, { roughness: 0.85, metalness: 0.05 });
        const brass = this._mat(0xC8A03A, { roughness: 0.35, metalness: 0.85 });
        // The top half is a person and the hand knows it. The coat starts at
        // the wrist, though, and the calluses are a bowman's.
        this._fist(group, skin, { width: 0.088, knuckleR: 0.015, cuff: 0.04, cuffMat: coat });
        const callus = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.006), skin);
        callus.position.set(0.03, 0.04, 0.028);
        group.add(callus);
        const hairs = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < hairs; i++) {
          const a = (i / hairs) * Math.PI * 2;
          const h = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.05, this.seg(4, 3)), coat);
          h.position.set(Math.cos(a) * 0.03, -0.075, Math.sin(a) * 0.022);
          h.rotation.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
          h.userData.sway = { axis: 'z', amp: 0.08, freq: 1.0, phase: i };
          group.add(h);
        }
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, this.seg(4, 3), this.seg(12, 7)), leather);
        strap.rotation.x = Math.PI / 2;
        strap.position.y = -0.05;
        strap.scale.z = 0.76;
        group.add(strap);
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.004), brass);
        buckle.position.set(0, -0.05, 0.03);
        group.add(buckle);
        return group;
      },

      // ---- InsectSwarm ---------------------------------------------------
      createUnarmedInsectSwarmModel(weapon, rand) {
        const group = new THREE.Group();
        const bug = this._mat(this.getRandomColor(rand, [0x3A2A1C, 0x1C2A3A, 0x5A4A1C]), { roughness: 0.4, metalness: 0.35 });
        const wingMat = this._mat(0xD8E0E8, { roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.3 });
        const sting = this._glow(0xE8C83A, 0.9);
        // Not one body. The swarm holds the shape of a fist for exactly as
        // long as the punch takes and comes apart again afterwards, so every
        // insect in it is its own mesh orbiting where the knuckles would be.
        const bugs = this.isLowDetail() ? 10 : 22;
        for (let i = 0; i < bugs; i++) {
          const a = (i / bugs) * Math.PI * 2;
          const r = 0.02 + (i % 4) * 0.011;
          const orbit = {
            radius: 0.008 + (i % 3) * 0.005,
            speed: 1.4 + (i % 5) * 0.4,
            phase: i * 0.9,
            plane: i % 3 === 0 ? 'xy' : (i % 3 === 1 ? 'xz' : 'yz')
          };
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(7, 5), this.seg(5, 4)), bug);
          b.scale.set(0.7, 0.7, 1.6);
          b.position.set(Math.cos(a) * r, 0.03 + Math.sin(a * 1.7) * 0.04, 0.016 + Math.sin(a) * r * 0.6);
          b.userData.orbit = orbit;
          group.add(b);
          if (this.wantsTrim() && i % 2 === 0) {
            const w = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0008, 0.006), wingMat);
            w.position.copy(b.position);
            w.position.y += 0.004;
            w.userData.orbit = { radius: orbit.radius, speed: orbit.speed, phase: orbit.phase, plane: orbit.plane };
            w.userData.sway = { axis: 'z', amp: 0.5, freq: 12, phase: i };
            group.add(w);
          }
        }
        // The few that are always out in front, mandibles first.
        const leaders = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < leaders; i++) {
          const l = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.018, this.seg(6, 4)), sting);
          l.position.set(-0.02 + i * 0.014, 0.06, 0.05);
          l.rotation.x = 1.4;
          l.userData.pulse = { min: 0.2, max: 1.1, freq: 2.0, phase: i };
          group.add(l);
        }
        const trail = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < trail; i++) {
          const t = new THREE.Mesh(new THREE.SphereGeometry(0.005, this.seg(6, 4), this.seg(5, 4)), bug);
          t.position.set((rand() - 0.5) * 0.05, -0.05 - i * 0.012, (rand() - 0.5) * 0.04);
          t.userData.bob = { axis: 'y', amp: 0.012, freq: 1.6, phase: i };
          group.add(t);
        }
        return group;
      },

      // ---- RoboticDefender -----------------------------------------------
      createUnarmedRoboticDefenderModel(weapon, rand) {
        const group = new THREE.Group();
        const shell = this._mat(this.getRandomColor(rand, [0x8A9AA8, 0x3A4A5A, 0xC0392B]), { roughness: 0.3, metalness: 0.9 });
        const dark = this._mat(0x22262C, { roughness: 0.55, metalness: 0.8 });
        const bore = this._glow(0x4FE3FF, 1.3);
        // The right arm never had a hand on it. The wrist is a breech and the
        // hand is the muzzle of the cannon bolted to it.
        const breech = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.06, this.seg(12, 7)), dark);
        breech.position.y = -0.04;
        group.add(breech);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.11, this.seg(12, 7)), shell);
        barrel.position.y = 0.05;
        group.add(barrel);
        const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, this.seg(12, 7), 1, true), shell);
        shroud.position.y = 0.03;
        group.add(shroud);
        const vents = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < vents; i++) {
          const a = (i / vents) * Math.PI * 2;
          const v = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.012), dark);
          v.position.set(Math.cos(a) * 0.036, 0.03, Math.sin(a) * 0.036);
          v.rotation.y = -a;
          group.add(v);
        }
        const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, this.seg(5, 3), this.seg(14, 8)), dark);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.y = 0.104;
        group.add(muzzle);
        const charge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, this.seg(11, 7)), bore);
        charge.position.y = 0.102;
        charge.userData.pulse = { min: 0.2, max: 1.6, freq: 1.2 };
        group.add(charge);
        const sensors = this.isLowDetail() ? 1 : 3;
        for (let i = 0; i < sensors; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(7, 5), this.seg(5, 4)), bore);
          s.position.set(-0.02 + i * 0.02, 0, 0.04);
          s.userData.pulse = { min: 0.1, max: 1.0, freq: 1.8, phase: i };
          group.add(s);
        }
        // The elbow actuator, still tracking whatever it was last told to.
        const servo = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, this.seg(9, 6)), dark);
        servo.rotation.z = Math.PI / 2;
        servo.position.y = -0.07;
        servo.userData.spin = { axis: 'x', speed: 0.8 };
        group.add(servo);
        return group;
      },

      // ---- Turret --------------------------------------------------------
      createUnarmedTurretModel(weapon, rand) {
        const group = new THREE.Group();
        const armour = this._mat(this.getRandomColor(rand, [0x6A7078, 0x3A4038, 0x8A6A3A]), { roughness: 0.45, metalness: 0.85 });
        const dark = this._mat(0x1C1E22, { roughness: 0.6, metalness: 0.7 });
        const lamp = this._glow(0xFF3A2A, 1.2);
        // A turret has no arm and no hand, so there is no fist to draw here:
        // what sits where the hand would be is the whole gun, pintle and all,
        // bolted to a traversing ring at the wrist.
        const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 0.05, this.seg(12, 7)), dark);
        mount.position.y = -0.05;
        group.add(mount);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, this.seg(5, 3), this.seg(14, 8)), armour);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.026;
        ring.userData.spin = { axis: 'y', speed: 0.6 };
        group.add(ring);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), armour);
        housing.position.y = 0.005;
        group.add(housing);
        const barrels = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < barrels; i++) {
          const a = (i / barrels) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, this.seg(9, 6)), dark);
          b.position.set(Math.cos(a) * 0.012, 0.07, Math.sin(a) * 0.012);
          group.add(b);
        }
        const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), dark);
        magazine.position.set(-0.046, 0, 0);
        group.add(magazine);
        const links = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < links; i++) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.012), armour);
          l.position.set(-0.046 + i * 0.004, -0.03 - i * 0.008, 0.01);
          l.rotation.z = i * 0.2;
          group.add(l);
        }
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, this.seg(9, 6), this.seg(7, 5)), lamp);
        eye.position.set(0, 0.02, 0.034);
        eye.userData.pulse = { min: 0.2, max: 1.4, freq: 1.0 };
        group.add(eye);
        return group;
      },

      // ---- Gorgon --------------------------------------------------------
      createUnarmedGorgonModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0x9AA07A, 0x7A8A6A, 0xA89A80]), { roughness: 0.7, metalness: 0.08 });
        const snake = this._mat(0x3A6B4A, { roughness: 0.4, metalness: 0.35 });
        const stone = this._mat(0x8A8A84, { roughness: 1.0, metalness: 0.02 });
        const eyeMat = this._glow(0xE8C83A, 1.0);
        // Fingers that are snakes, and the stone this hand does to other
        // people has started at its own wrist and is working its way up.
        this._fist(group, skin, { width: 0.08, knuckleR: 0.013, fingers: false, cuff: 0.046, cuffMat: stone });
        const links = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < 4; i++) {
          const x = -0.03 + i * 0.02;
          for (let j = 0; j < links; j++) {
            const t = j / links;
            const seg = new THREE.Mesh(new THREE.SphereGeometry(0.009 - t * 0.003, this.seg(8, 5), this.seg(6, 4)), snake);
            seg.position.set(x + Math.sin(j * 1.1 + i) * 0.012, 0.066 + j * 0.016, 0.03 + Math.sin(j) * 0.008);
            seg.userData.sway = { axis: 'z', amp: 0.14, freq: 1.2 + i * 0.2, phase: i + j * 0.5 };
            group.add(seg);
          }
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, this.seg(9, 6), this.seg(7, 5)), snake);
          head.scale.set(1, 0.8, 1.5);
          head.position.set(x + Math.sin(5 + i) * 0.012, 0.066 + links * 0.016, 0.034);
          head.userData.sway = { axis: 'y', amp: 0.3, freq: 1.6, phase: i };
          group.add(head);
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.003, this.seg(6, 4), this.seg(5, 4)), eyeMat);
          e.position.set(head.position.x, head.position.y, head.position.z + 0.008);
          e.userData.pulse = { min: 0.3, max: 1.2, freq: 1.4, phase: i };
          group.add(e);
        }
        // Where the skin has already gone over.
        const patches = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < patches; i++) {
          const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.012 + rand() * 0.006, 0), stone);
          p.position.set((rand() - 0.5) * 0.07, -0.02 - rand() * 0.05, 0.02);
          p.rotation.set(rand(), rand(), rand());
          group.add(p);
        }
        return group;
      },

      // ---- AbyssalLeviathan ----------------------------------------------
      createUnarmedAbyssalLeviathanModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x14202A, 0x1A1428, 0x0E2A28]), { roughness: 0.5, metalness: 0.3 });
        const gum = this._mat(0x5A2A3A, { roughness: 0.75, metalness: 0.05 });
        const tooth = this._mat(0xE8E4D8, { roughness: 0.35, metalness: 0.1 });
        const lure = this._glow(0x6AE8FF, 1.4);
        // Far too big to have hands. What comes out of the dark is a mouth on
        // the end of a limb, with a light in front of it doing the inviting.
        const upper = new THREE.Mesh(new THREE.SphereGeometry(0.05, this.seg(13, 8), this.seg(10, 6), 0, Math.PI * 2, 0, Math.PI / 2), hide);
        upper.position.set(0, 0.02, 0.01);
        upper.rotation.x = -0.4;
        upper.userData.sway = { axis: 'x', amp: 0.12, freq: 0.7 };
        group.add(upper);
        const lower = new THREE.Mesh(new THREE.SphereGeometry(0.046, this.seg(13, 8), this.seg(10, 6), 0, Math.PI * 2, 0, Math.PI / 2), gum);
        lower.position.set(0, 0.01, 0.01);
        lower.rotation.x = Math.PI + 0.4;
        lower.userData.sway = { axis: 'x', amp: 0.12, freq: 0.7, phase: Math.PI };
        group.add(lower);
        const teeth = this.isLowDetail() ? 6 : 12;
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.03, this.seg(5, 4)), tooth);
          t.position.set(Math.cos(a) * 0.04, 0.02, 0.012 + Math.sin(a) * 0.03);
          t.rotation.set(i % 2 ? 0.4 : Math.PI - 0.4, -a, 0);
          group.add(t);
        }
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.09, this.seg(6, 4)), hide);
        rod.position.set(0.01, 0.07, 0.02);
        rod.rotation.z = -0.4;
        group.add(rod);
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), lure);
        light.position.set(0.03, 0.11, 0.02);
        light.userData.pulse = { min: 0.15, max: 1.6, freq: 0.6 };
        light.userData.bob = { axis: 'y', amp: 0.008, freq: 0.5 };
        group.add(light);
        const arms = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, 0.08, this.seg(6, 4)), hide);
          t.position.set(Math.cos(a) * 0.03, -0.06, Math.sin(a) * 0.024);
          t.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
          t.userData.sway = { axis: 'z', amp: 0.16, freq: 0.8, phase: i };
          group.add(t);
        }
        return group;
      },

      // ---- Snail ---------------------------------------------------------
      createUnarmedSnailModel(weapon, rand) {
        const group = new THREE.Group();
        const flesh = this._mat(this.getRandomColor(rand, [0xC8B8A0, 0xA89880, 0xC8A8B0]), { roughness: 0.35, metalness: 0.08 });
        const shell = this._mat(this.getRandomColor(rand, [0x8A6A3A, 0x6A4A2A, 0xC8A868]), { roughness: 0.4, metalness: 0.2 });
        const slime = this._mat(0xD8F0D8, { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.5 });
        // A snail has no fist in the sense the word is usually meant: the limb
        // ends in the muscular foot it walks on, carrying its shell over the
        // top, and it presses rather than punches.
        const foot = new THREE.Mesh(new THREE.SphereGeometry(0.042, this.seg(13, 8), this.seg(9, 6)), flesh);
        foot.scale.set(1, 1.1, 0.7);
        foot.position.y = 0.02;
        foot.userData.bob = { axis: 'y', amp: 0.006, freq: 0.5 };
        group.add(foot);
        const coils = this.isLowDetail() ? 3 : 5;
        for (let i = 0; i < coils; i++) {
          const t = i / coils;
          const c = new THREE.Mesh(new THREE.TorusGeometry(0.034 - t * 0.012, 0.011 - t * 0.003, this.seg(6, 4), this.seg(14, 8)), shell);
          c.position.set(0, 0.02 + t * 0.012, -0.03 + t * 0.012);
          c.rotation.set(0.2, t * 1.4, 0);
          group.add(c);
        }
        // The eyestalks, which go in first and come back out afterwards.
        for (const s of [-1, 1]) {
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.05, this.seg(6, 4)), flesh);
          stalk.position.set(s * 0.016, 0.07, 0.02);
          stalk.rotation.z = s * 0.25;
          stalk.userData.sway = { axis: 'z', amp: 0.2, freq: 0.7, phase: s };
          group.add(stalk);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), flesh);
          eye.position.set(s * 0.022, 0.096, 0.02);
          group.add(eye);
        }
        const feelers = this.isLowDetail() ? 1 : 2;
        for (let i = 0; i < feelers; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.02, this.seg(5, 4)), flesh);
          f.position.set(-0.01 + i * 0.02, 0.05, 0.04);
          f.rotation.x = 1.0;
          group.add(f);
        }
        const trail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.03), slime);
        trail.position.set(0, -0.05, 0.01);
        trail.userData.bob = { axis: 'y', amp: 0.01, freq: 0.4 };
        group.add(trail);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.05, this.seg(11, 7)), flesh);
        stem.position.y = -0.05;
        group.add(stem);
        return group;
      },

      // ---- WaterElemental ------------------------------------------------
      createUnarmedWaterElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const water = this._mat(0x2A8ACF, {
          roughness: 0.05, metalness: 0.2, emissive: 0x1A5A9A, emissiveIntensity: 0.3,
          transparent: true, opacity: 0.5
        });
        const core = this._glow(0x8AE8FF, 1.2);
        // Held water. It is a fist for as long as the current inside it agrees
        // to be one, and it is shedding some of itself the whole time.
        this._uElemental(group, water, core, { width: 0.082, coreR: 0.02, freq: 1.0 });
        const drops = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < drops; i++) {
          const d = new THREE.Mesh(new THREE.SphereGeometry(0.008 + rand() * 0.005, this.seg(9, 6), this.seg(7, 5)), water);
          d.scale.y = 1.5;
          d.position.set((rand() - 0.5) * 0.08, 0.06 - i * 0.02, 0.02 + (rand() - 0.5) * 0.03);
          d.userData.bob = { axis: 'y', amp: 0.018, freq: 0.7 + i * 0.15, phase: i };
          group.add(d);
        }
        for (let i = 0; i < 3; i++) {
          const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.04 + i * 0.008, 0.003, this.seg(4, 3), this.seg(14, 8)), water);
          ripple.rotation.x = Math.PI / 2;
          ripple.position.y = 0.02 - i * 0.03;
          ripple.userData.spin = { axis: 'y', speed: 0.7 + i * 0.3 };
          group.add(ripple);
        }
        return group;
      },

      // ---- ThunderElemental ----------------------------------------------
      createUnarmedThunderElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const charged = this._mat(0x9AD8FF, {
          roughness: 0.1, metalness: 0.3, emissive: 0x4FA8FF, emissiveIntensity: 0.6,
          transparent: true, opacity: 0.42
        });
        const bolt = this._glow(0xFFF08A, 1.6);
        // Charge with a hand around it. The arcs jump the knuckles rather than
        // travel down them, and the whole thing brightens each time one does.
        this._uElemental(group, charged, bolt, { width: 0.08, coreR: 0.018, spin: 2.2, freq: 3.0, min: 0.1 });
        const forks = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < forks; i++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03 + rand() * 0.025, 0.004), bolt);
          f.position.set((rand() - 0.5) * 0.08, 0.02 + (rand() - 0.5) * 0.07, 0.03);
          f.rotation.z = (rand() - 0.5) * 1.6;
          f.userData.pulse = { min: 0.0, max: 1.8, freq: 4.0 + i * 0.6, phase: i * 1.7 };
          group.add(f);
        }
        const sparks = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < sparks; i++) {
          const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.006, 0), bolt);
          s.position.set(0, 0.03, 0.014);
          s.userData.orbit = { radius: 0.055 + i * 0.006, speed: 2.4 + i * 0.5, phase: i * 1.3, plane: i % 2 ? 'xy' : 'xz' };
          s.userData.pulse = { min: 0.1, max: 1.7, freq: 5.0, phase: i };
          group.add(s);
        }
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, this.seg(5, 3), this.seg(16, 9)), bolt);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = -0.04;
        coil.userData.spin = { axis: 'y', speed: 3.0 };
        coil.userData.pulse = { min: 0.2, max: 1.4, freq: 2.6 };
        group.add(coil);
        return group;
      },

      // ---- StormElemental ------------------------------------------------
      createUnarmedStormElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const cloud = this._mat(0x59606E, { roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.7 });
        const rain = this._mat(0xAFD8F0, { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55 });
        const flash = this._glow(0xEAF2FF, 1.5);
        // Weather with a wrist. The hand is inside its own small front: cloud
        // banked over the knuckles, rain falling off them, and the lightning
        // somewhere in the middle deciding when.
        this._uElemental(group, cloud, flash, { width: 0.084, coreR: 0.017, spin: 0.5, freq: 0.5, min: 0.05 });
        const banks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < banks; i++) {
          const a = (i / banks) * Math.PI * 2;
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.022 + rand() * 0.01, this.seg(10, 6), this.seg(7, 5)), cloud);
          b.scale.set(1.3, 0.8, 1);
          b.position.set(Math.cos(a) * 0.036, 0.06 + Math.sin(a) * 0.012, 0.016 + Math.sin(a) * 0.016);
          b.userData.bob = { axis: 'y', amp: 0.008, freq: 0.5 + i * 0.1, phase: i };
          group.add(b);
        }
        const drops = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < drops; i++) {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.022, this.seg(4, 3)), rain);
          d.position.set((rand() - 0.5) * 0.08, -0.01 - rand() * 0.06, 0.02 + (rand() - 0.5) * 0.03);
          d.userData.bob = { axis: 'y', amp: 0.03, freq: 2.2 + i * 0.2, phase: i };
          group.add(d);
        }
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.005), flash);
        bolt.position.set(0.01, 0.02, 0.03);
        bolt.rotation.z = 0.5;
        bolt.userData.pulse = { min: 0.0, max: 1.9, freq: 0.8 };
        group.add(bolt);
        return group;
      },

      // ---- FireElemental -------------------------------------------------
      createUnarmedFireElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const flame = this._mat(0xFF7A1A, {
          roughness: 0.2, metalness: 0.0, emissive: 0xFF4A0A, emissiveIntensity: 0.8,
          transparent: true, opacity: 0.55
        });
        const heart = this._glow(0xFFE08A, 1.6);
        const ash = this._mat(0x2A2422, { roughness: 1.0, metalness: 0.0 });
        // A fist of burning, which is not a metaphor: the tongues stand where
        // the fingers would, and what falls off the wrist is ash.
        this._uElemental(group, flame, heart, { width: 0.08, coreR: 0.021, spin: 1.4, freq: 2.0, min: 0.3 });
        const tongues = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < tongues; i++) {
          const a = (i / tongues) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05 + rand() * 0.03, this.seg(6, 4)), flame);
          t.position.set(Math.cos(a) * 0.028, 0.08, 0.02 + Math.sin(a) * 0.018);
          t.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
          t.userData.sway = { axis: 'z', amp: 0.16, freq: 3.0 + i * 0.3, phase: i };
          group.add(t);
        }
        const embers = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < embers; i++) {
          const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), heart);
          e.position.set(0, 0.05, 0.02);
          e.userData.orbit = { radius: 0.05 + i * 0.008, speed: 0.9 + i * 0.3, phase: i * 1.1, plane: i % 2 ? 'xy' : 'yz' };
          e.userData.pulse = { min: 0.1, max: 1.8, freq: 2.6, phase: i };
          group.add(e);
        }
        const flakes = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < flakes; i++) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.002, 0.007), ash);
          f.position.set((rand() - 0.5) * 0.07, -0.05 - rand() * 0.04, (rand() - 0.5) * 0.04);
          f.rotation.set(rand(), rand(), rand());
          f.userData.bob = { axis: 'y', amp: 0.014, freq: 0.9 + i * 0.2, phase: i };
          group.add(f);
        }
        return group;
      },

      // ---- MetalElemental ------------------------------------------------
      createUnarmedMetalElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const iron = this._mat(this.getRandomColor(rand, [0x9AA0A8, 0x8A7A6A, 0x6A7A8A]), { roughness: 0.32, metalness: 0.95 });
        const forge = this._glow(0xFF8A2A, 1.1);
        const dark = this._mat(0x2A2E34, { roughness: 0.5, metalness: 0.85 });
        // The only elemental that keeps its shape between fights: plate over
        // plate, spikes for fingers, and the heat of the pour still in the
        // seams.
        this._uElemental(group, iron, forge, { width: 0.088, coreR: 0.018, spin: 0.6, freq: 0.7, min: 0.15 });
        this._uPlates(group, iron, { rows: 3, per: 4, box: true });
        for (let i = 0; i < 4; i++) {
          const x = -0.031 + i * 0.021;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.05, this.seg(5, 4)), iron);
          spike.position.set(x, 0.086, 0.028);
          spike.rotation.x = -0.2;
          group.add(spike);
        }
        // A gear at the wrist, which is where the hand actually turns.
        const teeth = this.isLowDetail() ? 6 : 10;
        const gear = new THREE.Group();
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.012), dark);
          t.position.set(Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036);
          t.rotation.y = -a;
          gear.add(t);
        }
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, this.seg(14, 8)), dark);
        gear.add(hub);
        gear.position.y = -0.052;
        gear.userData.spin = { axis: 'y', speed: 0.8 };
        group.add(gear);
        const seams = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < seams; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.004), forge);
          s.position.set(0, 0.05 - i * 0.026, 0.03);
          s.userData.pulse = { min: 0.1, max: 1.1, freq: 0.6 + i * 0.2, phase: i };
          group.add(s);
        }
        return group;
      },

      // ---- DarkElemental -------------------------------------------------
      createUnarmedDarkElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const pitch = this._mat(0x0A0810, { roughness: 0.95, metalness: 0.05 });
        const violet = this._glow(this.getRandomColor(rand, [0x8A2AFF, 0x2A1A6A]), 1.0);
        const smoke = this._mat(0x18142A, { roughness: 1.0, metalness: 0.0, transparent: true, opacity: 0.45 });
        // The one elemental that gives nothing back: the shell is unlit even
        // at the knuckles, and what orbits it is falling in rather than off.
        this._uElemental(group, pitch, violet, { width: 0.082, coreR: 0.019, spin: -0.7, freq: 0.6, min: 0.2 });
        const veils = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < veils; i++) {
          const a = (i / veils) * Math.PI * 2;
          const v = this._plate([[0, 0], [0.03, -0.02], [0.024, -0.07], [0.002, -0.04]], 0.001, smoke);
          v.position.set(Math.cos(a) * 0.03, 0.02, 0.01 + Math.sin(a) * 0.02);
          v.rotation.set(0, -a, 0.2);
          v.userData.sway = { axis: 'z', amp: 0.2, freq: 0.5 + i * 0.1, phase: i };
          group.add(v);
        }
        const motes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.005, 0), violet);
          m.position.set(0, 0.03, 0.014);
          m.userData.orbit = { radius: 0.062 - i * 0.006, speed: -1.1 - i * 0.2, phase: i * 1.4, plane: i % 2 ? 'yz' : 'xz' };
          m.userData.pulse = { min: 0.05, max: 1.2, freq: 1.4, phase: i };
          group.add(m);
        }
        const gulf = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, this.seg(4, 3), this.seg(18, 10)), violet);
        gulf.position.set(0, 0.03, 0.012);
        gulf.rotation.set(0.5, 0.4, 0);
        gulf.userData.spin = { axis: 'x', speed: 0.4 };
        gulf.userData.pulse = { min: 0.05, max: 0.9, freq: 0.7 };
        group.add(gulf);
        return group;
      },

      // ---- SacredElemental -----------------------------------------------
      createUnarmedSacredElementalModel(weapon, rand) {
        const group = new THREE.Group();
        const lightMat = this._mat(0xFFF0C8, {
          roughness: 0.08, metalness: 0.1, emissive: 0xFFD98A, emissiveIntensity: 0.7,
          transparent: true, opacity: 0.5
        });
        const gold = this._glow(0xFFD24A, 1.5);
        // Light on loan to a shape. It is the same fist as the others but it
        // is lit from the palm outward, and it carries a sigil nobody in the
        // party can read.
        this._uElemental(group, lightMat, gold, { width: 0.082, coreR: 0.021, spin: 0.5, freq: 0.9, min: 0.5 });
        this._uAura(group, gold, { count: 3, radius: 0.052, y: 0.03, z: 0.014 });
        const rays = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2;
          const r = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.05, this.seg(5, 4)), gold);
          r.position.set(Math.cos(a) * 0.045, 0.03 + Math.sin(a) * 0.035, 0.012);
          r.rotation.z = -a + Math.PI / 2;
          r.userData.pulse = { min: 0.2, max: 1.4, freq: 0.9, phase: i * 0.5 };
          group.add(r);
        }
        const sigil = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.003, this.seg(4, 3), this.seg(6, 5)), gold);
        sigil.position.set(0, 0.03, 0.03);
        sigil.userData.spin = { axis: 'z', speed: 0.3 };
        sigil.userData.pulse = { min: 0.4, max: 1.6, freq: 0.6 };
        group.add(sigil);
        return group;
      },

      // ---- Totem ---------------------------------------------------------
      createUnarmedTotemModel(weapon, rand) {
        const group = new THREE.Group();
        const wood = this._wood(this.getRandomColor(rand, [0x6E4A2A, 0x4A3220, 0x8A6236]));
        const paint = this._mat(this.getRandomColor(rand, [0xC0392B, 0x2A6BC0, 0xE0C060]), { roughness: 0.7, metalness: 0.05 });
        const eyeMat = this._glow(0xFFD24A, 1.0);
        // Carved by somebody who had heard a hand described rather than seen
        // one: a squared block with three grooves for fingers and a face on
        // the back that is doing most of the work.
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.09, 0.05), wood);
        block.position.y = 0.02;
        group.add(block);
        for (let i = 0; i < 3; i++) {
          const groove = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.09, 0.008), paint);
          groove.position.set(-0.022 + i * 0.022, 0.02, 0.026);
          group.add(groove);
        }
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.014), paint);
        brow.position.set(0, 0.05, 0.026);
        group.add(brow);
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.008, this.seg(8, 5), this.seg(6, 4)), eyeMat);
          e.position.set(s * 0.018, 0.032, 0.03);
          e.userData.pulse = { min: 0.2, max: 1.2, freq: 0.5, phase: s };
          group.add(e);
          const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.026, this.seg(5, 4)), wood);
          tusk.position.set(s * 0.024, 0.0, 0.03);
          tusk.rotation.x = 1.2;
          group.add(tusk);
        }
        const bands = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < bands; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.006, 0.054), paint);
          b.position.set(0, -0.012 - i * 0.014, 0);
          group.add(b);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.06, 8), wood);
        post.position.y = -0.06;
        group.add(post);
        return group;
      },

      // ---- Ophanim -------------------------------------------------------
      createUnarmedOphanimModel(weapon, rand) {
        const group = new THREE.Group();
        const brass = this._mat(0xC8A03A, { roughness: 0.25, metalness: 0.95 });
        const fire = this._glow(0xFFE08A, 1.4);
        const eyeMat = this._glow(0x8ADFFF, 1.2);
        // There is no hand, and no arm to put one on. An ophanim is wheels, so
        // what arrives is the rim of the innermost of them, and the eyes set
        // in it watch the whole way in.
        const wheels = this.isLowDetail() ? 3 : 4;
        for (let i = 0; i < wheels; i++) {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.012, 0.005, this.seg(6, 4), this.seg(18, 10)), brass);
          w.position.set(0, 0.03, 0.01);
          w.rotation.set((i * Math.PI) / wheels, (i * Math.PI) / 3, i * 0.4);
          w.userData.spin = { axis: ['y', 'x', 'z'][i % 3], speed: (i % 2 ? -1 : 1) * (0.8 + i * 0.4) };
          group.add(w);
        }
        const eyes = this.isLowDetail() ? 4 : 8;
        for (let i = 0; i < eyes; i++) {
          const a = (i / eyes) * Math.PI * 2;
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), eyeMat);
          e.position.set(Math.cos(a) * 0.03, 0.03 + Math.sin(a) * 0.03, 0.012);
          e.userData.pulse = { min: 0.2, max: 1.4, freq: 0.8 + i * 0.1, phase: i * 0.7 };
          group.add(e);
        }
        const hub = new THREE.Mesh(new THREE.OctahedronGeometry(0.018, 0), fire);
        hub.position.set(0, 0.03, 0.01);
        hub.userData.spin = { axis: 'y', speed: 1.6 };
        hub.userData.pulse = { min: 0.4, max: 1.7, freq: 1.1 };
        group.add(hub);
        const spokes = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI;
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.06, this.seg(5, 3)), brass);
          s.position.set(0, 0.03, 0.01);
          s.rotation.z = a;
          group.add(s);
        }
        // The column of fire it stands on instead of a wrist.
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, 0.06, this.seg(10, 6)), fire);
        column.position.y = -0.05;
        column.userData.pulse = { min: 0.3, max: 1.2, freq: 1.4 };
        group.add(column);
        return group;
      },

      // ---- Angel ---------------------------------------------------------
      createUnarmedAngelModel(weapon, rand) {
        const group = new THREE.Group();
        const marble = this._mat(0xF4EEE2, { roughness: 0.4, metalness: 0.05, emissive: 0xFFE8B0, emissiveIntensity: 0.2 });
        const halo = this._glow(0xFFD98A, 1.3);
        const robe = this._mat(this.getRandomColor(rand, [0xE8E4DA, 0xC8D8E8, 0xE8D8C8]), { roughness: 0.85, metalness: 0.02 });
        // A hand, but nothing was ever done to it: unmarked, unbroken, warm
        // from the inside, with the halo sitting round the knuckles instead of
        // over the head and the robe starting at the wrist.
        this._fist(group, marble, { width: 0.082, knuckleR: 0.014, cuff: 0.05, cuffMat: robe });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, this.seg(5, 3), this.seg(18, 10)), halo);
        ring.position.set(0, 0.05, 0.02);
        ring.rotation.x = 1.2;
        ring.userData.spin = { axis: 'y', speed: 0.5 };
        ring.userData.pulse = { min: 0.4, max: 1.5, freq: 0.7 };
        group.add(ring);
        const feathers = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < feathers; i++) {
          const a = (i / feathers) * Math.PI * 2;
          const f = this._plate([[0, 0], [0.012, -0.03], [0, -0.08], [-0.012, -0.03]], 0.002, robe);
          f.position.set(Math.cos(a) * 0.03, -0.05, -0.01 + Math.sin(a) * 0.02);
          f.rotation.set(0, -a, 0.15);
          f.userData.sway = { axis: 'z', amp: 0.1, freq: 0.8, phase: i };
          group.add(f);
        }
        const motes = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.004, 0), halo);
          m.position.set(0, 0.04, 0.02);
          m.userData.orbit = { radius: 0.055 + i * 0.006, speed: 0.5 + i * 0.15, phase: i * 1.2, plane: i % 2 ? 'xz' : 'xy' };
          m.userData.pulse = { min: 0.2, max: 1.3, freq: 1.0, phase: i };
          group.add(m);
        }
        return group;
      },

      // ---- Elven ---------------------------------------------------------
      createUnarmedElvenModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0xEDD9C4, 0xD8C0A8, 0xC8B8A8]), { roughness: 0.7, metalness: 0.03 });
        const leaf = this._mat(0x5A8A3A, { roughness: 0.6, metalness: 0.05 });
        const bracer = this._mat(0x6A5A3A, { roughness: 0.8, metalness: 0.1 });
        const silver = this._mat(0xD8DCE0, { roughness: 0.2, metalness: 0.95 });
        // Longer in the fingers than it needs to be, and the only marks on it
        // are the two grooves a bowstring leaves after a few centuries.
        this._fist(group, skin, { width: 0.076, knuckleR: 0.012, fingers: false, cuff: 0.046, cuffMat: bracer });
        for (let i = 0; i < 4; i++) {
          const x = -0.027 + i * 0.018;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.044, this.seg(8, 5)), skin);
          finger.position.set(x, 0.058, 0.036);
          finger.rotation.set(Math.PI / 2 - 0.45, 0, (i - 1.5) * 0.07);
          group.add(finger);
        }
        for (let i = 0; i < 2; i++) {
          const groove = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.024, 0.004), bracer);
          groove.position.set(-0.014 + i * 0.02, 0.058, 0.056);
          group.add(groove);
        }
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.003, this.seg(5, 3), this.seg(12, 7)), silver);
        band.position.set(-0.027, 0.05, 0.03);
        band.rotation.x = Math.PI / 2 - 0.4;
        group.add(band);
        const vines = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < vines; i++) {
          const l = this._plate([[0, 0], [0.014, 0.008], [0.02, 0.03], [0.004, 0.022]], 0.002, leaf);
          l.position.set(-0.024 + i * 0.018, -0.055, 0.026);
          l.rotation.set(0, i * 0.8, 0.25 + i * 0.2);
          l.userData.sway = { axis: 'z', amp: 0.08, freq: 0.9, phase: i };
          group.add(l);
        }
        const stitch = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.003, this.seg(4, 3), this.seg(12, 7)), silver);
        stitch.rotation.x = Math.PI / 2;
        stitch.position.y = -0.07;
        stitch.scale.z = 0.76;
        group.add(stitch);
        return group;
      },

      // ---- Gnome ---------------------------------------------------------
      createUnarmedGnomeModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0xE0BFA0, 0xC9A08A, 0xB08A70]), { roughness: 0.88, metalness: 0.03 });
        const beard = this._mat(0xE8E4DC, { roughness: 1.0, metalness: 0.0 });
        const brass = this._mat(0xC8A03A, { roughness: 0.3, metalness: 0.9 });
        const stain = this._mat(0x3A4A2A, { roughness: 0.95, metalness: 0.05 });
        // Small and very wide, permanently stained with whatever the workshop
        // was full of, with a thimble left on one finger and a good deal of
        // beard in the way.
        this._fist(group, skin, { width: 0.07, knuckleR: 0.015, cuff: 0.036 });
        const thimble = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.016, this.seg(9, 6)), brass);
        thimble.position.set(-0.022, 0.056, 0.038);
        thimble.rotation.x = Math.PI / 2 - 0.3;
        group.add(thimble);
        const marks = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < marks; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.008 + rand() * 0.006, 0.004, 0.004), stain);
          m.position.set((rand() - 0.5) * 0.05, 0.01 + rand() * 0.04, 0.027);
          m.rotation.z = (rand() - 0.5) * 1.2;
          group.add(m);
        }
        const strands = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < strands; i++) {
          const s = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.05 + rand() * 0.03, this.seg(5, 3)), beard);
          s.position.set(-0.024 + i * 0.006, -0.06, 0.024);
          s.rotation.z = (rand() - 0.5) * 0.4;
          s.userData.sway = { axis: 'z', amp: 0.1, freq: 0.8 + i * 0.1, phase: i };
          group.add(s);
        }
        const cuffRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(4, 3), this.seg(12, 7)), brass);
        cuffRing.rotation.x = Math.PI / 2;
        cuffRing.position.y = -0.05;
        cuffRing.scale.z = 0.74;
        group.add(cuffRing);
        return group;
      },

      // ---- Elephant ------------------------------------------------------
      createUnarmedElephantModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x8A8A84, 0x6A6A64, 0xA09890]), { roughness: 0.98, metalness: 0.02 });
        const ivory = this._mat(0xEDE4CE, { roughness: 0.4, metalness: 0.08 });
        const inner = this._mat(0xC08A8A, { roughness: 0.7, metalness: 0.03 });
        // The elephant's hand is on its face, so this is a trunk: rings of
        // muscle all the way up and two small lobes at the tip that can pick
        // up a coin or take a door off.
        const rings = this.isLowDetail() ? 6 : 10;
        for (let i = 0; i < rings; i++) {
          const t = i / rings;
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.034 - t * 0.02, 0.038 - t * 0.02, 0.02, this.seg(12, 7)), hide);
          r.position.set(Math.sin(t * 1.6) * 0.02, -0.06 + i * 0.019, 0.01 + t * 0.01);
          r.rotation.z = -Math.sin(t * 1.6) * 0.3;
          r.userData.sway = { axis: 'z', amp: 0.05 * t, freq: 0.7, phase: i * 0.4 };
          group.add(r);
        }
        for (const s of [-1, 1]) {
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(9, 6), this.seg(7, 5)), inner);
          lobe.scale.set(1, 1.4, 0.8);
          lobe.position.set(Math.sin(1.6) * 0.02 + s * 0.008, 0.15, 0.024);
          lobe.userData.sway = { axis: 'z', amp: 0.18, freq: 1.5, phase: s };
          group.add(lobe);
        }
        // A tusk comes past the trunk on the striking side.
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.11, this.seg(9, 6)), ivory);
        tusk.position.set(-0.05, 0.03, 0.01);
        tusk.rotation.set(-0.3, 0, 0.45);
        group.add(tusk);
        const wrinkles = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < wrinkles; i++) {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.03 - i * 0.002, 0.003, this.seg(4, 3), this.seg(12, 7)), hide);
          w.rotation.x = Math.PI / 2;
          w.position.y = -0.05 + i * 0.02;
          group.add(w);
        }
        return group;
      },

      // ---- TentacledCreature ---------------------------------------------
      createUnarmedTentacledModel(weapon, rand) {
        const group = new THREE.Group();
        const hideColor = this.getRandomColor(rand, [0x6A3A6A, 0x3A5A6A, 0x6A5A3A]);
        const hide = this._mat(hideColor, { roughness: 0.45, metalness: 0.15 });
        const eyeMat = this._glow(0xE8E840, 1.1);
        const barbMat = this._mat(0x2A2028, { roughness: 0.5, metalness: 0.2 });
        // Two arms rather than eight, and longer than any of an octopus's,
        // with the eye set in the palm between them so it can watch what it
        // is holding.
        const palm = new THREE.Mesh(new THREE.SphereGeometry(0.036, this.seg(12, 7), this.seg(9, 6)), hide);
        palm.scale.set(1.1, 1, 0.8);
        palm.position.y = 0.01;
        group.add(palm);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, this.seg(11, 7), this.seg(8, 5)), eyeMat);
        eye.position.set(0, 0.012, 0.03);
        eye.userData.pulse = { min: 0.3, max: 1.3, freq: 0.5 };
        group.add(eye);
        const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.006), barbMat);
        pupil.position.set(0, 0.012, 0.046);
        pupil.userData.sway = { axis: 'z', amp: 0.4, freq: 0.6 };
        group.add(pupil);
        for (const s of [-1, 1]) {
          const links = this.isLowDetail() ? 5 : 8;
          for (let j = 0; j < links; j++) {
            const t = j / links;
            const l = new THREE.Mesh(new THREE.SphereGeometry(0.014 - t * 0.009, this.seg(9, 6), this.seg(6, 4)), hide);
            l.position.set(s * (0.03 + Math.sin(t * 2.4) * 0.03), 0.05 + t * 0.09, 0.02 + Math.sin(t * 3) * 0.02);
            l.userData.sway = { axis: 'z', amp: 0.14 * (t + 0.2), freq: 0.9 + t, phase: s + j * 0.4 };
            group.add(l);
            if (j % 2 === 1 && this.wantsTrim()) {
              const barb = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, this.seg(5, 4)), barbMat);
              barb.position.set(l.position.x, l.position.y, l.position.z + 0.012);
              barb.rotation.x = 1.2;
              group.add(barb);
            }
          }
        }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.05, this.seg(11, 7)), hide);
        stem.position.y = -0.05;
        group.add(stem);
        return group;
      },

      // ---- SpiderHumanHybrid ---------------------------------------------
      createUnarmedSpiderHumanModel(weapon, rand) {
        const group = new THREE.Group();
        const skin = this._mat(this.getRandomColor(rand, [0xC9A08A, 0x9A8A7A, 0xB08A80]), { roughness: 0.85, metalness: 0.03 });
        const chitin = this._mat(0x1A1418, { roughness: 0.3, metalness: 0.45 });
        const silk = this._mat(0xE8E8E0, { roughness: 0.7, metalness: 0.05, transparent: true, opacity: 0.5 });
        const eyeMat = this._glow(0xFF3A5A, 1.0);
        // The top half kept its hands, so this is a person's fist with the
        // spider showing at the edges of it: chitin over the knuckles, a pair
        // of fangs where the thumb is, and spinnerets at the wrist.
        this._fist(group, skin, { width: 0.084, knuckleR: 0.014, cuff: 0.048, cuffMat: chitin });
        for (let i = 0; i < 4; i++) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.011, this.seg(8, 5), this.seg(6, 4)), chitin);
          cap.scale.set(1, 0.7, 0.9);
          cap.position.set(-0.03 + i * 0.02, 0.066, 0.02);
          group.add(cap);
        }
        for (const s of [-1, 1]) {
          const fang = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.032, this.seg(6, 4)), chitin);
          fang.position.set(s * 0.036, 0.03, 0.03);
          fang.rotation.set(1.1, 0, s * 0.4);
          fang.userData.sway = { axis: 'z', amp: 0.12, freq: 1.6, phase: s };
          group.add(fang);
        }
        const legs = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < legs; i++) {
          const a = -0.6 + (i / (legs - 1)) * 1.2;
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.06, this.seg(6, 4)), chitin);
          l.position.set(Math.sin(a) * 0.04, -0.05, -0.02);
          l.rotation.set(0.5, 0, -a * 1.4);
          l.userData.sway = { axis: 'z', amp: 0.1, freq: 1.4 + i * 0.2, phase: i };
          group.add(l);
        }
        const eyes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < eyes; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.004, this.seg(7, 5), this.seg(5, 4)), eyeMat);
          e.position.set(-0.018 + i * 0.012, 0.03, 0.028);
          e.userData.pulse = { min: 0.3, max: 1.2, freq: 0.8, phase: i };
          group.add(e);
        }
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.08, this.seg(5, 3)), silk);
        strand.position.set(0.02, -0.09, 0.02);
        strand.userData.sway = { axis: 'z', amp: 0.15, freq: 0.8 };
        group.add(strand);
        return group;
      },

      // ---- SpikyMonster --------------------------------------------------
      createUnarmedSpikyMonsterModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x5A3A6A, 0x3A5A3A, 0x6A3A3A]), { roughness: 0.8, metalness: 0.08 });
        const spike = this._mat(0xE8E0CC, { roughness: 0.45, metalness: 0.2 });
        const eyeMat = this._glow(0xFF6A3A, 1.0);
        // The spikes are the whole animal and the hand is only what holds them
        // together: a ball of them, pointing every way at once, so there is no
        // safe side to catch it on.
        const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.042, this.isLowDetail() ? 0 : 1), hide);
        body.position.y = 0.03;
        group.add(body);
        const spikes = this.isLowDetail() ? 8 : 16;
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2;
          const tilt = ((i % 4) - 1.5) * 0.5;
          const s = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.045 + rand() * 0.02, this.seg(6, 4)), spike);
          const r = 0.042;
          s.position.set(Math.cos(a) * r * Math.cos(tilt), 0.03 + Math.sin(tilt) * r, 0.01 + Math.sin(a) * r * Math.cos(tilt));
          s.rotation.set(-Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2 + tilt * 0.4);
          group.add(s);
        }
        const eyes = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < eyes; i++) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.006, this.seg(8, 5), this.seg(6, 4)), eyeMat);
          e.position.set(-0.016 + i * 0.011, 0.036, 0.04);
          e.userData.pulse = { min: 0.2, max: 1.2, freq: 0.9 + i * 0.2, phase: i };
          group.add(e);
        }
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.05, this.seg(11, 7)), hide);
        stub.position.y = -0.05;
        group.add(stub);
        return group;
      },

      // ---- Horse ---------------------------------------------------------
      createUnarmedHorseModel(weapon, rand) {
        const group = new THREE.Group();
        const hoofMat = this._mat(this.getRandomColor(rand, [0x3A322C, 0x6A5A4A, 0x24201C]), { roughness: 0.6, metalness: 0.12 });
        const frog = this._mat(0x6A4A44, { roughness: 0.9, metalness: 0.02 });
        const coat = this._mat(this.getRandomColor(rand, [0x6B4A2A, 0x2A2420, 0xD8CFC0]), { roughness: 1.0, metalness: 0.0 });
        const iron = this._mat(0x8A8A94, { roughness: 0.4, metalness: 0.9 });
        // A horse punches by kicking, so the hand is a hoof: horn all round,
        // the soft frog underneath, and a shoe somebody nailed on.
        this._uHoof(group, hoofMat, { radius: 0.046, soleMat: frog });
        const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, this.seg(4, 3), this.seg(14, 8), Math.PI * 1.6), iron);
        shoe.rotation.x = Math.PI / 2;
        shoe.position.y = 0.062;
        shoe.scale.z = 0.86;
        group.add(shoe);
        // The fetlock feathering above it, and the pastern going up.
        const hairs = this.isLowDetail() ? 4 : 9;
        for (let i = 0; i < hairs; i++) {
          const a = (i / hairs) * Math.PI * 2;
          const h = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.05, this.seg(4, 3)), coat);
          h.position.set(Math.cos(a) * 0.03, -0.045, Math.sin(a) * 0.024);
          h.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
          h.userData.sway = { axis: 'z', amp: 0.1, freq: 1.1, phase: i };
          group.add(h);
        }
        const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, this.seg(11, 7)), coat);
        pastern.position.y = -0.06;
        group.add(pastern);
        return group;
      },

      // ---- Unicorn -------------------------------------------------------
      createUnarmedUnicornModel(weapon, rand) {
        const group = new THREE.Group();
        const hoofMat = this._mat(0xE8E0D0, { roughness: 0.25, metalness: 0.45, emissive: 0xFFF0C0, emissiveIntensity: 0.2 });
        const frog = this._mat(0xD8B8C0, { roughness: 0.8, metalness: 0.05 });
        const coat = this._mat(0xF4F0E8, { roughness: 0.95, metalness: 0.02 });
        const spiral = this._glow(this.getRandomColor(rand, [0xFFD98A, 0xBFA0FF, 0x8AE8FF]), 1.3);
        // The same hoof as a horse's and nothing like it: pale, polished, lit
        // from under the horn, and the horn is on the hoof because that is
        // where a unicorn puts a punch.
        this._uHoof(group, hoofMat, { radius: 0.044, soleMat: frog });
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.09, this.seg(8, 5)), spiral);
        horn.position.y = 0.11;
        horn.userData.spin = { axis: 'y', speed: 0.6 };
        horn.userData.pulse = { min: 0.4, max: 1.5, freq: 0.8 };
        group.add(horn);
        const twists = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < twists; i++) {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.011 - i * 0.002, 0.002, this.seg(4, 3), this.seg(10, 6)), spiral);
          t.rotation.set(Math.PI / 2, 0, i * 0.5);
          t.position.y = 0.082 + i * 0.02;
          group.add(t);
        }
        const motes = this.isLowDetail() ? 2 : 5;
        for (let i = 0; i < motes; i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.004, 0), spiral);
          m.position.set(0, 0.06, 0);
          m.userData.orbit = { radius: 0.05 + i * 0.006, speed: 0.7 + i * 0.2, phase: i * 1.2, plane: i % 2 ? 'xz' : 'xy' };
          m.userData.pulse = { min: 0.1, max: 1.3, freq: 1.2, phase: i };
          group.add(m);
        }
        const hairs = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < hairs; i++) {
          const a = (i / hairs) * Math.PI * 2;
          const h = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.05, this.seg(4, 3)), coat);
          h.position.set(Math.cos(a) * 0.03, -0.045, Math.sin(a) * 0.024);
          h.rotation.set(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4);
          h.userData.sway = { axis: 'z', amp: 0.1, freq: 1.0, phase: i };
          group.add(h);
        }
        const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.06, this.seg(11, 7)), coat);
        pastern.position.y = -0.06;
        group.add(pastern);
        return group;
      },

      // ---- Hellhound -----------------------------------------------------
      createUnarmedHellhoundModel(weapon, rand) {
        const group = new THREE.Group();
        const fur = this._mat(0x1F1A18, { roughness: 0.98, metalness: 0.02 });
        const pad = this._mat(0x3A1A18, { roughness: 0.85, metalness: 0.04 });
        const claw = this._mat(0x14100E, { roughness: 0.4, metalness: 0.3 });
        const coal = this._glow(this.getRandomColor(rand, [0xFF4A1A, 0xFF8A2A, 0x8A2AFF]), 1.5);
        const iron = this._mat(0x6A6A72, { roughness: 0.4, metalness: 0.9 });
        // A dog's paw with the fire underneath the fur rather than on it: the
        // skin between the toes glows, the collar is still on, and the chain
        // it broke is still hanging off the collar.
        this._fist(group, fur, { width: 0.084, knuckleR: 0.015, fingers: false, cuff: 0.05 });
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.012, this.seg(9, 6), this.seg(7, 5)), pad);
          p.scale.set(1, 0.75, 1.1);
          p.position.set(-0.03 + i * 0.02, 0.06, 0.03);
          group.add(p);
        }
        const heel = new THREE.Mesh(new THREE.SphereGeometry(0.022, this.seg(11, 7), this.seg(8, 5)), pad);
        heel.scale.set(1.3, 0.6, 1);
        heel.position.set(0, 0.026, 0.036);
        group.add(heel);
        this._uClaws(group, claw, { length: 0.032, radius: 0.007, curl: 0.9, y: 0.072, z: 0.042 });
        const cracks = this.isLowDetail() ? 3 : 6;
        for (let i = 0; i < cracks; i++) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.003, 0.006), coal);
          c.position.set(-0.026 + i * 0.011, 0.04 - i * 0.012, 0.03);
          c.rotation.z = (rand() - 0.5) * 1.0;
          c.userData.pulse = { min: 0.1, max: 1.6, freq: 1.0 + i * 0.3, phase: i * 1.2 };
          group.add(c);
        }
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, this.seg(5, 3), this.seg(14, 8)), iron);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = -0.062;
        collar.scale.z = 0.8;
        group.add(collar);
        const links = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < links; i++) {
          const l = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, this.seg(4, 3), this.seg(9, 6)), iron);
          l.position.set(0.02, -0.078 - i * 0.014, 0.02);
          l.rotation.set(i % 2 ? 0 : Math.PI / 2, 0, 0.3);
          l.userData.sway = { axis: 'z', amp: 0.14, freq: 1.3, phase: i };
          group.add(l);
        }
        return group;
      },

      // ---- WingedDemon ---------------------------------------------------
      createUnarmedWingedDemonModel(weapon, rand) {
        const group = new THREE.Group();
        const hide = this._mat(this.getRandomColor(rand, [0x6A1A2A, 0x3A1A4A, 0x2A2A3A]), { roughness: 0.6, metalness: 0.2 });
        const horn = this._mat(0x14100E, { roughness: 0.4, metalness: 0.3 });
        const membrane = this._mat(0x4A1A2A, { roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.8 });
        const hell = this._glow(0xFF5A1A, 1.3);
        // A demon that flies has to keep the wing near the hand: the membrane
        // runs from the elbow down to the little finger, so the arm opens as
        // it swings and the claws arrive first.
        this._fist(group, hide, { width: 0.086, knuckleR: 0.015, fingers: false, cuff: 0.05 });
        for (let f = 0; f < 4; f++) {
          const x = -0.03 + f * 0.02;
          const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.032, this.seg(7, 5)), hide);
          finger.position.set(x, 0.058, 0.034);
          finger.rotation.x = Math.PI / 2 - 0.4;
          group.add(finger);
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.045, this.seg(6, 4)), horn);
          c.position.set(x, 0.066, 0.066);
          c.rotation.x = 1.35;
          group.add(c);
        }
        const spars = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < spars; i++) {
          const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.1 - i * 0.014, this.seg(6, 4)), horn);
          spar.position.set(-0.05 - i * 0.014, -0.02, -0.02);
          spar.rotation.z = 0.5 + i * 0.2;
          group.add(spar);
        }
        const web = this._plate([[0, 0], [-0.09, -0.02], [-0.07, -0.09], [0, -0.05]], 0.002, membrane);
        web.position.set(-0.03, 0.0, -0.024);
        web.userData.sway = { axis: 'z', amp: 0.1, freq: 0.9 };
        group.add(web);
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.04, this.seg(6, 4)), horn);
        barb.position.set(0.045, -0.05, -0.01);
        barb.rotation.set(-0.4, 0, -1.2);
        barb.userData.sway = { axis: 'z', amp: 0.12, freq: 1.2 };
        group.add(barb);
        const brands = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < brands; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.008), hell);
          b.position.set((rand() - 0.5) * 0.05, 0.03 - i * 0.02, 0.03);
          b.rotation.z = (rand() - 0.5) * 0.9;
          b.userData.pulse = { min: 0.15, max: 1.4, freq: 1.2 + i * 0.3, phase: i };
          group.add(b);
        }
        return group;
      },

      // ---- TrashCreature -------------------------------------------------
      createUnarmedTrashCreatureModel(weapon, rand) {
        const group = new THREE.Group();
        const refuse = this._mat(this.getRandomColor(rand, [0x4A4A3A, 0x3A4A4A, 0x5A4A3A]), { roughness: 1.0, metalness: 0.05 });
        const tin = this._mat(0xA8ACB0, { roughness: 0.45, metalness: 0.8 });
        const plastic = this._mat(this.getRandomColor(rand, [0xC03A3A, 0x3AA0C0, 0xE0C03A]), { roughness: 0.4, metalness: 0.05 });
        const tape = this._mat(0x8A7A5A, { roughness: 1.0, metalness: 0.0 });
        const eyeMat = this._glow(0x9CFF3D, 0.9);
        // Assembled out of what was in the bin. The fingers are a bent fork
        // and two cans, the knuckles are a jar lid, and it is all held on with
        // tape that is losing the argument.
        const mass = new THREE.Mesh(new THREE.DodecahedronGeometry(0.042, 0), refuse);
        mass.position.y = 0.02;
        mass.rotation.set(0.4, 0.7, 0.2);
        group.add(mass);
        const cans = this.isLowDetail() ? 2 : 3;
        for (let i = 0; i < cans; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.034, this.seg(9, 6)), tin);
          c.position.set(-0.024 + i * 0.024, 0.07, 0.024);
          c.rotation.set(-0.3, 0, (i - 1) * 0.3);
          group.add(c);
        }
        // The fork, which is the closest thing it has to fingers.
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.003), tin);
        shaft.position.set(0.03, 0.075, 0.026);
        shaft.rotation.z = -0.3;
        group.add(shaft);
        for (let i = 0; i < 3; i++) {
          const tine = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.02, 0.003), tin);
          tine.position.set(0.038 + (i - 1) * 0.005, 0.105, 0.026);
          group.add(tine);
        }
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, this.seg(12, 7)), plastic);
        lid.rotation.x = Math.PI / 2;
        lid.position.set(-0.01, 0.04, 0.036);
        group.add(lid);
        const scraps = this.isLowDetail() ? 3 : 7;
        for (let i = 0; i < scraps; i++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.012 + rand() * 0.014, 0.008, 0.004), i % 2 ? plastic : tape);
          s.position.set((rand() - 0.5) * 0.08, (rand() - 0.4) * 0.08, 0.026 + (rand() - 0.5) * 0.02);
          s.rotation.set(0, 0, (rand() - 0.5) * 2);
          s.userData.sway = { axis: 'z', amp: 0.12, freq: 0.7 + i * 0.15, phase: i };
          group.add(s);
        }
        for (const s of [-1, 1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)), eyeMat);
          e.position.set(s * 0.016, 0.01, 0.036);
          e.userData.pulse = { min: 0.2, max: 1.1, freq: 0.6 + (s > 0 ? 0.3 : 0), phase: s };
          group.add(e);
        }
        const bindings = this.isLowDetail() ? 2 : 4;
        for (let i = 0; i < bindings; i++) {
          const b = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, this.seg(4, 3), this.seg(10, 6)), tape);
          b.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.4, 0, 0);
          b.position.y = -0.04 - i * 0.016;
          b.scale.z = 0.74;
          group.add(b);
        }
        return group;
      }
    }
  });
})();
