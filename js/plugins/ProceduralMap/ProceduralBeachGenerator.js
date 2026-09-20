/*:
 * @target MZ
 * @plugindesc Procedural Beach & Water Generation System
 * @author OmniLex
 * @url https://github.com/yourusername/hypernet-explorer
 *
 * @help ProceduralBeachGenerator.js
 *
 * This plugin handles all water and beach-related procedural generation:
 * - Water edge drawing with autotiling
 * - Beach placement along coastlines
 * - Water corners where the sea only touches a square diagonally
 * - Tide system for dynamic water levels
 * - Seashell placement on beaches
 *
 * A coastline is sampled from the WORLD seed in GLOBAL tile coordinates along
 * the world-grid border line it sits on, so two neighbouring squares draw one
 * continuous shore and a map transfer across it never swaps land for sea.
 *
 * Requires: ProceduralMapUtils.js
 *
 * This plugin offers no plugin commands. It used to carry a placeholder `@command none`,
 * which put a command called "none" in the editor's list that did nothing when called.
 */

(() => {
  "use strict";

  // ===== CONSTANTS =====

  /**
   * Water autotile offsets for different edge configurations
   * These offsets are added to the base A1 Water Tile ID (usually 2048+)
   */
  const WATER_OFFSETS = {
    Center: 0,                    // Water surrounded on all sides
    WaterTop_LandBottom: 11,      // Water above, land below (north edge)
    WaterBottom_LandTop: 13,      // Water below, land above (south edge)
    WaterRight_LandLeft: 12,      // Water on right, land on left (east edge)
    WaterLeft_LandRight: 14,      // Water on left, land on right (west edge)
    WaterTL_Corner: 7,            // Water in top-left corner
    WaterTR_Corner: 8,            // Water in top-right corner
    WaterBL_Corner: 9,            // Water in bottom-left corner
    WaterBR_Corner: 10,           // Water in bottom-right corner
  };

  // ===== HELPER FUNCTIONS =====

  /**
   * Check if a biome is water-based
   */
  function isWaterBiome(biomeName) {
    const waterBiomes = ["Ocean", "Beach", "CaveFlooded", "Docks", "Water"];
    return waterBiomes.some((water) =>
      biomeName.toLowerCase().includes(water.toLowerCase())
    );
  }

  // ===== TIDE SYSTEM =====

  /**
   * Get game date and time from Variable 113
   * Format: "01 JAN 2001 12:00"
   */
  function getGameDateFromVariable() {
    const dateStr = (typeof $gameVariables !== 'undefined' && $gameVariables ? $gameVariables.value(113) : null) || '01 JAN 2001 12:00';
    // Format: "01 JAN 2001 12:00"
    const parts = dateStr.split(' ').filter(Boolean);
    if (parts.length < 4) {
      return { day: 1, month: 0, year: 2001, hours: 8, minutes: 0 };
    }

    const day = parseInt(parts[0]) || 1;
    const monthStr = (parts[1] || '').toUpperCase();
    const year = parseInt(parts[2]) || 2001;
    const timeStr = (parts[3] || '12:00').split(':');
    const hours = parseInt(timeStr[0]) || 0;
    const minutes = parseInt(timeStr[1]) || 0;

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let month = months.indexOf(monthStr);
    if (month === -1) {
      const itMonths = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
      month = itMonths.indexOf(monthStr);
    }
    if (month === -1) {
      month = 0;
    }

    return { day, month, year, hours, minutes };
  }

  /**
   * Calculate tide state (0.0 to 1.0, where 0.5 is neutral)
   * Tide cycles every 12.42 hours (lunar-like)
   */
  function calculateTideState() {
    const date = getGameDateFromVariable();
    const totalMinutes = date.hours * 60 + date.minutes;
    const tidePhase = (totalMinutes / (12.42 * 60)) % 1.0;
    // Use sine wave for smooth tide transitions
    // 0 = low tide, 0.5 = high tide, 1 = low tide again
    return (Math.sin(tidePhase * Math.PI * 2) + 1) / 2;
  }

  /**
   * Get tide offset multiplier for water depth
   * High tide (1.0): water advances more (multiply coastlineDepth by 1.3)
   * Low tide (0.0): water recedes more (multiply coastlineDepth by 0.7)
   */
  function getTideMultiplier() {
    const tideState = calculateTideState();
    // Map tide state [0, 1] to multiplier [0.7, 1.3]
    return 0.7 + (tideState * 0.6);
  }

  /**
   * Tide multiplier used for coastline GEOMETRY, quantised to the in-game hour.
   *
   * Two squares that share a shore are generated at different moments, and a
   * tide that moved by a tile in between would leave the shore of one square
   * offset from the shore of its neighbour. Sampling the tide by the hour makes
   * every square built within the same in-game hour agree. The smooth
   * per-minute tide above is kept for everything cosmetic.
   */
  function getCoastlineTideMultiplier() {
    const date = getGameDateFromVariable();
    const tidePhase = ((date.hours * 60) / (12.42 * 60)) % 1.0;
    const tideState = (Math.sin(tidePhase * Math.PI * 2) + 1) / 2;
    return 0.7 + tideState * 0.6;
  }

  /**
   * Get a tide-dependent seed for randomization.
   * Folds the per-map seed (already world seed + world coords via hashCoords)
   * into the tide time so seashells differ across beaches and shift with the
   * tide, instead of reshuffling every hour identically on every beach.
   */
  function getTideDependentSeed(baseSeed) {
    const date = getGameDateFromVariable();
    const tideKey = date.day * 10000 + date.month * 1000 + date.hours;
    return window.ProcGenUtils.hashCoords((baseSeed | 0) >>> 0, tideKey, 0);
  }

  // ===== WATER TILE DETECTION =====

  /**
   * Calculate autotile index based on surrounding water tiles
   * Returns offset 0-15 for water autotile variant selection
   *
   * outsideIsWater(nx, ny) answers for a neighbour OFF this map, where nx/ny
   * may be -1 or width/height. Without it every tile on the four edges reads as
   * having dry land beyond it, and an ocean square - water from edge to edge -
   * came out framed by a one-tile strip of shore autotiles on all four sides,
   * with nothing on the other side of the border to justify it. A caller that
   * knows what its neighbour holds (an alien ocean reads the planet's own
   * field, which runs straight on across the seam) hands the answer in.
   */
  function getWaterAutotileIndex(x, y, mapData, width, height, waterTileSet, outsideIsWater) {
    let pattern = 0;
    const neighbors = [
      { dx: 0, dy: -1 },  // N
      { dx: 1, dy: -1 },  // NE
      { dx: 1, dy: 0 },   // E
      { dx: 1, dy: 1 },   // SE
      { dx: 0, dy: 1 },   // S
      { dx: -1, dy: 1 },  // SW
      { dx: -1, dy: 0 },  // W
      { dx: -1, dy: -1 }  // NW
    ];

    neighbors.forEach((neighbor, index) => {
      const nx = x + neighbor.dx;
      const ny = y + neighbor.dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const idx = window.ProcGenUtils.calculateIndex(nx, ny, 0, width, height);
        if (window.ProcGenUtils.isWaterTileId(mapData[idx], waterTileSet)) {
          pattern |= (1 << index);
        }
      } else if (outsideIsWater && outsideIsWater(nx, ny)) {
        pattern |= (1 << index);
      }
    });

    return mapWaterPatternToAutotileOffset(pattern);
  }

  /**
   * Map 8-directional water pattern to autotile offset (0-15)
   */
  function mapWaterPatternToAutotileOffset(pattern) {
    const hasN = (pattern & 1) !== 0;
    const hasNE = (pattern & 2) !== 0;
    const hasE = (pattern & 4) !== 0;
    const hasSE = (pattern & 8) !== 0;
    const hasS = (pattern & 16) !== 0;
    const hasSW = (pattern & 32) !== 0;
    const hasW = (pattern & 64) !== 0;
    const hasNW = (pattern & 128) !== 0;

    if (hasN && hasE && hasS && hasW) return 0;
    if (hasN && hasE && hasS && !hasW) return 1;
    if (hasN && hasE && hasW && !hasS) return 2;
    if (hasN && hasS && hasW && !hasE) return 3;
    if (hasE && hasS && hasW && !hasN) return 4;
    if (hasN && hasS && !hasE && !hasW) return 5;
    if (hasE && hasW && !hasN && !hasS) return 6;
    if (hasN && hasE && !hasS && !hasW) return 7;
    if (hasE && hasS && !hasN && !hasW) return 8;
    if (hasS && hasW && !hasN && !hasE) return 9;
    if (hasW && hasN && !hasS && !hasE) return 10;
    if (hasN && !hasE && !hasS && !hasW) return 11;
    if (hasE && !hasN && !hasS && !hasW) return 12;
    if (hasS && !hasN && !hasE && !hasW) return 13;
    if (hasW && !hasN && !hasE && !hasS) return 14;
    return 15;
  }

  /**
   * Get water tile with proper autotile variant
   */
  function getWaterTileForAutotiling(waterTiles, autotileIndex) {
    if (!waterTiles || waterTiles.length === 0) return 0;
    return waterTiles[0] + (autotileIndex || 0);
  }

  // ===== COASTLINE GEOMETRY =====
  //
  // A coastline does not belong to a map, it belongs to a WORLD-GRID BORDER
  // LINE. The sea north of world square (X, Y) is the same sea north of
  // (X+1, Y): the two squares each draw part of one continuous shore, so the
  // shape has to be sampled in GLOBAL tile coordinates off the WORLD seed.
  // Sampling it from the per-map seed and the local x/y (what this used to do)
  // gave every square its own unrelated shore, which is how walking east off a
  // beach could drop the player straight into open water on the next map.
  //
  // AXIS_H: shore running east-west, sea to the north or south of the line.
  //         `lineIndex` is the world ROW the line lies on; sampled along global X.
  // AXIS_V: shore running north-south, sea to the east or west of the line.
  //         `lineIndex` is the world COLUMN the line lies on; sampled along global Y.
  //
  // Border line N sits between world square N-1 and world square N, so the
  // north edge of square (X, Y) is line Y and its south edge is line Y+1.
  const AXIS_H = 0;
  const AXIS_V = 1;

  const COAST_MIN_DEPTH = 10;    // shallowest the sea reaches inland, in tiles
  const COAST_DEPTH_RANGE = 15;  // extra depth the noise may add
  const COAST_MAX_DEPTH = 35;    // hard cap on how far inland the sea comes
  const BEACH_WIDTH = 8;         // sand band between the sea and the interior

  // An island is ringed by sea on all four sides; without a cap the two facing
  // shores would meet at high tide and drown the square. Keep this much dry
  // ground (sand included) down the middle.
  const ISLAND_MIN_CORE = 24;

  // Tiles either side of a map seam over which the shore is held flat. The two
  // squares sharing a seam sample the curve at *different* tiles (..., 62, 63 |
  // 0, 1, ...), so a shore that moved between those two would still hand the
  // player land on one side of the transfer and water on the other. Snapping
  // both runs onto the seam coordinate makes the last column of one square and
  // the first column of the next come out identical.
  const SEAM_FLAT = 3;

  const _coastPhaseCache = new Map();

  /**
   * The three noise phases of one border line, derived from the WORLD seed so
   * that every square touching the line reconstructs the same curve.
   */
  function coastPhases(axis, lineIndex) {
    const U = window.ProcGenUtils;
    const worldSeed = U.getWorldSeed();
    const key = `${worldSeed}:${axis}:${lineIndex}`;
    let phases = _coastPhaseCache.get(key);
    if (!phases) {
      const rng = U.createSeededRandom(
        U.hashCoords(worldSeed ^ 0x5c0a57, lineIndex, axis + 1)
      );
      phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
      if (_coastPhaseCache.size > 512) _coastPhaseCache.clear();
      _coastPhaseCache.set(key, phases);
    }
    return phases;
  }

  /**
   * How far inland the sea reaches at one point along a border line, in tiles.
   *
   * @param {number} axis        AXIS_H or AXIS_V
   * @param {number} lineIndex   world row (AXIS_H) or world column (AXIS_V) of the line
   * @param {number} globalCoord global tile coordinate ALONG the line
   *                             (global X for AXIS_H, global Y for AXIS_V)
   * @param {number} tide        multiplier from getCoastlineTideMultiplier()
   * @param {number} [maxDepth]  cap, defaults to COAST_MAX_DEPTH
   */
  function coastlineDepth(axis, lineIndex, globalCoord, tide, maxDepth) {
    const U = window.ProcGenUtils;
    const span = axis === AXIS_H ? U.PROC_MAP_WIDTH : U.PROC_MAP_HEIGHT;

    // Hold the curve flat across the seam: both the trailing tiles of one
    // square and the leading tiles of the next sample the seam coordinate.
    const local = ((globalCoord % span) + span) % span;
    let t = globalCoord;
    if (local < SEAM_FLAT) t = globalCoord - local;
    else if (local >= span - SEAM_FLAT) t = globalCoord + (span - local);

    const phases = coastPhases(axis, lineIndex);
    const coarse = Math.sin(t / 48 + phases[0]) * 0.5 + 0.5;
    const medium = Math.sin(t / 16 + phases[1]) * 0.5 + 0.5;
    const fine = Math.sin(t / 4 + phases[2]) * 0.5 + 0.5;
    const weighted = coarse * 0.6 + medium * 0.25 + fine * 0.15;
    const base = Math.floor(COAST_MIN_DEPTH + weighted * COAST_DEPTH_RANGE);
    const cap = Math.min(COAST_MAX_DEPTH, maxDepth === undefined ? COAST_MAX_DEPTH : maxDepth);
    return Math.max(1, Math.min(cap, Math.floor(base * tide)));
  }

  /**
   * Mark every tile the sea covers on this square.
   *
   * Each side that faces water is filled from its own border line. The corners
   * are the interesting part: when the sea only touches this square DIAGONALLY,
   * two shores drawn by two different neighbours run into this corner and have
   * to be joined up here. Their extents where they hit this square are exactly
   * the depths those neighbours used at the seam, so both transfers line up:
   *
   *   - the sea along the top row must reach as far as the vertical shore the
   *     square above drew down its own side, and
   *   - the sea down the left column must reach as far as the horizontal shore
   *     the square to the left drew along its own top,
   *
   * which the quarter ellipse below interpolates between.
   */
  function buildWaterMask(width, height, wx, wy, edges, diagonals, tide, maxDepth) {
    const mask = new Uint8Array(width * height);

    if (edges.north) {
      for (let x = 0; x < width; x++) {
        const d = coastlineDepth(AXIS_H, wy, wx * width + x, tide, maxDepth);
        for (let y = 0; y < d && y < height; y++) mask[y * width + x] = 1;
      }
    }
    if (edges.south) {
      for (let x = 0; x < width; x++) {
        const d = coastlineDepth(AXIS_H, wy + 1, wx * width + x, tide, maxDepth);
        for (let y = Math.max(0, height - d); y < height; y++) mask[y * width + x] = 1;
      }
    }
    if (edges.west) {
      for (let y = 0; y < height; y++) {
        const d = coastlineDepth(AXIS_V, wx, wy * height + y, tide, maxDepth);
        for (let x = 0; x < d && x < width; x++) mask[y * width + x] = 1;
      }
    }
    if (edges.east) {
      for (let y = 0; y < height; y++) {
        const d = coastlineDepth(AXIS_V, wx + 1, wy * height + y, tide, maxDepth);
        for (let x = Math.max(0, width - d); x < width; x++) mask[y * width + x] = 1;
      }
    }

    // Quarter ellipse from (spanX, 0) to (0, spanY) in the named corner.
    const fillCorner = (fromRight, fromBottom, spanX, spanY) => {
      if (spanX <= 0 || spanY <= 0) return;
      for (let i = 0; i < spanY && i < height; i++) {
        const y = fromBottom ? height - 1 - i : i;
        const ratio = i / spanY;
        const reach = Math.ceil(spanX * Math.sqrt(Math.max(0, 1 - ratio * ratio)));
        for (let j = 0; j < reach && j < width; j++) {
          const x = fromRight ? width - 1 - j : j;
          mask[y * width + x] = 1;
        }
      }
    };

    if (diagonals.topLeft) {
      fillCorner(false, false,
        coastlineDepth(AXIS_V, wx, wy * height, tide, maxDepth),
        coastlineDepth(AXIS_H, wy, wx * width, tide, maxDepth));
    }
    if (diagonals.topRight) {
      fillCorner(true, false,
        coastlineDepth(AXIS_V, wx + 1, wy * height, tide, maxDepth),
        coastlineDepth(AXIS_H, wy, (wx + 1) * width, tide, maxDepth));
    }
    if (diagonals.bottomLeft) {
      fillCorner(false, true,
        coastlineDepth(AXIS_V, wx, (wy + 1) * height, tide, maxDepth),
        coastlineDepth(AXIS_H, wy + 1, wx * width, tide, maxDepth));
    }
    if (diagonals.bottomRight) {
      fillCorner(true, true,
        coastlineDepth(AXIS_V, wx + 1, (wy + 1) * height, tide, maxDepth),
        coastlineDepth(AXIS_H, wy + 1, (wx + 1) * width, tide, maxDepth));
    }

    return mask;
  }

  /**
   * The sand band: every land tile within BEACH_WIDTH of the sea, as a flood
   * fill outwards from the water. Because the water mask matches the
   * neighbouring square tile for tile at the seam, so does the band.
   *
   * On an island the outer ring is left bare: that ring butts straight onto the
   * surrounding Ocean squares, which are solid water, so sand there would read
   * as a beach hanging off the edge of the world.
   */
  function buildBeachMask(water, width, height, isIsland) {
    const beach = new Uint8Array(width * height);
    const seen = Uint8Array.from(water);
    let frontier = [];
    for (let i = 0; i < water.length; i++) if (water[i]) frontier.push(i);
    if (frontier.length === 0) return beach;

    for (let step = 0; step < BEACH_WIDTH && frontier.length > 0; step++) {
      const next = [];
      for (const idx of frontier) {
        const x = idx % width;
        const y = (idx - x) / width;
        const visit = (nx, ny) => {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
          const n = ny * width + nx;
          if (seen[n]) return;
          seen[n] = 1;
          const onBorder = nx === 0 || ny === 0 || nx === width - 1 || ny === height - 1;
          if (!(isIsland && onBorder)) beach[n] = 1;
          next.push(n);
        };
        visit(x - 1, y);
        visit(x + 1, y);
        visit(x, y - 1);
        visit(x, y + 1);
      }
      frontier = next;
    }
    return beach;
  }

  /**
   * Autotile shape key for one water tile, from the land around it.
   *
   * Sand is the shoreline wherever a beach was drawn, so water touching sand
   * stays plain Center: a directional edge tile there draws a second shore line
   * on top of the first.
   */
  function waterShapeKey(x, y, width, height, water, beach) {
    const solid = (nx, ny) => {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
      const n = ny * width + nx;
      return !water[n] && !beach[n];
    };
    const n = solid(x, y - 1);
    const s = solid(x, y + 1);
    const e = solid(x + 1, y);
    const w = solid(x - 1, y);

    if (s && e) return "WaterTL_Corner";
    if (s && w) return "WaterTR_Corner";
    if (n && e) return "WaterBL_Corner";
    if (n && w) return "WaterBR_Corner";
    if (s) return "WaterTop_LandBottom";
    if (n) return "WaterBottom_LandTop";
    if (w) return "WaterRight_LandLeft";
    if (e) return "WaterLeft_LandRight";
    return "Center";
  }

  /**
   * World coordinates of the square being generated, for callers that do not
   * pass them explicitly.
   */
  function currentWorldCoords() {
    try {
      const pg = typeof $gameSystem !== "undefined" && $gameSystem && $gameSystem._procGenData;
      if (pg) return { x: pg.worldX || 0, y: pg.worldY || 0 };
    } catch (e) { /* ignore */ }
    return { x: 0, y: 0 };
  }

  /**
   * Compute the sea and sand masks for one square from which of its sides and
   * diagonals face water. Split out from the drawing so the seam-matching
   * guarantee can be asserted without a tileset (scripts/test_coastline.js).
   *
   * `seaDiagonals` says where the sea is, not where a corner gets drawn: a
   * corner is only drawn when NEITHER neighbouring side is water, because when
   * a side is water its own edge already covers that corner and a second blob
   * on top would push the shore past where the neighbouring square puts it --
   * the exact mismatch this pass exists to avoid.
   */
  function computeCoastMasks(width, height, worldCoords, edges, seaDiagonals, hasBeach) {
    const isIsland = !!(edges.north && edges.south && edges.east && edges.west);
    // An island's two facing shores would meet at high tide without this cap.
    const maxDepth = isIsland
      ? Math.max(1, Math.floor((Math.min(width, height) - ISLAND_MIN_CORE) / 2))
      : COAST_MAX_DEPTH;

    const d = seaDiagonals || {};
    const diagonals = {
      topLeft: !!d.topLeft && !edges.north && !edges.west,
      topRight: !!d.topRight && !edges.north && !edges.east,
      bottomLeft: !!d.bottomLeft && !edges.south && !edges.west,
      bottomRight: !!d.bottomRight && !edges.south && !edges.east,
    };

    const water = buildWaterMask(
      width, height,
      Math.floor(worldCoords.x || 0), Math.floor(worldCoords.y || 0),
      edges, diagonals, getCoastlineTideMultiplier(), maxDepth
    );
    const beach = hasBeach
      ? buildBeachMask(water, width, height, isIsland)
      : new Uint8Array(width * height);

    const touchesSea =
      edges.north || edges.south || edges.east || edges.west ||
      diagonals.topLeft || diagonals.topRight ||
      diagonals.bottomLeft || diagonals.bottomRight;

    return { water, beach, isIsland, touchesSea };
  }

  // ===== COASTLINE DRAWING =====

  /**
   * Draw this square's whole coastline: the sea, the sand band, the seashells
   * on it and the corners where the sea only touches the square diagonally.
   *
   * `options.worldCoords` and `options.diagonalBiomes` are what tie the shore to
   * its neighbours; without world coordinates the shore still draws, but only
   * squares at the same coordinates would agree on it.
   */
  function drawWaterEdges(
    mapData,
    waterTiles,
    adjacentBiomes,
    seed,
    width,
    height,
    rng,
    cacheInfo,
    allFeatures,
    biomeName,
    options
  ) {
    const U = window.ProcGenUtils;
    if (!U) return;

    // Every tile the coastline owns. Blending, feature scattering and prefab
    // placement all read this back so nothing repaints the shore afterwards --
    // a blended grass tile over the border water is another way for two squares
    // to end up disagreeing about where the sea is. Published straight away so
    // a square without a coastline clears the previous square's set instead of
    // inheriting it.
    const coastCoordinates = new Set();
    U.beachCoordinates = coastCoordinates;

    if (!waterTiles || waterTiles.length === 0) return;

    const opts = options || {};
    const worldCoords = opts.worldCoords || currentWorldCoords();

    function edgeHasWater(direction, adjBiomeName) {
      if (adjBiomeName && isWaterBiome(adjBiomeName)) return true;
      const cached = cacheInfo && cacheInfo[direction];
      return !!(cached && cached.length > 0 && cached.some((b) => isWaterBiome(b)));
    }

    const edges = {
      north: edgeHasWater("north", adjacentBiomes && adjacentBiomes.north),
      south: edgeHasWater("south", adjacentBiomes && adjacentBiomes.south),
      east: edgeHasWater("east", adjacentBiomes && adjacentBiomes.east),
      west: edgeHasWater("west", adjacentBiomes && adjacentBiomes.west),
    };

    const diag = opts.diagonalBiomes;
    const diagWater = (list) =>
      !!(list && list.length > 0 && list.some((b) => isWaterBiome(b)));
    const seaDiagonals = {
      topLeft: !!diag && diagWater(diag.topLeft),
      topRight: !!diag && diagWater(diag.topRight),
      bottomLeft: !!diag && diagWater(diag.bottomLeft),
      bottomRight: !!diag && diagWater(diag.bottomRight),
    };

    // The Ocean biome is open sea end to end: its terrain fill already covers
    // the square in water, there is no shore to cut and no sand to lay. It is
    // also left out of coastCoordinates deliberately -- claiming all 4096 tiles
    // as protected coastline would stop the ocean's own islands and reefs from
    // ever being placed.
    if (biomeName === "Ocean") return;

    const beachTiles = [];
    const seashellTiles = [];
    if (allFeatures && allFeatures["Beach"]) {
      for (const variant of allFeatures["Beach"]) {
        if (variant.type === "single") beachTiles.push(variant.tileId);
      }
    }
    if (allFeatures && allFeatures["Seashell"]) {
      for (const variant of allFeatures["Seashell"]) {
        if (variant.type === "single") seashellTiles.push(variant.tileId);
      }
    }

    const { water, beach, touchesSea } = computeCoastMasks(
      width, height, worldCoords, edges, seaDiagonals, beachTiles.length > 0
    );
    if (!touchesSea) return;

    // Only the "Water" feature's A1 tiles carry directional autotile variants.
    const waterFeatureIds = new Set();
    if (allFeatures && allFeatures["Water"]) {
      allFeatures["Water"].forEach((v) => {
        if (v.type === "single") waterFeatureIds.add(v.tileId);
      });
    }
    function getWaterTile(baseTileId, shapeKey) {
      if (
        waterFeatureIds.has(baseTileId) &&
        baseTileId >= 2048 &&
        WATER_OFFSETS[shapeKey] !== undefined
      ) {
        return baseTileId + WATER_OFFSETS[shapeKey];
      }
      return baseTileId;
    }

    const tideDependentRng = U.createSeededRandom(getTideDependentSeed(seed));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = y * width + x;
        const idx = U.calculateIndex(x, y, 0, width, height);

        if (water[cell]) {
          const baseTile = U.randomChoice(waterTiles, rng);
          mapData[idx] = getWaterTile(
            baseTile,
            waterShapeKey(x, y, width, height, water, beach)
          );
          coastCoordinates.add(`${x},${y}`);
        } else if (beach[cell]) {
          mapData[idx] = U.randomChoice(beachTiles, rng);
          coastCoordinates.add(`${x},${y}`);

          if (seashellTiles.length > 0 && tideDependentRng() < 0.05) {
            const layer2Idx = U.calculateIndex(x, y, 1, width, height);
            mapData[layer2Idx] = U.randomChoice(seashellTiles, tideDependentRng);
          }
        }
      }
    }
  }

  // ===== SEABED GENERATION =====

  /**
   * Generate Seabed biome terrain using mountain generation but keeping water tiles
   * Creates underwater cliffs with Ceiling and MountainWall
   * Similar to generateMountainBiomeTerrain but doesn't replace floor with terrain
   *
   * NOTE: nothing reaches this today. generateBiomeBody routes on the name
   * "Seabed" while the biome is called "SeaBed", and tileset 302 declares no
   * Water feature for the fill either way, so the sea floor is built by the
   * generic terrain path and walled off from the caves beside it there (see
   * sealSeabedUndergroundBorders in ProceduralMapBiomeGenerator).
   */
  function generateSeabedBiomeTerrain(
    biome,
    seed,
    allFeatures,
    adjacentBiomes,
    cacheInfo,
    worldCoords,
    cache
  ) {
    if (!window.ProcGenUtils) {
      console.error("ProceduralBeachGenerator requires ProceduralMapUtils");
      return null;
    }

    const {
      calculateIndex,
      createSeededRandom,
      PROC_MAP_WIDTH,
      PROC_MAP_HEIGHT,
      getBiomeByName,
    } = window.ProcGenUtils;

    const width = PROC_MAP_WIDTH;
    const height = PROC_MAP_HEIGHT;

    // Get Ceiling and MountainWall tiles from features
    const mountainCeilingTiles = allFeatures["Ceiling"] || [];
    const mountainWallTiles = allFeatures["MountainWall"] || [];

    const mountainCeilingTile = mountainCeilingTiles.length > 0 ?
      (mountainCeilingTiles[0].type === "single" ? mountainCeilingTiles[0].tileId : mountainCeilingTiles[0].tiles[0][0]) :
      0;
    const mountainWallTile = mountainWallTiles.length > 0 ?
      (mountainWallTiles[0].type === "single" ? mountainWallTiles[0].tileId : mountainWallTiles[0].tiles[0][0]) :
      0;

    // Get water tiles from features
    const waterTiles = allFeatures["Water"] || [];
    const waterTile = waterTiles.length > 0 ?
      (waterTiles[0].type === "single" ? waterTiles[0].tileId : waterTiles[0].tiles[0][0]) :
      0;

    if (!mountainCeilingTile || !mountainWallTile || !waterTile) {
      console.warn("Seabed generation missing required tiles (Ceiling, MountainWall, or Water)");
      return null;
    }

    // Initialize base map with water tiles
    const baseMapData = new Array(width * height * 4).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = calculateIndex(x, y, 0, width, height);
        baseMapData[idx] = waterTile;
      }
    }

    // Use generateMountainBiomeTerrain from Utils to create cliffs
    if (!window.ProcGenUtils.generateMountainBiomeTerrain) {
      console.error("generateMountainBiomeTerrain not found in ProcGenUtils");
      return baseMapData;
    }

    const mapData = window.ProcGenUtils.generateMountainBiomeTerrain(
      width,
      height,
      width,
      seed,
      mountainCeilingTile,
      mountainWallTile,
      baseMapData,
      worldCoords
    );

    // Check if we're underground (has biomeLayerStack)
    const procGenData = $gameSystem?._procGenData;
    const isUnderground = procGenData && procGenData.biomeLayerStack && procGenData.biomeLayerStack.length > 0;

    // Seal borders with MountainWall when bordering non-Seabed underground
    // biomes. This is the other half of the cave rule (see
    // ProcGenUtils.undergroundBorderOpenings): a cave never opens onto the sea
    // floor, and the sea floor never opens onto a cave, so the two squares agree
    // on a wall from both sides. Seabed against seabed is left wide open --
    // there is nothing but water between them.
    if (isUnderground && adjacentBiomes) {
      const {
        isSeabedBiomeName,
        undergroundNeighbourNames,
        UNDERGROUND_BORDER_THICKNESS,
      } = window.ProcGenUtils;
      const borderThickness = UNDERGROUND_BORDER_THICKNESS;

      // The surface neighbours, not the ones a descent synthesized: diving from
      // an Ocean square reports "SeaBed" on all four sides, which would leave
      // the square open to the caves under the coast next to it.
      const neighbours = undergroundNeighbourNames(worldCoords, adjacentBiomes, cache);

      // Seal unless what lies under the neighbour is sea floor too.
      const shouldSealBorder = (direction) => {
        const neighbourName = neighbours[direction];
        if (!neighbourName) return false;
        if (isSeabedBiomeName(neighbourName)) return false;

        const neighbourBiome = getBiomeByName ? getBiomeByName(neighbourName) : null;
        if (!neighbourBiome) return false;

        // Adjacent surface has no underground layer: nothing to connect to.
        if (!neighbourBiome.lowerLayer) return true;

        return !isSeabedBiomeName(neighbourBiome.lowerLayer);
      };

      // Check which borders should be sealed
      const sealNorth = shouldSealBorder("north");
      const sealSouth = shouldSealBorder("south");
      const sealEast = shouldSealBorder("east");
      const sealWest = shouldSealBorder("west");

      // Seal the borders with MountainWall tiles
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let shouldSeal = false;

          // North border
          if (sealNorth && y < borderThickness) {
            shouldSeal = true;
          }
          // South border
          if (sealSouth && y >= height - borderThickness) {
            shouldSeal = true;
          }
          // West border
          if (sealWest && x < borderThickness) {
            shouldSeal = true;
          }
          // East border
          if (sealEast && x >= width - borderThickness) {
            shouldSeal = true;
          }

          if (shouldSeal) {
            const idx = calculateIndex(x, y, 0, width, height);
            mapData[idx] = mountainWallTile;
          }
        }
      }
    }

    return mapData;
  }

  // ===== EXPORTS =====

  if (!window.ProcGenBeach) window.ProcGenBeach = {};
  window.ProcGenBeach = {
    isWaterBiome,
    getWaterAutotileIndex,
    getWaterTileForAutotiling,
    drawWaterEdges,
    coastlineDepth,
    computeCoastMasks,
    AXIS_H,
    AXIS_V,
    BEACH_WIDTH,
    getGameDateFromVariable,
    calculateTideState,
    getTideMultiplier,
    getCoastlineTideMultiplier,
    getTideDependentSeed,
    generateSeabedBiomeTerrain,
  };
})();