//=============================================================================
// Item 3D Models - Armour
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for every entry in Armors.json, built from each
 * piece's own recipe, weight and level. Loaded by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Armour
 * ============================================================================
 *
 * Eight hundred and twenty-five pieces of armour. Writing eight hundred and
 * twenty-five invented descriptions of them would be dishonest: the database
 * already says what each piece IS, and it says it four times over.
 *
 *   <Recipe: 863x6, 861x3>  what it is made of. The dominant ingredient
 *                           decides the material, so a piece built out of
 *                           salvaged steel is steel, and one built out of
 *                           cloth and herb extract is cloth.
 *   <Weight: 2400>          how heavy it is, which is how thick it is built
 *                           and how far it stands off the body.
 *   <Level: 68>             how fine it is. A level-2 helm is a pot with a
 *                           strap; a level-90 one is trimmed, ridged and
 *                           studded.
 *   <Craft: Runecrafting>   the trade that made it, which decides what the
 *                           trim is: a runecrafted piece carries a lit sigil,
 *                           a jeweller's piece carries a set stone.
 *
 * The silhouette comes from the piece's own name where the name says one (a
 * Helm is a helm, a Veil is a veil, Sabatons are boots), and from its equip
 * slot where it does not. So the differences between two pieces are the
 * differences the database already declares between them, and nothing here is
 * made up to fill a table.
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
    console.error('[Item3D_Armor] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Armor',
    unique: {},
    armors: {
      '2:*': 'createArmourModel', '2:1': 'createArmourModel', '2:2': 'createArmourModel',
      '2:5': 'createArmourModel', '2:6': 'createArmourModel',
      '3:*': 'createArmourModel', '3:1': 'createArmourModel', '3:2': 'createArmourModel',
      '3:3': 'createArmourModel', '3:4': 'createArmourModel',
      '4:*': 'createArmourModel', '4:1': 'createArmourModel', '4:2': 'createArmourModel',
      '4:3': 'createArmourModel', '4:4': 'createArmourModel',
      '5:*': 'createArmourModel', '5:1': 'createArmourModel', '5:2': 'createArmourModel',
      '5:3': 'createArmourModel', '5:4': 'createArmourModel', '5:5': 'createArmourModel',
      '5:6': 'createArmourModel'
    },
    models: {
      // ======================================================================
      // What the database says about a piece
      // ======================================================================

      /**
       * The crafting materials this piece is made of, by database id, richest
       * first. Read straight off its <Recipe:> tag.
       */
      _armourRecipe(entry) {
        const m = /<Recipe:\s*([^>]+)>/i.exec((entry && entry.note) || '');
        if (!m) return [];
        const parts = [];
        for (const chunk of m[1].split(',')) {
          const pair = /(\d+)\s*x\s*(\d+)/i.exec(chunk.trim());
          if (pair) parts.push({ id: parseInt(pair[1], 10), n: parseInt(pair[2], 10) });
        }
        return parts.sort((a, b) => b.n - a.n);
      },

      // The crafting shelf, by database id (Items.json 849-871). What a piece
      // is mostly made of is what it looks like it is made of.
      ARMOUR_MATERIALS: {
        849: { name: 'essence', colour: 0x9A6AE0, rough: 0.4, metal: 0.1, glow: true },
        850: { name: 'ethereal', colour: 0xBCD8E8, rough: 0.3, metal: 0.2, glow: true },
        851: { name: 'quantum', colour: 0x50C8E0, rough: 0.3, metal: 0.4, glow: true },
        852: { name: 'circuit', colour: 0x1E4A28, rough: 0.6, metal: 0.25 },
        853: { name: 'chip', colour: 0x2A3A4A, rough: 0.5, metal: 0.3 },
        854: { name: 'cell', colour: 0x2A4A6A, rough: 0.5, metal: 0.3 },
        855: { name: 'plastic', colour: 0xD8D8DC, rough: 0.45, metal: 0.02 },
        856: { name: 'resin', colour: 0x8A8A80, rough: 0.6, metal: 0.05 },
        857: { name: 'nanotube', colour: 0x22242A, rough: 0.35, metal: 0.5 },
        858: { name: 'plant', colour: 0x6A8A4A, rough: 0.95, metal: 0.0 },
        859: { name: 'wood', colour: 0x8A6A42, rough: 0.92, metal: 0.0 },
        860: { name: 'bone', colour: 0xE0D8C0, rough: 0.75, metal: 0.03 },
        861: { name: 'cloth', colour: 0xC8B89A, rough: 0.97, metal: 0.0 },
        862: { name: 'hide', colour: 0xA8604A, rough: 0.85, metal: 0.0 },
        863: { name: 'steel', colour: 0x9AA0A8, rough: 0.42, metal: 0.75 },
        864: { name: 'titanium', colour: 0xB8BCC4, rough: 0.3, metal: 0.85 },
        865: { name: 'varlenia', colour: 0xC8A54A, rough: 0.3, metal: 0.9 },
        866: { name: 'crystal', colour: 0x8AC8E0, rough: 0.15, metal: 0.2, glow: true },
        867: { name: 'glass', colour: 0xDCE8EE, rough: 0.08, metal: 0.0, clear: true },
        868: { name: 'leather', colour: 0x6A4630, rough: 0.88, metal: 0.02 },
        869: { name: 'herbal', colour: 0x7A8A5A, rough: 0.9, metal: 0.0 },
        870: { name: 'oiled', colour: 0x4A4230, rough: 0.55, metal: 0.1 },
        871: { name: 'etched', colour: 0x7A9A5A, rough: 0.4, metal: 0.15 }
      },

      /** What a piece is made of, and what that looks like. */
      _armourMaterial(entry) {
        const recipe = this._armourRecipe(entry);
        for (const part of recipe) {
          const mat = this.ARMOUR_MATERIALS[part.id];
          if (mat) return mat;
        }
        // Nothing craftable in it: fall back on the armour type, which at
        // least says whether it is cloth, leather, plate or a trinket.
        const at = (entry && entry.atypeId) || 1;
        if (at >= 4) return this.ARMOUR_MATERIALS[863];
        if (at === 3) return this.ARMOUR_MATERIALS[868];
        if (at === 2) return this.ARMOUR_MATERIALS[861];
        return this.ARMOUR_MATERIALS[861];
      },

      /** The second material, used for the strapping, lining and fittings. */
      _armourSecondary(entry) {
        const recipe = this._armourRecipe(entry);
        let first = null;
        for (const part of recipe) {
          const mat = this.ARMOUR_MATERIALS[part.id];
          if (!mat) continue;
          if (!first) { first = mat; continue; }
          if (mat !== first) return mat;
        }
        return this.ARMOUR_MATERIALS[868];
      },

      /** How thick and how far off the body it sits, from its weight. */
      _armourBulk(entry) {
        const m = /<Weight:\s*(\d+)>/i.exec((entry && entry.note) || '');
        const grams = m ? parseInt(m[1], 10) : 1000;
        // 0.7 for a scarf, 1.0 for a jacket, 1.5 for a full harness.
        return Math.max(0.7, Math.min(1.55, 0.7 + Math.log10(Math.max(50, grams) / 50) * 0.32));
      },

      /** How finely made it is, 0 to 1, from its level. */
      _armourQuality(entry) {
        const m = /<Level:\s*(\d+)>/i.exec((entry && entry.note) || '');
        return Math.max(0, Math.min(1, (m ? parseInt(m[1], 10) : 1) / 99));
      },

      /** The trade that made it, which decides what kind of trim it carries. */
      _armourCraft(entry) {
        const m = /<Craft:\s*([^>]+)>/i.exec((entry && entry.note) || '');
        return m ? m[1].trim().toLowerCase() : '';
      },

      /**
       * The garment. The piece's own name wins where it names one, because a
       * Veil and a Helm sit in the same slot and are not the same thing; the
       * equip slot answers for the rest.
       */
      _armourSilhouette(entry) {
        const name = String((entry && entry.name) || '').toLowerCase();
        const named = [
          [/sabatons|greaves|crampons|boots|shoes|sandals|slippers|treads|wader/, 'boots'],
          [/gauntlet|glove|mitts|handwear|bracer|vambrace/, 'gloves'],
          [/pauldron/, 'pauldron'],
          [/helm|coif|casque/, 'helm'],
          [/visor|goggles|lens/, 'visor'],
          [/mask/, 'mask'],
          [/veil|hood|shroud/, 'veil'],
          [/crown|circlet|tiara|diadem|coronet|halo/, 'crown'],
          [/hat|cap\b|beret|bonnet/, 'hat'],
          [/robe|gown|dress|cassock/, 'robe'],
          [/cloak|cape|mantle/, 'cloak'],
          [/cuirass|breastplate|plate\b|mail\b|harness|carapace/, 'cuirass'],
          [/coat|jacket|parka|tunic|shirt|vest|top\b|jersey|suit/, 'coat'],
          [/belt|sash|girdle/, 'belt'],
          [/scarf|wrap|shawl|stole/, 'scarf'],
          [/pack|bag|satchel|pouch|rig|bundle|kit\b/, 'pack'],
          [/shield|buckler|aegis|lid\b|plank|door/, 'shield'],
          [/ward|barrier|sigil|glyph|rune/, 'ward'],
          [/ring\b/, 'ring'],
          [/bracelet|bangle|brace\b|band\b/, 'bracelet'],
          [/amulet|pendant|necklace|talisman|charm|brooch|trinket|locket/, 'amulet']
        ];
        for (const [test, form] of named) if (test.test(name)) return form;

        const et = (entry && entry.etypeId) || 4;
        const at = (entry && entry.atypeId) || 1;
        if (et === 2) return at === 2 ? 'ward' : at >= 5 ? 'shield' : 'shield';
        if (et === 3) return at >= 3 ? 'helm' : 'hat';
        if (et === 4) return at === 2 ? 'robe' : at >= 4 ? 'cuirass' : 'coat';
        if (et === 5) {
          if (at === 3) return 'gloves';
          if (at === 4) return 'boots';
          if (at === 5) return 'pack';
          if (at === 6) return 'shield';
          return 'amulet';
        }
        return 'coat';
      },

      // ======================================================================
      // Shared trim
      // ======================================================================

      /**
       * What a piece of this quality, made by this trade, carries on it. A
       * cheap piece carries nothing; a fine one carries studs, and a fine one
       * out of a magical trade carries something lit.
       */
      _armourTrim(group, entry, o) {
        const quality = this._armourQuality(entry);
        const craft = this._armourCraft(entry);
        if (!this.wantsTrim()) return;
        const second = this._armourSecondary(entry);

        const magical = /rune|wand|gem|jewel|silver/.test(craft);
        if (magical || (second.glow && quality > 0.35)) {
          // A runecrafted or jewelled piece carries its mark, and on the good
          // ones it is lit.
          const sigil = new THREE.Mesh(
            new THREE.TorusGeometry(o.r * 0.42, o.r * 0.05, this.seg(5, 3), /gem|jewel/.test(craft) ? 8 : 6),
            second.glow || magical
              ? this._glow(second.glow ? second.colour : 0xC8A54A, 0.35 + quality * 0.5)
              : this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.8 }));
          sigil.rotation.x = Math.PI / 2;
          sigil.position.set(o.x || 0, o.y, o.z || 0);
          sigil.userData.pulse = { freq: 0.7, min: 0.35, max: 0.95 };
          group.add(sigil);
          return;
        }
        if (quality < 0.3) return;                       // plain work stays plain

        const stud = this._mat(second.metal > 0.4 ? second.colour : 0xB08A3A,
          { roughness: 0.45, metalness: 0.7 });
        const count = quality > 0.7 ? 6 : 4;
        for (let i = 0; i < count; i++) {
          const a = i * Math.PI * 2 / count;
          const rivet = new THREE.Mesh(
            new THREE.SphereGeometry(o.r * 0.07, this.seg(8, 5), this.seg(6, 4)), stud);
          rivet.position.set((o.x || 0) + Math.cos(a) * o.r * 0.8, o.y,
            (o.z || 0) + Math.sin(a) * o.r * 0.8);
          group.add(rivet);
        }
      },

      /**
       * The material as a THREE material, honouring glass and lit stock.
       * `side` is only ever passed on when the caller asked for one: handing
       * THREE an undefined side logs a warning for every material built, and
       * this is called several times per piece across eight hundred pieces.
       */
      _armourStock(mat, opts) {
        const o = opts || {};
        const params = { roughness: mat.rough, metalness: mat.metal };
        if (o.side !== undefined) params.side = o.side;
        if (mat.clear) {
          params.transparent = true;
          params.opacity = o.opacity === undefined ? 0.45 : o.opacity;
          return this._mat(mat.colour, params);
        }
        if (mat.glow) {
          const m = this._glow(mat.colour, 0.3);
          if (o.side !== undefined) m.side = o.side;
          return m;
        }
        return this._mat(mat.colour, params);
      },

      // ======================================================================
      // The garments
      // ======================================================================

      /**
       * The last thing that separates two pieces whose data is identical.
       *
       * Some pieces really do declare the same thing as each other: the same
       * slot, the same dominant material, the same weight and the same level.
       * They are still two different pieces of armour, so each gets its own
       * cut and its own dye lot, dealt from the piece's OWN seed (its id and
       * name, never the world's). That keeps a given piece looking the same in
       * every world while no two pieces are stamped from one mould.
       */
      _armourFinish(group, rand) {
        const cut = 0.94 + rand() * 0.12;              // how it was cut
        const height = 0.95 + rand() * 0.1;
        group.scale.set(cut, height, cut);
        const dye = 0.9 + rand() * 0.2;                // the dye lot
        const warm = 0.97 + rand() * 0.06;
        const seen = new Set();
        group.traverse((o) => {
          if (!o.isMesh || !o.material || !o.material.color) return;
          if (seen.has(o.material)) return;
          seen.add(o.material);
          o.material.color.multiplyScalar(dye);
          o.material.color.r = Math.min(1, o.material.color.r * warm);
          o.material.color.b = Math.min(1, o.material.color.b / warm);
        });
        return group;
      },

      createArmourModel(entry, rand) {
        const form = this._armourSilhouette(entry);
        const mat = this._armourMaterial(entry);
        const second = this._armourSecondary(entry);
        const bulk = this._armourBulk(entry);
        const quality = this._armourQuality(entry);
        const group = new THREE.Group();
        const stock = this._armourStock(mat);
        const lining = this._armourStock(second);

        switch (form) {
          case 'helm': {
            const r = 0.036 * bulk;
            const dome = new THREE.Mesh(
              new THREE.SphereGeometry(r, this.seg(16, 9), this.seg(11, 6), 0, Math.PI * 2, 0, Math.PI / 2),
              stock);
            dome.position.y = 0.012;
            group.add(dome);
            const rim = new THREE.Mesh(
              new THREE.TorusGeometry(r, r * 0.11, this.seg(6, 4), this.seg(18, 10)), lining);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.012;
            group.add(rim);
            if (quality > 0.45) {
              const comb = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, r * 0.4, r * 1.9), stock);
              comb.position.y = 0.012 + r * 0.9;
              group.add(comb);
            }
            const nasal = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.7, r * 0.12), stock);
            nasal.position.set(0, 0.004, r * 0.95);
            group.add(nasal);
            this._armourTrim(group, entry, { r: r, y: 0.014 + r * 0.5 });
            break;
          }

          case 'hat': {
            const r = 0.05 * bulk;
            const brim = new THREE.Mesh(
              new THREE.CylinderGeometry(r, r * 1.06, 0.004, this.seg(18, 10)), stock);
            brim.position.y = 0.002;
            group.add(brim);
            const crown = new THREE.Mesh(
              new THREE.CylinderGeometry(r * 0.56, r * 0.64, 0.038 * bulk, this.seg(16, 9)), stock);
            crown.position.y = 0.021 * bulk + 0.004;
            group.add(crown);
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(r * 0.63, 0.003, this.seg(6, 4), this.seg(16, 9)), lining);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.009;
            group.add(band);
            this._armourTrim(group, entry, { r: r * 0.6, y: 0.011 });
            break;
          }

          case 'crown': {
            const r = 0.03;
            const band = new THREE.Mesh(
              new THREE.CylinderGeometry(r, r, 0.012 * bulk, this.seg(20, 11), 1, true), stock);
            band.material.side = THREE.DoubleSide;
            band.position.y = 0.006 * bulk;
            group.add(band);
            const points = quality > 0.6 ? 7 : 5;
            for (let i = 0; i < points; i++) {
              const a = i * Math.PI * 2 / points;
              const point = new THREE.Mesh(
                new THREE.ConeGeometry(0.005, 0.016 + quality * 0.012, this.seg(6, 4)), stock);
              point.position.set(Math.cos(a) * r, 0.012 * bulk + 0.008 + quality * 0.006, Math.sin(a) * r);
              group.add(point);
            }
            this._armourTrim(group, entry, { r: r * 0.8, y: 0.013 * bulk, z: r * 0.6 });
            break;
          }

          case 'visor': {
            const w = 0.062 * bulk;
            const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, 0.012), stock);
            frame.position.y = 0.02;
            group.add(frame);
            const lens = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.012, 0.003),
              this._mat(second.glow ? second.colour : 0x2A4A5A, {
                roughness: 0.05, metalness: 0.45, transparent: true, opacity: 0.72,
                emissive: second.glow ? second.colour : 0x000000,
                emissiveIntensity: second.glow ? 0.5 : 0
              }));
            lens.position.set(0, 0.02, 0.007);
            group.add(lens);
            for (const s of [-1, 1]) {
              const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.04), lining);
              arm.position.set(s * w * 0.46, 0.02, -0.02);
              group.add(arm);
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 0.004), lining);
              post.position.set(s * w * 0.46, 0.01, -0.038);
              group.add(post);
            }
            break;
          }

          case 'mask': {
            const face = new THREE.Mesh(
              new THREE.SphereGeometry(0.032 * bulk, this.seg(14, 8), this.seg(11, 6),
                0, Math.PI, 0, Math.PI), stock);
            face.scale.z = 0.55;
            face.rotation.y = -Math.PI / 2;
            face.position.y = 0.032 * bulk;
            group.add(face);
            for (const s of [-1, 1]) {
              const socket = new THREE.Mesh(
                new THREE.CylinderGeometry(0.006, 0.006, 0.006, this.seg(10, 6)),
                this._mat(0x14141A, { roughness: 0.9, metalness: 0.05 }));
              socket.rotation.x = Math.PI / 2;
              socket.position.set(s * 0.011, 0.038 * bulk, 0.014 * bulk);
              group.add(socket);
            }
            const strap = new THREE.Mesh(
              new THREE.TorusGeometry(0.03 * bulk, 0.0022, this.seg(5, 3), this.seg(16, 9), Math.PI), lining);
            strap.rotation.set(Math.PI / 2, 0, Math.PI);
            strap.position.y = 0.032 * bulk;
            group.add(strap);
            this._armourTrim(group, entry, { r: 0.026, y: 0.05 * bulk, z: 0.01 });
            break;
          }

          case 'veil': {
            const cloth = this._armourStock(mat, { side: THREE.DoubleSide, opacity: 0.7 });
            const hood = new THREE.Mesh(
              new THREE.ConeGeometry(0.032 * bulk, 0.058 * bulk, this.seg(16, 9), 1, true), cloth);
            hood.position.y = 0.029 * bulk;
            group.add(hood);
            const fall = new THREE.Mesh(
              new THREE.CylinderGeometry(0.032 * bulk, 0.038 * bulk, 0.03, this.seg(16, 9), 1, true), cloth);
            fall.position.y = 0.015;
            group.add(fall);
            const hem = new THREE.Mesh(
              new THREE.TorusGeometry(0.038 * bulk, 0.002, this.seg(5, 3), this.seg(18, 10)), lining);
            hem.rotation.x = Math.PI / 2;
            hem.position.y = 0.001;
            group.add(hem);
            this._armourTrim(group, entry, { r: 0.024, y: 0.04 * bulk });
            break;
          }

          case 'robe': {
            const cloth = this._armourStock(mat, { side: THREE.DoubleSide });
            const fall = new THREE.Mesh(
              new THREE.CylinderGeometry(0.026 * bulk, 0.055 * bulk, 0.12, this.seg(16, 9), 1, true), cloth);
            fall.position.y = 0.06;
            group.add(fall);
            const hood = new THREE.Mesh(
              new THREE.SphereGeometry(0.026 * bulk, this.seg(12, 7), this.seg(9, 5),
                0, Math.PI * 2, 0, Math.PI / 2), cloth);
            hood.position.y = 0.118;
            group.add(hood);
            const cord = new THREE.Mesh(
              new THREE.TorusGeometry(0.042 * bulk, 0.0028, this.seg(6, 4), this.seg(16, 9)), lining);
            cord.rotation.x = Math.PI / 2;
            cord.position.y = 0.046;
            group.add(cord);
            this._armourTrim(group, entry, { r: 0.03, y: 0.09, z: 0.02 });
            break;
          }

          case 'cloak': {
            const cloth = this._armourStock(mat, { side: THREE.DoubleSide });
            const fall = new THREE.Mesh(
              new THREE.CylinderGeometry(0.03 * bulk, 0.06 * bulk, 0.1, this.seg(16, 9), 1, true,
                0.6, Math.PI * 1.6), cloth);
            fall.position.y = 0.05;
            group.add(fall);
            const collar = new THREE.Mesh(
              new THREE.TorusGeometry(0.028 * bulk, 0.006, this.seg(6, 4), this.seg(16, 9)), lining);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = 0.098;
            group.add(collar);
            const clasp = new THREE.Mesh(
              new THREE.CylinderGeometry(0.006, 0.006, 0.003, this.seg(12, 7)),
              this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.8 }));
            clasp.rotation.x = Math.PI / 2;
            clasp.position.set(0, 0.096, 0.028 * bulk);
            group.add(clasp);
            break;
          }

          case 'coat': {
            const cloth = this._armourStock(mat, { side: THREE.DoubleSide });
            const torso = new THREE.Mesh(
              new THREE.BoxGeometry(0.062 * bulk, 0.082, 0.032 * bulk), cloth);
            torso.position.y = 0.05;
            group.add(torso);
            for (const s of [-1, 1]) {
              const sleeve = new THREE.Mesh(
                new THREE.CylinderGeometry(0.014 * bulk, 0.012 * bulk, 0.046, this.seg(12, 7)), cloth);
              sleeve.rotation.z = Math.PI / 2 - s * 0.22;
              sleeve.position.set(s * 0.05 * bulk, 0.076, 0);
              group.add(sleeve);
            }
            const collar = new THREE.Mesh(
              new THREE.TorusGeometry(0.017, 0.004, this.seg(6, 4), this.seg(14, 8)), lining);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = 0.092;
            group.add(collar);
            // The fastening down the front: buttons, a zip, or nothing on the
            // roughest work.
            if (quality > 0.2) {
              const fastener = this._mat(second.metal > 0.4 ? second.colour : 0x2A2A32,
                { roughness: 0.5, metalness: second.metal });
              for (let i = 0; i < 4; i++) {
                const button = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.0035, 0.0035, 0.0015, this.seg(10, 6)), fastener);
                button.rotation.x = Math.PI / 2;
                button.position.set(0, 0.024 + i * 0.018, 0.0165 * bulk);
                group.add(button);
              }
            }
            this._armourTrim(group, entry, { r: 0.026, y: 0.056, z: 0.017 * bulk });
            break;
          }

          case 'cuirass': {
            const chest = new THREE.Mesh(
              new THREE.CylinderGeometry(0.043 * bulk, 0.037 * bulk, 0.09, this.seg(16, 9), 1, true), stock);
            chest.material.side = THREE.DoubleSide;
            chest.scale.z = 0.62;
            chest.position.y = 0.055;
            group.add(chest);
            for (const s of [-1, 1]) {
              const pauldron = new THREE.Mesh(
                new THREE.SphereGeometry(0.021 * bulk, this.seg(12, 7), this.seg(9, 5),
                  0, Math.PI * 2, 0, Math.PI / 2), stock);
              pauldron.position.set(s * 0.043 * bulk, 0.094, 0);
              pauldron.rotation.z = s * 0.5;
              group.add(pauldron);
            }
            const belt = new THREE.Mesh(
              new THREE.TorusGeometry(0.039 * bulk, 0.004, this.seg(6, 4), this.seg(16, 9)), lining);
            belt.rotation.x = Math.PI / 2;
            belt.scale.z = 0.62;
            belt.position.y = 0.018;
            group.add(belt);
            if (quality > 0.5) {
              const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.07, 0.004), stock);
              ridge.position.set(0, 0.055, 0.027 * bulk);
              group.add(ridge);
            }
            this._armourTrim(group, entry, { r: 0.03, y: 0.07, z: 0.024 * bulk });
            break;
          }

          case 'pauldron': {
            const shell = new THREE.Mesh(
              new THREE.SphereGeometry(0.032 * bulk, this.seg(14, 8), this.seg(10, 6),
                0, Math.PI * 2, 0, Math.PI / 2), stock);
            shell.scale.y = 0.7;
            shell.position.y = 0.001;
            group.add(shell);
            for (let i = 0; i < 2; i++) {
              const lame = new THREE.Mesh(
                new THREE.TorusGeometry(0.03 * bulk - i * 0.007, 0.004, this.seg(5, 3), this.seg(14, 8), Math.PI),
                stock);
              lame.rotation.x = Math.PI / 2;
              lame.position.y = 0.004 + i * 0.005;
              group.add(lame);
            }
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.008), lining);
            strap.position.set(0, 0.002, -0.026 * bulk);
            group.add(strap);
            this._armourTrim(group, entry, { r: 0.024, y: 0.02 });
            break;
          }

          case 'boots': {
            const sole = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008 * bulk, 0.085), lining);
            sole.position.set(0, 0.004 * bulk, 0.012);
            group.add(sole);
            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.078), stock);
            foot.position.set(0, 0.021 * bulk, 0.012);
            group.add(foot);
            const toe = new THREE.Mesh(
              new THREE.SphereGeometry(0.017, this.seg(12, 7), this.seg(9, 5)), stock);
            toe.scale.set(1, 0.75, 1.05);
            toe.position.set(0, 0.021 * bulk, 0.045);
            group.add(toe);
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.018 * bulk, 0.021 * bulk, 0.05 * bulk, this.seg(14, 8)), stock);
            shaft.position.set(0, 0.05 * bulk, -0.014);
            group.add(shaft);
            if (quality > 0.35) {
              const cuff = new THREE.Mesh(
                new THREE.TorusGeometry(0.019 * bulk, 0.004, this.seg(6, 4), this.seg(14, 8)), lining);
              cuff.rotation.x = Math.PI / 2;
              cuff.position.set(0, 0.075 * bulk, -0.014);
              group.add(cuff);
            }
            this._armourTrim(group, entry, { r: 0.016, y: 0.03 * bulk, z: 0.03 });
            break;
          }

          case 'gloves': {
            const cuff = new THREE.Mesh(
              new THREE.CylinderGeometry(0.021 * bulk, 0.025 * bulk, 0.042, this.seg(14, 8)), stock);
            cuff.position.y = 0.021;
            group.add(cuff);
            const back = new THREE.Mesh(
              new THREE.BoxGeometry(0.034, 0.028, 0.016 * bulk), stock);
            back.position.y = 0.056;
            group.add(back);
            for (let i = 0; i < 4; i++) {
              const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.017, 0.01), stock);
              finger.position.set(-0.012 + i * 0.008, 0.078, 0);
              group.add(finger);
            }
            const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.009), stock);
            thumb.position.set(-0.019, 0.062, 0.004);
            thumb.rotation.z = 0.5;
            group.add(thumb);
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.022 * bulk, 0.0035, this.seg(6, 4), this.seg(14, 8)), lining);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.04;
            group.add(band);
            this._armourTrim(group, entry, { r: 0.016, y: 0.058, z: 0.009 * bulk });
            break;
          }

          case 'belt': {
            const strap = new THREE.Mesh(
              new THREE.TorusGeometry(0.034, 0.006 * bulk, this.seg(8, 5), this.seg(22, 12)), stock);
            strap.rotation.x = Math.PI / 2;
            strap.scale.z = 0.75;
            strap.position.y = 0.006 * bulk;
            group.add(strap);
            const buckle = new THREE.Mesh(
              new THREE.TorusGeometry(0.009, 0.0025, this.seg(6, 4), this.seg(12, 7)),
              this._mat(second.metal > 0.3 ? second.colour : 0xB08A3A,
                { roughness: 0.4, metalness: 0.75 }));
            buckle.position.set(0, 0.006 * bulk, 0.028);
            group.add(buckle);
            const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.002, 0.004),
              this._mat(0xB08A3A, { roughness: 0.4, metalness: 0.75 }));
            tongue.position.set(0.008, 0.006 * bulk, 0.028);
            group.add(tongue);
            this._armourTrim(group, entry, { r: 0.026, y: 0.012 * bulk });
            break;
          }

          case 'scarf': {
            const cloth = this._armourStock(mat, { side: THREE.DoubleSide });
            const coil = new THREE.Mesh(
              new THREE.TorusGeometry(0.028, 0.009 * bulk, this.seg(8, 5), this.seg(20, 11)), cloth);
            coil.rotation.x = Math.PI / 2;
            coil.position.y = 0.009 * bulk;
            group.add(coil);
            for (const s of [-1, 1]) {
              const tail = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, 0.004, 0.014 * bulk), cloth);
              tail.position.set(-0.03 + s * 0.006, 0.006 + s * 0.004, s * 0.012);
              tail.rotation.y = s * 0.3;
              group.add(tail);
            }
            const fringe = this._armourStock(second);
            if (quality > 0.3) {
              for (let i = 0; i < 3; i++) {
                const tassel = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.0012, 0.0012, 0.01, this.seg(6, 4)), fringe);
                tassel.position.set(-0.044, 0.005, -0.008 + i * 0.008);
                tassel.rotation.z = Math.PI / 2;
                group.add(tassel);
              }
            }
            break;
          }

          case 'pack': {
            const body = new THREE.Mesh(
              new THREE.BoxGeometry(0.056 * bulk, 0.07, 0.036 * bulk), stock);
            body.position.y = 0.035;
            group.add(body);
            const flap = new THREE.Mesh(
              new THREE.BoxGeometry(0.058 * bulk, 0.024, 0.038 * bulk), stock);
            flap.position.y = 0.08;
            group.add(flap);
            for (const x of [-0.016, 0.016]) {
              const strap = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.082, 0.004), lining);
              strap.position.set(x, 0.042, -0.02 * bulk);
              group.add(strap);
            }
            const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.003),
              this._mat(0x9AA0A8, { roughness: 0.45, metalness: 0.7 }));
            buckle.position.set(0, 0.066, 0.019 * bulk);
            group.add(buckle);
            this._armourTrim(group, entry, { r: 0.022, y: 0.04, z: 0.019 * bulk });
            break;
          }

          case 'shield': {
            const r = 0.042 * bulk;
            const plate = new THREE.Mesh(
              new THREE.CylinderGeometry(r, r, 0.008 * bulk, this.seg(20, 11)), stock);
            plate.rotation.x = Math.PI / 2;
            plate.position.y = r;
            group.add(plate);
            const rim = new THREE.Mesh(
              new THREE.TorusGeometry(r, 0.004, this.seg(6, 4), this.seg(20, 11)), lining);
            rim.position.y = r;
            group.add(rim);
            const boss = new THREE.Mesh(
              new THREE.SphereGeometry(r * 0.28, this.seg(12, 7), this.seg(9, 5),
                0, Math.PI * 2, 0, Math.PI / 2), lining);
            boss.rotation.x = -Math.PI / 2;
            boss.position.set(0, r, 0.006 * bulk);
            group.add(boss);
            const grip = new THREE.Mesh(
              new THREE.CylinderGeometry(0.006, 0.006, 0.05, this.seg(10, 6)),
              this._armourStock(second));
            grip.rotation.z = Math.PI / 2;
            grip.position.set(0, r, -0.012 * bulk);
            group.add(grip);
            if (quality > 0.4) {
              for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3;
                const rivet = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, this.seg(8, 5)), lining);
                rivet.rotation.x = Math.PI / 2;
                rivet.position.set(Math.cos(a) * r * 0.75, r + Math.sin(a) * r * 0.75, 0.005 * bulk);
                group.add(rivet);
              }
            }
            break;
          }

          case 'ward': {
            const stand = new THREE.Mesh(
              new THREE.CylinderGeometry(0.018, 0.026, 0.01, this.seg(14, 8)), this._armourStock(second));
            stand.position.y = 0.005;
            group.add(stand);
            const glowMat = mat.glow
              ? this._glow(mat.colour, 0.4 + quality * 0.4)
              : this._glow(second.glow ? second.colour : 0x6A8AE0, 0.35 + quality * 0.4);
            const plate = new THREE.Mesh(
              new THREE.CylinderGeometry(0.028, 0.028, 0.004, quality > 0.6 ? 8 : 6), glowMat);
            plate.rotation.x = Math.PI / 2;
            plate.position.y = 0.05;
            plate.userData.spin = { axis: 'y', speed: 0.4 };
            plate.userData.pulse = { freq: 1.0, min: 0.4, max: 0.95 };
            group.add(plate);
            const ring = new THREE.Mesh(
              new THREE.TorusGeometry(0.032, 0.0016, this.seg(5, 3), this.seg(18, 10)), glowMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.05;
            ring.userData.spin = { axis: 'y', speed: -0.25 };
            group.add(ring);
            break;
          }

          case 'ring': {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.012, 0.0026 + quality * 0.0014, this.seg(8, 5), this.seg(20, 11)),
              stock);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.003;
            group.add(band);
            const set = new THREE.Mesh(
              second.glow ? new THREE.OctahedronGeometry(0.005 + quality * 0.003, 0)
                : new THREE.CylinderGeometry(0.005, 0.005, 0.003, this.seg(12, 7)),
              this._armourStock(second));
            set.position.set(0, 0.008, -0.012);
            group.add(set);
            break;
          }

          case 'bracelet': {
            const band = new THREE.Mesh(
              new THREE.TorusGeometry(0.022, 0.004 * bulk, this.seg(8, 5), this.seg(22, 12)), stock);
            band.rotation.x = Math.PI / 2;
            band.position.y = 0.004 * bulk;
            group.add(band);
            const beads = quality > 0.5 ? 5 : 3;
            for (let i = 0; i < beads; i++) {
              const a = i * Math.PI * 2 / beads;
              const bead = new THREE.Mesh(
                new THREE.SphereGeometry(0.005, this.seg(10, 6), this.seg(8, 5)),
                this._armourStock(second));
              bead.position.set(Math.cos(a) * 0.022, 0.006 * bulk, Math.sin(a) * 0.022);
              group.add(bead);
            }
            break;
          }

          case 'amulet':
          default: {
            const cord = new THREE.Mesh(
              new THREE.TorusGeometry(0.024, 0.0014, this.seg(5, 3), this.seg(20, 11)),
              this._armourStock(second));
            cord.rotation.x = Math.PI / 2;
            cord.position.y = 0.0014;
            group.add(cord);
            const bezel = new THREE.Mesh(
              new THREE.TorusGeometry(0.009, 0.0024, this.seg(6, 4), this.seg(16, 9)),
              this._armourStock(second));
            bezel.rotation.x = Math.PI / 2;
            bezel.position.set(0, 0.0026, 0.02);
            group.add(bezel);
            const stone = new THREE.Mesh(
              mat.glow ? new THREE.OctahedronGeometry(0.008, 0)
                : new THREE.CylinderGeometry(0.008, 0.008, 0.003, this.seg(14, 8)),
              stock);
            if (mat.glow) stone.userData.pulse = { freq: 0.8, min: 0.4, max: 1.0 };
            stone.position.set(0, mat.glow ? 0.008 : 0.0026, 0.02);
            group.add(stone);
            if (quality > 0.55) {
              const drop = new THREE.Mesh(
                new THREE.ConeGeometry(0.004, 0.01, this.seg(8, 5)), stock);
              drop.rotation.x = Math.PI;
              drop.position.set(0, 0.003, 0.031);
              group.add(drop);
            }
            break;
          }
        }
        return this._armourFinish(group, rand);
      }
    }
  };

  // Every armour in the database, keyed so the dispatch is explicit rather
  // than relying on the slot fallback alone. The runs are the shelf as it
  // actually is: five gaps, where the editor's own separator rows sit
  // (ids 1, 455, 552, 651, 715, 759 are "<-- Clothes -->" style headings and
  // are not armour). test/test_item_models.js checks this against Armors.json.
  const ARMOUR_RUNS = [[2, 444], [456, 541], [553, 640], [652, 704], [716, 748], [760, 881]];
  for (const [from, to] of ARMOUR_RUNS) {
    for (let id = from; id <= to; id++) family.unique['a' + id] = 'createArmourModel';
  }

  window.ItemModelSystem.registerFamily(family);
})();
