/*:
 * @target MZ
 * @plugindesc Procedural 3D models for Weapon System
 * @author AntiGravity
 * @help
 * Generates procedural 3D models for weapons that do not have custom <3DModel>
 * tags.
 *
 * ============================================================================
 * Where the models live
 * ============================================================================
 * This file is the engine only: seeding, caching, mesh merging, the animation
 * tick and the Sprite_3DWeapon patches. The model builders live in the
 * Weapon3D_* files beside it and are injected at runtime from the
 * WEAPON3D_FAMILIES list at the bottom, the same arrangement 3DBattlerSystem
 * uses for its 3DBattler_* families. None of them belongs in plugins.js.
 *
 * A family registers itself with:
 *
 *   WeaponSystemProcedural.registerFamily({
 *     name:   'Weapon3D_Swords',
 *     unique: { 57: 'createLongSwordModel' },   // per database id, optional
 *     models: { createLongSwordModel(weapon, rand) { ... } }
 *   });
 *
 * Dispatch order for a weapon with no <3DModel>: its bespoke model (by
 * database id) -> a note tag in NOTE_MODELS -> whip/flail -> its weapon type.
 * A family that fails to load costs only the models it carried.
 *
 * ============================================================================
 * Seeding
 * ============================================================================
 * A weapon's appearance is world-persistent procedural content, so every
 * colour, proportion and trinket is drawn from HistorySimulator's world seed
 * mixed with the weapon id (seedFor / worldSeed). The same sword looks the
 * same in every savegame of a world and different in the next one.
 *
 * ============================================================================
 * Cost
 * ============================================================================
 * The overlay can be drawing at the same time as the 3D battler scene, so:
 *   - a built weapon is cached and handed out as a clone (shared geometry and
 *     textures, per-instance materials), which is ~30x cheaper than rebuilding
 *   - meshes that never move relative to the model are merged into one buffer
 *     per material, taking a decorated weapon from ~60 draw calls to a handful
 *   - while 3D battlers are on (switch 70), every radial geometry drops a tier
 *     and decorative trim is skipped: about 40% fewer triangles, same
 *     silhouettes
 *
 * ============================================================================
 * Moving parts
 * ============================================================================
 * Attack animations are whole-model keyframes from
 * js/db/Sprites/MovementKeyFrame3d.json. A model can additionally declare
 * moving parts of its own, as plain data on userData so a cached model can
 * still be cloned: spin, sway, bob, orbit and pulse. See tickModelParts.
 */

var WeaponSystemProcedural = {
  // mulberry32: cheap, well distributed, and (unlike the old abs(sin) chain)
  // it does not fall into short cycles for neighbouring seeds, which is what
  // made whole runs of consecutive weapon ids come out looking alike.
  createSeededRandom(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // ============================================================
  // World seeding
  // ============================================================
  // A weapon's appearance is world-persistent procedural content, so it hangs
  // off the canonical world-RNG root (HistorySimulator's seed) rather than the
  // database id alone: the same Kukri looks the same in every savegame of a
  // world and different in the next world.
  WEAPON_SEED_SALT: 0x5745_4150, // "WEAP"

  worldSeed() {
    try {
      if (window.HistoryManager && typeof window.HistoryManager.getSeed === 'function') {
        const s = Number(window.HistoryManager.getSeed());
        if (Number.isFinite(s)) return s >>> 0;
      }
    } catch (e) { /* history not booted yet (title screen previews) */ }
    return 19002001;
  },

  /**
   * A forged piece (Quest/ThinkerMenu.js) is materialized as a brand
   * new database entry, with its own id past FORGE_ID_BASE, so anything keyed
   * on database id (the bespoke model table, a house finish) would otherwise
   * lose track of what the piece actually is the moment it leaves the anvil.
   * The anvil writes the id it was forged from onto the piece as
   * `<ForgeBaseId:>`; every id-keyed lookup goes through here instead of
   * reading weapon.id directly, so a forged claw still finds its bespoke claw
   * model and a forged Varlenia piece still wears its house gold.
   */
  dispatchIdFor(weapon) {
    const raw = weapon && weapon.meta && weapon.meta.ForgeBaseId;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : ((weapon && weapon.id) || 0);
  },

  /** Deterministic per-weapon seed derived from the world seed. */
  seedFor(weapon) {
    // A piece beaten out at the anvil carries the seed it was previewed under,
    // so what the smith looked at is what came off the fire.
    const forged = weapon && weapon.meta && weapon.meta.ForgeSeed;
    if (forged) {
      const n = Number(forged);
      if (Number.isFinite(n)) return n >>> 0;
    }
    const id = (weapon && weapon.id) || 0;
    let h = (this.worldSeed() ^ this.WEAPON_SEED_SALT) >>> 0;
    h = Math.imul(h ^ (id + 0x9E3779B9), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  },

  _textureCache: {},

  // Source art is 750x750 (and the effect PNGs are larger still), while a
  // weapon covers a few hundred screen pixels through a nearest-neighbour PSX
  // filter. Uploading the originals cost ~2.25 MB of VRAM each and a full-size
  // decode on the frame the weapon appeared, so every texture is downsampled
  // into a small power-of-two canvas instead (POT also makes RepeatWrapping
  // legal, which it never was at 750px).
  TEXTURE_SIZE: 128,

  /**
   * Where a finish name lives on disk. Three banks answer to one list of
   * names: the seamless stone and marble sheets in `img/textures/`, the effect
   * plates under `effects/`, and the strange bank the dream keeps, whose names
   * carry a `dream/` prefix so nothing else can collide with them.
   */
  DREAM_PREFIX: 'dream/',

  texturePath(filename) {
    const name = String(filename || '');
    if (name.startsWith(this.DREAM_PREFIX)) return `img/dreamtextures/${name.slice(this.DREAM_PREFIX.length)}`;
    return name.endsWith('.jpg')
      ? `img/textures/${name}`
      : `effects/MAGICALxSPIRAL/Texture/${name}`;
  },

  getTexture(filename) {
    if (!filename) return null;
    if (typeof THREE === 'undefined') return null;
    const path = this.texturePath(filename);
    if (this._textureCache[path]) {
      return this._textureCache[path];
    }

    const size = this.TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // Neutral grey stand-in until the bitmap arrives, so the material shows its
    // own colour instead of flashing black.
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // Mark as a shared/cached singleton so per-model disposal never frees it
    // (this texture is reused by every weapon model that draws the same type).
    texture._weaponSharedCache = true;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      texture.needsUpdate = true;
    };
    img.onerror = () => { /* keep the neutral placeholder */ };
    img.src = path;

    this._textureCache[path] = texture;
    return texture;
  },

  /**
   * Picks a texture for a material class.
   * @param {function} rand - seeded RNG
   * @param {string} type - material class (blade/heavy/wood/magic/gun/default)
   * @param {object} [memo] - per-model cache; parts of the same class share one
   *   texture instead of pulling a separate bitmap each. The RNG is still
   *   consumed on every call so a weapon's seeded appearance is unchanged.
   */
  getRandomTexture(rand, type, memo) {
    const list = this.getTexturesForType(type);
    if (!list || list.length === 0) return null;
    const filename = list[Math.floor(rand() * list.length)];
    if (memo) {
      if (memo[type] === undefined) memo[type] = this.getTexture(filename);
      return memo[type];
    }
    return this.getTexture(filename);
  },

  /**
   * The finish a forged piece was given at the anvil, if any.
   * `<ForgeTexture: teal_marble.jpg>` names one of getTexturesForType()'s files.
   */
  forcedTextureFor(weapon) {
    const raw = weapon && weapon.meta && weapon.meta.ForgeTexture;
    const name = raw ? String(raw).trim() : '';
    return name ? this.getTexture(name) : null;
  },

  /**
   * The strange bank (img/dreamtextures/): public-domain faces and unearthly
   * surfaces. It is deliberately kept OUT of the class lists below, because
   * those are what a weapon's seeded appearance is drawn from and lengthening
   * one would re-roll every weapon in every world. It is offered as a choice
   * instead: the finishes the anvil lays out beside the marbles, and the sheets
   * a dream re-dresses what you are holding with.
   */
  DREAM_TEXTURES: [
      'dream/face_anatomical_wax_1.jpg', 'dream/face_anatomical_wax_2.jpg', 'dream/face_arcimboldo_1.jpg', 'dream/face_arcimboldo_2.jpg',
      'dream/face_bosch_detail_1.jpg', 'dream/face_bosch_detail_2.jpg', 'dream/face_character_head_1.jpg', 'dream/face_character_head_2.jpg',
      'dream/face_death_mask_1.jpg', 'dream/face_death_mask_2.jpg', 'dream/face_demon_1.jpg', 'dream/face_demon_2.jpg',
      'dream/face_ensor_mask_2.jpg', 'dream/face_gargoyle_1.jpg', 'dream/face_gargoyle_2.jpg', 'dream/face_goya_grotesque_1.jpg',
      'dream/face_goya_grotesque_2.jpg', 'dream/face_grotesque_1.jpg', 'dream/face_grotesque_2.jpg', 'dream/face_mask_noh_1.jpg',
      'dream/face_mask_noh_2.jpg', 'dream/face_mask_ritual_1.jpg', 'dream/face_mask_ritual_2.jpg', 'dream/face_mummy_portrait_1.jpg',
      'dream/face_mummy_portrait_2.jpg', 'dream/face_phrenology_1.jpg', 'dream/face_phrenology_2.jpg', 'dream/face_skull_engraving_1.jpg',
      'dream/face_skull_engraving_2.jpg', 'dream/marbled_paper_1.jpg', 'dream/marbled_paper_2.jpg'
  ],

  getTexturesForType(type) {
    const generalTextures = [
      'amber_onyx_marble.jpg', 'amber_paper.jpg', 'beige_sandstone.jpg', 'blue_slate.jpg', 'bright_gold.jpg',
      'brown_green_marble.jpg', 'brown_grey_slate.jpg', 'brown_leather_stone.jpg', 'brown_stone.jpg', 'burnt_orange_rock.jpg',
      'charcoal_brown_stone.jpg', 'copper_brown_stone.jpg', 'copper_patina.jpg', 'cracked_earth.jpg', 'cream_pastel_marble.jpg',
      'crimson_psychedelic.jpg', 'dark_brown_marble.jpg', 'dark_gold_foil.jpg', 'dark_gold_swirl.jpg', 'dark_green_smoke_marble.jpg',
      'dark_grey_smoke.jpg', 'dark_moss_marble.jpg', 'dark_mossy_slate.jpg', 'dusty_pink_stone.jpg', 'emerald_marble.jpg',
      'fire.jpg', 'gold_parchment.jpg', 'golden_brown_leather.jpg', 'golden_olive_marble.jpg', 'golden_sandstone.jpg',
      'green_gold_marble.jpg', 'green_marble.jpg', 'green_patina_marble.jpg', 'grey_brown_watercolor.jpg', 'grey_cloud_concrete.jpg',
      'grey_concrete.jpg', 'grey_green_marble.jpg', 'grey_green_slate.jpg', 'grey_marble.jpg', 'grey_pink_stone.jpg',
      'grey_smoke_marble.jpg', 'grey_smoky_marble.jpg', 'grey_teal_stone.jpg', 'iridescent_oil.jpg', 'khaki_stone.jpg',
      'lavender_stucco.jpg', 'magenta_psychedelic.jpg', 'malachite.jpg', 'mauve_brown_rock.jpg', 'mauve_rock.jpg',
      'mauve_stucco.jpg', 'molten_gold.jpg', 'mossy_green_rock.jpg', 'mottled_tan_stone.jpg', 'mustard_marble.jpg',
      'ochre_watercolor_stone.jpg', 'olive_cloudy_marble.jpg', 'olive_cracked_marble.jpg', 'olive_cracked_rock.jpg', 'olive_gold_concrete.jpg',
      'olive_grey_stone.jpg', 'olive_leather_stone.jpg', 'olive_mottled_stone.jpg', 'olive_parchment.jpg', 'olive_peach_stone.jpg',
      'olive_striated_rock.jpg', 'olive_swirl_stone.jpg', 'pale_gold_stone.jpg', 'pale_sage_stone.jpg', 'peach_stone.jpg',
      'pink_rainbow_swirl.jpg', 'psychedelic_marble.jpg', 'red_marble.jpg', 'red_teal_marble.jpg', 'rust_copper_marble.jpg',
      'sage_cloud_marble.jpg', 'sage_green_stone.jpg', 'sage_grey_stone.jpg', 'sage_plaster.jpg', 'sage_rippled_stone.jpg',
      'sage_weathered_stone.jpg', 'sandstone.jpg', 'tan_cloud_stone.jpg', 'tan_cloudy_stone.jpg', 'tan_pink_marble.jpg',
      'tan_stone.jpg', 'taupe_cloud_marble.jpg', 'taupe_grey_cloud_stone.jpg', 'taupe_marble.jpg', 'taupe_stone.jpg',
      'taupe_watercolor_marble.jpg', 'teal_marble.jpg', 'teal_patina_stone.jpg', 'turquoise_verdigris.jpg', 'violet_psychedelic.jpg',
      'warm_brown_cloud_stone.jpg', 'warm_grey_stone.jpg', 'weathered_concrete.jpg', 'yellow_green_marble.jpg', 'yellow_green_moss_marble.jpg'
    ];

    switch(type) {
      case 'dream':
        return this.DREAM_TEXTURES;
      case 'gun':
        return ['ExperimentalNoise.png', 'ExperimentalBlur.png', 'PolkaDot.png', 'Thunder10.png', 'blue_fire.png', 'magma.png', 'cell_trans2048.png', 'Glass.png', ...generalTextures.slice(0, 20)];
      case 'blade':
        return ['Sword001.png', 'Sword002.png', 'StanBlade.png', 'Line02.png', 'Thunder_Bold.png', 'Direction.png', ...generalTextures.slice(20, 40)];
      case 'heavy':
        return ['Hammer1.png', 'magma.png', 'Thunder_Bold.png', 'ExperimentalNoise.png', 'cell_trans2048.png', ...generalTextures.slice(40, 60)];
      case 'wood':
        return ['Line02.png', 't0007.png', 't0003.png', ...generalTextures.slice(60, 80)];
      case 'magic':
        return ['MagicCircle1.png', 'MagicCircle3.png', 'MagicCircle5.png', 'Aurora.png', 'Crystal001.png', 'Crystal002.png', ...generalTextures.slice(80, 100)];
      default:
        return ['Line02.png', 't0003.png', 'Spark001.png', 'Particle01.png', ...generalTextures];
    }
  },

  // ============================================================
  // Render budget
  // ============================================================
  // The weapon overlay can be on screen at the same time as the 3D battler
  // scene, which is by far the heavier of the two: when it is, every radial
  // geometry drops a tier and the optional trinkets (extra rivets, spare
  // gems, grip rings) are skipped. Nothing about the silhouette changes, so a
  // weapon is still recognisably itself at either budget.
  _lowDetail: false,
  _lowDetailCheckedAt: 0,

  isLowDetail() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // Re-asking every build would be free, but this is also read from inside
    // geometry loops; a second of staleness costs nothing.
    if (now - this._lowDetailCheckedAt < 1000) return this._lowDetail;
    this._lowDetailCheckedAt = now;
    let low = false;
    try {
      if (window.$gameSwitches && window.$gameSwitches.value(70)) low = true;
      if (window.ConfigManager && ConfigManager.battler3D) low = true;
    } catch (e) { /* outside a running game */ }
    this._lowDetail = low;
    return low;
  },

  /** Radial/height segment count for the current budget, floored at `min`. */
  seg(n, min) {
    const floor = min || 3;
    if (!this.isLowDetail()) return Math.max(floor, n);
    return Math.max(floor, Math.round(n * 0.6));
  },

  /** True when a purely decorative part is worth building. */
  wantsTrim() {
    return !this.isLowDetail();
  },

  // Which constructor arguments of a THREE primitive are segment counts, and
  // how far each may be cut. Used to put the whole back catalogue of models on
  // the same budget as the ones that call seg() by hand.
  GEOMETRY_SEGMENT_ARGS: {
    CylinderGeometry: [[3, 5], [4, 1]],
    ConeGeometry: [[2, 4], [3, 1]],
    SphereGeometry: [[1, 5], [2, 4]],
    TorusGeometry: [[2, 3], [3, 6]],
    TorusKnotGeometry: [[2, 8], [3, 4]],
    RingGeometry: [[1, 6], [2, 1]],
    CircleGeometry: [[1, 6]],
    LatheGeometry: [[1, 5]],
    TubeGeometry: [[1, 3], [3, 3]],
    PlaneGeometry: [[2, 1], [3, 1]],
    BoxGeometry: [[3, 1], [4, 1], [5, 1]],
    DodecahedronGeometry: [[1, 0]],
    IcosahedronGeometry: [[1, 0]],
    OctahedronGeometry: [[1, 0]],
    TetrahedronGeometry: [[1, 0]],
    SphereBufferGeometry: [[1, 5], [2, 4]]
  },

  /**
   * Temporarily thins every radial geometry THREE hands out. Returns the undo
   * function. This is what makes the low-detail budget apply to the models
   * that were written before it existed, not only to the ones calling seg().
   */
  _patchGeometryBudget() {
    if (!this.isLowDetail() || typeof THREE === 'undefined') return function () {};
    const saved = [];
    for (const name of Object.keys(this.GEOMETRY_SEGMENT_ARGS)) {
      const Original = THREE[name];
      if (typeof Original !== 'function') continue;
      const spec = this.GEOMETRY_SEGMENT_ARGS[name];
      saved.push([name, Original]);
      const Budgeted = function (...args) {
        for (const [index, floor] of spec) {
          const v = args[index];
          if (typeof v === 'number' && v > floor) args[index] = Math.max(floor, Math.round(v * 0.6));
        }
        return new Original(...args);
      };
      Budgeted.prototype = Original.prototype;
      THREE[name] = Budgeted;
    }
    return function () {
      for (const [name, Original] of saved) THREE[name] = Original;
    };
  },

  // ============================================================
  // Built-model cache
  // ============================================================
  // Building a weapon costs 2-5ms of geometry generation plus a fresh GPU
  // upload for every one of its (up to 60) meshes, and the equip screen, the
  // forge preview and a battle re-equip all rebuild the same handful of
  // weapons over and over. A built weapon is therefore kept as a prototype and
  // handed out as a clone: THREE's clone shares geometry and material by
  // reference, so a repeat costs one small object tree and zero uploads.
  //
  // Clone copies userData through JSON, which is exactly why every per-part
  // animation below is stored as plain data rather than a closure.
  _modelCache: new Map(),
  MODEL_CACHE_MAX: 24,

  /** Neutralises dispose() on a prototype's shared resources. */
  _protectResources(root) {
    const seen = new Set();
    const protect = (res) => {
      if (!res || seen.has(res)) return;
      seen.add(res);
      if (res._weaponProtected) return;
      res._weaponProtected = true;
      if (typeof res.dispose === 'function') {
        res._realDispose = res.dispose;
        res.dispose = function () { /* owned by the weapon model cache */ };
      }
    };
    root.traverse((obj) => {
      if (obj.geometry) protect(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(protect);
        else protect(obj.material);
      }
    });
  },

  /** Gives a prototype's resources their dispose() back, without freeing. */
  _freePrototypeProtection(root) {
    if (!root) return;
    const restore = (res) => {
      if (!res || !res._realDispose) return;
      res.dispose = res._realDispose;
      res._realDispose = null;
      res._weaponProtected = false;
    };
    root.traverse((obj) => {
      if (obj.geometry) restore(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(restore);
        else restore(obj.material);
      }
    });
  },

  _freePrototype(root) {
    if (!root) return;
    const seen = new Set();
    const free = (res) => {
      if (!res || seen.has(res)) return;
      seen.add(res);
      if (res._realDispose) {
        res.dispose = res._realDispose;
        res._realDispose = null;
        res._weaponProtected = false;
      }
      // Textures from getTexture() are shared by every model and never freed.
      if (typeof res.dispose === 'function' && !res._weaponSharedCache) res.dispose();
    };
    root.traverse((obj) => {
      if (obj.geometry) free(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(free);
        else free(obj.material);
      }
    });
  },

  clearModelCache() {
    for (const entry of this._modelCache.values()) this._freePrototype(entry);
    this._modelCache.clear();
  },

  /**
   * Hands out a usable copy of a cached prototype.
   *
   * Geometry (the expensive half: it owns the GPU buffers) is shared with the
   * prototype. Materials are NOT: callers legitimately reshade what they were
   * given, and the title screen in particular brightens every material of the
   * artifact it is showing, which would otherwise repaint the same weapon
   * everywhere else in the game. Cloning them costs a few uniform objects and
   * no upload, since the texture reference goes across untouched.
   */
  _instance(prototype) {
    const copy = prototype.clone(true);
    const seen = new Map();
    copy.traverse((obj) => {
      if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return;
      let mat = seen.get(obj.material);
      if (!mat) {
        mat = obj.material.clone();
        seen.set(obj.material, mat);
      }
      obj.material = mat;
    });
    return copy;
  },

  createModel(weapon) {
    if (!window.THREE || !weapon) return null;

    // The finish and the seed are part of the key: the forge previews the same
    // database entry under a dozen different skins before anything is made.
    const meta = weapon.meta || {};
    const key = this.worldSeed() + ':' + (weapon.id || 0) +
      ':' + (meta.ForgeSeed || '') + ':' + (meta.ForgeTexture || '') +
      ':' + (this.isLowDetail() ? 'lo' : 'hi') +
      // The vector gun's form and element are part of what it looks like.
      ':' + ((window.VectorGun && window.VectorGun.isVectorGun(weapon)) ? window.VectorGun.modelKey() : '');
    const cached = this._modelCache.get(key);
    if (cached) {
      // Map preserves insertion order, so re-inserting is the whole LRU touch.
      this._modelCache.delete(key);
      this._modelCache.set(key, cached);
      return this._instance(cached);
    }

    const root = this._buildModel(weapon);
    if (!root) return null;

    // A rope weapon carries live simulation state (point masses holding mesh
    // references) in userData, which clone() would flatten into dead JSON.
    if (root.userData._verletRope || root.userData._verletRopes) return root;

    try {
      this.mergeStaticParts(root);
      this._protectResources(root);
      this._modelCache.set(key, root);
      while (this._modelCache.size > this.MODEL_CACHE_MAX) {
        const oldest = this._modelCache.keys().next().value;
        const victim = this._modelCache.get(oldest);
        this._modelCache.delete(oldest);
        // Instances handed out earlier still point at this geometry. Freeing
        // it releases the GPU copy only; THREE re-uploads from the attribute
        // arrays the next time one of them is drawn, so the worst an evicted
        // weapon still on screen can cost is a single re-upload. The cache is
        // small enough that the two weapons in a battle are never the victims.
        this._freePrototype(victim);
      }
      return this._instance(root);
    } catch (e) {
      console.warn('[WeaponSystemProcedural] model caching failed, using one-off model', e);
      this._modelCache.delete(key);
      this._freePrototypeProtection(root);
      return root;
    }
  },

  // ============================================================
  // Static mesh merging
  // ============================================================
  // A procedural weapon is built out of dozens of small primitives, and every
  // one of them was a draw call with its own uniform upload. Meshes that never
  // move relative to the model are baked into one buffer per material, which
  // takes a heavily decorated weapon from ~60 draw calls to a handful. Parts
  // that DO move (rope links, anything carrying an animation descriptor, and
  // everything under a group marked dynamic) are left alone.
  mergeStaticParts(root) {
    if (!root || typeof THREE === 'undefined' || !THREE.BufferGeometry) return root;

    const isMoving = (obj) => {
      const ud = obj.userData;
      return !!(ud && (ud.dynamic || ud.spin || ud.bob || ud.pulse || ud.orbit || ud.sway || ud._chainAlternate !== undefined));
    };

    root.updateMatrixWorld(true);

    // A moving part is its own merge root: the gears of a clockwork weapon
    // still collapse to one buffer each, they just do not collapse into the
    // weapon around them.
    const anchors = [root];
    root.traverse((obj) => { if (obj !== root && isMoving(obj)) anchors.push(obj); });

    // Nearest moving ancestor decides which anchor a mesh belongs to.
    const anchorOf = (obj) => {
      let node = obj;
      while (node) {
        if (node === root || isMoving(node)) return node;
        node = node.parent;
      }
      return root;
    };

    const removals = [];
    const inverse = new THREE.Matrix4();
    const local = new THREE.Matrix4();

    for (const anchor of anchors) {
      const buckets = new Map();
      anchor.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry || !obj.material) return;
        if (Array.isArray(obj.material)) return;   // multi-material, left as-is
        if (obj.geometry.morphAttributes && Object.keys(obj.geometry.morphAttributes).length) return;
        if (isMoving(obj)) return;                 // an anchor never merges itself away
        if (anchorOf(obj.parent) !== anchor) return;
        const key = obj.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: obj.material, meshes: [] });
        buckets.get(key).meshes.push(obj);
      });

      inverse.copy(anchor.matrixWorld).invert();
      for (const bucket of buckets.values()) {
        if (bucket.meshes.length < 2) continue;
        const parts = [];
        for (const mesh of bucket.meshes) {
          const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          local.multiplyMatrices(inverse, mesh.matrixWorld);
          geo.applyMatrix4(local);
          parts.push(geo);
          removals.push(mesh);
        }
        const merged = this._concatGeometries(parts);
        for (const g of parts) g.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.userData._merged = true;
        anchor.add(mesh);
      }
    }

    for (const mesh of removals) {
      if (mesh.parent) mesh.parent.remove(mesh);
      if (mesh.geometry && typeof mesh.geometry.dispose === 'function') mesh.geometry.dispose();
    }

    return root;
  },

  /**
   * Concatenates non-indexed geometries that all carry position (and, where
   * present in every part, normal/uv). Written out here because the three
   * build the game ships does not include BufferGeometryUtils.
   */
  _concatGeometries(geometries) {
    if (!geometries.length) return null;
    const wantNormal = geometries.every(g => g.attributes.normal);
    const wantUv = geometries.every(g => g.attributes.uv);

    let total = 0;
    for (const g of geometries) {
      if (!g.attributes.position) return null;
      total += g.attributes.position.count;
    }

    const position = new Float32Array(total * 3);
    const normal = wantNormal ? new Float32Array(total * 3) : null;
    const uv = wantUv ? new Float32Array(total * 2) : null;

    let v = 0;
    for (const g of geometries) {
      const p = g.attributes.position;
      position.set(p.array.subarray(0, p.count * 3), v * 3);
      if (normal) normal.set(g.attributes.normal.array.subarray(0, p.count * 3), v * 3);
      if (uv) uv.set(g.attributes.uv.array.subarray(0, p.count * 2), v * 2);
      v += p.count;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(position, 3));
    if (normal) out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  },

  // ============================================================
  // Per-part animation
  // ============================================================
  // Unique weapons carry moving parts (spinning gears, drifting memory shards,
  // pulsing runes). They are declared as plain data on the part's userData so
  // that a cached model can still be cloned, and driven from one traversal:
  //
  //   spin  { axis:'x'|'y'|'z', speed }            radians per second
  //   bob   { axis, amp, freq, phase }             offset from its rest position
  //   sway  { axis, amp, freq, phase }             rotation wobble, radians
  //   orbit { radius, speed, phase, plane:'xz' }   circles its rest position
  //   pulse { min, max, freq, phase }              material emissive intensity
  tickModelParts(model, deltaMs) {
    if (!model) return;
    let parts = model._weaponAnimParts;
    if (!parts) {
      parts = [];
      model.traverse((obj) => {
        const ud = obj.userData;
        if (!ud) return;
        if (ud.spin || ud.bob || ud.sway || ud.orbit || ud.pulse) {
          ud._rest = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
          ud._restRot = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
          parts.push(obj);
        }
      });
      model._weaponAnimParts = parts;
    }
    if (parts.length === 0) return;

    model._weaponAnimTime = (model._weaponAnimTime || 0) + deltaMs / 1000;
    const t = model._weaponAnimTime;

    for (let i = 0; i < parts.length; i++) {
      const obj = parts[i];
      const ud = obj.userData;
      if (ud.spin) {
        const ax = ud.spin.axis || 'y';
        obj.rotation[ax] = ud._restRot[ax] + t * (ud.spin.speed || 1);
      }
      if (ud.sway) {
        const ax = ud.sway.axis || 'z';
        obj.rotation[ax] = ud._restRot[ax] + Math.sin(t * (ud.sway.freq || 1) + (ud.sway.phase || 0)) * (ud.sway.amp || 0.1);
      }
      if (ud.bob) {
        const ax = ud.bob.axis || 'y';
        obj.position[ax] = ud._rest[ax] + Math.sin(t * (ud.bob.freq || 1) + (ud.bob.phase || 0)) * (ud.bob.amp || 0.01);
      }
      if (ud.orbit) {
        const a = t * (ud.orbit.speed || 1) + (ud.orbit.phase || 0);
        const r = ud.orbit.radius || 0.02;
        if (ud.orbit.plane === 'xy') {
          obj.position.x = ud._rest.x + Math.cos(a) * r;
          obj.position.y = ud._rest.y + Math.sin(a) * r;
        } else if (ud.orbit.plane === 'yz') {
          obj.position.y = ud._rest.y + Math.cos(a) * r;
          obj.position.z = ud._rest.z + Math.sin(a) * r;
        } else {
          obj.position.x = ud._rest.x + Math.cos(a) * r;
          obj.position.z = ud._rest.z + Math.sin(a) * r;
        }
      }
      if (ud.pulse && obj.material && obj.material.emissive) {
        const p = ud.pulse;
        const k = (Math.sin(t * (p.freq || 1) + (p.phase || 0)) + 1) / 2;
        obj.material.emissiveIntensity = (p.min || 0) + ((p.max !== undefined ? p.max : 1) - (p.min || 0)) * k;
      }
    }
  },

  _buildModel(weapon) {
    if (!window.THREE) return null;

    const rand = this.createSeededRandom(this.seedFor(weapon));
    const wtypeId = weapon.wtypeId || 1;
    const note = weapon.note || '';

    // A piece that came off the forge with a finish chosen at the anvil wears
    // that finish instead of the one its seed would have dealt it
    // (Quest/ThinkerMenu.js writes the tag when the piece is made).
    const forcedTex = this.forcedTextureFor(weapon);

    const OriginalMeshStandardMaterial = THREE.MeshStandardMaterial;
    // One texture per material class per weapon instead of one per material.
    const texMemo = {};

    // Dynamically override THREE.MeshStandardMaterial during synchronous procedural generation
    THREE.MeshStandardMaterial = function(parameters) {
      const params = { ...parameters };
      let type = 'default';
      if (params.metalness > 0.6) {
        if (params.roughness < 0.3) {
          type = 'blade';
        } else {
          type = 'heavy';
        }
      } else if (params.roughness > 0.8) {
        type = 'wood';
      } else if (params.emissive) {
        type = 'magic';
      } else if (wtypeId === 9 || note.match(/<RocketLauncher>|<Minigun>|<Flamethrower>|<Shotgun>|<SniperRifle>|<SMG>/i)) {
        type = 'gun';
      }
      
      // The RNG is consumed either way, so a chosen finish never shifts the
      // rest of the model's seeded appearance.
      const rolled = WeaponSystemProcedural.getRandomTexture(rand, type, texMemo);
      const tex = forcedTex || rolled;
      if (tex) {
        params.map = tex;
      }
      return new OriginalMeshStandardMaterial(params);
    };
    THREE.MeshStandardMaterial.prototype = OriginalMeshStandardMaterial.prototype;
    const restoreGeometry = this._patchGeometryBudget();

    try {
      // An empty hand: the fist is chosen by the character's archetype, not
      // by any database entry.
      if (weapon.unarmedArchetype) return this.finish(this.buildUnarmed(weapon, rand), weapon);

      // A shield has no weapon type to fall back on, so it never reaches the
      // TYPE_MODELS table below.
      if (weapon.shieldArmorId) return this.finish(this.build('createShieldModel', weapon, rand), weapon);

      // Bespoke per-weapon models, keyed by database id exactly like the i18n
      // name/description tables are. A weapon that has one never falls back to
      // the generic silhouette for its type.
      // The vector gun folded into one of its shapes is a different weapon in
      // the hand, so it is a different model (Weapon/VectorGunSystem.js). The
      // Blade of Thelema has a builder written for it; every other shape is
      // built as its weapon type and then taken over by the element the gun is
      // set to strike with, so a fitted lance is unmistakably the same weapon.
      if (window.VectorGun && window.VectorGun.isVectorGun(weapon) && window.VectorGun.inBlade()) {
        const builder = window.VectorGun.formBuilder() ||
          this.TYPE_MODELS[window.VectorGun.formWeaponType()] || 'createSwordModel';
        const model = this.finish(this.build(builder, weapon, rand), weapon);
        if (!window.VectorGun.formBuilder()) this.applyVectorFrame(model);
        return model;
      }

      const bespoke = this.UNIQUE_MODELS[this.dispatchIdFor(weapon)];
      if (bespoke && typeof this[bespoke] === 'function') return this.finish(this[bespoke](weapon, rand), weapon);

      for (const [tag, builder] of this.NOTE_MODELS) {
        if (tag.test(note)) return this.finish(this.build(builder, weapon, rand), weapon);
      }

      if (weapon.isWhip) return this.finish(this.build('createWhipModel', weapon, rand), weapon);
      if (weapon.isFlail) return this.finish(this.build('createFlailModel', weapon, rand), weapon);

      return this.finish(this.build(this.TYPE_MODELS[wtypeId] || 'createLightModel', weapon, rand), weapon);
    } finally {
      THREE.MeshStandardMaterial = OriginalMeshStandardMaterial;
      restoreGeometry();
    }
  },

  // ============================================================
  // The vector gun's frame, worn by whatever it folded into
  // ============================================================
  // Two shapes have a model written by hand (the Blade of Thelema and the
  // coilgun, Weapon3D_Guns.js) and paint themselves. Every other shape comes
  // out of the generic builder for its weapon type, which knows nothing about
  // the gun, so the weapon is put back on it here in two passes:
  //
  //   the colour     the black frame, the matte polymer and the element the
  //                  gun strikes with, out of the one palette every hand
  //                  written shape uses (_vectorGunPalette)
  //   the fittings   the same pieces of hardware the modes bolt onto the
  //                  pistol, rebuilt to the size of the shape and moved onto
  //                  its own front end
  //
  // which is what makes a fitted lance and the pistol read as one weapon.

  // How metallic a material has to be to count as an accent rather than a body.
  VECTOR_ACCENT_METALNESS: 0.6,
  // The pistol the fittings were laid out on is about this long: what a shape
  // measures against it is what the fittings are scaled by.
  VECTOR_FIT_REFERENCE: 0.3,
  // Never smaller than the pistol's own, never more than this much bigger: a
  // greatsword should not carry a cell the size of its blade.
  VECTOR_FIT_MAX_SCALE: 2.2,

  /**
   * Paints one built shape in the gun's own colours and bolts the fittings of
   * the running modes onto it.
   * @param {THREE.Object3D} model - The model the type builder returned
   * @returns {THREE.Object3D} The same model
   */
  applyVectorFrame(model) {
    if (!model || !model.traverse) return model;
    this.applyVectorFormAccent(model);
    this.applyVectorFormFittings(model);
    return model;
  },

  /** The colour pass: the frame dark, the accents and the glow the element. */
  applyVectorFormAccent(model) {
    const VG = window.VectorGun;
    const color = VG && VG.elementColor ? VG.elementColor() : null;
    if (!model || !color || !model.traverse) return model;
    const seen = new Set();
    model.traverse((node) => {
      const mats = !node.material ? []
        : (Array.isArray(node.material) ? node.material : [node.material]);
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        // Anything that already emits light is the shape's glow: it becomes the
        // element outright, which is what the fuller and the bands do on the blade.
        if (mat.emissive && mat.emissiveIntensity > 0) {
          mat.emissive.setHex(color);
          if (mat.color) mat.color.setHex(color);
        } else if (mat.color && Number(mat.metalness) >= this.VECTOR_ACCENT_METALNESS) {
          mat.color.setHex(color);
        } else if (mat.color) {
          // The body of the shape is the gun's frame: wood, leather and bone
          // all come back as the same black polymer the pistol is made of.
          mat.color.setHex(0x121417);
        }
        mat.needsUpdate = true;
      }
    });
    return model;
  },

  /**
   * The hardware pass: the fittings are built once at the pistol's own scale,
   * then measured against the shape they are going onto and moved to its front
   * end, so a mode is recognisable on a knife and on a lance alike.
   */
  applyVectorFormFittings(model) {
    if (!model || typeof THREE === 'undefined' || !this._vectorGunFittings) return model;
    const mats = this._vectorGunPalette();
    const fittings = this._vectorGunFittings(
      new THREE.Group(), mats, this.VECTOR_FIT_LAYOUTS.gun);
    if (!fittings || !fittings.children.length) return model;

    const hostBox = new THREE.Box3().setFromObject(model);
    const size = hostBox.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || this.VECTOR_FIT_REFERENCE;
    const scale = Math.min(this.VECTOR_FIT_MAX_SCALE,
      Math.max(1, longest / this.VECTOR_FIT_REFERENCE));
    fittings.scale.set(scale, scale, scale);

    // The fittings were laid out along +Z, so they are turned onto whichever
    // way the shape is long: a staff running up +Y takes them up its shaft.
    const axis = (size.y >= size.x && size.y >= size.z) ? 'y'
      : (size.z >= size.x ? 'z' : 'x');
    const center = hostBox.getCenter(new THREE.Vector3());
    // A quarter of the way from the middle towards the business end: on the
    // pistol that is the slide, on a spear it is the shaft below the head.
    const forward = longest * 0.25;
    if (axis === 'y') {
      fittings.rotation.x = -Math.PI / 2;
      fittings.position.set(center.x, center.y + forward, hostBox.max.z);
    } else if (axis === 'x') {
      fittings.rotation.y = Math.PI / 2;
      fittings.position.set(center.x + forward, hostBox.max.y, center.z);
    } else {
      fittings.position.set(center.x, hostBox.max.y, center.z + forward);
    }
    // The fittings are hardware bolted on, not part of the silhouette: the
    // welding pass must not drag them back into the body.
    fittings.userData.dynamic = true;
    model.add(fittings);
    return model;
  },

  // ============================================================
  // House finishes
  // ============================================================
  // Some makers are recognisable across every weapon they ever made, whatever
  // shape it is. A finish is applied after the builder returns, so it covers
  // bespoke models and generic ones alike and no builder has to know about it.
  //
  // Varlenia works only in gold: all ten of its weapons, from the twinblades
  // to the beam rifle, come out of the same workshop looking like it.
  VARLENIA_IDS: [30, 109, 183, 225, 260, 320, 367, 526, 605, 651],

  // ============================================================
  // Welding
  // ============================================================
  // A model is a few dozen primitives placed by hand, and a part written at a
  // height or a depth that does not match what it is fixed to hangs in the air:
  // a slingshot fork floating over its handle, a staff's head over its shaft, a
  // grip under a barrel it never reaches. Rather than chase every one of them
  // through 532 builders, the last step of every build pulls parts that are not
  // attached back onto the weapon by the least amount that makes them touch.
  //
  // What is deliberately off on its own is left alone: anything a builder
  // declared as a moving part (spin / orbit / bob / sway / pulse / dynamic, the
  // tags tickModelParts animates), a pair's other half, and anything so far out
  // that it must be there on purpose.

  // A part within this share of the model's diagonal counts as attached: the
  // primitives abut rather than interpenetrate.
  WELD_TOUCH: 0.012,
  // The furthest a part is ever pulled in one pass. Beyond it, it is a design.
  WELD_MAX: 0.16,
  // Passes, so a part welded to a part welded to the body still comes home.
  WELD_PASSES: 4,
  WELD_SAMPLES: 24,
  MOVING_PART_KEYS: ['spin', 'orbit', 'bob', 'sway', 'pulse', 'dynamic'],

  /** What welding needs of one mesh: its oriented box and a few of its points. */
  _weldPart(mesh) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const pos = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / this.WELD_SAMPLES));
    const pts = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += step) {
      pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    }
    const world = new THREE.Box3().setFromObject(mesh);
    const size = world.getSize(new THREE.Vector3());
    let moving = false;
    for (let p = mesh; p; p = p.parent) {
      const ud = p.userData;
      if (ud && this.MOVING_PART_KEYS.some(k => ud[k] !== undefined)) { moving = true; break; }
    }
    return {
      mesh, world, pts, moving,
      local: mesh.geometry.boundingBox,
      inv: new THREE.Matrix4().copy(mesh.matrixWorld).invert(),
      volume: Math.max(size.x, 1e-4) * Math.max(size.y, 1e-4) * Math.max(size.z, 1e-4)
    };
  },

  /** Distance from a world point to a part's oriented box (0 inside it). */
  _weldPointGap(part, p) {
    const q = p.clone().applyMatrix4(part.inv);
    const b = part.local;
    return Math.hypot(
      Math.max(b.min.x - q.x, 0, q.x - b.max.x),
      Math.max(b.min.y - q.y, 0, q.y - b.max.y),
      Math.max(b.min.z - q.z, 0, q.z - b.max.z));
  },

  /** Per-axis separation of two world boxes (0 where they already overlap). */
  _weldAxisGaps(a, b) {
    return [
      Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
      Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
      Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z)
    ];
  },

  /**
   * How far apart two parts really are. Axis-aligned boxes alone call a rotated
   * grip "touching" a barrel it is nowhere near, so the boxes only decide
   * whether it is worth measuring surface to surface.
   */
  _weldGap(a, b) {
    const axis = this._weldAxisGaps(a.world, b.world);
    const rough = Math.hypot(axis[0], axis[1], axis[2]);
    let best = Infinity;
    for (const p of a.pts) { const d = this._weldPointGap(b, p); if (d < best) best = d; }
    for (const p of b.pts) { const d = this._weldPointGap(a, p); if (d < best) best = d; }
    return Math.max(best, rough);
  },

  weldLooseParts(model) {
    if (!model || typeof THREE === 'undefined') return model;
    for (let pass = 0; pass < this.WELD_PASSES; pass++) {
      if (!this._weldPass(model)) break;
    }
    return model;
  },

  /** One welding pass. Returns true when something moved. */
  _weldPass(model) {
    model.updateMatrixWorld(true);
    const parts = [];
    model.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        parts.push(this._weldPart(o));
      }
    });
    if (parts.length < 3) return false;

    const whole = new THREE.Box3();
    for (const p of parts) whole.union(p.world);
    const diag = whole.getSize(new THREE.Vector3()).length();
    if (!(diag > 0)) return false;
    const eps = diag * this.WELD_TOUCH;

    // Group the parts that touch.
    const owner = parts.map((_, i) => i);
    const find = (i) => { while (owner[i] !== i) { owner[i] = owner[owner[i]]; i = owner[i]; } return i; };
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (find(i) === find(j)) continue;
        const axis = this._weldAxisGaps(parts[i].world, parts[j].world);
        if (Math.hypot(axis[0], axis[1], axis[2]) > eps) continue;   // certainly apart
        if (this._weldGap(parts[i], parts[j]) <= eps) owner[find(i)] = find(j);
      }
    }
    const groups = new Map();
    parts.forEach((p, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(p);
    });
    if (groups.size < 2) return false;

    // The weapon is the component carrying the most substance.
    const comps = [...groups.values()]
      .map(members => ({ members, volume: members.reduce((s, m) => s + m.volume, 0) }))
      .sort((a, b) => b.volume - a.volume);
    const body = comps[0];
    const boxOf = (members) => {
      const b = new THREE.Box3();
      for (const m of members) b.union(m.world);
      return b;
    };
    const bodyCentre = boxOf(body.members).getCenter(new THREE.Vector3());

    let moved = false;
    for (const comp of comps.slice(1)) {
      if (comp.members.every(m => m.moving)) continue;
      // A pair of fists, claws or bracers is two halves, not a loose part.
      const centre = boxOf(comp.members).getCenter(new THREE.Vector3());
      if (Math.abs(centre.x) > diag * 0.02 &&
          Math.abs(centre.x + bodyCentre.x) < diag * 0.06 &&
          Math.abs(centre.y - bodyCentre.y) < diag * 0.06 &&
          Math.abs(centre.z - bodyCentre.z) < diag * 0.06) continue;

      const move = this._weldOffset(comp.members, body.members, diag);
      if (!move) continue;
      for (const m of comp.members) this._translateWorld(m.mesh, move);
      moved = true;
    }
    if (moved) model.updateMatrixWorld(true);
    return moved;
  },

  /**
   * The smallest translation that puts a component back in contact with the
   * body. A part that already lines up with something on two axes only has to
   * close the third, which is what nearly every one of these is: a head at the
   * wrong height, a grip at the wrong depth. Anything else is carried straight
   * to its nearest neighbour.
   */
  _weldOffset(members, body, diag) {
    // How far this piece may be carried. Never more than WELD_MAX of the
    // weapon, and never much further than the piece is big: a whole head that
    // sits an inch too high is an error, a bead carried across the model to the
    // far end is a design being demolished.
    const own = new THREE.Box3();
    for (const m of members) own.union(m.world);
    const limit = Math.min(
      diag * this.WELD_MAX,
      Math.max(diag * 0.04, own.getSize(new THREE.Vector3()).length() * 1.2));
    let best = null;
    let bestCost = Infinity;
    let nearest = null;
    let nearestCost = Infinity;

    for (const m of members) {
      for (const b of body) {
        const a = m.world, o = b.world;
        const gaps = this._weldAxisGaps(a, o);
        const dir = [
          a.min.x > o.max.x ? -1 : 1,
          a.min.y > o.max.y ? -1 : 1,
          a.min.z > o.max.z ? -1 : 1
        ];
        // Straight move: close the one axis that keeps them apart.
        for (let k = 0; k < 3; k++) {
          if (gaps[k] <= 0) continue;
          if (gaps[(k + 1) % 3] > 0 || gaps[(k + 2) % 3] > 0) continue;
          if (gaps[k] < bestCost) {
            bestCost = gaps[k];
            best = new THREE.Vector3(
              k === 0 ? dir[0] * gaps[0] : 0,
              k === 1 ? dir[1] * gaps[1] : 0,
              k === 2 ? dir[2] * gaps[2] : 0);
          }
        }
        const diagCost = Math.hypot(gaps[0], gaps[1], gaps[2]);
        if (diagCost > 0 && diagCost < nearestCost) {
          nearestCost = diagCost;
          nearest = new THREE.Vector3(dir[0] * gaps[0], dir[1] * gaps[1], dir[2] * gaps[2]);
        }
      }
    }
    let move = best && bestCost <= limit ? best
      : (nearest && nearestCost <= limit ? nearest : null);

    // Boxes that overlap are not surfaces that touch: a rotated part's box
    // swallows the space around it, so a fork can sit inside the box of the
    // handle it is nowhere near. When that is what happened, carry the part
    // along the line between the two nearest points instead.
    if (!move) {
      let gap = Infinity;
      let from = null;
      let to = null;
      for (const m of members) {
        for (const b of body) {
          for (const p of m.pts) {
            const d = this._weldPointGap(b, p);
            if (d < gap) { gap = d; from = p; to = b; }
          }
        }
      }
      if (!from || gap > limit || gap <= diag * this.WELD_TOUCH) return null;
      // The nearest point of the body's box, back in world space.
      const q = from.clone().applyMatrix4(to.inv).clamp(to.local.min, to.local.max)
        .applyMatrix4(to.mesh.matrixWorld);
      move = q.sub(from);
      if (move.lengthSq() === 0) return null;
    }
    if (!move) return null;
    // Overlap very slightly so the join reads as one solid thing.
    return move.multiplyScalar(1 + diag * 0.004 / (move.length() || 1));
  },

  /** Moves a mesh by a world-space offset, whatever it is parented to. */
  _translateWorld(mesh, offset) {
    const parent = mesh.parent;
    if (!parent) { mesh.position.add(offset); return; }
    const local = offset.clone().applyMatrix4(
      new THREE.Matrix4().extractRotation(parent.matrixWorld).transpose());
    mesh.position.add(local);
    mesh.updateMatrixWorld(true);
  },

  finish(model, weapon) {
    if (!model || !weapon) return model;
    // A sheathed blade is deliberately buried inside the shaft it hides in, so
    // it has to be declared before the welder decides it is a part that came
    // out in the wrong place.
    this.prepareCane(model);
    // Same reason one rack over: a string is drawn to hang clear of its own
    // limbs and an arrow lies off the riser, so both read as parts that came
    // out in the wrong place. Declaring them first keeps the welder off them,
    // and tickBow poses them from where the builder put them.
    if (weapon.wtypeId === 7 || this.isCrossbow(weapon, model)) this.prepareBow(model, weapon);
    // Pull anything that came out floating back onto the weapon, before the
    // gun parts are tagged (prepareGun measures the muzzle off the geometry).
    this.weldLooseParts(model);
    // Weapon type 9 is the firearm rack, but a thing that fires is not always
    // filed as one: the crowd-control devices (663-665) declare no weapon type
    // at all. A model that tagged its own trigger and muzzle is asking to be
    // treated as a gun, so take it at its word. Note the asymmetry: an
    // untagged type-9 weapon still gets a synthesised muzzle from its
    // geometry, while an untagged non-gun is left alone.
    if (weapon.wtypeId === 9 || this.declaresGunParts(model)) this.prepareGun(model, weapon);
    if (this.VARLENIA_IDS.indexOf(this.dispatchIdFor(weapon)) !== -1) this.applyGoldFinish(model);
    return model;
  },

  /** Whether any part of the model carries a userData.gun tag. */
  declaresGunParts(model) {
    if (!model) return false;
    let found = false;
    model.traverse((obj) => {
      if (!found && obj.userData && obj.userData.gun) found = true;
    });
    return found;
  },

  // ============================================================
  // Firearms
  // ============================================================
  // A gun is the one weapon whose model has to DO something when it is used:
  // the trigger goes back, the action cycles, a case comes out and the muzzle
  // lights up. Builders declare which part is which by tagging it:
  //
  //   userData.gun = 'trigger' | 'hammer' | 'slide' | 'bolt' | 'cylinder'
  //                | 'charging' | 'magazine' | 'muzzle' | 'shell'
  //
  // Anything tagged is automatically kept out of the static mesh merge and
  // resolved per instance, so a cached model still animates. The muzzle is
  // found from the geometry when no part claims it, which is what gives every
  // gun in the database a flash without touching its builder.

  // Recoil and cycling profile per class of firearm. `rise` is muzzle climb in
  // degrees, `push` how far back it travels as a share of screen height,
  // `shots` how many rounds one attack puts out, `cycle` how the action moves.
  GUN_CLASSES: {
    pistol: { rise: 1.0, push: 1.0, shots: 1, rate: 0, cycle: 'slide', flash: 0.9, dur: 1.0 },
    revolver: { rise: 1.25, push: 1.1, shots: 1, rate: 0, cycle: 'cylinder', flash: 1.15, dur: 1.05 },
    smg: { rise: 0.7, push: 0.65, shots: 4, rate: 70, cycle: 'bolt', flash: 0.75, dur: 1.2 },
    rifle: { rise: 1.15, push: 1.25, shots: 1, rate: 0, cycle: 'bolt', flash: 1.1, dur: 1.1 },
    sniper: { rise: 1.5, push: 1.7, shots: 1, rate: 0, cycle: 'bolt', flash: 1.35, dur: 1.5 },
    shotgun: { rise: 1.9, push: 1.6, shots: 1, rate: 0, cycle: 'pump', flash: 1.6, dur: 1.35 },
    minigun: { rise: 0.5, push: 0.5, shots: 8, rate: 45, cycle: 'rotary', flash: 0.8, dur: 1.4 },
    launcher: { rise: 2.1, push: 1.9, shots: 1, rate: 0, cycle: 'none', flash: 2.0, dur: 1.6 },
    flamer: { rise: 0.35, push: 0.3, shots: 1, rate: 0, cycle: 'none', flash: 1.4, dur: 1.8 },
    energy: { rise: 0.55, push: 0.6, shots: 1, rate: 0, cycle: 'none', flash: 1.2, dur: 1.1 }
  },

  /** Which class of firearm a weapon is, from its subtype tag then its heft. */
  gunClassOf(weapon) {
    const note = weapon.note || '';
    if (/<RocketLauncher>/i.test(note)) return 'launcher';
    if (/<Minigun>/i.test(note)) return 'minigun';
    if (/<Flamethrower>/i.test(note)) return 'flamer';
    if (/<Shotgun>/i.test(note)) return 'shotgun';
    if (/<SniperRifle>/i.test(note)) return 'sniper';
    if (/<SMG>/i.test(note)) return 'smg';
    if (/<Railgun>|<ArmCannon>/i.test(note)) return 'energy';
    // Untagged: the weight tag separates a sidearm from a shoulder weapon.
    const g = this.weightOf(weapon);
    if (g <= 1800) return 'pistol';
    if (g <= 2600) return 'revolver';
    if (g >= 4800) return 'rifle';
    return 'pistol';
  },

  gunProfileFor(weapon) {
    return this.GUN_CLASSES[this.gunClassOf(weapon)] || this.GUN_CLASSES.pistol;
  },

  /**
   * Fits a gun model out for firing: finds the muzzle, hangs a flash rig off
   * it, and marks every declared moving part so the mesh merge leaves it
   * alone. Runs once per build, before the merge.
   */
  prepareGun(model, weapon) {
    if (!model || typeof THREE === 'undefined') return model;

    // Declared parts must survive the static merge.
    let muzzleAnchor = null;
    model.traverse((obj) => {
      const tag = obj.userData && obj.userData.gun;
      if (!tag) return;
      obj.userData.dynamic = true;
      if (tag === 'muzzle') muzzleAnchor = obj;
    });

    // No part claimed the muzzle: take it off the geometry, but only for a
    // real firearm. A crossbow declares a trigger and a nut because those turn
    // when it looses, not because it has a barrel, and inventing one would
    // light a muzzle flash on a weapon that has no powder in it. Anything else
    // that genuinely fires says so by tagging its own muzzle.
    if (!muzzleAnchor && weapon && weapon.wtypeId !== 9) return model;

    // A gun is modelled barrel-forward along +Z, so the muzzle is the front
    // face of whichever mesh reaches furthest that way.
    if (!muzzleAnchor) {
      model.updateMatrixWorld(true);
      let best = null, bestZ = -Infinity;
      const box = new THREE.Box3();
      model.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        box.setFromObject(obj);
        if (box.max.z > bestZ) { bestZ = box.max.z; best = box.clone(); }
      });
      if (!best) return model;
      const c = best.getCenter(new THREE.Vector3());
      muzzleAnchor = new THREE.Group();
      muzzleAnchor.position.set(c.x, c.y, best.max.z);
      muzzleAnchor.userData.gun = 'muzzle';
      muzzleAnchor.userData.dynamic = true;
      model.add(muzzleAnchor);
    }

    muzzleAnchor.add(this.buildMuzzleFlash(this.gunClassOf(weapon)));
    this.synthesiseTrigger(model);
    return model;
  },

  /**
   * Gives a gun whose builder declared no trigger one anyway, so every firearm
   * in the database has a finger-operated part. The grip is the lowest thing
   * hanging off the receiver (the barrel and stock run fore and aft of it), so
   * the trigger goes just above and ahead of whatever that is.
   */
  synthesiseTrigger(model) {
    let hasTrigger = false;
    model.traverse(o => { if (o.userData && o.userData.gun === 'trigger') hasTrigger = true; });
    if (hasTrigger) return;

    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    let grip = null, gripY = Infinity, gripBox = null;
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      box.setFromObject(obj);
      box.getCenter(centre);
      if (Math.abs(centre.z) > 0.12) return;        // out at the muzzle or the butt
      if (centre.y < gripY) { gripY = centre.y; grip = obj; gripBox = box.clone(); }
    });
    if (!grip) return;

    const mat = Array.isArray(grip.material) ? grip.material[0] : grip.material;
    const metal = mat ? mat.clone() : new THREE.MeshStandardMaterial({ color: 0x8A8F95, roughness: 0.35, metalness: 0.9 });
    const c = gripBox.getCenter(new THREE.Vector3());

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.006), metal);
    trigger.position.set(c.x, gripBox.max.y - 0.014, gripBox.max.z + 0.012);
    trigger.userData.gun = 'trigger';
    trigger.userData.dynamic = true;
    model.add(trigger);

    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.019, 0.004, this.seg(5, 4), this.seg(12, 7), Math.PI * 1.1), metal);
    guard.position.set(c.x, gripBox.max.y - 0.018, gripBox.max.z + 0.01);
    guard.rotation.set(0, Math.PI / 2, -0.35);
    model.add(guard);
    return model;
  },

  /**
   * The flash itself: a hot core, a four-point star and a cone of burning gas,
   * all emissive and all hidden until a shot is fired.
   */
  buildMuzzleFlash(gunClass) {
    const flash = new THREE.Group();
    flash.userData.gun = 'flash';
    flash.userData.dynamic = true;
    flash.visible = false;

    const hot = new THREE.Color(gunClass === 'energy' ? 0x9CE4FF : (gunClass === 'flamer' ? 0xFF8A1A : 0xFFF2C0));
    const rim = new THREE.Color(gunClass === 'energy' ? 0x3BA7FF : (gunClass === 'flamer' ? 0xFF3D00 : 0xFFA327));
    const hotMat = new THREE.MeshBasicMaterial({ color: hot, transparent: true, opacity: 0.95, depthWrite: false });
    const rimMat = new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.75, depthWrite: false });

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.016, this.seg(8, 5), this.seg(6, 4)), hotMat);
    core.userData.flashPart = 'core';
    flash.add(core);

    // The star: two crossed quads, so it reads from any angle without a
    // billboard and without a texture.
    for (let i = 0; i < 2; i++) {
      const petal = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.012), rimMat);
      petal.rotation.z = i * Math.PI / 2;
      petal.userData.flashPart = 'star';
      flash.add(petal);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, this.seg(7, 5), 1, true), rimMat);
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 0.035;
    cone.userData.flashPart = 'cone';
    flash.add(cone);

    return flash;
  },

  /** Resolves the tagged parts of this instance (clone-safe: not in userData). */
  gunPartsOf(model) {
    if (model._gunParts) return model._gunParts;
    const parts = { flash: null, flashBits: [] };
    model.traverse((obj) => {
      const tag = obj.userData && obj.userData.gun;
      if (!tag) return;
      if (tag === 'flash') {
        parts.flash = obj;
        obj.traverse(b => { if (b.userData && b.userData.flashPart) parts.flashBits.push(b); });
      } else if (!parts[tag]) {
        parts[tag] = obj;
        obj.userData._gunRest = {
          x: obj.position.x, y: obj.position.y, z: obj.position.z,
          rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z
        };
        if (tag === 'cylinder') obj.userData._gunSpinAxis = this.spinAxisOf(obj);
      }
    });
    model._gunParts = parts;
    return parts;
  },

  /**
   * Which of a part's own axes it should turn on to index round.
   *
   * A cylinder or a barrel cluster turns on the axis that runs down the bore,
   * and builders get there in different ways: a barrel-cluster Group is laid
   * out along +Z untouched, while a CylinderGeometry stands on +Y and is then
   * tilted a quarter turn to lie down the bore. Turning all of them on Z threw
   * the tilted ones end over end the moment the shot went off, which is what a
   * pepperbox did every time it fired.
   */
  spinAxisOf(obj) {
    const declared = obj.userData && obj.userData.spin && obj.userData.spin.axis;
    if (declared) return declared;
    if (typeof THREE === 'undefined') return 'z';
    const q = new THREE.Quaternion().setFromEuler(obj.rotation);
    let best = 'z', bestDot = -1;
    for (const axis of ['x', 'y', 'z']) {
      const v = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      const dot = Math.abs(v.applyQuaternion(q).z);
      if (dot > bestDot + 1e-4) { bestDot = dot; best = axis; }
    }
    return best;
  },

  /** Starts a firing sequence. Called when a firing animation is played. */
  /**
   * Fits a gun out to fire, on the clock its own recoil clip runs on.
   *
   * @param {number} [duration] - the finished clip's length in ms. The rounds
   *   are timed off it, because the flash, the action and the case belong to
   *   the frame the gun KICKS on: MOTIONS.recoil puts round i's kick at
   *   (i + 0.15) / shots of the clip, and firing on the profile's own rate
   *   instead (which starts every gun at t=0) lit the muzzle a fifth of a
   *   second before the weapon moved, and walked a burst out of step with the
   *   kicks it was supposed to be causing.
   */
  beginGunFire(model, weapon, duration) {
    if (!model) return;
    const profile = this.gunProfileFor(weapon);
    const m = this.weaponMetrics(weapon, model);
    const count = Math.max(1, profile.shots);
    const shots = [];
    for (let i = 0; i < count; i++) {
      shots.push(duration
        ? duration * (i + 0.15) / count
        : i * (profile.rate || 0));
    }
    // A heavy action takes longer to cycle than a light one, but never longer
    // than the gap to the next round or a burst cycles on top of itself.
    const gap = shots.length > 1 ? shots[1] - shots[0] : Infinity;
    model._gunFire = {
      elapsed: 0,
      shots: shots,
      next: 0,
      profile: profile,
      cycleMs: Math.max(50, Math.min(90 + m.heft * 130, gap * 0.9)),
      flashUntil: -1,
      seed: Math.random() * 6.28
    };
  },

  /**
   * Drives the moving parts of a firing gun. Cheap when nothing is firing: a
   * single property check.
   */
  tickGun(model, dtMs) {
    const fire = model && model._gunFire;
    if (!fire) return;
    const parts = this.gunPartsOf(model);
    fire.elapsed += dtMs;

    // Fire each round of the burst as its moment comes round.
    while (fire.next < fire.shots.length && fire.elapsed >= fire.shots[fire.next]) {
      fire.next++;
      fire.flashUntil = fire.elapsed + 55;
      fire.cycleFrom = fire.elapsed;
      if (parts.cylinder) fire.cylinderTo = (fire.cylinderTo || 0) + Math.PI / 3;
    }

    // ── Muzzle flash ────────────────────────────────────────────────────────
    if (parts.flash) {
      const lit = fire.elapsed < fire.flashUntil;
      parts.flash.visible = lit;
      if (lit) {
        const k = Math.max(0, (fire.flashUntil - fire.elapsed) / 55);
        const s = (0.55 + k * 0.75) * fire.profile.flash;
        parts.flash.scale.set(s, s, s);
        parts.flash.rotation.z = fire.seed + fire.next * 1.7;
        for (const bit of parts.flashBits) {
          if (bit.material) bit.material.opacity = Math.min(1, k * 1.2);
          if (bit.userData.flashPart === 'star') bit.scale.set(0.6 + k * 0.9, 1, 1);
        }
      }
    }

    // ── Trigger, hammer, action ─────────────────────────────────────────────
    const sinceShot = fire.cycleFrom === undefined ? Infinity : fire.elapsed - fire.cycleFrom;
    const cyc = Math.max(0, Math.min(1, sinceShot / fire.cycleMs));   // 0 at the shot, 1 when back in battery
    const back = cyc < 0.45 ? cyc / 0.45 : 1 - (cyc - 0.45) / 0.55;   // out and back

    if (parts.trigger) {
      const r = parts.trigger.userData._gunRest;
      // Squeezed just before the shot, released as the action cycles.
      const squeeze = sinceShot === Infinity ? Math.min(1, fire.elapsed / 60) : 1 - cyc;
      parts.trigger.rotation.x = r.rx + squeeze * 0.5;
      parts.trigger.position.z = r.z + squeeze * 0.006;
    }
    if (parts.hammer) {
      // Cocked back with the action, dropped on the round.
      const r = parts.hammer.userData._gunRest;
      parts.hammer.rotation.x = r.rx - back * 1.1;
    }
    const slider = parts.slide || parts.bolt || parts.charging;
    if (slider) {
      const r = slider.userData._gunRest;
      slider.position.z = r.z - back * (parts.slide ? 0.055 : 0.045);
    }
    if (parts.cylinder && fire.cylinderTo !== undefined) {
      const r = parts.cylinder.userData._gunRest;
      const axis = parts.cylinder.userData._gunSpinAxis || 'z';
      const from = fire.cylinderTo - Math.PI / 3;
      parts.cylinder.rotation[axis] = r['r' + axis] + from + (Math.PI / 3) * Math.min(1, cyc * 1.4);
    }
    if (parts.shell) {
      // The case leaves as the action opens and is gone by the time it shuts.
      const out = Math.max(0, Math.min(1, sinceShot / (fire.cycleMs * 1.6)));
      parts.shell.visible = out > 0.02 && out < 0.98;
      const r = parts.shell.userData._gunRest;
      parts.shell.position.set(r.x + out * 0.14, r.y + Math.sin(out * Math.PI) * 0.09 - out * out * 0.12, r.z - out * 0.05);
      parts.shell.rotation.z = out * 9;
    }

    // Done: put everything back and stop.
    const last = fire.shots[fire.shots.length - 1] || 0;
    if (fire.elapsed > last + fire.cycleMs * 1.8) {
      if (parts.flash) parts.flash.visible = false;
      if (parts.shell) parts.shell.visible = false;
      for (const key of ['trigger', 'hammer', 'slide', 'bolt', 'charging']) {
        const p = parts[key];
        if (!p) continue;
        const r = p.userData._gunRest;
        p.position.set(r.x, r.y, r.z);
        p.rotation.x = r.rx;
      }
      model._gunFire = null;
    }
  },

  // ============================================================
  // Reloading
  // ============================================================
  // A gun that reloads is the one time the magazine, the cylinder and the
  // charging handle are the whole point of the shot: the hand clip (MOTIONS.
  // reload) only takes the weapon out of the frame and works on it, and what
  // reads as a reload is the parts moving while it is down there.
  //
  // Driven exactly like beginGunFire/tickGun, on the finished clip's own
  // duration, so the magazine is back in the well before the hand comes up.
  // The windows are fractions of that clip.
  RELOAD_WINDOWS: { out: 0.14, outEnd: 0.34, in: 0.50, inEnd: 0.70, charge: 0.76, chargeEnd: 0.94 },
  // How far the magazine drops out of the well, in model units.
  RELOAD_MAG_DROP: 0.22,

  /**
   * Starts a reload sequence on the parts of a gun.
   * @param {number} duration - the finished clip's length in ms.
   */
  beginGunReload(model, weapon, duration) {
    if (!model) return;
    const parts = this.gunPartsOf(model);
    // Nothing tagged that could be worked on: a bow, a sling, a thrown rock.
    if (!parts.magazine && !parts.cylinder && !parts.slide && !parts.bolt && !parts.charging) return;
    model._gunReload = {
      elapsed: 0,
      duration: Math.max(200, duration || 900),
      // A revolver with no magazine is not swapped, it is turned through on a
      // speedloader, so the cylinder does the work the magazine would.
      speedloader: !parts.magazine && !!parts.cylinder,
      seed: Math.random() * 6.28
    };
  },

  /** Drives the moving parts of a reloading gun. Cheap when nothing reloads. */
  tickGunReload(model, dtMs) {
    const rl = model && model._gunReload;
    if (!rl) return;
    const parts = this.gunPartsOf(model);
    rl.elapsed += dtMs;
    const t = Math.max(0, Math.min(1, rl.elapsed / rl.duration));
    const w = this.RELOAD_WINDOWS;
    const span = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

    if (parts.magazine) {
      // Out of the well, gone for a moment, and a fresh one pushed back up.
      const out = span(w.out, w.outEnd);
      const back = span(w.in, w.inEnd);
      const drop = Math.max(0, out - back);
      const r = parts.magazine.userData._gunRest;
      parts.magazine.position.y = r.y - drop * this.RELOAD_MAG_DROP;
      parts.magazine.position.z = r.z - drop * 0.03;
      parts.magazine.rotation.x = r.rx + drop * 0.35;
      // The empty one is clear of the gun before the new one arrives.
      parts.magazine.visible = !(out >= 1 && back <= 0);
    }
    if (parts.cylinder) {
      const r = parts.cylinder.userData._gunRest;
      const axis = parts.cylinder.userData._gunSpinAxis || 'z';
      // Swung out and turned through its chambers on the way back in.
      const turn = rl.speedloader ? span(w.out, w.inEnd) : span(w.in, w.chargeEnd);
      parts.cylinder.rotation[axis] = r['r' + axis] + turn * Math.PI * 2;
    }
    const slider = parts.slide || parts.bolt || parts.charging;
    if (slider) {
      // Charged once the fresh rounds are in: back, then released.
      const c = span(w.charge, w.chargeEnd);
      const back = c < 0.45 ? c / 0.45 : 1 - (c - 0.45) / 0.55;
      const r = slider.userData._gunRest;
      slider.position.z = r.z - back * (parts.slide ? 0.055 : 0.045);
    }
    if (parts.hammer && !parts.cylinder) {
      const r = parts.hammer.userData._gunRest;
      parts.hammer.rotation.x = r.rx - span(w.charge, w.chargeEnd) * 0.9;
    }

    // Done: everything back where the builder left it.
    if (t >= 1) {
      for (const key of ['magazine', 'cylinder', 'slide', 'bolt', 'charging', 'hammer']) {
        const p = parts[key];
        if (!p) continue;
        const r = p.userData._gunRest;
        p.position.set(r.x, r.y, r.z);
        p.rotation.x = r.rx;
        p.rotation.y = r.ry;
        p.rotation.z = r.rz;
        p.visible = true;
      }
      model._gunReload = null;
    }
  },

  // ============================================================
  // Sword canes
  // ============================================================
  // A cane that hides a blade has one moving part and the whole weapon reads
  // on it, so it is driven the way a gun's action is rather than left to the
  // ambient tickModelParts loop: the blade only ever moves while the weapon is
  // being swung, and it has to be back in the shaft by the time the clip ends.
  //
  //   userData.cane = 'blade'   slides along +Y by userData.caneTravel
  //   userData.cane = 'flash'   shown only while the blade is travelling
  //
  // The windows are fractions of the attack clip's own duration, and they are
  // the same timeline MOTIONS.swordcane is written against.
  CANE_DRAW: { out: 0.16, outEnd: 0.30, in: 0.80, inEnd: 0.96 },
  CANE_TRAVEL: 0.4,

  /**
   * Marks the tagged parts so they survive welding and the static merge, the
   * way prepareGun does for a firearm's action. Runs once per build.
   */
  prepareCane(model) {
    if (!model) return model;
    model.traverse((obj) => {
      if (obj.userData && obj.userData.cane) obj.userData.dynamic = true;
    });
    return model;
  },

  /** Resolves the tagged parts of this instance. */
  canePartsOf(model) {
    if (model._caneParts) return model._caneParts;
    const parts = {};
    model.traverse((obj) => {
      const tag = obj.userData && obj.userData.cane;
      if (!tag || parts[tag]) return;
      parts[tag] = obj;
      obj.userData._caneRest = obj.position.y;
    });
    model._caneParts = parts;
    return parts;
  },

  /** Starts a draw. Called when a sword-cane animation is played. */
  beginCaneDraw(model, durationMs) {
    if (!model) return;
    if (!this.canePartsOf(model).blade) return;
    model._caneDraw = { elapsed: 0, duration: Math.max(1, durationMs || 700) };
  },

  /**
   * Drives the blade out of the shaft and back into it. Cheap when nothing is
   * being drawn: a single property check.
   */
  // ============================================================
  // The vector gun reconstructing itself
  // ============================================================
  // SWITCH is not a model swap, it is a machine coming apart and building
  // itself back as something else (Weapon/VectorGunSystem.js). It is played in
  // two halves with the swap between them, so the piece that flies apart is the
  // one being put away and the piece that assembles is the one being drawn:
  //
  //   fold   the weapon spins up, every part slides out along its own axis
  //          until the whole thing is a cloud of hardware, and the cloud
  //          collapses into the hand
  //   rise   the new shape arrives as the same cloud, spinning the other way,
  //          and every part slams home with a hard overshoot
  //
  // Both halves move the parts the builders placed, so any shape animates:
  // nothing here knows what weapon it is taking apart.
  VECTOR_FOLD_MS: 330,
  VECTOR_RISE_MS: 470,
  VECTOR_SPREAD: 0.55,     // how far a part travels, as a share of the model
  VECTOR_SPIN: Math.PI * 5,

  /**
   * Starts one half of the reconstruction on a model.
   * @param {THREE.Object3D} model - The weapon in the hand
   * @param {string} phase - 'fold' (coming apart) or 'rise' (going together)
   */
  startVectorSwitch(model, phase) {
    if (!model || typeof THREE === 'undefined') return null;
    const rise = phase === 'rise';
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const reach = (Math.max(size.x, size.y, size.z) || 0.3) * this.VECTOR_SPREAD;
    const parts = [];
    let index = 0;
    model.traverse((node) => {
      if (node === model || !node.isMesh) return;
      const home = node.position.clone();
      // Which way a part flies: away from the middle of the piece it is bolted
      // to. A part sitting exactly on the axis is given a turn of its own, so a
      // barrel and a slide do not travel as one.
      let dir = home.clone();
      if (dir.lengthSq() < 1e-6) {
        const a = index * 2.399963;   // the golden angle: no two alike
        dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, Math.sin(a));
      }
      dir.normalize();
      parts.push({
        node: node,
        home: home,
        dir: dir,
        spin: (index % 2 ? 1 : -1) * (1.2 + (index % 5) * 0.4),
        rest: node.rotation.clone(),
      });
      index++;
    });
    model._vectorSwitch = {
      elapsed: 0,
      duration: rise ? this.VECTOR_RISE_MS : this.VECTOR_FOLD_MS,
      rise: rise,
      reach: reach,
      parts: parts,
    };
    return model._vectorSwitch;
  },

  /** One frame of it. Runs after the pose, so it works on top of the pose. */
  tickVectorSwitch(model, dtMs) {
    const vs = model && model._vectorSwitch;
    if (!vs) return;
    vs.elapsed += dtMs;
    const t = Math.max(0, Math.min(1, vs.elapsed / vs.duration));

    // Coming apart accelerates; going together arrives hard and settles, which
    // is the difference between a thing falling open and a thing being built.
    const easeIn = t * t;
    const back = 1.7;
    const u = t - 1;
    const easeOutBack = 1 + (back + 1) * u * u * u + back * u * u;
    const spread = vs.rise ? Math.max(0, 1 - easeOutBack) : easeIn;
    const spin = vs.rise ? -(1 - easeOutBack) * this.VECTOR_SPIN : easeIn * this.VECTOR_SPIN;
    // The piece is small in the hand while it is only a cloud of parts.
    const shrink = vs.rise ? 0.25 + 0.75 * Math.min(1, easeOutBack) : 1 - 0.8 * easeIn;

    for (const part of vs.parts) {
      part.node.position.set(
        part.home.x + part.dir.x * vs.reach * spread,
        part.home.y + part.dir.y * vs.reach * spread,
        part.home.z + part.dir.z * vs.reach * spread);
      part.node.rotation.set(
        part.rest.x + part.spin * spread,
        part.rest.y + part.spin * spread * 1.4,
        part.rest.z + part.spin * spread);
    }
    model.rotation.y += spin;
    model.scale.multiplyScalar(Math.max(0.05, shrink));

    if (t >= 1) {
      // Everything back exactly where the builder left it: an animation that
      // ends a millimetre out leaves the weapon wrong for the rest of the fight.
      for (const part of vs.parts) {
        part.node.position.copy(part.home);
        part.node.rotation.copy(part.rest);
      }
      model._vectorSwitch = null;
    }
  },

  tickCane(model, dtMs) {
    const draw = model && model._caneDraw;
    if (!draw) return;
    const parts = this.canePartsOf(model);
    const blade = parts.blade;
    if (!blade) { model._caneDraw = null; return; }

    draw.elapsed += dtMs;
    const t = draw.elapsed / draw.duration;
    const w = this.CANE_DRAW;
    // Out fast and hard, back in unhurried: a spring, not a screw.
    let k;
    if (t <= w.out) k = 0;
    else if (t < w.outEnd) k = 1 - Math.pow(1 - (t - w.out) / (w.outEnd - w.out), 3);
    else if (t <= w.in) k = 1;
    else if (t < w.inEnd) { const u = (t - w.in) / (w.inEnd - w.in); k = 1 - u * u; }
    else k = 0;

    blade.position.y = blade.userData._caneRest + k * (blade.userData.caneTravel || this.CANE_TRAVEL);

    if (parts.flash) {
      const lit = t > w.out && t < w.outEnd;
      parts.flash.visible = lit;
      if (lit) {
        const glow = Math.sin(k * Math.PI);
        const s = 0.5 + glow;
        parts.flash.scale.set(s, s, s);
        if (parts.flash.material) parts.flash.material.opacity = glow;
      }
    }

    if (t >= 1) {
      blade.position.y = blade.userData._caneRest;
      if (parts.flash) parts.flash.visible = false;
      model._caneDraw = null;
    }
  },

  // ============================================================
  // Bows and crossbows
  // ============================================================
  // A bow reads entirely on a part that moves. Nothing about a bow sliding
  // across the screen says "loosed" the way a string coming back to the cheek,
  // limbs bending with it and the whole thing snapping flat does, so the shot
  // is driven the way a gun's action is rather than being left to the whole
  // model's keyframes.
  //
  // The overlay camera is orthographic, so an arrow travelling down +Z moves no
  // pixels by itself. What sells the flight is that a bow is AIMED: the resting
  // rotation keeps AIM_SCREEN_SHARE of its length across the screen, so most of
  // that travel does land on screen, and shrinking the arrow spends the rest of
  // it going away from the camera.
  //
  // Builders declare the moving parts by tagging them:
  //
  //   userData.bow = 'stringTop' | 'stringBot'  half of the string, running from
  //        a limb tip to the nocking point. Carries bowTip, bowNock and bowLen,
  //        plus bowRelease on a crossbow (where the string rests forward of the
  //        nut it is spanned back onto). _bowString builds and tags them.
  //   userData.bow = 'limbTop' | 'limbBot'      a limb group flexed by the draw
  //   userData.bow = 'limbLeft' | 'limbRight'   a crossbow prod arm, same job
  //   userData.bow = 'arrow'                    the arrow or bolt on the string
  //   userData.bow = 'nock'                     serving or glow riding the nock
  //   model.userData.crossbow = true            shot with a trigger, not drawn
  //
  // Everything tagged is kept out of the static mesh merge. A model that tags
  // nothing still gets a shot: prepareBow finds the nocked arrow off the
  // geometry, or builds one, the way prepareGun synthesises a muzzle.

  // Windows of the attack clip, as fractions of its own duration. MOTIONS.draw
  // and MOTIONS.crossbow are written against these same numbers, so the hand
  // kicks on the frame the string goes.
  BOW_SHOT: { rise: 0.06, full: 0.34, loose: 0.54, again: 0.84 },
  BOLT_SHOT: { loose: 0.36, again: 0.7 },
  // How far the string comes back, as a share of the bow's tip-to-tip span,
  // and how far the arrow travels before it is out of the frame.
  BOW_PULL: 0.3,
  BOW_FLIGHT: 3.6,

  /**
   * The string, as the two halves it bends into: a straight line from tip to
   * tip is only what a string looks like when nothing is pulling on it.
   * @param top,bot {THREE.Vector3} limb tips
   * @param opts { r, nock, release, pulse }
   * @returns {THREE.Vector3} the nocking point the halves meet at
   */
  _bowString(group, mat, top, bot, opts) {
    const o = opts || {};
    const r = o.r || 0.0018;
    const nock = o.nock ? o.nock.clone() : top.clone().add(bot).multiplyScalar(0.5);
    const up = new THREE.Vector3(0, 1, 0);
    const pairs = [[top, 'stringTop'], [bot, 'stringBot']];
    for (const pair of pairs) {
      const tip = pair[0];
      const d = nock.clone().sub(tip);
      const len = Math.max(1e-4, d.length());
      const half = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, len, this.seg(5, 3)), mat);
      half.position.copy(tip).add(nock).multiplyScalar(0.5);
      half.quaternion.setFromUnitVectors(up, d.normalize());
      half.userData.bow = pair[1];
      half.userData.bowTip = { x: tip.x, y: tip.y, z: tip.z };
      half.userData.bowNock = { x: nock.x, y: nock.y, z: nock.z };
      half.userData.bowLen = len;
      if (o.release) half.userData.bowRelease = { x: o.release.x, y: o.release.y, z: o.release.z };
      if (o.pulse) half.userData.pulse = o.pulse;
      group.add(half);
    }
    return nock;
  },

  /**
   * Fits a bow out for shooting: keeps every declared part out of the mesh
   * merge, and makes sure there is an arrow on the string to loose. Runs once
   * per build, before the merge.
   */
  prepareBow(model, weapon) {
    if (!model || typeof THREE === 'undefined') return model;
    let arrow = null;
    model.traverse((obj) => {
      const tag = obj.userData && obj.userData.bow;
      if (!tag) return;
      obj.userData.dynamic = true;
      if (tag === 'arrow') arrow = obj;
    });
    if (!arrow) arrow = this._gatherNockedArrow(model);
    if (!arrow) arrow = this._buildNockedArrow(model, weapon);
    if (arrow) {
      arrow.userData.bow = 'arrow';
      arrow.userData.dynamic = true;
    }
    this._adoptLimbFurniture(model);
    // Remembered on the weapon itself, the way its whip and flail flags are:
    // how a bow is posed and how big it is drawn are asked long before and
    // long after the model that knew it was a crossbow is to hand.
    if (weapon && this.isCrossbow(weapon, model)) weapon.isCrossbow = true;
    return model;
  },

  /**
   * Hands everything sitting out at the limb tips over to the limb it belongs
   * to: nocks, bindings, leaves, siyahs, the ice growing off a frozen bow.
   * Builders hang those on the model rather than on the limb, and a limb that
   * bends away from its own tip cap is worse than one that does not bend.
   * The share of the limb below which a part is riser furniture, not limb
   * furniture, is deliberately generous: the riser sits at the middle.
   */
  _adoptLimbFurniture(model) {
    const parts = this.bowPartsOf(model);
    const top = parts.limbTop, bot = parts.limbBot;
    if (!top || !bot) return;
    const tip = parts.stringTop && parts.stringTop.userData.bowTip;
    const reach = tip ? Math.abs(tip.y) : 0;
    if (!(reach > 0)) return;
    const edge = reach * 0.55;
    for (const child of model.children.slice()) {
      if (!child.isMesh || (child.userData && child.userData.bow)) continue;
      if (Math.abs(child.position.y) < edge) continue;
      const limb = child.position.y > 0 ? top : bot;
      if (limb.attach) limb.attach(child); else limb.add(child);
    }
    model._bowParts = null;
  },

  /**
   * The arrow already on the string, taken off the geometry: every builder
   * draws it the same way, as a shaft lying along the bow's line of fire with
   * its head and fletching threaded on the same axis. They are collected into
   * one group so the head does not stay behind when the shaft leaves.
   */
  _gatherNockedArrow(model) {
    const shafts = [];
    // An arrow starts ON the string. Without that test the longest thing
    // pointing down range wins, and a target bow shoots its own stabiliser.
    const parts = this.bowPartsOf(model);
    const nockZ = (parts.stringTop || parts.stringBot) ? this._bowNockRest(parts).z : null;
    model.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.geometry.parameters) return;
      const type = obj.geometry.type || '';
      if (type.indexOf('Cylinder') === -1 && type.indexOf('Cone') === -1) return;
      const p = obj.geometry.parameters;
      const radius = Math.max(p.radiusTop || 0, p.radiusBottom || 0, p.radius || 0);
      if (radius > 0.02) return;
      // Lying along the line of fire rather than across the bow: this is what
      // separates an arrow from the grip, the wraps and the limbs.
      if (Math.abs(Math.cos(obj.rotation.x)) > 0.25) return;
      if (Math.abs(obj.position.x) > 0.03 || obj.position.z < -0.06) return;
      const len = p.height || 0;
      if (nockZ !== null && Math.abs(obj.position.z - len * 0.5 - nockZ) > 0.12) return;
      shafts.push({ obj: obj, len: len });
    });
    if (!shafts.length) return null;
    let main = shafts[0];
    for (const s of shafts) if (s.len > main.len) main = s;
    if (main.len < 0.08) return null;

    const group = new THREE.Group();
    group.userData.bow = 'arrow';
    group.userData.dynamic = true;
    model.add(group);
    const zMin = main.obj.position.z - main.len * 0.5 - 0.06;
    const zMax = main.obj.position.z + main.len * 0.5 + 0.06;
    for (const s of shafts) {
      if (s !== main) {
        if (s.obj.position.z < zMin || s.obj.position.z > zMax) continue;
        if (Math.abs(s.obj.position.y - main.obj.position.y) > 0.03) continue;
        if (Math.abs(s.obj.position.x - main.obj.position.x) > 0.02) continue;
      }
      if (group.attach) group.attach(s.obj); else group.add(s.obj);
    }
    return group;
  },

  /** An arrow for a bow that was drawn without one. */
  _buildNockedArrow(model, weapon) {
    // A crossbow with nothing in the groove is empty on purpose as often as by
    // omission, and its own frame draws a bolt when it wants one.
    if (this.isCrossbow(weapon, model)) return null;
    const parts = this.bowPartsOf(model);
    const span = this._bowSpan(model, parts);
    const nock = this._bowNockRest(parts);
    const len = span * 0.72;
    const shaftMat = this._mat(0x9A7B4F, { roughness: 0.85, metalness: 0.04 });
    const headMat = this._mat(0x9AA0A6, { roughness: 0.4, metalness: 0.8 });
    const group = new THREE.Group();
    group.userData.bow = 'arrow';
    group.userData.dynamic = true;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, len, this.seg(7, 5)), shaftMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(nock.x, nock.y, nock.z + len * 0.5);
    group.add(shaft);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, this.seg(7, 5)), headMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(nock.x, nock.y, nock.z + len + 0.012);
    group.add(head);
    for (let i = 0; i < (this.isLowDetail() ? 2 : 3); i++) {
      const vane = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, this.seg(5, 3)), shaftMat);
      vane.rotation.x = -Math.PI / 2;
      vane.rotation.z = (i / 3) * Math.PI * 2;
      vane.position.set(nock.x, nock.y, nock.z + 0.026);
      group.add(vane);
    }
    model.add(group);
    // The parts were resolved before the arrow existed, so the cache has to go.
    model._bowParts = null;
    return group;
  },

  /** Whether this weapon is spanned and shot rather than drawn and loosed. */
  isCrossbow(weapon, model) {
    if (weapon && weapon.isCrossbow) return true;
    if (model && model.userData && model.userData.crossbow) return true;
    return /<Crossbow>/i.test((weapon && weapon.note) || '');
  },

  /** Resolves the tagged parts of this instance (clone-safe: not in userData). */
  bowPartsOf(model) {
    if (model._bowParts) return model._bowParts;
    const parts = {};
    model.traverse((obj) => {
      const tag = obj.userData && obj.userData.bow;
      if (!tag || parts[tag]) return;
      parts[tag] = obj;
      obj.userData._bowRest = {
        x: obj.position.x, y: obj.position.y, z: obj.position.z,
        rx: obj.rotation.x, ry: obj.rotation.y, rz: obj.rotation.z
      };
    });
    model._bowParts = parts;
    return parts;
  },

  /** Tip to tip, in model units: everything the shot is measured against. */
  _bowSpan(model, parts) {
    const a = parts.stringTop && parts.stringTop.userData.bowTip;
    const b = parts.stringBot && parts.stringBot.userData.bowTip;
    if (a && b) return Math.max(0.05, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    return model.userData._fitExtent || 0.55;
  },

  /** Where the nocking point sits with nothing pulling on the string. */
  _bowNockRest(parts) {
    const half = parts.stringTop || parts.stringBot;
    const n = half && (half.userData.bowRelease || half.userData.bowNock);
    return n ? { x: n.x, y: n.y, z: n.z } : { x: 0, y: 0.01, z: 0 };
  },

  /**
   * Starts a shot. Called with the attack clip's own duration so the string
   * goes on the frame the hand kicks.
   */
  beginBowShot(model, weapon, durationMs) {
    if (!model) return;
    const parts = this.bowPartsOf(model);
    const crossbow = this.isCrossbow(weapon, model);
    const span = this._bowSpan(model, parts);
    model._bowShot = {
      elapsed: 0,
      duration: Math.max(1, durationMs || 600),
      crossbow: crossbow,
      // A crossbow is carried already spanned, so nothing draws back: its
      // string and its bolt only ever travel forward, on the loose.
      pull: crossbow ? 0 : span * this.BOW_PULL,
      flight: span * this.BOW_FLIGHT,
      flex: crossbow ? 0.09 : 0.17
    };
  },

  /**
   * Drives the string, the limbs and the arrow of a bow being shot. Cheap when
   * nothing is being shot: a single property check.
   */
  tickBow(model, dtMs) {
    const shot = model && model._bowShot;
    if (!shot) return;
    const parts = this.bowPartsOf(model);
    shot.elapsed += dtMs;
    const t = Math.min(1, shot.elapsed / shot.duration);
    const loose = shot.crossbow ? this.BOLT_SHOT.loose : this.BOW_SHOT.loose;

    // How far back the string is held, 1 at full draw. A crossbow starts there
    // and stays there: being spanned is its resting state.
    let k;
    if (shot.crossbow) k = 1;
    else if (t <= this.BOW_SHOT.rise) k = 0;
    else if (t < this.BOW_SHOT.full) {
      const u = (t - this.BOW_SHOT.rise) / (this.BOW_SHOT.full - this.BOW_SHOT.rise);
      k = u * u * (3 - 2 * u);
    } else k = 1;

    let flown = 0;
    if (t > loose) {
      const u = (t - loose) / Math.max(1e-4, 1 - loose);
      // The string does not stop where it rests: it runs past it and rings
      // down, which is the whole sound of the shot made visible.
      k *= Math.cos(u * 17) * Math.exp(-u * 6.5);
      flown = 1 - Math.pow(1 - Math.min(1, u / 0.3), 2);
    }

    // Nothing is left standing empty. Over the tail of the clip another arrow
    // comes onto the string, and a crossbow is spanned back onto its nut,
    // rather than the whole weapon snapping back into shape on the last frame.
    const again = shot.crossbow ? this.BOLT_SHOT.again : this.BOW_SHOT.again;
    if (t > again) {
      let r = Math.min(1, (t - again) / Math.max(1e-4, 0.97 - again));
      r = r * r * (3 - 2 * r);
      if (shot.crossbow) k = k * (1 - r) + r;
      if (r >= 0.5) flown = 0;
    }

    this._poseBowString(parts.stringTop, k, shot);
    this._poseBowString(parts.stringBot, k, shot);

    // Everything except the string is posed relative to how the weapon was
    // BUILT, and a crossbow is built spanned: at rest its k is already 1, so
    // its limbs and its bolt only move once the string starts forward.
    const kk = shot.crossbow ? k - 1 : k;
    const flex = shot.flex * kk;
    this._flexLimb(parts.limbTop, 'x', -flex);
    this._flexLimb(parts.limbBot, 'x', flex);
    this._flexLimb(parts.limbLeft, 'y', flex);
    this._flexLimb(parts.limbRight, 'y', -flex);

    if (parts.nock) {
      const r = parts.nock.userData._bowRest;
      parts.nock.position.z = r.z - shot.pull * kk;
    }

    if (parts.arrow) {
      const r = parts.arrow.userData._bowRest;
      // On a bow the arrow comes back with the string; on a crossbow it is
      // already lying in the groove and waits there for the nut to turn.
      parts.arrow.position.z = r.z - shot.pull * kk + shot.flight * flown;
      const s = 1 - flown * 0.4;
      parts.arrow.scale.set(s, s, s);
      parts.arrow.visible = flown < 0.82;
    }

    // A crossbow has an action as well as a string: the finger comes back and
    // the nut turns the bolt loose. Both are already tagged as gun parts by
    // whatever drew them, so they are read from there rather than tagged twice.
    if (shot.crossbow) {
      const gun = this.gunPartsOf(model);
      if (gun.trigger) {
        const r = gun.trigger.userData._gunRest;
        gun.trigger.rotation.x = r.rx + Math.min(1, t / loose) * 0.5;
      }
      if (gun.cylinder) {
        const r = gun.cylinder.userData._gunRest;
        gun.cylinder.rotation.z = r.rz + (t > loose ? Math.min(1, (t - loose) * 9) * 1.1 : 0);
      }
    }

    if (t >= 1) {
      this._restBowParts(model, parts, shot);
      model._bowShot = null;
    }
  },

  /** Bends one half of a string to a nocking point k of the way back. */
  _poseBowString(half, k, shot) {
    if (!half) return;
    const ud = half.userData;
    const tip = ud.bowTip;
    const rest = ud.bowRelease || ud.bowNock;
    if (!tip || !rest) return;
    // Where the string is held: a bow is pulled back off its rest, a crossbow
    // is spanned back onto its nut and rests forward of it.
    const back = ud.bowRelease ? ud.bowNock : { x: rest.x, y: rest.y, z: rest.z - shot.pull };
    const nx = rest.x + (back.x - rest.x) * k;
    const ny = rest.y + (back.y - rest.y) * k;
    const nz = rest.z + (back.z - rest.z) * k;
    const dx = nx - tip.x, dy = ny - tip.y, dz = nz - tip.z;
    const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
    half.position.set((tip.x + nx) / 2, (tip.y + ny) / 2, (tip.z + nz) / 2);
    if (!this._bowUp) this._bowUp = new THREE.Vector3(0, 1, 0);
    if (!this._bowDir) this._bowDir = new THREE.Vector3();
    half.quaternion.setFromUnitVectors(this._bowUp, this._bowDir.set(dx / len, dy / len, dz / len));
    half.scale.y = len / (ud.bowLen || len);
  },

  /** Bends one limb about the grip, which is what moves its tip. */
  _flexLimb(limb, axis, amount) {
    if (!limb) return;
    limb.rotation[axis] = limb.userData._bowRest[axis === 'x' ? 'rx' : 'ry'] + amount;
  },

  /** Puts a bow back the way it was built. */
  _restBowParts(model, parts, shot) {
    for (const key of Object.keys(parts)) {
      const p = parts[key];
      const r = p.userData._bowRest;
      p.position.set(r.x, r.y, r.z);
      p.rotation.set(r.rx, r.ry, r.rz);
      p.scale.set(1, 1, 1);
      p.visible = true;
    }
    // The halves are posed rather than placed, so they are rebuilt at rest
    // instead of being trusted to the transform they were built with. A
    // crossbow rests spanned, which is the far end of the same travel.
    const rest = { pull: 0 };
    const k = shot && shot.crossbow ? 1 : 0;
    this._poseBowString(parts.stringTop, k, rest);
    this._poseBowString(parts.stringBot, k, rest);
    const gun = model._gunParts;
    if (gun) {
      for (const key of ['trigger', 'cylinder']) {
        const p = gun[key];
        if (!p) continue;
        const r = p.userData._gunRest;
        p.rotation.set(r.rx, r.ry, r.rz);
      }
    }
  },

  /**
   * Re-tints every material into gold while keeping the model's own light and
   * shade: the hue and saturation are replaced, the lightness the builder chose
   * is kept, so engraving, grooves and shadowed parts all still read. Emissive
   * parts keep their own colour, pulled halfway toward warm gold so a glow
   * still looks like a glow rather than a hole in the gilding.
   */
  applyGoldFinish(model) {
    if (typeof THREE === 'undefined') return model;
    const hsl = { h: 0, s: 0, l: 0 };
    const seen = new Set();
    model.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat) || !mat.color) continue;
        seen.add(mat);
        mat.color.getHSL(hsl);
        mat.color.setHSL(0.118, 0.62, Math.min(0.86, Math.max(0.2, hsl.l * 0.9 + 0.14)));
        if (mat.metalness !== undefined) mat.metalness = Math.max(mat.metalness, 0.85);
        if (mat.roughness !== undefined) mat.roughness = Math.min(mat.roughness, 0.34);
        if (mat.emissive && mat.emissiveIntensity > 0) {
          mat.emissive.lerp(new THREE.Color(0xFFD166), 0.5);
        }
      }
    });
    return model;
  },

  /**
   * Calls a builder by name. A family that failed to load costs only the
   * models it carried: the weapon falls back to its type's silhouette, and to
   * nothing at all if that is missing too, rather than throwing into the
   * battle scene.
   */
  build(name, weapon, rand) {
    if (typeof this[name] === 'function') return this[name](weapon, rand);
    if (!this._missingBuilders) this._missingBuilders = {};
    if (!this._missingBuilders[name]) {
      this._missingBuilders[name] = true;
      console.warn('[WeaponSystemProcedural] builder not loaded: ' + name);
    }
    const fallback = this.TYPE_MODELS[weapon.wtypeId || 1];
    if (fallback && fallback !== name && typeof this[fallback] === 'function') {
      return this[fallback](weapon, rand);
    }
    return null;
  },

  // Note tag -> builder, in priority order (a weapon carrying two tags gets
  // the first one listed). Kept as an array so the order is explicit.
  NOTE_MODELS: [
    [/<Mjolnir>/i, 'createMjolnirModel'],
    [/<FlySwatter>/i, 'createFlySwatterModel'],
    [/<WarFan>/i, 'createWarFanModel'],
    [/<Excalibur>/i, 'createExcaliburModel'],
    [/<DragonBlade>/i, 'createDragonBladeModel'],
    [/<MagicOrb>/i, 'createMagicOrbModel'],
    [/<FoamFinger>/i, 'createFoamFingerModel'],
    [/<Spatula>/i, 'createSpatulaModel'],
    [/<CelestialHammer>/i, 'createCelestialHammerModel'],
    [/<ChronosHammer>/i, 'createChronosHammerModel'],
    // Gun subtypes
    [/<RocketLauncher>/i, 'createRocketLauncherModel'],
    [/<Minigun>/i, 'createMinigunModel'],
    [/<Flamethrower>/i, 'createFlamethrowerModel'],
    [/<Shotgun>/i, 'createShotgunModel'],
    [/<SniperRifle>/i, 'createSniperRifleModel'],
    [/<SMG>/i, 'createSMGModel'],
    // Polearm / melee subtypes
    [/<Halberd>/i, 'createHalberdModel'],
    [/<Trident>/i, 'createTridentModel'],
    [/<Nunchaku>/i, 'createNunchakuModel'],
    // A stick that is a scabbard. The blade is a `cane`-tagged part, run out
    // of the shaft by tickCane on the HiddenBlade animation.
    [/<HiddenBlade>/i, 'createBastoneInfernaleModel'],
    // Ranged / thrown subtypes
    [/<Railgun>/i, 'createRailgunModel'],
    [/<ArmCannon>/i, 'createArmCannonModel'],
    [/<Crossbow>/i, 'createCrossbowModel'],
    [/<Boomerang>/i, 'createBoomerangModel'],
    [/<Chakram>/i, 'createChakramModel'],
    [/<DroneLauncher>/i, 'createDroneLauncherModel'],
    [/<Crown>/i, 'createCrownModel']
  ],

  // $dataSystem.weaponTypes id -> builder.
  TYPE_MODELS: {
    1: 'createLightModel',      2: 'createSwordModel',
    3: 'createHeavyModel',      4: 'createAxeModel',
    5: 'createWhipModel',       6: 'createStaffModel',
    7: 'createBowModel',        8: 'createProjectileModel',
    9: 'createGunModel',        10: 'createClawModel',
    11: 'createGloveModel',     12: 'createSpearModel'
  },

  getRandomColor(rand, palette) {
    return palette[Math.floor(rand() * palette.length)];
  },

  get bladeColors() { return [0xAAAAAA, 0xDDCC55, 0x111122, 0x444444, 0xCD7F32, 0x8B0000, 0x2E5B88, 0x3D8B7A, 0x6E4A8B, 0x228B22, 0xE5E5E5]; },
  get handleColors() { return [0x5C4033, 0x3D2314, 0x8B4513, 0x222222, 0x777777, 0x111111, 0x8F5C38, 0x4A2E1B, 0x2E1F11]; },
  get guardColors() { return [0xDDCC55, 0xCCCCCC, 0xCD7F32, 0x333333, 0xAA8822, 0x888899, 0x222233, 0xD4AF37, 0xC0C0C0, 0x8A9A86]; },
  get whipColors() { return [0x3A221D, 0x222222, 0x5C4033, 0x1A1A1A, 0x8B0000, 0xAA00FF, 0x00FFFF]; },
  get crystalColors() { return [0x00FFCC, 0xFF00FF, 0x00FFFF, 0xFFCC00, 0xFF3300, 0x33FF33, 0x9900FF, 0xFFFFFF, 0x0000FF, 0xFF0000]; },
  get emissionColors() { return [0x00FF99, 0xFF00AA, 0x00FFFF, 0xFFDD00, 0xFF1100, 0x55FF55, 0xAA00FF, 0xFFFFFF]; },
  get ribbonColors() { return [0xD90429, 0x2A9D8F, 0xE9C46A, 0xF4A261, 0xE76F51, 0x1D3557, 0x457B9D]; },

  // ============================================================
  // On-screen sizing
  // ============================================================
  // Procedural models are authored in "real" metres (a sword is ~0.9 units
  // long, a pistol ~0.3), so their on-screen size has to be derived rather
  // than guessed: the old fixed multipliers drew every weapon several times
  // taller than the screen. Each weapon type declares the share of the screen
  // height its widest visible dimension should cover.
  screenFractionFor(weapon) {
    if (!weapon) return 0.81;
    if (weapon.isWhip) return 1.00;
    if (weapon.isFlail) return 0.95;
    // An unarmed fist is measured with its forearm attached (Weapon3D_Unarmed
    // _uArm), so its widest extent is roughly 3-4x a bare hand's: fitted this
    // large, the fist itself lands at about the size a held Glove weapon
    // reads at while the forearm runs on past the bottom edge of the screen,
    // rather than a held weapon's grip simply floating at the anchor.
    if (weapon.unarmedArchetype) return 2.10;
    // Shields sit compactly in the off-hand corner rather than towering over
    // the whole combat arena.
    if (weapon.shieldArmorId || weapon.id === 166) {
      const grams = this.weightOf(weapon);
      if (grams < 1600) return 0.28;
      if (grams >= 3500) return 0.44;
      return 0.35;
    }
    switch (weapon.wtypeId) {
      case 1:  return 0.62; // Light (dagger)
      case 2:  return 0.89; // Sword
      case 3:  return 0.97; // Heavy
      case 4:  return 0.95; // Axe
      case 5:  return 1.00; // Whip
      case 6:  return 1.13; // Staff
      // A bow is the tallest thing anyone carries, and it is held out at
      // arm's length rather than tucked in like a gun: drawn any smaller it
      // reads as a twig at the edge of the frame. A crossbow is a shoulder
      // weapon of ordinary size and keeps the old figure.
      case 7:  return weapon.isCrossbow ? 0.84 : 1.16;
      // Thrown weapons are small in the hand; a crossbow filed in the same
      // rack is not one of them.
      case 8:  return weapon.isCrossbow ? 0.84 : 0.46;
      case 9:  return 0.78; // Gun (first-person)
      case 10: return 0.57; // Claw
      case 11: return 0.54; // Glove
      case 12: return 1.13; // Spear
      default: return 0.81;
    }
  },

  // ============================================================
  // First-person pose
  // ============================================================
  // How a weapon sits in the battle view: its resting rotation, its nudge from
  // the shared weapon anchor, and the idle breathing sway. Sprite_3DWeapon
  // delegates to these rather than owning them, so anything that needs to
  // reproduce the battle pose outside a battle (the 3D Weapon Viewer in
  // tools/) gets the same numbers instead of a drifting copy.

  /** Resting rotation in degrees, or the authored <3DRotation> if there is one. */
  baseRotationFor(weapon) {
    if (weapon.model3dRotation) return weapon.model3dRotation;
    if (weapon.isWhip) return { x: 0, y: 0, z: -15 };
    if (weapon.isFlail) return { x: 0, y: 0, z: -10 };
    // An unarmed fist carries its own forearm (Weapon3D_Unarmed's _uArm) and
    // is meant to read as a raised guard rather than a grip held level, which
    // is what separates it from a held Glove weapon (boxing gloves, knuckle
    // dusters, ...) sharing the same wtypeId.
    if (weapon.unarmedArchetype) return { x: 12, y: -10, z: -8 };
    // A shield rests across the body with its face turned out, angled just
    // enough to read as a plate rather than an edge.
    if (weapon.shieldArmorId || weapon.id === 166) return { x: -6, y: -22, z: 4 };
    switch (weapon.wtypeId || 1) {
      case 1: return { x: 0, y: 0, z: -20 };   // Light (dagger)
      case 2: return { x: 0, y: 0, z: -15 };   // Sword
      case 3: return { x: 0, y: 0, z: -25 };   // Heavy
      case 4: return { x: 0, y: 0, z: -20 };   // Axe
      case 5: return { x: 0, y: 0, z: -15 };   // Whip
      case 6: return { x: 0, y: 0, z: -10 };   // Staff
      // Thrown weapons point along +Z (kunai, dart) or lie in the X-Y plane
      // (shuriken); a partial tilt reads for both. A device in the same slot
      // (sling, blowgun, spray, launcher, crossbow) is aimed instead, like
      // every other weapon that puts something out rather than being thrown
      // itself. Which of the two a projectile is comes from its throw style,
      // so the rest pose and the motion can never disagree.
      case 8: return this.THROW_AIMS[this.throwStyleFor(weapon)]
        ? this.aimRotationFor(-0.86, -0.5)
        : { x: 55, y: 0, z: -20 };
      // Bows and firearms alike are modelled shooting down +Z, so both rest
      // already levelled across the battlefield, up and to the left, and swing
      // from there onto whatever they are actually shooting at. A bow turned
      // any other way looses its arrow across the screen instead of into it.
      case 7:                                  // Bow
      case 9: return this.aimRotationFor(-0.86, -0.5);
      case 10: return { x: 0, y: 0, z: -15 };  // Claw
      case 11: return { x: 0, y: 0, z: 0 };    // Glove
      case 12: return { x: 0, y: 0, z: -15 };  // Spear
      default: return { x: 0, y: 0, z: -15 };
    }
  },

  // ============================================================
  // Aiming
  // ============================================================
  // How much of a gun's length stays on the screen when it is aimed. The
  // overlay camera is orthographic, so a barrel pointed dead at the enemy would
  // spend its whole length in depth and read as a black lump: keeping this
  // share of it across the screen is what makes the weapon legible as a gun
  // pointing away from the player.
  AIM_SCREEN_SHARE: 0.62,
  // Kept off the vertical so the weapon does not read as a flat cutout. Roll
  // turns the gun about its own barrel, so it never moves the muzzle.
  AIM_ROLL: -8,

  /**
   * The rotation that puts a weapon's muzzle on a point of the screen. dx/dy
   * are the offset from the weapon to that point in game pixels (y grows
   * downward, as everywhere else on screen); only their direction is used.
   *
   * Every gun is modelled with its barrel along +Z, and THREE's default XYZ
   * Euler order sends that axis to (sin y, -sin x cos y, cos x cos y). The two
   * angles below are that mapping inverted for a barrel whose screen-space
   * direction is fixed and whose remaining length is spent going away from the
   * camera, which is the half of the direction the enemy is standing in.
   */
  aimRotationFor(dx, dy) {
    const len = Math.hypot(dx, dy);
    const share = this.AIM_SCREEN_SHARE;
    const sx = len ? (dx / len) * share : -share;
    const sy = len ? (-dy / len) * share : 0;   // world Y grows upward
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    // Math.PI - asin() rather than asin(): both give the wanted sin, but this
    // branch is the one whose cosine is negative, i.e. the barrel pointing into
    // the screen rather than back at the player.
    const yRad = Math.PI - Math.asin(clamp(sx));
    const cosY = Math.cos(yRad);
    const xRad = Math.asin(clamp(-sy / cosY));
    const deg = 180 / Math.PI;
    return { x: xRad * deg, y: yRad * deg, z: this.AIM_ROLL };
  },

  /**
   * True when the weapon shoots ammunition rather than being the thing thrown.
   * The projectile slot holds both: a sling or a blowgun stays in the hand and
   * is reloaded (`<Bullets:>`), a chakram or a grenade leaves it.
   */
  isLauncher(weapon) {
    if (!weapon) return false;
    if (weapon.maxBullets) return true;
    return /<Bullets:\s*\d+>/i.test(weapon.note || '');
  },

  /** Weapons that turn to follow what they are being fired at. */
  aimsAtTarget(weapon) {
    // An authored GLB is posed by its own <3DRotation> and need not shoot down
    // +Z, so only the procedural models are turned. Every procedural gun, bow,
    // crossbow and sling does: barrel/arrow/pouch all point +Z.
    if (!weapon || weapon.model3d) return false;
    if (weapon.wtypeId === 9 || weapon.wtypeId === 7) return true;
    // A projectile is aimed only if the thing it does is POINT at somebody: a
    // fork, a mouthpiece, a nozzle or a tube. Every projectile that leaves the
    // hand swings instead, and is turned onto the enemy by its strike rather
    // than by its rest pose, or the throw would be aimed twice over.
    return weapon.wtypeId === 8 && !!this.THROW_AIMS[this.throwStyleFor(weapon)];
  },

  /**
   * Screen-space nudge from the shared weapon anchor, in game pixels. Guns sit
   * low and to the right like a first-person viewmodel; melee weapons hang off
   * the anchor by their grip. A procedural model grows around its own centre,
   * so the taller it is drawn the further its grip reaches below the anchor:
   * lift it by a share of its drawn height to keep the pommel in view.
   */
  anchorOffsetFor(weapon, screenHeight) {
    const screenH = screenHeight || ((typeof Graphics !== 'undefined' && Graphics.height) ? Graphics.height : 624);
    // A weapon that is aimed is carried up toward the line of sight rather than
    // resting low like a blade, but it still hangs off the bottom right corner
    // by a share of the height it is drawn at, so a long bow does not float in
    // the middle of the frame the way a pistol would.
    if (this.aimsAtTarget(weapon)) {
      // A firearm is shouldered off to the side rather than held down the
      // centre line, so it sits a little further right than a bow does.
      const gunNudge = weapon.wtypeId === 9 ? 30 : 0;
      return { x: 40 + gunNudge, y: 20 - screenH * this.screenFractionFor(weapon) * 0.16 };
    }
    if (weapon.model3d) return { x: 0, y: 0 };
    // An unarmed fist is built around its wrist, not its own centre (the
    // forearm hangs below it rather than the model growing symmetrically
    // both ways), so it does not need the grip-lift the generic melee
    // formula below applies - that formula would push a whole extra
    // forearm-length off the top of the frame instead of keeping the fist in
    // place. A small fixed nudge is enough to seat it where a held weapon's
    // working end would be.
    if (weapon.unarmedArchetype || weapon.wtypeId === 11) return { x: 80, y: -30 };
    if (weapon.shieldArmorId || weapon.id === 166) return { x: -20, y: -10 };
    // A melee weapon is carried, not floated: its grip runs off the bottom edge
    // and only the working end rises into the lower frame. A procedural model
    // grows about its own centre, so how far down it is pushed is a share of
    // the height it is actually drawn at.
    return { x: 20, y: 30 - screenH * this.screenFractionFor(weapon) * 0.26 };
  },

  /**
   * Idle breathing, tuned per weapon type: a tight FPS sway for guns, a heavy
   * hanging swing for mauls and axes, a floating drift for staves, a natural
   * figure-eight for everything else.
   * @returns {{dx:number, dy:number, drx:number, drz:number}} pixel offsets and
   *   radian offsets to add to the resting pose.
   */
  idleSway(weapon, idleMs) {
    const freq = idleMs * 0.0025;
    if (weapon && (weapon.shieldArmorId || weapon.id === 166)) {
      return {
        dx: Math.cos(freq * 0.4) * 2.2, dy: Math.sin(freq * 0.8) * 3.0,
        drz: Math.sin(freq * 0.4) * 0.009, drx: Math.cos(freq * 0.8) * 0.007
      };
    }
    const t = weapon ? (weapon.wtypeId || 1) : 1;
    if (t === 9) {
      return {
        dx: Math.cos(freq * 0.4) * 2.2, dy: Math.sin(freq * 0.8) * 3.0,
        drz: Math.sin(freq * 0.4) * 0.009, drx: Math.cos(freq * 0.8) * 0.007
      };
    }
    if (t === 3 || t === 4) {
      return {
        dx: Math.cos(freq * 0.35) * 5.5,
        dy: Math.sin(freq * 0.7) * 6.5 + Math.sin(freq * 0.3) * 1.5,
        drz: Math.sin(freq * 0.35) * 0.024, drx: Math.cos(freq * 0.7) * 0.016
      };
    }
    if (t === 6) {
      return {
        dx: Math.cos(freq * 0.55) * 5.0 + Math.sin(freq * 1.1) * 1.8,
        dy: Math.sin(freq * 0.45) * 7.5 + Math.cos(freq * 1.3) * 2.2,
        drz: Math.sin(freq * 0.55) * 0.022, drx: Math.cos(freq * 0.45) * 0.016
      };
    }
    if (t === 12) {
      return {
        dx: Math.cos(freq * 0.5) * 3.0, dy: Math.sin(freq * 0.9) * 5.0,
        drz: Math.sin(freq * 0.5) * 0.014, drx: Math.cos(freq * 0.9) * 0.010
      };
    }
    return {
      dx: Math.cos(freq * 0.5) * 4.2, dy: Math.sin(freq) * 5.8,
      drz: Math.sin(freq * 0.5) * 0.019, drx: Math.cos(freq) * 0.013
    };
  },

  // Segment easings. A keyframe's `ease` governs the segment that STARTS at
  // it. Linear interpolation between poses is most of why the old fixed clips
  // read as weak: a swing that covers its distance at a constant rate has no
  // acceleration in it, and acceleration is the whole sensation of a blow.
  EASINGS: {
    linear: t => t,
    in: t => t * t,
    out: t => 1 - (1 - t) * (1 - t),
    inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    expoIn: t => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    expoOut: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    snap: t => 1 - Math.pow(1 - t, 5),
    backOut: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2)
  },

  // ============================================================
  // Striking what is actually there
  // ============================================================
  // A clip is authored as a blow across the view, which is where every one of
  // them used to end up: sailing off the left edge with the enemy standing
  // somewhere else entirely. The whole choreography is instead turned so its
  // furthest reach lands on the target, and shortened so it stops there rather
  // than carrying on past. A blow at something close by therefore becomes a
  // short movement in place, and one at something across the field opens out.

  // How far a strike may be stretched or squeezed to land where it is aimed.
  // It never travels further than it was authored to, and never shrinks below
  // the point where it stops reading as a blow at all.
  STRIKE_MIN: 0.45,
  STRIKE_MAX: 1.0,

  /**
   * The clip's furthest reach from the resting pose in the plane of the screen,
   * i.e. the frame where the blow lands. Cached on the clip.
   */
  clipPeak(clip) {
    if (clip._peak !== undefined) return clip._peak;
    let peak = null;
    let len = 0;
    for (const f of clip.frames || []) {
      const d = Math.hypot(f.x || 0, f.y || 0);
      if (d > len) { len = d; peak = f; }
    }
    return (clip._peak = (peak && len > 1) ? { x: peak.x || 0, y: peak.y || 0, len: len } : null);
  },

  /**
   * The rotation and scale that carry `clip` onto `aimPoint` (game pixels).
   * Null when there is nothing to aim at or the clip does not travel, in which
   * case it plays exactly as it was authored.
   */
  strikeTransformFor(clip, weapon, screenX, screenY, aimPoint) {
    // A weapon that already turns to face its target does not also swing at it.
    if (!clip || !aimPoint || this.aimsAtTarget(weapon)) return null;
    const peak = this.clipPeak(clip);
    if (!peak) return null;
    const off = this.anchorOffsetFor(weapon);
    const dx = aimPoint.x - (screenX + off.x);
    const dy = -(aimPoint.y - (screenY - off.y));   // world Y grows upward
    const reach = Math.hypot(dx, dy);
    if (reach < 1) return null;
    const angle = Math.atan2(dy, dx) - Math.atan2(peak.y, peak.x);
    return {
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      scale: Math.max(this.STRIKE_MIN, Math.min(this.STRIKE_MAX, reach / peak.len)),
      roll: angle * 180 / Math.PI,
      peak: peak.len
    };
  },

  /**
   * Carries one sampled keyframe through a strike transform, in place. The
   * weapon's roll follows the direction of travel so the edge leads the blow,
   * scaled by how far into the swing the frame is: at rest it adds nothing, so
   * the clip still starts and ends exactly on the idle pose.
   */
  applyStrikeTransform(k, xf) {
    if (!xf) return k;
    const lead = Math.min(1, Math.hypot(k.x, k.y) / xf.peak);
    const x = k.x * xf.scale;
    const y = k.y * xf.scale;
    k.x = x * xf.cos - y * xf.sin;
    k.y = x * xf.sin + y * xf.cos;
    k.rz += xf.roll * lead;
    return k;
  },

  /**
   * Interpolates a keyframe clip at normalised time `t` (0..1).
   * @returns {{x,y,z,rx,ry,rz,scale}} offsets from the resting pose.
   */
  sampleKeyframes(frames, t) {
    const rest = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 };
    if (!frames || frames.length === 0) return rest;
    let prev = frames[0];
    let next = frames[frames.length - 1];
    for (let i = 0; i < frames.length - 1; i++) {
      if (t >= frames[i].t && t <= frames[i + 1].t) {
        prev = frames[i];
        next = frames[i + 1];
        break;
      }
    }
    const span = next.t - prev.t;
    let lt = span > 0 ? (t - prev.t) / span : 0;
    const ease = prev.ease && this.EASINGS[prev.ease];
    if (ease) lt = ease(lt);
    const lerp = (a, b, f) => a + (b - a) * f;
    return {
      x: lerp(prev.x || 0, next.x || 0, lt),
      y: lerp(prev.y || 0, next.y || 0, lt),
      z: lerp(prev.z || 0, next.z || 0, lt),
      rx: lerp(prev.rx || 0, next.rx || 0, lt),
      ry: lerp(prev.ry || 0, next.ry || 0, lt),
      rz: lerp(prev.rz || 0, next.rz || 0, lt),
      scale: lerp(prev.scale !== undefined ? prev.scale : 1, next.scale !== undefined ? next.scale : 1, lt)
    };
  },

  // ============================================================
  // Procedural attack motion
  // ============================================================
  // Attacks are generated per weapon rather than read from a fixed table. Two
  // measured properties drive everything:
  //
  //   reach  how long the weapon actually is, measured off the built model
  //          (the same extent the screen fit uses), 0 for a knife, 1 for a
  //          two-handed polearm. Governs how far the strike travels and how
  //          far it rotates.
  //   heft   how heavy it is, from its <Weight:> tag on a log scale between
  //          40g and 8kg. Governs how long the wind-up takes, how hard the
  //          impact lands, and how slowly it recovers.
  //
  // So a kitchen knife flicks out in a quarter of a second and a Zweihander
  // takes most of a second to come round, and neither is a scaled copy of a
  // single authored clip.

  // Authored lengths in model units, per weapon type, for the case where the
  // model has not been measured yet.
  DEFAULT_EXTENT: {
    1: 0.32, 2: 0.7, 3: 0.95, 4: 0.85, 5: 0.6, 6: 1.1,
    7: 0.8, 8: 0.2, 9: 0.45, 10: 0.3, 11: 0.25, 12: 1.2
  },
  DEFAULT_WEIGHT: {
    1: 300, 2: 1300, 3: 4000, 4: 1800, 5: 600, 6: 1500,
    7: 900, 8: 400, 9: 3500, 10: 100, 11: 250, 12: 2200
  },

  /** Grams, from the weapon's <Weight:> tag. */
  weightOf(weapon) {
    const m = (weapon.note || '').match(/<Weight:\s*([\d.]+)>/i);
    if (m) {
      const g = parseFloat(m[1]);
      if (Number.isFinite(g) && g > 0) return g;
    }
    return this.DEFAULT_WEIGHT[weapon.wtypeId] || 1000;
  },

  /**
   * Measured physique of a weapon, cached on the model.
   * @returns {{extent:number, grams:number, reach:number, heft:number}}
   */
  weaponMetrics(weapon, model) {
    if (model && model.userData._metrics) return model.userData._metrics;

    let extent = model && model.userData._fitExtent;
    if (!extent && model && typeof THREE !== 'undefined') {
      const prev = model.scale.clone();
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      extent = Math.max(size.x, size.y) || 0;
      model.scale.copy(prev);
      model.updateMatrixWorld(true);
      model.userData._fitExtent = extent;
    }
    if (!extent) extent = this.DEFAULT_EXTENT[weapon.wtypeId] || 0.6;

    const grams = this.weightOf(weapon);
    const metrics = {
      extent: extent,
      grams: grams,
      // 0.18m (a shiv) to 1.25m (a pike) covers everything in the database.
      reach: Math.max(0, Math.min(1, (extent - 0.18) / (1.25 - 0.18))),
      // Log scale: the difference between 40g and 300g matters as much as the
      // difference between 1kg and 8kg.
      heft: Math.max(0, Math.min(1, (Math.log(grams) - Math.log(40)) / (Math.log(8000) - Math.log(40))))
    };
    if (model) model.userData._metrics = metrics;
    return metrics;
  },

  // Animation name -> motion archetype and its direction. `dir` +1 sweeps
  // right-to-left across the view, -1 the other way; `tilt` +1 travels upward
  // through the arc, -1 downward.
  ATTACK_MOTIONS: {
    Swing: { kind: 'arc', dir: 1 },
    SwingLeft: { kind: 'arc', dir: -1 },
    Slash: { kind: 'arc', dir: 1, tilt: 0.4 },
    Cleave: { kind: 'arc', dir: 1, tilt: -0.6, power: 1.2 },
    CrossSlash: { kind: 'arc', dir: -1, tilt: 0.5, repeat: 2 },
    SwingDiagonalDown: { kind: 'arc', dir: 1, tilt: -0.8 },
    SwingDiagonalUp: { kind: 'arc', dir: -1, tilt: 0.8 },
    SwingDown: { kind: 'overhead' },
    Overhead: { kind: 'overhead', power: 1.15 },
    Execute: { kind: 'overhead', power: 1.4 },
    SwingUp: { kind: 'rising' },
    Uppercut: { kind: 'rising', power: 1.15 },
    Thrust: { kind: 'thrust' },
    Impale: { kind: 'thrust', power: 1.3 },
    Backstab: { kind: 'thrust', dir: -1, power: 1.1 },
    Spin: { kind: 'spin' },
    Whirlwind: { kind: 'spin', turns: 2 },
    Cyclone: { kind: 'spin', turns: 2, tilt: 0.5 },
    Flourish: { kind: 'spin', dir: -1 },
    Block: { kind: 'guard' },
    Parry: { kind: 'guard', dir: -1 },
    Riposte: { kind: 'guard', riposte: true },
    HiddenBlade: { kind: 'swordcane' },
    Recoil: { kind: 'recoil' },
    RevolverRecoil: { kind: 'recoil', power: 1.25 },
    RifleRecoil: { kind: 'recoil', power: 1.5 },
    Shoot: { kind: 'recoil' },
    Reload: { kind: 'reload' },
    BowDrawAndRelease: { kind: 'draw' },
    CrossbowShot: { kind: 'crossbow' },
    // The shapes the sub-categories brought with them. Nothing in the database
    // carries a scythe or a glaive tag yet, so until something does these are
    // how a skill or a <Movement:> tag asks for the hauled cut and the levelled
    // sweep by name.
    Reap: { kind: 'reap' },
    Harvest: { kind: 'reap', power: 1.15 },
    Sweep: { kind: 'sweep' },
    LegSweep: { kind: 'sweep', tilt: -0.4 },
    Flurry: { kind: 'flurry' },
    RapidStab: { kind: 'flurry', hits: 4 }
  },

  // The motion a weapon falls back to when the caller asks for a name nothing
  // knows (a skill's own animation tag, most often).
  TYPE_MOTIONS: {
    1: 'thrust', 2: 'arc', 3: 'overhead', 4: 'arc', 5: 'lash', 6: 'cast',
    7: 'draw', 8: 'hurl', 9: 'recoil', 10: 'arc', 11: 'thrust', 12: 'thrust'
  },

  // Note tag -> motion, in priority order, for the sub-categories whose blow is
  // not the one their weapon type implies. A halberd and a trident are filed as
  // spears and would otherwise poke with the point, when what a shafted weapon
  // that long actually does is take the legs out from under someone. Tags no
  // weapon in the database carries are deliberately not listed, and neither is
  // anything that shoots: rangedMotionFor settles those and runs first.
  NOTE_MOTIONS: [
    [/<Halberd>/i, 'sweep'],
    [/<Trident>/i, 'sweep']
  ],

  /**
   * The motion a sub-category is REQUIRED to use, or null for a weapon that is
   * simply swung. These three hang or fold off the grip instead of extending
   * it, and none of them can be carried through a blow the way a rigid blade
   * is: the whip lays out and cracks, the flail is slung and then drags the
   * hand after it, the nunchaku is twirled and snapped.
   */
  subtypeMotionFor(weapon) {
    if (!weapon) return null;
    if (weapon.isWhip) return 'lash';
    if (weapon.isFlail) return 'flail';
    if (weapon.isNunchaku) return 'nunchaku';
    return null;
  },

  // What a hanging weapon is still allowed to do instead of its own motion:
  // stand behind it, and work on it.
  SUBTYPE_KEEP: { guard: true, reload: true },

  // ============================================================
  // The weapons that move like nothing else
  // ============================================================
  // A handful of weapons are not a type with a name on them. Mjölnir is thrown
  // and comes back; a war fan is opened before it is any use and shut again
  // afterwards; a foam finger has the whole wind-up of a real blow and none of
  // the mass to land it; a hammer of time runs backwards through its own swing.
  // Every one of those was playing the generic swing for its weapon type, which
  // is the one thing that makes a legendary weapon feel like a reskin.
  //
  // Keyed by database id, as the 3D model families are, because there is no tag
  // that could describe any of these and no second weapon that would want it.
  // Two pairs deliberately share a motion: the two war fans are the same weapon
  // twice, and so are the two crowns.
  UNIQUE_MOTIONS: {
    28: 'levitate',      // Psychic Crown
    111: 'present',      // Excalibur
    113: 'serpentine',   // Dragon Blade
    149: 'flip',         // Master Flipper
    151: 'fansnap',      // Tessen
    154: 'flop',         // Number One Fan
    178: 'zenith',       // Celestial Hammer
    180: 'stutter',      // Chronos Hammer
    183: 'fansnap',      // Varlenia War Fan
    185: 'recall',       // Mjölnir
    238: 'swat',         // Fly Swatter
    312: 'orbit',        // Arcane Sphere
    317: 'levitate'      // Psychic Amplifier Crown
  },

  /** The one motion this exact weapon owns, or null for everything else. */
  uniqueMotionFor(weapon) {
    if (!weapon) return null;
    return this.UNIQUE_MOTIONS[weapon.id] || null;
  },

  // What even a one-of-a-kind weapon does the ordinary way: stand behind it,
  // and work on it. A bespoke motion is a blow, and neither of these is.
  UNIQUE_KEEP: { guard: true, reload: true },

  motionForWeapon(weapon, model) {
    const sub = this.subtypeMotionFor(weapon);
    if (sub) return sub;
    const ranged = this.rangedMotionFor(weapon, model);
    if (ranged) return ranged;
    // After the rules that exist for a reason (a weapon that shoots shoots, a
    // weapon that hangs off its grip is slung) and before the type fallbacks,
    // which is where a legendary weapon used to lose its identity.
    const unique = this.uniqueMotionFor(weapon);
    if (unique) return unique;
    const note = weapon.note || '';
    for (let i = 0; i < this.NOTE_MOTIONS.length; i++) {
      if (this.NOTE_MOTIONS[i][0].test(note)) return this.NOTE_MOTIONS[i][1];
    }
    return this.TYPE_MOTIONS[weapon.wtypeId] || 'arc';
  },

  /**
   * The motion a weapon that shoots is REQUIRED to use, or null for one that is
   * swung. A gun fires, a bow and a sling loose, a thrown weapon leaves the
   * hand; none of them is ever a club, whatever a skill or a <Movement:> tag
   * asks for.
   */
  rangedMotionFor(weapon, model) {
    if (!weapon) return null;
    if (weapon.wtypeId === 9) return 'recoil';
    // A crossbow is not drawn: it is carried spanned and let off with a
    // finger, so it takes the trigger motion rather than the archer's one.
    if (this.isCrossbow(weapon, model)) return 'crossbow';
    if (weapon.wtypeId === 7) return 'draw';
    // The projectile slot is not one weapon repeated: it holds slingshots,
    // blowpipes, grenades, discs, bolas and gas cannisters, and none of them
    // moves like any of the others. throwStyleFor answers which.
    if (weapon.wtypeId === 8) return this.throwStyleFor(weapon);
    return null;
  },

  // ============================================================
  // The projectile slot
  // ============================================================
  // Thirty-six weapons are filed as wtypeId 8 and they have almost nothing in
  // common: the slot is where anything that is not swung ended up. A slingshot
  // is drawn against rubber and never leaves the hand; a grenade is lobbed and
  // does; a bola is flung to the end of a cord and hauled back; a pepper spray
  // cannon is not thrown at all, it is held down. Sharing two clips between all
  // of them was what made half the slot read as the same shrug.
  //
  // The style is resolved per weapon id, the same way the 3D models are (see
  // the `unique:` map in Weapon3D_Projectiles), because the slot is small,
  // finite and hand-authored, and because the note tags alone cannot tell a
  // slingshot from a blowpipe. Tags settle the families that are tagged, and
  // anything unlisted still gets something sensible rather than nothing.
  THROW_STYLES: {
    380: 'sling',        // Uneven Slingshot
    381: 'sling',        // Stretchy Sling
    382: 'blowgun',      // Leaky Blowgun
    383: 'sling',        // Hanger Slingshot
    384: 'sling',        // Junk Slingshot
    385: 'sling',        // Pipe Slingshot
    386: 'blowgun',      // Skewer Dart Gun
    387: 'emitter',      // Hairspray Torch
    388: 'blowgun',      // Staple Shooter
    389: 'hurl',         // Stone Darts
    390: 'sling',        // Fiber Sling
    391: 'hurl',         // Atlatl Dart
    392: 'cast',         // Seed Grimorie
    393: 'tether',       // Bola
    394: 'whirl',        // Sling
    395: 'boomerang',    // Boomerang
    396: 'tether',       // Rope Dart
    397: 'discus',       // Chakram
    398: 'emitter',      // Pepper Spray Cannon
    399: 'hurl',         // Shongo
    400: 'boomerang',    // Returning Discus
    401: 'blowgun',      // Poison Blowpipe
    402: 'lob',          // Iron Grenade
    403: 'crossbow',     // Crossbow
    404: 'draw',         // Mithril Bow
    405: 'discus',       // Disc Launcher
    406: 'crossbow',     // Explosive Crossbow
    407: 'emitter',      // EMP Disruptor
    408: 'crossbow',     // Tactical Crossbow
    409: 'emitter',      // Neural Scrambler
    410: 'launcher',     // Timed Explosive Launcher
    411: 'emitter',      // Cyber Warfare Device
    412: 'sling',        // Stellar Sling
    413: 'launcher',     // Drone Swarm Launcher
    414: 'crossbow',     // EHI Knowledge Injector
    415: 'portal'        // Portal Disc
  },

  // The families that carry a tag of their own, for a projectile the map above
  // has not been told about (a mod's weapon, or a new database entry).
  THROW_STYLE_TAGS: [
    [/<Crossbow>/i, 'crossbow'],
    [/<Boomerang>/i, 'boomerang'],
    [/<Chakram>/i, 'discus'],
    [/<DroneLauncher>/i, 'launcher'],
    [/<Cast>/i, 'cast']
  ],

  // Which throw styles POINT the weapon at the enemy rather than swinging it
  // there. Everything here stays in the hand and puts something out of a fork,
  // a mouthpiece, a nozzle, a prod or a tube; everything absent leaves the hand
  // or is whirled on a cord, and is turned onto the target by its strike.
  THROW_AIMS: {
    sling: true, blowgun: true, emitter: true, launcher: true,
    crossbow: true, draw: true
  },

  /**
   * How a projectile is used, or null for a weapon that is not one. Always
   * answers something for wtypeId 8: an unlisted projectile that carries
   * ammunition is a device that is loaded and let off, and one that carries
   * none is the ammunition, so it is thrown.
   */
  throwStyleFor(weapon) {
    if (!weapon || weapon.wtypeId !== 8) return null;
    const byId = this.THROW_STYLES[weapon.id];
    if (byId) return byId;
    const note = weapon.note || '';
    for (let i = 0; i < this.THROW_STYLE_TAGS.length; i++) {
      if (this.THROW_STYLE_TAGS[i][0].test(note)) return this.THROW_STYLE_TAGS[i][1];
    }
    return this.isLauncher(weapon) ? 'sling' : 'hurl';
  },

  // Motions a ranged weapon is still allowed to play: reloading it, and
  // bracing behind it. Anything else is replaced by its own firing motion.
  RANGED_KEEP: { reload: true, guard: true },

  /**
   * The motion an empty hand is REQUIRED to use, or null for a hand holding
   * something. A bare fist has no blade to sweep and no shaft to bring over,
   * so whatever a skill name or a <Movement:> tag asked for, an unarmed
   * strike is thrown as a punch (MOTIONS.punch still shapes itself around
   * what was asked, so an uppercut comes up from under and a swing turns
   * into a hook). Only the Humanoid fist is thrown this way: every other
   * archetype swings a claw, a hoof or a pseudopod, none of which punches.
   */
  fistMotionFor(weapon) {
    if (!weapon || weapon.unarmedArchetype !== 'Humanoid') return null;
    return 'punch';
  },

  // What a fist is still allowed to do instead of punching: put itself in the
  // way. Everything else it does, it does by hitting something.
  FIST_KEEP: { guard: true },

  // ============================================================
  // Variety: the same weapon, a different blow
  // ============================================================
  // One clip per weapon is what makes a long fight read as a loop: the eye
  // learns the swing after two rounds and stops watching it. Nobody swings the
  // same way twice either, so a motion chosen by the weapon rather than named
  // by a skill picks one of these SHAPES and merges it over the descriptor.
  // They are overlays, not descriptors: whatever a variant leaves unsaid stays
  // as the motion had it.
  //
  // `pace` is how long the blow takes against its own motion's clock, above 1
  // for something committed and below 1 for a flick.
  VARIANTS: {
    arc: [
      { dir: 1, tilt: 0 },                                  // level, right to left
      { dir: -1, tilt: 0.12, pace: 1.05 },                  // level backhand
      { dir: 1, tilt: -0.7, power: 1.08, pace: 0.98 },      // diagonal, downward
      { dir: -1, tilt: 0.78, power: 0.96 },                 // rising backhand
      { dir: 1, tilt: -0.28, power: 0.6, pace: 0.8 }        // short chop, close in
    ],
    overhead: [
      { dir: 0 },                                           // straight down the middle
      { dir: 1, tilt: 0.6, pace: 0.98 },                    // off the shoulder
      { dir: -1, tilt: 0.4, power: 1.12, pace: 1.1 }        // stepped through
    ],
    rising: [
      { dir: 1 },
      { dir: -1, power: 1.1, pace: 1.04 },
      { dir: 1, power: 0.85, pace: 0.86 }
    ],
    thrust: [
      { aim: 0 },                                           // straight lunge
      { aim: -1, power: 0.9, pace: 0.9 },                   // low stab
      { aim: 1, power: 1.08, pace: 1.02 }                   // high stab
    ],
    punch: [
      { from: null, power: 0.85, pace: 0.82 },              // jab
      { from: null, power: 1.12 },                          // cross
      { from: 'arc', dir: 1 },                              // hook
      { from: 'arc', dir: -1, pace: 0.94 }                  // the other hook
    ],
    lash: [
      { dir: 1, tilt: -0.6 },                               // laid down across
      { dir: -1, tilt: 0.7, pace: 0.94 },                   // flicked up backhand
      { dir: 1, tilt: 0.1, power: 1.1, pace: 1.08 }         // straight out, full length
    ],
    spin: [
      { dir: 1, turns: 1 },
      { dir: -1, turns: 1, tilt: 0.4 },
      { dir: 1, turns: 2, pace: 1.08 }
    ],
    flail: [
      { dir: 1, orbits: 1 },                                // level orbit
      { dir: -1, orbits: 1, pace: 1.04 },
      { dir: 1, orbits: 1, from: 'overhead', power: 1.1 },  // over the top
      { dir: -1, orbits: 1, from: 'rising', power: 0.95 }   // slung underhand
    ],
    nunchaku: [
      { dir: 1, passes: 2 },
      { dir: -1, passes: 2, pace: 0.94 },
      { dir: 1, passes: 1, power: 1.1, pace: 0.92 }         // no showing off, just the snap
    ],
    sweep: [
      { dir: 1 },
      { dir: -1, pace: 1.04 },
      { dir: 1, tilt: -0.5, power: 1.08 }                   // right at the ankles
    ],
    reap: [
      { dir: 1 },
      { dir: -1, power: 1.06, pace: 1.05 },
      { dir: 1, power: 0.9, pace: 0.88 }                    // a short hook, close in
    ],
    flurry: [
      { hits: 3 },
      { dir: -1, hits: 3, pace: 0.92 },
      { hits: 2, power: 1.12, pace: 0.94 }
    ],
    cast: [
      { tilt: 0 },
      { tilt: 0.6, pace: 1.06 },
      { tilt: -0.5, power: 1.1, pace: 0.94 }
    ],
    // An overhand throw is one shoulder doing one thing, so the shapes are in
    // where it is thrown FROM: over the top, off the ear, or sidearm and flat.
    // Three darts and a throwing iron share this motion and would otherwise be
    // the same clip three times over.
    hurl: [
      { dir: 1, tilt: 0 },                                  // over the shoulder
      { dir: -1, tilt: 0.2, pace: 0.95 },                   // off the other side
      { dir: 1, tilt: 0.85, power: 1.12, pace: 1.06 },      // straight over the top
      { dir: 1, tilt: -0.8, power: 0.94, pace: 0.9 },       // sidearm and flat
      { dir: -1, tilt: -0.5, power: 1.04, pace: 1.02 }      // low backhand flick
    ],
    // A slingshot is drawn, not thrown: what varies is how hard the rubber is
    // loaded and how long it is held on the mark.
    sling: [
      { dir: 1 },
      { dir: -1, pace: 1.04 },
      { dir: 1, power: 1.06, pace: 0.96 }                   // a snap shot
    ],
    whirl: [
      { dir: 1, orbits: 2 },
      { dir: -1, orbits: 2, pace: 1.05 },
      { dir: 1, orbits: 3, pace: 1.1 },                     // wound right up
      { dir: 1, orbits: 1, power: 0.96, pace: 0.9 }         // one turn and away
    ],
    blowgun: [
      { pace: 1 },
      { pace: 1.06 },                                       // held longer on the mark
      { power: 1.05, pace: 0.94 }                           // barely aimed at all
    ],
    lob: [
      { dir: 1, tilt: 0.5 },                                // over the shoulder
      { dir: -1, tilt: -0.6, pace: 1.05 },                  // underarm
      { dir: 1, tilt: -0.5, power: 1.06 }                   // rolled out low and long
    ],
    discus: [
      { dir: 1 },
      { dir: -1, pace: 0.96 },
      { dir: 1, power: 1.1, pace: 1.04 }                    // put right through it
    ],
    boomerang: [
      { dir: 1 },
      { dir: -1, pace: 1.05 },
      { dir: 1, power: 1.08, pace: 1.02 }                   // thrown out further
    ],
    tether: [
      { dir: 1, orbits: 1 },
      { dir: -1, orbits: 1, pace: 1.04 },
      { dir: 1, orbits: 2, pace: 1.1 }                      // wound up first
    ],
    emitter: [
      { pace: 1 },
      { pace: 1.1 },                                        // a long burst
      { power: 1.08, pace: 0.94 }                           // a short hard one
    ],
    launcher: [
      { pace: 1 },
      { pace: 1.05 },
      { power: 1.08, pace: 0.96 }
    ],
    portal: [
      { dir: 1 },
      { dir: -1, pace: 1.04 },
      { dir: 1, power: 1.08, pace: 0.98 }
    ]
  },

  // A critical hit is not the ordinary blow with the numbers turned up: it is
  // the one the character committed to, so it gets its own shapes. The wind-up
  // goes further out of frame, contact lands later and harder, the follow
  // through carries past the target and the recovery is slower, because that is
  // what putting everything into a swing costs. A kind with nothing here falls
  // back to its ordinary variants and takes only the weight the builders add
  // from `crit`.
  CRIT_VARIANTS: {
    arc: [
      { dir: 1, tilt: -0.35, power: 1.34, pace: 1.12 },     // the whole body turns
      { dir: -1, tilt: 0.3, power: 1.28, pace: 1.1 }
    ],
    overhead: [
      { dir: 0, power: 1.38, pace: 1.12 },                  // from as high as it goes
      { dir: 1, tilt: 0.35, power: 1.32, pace: 1.1 }
    ],
    thrust: [
      { aim: 0, power: 1.38, pace: 1.06 },                  // a full lunge, held there
      { aim: 1, power: 1.3, pace: 1.04 }
    ],
    punch: [
      { from: null, power: 1.38, pace: 1.08 },
      { from: 'arc', power: 1.32, pace: 1.1 }
    ],
    flail: [
      { dir: 1, orbits: 2, power: 1.28, pace: 1.1 },        // one more orbit first
      { dir: -1, orbits: 2, from: 'overhead', power: 1.24, pace: 1.12 }
    ],
    nunchaku: [
      { dir: 1, passes: 3, power: 1.22, pace: 1.0 },        // one more pass before the snap
      { dir: -1, passes: 3, power: 1.26, pace: 1.02 }
    ],
    sweep: [
      { dir: 1, power: 1.32, pace: 1.12 },
      { dir: -1, tilt: -0.4, power: 1.28, pace: 1.1 }
    ],
    reap: [
      { dir: 1, power: 1.32, pace: 1.12 },
      { dir: -1, power: 1.28, pace: 1.1 }
    ],
    flurry: [
      { hits: 3, power: 1.2, pace: 1.02 },                  // the builder adds the extra hit
      { dir: -1, hits: 3, power: 1.16, pace: 1.04 }
    ],
    // A thrown weapon's best is a BETTER THROW, not a bigger club: further
    // back, held longer on the mark, and let go harder. Nothing here reaches
    // any further into the enemy, because none of these ever touches them.
    hurl: [
      { dir: 1, tilt: 0.6, power: 1.26, pace: 1.08 },       // the whole body behind it
      { dir: -1, tilt: -0.4, power: 1.2, pace: 1.05 }
    ],
    sling: [
      { dir: 1, power: 1.18, pace: 1.08 },                  // drawn to the ear
      { dir: -1, power: 1.14, pace: 1.06 }
    ],
    whirl: [
      { dir: 1, orbits: 3, power: 1.2, pace: 1.08 },
      { dir: -1, orbits: 3, power: 1.16, pace: 1.06 }
    ],
    blowgun: [
      { power: 1.12, pace: 1.14 }                           // the long, patient one
    ],
    lob: [
      { dir: 1, tilt: 0.6, power: 1.2, pace: 1.08 },
      { dir: -1, tilt: -0.6, power: 1.16, pace: 1.06 }
    ],
    discus: [
      { dir: 1, power: 1.22, pace: 1.04 },
      { dir: -1, power: 1.18, pace: 1.02 }
    ],
    boomerang: [
      { dir: 1, power: 1.2, pace: 1.06 },
      { dir: -1, power: 1.16, pace: 1.08 }
    ],
    tether: [
      { dir: 1, orbits: 2, power: 1.2, pace: 1.06 },
      { dir: -1, orbits: 2, power: 1.16, pace: 1.08 }
    ],
    emitter: [
      { power: 1.15, pace: 1.14 }                           // everything in the cannister
    ],
    launcher: [
      { power: 1.22, pace: 1.06 }
    ],
    portal: [
      { dir: 1, power: 1.2, pace: 1.06 },
      { dir: -1, power: 1.16, pace: 1.04 }
    ]
  },

  // Motions that are not allowed a shape variant. Four of them are wound round
  // an external clock (the string of a bow, the prod of a crossbow, the blade
  // of a cane, the parts of a gun cycling) and the fifth is a block, which is
  // one movement or it is not a block at all. They still get the shake below.
  VARIANT_LOCKED: {
    recoil: true, reload: true, draw: true, crossbow: true,
    swordcane: true, guard: true
  },

  // Of those, the ones whose LENGTH is also spoken for: their moving parts are
  // driven in milliseconds off the clip they belong to, so the duration is left
  // exactly as authored and only the pose is shaken.
  TIMED_MOTIONS: {
    recoil: true, reload: true, draw: true, crossbow: true, swordcane: true
  },

  /**
   * One variant overlay for a kind, never the same one twice running for the
   * same weapon. A plain random pick stalls on two clips often enough to be
   * noticed, so the choice walks the list by a random step instead: it cannot
   * land where it just was, and it does not march through the list in order
   * either.
   */
  pickVariant(kind, weapon, crit) {
    const list = this.variantsFor(kind, weapon, crit);
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    if (!this._lastVariant) this._lastVariant = {};
    const key = ((weapon && weapon.id) || 0) + ':' + kind + (crit ? ':c' : '');
    const last = this._lastVariant[key];
    const step = 1 + Math.floor(Math.random() * (list.length - 1));
    const idx = (last === undefined)
      ? Math.floor(Math.random() * list.length)
      : (last + step) % list.length;
    this._lastVariant[key] = idx;
    return list[idx];
  },

  /**
   * The variants a weapon may choose between for a kind, including the ones
   * that belong to a different kind entirely: a knife given a thrust may make
   * three stabs instead of one, and a shafted weapon told to level a sweep may
   * hook with the head and haul instead. Both are the same weapon choosing a
   * different blow rather than a second default, so they are offered here.
   */
  variantsFor(kind, weapon, crit) {
    let list = (crit && this.CRIT_VARIANTS[kind]) || this.VARIANTS[kind];
    if (!list) return null;
    if (kind === 'thrust' && weapon && weapon.wtypeId === 1) {
      list = list.concat(this.variantsAsKind('flurry', crit));
    } else if (kind === 'sweep') {
      list = list.concat(this.variantsAsKind('reap', crit));
    }
    return list;
  },

  /** Another kind's variants, each carrying that kind with it. */
  variantsAsKind(kind, crit) {
    const list = (crit && this.CRIT_VARIANTS[kind]) || this.VARIANTS[kind] || [{}];
    return list.map(v => Object.assign({ kind: kind }, v));
  },

  /**
   * The last shake. Two blows thrown the same way are still never identical:
   * the wrist rolls a little further one time, the whole thing comes round a
   * fraction quicker the next. A heavy weapon varies less than a light one,
   * because a mass that far out of the hand mostly keeps its own path.
   *
   * The first and last keyframes are left exactly alone: they are the resting
   * pose the weapon leaves from and returns to, and a weapon that does not end
   * where it started pops on the next blow. No `t` is touched either, since
   * several motions are read against fixed windows elsewhere that live on
   * those times.
   */
  jitterClip(clip, weapon, keepTime) {
    if (!clip || !clip.frames || clip.frames.length < 3) return clip;
    const grams = weapon ? this.weightOf(weapon) : 1000;
    const heavy = Math.max(0, Math.min(1, (Math.log(grams) - Math.log(40)) / (Math.log(8000) - Math.log(40))));
    const amount = 0.045 - heavy * 0.02;
    const wob = () => 1 + (Math.random() * 2 - 1) * amount;
    if (!keepTime) clip.duration *= 1 + (Math.random() * 2 - 1) * 0.08;
    for (let i = 1; i < clip.frames.length - 1; i++) {
      const f = clip.frames[i];
      f.x = (f.x || 0) * wob();
      f.y = (f.y || 0) * wob();
      f.rx = (f.rx || 0) * wob();
      f.ry = (f.ry || 0) * wob();
      f.rz = (f.rz || 0) * wob();
      if (f.scale !== undefined) f.scale = 1 + (f.scale - 1) * wob();
    }
    // The reach a strike is aimed by is measured off these frames, so any
    // answer cached before the shake is now wrong.
    clip._peak = undefined;
    return clip;
  },

  /**
   * Generates the attack clip for a weapon and an animation name.
   * @param {object} [opts] - {crit:boolean}, the blow this clip is being built
   *   for. Absent means an ordinary hit, which is what every older caller means.
   * @returns {{duration:number, frames:Array}} in the same shape the fixed
   *   MovementKeyFrame3d clips use, so nothing downstream changes.
   */
  buildAttack(weapon, name, model, opts) {
    const req = opts || {};
    const crit = !!req.crit;
    const named = !!this.ATTACK_MOTIONS[name];
    let motion = named
      ? Object.assign({}, this.ATTACK_MOTIONS[name])
      : { kind: this.motionForWeapon(weapon, model) };
    // A weapon that hangs off the grip swings the way its own shape allows,
    // whatever the tag says: every flail in the database carries a <Movement:>
    // list written for a rigid blade, and was being swung like a mace with a
    // chain drawn on it. The motion that was asked for is kept as `from`, so
    // the flail that replaces a Swing still goes round level and the one that
    // replaces an Overhead still comes over the top.
    const sub = this.subtypeMotionFor(weapon);
    if (sub && motion.kind !== sub && !this.SUBTYPE_KEEP[motion.kind]) {
      motion = Object.assign({}, motion, { kind: sub, from: motion.kind });
    }
    // What a weapon that shoots does is decided by the weapon, never by the
    // name the skill asked for: most firearms and every sling in the database
    // carry a <Movement:> tag written for a blade, or none at all (which used
    // to mean 'Swing'), and were bashing the enemy with the stock. This runs
    // after the sub-categories on purpose, so the one length of hose filed as
    // a firearm still fires rather than being cracked like the whip it is
    // tagged as.
    const ranged = this.rangedMotionFor(weapon, model);
    if (ranged && motion.kind !== ranged && !this.RANGED_KEEP[motion.kind]) {
      motion = Object.assign({}, motion, { kind: ranged });
    }
    // Same reasoning one step further along: a character with nothing in
    // their hand punches. The motion that was asked for is kept as `from`,
    // so the punch that replaces it can still be the right SHAPE of punch.
    const fist = this.fistMotionFor(weapon);
    if (fist && motion.kind !== fist && !this.FIST_KEEP[motion.kind]) {
      motion = Object.assign({}, motion, { kind: fist, from: motion.kind });
    }
    // And last, the weapons that are only themselves. Every one of them carries
    // a <Movement:> list written for its type (Excalibur is tagged with twelve
    // ordinary sword swings), so the tag has to be overridden here the way the
    // sub-categories are, or the bespoke motion would only ever be reached by a
    // skill that asked for no animation at all. The three rules above still
    // win: something that shoots shoots, something slung is slung, and an empty
    // hand punches, whatever is in the map.
    const unique = this.uniqueMotionFor(weapon);
    if (unique && !sub && !ranged && !fist &&
      motion.kind !== unique && !this.UNIQUE_KEEP[motion.kind]) {
      motion = Object.assign({}, motion, { kind: unique, from: motion.kind });
    }
    if (crit) motion.crit = true;
    // A named motion was shaped by whoever authored it and is left as it was,
    // unless this is a critical hit, which is a different blow rather than the
    // same one repeated harder and so takes its own shape either way.
    if ((!named || crit) && !this.VARIANT_LOCKED[motion.kind]) {
      const variant = this.pickVariant(motion.kind, weapon, crit);
      if (variant) motion = Object.assign({}, motion, variant);
    }
    const build = this.MOTIONS[motion.kind] || this.MOTIONS.arc;
    const m = this.weaponMetrics(weapon, model);
    const H = (typeof Graphics !== 'undefined' && Graphics.height) ? Graphics.height : 624;
    if (motion.kind === 'recoil') {
      // The class profile decides the shape of the kick and how many rounds go
      // out. The model's own parts are started further down, once the clip has
      // a finished length to cycle against.
      motion = Object.assign({}, motion, { profile: this.gunProfileFor(weapon) });
    }
    const clip = build.call(this, m, motion, H);
    if (motion.pace && Number.isFinite(motion.pace) && !this.TIMED_MOTIONS[motion.kind]) {
      clip.duration *= motion.pace;
    }
    // Shaken before anything is driven off the finished length, so the parts
    // that run on this clip's own clock run on the length it actually got.
    this.jitterClip(clip, weapon, !!this.TIMED_MOTIONS[motion.kind]);
    // After the shake, never before it: the hold is two frames that have to be
    // the SAME pose, and jittering them apart is what turns a stop into a
    // wobble. Paced and accented here rather than in each of the thirty motion
    // builders.
    if (!this.TIMED_MOTIONS[motion.kind]) this.accentClip(clip, m, motion);
    // The blade has to leave the shaft on the same clock the shaft is moving
    // on, so the draw is started from the finished clip's own duration.
    if (motion.kind === 'swordcane' && model) this.beginCaneDraw(model, clip.duration);
    // The hand tightening into the blow it is throwing, on the same clock the
    // arm is travelling on.
    if (motion.kind === 'punch' && model) this.beginPunch(model, clip.duration);
    // The muzzle flash, the action and the case, on the clock the kicks are
    // on: same reason as the punch and the bow below.
    if (motion.kind === 'recoil' && model) {
      this.beginGunFire(model, weapon, clip.duration);
    }
    // The magazine, the cylinder and the charging handle, on the clock the
    // hand is working to: the gun is out of the frame for exactly as long as
    // the parts need, and back in battery before it comes up again.
    if (motion.kind === 'reload' && model) {
      this.beginGunReload(model, weapon, clip.duration);
    }
    // Same clock for the string, the limbs and the arrow: the hand kicks on
    // the frame they let go.
    if ((motion.kind === 'draw' || motion.kind === 'crossbow') && model) {
      this.beginBowShot(model, weapon, clip.duration);
    }
    return clip;
  },

  // How much longer than it was authored a swung blow now takes. Monster
  // Hunter's blows are slow: the weight of the thing is sold by how long it
  // takes to come round, and a fast swing reads as a wave rather than a hit.
  ATTACK_PACE: 1.2,
  // The contact hold, as a fraction of the clip. The pose stops on the frame
  // the blow lands and does not move for a moment before the follow through
  // starts. This is the single thing that makes a hit feel like it met
  // something, and it costs two keyframes.
  ATTACK_HOLD: 0.055,

  /**
   * Pace and accent a finished attack clip: stretch it, then stop it dead on
   * the contact and let it come out of that a fraction harder.
   *
   * The contact is whichever frame reaches furthest from rest, which is the
   * same frame the re-aim points at the enemy and the same one the hit effect
   * takes its timing from, so all three agree about where the blow lands.
   */
  accentClip(clip, m, motion) {
    if (!clip || !clip.frames || clip.frames.length < 3) return clip;
    clip.duration *= this.ATTACK_PACE;

    let best = -1, bestReach = -1;
    clip.frames.forEach((f, i) => {
      const reach = (f.x || 0) * (f.x || 0) + (f.y || 0) * (f.y || 0);
      if (reach > bestReach) { bestReach = reach; best = i; }
    });
    const strike = clip.frames[best];
    const after = clip.frames[best + 1];
    if (!strike || !after) return clip;

    // A heavier weapon holds longer, and a critical holds longer still.
    const hold = this.ATTACK_HOLD * (0.7 + m.heft * 0.5) * (motion.crit ? 1.4 : 1);
    const at = Math.min(strike.t + hold, after.t - 0.004);
    if (at <= strike.t) return clip;

    // Landing harder: the contact itself is pushed a little further than it
    // was authored, and the hold sits on that pose rather than easing off it.
    strike.scale = (strike.scale === undefined ? 1 : strike.scale) * 1.04;
    strike.ease = 'expoOut';
    const held = Object.assign({}, strike, { t: at, ease: 'in' });
    clip.frames.splice(best + 1, 0, held);
    return clip;
  },

  MOTIONS: {
    // A blow travelling across the view. Wind up against the direction of
    // travel, hang there a moment, accelerate the whole way across, overshoot
    // the contact point, then give the ground back slowly.
    //
    // The two things that make a swing read as a blow rather than as a weapon
    // being slid around the screen are the hold at the top of the wind-up and
    // the acceleration out of it. Both are here: the gather runs out under
    // `out` and arrives early, the pose barely moves through the hold, and the
    // segment into contact runs under `in` so the fastest part of the swing is
    // the last part before it lands.
    //
    // Heft and reach do more than scale it. A heavy weapon is wound further
    // back, holds there longer because it takes that long to reverse, carries
    // further past the target and is slower to come back on guard; a light one
    // hardly gathers at all and is already settled while the heavy one is
    // still following through.
    arc(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const travel = (0.40 + m.reach * 0.46) * H * power;
      // The gather is never allowed to be the longest thing in the clip: the
      // blow is aimed by whichever frame reaches furthest, and a wind-up that
      // out-travels the strike would have the weapon aimed backwards.
      const wind = Math.min((0.15 + m.heft * 0.16) * H * (o.crit ? 1.35 : 1), travel * 0.5);
      const lift = (0.10 + m.reach * 0.16) * H;
      const turn = (95 + m.reach * 75 + m.heft * 34) * power;
      const punch = 1.13 + m.heft * 0.30 * power + (o.crit ? 0.09 : 0);
      // Heavy weapons spend the time in the wind-up, light ones in the strike.
      const windEnd = 0.20 + m.heft * 0.15 + (o.crit ? 0.05 : 0);
      const hold = 0.02 + m.heft * 0.06;
      const hit = windEnd + 0.19;
      const over = hit + 0.07;
      // A committed swing is a long way from being back on guard.
      const settle = 0.78 + m.heft * 0.07 + (o.crit ? 0.05 : 0);
      const windY = -wind * (0.62 - tilt * 0.5);
      return {
        duration: (290 + m.heft * 440 + m.reach * 180) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Gathered, and held there for as long as the weight demands.
          {
            t: windEnd - hold, x: dir * wind, y: windY, z: -0.06 * H,
            rx: -8 - m.heft * 16, ry: dir * 24, rz: dir * (32 + m.heft * 20),
            scale: 0.90, ease: 'linear'
          },
          // Creeping the last of the way back, which is what reads as the
          // pause before something lets go.
          {
            t: windEnd, x: dir * wind * 1.04, y: windY * 1.04, z: -0.07 * H,
            rx: -9 - m.heft * 18, ry: dir * 26, rz: dir * (34 + m.heft * 22),
            scale: 0.89, ease: 'in'
          },
          {
            t: hit, x: -dir * travel, y: lift * (tilt >= 0 ? 1 : -1) + tilt * lift * 0.6, z: 0.16 * H,
            rx: 10 + tilt * 18, ry: -dir * 30, rz: -dir * turn,
            scale: punch, ease: 'out'
          },
          {
            t: over, x: -dir * travel * (o.crit ? 1.24 : 1.16), y: lift * (tilt >= 0 ? 1.2 : -1.2), z: 0.1 * H,
            rx: 6, ry: -dir * 24, rz: -dir * turn * 1.12,
            scale: punch * 0.94, ease: 'inOut'
          },
          {
            t: settle, x: -dir * travel * 0.5, y: lift * 0.45 * (tilt >= 0 ? 1 : -1), z: 0.03 * H,
            rx: 2, ry: -dir * 10, rz: -dir * turn * 0.46,
            scale: 1.02, ease: 'out'
          },
          // The last of the momentum going out of it on the way back.
          {
            t: settle + (1 - settle) * 0.55, x: dir * travel * 0.06, y: -lift * 0.08, z: 0,
            rx: -2, ry: dir * 3, rz: dir * turn * 0.05, scale: 0.99, ease: 'inOut'
          },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Raised over the head and brought down. The heaviest-feeling motion in the
    // set: the wind-up leaves the frame, hangs at the top for as long as the
    // weight of the thing demands, and then falls under acceleration rather
    // than being lowered.
    //
    // `dir` decides whether it comes down through the middle or off one
    // shoulder, and `tilt` how far across the body it lands, which is the
    // difference between splitting something and cutting through it. The raise
    // is held below the drop so the blow is never aimed at the sky by the
    // re-aim, which measures whichever frame reaches furthest.
    overhead(m, o, H) {
      const dir = o.dir === undefined ? 0 : o.dir;
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const drop = (0.40 + m.reach * 0.30) * H * power;
      const raise = Math.min((0.20 + m.heft * 0.16) * H * (o.crit ? 1.4 : 1), drop * 0.68);
      const cross = dir * tilt * drop * 0.45;
      const punch = 1.20 + m.heft * 0.38 * power + (o.crit ? 0.10 : 0);
      const windEnd = 0.24 + m.heft * 0.15 + (o.crit ? 0.05 : 0);
      const hold = 0.03 + m.heft * 0.07;
      const hit = windEnd + 0.18;
      const over = hit + 0.06;
      const settle = 0.82 + (o.crit ? 0.05 : 0);
      return {
        duration: (380 + m.heft * 520 + m.reach * 150) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          {
            t: windEnd - hold, x: dir * raise * 0.35, y: -raise, z: -0.14 * H,
            rx: -(48 + m.heft * 34), ry: dir * 12, rz: dir * 14, scale: 0.86, ease: 'linear'
          },
          // The top of the lift, where nothing much happens and everything is
          // about to.
          {
            t: windEnd, x: dir * raise * 0.4, y: -raise * 1.05, z: -0.15 * H,
            rx: -(52 + m.heft * 36), ry: dir * 13, rz: dir * 15, scale: 0.85, ease: 'in'
          },
          {
            t: hit, x: cross, y: drop, z: 0.24 * H,
            rx: 62 + m.reach * 26, ry: -dir * 10, rz: -dir * (18 + tilt * 20),
            scale: punch, ease: 'out'
          },
          {
            t: over, x: cross * 1.18, y: drop * (o.crit ? 1.2 : 1.14), z: 0.16 * H,
            rx: 70 + m.reach * 26, ry: -dir * 8, rz: -dir * (20 + tilt * 22),
            scale: punch * 0.9, ease: 'inOut'
          },
          {
            t: settle, x: cross * 0.4, y: drop * 0.4, z: 0.05 * H,
            rx: 26, ry: 0, rz: -dir * 6, scale: 1.03, ease: 'out'
          },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The mirror of overhead: dropped low, then torn upward. The dip is a real
    // gather rather than a pose change, so it lands before the hold and the
    // blow accelerates out of the bottom of it.
    rising(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const rise = (0.40 + m.reach * 0.32) * H * power;
      const dip = Math.min((0.20 + m.heft * 0.16) * H * (o.crit ? 1.3 : 1), rise * 0.6);
      const punch = 1.16 + m.heft * 0.32 * power + (o.crit ? 0.09 : 0);
      const windEnd = 0.21 + m.heft * 0.13 + (o.crit ? 0.04 : 0);
      const hold = 0.02 + m.heft * 0.05;
      const hit = windEnd + 0.19;
      const over = hit + 0.07;
      const settle = 0.82 + (o.crit ? 0.04 : 0);
      return {
        duration: (340 + m.heft * 460 + m.reach * 140) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: windEnd - hold, x: dir * 0.04 * H, y: dip, z: -0.1 * H, rx: 40 + m.heft * 22, ry: dir * 10, rz: dir * 12, scale: 0.88, ease: 'linear' },
          { t: windEnd, x: dir * 0.045 * H, y: dip * 1.05, z: -0.11 * H, rx: 43 + m.heft * 24, ry: dir * 11, rz: dir * 13, scale: 0.87, ease: 'in' },
          { t: hit, x: -dir * 0.05 * H, y: -rise, z: 0.22 * H, rx: -(52 + m.reach * 24), ry: -dir * 14, rz: -dir * 18, scale: punch, ease: 'out' },
          { t: over, x: -dir * 0.06 * H, y: -rise * (o.crit ? 1.2 : 1.15), z: 0.14 * H, rx: -(60 + m.reach * 24), ry: -dir * 10, rz: -dir * 14, scale: punch * 0.92, ease: 'inOut' },
          { t: settle, x: -dir * 0.02 * H, y: -rise * 0.38, z: 0.04 * H, rx: -22, ry: -dir * 4, rz: -dir * 6, scale: 1.02, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Straight down the barrel of the view.
    //
    // The overlay camera is ORTHOGRAPHIC, so travelling on Z changes nothing
    // on screen: depth has to be spoken as scale. The lunge is therefore a
    // zoom, with reach deciding how far the point gets and heft deciding how
    // long it takes to get there. (Z still moves, only for draw order.)
    // `aim` picks the line: 0 straight at the middle of them, -1 up under the
    // ribs from low, +1 down at the throat. A crit is the same line thrown as
    // a full lunge, held at extension for a beat before the weapon is
    // recovered, which is the one thing a stab can do that reads as committed.
    thrust(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const aim = o.aim || 0;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const zoom = 1 + (0.34 + m.reach * 0.38) * power;
      // A stab spends its distance on scale, but it still has to travel far
      // enough across the view for the re-aim to have a direction to work
      // with, and further than the chamber does: the blow is aimed by whatever
      // frame reaches furthest, and that has to be the point, not the elbow.
      const drift = (0.09 + m.reach * 0.09) * H;
      const pull = Math.min((0.10 + m.heft * 0.10) * H, drift * 0.55);
      const windEnd = 0.19 + m.heft * 0.14 + (o.crit ? 0.04 : 0);
      const hold = 0.02 + m.heft * 0.04;
      const hit = windEnd + 0.15;
      // The hold at full extension: a moment on an ordinary stab, long enough
      // to see on a committed one.
      const stay = hit + (o.crit ? 0.14 : 0.06);
      return {
        duration: (250 + m.heft * 380 + m.reach * 130) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Chambered along the line it is going out on, and still.
          { t: windEnd - hold, x: dir * pull, y: -pull * 0.4 - aim * pull * 0.5, z: -60, rx: -10 - aim * 12, ry: dir * 16, rz: dir * 10, scale: 0.86, ease: 'linear' },
          { t: windEnd, x: dir * pull * 1.05, y: (-pull * 0.4 - aim * pull * 0.5) * 1.05, z: -66, rx: -11 - aim * 13, ry: dir * 17, rz: dir * 11, scale: 0.85, ease: 'in' },
          { t: hit, x: -dir * drift, y: drift * 0.5 + aim * drift * 1.2, z: 220, rx: 14 + aim * 10, ry: -dir * 6, rz: -dir * 4, scale: zoom, ease: 'snap' },
          { t: stay, x: -dir * drift * 1.22, y: (drift * 0.7 + aim * drift * 1.3), z: 240, rx: 16 + aim * 11, ry: -dir * 4, rz: -dir * 2, scale: zoom * 1.03, ease: 'inOut' },
          { t: 0.82, x: -dir * drift * 0.4, y: drift * 0.2 + aim * drift * 0.4, z: 90, rx: 6, ry: 0, rz: 0, scale: 1 + (zoom - 1) * 0.3, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A bare fist.
    //
    // None of the swinging motions fit an empty hand: there is no blade to
    // sweep, no shaft to bring over and no mass to let carry the arm through
    // the blow. A punch is the opposite shape of movement, and it is written
    // here as one: a short chamber back toward the shoulder, a straight line
    // out at everything the arm has, and a hand snatched back to the guard
    // faster than it went out, because a fist left hanging out there is how
    // people get hit back.
    //
    // The overlay camera is ORTHOGRAPHIC, so distance covered has to be
    // spoken as scale (as with `thrust`). That is doing most of the work
    // here: the fist grows to half again its size at full extension, which is
    // what sells an arm reaching the length a held weapon never has to.
    //
    // `from` is the motion the skill originally asked for before the fist
    // took it over, so a swing becomes a hook, an uppercut comes up from
    // under and an overhead drops as a hammer fist. All three run on the same
    // clock and all three still read as a punch rather than as a sword swing
    // performed by a hand.
    punch(m, o, H) {
      const from = o.from;
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const hook = from === 'arc' || from === 'spin' || from === 'lash' || from === 'flail';
      const rise = from === 'rising';
      const drop = from === 'overhead';
      // The chamber is small: it is the furthest from the camera the hand
      // ever gets, and a fist pulled back too far reads as a wind-up rather
      // than as a guard being left.
      // A hook travels across the frame and lands short; a straight punch
      // spends everything it has going away from the camera instead, though it
      // still has to cover enough ground for the blow to be aimed by it.
      const zoom = 1 + (hook ? 0.32 : 0.54) * power;
      const cross = hook ? (0.28 + m.reach * 0.16) * H * power : (0.10 + m.reach * 0.06) * H;
      // The chamber stays behind the reach, or the fist would be aimed by the
      // elbow it was pulled back to rather than by where it lands.
      const pull = Math.min((0.07 + m.heft * 0.05) * H * (o.crit ? 1.3 : 1), cross * 0.5);
      const lift = rise ? -(0.24 + m.reach * 0.12) * H
        : (drop ? (0.28 + m.reach * 0.12) * H : 0.025 * H);
      // Fast: the wind-up is a snap of the elbow, not a haul of the shoulder.
      // A committed punch is the exception: the shoulder does come into it, so
      // the chamber goes back further and the hand stays out a beat longer.
      const windEnd = 0.20 + m.heft * 0.09 + (o.crit ? 0.05 : 0);
      const hit = windEnd + 0.14;
      const stay = hit + (o.crit ? 0.11 : 0.05);
      return {
        duration: (250 + m.heft * 180) * (o.crit ? 1.16 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'expoIn' },
          // Chambered: back, turned over, and at its smallest.
          {
            t: windEnd,
            x: dir * pull * (hook ? 1.5 : 1),
            y: rise ? pull * 0.9 : (drop ? -pull * 1.5 : -pull * 0.25),
            z: -0.11 * H,
            rx: rise ? 24 : (drop ? -38 : -14),
            ry: dir * 20, rz: dir * (hook ? 26 : 12),
            scale: 0.80, ease: 'expoOut'
          },
          // Landed. Everything arrives on this frame at once: the reach, the
          // turn of the fist and the size of it.
          {
            t: hit,
            x: -dir * cross, y: lift, z: 0.26 * H,
            rx: rise ? -32 : (drop ? 44 : 12),
            ry: -dir * (hook ? 26 : 8), rz: -dir * (hook ? 34 : 10),
            scale: zoom, ease: 'snap'
          },
          // The give of the thing that was hit.
          {
            t: stay,
            x: -dir * cross * 1.18, y: lift * 1.18, z: 0.22 * H,
            rx: rise ? -36 : (drop ? 48 : 14),
            ry: -dir * (hook ? 22 : 6), rz: -dir * (hook ? 30 : 8),
            scale: zoom * 1.03, ease: 'inOut'
          },
          // Snatched back to the guard.
          {
            t: 0.72,
            x: -dir * cross * 0.3, y: lift * 0.25, z: 0.05 * H,
            rx: rise ? -10 : (drop ? 14 : 4), ry: -dir * 4, rz: -dir * 6,
            scale: 1 + (zoom - 1) * 0.22, ease: 'out'
          },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A sword cane. The weapon starts the beat as a stick and finishes it as a
    // stick; the only reason it hits at all happens in the middle, when the
    // blade leaves the shaft. The clip is written around that: a long settle
    // while nothing is showing, the kick of the release, the thrust down the
    // line, and a withdrawal that ends on the ferrule tapping the floor.
    // Depth is scale under the orthographic overlay camera, as with `thrust`.
    // tickCane drives the blade itself over the same duration, so the windows
    // in CANE_DRAW and the keyframe times below are one timeline.
    swordcane(m, o, H) {
      const power = o.power || 1;
      const zoom = 1 + (0.30 + m.reach * 0.34) * power;
      const drift = (0.04 + m.reach * 0.05) * H;
      // Held behind the reach, so a light cane is not aimed by the hand that
      // turned it point-forward instead of by the point going out.
      const pull = Math.min((0.09 + m.heft * 0.08) * H, drift * 0.5);
      return {
        duration: 620 + m.heft * 300 + m.reach * 150,
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'expoIn' },
          // Turned point-forward while the shaft is still shut.
          { t: 0.16, x: pull, y: -pull * 0.5, z: -50, rx: -14, ry: 18, rz: 12, scale: 0.88, ease: 'out' },
          // The blade clears the mouth and the cane kicks in the hand.
          { t: 0.30, x: pull * 0.66, y: -pull * 0.78, z: -30, rx: -22, ry: 10, rz: 5, scale: 0.93, ease: 'expoOut' },
          { t: 0.46, x: -drift, y: drift * 0.5, z: 230, rx: 12, ry: -6, rz: -3, scale: zoom, ease: 'snap' },
          { t: 0.54, x: -drift * 1.2, y: drift * 0.7, z: 250, rx: 14, ry: -4, rz: -2, scale: zoom * 1.03, ease: 'inOut' },
          { t: 0.80, x: -drift * 0.3, y: drift * 0.15, z: 70, rx: 5, ry: 0, rz: 0, scale: 1 + (zoom - 1) * 0.22, ease: 'out' },
          // Seated again, and set down.
          { t: 0.94, x: 0, y: pull * 0.18, z: 0, rx: -3, ry: 0, rz: 0, scale: 1.01, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Full revolutions. A light weapon gets round more times than a heavy one
    // in the same beat, so the turn count is cut by heft rather than fixed.
    spin(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const turns = Math.max(1, Math.min(3, Math.round((o.turns || 1) + (1 - m.heft) * 0.9)));
      const sweep = (0.20 + m.reach * 0.26) * H * (o.power || 1);
      const tilt = o.tilt || 0;
      const total = 360 * turns * dir;
      const punch = 1.14 + m.heft * 0.26 + (o.crit ? 0.09 : 0);
      return {
        duration: (420 + m.heft * 520 + turns * 140) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'expoIn' },
          { t: 0.18, x: dir * sweep * 0.5, y: -sweep * 0.35, z: -0.05 * H, rx: -12, ry: dir * 40, rz: dir * 40, scale: 0.92, ease: 'out' },
          { t: 0.44, x: -dir * sweep, y: sweep * 0.4 * (1 + tilt), z: 0.18 * H, rx: 12 + tilt * 24, ry: total * 0.45, rz: total * 0.45, scale: punch, ease: 'linear' },
          { t: 0.66, x: dir * sweep * 0.8, y: -sweep * 0.3, z: 0.1 * H, rx: -6, ry: total * 0.7, rz: total * 0.7, scale: punch * 0.96, ease: 'linear' },
          { t: 0.86, x: -dir * sweep * 0.4, y: sweep * 0.2, z: 0.04 * H, rx: 4, ry: total * 0.92, rz: total * 0.92, scale: 1.04, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: total, rz: total, scale: 1 }
        ]
      };
    },

    // Braced, not swung. Snap into the guard, absorb (a heavy weapon barely
    // moves, a light one is driven back), hold, recover.
    guard(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const set = (0.10 + m.reach * 0.10) * H;
      const shove = (0.10 - m.heft * 0.07) * H;
      const frames = [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'snap' },
        { t: 0.2, x: -dir * set, y: -set * 0.4, z: 0.1 * H, rx: -6, ry: -dir * 40, rz: -dir * (30 + m.reach * 20), scale: 1.08, ease: 'out' },
        { t: 0.34, x: -dir * set - shove, y: -set * 0.35, z: 0.06 * H, rx: -2, ry: -dir * 34, rz: -dir * (26 + m.reach * 18), scale: 1.05, ease: 'inOut' },
        { t: 0.62, x: -dir * set, y: -set * 0.4, z: 0.09 * H, rx: -5, ry: -dir * 38, rz: -dir * (29 + m.reach * 20), scale: 1.06, ease: 'out' }
      ];
      if (o.riposte) {
        // The counter that a parry buys: straight back down the line. Depth is
        // scale, not Z, under the orthographic overlay camera.
        const zoom = 1 + 0.3 + m.reach * 0.3;
        frames.push({ t: 0.76, x: 0, y: 0, z: 200, rx: 12, ry: 0, rz: 0, scale: zoom, ease: 'snap' });
        frames.push({ t: 0.88, x: 0, y: 0.01 * H, z: 80, rx: 6, ry: 0, rz: 0, scale: 1 + (zoom - 1) * 0.3, ease: 'out' });
      }
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return { duration: (o.riposte ? 620 : 420) + m.heft * 220, frames: frames };
    },

    // Muzzle rise and a shove back into the shoulder.
    //
    // Recoil is the one motion where the weapon's CLASS matters as much as its
    // weight: a snub revolver and a submachine gun of the same mass do not
    // behave alike. The class profile sets how hard it climbs, how far it is
    // driven back and how many times, and heft scales all of it. An automatic
    // therefore stutters through several small kicks where a shotgun makes one
    // enormous one.
    recoil(m, o, H) {
      const power = o.power || 1;
      const p = o.profile || { rise: 1, push: 1, shots: 1, rate: 0, dur: 1 };
      // A round that goes exactly where it was meant to is the same round: what
      // a critical shot gets is a harder kick, and nothing else. The length of
      // this clip is what the gun's own parts are cycled against, so it is left
      // alone.
      const bite = o.crit ? 1.3 : 1;
      const kick = (0.045 + m.heft * 0.105) * H * power * p.push * bite;
      const rise = (20 + m.heft * 28) * power * p.rise * bite;
      const shots = Math.max(1, p.shots);
      const dur = (230 + m.heft * 240 * power) * p.dur * (shots > 1 ? 1 + shots * 0.18 : 1);

      const frames = [{ t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'snap' }];
      // Recoil is the one motion built for guns alone, and a gun is aimed away
      // from the camera: its barrel is turned through a negative cosine, so it
      // is POSITIVE rx that throws the muzzle up. Every other motion is played
      // by weapons held across the view, where the sign is the other way round.
      // Each round in the burst gets its own kick, and the muzzle climbs a
      // little further with every one instead of returning to where it began.
      for (let i = 0; i < shots; i++) {
        const base = (i + 0.55) / shots;
        const climb = 1 + i * 0.35;
        const jitter = (i % 2 ? 1 : -1) * 0.004 * H;
        frames.push({
          t: Math.min(0.93, base - 0.4 / shots), x: jitter + 0.008 * H * power, y: kick * climb,
          z: -kick * 1.7, rx: rise * climb, ry: 2 * power, rz: 3 * power * (i % 2 ? -1 : 1),
          scale: 1 + 0.035 * p.flash, ease: 'out'
        });
        frames.push({
          t: Math.min(0.96, base), x: jitter * 0.4, y: kick * climb * 0.45,
          z: -kick * 0.7, rx: rise * climb * 0.5, ry: -1, rz: 1.5 * (i % 2 ? -1 : 1),
          scale: 1.01, ease: shots > 1 ? 'linear' : 'inOut'
        });
      }
      frames.push({ t: 0.98, x: 0, y: kick * 0.14, z: -kick * 0.2, rx: rise * 0.16, ry: 0, rz: 0.3, scale: 1, ease: 'out' });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return { duration: dur, frames: frames };
    },

    // Out of the frame, work, back up. Heft decides how long the work takes.
    reload(m, o, H) {
      const drop = (0.16 + m.heft * 0.10) * H;
      return {
        duration: 900 + m.heft * 700,
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: 0.22, x: -0.03 * H, y: -drop, z: -0.05 * H, rx: 18, ry: -14, rz: -26, scale: 0.94, ease: 'inOut' },
          { t: 0.48, x: -0.04 * H, y: -drop * 1.5, z: -0.07 * H, rx: 26, ry: -20, rz: -32, scale: 0.9, ease: 'inOut' },
          { t: 0.7, x: -0.02 * H, y: -drop * 0.7, z: -0.03 * H, rx: 12, ry: -8, rz: -16, scale: 0.97, ease: 'out' },
          { t: 0.88, x: 0.01 * H, y: 0.02 * H, z: 0.01 * H, rx: -6, ry: 4, rz: 5, scale: 1.02, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Bring it up, draw, hold, loose, and let the bow turn over in the hand.
    //
    // The string, the limbs and the arrow are NOT in here: tickBow drives them
    // off this clip's own duration (BOW_SHOT), and what is left for the hand is
    // small on purpose. An archer at full draw is the stillest thing in a
    // fight, so the shot reads on the string coming back and on the two frames
    // where the bow jumps, not on the whole weapon being flung across the view.
    //
    // The overlay camera is orthographic, so depth is spent in `scale` rather
    // than in z: pushing the bow out to arm's length grows it a little, and the
    // hand dropping back on the loose shrinks it.
    draw(m, o, H) {
      const w = this.BOW_SHOT;
      const reach = (0.012 + m.reach * 0.02) * H;
      const kick = (0.008 + m.heft * 0.016) * H;
      // A heavy bow fights the hand harder when it goes.
      const turn = 6 + m.heft * 14;
      return {
        // Fast: an archer under fire does not hold at full draw, and a shot
        // that outlasts the turn it belongs to reads as a stall.
        duration: 340 + m.heft * 220 + m.reach * 80,
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Up onto the line of sight, bow arm going out.
          { t: w.rise, x: -reach * 0.5, y: reach * 0.35, z: 0, rx: 1.5, ry: 1, rz: -2, scale: 1.015, ease: 'inOut' },
          // Full draw: braced, and holding still.
          { t: w.full, x: -reach, y: reach * 0.5, z: 0, rx: 2.5, ry: 2, rz: -3.5, scale: 1.03, ease: 'linear' },
          { t: (w.full + w.loose) / 2, x: -reach * 1.02, y: reach * 0.52, z: 0, rx: 2.6, ry: 2.1, rz: -3.6, scale: 1.03, ease: 'linear' },
          { t: w.loose, x: -reach, y: reach * 0.5, z: 0, rx: 2.5, ry: 2, rz: -3.5, scale: 1.03, ease: 'expoOut' },
          // Loosed: the hand is thrown back off the tension it was holding.
          { t: w.loose + 0.05, x: reach * 0.35 + kick, y: reach * 0.1 - kick, z: 0, rx: -4, ry: -3, rz: turn, scale: 0.965, ease: 'out' },
          // And the bow rolls forward in the loose grip before it is caught.
          { t: w.loose + 0.18, x: kick * 0.5, y: -kick * 0.7, z: 0, rx: -1.5, ry: -1, rz: turn * 1.5, scale: 0.99, ease: 'inOut' },
          { t: 0.86, x: 0, y: -kick * 0.2, z: 0, rx: 0, ry: 0, rz: turn * 0.5, scale: 1.005, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A crossbow is already spanned when it comes up: there is no draw, only a
    // brace, a trigger and the jolt of a prod letting go. tickBow throws the
    // string and the bolt forward on the same frame the jolt lands (BOLT_SHOT).
    crossbow(m, o, H) {
      const w = this.BOLT_SHOT;
      const jolt = (0.014 + m.heft * 0.03) * H;
      const rise = 5 + m.heft * 9;
      return {
        duration: 280 + m.heft * 170,
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'inOut' },
          // Into the shoulder and levelled.
          { t: 0.2, x: -jolt * 0.3, y: jolt * 0.25, z: 0, rx: 1.5, ry: 1, rz: -1.5, scale: 1.03, ease: 'linear' },
          { t: w.loose, x: -jolt * 0.32, y: jolt * 0.26, z: 0, rx: 1.6, ry: 1, rz: -1.5, scale: 1.03, ease: 'snap' },
          // The prod lets go: everything the limbs were holding comes back
          // through the stock at once.
          { t: w.loose + 0.04, x: jolt * 0.55, y: jolt * 0.5, z: 0, rx: rise, ry: -2, rz: 4, scale: 0.955, ease: 'out' },
          { t: w.loose + 0.12, x: jolt * 0.2, y: jolt * 0.16, z: 0, rx: rise * 0.4, ry: -1, rz: 1.5, scale: 0.99, ease: 'inOut' },
          // Held on the target a moment before it comes down.
          { t: 0.78, x: 0, y: jolt * 0.05, z: 0, rx: rise * 0.12, ry: 0, rz: 0.4, scale: 1.005, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A whip has almost no mass at the far end: the hand cannot push the thing
    // anywhere, it can only send a wave down it and then get out of the way.
    // That is what a crack is, and it takes four separate moments to read as
    // one. The coil is gathered back over the shoulder; the arm is thrown
    // forward while the tail is still behind it, which is where the whip is at
    // its longest and the tip is still doing nothing; the hand STOPS dead,
    // which is the moment that hands the arm's speed to the tip; and only then
    // does the far end come round. Recovery takes two beats, because a rope
    // that has been snapped does not stop where the hand did.
    //
    // The rope simulation supplies the shape of the line. What is written here
    // is only the hand driving it, which is why the numbers are small next to
    // a sword's. Heft is the difference between a plaited leather whip and two
    // kilos of steel cable: the heavy one lays out wider and takes longer to
    // come back, and cracks later in the clip because it takes that long for
    // the wave to reach the end of it.
    lash(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.18 : 1);
      const crack = (0.14 + m.reach * 0.12) * H * (1 + m.heft * 0.18) * power;
      const gather = 0.18 + m.heft * 0.06;
      const stop = 0.44 + m.heft * 0.05;
      const hit = stop + 0.07;
      return {
        duration: (380 + m.heft * 260) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Coiled back over the shoulder, and left there a moment.
          { t: gather, x: dir * crack * 0.75, y: -crack * (0.95 - tilt * 0.35), z: -50, rx: -30, ry: dir * 12, rz: dir * 26, scale: 0.92, ease: 'linear' },
          { t: gather + 0.08, x: dir * crack * 0.8, y: -crack * (1.0 - tilt * 0.35), z: -56, rx: -33, ry: dir * 13, rz: dir * 28, scale: 0.91, ease: 'in' },
          // Thrown forward with the tail still behind: nothing has happened at
          // the far end yet.
          { t: stop - 0.08, x: -dir * crack * 0.7, y: crack * 0.1 * (1 + tilt), z: 120, rx: 10, ry: -dir * 8, rz: -dir * 18, scale: 1.06, ease: 'expoOut' },
          // The hand stops. This is the frame the whip is actually driven by.
          { t: stop, x: -dir * crack * 1.15, y: crack * 0.3 * (1 + tilt), z: 180, rx: 18, ry: -dir * 12, rz: -dir * 28, scale: 1.14, ease: 'snap' },
          // And the end of it comes round.
          { t: hit, x: -dir * crack * 1.9, y: crack * (0.5 + tilt * 0.6), z: 210, rx: 24, ry: -dir * 16, rz: -dir * 38, scale: 1.32 + (o.crit ? 0.08 : 0), ease: 'out' },
          { t: hit + 0.14, x: -dir * crack * 0.85, y: crack * 0.24 * (1 + tilt), z: 80, rx: 9, ry: -dir * 6, rz: -dir * 15, scale: 1.08, ease: 'inOut' },
          // The tail coming back through, past where the hand is.
          { t: 0.82, x: dir * crack * 0.28, y: -crack * 0.12, z: 20, rx: -5, ry: dir * 4, rz: dir * 8, scale: 0.98, ease: 'out' },
          { t: 0.93, x: -dir * crack * 0.08, y: crack * 0.04, z: 0, rx: 2, ry: 0, rz: -dir * 3, scale: 1.01, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A head on a chain, which is a different weapon from a mace with a chain
    // drawn on it. The mass is not in the hand and never was: it lags behind
    // everything the arm does, so the hand cannot drive the blow, only start it
    // and then be dragged after it.
    //
    // The wind-up is therefore a small circle traced by the fist while the head
    // goes round overhead on its own, gathering speed the arm does not have to
    // supply. The head is then slung out, and the hand ARRIVES LATE and further
    // through than it meant to, because it is being towed. Once the head has
    // stopped there is still a chain full of momentum attached to it, so the
    // hand is yanked back the other way and wobbles a second time before it
    // settles: no clean recovery, which is the whole reason a flail is
    // dangerous to the person holding it. A heavier head lags longer and
    // rebounds harder, which is the difference between a wooden flail and six
    // kilos of bike chain.
    //
    // `from` is the motion asked for before the flail took it over: a swing
    // orbits level, an overhead comes over the top, a rising blow is slung
    // underhand. The orbit belongs to the HEAD, not to the hand: the haft is
    // held, not spun, so rz never accumulates a turn here the way `spin` does.
    // The fist only rolls a little as it leads the circle, and the chain
    // physics carries the head round it.
    flail(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const from = o.from;
      const over = from === 'overhead';
      const under = from === 'rising';
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const orbits = Math.max(1, Math.min(3, Math.round(o.orbits || 1)));
      // How far behind the hand the head runs, and how hard it comes back.
      const lag = 0.30 + m.heft * 0.55;
      const circle = (0.09 + m.heft * 0.05) * H;
      const travel = (0.42 + m.reach * 0.40) * H * power;
      const lift = (0.09 + m.reach * 0.13) * H;
      // The wrist rolls with the circle instead of turning over with it, so
      // this is a small angle that comes back to nothing, not a multiple of 360.
      const roll = (10 + m.heft * 8) * dir;
      const punch = 1.16 + m.heft * 0.26 * power;
      const kick = travel * (0.26 + lag * 0.20);
      // Height of the orbit, which is what the shape of the blow comes down to.
      const high = over ? 1.5 : (under ? -0.7 : 1);
      const hit = 0.50 + m.heft * 0.04 + (o.crit ? 0.06 : 0);
      return {
        duration: (520 + m.heft * 500 + m.reach * 180) * (o.crit ? 1.16 : 1) *
          (1 + (orbits - 1) * 0.15),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'in' },
          // Round it goes, the fist tracing its little circle underneath.
          {
            t: hit * 0.28, x: dir * circle, y: -circle * 0.55 * high, z: -0.05 * H,
            rx: -10, ry: dir * 30, rz: roll * 0.5, scale: 0.95, ease: 'linear'
          },
          {
            t: hit * 0.52, x: -dir * circle * 0.7, y: -circle * 1.1 * high, z: -0.07 * H,
            rx: -16 - m.heft * 10, ry: dir * 58, rz: -roll * 0.6, scale: 0.90, ease: 'linear'
          },
          {
            t: hit * 0.76, x: -dir * circle * 0.2, y: -circle * 0.2 * high, z: -0.02 * H,
            rx: -6, ry: dir * 30, rz: roll * 0.3, scale: 0.93, ease: 'in'
          },
          // Slung. The head is out there and the hand is not with it yet.
          {
            t: hit, x: -dir * travel, y: lift * (over ? 1.5 : (under ? -1.3 : 0.5)), z: 0.18 * H,
            rx: 14 + (over ? 20 : 0), ry: -dir * 20, rz: roll, scale: punch, ease: 'out'
          },
          // Dragged through after it, which is where the chain actually pulls
          // the arm out of shape.
          {
            t: hit + 0.09, x: -dir * travel * (1.18 + lag * 0.12), y: lift * (over ? 1.7 : (under ? -1.5 : 0.6)), z: 0.12 * H,
            rx: 8, ry: -dir * 14, rz: roll * 1.2, scale: punch * 0.93, ease: 'inOut'
          },
          // And yanked back the other way by what is left in the chain.
          {
            t: hit + 0.24, x: dir * kick, y: -lift * 0.4 * high, z: 0.02 * H,
            rx: -8 - lag * 6, ry: dir * 10, rz: -roll * 0.7, scale: 1.04, ease: 'out'
          },
          // A second, smaller swing of it before the thing hangs still.
          {
            t: hit + 0.36, x: -dir * kick * 0.38, y: lift * 0.16 * high, z: 0,
            rx: 4, ry: -dir * 4, rz: roll * 0.25, scale: 0.99, ease: 'inOut'
          },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Two sticks and a short chain, swung by somebody who wants to be watched
    // doing it. Nothing about a nunchaku is heavy and nothing about it reaches:
    // the whole weapon is speed, so reach and heft barely enter into it and the
    // clip is the shortest in the set.
    //
    // A figure of eight is two loops in opposite senses, not one circle gone
    // round twice, so the roll reverses at every crossing and comes back to
    // where it started on its own. Then the stick is tucked under the arm,
    // which is the only still moment in it, and from that stillness comes the
    // snap: a short, tight travel with a hard scale punch on it, because what
    // makes the blow is the tip changing direction, not the hand going
    // anywhere. Then it is caught, which a flail can never do.
    nunchaku(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const passes = Math.max(1, Math.min(3, Math.round(o.passes || 2)));
      const swing = (0.09 + m.reach * 0.04) * H;
      const travel = (0.26 + m.reach * 0.10) * H * power;
      const lift = (0.05 + m.reach * 0.05) * H;
      const punch = 1.34 + (o.crit ? 0.12 : 0);
      const tuck = 0.30 + passes * 0.08;
      const span = tuck / passes;
      const frames = [{ t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' }];
      for (let i = 0; i < passes; i++) {
        const s = (i % 2) ? -dir : dir;
        // Out through the crossing, roll leading.
        frames.push({
          t: i * span + span * 0.35, x: s * swing, y: -swing * 0.5, z: -20,
          rx: -6, ry: s * 26, rz: s * 165, scale: 0.97, ease: 'inOut'
        });
        // And back through it the other way, which is what makes it an eight.
        frames.push({
          t: i * span + span * 0.85, x: -s * swing * 0.7, y: swing * 0.3, z: 10,
          rx: 4, ry: -s * 20, rz: -s * 150, scale: 0.99, ease: 'inOut'
        });
      }
      // Tucked under the arm: the one still frame in the whole thing.
      frames.push({
        t: tuck + 0.06, x: -dir * swing * 0.4, y: swing * 0.7, z: -30,
        rx: 10, ry: dir * 8, rz: dir * 40, scale: 0.86, ease: 'in'
      });
      // The snap.
      frames.push({
        t: tuck + 0.19, x: -dir * travel, y: -lift, z: 0.2 * H,
        rx: 12, ry: -dir * 18, rz: -dir * 120, scale: punch, ease: 'out'
      });
      frames.push({
        t: tuck + 0.26, x: -dir * travel * 1.18, y: -lift * 1.2, z: 0.14 * H,
        rx: 14, ry: -dir * 14, rz: -dir * 138, scale: punch * 0.92, ease: 'inOut'
      });
      // Caught back under the arm.
      frames.push({
        t: tuck + 0.4, x: dir * travel * 0.16, y: swing * 0.3, z: 0,
        rx: -4, ry: dir * 6, rz: dir * 26, scale: 1.02, ease: 'out'
      });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return {
        duration: (250 + m.heft * 90 + passes * 40) * (o.crit ? 1.06 : 1),
        frames: frames
      };
    },

    // A scythe, a sickle, a hooked polearm: anything whose edge faces the
    // wielder rather than the world. None of them can be swung at something,
    // because the edge is on the wrong side of the shaft for that. What they do
    // is go out PAST the target, low and long, and then get hauled back through
    // it, and the blow lands on the way home. That is the whole difference, and
    // it is why the impact frame here is late in the clip and travelling the
    // opposite way to the frame before it.
    //
    // The extension is deliberately kept well under the return, since the blow
    // is aimed by whichever frame reaches furthest and the reach out is not the
    // blow. A long haft opens the whole movement wider without changing where
    // the contact happens.
    reap(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const travel = (0.44 + m.reach * 0.40) * H * power;
      const out = Math.min((0.22 + m.reach * 0.24) * H, travel * 0.55);
      const lift = (0.06 + m.reach * 0.10) * H;
      const turn = 80 + m.reach * 70 + m.heft * 30;
      const punch = 1.15 + m.heft * 0.26 * power;
      const set = 0.30 + (o.crit ? 0.04 : 0);
      const hit = 0.58 + m.heft * 0.03 + (o.crit ? 0.05 : 0);
      return {
        duration: (420 + m.heft * 380 + m.reach * 260) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // A short cock of the wrist to bring the edge round.
          { t: 0.13, x: -dir * out * 0.2, y: -lift * 0.8, z: -30, rx: -12, ry: -dir * 14, rz: -dir * 18, scale: 0.95, ease: 'inOut' },
          // Laid out low and away, which is the furthest the weapon gets from
          // the person holding it and the smallest it ever looks.
          { t: set, x: dir * out, y: lift * 1.4, z: -0.08 * H, rx: 26, ry: dir * 34, rz: dir * (30 + m.reach * 20), scale: 0.82, ease: 'linear' },
          // Set, and hooked behind whatever it is about to be pulled through.
          { t: set + 0.1, x: dir * out * 1.04, y: lift * 1.5, z: -0.07 * H, rx: 28, ry: dir * 36, rz: dir * (32 + m.reach * 22), scale: 0.83, ease: 'in' },
          // Hauled back through it. The pull is toward the wielder, so the
          // weapon grows as it comes.
          { t: hit, x: -dir * travel, y: -lift * 0.3, z: 0.18 * H, rx: -6, ry: -dir * 26, rz: -dir * turn, scale: punch, ease: 'out' },
          { t: hit + 0.09, x: -dir * travel * (o.crit ? 1.26 : 1.18), y: -lift * 0.5, z: 0.1 * H, rx: -10, ry: -dir * 20, rz: -dir * turn * 1.12, scale: punch * 0.93, ease: 'inOut' },
          { t: 0.9, x: -dir * travel * 0.3, y: -lift * 0.1, z: 0.02 * H, rx: -3, ry: -dir * 6, rz: -dir * turn * 0.28, scale: 1.02, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A halberd, a glaive, a trident: two metres of shaft with the weight at
    // the far end of it. Nobody fences with one of those, they level it and
    // take the legs out from under somebody, and the reason it works is that
    // the head is moving several times faster than the hands are.
    //
    // So the shaft stays level, the travel is the widest in the set, the lift
    // is almost nothing, and the butt goes the other way first: that is the
    // gather, and it is the only anticipation a weapon this long gets, because
    // there is no time for another. Once it is round it stays round. A polearm
    // that has been swept does not stop, it is walked to a halt over two beats,
    // which is why the recovery here is longer than the strike.
    sweep(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const travel = (0.50 + m.reach * 0.52) * H * power;
      const wind = Math.min((0.14 + m.heft * 0.10) * H, travel * 0.32);
      // How far below the guard the shaft rides. Negative tilt takes it lower.
      const low = (0.05 + m.reach * 0.07) * H * (1 - tilt * 0.8);
      const turn = 70 + m.reach * 80 + m.heft * 30;
      const punch = 1.10 + m.heft * 0.22 * power;
      const windEnd = 0.22 + m.heft * 0.12 + (o.crit ? 0.05 : 0);
      const hold = 0.02 + m.heft * 0.05;
      const hit = windEnd + 0.21;
      return {
        duration: (420 + m.heft * 470 + m.reach * 230) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Butt forward, head back: the shaft turning about the middle of it.
          { t: windEnd - hold, x: dir * wind, y: low * 0.5, z: -0.05 * H, rx: 6, ry: -dir * 30, rz: dir * (16 + m.reach * 12), scale: 0.94, ease: 'linear' },
          { t: windEnd, x: dir * wind * 1.05, y: low * 0.55, z: -0.06 * H, rx: 7, ry: -dir * 32, rz: dir * (18 + m.reach * 13), scale: 0.93, ease: 'in' },
          // Through, level, and at ankle height.
          { t: hit, x: -dir * travel, y: low, z: 0.14 * H, rx: 4 - tilt * 12, ry: dir * 24, rz: -dir * turn, scale: punch, ease: 'out' },
          { t: hit + 0.08, x: -dir * travel * (o.crit ? 1.26 : 1.18), y: low * 1.1, z: 0.1 * H, rx: 3 - tilt * 12, ry: dir * 18, rz: -dir * turn * 1.14, scale: punch * 0.95, ease: 'linear' },
          // Walked to a halt. Something this long does not stop where it hit.
          { t: 0.84, x: -dir * travel * 0.62, y: low * 0.7, z: 0.05 * H, rx: 2, ry: dir * 8, rz: -dir * turn * 0.6, scale: 1.03, ease: 'out' },
          { t: 0.94, x: -dir * travel * 0.18, y: low * 0.2, z: 0, rx: 1, ry: dir * 2, rz: -dir * turn * 0.16, scale: 1.01, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // What somebody with a knife actually does, which is not one stab. Three
    // of them, or however many `hits` asks for, thrown from the elbow into
    // roughly the same place before the person being stabbed can do anything
    // about the first one. Each is smaller and faster than a full thrust, the
    // line alternates a little in side and in height so they are not one
    // movement repeated, and the last one is the biggest, both because that is
    // how it goes and because the blow is aimed by whichever frame reaches
    // furthest and the last stab is the one that ought to land on them.
    //
    // Depth is scale under the orthographic overlay camera, as with `thrust`.
    flurry(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.1 : 1);
      const hits = Math.max(2, Math.min(5, Math.round(o.hits || 3) + (o.crit ? 1 : 0)));
      const drift = (0.07 + m.reach * 0.06) * H;
      const pull = drift * 0.5;
      const zoom = 1 + (0.22 + m.reach * 0.24) * power;
      const span = 0.86 / hits;
      const frames = [{ t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'in' }];
      for (let i = 0; i < hits; i++) {
        const s = (i % 2) ? -dir : dir;
        const high = (i % 2) ? -1 : 1;
        const last = (i === hits - 1);
        // Each one commits a little further than the one before it.
        const grow = 0.8 + 0.2 * (i + 1) / hits;
        const out = drift * grow * (last ? 1.7 : 1);
        frames.push({
          t: i * span + span * 0.34, x: s * pull, y: -pull * 0.35 * high, z: -40,
          rx: -8, ry: s * 14, rz: s * 9, scale: 0.9, ease: 'in'
        });
        frames.push({
          t: i * span + span * 0.78, x: -s * out, y: out * 0.4 * high, z: 200,
          rx: 10 * high, ry: -s * 6, rz: -s * 4,
          scale: 1 + (zoom - 1) * grow * (last ? 1.12 : 1), ease: last ? 'out' : 'in'
        });
      }
      // And out of there.
      frames.push({ t: 0.92, x: 0, y: 0, z: 60, rx: 4, ry: 0, rz: 0, scale: 1 + (zoom - 1) * 0.2, ease: 'out' });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return {
        duration: (210 + hits * 70 + m.heft * 150 + m.reach * 60) * (o.crit ? 1.02 : 1),
        frames: frames
      };
    },

    // Raise, gather, punch the working end forward. Reach matters (a long
    // staff sweeps), heft barely does.
    //
    // `tilt` decides where the gather happens: above the head, out to the side
    // or down low before it comes up, which is the only thing that keeps a
    // caster who has stood in the same place all fight from looking like a
    // loop. The pause at the top is the point of the whole motion, so it is
    // held under `linear` rather than eased through.
    cast(m, o, H) {
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const lift = (0.14 + m.reach * 0.16) * H * power;
      const zoom = 1 + (0.28 + m.reach * 0.26) * power;
      return {
        duration: (480 + m.heft * 260 + m.reach * 160) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: 0.26, x: -lift * (0.6 + tilt * 0.5), y: -lift * (1 - tilt * 0.4), z: -50, rx: -16 + tilt * 20, ry: -22, rz: -18 - tilt * 14, scale: 0.9, ease: 'linear' },
          // Gathered, and nothing moving for a beat.
          { t: 0.36, x: -lift * (0.63 + tilt * 0.5), y: -lift * (1.05 - tilt * 0.4), z: -54, rx: -18 + tilt * 21, ry: -24, rz: -19 - tilt * 15, scale: 0.89, ease: 'in' },
          // Driven forward past where it gathered, so the blow is aimed by the
          // working end going out and not by the wrist coming back.
          { t: 0.52, x: lift * 1.1, y: lift * 0.85, z: 200, rx: 20, ry: 14, rz: 12, scale: zoom, ease: 'out' },
          { t: 0.62, x: lift * 1.25, y: lift * 0.95, z: 210, rx: 22, ry: 16, rz: 14, scale: zoom * 1.04, ease: 'inOut' },
          { t: 0.84, x: lift * 0.4, y: lift * 0.3, z: 70, rx: 8, ry: 6, rz: 5, scale: 1 + (zoom - 1) * 0.25, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Thrown: it leaves the hand, so it shrinks away into the distance rather
    // than coming back. The gather is held for a beat, since the whole of a
    // throw happens in the shoulder before anything leaves.
    //
    // `tilt` is the line the arm takes: +1 comes straight over the top and
    // drops onto the target, 0 is thrown off the shoulder, -1 is sidearm and
    // flat. It is the only thing separating the three darts in the projectile
    // slot that are simply thrown, so it does real work rather than decorating
    // the clip: a high throw gathers most of a shoulder's height behind it and
    // pitches the weapon nose-down, a flat one barely gathers and rolls instead.
    hurl(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const tilt = o.tilt || 0;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const wind = (0.12 + m.heft * 0.12) * H * power;
      // How much of the throw is spent going up rather than across.
      const line = 1 + tilt * 0.55;
      const gather = 1.2 + tilt * 0.8;
      const pitch = 24 + tilt * 22;
      const roll = 24 - tilt * 16;
      return {
        duration: (340 + m.heft * 200) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: 0.18, x: dir * wind * 1.4, y: -wind * gather, z: -wind * 1.2, rx: -pitch, ry: dir * 20, rz: dir * roll, scale: 0.95, ease: 'linear' },
          { t: 0.26, x: dir * wind * 1.5, y: -wind * gather * 1.06, z: -wind * 1.3, rx: -pitch * 1.1, ry: dir * 22, rz: dir * roll * 1.08, scale: 0.94, ease: 'in' },
          { t: 0.46, x: -dir * wind * 2.2, y: wind * line, z: 0.5 * H, rx: 16, ry: -dir * 26, rz: -dir * 40, scale: 0.6, ease: 'linear' },
          { t: 0.68, x: -dir * wind * 3.0, y: wind * 0.6 * line, z: 1.1 * H, rx: 8, ry: -dir * 34, rz: -dir * 56, scale: 0.22, ease: 'linear' },
          { t: 0.8, x: -dir * wind * 3.2, y: wind * 0.4 * line, z: 1.4 * H, rx: 4, ry: -dir * 38, rz: -dir * 62, scale: 0.05, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A slingshot. Nothing about this is a throw: the hand hardly goes
    // anywhere, and everything that happens is done by two feet of rubber.
    //
    // So the clip is written around the elastic rather than around the arm. The
    // pouch is taken back under `out`, which is what a band fighting harder the
    // further it is drawn feels like: the first half of the draw is easy and
    // the last of it barely moves. Then the longest still frame of any hand-held
    // weapon in the set, because a loaded slingshot is held on the mark while
    // the shooter decides. The release is the only travel in the whole thing:
    // the FORK jumps forward off the tension it was holding, and the pouch that
    // was the furthest thing back is simply gone.
    sling(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      // Drawn against the chest, so this is small however heavy the frame is.
      const pull = (0.030 + m.heft * 0.022) * H * (o.crit ? 1.25 : 1);
      const jump = (0.090 + m.reach * 0.050) * H * power;
      const draw = 0.18;
      const set = 0.34 + (o.crit ? 0.06 : 0);
      const aim = set + (o.crit ? 0.20 : 0.13);
      const go = aim + 0.07;
      return {
        duration: (520 + m.heft * 200 + m.reach * 80) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Half drawn, and already slowing.
          { t: draw, x: dir * pull * 0.6, y: -pull * 0.4, z: -0.03 * H, rx: -5, ry: dir * 4, rz: dir * 6, scale: 0.98, ease: 'out' },
          // Full stretch: the band has nothing left to give.
          { t: set, x: dir * pull, y: -pull * 0.62, z: -0.05 * H, rx: -8, ry: dir * 6, rz: dir * 9, scale: 0.965, ease: 'linear' },
          // Held on the mark. Nothing moves here at all.
          { t: aim, x: dir * pull * 1.02, y: -pull * 0.64, z: -0.05 * H, rx: -8.4, ry: dir * 6, rz: dir * 9.4, scale: 0.963, ease: 'snap' },
          // Loosed. The fork is thrown forward and the pouch is empty.
          { t: go, x: -dir * jump, y: jump * 0.22, z: 0.12 * H, rx: 6, ry: -dir * 5, rz: -dir * 8, scale: 1.055, ease: 'out' },
          { t: go + 0.08, x: -dir * jump * 0.55, y: jump * 0.1, z: 0.06 * H, rx: 3, ry: -dir * 2, rz: -dir * 4, scale: 1.01, ease: 'inOut' },
          { t: 0.9, x: dir * jump * 0.06, y: -jump * 0.03, z: 0, rx: -1, ry: 0, rz: dir * 2, scale: 0.995, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A whirled sling, which is the other half of the slot's confusion: the
    // weapon named Sling is not a slingshot at all but a cord with a cradle in
    // it, and it works the way a flail's head works. The stone is sent round and
    // round overhead until it is going faster than any arm could throw it, and
    // then one end of the cord is simply let go.
    //
    // The turn is therefore ACCUMULATED in rz across the orbits rather than
    // swung back and forth, as `spin` and `flail` do, so the last keyframe
    // carries a whole number of turns instead of unwinding them. What leaves is
    // flat and fast: almost no rise on the release, because a slung stone goes
    // out level and the height comes from the cord, not from the shoulder.
    whirl(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const orbits = Math.max(1, Math.min(3, Math.round(o.orbits || 2)));
      const spin = 360 * orbits * dir;
      // The little circle the fist traces while the stone does the work.
      const circle = (0.045 + m.heft * 0.030) * H;
      const travel = (0.34 + m.reach * 0.30) * H * power;
      const hit = 0.58 + (o.crit ? 0.06 : 0);
      const span = hit / orbits;
      const frames = [{ t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'in' }];
      for (let i = 0; i < orbits; i++) {
        // Over the top of the circle, the cord at full stretch.
        frames.push({
          t: i * span + span * 0.34, x: dir * circle, y: circle * 0.85, z: -0.04 * H,
          rx: -8, ry: dir * 20, rz: spin * (i + 0.34) / orbits, scale: 0.96, ease: 'linear'
        });
        // And round under it, which is where the speed is put in.
        frames.push({
          t: i * span + span * 0.72, x: -dir * circle * 0.8, y: -circle * 0.5, z: -0.02 * H,
          rx: 6, ry: -dir * 14, rz: spin * (i + 0.72) / orbits, scale: 0.99, ease: 'linear'
        });
      }
      // Let go. Flat, and gone before the arm has finished the turn.
      frames.push({
        t: hit, x: -dir * travel, y: travel * 0.06, z: 0.2 * H,
        rx: 6, ry: -dir * 20, rz: spin * 0.97, scale: 1.10, ease: 'out'
      });
      frames.push({
        t: hit + 0.09, x: -dir * travel * 1.14, y: travel * 0.02, z: 0.12 * H,
        rx: 3, ry: -dir * 14, rz: spin * 1.05, scale: 1.0, ease: 'inOut'
      });
      // The empty cord coming round the last time with nothing in it.
      frames.push({
        t: 0.86, x: -dir * travel * 0.3, y: 0, z: 0.02 * H,
        rx: 0, ry: -dir * 4, rz: spin * 1.01, scale: 0.99, ease: 'out'
      });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: spin, scale: 1 });
      return {
        duration: (560 + m.heft * 260 + orbits * 130) * (o.crit ? 1.1 : 1),
        frames: frames
      };
    },

    // A blowpipe. This is the stillest motion in the set, and it is meant to
    // be: an archer at full draw was the previous quietest thing in a fight and
    // a blowpipe is quieter, because there is no tension in it to fight and
    // nothing to hold up but the tube.
    //
    // Everything is therefore spoken in scale and in a few pixels. It comes up
    // to the mouth, it STOPS, and it stays stopped for a third of the clip
    // under `linear` so the pose does not creep. The shot is a puff: a scale
    // pulse with barely any travel behind it, because a dart leaving a tube
    // moves nothing except the shooter's cheeks, and then a tiny settle.
    blowgun(m, o, H) {
      const power = (o.power || 1) * (o.crit ? 1.1 : 1);
      const lift = (0.008 + m.reach * 0.006) * H;
      const nudge = (0.024 + m.reach * 0.010) * H * power;
      const hold = 0.54 + (o.crit ? 0.08 : 0);
      const puff = hold + 0.08;
      return {
        duration: 640 + m.heft * 220 + (o.crit ? 120 : 0),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'inOut' },
          // Up to the mouth.
          { t: 0.22, x: -lift * 0.5, y: lift * 0.6, z: 0, rx: 1.2, ry: 1, rz: -2, scale: 1.02, ease: 'out' },
          // On the line, and holding.
          { t: 0.38, x: -lift, y: lift, z: 0, rx: 2, ry: 1.6, rz: -3, scale: 1.03, ease: 'linear' },
          { t: hold, x: -lift * 1.01, y: lift * 1.01, z: 0, rx: 2.02, ry: 1.62, rz: -3.02, scale: 1.03, ease: 'linear' },
          // The puff. Almost nothing moves and the whole shot is in the scale.
          { t: puff, x: -nudge, y: lift * 1.1, z: 0.06 * H, rx: 2.6, ry: 1.4, rz: -3.2, scale: 1.075, ease: 'out' },
          { t: puff + 0.08, x: -nudge * 0.5, y: lift, z: 0.02 * H, rx: 2, ry: 1.2, rz: -2.6, scale: 1.02, ease: 'inOut' },
          { t: 0.9, x: -lift * 0.3, y: lift * 0.3, z: 0, rx: 0.6, ry: 0.4, rz: -0.8, scale: 1.005, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A grenade. High, slow, and it LEAVES: the model shrinks away up the arc
    // the way `hurl` does, and the hand carries on through empty, which is the
    // whole difference between throwing something away and hitting with it.
    //
    // `tilt` picks the shoulder: positive comes back over it, negative is the
    // underarm lob that anybody actually uses for something with a fuse in it.
    // The arc is the point, so the release is nowhere near the fastest part of
    // the clip: the thing coasts up, slows near the top and is still climbing
    // when it goes out of sight.
    lob(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const tilt = o.tilt === undefined ? 0.5 : o.tilt;
      const under = tilt < 0;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const wind = (0.10 + m.heft * 0.10) * H;
      const out = (0.30 + m.reach * 0.16) * H * power;
      const high = (0.34 + m.reach * 0.14) * H * power;
      return {
        duration: (520 + m.heft * 220) * (o.crit ? 1.08 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Gathered: down behind the hip, or back over the shoulder.
          {
            t: 0.20, x: dir * wind * (under ? 0.9 : 1.2), y: under ? wind * 0.5 : -wind * 1.6,
            z: -wind, rx: under ? 16 : -30, ry: dir * 16, rz: dir * (under ? -14 : 22),
            scale: 0.96, ease: 'linear'
          },
          { t: 0.30, x: dir * wind * (under ? 0.95 : 1.28), y: under ? wind * 0.55 : -wind * 1.7, z: -wind * 1.06, rx: under ? 17 : -32, ry: dir * 17, rz: dir * (under ? -15 : 24), scale: 0.955, ease: 'in' },
          // Out of the hand and climbing.
          { t: 0.52, x: -dir * out, y: high, z: 0.5 * H, rx: 10, ry: -dir * 22, rz: -dir * 30, scale: 0.58, ease: 'linear' },
          { t: 0.70, x: -dir * out * 1.35, y: high * 1.35, z: 1.0 * H, rx: 6, ry: -dir * 28, rz: -dir * 44, scale: 0.20, ease: 'linear' },
          // Over the top of the arc, and too far away to see.
          { t: 0.82, x: -dir * out * 1.5, y: high * 1.2, z: 1.3 * H, rx: 3, ry: -dir * 32, rz: -dir * 52, scale: 0.05, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A chakram or a throwing disc: sidearm, flat, and spinning in its own
    // plane the whole way out. The spin is what makes it a disc rather than a
    // rock, so it is accumulated in rz across the flight (the last keyframe
    // therefore carries a whole number of turns, as `spin` does) and it does
    // not stop when the disc leaves: it goes on turning as it shrinks.
    //
    // Nothing comes back. The throw is flat and short-armed, thrown across the
    // body rather than over the shoulder, which is why the gather here is a
    // sideways wind and not a lift.
    discus(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const spins = 3 + (o.crit ? 1 : 0);
      const total = 360 * spins * dir;
      const gather = (0.10 + m.heft * 0.06) * H;
      const travel = (0.26 + m.reach * 0.14) * H * power;
      return {
        duration: (380 + m.heft * 180) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Wound flat across the body, edge leading.
          { t: 0.20, x: dir * gather, y: -gather * 0.25, z: -0.05 * H, rx: 8, ry: dir * 10, rz: total * 0.06, scale: 0.95, ease: 'linear' },
          { t: 0.30, x: dir * gather * 1.05, y: -gather * 0.28, z: -0.06 * H, rx: 9, ry: dir * 11, rz: total * 0.1, scale: 0.945, ease: 'in' },
          // Away, turning in its own plane.
          { t: 0.50, x: -dir * travel, y: travel * 0.10, z: 0.4 * H, rx: 4, ry: -dir * 8, rz: total * 0.45, scale: 0.55, ease: 'linear' },
          { t: 0.70, x: -dir * travel * 1.5, y: travel * 0.16, z: 0.9 * H, rx: 2, ry: -dir * 5, rz: total * 0.75, scale: 0.20, ease: 'linear' },
          { t: 0.84, x: -dir * travel * 1.7, y: travel * 0.18, z: 1.2 * H, rx: 1, ry: -dir * 3, rz: total * 0.92, scale: 0.04, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: total, scale: 1 }
        ]
      };
    },

    // The only motion in the set with a second half.
    //
    // A boomerang is thrown sidearm and then there is nothing at all: the hand
    // is empty, the frame is empty, and the clip has to hold that emptiness
    // long enough for the player to notice it, which is the one thing that
    // makes the return read as a return rather than as a stutter. It comes back
    // in from the other side of the frame, growing out of nothing, and the
    // CATCH is the beat the whole motion is built around, so it lands with a
    // small absorb: the hand gives with it instead of stopping it dead.
    //
    // The turn accumulates across both halves and is a whole number of turns at
    // the end, so the thing is still spinning when it arrives.
    boomerang(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const spins = 5 + (o.crit ? 2 : 0);
      const total = 360 * spins * dir;
      const gather = (0.09 + m.heft * 0.06) * H;
      const travel = (0.34 + m.reach * 0.16) * H * power;
      return {
        duration: (760 + m.heft * 260) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // A short wind across the body: there is no room for more.
          { t: 0.14, x: dir * gather, y: -gather * 0.4, z: -0.04 * H, rx: 6, ry: dir * 12, rz: total * 0.03, scale: 0.95, ease: 'in' },
          // Thrown, out to the left of everything.
          { t: 0.38, x: -dir * travel, y: travel * 0.12, z: 0.35 * H, rx: 4, ry: -dir * 10, rz: total * 0.25, scale: 0.55, ease: 'linear' },
          { t: 0.48, x: -dir * travel * 0.8, y: travel * 0.2, z: 0.9 * H, rx: 2, ry: -dir * 6, rz: total * 0.42, scale: 0.03, ease: 'linear' },
          // Gone. Nothing in the hand and nothing on the screen.
          { t: 0.62, x: -dir * travel * 0.35, y: travel * 0.5, z: 0.9 * H, rx: 0, ry: 0, rz: total * 0.55, scale: 0.02, ease: 'in' },
          // Coming back in from the other side, out of nothing.
          { t: 0.72, x: dir * travel * 0.75, y: travel * 0.45, z: 0.7 * H, rx: -4, ry: dir * 8, rz: total * 0.72, scale: 0.10, ease: 'in' },
          { t: 0.86, x: dir * travel * 0.30, y: travel * 0.16, z: 0.25 * H, rx: -6, ry: dir * 6, rz: total * 0.9, scale: 0.75, ease: 'out' },
          // Caught, and the hand gives with it.
          { t: 0.93, x: -dir * travel * 0.06, y: -travel * 0.05, z: 0, rx: 5, ry: -dir * 2, rz: total * 1.01, scale: 1.06, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: total, scale: 1 }
        ]
      };
    },

    // A bola or a rope dart: thrown, but on a line, so it never leaves for
    // good. The cord is what makes this its own motion. It is whirled to get
    // the weight moving, flung out until the line runs out, and at that instant
    // it is SNUBBED: the far end stops because the rope says so, not because
    // anything absorbed it, which is a harder and uglier stop than a blow
    // landing. Then it is hauled back in hand over hand and gathered, and the
    // weapon comes back past the wielder before it settles.
    tether(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const orbits = Math.max(1, Math.min(3, Math.round(o.orbits || 1)));
      const spin = 360 * orbits * dir;
      const circle = (0.06 + m.heft * 0.04) * H;
      // The full length of the line, which is what the flight is measured by.
      const cord = (0.42 + m.reach * 0.30) * H * power;
      const hit = 0.46 + (o.crit ? 0.05 : 0);
      const span = hit / orbits;
      const frames = [{ t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'in' }];
      for (let i = 0; i < orbits; i++) {
        frames.push({
          t: i * span + span * 0.36, x: dir * circle, y: circle * 0.8, z: -0.04 * H,
          rx: -6, ry: dir * 18, rz: spin * (i + 0.36) / orbits, scale: 0.96, ease: 'linear'
        });
        frames.push({
          t: i * span + span * 0.74, x: -dir * circle * 0.75, y: -circle * 0.45, z: -0.02 * H,
          rx: 5, ry: -dir * 12, rz: spin * (i + 0.74) / orbits, scale: 0.99, ease: 'linear'
        });
      }
      // Out to the end of the cord.
      frames.push({
        t: hit, x: -dir * cord, y: cord * 0.10, z: 0.24 * H,
        rx: 8, ry: -dir * 20, rz: spin * 0.9, scale: 1.06, ease: 'snap'
      });
      // And snubbed, because there is no more line.
      frames.push({
        t: hit + 0.06, x: -dir * cord * 1.06, y: cord * 0.12, z: 0.2 * H,
        rx: 12, ry: -dir * 16, rz: spin * 0.96, scale: 1.1, ease: 'expoOut'
      });
      // Hauled back in.
      frames.push({
        t: hit + 0.16, x: -dir * cord * 0.45, y: cord * 0.02, z: 0.06 * H,
        rx: -6, ry: -dir * 6, rz: spin * 1.03, scale: 0.95, ease: 'in'
      });
      // Past the hand, and gathered.
      frames.push({
        t: 0.86, x: dir * cord * 0.12, y: -cord * 0.05, z: 0,
        rx: 2, ry: dir * 3, rz: spin * 0.99, scale: 1.03, ease: 'out'
      });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: spin, scale: 1 });
      return {
        duration: (620 + m.heft * 300 + orbits * 120) * (o.crit ? 1.12 : 1),
        frames: frames
      };
    },

    // A spray, a gas cannister or a field projector: five weapons in the
    // projectile slot that are not thrown, do not fire and have no impact at
    // all. What they do happens over TIME, so this is the one motion in the set
    // with no strike in it.
    //
    // It is braced with both hands, pushed steadily forward against what it is
    // putting out (a cannister under pressure shoves back), and then held there
    // with a low tremble running through it rather than a single hit: each beat
    // is a small alternation about the same pose, and the push creeps a little
    // further out as the emission goes on rather than peaking and recovering.
    // Then it is eased off, not snatched back.
    emitter(m, o, H) {
      const power = (o.power || 1) * (o.crit ? 1.15 : 1);
      const push = (0.05 + m.reach * 0.03) * H * power;
      const beats = 5 + (o.crit ? 2 : 0);
      const start = 0.30;
      const end = 0.76;
      const step = (end - start) / (beats - 1);
      const frames = [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'inOut' },
        // Braced, both hands on it.
        { t: 0.18, x: -push * 0.55, y: push * 0.3, z: 0.06 * H, rx: 2, ry: -2, rz: -3, scale: 1.03, ease: 'out' }
      ];
      for (let i = 0; i < beats; i++) {
        const s = (i % 2) ? -1 : 1;
        // The push creeps out across the emission instead of peaking early.
        const grow = 0.90 + 0.14 * (i / (beats - 1));
        frames.push({
          t: start + step * i,
          x: -push * grow, y: push * (0.5 + 0.05 * s) * grow, z: 0.1 * H,
          rx: 2.4 + 0.7 * s, ry: -2.2 + 0.6 * s, rz: -4 + 1.4 * s,
          scale: 1.06 + 0.014 * s, ease: 'linear'
        });
      }
      // Let off.
      frames.push({ t: 0.86, x: -push * 0.3, y: push * 0.15, z: 0.02 * H, rx: 1, ry: -1, rz: -1.4, scale: 1.01, ease: 'out' });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return {
        duration: (820 + m.heft * 260) * (o.crit ? 1.2 : 1),
        frames: frames
      };
    },

    // A shouldered tube: a mine launcher, a drone rack. Mechanical rather than
    // athletic, and it sits between `recoil` and `lob`. There is no throw in it
    // and no muzzle blast either: what goes out leaves under its own power, so
    // what the shoulder feels is a THUNK, one dull shove with a spring or a
    // charge behind it, and then a modest climb as the tube comes up off the
    // shoulder and settles.
    //
    // The weapon is aimed, so as with `recoil` it is turned through a negative
    // cosine and positive rx is what lifts the mouth of the tube.
    launcher(m, o, H) {
      const power = (o.power || 1) * (o.crit ? 1.2 : 1);
      const kick = (0.05 + m.heft * 0.07) * H * power;
      const rise = (14 + m.heft * 18) * power;
      return {
        duration: (620 + m.heft * 280) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'inOut' },
          // Into the shoulder.
          { t: 0.22, x: -kick * 0.25, y: kick * 0.2, z: 0, rx: 1.5, ry: 1, rz: -2, scale: 1.04, ease: 'linear' },
          { t: 0.40, x: -kick * 0.26, y: kick * 0.21, z: 0, rx: 1.6, ry: 1, rz: -2, scale: 1.04, ease: 'snap' },
          // Thunk.
          { t: 0.48, x: kick * 0.5, y: kick, z: -kick * 1.4, rx: rise, ry: -2, rz: 4, scale: 1.07, ease: 'out' },
          { t: 0.60, x: kick * 0.2, y: kick * 0.45, z: -kick * 0.6, rx: rise * 0.45, ry: -1, rz: 2, scale: 1.02, ease: 'inOut' },
          // And the tube comes back down to level.
          { t: 0.80, x: 0, y: kick * 0.12, z: 0, rx: rise * 0.14, ry: 0, rz: 0.5, scale: 1.005, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The Portal Disc, which is a chakram that does not bother travelling. It
    // is flicked into a hole in the air a foot from the hand, and for a moment
    // there is nothing anywhere; then it arrives out of a second hole already
    // at full size and going, cuts through what is in front of it, and is
    // caught. The disappearance is close and small, the arrival is far and
    // large, and the beat of nothing between them is what makes the two read as
    // the same object rather than as two throws.
    portal(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const spins = 3 + (o.crit ? 1 : 0);
      const total = 360 * spins * dir;
      const step = (0.16 + m.reach * 0.08) * H;
      const out = (0.40 + m.reach * 0.22) * H * power;
      return {
        duration: (760 + m.heft * 240) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Wound flat, edge on.
          { t: 0.16, x: dir * step * 0.5, y: -step * 0.2, z: -0.03 * H, rx: 6, ry: dir * 8, rz: total * 0.05, scale: 0.95, ease: 'in' },
          // Into the near hole, which is an arm's length away.
          { t: 0.30, x: -dir * step, y: step * 0.15, z: 0.2 * H, rx: 3, ry: -dir * 6, rz: total * 0.2, scale: 0.28, ease: 'expoOut' },
          { t: 0.40, x: -dir * step * 1.05, y: step * 0.16, z: 0.3 * H, rx: 2, ry: -dir * 4, rz: total * 0.3, scale: 0.02, ease: 'linear' },
          // Nowhere at all.
          { t: 0.50, x: -dir * step * 1.05, y: step * 0.16, z: 0.3 * H, rx: 2, ry: -dir * 4, rz: total * 0.34, scale: 0.02, ease: 'expoIn' },
          // Out of the far one, already at speed.
          { t: 0.62, x: -dir * out, y: out * 0.35, z: 0.3 * H, rx: 6, ry: -dir * 14, rz: total * 0.6, scale: 1.25, ease: 'snap' },
          { t: 0.72, x: -dir * out * 1.12, y: out * 0.2, z: 0.2 * H, rx: 8, ry: -dir * 10, rz: total * 0.78, scale: 1.12, ease: 'out' },
          // Back to the hand.
          { t: 0.86, x: dir * out * 0.12, y: -out * 0.05, z: 0, rx: -3, ry: dir * 4, rz: total * 0.96, scale: 0.96, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: total, scale: 1 }
        ]
      };
    },

    // ============================================================
    // The weapons that move like nothing else
    // ============================================================
    // One motion each, for one weapon each (see UNIQUE_MOTIONS). None of them
    // is a parameter change on a swing: each is written for what that object
    // actually does, and none of them is reachable by any other weapon.

    // Mjölnir. It is thrown, and it comes back, and it is nothing like a
    // boomerang doing it: four kilos of hammer leaves under a haul that takes
    // most of a second, and the beat of the whole motion is the ARRIVAL, not
    // the throw. It is caught with a real absorb, the hand driven down by it
    // and pushed back up, because that much iron arriving in a palm has to cost
    // something. The hand is empty and still in the middle of the clip, which
    // is the only time in the set a weapon is simply absent.
    recall(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.18 : 1);
      const wind = (0.16 + m.heft * 0.10) * H;
      const out = (0.46 + m.reach * 0.24) * H * power;
      const back = out * 0.55;
      const land = (0.06 + m.heft * 0.05) * H;
      return {
        duration: (900 + m.heft * 400) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Hauled back. Nothing quick about it.
          { t: 0.16, x: dir * wind, y: -wind * 0.9, z: -0.08 * H, rx: -26, ry: dir * 18, rz: dir * 26, scale: 0.92, ease: 'linear' },
          { t: 0.26, x: dir * wind * 1.06, y: -wind * 0.95, z: -0.09 * H, rx: -28, ry: dir * 19, rz: dir * 28, scale: 0.91, ease: 'in' },
          // Thrown.
          { t: 0.42, x: -dir * out * 0.9, y: out * 0.25, z: 0.5 * H, rx: 12, ry: -dir * 24, rz: -dir * 50, scale: 0.45, ease: 'linear' },
          { t: 0.54, x: -dir * out, y: out * 0.3, z: 1.1 * H, rx: 6, ry: -dir * 30, rz: -dir * 74, scale: 0.05, ease: 'linear' },
          // The empty hand, held out.
          { t: 0.66, x: -dir * out * 0.9, y: out * 0.28, z: 1.1 * H, rx: 4, ry: -dir * 34, rz: -dir * 88, scale: 0.03, ease: 'expoIn' },
          // And it comes back, from the wrong side and fast.
          { t: 0.80, x: dir * back, y: -back * 0.15, z: 0.3 * H, rx: -8, ry: dir * 10, rz: dir * 120, scale: 0.8, ease: 'expoOut' },
          // Caught. The arm is driven down by it.
          { t: 0.88, x: -dir * land * 0.5, y: land, z: 0, rx: 14, ry: -dir * 4, rz: -dir * 10, scale: 1.22, ease: 'out' },
          { t: 0.94, x: -dir * land * 0.2, y: land * 0.35, z: 0, rx: 5, ry: 0, rz: -dir * 3, scale: 1.04, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // Excalibur, which is presented before it is used. The sword is raised in
    // front of the wielder and held there while nothing at all happens, long
    // enough that the pause is the first thing the player reads; only then does
    // it go back over the shoulder and come down in ONE cut with the whole
    // clip's patience behind it. The presentation is spoken in scale (the
    // overlay camera is orthographic, so a blade brought toward the viewer
    // grows rather than moving) and it is held under `linear` so it does not
    // drift while it is being looked at.
    present(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const show = (0.10 + m.reach * 0.06) * H;
      const raise = (0.20 + m.heft * 0.10) * H;
      const drop = (0.42 + m.reach * 0.28) * H * power;
      const cross = dir * drop * 0.16;
      const punch = 1.26 + m.heft * 0.24 * power + (o.crit ? 0.1 : 0);
      return {
        duration: (900 + m.heft * 300) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'inOut' },
          // Brought up in front, point to the sky.
          { t: 0.14, x: -show * 0.3, y: -show * 0.6, z: 0.05 * H, rx: -6, ry: 8, rz: -4, scale: 1.08, ease: 'out' },
          // Presented, and nothing moves.
          { t: 0.30, x: -show * 0.4, y: -show, z: 0.06 * H, rx: -8, ry: 10, rz: -5, scale: 1.12, ease: 'linear' },
          { t: 0.42, x: -show * 0.41, y: -show * 1.01, z: 0.06 * H, rx: -8.1, ry: 10, rz: -5, scale: 1.12, ease: 'in' },
          // Over the shoulder, on the way to the only cut in the clip.
          { t: 0.52, x: dir * raise * 0.4, y: -raise * 1.2, z: -0.12 * H, rx: -50, ry: dir * 12, rz: dir * 18, scale: 0.9, ease: 'in' },
          { t: 0.64, x: cross, y: drop, z: 0.24 * H, rx: 64, ry: -dir * 10, rz: -dir * 20, scale: punch, ease: 'out' },
          { t: 0.72, x: cross * 1.16, y: drop * (o.crit ? 1.2 : 1.14), z: 0.16 * H, rx: 70, ry: -dir * 8, rz: -dir * 22, scale: punch * 0.9, ease: 'inOut' },
          { t: 0.88, x: cross * 0.35, y: drop * 0.34, z: 0.04 * H, rx: 22, ry: 0, rz: -dir * 6, scale: 1.03, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The Dragon Blade does not cut in an arc: it writhes. The path is an S
    // laid across the view rather than a segment of a circle, so the blade
    // crosses the middle of the frame twice on its way to the target and the
    // roll reverses at each crossing, which is what makes a line of steel read
    // as something alive rather than as something swung. Every waypoint is
    // eased `inOut` so the whole thing is continuous, with the single exception
    // of the strike, which comes out of the last curve under `out` so there is
    // still a blow at the end of the writhing.
    serpentine(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const travel = (0.42 + m.reach * 0.42) * H * power;
      const lift = (0.08 + m.reach * 0.10) * H;
      const wind = Math.min((0.12 + m.heft * 0.10) * H, travel * 0.4);
      const turn = 100 + m.reach * 60 + m.heft * 30;
      const punch = 1.20 + m.heft * 0.24 * power + (o.crit ? 0.08 : 0);
      return {
        duration: (620 + m.heft * 380 + m.reach * 220) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Coiled low and back.
          { t: 0.18, x: dir * wind, y: lift * 0.5, z: -0.06 * H, rx: -10, ry: dir * 16, rz: dir * 30, scale: 0.93, ease: 'in' },
          // Up over the first crest.
          { t: 0.30, x: dir * wind * 0.3, y: -lift * 0.9, z: -0.02 * H, rx: -4, ry: dir * 8, rz: dir * 10, scale: 0.95, ease: 'inOut' },
          // Down through the middle.
          { t: 0.42, x: -dir * travel * 0.35, y: lift * 0.7, z: 0.08 * H, rx: 6, ry: -dir * 10, rz: -dir * turn * 0.3, scale: 1.08, ease: 'inOut' },
          // And up over the second.
          { t: 0.54, x: -dir * travel * 0.72, y: -lift * 0.8, z: 0.14 * H, rx: -4, ry: -dir * 18, rz: -dir * turn * 0.64, scale: 1.16, ease: 'inOut' },
          // Out of the last curve and into whatever is standing there.
          { t: 0.66, x: -dir * travel, y: lift * 1.2, z: 0.2 * H, rx: 14, ry: -dir * 24, rz: -dir * turn, scale: punch, ease: 'out' },
          { t: 0.74, x: -dir * travel * 1.14, y: lift * 1.5, z: 0.14 * H, rx: 16, ry: -dir * 18, rz: -dir * turn * 1.16, scale: punch * 0.93, ease: 'inOut' },
          // The tail of it, still moving after the head has stopped.
          { t: 0.88, x: -dir * travel * 0.3, y: lift * 0.3, z: 0.03 * H, rx: 4, ry: -dir * 6, rz: -dir * turn * 0.36, scale: 1.02, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A fly swatter, which is a sheet of plastic on a wire and behaves like
    // one. It is the fastest motion in the set and the least dignified: a snap
    // of the wrist, a flat slap that arrives well before anything else in this
    // file would have finished winding up, and then it FLEXES, because the head
    // has no stiffness of its own and cannot stop when the wire does. The three
    // beats after contact are the sheet oscillating about the landed pose with
    // the amplitude coming out of it, which is the only place in the set where
    // the weapon carries on moving because of what it is made of.
    swat(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const drop = (0.26 + m.reach * 0.16) * H * power;
      const cock = Math.min((0.14 + m.heft * 0.06) * H, drop * 0.5);
      const frames = [
        { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'expoIn' },
        // Cocked, and gone again immediately.
        { t: 0.20, x: dir * cock * 0.4, y: -cock, z: -0.06 * H, rx: -42, ry: dir * 14, rz: dir * 16, scale: 0.92, ease: 'expoOut' },
        // Splat.
        { t: 0.38, x: -dir * drop * 0.18, y: drop, z: 0.2 * H, rx: 58, ry: -dir * 6, rz: -dir * 10, scale: 1.3 + (o.crit ? 0.08 : 0), ease: 'out' }
      ];
      const flex = [0.5, 0.62, 0.74];
      for (let i = 0; i < flex.length; i++) {
        const s = (i % 2) ? -1 : 1;
        const decay = 1 - i * 0.28;
        frames.push({
          t: flex[i],
          x: -dir * drop * (0.18 + 0.1 * s * decay), y: drop * (1 + 0.14 * s * decay), z: 0.16 * H,
          rx: 58 + 14 * s * decay, ry: -dir * 6, rz: -dir * (10 - 22 * s * decay),
          scale: 1.26 - 0.06 * s * decay, ease: 'inOut'
        });
      }
      // Peeled off whatever it landed on.
      frames.push({ t: 0.88, x: -dir * drop * 0.1, y: drop * 0.34, z: 0.04 * H, rx: 18, ry: 0, rz: -dir * 3, scale: 1.05, ease: 'out' });
      frames.push({ t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 });
      return { duration: (330 + m.heft * 130) * (o.crit ? 1.06 : 1), frames: frames };
    },

    // A war fan, which is three separate beats and not one blow: it is useless
    // shut, so it is SNAPPED OPEN first, swept while open, and snapped shut
    // again afterwards because carrying an open fan around is not a guard. Both
    // snaps are single frames of pure scale against the frame beside them (the
    // overlay camera is orthographic and a fan opening is a change of area, not
    // of position), and the sweep between them is the only part of the motion
    // that travels anywhere.
    fansnap(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const travel = (0.34 + m.reach * 0.30) * H * power;
      const lift = (0.05 + m.reach * 0.06) * H;
      const turn = 80 + m.reach * 60 + m.heft * 24;
      const punch = 1.24 + m.heft * 0.18 * power + (o.crit ? 0.08 : 0);
      return {
        duration: (760 + m.heft * 280) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'snap' },
          // Up, shut, and turned edge-on: the smallest the weapon ever looks.
          { t: 0.14, x: dir * travel * 0.14, y: -lift, z: -0.04 * H, rx: -8, ry: dir * 30, rz: dir * 20, scale: 0.9, ease: 'linear' },
          // Open. One frame, and the whole thing is suddenly there.
          { t: 0.22, x: dir * travel * 0.16, y: -lift * 1.2, z: -0.03 * H, rx: -6, ry: dir * 6, rz: dir * 24, scale: 1.18, ease: 'linear' },
          { t: 0.32, x: dir * travel * 0.17, y: -lift * 1.22, z: -0.03 * H, rx: -6, ry: dir * 6, rz: dir * 25, scale: 1.18, ease: 'in' },
          // Swept, flat and wide.
          { t: 0.52, x: -dir * travel, y: lift, z: 0.18 * H, rx: 6, ry: -dir * 20, rz: -dir * turn, scale: punch, ease: 'out' },
          { t: 0.6, x: -dir * travel * 1.14, y: lift * 1.16, z: 0.12 * H, rx: 5, ry: -dir * 16, rz: -dir * turn * 1.12, scale: punch * 0.94, ease: 'inOut' },
          // Brought back, still open.
          { t: 0.76, x: -dir * travel * 0.25, y: lift * 0.2, z: 0.03 * H, rx: 2, ry: -dir * 4, rz: -dir * turn * 0.2, scale: 1.1, ease: 'in' },
          // Shut. One frame again, the other way.
          { t: 0.86, x: -dir * travel * 0.06, y: 0, z: 0, rx: -2, ry: dir * 4, rz: dir * 8, scale: 0.86, ease: 'out' },
          { t: 0.94, x: -dir * travel * 0.02, y: -lift * 0.06, z: 0, rx: -1, ry: dir * 1, rz: dir * 3, scale: 1.02, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The Arcane Sphere is not swung, held or aimed: it is let go of. The orb
    // lifts off the palm, moves out in front of the caster on its own, turns
    // about its own axis the whole time (a full two turns across the clip, so
    // the last keyframe carries them rather than unwinding), and does its work
    // by PULSING: swelling hard and shrinking back, twice, with the second
    // pulse further out and weaker than the first. Then it comes back to the
    // hand. Nothing here is a blow and nothing accelerates into anything.
    orbit(m, o, H) {
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const out = (0.12 + m.reach * 0.10) * H * power;
      const up = (0.08 + m.reach * 0.05) * H;
      const swell = 1.55 + (o.crit ? 0.14 : 0);
      const total = 720;
      return {
        duration: (860 + m.heft * 260) * (o.crit ? 1.14 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Off the palm.
          { t: 0.16, x: -out * 0.25, y: -up * 0.5, z: 0.05 * H, rx: 0, ry: total * 0.06, rz: 8, scale: 1.05, ease: 'inOut' },
          // Out in front, turning.
          { t: 0.3, x: -out * 0.7, y: -up, z: 0.2 * H, rx: 0, ry: total * 0.22, rz: 20, scale: 1.16, ease: 'linear' },
          { t: 0.44, x: -out * 0.9, y: -up * 1.15, z: 0.24 * H, rx: 0, ry: total * 0.39, rz: 32, scale: 1.2, ease: 'in' },
          // The pulse.
          { t: 0.56, x: -out * 1.3, y: -up * 1.05, z: 0.4 * H, rx: 0, ry: total * 0.53, rz: 44, scale: swell, ease: 'out' },
          { t: 0.66, x: -out * 1.5, y: -up * 0.95, z: 0.34 * H, rx: 0, ry: total * 0.61, rz: 52, scale: 1.3, ease: 'in' },
          // And a second one, further out and with less in it.
          { t: 0.78, x: -out * 1.7, y: -up * 0.9, z: 0.3 * H, rx: 0, ry: total * 0.72, rz: 60, scale: swell * 0.9, ease: 'out' },
          // Drawn back to the hand.
          { t: 0.9, x: -out * 0.4, y: -up * 0.2, z: 0.06 * H, rx: 0, ry: total * 0.9, rz: 20, scale: 1.06, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: total, rz: 0, scale: 1 }
        ]
      };
    },

    // A foam finger. Every part of a real blow is here except the part where
    // something is hit: the wind-up is the biggest in the set and takes the
    // longest, the arm comes round with everything behind it, and then the
    // weapon arrives and simply FOLDS, because there is nothing in it. What
    // follows is not a follow-through, it is a wobble: three beats of foam
    // flopping about with no direction of its own, and a scale that never rises
    // much above resting because nothing here ever hits anything hard enough to
    // be driven at the camera.
    flop(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.12 : 1);
      const travel = (0.36 + m.reach * 0.30) * H * power;
      const wind = Math.min((0.16 + m.heft * 0.12) * H, travel * 0.55);
      const lift = (0.05 + m.reach * 0.04) * H;
      return {
        duration: (780 + m.heft * 260) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // An enormous gather, for nothing.
          { t: 0.24, x: dir * wind, y: -wind * 1.2, z: -0.1 * H, rx: -44, ry: dir * 26, rz: dir * 40, scale: 0.86, ease: 'linear' },
          { t: 0.34, x: dir * wind * 1.06, y: -wind * 1.26, z: -0.11 * H, rx: -46, ry: dir * 27, rz: dir * 42, scale: 0.855, ease: 'in' },
          // Round it comes, and lands like a cushion.
          { t: 0.5, x: -dir * travel, y: lift, z: 0.1 * H, rx: 20, ry: -dir * 16, rz: -dir * 60, scale: 1.1, ease: 'out' },
          // And folds.
          { t: 0.58, x: -dir * travel * 0.86, y: lift * 1.5, z: 0.06 * H, rx: 34, ry: -dir * 10, rz: -dir * 40, scale: 1.02, ease: 'inOut' },
          { t: 0.68, x: -dir * travel * 0.5, y: lift * 1.9, z: 0.02 * H, rx: 40, ry: -dir * 4, rz: -dir * 10, scale: 0.98, ease: 'inOut' },
          { t: 0.78, x: -dir * travel * 0.62, y: lift * 1.6, z: 0.02 * H, rx: 30, ry: -dir * 8, rz: -dir * 26, scale: 1.0, ease: 'inOut' },
          { t: 0.88, x: -dir * travel * 0.3, y: lift * 1.0, z: 0, rx: 16, ry: -dir * 3, rz: -dir * 12, scale: 0.99, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A cook's spatula, used the way a cook uses one. It goes UNDER first,
    // edge-on and low, which no other motion in the set does; then everything
    // is thrown upward at once, which is the flip; and then, while whatever was
    // flipped is still in the air, the blade comes back DOWN to meet it and
    // catches it with a small absorb. Three phases, and the last of them is the
    // reason the motion exists: nothing else here ends by receiving something.
    flip(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.14 : 1);
      const rise = (0.34 + m.reach * 0.26) * H * power;
      const dip = (0.10 + m.heft * 0.07) * H;
      return {
        duration: (700 + m.heft * 260) * (o.crit ? 1.1 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Down, and slid underneath it.
          { t: 0.16, x: dir * dip * 0.4, y: dip, z: -0.05 * H, rx: 26, ry: dir * 12, rz: dir * 18, scale: 0.94, ease: 'in' },
          { t: 0.3, x: dir * dip * 0.5, y: dip * 1.2, z: -0.06 * H, rx: 30, ry: dir * 14, rz: dir * 22, scale: 0.92, ease: 'in' },
          // Up it all goes.
          { t: 0.46, x: -dir * dip * 0.5, y: -rise, z: 0.16 * H, rx: -52, ry: -dir * 12, rz: -dir * 30, scale: 1.22, ease: 'out' },
          { t: 0.56, x: -dir * dip * 0.6, y: -rise * 1.12, z: 0.12 * H, rx: -60, ry: -dir * 8, rz: -dir * 40, scale: 1.14, ease: 'inOut' },
          // Coming back down to meet it.
          { t: 0.7, x: -dir * dip * 0.2, y: -rise * 0.35, z: 0.04 * H, rx: -16, ry: -dir * 3, rz: -dir * 10, scale: 1.02, ease: 'in' },
          // Caught.
          { t: 0.8, x: -dir * dip * 0.1, y: -rise * 0.18, z: 0.02 * H, rx: -6, ry: 0, rz: dir * 4, scale: 1.08, ease: 'out' },
          { t: 0.9, x: 0, y: -rise * 0.06, z: 0, rx: -2, ry: 0, rz: dir * 1.5, scale: 0.99, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The Celestial Hammer, which is an overhead blow with the top of it opened
    // out. An ordinary raise hangs at the zenith for a fraction of the clip
    // because that is how long reversing the weight takes; this one stays up
    // there for a THIRD of it, under `linear` across three frames so the pose
    // does not drift while it hangs, and the drop that follows is the whole
    // rest of the motion. Nothing else about it is decorated: the point is the
    // wait, and a wait only reads if nothing else is happening during it.
    zenith(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.18 : 1);
      const raise = (0.22 + m.heft * 0.12) * H;
      const drop = (0.44 + m.reach * 0.30) * H * power;
      const cross = dir * drop * 0.14;
      const punch = 1.24 + m.heft * 0.34 * power + (o.crit ? 0.1 : 0);
      return {
        duration: (1000 + m.heft * 380) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: 0.16, x: dir * raise * 0.3, y: -raise * 0.8, z: -0.12 * H, rx: -40, ry: dir * 10, rz: dir * 10, scale: 0.9, ease: 'out' },
          // At the top, and staying there.
          { t: 0.28, x: dir * raise * 0.35, y: -raise, z: -0.14 * H, rx: -54, ry: dir * 12, rz: dir * 12, scale: 0.86, ease: 'linear' },
          { t: 0.42, x: dir * raise * 0.36, y: -raise * 1.02, z: -0.14 * H, rx: -55, ry: dir * 12, rz: dir * 12, scale: 0.858, ease: 'linear' },
          { t: 0.56, x: dir * raise * 0.37, y: -raise * 1.03, z: -0.15 * H, rx: -56, ry: dir * 12, rz: dir * 13, scale: 0.856, ease: 'in' },
          // Down.
          { t: 0.68, x: cross, y: drop, z: 0.26 * H, rx: 66, ry: -dir * 10, rz: -dir * 18, scale: punch, ease: 'out' },
          { t: 0.76, x: cross * 1.16, y: drop * (o.crit ? 1.2 : 1.14), z: 0.18 * H, rx: 72, ry: -dir * 8, rz: -dir * 20, scale: punch * 0.9, ease: 'inOut' },
          { t: 0.9, x: cross * 0.34, y: drop * 0.34, z: 0.05 * H, rx: 24, ry: 0, rz: -dir * 6, scale: 1.03, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // The Chronos Hammer, which does not get through its own swing in order.
    // The blow starts across the view, hesitates, RUNS BACK over ground it has
    // already covered as far as the wind-up it came out of, and then goes
    // forward again over exactly the same path before finally completing. The
    // stutter is written into the keyframe TIMES and positions rather than into
    // the easing, because the easing system interpolates between poses and
    // cannot be made to reverse: the way to run time backwards here is to
    // author the earlier pose again, later.
    stutter(m, o, H) {
      const dir = o.dir === undefined ? 1 : o.dir;
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const travel = (0.44 + m.reach * 0.38) * H * power;
      const wind = Math.min((0.14 + m.heft * 0.12) * H, travel * 0.4);
      const lift = (0.08 + m.reach * 0.10) * H;
      const turn = 90 + m.reach * 60 + m.heft * 30;
      const punch = 1.20 + m.heft * 0.30 * power + (o.crit ? 0.09 : 0);
      return {
        duration: (760 + m.heft * 420 + m.reach * 180) * (o.crit ? 1.12 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          { t: 0.16, x: dir * wind, y: -wind * 0.6, z: -0.07 * H, rx: -14, ry: dir * 20, rz: dir * 30, scale: 0.9, ease: 'in' },
          // Away it goes.
          { t: 0.3, x: -dir * travel * 0.35, y: lift * 0.3, z: 0.06 * H, rx: 4, ry: -dir * 10, rz: -dir * turn * 0.3, scale: 1.06, ease: 'linear' },
          { t: 0.36, x: -dir * travel * 0.4, y: lift * 0.34, z: 0.07 * H, rx: 5, ry: -dir * 11, rz: -dir * turn * 0.34, scale: 1.07, ease: 'linear' },
          // And back, over ground it has already been over.
          { t: 0.42, x: -dir * travel * 0.12, y: lift * 0.1, z: 0.02 * H, rx: 1, ry: -dir * 4, rz: -dir * turn * 0.1, scale: 0.98, ease: 'linear' },
          { t: 0.46, x: dir * wind * 0.5, y: -wind * 0.3, z: -0.03 * H, rx: -7, ry: dir * 10, rz: dir * 14, scale: 0.94, ease: 'linear' },
          // The same ground a second time.
          { t: 0.52, x: -dir * travel * 0.45, y: lift * 0.35, z: 0.08 * H, rx: 6, ry: -dir * 12, rz: -dir * turn * 0.4, scale: 1.08, ease: 'in' },
          { t: 0.58, x: -dir * travel * 0.34, y: lift * 0.28, z: 0.06 * H, rx: 4, ry: -dir * 9, rz: -dir * turn * 0.3, scale: 1.04, ease: 'linear' },
          // Completed at last.
          { t: 0.7, x: -dir * travel, y: lift, z: 0.2 * H, rx: 12, ry: -dir * 22, rz: -dir * turn, scale: punch, ease: 'out' },
          { t: 0.78, x: -dir * travel * (o.crit ? 1.24 : 1.16), y: lift * 1.2, z: 0.14 * H, rx: 10, ry: -dir * 18, rz: -dir * turn * 1.12, scale: punch * 0.92, ease: 'inOut' },
          { t: 0.9, x: -dir * travel * 0.35, y: lift * 0.3, z: 0.04 * H, rx: 3, ry: -dir * 6, rz: -dir * turn * 0.34, scale: 1.02, ease: 'out' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 }
        ]
      };
    },

    // A psychic crown, which is a weapon in the database and a hat everywhere
    // else. It is not swung, thrown or pointed: it lifts off the head, hangs
    // there turning, and PULSES, and every bit of that is spoken in scale and
    // rotation rather than in travel, because the crown never goes anywhere.
    // The only movement across the view is the small rise, which is what keeps
    // the strike re-aim from turning a hat into a mace.
    levitate(m, o, H) {
      const power = (o.power || 1) * (o.crit ? 1.16 : 1);
      const lift = (0.10 + m.reach * 0.06) * H * power;
      const swell = 1.5 + (o.crit ? 0.16 : 0);
      const total = 720;
      return {
        duration: (900 + m.heft * 240) * (o.crit ? 1.16 : 1),
        frames: [
          { t: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, ease: 'out' },
          // Off the head.
          { t: 0.18, x: 0, y: -lift * 0.6, z: 0.06 * H, rx: 0, ry: total * 0.06, rz: 6, scale: 1.08, ease: 'inOut' },
          // At height, turning slowly, and going nowhere.
          { t: 0.32, x: 0, y: -lift, z: 0.1 * H, rx: 0, ry: total * 0.17, rz: 10, scale: 1.14, ease: 'linear' },
          { t: 0.44, x: 0, y: -lift * 1.02, z: 0.1 * H, rx: 0, ry: total * 0.28, rz: 11, scale: 1.15, ease: 'in' },
          // The pulse.
          { t: 0.56, x: 0, y: -lift * 1.06, z: 0.2 * H, rx: 0, ry: total * 0.4, rz: 14, scale: swell, ease: 'out' },
          { t: 0.66, x: 0, y: -lift * 1.04, z: 0.16 * H, rx: 0, ry: total * 0.5, rz: 16, scale: 1.24, ease: 'in' },
          // And again, weaker.
          { t: 0.76, x: 0, y: -lift * 1.08, z: 0.18 * H, rx: 0, ry: total * 0.61, rz: 18, scale: swell * 0.94, ease: 'out' },
          // Settling back down.
          { t: 0.9, x: 0, y: -lift * 0.3, z: 0.04 * H, rx: 0, ry: total * 0.86, rz: 6, scale: 1.05, ease: 'inOut' },
          { t: 1, x: 0, y: 0, z: 0, rx: 0, ry: total, rz: 0, scale: 1 }
        ]
      };
    }
  },

  /**
   * Uniform scale that makes `model` cover its intended share of the screen.
   *
   * The overlay camera is orthographic and looks straight down -Z with one
   * world unit per game pixel, so only the model's X/Y extents are visible.
   * Measuring those *after* the idle rotation is what keeps a barrel-forward
   * FPS gun (nearly all of whose length runs along Z) from being fitted to a
   * sliver. The measurement is cached on the model since it never changes.
   */
  fitScaleFor(model, weapon) {
    if (!model || typeof THREE === 'undefined') return 1;
    let extent = model.userData._fitExtent;
    if (!extent) {
      const prevScale = model.scale.clone();
      model.scale.set(1, 1, 1);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      extent = Math.max(size.x, size.y) || 1;
      model.scale.copy(prevScale);
      model.updateMatrixWorld(true);
      model.userData._fitExtent = extent;
    }
    const screenH = (typeof Graphics !== 'undefined' && Graphics.height) ? Graphics.height : 624;
    return (screenH * this.screenFractionFor(weapon)) / extent;
  },

  // ============================================================
  // Verlet Rope Physics for linked-segment weapons (whips/flails)
  // ============================================================

  /**
   * Creates a Verlet rope: a chain of point masses with distance constraints.
   * @param {number} numPoints - Number of points (segments + 1)
   * @param {number} segmentLength - Rest length between consecutive points
   * @param {THREE.Vector3} anchorPos - World-space anchor (handle tip)
   * @param {object} opts - { gravity, damping, iterations, stiffness }
   * @returns {object} rope instance
   */
  createVerletRope(numPoints, segmentLength, anchorPos, opts = {}) {
    const gravity = opts.gravity !== undefined ? opts.gravity : -0.0004;
    const damping = opts.damping !== undefined ? opts.damping : 0.97;
    const iterations = opts.iterations || 6;
    const stiffness = opts.stiffness !== undefined ? opts.stiffness : 1.0;

    const points = [];
    for (let i = 0; i < numPoints; i++) {
      const pos = new THREE.Vector3(
        anchorPos.x,
        anchorPos.y + i * segmentLength,
        anchorPos.z
      );
      points.push({
        pos: pos.clone(),
        prev: pos.clone(),
        pinned: i === 0  // first point is pinned to the anchor
      });
    }

    const constraints = [];
    for (let i = 0; i < numPoints - 1; i++) {
      constraints.push({ a: i, b: i + 1, length: segmentLength });
    }

    return {
      points,
      constraints,
      gravity,
      damping,
      iterations,
      stiffness,
      anchorPos: anchorPos.clone(),
      // Meshes array, filled by createWhipModel / createFlailModel
      segmentMeshes: [],
      // Optional end-mass (heavier tail for flails)
      endMass: opts.endMass || 1.0,
      headMeshGroup: null
    };
  },

  /**
   * Hangs a physics chain off a point on a model and returns the empty group
   * at its far end, for the caller to fill with whatever the chain carries.
   * Every flail, meteor hammer and swinging head in the game is this call plus
   * a head, so the rope wiring lives here rather than in each builder.
   * @param {THREE.Group} group - the weapon; the rope is registered on it
   * @param {object} opts - { links, length, x, y, z, linkMat, linkRadius,
   *   linkTube, gravity, endMass }
   * @returns {THREE.Group} the head mount, already positioned at the tip
   */
  chainRig(group, opts) {
    const o = opts || {};
    const links = o.links || 7;
    const length = o.length || 0.26;
    const segLen = length / links;
    const anchor = new THREE.Vector3(o.x || 0, o.y || 0, o.z || 0);

    const rope = this.createVerletRope(links + 1, segLen, anchor, {
      gravity: o.gravity === undefined ? -0.0008 : o.gravity,
      damping: o.damping === undefined ? 0.93 : o.damping,
      iterations: 8,
      stiffness: 1.0,
      endMass: o.endMass === undefined ? 4.0 : o.endMass
    });

    const r = o.linkRadius === undefined ? 0.014 : o.linkRadius;
    const tube = o.linkTube === undefined ? 0.004 : o.linkTube;
    for (let i = 0; i < links; i++) {
      const link = o.rope
        ? new THREE.Mesh(new THREE.CylinderGeometry(tube * 1.6, tube * 1.6, segLen * 1.05, this.seg(6, 4)), o.linkMat)
        : new THREE.Mesh(new THREE.TorusGeometry(r, tube, this.seg(4, 3), this.seg(8, 5)), o.linkMat);
      if (!o.rope) link.userData._chainAlternate = (i % 2 === 0);
      link.position.set(anchor.x, anchor.y + segLen * i + segLen / 2, anchor.z);
      group.add(link);
      rope.segmentMeshes.push(link);
    }

    const head = new THREE.Group();
    head.position.set(anchor.x, anchor.y + length, anchor.z);
    group.add(head);
    rope.headMeshGroup = head;

    if (!group.userData._verletRopes) group.userData._verletRopes = [];
    group.userData._verletRopes.push(rope);
    return head;
  },

  /**
   * A ball bristling with spikes, distributed evenly over the sphere rather
   * than in rings (the Fibonacci placement is what stops them lining up into
   * visible bands).
   */
  spikeBall(radius, mat, opts) {
    const o = opts || {};
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(radius, this.seg(o.detail || 12, 7), this.seg(o.detail || 10, 6)), mat);
    g.add(ball);
    const count = this.isLowDetail() ? Math.round((o.spikes || 10) * 0.6) : (o.spikes || 10);
    const len = o.spikeLength === undefined ? radius * 0.55 : o.spikeLength;
    const geo = new THREE.ConeGeometry(radius * 0.19, len, o.spikeSides || 4);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const spike = new THREE.Mesh(geo, o.spikeMat || mat);
      const phi = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const n = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      spike.position.copy(n).multiplyScalar(radius + len * 0.4);
      spike.quaternion.setFromUnitVectors(up, n);
      g.add(spike);
    }
    return g;
  },

  /**
   * Steps the Verlet simulation for a single rope.
   * @param {object} rope - rope instance from createVerletRope
   * @param {number} dt - delta time in seconds (capped internally)
   * @param {THREE.Vector3} anchorWorld - current world-space anchor position
   * @param {number} [worldScale=1] - uniform scale of the model the rope hangs
   *   off. The simulation runs in world space (so a swing actually flings the
   *   chain) while rest lengths and gravity are authored in model units, so
   *   both have to be converted or the rope collapses into its anchor.
   */
  // Lazily allocated module-scope scratch objects reused across rope updates
  // to avoid per-point/per-constraint THREE allocations every frame.
  _ensureRopeScratch() {
    if (this._ropeScratch) return this._ropeScratch;
    this._ropeScratch = {
      vel: new THREE.Vector3(),
      diff: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      quat: new THREE.Quaternion()
    };
    return this._ropeScratch;
  },

  tickRope(rope, dt, anchorWorld, worldScale) {
    dt = Math.min(dt, 0.033); // cap at ~30fps equivalent to prevent explosion
    const pts = rope.points;
    const scale = (worldScale && worldScale > 0) ? worldScale : 1;
    const g = rope.gravity * scale;
    const damp = rope.damping;
    const s = this._ensureRopeScratch();

    // Update anchor
    if (anchorWorld) {
      // A changed scale invalidates every cached point position (they are in
      // world space), so re-hang the rope from the anchor at the new spacing
      // instead of letting the constraint solver drag it there over frames.
      if (rope._lastScale !== scale) {
        rope._lastScale = scale;
        for (let i = 0; i < pts.length; i++) {
          const rest = (rope.constraints[Math.max(0, i - 1)] || { length: 0 }).length * scale;
          pts[i].pos.set(anchorWorld.x, anchorWorld.y - i * rest, anchorWorld.z);
          pts[i].prev.copy(pts[i].pos);
        }
      }
      pts[0].pos.copy(anchorWorld);
      pts[0].prev.copy(anchorWorld);
    }

    // Verlet integration for each non-pinned point
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].pinned) continue;
      const p = pts[i];
      const vel = s.vel.subVectors(p.pos, p.prev);
      vel.multiplyScalar(damp);

      // Heavier end mass pulls down harder
      const massFactor = (i === pts.length - 1) ? rope.endMass : 1.0;

      p.prev.copy(p.pos);
      p.pos.add(vel);
      p.pos.y += g * massFactor * dt * 60; // gravity scaled by dt
    }

    // Constraint solving iterations
    for (let iter = 0; iter < rope.iterations; iter++) {
      for (let c = 0; c < rope.constraints.length; c++) {
        const con = rope.constraints[c];
        const a = pts[con.a];
        const b = pts[con.b];
        const diff = s.diff.subVectors(b.pos, a.pos);
        const dist = diff.length();
        if (dist < 0.0001) continue;
        const error = (dist - con.length * scale) / dist;
        const correction = diff.multiplyScalar(error * 0.5 * rope.stiffness);

        if (!a.pinned) a.pos.add(correction);
        if (!b.pinned) b.pos.sub(correction);
      }
    }
  },

  /**
   * Updates the visual meshes of a rope to match the physics state.
   * @param {object} rope - rope instance
   * @param {THREE.Matrix4} [invWorldMatrix] - inverse of model's world matrix for local-space conversion
   */
  updateRopeMeshes(rope, invWorldMatrix) {
    const pts = rope.points;
    const s = this._ensureRopeScratch();

    for (let i = 0; i < rope.segmentMeshes.length; i++) {
      const mesh = rope.segmentMeshes[i];
      if (!mesh || i + 1 >= pts.length) continue;

      const a = s.a.copy(pts[i].pos);
      const b = s.b.copy(pts[i + 1].pos);

      // Transform from world space back to model local space
      if (invWorldMatrix) {
        a.applyMatrix4(invWorldMatrix);
        b.applyMatrix4(invWorldMatrix);
      }

      const mid = s.mid.copy(a).add(b).multiplyScalar(0.5);
      mesh.position.copy(mid);

      // Orient mesh along the segment direction
      const dir = s.dir.subVectors(b, a);
      const len = dir.length();
      if (len > 0.0001) {
        dir.normalize();
        const quat = s.quat.setFromUnitVectors(s.up, dir);
        mesh.quaternion.copy(quat);
      }
    }

    // Update head mesh group position (for flail ball, whip tip, etc.)
    if (rope.headMeshGroup && pts.length > 1) {
      const lastPt = s.a.copy(pts[pts.length - 1].pos);
      if (invWorldMatrix) {
        lastPt.applyMatrix4(invWorldMatrix);
      }
      rope.headMeshGroup.position.copy(lastPt);
    }
  },

  // Helper to add grip wrap rings to a hilt
  addGripWrap(group, rand, hHeight, hRadiusTop, hRadiusBottom, wrapMat) {
    const wrapSegments = 3 + Math.floor(rand() * 3);
    const wrapThickness = 0.003;
    const torusR = (hRadiusTop + hRadiusBottom) / 2;
    for (let i = 0; i < wrapSegments; i++) {
      const t = i / (wrapSegments - 1);
      const ringY = hHeight / 2 - hHeight * t;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(torusR * 1.1, wrapThickness, 4, 8), wrapMat);
      ring.position.y = ringY;
      ring.rotation.x = Math.PI / 2 + (rand() * 0.1 - 0.05);
      group.add(ring);
    }
  },

  // Helper to create a procedural pommel at the bottom of the hilt
  createProceduralPommel(rand, hHeight, metalMat, gemMat) {
    const pommelGroup = new THREE.Group();
    const type = Math.floor(rand() * 5);
    const size = 0.02 + rand() * 0.015;
    let geom;

    switch (type) {
      case 0: // Sphere
        geom = new THREE.SphereGeometry(size, 8, 8);
        break;
      case 1: // Faceted Gem (Octahedron)
        geom = new THREE.OctahedronGeometry(size, 0);
        break;
      case 2: // Torus (Ring)
        geom = new THREE.TorusGeometry(size, size * 0.3, 4, 8);
        break;
      case 3: // Crescent/Winged Cap
        geom = new THREE.BoxGeometry(size * 2, size * 0.5, size * 0.6);
        break;
      case 4: // Flat Cylinder Nut
      default:
        geom = new THREE.CylinderGeometry(size, size, size * 0.6, 6);
        break;
    }

    const pommelMesh = new THREE.Mesh(geom, metalMat);
    pommelMesh.position.y = -hHeight;
    pommelGroup.add(pommelMesh);

    // Occasional pommel gem
    if (rand() > 0.4 && type !== 2) {
      const gemGeo = new THREE.SphereGeometry(size * 0.4, 4, 4);
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.y = -hHeight;
      if (type === 3) gem.position.y += size * 0.25;
      pommelGroup.add(gem);
    }

    return pommelGroup;
  },

  // Helper to create a procedural guard
  createProceduralGuard(rand, metalMat, gemMat, scaleFactor = 1.0) {
    const guardGroup = new THREE.Group();
    const type = Math.floor(rand() * 4);
    const width = (0.1 + rand() * 0.08) * scaleFactor;
    const height = (0.02 + rand() * 0.015) * scaleFactor;
    const depth = (0.03 + rand() * 0.02) * scaleFactor;

    switch (type) {
      case 0: { // Straight Crossguard
        const main = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), metalMat);
        guardGroup.add(main);
        // Small decorative tips
        const tipGeo = new THREE.SphereGeometry(height * 0.8, 6, 6);
        const leftTip = new THREE.Mesh(tipGeo, metalMat);
        leftTip.position.x = -width / 2;
        const rightTip = leftTip.clone();
        rightTip.position.x = width / 2;
        guardGroup.add(leftTip);
        guardGroup.add(rightTip);
        break;
      }
      case 1: { // Curved/Winged Guard
        // Left wing
        const curveL = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(-width * 0.25, height * 1.5, 0),
          new THREE.Vector3(-width * 0.5, height * 2.0, 0)
        );
        const wingL = new THREE.Mesh(new THREE.TubeGeometry(curveL, 6, height * 0.4, 4, false), metalMat);
        // Right wing
        const curveR = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(width * 0.25, height * 1.5, 0),
          new THREE.Vector3(width * 0.5, height * 2.0, 0)
        );
        const wingR = new THREE.Mesh(new THREE.TubeGeometry(curveR, 6, height * 0.4, 4, false), metalMat);
        guardGroup.add(wingL);
        guardGroup.add(wingR);
        break;
      }
      case 2: { // Disc / Ring Guard
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.35, width * 0.35, height, 8), metalMat);
        disc.rotation.x = Math.PI / 2;
        guardGroup.add(disc);
        break;
      }
      case 3: { // Heavy Swept Basket/Torus guard
        const torus = new THREE.Mesh(new THREE.TorusGeometry(width * 0.25, height * 0.5, 4, 8), metalMat);
        torus.rotation.x = Math.PI / 2;
        guardGroup.add(torus);
        break;
      }
    }

    // Embed glowing gem in the center
    if (rand() > 0.3) {
      const gemGeo = new THREE.OctahedronGeometry(height * 0.7, 0);
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.set(0, 0, depth * 0.4);
      guardGroup.add(gem);
      const gemBack = gem.clone();
      gemBack.position.z = -depth * 0.4;
      guardGroup.add(gemBack);
    }

    return guardGroup;
  },

  // ============================================================
  // DEDICATED CUSTOM MODEL METHODS
  // ============================================================

  // ============================================================
  // Bespoke weapon models
  // ============================================================
  // Shared construction helpers. Every model in this file follows the same
  // convention: the weapon runs along +Y with the grip below the origin, the
  // width runs along X and the thickness along Z.

  _mat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.5, metalness: 0.2 }, opts || {}));
  },
  _steel(color, rough) {
    return this._mat(color, { roughness: rough === undefined ? 0.25 : rough, metalness: 0.9 });
  },
  _cast(color) {
    return this._mat(color, { roughness: 0.5, metalness: 0.75 });
  },
  _wood(color) {
    return this._mat(color, { roughness: 0.9, metalness: 0.0 });
  },
  _glow(color, intensity) {
    return this._mat(color, {
      roughness: 0.15, metalness: 0.1,
      emissive: color, emissiveIntensity: intensity === undefined ? 0.7 : intensity
    });
  },

  /**
   * Flat plate cut to a 2D outline and extruded along Z. This is what gives
   * each bespoke blade its own silhouette for the price of a couple of dozen
   * triangles: a kukri, a cleaver and a khopesh are the same call with
   * different points.
   * @param {Array<[number,number]>} points - outline in the X/Y plane
   */
  _plate(points, thickness, material) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: false, steps: 1, curveSegments: 1
    });
    geo.translate(0, 0, -thickness / 2);
    return new THREE.Mesh(geo, material);
  },

  /**
   * Outline of a blade whose spine bends by `curve` (positive bends toward +X,
   * i.e. forward) and narrows toward the tip.
   * @param {number} backBias - how much narrower the back edge is than the
   *   cutting edge; 1 is symmetric, 0.2 is a single-edged blade.
   */
  _bladeOutline(length, width, curve, segments, backBias, opts) {
    const o = opts || {};
    const seg = this.seg(segments || 6, 4);
    const bias = backBias === undefined ? 1 : backBias;
    const belly = o.belly === undefined ? 0 : o.belly;
    const front = [], back = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const cx = curve * length * t * t;
      const y = t * length;
      // Sharpen toward the tip, with an optional belly that widens the middle.
      const taper = 1 - Math.pow(t, o.taperPow === undefined ? 2.4 : o.taperPow);
      const half = Math.max(width * 0.03, (width / 2) * (taper + belly * Math.sin(t * Math.PI)));
      front.push([cx + half, y]);
      back.push([cx - half * bias, y]);
    }
    back.reverse();
    return front.concat(back);
  },

  /** Handle, optional wrap and optional pommel. Returns the handle length. */
  _hilt(group, rand, opts) {
    const o = opts || {};
    const h = o.height || 0.16;
    const rTop = o.rTop || 0.018;
    const rBot = o.rBot === undefined ? rTop * 0.85 : o.rBot;
    const y0 = o.offset || 0;
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, this.seg(o.sides || 8, 5)),
      o.mat
    );
    handle.position.y = y0 - h / 2;
    if (o.flat) handle.scale.z = o.flat;
    group.add(handle);
    if (o.wrapMat && this.wantsTrim()) {
      this.addGripWrap(handle, rand, h, rTop, rBot, o.wrapMat);
    }
    if (o.pommelMat) {
      let geo;
      if (o.pommel === 'disc') geo = new THREE.CylinderGeometry(rTop * 1.6, rTop * 1.6, rTop * 0.7, this.seg(10, 6));
      else if (o.pommel === 'wheel') geo = new THREE.CylinderGeometry(rTop * 2.0, rTop * 2.0, rTop * 0.8, this.seg(12, 6));
      else if (o.pommel === 'nut') geo = new THREE.CylinderGeometry(rTop * 1.2, rTop * 1.4, rTop * 1.1, 6);
      else geo = new THREE.SphereGeometry(rTop * 1.4, this.seg(8, 5), this.seg(6, 4));
      const p = new THREE.Mesh(geo, o.pommelMat);
      p.position.y = y0 - h;
      if (o.pommel === 'disc' || o.pommel === 'wheel') p.rotation.x = Math.PI / 2;
      group.add(p);
    }
    return h;
  },

  /** Straight bar crossguard with optional swept tips. */
  _crossguard(group, mat, width, thickness, depth, sweep) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, depth), mat);
    group.add(bar);
    if (sweep && this.wantsTrim()) {
      for (const s of [-1, 1]) {
        const tip = new THREE.Mesh(new THREE.ConeGeometry(thickness * 0.75, thickness * 2.2, this.seg(6, 4)), mat);
        tip.position.set(s * width / 2, thickness * 0.9, 0);
        tip.rotation.z = -s * sweep;
        group.add(tip);
      }
    }
    return bar;
  },

  /** A row of rivet heads down a handle scale. */
  // `z` is the half-thickness the rivet heads stand off by, and `zCentre` the
  // plane they straddle: a part built away from z = 0 needs it, or its back
  // rivets end up in the air behind the weapon.
  _rivets(group, mat, count, yStart, yStep, radius, z, zCentre) {
    if (!this.wantsTrim()) return;
    const mid = zCentre || 0;
    for (let i = 0; i < count; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 0.8, this.seg(6, 4)), mat);
      r.rotation.x = Math.PI / 2;
      r.position.set(0, yStart + i * yStep, mid + z);
      group.add(r);
      const back = r.clone();
      back.position.z = mid - z;
      group.add(back);
    }
  },

  // ============================================================
  // Model families
  // ============================================================
  // The models themselves live in the Weapon3D_* files beside this one and are
  // injected at runtime (see the loader at the bottom), exactly as the 3D
  // enemy battlers load their 3DBattler_* families. None of them is listed in
  // plugins.js; adding a family means adding its name to WEAPON3D_FAMILIES.
  //
  // A family calls registerFamily() with:
  //   models  { methodName: fn }   builders, bound onto this object
  //   unique  { weaponId: name }   bespoke model per database id (optional)
  UNIQUE_MODELS: {},

  _familyOwners: {},

  // ============================================================
  // Unarmed
  // ============================================================
  // A character with nothing in their hand still has a hand, and what it
  // looks like depends on what they are: a Humanoid's fist, a Dragon's claw
  // and a Slime's pseudopod are not the same weapon. Builders are registered
  // per Archetypes.json key rather than per weapon id, since there is no
  // database weapon to key on.
  UNARMED_MODELS: {},
  DEFAULT_ARCHETYPE: 'Humanoid',

  /**
   * The archetype whose fist a character shows. A hybrid ("Dragon / Elven")
   * uses the FIRST of its archetypes, so a mixed character always reads as
   * one thing rather than something in between.
   */
  archetypeOf(actor) {
    try {
      if (actor && window.HealthCore && typeof window.HealthCore.getActorArchetypeKeys === 'function') {
        const keys = window.HealthCore.getActorArchetypeKeys(actor);
        if (keys && keys.length && this.UNARMED_MODELS[keys[0]]) return keys[0];
        if (keys && keys.length) return keys[0];
      }
      const raw = actor && actor._currentArchetype;
      if (raw) return String(raw).split('/')[0].trim();
    } catch (e) { /* no health system loaded */ }
    return this.DEFAULT_ARCHETYPE;
  },

  /**
   * A stand-in weapon for an empty hand, so the whole rest of the pipeline
   * (cache, merge, pose, procedural attack) works unchanged. It is typed as a
   * Glove, which is what an unarmed strike is: id is derived from the
   * archetype name so the model cache keys on it.
   */
  unarmedWeaponFor(actor) {
    const archetype = this.archetypeOf(actor);
    if (!this._unarmedWeapons) this._unarmedWeapons = {};
    if (this._unarmedWeapons[archetype]) return this._unarmedWeapons[archetype];

    // Negative ids can never collide with a real database weapon.
    let h = 0;
    for (let i = 0; i < archetype.length; i++) h = (Math.imul(h, 31) + archetype.charCodeAt(i)) | 0;
    const weapon = {
      id: -1000 - (Math.abs(h) % 100000),
      name: archetype,
      wtypeId: 11,                       // Glove: the punch pose and motion
      note: '<Weight: 900>',
      unarmedArchetype: archetype,
      weaponAnimations: []
    };
    this._unarmedWeapons[archetype] = weapon;
    return weapon;
  },

  /**
   * A shield is an off-hand armour, and hands hold weapons and shields alike
   * (ItemSystem/ItemSystemEquipment.js), so one has to be able to appear in
   * frame beside a sword. Wrapping it as a weapon is all it takes: the cache,
   * the fit, the pose and the procedural attack clip all work off the same
   * fields. It is typed as Heavy, which is how a shield is swung when it is
   * swung at all, and keeps the armour's own <Weight:> so a buckler and a
   * tower shield are not built to the same silhouette.
   */
  shieldWeaponFor(armor) {
    if (!armor) return null;
    if (!this._shieldWeapons) this._shieldWeapons = {};
    if (this._shieldWeapons[armor.id]) return this._shieldWeapons[armor.id];
    const weapon = {
      // Negative, and a different band from the unarmed fists, so neither can
      // collide with a database weapon or with each other in the model cache.
      id: -200000 - armor.id,
      name: armor.name,
      wtypeId: 3,
      note: armor.note || '',
      meta: armor.meta || {},
      iconIndex: armor.iconIndex,
      shieldArmorId: armor.id,
      weaponAnimations: []
    };
    this._shieldWeapons[armor.id] = weapon;
    return weapon;
  },

  /** Builds the fist for an archetype, falling back to the default one. */
  buildUnarmed(weapon, rand) {
    const key = weapon.unarmedArchetype;
    const name = this.UNARMED_MODELS[key] || this.UNARMED_MODELS[this.DEFAULT_ARCHETYPE];
    if (name && typeof this[name] === 'function') return this[name](weapon, rand);
    if (!this._missingBuilders) this._missingBuilders = {};
    if (!this._missingBuilders['unarmed:' + key]) {
      this._missingBuilders['unarmed:' + key] = true;
      console.warn('[WeaponSystemProcedural] no unarmed model for archetype ' + key);
    }
    return null;
  },

  // ============================================================
  // The hand on the end of the punch
  // ============================================================
  // MOTIONS.punch moves the whole arm; this moves the hand it ends in. Two
  // things separate a punch that was thrown from a fist being carried across
  // the screen, and neither of them is travel: the hand turns over against
  // the forearm on its way out, because a fist lands on its knuckles rather
  // than on its thumb, and the fingers, carried loose the rest of the time,
  // clench on the one frame the blow arrives. Both are declared by the model
  // as plain data (Weapon3D_Unarmed tags its hand node and every digit with
  // `punch`) so that a cached model can still be cloned, exactly as the
  // ambient moving parts are.

  // Windows of the punch's own duration: the fist loosens in the chamber,
  // shuts on the way out, holds through the impact and opens on the way back.
  PUNCH_WINDOWS: { open: 0.20, shut: 0.36, hold: 0.56, back: 0.82 },
  // How far it loosens first, as a share of how hard it then shuts: a hand
  // cannot tighten from nothing, and that slack is what makes the clench read
  // as a clench rather than as a fist that was always closed.
  PUNCH_SLACK: 0.42,

  /** The hand node and digits a punch drives, cached on the model. */
  punchPartsOf(model) {
    if (model._punchParts) return model._punchParts;
    const parts = [];
    model.traverse((obj) => {
      const ud = obj.userData;
      if (!ud || !ud.punch) return;
      ud._punchRest = { x: obj.rotation.x, z: obj.rotation.z };
      parts.push(obj);
    });
    model._punchParts = parts;
    return parts;
  },

  beginPunch(model, durationMs) {
    if (!model) return;
    if (!this.punchPartsOf(model).length) return;
    model._punch = { elapsed: 0, duration: Math.max(1, durationMs || 320) };
  },

  /**
   * Drives the clench and the turn of the wrist over the clip. Cheap when
   * nothing is being thrown: a single property check.
   */
  tickPunch(model, dtMs) {
    const punch = model && model._punch;
    if (!punch) return;
    const parts = this.punchPartsOf(model);
    if (!parts.length) { model._punch = null; return; }

    punch.elapsed += dtMs;
    const t = punch.elapsed / punch.duration;
    const w = this.PUNCH_WINDOWS;
    const slack = this.PUNCH_SLACK;
    // Negative while the hand is chambered and loose, 1 on the frames it is
    // shut, and unwound rather than snapped back on the recovery.
    let k;
    if (t <= w.open) {
      k = -slack * (t / w.open);
    } else if (t < w.shut) {
      const u = (t - w.open) / (w.shut - w.open);
      k = -slack + (1 + slack) * (1 - Math.pow(1 - u, 4));
    } else if (t <= w.hold) {
      k = 1;
    } else if (t < w.back) {
      const u = (t - w.hold) / (w.back - w.hold);
      k = 1 - u * u;
    } else {
      k = 0;
    }

    const done = t >= 1;
    for (let i = 0; i < parts.length; i++) {
      const obj = parts[i];
      const ud = obj.userData;
      const rest = ud._punchRest;
      const p = ud.punch;
      const bend = p.curl !== undefined ? p.curl : (p.pitch || 0);
      obj.rotation.x = rest.x + (done ? 0 : bend * k);
      if (p.roll) obj.rotation.z = rest.z + (done ? 0 : p.roll * k);
    }
    if (done) model._punch = null;
  },

  registerFamily(family) {
    if (!family) return;
    const owner = family.name || 'anonymous';
    if (family.models) {
      for (const key of Object.keys(family.models)) {
        const previous = this._familyOwners[key];
        if (previous && previous !== owner) {
          console.warn('[WeaponSystemProcedural] ' + owner + ' overrides ' + key + ' from ' + previous);
        }
        this._familyOwners[key] = owner;
        this[key] = family.models[key];
      }
    }
    if (family.unarmed) {
      for (const key of Object.keys(family.unarmed)) {
        this.UNARMED_MODELS[key] = family.unarmed[key];
      }
    }
    if (family.unique) {
      for (const id of Object.keys(family.unique)) {
        this.UNIQUE_MODELS[id] = family.unique[id];
      }
    }
    // A family arriving after something was already drawn (a hot reload, a
    // late-injected script) must not leave stale prototypes behind.
    if (this._modelCache.size) this.clearModelCache();
  },

  // Patching Sprite_3DWeapon dynamically
  patchSprite3DWeapon() {
    if (!window.Sprite_3DWeapon || Sprite_3DWeapon.prototype._proceduralPatched) return;
    Sprite_3DWeapon.prototype._proceduralPatched = true;

    // Reused across frames by the update override below (THREE is available
    // here since patching happens at runtime). Avoids per-frame allocations.
    const _CHAIN_TWIST = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const _anchorScratch = new THREE.Vector3();

    // Uniform scale for the model in its idle pose.
    //
    // GLB models keep their authored <3DScale>. Procedural models are measured
    // against the screen instead (see fitScaleFor): they used to be drawn at a
    // flat 7000x / 22000x, which put a sword roughly ten screen-heights tall.
    // The result is cached and only recomputed if the game resolution changes.
    Sprite_3DWeapon.prototype._baseScale = function() {
      const w = this._weapon;
      if (w.model3d) return w.model3dScale || 1.0;
      const screenH = (typeof Graphics !== 'undefined' && Graphics.height) ? Graphics.height : 624;
      if (this._fitScale && this._fitScaleFor === screenH) return this._fitScale;
      const tweak = w.model3dScaleAuthored ? (w.model3dScale || 1) : 1;
      this._fitScale = WeaponSystemProcedural.fitScaleFor(this._model, w) * tweak;
      this._fitScaleFor = screenH;
      return this._fitScale;
    };

    // Screen-space nudge from the shared weapon anchor, in game pixels. Both
    // come from WeaponSystemProcedural.anchorOffsetFor so the tools viewer can
    // reproduce the exact battle pose.
    Sprite_3DWeapon.prototype._anchorOffsetX = function() {
      return WeaponSystemProcedural.anchorOffsetFor(this._weapon).x;
    };
    Sprite_3DWeapon.prototype._anchorOffsetY = function() {
      return WeaponSystemProcedural.anchorOffsetFor(this._weapon).y;
    };

    // How quickly a gun swings onto a new target, as the time constant of an
    // exponential ease in milliseconds. Short enough to have arrived before the
    // shot goes off, long enough to read as the character turning the muzzle.
    const AIM_EASE_MS = 110;

    /**
     * Turns a gun to face what it is shooting at. The aim point in game pixels
     * is handed to the sprite once a frame by Spriteset_Battle
     * (weaponAimPoint); with none, the weapon settles back to its resting pose
     * across the battlefield. Writes _baseRotation, which every pose below
     * (idle sway, recoil keyframes) is built on top of, so the kick of a shot
     * still reads as a kick from wherever the gun is pointing.
     */
    Sprite_3DWeapon.prototype._updateAim = function(deltaMs) {
      if (!WeaponSystemProcedural.aimsAtTarget(this._weapon)) return;

      const rest = WeaponSystemProcedural.baseRotationFor(this._weapon);
      let want = rest;
      if (this._aimPoint) {
        const off = WeaponSystemProcedural.anchorOffsetFor(this._weapon);
        // Where the weapon itself sits on screen: world Y grows upward, so the
        // anchor's Y nudge counts backwards against screen coordinates.
        want = WeaponSystemProcedural.aimRotationFor(
          this._aimPoint.x - (this._screenX + off.x),
          this._aimPoint.y - (this._screenY - off.y)
        );
      }

      if (!this._aimRot) this._aimRot = { x: rest.x, y: rest.y, z: rest.z };
      const cur = this._aimRot;
      const k = 1 - Math.exp(-deltaMs / AIM_EASE_MS);
      cur.x += (want.x - cur.x) * k;
      cur.y += (want.y - cur.y) * k;
      cur.z += (want.z - cur.z) * k;
      this._baseRotation = cur;
    };

    // Reset 3D weapon back to idle first-person pose
    Sprite_3DWeapon.prototype._resetToIdle = function() {
      if (!this._model) return;
      // A weapon fading out at the end of a battle is never raised again.
      if (this._exiting) return;
      this._model.visible = true;
      this._visible = true;

      this._model.position.set(
        this._worldX(this._screenX) + this._anchorOffsetX(),
        this._worldY(this._screenY) + this._anchorOffsetY(),
        0
      );

      const r = this._baseRotation;
      this._model.rotation.set(
        THREE.MathUtils.degToRad(r.x),
        THREE.MathUtils.degToRad(r.y),
        THREE.MathUtils.degToRad(r.z)
      );

      const s = this._baseScale();
      this._model.scale.set(s, s, s);
    };

    // Override _loadModel to support both procedural and GLB models with always-visible behavior
    Sprite_3DWeapon.prototype._loadModel = function() {
      this._baseRotation = WeaponSystemProcedural.baseRotationFor(this._weapon);

      if (!this._weapon.model3d) {
        if (!window.THREE) return;
        this._model = WeaponSystemProcedural.createModel(this._weapon);
        if (this._model) {
          const _retro = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
          if (_retro) _retro.applyToObject(this._model);

          // Rotate first: the fit measures the model's on-screen footprint,
          // which depends on the idle pose.
          const r = this._baseRotation;
          this._model.rotation.set(
            THREE.MathUtils.degToRad(r.x),
            THREE.MathUtils.degToRad(r.y),
            THREE.MathUtils.degToRad(r.z)
          );
          const s = this._baseScale();
          this._model.scale.set(s, s, s);

          this._model.position.set(
            this._worldX(this._screenX) + this._anchorOffsetX(),
            this._worldY(this._screenY) + this._anchorOffsetY(),
            0
          );
          this._model.visible = true; // ALWAYS VISIBLE!
          this._visible = true;       // ALWAYS VISIBLE!
          window.WeaponThreeScene.scene.add(this._model);

          if (this._pendingAnimation != null) {
            const pending = this._pendingAnimation;
            this._pendingAnimation = null;
            this.playAnimation(pending);
          }
        }
        return;
      }

      // GLB model loading
      if (!window.THREE || !THREE.GLTFLoader) return;
      const loader = new THREE.GLTFLoader();
      loader.load(
        `models/${this._weapon.model3d}`,
        (gltf) => {
          this._model = gltf.scene;
          const _retro = window.RetroShader ? window.RetroShader.active() : window.PSXShader;
          if (_retro) _retro.applyToObject(this._model);
          const s = this._weapon.model3dScale || 1.0;
          this._model.scale.set(s, s, s);
          const r = this._baseRotation;
          this._model.rotation.set(
            THREE.MathUtils.degToRad(r.x),
            THREE.MathUtils.degToRad(r.y),
            THREE.MathUtils.degToRad(r.z)
          );
          this._model.position.set(this._worldX(this._screenX), this._worldY(this._screenY), 0);
          this._model.visible = true; // ALWAYS VISIBLE!
          this._visible = true;       // ALWAYS VISIBLE!
          window.WeaponThreeScene.scene.add(this._model);

          if (gltf.animations && gltf.animations.length > 0) {
            this._mixer = new THREE.AnimationMixer(this._model);
            this._mixer.addEventListener('finished', () => {
              this._clipPlaying = false;
              this._resetToIdle();
            });
            this._clips = {};
            gltf.animations.forEach(clip => {
              this._clips[clip.name] = this._mixer.clipAction(clip);
            });
          }

          if (this._pendingAnimation != null) {
            const pending = this._pendingAnimation;
            this._pendingAnimation = null;
            this.playAnimation(pending);
          }
        },
        undefined,
        (err) => console.error('[Sprite_3DWeapon] Failed to load model:', this._weapon.model3d, err)
      );
    };

    // Override _applyKeyframe to reset back to idle instead of hiding the weapon at the end of keyframes
    Sprite_3DWeapon.prototype._applyKeyframe = function(deltaMs) {
      this._animElapsed += deltaMs;
      const dur = this._animData.duration || 500;
      const t = Math.min(this._animElapsed / dur, 1.0);
      const frames = this._animData.frames;
      if (!frames || frames.length === 0) return;

      const k = WeaponSystemProcedural.sampleKeyframes(frames, t);
      // Turned and shortened so the blow lands on what is being hit.
      WeaponSystemProcedural.applyStrikeTransform(k, this._strikeXf);
      const off = WeaponSystemProcedural.anchorOffsetFor(this._weapon);

      this._model.position.set(
        this._worldX(this._screenX) + off.x + k.x,
        this._worldY(this._screenY) + off.y + k.y,
        k.z
      );
      const r = this._baseRotation;
      this._model.rotation.set(
        THREE.MathUtils.degToRad(r.x + k.rx),
        THREE.MathUtils.degToRad(r.y + k.ry),
        THREE.MathUtils.degToRad(r.z + k.rz)
      );

      const s = this._baseScale() * k.scale;
      this._model.scale.set(s, s, s);

      if (t >= 1.0) {
        this._animData = null;
        this._resetToIdle();
      }
    };

    // Override playAnimation to correctly display/hide procedural/GLB models and trigger custom animations
    // Attack motion is GENERATED for this weapon, not looked up. See
    // WeaponSystemProcedural.buildAttack: the clip's amplitude, timing and
    // impact come from the model's measured length and the weapon's <Weight:>,
    // so a paring knife and a Zweihander swinging the same skill do not play
    // the same animation scaled up.
    /**
     * Locks the swing onto wherever the target was standing when the blow
     * started, so a blow does not wander after an enemy that moves or dies
     * halfway through it.
     */
    Sprite_3DWeapon.prototype._prepareStrike = function() {
      this._strikeXf = WeaponSystemProcedural.strikeTransformFor(
        this._animData, this._weapon, this._screenX, this._screenY, this._aimPoint);
    };

    /**
     * @param {string} name - the clip asked for, or null for whatever this
     *   weapon does of its own accord.
     * @param {object} [opts] - what kind of blow this is, {crit:boolean}.
     *   Absent means an ordinary hit, which is what every older caller means.
     */
    Sprite_3DWeapon.prototype.playAnimation = function(name, opts) {
      // A blow that arrived while the model was still loading is still the
      // same blow when the wait is over: whoever replays the pending name has
      // no idea it was a critical hit, so the request kept with it is picked
      // up here instead of being asked for again.
      if (opts === undefined && this._pendingAnimationOpts) opts = this._pendingAnimationOpts;
      this._pendingAnimationOpts = null;

      this._animElapsed = 0;
      this._animData = null;
      this._strikeXf = null;
      this._clipPlaying = false; // Reset clip status when starting any animation

      if (!this._model) {
        // '' rather than null: no name means "this weapon's own motion",
        // which is a real request and must survive the wait for the model.
        this._pendingAnimation = name || '';
        this._pendingAnimationOpts = opts || null;
        return;
      }

      this._model.visible = true;
      this._visible = true;

      // An authored GLB clip always wins: it was made for that model.
      if (this._clips && this._clips[name]) {
        this.playClip(name);
        return;
      }
      if (name === 'Shoot' && this._clips && this._clips['Shoot']) {
        this.playClip('Shoot');
        return;
      }

      // Procedural motion for procedural models.
      if (!this._weapon.model3d) {
        this._animData = WeaponSystemProcedural.buildAttack(this._weapon, name, this._model, opts);
        if (this._animData) {
          this._prepareStrike();
          // The blade starts leaving a trail the moment the movement does, not
          // when the blow lands: this override is the one playAnimation that
          // ever runs for a procedural weapon, so the stroke has to be started
          // from here and not from the base class.
          if (this.beginTrail) this.beginTrail();
          return;
        }
      }

      // GLB models with no clip of their own fall back to the shared table.
      const kf = window._weaponKeyframes3d;
      if (kf) {
        this._animData = kf[name] || kf['Swing'] || null;
        this._prepareStrike();
        if (this.beginTrail) this.beginTrail();
      } else {
        // '' rather than null: no name means "this weapon's own motion",
        // which is a real request and must survive the wait for the model.
        this._pendingAnimation = name || '';
        this._pendingAnimationOpts = opts || null;
      }
    };

    // Override playClip to track standard animation clip status
    const _Sprite_3DWeapon_playClip = Sprite_3DWeapon.prototype.playClip;
    Sprite_3DWeapon.prototype.playClip = function(clipName) {
      // Only an authored clip that actually exists freezes the idle sway: a
      // procedural weapon has no mixer at all, and marking one as playing
      // used to leave it hanging in mid-pose forever.
      if (!this._mixer || !this._clips || !this._clips[clipName]) return;
      this._clipPlaying = true;
      if (this.beginTrail) this.beginTrail();
      if (_Sprite_3DWeapon_playClip) {
        _Sprite_3DWeapon_playClip.call(this, clipName);
      }
    };

    // Override update to execute subtle breathing, bobbing, and swaying animations when idle
    Sprite_3DWeapon.prototype.update = function() {
      const now = performance.now();
      const deltaMs = Math.min(this._lastTime ? now - this._lastTime : 16, 50);
      this._lastTime = now;

      if (!this._model) return;

      // Entry slide / exit fade first: it only moves the shared anchor
      // (_worldX), so every pose below is placed with it already folded in.
      if (this._updateTransition) this._updateTransition(deltaMs);
      // Same for the aim: it only writes _baseRotation.
      this._updateAim(deltaMs);

      if (this._mixer) this._mixer.update(deltaMs / 1000);

      if (this._animData) {
        this._idleTime = 0;
        this._applyKeyframe(deltaMs);
      } else if (!this._clipPlaying) {
        // First-person idle breathing, tuned per weapon type.
        this._idleTime = (this._idleTime || 0) + deltaMs;
        const sway = WeaponSystemProcedural.idleSway(this._weapon, this._idleTime);
        const off = WeaponSystemProcedural.anchorOffsetFor(this._weapon);

        this._model.position.set(
          this._worldX(this._screenX) + off.x + sway.dx,
          this._worldY(this._screenY) + off.y + sway.dy,
          0
        );

        const r = this._baseRotation;
        this._model.rotation.set(
          THREE.MathUtils.degToRad(r.x) + sway.drx,
          THREE.MathUtils.degToRad(r.y),
          THREE.MathUtils.degToRad(r.z) + sway.drz
        );

        const baseScale = this._baseScale();
        this._model.scale.set(baseScale, baseScale, baseScale);
      }

      // ---- Moving parts declared by the model itself ----
      // Gears, drifting shards, pulsing runes. Costs one traversal the first
      // frame and a short loop afterwards; a model with no moving parts is a
      // single array-length check.
      if (!this._weapon.model3d) {
        WeaponSystemProcedural.tickModelParts(this._model, deltaMs);
        // Trigger, action, ejected case and muzzle flash, while a shot is
        // still working through the gun.
        WeaponSystemProcedural.tickGun(this._model, deltaMs);
        // The magazine coming out and going back in, while the weapon is
        // being worked on below the frame.
        WeaponSystemProcedural.tickGunReload(this._model, deltaMs);
        // The blade leaving a sword cane's shaft and going back into it.
        WeaponSystemProcedural.tickCane(this._model, deltaMs);
        // The string coming back to the cheek, the limbs bending with it and
        // the arrow leaving.
        WeaponSystemProcedural.tickBow(this._model, deltaMs);
        // The vector gun coming apart and building itself back as another
        // weapon. Last of the movers, so while a reconstruction is running it
        // owns every part, whatever shape the frame is standing in.
        WeaponSystemProcedural.tickVectorSwitch(this._model, deltaMs);
        // A bare hand clenching into the punch it is throwing, and turning
        // over on the wrist as it goes. Same reason it comes after the
        // ambient parts: it owns the rotations it writes.
        WeaponSystemProcedural.tickPunch(this._model, deltaMs);
      }

      // ---- Tick Verlet rope physics for whips and flails ----
      if (this._model && !this._weapon.model3d) {
        const dtSec = deltaMs / 1000;

        // Collect all ropes attached to this model. Cache the list on the model
        // so it isn't rebuilt every frame; a new model has no cache, which
        // naturally invalidates it when the weapon model changes.
        let ropes = this._model.userData._ropesCache;
        if (!ropes) {
          ropes = [];
          if (this._model.userData._verletRope) {
            ropes.push(this._model.userData._verletRope);
          }
          if (this._model.userData._verletRopes) {
            for (const r of this._model.userData._verletRopes) ropes.push(r);
          }
          this._model.userData._ropesCache = ropes;
        }

        if (ropes.length > 0) {
          // Compute world-space anchor: the model's handle tip (local y=0)
          // We need the model's world matrix to transform the local anchor
          this._model.updateMatrixWorld(true);
          if (!this._invWorldScratch) this._invWorldScratch = new THREE.Matrix4();
          const invWorld = this._invWorldScratch.copy(this._model.matrixWorld).invert();

          const worldScale = this._model.scale.x || 1;

          for (const rope of ropes) {
            // Transform rope's local anchor through model's world matrix
            const worldAnchor = _anchorScratch.copy(rope.anchorPos).applyMatrix4(this._model.matrixWorld);

            WeaponSystemProcedural.tickRope(rope, dtSec, worldAnchor, worldScale);
            WeaponSystemProcedural.updateRopeMeshes(rope, invWorld);

            // Apply alternating 90deg twist to chain link tori for interlocking look
            for (let si = 0; si < rope.segmentMeshes.length; si++) {
              const mesh = rope.segmentMeshes[si];
              if (mesh && mesh.userData._chainAlternate === false) {
                mesh.quaternion.multiply(_CHAIN_TWIST);
              }
            }
          }
        }
      }

      // The elemental tint a <weaponShimmer> state puts on what the actor is
      // holding. This override replaces Sprite_3DWeapon#update outright, and
      // every weapon in the game that has no <3DModel:> GLB tag comes through
      // here, so leaving it out of the override is what had the shimmer never
      // appear on any of them.
      if (this._updateShimmer) this._updateShimmer();

      // Last, with the frame's pose and every moving part already written: the
      // blade is sampled where it actually ended up this frame, which is what
      // the trail is skinned from (WeaponTrail, Weapon3DOverlay.js). Same
      // reason as the shimmer above, this override replaces the base update
      // outright and every procedural weapon comes through here.
      if (this._updateTrail) this._updateTrail(now);

      // Scene render is batched once per frame by the Spriteset_Battle
      // iterator (WeaponSystem.js) rather than once per weapon instance.
    };
  }
};

window.WeaponSystemProcedural = WeaponSystemProcedural;

//=============================================================================
// Model family auto-loader
//=============================================================================
// The builders are kept out of this file and out of plugins.js: they are
// injected here at load time, the same arrangement 3DBattlerSystem.js uses for
// its 3DBattler_* families. Scripts are appended with async=false so they run
// in list order, and a family that fails to arrive costs only the models it
// carried, never the rest of the system.
// One family per weapon type. Each owns the generic silhouette its type falls
// back to, the note-tagged one-offs of that type, and every bespoke per-weapon
// model in it.
const WEAPON3D_FAMILIES = [
  'Weapon3D_Light',       // wtypeId 1  knives, daggers, punch weapons
  'Weapon3D_Swords',      // wtypeId 2
  'Weapon3D_Heavy',       // wtypeId 3  hammers, maces, clubs
  'Weapon3D_Axes',        // wtypeId 4
  'Weapon3D_Whips',       // wtypeId 5
  'Weapon3D_Flails',      // the <Flail> rope subtype
  'Weapon3D_Staves',      // wtypeId 6
  'Weapon3D_Bows',        // wtypeId 7  bows and crossbows
  'Weapon3D_Projectiles', // wtypeId 8  thrown
  'Weapon3D_Guns',        // wtypeId 9
  'Weapon3D_Claws',       // wtypeId 10
  'Weapon3D_Gloves',      // wtypeId 11
  'Weapon3D_Spears',      // wtypeId 12 spears and polearms
  'Weapon3D_Types',       // the entries that declare no weapon type
  'Weapon3D_Unarmed'      // one fist per Archetypes.json archetype
];

(function loadWeapon3DFamilies() {
  const host = document.body || document.head || document.documentElement;
  if (!host) return;
  const dir = 'js/plugins/Weapon/';
  for (const name of WEAPON3D_FAMILIES) {
    const src = dir + name + '.js';
    if (document.querySelector('script[src="' + src + '"]')) continue; // already loaded
    const s = document.createElement('script');
    s.type = 'text/javascript';
    s.src = src;
    s.async = false; // preserve insertion order so dependencies load first
    s.defer = false;
    s.onerror = () => console.error('[WeaponSystemProcedural] Failed to load family: ' + src);
    host.appendChild(s);
  }
})();
