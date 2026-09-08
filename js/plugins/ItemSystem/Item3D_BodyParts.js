//=============================================================================
// Item 3D Models - Body parts
// Version: 1.0.0
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Harvested body parts, shown as the actual part off the creature's
 * own 3D battler. Loaded automatically by ItemSystem/ItemSystemUtils.js.
 * @author AntiGravity
 *
 * @help
 * ============================================================================
 * Item 3D Models - Body parts
 * ============================================================================
 *
 * A harvested arm should be the arm the creature was walking around on, not a
 * second sculpture of one. So nothing here models a body part: it builds the
 * creature's own battler (window.Battler3D, the same models the 3D battle
 * scene uses), lifts the named part out of it and lays it on a surgical tray.
 *
 * The database already says which part of which creature each entry is. Every
 * BodyPart item carries a <Key:> tag, and the tag is written the way
 * Health/BodyParts.json groups them: a key with a dot in it names a creature
 * and its part ("dragon.head"), and the keys after it carry that creature down
 * until the next one ("left_wing" is still the dragon's). So the archetype is
 * read by walking the shelf in id order, not guessed from the item name.
 *
 * The part itself comes out of the battler's own _partMeshMap, which is the
 * same table the battle scene flashes on a hit and hides on dismemberment
 * (Battler3D/3DBattlerSystem.js). If the creature has no 3D model, or its
 * model has no such part, or three.js is not up, the entry falls back to the
 * generic tray in Item3D_Generic.js rather than failing to build.
 *
 * NOT listed in plugins.js; injected at runtime from ITEM3D_FAMILIES in
 * ItemSystemUtils.js.
 * ============================================================================
 */

(() => {
  'use strict';
  if (!window.ItemModelSystem) {
    console.error('[Item3D_BodyParts] ItemModelSystem not loaded');
    return;
  }

  const family = {
    name: 'Item3D_BodyParts',
    unique: {},
    categories: { BodyPart: 'createHarvestedPartModel' },
    models: {
      /**
       * id -> { archetype, part } for the whole BodyPart shelf, built once by
       * walking the database in id order: a dotted <Key:> starts a creature,
       * and the undotted keys after it belong to that same creature.
       */
      _bodyPartIndex() {
        if (this._bodyPartKeys) return this._bodyPartKeys;
        const index = {};
        const list = (typeof $dataItems !== 'undefined' && $dataItems) ? $dataItems : null;
        if (!list) return index;                     // no database yet: caller falls back
        let archetype = '';
        for (const item of list) {
          if (!item || !/<category:\s*BodyPart>/i.test(item.note || '')) continue;
          const m = /<Key:\s*([^>]+)>/i.exec(item.note || '');
          if (!m) continue;
          const key = m[1].trim().toLowerCase();
          const dot = key.indexOf('.');
          if (dot !== -1) archetype = key.slice(0, dot);
          index[item.id] = { archetype: archetype, part: (dot === -1 ? key : key.slice(dot + 1)) };
        }
        this._bodyPartKeys = index;
        return index;
      },

      /**
       * A built battler per archetype, kept for the life of the session. These
       * are never handed to a battle scene, so nothing else disposes them and
       * the parts cloned out of them stay valid.
       */
      _battlerForArchetype(archetype) {
        if (!window.Battler3D || typeof window.Battler3D.create !== 'function') return null;
        if (!this._battlerCache) this._battlerCache = {};
        if (Object.prototype.hasOwnProperty.call(this._battlerCache, archetype)) {
          return this._battlerCache[archetype];
        }
        let battler = null;
        try {
          // No Game_Battler and no weapon: this is a body to take a part from,
          // not a fighter. A null battler also means no dismemberment state,
          // so every part is present on it.
          battler = window.Battler3D.create(archetype, 1.0, 0, null, 0);
          if (battler && typeof battler.load === 'function') {
            // load() is asynchronous: a battler's meshes and its part map do
            // not exist yet when this returns. The first item asked for gets
            // the tray below, so the cached model has to be thrown away once
            // the body is actually standing there, or that first item would
            // wear the fallback for the rest of the session.
            const pending = battler.load(null, 0, 0, 0);
            if (pending && typeof pending.then === 'function') {
              pending.then(() => {
                if (battler._partMeshMap && Object.keys(battler._partMeshMap).length) {
                  window.ItemModelSystem.clearModelCache();
                }
              }, () => {});
            }
          }
        } catch (e) {
          battler = null;
        }
        this._battlerCache[archetype] = battler;
        return battler;
      },

      /** The mesh for one part of one creature, or null. */
      _partMeshFor(archetype, part) {
        const battler = this._battlerForArchetype(archetype);
        const map = battler && battler._partMeshMap;
        if (!map) return null;
        const wanted = String(part || '').toUpperCase();
        if (map[wanted]) return map[wanted];
        // A few parts are named in the plural on the model and the singular in
        // the database, or the other way about.
        const alternates = [wanted + 'S', wanted.replace(/S$/, ''), wanted.replace(/_/g, '')];
        for (const alt of alternates) if (map[alt]) return map[alt];
        return null;
      },

      /**
       * The steel tray a harvested part is laid out on, which is what makes
       * these read as harvested rather than as a creature standing there.
       */
      _surgicalTray(group) {
        const tray = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.005, 0.06),
          this._steel(0xB0B6BC, 0.3));
        tray.position.y = 0.0025;
        group.add(tray);
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(0.042, 0.002, this.seg(5, 3), this.seg(18, 10)),
          this._steel(0x9AA0A8, 0.35));
        lip.rotation.x = Math.PI / 2;
        lip.scale.set(1, 0.72, 1);
        lip.position.y = 0.005;
        group.add(lip);
        return 0.005;
      },

      /**
       * The part off the creature it came from, laid on a tray. The part is
       * cloned, so the battler it came out of is left whole.
       */
      createHarvestedPartModel(entry, rand) {
        const index = this._bodyPartIndex();
        const keyed = index[entry && entry.id];
        // Without the database walk there is no archetype to ask for, and a
        // guessed one would be the wrong creature's arm.
        if (!keyed || typeof THREE === 'undefined') {
          return this.createBodyPartItemModel(entry, rand);
        }
        const mesh = this._partMeshFor(keyed.archetype, keyed.part);
        if (!mesh) return this.createBodyPartItemModel(entry, rand);

        const group = new THREE.Group();
        const trayTop = this._surgicalTray(group);

        let piece;
        try {
          piece = mesh.clone(true);
        } catch (e) {
          return this.createBodyPartItemModel(entry, rand);
        }
        piece.position.set(0, 0, 0);
        piece.rotation.set(0, 0, 0);
        piece.scale.set(1, 1, 1);
        piece.visible = true;
        piece.traverse((o) => { o.visible = true; });

        // Battler parts are built at battle scale, which is metres of monster
        // rather than metres of specimen: bring the part down until it lies on
        // the tray, then lay it on its side the way a part on a tray lies.
        const box = new THREE.Box3().setFromObject(piece);
        if (box.isEmpty()) return this.createBodyPartItemModel(entry, rand);
        const size = box.getSize(new THREE.Vector3());
        const widest = Math.max(size.x, size.y, size.z) || 1;
        const k = 0.058 / widest;
        piece.scale.setScalar(k);
        piece.rotation.z = Math.PI / 2 * (size.y > size.x ? 1 : 0);
        piece.updateMatrixWorld(true);

        const laid = new THREE.Box3().setFromObject(piece);
        const centre = laid.getCenter(new THREE.Vector3());
        piece.position.x -= centre.x;
        piece.position.z -= centre.z;
        piece.position.y += trayTop - laid.min.y;
        group.add(piece);
        return group;
      }
    }
  };

  // The shelf, as one contiguous run of ids. The category mapping above is
  // what actually catches them, so a part added later needs no edit here.
  for (let id = 999; id <= 1317; id++) family.unique['i' + id] = 'createHarvestedPartModel';

  window.ItemModelSystem.registerFamily(family);
})();
