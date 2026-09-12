/*:
 * @target MZ
 * @plugindesc Procedural prefab placement system: loads and places prefab maps into procedural biomes. OPTIMIZED VERSION (Conditional Roads).
 * @author Omni-Lex
 *
 * @help
 * Procedural Map Prefabs (Optimized)
 * ==================================
 * Places prefab maps (32x32) into procedurally generated maps.
 *
 * PREFAB SYSTEM
 * =============
 * - Biomes can define a `prefabs` array with map IDs (e.g., [453, 457, 234])
 * - Each biome randomly places 0-4 prefabs during generation
 * - Prefabs are placed at random seeded positions
 * - Uses Summed Area Table (SAT) for O(1) collision detection against roads
 * - Caches loaded maps to prevent disk I/O thrashing
 * - OPTIMIZATION: Only scans for road collisions in "City" or "Road" biomes
 *
 * Requires ProceduralMapBiomeGenerator.js and ProceduralMapUtils.js
 */

(() => {
  "use strict";

  const pluginName = "ProceduralMapPrefabs";

  // Import utilities
  const Utils2 = window.ProcGenUtils;
  if (!Utils2) {
    console.error("ProceduralMapPrefabs requires ProceduralMapUtils plugin");
    return;
  }

  const { createSeededRandom, getWorldSeed, hashCoords, randomChoice, calculateIndex, isWaterTileId } = Utils2;

  // Import beach/water utilities
  const BeachGen = window.ProcGenBeach;
  if (!BeachGen) {
    console.error("ProceduralMapPrefabs requires ProceduralBeachGenerator plugin");
    return;
  }

  const { isWaterBiome } = BeachGen;

  // Get Biomes from ProceduralMapDB
  function getBiomes() {
    if (window.WorldGen && window.WorldGen.Biomes) {
      return window.WorldGen.Biomes;
    }
    return [];
  }

  const PROC_MAP_WIDTH = 64;
  const PROC_MAP_HEIGHT = 64;
  const PROC_MAP_ID = 636; // Procedural map ID
  const GRID_UNIT = 8; // Base grid unit

  // Road biomes draw from a prefab pool that's mostly generic roadside filler
  // plus a couple of much larger gas-station-flavored maps (identified by
  // GasPump tiles, not a hardcoded id list). Left unchecked, a gas station is
  // just as likely to be picked as any other filler prefab, so they show up
  // (and dominate visually, being much bigger) on nearly every road tile.
  const ROAD_GAS_STATION_CHANCE = 0.3; // Chance a road biome gets a gas station at all (capped at 1 per map)
  const ROAD_SIDE_PAIR_CHANCE = 0.35; // Chance a plain linear road gets two prefabs facing each other across it
  const ROAD_SIDE_GAP = 1; // Tile gap kept clear between a roadside prefab and the carriageway
  const OCEAN_ISLAND_CHANCE = 0.35; // Chance an ocean tile has any islands at all (1-3 when it does)

  // ---------------------------------------------------------------------
  // Landmarks
  // ---------------------------------------------------------------------
  // Every biome that has landmarks at all draws them from the same shared pool
  // (js/db/Prefabs/LandmarkPrefabs.json): standing stones, shrines, ruins,
  // monuments. A biome lists that pool as one of its prefab groups in
  // Biomes.json, usually the last one.
  //
  // Flattened into the draw it swamped everything else. There are more
  // landmarks (43) than a village has houses, so villages came out as fields of
  // monuments; and most wilderness biomes (Forest, Meadows, Mountain, Taiga and
  // the rest) list NOTHING BUT the landmark pool, so every one of their 4-14
  // prefabs was a landmark and the player walked from one monument map to the
  // next. A landmark is supposed to be a thing you remember finding.
  //
  // So the rule is the same everywhere and it is a quota, not a weight: a map
  // rolls ONCE for whether it gets a landmark at all, and at most two when it
  // does. A per-draw chance alone was never enough, because a village asks for
  // 14-21 prefabs and retries every duplicate, so even a one-in-five roll
  // handed out a fistful. The draw chance only decides WHERE in the draw order
  // a landmark turns up; the quota decides HOW MANY.
  const LANDMARK_MAP_CHANCE = 0.35;    // Chance a mixed-pool map gets any landmark at all
  const LANDMARK_SECOND_CHANCE = 0.25; // ... and, having one, a second one
  const LANDMARK_DRAW_CHANCE = 0.2;    // Where in the draw order the landmark falls
  const LANDMARK_MAX = 2;
  // Wilderness biomes whose only prefabs ARE landmarks: the quota is the whole
  // prefab budget of the map, so an empty map is the common case for them.
  const WILD_LANDMARK_MAP_CHANCE = 0.45;

  // 0, 1 or 2 landmarks for this map, decided once from the map's own rng.
  function rollLandmarkQuota(rng, landmarkOnlyBiome) {
    const anyChance = landmarkOnlyBiome ? WILD_LANDMARK_MAP_CHANCE : LANDMARK_MAP_CHANCE;
    if (rng() >= anyChance) return 0;
    return rng() < LANDMARK_SECOND_CHANCE ? LANDMARK_MAX : 1;
  }

  // The shared landmark pool, resolved once. js/db is registered on window by
  // DataService, but the biome data alone is enough to find it: the pool is the
  // one prefab group several different biomes list verbatim.
  let landmarkIdCache = null;
  function deriveLandmarkPoolFromBiomes() {
    const counts = new Map();
    for (const biome of getBiomes()) {
      if (!biome || !Array.isArray(biome.prefabs)) continue;
      for (const group of biome.prefabs) {
        if (!Array.isArray(group) || group.length === 0) continue;
        const key = group.join(",");
        const seen = counts.get(key);
        if (seen) seen.count++;
        else counts.set(key, { count: 1, ids: group });
      }
    }
    let best = null;
    for (const entry of counts.values()) {
      if (entry.count < 2) continue;
      if (!best || entry.count > best.count ||
        (entry.count === best.count && entry.ids.length > best.ids.length)) best = entry;
    }
    return best ? best.ids : [];
  }
  function getLandmarkIds() {
    if (landmarkIdCache) return landmarkIdCache;
    const fromDb = window.Prefabs && window.Prefabs.LandmarkPrefabs;
    const ids = (Array.isArray(fromDb) && fromDb.length > 0)
      ? fromDb : deriveLandmarkPoolFromBiomes();
    landmarkIdCache = new Set(ids);
    return landmarkIdCache;
  }

  // One draw of a biome's prefab pool: a landmark only while the quota holds,
  // an ordinary prefab of that biome every other time. Returns null when the
  // quota is spent and the biome has nothing but landmarks to offer, which
  // stops the draw loop.
  function pickPrefabFromPools(rng, plainPool, landmarkPool, landmarksTaken, quota) {
    const canTakeLandmark = landmarkPool && landmarkPool.length > 0 && landmarksTaken < quota;
    const landmarkOnly = !plainPool || plainPool.length === 0;
    if (canTakeLandmark && (landmarkOnly || rng() < LANDMARK_DRAW_CHANCE)) {
      return randomChoice(landmarkPool, rng);
    }
    if (landmarkOnly) return null;
    return randomChoice(plainPool, rng);
  }

  // What the last generated map actually ended up with, in placement order:
  // read by the tile debugger and by the test harness, which is how the village
  // landmark quota above is checked against a real generated map rather than
  // against a copy of the rule.
  let lastPrefabPlacement = null;

  // OPTIMIZATION: In-memory cache for map data to avoid disk reads
  const prefabCache = new Map();

  // OPTIMIZATION: Track which generated-map-data arrays have already had prefabs
  // applied. applyPrefabsToMap mutates the array in place and is deterministic,
  // so re-running it on the same array (e.g. every time the player re-enters
  // map 636 from a house/menu without regenerating) just repeats the full
  // pipeline - loading prefabs and building two 64x64 summed-area tables - for
  // an identical result. A WeakSet keyed on the array identity lets us skip that
  // redundant work. Any of the regeneration sites replaces generatedMapData with
  // a fresh array (not in the set), so prefabs are applied exactly once per
  // fresh map.
  const prefabbedMapData = new WeakSet();

  // The WeakSet only lives as long as the array does, and the array does not
  // survive a save: JSON.stringify drops an array's non-index properties and
  // hands back a brand-new object on load, so the identity is gone while the
  // prefabs baked into the tiles are not. Running the pass again over that array
  // stamps a SECOND set of prefabs on top of the ones already standing. So the
  // mark is also written as a cheap fingerprint of the finished array, kept on
  // _procGenData -- a plain object, which does survive -- and checked before the
  // pass runs. Every regeneration site replaces the array with different tiles,
  // which invalidates the fingerprint for free: no site has to clear anything.
  function mapDataFingerprint(mapData, biomeName, worldCoords) {
    let h = (0x811c9dc5 ^ mapData.length) >>> 0;
    for (let i = 0; i < mapData.length; i += 13) {
      h = Math.imul(h ^ (mapData[i] | 0), 0x01000193);
    }
    const tag = `${biomeName}:${worldCoords.x},${worldCoords.y}`;
    for (let i = 0; i < tag.length; i++) {
      h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193);
    }
    return h >>> 0;
  }

  // City, Burg and Village generation each place their own building prefabs
  // inline (lot-aligned, one per block) as the final step of laying out their
  // streets, and everything they draw afterward (pavement, dressing) already
  // respects those tiles. That inline call bypasses the WeakSet/fingerprint
  // bookkeeping above, which only the DataManager.loadMapData hook normally
  // writes, so without this the hook's own later pass never sees the map as
  // "already prefabbed" and reruns applyPrefabsToMap a second time -- once
  // more per block, on top of the lot-aligned building the generator already
  // placed and the party's own dressing already deferred to. Callers that
  // place prefabs inline must call this right after, so the generator's own
  // placement takes priority over that redundant rerun instead of being
  // half-buried under a second, uncoordinated building.
  function markPrefabbed(mapData) {
    prefabbedMapData.add(mapData);
  }

  // A dungeon-family square is CARVED, and the room rectangles it was carved
  // from are attached to its tile array as a plain property (mapData.rooms, see
  // the enclosed-structure generator). JSON.stringify drops an array's
  // non-index properties, so the array that comes back out of a savegame is the
  // tiles and nothing else.
  //
  // That is the one state the prefab pass must never run in. Without the rooms
  // it places blind, and blind placement on a carved structure means houses
  // scattered over walls and corridors instead of fitted inside rooms -- the
  // surface's own prefabs standing in a dungeon the party saved inside. It is
  // also, necessarily, a square that HAS already been prefabbed: a structure is
  // prefabbed on the load that builds it, long before any save could be made
  // in it. So the missing rooms are read for what they are, proof the square
  // has been through the pass already.
  function carvedRoomsLost(mapData, biomeName) {
    const D = window.ProcGenDungeon;
    if (!D || typeof D.isStructure !== "function" || !D.isStructure(biomeName)) return false;
    return !(mapData.rooms && mapData.rooms.length);
  }

  /**
   * Get biome by name
   */
  function getBiomeByName(biomeName) {
    const Biomes = getBiomes();
    return Biomes.find(b => b.name === biomeName);
  }

  /**
   * Is this the name of an alien surface biome (AlienBiomes.json)?
   */
  function isAlienBiomeName(biomeName) {
    return typeof biomeName === "string" && biomeName.indexOf("Alien") === 0;
  }

  /**
   * Load a map file synchronously (Optimized with Cache)
   */
  function loadPrefabSync(mapId) {
    // Check cache first. The prefab map is only ever read (placePrefab copies
    // tiles OUT of it, never writes back), so we hand back the cached object
    // directly. Deep-cloning it with JSON.parse(JSON.stringify(...)) on every
    // placement was serializing a full 32x32 map (tiles + events) for nothing,
    // and city biomes place up to ~20 prefabs per map load.
    if (prefabCache.has(mapId)) {
      return prefabCache.get(mapId);
    }

    try {
      const xhr = new XMLHttpRequest();
      const mapIdStr = String(mapId).padStart(3, '0');
      const url = `data/prefabs/Map${mapIdStr}.json`;

      xhr.open('GET', url, false); // Synchronous
      xhr.send();

      if (xhr.status === 200 || xhr.status === 0) {
        const mapData = JSON.parse(xhr.responseText);
        // Save to cache
        prefabCache.set(mapId, mapData);
        return mapData;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Async prefetch of every biome's prefab maps at plugin load. Populates the
   * same prefabCache loadPrefabSync reads, so the first time a prefab is placed
   * it hits the warm cache instead of blocking on a synchronous XHR. Purely a
   * cache warm-up: the sync path stays as the cold-cache fallback, and results
   * are identical either way (the files are read-only and RNG-independent).
   */
  function prefetchPrefabMap(mapId) {
    if (prefabCache.has(mapId)) return;
    try {
      const xhr = new XMLHttpRequest();
      const mapIdStr = String(mapId).padStart(3, '0');
      xhr.open('GET', `data/prefabs/Map${mapIdStr}.json`, true); // async
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && !prefabCache.has(mapId)) {
          try { prefabCache.set(mapId, JSON.parse(xhr.responseText)); } catch (e) { /* ignore */ }
        }
      };
      xhr.onerror = () => { /* ignore; sync fallback will retry on demand */ };
      xhr.send();
    } catch (e) { /* ignore */ }
  }

  let _prefetchStarted = false;
  let _prefetchRetries = 0;
  function prefetchAllPrefabs() {
    if (_prefetchStarted) return;
    const biomes = getBiomes();
    if (!biomes || biomes.length === 0) {
      // Biome DB not ready yet; retry a bounded number of times.
      if (_prefetchRetries++ < 20) setTimeout(prefetchAllPrefabs, 1000);
      return;
    }
    _prefetchStarted = true;
    const ids = new Set();
    for (const biome of biomes) {
      // Alien surfaces are skipped by applyPrefabsToMap, so their prefab maps
      // are never read and are not worth pulling off disk.
      if (biome && Array.isArray(biome.prefabs) && !isAlienBiomeName(biome.name)) {
        for (const id of biome.prefabs.flat()) ids.add(id);
      }
    }
    ids.forEach(prefetchPrefabMap);
  }

  /**
   * Builds a Summed Area Table (Integral Image) for O(1) collision checks
   * Returns a 1D Int32Array representing a 2D grid where cell [y][x] 
   * contains the sum of all occupied pixels above and to the left.
   */
  function buildSummedAreaTable(occupiedMapData, width, height) {
    // SAT dimensions are (width + 1) * (height + 1) to handle edge cases easily
    const satWidth = width + 1;
    const satHeight = height + 1;
    const sat = new Int32Array(satWidth * satHeight).fill(0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isOccupied = occupiedMapData[y * width + x] === 1 ? 1 : 0;

        // Formula: SAT[y+1][x+1] = pixel + Left + Top - TopLeft
        const left = sat[(y + 1) * satWidth + x];
        const top = sat[y * satWidth + (x + 1)];
        const topLeft = sat[y * satWidth + x];

        sat[(y + 1) * satWidth + (x + 1)] = isOccupied + left + top - topLeft;
      }
    }
    return sat;
  }

  /**
   * Extract all non-terrain feature tile IDs that should be cleared
   */
  function getNonTerrainFeatureTileIds(biome, allFeatures) {
    if (!biome || !biome.features) return [];

    const terrainFeatureNames = new Set(
      biome.features
        .filter(f => f.terrain === true)
        .map(f => f.name)
    );

    const nonTerrainTileIds = [];

    for (const feature of biome.features) {
      if (terrainFeatureNames.has(feature.name)) continue;

      const featureTiles = allFeatures[feature.name] || [];
      for (const variant of featureTiles) {
        if (variant.type === "single") {
          nonTerrainTileIds.push(variant.tileId);
        } else if (variant.type === "multi") {
          for (const row of variant.tiles) {
            for (const tileId of row) {
              nonTerrainTileIds.push(tileId);
            }
          }
        }
      }
    }
    return nonTerrainTileIds;
  }

  /**
   * Collect the GasPump tile ids defined on a biome's tileset(s) (e.g. the
   * `<GasPump: [C71, C72],[C79, C80]>` entries on the Road tileset note).
   * Data-driven so it tracks whichever tileset features are actually tagged,
   * rather than hardcoding the prefab map ids that happen to use them today.
   */
  function getGasPumpTileIds(biome) {
    const ids = new Set();
    const Cache = window.ProcGenUtils && window.ProcGenUtils.Cache;
    if (!Cache) return ids;
    const tilesetIds = biome.tilesetIds || [biome.tilesetId];
    for (const tilesetId of tilesetIds) {
      try {
        const features = Cache.getTilesetFeatures(tilesetId);
        if (!features) continue;
        // Both feature names denote a roadside pump (they sit on different
        // source sheets of the Road tileset), so both mark a gas station.
        for (const name of ["GasPump", "RefuelStation"]) {
          const variants = features[name];
          if (!Array.isArray(variants)) continue;
          variants.forEach(variant => {
            if (variant.type === "single") {
              ids.add(variant.tileId);
            } else if (variant.type === "grid" && variant.grid) {
              variant.grid.forEach(row => row.forEach(id => ids.add(id)));
            }
          });
        }
      } catch (e) { /* ignore */ }
    }
    return ids;
  }

  /**
   * Whether a loaded prefab map paints any GasPump tile. Memoized on the
   * (cached) prefab map object itself so the scan only runs once per mapId.
   */
  function prefabHasGasPump(prefabMap, gasPumpIds) {
    if (!gasPumpIds || gasPumpIds.size === 0) return false;
    if (prefabMap._hasGasPump !== undefined) return prefabMap._hasGasPump;
    const data = prefabMap.data;
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (gasPumpIds.has(data[i])) { found = true; break; }
    }
    prefabMap._hasGasPump = found;
    return found;
  }

  /**
   * Determine random prefab count based on biome type
   */
  function getPrefabCount(rng, biomeName) {
    const lower = (biomeName || "").toLowerCase();
    if (lower.includes("city")) {
      // The city block plan now splits its widest blocks into two lots, so
      // there are more lots than there used to be prefabs to fill them.
      return 22 + Math.floor(rng() * 7);
    } else if (lower.includes("village")) {
      // One prefab per planned lot, near enough: a village is a grid of blocks
      // now (see planSettlementBlocks) and it has room for every one of these.
      return 14 + Math.floor(rng() * 8);
    } else if (lower.includes("ocean")) {
      // Islands should be rare, not a landmark on every ocean tile: most ocean
      // maps get none at all, and the ones that do only get a small handful.
      if (rng() >= OCEAN_ISLAND_CHANCE) return 0;
      return 1 + Math.floor(rng() * 3); // 1-3
    } else if (lower.includes("cave") || lower.includes("grotto") || lower.includes("underground")) {
      // Cave biomes: 50% less prefabs (1-4 instead of 4-14), leaving plenty of empty natural rooms
      return 1 + Math.floor(rng() * 4);
    } else {
      return 4 + Math.floor(rng() * 11);
    }
  }

  /**
   * Single source of truth for prefab-vs-prefab overlap. Two axis-aligned
   * rectangles collide when they are NOT separated on any axis, where a clear
   * gap of `spacing` tiles is required on every side. Used both by the
   * placement checks and by the final collision-guarantee pass so the two can
   * never disagree.
   */
  function rectsCollide(x, y, w, h, other, spacing) {
    const s = spacing !== undefined ? spacing : 1;
    const separated = (
      x >= other.x + other.width + s ||    // To the right
      x + w + s <= other.x ||              // To the left
      y >= other.y + other.height + s ||   // Below
      y + h + s <= other.y                 // Above
    );
    return !separated;
  }

  /**
   * Final safety net: guarantees NO two placed prefabs overlap, regardless of
   * which placement strategy (village hints / city lots / grid fallback)
   * produced the positions. Every return path in generatePrefabPositions goes
   * through this, so a strategy that ever emits an overlapping candidate (or a
   * future strategy that forgets to consult allPlacedRects) can never leak a
   * collision onto the map - the offending prefab is simply dropped.
   */
  function enforceNoPrefabCollisions(positions, spacing) {
    const accepted = [];
    let dropped = 0;

    for (let p = 0; p < positions.length; p++) {
      const pos = positions[p];
      let collides = false;

      for (let i = 0; i < accepted.length; i++) {
        if (rectsCollide(pos.x, pos.y, pos.width, pos.height, accepted[i], spacing)) {
          collides = true;
          break;
        }
      }

      if (collides) {
        dropped++;
        continue;
      }
      accepted.push(pos);
    }

    if (dropped > 0 && typeof Utils !== "undefined" && Utils.isOptionValid && Utils.isOptionValid("test")) {
      console.warn(`[PrefabGenerator] Dropped ${dropped} prefab(s) to avoid collision`);
    }

    return accepted;
  }

  /**
   * Optimized canPlacePrefabAt using Summed Area Table (SAT)
   * SAT allows us to check a rectangular area for roads in 4 lookups instead of W*H lookups.
   * Also checks for water tile overlap (unless in Ocean biome).
   */
  function canPlacePrefabAt(x, y, prefabWidth, prefabHeight, occupiedAreas, satData, SPACING, waterSatData) {
    // 1. Bounds Check
    if (x < 0 || y < 0 || x + prefabWidth > PROC_MAP_WIDTH || y + prefabHeight > PROC_MAP_HEIGHT) {
      return false;
    }

    // 2. Road Collision Check (O(1) using SAT)
    if (satData) {
      const satWidth = PROC_MAP_WIDTH + 1;
      const x2 = x + prefabWidth;
      const y2 = y + prefabHeight;

      if (x2 >= satWidth || y2 > PROC_MAP_HEIGHT) return false;

      const D = satData[y2 * satWidth + x2];
      const B = satData[y * satWidth + x2];
      const C = satData[y2 * satWidth + x];
      const A = satData[y * satWidth + x];

      if ((D - B - C + A) > 0) return false; // Contains at least 1 road tile
    }

    // 2b. Water Collision Check (O(1) using SAT)
    if (waterSatData) {
      const satWidth = PROC_MAP_WIDTH + 1;
      const x2 = x + prefabWidth;
      const y2 = y + prefabHeight;

      if (x2 >= satWidth || y2 > PROC_MAP_HEIGHT) return false;

      const D = waterSatData[y2 * satWidth + x2];
      const B = waterSatData[y * satWidth + x2];
      const C = waterSatData[y2 * satWidth + x];
      const A = waterSatData[y * satWidth + x];

      if ((D - B - C + A) > 0) return false; // Contains at least 1 water tile
    }

    // 3. Strict Prefab Overlap Check (AABB) - shared with the final guarantee pass
    if (occupiedAreas && occupiedAreas.length > 0) {
      const spacing = SPACING !== undefined ? SPACING : 1;

      for (let i = 0; i < occupiedAreas.length; i++) {
        if (rectsCollide(x, y, prefabWidth, prefabHeight, occupiedAreas[i], spacing)) {
          return false; // Collision detected
        }
      }
    }

    return true;
  }

  /**
   * Generate random positions for prefabs
   * Uses SAT data for road and water checking if available
   */
  function generatePrefabPositions(prefabCount, rng, prefabSizes, biomeName, blockHints, satData, waterSatData, placementHints, roomHints, preplaced) {
    if (prefabCount <= 0 || !prefabSizes || prefabSizes.length === 0) {
      return [];
    }

    const positions = [];
    const isCity = biomeName && biomeName.toLowerCase().includes("city");
    const isVillage = biomeName && biomeName.toLowerCase().includes("village");

    // STRICT SPACING: Ensure at least 1 tile gap between all prefabs
    const SPACING = 1;
    const allPlacedRects = [];

    // Dungeon / Crypt / Sewer: fit prefabs strictly INSIDE room rectangles so a
    // prefab never spills onto the surrounding walls/ceiling. Only prefabs whose
    // footprint is <= the room's floor are eligible, and they are centred in it.
    if (roomHints && roomHints.length > 0) {
      for (let ri = 0; ri < roomHints.length && positions.length < prefabCount; ri++) {
        const room = roomHints[ri];
        const fitting = prefabSizes.filter(p => p.width <= room.width && p.height <= room.height);
        if (fitting.length === 0) continue; // no prefab fits this room -> skip it
        const prefab = fitting[Math.floor(rng() * fitting.length)];
        const cx = room.x + Math.floor((room.width - prefab.width) / 2);
        const cy = room.y + Math.floor((room.height - prefab.height) / 2);
        if (canPlacePrefabAt(cx, cy, prefab.width, prefab.height, allPlacedRects, satData, SPACING, waterSatData)) {
          positions.push({ x: cx, y: cy, width: prefab.width, height: prefab.height, mapId: prefab.mapId });
          allPlacedRects.push({ x: cx, y: cy, width: prefab.width, height: prefab.height });
        }
      }
      return enforceNoPrefabCollisions(positions, SPACING);
    }

    // Village biomes use placement hints from structure generator
    if (isVillage && placementHints && placementHints.length > 0) {
      if (Utils.isOptionValid("test")) console.log(`[PrefabGenerator] Village prefab placement: ${placementHints.length} hints, ${prefabCount} desired prefabs`);
      let skippedDueToOverlap = 0;

      // Village prefabs come in every size from 4x4 up to 32x32. Assigning one
      // per lot by index and dropping it when it did not fit systematically
      // starved the big ones - a lot only ever held the prefab it was handed -
      // and left villages built out of whatever happened to be small enough.
      // Instead every lot takes the LARGEST prefab that still fits it,
      // preferring one not placed yet, so houses claim the room they need and
      // the small stuff fills in around them.
      const byAreaDesc = prefabSizes.slice().sort(
        (a, b) => (b.width * b.height) - (a.width * a.height)
      );
      const usedMapIds = new Set();

      for (let hintIndex = 0; hintIndex < placementHints.length && positions.length < prefabCount; hintIndex++) {
        const hint = placementHints[hintIndex];

        let finalX = null;
        let finalY = null;
        let prefab = null;

        // Pass 0: prefabs not placed on this map yet. Pass 1: allow repeats.
        for (let pass = 0; pass < 2 && finalX === null; pass++) {
          for (let ci = 0; ci < byAreaDesc.length && finalX === null; ci++) {
            const candidate = byAreaDesc[ci];
            if (pass === 0 && usedMapIds.has(candidate.mapId)) continue;
            // The repeat pass fills leftover lots with prefabs already
            // standing, which would copy a landmark around the map and undo
            // the quota. Ordinary prefabs may repeat, landmarks never do.
            if (pass === 1 && candidate.isLandmark && usedMapIds.has(candidate.mapId)) continue;

            // A village hint now carries the LOT it stands in, not just its
            // centre point (the block plan in the structure generator hands
            // over rectangles). A prefab that cannot fit that lot belongs on
            // another one: without this a hint took the biggest prefab there
            // was and spilled it across the street and its neighbours' gardens.
            // Three tiles of tolerance, the same slack the city lots allow.
            if (hint.w && hint.h &&
              (candidate.width > hint.w + 3 || candidate.height > hint.h + 3)) continue;

            // Keep the footprint on the map: lots sit as close as 2 tiles to the
            // edge, and a large prefab centred on one would hang off it.
            const centerX = Math.max(0, Math.min(
              Math.floor(hint.x - candidate.width / 2), PROC_MAP_WIDTH - candidate.width));
            const centerY = Math.max(0, Math.min(
              Math.floor(hint.y - candidate.height / 2), PROC_MAP_HEIGHT - candidate.height));

            if (canPlacePrefabAt(centerX, centerY, candidate.width, candidate.height, allPlacedRects, satData, SPACING, waterSatData)) {
              prefab = candidate;
              finalX = centerX;
              finalY = centerY;
              break;
            }

            // Strategy 2: Wiggle room (Reduced radius to prevent erratic jumps)
            const searchRadius = 3;
            for (let dy = -searchRadius; dy <= searchRadius && finalX === null; dy++) {
              for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                const tryX = centerX + dx;
                const tryY = centerY + dy;

                if (canPlacePrefabAt(tryX, tryY, candidate.width, candidate.height, allPlacedRects, satData, SPACING, waterSatData)) {
                  prefab = candidate;
                  finalX = tryX;
                  finalY = tryY;
                  break;
                }
              }
            }
          }
        }

        if (finalX !== null) {
          usedMapIds.add(prefab.mapId);
          positions.push({
            x: finalX,
            y: finalY,
            width: prefab.width,
            height: prefab.height,
            mapId: prefab.mapId
          });
          allPlacedRects.push({
            x: finalX,
            y: finalY,
            width: prefab.width,
            height: prefab.height
          });
        } else {
          skippedDueToOverlap++;
        }
      }

      if (Utils.isOptionValid("test")) console.log(`[PrefabGenerator] Village prefabs placed: ${positions.length}, skipped overlap: ${skippedDueToOverlap}`);
      return enforceNoPrefabCollisions(positions, SPACING);
    }

    // City biomes use building lot hints from structure generator. The
    // authored building pool spans roughly 10 to 60 tiles a side, so a single
    // prefab picked by lotIndex % prefabSizes.length used to be tried against
    // a lot it often could not possibly fit in (a 40-wide building against a
    // 14-tile lot), leaving that block bare pavement with nothing built on
    // it. Biggest lots are matched first, and every candidate prefab is tried
    // against a lot (largest-fitting first) rather than committing to one.
    if (isCity && blockHints && blockHints.length > 0) {
      const lots = blockHints.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h));
      const byArea = prefabSizes.map((p, idx) => idx)
        .sort((a, b) => (prefabSizes[b].width * prefabSizes[b].height) - (prefabSizes[a].width * prefabSizes[a].height));
      const usedPrefabIdx = new Set();

      for (const lot of lots) {
        if (prefabSizes.length === 0) break;

        // Prefer a prefab not yet used elsewhere on this map, falling back to
        // reusing one once every candidate has already had a turn.
        const fresh = byArea.filter(idx => !usedPrefabIdx.has(idx));
        const order = fresh.length ? fresh : byArea;

        let finalX = null;
        let finalY = null;
        let chosen = null;
        let chosenIdx = -1;

        for (const idx of order) {
          const prefab = prefabSizes[idx];
          // A tolerance of a couple of tiles lets a near-fit still be tried;
          // anything that cannot possibly fit inside the lot isn't worth the
          // placement attempts below.
          if (prefab.width > lot.w + 3 || prefab.height > lot.h + 3) continue;

          // Strategy 1: Center in lot
          const centerX = Math.floor(lot.x + (lot.w - prefab.width) / 2);
          const centerY = Math.floor(lot.y + (lot.h - prefab.height) / 2);

          if (canPlacePrefabAt(centerX, centerY, prefab.width, prefab.height, allPlacedRects, satData, SPACING, waterSatData)) {
            finalX = centerX;
            finalY = centerY;
          } else {
            // Strategy 2: Try corners, but ensure they don't overlap existing placements
            // We strictly validate candidates using canPlacePrefabAt which checks allPlacedRects
            const corners = [
              { x: lot.x, y: lot.y },
              { x: lot.x + lot.w - prefab.width, y: lot.y },
              { x: lot.x, y: lot.y + lot.h - prefab.height },
              { x: lot.x + lot.w - prefab.width, y: lot.y + lot.h - prefab.height }
            ];

            for (const corner of corners) {
              // Constrain to map bounds
              if (corner.x < 0 || corner.y < 0) continue;

              // Constrain corner logic to be relatively close to the lot
              const cx = Math.max(lot.x - 2, Math.min(corner.x, lot.x + lot.w - prefab.width + 2));
              const cy = Math.max(lot.y - 2, Math.min(corner.y, lot.y + lot.h - prefab.height + 2));

              if (canPlacePrefabAt(cx, cy, prefab.width, prefab.height, allPlacedRects, satData, SPACING, waterSatData)) {
                finalX = cx;
                finalY = cy;
                break;
              }
            }
          }

          if (finalX !== null) { chosen = prefab; chosenIdx = idx; break; }
        }

        if (finalX !== null && chosen) {
          positions.push({
            x: finalX,
            y: finalY,
            width: chosen.width,
            height: chosen.height,
            mapId: chosen.mapId
          });
          allPlacedRects.push({
            x: finalX,
            y: finalY,
            width: chosen.width,
            height: chosen.height
          });
          usedPrefabIdx.add(chosenIdx);
        }
      }
      return enforceNoPrefabCollisions(positions, SPACING);
    }

    // Roadside pair (see tryPlaceRoadsidePair): seed the fallback pass with
    // positions already claimed on either side of the road, so the random
    // scatter below neither overlaps them nor wastes its budget re-placing them.
    if (preplaced && preplaced.length > 0) {
      for (const p of preplaced) {
        positions.push(p);
        allPlacedRects.push({ x: p.x, y: p.y, width: p.width, height: p.height });
      }
      prefabCount = Math.max(0, prefabCount - preplaced.length);
    }

    // Fallback grid-based placement for non-city biomes
    const gridWidth = Math.floor(PROC_MAP_WIDTH / GRID_UNIT);
    const gridHeight = Math.floor(PROC_MAP_HEIGHT / GRID_UNIT);
    const sectorOccupied = new Uint8Array(gridWidth * gridHeight);

    // The scatter cycles the pool to fill its budget, so a short pool gets
    // repeated. A landmark is a one-off by definition: skip it once it stands.
    const scatteredLandmarks = new Set();
    for (let i = 0; i < prefabCount; i++) {
      const prefabIndex = i % prefabSizes.length;
      const size = prefabSizes[prefabIndex];
      if (size.isLandmark) {
        if (scatteredLandmarks.has(size.mapId)) continue;
        scatteredLandmarks.add(size.mapId);
      }
      const gridUnitsWide = Math.ceil(size.width / GRID_UNIT);
      const gridUnitsTall = Math.ceil(size.height / GRID_UNIT);

      for (let attempt = 0; attempt < 15; attempt++) {
        if (gridWidth > gridUnitsWide && gridHeight > gridUnitsTall) {
          const gridX = Math.floor(rng() * (gridWidth - gridUnitsWide));
          const gridY = Math.floor(rng() * (gridHeight - gridUnitsTall));

          if (sectorOccupied[gridY * gridWidth + gridX] === 1) continue;

          const tileX = gridX * GRID_UNIT;
          const tileY = gridY * GRID_UNIT;

          // Pass 0 as spacing here if needed, but safer to use SPACING (1)
          if (canPlacePrefabAt(tileX, tileY, size.width, size.height, allPlacedRects, satData, SPACING, waterSatData)) {

            for (let gy = gridY; gy < gridY + gridUnitsTall; gy++) {
              for (let gx = gridX; gx < gridX + gridUnitsWide; gx++) {
                if (gy < gridHeight && gx < gridWidth) {
                  sectorOccupied[gy * gridWidth + gx] = 1;
                }
              }
            }

            positions.push({
              x: tileX,
              y: tileY,
              width: size.width,
              height: size.height,
              mapId: size.mapId
            });

            allPlacedRects.push({
              x: tileX,
              y: tileY,
              width: size.width,
              height: size.height
            });

            break; // Success
          }
        }
      }
    }

    return enforceNoPrefabCollisions(positions, SPACING);
  }

  /**
   * A linear (non-intersection) road's layout leaves an open margin on either
   * side of the two carriageways (see getLinearRoadGeometry). With some
   * probability, place two DIFFERENT prefabs there - one on each side, set
   * back ROAD_SIDE_GAP tiles from the carriageway edge so they never clip the
   * road. Returns [] if the current map isn't a plain linear road, if nothing
   * fits, or if the roll didn't hit.
   */
  function tryPlaceRoadsidePair(rng, prefabsWithSizes, satData, waterSatData) {
    const Roads = window.ProcGenRoads;
    if (!Roads || !Roads.getLinearRoadGeometry) return [];

    const procData = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData;
    const shape = procData && procData.roadLayoutShape;
    let orientation = null;
    if (shape) {
      const s = String(shape).toLowerCase();
      if (!s.includes("cross") && !s.includes("t-") && !s.includes("corner-")) {
        if (s === "vertical" || s === "up") orientation = "vertical";
        else if (s === "horizontal") orientation = "horizontal";
      }
    }
    if (!orientation) return [];

    const geo = Roads.getLinearRoadGeometry(PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
    // Both margins are symmetric by construction (the map is centered), so a
    // single depth budget applies to whichever pair of sides we're using.
    const sideDepth = orientation === "horizontal" ? geo.topRoadY : geo.leftRoadX;

    const candidates = prefabsWithSizes.filter(p => !p.isGasStation &&
      (orientation === "horizontal" ? p.height : p.width) + ROAD_SIDE_GAP <= sideDepth);
    if (candidates.length < 2) return [];

    const first = candidates[Math.floor(rng() * candidates.length)];
    const rest = candidates.filter(p => p.mapId !== first.mapId);
    const second = rest[Math.floor(rng() * rest.length)];

    const SPACING = 1;
    const results = [];

    if (orientation === "horizontal") {
      const nearY = geo.topRoadY - ROAD_SIDE_GAP - first.height;
      const nearX = Math.floor(rng() * Math.max(1, PROC_MAP_WIDTH - first.width));
      if (canPlacePrefabAt(nearX, nearY, first.width, first.height, [], satData, SPACING, waterSatData)) {
        results.push({ x: nearX, y: nearY, width: first.width, height: first.height, mapId: first.mapId });
      }

      const farY = geo.bottomRoadY + geo.roadWidth + ROAD_SIDE_GAP;
      const farX = Math.floor(rng() * Math.max(1, PROC_MAP_WIDTH - second.width));
      if (canPlacePrefabAt(farX, farY, second.width, second.height, results, satData, SPACING, waterSatData)) {
        results.push({ x: farX, y: farY, width: second.width, height: second.height, mapId: second.mapId });
      }
    } else {
      const nearX = geo.leftRoadX - ROAD_SIDE_GAP - first.width;
      const nearY = Math.floor(rng() * Math.max(1, PROC_MAP_HEIGHT - first.height));
      if (canPlacePrefabAt(nearX, nearY, first.width, first.height, [], satData, SPACING, waterSatData)) {
        results.push({ x: nearX, y: nearY, width: first.width, height: first.height, mapId: first.mapId });
      }

      const farX = geo.rightRoadX + geo.roadWidth + ROAD_SIDE_GAP;
      const farY = Math.floor(rng() * Math.max(1, PROC_MAP_HEIGHT - second.height));
      if (canPlacePrefabAt(farX, farY, second.width, second.height, results, satData, SPACING, waterSatData)) {
        results.push({ x: farX, y: farY, width: second.width, height: second.height, mapId: second.mapId });
      }
    }

    return results;
  }

  function rectContainsPoint(rect, x, y) {
    return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  }

  /**
   * Ring search outward from (fromX, fromY) for the nearest tile already
   * carved to `floorTile`, ignoring the prefab's own just-carved buffer
   * (excludeRect) so it doesn't just find itself. Falls back to the map
   * center - always floor, see generateCaveBiomeTerrain's safe spawn area -
   * on the vanishingly unlikely chance nothing turns up.
   */
  function findNearestCaveFloor(mapData, fromX, fromY, floorTile, excludeRect) {
    const maxRadius = Math.max(PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        const onHorizontalEdge = Math.abs(dy) === r;
        for (let dx = -r; dx <= r; dx++) {
          if (!onHorizontalEdge && Math.abs(dx) !== r) continue; // ring only, not filled square
          const x = fromX + dx;
          const y = fromY + dy;
          if (x < 0 || x >= PROC_MAP_WIDTH || y < 0 || y >= PROC_MAP_HEIGHT) continue;
          if (excludeRect && rectContainsPoint(excludeRect, x, y)) continue;
          if (mapData[calculateIndex(x, y, 0, PROC_MAP_WIDTH, PROC_MAP_HEIGHT)] === floorTile) {
            return { x, y };
          }
        }
      }
    }
    return { x: Math.floor(PROC_MAP_WIDTH / 2), y: Math.floor(PROC_MAP_HEIGHT / 2) };
  }

  /**
   * Cave biomes (generateCaveBiomeTerrain) carve organic, unpredictable
   * passages - a prefab positioned by the generic placement pass has no
   * guarantee it landed on open floor, or that it's reachable from the rest
   * of the cave. Force-clear its footprint plus a 1-tile buffer to floor, and
   * cut a short corridor back to the nearest pre-existing floor tile so the
   * prefab is always both open and reachable, never sealed inside solid rock.
   * `obstacleRects` (previously placed prefab footprints this pass) are
   * routed around so the corridor never chews through an earlier building.
   */
  function carveCaveSpaceForPrefab(mapData, position, floorTile, obstacleRects) {
    const bufferRect = {
      x: Math.max(0, position.x - 1),
      y: Math.max(0, position.y - 1),
    };
    const bx1 = Math.min(PROC_MAP_WIDTH, position.x + position.width + 1);
    const by1 = Math.min(PROC_MAP_HEIGHT, position.y + position.height + 1);
    bufferRect.width = bx1 - bufferRect.x;
    bufferRect.height = by1 - bufferRect.y;

    for (let y = bufferRect.y; y < by1; y++) {
      for (let x = bufferRect.x; x < bx1; x++) {
        mapData[calculateIndex(x, y, 0, PROC_MAP_WIDTH, PROC_MAP_HEIGHT)] = floorTile;
        for (let layer = 1; layer <= 3; layer++) {
          mapData[calculateIndex(x, y, layer, PROC_MAP_WIDTH, PROC_MAP_HEIGHT)] = 0;
        }
      }
    }

    const fromX = Math.floor(position.x + position.width / 2);
    const fromY = Math.floor(position.y + position.height / 2);
    const dest = findNearestCaveFloor(mapData, fromX, fromY, floorTile, bufferRect);

    const tunnelRadius = 2; // 5-tile-wide corridor
    let cx = fromX;
    let cy = fromY;
    const dx = Math.abs(dest.x - cx);
    const dy = Math.abs(dest.y - cy);
    const sx = cx < dest.x ? 1 : -1;
    const sy = cy < dest.y ? 1 : -1;
    let err = dx - dy;

    while (true) {
      for (let ty = -tunnelRadius; ty <= tunnelRadius; ty++) {
        for (let tx = -tunnelRadius; tx <= tunnelRadius; tx++) {
          const nx = cx + tx;
          const ny = cy + ty;
          if (nx < 0 || nx >= PROC_MAP_WIDTH || ny < 0 || ny >= PROC_MAP_HEIGHT) continue;
          if (obstacleRects && obstacleRects.some(r => rectContainsPoint(r, nx, ny))) continue;
          mapData[calculateIndex(nx, ny, 0, PROC_MAP_WIDTH, PROC_MAP_HEIGHT)] = floorTile;
        }
      }
      if (cx === dest.x && cy === dest.y) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  /**
   * Re-stamp the cliff overlay on a Mountain-family biome over a prefab's
   * footprint, AFTER placePrefab has painted it. generateMountainBiomeTerrain
   * carves its cliffs before any prefab position is known, so a building
   * simply lands wherever the position generator put it, and this pass
   * restores whatever rock (or bare Ceiling void) the noise pass carved
   * there - the mountain cutting through the building rather than the
   * building displacing the mountain. `cliffData` is the mapData snapshot
   * taken right after mountain terrain generation (before any prefab drew on
   * it); `mountainMask` is generateMountainBiomeTerrain's own by-POSITION
   * record of which cells are mountain. A tile-id check is not reliable here:
   * an undeclared Ceiling feature paints with id 0 (bare void), which would
   * also match every ordinary unpainted cell and re-carve holes nowhere near
   * any actual mountain (most visibly along a map edge, where a prefab's
   * padded footprint runs off the generated area).
   */
  function stampMountainOverPrefab(mapData, position, cliffData, mountainMask) {
    const x0 = Math.max(0, position.x);
    const y0 = Math.max(0, position.y);
    const x1 = Math.min(PROC_MAP_WIDTH, position.x + position.width);
    const y1 = Math.min(PROC_MAP_HEIGHT, position.y + position.height);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!mountainMask[y * PROC_MAP_WIDTH + x]) continue;
        for (let layer = 0; layer <= 3; layer++) {
          const idx = calculateIndex(x, y, layer, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
          mapData[idx] = cliffData[idx];
        }
      }
    }
  }

  // ==========================================================================
  // Player removals (ProceduralTerrainInteractions)
  // ==========================================================================
  // What a prefab paints on the object layers is ordinary scenery: a tree in a
  // prefab orchard is felled with the same axe as the one the biome generator
  // scattered next to it, and it must stay felled. The removals are recorded
  // per world square in the world folder, and Game_Map.setup re-applies them --
  // but the prefab pass runs from DataManager.loadMapData, and loading a
  // savegame while standing on the procedural map reaches that WITHOUT ever
  // calling setup (Scene_Map only transfers when the player is transferring).
  // The felled tree came back on every load. So the pass itself honours the
  // removals: a tile the party took apart on THIS square is stamped bare, which
  // leaves every other copy of the same prefab, on every other square,
  // untouched.
  function removedTilesFor(biomeName, worldCoords) {
    const TI = window.TerrainInteractions;
    if (!TI || typeof TI.removedTilesFor !== "function") return null;
    try {
      return TI.removedTilesFor(biomeName, worldCoords);
    } catch (e) {
      return null;
    }
  }

  // Footprints of the prefabs standing on the square being played, so
  // TerrainInteractions can tell prefab-stamped scenery from generated terrain.
  function footprintKey(biomeName, worldCoords) {
    return `${biomeName}:${worldCoords.x},${worldCoords.y}`;
  }

  const MAX_TRACKED_FOOTPRINTS = 64;

  function recordPrefabFootprints(biomeName, worldCoords, rects) {
    const pg = $gameSystem && $gameSystem._procGenData;
    if (!pg || !rects || !rects.length) return;
    const key = footprintKey(biomeName, worldCoords);
    const prev = pg._prefabFootprints;
    // A square can be stamped twice (the structure generator runs its own pass
    // during generation, the loader another), so keep both sets of footprints.
    let merged = rects;
    if (prev && prev.key === key && Array.isArray(prev.rects)) {
      const seen = new Set();
      merged = prev.rects.concat(rects).filter(r => {
        const id = `${r.x},${r.y},${r.width},${r.height}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    pg._prefabFootprints = { key, rects: merged.slice(0, MAX_TRACKED_FOOTPRINTS) };
  }

  // The footprints of the square currently being stood on, or null when the
  // stored set belongs to another square (or none was ever recorded).
  function getPrefabFootprints() {
    const pg = $gameSystem && $gameSystem._procGenData;
    const fp = pg && pg._prefabFootprints;
    if (!fp || !Array.isArray(fp.rects) || !pg.currentBiome) return null;
    const wx = $gameVariables ? $gameVariables.value(43) : 0;
    const wy = $gameVariables ? $gameVariables.value(44) : 0;
    if (fp.key !== footprintKey(pg.currentBiome, { x: wx, y: wy })) return null;
    return fp.rects;
  }

  /**
   * Place a single prefab map into the procedural map
   */
  // The keep-out region an enclosed structure paints its rock with. Read off
  // the one authority that owns it rather than restated as a literal.
  const NO_GO_REGION = (window.RegionRules && window.RegionRules.NO_GO_REGION) || 7;

  function placePrefab(mapData, prefabMap, position, nonTerrainTileIds, removedTiles) {
    if (!prefabMap || !prefabMap.data) return;

    const prefabData = prefabMap.data;
    const prefabWidth = prefabMap.width;
    const prefabHeight = prefabMap.height;

    if (position.x + prefabWidth > PROC_MAP_WIDTH ||
      position.y + prefabHeight > PROC_MAP_HEIGHT) {
      return;
    }

    const nonTerrainSet = new Set(nonTerrainTileIds);

    // Single pass: process prefab tiles
    for (let py = 0; py < prefabHeight; py++) {
      for (let px = 0; px < prefabWidth; px++) {
        const mapX = position.x + px;
        const mapY = position.y + py;

        let hasPrefabContent = false;
        const prefabTilesAtPosition = [];

        for (let layer = 0; layer < 4; layer++) {
          const srcIdx = calculateIndex(px, py, layer, prefabWidth, prefabHeight);
          if (srcIdx < prefabData.length) {
            const tile = prefabData[srcIdx];
            prefabTilesAtPosition[layer] = tile;
            if (tile !== 0) {
              hasPrefabContent = true;
            }
          }
        }

        // Shadow-pen bits (layer 4): the quarter-tile darkening RPG Maker's
        // core Tilemap._addShadow reads. Read alongside the tile layers but
        // kept out of the hasPrefabContent check above - a prefab cell should
        // never be treated as "occupied" purely because it carries a shadow.
        const shadowSrcIdx = calculateIndex(px, py, 4, prefabWidth, prefabHeight);
        const shadowBits = shadowSrcIdx < prefabData.length ? prefabData[shadowSrcIdx] : 0;

        if (hasPrefabContent) {
          // A tile the party already took apart on this square: the ground the
          // prefab lays down still goes in (no hole in its floor), the scenery
          // it stood on the object layers does not.
          const removedHere = removedTiles && removedTiles.has(`${mapX},${mapY}`);

          // Clear non-terrain features
          for (let layer = 0; layer < 4; layer++) {
            const idx = calculateIndex(mapX, mapY, layer, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
            const tileId = mapData[idx];
            if (nonTerrainSet.has(tileId)) {
              mapData[idx] = 0;
            }
          }

          // Copy prefab tiles
          for (let layer = 0; layer < 4; layer++) {
            const dstIdx = calculateIndex(mapX, mapY, layer, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
            const tile = prefabTilesAtPosition[layer];

            if (dstIdx < mapData.length) {
              if (removedHere && layer > 0) {
                mapData[dstIdx] = 0;
                continue;
              }
              if (layer === 0 && tile === 0) continue;
              mapData[dstIdx] = tile;
            }
          }

          // Copy the prefab's shadow-pen data so placed prefabs keep the
          // shadows their source map was painted with.
          const shadowDstIdx = calculateIndex(mapX, mapY, 4, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
          mapData[shadowDstIdx] = shadowBits;

          // A structure paints its dead mass with the keep-out region (see
          // step 8 of the enclosed-structure generator). A prefab laid over
          // that mass is a set piece the party is meant to walk into, so the
          // mark is lifted from every square it actually builds on and the
          // prefab's own authored passability decides again.
          const regionDstIdx = calculateIndex(mapX, mapY, 5, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
          if (regionDstIdx < mapData.length && mapData[regionDstIdx] === NO_GO_REGION) {
            mapData[regionDstIdx] = 0;
          }
        }
      }
    }
  }

  /**
   * Process a generated map to add prefabs
   */
  // Straight through, on the frame that asks for it.
  function applyPrefabsToMap(mapData, biomeName, worldCoords, allOtherData) {
    const it = applyPrefabsToMapSteps(mapData, biomeName, worldCoords, allOtherData);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  // The same pass, allowed to stop between the two summed-area tables and
  // between one prefab and the next, so the stitched window can build the ground
  // ahead of a walking party without dropping a frame. See RESUMABLE GENERATION
  // in ProceduralMapUtils.js.
  function* applyPrefabsToMapSteps(mapData, biomeName, worldCoords, allOtherData) {
    // Cleared up front: every early return below (alien surface, no pool, no
    // landmark rolled) would otherwise leave the PREVIOUS map's placement
    // standing for the debugger and the test harness to read as this one's.
    lastPrefabPlacement = {
      biomeName,
      worldCoords: { x: worldCoords.x, y: worldCoords.y },
      mapIds: []
    };
    // An alien surface takes no prefabs for the moment: the prefab pool is
    // authored terrestrial architecture, and a GalaxySim landing has nothing
    // for it to stand in. Every alien biome is named "Alien<Type>"
    // (js/db/WorldGen/AlienBiomes.json), which is how GalaxySim.isAlienSurface
    // reads one too.
    if (isAlienBiomeName(biomeName)) {
      return mapData;
    }

    const biome = getBiomeByName(biomeName);

    if (!biome || !biome.prefabs || biome.prefabs.length === 0) {
      return mapData;
    }

    // Flatten the nested prefab arrays into a single array
    const availablePrefabs = biome.prefabs.flat();
    if (availablePrefabs.length === 0) {
      return mapData;
    }

    // Procedurally generated maps only allocate tile layers 0-3; the
    // shadow-pen layer (z=4) that RPG Maker's core Tilemap reads via
    // _readMapData(x, y, 4) doesn't exist in the array yet. Prefabs are real
    // authored maps and carry shadow-pen data painted in the editor, so grow
    // the array to hold it before placePrefab copies it in.
    const shadowLayerEnd = PROC_MAP_WIDTH * PROC_MAP_HEIGHT * 5;
    if (mapData.length < shadowLayerEnd) {
      for (let i = mapData.length; i < shadowLayerEnd; i++) mapData[i] = 0;
    }

    // RNG Setup, mixed with the world seed so prefab selection/layout differs per world
    const coordSeed = hashCoords(getWorldSeed(), worldCoords.x, worldCoords.y);
    const biomeSeed = biomeName.charCodeAt(0) * 73856093 ^
      biomeName.charCodeAt(Math.min(1, biomeName.length - 1)) * 19349663;
    const seed = (coordSeed ^ biomeSeed) >>> 0;
    const rng = createSeededRandom(seed);

    // getPrefabCount returns >= 4 for most biomes, but can return 0 for Ocean
    // (most ocean tiles have no islands at all).
    const prefabCount = getPrefabCount(rng, biomeName);
    if (prefabCount === 0) return mapData;

    const allowReuse = allOtherData?.allowPrefabReuse === true;
    const lowerBiome = biomeName.toLowerCase();
    const isRoadLikeBiome = lowerBiome.includes("road");

    // The pool is split in two, whatever biome this is: the biome's own
    // prefabs, and the shared landmark pool it happens to list (see the
    // landmark quota above). Villages are no longer a special case -- a forest
    // that lists nothing BUT landmarks is the one that needed this most.
    const landmarkIds = getLandmarkIds();
    const landmarkPool = availablePrefabs.filter(id => landmarkIds.has(id));
    const plainPool = availablePrefabs.filter(id => !landmarkIds.has(id));
    // A carved interior (dungeon, crypt, temple) fits its prefabs INSIDE room
    // rectangles, and down there the pool is what furnishes the rooms, not a
    // monument standing in open country. The quota is about the world outside,
    // so carved maps keep filling their rooms as they always did.
    const furnishesRooms = !!(allOtherData?.roomHints && allOtherData.roomHints.length > 0);
    const quotaApplies = landmarkPool.length > 0 && !furnishesRooms;
    const landmarkOnlyBiome = quotaApplies && plainPool.length === 0;
    const landmarkQuota = quotaApplies ? rollLandmarkQuota(rng, landmarkOnlyBiome) : 0;
    // A biome with nothing but landmarks spends its whole prefab budget on the
    // quota: one or two monuments on the maps that have any, an empty map
    // otherwise, instead of the 4-14 getPrefabCount would otherwise ask for.
    if (landmarkOnlyBiome && landmarkQuota === 0) return mapData;
    let landmarksSelected = 0;
    const pickPrefabId = () => {
      if (!quotaApplies) return randomChoice(availablePrefabs, rng);
      return pickPrefabFromPools(rng, plainPool, landmarkPool, landmarksSelected, landmarkQuota);
    };

    // Gas-station prefabs (detected by GasPump tiles, see getGasPumpTileIds)
    // are otherwise picked exactly as often as any other roadside filler,
    // which put one on nearly every road tile. Roll once per map whether a
    // gas station is allowed at all, and never allow more than one.
    const gasPumpIds = isRoadLikeBiome ? getGasPumpTileIds(biome) : null;
    const allowGasStation = !isRoadLikeBiome || rng() < ROAD_GAS_STATION_CHANCE;
    let gasStationPlaced = false;

    // Load unique prefabs (Cached)
    const prefabsWithSizes = [];
    const selectedMapIds = new Set();
    let attempts = 0;
    const maxAttempts = (allowReuse ? 3 : prefabCount) * 20;
    const baseTargetCount = allowReuse ? Math.min(availablePrefabs.length, 6) : prefabCount;
    const targetCount = landmarkOnlyBiome ? Math.min(baseTargetCount, landmarkQuota) : baseTargetCount;

    while (prefabsWithSizes.length < targetCount && attempts < maxAttempts) {
      attempts++;
      const prefabMapId = pickPrefabId();

      if (prefabMapId == null) break; // Quota spent and the biome has only landmarks
      if (selectedMapIds.has(prefabMapId)) continue;

      const prefabMap = loadPrefabSync(prefabMapId);

      if (prefabMap) {
        if (prefabMap.width > 0 && prefabMap.height > 0 &&
          prefabMap.width <= PROC_MAP_WIDTH && prefabMap.height <= PROC_MAP_HEIGHT) {

          const isGasStation = isRoadLikeBiome && prefabHasGasPump(prefabMap, gasPumpIds);
          if (isGasStation && (!allowGasStation || gasStationPlaced)) {
            continue; // Road biomes only get a gas station some of the time, and never more than one
          }
          if (isGasStation) gasStationPlaced = true;

          const isLandmark = landmarkIds.has(prefabMapId);
          if (isLandmark) landmarksSelected++;

          prefabsWithSizes.push({
            mapId: prefabMapId,
            width: prefabMap.width,
            height: prefabMap.height,
            data: prefabMap,
            isGasStation,
            isLandmark
          });
          selectedMapIds.add(prefabMapId);
        }
      }
    }

    if (prefabsWithSizes.length === 0) return mapData;

    // --- CONDITIONAL ROAD DETECTION ---
    // We only scan for roads if the biome is "City" or "Road"
    const shouldCheckRoads = lowerBiome.includes("city") || isRoadLikeBiome;

    let satData = null;

    if (shouldCheckRoads) {
      // Optimization: Use Int8Array for lower memory footprint
      const occupiedMapData = new Int8Array(PROC_MAP_WIDTH * PROC_MAP_HEIGHT);
      const roadTileIds = new Set();

      // Identify tiles (Logic preserved)
      const tilesetIds = biome.tilesetIds || [biome.tilesetId];
      try {
        const Cache = window.ProcGenUtils && window.ProcGenUtils.Cache;
        if (Cache) {
          for (const tilesetId of tilesetIds) {
            try {
              const features = Cache.getTilesetFeatures(tilesetId);
              if (features) {
                for (const [name, featureList] of Object.entries(features)) {
                  const lowerName = name.toLowerCase();
                  if (lowerName.includes("road") || lowerName.includes("dashed")) {
                    if (Array.isArray(featureList)) {
                      featureList.forEach(v => {
                        if (v.type === "single") {
                          roadTileIds.add(v.tileId);
                        } else if (v.type === "multi" && v.tiles) {
                          v.tiles.forEach(row => row.forEach(id => roadTileIds.add(id)));
                        }
                      });
                    }
                  }
                }
              }
            } catch (e) { }
          }
        }
      } catch (e) { }

      // OPTIMIZED ROAD SCANNING LOOP
      const layerSize = PROC_MAP_WIDTH * PROC_MAP_HEIGHT;
      for (let i = 0; i < layerSize; i++) {
        // Check Layer 0, 1, 2, 3 directly
        if (roadTileIds.has(mapData[i]) ||
          roadTileIds.has(mapData[i + layerSize]) ||
          roadTileIds.has(mapData[i + layerSize * 2]) ||
          roadTileIds.has(mapData[i + layerSize * 3])) {
          occupiedMapData[i] = 1;
        }
      }

      // Build the Summed Area Table (SAT)
      satData = buildSummedAreaTable(occupiedMapData, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
    }

    yield;

    // --- CONDITIONAL WATER DETECTION ---
    // We scan for water tiles UNLESS the biome is "Ocean" (where prefabs can overlap water)
    const isOceanBiome = isWaterBiome(biomeName) && lowerBiome.includes("ocean");
    let waterSatData = null;

    if (!isOceanBiome) {
      // Optimization: Use Int8Array for lower memory footprint
      const waterOccupiedMapData = new Int8Array(PROC_MAP_WIDTH * PROC_MAP_HEIGHT);
      const waterTileIds = new Set();

      // Identify water tiles
      const tilesetIds = biome.tilesetIds || [biome.tilesetId];
      try {
        const Cache = window.ProcGenUtils && window.ProcGenUtils.Cache;
        if (Cache) {
          for (const tilesetId of tilesetIds) {
            try {
              const features = Cache.getTilesetFeatures(tilesetId);
              if (features) {
                for (const [name, featureList] of Object.entries(features)) {
                  const lowerName = name.toLowerCase();
                  // Check for water-related features
                  if (lowerName.includes("water") || lowerName.includes("ocean") || lowerName.includes("beach")) {
                    if (Array.isArray(featureList)) {
                      featureList.forEach(v => {
                        if (v.type === "single") {
                          waterTileIds.add(v.tileId);
                        } else if (v.type === "multi" && v.tiles) {
                          v.tiles.forEach(row => row.forEach(id => waterTileIds.add(id)));
                        }
                      });
                    }
                  }
                }
              }
            } catch (e) { }
          }
        }
      } catch (e) { }

      // OPTIMIZED WATER SCANNING LOOP
      const layerSize = PROC_MAP_WIDTH * PROC_MAP_HEIGHT;
      for (let i = 0; i < layerSize; i++) {
        // Check Layer 0, 1, 2, 3 directly
        if (waterTileIds.has(mapData[i]) ||
          waterTileIds.has(mapData[i + layerSize]) ||
          waterTileIds.has(mapData[i + layerSize * 2]) ||
          waterTileIds.has(mapData[i + layerSize * 3])) {
          waterOccupiedMapData[i] = 1;
        }
      }

      // Build the Summed Area Table (SAT) for water
      waterSatData = buildSummedAreaTable(waterOccupiedMapData, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
    }

    yield;

    const blockHints = allOtherData?.blockHints;
    const placementHints = allOtherData?.placementHints;
    const roomHints = allOtherData?.roomHints;

    // On a plain linear road (not an intersection), sometimes place two
    // different prefabs facing each other across the road, set back from the
    // carriageway.
    const roadsidePair = (isRoadLikeBiome && rng() < ROAD_SIDE_PAIR_CHANCE)
      ? tryPlaceRoadsidePair(rng, prefabsWithSizes, satData, waterSatData)
      : [];

    // Generate positions (satData is null if not in City/Road biome, waterSatData is null if in Ocean biome).
    // A landmark-only biome asks for as many lots as its quota allows and no
    // more: the fallback scatter repeats prefabs to fill whatever budget it is
    // given, which is how a forest ended up with a dozen copies of the same
    // standing stones.
    const placementCount = landmarkOnlyBiome ? Math.min(prefabCount, landmarkQuota) : prefabCount;
    const positions = generatePrefabPositions(placementCount, rng, prefabsWithSizes, biomeName, blockHints, satData, waterSatData, placementHints, roomHints, roadsidePair);

    lastPrefabPlacement = {
      biomeName,
      worldCoords: { x: worldCoords.x, y: worldCoords.y },
      mapIds: positions.map(p => p.mapId)
    };

    yield;

    // Build feature lookup for current biome (to find non-terrain features to clear)
    const allFeatures = {};
    let hasFeatures = false;
    const tilesetIds = biome.tilesetIds || [biome.tilesetId];

    try {
      const Cache = window.ProcGenUtils && window.ProcGenUtils.Cache;
      if (Cache) {
        for (const tilesetId of tilesetIds) {
          try {
            const features = Cache.getTilesetFeatures(tilesetId);
            if (features) {
              hasFeatures = true;
              for (const [name, tiles] of Object.entries(features)) {
                if (!allFeatures[name]) {
                  allFeatures[name] = [];
                }
                allFeatures[name] = allFeatures[name].concat(tiles);
              }
            }
          } catch (e) { }
        }
      }
    } catch (e) { }

    const nonTerrainTileIds = hasFeatures ? getNonTerrainFeatureTileIds(biome, allFeatures) : [];

    // Cave biomes carve organic passages that a prefab's position had no
    // guarantee of landing on (see carveCaveSpaceForPrefab).
    const caveFloorTile = mapData.caveFloorTile;
    const isCaveTerrain = caveFloorTile !== undefined && caveFloorTile !== null;
    // Mountain-family biomes (see generateMountainSurfaceTerrainForBiome)
    // attach their by-position mountainMask onto the array; a snapshot of
    // the post-cliff data taken here (before any prefab is placed) lets each
    // prefab's footprint be re-carved with rock (and bare Ceiling void)
    // afterward (see stampMountainOverPrefab), so the mountain cuts through
    // the building instead of the building displacing it.
    const mountainMask = mapData.mountainMask;
    const isMountainTerrain = !!mountainMask;
    const mountainCliffData = isMountainTerrain ? mapData.slice() : null;
    const placedFootprints = [];

    // What the party has already cleared away on this exact world square.
    const removedTiles = removedTilesFor(biomeName, worldCoords);

    // Place each prefab
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      const prefabInfo = prefabsWithSizes.find(p => p.mapId === position.mapId);

      if (prefabInfo && prefabInfo.data) {
        if (isCaveTerrain) {
          carveCaveSpaceForPrefab(mapData, position, caveFloorTile, placedFootprints);
        }
        placePrefab(mapData, prefabInfo.data, position, nonTerrainTileIds, removedTiles);
        if (isMountainTerrain) {
          stampMountainOverPrefab(mapData, position, mountainCliffData, mountainMask);
        }
        placedFootprints.push({ x: position.x, y: position.y, width: position.width, height: position.height });
      }
      yield;
    }

    if (isCaveTerrain && Utils2 && Utils2.reconcileCaveWallsAndCeilings) {
      Utils2.reconcileCaveWallsAndCeilings(
        mapData,
        PROC_MAP_WIDTH,
        PROC_MAP_HEIGHT,
        mapData.caveCeilingTile,
        mapData.caveWallTile,
        caveFloorTile,
        2,
        allFeatures
      );
    }

    recordPrefabFootprints(biomeName, worldCoords, placedFootprints);

    return mapData;
  }

  /**
   * Hook into the map data loading process
   */
  const _DataManager_loadMapData = DataManager.loadMapData;
  DataManager.loadMapData = function (mapId) {
    _DataManager_loadMapData.call(this, mapId);

    if (mapId === PROC_MAP_ID) {
      if ($gameSystem && $gameSystem._procGenData) {
        if ($gameSystem._procGenData.generatedMapData) {
          const biomeName = $gameSystem._procGenData.currentBiome;
          const worldX = $gameVariables.value(43) || 0;
          const worldY = $gameVariables.value(44) || 0;
          const worldCoords = { x: worldX, y: worldY };

          if (biomeName) {
            const pg = $gameSystem._procGenData;
            const mapData = pg.generatedMapData;
            // Feed the structure generator's building-lot / placement hints so
            // city & village prefabs align to lots instead of grid-fallback
            // placement (which ignored roads/buildings).
            // Only run the (expensive) prefab pass once per fresh map array, and
            // never over an array that already carries its prefabs. City, Burg
            // and Village generation places its own lot-aligned prefabs inline
            // and calls markPrefabbed() right after, so prefabbedMapData.has()
            // is already true here for them: their own placement takes priority
            // and this pass must not rerun on top of it (see markPrefabbed).
            const alreadyPrefabbed = prefabbedMapData.has(mapData) ||
              (pg._prefabbedSig != null &&
                pg._prefabbedSig === mapDataFingerprint(mapData, biomeName, worldCoords)) ||
              carvedRoomsLost(mapData, biomeName);
            if (!alreadyPrefabbed) {
              let hints = pg.structureHints || undefined;
              // Dungeon-type maps attach their room rectangles so prefabs are
              // fitted inside rooms instead of grid-scattered over walls.
              if (mapData.rooms && mapData.rooms.length) {
                hints = Object.assign({}, hints, { roomHints: mapData.rooms });
              }
              applyPrefabsToMap(mapData, biomeName, worldCoords, hints);
            }
            // Keep the tracking current whether this pass just did the work or
            // a city/burg/village generation pass already placed its own
            // prefabs inline: either way the array is now finished and must
            // never be prefabbed again, including after a save/reload loses
            // its object identity (which is what the fingerprint below is for).
            prefabbedMapData.add(mapData);
            // Shadows last, over the finished square: the shadow pen keys off
            // the walls, and the prefab pass above is the last thing that can
            // still move one. Authored shadows a prefab brought with it are
            // left alone (see applyAutoShadows).
            if (Utils2 && Utils2.applyAutoShadows) {
              Utils2.applyAutoShadows(mapData, PROC_MAP_WIDTH, PROC_MAP_HEIGHT);
            }
            // Fingerprinted AFTER the shadow pen, never before it: the mark has
            // to describe the array exactly as the savegame will carry it.
            // applyAutoShadows writes the shadow layer, so a mark taken ahead of
            // it was the fingerprint of an array that no longer existed by the
            // time the save was written, and NOTHING that came back out of a
            // savegame ever matched its own mark. Every load re-ran the whole
            // prefab pass over a square that already carried its prefabs.
            pg._prefabbedSig = mapDataFingerprint(mapData, biomeName, worldCoords);
            // A stitched window (WorldMapReturn's ProcStitch) composes this
            // square together with its neighbours and lays THAT on $dataMap, so
            // putting the single square back here would wipe the other eight.
            // Each cell of a window is prefabbed as it is built, so the pass has
            // already run for every square in it either way.
            const stitched = window.ProcStitch && window.ProcStitch.active();
            if ($dataMap && !stitched) {
              $dataMap.data = mapData;
            }
          }
        }
      }
    }
  };

  // Expose functions for debugging
  window.ProceduralMapPrefabs = {
    applyPrefabsToMap,
    applyPrefabsToMapSteps,
    markPrefabbed,
    loadPrefabSync,
    canPlacePrefabAt,
    loadMapDataSync: loadPrefabSync, // Alias for backward compatibility
    getPrefabCount,
    generatePrefabPositions,
    placePrefab,
    buildSummedAreaTable,
    rectsCollide,
    enforceNoPrefabCollisions,
    getPrefabFootprints,
    getGasPumpTileIds,
    prefabHasGasPump,
    tryPlaceRoadsidePair,
    rollLandmarkQuota,
    pickPrefabFromPools,
    getLandmarkIds,
    getLastPrefabPlacement: () => lastPrefabPlacement,
    LANDMARK_MAX,
    LANDMARK_MAP_CHANCE,
    WILD_LANDMARK_MAP_CHANCE,
    carveCaveSpaceForPrefab,
    findNearestCaveFloor,
  };

  // Fire-and-forget cache warm-up (deferred so it never blocks plugin load).
  setTimeout(prefetchAllPrefabs, 0);
})();