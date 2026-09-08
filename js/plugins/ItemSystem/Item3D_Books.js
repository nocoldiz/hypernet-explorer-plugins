//=============================================================================
// Item 3D Models - Books
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Bespoke 3D models for the library of Items.json.
 * Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Books
 * ============================================================================
 *
 * Eighty volumes, the shop shelf and the esoteric library both. A book is a
 * book: boards, a text block, a spine and whatever the binder put on it.
 * Pretending otherwise would make the shelf read as eighty different
 * objects, which it is not. So every printed volume here is built by one
 * call, and what makes each recognisable
 * is its BINDING: the leather, the page edge, the height and thickness, the
 * raised bands on the spine, and the one device stamped on the cover.
 *
 * Those bindings are declared in the VOLUMES table below, one line per book,
 * and the builders are generated from it. Six entries are not printed volumes
 * at all (the empty spellbook, the two illegible fragments, the loose
 * Mayflower papers, the legal tome on its chain, the illusion grimoire) and
 * those are written out by hand underneath.
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
    console.error('[Item3D_Books] ItemModelSystem not loaded');
    return;
  }

  // One line per printed volume:
  //   cover  the leather or cloth of the boards
  //   edge   the colour of the page block (gilt, red, plain, foxed)
  //   trim   the stamping on the cover and spine
  //   w/d    page size in metres, h the thickness of the block
  //   bands  raised cords across the spine
  //   mark   the device stamped on the front board
  const VOLUMES = {
    // Dante, bound as a matched set of three: same boards, same gilt, and the
    // three canticles only differ in the edge colour.
    263: { cover: 0x3A2A5A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.082, d: 0.115, h: 0.026, bands: 4, mark: 'ring' },
    275: { cover: 0x4A1E1E, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.082, d: 0.115, h: 0.028, bands: 4, mark: 'ring' },
    276: { cover: 0x22305A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.082, d: 0.115, h: 0.024, bands: 4, mark: 'ring' },

    // Scripture: black grain, red edges, a cross on the board. The three
    // books of it match each other and nothing else.
    265: { cover: 0x1A1A1E, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.02, bands: 3, mark: 'cross' },
    278: { cover: 0x1A1A1E, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.026, bands: 3, mark: 'cross' },
    282: { cover: 0x1A1A1E, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.03, bands: 3, mark: 'cross' },
    293: { cover: 0x1A1A1E, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.066, d: 0.096, h: 0.012, bands: 2, mark: 'cross' },

    // Occult printing: dark boards, no gilt, a sigil rather than a title.
    264: { cover: 0x2A1E2A, edge: 0x6A5A3A, trim: 0x8A6A2A, w: 0.076, d: 0.108, h: 0.032, bands: 5, mark: 'sigil' },

    // Nineteenth-century cloth novels: pressed cloth, plain edges, a small
    // device blocked on the front. These are the bulk of the shelf.
    268: { cover: 0x2A4A3A, edge: 0xD8CFAE, trim: 0xC8B078, w: 0.074, d: 0.106, h: 0.024, bands: 3, mark: 'panel' },
    269: { cover: 0x6A2A4A, edge: 0xD8CFAE, trim: 0xE0C860, w: 0.074, d: 0.106, h: 0.022, bands: 3, mark: 'star' },
    270: { cover: 0x6A4A2A, edge: 0xD8CFAE, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.02, bands: 3, mark: 'panel' },
    271: { cover: 0x1E4A4A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.023, bands: 3, mark: 'star' },
    272: { cover: 0x1E4A4A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.021, bands: 3, mark: 'star' },
    273: { cover: 0x7A3A22, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.078, d: 0.11, h: 0.03, bands: 4, mark: 'panel' },
    274: { cover: 0x7A3A22, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.078, d: 0.11, h: 0.028, bands: 4, mark: 'panel' },
    277: { cover: 0xC8B8A0, edge: 0xE8E0C8, trim: 0x8A6A3A, w: 0.07, d: 0.1, h: 0.026, bands: 2, mark: 'panel' },
    279: { cover: 0x2A3A4A, edge: 0xD8CFAE, trim: 0xD0D6DC, w: 0.066, d: 0.096, h: 0.014, bands: 2, mark: 'ring' },
    280: { cover: 0x5A5A2A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.022, bands: 3, mark: 'panel' },
    281: { cover: 0x5A5A2A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.02, bands: 3, mark: 'panel' },
    283: { cover: 0x3A6A3A, edge: 0xE0D8B8, trim: 0xE0C860, w: 0.09, d: 0.09, h: 0.018, bands: 2, mark: 'star' },
    284: { cover: 0xC8A54A, edge: 0xC8A54A, trim: 0x8A6A2A, w: 0.072, d: 0.104, h: 0.024, bands: 3, mark: 'ring' },
    285: { cover: 0x22302A, edge: 0xC0B492, trim: 0xC8B078, w: 0.07, d: 0.1, h: 0.016, bands: 2, mark: 'panel' },
    286: { cover: 0x4A2A5A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.074, d: 0.108, h: 0.022, bands: 4, mark: 'ring' },
    288: { cover: 0x3A4A6A, edge: 0xD8CFAE, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.026, bands: 3, mark: 'panel' },
    290: { cover: 0x4A4E56, edge: 0xC8CCD0, trim: 0xB0B6BC, w: 0.072, d: 0.104, h: 0.022, bands: 3, mark: 'star' },
    291: { cover: 0x5A2A3A, edge: 0xD8CFAE, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.024, bands: 3, mark: 'panel' },
    292: { cover: 0x5A3A7A, edge: 0xD8CFAE, trim: 0xE0C860, w: 0.074, d: 0.106, h: 0.02, bands: 3, mark: 'star' },
    294: { cover: 0x2A3A5A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.074, d: 0.108, h: 0.026, bands: 4, mark: 'panel' },
    296: { cover: 0x2A5A3A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.019, bands: 3, mark: 'star' },
    297: { cover: 0x2A5A3A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.019, bands: 3, mark: 'star' },
    298: { cover: 0x2A5A3A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.019, bands: 3, mark: 'star' },

    // The two odd printings: a proof full of placeholder text, and a bound
    // test copy with nothing blocked on it at all.
    287: { cover: 0xD8D4C8, edge: 0xF0ECE0, trim: 0x9AA0A6, w: 0.07, d: 0.1, h: 0.016, bands: 0, mark: 'panel' },
    295: { cover: 0x8A8E94, edge: 0xE8E4D8, trim: 0x8A8E94, w: 0.066, d: 0.094, h: 0.012, bands: 0, mark: null },
    // The esoteric library (1826-1866). These are older printings and private
    // pressings rather than shop novels, so the boards are darker, the edges
    // are seldom gilt, and the device on the cover is a sigil as often as a
    // rule panel. Grouped the way a shelf of them really is: the Thelemic set
    // matches itself, the alchemical quartos match each other, and the
    // scripture keeps its own binding.
    1826: { cover: 0x4A3A2A, edge: 0xC0B492, trim: 0xC8A54A, w: 0.076, d: 0.108, h: 0.026, bands: 4, mark: 'ring' },
    1827: { cover: 0x2A3A5A, edge: 0xD0C8A8, trim: 0xB0B6BC, w: 0.072, d: 0.104, h: 0.02, bands: 3, mark: 'star' },
    1828: { cover: 0x1A1A1E, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.028, bands: 4, mark: 'cross' },
    1829: { cover: 0x2A2A22, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.086, d: 0.112, h: 0.03, bands: 5, mark: 'sigil' },
    1830: { cover: 0x3A4A4A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.024, bands: 3, mark: 'panel' },
    1831: { cover: 0x2A5A32, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.084, d: 0.115, h: 0.034, bands: 5, mark: 'panel' },
    1832: { cover: 0xE8E4D8, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.016, bands: 2, mark: 'sigil' },
    1833: { cover: 0x2A2A44, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.018, bands: 2, mark: 'sigil' },
    1834: { cover: 0x1E1A28, edge: 0x8A7A4A, trim: 0x8A6A2A, w: 0.078, d: 0.11, h: 0.03, bands: 5, mark: 'sigil' },
    1835: { cover: 0x5A2A2A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.072, d: 0.104, h: 0.026, bands: 4, mark: 'sigil' },
    1836: { cover: 0x4A3A5A, edge: 0xD8CFAE, trim: 0xC8B078, w: 0.07, d: 0.1, h: 0.018, bands: 3, mark: 'panel' },
    1837: { cover: 0x5A2A3A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.016, bands: 3, mark: 'ring' },
    1838: { cover: 0x3A2A22, edge: 0xC0B492, trim: 0x8A6A3A, w: 0.08, d: 0.112, h: 0.032, bands: 5, mark: 'panel' },
    1839: { cover: 0x6A3A1E, edge: 0xC8B078, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.02, bands: 4, mark: 'sigil' },
    1840: { cover: 0x2A4A4A, edge: 0xD0C8A8, trim: 0xC8A54A, w: 0.072, d: 0.104, h: 0.022, bands: 3, mark: 'ring' },
    1841: { cover: 0xC8A54A, edge: 0xC8A54A, trim: 0x8A6A2A, w: 0.072, d: 0.104, h: 0.026, bands: 4, mark: 'panel' },
    1842: { cover: 0x8A6A2A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.024, bands: 4, mark: 'ring' },
    1843: { cover: 0x3A2A4A, edge: 0xC0B492, trim: 0xB08A3A, w: 0.074, d: 0.106, h: 0.022, bands: 4, mark: 'sigil' },
    1844: { cover: 0x4A4A2A, edge: 0xD0C49A, trim: 0xC8A54A, w: 0.078, d: 0.11, h: 0.028, bands: 4, mark: 'sigil' },
    1845: { cover: 0x22305A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.076, d: 0.108, h: 0.03, bands: 5, mark: 'sigil' },
    1846: { cover: 0x2A2A32, edge: 0xC8B078, trim: 0xC8A54A, w: 0.07, d: 0.1, h: 0.018, bands: 3, mark: 'ring' },
    1847: { cover: 0x2A2224, edge: 0xB0A488, trim: 0x8A6A3A, w: 0.076, d: 0.108, h: 0.026, bands: 4, mark: 'panel' },
    1848: { cover: 0x5A3A4A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.066, d: 0.096, h: 0.014, bands: 2, mark: 'cross' },
    1849: { cover: 0x3A4A52, edge: 0xC0B492, trim: 0xB0B6BC, w: 0.074, d: 0.106, h: 0.02, bands: 4, mark: 'ring' },
    1850: { cover: 0x4A3A2A, edge: 0xC8B078, trim: 0x8A6A3A, w: 0.076, d: 0.108, h: 0.024, bands: 4, mark: 'panel' },
    1851: { cover: 0x6A4A22, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.022, bands: 4, mark: 'sigil' },
    1852: { cover: 0x2A2A4A, edge: 0xC0B492, trim: 0xC8A54A, w: 0.078, d: 0.11, h: 0.028, bands: 4, mark: 'star' },
    1853: { cover: 0x3A4A3A, edge: 0xD0C49A, trim: 0xC8B078, w: 0.072, d: 0.104, h: 0.024, bands: 3, mark: 'panel' },
    1854: { cover: 0x2A2A2A, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.066, d: 0.096, h: 0.012, bands: 2, mark: 'cross' },
    1855: { cover: 0x4A2A5A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.078, d: 0.11, h: 0.03, bands: 5, mark: 'sigil' },
    1856: { cover: 0x2A3A4A, edge: 0xC0B492, trim: 0xB0B6BC, w: 0.082, d: 0.115, h: 0.036, bands: 5, mark: 'ring' },
    1857: { cover: 0x5A2A2A, edge: 0x8A2A2A, trim: 0xC8A54A, w: 0.068, d: 0.098, h: 0.016, bands: 2, mark: 'cross' },
    1858: { cover: 0x3A2A3A, edge: 0xC8B078, trim: 0xC8A54A, w: 0.072, d: 0.104, h: 0.02, bands: 3, mark: 'ring' },
    1859: { cover: 0x22303A, edge: 0xD0C8A8, trim: 0xB0B6BC, w: 0.072, d: 0.104, h: 0.024, bands: 3, mark: 'star' },
    1860: { cover: 0x3A3A2A, edge: 0xC0B492, trim: 0x8A6A3A, w: 0.078, d: 0.11, h: 0.026, bands: 4, mark: 'panel' },
    1861: { cover: 0x6A3A2A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.066, d: 0.096, h: 0.014, bands: 2, mark: 'ring' },
    1862: { cover: 0x2A2A5A, edge: 0xC8A54A, trim: 0xC8A54A, w: 0.08, d: 0.112, h: 0.03, bands: 5, mark: 'star' },
    1863: { cover: 0x4A2A6A, edge: 0xD0C8A8, trim: 0xE0C860, w: 0.076, d: 0.108, h: 0.022, bands: 3, mark: 'star' },
    1864: { cover: 0x2A2422, edge: 0xB0A488, trim: 0x8A6A3A, w: 0.074, d: 0.106, h: 0.022, bands: 4, mark: 'sigil' },
    1865: { cover: 0x8A6A2A, edge: 0xD8CFAE, trim: 0xC8A54A, w: 0.074, d: 0.106, h: 0.026, bands: 4, mark: 'ring' },
    1866: { cover: 0x2A2A26, edge: 0xB0A488, trim: 0x8A6A3A, w: 0.078, d: 0.11, h: 0.028, bands: 4, mark: 'sigil' }
  };

  const family = {
    name: 'Item3D_Books',
    unique: {},
    models: {
      /**
       * One printed volume, lying closed: two boards, the text block between
       * them, a rounded spine with raised bands, and one device stamped on
       * the front. Everything that separates one book on this shelf from
       * another is an argument to this call.
       */
      _volume(o) {
        const group = new THREE.Group();
        const board = this._mat(o.cover, { roughness: 0.86, metalness: 0.02 });
        const paper = this._mat(o.edge, { roughness: 0.97, metalness: 0.0 });
        const w = o.w, d = o.d, h = o.h;

        this._slab(group, w, 0.004, d, board, 0.002);
        this._slab(group, w * 0.96, h, d * 0.97, paper, 0.004 + h / 2);
        this._slab(group, w, 0.004, d, board, 0.006 + h);

        // The spine is a half cylinder laid along the hinge edge, which is
        // what makes a bound book read as bound rather than as a box.
        const spine = new THREE.Mesh(
          new THREE.CylinderGeometry((h + 0.008) / 2, (h + 0.008) / 2, d,
            this.seg(12, 7), 1, false, 0, Math.PI), board);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-w / 2, 0.004 + h / 2, 0);
        group.add(spine);

        const trim = this._mat(o.trim, { roughness: 0.42, metalness: 0.7 });
        for (let i = 0; i < (this.wantsTrim() ? (o.bands || 0) : 0); i++) {
          const band = new THREE.Mesh(
            new THREE.CylinderGeometry((h + 0.009) / 2, (h + 0.009) / 2, 0.003,
              this.seg(10, 6), 1, false, 0, Math.PI), trim);
          band.rotation.set(Math.PI / 2, 0, Math.PI / 2);
          band.position.set(-w / 2, 0.004 + h / 2,
            -d / 2 + d * (i + 1) / ((o.bands || 1) + 1));
          group.add(band);
        }

        if (this.wantsTrim() && o.mark) {
          const y = 0.0085 + h;
          let device;
          if (o.mark === 'cross') {
            device = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.026), trim);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0008, 0.004), trim);
            arm.position.set(0, y, -0.004);
            group.add(arm);
          } else if (o.mark === 'ring') {
            device = new THREE.Mesh(
              new THREE.TorusGeometry(0.012, 0.0012, this.seg(5, 3), this.seg(16, 9)), trim);
            device.rotation.x = Math.PI / 2;
          } else if (o.mark === 'star') {
            device = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.0008, 5), trim);
          } else if (o.mark === 'sigil') {
            device = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.0008, 6), trim);
          } else {
            // A blocked rule panel: two lines round the middle of the board.
            device = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.0006, d * 0.55), trim);
            device.scale.y = 1;
          }
          device.position.set(0, y, 0);
          group.add(device);
        }
        return group;
      },

      // 262. Empty Spellbook: ornately bound, as its description says, and
      // open on blank vellum waiting to be written in.
      createEmptySpellbookModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._mat(0x2A2A44, { roughness: 0.8, metalness: 0.05 });
        const vellum = this._mat(0xE8E0C4, { roughness: 0.97, metalness: 0.0 });
        for (const s of [-1, 1]) {
          const cover = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.005, 0.1), board);
          cover.position.set(s * 0.038, 0.004, 0);
          cover.rotation.z = -s * 0.06;
          group.add(cover);
          const leaves = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.01, 0.096), vellum);
          leaves.position.set(s * 0.038, 0.011, 0);
          leaves.rotation.z = -s * 0.06;
          group.add(leaves);
        }
        const gutter = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.1, this.seg(10, 6), 1, false, 0, Math.PI), board);
        gutter.rotation.set(Math.PI / 2, 0, 0);
        gutter.position.y = 0.008;
        group.add(gutter);
        const gold = this._mat(0xC8A54A, { roughness: 0.4, metalness: 0.8 });
        for (const s of [-1, 1]) {
          for (const z of [-0.04, 0.04]) {
            const corner = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0012, 0.012), gold);
            corner.position.set(s * 0.062, 0.0068, z);
            group.add(corner);
          }
        }
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.014), gold);
        clasp.position.set(0.074, 0.006, 0);
        group.add(clasp);
        return group;
      },

      // 266. Fragment 2: a single scorched leaf under glass, the text on it
      // burned past reading. Its twin differs in how it was ruined.
      createFragment2Model(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE0EAEE, {
          roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.28
        });
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0015, 0.05), glass);
        lower.position.y = 0.00075;
        group.add(lower);
        const leaf = this._plate([
          [-0.028, -0.018], [0.026, -0.02], [0.03, 0.012], [0.008, 0.02], [-0.026, 0.016]
        ], 0.0008, this._mat(0xC8B48A, { roughness: 0.98, metalness: 0.0 }));
        leaf.rotation.x = -Math.PI / 2;
        leaf.position.y = 0.0022;
        group.add(leaf);
        const char = this._mat(0x3A2A20, { roughness: 1.0, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const burn = new THREE.Mesh(new THREE.CylinderGeometry(0.006 - i * 0.001, 0.006 - i * 0.001, 0.0006, this.seg(10, 6)), char);
          burn.position.set(0.012 + i * 0.006, 0.0028, -0.01 + i * 0.008);
          group.add(burn);
        }
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0015, 0.05), glass);
        upper.position.y = 0.0038;
        group.add(upper);
        return group;
      },

      // 267. Fragment 3: water-ruined rather than burned, and torn across
      // instead of round, so the pair never reads as the same object.
      createFragment3Model(entry, rand) {
        const group = new THREE.Group();
        const glass = this._mat(0xE0EAEE, {
          roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.28
        });
        const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0015, 0.05), glass);
        lower.position.y = 0.00075;
        group.add(lower);
        const paper = this._mat(0xD8CCB0, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < 2; i++) {
          const piece = this._plate([
            [-0.024, -0.008], [0.024, -0.01], [0.02, 0.008], [-0.022, 0.01]
          ], 0.0008, paper);
          piece.rotation.x = -Math.PI / 2;
          piece.position.set(0, 0.0022, -0.012 + i * 0.024);
          piece.rotation.z = (i ? 1 : -1) * 0.12;
          group.add(piece);
        }
        const stain = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.0006, this.seg(14, 8)),
          this._mat(0xA88A5A, { roughness: 1.0, metalness: 0.0 }));
        stain.position.set(-0.008, 0.0028, 0);
        stain.scale.z = 0.6;
        group.add(stain);
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.0015, 0.05), glass);
        upper.position.y = 0.0038;
        group.add(upper);
        return group;
      },

      // 289. Mayflower Documents: not a book but a bundle of loose sheets tied
      // in a ribbon, with a wax seal on the top one.
      createMayflowerDocumentsModel(entry, rand) {
        const group = new THREE.Group();
        const paper = this._mat(0xE0D6B8, { roughness: 0.98, metalness: 0.0 });
        for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
          const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.0012, 0.105), paper);
          sheet.position.set(i * 0.0012, 0.0006 + i * 0.0014, -i * 0.0015);
          sheet.rotation.y = (i - 2) * 0.02;
          group.add(sheet);
        }
        const ribbon = this._mat(0x8A2A3A, { roughness: 0.9, metalness: 0.02 });
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.108), ribbon);
        band.position.set(0.014, 0.005, 0);
        group.add(band);
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.003, this.seg(14, 8)),
          this._mat(0x8A1E22, { roughness: 0.55, metalness: 0.05 }));
        seal.position.set(0.014, 0.012, 0.03);
        group.add(seal);
        return group;
      },

      // 299. Scholar's Legal Tome: a chained book, the way a library that did
      // not trust its readers kept one.
      createLegalTomeModel(entry, rand) {
        const group = new THREE.Group();
        this._volume.call(this, { cover: 0x2A2620, edge: 0xC0B08A, trim: 0xB0B6BC, w: 0.086, d: 0.12, h: 0.042, bands: 5, mark: 'panel' })
          .children.forEach(c => group.add(c));
        const iron = this._steel(0x6E747C, 0.55);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.03), iron);
        plate.position.set(-0.043, 0.026, 0);
        group.add(plate);
        for (let i = 0; i < (this.wantsTrim() ? 5 : 3); i++) {
          const link = new THREE.Mesh(
            new THREE.TorusGeometry(0.005, 0.0012, this.seg(5, 3), this.seg(10, 6)), iron);
          link.rotation.x = i % 2 ? Math.PI / 2 : 0;
          link.rotation.z = Math.PI / 2;
          link.position.set(-0.056 - i * 0.008, 0.0055, 0);
          group.add(link);
        }
        return group;
      },

      /**
       * A grimoire: a heavy tome bound round a school of magic. Same boards
       * and text block as a printed volume, but clasped shut and carrying the
       * school's own sigil, lit, on the front. The school decides the leather
       * and the light, so a shelf of them reads as a shelf of schools.
       */
      _grimoire(o) {
        const group = new THREE.Group();
        const board = this._mat(o.cover, { roughness: 0.82, metalness: 0.04 });
        const paper = this._mat(o.edge === undefined ? 0xC8B894 : o.edge,
          { roughness: 0.98, metalness: 0.0 });
        const w = 0.082, d = 0.115, h = 0.034;

        this._slab(group, w, 0.005, d, board, 0.0025);
        this._slab(group, w * 0.96, h, d * 0.97, paper, 0.005 + h / 2);
        this._slab(group, w, 0.005, d, board, 0.0075 + h);

        const spine = new THREE.Mesh(
          new THREE.CylinderGeometry((h + 0.01) / 2, (h + 0.01) / 2, d,
            this.seg(12, 7), 1, false, 0, Math.PI), board);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-w / 2, 0.005 + h / 2, 0);
        group.add(spine);

        const metal = this._mat(o.trim === undefined ? 0xB08A3A : o.trim,
          { roughness: 0.4, metalness: 0.8 });
        // Corners and a clasp: a grimoire is a book somebody wanted shut.
        if (this.wantsTrim()) {
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const corner = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0016, 0.012), metal);
              corner.position.set(sx * (w / 2 - 0.008), 0.0095 + h, sz * (d / 2 - 0.008));
              group.add(corner);
            }
          }
        }
        const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.008, h + 0.012, 0.016), metal);
        clasp.position.set(w / 2, 0.006 + h / 2, 0);
        group.add(clasp);

        // The school's sigil, cut into the front board and lit.
        const sigil = new THREE.Mesh(
          new THREE.TorusGeometry(0.018, 0.0022, this.seg(5, 3), o.sides || 6),
          this._glow(o.sigil, o.glowStrength === undefined ? 0.6 : o.glowStrength));
        sigil.rotation.x = Math.PI / 2;
        sigil.position.set(0, 0.0102 + h, 0);
        sigil.userData.pulse = { freq: 0.7, min: 0.35, max: 0.95 };
        group.add(sigil);
        const eye = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.0012, o.sides || 6),
          this._glow(o.sigil, 0.4));
        eye.position.set(0, 0.0102 + h, 0);
        group.add(eye);
        return group;
      },

      /**
       * A skill book: a training manual, not a grimoire. Softbound, printed
       * cover, a bookmark ribbon and no clasp, because nothing in it needs
       * keeping in.
       */
      _skillBook(o) {
        const group = new THREE.Group();
        const cover = this._mat(o.cover, { roughness: 0.75, metalness: 0.05 });
        const paper = this._mat(0xE8E4D0, { roughness: 0.98, metalness: 0.0 });
        const w = 0.07, d = 0.1, h = 0.016;

        this._slab(group, w, 0.002, d, cover, 0.001);
        this._slab(group, w * 0.97, h, d * 0.97, paper, 0.002 + h / 2);
        this._slab(group, w, 0.002, d, cover, 0.003 + h);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.005, h + 0.004, d), cover);
        spine.position.set(-w / 2, 0.002 + h / 2, 0);
        group.add(spine);

        // A blocked band across the cover carrying the trade's colour: the
        // manuals are a series, and a series looks like one.
        const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.0006, d * 0.22),
          this._mat(o.band, { roughness: 0.9, metalness: 0.02 }));
        band.position.set(0, 0.0042 + h, -d * 0.24);
        group.add(band);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0006, 0.026),
          this._mat(0xB02A3A, { roughness: 0.9, metalness: 0.0 }));
        ribbon.position.set(0.012, 0.0026, d * 0.42);
        group.add(ribbon);
        return group;
      },

      createGrimoireModel(entry, rand) {
        const spec = GRIMOIRES[entry && entry.id];
        return this._grimoire(spec || { cover: 0x2A2038, sigil: 0x8A6AE0, trim: 0xB08A3A });
      },

      createSkillBookModel(entry, rand) {
        const spec = SKILL_BOOKS[entry && entry.id];
        return this._skillBook(spec || { cover: 0x3A4A5A, band: 0xC8A54A });
      },

      // 1415. Illusion Grimoire: bound in something that does not hold still.
      // The boards are there, the pages are half absent, and a glyph turns
      // over the covers.
      createIllusionGrimoireModel(entry, rand) {
        const group = new THREE.Group();
        const board = this._mat(0x2A2044, {
          roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.85
        });
        const ghost = this._mat(0xBCA8E8, {
          roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.4,
          emissive: 0x5A3A8A, emissiveIntensity: 0.45
        });
        this._slab(group, 0.078, 0.005, 0.11, board, 0.0025);
        this._slab(group, 0.074, 0.026, 0.106, ghost, 0.018);
        this._slab(group, 0.078, 0.005, 0.11, board, 0.0335);
        const spine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.11, this.seg(12, 7), 1, false, 0, Math.PI), board);
        spine.rotation.set(Math.PI / 2, 0, Math.PI / 2);
        spine.position.set(-0.039, 0.018, 0);
        group.add(spine);
        const glyph = new THREE.Mesh(
          new THREE.TorusGeometry(0.016, 0.0018, this.seg(5, 3), 6), this._glow(0x9A70F0, 0.8));
        glyph.rotation.x = Math.PI / 2;
        glyph.position.y = 0.046;
        glyph.userData.spin = { axis: 'y', speed: 0.5 };
        glyph.userData.pulse = { freq: 1.1, min: 0.35, max: 0.95 };
        group.add(glyph);
        for (let i = 0; i < (this.wantsTrim() ? 3 : 1); i++) {
          const mote = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 5, 4), this._glow(0xD8C0FF, 0.9));
          const a = i * 2.1;
          mote.position.set(Math.cos(a) * 0.026, 0.05 + i * 0.004, Math.sin(a) * 0.026);
          mote.userData.orbit = { radius: 0.026, speed: 0.7, phase: a };
          group.add(mote);
        }
        return group;
      }
    }
  };

  // The printed volumes: one generated builder each, so every book still has
  // its own entry in the dispatch table and its own binding.
  for (const id of Object.keys(VOLUMES)) {
    const spec = VOLUMES[id];
    const name = 'createVolume' + id + 'Model';
    family.models[name] = function () { return this._volume(spec); };
    family.unique['i' + id] = name;
  }

  Object.assign(family.unique, {
    i262: 'createEmptySpellbookModel',
    i266: 'createFragment2Model',
    i267: 'createFragment3Model',
    i289: 'createMayflowerDocumentsModel',
    i299: 'createLegalTomeModel',
    i1415: 'createIllusionGrimoireModel'
  });

  // The grimoires (ids 1400-1439): one line per school. The leather and the
  // sigil are the school's own, so two copies of Meta Magic are the same book
  // and Pyromancy is unmistakably not Cryomancy.
  const GRIMOIRES = {
    1400: { cover: 0x5A1E14, sigil: 0xE0602A, trim: 0xC8A54A, sides: 6 },
    1401: { cover: 0xE8E0C8, sigil: 0xF0E8A0, trim: 0xC8A54A, sides: 8, glowStrength: 0.8 },
    1402: { cover: 0x14141C, sigil: 0x6A2AC8, trim: 0x4A4A56, sides: 5, glowStrength: 0.45 },
    1403: { cover: 0x22221E, sigil: 0x6AC85A, trim: 0x8A8A72, sides: 5 },
    1404: { cover: 0x2A0E12, sigil: 0xC81E3A, trim: 0x8A2A2A, sides: 7, glowStrength: 0.75 },
    1405: { cover: 0x1E2A4A, sigil: 0x8AC8F0, trim: 0xB0B6BC, sides: 8 },
    1406: { cover: 0x2A2A4A, sigil: 0x6A8AE0, trim: 0xC8A54A, sides: 6 },
    1407: { cover: 0x3A3A44, sigil: 0xC8C8D0, trim: 0xB0B6BC, sides: 4 },
    1408: { cover: 0x3A3A44, sigil: 0xC8C8D0, trim: 0xB0B6BC, sides: 4 },
    1409: { cover: 0x3A1E4A, sigil: 0xE060C8, trim: 0xC8A54A, sides: 7 },
    1410: { cover: 0x4A4A2A, sigil: 0xC8C840, trim: 0x8A8A5A, sides: 6 },
    1411: { cover: 0x2A1A2A, sigil: 0xC85AE0, trim: 0x8A6A3A, sides: 5 },
    1412: { cover: 0x2A3A3A, sigil: 0x60E0C8, trim: 0xC8A54A, sides: 8 },
    1413: { cover: 0x3A2E1E, sigil: 0xE0C060, trim: 0xB08A3A, sides: 12 },
    1414: { cover: 0x3A2A1A, sigil: 0xC88A3A, trim: 0x8A6A3A, sides: 6 },
    1416: { cover: 0x2A3A22, sigil: 0x9AE050, trim: 0x6A8A4A, sides: 5 },
    1417: { cover: 0x2A2A5A, sigil: 0x9A8AE0, trim: 0xB0A0D0, sides: 7, glowStrength: 0.45 },
    1418: { cover: 0x1E3A4A, sigil: 0x9AE0F0, trim: 0xC0D8E0, sides: 6 },
    1419: { cover: 0x2A4A3A, sigil: 0x60E090, trim: 0xC8A54A, sides: 8 },
    1420: { cover: 0x22262E, sigil: 0x50C8E0, trim: 0x9AA0A8, sides: 4 },
    1434: { cover: 0x3A1A2A, sigil: 0xE0407A, trim: 0x8A6A3A, sides: 9, glowStrength: 0.7 },
    1435: { cover: 0x2A2A3A, sigil: 0xE0E040, trim: 0xB0B6BC, sides: 5 },
    1438: { cover: 0x1E3A5A, sigil: 0x50A0E0, trim: 0xB0B6BC, sides: 6 },
    1439: { cover: 0x3A4A5A, sigil: 0xC8E8F0, trim: 0xC0C6CC, sides: 7 }
  };

  // The skill books: manuals rather than grimoires, in a series livery.
  const SKILL_BOOKS = {
    1421: { cover: 0x8A2A2A, band: 0xE8E4D8 },
    1422: { cover: 0x3A4A6A, band: 0xC0C6CC },
    1423: { cover: 0x5A4A2A, band: 0x8A6A3A },
    1425: { cover: 0x2A5A4A, band: 0xC8A54A },
    1426: { cover: 0x2A2A32, band: 0xC85A2A },
    1427: { cover: 0xC85A3A, band: 0xF0ECE0 },
    1428: { cover: 0x6A2A5A, band: 0xE0C860 },
    1429: { cover: 0x2A3A5A, band: 0xC8A54A },
    1430: { cover: 0x3A4A3A, band: 0xB0B6BC },
    1431: { cover: 0x22222A, band: 0x8A8A92 },
    1432: { cover: 0x22222A, band: 0x8A8A92 },
    1433: { cover: 0x4A6A3A, band: 0xE0D8B0 },
    1436: { cover: 0x4A2A2A, band: 0xC8A54A },
    1437: { cover: 0x2A4A4A, band: 0xC8C840 },
    1441: { cover: 0x4A4A5A, band: 0xE8E4D8 }
  };

  for (const id of Object.keys(GRIMOIRES)) family.unique['i' + id] = 'createGrimoireModel';
  for (const id of Object.keys(SKILL_BOOKS)) family.unique['i' + id] = 'createSkillBookModel';

  window.ItemModelSystem.registerFamily(family);
})();
