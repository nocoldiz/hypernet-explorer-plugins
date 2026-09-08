//=============================================================================
// Item 3D Models - Diseases
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc The culture vials of Items.json: one vial, one printed label.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Diseases
 * ============================================================================
 *
 * Every entry on this shelf is the same object: a sealed culture vial out of
 * the same rack, filled at the same bench. What tells one from another is the
 * LABEL, so that is what this family builds. One geometry, shared by all two
 * hundred and twenty of them, and a label texture printed with the name of
 * what is in the tube.
 *
 * The name is read off the item itself, so a vial reads correctly in whatever
 * language the game is running in: Hendrix_Localization rewrites the database
 * name, the label is drawn from it, and the model cache is keyed per id, so
 * each vial carries its own printed strip.
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
    console.error('[Item3D_Diseases] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_Diseases',
    unique: {},
    models: {
      /**
       * A strip of label with text printed across it. Drawn on a canvas and
       * wrapped round the tube, which is the only way the two hundred vials
       * tell each other apart.
       *
       * Returns null where there is no canvas to draw on (a headless harness,
       * a preview that never reaches the DOM); the caller falls back to a
       * blank strip rather than failing to build the vial.
       */
      _printedLabel(text, o) {
        if (typeof document === 'undefined' || !document.createElement) return null;
        let canvas;
        try {
          canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (!ctx || typeof ctx.fillRect !== 'function') return null;
          ctx.fillStyle = o.paper;
          ctx.fillRect(0, 0, 256, 64);
          // The printed rules top and bottom of a lab label.
          ctx.fillStyle = o.ink;
          ctx.fillRect(0, 6, 256, 2);
          ctx.fillRect(0, 56, 256, 2);
          ctx.font = 'bold 20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Long names are squeezed rather than clipped: a label that runs off
          // the strip reads as a bug, a squeezed one reads as a label.
          const width = ctx.measureText ? (ctx.measureText(text).width || 0) : 0;
          if (width > 232 && width > 0) {
            ctx.save();
            ctx.translate(128, 32);
            ctx.scale(232 / width, 1);
            ctx.fillText(text, 0, 0);
            ctx.restore();
          } else {
            ctx.fillText(text, 128, 32);
          }
        } catch (e) {
          return null;
        }
        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace !== undefined) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      },

      /**
       * The name printed on the vial. The item is called "Culture Vial: X",
       * and the label only needs the X: the tube is visibly a tube.
       */
      _vialLabelText(entry) {
        const name = String((entry && entry.name) || '').trim();
        const colon = name.indexOf(':');
        const printed = colon === -1 ? name : name.slice(colon + 1).trim();
        return printed || name;
      },

      /**
       * The one vial. Borosilicate tube, a rubber septum under a crimped
       * aluminium cap, a cloudy fill and a printed label.
       */
      createDiseaseVialModel(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xD4E2E0, {
          roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.42
        });
        const r = 0.013, h = 0.062;

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, this.seg(18, 10)), glass);
        tube.position.y = h / 2;
        group.add(tube);
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.003, this.seg(16, 9)), glass);
        floor.position.y = 0.0015;
        group.add(floor);

        // The culture: cloudy, never bright, and the same in every vial. What
        // is in the tube is not what the player is looking at.
        const broth = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.42, this.seg(16, 9)),
          this._mat(0xB8C0A0, { roughness: 0.35, metalness: 0.0, transparent: true, opacity: 0.85 }));
        broth.position.y = h * 0.21 + 0.002;
        group.add(broth);
        const meniscus = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.0008, this.seg(16, 9)),
          this._mat(0xC8D0AE, { roughness: 0.15, metalness: 0.0 }));
        meniscus.position.y = h * 0.42 + 0.002;
        group.add(meniscus);

        const septum = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.008, this.seg(14, 8)),
          this._mat(0x3A3A44, { roughness: 0.95, metalness: 0.0 }));
        septum.position.y = h + 0.002;
        group.add(septum);
        const crimp = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.007, this.seg(16, 9)),
          this._steel(0xC0C6CC, 0.35));
        crimp.position.y = h + 0.008;
        group.add(crimp);
        const centre = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.002, this.seg(12, 7)),
          this._mat(0x8A2A2A, { roughness: 0.9, metalness: 0.05 }));
        centre.position.y = h + 0.0125;
        group.add(centre);

        // The label: the whole point of the model.
        const texture = this._printedLabel(this._vialLabelText(entry), { paper: '#F2EFE2', ink: '#1E2226' });
        const labelMat = this._mat(0xF2EFE2, {
          roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
        });
        if (texture) labelMat.map = texture;
        const label = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.024, this.seg(20, 11), 1, true,
            // Open the wrap so the strip covers the front three quarters of
            // the tube and the culture still shows down one side.
            -Math.PI * 0.85, Math.PI * 1.7),
          labelMat);
        label.position.y = h * 0.46;
        group.add(label);

        // A biohazard band under the label, printed straight onto the glass,
        // so a vial reads as dangerous even from behind.
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.004, this.seg(18, 10), 1, true),
          this._mat(0xC8A02A, { roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }));
        band.position.y = 0.012;
        group.add(band);
        return group;
      }
    }
  };

  // The shelf itself: two contiguous runs of database ids, every one of them
  // a culture vial and every one of them the same object. They are listed as
  // ranges rather than two hundred lines, and the category mapping underneath
  // catches any vial added later without touching this file.
  const VIAL_RANGES = [[1497, 1568], [1577, 1724]];
  for (const [from, to] of VIAL_RANGES) {
    for (let id = from; id <= to; id++) family.unique['i' + id] = 'createDiseaseVialModel';
  }
  family.categories = { Diseases: 'createDiseaseVialModel' };

  window.ItemModelSystem.registerFamily(family);
})();
