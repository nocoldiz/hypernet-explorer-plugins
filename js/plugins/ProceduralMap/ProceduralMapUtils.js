/*:
 * @target MZ
 * @plugindesc Utility functions for procedural map generation: noise, tile conversion, coordinates
 * @author Omni-Lex
 *
 * @help
 * Procedural Map Utilities
 * ========================
 * Provides core utility functions for procedural generation:
 * - Perlin noise and smoothing
 * - Tile ID to progressive ID conversions
 * - World coordinate management
 * - Seeded random number generation
 * - Cache management
 * - Multi-tile terrain feature support
 *
 * TERRAIN FEATURE FORMATS
 * =======================
 * Single Tile:
 *   <FeatureName: B10>      (B-E sheets, no space)
 *   <FeatureName: B 10>     (B-E sheets, with space - legacy)
 *   <FeatureName: A1 2>     (A-sheets: A1 sheet, index 2)
 *
 * Multi-Tile Grid (2x2):
 *   <Castle: [B34, B45],[B65, B66]>
 *   Places a 2x2 grid of tiles at the feature location
 *
 * Multi-Tile Grid (1x2 - vertical):
 *   <Cactus: [E34],[B60]>
 *   Places a 1 wide, 2 tall grid
 *
 * Multi-Tile Grid (3x2):
 *   <Feature: [B10, B11, B12],[B20, B21, B22]>
 *   Places a 3 wide, 2 tall grid
 *
 * This plugin must be loaded before ProceduralMapBiomeGenerator.js
 *
 * BIOMES MAP PRELOAD / EXPORT
 * ===========================
 * Enable "Preload Biomes Map" to load the biome coordinate cache from
 * js/db/WorldGen/BiomesMap.json instead of scanning all world map tiles.
 * This speeds up the first visit to map 315.
 *
 * Enable "Export Biomes Map" to write BiomesMap.json automatically
 * whenever the world map cache is rebuilt from tiles. The file includes
 * biome coordinates, pre-computed road directions, and river directions.
 * Requires NW.js (desktop game). In browser/test builds it will silently
 * skip the write.
 *
 * @param preloadBiomesMap
 * @text Preload Biomes Map
 * @type boolean
 * @default false
 * @desc Load biome cache from js/db/WorldGen/BiomesMap.json instead of scanning world map tiles
 *
 * @param exportBiomesMap
 * @text Export Biomes Map
 * @type boolean
 * @default false
 * @desc Write biome cache + road/river directions to js/db/WorldGen/BiomesMap.json after tile scan
 */

(() => {
  "use strict";

  const pluginName = "ProceduralMapUtils";

  const _params = PluginManager.parameters(pluginName);
  const PRELOAD_BIOMES_MAP = _params.preloadBiomesMap === "true";
  const EXPORT_BIOMES_MAP = _params.exportBiomesMap === "true";

  // ===== CONSTANTS =====
  const WORLD_MAP_ID = 315;
  const WORLD_TILESET_ID = 96;
  const PROC_MAP_ID = 636;
  const PROC_MAP_WIDTH = 64;
  const PROC_MAP_HEIGHT = 64;
  const DEBUG_MODE = Utils.isOptionValid("test");
  const BORDER_DETECTION_RANGE = 3;
  const { Biomes } =
    window.WorldGen;

  // ===== PERFORMANCE CACHE =====
  //
  // The noise cache is the hottest thing in the generator: one 64x64 square asks
  // for a quarter of a million samples and hits the cache 997 times out of a
  // thousand, so what the LOOKUP costs is what a square costs to build. It used
  // to be a Map of Maps of Maps keyed seed -> floorX -> floorY, three hash walks
  // per sample, and that alone was more than half the time a square took.
  //
  // It is one Map per seed now, keyed by the cell packed into a single integer,
  // with the seed's own table held in a variable between calls (a pass keeps one
  // seed for thousands of samples in a row). The packing is deliberately kept
  // inside the range V8 stores as a small integer: a key of 2^31 or more is a
  // heap number, hashing it costs an allocation, and that one detail is the
  // whole difference - the same code with a wider stride is no faster than the
  // three Maps it replaced.
  //
  // What may not change is WHICH sample a cell keeps. The value is keyed by the
  // FLOORED coordinate and computed from the unfloored one, and every caller
  // scales its coordinates (x * 0.22, x * frequency), so a cell is asked for at
  // a dozen fractional positions and the first one to arrive is the one the
  // world is made of. This cache is not an optimisation over noise2D, it IS the
  // noise function: drop it and every square in the world comes out different.
  const NOISE_CACHE_LIMIT = 20000;
  // The widest |fx| or |fy| a packed key may hold. Real coordinates reach a few
  // thousand; anything past this falls back to a string key, because a collision
  // here would silently change the shape of the world.
  const NOISE_SPAN = 16384;
  const NOISE_STRIDE = NOISE_SPAN * 2;

  let noiseBySeedCache = new Map();  // seed -> Map<packed cell, value>
  let noiseCacheCount = 0;
  let noiseSeedHeld = null;          // the seed noiseTableHeld belongs to
  let noiseTableHeld = null;

  function clearNoiseCache() {
    noiseBySeedCache = new Map();
    noiseCacheCount = 0;
    noiseSeedHeld = null;
    noiseTableHeld = null;
  }

  function getCachedNoise(x, y, seed) {
    let table = noiseSeedHeld === seed ? noiseTableHeld : null;
    if (!table) {
      table = noiseBySeedCache.get(seed);
      if (!table) { table = new Map(); noiseBySeedCache.set(seed, table); }
      noiseSeedHeld = seed;
      noiseTableHeld = table;
    }
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const key = (fx >= -NOISE_SPAN && fx < NOISE_SPAN && fy >= -NOISE_SPAN && fy < NOISE_SPAN)
      ? (fx + NOISE_SPAN) * NOISE_STRIDE + (fy + NOISE_SPAN)
      : fx + "," + fy;
    let v = table.get(key);
    if (v === undefined) {
      if (noiseCacheCount >= NOISE_CACHE_LIMIT) {
        // Wholesale clear on overflow (cheaper than per-key LRU eviction).
        noiseBySeedCache = new Map();
        noiseCacheCount = 0;
        table = new Map();
        noiseBySeedCache.set(seed, table);
        noiseSeedHeld = seed;
        noiseTableHeld = table;
      }
      // The unfloored x/y decide the value, the floored ones decide the cell.
      v = noise2D(x, y, seed);
      table.set(key, v);
      noiseCacheCount++;
    }
    return v;
  }

  const Cache = {
    tilesetFeatures: {},
    biomeNameCache: {},

    getTilesetFeatures(tilesetId) {
      if (!this.tilesetFeatures[tilesetId]) {
        this.tilesetFeatures[tilesetId] = parseTerrainFeatures(tilesetId);
      }
      return this.tilesetFeatures[tilesetId];
    },

    getNoise: getCachedNoise,

    clear() {
      this.tilesetFeatures = {};
      this.biomeNameCache = {};
      clearNoiseCache();
    },
  };

  // ===== RESUMABLE GENERATION =====
  // --------------------------------------------------------------------------
  // Building one 64x64 square costs 15 to 20 ms of solid work, which is a whole
  // frame at 60 fps and then some. That was fine while a square was only ever
  // built at a moment the screen was black anyway; the stitched window
  // (WorldMapReturn's ProcStitch) builds the ground ahead of a walking party
  // instead, and one 17 ms lump dropped on a frame the player is looking at is a
  // visible hitch. Eight of them land in a row after every arrival, which is the
  // flicker this exists to get rid of.
  //
  // So every heavy pass in the generator exists ONCE, as a generator function
  // that yields at the points it can safely be paused at, and the plain function
  // of the same name is a driver that runs it straight through. The synchronous
  // path is therefore the very same code in the very same order, drawing on the
  // same RNG stream in the same sequence: a square built across ten frames is
  // tile for tile the square built in one, and test/test_procgen_slicing.js
  // holds both to that.
  //
  // Nothing ever yields in the middle of a tile, so a budget is a target rather
  // than a promise: a slice overruns by at most one chunk of one pass.
  // --------------------------------------------------------------------------

  // Map rows a sliced loop covers between yields. Eight rows of a 64-wide map is
  // around half a millisecond in the heaviest pass there is: fine grained enough
  // that a budget is never overshot by much, coarse enough that the generator
  // machinery itself costs nothing measurable.
  const STEP_ROWS = 8;

  function runSteps(it) {
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  // ===== LOGGING UTILITY =====
  function log(message) {
    if (DEBUG_MODE) {
      console.log(`[ProcGen] ${message}`);
    }
  }

  function logWarn(message) {
    if (DEBUG_MODE) {
      console.warn(`[ProcGen] ${message}`);
    }
  }

  // ===== TILE ID CONVERSION FUNCTIONS =====

  /**
   * Convert tile ID to progressive ID
   * Progressive ID system:
   * A1: 0-15, A2: 16-31, A3: 32-47, A4: 48-63, A5: 64-79
   * B: 80-335, C: 336-591, D: 592-847, E: 848-1103
   * Also handles extended tilesets
   */
  function getTileIdToProgressiveId(tileId) {
    const ranges = [
      { max: 256, base: 80, sub: 0 },
      { max: 512, base: 336, sub: 256 },
      { max: 768, base: 592, sub: 512 },
      { max: 1024, base: 848, sub: 768 },
    ];

    for (const r of ranges) {
      if (tileId < r.max) return r.base + (tileId - r.sub);
    }

    if (tileId >= 2048) {
      const offset = tileId - 2048;
      const sectionIndex = Math.floor(offset / 48);
      const indexInSection = offset % 48;

      if (sectionIndex <= 4) {
        const validIndex = Math.floor(indexInSection / 3);
        if (validIndex < 16) return sectionIndex * 16 + validIndex;
      }
      return sectionIndex * 16 + Math.floor(indexInSection / 3);
    }

    return -1;
  }

  /**
   * Convert progressive ID to tile ID
   */
  function getProgressiveIdToTileId(pId) {
    const ranges = [
      [
        0,
        80,
        (id) => {
          const sect = Math.floor(id / 16);
          const idx = id % 16;
          return 2048 + sect * 48 + idx * 3;
        },
      ],
      [80, 336, (id) => id - 80],
      [336, 592, (id) => 256 + (id - 336)],
      [592, 848, (id) => 512 + (id - 592)],
      [848, 1104, (id) => 768 + (id - 848)],
    ];

    for (const [min, max, calc] of ranges) {
      if (pId >= min && pId < max) return calc(pId);
    }
    return 0;
  }

  /**
   * Convert tile type (A1-E) and index to tile ID
   * Special handling for A4 cliff tags (1-16):
   * - Tags 1-8: First row of ceilings/walls
   * - Tags 9-16: Second row of ceilings/walls
   */
  function getTileIdFromTypeAndIndex(tileType, index) {
    const type = tileType.toUpperCase();

    if (type.startsWith("A")) {
      const typeNum = parseInt(type.substring(1)) || 1;

      // Standard RPG Maker MZ autotiles
      // A5: 1536-1663 (128 autotile variants)
      if (typeNum === 5) {
        return 1536 + (index - 0); // index 0-127 maps to 1536-1663
      }

      // Extended A-sheets in 2048+ range (A1, A2, A3, A4)
      if (typeNum === 4 && index >= 1 && index <= 16) {
        const baseA4 = 2048 + 3 * 48;
        return baseA4 + (index - 1);
      }

      return 2048 + (typeNum - 1) * 48 + (index - 1) * 48;
    } else if (type === "B") {
      return index - 1;
    } else if (type === "C") {
      return 256 + (index - 1);
    } else if (type === "D") {
      return 512 + (index - 1);
    } else if (type === "E") {
      return 768 + (index - 1);
    }

    return 0;
  }

  // ===== BIOME LOOKUP FUNCTIONS =====

  // Reverse lookup maps progressiveId -> biome name / road direction. Built once
  // from the static Biomes list so per-tile biome resolution is O(1) instead of
  // a linear scan over every biome (which mattered on the ~262k-tile world map
  // 315 scan and every fallback lookup). "First biome wins" preserves the old
  // array-order scan semantics.
  let _worldTileBiomeIndex = null; // Map<progressiveId, biomeName>
  let _worldTileRoadIndex = null;  // Map<progressiveId, direction>

  function buildWorldTileIndices() {
    const biomeIndex = new Map();
    const roadIndex = new Map();
    for (const biome of Biomes) {
      if (!biome.biomeIds) continue;
      const isRoad = biome.name.startsWith("Road ");
      const direction = isRoad ? biome.name.substring(5).toLowerCase() : null;
      for (const pid of biome.biomeIds) {
        if (!biomeIndex.has(pid)) biomeIndex.set(pid, biome.name);
        if (isRoad && !roadIndex.has(pid)) roadIndex.set(pid, direction);
      }
    }
    _worldTileBiomeIndex = biomeIndex;
    _worldTileRoadIndex = roadIndex;
  }

  /**
   * Get biome for tile position on world map using biomeIds from Biomes
   */
  function getBiomeForWorldTile(worldTileId) {
    const progressiveId = getTileIdToProgressiveId(worldTileId);
    if (progressiveId < 0) {
      return "Fields";
    }

    if (!_worldTileBiomeIndex) buildWorldTileIndices();
    return _worldTileBiomeIndex.get(progressiveId) || "Fields";
  }

  /**
   * True when a world-map tile id resolves to a river marker biome ("River
   * horizontal/vertical/cross"). Rivers may be painted on the world map either as
   * these small biome tiles or as wide water autotiles; both resolve through the
   * biome table to a name starting with "River".
   */
  function isRiverWorldTileId(worldTileId) {
    if (!worldTileId) return false;
    const name = getBiomeForWorldTile(worldTileId);
    return typeof name === "string" && name.toLowerCase().indexOf("river") === 0;
  }

  // Base biomes that are themselves open water: a river painted over them is
  // meaningless (it is already water), so no overlay is recorded for these.
  const _WATER_BASE_RE = /^(ocean|lake|seabed|sea\b)/i;

  /**
   * Actor 1 named "Test" marks a playtesting session. The world map is being
   * edited live in those sessions, so every cached snapshot of it (the preloaded
   * BiomesMap.json, the in-save coordinate cache) has to be treated as stale and
   * rebuilt from the actual tiles.
   */
  function isTestPlayer() {
    return !!(
      typeof $gameActors !== "undefined" &&
      $gameActors &&
      $gameActors.actor(1) &&
      $gameActors.actor(1).name() === "Test"  // i18n-ignore  debug account name
    );
  }

  // ===== WORLD-MAP BRIDGE MARKERS =====
  // A road crossing a river is never inferred from a road/river biome overlap
  // (that produced flooded, undrivable road maps). The world map instead tags
  // the crossing explicitly with a bridge tile, and only those columns generate
  // a river + a road drawn over it.
  // These are progressive ids (the ids the tile debugger overlays on the world
  // map and the same vocabulary Biomes.json biomeIds use), not raw tile ids.
  const BRIDGE_PROGRESSIVE_VERTICAL = 440;   // bridge spans north-south
  const BRIDGE_PROGRESSIVE_HORIZONTAL = 441; // bridge spans east-west

  /**
   * Bridge orientation for a world-map tile id, or null when it is not a bridge
   * marker. The direction is the direction the road/bridge runs; the river it
   * crosses runs perpendicular to it.
   */
  function getBridgeDirectionFromWorldTileId(worldTileId) {
    if (!worldTileId) return null;
    const progressiveId = getTileIdToProgressiveId(worldTileId);
    if (progressiveId === BRIDGE_PROGRESSIVE_VERTICAL) return "vertical";
    if (progressiveId === BRIDGE_PROGRESSIVE_HORIZONTAL) return "horizontal";
    return null;
  }

  const _ROAD_BASE_RE = /^road/i;

  /**
   * Classify a single world-map column from a tileAt(z) accessor (z = 3..0).
   *
   * A river tile painted OVER a real land biome must not hijack the whole tile
   * into a full river-biome map. Instead the column is classified as the
   * underlying (topmost non-river) biome and the river tile id is returned
   * separately so the caller can draw the river as an overlay inside that biome.
   * A river with no land beneath it (over ocean, or standing alone) keeps its
   * river/water classification and reports no overlay.
   *
   * A bridge marker tile (440/441) in the column classifies it as a Road column
   * whose road runs along the marker's orientation, and reports that orientation
   * so the generator can draw the river first and the road over it.
   *
   * Roads are painted OVER a terrain biome, so the column also reports the
   * topmost non-road, non-river biome as `underBiome`: the terrain the road runs
   * across. For a column with no road it is simply the classified biome.
   *
   * @param {Function} tileAt - (z) => tileId at this column's layer z
   * @returns {{biome:string, riverTileId:number, bridge:(string|null), underBiome:(string|null)}}
   */
  function classifyWorldColumn(tileAt) {
    let base = null;      // topmost non-river biome (the real terrain)
    let under = null;     // topmost non-river, non-road biome (terrain under a road)
    let top = null;       // topmost non-empty biome (river or not)
    let riverTileId = 0;  // topmost river tile id
    let bridge = null;    // bridge orientation when a bridge marker is present
    for (let z = 3; z >= 0; z--) {
      const t = tileAt(z);
      if (!t) continue;
      // Bridge markers are annotations, not terrain: they never classify as a
      // biome themselves, they only flag the column as a river crossing.
      const bridgeDir = getBridgeDirectionFromWorldTileId(t);
      if (bridgeDir) {
        if (!bridge) bridge = bridgeDir;
        continue;
      }
      const b = getBiomeForWorldTile(t);
      if (top === null) top = b;
      if (typeof b === "string" && b.toLowerCase().indexOf("river") === 0) {
        if (!riverTileId) riverTileId = t;
      } else {
        if (base === null) base = b;
        if (under === null && !(typeof b === "string" && _ROAD_BASE_RE.test(b))) {
          under = b;
        }
      }
    }
    const biome = base !== null ? base : (top !== null ? top : "Fields");
    // Only land bases carry a river overlay; deep-water bases do not.
    if (base === null || _WATER_BASE_RE.test(base)) riverTileId = 0;

    if (bridge) {
      // The crossing is its own biome: river first, road over it. Bridge counts
      // as a road biome, so neighbouring road maps still connect to it.
      return { biome: "Bridge", riverTileId, bridge, underBiome: under };  // i18n-ignore  biome id
    }

    // A road that merely overlaps a river is NOT a crossing. Without an explicit
    // bridge marker the river overlay is dropped, otherwise the channel floods
    // the carriageway and leaves an impassable road.
    if (base !== null && _ROAD_BASE_RE.test(base)) riverTileId = 0;

    return { biome, riverTileId, bridge: null, underBiome: under };
  }

  /**
   * Get road direction from world tile using biomeIds from Biomes
   */
  function getRoadDirectionFromWorldTile(worldTileId) {
    const progressiveId = getTileIdToProgressiveId(worldTileId);

    if (progressiveId < 0) {
      return null;
    }

    if (!_worldTileRoadIndex) buildWorldTileIndices();
    return _worldTileRoadIndex.get(progressiveId) || null;
  }

  // ===== BIOSIGN FEATURES (alien biomes) =====
  //
  // An alien biome declares its tentacles, tentacled rock and crystal tentacles
  // with a `lifeSign` on the feature (js/db/WorldGen/AlienBiomes.json). They are
  // not scenery every world of that type carries: they are the thing a scan
  // reads as a WEAK life sign, so they only grow where the planet the party
  // landed on actually shows one (GalaxySim.currentAlienGrowsBiosigns; a world
  // with a full biosphere counts). Every consumer of a biome's features goes
  // through getBiomeByName, so stripping them here is the whole rule: the
  // scatter passes, the adjacent-biome blending and the borrowed-terrain
  // fallbacks all see the same list.
  //
  // The stripped copy is memoised on the biome record itself rather than in
  // biomeNameCache, because which of the two lists is right changes with the
  // planet under the party's feet and not with the biome's name.
  function _biosignsAllowed() {
    const GS = window.GalaxySim;
    if (!GS || typeof GS.currentAlienGrowsBiosigns !== "function") return true;
    return GS.currentAlienGrowsBiosigns();
  }

  // ===== GRAVE FEATURES (haunted worlds) =====
  //
  // The same rule read the other way round. A feature marked `haunted` is not
  // scenery every world of its biome carries either: it is what is left of the
  // people who went there, and it grows only on a body Systems.json flags
  // `haunted` (Earth's three moons). Sub-mercurian rock is sub-mercurian rock
  // on every other star's dead pebble; on the Moon it is a burial ground, and
  // the graves are scattered the whole way across the square rather than being
  // one placed landmark, which is the point of putting them through the
  // ordinary feature scatter instead of the structure catalogue.
  //
  // It answers the same question the encounter tables already ask of a haunted
  // world (the flag is authored on the body in Systems.json): the dead are its
  // only population, and this is where they are buried. Asked through
  // landedWorldIsHaunted rather than currentWorldIsHaunted, because the square
  // is generated before map 636 is loaded and before currentBiome is written,
  // which is exactly what the latter waits for (it is keyed on groundPlanet,
  // the same answer the alien terrain generators are).
  function _hauntedAllowed() {
    const GS = window.GalaxySim;
    if (!GS || typeof GS.landedWorldIsHaunted !== "function") return false;
    return GS.landedWorldIsHaunted();
  }

  // Which conditional markers this world satisfies, as one small number, so a
  // filtered copy can be memoised per world instead of rebuilt on every
  // lookup. getBiomeByName is called thousands of times while a square is
  // built.
  const MASK_BIOSIGNS = 1;
  const MASK_HAUNTED  = 2;
  function _featureMask() {
    return (_biosignsAllowed() ? MASK_BIOSIGNS : 0) |
           (_hauntedAllowed()  ? MASK_HAUNTED  : 0);
  }

  // Both markers are opt-in: a feature carrying one is dropped unless this
  // world satisfies it. A feature carrying neither is scenery and always stays.
  function _featureAllowed(f, mask) {
    if (!f || typeof f !== "object") return true;
    if (f.lifeSign && !(mask & MASK_BIOSIGNS)) return false;
    if (f.haunted  && !(mask & MASK_HAUNTED))  return false;
    return true;
  }

  const _filteredBiomes = new WeakMap();   // biome -> Map(mask -> filtered copy)
  function _withoutConditionalFeatures(biome, mask) {
    if (!biome || !Array.isArray(biome.features)) return biome;
    let byMask = _filteredBiomes.get(biome);
    if (!byMask) { byMask = new Map(); _filteredBiomes.set(biome, byMask); }
    if (!byMask.has(mask)) {
      const kept = biome.features.filter((f) => _featureAllowed(f, mask));
      // Nothing to strip: the biome is already its own barren version.
      byMask.set(mask, kept.length === biome.features.length
        ? biome
        : Object.assign({}, biome, { features: kept }));
    }
    return byMask.get(mask);
  }

  /**
   * Get biome object by name (with caching)
   */
  function getBiomeByName(biomeName) {
    if (!Cache.biomeNameCache[biomeName]) {
      Cache.biomeNameCache[biomeName] =
        Biomes.find((b) => b.name === biomeName) || null;
    }
    const biome = Cache.biomeNameCache[biomeName];
    if (!biome) return biome;
    const mask = _featureMask();
    // The common case by far: an ordinary world, where the biosigns are allowed
    // and nothing is haunted, so only the haunted markers can bite.
    return _withoutConditionalFeatures(biome, mask);
  }

  // ===== TERRAIN FEATURE PARSING =====

  /**
   * Parse a single tile from format like: B10, B 10, A1 2, A12
   */
  function parseSingleTileString(tileStr) {
    const trimmed = tileStr.trim();

    // B-E sheet format: B10 or B 10
    const bcdeMatch = trimmed.match(/^([B-E])\s*(\d+)$/i);
    if (bcdeMatch) {
      const type = bcdeMatch[1].toUpperCase();
      const index = parseInt(bcdeMatch[2]);
      return getTileIdFromTypeAndIndex(type, index);
    }

    // A-sheet format: A1 2 or A12
    const aSheetMatch = trimmed.match(/^A([1-5])\s*(\d+)$/i);
    if (aSheetMatch) {
      const sheetNum = parseInt(aSheetMatch[1]);
      const index = parseInt(aSheetMatch[2]);
      return getTileIdFromTypeAndIndex(`A${sheetNum}`, index);
    }

    return 0;
  }

  /**
   * Parse terrain feature definitions from tileset notes
   * Supports:
   * - Multi-tile grids: <Feature: [B10, B11],[B20, B21]>
   * - Single tiles: <Feature: B10> or <Feature: B 10> or <Feature: A1 2>
   */
  function parseTerrainFeatures(tilesetId) {
    const tileset = $dataTilesets[tilesetId];
    if (!tileset || !tileset.note) {
      return {};
    }

    const features = {};
    const noteLines = tileset.note.split("\n");

    for (const line of noteLines) {
      // Try multi-tile format first: <FeatureName: [tile1, tile2],[tile3, tile4]>
      const multiTileMatch = line.match(/<(\w+):\s*(\[.*\](?:\s*,\s*\[.*\])*)>/);
      if (multiTileMatch) {
        const featureName = multiTileMatch[1];
        const gridString = multiTileMatch[2];

        const rows = gridString.match(/\[([^\]]*)\]/g);
        if (rows && rows.length > 0) {
          const grid = rows.map((row) => {
            const tileStrings = row.slice(1, -1).split(",");
            const tiles = tileStrings
              .map((t) => parseSingleTileString(t))
              .filter((t) => t > 0);
            return tiles;
          });

          if (grid.length > 0 && grid[0].length > 0) {
            if (!features[featureName]) {
              features[featureName] = [];
            }

            // Store multi-tile feature variant
            const maxWidth = Math.max(...grid.map((r) => r.length));
            features[featureName].push({
              type: "grid",
              grid: grid,
              width: maxWidth,
              height: grid.length,
            });
            continue;
          }
        }
      }

      // Try single-tile format: <FeatureName: B10> or <FeatureName: B 10> or <FeatureName: A1 2>
      const singleTileMatch = line.match(
        /<(\w+):\s*([A-E]\d+\s*\d*|[B-E]\d+)>/i
      );
      if (singleTileMatch) {
        const featureName = singleTileMatch[1];
        const tileStr = singleTileMatch[2];
        const tileId = parseSingleTileString(tileStr);

        if (tileId > 0) {
          if (!features[featureName]) {
            features[featureName] = [];
          }
          // Store single-tile feature variant
          features[featureName].push({
            type: "single",
            tileId: tileId,
          });
        }
      }
    }

    return features;
  }

  // ===== RANDOM NUMBER GENERATION =====

  /**
   * Seeded random number generator (Mulberry32)
   */
  function createSeededRandom(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
    };
  }

  /**
   * Read the canonical world-RNG root (the HistorySimulator seed). Every piece
   * of world-persistent procedural content derives from this so a given world
   * seed produces a consistent, reproducible world that differs from other
   * seeds. Mirrors the fallback chain used by TreasureRoomSystem/SearchableItemShop.
   */
  /**
   * Coerce any seed value (number, numeric string, or arbitrary word such as
   * "esoteric") into a uint32 RNG root. Arbitrary strings are FNV-1a hashed so
   * named seeds are usable everywhere a numeric seed is expected.
   */
  function normalizeSeed(value) {
    if (typeof value === "number" && isFinite(value)) return value >>> 0;
    const str = String(value == null ? "" : value);
    if (/^\d+$/.test(str)) return Number(str) >>> 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function getWorldSeed() {
    try {
      if (window.HistoryManager && typeof window.HistoryManager.getSeed === "function") {
        const s = window.HistoryManager.getSeed();
        if (s !== undefined && s !== null) return normalizeSeed(s);
      }
    } catch (e) { /* ignore */ }
    if (typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._historySeed !== undefined) {
      return normalizeSeed($gameSystem._historySeed);
    }
    return normalizeSeed(19002001); // canon default
  }

  /**
   * Strong integer avalanche hash mixing the world seed with world coordinates.
   * Replaces the old additive (seed + x + y) mixing so neighbouring seeds and
   * neighbouring tiles produce wholly different RNG streams instead of
   * near-identical maps. Deterministic for a given (worldSeed, x, y).
   */
  function hashCoords(worldSeed, x, y) {
    let h = (worldSeed | 0) >>> 0;
    h = Math.imul(h ^ ((x | 0) * 0x9e3779b1), 0x85ebca77) >>> 0;
    h = Math.imul(h ^ ((y | 0) * 0xc2b2ae3d), 0x27d4eb2f) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x2545f491) >>> 0;
    h ^= h >>> 13;
    return h >>> 0;
  }

  /**
   * THE canonical seed for a procedural map square. Every entry point into map
   * 636 must derive its terrain seed from here, or the same world tile builds a
   * different map depending on how it was reached (world map "Visit", walking
   * across a biome border, coming back out of a house, surfacing from a cave).
   *
   * Only the world seed, the world coordinates and the layer depth may take
   * part: those are exactly the things that identify the square. `salt` is for
   * squares that legitimately hold more than one map at the same depth (one
   * dungeon per DoorDungeon tile, for instance).
   *
   * Depth 0 with no salt reproduces the plain surface seed, so surfacing from a
   * cave rebuilds the very map the player descended from.
   */
  function procMapSeed(originX, originY, layerDepth, salt) {
    const base = hashCoords(getWorldSeed(), originX, originY);
    const depth = layerDepth | 0;
    const extra = salt | 0;
    if (!depth && !extra) return base;
    return hashCoords(base, depth + 1, extra);
  }

  /**
   * Ice world tiles resolve to a latitude-dependent biome: Permafrost at the
   * extreme poles, Tundra across the milder mid-latitudes (Y=0 is north pole,
   * Y=255 is south). Applied before the specialBiomes roll, and shared so the
   * travel HUD and debug overlay normalize exactly like the generator does --
   * neither Permafrost nor Tundra defines specialBiomes, so an Ice tile must
   * never be reported as Crystals.
   */
  function normalizeLatitudeBiome(biomeName, originY) {
    // i18n-ignore-start  biome ids from Biomes.json
    if (biomeName !== "Ice") return biomeName;
    return (originY < 48 || originY >= 208) ? "Permafrost" : "Tundra";
    // i18n-ignore-end
  }

  /**
   * The parent biome a special-biome name was rolled out of ("SpiritWoods" ->
   * "Forest"), or the name itself when it is not a special biome.
   *
   * The roll is per WORLD SEED, and the biome coordinate cache is not: it can be
   * preloaded from BiomesMap.json, a snapshot exported from whichever world was
   * being playtested, so the specials frozen into it belong to THAT world and
   * not to the one being played. Reading them back as-is is how a square could
   * be reported as SpiritWoods everywhere the cache is consulted while the map
   * actually generated on entry - which rolls live - came out plain Forest.
   * Unwrapping first lets the roll be made again for the world in hand.
   *
   * Only unwrapped where the parent is unambiguous. Crystals is reachable from
   * four different cold biomes, so a cached Crystals square cannot say which one
   * it came from and keeps the name it has.
   */
  let _specialParent = null;
  function unwrapSpecialBiome(biomeName) {
    if (!biomeName) return biomeName;
    if (!_specialParent) {
      const parents = new Map();
      for (const biome of Biomes) {
        for (const special of biome.specialBiomes || []) {
          const seen = parents.get(special);
          if (seen === undefined) parents.set(special, biome.name);
          else if (seen !== biome.name) parents.set(special, null); // ambiguous
        }
      }
      _specialParent = parents;
    }
    return _specialParent.get(biomeName) || biomeName;
  }

  /**
   * Resolve the effective biome for a world tile, applying the specialBiomes
   * override (e.g. Forest -> SpiritWoods, Snow -> Crystals).
   *
   * This is the single source of truth for the roll. The map generator, the
   * world-coordinate lookup that feeds the travel HUD, and the debug tile
   * overlay all call it, so the name shown on the tile, the name shown in the
   * HUD, and the map actually built on entry can never disagree.
   *
   * Deterministic for a given (world seed, x, y): 25% chance to swap to one of
   * the parent biome's specialBiomes entries.
   *
   * @returns {string} the special biome name, or baseBiomeName when no override applies
   */
  function resolveSpecialBiome(baseBiomeName, originX, originY) {
    const biome = getBiomeByName(baseBiomeName);
    if (!biome || !biome.specialBiomes || biome.specialBiomes.length === 0) {
      return baseBiomeName;
    }

    const coordinateSeed = hashCoords(getWorldSeed() ^ 0x9e37, originX, originY);
    const rng = createSeededRandom(coordinateSeed);

    if (rng() < 0.25) {
      const specialBiomeName =
        biome.specialBiomes[Math.floor(rng() * biome.specialBiomes.length)];
      // Fall back to the parent when the variant has no biome definition.
      if (getBiomeByName(specialBiomeName)) return specialBiomeName;
    }

    return baseBiomeName;
  }

  /**
   * Get random element from array using seeded RNG
   */
  function randomChoice(array, rng) {
    if (array.length === 0) return 0;
    return array[Math.floor(rng() * array.length)];
  }

  // ===== HELPER FUNCTIONS =====

  /**
   * Normalize biome name for edge detection
   */
  function normalizeBiomeForEdge(biomeName) {
    if (biomeName && biomeName.startsWith("Road ")) {
      return "Road";
    }
    return biomeName;
  }

  /**
   * Check if a world coordinate has a non-procedural destination.
   *
   * A WorkSystem/Destinations.json entry can name two different doors onto a
   * hand-authored map: `coords` (direction/id/x/y/mapCoord, one door per side
   * of the town's footprint) and a single fixed `entrance` {id,x,y,direction}.
   *
   * WHICH SQUARES BELONG TO THE TOWN is `reservedTiles` plus the squares the
   * entry names outright: every `coords` mapCoord, and `base`. Those two are
   * reserved whether or not anyone remembered to list them. Leaving `base` out
   * is how a town whose reservedTiles were never written - Frozen Station names
   * an entrance and nothing else - had its own square generated as a procedural
   * village of the same name, standing right next to the authored map it is
   * supposed to be.
   *
   * A base is only claimed when the entry really has a door: a procedural town
   * names a base like any other entry, and its base is where its map is
   * GENERATED, not a way in. A `reservedTiles` footprint keeps the older rule
   * and is a square the window may not stitch whether there is a door on it or
   * not, which is what keeps a procedural town whole.
   *
   * WHICH DOOR, in order: the `coords` entry for this very square on the side
   * being crossed, then the entry for that side wherever it stands (a town is
   * entered by the door on the side you walk in from, whichever of its squares
   * you walked into), then the fixed `entrance`, then any door at all. Coords
   * therefore take precedence over the base entrance, which is the whole point
   * of writing one door per side.
   */
  function getNonProceduralDestination(worldX, worldY, exitDirection) {
    const destinations = window.WorkSystem && window.WorkSystem.Destinations;
    if (!destinations) return { exists: false, destination: null };

    const directionNames = { 2: "south", 4: "west", 6: "east", 8: "north" };
    const direction = directionNames[exitDirection] || null;
    const mapCoord = worldX + "," + worldY;
    const doorOf = (c) => ({ mapId: c.id, x: c.x, y: c.y });

    for (const location of Object.values(destinations)) {
      const coords = Array.isArray(location.coords)
        ? location.coords.filter((c) => c && c.id)
        : [];
      const entrance = (location.entrance && location.entrance.id) ? location.entrance : null;
      const hasDoor = coords.length > 0 || !!entrance;

      const onCoords = coords.some((c) => c.mapCoord === mapCoord);
      const onReserved =
        Array.isArray(location.reservedTiles) &&
        location.reservedTiles.includes(mapCoord);
      const onBase = hasDoor && !!location.base &&
        (location.base.x + "," + location.base.y) === mapCoord;
      if (!onCoords && !onReserved && !onBase) continue;

      const here = coords.filter((c) => c.mapCoord === mapCoord);
      const door =
        (direction && here.find((c) => c.direction === direction)) ||
        (direction && coords.find((c) => c.direction === direction)) ||
        null;
      if (door) return { exists: true, destination: doorOf(door) };
      if (entrance) {
        return {
          exists: true,
          destination: { mapId: entrance.id, x: entrance.x, y: entrance.y, direction: Number(entrance.direction) || 0 },
        };
      }
      if (here.length || coords.length) {
        return { exists: true, destination: doorOf(here[0] || coords[0]) };
      }
      // A footprint with no door at all: the square is still the town's, so the
      // window leaves it alone, but there is nowhere to be sent.
      return { exists: true, destination: null };
    }

    return { exists: false, destination: null };
  }

  // ===== NOISE FUNCTIONS =====

  /**
   * Perlin-style noise function for terrain generation
   */
  function noise2D(x, y, seed = 0) {
    const n = x + y * 57 + seed * 131;
    let noise = (n << 13) ^ n;
    return (
      1.0 -
      ((noise * (noise * noise * 15731 + 789221) + 1376312589) & 0x7fffffff) /
      1073741824.0
    );
  }

  /**
   * Smooth noise with interpolation
   */
  function smoothNoise(x, y, seed) {
    const corners =
      (Cache.getNoise(x - 1, y - 1, seed) +
        Cache.getNoise(x + 1, y - 1, seed) +
        Cache.getNoise(x - 1, y + 1, seed) +
        Cache.getNoise(x + 1, y + 1, seed)) /
      16;
    const sides =
      (Cache.getNoise(x - 1, y, seed) +
        Cache.getNoise(x + 1, y, seed) +
        Cache.getNoise(x, y - 1, seed) +
        Cache.getNoise(x, y + 1, seed)) /
      8;
    const center = Cache.getNoise(x, y, seed) / 4;
    return corners + sides + center;
  }

  // ===== COORDINATE MANAGEMENT =====

  /**
   * Calculate tile index in map data array
   */
  function calculateIndex(x, y, z, width, height) {
    return z * width * height + y * width + x;
  }

  /**
   * Get adjacent biomes on world map (north, south, east, west)
   */
  function getAdjacentBiomesOnWorldMap(originX, originY) {
    const adjacent = { north: null, south: null, east: null, west: null };

    if ($gameMap.mapId() !== WORLD_MAP_ID) {
      return adjacent;
    }

    const mapW = $gameMap.width();
    const mapH = $gameMap.height();

    const dirs = [
      ["north", 0, -1, () => originY > 0],
      ["south", 0, 1, () => originY < mapH - 1],
      ["east", 1, 0, () => originX < mapW - 1],
      ["west", -1, 0, () => originX > 0],
    ];

    dirs.forEach(([key, dx, dy, isValid]) => {
      if (isValid()) {
        const tx = originX + dx;
        const ty = originY + dy;
        const tileId = [0, 1, 2, 3].reduce(
          (acc, z) => acc || $gameMap.tileId(tx, ty, z),
          0
        );
        const biomeName = getBiomeForWorldTile(tileId);
        adjacent[key] = biomeName;
      }
    });

    log(`[getAdjacentBiomesOnWorldMap] At (${originX}, ${originY}): N=${adjacent.north}, S=${adjacent.south}, E=${adjacent.east}, W=${adjacent.west}`);
    return adjacent;
  }

  /**
   * Get adjacent biome names from cache
   */
  function getAdjacentBiomesFromCache(worldX, worldY, cache) {
    const adjacent = {
      north: null,
      south: null,
      east: null,
      west: null,
    };

    if (!cache || Object.keys(cache).length === 0) {
      return adjacent;
    }

    const mapWidth = 512;
    const mapHeight = 512;

    // O(1) lookups via the inverted index (first biome wins, matching the
    // previous Object.entries scan order).
    const index = getBiomeFallbackIndex(cache);

    // Check only immediate cardinal neighbors
    if (worldY > 0) {
      const b = index.get(worldX * 100000 + (worldY - 1));
      if (b) adjacent.north = b;
    }

    if (worldY < mapHeight - 1) {
      const b = index.get(worldX * 100000 + (worldY + 1));
      if (b) adjacent.south = b;
    }

    if (worldX < mapWidth - 1) {
      const b = index.get((worldX + 1) * 100000 + worldY);
      if (b) adjacent.east = b;
    }

    if (worldX > 0) {
      const b = index.get((worldX - 1) * 100000 + worldY);
      if (b) adjacent.west = b;
    }

    return adjacent;
  }

  // ===== UNDERGROUND BORDER CONNECTIONS =====
  //
  // A lower layer used to be a sealed 64x64 box: every underground square walled
  // itself in on all four sides, so the only way out of a cave was back up the
  // shaft the party came down. Underground is now as connected as the surface --
  // every side whose neighbour has an underground of its own is opened by a
  // passage, and there is always at least one passage per open side.
  //
  // The two squares that share a border have to cut that passage in the SAME
  // place, and neither can see the other's tiles: each is generated on its own,
  // from the world seed and its own coordinates. So the passage is derived from
  // the BORDER rather than from either square -- named by the square on its
  // north/west side plus the axis it runs along, which both neighbours spell
  // identically -- and the two mouths line up.

  // Rock band the underground generators wall their square in with. A passage is
  // cut through the whole band, out to the outermost ring, so the party can
  // stand on the border tile the crossing rule watches for.
  const UNDERGROUND_BORDER_THICKNESS = 5;
  const UNDERGROUND_PASSAGE_MIN_WIDTH = 5;
  const UNDERGROUND_PASSAGE_MAX_WIDTH = 9;
  // Keeps a mouth off the corners, where two passages meeting inside the border
  // band would open a diagonal gap nothing can walk through.
  const UNDERGROUND_PASSAGE_MARGIN = 8;

  /**
   * True for the sea floor under an ocean square, however it is spelled
   * (Biomes.json says "SeaBed", plenty of call sites say "Seabed").
   */
  function isSeabedBiomeName(name) {
    return (
      typeof name === "string" &&
      name.replace(/[\s_-]+/g, "").toLowerCase() === "seabed"
    );
  }

  /**
   * Is the side facing `neighbourName` walled off rather than opened?
   *
   * Two reasons to wall it: the neighbour has no lower layer at all, so there is
   * nothing on the other side to walk into; or what it has is the sea floor,
   * which is open water held back by rock. A passage into the seabed would be a
   * hole in the bottom of the sea, so both sides keep their wall -- the seabed
   * generator seals against the cave in the same breath.
   *
   * A neighbour nobody can name (off the world map, missing from the coordinate
   * cache, not in the biome table) is left OPEN: underground squares are the
   * rule and the seabed the exception, so guessing "open" agrees with the
   * neighbour far more often than guessing "sealed" does.
   */
  function isUndergroundSideSealed(neighbourName) {
    if (!neighbourName) return false;
    // Already a lower-layer name: a descent hands the generator the biome it is
    // descending into rather than the surface around it.
    if (isSeabedBiomeName(neighbourName)) return true;
    const biome = getBiomeByName(normalizeBiomeForEdge(neighbourName));
    if (!biome) return false;
    if (!biome.lowerLayer) return true;
    return isSeabedBiomeName(biome.lowerLayer);
  }

  /**
   * The neighbour names an underground square must decide its borders from.
   *
   * What a square becomes one layer down is decided by its SURFACE biome's
   * lowerLayer, so the names that matter are the surface ones around it. An edge
   * crossing hands those in already, but a descent (goDown, a dungeon door) does
   * not: it repeats the biome being descended into on all four sides, having no
   * reason to look the real neighbours up. Reading the coordinate cache instead
   * is what stops a cave dug under a coast from opening into the sea floor.
   *
   * The cache is Earth's, so it is not consulted on an alien planet: those grid
   * coordinates are planet-local and would collide with real world-map squares.
   */
  function undergroundNeighbourNames(worldCoords, adjacentBiomes, cache) {
    const fallback = adjacentBiomes || {};
    const pg = typeof $gameSystem !== "undefined" && $gameSystem
      ? $gameSystem._procGenData : null;
    if (!worldCoords || !cache || (pg && pg.alienGrid)) return fallback;

    const cached = getAdjacentBiomesFromCache(
      Math.floor(worldCoords.x || 0),
      Math.floor(worldCoords.y || 0),
      cache
    );
    return {
      north: cached.north || fallback.north || null,
      south: cached.south || fallback.south || null,
      east: cached.east || fallback.east || null,
      west: cached.west || fallback.west || null,
    };
  }

  /**
   * Where each side of an underground square opens onto its neighbour.
   *
   * Returns { north, south, east, west }, each either null (that side stays
   * sealed) or { start, end } -- the inclusive tile range the passage occupies
   * along that side, in x for north/south and in y for east/west.
   *
   * @param {Object} worldCoords    {x, y} of the square on the world map
   * @param {Object} adjacentBiomes {north, south, east, west} neighbour names
   * @param {number} depth          layer depth, so each layer connects its own way
   */
  function undergroundBorderOpenings(worldCoords, adjacentBiomes, depth, width, height) {
    const openings = { north: null, south: null, east: null, west: null };
    if (!worldCoords) return openings;

    const wx = Math.floor(worldCoords.x || 0);
    const wy = Math.floor(worldCoords.y || 0);
    const adj = adjacentBiomes || {};
    const d = depth | 0;

    // Each border named by the square north/west of it, so both neighbours name
    // it the same way: the north border of (x, y) IS the south border of
    // (x, y-1). The salt separates the horizontal border of a square from its
    // vertical one.
    const sides = [
      ["north", wx, wy, 0x4e, width],
      ["south", wx, wy + 1, 0x4e, width],
      ["west", wx, wy, 0x57, height],
      ["east", wx + 1, wy, 0x57, height],
    ];

    for (const [dir, ex, ey, salt, span] of sides) {
      if (isUndergroundSideSealed(adj[dir])) continue;

      const rng = createSeededRandom(procMapSeed(ex, ey, d, salt));
      const passageWidth =
        UNDERGROUND_PASSAGE_MIN_WIDTH +
        Math.floor(rng() * (UNDERGROUND_PASSAGE_MAX_WIDTH - UNDERGROUND_PASSAGE_MIN_WIDTH + 1));
      const margin = Math.min(
        UNDERGROUND_PASSAGE_MARGIN,
        Math.max(0, Math.floor((span - passageWidth) / 2))
      );
      const room = Math.max(1, span - 2 * margin - passageWidth);
      const start = Math.max(0, Math.min(span - passageWidth, margin + Math.floor(rng() * room)));
      openings[dir] = { start, end: Math.min(span - 1, start + passageWidth - 1) };
    }

    return openings;
  }

  /**
   * Check biome composition at the borders of an adjacent world map tile (cardinal directions only)
   */
  function checkAdjacentMapBiomesFromCache(worldX, worldY, cache) {
    const mapW = $gameMap.mapId() === 315 ? $gameMap.width() : 512;
    const mapH = $gameMap.mapId() === 315 ? $gameMap.height() : 512;
    const borderBiomes = { north: [], south: [], east: [], west: [] };

    if (!cache || Object.keys(cache).length === 0) return borderBiomes;

    // Check only immediate cardinal neighbors
    const checks = [
      [worldY > 0, worldX, worldY - 1, "north"],
      [worldY < mapH - 1, worldX, worldY + 1, "south"],
      [worldX < mapW - 1, worldX + 1, worldY, "east"],
      [worldX > 0, worldX - 1, worldY, "west"],
    ];

    const index = getBiomeMultiIndex(cache);
    for (const [isValid, checkX, checkY, dir] of checks) {
      if (!isValid) continue;
      const biomes = index.get(checkX * 100000 + checkY);
      if (biomes) borderBiomes[dir] = biomes.slice();
    }
    return borderBiomes;
  }

  /**
   * Check biome composition at the diagonal neighbors of a world map tile
   * Returns object with diagonal biome arrays: topLeft, topRight, bottomLeft, bottomRight
   */
  function checkDiagonalMapBiomesFromCache(worldX, worldY, cache) {
    const mapW = $gameMap.mapId() === 315 ? $gameMap.width() : 512;
    const mapH = $gameMap.mapId() === 315 ? $gameMap.height() : 512;
    const diagonalBiomes = {
      topLeft: [],
      topRight: [],
      bottomLeft: [],
      bottomRight: [],
    };

    if (!cache || Object.keys(cache).length === 0) return diagonalBiomes;

    // Check diagonal neighbors
    const diagonalChecks = [
      [worldX > 0 && worldY > 0, worldX - 1, worldY - 1, "topLeft"],
      [worldX < mapW - 1 && worldY > 0, worldX + 1, worldY - 1, "topRight"],
      [worldX > 0 && worldY < mapH - 1, worldX - 1, worldY + 1, "bottomLeft"],
      [worldX < mapW - 1 && worldY < mapH - 1, worldX + 1, worldY + 1, "bottomRight"],
    ];

    const index = getBiomeMultiIndex(cache);
    for (const [isValid, checkX, checkY, dir] of diagonalChecks) {
      if (!isValid) continue;
      const biomes = index.get(checkX * 100000 + checkY);
      if (biomes) diagonalBiomes[dir] = biomes.slice();
    }
    return diagonalBiomes;
  }

  /**
   * Check if a tile ID is a water tile
   * This is a simple utility used by feature placement functions
   */
  function isWaterTileId(tileId, waterTileSet) {
    if (!tileId || tileId === 0 || !waterTileSet) {
      return false;
    }
    return waterTileSet.has(tileId);
  }

  /**
   * Get a random feature variant from a feature array
   * Handles both single-tile and multi-tile variants
   */
  function getRandomFeatureVariant(featureArray, rng) {
    if (!featureArray || featureArray.length === 0) return null;

    const variant = randomChoice(featureArray, rng);
    return variant;
  }

  /**
   * Check if a tile position is already occupied by a feature on the current layer
   * Returns true if the tile is occupied, false if it's empty
   */
  function isTileOccupiedOnLayer(mapData, x, y, layer, width, height) {
    // Only check the same layer being filled for occupation
    const idx = calculateIndex(x, y, layer, width, height);
    return mapData[idx] !== 0;
  }

  // How wide a band at the edge of a square stays clear of scattered
  // decoration. Only TERRAIN (the `terrain: true` features the ground itself is
  // made of) is drawn right up to a border. A tree, a rock or a prop on the last
  // row is an object the neighbouring square knows nothing about, so it reads as
  // half a thing at the seam of a stitched window and as a lonely stump the
  // moment the party crosses by the old fade. One tile is enough to hide both,
  // and a 5%-density scatter passes over it without leaving a visible lane.
  const FEATURE_EDGE_MARGIN = 1;

  function isFeatureEdge(x, y, width, height) {
    return x < FEATURE_EDGE_MARGIN || y < FEATURE_EDGE_MARGIN ||
      x >= width - FEATURE_EDGE_MARGIN || y >= height - FEATURE_EDGE_MARGIN;
  }

  /**
   * Place a multi-tile feature on the map
   * Checks water collision, beach placement, path tiles, occupied tiles, and bounds
   * Avoids placing if any tile would overlap water, beach, path tiles, or existing features
   * IMPORTANT: Never overwrites Path, PathDesert, or PathIce tiles
   */
  function placeMultiTileFeature(
    mapData,
    grid,
    startX,
    startY,
    layer,
    width,
    height,
    waterTileSet,
    pathTileSet,
    blockedMask
  ) {
    const beachCoordinates = window.ProcGenUtils?.beachCoordinates;

    // Check if placement is valid (no water collision, no beach, no path tiles, no occupied tiles, and within bounds)
    for (let gy = 0; gy < grid.length; gy++) {
      const row = grid[gy];
      for (let gx = 0; gx < row.length; gx++) {
        const mapX = startX + gx;
        const mapY = startY + gy;

        // Check bounds, edge band included: no part of a decorative footprint
        // may touch the border of the square (see FEATURE_EDGE_MARGIN).
        if (isFeatureEdge(mapX, mapY, width, height)) {
          return false;
        }

        // Caller-supplied no-build zone (e.g. the road keep-out margin)
        if (blockedMask && blockedMask[mapY * width + mapX]) {
          return false;
        }

        // Check if base layer has water
        const baseIdx = calculateIndex(mapX, mapY, 0, width, height);
        const baseTile = mapData[baseIdx];

        if (isWaterTileId(baseTile, waterTileSet)) {
          return false;
        }

        // Check if on beach
        if (beachCoordinates && beachCoordinates.has(`${mapX},${mapY}`)) {
          return false;
        }

        // NEVER overwrite path tiles (Path, PathDesert, PathIce)
        if (pathTileSet && pathTileSet.has(baseTile)) {
          return false;
        }

        // Check if tile is already occupied by a feature on the same layer
        const occupiedIdx = calculateIndex(mapX, mapY, layer, width, height);
        if (mapData[occupiedIdx] !== 0) {
          return false;
        }
      }
    }

    // Placement is valid, place all tiles
    for (let gy = 0; gy < grid.length; gy++) {
      const row = grid[gy];
      for (let gx = 0; gx < row.length; gx++) {
        const mapX = startX + gx;
        const mapY = startY + gy;
        const idx = calculateIndex(mapX, mapY, layer, width, height);
        mapData[idx] = row[gx];
      }
    }

    return true;
  }

  /**
   * Generate noise features while avoiding water tiles and path tiles
   * Supports both single-tile and multi-tile feature variants
   * IMPORTANT: Never overwrites Path, PathDesert, or PathIce tiles
   */
  function generateFeatureNoise(
    mapData,
    featureVariants,
    layer,
    width,
    height,
    seed,
    threshold,
    rng,
    waterTiles,
    pathTiles,
    blockedMask
  ) {
    return runSteps(generateFeatureNoiseSteps(
      mapData, featureVariants, layer, width, height, seed, threshold, rng,
      waterTiles, pathTiles, blockedMask
    ));
  }

  function* generateFeatureNoiseSteps(
    mapData,
    featureVariants,
    layer,
    width,
    height,
    seed,
    threshold,
    rng,
    waterTiles,
    pathTiles,
    blockedMask
  ) {
    const scale = 0.05;
    const waterTileSet = waterTiles ? new Set(waterTiles) : null;
    const pathTileSet = pathTiles ? new Set(pathTiles) : null;
    const beachCoordinates = window.ProcGenUtils?.beachCoordinates;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (blockedMask && blockedMask[y * width + x]) continue;
        if (isFeatureEdge(x, y, width, height)) continue;
        const noiseValue = smoothNoise(x * scale, y * scale, seed);
        if (noiseValue > threshold) {
          const baseIdx = calculateIndex(x, y, 0, width, height);
          const baseTile = mapData[baseIdx];

          // Skip water tiles, beach tiles, and path tiles
          if (!isWaterTileId(baseTile, waterTileSet) &&
            !(beachCoordinates && beachCoordinates.has(`${x},${y}`)) &&
            !(pathTileSet && pathTileSet.has(baseTile))) {
            const variant = getRandomFeatureVariant(featureVariants, rng);

            if (variant) {
              if (variant.type === "single") {
                // Check if this tile is already occupied by a feature on the same layer
                if (!isTileOccupiedOnLayer(mapData, x, y, layer, width, height)) {
                  const idx = calculateIndex(x, y, layer, width, height);
                  mapData[idx] = variant.tileId;
                }
              } else if (variant.type === "grid") {
                placeMultiTileFeature(
                  mapData,
                  variant.grid,
                  x,
                  y,
                  layer,
                  width,
                  height,
                  waterTileSet,
                  pathTileSet,
                  blockedMask
                );
              }
            }
          }
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
  }

  /**
   * Generate scattered features (trees, rocks, etc) with seeded RNG
   * Supports both single-tile and multi-tile feature variants
   * IMPORTANT: Never overwrites Path, PathDesert, or PathIce tiles
   */
  function generateFeatureScattered(
    mapData,
    featureVariants,
    layer,
    width,
    height,
    seed,
    density,
    rng,
    waterTiles,
    pathTiles,
    blockedMask
  ) {
    return runSteps(generateFeatureScatteredSteps(
      mapData, featureVariants, layer, width, height, seed, density, rng,
      waterTiles, pathTiles, blockedMask
    ));
  }

  function* generateFeatureScatteredSteps(
    mapData,
    featureVariants,
    layer,
    width,
    height,
    seed,
    density,
    rng,
    waterTiles,
    pathTiles,
    blockedMask
  ) {
    const waterTileSet = waterTiles ? new Set(waterTiles) : null;
    const pathTileSet = pathTiles ? new Set(pathTiles) : null;
    const beachCoordinates = window.ProcGenUtils?.beachCoordinates;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (blockedMask && blockedMask[y * width + x]) continue;
        if (rng() < density) {
          // The border band takes no decoration. Tested AFTER the draw so the
          // seeded stream stays the one every square was ever built with.
          if (isFeatureEdge(x, y, width, height)) continue;
          const baseIdx = calculateIndex(x, y, 0, width, height);
          const baseTile = mapData[baseIdx];

          // Skip water tiles, beach tiles, and path tiles
          if (!isWaterTileId(baseTile, waterTileSet) &&
            !(beachCoordinates && beachCoordinates.has(`${x},${y}`)) &&
            !(pathTileSet && pathTileSet.has(baseTile))) {
            const variant = getRandomFeatureVariant(featureVariants, rng);

            if (variant) {
              if (variant.type === "single") {
                // Check if this tile is already occupied by a feature on the same layer
                if (!isTileOccupiedOnLayer(mapData, x, y, layer, width, height)) {
                  const idx = calculateIndex(x, y, layer, width, height);
                  mapData[idx] = variant.tileId;
                }
              } else if (variant.type === "grid") {
                placeMultiTileFeature(
                  mapData,
                  variant.grid,
                  x,
                  y,
                  layer,
                  width,
                  height,
                  waterTileSet,
                  pathTileSet,
                  blockedMask
                );
              }
            }
          }
        }
      }
      if (y % STEP_ROWS === STEP_ROWS - 1) yield;
    }
  }

  /**
   * Fractional Brownian Motion for complex coastline patterns
   * Creates jagged, realistic coastlines by layering multiple noise octaves
   */
  function fbmNoise(x, y, seed, octaves = 4, lacunarity = 2.0, persistence = 0.6) {
    let amplitude = 1.0;
    let frequency = 1.0;
    let value = 0.0;
    let maxValue = 0.0;

    for (let i = 0; i < octaves; i++) {
      value += smoothNoise(x * frequency, y * frequency, seed + i * 1000) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }



  /**
   * Drunken walk cave carving algorithm
   * Fills a map with walls then carves passages using random walk
   */
  function generateCaveWithDrunkenWalk(width, height, tileWidth, tileCarvingPercentage, seed, caveFloorTile, caveCeilingTile) {
    const rng = createSeededRandom(seed);

    // Calculate number of steps to carve based on percentage
    const totalTiles = width * height;
    const targetCarvedTiles = Math.floor(totalTiles * tileCarvingPercentage);
    let carvedCount = 0;

    // Create a boolean grid to track carved areas
    const carved = Array(height).fill(null).map(() => Array(width).fill(false));

    // Start from a random position
    let x = Math.floor(rng() * width);
    let y = Math.floor(rng() * height);

    // Directions: up, down, left, right
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 }   // right
    ];

    // Drunken walk
    while (carvedCount < targetCarvedTiles) {
      // Randomly choose a direction
      const dir = directions[Math.floor(rng() * directions.length)];

      // Take a step
      x = (x + dir.dx + width) % width;
      y = (y + dir.dy + height) % height;

      // Mark as carved if not already
      if (!carved[y][x]) {
        carved[y][x] = true;
        carvedCount++;
      }
    }

    // Create the map data array (4 layers)
    const mapData = new Array(tileWidth * height * 4);
    mapData.fill(0);

    // Fill the map with wall/floor tiles based on carved areas
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileValue = carved[ty][tx] ? caveFloorTile : caveCeilingTile;

        // Layer 0 (main terrain)
        mapData[calculateIndex(tx, ty, 0, width, height)] = tileValue;
      }
    }

    return mapData;
  }

  /**
   * Cellular automata cave generation algorithm
   * Creates cave systems using cellular automata rules - ideal for flooded caves with natural caverns
   * Starts with ~50% random floor tiles and iterates rules to create connected chambers
   */
  function generateCaveWithCellularAutomata(width, height, tileWidth, seed, caveFloorTile, caveCeilingTile) {
    const rng = createSeededRandom(seed);
    const iterations = 4;  // Number of cellular automata iterations
    const initialFloorChance = 0.48;  // Initial floor probability

    // Initialize grid with random floor/wall tiles
    let grid = Array(height).fill(null).map(() =>
      Array(width).fill(null).map(() => rng() < initialFloorChance)
    );

    // Apply cellular automata rules for specified iterations
    for (let iter = 0; iter < iterations; iter++) {
      const newGrid = Array(height).fill(null).map(() => Array(width).fill(false));

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Count floor neighbors (including diagonals)
          let floorNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;  // Skip self
              const ny = (y + dy + height) % height;
              const nx = (x + dx + width) % width;
              if (grid[ny][nx]) floorNeighbors++;
            }
          }

          // Apply cellular automata rules
          // A tile becomes floor if it has 4+ floor neighbors, otherwise wall
          // This creates connected cave systems
          newGrid[y][x] = floorNeighbors >= 4;
        }
      }

      grid = newGrid;
    }

    // Create the map data array (4 layers)
    const mapData = new Array(tileWidth * height * 4);
    mapData.fill(0);

    // Fill the map with wall/floor tiles
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileValue = grid[ty][tx] ? caveFloorTile : caveCeilingTile;
        mapData[calculateIndex(tx, ty, 0, width, height)] = tileValue;
      }
    }

    return mapData;
  }

  /**
   * Voronoi diagram cave generation algorithm
   * Creates cave systems using Voronoi diagrams - ideal for ice caves with geometric chambers
   * Generates seed points and carves floor tiles near those points, creating distinct chambers
   * Also carves diagonal geometric tunnels connecting nearby rooms for traversability
   * Ensures tunnels reach open map edges for global connectivity
   */
  function generateCaveWithVoronoi(width, height, tileWidth, seed, caveFloorTile, caveCeilingTile) {
    const rng = createSeededRandom(seed);
    const numSeeds = Math.floor(width * height / 1500);  // Roughly 1 chamber per 1500 tiles
    const carvingThreshold = 5.5;  // Distance threshold for carving (lower = more carving)
    const tunnelWidth = 1.5;  // Width of connecting tunnels

    // Generate random seed points
    const seeds = [];
    for (let i = 0; i < numSeeds; i++) {
      seeds.push({
        x: Math.floor(rng() * width),
        y: Math.floor(rng() * height),
        index: i
      });
    }

    // Create the map data array (4 layers)
    const mapData = new Array(tileWidth * height * 4);
    mapData.fill(0);

    // For each tile, find nearest seed and determine if it should be carved
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        let minDistance = Infinity;

        // Find distance to nearest seed point
        for (const seed of seeds) {
          const dx = tx - seed.x;
          const dy = ty - seed.y;
          // Use toroidal wrapping for seamless maps
          const wrappedDx = Math.min(Math.abs(dx), width - Math.abs(dx));
          const wrappedDy = Math.min(Math.abs(dy), height - Math.abs(dy));
          const distance = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);

          if (distance < minDistance) {
            minDistance = distance;
          }
        }

        // Carve if close to a seed point (creating Voronoi cells)
        const tileValue = minDistance <= carvingThreshold ? caveFloorTile : caveCeilingTile;
        mapData[calculateIndex(tx, ty, 0, width, height)] = tileValue;
      }
    }

    // Carve diagonal tunnels connecting nearby rooms
    // Build adjacency graph of nearest neighbors for each seed
    for (let i = 0; i < seeds.length; i++) {
      const currentSeed = seeds[i];
      const neighbors = [];

      // Find closest neighbors to this seed
      for (let j = 0; j < seeds.length; j++) {
        if (i === j) continue;

        const otherSeed = seeds[j];
        const dx = otherSeed.x - currentSeed.x;
        const dy = otherSeed.y - currentSeed.y;
        // Use toroidal distance
        const wrappedDx = Math.abs(dx) < width / 2 ? dx : (dx > 0 ? dx - width : dx + width);
        const wrappedDy = Math.abs(dy) < height / 2 ? dy : (dy > 0 ? dy - height : dy + height);
        const distance = Math.sqrt(wrappedDx * wrappedDx + wrappedDy * wrappedDy);

        neighbors.push({ seed: otherSeed, distance });
      }

      // Sort by distance and keep only closest neighbors
      neighbors.sort((a, b) => a.distance - b.distance);
      // Connect to more neighbors for denser tunnel networks (4-6 instead of 2-3)
      const maxConnections = Math.min(6, Math.ceil(seeds.length / 4));
      const closestNeighbors = neighbors.slice(0, maxConnections);

      // Carve tunnels to closest neighbors (only from lower-index seeds to avoid duplicates)
      for (const neighbor of closestNeighbors) {
        if (i < neighbor.seed.index) {
          carveDiagonalTunnel(
            mapData,
            currentSeed.x,
            currentSeed.y,
            neighbor.seed.x,
            neighbor.seed.y,
            width,
            height,
            caveFloorTile,
            tunnelWidth
          );
        }
      }

      // Add random cross-tunnels to increase connectivity (30% chance per seed)
      if (rng() < 0.3 && neighbors.length > maxConnections) {
        // Pick a random neighbor that wasn't already connected
        const unconnectedNeighbors = neighbors.slice(maxConnections);
        const randomNeighbor = unconnectedNeighbors[Math.floor(rng() * unconnectedNeighbors.length)];

        if (randomNeighbor) {
          carveDiagonalTunnel(
            mapData,
            currentSeed.x,
            currentSeed.y,
            randomNeighbor.seed.x,
            randomNeighbor.seed.y,
            width,
            height,
            caveFloorTile,
            tunnelWidth
          );
        }
      }
    }


    return mapData;
  }

  /**
   * Carve a diagonal tunnel between two points using line rasterization
   * Creates a geometric passage between rooms with specified width
   */
  function carveDiagonalTunnel(mapData, x1, y1, x2, y2, width, height, floorTile, tunnelWidth) {
    // Handle toroidal wrapping - choose shortest path
    let dx = x2 - x1;
    let dy = y2 - y1;

    if (Math.abs(dx) > width / 2) {
      dx = dx > 0 ? dx - width : dx + width;
    }
    if (Math.abs(dy) > height / 2) {
      dy = dy > 0 ? dy - height : dy + height;
    }

    // Calculate actual end point considering wrapping
    let endX = (x1 + dx + width) % width;
    let endY = (y1 + dy + height) % height;

    // Use Bresenham-like line algorithm to carve the tunnel
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return;

    for (let step = 0; step <= steps; step++) {
      const t = steps > 0 ? step / steps : 0;
      const currentX = Math.round(x1 + dx * t);
      const currentY = Math.round(y1 + dy * t);

      // Carve a small area around the tunnel line
      const radius = Math.ceil(tunnelWidth);
      for (let ty = currentY - radius; ty <= currentY + radius; ty++) {
        for (let tx = currentX - radius; tx <= currentX + radius; tx++) {
          // Wrap coordinates toroidally
          const wrappedX = (tx % width + width) % width;
          const wrappedY = (ty % height + height) % height;
          const distance = Math.sqrt((tx - currentX) ** 2 + (ty - currentY) ** 2);

          // Carve with falloff for smooth tunnel edges
          if (distance <= tunnelWidth) {
            const idx = calculateIndex(wrappedX, wrappedY, 0, width, height);
            mapData[idx] = floorTile;
          }
        }
      }
    }
  }

  /**
   * Smooth cave ceiling mask before wall placement:
   * - Fills 1-tile holes in rock mass (floor surrounded by >= 3 ceiling neighbors)
   * - Prunes 1-tile thin ceiling ridges/spikes and floating diagonal strands
   * - Prunes 1-tile thin horizontal/vertical ceiling slivers (floor on both N and S, or both E and W)
   */
  function smoothCaveCeilingMask(mapData, width, height, caveCeilingTile, caveFloorTile, borderThickness = 3) {
    if (!mapData || width <= 0 || height <= 0) return;

    // Pass 1: Fill enclosed 1-tile floor holes inside solid rock
    for (let y = borderThickness; y < height - borderThickness; y++) {
      for (let x = borderThickness; x < width - borderThickness; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (mapData[idx] === caveFloorTile) {
          let cCount = 0;
          if (mapData[calculateIndex(x + 1, y, 0, width, height)] === caveCeilingTile) cCount++;
          if (mapData[calculateIndex(x - 1, y, 0, width, height)] === caveCeilingTile) cCount++;
          if (mapData[calculateIndex(x, y + 1, 0, width, height)] === caveCeilingTile) cCount++;
          if (mapData[calculateIndex(x, y - 1, 0, width, height)] === caveCeilingTile) cCount++;
          if (cCount >= 3) {
            mapData[idx] = caveCeilingTile;
          }
        }
      }
    }

    // Pass 2: Remove 1-tile thin ceiling ridges, slivers and diagonal strands
    for (let iter = 0; iter < 2; iter++) {
      for (let y = borderThickness; y < height - borderThickness; y++) {
        for (let x = borderThickness; x < width - borderThickness; x++) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (mapData[idx] === caveCeilingTile) {
            const east = mapData[calculateIndex(x + 1, y, 0, width, height)] === caveCeilingTile;
            const west = mapData[calculateIndex(x - 1, y, 0, width, height)] === caveCeilingTile;
            const south = mapData[calculateIndex(x, y + 1, 0, width, height)] === caveCeilingTile;
            const north = mapData[calculateIndex(x, y - 1, 0, width, height)] === caveCeilingTile;

            const cCount = (east ? 1 : 0) + (west ? 1 : 0) + (south ? 1 : 0) + (north ? 1 : 0);

            // Ceiling with fewer than 2 orthogonal ceiling neighbors is a floating strand or isolated spike
            if (cCount < 2) {
              mapData[idx] = caveFloorTile;
            } else if ((north && south && !east && !west) || (east && west && !north && !south)) {
              // 1-tile thin bridge in open space -> prune to prevent blocking
              mapData[idx] = caveFloorTile;
            }
          }
        }
      }
    }
  }

  /**
   * SHADOW PEN (layer 4)
   *
   * RPG Maker draws the little half-tile shadow itself: paint a wall in the
   * editor and it stamps the shadow byte 5 - the two LEFT quadrants, bits
   * 1 (top-left) and 4 (bottom-left) - on the tile immediately EAST of the
   * wall, unless that tile is a wall as well. Nothing in the runtime redoes
   * that (Tilemap only READS the byte), so a map we build ourselves has no
   * shadows at all unless we stamp them the same way.
   *
   * The rule is measured off the shipped maps rather than remembered: of the
   * 30246 shadow-5 tiles in data/, 27336 sit east of a wall tile that is not
   * itself a wall, and both halves of what the engine calls a wall cast it -
   * the A4 wall TOP (the ceiling/ledge kind) as well as the A3/A4 wall SIDE.
   * Existing bytes are never touched, so shadows a prefab was painted with in
   * the editor stay exactly as its author left them.
   */
  function applyAutoShadows(mapData, width, height) {
    if (!mapData || width <= 0 || height <= 0) return;
    if (typeof Tilemap === "undefined" || !Tilemap.isWallTile) return;
    const shadowEnd = width * height * 5;
    if (mapData.length < shadowEnd) {
      for (let i = mapData.length; i < shadowEnd; i++) mapData[i] = 0;
    }
    // A wall on either tile layer casts: the generators put their walls on
    // layer 0, authored prefabs often carry theirs on layer 1.
    const isWallAt = (x, y) =>
      Tilemap.isWallTile(mapData[calculateIndex(x, y, 0, width, height)] || 0) ||
      Tilemap.isWallTile(mapData[calculateIndex(x, y, 1, width, height)] || 0);
    for (let y = 0; y < height; y++) {
      for (let x = 1; x < width; x++) {
        const idx = calculateIndex(x, y, 4, width, height);
        if (mapData[idx]) continue;
        if (!isWallAt(x - 1, y) || isWallAt(x, y)) continue;
        mapData[idx] = 5;
      }
    }
  }

  /**
   * Reconcile cave walls and ceilings to guarantee visual integrity:
   * 1. Prunes small isolated/orphaned ceiling fragments (< 6 contiguous tiles) that do not connect to borders.
   * 2. Removes any orphaned CaveWall tiles (walls without a Ceiling or valid CaveWall above them).
   * 3. Draws CaveWall tiles below every south-facing CaveCeiling edge with calibrated height (wallHeight = 2).
   * 4. Validates that every CaveWall tile connects vertically to a CaveCeiling above it.
   */
  function reconcileCaveWallsAndCeilings(
    mapData,
    width,
    height,
    caveCeilingTile,
    caveWallTile,
    caveFloorTile,
    wallHeight = 2,
    allFeatures = {}
  ) {
    if (!mapData || width <= 0 || height <= 0) return;

    // Collect all known ceiling and wall tile IDs
    const ceilingTileSet = new Set();
    if (caveCeilingTile !== undefined && caveCeilingTile !== null) {
      ceilingTileSet.add(caveCeilingTile);
    }
    for (const name of ["Ceiling", "CaveCeiling", "MountainCeiling", "DungeonCeiling"]) {
      for (const v of (allFeatures && allFeatures[name]) || []) {
        const id = v.type === "single" ? v.tileId : (v.tiles && v.tiles[0] && v.tiles[0][0]);
        if (id !== undefined && id !== null) ceilingTileSet.add(id);
      }
    }

    const wallTileSet = new Set();
    if (caveWallTile !== undefined && caveWallTile !== null) {
      wallTileSet.add(caveWallTile);
    }
    for (const name of ["CaveWall", "MountainWall", "DungeonWall"]) {
      for (const v of (allFeatures && allFeatures[name]) || []) {
        const id = v.type === "single" ? v.tileId : (v.tiles && v.tiles[0] && v.tiles[0][0]);
        if (id !== undefined && id !== null) wallTileSet.add(id);
      }
    }

    const isCeiling = (tileId) => ceilingTileSet.has(tileId);
    const isWall = (tileId) => wallTileSet.has(tileId);

    // Pass 1: Prune small isolated ceiling clusters (< 6 tiles and not touching map borders)
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (visited[y * width + x] || !isCeiling(mapData[idx])) continue;

        const cluster = [];
        let touchesBorder = false;
        const stack = [{ x, y }];
        visited[y * width + x] = 1;

        while (stack.length > 0) {
          const p = stack.pop();
          cluster.push(p);
          if (p.x === 0 || p.x === width - 1 || p.y === 0 || p.y === height - 1) {
            touchesBorder = true;
          }

          const neighbors = [
            { x: p.x + 1, y: p.y },
            { x: p.x - 1, y: p.y },
            { x: p.x, y: p.y + 1 },
            { x: p.x, y: p.y - 1 }
          ];

          for (const n of neighbors) {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            const nPos = n.y * width + n.x;
            if (!visited[nPos]) {
              const nIdx = calculateIndex(n.x, n.y, 0, width, height);
              if (isCeiling(mapData[nIdx])) {
                visited[nPos] = 1;
                stack.push(n);
              }
            }
          }
        }

        if (cluster.length < 6 && !touchesBorder) {
          for (const p of cluster) {
            const cIdx = calculateIndex(p.x, p.y, 0, width, height);
            mapData[cIdx] = caveFloorTile;
          }
        }
      }
    }

    // Pass 2: Clean up any existing orphaned CaveWalls
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (isWall(mapData[idx])) {
          if (y === 0) {
            mapData[idx] = caveFloorTile;
          } else {
            const aboveIdx = calculateIndex(x, y - 1, 0, width, height);
            const aboveTile = mapData[aboveIdx];
            if (!isCeiling(aboveTile) && !isWall(aboveTile)) {
              mapData[idx] = caveFloorTile;
            }
          }
        }
      }
    }

    // Pass 2b: Normalise the gap under every south-facing ceiling edge.
    // A wall face is drawn on the tiles under a ceiling edge, so a gap too
    // narrow to hold a full face plus one walkable row used to be given a
    // SHORTER face than the gap beside it (two wall heights in one chamber),
    // or none at all, leaving a ceiling tile with bare floor under its south
    // edge. Widen the gap instead by eating the ceiling row above it, so every
    // face below can be drawn at the one height. The top rows are left alone:
    // they are the sealed map border and must never be opened.
    const isCeilAt = (cx, cy) => isCeiling(mapData[calculateIndex(cx, cy, 0, width, height)]);
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (let x = 0; x < width; x++) {
        for (let y = wallHeight + 1; y < height - 1; y++) {
          if (!isCeilAt(x, y) || isCeilAt(x, y + 1)) continue;
          let gap = 0;
          for (let k = y + 1; k < height && !isCeilAt(x, k); k++) gap++;
          if (gap >= wallHeight + 1) continue;
          mapData[calculateIndex(x, y, 0, width, height)] = caveFloorTile;
          changed = true;
        }
      }
      // Eating one column at a time leaves one-tile fins of ceiling standing
      // between two open spaces, and the autotile has to corner around a strip
      // a single tile wide - the ugliest shape the blend can draw, and never
      // readable as rock. Anything that thin goes with the rest.
      for (let y = 0; y < height; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!isCeilAt(x, y) || isCeilAt(x - 1, y) || isCeilAt(x + 1, y)) continue;
          mapData[calculateIndex(x, y, 0, width, height)] = caveFloorTile;
          changed = true;
        }
      }
      if (!changed) break;
    }

    // Pass 3: Draw CaveWalls below each CaveCeiling (South-facing edges)
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (isCeiling(mapData[idx])) {
          if (y + 1 < height) {
            const belowIdx = calculateIndex(x, y + 1, 0, width, height);
            if (!isCeiling(mapData[belowIdx])) {
              // Count floor gap until the next ceiling in this column
              let gap = 0;
              for (let k = y + 1; k < height; k++) {
                const kIdx = calculateIndex(x, k, 0, width, height);
                if (isCeiling(mapData[kIdx])) break;
                gap++;
              }

              // Pass 2b already widened every gap it was allowed to touch, so
              // the face is drawn at the one height wherever it fits with a
              // walkable row left under it. Only the untouchable border rows
              // can still come up short, and there the face is clamped rather
              // than blocking the passage.
              const hWall = gap >= wallHeight + 1
                ? wallHeight
                : Math.max(0, gap - 1);

              for (let dy = 1; dy <= hWall; dy++) {
                const wy = y + dy;
                if (wy < height) {
                  const wIdx = calculateIndex(x, wy, 0, width, height);
                  if (!isCeiling(mapData[wIdx])) {
                    mapData[wIdx] = caveWallTile;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Pass 4: Final verification - Remove any orphaned wall that cannot trace back up to a Ceiling
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (isWall(mapData[idx])) {
          let hasCeilingAbove = false;
          for (let k = y - 1; k >= 0 && k >= y - wallHeight; k--) {
            const kIdx = calculateIndex(x, k, 0, width, height);
            if (isCeiling(mapData[kIdx])) {
              hasCeilingAbove = true;
              break;
            }
            if (!isWall(mapData[kIdx])) {
              break;
            }
          }
          if (!hasCeilingAbove) {
            mapData[idx] = caveFloorTile;
          }
        }
      }
    }
  }

  /**
   * Cleanup pass to remove any orphaned walls (no ceiling above) or tiny floating ceiling specks.
   */
  function cleanupOrphanedWallsAndCeilings(
    mapData,
    width,
    height,
    caveCeilingTile,
    caveWallTile,
    caveFloorTile,
    wallHeight = 2,
    allFeatures = {}
  ) {
    if (!mapData || width <= 0 || height <= 0) return;

    const ceilingTileSet = new Set();
    if (caveCeilingTile !== undefined && caveCeilingTile !== null) ceilingTileSet.add(caveCeilingTile);
    for (const name of ["Ceiling", "CaveCeiling", "MountainCeiling", "DungeonCeiling"]) {
      for (const v of (allFeatures && allFeatures[name]) || []) {
        const id = v.type === "single" ? v.tileId : (v.tiles && v.tiles[0] && v.tiles[0][0]);
        if (id !== undefined && id !== null) ceilingTileSet.add(id);
      }
    }

    const wallTileSet = new Set();
    if (caveWallTile !== undefined && caveWallTile !== null) wallTileSet.add(caveWallTile);
    for (const name of ["CaveWall", "MountainWall", "DungeonWall"]) {
      for (const v of (allFeatures && allFeatures[name]) || []) {
        const id = v.type === "single" ? v.tileId : (v.tiles && v.tiles[0] && v.tiles[0][0]);
        if (id !== undefined && id !== null) wallTileSet.add(id);
      }
    }

    const isCeiling = (tileId) => ceilingTileSet.has(tileId);
    const isWall = (tileId) => wallTileSet.has(tileId);

    // Pass 1: Prune small isolated ceiling clusters (< 6 tiles and not touching map borders)
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (visited[y * width + x] || !isCeiling(mapData[idx])) continue;

        const cluster = [];
        let touchesBorder = false;
        const stack = [{ x, y }];
        visited[y * width + x] = 1;

        while (stack.length > 0) {
          const p = stack.pop();
          cluster.push(p);
          if (p.x === 0 || p.x === width - 1 || p.y === 0 || p.y === height - 1) touchesBorder = true;

          const neighbors = [
            { x: p.x + 1, y: p.y },
            { x: p.x - 1, y: p.y },
            { x: p.x, y: p.y + 1 },
            { x: p.x, y: p.y - 1 }
          ];
          for (const n of neighbors) {
            if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
            const nPos = n.y * width + n.x;
            if (!visited[nPos]) {
              const nIdx = calculateIndex(n.x, n.y, 0, width, height);
              if (isCeiling(mapData[nIdx])) {
                visited[nPos] = 1;
                stack.push(n);
              }
            }
          }
        }

        if (cluster.length < 6 && !touchesBorder) {
          for (const p of cluster) {
            const cIdx = calculateIndex(p.x, p.y, 0, width, height);
            mapData[cIdx] = caveFloorTile;
          }
        }
      }
    }

    // Pass 2: Remove any CaveWall that cannot trace vertically upwards to a Ceiling
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const idx = calculateIndex(x, y, 0, width, height);
        if (isWall(mapData[idx])) {
          let hasCeilingAbove = false;
          for (let k = y - 1; k >= 0 && k >= y - wallHeight; k--) {
            const kIdx = calculateIndex(x, k, 0, width, height);
            if (isCeiling(mapData[kIdx])) {
              hasCeilingAbove = true;
              break;
            }
            if (!isWall(mapData[kIdx])) break;
          }
          if (!hasCeilingAbove) {
            mapData[idx] = caveFloorTile;
          }
        }
      }
    }
  }

  /**
   * Generate mountain terrain using inverted cellular automata
   * Creates mountain peaks and cliff formations using inverted cellular automata
   * Reuses the cellular automata algorithm but inverts the result:
   * - CA floor becomes Ceiling (peaks)
   * - CA walls become open terrain (valleys)
   * Places MountainWall tiles below each ceiling for visual depth
   * Parameters are randomized by world coordinates for regional variation
   */

  /**
   * Generate a random seeded safe zone in the middle of the map
   * Creates either a circular or square safe zone (randomly chosen based on seed)
   * Safe zone prevents mountains from spawning, creating a landing area for teleported players
   * @param {Array<Array<boolean>>} grid - Mountain CA grid to modify
   * @param {number} width - Map width
   * @param {number} height - Map height
   * @param {number} seed - Seed for randomization
   */
  /**
   * Carve guaranteed traversable corridors through a dense mountain grid.
   *
   * The cellular-automata step produces dense rock; on its own that can box the
   * player in. This pass carves meandering floor corridors from the map center
   * (where players are teleported in) out to a point on each of the four edges,
   * guaranteeing the map can always be crossed both north-south and east-west.
   *
   * grid values: true = floor (walkable), false = wall (mountain).
   */
  function carveMountainTraversalPaths(grid, width, height, seed) {
    const rng = createSeededRandom(seed + 1337);

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    // Force a small square of floor around a point (path thickness).
    const carveAt = (cx, cy, radius) => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            grid[ny][nx] = true; // floor - no mountain
          }
        }
      }
    };

    // Carve a meandering corridor from (x1,y1) to (x2,y2). Biased toward the
    // target so it always converges, with occasional perpendicular jogs so the
    // path winds rather than running dead straight.
    const carvePath = (x1, y1, x2, y2, radius) => {
      let x = x1;
      let y = y1;
      let guard = 0;
      const maxSteps = (width + height) * 4;

      while ((x !== x2 || y !== y2) && guard++ < maxSteps) {
        carveAt(x, y, radius);

        const dirX = Math.sign(x2 - x);
        const dirY = Math.sign(y2 - y);

        if (rng() < 0.72) {
          // Step toward the target, alternating axes for a diagonal feel.
          if (dirX !== 0 && (dirY === 0 || rng() < 0.5)) {
            x += dirX;
          } else if (dirY !== 0) {
            y += dirY;
          } else if (dirX !== 0) {
            x += dirX;
          }
        } else {
          // Perpendicular jog for organic winding, kept off the outer ring.
          if (dirX !== 0) {
            y += (rng() < 0.5 ? 1 : -1);
          } else {
            x += (rng() < 0.5 ? 1 : -1);
          }
          x = Math.max(1, Math.min(width - 2, x));
          y = Math.max(1, Math.min(height - 2, y));
        }
      }

      carveAt(x2, y2, radius);
    };

    // Pick an exit point on each edge, offset randomly within the middle band
    // so paths don't always leave from the same spot.
    const edgeSpan = (length) =>
      Math.floor(length * 0.25) + Math.floor(rng() * (length * 0.5));

    const northX = edgeSpan(width);
    const southX = edgeSpan(width);
    const westY = edgeSpan(height);
    const eastY = edgeSpan(height);

    // Path thickness: mostly 3-wide (radius 1), occasionally 5-wide (radius 2).
    const pathRadius = () => (rng() < 0.3 ? 2 : 1);

    carvePath(centerX, centerY, northX, 0, pathRadius());
    carvePath(centerX, centerY, southX, height - 1, pathRadius());
    carvePath(centerX, centerY, 0, westY, pathRadius());
    carvePath(centerX, centerY, width - 1, eastY, pathRadius());
  }

  function applyMountainCenterSafeZone(grid, width, height, seed) {
    const rng = createSeededRandom(seed);

    // Determine safe zone parameters based on seed
    const isCircular = rng() < 0.5;  // 50% chance of circular vs square
    const minRadius = 12;  // Minimum safe zone radius (12-18 tiles)
    const maxRadius = 18;
    const radius = Math.floor(rng() * (maxRadius - minRadius + 1)) + minRadius;

    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);

    if (isCircular) {
      // Create circular safe zone
      const radiusSquared = radius * radius;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          const distSquared = dx * dx + dy * dy;

          // Force to floor (true) if within circle
          if (distSquared <= radiusSquared) {
            grid[y][x] = true;  // true = floor (no mountain)
          }
        }
      }
    } else {
      // Create square safe zone
      const halfRadius = Math.floor(radius / 2);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Check if within square bounds
          const inX = Math.abs(x - centerX) <= halfRadius;
          const inY = Math.abs(y - centerY) <= halfRadius;

          // Force to floor (true) if within square
          if (inX && inY) {
            grid[y][x] = true;  // true = floor (no mountain)
          }
        }
      }
    }
  }

  function generateMountainBiomeTerrain(width, height, tileWidth, seed, mountainCeilingTile, mountainWallTile, baseTerrainData, worldCoords, cliffTiles) {
    const rng = createSeededRandom(seed);

    // Randomize parameters based on world coordinates for regional mountain variety
    const coordSeed = (worldCoords?.x || 0) * 73856093 ^ (worldCoords?.y || 0) * 19349663;
    const coordRng = createSeededRandom(coordSeed);

    // Randomize iterations (2-4): affects how smoothed/carved the mountains are
    // Lower iterations = rougher, more jagged peaks
    // Higher iterations = smoother, more eroded formations
    const iterations = Math.floor(coordRng() * 3) + 2;

    // Randomize initial floor chance (0.40-0.54): affects mountain density
    // Lower = denser mountains with fewer valleys
    // Higher = sparse mountains with more terrain
    // Biased low so mountain biomes read as dense rock with carved passages
    // (guaranteed traversal paths are carved back in below).
    const initialFloorChance = 0.40 + (coordRng() * 0.14);

    // Randomize CA threshold (4-5): affects how connected mountains are
    // 4 = more connected mountain ranges
    // 5 = more isolated peaks with deeper valleys
    // Biased toward 5 for denser, chunkier rock masses.
    const caThreshold = coordRng() < 0.65 ? 5 : 4;

    // Randomize wall heights (1-4 for min, minWallHeight-8 for max)
    // This creates regional variety in cliff steepness
    const minWallHeight = Math.floor(coordRng() * 4) + 1;  // 1-4 tiles minimum
    const maxWallHeight = Math.floor(coordRng() * (8 - minWallHeight + 1)) + minWallHeight;  // minWallHeight-8 tiles maximum

    // Initialize grid with random floor/wall tiles
    let grid = Array(height).fill(null).map(() =>
      Array(width).fill(null).map(() => rng() < initialFloorChance)
    );

    // Apply cellular automata rules for specified iterations
    for (let iter = 0; iter < iterations; iter++) {
      const newGrid = Array(height).fill(null).map(() => Array(width).fill(false));

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // Count floor neighbors (including diagonals)
          let floorNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;  // Skip self
              const ny = (y + dy + height) % height;
              const nx = (x + dx + width) % width;
              if (grid[ny][nx]) floorNeighbors++;
            }
          }

          // Apply cellular automata rules
          // A tile becomes floor if it has caThreshold+ floor neighbors, otherwise wall
          // Lower threshold (4) = more connected mountains
          // Higher threshold (5) = more isolated peaks with deeper valleys
          newGrid[y][x] = floorNeighbors >= caThreshold;
        }
      }

      grid = newGrid;
    }

    // Apply varying border safe zones (3-6 tiles) with smooth noise
    // This prevents mountains from appearing at the boundaries where adjacent biomes connect
    // Create a seeded RNG for border noise
    const borderNoiseRng = createSeededRandom(seed + 42);

    // Generate noise-based border widths for all 4 edges (3-6 tiles, varying smoothly)
    // Use subtle multi-frequency harmonics for organic shapes without extreme variations
    const getBorderWidth = (position, borderLength) => {
      const normalizedPos = position / borderLength;

      // Subtle multi-frequency harmonic oscillation
      // Primary wave at 2 cycles - main undulation
      const primaryWave = Math.sin(normalizedPos * Math.PI * 2) * 0.15;
      // Secondary wave at 5 cycles - small jagged detail
      const secondaryWave = Math.sin(normalizedPos * Math.PI * 5) * 0.08;

      // Combine harmonics (total range -0.23 to 0.23)
      const harmonicNoise = primaryWave + secondaryWave;
      const normalizedHarmonic = (harmonicNoise + 0.23) / 0.46;  // Normalize to 0-1

      return 3 + Math.floor(normalizedHarmonic * 3);  // 3-6 tile range
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let isInSafeZone = false;

        // North border - varies based on x position
        const northBorderWidth = getBorderWidth(x, width);
        if (y < northBorderWidth) {
          isInSafeZone = true;
        }

        // South border - varies based on x position
        const southBorderWidth = getBorderWidth(x, width);
        if (y >= height - southBorderWidth) {
          isInSafeZone = true;
        }

        // West border - varies based on y position
        const westBorderWidth = getBorderWidth(y, height);
        if (x < westBorderWidth) {
          isInSafeZone = true;
        }

        // East border - varies based on y position
        const eastBorderWidth = getBorderWidth(y, height);
        if (x >= width - eastBorderWidth) {
          isInSafeZone = true;
        }

        // Force safe zone tiles to be floor (true) - no mountains
        if (isInSafeZone) {
          grid[y][x] = true;  // true = floor (no mountain)
        }
      }
    }

    // Apply random seeded safe zone in the middle of the map
    // Creates circular or square landing area for teleported players
    applyMountainCenterSafeZone(grid, width, height, seed);

    // Carve guaranteed traversable corridors from the center safe zone out to
    // every edge so the now-denser mountains can always be crossed.
    carveMountainTraversalPaths(grid, width, height, seed);

    // Create the map data array (4 layers) - start with base terrain
    const mapData = new Array(tileWidth * height * 4);
    mapData.fill(0);

    // Copy base terrain data (biome floor tiles)
    if (baseTerrainData) {
      for (let i = 0; i < baseTerrainData.length; i++) {
        mapData[i] = baseTerrainData[i];
      }
    }

    // Track which positions have mountain ceilings for wall placement
    const mountainPositions = [];

    // Authoritative "is this cell mountain" record, kept separately from the
    // tile ids painted onto it. The Ceiling tile is commonly 0 for a
    // tileset that never declared one (bare void), so any code downstream
    // that wants to know "is this mountain" can't just compare against
    // mountainCeilingTile/mountainWallTile - a 0 id would also match every
    // untouched/blank cell that has nothing to do with the mountain pass.
    // This mask is set true only where the pass below actually places
    // ceiling or wall, so it stays correct however those tiles are numbered.
    const mountainMask = new Array(width * height).fill(false);

    // First pass: place mountain ceilings (INVERT the cellular automata result)
    // CA walls (false) become mountains (ceiling), CA floors (true) become valleys (base terrain)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Invert: if CA says it's a wall, place mountain ceiling
        if (!grid[y][x]) {
          const idx = calculateIndex(x, y, 0, width, height);
          mapData[idx] = mountainCeilingTile;
          mountainMask[y * width + x] = true;
          mountainPositions.push({ x, y });
        }
      }
    }

    // Convert Ceilings at varying border edges to MountainWalls for cleaner edge appearance
    // This uses the same noise-based border widths as the safe zone
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Get border widths for this position
        const northBorderWidth = getBorderWidth(x, width);
        const southBorderWidth = getBorderWidth(x, width);
        const westBorderWidth = getBorderWidth(y, height);
        const eastBorderWidth = getBorderWidth(y, height);

        let shouldConvertToWall = false;

        // Convert ceilings at the outer edge of each border (innermost safe zone row)
        // North border: at y = northBorderWidth - 1
        if (y === northBorderWidth - 1) {
          shouldConvertToWall = true;
        }
        // South border: at y = height - southBorderWidth
        if (y === height - southBorderWidth) {
          shouldConvertToWall = true;
        }
        // West border: at x = westBorderWidth - 1
        if (x === westBorderWidth - 1) {
          shouldConvertToWall = true;
        }
        // East border: at x = width - eastBorderWidth
        if (x === width - eastBorderWidth) {
          shouldConvertToWall = true;
        }

        if (shouldConvertToWall) {
          const idx = calculateIndex(x, y, 0, width, height);
          if (mapData[idx] === mountainCeilingTile) {
            mapData[idx] = mountainWallTile;
            // Remove this position from mountainPositions since it's now a wall
            const posIndex = mountainPositions.findIndex(pos => pos.x === x && pos.y === y);
            if (posIndex !== -1) {
              mountainPositions.splice(posIndex, 1);
            }
          }
        }
      }
    }

    // Second pass: place walls below each mountain ceiling
    // Ensure every ceiling has at least one wall below it
    for (const pos of mountainPositions) {
      // Create deterministic height based on position for consistency in clusters
      // Use floor division to group nearby tiles: every 2x2 area gets same height
      const heightRegionX = Math.floor(pos.x / 2);
      const heightRegionY = Math.floor(pos.y / 2);
      const heightSeed = createSeededRandom(seed + heightRegionX * 73856093 ^ heightRegionY * 19349663);

      // Determine wall height using region's min/max - same for all ceilings in 2x2 region
      const heightRange = maxWallHeight - minWallHeight + 1;
      const wallHeight = Math.floor(heightSeed() * heightRange) + minWallHeight;

      // Place wall tiles below the ceiling
      let wallPlaced = false;
      for (let dy = 1; dy <= wallHeight; dy++) {
        const wallY = pos.y + dy;
        if (wallY < height) {
          // Skip wall placement if it would be in varying border safe zone
          const northBorderWidth = getBorderWidth(pos.x, width);
          const southBorderWidth = getBorderWidth(pos.x, width);
          const westBorderWidth = getBorderWidth(wallY, height);
          const eastBorderWidth = getBorderWidth(wallY, height);

          const isNearNorthEdge = wallY < northBorderWidth;
          const isNearSouthEdge = wallY >= height - southBorderWidth;
          const isNearWestEdge = pos.x < westBorderWidth;
          const isNearEastEdge = pos.x >= width - eastBorderWidth;

          if (!(isNearNorthEdge || isNearSouthEdge || isNearWestEdge || isNearEastEdge)) {
            const idx = calculateIndex(pos.x, wallY, 0, width, height);
            const currentTile = mapData[idx];

            // Only place wall if the position isn't occupied by another mountain ceiling
            // Walls can overwrite base terrain to ensure ceiling always has support
            if (currentTile !== mountainCeilingTile) {
              mapData[idx] = mountainWallTile;
              mountainMask[wallY * width + pos.x] = true;
              wallPlaced = true;
            }
          }
        }
      }

      // Guarantee at least one wall below ceiling if none was placed
      // (e.g., if ceiling is at bottom edge or surrounded by other ceilings)
      // Also respect the varying border safe zones around border
      if (!wallPlaced && pos.y + 1 < height) {
        const wallY = pos.y + 1;
        const northBorderWidth = getBorderWidth(pos.x, width);
        const southBorderWidth = getBorderWidth(pos.x, width);
        const westBorderWidth = getBorderWidth(wallY, height);
        const eastBorderWidth = getBorderWidth(wallY, height);

        const isNearNorthEdge = wallY < northBorderWidth;
        const isNearSouthEdge = wallY >= height - southBorderWidth;
        const isNearWestEdge = pos.x < westBorderWidth;
        const isNearEastEdge = pos.x >= width - eastBorderWidth;

        // Only place guarantee wall if it's not in the safe zone
        if (!(isNearNorthEdge || isNearSouthEdge || isNearWestEdge || isNearEastEdge)) {
          const idx = calculateIndex(pos.x, wallY, 0, width, height);
          if (mapData[idx] !== mountainCeilingTile) {
            mapData[idx] = mountainWallTile;
            mountainMask[wallY * width + pos.x] = true;
          }
        }
      }
    }

    // Cliff-wall retexture pass. Without directional wall tiles every mountain
    // cell is the same rock tile, so a mountain mass reads as one flat blob. When
    // MountainLeft / MountainCenter / MountainRight are supplied we keep the plain
    // Ceiling tile on the TOP cap (a cell with open terrain directly above) and
    // redraw the cliff FACE below it - Left at the left edge of the face, Right at
    // the right edge, Center in between - so the wall gets proper corners.
    if (cliffTiles && cliffTiles.center) {
      // Snapshot which layer-0 tiles are mountain BEFORE rewriting, so neighbour
      // classification is not contaminated by tiles changed earlier in the pass.
      const isMt = new Array(width * height).fill(false);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const t = mapData[calculateIndex(x, y, 0, width, height)];
          // Guard against a 0 ceiling/wall id (feature missing) matching empty tiles.
          isMt[y * width + x] = t !== 0 && (t === mountainCeilingTile || t === mountainWallTile);
        }
      }

      const left  = cliffTiles.left  || cliffTiles.center;
      const right = cliffTiles.right || cliffTiles.center;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (!isMt[y * width + x]) continue;

          // Top cap: open terrain directly above -> leave the Ceiling tile as-is.
          if (!(y > 0 && isMt[(y - 1) * width + x])) continue;

          // Cliff face: directional wall tile chosen from the horizontal face run.
          const leftMt  = x > 0         && isMt[y * width + (x - 1)];
          const rightMt = x < width - 1 && isMt[y * width + (x + 1)];
          const idx = calculateIndex(x, y, 0, width, height);
          if (!leftMt && rightMt)      mapData[idx] = left;
          else if (leftMt && !rightMt) mapData[idx] = right;
          else                         mapData[idx] = cliffTiles.center; // middle / lone
        }
      }
    }

    // Expose the authoritative mountain/ceiling record so callers (feature
    // scattering, prefab placement) can test "is this cell mountain" by
    // position instead of by tile id.
    mapData.mountainMask = mountainMask;

    return mapData;
  }

  // ===== MOUNTAIN RANGE TERRAIN (multi-elevation relief) =====
  //
  // The Mountain family of surface biomes is generated from a real heightfield
  // instead of an inverted cellular-automata blob:
  //
  //   1. warped fBm + ridged noise      -> ridgelines, spurs and hollows
  //   2. thermal erosion / smoothing    -> scree slopes, rounded or glacial forms
  //   3. terracing                      -> mesas and tablelands
  //   4. steepest-descent channels      -> valleys, canyons and gorges
  //   5. elevation banding + extrusion  -> cliff faces whose height IS the band
  //   6. basin flooding                 -> tarns and caldera lakes ringed by rock
  //   7. connectivity repair            -> a pass through the lowest saddle
  //
  // Rock is drawn with MountainLeft / MountainCenter / MountainRight only
  // (MountainWall and Ceiling are no longer used by this path - most mountain
  // tilesets never declared them, which is why the old generator painted whole
  // massifs with tile id 0). Those three tiles are three shades of the same
  // rock, so they are used as a three-step hillshade: Center is the lit face,
  // Left the half-shaded one, Right the shadow.

  /**
   * Smooth (bilinear + quintic fade) value noise on an integer lattice.
   * Cache.getNoise floors its inputs, so it cannot be sampled at the
   * fractional coordinates a heightfield needs - this one can.
   */
  function createMountainNoise(seed) {
    const s = (seed | 0) || 1;
    const lattice = (xi, yi) => {
      let n = Math.imul(xi | 0, 374761393) ^ Math.imul(yi | 0, 668265263) ^ Math.imul(s, 1442695041);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      n ^= n >>> 16;
      return (n >>> 0) / 4294967295;
    };
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const tx = fade(x - xi);
      const ty = fade(y - yi);
      const a = lattice(xi, yi);
      const b = lattice(xi + 1, yi);
      const c = lattice(xi, yi + 1);
      const d = lattice(xi + 1, yi + 1);
      const top = a + (b - a) * tx;
      const bottom = c + (d - c) * tx;
      return top + (bottom - top) * ty;
    };
  }

  /** Standard fractal sum: broad landmass shapes. Returns 0..1. */
  function mountainFbm(noise, x, y, octaves, lacunarity, persistence) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise(x * freq + i * 17.13, y * freq + i * 31.7) * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Ridged multifractal: folding the noise about its midpoint turns the smooth
   * hills into creases, and feeding each octave's crest into the next one
   * concentrates detail along the ridgelines - which is what makes a range read
   * as arêtes and spurs rather than as lumps. Returns 0..1.
   */
  function mountainRidged(noise, x, y, octaves, lacunarity, persistence) {
    let amp = 1, freq = 1, sum = 0, norm = 0, weight = 1;
    for (let i = 0; i < octaves; i++) {
      let n = noise(x * freq + i * 5.7, y * freq + i * 9.1);
      n = 1 - Math.abs(n * 2 - 1);
      n *= n;
      n *= weight;
      weight = Math.max(0, Math.min(1, n * 1.7));
      sum += n * amp;
      norm += amp;
      amp *= persistence;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * The shapes a mountain map can take. One is chosen per world square (see
   * pickMountainStyle), so neighbouring squares of the same biome still look
   * like different country.
   *
   *   freq/octaves/lacunarity/persistence - noise shape
   *   ridge          0..1 blend of ridged over plain fBm (1 = pure arêtes)
   *   warp/warpFreq  domain warp: bends ridgelines instead of leaving them straight
   *   gamma          >1 pushes terrain down (sparser rock), <1 raises it
   *   rockCoverage   share of the square that ends up as impassable rock. Taken
   *                  as a quantile of the finished heightfield rather than an
   *                  absolute height, so erosion and channel carving cannot
   *                  accidentally leave a "Mountain" square with no mountains
   *   bands          number of elevation bands (a band IS the cliff height)
   *   terrace        height quantum for flat tops (0 = off)
   *   talus/erosionIters  thermal erosion: slope limit and pass count
   *   smooth         box-blur passes (glacial rounding)
   *   channels/channelDepth/channelWidth/channelU  drainage carving; U = 0 V-notch, 1 flat-floored trough
   *   extrudeMax     tallest cliff face drawn below a south-facing rim
   *   lakeChance/lakes/lakeArea  basin flooding
   *   radial         optional large-scale form (caldera ring / lone massif)
   */
  const MOUNTAIN_STYLES = {
    alpineRidges: {
      label: "alpine ridges",
      freq: 0.055, octaves: 5, lacunarity: 2.05, persistence: 0.52,
      ridge: 0.82, warp: 1.6, warpFreq: 0.55, gamma: 1.05,
      rockCoverage: 0.46, bands: 5, extrudeMax: 3,
      terrace: 0, talus: 0.055, erosionIters: 3, smooth: 0,
      channels: 5, channelDepth: 0.24, channelWidth: 1.8, channelU: 0.15,
      lakeChance: 0.45, lakes: 1, lakeArea: [24, 64],
      radial: null,
    },
    glacialTroughs: {
      label: "glacial troughs",
      freq: 0.045, octaves: 4, lacunarity: 1.95, persistence: 0.55,
      ridge: 0.55, warp: 1.2, warpFreq: 0.45, gamma: 1.0,
      rockCoverage: 0.42, bands: 6, extrudeMax: 3,
      terrace: 0, talus: 0.07, erosionIters: 2, smooth: 2,
      channels: 4, channelDepth: 0.3, channelWidth: 3.4, channelU: 0.85,
      lakeChance: 0.7, lakes: 2, lakeArea: [26, 80],
      radial: null,
    },
    highPlateau: {
      label: "high plateau",
      freq: 0.035, octaves: 4, lacunarity: 2.1, persistence: 0.48,
      ridge: 0.25, warp: 0.9, warpFreq: 0.4, gamma: 0.72,
      rockCoverage: 0.5, bands: 4, extrudeMax: 4,
      terrace: 0.075, talus: 0.09, erosionIters: 2, smooth: 1,
      channels: 3, channelDepth: 0.36, channelWidth: 1.5, channelU: 0.35,
      lakeChance: 0.25, lakes: 1, lakeArea: [20, 50],
      radial: null,
    },
    mesaButtes: {
      label: "mesas and buttes",
      freq: 0.075, octaves: 4, lacunarity: 2.2, persistence: 0.45,
      ridge: 0.35, warp: 0.7, warpFreq: 0.5, gamma: 0.9,
      rockCoverage: 0.4, bands: 4, extrudeMax: 4,
      terrace: 0.11, talus: 0.12, erosionIters: 2, smooth: 0,
      channels: 4, channelDepth: 0.3, channelWidth: 1.3, channelU: 0.5,
      lakeChance: 0.12, lakes: 1, lakeArea: [14, 34],
      radial: null,
    },
    deepCanyon: {
      label: "canyon country",
      freq: 0.04, octaves: 5, lacunarity: 2.0, persistence: 0.5,
      ridge: 0.45, warp: 1.1, warpFreq: 0.45, gamma: 0.62,
      rockCoverage: 0.56, bands: 5, extrudeMax: 4,
      terrace: 0.05, talus: 0.1, erosionIters: 2, smooth: 0,
      channels: 8, channelDepth: 0.42, channelWidth: 2.2, channelU: 0.45,
      lakeChance: 0.3, lakes: 1, lakeArea: [16, 44],
      radial: null,
    },
    rollingFoothills: {
      label: "rolling foothills",
      freq: 0.07, octaves: 4, lacunarity: 2.0, persistence: 0.55,
      ridge: 0.3, warp: 1.3, warpFreq: 0.6, gamma: 1.55,
      rockCoverage: 0.26, bands: 3, extrudeMax: 2,
      terrace: 0, talus: 0.075, erosionIters: 3, smooth: 1,
      channels: 4, channelDepth: 0.2, channelWidth: 3.0, channelU: 0.7,
      lakeChance: 0.55, lakes: 2, lakeArea: [20, 56],
      radial: null,
    },
    karstSpires: {
      label: "karst spires",
      freq: 0.115, octaves: 4, lacunarity: 2.3, persistence: 0.42,
      ridge: 0.7, warp: 1.9, warpFreq: 0.7, gamma: 1.25,
      rockCoverage: 0.3, bands: 5, extrudeMax: 3,
      terrace: 0, talus: 0.14, erosionIters: 1, smooth: 0,
      channels: 3, channelDepth: 0.22, channelWidth: 3.2, channelU: 0.8,
      lakeChance: 0.45, lakes: 2, lakeArea: [18, 46],
      radial: null,
    },
    calderaBasin: {
      label: "caldera basin",
      freq: 0.06, octaves: 4, lacunarity: 2.0, persistence: 0.5,
      ridge: 0.5, warp: 1.0, warpFreq: 0.5, gamma: 1.0,
      rockCoverage: 0.38, bands: 5, extrudeMax: 3,
      terrace: 0, talus: 0.07, erosionIters: 2, smooth: 1,
      channels: 3, channelDepth: 0.22, channelWidth: 2.2, channelU: 0.5,
      lakeChance: 1.0, lakes: 1, lakeArea: [70, 150],
      radial: { type: "caldera", radius: [11, 17], sigma: 4.2, strength: 0.62 },
    },
    loneMassif: {
      label: "lone massif",
      freq: 0.05, octaves: 5, lacunarity: 2.1, persistence: 0.5,
      ridge: 0.7, warp: 1.4, warpFreq: 0.5, gamma: 1.3,
      rockCoverage: 0.4, bands: 6, extrudeMax: 4,
      terrace: 0, talus: 0.06, erosionIters: 3, smooth: 0,
      channels: 4, channelDepth: 0.24, channelWidth: 2.4, channelU: 0.4,
      lakeChance: 0.4, lakes: 1, lakeArea: [18, 48],
      radial: { type: "massif", radius: [16, 24], sigma: 6, strength: 0.7 },
    },
  };

  // Which styles each mountain family draws from. Ice country is glacial and
  // lake-rich, desert country is dry table-and-canyon, a village needs enough
  // flat ground to stand on.
  const MOUNTAIN_STYLE_WEIGHTS = {
    temperate: { alpineRidges: 26, glacialTroughs: 10, highPlateau: 13, deepCanyon: 12, rollingFoothills: 16, karstSpires: 9, calderaBasin: 8, loneMassif: 6 },
    ice: { glacialTroughs: 34, alpineRidges: 24, calderaBasin: 13, highPlateau: 12, rollingFoothills: 10, loneMassif: 7 },
    desert: { mesaButtes: 32, deepCanyon: 27, highPlateau: 17, karstSpires: 12, rollingFoothills: 7, loneMassif: 5 },
    village: { rollingFoothills: 40, highPlateau: 18, alpineRidges: 16, glacialTroughs: 12, calderaBasin: 8, karstSpires: 6 },
  };

  function mountainFamilyForBiome(biomeName) {
    const name = String(biomeName || "").toLowerCase();
    if (/village|town|city/.test(name)) return "village";
    if (/ice|snow|frozen|glacier|permafrost|tundra|arctic/.test(name)) return "ice";
    if (/desert|dune|sand|badland|mesa|arid|volcan|lava|ash/.test(name)) return "desert";
    return "temperate";
  }

  /**
   * Climate pass over the chosen style. Two maps can share a style and still
   * behave differently because of where they sit: ice rounds everything off and
   * ponds meltwater, desert bakes it into terraces and dries the basins out,
   * and a village square keeps more buildable ground.
   */
  function applyMountainClimate(style, family) {
    const s = Object.assign({}, style);
    if (family === "ice") {
      s.smooth += 1;
      s.channelU = Math.max(s.channelU, 0.65);
      s.channelWidth *= 1.25;
      s.talus *= 0.8;
      s.rockCoverage *= 0.95;
      s.lakeChance = Math.min(1, s.lakeChance * 1.3 + 0.12);
      s.lakeArea = [s.lakeArea[0], Math.round(s.lakeArea[1] * 1.25)];
    } else if (family === "desert") {
      s.terrace = Math.max(s.terrace, 0.07);
      s.rockCoverage *= 1.05;
      s.talus *= 1.4;
      s.erosionIters += 1;
      s.channelDepth *= 1.15;
      s.channelWidth *= 0.85;
      s.channelU = Math.min(1, s.channelU + 0.15);
      s.lakeChance *= 0.12;
      s.lakeArea = [Math.round(s.lakeArea[0] * 0.6), Math.round(s.lakeArea[1] * 0.5)];
    } else if (family === "village") {
      s.rockCoverage *= 0.6;
      s.extrudeMax = Math.min(s.extrudeMax, 2);
      s.channels += 1;
      s.channelWidth *= 1.2;
      s.lakeChance *= 0.85;
    }
    return s;
  }

  /**
   * Pick (and jitter) the style for one world square. Deterministic in the
   * world coordinates, so the same square always generates the same range.
   */
  function pickMountainStyle(biomeName, worldCoords, seed) {
    const wx = (worldCoords && worldCoords.x) || 0;
    const wy = (worldCoords && worldCoords.y) || 0;
    const family = mountainFamilyForBiome(biomeName);
    const styleSeed = (Math.imul(wx, 73856093) ^ Math.imul(wy, 19349663) ^ Math.imul(seed | 0, 83492791)) >>> 0;
    const rng = createSeededRandom(styleSeed);

    const weights = MOUNTAIN_STYLE_WEIGHTS[family] || MOUNTAIN_STYLE_WEIGHTS.temperate;
    let total = 0;
    for (const key of Object.keys(weights)) total += weights[key];
    let roll = rng() * total;
    let chosen = Object.keys(weights)[0];
    for (const key of Object.keys(weights)) {
      roll -= weights[key];
      if (roll <= 0) { chosen = key; break; }
    }

    const style = applyMountainClimate(MOUNTAIN_STYLES[chosen] || MOUNTAIN_STYLES.alpineRidges, family);
    style.id = chosen;
    style.family = family;

    // Per-square jitter: same style, different mountain.
    const jitter = (v, amount) => v * (1 - amount + rng() * amount * 2);
    style.freq = jitter(style.freq, 0.16);
    style.rockCoverage = Math.max(0.16, Math.min(0.62, style.rockCoverage + (rng() - 0.5) * 0.1));
    style.gamma = jitter(style.gamma, 0.12);
    style.ridge = Math.max(0, Math.min(1, style.ridge + (rng() - 0.5) * 0.14));
    style.channels = Math.max(2, style.channels + (rng() < 0.5 ? -1 : 1));
    style.channelDepth = jitter(style.channelDepth, 0.18);
    return style;
  }

  /**
   * Generate a mountain surface map from a heightfield.
   *
   * options:
   *   tiles          { left, center, right } rock tiles (MountainLeft/Center/Right)
   *   baseTerrainData  layer data the open valley floor keeps
   *   worldCoords    world square, selects the style
   *   biomeName      selects the climate family
   *   waterTile      lake fill tile (biome Water feature); 0 disables lakes
   *   shoreTile      optional tile ringing a lake (Beach/Sand)
   *   apronTile      optional scree/rubble ground tile laid at the foot of cliffs
   *
   * Returns the map data array with .mountainMask (by position, authoritative),
   * .mountainWaterMask, .mountainElevation and .mountainStyle attached.
   */
  function generateMountainRangeTerrain(width, height, tileWidth, seed, options) {
    const opt = options || {};
    const tiles = opt.tiles || {};
    const baseTerrainData = opt.baseTerrainData || null;
    const worldCoords = opt.worldCoords || null;
    const biomeName = opt.biomeName || "Mountain";

    const rockCenter = tiles.center || tiles.left || tiles.right || 0;
    const rockLeft = tiles.left || rockCenter;
    const rockRight = tiles.right || rockCenter;
    const waterTile = opt.waterTile || 0;
    const shoreTile = opt.shoreTile || 0;
    const apronTile = opt.apronTile || 0;

    const style = pickMountainStyle(biomeName, worldCoords, seed);
    const rng = createSeededRandom((seed ^ 0x4d0f21) >>> 0);

    const N = width * height;
    const idxOf = (x, y) => y * width + x;
    const inBounds = (x, y) => x >= 0 && x < width && y >= 0 && y < height;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // ---- 1. heightfield --------------------------------------------------
    const h = new Float64Array(N);
    const noise = createMountainNoise((seed ^ 0x5f3a21) >>> 0);
    const warpNoise = createMountainNoise((seed ^ 0x2c9143) >>> 0);

    // A caldera rim or a lone massif is placed OFF the map centre: the centre
    // is where the player is teleported in, and it has to stay open ground
    // (a caldera lake centred there would strand them in impassable water).
    let radial = null;
    if (style.radial) {
      const ang = rng() * Math.PI * 2;
      const dist = 10 + rng() * 8;
      radial = {
        type: style.radial.type,
        x: width / 2 + Math.cos(ang) * dist,
        y: height / 2 + Math.sin(ang) * dist,
        radius: style.radial.radius[0] + rng() * (style.radial.radius[1] - style.radial.radius[0]),
        sigma: style.radial.sigma,
        strength: style.radial.strength,
      };
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x * style.freq;
        const ny = y * style.freq;
        const wx = (warpNoise(nx * style.warpFreq, ny * style.warpFreq) - 0.5) * style.warp;
        const wy = (warpNoise(nx * style.warpFreq + 4.7, ny * style.warpFreq + 9.3) - 0.5) * style.warp;
        const px = nx + wx;
        const py = ny + wy;

        const base = mountainFbm(noise, px, py, style.octaves, style.lacunarity, style.persistence);
        const ridge = style.ridge > 0
          ? mountainRidged(noise, px + 11.3, py + 4.7, style.octaves, style.lacunarity, style.persistence)
          : 0;
        let v = base * (1 - style.ridge) + ridge * style.ridge;

        if (radial) {
          const dx = x - radial.x;
          const dy = y - radial.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (radial.type === "caldera") {
            // Ring of rock around a hollow: a crater wall the lake sits inside.
            const ring = Math.exp(-((d - radial.radius) * (d - radial.radius)) / (2 * radial.sigma * radial.sigma));
            const inner = radial.radius * 0.62;
            const bowl = 1 - Math.exp(-(d * d) / (2 * inner * inner));
            v = v * (0.45 + 0.35 * bowl) + ring * radial.strength;
            if (d < inner) {
              // The crater floor is a floor: nearly flat and rising gently to
              // the wall. Flooding it therefore pools into a round crater lake
              // instead of snaking down whatever gully the noise left behind.
              v = Math.min(v, 0.1 + 0.12 * (d / inner) + v * 0.08);
            }
          } else if (radial.type === "massif") {
            // One big mountain that dominates the square, foothills around it.
            const falloff = Math.max(0, 1 - d / radial.radius);
            v = v * 0.78 + falloff * falloff * radial.strength;
          }
        }

        h[idxOf(x, y)] = clamp01(Math.pow(clamp01(v), style.gamma));
      }
    }

    // ---- 2. erosion ------------------------------------------------------
    // Thermal erosion: anything steeper than the talus angle slides into its
    // lowest neighbour, which rounds the ridges off and piles scree at the foot
    // of every face instead of leaving noise-sharp walls everywhere.
    const NB4X = [1, -1, 0, 0];
    const NB4Y = [0, 0, 1, -1];
    for (let iter = 0; iter < style.erosionIters; iter++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = idxOf(x, y);
          let lowest = i;
          let lowestH = h[i];
          for (let k = 0; k < 4; k++) {
            const j = idxOf(x + NB4X[k], y + NB4Y[k]);
            if (h[j] < lowestH) { lowestH = h[j]; lowest = j; }
          }
          const diff = h[i] - lowestH;
          if (diff > style.talus) {
            const move = (diff - style.talus) * 0.5;
            h[i] -= move;
            h[lowest] += move;
          }
        }
      }
    }

    // Glacial rounding: an ice sheet planes the crests down and leaves broad
    // shoulders, so smoothed maps read as U-shaped troughs, not V-notches.
    for (let s = 0; s < style.smooth; s++) {
      const src = h.slice();
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) sum += src[idxOf(x + dx, y + dy)];
          }
          h[idxOf(x, y)] = sum / 9;
        }
      }
    }

    // Terracing: quantising height into steps gives flat tops meeting abrupt
    // rims - the mesa / tableland silhouette. A little residue is kept so the
    // tops are not dead flat.
    if (style.terrace > 0) {
      for (let i = 0; i < N; i++) {
        const q = Math.floor(h[i] / style.terrace) * style.terrace;
        h[i] = q + (h[i] - q) * 0.25;
      }
    }

    // The flat crater floor, kept out of the drainage network below.
    let craterFloor = null;
    if (radial && radial.type === "caldera") {
      craterFloor = new Uint8Array(N);
      const inner = radial.radius * 0.62;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x - radial.x, dy = y - radial.y;
          if (Math.sqrt(dx * dx + dy * dy) < inner) craterFloor[idxOf(x, y)] = 1;
        }
      }
    }

    // ---- 3. drainage: valleys, canyons, gorges ---------------------------
    // Water runs downhill: following steepest descent from a summit to the map
    // edge and cutting the terrain along that line produces the valley network
    // a range actually has, and guarantees the mass is drained (and crossable)
    // rather than a solid wall.
    const carveChannel = (startX, startY, depth, halfWidth, uShape) => {
      const path = [];
      const visited = new Uint8Array(N);
      let x = startX;
      let y = startY;
      const maxSteps = (width + height) * 2;
      for (let step = 0; step < maxSteps; step++) {
        path.push(x, y);
        visited[idxOf(x, y)] = 1;
        if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) break;

        let bestX = -1, bestY = -1, bestH = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx2 = x + dx, ny2 = y + dy;
            if (!inBounds(nx2, ny2) || visited[idxOf(nx2, ny2)]) continue;
            // A touch of noise on the comparison makes the course meander
            // instead of running dead straight down the gradient.
            const cand = h[idxOf(nx2, ny2)] + (rng() - 0.5) * 0.012;
            if (cand < bestH) { bestH = cand; bestX = nx2; bestY = ny2; }
          }
        }

        if (bestX < 0 || bestH >= h[idxOf(x, y)]) {
          // Sink or dead end: head for the nearest edge so the channel always
          // leaves the map instead of pooling in a hollow forever.
          const toWest = x, toEast = width - 1 - x, toNorth = y, toSouth = height - 1 - y;
          const m = Math.min(toWest, toEast, toNorth, toSouth);
          if (m === toWest) x -= 1;
          else if (m === toEast) x += 1;
          else if (m === toNorth) y -= 1;
          else y += 1;
        } else {
          x = bestX;
          y = bestY;
        }
      }

      // Cut the channel profile, but never inside a crater: a caldera has no
      // outlet, and a gully cut across its floor would drain the crater lake
      // into a puddle at the bottom of the trench.
      // uShape 0 = narrow V notch (gorge), 1 = wide flat-floored trough.
      const flat = uShape * 0.8;
      const r = Math.ceil(halfWidth) + 1;
      for (let p = 0; p < path.length; p += 2) {
        const cx = path[p], cy = path[p + 1];
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx2 = cx + dx, ny2 = cy + dy;
            if (!inBounds(nx2, ny2)) continue;
            const d = Math.sqrt(dx * dx + dy * dy) / halfWidth;
            if (d > 1) continue;
            const t = d <= flat ? 1 : 1 - (d - flat) / (1 - flat);
            const shaped = Math.pow(t, 1 + (1 - uShape) * 1.2);
            const j = idxOf(nx2, ny2);
            if (craterFloor && craterFloor[j]) continue;
            h[j] = Math.max(0, h[j] - depth * shaped);
          }
        }
      }
    };

    for (let c = 0; c < style.channels; c++) {
      // Source the channel at a high point: sample the map and keep the summit.
      let sx = 2, sy = 2, sh = -1;
      for (let t = 0; t < 24; t++) {
        const cx = 2 + Math.floor(rng() * (width - 4));
        const cy = 2 + Math.floor(rng() * (height - 4));
        if (h[idxOf(cx, cy)] > sh) { sh = h[idxOf(cx, cy)]; sx = cx; sy = cy; }
      }
      carveChannel(
        sx, sy,
        style.channelDepth * (0.8 + rng() * 0.45),
        Math.max(1, style.channelWidth * (0.75 + rng() * 0.6)),
        style.channelU
      );
    }

    // ---- 4. edges and landing clearing -----------------------------------
    // The outer band stays open so the square joins its neighbours, and the
    // centre stays open because that is where the player arrives.
    const borderWidth = (position, span) => {
      const t = position / span;
      const w = Math.sin(t * Math.PI * 2) * 0.15 + Math.sin(t * Math.PI * 5) * 0.08;
      return 3 + Math.floor(((w + 0.23) / 0.46) * 3); // 3-6 tiles, undulating
    };

    const protectedCell = new Uint8Array(N); // must stay open, walkable ground
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y < borderWidth(x, width) || y >= height - borderWidth(x, width) ||
          x < borderWidth(y, height) || x >= width - borderWidth(y, height)) {
          protectedCell[idxOf(x, y)] = 1;
        }
      }
    }

    const centreX = Math.floor(width / 2);
    const centreY = Math.floor(height / 2);
    const clearingRadius = 6 + Math.floor(rng() * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - centreX, dy = y - centreY;
        if (dx * dx + dy * dy <= clearingRadius * clearingRadius) protectedCell[idxOf(x, y)] = 1;
      }
    }

    // ---- 5. rock mass and elevation bands --------------------------------
    // The rock line is a quantile of the finished heightfield, not a fixed
    // height: erosion, terracing and channel carving all move the terrain
    // around, and an absolute threshold could leave a Mountain square with no
    // mountains on it at all. Bands are quantiles too, weighted so each tier is
    // smaller than the one below it - a range narrowing toward its summits.
    const rock = new Uint8Array(N);
    const level = new Uint8Array(N);
    const face = new Uint8Array(N);
    {
      const open = [];
      for (let i = 0; i < N; i++) if (!protectedCell[i]) open.push(h[i]);
      open.sort((a, b) => a - b);
      const rockLine = open.length
        ? open[Math.min(open.length - 1, Math.floor((1 - style.rockCoverage) * open.length))]
        : 1;

      const rockHeights = [];
      for (let i = 0; i < N; i++) {
        if (protectedCell[i] || h[i] < rockLine) continue;
        rock[i] = 1;
        rockHeights.push(h[i]);
      }
      rockHeights.sort((a, b) => a - b);

      const cutoffs = [];
      for (let k = 1; k <= style.bands; k++) {
        const f = 1 - Math.pow(1 - k / style.bands, 1.6);
        cutoffs.push(rockHeights.length
          ? rockHeights[Math.min(rockHeights.length - 1, Math.floor(f * (rockHeights.length - 1)))]
          : 1);
      }
      for (let i = 0; i < N; i++) {
        if (!rock[i]) continue;
        let band = style.bands;
        for (let k = 0; k < cutoffs.length; k++) {
          if (h[i] <= cutoffs[k]) { band = k + 1; break; }
        }
        level[i] = band;
      }

      // De-speckle: a lone boulder sitting in the middle of a meadow is noise,
      // not relief, and it reads as dirt on the map. Rock needs company.
      const speckles = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = idxOf(x, y);
          if (!rock[i]) continue;
          let neighbours = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx2 = x + dx, ny2 = y + dy;
              if (inBounds(nx2, ny2) && rock[idxOf(nx2, ny2)]) neighbours++;
            }
          }
          if (neighbours <= 1) speckles.push(i);
        }
      }
      for (const i of speckles) { rock[i] = 0; level[i] = 0; }
    }

    // ---- 6. tarns, caldera lakes and valley pools -------------------------
    // A lake is grown from the lowest point of an enclosed hollow, always
    // taking the lowest cell on its shoreline next, so the water follows the
    // contour of the basin and stops dead against the surrounding rock.
    const water = new Uint8Array(N);
    const lakes = [];

    const enclosureScore = (x, y) => {
      // How many of eight directions run into rock within 9 tiles: a tarn
      // wants mountains all around it, not an open hillside.
      let walled = 0;
      for (let k = 0; k < 8; k++) {
        const ax = Math.cos((k * Math.PI) / 4);
        const ay = Math.sin((k * Math.PI) / 4);
        for (let step = 2; step <= 9; step++) {
          const nx2 = Math.round(x + ax * step);
          const ny2 = Math.round(y + ay * step);
          if (!inBounds(nx2, ny2)) break;
          if (rock[idxOf(nx2, ny2)]) { walled++; break; }
        }
      }
      return walled;
    };

    // A perfectly smooth bowl (a caldera especially) has no lowest neighbour to
    // pick between, and a plain flood of it comes out a geometric diamond. A
    // fixed per-cell wobble breaks those ties into a natural shoreline without
    // costing determinism.
    const shoreWobble = new Float64Array(N);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        shoreWobble[idxOf(x, y)] = (noise(x * 0.55 + 71.3, y * 0.55 + 23.9) - 0.5) * 0.016;
      }
    }

    const growLake = (startIdx, targetArea) => {
      const seen = new Uint8Array(N);
      const frontier = [startIdx];
      const cells = [];
      seen[startIdx] = 1;
      const shoreDepth = (i) => h[i] + shoreWobble[i];
      while (frontier.length > 0 && cells.length < targetArea) {
        let best = 0;
        for (let k = 1; k < frontier.length; k++) {
          if (shoreDepth(frontier[k]) < shoreDepth(frontier[best])) best = k;
        }
        const cur = frontier.splice(best, 1)[0];
        if (rock[cur] || protectedCell[cur] || water[cur]) continue; // shoreline
        cells.push(cur);
        const cx = cur % width;
        const cy = (cur - cx) / width;
        for (let k = 0; k < 4; k++) {
          const nx2 = cx + NB4X[k], ny2 = cy + NB4Y[k];
          if (!inBounds(nx2, ny2)) continue;
          const j = idxOf(nx2, ny2);
          if (seen[j]) continue;
          seen[j] = 1;
          frontier.push(j);
        }
      }
      if (cells.length < 10) return null;
      for (const c of cells) water[c] = 1;
      return cells;
    };

    if (waterTile) {
      const lakeCount = rng() < style.lakeChance ? style.lakes : 0;
      for (let l = 0; l < lakeCount; l++) {
        let seedIdx = -1;
        let bestScore = -Infinity;

        if (radial && radial.type === "caldera" && l === 0) {
          // The caldera floor is the lake, by construction.
          const cx = Math.max(2, Math.min(width - 3, Math.round(radial.x)));
          const cy = Math.max(2, Math.min(height - 3, Math.round(radial.y)));
          const i = idxOf(cx, cy);
          if (!rock[i] && !protectedCell[i]) seedIdx = i;
        }

        if (seedIdx < 0) {
          for (let t = 0; t < 500; t++) {
            const cx = 5 + Math.floor(rng() * (width - 10));
            const cy = 5 + Math.floor(rng() * (height - 10));
            const i = idxOf(cx, cy);
            if (rock[i] || protectedCell[i] || water[i]) continue;
            const walled = enclosureScore(cx, cy);
            if (walled < 5) continue; // not ringed by mountains
            const score = walled * 0.6 - h[i] * 2.5;
            if (score > bestScore) { bestScore = score; seedIdx = i; }
          }
        }

        if (seedIdx < 0) continue;
        const area = style.lakeArea[0] + Math.floor(rng() * (style.lakeArea[1] - style.lakeArea[0] + 1));
        const cells = growLake(seedIdx, area);
        if (cells) lakes.push(cells);
      }
    }

    // ---- 7. the shore that closes the ring --------------------------------
    // A basin only reads as "a lake in the mountains" if the mountains actually
    // go all the way round it. Wherever the shoreline opens onto flat ground,
    // it is raised into rock - except across one arc, which is left as the
    // approach the player walks in by (and the outlet the water drains through).
    for (const cells of lakes) {
      let sumX = 0, sumY = 0;
      const belongs = new Uint8Array(N);
      for (const c of cells) {
        belongs[c] = 1;
        sumX += c % width;
        sumY += (c - (c % width)) / width;
      }
      const lakeX = sumX / cells.length;
      const lakeY = sumY / cells.length;
      const outletAngle = rng() * Math.PI * 2;
      const outletHalfWidth = 0.5 + rng() * 0.35; // ~60-100 degrees left open

      // Walk the shore band of THIS lake (cells within two tiles of its water).
      const shore = new Set();
      for (const c of cells) {
        const cx = c % width;
        const cy = (c - cx) / width;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx2 = cx + dx, ny2 = cy + dy;
            if (!inBounds(nx2, ny2)) continue;
            const j = idxOf(nx2, ny2);
            if (belongs[j] || water[j] || rock[j] || protectedCell[j]) continue;
            shore.add(j);
          }
        }
      }

      for (const j of shore) {
        const jx = j % width;
        const jy = (j - jx) / width;
        let delta = Math.atan2(jy - lakeY, jx - lakeX) - outletAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) < outletHalfWidth) continue; // the way in

        rock[j] = 1;
        level[j] = 1 + Math.floor(rng() * 2);
      }
    }

    // ---- 8. cliff faces ---------------------------------------------------
    // On a top-down map height is only visible as the wall drawn below a rim,
    // so every south-facing rim is extruded downward by its own elevation band:
    // a band-1 foothill shows a one-tile step, a band-5 summit a five-tile
    // precipice. Walking north to south the massif therefore reads as tiers.
    // Bottom-up iteration keeps the newly drawn face out of the rim test.
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const i = idxOf(x, y);
        if (!rock[i] || face[i]) continue;
        if (y + 1 < height && rock[idxOf(x, y + 1)]) continue; // not a rim
        const faceHeight = Math.min(style.extrudeMax, level[i]);
        for (let d = 1; d <= faceHeight; d++) {
          const yy = y + d;
          if (yy >= height) break;
          const j = idxOf(x, yy);
          if (protectedCell[j] || rock[j] || water[j]) break;
          rock[j] = 1;
          level[j] = level[i];
          face[j] = 1;
        }
      }
    }

    // ---- 9. guarantee the square can be crossed ---------------------------
    // Natural drainage usually leaves a way through, but a dense range plus a
    // lake can still box the centre in. Where it does, the cheapest route out
    // is opened - which follows the lowest saddle, so the repair looks like a
    // mountain pass rather than a corridor punched through the rock.
    const openAt = (i) => !rock[i] && !water[i];

    // Walkable ground reachable from the landing clearing. Recomputed after
    // each repair, because one new pass often opens two edges at once.
    const walkableFromCentre = () => {
      const seen = new Uint8Array(N);
      const queue = [idxOf(centreX, centreY)];
      seen[queue[0]] = 1;
      for (let qi = 0; qi < queue.length; qi++) {
        const cur = queue[qi];
        const cx = cur % width;
        const cy = (cur - cx) / width;
        for (let k = 0; k < 4; k++) {
          const nx2 = cx + NB4X[k], ny2 = cy + NB4Y[k];
          if (!inBounds(nx2, ny2)) continue;
          const j = idxOf(nx2, ny2);
          if (seen[j] || !openAt(j)) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      return seen;
    };
    let reachable = walkableFromCentre();

    const carveCheapestPath = (targetIdx) => {
      const dist = new Float64Array(N).fill(Infinity);
      const prev = new Int32Array(N).fill(-1);
      const startIdx = idxOf(centreX, centreY);
      // Small binary heap of [cost, index] pairs.
      const heap = [];
      const push = (cost, i) => {
        heap.push(cost, i);
        let c = heap.length / 2 - 1;
        while (c > 0) {
          const p = (c - 1) >> 1;
          if (heap[p * 2] <= heap[c * 2]) break;
          const tc = heap[c * 2], ti = heap[c * 2 + 1];
          heap[c * 2] = heap[p * 2]; heap[c * 2 + 1] = heap[p * 2 + 1];
          heap[p * 2] = tc; heap[p * 2 + 1] = ti;
          c = p;
        }
      };
      const pop = () => {
        const topCost = heap[0], topIdx = heap[1];
        const lastCost = heap[heap.length - 2], lastIdx = heap[heap.length - 1];
        heap.length -= 2;
        if (heap.length > 0) {
          heap[0] = lastCost; heap[1] = lastIdx;
          let p = 0;
          for (;;) {
            const l = p * 2 + 1, r = p * 2 + 2;
            let m = p;
            if (l * 2 < heap.length && heap[l * 2] < heap[m * 2]) m = l;
            if (r * 2 < heap.length && heap[r * 2] < heap[m * 2]) m = r;
            if (m === p) break;
            const tc = heap[m * 2], ti = heap[m * 2 + 1];
            heap[m * 2] = heap[p * 2]; heap[m * 2 + 1] = heap[p * 2 + 1];
            heap[p * 2] = tc; heap[p * 2 + 1] = ti;
            p = m;
          }
        }
        return [topCost, topIdx];
      };

      dist[startIdx] = 0;
      push(0, startIdx);
      while (heap.length > 0) {
        const [cost, cur] = pop();
        if (cost > dist[cur]) continue;
        if (cur === targetIdx) break;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        for (let k = 0; k < 4; k++) {
          const nx2 = cx + NB4X[k], ny2 = cy + NB4Y[k];
          if (!inBounds(nx2, ny2)) continue;
          const j = idxOf(nx2, ny2);
          // Prefer open ground, then low rock, and only wade through a lake as
          // a last resort.
          const step = water[j] ? 26 : rock[j] ? 4 + level[j] * 2.5 : 1;
          const nd = cost + step;
          if (nd < dist[j]) { dist[j] = nd; prev[j] = cur; push(nd, j); }
        }
      }

      let cur = targetIdx;
      let guard = 0;
      while (cur >= 0 && guard++ < N) {
        const cx = cur % width;
        const cy = (cur - cx) / width;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx2 = cx + dx, ny2 = cy + dy;
            if (!inBounds(nx2, ny2)) continue;
            const j = idxOf(nx2, ny2);
            rock[j] = 0;
            face[j] = 0;
            level[j] = 0;
            water[j] = 0;
            protectedCell[j] = 1;
          }
        }
        if (cur === startIdx) break;
        cur = prev[cur];
      }
    };

    // One list of border cells per edge. The square is crossable when the
    // centre can walk to at least one cell of each; where it cannot, the pass
    // is cut to the lowest cell on that edge (the saddle).
    const edgeCells = [[], [], [], []];
    for (let x = 1; x < width - 1; x++) {
      edgeCells[0].push(idxOf(x, 1));
      edgeCells[1].push(idxOf(x, height - 2));
    }
    for (let y = 1; y < height - 1; y++) {
      edgeCells[2].push(idxOf(1, y));
      edgeCells[3].push(idxOf(width - 2, y));
    }

    for (const cells of edgeCells) {
      if (cells.some((i) => reachable[i])) continue;
      let target = -1, lowest = Infinity;
      for (const i of cells) if (h[i] < lowest) { lowest = h[i]; target = i; }
      if (target < 0) continue;
      carveCheapestPath(target);
      reachable = walkableFromCentre();
    }

    // ---- 9. paint ---------------------------------------------------------
    const mapData = new Array(tileWidth * height * 4);
    mapData.fill(0);
    if (baseTerrainData) {
      const len = Math.min(baseTerrainData.length, mapData.length);
      for (let i = 0; i < len; i++) mapData[i] = baseTerrainData[i];
    }

    const mountainMask = new Array(N).fill(false);
    const clearUpperLayers = (x, y) => {
      for (let layer = 1; layer <= 3; layer++) {
        mapData[calculateIndex(x, y, layer, width, height)] = 0;
      }
    };

    // Three shades of rock, lit from the north-west: a slope whose height rises
    // to the east/south faces the light and takes the bright Center tile, one
    // falling away from it takes the shadow Right tile. Elevation nudges the
    // score up, so summits stay lit and gorge floors stay dark - that gradient
    // is what makes the relief legible from directly above.
    //
    // The two cut points are quantiles of this square's own scores rather than
    // fixed numbers: a gently-sloped foothill square has a far narrower spread
    // of gradients than an alpine one, and against fixed thresholds it would
    // come out a single flat shade.
    const shadeScoreAt = (x, y, i) => {
      const dzdx = h[idxOf(Math.min(width - 1, x + 1), y)] - h[idxOf(Math.max(0, x - 1), y)];
      const dzdy = h[idxOf(x, Math.min(height - 1, y + 1))] - h[idxOf(x, Math.max(0, y - 1))];
      const lit = (dzdx + dzdy) * 4;
      const elevation = (level[i] / Math.max(1, style.bands)) * 0.35;
      const grain = (noise(x * 0.9, y * 0.9) - 0.5) * 0.1;
      return lit + elevation + grain;
    };

    let shadowCut = -0.1;
    let litCut = 0.2;
    if (rockCenter) {
      const scores = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = idxOf(x, y);
          if (rock[i] && !face[i]) scores.push(shadeScoreAt(x, y, i));
        }
      }
      if (scores.length > 8) {
        scores.sort((a, b) => a - b);
        shadowCut = scores[Math.floor(scores.length * 0.36)];
        litCut = scores[Math.floor(scores.length * 0.68)];
      }
    }

    if (rockCenter) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = idxOf(x, y);
          if (!rock[i]) continue;
          let tile;
          if (face[i]) {
            // Cliff face: the ends of each horizontal run get the darker corner
            // tiles so the wall has edges instead of dissolving into its
            // neighbours.
            const leftFace = x > 0 && face[idxOf(x - 1, y)];
            const rightFace = x < width - 1 && face[idxOf(x + 1, y)];
            if (!leftFace && rightFace) tile = rockLeft;
            else if (leftFace && !rightFace) tile = rockRight;
            else tile = rockCenter;
          } else {
            const score = shadeScoreAt(x, y, i);
            tile = score >= litCut ? rockCenter : score <= shadowCut ? rockRight : rockLeft;
          }
          mapData[calculateIndex(x, y, 0, width, height)] = tile;
          mountainMask[i] = true;
          clearUpperLayers(x, y);
        }
      }
    } else {
      logWarn("generateMountainRangeTerrain: no MountainLeft/Center/Right tiles in tileset, rock not drawn");
    }

    if (waterTile) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = idxOf(x, y);
          if (!water[i]) continue;
          mapData[calculateIndex(x, y, 0, width, height)] = waterTile;
          // A lake is terrain, not scenery: it holds its ground against prefabs
          // and scattered features exactly like the rock does.
          mountainMask[i] = true;
          clearUpperLayers(x, y);
        }
      }
    }

    // Shoreline and scree apron: the ground immediately below a cliff is
    // rubble, and the ground around a tarn is its beach. Both are painted only
    // on open valley floor, so they never eat into rock or water.
    if (shoreTile || apronTile) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = idxOf(x, y);
          if (rock[i] || water[i]) continue;
          let nearWater = false;
          let rockDistance = 99;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx2 = x + dx, ny2 = y + dy;
              if (!inBounds(nx2, ny2)) continue;
              const j = idxOf(nx2, ny2);
              const cheb = Math.max(Math.abs(dx), Math.abs(dy));
              if (water[j] && cheb <= 1) nearWater = true;
              if (rock[j] && cheb < rockDistance) rockDistance = cheb;
            }
          }
          if (nearWater && shoreTile) {
            mapData[calculateIndex(x, y, 0, width, height)] = shoreTile;
          } else if (apronTile && rockDistance <= 2) {
            const chance = rockDistance === 1 ? 0.8 : 0.3;
            if (noise(x * 0.7 + 40.5, y * 0.7 + 12.5) < chance) {
              mapData[calculateIndex(x, y, 0, width, height)] = apronTile;
            }
          }
        }
      }
    }

    mapData.mountainMask = mountainMask;
    mapData.mountainWaterMask = water;
    mapData.mountainElevation = h;
    mapData.mountainLevels = level;
    mapData.mountainStyle = style.id;

    log(
      `Mountain relief: ${biomeName} at ${(worldCoords && worldCoords.x) || 0},${(worldCoords && worldCoords.y) || 0} ` +
      `-> ${style.label} (${style.family})`
    );

    return mapData;
  }

  // ===== BSP DUNGEON GENERATOR =====

  /**
   * Binary Space Partition dungeon generator
   * Creates structured dungeons with rooms and corridors
   * Returns a 2D grid where true = carving (floor/corridor), false = wall
   */
  function generateDungeonBSP(width, height, seed, minRoomSize = 8, maxRoomSize = 16) {
    const rng = createSeededRandom(seed);
    const carved = Array(height).fill(null).map(() => Array(width).fill(false));
    const rooms = [];
    // Mouths (first tile outside the room it leaves) of any deliberately
    // 1-tile-wide corridor segment, so callers can gate the start of a narrow
    // passage with a door. { x, y, horizontal }
    const narrowCorridors = [];

    class BSPNode {
      constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.left = null;
        this.right = null;
        this.room = null;
      }
    }

    /**
     * Create a room at this node. Width/height are rolled independently (and
     * occasionally stretched into a long hall) so rooms read as varied
     * rectangles rather than uniform squares.
     */
    function createRoom(node) {
      const minW = Math.max(3, minRoomSize);
      const maxW = Math.min(node.width - 2, maxRoomSize);
      const minH = Math.max(3, minRoomSize);
      const maxH = Math.min(node.height - 2, maxRoomSize);

      let roomWidth = minW + Math.floor(rng() * (maxW - minW + 1));
      let roomHeight = minH + Math.floor(rng() * (maxH - minH + 1));
      if (rng() < 0.25 && maxW > minW && maxH > minH) {
        // Long hall: stretch one axis near its max while the other stays lean.
        if (rng() < 0.5) {
          roomWidth = maxW;
          roomHeight = Math.max(minH, Math.floor(minH + (maxH - minH) * 0.3));
        } else {
          roomHeight = maxH;
          roomWidth = Math.max(minW, Math.floor(minW + (maxW - minW) * 0.3));
        }
      }

      const roomX = node.x + 1 + Math.floor(rng() * Math.max(1, node.width - roomWidth - 2));
      const roomY = node.y + 1 + Math.floor(rng() * Math.max(1, node.height - roomHeight - 2));

      // Rounded look: chamfer the four corners, scaled to room size (0 for
      // small rooms so tiny chambers never lose their doorway tiles).
      const chamfer = Math.min(3, Math.floor(Math.min(roomWidth, roomHeight) / 4));

      node.room = { x: roomX, y: roomY, width: roomWidth, height: roomHeight, chamfer };
      return node.room;
    }

    /**
     * Carve room into the grid. A chamfer > 0 cuts a diagonal wedge off each
     * corner (octagon-style) instead of a plain rectangle.
     */
    function carveRoom(room) {
      const c = room.chamfer || 0;
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
          if (y < 0 || y >= height || x < 0 || x >= width) continue;
          if (c > 0) {
            const lx = x - room.x, ly = y - room.y;
            const rx = (room.width - 1) - lx, ry = (room.height - 1) - ly;
            const cornerCut = (lx + ly < c) || (rx + ly < c) || (lx + ry < c) || (rx + ry < c);
            if (cornerCut) continue;
          }
          carved[y][x] = true;
        }
      }
    }

    /**
     * Carve a corridor between two points with a randomized thickness (mostly
     * 2-3 tiles, occasionally a deliberately narrow 1-tile passage). Narrow
     * segments are recorded so a caller can gate them with a door event.
     */
    function carveCorridor(x1, y1, x2, y2) {
      const roll = rng();
      const thick = roll < 0.15 ? 1 : (roll < 0.65 ? 2 : 3);
      const half = Math.floor((thick - 1) / 2);

      const stampH = (xa, xb, y) => {
        const a = Math.min(xa, xb), b = Math.max(xa, xb);
        for (let x = a; x <= b; x++)
          for (let t = -half; t < thick - half; t++)
            if (y + t >= 0 && y + t < height && x >= 0 && x < width) carved[y + t][x] = true;
      };
      const stampV = (ya, yb, x) => {
        const a = Math.min(ya, yb), b = Math.max(ya, yb);
        for (let y = a; y <= b; y++)
          for (let t = -half; t < thick - half; t++)
            if (y >= 0 && y < height && x + t >= 0 && x + t < width) carved[y][x + t] = true;
      };

      // Random walk horizontally first or vertically first
      if (rng() > 0.5) {
        stampH(x1, x2, y1);
        stampV(y1, y2, x2);
        if (thick === 1) {
          pushMouth(corridorMouth(x1, y1, x2, y1, true));
          pushMouth(corridorMouth(x2, y2, x2, y1, false));
        }
      } else {
        stampV(y1, y2, x1);
        stampH(x1, x2, y2);
        if (thick === 1) {
          pushMouth(corridorMouth(x1, y1, x1, y2, false));
          pushMouth(corridorMouth(x2, y2, x1, y2, true));
        }
      }
    }

    /**
     * Mouth of a corridor segment: walking from a room centre (fx, fy) towards
     * the far end, the first tile that no longer sits inside any room. A door
     * belongs there - at the START of the narrow passage, where it leaves the
     * room - never halfway down the corridor.
     */
    function insideAnyRoom(x, y) {
      return rooms.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
    }

    function corridorMouth(fx, fy, tx, ty, horizontal) {
      const step = horizontal ? Math.sign(tx - fx) : Math.sign(ty - fy);
      if (!step) return null;
      const len = horizontal ? Math.abs(tx - fx) : Math.abs(ty - fy);
      for (let i = 0; i <= len; i++) {
        const x = horizontal ? fx + step * i : fx;
        const y = horizontal ? fy : fy + step * i;
        if (!insideAnyRoom(x, y)) return { x, y, horizontal };
      }
      return null;
    }

    function pushMouth(spot) {
      if (spot) narrowCorridors.push(spot);
    }

    /**
     * Recursively split the dungeon
     */
    function split(node, depth = 0) {
      if (node.width < minRoomSize * 2 || node.height < minRoomSize * 2) {
        createRoom(node);
        carveRoom(node.room);
        rooms.push(node.room);
        return;
      }

      // Choose split direction
      const splitVertical = node.width > node.height || (node.width === node.height && rng() > 0.5);

      if (splitVertical) {
        const splitX = node.x + minRoomSize + Math.floor(rng() * (node.width - minRoomSize * 2));
        node.left = new BSPNode(node.x, node.y, splitX - node.x, node.height);
        node.right = new BSPNode(splitX, node.y, node.x + node.width - splitX, node.height);
      } else {
        const splitY = node.y + minRoomSize + Math.floor(rng() * (node.height - minRoomSize * 2));
        node.left = new BSPNode(node.x, node.y, node.width, splitY - node.y);
        node.right = new BSPNode(node.x, splitY, node.width, node.y + node.height - splitY);
      }

      split(node.left, depth + 1);
      split(node.right, depth + 1);

      // Connect rooms with corridors. Internal children hold no room of their
      // own, so use a representative room propagated up from their subtree;
      // without this whole partitions stay unreachable.
      if (node.left && node.right && node.left.room && node.right.room) {
        const leftRoom = node.left.room;
        const rightRoom = node.right.room;
        const leftCenterX = leftRoom.x + Math.floor(leftRoom.width / 2);
        const leftCenterY = leftRoom.y + Math.floor(leftRoom.height / 2);
        const rightCenterX = rightRoom.x + Math.floor(rightRoom.width / 2);
        const rightCenterY = rightRoom.y + Math.floor(rightRoom.height / 2);

        carveCorridor(leftCenterX, leftCenterY, rightCenterX, rightCenterY);
      }

      // Bubble a room up this node so ancestors can connect through it.
      node.room = node.left.room || node.right.room;
    }

    // Generate the dungeon
    const root = new BSPNode(0, 0, width, height);
    split(root);

    return { carved, rooms, narrowCorridors };
  }

  /**
   * Generate dungeon from BSP layout and map it to tiles
   * Returns mapData array with dungeon layout
   */
  function generateDungeonWithBSP(width, height, mapWidth, seed, minRoomSize, maxRoomSize, dungeonFloorTile, dungeonWallTile) {
    const { carved } = generateDungeonBSP(width, height, seed, minRoomSize, maxRoomSize);

    // Create the map data array (4 layers)
    const mapData = new Array(mapWidth * height * 4);
    mapData.fill(0);

    // Fill the map with wall/floor tiles based on carved areas
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tileValue = carved[ty][tx] ? dungeonFloorTile : dungeonWallTile;
        // Layer 0 (main terrain)
        mapData[calculateIndex(tx, ty, 0, width, height)] = tileValue;
      }
    }

    return mapData;
  }

  // ===== FEATURE MANAGEMENT UTILITIES =====

  /**
   * Get terrain features (terrain: true) from biome
   * Returns array of {name, density} objects
   */
  function getTerrainFeatures(biome) {
    return biome.features
      .filter(f => {
        const isTerrainFeature = typeof f === 'object' && f.terrain === true;
        return isTerrainFeature;
      })
      .map(f => {
        const density = typeof f === 'object' && f.density ? f.density : 1;
        return { name: f.name, density };
      });
  }

  /**
   * Get features by layer efficiently
   * Handles both old (string) and new (object) feature formats for compatibility
   * Returns array of {name, density} objects
   * Excludes terrain features (those with terrain: true)
   * Requires FEATURE_LAYERS to be defined
   */
  function getFeaturesByLayer(biome, allFeatures, layer, featureLayers) {
    return biome.features
      .map(f => {
        // Support both old string format and new object format
        const featureName = typeof f === 'string' ? f : f.name;
        const density = typeof f === 'object' && f.density ? f.density : 1;
        const isTerrainFeature = typeof f === 'object' && f.terrain === true;
        return { name: featureName, density, terrain: isTerrainFeature };
      })
      .filter(f => featureLayers[f.name] === layer && allFeatures[f.name] && !f.terrain);
  }

  /**
   * Create a mapping from tile IDs to feature names
   * Handles both single-tile and multi-tile feature variants
   */
  function createTileToFeatureMap(allFeatures) {
    const tileToFeature = {};
    for (const [featureName, variants] of Object.entries(allFeatures)) {
      if (!Array.isArray(variants)) continue;

      for (const variant of variants) {
        if (variant.type === "single" && variant.tileId) {
          tileToFeature[variant.tileId] = featureName;
        } else if (variant.type === "grid" && variant.grid) {
          // For grid features, map all tiles in the grid
          for (const row of variant.grid) {
            for (const tileId of row) {
              tileToFeature[tileId] = featureName;
            }
          }
        }
      }
    }
    return tileToFeature;
  }

  /**
   * Get feature name from tile ID, including A5 autotile recognition
   */
  function getFeatureNameFromTileId(tileId, tileToFeature) {
    // First check if it's in the feature map
    if (tileToFeature[tileId]) {
      return tileToFeature[tileId];
    }

    // Recognize A5 autotiles by ID range (1536-1663)
    if (tileId >= 1536 && tileId <= 1663) {
      const index = tileId - 1536;
      return `A5 ${index}`;
    }

    // Recognize other extended tiles
    if (tileId >= 2048) {
      const progressiveId = getTileIdToProgressiveId(tileId);
      if (progressiveId >= 0) {
        return `Extended ${progressiveId}`;  // i18n-ignore  tile debug label
      }
    }

    return "Unknown";  // i18n-ignore  tile debug label
  }

  // ===== SPATIAL & MATH UTILITIES =====

  /**
   * Calculate how much a specific adjacent biome should influence a position
   * Uses global Perlin noise based on world coordinates for organic, non-triangular blending
   */
  function calculateDirectionalInfluence(x, y, direction, width, height, seed, blendScale, worldX = 0, worldY = 0) {
    // Calculate distance from edge to determine blend zone. Doing this cheap
    // check first lets us skip the 4-octave fBm entirely when the tile is
    // outside the blend zone. fBm is a pure noise lookup (no RNG stream), so
    // this reorder does not change any seeded sequence.
    let distFromEdge;
    switch (direction) {
      case "north":
        distFromEdge = y;
        break;
      case "south":
        distFromEdge = height - 1 - y;
        break;
      case "east":
        distFromEdge = width - 1 - x;
        break;
      case "west":
        distFromEdge = x;
        break;
      default:
        return 0;
    }

    // Blend zone: only blend in the outer ~45% of the map from this edge
    const blendDepth = Math.floor(width * 0.45);
    if (distFromEdge >= blendDepth) {
      return 0; // Outside blend zone
    }

    // Calculate global coordinates (world tile position + local position within map)
    const globalX = worldX * width + x;
    const globalY = worldY * height + y;

    // Use global fractal (fBm) noise to create organic blend patterns across the
    // entire world. Multiple octaves make borders interlock with fingers/islands
    // instead of a single clean band. Different noise layers per direction avoid
    // correlation between opposite edges.
    const baseSeed = (typeof getWorldSeed === "function" ? getWorldSeed() : (seed || 12345));
    const directionSeed = baseSeed + direction.charCodeAt(0) * 1000;
    const noiseValue = fbmNoise(globalX * blendScale, globalY * blendScale, directionSeed, 4, 2.0, 0.6);

    // Map noise from [-1, 1] to [0, 1]
    const normalizedNoise = Math.max(0, Math.min(1, (noiseValue + 1) / 2));

    // Edge falloff eased with smoothstep so the transition ramps in gently at the
    // inner boundary and out at the very edge, avoiding the hard linear seam the
    // previous straight ramp produced.
    const t = 1 - distFromEdge / blendDepth; // 1 at the edge, 0 at inner boundary
    const edgeFalloff = t * t * (3 - 2 * t);

    // Combine noise with edge falloff for final influence
    // Noise determines IF we blend, edge falloff determines HOW MUCH
    const influence = normalizedNoise * edgeFalloff;

    // Scale to a reasonable blending rate (subtle but visible)
    return influence * 0.4;
  }

  /**
   * Select a terrain feature from adjacent biome using weighted density
   * Returns a tile ID or null
   */
  // Cumulative-weight cache keyed by the terrainFeatures array identity (the
  // per-biome feature list is stable during a generation pass).
  const _weightedFeatureCache = new WeakMap();

  function getWeightedTerrainFeature(terrainFeatures, allFeatures, rng) {
    if (terrainFeatures.length === 0) return null;

    // Precompute cumulative integer weights once per terrainFeatures list
    // instead of materializing a ~1000-element expanded array every call, then
    // pick via a single RNG draw + binary search. This consumes the exact same
    // one RNG draw and resolves to the same feature the expanded-array
    // randomChoice() would for that draw value.
    let entry = _weightedFeatureCache.get(terrainFeatures);
    if (!entry) {
      const totalDensity = terrainFeatures.reduce((sum, f) => sum + f.density, 0);
      const cum = new Array(terrainFeatures.length);
      let acc = 0;
      for (let i = 0; i < terrainFeatures.length; i++) {
        acc += Math.round((terrainFeatures[i].density / totalDensity) * 1000);
        cum[i] = acc;
      }
      entry = { cum, total: acc };
      _weightedFeatureCache.set(terrainFeatures, entry);
    }

    const { cum, total } = entry;
    let selectedFeatureName;
    if (total > 0) {
      // randomChoice(weightedFeatures, rng): index into the length-`total`
      // expanded array (one rng draw), mapped back to its feature.
      const idx = Math.floor(rng() * total);
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] > idx) hi = mid; else lo = mid + 1;
      }
      selectedFeatureName = terrainFeatures[lo].name;
    } else {
      // Empty/degenerate weights: randomChoice([]) returns 0 without an rng draw.
      selectedFeatureName = 0;
    }

    // Get single-tile variants for this feature
    const featureVariants = allFeatures[selectedFeatureName];
    if (!featureVariants || featureVariants.length === 0) return null;

    const singleTileVariants = featureVariants.filter(v => v.type === "single" && v.tileId);
    if (singleTileVariants.length === 0) return null;

    return randomChoice(singleTileVariants, rng).tileId;
  }

  // ===== FORBIDDEN ZONE UTILITIES =====

  /**
   * Check if a tile position is in a forbidden zone (borders or center)
   * Border: 1 tile from edge
   * Center: 6x6 square around map center (29-34, 29-34 on 64x64 map)
   */
  function isInForbiddenZone(x, y, width, height) {
    // Border check (1 tile from edge)
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
      return true;
    }

    // Center 6x6 square check
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    const centerRange = 3; // 6x6 square = 3 tiles in each direction from center

    if (x >= centerX - centerRange && x <= centerX + centerRange &&
      y >= centerY - centerRange && y <= centerY + centerRange) {
      return true;
    }

    return false;
  }

  /**
   * Check if a multi-tile feature would fit entirely in allowed zones
   * Returns true if ANY part of the feature overlaps forbidden zones
   */
  function doesMultiTileFeatureOverlapForbidden(grid, startX, startY, width, height) {
    if (!grid || grid.length === 0) return false;

    const gridHeight = grid.length;
    const gridWidth = grid[0].length;

    // Check all tiles in the feature grid
    for (let dy = 0; dy < gridHeight; dy++) {
      for (let dx = 0; dx < gridWidth; dx++) {
        const checkX = startX + dx;
        const checkY = startY + dy;

        // Check if this feature tile would be in a forbidden zone
        if (isInForbiddenZone(checkX, checkY, width, height)) {
          return true; // Overlaps forbidden zone
        }
      }
    }

    return false; // Safe to place
  }

  /**
   * Remove features from forbidden zones in the map
   */
  function clearForbiddenZoneFeatures(mapData, width, height) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isInForbiddenZone(x, y, width, height)) {
          // Clear all layers except base terrain (layer 0)
          for (let z = 1; z <= 3; z++) {
            const idx = calculateIndex(x, y, z, width, height);
            mapData[idx] = 0;
          }
        }
      }
    }
  }

  // ===== DEBUG & VISUALIZATION UTILITIES =====

  /**
   * Generate ASCII visualization of the map
   * featureAscii is optional; if not provided, uses '?' for all features
   */
  function generateAsciiVisualization(mapData, width, height, tileToFeature, featureAscii) {
    const asciiMap = [];
    const previewWidth = Math.min(width, 128);
    const previewHeight = Math.min(height, 64);
    const ascii = featureAscii || {}; // Default to empty object if not provided

    for (let y = 0; y < previewHeight; y++) {
      let row = "";
      for (let x = 0; x < previewWidth; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        const tileId = mapData[idx];
        const featureName = getFeatureNameFromTileId(tileId, tileToFeature);
        row += ascii[featureName] || "?";
      }
      asciiMap.push(row);
    }

    return asciiMap;
  }

  /**
   * Get arrow character for direction(s)
   */
  function getArrowForDirection(directions) {
    if (!directions || directions.length === 0) return "·";
    if (directions.length === 1) {
      switch (directions[0]) {
        case "north": return "↑";
        case "south": return "↓";
        case "east": return "→";
        case "west": return "←";
      }
    }
    if (directions.length === 2) {
      const dirs = new Set(directions);
      if (dirs.has("north") && dirs.has("east")) return "↗";
      if (dirs.has("north") && dirs.has("west")) return "↖";
      if (dirs.has("south") && dirs.has("east")) return "↘";
      if (dirs.has("south") && dirs.has("west")) return "↙";
      if (dirs.has("north") && dirs.has("south")) return "↕";
      if (dirs.has("east") && dirs.has("west")) return "↔";
    }
    if (directions.length === 3) return "⊕";
    if (directions.length === 4) return "✦";
    return "?";
  }

  /**
   * Build a complete biome coordinate cache for all biomes on world map
   * @param {Object} gameSystem - Reference to $gameSystem
   * @param {Object} gameMap - Reference to $gameMap
   * @param {number} worldMapId - ID of the world map
   * @returns {Object} Cache object mapping biome names to coordinate arrays
   */
  function buildBiomeCoordinateCache(gameSystem, gameMap, worldMapId) {
    if (!gameMap || gameMap.mapId() !== worldMapId) {
      logWarn("buildBiomeCoordinateCache: Not on world map, skipping cache build");
      return {};
    }

    // Try preloading from BiomesMap.json if the option is enabled.
    //
    // Never for a Test player: BiomesMap.json is a snapshot of map 315 taken at
    // export time, and during playtesting the world map is exactly what is being
    // edited. A snapshot that predates a repaint describes a world that no longer
    // exists (biomes, roads and rivers all land on the wrong coordinates), so the
    // tiles are rescanned instead.
    if (PRELOAD_BIOMES_MAP && !isTestPlayer()) {
      const loaded = loadBiomesMapFromFile();
      if (loaded && loaded.biomeCoordinateCache && Object.keys(loaded.biomeCoordinateCache).length > 0) {
        const cache = loaded.biomeCoordinateCache;
        if (gameSystem && gameSystem._procGenData) {
          gameSystem._procGenData.biomeCoordinateCache = cache;
          if (loaded.roadDirections) {
            gameSystem._procGenData.precomputedRoadDirections = loaded.roadDirections;
          }
          if (loaded.riverDirections) {
            gameSystem._procGenData.precomputedRiverDirections = loaded.riverDirections;
          }
          // riverCoords: "x,y" -> water tile id for every coord where a river is
          // painted over a land biome (drawn as an overlay inside that biome).
          gameSystem._procGenData.riverCoordMap = loaded.riverCoords || {};
          // bridgeCoords may be absent in snapshots exported before bridges
          // existed; leaving it undefined makes the generator rescan the tiles
          // rather than silently reporting no crossings.
          if (loaded.bridgeCoords) {
            gameSystem._procGenData.bridgeCoordMap = loaded.bridgeCoords;
          }
          // The terrain under a road / crossing, per square. Absent in older
          // snapshots, in which case road verges are dressed from the live
          // column on entry as before.
          if (loaded.underBiomes) {
            gameSystem._procGenData.underBiomeMap = loaded.underBiomes;
          }
        }
        log(`buildBiomeCoordinateCache: Loaded from BiomesMap.json (${Object.keys(cache).length} biomes)`);
        return cache;
      }
      logWarn("buildBiomeCoordinateCache: Preload failed or empty, falling back to tile scan");
    }

    const cache = {};
    const mapWidth = gameMap.width();
    const mapHeight = gameMap.height();

    // Initialize cache for all known biomes
    for (const biome of Biomes) {
      cache[biome.name] = [];
    }

    // Iterate through all world coordinates
    const riverCoordMap = {};
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const cls = classifyWorldColumn((z) => gameMap.tileId(x, y, z));
        const biomeName = cls.biome;
        if (biomeName) {
          if (!cache[biomeName]) {
            cache[biomeName] = [];
          }
          cache[biomeName].push({ x, y });
        }
        if (cls.riverTileId) riverCoordMap[`${x},${y}`] = cls.riverTileId;
      }
    }

    // Store cache in game system
    if (gameSystem && gameSystem._procGenData) {
      gameSystem._procGenData.biomeCoordinateCache = cache;
      gameSystem._procGenData.riverCoordMap = riverCoordMap;
    }

    const totalCoords = Object.values(cache).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    log(`buildBiomeCoordinateCache: Built cache with ${totalCoords} total coordinates`);

    // Export to BiomesMap.json if the option is enabled
    if (EXPORT_BIOMES_MAP) {
      exportBiomesMapToFile(cache, riverCoordMap);
    }

    return cache;
  }

  /**
   * Get biome from world coordinates by checking tile layers
   * @param {Object} gameMap - Reference to $gameMap
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @returns {string} Biome name
   */
  function getBiomeFromWorldCoordinates(gameMap, x, y) {
    return classifyWorldColumn((z) => gameMap.tileId(x, y, z)).biome;
  }

  /**
   * Get biome from cache with proper fallback to world map lookup
   * @param {Object} cache - The biome coordinate cache
   * @param {number} x - World X coordinate
   * @param {number} y - World Y coordinate
   * @param {Object} gameMap - Reference to $gameMap
   * @param {number} worldMapId - ID of the world map
   * @returns {string} Biome name
   */
  // O(1) biome lookup index, built lazily from the biomeCoordinateCache and
  // rebuilt whenever a different cache object is passed in. Kept in module scope
  // so it is never serialized; mirrors the index in ProceduralMapBiomeGenerator.
  let _biomeFallbackIndex = null; // Map<number, string>
  let _biomeFallbackIndexSource = null;

  function getBiomeFallbackIndex(cache) {
    if (!cache) return null;
    if (_biomeFallbackIndex && _biomeFallbackIndexSource === cache) {
      return _biomeFallbackIndex;
    }
    const index = new Map();
    for (const biomeName in cache) {
      const coords = cache[biomeName];
      if (!coords) continue;
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const key = c.x * 100000 + c.y;
        // First biome wins, matching the previous Object.entries scan order.
        if (!index.has(key)) index.set(key, biomeName);
      }
    }
    _biomeFallbackIndex = index;
    _biomeFallbackIndexSource = cache;
    return index;
  }

  // O(1) coord -> [biomeNames] index (all biomes occupying a coordinate, deduped
  // in cache insertion order). Used by the border/diagonal scans below. Built
  // lazily and rebuilt whenever a different cache object is passed in.
  let _biomeMultiIndex = null; // Map<number, string[]>
  let _biomeMultiIndexSource = null;

  function getBiomeMultiIndex(cache) {
    if (!cache) return null;
    if (_biomeMultiIndex && _biomeMultiIndexSource === cache) {
      return _biomeMultiIndex;
    }
    const index = new Map();
    for (const biomeName in cache) {
      const coords = cache[biomeName];
      if (!coords) continue;
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const key = c.x * 100000 + c.y;
        let arr = index.get(key);
        if (!arr) { arr = []; index.set(key, arr); }
        // Match the previous Object.entries()+includes() dedup semantics.
        if (arr.indexOf(biomeName) === -1) arr.push(biomeName);
      }
    }
    _biomeMultiIndex = index;
    _biomeMultiIndexSource = cache;
    return index;
  }

  function getBiomeFromCacheWithFallback(cache, x, y, gameMap, worldMapId) {
    // First, try to find the coordinate in the cache (O(1) via the index)
    const index = getBiomeFallbackIndex(cache);
    if (index) {
      const biomeName = index.get(x * 100000 + y);
      if (biomeName) return biomeName;
    }

    // If not in cache and we're on the world map, look up from world map directly
    if (gameMap && gameMap.mapId() === worldMapId) {
      return getBiomeFromWorldCoordinates(gameMap, x, y);
    }

    // Final fallback to Fields
    return "Fields";
  }

  // ===== BIOMES MAP FILE I/O =====

  function getBiomesMapFilePath() {
    try {
      const path = require("path");
      return path.join(process.cwd(), "js", "db", "WorldGen", "BiomesMap.json");
    } catch (e) {
      return null;
    }
  }

  function loadBiomesMapFromFile() {
    try {
      const fs = require("fs");
      const filePath = getBiomesMapFilePath();
      if (!filePath) return null;
      if (!fs.existsSync(filePath)) {
        log("loadBiomesMapFromFile: BiomesMap.json not found, falling back to tile scan");
        return null;
      }
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      log(`loadBiomesMapFromFile: Loaded BiomesMap.json v${data.version} (${data.generatedAt})`);
      return data;
    } catch (e) {
      logWarn(`loadBiomesMapFromFile: Failed, ${e.message}`);
      return null;
    }
  }

  // The world map's region plane (one country id per square), run-length
  // encoded so the whole 256x256 grid costs about fifteen kilobytes in the
  // snapshot. Anything that needs the nation standing on a coordinate while the
  // party is somewhere else reads this instead of parsing the 1.3MB Map315.json.
  function buildWorldRegionRLE() {
    if (typeof $dataMap === "undefined" || !$dataMap || !$dataMap.data) return null;
    if (typeof $gameMap === "undefined" || !$gameMap || $gameMap.mapId() !== WORLD_MAP_ID) return null;
    const w = $dataMap.width;
    const h = $dataMap.height;
    const base = 5 * w * h;
    const rle = [];
    let cur = -1;
    let run = 0;
    for (let i = 0; i < w * h; i++) {
      const v = $dataMap.data[base + i] || 0;
      if (v === cur) { run++; continue; }
      if (cur >= 0) rle.push(cur, run);
      cur = v;
      run = 1;
    }
    if (cur >= 0) rle.push(cur, run);
    return { width: w, height: h, rle };
  }

  // Expand a snapshot's region block back into one id per square.
  function expandWorldRegionRLE(regions) {
    if (!regions || !Array.isArray(regions.rle) || !regions.width || !regions.height) return null;
    const layer = new Uint16Array(regions.width * regions.height);
    let i = 0;
    for (let p = 0; p < regions.rle.length; p += 2) {
      const value = regions.rle[p] || 0;
      const count = regions.rle[p + 1] || 0;
      if (value) for (let k = 0; k < count; k++) layer[i + k] = value;
      i += count;
    }
    return { layer, width: regions.width, height: regions.height };
  }

  function exportBiomesMapToFile(cache, riverCoordMap, bridgeCoordMap, underBiomeMap) {
    try {
      const Roads = window.ProcGenRoads;
      const Rivers = window.ProcGenRivers;
      const roadDirections = {};
      const riverDirections = {};

      for (const [biomeName, coords] of Object.entries(cache)) {
        const isRoad = Roads && Roads.isRoadBiome(biomeName);
        const isRiver = Rivers && Rivers.isRiverBiome(biomeName);
        if (!isRoad && !isRiver) continue;

        for (const coord of coords) {
          const adj = getAdjacentBiomesFromCache(coord.x, coord.y, cache);
          const normalized = {
            north: normalizeBiomeForEdge(adj.north),
            south: normalizeBiomeForEdge(adj.south),
            east: normalizeBiomeForEdge(adj.east),
            west: normalizeBiomeForEdge(adj.west),
          };
          if (isRoad) {
            roadDirections[`${coord.x},${coord.y}`] = Roads.determineRoadIntersectionType(normalized, Roads.isRoadBiome);
          }
          if (isRiver) {
            riverDirections[`${coord.x},${coord.y}`] = Rivers.determineRiverIntersectionType(normalized, Rivers.isRiverBiome);
          }
        }
      }

      const exportData = {
        version: 1,
        generatedAt: new Date().toISOString(),
        biomeCoordinateCache: cache,
        roadDirections,
        riverDirections,
        riverCoords: riverCoordMap || {},
        // "x,y" -> "vertical" / "horizontal" for every bridge marker. Without it
        // a preloaded snapshot reports no river crossings at all.
        bridgeCoords: bridgeCoordMap || {},
        // "x,y" -> the terrain a road or a crossing is painted OVER, for the
        // squares that have one. The cache holds a single biome per square, so
        // without this a road square read off the snapshot has no verges to
        // dress and generates differently from the same square entered off the
        // live world map.
        underBiomes: underBiomeMap || {},
        // The country region plane, run-length encoded. See buildWorldRegionRLE.
        regions: buildWorldRegionRLE(),
      };

      const fs = require("fs");
      const filePath = getBiomesMapFilePath();
      if (!filePath) return;
      fs.writeFileSync(filePath, JSON.stringify(exportData), "utf8");
      console.log(`[ProcGen] BiomesMap.json exported to ${filePath}`);
    } catch (e) {
      console.error(`[ProcGen] Failed to export BiomesMap.json: ${e.message}`);
    }
  }

  // ===== WORLD MAP (315) SLIM EVENT INDEX =====
  // Map315.json is ~1.3MB (256x256 = 393k tile entries) but most consumers only
  // need its ~206 events (Teleport - X, CountryName, ...). Parsing the whole file
  // with a synchronous XHR blocks the main thread. We extract a slim
  // [{id, name, x, y}] array once, cache it in module scope, and persist it to
  // js/db/WorldGen/WorldEvents315.json so future sessions skip the big parse.
  let _worldMapEventIndex = null;

  function getWorldEventsFilePath() {
    try {
      const path = require("path");
      return path.join(process.cwd(), "js", "db", "WorldGen", "WorldEvents315.json");
    } catch (e) {
      return null;
    }
  }

  function slimMapEvents(events) {
    const slim = [];
    if (!events) return slim;
    for (const ev of events) {
      if (!ev) continue;
      slim.push({ id: ev.id, name: ev.name || "", x: ev.x, y: ev.y });
    }
    return slim;
  }

  function mapFileName(mapId) {
    let id = String(mapId);
    while (id.length < 3) id = "0" + id;
    return "Map" + id + ".json";  // i18n-ignore  data file name
  }

  // Returns the world map's events as a slim [{id, name, x, y}] array.
  function getWorldMapEvents() {
    if (_worldMapEventIndex) return _worldMapEventIndex;

    // 1. If the world map is the active map, its events are already in memory.
    try {
      if (typeof $dataMap !== "undefined" && $dataMap &&
          $dataMap.id === WORLD_MAP_ID && $dataMap.events) {
        _worldMapEventIndex = slimMapEvents($dataMap.events);
        return _worldMapEventIndex;
      }
    } catch (e) {}

    // 2. Try the cached slim file in the world folder.
    try {
      const fs = require("fs");
      const filePath = getWorldEventsFilePath();
      if (filePath && fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (data && Array.isArray(data.events)) {
          _worldMapEventIndex = data.events;
          return _worldMapEventIndex;
        }
      }
    } catch (e) {}

    // 3. Parse Map315.json exactly once, slim it, cache and persist.
    let mapData = null;
    try {
      const fs = require("fs");
      const path = require("path");
      const mapPath = path.join(process.cwd(), "data", mapFileName(WORLD_MAP_ID));
      if (fs.existsSync(mapPath)) {
        mapData = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      }
    } catch (e) {}

    if (!mapData) {
      // Fallback for environments without fs (plain browser).
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "data/" + mapFileName(WORLD_MAP_ID), false);
        xhr.overrideMimeType("application/json");
        xhr.send();
        if (xhr.status === 200) mapData = JSON.parse(xhr.responseText);
      } catch (e) {}
    }

    if (!mapData || !mapData.events) return [];

    _worldMapEventIndex = slimMapEvents(mapData.events);

    try {
      const fs = require("fs");
      const filePath = getWorldEventsFilePath();
      if (filePath) {
        fs.writeFileSync(filePath, JSON.stringify({
          version: 1,
          generatedAt: new Date().toISOString(),
          events: _worldMapEventIndex,
        }), "utf8");
        log(`getWorldMapEvents: cached ${_worldMapEventIndex.length} events to WorldEvents315.json`);
      }
    } catch (e) {}

    return _worldMapEventIndex;
  }

  // ===== EXPORT UTILITIES TO GLOBAL NAMESPACE =====
  window.ProcGenUtils = {
    Cache,
    getTileIdToProgressiveId,
    getProgressiveIdToTileId,
    getTileIdFromTypeAndIndex,
    getBiomeForWorldTile,
    isRiverWorldTileId,
    isTestPlayer,
    classifyWorldColumn,
    getBridgeDirectionFromWorldTileId,
    getRoadDirectionFromWorldTile,
    getBiomeByName,
    parseTerrainFeatures,
    parseSingleTileString,
    createSeededRandom,
    getWorldSeed,
    normalizeSeed,
    hashCoords,
    procMapSeed,
    normalizeLatitudeBiome,
    resolveSpecialBiome,
    unwrapSpecialBiome,
    randomChoice,
    normalizeBiomeForEdge,
    getNonProceduralDestination,
    noise2D,
    smoothNoise,
    fbmNoise,
    calculateIndex,
    getAdjacentBiomesOnWorldMap,
    getAdjacentBiomesFromCache,
    checkAdjacentMapBiomesFromCache,
    isSeabedBiomeName,
    isUndergroundSideSealed,
    undergroundNeighbourNames,
    undergroundBorderOpenings,
    UNDERGROUND_BORDER_THICKNESS,
    isWaterTileId,
    getRandomFeatureVariant,
    placeMultiTileFeature,
    generateFeatureNoise,
    // The sliced forms of the two feature passes, and the driver every plain
    // pass in the generator is written over: see RESUMABLE GENERATION above.
    generateFeatureNoiseSteps,
    generateFeatureScatteredSteps,
    STEP_ROWS,
    runSteps,
    generateFeatureScattered,
    checkDiagonalMapBiomesFromCache,
    generateCaveWithDrunkenWalk,
    generateCaveWithCellularAutomata,
    generateCaveWithVoronoi,
    smoothCaveCeilingMask,
    applyAutoShadows,
    reconcileCaveWallsAndCeilings,
    cleanupOrphanedWallsAndCeilings,
    generateMountainBiomeTerrain,
    generateMountainRangeTerrain,
    pickMountainStyle,
    MOUNTAIN_STYLES,
    generateDungeonBSP,
    generateDungeonWithBSP,
    getTerrainFeatures,
    getFeaturesByLayer,
    createTileToFeatureMap,
    getFeatureNameFromTileId,
    calculateDirectionalInfluence,
    getWeightedTerrainFeature,
    isInForbiddenZone,
    doesMultiTileFeatureOverlapForbidden,
    clearForbiddenZoneFeatures,
    generateAsciiVisualization,
    getArrowForDirection,
    isTileOccupiedOnLayer,
    log,
    logWarn,
    buildBiomeCoordinateCache,
    getBiomeFromCacheWithFallback,
    getWorldMapEvents,
    loadBiomesMapFromFile,
    exportBiomesMapToFile,
    expandWorldRegionRLE,
    WORLD_MAP_ID,
    WORLD_TILESET_ID,
    PROC_MAP_ID,
    PROC_MAP_WIDTH,
    PROC_MAP_HEIGHT,
    BORDER_DETECTION_RANGE,
    PRELOAD_BIOMES_MAP,
    EXPORT_BIOMES_MAP,
  };
})();
