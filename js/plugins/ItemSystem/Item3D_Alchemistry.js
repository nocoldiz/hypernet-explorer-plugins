//=============================================================================
// Item 3D Models - Alchemistry
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc The reagent shelf of Items.json: one jar, one printed formula.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Alchemistry
 * ============================================================================
 *
 * Ninety-six reagents off one bench. They come out of the same rack of
 * ground-glass jars, so the jar is shared and what separates them is what is
 * IN it and what is printed ON it:
 *
 *  * the state of the contents is read from the entry's own description, so
 *    a gas sits as vapour, a solution as a liquid with a meniscus, an ore as
 *    lumps and everything else as powder
 *  * the label prints the <Formula:> tag the entry already carries, which is
 *    what a chemist reads off a shelf before the name
 *
 * Nothing here is rolled: the colour is derived from the formula itself, so a
 * jar of sulfur is the same yellow in every world and on every playthrough.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js. Builders take (entry, rand), are seeded from the
 * database id and name alone, are built in metres and stand on the X/Z plane.
 * The shared construction library of WeaponSystemProcedural and the helpers of
 * Item3D_Generic and Item3D_Diseases (_printedLabel) are available as `this`.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_Alchemistry] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Alchemistry',
    unique: {},
    categories: { Alchemistry: 'createReagentJarModel' },
    models: {
      /**
       * What physical state the reagent is in, read off the entry's own text
       * rather than guessed: the descriptions already say "gas in solution",
       * "yellow brimstone", "phosphorus source", "pure water".
       */
      _reagentState(entry) {
        const text = ((entry && entry.description) || '') + ' ' + ((entry && entry.name) || '');
        if (/\bgas\b|vapou?r|fume/i.test(text)) return 'gas';
        if (/solution|water|acid|alcohol|solvent|buffer|liquid|oil|tincture/i.test(text)) return 'liquid';
        if (/crystal|salt\b|sugar/i.test(text)) return 'crystal';
        if (/rock|ore|mineral|stone|lump|coal|char/i.test(text)) return 'lump';
        return 'powder';
      },

      /**
       * The colour of a reagent. Named colours in the entry's own description
       * win; anything else is derived from the formula so that the same
       * substance is always the same colour, in every world.
       */
      _reagentColor(entry) {
        const text = ((entry && entry.description) || '') + ' ' + ((entry && entry.name) || '');
        const named = [
          [/yellow|brimstone|sulfur|sulphur/i, 0xD8C038],
          [/red|crimson|rust|iron oxide/i, 0xA83A2A],
          [/blue|copper sulfate|cobalt/i, 0x3A6AB8],
          [/green|chlor|verdigris/i, 0x4A8A5A],
          [/black|carbon|soot|charcoal|graphite/i, 0x22242A],
          [/white|chalk|lime|pure|distilled|salt\b/i, 0xE8E8E0],
          [/silver|mercury|zinc|tin\b/i, 0xB8BCC2],
          [/gold|brass/i, 0xC8A03A],
          [/purple|violet|permanganate/i, 0x6A3A8A]
        ];
        for (const [test, colour] of named) if (test.test(text)) return colour;
        // Derived from the formula, so the colour is a property of the
        // substance rather than of the world it is found in.
        const formula = this._reagentFormula(entry) || String((entry && entry.name) || '');
        let h = 0;
        for (let i = 0; i < formula.length; i++) h = (Math.imul(h, 31) + formula.charCodeAt(i)) | 0;
        const palette = [0xC8B48A, 0x9AA8B0, 0xB0A070, 0x8A9A88, 0xC0A8B0, 0xA89078, 0x90A0A8];
        return palette[Math.abs(h) % palette.length];
      },

      /** The <Formula:> tag the entry already carries, if it has one. */
      _reagentFormula(entry) {
        const m = /<Formula:\s*([^>]+)>/i.exec((entry && entry.note) || '');
        return m ? m[1].trim() : '';
      },

      /**
       * One wide-mouth reagent jar: ground-glass stopper, printed label, and
       * the contents built according to their state.
       */
      createReagentJarModel(entry, rand) {
        const group = new THREE.Group();
        const r = 0.024, h = 0.055;
        const glass = this._mat(0xD8E4E2, {
          roughness: 0.07, metalness: 0.0, transparent: true, opacity: 0.34
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, this.seg(20, 11)), glass);
        body.position.y = h / 2;
        group.add(body);
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.94, 0.004, this.seg(16, 9)), glass);
        floor.position.y = 0.002;
        group.add(floor);

        const state = this._reagentState(entry);
        const colour = this._reagentColor(entry);
        const inner = r * 0.9;

        if (state === 'gas') {
          // A gas sits as a thin haze filling the whole jar rather than a
          // level, which is the one contents that has no surface.
          const haze = new THREE.Mesh(
            new THREE.CylinderGeometry(inner, inner, h * 0.9, this.seg(16, 9)),
            this._mat(colour, { roughness: 0.9, metalness: 0.0, transparent: true, opacity: 0.22 }));
          haze.position.y = h * 0.47;
          group.add(haze);
          for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
            const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.007, this.seg(8, 5), this.seg(6, 4)),
              this._mat(colour, { roughness: 0.95, metalness: 0.0, transparent: true, opacity: 0.3 }));
            const a = i * 2.1;
            wisp.position.set(Math.cos(a) * 0.008, 0.02 + i * 0.012, Math.sin(a) * 0.008);
            wisp.userData.bob = { amp: 0.004, freq: 0.4 + i * 0.15 };
            group.add(wisp);
          }
        } else if (state === 'liquid') {
          const level = 0.62;
          const fluid = new THREE.Mesh(
            new THREE.CylinderGeometry(inner, inner, h * level, this.seg(16, 9)),
            this._mat(colour, { roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.82 }));
          fluid.position.y = h * level / 2 + 0.003;
          group.add(fluid);
          const meniscus = new THREE.Mesh(
            new THREE.CylinderGeometry(inner, inner, 0.0008, this.seg(16, 9)),
            this._mat(colour, { roughness: 0.06, metalness: 0.05 }));
          meniscus.position.y = h * level + 0.003;
          group.add(meniscus);
        } else if (state === 'crystal') {
          const bed = new THREE.Mesh(
            new THREE.CylinderGeometry(inner, inner, h * 0.3, this.seg(16, 9)),
            this._mat(colour, { roughness: 0.55, metalness: 0.05 }));
          bed.position.y = h * 0.15 + 0.003;
          group.add(bed);
          for (let i = 0; i < (this.wantsTrim() ? 5 : 2); i++) {
            const grain = new THREE.Mesh(new THREE.OctahedronGeometry(0.0035, 0),
              this._mat(colour, { roughness: 0.35, metalness: 0.1 }));
            const a = i * 1.27;
            grain.position.set(Math.cos(a) * 0.012, h * 0.3 + 0.006, Math.sin(a) * 0.012);
            grain.rotation.set(a, a * 0.6, 0.3);
            group.add(grain);
          }
        } else if (state === 'lump') {
          for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
            const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.007, 0),
              this._mat(colour, { roughness: 0.95, metalness: 0.04 }));
            const a = i * 1.27;
            const rr = i < 2 ? 0.004 : 0.012;
            lump.position.set(Math.cos(a) * rr, 0.009 + (i % 2) * 0.008, Math.sin(a) * rr);
            lump.rotation.set(a, a * 0.7, a * 0.4);
            group.add(lump);
          }
        } else {
          const heap = new THREE.Mesh(
            new THREE.CylinderGeometry(inner, inner, h * 0.34, this.seg(16, 9)),
            this._mat(colour, { roughness: 1.0, metalness: 0.0 }));
          heap.position.y = h * 0.17 + 0.003;
          group.add(heap);
          const mound = new THREE.Mesh(
            new THREE.SphereGeometry(inner, this.seg(14, 8), this.seg(8, 5), 0, Math.PI * 2, 0, Math.PI / 2),
            this._mat(colour, { roughness: 1.0, metalness: 0.0 }));
          mound.scale.y = 0.3;
          mound.position.y = h * 0.34 + 0.003;
          group.add(mound);
        }

        // The ground-glass stopper: the reason this rack looks like a bench
        // and not a pantry.
        const collar = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.72, r * 0.86, 0.008, this.seg(16, 9)), glass);
        collar.position.y = h + 0.004;
        group.add(collar);
        const plug = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.6, r * 0.68, 0.012, this.seg(14, 8)),
          this._mat(0xE0EAE8, { roughness: 0.55, metalness: 0.0, transparent: true, opacity: 0.7 }));
        plug.position.y = h + 0.013;
        group.add(plug);
        const knob = new THREE.Mesh(
          new THREE.SphereGeometry(r * 0.4, this.seg(12, 7), this.seg(9, 5)),
          this._mat(0xE0EAE8, { roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.75 }));
        knob.scale.y = 0.7;
        knob.position.y = h + 0.024;
        group.add(knob);

        // The label: the formula if the entry declares one, the name if not.
        const printed = this._reagentFormula(entry) || String((entry && entry.name) || '');
        const texture = this._printedLabel
          ? this._printedLabel(printed, { paper: '#F4F1E6', ink: '#1A1E22' })
          : null;
        const labelMat = this._mat(0xF4F1E6, {
          roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
        });
        if (texture) labelMat.map = texture;
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.026, this.seg(20, 11), 1, true,
            -Math.PI * 0.8, Math.PI * 1.6),
          labelMat);
        label.position.y = h * 0.52;
        group.add(label);
        return group;
      }
    }
  };

  // The reagent rack: one contiguous run of database ids. The category
  // mapping above catches anything added to the shelf later.
  for (let id = 883; id <= 978; id++) family.unique['i' + id] = 'createReagentJarModel';

  window.ItemModelSystem.registerFamily(family);
})();
